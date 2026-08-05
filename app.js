require('dotenv').config();
const { WebSocketServer } = require('ws');
const WebSocket = require('ws');
const express = require('express');
const twilio = require('twilio');
const { createClient } = require('@supabase/supabase-js');

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY);

async function getBusinessForNumber(num) {
  if (!num) return { id: null, business_name: 'this business', system_prompt: null, notification_phone: null, phone_number: null };
  const n = num.startsWith('+') ? num : '+' + num;
  console.log('Looking up:', n);
  let { data } = await supabase.from('businesses').select('id,business_name,system_prompt,notification_phone,phone_number').eq('phone_number', n).single();
  if (!data) {
    const r = await supabase.from('businesses').select('id,business_name,system_prompt,notification_phone,phone_number').eq('phone_number', n.replace('+', '')).single();
    data = r.data;
  }
  if (!data) return { id: null, business_name: 'this business', system_prompt: null, notification_phone: null, phone_number: null };
  console.log('Found:', data.business_name);
  return data;
}

async function sendLeadNotification(business, callSid, history) {
  const transcript = history.filter(t => t.role !== 'system').map(t => (t.role === 'user' ? 'Customer' : 'Agent') + ': ' + t.text).join('\n');
  const lines = transcript.split('\n');

  let name = 'Unknown', phone = 'Unknown', whatTheyNeed = 'Unknown';
  for (const line of lines) {
    if (line.startsWith('Customer:')) {
      const text = line.replace('Customer:', '').trim();
      if (whatTheyNeed === 'Unknown' && text.length > 12) whatTheyNeed = text;
      if (/\d{5,}/.test(text)) phone = text;
    }
  }
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].startsWith('Agent:') && /your name/i.test(lines[i]) && lines[i + 1] && lines[i + 1].startsWith('Customer:')) {
      name = lines[i + 1].replace('Customer:', '').trim();
      name = name.replace(/^(my name is|this is|it's|it is|i'm|i am|name's)\s+/i, '').trim();
    }
  }
  for (const line of lines) {
    if (line.startsWith('Agent:')) {
      const m = line.match(/\d(?:-\d){6,}/);
      if (m) phone = m[0].replace(/-/g, '');
    }
  }

  if (business.notification_phone) {
    try {
      await twilioClient.messages.create({ body: 'NEW LEAD - ' + business.business_name + '\nName: ' + name + '\nPhone: ' + phone, from: business.phone_number || '+15107670583', to: business.notification_phone });
      console.log('SMS sent for call:', callSid);
    } catch (e) { console.log('SMS failed:', e.message); }
  } else {
    console.log('No notification phone on file for', business.business_name, '- lead still saved, SMS skipped');
  }

  if (business.id) {
    const { error: leadError } = await supabase.from('leads').insert([{
      business_id: business.id,
      caller_name: name === 'Unknown' ? '' : name,
      caller_phone: phone === 'Unknown' ? '' : phone,
      what_they_need: whatTheyNeed === 'Unknown' ? '' : whatTheyNeed,
      transcript: transcript
    }]);
    if (leadError) console.log('Lead save failed:', leadError.message);
    else console.log('Lead saved for call:', callSid);
  }
}

function generatePrompt({ businessName, businessDescription, hours, location, services, pricing, bookings, faqs }) {
  return 'You are the friendly, knowledgeable voice receptionist for ' + businessName + '. You work like a real human receptionist.\n\n' +
    'THE MOST IMPORTANT RULE, READ THIS FIRST: Never ask for the caller\'s name or phone number until you have had at least 3 full back-and-forth exchanges about what they actually need, and they sound satisfied (they say things like "okay", "thanks", "sounds good", or stop asking new questions). This is true no matter what they say to you, even if they sound ready to book or buy right away. Asking too early is a serious failure. There is no rush - a real conversation always comes first.\n\n' +
    'ABOUT THE BUSINESS:\n- What we do: ' + businessDescription + '\n' +
    (location ? '- Location: ' + location + '\n' : '') +
    '- Hours: ' + hours + '\n' +
    (bookings ? '- Bookings: ' + bookings + '\n' : '') +
    '\nSERVICES AND PRICING:\n' +
    (services ? '- Services: ' + services + '\n' : '') +
    '- ' + (pricing ? 'Pricing: ' + pricing : 'For pricing, tell caller our team will confirm.') + '\n' +
    (faqs ? '\nCOMMON Q&A:\n' + faqs + '\n' : '') +
    '\nHOW TO HANDLE CALLS:\n' +
    'Have a genuine, natural conversation, like a real front-desk person, not a script. Ask follow-up questions, and give real, specific answers using the info above.\n' +
    'Once the rule above is satisfied, say: I would love to have our team follow up, could I get your name? Then ask for their phone number. When you repeat the phone number back to confirm it, always say each digit separately with hyphens, like 8-1-1-3-8-7-6-4-0-5, never as one big number.\n' +
    'Only once you have BOTH their name AND have confirmed their phone number back to them digit by digit, say: Perfect [name], our team will call you back shortly. Goodbye! After that goodbye - if they reply, respond briefly then call end_call. If they go quiet, call end_call after a couple seconds either way. Never call end_call before the phone number has actually been confirmed back to them.\n' +
    'RULES: Keep each response to 1-3 sentences. Never make up information not listed above. Be warm, natural, and human, not robotic or rushed.';
}

const CSS = `*{box-sizing:border-box;margin:0;padding:0}body{background:#0a0a0a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#fff;min-height:100vh}a{text-decoration:none;color:inherit}.header{border-bottom:0.5px solid rgba(255,255,255,0.08);padding:0 28px;height:56px;display:flex;align-items:center;justify-content:space-between;position:sticky;top:0;background:#0a0a0a;z-index:100}.logo{display:flex;align-items:center;gap:8px}.dot{width:8px;height:8px;border-radius:50%;background:#fff;flex-shrink:0}.dot-sm{width:4px;height:4px;border-radius:50%;background:rgba(255,255,255,0.3);flex-shrink:0}.logo-text{font-size:10px;letter-spacing:4px;color:rgba(255,255,255,0.4);text-transform:uppercase;font-family:monospace;margin-left:4px}.header-right{display:flex;align-items:center;gap:10px}.pill{background:rgba(255,255,255,0.06);border:0.5px solid rgba(255,255,255,0.1);border-radius:4px;padding:5px 12px;font-size:11px;font-family:monospace;letter-spacing:1px;color:rgba(255,255,255,0.4)}.btn{font-size:11px;letter-spacing:1.5px;text-transform:uppercase;font-family:monospace;padding:7px 16px;border-radius:4px;cursor:pointer;border:0.5px solid rgba(255,255,255,0.15);color:rgba(255,255,255,0.5);background:transparent;display:inline-flex;align-items:center;gap:6px}.btn:hover{border-color:rgba(255,255,255,0.4);color:#fff}.btn.primary{background:#fff;color:#0a0a0a;border-color:#fff}.btn.primary:hover{opacity:0.88}.layout{display:flex;min-height:calc(100vh - 56px)}.sidebar{width:200px;flex-shrink:0;border-right:0.5px solid rgba(255,255,255,0.06);padding:20px 0;position:sticky;top:56px;height:calc(100vh - 56px);overflow-y:auto}.nav-sec{font-size:9px;letter-spacing:3px;text-transform:uppercase;font-family:monospace;color:rgba(255,255,255,0.15);padding:16px 24px 6px}.nav-item{display:flex;align-items:center;gap:10px;padding:9px 24px;font-size:12px;color:rgba(255,255,255,0.4);cursor:pointer;transition:all 0.15s}.nav-item:hover{color:rgba(255,255,255,0.8);background:rgba(255,255,255,0.03)}.nav-item.active{color:#fff;background:rgba(255,255,255,0.05)}.nav-dot{width:5px;height:5px;border-radius:50%;background:currentColor;flex-shrink:0}.main{flex:1;padding:36px 40px;min-width:0}.page-title{font-size:20px;font-weight:400;margin-bottom:4px}.page-sub{font-size:11px;font-family:monospace;color:rgba(255,255,255,0.25);letter-spacing:1px;margin-bottom:32px}.stats{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:36px}.stat{background:rgba(255,255,255,0.03);border:0.5px solid rgba(255,255,255,0.07);border-radius:6px;padding:20px}.stat-label{font-size:9px;letter-spacing:2px;text-transform:uppercase;font-family:monospace;color:rgba(255,255,255,0.3);margin-bottom:10px}.stat-val{font-size:28px;font-weight:300;font-family:monospace;margin-bottom:4px}.stat-sub{font-size:11px;font-family:monospace;color:rgba(255,255,255,0.25)}.stat-sub.up{color:rgba(100,220,130,0.7)}.section{margin-bottom:40px}.section-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:16px}.section-title{font-size:9px;letter-spacing:3px;text-transform:uppercase;font-family:monospace;color:rgba(255,255,255,0.25)}.section-link{font-size:10px;letter-spacing:1px;text-transform:uppercase;font-family:monospace;color:rgba(255,255,255,0.2)}.section-link:hover{color:rgba(255,255,255,0.6)}table{width:100%;border-collapse:collapse}th{font-size:9px;letter-spacing:2px;text-transform:uppercase;font-family:monospace;color:rgba(255,255,255,0.2);padding:0 16px 12px;text-align:left;border-bottom:0.5px solid rgba(255,255,255,0.06)}td{padding:14px 16px;border-bottom:0.5px solid rgba(255,255,255,0.04);font-size:13px;color:rgba(255,255,255,0.65);vertical-align:middle}tr:last-child td{border-bottom:none}tr:hover td{background:rgba(255,255,255,0.02)}.caller-name{color:#fff;font-weight:500;font-size:13px}.caller-phone{font-family:monospace;font-size:11px;color:rgba(255,255,255,0.3);margin-top:2px}.tag{display:inline-block;background:rgba(255,255,255,0.05);border:0.5px solid rgba(255,255,255,0.1);border-radius:3px;padding:3px 8px;font-size:10px;font-family:monospace;letter-spacing:1px;color:rgba(255,255,255,0.35);text-transform:uppercase}.status{display:flex;align-items:center;gap:6px;font-size:11px;font-family:monospace;color:rgba(100,220,130,0.7)}.status-dot{width:5px;height:5px;border-radius:50%;background:currentColor}.status.pending{color:rgba(255,200,80,0.7)}.time{font-size:11px;font-family:monospace;color:rgba(255,255,255,0.2)}.biz-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}.biz-card{background:rgba(255,255,255,0.03);border:0.5px solid rgba(255,255,255,0.07);border-radius:6px;padding:20px}.empty{font-size:13px;color:rgba(255,255,255,0.2);padding:32px 0;text-align:center}.empty a{color:rgba(255,255,255,0.5)}.field{margin-bottom:20px}.field label{display:block;font-size:10px;letter-spacing:2px;color:rgba(255,255,255,0.4);text-transform:uppercase;margin-bottom:8px;font-family:monospace}.field input,.field textarea{width:100%;background:rgba(255,255,255,0.04);border:0.5px solid rgba(255,255,255,0.12);border-radius:4px;padding:12px 14px;color:#fff;font-size:14px;outline:none;resize:none;font-family:inherit}.field input:focus,.field textarea:focus{border-color:rgba(255,255,255,0.35)}.field input::placeholder,.field textarea::placeholder{color:rgba(255,255,255,0.2)}.hint{font-size:11px;color:rgba(255,255,255,0.25);margin-top:5px}.row2{display:grid;grid-template-columns:1fr 1fr;gap:14px}hr{border:none;border-top:0.5px solid rgba(255,255,255,0.08);margin:28px 0}.sec-lbl{font-size:10px;letter-spacing:3px;color:rgba(255,255,255,0.2);text-transform:uppercase;margin-bottom:20px;display:flex;align-items:center;gap:12px;font-family:monospace}.sec-lbl::after{content:'';flex:1;border-top:0.5px solid rgba(255,255,255,0.08)}.req{color:rgba(255,255,255,0.2)}.submit-btn{width:100%;margin-top:8px;padding:15px;background:#fff;color:#0a0a0a;border:none;border-radius:4px;font-size:12px;letter-spacing:2px;text-transform:uppercase;cursor:pointer;font-family:monospace}.submit-btn:hover{opacity:0.88}.err{font-size:12px;color:#ff6b6b;margin-bottom:16px;padding:10px 14px;background:rgba(255,107,107,0.08);border:0.5px solid rgba(255,107,107,0.2);border-radius:4px}@media(max-width:700px){.stats{grid-template-columns:1fr 1fr}.biz-grid{grid-template-columns:1fr}.sidebar{display:none}.row2{grid-template-columns:1fr}}`;

function layout(active, content) {
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>AI Receptionist</title><style>${CSS}</style></head><body>
<div class="header">
  <a href="/dashboard" class="logo"><div class="dot"></div><div class="dot-sm"></div><div class="dot-sm"></div><span class="logo-text">AI Receptionist</span></a>
  <div class="header-right">
    <span class="pill">Free plan</span>
    <a href="/onboard" class="btn primary">+ Add business</a>
    <a href="/logout" class="btn">Sign out</a>
  </div>
</div>
<div class="layout">
  <div class="sidebar">
    <div class="nav-sec">Overview</div>
    <a href="/dashboard" class="nav-item ${active==='dashboard'?'active':''}"><div class="nav-dot"></div>Dashboard</a>
    <a href="/leads" class="nav-item ${active==='leads'?'active':''}"><div class="nav-dot"></div>All leads</a>
    <div class="nav-sec">Manage</div>
    <a href="/businesses" class="nav-item ${active==='businesses'?'active':''}"><div class="nav-dot"></div>Businesses</a>
    <a href="/settings" class="nav-item ${active==='settings'?'active':''}"><div class="nav-dot"></div>Settings</a>
    <div class="nav-sec">Account</div>
    <a href="/billing" class="nav-item ${active==='billing'?'active':''}"><div class="nav-dot"></div>Billing</a>
    <a href="/logout" class="nav-item"><div class="nav-dot"></div>Sign out</a>
  </div>
  <div class="main">${content}</div>
</div></body></html>`;
}

function authPage(title, heading, sub, action, btnText, linkText, linkHref, error) {
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title>
<style>${CSS}body{display:flex;align-items:center;justify-content:center}.wrap{width:100%;max-width:400px;padding:48px 24px}.logo{display:flex;align-items:center;gap:8px;margin-bottom:44px;justify-content:center}h1{font-size:22px;font-weight:400;color:#fff;text-align:center;margin-bottom:8px}.sub{font-size:13px;color:rgba(255,255,255,0.35);text-align:center;margin-bottom:36px}button{width:100%;margin-top:8px;padding:14px;background:#fff;color:#0a0a0a;border:none;border-radius:4px;font-size:12px;letter-spacing:2px;text-transform:uppercase;cursor:pointer;font-family:monospace}button:hover{opacity:0.88}.link{text-align:center;margin-top:24px;font-size:13px;color:rgba(255,255,255,0.3)}.link a{color:rgba(255,255,255,0.6)}</style></head>
<body><div class="wrap">
<div class="logo"><div class="dot"></div><div class="dot-sm"></div><div class="dot-sm"></div><span class="logo-text">AI Receptionist</span></div>
<h1>${heading}</h1><p class="sub">${sub}</p>
${error ? '<div class="err">' + error + '</div>' : ''}
<form method="POST" action="${action}">
<div class="field"><label>Email</label><input type="email" name="email" required placeholder="you@yourbusiness.com" autocomplete="email"></div>
<div class="field"><label>Password</label><input type="password" name="password" required placeholder="Min 6 characters" autocomplete="${action==='/signup'?'new-password':'current-password'}"></div>
<button type="submit">${btnText}</button></form>
<p class="link">${linkText} <a href="${linkHref}">${action==='/signup'?'Sign in':'Create one'}</a></p>
</div></body></html>`;
}

function getOwner(req) {
  const m = (req.headers.cookie || '').match(/user_id=([^;]+)/);
  return m ? m[1] : null;
}

// AUTH
app.get('/signup', (req, res) => res.send(authPage('Sign up','Create your account','Get your AI receptionist live in minutes','/signup','Create account','Already have an account?','/login',req.query.error)));
app.post('/signup', async (req, res) => {
  try {
    const { data, error } = await supabase.auth.admin.createUser({ email: req.body.email, password: req.body.password, email_confirm: true });
    if (error) return res.redirect('/signup?error=' + encodeURIComponent(error.message));
    res.setHeader('Set-Cookie', 'user_id=' + data.user.id + '; Path=/; HttpOnly');
    res.redirect('/onboard');
  } catch (e) { res.redirect('/signup?error=Something+went+wrong'); }
});

app.get('/login', (req, res) => res.send(authPage('Sign in','Welcome back','Sign in to your account','/login','Sign in','No account yet?','/signup',req.query.error)));
app.post('/login', async (req, res) => {
  try {
    const { data, error } = await supabase.auth.signInWithPassword({ email: req.body.email, password: req.body.password });
    if (error) return res.redirect('/login?error=' + encodeURIComponent(error.message));
    res.setHeader('Set-Cookie', 'user_id=' + data.user.id + '; Path=/; HttpOnly');
    res.redirect('/dashboard');
  } catch (e) { res.redirect('/login?error=Something+went+wrong'); }
});

app.get('/logout', (req, res) => {
  res.setHeader('Set-Cookie', 'user_id=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT');
  res.redirect('/login');
});

// ONBOARDING
app.get('/onboard', (req, res) => {
  const isLoggedIn = !!getOwner(req);
  const back = isLoggedIn ? '<a href="/dashboard" style="display:inline-flex;align-items:center;gap:6px;font-size:11px;font-family:monospace;letter-spacing:1px;color:rgba(255,255,255,0.3);margin-bottom:32px">← Back</a>' : '';
  const errorMsg = req.query.error ? '<div class="err">' + req.query.error + '</div>' : '';
  res.send(`<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Set up</title><style>${CSS}</style></head>
<body><div style="max-width:560px;margin:0 auto;padding:48px 24px">
<div class="logo" style="margin-bottom:44px"><div class="dot"></div><div class="dot-sm"></div><div class="dot-sm"></div><span class="logo-text">AI Receptionist</span></div>
${back}
<h1 style="font-size:24px;font-weight:400;color:#fff;margin-bottom:8px">Set up your receptionist</h1>
<p style="font-size:13px;color:rgba(255,255,255,0.35);margin-bottom:40px;line-height:1.6">Tell us about your business. Your AI uses this to answer every call intelligently.</p>
${errorMsg}
<form method="POST" action="/onboard">
<div class="field"><label>Business name <span class="req">*</span></label><input type="text" name="businessName" required placeholder="e.g. Htrz Modz Kochi"></div>
<div class="field"><label>What does your business do? <span class="req">*</span></label><textarea name="businessDescription" required rows="3" placeholder="e.g. We sell bike accessories, spare parts, and offer bike servicing."></textarea></div>
<div class="row2">
<div class="field"><label>Opening hours <span class="req">*</span></label><input type="text" name="hours" required placeholder="9 AM - 8 PM, Mon-Sat"></div>
<div class="field"><label>Location</label><input type="text" name="location" placeholder="MG Road, Kochi"></div>
</div>
<hr><div class="sec-lbl">Services and pricing</div>
<div class="field"><label>Services you offer</label><textarea name="services" rows="2" placeholder="Helmets, riding jackets, gloves, spare parts, servicing"></textarea><p class="hint">The AI uses this to confirm what you do and don't offer</p></div>
<div class="field"><label>Pricing ranges</label><input type="text" name="pricing" placeholder="Helmets from Rs 800, basic service from Rs 500"><p class="hint">Rough ranges help callers get useful answers</p></div>
<div class="field"><label>Do you take bookings?</label><input type="text" name="bookings" placeholder="Yes, call us to book. Walk-ins welcome too."></div>
<div class="field"><label>Notification phone <span class="req">*</span></label><input type="text" name="notificationPhone" required placeholder="+919778461144"><p class="hint">This number gets a text the moment a lead is captured</p></div>
<hr><div class="sec-lbl">FAQs</div>
<div class="field"><label>Common questions and answers</label><textarea name="faqs" rows="5" placeholder="Q: Do you service all bike brands?&#10;A: Yes, all major brands."></textarea><p class="hint">The AI answers these directly on the call</p></div>
<button class="submit-btn" type="submit">Create my receptionist</button>
</form></div></body></html>`);
});

app.post('/onboard', async (req, res) => {
  const { businessName, businessDescription, hours, location, services, pricing, bookings, faqs, notificationPhone } = req.body;
  if (!businessName || !businessDescription || !hours || !notificationPhone) return res.redirect('/onboard?error=Please+fill+required+fields');
  const systemPrompt = generatePrompt({ businessName, businessDescription, hours, location, services, pricing, bookings, faqs });
  const ownerId = getOwner(req);
  const { data, error } = await supabase.from('businesses').insert([{ business_name: businessName, business_description: businessDescription, hours, system_prompt: systemPrompt, notification_phone: notificationPhone || null, owner_id: ownerId || null }]).select();
  if (error) { console.error(error); return res.redirect('/onboard?error=Something+went+wrong'); }
  console.log('Created:', data[0].business_name);

  try {
    const available = await twilioClient.availablePhoneNumbers('US').local.list({ limit: 1 });
    if (available.length > 0) {
      const purchased = await twilioClient.incomingPhoneNumbers.create({
        phoneNumber: available[0].phoneNumber,
        voiceUrl: 'https://' + req.headers.host + '/voice',
        voiceMethod: 'POST'
      });
      await supabase.from('businesses').update({ phone_number: purchased.phoneNumber }).eq('id', data[0].id);
      console.log('Provisioned number', purchased.phoneNumber, 'for', data[0].business_name);
    } else {
      console.log('No available numbers found for', data[0].business_name);
    }
  } catch (e) {
    console.log('Number provisioning failed:', e.message);
  }

  res.redirect('/dashboard');
});

// DASHBOARD
app.get('/dashboard', async (req, res) => {
  const ownerId = getOwner(req);
  if (!ownerId) return res.redirect('/login');
  const { data: bizList } = await supabase.from('businesses').select('id,business_name,phone_number,created_at').eq('owner_id', ownerId).order('created_at', { ascending: false });
  const businesses = bizList || [];
  const bizIds = businesses.map(b => b.id);
  const bizMap = {};
  businesses.forEach(b => { bizMap[b.id] = b.business_name; });
  let leads = [], totalLeads = 0;
  if (bizIds.length > 0) {
    const { data: ld } = await supabase.from('leads').select('*').in('business_id', bizIds).order('created_at', { ascending: false }).limit(5);
    leads = ld || [];
    const { count } = await supabase.from('leads').select('id', { count: 'exact', head: true }).in('business_id', bizIds);
    totalLeads = count || 0;
  }
  const leadsHTML = leads.length === 0
    ? '<tr><td colspan="5"><div class="empty">No leads yet. They will appear here the moment a call comes in.</div></td></tr>'
    : leads.map(l => {
        const d = new Date(l.created_at);
        const t = d.toLocaleDateString() === new Date().toLocaleDateString() ? d.toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}) : d.toLocaleDateString();
        return '<tr onclick="location.href=\'/leads/' + l.id + '\'" style="cursor:pointer"><td><div class="caller-name">' + (l.caller_name||'Unknown') + '</div><div class="caller-phone">' + (l.caller_phone||'--') + '</div></td><td>' + (l.what_they_need||'--') + '</td><td><span class="tag">' + (bizMap[l.business_id]||'--') + '</span></td><td><div class="status"><div class="status-dot"></div>New</div></td><td class="time">' + t + '</td></tr>';
      }).join('');
  const bizHTML = businesses.length === 0
    ? '<div class="empty">No businesses yet. <a href="/onboard">Create your first one</a></div>'
    : '<div class="biz-grid">' + businesses.map(b => '<div class="biz-card"><div><div style="font-size:14px;font-weight:500;margin-bottom:4px">' + b.business_name + '</div><div style="font-size:11px;font-family:monospace;color:rgba(255,255,255,0.3);margin-bottom:10px">' + (b.phone_number||'No number yet') + '</div><div class="status ' + (b.phone_number?'':'pending') + '"><div class="status-dot"></div>' + (b.phone_number?'Live':'Pending') + '</div></div><div style="text-align:right"><div style="font-size:26px;font-weight:300;font-family:monospace">--</div><div style="font-size:9px;letter-spacing:2px;text-transform:uppercase;font-family:monospace;color:rgba(255,255,255,0.25)">Leads</div></div></div>').join('') + '</div>';
  const latestTime = leads.length > 0 ? new Date(leads[0].created_at).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}) : '--';
  const content = `
<div class="page-title">Dashboard</div>
<div class="page-sub">${new Date().toLocaleDateString('en-US',{weekday:'long',year:'numeric',month:'long',day:'numeric'}).toUpperCase()}</div>
<div class="stats">
<div class="stat"><div class="stat-label">Total leads</div><div class="stat-val">${totalLeads}</div><div class="stat-sub">All time</div></div>
<div class="stat"><div class="stat-label">Businesses</div><div class="stat-val">${businesses.length}</div><div class="stat-sub">Active</div></div>
<div class="stat"><div class="stat-label">Latest lead</div><div class="stat-val">${latestTime}</div><div class="stat-sub">Today</div></div>
<div class="stat"><div class="stat-label">System status</div><div class="stat-val" style="font-size:14px;padding-top:6px">Online</div><div class="stat-sub up">All systems go</div></div>
</div>
<div class="section">
<div class="section-head"><div class="section-title">Recent leads</div><a href="/leads" class="section-link">View all</a></div>
<table><thead><tr><th>Caller</th><th>Enquiry</th><th>Business</th><th>Status</th><th>Time</th></tr></thead><tbody>${leadsHTML}</tbody></table>
</div>
<div class="section">
<div class="section-head"><div class="section-title">Your businesses</div><a href="/businesses" class="section-link">Manage</a></div>
${bizHTML}
</div>`;
  res.send(layout('dashboard', content));
});

// ALL LEADS
app.get('/leads', async (req, res) => {
  const ownerId = getOwner(req);
  if (!ownerId) return res.redirect('/login');
  const { data: bizList } = await supabase.from('businesses').select('id,business_name').eq('owner_id', ownerId);
  const bizIds = (bizList||[]).map(b => b.id);
  const bizMap = {};
  (bizList||[]).forEach(b => { bizMap[b.id] = b.business_name; });
  let leads = [];
  if (bizIds.length > 0) {
    const { data: ld } = await supabase.from('leads').select('*').in('business_id', bizIds).order('created_at', { ascending: false }).limit(100);
    leads = ld || [];
  }
  const rows = leads.length === 0
    ? '<tr><td colspan="5"><div class="empty">No leads yet.</div></td></tr>'
    : leads.map(l => '<tr onclick="location.href=\'/leads/' + l.id + '\'" style="cursor:pointer"><td><div class="caller-name">' + (l.caller_name||'Unknown') + '</div><div class="caller-phone">' + (l.caller_phone||'--') + '</div></td><td>' + (l.what_they_need||'--') + '</td><td><span class="tag">' + (bizMap[l.business_id]||'--') + '</span></td><td><div class="status"><div class="status-dot"></div>New</div></td><td class="time">' + new Date(l.created_at).toLocaleString() + '</td></tr>').join('');
  const content = `<div class="page-title">All leads</div><div class="page-sub">${leads.length} TOTAL</div><table><thead><tr><th>Caller</th><th>Enquiry</th><th>Business</th><th>Status</th><th>Time</th></tr></thead><tbody>${rows}</tbody></table>`;
  res.send(layout('leads', content));
});

// LEAD DETAIL — full transcript
app.get('/leads/:id', async (req, res) => {
  const ownerId = getOwner(req);
  if (!ownerId) return res.redirect('/login');
  const { data: lead } = await supabase.from('leads').select('*').eq('id', req.params.id).single();
  if (!lead) return res.redirect('/leads');
  const { data: biz } = await supabase.from('businesses').select('business_name,owner_id').eq('id', lead.business_id).single();
  if (!biz || biz.owner_id !== ownerId) return res.redirect('/leads');
  const transcriptLines = (lead.transcript || '').split('\n').filter(l => l.trim());
  const transcriptHTML = transcriptLines.length === 0
    ? '<div class="empty">No transcript saved for this call.</div>'
    : transcriptLines.map(line => {
        const isAgent = line.startsWith('Agent:');
        const text = line.replace(/^(Agent:|Customer:)\s*/, '');
        return '<div style="margin-bottom:14px"><div style="font-size:9px;letter-spacing:2px;text-transform:uppercase;font-family:monospace;color:' + (isAgent ? 'rgba(120,180,255,0.6)' : 'rgba(255,255,255,0.35)') + '">' + (isAgent ? 'AI' : 'Caller') + '</div><div style="font-size:14px;color:rgba(255,255,255,0.75);margin-top:3px;line-height:1.5">' + text + '</div></div>';
      }).join('');
  const content = `<a href="/leads" style="display:inline-flex;align-items:center;gap:6px;font-size:11px;font-family:monospace;letter-spacing:1px;color:rgba(255,255,255,0.3);margin-bottom:28px">← Back to leads</a>
<div class="page-title">${lead.caller_name || 'Unknown caller'}</div>
<div class="page-sub">${(lead.caller_phone || 'No number captured').toUpperCase()} · ${biz.business_name.toUpperCase()} · ${new Date(lead.created_at).toLocaleString().toUpperCase()}</div>
<div class="biz-card" style="padding:24px;margin-bottom:20px;display:block"><div style="font-size:10px;letter-spacing:2px;text-transform:uppercase;font-family:monospace;color:rgba(255,255,255,0.3);margin-bottom:10px">What they needed</div><div style="font-size:14px;color:rgba(255,255,255,0.7)">${lead.what_they_need || 'Not captured'}</div></div>
<div class="biz-card" style="padding:24px;display:block"><div style="font-size:10px;letter-spacing:2px;text-transform:uppercase;font-family:monospace;color:rgba(255,255,255,0.3);margin-bottom:20px">Full conversation</div>${transcriptHTML}</div>`;
  res.send(layout('leads', content));
});

// BUSINESSES
app.get('/businesses', async (req, res) => {
  const ownerId = getOwner(req);
  if (!ownerId) return res.redirect('/login');
  const { data: bizList } = await supabase.from('businesses').select('*').eq('owner_id', ownerId).order('created_at', { ascending: false });
  const businesses = bizList || [];
  const cards = businesses.length === 0
    ? '<div class="empty">No businesses yet. <a href="/onboard">Create your first one</a></div>'
    : businesses.map(b => `<div class="biz-card" style="margin-bottom:12px;display:block;padding:24px"><div style="display:flex;justify-content:space-between;align-items:flex-start"><div><div style="font-size:16px;font-weight:500;margin-bottom:6px">${b.business_name}</div><div style="font-size:11px;font-family:monospace;color:rgba(255,255,255,0.3);margin-bottom:12px">${b.phone_number||'No phone number connected yet'}</div><div class="status ${b.phone_number?'':'pending'}"><div class="status-dot"></div>${b.phone_number?'Live':'Pending number connection'}</div></div><div style="text-align:right"><div style="font-size:11px;font-family:monospace;color:rgba(255,255,255,0.2)">Created</div><div style="font-size:12px;font-family:monospace;color:rgba(255,255,255,0.35)">${new Date(b.created_at).toLocaleDateString()}</div></div></div>${b.business_description?'<div style="margin-top:16px;font-size:13px;color:rgba(255,255,255,0.4);border-top:0.5px solid rgba(255,255,255,0.06);padding-top:16px">'+b.business_description+'</div>':''}</div>`).join('');
  const content = `<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:32px"><div><div class="page-title">Businesses</div><div class="page-sub">${businesses.length} TOTAL</div></div><a href="/onboard" class="btn primary">+ Add business</a></div>${cards}`;
  res.send(layout('businesses', content));
});

// SETTINGS
app.get('/settings', (req, res) => {
  if (!getOwner(req)) return res.redirect('/login');
  const content = `<div class="page-title">Settings</div><div class="page-sub">ACCOUNT AND PREFERENCES</div>
<div style="max-width:480px">
<div class="biz-card" style="margin-bottom:16px;padding:24px"><div style="font-size:10px;letter-spacing:2px;text-transform:uppercase;font-family:monospace;color:rgba(255,255,255,0.3);margin-bottom:16px">Notifications</div><div style="font-size:13px;color:rgba(255,255,255,0.5);line-height:1.7">SMS notifications go to the phone number set during onboarding. To update it, re-create your business with the new number.</div></div>
<div class="biz-card" style="margin-bottom:16px;padding:24px"><div style="font-size:10px;letter-spacing:2px;text-transform:uppercase;font-family:monospace;color:rgba(255,255,255,0.3);margin-bottom:16px">Plan</div><div style="font-size:13px;color:rgba(255,255,255,0.5);margin-bottom:12px">You are on the Free plan.</div><a href="/billing" class="btn">View billing</a></div>
<div class="biz-card" style="padding:24px"><div style="font-size:10px;letter-spacing:2px;text-transform:uppercase;font-family:monospace;color:rgba(255,255,255,0.3);margin-bottom:16px">Danger zone</div><a href="/logout" class="btn" style="border-color:rgba(255,100,100,0.3);color:rgba(255,100,100,0.6)">Sign out</a></div>
</div>`;
  res.send(layout('settings', content));
});

// BILLING
app.get('/billing', (req, res) => {
  if (!getOwner(req)) return res.redirect('/login');
  const content = `<div class="page-title">Billing</div><div class="page-sub">PLAN AND USAGE</div>
<div style="max-width:480px">
<div class="biz-card" style="padding:28px">
<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px"><div><div style="font-size:16px;font-weight:500;margin-bottom:4px">Free plan</div><div style="font-size:13px;color:rgba(255,255,255,0.4)">Up to 1 business, 100 leads/month</div></div><div style="font-size:22px;font-weight:300;font-family:monospace">$0</div></div>
<div style="border-top:0.5px solid rgba(255,255,255,0.08);padding-top:20px"><div style="font-size:10px;letter-spacing:2px;text-transform:uppercase;font-family:monospace;color:rgba(255,255,255,0.25);margin-bottom:12px">Upgrade to Pro</div><div style="font-size:13px;color:rgba(255,255,255,0.4);margin-bottom:16px;line-height:1.7">Unlimited businesses, unlimited leads, priority support, and advanced analytics.</div><div class="btn" style="cursor:default;opacity:0.5;display:inline-flex">Coming soon</div></div>
</div></div>`;
  res.send(layout('billing', content));
});

// VOICE AGENT — Twilio Media Streams bridged to Deepgram Voice Agent
app.post('/voice', (req, res) => {
  const twiml = new twilio.twiml.VoiceResponse();
  const connect = twiml.connect();
  const stream = connect.stream({ url: 'wss://' + req.headers.host + '/twilio-stream' });
  stream.parameter({ name: 'to', value: req.body.To });
  res.type('text/xml').send(twiml.toString());
});

app.get('/', (req, res) => {
  const content = `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>AI Receptionist — Never miss a customer call again</title><style>${CSS}
.hero{max-width:720px;margin:0 auto;padding:100px 24px 60px;text-align:center}
.hero h1{font-size:40px;font-weight:400;line-height:1.25;margin-bottom:20px}
.hero p{font-size:16px;color:rgba(255,255,255,0.45);line-height:1.6;max-width:520px;margin:0 auto 36px}
.hero-ctas{display:flex;gap:12px;justify-content:center;flex-wrap:wrap;margin-bottom:16px}
.hero-note{font-size:11px;font-family:monospace;letter-spacing:1px;color:rgba(255,255,255,0.2);text-transform:uppercase}
.steps{max-width:900px;margin:80px auto;padding:0 24px;display:grid;grid-template-columns:repeat(3,1fr);gap:20px}
.step{background:rgba(255,255,255,0.03);border:0.5px solid rgba(255,255,255,0.07);border-radius:8px;padding:28px}
.step-num{font-family:monospace;font-size:11px;letter-spacing:2px;color:rgba(255,255,255,0.25);margin-bottom:14px}
.step h3{font-size:16px;font-weight:500;margin-bottom:8px}
.step p{font-size:13px;color:rgba(255,255,255,0.4);line-height:1.6}
.for-who{text-align:center;padding:0 24px 100px}
.for-who-label{font-size:9px;letter-spacing:3px;text-transform:uppercase;font-family:monospace;color:rgba(255,255,255,0.2);margin-bottom:20px}
.tags{display:flex;gap:10px;justify-content:center;flex-wrap:wrap;max-width:640px;margin:0 auto}
@media(max-width:700px){.steps{grid-template-columns:1fr}.hero h1{font-size:30px}}
</style></head>
<body>
<div class="header">
  <a href="/" class="logo"><div class="dot"></div><div class="dot-sm"></div><div class="dot-sm"></div><span class="logo-text">AI Receptionist</span></a>
  <div class="header-right">
    <a href="/login" class="btn">Sign in</a>
    <a href="/signup" class="btn primary">Get started free</a>
  </div>
</div>
<div class="hero">
  <h1>Never miss a customer call again.</h1>
  <p>Your AI receptionist answers every call, has a real conversation, and texts you the lead the moment it hangs up. No scripts to write, no APIs to configure — just fill in your business details and it works.</p>
  <div class="hero-ctas"><a href="/signup" class="btn primary">Get your AI receptionist free</a></div>
  <div class="hero-note">Live in under 10 minutes · No credit card required</div>
</div>
<div class="steps">
  <div class="step"><div class="step-num">01</div><h3>Tell us about your business</h3><p>Hours, services, pricing, FAQs — one simple form, no technical setup.</p></div>
  <div class="step"><div class="step-num">02</div><h3>Get your number</h3><p>A dedicated phone number, live instantly, answering calls as your business.</p></div>
  <div class="step"><div class="step-num">03</div><h3>Never miss a lead</h3><p>Every caller gets helped, every lead gets captured, you get a text the moment it happens.</p></div>
</div>
<div class="for-who">
  <div class="for-who-label">Built for owner-operated businesses</div>
  <div class="tags"><span class="tag">Salons</span><span class="tag">Gyms</span><span class="tag">Bike shops</span><span class="tag">Dental clinics</span><span class="tag">Home services</span><span class="tag">Real estate</span></div>
</div>
</body></html>`;
  res.send(content);
});

const PORT = process.env.PORT || 3000;
const server = app.listen(PORT, () => console.log('App running on port ' + PORT));

const wss = new WebSocketServer({ server, path: '/twilio-stream' });
wss.on('connection', (twilioWs) => {
  console.log('Twilio stream connected');
  let streamSid = null;
  let business = null;
  let dgReady = false;
  let settingsSent = false;
  let settingsApplied = false;
  let endCallAttempts = 0;
  let callEnding = false;
  let history = [];
  let callSid = null;

  const dgWs = new WebSocket('wss://agent.deepgram.com/v1/agent/converse', {
    headers: { Authorization: 'Token ' + process.env.DEEPGRAM_API_KEY }
  });

  function trySendSettings() {
    if (!dgReady || !business || settingsSent) return;
    const prompt = business.system_prompt || 'You are a helpful voice assistant. Ask what the caller needs, get their name and phone number, then say goodbye.';
    dgWs.send(JSON.stringify({
      type: 'Settings',
      audio: {
        input: { encoding: 'mulaw', sample_rate: 8000 },
        output: { encoding: 'mulaw', sample_rate: 8000, container: 'none' }
      },
      agent: {
        listen: { provider: { type: 'deepgram', model: 'nova-3' } },
        think: {
          provider: { type: 'google', model: 'gemini-3.1-flash-lite' },
          prompt: prompt,
          functions: [
            {
              name: 'end_call',
              description: 'Hang up the phone call. Call this once the conversation has naturally wrapped up - right after the caller replies to your goodbye, or after a couple seconds if they go quiet instead.',
              parameters: { type: 'object', properties: {}, required: [] }
            }
          ]
        },
        speak: { provider: { type: 'deepgram', model: 'aura-2-asteria-en' } },
        greeting: 'Hello! Thanks for calling ' + business.business_name + '. How can I help you today?'
      }
    }));
    settingsSent = true;
    console.log('Settings sent for', business.business_name);
  }

  dgWs.on('open', () => { console.log('Deepgram connected'); dgReady = true; trySendSettings(); });

  dgWs.on('message', (msg, isBinary) => {
    if (isBinary) {
      if (streamSid) twilioWs.send(JSON.stringify({ event: 'media', streamSid, media: { payload: msg.toString('base64') } }));
      return;
    }
    try {
      const data = JSON.parse(msg);
      console.log('Deepgram event:', data.type, data.description || '');
      if (data.type === 'SettingsApplied') settingsApplied = true;
      if (data.type === 'UserStartedSpeaking' && streamSid) {
        twilioWs.send(JSON.stringify({ event: 'clear', streamSid }));
      }
      if (data.type === 'ConversationText') {
        history.push({ role: data.role, text: data.content });
      }
      if (data.type === 'FunctionCallRequest' && Array.isArray(data.functions)) {
        for (const fn of data.functions) {
          if (fn.name === 'end_call') {
            endCallAttempts++;
            const attemptNum = endCallAttempts;
            setTimeout(() => {
              const agentConfirmedDigits = history.some(h => h.role !== 'user' && /\d(?:-\d){6,}/.test(h.text || ''));
              const phoneConfirmed = agentConfirmedDigits || attemptNum >= 3;
              if (phoneConfirmed) {
                callEnding = true;
                dgWs.send(JSON.stringify({ type: 'FunctionCallResponse', id: fn.id, name: fn.name, content: JSON.stringify({ status: 'ending call' }) }));
                setTimeout(() => {
                  twilioClient.calls(callSid).update({ status: 'completed' }).catch(e => console.log('Hangup failed:', e.message));
                }, 4500);
              } else {
                console.log('end_call blocked - phone not confirmed yet, attempt', attemptNum);
                dgWs.send(JSON.stringify({ type: 'FunctionCallResponse', id: fn.id, name: fn.name, content: JSON.stringify({ status: 'not yet, you still need to confirm their phone number back to them digit by digit first' }) }));
              }
            }, 400);
          }
        }
      }
    } catch (e) {
      console.log('Error handling Deepgram message:', e.message);
    }
  });

  dgWs.on('error', (e) => console.log('Deepgram WS error:', e.message));

  twilioWs.on('message', async (msg) => {
    try {
      const data = JSON.parse(msg);
      if (data.event === 'start') {
        streamSid = data.start.streamSid;
        callSid = data.start.callSid;
        const toNumber = data.start.customParameters?.to;
        console.log('Stream started for number:', toNumber);
        business = await getBusinessForNumber(toNumber);
        trySendSettings();
      } else if (data.event === 'media') {
        if (settingsApplied && !callEnding && dgWs.readyState === WebSocket.OPEN) dgWs.send(Buffer.from(data.media.payload, 'base64'));
      } else {
        console.log('Stream event:', data.event);
      }
    } catch (e) {
      console.log('Error handling Twilio message:', e.message);
    }
  });
  twilioWs.on('close', () => {
    console.log('Twilio stream closed');
    if (business && business.id) sendLeadNotification(business, callSid, history).catch(e => console.log('sendLeadNotification error:', e.message));
    dgWs.close();
  });
});