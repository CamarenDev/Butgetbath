'use strict';
// Estimator advisor: 22 deterministic checks layered on a takeoff plan. Everything is computed from the plan, the saved
// settings and the answers, so each number can be explained. Money is cents. Reference figures (permit fees, rental
// rates, utility rates, financing APR) are planning assumptions, not quotes; see ONLINE-VERIFICATION-TODO.md.

const { lineCost } = require('./insights');
const { SEED_MORE } = require('./bathroom');

const sum = (list, f = x => x) => list.reduce((n, x) => n + f(x), 0);
const cents = n => Math.round(n);
const iso = d => d.toISOString().slice(0, 10);
const parse = v => /^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) ? new Date(`${v}T12:00:00Z`) : null;
const addDays = (d, n) => { const x = new Date(d.getTime()); x.setUTCDate(x.getUTCDate() + n); return x; };
const addBiz = (d, n) => { let x = new Date(d.getTime()), step = n < 0 ? -1 : 1, left = Math.abs(n); while (left > 0) { x = addDays(x, step); if (![0, 6].includes(x.getUTCDay())) left--; } return x; };
const addMonths = (d, n) => { const x = new Date(d.getTime()); x.setUTCMonth(x.getUTCMonth() + n); return x; };
const nth = (year, month, weekday, n) => { const d = new Date(Date.UTC(year, month, 1, 12)); let c = 0; while (true) { if (d.getUTCDay() === weekday && ++c === n) return d; d.setUTCDate(d.getUTCDate() + 1); } };
const lastMon = (year, month) => { const d = new Date(Date.UTC(year, month + 1, 0, 12)); while (d.getUTCDay() !== 1) d.setUTCDate(d.getUTCDate() - 1); return d; };

function holidaysIn(year) {
  return [['New Year\u2019s Day', new Date(Date.UTC(year, 0, 1, 12))], ['Memorial Day', lastMon(year, 4)], ['Independence Day', new Date(Date.UTC(year, 6, 4, 12))], ['Labor Day', nth(year, 8, 1, 1)],
    ['Thanksgiving', nth(year, 10, 4, 4)], ['Day after Thanksgiving', addDays(nth(year, 10, 4, 4), 1)], ['Christmas Eve', new Date(Date.UTC(year, 11, 24, 12))], ['Christmas Day', new Date(Date.UTC(year, 11, 25, 12))]];
}

const LEAD = [
  [/frameless|glass|shower door|panel/i, 15, 'Custom shower glass is measured after tile is set and takes 2 to 3 weeks.'],
  [/vanity/i, 10, 'Vanities and tops are commonly special order.'],
  [/tile|mosaic/i, 7, 'Order all tile at once from one dye lot.'],
  [/window|pocket|door slab/i, 14, 'Windows and doors are special order.'],
  [/tub|valve|trim kit/i, 7, 'Confirm the tub and valve before framing.'],
  [/heated|radiant/i, 5, 'Heated floor mats are cut to size.']
];
const VOLATILE = /pipe|copper|pvc|pex|plywood|lumber|stud|drywall|cement|backer|tile|valve|faucet|vanity|glass|insulation/i;

function advisor({ plan, totals, settings: st = {}, inputs = {}, insights = {} }) {
  const c = plan.cfg, items = plan.items.filter(i => !i.optional), s = plan.schedule || { phases: [], days: 0, hours: 0 };
  const handy = c.kind === 'handyman', out = {};
  const cost = sum(items, lineCost), priceEx = Math.max(0, totals.totalCents - totals.taxCents);
  const labor = sum(items.filter(i => i.kind === 'labor'), lineCost), mat = sum(items.filter(i => i.kind === 'material'), lineCost);
  const num = (k, d) => { const n = Number(st[k]); return Number.isFinite(n) && st[k] !== '' && st[k] !== undefined ? n : d; };
  const ohPct = num('overhead_pct', 12) / 100, targetPct = num('target_margin_pct', 20) / 100, minPct = num('min_margin_pct', 8) / 100;
  const start = parse(inputs.startDate) || parse(s.phases[0] && s.phases[0].start) || new Date(), end = parse(s.endDate) || addBiz(start, Math.max(1, s.days || 1));
  const phases = s.phases || [];
  const phaseAt = re => phases.find(p => re.test(p.phase));

  // 1 Scope conflict checker.
  const conflicts = [], flag = (sev, text) => conflicts.push({ severity: sev, text });
  if (!handy) {
    if (c.curbless && c.level === 'upper') flag('high', 'A curbless shower on an upper floor means recessing the joists. Have the structure checked before promising it.');
    if (c.curbless && c.newTub) flag('medium', 'A curbless entry and a new tub are both selected. Confirm which one the customer wants.');
    if (c.heatedFloor && !c.electricalChanges && !(c.gfci > 0)) flag('medium', 'Heated floor needs its own GFCI circuit. Turn on electrical changes or add a GFCI.');
    if (c.glassType === 'frameless' && c.showerStyle === 'prefab') flag('medium', 'Frameless glass is usually paired with a tile or solid-surface shower, not a prefab unit.');
    if (c.flooring === 'tile' && !c.demo && !c.gut) flag('medium', 'Tile flooring is selected without demolition. Tile needs a bare, flat subfloor.');
    if (c.flooring === 'tile' && c.floor > 0 && c.condition === 'poor' && !c.subfloor) flag('high', 'The subfloor is rated poor but is not being replaced. Tile over a weak subfloor cracks.');
    if ((c.plumbingChanges || c.electricalChanges || c.gut) && !c.permit) flag('high', 'This scope normally needs a permit but permit is off.');
    if (c.year && c.year < 1978 && c.demo && !c.leadSafe) flag('high', 'Pre-1978 home with demolition and no lead-safe work practices selected.');
    if (c.ceiling && c.ceiling < 7) flag('medium', 'A ceiling under 7 ft may fail code for a bathroom. Re-measure.');
    if (c.floor > 150) flag('medium', `A ${Math.round(c.floor)} sq ft bathroom is unusually large. Check the length and width.`);
    if (c.shower === 'walk_in' && c.floor < 25) flag('medium', 'A walk-in shower in a very small room. Confirm clearances (30 in. minimum shower width).');
    if (c.level === 'basement' && c.plumbingChanges && !c.ejector) flag('medium', 'Basement plumbing changes usually need a sewage ejector pump.');
    if (c.leveler && c.flooring === 'none') flag('medium', 'Leveling is selected with no new flooring. Is the floor being finished?');
  }
  out.conflicts = conflicts;

  // 2 Estimate readiness by section.
  const has = k => inputs[k] !== undefined && inputs[k] !== null && inputs[k] !== '';
  const SECTIONS = [['Room size', ['length', 'width', 'ceilingHeight']], ['Home', ['homeYear', 'condition', 'level']], ['Fixtures', ['shower', 'flooring', 'vanityType', 'toiletMode']], ['Job site', ['city', 'startDate', 'carryFt', 'driveMiles']]];
  const secs = SECTIONS.map(([name, keys]) => ({ name, answered: keys.filter(has).length, total: keys.length, missing: keys.filter(k => !has(k)) }));
  const answered = sum(secs, x => x.answered), totalQ = sum(secs, x => x.total);
  out.readiness = { score: Math.round(answered / totalQ * 100), sections: secs };

  // 3 Hidden-condition allowance by home age and condition (what to hold back mentally or put in writing).
  const hidden = [], hc = (name, low, high, why) => hidden.push({ name, lowCents: cents(low), highCents: cents(high), why });
  if (!handy) {
    if (c.year && c.year < 1978) hc('Lead-safe practices', 150e2, 1200e2, 'Home built before 1978: RRP containment, signage and cleaning verification.');
    if (c.year && c.year < 1980) hc('Asbestos test and possible abatement', 450e2, 3500e2, 'Test flooring, mastic and joint compound before demolition. Abatement is by a licensed contractor.');
    if (c.year && c.year < 1960) hc('Old supply and drain lines', 800e2, 4500e2, 'Galvanized or cast iron lines often need replacing once the wall is open.');
    if (c.condition === 'poor') hc('Rot or mold behind the tub or toilet', 1200e2, 6000e2, 'Rated poor: expect framing, subfloor and mold treatment.');
    else if (c.condition === 'fair') hc('Minor hidden damage', 300e2, 1500e2, 'Rated fair or unknown: some softness behind fixtures is common.');
    if (c.level === 'upper') hc('Ceiling damage below', 400e2, 2000e2, 'A leak on an upper floor often stains or damages the ceiling underneath.');
  }
  out.hidden = { items: hidden, lowCents: sum(hidden, x => x.lowCents), highCents: sum(hidden, x => x.highCents) };

  // 4 Permit timeline and fee.
  const permitNeeded = !!(c.permit || c.plumbingChanges || c.electricalChanges || c.gut || (c.permitList && c.permitList.length));
  out.permit = permitNeeded
    ? { needed: true, reviewDays: c.gut ? [10, 25] : [3, 15], feeCents: [Math.max(7500, Math.min(60000, cents(priceEx * 0.015) / 2)), Math.max(15000, Math.min(60000, cents(priceEx * 0.015)))], note: 'Typical for Illinois suburbs. Confirm fees and review time with the building department, and apply before the start date.' }
    : { needed: false, note: 'No permit triggers found. Confirm with the building department.' };

  // 5 Order-by dates for long-lead items.
  const orders = [], seen = new Set();
  for (const i of plan.items) for (const [re, days, note] of LEAD) if (re.test(i.name) && !seen.has(String(re))) {
    seen.add(String(re));
    const need = /glass|shower door|panel/i.test(i.name) ? (phaseAt(/tile|paint|fixture/i) ? parse(phaseAt(/paint|fixture/i)?.start || phaseAt(/tile/i).start) : end) : start;
    orders.push({ item: i.name, leadDays: days, orderBy: iso(addBiz(need || start, -days)), note });
  }
  out.orders = orders.sort((a, b) => a.orderBy.localeCompare(b.orderBy));

  // 6 Material price volatility and quote validity.
  const volMat = sum(items.filter(i => i.kind === 'material' && VOLATILE.test(i.name)), lineCost), volPct = mat ? Math.round(volMat / mat * 100) : 0;
  const validDays = volPct > 60 ? 14 : volPct > 40 ? 21 : 30;
  out.volatility = { volatilePct: volPct, volatileCents: volMat, suggestedValidDays: validDays, currentValidDays: num('valid_days', 30), note: volPct > 40 ? 'Much of the material is lumber, copper, tile or fixtures, which move with the market. Keep the quote short or ask for a deposit to lock prices.' : 'Material prices should hold for the standard quote period.' };

  // 7 Financing examples on the balance after the deposit.
  const apr = num('finance_apr', 9.99), financed = Math.max(0, totals.totalCents - totals.depositCents);
  const pay = months => { const r = apr / 1200; return cents(r ? financed * r / (1 - Math.pow(1 + r, -months)) : financed / months); };
  out.financing = { aprPct: apr, financedCents: financed, options: [12, 36, 60].map(m => ({ months: m, monthlyCents: pay(m), totalCents: pay(m) * m })), note: 'Illustration only. Real rates depend on the lender and the customer\u2019s credit.' };

  // 8 Walk-away price, 9 negotiation room, 10 overhead-adjusted profit.
  const overhead = cents(cost * ohPct), floorPrice = cents(cost * (1 + ohPct) / (1 - minPct)), targetPrice = cents(cost * (1 + ohPct) / (1 - targetPct));
  out.walkAway = { floorCents: floorPrice, headroomCents: priceEx - floorPrice, belowFloor: priceEx < floorPrice, minMarginPct: minPct * 100 };
  out.negotiation = { targetMarginPct: targetPct * 100, targetPriceCents: targetPrice, maxDiscountCents: Math.max(0, priceEx - targetPrice), maxDiscountPct: priceEx ? Math.round(Math.max(0, priceEx - targetPrice) / priceEx * 1000) / 10 : 0 };
  const truth = priceEx - cost - overhead;
  out.trueProfit = { overheadPct: ohPct * 100, overheadCents: overhead, profitCents: truth, profitPct: priceEx ? Math.round(truth / priceEx * 1000) / 10 : 0 };

  // 11 Labor and material mix.
  const lp = cost ? Math.round(labor / cost * 100) : 0;
  out.mix = { laborPct: lp, materialPct: cost ? Math.round(mat / cost * 100) : 0, flag: lp > 65 ? 'labor-heavy' : lp < 30 ? 'material-heavy' : 'normal', note: lp > 65 ? 'Labor is over 65% of cost. Check hours and crew size.' : lp < 30 ? 'Materials dominate. Check quantities and waste, and consider supplier price quotes.' : 'Within the usual 30 to 65% labor range for remodeling.' };

  // 12 Daily crew cost and the cost of a delay day.
  const days = Math.max(1, s.days || 1), crewDay = cents(labor / days), ohDay = cents(overhead / days);
  out.delay = { crewDayCents: crewDay, overheadDayCents: ohDay, delayDayCents: crewDay + ohDay, note: 'What one idle or lost day costs you. Waiting on materials, inspections or the homeowner is the usual cause.' };

  // 13 Season, weather and holiday risks.
  const month = start.getUTCMonth(), season = [];
  if (month === 11 || month <= 1) season.push('Cold weather: keep the room above 50\u00b0F for thinset, grout and paint to cure; frozen ground and snow slow dumpster delivery.');
  if (month >= 5 && month <= 7) season.push('Heat and humidity: cure times stretch, and a closed bathroom gets hot for the crew. Plan fans and early starts.');
  if (month >= 2 && month <= 4) season.push('Spring storms: protect the path and floors from mud, and expect busy suppliers.');
  if (month >= 8 && month <= 10) season.push('Fall is the busy season for remodelers. Lock in the crew and the order dates early.');
  const hol = [];
  for (const y of new Set([start.getUTCFullYear(), end.getUTCFullYear()])) for (const [name, d] of holidaysIn(y)) if (d >= start && d <= end) hol.push({ name, date: iso(d) });
  out.season = { month: start.toLocaleString('en-US', { month: 'long', timeZone: 'UTC' }), notes: season, holidaysInSchedule: hol, holidayNote: hol.length ? `${hol.length} holiday${hol.length === 1 ? '' : 's'} fall inside the schedule. Expect supplier and inspector closures and add a day or two.` : '' };

  // 14 Days without a usable bathroom and the temporary-facility plan.
  const bathStart = parse(phaseAt(/demol|protect/i)?.start) || start, outDays = Math.max(1, Math.round((end - bathStart) / 86400000) + 1);
  const portable = !!c.singleBath;
  out.noBathroom = handy ? null : { calendarDays: outDays, singleBath: !!c.singleBath, plan: c.singleBath ? `This is the only bathroom. Plan a temporary facility for about ${outDays} days: a neighbor or relative, a gym, or a portable toilet (about ${Math.ceil(outDays / 7) * 75 + 75} dollars as a rough reference; confirm with a rental company).` : `The bathroom is out of service for about ${outDays} calendar days. Water to this room is shut off during rough-in and the final connections.`, portable };

  // 15 Condo and HOA requirements.
  const lg = c.lg || {}, condo = !!(c.condo || lg.elevator || inputs.condo === true || inputs.condo === 'true');
  out.condo = condo ? { items: ['Get written HOA or building approval before ordering materials.', 'Send the building a certificate of insurance (COI) naming the association.', 'Reserve the freight elevator and loading dock for demolition, material and debris days.', 'Confirm allowed work hours and quiet hours.', 'Protect hallways and the elevator with floor and wall covering.', 'Give neighbors notice before water shut-off.', 'Ask whether the building has rules on waterproofing, sound isolation or flooring underlayment.'] } : null;

  // 16 Inspection calendar mapped to the schedule.
  const insp = [], ph = (re, label, when, lead) => { const p = phaseAt(re); if (p) insp.push({ inspection: label, bookBy: iso(addBiz(parse(p[when]), -lead)), phase: p.phase, date: p[when] }); };
  if (permitNeeded && !handy) { ph(/rough/i, 'Rough-in plumbing and electrical', 'start', 2); ph(/waterproof/i, 'Waterproofing and flood test (if required)', 'end', 2); ph(/punch|final/i, 'Final inspection and permit sign-off', 'start', 3); }
  out.inspections = insp;

  // 17 Dated payment milestones.
  const rough = phaseAt(/rough|framing/i), tile = phaseAt(/tile setting/i);
  const rest = Math.max(0, totals.totalCents - totals.depositCents), m1 = cents(rest * 0.3), m2 = cents(rest * 0.4);
  out.payments = [{ name: 'Deposit at signing', when: 'At signing', cents: totals.depositCents }, { name: 'Demolition and rough-in done', when: rough ? rough.end : iso(addBiz(start, 3)), cents: m1 }, { name: 'Tile or main finish complete', when: tile ? tile.end : iso(addBiz(start, Math.round(days * 0.7))), cents: m2 }, { name: 'Final payment at punch-list sign-off', when: iso(end), cents: rest - m1 - m2 }];

  // 18 Maintenance and warranty calendar after completion.
  const mt = [['Workmanship warranty check-in', 11, 'Walk the room together before the 1-year workmanship warranty ends.'], ['Inspect caulk and grout lines', 6, 'Re-caulk tub and shower joints that have pulled away.']];
  if (!handy && (c.flooring === 'tile' || c.showerStyle === 'tile')) mt.push(['Seal grout (cement grout only)', 12, 'Skip if epoxy grout was used.']);
  if (!handy && c.fan) mt.push(['Clean the exhaust fan cover', 6, 'A clogged fan traps moisture and shortens paint life.']);
  if (!handy) mt.push(['Exercise shut-off valves', 12, 'Turn each valve off and on once a year so they do not seize.']);
  out.maintenance = mt.map(([name, m, note]) => ({ name, date: iso(addMonths(end, m)), note }));

  // 19 Trade scheduling windows from the phase calendar.
  const TRADES = [['Plumber', /rough|fixtures|framing/i], ['Electrician', /rough|trim-out|fixtures/i], ['Carpenter / drywall', /demol|framing|drywall|insulation/i], ['Tile setter', /backer|waterproof|tile/i], ['Painter', /paint|prime/i], ['Glazier', /punch|fixtures/i]];
  out.trades = handy ? [] : TRADES.map(([trade, re]) => { const ps = phases.filter(p => re.test(p.phase)); return ps.length ? { trade, start: ps[0].start, end: ps[ps.length - 1].end || ps[ps.length - 1].start, phases: ps.map(p => p.phase) } : null; }).filter(Boolean).filter(t => !(t.trade === 'Glazier' && c.glassType === 'none'));

  // 20 Contingency adequacy against expected risk.
  const prob = { good: 0.1, fair: 0.3, poor: 0.6 }[c.condition] || 0.3, exposure = sum(insights.risks || [], r => r.exposureCents), expected = cents(exposure * prob);
  out.contingency = { heldCents: totals.contingencyCents, expectedLossCents: expected, exposureCents: exposure, adequate: totals.contingencyCents >= expected, shortfallCents: Math.max(0, expected - totals.contingencyCents), note: totals.contingencyCents >= expected ? 'The contingency covers the expected cost of the identified risks.' : 'The contingency is smaller than the expected cost of the identified risks. Raise it or list the risks as exclusions.' };

  // 21 Pre-priced change-order unit rates for hidden conditions.
  const mk = 1 + num('markup_pct', 25) / 100, region = Math.min(200, Math.max(50, num('region_factor_pct', 100))) / 100;
  const seed = code => SEED_MORE.find(r => r[0] === code), unit = (codes, sell = true) => cents(sum(codes, code => { const r = seed(code); return r ? r[5] * (r[3] === 'labor' ? region : 1) * (1 + (r[6] || 0) / 100) : 0; }) * (sell ? mk : 1));
  const hourly = cents(num('handyman_rate', 75) * region * mk);
  out.changeRates = handy ? [] : [
    { name: 'Rot or framing repair (per labor hour)', unit: 'hr', rateCents: hourly },
    { name: 'Replace plywood subfloor, installed', unit: 'sq ft', rateCents: unit(['subfloor-mat', 'subfloor-lab']) },
    { name: 'Level the floor, installed', unit: 'sq ft', rateCents: unit(['leveler', 'leveler-lab']) },
    { name: 'Remove old flooring to the subfloor', unit: 'sq ft', rateCents: unit(['demo-gut-floor']) },
    { name: 'Extra dumpster haul or disposal', unit: 'load', rateCents: cents(425e2 * mk / 1.25) }
  ].filter(r => r.rateCents > 0);

  // 22 Water and energy savings from new fixtures.
  const water = [], rateGal = num('water_cost_per_1000gal', 10) / 1000, kwh = num('kwh_cost', 0.16);
  if (!handy) {
    if (c.toilet === 'replace') water.push({ name: 'New 1.28 gpf toilet replacing a 3.5 gpf toilet', galPerYear: Math.round((3.5 - 1.28) * 5 * 3 * 365), kwhPerYear: 0 });
    if (c.shower !== 'none') water.push({ name: 'WaterSense showerhead (1.8 gpm) vs 2.5 gpm', galPerYear: Math.round(0.7 * 8 * 2 * 365 * 0.6), kwhPerYear: 0 });
    if (c.lighting) water.push({ name: 'LED lighting replacing 65 W bulbs (4 lights, 2 hrs a day)', galPerYear: 0, kwhPerYear: Math.round(4 * 55 * 2 * 365 / 1000) });
    if (c.fan) water.push({ name: 'ENERGY STAR fan replacing an older fan', galPerYear: 0, kwhPerYear: 40 });
  }
  out.savings = { items: water.map(x => ({ ...x, dollarsPerYear: Math.round((x.galPerYear * rateGal + x.kwhPerYear * kwh) * 100) / 100 })), note: 'Assumes 3 people, 5 flushes and 2 eight-minute showers per day, 10 dollars per 1,000 gallons of water and sewer, and 16 cents per kWh. Replace with the customer\u2019s utility bill.' };
  out.savings.totalDollarsPerYear = Math.round(sum(out.savings.items, x => x.dollarsPerYear) * 100) / 100;
  return out;
}

module.exports = { advisor };
