const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { openDb } = require('../lib/db');
const { createJobAlerts } = require('../lib/job-alerts');

test('deadline warnings fire once per time, escalate, and re-arm when the time changes', () => {
  const db = openDb(fs.mkdtempSync(path.join(os.tmpdir(), 'bbs-alerts-')));
  const iso = '2026-06-01T00:00:00.000Z';
  db.prepare("INSERT INTO users (id, name, email, password_hash, created_at, verified) VALUES (1, 'Sam Crew', 'sam@example.com', 'x', ?, 1)").run(iso);
  db.prepare("INSERT INTO employees (id, user_id, status, created_at) VALUES (1, 1, 'active', ?)").run(iso);
  const start = Date.parse('2026-06-02T14:00:00Z'), due = start + 8 * 3600000;
  db.prepare("INSERT INTO jobs (id, title, status, scheduled_at, due_at, created_at, updated_at) VALUES (1, 'Tile shower', 'open', ?, ?, ?, ?)").run(new Date(start).toISOString(), new Date(due).toISOString(), iso, iso);
  db.prepare('INSERT INTO job_assignments (job_id, employee_id) VALUES (1, 1)').run();
  db.prepare("INSERT INTO job_tools (job_id, name, checked) VALUES (1, 'Wet saw', 0)").run();
  const sent = [];
  let t = start - 30 * 60000;
  const alerts = createJobAlerts({ db, mailer: async m => { sent.push(m); }, templates: { staffNotice: o => ({ subject: o.subject, text: o.body }), customerMessage: o => ({ subject: o.subject, text: o.body }), officeAlert: o => ({ subject: o.subject, text: o.body }) }, notifyEmail: 'office@example.com', now: () => t });
  const kinds = () => db.prepare('SELECT kind FROM employee_alerts ORDER BY id').all().map(r => r.kind);

  alerts.sweep(); alerts.sweep();
  assert.deepEqual(kinds(), ['start_soon']);
  assert.match(db.prepare('SELECT message FROM employee_alerts').get().message, /1 of 1 tools/);

  t = start + 20 * 60000; alerts.sweep();
  assert.deepEqual(kinds(), ['start_soon', 'late_start']);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM tracking_alerts WHERE kind = 'schedule_late_start'").get().n, 1);

  t = due - 10 * 60000; alerts.sweep();
  t = due + 31 * 60000; alerts.sweep();
  assert.deepEqual(kinds().slice(2), ['due_15', 'overdue', 'overdue_30']);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM tracking_alerts WHERE kind = 'schedule_overdue_30'").get().n, 1);

  db.prepare('UPDATE jobs SET due_at = ? WHERE id = 1').run(new Date(due + 4 * 3600000).toISOString());
  t = due + 4 * 3600000 - 10 * 60000; alerts.sweep();
  assert.equal(kinds().filter(k => k === 'due_15').length, 2);

  db.prepare("UPDATE jobs SET status = 'completed'").run();
  const before = kinds().length; t += 10 * 3600000; alerts.sweep();
  assert.equal(kinds().length, before);
  db.close();
});
