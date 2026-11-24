'use strict';
// Crew roles: who does what at the job. Every bathroom phase and every handyman task is split into roles with duties,
// so the estimator can show the hours each role needs, and the crew gets a briefing that says what each person does.

const LEAD = 'Lead carpenter / foreman', HELP = 'Helper / laborer', TILE = 'Tile setter', PLUMB = 'Licensed plumber', ELEC = 'Licensed electrician', DRY = 'Drywall finisher', PAINT = 'Painter', GLASS = 'Glass installer';
const ROLE_NOTES = {
  [LEAD]: 'Runs the site: reads the plan, talks with the customer, makes the cuts and decisions, checks quality and signs off each phase.',
  [HELP]: 'Carries materials in and debris out, protects the home, mixes, cuts and cleans so the skilled trades keep working.',
  [TILE]: 'Lays out and sets tile, builds the shower pan and waterproofing, and grouts.',
  [PLUMB]: 'Licensed plumber: roughs in, sets and tests every water, drain and vent connection.',
  [ELEC]: 'Licensed electrician: wires circuits, devices, fan and lights, and tests the GFCIs.',
  [DRY]: 'Hangs, tapes, mud-coats and sands the drywall.',
  [PAINT]: 'Preps, primes and paints the room and the trim.',
  [GLASS]: 'Templates, installs and seals the glass enclosure.',
  Handyman: 'Does the repair start to finish, protects the home and cleans up.',
  'Lead handyman': 'Runs the job, does the skilled work and checks it with the customer.'
};

// [role, share of the phase hours, duties]
const BATH = {
  'Protect, set up and dust control': [[LEAD, 0.5, ['Walk the job with the customer and photograph the existing conditions and shut-offs.', 'Shut off the water and confirm the circuits are labeled.', 'Set up the zip walls and the dust fan.']], [HELP, 0.5, ['Lay the floor protection from the door to the room.', 'Carry the tools and the first materials in and stage them.', 'Set up the trash station and the dumpster path.']]],
  'Lead and asbestos testing (lab turnaround)': [[LEAD, 1, ['Collect the samples with the area wet-wiped and send them to the lab.', 'Hold off the demolition until the results come back.']]],
  'Demolition and haul-away': [[LEAD, 0.5, ['Disconnect and cap the plumbing and electrical.', 'Cut and remove the tub, tile and fixtures and check for hidden damage.']], [HELP, 0.5, ['Bag the debris and carry it out to the dumpster or truck.', 'Vacuum the room and the path at the end of each day.']]],
  'Demolition to the studs and subfloor': [[LEAD, 0.5, ['Confirm the circuits are dead and the water is capped.', 'Open the walls and ceiling, inspect the framing and photograph the findings.']], [HELP, 0.5, ['Pull insulation, lath and drywall and carry the debris out.', 'HEPA-vacuum the cavities and the floor.']]],
  'Framing, blocking and subfloor repairs': [[LEAD, 0.7, ['Repair the framing and the subfloor and set the blocking at the marked heights.']], [HELP, 0.3, ['Cut and carry the lumber, sweep the sawdust and bag the scrap.']]],
  'Plumbing and electrical rough-in (licensed trades)': [[PLUMB, 0.5, ['Rough in the shower valve, the drains, the vents and the supplies and pressure-test them.']], [ELEC, 0.5, ['Run the circuits, boxes and the fan duct and photograph every run.']]],
  'Rough-in inspection': [[LEAD, 1, ['Meet the inspector, leave everything exposed and fix any corrections.']]],
  'Insulation and drywall hanging': [[DRY, 0.5, ['Hang the moisture-resistant board and cut the openings.']], [HELP, 0.5, ['Fit the insulation, carry and lift the sheets and clean up the scrap.']]],
  'Tape, mud and sand (dry time between coats)': [[DRY, 1, ['Tape and coat three times with the drying time between and sand and prime.']]],
  'Backer and waterproofing': [[TILE, 0.6, ['Build the shower pan, curb and niche and apply the membrane.']], [HELP, 0.4, ['Cut the cement board, mix thinset and prep the walls.', 'Vacuum before the membrane goes on.']]],
  'Waterproofing cure and flood test': [[LEAD, 1, ['Plug the drain, fill the pan, mark the water level and check it after 24 hours.']]],
  'Tile setting and grout': [[TILE, 0.65, ['Lay out the pattern, set the floor and wall tile and grout and caulk.']], [HELP, 0.35, ['Mix thinset and grout, cut tile at the saw and clean the haze.', 'Wash tools outside and remove the slurry.']]],
  'Prime and paint': [[PAINT, 0.7, ['Patch, caulk, prime and paint the ceiling, walls and trim.']], [HELP, 0.3, ['Mask and cover the room, move the ladders and clean up.']]],
  'Fixtures, vanity, toilet, electrical trim-out': [[LEAD, 0.4, ['Set the vanity, the toilet, the accessories and the grab bars.']], [PLUMB, 0.3, ['Connect and test the faucets, the shower trim and the drains.']], [ELEC, 0.3, ['Install the devices, the fan and the lights and test the GFCIs.']]],
  'Glass install (ordered after tile, 7 to 14 day lead time)': [[GLASS, 1, ['Install the channel, set the glass and seal it.']]],
  'Punch list, final clean and walk-through': [[LEAD, 1, ['Touch up, test every fixture and door, remove the protection and clean.', 'Walk the customer through the finished work and get the sign-off.']]]
};

// Split a phase's people and hours between roles; with too few people one person covers the extra duties.
function allocate(roles, crew, hours) {
  const sorted = [...roles].sort((a, b) => b[1] - a[1]);
  const people = Math.max(1, crew || 1), n = Math.min(people, sorted.length);
  const kept = sorted.slice(0, n).map(([role, share, duties]) => ({ role, share, duties: [...duties], people: 1 }));
  for (const [role, share, duties] of sorted.slice(n)) { kept[0].share += share; kept[0].duties.push(...duties.map(x => `(also covers ${role.toLowerCase()} work) ${x}`)); }
  for (let extra = people - n, i = 0; extra > 0; extra--, i++) kept[i % kept.length].people++;
  const total = kept.reduce((s, k) => s + k.share, 0) || 1;
  return kept.map(k => ({ role: k.role, people: k.people, hours: Math.round(hours * k.share / total * 10) / 10, duties: k.duties }));
}

function bathroomAssignments(phase) {
  const roles = BATH[phase.phase];
  if (!roles || !phase.crew) return [];
  return allocate(roles, phase.crew, phase.hours);
}

function handymanAssignment(task, hours, steps) {
  const crew = Math.max(1, task.crew || 1), trade = task.trade;
  const lead = trade === 'p' ? PLUMB : trade === 'e' ? ELEC : crew > 1 ? 'Lead handyman' : 'Handyman', duties = steps.slice(0, 6);
  const out = [{ role: lead, people: 1, hours: Math.round(hours * (crew > 1 ? 0.65 : 1) * 10) / 10, duties }];
  if (crew > 1) out.push({ role: HELP, people: crew - 1, hours: Math.round(hours * 0.35 * 10) / 10, duties: ['Carry materials and debris, hold and lift, and keep the work area clean.', 'Mix, cut and hand tools to the lead.'] });
  return out;
}

// Total hours per role across the whole job, and a day-by-day plan by working day.
function crewPlan(steps) {
  const by = new Map();
  for (const s of steps) for (const a of s.assignments || []) {
    const r = by.get(a.role) || { role: a.role, hours: 0, people: 0, note: ROLE_NOTES[a.role] || '', phases: [] };
    r.hours = Math.round((r.hours + a.hours) * 10) / 10; r.people = Math.max(r.people, a.people); r.phases.push(s.title || s.name);
    by.set(a.role, r);
  }
  return [...by.values()].sort((a, b) => b.hours - a.hours);
}

function dayPlan(phases, steps) {
  const byPhase = new Map(steps.map(s => [s.phase, s]));
  let day = 1;
  const out = [];
  for (const p of phases) {
    const s = byPhase.get(p.phase);
    if (!p.crew) { out.push({ days: 'Waiting', phase: p.phase, title: p.phase, crew: 0, roles: [], note: 'No crew on site. Inspection, curing or lead time.' }); continue; }
    const n = Math.max(1, Math.ceil(p.days)), label = n === 1 ? `Day ${day}` : `Days ${day}-${day + n - 1}`;
    out.push({ days: label, phase: p.phase, title: s?.title || p.phase, crew: p.crew, start: p.start, end: p.end, roles: (s?.assignments || []).map(a => `${a.role}${a.people > 1 ? ` x${a.people}` : ''}`) });
    day += n;
  }
  return out;
}

module.exports = { ROLE_NOTES, BATH, allocate, bathroomAssignments, handymanAssignment, crewPlan, dayPlan };
