// Employee portal, job tracking, hiring applications and the employee knowledge base.
const crypto = require('node:crypto');
const path = require('node:path');
const fs = require('node:fs/promises');
const { detectFile, cleanName } = require('./customers');
const skills = require('./skill-tests');

const DAY = 24 * 60 * 60 * 1000;
const MAX_FILE_BYTES = 25 * 1024 * 1024;
const MAX_FILES_PER_EMPLOYEE = 100;
const JOB_STATUSES = ['open', 'in_progress', 'completed', 'cancelled'];
const REQUEST_TYPES = { time_off: 'Time off', supplies: 'Supplies or materials', equipment: 'Tools or equipment', schedule: 'Schedule change', pay: 'Pay question', job_interest: 'Job interest', other: 'Other' };
const APPLICATION_STATUSES = ['new', 'reviewing', 'interview', 'hired', 'rejected'];
const TRADES = ['Tile setter', 'Tile helper', 'Remodeler / carpenter', 'Plumber', 'Electrician', 'Painter / finisher', 'Drywall', 'General handyman', 'Other'];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const validDate = v => typeof v === 'string' && DATE_RE.test(v) && !Number.isNaN(Date.parse(v));
const sha256 = v => crypto.createHash('sha256').update(v).digest('hex');
const normalizeName = v => String(v).trim().replace(/\s+/g, ' ').toLowerCase();
const cents = v => { const n = Number(v); return v !== '' && v !== null && Number.isFinite(n) && n >= 0 && n <= 100000 ? Math.round(n * 100) : null; };

function createStaff({ db, dataDir, mailer, templates, siteUrl, notifyEmail = '', json, fail, readBuffer, readJson, currentUser, isAdmin, limited, text, issueToken, hashPassword, randomToken }) {
  const q = sql => db.prepare(sql);
  const nowIso = () => new Date().toISOString();
  const today = () => nowIso().slice(0, 10);
  const portalUrl = `${siteUrl}/employee/`;
  const mail = async message => { try { await mailer(message); } catch (error) { console.error('Email failed:', error.message); } };
  const notify = (person, subject, body) => mail({ to: person.email, ...templates.staffNotice({ name: person.name, subject, body, url: portalUrl }) });
  const alertOffice = (subject, body) => notifyEmail ? mail({ to: notifyEmail, ...templates.customerMessage({ name: 'team', subject, body }) }) : null;
  const like = term => `%${String(term || '').trim().slice(0, 100).replace(/[\\%_]/g, '\\$&')}%`;
  const person = id => q('SELECT e.*, u.name, u.email, u.phone, u.notify_email, u.verified, u.must_change_password FROM employees e JOIN users u ON u.id = e.user_id WHERE e.id = ?').get(id);
  const isJson = req => (req.headers['content-type'] || '').toLowerCase().startsWith('application/json');
  const provisioning = (user, employee = null) => {
    const admin = isAdmin(user), verified = Boolean(user?.verified), invited = Boolean(user && (!verified || user.must_change_password));
    const onboarding = employee?.onboarding || '';
    const employeeReady = Boolean(employee && employee.status === 'active' && verified && !invited && !onboarding);
    const state = invited ? 'invited' : admin ? 'admin' : employeeReady ? 'employee' : employee ? onboarding ? 'onboarding' : 'inactive-employee' : verified ? 'verified' : 'invited';
    return { state, verified, invited, employee: Boolean(employee && employee.status === 'active'), admin, onboarding, ready: state === 'employee' || state === 'admin', employeeReady, customerReady: verified && !invited };
  };

  // Reads a JSON body; sends the error response and returns null when it is unusable.
  async function readBody(req, res, limit = 20000) {
    if (!isJson(req)) { fail(res, 415, 'Please submit from the website.'); return null; }
    const parsed = await readJson(req, limit);
    if (parsed.error) { fail(res, parsed.error === 'too-large' ? 413 : 400, 'Please check the form and try again.'); return null; }
    return parsed.body;
  }
  async function readUpload(req, res, ownerId) {
    if (q('SELECT COUNT(*) AS n FROM employee_files WHERE employee_id = ?').get(ownerId).n >= MAX_FILES_PER_EMPLOYEE) { fail(res, 400, 'The file limit has been reached.'); return null; }
    const data = await readBuffer(req, MAX_FILE_BYTES);
    if (data === null) { fail(res, 413, 'Files must be 25 MB or smaller.'); return null; }
    const kind = detectFile(data);
    if (!kind) { fail(res, 415, 'Upload a JPG, PNG, WebP, PDF, Word or Excel file.'); return null; }
    return { data, kind };
  }
  async function storeFile(employeeId, { data, kind }, req, uploadedBy) {
    let title = '';
    try { title = decodeURIComponent(String(req.headers['x-title'] || '')).trim().slice(0, 200); } catch { /* ignore bad title */ }
    const id = crypto.randomBytes(16).toString('hex');
    await fs.writeFile(path.join(dataDir, 'uploads', id + kind.ext), data, { mode: 0o600 });
    q('INSERT INTO employee_files (id, employee_id, title, file, mime, size, original_name, uploaded_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(id, employeeId, title, id + kind.ext, kind.mime, data.length, cleanName(req.headers['x-filename']), uploadedBy, nowIso());
    return id;
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
  const removeStored = async rows => { for (const row of rows) await fs.unlink(path.join(dataDir, 'uploads', row.file)).catch(() => {}); };
  const fileView = f => ({ id: f.id, title: f.title, name: f.original_name, mime: f.mime, size: f.size, uploadedBy: f.uploaded_by, createdAt: f.created_at });

  // ---------- Shared views
  const jobView = j => ({ id: j.id, title: j.title, description: j.description, area: j.area, status: j.status, scheduledAt: j.scheduled_at, completedAt: j.completed_at, createdAt: j.created_at });
  const hoursView = t => ({ id: t.id, date: t.work_date, minutes: t.minutes, note: t.note, status: t.status, jobId: t.job_id, jobTitle: t.job_title || '', rateCents: t.rate_cents, createdAt: t.created_at });
  const contractView = (c, withBody = true) => ({ id: c.id, title: c.title, ...(withBody && { body: c.body }), status: c.status, signedName: c.signed_name, signedAt: c.signed_at, createdAt: c.created_at });
  const requestView = r => ({ id: r.id, type: r.type, typeLabel: REQUEST_TYPES[r.type] || r.type, subject: r.subject, body: r.body, status: r.status, response: r.response, jobId: r.job_id, createdAt: r.created_at, resolvedAt: r.resolved_at });
  const updatesOf = jobId => q('SELECT id, author, body, created_at AS createdAt FROM job_updates WHERE job_id = ? ORDER BY id DESC LIMIT 50').all(jobId);
  function totals(employeeId) {
    const ok = q("SELECT COALESCE(SUM(minutes), 0) AS m, COALESCE(SUM(minutes * rate_cents / 60.0), 0) AS c FROM time_entries WHERE employee_id = ? AND status = 'approved'").get(employeeId);
    const pending = q("SELECT COALESCE(SUM(minutes), 0) AS m FROM time_entries WHERE employee_id = ? AND status = 'pending'").get(employeeId).m;
    const paid = q('SELECT COALESCE(SUM(amount_cents), 0) AS c FROM payments WHERE employee_id = ?').get(employeeId).c;
    const earned = Math.round(ok.c);
    return { approvedMinutes: ok.m, pendingMinutes: pending, earnedCents: earned, paidCents: paid, balanceCents: earned - paid };
  }
  const hoursOf = id => q('SELECT t.*, j.title AS job_title FROM time_entries t LEFT JOIN jobs j ON j.id = t.job_id WHERE t.employee_id = ? ORDER BY t.work_date DESC, t.id DESC LIMIT 300').all(id).map(hoursView);
  const paymentsOf = id => q('SELECT id, amount_cents AS amountCents, paid_on AS paidOn, method, memo FROM payments WHERE employee_id = ? ORDER BY paid_on DESC, id DESC').all(id);
  const kbView = (a, withBody) => ({ id: a.id, title: a.title, category: a.category, summary: a.summary, ...(withBody && { body: a.body }), published: Boolean(a.published), sort: a.sort, updatedAt: a.updated_at });

  const sha = v => crypto.createHash('sha256').update(String(v)).digest('hex');
  const tradeOf = t => skills.TRADE_LIST.includes(t) ? t : 'General handyman';

  // ---------- Hiring skills test: token-gated, one attempt per trade, graded on the server
  async function skillTest(req, res, method) {
    if (limited(req, 'skilltest', 60, 15 * 60 * 1000)) { fail(res, 429, 'Too many requests. Please wait a few minutes.'); return true; }
    const url = new URL(req.url, 'http://localhost');
    const body = method === 'POST' ? await readBody(req, res, 20000) : {};
    if (!body) return true;
    const token = String(method === 'POST' ? body.token : url.searchParams.get('token') || '');
    const app = token.length >= 20 && token.length <= 80 ? q('SELECT * FROM applications WHERE test_token_hash = ?').get(sha(token)) : null;
    if (!app) { fail(res, 404, 'This test link is not valid. Use the link from your confirmation email.'); return true; }
    const data = JSON.parse(app.data || '{}'), trades = [...new Set((data.trades || []).map(tradeOf))];
    const lang = (method === 'POST' ? body.lang : url.searchParams.get('lang')) === 'es' ? 'es' : 'en';
    const attempts = q('SELECT * FROM skill_tests WHERE application_id = ?').all(app.id);
    const summary = () => ({ name: app.name, passPercent: skills.PASS_PERCENT, minutes: skills.TIME_LIMIT_MIN, size: skills.BANK_SIZE, trades: trades.map(t => { const a = attempts.find(x => x.trade === t); return { trade: t, status: a?.submitted_at ? 'done' : a ? 'started' : 'new', score: a?.submitted_at ? a.score : null, total: skills.BANK_SIZE }; }) });
    const trade = (method === 'POST' ? body.trade : url.searchParams.get('trade')) || '';
    if (!trade) { json(res, 200, summary()); return true; }
    if (!trades.includes(trade)) { fail(res, 400, 'That trade is not part of this application.'); return true; }
    let attempt = attempts.find(a => a.trade === trade);
    if (method === 'GET') {
      if (attempt?.submitted_at) { fail(res, 409, 'You already completed this test. Thank you!'); return true; }
      if (!attempt) {
        const seed = crypto.randomInt(1, 2 ** 31 - 1);
        q('INSERT INTO skill_tests (application_id, trade, lang, seed, started_at, total) VALUES (?, ?, ?, ?, ?, ?)').run(app.id, trade, lang, seed, nowIso(), skills.BANK_SIZE);
        attempt = q('SELECT * FROM skill_tests WHERE application_id = ? AND trade = ?').get(app.id, trade);
      }
      const left = Math.max(0, skills.TIME_LIMIT_MIN * 60000 - (Date.now() - Date.parse(attempt.started_at)));
      json(res, 200, { trade, attemptId: attempt.id, lang: attempt.lang, secondsLeft: Math.round(left / 1000), questions: skills.forClient(skills.build(trade, attempt.seed, attempt.lang)) });
      return true;
    }
    if (!attempt || attempt.submitted_at) { fail(res, 409, attempt ? 'You already completed this test.' : 'Start the test first.'); return true; }
    if (body.attemptId != null && body.attemptId !== attempt.id) { fail(res, 409, 'This test changed in another tab. Reload and resume.'); return true; }
    const questions = skills.build(trade, attempt.seed, attempt.lang);
    const answers = skills.cleanAnswers(questions, body.answers);
    if (!answers) { fail(res, 400, 'Please check the test answers and try again.'); return true; }
    const result = skills.grade(trade, attempt.seed, attempt.lang, answers);
    const late = Date.now() - Date.parse(attempt.started_at) > (skills.TIME_LIMIT_MIN + 2) * 60000 ? 1 : 0;
    const saved = q('UPDATE skill_tests SET submitted_at = ?, answers = ?, score = ?, passed = ?, late = ? WHERE id = ? AND submitted_at IS NULL').run(nowIso(), JSON.stringify(answers), result.score, result.passed ? 1 : 0, late, attempt.id);
    if (!saved.changes) { fail(res, 409, 'You already completed this test.'); return true; }
    await alertOffice(`Skills test finished: ${app.name}`, `${app.name} scored ${result.score}/${result.total} (${result.percent}%) on the ${trade} test${late ? ' (submitted late)' : ''}. See Applications in the admin portal.`);
    json(res, 200, { done: true, trade, remaining: trades.filter(t => t !== trade && !attempts.some(a => a.trade === t && a.submitted_at)) });
    return true;
  }
  const testsOf = appId => q('SELECT trade, lang, started_at AS startedAt, submitted_at AS submittedAt, score, total, passed, late FROM skill_tests WHERE application_id = ?').all(appId).map(t => ({ ...t, passed: Boolean(t.passed), late: Boolean(t.late) }));

  // ---------- Public hiring application
  async function apply(req, res) {
    if (limited(req, 'apply', 5)) { fail(res, 429, 'Too many applications from this connection. Please try again later.'); return true; }
    const body = await readBody(req, res, 30000);
    if (!body) return true;
    if (typeof body.website === 'string' && body.website.trim()) { json(res, 201, { message: 'Thanks!' }); return true; }
    const short = { name: 120, email: 200, phone: 40, city: 100, years: 20, licenseDetails: 300, insuranceDetails: 300, availability: 300, desiredRate: 60, startDate: 60 };
    const long = { tools: 600, references: 1500, experience: 3000 };
    const clean = {};
    for (const [key, max] of Object.entries({ ...short, ...long })) {
      const value = text(body[key] ?? '', max);
      if (value === null) { fail(res, 400, 'Please check the form fields and try again.'); return true; }
      clean[key] = value;
    }
    const trades = Array.isArray(body.trades) ? body.trades.filter(t => TRADES.includes(t)) : [];
    const flags = {};
    for (const key of ['licensed', 'insured', 'ownTools', 'ownVehicle', 'over18', 'workAuthorized']) flags[key] = body[key] === 'yes' ? 'yes' : body[key] === 'no' ? 'no' : '';
    if (!clean.name || !clean.phone || !clean.city || !EMAIL_RE.test(clean.email) || !trades.length || !clean.experience || flags.over18 !== 'yes' || body.consent !== true) {
      fail(res, 400, 'Please complete the required fields, confirm you are 18 or older and agree to the privacy policy.'); return true;
    }
    const { name, email, phone, city, ...rest } = clean;
    const testToken = crypto.randomBytes(24).toString('base64url'), lang = body.lang === 'es' ? 'es' : 'en';
    q('INSERT INTO applications (name, email, phone, city, data, created_at, test_token_hash) VALUES (?, ?, ?, ?, ?, ?, ?)').run(name, email, phone, city, JSON.stringify({ ...rest, ...flags, trades, lang }), nowIso(), sha(testToken));
    const testUrl = `${siteUrl}/handyman-application/test/?token=${testToken}`;
    await mail({ to: email, ...templates.customerMessage({ name, subject: 'We received your application', body: `Thank you for applying to work with Budget Bath Solutions. Please take the ${skills.BANK_SIZE}-question skills test for your trade (about ${skills.TIME_LIMIT_MIN} minutes, one attempt per trade): ${testUrl}\n\nOur team will review your details and your test result and contact you if there is a fit. Submitting an application does not create an employment or contracting relationship.` }) });
    await alertOffice(`New handyman application: ${name}`, `${name} (${email}, ${phone}) applied for: ${trades.join(', ')}.\nReview it in the admin portal under Applications.`);
    json(res, 201, { message: 'Thanks for applying.', testToken });
    return true;
  }

  // ---------- Employee portal
  async function portal(req, res, pathname, method) {
    const user = currentUser(req);
    if (!user) { fail(res, 401, 'Please sign in.'); return true; }
    const me = user.verified ? q("SELECT * FROM employees WHERE user_id = ? AND status = 'active'").get(user.id) : null;
    if (!me) { fail(res, 403, 'This account does not have employee access.'); return true; }
    let m;

    if (method === 'GET' && pathname === '/api/employee/me') {
      const t = totals(me.id);
      const weekStart = new Date(Date.now() - 6 * DAY).toISOString().slice(0, 10);
      json(res, 200, {
        onboarding: me.onboarding,
        provisioning: provisioning(user, me),
        profile: { name: user.name, email: user.email, phone: user.phone, roleTitle: me.role_title, hiredOn: me.hired_on, rateCents: me.rate_cents, canEstimate: Boolean(me.can_estimate) },
        counts: {
          activeJobs: q("SELECT COUNT(*) AS n FROM jobs j JOIN job_assignments a ON a.job_id = j.id WHERE a.employee_id = ? AND j.status IN ('open', 'in_progress')").get(me.id).n,
          openJobs: q("SELECT COUNT(*) AS n FROM jobs WHERE status = 'open' AND id NOT IN (SELECT job_id FROM job_assignments WHERE employee_id = ?)").get(me.id).n,
          pendingContracts: q("SELECT COUNT(*) AS n FROM contracts WHERE employee_id = ? AND status = 'pending'").get(me.id).n,
          pendingRequests: q("SELECT COUNT(*) AS n FROM employee_requests WHERE employee_id = ? AND status = 'pending'").get(me.id).n,
          weekMinutes: q('SELECT COALESCE(SUM(minutes), 0) AS n FROM time_entries WHERE employee_id = ? AND work_date >= ?').get(me.id, weekStart).n
        },
        totals: t
      });
      return true;
    }
    if (me.onboarding) { fail(res, 403, 'Finish your onboarding and training first. The office will unlock the app when you are signed off.'); return true; }

    if (method === 'GET' && pathname === '/api/employee/jobs') {
      const mine = q('SELECT j.*, c.name AS customer_name, c.phone AS customer_phone FROM jobs j JOIN job_assignments a ON a.job_id = j.id LEFT JOIN customers c ON c.id = j.customer_id WHERE a.employee_id = ? ORDER BY j.scheduled_at, j.id DESC').all(me.id)
        .map(j => ({ ...jobView(j), address: j.address, customerName: j.customer_name || '', customerPhone: j.customer_phone || '', updates: updatesOf(j.id) }));
      const interested = new Set(q("SELECT job_id FROM employee_requests WHERE employee_id = ? AND type = 'job_interest' AND status = 'pending'").all(me.id).map(r => r.job_id));
      const open = q("SELECT * FROM jobs WHERE status = 'open' AND id NOT IN (SELECT job_id FROM job_assignments WHERE employee_id = ?) ORDER BY created_at DESC").all(me.id).map(j => ({ ...jobView(j), interested: interested.has(j.id) }));
      json(res, 200, { active: mine.filter(j => ['open', 'in_progress'].includes(j.status)), history: mine.filter(j => !['open', 'in_progress'].includes(j.status)).reverse(), open });
      return true;
    }

    m = pathname.match(/^\/api\/employee\/jobs\/(\d+)\/brief$/);
    if (m && method === 'GET') {
      const jobId = Number(m[1]);
      if (!q('SELECT 1 FROM job_assignments WHERE job_id = ? AND employee_id = ?').get(jobId, me.id)) { fail(res, 404, 'Job not found.'); return true; }
      const row = q('SELECT body, updated_at FROM job_briefs WHERE job_id = ?').get(jobId);
      let brief = null; try { brief = row ? JSON.parse(row.body) : null; } catch { brief = null; }
      json(res, 200, { brief, updatedAt: row?.updated_at || '' });
      return true;
    }
    m = pathname.match(/^\/api\/employee\/jobs\/(\d+)\/tools(?:\/(\d+))?$/);
    if (m && (method === 'GET' || method === 'POST')) {
      const jobId = Number(m[1]);
      if (!q('SELECT 1 FROM job_assignments WHERE job_id = ? AND employee_id = ?').get(jobId, me.id)) { fail(res, 404, 'Job not found.'); return true; }
      if (method === 'POST') {
        const body = await readBody(req, res);
        if (!body) return true;
        const row = m[2] && q('SELECT id FROM job_tools WHERE id = ? AND job_id = ?').get(Number(m[2]), jobId);
        if (!row) { fail(res, 404, 'Tool not found.'); return true; }
        const on = body.checked === true;
        q('UPDATE job_tools SET checked = ?, checked_by = ?, checked_at = ? WHERE id = ?').run(on ? 1 : 0, on ? user.name : '', on ? nowIso() : '', row.id);
      }
      json(res, 200, { tools: q('SELECT id, name, grp AS "group", qty, source, note, checked, checked_by AS checkedBy FROM job_tools WHERE job_id = ? ORDER BY sort').all(jobId) });
      return true;
    }
    m = pathname.match(/^\/api\/employee\/jobs\/(\d+)\/(interest|updates|status)$/);
    if (m && method === 'POST') {
      const body = await readBody(req, res);
      if (!body) return true;
      const job = q('SELECT * FROM jobs WHERE id = ?').get(Number(m[1]));
      const assigned = job && q('SELECT 1 FROM job_assignments WHERE job_id = ? AND employee_id = ?').get(job.id, me.id);
      if (!job || (m[2] === 'interest' ? job.status !== 'open' || assigned : !assigned)) { fail(res, 404, 'Job not found.'); return true; }
      if (m[2] === 'interest') {
        if (q("SELECT 1 FROM employee_requests WHERE employee_id = ? AND job_id = ? AND type = 'job_interest' AND status = 'pending'").get(me.id, job.id)) { fail(res, 409, 'You already told us you are interested.'); return true; }
        const note = text(body.note ?? '', 1000);
        if (note === null) { fail(res, 400, 'That note is too long.'); return true; }
        q("INSERT INTO employee_requests (employee_id, job_id, type, subject, body, created_at) VALUES (?, ?, 'job_interest', ?, ?, ?)").run(me.id, job.id, `Interested in job #${job.id}: ${job.title}`.slice(0, 150), note, nowIso());
        await alertOffice(`${user.name} is interested in job #${job.id}`, `${user.name} asked to be assigned to "${job.title}".${note ? `\n\n${note}` : ''}`);
        json(res, 201, { ok: true });
        return true;
      }
      if (m[2] === 'updates') {
        const note = text(body.body, 2000);
        if (!note) { fail(res, 400, 'Write an update first.'); return true; }
        const since = new Date(Date.now() - 30000).toISOString();
        if (q('SELECT 1 FROM job_updates WHERE job_id = ? AND author = ? AND body = ? AND created_at >= ?').get(job.id, user.name, note, since)) { json(res, 200, { ok: true, duplicate: true }); return true; }
        q('INSERT INTO job_updates (job_id, author, body, created_at) VALUES (?, ?, ?, ?)').run(job.id, user.name, note, nowIso());
        json(res, 201, { ok: true });
        return true;
      }
      if (!['in_progress', 'completed'].includes(body.status) || job.status === 'cancelled') { fail(res, 400, 'That status change is not allowed.'); return true; }
      q('UPDATE jobs SET status = ?, completed_at = ?, updated_at = ? WHERE id = ?').run(body.status, body.status === 'completed' ? nowIso() : null, nowIso(), job.id);
      q('INSERT INTO job_updates (job_id, author, body, created_at) VALUES (?, ?, ?, ?)').run(job.id, user.name, body.status === 'completed' ? 'Marked the job complete.' : 'Started work on the job.', nowIso());
      if (body.status === 'completed') await alertOffice(`Job #${job.id} completed`, `${user.name} marked "${job.title}" complete.`);
      json(res, 200, { ok: true });
      return true;
    }

    if (pathname === '/api/employee/hours') {
      if (method === 'GET') { json(res, 200, { entries: hoursOf(me.id), totals: totals(me.id), jobs: q("SELECT j.id, j.title FROM jobs j JOIN job_assignments a ON a.job_id = j.id WHERE a.employee_id = ? AND j.status != 'cancelled' ORDER BY j.id DESC").all(me.id) }); return true; }
      if (method === 'POST') {
        const body = await readBody(req, res);
        if (!body) return true;
        const hours = Number(body.hours), note = text(body.note ?? '', 500);
        const earliest = new Date(Date.now() - 120 * DAY).toISOString().slice(0, 10), latest = new Date(Date.now() + DAY).toISOString().slice(0, 10);
        if (!validDate(body.date) || body.date < earliest || body.date > latest) { fail(res, 400, 'Choose a date within the last 120 days.'); return true; }
        if (!Number.isFinite(hours) || hours < 0.25 || hours > 24) { fail(res, 400, 'Enter between 0.25 and 24 hours.'); return true; }
        if (note === null) { fail(res, 400, 'That note is too long.'); return true; }
        let jobId = null;
        if (body.jobId) {
          jobId = Number(body.jobId);
          if (!q('SELECT 1 FROM job_assignments WHERE job_id = ? AND employee_id = ?').get(jobId, me.id)) { fail(res, 400, 'Choose one of your assigned jobs.'); return true; }
        }
        const duplicate = q('SELECT id FROM time_entries WHERE employee_id = ? AND work_date = ? AND minutes = ? AND note = ? AND COALESCE(job_id, 0) = ? AND status = \'pending\' AND created_at >= ? ORDER BY id DESC LIMIT 1')
          .get(me.id, body.date, Math.round(hours * 60), note, jobId || 0, new Date(Date.now() - 30000).toISOString());
        if (duplicate) { json(res, 200, { id: duplicate.id, ok: true, duplicate: true }); return true; }
        q('INSERT INTO time_entries (employee_id, job_id, work_date, minutes, note, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(me.id, jobId, body.date, Math.round(hours * 60), note, nowIso());
        json(res, 201, { ok: true });
        return true;
      }
    }
    m = pathname.match(/^\/api\/employee\/hours\/(\d+)\/delete$/);
    if (m && method === 'POST') {
      const { changes } = q("DELETE FROM time_entries WHERE id = ? AND employee_id = ? AND status = 'pending'").run(Number(m[1]), me.id);
      if (!changes) { fail(res, 404, 'Only pending entries can be removed.'); return true; }
      json(res, 200, { ok: true });
      return true;
    }

    if (method === 'GET' && pathname === '/api/employee/payments') { json(res, 200, { payments: paymentsOf(me.id), totals: totals(me.id), rateCents: me.rate_cents }); return true; }

    if (method === 'GET' && pathname === '/api/employee/contracts') { json(res, 200, { contracts: q("SELECT * FROM contracts WHERE employee_id = ? AND status != 'void' ORDER BY id DESC").all(me.id).map(c => contractView(c)) }); return true; }
    m = pathname.match(/^\/api\/employee\/contracts\/(\d+)\/sign$/);
    if (m && method === 'POST') {
      const body = await readBody(req, res);
      if (!body) return true;
      const contract = q("SELECT * FROM contracts WHERE id = ? AND employee_id = ? AND status = 'pending'").get(Number(m[1]), me.id);
      if (!contract || contract.body_hash !== sha256(contract.body)) { fail(res, 404, 'Contract not found.'); return true; }
      if (body.agree !== true || typeof body.name !== 'string' || normalizeName(body.name) !== normalizeName(user.name)) { fail(res, 400, 'Type your full name exactly as it appears on your account and confirm you agree.'); return true; }
      q("UPDATE contracts SET status = 'signed', signed_name = ?, signed_at = ? WHERE id = ?").run(body.name.trim().slice(0, 120), nowIso(), contract.id);
      await alertOffice(`Contract signed: ${contract.title}`, `${user.name} signed "${contract.title}".`);
      json(res, 200, { ok: true });
      return true;
    }

    if (pathname === '/api/employee/requests') {
      if (method === 'GET') { json(res, 200, { types: REQUEST_TYPES, requests: q('SELECT * FROM employee_requests WHERE employee_id = ? ORDER BY id DESC LIMIT 200').all(me.id).map(requestView) }); return true; }
      if (method === 'POST') {
        const body = await readBody(req, res);
        if (!body) return true;
        const subject = text(body.subject, 150), details = text(body.body ?? '', 4000);
        if (!subject || details === null || !REQUEST_TYPES[body.type] || body.type === 'job_interest') { fail(res, 400, 'Choose a type and add a subject.'); return true; }
        if (limited(req, 'employee-request', 30)) { fail(res, 429, 'Too many requests. Please try again later.'); return true; }
        const duplicate = q("SELECT id FROM employee_requests WHERE employee_id = ? AND type = ? AND subject = ? AND body = ? AND status = 'pending' AND created_at >= ? ORDER BY id DESC LIMIT 1")
          .get(me.id, body.type, subject, details, new Date(Date.now() - 30000).toISOString());
        if (duplicate) { json(res, 200, { id: duplicate.id, ok: true, duplicate: true }); return true; }
        q('INSERT INTO employee_requests (employee_id, type, subject, body, created_at) VALUES (?, ?, ?, ?, ?)').run(me.id, body.type, subject, details, nowIso());
        await alertOffice(`Employee request from ${user.name}: ${subject}`, `${REQUEST_TYPES[body.type]}\n\n${details}`);
        json(res, 201, { ok: true });
        return true;
      }
    }

    if (pathname === '/api/employee/files') {
      if (method === 'GET') { json(res, 200, { files: q('SELECT * FROM employee_files WHERE employee_id = ? ORDER BY created_at DESC, rowid DESC').all(me.id).map(fileView) }); return true; }
      if (method === 'POST') {
        if (limited(req, 'employee-upload', 60)) { fail(res, 429, 'Too many uploads. Please try again later.'); return true; }
        const upload = await readUpload(req, res, me.id);
        if (!upload) return true;
        json(res, 201, { id: await storeFile(me.id, upload, req, 'employee') });
        return true;
      }
    }
    m = pathname.match(/^\/api\/employee\/files\/([a-f0-9]{32})(\/delete)?$/);
    if (m) {
      const file = q('SELECT * FROM employee_files WHERE id = ? AND employee_id = ?').get(m[1], me.id);
      if (!file || (m[2] && (method !== 'POST' || file.uploaded_by !== 'employee')) || (!m[2] && method !== 'GET')) { fail(res, 404, 'Not found.'); return true; }
      if (m[2]) { q('DELETE FROM employee_files WHERE id = ?').run(file.id); await removeStored([file]); json(res, 200, { ok: true }); return true; }
      return sendFile(res, file);
    }

    if (method === 'GET' && pathname === '/api/employee/kb') {
      const term = new URL(req.url, 'http://localhost').searchParams.get('q');
      const rows = term ? q("SELECT * FROM kb_articles WHERE published = 1 AND (title LIKE ? ESCAPE '\\' OR summary LIKE ? ESCAPE '\\' OR body LIKE ? ESCAPE '\\' OR category LIKE ? ESCAPE '\\') ORDER BY category, sort, title").all(like(term), like(term), like(term), like(term))
        : q('SELECT * FROM kb_articles WHERE published = 1 ORDER BY category, sort, title').all();
      json(res, 200, { articles: rows.map(a => kbView(a, false)) });
      return true;
    }
    m = pathname.match(/^\/api\/employee\/kb\/(\d+)$/);
    if (m && method === 'GET') {
      const article = q('SELECT * FROM kb_articles WHERE id = ? AND published = 1').get(Number(m[1]));
      if (!article) { fail(res, 404, 'Article not found.'); return true; }
      json(res, 200, { article: kbView(article, true) });
      return true;
    }
    return false;
  }

  // ---------- Admin
  async function createEmployee(input) {
    let user = q('SELECT * FROM users WHERE email = ?').get(input.email);
    let setupUrl = '';
    if (user && q('SELECT 1 FROM employees WHERE user_id = ?').get(user.id)) return { conflict: true };
    if (!user) {
      const { lastInsertRowid } = q('INSERT INTO users (email, name, phone, password_hash, verified, must_change_password, created_at) VALUES (?, ?, ?, ?, 0, 1, ?)').run(input.email, input.name, input.phone, await hashPassword(randomToken()), nowIso());
      user = q('SELECT * FROM users WHERE id = ?').get(Number(lastInsertRowid));
    }
    if (!user.verified || user.must_change_password) setupUrl = `${siteUrl}/account/reset-password/?token=${issueToken(user.id, 'reset', 7 * DAY)}`;
    const { lastInsertRowid } = q('INSERT INTO employees (user_id, role_title, rate_cents, hired_on, onboarding, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(user.id, input.roleTitle, input.rateCents, input.hiredOn, input.skipOnboarding ? '' : 'forms', nowIso());
    await mail({ to: user.email, ...templates.employeeInvite({ name: user.name, setupUrl, portalUrl }) });
    return { id: Number(lastInsertRowid) };
  }

  function employeeDetail(id) {
    const e = person(id);
    return {
      employee: { id: e.id, userId: e.user_id, name: e.name, email: e.email, phone: e.phone, roleTitle: e.role_title, rateCents: e.rate_cents, status: e.status, canEstimate: Boolean(e.can_estimate), hiredOn: e.hired_on, emergencyName: e.emergency_name, emergencyPhone: e.emergency_phone, notes: e.notes, provisioning: provisioning(e, e) },
      totals: totals(id), hours: hoursOf(id), payments: paymentsOf(id),
      noteLog: q('SELECT id, author, body, created_at AS createdAt FROM employee_notes WHERE employee_id = ? ORDER BY id DESC LIMIT 200').all(id),
      contracts: q('SELECT * FROM contracts WHERE employee_id = ? ORDER BY id DESC').all(id).map(c => contractView(c)),
      requests: q('SELECT * FROM employee_requests WHERE employee_id = ? ORDER BY id DESC LIMIT 100').all(id).map(requestView),
      files: q('SELECT * FROM employee_files WHERE employee_id = ? ORDER BY created_at DESC, rowid DESC').all(id).map(fileView),
      jobs: q('SELECT j.* FROM jobs j JOIN job_assignments a ON a.job_id = j.id WHERE a.employee_id = ? ORDER BY j.id DESC').all(id).map(jobView),
      requestTypes: REQUEST_TYPES
    };
  }

  function jobDetail(id) {
    const j = q('SELECT j.*, c.name AS customer_name FROM jobs j LEFT JOIN customers c ON c.id = j.customer_id WHERE j.id = ?').get(id);
    return {
      job: { ...jobView(j), address: j.address, customerId: j.customer_id, customerName: j.customer_name || '', site: j.site_lat == null || j.site_lng == null ? null : { lat: j.site_lat, lng: j.site_lng, radius: j.site_radius_m } },
      assigned: q('SELECT e.id, u.name FROM job_assignments a JOIN employees e ON e.id = a.employee_id JOIN users u ON u.id = e.user_id WHERE a.job_id = ?').all(id),
      employees: q("SELECT e.id, u.name FROM employees e JOIN users u ON u.id = e.user_id WHERE e.status = 'active' ORDER BY u.name").all(),
      customers: q('SELECT id, name FROM customers ORDER BY name LIMIT 500').all(),
      interested: q("SELECT r.id, u.name, r.body FROM employee_requests r JOIN employees e ON e.id = r.employee_id JOIN users u ON u.id = e.user_id WHERE r.job_id = ? AND r.type = 'job_interest' AND r.status = 'pending'").all(id),
      updates: updatesOf(id), statuses: JOB_STATUSES
    };
  }

  function jobFields(body, partial) {
    const out = {};
    for (const [key, max] of [['title', 150], ['description', 5000], ['area', 100], ['address', 300], ['scheduledAt', 40]]) {
      if (body[key] === undefined && partial) continue;
      const value = text(body[key] ?? '', max);
      if (value === null) return { error: `Please check the ${key} field.` };
      out[key] = value;
    }
    if ('title' in out && !out.title) return { error: 'A job title is required.' };
    if (!partial && !out.title) return { error: 'A job title is required.' };
    if (body.status !== undefined) { if (!JOB_STATUSES.includes(body.status)) return { error: 'Unknown status.' }; out.status = body.status; }
    if (body.customerId !== undefined) {
      const id = body.customerId === null || body.customerId === '' ? null : Number(body.customerId);
      if (id !== null && !q('SELECT 1 FROM customers WHERE id = ?').get(id)) return { error: 'Customer not found.' };
      out.customerId = id;
    }
    return { out };
  }

  async function admin(req, res, pathname, method) {
    const user = currentUser(req);
    if (!user) { fail(res, 401, 'Please sign in.'); return true; }
    if (!isAdmin(user)) { fail(res, 403, 'Admin access required.'); return true; }
    let m;

    // Binary routes are handled before JSON parsing.
    m = pathname.match(/^\/api\/admin\/employees\/(\d+)\/files$/);
    if (m && method === 'POST') {
      if (!person(Number(m[1]))) { fail(res, 404, 'Employee not found.'); return true; }
      const upload = await readUpload(req, res, Number(m[1]));
      if (!upload) return true;
      json(res, 201, { id: await storeFile(Number(m[1]), upload, req, 'admin') });
      return true;
    }
    m = pathname.match(/^\/api\/admin\/employee-files\/([a-f0-9]{32})(\/delete)?$/);
    if (m) {
      const file = q('SELECT * FROM employee_files WHERE id = ?').get(m[1]);
      if (!file) { fail(res, 404, 'Not found.'); return true; }
      if (m[2] && method === 'POST') { q('DELETE FROM employee_files WHERE id = ?').run(file.id); await removeStored([file]); json(res, 200, { ok: true }); return true; }
      if (!m[2] && method === 'GET') return sendFile(res, file);
      return false;
    }

    const body = method === 'POST' ? await readBody(req, res, 60000) : {};
    if (body === null) return true;

    // ----- Employees
    if (pathname === '/api/admin/employees') {
      if (method === 'GET') {
        const rows = q(`SELECT e.*, u.name, u.email, u.phone, u.verified, u.must_change_password,
          (SELECT COUNT(*) FROM job_assignments a JOIN jobs j ON j.id = a.job_id WHERE a.employee_id = e.id AND j.status IN ('open', 'in_progress')) AS active_jobs,
          (SELECT COUNT(*) FROM time_entries t WHERE t.employee_id = e.id AND t.status = 'pending') AS pending_hours,
          (SELECT COUNT(*) FROM employee_requests r WHERE r.employee_id = e.id AND r.status = 'pending') AS pending_requests,
          (SELECT COUNT(*) FROM contracts c WHERE c.employee_id = e.id AND c.status = 'pending') AS pending_contracts
          FROM employees e JOIN users u ON u.id = e.user_id ORDER BY (e.status = 'active') DESC, u.name`).all();
        json(res, 200, { employees: rows.map(e => ({ id: e.id, name: e.name, email: e.email, phone: e.phone, roleTitle: e.role_title, rateCents: e.rate_cents, status: e.status, hiredOn: e.hired_on, activeJobs: e.active_jobs, pendingHours: e.pending_hours, pendingRequests: e.pending_requests, pendingContracts: e.pending_contracts, provisioning: provisioning(e, e) })) });
        return true;
      }
      if (method === 'POST') {
        const name = text(body.name, 120), email = text(body.email, 200)?.toLowerCase(), phone = text(body.phone ?? '', 40), roleTitle = text(body.roleTitle ?? '', 100);
        const rateCents = body.rate === undefined || body.rate === '' ? 0 : cents(body.rate);
        const hiredOn = body.hiredOn ? body.hiredOn : today();
        if (!name || !email || !EMAIL_RE.test(email) || phone === null || roleTitle === null || rateCents === null || !validDate(hiredOn)) { fail(res, 400, 'Enter a name, a valid email, a valid hourly rate and hire date.'); return true; }
        const result = await createEmployee({ name, email, phone, roleTitle, rateCents, hiredOn, skipOnboarding: body.skipOnboarding === true });
        if (result.conflict) { fail(res, 409, 'This person already has an employee account.'); return true; }
        if (Number.isInteger(body.applicationId)) q("UPDATE applications SET status = 'hired', employee_id = ? WHERE id = ?").run(result.id, body.applicationId);
        json(res, 201, { id: result.id });
        return true;
      }
    }
    m = pathname.match(/^\/api\/admin\/employees\/(\d+)\/notes(?:\/(\d+)\/delete)?$/);
    if (m && method === 'POST') {
      if (!person(Number(m[1]))) { fail(res, 404, 'Employee not found.'); return true; }
      if (m[2]) { q('DELETE FROM employee_notes WHERE id = ? AND employee_id = ?').run(Number(m[2]), Number(m[1])); json(res, 200, { ok: true }); return true; }
      const note = text(body.body, 3000);
      if (!note) { fail(res, 400, 'Write a note first.'); return true; }
      q('INSERT INTO employee_notes (employee_id, author, body, created_at) VALUES (?, ?, ?, ?)').run(Number(m[1]), user.name, note, nowIso());
      json(res, 201, { ok: true });
      return true;
    }
    m = pathname.match(/^\/api\/admin\/employees\/(\d+)(?:\/(invite|contracts|payments))?$/);
    if (m) {
      const id = Number(m[1]), e = person(id);
      if (!e) { fail(res, 404, 'Employee not found.'); return true; }
      if (!m[2] && method === 'GET') { json(res, 200, employeeDetail(id)); return true; }
      if (!m[2] && method === 'POST') {
        const name = text(body.name ?? e.name, 120), phone = text(body.phone ?? e.phone, 40), roleTitle = text(body.roleTitle ?? e.role_title, 100), emergencyName = text(body.emergencyName ?? e.emergency_name, 120), emergencyPhone = text(body.emergencyPhone ?? e.emergency_phone, 40), notes = text(body.notes ?? e.notes, 5000);
        const rateCents = body.rate === undefined ? e.rate_cents : cents(body.rate), status = body.status ?? e.status, hiredOn = body.hiredOn ?? e.hired_on;
        if (!name || [phone, roleTitle, emergencyName, emergencyPhone, notes, rateCents].includes(null) || !['active', 'inactive'].includes(status) || (hiredOn && !validDate(hiredOn))) { fail(res, 400, 'Please check the form and try again.'); return true; }
        q('UPDATE users SET name = ?, phone = ? WHERE id = ?').run(name, phone, e.user_id);
        q('UPDATE employees SET role_title = ?, rate_cents = ?, status = ?, hired_on = ?, emergency_name = ?, emergency_phone = ?, notes = ?, can_estimate = ? WHERE id = ?').run(roleTitle, rateCents, status, hiredOn, emergencyName, emergencyPhone, notes, body.canEstimate === undefined ? e.can_estimate : body.canEstimate ? 1 : 0, id);
        // Deactivated employees are signed out everywhere (admins keep their session so they cannot lock themselves out).
        if (status === 'inactive' && !isAdmin({ verified: 1, email: e.email })) q('DELETE FROM sessions WHERE user_id = ?').run(e.user_id);
        json(res, 200, { ok: true });
        return true;
      }
      if (m[2] === 'invite' && method === 'POST') {
        const setupUrl = `${siteUrl}/account/reset-password/?token=${issueToken(e.user_id, 'reset', 7 * DAY)}`;
        await mail({ to: e.email, ...templates.employeeInvite({ name: e.name, setupUrl, portalUrl }) });
        json(res, 200, { ok: true });
        return true;
      }
      if (m[2] === 'contracts' && method === 'POST') {
        const title = text(body.title, 150), contractBody = text(body.body, 20000);
        if (!title || !contractBody) { fail(res, 400, 'Add a title and the contract text.'); return true; }
        q('INSERT INTO contracts (employee_id, title, body, body_hash, created_at) VALUES (?, ?, ?, ?, ?)').run(id, title, contractBody, sha256(contractBody), nowIso());
        await notify(e, `Contract to sign: ${title}`, 'A new contract is waiting for your signature in the employee portal.');
        json(res, 201, { ok: true });
        return true;
      }
      if (m[2] === 'payments' && method === 'POST') {
        const amount = cents(body.amount), paidOn = body.paidOn || today(), method_ = text(body.method ?? '', 60), memo = text(body.memo ?? '', 300);
        if (!amount || !validDate(paidOn) || method_ === null || memo === null) { fail(res, 400, 'Enter an amount above zero and a valid date.'); return true; }
        q('INSERT INTO payments (employee_id, amount_cents, paid_on, method, memo, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(id, amount, paidOn, method_, memo, nowIso());
        await notify(e, 'A payment was recorded', `A payment of $${(amount / 100).toFixed(2)} dated ${paidOn} was added to your account.${memo ? `\n\n${memo}` : ''}`);
        json(res, 201, { ok: true });
        return true;
      }
      return false;
    }
    m = pathname.match(/^\/api\/admin\/contracts\/(\d+)\/void$/);
    if (m && method === 'POST') {
      const { changes } = q("UPDATE contracts SET status = 'void' WHERE id = ? AND status = 'pending'").run(Number(m[1]));
      if (!changes) { fail(res, 404, 'Only unsigned contracts can be voided.'); return true; }
      json(res, 200, { ok: true });
      return true;
    }
    m = pathname.match(/^\/api\/admin\/payments\/(\d+)\/delete$/);
    if (m && method === 'POST') { q('DELETE FROM payments WHERE id = ?').run(Number(m[1])); json(res, 200, { ok: true }); return true; }
    m = pathname.match(/^\/api\/admin\/hours\/(\d+)\/(approve|reject|delete)$/);
    if (m && method === 'POST') {
      const entry = q('SELECT t.*, e.rate_cents AS current_rate FROM time_entries t JOIN employees e ON e.id = t.employee_id WHERE t.id = ?').get(Number(m[1]));
      if (!entry) { fail(res, 404, 'Entry not found.'); return true; }
      if (m[2] === 'delete') q('DELETE FROM time_entries WHERE id = ?').run(entry.id);
      else q('UPDATE time_entries SET status = ?, rate_cents = ? WHERE id = ?').run(m[2] === 'approve' ? 'approved' : 'rejected', m[2] === 'approve' ? entry.current_rate : 0, entry.id);
      json(res, 200, { ok: true });
      return true;
    }
    m = pathname.match(/^\/api\/admin\/employee-requests\/(\d+)\/respond$/);
    if (m && method === 'POST') {
      const request = q('SELECT * FROM employee_requests WHERE id = ?').get(Number(m[1]));
      const response = text(body.response ?? '', 2000);
      if (!request || request.status !== 'pending') { fail(res, 404, 'This request was already answered.'); return true; }
      if (!['approved', 'denied'].includes(body.status) || response === null) { fail(res, 400, 'Approve or deny the request.'); return true; }
      q('UPDATE employee_requests SET status = ?, response = ?, resolved_at = ? WHERE id = ?').run(body.status, response, nowIso(), request.id);
      if (body.status === 'approved' && request.type === 'job_interest' && request.job_id) q('INSERT OR IGNORE INTO job_assignments (job_id, employee_id) VALUES (?, ?)').run(request.job_id, request.employee_id);
      await notify(person(request.employee_id), `Your request was ${body.status}: ${request.subject}`, response || `Your request was ${body.status}.`);
      json(res, 200, { ok: true });
      return true;
    }

    // ----- Jobs
    if (pathname === '/api/admin/jobs') {
      if (method === 'GET') {
        const rows = q(`SELECT j.*, c.name AS customer_name, (SELECT GROUP_CONCAT(u.name, ', ') FROM job_assignments a JOIN employees e ON e.id = a.employee_id JOIN users u ON u.id = e.user_id WHERE a.job_id = j.id) AS team,
          (SELECT COUNT(*) FROM employee_requests r WHERE r.job_id = j.id AND r.type = 'job_interest' AND r.status = 'pending') AS interest
          FROM jobs j LEFT JOIN customers c ON c.id = j.customer_id ORDER BY (j.status IN ('open', 'in_progress')) DESC, j.id DESC LIMIT 500`).all();
        json(res, 200, { statuses: JOB_STATUSES, jobs: rows.map(j => ({ ...jobView(j), customerName: j.customer_name || '', team: j.team || '', interest: j.interest })) });
        return true;
      }
      if (method === 'POST') {
        const { out, error } = jobFields(body, false);
        if (error) { fail(res, 400, error); return true; }
        const now = nowIso(), status = out.status || 'open';
        const { lastInsertRowid } = q('INSERT INTO jobs (customer_id, title, description, area, address, status, scheduled_at, completed_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
          .run(out.customerId ?? null, out.title, out.description || '', out.area || '', out.address || '', status, out.scheduledAt || '', status === 'completed' ? now : null, now, now);
        json(res, 201, { id: Number(lastInsertRowid) });
        return true;
      }
    }
    m = pathname.match(/^\/api\/admin\/jobs\/(\d+)(?:\/(assign|updates|delete))?$/);
    if (m) {
      const id = Number(m[1]), job = q('SELECT * FROM jobs WHERE id = ?').get(id);
      if (!job) { fail(res, 404, 'Job not found.'); return true; }
      if (!m[2] && method === 'GET') { json(res, 200, jobDetail(id)); return true; }
      if (!m[2] && method === 'POST') {
        const { out, error } = jobFields(body, true);
        if (error) { fail(res, 400, error); return true; }
        const next = { title: job.title, description: job.description, area: job.area, address: job.address, scheduledAt: job.scheduled_at, status: job.status, customerId: job.customer_id, ...out };
        const completedAt = next.status === 'completed' ? (job.completed_at || nowIso()) : null;
        q('UPDATE jobs SET customer_id = ?, title = ?, description = ?, area = ?, address = ?, scheduled_at = ?, status = ?, completed_at = ?, updated_at = ? WHERE id = ?')
          .run(next.customerId, next.title, next.description, next.area, next.address, next.scheduledAt, next.status, completedAt, nowIso(), id);
        json(res, 200, { ok: true });
        return true;
      }
      if (m[2] === 'assign' && method === 'POST') {
        const ids = Array.isArray(body.employeeIds) ? [...new Set(body.employeeIds.map(Number))] : null;
        if (!ids || ids.length > 50 || ids.some(v => !Number.isInteger(v) || !q("SELECT 1 FROM employees WHERE id = ? AND status = 'active'").get(v))) { fail(res, 400, 'Choose active employees.'); return true; }
        const before = new Set(q('SELECT employee_id FROM job_assignments WHERE job_id = ?').all(id).map(r => r.employee_id));
        q('DELETE FROM job_assignments WHERE job_id = ?').run(id);
        for (const v of ids) q('INSERT INTO job_assignments (job_id, employee_id) VALUES (?, ?)').run(id, v);
        for (const v of ids.filter(v => !before.has(v))) await notify(person(v), `New job assigned: ${job.title}`, 'You were assigned a job. Open the employee portal for the address, schedule and details.');
        json(res, 200, { ok: true });
        return true;
      }
      if (m[2] === 'updates' && method === 'POST') {
        const note = text(body.body, 2000);
        if (!note) { fail(res, 400, 'Write an update first.'); return true; }
        q('INSERT INTO job_updates (job_id, author, body, created_at) VALUES (?, ?, ?, ?)').run(id, 'Office', note, nowIso());
        json(res, 201, { ok: true });
        return true;
      }
      if (m[2] === 'delete' && method === 'POST') { q('DELETE FROM jobs WHERE id = ?').run(id); json(res, 200, { ok: true }); return true; }
      return false;
    }

    // ----- HR overview
    if (method === 'GET' && pathname === '/api/admin/hr') {
      const n = sql => q(sql).get().n;
      const pipeline = Object.fromEntries(APPLICATION_STATUSES.map(st => [st, q('SELECT COUNT(*) AS n FROM applications WHERE status = ?').get(st).n]));
      json(res, 200, {
        pipeline,
        staff: { active: n("SELECT COUNT(*) AS n FROM employees WHERE status = 'active'"), inactive: n("SELECT COUNT(*) AS n FROM employees WHERE status = 'inactive'") },
        attention: { hours: n("SELECT COUNT(*) AS n FROM time_entries WHERE status = 'pending'"), requests: n("SELECT COUNT(*) AS n FROM employee_requests WHERE status = 'pending'"), contracts: n("SELECT COUNT(*) AS n FROM contracts WHERE status = 'pending'") },
        owed: q("SELECT COALESCE(SUM(minutes * rate_cents / 60.0), 0) AS c FROM time_entries WHERE status = 'approved'").get().c - n('SELECT COALESCE(SUM(amount_cents), 0) AS n FROM payments')
      });
      return true;
    }

    // ----- Applications
    if (method === 'GET' && pathname === '/api/admin/applications') {
      json(res, 200, { statuses: APPLICATION_STATUSES, applications: q('SELECT * FROM applications ORDER BY (status = \'new\') DESC, id DESC LIMIT 500').all().map(a => ({ id: a.id, name: a.name, email: a.email, phone: a.phone, city: a.city, status: a.status, notes: a.notes, rating: a.rating, interviewAt: a.interview_at, employeeId: a.employee_id, createdAt: a.created_at, data: JSON.parse(a.data || '{}'), tests: testsOf(a.id) })) });
      return true;
    }
    m = pathname.match(/^\/api\/admin\/applications\/(\d+)\/test\/(.+)$/);
    if (m) {
      const trade = decodeURIComponent(m[2]), t = q('SELECT * FROM skill_tests WHERE application_id = ? AND trade = ?').get(Number(m[1]), trade);
      if (!t) { fail(res, 404, 'No test attempt found.'); return true; }
      if (method === 'GET') { json(res, 200, { ...skills.grade(trade, t.seed, t.lang, JSON.parse(t.answers || '{}')), submitted: Boolean(t.submitted_at) }); return true; }
      if (method === 'POST') { q('DELETE FROM skill_tests WHERE id = ?').run(t.id); json(res, 200, { ok: true }); return true; }
    }
    m = pathname.match(/^\/api\/admin\/applications\/(\d+)(\/delete)?$/);
    if (m && method === 'POST') {
      const app = q('SELECT * FROM applications WHERE id = ?').get(Number(m[1]));
      if (!app) { fail(res, 404, 'Application not found.'); return true; }
      if (m[2]) { q('DELETE FROM applications WHERE id = ?').run(app.id); json(res, 200, { ok: true }); return true; }
      const notes = text(body.notes ?? app.notes, 5000), status = body.status ?? app.status;
      const rating = body.rating === undefined ? app.rating : Number(body.rating), interviewAt = text(body.interviewAt ?? app.interview_at, 40);
      if (notes === null || interviewAt === null || !Number.isInteger(rating) || rating < 0 || rating > 5 || !APPLICATION_STATUSES.includes(status)) { fail(res, 400, 'Please check the form and try again.'); return true; }
      q('UPDATE applications SET status = ?, notes = ?, rating = ?, interview_at = ? WHERE id = ?').run(status, notes, rating, interviewAt, app.id);
      json(res, 200, { ok: true });
      return true;
    }

    // ----- Knowledge base
    if (pathname === '/api/admin/kb') {
      if (method === 'GET') { json(res, 200, { articles: q('SELECT * FROM kb_articles ORDER BY category, sort, title').all().map(a => kbView(a, false)) }); return true; }
      if (method === 'POST') {
        const a = kbFields(body, null);
        if (a.error) { fail(res, 400, a.error); return true; }
        const now = nowIso();
        const { lastInsertRowid } = q('INSERT INTO kb_articles (title, category, summary, body, published, sort, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(a.title, a.category, a.summary, a.body, a.published, a.sort, now, now);
        json(res, 201, { id: Number(lastInsertRowid) });
        return true;
      }
    }
    m = pathname.match(/^\/api\/admin\/kb\/(\d+)(\/delete)?$/);
    if (m) {
      const article = q('SELECT * FROM kb_articles WHERE id = ?').get(Number(m[1]));
      if (!article) { fail(res, 404, 'Article not found.'); return true; }
      if (!m[2] && method === 'GET') { json(res, 200, { article: kbView(article, true) }); return true; }
      if (m[2] && method === 'POST') { q('DELETE FROM kb_articles WHERE id = ?').run(article.id); json(res, 200, { ok: true }); return true; }
      if (!m[2] && method === 'POST') {
        const a = kbFields(body, article);
        if (a.error) { fail(res, 400, a.error); return true; }
        q('UPDATE kb_articles SET title = ?, category = ?, summary = ?, body = ?, published = ?, sort = ?, updated_at = ? WHERE id = ?').run(a.title, a.category, a.summary, a.body, a.published, a.sort, nowIso(), article.id);
        json(res, 200, { ok: true });
        return true;
      }
    }
    return false;
  }

  function kbFields(body, current) {
    const title = text(body.title ?? current?.title, 150), category = text(body.category ?? current?.category ?? 'General', 60), summary = text(body.summary ?? current?.summary ?? '', 300), content = text(body.body ?? current?.body, 20000);
    const sort = body.sort === undefined ? current?.sort ?? 0 : Number(body.sort);
    if (!title || !category || summary === null || !content || !Number.isInteger(sort) || Math.abs(sort) > 10000) return { error: 'Add a title, category and article text.' };
    return { title, category, summary, body: content, sort, published: (body.published ?? Boolean(current?.published ?? true)) ? 1 : 0 };
  }

  async function handle(req, res, pathname, method) {
    if (pathname === '/api/provisioning' && method === 'GET') {
      const user = currentUser(req);
      if (!user) { fail(res, 401, 'Please sign in.'); return true; }
      const employee = q('SELECT * FROM employees WHERE user_id = ?').get(user.id) || null;
      json(res, 200, { provisioning: provisioning(user, employee) });
      return true;
    }
    if (pathname === '/api/applications' && method === 'POST') return apply(req, res);
    if (pathname === '/api/applications/test' && (method === 'GET' || method === 'POST')) return skillTest(req, res, method);
    if (pathname.startsWith('/api/employee/')) return portal(req, res, pathname, method);
    if (/^\/api\/admin\/(employees|employee-files|employee-requests|jobs|applications|hours|hr|payments|contracts|kb)(\/|$)/.test(pathname)) return admin(req, res, pathname, method);
    return false;
  }

  return { handle };
}

module.exports = { createStaff };
