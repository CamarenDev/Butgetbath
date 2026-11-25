'use strict';
// New-hire onboarding: first-login forms (personal, tax, contract), experience intake and a 1-3 day training program
// with quizzes and a final exam. Until the office signs the employee off, employees.onboarding holds the current stage
// and the clock, jobs and field-work routes refuse the employee. '' means fully onboarded.
const crypto = require('node:crypto');
const training = require('./training');
const { TRADE_LIST } = require('./skill-tests');

const DAY_MS = 86400000;
const FILING = { single: 'Single or married filing separately', married_joint: 'Married filing jointly', head: 'Head of household' };
const I9_STATUS = { citizen: 'A citizen of the United States', noncitizen_national: 'A noncitizen national of the United States', lpr: 'A lawful permanent resident', authorized_alien: 'A noncitizen authorized to work' };
const LOCATION_CONSENT = 'I understand that while I am clocked in, the app records my phone\u2019s precise location (GPS), movement and device details and shares them with Budget Bath Solutions management. Location must stay on for the whole shift, and if it turns off I will be clocked out and the office alerted. Tracking stops when I clock out.';
const W4_TEXT = 'Under penalties of perjury, I declare that the withholding information I entered is true, correct and complete. I understand that the office will use it to complete my IRS Form W-4, and that I may update it at any time.';
const DEFAULT_CONTRACT = `BUDGET BATH SOLUTIONS - EMPLOYMENT AGREEMENT AND POLICIES (starter template: have an attorney review before use)

1. Position and pay. You are employed in the position and at the hourly rate the company has given you. Pay is based on approved, verified hours worked at assigned job sites. Time spent off site without approval, and unpaid lunch breaks, are not paid.

2. At-will employment. Employment is at will: either you or the company may end it at any time, with or without cause or notice.

3. Time keeping and location. You must clock in and out with the company app on your registered phone. You consent to the recording of your phone\u2019s location while clocked in. Falsifying time or location, sharing your login or device, or disabling location during a shift is grounds for immediate termination.

4. Conduct. You agree to follow the company rules taught in training: arrive on time, treat customers and coworkers with respect, never work under the influence, never take customer property, and report injuries, damage and mistakes immediately.

5. Safety. You agree to use required protective equipment, follow safe work practices and stop work on any condition you believe is unsafe.

6. Customer relationships. You will not solicit company customers for personal side work during employment or quote prices on the company\u2019s behalf.

7. Confidentiality and property. Customer information, pricing, and company tools, vehicles, materials and software remain company property or confidential and must be returned or protected.

8. Photos and records. Job photos and records you create belong to the company and may be used for business purposes.

9. Complete agreement. This agreement and the company policies taught in training are the full agreement and may be updated in writing.`;

const clean = (v, max) => typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max) : '';
const sha256 = v => crypto.createHash('sha256').update(v).digest('hex');
const dollars = (v, max = 1000000) => { if (v === '' || v == null) return 0; const n = Number(v); return Number.isFinite(n) && n >= 0 && n <= max ? Math.round(n * 100) : null; };

function createOnboarding({ db, mailer, templates, siteUrl, notifyEmail = '', clientIp, json, fail, readJson, currentUser, isAdmin, limited }) {
  const q = sql => db.prepare(sql);
  const nowIso = () => new Date().toISOString();
  const mail = async message => { try { await mailer(message); } catch (error) { console.error('Email failed:', error.message); } };
  const portalUrl = `${siteUrl}/employee/`;
  const setting = (key, fallback) => q('SELECT value FROM settings WHERE key = ?').get(`onboarding.${key}`)?.value ?? fallback;
  const contractText = () => setting('contract', DEFAULT_CONTRACT);
  const defaultDays = () => { const n = Number(setting('days', 3)); return n >= 1 && n <= 3 ? n : 3; };
  const personOf = id => q('SELECT e.*, u.name, u.email, u.phone FROM employees e JOIN users u ON u.id = e.user_id WHERE e.id = ?').get(id);
  const rowOf = id => {
    q('INSERT OR IGNORE INTO onboarding (employee_id, training_days) VALUES (?, ?)').run(id, defaultDays());
    return q('SELECT * FROM onboarding WHERE employee_id = ?').get(id);
  };
  const progressOf = id => new Map(q('SELECT * FROM training_progress WHERE employee_id = ?').all(id).map(r => [r.module, r]));
  const readBody = async (req, res, limit = 20000) => {
    if (!(req.headers['content-type'] || '').toLowerCase().startsWith('application/json')) { fail(res, 415, 'Please submit from the website.'); return null; }
    const parsed = await readJson(req, limit);
    if (parsed.error) { fail(res, parsed.error === 'too-large' ? 413 : 400, 'Please check the form and try again.'); return null; }
    return parsed.body && typeof parsed.body === 'object' ? parsed.body : {};
  };

  function sign(id, kind, name, docText, req) {
    q('INSERT INTO onboarding_signatures (employee_id, kind, name, doc_hash, doc_text, ip, user_agent, signed_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .run(id, kind, name, sha256(docText), docText, clientIp(req), String(req.headers['user-agent'] || '').slice(0, 300), nowIso());
  }

  // ---------- Training schedule
  function schedule(row, progress) {
    const started = Date.parse(row.training_started_at) || 0, days = row.training_days;
    const modules = training.MODULES.map(m => {
      const day = training.effectiveDay(m.day, days), unlockAt = started ? started + (day - 1) * training.DAY_GAP_HOURS * 3600000 : Infinity;
      const p = progress.get(m.key);
      return { key: m.key, title: m.title, minutes: m.minutes, day, locked: Date.now() < unlockAt, unlockAt: Number.isFinite(unlockAt) ? new Date(unlockAt).toISOString() : '', passed: Boolean(p?.passed_at), attempts: p?.attempts || 0, bestPercent: p?.best_percent || 0 };
    });
    const f = progress.get('final');
    const allPassed = modules.every(m => m.passed);
    const final = { key: 'final', title: 'Final exam', locked: !allPassed, passed: Boolean(f?.passed_at), attempts: f?.attempts || 0, attemptsLeft: Math.max(0, training.FINAL_MAX_ATTEMPTS - (f?.attempts || 0)), bestPercent: f?.best_percent || 0 };
    return { modules, final, days, startedAt: row.training_started_at, passMark: training.PASS_PERCENT, finalQuestions: training.FINAL.length };
  }

  async function advance(id) {
    const e = personOf(id), row = rowOf(id);
    if (!e || !e.onboarding) return '';
    const progress = progressOf(id);
    let stage;
    if (!row.personal_at || !row.tax_at || !row.contract_at) stage = 'forms';
    else if (!row.experience_at) stage = 'experience';
    else if (!training.MODULES.every(m => progress.get(m.key)?.passed_at) || !progress.get('final')?.passed_at) stage = 'training';
    else stage = 'review';
    if (stage === 'training' && !row.training_started_at) q('UPDATE onboarding SET training_started_at = ? WHERE employee_id = ?').run(nowIso(), id);
    if (stage === 'review' && !row.training_done_at) {
      q('UPDATE onboarding SET training_done_at = ? WHERE employee_id = ?').run(nowIso(), id);
      if (notifyEmail) await mail({ to: notifyEmail, ...templates.officeAlert({ subject: `${e.name} finished new-hire training`, body: `${e.name} completed the forms, experience profile, all training modules and the final exam. Review the results and sign them off in the admin Onboarding page to unlock clock-in and jobs.`, url: `${siteUrl}/admin/#onboarding`, cta: 'Open Onboarding' }) });
    }
    if (stage !== e.onboarding) q('UPDATE employees SET onboarding = ? WHERE id = ?').run(stage, id);
    return stage;
  }

  // ---------- Experience
  const BOOLS = ['ownVehicle', 'driversLicense', 'canLift50', 'okWithHeights'];
  const TEXTS = { certifications: 600, licenses: 600, toolsOwned: 800, languages: 200, priorEmployers: 1000, availability: 300, notes: 1500 };
  function cleanExperience(body) {
    const taskKeys = new Set(training.TASKS.map(t => t[0]));
    const tasks = {};
    for (const [k, v] of Object.entries(body.tasks && typeof body.tasks === 'object' ? body.tasks : {})) if (taskKeys.has(k) && [0, 1, 2, 3].includes(v)) tasks[k] = v;
    if (Object.keys(tasks).length < taskKeys.size) return null;
    const trades = (Array.isArray(body.trades) ? body.trades : []).slice(0, 12).map(t => ({ name: clean(t?.name, 60), years: Number(t?.years), level: Number(t?.level) }))
      .filter(t => TRADE_LIST.includes(t.name) && Number.isInteger(t.years) && t.years >= 0 && t.years <= 60 && [1, 2, 3].includes(t.level));
    const out = { trades, tasks };
    for (const b of BOOLS) out[b] = body[b] === true;
    for (const [k, max] of Object.entries(TEXTS)) out[k] = clean(body[k], max);
    return out;
  }
  const experienceOf = id => { const r = q('SELECT body, updated_at FROM employee_experience WHERE employee_id = ?').get(id); try { return r ? { ...JSON.parse(r.body), updatedAt: r.updated_at } : null; } catch { return null; } };

  // ---------- Employee-facing views
  function stateFor(e, user) {
    const row = rowOf(e.id), progress = progressOf(e.id);
    return {
      stage: e.onboarding, done: !e.onboarding,
      steps: { personal: Boolean(row.personal_at), tax: Boolean(row.tax_at), contract: Boolean(row.contract_at), experience: Boolean(row.experience_at) },
      profile: { name: user.name, email: user.email, phone: user.phone || '', address: row.address, city: row.city, state: row.state, zip: row.zip, emergencyName: e.emergency_name, emergencyPhone: e.emergency_phone, emergencyRelation: row.emergency_relation },
      tax: { filingStatus: row.filing_status, multipleJobs: Boolean(row.multiple_jobs), i9Status: row.i9_status, i9Docs: row.i9_docs, depositBank: row.deposit_bank, depositType: row.deposit_type, depositLast4: row.deposit_last4, ssnLast4: e.tax_id_last4 },
      options: { filing: FILING, i9: I9_STATUS },
      contract: { title: 'Employment agreement and policies', text: contractText(), locationConsent: `${LOCATION_CONSENT} The record of your consent and work-time location data is retained under the company recordkeeping policy and applicable law, and is limited to authorized staff.`, w4Text: W4_TEXT, signed: Boolean(row.contract_at) },
      experience: experienceOf(e.id), catalog: { tasks: training.TASKS, levels: training.LEVELS, trades: TRADE_LIST },
      training: row.experience_at ? schedule(row, progress) : null, signoffNote: row.signoff_note
    };
  }

  async function employeeRoutes(req, res, pathname, method) {
    const user = currentUser(req);
    if (!user) { fail(res, 401, 'Please sign in.'); return true; }
    const e = user.verified ? q("SELECT e.*, u.name, u.email FROM employees e JOIN users u ON u.id = e.user_id WHERE e.user_id = ? AND e.status = 'active'").get(user.id) : null;
    if (!e) { fail(res, 403, 'This account does not have employee access.'); return true; }
    const sub = pathname.replace('/api/employee/onboarding', '').replace(/^\//, '');
    if (method === 'GET' && sub === '') { json(res, 200, stateFor(e, user)); return true; }

    let m = sub.match(/^training\/([a-z-]+)$/);
    if (m && method === 'GET') {
      const key = m[1], row = rowOf(e.id), progress = progressOf(e.id), sched = schedule(row, progress);
      const mod = training.MODULES.find(x => x.key === key), entry = key === 'final' ? sched.final : sched.modules.find(x => x.key === key);
      if (!row.experience_at || !entry) { fail(res, 404, 'Not available yet.'); return true; }
      if (entry.locked) { fail(res, 403, key === 'final' ? 'Pass every module first.' : 'This lesson unlocks later in your training schedule.'); return true; }
      if (key === 'final' && !entry.passed && entry.attemptsLeft < 1) { fail(res, 403, 'You have used all final exam attempts. Ask the office to reset it.'); return true; }
      const qs = training.forClient(training.questions(key, e.id, entry.attempts));
      json(res, 200, { key, title: entry.title, lessons: mod ? mod.lessons.map(([h, p]) => ({ h, p })) : [], questions: qs, passMark: training.PASS_PERCENT, attempts: entry.attempts, passed: entry.passed });
      return true;
    }

    if (method !== 'POST') return false;
    if (limited(req, 'onboarding', 200)) { fail(res, 429, 'Too many requests. Please wait a moment.'); return true; }
    const body = await readBody(req, res, sub === 'experience' ? 30000 : 20000);
    if (!body) return true;

    if (sub === 'personal') {
      const f = { address: clean(body.address, 200), city: clean(body.city, 80), state: clean(body.state, 40), zip: clean(body.zip, 12), emergencyName: clean(body.emergencyName, 120), emergencyPhone: clean(body.emergencyPhone, 40), emergencyRelation: clean(body.emergencyRelation, 60), phone: clean(body.phone, 40) };
      if (Object.entries(f).some(([k, v]) => k !== 'phone' && !v) || f.phone.length < 7 || !/\d{3}/.test(f.emergencyPhone) || !/^[\w .-]{3,12}$/.test(f.zip)) { fail(res, 400, 'Fill in every field, including a phone number and an emergency contact.'); return true; }
      rowOf(e.id);
      q("UPDATE onboarding SET address = ?, city = ?, state = ?, zip = ?, emergency_relation = ?, personal_at = ? WHERE employee_id = ?").run(f.address, f.city, f.state, f.zip, f.emergencyRelation, nowIso(), e.id);
      q('UPDATE employees SET emergency_name = ?, emergency_phone = ? WHERE id = ?').run(f.emergencyName, f.emergencyPhone, e.id);
      q('UPDATE users SET phone = ? WHERE id = ?').run(f.phone, user.id);
      await advance(e.id);
      json(res, 200, stateFor(personOf(e.id), { ...user, phone: f.phone }));
      return true;
    }

    if (sub === 'tax') {
      if (rowOf(e.id).tax_at) { fail(res, 409, 'Your tax and pay forms are already signed.'); return true; }
      const credits = dollars(body.credits), other = dollars(body.otherIncome), deductions = dollars(body.deductions), extra = dollars(body.extraWithholding, 100000);
      const deposit = body.depositType === 'check' ? { bank: '', type: 'check', last4: '' } : { bank: clean(body.depositBank, 80), type: body.depositType, last4: clean(body.depositLast4, 4) };
      const name = clean(body.signName, 120);
      if (!/^\d{4}$/.test(clean(body.ssnLast4, 4)) || !FILING[body.filingStatus] || !I9_STATUS[body.i9Status] || [credits, other, deductions, extra].includes(null)
        || !['check', 'checking', 'savings'].includes(deposit.type) || (deposit.type !== 'check' && (!deposit.bank || !/^\d{4}$/.test(deposit.last4)))) { fail(res, 400, 'Check the tax and payment details and try again.'); return true; }
      if (body.agree !== true || name.length < 3) { fail(res, 400, 'Type your full name and confirm the statement to sign.'); return true; }
      const docs = clean(body.i9Docs, 300);
      rowOf(e.id);
      q('UPDATE onboarding SET filing_status = ?, multiple_jobs = ?, credits_cents = ?, other_income_cents = ?, deductions_cents = ?, extra_withholding_cents = ?, i9_status = ?, i9_docs = ?, deposit_bank = ?, deposit_type = ?, deposit_last4 = ?, tax_at = ? WHERE employee_id = ?')
        .run(body.filingStatus, body.multipleJobs ? 1 : 0, credits, other, deductions, extra, body.i9Status, docs, deposit.bank, deposit.type, deposit.last4, nowIso(), e.id);
      q('UPDATE employees SET tax_id_last4 = ?, w4_on = ? WHERE id = ?').run(clean(body.ssnLast4, 4), nowIso().slice(0, 10), e.id);
      sign(e.id, 'w4', name, `${W4_TEXT}\nFiling status: ${FILING[body.filingStatus]}. Multiple jobs: ${body.multipleJobs ? 'yes' : 'no'}.`, req);
      sign(e.id, 'i9-section1', name, `I attest, under penalty of perjury, that I am: ${I9_STATUS[body.i9Status]}. I will present original identity and work authorization documents to the company within 3 business days of my start date.`, req);
      await advance(e.id);
      json(res, 200, stateFor(personOf(e.id), user));
      return true;
    }

    if (sub === 'contract') {
      const row = rowOf(e.id), name = clean(body.signName, 120);
      if (!row.personal_at || !row.tax_at) { fail(res, 409, 'Finish your personal and tax details first.'); return true; }
      if (row.contract_at) { fail(res, 409, 'You have already signed.'); return true; }
      if (body.agree !== true || body.locationConsent !== true || name.length < 3) { fail(res, 400, 'Type your full name and accept the agreement and the location notice to sign.'); return true; }
      const text = contractText();
      sign(e.id, 'contract', name, text, req);
      sign(e.id, 'location-consent', name, LOCATION_CONSENT, req);
      q("INSERT INTO contracts (employee_id, title, body, body_hash, status, signed_name, signed_at, created_at) VALUES (?, ?, ?, ?, 'signed', ?, ?, ?)").run(e.id, 'Employment agreement and policies', text, sha256(text), name, nowIso(), nowIso());
      q('UPDATE onboarding SET contract_at = ? WHERE employee_id = ?').run(nowIso(), e.id);
      await advance(e.id);
      json(res, 200, stateFor(personOf(e.id), user));
      return true;
    }

    if (sub === 'experience') {
      const exp = cleanExperience(body);
      if (!exp) { fail(res, 400, 'Rate every task, even if it is \u201cNo experience\u201d.'); return true; }
      q('INSERT INTO employee_experience (employee_id, body, updated_at) VALUES (?, ?, ?) ON CONFLICT(employee_id) DO UPDATE SET body = excluded.body, updated_at = excluded.updated_at').run(e.id, JSON.stringify(exp), nowIso());
      if (e.onboarding) { rowOf(e.id); q("UPDATE onboarding SET experience_at = CASE WHEN experience_at = '' THEN ? ELSE experience_at END WHERE employee_id = ?").run(nowIso(), e.id); }
      await advance(e.id);
      json(res, 200, stateFor(personOf(e.id), user));
      return true;
    }

    m = sub.match(/^training\/([a-z-]+)$/);
    if (m) {
      const key = m[1], row = rowOf(e.id), progress = progressOf(e.id), sched = schedule(row, progress);
      const entry = key === 'final' ? sched.final : sched.modules.find(x => x.key === key);
      if (!row.experience_at || !entry || entry.locked) { fail(res, 403, 'Not available yet.'); return true; }
      if (key === 'final' && !entry.passed && entry.attemptsLeft < 1) { fail(res, 403, 'You have used all final exam attempts. Ask the office to reset it.'); return true; }
      if (body.attempt != null && body.attempt !== entry.attempts) { fail(res, 409, 'This quiz changed in another tab. Reload the lesson before submitting.'); return true; }
      const answers = training.cleanAnswers(key, e.id, entry.attempts, body.answers);
      if (!answers) { fail(res, 400, 'Answer every question with one of the available choices.'); return true; }
      const result = training.grade(key, e.id, entry.attempts, answers);
      const at = nowIso(), prev = progress.get(key);
      q('INSERT INTO training_progress (employee_id, module, attempts, last_percent, best_percent, passed_at, last_at) VALUES (?, ?, 1, ?, ?, ?, ?) ON CONFLICT(employee_id, module) DO UPDATE SET attempts = attempts + 1, last_percent = excluded.last_percent, best_percent = MAX(best_percent, excluded.best_percent), passed_at = CASE WHEN passed_at != \'\' THEN passed_at ELSE excluded.passed_at END, last_at = excluded.last_at')
        .run(e.id, key, result.percent, result.percent, result.passed ? at : '', at);
      const stage = await advance(e.id);
      const finalExam = key === 'final';
      json(res, 200, { score: result.score, total: result.total, percent: result.percent, passed: result.passed || Boolean(prev?.passed_at), stage,
        // Module quizzes teach by showing the right answers; the final exam never reveals them.
        missed: finalExam ? result.missed.map(x => ({ id: x.id, question: x.question })) : result.missed,
        attemptsLeft: finalExam ? Math.max(0, training.FINAL_MAX_ATTEMPTS - entry.attempts - 1) : null });
      return true;
    }
    return false;
  }

  // ---------- Admin
  const stepsOf = (e, row, progress) => ({
    stage: e.onboarding || (row ? 'complete' : 'legacy'), forms: row ? [row.personal_at, row.tax_at, row.contract_at].filter(Boolean).length : 0, experience: Boolean(row?.experience_at),
    modulesPassed: training.MODULES.filter(m => progress.get(m.key)?.passed_at).length, modules: training.MODULES.length, finalPassed: Boolean(progress.get('final')?.passed_at), finalPercent: progress.get('final')?.best_percent || 0
  });

  async function adminRoutes(req, res, pathname, method) {
    const user = currentUser(req);
    if (!user) { fail(res, 401, 'Please sign in.'); return true; }
    if (!isAdmin(user)) { fail(res, 403, 'Admin access required.'); return true; }
    const url = new URL(req.url, 'http://x');

    if (method === 'GET' && pathname === '/api/admin/onboarding') {
      const rows = q('SELECT e.*, u.name, u.email FROM employees e JOIN users u ON u.id = e.user_id WHERE e.onboarding != \'\' OR e.id IN (SELECT employee_id FROM onboarding) ORDER BY (e.onboarding = \'\'), e.id DESC').all();
      json(res, 200, { employees: rows.map(e => ({ id: e.id, name: e.name, email: e.email, roleTitle: e.role_title, ...stepsOf(e, rowOf(e.id), progressOf(e.id)) })) });
      return true;
    }
    if (pathname === '/api/admin/onboarding/config') {
      if (method === 'GET') { json(res, 200, { contractText: contractText(), defaultDays: defaultDays(), isDefault: contractText() === DEFAULT_CONTRACT }); return true; }
      if (method !== 'POST') return false;
      const body = await readBody(req, res, 60000);
      if (!body) return true;
      const text = typeof body.contractText === 'string' ? body.contractText.trim() : '', days = Number(body.defaultDays);
      if (text.length < 100 || text.length > 30000 || !Number.isInteger(days) || days < 1 || days > 3) { fail(res, 400, 'Enter the contract text (at least 100 characters) and a training length from 1 to 3 days.'); return true; }
      q('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run('onboarding.contract', text);
      q('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run('onboarding.days', String(days));
      json(res, 200, { ok: true });
      return true;
    }
    if (method === 'GET' && pathname === '/api/admin/onboarding/match') {
      const task = clean(url.searchParams.get('task') || '', 40), trade = clean(url.searchParams.get('trade') || '', 60);
      if (task && !training.TASKS.some(t => t[0] === task)) { fail(res, 400, 'Unknown task.'); return true; }
      const people = q("SELECT e.id, e.onboarding, e.role_title, u.name FROM employees e JOIN users u ON u.id = e.user_id WHERE e.status = 'active'").all().map(e => {
        const x = experienceOf(e.id), t = x?.trades.find(r => r.name === trade);
        const level = task ? x?.tasks[task] ?? -1 : -1;
        return { id: e.id, name: e.name, roleTitle: e.role_title, level, years: t?.years || 0, tradeLevel: t?.level || 0, ready: !e.onboarding, hasProfile: Boolean(x) };
      }).filter(p => p.hasProfile && (!task || p.level > 0) && (!trade || p.tradeLevel > 0));
      people.sort((a, b) => b.level - a.level || b.tradeLevel - a.tradeLevel || b.years - a.years || a.name.localeCompare(b.name));
      json(res, 200, { people, tasks: training.TASKS, trades: TRADE_LIST, levels: training.LEVELS });
      return true;
    }

    const m = pathname.match(/^\/api\/admin\/onboarding\/(\d+)(?:\/(signoff|days|reset|verify-i9|reopen))?$/);
    if (!m) return false;
    const id = Number(m[1]), e = personOf(id);
    if (!e) { fail(res, 404, 'Employee not found.'); return true; }

    if (method === 'GET' && !m[2]) {
      const row = q('SELECT * FROM onboarding WHERE employee_id = ?').get(id), progress = progressOf(id);
      json(res, 200, {
        employee: { id, name: e.name, email: e.email, roleTitle: e.role_title },
        summary: stepsOf(e, row, progress), row: row ? {
          address: [row.address, row.city, row.state, row.zip].filter(Boolean).join(', '), emergencyRelation: row.emergency_relation, emergencyName: e.emergency_name, emergencyPhone: e.emergency_phone,
          tax: { ssnLast4: e.tax_id_last4, filing: FILING[row.filing_status] || '', multipleJobs: Boolean(row.multiple_jobs), credits: row.credits_cents, otherIncome: row.other_income_cents, deductions: row.deductions_cents, extraWithholding: row.extra_withholding_cents },
          i9: { status: I9_STATUS[row.i9_status] || '', docs: row.i9_docs, verifiedAt: row.i9_verified_at, verifiedBy: row.i9_verified_by },
          deposit: { bank: row.deposit_bank, type: row.deposit_type, last4: row.deposit_last4 },
          days: row.training_days, startedAt: row.training_started_at, doneAt: row.training_done_at, signoffBy: row.signoff_by, signoffAt: row.signoff_at, signoffNote: row.signoff_note
        } : null,
        signatures: q('SELECT id, kind, name, doc_hash AS hash, doc_text AS text, ip, user_agent AS userAgent, signed_at AS signedAt FROM onboarding_signatures WHERE employee_id = ? ORDER BY id').all(id),
        training: row ? [...training.MODULES.map(x => ({ key: x.key, title: x.title })), { key: 'final', title: 'Final exam' }].map(x => { const p = progress.get(x.key); return { ...x, attempts: p?.attempts || 0, best: p?.best_percent || 0, last: p?.last_percent || 0, passedAt: p?.passed_at || '', lastAt: p?.last_at || '' }; }) : [],
        experience: experienceOf(id), catalog: { tasks: training.TASKS, levels: training.LEVELS }
      });
      return true;
    }
    if (method !== 'POST' || !m[2]) return false;
    const body = await readBody(req, res);
    if (!body) return true;
    const row = rowOf(id);

    if (m[2] === 'days') {
      const days = Number(body.days);
      if (!Number.isInteger(days) || days < 1 || days > 3) { fail(res, 400, 'Training can run 1 to 3 days.'); return true; }
      q('UPDATE onboarding SET training_days = ? WHERE employee_id = ?').run(days, id);
    } else if (m[2] === 'reset') {
      const key = clean(body.module, 40);
      if (key === 'all') q('DELETE FROM training_progress WHERE employee_id = ?').run(id);
      else if (training.bankOf(key)) q('DELETE FROM training_progress WHERE employee_id = ? AND module = ?').run(id, key);
      else { fail(res, 400, 'Unknown module.'); return true; }
      q("UPDATE onboarding SET training_done_at = '' WHERE employee_id = ?").run(id);
      await advance(id);
    } else if (m[2] === 'verify-i9') {
      q('UPDATE onboarding SET i9_verified_at = ?, i9_verified_by = ?, i9_docs = ? WHERE employee_id = ?').run(nowIso(), user.name, clean(body.docs, 300) || row.i9_docs, id);
      q('UPDATE employees SET i9_on = ? WHERE id = ?').run(nowIso().slice(0, 10), id);
    } else if (m[2] === 'signoff') {
      if (!e.onboarding && row.signoff_at) { json(res, 200, { ok: true, duplicate: true }); return true; }
      const progress = progressOf(id);
      if (e.status !== 'active' || e.onboarding !== 'review' || !row.training_done_at || !training.MODULES.every(m => progress.get(m.key)?.passed_at) || !progress.get('final')?.passed_at) { fail(res, 409, 'The employee must finish onboarding and training before sign-off.'); return true; }
      q('UPDATE onboarding SET signoff_by = ?, signoff_at = ?, signoff_note = ? WHERE employee_id = ?').run(user.name, nowIso(), clean(body.note, 500), id);
      q("UPDATE employees SET onboarding = '' WHERE id = ?").run(id);
      await mail({ to: e.email, ...templates.staffNotice({ name: e.name, subject: 'Onboarding complete: you can start work', body: 'The office has signed off on your training. You can now clock in and see your jobs in the employee portal.', url: portalUrl }) });
    } else if (m[2] === 'reopen') {
      q("UPDATE onboarding SET signoff_at = '', signoff_by = '', signoff_note = '', training_done_at = '' WHERE employee_id = ?").run(id);
      q("UPDATE employees SET onboarding = 'forms' WHERE id = ?").run(id);
      await advance(id);
    }
    json(res, 200, { ok: true });
    return true;
  }

  async function handle(req, res, pathname, method) {
    if (pathname === '/api/employee/onboarding' || pathname.startsWith('/api/employee/onboarding/')) return employeeRoutes(req, res, pathname, method);
    if (pathname === '/api/admin/onboarding' || pathname.startsWith('/api/admin/onboarding/')) return adminRoutes(req, res, pathname, method);
    return false;
  }

  return { handle };
}

module.exports = { createOnboarding };
