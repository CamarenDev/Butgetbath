const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createServer } = require('../server');
const training = require('../lib/training');

test('training banks are well formed with four distinct options', () => {
  for (const [key, bank] of [...training.MODULES.map(m => [m.key, m.quiz]), ['final', training.FINAL]]) {
    assert.ok(bank.length >= 5, key);
    for (const row of bank) { assert.equal(row.length, 5, `${key}: ${row[0]}`); assert.equal(new Set(row.slice(1)).size, 4, `${key}: duplicate options`); }
  }
});

test('onboarding: forms, contract, experience, training, sign-off and gating', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bbs-onboard-'));
  const sent = [];
  const server = createServer({ dataDir, siteUrl: 'http://localhost', adminEmails: ['admin@example.com'], notifyEmail: 'office@example.com', mailer: async m => { sent.push(m); }, gcal: { enabled: false, sync: async () => null, remove: async () => null } });
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
  const hank = (m, u, b) => call('hank', m, `/api/employee/onboarding${u}`, b);
  try {
    await call('admin', 'POST', '/api/auth/register', { name: 'Admin', email: 'admin@example.com', password: 'correct-horse-1', consent: true });
    await call('admin', 'POST', '/api/auth/verify', { token: token('admin@example.com') });
    await call('admin', 'POST', '/api/auth/login', { email: 'admin@example.com', password: 'correct-horse-1' });
    const empId = (await call('admin', 'POST', '/api/admin/employees', { name: 'Hank Handy', email: 'hank@example.com', roleTitle: 'Tile setter', rate: 25 })).data.id;
    await call('hank', 'POST', '/api/auth/reset', { token: token('hank@example.com'), password: 'correct-horse-2' });
    await call('hank', 'POST', '/api/auth/login', { email: 'hank@example.com', password: 'correct-horse-2' });

    // Gated until signed off
    assert.equal((await call('hank', 'GET', '/api/employee/me')).data.onboarding, 'forms');
    assert.equal((await call('hank', 'GET', '/api/employee/jobs')).res.status, 403);
    assert.equal((await call('hank', 'GET', '/api/employee/clock')).res.status, 403);
    assert.equal((await call('hank', 'POST', '/api/employee/clock/in', { consent: true })).res.status, 403);
    assert.equal((await call('anon', 'GET', '/api/employee/onboarding')).res.status, 401);
    assert.equal((await call('hank', 'GET', '/api/admin/onboarding')).res.status, 403);

    // Forms must come in order and be complete
    assert.equal((await hank('POST', '/contract', { signName: 'Hank Handy', agree: true, locationConsent: true })).res.status, 409);
    assert.equal((await hank('POST', '/personal', { address: '1 Main St' })).res.status, 400);
    const personal = { address: '12 Oak St', city: 'Aurora', state: 'IL', zip: '60505', phone: '630-555-0100', emergencyName: 'Jo Handy', emergencyPhone: '630-555-0111', emergencyRelation: 'Spouse' };
    assert.equal((await hank('POST', '/personal', personal)).res.status, 200);
    const tax = { ssnLast4: '1234', filingStatus: 'single', multipleJobs: false, credits: 0, i9Status: 'citizen', i9Docs: 'Driver license and Social Security card', depositType: 'checking', depositBank: 'First Bank', depositLast4: '6789', signName: 'Hank Handy', agree: true };
    assert.equal((await hank('POST', '/tax', { ...tax, ssnLast4: '12' })).res.status, 400);
    assert.equal((await hank('POST', '/tax', { ...tax, agree: false })).res.status, 400);
    assert.equal((await hank('POST', '/tax', tax)).res.status, 200);
    assert.equal((await hank('POST', '/contract', { signName: 'Hank Handy', agree: true, locationConsent: false })).res.status, 400);
    const signed = await hank('POST', '/contract', { signName: 'Hank Handy', agree: true, locationConsent: true });
    assert.equal(signed.data.stage, 'experience');
    assert.equal((await hank('POST', '/contract', { signName: 'Hank Handy', agree: true, locationConsent: true })).res.status, 409);
    assert.equal((await hank('GET', '/training/conduct')).res.status, 404, 'training waits for the experience profile');

    // Experience profile must rate every task
    const tasks = Object.fromEntries(training.TASKS.map(([k]) => [k, 0]));
    tasks['tile-wall'] = 3; tasks.demolition = 2;
    assert.equal((await hank('POST', '/experience', { tasks: { demolition: 1 }, trades: [] })).res.status, 400);
    const exp = await hank('POST', '/experience', { tasks, trades: [{ name: 'Tile setter', years: 8, level: 3 }, { name: 'Astronaut', years: 2, level: 2 }], toolsOwned: 'Wet saw', ownVehicle: true });
    assert.equal(exp.res.status, 200);
    assert.equal(exp.data.stage, 'training');
    assert.deepEqual(exp.data.experience.trades.map(t => t.name), ['Tile setter']);
    assert.ok(exp.data.training.startedAt);

    // Day gating: with a 3-day program, day 2 content is locked
    const state = (await hank('GET', '')).data;
    assert.equal(state.training.modules.find(m => m.key === 'conduct').locked, true);
    assert.equal((await hank('GET', '/training/conduct')).res.status, 403);
    assert.equal((await hank('GET', '/training/final')).res.status, 403);
    assert.equal((await call('admin', 'POST', `/api/admin/onboarding/${empId}/days`, { days: 5 })).res.status, 400);
    assert.equal((await call('admin', 'POST', `/api/admin/onboarding/${empId}/days`, { days: 1 })).res.status, 200);

    // Quizzes: answers never leave the server; failing then passing
    const lesson = (await hank('GET', '/training/clock-gps')).data;
    assert.ok(lesson.lessons.length >= 3 && lesson.questions.length === 5);
    assert.ok(!JSON.stringify(lesson).includes('"correct"'));
    const answerFor = (key, qs, attempt, right = true) => {
      const ordered = training.questions(key, empId, attempt), out = {};
      for (const x of qs) { const o = ordered[x.id].o, correct = o.findIndex(v => v.i === 0); out[x.id] = right ? correct : (correct + 1) % 4; }
      return out;
    };
    const failed = (await hank('POST', '/training/clock-gps', { answers: answerFor('clock-gps', lesson.questions, 0, false) })).data;
    assert.equal(failed.passed, false);
    assert.ok(failed.missed.length === 5 && failed.missed[0].correct);
    const retry = (await hank('GET', '/training/clock-gps')).data;
    assert.equal(retry.attempts, 1);
    const passed = (await hank('POST', '/training/clock-gps', { answers: answerFor('clock-gps', retry.questions, 1) })).data;
    assert.equal(passed.passed, true);

    for (const mod of training.MODULES.slice(1)) {
      const l = (await hank('GET', `/training/${mod.key}`)).data;
      assert.equal((await hank('POST', `/training/${mod.key}`, { answers: answerFor(mod.key, l.questions, 0) })).data.passed, true, mod.key);
    }
    assert.equal((await hank('GET', '')).data.stage, 'training');

    // Final exam: three attempts, correct answers never revealed
    const final = (await hank('GET', '/training/final')).data;
    assert.equal(final.questions.length, training.FINAL.length);
    const wrong = (await hank('POST', '/training/final', { answers: answerFor('final', final.questions, 0, false) })).data;
    assert.equal(wrong.passed, false);
    assert.equal(wrong.attemptsLeft, 2);
    assert.ok(wrong.missed.every(x => x.correct === undefined));
    const final2 = (await hank('GET', '/training/final')).data;
    const ok = (await hank('POST', '/training/final', { answers: answerFor('final', final2.questions, 1) })).data;
    assert.equal(ok.passed, true);
    assert.equal(ok.stage, 'review');
    assert.ok(sent.some(m => m.to === 'office@example.com' && /finished new-hire training/.test(m.subject)));

    // Still locked until the office signs off
    assert.equal((await call('hank', 'GET', '/api/employee/jobs')).res.status, 403);
    const detail = (await call('admin', 'GET', `/api/admin/onboarding/${empId}`)).data;
    assert.equal(detail.summary.stage, 'review');
    assert.deepEqual(detail.signatures.map(s => s.kind), ['w4', 'i9-section1', 'contract', 'location-consent']);
    assert.ok(detail.signatures.every(s => s.hash.length === 64 && s.name === 'Hank Handy'));
    assert.equal(detail.row.tax.ssnLast4, '1234');
    assert.equal(detail.row.deposit.last4, '6789');
    assert.equal(detail.experience.tasks['tile-wall'], 3);

    const signoff = await call('admin', 'POST', `/api/admin/onboarding/${empId}/signoff`, { note: 'Great scores' });
    assert.equal(signoff.res.status, 200);
    assert.equal((await call('hank', 'GET', '/api/employee/me')).data.onboarding, '');
    assert.equal((await call('hank', 'GET', '/api/employee/jobs')).res.status, 200);
    assert.equal((await call('hank', 'GET', '/api/employee/clock')).res.status, 200);
    assert.ok(sent.some(m => m.to === 'hank@example.com' && /Onboarding complete/.test(m.subject)));

    // The signed contract and tax dates reach the existing HR records
    const record = (await call('admin', 'GET', `/api/admin/employees/${empId}`)).data;
    assert.ok(record.contracts.some(c => c.status === 'signed' && c.signedName === 'Hank Handy'));

    // Admin can match crew by experience and reset a module
    const match = (await call('admin', 'GET', '/api/admin/onboarding/match?task=tile-wall')).data;
    assert.equal(match.people[0].name, 'Hank Handy');
    assert.equal(match.people[0].level, 3);
    assert.equal((await call('admin', 'GET', '/api/admin/onboarding/match?task=nope')).res.status, 400);
    assert.equal((await call('admin', 'POST', `/api/admin/onboarding/${empId}/reset`, { module: 'bogus' })).res.status, 400);
    assert.equal((await call('admin', 'POST', `/api/admin/onboarding/${empId}/verify-i9`, { docs: 'DL + SS card' })).res.status, 200);
    assert.equal((await call('admin', 'GET', '/api/admin/onboarding/config')).data.defaultDays, 3);
    assert.equal((await call('admin', 'POST', '/api/admin/onboarding/config', { contractText: 'short', defaultDays: 2 })).res.status, 400);
  } finally {
    await new Promise(resolve => server.close(resolve));
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
});
