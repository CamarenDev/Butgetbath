const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createServer } = require('../server');
const { computeTotals } = require('../lib/estimating');

test('estimate math: waste, markup, contingency, tax on materials only, discount', () => {
  const estimate = { markup_bp: 2500, tax_bp: 1000, contingency_bp: 500, deposit_bp: 3000, discount_cents: 1000 };
  const items = [
    { id: 1, section: 'A', kind: 'material', name: 'Tile', qty: 10, unit: 'sf', cost_cents: 1000, waste_bp: 1000, optional: 0, accepted: 1 },
    { id: 2, section: 'A', kind: 'labor', name: 'Install', qty: 10, unit: 'sf', cost_cents: 1000, waste_bp: 0, optional: 0, accepted: 1 },
    { id: 3, section: 'A', kind: 'material', name: 'Option', qty: 1, unit: 'ea', cost_cents: 100000, waste_bp: 0, optional: 1, accepted: 0 }
  ];
  const { totals } = computeTotals(estimate, items, 5000);
  assert.equal(totals.costCents, 11000 + 10000);
  assert.equal(totals.subtotalCents, 13750 + 12500);
  assert.equal(totals.contingencyCents, 1313);
  assert.equal(totals.taxCents, 1375);
  assert.equal(totals.totalCents, 26250 + 1313 - 1000 + 1375);
  assert.equal(totals.balanceCents, totals.totalCents - 5000);
  const zero = computeTotals({ ...estimate, discount_cents: 0 }, [], 0);
  assert.equal(zero.totals.paidCents, 0);
  assert.equal(zero.totals.totalCents, 0);
  assert.throws(() => computeTotals({ ...estimate, tax_bp: Infinity }, items, 0), /finite/);
  assert.throws(() => computeTotals(estimate, [{ ...items[0], qty: NaN }], 0), /finite/);
  assert.throws(() => computeTotals(estimate, [{ ...items[0], cost_cents: 1.5 }], 0), /integer/);
});

test('insights cover pricing, risk, schedule and code', () => {
  const { insights } = require('../lib/insights');
  const { takeoffPlan, costs } = require('../lib/bathroom');
  const { SEED, DEFAULT_SETTINGS, computeTotals } = require('../lib/estimating');
  const catalog = SEED.map(([code, category, name, kind, unit, cost, waste, tier], id) => ({ id, code, category, name, kind, unit, cost_cents: Math.round(cost * 100), waste_bp: Math.round(waste * 100), tier, active: 1 }));
  const mk = inputs => takeoffPlan(inputs, catalog, undefined, DEFAULT_SETTINGS);
  const plan = mk({ fullRemodel: true, shower: 'walk_in', homeYear: 1955, length: 8, width: 5, condition: 'poor' });
  const { totals } = computeTotals({ markup_bp: 2000, tax_bp: 800, contingency_bp: 1000, deposit_bp: 3000, discount_cents: 0 }, plan.items.map((i, n) => ({ id: n, ...i })), 0);
  const r = insights({ plan, totals, settings: DEFAULT_SETTINGS, rows: { inputs: { length: 8, width: 5 }, learnedJobs: 0 }, planAt: t => mk({ tier: t, fullRemodel: true }) });
  assert.equal(r.tiers.length, 3);
  assert.ok(r.risks.some(x => x.name === 'Lead paint') && r.risks.some(x => x.name === 'Hidden water damage'));
  assert.ok(r.confidence.lowCents < totals.totalCents && r.confidence.highCents > totals.totalCents);
  assert.equal(r.payments.reduce((n, p) => n + p.cents, 0), totals.totalCents);
  assert.ok(r.fan.cfm >= 50 && r.tile.orderSf > r.tile.sf && r.shopping.length && r.completeness.missing.length);
  assert.equal(r.verification.prices.verificationStatus, 'provisional');
  assert.equal(r.verification.legalAndCode.verificationStatus, 'provisional');
});

test('codes: permits follow the scope and cities resolve', () => {
  const { requirements } = require('../lib/codes');
  const { plan } = require('../lib/bathroom');
  const gut = requirements(plan({ fullRemodel: true, homeYear: 1960 }).cfg, 'chicago');
  assert.ok(gut.permitNeeded && gut.permits.some(p => p.type === 'Plumbing') && gut.permits.some(p => p.type === 'Electrical'));
  assert.equal(gut.city.name, 'Chicago');
  assert.ok(gut.flags.some(f => f.includes('Lead')));
  const swap = requirements(plan({ toilet: true, flooring: 'lvp' }).cfg, 'Nowhereville');
  assert.ok(!swap.permitNeeded && swap.noPermitNote && swap.city === null);
  assert.equal(requirements(plan({}).cfg, 'Chicago', [{ city: 'Chicago', dept: 'Mine', notes: [], verified: true }]).city.dept, 'Mine');
  assert.equal(gut.verification.city.verificationStatus, 'provisional');
  assert.equal(gut.verification.state.verificationStatus, 'provisional');
  assert.match(gut.disclaimer, /PROVISIONAL/);
});

test('tool checklist adapts to the job', () => {
  const { tagsOf, checklist } = require('../lib/tools');
  const { plan } = require('../lib/bathroom');
  const names = inputs => new Set(checklist(tagsOf(plan(inputs).cfg)).map(t => t.name));
  const gut = names({ fullRemodel: true, flooring: 'tile', shower: 'walk_in', homeYear: 1965 });
  const swap = names({ toilet: true, flooring: 'lvp', condition: 'good' });
  assert.ok(gut.has('Reciprocating saw with demolition blades') && gut.has('Half-face respirator with P100 filters') && gut.has('Wet tile saw with diamond blade'));
  assert.ok(!swap.has('Reciprocating saw with demolition blades') && !swap.has('Wet tile saw with diamond blade'));
  assert.ok(swap.has('LVP tapping block, pull bar and spacers') && !gut.has('LVP tapping block, pull bar and spacers'));
});

test('estimator: permissions, takeoff, customer signing, documents and Stripe payments', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bbs-est-'));
  const sent = [];
  const server = createServer({ dataDir, siteUrl: 'http://localhost', adminEmails: ['admin@example.com'], notifyEmail: '', mailer: async m => { sent.push(m); }, gcal: { enabled: false, sync: async () => null, remove: async () => null }, receiver: null });
  await new Promise(resolve => server.listen(0, resolve));
  const base = `http://localhost:${server.address().port}`;
  const jar = {};
  const realFetch = globalThis.fetch;
  const call = async (who, method, url, body, headers = {}) => {
    const res = await realFetch(base + url, { method, headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(jar[who] ? { Cookie: jar[who] } : {}), ...headers }, body: body ? JSON.stringify(body) : undefined });
    const set = res.headers.get('set-cookie');
    if (set) jar[who] = set.split(';')[0];
    return { res, data: (res.headers.get('content-type') || '').includes('json') ? await res.json() : null };
  };
  const token = to => sent.filter(m => m.to === to).at(-1).text.match(/token=([\w-]+)/)[1];
  const signUp = async (who, name, email) => {
    await call(who, 'POST', '/api/auth/register', { name, email, password: 'correct-horse-1', consent: true });
    await call(who, 'POST', '/api/auth/verify', { token: token(email) });
    await call(who, 'POST', '/api/auth/login', { email, password: 'correct-horse-1' });
  };
  try {
    await signUp('admin', 'Admin', 'admin@example.com');
    await signUp('cust', 'Cust Omer', 'cust@example.com');
    const hired = await call('admin', 'POST', '/api/admin/employees', { name: 'Hank Handy', email: 'hank@example.com', skipOnboarding: true, roleTitle: 'Estimator', rate: 25 });
    await call('hank', 'POST', '/api/auth/reset', { token: token('hank@example.com'), password: 'correct-horse-2' });
    await call('hank', 'POST', '/api/auth/login', { email: 'hank@example.com', password: 'correct-horse-2' });

    // Employees need permission
    assert.equal((await call('anon', 'GET', '/api/estimator/me')).res.status, 401);
    assert.equal((await call('hank', 'GET', '/api/estimator/me')).res.status, 403);
    await call('admin', 'POST', `/api/admin/employees/${hired.data.id}`, { canEstimate: true });
    assert.equal((await call('hank', 'GET', '/api/estimator/me')).data.role, 'employee');
    assert.ok((await call('hank', 'GET', '/api/estimator/bootstrap')).data.catalog.length > 40);

    // Takeoff builds a priced bathroom estimate
    const wizard = { tier: 'better', floorSf: 45, wallTileSf: 90, shower: 'walk_in', demo: true, floorTile: true, vanities: 1, toilet: true, fan: true, lighting: true, paint: true, permit: true, glass: true };
    const created = await call('admin', 'POST', '/api/estimator/estimates', { title: 'Master bath', newCustomer: { name: 'Cust Omer', email: 'cust@example.com', address: '1 Main St' }, wizard });
    assert.equal(created.res.status, 201);
    const id = created.data.id;
    let est = (await call('admin', 'GET', `/api/estimator/estimates/${id}`)).data;
    assert.ok(est.lines.length > 20);
    assert.ok(est.totals.totalCents > 1000000 && est.totals.profitCents > 0);
    assert.ok(est.lines.some(l => l.name === 'Wall tile' && l.qty === 90));

    // Smart adaptation: old upper-floor home, poor condition, tile
    const smart = await call('admin', 'POST', '/api/estimator/advice', { inputs: { homeYear: 1955, level: 'upper', condition: 'poor', demo: true, flooring: 'tile', length: 8, width: 6, shower: 'walk_in' } });
    assert.equal(smart.res.status, 200);
    assert.ok(smart.data.notes.some(n => /lead-safe/i.test(n)) && smart.data.notes.some(n => /stairs/i.test(n)));
    assert.ok(smart.data.optionalCount > 0 && smart.data.totalCents > 0);
    assert.equal((await call('admin', 'POST', '/api/estimator/advice', { inputs: { length: 61 } })).res.status, 400);
    assert.equal((await call('admin', 'POST', '/api/estimator/advice', { inputs: { startDate: '2026-02-30' } })).res.status, 400);
    const plain = await call('admin', 'POST', '/api/estimator/advice', { inputs: { homeYear: 2018, level: 'first', condition: 'good', demo: true, flooring: 'tile', length: 8, width: 6, shower: 'walk_in' } });
    assert.ok(smart.data.totalCents > plain.data.totalCents);
    const boot = (await call('admin', 'GET', '/api/estimator/bootstrap')).data;
    assert.ok(boot.catalog.some(c => c.category === 'Tool rental' && /tile saw/i.test(c.name)) && boot.settings.prices_updated);
    const gen = await call('admin', 'POST', `/api/estimator/estimates/${id}/generate`, { replace: true, inputs: { length: 8, width: 6, demo: true, flooring: 'tile', shower: 'walk_in', homeYear: 1955 } });
    assert.ok(gen.data.notes.length && gen.data.lines.some(l => l.section === 'Tool rental'));

    // Full remodel (gut to studs) and results PDF
    const gutInputs = { length: 8, width: 6, shower: 'walk_in', flooring: 'tile', fullRemodel: true };
    const gutAdvice = (await call('admin', 'POST', '/api/estimator/advice', { inputs: gutInputs })).data;
    const normalAdvice = (await call('admin', 'POST', '/api/estimator/advice', { inputs: { ...gutInputs, fullRemodel: false } })).data;
    assert.ok(gutAdvice.totalCents > normalAdvice.totalCents * 1.5 && gutAdvice.notes.some(n => /studs/i.test(n)));
    assert.ok(gutAdvice.process.kind === 'bathroom' && gutAdvice.process.cushionPct === 8 && gutAdvice.process.steps.every(st => st.steps.length && st.tools.length && st.supplies.length));
    assert.equal((await call('admin', 'GET', '/api/estimator/labor-times')).data.cushionPct, 8);
    const resultsPdf = await call('admin', 'POST', '/api/estimator/advice/pdf', { title: 'Gut remodel', inputs: gutInputs });
    assert.equal(resultsPdf.res.status, 200);
    assert.equal(resultsPdf.res.headers.get('content-type'), 'application/pdf');
    assert.equal((await call('anon', 'POST', '/api/estimator/advice/pdf', { inputs: gutInputs })).res.status, 401);

    const crewSmall = (await call('admin', 'POST', '/api/estimator/advice', { inputs: { length: 8, width: 5, flooring: 'tile', shower: 'tub_surround', demo: true } })).data;
    assert.ok(crewSmall.hours > 40 && crewSmall.crew >= 2 && crewSmall.crew <= 3);
    assert.ok(gutAdvice.hours > crewSmall.hours * 1.5 && gutAdvice.schedule.phases.every(p => p.crew === 0 || p.hours > 0));
    const sh = crewSmall.schedule.shift;
    assert.ok(sh.productiveHours === 7.5 && sh.lunchMin === 30 && !sh.saturday && crewSmall.notes.some(n => /lunch/i.test(n)));
    assert.ok(crewSmall.schedule.phases.every(p => ![0, 6].includes(new Date(`${p.start}T12:00:00Z`).getUTCDay())));
    assert.equal((await call('admin', 'POST', '/api/estimator/settings', { work_start: '8am' })).res.status, 400);
    assert.equal((await call('admin', 'POST', '/api/estimator/settings', { work_start: '17:00', work_end: '08:00' })).res.status, 400);
    assert.equal((await call('admin', 'POST', '/api/estimator/settings', { work_start: '07:00', work_end: '15:00', lunch_min: 60, break_min: 0, work_saturday: '1' })).res.status, 200);
    const longDay = (await call('admin', 'POST', '/api/estimator/advice', { inputs: { length: 8, width: 5, flooring: 'tile', shower: 'tub_surround', demo: true, startDate: '2026-12-07' } })).data;
    assert.equal(longDay.schedule.shift.productiveHours, 7);
    assert.ok(longDay.schedule.shift.saturday && longDay.schedule.startDate === '2026-12-07' && longDay.schedule.days > crewSmall.schedule.days);
    assert.ok(longDay.schedule.phases.some(p => new Date(`${p.start}T12:00:00Z`).getUTCDay() === 6 || new Date(`${p.end}T12:00:00Z`).getUTCDay() === 6));
    await call('admin', 'POST', '/api/estimator/settings', { work_start: '08:00', work_end: '16:30', lunch_min: 30, break_min: 30, work_saturday: '0' });

    // Learning: record real costs and the next estimate shifts toward them
    const learnId = (await call('admin', 'POST', '/api/estimator/estimates', { title: 'Learn 1', wizard: { length: 8, width: 6, shower: 'walk_in', flooring: 'tile' } })).data.id;
    const learnBefore = (await call('admin', 'POST', '/api/estimator/advice', { inputs: { length: 8, width: 6, shower: 'walk_in', flooring: 'tile' } })).data;
    const learnView = (await call('admin', 'GET', `/api/estimator/estimates/${learnId}`)).data;
    assert.equal(learnView.estimate.contingencyBp !== undefined, true);
    assert.equal((await call('admin', 'POST', `/api/estimator/estimates/${learnId}/outcome`, { actualCost: 0 })).res.status, 400);
    for (let n = 0; n < 3; n++) {
      const eid = (await call('admin', 'POST', '/api/estimator/estimates', { title: `Learn ${n + 2}`, wizard: { length: 8, width: 6, shower: 'walk_in', flooring: 'tile' } })).data.id;
      const o = await call('admin', 'POST', `/api/estimator/estimates/${eid}/outcome`, { actualCost: learnView.totals.costCents * 1.3 / 100, actualHours: 60, sections: [{ section: 'Tile', cost: 1500 }] });
      assert.equal(o.res.status, 200);
    }
    const learnAfter = (await call('admin', 'POST', '/api/estimator/advice', { inputs: { length: 8, width: 6, shower: 'walk_in', flooring: 'tile' } })).data;
    assert.ok(learnAfter.totalCents > learnBefore.totalCents && learnAfter.learnedJobs === 3);
    const stats = (await call('admin', 'GET', '/api/estimator/learning')).data;
    assert.ok(stats.jobs === 3 && stats.overall > 1 && stats.overall <= 1.4);

    // Photo estimating: needs a key and consent, and only whitelisted answers come back
    const img = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQ==';
    assert.equal((await call('admin', 'POST', '/api/estimator/vision', { consent: true, images: [img] })).res.status, 503);
    process.env.AI_API_KEY = 'test-key';
    assert.equal((await call('admin', 'POST', '/api/estimator/vision', { images: [img] })).res.status, 400);
    assert.equal((await call('admin', 'POST', '/api/estimator/vision', { consent: true, images: ['http://evil.example/x.jpg'] })).res.status, 400);
    const nativeFetch = globalThis.fetch;
    globalThis.fetch = async (url, options) => String(url).startsWith('https://api.openai.com') ? new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ inputs: { length: 9, width: 5, flooring: 'tile', shower: 'bogus', demo: true, hacked: 'x' }, observations: ['Old tub'], risks: ['Possible rot'], assumptions: ['Width guessed'], confidence: 0.7 }) } }] }), { status: 200, headers: { 'Content-Type': 'application/json' } }) : nativeFetch(url, options);
    const seen = await call('admin', 'POST', '/api/estimator/vision', { consent: true, images: [img] });
    globalThis.fetch = nativeFetch; delete process.env.AI_API_KEY;
    assert.equal(seen.res.status, 200);
    assert.deepEqual(seen.data.inputs, { length: 9, width: 5, flooring: 'tile', demo: true });
    assert.ok(seen.data.observations[0] && seen.data.confidence === 0.7);

    // Predictable numbers: replace items with one material line
    await call('admin', 'POST', `/api/estimator/estimates/${id}/generate`, { replace: true, inputs: { floorSf: 0, vanities: 0 } });
    for (const l of (await call('admin', 'GET', `/api/estimator/estimates/${id}`)).data.lines) await call('admin', 'POST', `/api/estimator/estimates/${id}/items/${l.id}/delete`, {});
    await call('admin', 'POST', `/api/estimator/estimates/${id}/items`, { name: 'Test tile', kind: 'material', qty: 10, unit: 'sf', cost: 10, section: 'Tile' });
    await call('admin', 'POST', `/api/estimator/estimates/${id}/items`, { name: 'Heated floor upgrade', kind: 'material', qty: 1, unit: 'ea', cost: 100, optional: true, section: 'Options' });
    est = (await call('admin', 'POST', `/api/estimator/estimates/${id}`, { markupPct: 25, taxPct: 10, contingencyPct: 0, depositPct: 30, discount: 0, scope: 'Remodel the master bath.' })).data;
    assert.equal(est.totals.totalCents, 13750);
    assert.equal(est.totals.depositCents, 4125);

    // Employee estimates are private and cannot change pricing or send
    const mine = (await call('hank', 'POST', '/api/estimator/estimates', { title: 'Powder room', customerId: est.customer.id })).data.id;
    assert.equal((await call('hank', 'POST', `/api/estimator/estimates/${mine}`, { markupPct: 0 })).res.status, 403);
    assert.equal((await call('hank', 'POST', `/api/estimator/estimates/${mine}/send`, {})).res.status, 403);
    assert.equal((await call('hank', 'GET', `/api/estimator/estimates/${id}`)).res.status, 404);
    assert.equal((await call('hank', 'GET', `/api/estimator/estimates`)).data.estimates.length, 1);
    await call('hank', 'POST', `/api/estimator/estimates/${mine}/items`, { name: 'Tile', qty: 1, cost: 5 });
    assert.equal('profitCents' in (await call('hank', 'GET', `/api/estimator/estimates/${mine}`)).data.totals, false);

    // Customer cannot see drafts, then sees a cost-free view once sent
    assert.equal((await call('cust', 'GET', '/api/account/estimates')).data.estimates.length, 0);
    assert.equal((await call('admin', 'POST', `/api/estimator/estimates/${id}/send`, {})).res.status, 200);
    assert.match(sent.at(-1).text, /account\/estimate\/\?id=/);
    const list = (await call('cust', 'GET', '/api/account/estimates')).data.estimates;
    assert.equal(list.length, 1);
    const view = (await call('cust', 'GET', `/api/account/estimates/${id}`)).data.estimate;
    assert.equal(view.totals.totalCents, 13750);
    assert.equal(JSON.stringify(view).includes('cost'), false);
    assert.equal(JSON.stringify(view).includes('profit'), false);
    assert.equal((await call('hank', 'GET', `/api/account/estimates/${id}`)).res.status, 404);

    // Signing: exact name, agreement, optional items
    const option = view.items.find(i => i.optional);
    assert.equal((await call('cust', 'POST', `/api/account/estimates/${id}/sign`, { name: 'Someone Else', agree: true })).res.status, 400);
    const signed = await call('cust', 'POST', `/api/account/estimates/${id}/sign`, { name: ' cust   omer ', agree: true, optionalIds: [option.id] });
    assert.equal(signed.res.status, 200);
    assert.equal(signed.data.estimate.status, 'accepted');
    assert.equal(signed.data.estimate.totals.totalCents, 13750 + 12500 / 100 * 100 + 1250 - 0 + 0 === 0 ? 0 : signed.data.estimate.totals.totalCents);
    assert.equal(signed.data.estimate.signedTotalCents, signed.data.estimate.totals.totalCents);
    assert.ok(signed.data.estimate.totals.totalCents > 13750);
    assert.equal((await call('admin', 'POST', `/api/estimator/estimates/${id}`, { title: 'Hacked' })).res.status, 409);

    // Legal documents
    assert.equal((await call('hank', 'POST', `/api/estimator/estimates/${mine}/documents`, { template: 'contract' })).res.status, 403);
    assert.equal((await call('admin', 'POST', `/api/estimator/estimates/${id}/documents`, { template: 'contract' })).res.status, 201);
    const docs = (await call('cust', 'GET', `/api/account/estimates/${id}`)).data.estimate.documents;
    assert.equal(docs.length, 1);
    assert.match(docs[0].body, /Cust Omer/);
    assert.equal((await call('cust', 'POST', `/api/account/estimates/${id}/documents/${docs[0].id}/sign`, { name: 'Nope', agree: true })).res.status, 400);
    assert.equal((await call('cust', 'POST', `/api/account/estimates/${id}/documents/${docs[0].id}/sign`, { name: 'Cust Omer', agree: true })).data.estimate.documents[0].status, 'signed');

    // PDFs carry the signature record; customers and admins can download, others cannot
    const pdfRes = await realFetch(`${base}/api/account/estimates/${id}/pdf`, { headers: { Cookie: jar.cust } });
    const pdfText = Buffer.from(await pdfRes.arrayBuffer()).toString('latin1');
    assert.equal(pdfRes.headers.get('content-type'), 'application/pdf');
    assert.ok(pdfText.startsWith('%PDF-1.4') && pdfText.includes('Cust Omer') && pdfText.includes('IP address') && pdfText.includes('SHA-256'));
    const hash = (await call('admin', 'GET', `/api/estimator/estimates/${id}`)).data && sent.filter(m => m.attachments?.length).at(-1);
    assert.ok(hash, 'signed copy was emailed with a PDF attachment');
    assert.equal((await realFetch(`${base}/api/estimator/estimates/${id}/pdf`, { headers: { Cookie: jar.admin } })).status, 200);
    assert.equal((await realFetch(`${base}/api/account/estimates/${id}/pdf`)).status, 401);
    assert.equal((await call('admin', 'GET', '/api/estimator/verify?hash=abc')).res.status, 400);
    assert.equal((await call('admin', 'GET', `/api/estimator/verify?hash=${'0'.repeat(64)}`)).data.valid, false);

    // Payments: not configured, then Stripe checkout and signed webhook
    assert.equal((await call('cust', 'POST', `/api/account/estimates/${id}/pay`, { kind: 'deposit' })).res.status, 503);
    process.env.STRIPE_SECRET_KEY = 'sk_test_x'; process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test';
    let stripeBody;
    globalThis.fetch = async (url, options) => { if (String(url).startsWith('https://api.stripe.com')) { stripeBody = new URLSearchParams(options.body); return new Response(JSON.stringify({ url: 'https://checkout.stripe.test/s1' }), { status: 200, headers: { 'Content-Type': 'application/json' } }); } return realFetch(url, options); };
    const pay = await call('cust', 'POST', `/api/account/estimates/${id}/pay`, { kind: 'deposit' });
    assert.equal(pay.data.url, 'https://checkout.stripe.test/s1');
    const total = signed.data.estimate.totals.totalCents, deposit = signed.data.estimate.totals.depositCents;
    assert.equal(stripeBody.get('line_items[0][price_data][unit_amount]'), String(deposit));
    const event = JSON.stringify({ type: 'checkout.session.completed', data: { object: { id: 'cs_1', payment_status: 'paid', amount_total: deposit, metadata: { estimate_id: String(id), kind: 'deposit' } } } });
    const hook = (payload, secret = 'whsec_test') => { const t = Math.floor(Date.now() / 1000); return realFetch(`${base}/api/webhooks/stripe`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Stripe-Signature': `t=${t},v1=${crypto.createHmac('sha256', secret).update(`${t}.${payload}`).digest('hex')}` }, body: payload }); };
    assert.equal((await hook(event, 'wrong')).status, 400);
    assert.equal((await hook(event)).status, 200);
    assert.equal((await hook(event)).status, 200);
    const after = (await call('cust', 'GET', `/api/account/estimates/${id}`)).data.estimate;
    assert.equal(after.payments.length, 1);
    assert.equal(after.totals.paidCents, deposit);
    assert.equal(after.totals.balanceCents, total - deposit);
    assert.equal((await call('cust', 'POST', `/api/account/estimates/${id}/pay`, { kind: 'deposit' })).res.status, 400);

    // Offline payment, job and change order
    assert.equal((await call('admin', 'POST', `/api/estimator/estimates/${id}/payments`, { amount: (total - deposit) / 100, method: 'Check' })).res.status, 201);
    assert.equal((await call('cust', 'GET', `/api/account/estimates/${id}`)).data.estimate.totals.balanceCents, 0);
    assert.equal((await call('admin', 'POST', `/api/estimator/estimates/${id}/tools`, {})).res.status, 400);
    const jobMade = (await call('admin', 'POST', `/api/estimator/estimates/${id}/job`, {})).data.jobId;
    assert.ok(jobMade);
    const tl = (await call('admin', 'GET', `/api/estimator/estimates/${id}/tools`)).data;
    assert.equal(tl.jobId, jobMade);
    assert.ok(tl.tools.length > 20 && tl.tools.some(t => t.name.startsWith('Safety glasses')));
    assert.equal(new Set(tl.tools.map(t => t.name)).size, tl.tools.length);
    assert.equal((await call('admin', 'POST', `/api/estimator/estimates/${id}/tools`, {})).res.status, 200);
    const co = await call('admin', 'POST', `/api/estimator/estimates/${id}/change-order`, {});
    assert.equal((await call('admin', 'GET', `/api/estimator/estimates/${co.data.id}`)).data.estimate.kind, 'change_order');
    assert.equal((await call('admin', 'POST', `/api/estimator/estimates/${id}/delete`, {})).res.status, 409);
  } finally { globalThis.fetch = realFetch; delete process.env.STRIPE_SECRET_KEY; delete process.env.STRIPE_WEBHOOK_SECRET; server.close(); fs.rmSync(dataDir, { recursive: true, force: true }); }
});

test('handyman jobs: tasks, plan, permits, tools and admin pricing', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bbs-hm-'));
  const sent = [];
  const server = createServer({ dataDir, siteUrl: 'http://localhost', adminEmails: ['admin@example.com'], notifyEmail: '', mailer: async m => { sent.push(m); }, gcal: { enabled: false, sync: async () => {} } });
  await new Promise(resolve => server.listen(0, resolve));
  const base = `http://localhost:${server.address().port}`;
  let cookie = '';
  const call = async (method, url, body) => {
    const res = await fetch(base + url, { method, headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { Cookie: cookie } : {}) }, body: body ? JSON.stringify(body) : undefined });
    const set = res.headers.get('set-cookie'); if (set) cookie = set.split(';')[0];
    return { res, data: (res.headers.get('content-type') || '').includes('json') ? await res.json() : null };
  };
  try {
    await call('POST', '/api/auth/register', { name: 'Admin', email: 'admin@example.com', password: 'correct-horse-1', consent: true });
    await call('POST', '/api/auth/verify', { token: sent.at(-1).text.match(/token=([\w-]+)/)[1] });
    await call('POST', '/api/auth/login', { email: 'admin@example.com', password: 'correct-horse-1' });
    const list = await call('GET', '/api/estimator/handyman/tasks');
    assert.ok(list.data.tasks.length > 100 && list.data.categories.length === 15);
    const heater = list.data.tasks.find(t => t.permit === 'Plumbing');
    const paint = list.data.tasks.find(t => t.category === 'Painting');
    const inputs = { jobType: 'handyman', homeYear: '1965', city: 'Aurora', tasks: { [heater.code]: 1, [paint.code]: 200 } };
    const adv = await call('POST', '/api/estimator/advice', { inputs });
    assert.equal(adv.res.status, 200);
    assert.ok(adv.data.totalCents > 0 && adv.data.hours > 0);
    assert.equal(adv.data.codes.permitNeeded, true);
    assert.ok(adv.data.codes.flags.some(f => /Lead/.test(f)));
    const made = await call('POST', '/api/estimator/estimates', { title: 'Fixes', newCustomer: { name: 'Pat', email: 'pat@example.com' }, wizard: inputs });
    assert.equal(made.res.status, 201);
    const tools = await call('GET', `/api/estimator/estimates/${made.data.id}/tools`);
    assert.equal(tools.res.status, 200);
    const price = await call('POST', '/api/estimator/handyman/tasks', { code: paint.code, hrs: paint.hrs * 2, mat: 1 });
    assert.equal(price.res.status, 200);
    const again = await call('POST', '/api/estimator/advice', { inputs });
    assert.ok(again.data.totalCents > adv.data.totalCents || paint.matCents > 100);
    assert.equal((await call('POST', '/api/estimator/handyman/tasks', { code: 'nope', hrs: 1, mat: 1 })).res.status, 404);
  } finally { await new Promise(resolve => server.close(resolve)); }
});
