const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const { createServer } = require('../server');

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
    assert.equal((await call('x', 'POST', '/api/book/cancel', { token })).res.status, 400);

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
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});
