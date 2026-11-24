const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createServer } = require('../server');

async function start() {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bbs-tickets-'));
  const sent = [];
  const server = createServer({ dataDir, siteUrl: 'http://localhost', adminEmails: ['admin@example.com'], notifyEmail: '', mailer: async m => { sent.push(m); }, gcal: { enabled: false, sync: async () => null, remove: async () => null }, receiver: null });
  await new Promise(resolve => server.listen(0, resolve));
  const base = `http://localhost:${server.address().port}`;
  const jar = {};
  const call = async (who, method, url, body, headers = {}) => {
    const isBin = Buffer.isBuffer(body);
    const res = await fetch(base + url, { method, headers: { ...(body && !isBin ? { 'Content-Type': 'application/json' } : {}), ...(jar[who] ? { Cookie: jar[who] } : {}), ...headers }, body: body ? (isBin ? body : JSON.stringify(body)) : undefined });
    const set = res.headers.get('set-cookie');
    if (set) jar[who] = set.split(';')[0];
    const type = res.headers.get('content-type') || '';
    return { res, data: type.includes('json') ? await res.json() : Buffer.from(await res.arrayBuffer()) };
  };
  const signUp = async (who, email) => {
    await call(who, 'POST', '/api/auth/register', { name: who, email, password: 'correct-horse-1', consent: true });
    const link = sent.filter(m => m.to === email).map(m => (m.text || m.html || '')).join('\n').match(/token=([\w-]+)/);
    await call(who, 'POST', '/api/auth/verify', { token: link[1] });
    await call(who, 'POST', '/api/auth/login', { email, password: 'correct-horse-1' });
  };
  return { server, call, signUp, dataDir, close: () => { server.close(); fs.rmSync(dataDir, { recursive: true, force: true }); } };
}

test('tickets accept videos, serve ranges, track priority and show appointments', async () => {
  const t = await start();
  try {
    await t.signUp('cust', 'cust@example.com');
    await t.signUp('admin', 'admin@example.com');
    const created = await t.call('cust', 'POST', '/api/requests', { title: 'Tub to shower', projectType: 'Tub to shower', location: 'Bergen', description: 'Replace the old tub please.', category: 'Existing damage or leaks' });
    assert.equal(created.res.status, 201);
    const id = created.data.id;
    assert.equal((await t.call('cust', 'POST', '/api/requests', { title: 'x', projectType: 'x', location: 'x', description: 'long enough text', category: 'Nope' })).res.status, 400);

    const mp4 = Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from('ftypisom'), Buffer.alloc(200, 1)]);
    const up = await t.call('cust', 'POST', `/api/requests/${id}/photos`, mp4, { 'X-Filename': 'tour.mp4', 'X-Caption': 'Walkthrough' });
    assert.equal(up.res.status, 201);
    assert.equal((await t.call('cust', 'POST', `/api/requests/${id}/photos`, Buffer.alloc(300, 7))).res.status, 415);

    const range = await t.call('cust', 'GET', `/api/photos/${up.data.id}`, null, { Range: 'bytes=0-9' });
    assert.equal(range.res.status, 206);
    assert.equal(range.res.headers.get('content-type'), 'video/mp4');
    assert.equal(range.data.length, 10);

    await t.call('cust', 'POST', `/api/requests/${id}/submit`, {});
    const detail = await t.call('cust', 'GET', `/api/requests/${id}`);
    assert.equal(detail.data.request.photos[0].kind, 'video');
    assert.equal(detail.data.request.category, 'Existing damage or leaks');
    assert.deepEqual(detail.data.request.appointments, []);

    assert.equal((await t.call('cust', 'POST', `/api/requests/${id}/priority`, { priority: 'urgent' })).res.status, 404);
    assert.equal((await t.call('admin', 'POST', `/api/requests/${id}/priority`, { priority: 'urgent' })).res.status, 200);
    const list = await t.call('admin', 'GET', '/api/admin/requests');
    assert.equal(list.data.requests[0].priority, 'urgent');
    assert.equal(list.data.requests[0].nextAppointment, null);
  } finally { t.close(); }
});
