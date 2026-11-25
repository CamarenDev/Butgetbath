// Sends email through the Resend REST API (https://resend.com/docs/api-reference/emails/send-email).
// Without RESEND_API_KEY, messages are logged instead so local development works without an account.
const MAX_EMAIL_BYTES = 10 * 1024 * 1024;
const MAX_ATTACHMENT_BYTES = 8 * 1024 * 1024;
const MAX_RESPONSE_BYTES = 64 * 1024;
const ATTACHMENT_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'application/pdf', 'text/plain', 'video/mp4']);

const disabled = reason => ({ state: 'disabled', reason, retryable: false });
const available = () => ({ state: 'available', reason: '', retryable: false });
const degraded = (reason, retryable = true) => ({ state: 'degraded', reason, retryable });
const signalFor = (ms, signal) => AbortSignal.any([AbortSignal.timeout(ms), ...(signal ? [signal] : [])]);
const hostAllowed = (host, configured = '') => {
  const allow = configured.split(',').map(x => x.trim().toLowerCase()).filter(Boolean);
  return allow.some(pattern => pattern.startsWith('*.') ? host === pattern.slice(2) || host.endsWith(`.${pattern.slice(2)}`) : host === pattern)
    || host === 'resend.com' || host.endsWith('.resend.com')
    || host === 'r2.cloudflarestorage.com' || host.endsWith('.r2.cloudflarestorage.com')
    || host === 's3.amazonaws.com' || host.endsWith('.s3.amazonaws.com')
    || host.endsWith('.amazonaws.com');
};

async function readBounded(response, limit = MAX_RESPONSE_BYTES, signal) {
  if (!response.body) return Buffer.alloc(0);
  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      if (signal?.aborted) throw signal.reason || new DOMException('Aborted', 'AbortError');
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) {
        await reader.cancel('response too large');
        throw new Error(`Response exceeded ${limit} bytes`);
      }
      chunks.push(Buffer.from(value));
    }
    return Buffer.concat(chunks, size);
  } finally { reader.releaseLock(); }
}

function attachmentUrl(value, env) {
  let url;
  try { url = new URL(value); } catch { return null; }
  return url.protocol === 'https:' && !url.username && !url.password && hostAllowed(url.hostname.toLowerCase(), env.RESEND_ATTACHMENT_HOSTS) ? url : null;
}

function createMailer({ apiKey = process.env.RESEND_API_KEY, from = process.env.EMAIL_FROM, fetchImpl = (...args) => fetch(...args), log = console, env = process.env } = {}) {
  const capability = () => {
    if (!apiKey && !from) return disabled('RESEND_API_KEY and EMAIL_FROM are not configured');
    if (!apiKey || !from) return degraded(`Missing ${!apiKey ? 'RESEND_API_KEY' : 'EMAIL_FROM'}`, false);
    return available();
  };
  const send = async function ({ to, subject, html, text, replyTo, idempotencyKey, headers, attachments, signal }) {
    const state = capability();
    if (state.state !== 'available') {
      log.warn(`[email not sent: set RESEND_API_KEY and EMAIL_FROM] to=${to} subject="${subject}"`);
      if (env.NODE_ENV !== 'production') log.info(text);
      return { ok: false, skipped: true, provider: 'resend', capability: state, error: state.reason };
    }
    const payload = JSON.stringify({ from, to: Array.isArray(to) ? to : [to], subject, html, text, ...(replyTo && { reply_to: replyTo }), ...(headers && { headers }), ...(attachments && { attachments }) });
    if (Buffer.byteLength(payload) > MAX_EMAIL_BYTES) return { ok: false, provider: 'resend', capability: degraded('Email payload is too large', false), error: 'Email payload is too large.' };
    const response = await fetchImpl('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        ...(idempotencyKey && { 'Idempotency-Key': idempotencyKey })
      },
      body: payload,
      signal: signalFor(10000, signal)
    });
    const body = await readBounded(response);
    if (!response.ok) throw new Error(`Resend responded ${response.status}: ${body.toString('utf8', 0, 300)}`);
    const result = JSON.parse(body.toString('utf8'));
    return { ...result, ok: Boolean(result.id), provider: 'resend', capability: available() };
  };
  send.capability = capability;
  send.configured = capability().state === 'available';
  return send;
}

// Inbound mail: Resend webhooks carry metadata only, so content and attachments are fetched by API.
function createReceiver({ apiKey = process.env.RESEND_API_KEY, fetchImpl = (...args) => fetch(...args), env = process.env } = {}) {
  const capability = () => apiKey ? available() : disabled('RESEND_API_KEY is not configured');
  const get = async (url, { signal } = {}) => {
    if (capability().state !== 'available') throw new Error('Resend inbound email is disabled.');
    const response = await fetchImpl(url, { headers: { Authorization: `Bearer ${apiKey}` }, signal: signalFor(15000, signal) });
    if (!response.ok) throw new Error(`Resend responded ${response.status} while fetching inbound email`);
    return response;
  };
  return {
    capability,
    async getEmail(id, options) {
      const response = await get(`https://api.resend.com/emails/receiving/${encodeURIComponent(id)}`, options);
      return JSON.parse((await readBounded(response, MAX_RESPONSE_BYTES, options?.signal)).toString('utf8'));
    },
    async getAttachment(emailId, id, options = {}) {
      const response = await get(`https://api.resend.com/emails/receiving/${encodeURIComponent(emailId)}/attachments/${encodeURIComponent(id)}`, options);
      const meta = JSON.parse((await readBounded(response, MAX_RESPONSE_BYTES, options.signal)).toString('utf8'));
      const url = attachmentUrl(meta.download_url, env);
      const type = String(meta.content_type || '').split(';')[0].trim().toLowerCase();
      if (!url) throw new Error('Resend returned an attachment from an untrusted host.');
      if (!ATTACHMENT_TYPES.has(type)) throw new Error(`Resend returned unsupported attachment type ${type || 'unknown'}.`);
      const timeout = signalFor(30000, options.signal);
      const file = await fetchImpl(url, { redirect: 'error', signal: timeout });
      if (!file.ok) throw new Error(`Attachment download failed (${file.status})`);
      const responseType = String(file.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
      if (responseType && responseType !== type) throw new Error('Attachment content type changed during download.');
      const declared = Number(file.headers.get('content-length'));
      if (declared > MAX_ATTACHMENT_BYTES) throw new Error('Attachment is too large.');
      return readBounded(file, MAX_ATTACHMENT_BYTES, timeout);
    }
  };
}

module.exports = { createMailer, createReceiver, attachmentUrl, readBounded };
