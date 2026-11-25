// Appointments between staff and customers, tied to a project request.
// Staff schedule, reschedule and cancel; customers can view, add to their calendar and cancel.
// Every change emails the customer with an .ics invite, is mirrored to Google Calendar (if configured) and is exposed
// through a secret-token iCalendar feed that staff can subscribe to from Apple, Google or Outlook calendars.
const crypto = require('node:crypto');
const { buildCalendar, googleAddUrl } = require('./ical');

const KINDS = { in_home: 'In-home estimate', phone: 'Phone call', video: 'Video call' };
const MAX_AHEAD_MS = 2 * 365 * 24 * 60 * 60 * 1000;

function createAppointments({ db, mailer, templates, siteUrl, notifyEmail, staffEmails, gcal, timeZone = process.env.BUSINESS_TIMEZONE || 'America/Chicago', json, fail, text, isAdmin, canAccess, ticketUrl, randomToken, extraEvents = () => [] }) {
  const q = sql => db.prepare(sql);
  const host = new URL(siteUrl).host;
  const organizerEmail = notifyEmail || `appointments@${host.replace(/:\d+$/, '')}`;
  const nowIso = () => new Date().toISOString();
  const formatWhen = a => new Intl.DateTimeFormat('en-US', { dateStyle: 'full', timeStyle: 'short', timeZone }).format(new Date(a.starts_at));
  const withTransaction = fn => {
    db.exec('BEGIN IMMEDIATE');
    try {
      const value = fn();
      db.exec('COMMIT');
      return value;
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  };

  let feedToken = q("SELECT value FROM settings WHERE key = 'calendar_feed_token'").get()?.value;
  if (!feedToken) { feedToken = randomToken(); q("INSERT INTO settings (key, value) VALUES ('calendar_feed_token', ?)").run(feedToken); }

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
      location: a.location, notes: a.notes, status: a.status, sequence: a.sequence, customerName: customer.name, delivery: deliveryView(a),
      googleUrl: googleAddUrl(event), icsPath: `/api/appointments/${a.id}/ics`
    };
  }

  async function syncGoogle(a, request, customer) {
    if (a.status === 'cancelled') {
      if (a.google_event_id) await gcal.remove(a.google_event_id);
      q('UPDATE appointments SET google_event_id = NULL WHERE id = ?').run(a.id);
      return;
    }
    const id = await gcal.upsert(eventFor(a, request, customer));
    if (id && id !== a.google_event_id) q('UPDATE appointments SET google_event_id = ? WHERE id = ?').run(id, a.id);
  }

  async function notifyCustomer(a, request, change) {
    const customer = q('SELECT name, email FROM users WHERE id = ?').get(a.user_id);
    const event = eventFor(a, request, customer);
    const ics = buildCalendar({ events: [event], method: a.status === 'cancelled' ? 'CANCEL' : 'REQUEST', organizerEmail, host, timeZone });
    await mailer({
      to: customer.email,
      ...templates.appointment({ name: customer.name, kind: KINDS[a.kind], change, when: formatWhen(a), duration: a.duration_min, location: a.location, notes: a.notes, url: ticketUrl(request.id), googleUrl: googleAddUrl(event), icsUrl: icsUrl(a) }),
      attachments: [{ filename: 'appointment.ics', content: Buffer.from(ics).toString('base64'), content_type: `text/calendar; method=${a.status === 'cancelled' ? 'CANCEL' : 'REQUEST'}; charset=UTF-8` }]
    });
    return customer;
  }

  const deliveryKey = a => `appointment.delivery.${a.uid}`;
  function deliveryState(a) {
    try {
      const saved = JSON.parse(q('SELECT value FROM settings WHERE key = ?').get(deliveryKey(a))?.value || '{}');
      return saved.sequence === a.sequence ? saved : { sequence: a.sequence, change: '', channels: {} };
    } catch (error) {
      console.error('Appointment delivery state is invalid:', error.message);
      return { sequence: a.sequence, change: '', channels: {} };
    }
  }
  const writeDeliveryState = (a, state) => q("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(deliveryKey(a), JSON.stringify(state));
  function prepareDeliveries(a, change, channels) {
    const state = { sequence: a.sequence, change, channels: {} };
    for (const channel of channels) state.channels[channel] = { status: 'pending', change, attempt: 0, at: nowIso() };
    writeDeliveryState(a, state);
  }
  const deliveryView = a => deliveryState(a);
  async function deliverChannel(a, channel, change, request, customer) {
    if (channel === 'google' && !gcal.enabled) {
      const state = deliveryState(a); state.channels.google = { ...(state.channels.google || {}), status: 'skipped', at: nowIso() }; writeDeliveryState(a, state); return;
    }
    if (channel === 'staff' && staffEmails.length === 0) {
      const state = deliveryState(a); state.channels.staff = { ...(state.channels.staff || {}), status: 'skipped', at: nowIso() }; writeDeliveryState(a, state); return;
    }
    const state = deliveryState(a), current = state.channels[channel] || {};
    if (current.status === 'sent') return;
    const inProgressAt = Date.parse(current.at);
    if (current.status === 'in_progress' && Number.isFinite(inProgressAt) && Date.now() - inProgressAt < 15 * 60000) return;
    state.change = change;
    state.channels[channel] = { status: 'in_progress', change, attempt: (current.attempt || 0) + 1, at: nowIso() };
    writeDeliveryState(a, state);
    try {
      if (channel === 'customer') await notifyCustomer(a, request, change);
      else if (channel === 'google') await syncGoogle(a, request, customer);
      else if (channel === 'staff') {
        for (const to of new Set(staffEmails)) await mailer({ to, ...templates.appointmentCancelledByCustomer({ customerName: customer.name, when: formatWhen(a), url: ticketUrl(request.id) }) });
      }
      const latest = deliveryState(a);
      latest.channels[channel] = { ...state.channels[channel], status: 'sent', at: nowIso() };
      writeDeliveryState(a, latest);
    } catch (error) {
      console.error(`${channel} appointment delivery failed:`, error.message);
      const latest = deliveryState(a);
      latest.channels[channel] = { ...state.channels[channel], status: 'failed', at: nowIso(), error: String(error.message || 'Delivery failed.').slice(0, 300) };
      writeDeliveryState(a, latest);
    }
  }
  async function sendDeliveries(a, channels, change, request = requestOf(a)) {
    const customer = q('SELECT name, email FROM users WHERE id = ?').get(a.user_id);
    for (const channel of channels) await deliverChannel(a, channel, change, request, customer);
    return deliveryView(a);
  }
  async function retryDeliveries(a) {
    const state = deliveryState(a), request = requestOf(a), customer = q('SELECT name, email FROM users WHERE id = ?').get(a.user_id);
    for (const [channel, outcome] of Object.entries(state.channels)) if (outcome.status === 'failed' || outcome.status === 'pending') await deliverChannel(a, channel, outcome.change || state.change, request, customer);
  }

  const parseInstant = value => {
    const raw = String(value || '');
    const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})$/.exec(raw);
    if (!m || Number(m[4]) > 23 || Number(m[5]) > 59 || Number(m[6] || 0) > 59) return null;
    const date = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
    if (date.getUTCFullYear() !== Number(m[1]) || date.getUTCMonth() !== Number(m[2]) - 1 || date.getUTCDate() !== Number(m[3])) return null;
    if (m[7] !== 'Z') {
      const [h, min] = m[7].slice(1).split(':').map(Number);
      if (h > 14 || min > 59 || (h === 14 && min)) return null;
    }
    const ms = Date.parse(raw);
    return Number.isFinite(ms) ? new Date(ms) : null;
  };

  function parseDetails(body) {
    const startsAt = parseInstant(body.startsAt);
    const duration = Number(body.durationMin);
    const kind = body.kind;
    const location = text(body.location ?? '', 300), notes = text(body.notes ?? '', 1000);
    if (!startsAt || startsAt.getTime() < Date.now() - 60000 || startsAt.getTime() > Date.now() + MAX_AHEAD_MS) return { error: 'Choose a valid date and time in the future.' };
    if (!Number.isInteger(duration) || duration < 15 || duration > 480) return { error: 'Length must be between 15 and 480 minutes.' };
    if (!Object.hasOwn(KINDS, kind)) return { error: 'Choose an appointment type.' };
    if (location === null || notes === null) return { error: 'Location or notes are too long.' };
    return { startsAt: startsAt.toISOString(), duration, kind, location, notes };
  }

  const requestOf = a => q('SELECT * FROM requests WHERE id = ?').get(a.request_id);
  const groupOf = kind => kind === 'in_home' ? 'in_home' : 'remote';
  function assertCapacity(a, startsAt, duration, kind, exceptId = 0) {
    let saved = {};
    try { saved = JSON.parse(q("SELECT value FROM settings WHERE key = 'booking.config'").get()?.value || '{}'); } catch { /* defaults */ }
    const capacity = { phone: 2, video: 2, in_home: 1, ...(saved.capacity || {}) };
    const travel = Number.isInteger(saved.travelBufferMin) ? saved.travelBufferMin : 30;
    const start = Date.parse(startsAt), end = start + (duration + (kind === 'in_home' ? travel : 0)) * 60000;
    const from = new Date(start - 86400000).toISOString(), to = new Date(end + 86400000).toISOString();
    const rows = q("SELECT id, starts_at, duration_min, kind FROM appointments WHERE status = 'scheduled' AND starts_at >= ? AND starts_at <= ?").all(from, to)
      .filter(row => row.id !== exceptId)
      .concat(q("SELECT starts_at, duration_min, kind FROM bookings WHERE status = 'scheduled' AND starts_at >= ? AND starts_at <= ?").all(from, to));
    const occupied = rows.filter(row => {
      if (groupOf(row.kind) !== groupOf(kind)) return false;
      const otherStart = Date.parse(row.starts_at), otherEnd = otherStart + (row.duration_min + (row.kind === 'in_home' ? travel : 0)) * 60000;
      return otherStart < end && otherEnd > start;
    }).length;
    const limit = groupOf(kind) === 'in_home' ? capacity.in_home : Math.max(capacity.phone, capacity.video);
    if (occupied >= limit) {
      const error = new Error('That time is already at capacity. Please choose another time.');
      error.status = 409;
      throw error;
    }
  }

  // Public (token-authenticated) iCalendar feed of all upcoming scheduled appointments, for staff calendar subscriptions.
  function feed(req, res, url) {
    const given = Buffer.from(String(url.searchParams.get('token') || '')), expected = Buffer.from(feedToken);
    if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) return fail(res, 404, 'Not found.'), true;
    const rows = q("SELECT * FROM appointments WHERE status = 'scheduled' AND starts_at >= ? ORDER BY starts_at LIMIT 1000").all(new Date(Date.now() - 30 * 86400000).toISOString());
    const events = rows.map(a => eventFor(a, requestOf(a), q('SELECT name, email FROM users WHERE id = ?').get(a.user_id))).concat(extraEvents());
    res.writeHead(200, { 'Content-Type': 'text/calendar; charset=utf-8', 'Cache-Control': 'private, max-age=300', 'Content-Disposition': 'inline; filename="appointments.ics"' });
    res.end(buildCalendar({ events, host, organizerEmail, timeZone }));
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
        let made;
        try {
          made = withTransaction(() => {
            const existing = q("SELECT * FROM appointments WHERE request_id = ? AND starts_at = ? AND kind = ? AND status = 'scheduled' ORDER BY id LIMIT 1").get(request.id, d.startsAt, d.kind);
            if (existing) return { appointment: existing, duplicate: true };
            assertCapacity(null, d.startsAt, d.duration, d.kind);
            const at = nowIso();
            const info = q('INSERT INTO appointments (uid, request_id, user_id, starts_at, duration_min, kind, location, notes, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
              .run(crypto.randomUUID(), request.id, request.user_id, d.startsAt, d.duration, d.kind, d.location, d.notes, at, at);
            const a = q('SELECT * FROM appointments WHERE id = ?').get(Number(info.lastInsertRowid));
            prepareDeliveries(a, 'new', ['customer', 'google']);
            return { appointment: a, duplicate: false };
          });
        } catch (error) {
          return fail(res, error.status || 500, error.message), true;
        }
        if (!made.duplicate) await sendDeliveries(made.appointment, ['customer', 'google'], 'new', request);
        const fresh = q('SELECT * FROM appointments WHERE id = ?').get(made.appointment.id);
        return json(res, made.duplicate ? 200 : 201, { appointment: view(fresh, request), duplicate: made.duplicate }), true;
      }
    }
    if ((m = pathname.match(/^\/api\/appointments\/(\d+)\/(ics|reschedule|cancel|delivery|retry-deliveries)$/))) {
      let a = q('SELECT * FROM appointments WHERE id = ?').get(Number(m[1]));
      const request = a && requestOf(a);
      if (!a || !canAccess(user, request)) return fail(res, 404, 'Appointment not found.'), true;
      const customer = q('SELECT name, email FROM users WHERE id = ?').get(a.user_id);
      if (m[2] === 'ics' && method === 'GET') {
        const ics = buildCalendar({ events: [eventFor(a, request, customer)], method: a.status === 'cancelled' ? 'CANCEL' : 'PUBLISH', host, organizerEmail, timeZone });
        res.writeHead(200, { 'Content-Type': 'text/calendar; charset=utf-8', 'Cache-Control': 'no-store', 'Content-Disposition': 'attachment; filename="appointment.ics"' });
        return res.end(ics), true;
      }
      if (m[2] === 'delivery' && method === 'GET') return json(res, 200, { appointment: view(a, request) }), true;
      if (method !== 'POST') return fail(res, 405, 'Method not allowed.'), true;
      if (m[2] === 'retry-deliveries') {
        await retryDeliveries(a);
        return json(res, 200, { appointment: view(q('SELECT * FROM appointments WHERE id = ?').get(a.id), request) }), true;
      }
      if (a.status !== 'scheduled') {
        if (m[2] === 'cancel' && a.status === 'cancelled') return json(res, 200, { appointment: view(a, request), duplicate: true }), true;
        return fail(res, 400, 'This appointment was already cancelled.'), true;
      }
      if (m[2] === 'reschedule') {
        if (!staff) return fail(res, 403, 'Only our team can reschedule. Send us a message to ask for a new time.'), true;
        const d = parseDetails(body);
        if (d.error) return fail(res, 400, d.error), true;
        let moved;
        try {
          moved = withTransaction(() => {
            const current = q('SELECT * FROM appointments WHERE id = ?').get(a.id);
            if (!current || current.status !== 'scheduled') throw new Error('This appointment is no longer active.');
            if (current.starts_at === d.startsAt && current.duration_min === d.duration && current.kind === d.kind && current.location === d.location && current.notes === d.notes) return { appointment: current, duplicate: true };
            assertCapacity(current, d.startsAt, d.duration, d.kind, current.id);
            q('UPDATE appointments SET starts_at = ?, duration_min = ?, kind = ?, location = ?, notes = ?, sequence = sequence + 1, updated_at = ? WHERE id = ?').run(d.startsAt, d.duration, d.kind, d.location, d.notes, nowIso(), a.id);
            const after = q('SELECT * FROM appointments WHERE id = ?').get(a.id);
            prepareDeliveries(after, 'updated', ['customer', 'google']);
            return { appointment: after, duplicate: false };
          });
        } catch (error) {
          return fail(res, error.status || 500, error.message), true;
        }
        if (!moved.duplicate) await sendDeliveries(moved.appointment, ['customer', 'google'], 'updated', request);
        a = q('SELECT * FROM appointments WHERE id = ?').get(a.id);
        return json(res, 200, { appointment: view(a, request), duplicate: moved.duplicate }), true;
      }
      const before = a;
      a = withTransaction(() => {
        const current = q('SELECT * FROM appointments WHERE id = ?').get(a.id);
        if (!current || current.status !== 'scheduled') throw new Error('This appointment was already cancelled.');
        q("UPDATE appointments SET status = 'cancelled', sequence = sequence + 1, updated_at = ? WHERE id = ?").run(nowIso(), a.id);
        const after = q('SELECT * FROM appointments WHERE id = ?').get(a.id);
        prepareDeliveries(after, 'cancelled', ['customer', ...(staff ? [] : ['staff']), 'google']);
        return after;
      });
      a = q('SELECT * FROM appointments WHERE id = ?').get(a.id);
      await sendDeliveries({ ...a, google_event_id: before.google_event_id }, ['customer', ...(staff ? [] : ['staff']), 'google'], 'cancelled', request);
      a = q('SELECT * FROM appointments WHERE id = ?').get(a.id);
      return json(res, 200, { appointment: view(a, request) }), true;
    }
    return false;
  }

  return { handle, feed };
}

module.exports = { createAppointments, KINDS };
