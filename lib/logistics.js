'use strict';
const stores = require('./stores');
// Job logistics: the costs that are not the install itself. Getting materials to the work area (stairs, long carries,
// elevators, parking), getting the supplies to the site (own truck, rented truck, supplier delivery), and getting the
// debris out (dumpster, haul-away in our truck, a junk hauler, or the customer), plus who does the final cleanup.
// Both the bathroom takeoff and the handyman plan call build() so every job type prices these the same way.

const SECTION = 'Logistics & disposal';
const OPTIONS = {
  supply: ['own', 'rental', 'supplier', 'customer'],
  debris: ['dumpster', 'haul', 'junk', 'customer', 'none'],
  cleanup: ['us', 'service', 'customer'],
  parking: ['onsite', 'street']
};
const LABELS = {
  supply: { own: 'Our truck', rental: 'Rent a truck or van', supplier: 'Supplier delivers', customer: 'Customer supplies materials' },
  debris: { dumpster: 'We rent a dumpster', haul: 'We haul it away in our truck', junk: 'Junk removal service', customer: 'Customer removes it', none: 'No debris' },
  cleanup: { us: 'We do the final clean', service: 'Hire a cleaning service', customer: 'Customer cleans' },
  parking: { onsite: 'Driveway or lot at the door', street: 'Street parking only' }
};

// [code, category, name, kind, unit, cost $, waste %, tier]  (prices are Chicago-area allowances; admin edits them in the price book)
const PRICE_BOOK = [
  ['lg-carry', SECTION, 'Extra carry time for stairs, long carries or elevator waits (materials in, debris out)', 'labor', 'hr', 65, 0, ''],
  ['lg-trip', SECTION, 'Supply run: drive, pick, load and unload', 'labor', 'hr', 65, 0, ''],
  ['lg-fuel', SECTION, 'Fuel and vehicle wear per supply run', 'other', 'ea', 30, 0, ''],
  ['lg-truck', SECTION, 'Cargo van or box truck rental with mileage and insurance (est.)', 'equipment', 'day', 135, 0, ''],
  ['lg-delivery', SECTION, 'Supplier delivery fee (tile, lumber, drywall, vanity)', 'other', 'ea', 95, 0, ''],
  ['lg-elevator', SECTION, 'Elevator reservation, pads and building move-in fee (condo or high-rise)', 'other', 'ls', 125, 0, ''],
  ['lg-street-permit', SECTION, 'Street parking or dumpster-on-street permit allowance (varies by city)', 'other', 'ea', 75, 0, ''],
  ['lg-dumpster-10', SECTION, 'Dumpster 10 yard, 7-day rental with delivery, pickup and 1 ton included', 'other', 'ea', 425, 0, ''],
  ['lg-dumpster-15', SECTION, 'Dumpster 15 yard, 7-day rental with delivery, pickup and 1.5 tons included', 'other', 'ea', 495, 0, ''],
  ['lg-dumpster-20', SECTION, 'Dumpster 20 yard, 7-day rental with delivery, pickup and 2 tons included', 'other', 'ea', 575, 0, ''],
  ['lg-dumpster-30', SECTION, 'Dumpster 30 yard, 7-day rental with delivery, pickup and 3 tons included', 'other', 'ea', 695, 0, ''],
  ['lg-overage', SECTION, 'Dumpster weight overage (tile, mortar, cast iron are heavy)', 'other', 'ton', 85, 0, ''],
  ['lg-haul-labor', SECTION, 'Haul-away trip in our truck: load, drive to the transfer station, unload', 'labor', 'hr', 65, 0, ''],
  ['lg-haul-fee', SECTION, 'Transfer station or landfill fee per truck load', 'other', 'ea', 75, 0, ''],
  ['lg-junk', SECTION, 'Junk removal service (they load and take it, priced by the cubic yard)', 'other', 'cy', 48, 0, ''],
  ['lg-stage', SECTION, 'Bag, stack and stage debris for the customer to remove', 'labor', 'hr', 65, 0, ''],
  ['lg-drive', SECTION, 'Paid drive time to and from the customer\'s home', 'labor', 'hr', 65, 0, ''],
  ['lg-mileage', SECTION, 'Vehicle mileage to and from the job (fuel, wear and insurance, per mile)', 'other', 'mi', 0.7, 0, ''],
  ['lg-tolls', SECTION, 'Tolls per one-way trip (Illinois Tollway I-PASS, set the amount in the wizard)', 'other', 'ea', 0, 0, ''],
  ['lg-cleaning', SECTION, 'Post-construction cleaning service (dust, floors, glass, fixtures)', 'other', 'ea', 195, 0, '']
];
const PRICES = new Map(PRICE_BOOK.map(r => [r[0], { name: r[2], kind: r[3], unit: r[4], cost_cents: Math.round(r[5] * 100), waste_bp: 0 }]));

const num = (v, def, min, max, label = 'value') => {
  if (v === '' || v == null) return def;
  if (typeof v === 'boolean' || typeof v === 'object') throw new TypeError(`${label} must be numeric.`);
  const n = Number(v);
  if (!Number.isFinite(n) || n < min || n > max) throw new RangeError(`${label} must be between ${min} and ${max}.`);
  return n;
};
const pick = (v, list, def, label = 'value') => {
  if (v === '' || v == null) return def;
  if (!list.includes(v)) throw new RangeError(`${label} is not a supported value.`);
  return v;
};
const r2 = n => Math.round(n * 100) / 100;
const given = (raw, k) => raw[k] !== undefined && raw[k] !== null && raw[k] !== '';

// Turn the wizard answers into logistics settings. d holds the job's own defaults (floor level, debris mode).
function resolve(raw = {}, d = {}) {
  const defaultFlights = Number.isFinite(d.flights) ? d.flights : 0;
  const boolean = (value, def, label) => {
    if (value === undefined || value === null || value === '') return def;
    if ([true, 'true', 1, '1'].includes(value)) return true;
    if ([false, 'false', 0, '0'].includes(value)) return false;
    throw new TypeError(`${label} must be true or false.`);
  };
  const L = {
    flights: Math.round(num(raw.stairFlights, defaultFlights, 0, 10, 'stairFlights')),
    carryFt: Math.round(num(raw.carryFt, 50, 0, 1000, 'carryFt')),
    elevator: boolean(raw.elevator, false, 'elevator'),
    parking: pick(raw.parking, OPTIONS.parking, 'onsite', 'parking'),
    supply: pick(raw.supplyMode, OPTIONS.supply, 'own', 'supplyMode'),
    trips: given(raw, 'supplyTrips') ? Math.round(num(raw.supplyTrips, 0, 0, 40, 'supplyTrips')) : null,
    debris: pick(raw.debrisMode, OPTIONS.debris, d.debris || 'dumpster', 'debrisMode'),
    cleanup: pick(raw.cleanupBy, OPTIONS.cleanup, 'us', 'cleanupBy'),
    flightsGiven: given(raw, 'stairFlights'),
    store: stores.tripFor(raw, Array.isArray(raw._stores) ? raw._stores : [])
  };
  return L;
}

const DUMPSTERS = [[10, 1], [15, 1.5], [20, 2], [30, 3]];

// ctx: { pieces, yards, tons, tripsAuto, deliveriesAuto }. Returns priced line specs, extra crew hours and plain-English rows.
function build(L, ctx) {
  if (!L || !ctx || typeof ctx !== 'object') throw new TypeError('Logistics settings and context are required.');
  for (const [key, max] of [['pieces', 100000], ['yards', 10000], ['tons', 10000], ['tripsAuto', 40], ['deliveriesAuto', 40]]) {
    const value = ctx[key] ?? 0;
    if (!Number.isFinite(value) || value < 0 || value > max) throw new RangeError(`${key} must be between 0 and ${max}.`);
  }
  const lines = [], rows = [], notes = [];
  const hours = { carryIn: 0, carryOut: 0, trips: 0, disposal: 0 };
  const add = (code, qty, extra = {}) => { if (qty > 0) lines.push({ code, qty: r2(qty), ...extra }); };
  const yards = ctx.yards;
  const debrisMode = yards > 0 ? L.debris : 'none';

  // Access: minutes beyond a flat first-floor carry, per piece moved in or out.
  const climb = L.elevator ? L.flights * 0.35 : L.flights;
  const perMove = 1.5 * climb + 0.4 * Math.max(0, L.carryFt - 50) / 50 + (L.parking === 'street' ? 0.6 : 0);
  const debrisPieces = debrisMode === 'dumpster' || debrisMode === 'haul' ? yards * 10 : debrisMode === 'junk' ? yards * 4 : debrisMode === 'customer' ? yards * 10 : 0;
  hours.carryIn = r2(ctx.pieces * perMove / 60);
  hours.carryOut = r2(debrisPieces * perMove / 60);
  const access = [];
  if (L.flights > 0) access.push(`${L.flights} flight${L.flights === 1 ? '' : 's'} of stairs${L.elevator ? ' with an elevator' : ''}`);
  if (L.carryFt > 50) access.push(`${L.carryFt} ft carry from the truck`);
  if (L.parking === 'street') access.push('street parking only');
  if (L.elevator) add('lg-elevator', 1);
  if (hours.carryIn + hours.carryOut > 0) {
    add('lg-carry', hours.carryIn + hours.carryOut, { labor: true });
    notes.push(`Access: ${access.join(', ')}. About ${r2(hours.carryIn + hours.carryOut)} extra labor hours are added to carry ${Math.round(ctx.pieces)} loads of materials in and ${Math.round(debrisPieces)} loads of debris out.`);
  }
  rows.push({ label: 'Access to the work area', text: access.length ? `${access.join(', ')}. Extra carry time: ${r2(hours.carryIn + hours.carryOut)} hours.` : 'Ground-level access close to the truck; no extra carry time.' });

  // Getting supplies to the site.
  const trips = L.trips ?? ctx.tripsAuto ?? 2;
  if (L.supply === 'own' || L.supply === 'rental') {
    const st = L.store;
    hours.trips = r2(trips * (st ? st.perTripHours : 1.25));
    add('lg-trip', hours.trips, { labor: true });
    if (st) add('lg-mileage', trips * st.roundTripMiles); else add('lg-fuel', trips);
    if (st) notes.push(`Supply runs: about ${trips} trip${trips === 1 ? '' : 's'} to ${st.store ? st.store.name : 'the supply store'} (${st.oneWayMiles} miles, ${st.oneWayMinutes} minutes each way${st.source === 'estimated' ? ', estimated' : ''}). Each trip is about ${st.perTripMinutes} minutes: ${st.roundTripMinutes} driving, ${st.inStoreMinutes} in the store, ${st.loadMinutes + st.unloadMinutes} loading and unloading.`);
    if (L.supply === 'rental') { const days = Math.max(1, Math.ceil(trips / 6)); add('lg-truck', days); notes.push(`Supplies: a truck or van is rented for ${days} day${days === 1 ? '' : 's'} to haul ${trips} supply run${trips === 1 ? '' : 's'}.`); }
  } else if (L.supply === 'supplier') {
    const drops = Math.max(1, Math.ceil(trips / 3));
    hours.trips = r2(trips * (L.store ? Math.min(0.75, 0.25 + L.store.inStoreMinutes / 120) : 0.4));
    add('lg-delivery', drops); add('lg-trip', hours.trips, { labor: true });
    if (L.flights > 0 && !L.elevator) notes.push('Supplier drivers usually unload at the curb or door only. Carrying the heavy items upstairs is counted in the access time.');
  }
  rows.push({ label: 'Getting supplies to the site', text: `${LABELS.supply[L.supply]}${L.supply === 'customer' ? '. The customer delivers the materials to the work area, and the estimate has no supply runs.' : `, about ${trips} supply run${trips === 1 ? '' : 's'}${L.supply === 'supplier' ? ` (${Math.max(1, Math.ceil(trips / 3))} deliver${Math.ceil(trips / 3) === 1 ? 'y' : 'ies'})` : ''}.`}` });

  // Getting the debris out.
  let disposal = 'No demolition debris is expected beyond packaging and scrap.';
  if (debrisMode === 'dumpster') {
    const need = yards * 1.15, size = DUMPSTERS.find(([y]) => y >= need) || DUMPSTERS[DUMPSTERS.length - 1], count = need > 30 ? Math.ceil(need / 30) : 1;
    add(`lg-dumpster-${size[0]}`, count);
    const over = Math.max(0, (ctx.tons || 0) - size[1] * count);
    if (over > 0.05) { add('lg-overage', Math.ceil(over * 2) / 2); notes.push(`Debris is heavy (about ${r2(ctx.tons)} tons), so a weight overage allowance is added.`); }
    if (L.parking === 'street') add('lg-street-permit', 1);
    disposal = `We rent ${count} ${size[0]}-yard dumpster${count === 1 ? '' : 's'} for about ${r2(yards)} cubic yards of debris${L.parking === 'street' ? ' (placed on the street; a city permit is included)' : ''}. We load it and the hauler removes it.`;
  } else if (debrisMode === 'haul') {
    const loads = Math.max(1, Math.ceil(yards / 3));
    hours.disposal = r2(loads * 2);
    add('lg-haul-labor', hours.disposal, { labor: true }); add('lg-haul-fee', loads); add('lg-fuel', loads);
    disposal = `We haul about ${r2(yards)} cubic yards to the transfer station in ${loads} truck load${loads === 1 ? '' : 's'}.`;
  } else if (debrisMode === 'junk') {
    add('lg-junk', Math.max(3, yards * 1.15));
    disposal = `A junk removal service loads and takes about ${r2(yards)} cubic yards; we stage it for them.`;
  } else if (debrisMode === 'customer') {
    hours.disposal = r2(Math.max(1, yards * 0.25));
    add('lg-stage', hours.disposal, { labor: true });
    disposal = `The customer removes the debris (about ${r2(yards)} cubic yards). We bag and stack it at an agreed spot each day and the customer must clear it, or we can arrange a pickup at cost.`;
    notes.push('Customer removes the debris: confirm in writing where it is staged and the date it will be gone. Heavy items (tub, tile) need a truck and a second person.');
  }
  rows.push({ label: 'Debris and garbage', text: disposal });

  // Who cleans up.
  if (L.cleanup === 'service') add('lg-cleaning', 1);
  const cleanText = {
    us: 'We clean the work area daily and do the final clean, including dust in the adjoining rooms, fixtures and glass.',
    service: 'We clean daily and leave the room broom-clean; a post-construction cleaning service does the final clean.',
    customer: 'We clean daily and leave the room broom-clean with the debris out. The customer does the final dust-down, floors and glass.'
  };
  rows.push({ label: 'Cleanup', text: cleanText[L.cleanup] });
  rows.push({ label: 'Who does what', text: `Disposal: ${LABELS.debris[debrisMode === 'none' ? 'none' : L.debris]}. Cleanup: ${LABELS.cleanup[L.cleanup]}. Supplies: ${LABELS.supply[L.supply]}.` });
  return { lines, hours, notes, rows, supplyTrip: L.store, mode: debrisMode, yards: r2(yards), tons: r2(ctx.tons || 0), trips, access, moves: { in: Math.round(ctx.pieces), out: Math.round(debrisPieces) } };
}

// Driving to the customer's home: paid drive time, mileage and tolls for every working day, plus the pre-job site visit.
// The crew rides together (about 3 people per vehicle). Returns line specs; tolls carry the entered amount as their price.
function travel(raw = {}, { days = 1, peakCrew = 1 } = {}) {
  if (!Number.isFinite(days) || days < 0 || days > 10000 || !Number.isInteger(peakCrew) || peakCrew < 0 || peakCrew > 100) throw new RangeError('Travel days and peak crew must be finite, non-negative and in range.');
  const miles = num(raw.driveMiles, 15, 0, 300, 'driveMiles'), minutes = given(raw, 'driveMinutes') ? num(raw.driveMinutes, 0, 0, 360, 'driveMinutes') : Math.round(miles * 2);
  const toll = Math.round(num(raw.tollsOneWay, 0, 0, 100, 'tollsOneWay') * 100) / 100, visits = Math.round(num(raw.siteVisits, 1, 0, 6, 'siteVisits'));
  const vehicles = given(raw, 'vehicles') ? Math.round(num(raw.vehicles, 1, 1, 8, 'vehicles')) : Math.max(1, Math.ceil(peakCrew / 3));
  const paidRaw = raw.travelPaid;
  if (paidRaw !== undefined && ![true, false, 'true', 'false', 1, 0, '1', '0'].includes(paidRaw)) throw new TypeError('travelPaid must be true or false.');
  const paid = ![false, 'false', 0, '0'].includes(paidRaw);
  const roundHours = r2(minutes * 2 / 60), roundMiles = miles * 2, lines = [], rows = [];
  const workDays = Math.max(1, Math.ceil(days));
  const driveHours = paid ? r2(workDays * peakCrew * roundHours + visits * (roundHours + 1)) : r2(visits * (roundHours + 1));
  const totalMiles = r2(workDays * vehicles * roundMiles + visits * roundMiles), tollTrips = workDays * vehicles * 2 + visits * 2;
  if (driveHours > 0) lines.push({ code: 'lg-drive', qty: driveHours, labor: true });
  if (totalMiles > 0) lines.push({ code: 'lg-mileage', qty: totalMiles });
  if (toll > 0) lines.push({ code: 'lg-tolls', qty: tollTrips, cost_cents: Math.round(toll * 100) });
  rows.push({ label: 'Driving to the job', text: `About ${miles} miles and ${minutes} minutes each way. ${workDays} working day${workDays === 1 ? '' : 's'} with ${vehicles} vehicle${vehicles === 1 ? '' : 's'} (${peakCrew} ${peakCrew === 1 ? 'person' : 'people'} at peak), ${visits} pre-job site visit${visits === 1 ? '' : 's'}: ${driveHours} paid drive hours and ${totalMiles} miles.${toll > 0 ? ` Tolls of $${toll.toFixed(2)} each way (${tollTrips} trips); use the company I-PASS.` : ' No tolls entered; add the amount if the route uses the Tollway.'}${paid ? '' : ' Drive time to the job is not paid except for the site visit.'}` });
  return { lines, rows, hours: driveHours, miles: totalMiles, tollTrips, toll, oneWayMiles: miles, oneWayMinutes: minutes, vehicles, visits, days: workDays };
}

// Handyman debris by task: cubic yards per unit removed or replaced.
const DEBRIS_YD = {
  'fl-remove': 0.012, 'fl-carpet': 0.008, 'fl-tile': 0.01, 'fl-lvp': 0.004, 'fl-laminate': 0.004, 'gn-demo': 2, 'gn-haul': 3, 'dw-water-patch': 0.005, 'dw-popcorn': 0.003, 'dw-wallpaper-remove': 0.002, 'dw-hang-finish': 0.003, 'dw-ceiling': 0.003,
  'dk-repair': 0.01, 'dk-new': 0.01, 'ex-shingle': 0.3, 'ex-gutter-replace': 0.01, 'ex-siding': 0.3, 'dr-int-prehung': 0.15, 'dr-ext-prehung': 0.25, 'dr-slab': 0.1, 'wn-replace': 0.15, 'pl-water-heater': 0.4, 'pl-toilet': 0.25, 'pl-sink': 0.15,
  'kt-cabinets': 0.12, 'kt-counter': 0.05, 'fn-repair': 0.2, 'fn-new': 0.02, 'cn-patch': 0.1, 'tr-subfloor': 0.003, 'fl-hardwood-repair': 0.1, 'pl-softener': 0.2, 'dr-garage-opener': 0.1, 'kt-dishwasher': 0.3, 'pl-disposal': 0.05, 'kt-range-hood': 0.1
};
const CARRY_PER_UNIT = { sf: 1 / 12, lf: 1 / 8, ea: 2, hr: 0.5 };

module.exports = { travel, SECTION, OPTIONS, LABELS, PRICE_BOOK, PRICES, resolve, build, DEBRIS_YD, CARRY_PER_UNIT };
