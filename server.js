const http = require('node:http');
const path = require('node:path');
const fs = require('node:fs/promises');
const zlib = require('node:zlib');
const { promisify } = require('node:util');
const brotli = promisify(zlib.brotliCompress), gzip = promisify(zlib.gzip);
const compressible = new Set(['.html', '.css', '.js', '.svg', '.json', '.xml', '.txt']);
const { openDb } = require('./lib/db');
const { createMailer, createReceiver } = require('./lib/mailer');
const { createTemplates } = require('./lib/emails');
const { createGoogleCalendar } = require('./lib/gcal');
const { createApi } = require('./lib/api');

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

function createServer({
  dataDir = process.env.DATA_DIR || path.join(__dirname, 'data'),
  siteUrl = (process.env.SITE_URL || 'http://localhost:3000').replace(/\/$/, ''),
  mailer = createMailer(),
  notifyEmail = process.env.NOTIFY_EMAIL || '',
  adminEmails = (process.env.ADMIN_EMAILS || '').split(','),
  replyDomain = process.env.REPLY_DOMAIN || '',
  webhookSecret = process.env.RESEND_WEBHOOK_SECRET || '',
  receiver = process.env.RESEND_API_KEY ? createReceiver() : null,
  gcal = createGoogleCalendar(),
  trustProxy = process.env.TRUST_PROXY === '1'
} = {}) {
  const db = openDb(dataDir);
  const templates = createTemplates(siteUrl);
  const api = createApi({ db, dataDir, mailer, templates, siteUrl, notifyEmail, adminEmails, replyDomain, webhookSecret, receiver, gcal, trustProxy, secureCookies: siteUrl.startsWith('https://') });
  const recent = new Map();

  const sendJson = (res, status, body) => {
    res.writeHead(status, { ...headers, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify(body));
  };
  const mail = async message => { try { await mailer(message); } catch (error) { console.error('Email failed:', error.message); } };

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
    const ip = trustProxy ? (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket.remoteAddress : req.socket.remoteAddress;
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
    if (!['project', 'work', 'question'].includes(clean.type) || !clean.name || !clean.location || !clean.interest || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean.email) || input.consent !== true) {
      return sendJson(res, 400, { error: 'Please complete the required fields and agree to the privacy policy.' });
    }
    if (clean.preferredDate && !/^\d{4}-\d{2}-\d{2}$/.test(clean.preferredDate)) return sendJson(res, 400, { error: 'Please choose a valid day.' });
    const visit = [clean.preferredDate, clean.preferredTime].filter(Boolean).join(', ');
    if (visit) clean.message = `Preferred visit: ${visit}${clean.message ? '\n\n' + clean.message : ''}`;
    delete clean.preferredDate; delete clean.preferredTime;
    clean.receivedAt = new Date().toISOString();
    try {
      await fs.appendFile(path.join(dataDir, 'submissions.jsonl'), JSON.stringify(clean) + '\n', { mode: 0o600 });
    } catch (error) {
      console.error('Unable to save submission:', error);
      return sendJson(res, 500, { error: 'We could not send your information right now. Please try again later.' });
    }
    db.prepare('INSERT INTO contacts (type, name, email, phone, location, interest, message, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(clean.type, clean.name, clean.email, clean.phone, clean.location, clean.interest, clean.message, clean.receivedAt);
    saveLead(clean, input.marketing === true);
    await mail({ to: clean.email, ...templates.leadConfirmation({ name: clean.name, type: clean.type }) });
    if (notifyEmail) await mail({ to: notifyEmail, replyTo: clean.email, ...templates.leadAlert({ submission: clean }) });
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

  const server = http.createServer(async (req, res) => {
    for (const [k, v] of Object.entries(headers)) res.setHeader(k, v);
    if (process.env.LOG_REQUESTS === '1') res.on('finish', () => console.log(`${new Date().toISOString()} ${req.method} ${req.url.split('?')[0]} ${res.statusCode}`));
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
        if (error.code !== 'ENOENT' && error.code !== 'ENOTDIR') throw error;
        return await serveFile(req, res, path.join(distDir, '404.html'), 404);
      }
    } catch (error) {
      console.error('Request failed:', error);
      if (!res.headersSent) sendJson(res, 500, { error: 'Something went wrong. Please try again later.' });
    }
  });
  server.tracking = api.tracking;
  server.company = api.company;
  server.zoho = api.zoho;
  const stopMonitor = api.tracking.startMonitor();
  const stopHolidays = api.company.start();
  const stopZoho = api.zoho.start();
  server.on('close', () => { stopMonitor(); stopHolidays(); stopZoho(); db.close(); });
  if (siteUrl.startsWith('https://')) headers['Strict-Transport-Security'] = 'max-age=31536000; includeSubDomains';
  server.seoSync = api.seoSync;
  server.headersTimeout = 15000; server.requestTimeout = 120000; server.keepAliveTimeout = 5000; server.maxHeadersCount = 60;
  server.bookings = api.bookings;
  return server;
}

if (require.main === module) {
  const port = Number(process.env.PORT || 3000);
  const server = createServer().listen(port, () => console.log(`Budget Bath Solutions running on http://localhost:${port}`));
  const stopSeo = server.seoSync.start();
  server.on('close', stopSeo);
  for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => { server.close(() => process.exit(0)); server.closeIdleConnections(); setTimeout(() => process.exit(1), 10000).unref(); });
}
module.exports = { createServer };
