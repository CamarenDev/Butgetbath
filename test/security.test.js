const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createServer } = require('../server');

const SITE = { lat: 41.8781, lng: -87.6298 };
const fix = (over = {}) => ({ ...SITE, accuracy: 12, at: Date.now(), ...over });

test('security: lockout, CSRF, fake-GPS jumps, device binding and shared devices', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bbs-sec-'));
  const sent = [];
  const server = createServer({ dataDir, siteUrl: 'http://localhost', adminEmails: ['admin@example.com'], notifyEmail: 'office@example.com', mailer: async m => { sent.push(m); }, gcal: { enabled: false, sync: async () => null, remove: async () => null }, receiver: null });
  await new Promise(resolve => server.listen(0, resolve));
  const base = `http://localhost:${server.address().port}`;
  const jar = {};
  const call = async (who, method, url, body, extra = {}) => {
    const res = await fetch(base + url, { method, headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(jar[who] ? { Cookie: jar[who] } : {}), ...extra }, body: body ? JSON.stringify(body) : undefined });
    const set = res.headers.get('set-cookie');
    if (set) jar[who] = set.split(';')[0];
    return { res, data: (res.headers.get('content-type') || '').includes('json') ? await res.json() : null };
  };
  const token = to => sent.filter(m => m.to === to).at(-1).text.match(/token=([\w-]+)/)[1];
  const devA = { id: 'dev-aaaaaaaa-1111', model: 'Pixel 8', platform: 'Android' }, devB = { id: 'dev-bbbbbbbb-2222', model: 'iPhone', platform: 'iOS' };
  try {
    await call('admin', 'POST', '/api/auth/register', { name: 'Admin', email: 'admin@example.com', password: 'correct-horse-1', consent: true });
    await call('admin', 'POST', '/api/auth/verify', { token: token('admin@example.com') });
    await call('admin', 'POST', '/api/auth/login', { email: 'admin@example.com', password: 'correct-horse-1' });
    for (const [name, email] of [['Amy A', 'amy@example.com'], ['Bob B', 'bob@example.com']]) {
      await call('admin', 'POST', '/api/admin/employees', { name, email, skipOnboarding: true, roleTitle: 'Tile setter', rate: 20 });
      await call(email, 'POST', '/api/auth/reset', { token: token(email), password: 'correct-horse-2' });
      await call(email, 'POST', '/api/auth/login', { email, password: 'correct-horse-2' });
    }

    // Cross-site requests are refused even with a valid session
    assert.equal((await call('admin', 'POST', '/api/auth/preferences', { notifyEmail: true }, { 'Sec-Fetch-Site': 'cross-site' })).res.status, 403);

    // Lockout: 8 bad passwords lock the account (even for the right password), unknown emails lock the same way
    for (let i = 0; i < 8; i++) assert.equal((await call('anon', 'POST', '/api/auth/login', { email: 'bob@example.com', password: 'wrong-password-1' })).res.status, 401);
    const locked = await call('anon', 'POST', '/api/auth/login', { email: 'bob@example.com', password: 'correct-horse-2' });
    assert.equal(locked.res.status, 429);
    assert.ok(Number(locked.res.headers.get('retry-after')) > 0);
    const log = (await call('admin', 'GET', '/api/admin/security?severity=warn')).data;
    assert.ok(log.events.filter(e => e.kind === 'login_failed').length >= 8);
    assert.equal((await call('amy@example.com', 'GET', '/api/admin/security')).res.status, 403);

    // Impossible GPS jumps are dropped and flagged, a second device cannot ping the shift
    const inA = { consent: true, consentVersion: '2026-11', device: devA, position: fix({ at: Date.now() - 100000 }) };
    assert.equal((await call('amy@example.com', 'POST', '/api/employee/clock/in', inA)).res.status, 201);
    const jump = await call('amy@example.com', 'POST', '/api/employee/clock/ping', { deviceId: devA.id, points: [fix({ lat: SITE.lat + 0.5, at: Date.now() - 1000 })] });
    assert.equal(jump.data.saved, 0);
    const wrong = await call('amy@example.com', 'POST', '/api/employee/clock/ping', { deviceId: devB.id, points: [fix({ at: Date.now() - 2000 })] });
    assert.equal(wrong.res.status, 409);
    assert.equal((await call('amy@example.com', 'POST', '/api/employee/clock/ping', { points: [] })).res.status, 409);
    const alerts = (await call('admin', 'GET', '/api/admin/location')).data.alerts.map(a => a.kind);
    assert.ok(alerts.includes('gps_jump') && alerts.includes('device_mismatch'));

    // Frozen coordinates (a typical fake-GPS app) raise an alert
    for (let i = 0; i < 9; i++) await call('amy@example.com', 'POST', '/api/employee/clock/ping', { deviceId: devA.id, points: [fix({ at: Date.now() - 50000 + i * 1000 })] });
    assert.ok((await call('admin', 'GET', '/api/admin/location')).data.alerts.some(a => a.kind === 'gps_static'));

    // Clear Bob's lockout, then show a phone clocked in for one employee cannot clock in a second one
    const bobDb = new (require('node:sqlite').DatabaseSync)(path.join(dataDir, 'app.db'));
    bobDb.prepare('DELETE FROM security_events WHERE email = ?').run('bob@example.com');
    bobDb.close();
    await call('bob', 'POST', '/api/auth/login', { email: 'bob@example.com', password: 'correct-horse-2' });
    const shared = await call('bob', 'POST', '/api/employee/clock/in', { ...inA, device: devA, position: fix() });
    assert.equal(shared.res.status, 409);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});
