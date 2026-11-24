'use strict';
// Learning layer for the estimator. Every finished job records what it really cost. The estimator compares that with its
// uncalibrated ("base") prediction and learns a correction per section, plus a correction from the most similar past jobs.
// Corrections are always measured against the base prediction, so they never compound on themselves.

const SCALES = { floor: 30, ceiling: 2, age: 40, tier: 2, gut: 1, walkIn: 1, level: 2, condition: 2, glass: 4 };
const WEIGHTS = { floor: 1.5, ceiling: 0.5, age: 1, tier: 1.2, gut: 3, walkIn: 1, level: 0.5, condition: 1, glass: 0.5 };
const MIN_FACTOR = 0.75, MAX_FACTOR = 1.4, PRIOR = 4, DECAY = 0.92;

const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
const parse = (v, fallback) => { try { return typeof v === 'string' ? JSON.parse(v) : v ?? fallback; } catch { return fallback; } };
const index = (list, v) => Math.max(0, list.indexOf(v));

function featuresOf(c) {
  return {
    floor: c.floor, ceiling: c.ceiling, age: c.year > 0 ? Math.max(0, new Date().getFullYear() - c.year) : 25,
    tier: index(['good', 'better', 'best'], c.tier), gut: c.gut ? 1 : 0, walkIn: c.shower === 'walk_in' ? 1 : 0,
    level: index(['basement', 'first', 'upper'], c.level), condition: index(['good', 'fair', 'poor'], c.condition),
    glass: index(['none', 'curtain', 'slider', 'frameless', 'panel'], c.glassType)
  };
}

function distance(a, b) {
  let d = 0;
  for (const k of Object.keys(SCALES)) d += WEIGHTS[k] * (((a[k] ?? 0) - (b[k] ?? 0)) / SCALES[k]) ** 2;
  return Math.sqrt(d);
}

// Recency-weighted mean of ratios, pulled toward 1 until there is enough evidence.
function shrunk(ratios) {
  if (!ratios.length) return null;
  let sum = 0, weight = 0;
  ratios.forEach((r, i) => { const w = DECAY ** i; sum += r * w; weight += w; });
  const n = ratios.length;
  return clamp(1 + (sum / weight - 1) * (n / (n + PRIOR)), MIN_FACTOR, MAX_FACTOR);
}

// rows: estimate_outcomes rows, newest first.
function calibrate(rows = []) {
  const outcomes = rows.map(r => ({
    id: r.id, baseCost: r.base_cost_cents, actualCost: r.actual_cost_cents, actualHours: r.actual_hours || 0, predictedCost: r.predicted_cost_cents || 0,
    base: parse(r.base_by_section, {}), actual: parse(r.actual_by_section, {}), features: parse(r.features, {})
  })).filter(o => o.baseCost > 0 && o.actualCost > 0);
  const ratio = (a, b) => clamp(a / b, 0.4, 3);
  const overall = shrunk(outcomes.map(o => ratio(o.actualCost, o.baseCost))) ?? 1;
  const bySection = new Map();
  for (const o of outcomes) for (const [section, actual] of Object.entries(o.actual)) {
    const base = o.base[section];
    if (base > 0 && actual > 0) { if (!bySection.has(section)) bySection.set(section, []); bySection.get(section).push(ratio(actual, base)); }
  }
  const sections = {};
  for (const [section, ratios] of bySection) if (ratios.length >= 2) sections[section] = shrunk(ratios);
  const hoursRatios = outcomes.filter(o => o.actualHours > 0 && o.features.hoursBase > 0).map(o => ratio(o.actualHours, o.features.hoursBase));
  return { n: outcomes.length, overall, sections, outcomes, hoursFactor: shrunk(hoursRatios) ?? 1, hoursJobs: hoursRatios.length };
}

function similar(features, outcomes, k = 3) {
  const near = outcomes.map(o => ({ o, d: distance(features, o.features) })).filter(x => x.d < 3.5).sort((a, b) => a.d - b.d).slice(0, k);
  if (near.length < 2) return null;
  let sum = 0, weight = 0;
  for (const { o, d } of near) { const w = 1 / (1 + d); sum += clamp(o.actualCost / o.baseCost, 0.4, 3) * w; weight += w; }
  return { count: near.length, ratio: sum / weight, avgActualCents: Math.round(near.reduce((n, x) => n + x.o.actualCost, 0) / near.length) };
}

// Scales item costs in place. Returns what changed, for the estimator's notes.
function applyLearning(items, learned, features) {
  if (!learned || !learned.n) return { adjustments: [], comparables: null };
  const comparables = learned.n >= 3 ? similar(features, learned.outcomes) : null;
  const overall = comparables ? clamp(0.5 * learned.overall + 0.5 * comparables.ratio, MIN_FACTOR, MAX_FACTOR) : learned.overall;
  const used = new Map();
  for (const item of items) {
    if (item.section === 'Permits') continue;
    const factor = learned.sections[item.section] ?? overall;
    if (Math.abs(factor - 1) < 0.01) continue;
    item.cost_cents = Math.round(item.cost_cents * factor);
    used.set(item.section, factor);
  }
  return { adjustments: [...used].map(([section, factor]) => ({ section, factor: Math.round(factor * 1000) / 1000 })), comparables };
}

function accuracy(rows = []) {
  const recent = rows.slice(0, 20).filter(r => r.actual_cost_cents > 0 && r.base_cost_cents > 0);
  if (!recent.length) return { jobs: 0, baseErrorPct: null, adjustedErrorPct: null };
  const err = (p, a) => Math.abs(p - a) / a;
  const mean = list => Math.round(list.reduce((n, x) => n + x, 0) / list.length * 1000) / 10;
  return {
    jobs: recent.length,
    baseErrorPct: mean(recent.map(r => err(r.base_cost_cents, r.actual_cost_cents))),
    adjustedErrorPct: mean(recent.map(r => err(r.predicted_cost_cents || r.base_cost_cents, r.actual_cost_cents)))
  };
}

module.exports = { featuresOf, calibrate, applyLearning, similar, accuracy, parse };
