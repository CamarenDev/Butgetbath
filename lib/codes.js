'use strict';
// Permit and inspection knowledge for Illinois bathroom work. STATE rules apply everywhere. City entries are starter data
// and must be confirmed with the building department: codes and fees change, and each Illinois municipality adopts its own
// building and electrical code editions. Admin can add or correct any city in Estimator > Codes (stored in the jurisdictions table).

const STATE = {
  name: 'Illinois (statewide)',
  rules: [
    'Plumbing: the Illinois Plumbing Code (77 Ill. Adm. Code 890) applies statewide. Plumbing work must be done by an Illinois licensed plumber.',
    'Energy: the Illinois Energy Conservation Code applies when walls, ceilings or floors are opened and insulation is added or replaced.',
    'Accessibility: the Illinois Accessibility Code applies to some multi-unit and public buildings. Check for condos and rentals.',
    'Lead: federal EPA RRP rule. Pre-1978 homes need a Lead-Safe Certified firm and lead-safe work practices when more than 6 sq ft of paint is disturbed.',
    'Asbestos: test suspect flooring, mastic, plaster and pipe wrap in pre-1981 homes before demolition. Illinois EPA and federal NESHAP rules apply to removal and disposal.',
    'Electrical: Illinois has no statewide electrician license. Each municipality licenses electricians and adopts its own National Electrical Code edition. Confirm both locally.',
    'Building code: Illinois has no single statewide residential building code. Each city or county adopts the IRC edition and amendments it chooses. Unincorporated areas follow the county.'
  ],
  permitTriggers: {
    plumbingChanges: 'Moving or adding fixtures, drains or supply lines needs a plumbing permit and inspection.',
    electricalChanges: 'New circuits, new fixtures wiring or a panel change needs an electrical permit.',
    framing: 'Structural changes, widening a doorway or moving a wall need a building permit.',
    gut: 'A full gut remodel needs a building permit with trade sub-permits.',
    waterHeater: 'Water heater replacement needs a plumbing permit in most cities.',
    window: 'Changing a window opening size needs a building permit. Egress rules apply to bedrooms.'
  },
  noPermitUsually: 'Paint, flooring over the existing subfloor, like-for-like vanity or toilet swap, and tile over an existing surface commonly need no permit. Confirm locally.'
};

const GENERIC_INSPECTIONS = {
  rough: ['Plumbing rough-in: pressure or air test, drain slope, venting, tub and shower valve placement.', 'Electrical rough-in: box fill, cable support, GFCI circuit, fan circuit, before insulation.', 'Framing and blocking: grab bar and fixture blocking.'],
  insulation: ['Insulation inspection when exterior walls are opened.'],
  final: ['Plumbing final: fixtures set, no leaks, trap seals, water heater relief.', 'Electrical final: GFCI works, fan ducted to the exterior, lights correct.', 'Building final: smoke and CO alarms, tempered glass labels in shower areas, ventilation.']
};

// verified: false means starter data. Edit these in the admin Codes page after calling the city.
const CITIES = [
  { city: 'Chicago', dept: 'Chicago Department of Buildings', url: 'https://www.chicago.gov/city/en/depts/bldgs.html', verified: false,
    notes: ['Chicago has its own Construction Codes (Municipal Code Title 14). It does not use the plain IRC.', 'Plumbing and electrical work must be done by a Chicago licensed plumber or electrician under a permit.', 'Chicago generally requires conduit for electrical wiring rather than non-metallic cable.', 'Simple work may qualify for an Express Permit. Larger remodels need plan review.', 'Register contractors and carry required insurance before pulling permits.', 'Reported by public web sources (not yet confirmed with the city): the Express Permit Program covers nonstructural interior remodeling up to 2,000 sq ft in one home or condo unit, including plumbing up to 5 water supply fixture units. Load-bearing walls, stairs and exterior work need standard plan review.', 'Reported: tile, flooring, paint and minor drywall with no wiring or pipes touched need no building permit. Replacing a fixture, moving a drain or new wiring does.', 'Reported: work without a required permit can be fined $1,000 or more, and stop-work orders add penalties.', 'High-rise condos: also get building association approval and a certificate of insurance before work.'] },
  { city: 'Aurora', dept: 'City of Aurora Building and Permits', url: '', verified: false, notes: ['Contractor registration and licensed trades are expected. Confirm the current permit list with the city.'] },
  { city: 'Naperville', dept: 'City of Naperville TED Building', url: '', verified: false, notes: ['Naperville requires permits for plumbing and electrical changes and registered contractors.'] },
  { city: 'Joliet', dept: 'City of Joliet Building Inspections', url: '', verified: false, notes: [] },
  { city: 'Elgin', dept: 'City of Elgin Building Division', url: '', verified: false, notes: [] },
  { city: 'Rockford', dept: 'City of Rockford Building Division', url: '', verified: false, notes: [] },
  { city: 'Springfield', dept: 'City of Springfield Building and Zoning', url: '', verified: false, notes: [] },
  { city: 'Peoria', dept: 'City of Peoria Community Development', url: '', verified: false, notes: [] },
  { city: 'Evanston', dept: 'City of Evanston Building and Inspection Services', url: '', verified: false, notes: [] },
  { city: 'Schaumburg', dept: 'Village of Schaumburg Building', url: '', verified: false, notes: [] },
  { city: 'Oak Park', dept: 'Village of Oak Park Permit Services', url: '', verified: false, notes: [] },
  { city: 'Cicero', dept: 'Town of Cicero Building Department', url: '', verified: false, notes: [] }
];

const norm = s => String(s || '').toLowerCase().replace(/[^a-z ]/g, '').replace(/\b(city|village|town) of\b/g, '').trim();

function findCity(name, custom = []) {
  const n = norm(name);
  if (!n) return null;
  return [...custom, ...CITIES].find(c => norm(c.city) === n) || null;
}

// Returns what the job needs: permits, inspections, and the city notes, from the plan config.
function requirements(cfg, name, custom = []) {
  if (cfg.kind === 'handyman') return handymanRequirements(cfg, name, custom);
  const t = STATE.permitTriggers, permits = [];
  const add = (type, why) => permits.push({ type, why });
  if (cfg.gut) add('Building', t.gut);
  if (cfg.plumbingChanges || cfg.drainRelocate || cfg.ejector) add('Plumbing', t.plumbingChanges);
  if (cfg.electricalChanges || cfg.panelUpgrade || cfg.recessed > 0 || cfg.gfci > 1) add('Electrical', t.electricalChanges);
  if (cfg.doorWiden || cfg.pocketDoor || (cfg.framing && cfg.gut)) add('Building', t.framing);
  if (cfg.window) add('Building', t.window);
  if (cfg.permit && !permits.length) add('Building', 'Your estimate includes a permit allowance. Confirm the exact permit type with the city.');
  const uniq = [...new Map(permits.map(p => [p.type + p.why, p])).values()];
  const city = findCity(name, custom);
  const inspections = [...(uniq.some(p => p.type === 'Plumbing') || cfg.gut ? [GENERIC_INSPECTIONS.rough[0]] : []), ...(uniq.some(p => p.type === 'Electrical') || cfg.gut ? [GENERIC_INSPECTIONS.rough[1]] : []), ...(cfg.framing || cfg.gut ? [GENERIC_INSPECTIONS.rough[2]] : []), ...(cfg.insulation ? GENERIC_INSPECTIONS.insulation : []), ...(uniq.length ? GENERIC_INSPECTIONS.final : [])];
  const flags = [];
  if (cfg.leadSafe) flags.push('Pre-1978 home: the contractor must be EPA Lead-Safe Certified and give the customer the lead pamphlet before work.');
  if (cfg.asbestosTest) flags.push('Pre-1981 home: test suspect materials before demolition.');
  if (cfg.condo) flags.push('Condo or HOA: get association approval and insurance certificates before applying.');
  return {
    state: STATE.name, stateRules: STATE.rules, permits: uniq, permitNeeded: uniq.length > 0,
    noPermitNote: uniq.length ? '' : STATE.noPermitUsually,
    inspections, flags,
    city: city ? { name: city.city, dept: city.dept, url: city.url, verified: !!city.verified, notes: city.notes } : null,
    cityKnown: !!city,
    checklist: ['Call the building department and confirm the permit list for this scope.', 'Confirm which code editions the city has adopted.', 'Confirm contractor registration, trade licenses and insurance requirements.', 'Ask about plan submittal, fees and review time.', 'Book each inspection before you cover the work.'],
    disclaimer: 'Starter guidance, not legal advice. Codes, fees and rules change and differ by city and county. Confirm with the local building department before work.'
  };
}

// Handyman jobs: permit types come from the selected tasks. Small repairs often need none.
function handymanRequirements(cfg, name, custom) {
  const uniq = [...new Map((cfg.permitList || []).map(([type, why]) => [type + why, { type, why }])).values()];
  const city = findCity(name, custom), types = new Set(uniq.map(p => p.type));
  const inspections = [...(types.has('Plumbing') ? ['Plumbing inspection: connections, venting, relief and discharge, and no leaks.'] : []), ...(types.has('Electrical') ? ['Electrical inspection: wiring, boxes, GFCI and AFCI protection before walls close.'] : []), ...(types.has('Building') ? ['Building inspections: footings or framing before cover-up, then a final.'] : [])];
  const flags = [];
  if (cfg.leadSafe) flags.push('Pre-1978 home: the contractor must be EPA Lead-Safe Certified and give the customer the lead pamphlet before disturbing painted surfaces.');
  if (cfg.asbestosTest) flags.push('Pre-1981 home: test old flooring, ceiling texture and plaster for asbestos before scraping or demolition.');
  if (cfg.condo) flags.push('Condo or HOA: get association approval and insurance certificates before applying.');
  if (cfg.tags && cfg.tags.includes('plumbing')) flags.push('Plumbing work must be done by an Illinois licensed plumber.');
  if (cfg.tags && cfg.tags.includes('electrical')) flags.push('Electrical work must be done by an electrician licensed where the job is. Confirm local licensing.');
  if (cfg.tags && cfg.tags.includes('roof')) flags.push('Roofing: check whether your city requires a roofing contractor license. Use fall protection.');
  return {
    state: STATE.name, stateRules: STATE.rules, permits: uniq, permitNeeded: uniq.length > 0,
    noPermitNote: uniq.length ? '' : 'Small repairs, painting, trim, like-for-like fixture and hardware swaps and caulking commonly need no permit. Confirm locally.',
    inspections, flags,
    city: city ? { name: city.city, dept: city.dept, url: city.url, verified: !!city.verified, notes: city.notes } : null,
    cityKnown: !!city,
    checklist: ['Call the building department and confirm the permit list for this scope.', 'Confirm contractor registration, trade licenses and insurance requirements.', 'Ask whether handyman work over a dollar limit needs a registered contractor.', 'Book each inspection before you cover the work.'],
    disclaimer: STATE_DISCLAIMER
  };
}
const STATE_DISCLAIMER = 'Starter guidance, not legal advice. Codes, fees and rules change and differ by city and county. Confirm with the local building department before work.';

module.exports = { STATE, CITIES, findCity, requirements };
