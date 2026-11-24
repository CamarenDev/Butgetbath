const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const { createServer } = require('../server');
const { distanceM } = require('../lib/tracking');

const SITE = { lat: 41.8781, lng: -87.6298 };
const fix = (over = {}) => ({ lat: SITE.lat, lng: SITE.lng, accuracy: 12, at: Date.now(), ...over });
const FAR = { lat: SITE.lat + 0.01, lng: SITE.lng };

test('path distance ignores GPS jitter', () => {
  const still = Array.from({ length: 20 }, (_, i) => ({ lat: SITE.lat + (i % 2) * 0.00002, lng: SITE.lng, accuracy: 10 }));
  assert.ok(distanceM(still) < 5);
  assert.ok(distanceM([{ ...SITE, accuracy: 5 }, { lat: SITE.lat + 0.001, lng: SITE.lng, accuracy: 5 }]) > 100);
});

test('GPS clock: consent, location required, job-site rules, automatic clock-out, pay and admin review', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bbs-gps-'));
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
  const device = { id: 'dev-12345678-abcd', model: 'Pixel 8', platform: 'Android', platformVersion: '14', screen: '1080x2400@2.6' };
  const clockIn = (over = {}) => call('hank', 'POST', '/api/employee/clock/in', { consent: true, consentVersion: '2026-11', device, position: fix(), ...over });
  try {
    await call('admin', 'POST', '/api/auth/register', { name: 'Admin', email: 'admin@example.com', password: 'correct-horse-1', consent: true });
    await call('admin', 'POST', '/api/auth/verify', { token: token('admin@example.com') });
    await call('admin', 'POST', '/api/auth/login', { email: 'admin@example.com', password: 'correct-horse-1' });
    const empId = (await call('admin', 'POST', '/api/admin/employees', { name: 'Hank Handy', email: 'hank@example.com', roleTitle: 'Tile setter', rate: 25 })).data.id;
    await call('hank', 'POST', '/api/auth/reset', { token: token('hank@example.com'), password: 'correct-horse-2' });
    await call('hank', 'POST', '/api/auth/login', { email: 'hank@example.com', password: 'correct-horse-2' });
    const jobId = (await call('admin', 'POST', '/api/admin/jobs', { title: 'Tile shower', address: '1 Main' })).data.id;
    await call('admin', 'POST', `/api/admin/jobs/${jobId}/assign`, { employeeIds: [empId] });
    assert.equal((await call('admin', 'POST', `/api/admin/jobs/${jobId}/site`, { lat: 'x', lng: 1, radius: 150 })).res.status, 400);
    assert.equal((await call('admin', 'POST', `/api/admin/jobs/${jobId}/site`, { ...SITE, radius: 150 })).res.status, 200);
    assert.equal((await call('admin', 'GET', `/api/admin/jobs/${jobId}`)).data.job.site.radius, 150);

    // Clock-in is blocked without consent, without a usable fix, or away from the job site
    assert.equal((await clockIn({ consent: false })).res.status, 400);
    assert.equal((await clockIn({ position: null })).res.status, 400);
    assert.equal((await clockIn({ position: fix({ accuracy: 900 }) })).res.status, 400);
    assert.equal((await clockIn({ position: fix({ at: Date.now() - 10 * 60000 }) })).res.status, 400);
    assert.equal((await clockIn({ jobId, position: fix(FAR) })).res.status, 400);
    assert.equal((await call('anon', 'POST', '/api/employee/clock/in', {})).res.status, 401);
    const started = await clockIn({ jobId, position: fix({ at: Date.now() - 100000 }) });
    assert.equal(started.res.status, 201);
    assert.equal((await clockIn({ jobId })).res.status, 409);

    // Pings record points; leaving the site starts the off-site clock
    const ping = await call('hank', 'POST', '/api/employee/clock/ping', { deviceId: device.id, points: [fix({ at: Date.now() - 50000 }), fix(FAR)], events: [{ kind: 'tracking_paused' }, { kind: 'left_site' }] });
    assert.equal(ping.data.saved, 2);
    assert.ok(ping.data.geofence.offsiteSince);
    const shiftId = started.data.id;
    let detail = (await call('admin', 'GET', `/api/admin/location/shifts/${shiftId}`)).data;
    assert.deepEqual(detail.events.map(e => e.kind), ['tracking_paused']);
    assert.equal(detail.device.label, 'Pixel 8 \u00b7 Android');
    assert.equal(detail.consent.version, '2026-11');
    assert.equal((await call('hank', 'GET', `/api/admin/location/shifts/${shiftId}`)).res.status, 403);

    // Backdate the shift two hours; the monitor alerts after the grace period, then clocks out and only pays on-site time
    const past = new Date(Date.now() - 2 * 3600000).toISOString();
    db.prepare('UPDATE shifts SET clock_in_at = ? WHERE id = ?').run(past, shiftId);
    db.prepare('UPDATE shifts SET offsite_since = ? WHERE id = ?').run(new Date(Date.now() - 30 * 60000).toISOString(), shiftId);
    server.tracking.sweep(Date.now() + 60000);
    const hours = (await call('hank', 'GET', '/api/employee/hours')).data.entries;
    assert.equal(hours.length, 1);
    assert.ok(hours[0].minutes >= 88 && hours[0].minutes <= 92, `paid ${hours[0].minutes}`);
    assert.match(hours[0].note, /closed automatically/);
    const clock = (await call('hank', 'GET', '/api/employee/clock')).data;
    assert.equal(clock.active, null);
    assert.equal(clock.recent[0].closedBy, 'system');
    assert.equal((await call('hank', 'POST', '/api/employee/clock/ping', { points: [] })).res.status, 409);
    assert.ok(sent.some(m => m.to === 'office@example.com' && /Location alert/.test(m.subject)));
    assert.ok(sent.some(m => m.to === 'hank@example.com' && /clocked out automatically/.test(m.subject)));

    // Location going silent clocks the employee out at the last fix
    assert.equal((await clockIn({ jobId })).res.status, 201);
    server.tracking.sweep(Date.now() + 6 * 60000);
    assert.equal((await call('hank', 'GET', '/api/employee/clock')).data.active, null);

    // Manual clock-out works without location and creates a pending entry
    const third = await clockIn({ position: fix() });
    assert.equal(third.res.status, 201);
    assert.equal((await call('hank', 'POST', '/api/employee/clock/out', { deviceId: device.id })).res.status, 200);

    // Admin review: dashboard data, per-employee file view and alert acknowledgement
    const report = (await call('admin', 'GET', '/api/admin/location')).data;
    assert.equal(report.totals.shifts, 3);
    assert.equal(report.byEmployee[0].name, 'Hank Handy');
    assert.ok(report.unacknowledged >= 2);
    assert.equal((await call('admin', 'POST', '/api/admin/location/alerts/ack-all')).res.status, 200);
    const filed = (await call('admin', 'GET', `/api/admin/employees/${empId}/location?from=2020-01-01&to=2020-01-31`)).data;
    assert.equal(filed.shifts.length, 0);
    assert.equal(filed.devices[0].id, device.id);
    assert.equal((await call('hank', 'GET', '/api/admin/location')).res.status, 403);
    assert.equal((await call('anon', 'GET', `/api/admin/employees/${empId}/location`)).res.status, 401);

    // The estimator learns who worked the job and when
    const crew = server.tracking.crewForJob(jobId);
    assert.equal(crew.employees[0].name, 'Hank Handy');
    assert.equal(crew.shifts, 2);
    assert.ok(crew.trackedHours > 1);
  } finally {
    db.close();
    await new Promise(resolve => server.close(resolve));
  }
});
