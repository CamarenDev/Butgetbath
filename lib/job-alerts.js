'use strict';
// Schedule and deadline warnings for the crew. A sweep runs every minute and warns assigned employees (in the portal and by email)
// before a job starts, when they are late to clock in, as the finish-by time approaches and when it passes. The office is told
// when a crew is late or a job runs over. Each warning is stored once per (employee, job, time), so changing a time re-arms it.
const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const LONG_SHIFT_MS = 10 * HOUR;
// Warnings that are older than this when first noticed (server was down) are skipped instead of sent late.
const CATCH_UP_MS = 3 * HOUR;

function createJobAlerts({ db, mailer = null, templates = null, notifyEmail = '', siteUrl = '', sweepMs = MINUTE, json, fail, readJson, currentUser, now = () => Date.now() }) {
  const q = sql => db.prepare(sql);
  const iso = ms => new Date(ms).toISOString();
  const mail = async message => { try { await mailer(message); } catch (error) { console.error('Email failed:', error.message); } };
  const fmt = ms => new Date(ms).toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: process.env.COMPANY_TIMEZONE || 'America/Chicago' });
  const time = value => { const t = Date.parse(value); return Number.isFinite(t) ? t : null; };

  function warn(emp, job, kind, severity, message, key, { office = '' } = {}) {
    const added = q('INSERT OR IGNORE INTO employee_alerts (employee_id, job_id, kind, severity, message, dedupe_key, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(emp.id, job?.id ?? null, kind, severity, message, key, iso(now())).changes;
    if (!added) return false;
    if (mailer && templates && emp.email && emp.notify_email !== 0) mail({ to: emp.email, ...templates.staffNotice({ name: emp.name, subject: message.split('\n')[0].slice(0, 120), body: message, url: `${siteUrl}/employee/` }) });
    if (office) {
      const shift = q('SELECT id FROM shifts WHERE employee_id = ? AND clock_out_at IS NULL ORDER BY id DESC').get(emp.id);
      q('INSERT INTO tracking_alerts (shift_id, employee_id, kind, message, created_at) VALUES (?, ?, ?, ?, ?)').run(shift?.id ?? null, emp.id, `schedule_${kind}`, office.slice(0, 500), iso(now()));
      if (mailer && templates && notifyEmail) mail({ to: notifyEmail, ...templates.officeAlert({ subject: `Schedule alert: ${emp.name}`, body: office, url: `${siteUrl}/admin/#location`, cta: 'Review in the admin portal' }) });
    }
    return true;
  }

  function sweep() {
    const t = now();
    const rows = q(`SELECT j.id AS job_id, j.title, j.scheduled_at, j.due_at, e.id, u.name, u.email, u.notify_email,
        (SELECT COUNT(*) FROM job_tools jt WHERE jt.job_id = j.id) AS tools, (SELECT COUNT(*) FROM job_tools jt WHERE jt.job_id = j.id AND jt.checked = 0) AS unpacked
      FROM jobs j JOIN job_assignments a ON a.job_id = j.id JOIN employees e ON e.id = a.employee_id JOIN users u ON u.id = e.user_id
      WHERE j.status IN ('open', 'in_progress') AND e.status = 'active' AND e.onboarding = ''`).all();
    const clockedOnJob = (empId, jobId, since) => Boolean(q('SELECT 1 FROM shifts WHERE employee_id = ? AND job_id = ? AND (clock_out_at IS NULL OR clock_in_at >= ?)').get(empId, jobId, iso(since)));
    const clockedIn = empId => Boolean(q('SELECT 1 FROM shifts WHERE employee_id = ? AND clock_out_at IS NULL').get(empId));
    let sent = 0;
    for (const r of rows) {
      const emp = r, job = { id: r.job_id };
      const start = time(r.scheduled_at), due = time(r.due_at), fresh = at => t - at <= CATCH_UP_MS;
      if (start != null) {
        const ready = r.tools ? ` ${r.unpacked ? `${r.unpacked} of ${r.tools} tools and supplies are not checked off yet. Open the job and pack your checklist.` : 'Your tool checklist is complete.'}` : '';
        if (t >= start - HOUR && t < start && !clockedOnJob(emp.id, job.id, start - 2 * HOUR)) sent += warn(emp, job, 'start_soon', 'info', `Upcoming job: ${r.title}\nYou are scheduled to start at ${fmt(start)}. Head to the job site and clock in when you arrive.${ready}`, `start_soon:${job.id}:${r.scheduled_at}`);
        if (t >= start + 15 * MINUTE && fresh(start + 15 * MINUTE) && !clockedOnJob(emp.id, job.id, start - HOUR) && !clockedIn(emp.id)) {
          sent += warn(emp, job, 'late_start', 'warning', `You have not clocked in yet: ${r.title}\nThe job was scheduled to start at ${fmt(start)}. Clock in as soon as you arrive, or tell the office if you are running late.`, `late_start:${job.id}:${r.scheduled_at}`, { office: `${emp.name} has not clocked in for "${r.title}" (scheduled ${fmt(start)}).` });
        }
      }
      if (due != null) {
        const wrap = r.title;
        if (t >= due - HOUR && t < due - 15 * MINUTE) sent += warn(emp, job, 'due_60', 'info', `One hour left: ${wrap}\nThis job must be finished by ${fmt(due)}. Start cleanup and photos soon and post your final update.`, `due_60:${job.id}:${r.due_at}`);
        if (t >= due - 15 * MINUTE && t < due) sent += warn(emp, job, 'due_15', 'warning', `15 minutes left: ${wrap}\nFinish by ${fmt(due)}. Wrap up, clean the site, take your completion photos and mark the job complete.`, `due_15:${job.id}:${r.due_at}`);
        if (t >= due && fresh(due)) sent += warn(emp, job, 'overdue', 'danger', `Past the finish time: ${wrap}\nThe finish-by time was ${fmt(due)}. Tell the office what is left so the schedule can be adjusted.`, `overdue:${job.id}:${r.due_at}`);
        if (t >= due + 30 * MINUTE && fresh(due + 30 * MINUTE)) sent += warn(emp, job, 'overdue_30', 'danger', `Still open 30 minutes past the finish time: ${wrap}\nThe office has been notified. Post an update with what remains.`, `overdue_30:${job.id}:${r.due_at}`, { office: `"${r.title}" is 30+ minutes past its finish-by time (${fmt(due)}). Crew member: ${emp.name}.` });
      }
    }
    for (const s of q(`SELECT s.id, s.clock_in_at, s.employee_id AS id, u.name, u.email, u.notify_email FROM shifts s JOIN employees e ON e.id = s.employee_id JOIN users u ON u.id = e.user_id WHERE s.clock_out_at IS NULL`).all()) {
      const at = time(s.clock_in_at);
      if (at != null && t - at >= LONG_SHIFT_MS) sent += warn(s, null, 'long_shift', 'warning', `You have been clocked in for over ${Math.floor((t - at) / HOUR)} hours\nIf you are finished, clock out now. Shifts over 16 hours are closed automatically.`, `long_shift:${s.clock_in_at}`);
    }
    return sent;
  }

  const view = a => ({ id: a.id, jobId: a.job_id, kind: a.kind, severity: a.severity, message: a.message, createdAt: a.created_at, read: Boolean(a.read_at) });

  async function handle(req, res, pathname, method) {
    if (pathname !== '/api/employee/alerts' && pathname !== '/api/employee/alerts/read') return false;
    const user = currentUser(req);
    if (!user) return fail(res, 401, 'Please sign in.'), true;
    const me = user.verified ? q("SELECT id FROM employees WHERE user_id = ? AND status = 'active'").get(user.id) : null;
    if (!me) return fail(res, 403, 'This account does not have employee access.'), true;
    if (method === 'GET' && pathname === '/api/employee/alerts') {
      const rows = q('SELECT * FROM employee_alerts WHERE employee_id = ? ORDER BY id DESC LIMIT 30').all(me.id);
      return json(res, 200, { unread: rows.filter(a => !a.read_at).length, alerts: rows.map(view), serverTime: iso(now()) }), true;
    }
    if (method === 'POST' && pathname === '/api/employee/alerts/read') {
      const body = await readJson(req, res);
      if (!body) return true;
      const ids = Array.isArray(body.ids) ? body.ids.map(Number).filter(Number.isInteger).slice(0, 100) : null;
      if (ids) for (const id of ids) q('UPDATE employee_alerts SET read_at = ? WHERE id = ? AND employee_id = ? AND read_at IS NULL').run(iso(now()), id, me.id);
      else q('UPDATE employee_alerts SET read_at = ? WHERE employee_id = ? AND read_at IS NULL').run(iso(now()), me.id);
      return json(res, 200, { ok: true }), true;
    }
    return false;
  }

  function start() {
    const timer = setInterval(() => { try { sweep(); } catch (error) { console.error('Job alert sweep failed:', error.message); } }, sweepMs);
    timer.unref?.();
    // Old, read alerts are pruned so the table stays small.
    const prune = () => { try { q('DELETE FROM employee_alerts WHERE created_at < ?').run(iso(now() - 60 * 24 * HOUR)); } catch { /* retried next hour */ } };
    prune();
    const pruneTimer = setInterval(prune, HOUR);
    pruneTimer.unref?.();
    return () => { clearInterval(timer); clearInterval(pruneTimer); };
  }

  return { handle, sweep, start };
}

module.exports = { createJobAlerts };
