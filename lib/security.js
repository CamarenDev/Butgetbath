// Append-only security log plus account lockout. Failures are counted per email (whether or not the account exists)
// so lockouts cannot be used to discover which emails are registered.
const LOCK_AFTER = 8, LOCK_WINDOW_MS = 15 * 60 * 1000;

function createSecurity({ db, retentionDays = 365 }) {
  db.exec(`CREATE TABLE IF NOT EXISTS security_events (
    id INTEGER PRIMARY KEY, kind TEXT NOT NULL, severity TEXT NOT NULL DEFAULT 'info', user_id INTEGER, email TEXT, ip TEXT, detail TEXT, created_at TEXT NOT NULL
  ); CREATE INDEX IF NOT EXISTS idx_security_events_kind ON security_events(kind, created_at); CREATE INDEX IF NOT EXISTS idx_security_events_email ON security_events(email, created_at);`);
  const q = sql => db.prepare(sql);
  const iso = ms => new Date(ms).toISOString();

  function log(kind, { severity = 'info', userId = null, email = null, ip = null, detail = '' } = {}) {
    q('INSERT INTO security_events (kind, severity, user_id, email, ip, detail, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(kind, severity, userId, email ? String(email).toLowerCase().slice(0, 200) : null, ip ? String(ip).slice(0, 64) : null, String(detail).slice(0, 300), iso(Date.now()));
  }

  // Returns ms remaining on a lock, or 0.
  function lockedFor(email, now = Date.now()) {
    if (!email) return 0;
    const e = String(email).toLowerCase();
    const since = iso(now - LOCK_WINDOW_MS);
    const okAt = q("SELECT MAX(created_at) AS t FROM security_events WHERE email = ? AND kind = 'login_ok'").get(e).t || '';
    const rows = q("SELECT created_at FROM security_events WHERE email = ? AND kind = 'login_failed' AND created_at > ? AND created_at > ? ORDER BY created_at DESC LIMIT ?").all(e, since, okAt, LOCK_AFTER);
    if (rows.length < LOCK_AFTER) return 0;
    return Math.max(0, Date.parse(rows[0].created_at) + LOCK_WINDOW_MS - now);
  }

  function recent({ limit = 200, kind = '', severity = '' } = {}) {
    const where = [], args = [];
    if (kind) { where.push('kind = ?'); args.push(kind); }
    if (severity) { where.push('severity = ?'); args.push(severity); }
    return q(`SELECT id, kind, severity, user_id AS userId, email, ip, detail, created_at AS at FROM security_events ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY id DESC LIMIT ?`).all(...args, Math.min(Number(limit) || 200, 1000));
  }
  function summary(days = 7) {
    const since = iso(Date.now() - days * 864e5);
    return q('SELECT kind, COUNT(*) AS n FROM security_events WHERE created_at > ? GROUP BY kind ORDER BY n DESC').all(since);
  }
  const purge = () => q('DELETE FROM security_events WHERE created_at < ?').run(iso(Date.now() - retentionDays * 864e5));

  async function handle(req, res, pathname, method, { json, fail, currentUser, isAdmin }) {
    if (method !== 'GET' || !pathname.startsWith('/api/admin/security')) return false;
    const user = currentUser(req);
    if (!user) return fail(res, 401, 'Please sign in.'), true;
    if (!isAdmin(user)) return fail(res, 403, 'Admin access required.'), true;
    const url = new URL(req.url, 'http://x');
    return json(res, 200, { events: recent({ limit: url.searchParams.get('limit'), kind: url.searchParams.get('kind') || '', severity: url.searchParams.get('severity') || '' }), summary: summary(Number(url.searchParams.get('days')) || 7) }), true;
  }

  return { log, lockedFor, recent, summary, purge, handle, LOCK_AFTER };
}

module.exports = { createSecurity };
