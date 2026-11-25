const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
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

test('lead persistence is atomic and retries keep one lead and one notification job', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bbs-leads-atomic-'));
  const sent = [];
  const server = createServer({ dataDir, siteUrl: 'http://localhost', mailer: async message => { sent.push(message); } });
  await new Promise(resolve => server.listen(0, resolve));
  const base = `http://localhost:${server.address().port}`;
  const lead = { type: 'project', name: 'Atomic Lead', email: 'atomic@example.com', phone: '555-0105', location: 'Kane County', interest: 'Bathroom remodel', message: 'Please call', consent: true };
  const submit = () => fetch(base + '/api/submissions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Idempotency-Key': 'atomic-lead-123' },
    body: JSON.stringify(lead)
  });
  const db = new DatabaseSync(path.join(dataDir, 'app.db'));
  const counts = () => ({
    contacts: db.prepare('SELECT COUNT(*) AS n FROM contacts').get().n,
    customers: db.prepare('SELECT COUNT(*) AS n FROM customers').get().n,
    jobs: db.prepare('SELECT COUNT(*) AS n FROM notification_jobs').get().n
  });
  try {
    db.exec(`CREATE TRIGGER fail_lead_job BEFORE INSERT ON notification_jobs BEGIN SELECT RAISE(ABORT, 'forced failure'); END;`);
    assert.equal((await submit()).status, 500);
    assert.deepEqual(counts(), { contacts: 0, customers: 0, jobs: 0 });
    db.exec('DROP TRIGGER fail_lead_job');

    assert.equal((await submit()).status, 201);
    assert.equal((await submit()).status, 201);
    assert.deepEqual(counts(), { contacts: 1, customers: 1, jobs: 1 });
    assert.equal(db.prepare('SELECT status FROM notification_jobs').get().status, 'sent');
    assert.equal(sent.length, 1);
  } finally {
    db.close();
    await new Promise(resolve => server.close(resolve));
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
});

test('failed notification delivery remains pending and retries safely', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bbs-leads-outbox-'));
  let attempts = 0;
  const server = createServer({ dataDir, siteUrl: 'http://localhost', mailer: async () => { if (++attempts === 1) throw new Error('temporary mail failure'); } });
  await new Promise(resolve => server.listen(0, resolve));
  const base = `http://localhost:${server.address().port}`;
  const lead = { type: 'question', name: 'Retry Lead', email: 'retry@example.com', location: 'Other / not sure', interest: 'Question', consent: true };
  const submit = () => fetch(base + '/api/submissions', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': 'retry-key' }, body: JSON.stringify(lead) });
  try {
    assert.equal((await submit()).status, 201);
    assert.equal((await submit()).status, 201);
    const db = new DatabaseSync(path.join(dataDir, 'app.db'));
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM contacts').get().n, 1);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM notification_jobs').get().n, 1);
    assert.equal(db.prepare('SELECT status, attempts FROM notification_jobs').get().status, 'sent');
    assert.equal(attempts, 2);
    db.close();
  } finally {
    await new Promise(resolve => server.close(resolve));
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
});

test('free-estimate callback requires an email, alerts the admin and sends the customer an introduction', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bbs-callback-'));
  const sent = [];
  const server = createServer({ dataDir, siteUrl: 'http://localhost', adminEmails: ['admin@example.com'], notifyEmail: 'admin@example.com', mailer: async m => { sent.push(m); }, gcal: { enabled: false, sync: async () => null, remove: async () => null }, receiver: null });
  await new Promise(resolve => server.listen(0, resolve));
  const post = body => fetch(`http://localhost:${server.address().port}/api/submissions`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  try {
    const lead = { type: 'callback', name: 'Cal Back', phone: '555-010-0100', consent: true };
    assert.equal((await post(lead)).status, 400);
    assert.equal((await post({ ...lead, email: 'cal@example.com' })).status, 201);
    assert.deepEqual(sent.map(m => m.to).sort(), ['admin@example.com', 'cal@example.com']);
    assert.match(sent.find(m => m.to === 'cal@example.com').text, /call you/);
  } finally { await new Promise(resolve => server.close(resolve)); }
});
