'use strict';
// Labor-time library: how long construction tasks take, in person-hours. Values are reconciled from published
// production rates and trade guides (sources below), converted to small-job remodel conditions, and then used to
// build the bathroom crew schedule and to calibrate the handyman task hours.
//
// Every scheduled or billed labor hour carries CUSHION extra time for human error, rework and unforeseen conditions.

const { phaseTotal } = require('./install-details');
const CUSHION = 0.08;
const withCushion = hours => Math.round(hours * (1 + CUSHION) * 100) / 100;

// Published benchmarks. Remodel work is slower than new-construction production rates: clamppro lists click LVP at
// 0.024 h/sf for open floors and 0.04 h/sf for small remodel rooms (a 1.67x factor), which is used as SMALL_JOB.
const SOURCES = {
  craftsman: { name: 'Craftsman National Home Improvement Estimator (via BuildMetricLab)', url: 'https://buildmetriclab.com/tools/time-labour/drywall-time-calculator/' },
  profound: { name: 'Profound Estimates, drywall production guide', url: 'https://profoundestimates.com/guides/trades/drywall/' },
  tilepro: { name: 'TileProCalculator, tile installation time', url: 'https://tileprocalculator.com/guides/calculating-tile-installation-time' },
  clamp: { name: 'ClampPro, floor installation time and shower waterproofing labor hours', url: 'https://www.clamppro.com/guides/floor-installation-time/' },
  homewyse: { name: 'Homewyse bathroom hours by trade (via Zack of All Trades 5x7 breakdown)', url: 'https://zackofalltrades.biz/blog/5x7-bathroom-remodel-cost-labor' },
  homereno: { name: 'HomeRenoCalc bathroom labor hours by scope', url: 'https://homerenocalc.com/blog/bathroom-remodel-labor-cost-calculator' },
  demo: { name: 'One and Done Prep, bathroom demolition hours', url: 'https://oneanddoneprep.com/bathroom-demolition-labor-cost/' },
  phcc: { name: 'PHCC labor hours per fixture (via SimplyWise)', url: 'https://www.simplywise.com/blog/how-to-estimate-plumbing-job/' },
  hqplumb: { name: 'HQ Plumbing & Air, common job durations', url: 'https://hqplumbingandair.com/resources/faqs/how-long-do-common-plumbing-jobs-take' },
  neca: { name: 'NECA Manual of Labor Units and electrician timing guides (WireWise, Spillers Electric)', url: 'https://www.necanet.org/education/publications/neca-manual-of-labor-units-(mlu)' },
  paint: { name: 'Painting production rates (FieldBidTools, Krib)', url: 'https://fieldbidtools.com/painting-production-rates' },
  carpentry: { name: 'Carpentry production rates (PILARS, BuildWell)', url: 'https://pilars.ai/trades/carpentry/cost-estimating' },
  roofing: { name: 'Roofing production benchmarks (Ketterly, TaskTag)', url: 'https://ketterly.com/blog/roofing-production-rate-benchmarks' },
  contingency: { name: 'Remodel contingency guidance, 5 to 10 percent (FHWA, remodel bid guides)', url: 'https://yours-tim.com/blog/contingency-line-every-bid-needs' }
};
const RULE_META = { effectiveFrom: '2026-11-24', verified: false, verificationStatus: 'provisional', qualification: "External production benchmark; verify with the company's own recent job results before treating it as authoritative." };
for (const source of Object.values(SOURCES)) Object.assign(source, RULE_META);
const SMALL_JOB = 1.67;

// [code, trade, task, unit, low, typical, high, source, how the figure was derived]
const L = (code, trade, task, unit, low, typ, high, src, note = '') => ({ code, trade, task, unit, low, typ, high, src, note });
const LIBRARY = [
  // Demolition and prep
  L('setup', 'General', 'Protect floors, set up dust control and stage materials', 'ea', 5, 8, 12, 'demo', 'Two people for about half a day.'),
  L('demo-bath', 'Demolition', 'Demolish a bathroom (fixtures, flooring, tile) per sq ft of floor', 'sf', 0.15, 0.25, 0.4, 'demo', '5 to 7 hours for two people in a 40 to 60 sq ft bath is 10 to 14 person-hours.'),
  L('demo-tub', 'Demolition', 'Remove an old tub or shower base', 'ea', 1.5, 2.5, 4, 'demo'),
  L('demo-gut-sf', 'Demolition', 'Gut a bathroom to studs and subfloor per sq ft of floor', 'sf', 0.45, 0.65, 0.9, 'homewyse', 'Contractor reports of 25 man-hours for walls, floor and tub in a 5x8.'),
  L('demo-gut-haul', 'Demolition', 'Bag, carry out and haul away gut debris', 'ea', 4, 6, 10, 'demo'),
  // Framing
  L('framing-wall', 'Carpentry', 'Frame a simple wall', 'lf', 0.016, 0.022, 0.03, 'carpentry', '300 to 500 lf per carpenter per day.'),
  L('subfloor', 'Carpentry', 'Replace subfloor in a small room', 'sf', 0.1, 0.15, 0.25, 'carpentry'),
  // Drywall (production rates multiplied by the small-job factor)
  L('drywall-hang', 'Drywall', 'Hang drywall (walls) in a remodel', 'sf', 0.008 * SMALL_JOB, 0.0115 * SMALL_JOB, 0.012 * SMALL_JOB, 'craftsman', '0.008 h/sf walls, 0.012 ceilings; 0.7 h per 100 sf for crews (Profound).'),
  L('drywall-finish', 'Drywall', 'Tape, mud, three coats and sand (labor only, drying not included)', 'sf', 0.01 * SMALL_JOB, 0.014 * SMALL_JOB, 0.018 * SMALL_JOB, 'profound', '1.0 h per 100 sf finishing; 0.018 h/sf hang plus finish in Craftsman.'),
  L('insulation', 'Drywall', 'Batt insulation in a wall or ceiling', 'sf', 0.01, 0.02, 0.03, 'craftsman'),
  // Waterproofing and tile
  L('backer-wall', 'Tile', 'Cement board or foam board plus membrane on shower walls', 'sf', 0.1, 0.16, 0.22, 'clamp', '5 to 6 hours for foam board and 10 for Kerdi over cement board on a standard surround.'),
  L('pan-tray', 'Tile', 'Foam shower tray with membrane, curb and flood test', 'ea', 4, 5, 7, 'clamp'),
  L('pan-mud', 'Tile', 'Mud bed shower pan with bonded membrane', 'ea', 6, 7.7, 10, 'clamp'),
  L('shower-bench', 'Tile', 'Build and waterproof a shower bench', 'ea', 3, 4, 6, 'clamp'),
  L('shower-curbless', 'Tile', 'Curbless entry: recess subfloor and slope', 'ea', 6, 8, 12, 'clamp'),
  L('shower-niche', 'Tile', 'Frame and waterproof a niche', 'ea', 1, 1.5, 3, 'clamp'),
  L('tile-floor', 'Tile', 'Set floor tile, all-in (layout, cuts, thinset, grout, cleanup)', 'sf', 0.07, 0.12, 0.2, 'tilepro', 'Setting alone is 40 to 60 sf/hr; the rest of the job takes 3 to 5 times longer in small rooms.'),
  L('tile-wall', 'Tile', 'Set shower wall tile, all-in', 'sf', 0.14, 0.2, 0.3, 'homewyse', 'Homewyse shows 16.9 hours of tile in a 5x7; vertical work, niches and fixture cuts slow it to 2 to 3 times floor rates.'),
  L('tile-mosaic', 'Tile', 'Set mosaic shower floor tile', 'sf', 0.2, 0.35, 0.5, 'tilepro', '15 to 25 sf/hr setting only.'),
  L('tile-herringbone', 'Tile', 'Diagonal or herringbone pattern multiplier', 'x', 1.25, 1.5, 1.8, 'tilepro'),
  // Plumbing
  L('plumb-toilet-rough', 'Plumbing', 'Toilet rough-in', 'ea', 2.5, 3, 4, 'phcc'),
  L('plumb-sink-rough', 'Plumbing', 'Bathroom sink rough-in', 'ea', 2, 2.75, 3.5, 'phcc'),
  L('plumb-shower-rough', 'Plumbing', 'Tub or shower rough-in and valve', 'ea', 4.5, 5.5, 7, 'phcc'),
  L('plumb-toilet-set', 'Plumbing', 'Set a toilet', 'ea', 1, 1.25, 1.5, 'hqplumb'),
  L('plumb-faucet', 'Plumbing', 'Install a faucet', 'ea', 0.5, 0.75, 1, 'hqplumb'),
  L('plumb-heater', 'Plumbing', 'Replace a tank water heater', 'ea', 2, 3.5, 5, 'phcc'),
  // Electrical
  L('elec-outlet', 'Electrical', 'Replace an outlet', 'ea', 0.33, 0.5, 0.75, 'neca'),
  L('elec-gfci', 'Electrical', 'Install a GFCI outlet', 'ea', 0.5, 0.75, 1, 'neca'),
  L('elec-switch', 'Electrical', 'Replace a switch', 'ea', 0.33, 0.5, 0.75, 'neca'),
  L('elec-fixture', 'Electrical', 'Replace a light fixture', 'ea', 1, 1.25, 1.5, 'neca'),
  L('elec-recessed', 'Electrical', 'Install a recessed light', 'ea', 1, 1.5, 2, 'neca'),
  L('elec-fan', 'Electrical', 'Install an exhaust or ceiling fan', 'ea', 1.5, 2, 3, 'neca'),
  L('elec-circuit', 'Electrical', 'Add a circuit and outlet (renovation)', 'ea', 3, 3.5, 5, 'neca', 'Renovation multiplier of 1.3 to 1.5 over new work.'),
  L('elec-panel', 'Electrical', 'Replace a service panel (100A to 200A)', 'ea', 6, 8, 12, 'neca'),
  // Finish carpentry, doors, trim
  L('door-prehung', 'Carpentry', 'Set a prehung interior door', 'ea', 1.25, 1.75, 2.5, 'carpentry'),
  L('trim-base', 'Carpentry', 'Install baseboard', 'lf', 0.07, 0.1, 0.15, 'carpentry'),
  L('window-replace', 'Carpentry', 'Replace a vinyl window (same size)', 'ea', 2, 2.5, 3.5, 'carpentry'),
  L('vanity-set', 'Carpentry', 'Set a vanity and top, connect sink', 'ea', 2.5, 3, 4.5, 'homewyse', 'Homewyse lists 11.5 hours of carpentry and installs for a 5x7.'),
  // Paint
  L('paint-walls', 'Paint', 'Prime and two coats on walls', 'sf', 0.012, 0.018, 0.026, 'paint', '150 to 250 sf/hr per coat plus prep and cut-in.'),
  L('paint-ceiling', 'Paint', 'Ceiling, one coat plus prime', 'sf', 0.01, 0.015, 0.022, 'paint', '125 to 200 sf/hr per coat.'),
  L('paint-trim', 'Paint', 'Trim and baseboard, two coats', 'lf', 0.03, 0.05, 0.08, 'paint', '50 to 100 lf/hr per coat.'),
  L('paint-door', 'Paint', 'Door, both sides, two coats', 'ea', 0.7, 1, 1.5, 'paint', '0.35 to 0.75 h per side per coat.'),
  // Flooring (small-room remodel rates)
  L('floor-lvp', 'Flooring', 'Click vinyl plank in a remodel room', 'sf', 0.024, 0.04, 0.06, 'clamp'),
  L('floor-carpet', 'Flooring', 'Carpet and pad', 'sf', 0.03, 0.04, 0.06, 'clamp'),
  L('floor-tile', 'Flooring', 'Tile floor from tear-out to trim', 'sf', 0.15, 0.2, 0.3, 'clamp'),
  // Roofing
  L('roof-shingle', 'Exterior', 'Tear off and shingle a roof', 'sf', 0.018, 0.022, 0.026, 'roofing', '1.8 to 2.6 hours per square.'),
  // Contingency
  L('cushion', 'All', 'Labor-time cushion for human error and unforeseen conditions', '%', 5, 8, 10, 'contingency', 'Remodel bids carry 5 to 10 percent; 8 percent is applied to every labor-time estimate.')
];
const BY_CODE = new Map(LIBRARY.map(e => [e.code, e]));
const hr = (code, qty = 1) => (BY_CODE.get(code)?.typ ?? 0) * qty;

// Handyman task hours that were recalibrated from the research above: [previous hours, researched hours].
// An existing price book row is only updated when its hours still equal the previous seed value, so edits made by the
// admin are never overwritten.
const HANDYMAN_REVISIONS = {
  'dw-hang-finish': [0.1, 0.045], 'dw-ceiling': [0.14, 0.06],
  'pl-toilet': [1.75, 1.5], 'pl-faucet-bath': [1.25, 0.75], 'pl-faucet-kitchen': [1.5, 1], 'pl-water-heater': [4, 3.5],
  'el-outlet': [0.4, 0.5], 'el-gfci': [0.6, 0.75], 'el-switch': [0.35, 0.5], 'el-fixture': [1, 1.25], 'el-recessed': [1.25, 1.5], 'el-fan': [1.5, 2],
  'fl-lvp': [0.06, 0.04], 'fl-laminate': [0.06, 0.04], 'fl-tile': [0.3, 0.2],
  'pt-ceiling': [0.025, 0.02], 'pt-trim': [0.06, 0.05],
  'dr-int-prehung': [2, 1.75]
};

// Bathroom crew phases built from the library: [phase, crew-days, crew, minimum elapsed days].
// Crew-days are person-hours / (crew * 8); the cushion is applied once, in the scheduler.
function bathroomPhases(c, wet) {
  const days = (hours, crew) => hours / (crew * 8);
  const tileFloor = c.flooring === 'tile' ? c.floor : 0, tileWalls = c.showerStyle === 'tile' && wet ? c.showerWalls : 0;
  const big = c.floor > 70 || c.gut;
  const phases = [];
  const add = (name, hours, crew, minDays = 0) => phases.push([name, days(Math.max(phaseTotal(name, hours), 2), crew), crew, minDays]);
  const lg = c.lgHours || {};

  add('Protect, set up and dust control', hr('setup') + (lg.carryIn || 0) + (lg.trips || 0), 2);
  if (c.asbestosTest || c.leadSafe) phases.push(['Lead and asbestos testing (lab turnaround)', 2, 0]);
  if (c.demo) {
    const hours = c.gut ? hr('demo-gut-sf', c.floor) + hr('demo-gut-haul') : Math.max(8, hr('demo-bath', c.floor)) + (c.oldTub ? hr('demo-tub') : 0);
    add(c.gut ? 'Demolition to the studs and subfloor' : 'Demolition and haul-away', hours + (lg.carryOut || 0) + (lg.disposal || 0), big ? 3 : 2);
  }
  if (c.framing || c.subfloor) add('Framing, blocking and subfloor repairs', c.framingHours + (c.subfloor ? hr('subfloor', c.floor) : 0), 2);
  const rough = (c.gut || c.plumbingChanges ? (wet ? hr('plumb-shower-rough') : 0) + hr('plumb-sink-rough') + (c.gut ? hr('plumb-toilet-rough') : 0) + (c.drainRelocate ? 6 : 0) : 0)
    + (c.gut || c.electricalChanges ? hr('elec-circuit') + (c.panelUpgrade ? hr('elec-panel') : 0) : 0);
  if (rough > 0) add('Plumbing and electrical rough-in (licensed trades)', rough, 2);
  if (c.permit) phases.push(['Rough-in inspection', 1, 0]);
  if (c.gut || c.insulation || c.drywall) {
    const board = Math.max(c.drywallSf, 0) + (c.ceilingWork === 'replace' ? c.floor : 0);
    add('Insulation and drywall hanging', hr('drywall-hang', board) + (c.gut || c.insulation ? hr('insulation', c.gut ? c.wallArea : Math.max(board, 40)) : 0), 2);
    add('Tape, mud and sand (dry time between coats)', hr('drywall-finish', board), 1, c.gut ? 3 : 2);
  }
  if (wet && c.showerStyle === 'tile') {
    const pan = c.shower === 'walk_in' ? hr(c.bench || c.curbless ? 'pan-mud' : 'pan-tray') : 0;
    add('Backer and waterproofing', hr('backer-wall', c.showerWalls) + pan + (c.bench ? hr('shower-bench') : 0) + (c.curbless ? hr('shower-curbless') : 0) + (c.niche ? hr('shower-niche') : 0), 2);
    phases.push(['Waterproofing cure and flood test', 1, 0]);
  }
  if (tileFloor + tileWalls > 0) {
    const pattern = c.tilePattern === 'standard' ? 1 : c.tilePattern === 'herringbone' ? BY_CODE.get('tile-herringbone').high : BY_CODE.get('tile-herringbone').typ;
    const mosaic = c.shower === 'walk_in' && tileWalls ? 12 : 0;
    add('Tile setting and grout', (hr('tile-floor', tileFloor) + hr('tile-wall', tileWalls)) * pattern + hr('tile-mosaic', mosaic), 2, 2);
  }
  const paintHours = c.paint || c.gut ? hr('paint-walls', c.wallArea) + hr('paint-ceiling', c.floor) + hr('paint-trim', c.perimeter) + hr('paint-door') : 3;
  add('Prime and paint', paintHours, big ? 2 : 1, c.paint || c.gut ? 2 : 1);

  const trim = (c.toilet === 'replace' ? hr('plumb-toilet-set') : c.toilet === 'rebuild' ? 1 : 0)
    + hr('vanity-set') * Math.max(1, c.vanities) * (c.vanityType === 'double' ? 1.5 : 1) + hr('plumb-faucet') * (c.vanityType === 'double' ? 2 : 1)
    + (wet ? 1.5 : 0) + (c.fan ? hr('elec-fan') : 0) + (c.lighting ? hr('elec-fixture') : 0) + hr('elec-recessed', c.recessed) + hr('elec-gfci', c.gfci) + hr('elec-switch', c.switches)
    + (c.showerLight ? 1.5 : 0) + (c.smoke ? 0.5 : 0) + c.grabBars + (c.accessories ? 1.5 : 0) + (c.handShower ? 0.6 : 0) + (c.rainHead ? 1 : 0) + (c.bodySprays ? 4 : 0)
    + (c.towelWarmer ? 1.5 : 0) + (c.linen ? 2 : 0) + (c.shelves ? 1 : 0) + (c.medicineRecess ? 3 : 0) + (c.smartMirror ? 1.5 : 0)
    + (c.doorNew ? hr('door-prehung') : 0) + (c.pocketDoor ? 8 : 0) + (c.doorWiden ? 8 : 0) + (c.window ? hr('window-replace') : 0) + (c.windowWrap ? 3 : 0)
    + (c.trim ? hr('trim-base', c.perimeter) : 0) + c.wainscotSf * 0.25 + c.wallpaperSf * 0.07 + (c.towelWarmer || c.heatedFloor ? 1 : 0);
  add('Fixtures, vanity, toilet, electrical trim-out', trim, 2);
  if (['frameless', 'panel'].includes(c.glassType)) phases.push(['Glass install (ordered after tile, 7 to 14 day lead time)', days(3.5, 2), 2, 1]);
  add('Punch list, final clean and walk-through', c.lg && c.lg.cleanup !== 'us' ? 2 : c.gut ? 8 : 4, 1);
  return phases;
}

const view = () => ({ cushionPct: CUSHION * 100, smallJobFactor: SMALL_JOB, ruleMetadata: RULE_META, sources: SOURCES, library: LIBRARY.map(e => ({ ...e, src: SOURCES[e.src] ? { key: e.src, ...SOURCES[e.src] } : null })) });

module.exports = { CUSHION, RULE_META, withCushion, SOURCES, LIBRARY, HANDYMAN_REVISIONS, bathroomPhases, view };
