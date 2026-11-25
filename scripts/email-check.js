#!/usr/bin/env node
// Email diagnostic: npm run email:check [-- recipient@example.com]
// Reads .env, validates the email settings and sends one real test message through Resend,
// printing the provider's exact error if it refuses.
const path = require('node:path');
const { validateConfig } = require('../lib/config');
const { createMailer } = require('../lib/mailer');

const ok = m => console.log(`  [ok]   ${m}`);
const bad = m => { console.log(`  [FAIL] ${m}`); failed = true; };
let failed = false;

(async () => {
  const envFile = path.join(__dirname, '..', '.env');
  try { process.loadEnvFile(envFile); ok(`Loaded ${envFile}`); }
  catch (e) { console.log(`  [warn] No .env loaded (${e.code || e.message}); using the process environment only.`); }

  console.log('\nConfiguration');
  let config;
  try { config = validateConfig(process.env, { warn: m => console.log(`  [warn] ${m}`) }); }
  catch (e) { bad(e.message); return; }

  const key = String(process.env.RESEND_API_KEY || '').trim();
  const from = String(process.env.EMAIL_FROM || '').trim();
  key ? ok(`RESEND_API_KEY set (${key.slice(0, 5)}…, ${key.startsWith('re_') ? 'format looks right' : 'does not start with "re_"'})`) : bad('RESEND_API_KEY is empty');
  if (key && !key.startsWith('re_')) bad('RESEND_API_KEY should start with "re_"; check for quotes or stray spaces');
  from ? ok(`EMAIL_FROM = ${from}`) : bad('EMAIL_FROM is empty');
  if (from && !/^[^<>@\s][^<>]*<[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+>$|^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(from)) bad('EMAIL_FROM must look like "Name <you@domain.com>" or "you@domain.com"');
  if (/@resend\.dev>?$/i.test(from)) console.log('  [warn] resend.dev senders only deliver to the Resend account owner; verify your own domain.');
  config.notifyEmail ? ok(`Admin inbox (NOTIFY_EMAIL) = ${config.notifyEmail}`) : bad('No NOTIFY_EMAIL or ADMIN_EMAILS: admins will not get updates');
  config.adminEmails.length ? ok(`ADMIN_EMAILS = ${config.adminEmails.join(', ')}`) : console.log('  [warn] ADMIN_EMAILS is empty: nobody can open the admin portal.');
  if (!config.email.enabled) { bad('Email is disabled until both RESEND_API_KEY and EMAIL_FROM are set'); return; }

  const to = process.argv[2] || config.notifyEmail || config.adminEmails[0];
  if (!to) { bad('No recipient: pass one as an argument'); return; }

  console.log(`\nSending a test email to ${to}`);
  const mailer = createMailer(config.email);
  try {
    const result = await mailer({
      to,
      subject: 'Budget Bath Solutions email test',
      text: 'If you can read this, outbound email works.',
      html: '<p>If you can read this, outbound email works.</p>'
    });
    result.ok ? ok(`Resend accepted the message (id ${result.id}). Check the inbox and spam folder.`) : bad(result.error || 'Resend did not accept the message');
  } catch (e) {
    bad(e.message);
    const hint = {
      401: 'The API key is invalid or revoked. Create a new one in Resend.',
      403: 'The sending domain is not verified, or the key is restricted. Verify the domain in Resend > Domains and use an address on it in EMAIL_FROM.',
      422: 'Resend rejected the message fields. Check EMAIL_FROM and the recipient address.',
      429: 'Rate limited by Resend. Wait and retry.'
    }[(/responded (\d+)/.exec(e.message) || [])[1]];
    if (hint) console.log(`         Hint: ${hint}`);
    if (/fetch failed|timeout|aborted/i.test(e.message)) console.log('         Hint: this server cannot reach api.resend.com; check outbound network/firewall/DNS.');
  }
})().finally(() => {
  console.log(failed ? '\nResult: PROBLEMS FOUND (see [FAIL] lines above)' : '\nResult: email is working');
  process.exitCode = failed ? 1 : 0;
});
