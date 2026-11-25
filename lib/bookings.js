'use strict';
// Self-service booking: customers pick a phone call, video call or in-home estimate from real open time slots (no account
// needed). Every booking emails the customer an .ics invite (with 1-day and 1-hour alarms) plus Google, Outlook and Apple
// links, and a private link to reschedule or cancel. A reminder email goes out about 24 hours before. Staff get an alert,
// a Bookings page, and the same events in the staff calendar feed and Google Calendar (when configured).
const crypto = require('node:crypto');
const { buildCalendar, googleAddUrl, outlookAddUrl } = require('./ical');

const KINDS = {
  phone: { label: 'Phone call', duration: 30, blurb: 'A 30-minute call to talk through your project, ballpark pricing and next steps.' },
  video: { label: 'Video call', duration: 30, blurb: 'Show us the bathroom on your phone camera so we can scope it without a visit.' },
  in_home: { label: 'Free in-home estimate', duration: 90, blurb: 'We visit, measure, check plumbing and tile conditions and give you a written quote.' }
};
const DAY_MS = 86400000;
const DEFAULT_CONFIG = {
  enabled: true,
  hours: { 0: null, 1: ['08:00', '18:00'], 2: ['08:00', '18:00'], 3: ['08:00', '18:00'], 4: ['08:00', '18:00'], 5: ['08:00', '18:00'], 6: null },
  stepMin: 30, leadHours: 4, maxDays: 45, travelBufferMin: 30,
  capacity: { phone: 2, video: 2, in_home: 1 },
  blackout: []
};
const STATUSES = ['scheduled', 'cancelled', 'completed', 'no_show'];

function createBookings({ db, mailer, templates, siteUrl, notifyEmail, gcal, timeZone = process.env.BUSINESS_TIMEZONE || 'America/Chicago', phone = '', json, fail, readJson, currentUser, isAdmin, limited, text, randomToken, sha256 }) {
  const q = sql => db.prepare(sql);
  const host = new URL(siteUrl).host;
  const organizerEmail = notifyEmail || `appointments@${host.replace(/:\d+$/, '')}`;
  const nowIso = () => new Date().toISOString();
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

  // ---------- Time zone helpers (business hours are wall-clock time in the business time zone)
  const partsFmt = new Intl.DateTimeFormat('en-US', { timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const offsetAt = ms => {
    const p = Object.fromEntries(partsFmt.formatToParts(new Date(ms)).map(x => [x.type, x.value]));
    return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(ms / 1000) * 1000;
  };
  const validDate = value => {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ''));
    if (!m) return false;
    const year = Number(m[1]), month = Number(m[2]), day = Number(m[3]);
    const check = new Date(Date.UTC(year, month - 1, day));
    return check.getUTCFullYear() === year && check.getUTCMonth() === month - 1 && check.getUTCDate() === day;
  };
  function zonedToUtc(date, minutes) {
    if (!validDate(date) || !Number.isInteger(minutes) || minutes < 0 || minutes >= 1440) return null;
    const [y, m, d] = date.split('-').map(Number);
    const wall = Date.UTC(y, m - 1, d, Math.floor(minutes / 60), minutes % 60);
    const wanted = { year: String(y), month: String(m).padStart(2, '0'), day: String(d).padStart(2, '0'), hour: String(Math.floor(minutes / 60)).padStart(2, '0'), minute: String(minutes % 60).padStart(2, '0'), second: '00' };
    const candidates = new Set();
    for (const deltaHours of [-36, -24, -12, 0, 12, 24, 36]) {
      const probe = wall + deltaHours * 3600000;
      const candidate = wall - offsetAt(probe);
      const p = dayParts(candidate);
      if (['year', 'month', 'day', 'hour', 'minute'].every(k => p[k] === wanted[k])) candidates.add(candidate);
    }
    return candidates.size ? Math.min(...candidates) : null;
  }
  const dayParts = ms => Object.fromEntries(partsFmt.formatToParts(new Date(ms)).map(x => [x.type, x.value]));
  const todayLocal = (ms = Date.now()) => { const p = dayParts(ms); return `${p.year}-${p.month}-${p.day}`; };
  const addDays = (date, n) => new Date(Date.UTC(...date.split('-').map((v, i) => i === 1 ? v - 1 : Number(v))) + n * DAY_MS).toISOString().slice(0, 10);
  const weekday = date => new Date(`${date}T12:00:00Z`).getUTCDay();
  const toMin = hhmm => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m; };
  const whenText = (iso, opts = { dateStyle: 'full', timeStyle: 'short' }) => new Intl.DateTimeFormat('en-US', { ...opts, timeZone }).format(new Date(iso));
  const tzName = new Intl.DateTimeFormat('en-US', { timeZone, timeZoneName: 'short' }).formatToParts(new Date()).find(p => p.type === 'timeZoneName')?.value || '';

  // ---------- Configuration
  function config() {
    let saved = {};
    try { saved = JSON.parse(q("SELECT value FROM settings WHERE key = 'booking.config'").get()?.value || '{}'); } catch { /* defaults */ }
    return { ...DEFAULT_CONFIG, ...saved, capacity: { ...DEFAULT_CONFIG.capacity, ...(saved.capacity || {}) }, hours: { ...DEFAULT_CONFIG.hours, ...(saved.hours || {}) } };
  }
  function cleanConfig(body) {
    const out = { enabled: body.enabled !== false, hours: {}, capacity: {}, blackout: [] };
    for (let d = 0; d < 7; d++) {
      const h = body.hours?.[d];
      if (!h) { out.hours[d] = null; continue; }
      const realTime = value => /^(\d{2}):(\d{2})$/.test(value) && ((Number(value.slice(0, 2)) < 24 && Number(value.slice(3)) < 60) || value === '24:00');
      if (!Array.isArray(h) || h.length !== 2 || !realTime(h[0]) || !realTime(h[1]) || h[0] === '24:00' || toMin(h[0]) >= toMin(h[1])) return { error: 'Open hours must be HH:MM with the start before the end.' };
      out.hours[d] = [h[0], h[1]];
    }
    for (const k of Object.keys(KINDS)) {
      const n = Number(body.capacity?.[k]);
      if (!Number.isInteger(n) || n < 1 || n > 20) return { error: 'Capacity must be a whole number from 1 to 20.' };
      out.capacity[k] = n;
    }
    if (out.capacity.phone !== out.capacity.video) return { error: 'Phone and video calls share remote capacity, so their limits must match.' };
    for (const [key, min, max] of [['stepMin', 15, 120], ['leadHours', 0, 168], ['maxDays', 1, 180], ['travelBufferMin', 0, 180]]) {
      const n = Number(body[key]);
      if (!Number.isInteger(n) || n < min || n > max) return { error: `${key} must be between ${min} and ${max}.` };
      out[key] = n;
    }
    if (body.blackout != null && !Array.isArray(body.blackout)) return { error: 'Blackout dates must be a list of YYYY-MM-DD values.' };
    for (const d of Array.isArray(body.blackout) ? body.blackout : []) {
      if (!validDate(d)) return { error: 'Blackout dates must be real dates in YYYY-MM-DD format.' };
      out.blackout.push(d);
    }
    out.blackout = [...new Set(out.blackout)].sort().slice(0, 200);
    return { config: out };
  }

  // ---------- Availability
  const groupOf = kind => kind === 'in_home' ? 'in_home' : 'remote';
  const lengthOf = (kind, c) => KINDS[kind].duration + (kind === 'in_home' ? c.travelBufferMin : 0);

  // Existing commitments between two instants. Staff-scheduled in-home appointments also block in-home capacity.
  function busy(fromMs, toMs) {
    const from = new Date(fromMs - DAY_MS).toISOString(), to = new Date(toMs + DAY_MS).toISOString();
    const rows = q("SELECT id, starts_at, duration_min, kind FROM bookings WHERE status = 'scheduled' AND starts_at >= ? AND starts_at <= ?").all(from, to)
      .concat(q("SELECT NULL AS id, starts_at, duration_min, kind FROM appointments WHERE status = 'scheduled' AND starts_at >= ? AND starts_at <= ?").all(from, to));
    const c = config();
    return rows.map(r => ({ id: r.id, start: Date.parse(r.starts_at), end: Date.parse(r.starts_at) + (r.duration_min + (r.kind === 'in_home' ? c.travelBufferMin : 0)) * 60000, group: groupOf(r.kind) }));
  }
  function slotsFor(date, kind, c = config(), taken = null, exceptId = 0) {
    if (!validDate(date) || !Object.hasOwn(KINDS, kind)) return [];
    const hours = c.hours[weekday(date)];
    const first = todayLocal(), last = addDays(first, c.maxDays);
    if (!c.enabled || !hours || c.blackout.includes(date) || date < first || date > last) return [];
    const open = toMin(hours[0]), close = toMin(hours[1]), len = lengthOf(kind, c), group = groupOf(kind), cap = group === 'in_home' ? c.capacity.in_home : Math.max(c.capacity.phone, c.capacity.video);
    const earliest = Date.now() + c.leadHours * 3600000;
    const dayStart = zonedToUtc(date, 0);
    if (dayStart === null) return [];
    const list = (taken || busy(dayStart, dayStart + DAY_MS)).filter(b => b.id !== exceptId && b.group === group);
    const out = [];
    for (let m = open; m + KINDS[kind].duration <= close; m += c.stepMin) {
      const start = zonedToUtc(date, m), end = start + len * 60000;
      if (start === null) continue;
      if (start < earliest) continue;
      if (list.filter(b => b.start < end && b.end > start).length >= cap) continue;
      out.push(new Date(start).toISOString());
    }
    return out;
  }
  const slotLabel = iso => new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', timeZone }).format(new Date(iso));

  // ---------- Views, calendar events and email
  const kindLabel = b => KINDS[b.kind]?.label || b.kind;
  const whereOf = b => b.kind === 'in_home' ? b.address : b.kind === 'phone' ? `We will call you at ${b.phone}` : 'We will email you a video link before the call';
  const manageUrl = token => `${siteUrl}/book/manage/?token=${token}`;
  function eventFor(b) {
    const description = [`${kindLabel(b)} with ${b.name}`, b.interest && `Project: ${b.interest}`, b.phone && `Phone: ${b.phone}`, b.notes, `Booking #${b.id}`].filter(Boolean).join('\n');
    const summary = b.kind === 'in_home' ? 'Free bathroom estimate: Budget Bath Solutions' : `${kindLabel(b)}: Budget Bath Solutions`;
    return { appointment: { ...b, location: whereOf(b) }, customer: { name: b.name, email: b.email }, description, summary, url: siteUrl };
  }
  const icsFor = (b, method = 'PUBLISH') => buildCalendar({ events: [eventFor(b)], method, organizerEmail, host, name: 'Budget Bath Solutions estimate', timeZone });
  const view = (b, token) => {
    const event = eventFor(b);
    return {
      id: b.id, kind: b.kind, kindLabel: kindLabel(b), startsAt: b.starts_at, durationMin: b.duration_min, when: whenText(b.starts_at), status: b.status, name: b.name, email: b.email, phone: b.phone,
      address: b.address, interest: b.interest, notes: b.notes, where: whereOf(b), timeZone: tzName, sequence: b.sequence, delivery: deliveryView(b),
      ...(token ? { googleUrl: googleAddUrl(event), outlookUrl: outlookAddUrl(event), icsPath: `/api/book/ics?token=${token}`, manageUrl: manageUrl(token) } : {})
    };
  }
  async function notifyCustomer(b, token, change) {
    const event = eventFor(b), cancelled = b.status === 'cancelled';
    const ics = icsFor(b, cancelled ? 'CANCEL' : 'REQUEST');
    await mailer({
      to: b.email,
      ...templates.booking({ name: b.name, change, kind: kindLabel(b), when: `${whenText(b.starts_at)} (${tzName})`, duration: b.duration_min, where: whereOf(b), notes: b.notes, inHome: b.kind === 'in_home', phone, manageUrl: manageUrl(token), googleUrl: googleAddUrl(event), outlookUrl: outlookAddUrl(event), icsUrl: `${siteUrl}/api/book/ics?token=${token}` }),
      attachments: [{ filename: 'appointment.ics', content: Buffer.from(ics).toString('base64'), content_type: `text/calendar; method=${cancelled ? 'CANCEL' : 'REQUEST'}; charset=UTF-8` }]
    });
  }
  async function notifyOffice(b, change) {
    if (!notifyEmail) return;
    await mailer({
      to: notifyEmail, replyTo: b.email, ...templates.bookingAlert({ change, kind: kindLabel(b), when: `${whenText(b.starts_at)} (${tzName})`, name: b.name, email: b.email, phone: b.phone, where: whereOf(b), interest: b.interest, notes: b.notes, adminUrl: `${siteUrl}/admin/#bookings` }),
      attachments: change === 'cancelled' ? [] : [{ filename: 'appointment.ics', content: Buffer.from(icsFor(b)).toString('base64'), content_type: 'text/calendar; charset=UTF-8' }]
    });
  }
  async function syncGoogle(b) {
    if (b.status !== 'scheduled') {
      if (b.google_event_id) {
        await gcal.remove(b.google_event_id);
        q('UPDATE bookings SET google_event_id = NULL WHERE id = ?').run(b.id);
      }
      return;
    }
    const id = await gcal.upsert(eventFor(b));
    if (id && id !== b.google_event_id) q('UPDATE bookings SET google_event_id = ? WHERE id = ?').run(id, b.id);
  }

  const deliveryKey = b => `booking.delivery.${b.uid}`;
  function deliveryState(b) {
    try {
      const saved = JSON.parse(q('SELECT value FROM settings WHERE key = ?').get(deliveryKey(b))?.value || '{}');
      return saved.sequence === b.sequence ? saved : { sequence: b.sequence, change: '', channels: {} };
    } catch (error) {
      console.error('Booking delivery state is invalid:', error.message);
      return { sequence: b.sequence, change: '', channels: {} };
    }
  }
  const writeDeliveryState = (b, state) => q("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(deliveryKey(b), JSON.stringify(state));
  function prepareDeliveries(b, change, channels) {
    const state = { sequence: b.sequence, change, channels: {} };
    for (const channel of channels) state.channels[channel] = { status: 'pending', change, attempt: 0, at: nowIso() };
    writeDeliveryState(b, state);
    return state;
  }
  const deliveryView = b => {
    const state = deliveryState(b);
    return { change: state.change || null, channels: state.channels };
  };
  async function deliverChannel(b, token, channel, change) {
    if (channel === 'staff' && !notifyEmail) {
      const state = deliveryState(b); state.channels.staff = { ...(state.channels.staff || {}), status: 'skipped', at: nowIso() }; writeDeliveryState(b, state); return;
    }
    if (channel === 'google' && !gcal.enabled) {
      const state = deliveryState(b); state.channels.google = { ...(state.channels.google || {}), status: 'skipped', at: nowIso() }; writeDeliveryState(b, state); return;
    }
    const state = deliveryState(b);
    const current = state.channels[channel] || {};
    if (current.status === 'sent') return;
    const inProgressAt = Date.parse(current.at);
    if (current.status === 'in_progress' && Number.isFinite(inProgressAt) && Date.now() - inProgressAt < 15 * 60000) return;
    state.change = change;
    state.channels[channel] = { status: 'in_progress', change, attempt: (current.attempt || 0) + 1, at: nowIso() };
    writeDeliveryState(b, state);
    try {
      if (channel === 'customer') await notifyCustomer(b, token, change);
      else if (channel === 'staff') await notifyOffice(b, change);
      else if (channel === 'reminder') await notifyCustomer(b, token, 'reminder');
      else if (channel === 'google') await syncGoogle(b);
      const latest = deliveryState(b);
      latest.channels[channel] = { ...state.channels[channel], status: 'sent', at: nowIso() };
      writeDeliveryState(b, latest);
    } catch (error) {
      console.error(`${channel} booking delivery failed:`, error.message);
      const latest = deliveryState(b);
      latest.channels[channel] = { ...state.channels[channel], status: 'failed', at: nowIso(), error: String(error.message || 'Delivery failed.').slice(0, 300) };
      writeDeliveryState(b, latest);
    }
  }
  async function sendDeliveries(b, token, channels, change) {
    for (const channel of channels) await deliverChannel(b, token, channel, change);
    return deliveryView(b);
  }
  async function retryDeliveries(b, token) {
    const state = deliveryState(b);
    for (const [channel, outcome] of Object.entries(state.channels)) {
      if (outcome.status === 'failed' || outcome.status === 'pending') await deliverChannel(b, token, channel, outcome.change || state.change);
    }
    return deliveryView(b);
  }

  // ---------- Customer record (marketing stays off unless they opt in)
  function saveCustomer(b, optin) {
    const now = nowIso(), note = [b.interest && `Interested in: ${b.interest}`, `Booked ${kindLabel(b)} for ${whenText(b.starts_at)}`].filter(Boolean).join('. ');
    const found = q('SELECT id FROM customers WHERE email = ? COLLATE NOCASE').get(b.email);
    if (!found) {
      const linked = q('SELECT id FROM users WHERE email = ? COLLATE NOCASE').get(b.email);
      const info = q("INSERT INTO customers (user_id, name, email, phone, address, status, notes, created_at, updated_at, marketing_optout, source, marketing_optin_at) VALUES (?, ?, ?, ?, ?, 'lead', ?, ?, ?, ?, 'website-booking', ?)")
        .run(linked?.id ?? null, b.name, b.email, b.phone, b.address, note, now, now, optin ? 0 : 1, optin ? now : '');
      return Number(info.lastInsertRowid);
    }
    q("UPDATE customers SET phone = CASE WHEN phone = '' THEN ? ELSE phone END, address = CASE WHEN address = '' THEN ? ELSE address END, updated_at = ? WHERE id = ?").run(b.phone, b.address, now, found.id);
    if (optin) q('UPDATE customers SET marketing_optout = 0, marketing_optin_at = ? WHERE id = ?').run(now, found.id);
    return found.id;
  }

  // The private manage link is an HMAC of the booking id: stable, unguessable, and re-creatable for signed-in customers.
  let secret = q("SELECT value FROM settings WHERE key = 'booking_secret'").get()?.value;
  if (!secret) { secret = randomToken(); q("INSERT INTO settings (key, value) VALUES ('booking_secret', ?)").run(secret); }
  const tokenFor = b => crypto.createHmac('sha256', secret).update(b.uid).digest('base64url');
  const tokenHash = token => sha256(String(token || ''));
  const byToken = token => /^[\w-]{20,80}$/.test(String(token || '')) ? q('SELECT * FROM bookings WHERE token_hash = ?').get(tokenHash(token)) : undefined;

  // ---------- Reminders: one email about a day before, skipped when the booking was made less than a day ahead
  async function sendReminders() {
    const now = Date.now();
    const due = q("SELECT * FROM bookings WHERE status = 'scheduled' AND reminded_at IS NULL AND starts_at > ? AND starts_at <= ?").all(new Date(now + 30 * 60000).toISOString(), new Date(now + 26 * 3600000).toISOString());
    for (const b of due) {
      const token = tokenFor(b), state = deliveryState(b);
      state.channels.reminder = state.channels.reminder || { status: 'pending', change: 'reminder', attempt: 0, at: nowIso() };
      writeDeliveryState(b, state);
      await deliverChannel(b, token, 'reminder', 'reminder');
      if (deliveryState(b).channels.reminder?.status === 'sent') q('UPDATE bookings SET reminded_at = ? WHERE id = ?').run(nowIso(), b.id);
    }
    return due.length;
  }

  // ---------- Request handling
  const clientBlock = body => {
    const f = {};
    for (const [k, max] of [['name', 120], ['email', 200], ['phone', 40], ['address', 300], ['interest', 120], ['notes', 1000], ['county', 100]]) {
      const v = text(body[k] ?? '', max);
      if (v === null) return { error: 'One of the fields is too long.' };
      f[k] = v;
    }
    return { f };
  };
  const dateOk = validDate;
  const parseInstant = value => {
    const raw = String(value || '');
    const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})$/.exec(raw);
    if (!m || !validDate(raw.slice(0, 10))) return null;
    if (Number(m[4]) > 23 || Number(m[5]) > 59 || Number(m[6] || 0) > 59) return null;
    if (m[7] !== 'Z') {
      const [hours, minutes] = m[7].slice(1).split(':').map(Number);
      if (hours > 14 || minutes > 59 || (hours === 14 && minutes)) return null;
    }
    const ms = Date.parse(raw);
    return Number.isFinite(ms) ? new Date(ms) : null;
  };

  function saveBooking(f, body, kind, startsAt, c) {
    const iso = startsAt.toISOString();
    return withTransaction(() => {
      const existing = q("SELECT * FROM bookings WHERE email = ? COLLATE NOCASE AND kind = ? AND starts_at = ? AND status = 'scheduled' ORDER BY id LIMIT 1").get(f.email, kind, iso);
      if (existing) return { booking: existing, duplicate: true };
      if (!slotsFor(todayLocal(startsAt.getTime()), kind, c).includes(iso)) {
        const error = new Error('That time was just taken or is no longer available. Please pick another time.');
        error.status = 409;
        throw error;
      }
      if (q("SELECT COUNT(*) AS n FROM bookings WHERE email = ? COLLATE NOCASE AND status = 'scheduled' AND starts_at >= ?").get(f.email, nowIso()).n >= 3) {
        const error = new Error('You already have several upcoming appointments. Please manage them from your confirmation email or call us.');
        error.status = 429;
        throw error;
      }
      const uid = crypto.randomUUID(), token = tokenFor({ uid }), at = nowIso();
      const early = startsAt.getTime() - Date.now() < 26 * 3600000;
      const info = q('INSERT INTO bookings (uid, token_hash, name, email, phone, address, county, interest, kind, starts_at, duration_min, notes, status, sequence, lang, reminded_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?)')
        .run(uid, tokenHash(token), f.name, f.email, f.phone, f.address, f.county, f.interest, kind, iso, KINDS[kind].duration, f.notes, 'scheduled', body.lang === 'es' ? 'es' : 'en', early ? at : null, at, at);
      const b = q('SELECT * FROM bookings WHERE id = ?').get(Number(info.lastInsertRowid));
      const customerId = saveCustomer(b, body.marketing === true);
      q('UPDATE bookings SET customer_id = ? WHERE id = ?').run(customerId, b.id);
      q('INSERT INTO contacts (type, name, email, phone, location, interest, message, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run('project', f.name, f.email, f.phone, f.county || f.address, f.interest || kindLabel(b), `Booked ${kindLabel(b)}: ${whenText(iso)}${f.notes ? '\n\n' + f.notes : ''}`, at);
      prepareDeliveries(b, 'new', ['customer', 'staff', 'google']);
      return { booking: q('SELECT * FROM bookings WHERE id = ?').get(b.id), duplicate: false };
    });
  }

  function rescheduleBooking(id, startsAt, enforceAvailability = true) {
    const iso = startsAt.toISOString();
    return withTransaction(() => {
      const b = q('SELECT * FROM bookings WHERE id = ?').get(id);
      if (!b || b.status !== 'scheduled') {
        const error = new Error('This appointment is no longer active.');
        error.status = 400;
        throw error;
      }
      if (b.starts_at === iso) return { booking: b, duplicate: true };
      if (enforceAvailability && !slotsFor(todayLocal(startsAt.getTime()), b.kind, config(), null, b.id).includes(iso)) {
        const error = new Error('That time is not available. Please pick another time.');
        error.status = 409;
        throw error;
      }
      const at = nowIso();
      q('UPDATE bookings SET starts_at = ?, sequence = sequence + 1, reminded_at = ?, updated_at = ? WHERE id = ?')
        .run(iso, startsAt.getTime() - Date.now() < 26 * 3600000 ? at : null, at, b.id);
      const after = q('SELECT * FROM bookings WHERE id = ?').get(b.id);
      prepareDeliveries(after, 'updated', ['customer', 'staff', 'google']);
      return { booking: after, duplicate: false };
    });
  }

  function cancelBooking(id) {
    return withTransaction(() => {
      const b = q('SELECT * FROM bookings WHERE id = ?').get(id);
      if (!b || b.status !== 'scheduled') {
        const error = new Error('This appointment is no longer active.');
        error.status = 400;
        throw error;
      }
      const at = nowIso();
      q("UPDATE bookings SET status = 'cancelled', sequence = sequence + 1, updated_at = ? WHERE id = ?").run(at, b.id);
      const after = q('SELECT * FROM bookings WHERE id = ?').get(b.id);
      prepareDeliveries(after, 'cancelled', ['customer', 'staff', 'google']);
      return after;
    });
  }

  async function handle(req, res, pathname, method) {
    if (!pathname.startsWith('/api/book') && !pathname.startsWith('/api/admin/bookings') && pathname !== '/api/account/bookings') return false;
    const url = new URL(req.url, 'http://localhost');
    let m;

    // ----- public
    if (method === 'GET' && pathname === '/api/book/config') {
      const c = config();
      return json(res, 200, { enabled: c.enabled, timeZone: tzName, timeZoneId: timeZone, maxDays: c.maxDays, phone, hours: c.hours, kinds: Object.entries(KINDS).map(([key, v]) => ({ key, label: v.label, duration: v.duration, blurb: v.blurb })) }), true;
    }
    if (method === 'GET' && pathname === '/api/book/days') {
      const kind = url.searchParams.get('kind');
      if (!KINDS[kind]) return fail(res, 400, 'Choose a type of appointment.'), true;
      const c = config(), first = todayLocal(), taken = busy(zonedToUtc(first, 0), zonedToUtc(addDays(first, c.maxDays + 1), 0));
      const days = [];
      for (let i = 0; i <= c.maxDays; i++) { const d = addDays(first, i); const n = slotsFor(d, kind, c, taken).length; if (n) days.push({ date: d, slots: n }); }
      return json(res, 200, { days, today: first }), true;
    }
    if (method === 'GET' && pathname === '/api/book/slots') {
      const kind = url.searchParams.get('kind'), date = url.searchParams.get('date');
      if (!KINDS[kind] || !dateOk(date)) return fail(res, 400, 'Choose a type and a day.'), true;
      return json(res, 200, { slots: slotsFor(date, kind).map(iso => ({ startsAt: iso, label: slotLabel(iso) })), timeZone: tzName }), true;
    }
    if (method === 'POST' && pathname === '/api/book') {
      if (limited(req, 'booking', 12, 60 * 60 * 1000)) return fail(res, 429, 'Too many booking attempts. Please call us or try again later.'), true;
      const { body, error } = await readJson(req, 8000);
      if (error) return fail(res, error === 'too-large' ? 413 : 400, 'Please check the form and try again.'), true;
      if (typeof body.website === 'string' && body.website.trim()) return json(res, 201, { booking: { status: 'scheduled' } }), true;
      const { f, error: bad } = clientBlock(body);
      if (bad) return fail(res, 400, bad), true;
      const kind = body.kind, c = config();
      if (!KINDS[kind]) return fail(res, 400, 'Choose a type of appointment.'), true;
      if (!f.name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email)) return fail(res, 400, 'Enter your name and a valid email so we can send your confirmation.'), true;
      if (f.phone.replace(/\D/g, '').length < 10) return fail(res, 400, 'Enter a phone number with area code.'), true;
      if (kind === 'in_home' && f.address.length < 8) return fail(res, 400, 'Enter the street address of the bathroom for an in-home visit.'), true;
      if (body.consent !== true) return fail(res, 400, 'Please agree to the privacy policy.'), true;
      const startsAt = parseInstant(body.startsAt);
      if (!startsAt) return fail(res, 400, 'Choose a valid day and time.'), true;
      let saved;
      try { saved = saveBooking(f, body, kind, startsAt, c); } catch (error) {
        return fail(res, error.status || 500, error.status ? error.message : 'We could not save that appointment. Your details are still here; please try again.'), true;
      }
      const fresh = saved.booking, token = tokenFor(fresh);
      if (!saved.duplicate) await sendDeliveries(fresh, token, ['customer', 'staff', 'google'], 'new');
      return json(res, saved.duplicate ? 200 : 201, { booking: view(q('SELECT * FROM bookings WHERE id = ?').get(fresh.id), token), duplicate: saved.duplicate }), true;
    }
    if (pathname === '/api/book/ics' && method === 'GET') {
      const b = byToken(url.searchParams.get('token'));
      if (!b) return fail(res, 404, 'Appointment not found.'), true;
      res.writeHead(200, { 'Content-Type': 'text/calendar; charset=utf-8', 'Cache-Control': 'no-store', 'Content-Disposition': 'attachment; filename="budget-bath-appointment.ics"' });
      return res.end(icsFor(b, b.status === 'cancelled' ? 'CANCEL' : 'PUBLISH')), true;
    }
    if (pathname === '/api/book/manage' && method === 'GET') {
      if (limited(req, 'booking-look', 60)) return fail(res, 429, 'Too many attempts. Please try again later.'), true;
      const token = url.searchParams.get('token'), b = byToken(token);
      if (!b) return fail(res, 404, 'We could not find that appointment. Use the link in your confirmation email.'), true;
      return json(res, 200, { booking: view(b, token), phone }), true;
    }
    if (pathname === '/api/book/delivery' && method === 'GET') {
      const token = url.searchParams.get('token'), b = byToken(token);
      if (!b) return fail(res, 404, 'Appointment not found.'), true;
      return json(res, 200, { booking: view(b, token) }), true;
    }
    if (method === 'POST' && pathname === '/api/book/retry-deliveries') {
      const { body, error } = await readJson(req, 2000);
      if (error) return fail(res, 400, 'Please try again.'), true;
      const b = byToken(body.token);
      if (!b) return fail(res, 404, 'Appointment not found.'), true;
      await retryDeliveries(b, body.token);
      return json(res, 200, { booking: view(q('SELECT * FROM bookings WHERE id = ?').get(b.id), body.token) }), true;
    }
    if (method === 'POST' && (pathname === '/api/book/cancel' || pathname === '/api/book/reschedule')) {
      if (limited(req, 'booking-edit', 30)) return fail(res, 429, 'Too many attempts. Please try again later.'), true;
      const { body, error } = await readJson(req, 4000);
      if (error) return fail(res, 400, 'Please try again.'), true;
      const b = byToken(body.token);
      if (!b) return fail(res, 404, 'We could not find that appointment.'), true;
      if (b.status !== 'scheduled') return fail(res, 400, 'This appointment is no longer active.'), true;
      if (pathname === '/api/book/cancel') {
        let after;
        try { after = cancelBooking(b.id); } catch (error) { return fail(res, error.status || 500, error.message), true; }
        await sendDeliveries({ ...after, google_event_id: b.google_event_id }, body.token, ['customer', 'staff', 'google'], 'cancelled');
        const fresh = q('SELECT * FROM bookings WHERE id = ?').get(b.id);
        return json(res, 200, { booking: view(fresh, body.token) }), true;
      }
      const startsAt = parseInstant(body.startsAt);
      if (!startsAt) return fail(res, 400, 'Choose a valid new day and time.'), true;
      let moved;
      try { moved = rescheduleBooking(b.id, startsAt); } catch (error) { return fail(res, error.status || 500, error.message), true; }
      if (!moved.duplicate) await sendDeliveries(moved.booking, body.token, ['customer', 'staff', 'google'], 'updated');
      return json(res, 200, { booking: view(q('SELECT * FROM bookings WHERE id = ?').get(b.id), body.token), duplicate: moved.duplicate }), true;
    }

    if (method === 'GET' && pathname === '/api/account/bookings') {
      const user = currentUser(req);
      if (!user) return fail(res, 401, 'Please sign in.'), true;
      if (!user.verified) return json(res, 200, { bookings: [] }), true;
      const rows = q("SELECT * FROM bookings WHERE email = ? COLLATE NOCASE AND status = 'scheduled' AND starts_at >= ? ORDER BY starts_at LIMIT 20").all(user.email, nowIso());
      return json(res, 200, { bookings: rows.map(b => view(b, tokenFor(b))) }), true;
    }

    // ----- staff
    if (pathname.startsWith('/api/admin/bookings')) {
      const user = currentUser(req);
      if (!isAdmin(user)) return fail(res, 403, 'Not allowed.'), true;
      if (method === 'GET' && pathname === '/api/admin/bookings') {
        const since = new Date(Date.now() - 30 * DAY_MS).toISOString();
        const rows = q('SELECT * FROM bookings WHERE starts_at >= ? ORDER BY starts_at').all(since);
        const upcoming = rows.filter(b => b.status === 'scheduled' && b.starts_at >= nowIso()).length;
        return json(res, 200, { bookings: rows.map(b => ({ ...view(b), staffNotes: b.staff_notes, customerId: b.customer_id, createdAt: b.created_at, dayKey: todayLocal(Date.parse(b.starts_at)) })), stats: { upcoming, total: rows.length }, timeZone: tzName }), true;
      }
      if (pathname === '/api/admin/bookings/config') {
        if (method === 'GET') return json(res, 200, { config: config(), kinds: Object.keys(KINDS) }), true;
        if (method === 'POST') {
          const { body, error } = await readJson(req, 8000);
          if (error) return fail(res, 400, 'Invalid request.'), true;
          const out = cleanConfig(body);
          if (out.error) return fail(res, 400, out.error), true;
          q("INSERT INTO settings (key, value) VALUES ('booking.config', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(JSON.stringify(out.config));
          return json(res, 200, { config: config() }), true;
        }
      }
      if ((m = pathname.match(/^\/api\/admin\/bookings\/(\d+)\/(cancel|reschedule|status|note)$/)) && method === 'POST') {
        const b = q('SELECT * FROM bookings WHERE id = ?').get(Number(m[1]));
        if (!b) return fail(res, 404, 'Booking not found.'), true;
        const { body, error } = await readJson(req, 4000);
        if (error) return fail(res, 400, 'Invalid request.'), true;
        const fresh = tokenFor(b);
        if (m[2] === 'note') {
          const note = text(body.note ?? '', 2000);
          if (note === null) return fail(res, 400, 'Note is too long.'), true;
          q('UPDATE bookings SET staff_notes = ?, updated_at = ? WHERE id = ?').run(note, nowIso(), b.id);
          return json(res, 200, { ok: true }), true;
        }
        if (m[2] === 'status') {
          if (!STATUSES.includes(body.status) || body.status === 'cancelled') return fail(res, 400, 'Choose completed or no-show.'), true;
          q('UPDATE bookings SET status = ?, updated_at = ? WHERE id = ?').run(body.status, nowIso(), b.id);
          return json(res, 200, { ok: true }), true;
        }
        if (b.status !== 'scheduled') return fail(res, 400, 'This booking is no longer active.'), true;
        if (m[2] === 'cancel') {
          let after;
          try { after = cancelBooking(b.id); } catch (error) { return fail(res, error.status || 500, error.message), true; }
          await sendDeliveries({ ...after, google_event_id: b.google_event_id }, fresh, ['customer', 'google'], 'cancelled');
          return json(res, 200, { ok: true }), true;
        }
        const startsAt = parseInstant(body.startsAt);
        if (!startsAt || startsAt.getTime() < Date.now() - 60000) return fail(res, 400, 'Choose a valid time in the future.'), true;
        let moved;
        try { moved = rescheduleBooking(b.id, startsAt, true); } catch (error) { return fail(res, error.status || 500, error.message), true; }
        if (!moved.duplicate) await sendDeliveries(moved.booking, fresh, ['customer', 'google'], 'updated');
        return json(res, 200, { ok: true }), true;
      }
    }
    return false;
  }

  // Confirmed bookings are also part of the staff subscription feed.
  const feedEvents = () => q("SELECT * FROM bookings WHERE status = 'scheduled' AND starts_at >= ? ORDER BY starts_at LIMIT 1000").all(new Date(Date.now() - 30 * DAY_MS).toISOString()).map(eventFor);

  const timer = setInterval(() => sendReminders().catch(error => console.error('Booking reminders failed:', error.message)), 5 * 60 * 1000);
  timer.unref();

  return { handle, feedEvents, sendReminders, zonedToUtc, slotsFor, todayLocal, validDate };
}

module.exports = { createBookings, KINDS };
