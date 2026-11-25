// Optional one-way Google Calendar sync: appointments are pushed to the business calendar through the Calendar REST API
// using a service account (share the calendar with the service account's email with "Make changes to events").
// Without GOOGLE_CALENDAR_ID and GOOGLE_SERVICE_ACCOUNT_JSON every call is a no-op.
const crypto = require('node:crypto');
const { endOf } = require('./ical');

function createGoogleCalendar({ calendarId = process.env.GOOGLE_CALENDAR_ID, credentials = process.env.GOOGLE_SERVICE_ACCOUNT_JSON, timeZone = process.env.BUSINESS_TIMEZONE || 'America/Chicago', fetchImpl = (...args) => fetch(...args) } = {}) {
  let account = null;
  let credentialError = '';
  try { account = credentials ? (typeof credentials === 'string' ? JSON.parse(credentials) : credentials) : null; } catch { credentialError = 'GOOGLE_SERVICE_ACCOUNT_JSON is not valid JSON'; console.error(`${credentialError}; Google Calendar sync disabled.`); }
  const capability = () => {
    if (credentialError) return { state: 'degraded', reason: credentialError, retryable: false };
    if (!calendarId && !credentials) return { state: 'disabled', reason: 'Google Calendar credentials are not configured', retryable: false };
    const missing = [!calendarId && 'GOOGLE_CALENDAR_ID', !account?.client_email && 'service account client_email', !account?.private_key && 'service account private_key'].filter(Boolean);
    return missing.length ? { state: 'degraded', reason: `Missing ${missing.join(', ')}`, retryable: false } : { state: 'available', reason: '', retryable: false };
  };
  const enabled = capability().state === 'available';
  let cached = null;

  async function readResponse(response, limit = 128 * 1024) {
    const reader = response.body?.getReader();
    const chunks = []; let bytes = 0;
    if (reader) {
      try {
        while (true) {
          const { done, value } = await reader.read(); if (done) break;
          bytes += value.byteLength;
          if (bytes > limit) { await reader.cancel('response too large'); throw new Error(`Google Calendar response exceeded ${limit} bytes`); }
          chunks.push(Buffer.from(value));
        }
      } finally { reader.releaseLock(); }
    }
    return Buffer.concat(chunks, bytes).toString('utf8');
  }

  async function accessToken(signal) {
    if (cached && cached.expires > Date.now() + 60000) return cached.token;
    const b64 = value => Buffer.from(JSON.stringify(value)).toString('base64url');
    const now = Math.floor(Date.now() / 1000);
    const unsigned = `${b64({ alg: 'RS256', typ: 'JWT' })}.${b64({ iss: account.client_email, scope: 'https://www.googleapis.com/auth/calendar.events', aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 })}`;
    const assertion = `${unsigned}.${crypto.createSign('RSA-SHA256').update(unsigned).sign(account.private_key, 'base64url')}`;
    const response = await fetchImpl('https://oauth2.googleapis.com/token', {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }), signal: AbortSignal.any([AbortSignal.timeout(10000), ...(signal ? [signal] : [])])
    });
    if (!response.ok) throw new Error(`Google token request failed (${response.status})`);
    const data = JSON.parse(await readResponse(response, 64 * 1024));
    if (!data.access_token || !Number.isFinite(Number(data.expires_in))) throw new Error('Google token response was incomplete');
    cached = { token: data.access_token, expires: Date.now() + data.expires_in * 1000 };
    return cached.token;
  }

  const eventUrl = id => `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events${id ? `/${encodeURIComponent(id)}` : ''}`;
  async function call(method, url, body, signal) {
    const timeout = AbortSignal.any([AbortSignal.timeout(10000), ...(signal ? [signal] : [])]);
    const response = await fetchImpl(url, { method, headers: { Authorization: `Bearer ${await accessToken(signal)}`, 'Content-Type': 'application/json' }, body: body && JSON.stringify(body), signal: timeout });
    const raw = await readResponse(response);
    if (!response.ok && !(method === 'DELETE' && [404, 410].includes(response.status))) throw new Error(`Google Calendar responded ${response.status}: ${raw.slice(0, 200)}`);
    return response.status === 204 || !raw ? null : JSON.parse(raw);
  }
  const payload = ({ appointment: a, summary, description }) => ({
    summary, description, location: a.location || undefined,
    start: { dateTime: new Date(a.starts_at).toISOString(), timeZone }, end: { dateTime: endOf(a).toISOString(), timeZone },
    reminders: { useDefault: false, overrides: [{ method: 'popup', minutes: 60 }] }
  });

  return {
    enabled,
    capability,
    // Returns the Google event id, or null when sync is off. Callers treat failures as non-fatal.
    async upsert(event, { signal } = {}) {
      if (!enabled) return null;
      const id = event.appointment.google_event_id;
      if (id) { await call('PATCH', eventUrl(id), payload(event), signal); return id; }
      const result = await call('POST', eventUrl(), payload(event), signal);
      if (!result?.id) throw new Error('Google Calendar did not return an event id');
      return result.id;
    },
    async remove(id, { signal } = {}) { if (enabled && id) await call('DELETE', eventUrl(id), null, signal); }
  };
}

module.exports = { createGoogleCalendar };
