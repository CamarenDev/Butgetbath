const path = require('node:path');
const fs = require('node:fs/promises');
const crypto = require('node:crypto');
const { services, counties, guides } = require('../content');
const gallery = require('../gallery.json');
const seed = require('./seed');

const MAX_MEDIA_BYTES = 8 * 1024 * 1024;
const BOT_RE = /bot|crawl|spider|slurp|facebookexternalhit|preview|monitor|curl|wget|python-requests|headless|lighthouse/i;
const ago = days => new Date(Date.now() - days * 864e5).toISOString().slice(0, 10);

// Every replaceable image on the public site. Until an admin uploads a file, /media/<slot> serves a placeholder.
const staticSlots = [
  { slot: 'hero', label: 'Home page hero image', group: 'Pages', ratio: '11:12' },
  { slot: 'about', label: 'About page photo', group: 'Pages', ratio: '4:3' },
  { slot: 'community-banner', label: 'Community forum banner', group: 'Pages', ratio: '16:5' },
  ...services.map(s => ({ slot: `service-${s.slug}`, label: `Service: ${s.name}`, group: 'Services', ratio: '16:10' })),
  ...counties.map(c => ({ slot: `county-${c.slug}`, label: `Service area: ${c.name}`, group: 'Service areas', ratio: '16:10' })),
  ...guides.map(g => ({ slot: `guide-${g.slug}`, label: `Guide: ${g.title}`, group: 'Guides', ratio: '16:10' }))
];

const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const { illustrationSvg } = require('./illustrations');

function detectImage(buf) {
  if (buf.length > 12 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return ['image/jpeg', '.jpg'];
  if (buf.length > 12 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return ['image/png', '.png'];
  if (buf.length > 12 && buf.subarray(0, 4).toString('latin1') === 'RIFF' && buf.subarray(8, 12).toString('latin1') === 'WEBP') return ['image/webp', '.webp'];
  return null;
}

function createCms({ db, dataDir, json, fail, readBuffer, readJson, currentUser, isAdmin, limited, text, clientIp: getClientIp }) {
  const q = sql => db.prepare(sql);
  const now = () => new Date().toISOString();
  const mediaDir = path.join(dataDir, 'media');
  const getSetting = (k, d = '') => q('SELECT value FROM settings WHERE key = ?').get(k)?.value ?? d;
  const setSetting = (k, v) => q('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(k, String(v));

  // First-run content: forum and portfolio starter data, clearly marked so the admin can replace it.
  if (!q('SELECT 1 FROM forum_categories LIMIT 1').get() && getSetting('seeded_forum') !== '1') {
    const cat = new Map();
    seed.categories.forEach(([slug, name, description], i) => cat.set(slug, Number(q('INSERT INTO forum_categories (slug, name, description, sort) VALUES (?, ?, ?, ?)').run(slug, name, description, i).lastInsertRowid)));
    const base = Date.now();
    seed.threads.forEach(([slug, title, body, replies, pinned], i) => {
      const at = new Date(base - (seed.threads.length - i) * 36e5 * 7).toISOString();
      const id = Number(q('INSERT INTO forum_threads (category_id, author, staff, title, body, pinned, seed, views, created_at, last_post_at) VALUES (?, ?, 1, ?, ?, ?, 1, ?, ?, ?)').run(cat.get(slug), seed.TEAM, title, body, pinned ? 1 : 0, 20 + (i * 37) % 180, at, at).lastInsertRowid);
      for (const [rb] of replies) q('INSERT INTO forum_posts (thread_id, author, staff, body, created_at) VALUES (?, ?, 1, ?, ?)').run(id, seed.TEAM, rb, at);
    });
    setSetting('seeded_forum', '1');
  }
  if (getSetting('seeded_portfolio') !== '1') {
    gallery.projects.forEach((p, i) => q('INSERT INTO projects (title, category, county, summary, alt, sample, sort) VALUES (?, ?, ?, ?, ?, 1, ?)').run(p.title, p.category, p.county, p.summary, p.alt, i));
    gallery.reviews.forEach(r => q('INSERT INTO reviews (name, town, rating, body, sample, created_at) VALUES (?, ?, ?, ?, 1, ?)').run(r.name, r.town, r.rating, r.text, now()));
    setSetting('seeded_portfolio', '1');
  }

  const clientIp = getClientIp || (req => req.socket && req.socket.remoteAddress);
  let secret = getSetting('visitor_secret');
  if (!secret) { secret = crypto.randomBytes(24).toString('hex'); setSetting('visitor_secret', secret); }

  const slotInfo = slot => {
    const fixed = staticSlots.find(s => s.slot === slot);
    if (fixed) return fixed;
    const m = slot.match(/^project-(\d+)$/);
    const p = m && q('SELECT * FROM projects WHERE id = ?').get(Number(m[1]));
    return p ? { slot, label: `Project: ${p.title}`, group: 'Projects', ratio: '4:5' } : null;
  };

  async function media(req, res, pathname) {
    const m = pathname.match(/^\/media\/([a-z0-9-]{1,80})$/);
    if (!m) return false;
    const info = slotInfo(m[1]);
    if (!info) { res.writeHead(404); res.end(); return true; }
    const row = q('SELECT * FROM media WHERE slot = ?').get(m[1]);
    try {
      if (row) {
        const data = await fs.readFile(path.join(mediaDir, row.file));
        res.writeHead(200, { 'Content-Type': row.mime, 'Content-Length': data.length, 'Cache-Control': 'public, max-age=300', 'X-Content-Type-Options': 'nosniff' });
        res.end(req.method === 'HEAD' ? undefined : data);
        return true;
      }
    } catch { /* missing file: fall through to placeholder */ }
    if (info.fallback) { res.writeHead(302, { Location: info.fallback, 'Cache-Control': 'no-cache' }); res.end(); return true; }
    const svg = illustrationSvg(m[1], info.label);
    res.writeHead(200, { 'Content-Type': 'image/svg+xml; charset=utf-8', 'Content-Length': Buffer.byteLength(svg), 'Cache-Control': 'no-cache', 'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'" });
    res.end(req.method === 'HEAD' ? undefined : svg);
    return true;
  }

  const projectOut = p => ({ id: p.id, title: p.title, category: p.category, county: p.county, summary: p.summary, alt: p.alt || p.title, sample: Boolean(p.sample), image: `/media/project-${p.id}?v=${q('SELECT updated_at FROM media WHERE slot = ?').get(`project-${p.id}`)?.updated_at.slice(-8, -1) || 0}` });
  const reviewOut = r => ({ id: r.id, name: r.name, town: r.town, rating: r.rating, text: r.body, sample: Boolean(r.sample), date: r.created_at });
  const firstNameLast = name => { const p = String(name).trim().split(/\s+/); return p.length > 1 ? `${p[0]} ${p[p.length - 1][0]}.` : p[0]; };
  const clampInt = (v, min, max, d) => { const n = Number(v); return Number.isInteger(n) && n >= min && n <= max ? n : d; };
  const bool = v => v ? 1 : 0;
  const tableOf = { contacts: 'contacts', projects: 'projects', reviews: 'reviews', 'forum/threads': 'forum_threads', 'forum/posts': 'forum_posts', 'forum/categories': 'forum_categories' };

  function stats() {
    const total = (since, col) => q(`SELECT COUNT(${col}) AS n FROM visits WHERE day >= ?`).get(since).n;
    const uniq = since => q('SELECT COUNT(DISTINCT visitor) AS n FROM visits WHERE day >= ?').get(since).n;
    const rows = q('SELECT day, COUNT(*) AS views, COUNT(DISTINCT visitor) AS visitors FROM visits WHERE day >= ? GROUP BY day').all(ago(29));
    const byDay = new Map(rows.map(r => [r.day, r]));
    const series = Array.from({ length: 30 }, (_, i) => { const d = ago(29 - i); return { day: d, views: byDay.get(d)?.views || 0, visitors: byDay.get(d)?.visitors || 0 }; });
    const top = (col, limit = 8) => q(`SELECT ${col} AS name, COUNT(*) AS n FROM visits WHERE day >= ? AND ${col} != '' GROUP BY ${col} ORDER BY n DESC LIMIT ${limit}`).all(ago(29));
    return {
      today: { views: total(ago(0), '*'), visitors: uniq(ago(0)) },
      week: { views: total(ago(6), '*'), visitors: uniq(ago(6)) },
      month: { views: total(ago(29), '*'), visitors: uniq(ago(29)) },
      series, topPages: top('path'), referrers: top('referrer'), devices: top('device', 4),
      counts: {
        newContacts: q("SELECT COUNT(*) AS n FROM contacts WHERE status = 'new'").get().n,
        contacts: q('SELECT COUNT(*) AS n FROM contacts').get().n,
        openTickets: q("SELECT COUNT(*) AS n FROM requests WHERE status IN ('submitted','in_progress')").get().n,
        users: q('SELECT COUNT(*) AS n FROM users').get().n,
        threads: q("SELECT COUNT(*) AS n FROM forum_threads WHERE status = 'published'").get().n,
        posts: q("SELECT COUNT(*) AS n FROM forum_posts WHERE status = 'published'").get().n,
        pendingReviews: q("SELECT COUNT(*) AS n FROM reviews WHERE status = 'pending'").get().n,
        reviews: q("SELECT COUNT(*) AS n FROM reviews WHERE status = 'published'").get().n,
        projects: q('SELECT COUNT(*) AS n FROM projects WHERE published = 1').get().n,
        placeholders: staticSlots.length + q('SELECT COUNT(*) AS n FROM projects').get().n - q('SELECT COUNT(*) AS n FROM media').get().n
      },
      recentContacts: q('SELECT id, type, name, interest, status, created_at FROM contacts ORDER BY id DESC LIMIT 5').all()
    };
  }

  const threadRow = t => ({ id: t.id, title: t.title, category: t.category_slug, categoryName: t.category_name, author: t.author, staff: Boolean(t.staff), pinned: Boolean(t.pinned), locked: Boolean(t.locked), status: t.status, views: t.views, replies: t.replies, createdAt: t.created_at, lastPostAt: t.last_post_at });
  const THREAD_SELECT = "SELECT t.*, c.slug AS category_slug, c.name AS category_name, (SELECT COUNT(*) FROM forum_posts p WHERE p.thread_id = t.id AND p.status = 'published') AS replies FROM forum_threads t JOIN forum_categories c ON c.id = t.category_id";

  async function handle(req, res, pathname, method) {
    let m;
    // ---- Public
    if (method === 'POST' && pathname === '/api/track') {
      const body = (await readJson(req, 2000)).body || {};
      const ua = String(req.headers['user-agent'] || '');
      if (getSetting('analytics_on') !== '1' || req.headers.dnt === '1' || req.headers['sec-gpc'] === '1' || BOT_RE.test(ua) || !ua) return json(res, 204, {}), true;
      if (limited(req, 'track', 300)) return json(res, 204, {}), true;
      const p = typeof body.path === 'string' && body.path.startsWith('/') ? body.path.split(/[?#]/)[0].slice(0, 200) : '/';
      if (/^\/(admin|account|api)\b/.test(p)) return json(res, 204, {}), true;
      let referrer = '';
      try { const u = new URL(String(body.referrer || '')); if (u.host !== req.headers.host) referrer = u.host.replace(/^www\./, '').slice(0, 100); } catch { /* no referrer */ }
      const day = ago(0);
      const visitor = crypto.createHmac('sha256', secret).update(`${day}|${clientIp(req)}|${ua}`).digest('hex').slice(0, 20);
      const browser = /edg\//i.test(ua) ? 'Edge' : /opr\/|opera/i.test(ua) ? 'Opera' : /firefox|fxios/i.test(ua) ? 'Firefox' : /chrome|crios/i.test(ua) ? 'Chrome' : /safari/i.test(ua) ? 'Safari' : 'Other';
      const os = /iphone|ipad|ipod/i.test(ua) ? 'iOS' : /android/i.test(ua) ? 'Android' : /windows/i.test(ua) ? 'Windows' : /mac os x|macintosh/i.test(ua) ? 'macOS' : /cros/i.test(ua) ? 'ChromeOS' : /linux/i.test(ua) ? 'Linux' : 'Other';
      const device = /ipad|tablet/i.test(ua) ? 'tablet' : /mobi|android|iphone/i.test(ua) ? 'mobile' : 'desktop';
      q('INSERT INTO visits (ts, day, path, visitor, referrer, device, browser, os) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(Date.now(), day, p, visitor, referrer, device, browser, os);
      return json(res, 204, {}), true;
    }
    if (method === 'GET' && pathname === '/api/public/portfolio') {
      return json(res, 200, { projects: q('SELECT * FROM projects WHERE published = 1 ORDER BY sort, id').all().map(projectOut), reviews: q("SELECT * FROM reviews WHERE status = 'published' ORDER BY id DESC").all().map(reviewOut) }), true;
    }
    if (method === 'GET' && pathname === '/api/public/site') return json(res, 200, { banner: getSetting('banner_on') === '1' ? getSetting('banner_text') : '' }), true;
    if (method === 'POST' && pathname === '/api/reviews') {
      if (limited(req, 'review', 5)) return fail(res, 429, 'Too many submissions. Please try again later.'), true;
      const { body, error } = await readJson(req);
      if (error) return fail(res, 400, 'Please check the form and try again.'), true;
      if (typeof body.website === 'string' && body.website.trim()) return json(res, 201, { message: 'Thanks!' }), true;
      const name = text(body.name, 100), town = text(body.town ?? '', 100), msg = text(body.text, 1500);
      if (!name || town === null || !msg || msg.length < 10) return fail(res, 400, 'Please enter your name and a short review.'), true;
      q("INSERT INTO reviews (name, town, rating, body, status, created_at) VALUES (?, ?, ?, ?, 'pending', ?)").run(name, town, clampInt(body.rating, 1, 5, 5), msg, now());
      return json(res, 201, { message: 'Thank you! Your review will appear after our team approves it.' }), true;
    }

    // ---- Forum (public read)
    if (method === 'GET' && pathname === '/api/forum/categories') {
      const rows = q("SELECT c.*, (SELECT COUNT(*) FROM forum_threads t WHERE t.category_id = c.id AND t.status = 'published') AS threads, (SELECT MAX(last_post_at) FROM forum_threads t WHERE t.category_id = c.id AND t.status = 'published') AS last FROM forum_categories c ORDER BY sort, id").all();
      return json(res, 200, { categories: rows.map(c => ({ id: c.id, slug: c.slug, name: c.name, description: c.description, threads: c.threads, last: c.last })) }), true;
    }
    if (method === 'GET' && pathname === '/api/forum/threads') {
      const url = new URL(req.url, 'http://x');
      const cat = url.searchParams.get('category') || '', term = (url.searchParams.get('q') || '').slice(0, 80).toLowerCase();
      const page = clampInt(url.searchParams.get('page'), 1, 1000, 1);
      let rows = q(`${THREAD_SELECT} WHERE t.status = 'published' ORDER BY t.pinned DESC, t.last_post_at DESC`).all();
      if (cat) rows = rows.filter(r => r.category_slug === cat);
      if (term) rows = rows.filter(r => (r.title + ' ' + r.body).toLowerCase().includes(term));
      return json(res, 200, { total: rows.length, page, threads: rows.slice((page - 1) * 15, page * 15).map(t => ({ ...threadRow(t), excerpt: t.body.replace(/\s+/g, ' ').slice(0, 180) })) }), true;
    }
    if (method === 'GET' && (m = pathname.match(/^\/api\/forum\/threads\/(\d+)$/))) {
      const t = q(`${THREAD_SELECT} WHERE t.id = ?`).get(Number(m[1]));
      const user = currentUser(req);
      if (!t || (t.status !== 'published' && !isAdmin(user))) return fail(res, 404, 'Topic not found.'), true;
      if (t.status === 'published') q('UPDATE forum_threads SET views = views + 1 WHERE id = ?').run(t.id);
      const posts = q(isAdmin(user) ? 'SELECT * FROM forum_posts WHERE thread_id = ? ORDER BY id' : "SELECT * FROM forum_posts WHERE thread_id = ? AND status = 'published' ORDER BY id").all(t.id);
      return json(res, 200, { thread: { ...threadRow(t), body: t.body }, posts: posts.map(p => ({ id: p.id, author: p.author, staff: Boolean(p.staff), body: p.body, status: p.status, createdAt: p.created_at })) }), true;
    }

    // ---- Forum (signed-in)
    if (method === 'POST' && (pathname === '/api/forum/threads' || /^\/api\/forum\/threads\/\d+\/replies$/.test(pathname))) {
      const user = currentUser(req);
      if (!user) return fail(res, 401, 'Please sign in to join the conversation.'), true;
      if (!user.verified) return fail(res, 403, 'Please confirm your email first.'), true;
      if (limited(req, 'forum', 12)) return fail(res, 429, 'You are posting too quickly. Please wait a few minutes.'), true;
      const { body, error } = await readJson(req, 12000);
      if (error) return fail(res, 400, 'Please check your post and try again.'), true;
      const msg = text(body.body, 5000);
      if (!msg || msg.length < 5) return fail(res, 400, 'Please write a little more.'), true;
      const staff = isAdmin(user);
      const author = staff && body.asTeam ? seed.TEAM : firstNameLast(user.name);
      if (pathname === '/api/forum/threads') {
        const title = text(body.title, 140), cat = q('SELECT id FROM forum_categories WHERE slug = ?').get(String(body.category || ''));
        if (!title || title.length < 5 || !cat) return fail(res, 400, 'Please choose a category and enter a title.'), true;
        const id = Number(q('INSERT INTO forum_threads (category_id, user_id, author, staff, title, body, created_at, last_post_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(cat.id, user.id, author, bool(staff), title, msg, now(), now()).lastInsertRowid);
        return json(res, 201, { id }), true;
      }
      const t = q('SELECT * FROM forum_threads WHERE id = ?').get(Number(pathname.split('/')[4]));
      if (!t || t.status !== 'published') return fail(res, 404, 'Topic not found.'), true;
      if (t.locked && !staff) return fail(res, 403, 'This topic is closed to new replies.'), true;
      q('INSERT INTO forum_posts (thread_id, user_id, author, staff, body, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(t.id, user.id, author, bool(staff), msg, now());
      q('UPDATE forum_threads SET last_post_at = ? WHERE id = ?').run(now(), t.id);
      return json(res, 201, { ok: true }), true;
    }

    // ---- Admin
    if (!pathname.startsWith('/api/admin/') || pathname === '/api/admin/requests') return false;
    const admin = currentUser(req);
    if (!admin) return fail(res, 401, 'Please sign in.'), true;
    if (!isAdmin(admin)) return fail(res, 403, 'Not allowed.'), true;

    if (method === 'POST' && (m = pathname.match(/^\/api\/admin\/media\/([a-z0-9-]{1,80})$/))) {
      const info = slotInfo(m[1]);
      if (!info) return fail(res, 404, 'Unknown image slot.'), true;
      const data = await readBuffer(req, MAX_MEDIA_BYTES);
      if (data === null) return fail(res, 413, 'Images must be 8 MB or smaller.'), true;
      const type = detectImage(data);
      if (!type) return fail(res, 415, 'Please upload a JPG, PNG or WebP image.'), true;
      await fs.mkdir(mediaDir, { recursive: true });
      const file = `${m[1]}-${Date.now()}${type[1]}`;
      await fs.writeFile(path.join(mediaDir, file), data, { mode: 0o600 });
      const old = q('SELECT file FROM media WHERE slot = ?').get(m[1]);
      let alt = '';
      try { alt = decodeURIComponent(String(req.headers['x-alt'] || '')).trim().slice(0, 200); } catch { /* ignore */ }
      q('INSERT INTO media (slot, file, mime, alt, updated_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(slot) DO UPDATE SET file = excluded.file, mime = excluded.mime, alt = excluded.alt, updated_at = excluded.updated_at').run(m[1], file, type[0], alt, now());
      if (old) await fs.rm(path.join(mediaDir, old.file), { force: true });
      return json(res, 201, { ok: true }), true;
    }
    if (method === 'DELETE' && (m = pathname.match(/^\/api\/admin\/media\/([a-z0-9-]{1,80})$/))) {
      const old = q('SELECT file FROM media WHERE slot = ?').get(m[1]);
      if (old) { q('DELETE FROM media WHERE slot = ?').run(m[1]); await fs.rm(path.join(mediaDir, old.file), { force: true }); }
      return json(res, 200, { ok: true }), true;
    }
    if (method === 'GET' && pathname === '/api/admin/media') {
      const have = new Map(q('SELECT * FROM media').all().map(r => [r.slot, r]));
      const slots = [...staticSlots, ...q('SELECT id, title FROM projects ORDER BY sort, id').all().map(p => ({ slot: `project-${p.id}`, label: `Project: ${p.title}`, group: 'Projects', ratio: '4:5' }))];
      return json(res, 200, { slots: slots.map(s => ({ slot: s.slot, label: s.label, group: s.group, ratio: s.ratio, custom: have.has(s.slot), updatedAt: have.get(s.slot)?.updated_at || null })) }), true;
    }

    if (method === 'GET' && pathname === '/api/admin/stats') return json(res, 200, stats()), true;
    if (method === 'GET' && pathname === '/api/admin/users') {
      return json(res, 200, { users: q('SELECT u.id, u.name, u.email, u.phone, u.verified, u.created_at, (SELECT COUNT(*) FROM requests r WHERE r.user_id = u.id AND r.status != \'draft\') AS requests FROM users u ORDER BY u.id DESC').all().map(u => ({ ...u, verified: Boolean(u.verified), admin: isAdmin({ ...u, verified: 1 }) })) }), true;
    }
    if (method === 'GET' && pathname === '/api/admin/settings') return json(res, 200, { banner: getSetting('banner_text'), bannerOn: getSetting('banner_on') === '1', analyticsOn: getSetting('analytics_on') === '1' }), true;
    if (method === 'GET' && pathname === '/api/admin/contacts') return json(res, 200, { contacts: q('SELECT * FROM contacts ORDER BY id DESC LIMIT 500').all() }), true;
    if (method === 'GET' && pathname === '/api/admin/projects') return json(res, 200, { projects: q('SELECT * FROM projects ORDER BY sort, id').all().map(p => ({ ...p, published: Boolean(p.published), sample: Boolean(p.sample) })) }), true;
    if (method === 'GET' && pathname === '/api/admin/reviews') return json(res, 200, { reviews: q('SELECT * FROM reviews ORDER BY (status = \'pending\') DESC, id DESC').all().map(r => ({ ...r, text: r.body, sample: Boolean(r.sample) })) }), true;
    if (method === 'GET' && pathname === '/api/admin/forum') {
      return json(res, 200, {
        categories: q('SELECT * FROM forum_categories ORDER BY sort, id').all(),
        threads: q(`${THREAD_SELECT} ORDER BY t.id DESC`).all().map(t => ({ ...threadRow(t), seed: Boolean(t.seed) }))
      }), true;
    }

    if (method === 'DELETE') {
      m = pathname.match(/^\/api\/admin\/(contacts|projects|reviews|forum\/threads|forum\/posts|forum\/categories)\/(\d+)$/);
      if (!m) return fail(res, 404, 'Not found.'), true;
      const id = Number(m[2]);
      if (m[1] === 'projects') {
        const old = q('SELECT file FROM media WHERE slot = ?').get(`project-${id}`);
        q('DELETE FROM media WHERE slot = ?').run(`project-${id}`);
        if (old) await fs.rm(path.join(mediaDir, old.file), { force: true });
      }
      q(`DELETE FROM ${tableOf[m[1]]} WHERE id = ?`).run(id);
      return json(res, 200, { ok: true }), true;
    }

    if (method !== 'POST') return fail(res, 404, 'Not found.'), true;
    const { body, error } = await readJson(req, 12000);
    if (error) return fail(res, 400, 'Please check the form and try again.'), true;
    const str = (k, max, d = '') => { const v = text(body[k] ?? d, max); return v === null ? d : v; };
    const has = k => body[k] !== undefined;

    if (pathname === '/api/admin/settings') {
      setSetting('banner_text', str('banner', 240)); setSetting('banner_on', body.bannerOn ? '1' : '0'); setSetting('analytics_on', body.analyticsOn ? '1' : '0');
      return json(res, 200, { ok: true }), true;
    }
    if (pathname === '/api/admin/projects') {
      const title = text(body.title, 120);
      if (!title) return fail(res, 400, 'Please enter a title.'), true;
      const sort = (q('SELECT MAX(sort) AS n FROM projects').get().n ?? -1) + 1;
      const id = Number(q('INSERT INTO projects (title, category, county, summary, alt, published, sort) VALUES (?, ?, ?, ?, ?, ?, ?)').run(title, str('category', 60), str('county', 60), str('summary', 240), str('alt', 200), body.published === false ? 0 : 1, sort).lastInsertRowid);
      return json(res, 201, { id }), true;
    }
    if (pathname === '/api/admin/reviews') {
      const name = text(body.name, 100), msg = text(body.text, 1500);
      if (!name || !msg) return fail(res, 400, 'Please enter a name and review.'), true;
      q('INSERT INTO reviews (name, town, rating, body, status, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(name, str('town', 100), clampInt(body.rating, 1, 5, 5), msg, body.status === 'hidden' ? 'hidden' : 'published', now());
      return json(res, 201, { ok: true }), true;
    }
    if (pathname === '/api/admin/forum/categories') {
      const name = text(body.name, 80);
      if (!name) return fail(res, 400, 'Please enter a name.'), true;
      const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 50) || 'category';
      if (q('SELECT 1 FROM forum_categories WHERE slug = ?').get(slug)) return fail(res, 409, 'A category with that name already exists.'), true;
      q('INSERT INTO forum_categories (slug, name, description, sort) VALUES (?, ?, ?, ?)').run(slug, name, str('description', 240), (q('SELECT MAX(sort) AS n FROM forum_categories').get().n ?? -1) + 1);
      return json(res, 201, { ok: true }), true;
    }

    m = pathname.match(/^\/api\/admin\/(contacts|projects|reviews|forum\/threads|forum\/posts|forum\/categories)\/(\d+)$/);
    if (!m) return fail(res, 404, 'Not found.'), true;
    const id = Number(m[2]);
    const sets = [], vals = [];
    const put = (col, v) => { sets.push(`${col} = ?`); vals.push(v); };
    const oneOf = (k, list) => has(k) && list.includes(body[k]);
    switch (m[1]) {
      case 'contacts':
        if (oneOf('status', ['new', 'contacted', 'closed'])) put('status', body.status);
        if (has('notes') && text(body.notes, 2000) !== null) put('notes', body.notes.trim());
        break;
      case 'projects':
        for (const [k, max] of [['title', 120], ['category', 60], ['county', 60], ['summary', 240], ['alt', 200]]) if (has(k) && text(body[k], max) !== null && (k !== 'title' || body[k].trim())) put(k, body[k].trim());
        if (has('published')) put('published', bool(body.published));
        if (has('sort')) put('sort', clampInt(body.sort, 0, 10000, 0));
        break;
      case 'reviews':
        if (oneOf('status', ['published', 'pending', 'hidden'])) put('status', body.status);
        for (const [k, col, max] of [['name', 'name', 100], ['town', 'town', 100], ['text', 'body', 1500]]) if (has(k) && text(body[k], max) !== null && (k === 'town' || body[k].trim())) put(col, body[k].trim());
        if (has('rating')) put('rating', clampInt(body.rating, 1, 5, 5));
        if (has('sample')) put('sample', bool(body.sample));
        break;
      case 'forum/threads':
        if (oneOf('status', ['published', 'hidden'])) put('status', body.status);
        if (has('pinned')) put('pinned', bool(body.pinned));
        if (has('locked')) put('locked', bool(body.locked));
        if (has('title') && text(body.title, 140)?.length >= 5) put('title', body.title.trim());
        if (has('body') && text(body.body, 5000)?.length >= 5) put('body', body.body.trim());
        if (has('category')) { const c = q('SELECT id FROM forum_categories WHERE slug = ?').get(String(body.category)); if (c) put('category_id', c.id); }
        break;
      case 'forum/posts':
        if (oneOf('status', ['published', 'hidden'])) put('status', body.status);
        if (has('body') && text(body.body, 5000)?.length >= 5) put('body', body.body.trim());
        break;
      case 'forum/categories':
        if (has('name') && text(body.name, 80)) put('name', body.name.trim());
        if (has('description') && text(body.description, 240) !== null) put('description', body.description.trim());
        break;
    }
    if (!sets.length) return fail(res, 400, 'Nothing to update.'), true;
    q(`UPDATE ${tableOf[m[1]]} SET ${sets.join(', ')} WHERE id = ?`).run(...vals, id);
    return json(res, 200, { ok: true }), true;
  }

  return { handle, media };
}

module.exports = { createCms };
