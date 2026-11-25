const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const { createServer } = require('../server');
const { effectiveRule, reconcileActuals, validDate } = require('../lib/accounting');

test('accounting rules are effective-dated and reconciliation preserves zero versus missing', () => {
  assert.equal(validDate('2026-02-30'), false);
  assert.equal(validDate('2026-02-28'), true);
  assert.equal(effectiveRule('mileage', '2025-12-31').value, 0.7);
  assert.equal(effectiveRule('mileage', '2026-01-01').value, 0.725);
  assert.equal(effectiveRule('mileage', '2026-01-01').verificationStatus, 'provisional');
  assert.throws(() => effectiveRule('mileage', '2026-02-30'), /calendar date/);
  const zero = reconcileActuals({ approvedHours: 0, approvedLaborCents: 0, paidLaborCents: 0, expenseCents: 0, estimateActualCents: 0 });
  assert.deepEqual(zero.explicitZero, ['approvedHours', 'approvedLaborCents', 'paidLaborCents', 'expenseCents', 'estimateActualCents']);
  assert.equal(zero.state, 'reconciled');
  const missing = reconcileActuals({ approvedLaborCents: 0, expenseCents: 0 });
  assert.equal(missing.estimateActualCents, null);
  assert.ok(missing.missing.includes('estimateActualCents'));
  assert.equal(missing.state, 'incomplete');
  assert.throws(() => reconcileActuals({ approvedHours: Infinity }), /finite/);
});

test('accounting: expenses, income, 1099s, compliance and exports', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bbs-acct-'));
  const sent = [];
  const server = createServer({ dataDir, siteUrl: 'http://localhost', adminEmails: ['admin@example.com'], notifyEmail: '', mailer: async m => { sent.push(m); }, gcal: { enabled: false, sync: async () => null, remove: async () => null }, receiver: null });
  await new Promise(resolve => server.listen(0, resolve));
  const base = `http://localhost:${server.address().port}`;
  const jar = {};
  const call = async (who, method, url, body) => {
    const res = await fetch(base + url, { method, headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(jar[who] ? { Cookie: jar[who] } : {}) }, body: body ? JSON.stringify(body) : undefined });
    const set = res.headers.get('set-cookie');
    if (set) jar[who] = set.split(';')[0];
    return { res, data: (res.headers.get('content-type') || '').includes('json') ? await res.json() : null };
  };
  const token = to => sent.filter(m => m.to === to).at(-1).text.match(/token=([\w-]+)/)[1];
  const year = new Date().getFullYear(), day = `${year}-03-10`;
  try {
    await call('admin', 'POST', '/api/auth/register', { name: 'Admin', email: 'admin@example.com', password: 'correct-horse-1', consent: true });
    await call('admin', 'POST', '/api/auth/verify', { token: token('admin@example.com') });
    await call('admin', 'POST', '/api/auth/login', { email: 'admin@example.com', password: 'correct-horse-1' });
    const empId = (await call('admin', 'POST', '/api/admin/employees', { name: 'Sub Contractor', email: 'sub@example.com', skipOnboarding: true, roleTitle: 'Tile', rate: 40 })).data.id;
    await call('hank', 'POST', '/api/auth/reset', { token: token('sub@example.com'), password: 'correct-horse-2' });
    await call('hank', 'POST', '/api/auth/login', { email: 'sub@example.com', password: 'correct-horse-2' });

    assert.equal((await call('hank', 'GET', '/api/admin/accounting')).res.status, 403);
    assert.equal((await call('anon', 'GET', '/api/admin/accounting')).res.status, 401);

    const est = (await call('admin', 'POST', '/api/estimator/estimates', { title: 'Bath', newCustomer: { name: 'Cust', email: 'c@example.com' }, wizard: { length: 8, width: 5, shower: 'tub_surround', flooring: 'tile' } })).data.id;
    assert.equal((await call('admin', 'POST', `/api/estimator/estimates/${est}/payments`, { amount: 1000, method: 'Check', paidOn: day })).res.status, 201);

    assert.equal((await call('admin', 'POST', '/api/admin/accounting/expenses', { date: day, vendor: 'Lowes', category: 'materials', amount: '250.50' })).res.status, 201);
    assert.equal((await call('admin', 'POST', '/api/admin/accounting/expenses', { date: day, vendor: 'Lunch', category: 'meals', amount: '40' })).res.status, 201);
    assert.equal((await call('admin', 'POST', '/api/admin/accounting/expenses', { date: day, vendor: 'To job', category: 'mileage', miles: '100' })).res.status, 201);
    assert.equal((await call('admin', 'POST', '/api/admin/accounting/expenses', { date: 'nope', category: 'materials', amount: '1' })).res.status, 400);
    assert.equal((await call('admin', 'POST', '/api/admin/accounting/expenses', { date: day, category: 'bogus', amount: '1' })).res.status, 400);

    assert.equal((await call('admin', 'POST', `/api/admin/accounting/workers/${empId}`, { type: 'contractor', last4: '12' })).res.status, 400);
    assert.equal((await call('admin', 'POST', `/api/admin/accounting/workers/${empId}`, { type: 'contractor', last4: '1234' })).res.status, 200);
    const db = new DatabaseSync(path.join(dataDir, 'app.db'));
    db.prepare('INSERT INTO payments (employee_id, amount_cents, paid_on, created_at) VALUES (?, 250000, ?, ?)').run(empId, day, day);
    db.close();
    await call('admin', 'POST', '/api/admin/accounting/docs', { kind: 'insurance_gl', title: 'GL policy', expiresOn: `${year - 1}-01-01` });
    assert.equal((await call('admin', 'POST', '/api/admin/accounting/docs', { kind: 'insurance_gl', title: 'Reversed dates', issuedOn: `${year}-03-10`, expiresOn: `${year}-03-09` })).res.status, 400);

    const d = (await call('admin', 'GET', `/api/admin/accounting?year=${year}`)).data;
    assert.equal(d.summary.grossReceiptsCents, 100000);
    const cat = k => d.summary.expenses.find(e => e.category === k);
    assert.equal(cat('meals').deductibleCents, 2000);
    assert.equal(cat('mileage').spentCents, Math.round(100 * Number(d.settings.mileage_rate) * 100));
    assert.equal(d.summary.contractorCents, 250000);
    assert.equal(d.contractors[0].needs1099, true);
    assert.equal(d.summary.netProfitCents, d.summary.revenueCents - d.summary.expenseTotalCents);
    assert.equal(d.summary.tax.verificationStatus, 'provisional');
    assert.equal(d.reconciliation.state, 'incomplete');
    assert.equal(d.reconciliation.approvedHours, 0);
    assert.ok(d.alerts.some(a => /W-9/.test(a.message)) && d.alerts.some(a => /1099-NEC/.test(a.message)));
    assert.equal(d.compliance.checklist.find(c => c.kind === 'insurance_gl').status, 'expired');
    assert.equal(d.compliance.checklist.find(c => c.kind === 'ein').status, 'missing');

    const csv = await fetch(`${base}/api/admin/accounting/export?type=expenses&year=${year}`, { headers: { Cookie: jar.admin } });
    assert.match(csv.headers.get('content-type'), /text\/csv/);
    assert.match(await csv.text(), /Lowes/);
    const zipRes = await fetch(`${base}/api/admin/accounting/export?type=packet&year=${year}`, { headers: { Cookie: jar.admin } });
    const zip = Buffer.from(await zipRes.arrayBuffer());
    assert.equal(zip.readUInt32LE(0), 0x04034b50);
    fs.writeFileSync(path.join(dataDir, 'p.zip'), zip);
    assert.ok(zip.includes('1099-nec-worksheet.csv') && zip.includes('summary.pdf'));
    assert.ok(zip.includes('reconciliation.csv'));
    assert.equal((await fetch(`${base}/api/admin/accounting/export?type=expenses`, { headers: { Cookie: jar.hank } })).status, 403);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});
