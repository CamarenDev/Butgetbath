const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

process.env.HOLIDAY_MAIL_PAUSE_MS = '0';
process.env.HOLIDAY_AUTOMATION = 'off';
const { createServer } = require('../server');
const { HOLIDAYS } = require('../lib/company');

test('holiday dates are computed correctly', () => {
  const on = (key, y) => HOLIDAYS.find(h => h.key === key).date(y);
  assert.equal(on('thanksgiving', 2026), '2026-11-26');
  assert.equal(on('black-friday', 2026), '2026-11-27');
  assert.equal(on('cyber-monday', 2026), '2026-11-30');
  assert.equal(on('easter', 2026), '2026-04-05');
  assert.equal(on('memorial-day', 2026), '2026-05-25');
  assert.equal(on('labor-day', 2026), '2026-09-07');
  assert.equal(on('mothers-day', 2026), '2026-05-10');
  assert.equal(on('hanukkah', 2025), '2025-12-14');
});

test('company stats, visitor heatmap and automatic holiday emails', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bbs-co-'));
  const sent = [];
  let outboundAvailable = true;
  const server = createServer({ dataDir, siteUrl: 'http://localhost', adminEmails: ['admin@example.com'], notifyEmail: '', mailer: async m => {
    if (!outboundAvailable) return { ok: false, skipped: true, error: 'Provider disabled', capability: { state: 'disabled', reason: 'Provider disabled', retryable: false } };
    sent.push(m);
  }, gcal: { enabled: false, sync: async () => null, remove: async () => null }, receiver: null });
  await new Promise(resolve => server.listen(0, resolve));
  const base = `http://localhost:${server.address().port}`;
  const jar = {};
  const call = async (who, method, url, body) => {
    const res = await fetch(base + url, { method, headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(jar[who] ? { Cookie: jar[who] } : {}) }, body: body ? JSON.stringify(body) : undefined });
    const set = res.headers.get('set-cookie');
    if (set) jar[who] = set.split(';')[0];
    return { res, data: (res.headers.get('content-type') || '').includes('json') ? await res.json() : null };
  };
  const token = to => sent.filter(m => m.to === to).at(-1).text.match(/token=([\w-]+)/)[1];
  try {
    await call('admin', 'POST', '/api/auth/register', { name: 'Admin', email: 'admin@example.com', password: 'correct-horse-1', consent: true });
    await call('admin', 'POST', '/api/auth/verify', { token: token('admin@example.com') });
    await call('admin', 'POST', '/api/auth/login', { email: 'admin@example.com', password: 'correct-horse-1' });
    assert.equal((await call('anon', 'GET', '/api/admin/company')).res.status, 401);

    const db = new DatabaseSync(path.join(dataDir, 'app.db'));
    const now = Date.now(), day = new Date(now).toISOString().slice(0, 10);
    for (let i = 0; i < 5; i++) db.prepare('INSERT INTO visits (ts, day, path, visitor, referrer, device, browser, os) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(now - i * 1000, day, i % 2 ? '/services/' : '/', `v${i % 2}`, 'google.com', 'mobile', 'Safari', 'iOS');
    const stamp = new Date().toISOString();
    for (const [n, e, o] of [['Ann Lee', 'ann@example.com', 0], ['Bob Roe', 'bob@example.com', 0], ['Cy Out', 'cy@example.com', 1], ['No Mail', '', 0]]) db.prepare('INSERT INTO customers (name, email, marketing_optout, created_at, updated_at) VALUES (?, ?, ?, ?, ?)').run(n, e, o, stamp, stamp);
    db.close();

    const co = (await call('admin', 'GET', '/api/admin/company')).data;
    assert.equal(co.trend.length, 12);
    assert.equal(co.people.customers, 4);
    assert.equal(co.people.marketable, 2);
    const vi = (await call('admin', 'GET', '/api/admin/visitors/insights?days=7')).data;
    assert.equal(vi.views, 5);
    assert.equal(vi.sessions, 2);
    assert.equal(vi.heat.flat().reduce((a, b) => a + b, 0), 5);
    assert.equal(vi.browsers[0].name, 'Safari');

    const hol = (await call('admin', 'GET', '/api/admin/holidays')).data;
    assert.equal(hol.audience.eligible, 2);
    assert.ok(hol.holidays.length >= 10);
    assert.equal(hol.metadata.verified, false);
    assert.equal(hol.holidays[0].defaultsMetadata.source, 'bundled application defaults');
    const bf = hol.holidays.find(h => h.key === 'black-friday');
    assert.equal(bf.sale, true);
    assert.equal((await call('admin', 'POST', '/api/admin/holidays/black-friday', { enabled: true, sale: true, pct: 0, lead: 3, tail: 3, code: 'BF' })).res.status, 400);
    assert.equal((await call('admin', 'POST', '/api/admin/holidays/black-friday', { enabled: true, sale: true, pct: 20, lead: 3, tail: 3, code: 'BLACKFRIDAY', subject: '', message: 'Thanks for trusting us.' })).res.status, 200);
    const pre = (await call('admin', 'POST', '/api/admin/holidays/black-friday/preview', {})).data;
    assert.match(pre.subject, /Happy Thanksgiving.*20% off/);
    assert.match(pre.text, /Thanks for trusting us/);

    sent.length = 0;
    const send = await call('admin', 'POST', '/api/admin/holidays/christmas/send-now', {});
    assert.equal(send.res.status, 202);
    await server.company.runDue(Date.now());
    for (let i = 0; i < 50 && sent.filter(m => /Merry Christmas/.test(m.subject)).length < 2; i++) await new Promise(r => setTimeout(r, 20));
    const mails = sent.filter(m => /Merry Christmas/.test(m.subject));
    assert.deepEqual(mails.map(m => m.to).sort(), ['ann@example.com', 'bob@example.com']);
    assert.match(mails[0].html, /Merry Christmas, (Ann|Bob)!/);
    assert.match(mails[0].text, /Unsubscribe: http:\/\/localhost\/api\/unsubscribe\?e=/);
    assert.ok(mails[0].headers['List-Unsubscribe'].startsWith('<http://localhost/api/unsubscribe'));
    assert.equal((await call('admin', 'POST', '/api/admin/holidays/christmas/send-now', {})).res.status, 409);

    const code = (await call('admin', 'GET', `/api/admin/holidays/code?code=${hol.holidays.find(h => h.key === 'christmas').next.code.toLowerCase()}`)).data;
    assert.equal(code.valid, true);
    assert.equal(code.pct, 10);

    // One-click unsubscribe, with a bad token rejected.
    const link = mails.find(m => m.to === 'ann@example.com').headers['List-Unsubscribe'].slice(1, -1).replace('http://localhost', base);
    assert.equal((await fetch(link.replace(/t=\w+/, 't=' + 'a'.repeat(32)), { method: 'POST' })).status, 400);
    assert.equal((await fetch(link)).status, 200);
    assert.equal((await fetch(link, { method: 'POST' })).status, 200);
    assert.equal((await call('admin', 'GET', '/api/admin/holidays')).data.audience.eligible, 1);

    outboundAvailable = false;
    const disabled = await call('admin', 'POST', '/api/admin/holidays/new-years/send-now', {});
    assert.equal(disabled.res.status, 202);
    for (let i = 0; i < 50; i++) {
      const c = (await call('admin', 'GET', '/api/admin/holidays')).data.campaigns.find(x => x.id === disabled.data.id);
      if (c?.status === 'done') break;
      await new Promise(r => setTimeout(r, 10));
    }
    const failedCampaign = (await call('admin', 'GET', '/api/admin/holidays')).data.campaigns.find(x => x.id === disabled.data.id);
    assert.equal(failedCampaign.sent, 0);
    assert.equal(failedCampaign.failed, 1);
    const testEmail = await call('admin', 'POST', '/api/admin/holidays/new-years/test', {});
    assert.equal(testEmail.res.status, 503);
    assert.equal(testEmail.data.ok, false);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});
