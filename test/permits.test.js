const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createServer } = require('../server');

test('permit tracking: admin records, inspections, customer view, hidden internal notes', async () => {
  const sent = [];
  const server = createServer({ dataDir: fs.mkdtempSync(path.join(os.tmpdir(), 'bbs-permit-')), siteUrl: 'http://localhost', adminEmails: ['admin@example.com'], notifyEmail: 'office@example.com', mailer: async m => { sent.push(m); }, gcal: { enabled: false, sync: async () => {} } });
  await new Promise(resolve => server.listen(0, resolve));
  const base = `http://localhost:${server.address().port}`, jar = {};
  const call = async (who, method, url, body) => {
    const res = await fetch(base + url, { method, headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(jar[who] ? { Cookie: jar[who] } : {}) }, body: body ? JSON.stringify(body) : undefined });
    const set = res.headers.get('set-cookie'); if (set) jar[who] = set.split(';')[0];
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
    const id = (await call('admin', 'POST', '/api/estimator/estimates', { title: 'Master bath', newCustomer: { name: 'Cust Omer', email: 'cust@example.com', address: '1 Main St' }, wizard: { tier: 'better', floorSf: 40, wallTileSf: 80, shower: 'walk_in', demo: true, permit: true } })).data.id;
    const url = `/api/estimator/estimates/${id}/permits`;

    assert.equal((await call('anon', 'GET', url)).res.status, 401);
    assert.equal((await call('admin', 'POST', url, { type: 'Nonsense' })).res.status, 400);
    assert.equal((await call('admin', 'POST', url, { type: 'Plumbing', appliedOn: '2026-13-45' })).res.status, 400);
    const made = await call('admin', 'POST', url, { type: 'Plumbing', city: 'Aurora', description: 'Move drain', fee: 125 });
    assert.equal(made.data.permits.length, 1);
    const pid = made.data.permits[0].id;
    assert.equal(made.data.permits[0].status, 'needed');
    assert.ok(made.data.permits[0].reviewDays[1] > made.data.permits[0].reviewDays[0]);

    await call('admin', 'POST', `${url}/${pid}`, { status: 'applied', internalNote: 'Call inspector', customerNote: 'Submitted to the city.' });
    const inspected = await call('admin', 'POST', `${url}/${pid}/inspections`, { name: 'Rough plumbing', scheduledOn: '2026-12-01' });
    const iid = inspected.data.permits[0].inspections[0].id;
    assert.equal((await call('admin', 'POST', `${url}/${pid}/inspections/${iid}`, { result: 'bogus' })).res.status, 400);
    assert.equal(inspected.data.permits[0].appliedOn, new Date().toISOString().slice(0, 10));

    // Issuing emails the customer; a failed inspection alerts the office
    await call('admin', 'POST', `${url}/${pid}`, { status: 'issued', number: 'P-1001' });
    assert.ok(sent.some(m => m.to === 'cust@example.com' && /permit/i.test(m.subject)));
    await call('admin', 'POST', `${url}/${pid}/inspections/${iid}`, { result: 'failed' });
    assert.ok(sent.some(m => m.to === 'office@example.com' && /inspection failed/i.test(m.subject)));

    // Customer sees permits only on a sent estimate, never the internal note
    await call('admin', 'POST', `/api/estimator/estimates/${id}/send`, {});
    const mine = (await call('cust', 'GET', `/api/account/estimates/${id}`)).data.estimate;
    assert.equal(mine.permits.length, 1);
    assert.equal(mine.permits[0].number, 'P-1001');
    assert.equal(mine.permits[0].customerNote, 'Submitted to the city.');
    assert.ok(!JSON.stringify(mine.permits).includes('Call inspector'));
    assert.equal((await call('cust', 'POST', url, { type: 'Building' })).res.status, 403);

    // Waived permits are hidden from the customer; deleting works
    await call('admin', 'POST', `${url}/${pid}`, { status: 'waived' });
    assert.equal((await call('cust', 'GET', `/api/account/estimates/${id}`)).data.estimate.permits.length, 0);
    assert.equal((await call('admin', 'POST', `${url}/${pid}/delete`, {})).data.permits.length, 0);
  } finally { server.close(); }
});
