const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createServer } = require('../server');

test('estimator advisor: 22 checks respond to the answers', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bbs-adv-'));
  const sent = [];
  const server = createServer({ dataDir, siteUrl: 'http://localhost', adminEmails: ['admin@example.com'], notifyEmail: '', mailer: async m => { sent.push(m); }, gcal: { enabled: false, sync: async () => null, remove: async () => null }, receiver: null });
  await new Promise(resolve => server.listen(0, resolve));
  const base = `http://localhost:${server.address().port}`;
  let cookie = '';
  const call = async (method, url, body) => {
    const res = await fetch(base + url, { method, headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { Cookie: cookie } : {}) }, body: body ? JSON.stringify(body) : undefined });
    const set = res.headers.get('set-cookie'); if (set) cookie = set.split(';')[0];
    return { res, data: await res.json() };
  };
  try {
    await call('POST', '/api/auth/register', { name: 'Admin', email: 'admin@example.com', password: 'correct-horse-1', consent: true });
    await call('POST', '/api/auth/verify', { token: sent.filter(m => m.to === 'admin@example.com').at(-1).text.match(/token=([\w-]+)/)[1] });
    await call('POST', '/api/auth/login', { email: 'admin@example.com', password: 'correct-horse-1' });
    const inputs = { bathType: 'full', length: 8, width: 5, homeYear: 1965, startDate: '2026-12-07', shower: 'walk_in', glassType: 'frameless', curbless: true, level: 'upper', condition: 'poor', flooring: 'tile', fan: true, lighting: true, toiletMode: 'replace', plumbingChanges: true, condo: true, singleBath: true, subfloor: true, leveler: true };
    const full = (await call('POST', '/api/estimator/advice', { inputs })).data, a = full.advisor;
    assert.equal(Object.keys(a).length, 22);
    assert.ok(a.conflicts.some(c => /upper floor/.test(c.text)), 'curbless upstairs is flagged');
    assert.ok(a.hidden.items.length >= 3 && a.hidden.highCents > a.hidden.lowCents);
    assert.equal(a.permit.needed, true);
    assert.ok(a.orders.length && a.orders.every(o => /^\d{4}-\d{2}-\d{2}$/.test(o.orderBy)));
    assert.equal(a.financing.options.length, 3);
    assert.ok(a.financing.options[0].monthlyCents > a.financing.options[2].monthlyCents);
    assert.ok(a.walkAway.floorCents > 0 && a.negotiation.targetPriceCents >= a.walkAway.floorCents);
    assert.ok(a.trueProfit.profitCents < full.insights.margin.grossCents, 'overhead lowers profit');
    assert.equal(a.payments.reduce((n, p) => n + p.cents, 0), full.totalCents, 'milestones add up to the total');
    assert.ok(a.condo && a.condo.items.length >= 5);
    assert.ok(a.noBathroom.singleBath && /temporary facility/.test(a.noBathroom.plan));
    assert.ok(a.season.holidaysInSchedule.some(h => /Christmas|Thanksgiving/.test(h.name)) || a.season.holidaysInSchedule.length === 0);
    assert.ok(a.maintenance.length >= 4 && a.changeRates.length >= 3 && a.trades.length >= 3);
    const plain = (await call('POST', '/api/estimator/advice', { inputs: { bathType: 'half', length: 5, width: 4 } })).data.advisor;
    assert.equal(plain.condo, null);
    assert.equal(plain.conflicts.length, 0);
    assert.ok(plain.readiness.score < a.readiness.score);
    const hm = (await call('POST', '/api/estimator/advice', { inputs: { jobType: 'handyman', tasks: {} } })).data;
    assert.ok(hm.advisor && hm.advisor.financing);
  } finally {
    server.close(); fs.rmSync(dataDir, { recursive: true, force: true });
  }
});
