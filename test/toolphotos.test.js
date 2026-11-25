const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createServer } = require('../server');
const { keyOf } = require('../lib/tool-photos');
const { CATALOG } = require('../lib/tools');

test('tool photos: admin uploads, crew see, others blocked, bad files rejected', async () => {
  const sent = [];
  const server = createServer({ dataDir: fs.mkdtempSync(path.join(os.tmpdir(), 'bbs-toolph-')), siteUrl: 'http://localhost', adminEmails: ['admin@example.com'], notifyEmail: '', mailer: async m => { sent.push(m); }, gcal: { enabled: false, sync: async () => {} } });
  await new Promise(resolve => server.listen(0, resolve));
  const base = `http://localhost:${server.address().port}`, jar = {};
  const call = async (who, method, url, body, headers = {}) => {
    const res = await fetch(base + url, { method, headers: { ...(jar[who] ? { Cookie: jar[who] } : {}), ...headers }, body });
    const set = res.headers.get('set-cookie'); if (set) jar[who] = set.split(';')[0];
    return res;
  };
  const jsonCall = (who, method, url, body) => call(who, method, url, body ? JSON.stringify(body) : undefined, body ? { 'Content-Type': 'application/json' } : {}).then(async r => ({ res: r, data: (r.headers.get('content-type') || '').includes('json') ? await r.json() : null }));
  const token = to => sent.filter(m => m.to === to).at(-1).text.match(/token=([\w-]+)/)[1];
  const signUp = async (who, name, email) => {
    await jsonCall(who, 'POST', '/api/auth/register', { name, email, password: 'correct-horse-1', consent: true });
    await jsonCall(who, 'POST', '/api/auth/verify', { token: token(email) });
    await jsonCall(who, 'POST', '/api/auth/login', { email, password: 'correct-horse-1' });
  };
  try {
    await signUp('admin', 'Admin', 'admin@example.com');
    await signUp('cust', 'Cust Omer', 'cust@example.com');
    const tool = CATALOG.find(t => t.name === 'Safety glasses'), key = keyOf(tool.name);
    const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(64)]);
    const octet = { 'Content-Type': 'application/octet-stream', 'X-Credit': encodeURIComponent('Our shop'), 'X-Source-Url': encodeURIComponent('https://example.com/glasses') };

    assert.equal((await call('anon', 'GET', '/api/tools/library')).status, 403);
    assert.equal((await call('cust', 'GET', '/api/tools/library')).status, 403);
    assert.equal((await call('cust', 'POST', `/api/admin/tools/photo/${key}`, png, octet)).status, 403);
    assert.equal((await call('admin', 'POST', '/api/admin/tools/photo/not-a-tool', png, octet)).status, 404);
    assert.equal((await call('admin', 'POST', `/api/admin/tools/photo/${key}`, Buffer.from('<svg onload=alert(1)>'.repeat(5)), octet)).status, 400);
    assert.equal((await call('admin', 'POST', `/api/admin/tools/photo/${key}`, png, { ...octet, 'X-Source-Url': encodeURIComponent('javascript:alert(1)') })).status, 400);

    const saved = await (await call('admin', 'POST', `/api/admin/tools/photo/${key}`, png, octet)).json();
    const row = saved.tools.find(t => t.key === key);
    assert.ok(row.photo && row.credit === 'Our shop' && row.sourceUrl === 'https://example.com/glasses');
    assert.equal(row.sourceMetadata.verified, false);
    assert.equal(row.sourceMetadata.type, 'administrator supplied');
    assert.ok(saved.tools.length === new Set(CATALOG.map(t => keyOf(t.name))).size);

    const img = await call('admin', 'GET', `/api/tools/photo/${key}`);
    assert.equal(img.status, 200);
    assert.equal(img.headers.get('content-type'), 'image/png');
    assert.match(img.headers.get('content-security-policy'), /sandbox/);
    assert.equal((await call('cust', 'GET', `/api/tools/photo/${key}`)).status, 404);
    assert.equal((await call('anon', 'GET', `/api/tools/photo/${key}`)).status, 404);

    await call('admin', 'POST', `/api/admin/tools/photo/${key}/delete`, '{}', { 'Content-Type': 'application/json' });
    assert.equal((await call('admin', 'GET', `/api/tools/photo/${key}`)).status, 404);
  } finally { server.close(); }
});
