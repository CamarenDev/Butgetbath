// Clock in/out with consent-gated GPS tracking, device registration, admin location review and crew data for the estimator.
// Location is only collected while an employee is clocked in, only after they accept the notice, and is visible to admins only.
const DAY = 24 * 60 * 60 * 1000;
const CONSENT_VERSION = '2026-11';
const CONSENT_TEXT = 'I understand that while I am clocked in, this app records my phone\u2019s precise location (GPS), movement and device details, and shares them with Budget Bath Solutions management. Location sharing must stay on for the whole shift. Tracking stops when I clock out. I agree to this for this shift.';
const MAX_ACCURACY_M = 250;
const MAX_POINTS_PER_BATCH = 60;
const MAX_POINTS_PER_SHIFT = 20000;
const STALE_MS = 10 * 60 * 1000;
const MAX_SHIFT_MS = 16 * 60 * 60 * 1000;
const MINUTE = 60 * 1000;
const LIMITS = { lossMs: 5 * MINUTE, deniedMs: 2 * MINUTE, offsiteGraceMs: 3 * MINUTE, offsiteAutoMs: 20 * MINUTE, sweepMs: MINUTE };
const EVENT_KINDS = new Set(['permission_denied', 'permission_granted', 'position_unavailable', 'timeout', 'tracking_paused', 'tracking_resumed', 'low_accuracy', 'offline_batch', 'battery_low']);
const SOURCES = new Set(['in', 'out', 'watch', 'resume']);
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const num = (v, lo, hi) => { const n = typeof v === 'number' ? v : NaN; return Number.isFinite(n) && n >= lo && n <= hi ? n : null; };
const round = (n, d = 1) => n == null ? null : Math.round(n * 10 ** d) / 10 ** d;

function haversineM(a, b) {
  const rad = x => x * Math.PI / 180, dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 12742000 * Math.asin(Math.min(1, Math.sqrt(h)));
}

// Path length that ignores GPS jitter (tiny moves) and low-quality fixes.
function distanceM(points) {
  let total = 0, last = null;
  for (const p of points) {
    if (p.accuracy != null && p.accuracy > 100) continue;
    if (last) { const d = haversineM(last, p); if (d >= Math.max(8, (p.accuracy || 0) / 2)) { total += d; last = p; } } else last = p;
  }
  return total;
}

function createTracking({ db, security = null, trustProxy = false, retentionDays = 400, mailer = null, templates = null, notifyEmail = '', siteUrl = '', limits = {}, json, fail, readJson, currentUser, isAdmin, limited, text }) {
  const L = { ...LIMITS, ...limits };
  const q = sql => db.prepare(sql);
  const nowIso = () => new Date().toISOString();
  const clientIp = req => String(trustProxy ? (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket.remoteAddress : req.socket.remoteAddress || '').slice(0, 64);
  const validDate = v => typeof v === 'string' && DATE_RE.test(v) && !Number.isNaN(Date.parse(v));

  async function readBody(req, res, limit = 60000) {
    if (!(req.headers['content-type'] || '').toLowerCase().startsWith('application/json')) { fail(res, 415, 'Please submit from the website.'); return null; }
    const parsed = await readJson(req, limit);
    if (parsed.error) { fail(res, parsed.error === 'too-large' ? 413 : 400, 'Please check the request and try again.'); return null; }
    return parsed.body;
  }

  // Validates one browser position. Returns null when it is unusable.
  function cleanPoint(p, { now = Date.now(), minTime = 0, requireFresh = false } = {}) {
    if (!p || typeof p !== 'object') return null;
    const lat = num(p.lat, -90, 90), lng = num(p.lng, -180, 180), at = typeof p.at === 'number' ? p.at : Date.parse(p.at);
    if (lat === null || lng === null || !Number.isFinite(at)) return null;
    if (at > now + 60000 || at < minTime || (requireFresh && now - at > 120000)) return null;
    const accuracy = num(p.accuracy, 0, 100000);
    if (accuracy === null) return null;
    return {
      lat, lng, accuracy, altitude: num(p.altitude, -1000, 100000), altitudeAccuracy: num(p.altitudeAccuracy, 0, 100000), speed: num(p.speed, 0, 400), heading: num(p.heading, 0, 360),
      battery: num(p.battery, 0, 1), source: SOURCES.has(p.source) ? p.source : 'watch', at: new Date(at).toISOString()
    };
  }
  const insertPoint = (shiftId, p) => q('INSERT OR IGNORE INTO location_points (shift_id, lat, lng, accuracy, altitude, altitude_accuracy, speed, heading, battery, source, recorded_at, received_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .run(shiftId, p.lat, p.lng, p.accuracy, p.altitude, p.altitudeAccuracy, p.speed, p.heading, p.battery, p.source, p.at, nowIso()).changes;
  const touchFix = (shiftId, at) => q('UPDATE shifts SET last_fix_at = MAX(COALESCE(last_fix_at, \'\'), ?) WHERE id = ?').run(at, shiftId);
  const addEvent = (shiftId, kind, detail = '') => q('INSERT INTO location_events (shift_id, kind, detail, created_at) VALUES (?, ?, ?, ?)').run(shiftId, kind, String(detail).slice(0, 200), nowIso());

  const mail = async message => { try { await mailer(message); } catch (error) { console.error('Email failed:', error.message); } };
  const personOf = id => q('SELECT e.id, u.name, u.email, u.notify_email FROM employees e JOIN users u ON u.id = e.user_id WHERE e.id = ?').get(id);
  function raiseAlert(shift, kind, message) {
    q('INSERT INTO tracking_alerts (shift_id, employee_id, kind, message, created_at) VALUES (?, ?, ?, ?, ?)').run(shift.id, shift.employee_id, kind, message.slice(0, 500), nowIso());
    if (mailer && templates && notifyEmail) {
      const who = personOf(shift.employee_id);
      mail({ to: notifyEmail, ...templates.customerMessage({ name: 'team', subject: `Location alert: ${who?.name || 'employee'}`, body: `${who?.name || 'An employee'}: ${message}\n\nReview it in the admin portal under Location.` }) });
    }
  }
  // Integrity findings: logged on the shift timeline and the security log, with at most one admin alert per kind per shift.
  function flagIntegrity(shift, kind, message, ip = '') {
    addEvent(shift.id, kind, message);
    if (security) security.log(`gps_${kind}`, { severity: 'warn', userId: personUserId(shift.employee_id), ip, detail: `shift ${shift.id}: ${message}` });
    if (!q('SELECT 1 FROM tracking_alerts WHERE shift_id = ? AND kind = ?').get(shift.id, kind)) raiseAlert(shift, kind, `Location integrity: ${message}`);
  }
  const personUserId = employeeId => q('SELECT user_id FROM employees WHERE id = ?').get(employeeId)?.user_id ?? null;
  // A fix is implausible when it implies moving faster than ~290 km/h over a meaningful distance.
  function isJump(prev, p) {
    if (!prev) return false;
    const dt = Math.max(1, (Date.parse(p.at) - Date.parse(prev.at)) / 1000);
    const d = haversineM(prev, p) - Math.min(prev.accuracy || 0, 100) - Math.min(p.accuracy || 0, 100);
    return d > 300 && d / dt > 80;
  }
  function looksMocked(shiftId) {
    const last = q('SELECT lat, lng, accuracy FROM location_points WHERE shift_id = ? ORDER BY recorded_at DESC LIMIT 8').all(shiftId);
    if (last.length < 8) return false;
    return last.every(r => r.lat === last[0].lat && r.lng === last[0].lng && r.accuracy === last[0].accuracy);
  }
  function tellEmployee(shift, subject, body) {
    const who = personOf(shift.employee_id);
    if (mailer && templates && who?.email) mail({ to: who.email, ...templates.staffNotice({ name: who.name, subject, body, url: `${siteUrl}/employee/` }) });
  }
  const siteOf = jobId => { const j = jobId && q('SELECT site_lat AS lat, site_lng AS lng, site_radius_m AS radius FROM jobs WHERE id = ?').get(jobId); return j && j.lat != null && j.lng != null ? j : null; };
  const distToSite = (site, p) => Math.max(0, haversineM(site, p) - Math.min(p.accuracy || 0, 100));
  const insideSite = (site, p) => distToSite(site, p) <= site.radius;

  function registerDevice(employeeId, d, req) {
    const id = typeof d?.id === 'string' && /^[\w-]{8,64}$/.test(d.id) ? d.id : null;
    if (!id) return null;
    const s = (v, n) => typeof v === 'string' ? v.trim().slice(0, n) : '';
    const platform = s(d.platform, 60), model = s(d.model, 80), label = s(d.label, 120) || [model, platform].filter(Boolean).join(' \u00b7 ') || 'Unknown device';
    const details = JSON.stringify({ screen: s(d.screen, 20), language: s(d.language, 20), timezone: s(d.timezone, 60), platformVersion: s(d.platformVersion, 40), browser: s(d.browser, 120), memory: num(d.memory, 0, 1024), cores: num(d.cores, 0, 1024), touch: num(d.touch, 0, 100) });
    const now = nowIso();
    q('INSERT INTO employee_devices (id, employee_id, label, platform, model, user_agent, details, first_seen, last_seen) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(employee_id, id) DO UPDATE SET label = excluded.label, platform = excluded.platform, model = excluded.model, user_agent = excluded.user_agent, details = excluded.details, last_seen = excluded.last_seen')
      .run(id, employeeId, label, platform, model, String(req.headers['user-agent'] || '').slice(0, 300), details, now, now);
    return id;
  }

  const openShift = employeeId => q('SELECT * FROM shifts WHERE employee_id = ? AND clock_out_at IS NULL ORDER BY id DESC').get(employeeId);
  const lastPoint = shiftId => q('SELECT lat, lng, accuracy, battery, recorded_at AS at FROM location_points WHERE shift_id = ? ORDER BY recorded_at DESC LIMIT 1').get(shiftId);
  const minutesBetween = (a, b) => Math.max(0, Math.round((Date.parse(b) - Date.parse(a)) / 60000));

  function shiftStatus(s) {
    if (s.clock_out_at) return 'closed';
    if (openBreak(s.id)) return 'lunch';
    const last = s.last_fix_at || s.clock_in_at;
    return Date.now() - Date.parse(last) > STALE_MS ? 'stale' : 'live';
  }
  const gapsOf = shiftId => q("SELECT COUNT(*) AS n FROM location_events WHERE shift_id = ? AND kind IN ('permission_denied', 'tracking_paused', 'position_unavailable')").get(shiftId).n;

  function shiftSummary(s) {
    const end = s.clock_out_at || nowIso();
    const pts = q('SELECT lat, lng, accuracy FROM location_points WHERE shift_id = ? ORDER BY recorded_at').all(s.id);
    const last = s.clock_out_at ? null : lastPoint(s.id);
    return {
      id: s.id, employeeId: s.employee_id, employeeName: s.employee_name || '', jobId: s.job_id, jobTitle: s.job_title || '', clockInAt: s.clock_in_at, clockOutAt: s.clock_out_at, closedBy: s.closed_by,
      minutes: minutesBetween(s.clock_in_at, end), offsiteMinutes: s.clock_out_at ? s.offsite_minutes : s.offsite_minutes + (s.offsite_since && Date.now() - Date.parse(s.offsite_since) >= L.offsiteGraceMs ? minutesBetween(s.offsite_since, end) : 0),
      lunchMinutes: s.clock_out_at ? s.lunch_minutes : lunchMinutes(s.id), onLunchSince: s.clock_out_at ? null : openBreak(s.id)?.start_at || null,
      paidMinutes: s.paid_minutes ?? null, offsiteSince: s.clock_out_at ? null : s.offsite_since, geofence: Boolean(siteOf(s.job_id)), status: shiftStatus(s), deviceId: s.device_id, deviceLabel: s.device_label || '', points: pts.length, distanceKm: round(distanceM(pts) / 1000, 2),
      avgAccuracyM: pts.length ? Math.round(pts.reduce((n, p) => n + (p.accuracy || 0), 0) / pts.length) : null, interruptions: gapsOf(s.id),
      in: s.in_lat == null ? null : { lat: s.in_lat, lng: s.in_lng, accuracy: s.in_accuracy }, out: s.out_lat == null ? null : { lat: s.out_lat, lng: s.out_lng, accuracy: s.out_accuracy },
      last, lastPingAt: s.last_ping_at, lastFixAt: s.last_fix_at, note: s.note
    };
  }
  const SHIFT_SELECT = `SELECT s.*, u.name AS employee_name, j.title AS job_title, d.label AS device_label FROM shifts s JOIN employees e ON e.id = s.employee_id JOIN users u ON u.id = e.user_id
    LEFT JOIN jobs j ON j.id = s.job_id LEFT JOIN employee_devices d ON d.employee_id = s.employee_id AND d.id = s.device_id`;

  // ---------- Closing a shift (also creates the pending time entry so pay stays in the existing approval flow).
  // Only time on the job site is paid: continuous time away longer than the grace period is deducted.
  // ---------- Unpaid lunch: pauses pay and job-site checks; location is not required until the employee returns.
  const LUNCH_MAX_MS = Math.max(Number(process.env.LUNCH_MAX_MINUTES) || 90, 10) * MINUTE, MAX_BREAKS = 3;
  const openBreak = shiftId => q('SELECT * FROM shift_breaks WHERE shift_id = ? AND end_at IS NULL').get(shiftId);
  const inBreak = (shiftId, at) => Boolean(q('SELECT 1 FROM shift_breaks WHERE shift_id = ? AND start_at <= ? AND (end_at IS NULL OR end_at >= ?)').get(shiftId, at, at));
  function lunchMinutes(shiftId, until = nowIso()) {
    const ms = q('SELECT start_at, end_at FROM shift_breaks WHERE shift_id = ?').all(shiftId).reduce((n, b) => n + Math.max(0, Math.min(Date.parse(b.end_at || until), Date.parse(until)) - Date.parse(b.start_at)), 0);
    return Math.round(ms / MINUTE);
  }

  function closeShift(shift, { position, by, endAt, note = '' }) {
    const end = endAt || nowIso();
    const total = Math.min(minutesBetween(shift.clock_in_at, end), 24 * 60);
    let away = shift.offsite_minutes || 0;
    if (shift.offsite_since && Date.parse(end) - Date.parse(shift.offsite_since) >= L.offsiteGraceMs) away += minutesBetween(shift.offsite_since, end);
    const lunch = Math.min(lunchMinutes(shift.id, end), total);
    q('UPDATE shift_breaks SET end_at = ?, ended_by = ? WHERE shift_id = ? AND end_at IS NULL').run(end, by, shift.id);
    away = Math.min(away, total - lunch);
    const paid = total - away - lunch;
    const label = by === 'system' ? ' (closed automatically)' : by === 'admin' ? ' (closed by admin)' : '';
    let entryId = null;
    if (paid > 0 || total === 0) {
      entryId = Number(q('INSERT INTO time_entries (employee_id, job_id, work_date, minutes, note, rate_cents, created_at) VALUES (?, ?, ?, ?, ?, 0, ?)')
        .run(shift.employee_id, shift.job_id, shift.clock_in_at.slice(0, 10), Math.max(1, paid), `GPS-verified shift #${shift.id}${label}${lunch ? `, ${lunch} min unpaid lunch` : ''}${away ? `, ${away} min off site not counted` : ''}${note ? ` \u2013 ${note}` : ''}`.slice(0, 500), nowIso()).lastInsertRowid);
    }
    q('UPDATE shifts SET clock_out_at = ?, closed_by = ?, out_lat = ?, out_lng = ?, out_accuracy = ?, time_entry_id = ?, offsite_since = NULL, offsite_minutes = ?, paid_minutes = ?, lunch_minutes = ?, note = ? WHERE id = ?')
      .run(end, by, position?.lat ?? null, position?.lng ?? null, position?.accuracy ?? null, entryId, away, paid, lunch, note.slice(0, 300), shift.id);
    return { minutes: paid, offsiteMinutes: away };
  }

  // ---------- Job-site monitoring
  // Walks new fixes in time order: tracks continuous time away from the job site, forgives short GPS wobble, and records leave/return events.
  function evaluateSite(shiftId, points = []) {
    const shift = q('SELECT * FROM shifts WHERE id = ? AND clock_out_at IS NULL').get(shiftId);
    const site = shift && siteOf(shift.job_id);
    if (!site) return null;
    let since = shift.offsite_since, away = shift.offsite_minutes;
    for (const p of [...points].filter(p => !inBreak(shiftId, p.at)).sort((a, b) => a.at.localeCompare(b.at))) {
      if (insideSite(site, p)) {
        if (since) {
          const ms = Date.parse(p.at) - Date.parse(since);
          if (ms >= L.offsiteGraceMs) { const m = Math.round(ms / MINUTE); away += m; addEvent(shiftId, 'returned_to_site', `${m} min away`); }
          since = null;
        }
      } else if (!since) since = p.at;
    }
    q('UPDATE shifts SET offsite_since = ?, offsite_minutes = ? WHERE id = ?').run(since, away, shiftId);
    return { ...shift, offsite_since: since, offsite_minutes: away };
  }

  function autoClose(shift, { kind, reason, endAt }) {
    const fresh = q('SELECT * FROM shifts WHERE id = ? AND clock_out_at IS NULL').get(shift.id);
    if (!fresh) return;
    const lp = lastPoint(fresh.id);
    const { minutes, offsiteMinutes } = closeShift(fresh, { position: lp && { lat: lp.lat, lng: lp.lng, accuracy: lp.accuracy }, by: 'system', endAt, note: reason });
    addEvent(fresh.id, 'auto_clock_out', reason);
    raiseAlert(fresh, kind, `Clocked out automatically: ${reason} Paid time ${Math.floor(minutes / 60)}h ${minutes % 60}m${offsiteMinutes ? ` (${offsiteMinutes} min off site not counted)` : ''}.`);
    tellEmployee(fresh, 'You were clocked out automatically', `${reason}\n\nYour hours up to that point were submitted for approval. If this was a mistake, contact the office.`);
  }

  // Runs on a timer: escalates silent location loss and time away from the job site. Safe to call at any time.
  function sweep(now = Date.now()) {
    for (const shift of q('SELECT * FROM shifts WHERE clock_out_at IS NULL').all()) {
      const lastFix = shift.last_fix_at || shift.clock_in_at, lastFixMs = Date.parse(lastFix);
      const denied = q("SELECT created_at FROM location_events WHERE shift_id = ? AND kind = 'permission_denied' AND created_at > ? ORDER BY id DESC LIMIT 1").get(shift.id, lastFix);
      if (now - Date.parse(shift.clock_in_at) >= MAX_SHIFT_MS) { autoClose(shift, { kind: 'max_shift', reason: 'The shift ran past the 16 hour limit.', endAt: lastFix }); continue; }
      const lunch = openBreak(shift.id);
      if (lunch) {
        if (now - Date.parse(lunch.start_at) >= LUNCH_MAX_MS) autoClose(shift, { kind: 'lunch_overrun', reason: `Lunch ran longer than ${Math.round(LUNCH_MAX_MS / MINUTE)} minutes without clocking back in.`, endAt: lunch.start_at });
        continue;
      }
      if (denied && now - Date.parse(denied.created_at) >= L.deniedMs) { autoClose(shift, { kind: 'location_off', reason: 'Location sharing was turned off.', endAt: lastFix }); continue; }
      if (now - lastFixMs >= L.lossMs) { autoClose(shift, { kind: 'location_lost', reason: `No location was received for ${Math.round((now - lastFixMs) / MINUTE)} minutes (location turned off, phone off or no signal).`, endAt: lastFix }); continue; }
      if (shift.offsite_since) {
        const awayMs = now - Date.parse(shift.offsite_since);
        if (awayMs >= L.offsiteAutoMs) { autoClose(shift, { kind: 'left_site_auto', reason: `The employee left the job site and did not return for ${Math.round(awayMs / MINUTE)} minutes.`, endAt: shift.offsite_since }); continue; }
        if (awayMs >= L.offsiteGraceMs && !q("SELECT 1 FROM tracking_alerts WHERE shift_id = ? AND kind = 'left_site' AND created_at >= ?").get(shift.id, shift.offsite_since)) {
          addEvent(shift.id, 'left_site', `${Math.round(awayMs / MINUTE)} min and counting`);
          raiseAlert(shift, 'left_site', `Left the job site at ${shift.offsite_since.slice(11, 16)} UTC. Time away is unpaid and they will be clocked out after ${Math.round(L.offsiteAutoMs / MINUTE)} minutes.`);
        }
      }
    }
  }
  function startMonitor() {
    const timer = setInterval(() => { try { sweep(); } catch (error) { console.error('Location monitor failed:', error.message); } }, L.sweepMs);
    timer.unref();
    return () => clearInterval(timer);
  }

  function purgeOld() {
    const cutoff = new Date(Date.now() - retentionDays * DAY).toISOString();
    q('DELETE FROM location_points WHERE shift_id IN (SELECT id FROM shifts WHERE clock_in_at < ?)').run(cutoff);
    q('DELETE FROM location_events WHERE shift_id IN (SELECT id FROM shifts WHERE clock_in_at < ?)').run(cutoff);
  }

  // ---------- Reporting
  function range(query) {
    const today = nowIso().slice(0, 10);
    let to = validDate(query.get('to')) ? query.get('to') : today;
    let from = validDate(query.get('from')) ? query.get('from') : new Date(Date.parse(to) - 29 * DAY).toISOString().slice(0, 10);
    if (from > to) [from, to] = [to, from];
    if (Date.parse(to) - Date.parse(from) > 366 * DAY) from = new Date(Date.parse(to) - 366 * DAY).toISOString().slice(0, 10);
    return { from, to, start: `${from}T00:00:00.000Z`, end: new Date(Date.parse(to) + DAY).toISOString() };
  }

  // Live board: everyone active in the employee roster with where they are and what they are doing right now.
  function liveBoard() {
    const day = nowIso().slice(0, 10), shifts = new Map(q(`${SHIFT_SELECT} WHERE s.clock_out_at IS NULL`).all().map(s => [s.employee_id, shiftSummary(s)]));
    const people = q("SELECT e.id, u.name, e.role_title AS roleTitle FROM employees e JOIN users u ON u.id = e.user_id WHERE e.status = 'active' ORDER BY u.name").all();
    const rows = people.map(p => {
      const s = shifts.get(p.id) || null;
      const today = q("SELECT COALESCE(SUM(minutes), 0) AS m FROM time_entries WHERE employee_id = ? AND work_date = ?").get(p.id, day).m;
      const events = s ? q('SELECT kind, detail, created_at AS at FROM location_events WHERE shift_id = ? ORDER BY id DESC LIMIT 3').all(s.id) : [];
      const update = s && s.jobId ? q('SELECT author, body, created_at AS at FROM job_updates WHERE job_id = ? ORDER BY id DESC LIMIT 1').get(s.jobId) : null;
      const doing = !s ? 'Not clocked in' : s.status === 'lunch' ? 'On unpaid lunch' : s.offsiteSince ? 'Away from the job site' : s.jobTitle ? `Working on ${s.jobTitle}` : 'Clocked in (no specific job)';
      return { ...p, shift: s, doing, todayMinutes: today + (s ? s.minutes : 0), events, update };
    });
    const clocked = rows.filter(r => r.shift);
    return {
      at: nowIso(), rows,
      totals: { employees: rows.length, clockedIn: clocked.length, onSite: clocked.filter(r => r.shift.status === 'live' && !r.shift.offsiteSince).length, onLunch: clocked.filter(r => r.shift.status === 'lunch').length, offSite: clocked.filter(r => r.shift.offsiteSince).length, stale: clocked.filter(r => r.shift.status === 'stale').length, openAlerts: q('SELECT COUNT(*) AS n FROM tracking_alerts WHERE acknowledged_at IS NULL').get().n }
    };
  }

  function report(query, { employeeId = null } = {}) {
    const r = range(query);
    const jobId = Number(query.get('jobId')) || null;
    const empId = employeeId || Number(query.get('employeeId')) || null;
    const where = ['s.clock_in_at >= ?', 's.clock_in_at < ?'], args = [r.start, r.end];
    if (empId) { where.push('s.employee_id = ?'); args.push(empId); }
    if (jobId) { where.push('s.job_id = ?'); args.push(jobId); }
    const rows = q(`${SHIFT_SELECT} WHERE ${where.join(' AND ')} ORDER BY s.clock_in_at DESC LIMIT 1000`).all(...args).map(shiftSummary);
    const days = [];
    for (let t = Date.parse(r.from); t <= Date.parse(r.to); t += DAY) days.push(new Date(t).toISOString().slice(0, 10));
    const byDay = new Map(days.map(d => [d, { day: d, minutes: 0, shifts: 0, employees: new Set(), distanceKm: 0 }]));
    const byEmployee = new Map(), byJob = new Map();
    for (const s of rows) {
      const d = byDay.get(s.clockInAt.slice(0, 10));
      if (d) { d.minutes += s.minutes; d.shifts++; d.employees.add(s.employeeId); d.distanceKm += s.distanceKm; }
      const e = byEmployee.get(s.employeeId) || { id: s.employeeId, name: s.employeeName, shifts: 0, minutes: 0, offsiteMinutes: 0, distanceKm: 0, interruptions: 0, jobs: new Set() };
      e.shifts++; e.minutes += s.paidMinutes ?? Math.max(0, s.minutes - s.offsiteMinutes); e.offsiteMinutes += s.offsiteMinutes; e.distanceKm += s.distanceKm; e.interruptions += s.interruptions; if (s.jobId) e.jobs.add(s.jobId); byEmployee.set(s.employeeId, e);
      const key = s.jobId || 0, j = byJob.get(key) || { id: s.jobId, title: s.jobTitle || 'No specific job', shifts: 0, minutes: 0, employees: new Set() };
      j.shifts++; j.minutes += s.minutes; j.employees.add(s.employeeId); byJob.set(key, j);
    }
    const live = q(`${SHIFT_SELECT} WHERE s.clock_out_at IS NULL ${empId ? 'AND s.employee_id = ?' : ''} ORDER BY s.clock_in_at`).all(...(empId ? [empId] : [])).map(shiftSummary);
    return {
      from: r.from, to: r.to, live,
      totals: { shifts: rows.length, minutes: rows.reduce((n, s) => n + s.minutes, 0), distanceKm: round(rows.reduce((n, s) => n + s.distanceKm, 0), 1), employees: byEmployee.size, interruptions: rows.reduce((n, s) => n + s.interruptions, 0), paidMinutes: rows.reduce((n, s) => n + (s.paidMinutes ?? Math.max(0, s.minutes - s.offsiteMinutes)), 0), offsiteMinutes: rows.reduce((n, s) => n + s.offsiteMinutes, 0), stale: live.filter(s => s.status === 'stale').length },
      byDay: [...byDay.values()].map(d => ({ day: d.day, minutes: d.minutes, shifts: d.shifts, employees: d.employees.size, distanceKm: round(d.distanceKm, 1) })),
      byEmployee: [...byEmployee.values()].map(e => ({ ...e, jobs: e.jobs.size, distanceKm: round(e.distanceKm, 1) })).sort((a, b) => b.minutes - a.minutes),
      byJob: [...byJob.values()].map(j => ({ ...j, employees: j.employees.size })).sort((a, b) => b.minutes - a.minutes),
      alerts: q('SELECT a.id, a.shift_id AS shiftId, a.employee_id AS employeeId, u.name AS employeeName, a.kind, a.message, a.created_at AS createdAt, a.acknowledged_at AS acknowledgedAt FROM tracking_alerts a JOIN employees e ON e.id = a.employee_id JOIN users u ON u.id = e.user_id WHERE a.created_at >= ? AND a.created_at < ?' + (empId ? ' AND a.employee_id = ?' : '') + ' ORDER BY a.id DESC LIMIT 100').all(...[r.start, r.end, ...(empId ? [empId] : [])]),
      unacknowledged: q('SELECT COUNT(*) AS n FROM tracking_alerts WHERE acknowledged_at IS NULL' + (empId ? ' AND employee_id = ?' : '')).get(...(empId ? [empId] : [])).n,
      shifts: rows.slice(0, 300),
      employees: empId ? [] : q("SELECT e.id, u.name FROM employees e JOIN users u ON u.id = e.user_id ORDER BY u.name").all(),
      jobs: q('SELECT id, title FROM jobs ORDER BY id DESC LIMIT 300').all()
    };
  }

  function shiftDetail(id) {
    const s = q(`${SHIFT_SELECT} WHERE s.id = ?`).get(id);
    if (!s) return null;
    const points = q('SELECT lat, lng, accuracy, altitude, speed, heading, battery, source, recorded_at AS at FROM location_points WHERE shift_id = ? ORDER BY recorded_at LIMIT 5000').all(id);
    return {
      shift: shiftSummary(s), site: siteOf(s.job_id), points, breaks: q('SELECT kind, start_at AS startAt, end_at AS endAt, ended_by AS endedBy FROM shift_breaks WHERE shift_id = ? ORDER BY id').all(id), events: q('SELECT kind, detail, created_at AS at FROM location_events WHERE shift_id = ? ORDER BY id').all(id),
      consent: { version: s.consent_version, at: s.consent_at, ip: s.consent_ip, userAgent: s.consent_ua }, consentText: CONSENT_TEXT,
      device: q('SELECT id, label, platform, model, user_agent AS userAgent, details, first_seen AS firstSeen, last_seen AS lastSeen FROM employee_devices WHERE employee_id = ? AND id = ?').get(s.employee_id, s.device_id)
    };
  }

  const devicesOf = employeeId => q('SELECT id, label, platform, model, user_agent AS userAgent, details, first_seen AS firstSeen, last_seen AS lastSeen FROM employee_devices WHERE employee_id = ? ORDER BY last_seen DESC').all(employeeId)
    .map(d => ({ ...d, details: (() => { try { return JSON.parse(d.details); } catch { return {}; } })() }));

  // ---------- Estimator integration: who worked a job, and when
  function crewForJob(jobId) {
    if (!jobId) return null;
    const rows = q(`SELECT s.id, s.employee_id, s.clock_in_at, s.clock_out_at, u.name, e.role_title FROM shifts s JOIN employees e ON e.id = s.employee_id JOIN users u ON u.id = e.user_id WHERE s.job_id = ? ORDER BY s.clock_in_at`).all(jobId);
    if (!rows.length) return null;
    const people = new Map();
    let minutes = 0;
    for (const s of rows) {
      const m = minutesBetween(s.clock_in_at, s.clock_out_at || nowIso());
      minutes += m;
      const p = people.get(s.employee_id) || { employeeId: s.employee_id, name: s.name, role: s.role_title, minutes: 0, shifts: 0, days: new Set(), firstAt: s.clock_in_at, lastAt: s.clock_in_at };
      p.minutes += m; p.shifts++; p.days.add(s.clock_in_at.slice(0, 10)); p.lastAt = s.clock_out_at || s.clock_in_at; people.set(s.employee_id, p);
    }
    const allDays = new Set(rows.map(s => s.clock_in_at.slice(0, 10)));
    return {
      jobId, shifts: rows.length, trackedMinutes: minutes, trackedHours: round(minutes / 60, 2), crewSize: people.size, workDays: allDays.size, firstDay: rows[0].clock_in_at.slice(0, 10), lastDay: [...allDays].sort().at(-1),
      avgCrewPerDay: round(rows.length ? [...allDays].reduce((n, d) => n + new Set(rows.filter(s => s.clock_in_at.startsWith(d)).map(s => s.employee_id)).size, 0) / allDays.size : 0, 1),
      employees: [...people.values()].map(p => ({ ...p, hours: round(p.minutes / 60, 2), days: [...p.days].sort() })).sort((a, b) => b.minutes - a.minutes)
    };
  }

  // Per-employee experience across finished jobs the estimator has learned from.
  function crewStats(outcomeRows) {
    const stats = new Map();
    for (const r of outcomeRows) {
      let features; try { features = JSON.parse(r.features || '{}'); } catch { features = {}; }
      for (const c of features.crew?.employees || []) {
        const s = stats.get(c.employeeId) || { employeeId: c.employeeId, name: c.name, jobs: 0, hours: 0, lastDay: '', jobTypes: {} };
        s.jobs++; s.hours += c.hours || 0; s.name = c.name || s.name;
        const last = (c.days || []).at(-1) || ''; if (last > s.lastDay) s.lastDay = last;
        const type = features.jobType || 'bathroom'; s.jobTypes[type] = (s.jobTypes[type] || 0) + 1;
        stats.set(c.employeeId, s);
      }
    }
    return [...stats.values()].map(s => ({ ...s, hours: round(s.hours, 1) })).sort((a, b) => b.hours - a.hours);
  }

  // ---------- Routes
  async function portal(req, res, pathname, method) {
    const user = currentUser(req);
    if (!user) { fail(res, 401, 'Please sign in.'); return true; }
    const me = user.verified ? q("SELECT * FROM employees WHERE user_id = ? AND status = 'active'").get(user.id) : null;
    if (!me) { fail(res, 403, 'This account does not have employee access.'); return true; }
    if (me.onboarding) { fail(res, 403, 'Finish your onboarding and training before you clock in.'); return true; }

    if (method === 'GET' && pathname === '/api/employee/clock') {
      const shift = openShift(me.id);
      json(res, 200, {
        active: shift ? shiftSummary(q(`${SHIFT_SELECT} WHERE s.id = ?`).get(shift.id)) : null,
        consent: { version: CONSENT_VERSION, text: CONSENT_TEXT }, maxAccuracyM: MAX_ACCURACY_M, lunchMaxMinutes: Math.round(LUNCH_MAX_MS / MINUTE),
        jobs: q("SELECT j.id, j.title FROM jobs j JOIN job_assignments a ON a.job_id = j.id WHERE a.employee_id = ? AND j.status IN ('open', 'in_progress') ORDER BY j.id DESC").all(me.id),
        recent: q(`${SHIFT_SELECT} WHERE s.employee_id = ? AND s.clock_out_at IS NOT NULL ORDER BY s.clock_in_at DESC LIMIT 10`).all(me.id).map(s => { const v = shiftSummary(s); return { id: v.id, jobTitle: v.jobTitle, clockInAt: v.clockInAt, clockOutAt: v.clockOutAt, minutes: v.paidMinutes ?? v.minutes, offsiteMinutes: v.offsiteMinutes, closedBy: v.closedBy, note: v.note }; })
      });
      return true;
    }
    if (method !== 'POST' || !/^\/api\/employee\/clock\/(in|ping|out|lunch\/start|lunch\/end)$/.test(pathname)) return false;
    const action = pathname.slice('/api/employee/clock/'.length);
    if (limited(req, 'clock', 900)) { fail(res, 429, 'Too many requests. Please wait a moment.'); return true; }
    const body = await readBody(req, res, 120000);
    if (!body) return true;
    const now = Date.now();

    if (action === 'in') {
      if (openShift(me.id)) { fail(res, 409, 'You are already clocked in.'); return true; }
      if (body.consent !== true || body.consentVersion !== CONSENT_VERSION) { fail(res, 400, 'You must accept the location tracking notice to clock in.'); return true; }
      const knownDevice = typeof body.device?.id === 'string' && q('SELECT 1 FROM employee_devices WHERE employee_id = ? AND id = ?').get(me.id, body.device.id);
      const hadDevices = q('SELECT 1 FROM employee_devices WHERE employee_id = ?').get(me.id);
      const deviceId = registerDevice(me.id, body.device, req);
      if (!deviceId) { fail(res, 400, 'This device could not be identified. Reload the page and try again.'); return true; }
      const buddy = q('SELECT s.employee_id FROM shifts s WHERE s.device_id = ? AND s.employee_id != ? AND s.clock_out_at IS NULL').get(deviceId, me.id);
      if (buddy) { if (security) security.log('gps_shared_device', { severity: 'warn', userId: user.id, ip: clientIp(req), detail: `Clock-in attempt on a device already used by employee ${buddy.employee_id}` }); fail(res, 409, 'This device is already clocked in for another employee. Each person must clock in on their own phone.'); return true; }
      const p = cleanPoint({ ...body.position, source: 'in' }, { now, requireFresh: true });
      if (!p) { fail(res, 400, 'Location is required to clock in. Turn on location services, allow location for this site and try again.'); return true; }
      if (p.accuracy > MAX_ACCURACY_M) { fail(res, 400, `Your location is too imprecise (\u00b1${Math.round(p.accuracy)} m). Turn on precise location / GPS, step outside if needed and try again.`); return true; }
      let jobId = null;
      if (body.jobId) {
        jobId = Number(body.jobId);
        if (!q("SELECT 1 FROM job_assignments a JOIN jobs j ON j.id = a.job_id WHERE a.job_id = ? AND a.employee_id = ? AND j.status IN ('open', 'in_progress')").get(jobId, me.id)) { fail(res, 400, 'Choose one of your active jobs.'); return true; }
      }
      const site = siteOf(jobId);
      if (site && !insideSite(site, p)) { fail(res, 400, `You are about ${Math.round(distToSite(site, p))} m from the job site. Clock in when you arrive (you must be within ${site.radius} m).`); return true; }
      const at = nowIso();
      const { lastInsertRowid } = q('INSERT INTO shifts (employee_id, job_id, device_id, clock_in_at, in_lat, in_lng, in_accuracy, consent_version, consent_at, consent_ip, consent_ua, last_ping_at, last_fix_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
        .run(me.id, jobId, deviceId, at, p.lat, p.lng, p.accuracy, CONSENT_VERSION, at, clientIp(req), String(req.headers['user-agent'] || '').slice(0, 300), at, at);
      insertPoint(Number(lastInsertRowid), p);
      if (hadDevices && !knownDevice) flagIntegrity({ id: Number(lastInsertRowid), employee_id: me.id }, 'new_device', `Clocked in from a new device (${body.device?.label || 'unknown'}).`, clientIp(req));
      if (p.accuracy === 0) flagIntegrity({ id: Number(lastInsertRowid), employee_id: me.id }, 'gps_static', 'Reported a perfect 0 m accuracy at clock in, which real GPS never does.', clientIp(req));
      if (jobId) q("UPDATE jobs SET status = 'in_progress', updated_at = ? WHERE id = ? AND status = 'open'").run(at, jobId);
      purgeOld();
      json(res, 201, { id: Number(lastInsertRowid) });
      return true;
    }

    const shift = openShift(me.id);
    if (!shift) { fail(res, 409, 'You are not clocked in.'); return true; }
    const minTime = Date.parse(shift.clock_in_at) - 60000;

    const sentDevice = typeof body.deviceId === 'string' ? body.deviceId : body.device?.id;
    if (sentDevice !== shift.device_id) {
      flagIntegrity(shift, 'device_mismatch', `A request for this shift came from a different device than the one used to clock in.`, clientIp(req));
      if (action !== 'out') { fail(res, 409, 'This shift was started on another device. Use that phone, or clock out here.'); return true; }
    } else if (action === 'ping' && shift.consent_ua && String(req.headers['user-agent'] || '').slice(0, 300) !== shift.consent_ua) {
      addEvent(shift.id, 'browser_changed', 'Browser signature changed during the shift.');
    }

    if (action === 'lunch/start') {
      if (openBreak(shift.id)) { fail(res, 409, 'You are already on lunch.'); return true; }
      if (q('SELECT COUNT(*) AS n FROM shift_breaks WHERE shift_id = ?').get(shift.id).n >= MAX_BREAKS) { fail(res, 400, `You can take up to ${MAX_BREAKS} lunch breaks per shift. Clock out if you are done.`); return true; }
      const at = nowIso();
      let away = shift.offsite_minutes;
      if (shift.offsite_since && now - Date.parse(shift.offsite_since) >= L.offsiteGraceMs) away += minutesBetween(shift.offsite_since, at);
      q('UPDATE shifts SET offsite_since = NULL, offsite_minutes = ? WHERE id = ?').run(away, shift.id);
      q('INSERT INTO shift_breaks (shift_id, kind, start_at) VALUES (?, ?, ?)').run(shift.id, 'lunch', at);
      addEvent(shift.id, 'lunch_start', 'Unpaid lunch started');
      json(res, 201, { ok: true, startedAt: at, maxMinutes: Math.round(LUNCH_MAX_MS / MINUTE) });
      return true;
    }
    if (action === 'lunch/end') {
      const lunch = openBreak(shift.id);
      if (!lunch) { fail(res, 409, 'You are not on lunch.'); return true; }
      const p = cleanPoint({ ...body.position, source: 'resume' }, { now, requireFresh: true });
      if (!p) { fail(res, 400, 'Turn location back on to end your lunch. Location is required to clock back in.'); return true; }
      if (p.accuracy > MAX_ACCURACY_M) { fail(res, 400, `Your location is too imprecise (\u00b1${Math.round(p.accuracy)} m). Turn on precise location / GPS and try again.`); return true; }
      const site = siteOf(shift.job_id);
      if (site && !insideSite(site, p)) { fail(res, 400, `You are about ${Math.round(distToSite(site, p))} m from the job site. Return to the site (within ${site.radius} m) to end your lunch.`); return true; }
      const at = nowIso();
      q('UPDATE shift_breaks SET end_at = ?, ended_by = ? WHERE id = ?').run(at, 'employee', lunch.id);
      insertPoint(shift.id, p); touchFix(shift.id, p.at);
      q('UPDATE shifts SET last_ping_at = ?, lunch_minutes = ? WHERE id = ?').run(at, lunchMinutes(shift.id, at), shift.id);
      addEvent(shift.id, 'lunch_end', `Lunch ended after ${minutesBetween(lunch.start_at, at)} min`);
      json(res, 200, { ok: true, lunchMinutes: lunchMinutes(shift.id, at) });
      return true;
    }
    if (openBreak(shift.id) && action === 'ping') { json(res, 200, { saved: 0, active: true, onLunch: true, lossMs: L.lossMs }); return true; }

    if (action === 'ping') {
      const list = Array.isArray(body.points) ? body.points.slice(0, MAX_POINTS_PER_BATCH) : [];
      const have = q('SELECT COUNT(*) AS n FROM location_points WHERE shift_id = ?').get(shift.id).n;
      let saved = 0;
      const fresh = [];
      let rejected = 0;
      const before = at => q('SELECT lat, lng, accuracy, recorded_at AS at FROM location_points WHERE shift_id = ? AND recorded_at <= ? ORDER BY recorded_at DESC LIMIT 1').get(shift.id, at);
      const ordered = list.map(raw => cleanPoint(raw, { now, minTime })).filter(Boolean).sort((a, b) => a.at.localeCompare(b.at));
      if (have < MAX_POINTS_PER_SHIFT) for (const p of ordered) {
        if (isJump(before(p.at), p)) { rejected++; continue; }
        if (insertPoint(shift.id, p)) { saved++; fresh.push(p); }
      }
      if (rejected) flagIntegrity(shift, 'gps_jump', `${rejected} location fix(es) implied impossible travel speed and were ignored.`, clientIp(req));
      if (fresh.length && looksMocked(shift.id)) flagIntegrity(shift, 'gps_static', 'Location has been frozen to identical coordinates and accuracy, which can indicate a fake-GPS app.', clientIp(req));
      if (fresh.length) touchFix(shift.id, nowIso());
      for (const e of (Array.isArray(body.events) ? body.events.slice(0, 20) : [])) if (e && EVENT_KINDS.has(e.kind)) addEvent(shift.id, e.kind, e.detail || '');
      if (body.device && body.device.id === shift.device_id) registerDevice(me.id, body.device, req);
      q('UPDATE shifts SET last_ping_at = ? WHERE id = ?').run(nowIso(), shift.id);
      const state = evaluateSite(shift.id, fresh);
      const site = siteOf(shift.job_id), last = lastPoint(shift.id);
      json(res, 200, { saved, active: true, geofence: site ? { radius: site.radius, inside: last ? insideSite(site, last) : null, offsiteSince: state?.offsite_since || null, graceMs: L.offsiteGraceMs, autoMs: L.offsiteAutoMs } : null, lossMs: L.lossMs });
      return true;
    }

    // Clock out never requires location, so nobody is trapped in a shift if the phone dies or permission is revoked.
    const p = body.position ? cleanPoint({ ...body.position, source: 'out' }, { now, minTime }) : null;
    if (p) insertPoint(shift.id, p); else addEvent(shift.id, 'position_unavailable', 'No location at clock out');
    const note = text(body.note ?? '', 300) ?? '';
    if (p) touchFix(shift.id, p.at);
    evaluateSite(shift.id, p ? [p] : []);
    const { minutes, offsiteMinutes } = closeShift(q('SELECT * FROM shifts WHERE id = ?').get(shift.id), { position: p, by: 'employee', note });
    json(res, 200, { ok: true, minutes, offsiteMinutes });
    return true;
  }

  async function admin(req, res, pathname, method) {
    const user = currentUser(req);
    if (!user) { fail(res, 401, 'Please sign in.'); return true; }
    if (!isAdmin(user)) { fail(res, 403, 'Admin access required.'); return true; }
    const url = new URL(req.url, 'http://localhost');
    let m;

    if (method === 'GET' && pathname === '/api/admin/location/live') { json(res, 200, liveBoard()); return true; }
    if (method === 'GET' && pathname === '/api/admin/location') { json(res, 200, report(url.searchParams)); return true; }
    m = pathname.match(/^\/api\/admin\/location\/shifts\/(\d+)$/);
    if (m && method === 'GET') {
      const d = shiftDetail(Number(m[1]));
      if (!d) { fail(res, 404, 'Shift not found.'); return true; }
      json(res, 200, d);
      return true;
    }
    m = pathname.match(/^\/api\/admin\/location\/shifts\/(\d+)\/close$/);
    if (m && method === 'POST') {
      const shift = q('SELECT * FROM shifts WHERE id = ? AND clock_out_at IS NULL').get(Number(m[1]));
      if (!shift) { fail(res, 404, 'That shift is already closed.'); return true; }
      const last = shift.last_fix_at || shift.last_ping_at || shift.clock_in_at;
      const endAt = Date.now() - Date.parse(last) > STALE_MS || Date.now() - Date.parse(shift.clock_in_at) > MAX_SHIFT_MS ? last : nowIso();
      const lp = lastPoint(shift.id);
      closeShift(shift, { position: lp && { lat: lp.lat, lng: lp.lng, accuracy: lp.accuracy }, by: 'admin', endAt });
      addEvent(shift.id, 'position_unavailable', 'Closed by admin');
      if (security) security.log('admin_closed_shift', { userId: user.id, email: user.email, ip: clientIp(req), detail: `shift ${shift.id}` });
      json(res, 200, { ok: true });
      return true;
    }
    m = pathname.match(/^\/api\/admin\/location\/alerts\/(\d+)\/ack$/);
    if (m && method === 'POST') { q('UPDATE tracking_alerts SET acknowledged_at = COALESCE(acknowledged_at, ?) WHERE id = ?').run(nowIso(), Number(m[1])); json(res, 200, { ok: true }); return true; }
    if (method === 'POST' && pathname === '/api/admin/location/alerts/ack-all') { q('UPDATE tracking_alerts SET acknowledged_at = ? WHERE acknowledged_at IS NULL').run(nowIso()); json(res, 200, { ok: true }); return true; }
    m = pathname.match(/^\/api\/admin\/jobs\/(\d+)\/site$/);
    if (m && method === 'POST') {
      const job = q('SELECT id FROM jobs WHERE id = ?').get(Number(m[1]));
      if (!job) { fail(res, 404, 'Job not found.'); return true; }
      const body = await readBody(req, res, 2000);
      if (!body) return true;
      if (body.clear === true) { q('UPDATE jobs SET site_lat = NULL, site_lng = NULL WHERE id = ?').run(job.id); json(res, 200, { ok: true }); return true; }
      const lat = num(Number(body.lat), -90, 90), lng = num(Number(body.lng), -180, 180), radius = Math.round(Number(body.radius));
      if (lat === null || lng === null || body.lat === '' || body.lng === '' || !(radius >= 50 && radius <= 2000)) { fail(res, 400, 'Enter a valid latitude, longitude and a radius between 50 and 2000 meters.'); return true; }
      q('UPDATE jobs SET site_lat = ?, site_lng = ?, site_radius_m = ? WHERE id = ?').run(lat, lng, radius, job.id);
      json(res, 200, { ok: true });
      return true;
    }
    m = pathname.match(/^\/api\/admin\/employees\/(\d+)\/location$/);
    if (m && method === 'GET') {
      const id = Number(m[1]);
      if (!q('SELECT 1 FROM employees WHERE id = ?').get(id)) { fail(res, 404, 'Employee not found.'); return true; }
      json(res, 200, { ...report(url.searchParams, { employeeId: id }), devices: devicesOf(id) });
      return true;
    }
    return false;
  }

  async function handle(req, res, pathname, method) {
    if (pathname.startsWith('/api/employee/clock')) return portal(req, res, pathname, method);
    if (pathname.startsWith('/api/admin/location') || /^\/api\/admin\/(employees\/\d+\/location|jobs\/\d+\/site)$/.test(pathname)) return admin(req, res, pathname, method);
    return false;
  }

  return { handle, crewForJob, crewStats, sweep, startMonitor };
}

module.exports = { createTracking, haversineM, distanceM, CONSENT_VERSION };
