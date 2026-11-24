const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createServer } = require('../server');

test('contact form creates customers, honors the mailing-list opt-in, and the admin can export', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bbs-leads-'));
  const sent = [];
  const server = createServer({ dataDir, siteUrl: 'http://localhost', adminEmails: ['admin@example.com'], notifyEmail: '', mailer: async m => { sent.push(m); }, gcal: { enabled: false, sync: async () => null, remove: async () => null }, receiver: null });
  await new Promise(resolve => server.listen(0, resolve));
  const base = `http://localhost:${server.address().port}`;
  let cookie = '';
  const call = async (method, url, body) => {
    const res = await fetch(base + url, { method, headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { Cookie: cookie } : {}) }, body: body ? JSON.stringify(body) : undefined });
    const set = res.headers.get('set-cookie'); if (set) cookie = set.split(';')[0];
    const type = res.headers.get('content-type') || '';
    return { res, data: type.includes('json') ? await res.json() : await res.text() };
  };
  const lead = { type: 'project', name: 'Lee Lead', email: 'lee@example.com', phone: '555-0100', location: 'Kane County', interest: 'Bathroom remodel', message: 'Hi', consent: true };
  try {
    assert.equal((await call('POST', '/api/submissions', lead)).res.status, 201);
    assert.equal((await call('POST', '/api/submissions', { ...lead, name: 'Mia Mailer', email: 'mia@example.com', marketing: true })).res.status, 201);
    assert.equal((await call('POST', '/api/submissions', { ...lead, phone: '', message: 'Again' })).res.status, 201); // repeat visitor

    await call('POST', '/api/auth/register', { name: 'Admin', email: 'admin@example.com', password: 'correct-horse-1', consent: true });
    await call('POST', '/api/auth/verify', { token: sent.filter(m => m.to === 'admin@example.com').at(-1).text.match(/token=([\w-]+)/)[1] });
    await call('POST', '/api/auth/login', { email: 'admin@example.com', password: 'correct-horse-1' });

    const all = (await call('GET', '/api/admin/customers?list=website')).data.customers;
    assert.equal(all.length, 2, 'repeat submissions do not duplicate the customer');
    const lee = all.find(c => c.email === 'lee@example.com'), mia = all.find(c => c.email === 'mia@example.com');
    assert.deepEqual([lee.status, lee.source, lee.mailing, mia.mailing], ['lead', 'website-project', false, true]);
    assert.match(lee.notes, /Bathroom remodel/);

    const csv = (await call('GET', '/api/admin/customers/mailing-list.csv')).data;
    assert.ok(csv.includes('mia@example.com') && !csv.includes('lee@example.com'));
    assert.equal((await call('GET', '/api/admin/customers?list=mailing')).data.customers.length, 1);

    assert.equal((await call('POST', `/api/admin/customers/${lee.id}/mailing`, { subscribed: true })).res.status, 200);
    assert.ok((await call('GET', '/api/admin/customers/mailing-list.csv')).data.includes('lee@example.com'));
    assert.equal((await call('POST', `/api/admin/customers/${lee.id}/mailing`, { subscribed: 'yes' })).res.status, 400);
  } finally {
    server.close(); fs.rmSync(dataDir, { recursive: true, force: true });
  }
});
