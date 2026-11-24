const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createServer } = require('../server');

test('admin customer accounts: records, files, history and email', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bbs-customers-'));
  const sent = [];
  const server = createServer({ dataDir, siteUrl: 'http://localhost', adminEmails: ['admin@example.com'], notifyEmail: '', mailer: async m => { sent.push(m); }, gcal: { enabled: false, sync: async () => null, remove: async () => null }, receiver: null });
  await new Promise(resolve => server.listen(0, resolve));
  const base = `http://localhost:${server.address().port}`;
  let cookie = '';
  const call = async (method, url, body, headers = {}) => {
    const bin = Buffer.isBuffer(body);
    const res = await fetch(base + url, { method, headers: { ...(body && !bin ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { Cookie: cookie } : {}), ...headers }, body: body ? (bin ? body : JSON.stringify(body)) : undefined });
    const set = res.headers.get('set-cookie');
    if (set) cookie = set.split(';')[0];
    const type = res.headers.get('content-type') || '';
    return { res, data: type.includes('json') ? await res.json() : Buffer.from(await res.arrayBuffer()) };
  };
  try {
    assert.equal((await call('GET', '/api/admin/customers')).res.status, 401);
    await call('POST', '/api/auth/register', { name: 'Admin', email: 'admin@example.com', password: 'correct-horse-1', consent: true });
    await call('POST', '/api/auth/verify', { token: sent.at(-1).text.match(/token=([\w-]+)/)[1] });
    await call('POST', '/api/auth/login', { email: 'admin@example.com', password: 'correct-horse-1' });

    assert.equal((await call('POST', '/api/admin/customers', { name: 'Pat', email: 'bad' })).res.status, 400);
    const created = await call('POST', '/api/admin/customers', { name: 'Pat Smith', email: 'pat@example.com', phone: '555', address: '1 Main St' });
    assert.equal(created.res.status, 201);
    const id = created.data.id;
    assert.equal((await call('POST', '/api/admin/customers', { name: 'Dup', email: 'PAT@example.com' })).res.status, 409);

    const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(40, 1)]);
    const up = await call('POST', `/api/admin/customers/${id}/files`, png, { 'X-Filename': 'bath.png', 'X-Category': 'photo' });
    assert.equal(up.res.status, 201);
    assert.equal((await call('POST', `/api/admin/customers/${id}/files`, Buffer.alloc(60, 7), { 'X-Category': 'receipt' })).res.status, 415);
    const file = await call('GET', `/api/admin/customer-files/${up.data.id}`);
    assert.equal(file.res.headers.get('content-type'), 'image/png');

    assert.equal((await call('POST', `/api/admin/customers/${id}/entries`, { kind: 'call', body: 'Discussed tile.' })).res.status, 201);
    const mailed = await call('POST', `/api/admin/customers/${id}/email`, { subject: 'Your quote', body: 'Hello there', fileIds: [up.data.id] });
    assert.equal(mailed.res.status, 201);
    assert.equal(sent.at(-1).to, 'pat@example.com');
    assert.equal(sent.at(-1).attachments[0].filename, 'bath.png');
    assert.equal(Buffer.from(sent.at(-1).attachments[0].content, 'base64').equals(png), true);
    assert.equal((await call('POST', `/api/admin/customers/${id}/email`, { subject: 'x', body: 'y', fileIds: ['0'.repeat(32)] })).res.status, 400);

    // Customer portal: only shared items, only for the matching verified account.
    const adminCookie = cookie;
    cookie = '';
    await call('POST', '/api/auth/register', { name: 'Pat', email: 'pat@example.com', password: 'correct-horse-1', consent: true });
    await call('POST', '/api/auth/verify', { token: sent.at(-1).text.match(/token=([\w-]+)/)[1] });
    await call('POST', '/api/auth/login', { email: 'pat@example.com', password: 'correct-horse-1' });
    assert.equal((await call('GET', '/api/admin/customers')).res.status, 403);
    assert.equal((await call('GET', '/api/account/documents')).data.files.length, 0);
    assert.equal((await call('GET', `/api/account/documents/${up.data.id}`)).res.status, 404);
    const patCookie = cookie;
    cookie = adminCookie;
    assert.equal((await call('POST', `/api/admin/customer-files/${up.data.id}/share`, { shared: true })).res.status, 200);
    cookie = patCookie;
    const mine = (await call('GET', '/api/account/documents')).data;
    assert.equal(mine.files.length, 1);
    assert.equal(mine.entries.length, 1);
    assert.equal((await call('GET', `/api/account/documents/${up.data.id}`)).res.status, 200);
    cookie = adminCookie;

    const detail = (await call('GET', `/api/admin/customers/${id}`)).data;
    assert.equal(detail.files.length, 1);
    assert.deepEqual(detail.entries.map(e => e.kind), ['email', 'call']);
    assert.equal(detail.entries.find(e => e.kind === 'call').shared, false);
    assert.equal((await call('GET', '/api/admin/customers?q=smith')).data.customers.length, 1);

    assert.equal((await call('POST', `/api/admin/customers/${id}/delete`, {})).res.status, 200);
    assert.equal((await call('GET', `/api/admin/customer-files/${up.data.id}`)).res.status, 404);
  } finally { server.close(); fs.rmSync(dataDir, { recursive: true, force: true }); }
});
