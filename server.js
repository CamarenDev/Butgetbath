const http = require('node:http');
const path = require('node:path');
const fs = require('node:fs/promises');
const zlib = require('node:zlib');
const crypto = require('node:crypto');
const { promisify } = require('node:util');
const brotli = promisify(zlib.brotliCompress), gzip = promisify(zlib.gzip);
const compressible = new Set(['.html', '.css', '.js', '.svg', '.json', '.xml', '.txt']);
const { openDb } = require('./lib/db');
const { createMailer, createReceiver } = require('./lib/mailer');
const { createTemplates } = require('./lib/emails');
const { createGoogleCalendar } = require('./lib/gcal');
const { createApi } = require('./lib/api');
const { validateConfig } = require('./lib/config');
const { createClientIp } = require('./lib/client-ip');

const distDir = path.join(__dirname, 'dist');
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.mp4': 'video/mp4', '.xml': 'application/xml; charset=utf-8', '.txt': 'text/plain; charset=utf-8', '.webmanifest': 'application/manifest+json; charset=utf-8' };
const WINDOW = 10 * 60 * 1000;

const headers = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'X-Frame-Options': 'DENY',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(self)',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Resource-Policy': 'same-origin',
  'X-Permitted-Cross-Domain-Policies': 'none',
  'Origin-Agent-Cluster': '?1',
  'Content-Security-Policy': "default-src 'self'; img-src 'self' data: blob:; media-src 'self' blob:; style-src 'self'; script-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'self'; object-src 'none'; worker-src 'self'; manifest-src 'self'"
};

function createServer(options = {}) {
  const config = options.config || validateConfig();
  const dataDir = options.dataDir ?? config.dataDir;
  const siteUrl = options.siteUrl ?? config.siteUrl;
  const notifyEmail = options.notifyEmail ?? config.notifyEmail;
  const adminEmails = options.adminEmails ?? config.adminEmails;
  const replyDomain = options.replyDomain ?? config.replies.domain;
  const webhookSecret = options.webhookSecret ?? config.replies.webhookSecret;
  const mailer = options.mailer || createMailer(config.email);
  const receiver = options.receiver !== undefined ? options.receiver : (config.replies.enabled ? createReceiver({ apiKey: config.email.apiKey }) : null);
  const gcal = options.gcal || createGoogleCalendar({ calendarId: config.calendar.id, credentials: config.calendar.credentials });
  const clientIp = options.clientIp || createClientIp({
    trustProxy: options.trustProxy ?? config.trustProxy,
    trustedProxyIps: options.trustedProxyIps ?? config.trustedProxyIps
  });
  const db = openDb(dataDir);
  const templates = createTemplates(siteUrl);
  const api = createApi({ db, dataDir, mailer, templates, siteUrl, notifyEmail, adminEmails, replyDomain, webhookSecret, receiver, gcal, clientIp, secureCookies: siteUrl.startsWith('https://'), paymentsEnabled: config.paymentsEnabled });
  const recent = new Map();

  const sendJson = (res, status, body) => {
    res.writeHead(status, { ...headers, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify(body));
  };
  const outboxId = key => crypto.createHash('sha256').update(key).digest('hex').slice(0, 32);

  async function readBody(req, limit) {
    let size = 0;
    const chunks = [];
    for await (const chunk of req) {
      size += chunk.length;
      if (size > limit) return null;
      chunks.push(chunk);
    }
    return Buffer.concat(chunks).toString('utf8');
  }

  async function submit(req, res) {
    const ip = clientIp(req);
    const now = Date.now();
    const times = (recent.get(ip) || []).filter(t => now - t < WINDOW);
    if (times.length >= 10) {
      res.setHeader('Retry-After', String(Math.ceil((times[0] + WINDOW - now) / 1000)));
      return sendJson(res, 429, { error: 'Too many requests. Please try again later.' });
    }
    times.push(now);
    res.setHeader('RateLimit-Limit', '10');
    res.setHeader('RateLimit-Remaining', String(10 - times.length));
    recent.set(ip, times);
    if (recent.size > 10000) for (const [key, list] of recent) if (now - list[list.length - 1] >= WINDOW) recent.delete(key);

    if (!(req.headers['content-type'] || '').toLowerCase().startsWith('application/json')) return sendJson(res, 415, { error: 'Please submit the form from the website.' });
    const raw = await readBody(req, 16000);
    if (raw === null) return sendJson(res, 413, { error: 'Your message is too long.' });
    let input;
    try { input = JSON.parse(raw); } catch { return sendJson(res, 400, { error: 'Please check the form and try again.' }); }
    if (!input || typeof input !== 'object' || Array.isArray(input)) return sendJson(res, 400, { error: 'Please check the form and try again.' });

    // Bots fill the hidden field; pretend success without saving.
    if (typeof input.website === 'string' && input.website.trim()) return sendJson(res, 201, { message: 'Thanks!' });

    const clean = {};
    for (const field of ['type', 'name', 'email', 'phone', 'location', 'interest', 'message', 'preferredDate', 'preferredTime']) {
      const value = input[field] === undefined ? '' : input[field];
      if (typeof value !== 'string' || value.trim().length > (field === 'message' ? 4000 : 200)) return sendJson(res, 400, { error: 'Please check the form fields and try again.' });
      clean[field] = value.trim();
    }
    const callback = clean.type === 'callback';
    if (callback) { clean.location ||= 'Not provided'; clean.interest ||= 'Free estimate callback'; }
    const validContact = callback ? clean.phone.replace(/\D/g, '').length >= 7 : /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean.email);
    if (!['project', 'work', 'question', 'callback'].includes(clean.type) || !clean.name || !clean.location || !clean.interest || !validContact || input.consent !== true) {
      return sendJson(res, 400, { error: 'Please complete the required fields and agree to the privacy policy.' });
    }
    if (clean.preferredDate && !/^\d{4}-\d{2}-\d{2}$/.test(clean.preferredDate)) return sendJson(res, 400, { error: 'Please choose a valid day.' });
    const visit = [clean.preferredDate, clean.preferredTime].filter(Boolean).join(', ');
    if (visit) clean.message = `Preferred visit: ${visit}${clean.message ? '\n\n' + clean.message : ''}`;
    delete clean.preferredDate; delete clean.preferredTime;
    clean.receivedAt = new Date().toISOString();
    const rawKey = String(req.headers['idempotency-key'] || input.idempotencyKey || '').trim();
    if (rawKey.length > 128) return sendJson(res, 400, { error: 'The idempotency key is invalid.' });
    const legacyFingerprint = crypto.createHash('sha256').update(JSON.stringify({ ...clean, receivedAt: undefined, marketing: input.marketing === true })).digest('hex');
    const idempotencyKey = rawKey || `legacy-${legacyFingerprint}`;
    try {
      persistLead(clean, input.marketing === true, idempotencyKey);
    } catch (error) {
      console.error('Unable to save submission:', error);
      return sendJson(res, 500, { error: 'We could not send your information right now. Please try again later.' });
    }
    await processLeadNotifications(idempotencyKey);
    return sendJson(res, 201, { message: 'Thanks for reaching out.' });
  }

  // Every contact-form email becomes (or updates) a customer record so the admin can follow up later.
  // Marketing mail only goes to people who ticked the opt-in box; everyone else starts opted out.
  function saveLead(c, optin) {
    const now = c.receivedAt, source = `website-${c.type}`;
    const note = [c.interest && `Interested in: ${c.interest}`, c.location && `Area: ${c.location}`].filter(Boolean).join('. ');
    const found = db.prepare('SELECT id, phone FROM customers WHERE email = ? COLLATE NOCASE').get(c.email);
    if (!found) {
      const linked = db.prepare('SELECT id FROM users WHERE email = ? COLLATE NOCASE').get(c.email);
      db.prepare("INSERT INTO customers (user_id, name, email, phone, address, status, notes, created_at, updated_at, marketing_optout, source, marketing_optin_at) VALUES (?, ?, ?, ?, '', 'lead', ?, ?, ?, ?, ?, ?)")
        .run(linked?.id ?? null, c.name, c.email, c.phone, note, now, now, optin ? 0 : 1, source, optin ? now : '');
      return;
    }
    db.prepare("UPDATE customers SET phone = CASE WHEN phone = '' THEN ? ELSE phone END, updated_at = ? WHERE id = ?").run(c.phone, now, found.id);
    if (optin) db.prepare('UPDATE customers SET marketing_optout = 0, marketing_optin_at = ? WHERE id = ?').run(now, found.id);
  }

  function persistLead(c, optin, key) {
    const existing = db.prepare('SELECT id FROM contacts WHERE idempotency_key = ?').get(key);
    if (existing) return;
    db.exec('BEGIN IMMEDIATE');
    try {
      const contact = db.prepare('INSERT INTO contacts (type, name, email, phone, location, interest, message, created_at, idempotency_key) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
        .run(c.type, c.name, c.email, c.phone, c.location, c.interest, c.message, c.receivedAt, key);
      const messages = [];
      if (c.email) { saveLead(c, optin); messages.push({ to: c.email, ...templates.leadConfirmation({ name: c.name, type: c.type }) }); }
      if (notifyEmail) messages.push({ to: notifyEmail, replyTo: c.email || undefined, ...templates.leadAlert({ submission: c }) });
      db.prepare('INSERT INTO notification_jobs (idempotency_key, contact_id, payload, created_at, updated_at) VALUES (?, ?, ?, ?, ?)')
        .run(key, Number(contact.lastInsertRowid), JSON.stringify(messages), c.receivedAt, c.receivedAt);
      db.exec('COMMIT');
    } catch (error) {
      try { db.exec('ROLLBACK'); } catch { /* transaction did not begin */ }
      throw error;
    }
  }

  async function processLeadNotifications(key) {
    const now = new Date().toISOString();
    const staleBefore = new Date(Date.now() - 2 * 60 * 1000).toISOString();
    const job = db.prepare("UPDATE notification_jobs SET status = 'processing', attempts = attempts + 1, updated_at = ? WHERE idempotency_key = ? AND (status IN ('pending', 'failed') OR (status = 'processing' AND updated_at < ?)) RETURNING *").get(now, key, staleBefore);
    if (!job) return;
    const sent = JSON.parse(job.sent_messages);
    let skipped = false;
    try {
      const messages = JSON.parse(job.payload);
      for (let index = 0; index < messages.length; index++) {
        if (sent.includes(index)) continue;
        const result = await mailer({ ...messages[index], idempotencyKey: `lead-${outboxId(key)}-${index}` });
        skipped = skipped || result?.skipped === true;
        sent.push(index);
        db.prepare('UPDATE notification_jobs SET sent_messages = ?, updated_at = ? WHERE id = ?').run(JSON.stringify(sent), new Date().toISOString(), job.id);
      }
      const now = new Date().toISOString();
      db.prepare("UPDATE notification_jobs SET status = ?, sent_at = ?, last_error = '', updated_at = ? WHERE id = ?")
        .run(skipped ? 'skipped' : 'sent', now, now, job.id);
    } catch (error) {
      console.error('Lead notification failed:', error.message);
      db.prepare("UPDATE notification_jobs SET status = 'failed', last_error = ?, updated_at = ? WHERE id = ?")
        .run(String(error.message || error).slice(0, 1000), new Date().toISOString(), job.id);
    }
  }

  async function serveFile(req, res, file, status = 200) {
    const [content, stat] = await Promise.all([fs.readFile(file), fs.stat(file)]);
    const ext = path.extname(file);
    const etag = `W/"${stat.size.toString(16)}-${Math.floor(stat.mtimeMs).toString(16)}"`;
    const cache = ext === '.html' || path.basename(file) === 'sw.js' ? 'no-cache' : file.includes(`${path.sep}vendor${path.sep}`) || /^v=[a-f0-9]{10}$/.test(new URL(req.url, 'http://x').search.slice(1)) ? 'public, max-age=31536000, immutable' : 'public, max-age=86400';
    const out = { ...headers, 'Content-Type': types[ext] || 'application/octet-stream', 'Cache-Control': cache, Vary: 'Accept-Encoding', ETag: etag };
    if (status === 200 && req.headers['if-none-match'] === etag) { res.writeHead(304, out); return res.end(); }
    let body = content;
    if (compressible.has(ext) && content.length > 512) {
      const accept = String(req.headers['accept-encoding'] || '');
      if (/\bbr\b/.test(accept)) { body = await brotli(content); out['Content-Encoding'] = 'br'; }
      else if (/\bgzip\b/.test(accept)) { body = await gzip(content); out['Content-Encoding'] = 'gzip'; }
    }
    out['Content-Length'] = body.length;
    res.writeHead(status, out);
    res.end(req.method === 'HEAD' ? undefined : body);
  }

  function reportServerError(req, error, kind) {
    console.error('Request failed:', error);
    req.errorLogged = true;
    let user = null; try { user = api.currentUser(req); } catch { /* session lookup failed too */ }
    return api.errors.record({ source: 'server', kind, error, url: req.url, method: req.method, status: 500, user, ip: api.clientIp(req), userAgent: req.headers['user-agent'] || '', context: { referer: req.headers.referer || '', host: req.headers.host || '', node: process.version, uptimeSec: Math.round(process.uptime()) } });
  }

  const server = http.createServer(async (req, res) => {
    for (const [k, v] of Object.entries(headers)) res.setHeader(k, v);
    if (process.env.LOG_REQUESTS === '1') res.on('finish', () => console.log(`${new Date().toISOString()} ${req.method} ${req.url.split('?')[0]} ${res.statusCode}`));
    // Handlers that answer 5xx themselves (without throwing) are still recorded.
    res.on('finish', () => {
      if (res.statusCode < 500 || req.errorLogged) return;
      const url = req.url.split('?')[0];
      api.errors.record({ source: 'server', kind: 'http_5xx', message: `${req.method} ${url} answered ${res.statusCode}`, url, method: req.method, status: res.statusCode, ip: api.clientIp(req), userAgent: req.headers['user-agent'] || '' });
    });
    try {
      let pathname;
      try { pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname); } catch { return sendJson(res, 400, { error: 'Bad request.' }); }
      if (pathname === '/healthz') return sendJson(res, 200, { status: 'ok' });
      if (pathname === '/api/submissions') {
        if (req.method !== 'POST') return sendJson(res, 405, { error: 'Method not allowed.' });
        return await submit(req, res);
      }
      if (await api.handle(req, res, pathname)) return;
      if ((req.method === 'GET' || req.method === 'HEAD') && pathname.startsWith('/media/') && await api.media(req, res, pathname)) return;
      if (req.method !== 'GET' && req.method !== 'HEAD') return sendJson(res, 405, { error: 'Method not allowed.' });
      if (pathname.includes('\0')) return sendJson(res, 400, { error: 'Bad request.' });
      const resolved = path.join(distDir, pathname);
      if (resolved !== distDir && !resolved.startsWith(distDir + path.sep)) return sendJson(res, 403, { error: 'Forbidden.' });
      try {
        const stat = await fs.stat(resolved);
        if (stat.isDirectory()) {
          if (!pathname.endsWith('/')) { res.writeHead(301, { ...headers, Location: pathname + '/' }); return res.end(); }
          return await serveFile(req, res, path.join(resolved, 'index.html'));
        }
        return await serveFile(req, res, resolved);
      } catch (error) {
        if (!['ENOENT', 'ENOTDIR', 'ENAMETOOLONG'].includes(error.code)) throw error;
        return await serveFile(req, res, path.join(distDir, '404.html'), 404);
      }
    } catch (error) {
      const id = reportServerError(req, error, 'request_failed');
      try {
        if (!res.headersSent) sendJson(res, 500, { error: 'Something went wrong. Please try again later.', reference: id || undefined });
        else if (!res.writableEnded) res.end();
      } catch { res.destroy(); }
    }
  });
  server.on('clientError', (error, socket) => { try { if (socket.writable) socket.end('HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n'); else socket.destroy(); } catch { /* socket already gone */ } });
  server.on('error', error => { api.errors.record({ source: 'server', kind: 'server_error', error }); console.error('Server error:', error); });
  server.errors = api.errors;
  server.tracking = api.tracking;
  server.company = api.company;
  server.zoho = api.zoho;
  const stopMonitor = api.tracking.startMonitor();
  const stopAlerts = api.jobAlerts.start();
  const stopHolidays = api.company.start();
  const stopZoho = api.zoho.start();
  server.on('close', () => { stopMonitor(); stopAlerts(); stopHolidays(); stopZoho(); db.close(); });
  if (siteUrl.startsWith('https://')) headers['Strict-Transport-Security'] = 'max-age=31536000; includeSubDomains';
  server.seoSync = api.seoSync;
  server.headersTimeout = 15000; server.requestTimeout = 120000; server.keepAliveTimeout = 5000; server.maxHeadersCount = 60;
  server.bookings = api.bookings;
  return server;
}

if (require.main === module) {
  let config;
  try {
    config = validateConfig(process.env, { warn: message => console.warn(`Configuration warning: ${message}`) });
  } catch (error) {
    console.error(`Configuration error: ${error.message}`);
    process.exitCode = 1;
  }
  if (!config) return;
  const server = createServer({ config }).listen(config.port, config.host || undefined, () => console.log(`Budget Bath Solutions running on ${config.siteUrl}`));
  // A stray error anywhere (timers, background jobs, unawaited promises) is logged instead of taking the site down.
  let recent = 0;
  const survive = kind => error => {
    server.errors.record({ source: 'process', kind, error: error instanceof Error ? error : new Error(String(error)), context: { node: process.version, uptimeSec: Math.round(process.uptime()) } });
    console.error(`${kind}:`, error);
    // A burst of fatal errors means the process is not healthy; exit and let systemd restart it.
    if (++recent > 50) process.exit(1);
  };
  setInterval(() => { recent = 0; }, 60000).unref();
  process.on('uncaughtException', survive('uncaught_exception'));
  process.on('unhandledRejection', survive('unhandled_rejection'));
  process.on('warning', w => { if (w.name !== 'ExperimentalWarning') server.errors.record({ source: 'process', kind: 'node_warning', level: 'warn', error: w }); });
  const stopSeo = server.seoSync.start();
  server.on('close', stopSeo);
  for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => { server.close(() => process.exit(0)); server.closeIdleConnections(); setTimeout(() => process.exit(1), 10000).unref(); });
}
module.exports = { createServer };
