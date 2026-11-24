'use strict';
// New-hire training content. Quiz rows: [question, correct answer, wrong, wrong, wrong]. The correct answer is always
// listed first here and shuffled per employee before it is sent, so answers never leave the server.
// Starter material only: a lead tradesperson and the owner should review it before relying on it.

const PASS_PERCENT = 80, FINAL_MAX_ATTEMPTS = 3, DAY_GAP_HOURS = 18;

const MODULES = [
  {
    key: 'clock-gps', day: 1, title: 'Clocking in, GPS and lunch', minutes: 20,
    lessons: [
      ['Why we track location', 'While you are clocked in, the app records your phone\u2019s precise GPS location and shares it with management. This is how we verify that you are at the job, pay you accurately and keep you safe. Tracking stops the moment you clock out.'],
      ['How to clock in', 'Open the employee portal on the phone you will carry all day. Turn on location services and allow precise location for the site. Choose your job, accept the location notice and tap Clock in. You must be within the job\u2019s radius of the address. If location is off or too imprecise, you cannot clock in.'],
      ['Keep location on', 'Location must stay on for the whole shift. If it goes off, the system alerts the office and clocks you out automatically. Leaving the job site without telling the office is recorded as time off site and is not paid. Do not share your phone or your login with anyone: every device is registered to one person.'],
      ['Lunch breaks', 'Use the Lunch button to start and end your break; do not just stay clocked in. Lunch has a maximum length shown in the app. Lunch time is unpaid unless the office tells you otherwise. Remember to end lunch when you are back on site.'],
      ['Clocking out', 'Clock out when you leave for the day, then check your hours in the Hours tab. If you forgot something or a time is wrong, send a request from the Requests tab the same day rather than waiting for payday.']
    ],
    quiz: [
      ['What happens if your phone\u2019s location is turned off while you are clocked in?', 'The office is alerted and you are clocked out automatically', 'Nothing, the shift continues', 'The app pauses the clock until you turn it back on', 'You are paid a full day anyway'],
      ['When can you clock in to a job?', 'When location is on and you are within the job site radius', 'Any time from home, then drive to the job', 'Only after the customer approves', 'Only after lunch'],
      ['Who may use your login and your registered phone?', 'Only you', 'A coworker if they are running late', 'Your family', 'Anyone on the crew'],
      ['How do you take lunch?', 'Tap the Lunch button to start it and again to end it', 'Stay clocked in and eat on site', 'Clock out and clock in a new shift without telling anyone', 'Turn location off'],
      ['A time entry is wrong. What should you do?', 'Send a request in the portal the same day', 'Wait to see if payroll catches it', 'Ask a coworker to fix it', 'Ignore it']
    ]
  },
  {
    key: 'jobs-tools', day: 1, title: 'Jobs, updates, photos and tools', minutes: 25,
    lessons: [
      ['Finding your jobs', 'The Jobs tab shows jobs assigned to you, with the address, customer contact, scheduled time and the job brief. Open jobs not assigned to you can be marked as \u201cinterested\u201d; the office decides assignments based on your experience, availability and location.'],
      ['The job brief and tools checklist', 'Before you leave, read the brief and review the Tools checklist for the job. Tool photos show what each item looks like. Pack everything on the list; a missing tool costs the customer\u2019s time and ours. If something is missing, tell the office before you arrive.'],
      ['Updates and photos', 'Post an update when you start, when something changes, and when you finish. Take clear before, during and after photos of every job. Photos protect you and the company if there is ever a dispute, and they are what customers see on their project page.'],
      ['Customer sign-off and liability', 'Some jobs need the customer to sign off or a liability form. Never ask a customer to sign anything that is not in the app, and never promise extra work or price changes yourself. Send changes to the office so they can quote them in writing.'],
      ['Requests and documents', 'Use the Requests tab for time-off, hour corrections, supplies or questions. Your signed contracts, pay information and documents live in the Contracts and Documents tabs.']
    ],
    quiz: [
      ['What should you do before leaving for a job?', 'Read the job brief and pack everything on the tools checklist', 'Just show up and figure it out', 'Wait for the customer to call you', 'Clock in first'],
      ['A customer asks for extra work not in the quote. What do you do?', 'Tell them the office will quote it in writing, and message the office', 'Agree to a price on the spot', 'Do it for free quietly', 'Tell them to call someone else'],
      ['Why do we take before, during and after photos?', 'They protect you and the company and show the customer progress', 'Only for social media', 'They are optional', 'Only needed if something goes wrong'],
      ['Where do you ask for an hour correction?', 'In the Requests tab the same day', 'In a text to a coworker', 'On the customer\u2019s job page', 'You cannot'],
      ['How are open jobs assigned to you?', 'You may mark interest; the office decides the assignment', 'You pick any job and show up', 'First to arrive gets it', 'The customer chooses the worker']
    ]
  },
  {
    key: 'conduct', day: 2, title: 'What we expect from you', minutes: 25,
    lessons: [
      ['Show up ready', 'Be at the job on time, in clean work clothes and closed-toe boots, with your tools and a charged phone. If you will be late or cannot make it, tell the office as early as possible, never after the fact.'],
      ['Inside a customer\u2019s home', 'You are a guest in someone\u2019s home. Greet the customer, introduce yourself, and protect floors, furniture and pets\u2019 access. No smoking, vaping, alcohol or drugs on or before a job. Keep language and music appropriate. Do not use the customer\u2019s bathroom, kitchen or Wi-Fi unless they offer.'],
      ['Communication', 'Tell the customer what you are doing today and when you will be done. Report problems (hidden damage, rot, mold, wrong materials) to the office immediately with photos before continuing. Never argue with a customer: step away and call the office.'],
      ['Honesty and integrity', 'Report your time accurately. Do not take materials, tools or anything from a customer\u2019s home. Do not take side jobs from our customers. Falsifying time or location is grounds for immediate termination.'],
      ['Respect and safety on the crew', 'We do not tolerate harassment, discrimination or bullying. Report concerns to the office. You will never be punished for reporting a safety or conduct problem in good faith.']
    ],
    quiz: [
      ['You will be late. What do you do?', 'Tell the office as early as possible', 'Say nothing and arrive when you can', 'Tell the customer only after you arrive', 'Skip clocking in'],
      ['You discover rot behind the shower wall. What now?', 'Stop, take photos and report to the office before continuing', 'Cover it up and keep going', 'Fix it without telling anyone', 'Tell the customer a price'],
      ['Which is allowed in a customer\u2019s home?', 'Using only what the customer offers and keeping the work area clean', 'Smoking on the porch', 'Using their bathroom freely', 'Taking leftover materials home'],
      ['What is the consequence of falsifying time or location?', 'It can lead to immediate termination', 'A small warning', 'Nothing if the work was done', 'A bonus is delayed'],
      ['A customer is angry with you. What do you do?', 'Stay calm, step away and call the office', 'Argue your side', 'Leave without telling anyone', 'Offer a discount']
    ]
  },
  {
    key: 'quality', day: 2, title: 'How we do the job', minutes: 30,
    lessons: [
      ['Prepare and protect', 'Before work: walk the job with the brief, confirm the scope, protect floors and nearby surfaces with drop cloths or ram board, seal doorways against dust, and set up your work area so tools and materials are organized and out of the customer\u2019s way.'],
      ['Measure twice, work in the right order', 'Verify measurements and materials on site. Follow the sequence in the brief: demolition, rough-in, inspection when required, waterproofing, substrate, finish, fixtures. Skipping a step usually means redoing it.'],
      ['Quality standards', 'Lines are straight and level, tile layout is balanced with no tiny slivers at edges, grout lines are consistent, caulk is neat, and everything is clean. If it is not something you would be proud to show, redo it. Check your work against the specs before calling it finished.'],
      ['Cleanup and walkthrough', 'Clean as you go and leave the space better than you found it: vacuum, wipe, remove debris and your tools. Walk the customer through the finished work, point out care instructions, and send final photos and notes to the office.'],
      ['Mistakes and rework', 'Everyone makes mistakes. Report them immediately so we can fix them while the customer is still happy. Hiding a mistake is much worse than the mistake itself.']
    ],
    quiz: [
      ['What do you do before starting demolition?', 'Protect floors, seal doorways against dust and confirm the scope', 'Start swinging', 'Ask the customer to cover things', 'Skip prep to save time'],
      ['Why follow the job sequence?', 'Skipping a step usually means redoing work', 'It does not matter', 'Customers prefer a different order', 'It is only for new hires'],
      ['You made a mistake. What do you do?', 'Report it right away so it can be fixed', 'Hide it and hope no one notices', 'Wait until the customer complains', 'Blame the materials'],
      ['What happens at the end of a job?', 'Clean up, walk the customer through the work and send final photos', 'Leave quickly', 'Collect payment yourself', 'Take the leftover materials'],
      ['Tile layout best practice is:', 'Balanced layout without tiny slivers at the edges', 'Start at any wall and see what happens', 'Use whatever is left over at the edge', 'Layout does not matter']
    ]
  },
  {
    key: 'safety', day: 3, title: 'Job site safety', minutes: 30,
    lessons: [
      ['Personal protective equipment', 'Wear safety glasses for cutting, grinding, demolition and overhead work; gloves for handling materials; hearing protection near saws and grinders; and a properly fitted respirator (N95 or better, or a P100 where required) when there is dust from tile, cement board, grout or drywall. Silica dust from cutting tile and cement products is a serious lung hazard: cut wet or with dust collection.'],
      ['Ladders and lifting', 'Inspect ladders before use, keep three points of contact, never stand on the top two rungs, and keep the ladder on a firm, level surface. Lift with your legs, not your back. Get help for heavy items like tubs, vanities, cement board and large tile bundles.'],
      ['Water, power and gas', 'Before any plumbing work, locate and shut off the water. Before opening walls near electrical, shut off and test the circuit; never assume a breaker label is right. Never work on live electrical unless you are licensed and it is required. If you smell gas, leave immediately and call 911.'],
      ['Older homes, lead and asbestos', 'Homes built before 1978 may have lead paint; homes built before roughly 1990 may have asbestos in flooring, tile adhesive, texture and pipe wrap. Do not sand, cut or demolish suspect materials. Stop work and tell the office; testing and certified procedures are required.'],
      ['Injuries and emergencies', 'Report every injury, however small, to the office the same day. In an emergency call 911 first. Know where the first aid kit and fire extinguisher are on every site, and keep walkways clear to prevent trips.']
    ],
    quiz: [
      ['What protects you from silica dust when cutting tile?', 'Cut wet or use dust collection and wear a respirator', 'Nothing is needed', 'Just open a window', 'A paper mask is always enough'],
      ['You smell gas. What do you do?', 'Leave immediately and call 911', 'Look for the leak', 'Turn on a fan', 'Light a match to check'],
      ['Before replacing a fixture or opening a plumbing wall you should:', 'Shut off the water', 'Hope the valve is closed', 'Work quickly', 'Ask the customer to hold the pipe'],
      ['A 1960s home has old textured ceiling and vinyl flooring. What do you do before demolishing it?', 'Stop and tell the office; testing may be required', 'Scrape it dry', 'Sand it', 'Demolish quickly before anyone sees'],
      ['You got a small cut on the job. What do you do?', 'Report it to the office the same day', 'Say nothing', 'Only report if you see a doctor', 'Wait for the week to end']
    ]
  },
  {
    key: 'bathroom-basics', day: 3, title: 'Bathroom remodel basics', minutes: 35,
    lessons: [
      ['The typical order of work', 'Protect and set up, demolish fixtures and surfaces, inspect for damage, repair framing and subfloor, rough plumbing and electrical, inspection if required, cement board or backer, waterproofing, tile, grout, fixtures, trim and paint, final clean and walkthrough.'],
      ['Waterproofing', 'Showers and tub surrounds must be waterproof behind the tile. Use the membrane system in the brief (liquid, sheet or foam board), seal seams, corners and penetrations, follow the manufacturer\u2019s cure time, and flood test the shower pan when required before tiling. Water damage from a shortcut can cost thousands.'],
      ['Tile basics', 'Flatten and prepare the surface, snap layout lines, use the right trowel notch and mortar for the tile, back-butter large tile, check lippage, keep joints consistent, and wait for the mortar to cure before grouting. Use movement joints at changes of plane and caulk (not grout) where tile meets tub, corners and fixtures.'],
      ['Fixtures and finish', 'Set the toilet on a new wax ring and tighten evenly, level the vanity and seal the top, check every supply line for leaks and run water for several minutes before leaving. Test the exhaust fan and GFCI outlets. Verify nothing drips under the sink.'],
      ['Permits and code', 'Some work needs a permit and inspection (moving plumbing or electrical, structural changes). The office handles permits: never cover inspected work until the inspector has signed off.']
    ],
    quiz: [
      ['Where does waterproofing go in a shower?', 'Behind the tile and sealed at seams, corners and penetrations', 'Only in the grout', 'On top of the finished tile', 'Not needed if grout is sealed'],
      ['Which goes where tile meets the tub?', 'Flexible caulk, not grout', 'Grout', 'Mortar', 'Nothing'],
      ['After installing a sink or vanity you should:', 'Run water and check every connection for leaks', 'Leave and check tomorrow', 'Tighten the supply lines by hand only and go', 'Just wipe it down'],
      ['An inspection is required. When can you cover the work?', 'Only after the inspector has signed off', 'Right away', 'When the customer asks', 'After tile is delivered'],
      ['What should you do before grouting?', 'Let the mortar cure for the manufacturer\u2019s time', 'Grout immediately', 'Wet the tile with soapy water', 'Skip it for fast jobs']
    ]
  }
];

// Final exam: scenario questions across every module. 3 attempts, then the office resets it.
const FINAL = [
  ['You are on the way to a job and your phone\u2019s location turns off. What happens?', 'The office is alerted and you are clocked out, so keep location on', 'Nothing, the shift continues', 'You are paid anyway', 'The job is cancelled'],
  ['A coworker asks to borrow your login to clock in for them. You:', 'Refuse and tell the office', 'Agree this once', 'Share it if they are late', 'Give them your phone'],
  ['You find evidence of rot and mold behind the tub. You:', 'Stop, photograph it and notify the office before continuing', 'Cover it with cement board', 'Tell the customer you will fix it free', 'Scrub it and keep going'],
  ['The customer wants a heated floor added today. You:', 'Say the office will provide a written quote', 'Quote a price yourself', 'Do it for cash', 'Say no and leave'],
  ['You are cutting porcelain tile with a dry saw. The correct approach is:', 'Cut wet or with dust collection and wear a respirator and eye protection', 'Hold your breath', 'Cut quickly outside without PPE', 'Wear a cloth mask'],
  ['In a pre-1978 home you reach painted trim that you must sand. You:', 'Stop and tell the office because lead testing and safe procedures are required', 'Sand dry', 'Use a regular broom to clean up', 'Tell the customer it is fine'],
  ['Which sequence is correct for a shower remodel?', 'Demolish, repair, rough-in, waterproof, tile, grout, fixtures, clean', 'Tile, waterproof, demolish, grout', 'Fixtures, tile, demolish, waterproof', 'Grout, tile, waterproof, demolish'],
  ['You ran late on lunch and the shift is still open. You:', 'End lunch in the app when you are back and tell the office if it ran over', 'Stay quiet', 'Edit your hours yourself', 'Clock out and in with another phone'],
  ['The job finished early. Before leaving you:', 'Clean up, walk the customer through the work and send final photos', 'Leave quietly', 'Ask the customer to sign a blank form', 'Take leftover materials'],
  ['You hurt your hand and it seems minor. You:', 'Report it to the office the same day', 'Ignore it', 'Report it next week', 'Tell only a coworker']
];

const TASKS = [
  ['demolition', 'Demolition and haul-off'], ['drywall', 'Drywall hanging, taping and finishing'], ['painting', 'Painting and finishing'],
  ['tile-floor', 'Floor tile'], ['tile-wall', 'Wall and shower tile'], ['waterproofing', 'Shower waterproofing and flood tests'], ['grout-caulk', 'Grout and caulk'],
  ['fixture-swap', 'Faucet, toilet and fixture replacement'], ['rough-plumbing', 'Rough plumbing and drain work'], ['electrical-devices', 'Switches, outlets, lights and fans'],
  ['vanity', 'Vanity and cabinet installation'], ['countertops', 'Countertops and sinks'], ['shower-glass', 'Glass doors and shower hardware'], ['framing', 'Framing and subfloor repair'],
  ['trim', 'Trim, doors and finish carpentry'], ['flooring', 'Vinyl plank and laminate flooring'], ['exhaust-ventilation', 'Ventilation and exhaust fans'], ['customer-walkthrough', 'Talking with customers and walkthroughs'],
  ['estimating', 'Measuring and estimating'], ['handyman', 'General repairs and punch lists']
];
const LEVELS = ['No experience', 'Helped or learning', 'Can do it alone', 'Expert, can teach others'];

function rng(seed) { let s = seed >>> 0 || 1; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
function shuffle(list, rand) { const a = list.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

const bankOf = key => key === 'final' ? FINAL : MODULES.find(m => m.key === key)?.quiz || null;
const seedOf = (employeeId, key, attempt) => { let h = employeeId * 2654435761 + attempt * 97; for (const c of key) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h >>> 0; };

// Options are shuffled deterministically per employee and attempt, so grading can rebuild the same order.
function questions(key, employeeId, attempt = 0) {
  const bank = bankOf(key);
  if (!bank) return null;
  const rand = rng(seedOf(employeeId, key, attempt));
  return bank.map((row, id) => ({ id, row, o: shuffle([0, 1, 2, 3].map(i => ({ i, t: row[1 + i] })), rand) }));
}
const forClient = qs => qs.map(x => ({ id: x.id, q: x.row[0], o: x.o.map(o => o.t) }));

function grade(key, employeeId, attempt, answers) {
  const qs = questions(key, employeeId, attempt);
  if (!qs) return null;
  const a = answers && typeof answers === 'object' ? answers : {};
  let score = 0;
  const missed = [];
  for (const x of qs) {
    const pick = Number.isInteger(a[x.id]) ? x.o[a[x.id]] : null;
    if (pick && pick.i === 0) score++;
    else missed.push({ id: x.id, question: x.row[0], correct: x.row[1] });
  }
  const percent = Math.round(score / qs.length * 100);
  return { score, total: qs.length, percent, passed: percent >= PASS_PERCENT, missed };
}

// With a shorter program the three content days are compressed, e.g. 2 days: modules from days 1, 2, 2.
const effectiveDay = (day, days) => Math.max(1, Math.ceil(day * days / 3));

module.exports = { PASS_PERCENT, FINAL_MAX_ATTEMPTS, DAY_GAP_HOURS, MODULES, FINAL, TASKS, LEVELS, bankOf, questions, forClient, grade, effectiveDay };
