// Company-wide reporting (finance, pipeline, crew, visitor heatmaps) and the automatic holiday greeting and sale system.
const crypto = require('node:crypto');

const TZ = process.env.BUSINESS_TZ || 'America/Chicago';
const DAY_MS = 864e5;
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const SEND_HOUR = 9;
const DEFAULT_METADATA = { kind: 'holiday-and-marketing-defaults', source: 'bundled application defaults', verified: false, verification: 'operator review required; not externally verified' };

const pad = n => String(n).padStart(2, '0');
const ymd = (y, m, d) => `${y}-${pad(m + 1)}-${pad(d)}`;
const addDays = (iso, n) => new Date(Date.parse(`${iso}T12:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);
const nthDow = (y, m, dow, n) => { const first = new Date(Date.UTC(y, m, 1)).getUTCDay(); return ymd(y, m, 1 + (dow - first + 7) % 7 + (n - 1) * 7); };
const lastDow = (y, m, dow) => { const last = new Date(Date.UTC(y, m + 1, 0)); return ymd(y, m, last.getUTCDate() - (last.getUTCDay() - dow + 7) % 7); };
function easter(y) {
  const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, mm = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * mm + 114) / 31), day = (h + l - 7 * mm + 114) % 31 + 1;
  return ymd(y, month - 1, day);
}
// Hanukkah starts at sundown the evening before 25 Kislev; the Hebrew calendar comes from Intl.
function hanukkah(y) {
  const f = new Intl.DateTimeFormat('en-US-u-ca-hebrew', { timeZone: 'UTC', month: 'long', day: 'numeric' });
  for (let t = Date.UTC(y, 10, 15, 12); t < Date.UTC(y, 11, 31, 12); t += DAY_MS) {
    const p = Object.fromEntries(f.formatToParts(t).map(x => [x.type, x.value]));
    if (p.month === 'Kislev' && p.day === '25') return new Date(t - DAY_MS).toISOString().slice(0, 10);
  }
  return ymd(y, 11, 15);
}

// sale: whether it ships with a discount by default. lead: days before the holiday to send. tail: days the offer stays valid after it.
const HOLIDAYS = [
  { key: 'new-years', name: "New Year's Day", greeting: 'Happy New Year', wish: 'Wishing you a healthy, happy and prosperous year ahead.', date: y => ymd(y, 0, 1), sale: true, pct: 10, lead: 0, tail: 30, base: 'NEWYEAR' },
  { key: 'valentines', name: "Valentine's Day", greeting: "Happy Valentine's Day", wish: 'We hope your day is filled with love and the people who matter most.', date: y => ymd(y, 1, 14), sale: false, pct: 10, lead: 0, tail: 7, base: 'LOVE' },
  { key: 'easter', name: 'Easter', greeting: 'Happy Easter', wish: 'Wishing you and your family a joyful Easter and a beautiful spring.', date: easter, sale: false, pct: 10, lead: 0, tail: 7, base: 'SPRING' },
  { key: 'mothers-day', name: "Mother's Day", greeting: "Happy Mother's Day", wish: 'Wishing every mom a relaxing and well-deserved day.', date: y => nthDow(y, 4, 0, 2), sale: false, pct: 10, lead: 0, tail: 7, base: 'MOM' },
  { key: 'memorial-day', name: 'Memorial Day', greeting: 'Happy Memorial Day', wish: 'We honor and remember those who gave everything for our country.', date: y => lastDow(y, 4, 1), sale: true, pct: 10, lead: 4, tail: 1, base: 'MEMORIAL' },
  { key: 'fathers-day', name: "Father's Day", greeting: "Happy Father's Day", wish: 'Wishing every dad a relaxing and well-deserved day.', date: y => nthDow(y, 5, 0, 3), sale: false, pct: 10, lead: 0, tail: 7, base: 'DAD' },
  { key: 'july-4', name: 'Independence Day', greeting: 'Happy 4th of July', wish: 'Wishing you a safe and joyful Independence Day with family and friends.', date: y => ymd(y, 6, 4), sale: true, pct: 10, lead: 3, tail: 2, base: 'JULY4' },
  { key: 'labor-day', name: 'Labor Day', greeting: 'Happy Labor Day', wish: 'Thank you to everyone who works so hard. Enjoy a well-earned weekend.', date: y => nthDow(y, 8, 1, 1), sale: true, pct: 10, lead: 3, tail: 1, base: 'LABOR' },
  { key: 'halloween', name: 'Halloween', greeting: 'Happy Halloween', wish: 'Wishing you a safe, fun and spooky night.', date: y => ymd(y, 9, 31), sale: false, pct: 10, lead: 0, tail: 7, base: 'BOO' },
  { key: 'thanksgiving', name: 'Thanksgiving', greeting: 'Happy Thanksgiving', wish: 'We are thankful for you. Wishing you a table full of good food and the people you love.', date: y => nthDow(y, 10, 4, 4), sale: false, pct: 10, lead: 0, tail: 4, base: 'THANKS' },
  { key: 'black-friday', name: 'Black Friday', greeting: 'Happy Thanksgiving', wish: 'We are thankful for you. Wishing you a table full of good food and the people you love.', date: y => addDays(nthDow(y, 10, 4, 4), 1), sale: true, pct: 15, lead: 3, tail: 3, base: 'BLACKFRIDAY' },
  { key: 'cyber-monday', name: 'Cyber Monday', greeting: 'Happy Cyber Monday', wish: 'Thank you for being part of the Budget Bath family.', date: y => addDays(nthDow(y, 10, 4, 4), 4), sale: false, pct: 10, lead: 0, tail: 0, base: 'CYBER' },
  { key: 'hanukkah', name: 'Hanukkah', greeting: 'Happy Hanukkah', wish: 'Wishing you eight nights of light, warmth and joy.', date: hanukkah, sale: false, pct: 10, lead: 0, tail: 7, base: 'LIGHTS' },
  { key: 'christmas', name: 'Christmas', greeting: 'Merry Christmas', wish: 'May your home be filled with warmth, laughter and good cheer this holiday season.', date: y => ymd(y, 11, 25), sale: true, pct: 10, lead: 10, tail: 6, base: 'CHRISTMAS' }
];
const holidayOf = key => HOLIDAYS.find(h => h.key === key);

function createCompany({ db, mailer, templates, siteUrl, notifyEmail, estimates, json, fail, readJson, currentUser, isAdmin, text }) {
  const q = sql => db.prepare(sql);
  const nowIso = () => new Date().toISOString();
  const getSetting = (k, d = '') => q('SELECT value FROM settings WHERE key = ?').get(k)?.value ?? d;
  const setSetting = (k, v) => q('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(k, v);
  const pauseMs = Number(process.env.HOLIDAY_MAIL_PAUSE_MS ?? 600);
  const localFmt = new Intl.DateTimeFormat('en-US', { timeZone: TZ, weekday: 'short', hourCycle: 'h23', hour: 'numeric', year: 'numeric', month: '2-digit', day: '2-digit' });
  const local = ms => { const p = Object.fromEntries(localFmt.formatToParts(ms).map(x => [x.type, x.value])); return { date: `${p.year}-${p.month}-${p.day}`, dow: DOW.indexOf(p.weekday), hour: Number(p.hour) % 24 }; };
  const money = c => `$${(c / 100).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

  // ---------- Company overview
  function monthKeys(count, now = Date.now()) {
    const d = new Date(now), out = [];
    for (let i = count - 1; i >= 0; i--) { const m = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - i, 1)); out.push(`${m.getUTCFullYear()}-${pad(m.getUTCMonth() + 1)}`); }
    return out;
  }
  const countBy = (sql, ...args) => q(sql).all(...args).map(r => ({ name: r.name || 'unknown', n: r.n }));

  function overview() {
    const months = monthKeys(12), first = `${months[0]}-01`;
    const series = (sql, ...args) => { const map = new Map(q(sql).all(...args).map(r => [r.m, r.v])); return months.map(m => map.get(m) || 0); };
    const revenue = series("SELECT substr(paid_on, 1, 7) AS m, SUM(amount_cents) AS v FROM estimate_payments WHERE paid_on >= ? GROUP BY m", first);
    const spend = series("SELECT substr(spent_on, 1, 7) AS m, SUM(amount_cents * deductible_pct / 100) AS v FROM expenses WHERE spent_on >= ? GROUP BY m", first);
    const labor = series("SELECT substr(t.work_date, 1, 7) AS m, SUM(t.minutes * CASE WHEN t.rate_cents > 0 THEN t.rate_cents ELSE e.rate_cents END / 60.0) AS v FROM time_entries t JOIN employees e ON e.id = t.employee_id WHERE t.status = 'approved' AND t.work_date >= ? GROUP BY m", first);
    const hours = series("SELECT substr(work_date, 1, 7) AS m, SUM(minutes) / 60.0 AS v FROM time_entries WHERE status IN ('approved', 'pending') AND work_date >= ? GROUP BY m", first);
    const leads = series('SELECT substr(created_at, 1, 7) AS m, COUNT(*) AS v FROM contacts WHERE created_at >= ? GROUP BY m', first);
    const newCustomers = series('SELECT substr(created_at, 1, 7) AS m, COUNT(*) AS v FROM customers WHERE created_at >= ? GROUP BY m', first);
    const jobsDone = series("SELECT substr(completed_at, 1, 7) AS m, COUNT(*) AS v FROM jobs WHERE completed_at >= ? GROUP BY m", first);
    const trend = months.map((m, i) => ({ month: m, revenueCents: revenue[i], expenseCents: spend[i] + Math.round(labor[i]), profitCents: revenue[i] - spend[i] - Math.round(labor[i]), hours: Math.round(hours[i] * 10) / 10, leads: leads[i], customers: newCustomers[i], jobsDone: jobsDone[i] }));
    const sum = k => trend.reduce((a, t) => a + t[k], 0);

    // Estimate pipeline and collections use the same calculator the estimator uses.
    const est = q('SELECT * FROM estimates').all().map(e => ({ e, total: estimates.calc(e).totals.totalCents }));
    const paidBy = new Map(q('SELECT estimate_id, SUM(amount_cents) AS n FROM estimate_payments GROUP BY estimate_id').all().map(r => [r.estimate_id, r.n]));
    const pipeline = ['draft', 'sent', 'accepted', 'declined'].map(s => ({ status: s, n: est.filter(x => x.e.status === s).length, cents: est.filter(x => x.e.status === s).reduce((a, x) => a + x.total, 0) }));
    const outstanding = est.filter(x => x.e.status === 'accepted').reduce((a, x) => a + Math.max(0, x.total - (paidBy.get(x.e.id) || 0)), 0);
    const decided = pipeline.find(p => p.status === 'accepted').n + pipeline.find(p => p.status === 'declined').n;
    const topCustomers = q('SELECT c.id, c.name, SUM(p.amount_cents) AS cents, COUNT(DISTINCT e.id) AS jobs FROM estimate_payments p JOIN estimates e ON e.id = p.estimate_id JOIN customers c ON c.id = e.customer_id GROUP BY c.id ORDER BY cents DESC LIMIT 8').all();
    const since = new Date(Date.now() - 30 * DAY_MS).toISOString().slice(0, 10);
    const crew = q("SELECT u.name, ROUND(SUM(t.minutes) / 60.0, 1) AS hours, COUNT(DISTINCT t.job_id) AS jobs FROM time_entries t JOIN employees e ON e.id = t.employee_id JOIN users u ON u.id = e.user_id WHERE t.work_date >= ? AND t.status IN ('approved', 'pending') GROUP BY e.id ORDER BY hours DESC LIMIT 10").all(since);
    const campaigns = q("SELECT COUNT(*) AS n, COALESCE(SUM(sent), 0) AS sent FROM holiday_campaigns WHERE status = 'done'").get();
    return {
      generatedAt: nowIso(), trend,
      totals: { revenueCents: sum('revenueCents'), expenseCents: sum('expenseCents'), profitCents: sum('profitCents'), hours: Math.round(sum('hours')), leads: sum('leads'), newCustomers: sum('customers'), jobsDone: sum('jobsDone'), outstandingCents: outstanding },
      pipeline, winRate: decided ? Math.round(pipeline.find(p => p.status === 'accepted').n / decided * 100) : null,
      customersByStatus: countBy('SELECT status AS name, COUNT(*) AS n FROM customers GROUP BY status ORDER BY n DESC'),
      jobsByStatus: countBy('SELECT status AS name, COUNT(*) AS n FROM jobs GROUP BY status ORDER BY n DESC'),
      leadsByType: countBy('SELECT type AS name, COUNT(*) AS n FROM contacts GROUP BY type ORDER BY n DESC'),
      leadsByStatus: countBy('SELECT status AS name, COUNT(*) AS n FROM contacts GROUP BY status ORDER BY n DESC'),
      expensesByCategory: q('SELECT category AS name, SUM(amount_cents * deductible_pct / 100) AS n FROM expenses WHERE spent_on >= ? GROUP BY category ORDER BY n DESC LIMIT 8').all(first),
      topCustomers, crew,
      people: { employees: q("SELECT COUNT(*) AS n FROM employees WHERE status = 'active'").get().n, customers: q('SELECT COUNT(*) AS n FROM customers').get().n, openJobs: q("SELECT COUNT(*) AS n FROM jobs WHERE status NOT IN ('completed', 'cancelled')").get().n, marketable: audience().eligible },
      holidays: { campaigns: campaigns.n, emailsSent: campaigns.sent }
    };
  }

  // ---------- Visitor insights
  function insights(days) {
    const span = Math.min(Math.max(Number(days) || 30, 1), 90), since = Date.now() - span * DAY_MS;
    const rows = q('SELECT ts, path, visitor, referrer, device, browser, os FROM visits WHERE ts >= ? ORDER BY ts').all(since);
    const heat = Array.from({ length: 7 }, () => Array(24).fill(0)), pageHeat = new Map();
    const sessions = new Map(), tally = { devices: new Map(), browsers: new Map(), systems: new Map(), referrers: new Map(), entry: new Map(), pages: new Map() };
    const bump = (map, k) => { if (k) map.set(k, (map.get(k) || 0) + 1); };
    for (const r of rows) {
      const l = local(r.ts);
      heat[l.dow][l.hour]++;
      if (!pageHeat.has(r.path)) pageHeat.set(r.path, Array(7).fill(0));
      pageHeat.get(r.path)[l.dow]++;
      bump(tally.pages, r.path);
      const key = `${l.date}|${r.visitor}`;
      let s = sessions.get(key);
      if (!s) { s = { visitor: r.visitor.slice(0, 8), first: r.ts, last: r.ts, device: r.device, browser: r.browser || 'Other', os: r.os || 'Other', referrer: r.referrer || 'Direct', landing: r.path, pages: [] }; sessions.set(key, s); bump(tally.devices, r.device); bump(tally.browsers, s.browser); bump(tally.systems, s.os); bump(tally.referrers, s.referrer); bump(tally.entry, r.path); }
      s.last = r.ts;
      if (s.pages.length < 12 && s.pages.at(-1) !== r.path) s.pages.push(r.path);
    }
    const top = (map, n = 8) => [...map].sort((a, b) => b[1] - a[1]).slice(0, n).map(([name, count]) => ({ name, n: count }));
    const list = [...sessions.values()].sort((a, b) => b.last - a.last).slice(0, 60).map(s => ({ ...s, seconds: Math.round((s.last - s.first) / 1000), views: s.pages.length }));
    const busiest = (() => { let best = { dow: 0, hour: 0, n: 0 }; heat.forEach((row, d) => row.forEach((n, h) => { if (n > best.n) best = { dow: d, hour: h, n }; })); return best.n ? { day: DOW[best.dow], hour: best.hour, n: best.n } : null; })();
    return {
      days: span, timezone: TZ, views: rows.length, sessions: sessions.size, busiest, heat, dow: DOW,
      pageHeat: [...pageHeat].sort((a, b) => b[1].reduce((x, y) => x + y) - a[1].reduce((x, y) => x + y)).slice(0, 10).map(([path, cells]) => ({ path, cells })),
      devices: top(tally.devices, 4), browsers: top(tally.browsers), systems: top(tally.systems), referrers: top(tally.referrers), entry: top(tally.entry), pages: top(tally.pages), sessionsList: list,
      note: 'Visitors are counted with a daily rotating anonymous hash. We do not store IP addresses, so returning visitors and exact locations are not tracked.'
    };
  }

  // ---------- Holiday system
  let secret = getSetting('marketing_secret');
  if (!secret) { secret = crypto.randomBytes(24).toString('hex'); setSetting('marketing_secret', secret); }
  const unsubToken = email => crypto.createHmac('sha256', secret).update(String(email).toLowerCase()).digest('hex').slice(0, 32);
  const unsubUrl = email => `${siteUrl}/api/unsubscribe?e=${encodeURIComponent(email)}&t=${unsubToken(email)}`;
  const emailOk = e => typeof e === 'string' && e.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
  const mailSucceeded = result => !result || (result.ok !== false && !result.skipped && !['disabled', 'degraded'].includes(result.capability?.state));

  function recipients() {
    const seen = new Set(), out = [];
    for (const c of q("SELECT c.name, c.email, c.marketing_optout, COALESCE(u.notify_email, 1) AS notify FROM customers c LEFT JOIN users u ON u.id = c.user_id WHERE c.email != '' ORDER BY c.id").all()) {
      const key = c.email.toLowerCase();
      if (!emailOk(c.email) || seen.has(key)) continue;
      seen.add(key);
      out.push({ ...c, ok: !c.marketing_optout && Boolean(c.notify) });
    }
    return out;
  }
  function audience() { const r = recipients(); return { eligible: r.filter(x => x.ok).length, optedOut: r.filter(x => !x.ok).length }; }

  const keyOf = (holiday, field) => `hol_${holiday.key}_${field}`;
  function config(h) {
    const get = (f, d) => getSetting(keyOf(h, f), d);
    return {
      enabled: get('enabled', '1') === '1', sale: get('sale', h.sale ? '1' : '0') === '1', pct: Number(get('pct', h.pct)), lead: Number(get('lead', h.lead)), tail: Number(get('tail', h.tail)),
      code: get('code', h.base), subject: get('subject', ''), message: get('message', '')
    };
  }
  const master = () => getSetting('hol_master', '1') === '1';
  const address = () => getSetting('hol_address', '');
  const dateLabel = iso => new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-US', { timeZone: 'UTC', month: 'long', day: 'numeric', year: 'numeric' });

  function plan(h, year) {
    const c = config(h), holidayOn = h.date(year), sendOn = addDays(holidayOn, -c.lead);
    const code = `${c.code}${String(year).slice(2)}`;
    return { cfg: c, holidayOn, sendOn, validThrough: c.sale ? addDays(holidayOn, c.tail) : '', code, pct: c.sale ? c.pct : 0 };
  }
  function compose(h, year, person) {
    const p = plan(h, year);
    const email = templates.holidayGreeting({
      name: person.name, greeting: h.greeting, wish: h.wish, intro: p.cfg.message,
      sale: p.cfg.sale ? { pct: p.cfg.pct, code: p.code, until: dateLabel(p.validThrough) } : null,
      ctaUrl: `${siteUrl}/contact/`, unsubscribeUrl: unsubUrl(person.email), address: address()
    });
    return { plan: p, email: p.cfg.subject ? { ...email, subject: p.cfg.subject.replace(/\{greeting\}/g, h.greeting) } : email };
  }
  const sleep = ms => ms > 0 ? new Promise(r => setTimeout(r, ms)) : Promise.resolve();
  const running = new Set();

  async function deliver(campaignId) {
    if (running.has(campaignId)) return;
    running.add(campaignId);
    try {
      const camp = q('SELECT * FROM holiday_campaigns WHERE id = ?').get(campaignId), h = holidayOf(camp.key);
      const list = recipients().filter(r => r.ok);
      q('UPDATE holiday_campaigns SET recipients = ? WHERE id = ?').run(list.length, camp.id);
      const done = new Set(q('SELECT email FROM holiday_sends WHERE campaign_id = ?').all(camp.id).map(r => r.email.toLowerCase()));
      for (const person of list) {
        if (done.has(person.email.toLowerCase())) continue;
        let status = 'sent';
        try {
          const { email } = compose(h, camp.year, person);
          const outcome = await mailer({ to: person.email, ...email, headers: { 'List-Unsubscribe': `<${unsubUrl(person.email)}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' }, idempotencyKey: `holiday-${camp.id}-${person.email.toLowerCase()}` });
          if (!mailSucceeded(outcome)) throw new Error(outcome?.error || 'Email provider is not available.');
        } catch (error) { status = 'failed'; console.error('Holiday email failed:', error.message); }
        q('INSERT OR IGNORE INTO holiday_sends (campaign_id, email, status, sent_at) VALUES (?, ?, ?, ?)').run(camp.id, person.email, status, nowIso());
        await sleep(pauseMs);
      }
      const n = status => q('SELECT COUNT(*) AS n FROM holiday_sends WHERE campaign_id = ? AND status = ?').get(camp.id, status).n;
      q("UPDATE holiday_campaigns SET sent = ?, failed = ?, status = 'done', finished_at = ? WHERE id = ?").run(n('sent'), n('failed'), nowIso(), camp.id);
      if (notifyEmail) await mailer({ to: notifyEmail, subject: `${h.greeting} campaign finished`, text: `${h.name} ${camp.year}: ${n('sent')} sent, ${n('failed')} failed.${camp.pct ? ` Offer: ${camp.pct}% off with code ${camp.code} through ${camp.valid_through}.` : ' Greeting only.'}`, html: `<p>${h.name} ${camp.year}: ${n('sent')} sent, ${n('failed')} failed.</p>` }).catch(() => {});
    } finally { running.delete(campaignId); }
  }

  function createCampaign(h, year, trigger) {
    const p = plan(h, year), name = `${h.name} ${year}`;
    const subject = templates.holidayGreeting({ name: 'x', greeting: h.greeting, wish: h.wish, sale: p.cfg.sale ? { pct: p.cfg.pct, code: p.code, until: dateLabel(p.validThrough) } : null, ctaUrl: siteUrl, unsubscribeUrl: siteUrl }).subject;
    try {
      const info = q('INSERT INTO holiday_campaigns (key, year, name, holiday_on, send_on, valid_through, code, pct, subject, trigger, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
        .run(h.key, year, name, p.holidayOn, p.sendOn, p.validThrough, p.cfg.sale ? p.code : '', p.pct, p.cfg.subject || subject, trigger, nowIso());
      return Number(info.lastInsertRowid);
    } catch { return null; }
  }

  // Sends every enabled holiday whose send date has arrived and whose holiday has not passed. Safe to call repeatedly.
  async function runDue(now = Date.now()) {
    if (!master()) return [];
    const l = local(now), started = [];
    for (const row of q("SELECT id FROM holiday_campaigns WHERE status = 'sending'").all()) started.push(deliver(row.id));
    if (l.hour >= SEND_HOUR && l.hour < 20) {
      const year = Number(l.date.slice(0, 4));
      for (const h of HOLIDAYS) {
        if (!config(h).enabled) continue;
        for (const y of [year, year + 1]) {
          const p = plan(h, y);
          if (l.date < p.sendOn || l.date > p.holidayOn) continue;
          const id = createCampaign(h, y, 'auto');
          if (id) started.push(deliver(id));
        }
      }
    }
    await Promise.all(started);
    return started.length;
  }
  function start() {
    if (process.env.HOLIDAY_AUTOMATION === 'off') return () => {};
    const run = () => runDue().catch(error => console.error('Holiday automation failed:', error.message));
    const first = setTimeout(run, 20000), timer = setInterval(run, 30 * 60 * 1000);
    first.unref(); timer.unref();
    return () => { clearTimeout(first); clearInterval(timer); };
  }

  function holidayView(now = Date.now()) {
    const today = local(now).date, year = Number(today.slice(0, 4));
    return HOLIDAYS.map(h => {
      let y = year;
      if (h.date(y) < today) y += 1;
      const p = plan(h, y), camp = q('SELECT * FROM holiday_campaigns WHERE key = ? AND year = ?').get(h.key, y);
      return { key: h.key, name: h.name, greeting: h.greeting, wish: h.wish, defaults: { sale: h.sale, pct: h.pct, lead: h.lead, tail: h.tail, code: h.base }, defaultsMetadata: DEFAULT_METADATA, ...p.cfg, next: { year: y, holidayOn: p.holidayOn, sendOn: p.sendOn, validThrough: p.validThrough, code: p.code }, campaign: camp ? { id: camp.id, status: camp.status, sent: camp.sent, failed: camp.failed, recipients: camp.recipients } : null };
    }).sort((a, b) => a.next.holidayOn.localeCompare(b.next.holidayOn));
  }

  const unsubPage = (title, body) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${title}</title><link rel="stylesheet" href="/styles.css"></head><body><main class="container py-5"><h1 class="h3">${title}</h1>${body}</main></body></html>`;
  const escHtml = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const html = (res, status, body) => { res.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(body); };

  async function handle(req, res, pathname, method) {
    if (pathname === '/api/unsubscribe' && (method === 'GET' || method === 'POST')) {
      const url = new URL(req.url, 'http://x'), email = String(url.searchParams.get('e') || ''), tok = String(url.searchParams.get('t') || '');
      const good = emailOk(email) && tok.length === 32 && crypto.timingSafeEqual(Buffer.from(tok), Buffer.from(unsubToken(email)));
      if (method === 'POST') req.resume();
      if (!good) return html(res, 400, unsubPage('Link not valid', '<p>This unsubscribe link is not valid. Reply to any of our emails and we will remove you right away.</p>')), true;
      if (method === 'GET') return html(res, 200, unsubPage('Unsubscribe from holiday messages', `<p>Stop holiday greetings and offers sent to <strong>${escHtml(email)}</strong>?</p><form method="post" action="/api/unsubscribe?e=${encodeURIComponent(email)}&amp;t=${tok}"><button class="btn btn-primary" type="submit">Yes, unsubscribe me</button></form>`)), true;
      q('UPDATE customers SET marketing_optout = 1 WHERE email = ? COLLATE NOCASE').run(email);
      return html(res, 200, unsubPage('You are unsubscribed', '<p>You will not receive holiday messages from Budget Bath Solutions anymore. Project and account emails are unaffected.</p>')), true;
    }
    if (!pathname.startsWith('/api/admin/')) return false;
    const m = pathname.match(/^\/api\/admin\/(company|visitors\/insights|holidays(?:\/code|\/settings|\/([a-z0-9-]+)(?:\/(preview|test|send-now))?)?)$/);
    if (!m) return false;
    const user = currentUser(req);
    if (!user) return fail(res, 401, 'Please sign in.'), true;
    if (!isAdmin(user)) return fail(res, 403, 'Admin access required.'), true;
    if (method === 'GET' && m[1] === 'company') return json(res, 200, overview()), true;
    if (method === 'GET' && m[1] === 'visitors/insights') return json(res, 200, insights(new URL(req.url, 'http://x').searchParams.get('days'))), true;
    if (method === 'GET' && m[1] === 'holidays') {
      const campaigns = q('SELECT id, name, holiday_on, send_on, valid_through, code, pct, subject, status, trigger, recipients, sent, failed, finished_at FROM holiday_campaigns ORDER BY id DESC LIMIT 40').all();
      return json(res, 200, { master: master(), address: address(), audience: audience(), holidays: holidayView(), campaigns, timezone: TZ, sendHour: SEND_HOUR, metadata: DEFAULT_METADATA }), true;
    }
    if (method === 'GET' && m[1] === 'holidays/code') {
      const code = String(new URL(req.url, 'http://x').searchParams.get('code') || '').trim().toUpperCase().slice(0, 40);
      const c = code && q("SELECT name, pct, code, valid_through FROM holiday_campaigns WHERE code = ? COLLATE NOCASE AND pct > 0").get(code);
      if (!c) return json(res, 200, { valid: false, message: 'No holiday offer uses that code.' }), true;
      const expired = local(Date.now()).date > c.valid_through;
      return json(res, 200, { valid: !expired, pct: c.pct, campaign: c.name, validThrough: c.valid_through, message: expired ? `That code expired on ${dateLabel(c.valid_through)}.` : `${c.pct}% off, valid through ${dateLabel(c.valid_through)}.` }), true;
    }
    if (method !== 'POST') return fail(res, 405, 'Method not allowed.'), true;
    const parsed = await readJson(req);
    if (parsed.error) return fail(res, 400, 'Please check the form and try again.'), true;
    const body = parsed.body;
    if (m[1] === 'holidays/settings') {
      setSetting('hol_master', body.master === false ? '0' : '1');
      const addr = text(body.address ?? '', 200);
      if (addr === null) return fail(res, 400, 'The mailing address is too long.'), true;
      setSetting('hol_address', addr);
      return json(res, 200, { ok: true }), true;
    }
    const h = m[2] && holidayOf(m[2]);
    if (!h) return fail(res, 404, 'Unknown holiday.'), true;
    if (!m[3]) {
      const int = (v, lo, hi) => Number.isInteger(v) && v >= lo && v <= hi;
      const code = String(body.code ?? '').trim().toUpperCase(), subject = text(body.subject ?? '', 150), message = text(body.message ?? '', 1000);
      if (!int(body.pct, 1, 90) || !int(body.lead, 0, 30) || !int(body.tail, 0, 60) || !/^[A-Z0-9]{3,20}$/.test(code) || subject === null || message === null) return fail(res, 400, 'Check the discount (1-90%), days and code (3-20 letters or numbers).'), true;
      for (const [f, v] of [['enabled', body.enabled === false ? '0' : '1'], ['sale', body.sale ? '1' : '0'], ['pct', body.pct], ['lead', body.lead], ['tail', body.tail], ['code', code], ['subject', subject], ['message', message]]) setSetting(keyOf(h, f), String(v));
      return json(res, 200, { ok: true }), true;
    }
    const year = holidayView().find(x => x.key === h.key).next.year;
    if (m[3] === 'preview') {
      const { email } = compose(h, year, { name: 'Alex Customer', email: 'alex@example.com' });
      return json(res, 200, { subject: email.subject, text: email.text.split('\n--\n')[0] }), true;
    }
    if (m[3] === 'test') {
      const to = user.email, { email } = compose(h, year, { name: user.name, email: to });
      const outcome = await mailer({ to, ...email, subject: `[Test] ${email.subject}` });
      if (!mailSucceeded(outcome)) return json(res, 503, { ok: false, to, error: outcome?.error || 'Email provider is not available.', capability: outcome?.capability }), true;
      return json(res, 200, { ok: true, to }), true;
    }
    const id = createCampaign(h, year, 'manual');
    if (!id) return fail(res, 409, `The ${h.name} ${year} campaign has already been sent or started.`), true;
    deliver(id).catch(error => console.error('Holiday send failed:', error.message));
    return json(res, 202, { ok: true, id }), true;
  }

  return { handle, runDue, start, overview, insights };
}

module.exports = { createCompany, HOLIDAYS };
