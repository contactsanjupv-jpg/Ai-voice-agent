require('dotenv').config();
const express = require('express');
const twilio = require('twilio');
const WebSocket = require('ws');
const http = require('http');

const app = express();
app.use(express.urlencoded({ extended: false }));

const twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

const AGENT_PROMPT = `You are the friendly voice assistant for Htrz Modz Kochi, a bike accessories, spare parts, and service shop in Kochi, Kerala.

BUSINESS INFO YOU KNOW:
- We offer: bike servicing, spare parts, and riding gear/accessories (helmets, jackets, gloves, etc.)
- If asked about specific prices, exact stock, or specific brands, say: "Let me get our team to confirm that exact detail when they call you back."
- Never guess at prices or specific stock availability.

CRITICAL RULE — READ THE CONVERSATION CAREFULLY BEFORE EVERY RESPONSE:
1. If you do NOT yet know what the caller needs, ask one short question about that.
2. If you know what they need but do NOT have their NAME yet, ask only for their name.
3. If you have their name but do NOT have their PHONE NUMBER yet, ask only for their phone number.
4. If you ALREADY have BOTH their name AND their phone number, do NOT ask anything else. Just say: "Thanks [name], our team will call you back shortly. Goodbye!" and stop.

Never ask "what do you need" more than once. Keep every response under 15 words.`;

app.post('/voice', (req, res) => {
  const twiml = new twilio.twiml.VoiceResponse();
  const connect = twiml.connect();
  connect.stream({ url: `wss://${req.headers.host}/twilio-stream` });
  res.type('text/xml');
  res.send(twiml.toString());
});

app.get('/', (req, res) => {
  res.send('Htrz Modz voice agent (Deepgram version) is running.');
});

const server = http.createServer(app);
const wss = new WebSocket.Server({ server, path: '/twilio-stream' });

wss.on('connection', (twilioWs) => {
  console.log('Twilio connected.');

  let streamSid = null;
  let conversationTranscript = [];
  let lastActivityTime = Date.now();
  let settingsConfirmed = false;
  let mediaEventCount = 0;

  const deepgramWs = new WebSocket('wss://agent.deepgram.com/v1/agent/converse', {
    headers: { Authorization: `Token ${process.env.DEEPGRAM_API_KEY}` },
  });

  const watchdog = setInterval(() => {
    if (Date.now() - lastActivityTime > 8000) {
      console.log('>>> WATCHDOG: No Deepgram activity for 8+ seconds, something is stuck. Media events received so far:', mediaEventCount);
    }
  }, 2000);

  deepgramWs.on('open', () => {
    console.log('Connected to Deepgram Agent.');

    deepgramWs.send(JSON.stringify({
      type: 'Settings',
      audio: {
        input: { encoding: 'mulaw', sample_rate: 8000 },
        output: { encoding: 'mulaw', sample_rate: 8000, container: 'none' },
      },
      agent: {
        language: 'en',
        listen: {
          provider: {
            type: 'deepgram',
            model: 'nova-2',
            smart_format: true,
          },
        },
        think: {
          provider: { type: 'groq', model: 'llama-3.3-70b-versatile' },
          endpoint: {
            url: 'https://api.groq.com/openai/v1/chat/completions',
            headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}` },
          },
          prompt: AGENT_PROMPT,
        },
        speak: {
          provider: { type: 'deepgram', model: 'aura-2-asteria-en' },
        },
        greeting: 'Hello! Welcome to Htrz Modz Kochi. How can I help you today?',
      },
    }));
  });

  deepgramWs.on('message', (data, isBinary) => {
    if (isBinary) {
      if (streamSid) {
        twilioWs.send(JSON.stringify({
          event: 'media',
          streamSid,
          media: { payload: data.toString('base64') },
        }));
      }
    } else {
      try {
        const msg = JSON.parse(data);
        console.log('Deepgram event:', msg.type);
        lastActivityTime = Date.now();

        if (msg.type === 'SettingsApplied') {
          settingsConfirmed = true;
          console.log('>>> Settings confirmed, now safe to send audio.');
        }

        if (msg.type === 'ConversationText') {
          conversationTranscript.push(`${msg.role}: ${msg.content}`);
        }

        if (msg.type === 'UserStartedSpeaking') {
          console.log('>>> User started speaking, waiting for transcription + LLM response...');
          twilioWs.send(JSON.stringify({ event: 'clear', streamSid }));
        }

        if (!['Welcome', 'SettingsApplied', 'ConversationText', 'History', 'AgentAudioDone', 'UserStartedSpeaking'].includes(msg.type)) {
          console.log('>>> UNHANDLED Deepgram message:', JSON.stringify(msg));
        }
      } catch (e) {
        console.log('Could not parse Deepgram message:', e.message);
      }
    }
  });

  deepgramWs.on('error', (err) => console.error('Deepgram WS error:', err.message));
  deepgramWs.on('close', (code, reason) => {
    console.log('Deepgram WS closed:', code, reason?.toString());
    clearInterval(watchdog);
  });

  twilioWs.on('message', (message) => {
    const msg = JSON.parse(message);

    if (msg.event === 'start') {
      streamSid = msg.start.streamSid;
      console.log('Call started:', streamSid);
    }

    if (msg.event === 'media') {
      mediaEventCount++;
      if (mediaEventCount % 50 === 0) {
        console.log(`>>> Received ${mediaEventCount} media events from Twilio so far.`);
      }
      if (deepgramWs.readyState === WebSocket.OPEN && settingsConfirmed) {
        const audioBuffer = Buffer.from(msg.media.payload, 'base64');
        deepgramWs.send(audioBuffer);
      }
    }

    if (msg.event === 'stop') {
      console.log('Call ended. Total media events received:', mediaEventCount);
      console.log('Call ended. Full transcript:', conversationTranscript.join('\n'));
      clearInterval(watchdog);

      twilioClient.messages.create({
        body: `NEW LEAD - Htrz Modz Kochi\n\n${conversationTranscript.join('\n')}`,
        from: '+15107670583',
        to: '+918113876408',
      }).then(() => console.log('Lead SMS sent.'))
        .catch((err) => console.log('SMS failed:', err.message));

      deepgramWs.close();
    }
  });

  twilioWs.on('close', () => {
    console.log('Twilio WS closed.');
    clearInterval(watchdog);
    deepgramWs.close();
  });
});

const PORT = 3001;
server.listen(PORT, () => {
  console.log(`Deepgram voice agent test server running on port ${PORT}`);
});