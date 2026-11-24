'use strict';
// Handyman and whole-house repair estimating. Each task has labor hours per unit, material cost per unit and a trade
// (h = in-house handyman, p = licensed plumber, e = licensed electrician). Prices are Home Depot style reference values
// stored in the handyman_tasks table, so admin can edit them in Estimator > Handyman tasks.

const { scheduleFrom, workDay, costs } = require('./bathroom');

const CATS = ['Drywall & plaster', 'Carpentry & trim', 'Doors & windows', 'Flooring', 'Kitchen', 'Plumbing', 'Electrical', 'Smart home & security', 'Exterior & roofing', 'Deck, fence & concrete', 'Painting', 'Assembly & mounting', 'Safety, HVAC & seasonal', 'General & haul-away'];

// [code, category, name, unit, hrs per unit, material $ per unit, trade, tags, options]
// options: crew (people), min (minimum hours), permit ['Building'|'Plumbing'|'Electrical', why], lead (order days)
const R = (code, category, name, unit, hrs, mat, trade, tags = [], o = {}) => ({ code, category, name, unit, hrs, mat, trade, tags, ...o });
const TASKS = [
  // Drywall & plaster
  R('dw-patch-small', CATS[0], 'Patch small holes and nail pops', 'ea', 0.6, 8, 'h', ['drywall', 'paint']),
  R('dw-patch-large', CATS[0], 'Patch large drywall hole (up to 2 ft)', 'ea', 2.5, 30, 'h', ['drywall', 'paint']),
  R('dw-water-patch', CATS[0], 'Cut out and replace water-damaged drywall', 'sf', 0.18, 1.2, 'h', ['drywall', 'hidden']),
  R('dw-hang-finish', CATS[0], 'Hang, tape, mud and sand new drywall', 'sf', 0.1, 0.9, 'h', ['drywall'], { crew: 2 }),
  R('dw-ceiling', CATS[0], 'Hang and finish drywall on a ceiling', 'sf', 0.14, 0.9, 'h', ['drywall', 'ceiling'], { crew: 2 }),
  R('dw-texture', CATS[0], 'Match wall or ceiling texture', 'sf', 0.03, 0.25, 'h', ['drywall']),
  R('dw-popcorn', CATS[0], 'Scrape popcorn ceiling and smooth', 'sf', 0.05, 0.3, 'h', ['drywall', 'ceiling', 'asbestosRisk'], { crew: 2 }),
  R('dw-plaster', CATS[0], 'Repair cracked plaster', 'ea', 1.5, 20, 'h', ['drywall', 'leadRisk']),
  R('dw-wallpaper-remove', CATS[0], 'Remove wallpaper and prep walls', 'sf', 0.05, 0.1, 'h', ['paint', 'wallpaper', 'leadRisk']),
  R('dw-wallpaper-hang', CATS[0], 'Hang wallpaper', 'sf', 0.07, 1.3, 'h', ['wallpaper']),

  // Carpentry & trim
  R('tr-base', CATS[1], 'Install baseboard (unpainted)', 'lf', 0.1, 2.2, 'h', ['trim']),
  R('tr-crown', CATS[1], 'Install crown molding', 'lf', 0.25, 4, 'h', ['trim']),
  R('tr-door-casing', CATS[1], 'Install door casing set', 'ea', 1, 35, 'h', ['trim', 'door']),
  R('tr-window-casing', CATS[1], 'Install window trim set', 'ea', 1.1, 30, 'h', ['trim', 'window']),
  R('tr-wainscot', CATS[1], 'Install wainscot or board and batten', 'sf', 0.25, 4, 'h', ['trim', 'wainscot']),
  R('tr-repair', CATS[1], 'Repair or replace damaged trim', 'ea', 1, 12, 'h', ['trim']),
  R('tr-shelf', CATS[1], 'Install floating shelf or wall shelf', 'ea', 1, 25, 'h', ['shelves']),
  R('tr-closet', CATS[1], 'Install closet shelf and rod system (per section)', 'ea', 2.5, 60, 'h', ['shelves']),
  R('tr-pantry', CATS[1], 'Build pantry or utility shelving', 'ea', 4, 140, 'h', ['shelves', 'framing']),
  R('tr-stair-tread', CATS[1], 'Repair or replace a stair tread', 'ea', 1.2, 30, 'h', ['trim', 'framing']),
  R('tr-handrail', CATS[1], 'Install handrail with brackets', 'lf', 0.4, 12, 'h', ['framing', 'trim']),
  R('tr-frame-wall', CATS[1], 'Frame a partition wall', 'lf', 0.45, 9, 'h', ['framing', 'drywall'], { crew: 2, permit: ['Building', 'New walls usually need a building permit.'] }),
  R('tr-blocking', CATS[1], 'Add blocking for TV, grab bars or cabinets', 'ea', 0.8, 8, 'h', ['framing']),
  R('tr-subfloor', CATS[1], 'Repair subfloor', 'sf', 0.15, 2.5, 'h', ['framing', 'subfloor', 'hidden']),

  // Doors & windows
  R('dr-int-prehung', CATS[2], 'Install interior prehung door', 'ea', 2, 110, 'h', ['door', 'trim'], { lead: 5 }),
  R('dr-ext-prehung', CATS[2], 'Install exterior prehung door', 'ea', 4, 450, 'h', ['door', 'window'], { crew: 2, lead: 10 }),
  R('dr-slab', CATS[2], 'Replace door slab, hinges and bore', 'ea', 1.5, 70, 'h', ['door']),
  R('dr-adjust', CATS[2], 'Fix a sticking or sagging door', 'ea', 0.75, 3, 'h', ['door']),
  R('dr-lockset', CATS[2], 'Replace lockset or knob', 'ea', 0.5, 35, 'h', ['lock']),
  R('dr-deadbolt', CATS[2], 'Install deadbolt', 'ea', 0.75, 45, 'h', ['lock', 'door']),
  R('dr-storm', CATS[2], 'Install storm or screen door', 'ea', 2, 150, 'h', ['door']),
  R('dr-slider', CATS[2], 'Repair sliding door track or rollers', 'ea', 1.2, 40, 'h', ['door']),
  R('dr-weather', CATS[2], 'Weatherstrip and seal a door', 'ea', 1, 25, 'h', ['door']),
  R('dr-garage-opener', CATS[2], 'Install garage door opener', 'ea', 3.5, 280, 'h', ['garage', 'electrical']),
  R('dr-garage-fix', CATS[2], 'Garage door tune-up, rollers and sensors', 'ea', 1.5, 30, 'h', ['garage']),
  R('wn-replace', CATS[2], 'Replace a standard vinyl window (same size)', 'ea', 2.5, 350, 'h', ['window'], { lead: 14, permit: ['Building', 'Some cities require a permit for window replacement. Confirm locally.'] }),
  R('wn-repair', CATS[2], 'Repair window sash, glazing or balance', 'ea', 1.2, 25, 'h', ['window']),
  R('wn-screen', CATS[2], 'Replace window screen', 'ea', 0.4, 25, 'h', ['window']),
  R('wn-caulk', CATS[2], 'Seal and caulk around windows', 'ea', 0.6, 8, 'h', ['window', 'exterior']),

  // Flooring
  R('fl-lvp', CATS[3], 'Install luxury vinyl plank flooring', 'sf', 0.06, 3, 'h', ['lvp']),
  R('fl-laminate', CATS[3], 'Install laminate flooring', 'sf', 0.06, 2.5, 'h', ['lvp']),
  R('fl-carpet', CATS[3], 'Install carpet and pad', 'sf', 0.04, 3, 'h', ['carpet']),
  R('fl-tile', CATS[3], 'Install floor tile with grout', 'sf', 0.3, 6, 'h', ['tile', 'floortile']),
  R('fl-hardwood-refinish', CATS[3], 'Sand and refinish hardwood floor', 'sf', 0.08, 1.2, 'h', ['hardwood']),
  R('fl-hardwood-repair', CATS[3], 'Repair or replace hardwood boards', 'ea', 2, 40, 'h', ['hardwood']),
  R('fl-transition', CATS[3], 'Install floor transition strip', 'ea', 0.5, 15, 'h', ['lvp']),
  R('fl-squeak', CATS[3], 'Fix squeaky floor or stairs', 'ea', 1, 6, 'h', ['framing']),
  R('fl-remove', CATS[3], 'Remove old flooring and prep subfloor', 'sf', 0.05, 0.1, 'h', ['demo', 'asbestosRisk']),

  // Kitchen
  R('kt-cabinets', CATS[4], 'Install stock kitchen cabinets', 'lf', 1.1, 140, 'h', ['cabinet', 'framing'], { crew: 2, lead: 14 }),
  R('kt-cab-hardware', CATS[4], 'Install cabinet knobs and pulls', 'ea', 0.1, 4, 'h', ['cabinet']),
  R('kt-cab-adjust', CATS[4], 'Adjust or replace cabinet hinges and drawer slides', 'ea', 0.4, 12, 'h', ['cabinet']),
  R('kt-counter', CATS[4], 'Install laminate countertop', 'lf', 0.8, 45, 'h', ['counter'], { crew: 2 }),
  R('kt-backsplash', CATS[4], 'Install tile backsplash', 'sf', 0.4, 6, 'h', ['tile']),
  R('kt-dishwasher', CATS[4], 'Install dishwasher', 'ea', 2, 60, 'p', ['appliance', 'plumbing']),
  R('kt-range-hood', CATS[4], 'Install range hood', 'ea', 2.5, 60, 'e', ['appliance', 'electrical']),
  R('kt-microwave', CATS[4], 'Install over-the-range microwave', 'ea', 1.5, 25, 'h', ['appliance']),
  R('kt-paint-cab', CATS[4], 'Prep and paint cabinet doors and boxes', 'ea', 0.6, 8, 'h', ['paint', 'cabinet', 'leadRisk']),

  // Plumbing
  R('pl-faucet-kitchen', CATS[5], 'Replace kitchen faucet', 'ea', 1.5, 180, 'p', ['plumbing']),
  R('pl-faucet-bath', CATS[5], 'Replace bathroom faucet', 'ea', 1.25, 120, 'p', ['plumbing']),
  R('pl-sink', CATS[5], 'Replace a sink and drain', 'ea', 2.5, 250, 'p', ['plumbing']),
  R('pl-toilet', CATS[5], 'Replace a toilet', 'ea', 1.75, 230, 'p', ['plumbing', 'toilet']),
  R('pl-toilet-fix', CATS[5], 'Repair toilet (fill valve, flapper, handle)', 'ea', 0.75, 25, 'h', ['plumbing', 'toilet']),
  R('pl-disposal', CATS[5], 'Install garbage disposal', 'ea', 1.5, 140, 'p', ['plumbing', 'electrical']),
  R('pl-clog', CATS[5], 'Clear a clogged drain', 'ea', 1, 0, 'p', ['plumbing', 'drain']),
  R('pl-leak', CATS[5], 'Repair a leaking supply line or fitting', 'ea', 1.5, 30, 'p', ['plumbing', 'hidden']),
  R('pl-shutoff', CATS[5], 'Replace shutoff or angle stop valve', 'ea', 1, 25, 'p', ['plumbing']),
  R('pl-hosebib', CATS[5], 'Replace outdoor hose bib (frost-free)', 'ea', 1.5, 40, 'p', ['plumbing', 'exterior']),
  R('pl-showerhead', CATS[5], 'Replace showerhead or tub spout', 'ea', 0.4, 40, 'h', ['plumbing']),
  R('pl-tub-caulk', CATS[5], 'Remove and re-caulk tub or shower', 'ea', 1.5, 15, 'h', ['wet']),
  R('pl-water-heater', CATS[5], 'Replace a tank water heater', 'ea', 4, 900, 'p', ['plumbing', 'heater'], { crew: 2, lead: 2, permit: ['Plumbing', 'Water heater replacement needs a plumbing permit in most cities.'] }),
  R('pl-sump', CATS[5], 'Install or replace a sump pump', 'ea', 3, 250, 'p', ['plumbing', 'electrical'], { permit: ['Plumbing', 'Sump discharge and pit work can need a plumbing permit.'] }),
  R('pl-icemaker', CATS[5], 'Run ice maker or washer supply line', 'ea', 1, 30, 'p', ['plumbing']),
  R('pl-softener', CATS[5], 'Install a water softener', 'ea', 4, 600, 'p', ['plumbing'], { permit: ['Plumbing', 'Softener connections may need a plumbing permit.'] }),

  // Electrical
  R('el-outlet', CATS[6], 'Replace outlet (receptacle)', 'ea', 0.4, 5, 'e', ['electrical']),
  R('el-gfci', CATS[6], 'Install GFCI outlet', 'ea', 0.6, 22, 'e', ['electrical', 'gfci']),
  R('el-switch', CATS[6], 'Replace light switch', 'ea', 0.35, 6, 'e', ['electrical']),
  R('el-dimmer', CATS[6], 'Install dimmer switch', 'ea', 0.5, 30, 'e', ['electrical']),
  R('el-fixture', CATS[6], 'Replace light fixture', 'ea', 1, 90, 'e', ['electrical', 'lighting']),
  R('el-fan', CATS[6], 'Install ceiling fan', 'ea', 1.5, 160, 'e', ['electrical', 'lighting']),
  R('el-recessed', CATS[6], 'Install recessed (can) light', 'ea', 1.25, 45, 'e', ['electrical', 'recessed'], { permit: ['Electrical', 'New lights on a new or extended circuit need an electrical permit.'] }),
  R('el-outdoor', CATS[6], 'Install outdoor or motion light', 'ea', 1, 60, 'e', ['electrical', 'exterior']),
  R('el-usb', CATS[6], 'Install USB outlet', 'ea', 0.5, 28, 'e', ['electrical']),
  R('el-circuit', CATS[6], 'Add a new circuit and outlet', 'ea', 3, 120, 'e', ['electrical', 'circuit'], { permit: ['Electrical', 'A new circuit needs an electrical permit and inspection.'] }),
  R('el-panel', CATS[6], 'Upgrade electrical panel', 'ea', 8, 1800, 'e', ['electrical', 'circuit'], { crew: 2, lead: 7, permit: ['Electrical', 'Panel work needs an electrical permit and utility coordination.'] }),
  R('el-ev', CATS[6], 'Install EV charger circuit and charger', 'ea', 4, 600, 'e', ['electrical', 'circuit'], { permit: ['Electrical', 'EV charger circuits need an electrical permit.'] }),
  R('el-smoke', CATS[6], 'Replace smoke or CO detector', 'ea', 0.4, 30, 'h', ['smoke']),
  R('el-doorbell', CATS[6], 'Install doorbell or video doorbell', 'ea', 0.75, 90, 'h', ['smart', 'electrical']),

  // Smart home & security
  R('sm-thermostat', CATS[7], 'Install smart thermostat', 'ea', 1, 140, 'h', ['smart']),
  R('sm-lock', CATS[7], 'Install smart lock', 'ea', 0.75, 180, 'h', ['smart', 'lock']),
  R('sm-camera', CATS[7], 'Install security camera', 'ea', 1, 120, 'h', ['smart', 'exterior']),
  R('sm-switch', CATS[7], 'Install smart switch or plug', 'ea', 0.5, 30, 'e', ['smart', 'electrical']),
  R('sm-wifi', CATS[7], 'Mount router or mesh access point and run cable', 'ea', 1.5, 40, 'h', ['smart']),

  // Exterior & roofing
  R('ex-gutter-clean', CATS[8], 'Clean gutters and downspouts', 'lf', 0.02, 0, 'h', ['gutter', 'ladder', 'exterior']),
  R('ex-gutter-replace', CATS[8], 'Replace gutters and downspouts', 'lf', 0.12, 6, 'h', ['gutter', 'ladder', 'exterior']),
  R('ex-siding', CATS[8], 'Repair or replace siding', 'ea', 2.5, 60, 'h', ['siding', 'ladder', 'exterior', 'hidden', 'leadRisk']),
  R('ex-soffit', CATS[8], 'Repair soffit or fascia', 'lf', 0.25, 7, 'h', ['siding', 'ladder', 'exterior', 'hidden']),
  R('ex-roof-leak', CATS[8], 'Find and repair a roof leak', 'ea', 3, 60, 'h', ['roof', 'ladder', 'exterior', 'hidden'], { crew: 2 }),
  R('ex-shingle', CATS[8], 'Replace damaged shingles', 'ea', 3, 70, 'h', ['roof', 'ladder', 'exterior'], { crew: 2 }),
  R('ex-caulk', CATS[8], 'Exterior caulk and seal', 'lf', 0.03, 0.3, 'h', ['exterior', 'ladder']),
  R('ex-pressure-wash', CATS[8], 'Pressure wash house, deck or driveway', 'sf', 0.01, 0.05, 'h', ['pressureWash', 'exterior']),
  R('ex-porch', CATS[8], 'Repair porch step, rail or post', 'ea', 3, 90, 'h', ['deck', 'exterior', 'hidden']),
  R('ex-dryer-vent', CATS[8], 'Clean or replace dryer vent', 'ea', 1.25, 10, 'h', ['exterior']),
  R('ex-mailbox', CATS[8], 'Install or replace mailbox', 'ea', 1, 60, 'h', ['concrete', 'exterior']),
  R('ex-downspout-ext', CATS[8], 'Add downspout extensions and splash blocks', 'ea', 0.4, 18, 'h', ['gutter', 'exterior']),

  // Deck, fence & concrete
  R('dk-new', CATS[9], 'Build a new deck', 'sf', 0.35, 14, 'h', ['deck', 'framing', 'concrete', 'exterior'], { crew: 2, lead: 7, permit: ['Building', 'New decks need a building permit and footing inspection.'] }),
  R('dk-repair', CATS[9], 'Repair deck boards, joists or railing', 'sf', 0.2, 4, 'h', ['deck', 'framing', 'exterior', 'hidden'], { permit: ['Building', 'Structural deck repairs may need a permit. Confirm locally.'] }),
  R('dk-stain', CATS[9], 'Clean and stain or seal deck', 'sf', 0.05, 0.8, 'h', ['deck', 'pressureWash', 'exterior']),
  R('fn-new', CATS[9], 'Build a wood fence', 'lf', 0.6, 18, 'h', ['fence', 'concrete', 'exterior'], { crew: 2, permit: ['Building', 'Fences over local height limits or near property lines may need a permit.'] }),
  R('fn-repair', CATS[9], 'Repair fence panel, post or gate', 'ea', 1.5, 40, 'h', ['fence', 'concrete', 'exterior']),
  R('cn-patch', CATS[9], 'Patch concrete steps, walks or driveway cracks', 'ea', 2, 40, 'h', ['concrete', 'exterior']),
  R('cn-pad', CATS[9], 'Pour a small concrete pad', 'sf', 0.12, 6, 'h', ['concrete', 'exterior'], { crew: 2 }),

  // Painting
  R('pt-walls', CATS[10], 'Paint walls (two coats, includes prep)', 'sf', 0.02, 0.15, 'h', ['paint', 'leadRisk']),
  R('pt-ceiling', CATS[10], 'Paint ceiling', 'sf', 0.025, 0.2, 'h', ['paint']),
  R('pt-trim', CATS[10], 'Paint trim and baseboard', 'lf', 0.06, 0.25, 'h', ['paint', 'trim', 'leadRisk']),
  R('pt-door', CATS[10], 'Paint a door (both sides)', 'ea', 1, 12, 'h', ['paint', 'door', 'leadRisk']),
  R('pt-exterior', CATS[10], 'Paint house exterior', 'sf', 0.03, 0.35, 'h', ['paint', 'exterior', 'ladder', 'pressureWash', 'leadRisk']),
  R('pt-stain', CATS[10], 'Stain or varnish wood trim, doors or railings', 'ea', 1.5, 15, 'h', ['paint', 'trim']),
  R('pt-closet', CATS[10], 'Paint a closet or small room', 'ea', 3, 25, 'h', ['paint', 'leadRisk']),

  // Assembly & mounting
  R('as-tv', CATS[11], 'Mount a TV and hide the cables', 'ea', 1.5, 45, 'h', ['tvmount']),
  R('as-furniture', CATS[11], 'Assemble furniture', 'ea', 1.5, 0, 'h', ['assembly']),
  R('as-curtain', CATS[11], 'Hang curtain rod or blinds', 'ea', 0.5, 25, 'h', ['window']),
  R('as-mirror', CATS[11], 'Hang a mirror or heavy art', 'ea', 0.75, 15, 'h', ['assembly']),
  R('as-pictures', CATS[11], 'Hang pictures and small decor', 'ea', 0.25, 2, 'h', ['assembly']),
  R('as-grab', CATS[11], 'Install grab bar into blocking', 'ea', 1, 35, 'h', ['grabBars', 'framing']),
  R('as-garage', CATS[11], 'Install garage shelving or storage', 'ea', 2, 90, 'h', ['shelves', 'garage']),
  R('as-childproof', CATS[11], 'Baby-proof (gates, locks, outlet covers, anchors)', 'ea', 0.5, 20, 'h', ['assembly']),
  R('as-appliance-move', CATS[11], 'Move and hook up a washer, dryer or fridge', 'ea', 1.5, 20, 'h', ['appliance', 'dolly']),

  // Safety, HVAC & seasonal
  R('sf-filter', CATS[12], 'Replace HVAC filters and check the system', 'ea', 0.25, 12, 'h', ['hvac']),
  R('sf-heater-flush', CATS[12], 'Flush the water heater', 'ea', 1, 0, 'h', ['plumbing']),
  R('sf-winterize', CATS[12], 'Winterize hose bibs, windows and exterior', 'ea', 2, 25, 'h', ['exterior']),
  R('sf-attic', CATS[12], 'Add blown attic insulation', 'sf', 0.01, 0.9, 'h', ['attic', 'insulation'], { crew: 2 }),
  R('sf-weather', CATS[12], 'Air seal and weatherize (doors, windows, outlets)', 'ea', 3, 60, 'h', ['window', 'door']),
  R('sf-pest', CATS[12], 'Seal gaps and screen vents against pests', 'ea', 2, 25, 'h', ['exterior']),
  R('sf-co', CATS[12], 'Install smoke and CO alarms throughout', 'ea', 0.4, 35, 'h', ['smoke']),
  R('sf-radon', CATS[12], 'Seal basement cracks and rim joist', 'ea', 3, 60, 'h', ['basement']),

  // General
  R('gn-hourly', CATS[13], 'Handyman time (hourly, any small repair)', 'hr', 1, 0, 'h', [], {}),
  R('gn-haul', CATS[13], 'Haul-away of debris or old items (per load)', 'ea', 1.5, 75, 'h', ['demo']),
  R('gn-clean', CATS[13], 'Post-job deep clean', 'ea', 1.5, 10, 'h', []),
  R('gn-demo', CATS[13], 'Small demolition (cabinet, wall section, built-in)', 'ea', 3, 20, 'h', ['demo', 'asbestosRisk'], { crew: 2 })
].map((t, i) => ({ ...t, sort: i }));

const TRADE = { h: 'handyman', p: 'licensed plumber', e: 'licensed electrician' };
const num = (v, lo, hi, d = 0) => { const n = Number(v); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d; };

function handymanPlan(inputs = {}, rows = [], settings = {}, work = {}) {
  const by = new Map(rows.map(r => [r.code, r]));
  const rate = Math.round(num(settings.handyman_rate, 20, 400, 75) * 100), licensed = Math.round(num(settings.licensed_rate, 40, 500, 125) * 100);
  const minHours = num(settings.handyman_min_hours, 0, 8, 2), year = num(inputs.homeYear, 0, 2100);
  const notes = [], items = [], cats = new Map(), tags = new Set(), permitList = [], leads = [];
  const picked = inputs.tasks && typeof inputs.tasks === 'object' ? Object.entries(inputs.tasks) : [];
  let handyHours = 0, count = 0;
  for (const [code, rawQty] of picked) {
    const t = by.get(code), qty = num(rawQty, 0, 100000);
    if (!t || !(qty > 0)) continue;
    count++;
    const hrs = Math.round(Math.max(t.min_hrs || 0, t.hrs * qty) * 100) / 100, lic = t.trade !== 'h';
    items.push({ section: t.category, kind: lic ? 'subcontractor' : 'labor', name: `${t.name} (${lic ? TRADE[t.trade] : 'labor'})`, qty: hrs, unit: 'hr', cost_cents: lic ? licensed : rate, waste_bp: 0, optional: 0, accepted: 1 });
    if (t.mat_cents > 0) items.push({ section: t.category, kind: 'material', name: `${t.name}: materials`, qty, unit: t.unit === 'hr' ? 'ea' : t.unit, cost_cents: t.mat_cents, waste_bp: ['sf', 'lf'].includes(t.unit) ? 500 : 0, optional: 0, accepted: 1 });
    if (!lic) handyHours += hrs;
    const c = cats.get(t.category) || { hours: 0, crew: 1, dry: false };
    c.hours += hrs; c.crew = Math.max(c.crew, t.crew || 1); c.dry = c.dry || t.tags.includes('drywall'); cats.set(t.category, c);
    t.tags.forEach(g => tags.add(g));
    if (t.trade === 'p') tags.add('plumbing'); if (t.trade === 'e') tags.add('electrical');
    if (t.permit_type) permitList.push([t.permit_type, t.permit_note || 'Confirm the permit with the city.']);
    if (t.lead_days) leads.push({ days: t.lead_days, note: `${t.name}: order about ${t.lead_days} business days ahead.` });
  }
  if (!count) notes.push('Pick the jobs to price. The estimate builds from the tasks you choose.');
  if (count && handyHours < minHours && minHours > 0) {
    items.push({ section: 'General & haul-away', kind: 'labor', name: 'Minimum service visit (trip, setup and cleanup)', qty: Math.round((minHours - handyHours) * 100) / 100, unit: 'hr', cost_cents: rate, waste_bp: 0, optional: 0, accepted: 1 });
    notes.push(`Handyman time is under the ${minHours} hour minimum, so the difference is added as a service visit charge.`);
  }
  const types = [...new Set(permitList.map(p => p[0]))];
  if (types.length) {
    items.push({ section: 'Permits', kind: 'other', name: `Permit and inspection fees (allowance for ${types.join(' and ').toLowerCase()})`, qty: types.length, unit: 'ls', cost_cents: 15000, waste_bp: 0, optional: 0, accepted: 1 });
    notes.push(`Permits likely needed: ${types.join(', ')}. Check the Permits and codes section below.`);
  }
  const leadSafe = year > 0 && year < 1978 && tags.has('leadRisk'), asbestosTest = year > 0 && year < 1981 && tags.has('asbestosRisk');
  if (leadSafe) notes.push('Pre-1978 home and paint or trim will be disturbed: lead-safe work practices are required.');
  if (asbestosTest) notes.push('Pre-1981 home and old flooring, ceiling or plaster will be disturbed: test for asbestos first.');
  if (tags.has('hidden')) notes.push('Some of these jobs hide damage (leaks, rot, water). The contingency is raised and the price is confirmed after the repair is opened.');
  if (items.some(i => i.section === 'Plumbing' || i.section === 'Electrical')) notes.push('Plumbing and electrical tasks are priced at the licensed trade rate. Illinois requires a licensed plumber for plumbing work.');

  const day = workDay(work), phases = [];
  for (const cat of CATS) {
    const c = cats.get(cat);
    if (!c) continue;
    phases.push([cat, c.hours / (c.crew * 8), c.crew]);
    if (c.dry) phases.push(['Joint compound dry time', 1, 0]);
  }
  phases.push(['Final clean and walk-through', 0.5, 1]);
  const schedule = scheduleFrom(phases, 1, day, String(inputs.startDate || ''));
  if (count) notes.push(`Crew and time: about ${schedule.hours} labor hours over ${schedule.days} working days, ${schedule.peakCrew} ${schedule.peakCrew === 1 ? 'person' : 'people'} at peak. Handyman jobs are best done as one visit when they can be bundled.`);

  const cfg = {
    kind: 'handyman', tier: 'better', tags: [...tags], year, floor: 0, bathType: '', permit: types.length > 0, permitList, taskCount: count, leads,
    plumbingChanges: types.includes('Plumbing'), electricalChanges: types.includes('Electrical'), leadSafe, asbestosTest, condo: inputs.condo === true || inputs.condo === 'true',
    hidden: tags.has('hidden'), exterior: tags.has('exterior'), gut: false, framing: tags.has('framing'), insulation: tags.has('insulation'), window: false, doorWiden: false, pocketDoor: false
  };
  const contingencyPct = Math.min(20, 5 + (year > 0 && year < 1960 ? 5 : year > 0 && year < 1980 ? 3 : 0) + (cfg.hidden ? 5 : 0));
  const total = costs(items);
  return { kind: 'handyman', items, notes, schedule, features: {}, cfg, contingencyPct, cost: { base: total, adjusted: total }, adjustments: [] };
}

module.exports = { CATS, TASKS, TRADE, handymanPlan };
