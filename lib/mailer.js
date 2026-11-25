// Sends email through the Resend REST API (https://resend.com/docs/api-reference/emails/send-email).
// Without RESEND_API_KEY, messages are logged instead so local development works without an account.
function createMailer({ apiKey = process.env.RESEND_API_KEY, from = process.env.EMAIL_FROM, log = console } = {}) {
  const send = async function ({ to, subject, html, text, replyTo, idempotencyKey, headers, attachments }) {
    if (!apiKey || !from) {
      log.warn(`[email not sent: set RESEND_API_KEY and EMAIL_FROM] to=${to} subject="${subject}"`);
      if (process.env.NODE_ENV !== 'production') log.info(text);
      return { skipped: true };
    }
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        ...(idempotencyKey && { 'Idempotency-Key': idempotencyKey })
      },
      body: JSON.stringify({ from, to: Array.isArray(to) ? to : [to], subject, html, text, ...(replyTo && { reply_to: replyTo }), ...(headers && { headers }), ...(attachments && { attachments }) }),
      signal: AbortSignal.timeout(10000)
    });
    if (!response.ok) throw new Error(`Resend responded ${response.status}: ${(await response.text()).slice(0, 300)}`);
    return response.json();
  };
  send.configured = Boolean(apiKey && from);
  return send;
}

// Inbound mail: Resend webhooks carry metadata only, so content and attachments are fetched by API.
function createReceiver({ apiKey = process.env.RESEND_API_KEY } = {}) {
  const get = async url => {
    const response = await fetch(url, { headers: { Authorization: `Bearer ${apiKey}` }, signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new Error(`Resend responded ${response.status} for ${url}`);
    return response;
  };
  return {
    async getEmail(id) { return (await get(`https://api.resend.com/emails/receiving/${encodeURIComponent(id)}`)).json(); },
    async getAttachment(emailId, id) {
      const meta = await (await get(`https://api.resend.com/emails/receiving/${encodeURIComponent(emailId)}/attachments/${encodeURIComponent(id)}`)).json();
      const file = await fetch(meta.download_url, { signal: AbortSignal.timeout(30000) });
      if (!file.ok) throw new Error('Attachment download failed');
      return Buffer.from(await file.arrayBuffer());
    }
  };
}

module.exports = { createMailer, createReceiver };
