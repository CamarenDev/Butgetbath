'use strict';
// Permit knowledge for the estimator: what work needs which permit, how long permits take, and how that changes the schedule.
// Review times, fees and rules are REFERENCE ASSUMPTIONS compiled from typical Illinois municipal practice. They differ by city
// and change often. Record real permit turnaround on each estimate (Permits card) and the estimator learns each city's actual speed.
// Nothing here is legal advice. See ONLINE-VERIFICATION-TODO.md for the verification list.

const TYPES = ['Building', 'Plumbing', 'Electrical', 'Mechanical', 'Roofing', 'Fence', 'Demolition', 'Other'];

// Reference review time in business days [fast, slow] by permit type and scope size, and a fee range in dollars [low, high].
const REVIEW = {
  Plumbing: { small: [0, 3], standard: [1, 7], large: [3, 15] },
  Electrical: { small: [0, 3], standard: [1, 7], large: [3, 15] },
  Mechanical: { small: [0, 3], standard: [1, 7], large: [3, 15] },
  Roofing: { small: [0, 3], standard: [1, 7], large: [2, 10] },
  Fence: { small: [1, 5], standard: [2, 10], large: [3, 14] },
  Demolition: { small: [1, 5], standard: [3, 10], large: [5, 20] },
  Building: { small: [2, 10], standard: [7, 25], large: [20, 60] },
  Other: { small: [1, 5], standard: [3, 10], large: [5, 20] }
};
const FEES = { Building: [100, 700], Plumbing: [75, 250], Electrical: [75, 250], Mechanical: [75, 250], Roofing: [75, 400], Fence: [25, 150], Demolition: [50, 300], Other: [50, 250] };
const SIZE_RANK = { small: 0, standard: 1, large: 2 };

// Statewide obligations that apply whatever the city is.
const OBLIGATIONS = [
  { id: 'contract', when: () => true, text: 'Illinois Home Repair and Remodeling Act: for work over $1,000, give the customer a written contract (scope, price, start and finish dates, change-order terms) and the state home-repair consumer pamphlet before work or payment.' },
  { id: 'roof-license', when: (c, t) => t.has('roof'), text: 'Roofing: Illinois requires a state Roofing Contractor license (Roofing Industry Licensing Act) plus the city permit.' },
  { id: 'plumber', when: (c, t) => c.plumbingChanges || c.drainRelocate || t.has('plumbing') || t.has('heater'), text: 'Plumbing: work must be done by an Illinois licensed plumber, and the permit is pulled in the plumber\u2019s name.' },
  { id: 'julie', when: (c, t) => t.has('deck') || t.has('fence') || t.has('concrete') || c.excavation, text: 'Digging (post holes, footings, trenches): call JULIE (811) at least 2 business days before you dig so underground utilities are marked. It is free and required by law.' },
  { id: 'alarms', when: c => c.permit || c.gut, text: 'Permitted work: inspectors check smoke and carbon monoxide alarms. Illinois requires CO alarms within 15 feet of every sleeping room and smoke alarms on every level.' },
  { id: 'lead', when: c => c.leadSafe, text: 'Pre-1978 home: EPA RRP rule. The firm must be Lead-Safe Certified, give the customer the lead pamphlet, and use lead-safe work practices.' },
  { id: 'asbestos', when: c => c.asbestosTest, text: 'Pre-1981 home: test suspect flooring, mastic, plaster, texture and pipe wrap before demolition. Illinois EPA and federal rules govern removal and disposal.' },
  { id: 'insurance', when: c => c.permit || c.gut, text: 'Most cities want proof of general liability and workers\u2019 compensation insurance (and a contractor registration or bond) before they issue a permit.' },
  { id: 'hoa', when: c => c.condo, text: 'Condo or HOA: written association approval comes first. Many cities will not issue the permit without it.' }
];

const TRADE = { Plumbing: 'Illinois licensed plumber', Electrical: 'Electrician licensed by the municipality', Mechanical: 'Licensed HVAC or gas contractor (city rules)', Roofing: 'Illinois licensed roofing contractor', Building: 'Registered general contractor (city rules)', Fence: 'Contractor or owner (city rules)', Demolition: 'Registered contractor', Other: 'Check with the city' };

// The work-by-work permit library. `when(cfg, tags)` decides whether a job includes it. Entries with permit 'no' are listed so
// staff and customers can see what does NOT need a permit.
const W = (id, group, name, permit, type, size, when, inspections, note) => ({ id, group, name, permit, type, size, when, inspections, note });
const rough = 'Rough-in inspection before walls close';
const fin = 'Final inspection';
const WORK = [
  W('plumb-move', 'Plumbing', 'Move or add a fixture, drain, vent or supply line', 'yes', 'Plumbing', 'standard', (c, t) => c.plumbingChanges || c.drainRelocate || c.ejector || t.has('plumbing'), [rough, fin], 'Drain slope, venting and a pressure or air test are checked.'),
  W('plumb-swap', 'Plumbing', 'Like-for-like toilet, vanity or faucet swap', 'no', 'Plumbing', 'small', c => c.kind !== 'handyman' && !c.plumbingChanges && !c.drainRelocate, [], 'Usually exempt when no pipes move. Some cities still want a permit if shut-off valves or traps are replaced.'),
  W('plumb-heater', 'Plumbing', 'Replace a water heater (tank or tankless)', 'yes', 'Plumbing', 'small', (c, t) => t.has('heater') || c.waterHeater, ['Final inspection: relief valve, discharge, venting, gas connection and seismic or expansion tank where required'], 'Gas units also need venting and combustion air checks.'),
  W('plumb-repipe', 'Plumbing', 'Re-pipe supply lines or replace a sewer or drain line', 'yes', 'Plumbing', 'large', c => c.oldPlumbing || c.castIron, [rough, fin], 'Replacing old galvanized or cast iron is a full plumbing permit.'),
  W('plumb-sump', 'Plumbing', 'Sump pump, ejector or sewage pit', 'yes', 'Plumbing', 'standard', c => c.ejector, [rough, fin], 'Discharge routing and an electrical circuit are inspected.'),
  W('plumb-gas', 'Mechanical', 'Gas line, gas range or gas fireplace connection', 'yes', 'Mechanical', 'standard', (c, t) => t.has('gas'), ['Gas pressure test', fin], 'Gas work must be tested before it is covered.'),
  W('elec-circuit', 'Electrical', 'New circuit, outlet, light or switch wiring', 'yes', 'Electrical', 'standard', (c, t) => c.electricalChanges || t.has('circuit') || t.has('electrical'), [rough, fin], 'Boxes, cable support, GFCI and AFCI protection are checked before insulation or drywall.'),
  W('elec-panel', 'Electrical', 'Panel replacement or service upgrade', 'yes', 'Electrical', 'large', c => c.panelUpgrade, ['Utility disconnect and reconnect coordination', fin], 'The utility must disconnect and reconnect service. Book it early.'),
  W('elec-recessed', 'Electrical', 'Recessed lighting', 'yes', 'Electrical', 'small', (c, t) => c.recessed > 0 || t.has('recessed'), [rough, fin], 'IC-rated cans in insulated ceilings.'),
  W('elec-fan', 'Electrical', 'Bath exhaust fan (new duct to the exterior)', 'usually', 'Electrical', 'small', c => c.fan && c.gut, [fin], 'Fan must vent to the outside, not the attic. A like-for-like fan swap on an existing circuit usually needs none.'),
  W('elec-ev', 'Electrical', 'EV charger circuit', 'yes', 'Electrical', 'standard', (c, t) => t.has('ev'), [fin], 'Load calculation may be required.'),
  W('bld-gut', 'Building', 'Full gut remodel', 'yes', 'Building', 'standard', c => c.gut, ['Framing and blocking', rough, 'Insulation (if walls are opened)', fin], 'Trade sub-permits (plumbing, electrical) are normally pulled with the building permit.'),
  W('bld-wall', 'Building', 'Remove or move a wall, widen a doorway, pocket door', 'yes', 'Building', 'large', c => c.doorWiden || c.pocketDoor || (c.framing && c.gut), ['Framing inspection before cover-up', fin], 'Load-bearing walls need a header design and often engineered plans.'),
  W('bld-frame', 'Building', 'Frame a partition wall', 'usually', 'Building', 'standard', (c, t) => t.has('framing') && !c.gut, ['Framing inspection', fin], 'Non-structural partitions are often exempt in small remodels. Confirm locally.'),
  W('bld-window-new', 'Building', 'New window opening or changing a window size', 'yes', 'Building', 'standard', (c, t) => c.window && !t.has('window-same'), ['Framing and header inspection', fin], 'Bedrooms must meet egress size rules.'),
  W('bld-window-same', 'Building', 'Replace a window or exterior door in the same opening', 'usually', 'Building', 'small', (c, t) => t.has('window') || t.has('door'), [fin], 'Many cities exempt same-size replacement. Historic districts, condos and energy-code rules may still apply.'),
  W('bld-deck', 'Building', 'Build or substantially repair a deck or porch', 'yes', 'Building', 'standard', (c, t) => t.has('deck'), ['Footing inspection before concrete', 'Framing and ledger inspection', fin], 'Footing depth is 42 inches in most of northern Illinois (frost line). Call JULIE (811) first.'),
  W('bld-fence', 'Fence', 'Build a fence', 'usually', 'Fence', 'small', (c, t) => t.has('fence'), ['Final or setback check'], 'Height, setback and corner-lot sight lines are zoning rules. Pool barriers have stricter rules.'),
  W('bld-concrete', 'Building', 'Patio, driveway, walkway or footing concrete', 'depends', 'Building', 'standard', (c, t) => t.has('concrete'), ['Forms and base inspection (right-of-way work)'], 'Work in the public right-of-way (apron, sidewalk) needs a separate public-works permit.'),
  W('bld-roof', 'Roofing', 'Re-roof or roof repair', 'yes', 'Roofing', 'small', (c, t) => t.has('roof'), ['Final or in-progress inspection'], 'State roofing license required. Some cities limit layers of shingles.'),
  W('bld-siding', 'Building', 'Siding replacement', 'usually', 'Building', 'standard', (c, t) => t.has('siding'), ['Final inspection'], 'Many cities require a permit above a size or cost threshold.'),
  W('bld-basement', 'Building', 'Finish a basement (framing, egress, electrical, plumbing)', 'yes', 'Building', 'large', (c, t) => t.has('basement'), [rough, 'Insulation', fin], 'Egress and ceiling height rules apply to habitable rooms.'),
  W('bld-demo', 'Demolition', 'Demolition beyond cosmetic removal', 'depends', 'Demolition', 'small', c => c.gut && c.demo, ['Utility shut-off verification'], 'Often covered by the building permit. Check for asbestos first on older homes.'),
  W('mech-hvac', 'Mechanical', 'Furnace, boiler, or air conditioner replacement and ductwork', 'yes', 'Mechanical', 'standard', (c, t) => t.has('hvac') || t.has('furnace'), ['Rough or in-progress', fin], 'Gas venting, combustion air and refrigerant line sets are checked.'),
  W('fin-paint', 'Finish work', 'Paint, caulk, trim, hardware, cabinet or countertop swap', 'no', 'Other', 'small', () => true, [], 'Cosmetic work needs no permit, but lead-safe rules still apply to pre-1978 homes.'),
  W('fin-floor', 'Finish work', 'Tile, vinyl or hardwood over the existing subfloor', 'no', 'Other', 'small', () => true, [], 'Flooring alone is normally exempt. Replacing structural subfloor or joists is not.'),
  W('fin-drywall', 'Finish work', 'Drywall repair and patching', 'no', 'Other', 'small', () => true, [], 'Exempt unless fire-rated walls (condo, garage) or insulation are changed.'),
  W('env-insulation', 'Energy', 'Insulate opened exterior walls', 'usually', 'Building', 'small', c => c.insulation, ['Insulation inspection'], 'The Illinois Energy Conservation Code applies when walls are opened.'),
  W('env-lead', 'Environmental', 'Lead-safe work in a pre-1978 home', 'info', 'Other', 'small', c => c.leadSafe, [], 'No permit, but a certified firm is a federal requirement.'),
  W('env-asbestos', 'Environmental', 'Asbestos testing and removal', 'info', 'Other', 'small', c => c.asbestosTest, [], 'Testing is not a permit. Removal and disposal follow Illinois EPA rules, and larger buildings need a notification.')
];

// Common Illinois municipalities in and around the service area. Every entry is starter data (unverified) until someone confirms it
// with the building department; the admin can correct any of them in the jurisdictions list.
const CITY_LIST = {
  Kane: ['Aurora', 'Elgin', 'St. Charles', 'Geneva', 'Batavia', 'North Aurora', 'Montgomery', 'Sugar Grove', 'Carpentersville', 'South Elgin', 'Bartlett', 'West Dundee', 'East Dundee', 'Algonquin', 'Hampshire'],
  Kendall: ['Yorkville', 'Oswego', 'Plano', 'Sandwich', 'Minooka'],
  DeKalb: ['DeKalb', 'Sycamore', 'Genoa', 'Cortland', 'Kirkland'],
  DuPage: ['Naperville', 'Wheaton', 'Glen Ellyn', 'Lombard', 'Downers Grove', 'Elmhurst', 'Carol Stream', 'Villa Park', 'Woodridge', 'Lisle', 'Warrenville', 'West Chicago', 'Wood Dale', 'Addison', 'Bloomingdale', 'Hinsdale', 'Westmont', 'Darien', 'Glendale Heights', 'Oak Brook', 'Itasca', 'Bensenville', 'Roselle', 'Winfield', 'Clarendon Hills', 'Willowbrook', 'Burr Ridge'],
  Will: ['Joliet', 'Plainfield', 'Romeoville', 'Bolingbrook', 'Shorewood', 'New Lenox', 'Lockport', 'Frankfort', 'Mokena', 'Crest Hill', 'Channahon'],
  Cook: ['Chicago', 'Evanston', 'Oak Park', 'Schaumburg', 'Cicero', 'Arlington Heights', 'Des Plaines', 'Skokie', 'Palatine', 'Hoffman Estates', 'Elk Grove Village', 'Orland Park', 'Tinley Park', 'Berwyn', 'Oak Lawn', 'Park Ridge', 'Mount Prospect', 'Wilmette', 'Oak Forest', 'Streamwood', 'Bartlett', 'Barrington', 'Lansing', 'Hickory Hills'],
  Lake: ['Waukegan', 'Libertyville', 'Mundelein', 'Gurnee', 'Lake Zurich'],
  McHenry: ['McHenry', 'Crystal Lake', 'Woodstock', 'Huntley'],
  Winnebago: ['Rockford', 'Loves Park', 'Machesney Park'],
  Sangamon: ['Springfield'],
  Peoria: ['Peoria']
};
const COUNTY_DEPT = { Kane: 'Kane County Development and Community Services', Kendall: 'Kendall County Planning, Building and Zoning', DeKalb: 'DeKalb County Community Development', DuPage: 'DuPage County Building and Zoning', Will: 'Will County Land Use', Cook: 'Cook County Department of Building and Zoning', Lake: 'Lake County Planning, Building and Zoning', McHenry: 'McHenry County Planning and Development', Winnebago: 'Winnebago County Zoning', Sangamon: 'Sangamon County Zoning', Peoria: 'Peoria County Zoning' };
// City-specific facts that were reported by public sources. Still marked unverified.
const CITY_FACTS = {
  Chicago: { review: { Building: [1, 30], Electrical: [1, 10], Plumbing: [1, 10] }, notes: ['Express Permit Program: reviewed in days rather than weeks for qualifying interior remodels. Standard plan review for larger work can take several weeks.', 'Chicago licenses its own plumbers and electricians and generally requires electrical conduit.'] },
  Naperville: { notes: ['Naperville requires permits for plumbing and electrical changes and registered contractors.'] },
  Aurora: { notes: ['Contractor registration and licensed trades are expected.'] }
};

const unique = a => [...new Set(a)];
const addBiz = (d, n) => { const x = new Date(d.getTime()); let step = n < 0 ? -1 : 1, left = Math.abs(n); while (left > 0) { x.setUTCDate(x.getUTCDate() + step); if (x.getUTCDay() !== 0 && x.getUTCDay() !== 6) left--; } return x; };
const iso = d => d.toISOString().slice(0, 10);
const parse = s => /^\d{4}-\d{2}-\d{2}$/.test(String(s || '')) ? new Date(`${s}T12:00:00Z`) : null;

// Jurisdiction rows (built-in): [{ city, county, dept, notes, verified:false }]
function builtInCities() {
  const out = [];
  for (const [county, names] of Object.entries(CITY_LIST)) for (const city of names) {
    if (out.some(x => x.city === city)) continue;
    const facts = CITY_FACTS[city] || {};
    out.push({ city, county, dept: `${city} Building Department`, url: '', verified: false, review: facts.review || null, notes: [...(facts.notes || []), `If the address is outside the city limits it falls under ${COUNTY_DEPT[county]}.`] });
  }
  return out;
}

function reviewFor(type, size, cityRow, actual) {
  const base = (REVIEW[type] || REVIEW.Other)[size] || REVIEW.Other.standard;
  const override = cityRow && cityRow.review && cityRow.review[type];
  const set = cityRow && cityRow.reviewMin !== undefined && cityRow.reviewMin !== null && cityRow.reviewMax ? [cityRow.reviewMin, cityRow.reviewMax] : null;
  let range = override || base, source = override || set ? 'city' : 'reference';
  if (set && !override) range = set;
  if (actual && actual.n >= 3) { range = [Math.max(0, actual.min), Math.max(actual.max, actual.min + 1)]; source = `learned from ${actual.n} of your permits`; }
  return { range, source };
}

// What this job needs, from the plan config and tags.
function scope(cfg, cityRow = null, actualFor = () => null) {
  const tags = new Set(cfg.tags || []), c = { ...cfg };
  const fromTasks = (cfg.permitList || []).map(([type, why]) => ({ type, why }));
  const rows = WORK.filter(w => { try { return w.when(c, tags); } catch { return false; } });
  const need = rows.filter(w => w.permit !== 'no' && w.permit !== 'info');
  const items = need.map(w => ({ id: w.id, group: w.group, name: w.name, permit: w.permit, type: w.type, trade: TRADE[w.type], size: w.size, inspections: w.inspections, note: w.note, review: reviewFor(w.type, w.size, cityRow, actualFor(w.type)), fee: FEES[w.type] }));
  for (const f of fromTasks) if (!items.some(i => i.type === f.type)) items.push({ id: `task-${f.type}`, group: f.type, name: `${f.type} permit for the selected tasks`, permit: 'yes', type: f.type, trade: TRADE[f.type], size: 'standard', inspections: [fin], note: f.why, review: reviewFor(f.type, 'standard', cityRow, actualFor(f.type)), fee: FEES[f.type] });
  const exempt = rows.filter(w => w.permit === 'no').map(w => ({ id: w.id, name: w.name, note: w.note }));
  return { items, exempt, obligations: OBLIGATIONS.filter(o => { try { return o.when(c, tags); } catch { return false; } }).map(o => o.text) };
}

// Permit time plus job time. Permits run in parallel across trades, so the wait is the slowest type. Each inspection can idle the crew a little.
function timeline({ items = [], workDays = 0, startDate = '', inspections = 0 } = {}) {
  if (!items.length) return { needed: false, workDays, totalDays: [workDays, workDays], summary: 'No permit is expected, so the job can start as soon as materials arrive.' };
  const prep = [1, 3], review = [Math.max(...items.map(i => i.review.range[0])), Math.max(...items.map(i => i.review.range[1]))];
  const wait = [Math.round(inspections * 0.5), Math.round(inspections * 1.5)];
  const permitDays = [prep[0] + review[0], prep[1] + review[1]], total = [permitDays[0] + workDays + wait[0], permitDays[1] + workDays + wait[1]];
  const start = parse(startDate), out = { needed: true, prepDays: prep, reviewDays: review, permitDays, inspectionWaitDays: wait, workDays, totalDays: total, sources: unique(items.map(i => i.review.source)) };
  if (start) {
    out.applyBy = iso(addBiz(start, -permitDays[1]));
    out.permitReadyBy = [iso(addBiz(start, -permitDays[1] + permitDays[0])), iso(start)];
    out.finishBy = [iso(addBiz(start, workDays + wait[0])), iso(addBiz(start, workDays + wait[1]))];
  } else {
    const t = new Date(); t.setUTCHours(12, 0, 0, 0);
    out.earliestStart = [iso(addBiz(t, permitDays[0])), iso(addBiz(t, permitDays[1]))];
    out.finishBy = [iso(addBiz(t, total[0])), iso(addBiz(t, total[1]))];
  }
  out.summary = `Permits take about ${permitDays[0]} to ${permitDays[1]} business days (application prep plus city review), then the work takes about ${workDays} working days${wait[1] ? ` plus ${wait[0]} to ${wait[1]} days waiting on inspections` : ''}. Start to finish is ${total[0]} to ${total[1]} business days (about ${Math.ceil(total[0] / 5)} to ${Math.ceil(total[1] / 5)} weeks) from the day the application is filed.`;
  return out;
}

const STATUSES = { needed: 'Needed', applied: 'Applied', issued: 'Issued', inspections: 'Inspections', closed: 'Final approved', waived: 'Not required' };
const RESULTS = { pending: 'Scheduled', passed: 'Passed', failed: 'Failed', corrections: 'Corrections needed' };

module.exports = { TYPES, REVIEW, FEES, TRADE, WORK, OBLIGATIONS, STATUSES, RESULTS, builtInCities, reviewFor, scope, timeline, library: () => WORK.map(({ when, ...w }) => ({ ...w, trade: TRADE[w.type], review: (REVIEW[w.type] || REVIEW.Other)[w.size], fee: FEES[w.type] })) };
