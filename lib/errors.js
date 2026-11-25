'use strict';
// Error log. Records every server, process and browser error with full detail so an admin can see what happened.
// record() never throws: a failure to log must never become a second failure.
const crypto = require('node:crypto');

const MAX_ROWS = 20000;
const cut = (v, n) => (v == null ? '' : String(v)).slice(0, n);
const SECRET = /(token|password|passwd|secret|key|auth|session|signature|code)=[^&\s"']+/gi;
// Query values can hold reset tokens, so they are masked before anything is stored.
const scrub = v => cut(v, 4000).replace(SECRET, '$1=[hidden]');

function createErrorLog({ db, retentionDays = 90 }) {
  db.exec(`CREATE TABLE IF NOT EXISTS error_log (
    id INTEGER PRIMARY KEY, created_at TEXT NOT NULL, source TEXT NOT NULL, kind TEXT NOT NULL, level TEXT NOT NULL DEFAULT 'error',
    message TEXT NOT NULL, stack TEXT NOT NULL DEFAULT '', url TEXT NOT NULL DEFAULT '', method TEXT NOT NULL DEFAULT '', status INTEGER,
    user_id INTEGER, user_email TEXT, ip TEXT, user_agent TEXT, fingerprint TEXT NOT NULL, context TEXT NOT NULL DEFAULT '{}', resolved INTEGER NOT NULL DEFAULT 0
  ); CREATE INDEX IF NOT EXISTS idx_error_log_created ON error_log(created_at); CREATE INDEX IF NOT EXISTS idx_error_log_fp ON error_log(fingerprint);`);
  const q = sql => db.prepare(sql);
  const iso = ms => new Date(ms).toISOString();

  // Returns the new row id (used as the reference shown to a visitor), or 0 if logging itself failed.
  function record({ source = 'server', kind = 'error', level = 'error', error = null, message = '', stack = '', url = '', method = '', status = null, user = null, ip = '', userAgent = '', context = {} } = {}) {
    try {
      const msg = scrub(message || (error && (error.message || String(error))) || kind) || kind;
      const stk = scrub(stack || (error && error.stack) || '').slice(0, 6000);
      const firstFrame = (stk.split('\n').find(l => /\sat\s|@/.test(l)) || '').trim();
      const fingerprint = crypto.createHash('sha1').update([source, kind, msg.slice(0, 200), firstFrame].join('|')).digest('hex').slice(0, 16);
      let ctx = {};
      if (error && typeof error === 'object') for (const k of ['code', 'errno', 'syscall', 'path', 'cause']) if (error[k] != null) ctx[k] = cut(error[k] instanceof Error ? error[k].stack : error[k], 500);
      ctx = { ...ctx, ...context };
      const row = q('INSERT INTO error_log (created_at, source, kind, level, message, stack, url, method, status, user_id, user_email, ip, user_agent, fingerprint, context) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
        .run(iso(Date.now()), cut(source, 20), cut(kind, 40), cut(level, 10), cut(msg, 1000), stk, scrub(url).slice(0, 500), cut(method, 10), Number.isInteger(status) ? status : null, user?.id ?? null, user?.email ? cut(user.email, 200) : null, cut(ip, 64), cut(userAgent, 300), fingerprint, scrub(JSON.stringify(ctx)).slice(0, 4000));
      return Number(row.lastInsertRowid);
    } catch (e) {
      try { console.error('Error log failed:', e.message, '| original:', error?.message || message); } catch { /* nothing left to do */ }
      return 0;
    }
  }

  const view = r => {
    let context = {}; try { context = JSON.parse(r.context); } catch { /* keep empty */ }
    return { id: r.id, at: r.created_at, source: r.source, kind: r.kind, level: r.level, message: r.message, stack: r.stack, url: r.url, method: r.method, status: r.status, userEmail: r.user_email, ip: r.ip, userAgent: r.user_agent, fingerprint: r.fingerprint, context, resolved: Boolean(r.resolved) };
  };
  function list({ days = 7, source = '', search = '', showResolved = false, limit = 200 } = {}) {
    const where = ['created_at > ?'], args = [iso(Date.now() - Math.min(Math.max(Number(days) || 7, 1), 365) * 864e5)];
    if (source) { where.push('source = ?'); args.push(source); }
    if (!showResolved) where.push('resolved = 0');
    if (search) { where.push('(message LIKE ? OR url LIKE ? OR stack LIKE ?)'); const s = `%${cut(search, 80).replace(/[%_]/g, '')}%`; args.push(s, s, s); }
    const rows = q(`SELECT * FROM error_log WHERE ${where.join(' AND ')} ORDER BY id DESC LIMIT ?`).all(...args, Math.min(Math.max(Number(limit) || 200, 1), 500));
    return rows.map(view);
  }
  function summary(days = 7) {
    const since = iso(Date.now() - Math.min(Math.max(Number(days) || 7, 1), 365) * 864e5);
    return {
      bySource: q('SELECT source, COUNT(*) AS n FROM error_log WHERE created_at > ? AND resolved = 0 GROUP BY source').all(since),
      top: q('SELECT fingerprint, MIN(message) AS message, source, COUNT(*) AS n, MAX(created_at) AS last FROM error_log WHERE created_at > ? AND resolved = 0 GROUP BY fingerprint ORDER BY n DESC LIMIT 8').all(since),
      open: q('SELECT COUNT(*) AS n FROM error_log WHERE resolved = 0').get().n,
      last24h: q('SELECT COUNT(*) AS n FROM error_log WHERE created_at > ? AND resolved = 0').get(iso(Date.now() - 864e5)).n
    };
  }
  function purge() {
    try {
      q('DELETE FROM error_log WHERE created_at < ?').run(iso(Date.now() - retentionDays * 864e5));
      q('DELETE FROM error_log WHERE id <= (SELECT MAX(id) FROM error_log) - ?').run(MAX_ROWS);
    } catch { /* retention is best effort */ }
  }

  const sample = new Map();
  // Browser reports are cheap to forge and can loop, so each fingerprint is stored at most 30 times an hour.
  const tooNoisy = fp => {
    const now = Date.now(), hits = (sample.get(fp) || []).filter(t => now - t < 36e5);
    hits.push(now); sample.set(fp, hits);
    if (sample.size > 5000) sample.clear();
    return hits.length > 30;
  };

  async function handle(req, res, pathname, method, { json, fail, readJson, currentUser, isAdmin, limited, clientIp }) {
    if (!pathname.startsWith('/api/client-error') && !pathname.startsWith('/api/admin/errors')) return false;
    if (method === 'POST' && pathname === '/api/client-error') {
      if (limited(req, 'client-error', 40, 60 * 1000)) return json(res, 429, { ok: false }), true;
      const { body } = await readJson(req, 12000);
      if (!body || typeof body.message !== 'string') return json(res, 400, { ok: false }), true;
      const user = currentUser(req);
      const ctx = body.context && typeof body.context === 'object' && !Array.isArray(body.context) ? body.context : {};
      const safeCtx = {}; for (const k of Object.keys(ctx).slice(0, 25)) safeCtx[cut(k, 40)] = Array.isArray(ctx[k]) ? ctx[k].slice(0, 15).map(x => cut(x, 160)) : typeof ctx[k] === 'object' ? cut(JSON.stringify(ctx[k]), 1200) : cut(ctx[k], 400);
      const fp = crypto.createHash('sha1').update(cut(body.kind, 40) + cut(body.message, 200) + cut(body.url, 200)).digest('hex');
      if (tooNoisy(fp)) return json(res, 202, { ok: true }), true;
      const id = record({ source: 'browser', kind: cut(body.kind, 40) || 'js_error', level: body.level === 'warn' ? 'warn' : 'error', message: cut(body.message, 1000), stack: cut(body.stack, 6000), url: cut(body.url, 500), method: cut(body.method, 10), status: Number.isInteger(body.status) ? body.status : null, user, ip: clientIp(req), userAgent: req.headers['user-agent'] || '', context: safeCtx });
      return json(res, 202, { ok: true, id }), true;
    }
    const user = currentUser(req);
    if (!user) return fail(res, 401, 'Please sign in.'), true;
    if (!isAdmin(user)) return fail(res, 403, 'Admin access required.'), true;
    const url = new URL(req.url, 'http://x');
    if (method === 'GET' && pathname === '/api/admin/errors') {
      const days = url.searchParams.get('days');
      return json(res, 200, { errors: list({ days, source: url.searchParams.get('source') || '', search: url.searchParams.get('q') || '', showResolved: url.searchParams.get('resolved') === '1', limit: url.searchParams.get('limit') }), summary: summary(days) }), true;
    }
    let m = pathname.match(/^\/api\/admin\/errors\/(\d+)\/resolve$/);
    if (method === 'POST' && m) { q('UPDATE error_log SET resolved = 1 WHERE id = ?').run(Number(m[1])); return json(res, 200, { ok: true }), true; }
    m = pathname.match(/^\/api\/admin\/errors\/group\/([a-f0-9]{16})\/resolve$/);
    if (method === 'POST' && m) { q('UPDATE error_log SET resolved = 1 WHERE fingerprint = ?').run(m[1]); return json(res, 200, { ok: true }), true; }
    if (method === 'POST' && pathname === '/api/admin/errors/clear') { q('UPDATE error_log SET resolved = 1 WHERE resolved = 0').run(); return json(res, 200, { ok: true }), true; }
    return fail(res, 404, 'Not found.'), true;
  }

  return { record, list, summary, purge, handle };
}

module.exports = { createErrorLog };
