const crypto = require('node:crypto');
const path = require('node:path');
const fs = require('node:fs/promises');
const { sha256, randomToken, hashPassword, verifyPassword } = require('./auth');
const { createCms } = require('./cms');
const { createAppointments } = require('./appointments');
const { createGoogleCalendar } = require('./gcal');
const { createCustomers } = require('./customers');
const { createStaff } = require('./staff');
const { createTracking } = require('./tracking');
const { createFieldwork } = require('./fieldwork');
const { createToolPhotos } = require('./tool-photos');
const { createOnboarding } = require('./onboarding');
const { createBookings } = require('./bookings');
const { createAccounting } = require('./accounting');
const { createCompany } = require('./company');
const { createZoho } = require('./zoho');
const { createSeoSync } = require('./seo-sync');
const { createSecurity } = require('./security');
const { createEstimates } = require('./estimates');

const DAY = 24 * 60 * 60 * 1000;
const SESSION_DAYS = 14;
const MAX_PHOTO_BYTES = 8 * 1024 * 1024;
const MAX_PHOTOS_PER_MESSAGE = 10;
const MAX_PHOTOS_PER_REQUEST = 60;
const MAX_VIDEO_BYTES = 100 * 1024 * 1024;
const MAX_VIDEOS_PER_REQUEST = 10;
const PRIORITIES = { low: 'Low', normal: 'Normal', high: 'High', urgent: 'Urgent' };
const CATEGORIES = ['Measurements & layout', 'Existing damage or leaks', 'Inspiration & style', 'Fixtures & materials', 'Accessibility needs', 'Scheduling', 'Other'];
const STATUSES = { draft: 'Draft', submitted: 'Open', in_progress: 'In progress', awaiting_customer: 'Awaiting your reply', resolved: 'Resolved', closed: 'Closed' };
const REPLY_MARKER = '--- Reply above this line ---';
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Identify images and videos by content, never by the client's claimed type.
function detectImage(buf) {
  if (buf.length > 12 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return ['image/jpeg', '.jpg'];
  if (buf.length > 12 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return ['image/png', '.png'];
  if (buf.length > 12 && buf.subarray(0, 4).toString('latin1') === 'RIFF' && buf.subarray(8, 12).toString('latin1') === 'WEBP') return ['image/webp', '.webp'];
  if (buf.length > 12 && buf.subarray(4, 8).toString('latin1') === 'ftyp') return buf.subarray(8, 12).toString('latin1') === 'qt  ' ? ['video/quicktime', '.mov', 'video'] : ['video/mp4', '.mp4', 'video'];
  if (buf.length > 12 && buf[0] === 0x1a && buf[1] === 0x45 && buf[2] === 0xdf && buf[3] === 0xa3) return ['video/webm', '.webm', 'video'];
  return null;
}

// Reduce an inbound email to just the new text: drop quoted history, signatures separators and our reply marker.
function stripQuoted(raw) {
  const lines = String(raw || '').replace(/\r\n?/g, '\n').split('\n');
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    const wrote = line.startsWith('On ') && [line, `${line} ${(lines[i + 1] || '').trim()}`, `${line} ${(lines[i + 1] || '').trim()} ${(lines[i + 2] || '').trim()}`].some(candidate => /wrote:\s*$/.test(candidate));
    if (line === REPLY_MARKER || wrote || /^-+\s*(Original Message|Forwarded message)\s*-+$/i.test(line) || /^_{10,}$/.test(line) || (/^From:\s/.test(line) && /^(Sent|Date):\s/.test((lines[i + 1] || '').trim())) || line.startsWith('>')) break;
    out.push(lines[i]);
  }
  return out.join('\n').trim();
}
function htmlToText(html) {
  return String(html || '').replace(/<(style|script)[\s\S]*?<\/\1>/gi, '').replace(/<br\s*\/?>|<\/(p|div|tr|li|h\d)>/gi, '\n').replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&').replace(/\n{3,}/g, '\n\n').trim();
}

function createApi({ db, dataDir, mailer, templates, siteUrl, notifyEmail = '', adminEmails = [], replyDomain = '', webhookSecret = '', receiver = null, gcal = createGoogleCalendar(), trustProxy = false, secureCookies = false }) {
  const hits = new Map();
  const admins = new Set(adminEmails.map(e => e.trim().toLowerCase()).filter(Boolean));
  const q = sql => db.prepare(sql);
  const staffEmails = new Set([...admins, notifyEmail.trim().toLowerCase()].filter(Boolean));
  let ticketSecret = q("SELECT value FROM settings WHERE key = 'ticket_secret'").get()?.value;
  if (!ticketSecret) { ticketSecret = randomToken(); q("INSERT INTO settings (key, value) VALUES ('ticket_secret', ?)").run(ticketSecret); }
  const ticketSig = id => crypto.createHmac('sha256', ticketSecret).update(`ticket:${id}`).digest('hex').slice(0, 16);
  const ticketAddress = id => replyDomain ? `ticket-${id}-${ticketSig(id)}@${replyDomain}` : '';
  const ticketId = address => {
    const m = String(address).toLowerCase().match(/(?:^|<)ticket-(\d+)-([a-f0-9]{16})@/);
    if (!m) return null;
    const expected = Buffer.from(ticketSig(m[1])), given = Buffer.from(m[2]);
    return given.length === expected.length && crypto.timingSafeEqual(given, expected) ? Number(m[1]) : null;
  };
  const nowIso = () => new Date().toISOString();

  const json = (res, status, body, headers = {}) => {
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers });
    res.end(JSON.stringify(body));
  };
  const fail = (res, status, error) => json(res, status, { error });

  function limited(req, bucket, max, windowMs = 10 * 60 * 1000) {
    const ip = trustProxy ? (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket.remoteAddress : req.socket.remoteAddress;
    const key = `${bucket}:${ip}`;
    const now = Date.now();
    const list = (hits.get(key) || []).filter(t => now - t < windowMs);
    list.push(now);
    hits.set(key, list);
    if (hits.size > 20000) for (const [k, v] of hits) if (now - v[v.length - 1] >= windowMs) hits.delete(k);
    return list.length > max;
  }

  async function readBuffer(req, limit) {
    const chunks = [];
    let size = 0;
    for await (const chunk of req) {
      size += chunk.length;
      if (size > limit) return null;
      chunks.push(chunk);
    }
    return Buffer.concat(chunks);
  }
  async function readJson(req, limit = 16000) {
    const buf = await readBuffer(req, limit);
    if (buf === null) return { error: 'too-large' };
    try {
      const body = JSON.parse(buf.toString('utf8') || '{}');
      return body && typeof body === 'object' && !Array.isArray(body) ? { body } : { error: 'invalid' };
    } catch { return { error: 'invalid' }; }
  }
  const text = (value, max) => typeof value === 'string' && value.trim().length <= max ? value.trim() : null;

  function cookie(req, name) {
    for (const part of (req.headers.cookie || '').split(';')) {
      const [k, ...rest] = part.trim().split('=');
      if (k === name) return rest.join('=');
    }
    return '';
  }
  const sessionCookie = (value, maxAge) => `bbs_session=${value}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAge}${secureCookies ? '; Secure' : ''}`;
  function currentUser(req) {
    const token = cookie(req, 'bbs_session');
    if (!token) return null;
    const row = q('SELECT u.*, s.expires_at FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ?').get(sha256(token));
    if (!row) return null;
    if (row.expires_at < Date.now()) { q('DELETE FROM sessions WHERE token_hash = ?').run(sha256(token)); return null; }
    return row;
  }
  const isAdmin = user => Boolean(user && user.verified && admins.has(user.email.toLowerCase()));
  const cms = createCms({ db, dataDir, json, fail, readBuffer, readJson, currentUser, isAdmin, limited, text, trustProxy });
  const customers = createCustomers({ db, dataDir, mailer, templates, json, fail, readBuffer, readJson, currentUser, isAdmin, limited, text });
  const security = createSecurity({ db });
  security.purge();
  const clientIpOf = req => trustProxy ? (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket.remoteAddress : req.socket.remoteAddress;
  const tracking = createTracking({ db, security, trustProxy, mailer, templates, notifyEmail, siteUrl, retentionDays: Number(process.env.LOCATION_RETENTION_DAYS) || 400, json, fail, readJson, currentUser, isAdmin, limited, text });
  const estimates = createEstimates({ tracking, db, mailer, templates, siteUrl, notifyEmail, trustProxy, json, fail, readBuffer, readJson, currentUser, isAdmin, limited, text });
  const accounting = createAccounting({ db, dataDir, estimates, json, fail, readBuffer, readJson, currentUser, isAdmin, limited, text });
  const company = createCompany({ db, mailer, templates, siteUrl, notifyEmail, estimates, json, fail, readJson, currentUser, isAdmin, text });
  const seoSync = createSeoSync({ json, fail, currentUser, isAdmin });
  const zoho = createZoho({ db, siteUrl, estimates, json, fail, readJson, currentUser, isAdmin, text });
  const onboarding = createOnboarding({ db, mailer, templates, siteUrl, notifyEmail, clientIp: clientIpOf, json, fail, readJson, currentUser, isAdmin, limited });
  const toolPhotos = createToolPhotos({ db, dataDir, json, fail, readBuffer, currentUser, isAdmin, limited });
  const fieldwork = createFieldwork({ db, dataDir, mailer, templates, siteUrl, notifyEmail, json, fail, readBuffer, readJson, currentUser, isAdmin, limited, text });
  const staff = createStaff({ db, dataDir, mailer, templates, siteUrl, notifyEmail, json, fail, readBuffer, readJson, currentUser, isAdmin, limited, text, issueToken, hashPassword, randomToken });
  const publicUser = user => ({ id: user.id, name: user.name, email: user.email, phone: user.phone, verified: Boolean(user.verified), admin: isAdmin(user), notifyEmail: Boolean(user.notify_email), lang: user.lang === 'es' ? 'es' : 'en' });

  async function startSession(res, userId) {
    const token = randomToken();
    q('DELETE FROM sessions WHERE expires_at < ?').run(Date.now());
    q('DELETE FROM sessions WHERE user_id = ? AND token_hash NOT IN (SELECT token_hash FROM sessions WHERE user_id = ? ORDER BY expires_at DESC LIMIT 9)').run(userId, userId);
    q('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)').run(sha256(token), userId, Date.now() + SESSION_DAYS * DAY);
    return sessionCookie(token, SESSION_DAYS * 86400);
  }
  function issueToken(userId, type, ttl) {
    const token = randomToken();
    q('DELETE FROM tokens WHERE user_id = ? AND type = ?').run(userId, type);
    q('INSERT INTO tokens (token_hash, user_id, type, expires_at) VALUES (?, ?, ?, ?)').run(sha256(token), userId, type, Date.now() + ttl);
    return token;
  }
  function consumeToken(token, type) {
    if (typeof token !== 'string' || !token) return null;
    const row = q('SELECT * FROM tokens WHERE token_hash = ? AND type = ?').get(sha256(token), type);
    if (!row) return null;
    q('DELETE FROM tokens WHERE token_hash = ?').run(row.token_hash);
    return row.expires_at >= Date.now() ? q('SELECT * FROM users WHERE id = ?').get(row.user_id) : null;
  }
  async function mail(message) {
    try { await mailer(message); } catch (error) { console.error('Email failed:', error.message); }
  }
  const sendVerification = async user => mail({ to: user.email, ...templates.verifyEmail({ name: user.name, lang: user.lang, url: `${siteUrl}/account/verify/?token=${issueToken(user.id, 'verify', DAY)}` }) });

  const photosOf = id => q('SELECT * FROM photos WHERE request_id = ? ORDER BY created_at, rowid').all(id);
  const photoView = p => ({ id: p.id, name: p.original_name, caption: p.caption, kind: p.kind || 'image', mime: p.mime, size: p.size });
  const videosOf = id => q("SELECT COUNT(*) AS n FROM photos WHERE request_id = ? AND kind = 'video'").get(id).n;
  const unreadFor = (r, staff) => {
    const lastRole = r.last_author_role || (r.submitted_at ? 'customer' : '');
    const last = r.last_message_at || r.submitted_at;
    const readAt = staff ? r.staff_read_at : r.customer_read_at;
    return Boolean(last) && lastRole === (staff ? 'customer' : 'staff') && (!readAt || readAt < last);
  };
  const ticketBase = r => ({ id: r.id, title: r.title, projectType: r.project_type, location: r.location, status: r.status, statusLabel: STATUSES[r.status] || r.status, createdAt: r.created_at, submittedAt: r.submitted_at, priority: r.priority || 'normal', priorityLabel: PRIORITIES[r.priority] || 'Normal', category: r.category || '' });
  function ticketView(r, staff) {
    const photos = photosOf(r.id);
    const messages = q('SELECT * FROM messages WHERE request_id = ? ORDER BY id').all(r.id).filter(m => staff || !m.internal);
    return {
      ...ticketBase(r), appointments: q('SELECT uid, starts_at, duration_min, kind, location, status FROM appointments WHERE request_id = ? ORDER BY starts_at').all(r.id).map(a => ({ uid: a.uid, startsAt: a.starts_at, durationMin: a.duration_min, kind: a.kind, location: a.location, status: a.status })), timeline: r.timeline, budget: r.budget, description: r.description, lastMessageAt: r.last_message_at,
      photos: photos.filter(p => !p.message_id && p.user_id === r.user_id).map(photoView),
      messages: messages.map(m => ({ id: m.id, role: m.role, kind: m.kind, internal: Boolean(m.internal), authorName: m.author_name, body: m.body, source: m.source, createdAt: m.created_at, photos: photos.filter(p => p.message_id === m.id).map(photoView) }))
    };
  }
  const ticketUrl = id => `${siteUrl}/account/request/?id=${id}`;
  const canAccess = (user, r) => r && (r.user_id === user.id || isAdmin(user));
  const appointments = createAppointments({ db, mailer, templates, siteUrl, notifyEmail, staffEmails, gcal, json, fail, text, isAdmin, canAccess, ticketUrl, randomToken, extraEvents: () => bookings.feedEvents() });
  const sitePhone = process.env.BUSINESS_PHONE || (() => { try { return require('../site.json').phone || ''; } catch { return ''; } })();
  const bookings = createBookings({ db, mailer, templates, siteUrl, notifyEmail, gcal, phone: sitePhone, json, fail, readJson, currentUser, isAdmin, limited, text, randomToken, sha256 });

  async function storePhoto({ request, userId, data, name, caption }) {
    const kind = detectImage(data);
    if (!kind) return null;
    const type = kind[2] || 'image';
    if (type === 'image' && data.length > MAX_PHOTO_BYTES) return 'too-large';
    if (type === 'video' && videosOf(request.id) >= MAX_VIDEOS_PER_REQUEST) return 'too-many-videos';
    const id = crypto.randomBytes(16).toString('hex');
    await fs.writeFile(path.join(dataDir, 'uploads', id + kind[1]), data, { mode: 0o600 });
    q('INSERT INTO photos (id, request_id, user_id, file, mime, size, original_name, caption, kind, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(id, request.id, userId, id + kind[1], kind[0], data.length, name, caption, type, nowIso());
    return id;
  }
  const cleanName = raw => { try { return decodeURIComponent(String(raw || '')).replace(/[^\w .()-]/g, '').slice(0, 100) || 'photo'; } catch { return 'photo'; } };

  // Adds a message to a ticket, applies status rules and sends the notifications.
  // author: { id, name } or null; role: 'customer' | 'staff'.
  async function addMessage({ request, author, role, body, source = 'web', emailId = null, internal = false, photoIds = [], status = null }) {
    const customer = q('SELECT * FROM users WHERE id = ?').get(request.user_id);
    const staff = role === 'staff';
    const at = nowIso();
    const info = q('INSERT INTO messages (request_id, author_id, author_name, role, internal, body, source, email_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').run(request.id, author?.id ?? null, author?.name || (staff ? 'Budget Bath Solutions' : customer.name), role, internal ? 1 : 0, body, source, emailId, at);
    const messageId = Number(info.lastInsertRowid);
    for (const id of photoIds) q('UPDATE photos SET message_id = ? WHERE id = ?').run(messageId, id);
    if (internal) return messageId;

    let next = request.status;
    if (staff && status && STATUSES[status] && status !== 'draft') next = status;
    else if (staff && request.status === 'submitted') next = 'awaiting_customer';
    else if (!staff && ['awaiting_customer', 'resolved', 'closed'].includes(request.status)) next = 'submitted';
    q('UPDATE requests SET status = ?, last_message_at = ?, last_author_role = ?, ' + (staff ? 'staff_read_at' : 'customer_read_at') + ' = ? WHERE id = ?').run(next, at, role, at, request.id);
    if (next !== request.status) q("INSERT INTO messages (request_id, role, kind, body, created_at) VALUES (?, 'system', 'status', ?, ?)").run(request.id, `Status changed to ${STATUSES[next]}`, at);

    const photoCount = photoIds.length;
    const fresh = { ...request, status: next };
    if (staff) {
      if (customer.notify_email) await mail({ to: customer.email, replyTo: ticketAddress(request.id) || undefined, headers: threadHeaders(request.id), ...templates.ticketMessage({ audience: 'customer', recipientName: customer.name, authorName: author?.name || 'Budget Bath Solutions', request: fresh, body, photoCount, url: ticketUrl(request.id), canReply: Boolean(replyDomain) }) });
    } else {
      for (const to of staffEmails) await mail({ to, replyTo: ticketAddress(request.id) || customer.email, headers: threadHeaders(request.id), ...templates.ticketMessage({ audience: 'staff', authorName: customer.name, request: fresh, body, photoCount, url: ticketUrl(request.id), canReply: Boolean(replyDomain) }) });
    }
    return messageId;
  }
  const threadHeaders = id => ({ 'In-Reply-To': `<ticket-${id}@${new URL(siteUrl).hostname}>`, References: `<ticket-${id}@${new URL(siteUrl).hostname}>` });

  async function receiveEmail(data) {
    if (!receiver) return 'no-receiver';
    const id = [...(data.to || []), ...(data.received_for || [])].map(ticketId).find(Boolean);
    if (!id) return 'no-ticket';
    if (q('SELECT 1 FROM messages WHERE email_id = ?').get(data.email_id)) return 'duplicate';
    const request = q("SELECT * FROM requests WHERE id = ? AND status != 'draft'").get(id);
    if (!request) return 'unknown-ticket';
    const sender = String(data.from || '').toLowerCase().match(/[^\s<>"]+@[^\s<>"]+/)?.[0] || '';
    const customer = q('SELECT * FROM users WHERE id = ?').get(request.user_id);
    const role = sender === customer.email.toLowerCase() ? 'customer' : staffEmails.has(sender) ? 'staff' : null;
    if (!role) return 'unknown-sender';
    const email = await receiver.getEmail(data.email_id);
    const body = stripQuoted(email.text || htmlToText(email.html)).slice(0, 4000);
    const photoIds = [];
    const author = role === 'staff' ? (q('SELECT * FROM users WHERE email = ?').get(sender) || { id: null, name: 'Budget Bath Solutions' }) : customer;
    for (const att of data.attachments || []) {
      if (photoIds.length >= MAX_PHOTOS_PER_MESSAGE || photosOf(request.id).length >= MAX_PHOTOS_PER_REQUEST) break;
      if (!/^image\/(jpeg|png|webp)$/.test(att.content_type || '')) continue;
      try {
        const file = await receiver.getAttachment(data.email_id, att.id);
        if (file.length > MAX_PHOTO_BYTES || (att.content_disposition === 'inline' && file.length < 10000)) continue;
        const photo = await storePhoto({ request, userId: author.id ?? customer.id, data: file, name: cleanName(att.filename), caption: '' });
        if (photo && !photo.startsWith?.('too-')) photoIds.push(photo);
      } catch (error) { console.error('Inbound attachment failed:', error.message); }
    }
    if (!body && !photoIds.length) return 'empty';
    await addMessage({ request, author: { id: author.id, name: author.name }, role, body: body || '(photos attached)', source: 'email', emailId: data.email_id, photoIds });
    return 'ok';
  }
  function verifyWebhook(req, raw) {
    if (!webhookSecret) return false;
    const id = req.headers['svix-id'], ts = req.headers['svix-timestamp'], sigs = String(req.headers['svix-signature'] || '');
    if (!id || !ts || Math.abs(Date.now() / 1000 - Number(ts)) > 300) return false;
    const key = Buffer.from(webhookSecret.replace(/^whsec_/, ''), 'base64');
    const expected = crypto.createHmac('sha256', key).update(`${id}.${ts}.${raw}`).digest();
    return sigs.split(' ').some(part => {
      const given = Buffer.from(part.split(',')[1] || '', 'base64');
      return given.length === expected.length && crypto.timingSafeEqual(given, expected);
    });
  }

  async function handle(req, res, pathname) {
    if (!pathname.startsWith('/api/') || pathname === '/api/submissions') return false;
    const method = req.method;

    if (method === 'GET' && pathname === '/api/calendar/feed.ics') return appointments.feed(req, res, new URL(req.url, 'http://localhost'));

    if (method === 'POST' && pathname === '/api/webhooks/resend') {
      const raw = await readBuffer(req, 1024 * 1024);
      if (raw === null || !verifyWebhook(req, raw.toString('utf8'))) { fail(res, 401, 'Invalid signature.'); return true; }
      try {
        const event = JSON.parse(raw.toString('utf8'));
        const result = event.type === 'email.received' ? await receiveEmail(event.data || {}) : 'ignored';
        json(res, 200, { result });
      } catch (error) { console.error('Inbound email failed:', error.message); fail(res, 500, 'Could not process.'); }
      return true;
    }

    if (method !== 'GET' && method !== 'HEAD') {
      const origin = req.headers.origin;
      if (req.headers['sec-fetch-site'] === 'cross-site') { fail(res, 403, 'Cross-site requests are not allowed.'); return true; }
      if (origin) {
        let ok = false;
        try { ok = new URL(origin).host === req.headers.host; } catch { /* invalid origin */ }
        if (!ok) { fail(res, 403, 'Cross-site requests are not allowed.'); return true; }
      }
    }

    // Photo files: owner or admin only.
    let m = pathname.match(/^\/api\/photos\/([a-f0-9]{32})$/);
    if (m && method === 'GET') {
      const user = currentUser(req);
      const photo = user && q('SELECT p.*, r.user_id AS owner_id FROM photos p JOIN requests r ON r.id = p.request_id WHERE p.id = ?').get(m[1]);
      if (!photo || (photo.owner_id !== user.id && !isAdmin(user))) { fail(res, 404, 'Not found.'); return true; }
      try {
        const data = await fs.readFile(path.join(dataDir, 'uploads', photo.file));
        const base = { 'Content-Type': photo.mime, 'Cache-Control': 'private, max-age=3600', 'Content-Disposition': 'inline', 'X-Content-Type-Options': 'nosniff', 'Accept-Ranges': 'bytes' };
        const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || '');
        if (range && (range[1] || range[2])) {
          let start = range[1] ? Number(range[1]) : Math.max(data.length - Number(range[2]), 0);
          const end = range[1] && range[2] ? Math.min(Number(range[2]), data.length - 1) : data.length - 1;
          if (start > end || start >= data.length) { res.writeHead(416, { ...base, 'Content-Range': `bytes */${data.length}` }); res.end(); return true; }
          res.writeHead(206, { ...base, 'Content-Range': `bytes ${start}-${end}/${data.length}`, 'Content-Length': end - start + 1 });
          res.end(data.subarray(start, end + 1));
          return true;
        }
        res.writeHead(200, { ...base, 'Content-Length': data.length });
        res.end(data);
      } catch { fail(res, 404, 'Not found.'); }
      return true;
    }

    // Binary uploads are handled before JSON parsing.
    m = pathname.match(/^\/api\/requests\/(\d+)\/photos$/);
    if (m && method === 'POST') {
      const user = currentUser(req);
      if (!user) { fail(res, 401, 'Please sign in.'); return true; }
      if (!user.verified) { fail(res, 403, 'Please confirm your email first.'); return true; }
      if (limited(req, 'upload', 60)) { fail(res, 429, 'Too many uploads. Please try again later.'); return true; }
      const request = q('SELECT * FROM requests WHERE id = ?').get(Number(m[1]));
      if (!canAccess(user, request)) { fail(res, 404, 'Request not found.'); return true; }
      if (photosOf(request.id).length >= MAX_PHOTOS_PER_REQUEST) { fail(res, 400, `This request has reached its limit of ${MAX_PHOTOS_PER_REQUEST} photos.`); return true; }
      const data = await readBuffer(req, MAX_VIDEO_BYTES);
      if (data === null) { fail(res, 413, 'Videos must be 100 MB or smaller and photos 8 MB or smaller.'); return true; }
      let caption = '';
      try { caption = decodeURIComponent(String(req.headers['x-caption'] || '')).trim().slice(0, 300); } catch { /* ignore bad caption */ }
      const id = await storePhoto({ request, userId: user.id, data, name: cleanName(req.headers['x-filename']), caption });
      if (id === 'too-large') { fail(res, 413, 'Each photo must be 8 MB or smaller.'); return true; }
      if (id === 'too-many-videos') { fail(res, 400, `This request has reached its limit of ${MAX_VIDEOS_PER_REQUEST} videos.`); return true; }
      if (!id) { fail(res, 415, 'Please upload a JPG, PNG or WebP image, or an MP4, MOV or WebM video.'); return true; }
      json(res, 201, { id });
      return true;
    }

    if (await customers.handle(req, res, pathname, method)) return true;
    if (await tracking.handle(req, res, pathname, method)) return true;
    if (await accounting.handle(req, res, pathname, method)) return true;
    if (await company.handle(req, res, pathname, method)) return true;
    if (await zoho.handle(req, res, pathname, method)) return true;
    if (await seoSync.handle(req, res, pathname, method)) return true;
    if (await security.handle(req, res, pathname, method, { json, fail, currentUser, isAdmin })) return true;
    if (await fieldwork.handle(req, res, pathname, method)) return true;
    if (await bookings.handle(req, res, pathname, method)) return true;
    if (await toolPhotos.handle(req, res, pathname, method)) return true;
    if (await onboarding.handle(req, res, pathname, method)) return true;
    if (await staff.handle(req, res, pathname, method)) return true;
    if (await estimates.handle(req, res, pathname, method)) return true;
    if (await cms.handle(req, res, pathname, method)) return true;

    const parsed = method === 'POST' ? await readJson(req) : { body: {} };
    if (parsed.error) { fail(res, parsed.error === 'too-large' ? 413 : 400, 'Please check the form and try again.'); return true; }
    if (method === 'POST' && !(req.headers['content-type'] || '').toLowerCase().startsWith('application/json')) { fail(res, 415, 'Please submit from the website.'); return true; }
    const body = parsed.body;

    switch (`${method} ${pathname}`) {
      case 'POST /api/auth/register': {
        if (limited(req, 'auth', 20)) return fail(res, 429, 'Too many attempts. Please try again later.'), true;
        const name = text(body.name, 100), email = text(body.email, 200)?.toLowerCase(), phone = text(body.phone ?? '', 40), password = body.password;
        if (!name || !email || !EMAIL_RE.test(email) || phone === null) return fail(res, 400, 'Please enter your name and a valid email.'), true;
        if (typeof password !== 'string' || password.length < 10 || password.length > 200) return fail(res, 400, 'Choose a password of at least 10 characters.'), true;
        if (body.consent !== true) return fail(res, 400, 'Please agree to the Privacy Policy and Terms.'), true;
        const lang = body.lang === 'es' ? 'es' : 'en', existing = q('SELECT * FROM users WHERE email = ?').get(email);
        if (existing) await mail({ to: email, ...templates.accountExists({ lang: existing.lang === 'es' ? 'es' : lang, name: existing.name, loginUrl: `${siteUrl}/account/login/`, resetUrl: `${siteUrl}/account/forgot-password/` }) });
        else {
          const info = q('INSERT INTO users (email, name, phone, password_hash, created_at, lang) VALUES (?, ?, ?, ?, ?, ?)').run(email, name, phone, await hashPassword(password), new Date().toISOString(), lang);
          await sendVerification({ id: Number(info.lastInsertRowid), email, name, lang });
        }
        return json(res, 201, { message: 'Almost done! Check your email for a link to confirm your account.' }), true;
      }
      case 'POST /api/auth/login': {
        if (limited(req, 'auth', 20)) return fail(res, 429, 'Too many attempts. Please try again later.'), true;
        const email = text(body.email, 200)?.toLowerCase();
        const user = email && q('SELECT * FROM users WHERE email = ?').get(email);
        const wait = security.lockedFor(email);
        if (wait) return json(res, 429, { error: 'Too many failed sign-ins. Try again in a few minutes or reset your password.' }, { 'Retry-After': String(Math.ceil(wait / 1000)) }), true;
        const ok = await verifyPassword(typeof body.password === 'string' ? body.password.slice(0, 200) : '', user?.password_hash);
        if (!user || !ok) {
          security.log('login_failed', { severity: 'warn', email, ip: clientIpOf(req), userId: user?.id });
          return fail(res, 401, 'Incorrect email or password.'), true;
        }
        security.log('login_ok', { email, ip: clientIpOf(req), userId: user.id });
        return json(res, 200, { user: publicUser(user) }, { 'Set-Cookie': await startSession(res, user.id) }), true;
      }
      case 'POST /api/auth/logout': {
        const token = cookie(req, 'bbs_session');
        if (token) q('DELETE FROM sessions WHERE token_hash = ?').run(sha256(token));
        return json(res, 200, { ok: true }, { 'Set-Cookie': sessionCookie('', 0) }), true;
      }
      case 'GET /api/auth/me': {
        const user = currentUser(req);
        return user ? json(res, 200, { user: publicUser(user) }) : fail(res, 401, 'Please sign in.'), true;
      }
      case 'POST /api/auth/verify': {
        if (limited(req, 'auth', 30)) return fail(res, 429, 'Too many attempts. Please try again later.'), true;
        const user = consumeToken(body.token, 'verify');
        if (!user) return fail(res, 400, 'This confirmation link is invalid or has expired. Sign in to request a new one.'), true;
        const first = !user.verified;
        q('UPDATE users SET verified = 1 WHERE id = ?').run(user.id);
        if (first) await mail({ to: user.email, ...templates.welcome({ lang: user.lang, name: user.name, dashboardUrl: `${siteUrl}/account/` }) });
        return json(res, 200, { message: 'Your email is confirmed. You can now sign in and send us your project.' }), true;
      }
      case 'POST /api/auth/resend-verification': {
        const user = currentUser(req);
        if (!user) return fail(res, 401, 'Please sign in.'), true;
        if (limited(req, 'resend', 5)) return fail(res, 429, 'Please wait a few minutes before requesting another email.'), true;
        if (!user.verified) await sendVerification(user);
        return json(res, 200, { message: 'Confirmation email sent.' }), true;
      }
      case 'POST /api/auth/preferences': {
        const user = currentUser(req);
        if (!user) return fail(res, 401, 'Please sign in.'), true;
        if (typeof body.notifyEmail === 'boolean') q('UPDATE users SET notify_email = ? WHERE id = ?').run(body.notifyEmail ? 1 : 0, user.id);
        if (body.lang === 'en' || body.lang === 'es') q('UPDATE users SET lang = ? WHERE id = ?').run(body.lang, user.id);
        const fresh = q('SELECT notify_email, lang FROM users WHERE id = ?').get(user.id);
        return json(res, 200, { notifyEmail: Boolean(fresh.notify_email), lang: fresh.lang }), true;
      }
      case 'POST /api/auth/forgot': {
        if (limited(req, 'forgot', 10)) return fail(res, 429, 'Too many attempts. Please try again later.'), true;
        const email = text(body.email, 200)?.toLowerCase();
        const user = email && q('SELECT * FROM users WHERE email = ?').get(email);
        if (user) await mail({ to: user.email, ...templates.passwordReset({ lang: user.lang === 'es' || body.lang === 'es' ? 'es' : 'en', name: user.name, url: `${siteUrl}/account/reset-password/?token=${issueToken(user.id, 'reset', 60 * 60 * 1000)}` }) });
        return json(res, 200, { message: 'If that email has an account, we sent a link to reset the password.' }), true;
      }
      case 'POST /api/auth/reset': {
        if (limited(req, 'auth', 20)) return fail(res, 429, 'Too many attempts. Please try again later.'), true;
        if (typeof body.password !== 'string' || body.password.length < 10 || body.password.length > 200) return fail(res, 400, 'Choose a password of at least 10 characters.'), true;
        const user = consumeToken(body.token, 'reset');
        if (!user) return fail(res, 400, 'This reset link is invalid or has expired. Please request a new one.'), true;
        q('UPDATE users SET password_hash = ?, verified = 1 WHERE id = ?').run(await hashPassword(body.password), user.id);
        q('DELETE FROM sessions WHERE user_id = ?').run(user.id);
        await mail({ to: user.email, ...templates.passwordChanged({ lang: user.lang, name: user.name, loginUrl: `${siteUrl}/account/login/` }) });
        return json(res, 200, { message: 'Your password was updated. You can sign in now.' }), true;
      }
    }

    // Everything below requires a signed-in user.
    const user = currentUser(req);
    if (!user) return fail(res, 401, 'Please sign in.'), true;
    if (await appointments.handle({ req, res, pathname, method, user, body })) return true;

    if (method === 'GET' && pathname === '/api/requests') {
      const rows = q('SELECT r.*, (SELECT COUNT(*) FROM photos p WHERE p.request_id = r.id) AS photo_count, (SELECT COUNT(*) FROM messages m WHERE m.request_id = r.id AND m.kind = \'message\' AND m.internal = 0) AS message_count FROM requests r WHERE user_id = ? ORDER BY COALESCE(r.last_message_at, r.created_at) DESC').all(user.id);
      return json(res, 200, { requests: rows.map(r => ({ ...ticketBase(r), photoCount: r.photo_count, messageCount: r.message_count, unread: unreadFor(r, false), lastMessageAt: r.last_message_at })) }), true;
    }
    if (method === 'POST' && pathname === '/api/requests') {
      if (!user.verified) return fail(res, 403, 'Please confirm your email first.'), true;
      if (limited(req, 'requests', 20, 60 * 60 * 1000)) return fail(res, 429, 'Too many requests. Please try again later.'), true;
      const f = { title: text(body.title, 120), projectType: text(body.projectType, 60), location: text(body.location, 60), timeline: text(body.timeline ?? '', 60), budget: text(body.budget ?? '', 60), description: text(body.description, 4000), category: text(body.category ?? '', 60) };
      if (f.category === null || (f.category && !CATEGORIES.includes(f.category))) return fail(res, 400, 'Please choose a valid category.'), true;
      if (!f.title || !f.projectType || !f.location || f.timeline === null || f.budget === null || !f.description || f.description.length < 10) return fail(res, 400, 'Please complete the project title, type, county and a short description.'), true;
      if (q('SELECT COUNT(*) AS n FROM requests WHERE user_id = ?').get(user.id).n >= 50) return fail(res, 400, 'You have reached the request limit. Please contact us.'), true;
      const info = q('INSERT INTO requests (user_id, title, project_type, location, timeline, budget, description, category, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').run(user.id, f.title, f.projectType, f.location, f.timeline, f.budget, f.description, f.category, nowIso());
      return json(res, 201, { id: Number(info.lastInsertRowid) }), true;
    }
    m = pathname.match(/^\/api\/requests\/(\d+)$/);
    if (m && method === 'GET') {
      const r = q('SELECT * FROM requests WHERE id = ?').get(Number(m[1]));
      if (!canAccess(user, r)) return fail(res, 404, 'Request not found.'), true;
      const staff = isAdmin(user) && r.user_id !== user.id;
      if (r.status !== 'draft') q(`UPDATE requests SET ${staff ? 'staff_read_at' : 'customer_read_at'} = ? WHERE id = ?`).run(nowIso(), r.id);
      const view = ticketView(r, staff);
      if (staff) { const c = q('SELECT name, email, phone FROM users WHERE id = ?').get(r.user_id); view.customer = c; }
      return json(res, 200, { request: view, staff }), true;
    }
    m = pathname.match(/^\/api\/requests\/(\d+)\/submit$/);
    if (m && method === 'POST') {
      const r = q('SELECT * FROM requests WHERE id = ? AND user_id = ?').get(Number(m[1]), user.id);
      if (!r) return fail(res, 404, 'Request not found.'), true;
      if (r.status === 'draft') {
        const at = nowIso();
        q("UPDATE requests SET status = 'submitted', submitted_at = ?, last_message_at = ?, last_author_role = 'customer', customer_read_at = ? WHERE id = ?").run(at, at, at, r.id);
        const photoCount = photosOf(r.id).length;
        await mail({ to: user.email, replyTo: ticketAddress(r.id) || undefined, headers: threadHeaders(r.id), ...templates.requestReceived({ lang: user.lang, name: user.name, request: r, photoCount, requestUrl: ticketUrl(r.id), canReply: Boolean(replyDomain) }) });
        for (const to of staffEmails) await mail({ to, replyTo: ticketAddress(r.id) || user.email, headers: threadHeaders(r.id), ...templates.newRequestAlert({ user, request: r, photoCount, adminUrl: ticketUrl(r.id) }) });
      }
      return json(res, 200, { ok: true }), true;
    }
    m = pathname.match(/^\/api\/requests\/(\d+)\/messages$/);
    if (m && method === 'POST') {
      const r = q('SELECT * FROM requests WHERE id = ?').get(Number(m[1]));
      if (!canAccess(user, r)) return fail(res, 404, 'Request not found.'), true;
      if (!user.verified) return fail(res, 403, 'Please confirm your email first.'), true;
      if (r.status === 'draft') return fail(res, 400, 'Send the request to our team before adding messages.'), true;
      if (limited(req, 'messages', 60, 60 * 60 * 1000)) return fail(res, 429, 'Too many messages. Please try again later.'), true;
      const staff = isAdmin(user) && r.user_id !== user.id;
      const message = text(body.body ?? '', 4000);
      const photoIds = Array.isArray(body.photoIds) ? [...new Set(body.photoIds.filter(id => typeof id === 'string'))] : [];
      if (message === null || photoIds.length > MAX_PHOTOS_PER_MESSAGE || (!message && !photoIds.length)) return fail(res, 400, 'Write a message or attach at least one photo.'), true;
      for (const id of photoIds) {
        const photo = q('SELECT * FROM photos WHERE id = ? AND request_id = ? AND user_id = ? AND message_id IS NULL').get(id, r.id, user.id);
        if (!photo) return fail(res, 400, 'One of the photos could not be attached. Please upload it again.'), true;
      }
      const status = staff && typeof body.status === 'string' && STATUSES[body.status] && body.status !== 'draft' ? body.status : null;
      const id = await addMessage({ request: r, author: { id: user.id, name: staff ? user.name : user.name }, role: staff ? 'staff' : 'customer', body: message || '(photos attached)', internal: staff && body.internal === true, photoIds, status });
      return json(res, 201, { id }), true;
    }
    m = pathname.match(/^\/api\/requests\/(\d+)\/photos\/([a-f0-9]{32})$/);
    if (m && method === 'POST') {
      const r = q('SELECT * FROM requests WHERE id = ?').get(Number(m[1]));
      const photo = canAccess(user, r) && q('SELECT * FROM photos WHERE id = ? AND request_id = ?').get(m[2], r.id);
      const caption = text(body.caption ?? '', 300);
      if (!photo || photo.user_id !== user.id || caption === null) return fail(res, 404, 'Photo not found.'), true;
      q('UPDATE photos SET caption = ? WHERE id = ?').run(caption, photo.id);
      return json(res, 200, { ok: true }), true;
    }
    m = pathname.match(/^\/api\/requests\/(\d+)\/status$/);
    if (m && method === 'POST') {
      const r = q('SELECT * FROM requests WHERE id = ?').get(Number(m[1]));
      if (!canAccess(user, r) || r.status === 'draft') return fail(res, 404, 'Request not found.'), true;
      const staff = isAdmin(user) && r.user_id !== user.id;
      const status = body.status;
      if (!STATUSES[status] || status === 'draft' || (!staff && !['resolved', 'closed'].includes(status))) return fail(res, 400, 'That status is not allowed.'), true;
      if (status !== r.status) {
        const at = nowIso();
        q('UPDATE requests SET status = ? WHERE id = ?').run(status, r.id);
        q("INSERT INTO messages (request_id, role, kind, body, created_at) VALUES (?, 'system', 'status', ?, ?)").run(r.id, `Status changed to ${STATUSES[status]} by ${staff ? 'our team' : 'you'}`, at);
        const customer = q('SELECT * FROM users WHERE id = ?').get(r.user_id);
        if (staff && customer.notify_email) await mail({ to: customer.email, replyTo: ticketAddress(r.id) || undefined, headers: threadHeaders(r.id), ...templates.ticketStatus({ name: customer.name, request: r, label: STATUSES[status], url: ticketUrl(r.id) }) });
      }
      return json(res, 200, { ok: true }), true;
    }
    m = pathname.match(/^\/api\/requests\/(\d+)\/priority$/);
    if (m && method === 'POST') {
      const r = q('SELECT * FROM requests WHERE id = ?').get(Number(m[1]));
      if (!isAdmin(user) || !r || r.status === 'draft') return fail(res, 404, 'Request not found.'), true;
      if (!PRIORITIES[body.priority]) return fail(res, 400, 'That priority is not allowed.'), true;
      if (body.priority !== r.priority) {
        q('UPDATE requests SET priority = ? WHERE id = ?').run(body.priority, r.id);
        q("INSERT INTO messages (request_id, role, kind, internal, body, created_at) VALUES (?, 'system', 'status', 1, ?, ?)").run(r.id, `Priority changed to ${PRIORITIES[body.priority]}`, nowIso());
      }
      return json(res, 200, { ok: true }), true;
    }
    if (method === 'GET' && pathname === '/api/meta/ticket') return json(res, 200, { categories: CATEGORIES, priorities: PRIORITIES, maxPhotoBytes: MAX_PHOTO_BYTES, maxVideoBytes: MAX_VIDEO_BYTES }), true;
    if (method === 'GET' && pathname === '/api/admin/requests') {
      if (!isAdmin(user)) return fail(res, 403, 'Not allowed.'), true;
      const rows = q("SELECT r.*, u.name AS user_name, u.email AS user_email, u.phone AS user_phone, (SELECT COUNT(*) FROM photos p WHERE p.request_id = r.id) AS photo_count FROM requests r JOIN users u ON u.id = r.user_id WHERE r.status != 'draft' ORDER BY CASE r.priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 ELSE 2 END, COALESCE(r.last_message_at, r.submitted_at) DESC LIMIT 300").all();
      return json(res, 200, { requests: rows.map(r => ({ ...ticketBase(r), photoCount: r.photo_count, nextAppointment: q("SELECT starts_at FROM appointments WHERE request_id = ? AND status = 'scheduled' AND starts_at >= ? ORDER BY starts_at LIMIT 1").get(r.id, nowIso())?.starts_at || null, unread: unreadFor(r, true), lastMessageAt: r.last_message_at || r.submitted_at, customer: { name: r.user_name, email: r.user_email, phone: r.user_phone } })) }), true;
    }
    return fail(res, 404, 'Not found.'), true;
  }

  return { handle, bookings, media: cms.media, tracking, company, zoho, seoSync, security };
}

module.exports = { createApi };
