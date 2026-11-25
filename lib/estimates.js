// Bathroom remodel estimator: price book, estimates, customer approval, e-signed documents and payments.
const crypto = require('node:crypto');
const { Pdf } = require('./pdf');
const { calibrate, accuracy, parse: parseJson } = require('./learning');
const { analyze: analyzePhotos } = require('./vision');
const { costs } = require('./bathroom');
const { insights } = require('./insights');
const { advisor } = require('./advisor');
const permitLib = require('./permits');
const { requirements, CITIES } = require('./codes');
const { TASKS, CATS, handymanPlan } = require('./handyman');
const labor = require('./labor-times');
const playbook = require('./playbook');
const { tagsOf, tagsFromItems, checklist, SOURCE_LABELS } = require('./tools');
const { KINDS, KIND_LABELS, TIERS, UNITS, SEED, DEFAULT_SETTINGS, bp, computeTotals, takeoff, takeoffPlan, documentTemplates, money } = require('./estimating');

const STATUSES = ['draft', 'sent', 'accepted', 'declined', 'void'];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const validDate = v => typeof v === 'string' && DATE_RE.test(v) && !Number.isNaN(Date.parse(v));
const sha256 = v => crypto.createHash('sha256').update(v).digest('hex');
const normalizeName = v => String(v).trim().replace(/\s+/g, ' ').toLowerCase();
const COMPANY = 'Budget Bath Solutions';
const CONSENT = 'I agree to do business electronically, to sign and receive this document and related records electronically, and I understand that typing my name is my legal signature under the U.S. ESIGN Act and the Uniform Electronic Transactions Act. I can request a paper copy or withdraw consent by contacting the company.';

function createEstimates({ tracking = null, db, mailer, templates, siteUrl, notifyEmail = '', clientIp: getClientIp, paymentsEnabled = Boolean(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_WEBHOOK_SECRET), json, fail, readBuffer, readJson, currentUser, isAdmin, limited, text, env = process.env, fetchImpl = (...a) => fetch(...a) }) {
  const q = sql => db.prepare(sql);
  const nowIso = () => new Date().toISOString();
  const today = () => nowIso().slice(0, 10);
  const paymentsAvailable = () => paymentsEnabled || Boolean(env.STRIPE_SECRET_KEY && env.STRIPE_WEBHOOK_SECRET);
  const mail = async message => { try { await mailer(message); } catch (error) { console.error('Email failed:', error.message); } };
  const alertOffice = (subject, body) => notifyEmail ? mail({ to: notifyEmail, ...templates.customerMessage({ name: 'team', subject, body }) }) : null;
  const like = term => `%${String(term || '').trim().slice(0, 100).replace(/[\\%_]/g, '\\$&')}%`;
  const isJson = req => (req.headers['content-type'] || '').toLowerCase().startsWith('application/json');
  const dollars = (v, max = 1000000) => { const n = Number(v); return v !== '' && v !== null && v !== undefined && Number.isFinite(n) && n >= 0 && n <= max ? Math.round(n * 100) : null; };
  const pct = (v, max = 100) => { const n = Number(v); return v !== '' && v !== null && v !== undefined && Number.isFinite(n) && n >= 0 && n <= max ? bp(n) : null; };

  async function readBody(req, res, limit = 60000) {
    if (!isJson(req)) { fail(res, 415, 'Please submit from the website.'); return null; }
    const parsed = await readJson(req, limit);
    if (parsed.error) { fail(res, parsed.error === 'too-large' ? 413 : 400, 'Please check the form and try again.'); return null; }
    return parsed.body;
  }

  // ---------- Price book and settings
  // Adds any seed item missing from the price book (also upgrades existing databases); admin edits and removals are kept.
  {
    const exists = q("SELECT 1 FROM estimate_catalog WHERE code = ? AND tier = ?");
    const insert = q('INSERT INTO estimate_catalog (code, category, name, kind, unit, cost_cents, waste_bp, tier, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');
    for (const [code, category, name, kind, unit, cost, waste, tier] of SEED) if (!exists.get(code, tier)) insert.run(code, category, name, kind, unit, Math.round(cost * 100), waste * 100, tier, nowIso());
  }
  const settings = () => ({ ...DEFAULT_SETTINGS, ...Object.fromEntries(q('SELECT key, value FROM estimate_settings').all().map(r => [r.key, r.value])) });
  const catalogView = c => ({ id: c.id, code: c.code, category: c.category, name: c.name, kind: c.kind, unit: c.unit, costCents: c.cost_cents, wasteBp: c.waste_bp, tier: c.tier });
  const catalogRows = () => q('SELECT * FROM estimate_catalog WHERE active = 1 ORDER BY category, name, tier').all();
  const outcomeRows = () => q(`SELECT * FROM estimate_outcomes WHERE features NOT LIKE '%"jobType":"handyman"%' ORDER BY id DESC LIMIT 60`).all();
  {
    for (const t of TASKS) if (labor.HANDYMAN_REVISIONS[t.code]) t.hrs = labor.HANDYMAN_REVISIONS[t.code][1];
    const have = q('SELECT 1 FROM handyman_tasks WHERE code = ?');
    const add = q('INSERT INTO handyman_tasks (code, category, name, unit, hrs, mat_cents, trade, tags, crew, min_hrs, permit_type, permit_note, lead_days, sort) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
    for (const t of TASKS) if (!have.get(t.code)) add.run(t.code, t.category, t.name, t.unit, t.hrs, Math.round(t.mat * 100), t.trade, JSON.stringify(t.tags), t.crew || 1, t.min || 0, t.permit?.[0] || '', t.permit?.[1] || '', t.lead || 0, t.sort);
    // Existing databases pick up researched hours only where the admin has not edited the row.
    const revise = q('UPDATE handyman_tasks SET hrs = ? WHERE code = ? AND hrs = ?');
    for (const [code, [was, now]] of Object.entries(labor.HANDYMAN_REVISIONS)) revise.run(now, code, was);
  }
  const taskRows = () => q('SELECT * FROM handyman_tasks WHERE active = 1 ORDER BY sort, id').all().map(r => ({ ...r, tags: (() => { try { return JSON.parse(r.tags); } catch { return []; } })() }));
  const taskView = r => ({ code: r.code, category: r.category, name: r.name, unit: r.unit, hrs: r.hrs, matCents: r.mat_cents, trade: r.trade, crew: r.crew, permit: r.permit_type });
  // Region factor scales labor to the local market. A Saturday premium is added when Saturday work is on.
  const planFor = (inputs, tier) => {
    const st = settings(), given = inputs && typeof inputs === 'object' ? { ...inputs } : {};
    given._stores = q('SELECT id, name, city, lat, lon FROM supply_stores').all().map(r => ({ ...r, id: `custom-${r.id}`, verified: true }));
    if (tier) given.tier = tier;
    const plan = given.jobType === 'handyman' ? handymanPlan(given, taskRows(), st, st) : takeoffPlan(given, catalogRows(), calibrate(outcomeRows()), st);
    const region = Math.min(200, Math.max(50, Number(st.region_factor_pct) || 100)) / 100, premium = Math.min(100, Math.max(0, Number(st.weekend_premium_pct) || 0)) / 100;
    if (region !== 1) for (const i of plan.items) if (i.kind === 'labor') i.cost_cents = Math.round(i.cost_cents * region);
    if (premium && st.work_saturday === '1') {
      const labor = plan.items.filter(i => i.kind === 'labor' && !i.optional).reduce((n, i) => n + Math.round(i.qty * (1 + (i.waste_bp || 0) / 10000) * i.cost_cents), 0);
      if (labor) plan.items.push({ section: 'Finish & closeout', kind: 'labor', name: `Saturday work premium (${Math.round(premium * 100)}% on about one sixth of labor)`, qty: 1, unit: 'ls', cost_cents: Math.round(labor / 6 * premium), waste_bp: 0, optional: false, accepted: true });
    }
    return plan;
  };
  const customCities = () => q('SELECT * FROM jurisdictions ORDER BY city').all().map(r => ({ id: r.id, city: r.city, dept: r.dept, url: r.url, county: r.county || '', reviewMin: r.review_min, reviewMax: r.review_max, verified: !!r.verified, notes: (() => { try { return JSON.parse(r.notes); } catch { return []; } })() }));
  const bizDays = (a, b) => { const x = Date.parse(a), y = Date.parse(b); return Number.isFinite(x) && Number.isFinite(y) && y >= x ? Math.max(0, Math.round((y - x) / 864e5 * 5 / 7)) : null; };
  // Real turnaround from permits you have recorded (application to issue), per city and type. Needs 3 or more to be trusted.
  const permitActualsFor = city => type => {
    const days = q("SELECT applied_on, issued_on FROM permit_records WHERE type = ? AND city = ? COLLATE NOCASE AND applied_on != '' AND issued_on != ''").all(type, String(city || '')).map(r => bizDays(r.applied_on, r.issued_on)).filter(n => n !== null);
    return days.length ? { n: days.length, min: Math.min(...days), max: Math.max(...days) } : null;
  };
  const codesFor = (cfg, city, extra = {}) => requirements(cfg, city, customCities(), { ...extra, actualFor: permitActualsFor(city) });
  const advisorFor = (inputs, plan, totals, insights) => advisor({ plan, totals, settings: settings(), inputs: inputs || {}, insights });
  const insightsFor = (inputs, plan, totals) => insights({ plan, totals, settings: settings(), rows: { inputs, learnedJobs: calibrate(outcomeRows()).n }, planAt: t => planFor(inputs, t) });
  const processFor = (inputs, plan) => plan.kind === 'handyman' ? { kind: 'handyman', ...playbook.handymanProcess(plan, taskRows(), inputs) } : { kind: 'bathroom', ...playbook.bathroomProcess(plan) };
  const savePrediction = (id, inputs, plan, extra = {}) => q('UPDATE estimates SET wizard = ?, prediction = ? WHERE id = ?').run(JSON.stringify(inputs).slice(0, 8000), JSON.stringify({ jobType: plan.kind || 'bathroom', base: plan.cost.base, adjustedCostCents: plan.cost.adjusted.total, features: plan.features, hours: plan.schedule.hours, hoursBase: plan.schedule.baseHours, ...extra }), id);

  // ---------- Loading and views
  const paidOf = id => q('SELECT COALESCE(SUM(amount_cents), 0) AS c FROM estimate_payments WHERE estimate_id = ?').get(id).c;
  const itemsOf = id => q('SELECT * FROM estimate_items WHERE estimate_id = ? ORDER BY sort, id').all(id);
  const calc = est => computeTotals(est, itemsOf(est.id), paidOf(est.id));
  const toolsFor = e => {
    let tags;
    try { const w = JSON.parse(e.wizard || '{}'); if (w && Object.keys(w).length) tags = tagsOf(planFor(w).cfg); } catch { tags = null; }
    return checklist(tags || tagsFromItems(itemsOf(e.id)));
  };
  const saveJobTools = (jobId, list) => {
    const done = new Map(q('SELECT name, checked, checked_by, checked_at FROM job_tools WHERE job_id = ?').all(jobId).map(r => [r.name, r]));
    q('DELETE FROM job_tools WHERE job_id = ?').run(jobId);
    list.forEach((t, i) => { const d = done.get(t.name); q('INSERT INTO job_tools (job_id, name, grp, qty, source, note, checked, checked_by, checked_at, sort) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(jobId, t.name, t.group, t.qty, t.src, t.note, d?.checked || 0, d?.checked_by || '', d?.checked_at || '', i); });
  };
  // What the crew sees: the method, roles, day plan, logistics and cleanup. No prices, markup or customer totals.
  const briefFor = e => {
    let inputs; try { inputs = JSON.parse(e.wizard || '{}'); } catch { inputs = null; }
    if (!inputs || !Object.keys(inputs).length) return null;
    const plan = planFor(inputs), proc = processFor(inputs, plan);
    return {
      title: e.title, kind: proc.kind, totalHours: proc.totalHours, totalDays: proc.totalDays, cushionPct: proc.cushionPct,
      steps: (proc.steps || proc.tasks || []).map(st => ({ n: st.n, title: st.title || st.name, hours: st.hours, crew: st.crew || null, qty: st.qty || null, unit: st.unit || '', how: st.steps, tools: st.tools, supplies: st.supplies, jobSupplies: st.jobSupplies || [], roles: (st.assignments || []).map(a => ({ role: a.role, people: a.people, hours: a.hours, duties: a.duties })) })),
      crew: proc.crew, dayPlan: proc.dayPlan, logistics: proc.logistics, travel: proc.travel, closeout: proc.closeout
    };
  };
  const saveJobBrief = (jobId, e) => {
    const b = briefFor(e);
    if (!b) return;
    q('INSERT INTO job_briefs (job_id, body, updated_at) VALUES (?, ?, ?) ON CONFLICT(job_id) DO UPDATE SET body = excluded.body, updated_at = excluded.updated_at').run(jobId, JSON.stringify(b), nowIso());
  };
  // What the crew reports from the field, so the estimator can learn where jobs run late, hit problems or carry liability.
  const fieldStats = () => {
    const rep = q("SELECT COUNT(*) AS n, COUNT(DISTINCT job_id) AS jobs, SUM(status = 'delayed') AS delayed, SUM(status = 'blocked') AS blocked, SUM(TRIM(problems) <> '') AS problems FROM job_reports").get();
    const media = q('SELECT COUNT(*) AS n FROM job_media').get().n;
    const lia = q('SELECT type, COUNT(*) AS n, SUM(consented) AS consented FROM job_liabilities GROUP BY type ORDER BY n DESC').all();
    const recent = q("SELECT r.report_date AS date, r.status, r.problems, j.title FROM job_reports r JOIN jobs j ON j.id = r.job_id WHERE TRIM(r.problems) <> '' ORDER BY r.report_date DESC, r.id DESC LIMIT 8").all();
    return { reports: rep.n || 0, jobs: rep.jobs || 0, delayed: rep.delayed || 0, blocked: rep.blocked || 0, withProblems: rep.problems || 0, media, liabilities: lia.map(l => ({ type: l.type, count: l.n, consented: l.consented || 0 })), recentProblems: recent };
  };
  const customerOf = id => id ? q('SELECT * FROM customers WHERE id = ?').get(id) : null;
  const docView = d => ({ id: d.id, title: d.title, body: d.body, status: d.status, signedName: d.signed_name, signedAt: d.signed_at, createdAt: d.created_at });
  const paymentsOf = id => q('SELECT id, amount_cents AS amountCents, method, memo, paid_on AS paidOn, provider_ref IS NOT NULL AS online FROM estimate_payments WHERE estimate_id = ? ORDER BY paid_on DESC, id DESC').all(id);
  const header = (e, customer) => ({
    id: e.id, number: e.number, kind: e.kind, parentId: e.parent_id, customerId: e.customer_id, customerName: customer?.name || '', jobId: e.job_id, title: e.title, scope: e.scope, exclusions: e.exclusions, terms: e.terms,
    status: e.status, display: e.display, validUntil: e.valid_until, signedName: e.signed_name, signedAt: e.signed_at, signedTotalCents: e.signed_total_cents, declinedReason: e.declined_reason, sentAt: e.sent_at, createdAt: e.created_at, updatedAt: e.updated_at
  });
  function staffView(e, actor) {
    const customer = customerOf(e.customer_id), { lines, totals } = calc(e);
    if (!actor.admin) { delete totals.profitCents; delete totals.marginPct; }
    return {
      estimate: { ...header(e, customer), createdBy: e.created_by, internalNotes: e.internal_notes, ...(actor.admin && { markupBp: e.markup_bp, taxBp: e.tax_bp, contingencyBp: e.contingency_bp, depositBp: e.deposit_bp, discountCents: e.discount_cents }) },
      customer: customer && { id: customer.id, name: customer.name, email: customer.email, phone: customer.phone, address: customer.address },
      lines, totals, payments: actor.admin ? paymentsOf(e.id) : [], documents: actor.admin ? q('SELECT * FROM estimate_documents WHERE estimate_id = ? ORDER BY id').all(e.id).map(docView) : [],
      permits: permitsFor(e.id, actor.admin), permitMeta: permitMeta(), editable: canEdit(e, actor), crew: actor.admin && tracking ? tracking.crewForJob(e.job_id) : null
    };
  }
  // What the customer sees: billed prices only, never internal cost, markup or margin.
  function customerView(e) {
    const { lines, totals } = calc(e), docs = q('SELECT * FROM estimate_documents WHERE estimate_id = ? AND status != \'void\' ORDER BY id').all(e.id).map(docView);
    const base = lines.filter(l => !l.optional && l.included), sections = [...new Set(base.map(l => l.section))].map(name => ({ name, totalCents: base.filter(l => l.section === name).reduce((a, l) => a + l.price, 0) }));
    const shown = e.display === 'sections' ? lines.filter(l => l.optional) : lines;
    return {
      ...header(e, customerOf(e.customer_id)), items: shown.map(l => ({ id: l.id, section: l.section, name: l.name, qty: l.qty, unit: l.unit, priceCents: l.price, optional: l.optional, accepted: l.accepted })), sections: e.display === 'sections' ? sections : null,
      totals: { subtotalCents: totals.subtotalCents, contingencyCents: totals.contingencyCents, discountCents: totals.discountCents, taxCents: totals.taxCents, totalCents: totals.totalCents, depositCents: totals.depositCents, paidCents: totals.paidCents, balanceCents: totals.balanceCents, depositDueCents: totals.depositDueCents },
      payments: paymentsOf(e.id).map(({ online, ...p }) => p), documents: docs, permits: permitsFor(e.id, false), payEnabled: paymentsAvailable(), consent: CONSENT
    };
  }
  const listRow = e => { const { totals } = calc(e); return { ...header(e, customerOf(e.customer_id)), totalCents: totals.totalCents, paidCents: totals.paidCents }; };

  // ---------- Access
  function actorOf(req) {
    const user = currentUser(req);
    if (!user) return null;
    if (isAdmin(user)) return { user, admin: true };
    const employee = user.verified ? q("SELECT * FROM employees WHERE user_id = ? AND status = 'active' AND can_estimate = 1 AND onboarding = ''").get(user.id) : null;
    return employee ? { user, admin: false, employee } : { user, denied: true };
  }
  const canView = (e, actor) => actor.admin || e.created_by === actor.user.id;
  const canEdit = (e, actor) => actor.admin ? ['draft', 'sent', 'declined'].includes(e.status) : canView(e, actor) && e.status === 'draft';
  const touch = (e, actor) => {
    const status = e.status !== 'draft' && actor.admin ? 'draft' : e.status;
    q('UPDATE estimates SET status = ?, updated_at = ? WHERE id = ?').run(status, nowIso(), e.id);
  };

  // ---------- Item helpers
  function itemFields(body, current) {
    const name = text(body.name ?? current?.name, 200), section = text(body.section ?? current?.section ?? 'General', 80), unit = body.unit ?? current?.unit ?? 'ea', kind = body.kind ?? current?.kind ?? 'material';
    const qty = body.qty === undefined ? current?.qty ?? 1 : Number(body.qty), costCents = body.cost === undefined ? current?.cost_cents ?? 0 : dollars(body.cost, 100000);
    const waste = body.wastePct === undefined ? current?.waste_bp ?? 0 : pct(body.wastePct, 50);
    if (!name || !section || !KINDS.includes(kind) || !UNITS.includes(unit) || !Number.isFinite(qty) || qty < 0 || qty > 100000 || costCents === null || waste === null) return { error: 'Check the item name, quantity, unit and cost.' };
    return { item: { name, section, kind, unit, qty: Math.round(qty * 100) / 100, cost_cents: costCents, waste_bp: waste, optional: (body.optional ?? Boolean(current?.optional)) ? 1 : 0 } };
  }
  const insertItems = (estimateId, items) => {
    const insert = q('INSERT INTO estimate_items (estimate_id, section, kind, name, qty, unit, cost_cents, waste_bp, optional, accepted, sort) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
    let sort = (q('SELECT COALESCE(MAX(sort), 0) AS n FROM estimate_items WHERE estimate_id = ?').get(estimateId).n) + 1;
    for (const i of items) insert.run(estimateId, i.section, i.kind, i.name, i.qty, i.unit, i.cost_cents, i.waste_bp, i.optional ? 1 : 0, i.optional ? 0 : 1, sort++);
  };

  function createEstimate({ customerId, title, actorUserId, kind = 'estimate', parent = null }) {
    const s = settings(), now = nowIso();
    const validUntil = new Date(Date.now() + Number(s.valid_days) * 86400000).toISOString().slice(0, 10);
    const { lastInsertRowid } = q('INSERT INTO estimates (number, kind, parent_id, customer_id, job_id, created_by, title, scope, exclusions, terms, markup_bp, tax_bp, contingency_bp, deposit_bp, valid_until, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(`tmp-${crypto.randomBytes(6).toString('hex')}`, kind, parent?.id ?? null, customerId, parent?.job_id ?? null, actorUserId, title, '', s.exclusions, s.terms, bp(s.markup_pct), bp(s.tax_pct), bp(s.contingency_pct), bp(s.deposit_pct), validUntil, now, now);
    const id = Number(lastInsertRowid);
    q('UPDATE estimates SET number = ? WHERE id = ?').run(kind === 'change_order' ? `CO-${String(id).padStart(4, '0')}` : `EST-${now.slice(0, 4)}-${String(id).padStart(4, '0')}`, id);
    return id;
  }


  // ---------- PDFs and signature evidence
  const clientIp = req => String((getClientIp || (() => req.socket && req.socket.remoteAddress))(req) || '').slice(0, 64);
  const evidence = req => ({ ip: clientIp(req), ua: String(req.headers['user-agent'] || '').slice(0, 300) });
  const stamp = v => v ? `${new Date(v).toISOString().replace('T', ' ').slice(0, 19)} UTC` : '';
  const snapshotOf = (e, lines, totals) => JSON.stringify({ number: e.number, scope: e.scope, exclusions: e.exclusions, terms: e.terms, lines: lines.filter(l => l.included).map(l => [l.name, l.qty, l.unit, l.price]), total: totals.totalCents });
  function signatureBlock(pdf, { who, name, at, ip, ua, hash, consent, role = 'Customer' }) {
    pdf.space(6);
    pdf.box(`${role} electronic signature`, name ? [`Signed by: ${name}`, `Signed on: ${stamp(at)}`, `IP address: ${ip || 'not recorded'}`, `Device: ${ua || 'not recorded'}`, `Document fingerprint (SHA-256): ${hash}`, `Consent: ${consent || CONSENT}`]
      : ['Not yet signed.', `Document fingerprint (SHA-256): ${hash}`]);
    if (name) { pdf.space(4); pdf.text(name, { size: 18, italic: true, gap: 0 }); pdf.rule(0.3); pdf.text(`${who}, ${role.toLowerCase()}`, { size: 8, gray: 0.4 }); }
  }
  function companyHeader(pdf, title, number) {
    pdf.text(COMPANY, { size: 18, bold: true, gap: 0 }); pdf.text(`${title}${number ? ` \u00b7 ${number}` : ''}`, { size: 11, gray: 0.35 }); pdf.rule(0.3);
  }
  function estimatePdf(e) {
    const customer = customerOf(e.customer_id), { lines, totals } = calc(e), view = customerView(e), pdf = new Pdf({ title: `${e.number} ${e.title}`, author: COMPANY, footer: `${COMPANY} \u00b7 ${e.number}` });
    companyHeader(pdf, e.kind === 'change_order' ? 'Change Order Estimate' : 'Estimate & Proposal', e.number);
    pdf.text(e.title, { size: 14, bold: true });
    pdf.text([`Prepared for: ${customer?.name || ''}`, customer?.address, customer?.email, e.created_at && `Date: ${e.created_at.slice(0, 10)}`, e.valid_until && e.status === 'sent' && `Valid until: ${e.valid_until}`].filter(Boolean).join('\n'), { size: 10 });
    if (e.scope) { pdf.heading('Scope of work', 12); pdf.text(e.scope, { size: 10 }); }
    pdf.heading('Price breakdown', 12);
    const base = view.sections ? view.sections.map(s => [s.name, '', money(s.totalCents)]) : lines.filter(l => !l.optional).map(l => [l.name, `${l.qty} ${l.unit}`, money(l.price)]);
    pdf.table([['Item', 'Qty', 'Amount'], ...base], { widths: [0.6, 0.18, 0.22] });
    const opts = lines.filter(l => l.optional);
    if (opts.length) { pdf.text('Optional add-ons', { size: 10, bold: true }); pdf.table(opts.map(l => [`${l.name} (${l.accepted ? 'accepted' : 'not selected'})`, '', money(l.price)]), { widths: [0.6, 0.18, 0.22] }); }
    pdf.rule();
    pdf.table([['Subtotal', money(totals.subtotalCents)], ...(totals.contingencyCents ? [['Contingency allowance', money(totals.contingencyCents)]] : []), ...(totals.discountCents ? [['Discount', `-${money(totals.discountCents)}`]] : []), ...(totals.taxCents ? [['Sales tax', money(totals.taxCents)]] : [])], { widths: [0.75, 0.25] });
    pdf.table([['Total', money(totals.totalCents)]], { widths: [0.75, 0.25], bold: true, size: 12 });
    pdf.table([['Deposit to schedule', money(totals.depositCents)]], { widths: [0.75, 0.25] });
    if (e.exclusions) { pdf.heading('Not included', 12); pdf.text(e.exclusions, { size: 9 }); }
    if (e.terms) { pdf.heading('Terms', 12); pdf.text(e.terms, { size: 9 }); }
    const hash = e.signed_hash || sha256(snapshotOf(e, lines, totals));
    pdf.text(`Contractor: ${COMPANY}${e.sent_by ? `, issued by ${e.sent_by}` : ''}${e.sent_at ? ` on ${stamp(e.sent_at)}` : ''}`, { size: 9, gray: 0.3 });
    signatureBlock(pdf, { who: e.signed_name, name: e.signed_name, at: e.signed_at, ip: e.signed_ip, ua: e.signed_ua, hash, consent: e.signed_consent });
    return pdf.build();
  }
  function documentPdf(e, doc) {
    const customer = customerOf(e.customer_id), pdf = new Pdf({ title: doc.title, author: COMPANY, footer: `${COMPANY} \u00b7 ${e.number} \u00b7 ${doc.title}` });
    companyHeader(pdf, doc.title, e.number);
    pdf.text(doc.body, { size: 10 });
    pdf.text(`Contractor: ${COMPANY}${doc.issued_by ? `, issued by ${doc.issued_by}` : ''} on ${stamp(doc.created_at)}`, { size: 9, gray: 0.3 });
    signatureBlock(pdf, { who: customer?.name || '', name: doc.signed_name, at: doc.signed_at, ip: doc.signed_ip, ua: doc.signed_ua, hash: doc.body_hash, consent: doc.signed_consent });
    return pdf.build();
  }
  const sendPdf = (res, buffer, filename) => { res.writeHead(200, { 'Content-Type': 'application/pdf', 'Content-Length': buffer.length, 'Content-Disposition': `inline; filename="${filename}"`, 'Cache-Control': 'private, no-store' }); res.end(buffer); };
  const slug = s => String(s).replace(/[^A-Za-z0-9._-]+/g, '-').slice(0, 80);
  async function mailSignedCopy(customer, subject, body, pdfBuffer, filename) {
    const attachments = [{ filename, content: pdfBuffer.toString('base64'), content_type: 'application/pdf' }];
    if (customer?.email) await mail({ to: customer.email, ...templates.customerMessage({ name: customer.name, subject, body }), attachments });
    if (notifyEmail) await mail({ to: notifyEmail, ...templates.customerMessage({ name: 'Team', subject: `Signed copy: ${subject}`, body }), attachments });
  }

  // ---------- Permit tracking
  const permitRows = id => q('SELECT * FROM permit_records WHERE estimate_id = ? ORDER BY id').all(id);
  const permitView = (r, staff) => ({
    id: r.id, type: r.type, description: r.description, city: r.city, status: r.status, statusLabel: permitLib.STATUSES[r.status] || r.status, number: r.number, feeCents: r.fee_cents,
    appliedOn: r.applied_on, issuedOn: r.issued_on, expiresOn: r.expires_on, customerNote: r.customer_note, reviewDays: permitLib.reviewFor(r.type, 'standard', null, null).range,
    ...(staff && { internalNote: r.internal_note }),
    inspections: q('SELECT * FROM permit_inspections WHERE permit_id = ? ORDER BY id').all(r.id).map(i => ({ id: i.id, name: i.name, scheduledOn: i.scheduled_on, result: i.result, resultLabel: permitLib.RESULTS[i.result] || i.result, note: i.note }))
  });
  const permitsFor = (id, staff) => permitRows(id).filter(r => staff || r.status !== 'waived').map(r => permitView(r, staff));
  const permitMeta = () => ({ types: permitLib.TYPES, statuses: permitLib.STATUSES, results: permitLib.RESULTS });

  async function permitRoute(req, res, pathname, method, actor) {
    const pm = pathname.match(/^\/api\/estimator\/estimates\/(\d+)\/permits(?:\/(\d+)(?:\/(delete)|\/inspections(?:\/(\d+)(?:\/(delete))?)?)?)?$/);
    if (!pm) return false;
    const e = q('SELECT * FROM estimates WHERE id = ?').get(Number(pm[1]));
    if (!e || !canView(e, actor)) { fail(res, 404, 'Estimate not found.'); return true; }
    if (method === 'GET' && !pm[2]) { json(res, 200, { permits: permitsFor(e.id, actor.admin), ...permitMeta() }); return true; }
    if (method !== 'POST') return false;
    if (!actor.admin) { fail(res, 403, 'Admin access required.'); return true; }
    const body = await readBody(req, res); if (!body) return true;
    const date = v => v === undefined ? undefined : (v === '' || v === null ? '' : validDate(v) ? v : null);
    const reply = () => json(res, 200, { permits: permitsFor(e.id, true) });
    const permitId = pm[2] ? Number(pm[2]) : null, record = permitId ? q('SELECT * FROM permit_records WHERE id = ? AND estimate_id = ?').get(permitId, e.id) : null;
    if (permitId && !record) { fail(res, 404, 'Permit not found.'); return true; }

    if (!permitId) {
      const type = permitLib.TYPES.includes(body.type) ? body.type : null, description = text(body.description ?? '', 300), city = text(body.city ?? '', 80), number = text(body.number ?? '', 60);
      const status = body.status === undefined ? 'needed' : (permitLib.STATUSES[body.status] ? body.status : null), fee = body.fee === undefined || body.fee === '' ? 0 : dollars(body.fee, 100000);
      const dates = ['appliedOn', 'issuedOn', 'expiresOn'].map(k => date(body[k]));
      if (!type || [description, city, number, status, fee, ...dates].includes(null)) { fail(res, 400, 'Check the permit type, status, fee and dates.'); return true; }
      q('INSERT INTO permit_records (estimate_id, type, description, city, status, number, fee_cents, applied_on, issued_on, expires_on, customer_note, internal_note, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
        .run(e.id, type, description, city, status, number, fee, dates[0] || '', dates[1] || '', dates[2] || '', '', '', nowIso(), nowIso());
      reply(); return true;
    }
    if (pm[3] === 'delete') { q('DELETE FROM permit_records WHERE id = ?').run(permitId); reply(); return true; }
    if (pm[4] && pm[5] === 'delete') { q('DELETE FROM permit_inspections WHERE id = ? AND permit_id = ?').run(Number(pm[4]), permitId); reply(); return true; }
    if (pm.input.includes('/inspections')) {
      const name = text(body.name ?? '', 120), scheduled = date(body.scheduledOn), note = text(body.note ?? '', 500);
      if ([name, scheduled, note].includes(null) || (!pm[4] && !name) || (body.result !== undefined && !permitLib.RESULTS[body.result])) { fail(res, 400, 'Check the inspection name, date and result.'); return true; }
      if (pm[4]) {
        const ins = q('SELECT * FROM permit_inspections WHERE id = ? AND permit_id = ?').get(Number(pm[4]), permitId);
        if (!ins) { fail(res, 404, 'Inspection not found.'); return true; }
        q('UPDATE permit_inspections SET name = ?, scheduled_on = ?, result = ?, note = ? WHERE id = ?').run(name || ins.name, scheduled ?? ins.scheduled_on, body.result ?? ins.result, body.note === undefined ? ins.note : note, ins.id);
        if (body.result && body.result !== ins.result && ['failed', 'corrections'].includes(body.result)) await alertOffice(`Inspection ${permitLib.RESULTS[body.result].toLowerCase()}: ${e.number}`, `${ins.name} for the ${record.type} permit on ${e.number} is marked "${permitLib.RESULTS[body.result]}". Schedule the corrections and a re-inspection.`);
      } else q('INSERT INTO permit_inspections (permit_id, name, scheduled_on, note) VALUES (?, ?, ?, ?)').run(permitId, name, scheduled || '', note);
      reply(); return true;
    }
    const pick = (k, max) => body[k] === undefined ? undefined : text(body[k], max);
    const f = { description: pick('description', 300), city: pick('city', 80), number: pick('number', 60), customer_note: pick('customerNote', 500), internal_note: pick('internalNote', 1000), applied_on: date(body.appliedOn), issued_on: date(body.issuedOn), expires_on: date(body.expiresOn) };
    const fee = body.fee === undefined || body.fee === '' ? undefined : dollars(body.fee, 100000);
    if (Object.values(f).includes(null) || fee === null || (body.status !== undefined && !permitLib.STATUSES[body.status]) || (body.type !== undefined && !permitLib.TYPES.includes(body.type))) { fail(res, 400, 'Check the permit fields.'); return true; }
    const next = { ...record }; for (const [k, v] of Object.entries(f)) if (v !== undefined) next[k] = v;
    if (fee !== undefined) next.fee_cents = fee; if (body.status) next.status = body.status; if (body.type) next.type = body.type;
    if (next.status === 'applied' && !next.applied_on) next.applied_on = today();
    if (['issued', 'inspections'].includes(next.status) && !next.issued_on) next.issued_on = today();
    q('UPDATE permit_records SET type = ?, description = ?, city = ?, status = ?, number = ?, fee_cents = ?, applied_on = ?, issued_on = ?, expires_on = ?, customer_note = ?, internal_note = ?, updated_at = ? WHERE id = ?')
      .run(next.type, next.description, next.city, next.status, next.number, next.fee_cents, next.applied_on, next.issued_on, next.expires_on, next.customer_note, next.internal_note, nowIso(), permitId);
    if (next.status !== record.status && ['issued', 'closed'].includes(next.status)) {
      const customer = customerOf(e.customer_id);
      if (customer?.email) await mail({ to: customer.email, ...templates.customerMessage({ name: customer.name, subject: `Permit update for ${e.title}`, body: `Good news: the ${next.type.toLowerCase()} permit for your project is now "${permitLib.STATUSES[next.status]}". You can see all permits and inspections in your account under this estimate.` }) });
    }
    reply(); return true;
  }

  // ---------- Staff API
  async function staff(req, res, pathname, method) {
    const actor = actorOf(req);
    if (!actor) { fail(res, 401, 'Please sign in.'); return true; }
    if (actor.denied) { fail(res, 403, 'Your account is not allowed to use the estimator. Ask the office to turn it on.'); return true; }
    let m;
    if (method === 'GET' && pathname === '/api/estimator/verify') {
      if (!actor.admin) { fail(res, 403, 'Admin access required.'); return true; }
      const hash = (new URL(req.url, 'http://x').searchParams.get('hash') || '').trim().toLowerCase();
      if (!/^[0-9a-f]{64}$/.test(hash)) { fail(res, 400, 'Enter the 64-character fingerprint.'); return true; }
      const est = q("SELECT id, number, signed_name, signed_at FROM estimates WHERE signed_hash = ? AND status = 'accepted'").get(hash), doc = q("SELECT estimate_id, title, signed_name, signed_at FROM estimate_documents WHERE body_hash = ? AND status = 'signed' LIMIT 1").get(hash);
      json(res, 200, est ? { valid: true, kind: 'estimate', estimateId: est.id, reference: est.number, signedBy: est.signed_name, signedAt: est.signed_at } : doc ? { valid: true, kind: 'document', estimateId: doc.estimate_id, reference: doc.title, signedBy: doc.signed_name, signedAt: doc.signed_at } : { valid: false });
      return true;
    }

    if (method === 'GET' && pathname === '/api/estimator/me') { json(res, 200, { role: actor.admin ? 'admin' : 'employee', name: actor.user.name }); return true; }
    if (method === 'POST' && pathname === '/api/estimator/advice') {
      const body = await readBody(req, res); if (!body) return true;
      const st = settings(), plan = planFor(body.inputs), { items, notes } = plan;
      const est = { markup_bp: bp(st.markup_pct), tax_bp: bp(st.tax_pct), contingency_bp: Math.max(bp(st.contingency_pct), bp(plan.contingencyPct)), deposit_bp: bp(st.deposit_pct), discount_cents: 0 };
      const { totals } = computeTotals(est, items.map((item, n) => ({ id: n, ...item })), 0);
      const ins = insightsFor(body.inputs || {}, plan, totals);
      json(res, 200, { supplyTrip: plan.logistics?.supplyTrip || null, notes, schedule: plan.schedule, endDate: plan.schedule.endDate, hours: plan.schedule.hours, crew: plan.schedule.peakCrew, contingencyPct: plan.contingencyPct, learnedJobs: calibrate(outcomeRows()).n, lineCount: items.length, optionalCount: items.filter(i => i.optional).length, totalCents: totals.totalCents, depositCents: totals.depositCents, insights: ins, advisor: advisorFor(body.inputs || {}, plan, totals, ins), codes: codesFor(plan.cfg, (body.inputs || {}).city), process: processFor(body.inputs, plan) });
      return true;
    }
    if (method === 'GET' && pathname === '/api/estimator/labor-times') { json(res, 200, labor.view()); return true; }
    if (method === 'POST' && pathname === '/api/estimator/advice/pdf') {
      const body = await readBody(req, res); if (!body) return true;
      const st = settings(), inputs = body.inputs && typeof body.inputs === 'object' ? body.inputs : {}, plan = planFor(inputs), { items, notes } = plan;
      const est = { markup_bp: bp(st.markup_pct), tax_bp: bp(st.tax_pct), contingency_bp: Math.max(bp(st.contingency_pct), bp(plan.contingencyPct)), deposit_bp: bp(st.deposit_pct), discount_cents: 0 };
      const { lines, totals } = computeTotals(est, items.map((item, n) => ({ id: n, ...item })), 0);
      const title = String(body.title || (inputs.jobType === 'handyman' ? 'Handyman and home repair' : 'Bathroom remodel')).slice(0, 150), pdf = new Pdf({ title: `Estimator results: ${title}`, author: COMPANY, footer: `${COMPANY} \u00b7 Estimator results` });
      companyHeader(pdf, inputs.fullRemodel === true || inputs.fullRemodel === 'true' ? 'Full Remodel Estimator Results' : 'Estimator Results', 'Preview');
      pdf.text(title, { size: 14, bold: true });
      pdf.text(`Date: ${nowIso().slice(0, 10)}  \u00b7  Prices: ${st.prices_updated || 'n/a'}`, { size: 9, gray: 0.3 });
      if (notes.length) { pdf.heading('How the estimator adapted to this job', 12); pdf.text(notes.map(n => `\u2022 ${n}`).join('\n'), { size: 9 }); }
      const sections = [...new Set(lines.filter(l => !l.optional).map(l => l.section))];
      pdf.heading('Scope and price', 12);
      for (const sec of sections) {
        const rows = lines.filter(l => !l.optional && l.section === sec);
        pdf.text(sec, { size: 10, bold: true });
        pdf.table([...rows.map(l => [l.name, `${l.qty} ${l.unit}`, money(l.price)]), ['Section total', '', money(rows.reduce((n, l) => n + l.price, 0))]], { widths: [0.6, 0.18, 0.22], size: 9 });
      }
      const sh = plan.schedule.shift;
      pdf.heading(`Crew and schedule: ${plan.schedule.peakCrew} people, about ${plan.schedule.hours} labor hours, ${plan.schedule.days} working days`, 12);
      pdf.text(`Work hours ${sh.start} to ${sh.end}, ${plan.schedule.weekdayRange}${sh.saturday ? ' (Saturday work on)' : ', weekends off'}. ${sh.lunchMin} minute lunch and ${sh.breakMin} minutes of breaks, ${sh.productiveHours} productive hours per person per day. Estimated ${plan.schedule.startDate} to ${plan.schedule.endDate}.`, { size: 9 });
      pdf.table([['Phase', 'Dates', 'Crew', 'Days', 'Hours'], ...plan.schedule.phases.map(p => [p.phase, p.start === p.end ? p.start.slice(5) : `${p.start.slice(5)} to ${p.end.slice(5)}`, p.crew ? String(p.crew) : 'waiting', String(p.days), p.crew ? String(p.hours) : '-']), ['Total', '', `${plan.schedule.peakCrew} peak`, String(plan.schedule.days), String(plan.schedule.hours)]], { widths: [0.42, 0.22, 0.12, 0.1, 0.14], size: 9 });
      const proc = processFor(inputs, plan);
      pdf.heading(`Step-by-step process (includes an ${proc.cushionPct}% time cushion for human error and unforeseen conditions)`, 12);
      for (const st of proc.steps || proc.tasks) {
        pdf.text(`${st.n}. ${st.title || st.name}: ${st.hours} hrs${st.crew ? `, crew of ${st.crew}` : ''}`, { size: 9, bold: true });
        pdf.text(st.steps.join(' '), { size: 8, indent: 12 });
        pdf.text(`Tools: ${st.tools.join(', ')}. Supplies: ${st.supplies.join(', ')}.`, { size: 8, italic: true, indent: 12, gray: 0.3 });
      }
      if (proc.crew && proc.crew.length) {
        pdf.heading('Who does what', 12);
        pdf.table([['Role', 'People', 'Hours'], ...proc.crew.map(c => [c.role, String(c.people), String(c.hours)])], { widths: [0.6, 0.2, 0.2], size: 9 });
        pdf.text(proc.crew.map(c => `${c.role}: ${c.note}`).join('\n'), { size: 8, indent: 12 });
      }
      pdf.heading('Access, supplies, debris, cleanup and travel', 12);
      for (const r of proc.logistics || []) pdf.text(`${r.label}: ${r.text}`, { size: 9 });
      for (const n of plan.logistics?.notes || []) pdf.text(`\u2022 ${n}`, { size: 8, italic: true, gray: 0.3 });
      pdf.heading('Daily cleanup, final clean and closeout', 12);
      for (const [k, v] of Object.entries(proc.closeout || {})) pdf.text(`${k[0].toUpperCase() + k.slice(1)}: ${v.join(' ')}`, { size: 8 });
      const ins = insightsFor(inputs, plan, totals);
      pdf.heading('Estimate insights', 12);
      pdf.text([ins.summary, `Confidence ${ins.confidence.score}%: likely range ${money(ins.confidence.lowCents)} to ${money(ins.confidence.highCents)}.`, `Gross margin ${ins.margin.grossPct}%.${ins.benchmark ? ` Price per sq ft: $${ins.benchmark.perSf}.` : ''}`, ...(ins.tiers || []).map(t => `${t.tier} tier cost: ${money(t.costCents)}`), ...ins.risks.map(r => `Risk: ${r.name} (up to ${money(r.exposureCents)}). ${r.why}`), ...ins.leadTimes.map(l => `Lead time: ${l.note}`), ...ins.valueEngineering.map(v => `Save: ${v}`), ...ins.payments.map(p => `Payment: ${p.name} ${money(p.cents)}`)].map(t => `\u2022 ${t}`).join('\n'), { size: 8 });
      const adv = advisorFor(inputs, plan, totals, ins);
      pdf.heading('Advisor: dates, risks and pricing guardrails', 12);
      pdf.text([...adv.conflicts.map(c => `Check: ${c.text}`), `Readiness ${adv.readiness.score}%.`, `Hidden-condition allowance: ${money(adv.hidden.lowCents)} to ${money(adv.hidden.highCents)}.`, adv.permit.needed ? `Permit: ${adv.permit.reviewDays[0]}-${adv.permit.reviewDays[1]} business days to review.` : adv.permit.note, `Walk-away price ${money(adv.walkAway.floorCents)}; true profit after overhead ${money(adv.trueProfit.profitCents)} (${adv.trueProfit.profitPct}%).`, ...adv.orders.map(o => `Order by ${o.orderBy}: ${o.item}`), ...adv.payments.map(p => `${p.when}: ${p.name} ${money(p.cents)}`), ...adv.season.holidaysInSchedule.map(h => `Holiday in schedule: ${h.name} ${h.date}`)].join('\n'), { size: 8 });
      const cd = codesFor(plan.cfg, inputs.city, { workDays: plan.schedule.days, startDate: inputs.startDate });
      pdf.heading(`Permits and inspections${cd.city ? `: ${cd.city.name}` : ' (Illinois)'}`, 12);
      pdf.text([...cd.permits.map(p => `${p.type} permit: ${p.why}`), cd.noPermitNote, ...cd.inspections.map(i => `Inspection: ${i}`), ...cd.flags, ...(cd.city ? [`${cd.city.dept}${cd.city.verified ? '' : ' (unverified, call to confirm)'}`, ...cd.city.notes] : ['City not in the database: confirm local rules with the building department.']), cd.disclaimer].filter(Boolean).map(t => `\u2022 ${t}`).join('\n'), { size: 8 });
      const toolList = checklist(tagsOf(plan.cfg));
      pdf.heading(`Tools and supplies the crew needs (${toolList.length})`, 12);
      for (const g of [...new Set(toolList.map(t => t.group))]) { pdf.text(g, { size: 10, bold: true }); pdf.text(toolList.filter(t => t.group === g).map(t => `\u2022 ${t.name}${t.qty > 1 ? ` x${t.qty}` : ''}${t.src === 'rent' ? ' (rental)' : ''}`).join('\n'), { size: 8 }); }
      const opts = lines.filter(l => l.optional);
      if (opts.length) { pdf.heading('Optional upgrades (not included in total)', 12); pdf.table(opts.map(l => [l.name, '', money(l.price)]), { widths: [0.6, 0.18, 0.22], size: 9 }); }
      pdf.rule();
      pdf.table([['Subtotal', money(totals.subtotalCents)], ...(totals.contingencyCents ? [['Contingency allowance', money(totals.contingencyCents)]] : []), ...(totals.taxCents ? [['Sales tax', money(totals.taxCents)]] : [])], { widths: [0.75, 0.25] });
      pdf.table([['Estimated total', money(totals.totalCents)]], { widths: [0.75, 0.25], bold: true, size: 12 });
      pdf.table([['Deposit to schedule', money(totals.depositCents)]], { widths: [0.75, 0.25] });
      pdf.text('This is a preliminary estimate from planning inputs. A final written proposal follows an on-site inspection. Hidden conditions behind walls and floors can change the price.', { size: 8, italic: true, gray: 0.3 });
      sendPdf(res, pdf.build(), 'estimator-results.pdf'); return true;
    }
    if (method === 'GET' && pathname === '/api/estimator/handyman/tasks') { json(res, 200, { categories: CATS, tasks: taskRows().map(taskView) }); return true; }
    if (method === 'POST' && pathname === '/api/estimator/handyman/tasks') {
      if (!actor.admin) { fail(res, 403, 'Admin access required.'); return true; }
      const body = await readBody(req, res); if (!body) return true;
      const cur = body.code ? q('SELECT * FROM handyman_tasks WHERE code = ?').get(String(body.code)) : null;
      if (body.code && !cur) { fail(res, 404, 'Task not found.'); return true; }
      if (cur && body.remove === true) { q('UPDATE handyman_tasks SET active = 0 WHERE id = ?').run(cur.id); json(res, 200, { ok: true }); return true; }
      const name = text(body.name ?? cur?.name, 200), category = body.category ?? cur?.category ?? CATS[13], unit = body.unit ?? cur?.unit ?? 'ea', trade = body.trade ?? cur?.trade ?? 'h';
      const hrs = body.hrs === undefined ? cur?.hrs : Number(body.hrs), mat = body.mat === undefined ? cur?.mat_cents : dollars(body.mat, 1000000);
      if (!name || !CATS.includes(category) || !UNITS.includes(unit) || !['h', 'p', 'e'].includes(trade) || !Number.isFinite(hrs) || hrs < 0 || hrs > 1000 || mat === null || mat === undefined) { fail(res, 400, 'Check the task: name, hours per unit and material cost.'); return true; }
      if (cur) q('UPDATE handyman_tasks SET name = ?, category = ?, unit = ?, trade = ?, hrs = ?, mat_cents = ? WHERE id = ?').run(name, category, unit, trade, hrs, mat, cur.id);
      else q('INSERT INTO handyman_tasks (code, category, name, unit, hrs, mat_cents, trade, tags, sort) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').run(`custom-${crypto.randomBytes(4).toString('hex')}`, category, name, unit, hrs, mat, trade, '[]', 1000 + (q('SELECT COUNT(*) AS n FROM handyman_tasks').get().n));
      json(res, 200, { tasks: taskRows().map(taskView) });
      return true;
    }
    if (method === 'GET' && pathname === '/api/estimator/codes') {
      const own = customCities(), names = [...new Set([...own.map(c => c.city), ...CITIES.map(c => c.city)])].sort();
      json(res, 200, { cities: names, custom: own });
      return true;
    }
    if (method === 'POST' && pathname === '/api/estimator/codes') {
      if (!actor.admin) { fail(res, 403, 'Admin access required.'); return true; }
      const body = await readBody(req, res, 20000); if (!body) return true;
      const city = text(body.city, 80), dept = text(body.dept ?? '', 150), url = text(body.url ?? '', 300);
      if (body.remove === true && city) { q('DELETE FROM jurisdictions WHERE city = ?').run(city); json(res, 200, { ok: true }); return true; }
      const notes = (Array.isArray(body.notes) ? body.notes : String(body.notes ?? '').split('\n')).map(n => String(n).trim().slice(0, 500)).filter(Boolean).slice(0, 30);
      if (!city || dept === null || url === null || (url && !/^https?:\/\//.test(url))) { fail(res, 400, 'Enter a city. A web address must start with http.'); return true; }
      q('INSERT INTO jurisdictions (city, dept, url, notes, verified) VALUES (?, ?, ?, ?, ?) ON CONFLICT(city) DO UPDATE SET dept = excluded.dept, url = excluded.url, notes = excluded.notes, verified = excluded.verified').run(city, dept, url, JSON.stringify(notes), body.verified === false ? 0 : 1);
      json(res, 200, { ok: true });
      return true;
    }
    if (method === 'GET' && pathname === '/api/estimator/learning') {
      if (!actor.admin) { fail(res, 403, 'Admin access required.'); return true; }
      const rows = outcomeRows(), learned = calibrate(rows);
      json(res, 200, {
        jobs: learned.n, hoursFactor: Math.round(learned.hoursFactor * 1000) / 1000, hoursJobs: learned.hoursJobs, overall: Math.round(learned.overall * 1000) / 1000, sections: Object.fromEntries(Object.entries(learned.sections).map(([k, v]) => [k, Math.round(v * 1000) / 1000])), accuracy: accuracy(rows),
        aiPhotos: Boolean(env.AI_API_KEY), crew: tracking ? tracking.crewStats(rows) : [], field: fieldStats(),
        recent: rows.slice(0, 15).map(r => ({ estimateId: r.estimate_id, baseCostCents: r.base_cost_cents, predictedCostCents: r.predicted_cost_cents, actualCostCents: r.actual_cost_cents, actualHours: r.actual_hours, notes: r.notes, createdAt: r.created_at, crew: parseJson(r.features, {}).crew || null }))
      });
      return true;
    }
    if (method === 'POST' && pathname === '/api/estimator/vision') {
      if (limited(req, 'estimator-vision', 20)) { fail(res, 429, 'Too many photo analyses. Please try again later.'); return true; }
      const body = await readBody(req, res, 9000000); if (!body) return true;
      if (body.consent !== true) { fail(res, 400, 'Confirm the customer agreed to AI photo analysis first.'); return true; }
      const out = await analyzePhotos({ images: body.images, notes: body.notes, env, fetchImpl });
      if (out.error) { fail(res, out.status, out.error); return true; }
      json(res, 200, out.result);
      return true;
    }
    if (method === 'GET' && pathname === '/api/estimator/bootstrap') {
      json(res, 200, { catalog: catalogRows().map(catalogView), settings: settings(), kinds: KIND_LABELS, tiers: TIERS, units: UNITS, templates: actor.admin ? Object.keys(documentTemplates({ company: COMPANY, customer: null, estimate: { number: '' }, totals: { totalCents: 0, depositCents: 0 }, today: '' })) : [], admin: actor.admin });
      return true;
    }
    if (method === 'GET' && pathname === '/api/estimator/customers') {
      const term = new URL(req.url, 'http://localhost').searchParams.get('q') || '';
      json(res, 200, { customers: q("SELECT id, name, email, phone, address FROM customers WHERE name LIKE ? ESCAPE '\\' OR email LIKE ? ESCAPE '\\' OR phone LIKE ? ESCAPE '\\' ORDER BY name LIMIT 25").all(like(term), like(term), like(term)) });
      return true;
    }
    if (method === 'GET' && pathname === '/api/estimator/estimates') {
      const params = new URL(req.url, 'http://localhost').searchParams, term = params.get('q') || '', status = params.get('status') || '';
      const rows = q(`SELECT e.* FROM estimates e LEFT JOIN customers c ON c.id = e.customer_id WHERE (? = 1 OR e.created_by = ?) AND (? = '' OR e.status = ?) AND (e.title LIKE ? ESCAPE '\\' OR e.number LIKE ? ESCAPE '\\' OR c.name LIKE ? ESCAPE '\\') ORDER BY e.id DESC LIMIT 200`)
        .all(actor.admin ? 1 : 0, actor.user.id, status, status, like(term), like(term), like(term));
      json(res, 200, { estimates: rows.map(listRow), statuses: STATUSES });
      return true;
    }

    // Price book (admin edits, everyone reads through bootstrap)
    if (pathname === '/api/estimator/settings' && method === 'POST') {
      if (!actor.admin) { fail(res, 403, 'Admin access required.'); return true; }
      const body = await readBody(req, res); if (!body) return true;
      const put = q('INSERT INTO estimate_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value');
      for (const key of ['work_start', 'work_end']) if (body[key] !== undefined) { if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(String(body[key]))) { fail(res, 400, 'Use a 24-hour time like 08:00.'); return true; } put.run(key, String(body[key])); }
      for (const key of ['lunch_min', 'break_min']) if (body[key] !== undefined) { const m = Number(body[key]); if (!Number.isInteger(m) || m < 0 || m > 180) { fail(res, 400, 'Lunch and breaks must be 0 to 180 minutes.'); return true; } put.run(key, String(m)); }
      for (const [key, lo, hi] of [['region_factor_pct', 50, 200], ['weekend_premium_pct', 0, 100], ['handyman_rate', 20, 400], ['licensed_rate', 40, 500], ['handyman_min_hours', 0, 8]]) if (body[key] !== undefined) { const m = Number(body[key]); if (!Number.isFinite(m) || m < lo || m > hi) { fail(res, 400, `${key.replace(/_/g, ' ')} must be ${lo} to ${hi}.`); return true; } put.run(key, String(m)); }
      if (body.work_saturday !== undefined) put.run('work_saturday', body.work_saturday === true || body.work_saturday === '1' ? '1' : '0');
      for (const key of ['markup_pct', 'tax_pct', 'contingency_pct', 'deposit_pct']) if (body[key] !== undefined) { if (pct(body[key], 100) === null) { fail(res, 400, 'Percentages must be between 0 and 100.'); return true; } put.run(key, String(Number(body[key]))); }
      for (const [key, lo, hi] of [['overhead_pct', 0, 60], ['target_margin_pct', 0, 80], ['min_margin_pct', 0, 80], ['finance_apr', 0, 40], ['water_cost_per_1000gal', 0, 100], ['kwh_cost', 0, 2]]) if (body[key] !== undefined) { const m = Number(body[key]); if (!Number.isFinite(m) || m < lo || m > hi) { fail(res, 400, `${key} must be ${lo} to ${hi}.`); return true; } put.run(key, String(m)); }
      if (body.valid_days !== undefined) { const d = Number(body.valid_days); if (!Number.isInteger(d) || d < 1 || d > 365) { fail(res, 400, 'Validity must be 1 to 365 days.'); return true; } put.run('valid_days', String(d)); }
      for (const key of ['terms', 'exclusions']) if (body[key] !== undefined) { const v = text(body[key], 5000); if (v === null) { fail(res, 400, 'That text is too long.'); return true; } put.run(key, v); }
      json(res, 200, { settings: settings() });
      return true;
    }
    if (pathname === '/api/estimator/catalog' || /^\/api\/estimator\/catalog\/\d+(\/delete)?$/.test(pathname)) {
      if (!actor.admin) { fail(res, 403, 'Admin access required.'); return true; }
      if (method !== 'POST') return false;
      const body = await readBody(req, res); if (!body) return true;
      m = pathname.match(/^\/api\/estimator\/catalog\/(\d+)(\/delete)?$/);
      const current = m ? q('SELECT * FROM estimate_catalog WHERE id = ? AND active = 1').get(Number(m[1])) : null;
      if (m && !current) { fail(res, 404, 'Not found.'); return true; }
      if (m?.[2]) { q('UPDATE estimate_catalog SET active = 0, updated_at = ? WHERE id = ?').run(nowIso(), current.id); json(res, 200, { ok: true }); return true; }
      const category = text(body.category ?? current?.category, 60), name = text(body.name ?? current?.name, 200), kind = body.kind ?? current?.kind ?? 'material', unit = body.unit ?? current?.unit ?? 'ea', tier = body.tier ?? current?.tier ?? '';
      const cost = body.cost === undefined ? current?.cost_cents : dollars(body.cost, 100000), waste = body.wastePct === undefined ? current?.waste_bp ?? 0 : pct(body.wastePct, 50), code = text(body.code ?? current?.code ?? '', 40);
      if (!category || !name || !KINDS.includes(kind) || !UNITS.includes(unit) || ![...TIERS, ''].includes(tier) || cost === null || cost === undefined || waste === null || code === null) { fail(res, 400, 'Check the price book entry.'); return true; }
      if (current) q('UPDATE estimate_catalog SET category = ?, name = ?, kind = ?, unit = ?, cost_cents = ?, waste_bp = ?, tier = ?, code = ?, updated_at = ? WHERE id = ?').run(category, name, kind, unit, cost, waste, tier, code, nowIso(), current.id);
      else q('INSERT INTO estimate_catalog (category, name, kind, unit, cost_cents, waste_bp, tier, code, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').run(category, name, kind, unit, cost, waste, tier, code, nowIso());
      json(res, 200, { catalog: catalogRows().map(catalogView) });
      return true;
    }

    // Create
    if (method === 'POST' && pathname === '/api/estimator/estimates') {
      const body = await readBody(req, res); if (!body) return true;
      const title = text(body.title, 150);
      if (!title) { fail(res, 400, 'Give the estimate a title.'); return true; }
      let customerId = null;
      if (body.newCustomer) {
        const c = body.newCustomer, name = text(c.name, 120), email = text(c.email ?? '', 200)?.toLowerCase(), phone = text(c.phone ?? '', 40), address = text(c.address ?? '', 300);
        if (!name || email === null || (email && !EMAIL_RE.test(email)) || phone === null || address === null) { fail(res, 400, 'Enter the customer name and a valid email.'); return true; }
        const now = nowIso();
        customerId = Number(q('INSERT INTO customers (name, email, phone, address, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)').run(name, email, phone, address, 'lead', now, now).lastInsertRowid);
      } else if (body.customerId) {
        customerId = Number(body.customerId);
        if (!customerOf(customerId)) { fail(res, 400, 'Customer not found.'); return true; }
      }
      const id = createEstimate({ customerId, title, actorUserId: actor.user.id });
      if (body.wizard && typeof body.wizard === 'object') {
        const plan = planFor(body.wizard);
        insertItems(id, plan.items);
        savePrediction(id, body.wizard, plan, { vision: body.vision === true });
        q('UPDATE estimates SET contingency_bp = MAX(contingency_bp, ?) WHERE id = ?').run(bp(plan.contingencyPct), id);
      }
      json(res, 201, { id });
      return true;
    }

    if (await permitRoute(req, res, pathname, method, actor)) return true;
    m = pathname.match(/^\/api\/estimator\/estimates\/(\d+)(?:\/(items|generate|duplicate|send|reopen|void|payments|documents|job|change-order|delete|pdf|outcome|tools)(?:\/(\d+)(?:\/(delete|void|pdf))?)?)?$/);
    if (!m) return false;
    const e = q('SELECT * FROM estimates WHERE id = ?').get(Number(m[1]));
    if (!e || !canView(e, actor)) { fail(res, 404, 'Estimate not found.'); return true; }
    const action = m[2], sub = m[3] ? Number(m[3]) : null, subAction = m[4];
    if (!action && method === 'GET') { json(res, 200, staffView(e, actor)); return true; }
    if (method === 'GET' && action === 'tools') { json(res, 200, { tools: toolsFor(e), labels: SOURCE_LABELS, jobId: e.job_id || null }); return true; }
    if (method === 'GET' && action === 'pdf' && !sub) { sendPdf(res, estimatePdf(e), `${slug(e.number)}.pdf`); return true; }
    if (method === 'GET' && action === 'documents' && sub && subAction === 'pdf') {
      if (!actor.admin) { fail(res, 403, 'Admin access required.'); return true; }
      const doc = q('SELECT * FROM estimate_documents WHERE id = ? AND estimate_id = ?').get(sub, e.id);
      if (!doc) { fail(res, 404, 'Document not found.'); return true; }
      sendPdf(res, documentPdf(e, doc), `${slug(doc.title)}.pdf`); return true;
    }
    if (method !== 'POST') return false;
    const body = await readBody(req, res); if (!body) return true;
    const adminOnly = () => { if (!actor.admin) { fail(res, 403, 'Admin access required.'); return true; } return false; };
    const locked = () => { if (!canEdit(e, actor)) { fail(res, 409, e.status === 'accepted' ? 'This estimate is signed. Create a change order instead.' : 'This estimate can no longer be edited.'); return true; } return false; };

    if (!action) {
      if (locked()) return true;
      const title = text(body.title ?? e.title, 150), scope = text(body.scope ?? e.scope, 5000), exclusions = text(body.exclusions ?? e.exclusions, 5000), terms = text(body.terms ?? e.terms, 5000), notes = text(body.internalNotes ?? e.internal_notes, 5000);
      let customerId = e.customer_id;
      if (body.customerId !== undefined) { customerId = body.customerId ? Number(body.customerId) : null; if (customerId && !customerOf(customerId)) { fail(res, 400, 'Customer not found.'); return true; } }
      if (!title || [scope, exclusions, terms, notes].includes(null)) { fail(res, 400, 'Check the estimate fields.'); return true; }
      let { display, markup_bp: markup, tax_bp: tax, contingency_bp: contingency, deposit_bp: deposit, discount_cents: discount, valid_until: validUntil } = e;
      if (body.display !== undefined) { if (!['itemized', 'sections'].includes(body.display)) { fail(res, 400, 'Unknown display mode.'); return true; } display = body.display; }
      if (body.validUntil !== undefined) { if (body.validUntil && !validDate(body.validUntil)) { fail(res, 400, 'Enter a valid date.'); return true; } validUntil = body.validUntil || ''; }
      const pricing = ['markupPct', 'taxPct', 'contingencyPct', 'depositPct', 'discount'].some(k => body[k] !== undefined);
      if (pricing) {
        if (adminOnly()) return true;
        markup = body.markupPct === undefined ? markup : pct(body.markupPct, 300); tax = body.taxPct === undefined ? tax : pct(body.taxPct, 30); contingency = body.contingencyPct === undefined ? contingency : pct(body.contingencyPct, 50);
        deposit = body.depositPct === undefined ? deposit : pct(body.depositPct, 100); discount = body.discount === undefined ? discount : dollars(body.discount, 1000000);
        if ([markup, tax, contingency, deposit, discount].includes(null)) { fail(res, 400, 'Check the percentages and discount.'); return true; }
      }
      q('UPDATE estimates SET title = ?, scope = ?, exclusions = ?, terms = ?, internal_notes = ?, customer_id = ?, display = ?, markup_bp = ?, tax_bp = ?, contingency_bp = ?, deposit_bp = ?, discount_cents = ?, valid_until = ? WHERE id = ?')
        .run(title, scope, exclusions, terms, notes, customerId, display, markup, tax, contingency, deposit, discount, validUntil, e.id);
      touch(e, actor);
      json(res, 200, staffView(q('SELECT * FROM estimates WHERE id = ?').get(e.id), actor));
      return true;
    }

    if (action === 'items') {
      if (locked()) return true;
      if (sub && subAction === 'delete') { q('DELETE FROM estimate_items WHERE id = ? AND estimate_id = ?').run(sub, e.id); }
      else if (sub) {
        const current = q('SELECT * FROM estimate_items WHERE id = ? AND estimate_id = ?').get(sub, e.id);
        if (!current) { fail(res, 404, 'Item not found.'); return true; }
        const { item, error } = itemFields(body, current);
        if (error) { fail(res, 400, error); return true; }
        q('UPDATE estimate_items SET section = ?, kind = ?, name = ?, qty = ?, unit = ?, cost_cents = ?, waste_bp = ?, optional = ?, accepted = ? WHERE id = ?').run(item.section, item.kind, item.name, item.qty, item.unit, item.cost_cents, item.waste_bp, item.optional, item.optional ? 0 : 1, sub);
      } else {
        if (q('SELECT COUNT(*) AS n FROM estimate_items WHERE estimate_id = ?').get(e.id).n >= 300) { fail(res, 400, 'This estimate has too many line items.'); return true; }
        let source = {};
        if (body.catalogId) {
          const c = q('SELECT * FROM estimate_catalog WHERE id = ? AND active = 1').get(Number(body.catalogId));
          if (!c) { fail(res, 404, 'Price book item not found.'); return true; }
          source = { name: c.name, kind: c.kind, unit: c.unit, cost: c.cost_cents / 100, wastePct: c.waste_bp / 100, section: c.category };
        }
        const { item, error } = itemFields({ ...source, ...body }, null);
        if (error) { fail(res, 400, error); return true; }
        insertItems(e.id, [item]);
      }
      touch(e, actor);
      json(res, 200, staffView(q('SELECT * FROM estimates WHERE id = ?').get(e.id), actor));
      return true;
    }
    if (action === 'outcome') {
      if (adminOnly()) return true;
      // GPS-tracked crew time for the linked job: who worked it, how long and on which days. Used when hours are left blank.
      const crew = tracking ? tracking.crewForJob(e.job_id) : null;
      const actual = dollars(body.actualCost, 10000000), hours = Number(body.actualHours || crew?.trackedHours || 0);
      if (!actual || !Number.isFinite(hours) || hours < 0 || hours > 100000) { fail(res, 400, 'Enter what the job really cost you.'); return true; }
      const actualBySection = {};
      for (const row of Array.isArray(body.sections) ? body.sections.slice(0, 30) : []) {
        const cents = row && row.cost !== '' && row.cost !== null ? dollars(row.cost, 10000000) : null;
        if (cents && typeof row.section === 'string') actualBySection[row.section.slice(0, 80)] = cents;
      }
      const saved = parseJson(e.prediction, null), now = costs(itemsOf(e.id));
      const base = saved?.base || now;
      q('INSERT INTO estimate_outcomes (estimate_id, base_cost_cents, predicted_cost_cents, actual_cost_cents, actual_hours, base_by_section, actual_by_section, features, notes, recorded_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(estimate_id) DO UPDATE SET predicted_cost_cents = excluded.predicted_cost_cents, base_cost_cents = excluded.base_cost_cents, actual_cost_cents = excluded.actual_cost_cents, actual_hours = excluded.actual_hours, base_by_section = excluded.base_by_section, actual_by_section = excluded.actual_by_section, features = excluded.features, notes = excluded.notes, recorded_by = excluded.recorded_by')
        .run(e.id, base.total, saved?.adjustedCostCents || now.total, actual, hours, JSON.stringify(base.bySection), JSON.stringify(actualBySection), JSON.stringify({ ...(saved?.features || {}), hoursBase: saved?.hoursBase || saved?.hours || 0, jobType: saved?.jobType || 'bathroom', ...(crew && { crew: { trackedHours: crew.trackedHours, crewSize: crew.crewSize, workDays: crew.workDays, firstDay: crew.firstDay, lastDay: crew.lastDay, avgCrewPerDay: crew.avgCrewPerDay, employees: crew.employees.map(c => ({ employeeId: c.employeeId, name: c.name, role: c.role, hours: c.hours, shifts: c.shifts, days: c.days })) } }) }), String(body.notes || '').slice(0, 1000), actor.user.name || '', nowIso());
      json(res, 200, { ok: true, learnedJobs: calibrate(outcomeRows()).n });
      return true;
    }
    if (action === 'generate') {
      if (locked()) return true;
      if (body.replace === true) q('DELETE FROM estimate_items WHERE estimate_id = ?').run(e.id);
      const plan = planFor(body.inputs);
      insertItems(e.id, plan.items);
      if (body.replace === true) { savePrediction(e.id, body.inputs && typeof body.inputs === 'object' ? body.inputs : {}, plan); q('UPDATE estimates SET contingency_bp = MAX(contingency_bp, ?) WHERE id = ?').run(bp(plan.contingencyPct), e.id); }
      touch(e, actor);
      json(res, 200, { ...staffView(q('SELECT * FROM estimates WHERE id = ?').get(e.id), actor), notes: plan.notes });
      return true;
    }
    if (action === 'duplicate') {
      const id = createEstimate({ customerId: e.customer_id, title: `${e.title} (copy)`.slice(0, 150), actorUserId: actor.user.id });
      q('UPDATE estimates SET scope = ?, exclusions = ?, terms = ?, display = ?, markup_bp = ?, tax_bp = ?, contingency_bp = ?, deposit_bp = ?, discount_cents = ? WHERE id = ?').run(e.scope, e.exclusions, e.terms, e.display, e.markup_bp, e.tax_bp, e.contingency_bp, e.deposit_bp, e.discount_cents, id);
      insertItems(id, itemsOf(e.id));
      json(res, 201, { id });
      return true;
    }
    if (adminOnly()) return true;

    if (action === 'send') {
      const customer = customerOf(e.customer_id), { totals } = calc(e);
      if (!customer || !EMAIL_RE.test(customer.email)) { fail(res, 400, 'Attach a customer with an email address before sending.'); return true; }
      if (!['draft', 'sent'].includes(e.status) || totals.totalCents <= 0) { fail(res, 400, 'Add priced line items before sending.'); return true; }
      q("UPDATE estimates SET status = 'sent', sent_at = ?, sent_by = ?, updated_at = ? WHERE id = ?").run(nowIso(), actor.user.name, nowIso(), e.id);
      const url = `${siteUrl}/account/estimate/?id=${e.id}`;
      await mail({ to: customer.email, ...templates.customerMessage({ name: customer.name, subject: `Your estimate from ${COMPANY}: ${e.title}`, body: `Your estimate ${e.number} (${money(totals.totalCents)}) is ready to review.\n\nSign in to your account to see the details, choose any optional items, sign it and pay your deposit online:\n${url}\n\nIf you do not have an account yet, create one with this email address (${customer.email}) and it will appear automatically.` }) });
      q("INSERT INTO customer_entries (customer_id, kind, subject, body, author, created_at) VALUES (?, 'email', ?, ?, ?, ?)").run(customer.id, `Estimate ${e.number} sent`, `${e.title}: ${money(totals.totalCents)}`, actor.user.name, nowIso());
      json(res, 200, { ok: true });
      return true;
    }
    if (action === 'reopen' || action === 'void') {
      if (e.status === 'accepted') { fail(res, 409, 'A signed estimate cannot be changed. Create a change order.'); return true; }
      q('UPDATE estimates SET status = ?, updated_at = ? WHERE id = ?').run(action === 'void' ? 'void' : 'draft', nowIso(), e.id);
      json(res, 200, { ok: true });
      return true;
    }
    if (action === 'delete') {
      if (e.status === 'accepted' || paidOf(e.id) > 0) { fail(res, 409, 'Signed or paid estimates cannot be deleted. Void a draft instead.'); return true; }
      q('DELETE FROM estimates WHERE id = ?').run(e.id);
      json(res, 200, { ok: true });
      return true;
    }
    if (action === 'change-order') {
      if (e.status !== 'accepted') { fail(res, 400, 'Change orders are created from a signed estimate.'); return true; }
      const id = createEstimate({ customerId: e.customer_id, title: `Change order: ${e.title}`.slice(0, 150), actorUserId: actor.user.id, kind: 'change_order', parent: e });
      q('UPDATE estimates SET markup_bp = ?, tax_bp = ?, contingency_bp = 0, deposit_bp = ?, display = ? WHERE id = ?').run(e.markup_bp, e.tax_bp, e.deposit_bp, e.display, id);
      json(res, 201, { id });
      return true;
    }
    if (action === 'tools') {
      if (!e.job_id) { fail(res, 400, 'Create the job first, then send its tool list to the crew.'); return true; }
      saveJobTools(e.job_id, toolsFor(e)); saveJobBrief(e.job_id, e);
      json(res, 200, { tools: toolsFor(e), jobId: e.job_id });
      return true;
    }
    if (action === 'job') {
      if (e.job_id) { fail(res, 409, 'A job already exists for this estimate.'); return true; }
      if (e.status !== 'accepted') { fail(res, 400, 'Create the job after the customer signs.'); return true; }
      const customer = customerOf(e.customer_id), now = nowIso();
      const id = Number(q("INSERT INTO jobs (customer_id, title, description, area, address, status, scheduled_at, created_at, updated_at) VALUES (?, ?, ?, '', ?, 'open', '', ?, ?)").run(e.customer_id, e.title, e.scope, customer?.address || '', now, now).lastInsertRowid);
      q('UPDATE estimates SET job_id = ? WHERE id = ?').run(id, e.id);
      saveJobTools(id, toolsFor(e)); saveJobBrief(id, e);
      json(res, 201, { jobId: id });
      return true;
    }
    if (action === 'payments') {
      if (sub && subAction === 'delete') { q('DELETE FROM estimate_payments WHERE id = ? AND estimate_id = ?').run(sub, e.id); json(res, 200, { ok: true }); return true; }
      const amount = dollars(body.amount), paidOn = body.paidOn || today(), how = text(body.method ?? '', 60), memo = text(body.memo ?? '', 300);
      if (!amount || !validDate(paidOn) || how === null || memo === null) { fail(res, 400, 'Enter an amount above zero and a valid date.'); return true; }
      q('INSERT INTO estimate_payments (estimate_id, amount_cents, method, memo, paid_on, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(e.id, amount, how, memo, paidOn, nowIso());
      const customer = customerOf(e.customer_id);
      if (customer?.email && body.receipt !== false) await mail({ to: customer.email, ...templates.customerMessage({ name: customer.name, subject: `Payment received: ${e.number}`, body: `We received your payment of ${money(amount)} for ${e.title}. Thank you!` }) });
      json(res, 201, { ok: true });
      return true;
    }
    if (action === 'documents') {
      if (sub && subAction === 'void') { q("UPDATE estimate_documents SET status = 'void' WHERE id = ? AND estimate_id = ? AND status = 'pending'").run(sub, e.id); json(res, 200, { ok: true }); return true; }
      if (q('SELECT COUNT(*) AS n FROM estimate_documents WHERE estimate_id = ?').get(e.id).n >= 20) { fail(res, 400, 'Too many documents on this estimate.'); return true; }
      let title = text(body.title ?? '', 150), content = text(body.body ?? '', 20000);
      if (body.template) {
        const t = documentTemplates({ company: COMPANY, customer: customerOf(e.customer_id), estimate: e, totals: calc(e).totals, today: today() })[body.template];
        if (!t) { fail(res, 400, 'Unknown template.'); return true; }
        [title, content] = [title || t[0], content || t[1]];
      }
      if (!title || !content) { fail(res, 400, 'Add a title and the document text.'); return true; }
      q('INSERT INTO estimate_documents (estimate_id, title, body, body_hash, issued_by, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(e.id, title, content, sha256(content), actor.user.name, nowIso());
      json(res, 201, { ok: true });
      return true;
    }
    return false;
  }

  // ---------- Customer portal
  function customerFor(user) {
    return user.verified ? q('SELECT * FROM customers WHERE user_id = ? OR email = ? ORDER BY user_id IS NULL LIMIT 1').get(user.id, user.email) : null;
  }
  function recordPayment({ estimateId, amountCents, method, memo, ref }) {
    const result = q('INSERT OR IGNORE INTO estimate_payments (estimate_id, amount_cents, method, memo, paid_on, provider_ref, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)').run(estimateId, amountCents, method, memo, today(), ref, nowIso());
    return result.changes > 0;
  }

  async function portal(req, res, pathname, method) {
    const user = currentUser(req);
    if (!user) { fail(res, 401, 'Please sign in.'); return true; }
    const customer = customerFor(user);
    if (method === 'GET' && pathname === '/api/account/estimates') {
      const rows = customer ? q("SELECT * FROM estimates WHERE customer_id = ? AND status IN ('sent', 'accepted', 'declined') ORDER BY id DESC").all(customer.id) : [];
      json(res, 200, { estimates: rows.map(e => { const { totals } = calc(e); return { ...header(e, customer), totalCents: totals.totalCents, paidCents: totals.paidCents, balanceCents: totals.balanceCents }; }) });
      return true;
    }
    const m = pathname.match(/^\/api\/account\/estimates\/(\d+)(?:\/(sign|decline|pay|pdf)|\/documents\/(\d+)\/(sign|pdf))?$/);
    if (!m) return false;
    const e = customer ? q("SELECT * FROM estimates WHERE id = ? AND customer_id = ? AND status IN ('sent', 'accepted', 'declined')").get(Number(m[1]), customer.id) : null;
    if (!e) { fail(res, 404, 'Estimate not found.'); return true; }
    if (method === 'GET' && !m[2] && !m[3]) { json(res, 200, { estimate: customerView(e) }); return true; }
    if (method === 'GET' && (m[2] === 'pdf' || m[4] === 'pdf')) {
      if (m[3]) {
        const doc = q("SELECT * FROM estimate_documents WHERE id = ? AND estimate_id = ? AND status != 'void'").get(Number(m[3]), e.id);
        if (!doc) { fail(res, 404, 'Document not found.'); return true; }
        sendPdf(res, documentPdf(e, doc), `${slug(doc.title)}.pdf`);
      } else sendPdf(res, estimatePdf(e), `${slug(e.number)}.pdf`);
      return true;
    }
    if (method !== 'POST') return false;
    if (limited(req, 'estimate-action', 60)) { fail(res, 429, 'Too many attempts. Please try again later.'); return true; }
    const body = await readBody(req, res, 10000); if (!body) return true;
    const nameOk = v => typeof v === 'string' && normalizeName(v) === normalizeName(user.name) && normalizeName(v).length > 1;

    if (m[3] && m[4] === 'sign') {
      const doc = q("SELECT * FROM estimate_documents WHERE id = ? AND estimate_id = ? AND status = 'pending'").get(Number(m[3]), e.id);
      if (!doc) { fail(res, 404, 'Document not found or already signed.'); return true; }
      if (!nameOk(body.name) || body.agree !== true) { fail(res, 400, 'Type your full name exactly as it appears on your account and tick the agreement box.'); return true; }
      const ev = evidence(req);
      q("UPDATE estimate_documents SET status = 'signed', signed_name = ?, signed_at = ?, signed_ip = ?, signed_ua = ?, signed_consent = ? WHERE id = ?").run(body.name.trim().slice(0, 120), nowIso(), ev.ip, ev.ua, CONSENT, doc.id);
      await alertOffice(`Document signed: ${doc.title}`, `${user.name} signed "${doc.title}" for ${e.number}.`);
      await mailSignedCopy(customer, `Signed: ${doc.title}`, `Attached is your signed copy of "${doc.title}" for ${e.number}. Keep it for your records.`, documentPdf(e, q('SELECT * FROM estimate_documents WHERE id = ?').get(doc.id)), `${slug(doc.title)}.pdf`);
      json(res, 200, { estimate: customerView(e) });
      return true;
    }
    if (m[2] === 'sign') {
      if (e.status !== 'sent') { fail(res, 409, 'This estimate is not open for signing.'); return true; }
      if (e.valid_until && e.valid_until < today()) { fail(res, 410, 'This estimate has expired. Please contact us for an updated one.'); return true; }
      if (!nameOk(body.name) || body.agree !== true) { fail(res, 400, 'Type your full name exactly as it appears on your account and tick the agreement box.'); return true; }
      const picked = new Set(Array.isArray(body.optionalIds) ? body.optionalIds.map(Number) : []);
      for (const item of itemsOf(e.id).filter(i => i.optional)) q('UPDATE estimate_items SET accepted = ? WHERE id = ?').run(picked.has(item.id) ? 1 : 0, item.id);
      const { lines, totals } = calc(e);
      const ev = evidence(req);
      q("UPDATE estimates SET status = 'accepted', signed_name = ?, signed_at = ?, signed_total_cents = ?, signed_hash = ?, signed_ip = ?, signed_ua = ?, signed_consent = ?, updated_at = ? WHERE id = ?").run(body.name.trim().slice(0, 120), nowIso(), totals.totalCents, sha256(snapshotOf(e, lines, totals)), ev.ip, ev.ua, CONSENT, nowIso(), e.id);
      q("INSERT INTO customer_entries (customer_id, kind, subject, body, author, created_at) VALUES (?, 'note', ?, ?, 'System', ?)").run(customer.id, `Estimate ${e.number} signed`, `${user.name} accepted ${e.title} for ${money(totals.totalCents)}.`, nowIso());
      await alertOffice(`Estimate signed: ${e.number}`, `${user.name} signed estimate ${e.number} (${e.title}) for ${money(totals.totalCents)}.\nOpen it in the estimator to collect the deposit, add documents and create the job.`);
      const fresh = q('SELECT * FROM estimates WHERE id = ?').get(e.id);
      await mailSignedCopy(customer, `Signed estimate ${e.number}`, `Thank you! Attached is your signed copy of estimate ${e.number} (${money(totals.totalCents)}).`, estimatePdf(fresh), `${slug(e.number)}.pdf`);
      json(res, 200, { estimate: customerView(fresh) });
      return true;
    }
    if (m[2] === 'decline') {
      if (e.status !== 'sent') { fail(res, 409, 'This estimate is not open.'); return true; }
      const reason = text(body.reason ?? '', 1000);
      if (reason === null) { fail(res, 400, 'That reason is too long.'); return true; }
      q("UPDATE estimates SET status = 'declined', declined_reason = ?, updated_at = ? WHERE id = ?").run(reason, nowIso(), e.id);
      await alertOffice(`Estimate declined: ${e.number}`, `${user.name} declined ${e.number}.${reason ? `\n\nReason: ${reason}` : ''}`);
      json(res, 200, { estimate: customerView(q('SELECT * FROM estimates WHERE id = ?').get(e.id)) });
      return true;
    }
    if (m[2] === 'pay') {
      if (e.status !== 'accepted') { fail(res, 409, 'Please sign the estimate before paying.'); return true; }
      if (!paymentsAvailable()) { fail(res, 503, 'Online payment is not set up yet. Please contact us to pay by check or card.'); return true; }
      const { totals } = calc(e), amount = body.kind === 'deposit' ? totals.depositDueCents : totals.balanceCents;
      if (amount < 50) { fail(res, 400, body.kind === 'deposit' ? 'The deposit is already paid.' : 'Nothing is due.'); return true; }
      const form = new URLSearchParams({
        mode: 'payment', success_url: `${siteUrl}/account/estimate/?id=${e.id}&paid=1`, cancel_url: `${siteUrl}/account/estimate/?id=${e.id}`, customer_email: user.email, client_reference_id: String(e.id),
        'line_items[0][quantity]': '1', 'line_items[0][price_data][currency]': 'usd', 'line_items[0][price_data][unit_amount]': String(amount), 'line_items[0][price_data][product_data][name]': `${COMPANY}: ${e.title} (${body.kind === 'deposit' ? 'deposit' : 'payment'})`.slice(0, 200),
        'metadata[estimate_id]': String(e.id), 'metadata[kind]': body.kind === 'deposit' ? 'deposit' : 'balance'
      });
      try {
        const response = await fetchImpl('https://api.stripe.com/v1/checkout/sessions', { method: 'POST', headers: { Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`, 'Content-Type': 'application/x-www-form-urlencoded' }, body: form });
        const session = await response.json();
        if (!response.ok || !session.url) throw new Error(session.error?.message || 'Stripe error');
        json(res, 200, { url: session.url });
      } catch (error) { console.error('Stripe checkout failed:', error.message); fail(res, 502, 'We could not start the payment. Please try again or contact us.'); }
      return true;
    }
    return false;
  }

  // ---------- Stripe webhook (records online payments; the signature proves the call came from Stripe)
  function verifyStripe(raw, header, secret) {
    if (!secret || !header) return false;
    const parts = Object.fromEntries(header.split(',').map(p => p.split('=')).filter(p => p.length === 2));
    const timestamp = Number(parts.t);
    if (!Number.isFinite(timestamp) || Math.abs(Date.now() / 1000 - timestamp) > 300) return false;
    const expected = crypto.createHmac('sha256', secret).update(`${parts.t}.${raw}`).digest('hex');
    const given = String(parts.v1 || '');
    return given.length === expected.length && crypto.timingSafeEqual(Buffer.from(given), Buffer.from(expected));
  }
  async function stripeWebhook(req, res) {
    const raw = await readBuffer(req, 1000000);
    if (raw === null || !verifyStripe(raw.toString('utf8'), req.headers['stripe-signature'], env.STRIPE_WEBHOOK_SECRET)) { fail(res, 400, 'Invalid signature.'); return true; }
    let event;
    try { event = JSON.parse(raw.toString('utf8')); } catch { fail(res, 400, 'Invalid payload.'); return true; }
    const s = event?.data?.object;
    if (['checkout.session.completed', 'checkout.session.async_payment_succeeded'].includes(event?.type) && s?.payment_status === 'paid') {
      const e = q('SELECT * FROM estimates WHERE id = ?').get(Number(s.metadata?.estimate_id));
      if (e && Number.isInteger(s.amount_total) && s.amount_total > 0 && recordPayment({ estimateId: e.id, amountCents: s.amount_total, method: 'Card (online)', memo: s.metadata?.kind || '', ref: s.id })) {
        const customer = customerOf(e.customer_id);
        if (customer?.email) await mail({ to: customer.email, ...templates.customerMessage({ name: customer.name, subject: `Payment received: ${e.number}`, body: `We received your online payment of ${money(s.amount_total)} for ${e.title}. Thank you!` }) });
        await alertOffice(`Online payment: ${e.number}`, `${customer?.name || 'A customer'} paid ${money(s.amount_total)} online for ${e.number}.`);
      }
    }
    json(res, 200, { received: true });
    return true;
  }

  async function handle(req, res, pathname, method) {
    if (pathname === '/api/webhooks/stripe' && method === 'POST') return stripeWebhook(req, res);
    if (pathname.startsWith('/api/estimator/')) return staff(req, res, pathname, method);
    if (pathname.startsWith('/api/account/estimates')) return portal(req, res, pathname, method);
    return false;
  }

  return { handle, calc };
}

module.exports = { createEstimates };
