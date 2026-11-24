const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const { createServer } = require('../server');

const fix = (over = {}) => ({ lat: 41.8781, lng: -87.6298, accuracy: 12, at: Date.now(), ...over });

test('unpaid lunch: pauses pay, needs location to return, overrun clocks out at lunch start', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bbs-lunch-'));
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
  const token = to => sent.filter(m => m.to === to).at(-1).text.match(/token=([\w-]+)/)[1];
  const db = new DatabaseSync(path.join(dataDir, 'app.db'));
  const device = { id: 'dev-lunch-12345678', model: 'Pixel', platform: 'Android' };
  const hank = (url, body = {}) => call('hank', 'POST', `/api/employee/clock/${url}`, { deviceId: device.id, ...body });
  try {
    await call('admin', 'POST', '/api/auth/register', { name: 'Admin', email: 'admin@example.com', password: 'correct-horse-1', consent: true });
    await call('admin', 'POST', '/api/auth/verify', { token: token('admin@example.com') });
    await call('admin', 'POST', '/api/auth/login', { email: 'admin@example.com', password: 'correct-horse-1' });
    await call('admin', 'POST', '/api/admin/employees', { name: 'Hank Handy', email: 'hank@example.com', roleTitle: 'Tile setter', rate: 25 });
    await call('hank', 'POST', '/api/auth/reset', { token: token('hank@example.com'), password: 'correct-horse-2' });
    await call('hank', 'POST', '/api/auth/login', { email: 'hank@example.com', password: 'correct-horse-2' });

    assert.equal((await hank('lunch/start')).res.status, 409);
    const clockIn = () => call('hank', 'POST', '/api/employee/clock/in', { consent: true, consentVersion: '2026-11', device, position: fix() });
    assert.equal((await clockIn()).res.status, 201);
    db.prepare('UPDATE shifts SET clock_in_at = ?').run(new Date(Date.now() - 4 * 3600e3).toISOString());

    // Lunch of 40 minutes
    assert.equal((await hank('lunch/start')).res.status, 201);
    assert.equal((await hank('lunch/start')).res.status, 409);
    assert.equal((await call('hank', 'GET', '/api/employee/clock')).data.active.onLunchSince !== null, true);
    assert.equal((await hank('ping', { points: [fix()] })).data.onLunch, true);
    assert.equal((await call('admin', 'GET', '/api/admin/location')).data.live[0].status, 'lunch');
    const board = (await call('admin', 'GET', '/api/admin/location/live')).data;
    assert.equal(board.totals.onLunch, 1);
    assert.equal(board.rows.find(r => r.shift).doing, 'On unpaid lunch');
    db.prepare('UPDATE shift_breaks SET start_at = ?').run(new Date(Date.now() - 40 * 60e3).toISOString());
    assert.equal((await hank('lunch/end', {})).res.status, 400);
    assert.equal((await hank('lunch/end', { position: fix({ accuracy: 900 }) })).res.status, 400);
    const back = await hank('lunch/end', { position: fix() });
    assert.equal(back.res.status, 200);
    assert.ok(back.data.lunchMinutes >= 39 && back.data.lunchMinutes <= 41);
    assert.equal((await hank('lunch/end', { position: fix() })).res.status, 409);

    const out = (await hank('out', {})).data;
    assert.ok(out.minutes >= 198 && out.minutes <= 202, `paid ${out.minutes}`);
    const entry = db.prepare('SELECT minutes, note FROM time_entries ORDER BY id DESC').get();
    assert.equal(entry.minutes, out.minutes);
    assert.match(entry.note, /unpaid lunch/);

    // Forgetting to come back ends the shift at the moment lunch began
    assert.equal((await clockIn()).res.status, 201);
    db.prepare('UPDATE shifts SET clock_in_at = ? WHERE clock_out_at IS NULL').run(new Date(Date.now() - 3 * 3600e3).toISOString());
    assert.equal((await hank('lunch/start')).res.status, 201);
    server.tracking.sweep(Date.now() + 100 * 60e3);
    assert.equal((await call('hank', 'GET', '/api/employee/clock')).data.active, null);
    const last = db.prepare('SELECT closed_by, lunch_minutes, paid_minutes FROM shifts ORDER BY id DESC').get();
    assert.equal(last.closed_by, 'system');
    assert.equal(last.lunch_minutes, 0);
    assert.ok(last.paid_minutes >= 178);
    assert.ok((await call('admin', 'GET', '/api/admin/location')).data.alerts.some(a => a.kind === 'lunch_overrun'));
  } finally {
    db.close();
    await new Promise(resolve => server.close(resolve));
  }
});
