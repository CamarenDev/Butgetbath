const test = require('node:test');
const assert = require('node:assert/strict');
const logistics = require('../lib/logistics');

test('stairs, truck rental, debris mode and travel change the price and the crew hours', () => {
  const ctx = { pieces: 40, yards: 6, tons: 2, tripsAuto: 3 };
  const flat = logistics.build(logistics.resolve({}), ctx);
  const climb = logistics.build(logistics.resolve({ stairFlights: 3, supplyMode: 'rental', debrisMode: 'junk', cleanupBy: 'service' }), ctx);
  assert.ok(climb.hours.carryIn > flat.hours.carryIn * 3);
  const codes = climb.lines.map(l => l.code);
  assert.ok(codes.includes('lg-truck') && codes.includes('lg-junk') && codes.includes('lg-cleaning'));
  assert.ok(!flat.lines.some(l => l.code === 'lg-truck'));
  assert.ok(climb.rows.some(r => r.label === 'Cleanup') && climb.rows.some(r => r.label === 'Debris and garbage'));
  const t = logistics.travel({ driveMiles: 20, tollsOneWay: 2.5 }, { days: 4, peakCrew: 2 });
  assert.equal(t.miles > 160, true);
  assert.ok(t.lines.some(l => l.code === 'lg-tolls' && l.cost_cents === 250));
});

test('the estimator advice, PDF and crew brief include logistics, roles and cleanup', async () => {
  const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
  const { createServer } = require('../server');
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bbs-lg-')), sent = [];
  const server = createServer({ dataDir, siteUrl: 'http://localhost', adminEmails: ['admin@example.com'], notifyEmail: 'office@example.com', mailer: async m => { sent.push(m); }, gcal: { enabled: false, sync: async () => {}, remove: async () => {} }, receiver: null });
  await new Promise(r => server.listen(0, r));
  const base = `http://localhost:${server.address().port}`;
  let cookie = '';
  const call = async (method, url, body) => {
    const res = await fetch(base + url, { method, headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { Cookie: cookie } : {}) }, body: body ? JSON.stringify(body) : undefined });
    const set = res.headers.get('set-cookie'); if (set) cookie = set.split(';')[0];
    return { res, data: (res.headers.get('content-type') || '').includes('json') ? await res.json() : Buffer.from(await res.arrayBuffer()) };
  };
  try {
    await call('POST', '/api/auth/register', { name: 'Admin', email: 'admin@example.com', password: 'correct-horse-1', consent: true });
    await call('POST', '/api/auth/verify', { token: sent.at(-1).text.match(/token=([\w-]+)/)[1] });
    await call('POST', '/api/auth/login', { email: 'admin@example.com', password: 'correct-horse-1' });
    const inputs = { length: 8, width: 5, demo: true, stairFlights: 3, supplyMode: 'rental', debrisMode: 'junk', cleanupBy: 'service', driveMiles: 25, tollsOneWay: 3 };
    const adv = (await call('POST', '/api/estimator/advice', { inputs })).data;
    const labels = adv.process.logistics.map(r => r.label);
    assert.ok(labels.includes('Driving to the job') && labels.includes('Cleanup') && labels.includes('Debris and garbage'));
    assert.ok(adv.process.crew.length && adv.process.dayPlan.length && adv.process.closeout.daily.length);
    const plain = (await call('POST', '/api/estimator/advice', { inputs: { length: 8, width: 5, demo: true } })).data;
    assert.ok(adv.hours > plain.hours && adv.totalCents > plain.totalCents);
    const pdf = await call('POST', '/api/estimator/advice/pdf', { title: 'T', inputs });
    assert.equal(pdf.res.status, 200);
    assert.ok(pdf.data.subarray(0, 4).toString() === '%PDF');
    const est = (await call('POST', '/api/estimator/estimates', { title: 'Brief', newCustomer: { name: 'Cu Stomer', email: 'cu@example.com' }, wizard: inputs })).data.id;
    const job = (await call('POST', '/api/admin/jobs', { title: 'Brief job', address: '1 Main' })).data.id;
    const db = require('../lib/db').openDb(dataDir);
    db.prepare('UPDATE estimates SET job_id = ? WHERE id = ?').run(job, est);
    assert.equal((await call('POST', `/api/estimator/estimates/${est}/tools`, {})).res.status, 200);
    const brief = JSON.parse(db.prepare('SELECT body FROM job_briefs WHERE job_id = ?').get(job).body);
    assert.ok(brief.steps.length && brief.crew.length && brief.logistics.length && brief.closeout.final);
    assert.ok(!/price|markup|margin/i.test(JSON.stringify(brief.steps)));
    const learn = (await call('GET', '/api/estimator/learning')).data;
    assert.ok(learn.field && typeof learn.field.reports === 'number');
  } finally { await new Promise(r => server.close(r)); fs.rmSync(dataDir, { recursive: true, force: true }); }
});
