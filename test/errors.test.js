const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createServer } = require('../server');
const { openDb } = require('../lib/db');
const { createAccounts } = require('../scripts/create-accounts');

test('error log: records browser and server errors, hides secrets and is admin-only', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bbs-errors-'));
  const db = openDb(dataDir);
  const { created } = await createAccounts(db, [{ email: 'admin@example.com', name: 'Administrator', role: 'admin' }]);
  db.close();
  const server = createServer({ dataDir, siteUrl: 'http://localhost', adminEmails: ['admin@example.com'], mailer: async () => {} });
  await new Promise(resolve => server.listen(0, resolve));
  const base = `http://localhost:${server.address().port}`;
  const post = (url, body, cookie) => fetch(base + url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(cookie && { Cookie: cookie }) }, body: JSON.stringify(body) });
  try {
    const report = await post('/api/client-error', { kind: 'js_error', message: 'x is not a function', stack: 'TypeError\n    at foo (app.js:1:1)', url: 'http://localhost/reset?token=abc123secret', context: { line: 4, trail: ['click: a'] } });
    assert.equal(report.status, 202);
    assert.equal((await post('/api/client-error', { nope: true })).status, 400);
    const id = server.errors.record({ source: 'server', kind: 'request_failed', error: new Error('boom'), url: '/api/x?password=hunter2', method: 'POST', status: 500 });
    assert.ok(id > 0);
    assert.equal((await fetch(base + '/api/admin/errors')).status, 401);

    const login = await post('/api/auth/login', { email: 'admin@example.com', password: created[0].password });
    const cookie = login.headers.get('set-cookie').split(';')[0];
    await post('/api/auth/change-password', { current: created[0].password, password: 'a-brand-new-pass' }, cookie);
    const data = await (await fetch(base + '/api/admin/errors?days=1', { headers: { Cookie: cookie } })).json();
    assert.equal(data.errors.length, 2);
    const text = JSON.stringify(data);
    assert.ok(!text.includes('abc123secret') && !text.includes('hunter2'));
    const browser = data.errors.find(e => e.source === 'browser');
    assert.equal(browser.context.line, '4');
    assert.match(data.errors.find(e => e.source === 'server').stack, /boom/);
    assert.equal(data.summary.open, 2);
    assert.equal((await post(`/api/admin/errors/${id}/resolve`, {}, cookie)).status, 200);
    assert.equal((await (await fetch(base + '/api/admin/errors?days=1', { headers: { Cookie: cookie } })).json()).errors.length, 1);
  } finally { server.close(); fs.rmSync(dataDir, { recursive: true, force: true }); }
});
