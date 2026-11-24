// Appointments between staff and customers, tied to a project request.
// Staff schedule, reschedule and cancel; customers can view, add to their calendar and cancel.
// Every change emails the customer with an .ics invite, is mirrored to Google Calendar (if configured) and is exposed
// through a secret-token iCalendar feed that staff can subscribe to from Apple, Google or Outlook calendars.
const crypto = require('node:crypto');
const { buildCalendar, googleAddUrl } = require('./ical');

const KINDS = { in_home: 'In-home estimate', phone: 'Phone call', video: 'Video call' };
const MAX_AHEAD_MS = 2 * 365 * 24 * 60 * 60 * 1000;

function createAppointments({ db, mailer, templates, siteUrl, notifyEmail, staffEmails, gcal, timeZone = process.env.BUSINESS_TIMEZONE || 'America/Chicago', json, fail, text, isAdmin, canAccess, ticketUrl, randomToken }) {
  const q = sql => db.prepare(sql);
  const host = new URL(siteUrl).host;
  const organizerEmail = notifyEmail || `appointments@${host.replace(/:\d+$/, '')}`;
  const nowIso = () => new Date().toISOString();
  const formatWhen = a => new Intl.DateTimeFormat('en-US', { dateStyle: 'full', timeStyle: 'short', timeZone }).format(new Date(a.starts_at));

  let feedToken = q("SELECT value FROM settings WHERE key = 'calendar_feed_token'").get()?.value;
  if (!feedToken) { feedToken = randomToken(); q("INSERT INTO settings (key, value) VALUES ('calendar_feed_token', ?)").run(feedToken); }

  const mail = async message => { try { await mailer(message); } catch (error) { console.error('Email failed:', error.message); } };
  const summaryFor = (a, request) => `${KINDS[a.kind]}: ${request.title}`;
  function eventFor(a, request, customer) {
    const url = ticketUrl(request.id);
    const description = [`${KINDS[a.kind]} with ${customer.name}`, `Project: ${request.title} (#${request.id})`, a.notes, `Request: ${url}`].filter(Boolean).join('\n');
    return { appointment: a, customer, description, url, summary: summaryFor(a, request) };
  }
  const icsUrl = a => `${siteUrl}/api/appointments/${a.id}/ics`;

  function view(a, request) {
    const customer = q('SELECT name, email FROM users WHERE id = ?').get(a.user_id);
    const event = eventFor(a, request, customer);
    return {
      id: a.id, requestId: a.request_id, requestTitle: request.title, startsAt: a.starts_at, durationMin: a.duration_min, kind: a.kind, kindLabel: KINDS[a.kind],
      location: a.location, notes: a.notes, status: a.status, customerName: customer.name,
      googleUrl: googleAddUrl(event), icsPath: `/api/appointments/${a.id}/ics`
    };
  }

  async function syncGoogle(a, request, customer) {
    try {
      if (a.status === 'cancelled') { await gcal.remove(a.google_event_id); q('UPDATE appointments SET google_event_id = NULL WHERE id = ?').run(a.id); return; }
      const id = await gcal.upsert(eventFor(a, request, customer));
      if (id && id !== a.google_event_id) q('UPDATE appointments SET google_event_id = ? WHERE id = ?').run(id, a.id);
    } catch (error) { console.error('Google Calendar sync failed:', error.message); }
  }

  async function notifyCustomer(a, request, change) {
    const customer = q('SELECT name, email FROM users WHERE id = ?').get(a.user_id);
    const event = eventFor(a, request, customer);
    const ics = buildCalendar({ events: [event], method: a.status === 'cancelled' ? 'CANCEL' : 'REQUEST', organizerEmail, host });
    await mail({
      to: customer.email,
      ...templates.appointment({ name: customer.name, kind: KINDS[a.kind], change, when: formatWhen(a), duration: a.duration_min, location: a.location, notes: a.notes, url: ticketUrl(request.id), googleUrl: googleAddUrl(event), icsUrl: icsUrl(a) }),
      attachments: [{ filename: 'appointment.ics', content: Buffer.from(ics).toString('base64'), content_type: `text/calendar; method=${a.status === 'cancelled' ? 'CANCEL' : 'REQUEST'}; charset=UTF-8` }]
    });
    return customer;
  }

  function parseDetails(body) {
    const startsAt = new Date(body.startsAt);
    const duration = Number(body.durationMin);
    const kind = body.kind;
    const location = text(body.location ?? '', 300), notes = text(body.notes ?? '', 1000);
    if (Number.isNaN(startsAt.getTime()) || startsAt.getTime() < Date.now() - 60000 || startsAt.getTime() > Date.now() + MAX_AHEAD_MS) return { error: 'Choose a date and time in the future.' };
    if (!Number.isInteger(duration) || duration < 15 || duration > 480) return { error: 'Length must be between 15 and 480 minutes.' };
    if (!Object.hasOwn(KINDS, kind)) return { error: 'Choose an appointment type.' };
    if (location === null || notes === null) return { error: 'Location or notes are too long.' };
    return { startsAt: startsAt.toISOString(), duration, kind, location, notes };
  }

  const requestOf = a => q('SELECT * FROM requests WHERE id = ?').get(a.request_id);

  // Public (token-authenticated) iCalendar feed of all upcoming scheduled appointments, for staff calendar subscriptions.
  function feed(req, res, url) {
    const given = Buffer.from(String(url.searchParams.get('token') || '')), expected = Buffer.from(feedToken);
    if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) return fail(res, 404, 'Not found.'), true;
    const rows = q("SELECT * FROM appointments WHERE status = 'scheduled' AND starts_at >= ? ORDER BY starts_at LIMIT 1000").all(new Date(Date.now() - 30 * 86400000).toISOString());
    const events = rows.map(a => eventFor(a, requestOf(a), q('SELECT name, email FROM users WHERE id = ?').get(a.user_id)));
    res.writeHead(200, { 'Content-Type': 'text/calendar; charset=utf-8', 'Cache-Control': 'private, max-age=300', 'Content-Disposition': 'inline; filename="appointments.ics"' });
    res.end(buildCalendar({ events, host, organizerEmail }));
    return true;
  }

  async function handle({ req, res, pathname, method, user, body }) {
    const staff = isAdmin(user);
    let m;
    if (method === 'GET' && pathname === '/api/appointments') {
      const rows = staff
        ? q("SELECT * FROM appointments WHERE status = 'scheduled' AND starts_at >= ? ORDER BY starts_at LIMIT 200").all(nowIso())
        : q("SELECT * FROM appointments WHERE user_id = ? AND status = 'scheduled' AND starts_at >= ? ORDER BY starts_at LIMIT 50").all(user.id, nowIso());
      return json(res, 200, { appointments: rows.map(a => view(a, requestOf(a))) }), true;
    }
    if (method === 'GET' && pathname === '/api/calendar/info') {
      if (!staff) return fail(res, 403, 'Not allowed.'), true;
      return json(res, 200, { feedUrl: `${siteUrl}/api/calendar/feed.ics?token=${feedToken}`, googleSync: gcal.enabled }), true;
    }
    if ((m = pathname.match(/^\/api\/requests\/(\d+)\/appointments$/))) {
      const request = q('SELECT * FROM requests WHERE id = ?').get(Number(m[1]));
      if (!canAccess(user, request)) return fail(res, 404, 'Request not found.'), true;
      if (method === 'GET') return json(res, 200, { appointments: q('SELECT * FROM appointments WHERE request_id = ? ORDER BY starts_at').all(request.id).map(a => view(a, request)) }), true;
      if (method === 'POST') {
        if (!staff) return fail(res, 403, 'Only our team can schedule appointments.'), true;
        if (request.status === 'draft') return fail(res, 400, 'This request has not been sent yet.'), true;
        const d = parseDetails(body);
        if (d.error) return fail(res, 400, d.error), true;
        const at = nowIso();
        const info = q('INSERT INTO appointments (uid, request_id, user_id, starts_at, duration_min, kind, location, notes, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
          .run(crypto.randomUUID(), request.id, request.user_id, d.startsAt, d.duration, d.kind, d.location, d.notes, at, at);
        const a = q('SELECT * FROM appointments WHERE id = ?').get(Number(info.lastInsertRowid));
        const customer = await notifyCustomer(a, request, 'new');
        await syncGoogle(a, request, customer);
        return json(res, 201, { appointment: view(a, request) }), true;
      }
    }
    if ((m = pathname.match(/^\/api\/appointments\/(\d+)\/(ics|reschedule|cancel)$/))) {
      let a = q('SELECT * FROM appointments WHERE id = ?').get(Number(m[1]));
      const request = a && requestOf(a);
      if (!a || !canAccess(user, request)) return fail(res, 404, 'Appointment not found.'), true;
      const customer = q('SELECT name, email FROM users WHERE id = ?').get(a.user_id);
      if (m[2] === 'ics' && method === 'GET') {
        const ics = buildCalendar({ events: [eventFor(a, request, customer)], method: 'PUBLISH', host, organizerEmail });
        res.writeHead(200, { 'Content-Type': 'text/calendar; charset=utf-8', 'Cache-Control': 'no-store', 'Content-Disposition': 'attachment; filename="appointment.ics"' });
        return res.end(ics), true;
      }
      if (method !== 'POST') return fail(res, 405, 'Method not allowed.'), true;
      if (a.status !== 'scheduled') return fail(res, 400, 'This appointment was already cancelled.'), true;
      if (m[2] === 'reschedule') {
        if (!staff) return fail(res, 403, 'Only our team can reschedule. Send us a message to ask for a new time.'), true;
        const d = parseDetails(body);
        if (d.error) return fail(res, 400, d.error), true;
        q('UPDATE appointments SET starts_at = ?, duration_min = ?, kind = ?, location = ?, notes = ?, sequence = sequence + 1, updated_at = ? WHERE id = ?').run(d.startsAt, d.duration, d.kind, d.location, d.notes, nowIso(), a.id);
        a = q('SELECT * FROM appointments WHERE id = ?').get(a.id);
        await notifyCustomer(a, request, 'updated');
        await syncGoogle(a, request, customer);
        return json(res, 200, { appointment: view(a, request) }), true;
      }
      q("UPDATE appointments SET status = 'cancelled', sequence = sequence + 1, updated_at = ? WHERE id = ?").run(nowIso(), a.id);
      const before = a;
      a = q('SELECT * FROM appointments WHERE id = ?').get(a.id);
      await notifyCustomer(a, request, 'cancelled');
      await syncGoogle({ ...a, google_event_id: before.google_event_id }, request, customer);
      if (!staff) for (const to of new Set([...staffEmails])) await mail({ to, ...templates.appointmentCancelledByCustomer({ customerName: customer.name, when: formatWhen(a), url: ticketUrl(request.id) }) });
      return json(res, 200, { appointment: view(a, request) }), true;
    }
    return false;
  }

  return { handle, feed };
}

module.exports = { createAppointments, KINDS };
