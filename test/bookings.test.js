const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const { createServer } = require('../server');
const { buildCalendar } = require('../lib/ical');

test('bookings: open slots, invite, double-booking, manage link, reminder and admin', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bbs-book-'));
  const sent = [];
  const server = createServer({ dataDir, siteUrl: 'http://localhost', adminEmails: ['admin@example.com'], notifyEmail: 'office@example.com', mailer: async m => { sent.push(m); }, gcal: { enabled: false, upsert: async () => null, remove: async () => {} } });
  await new Promise(resolve => server.listen(0, resolve));
  const base = `http://localhost:${server.address().port}`;
  const jar = {};
  const call = async (who, method, url, body) => {
    const res = await fetch(base + url, { method, headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(jar[who] ? { Cookie: jar[who] } : {}) }, body: body ? JSON.stringify(body) : undefined });
    const set = res.headers.get('set-cookie');
    if (set) jar[who] = set.split(';')[0];
    const type = res.headers.get('content-type') || '';
    return { res, data: type.includes('json') ? await res.json() : await res.text() };
  };
  const person = { name: 'Pat Customer', email: 'pat@example.com', phone: '(630) 555-0100', address: '12 Elm St, Aurora, IL 60505', interest: 'Bathroom Remodeling', consent: true };
  try {
    const cfg = (await call('pat', 'GET', '/api/book/config')).data;
    assert.deepEqual(cfg.kinds.map(k => k.key), ['phone', 'video', 'in_home']);

    // Weekdays only, inside business hours, never in the past
    const days = (await call('pat', 'GET', '/api/book/days?kind=in_home')).data.days;
    assert.ok(days.length > 10);
    for (const d of days) assert.ok(![0, 6].includes(new Date(`${d.date}T12:00:00Z`).getUTCDay()), d.date);
    const slots = (await call('pat', 'GET', `/api/book/slots?kind=in_home&date=${days[2].date}`)).data.slots;
    assert.ok(slots.length >= 8);
    assert.equal(slots[0].label, '8:00 AM');

    // Validation
    assert.equal((await call('pat', 'POST', '/api/book', { ...person, kind: 'in_home', startsAt: slots[0].startsAt, address: '', })).res.status, 400);
    assert.equal((await call('pat', 'POST', '/api/book', { ...person, kind: 'in_home', startsAt: slots[0].startsAt, consent: false })).res.status, 400);
    assert.equal((await call('pat', 'POST', '/api/book', { ...person, kind: 'in_home', startsAt: '2020-01-06T15:00:00Z' })).res.status, 409);

    // Book in-home: confirmation email with .ics attachment and calendar links, plus an office alert
    const made = await call('pat', 'POST', '/api/book', { ...person, kind: 'in_home', startsAt: slots[0].startsAt });
    assert.equal(made.res.status, 201);
    const b = made.data.booking;
    assert.match(b.googleUrl, /calendar\.google\.com/);
    assert.match(b.outlookUrl, /outlook\.live\.com/);
    const confirm = sent.find(m => m.to === 'pat@example.com');
    assert.match(confirm.subject, /Appointment confirmed/);
    assert.match(confirm.html, /Apple Calendar/);
    const ics = Buffer.from(confirm.attachments[0].content, 'base64').toString();
    assert.match(ics, /METHOD:REQUEST/);
    assert.match(ics, /TRIGGER:-P1D/);
    assert.match(ics, /TRIGGER:-PT1H/);
    assert.match(ics, /LOCATION:12 Elm St/);
    assert.ok(sent.some(m => m.to === 'office@example.com' && /New booking/.test(m.subject)));
    const download = await call('pat', 'GET', b.icsPath);
    assert.match(download.data, /BEGIN:VEVENT/);

    // The in-home slot (and the travel buffer after it) is gone; a second in-home visit cannot overlap
    const after = (await call('pat', 'GET', `/api/book/slots?kind=in_home&date=${days[2].date}`)).data.slots.map(s => s.label);
    assert.ok(!after.includes('8:00 AM') && !after.includes('9:00 AM'));
    assert.equal((await call('x', 'POST', '/api/book', { ...person, email: 'other@example.com', kind: 'in_home', startsAt: slots[0].startsAt })).res.status, 409);
    // ...but phone calls still have room
    const phoneSlots = (await call('pat', 'GET', `/api/book/slots?kind=phone&date=${days[2].date}`)).data.slots;
    assert.equal((await call('x', 'POST', '/api/book', { ...person, email: 'other@example.com', kind: 'phone', startsAt: phoneSlots[0].startsAt })).res.status, 201);

    // The customer record exists and marketing is off unless opted in
    await call('admin', 'POST', '/api/auth/register', { name: 'Admin', email: 'admin@example.com', password: 'correct-horse-1', consent: true });
    await call('admin', 'POST', '/api/auth/verify', { token: sent.filter(m => m.to === 'admin@example.com').at(-1).text.match(/token=([\w-]+)/)[1] });
    await call('admin', 'POST', '/api/auth/login', { email: 'admin@example.com', password: 'correct-horse-1' });
    const cust = (await call('admin', 'GET', '/api/admin/customers')).data;
    const rec = (cust.customers || cust).find(c => c.email === 'pat@example.com');
    assert.ok(rec);

    // A signed-in customer sees their web bookings (with a working manage link) in the account area
    await call('pat', 'POST', '/api/auth/register', { name: 'Pat Customer', email: 'pat@example.com', password: 'correct-horse-3', consent: true });
    await call('pat', 'POST', '/api/auth/verify', { token: sent.filter(m => m.to === 'pat@example.com').at(-1).text.match(/token=([\w-]+)/)[1] });
    await call('pat', 'POST', '/api/auth/login', { email: 'pat@example.com', password: 'correct-horse-3' });
    const mine = (await call('pat', 'GET', '/api/account/bookings')).data.bookings;
    assert.equal(mine.length, 1);
    assert.equal(new URL(mine[0].manageUrl).searchParams.get('token'), new URL(b.manageUrl).searchParams.get('token'));
    assert.equal((await call('x', 'GET', '/api/account/bookings')).res.status, 401);

    // Private manage link: view, reschedule, cancel; a wrong token finds nothing
    const token = new URL(b.manageUrl).searchParams.get('token');
    assert.equal((await call('x', 'GET', '/api/book/manage?token=nope-nope-nope-nope-nope')).res.status, 404);
    assert.equal((await call('x', 'GET', `/api/book/manage?token=${token}`)).data.booking.name, 'Pat Customer');
    const move = await call('x', 'POST', '/api/book/reschedule', { token, startsAt: slots[4].startsAt });
    assert.equal(move.res.status, 200);
    assert.equal(move.data.booking.startsAt, slots[4].startsAt);
    assert.match(sent.filter(m => m.to === 'pat@example.com').at(-1).subject, /rescheduled/);
    assert.equal((await call('x', 'POST', '/api/book/reschedule', { token, startsAt: '2020-01-06T15:00:00Z' })).res.status, 409);

    // Admin sees it and the staff calendar feed contains it
    const list = (await call('admin', 'GET', '/api/admin/bookings')).data;
    assert.equal(list.stats.upcoming, 2);
    assert.equal((await call('x', 'GET', '/api/admin/bookings')).res.status, 403);
    const feedInfo = (await call('admin', 'GET', '/api/calendar/info')).data;
    const feed = (await call('x', 'GET', new URL(feedInfo.feedUrl).pathname + new URL(feedInfo.feedUrl).search)).data;
    assert.match(feed, /Free bathroom estimate/);

    // Cancel by customer: freed slot, cancel invite, office alert
    assert.equal((await call('x', 'POST', '/api/book/cancel', { token })).res.status, 200);
    assert.match(Buffer.from(sent.filter(m => m.to === 'pat@example.com').at(-1).attachments[0].content, 'base64').toString(), /METHOD:CANCEL/);
    assert.ok((await call('x', 'GET', `/api/book/slots?kind=in_home&date=${days[2].date}`)).data.slots.some(s => s.startsAt === slots[0].startsAt));
    const repeatedCancel = await call('x', 'POST', '/api/book/cancel', { token });
    assert.equal(repeatedCancel.res.status, 400);

    // Reminder email goes out about a day before, once
    const db = new DatabaseSync(path.join(dataDir, 'app.db'));
    const phoneBooking = db.prepare("SELECT id FROM bookings WHERE kind = 'phone' AND status = 'scheduled'").get();
    db.prepare('UPDATE bookings SET starts_at = ?, reminded_at = NULL WHERE id = ?').run(new Date(Date.now() + 20 * 3600000).toISOString(), phoneBooking.id);
    db.close();
    const before = sent.length;
    assert.equal(await server.bookings.sendReminders(), 1);
    assert.match(sent.at(-1).subject, /^Reminder/);
    assert.equal(sent.length, before + 1);
    assert.equal(await server.bookings.sendReminders(), 0);

    // Admin settings: closing a day removes it from the public calendar
    const current = (await call('admin', 'GET', '/api/admin/bookings/config')).data.config;
    const saved = await call('admin', 'POST', '/api/admin/bookings/config', { ...current, blackout: [days[0].date] });
    assert.equal(saved.res.status, 200);
    assert.ok(!(await call('x', 'GET', '/api/book/days?kind=phone')).data.days.some(d => d.date === days[0].date));
    assert.equal((await call('admin', 'POST', '/api/admin/bookings/config', { ...current, capacity: { phone: 0, video: 1, in_home: 1 } })).res.status, 400);
    assert.equal((await call('admin', 'POST', '/api/admin/bookings/config', { ...current, blackout: ['2027-02-30'] })).res.status, 400);
    assert.equal((await call('admin', 'POST', '/api/admin/bookings/config', { ...current, hours: { ...current.hours, 1: ['24:00', '24:00'] } })).res.status, 400);
    assert.equal((await call('admin', 'POST', '/api/admin/bookings/config', { ...current, maxDays: 0 })).res.status, 400);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});

async function startBookingServer(options = {}) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bbs-book-extra-'));
  const sent = [];
  const failures = options.failures || {};
  const gcalCalls = [];
  const mailer = async message => {
    const key = `${message.to}:${message.subject || ''}`;
    if (failures.email?.(message, key, sent)) throw new Error('Temporary email failure');
    sent.push(message);
  };
  const server = createServer({
    dataDir,
    siteUrl: 'http://localhost',
    adminEmails: ['admin@example.com'],
    notifyEmail: 'office@example.com',
    mailer,
    gcal: {
      enabled: options.googleEnabled !== false,
      upsert: async event => {
        if (options.googleFailure) throw new Error('Temporary Google failure');
        gcalCalls.push({ action: 'upsert', event });
        return event.appointment.google_event_id || `g-${gcalCalls.length}`;
      },
      remove: async id => gcalCalls.push({ action: 'remove', id })
    }
  });
  await new Promise(resolve => server.listen(0, resolve));
  const base = `http://localhost:${server.address().port}`;
  const call = async (method, url, body, headers = {}) => {
    const res = await fetch(base + url, { method, headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...headers }, body: body ? JSON.stringify(body) : undefined });
    const type = res.headers.get('content-type') || '';
    return { res, data: type.includes('json') ? await res.json() : await res.text() };
  };
  return {
    dataDir, sent, server, call, gcalCalls,
    async close() { await new Promise(resolve => server.close(resolve)); }
  };
}

const customer = n => ({
  name: `Customer ${n}`,
  email: `customer${n}@example.com`,
  phone: '(630) 555-0100',
  address: '12 Elm St, Aurora, IL 60505',
  interest: 'Bathroom Remodeling',
  consent: true
});

test('bookings: concurrent inserts and reschedules atomically enforce capacity', async () => {
  const app = await startBookingServer({ googleEnabled: false });
  try {
    const config = (await app.call('GET', '/api/book/config')).data;
    assert.equal(config.timeZoneId, 'America/Chicago');
    const db = new DatabaseSync(path.join(app.dataDir, 'app.db'));
    const current = JSON.parse(db.prepare("SELECT value FROM settings WHERE key = 'booking.config'").get()?.value || '{}');
    db.prepare("INSERT INTO settings (key, value) VALUES ('booking.config', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
      .run(JSON.stringify({ ...current, enabled: true, hours: current.hours, stepMin: 30, leadHours: 0, maxDays: 45, travelBufferMin: 30, capacity: { phone: 1, video: 1, in_home: 1 }, blackout: [] }));
    db.close();
    const days = (await app.call('GET', '/api/book/days?kind=phone')).data.days;
    const day = days[1]?.date || days[0].date;
    const slots = (await app.call('GET', `/api/book/slots?kind=phone&date=${day}`)).data.slots;
    assert.ok(slots.length >= 5);

    const attempts = await Promise.all(Array.from({ length: 8 }, (_, i) => app.call('POST', '/api/book', { ...customer(i), kind: 'phone', startsAt: slots[0].startsAt })));
    assert.equal(attempts.filter(x => x.res.status === 201).length, 1);
    assert.equal(attempts.filter(x => x.res.status === 409).length, 7);
    const db1 = new DatabaseSync(path.join(app.dataDir, 'app.db'));
    assert.equal(db1.prepare('SELECT COUNT(*) AS n FROM bookings WHERE starts_at = ?').get(slots[0].startsAt).n, 1);
    db1.close();

    const duplicate = await Promise.all([
      app.call('POST', '/api/book', { ...customer(20), kind: 'phone', startsAt: slots[2].startsAt }),
      app.call('POST', '/api/book', { ...customer(20), kind: 'phone', startsAt: slots[2].startsAt })
    ]);
    assert.deepEqual(duplicate.map(x => x.res.status).sort(), [200, 201]);
    assert.equal(new Set(duplicate.map(x => x.data.booking.id)).size, 1);
    const db2 = new DatabaseSync(path.join(app.dataDir, 'app.db'));
    assert.equal(db2.prepare('SELECT COUNT(*) AS n FROM bookings WHERE email = ?').get(customer(20).email).n, 1);
    db2.close();

    const a = await app.call('POST', '/api/book', { ...customer(30), kind: 'phone', startsAt: slots[1].startsAt });
    const b = await app.call('POST', '/api/book', { ...customer(31), kind: 'phone', startsAt: slots[3].startsAt });
    assert.equal(a.res.status, 201);
    assert.equal(b.res.status, 201);
    const target = slots[4].startsAt;
    const tokenA = new URL(a.data.booking.manageUrl).searchParams.get('token');
    const tokenB = new URL(b.data.booking.manageUrl).searchParams.get('token');
    const moves = await Promise.all([
      app.call('POST', '/api/book/reschedule', { token: tokenA, startsAt: target }),
      app.call('POST', '/api/book/reschedule', { token: tokenB, startsAt: target })
    ]);
    assert.deepEqual(moves.map(x => x.res.status).sort(), [200, 409]);
    const db3 = new DatabaseSync(path.join(app.dataDir, 'app.db'));
    assert.equal(db3.prepare('SELECT COUNT(*) AS n FROM bookings WHERE starts_at = ? AND status = ?').get(target, 'scheduled').n, 1);
    assert.equal(db3.prepare('SELECT COUNT(*) AS n FROM bookings').get().n, 4);
    db3.close();
  } finally {
    await app.close();
  }
});

test('bookings: DST gaps, bounds, blackouts and full-day windows are safe', async () => {
  const app = await startBookingServer({ googleEnabled: false });
  try {
    const gap = app.server.bookings.zonedToUtc('2027-03-14', 2 * 60 + 30);
    assert.equal(gap, null);
    assert.equal(new Date(app.server.bookings.zonedToUtc('2027-03-14', 3 * 60 + 30)).toISOString(), '2027-03-14T08:30:00.000Z');
    assert.equal(new Date(app.server.bookings.zonedToUtc('2027-11-07', 90)).toISOString(), '2027-11-07T06:30:00.000Z');
    assert.equal(app.server.bookings.validDate('2027-02-29'), false);

    const today = app.server.bookings.todayLocal();
    const date = new Date(`${today}T12:00:00Z`);
    date.setUTCDate(date.getUTCDate() + 20);
    const day = date.toISOString().slice(0, 10);
    const weekday = date.getUTCDay();
    const hours = Object.fromEntries(Array.from({ length: 7 }, (_, i) => [i, i === weekday ? ['00:00', '24:00'] : null]));
    const c = { enabled: true, hours, stepMin: 30, leadHours: 0, maxDays: 21, travelBufferMin: 0, capacity: { phone: 1, video: 1, in_home: 1 }, blackout: [] };
    const slots = app.server.bookings.slotsFor(day, 'phone', c, []);
    assert.ok(slots.length >= 47 && slots.length <= 48);
    assert.equal(new Date(slots.at(-1)).toISOString().includes('Z'), true);
    assert.ok(app.server.bookings.slotsFor(day, 'phone', { ...c, blackout: [day] }, []).length === 0);
    assert.deepEqual(app.server.bookings.slotsFor('2020-01-01', 'phone', c, []), []);
    assert.deepEqual(app.server.bookings.slotsFor('2027-02-30', 'phone', c, []), []);
  } finally {
    await app.close();
  }
});

test('bookings: notification failures remain queryable and retry without duplicating', async () => {
  let failEmail = true, failGoogle = true, customerSends = 0;
  const app = await startBookingServer({
    googleEnabled: true,
    failures: { email: message => {
      if (message.to === 'customer-failure@example.com') {
        customerSends++;
        if (failEmail) return true;
      }
      return false;
    } },
    get googleFailure() { return failGoogle; }
  });
  try {
    const days = (await app.call('GET', '/api/book/days?kind=phone')).data.days;
    const slots = (await app.call('GET', `/api/book/slots?kind=phone&date=${days[2].date}`)).data.slots;
    const made = await app.call('POST', '/api/book', { ...customer(40), email: 'customer-failure@example.com', kind: 'phone', startsAt: slots[0].startsAt });
    assert.equal(made.res.status, 201);
    assert.equal(made.data.booking.delivery.channels.customer.status, 'failed');
    assert.equal(made.data.booking.delivery.channels.google.status, 'failed');
    const token = new URL(made.data.booking.manageUrl).searchParams.get('token');
    const lookedUp = await app.call('GET', `/api/book/delivery?token=${token}`);
    assert.equal(lookedUp.data.booking.delivery.channels.staff.status, 'sent');

    failEmail = false;
    failGoogle = false;
    const retried = await app.call('POST', '/api/book/retry-deliveries', { token });
    assert.equal(retried.res.status, 200);
    assert.equal(retried.data.booking.delivery.channels.customer.status, 'sent');
    assert.equal(retried.data.booking.delivery.channels.google.status, 'sent');
    assert.ok(customerSends >= 2);
    const db = new DatabaseSync(path.join(app.dataDir, 'app.db'));
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM bookings WHERE email = ?').get('customer-failure@example.com').n, 1);
    db.close();

    const repeated = await app.call('POST', '/api/book', { ...customer(40), email: 'customer-failure@example.com', kind: 'phone', startsAt: slots[0].startsAt });
    assert.equal(repeated.res.status, 200);
    assert.equal(repeated.data.duplicate, true);
    assert.equal(repeated.data.booking.id, made.data.booking.id);
  } finally {
    await app.close();
  }
});

test('calendar: cancellation, reschedule sequence and timezone remain consistent', () => {
  const base = {
    uid: 'stable-uid',
    starts_at: '2027-03-15T14:00:00.000Z',
    duration_min: 30,
    status: 'scheduled',
    sequence: 4,
    created_at: '2027-03-01T12:00:00.000Z',
    updated_at: '2027-03-10T12:00:00.000Z',
    location: 'Phone'
  };
  const event = { appointment: base, customer: { name: 'Pat', email: 'pat@example.com' }, summary: 'Phone call', description: 'Details', url: 'http://localhost' };
  const scheduled = buildCalendar({ events: [event], method: 'REQUEST', host: 'localhost', organizerEmail: 'office@example.com', timeZone: 'America/Chicago' });
  assert.match(scheduled, /X-WR-TIMEZONE:America\/Chicago/);
  assert.match(scheduled, /UID:stable-uid@localhost/);
  assert.match(scheduled, /DTSTART:20270315T140000Z/);
  assert.match(scheduled, /SEQUENCE:4/);
  assert.match(scheduled, /STATUS:CONFIRMED/);
  const cancelled = buildCalendar({ events: [{ ...event, appointment: { ...base, status: 'cancelled', sequence: 5, updated_at: '2027-03-11T12:00:00.000Z' } }], method: 'CANCEL', host: 'localhost', organizerEmail: 'office@example.com', timeZone: 'America/Chicago' });
  assert.match(cancelled, /METHOD:CANCEL/);
  assert.match(cancelled, /UID:stable-uid@localhost/);
  assert.match(cancelled, /SEQUENCE:5/);
  assert.match(cancelled, /STATUS:CANCELLED/);
  assert.doesNotMatch(cancelled, /BEGIN:VALARM/);
});

test('appointments: atomic capacity, duplicate protection, delivery state and cancellation ICS', async () => {
  const app = await startBookingServer();
  try {
    let cookie = '';
    const auth = async (method, url, body) => {
      const result = await app.call(method, url, body, cookie ? { Cookie: cookie } : {});
      const set = result.res.headers.get('set-cookie');
      if (set) cookie = set.split(';')[0];
      return result;
    };
    await auth('POST', '/api/auth/register', { name: 'Admin', email: 'admin@example.com', password: 'correct-horse-1', consent: true });
    const verification = app.sent.filter(m => m.to === 'admin@example.com').at(-1).text.match(/token=([\w-]+)/)[1];
    await auth('POST', '/api/auth/verify', { token: verification });
    await auth('POST', '/api/auth/login', { email: 'admin@example.com', password: 'correct-horse-1' });
    const db = new DatabaseSync(path.join(app.dataDir, 'app.db'));
    const user = db.prepare("INSERT INTO users (email, name, phone, password_hash, verified, created_at) VALUES ('appointment@example.com', 'Appointment Customer', '6305550100', 'x', 1, ?) RETURNING id").get(new Date().toISOString());
    const ids = [];
    for (let i = 0; i < 3; i++) ids.push(Number(db.prepare("INSERT INTO requests (user_id, title, project_type, location, description, status, created_at, submitted_at) VALUES (?, ?, 'Bathroom', 'Aurora, IL', 'Schedule a call', 'submitted', ?, ?) RETURNING id").get(user.id, `Project ${i}`, new Date().toISOString(), new Date().toISOString()).id));
    db.close();
    const startsAt = new Date(Date.now() + 10 * 86400000);
    startsAt.setUTCHours(16, 0, 0, 0);
    const body = { startsAt: startsAt.toISOString(), durationMin: 30, kind: 'phone', location: '', notes: 'Initial consultation' };
    const created = await Promise.all(ids.map(id => auth('POST', `/api/requests/${id}/appointments`, body)));
    assert.deepEqual(created.map(x => x.res.status).sort(), [201, 201, 409]);
    const successful = created.filter(x => x.res.status === 201).sort((a, b) => a.data.appointment.id - b.data.appointment.id);
    const appointment = successful[0].data.appointment;
    assert.equal(appointment.delivery.channels.customer.status, 'sent');
    assert.equal(appointment.delivery.channels.google.status, 'sent');
    const duplicate = await auth('POST', `/api/requests/${appointment.requestId}/appointments`, body);
    assert.equal(duplicate.res.status, 200);
    assert.equal(duplicate.data.duplicate, true);
    assert.equal(duplicate.data.appointment.id, appointment.id);

    const movedAt = new Date(startsAt.getTime() + 2 * 3600000).toISOString();
    const moved = await auth('POST', `/api/appointments/${appointment.id}/reschedule`, { ...body, startsAt: movedAt });
    assert.equal(moved.res.status, 200);
    assert.equal(moved.data.appointment.sequence, appointment.sequence + 1);
    assert.equal(moved.data.appointment.delivery.change, 'updated');
    assert.equal((await auth('POST', `/api/appointments/${appointment.id}/reschedule`, { ...body, startsAt: '2027-02-30T16:00:00Z' })).res.status, 400);

    const cancelled = await auth('POST', `/api/appointments/${appointment.id}/cancel`, {});
    assert.equal(cancelled.res.status, 200);
    assert.equal(cancelled.data.appointment.status, 'cancelled');
    assert.equal(cancelled.data.appointment.sequence, appointment.sequence + 2);
    const ics = await auth('GET', `/api/appointments/${appointment.id}/ics`);
    assert.match(ics.data, /METHOD:CANCEL/);
    assert.match(ics.data, /STATUS:CANCELLED/);
    assert.match(ics.data, new RegExp(`SEQUENCE:${appointment.sequence + 2}`));
    const repeated = await auth('POST', `/api/appointments/${appointment.id}/cancel`, {});
    assert.equal(repeated.res.status, 200);
    assert.equal(repeated.data.duplicate, true);
  } finally {
    await app.close();
  }
});
