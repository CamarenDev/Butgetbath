const crypto = require('node:crypto');
const path = require('node:path');
const fs = require('node:fs/promises');

const MAX_FILE_BYTES = 25 * 1024 * 1024;
const MAX_FILES_PER_CUSTOMER = 500;
const MAX_ATTACHMENTS = 10;
const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024;
const STATUSES = ['lead', 'active', 'completed', 'inactive'];
const CATEGORIES = ['photo', 'receipt', 'contract', 'document', 'other'];
const ENTRY_KINDS = ['note', 'conversation', 'call', 'meeting'];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Identify uploads by content, never by the client's claimed type. Only images, PDFs and Office files are accepted.
function detectFile(buf) {
  if (buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return { mime: 'image/jpeg', ext: '.jpg', inline: true };
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return { mime: 'image/png', ext: '.png', inline: true };
  if (buf.subarray(0, 4).toString('latin1') === 'RIFF' && buf.subarray(8, 12).toString('latin1') === 'WEBP') return { mime: 'image/webp', ext: '.webp', inline: true };
  if (buf.subarray(0, 5).toString('latin1') === '%PDF-') return { mime: 'application/pdf', ext: '.pdf', inline: true };
  if (buf[0] === 0x50 && buf[1] === 0x4b && buf[2] === 0x03 && buf[3] === 0x04) return { mime: 'application/octet-stream', ext: '.zip', inline: false };
  return null;
}
const cleanName = raw => { try { return decodeURIComponent(String(raw || '')).replace(/[^\w .()-]/g, '').slice(0, 100) || 'file'; } catch { return 'file'; } };

function createCustomers({ db, dataDir, mailer, templates, json, fail, readBuffer, readJson, currentUser, isAdmin, limited, text }) {
  const q = sql => db.prepare(sql);
  const nowIso = () => new Date().toISOString();

  const view = c => ({ id: c.id, userId: c.user_id, name: c.name, email: c.email, phone: c.phone, address: c.address, status: c.status, notes: c.notes, createdAt: c.created_at, updatedAt: c.updated_at });
  const fileView = f => ({ shared: Boolean(f.shared), id: f.id, category: f.category, title: f.title, name: f.original_name, mime: f.mime, size: f.size, createdAt: f.created_at });

  function fields(body, partial = false) {
    const out = {};
    for (const [key, max] of [['name', 120], ['email', 200], ['phone', 40], ['address', 300], ['notes', 5000]]) {
      if (body[key] === undefined && partial) continue;
      const value = text(body[key] ?? '', max);
      if (value === null) return { error: `Please check the ${key} field.` };
      out[key] = value;
    }
    if (body.status !== undefined) {
      if (!STATUSES.includes(body.status)) return { error: 'Unknown status.' };
      out.status = body.status;
    }
    if (out.email && !EMAIL_RE.test(out.email)) return { error: 'Enter a valid email address.' };
    if (!partial && !out.name) return { error: 'A name is required.' };
    if (partial && 'name' in out && !out.name) return { error: 'A name is required.' };
    return { out };
  }

  function detail(c) {
    const requests = q("SELECT id, title, status, project_type AS projectType, submitted_at AS submittedAt FROM requests WHERE user_id = ? AND status != 'draft' ORDER BY id DESC").all(c.user_id ?? -1);
    const contacts = c.email ? q('SELECT id, type, interest, message, status, created_at AS createdAt FROM contacts WHERE email = ? ORDER BY id DESC').all(c.email) : [];
    return {
      customer: view(c),
      files: q('SELECT * FROM customer_files WHERE customer_id = ? ORDER BY created_at DESC, rowid DESC').all(c.id).map(fileView),
      entries: q('SELECT id, kind, subject, body, author, shared, created_at AS createdAt FROM customer_entries WHERE customer_id = ? ORDER BY id DESC').all(c.id).map(e => ({ ...e, shared: Boolean(e.shared) })),
      requests, contacts
    };
  }

  async function removeStored(rows) {
    for (const row of rows) await fs.unlink(path.join(dataDir, 'uploads', row.file)).catch(() => {});
  }

  // Customers see only what staff has shared with them, tied to their verified account.
  async function portal(req, res, pathname, method) {
    const user = currentUser(req);
    if (method !== 'GET') return false;
    if (!user) { fail(res, 401, 'Please sign in.'); return true; }
    const customer = user.verified ? q('SELECT * FROM customers WHERE user_id = ? OR email = ? ORDER BY user_id IS NULL LIMIT 1').get(user.id, user.email) : null;
    if (pathname === '/api/account/documents') {
      json(res, 200, customer ? {
        files: q('SELECT * FROM customer_files WHERE customer_id = ? AND shared = 1 ORDER BY created_at DESC, rowid DESC').all(customer.id).map(fileView),
        entries: q('SELECT id, kind, subject, body, author, created_at AS createdAt FROM customer_entries WHERE customer_id = ? AND shared = 1 ORDER BY id DESC').all(customer.id)
      } : { files: [], entries: [] });
      return true;
    }
    const m = pathname.match(/^\/api\/account\/documents\/([a-f0-9]{32})$/);
    const file = m && customer && q('SELECT * FROM customer_files WHERE id = ? AND customer_id = ? AND shared = 1').get(m[1], customer.id);
    if (!file) { fail(res, 404, 'Not found.'); return true; }
    return sendFile(res, file);
  }

  async function sendFile(res, file) {
    try {
      const data = await fs.readFile(path.join(dataDir, 'uploads', file.file));
      const inline = file.mime.startsWith('image/');
      res.writeHead(200, { 'Content-Type': file.mime, 'Content-Length': data.length, 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "sandbox; default-src 'none'; img-src 'self'",
        'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename="${file.original_name.replace(/"/g, '')}"` });
      res.end(data);
    } catch { fail(res, 404, 'Not found.'); }
    return true;
  }

  async function handle(req, res, pathname, method) {
    if (pathname.startsWith('/api/account/documents')) return portal(req, res, pathname, method);
    if (!pathname.startsWith('/api/admin/customer')) return false;
    const user = currentUser(req);
    if (!user) { fail(res, 401, 'Please sign in.'); return true; }
    if (!isAdmin(user)) { fail(res, 403, 'Admin access required.'); return true; }
    let m;

    if (method === 'GET' && pathname === '/api/admin/customers') {
      const term = String(new URL(req.url, 'http://localhost').searchParams.get('q') || '').trim().slice(0, 100).replace(/[\\%_]/g, '\\$&');
      const like = `%${term}%`;
      const rows = q(`SELECT c.*, (SELECT COUNT(*) FROM customer_files f WHERE f.customer_id = c.id) AS file_count, (SELECT COUNT(*) FROM customer_entries e WHERE e.customer_id = c.id) AS entry_count
        FROM customers c WHERE (c.name LIKE ? ESCAPE '\\' OR c.email LIKE ? ESCAPE '\\' OR c.phone LIKE ? ESCAPE '\\' OR c.address LIKE ? ESCAPE '\\') ORDER BY c.updated_at DESC LIMIT 500`).all(like, like, like, like);
      json(res, 200, { statuses: STATUSES, customers: rows.map(c => ({ ...view(c), fileCount: c.file_count, entryCount: c.entry_count })) });
      return true;
    }

    // Stored files: admin only; only images render inline; PDFs and Office files download.
    m = pathname.match(/^\/api\/admin\/customer-files\/([a-f0-9]{32})$/);
    if (m && method === 'GET') {
      const file = q('SELECT * FROM customer_files WHERE id = ?').get(m[1]);
      if (!file) { fail(res, 404, 'Not found.'); return true; }
      return sendFile(res, file);
    }
    m = pathname.match(/^\/api\/admin\/customer-files\/([a-f0-9]{32})\/share$/);
    if (m && method === 'POST') {
      const parsed = (req.headers['content-type'] || '').toLowerCase().startsWith('application/json') ? await readJson(req, 1000) : { error: 'invalid' };
      if (parsed.error || typeof parsed.body.shared !== 'boolean') { fail(res, 400, 'Invalid request.'); return true; }
      const { changes } = q('UPDATE customer_files SET shared = ? WHERE id = ?').run(parsed.body.shared ? 1 : 0, m[1]);
      if (!changes) { fail(res, 404, 'Not found.'); return true; }
      json(res, 200, { ok: true });
      return true;
    }
    m = pathname.match(/^\/api\/admin\/customer-files\/([a-f0-9]{32})\/delete$/);
    if (m && method === 'POST') {
      const file = q('SELECT * FROM customer_files WHERE id = ?').get(m[1]);
      if (!file) { fail(res, 404, 'Not found.'); return true; }
      q('DELETE FROM customer_files WHERE id = ?').run(file.id);
      await removeStored([file]);
      json(res, 200, { ok: true });
      return true;
    }

    // Binary upload is handled before JSON parsing.
    m = pathname.match(/^\/api\/admin\/customers\/(\d+)\/files$/);
    if (m && method === 'POST') {
      const customer = q('SELECT * FROM customers WHERE id = ?').get(Number(m[1]));
      if (!customer) { fail(res, 404, 'Customer not found.'); return true; }
      if (limited(req, 'customer-upload', 200)) { fail(res, 429, 'Too many uploads. Please try again later.'); return true; }
      if (q('SELECT COUNT(*) AS n FROM customer_files WHERE customer_id = ?').get(customer.id).n >= MAX_FILES_PER_CUSTOMER) { fail(res, 400, 'This customer has reached the file limit.'); return true; }
      const category = String(req.headers['x-category'] || 'document');
      if (!CATEGORIES.includes(category)) { fail(res, 400, 'Unknown file category.'); return true; }
      const data = await readBuffer(req, MAX_FILE_BYTES);
      if (data === null) { fail(res, 413, 'Files must be 25 MB or smaller.'); return true; }
      const kind = detectFile(data);
      if (!kind) { fail(res, 415, 'Upload a JPG, PNG, WebP, PDF, Word or Excel file.'); return true; }
      let title = '';
      try { title = decodeURIComponent(String(req.headers['x-title'] || '')).trim().slice(0, 200); } catch { /* ignore bad title */ }
      const name = cleanName(req.headers['x-filename']);
      const id = crypto.randomBytes(16).toString('hex');
      await fs.writeFile(path.join(dataDir, 'uploads', id + kind.ext), data, { mode: 0o600 });
      q('INSERT INTO customer_files (id, customer_id, category, title, file, mime, size, original_name, shared, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(id, customer.id, category, title, id + kind.ext, kind.mime, data.length, name, req.headers['x-shared'] === '1' ? 1 : 0, nowIso());
      q('UPDATE customers SET updated_at = ? WHERE id = ?').run(nowIso(), customer.id);
      json(res, 201, { id });
      return true;
    }

    const isCustomerPath = /^\/api\/admin\/customers(\/|$)/.test(pathname);
    if (!isCustomerPath) return false;
    let body = {};
    if (method === 'POST') {
      if (!(req.headers['content-type'] || '').toLowerCase().startsWith('application/json')) { fail(res, 415, 'Please submit from the admin portal.'); return true; }
      const parsed = await readJson(req, 20000);
      if (parsed.error) { fail(res, parsed.error === 'too-large' ? 413 : 400, 'Please check the form and try again.'); return true; }
      body = parsed.body;
    }

    if (method === 'POST' && pathname === '/api/admin/customers') {
      const { out, error } = fields(body);
      if (error) { fail(res, 400, error); return true; }
      if (out.email && q('SELECT 1 FROM customers WHERE email = ?').get(out.email)) { fail(res, 409, 'A customer with this email already exists.'); return true; }
      const linked = out.email ? q('SELECT id FROM users WHERE email = ?').get(out.email) : null;
      const now = nowIso();
      const { lastInsertRowid } = q('INSERT INTO customers (user_id, name, email, phone, address, status, notes, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
        .run(linked?.id ?? null, out.name, out.email || '', out.phone || '', out.address || '', out.status || 'lead', out.notes || '', now, now);
      json(res, 201, { id: Number(lastInsertRowid) });
      return true;
    }

    // Pull registered users and website contacts into the customer list (existing emails are skipped).
    if (method === 'POST' && pathname === '/api/admin/customers/import') {
      const now = nowIso();
      const add = q('INSERT INTO customers (user_id, name, email, phone, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)');
      const exists = q('SELECT 1 FROM customers WHERE email = ?');
      let added = 0;
      for (const u of q('SELECT id, name, email, phone FROM users').all()) if (!exists.get(u.email)) { add.run(u.id, u.name, u.email, u.phone, 'lead', now, now); added++; }
      for (const c of q("SELECT name, email, phone FROM contacts WHERE type = 'project' ORDER BY id").all()) if (c.email && !exists.get(c.email)) { add.run(null, c.name, c.email, c.phone, 'lead', now, now); added++; }
      json(res, 200, { added });
      return true;
    }

    m = pathname.match(/^\/api\/admin\/customers\/(\d+)(?:\/(delete|entries|email))?$/);
    const sub = pathname.match(/^\/api\/admin\/customers\/(\d+)\/entries\/(\d+)\/delete$/);
    if (!m && !sub) return false;
    const customer = q('SELECT * FROM customers WHERE id = ?').get(Number((m || sub)[1]));
    if (!customer) { fail(res, 404, 'Customer not found.'); return true; }

    if (sub && method === 'POST') {
      q('DELETE FROM customer_entries WHERE id = ? AND customer_id = ?').run(Number(sub[2]), customer.id);
      json(res, 200, { ok: true });
      return true;
    }
    if (!m) return false;

    if (!m[2] && method === 'GET') { json(res, 200, { ...detail(customer), statuses: STATUSES, categories: CATEGORIES, kinds: ENTRY_KINDS }); return true; }

    if (!m[2] && method === 'POST') {
      const { out, error } = fields(body, true);
      if (error) { fail(res, 400, error); return true; }
      if (out.email && q('SELECT 1 FROM customers WHERE email = ? AND id != ?').get(out.email, customer.id)) { fail(res, 409, 'Another customer already uses this email.'); return true; }
      const next = { ...customer, ...out };
      q('UPDATE customers SET name = ?, email = ?, phone = ?, address = ?, status = ?, notes = ?, updated_at = ? WHERE id = ?').run(next.name, next.email, next.phone, next.address, next.status, next.notes, nowIso(), customer.id);
      json(res, 200, { ok: true });
      return true;
    }

    if (m[2] === 'delete' && method === 'POST') {
      const files = q('SELECT file FROM customer_files WHERE customer_id = ?').all(customer.id);
      q('DELETE FROM customers WHERE id = ?').run(customer.id);
      await removeStored(files);
      json(res, 200, { ok: true });
      return true;
    }

    if (m[2] === 'entries' && method === 'POST') {
      const content = text(body.body, 5000), subject = text(body.subject ?? '', 200);
      if (!content || subject === null || !ENTRY_KINDS.includes(body.kind)) { fail(res, 400, 'Choose a type and write some text.'); return true; }
      q('INSERT INTO customer_entries (customer_id, kind, subject, body, author, shared, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)').run(customer.id, body.kind, subject, content, user.name, body.shared === true ? 1 : 0, nowIso());
      q('UPDATE customers SET updated_at = ? WHERE id = ?').run(nowIso(), customer.id);
      json(res, 201, { ok: true });
      return true;
    }

    if (m[2] === 'email' && method === 'POST') {
      const subject = text(body.subject, 200), content = text(body.body, 5000);
      if (!customer.email) { fail(res, 400, 'This customer has no email address.'); return true; }
      if (!subject || !content) { fail(res, 400, 'Add a subject and a message.'); return true; }
      if (limited(req, 'customer-email', 60)) { fail(res, 429, 'Too many emails. Please try again later.'); return true; }
      const ids = Array.isArray(body.fileIds) ? body.fileIds : [];
      if (ids.length > MAX_ATTACHMENTS || ids.some(v => typeof v !== 'string' || !/^[a-f0-9]{32}$/.test(v))) { fail(res, 400, `Attach up to ${MAX_ATTACHMENTS} files.`); return true; }
      const picked = ids.map(v => q('SELECT * FROM customer_files WHERE id = ? AND customer_id = ?').get(v, customer.id));
      if (picked.includes(undefined)) { fail(res, 400, 'One of the attachments was not found.'); return true; }
      if (picked.reduce((n, f) => n + f.size, 0) > MAX_ATTACHMENT_BYTES) { fail(res, 400, 'Attachments must total 20 MB or less.'); return true; }
      let attachments;
      try { attachments = await Promise.all(picked.map(async f => ({ filename: f.original_name, content: (await fs.readFile(path.join(dataDir, 'uploads', f.file))).toString('base64') }))); }
      catch { fail(res, 400, 'An attachment could not be read.'); return true; }
      let result;
      try { result = await mailer({ to: customer.email, ...templates.customerMessage({ name: customer.name, subject, body: content }), ...(attachments.length && { attachments }) }); }
      catch (error) { console.error('Customer email failed:', error.message); fail(res, 502, 'The email could not be sent. Please try again.'); return true; }
      const skipped = Boolean(result?.skipped);
      q('INSERT INTO customer_entries (customer_id, kind, subject, body, author, shared, created_at) VALUES (?, ?, ?, ?, ?, 1, ?)').run(customer.id, 'email', subject, picked.length ? `${content}\n\nAttached: ${picked.map(f => f.original_name).join(', ')}` : content, user.name, nowIso());
      q('UPDATE customers SET updated_at = ? WHERE id = ?').run(nowIso(), customer.id);
      json(res, 201, { ok: true, skipped });
      return true;
    }
    return false;
  }

  return { handle };
}

module.exports = { createCustomers, detectFile, cleanName };
