const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createServer } = require('../server');
const skills = require('../lib/skill-tests');

test('every trade bank has 15 well-formed bilingual questions', () => {
  assert.equal(skills.TRADE_LIST.length, 8);
  for (const [trade, bank] of Object.entries(skills.BANKS)) {
    assert.equal(bank.length, 15, trade);
    for (const row of bank) {
      assert.equal(row.length, 6, `${trade}: ${row[0]}`);
      assert.ok(row[0] && row[1], `${trade} question text`);
      for (const o of row.slice(2)) assert.ok(o[0] && o[1], `${trade} option text`);
      assert.equal(new Set(row.slice(2).map(o => o[0])).size, 4, `${trade} duplicate options`);
    }
  }
});

test('hiring skills test: emailed token, shuffled hidden answers, server grading, one attempt', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bbs-skills-'));
  const sent = [];
  const server = createServer({ dataDir, siteUrl: 'http://localhost', adminEmails: ['admin@example.com'], notifyEmail: 'office@example.com', mailer: async m => { sent.push(m); }, gcal: { enabled: false, sync: async () => null, remove: async () => null }, receiver: null });
  await new Promise(resolve => server.listen(0, resolve));
  const base = `http://localhost:${server.address().port}`;
  const jar = {};
  const call = async (who, method, url, body) => {
    const res = await fetch(base + url, { method, headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(jar[who] ? { Cookie: jar[who] } : {}) }, body: body ? JSON.stringify(body) : undefined });
    const set = res.headers.get('set-cookie');
    if (set) jar[who] = set.split(';')[0];
    return { res, data: (res.headers.get('content-type') || '').includes('json') ? await res.json() : null };
  };
  try {
    const applied = await call('web', 'POST', '/api/applications', { name: 'Pat Plumber', email: 'pat@example.com', phone: '630-555-0100', city: 'Aurora', trades: ['Plumber'], experience: 'Ten years of service work.', over18: 'yes', consent: true, lang: 'es' });
    assert.equal(applied.res.status, 201);
    const token = applied.data.testToken;
    assert.ok(sent.some(m => m.to === 'pat@example.com' && m.text.includes(`/handyman-application/test/?token=${token}`)));

    assert.equal((await call('web', 'GET', '/api/applications/test?token=nope-nope-nope-nope-nope')).res.status, 404);
    const menu = (await call('web', 'GET', `/api/applications/test?token=${token}`)).data;
    assert.deepEqual(menu.trades.map(t => t.trade), ['Plumber']);
    assert.equal((await call('web', 'GET', `/api/applications/test?token=${token}&trade=Electrician`)).res.status, 400);

    const t = (await call('web', 'GET', `/api/applications/test?token=${token}&trade=Plumber&lang=es`)).data;
    assert.equal(t.questions.length, 15);
    assert.ok(t.questions.every(x => x.o.length === 4 && x.o.every(o => typeof o === 'string')), 'options are plain strings with no answer markers');
    assert.ok(!JSON.stringify(t).includes('"i":'));
    const again = (await call('web', 'GET', `/api/applications/test?token=${token}&trade=Plumber`)).data;
    assert.deepEqual(again.questions, t.questions, 'resuming keeps the same order and language');

    // Work out the correct displayed position per question by matching the Spanish text in the bank.
    const bank = skills.BANKS.Plumber, answers = {};
    for (const x of t.questions) answers[x.id] = x.o.indexOf(bank[x.id][2][1]);
    assert.ok(Object.values(answers).every(v => v >= 0));
    for (const id of [0, 1, 2, 3]) answers[id] = (answers[id] + 1) % 4;
    assert.equal((await call('web', 'POST', '/api/applications/test', { token, trade: 'Plumber', answers: [] })).res.status, 400);
    assert.equal((await call('web', 'POST', '/api/applications/test', { token, trade: 'Plumber', answers: { ...answers, unknown: 2 } })).res.status, 400);
    assert.equal((await call('web', 'POST', '/api/applications/test', { token, trade: 'Plumber', answers: { 0: 99 } })).res.status, 400);
    const submissions = await Promise.all([
      call('web', 'POST', '/api/applications/test', { token, trade: 'Plumber', answers, attemptId: t.attemptId }),
      call('web', 'POST', '/api/applications/test', { token, trade: 'Plumber', answers, attemptId: t.attemptId })
    ]);
    assert.deepEqual(submissions.map(x => x.res.status).sort(), [200, 409]);
    assert.equal((await call('web', 'POST', '/api/applications/test', { token, trade: 'Plumber', answers })).res.status, 409);
    assert.equal((await call('web', 'GET', `/api/applications/test?token=${token}&trade=Plumber`)).res.status, 409);

    await call('admin', 'POST', '/api/auth/register', { name: 'Admin', email: 'admin@example.com', password: 'correct-horse-1', consent: true });
    await call('admin', 'POST', '/api/auth/verify', { token: sent.filter(m => m.to === 'admin@example.com').at(-1).text.match(/token=([\w-]+)/)[1] });
    await call('admin', 'POST', '/api/auth/login', { email: 'admin@example.com', password: 'correct-horse-1' });
    assert.equal((await call('admin', 'GET', '/api/auth/me')).data.user.lang, 'en');
    assert.equal((await call('admin', 'POST', '/api/auth/preferences', { lang: 'es' })).data.lang, 'es');
    assert.equal((await call('admin', 'POST', '/api/auth/preferences', { lang: 'fr' })).data.lang, 'es');
    const me = (await call('admin', 'GET', '/api/auth/me')).data.user;
    assert.equal(me.lang, 'es');
    assert.equal(me.notifyEmail, true, 'a language change must not touch email preferences');
    const apps = (await call('admin', 'GET', '/api/admin/applications')).data.applications;
    const result = apps[0].tests[0];
    assert.equal(result.score, 11);
    assert.equal(result.passed, true);
    const detail = (await call('admin', 'GET', `/api/admin/applications/${apps[0].id}/test/Plumber`)).data;
    assert.equal(detail.missed.length, 4);
    assert.equal((await call('admin', 'POST', `/api/admin/applications/${apps[0].id}/test/Plumber`, {})).res.status, 200);
    assert.equal((await call('web', 'GET', `/api/applications/test?token=${token}&trade=Plumber`)).res.status, 200);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});

test('account emails switch to Spanish only when asked', () => {
  const t = require('../lib/emails').createTemplates('http://localhost');
  const args = { name: 'Ana', url: 'http://localhost/x', loginUrl: 'http://localhost/l', dashboardUrl: 'http://localhost/d' };
  assert.equal(t.verifyEmail(args).subject, 'Confirm your email address');
  assert.equal(t.verifyEmail({ ...args, lang: 'es' }).subject, 'Confirme su correo electrónico');
  assert.match(t.passwordReset({ ...args, lang: 'es' }).text, /Restablezca su contraseña/);
  assert.equal(t.welcome({ ...args, lang: 'fr' }).subject, 'Your account is ready');
});
