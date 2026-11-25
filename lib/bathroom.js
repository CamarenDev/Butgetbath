// Extended bathroom price book and the smart takeoff. The takeoff adapts to each job: room size, home age, floor level,
// subfloor condition, fixture choices and finish level decide which lines appear and how much of each is needed.
const { featuresOf, applyLearning } = require('./learning');
const { CUSHION, bathroomPhases } = require('./labor-times');
const logistics = require('./logistics');
const TIERS = ['good', 'better', 'best'];

const tiered = (code, category, name, kind, unit, prices, waste = 0) => prices.map((cost, i) => [code, category, name, kind, unit, cost, waste, TIERS[i]]);

// [code, category, name, kind, unit, cost $, waste %, tier]
const SEED_MORE = [
  ...logistics.PRICE_BOOK,
  ['demo-ceiling', 'Demolition', 'Remove ceiling drywall or plaster', 'labor', 'sf', 2, 0, ''],
  ['demo-walls', 'Demolition', 'Gut walls to the studs (drywall, plaster, lath, insulation)', 'labor', 'sf', 2.75, 0, ''],
  ['demo-gut-floor', 'Demolition', 'Remove flooring and underlayment down to the subfloor', 'labor', 'sf', 3, 0, ''],
  ['gut-haul', 'Demolition', 'Extra debris haul-away for a full gut (additional dumpster)', 'other', 'ea', 475, 0, ''],
  ['stud-inspect', 'Framing & backer', 'Stud, joist and sill inspection after gut, with straightening and sistering', 'labor', 'hr', 75, 0, ''],
  ['rough-electric-full', 'Electrical', 'Full electrical rough-in: new wiring, boxes and dedicated bathroom circuits (licensed electrician)', 'subcontractor', 'ea', 1800, 0, ''],
  ['rough-plumb-full', 'Plumbing', 'Full plumbing rough-in: new supply, drain and vent (licensed plumber)', 'subcontractor', 'ea', 2600, 0, ''],
  ['gut-cleanup', 'Finish', 'Post-gut dust control, HEPA cleaning and final clean', 'labor', 'ls', 350, 0, ''],
  ['demo-wall', 'Demolition', 'Remove non-structural partition wall', 'labor', 'ea', 650, 0, ''],
  ['asbestos-test', 'Demolition', 'Asbestos and lead test sampling (lab fees)', 'other', 'ea', 275, 0, ''],
  ['stairs-access', 'Demolition', 'Upper-floor access: stairs carry and floor protection', 'labor', 'hr', 65, 0, ''],
  ['portable-toilet', 'Demolition', 'Temporary toilet rental (only bathroom in home)', 'other', 'ea', 180, 0, ''],
  ['mold', 'Demolition', 'Mold remediation allowance (licensed)', 'subcontractor', 'ea', 1500, 0, ''],
  ['dust-barrier', 'Demolition', 'Dust containment barrier and floor-to-ceiling zip wall', 'other', 'ea', 95, 0, ''],

  ['subfloor-mat', 'Framing & backer', 'Plywood subfloor', 'material', 'sf', 2.4, 10, ''],
  ['subfloor-lab', 'Framing & backer', 'Replace subfloor', 'labor', 'sf', 3, 0, ''],
  ['leveler', 'Framing & backer', 'Self-leveling underlayment', 'material', 'sf', 1.8, 5, ''],
  ['leveler-lab', 'Framing & backer', 'Pour and level floor', 'labor', 'sf', 1.5, 0, ''],
  ['underlay', 'Framing & backer', 'Tile uncoupling membrane (floor)', 'material', 'sf', 2.2, 8, ''],
  ['underlay-lab', 'Framing & backer', 'Install floor membrane', 'labor', 'sf', 1.2, 0, ''],
  ['insulation', 'Framing & backer', 'Wall insulation, exterior walls', 'material', 'sf', 1.1, 8, ''],
  ['insulation-lab', 'Framing & backer', 'Install insulation', 'labor', 'sf', 1, 0, ''],
  ['soundproof', 'Framing & backer', 'Sound-deadening batts and board', 'material', 'sf', 1.9, 8, ''],
  ['soundproof-lab', 'Framing & backer', 'Install sound-deadening', 'labor', 'sf', 1.4, 0, ''],
  ['ceiling-drywall', 'Framing & backer', 'Ceiling drywall, moisture-resistant', 'material', 'sf', 1, 10, ''],
  ['ceiling-drywall-lab', 'Framing & backer', 'Hang, tape and finish ceiling', 'labor', 'sf', 3, 0, ''],
  ['bench-mat', 'Waterproofing', 'Shower bench, framed and ready to tile', 'material', 'ea', 220, 0, ''],
  ['bench-lab', 'Waterproofing', 'Build and waterproof shower bench', 'labor', 'ea', 450, 0, ''],
  ['pan-lab', 'Waterproofing', 'Build shower pan, curb and flood test', 'labor', 'ea', 450, 0, ''],
  ['curbless', 'Waterproofing', 'Curbless entry: recess subfloor and slope', 'labor', 'ea', 900, 0, ''],
  ...tiered('linear-drain', 'Waterproofing', 'Linear shower drain', 'material', 'ea', [280, 450, 750]),
  ...tiered('shower-prefab', 'Fixtures', 'Acrylic shower base', 'material', 'ea', [380, 650, 1200]),
  ...tiered('surround-kit', 'Fixtures', 'Acrylic shower wall surround', 'material', 'ea', [400, 750, 1400]),
  ['surround-lab', 'Fixtures', 'Install shower base and surround', 'labor', 'ea', 750, 0, ''],

  ...tiered('accent-tile', 'Tile', 'Accent or mosaic tile', 'material', 'sf', [9, 18, 35], 12),
  ['accent-lab', 'Tile', 'Install accent tile', 'labor', 'sf', 16, 0, ''],
  ...tiered('shower-floor-tile', 'Tile', 'Shower floor mosaic tile', 'material', 'sf', [8, 14, 26], 12),
  ['shower-floor-lab', 'Tile', 'Install shower floor tile', 'labor', 'sf', 18, 0, ''],
  ['epoxy-grout', 'Tile', 'Epoxy grout upgrade (stain proof)', 'material', 'sf', 2.2, 5, ''],
  ...tiered('tile-base', 'Tile', 'Tile base or cove', 'material', 'lf', [4, 8, 16], 8),
  ['tile-base-lab', 'Tile', 'Install tile base', 'labor', 'lf', 8, 0, ''],
  ['tile-pattern', 'Tile', 'Pattern labor premium (diagonal or herringbone)', 'labor', 'sf', 4.5, 0, ''],
  ['threshold', 'Tile', 'Marble threshold', 'material', 'ea', 45, 0, ''],
  ['threshold-lab', 'Tile', 'Set threshold', 'labor', 'ea', 60, 0, ''],

  ...tiered('lvp', 'Flooring', 'Luxury vinyl plank flooring', 'material', 'sf', [2.2, 3.6, 5.5], 10),
  ['lvp-lab', 'Flooring', 'Install luxury vinyl plank', 'labor', 'sf', 3.5, 0, ''],
  ...tiered('sheet-vinyl', 'Flooring', 'Sheet vinyl flooring', 'material', 'sf', [1.8, 3, 5], 10),
  ['sheet-vinyl-lab', 'Flooring', 'Install sheet vinyl', 'labor', 'sf', 2.5, 0, ''],
  ['transition', 'Flooring', 'Floor transition strip', 'material', 'ea', 28, 0, ''],

  ...tiered('vanity-double', 'Fixtures', 'Double vanity with top', 'material', 'ea', [800, 1900, 3800]),
  ['vanity-double-lab', 'Fixtures', 'Install double vanity and sinks', 'labor', 'ea', 450, 0, ''],
  ['vanity-trap', 'Fixtures', 'P-trap, drain and supply lines (per sink)', 'material', 'ea', 60, 0, ''],
  ...tiered('hardware', 'Fixtures', 'Cabinet knobs and pulls', 'material', 'ea', [20, 45, 100]),
  ['angle-stops', 'Plumbing', 'Replace angle stops and shut-off valves', 'material', 'ea', 22, 0, ''],
  ['angle-stops-lab', 'Plumbing', 'Install shut-off valves', 'labor', 'ea', 40, 0, ''],
  ['toilet-kit', 'Fixtures', 'Toilet internals: fill valve, flapper, wax ring, bolts', 'material', 'ea', 45, 0, ''],
  ['toilet-supply', 'Fixtures', 'Toilet supply line', 'material', 'ea', 15, 0, ''],
  ...tiered('toilet-seat', 'Fixtures', 'Toilet seat', 'material', 'ea', [25, 60, 140]),
  ['toilet-rebuild-lab', 'Fixtures', 'Rebuild existing toilet (internals, reseat)', 'labor', 'ea', 95, 0, ''],
  ['flange', 'Fixtures', 'Toilet flange repair or replacement', 'material', 'ea', 35, 0, ''],
  ['flange-lab', 'Fixtures', 'Install toilet flange', 'labor', 'ea', 120, 0, ''],
  ['bidet-seat', 'Fixtures', 'Bidet seat', 'material', 'ea', 350, 0, ''],
  ['bidet-seat-lab', 'Fixtures', 'Install bidet seat and outlet check', 'labor', 'ea', 120, 0, ''],
  ['tub-drain', 'Fixtures', 'Tub waste and overflow', 'material', 'ea', 65, 0, ''],
  ...tiered('hand-shower', 'Fixtures', 'Handheld shower and slide bar', 'material', 'ea', [90, 200, 420]),
  ['hand-shower-lab', 'Fixtures', 'Install handheld shower', 'labor', 'ea', 80, 0, ''],
  ...tiered('rain-head', 'Fixtures', 'Rain shower head', 'material', 'ea', [120, 280, 600]),
  ['rain-head-lab', 'Fixtures', 'Install rain shower head', 'labor', 'ea', 100, 0, ''],
  ['body-spray', 'Fixtures', 'Body sprays (pair)', 'material', 'ea', 450, 0, ''],
  ['body-spray-lab', 'Fixtures', 'Install body sprays', 'labor', 'ea', 350, 0, ''],
  ['grab-bar', 'Fixtures', 'Grab bar', 'material', 'ea', 60, 0, ''],
  ['grab-lab', 'Fixtures', 'Block wall and install grab bar', 'labor', 'ea', 95, 0, ''],
  ['glass-curtain', 'Fixtures', 'Shower curtain rod and liner', 'material', 'ea', 55, 0, ''],
  ...tiered('glass-slider', 'Fixtures', 'Framed sliding tub or shower door', 'material', 'ea', [250, 420, 700]),
  ...tiered('glass-panel', 'Fixtures', 'Fixed glass panel (walk-in shower)', 'material', 'ea', [450, 800, 1400]),
  ['glass-lab', 'Fixtures', 'Install glass enclosure', 'labor', 'ea', 350, 0, ''],
  ['towel-warmer', 'Fixtures', 'Towel warmer', 'material', 'ea', 280, 0, ''],
  ['towel-warmer-lab', 'Fixtures', 'Install towel warmer', 'labor', 'ea', 150, 0, ''],
  ...tiered('linen', 'Fixtures', 'Linen or storage cabinet', 'material', 'ea', [220, 480, 1100]),
  ['linen-lab', 'Fixtures', 'Install storage cabinet', 'labor', 'ea', 180, 0, ''],
  ['shelves', 'Fixtures', 'Floating shelves', 'material', 'ea', 75, 0, ''],
  ['shelves-lab', 'Fixtures', 'Install shelves', 'labor', 'ea', 80, 0, ''],
  ['medicine-recess', 'Fixtures', 'Frame and install recessed medicine cabinet', 'labor', 'ea', 260, 0, ''],
  ['smart-mirror', 'Fixtures', 'LED lighted anti-fog mirror', 'material', 'ea', 450, 0, ''],
  ['smart-mirror-lab', 'Fixtures', 'Install lighted mirror', 'labor', 'ea', 120, 0, ''],

  ['repipe', 'Plumbing', 'Replace old supply lines to bathroom (copper or PEX)', 'subcontractor', 'ea', 1100, 0, ''],
  ['drain-relocate', 'Plumbing', 'Relocate drain and vent (licensed plumber)', 'subcontractor', 'ea', 1100, 0, ''],
  ['cast-iron', 'Plumbing', 'Replace cast iron or galvanized drain section', 'subcontractor', 'ea', 1900, 0, ''],
  ['ejector', 'Plumbing', 'Sewage ejector pump (basement bath)', 'subcontractor', 'ea', 2400, 0, ''],

  ['fan-heater', 'Electrical', 'Exhaust fan with heater (upgrade)', 'material', 'ea', 260, 0, ''],
  ['duct', 'Electrical', 'Insulated fan duct and exterior vent cap', 'material', 'lf', 12, 5, ''],
  ['gfci', 'Electrical', 'GFCI outlet', 'material', 'ea', 28, 0, ''],
  ['gfci-lab', 'Electrical', 'Install GFCI outlet', 'labor', 'ea', 75, 0, ''],
  ['switch', 'Electrical', 'Dimmer or smart switch', 'material', 'ea', 38, 0, ''],
  ['switch-lab', 'Electrical', 'Install switch', 'labor', 'ea', 65, 0, ''],
  ['shower-light', 'Electrical', 'Waterproof shower light', 'material', 'ea', 70, 0, ''],
  ['shower-light-lab', 'Electrical', 'Install shower light', 'labor', 'ea', 120, 0, ''],
  ['smoke', 'Electrical', 'Smoke and CO detector', 'material', 'ea', 45, 0, ''],
  ['smoke-lab', 'Electrical', 'Install detector', 'labor', 'ea', 55, 0, ''],
  ['panel-upgrade', 'Electrical', 'Electrical panel upgrade (licensed electrician)', 'subcontractor', 'ea', 2200, 0, ''],

  ...tiered('door', 'Doors, windows & storage', 'Interior door, prehung', 'material', 'ea', [120, 220, 420]),
  ['door-lab', 'Doors, windows & storage', 'Install door', 'labor', 'ea', 250, 0, ''],
  ...tiered('door-hardware', 'Doors, windows & storage', 'Privacy door hardware', 'material', 'ea', [35, 70, 140]),
  ['pocket-door', 'Doors, windows & storage', 'Pocket door frame and hardware', 'material', 'ea', 320, 0, ''],
  ['pocket-door-lab', 'Doors, windows & storage', 'Install pocket door', 'labor', 'ea', 550, 0, ''],
  ['door-widen', 'Doors, windows & storage', 'Widen or reframe doorway', 'labor', 'ea', 750, 0, ''],
  ...tiered('window', 'Doors, windows & storage', 'Bathroom window (privacy or vinyl)', 'material', 'ea', [350, 650, 1200]),
  ['window-lab', 'Doors, windows & storage', 'Install window', 'labor', 'ea', 400, 0, ''],
  ['window-wrap', 'Doors, windows & storage', 'Waterproof and trim shower window', 'labor', 'ea', 300, 0, ''],

  ['wainscot', 'Finish', 'Wainscot or beadboard panels', 'material', 'sf', 4.5, 10, ''],
  ['wainscot-lab', 'Finish', 'Install wainscot', 'labor', 'sf', 5, 0, ''],
  ['wallpaper', 'Finish', 'Wallcovering (accent wall)', 'material', 'sf', 3.5, 10, ''],
  ['wallpaper-lab', 'Finish', 'Hang wallcovering', 'labor', 'sf', 4, 0, ''],
  ['pm', 'Finish', 'Project management and coordination', 'labor', 'hr', 85, 0, ''],
  ['punch', 'Finish', 'Punch list and touch-up', 'labor', 'hr', 75, 0, ''],
  ['delivery', 'Finish', 'Material delivery and handling', 'other', 'ea', 150, 0, ''],
  ['permit-plumbing', 'Permits', 'Plumbing permit', 'other', 'ea', 125, 0, ''],
  ['permit-electrical', 'Permits', 'Electrical permit', 'other', 'ea', 125, 0, ''],
  ['condo-fees', 'Permits', 'Condo or HOA fees: elevator reservation and insurance certificate', 'other', 'ea', 250, 0, '']
];

// Tool rental. Day and week rates are anchored to published Home Depot tool rental rates (Midwest stores); items marked (est.) are
// typical local rental-yard rates. These are reference prices for the Kane, Kendall, DuPage and DeKalb county area: confirm at the counter.
const SEED_RENTAL = [
  ['rent-demo-hammer', 'Tool rental', '27 lb demolition hammer (tile and mortar bed removal)', 'equipment', 'day', 85, 0, ''],
  ['rent-roto-hammer', 'Tool rental', '1-1/2 in. rotary hammer (concrete and slab)', 'equipment', 'day', 80, 0, ''],
  ['rent-scraper', 'Tool rental', 'Stand-up floor scraper (tile and vinyl removal) (est.)', 'equipment', 'day', 75, 0, ''],
  ['rent-tile-saw', 'Tool rental', '10 in. wet tile saw', 'equipment', 'day', 70, 0, ''],
  ['rent-tile-saw-wk', 'Tool rental', '10 in. wet tile saw, weekly', 'equipment', 'wk', 210, 0, ''],
  ['rent-mixer', 'Tool rental', '1/2 in. mud mixing drill', 'equipment', 'day', 32, 0, ''],
  ['rent-hammer-drill', 'Tool rental', '1/2 in. hammer drill', 'equipment', 'day', 45, 0, ''],
  ['rent-recip', 'Tool rental', 'Reciprocating saw (tub and pipe cutting)', 'equipment', 'day', 40, 0, ''],
  ['rent-grinder', 'Tool rental', '7 in. concrete floor grinder (est.)', 'equipment', 'day', 85, 0, ''],
  ['rent-laser', 'Tool rental', 'Self-leveling laser level (est.)', 'equipment', 'day', 35, 0, ''],
  ['rent-vac', 'Tool rental', '16 gal. wet/dry vacuum', 'equipment', 'day', 25, 0, ''],
  ['rent-scrubber', 'Tool rental', 'HEPA air scrubber for dust and lead-safe work (est.)', 'equipment', 'day', 60, 0, ''],
  ['rent-dehumid', 'Tool rental', 'Dehumidifier and air mover for damp framing (est.)', 'equipment', 'day', 60, 0, ''],
  ['rent-lift', 'Tool rental', 'Drywall panel lift (est.)', 'equipment', 'day', 45, 0, ''],
  ['scaffold', 'Tool rental', 'Rolling scaffold or staging for high ceilings (est.)', 'equipment', 'day', 85, 0, ''],
  ['rent-ladder', 'Tool rental', '24 ft extension ladder', 'equipment', 'day', 25, 0, ''],
  ['rent-snake', 'Tool rental', 'Drain snake, 50 ft (est.)', 'equipment', 'day', 65, 0, ''],
  ['rent-dolly', 'Tool rental', 'Appliance dolly or stair-climbing hand truck (est.)', 'equipment', 'day', 22, 0, ''],
  ['rent-truck', 'Tool rental', 'Pickup truck rental for material runs (est.)', 'equipment', 'day', 90, 0, ''],
  ['rent-delivery', 'Tool rental', 'Rental delivery or pickup fee (est.)', 'other', 'ea', 40, 0, '']
];

const num = (v, fallback, max = 5000, label = 'value') => {
  if (v === '' || v == null) return fallback;
  if (typeof v === 'boolean' || typeof v === 'object') throw new TypeError(`${label} must be numeric.`);
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0 || n > max) throw new RangeError(`${label} must be between 0 and ${max}.`);
  return n;
};
const r2 = n => Math.round(n * 100) / 100;
const validIsoDate = value => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
};

// Resolve raw wizard answers into a plan: measurements, switches with smart defaults, and human notes explaining the choices.
function plan(inputs = {}) {
  const notes = [], raw = inputs;
  const given = k => raw[k] !== undefined && raw[k] !== null && raw[k] !== '';
  const flag = (k, def = false) => {
    if (!given(k)) return def;
    if (raw[k] === true || raw[k] === 'true' || raw[k] === 1 || raw[k] === '1') return true;
    if (raw[k] === false || raw[k] === 'false' || raw[k] === 0 || raw[k] === '0') return false;
    throw new TypeError(`${k} must be true or false.`);
  };
  const pick = (k, list, def) => {
    if (!given(k)) return def;
    if (!list.includes(raw[k])) throw new RangeError(`${k} is not a supported value.`);
    return raw[k];
  };

  const bathType = pick('bathType', ['full', 'master', 'hall', 'half', 'powder'], 'full');
  const noShower = ['half', 'powder'].includes(bathType);
  const tier = pick('tier', TIERS, 'better');
  const length = num(raw.length, 0, 60, 'length'), width = num(raw.width, 0, 60, 'width'), ceiling = num(raw.ceilingHeight, 8, 20, 'ceilingHeight');
  const dims = length > 0 && width > 0;
  const floor = given('floorSf') ? num(raw.floorSf, 40) : dims ? r2(length * width) : 40;
  if (!given('floorSf') && !dims) notes.push('No room size entered, so a 40 sq ft bathroom was assumed. Enter length and width for exact quantities.');
  const perimeter = dims ? 2 * (length + width) : Math.round(4 * Math.sqrt(floor));

  const shower = noShower ? 'none' : pick('shower', ['none', 'tub_surround', 'walk_in'], bathType === 'hall' ? 'tub_surround' : 'none');
  const showerStyle = pick('showerStyle', ['tile', 'prefab'], 'tile');
  const showerLen = num(raw.showerLength, 5, 12), showerWid = num(raw.showerWidth, shower === 'walk_in' ? 3 : 2.67, 12);
  const tileHeight = shower === 'walk_in' ? Math.min(8, Math.max(6, ceiling - 0.5)) : 6.5;
  const computedWalls = shower === 'none' || showerStyle === 'prefab' ? 0 : Math.round((showerLen + 2 * showerWid) * tileHeight);
  const wallTileSf = given('wallTileSf') ? num(raw.wallTileSf, 0, 5000, 'wallTileSf') : computedWalls;
  if (shower === 'walk_in' && !given('wallTileSf') && showerStyle === 'tile') notes.push(`Shower wall tile (${wallTileSf} sq ft) was calculated from a ${showerLen} x ${showerWid} ft shower with ${tileHeight} ft walls.`);
  const showerWalls = shower === 'walk_in' && showerStyle === 'tile' && !given('wallTileSf') ? Math.max(wallTileSf, 80) : wallTileSf;

  const year = num(raw.homeYear, 0, 2100);
  const level = pick('level', ['basement', 'first', 'upper'], 'first');
  const condition = pick('condition', ['good', 'fair', 'poor'], 'fair');
  const windows = Math.round(num(raw.windowCount, 0, 6));
  const wallArea = Math.max(0, Math.round(perimeter * ceiling - showerWalls - 21 - windows * 15));

  const vanityType = pick('vanityType', ['single', 'double'], bathType === 'master' ? 'double' : 'single');
  const vanities = Math.round(num(raw.vanities, bathType === 'hall' || bathType === 'half' || bathType === 'powder' ? 1 : 1, 4));
  const glassType = given('glassType') ? pick('glassType', ['none', 'curtain', 'slider', 'frameless', 'panel'], 'none') : flag('glass') ? 'frameless' : 'none';

  const cfg = {
    tier, bathType, floor, perimeter, ceiling, wallArea, shower, showerStyle, showerWalls, wallTileSf, windows, level, condition, year, vanityType, vanities, glassType,
    flooring: given('flooring') ? pick('flooring', ['tile', 'lvp', 'vinyl', 'none'], 'tile') : flag('floorTile') ? 'tile' : 'none',
    demo: flag('demo'), oldTub: flag('oldTub'), curbless: flag('curbless') && shower === 'walk_in', bench: flag('bench') && shower === 'walk_in', tilePattern: pick('tilePattern', ['standard', 'diagonal', 'herringbone'], 'standard'),
    leadSafe: flag('leadSafe', year > 0 && year < 1978), asbestosTest: flag('asbestosTest', year > 0 && year < 1980),
    oldPlumbing: flag('repipe', year > 0 && year < 1960 && flag('plumbingChanges', true)), castIron: flag('castIron', year > 0 && year < 1950 && flag('plumbingChanges', false)),
    framing: flag('framing', condition !== 'good'), framingHours: given('framingHours') ? num(raw.framingHours, 4, 200) : ({ good: 2, fair: 6, poor: 16 })[condition],
    subfloor: flag('subfloor', condition === 'poor'), leveler: flag('leveler', false), underlay: flag('underlay', true),
    drywall: flag('drywall'), drywallSf: given('drywallSf') ? num(raw.drywallSf, 60) : dims ? Math.round(wallArea * 0.35) : 60,
    ceilingWork: pick('ceilingWork', ['none', 'patch', 'replace'], 'none'), insulation: flag('insulation'), soundproof: flag('soundproof'),
    heatedFloor: flag('heatedFloor'), niche: flag('niche'), newTub: flag('newTub'),
    toilet: given('toiletMode') ? pick('toiletMode', ['replace', 'rebuild', 'keep'], 'replace') : flag('toilet') ? 'replace' : 'keep',
    bidet: flag('bidetSeat'), flange: flag('flange'), plumbingChanges: flag('plumbingChanges'), drainRelocate: flag('drainRelocate'), ejector: flag('ejector', level === 'basement' && flag('plumbingChanges')),
    handShower: flag('handShower'), rainHead: flag('rainHead'), bodySprays: flag('bodySprays'), grabBars: Math.round(num(raw.grabBars, 0, 6)), towelWarmer: flag('towelWarmer'),
    accessories: flag('accessories'), smartMirror: flag('smartMirror'), medicineRecess: flag('medicineRecess'), linen: flag('linen'), shelves: flag('shelves'),
    fan: flag('fan'), fanHeater: flag('fanHeater'), lighting: flag('lighting'), recessed: Math.round(num(raw.recessed, 0, 20)), gfci: Math.round(num(raw.gfci, flag('electricalChanges') || (year > 0 && year < 1990) ? 1 : 0, 6)),
    switches: Math.round(num(raw.switches, 0, 6)), showerLight: flag('showerLight'), smoke: flag('smoke'), electricalChanges: flag('electricalChanges', year > 0 && year < 1960), panelUpgrade: flag('panelUpgrade'),
    doorNew: flag('doorNew'), pocketDoor: flag('pocketDoor'), doorWiden: flag('doorWiden'), window: flag('window'), windowWrap: flag('windowWrap', shower !== 'none' && windows > 0),
    paint: flag('paint'), trim: flag('trim'), wainscotSf: num(raw.wainscotSf, 0), wallpaperSf: num(raw.wallpaperSf, 0), epoxy: flag('epoxyGrout'),
    permit: flag('permit'), condo: flag('condo'), singleBath: flag('singleBath'), equipmentDays: given('equipmentDays') ? num(raw.equipmentDays, 1, 60) : Math.max(1, Math.round(floor / 25)),
    suggest: raw.suggestUpgrades !== false && raw.suggestUpgrades !== 'false'
  };
  cfg.gut = flag('fullRemodel');
  if (cfg.gut) {
    Object.assign(cfg, {
      demo: true, ceilingWork: 'replace', drywall: true, drywallSf: wallArea, insulation: true, framing: true, framingHours: Math.max(cfg.framingHours, 16),
      subfloor: given('subfloor') ? cfg.subfloor : condition === 'poor', plumbingChanges: true, electricalChanges: true, gfci: Math.max(cfg.gfci, 1), fan: true, lighting: true, paint: true, trim: true, permit: true,
      equipmentDays: Math.max(cfg.equipmentDays, Math.round(floor / 15) + 3)
    });
    notes.push('Full remodel: walls and ceiling are taken down to the studs and joists and the floor to the subfloor. New plumbing and electrical rough-in, insulation, drywall, finishes and extra debris haul-away are included.');
  }

  cfg.lg = logistics.resolve(raw, { flights: level === 'upper' || level === 'basement' ? 1 : 0, debris: 'dumpster' });
  cfg.debris = debrisOf(cfg, shower !== 'none');
  cfg.travelIn = { driveMiles: raw.driveMiles, driveMinutes: raw.driveMinutes, tollsOneWay: raw.tollsOneWay, siteVisits: raw.siteVisits, vehicles: raw.vehicles, travelPaid: raw.travelPaid };
  if (cfg.leadSafe && !given('leadSafe')) notes.push(`Home built in ${year}: lead-safe (RRP) work practices are included.`);
  if (cfg.asbestosTest && !given('asbestosTest')) notes.push('Older home: asbestos and lead sampling is included before demolition.');
  if (cfg.oldPlumbing && !given('repipe')) notes.push('Home built before 1960: an allowance to replace old supply lines is included. Confirm on site.');
  if (cfg.castIron && !given('castIron')) notes.push('Home built before 1950: an allowance for cast iron or galvanized drain repair is included.');
  if (year > 0 && year < 1960 && cfg.electricalChanges && !given('electricalChanges')) notes.push('Older wiring is likely: electrician and GFCI protection are included.');
  if (level === 'basement') notes.push('Basement bathroom: consider a sewage ejector pump and moisture-rated finishes. Pump is included only when plumbing changes are selected.');
  if (condition === 'poor') notes.push('Poor subfloor condition: full subfloor replacement and 16 hours of framing repairs are included.');
  else if (condition === 'fair') notes.push('Fair condition: 6 hours of framing and blocking repairs are included for hidden damage. Adjust after demolition.');
  if (ceiling > 9) notes.push(`Ceiling height ${ceiling} ft: scaffold or staging is included.`);
  if (cfg.singleBath) notes.push('Only bathroom in the home: temporary toilet rental is included.');
  if (bathType === 'master' && shower === 'walk_in' && glassType === 'none') notes.push('Walk-in shower with no glass selected. Most customers want a glass panel or door.');
  if (shower === 'tub_surround' && cfg.glassType === 'frameless') notes.push('Frameless glass on a tub needs a curb or tub deck check. Confirm dimensions.');
  if (cfg.tilePattern !== 'standard' && cfg.flooring === 'tile') notes.push('Diagonal or herringbone tile adds installation time and waste.');
  if (!cfg.permit) notes.push('No permit selected. Most cities require permits for plumbing and electrical changes.');
  return { cfg, notes };
}

// Debris volume (cubic yards), weight (tons) and the number of loads of materials carried in, from the scope of work.
function debrisOf(c, wet) {
  const yards = c.demo ? (c.gut ? 2 + c.floor * 0.04 + c.wallArea * 0.012 + c.showerWalls * 0.015 : 1 + c.floor * 0.03) + (c.oldTub && wet ? 1 : 0) + (c.ceilingWork === 'replace' && !c.gut ? c.floor * 0.02 : 0) : 0;
  const lbs = c.demo ? (c.gut ? 2.2 * (c.wallArea + c.floor) : 2.2 * c.drywallSf * 0.5) + (c.flooring !== 'none' || c.gut ? c.floor * 8 : 0) + c.showerWalls * 10 + (c.oldTub && wet ? 250 : 0) + 450 : 0;
  const pieces = 25 + c.floor * 0.4 + c.showerWalls * 0.3 + (c.gut ? 40 : 0);
  return { yards: r2(yards), tons: r2(lbs / 2000), pieces: Math.round(pieces), trips: (c.gut ? 6 : c.demo ? 4 : 3) + (c.flooring === 'tile' ? 1 : 0) };
}

// Turns bathroom measurements and scope choices into priced line items from the price book.
const lineCost = i => Math.round(i.qty * (1 + i.waste_bp / 10000) * i.cost_cents);
const costs = items => {
  const bySection = {};
  let total = 0;
  for (const i of items) if (!i.optional) { const v = lineCost(i); bySection[i.section] = (bySection[i.section] || 0) + v; total += v; }
  return { total, bySection };
};

// Trade sequence and working days, the way a remodeler schedules the job.
const minutes = t => { const m = /^(\d{1,2}):(\d{2})$/.exec(String(t)); return m ? Number(m[1]) * 60 + Number(m[2]) : null; };
// Paid hours on site per day: the shift minus lunch and breaks.
function workDay(settings = {}) {
  const start = minutes(settings.work_start ?? '08:00'), end = minutes(settings.work_end ?? '16:30');
  const lunch = settings.lunch_min == null || settings.lunch_min === '' ? 30 : Number(settings.lunch_min);
  const breaks = settings.break_min == null || settings.break_min === '' ? 30 : Number(settings.break_min);
  if (start === null || end === null || lunch < 0 || lunch > 180 || breaks < 0 || breaks > 180 || !Number.isFinite(lunch) || !Number.isFinite(breaks) || end <= start || end - start - lunch - breaks < 120) {
    throw new RangeError('Work shift must be valid and leave at least two productive hours.');
  }
  const productive = (end - start - lunch - breaks) / 60;
  if (productive > 12) throw new RangeError('Work shift cannot exceed 12 productive hours.');
  if (settings.work_saturday !== undefined && ![true, false, '1', '0', 1, 0].includes(settings.work_saturday)) throw new TypeError('work_saturday must be true or false.');
  return { start: settings.work_start || '08:00', end: settings.work_end || '16:30', lunch, breaks, productive: Math.round(productive * 100) / 100, saturday: settings.work_saturday === '1' || settings.work_saturday === true || settings.work_saturday === 1 };
}
const iso = d => d.toISOString().slice(0, 10);
function nextStart(from, saturday) {
  const d = new Date(`${from}T12:00:00Z`);
  while (d.getUTCDay() === 0 || (d.getUTCDay() === 6 && !saturday)) d.setUTCDate(d.getUTCDate() + 1);
  return d;
}
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function buildSchedule(c, wet, hoursFactor = 1, day = workDay(), startDate = '') {
  return scheduleFrom(bathroomPhases(c, wet), hoursFactor, day, startDate);
}

// Turns [phase, crew-days, crew, minimum elapsed days] rows into a dated schedule. Shared with handyman jobs.
// Every working phase carries the labor cushion (8%) for human error and unforeseen conditions.
function scheduleFrom(phases, hoursFactor = 1, day = workDay(), startDate = '') {
  if (!Array.isArray(phases) || !phases.length) throw new TypeError('phases must be a non-empty array.');
  if (!Number.isFinite(hoursFactor) || hoursFactor < 0.25 || hoursFactor > 10) throw new RangeError('hoursFactor must be between 0.25 and 10.');
  const out = phases.map(([phase, d, crew, minDays = 0]) => {
    if (typeof phase !== 'string' || !phase.trim() || !Number.isFinite(d) || d < 0 || !Number.isInteger(crew) || crew < 0 || crew > 100 || !Number.isFinite(minDays) || minDays < 0) throw new RangeError('Each phase needs a name, non-negative days, a non-negative integer crew, and non-negative minimum days.');
    if (!crew) return { phase, days: d, crew, hours: 0 };
    const effort = Math.max(0.25, d * hoursFactor * (1 + CUSHION));
    const days = Math.max(0.25, minDays, Math.ceil(effort * 8 / day.productive * 4) / 4);
    return { phase, days, crew, hours: Math.round(effort * crew * 8 * 10) / 10 };
  });
  if (startDate && !validIsoDate(startDate)) throw new RangeError('startDate must be a real calendar date in YYYY-MM-DD format.');
  const from = startDate || iso(new Date(Date.now() + 86400000));
  const cursor = nextStart(from, day.saturday), startIso = iso(cursor);
  let weekendDays = 0;
  const step = () => { cursor.setUTCDate(cursor.getUTCDate() + 1); while (cursor.getUTCDay() === 0 || (cursor.getUTCDay() === 6 && !day.saturday)) cursor.setUTCDate(cursor.getUTCDate() + 1); };
  for (const p of out) {
    p.start = iso(cursor);
    const n = Math.max(1, Math.ceil(p.days));
    for (let i = 0; i < n; i++) {
      if (p.crew === 0) cursor.setUTCDate(cursor.getUTCDate() + (i ? 1 : 0)); else if (i) step();
      if (p.crew && cursor.getUTCDay() === 6) weekendDays++;
    }
    p.end = iso(cursor);
    if (p.crew) step(); else cursor.setUTCDate(cursor.getUTCDate() + 1);
    if (!p.crew) while (cursor.getUTCDay() === 0 || (cursor.getUTCDay() === 6 && !day.saturday)) cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  const days = Math.round(out.reduce((n, p) => n + p.days, 0) * 4) / 4, hours = Math.round(out.reduce((n, p) => n + p.hours, 0)), baseHours = Math.round(hours / (1 + CUSHION));
  const working = out.filter(p => p.crew), peakCrew = Math.max(...working.map(p => p.crew));
  const averageCrew = Math.round(hours / Math.max(1, working.reduce((n, p) => n + p.days, 0)) / day.productive * 10) / 10;
  const clockHours = Math.round(working.reduce((n, p) => n + p.days, 0) * (day.productive + (day.lunch + day.breaks) / 60) * 10) / 10;
  const lunchHours = Math.round(working.reduce((n, p) => n + p.days * p.crew, 0) * day.lunch / 60 * 10) / 10;
  const last = out[out.length - 1].end;
  const calendarDays = Math.round((new Date(`${last}T12:00:00Z`) - new Date(`${startIso}T12:00:00Z`)) / 86400000) + 1;
  return {
    phases: out, days, weeks: Math.max(1, Math.ceil(calendarDays / 7)), hours, baseHours, cushionPct: CUSHION * 100, peakCrew, averageCrew, workers: peakCrew, clockHours, lunchHours, weekendDays,
    shift: { start: day.start, end: day.end, lunchMin: day.lunch, breakMin: day.breaks, productiveHours: day.productive, saturday: day.saturday },
    startDate: startIso, endDate: last, calendarDays, weekdayRange: day.saturday ? `${DAYS[1]}-${DAYS[6]}` : `${DAYS[1]}-${DAYS[5]}`
  };
}

// Days the crew is actually on site (waiting phases such as inspections and curing are not driven to).
const crewDays = schedule => schedule.phases.filter(p => p.crew).reduce((n, p) => n + Math.max(1, Math.ceil(p.days)), 0);

// Contingency covers hidden conditions. Builders carry more of it for older homes, poor condition and full gut jobs.
function recommendContingency(c) {
  const pct = 5 + { good: 0, fair: 5, poor: 10 }[c.condition] + (c.year > 0 ? (c.year < 1960 ? 5 : c.year < 1980 ? 3 : 0) : 0) + (c.gut ? 5 : 0);
  return Math.min(25, pct);
}

function takeoffPlan(inputs, catalog, learned = null, work = {}) {
  const { cfg: c, notes } = plan(inputs && typeof inputs === 'object' ? inputs : {});
  const find = code => catalog.find(x => x.code === code && x.tier === c.tier) || catalog.find(x => x.code === code && x.tier === '');
  const out = [];
  const add = (section, code, qty, extra = {}) => {
    const item = find(code);
    if (!item || !(qty > 0)) return;
    out.push({ section, kind: item.kind, name: item.name, qty: r2(qty), unit: item.unit, cost_cents: item.cost_cents, waste_bp: item.waste_bp, optional: 0, accepted: 1, ...extra });
  };
  const pair = (section, mat, lab, qty, extra) => { add(section, mat, qty, extra); add(section, lab, qty, extra); };
  const opt = (code, qty, labCode) => { const before = out.length; add('Optional upgrades', code, qty, { optional: 1, accepted: 0 }); if (labCode && out.length > before) add('Optional upgrades', labCode, qty, { optional: 1, accepted: 0 }); };
  const wet = c.shower !== 'none';
  const tileFloor = c.flooring === 'tile';
  const lg = logistics.build(c.lg, { pieces: c.debris.pieces, yards: c.debris.yards, tons: c.debris.tons, tripsAuto: c.debris.trips });
  c.lgHours = lg.hours;

  // Demolition and protection
  if (c.demo) {
    add('Demolition', 'demo-bath', 1);
    if (c.oldTub && wet) add('Demolition', 'demo-tub', 1);
    if (c.gut) { add('Demolition', 'demo-walls', c.wallArea + c.showerWalls); add('Demolition', 'demo-gut-floor', c.floor); }
    else add('Demolition', 'demo-floor', c.floor);
    if (c.ceilingWork === 'replace') add('Demolition', 'demo-ceiling', c.floor);
    add('Demolition', 'protect', 1); add('Demolition', 'dust-barrier', 1);
    if (c.singleBath) add('Demolition', 'portable-toilet', 1);
    if (c.asbestosTest) add('Demolition', 'asbestos-test', 1);
    if (c.leadSafe) add('Demolition', 'lead-safe', 1);
  }
  if (c.doorWiden) add('Demolition', 'door-widen', 1);

  // Structure, backer and waterproofing
  if (c.gut) add('Framing & backer', 'stud-inspect', 8);
  if (c.framing) add('Framing & backer', 'framing', c.framingHours);
  if (c.subfloor) pair('Framing & backer', 'subfloor-mat', 'subfloor-lab', c.floor);
  if (c.leveler) pair('Framing & backer', 'leveler', 'leveler-lab', c.floor);
  if (tileFloor && c.underlay) pair('Framing & backer', 'underlay', 'underlay-lab', c.floor);
  if (c.insulation) pair('Framing & backer', 'insulation', 'insulation-lab', Math.round(c.wallArea * 0.4));
  if (c.soundproof) pair('Framing & backer', 'soundproof', 'soundproof-lab', Math.round(c.wallArea * 0.4));
  if (c.drywall) pair('Framing & backer', 'drywall-mat', 'drywall-lab', c.drywallSf);
  if (c.ceilingWork === 'replace') pair('Framing & backer', 'ceiling-drywall', 'ceiling-drywall-lab', c.floor);
  if (wet && c.showerStyle === 'tile') {
    pair('Framing & backer', 'backer-mat', 'backer-lab', c.showerWalls);
    const wp = c.showerWalls + (c.shower === 'walk_in' ? 16 : 0);
    pair('Waterproofing', 'waterproof-mat', 'waterproof-lab', wp);
    if (c.shower === 'walk_in') { add('Waterproofing', 'pan', 1); add('Waterproofing', 'pan-lab', 1); add('Plumbing & fixtures', 'shower-drain', 1); if (c.curbless) add('Waterproofing', 'curbless', 1); if (c.bench) { add('Waterproofing', 'bench-mat', 1); add('Waterproofing', 'bench-lab', 1); } }
  } else if (c.wallTileSf > 0) {
    pair('Framing & backer', 'backer-mat', 'backer-lab', c.wallTileSf); pair('Waterproofing', 'waterproof-mat', 'waterproof-lab', c.wallTileSf);
  }

  // Tile and flooring
  if (c.flooring === 'tile') {
    pair('Tile', 'floor-tile', 'floor-tile-lab', c.floor); add('Tile', 'tile-setting', c.floor + c.showerWalls);
    if (c.tilePattern !== 'standard') add('Tile', 'tile-pattern', c.floor);
    if (c.heatedFloor) pair('Tile', 'heat-mat', 'heat-lab', c.floor);
    if (c.shower === 'walk_in' && c.showerStyle === 'tile') { const base = Math.round(c.showerWalls ? 12 : 0); pair('Tile', 'shower-floor-tile', 'shower-floor-lab', base); }
    if (c.floor > 0) { pair('Tile', 'tile-base', 'tile-base-lab', Math.max(0, c.perimeter - 3)); pair('Tile', 'threshold', 'threshold-lab', 1); }
  } else if (c.flooring === 'lvp') { pair('Flooring', 'lvp', 'lvp-lab', c.floor); add('Flooring', 'transition', 1); }
  else if (c.flooring === 'vinyl') { pair('Flooring', 'sheet-vinyl', 'sheet-vinyl-lab', c.floor); add('Flooring', 'transition', 1); }
  else if (c.showerWalls) add('Tile', 'tile-setting', c.showerWalls);
  if (c.showerWalls && c.showerStyle === 'tile') { pair('Tile', 'wall-tile', 'wall-tile-lab', c.showerWalls); add('Tile', 'trim-edge', Math.round(Math.sqrt(c.showerWalls) * 2)); }
  if (c.niche && wet) add('Tile', 'niche', 1);
  if (c.epoxy) add('Tile', 'epoxy-grout', c.showerWalls + (tileFloor ? c.floor : 0));
  if (c.shower === 'walk_in' && c.showerStyle === 'tile' && c.showerWalls) {
    // accent band: one row of accent tile around the shower
    if (c.bathType === 'master' || c.tier === 'best') pair('Tile', 'accent-tile', 'accent-lab', Math.max(6, Math.round(c.showerWalls * 0.08)));
  }

  // Plumbing and fixtures
  if (c.showerStyle === 'prefab' && wet) { add('Plumbing & fixtures', 'shower-prefab', c.shower === 'walk_in' ? 1 : 0); add('Plumbing & fixtures', 'surround-kit', 1); add('Plumbing & fixtures', 'surround-lab', 1); }
  if (c.shower === 'tub_surround' || c.newTub) { pair('Plumbing & fixtures', 'tub', 'tub-lab', 1); add('Plumbing & fixtures', 'tub-drain', 1); }
  if (wet) { pair('Plumbing & fixtures', 'shower-valve', 'shower-valve-lab', 1); if (c.handShower) pair('Plumbing & fixtures', 'hand-shower', 'hand-shower-lab', 1); if (c.rainHead) pair('Plumbing & fixtures', 'rain-head', 'rain-head-lab', 1); if (c.bodySprays) pair('Plumbing & fixtures', 'body-spray', 'body-spray-lab', 1); }
  if (wet && c.glassType !== 'none') {
    if (c.glassType === 'curtain') add('Plumbing & fixtures', 'glass-curtain', 1);
    else { add('Plumbing & fixtures', { slider: 'glass-slider', frameless: 'glass', panel: 'glass-panel' }[c.glassType], 1); add('Plumbing & fixtures', 'glass-lab', 1); }
  }
  if (c.vanities) {
    const double = c.vanityType === 'double';
    pair('Plumbing & fixtures', double ? 'vanity-double' : 'vanity', double ? 'vanity-double-lab' : 'vanity-lab', c.vanities);
    add('Plumbing & fixtures', 'faucet', c.vanities * (double ? 2 : 1)); add('Plumbing & fixtures', 'vanity-trap', c.vanities * (double ? 2 : 1)); add('Plumbing & fixtures', 'hardware', c.vanities * (double ? 8 : 4) / 4);
  }
  if (c.toilet === 'replace') { pair('Plumbing & fixtures', 'toilet', 'toilet-lab', 1); add('Plumbing & fixtures', 'toilet-kit', 1); add('Plumbing & fixtures', 'toilet-supply', 1); add('Plumbing & fixtures', 'toilet-seat', 1); }
  else if (c.toilet === 'rebuild') { add('Plumbing & fixtures', 'toilet-kit', 1); add('Plumbing & fixtures', 'toilet-supply', 1); add('Plumbing & fixtures', 'toilet-rebuild-lab', 1); }
  if (c.flange) pair('Plumbing & fixtures', 'flange', 'flange-lab', 1);
  if (c.bidet) pair('Plumbing & fixtures', 'bidet-seat', 'bidet-seat-lab', 1);
  const stops = (c.toilet !== 'keep' ? 1 : 0) + c.vanities * (c.vanityType === 'double' ? 2 : 1);
  if (stops && (c.demo || c.toilet !== 'keep')) pair('Plumbing & fixtures', 'angle-stops', 'angle-stops-lab', stops * 2);
  if (c.gut) { add('Plumbing & fixtures', 'rough-plumb-full', 1); add('Electrical', 'rough-electric-full', 1); }
  else if (c.plumbingChanges) add('Plumbing & fixtures', 'plumb-rough', 1);
  if (c.oldPlumbing) add('Plumbing & fixtures', 'repipe', 1);
  if (c.drainRelocate) add('Plumbing & fixtures', 'drain-relocate', 1);
  if (c.castIron) add('Plumbing & fixtures', 'cast-iron', 1);
  if (c.ejector) add('Plumbing & fixtures', 'ejector', 1);
  if (c.accessories) { pair('Plumbing & fixtures', 'accessories', 'accessories-lab', 1); add('Plumbing & fixtures', 'mirror', c.vanityType === 'double' ? 2 : 1); }
  if (c.smartMirror) pair('Plumbing & fixtures', 'smart-mirror', 'smart-mirror-lab', 1);
  if (c.medicineRecess) add('Plumbing & fixtures', 'medicine-recess', 1);
  if (c.grabBars) pair('Plumbing & fixtures', 'grab-bar', 'grab-lab', c.grabBars);
  if (c.towelWarmer) pair('Plumbing & fixtures', 'towel-warmer', 'towel-warmer-lab', 1);
  if (c.linen) pair('Plumbing & fixtures', 'linen', 'linen-lab', 1);
  if (c.shelves) pair('Plumbing & fixtures', 'shelves', 'shelves-lab', 2);

  // Electrical
  if (c.fan) { add('Electrical', c.fanHeater ? 'fan-heater' : 'fan', 1); add('Electrical', 'fan-lab', 1); add('Electrical', 'duct', 8); }
  if (c.lighting) pair('Electrical', 'light', 'light-lab', c.vanityType === 'double' ? 2 : 1);
  if (c.recessed) pair('Electrical', 'recessed', 'recessed-lab', c.recessed);
  if (c.showerLight && wet) pair('Electrical', 'shower-light', 'shower-light-lab', 1);
  if (c.gfci) pair('Electrical', 'gfci', 'gfci-lab', c.gfci);
  if (c.switches) pair('Electrical', 'switch', 'switch-lab', c.switches);
  if (c.smoke) pair('Electrical', 'smoke', 'smoke-lab', 1);
  if (c.electricalChanges && !c.gut) add('Electrical', 'electric-sub', 1);
  if (c.panelUpgrade) add('Electrical', 'panel-upgrade', 1);

  // Doors, windows and trim
  if (c.pocketDoor) pair('Doors, windows & storage', 'pocket-door', 'pocket-door-lab', 1);
  if (c.doorNew) { pair('Doors, windows & storage', 'door', 'door-lab', 1); add('Doors, windows & storage', 'door-hardware', 1); }
  if (c.window) { pair('Doors, windows & storage', 'window', 'window-lab', Math.max(1, c.windows)); }
  if (c.windowWrap && c.windows) add('Doors, windows & storage', 'window-wrap', c.windows);

  // Finish and closeout
  if (c.wainscotSf) pair('Finish & closeout', 'wainscot', 'wainscot-lab', c.wainscotSf);
  if (c.wallpaperSf) pair('Finish & closeout', 'wallpaper', 'wallpaper-lab', c.wallpaperSf);
  if (c.paint) { const q = Math.min(3, Math.max(0.5, r2((c.wallArea + c.floor) / 250))); pair('Finish & closeout', 'paint-mat', 'paint-lab', q); }
  if (c.trim) pair('Finish & closeout', 'trim-mat', 'trim-lab', c.perimeter);
  add('Finish & closeout', 'sundries', 1); add('Finish & closeout', 'delivery', 1);
  add('Finish & closeout', 'pm', Math.max(4, Math.round(c.floor / 6))); add('Finish & closeout', 'punch', 3);
  if (c.lg.cleanup === 'us') { add('Finish & closeout', 'clean', 1); if (c.gut) add('Finish & closeout', 'gut-cleanup', 1); }
  rentals(c, wet, add);
  if (c.permit) {
    add('Permits', 'permit', 1);
    if (c.plumbingChanges || c.drainRelocate || c.castIron || c.oldPlumbing || wet) add('Permits', 'permit-plumbing', 1);
    if (c.electricalChanges || c.panelUpgrade || c.fan || c.lighting || c.recessed) add('Permits', 'permit-electrical', 1);
  }
  if (c.condo) add('Permits', 'condo-fees', 1);

  // Optional upgrades the customer can accept when signing
  if (c.suggest) {
    if (!c.heatedFloor && tileFloor && c.floor > 0) { opt('heat-mat', c.floor, 'heat-lab'); }
    if (!c.bidet) opt('bidet-seat', 1, 'bidet-seat-lab');
    if (!c.smartMirror) opt('smart-mirror', 1, 'smart-mirror-lab');
    if (!c.towelWarmer) opt('towel-warmer', 1, 'towel-warmer-lab');
    if (!c.grabBars) opt('grab-bar', 2, 'grab-lab');
    if (wet) {
      if (!c.handShower) opt('hand-shower', 1, 'hand-shower-lab');
      if (!c.rainHead) opt('rain-head', 1, 'rain-head-lab');
      if (!c.showerLight) opt('shower-light', 1, 'shower-light-lab');
      if (c.shower === 'walk_in' && !c.bench && c.showerStyle === 'tile') opt('bench-mat', 1, 'bench-lab');
      if (!c.epoxy && c.showerWalls) opt('epoxy-grout', c.showerWalls + (tileFloor ? c.floor : 0));
    }
    if (!c.linen) opt('linen', 1, 'linen-lab');
    if (!c.switches) opt('switch', 2, 'switch-lab');
    if (!c.fanHeater && c.fan) opt('fan-heater', 1);
    if (!c.recessed) opt('recessed', 2, 'recessed-lab');
  }
  const schedule = buildSchedule(c, wet, learned?.hoursFactor ?? 1, workDay(work), String(inputs?.startDate || ''));
  const trip = logistics.travel(c.travelIn, { days: crewDays(schedule), peakCrew: schedule.peakCrew });
  for (const l of [...lg.lines, ...trip.lines]) add(logistics.SECTION, l.code, l.qty, l.cost_cents != null ? { cost_cents: l.cost_cents } : {});
  notes.push(...lg.notes);
  const base = costs(out);
  const features = featuresOf(c);
  const { adjustments, comparables } = applyLearning(out, learned, features);
  if (comparables) notes.push(`Learned from ${comparables.count} similar finished jobs (they averaged ${Math.round(comparables.avgActualCents / 100).toLocaleString('en-US')} dollars of real cost).`);
  const moved = adjustments.filter(a => Math.abs(a.factor - 1) >= 0.03);
  if (moved.length) notes.push(`Learned price adjustments from ${learned.n} finished job${learned.n === 1 ? '' : 's'}: ${moved.map(a => `${a.section} ${a.factor > 1 ? '+' : ''}${Math.round((a.factor - 1) * 100)}%`).join(', ')}.`);
  notes.push(`Crew and time: about ${schedule.hours} labor hours. Plan on ${schedule.peakCrew} people at peak (${schedule.averageCrew} on average), working ${schedule.shift.start} to ${schedule.shift.end} ${schedule.weekdayRange} with a ${schedule.shift.lunchMin} minute lunch and ${schedule.shift.breakMin} minutes of breaks (${schedule.shift.productiveHours} productive hours per person per day). About ${schedule.days} working days: ${schedule.startDate} to ${schedule.endDate} (${schedule.calendarDays} calendar days) once materials are on site.${schedule.shift.saturday ? ` Saturday work is on (${schedule.weekendDays} Saturday${schedule.weekendDays === 1 ? '' : 's'} used).` : ' Weekends are off; weekend work needs to be turned on in Defaults and may carry overtime.'}${learned?.hoursFactor && Math.abs(learned.hoursFactor - 1) >= 0.03 ? ` Hours are adjusted ${learned.hoursFactor > 1 ? '+' : ''}${Math.round((learned.hoursFactor - 1) * 100)}% from real job hours.` : ''}`);
  const contingencyPct = recommendContingency(c);
  return { items: out, notes, schedule, features, cfg: c, logistics: { ...lg, travel: trip, rows: [...lg.rows, ...trip.rows] }, contingencyPct, cost: { base, adjusted: costs(out) }, adjustments };
}


// Specific tool rentals sized to the job: tile days follow the tile area, demolition tools only appear when there is demolition.
function rentals(c, wet, add) {
  const R = 'Tool rental';
  const tileSf = (c.flooring === 'tile' ? c.floor : 0) + (c.showerStyle === 'tile' ? c.showerWalls : 0);
  const tileDays = tileSf > 0 ? Math.max(1, Math.round(tileSf / 60)) : 0;
  const jobDays = Math.max(2, c.equipmentDays + (c.demo ? 1 : 0));
  let any = false;
  const rent = (code, days) => { if (days > 0) { add(R, code, days); any = true; } };
  if (c.demo) { if (c.flooring !== 'none') rent('rent-demo-hammer', 1); rent('rent-scraper', 1); rent('rent-recip', 1); rent('rent-vac', jobDays); }
  if (c.leadSafe || c.asbestosTest) rent('rent-scrubber', Math.max(2, Math.ceil(jobDays / 2)));
  if (tileDays) { if (tileDays >= 5) rent('rent-tile-saw-wk', Math.ceil(tileDays / 5)); else rent('rent-tile-saw', tileDays); rent('rent-mixer', tileDays); rent('rent-laser', 1); }
  if (c.leveler) rent('rent-grinder', 1);
  if (c.ceilingWork === 'replace') rent('rent-lift', 1);
  if (c.oldPlumbing || c.castIron || c.drainRelocate) rent('rent-snake', 1);
  if (c.level === 'basement' || c.condition === 'poor' && c.floor > 0) rent('rent-dehumid', 3);
  if (c.ceiling > 9) rent('scaffold', Math.max(1, Math.round(c.floor / 40)));
  if (c.demo || c.shower !== 'none') rent('rent-dolly', 1);
  if (any) add(R, 'rent-delivery', 1);
}
const takeoff = (inputs, catalog) => takeoffPlan(inputs, catalog).items;

module.exports = { crewDays, workDay, scheduleFrom, costs, SEED_MORE: [...SEED_MORE, ...SEED_RENTAL], plan, takeoff, takeoffPlan };
