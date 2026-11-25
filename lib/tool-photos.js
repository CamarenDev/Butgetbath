'use strict';
// Reference photos for the tools and supplies on the crew checklist, so employees know what to pack.
// Admin uploads a photo per tool (with credit and source); staff and crew can view them.
const crypto = require('node:crypto');
const path = require('node:path');
const fs = require('node:fs/promises');
const { CATALOG } = require('./tools');
const { toolArt } = require('./tool-art');

const MAX_BYTES = 3 * 1024 * 1024;
const keyOf = name => String(name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 90);
const BY_KEY = new Map(CATALOG.map(t => [keyOf(t.name), t]));

function detect(buf) {
  if (buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return ['image/jpeg', '.jpg'];
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return ['image/png', '.png'];
  if (buf.subarray(0, 4).toString('latin1') === 'RIFF' && buf.subarray(8, 12).toString('latin1') === 'WEBP') return ['image/webp', '.webp'];
  return null;
}

function createToolPhotos({ db, dataDir, json, fail, readBuffer, currentUser, isAdmin, limited }) {
  const q = sql => db.prepare(sql);
  const nowIso = () => new Date().toISOString();
  const clean = (v, max) => { try { return decodeURIComponent(String(v || '')).replace(/[\u0000-\u001f]/g, '').trim().slice(0, max); } catch { return ''; } };
  const webUrl = v => /^https?:\/\/[^\s<>"']+$/i.test(v) ? v : '';

  const crewUser = user => user && (isAdmin(user) || q("SELECT 1 FROM employees WHERE user_id = ? AND status = 'active'").get(user.id));

  function library() {
    const rows = new Map(q('SELECT * FROM tool_photos').all().map(r => [r.key, r]));
    return [...BY_KEY].map(([key, t]) => {
      const r = rows.get(key);
      return {
        key, name: t.name, group: t.group, src: t.src, note: t.note, photo: true, generated: !r,
        credit: r ? r.credit || '' : 'Built-in vector illustration', sourceUrl: r?.source_url || '', v: r ? Date.parse(r.created_at) : 1,
        sourceMetadata: r ? { type: 'administrator supplied', verified: false, verification: 'not externally verified' } : null
      };
    });
  }

  async function handle(req, res, pathname, method) {
    if (method === 'GET' && pathname === '/api/tools/library') {
      const user = currentUser(req);
      if (!crewUser(user)) { fail(res, 403, 'Staff access required.'); return true; }
      json(res, 200, { tools: library() });
      return true;
    }
    let m = pathname.match(/^\/api\/tools\/photo\/([a-z0-9-]{1,90})$/);
    if (m && method === 'GET') {
      const user = currentUser(req), row = crewUser(user) && q('SELECT * FROM tool_photos WHERE key = ?').get(m[1]);
      const data = row && await fs.readFile(path.join(dataDir, 'uploads', row.file)).catch(() => null);
      if (!data && crewUser(user) && BY_KEY.has(m[1])) {
        const svg = Buffer.from(toolArt(BY_KEY.get(m[1])));
        res.writeHead(200, { 'Content-Type': 'image/svg+xml; charset=utf-8', 'Content-Length': svg.length, 'Cache-Control': 'private, max-age=86400', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; sandbox" });
        res.end(svg);
        return true;
      }
      if (!data) { fail(res, 404, 'No photo for this tool yet.'); return true; }
      res.writeHead(200, { 'Content-Type': row.mime, 'Content-Length': data.length, 'Cache-Control': 'private, max-age=86400', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "sandbox; default-src 'none'; img-src 'self'", 'Content-Disposition': 'inline' });
      res.end(data);
      return true;
    }
    m = pathname.match(/^\/api\/admin\/tools\/photo\/([a-z0-9-]{1,90})(\/delete)?$/);
    if (!m || method !== 'POST') return false;
    const user = currentUser(req);
    if (!isAdmin(user)) { fail(res, 403, 'Admin access required.'); return true; }
    if (limited(req, 'tool-photo', 60)) { fail(res, 429, 'Too many uploads. Please try again later.'); return true; }
    const key = m[1];
    if (!BY_KEY.has(key)) { fail(res, 404, 'Tool not found.'); return true; }
    const old = q('SELECT * FROM tool_photos WHERE key = ?').get(key);
    const dropOld = async () => { if (old) await fs.unlink(path.join(dataDir, 'uploads', old.file)).catch(() => {}); };
    if (m[2]) { await dropOld(); q('DELETE FROM tool_photos WHERE key = ?').run(key); json(res, 200, { tools: library() }); return true; }
    const data = await readBuffer(req, MAX_BYTES);
    if (!data) { fail(res, 413, 'The photo is too large (3 MB maximum).'); return true; }
    const kind = detect(data);
    if (!kind) { fail(res, 400, 'Upload a JPG, PNG or WebP photo.'); return true; }
    const sourceUrl = clean(req.headers['x-source-url'], 400);
    if (sourceUrl && !webUrl(sourceUrl)) { fail(res, 400, 'The source address must start with http.'); return true; }
    const file = `tool-${crypto.randomBytes(12).toString('hex')}${kind[1]}`;
    await fs.writeFile(path.join(dataDir, 'uploads', file), data, { mode: 0o600 });
    await dropOld();
    q('INSERT INTO tool_photos (key, file, mime, credit, source_url, uploaded_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(key) DO UPDATE SET file = excluded.file, mime = excluded.mime, credit = excluded.credit, source_url = excluded.source_url, uploaded_by = excluded.uploaded_by, created_at = excluded.created_at')
      .run(key, file, kind[0], clean(req.headers['x-credit'], 200), sourceUrl, user.name, nowIso());
    json(res, 200, { tools: library() });
    return true;
  }
  return { handle, library };
}

module.exports = { createToolPhotos, keyOf };
