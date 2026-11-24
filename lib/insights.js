'use strict';
// Extra analysis layered on a takeoff plan. Every function here is deterministic and works from the plan, the saved
// settings and the learning history, so the numbers are explainable. Money is cents.

const lineCost = i => Math.round(i.qty * (1 + (i.waste_bp || 0) / 10000) * i.cost_cents);
const sum = (list, f = x => x) => list.reduce((n, x) => n + f(x), 0);
const group = (list, key) => list.reduce((m, x) => ((m[key(x)] ||= []).push(x), m), {});
const sf = c => Math.max(1, c.floor);

// Typical installed price per square foot of floor area for a mid-market remodel (reference range, edit to match your market).
const BENCH = { half: [250, 600], powder: [250, 600], hall: [200, 450], full: [200, 450], master: [250, 600] };

// Lead times in business days for items that are often special order.
const LEAD = [
  [/frameless|glass|shower door/i, 15, 'Custom shower glass is measured after tile is set and takes 2 to 3 weeks.'],
  [/vanity/i, 10, 'Vanities and tops are commonly special order. Order at signing.'],
  [/tile|mosaic|grout/i, 7, 'Order tile early and buy all boxes from the same dye lot.'],
  [/window|door slab|pocket/i, 14, 'Windows and doors are special order.'],
  [/tub|valve|trim kit/i, 7, 'Confirm the tub and valve before framing so rough-in matches.'],
  [/heated|radiant/i, 5, 'Heated floor mats are ordered to size.']
];

function insights({ plan, totals, settings, rows = {}, planAt, lines = [] }) {
  if (plan.cfg.kind === 'handyman') return handymanInsights({ plan, totals, settings, rows });
  const c = plan.cfg, items = plan.items.filter(i => !i.optional), s = plan.schedule, st = settings, out = {};
  const cost = sum(items, lineCost), price = totals.totalCents, labor = sum(items.filter(i => i.kind === 'labor'), lineCost);
  const mat = sum(items.filter(i => i.kind === 'material'), lineCost), bySec = group(items, i => i.section);

  // 1 Confidence score and 2 price range from how much the estimate rests on typed inputs and learned jobs.
  const asked = ['length', 'width', 'homeYear', 'condition', 'shower', 'flooring'].filter(k => rows.inputs && rows.inputs[k] !== undefined && rows.inputs[k] !== '').length;
  const conf = Math.max(35, Math.min(95, 45 + asked * 5 + Math.min(20, (rows.learnedJobs || 0) * 2) - (c.condition === 'poor' ? 8 : 0) - (c.year && c.year < 1960 ? 5 : 0)));
  const spread = (100 - conf) / 100 * 0.5;
  out.confidence = { score: conf, lowCents: Math.round(price * (1 - spread)), highCents: Math.round(price * (1 + spread)) };

  // 3 Good, better, best side by side.
  if (planAt) out.tiers = ['good', 'better', 'best'].map(t => { const p = planAt(t); return { tier: t, costCents: costTotal(p.items) }; });

  // 4 Risk register with dollar exposure.
  const risks = [];
  const risk = (name, why, pct) => risks.push({ name, why, exposureCents: Math.round(cost * pct) });
  if (c.year && c.year < 1978) risk('Lead paint', 'Home predates 1978. RRP practices and testing are required.', 0.03);
  if (c.year && c.year < 1980) risk('Asbestos in flooring or mastic', 'Test before demolition.', 0.03);
  if (c.condition !== 'good') risk('Hidden water damage', 'Rot behind tub or toilet is common.', c.condition === 'poor' ? 0.12 : 0.05);
  if (c.oldPlumbing || c.castIron) risk('Old drain and supply lines', 'Failed lines surface once walls are open.', 0.06);
  if (c.level === 'upper') risk('Upper-floor leak or structural', 'Joist damage can mean ceiling repair below.', 0.04);
  if (c.panelUpgrade === false && c.electricalChanges) risk('Panel capacity', 'New circuits may exceed the panel.', 0.03);
  if (c.gut) risk('Unknown wall contents', 'Gutting exposes wiring and framing issues.', 0.08);
  out.risks = risks;

  // 5 Margin analysis.
  out.margin = { grossCents: price - totals.taxCents - cost, grossPct: price ? Math.round(((price - totals.taxCents - cost) / price) * 1000) / 10 : 0, perLaborHourCents: s.hours ? Math.round((price - totals.taxCents - mat) / s.hours) : 0 };

  // 6 Price per square foot benchmark.
  const b = BENCH[c.bathType] || BENCH.full, psf = Math.round(price / 100 / sf(c));
  out.benchmark = { perSf: psf, typicalLow: b[0] * (c.gut ? 1.2 : 1), typicalHigh: b[1] * (c.gut ? 1.4 : 1) * 3, flag: psf < b[0] ? 'low' : psf > b[1] * 3 ? 'high' : 'ok' };

  // 7 Sensitivity: what a 10 percent swing in materials or labor does to the price.
  out.sensitivity = { materials10Cents: Math.round(mat * 0.1 * (totals.subtotalCents / Math.max(1, cost))), labor10Cents: Math.round(labor * 0.1 * (totals.subtotalCents / Math.max(1, cost))) };

  // 8 Price age and 9 quote validity.
  const age = st.prices_updated ? Math.floor((Date.now() - Date.parse(st.prices_updated)) / 86400000) : null;
  out.priceAge = { days: age, stale: age !== null && age > 60, note: age !== null && age > 60 ? 'Price book is more than 60 days old. Refresh before sending.' : 'Price book is current.' };
  out.validDays = age !== null && age > 30 ? 14 : 30;

  // 10 Procurement list grouped by section, with buy quantities rounded up.
  out.shopping = Object.entries(group(items.filter(i => i.kind === 'material'), i => i.section)).map(([section, rowsIn]) => ({ section, items: rowsIn.map(i => ({ name: i.name, qty: Math.ceil(i.qty * (1 + (i.waste_bp || 0) / 10000)), unit: i.unit, costCents: lineCost(i) })) }));

  // 11 Lead-time warnings.
  const leads = [];
  for (const [re, days, note] of LEAD) if (items.some(i => re.test(i.name))) leads.push({ days, note });
  if (c.permit) leads.push({ days: 10, note: 'Permit review can take 1 to 3 weeks. Do not schedule demolition before approval.' });
  out.leadTimes = leads.sort((a, z) => z.days - a.days);

  // 12 Milestone payment schedule.
  out.payments = [['Deposit at signing', 0.25], ['Start of tile / finish work', 0.4], ['Substantial completion', 0.25], ['Final walkthrough and punch list', 0.1]].map(([name, f]) => ({ name, cents: Math.round(price * f) }));

  // 13 Value engineering.
  const ve = [];
  if (c.tier === 'best') ve.push('Dropping to the Better tier on fixtures and tile typically saves 12 to 20 percent.');
  if (c.glassType === 'frameless') ve.push('A framed or semi-frameless door costs 30 to 40 percent less than fully frameless glass.');
  if (c.tilePattern !== 'standard') ve.push('A straight-lay pattern cuts tile labor and waste by about 15 percent.');
  if (c.heatedFloor) ve.push('Heated floor is an optional comfort item and is easy to defer.');
  if (c.plumbingChanges && !c.gut) ve.push('Keeping fixtures where they are avoids rough-in changes and often saves $800 to $2,500.');
  if (c.showerStyle === 'tile' && c.shower === 'tub_surround') ve.push('A one-piece or panel surround is cheaper and faster than tiled walls.');
  out.valueEngineering = ve;

  // 14 Aging in place and accessibility.
  const acc = [];
  if (c.shower !== 'none' && !c.curbless) acc.push('A curbless shower is the safest entry for aging in place.');
  if (!c.grabBars && c.shower !== 'none') acc.push('Add blocking for grab bars now, even if bars come later.');
  if (!c.doorWiden && c.floor > 35) acc.push('A 32 inch clear door opening is the minimum for wheelchair access.');
  out.accessibility = acc;

  // 15 Code compliance checks and 16 fan sizing (1 CFM per sq ft, 50 CFM minimum, bigger over 100 sq ft).
  const cfm = Math.max(50, Math.ceil(c.floor / 10) * 10 + (c.shower === 'walk_in' ? 20 : 0));
  out.fan = { cfm, note: `Choose a fan of at least ${cfm} CFM, ducted to the exterior.` };
  out.code = ['GFCI protection on every receptacle in the bathroom.', 'Exhaust fan ducted outdoors, not into the attic.', 'Tempered or safety glazing in and near the shower.', c.shower !== 'none' ? 'Shower valve should be pressure-balanced or thermostatic.' : null, 'Verify local code for working clearances: 21 in clear in front of the toilet and 15 in from its centerline to any wall.', c.permit ? 'Schedule rough-in and final inspections.' : 'Check whether your jurisdiction requires a permit for this scope.'].filter(Boolean);

  // 17 Circuit load check.
  const amps = (c.heatedFloor ? 12 : 0) + (c.fanHeater ? 12 : 0) + (c.towelWarmer ? 4 : 0) + (c.lighting ? 2 : 0) + (c.fan ? 1 : 0);
  out.electrical = { estimatedAmps: amps, note: amps > 16 ? 'Load is high. Use separate dedicated 20 amp circuits for the heater and the heated floor.' : 'One 20 amp bathroom circuit is likely enough.' };

  // 18 Tile order calculator.
  const tileSf = (c.flooring === 'tile' ? c.floor : 0) + (c.showerStyle === 'tile' ? c.showerWalls : 0);
  const over = c.tilePattern === 'herringbone' ? 0.2 : c.tilePattern === 'diagonal' ? 0.15 : 0.1;
  out.tile = tileSf ? { sf: tileSf, orderSf: Math.ceil(tileSf * (1 + over)), overagePct: over * 100, boxes12sf: Math.ceil(tileSf * (1 + over) / 12), note: 'Add one extra box for future repairs.' } : null;

  // 19 Dumpster size.
  const debris = Math.max(1, Math.round((c.demo ? sf(c) * (c.gut ? 0.5 : 0.25) : 0.3) * 10) / 10);
  out.dumpster = { cubicYards: debris, size: debris > 8 ? '20 yard' : debris > 4 ? '10 yard' : 'Trailer or bagster', note: c.gut ? 'A gut remodel can include a tub and cast iron. Check weight limits.' : 'Haul-away is included in the estimate.' };

  // 20 Trade hours split, 21 skill mix.
  const trades = [['Plumber', /plumb|shower|toilet|drain/i], ['Electrician', /electric|fan|light|gfci/i], ['Tile setter', /tile|waterproof|grout|backer/i], ['Carpenter / general', /demo|fram|trim|door|drywall|subfloor/i], ['Painter / finish', /paint|finish|close/i]];
  const laborRows = items.filter(i => i.kind === 'labor');
  out.trades = trades.map(([trade, re]) => ({ trade, hours: Math.round(sum(laborRows.filter(i => re.test(`${i.section} ${i.name}`)), i => i.unit === 'hr' ? i.qty : 0) * 10) / 10 })).filter(t => t.hours > 0);

  // 22 Dust and downtime for the homeowner.
  const off = c.singleBath ? 'This is the only bathroom, so plan a temporary option.' : 'Another bathroom stays usable.';
  out.downtime = { workingDays: s.days, calendarEnd: s.endDate, note: `${off} Water is shut off for part of ${Math.max(1, Math.ceil(s.days / 5))} day(s).` };

  // 23 Customer prep list.
  out.customerPrep = ['Clear the bathroom and the path to it.', 'Remove valuables and wall art nearby.', 'Tell us about pets and the best door for access.', 'Decide on all fixtures and finishes before demolition.', c.level === 'upper' ? 'Clear stairs and hallways for floor protection.' : null, c.condo ? 'Send us your building rules, work hours and insurance requirements.' : null].filter(Boolean);

  // 24 Warranty suggestions.
  out.warranty = ['1 year workmanship warranty on all labor.', c.showerStyle === 'tile' ? '5 year warranty on shower waterproofing.' : null, 'Manufacturer warranties pass to the homeowner on fixtures.'].filter(Boolean);

  // 25 Resale value hint.
  out.resale = { recoupPct: c.gut ? 60 : 70, note: 'Remodel cost recouped at resale is usually 60 to 70 percent for a midrange bathroom.' };

  // 26 Cost drivers: top sections by share.
  out.drivers = Object.entries(bySec).map(([section, list]) => ({ section, cents: sum(list, lineCost), pct: cost ? Math.round(sum(list, lineCost) / cost * 100) : 0 })).sort((a, z) => z.cents - a.cents).slice(0, 5);

  // 27 Completeness: questions the estimator would still like answered.
  const missing = [];
  const given = k => rows.inputs && rows.inputs[k] !== undefined && rows.inputs[k] !== '';
  if (!given('length') && !given('floorSf')) missing.push('Room length and width');
  if (!given('homeYear')) missing.push('Year the home was built (lead, asbestos and plumbing rules)');
  if (!given('condition')) missing.push('Condition of walls and floor');
  if (!given('level')) missing.push('Which floor the bathroom is on');
  if (c.shower !== 'none' && !given('showerLength') && c.showerStyle === 'tile') missing.push('Shower size');
  if (!given('windowCount')) missing.push('Number of windows');
  out.completeness = { score: Math.max(0, 100 - missing.length * 12), missing };

  // 28 Customer-friendly summary.
  out.summary = `This ${c.gut ? 'full remodel down to the studs' : 'remodel'} of a ${Math.round(c.floor)} sq ft ${c.bathType} bathroom is estimated at about ${Math.round(price / 100).toLocaleString('en-US')} dollars and ${s.days} working days with a crew of up to ${s.peakCrew}. Your price will be confirmed after an on-site inspection.`;

  // 29 Inspection checkpoints in the order they happen.
  const cp = [];
  if (c.permit) cp.push('Permit posted on site before work starts.');
  if (c.plumbingChanges || c.gut) cp.push('Plumbing rough-in and pressure test before walls close.');
  if (c.electricalChanges || c.gut) cp.push('Electrical rough-in inspection before insulation.');
  if (c.shower !== 'none') cp.push('Shower pan flood test (24 hours) and waterproofing check before tile.');
  cp.push('Final walkthrough with punch list.');
  out.inspections = cp;

  // 30 Seasonal note.
  const month = new Date().getMonth();
  out.seasonal = [11, 0, 1].includes(month) ? 'Winter: mortar and paint cure slowly in cold rooms. Keep the space heated.' : [5, 6, 7].includes(month) ? 'Summer is peak season: book crews and special-order items early.' : 'Shoulder season: scheduling is usually flexible.';

  // 31 Overtime and weekend premium note.
  out.premiums = { saturdayOn: st.work_saturday === '1', weekendPremiumPct: Number(st.weekend_premium_pct) || 0, regionFactorPct: Number(st.region_factor_pct) || 100 };

  // 32 Change-order exposure: share of the price that is allowance or unknown.
  const allowance = sum(items.filter(i => /allowance|contingen|unknown/i.test(i.name)), lineCost);
  out.allowances = { cents: allowance, note: allowance ? 'Allowances are replaced by real prices once you choose finishes.' : 'No allowances are included. Fixture choices fix the price.' };

  // 33 Learned correction in plain words.
  const adj = plan.adjustments || [];
  out.learning = { jobs: rows.learnedJobs || 0, applied: adj.length, note: rows.learnedJobs ? `Adjusted from ${rows.learnedJobs} finished job(s).` : 'No finished jobs recorded yet, so base prices are used. Record real costs to teach the estimator.' };

  // 34 Price breakdown by kind.
  out.byKind = ['material', 'labor', 'equipment', 'subcontractor', 'other'].map(k => ({ kind: k, cents: sum(items.filter(i => i.kind === k), lineCost) })).filter(k => k.cents);

  // 35 Daily cost to the customer for the schedule (useful when negotiating timeline).
  out.perDay = { cents: s.days ? Math.round(price / s.days) : 0 };
  return out;
}

// Insights for whole-house handyman work. Same shape as the bathroom insights; bathroom-only parts are null.
function handymanInsights({ plan, totals, settings: st, rows }) {
  const c = plan.cfg, items = plan.items.filter(i => !i.optional), s = plan.schedule, price = totals.totalCents;
  const cost = sum(items, lineCost), labor = sum(items.filter(i => i.kind === 'labor' || i.kind === 'subcontractor'), lineCost), mat = sum(items.filter(i => i.kind === 'material'), lineCost);
  const given = k => rows.inputs && rows.inputs[k] !== undefined && rows.inputs[k] !== '';
  const conf = Math.max(45, Math.min(95, 70 + (given('homeYear') ? 5 : 0) + (given('city') ? 3 : 0) - (c.hidden ? 12 : 0) - (c.exterior ? 4 : 0)));
  const spread = (100 - conf) / 100 * 0.5, out = {};
  out.confidence = { score: conf, lowCents: Math.round(price * (1 - spread)), highCents: Math.round(price * (1 + spread)) };
  out.tiers = null;
  const risks = [], risk = (name, why, pct) => risks.push({ name, why, exposureCents: Math.round(cost * pct) });
  if (c.leadSafe) risk('Lead paint', 'Pre-1978 home with painted surfaces being disturbed.', 0.05);
  if (c.asbestosTest) risk('Asbestos in old materials', 'Test before scraping or demolition.', 0.05);
  if (c.hidden) risk('Hidden damage', 'Leaks, rot or water damage often grow once opened up.', 0.15);
  if (c.exterior) risk('Weather delays', 'Exterior work depends on the forecast.', 0.03);
  if (c.year && c.year < 1960) risk('Older-home surprises', 'Out-of-square framing and old wiring or plumbing.', 0.06);
  out.risks = risks;
  const gross = price - totals.taxCents - cost;
  out.margin = { grossCents: gross, grossPct: price ? Math.round(gross / price * 1000) / 10 : 0, perLaborHourCents: s.hours ? Math.round((price - totals.taxCents - mat) / s.hours) : 0 };
  out.benchmark = null; out.sensitivity = { materials10Cents: Math.round(mat * 0.1 * (totals.subtotalCents / Math.max(1, cost))), labor10Cents: Math.round(labor * 0.1 * (totals.subtotalCents / Math.max(1, cost))) };
  const age = st.prices_updated ? Math.floor((Date.now() - Date.parse(st.prices_updated)) / 86400000) : null;
  out.priceAge = { days: age, stale: age !== null && age > 60, note: age !== null && age > 60 ? 'Prices are more than 60 days old. Refresh before sending.' : 'Prices are current.' };
  out.validDays = age !== null && age > 30 ? 14 : 30;
  out.shopping = Object.entries(group(items.filter(i => i.kind === 'material'), i => i.section)).map(([section, list]) => ({ section, items: list.map(i => ({ name: i.name.replace(': materials', ''), qty: Math.ceil(i.qty * (1 + (i.waste_bp || 0) / 10000)), unit: i.unit, costCents: lineCost(i) })) }));
  const leads = [...(c.leads || [])]; if (c.permit) leads.push({ days: 10, note: 'Permit review can take days to weeks. Do not start permitted work before approval.' });
  out.leadTimes = leads.sort((a, z) => z.days - a.days);
  out.payments = price > 150000 ? [['Deposit at signing', 0.3], ['Materials delivered', 0.3], ['Substantial completion', 0.3], ['Final walkthrough', 0.1]].map(([name, f]) => ({ name, cents: Math.round(price * f) })) : [['Deposit / materials', 0.5], ['Completion', 0.5]].map(([name, f]) => ({ name, cents: Math.round(price * f) }));
  const ve = [];
  if (c.taskCount > 3) ve.push('Bundling these jobs into one visit saves trip, setup and cleanup time.');
  if (c.tags.includes('paint')) ve.push('Do all prep and painting in one pass: patch, prime, then paint.');
  if (c.tags.includes('exterior')) ve.push('Schedule exterior jobs in dry weather and do the gutters, caulking and pressure washing in the same visit.');
  if (c.tags.includes('tvmount') || c.tags.includes('assembly')) ve.push('Small mounting and assembly jobs are cheapest when grouped with a larger project.');
  out.valueEngineering = ve;
  out.accessibility = c.tags.includes('grabBars') ? ['Grab bars must be fastened to blocking or a stud, not drywall alone.'] : [];
  out.fan = null; out.electrical = null; out.tile = null; out.dumpster = null;
  out.code = ['GFCI protection near water and outdoors.', c.tags.includes('electrical') ? 'Turn off and lock out the breaker before any electrical work.' : null, c.tags.includes('smoke') ? 'Smoke and CO alarms on every level and outside sleeping areas.' : null, c.tags.includes('roof') || c.tags.includes('ladder') ? 'Ladder and roof fall-protection safety rules apply.' : null].filter(Boolean);
  out.inspections = c.permit ? ['Book inspections for each permitted trade before covering work.'] : ['No permitted work in this scope. Take photos before, during and after.'];
  const trades = [['Handyman', i => i.kind === 'labor'], ['Licensed trades', i => i.kind === 'subcontractor']];
  out.trades = trades.map(([trade, f]) => ({ trade, hours: Math.round(sum(items.filter(f), i => i.unit === 'hr' ? i.qty : 0) * 10) / 10 })).filter(t => t.hours > 0);
  out.downtime = { workingDays: s.days, calendarEnd: s.endDate, note: `Work takes about ${s.days} working days. ${c.tags.includes('plumbing') ? 'Water may be shut off for part of a day. ' : ''}${c.tags.includes('electrical') ? 'Power to some circuits will be off briefly. ' : ''}`.trim() };
  out.customerPrep = ['Clear the work area and the path to it.', 'Tell us about pets and the best door for access.', 'Choose fixtures, paint colors and hardware before the visit.', c.exterior ? 'Move cars and outdoor furniture away from the work.' : null, c.condo ? 'Send us your building rules, work hours and insurance requirements.' : null].filter(Boolean);
  out.warranty = ['1 year workmanship warranty on labor.', 'Manufacturer warranties pass to the homeowner on installed products.'];
  out.resale = null;
  out.drivers = Object.entries(group(items, i => i.section)).map(([section, list]) => ({ section, cents: sum(list, lineCost), pct: cost ? Math.round(sum(list, lineCost) / cost * 100) : 0 })).sort((a, z) => z.cents - a.cents).slice(0, 5);
  const missing = [];
  if (!given('city')) missing.push('City of the job (for permit rules)');
  if (!given('homeYear')) missing.push('Year the home was built (lead and asbestos rules)');
  if (!c.taskCount) missing.push('The jobs to price');
  out.completeness = { score: Math.max(0, 100 - missing.length * 20), missing };
  out.summary = `${c.taskCount} job${c.taskCount === 1 ? '' : 's'} around the house, estimated at about ${Math.round(price / 100).toLocaleString('en-US')} dollars and ${s.days} working days with a crew of up to ${s.peakCrew}. The price is confirmed after an on-site look.`;
  const month = new Date().getMonth();
  out.seasonal = c.exterior ? ([11, 0, 1].includes(month) ? 'Winter: exterior painting, concrete and caulk need temperatures above about 40 F. Plan indoor jobs first.' : 'Exterior work depends on dry weather. Book early in spring and fall.') : 'Interior work can be scheduled any time of year.';
  out.premiums = { saturdayOn: st.work_saturday === '1', weekendPremiumPct: Number(st.weekend_premium_pct) || 0, regionFactorPct: Number(st.region_factor_pct) || 100 };
  out.allowances = { cents: 0, note: 'Fixtures and finishes you choose set the final price.' };
  out.learning = { jobs: 0, applied: 0, note: 'Handyman prices come from your task table and rates. Bathroom learning does not use handyman jobs.' };
  out.byKind = ['material', 'labor', 'equipment', 'subcontractor', 'other'].map(k => ({ kind: k, cents: sum(items.filter(i => i.kind === k), lineCost) })).filter(k => k.cents);
  out.perDay = { cents: s.days ? Math.round(price / s.days) : 0 };
  return out;
}

const costTotal = items => sum(items.filter(i => !i.optional), lineCost);

module.exports = { insights, lineCost };
