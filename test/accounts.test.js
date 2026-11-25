const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { createServer } = require('../server');
const { openDb } = require('../lib/db');
const { createAccounts } = require('../scripts/create-accounts');

test('installer accounts get temporary passwords that must be changed at first sign-in', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bbs-accounts-'));
  const db = openDb(dataDir);
  const first = await createAccounts(db, [{ email: 'Admin@Example.com', name: 'Administrator', role: 'admin' }, { email: 'dev@example.com', name: 'Developer', role: 'developer' }]);
  assert.equal(first.created.length, 2);
  assert.notEqual(first.created[0].password, first.created[1].password);
  const again = await createAccounts(db, [{ email: 'admin@example.com', name: 'Administrator', role: 'admin' }]);
  assert.equal(again.created.length, 0);
  assert.equal(again.existing.length, 1);
  db.close();

  const server = createServer({ dataDir, siteUrl: 'http://localhost', adminEmails: ['admin@example.com', 'dev@example.com'], mailer: async () => {} });
  await new Promise(resolve => server.listen(0, resolve));
  const base = `http://localhost:${server.address().port}`;
  const post = (url, body, cookie) => fetch(base + url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(cookie && { Cookie: cookie }) }, body: JSON.stringify(body) });
  try {
    const temp = first.created[0].password;
    const login = await post('/api/auth/login', { email: 'admin@example.com', password: temp });
    assert.equal(login.status, 200);
    const cookie = login.headers.get('set-cookie').split(';')[0];
    const { user } = await login.json();
    assert.equal(user.mustChangePassword, true);
    assert.equal(user.admin, true);
    assert.equal((await post('/api/auth/change-password', { current: 'wrong-password', password: 'a-brand-new-pass' }, cookie)).status, 400);
    assert.equal((await post('/api/auth/change-password', { current: temp, password: 'a-brand-new-pass' }, cookie)).status, 200);
    const me = await (await fetch(base + '/api/auth/me', { headers: { Cookie: cookie } })).json();
    assert.equal(me.user.mustChangePassword, false);
    assert.equal((await (await fetch(base + '/api/provisioning', { headers: { Cookie: cookie } })).json()).provisioning.state, 'admin');
    assert.equal((await post('/api/auth/login', { email: 'admin@example.com', password: temp })).status, 401);
  } finally { server.close(); fs.rmSync(dataDir, { recursive: true, force: true }); }
});

test('registration confirms immediately when no email provider is configured', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bbs-noemail-'));
  const mailer = async () => {};
  mailer.configured = false;
  const server = createServer({ dataDir, siteUrl: 'http://localhost', mailer });
  await new Promise(resolve => server.listen(0, resolve));
  const base = `http://localhost:${server.address().port}`;
  try {
    const res = await fetch(base + '/api/auth/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'Pat', email: 'pat@example.com', password: 'correct-horse-1', consent: true }) });
    assert.equal(res.status, 201);
    const login = await fetch(base + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'pat@example.com', password: 'correct-horse-1' }) });
    assert.equal((await login.json()).user.verified, true);
  } finally { server.close(); fs.rmSync(dataDir, { recursive: true, force: true }); }
});

test('expired and duplicate account tokens transition provisioning safely', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bbs-account-tokens-'));
  const sent = [];
  const server = createServer({ dataDir, siteUrl: 'http://localhost', mailer: async message => sent.push(message) });
  await new Promise(resolve => server.listen(0, resolve));
  const base = `http://localhost:${server.address().port}`;
  const post = (url, body, cookie) => fetch(base + url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(cookie && { Cookie: cookie }) }, body: JSON.stringify(body) });
  const lastToken = to => sent.filter(m => m.to === to).at(-1).text.match(/token=([\w-]+)/)[1];
  const expire = token => {
    const db = openDb(dataDir);
    db.prepare('UPDATE tokens SET expires_at = 0 WHERE token_hash = ?').run(crypto.createHash('sha256').update(token).digest('hex'));
    db.close();
  };
  try {
    assert.equal((await post('/api/auth/register', { name: 'Pat', email: 'pat@example.com', password: 'correct-horse-1', consent: true })).status, 201);
    const login = await post('/api/auth/login', { email: 'pat@example.com', password: 'correct-horse-1' });
    const cookie = login.headers.get('set-cookie').split(';')[0];
    assert.equal((await (await fetch(base + '/api/provisioning', { headers: { Cookie: cookie } })).json()).provisioning.state, 'invited');

    const verify = lastToken('pat@example.com');
    expire(verify);
    assert.equal((await post('/api/auth/verify', { token: verify })).status, 400);

    await post('/api/auth/forgot', { email: 'pat@example.com' });
    const expiredReset = lastToken('pat@example.com');
    expire(expiredReset);
    assert.equal((await post('/api/auth/reset', { token: expiredReset, password: 'replacement-password' })).status, 400);

    await post('/api/auth/forgot', { email: 'pat@example.com' });
    const reset = lastToken('pat@example.com');
    const resets = await Promise.all([
      post('/api/auth/reset', { token: reset, password: 'replacement-password' }),
      post('/api/auth/reset', { token: reset, password: 'replacement-password' })
    ]);
    assert.deepEqual(resets.map(r => r.status).sort(), [200, 400]);
    const verifiedLogin = await post('/api/auth/login', { email: 'pat@example.com', password: 'replacement-password' });
    const verifiedCookie = verifiedLogin.headers.get('set-cookie').split(';')[0];
    assert.equal((await (await fetch(base + '/api/provisioning', { headers: { Cookie: verifiedCookie } })).json()).provisioning.state, 'verified');
  } finally {
    server.close();
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
});
