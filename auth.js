require('dotenv').config();
const express = require('express');
const { createClient } = require('@supabase/supabase-js');

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY);

app.get('/signup', (req, res) => {
  res.send(`<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Sign up — AI Receptionist</title>
<style>
* { box-sizing: border-box; margin: 0; padding: 0; }
body { background: #0a0a0a; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; min-height: 100vh; display: flex; align-items: center; justify-content: center; }
.wrap { width: 100%; max-width: 400px; padding: 48px 24px; }
.logo { display: flex; align-items: center; gap: 8px; margin-bottom: 44px; justify-content: center; }
.dot { width: 8px; height: 8px; border-radius: 50%; background: #fff; }
.dot-sm { width: 4px; height: 4px; border-radius: 50%; background: rgba(255,255,255,0.3); }
.logo-text { font-size: 10px; letter-spacing: 4px; color: rgba(255,255,255,0.4); text-transform: uppercase; font-family: monospace; margin-left: 4px; }
h1 { font-size: 22px; font-weight: 400; color: #fff; text-align: center; margin-bottom: 8px; }
.sub { font-size: 13px; color: rgba(255,255,255,0.35); text-align: center; margin-bottom: 36px; }
.field { margin-bottom: 16px; }
.field label { display: block; font-size: 10px; letter-spacing: 2px; color: rgba(255,255,255,0.4); text-transform: uppercase; margin-bottom: 8px; font-family: monospace; }
.field input { width: 100%; background: rgba(255,255,255,0.04); border: 0.5px solid rgba(255,255,255,0.12); border-radius: 4px; padding: 12px 14px; color: #fff; font-size: 14px; outline: none; transition: border-color 0.15s; font-family: inherit; }
.field input:focus { border-color: rgba(255,255,255,0.35); }
.field input::placeholder { color: rgba(255,255,255,0.2); }
.error { font-size: 12px; color: #ff6b6b; margin-bottom: 16px; padding: 10px 14px; background: rgba(255,107,107,0.08); border: 0.5px solid rgba(255,107,107,0.2); border-radius: 4px; }
button { width: 100%; margin-top: 8px; padding: 14px; background: #fff; color: #0a0a0a; border: none; border-radius: 4px; font-size: 12px; letter-spacing: 2px; text-transform: uppercase; cursor: pointer; font-family: monospace; transition: opacity 0.15s; }
button:hover { opacity: 0.88; }
.link { text-align: center; margin-top: 24px; font-size: 13px; color: rgba(255,255,255,0.3); }
.link a { color: rgba(255,255,255,0.6); text-decoration: none; }
.link a:hover { color: #fff; }
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

  <h1>Create your account</h1>
  <p class="sub">Get your AI receptionist live in minutes</p>

  ${req.query.error ? `<div class="error">${req.query.error}</div>` : ''}

  <form method="POST" action="/signup">
    <div class="field">
      <label>Email</label>
      <input type="email" name="email" required placeholder="you@yourbusiness.com" autocomplete="email">
    </div>
    <div class="field">
      <label>Password</label>
      <input type="password" name="password" required placeholder="Min 6 characters" autocomplete="new-password">
    </div>
    <button type="submit">Create account</button>
  </form>

  <p class="link">Already have an account? <a href="/login">Sign in</a></p>
</div>
</body>
</html>`);
});

app.post('/signup', async (req, res) => {
  const { email, password } = req.body;

  try {
    const { data, error } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });

    if (error) {
      return res.redirect('/signup?error=' + encodeURIComponent(error.message));
    }

    res.setHeader('Set-Cookie', `user_id=${data.user.id}; Path=/; HttpOnly`);
   res.redirect('http://localhost:3002/onboard');
  } catch (err) {
    res.redirect('/signup?error=' + encodeURIComponent('Something went wrong. Please try again.'));
  }
});

app.get('/login', (req, res) => {
  res.send(`<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Sign in — AI Receptionist</title>
<style>
* { box-sizing: border-box; margin: 0; padding: 0; }
body { background: #0a0a0a; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; min-height: 100vh; display: flex; align-items: center; justify-content: center; }
.wrap { width: 100%; max-width: 400px; padding: 48px 24px; }
.logo { display: flex; align-items: center; gap: 8px; margin-bottom: 44px; justify-content: center; }
.dot { width: 8px; height: 8px; border-radius: 50%; background: #fff; }
.dot-sm { width: 4px; height: 4px; border-radius: 50%; background: rgba(255,255,255,0.3); }
.logo-text { font-size: 10px; letter-spacing: 4px; color: rgba(255,255,255,0.4); text-transform: uppercase; font-family: monospace; margin-left: 4px; }
h1 { font-size: 22px; font-weight: 400; color: #fff; text-align: center; margin-bottom: 8px; }
.sub { font-size: 13px; color: rgba(255,255,255,0.35); text-align: center; margin-bottom: 36px; }
.field { margin-bottom: 16px; }
.field label { display: block; font-size: 10px; letter-spacing: 2px; color: rgba(255,255,255,0.4); text-transform: uppercase; margin-bottom: 8px; font-family: monospace; }
.field input { width: 100%; background: rgba(255,255,255,0.04); border: 0.5px solid rgba(255,255,255,0.12); border-radius: 4px; padding: 12px 14px; color: #fff; font-size: 14px; outline: none; transition: border-color 0.15s; font-family: inherit; }
.field input:focus { border-color: rgba(255,255,255,0.35); }
.field input::placeholder { color: rgba(255,255,255,0.2); }
.error { font-size: 12px; color: #ff6b6b; margin-bottom: 16px; padding: 10px 14px; background: rgba(255,107,107,0.08); border: 0.5px solid rgba(255,107,107,0.2); border-radius: 4px; }
button { width: 100%; margin-top: 8px; padding: 14px; background: #fff; color: #0a0a0a; border: none; border-radius: 4px; font-size: 12px; letter-spacing: 2px; text-transform: uppercase; cursor: pointer; font-family: monospace; transition: opacity 0.15s; }
button:hover { opacity: 0.88; }
.link { text-align: center; margin-top: 24px; font-size: 13px; color: rgba(255,255,255,0.3); }
.link a { color: rgba(255,255,255,0.6); text-decoration: none; }
.link a:hover { color: #fff; }
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

  <h1>Welcome back</h1>
  <p class="sub">Sign in to your account</p>

  ${req.query.error ? `<div class="error">${req.query.error}</div>` : ''}

  <form method="POST" action="/login">
    <div class="field">
      <label>Email</label>
      <input type="email" name="email" required placeholder="you@yourbusiness.com" autocomplete="email">
    </div>
    <div class="field">
      <label>Password</label>
      <input type="password" name="password" required placeholder="Your password" autocomplete="current-password">
    </div>
    <button type="submit">Sign in</button>
  </form>

  <p class="link">No account yet? <a href="/signup">Create one</a></p>
</div>
</body>
</html>`);
});

app.post('/login', async (req, res) => {
  const { email, password } = req.body;

  try {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      return res.redirect('/login?error=' + encodeURIComponent(error.message));
    }

    res.setHeader('Set-Cookie', `user_id=${data.user.id}; Path=/; HttpOnly`);
    res.redirect('/dashboard');
  } catch (err) {
    res.redirect('/login?error=' + encodeURIComponent('Something went wrong. Please try again.'));
  }
});

app.get('/dashboard', (req, res) => {
  res.send(`<!DOCTYPE html>
<html>
<head><title>Dashboard</title></head>
<body style="background:#0a0a0a; color:#fff; font-family:sans-serif; display:flex; align-items:center; justify-content:center; min-height:100vh;">
  <div style="text-align:center;">
    <h1 style="font-weight:400; margin-bottom:10px;">Dashboard coming soon</h1>
    <p style="color:rgba(255,255,255,0.4); font-size:14px;">Login successful — this is where leads and settings will live.</p>
  </div>
</body>
</html>`);
});

app.get('/', (req, res) => {
  res.redirect('/signup');
});

const PORT = 3003;
app.listen(PORT, () => {
  console.log(`Auth server running on port ${PORT}`);
});