'use strict';
// Supply-run timing: finds the Home Depot closest to the job and works out how long a trip for materials takes.
// OFFLINE STARTER DATA: store and town locations below are approximate (town level, not street addresses) and were not checked
// against Home Depot's live store locator. Admin can add exact stores in Defaults > Supply stores, or type the one-way miles and
// minutes into the wizard to override. A live lookup (store locator plus a maps distance API) is listed in ONLINE-VERIFICATION-TODO.md.

// Approximate town centers [lat, lon] for the service area.
const TOWNS = {
  'chicago': [41.88, -87.63], 'aurora': [41.76, -88.32], 'naperville': [41.75, -88.15], 'joliet': [41.52, -88.08], 'elgin': [42.04, -88.28], 'rockford': [42.27, -89.09], 'springfield': [39.78, -89.65], 'peoria': [40.69, -89.59],
  'evanston': [42.05, -87.69], 'schaumburg': [42.03, -88.08], 'oak park': [41.89, -87.78], 'cicero': [41.85, -87.75], 'st charles': [41.91, -88.31], 'geneva': [41.89, -88.31], 'batavia': [41.85, -88.31], 'north aurora': [41.81, -88.33],
  'montgomery': [41.73, -88.35], 'sugar grove': [41.77, -88.44], 'yorkville': [41.64, -88.45], 'oswego': [41.68, -88.35], 'plano': [41.66, -88.53], 'sandwich': [41.64, -88.62], 'minooka': [41.45, -88.27], 'dekalb': [41.93, -88.75],
  'sycamore': [41.99, -88.69], 'genoa': [42.1, -88.69], 'cortland': [41.92, -88.71], 'kirkland': [42.09, -88.85], 'wheaton': [41.87, -88.11], 'glen ellyn': [41.88, -88.07], 'lombard': [41.88, -88.01], 'downers grove': [41.81, -88.01],
  'elmhurst': [41.9, -87.94], 'carol stream': [41.91, -88.13], 'villa park': [41.89, -87.97], 'woodridge': [41.75, -88.05], 'lisle': [41.8, -88.07], 'warrenville': [41.82, -88.18], 'west chicago': [41.88, -88.2], 'wood dale': [41.96, -87.98],
  'addison': [41.93, -88.0], 'bloomingdale': [41.96, -88.08], 'hinsdale': [41.8, -87.94], 'westmont': [41.8, -87.98], 'darien': [41.75, -87.98], 'glendale heights': [41.92, -88.07], 'oak brook': [41.84, -87.93], 'itasca': [41.97, -88.01],
  'bensenville': [41.95, -87.94], 'roselle': [41.98, -88.08], 'winfield': [41.87, -88.16], 'clarendon hills': [41.8, -87.96], 'willowbrook': [41.77, -87.94], 'burr ridge': [41.75, -87.92], 'bolingbrook': [41.7, -88.07],
  'plainfield': [41.61, -88.2], 'romeoville': [41.65, -88.09], 'shorewood': [41.52, -88.2], 'new lenox': [41.51, -87.97], 'lockport': [41.59, -88.06], 'frankfort': [41.5, -87.85], 'mokena': [41.53, -87.89], 'crest hill': [41.56, -88.1],
  'channahon': [41.43, -88.22], 'carpentersville': [42.12, -88.26], 'south elgin': [41.99, -88.29], 'bartlett': [41.99, -88.19], 'west dundee': [42.1, -88.28], 'east dundee': [42.1, -88.27], 'algonquin': [42.17, -88.29], 'hampshire': [42.1, -88.53],
  'arlington heights': [42.08, -87.98], 'des plaines': [42.03, -87.88], 'skokie': [42.03, -87.73], 'palatine': [42.11, -88.03], 'hoffman estates': [42.04, -88.08], 'elk grove village': [42.0, -87.97], 'orland park': [41.63, -87.85],
  'tinley park': [41.57, -87.78], 'berwyn': [41.85, -87.79], 'oak lawn': [41.71, -87.75], 'park ridge': [42.01, -87.84], 'mount prospect': [42.06, -87.94], 'wilmette': [42.07, -87.72], 'oak forest': [41.6, -87.75], 'streamwood': [42.03, -88.18],
  'barrington': [42.15, -88.14], 'lansing': [41.56, -87.54], 'hickory hills': [41.72, -87.83], 'waukegan': [42.36, -87.84], 'libertyville': [42.28, -87.95], 'mundelein': [42.26, -88.0], 'gurnee': [42.37, -87.9], 'lake zurich': [42.2, -88.09],
  'mchenry': [42.33, -88.27], 'crystal lake': [42.24, -88.32], 'woodstock': [42.31, -88.45], 'huntley': [42.17, -88.43], 'loves park': [42.32, -89.04], 'machesney park': [42.35, -89.03]
};

// Home Depot locations, one row per town known or believed to have one. Approximate and UNVERIFIED.
const STORES = [
  ['Chicago (north)', 'Chicago', 41.92, -87.7], ['Chicago (south)', 'Chicago', 41.8, -87.64], ['Aurora', 'Aurora', 41.77, -88.25], ['Naperville', 'Naperville', 41.78, -88.15], ['Bolingbrook', 'Bolingbrook', 41.7, -88.07],
  ['Joliet', 'Joliet', 41.5, -88.14], ['Elgin', 'Elgin', 42.04, -88.3], ['St. Charles', 'St Charles', 41.92, -88.32], ['Algonquin', 'Algonquin', 42.17, -88.31], ['Crystal Lake', 'Crystal Lake', 42.25, -88.33],
  ['Schaumburg', 'Schaumburg', 42.04, -88.06], ['Hoffman Estates', 'Hoffman Estates', 42.07, -88.1], ['Lombard', 'Lombard', 41.87, -88.0], ['Downers Grove', 'Downers Grove', 41.8, -88.01], ['Villa Park', 'Villa Park', 41.9, -87.97],
  ['Oak Lawn', 'Oak Lawn', 41.7, -87.75], ['Orland Park', 'Orland Park', 41.62, -87.85], ['DeKalb', 'DeKalb', 41.94, -88.76], ['Plainfield', 'Plainfield', 41.62, -88.2], ['Romeoville', 'Romeoville', 41.65, -88.1],
  ['Yorkville', 'Yorkville', 41.64, -88.43], ['McHenry', 'McHenry', 42.34, -88.28], ['Waukegan', 'Waukegan', 42.38, -87.87], ['Skokie', 'Skokie', 42.04, -87.74], ['Rockford', 'Rockford', 42.27, -89.04],
  ['Springfield', 'Springfield', 39.78, -89.69], ['Peoria', 'Peoria', 40.74, -89.6], ['Tinley Park', 'Tinley Park', 41.57, -87.8], ['Elmhurst', 'Elmhurst', 41.9, -87.95]
].map(([name, city, lat, lon]) => ({ id: `hd-${name.toLowerCase().replace(/[^a-z]+/g, '-')}`, chain: 'The Home Depot', name: `The Home Depot ${name}`, city, lat, lon, verified: false, builtIn: true }));

const key = c => String(c || '').toLowerCase().replace(/[^a-z ]/g, '').replace(/\b(city|village|town) of\b/g, '').replace(/\bsaint\b/g, 'st').replace(/\s+/g, ' ').trim();
const coordsOf = city => TOWNS[key(city)] || null;

const toRad = d => d * Math.PI / 180;
const haversine = ([a, b], [c, d]) => { const R = 3958.8, dLat = toRad(c - a), dLon = toRad(d - b), x = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a)) * Math.cos(toRad(c)) * Math.sin(dLon / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(x)); };

// Road distance is about 1.3 times the straight line. Suburban average speed with lights and traffic is about 28 mph; Chicago is slower.
const ROAD_FACTOR = 1.3, MPH = 28, CITY_MPH = 20;
const MODES = { pickup: { label: 'Order ahead and pick up at the Pro desk', inStore: 25 }, walkin: { label: 'Walk the aisles and load a cart', inStore: 50 } };
const LOAD_MIN = 15, UNLOAD_MIN = 10;
const r1 = n => Math.round(n * 10) / 10;

// raw: wizard answers (city, storeId, storeMiles, storeMinutes, storeMode, storeInStoreMinutes). extra: custom stores from the database.
function tripFor(raw = {}, extra = []) {
  const mode = MODES[raw.storeMode] ? raw.storeMode : 'walkin';
  const num = (v, lo, hi) => { if (v === '' || v == null) return null; const n = Number(v); return Number.isFinite(n) && n >= lo && n <= hi ? n : null; };
  const inStore = num(raw.storeInStoreMinutes, 0, 240) ?? MODES[mode].inStore;
  const stores = [...extra.filter(s => s && Number.isFinite(s.lat) && Number.isFinite(s.lon)).map(s => ({ ...s, builtIn: false })), ...STORES.filter(s => !extra.some(x => x && x.name === s.name))];
  const typedMiles = num(raw.storeMiles, 0, 300), typedMinutes = num(raw.storeMinutes, 0, 360);
  const job = coordsOf(raw.city);
  let store = null, miles = null, minutes = null, source = 'estimated';
  const chosen = raw.storeId ? stores.find(s => s.id === raw.storeId || s.name === raw.storeId) : null;
  if (job) {
    const ranked = stores.map(s => ({ s, mi: Math.max(1.5, haversine(job, [s.lat, s.lon]) * ROAD_FACTOR) })).sort((a, b) => a.mi - b.mi);
    const pickRow = chosen ? ranked.find(x => x.s === chosen) : ranked[0];
    if (pickRow) { store = pickRow.s; miles = pickRow.mi; }
    var alternatives = ranked.filter(x => x.s !== store).slice(0, 2).map(x => ({ name: x.s.name, city: x.s.city, oneWayMiles: r1(x.mi) }));
  }
  if (typedMiles !== null) { miles = typedMiles; source = 'entered'; }
  if (miles === null && typedMinutes === null) return null;
  if (miles === null) miles = typedMinutes * MPH / 60;
  const speed = key(raw.city) === 'chicago' ? CITY_MPH : MPH;
  if (typedMinutes !== null) { minutes = typedMinutes; source = 'entered'; } else minutes = Math.max(4, miles / speed * 60);
  const roundMinutes = Math.round(minutes * 2), perTripMinutes = Math.round(roundMinutes + inStore + LOAD_MIN + UNLOAD_MIN);
  return {
    store: store ? { name: store.name, city: store.city, verified: !!store.verified } : null, oneWayMiles: r1(miles), oneWayMinutes: Math.round(minutes), roundTripMiles: r1(miles * 2), roundTripMinutes: roundMinutes,
    inStoreMinutes: inStore, loadMinutes: LOAD_MIN, unloadMinutes: UNLOAD_MIN, perTripMinutes, perTripHours: Math.round(perTripMinutes / 6) / 10, mode, modeLabel: MODES[mode].label, source, alternatives: alternatives || []
  };
}

module.exports = { TOWNS, STORES, MODES, coordsOf, haversine, tripFor, key };
