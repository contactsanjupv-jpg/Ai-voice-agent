require('dotenv').config();
const express = require('express');
const { createClient } = require('@supabase/supabase-js');

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY);

function generatePrompt({ businessName, businessDescription, hours, location, services, pricing, bookings, faqs }) {
  return `You are the friendly voice receptionist for ${businessName}.

ABOUT THE BUSINESS:
- What we do: ${businessDescription}
- Location: ${location || 'Not specified'}
- Hours: ${hours}
- Bookings/appointments: ${bookings || 'Not specified'}

SERVICES AND PRICING:
${services ? `- Services offered: ${services}` : '- Ask caller what they need and note it down'}
${pricing ? `- Pricing info: ${pricing}` : '- For pricing, tell caller our team will confirm when they call back'}

${faqs ? `COMMON QUESTIONS AND ANSWERS:\n${faqs}` : ''}

IMPORTANT RULES:
- If asked something you don't know, say: "Let me get our team to confirm that and have them call you back."
- Never make up prices, availability, or details you don't have above.
- Always be warm, brief, and natural — this is a phone call, not a form.

CONVERSATION FLOW — FOLLOW THIS EXACTLY:
1. If you don't know what the caller needs yet, ask ONE short question about that.
2. Once you know what they need, ask for their name.
3. Once you have their name, ask for their phone number.
4. Once you have BOTH name AND phone number, say: "Perfect, thanks [name]! Our team will call you back shortly. Goodbye!"
5. Never repeat a question you already got an answer to.
6. Keep every single response under 20 words.`;
}

app.get('/onboard', (req, res) => {
  res.send(`<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>AI Receptionist — Set up</title>
<style>
* { box-sizing: border-box; margin: 0; padding: 0; }
body { background: #0a0a0a; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; min-height: 100vh; }
.wrap { max-width: 560px; margin: 0 auto; padding: 48px 24px; }
.logo { display: flex; align-items: center; gap: 8px; margin-bottom: 44px; }
.dot { width: 8px; height: 8px; border-radius: 50%; background: #fff; }
.dot-sm { width: 4px; height: 4px; border-radius: 50%; background: rgba(255,255,255,0.3); }
.logo-text { font-size: 10px; letter-spacing: 4px; color: rgba(255,255,255,0.4); text-transform: uppercase; font-family: monospace; margin-left: 4px; }
h1 { font-size: 24px; font-weight: 400; color: #fff; letter-spacing: -0.5px; margin-bottom: 8px; }
.sub { font-size: 13px; color: rgba(255,255,255,0.35); margin-bottom: 40px; line-height: 1.6; }
.field { margin-bottom: 20px; }
.field label { display: block; font-size: 10px; letter-spacing: 2px; color: rgba(255,255,255,0.4); text-transform: uppercase; margin-bottom: 8px; font-family: monospace; }
.field input, .field textarea { width: 100%; background: rgba(255,255,255,0.04); border: 0.5px solid rgba(255,255,255,0.12); border-radius: 4px; padding: 12px 14px; color: #fff; font-size: 14px; outline: none; transition: border-color 0.15s; resize: none; font-family: inherit; }
.field input:focus, .field textarea:focus { border-color: rgba(255,255,255,0.35); }
.field input::placeholder, .field textarea::placeholder { color: rgba(255,255,255,0.2); }
.hint { font-size: 11px; color: rgba(255,255,255,0.25); margin-top: 5px; line-height: 1.5; }
.row { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
hr { border: none; border-top: 0.5px solid rgba(255,255,255,0.08); margin: 32px 0; }
.section-label { font-size: 10px; letter-spacing: 3px; color: rgba(255,255,255,0.2); text-transform: uppercase; margin-bottom: 22px; display: flex; align-items: center; gap: 12px; font-family: monospace; }
.section-label::after { content: ''; flex: 1; border-top: 0.5px solid rgba(255,255,255,0.08); }
.req { color: rgba(255,255,255,0.2); }
button { width: 100%; margin-top: 8px; padding: 15px; background: #fff; color: #0a0a0a; border: none; border-radius: 4px; font-size: 12px; letter-spacing: 2px; text-transform: uppercase; cursor: pointer; font-family: monospace; display: flex; align-items: center; justify-content: center; gap: 10px; transition: opacity 0.15s; }
button:hover { opacity: 0.88; }
.btn-dot { width: 6px; height: 6px; border-radius: 50%; background: #0a0a0a; flex-shrink: 0; }
@media (max-width: 480px) { .row { grid-template-columns: 1fr; } }
</style>
</head>
<body>
<div class="wrap">
  <div class="logo">
    <div class="dot"></div>
    <div class="dot-sm"></div>
    <div class="dot-sm"></div>
    <span class="logo-text">AI Receptionist</span>
  </div>

  <h1>Set up your receptionist</h1>
  <p class="sub">Tell us about your business. Your AI uses this to answer every call intelligently — no scripts needed.</p>

  <form method="POST" action="/onboard">
    <div class="field">
      <label>Business name <span class="req">*</span></label>
      <input type="text" name="businessName" required placeholder="">
    </div>

    <div class="field">
      <label>What does your business do? <span class="req">*</span></label>
      <textarea name="businessDescription" required rows="3" placeholder="We sell bike accessories, spare parts, and offer bike servicing in Kochi, Kerala."></textarea>
    </div>

    <div class="row">
      <div class="field">
        <label>Opening hours <span class="req">*</span></label>
        <input type="text" name="hours" required placeholder="9 AM – 8 PM, Mon–Sat">
      </div>
      <div class="field">
        <label>Location</label>
        <input type="text" name="location" placeholder="MG Road, Kochi">
      </div>
    </div>

    <hr>
    <div class="section-label">Services and pricing</div>

    <div class="field">
      <label>Services you offer</label>
      <textarea name="services" rows="2" placeholder="Helmets, riding jackets, gloves, spare parts, general servicing, clutch repair"></textarea>
      <p class="hint">The AI uses this to confirm what you do and don't offer</p>
    </div>

    <div class="field">
      <label>Pricing ranges</label>
      <input type="text" name="pricing" placeholder="Helmets from ₹800 to ₹4,500 · Basic service from ₹500">
      <p class="hint">Rough ranges help callers get useful answers</p>
    </div>

    <div class="field">
      <label>Do you take bookings?</label>
      <input type="text" name="bookings" placeholder="Yes — call us to book a service slot. Walk-ins welcome too.">
    </div>

    <hr>
    <div class="section-label">FAQs</div>

    <div class="field">
      <label>Common questions and answers</label>
      <textarea name="faqs" rows="5" placeholder="Q: Do you service all bike brands?&#10;A: Yes, all major brands.&#10;&#10;Q: How long does a basic service take?&#10;A: Usually 1–2 hours."></textarea>
      <p class="hint">The AI answers these directly — no need to pass the caller through</p>
    </div>

    <button type="submit">
      <div class="btn-dot"></div>
      Create my receptionist
    </button>
  </form>
</div>
</body>
</html>`);
});

app.post('/onboard', async (req, res) => {
  const { businessName, businessDescription, hours, location, services, pricing, bookings, faqs } = req.body;

  if (!businessName || !businessDescription || !hours) {
    return res.status(400).send('Please fill in the required fields.');
  }

  const systemPrompt = generatePrompt({ businessName, businessDescription, hours, location, services, pricing, bookings, faqs });

  try {
    const { data, error } = await supabase
      .from('businesses')
      .insert([{
        business_name: businessName,
        business_description: businessDescription,
        hours: hours,
        system_prompt: systemPrompt,
      }])
      .select();

    if (error) {
      console.error('Supabase insert error:', error);
      return res.status(500).send('Something went wrong. Please try again.');
    }

    const newBusiness = data[0];
    console.log('New business created:', newBusiness.business_name, '- ID:', newBusiness.id);

    res.send(`<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>Done</title>
<style>
* { box-sizing: border-box; margin: 0; padding: 0; }
body { background: #0a0a0a; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; min-height: 100vh; display: flex; align-items: center; justify-content: center; }
.wrap { max-width: 480px; padding: 48px 24px; text-align: center; }
.dot-ring { width: 48px; height: 48px; border-radius: 50%; border: 0.5px solid rgba(255,255,255,0.2); display: flex; align-items: center; justify-content: center; margin: 0 auto 32px; }
.dot-inner { width: 12px; height: 12px; border-radius: 50%; background: #fff; }
h1 { font-size: 22px; font-weight: 400; color: #fff; margin-bottom: 10px; }
p { font-size: 14px; color: rgba(255,255,255,0.4); line-height: 1.6; margin-bottom: 28px; }
.id-box { background: rgba(255,255,255,0.04); border: 0.5px solid rgba(255,255,255,0.1); border-radius: 4px; padding: 14px; font-family: monospace; font-size: 11px; color: rgba(255,255,255,0.35); letter-spacing: 1px; word-break: break-all; }
</style>
</head>
<body>
<div class="wrap">
  <div class="dot-ring"><div class="dot-inner"></div></div>
  <h1>Receptionist ready</h1>
  <p>Your AI receptionist for <strong style="color:#fff;">${businessName}</strong> is set up and ready to answer calls.</p>
  <div class="id-box">ID · ${newBusiness.id}</div>
</div>
</body>
</html>`);
  } catch (err) {
    console.error('Unexpected error:', err);
    res.status(500).send('An unexpected error occurred.');
  }
});

app.get('/', (req, res) => {
  res.send('Onboarding server running. Visit /onboard to create a new business.');
});

const PORT = 3002;
app.listen(PORT, () => {
  console.log(`Onboarding server running on port ${PORT}`);
});