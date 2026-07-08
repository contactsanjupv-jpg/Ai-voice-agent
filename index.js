require('dotenv').config();
const express = require('express');
const twilio = require('twilio');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { createClient } = require('@supabase/supabase-js');

const app = express();
app.use(express.urlencoded({ extended: false }));

const twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY);

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const fallbackModel = genAI.getGenerativeModel({ model: 'gemini-2.5-flash-lite' });

const OpenAI = require('openai');
const groq = new OpenAI({
  apiKey: process.env.GROQ_API_KEY,
  baseURL: 'https://api.groq.com/openai/v1',
});
const deepseek = new OpenAI({
  apiKey: process.env.DEEPSEEK_API_KEY,
  baseURL: 'https://api.deepseek.com',
});

async function generateWithFallback(history) {
  try {
    const completion = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages: [{ role: 'user', content: history }],
    });
    return completion.choices[0].message.content.trim();
  } catch (err) {
    console.log('Groq failed:', err.message);
  }

  console.log('Trying Gemini fallback...');
  try {
    const result = await fallbackModel.generateContent(history);
    return result.response.text().trim();
  } catch (err) {
    console.log('Gemini fallback also failed:', err.message);
  }

  console.log('Trying DeepSeek as final fallback...');
  try {
    const completion = await deepseek.chat.completions.create({
      model: 'deepseek-chat',
      messages: [{ role: 'user', content: history }],
    });
    return completion.choices[0].message.content.trim();
  } catch (err) {
    console.log('DeepSeek also failed:', err.message);
    throw err;
  }
}

async function getPromptForNumber(twilioNumber) {
  // Normalize the number - ensure it always has + prefix
  const normalized = twilioNumber.startsWith('+') ? twilioNumber : '+' + twilioNumber;
  console.log('Looking up business for number:', normalized);

  // Try exact match first
  let { data, error } = await supabase
    .from('businesses')
    .select('system_prompt, business_name')
    .eq('phone_number', normalized)
    .single();

  // If not found, try without the + prefix
  if (error || !data) {
    const withoutPlus = normalized.replace('+', '');
    const result = await supabase
      .from('businesses')
      .select('system_prompt, business_name')
      .eq('phone_number', withoutPlus)
      .single();
    data = result.data;
    error = result.error;
  }

  if (error || !data) {
    console.log('No business found for this number, using fallback prompt. Error:', error?.message);
    return `You are a helpful voice assistant. Ask the caller what they need, then get their name and phone number. Once you have both, thank them and say goodbye.`;
  }

  console.log('Loaded prompt for business:', data.business_name);
  return data.system_prompt;
}

async function sendLeadSMS(callSid, conversationHistory) {
  try {
    const transcript = conversationHistory
      .filter((t) => t.role !== 'system')
      .map((t) => `${t.role === 'user' ? 'Customer' : 'Agent'}: ${t.text}`)
      .join('\n');

    await twilioClient.messages.create({
      body: `NEW LEAD - Voice Agent\n\n${transcript}`,
      from: '+15107670583',
      to: '+918113876408',
    });
    console.log(`Lead SMS sent successfully for call ${callSid}.`);
  } catch (err) {
    console.log('Failed to send lead SMS:', err.message);
  }
}

const conversations = {};

app.post('/voice', async (req, res) => {
  const callSid = req.body.CallSid;
  const calledNumber = req.body.To;

  const dynamicPrompt = await getPromptForNumber(calledNumber);
  conversations[callSid] = [{ role: 'system', text: dynamicPrompt }];

  const twiml = new twilio.twiml.VoiceResponse();
  const gather = twiml.gather({
    input: 'speech',
    action: '/respond',
    speechTimeout: 'auto',
    language: 'en-IN',
  });
  gather.say({ voice: 'Polly.Aditi' }, 'Hello! How can I help you today?');

  twiml.say({ voice: 'Polly.Aditi' }, "Sorry, I didn't hear anything. Please call back when you're ready.");
  twiml.hangup();

  res.type('text/xml');
  res.send(twiml.toString());
});

app.post('/respond', async (req, res) => {
  const callSid = req.body.CallSid;
  const callerSpeech = req.body.SpeechResult || '';
  const calledNumber = req.body.To;
  const twiml = new twilio.twiml.VoiceResponse();

  if (!callerSpeech) {
    const gather = twiml.gather({
      input: 'speech',
      action: '/respond',
      speechTimeout: 'auto',
      language: 'en-IN',
    });
    gather.say({ voice: 'Polly.Aditi' }, "Sorry, I didn't catch that. Could you say that again?");
    twiml.say({ voice: 'Polly.Aditi' }, 'Thanks for calling. Goodbye!');
    twiml.hangup();
    res.type('text/xml');
    return res.send(twiml.toString());
  }

  if (!conversations[callSid]) {
    const dynamicPrompt = await getPromptForNumber(calledNumber);
    conversations[callSid] = [{ role: 'system', text: dynamicPrompt }];
  }
  conversations[callSid].push({ role: 'user', text: callerSpeech });

  if (conversations[callSid].length > 10) {
    const forceTwiml = new twilio.twiml.VoiceResponse();
    forceTwiml.say({ voice: 'Polly.Aditi' }, 'Thanks for calling, our team will call you back. Goodbye!');
    forceTwiml.hangup();
    sendLeadSMS(callSid, conversations[callSid]);
    delete conversations[callSid];
    res.type('text/xml');
    return res.send(forceTwiml.toString());
  }

  try {
    const history = conversations[callSid]
      .map((t) => (t.role === 'system' ? t.text : `${t.role === 'user' ? 'Caller' : 'Assistant'}: ${t.text}`))
      .join('\n');

    const aiReply = await generateWithFallback(history);

    conversations[callSid].push({ role: 'assistant', text: aiReply });

    const isClosing = /goodbye/i.test(aiReply);

    if (isClosing) {
      twiml.say({ voice: 'Polly.Aditi' }, aiReply);
      twiml.hangup();
      sendLeadSMS(callSid, conversations[callSid]);
      delete conversations[callSid];
    } else {
      const gather = twiml.gather({
        input: 'speech',
        action: '/respond',
        speechTimeout: 'auto',
        language: 'en-IN',
      });
      gather.say({ voice: 'Polly.Aditi' }, aiReply);

      twiml.say({ voice: 'Polly.Aditi' }, 'Thanks for calling. Goodbye!');
      twiml.hangup();
    }

    res.type('text/xml');
    res.send(twiml.toString());
  } catch (err) {
    console.error('Gemini error:', err);
    const errorTwiml = new twilio.twiml.VoiceResponse();
    errorTwiml.say(
      { voice: 'Polly.Aditi' },
      'Sorry, we are having a small technical issue. Please call back in a moment.'
    );
    errorTwiml.hangup();
    res.type('text/xml');
    res.send(errorTwiml.toString());
  }
});

app.get('/', (req, res) => {
  res.send('Voice agent server is running.');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});