// Optional one-way Google Calendar sync: appointments are pushed to the business calendar through the Calendar REST API
// using a service account (share the calendar with the service account's email with "Make changes to events").
// Without GOOGLE_CALENDAR_ID and GOOGLE_SERVICE_ACCOUNT_JSON every call is a no-op.
const crypto = require('node:crypto');
const { endOf } = require('./ical');

function createGoogleCalendar({ calendarId = process.env.GOOGLE_CALENDAR_ID, credentials = process.env.GOOGLE_SERVICE_ACCOUNT_JSON, timeZone = process.env.BUSINESS_TIMEZONE || 'America/Chicago', fetchImpl = fetch } = {}) {
  let account = null;
  try { account = credentials ? (typeof credentials === 'string' ? JSON.parse(credentials) : credentials) : null; } catch { console.error('GOOGLE_SERVICE_ACCOUNT_JSON is not valid JSON; Google Calendar sync disabled.'); }
  const enabled = Boolean(calendarId && account?.client_email && account?.private_key);
  let cached = null;

  async function accessToken() {
    if (cached && cached.expires > Date.now() + 60000) return cached.token;
    const b64 = value => Buffer.from(JSON.stringify(value)).toString('base64url');
    const now = Math.floor(Date.now() / 1000);
    const unsigned = `${b64({ alg: 'RS256', typ: 'JWT' })}.${b64({ iss: account.client_email, scope: 'https://www.googleapis.com/auth/calendar.events', aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 })}`;
    const assertion = `${unsigned}.${crypto.createSign('RSA-SHA256').update(unsigned).sign(account.private_key, 'base64url')}`;
    const response = await fetchImpl('https://oauth2.googleapis.com/token', {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }), signal: AbortSignal.timeout(10000)
    });
    if (!response.ok) throw new Error(`Google token request failed (${response.status})`);
    const data = await response.json();
    cached = { token: data.access_token, expires: Date.now() + data.expires_in * 1000 };
    return cached.token;
  }

  const eventUrl = id => `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events${id ? `/${encodeURIComponent(id)}` : ''}`;
  async function call(method, url, body) {
    const response = await fetchImpl(url, { method, headers: { Authorization: `Bearer ${await accessToken()}`, 'Content-Type': 'application/json' }, body: body && JSON.stringify(body), signal: AbortSignal.timeout(10000) });
    if (!response.ok && !(method === 'DELETE' && [404, 410].includes(response.status))) throw new Error(`Google Calendar responded ${response.status}: ${(await response.text()).slice(0, 200)}`);
    return response.status === 204 ? null : response.json().catch(() => null);
  }
  const payload = ({ appointment: a, summary, description }) => ({
    summary, description, location: a.location || undefined,
    start: { dateTime: new Date(a.starts_at).toISOString(), timeZone }, end: { dateTime: endOf(a).toISOString(), timeZone },
    reminders: { useDefault: false, overrides: [{ method: 'popup', minutes: 60 }] }
  });

  return {
    enabled,
    // Returns the Google event id, or null when sync is off. Callers treat failures as non-fatal.
    async upsert(event) {
      if (!enabled) return null;
      const id = event.appointment.google_event_id;
      if (id) { await call('PATCH', eventUrl(id), payload(event)); return id; }
      return (await call('POST', eventUrl(), payload(event))).id;
    },
    async remove(id) { if (enabled && id) await call('DELETE', eventUrl(id)); }
  };
}

module.exports = { createGoogleCalendar };
