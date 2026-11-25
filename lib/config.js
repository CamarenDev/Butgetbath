'use strict';

const path = require('node:path');
const { parseNetwork } = require('./client-ip');

const TRUE_VALUES = new Set(['1', 'true', 'yes']);
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function optionalUrl(env, key, fallback) {
  const value = env[key] || fallback;
  let parsed;
  try { parsed = new URL(value); } catch { throw new Error(`${key} must be a valid http(s) URL (received "${value}").`); }
  if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error(`${key} must use http:// or https://.`);
  return value.replace(/\/$/, '');
}

function emails(value, key) {
  const values = String(value || '').split(',').map(v => v.trim()).filter(Boolean);
  const invalid = values.find(value => !EMAIL_RE.test(value));
  if (invalid) throw new Error(`${key} contains an invalid email address: "${invalid}".`);
  return values;
}

function validateConfig(env = process.env, { root = path.join(__dirname, '..'), warn = () => {} } = {}) {
  const major = Number(process.versions.node.split('.')[0]);
  if (major < 24) throw new Error(`Node.js 24 or newer is required; detected ${process.versions.node}.`);

  const portText = String(env.PORT || 3000);
  const port = Number(portText);
  if (!/^\d+$/.test(portText) || !Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`PORT must be an integer from 1 to 65535 (received "${portText}").`);
  }
  const siteUrl = optionalUrl(env, 'SITE_URL', 'http://localhost:3000');
  const trustProxyValue = String(env.TRUST_PROXY || '').toLowerCase();
  if (trustProxyValue && !['0', '1', 'loopback'].includes(trustProxyValue)) {
    throw new Error('TRUST_PROXY must be 0, 1, or loopback.');
  }
  const trustProxy = TRUE_VALUES.has(trustProxyValue) || trustProxyValue === 'loopback';
  const trustedProxyIps = String(env.TRUST_PROXY_IPS || '').split(',').map(v => v.trim()).filter(Boolean);
  const invalidProxy = trustedProxyIps.find(value => !parseNetwork(value));
  if (invalidProxy) throw new Error(`TRUST_PROXY_IPS contains an invalid IP address or CIDR: "${invalidProxy}".`);

  const resendKey = String(env.RESEND_API_KEY || '').trim();
  const emailFrom = String(env.EMAIL_FROM || '').trim();
  const emailEnabled = Boolean(resendKey && emailFrom);
  if (!emailEnabled) warn('Email is disabled: RESEND_API_KEY and EMAIL_FROM must both be set, so no verification, notification or support emails will be sent.');
  const adminEmails = emails(env.ADMIN_EMAILS, 'ADMIN_EMAILS');
  const notifyEmail = emails(env.NOTIFY_EMAIL, 'NOTIFY_EMAIL')[0] || adminEmails[0] || '';
  if (!notifyEmail) warn('NOTIFY_EMAIL and ADMIN_EMAILS are empty: no admin will receive lead, support or alert emails.');

  const replyDomain = String(env.REPLY_DOMAIN || '').trim();
  const webhookSecret = String(env.RESEND_WEBHOOK_SECRET || '').trim();
  const replyEnabled = Boolean(replyDomain && webhookSecret && resendKey);
  if (replyDomain || webhookSecret) {
    if (!replyEnabled) warn('Inbound email replies are disabled: REPLY_DOMAIN, RESEND_WEBHOOK_SECRET, and RESEND_API_KEY are required together.');
  }

  const calendarId = String(env.GOOGLE_CALENDAR_ID || '').trim();
  const calendarCredentials = String(env.GOOGLE_SERVICE_ACCOUNT_JSON || '').trim();
  let calendarEnabled = Boolean(calendarId && calendarCredentials);
  if (Boolean(calendarId) !== Boolean(calendarCredentials)) warn('Google Calendar sync is disabled: GOOGLE_CALENDAR_ID and GOOGLE_SERVICE_ACCOUNT_JSON must both be set.');
  if (calendarEnabled) {
    try {
      const credentials = JSON.parse(calendarCredentials);
      if (!credentials.client_email || !credentials.private_key) throw new Error('missing credentials');
    } catch {
      calendarEnabled = false;
      warn('Google Calendar sync is disabled: GOOGLE_SERVICE_ACCOUNT_JSON is not a complete service-account JSON object.');
    }
  }

  const zohoId = String(env.ZOHO_CLIENT_ID || '').trim();
  const zohoSecret = String(env.ZOHO_CLIENT_SECRET || '').trim();
  if (Boolean(zohoId) !== Boolean(zohoSecret)) warn('Zoho integration is incomplete: ZOHO_CLIENT_ID and ZOHO_CLIENT_SECRET must both be set.');
  if (Boolean(env.STRIPE_SECRET_KEY) !== Boolean(env.STRIPE_WEBHOOK_SECRET)) warn('Stripe payments/webhooks are incomplete: STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET should be set together.');

  if (trustProxy && !trustedProxyIps.length) {
    warn('TRUST_PROXY is enabled without TRUST_PROXY_IPS; forwarded addresses are trusted only from loopback proxies.');
  }

  return {
    dataDir: env.DATA_DIR ? path.resolve(env.DATA_DIR) : path.join(root, 'data'),
    host: String(env.HOST || '').trim(),
    port,
    siteUrl,
    notifyEmail,
    adminEmails,
    trustProxy,
    trustedProxyIps,
    email: { enabled: emailEnabled, apiKey: emailEnabled ? resendKey : '', from: emailEnabled ? emailFrom : '' },
    replies: { enabled: replyEnabled, domain: replyEnabled ? replyDomain : '', webhookSecret: replyEnabled ? webhookSecret : '' },
    calendar: { enabled: calendarEnabled, id: calendarEnabled ? calendarId : '', credentials: calendarEnabled ? calendarCredentials : '' },
    paymentsEnabled: Boolean(env.STRIPE_SECRET_KEY && env.STRIPE_WEBHOOK_SECRET),
  };
}

module.exports = { validateConfig };
