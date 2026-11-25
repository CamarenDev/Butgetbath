const test = require('node:test');
const assert = require('node:assert/strict');
const { TASKS, handymanPlan } = require('../lib/handyman');
const { plan, workDay, scheduleFrom } = require('../lib/bathroom');
const { CUSHION, LIBRARY, SOURCES, HANDYMAN_REVISIONS, bathroomPhases } = require('../lib/labor-times');
const { taskHours } = require('../lib/install-details');
const { procedureFor, bathroomProcess, handymanProcess, BATH_STEPS } = require('../lib/playbook');
const { calibrate } = require('../lib/learning');

const rows = TASKS.map(t => ({ code: t.code, category: t.category, name: t.name, unit: t.unit, hrs: HANDYMAN_REVISIONS[t.code]?.[1] ?? t.hrs, mat_cents: 0, trade: t.trade, crew: t.crew || 1, min_hrs: t.min || 0, tags: t.tags }));

test('labor library cites a source for every figure and keeps the 8% cushion', () => {
  assert.equal(CUSHION, 0.08);
  for (const e of LIBRARY) { assert.ok(SOURCES[e.src], e.code); assert.equal(SOURCES[e.src].verificationStatus, 'provisional', e.code); assert.ok(e.low <= e.typ && e.typ <= e.high, e.code); }
});

test('the schedule adds the cushion to every working phase', () => {
  const phases = [['Work', 1, 2], ['Cure', 1, 0]];
  const s = scheduleFrom(phases, 1, workDay());
  assert.equal(s.phases[0].hours, 17.3);
  assert.equal(s.baseHours, 16);
  assert.equal(s.phases[1].hours, 0);
  const handy = handymanPlan({ tasks: { 'el-outlet': 1 } }, rows, { handyman_min_hours: 0 });
  const line = handy.items.find(i => i.kind === 'subcontractor');
  const outlet = rows.find(r => r.code === 'el-outlet');
  assert.equal(line.qty, taskHours(outlet, 1, CUSHION).total);
  assert.ok(line.qty > HANDYMAN_REVISIONS['el-outlet'][1] * 1.08);
  assert.throws(() => scheduleFrom(phases, Infinity, workDay()), /hoursFactor/);
  assert.throws(() => scheduleFrom(phases, 1, workDay({ work_start: '17:00', work_end: '08:00' })), /leave at least two|end after/);
  assert.throws(() => scheduleFrom(phases, 1, workDay(), '2026-02-30'), /calendar date/);
});

test('domain fixtures retain explicit zero inputs and distinguish missing learning facts', () => {
  const zero = plan({ floorSf: 0, shower: 'walk_in', showerLength: 0, showerWidth: 0, wallTileSf: 0 });
  assert.equal(zero.cfg.floor, 0);
  assert.equal(zero.cfg.wallTileSf, 0);
  assert.equal(zero.cfg.showerWalls, 0);
  const learned = calibrate([{ id: 1, base_cost_cents: 10000, actual_cost_cents: 10000, actual_hours: 0, predicted_cost_cents: 10000, base_by_section: '{}', actual_by_section: '{}', features: JSON.stringify({ hoursBase: 10 }) }]);
  assert.equal(learned.outcomes[0].actualHours, 0);
  assert.equal(learned.hoursJobs, 0);
  assert.equal(learned.hoursFactor, 1);
  assert.throws(() => taskHours(rows[0], Infinity, CUSHION), /quantity/);
});

test('a full remodel is planned from research-backed times in a realistic range', () => {
  const small = plan({ length: 8, width: 5, flooring: 'tile', shower: 'tub_surround', demo: true });
  const gut = plan({ length: 8, width: 6, shower: 'walk_in', flooring: 'tile', fullRemodel: true });
  const hours = cfg => scheduleFrom(bathroomPhases(cfg, true)).hours;
  assert.ok(hours(small.cfg) >= 55 && hours(small.cfg) <= 110, `pull and replace ${hours(small.cfg)}`);
  assert.ok(hours(gut.cfg) >= 140 && hours(gut.cfg) <= 260, `gut ${hours(gut.cfg)}`);
});

test('every job has a step-by-step method with tools and supplies', () => {
  for (const t of TASKS) {
    const p = procedureFor(t);
    assert.ok(p.specific && p.steps.length >= 3 && p.tools.length && p.supplies.length, t.code);
  }
  const custom = procedureFor({ code: 'custom-1', category: 'Plumbing', name: 'Odd job' });
  assert.ok(!custom.specific && custom.steps.length && custom.tools.length);
  assert.ok(procedureFor({ code: 'x', category: 'Unknown', name: 'y' }).steps.length >= 3);
  assert.ok(BATH_STEPS.every(s => s.steps.length && s.tools.length && s.supplies.length));
});

test('the bathroom process follows the schedule, with quantities for the job', () => {
  const gut = plan({ length: 8, width: 6, shower: 'walk_in', flooring: 'tile', fullRemodel: true });
  const { takeoffPlan } = require('../lib/bathroom');
  const { SEED } = require('../lib/estimating');
  const catalog = SEED.map(([code, category, name, kind, unit, cost, waste, tier], id) => ({ id, code, category, name, kind, unit, cost_cents: Math.round(cost * 100), waste_bp: waste * 100, tier }));
  const full = takeoffPlan({ length: 8, width: 6, shower: 'walk_in', flooring: 'tile', fullRemodel: true }, catalog);
  const proc = bathroomProcess(full);
  assert.ok(gut.cfg.gut);
  assert.equal(proc.steps.length, full.schedule.phases.length);
  assert.ok(proc.steps.every(s => s.hours >= 0 && s.tools.length));
  assert.ok(proc.steps.some(s => /waterproof/i.test(s.title)) && proc.steps.some(s => s.jobSupplies.length));
  assert.ok(Math.abs(proc.steps.reduce((n, s) => n + s.hours, 0) - proc.totalHours) < 1);
  const handy = handymanPlan({ tasks: { 'pl-toilet': 1, 'pt-walls': 400 } }, rows, {});
  const hp = handymanProcess(handy, rows, { tasks: { 'pl-toilet': 1, 'pt-walls': 400 } });
  assert.equal(hp.tasks.length, 2);
  assert.ok(hp.tasks[0].steps.length >= 3 && hp.tasks[1].hours > 8);
});
