// Themed SVG illustrations (site palette: navy and blue) served for every image slot until a real photo is uploaded.
// Each scene is 1200x800, centered so it still looks right when cropped to other ratios.
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const PALETTES = {
  blue: ['#0a1f44', '#1e40af', '#38bdf8', '#e0f2fe'],
  teal: ['#0b2e3a', '#0e7490', '#5eead4', '#ccfbf1'],
  indigo: ['#1e1b4b', '#4338ca', '#a5b4fc', '#e0e7ff'],
  sky: ['#0c2d57', '#2563eb', '#7dd3fc', '#f0f9ff']
};

const defs = (p, id) => `<defs>
<linearGradient id="bg${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${p[0]}"/><stop offset="1" stop-color="${p[1]}"/></linearGradient>
<linearGradient id="gl${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".95"/><stop offset="1" stop-color="${p[3]}" stop-opacity=".85"/></linearGradient>
<linearGradient id="ac${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${p[2]}"/><stop offset="1" stop-color="#2563eb"/></linearGradient>
<radialGradient id="gw${id}" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="${p[2]}" stop-opacity=".5"/><stop offset="1" stop-color="${p[2]}" stop-opacity="0"/></radialGradient>
<pattern id="tl${id}" width="60" height="60" patternUnits="userSpaceOnUse"><path d="M60 0H0V60" fill="none" stroke="#fff" stroke-opacity=".12" stroke-width="2"/></pattern>
<filter id="sh${id}" x="-20%" y="-20%" width="140%" height="150%"><feDropShadow dx="0" dy="14" stdDeviation="14" flood-color="#020617" flood-opacity=".35"/></filter>
</defs>
<style>
@keyframes fall{0%{transform:translateY(-10px);opacity:0}15%{opacity:1}100%{transform:translateY(190px);opacity:0}}
@keyframes bob{0%,100%{transform:translateY(0)}50%{transform:translateY(-12px)}}
@keyframes pulse{0%,100%{opacity:.35}50%{opacity:.8}}
.d{animation:fall 1.8s linear infinite}.d2{animation-delay:.6s}.d3{animation-delay:1.2s}
.b{animation:bob 5s ease-in-out infinite}.b2{animation-delay:-2s}.p{animation:pulse 3s ease-in-out infinite}
@media(prefers-reduced-motion:reduce){.d,.b,.p{animation:none}}
</style>`;

const backdrop = (p, id) => `<rect width="1200" height="800" fill="url(#bg${id})"/><rect width="1200" height="800" fill="url(#tl${id})"/>
<circle cx="980" cy="140" r="260" fill="url(#gw${id})" class="p"/><circle cx="160" cy="700" r="220" fill="url(#gw${id})" class="p" style="animation-delay:-1.5s"/>
<circle cx="170" cy="150" r="7" fill="#fff" opacity=".5" class="b"/><circle cx="1040" cy="560" r="5" fill="#fff" opacity=".5" class="b b2"/><circle cx="330" cy="610" r="4" fill="#fff" opacity=".4" class="b"/><circle cx="900" cy="90" r="4" fill="#fff" opacity=".4" class="b b2"/>`;
const floor = p => `<path d="M0 640H1200V800H0Z" fill="#020617" opacity=".28"/><ellipse cx="600" cy="660" rx="380" ry="26" fill="#020617" opacity=".3"/>`;

const scenes = {
  // Walk-in shower with glass panel, rain head and falling water
  shower: (p, id) => `<g filter="url(#sh${id})"><rect x="340" y="120" width="520" height="520" rx="18" fill="url(#gl${id})" opacity=".18" stroke="#fff" stroke-opacity=".7" stroke-width="6"/>
<path d="M380 120V640M820 120V640" stroke="#fff" stroke-opacity=".25" stroke-width="3"/><path d="M360 600L520 140M420 620L600 140" stroke="#fff" stroke-opacity=".18" stroke-width="22"/></g>
<path d="M600 120V190" stroke="#e2e8f0" stroke-width="12" stroke-linecap="round"/><ellipse cx="600" cy="205" rx="110" ry="22" fill="#e2e8f0"/><ellipse cx="600" cy="200" rx="110" ry="18" fill="#fff"/>
${[480, 530, 580, 630, 680, 720].map((x, i) => `<rect x="${x}" y="222" width="5" height="26" rx="3" fill="${p[2]}" class="d ${i % 3 === 1 ? 'd2' : i % 3 === 2 ? 'd3' : ''}"/>`).join('')}
<rect x="410" y="400" width="130" height="80" rx="10" fill="#020617" opacity=".35"/><rect x="418" y="408" width="114" height="64" rx="6" fill="${p[1]}" opacity=".6"/>
<rect x="700" y="470" width="150" height="170" rx="10" fill="#fff" opacity=".12"/><path d="M700 560H850" stroke="#fff" stroke-opacity=".3" stroke-width="3"/>
<circle cx="765" cy="330" r="22" fill="url(#ac${id})"/><path d="M765 308v-30" stroke="#e2e8f0" stroke-width="8" stroke-linecap="round"/>`,
  // Freestanding tub with faucet and bubbles
  tub: (p, id) => `<g filter="url(#sh${id})"><path d="M230 420H970C970 560 900 640 780 640H420C300 640 230 560 230 420Z" fill="url(#gl${id})"/><rect x="215" y="396" width="770" height="44" rx="22" fill="#fff"/></g>
<path d="M300 440H900" stroke="${p[2]}" stroke-opacity=".55" stroke-width="10" stroke-linecap="round"/>
<path d="M360 640l-20 40M840 640l20 40" stroke="#cbd5e1" stroke-width="14" stroke-linecap="round"/>
<path d="M1010 200V430" stroke="#e2e8f0" stroke-width="16" stroke-linecap="round"/><path d="M1010 200q0-50-50-50h-60" fill="none" stroke="#e2e8f0" stroke-width="16" stroke-linecap="round"/><rect x="880" y="148" width="26" height="20" rx="4" fill="#fff"/>
<rect x="896" y="176" width="5" height="30" rx="3" fill="${p[2]}" class="d"/>
<circle cx="480" cy="380" r="28" fill="#fff" opacity=".55" class="b"/><circle cx="560" cy="340" r="18" fill="#fff" opacity=".5" class="b b2"/><circle cx="640" cy="372" r="34" fill="#fff" opacity=".5" class="b"/><circle cx="730" cy="330" r="14" fill="#fff" opacity=".6" class="b b2"/>
<rect x="150" y="180" width="170" height="240" rx="85" fill="#fff" opacity=".1"/><path d="M235 220v160" stroke="#fff" stroke-opacity=".3" stroke-width="4"/>`,
  // Tile grid with trowel and spacers
  tile: (p, id) => `<g filter="url(#sh${id})">${Array.from({ length: 16 }, (_, i) => { const c = i % 4, r = Math.floor(i / 4), x = 330 + c * 150, y = 140 + r * 120; const f = (c + r) % 3 === 0 ? `url(#ac${id})` : (c + r) % 3 === 1 ? `url(#gl${id})` : p[1]; return `<rect x="${x}" y="${y}" width="138" height="108" rx="10" fill="${f}" opacity="${(c + r) % 3 === 2 ? 0.85 : 1}"/>`; }).join('')}</g>
<path d="M350 170l60 40M530 290l60 40M830 410l60 40" stroke="#fff" stroke-opacity=".5" stroke-width="6" stroke-linecap="round"/>
<g class="b" filter="url(#sh${id})"><path d="M850 540l-210 80" stroke="#94a3b8" stroke-width="22" stroke-linecap="round"/><path d="M880 480l130-50 20 52-130 50z" fill="#e2e8f0"/><path d="M880 480l130-50" stroke="#fff" stroke-width="4"/></g>
<path d="M300 130h20M300 130v20M330 640h20M350 640v-20" stroke="${p[2]}" stroke-width="8" stroke-linecap="round"/>`,
  // Vanity, mirror, and wall light for general remodeling
  vanity: (p, id) => `<g filter="url(#sh${id})"><rect x="430" y="90" width="340" height="300" rx="170" fill="url(#gl${id})" opacity=".28" stroke="#fff" stroke-width="10"/><path d="M500 300q60-130 200-150" stroke="#fff" stroke-opacity=".5" stroke-width="20" stroke-linecap="round" fill="none"/>
<rect x="320" y="430" width="560" height="60" rx="12" fill="#fff"/><rect x="340" y="490" width="520" height="150" rx="12" fill="${p[1]}"/><rect x="360" y="508" width="230" height="114" rx="8" fill="#020617" opacity=".25"/><rect x="610" y="508" width="230" height="114" rx="8" fill="#020617" opacity=".25"/><circle cx="475" cy="565" r="10" fill="#e2e8f0"/><circle cx="725" cy="565" r="10" fill="#e2e8f0"/>
<ellipse cx="600" cy="436" rx="80" ry="12" fill="#cbd5e1"/><path d="M600 436V380q0-30 30-30h20" fill="none" stroke="#e2e8f0" stroke-width="14" stroke-linecap="round"/></g>
<circle cx="260" cy="200" r="40" fill="#fde68a" opacity=".9" class="p"/><path d="M260 240v50" stroke="#e2e8f0" stroke-width="8"/><circle cx="940" cy="200" r="40" fill="#fde68a" opacity=".9" class="p"/><path d="M940 240v50" stroke="#e2e8f0" stroke-width="8"/>`,
  // Service area: map with pins
  map: (p, id) => `<g filter="url(#sh${id})"><path d="M240 180l240-40 240 50 240-40v470l-240 40-240-50-240 40z" fill="url(#gl${id})" opacity=".92"/></g>
<path d="M480 140V620M720 190V670" stroke="${p[1]}" stroke-opacity=".35" stroke-width="3" stroke-dasharray="10 10"/><path d="M260 420q150-90 260 0t260-40 180 20" fill="none" stroke="${p[2]}" stroke-width="14" stroke-linecap="round" opacity=".8"/>
${[[430, 330], [640, 270], [820, 440]].map(([x, y], i) => `<g class="b ${i === 1 ? 'b2' : ''}"><path d="M${x} ${y + 70}c-50-60-60-90-60-120a60 60 0 0 1 120 0c0 30-10 60-60 120z" fill="url(#ac${id})" stroke="#fff" stroke-width="6"/><circle cx="${x}" cy="${y - 50}" r="20" fill="#fff"/></g>`).join('')}`,
  // Guide: clipboard checklist with pencil
  guide: (p, id) => `<g filter="url(#sh${id})"><rect x="370" y="110" width="460" height="560" rx="28" fill="url(#gl${id})"/><rect x="480" y="80" width="240" height="70" rx="22" fill="${p[1]}" stroke="#fff" stroke-width="6"/></g>
${[0, 1, 2, 3].map(i => `<g><rect x="420" y="${200 + i * 105}" width="52" height="52" rx="12" fill="${i < 3 ? `url(#ac${id})` : 'none'}" stroke="${p[1]}" stroke-width="6"/>${i < 3 ? `<path d="M434 ${228 + i * 105}l12 12 18-24" stroke="#fff" stroke-width="8" fill="none" stroke-linecap="round" stroke-linejoin="round"/>` : ''}<rect x="500" y="${210 + i * 105}" width="${240 - i * 22}" height="14" rx="7" fill="${p[0]}" opacity=".7"/><rect x="500" y="${236 + i * 105}" width="${170 - i * 14}" height="10" rx="5" fill="${p[0]}" opacity=".3"/></g>`).join('')}
<g class="b"><path d="M880 640l-110-110 36-36 110 110z" fill="#fbbf24"/><path d="M880 640l-8 40 40-8z" fill="#fde68a"/><path d="M770 530l36-36 20 20-36 36z" fill="#f87171"/></g>`,
  // About: house with team badge
  house: (p, id) => `<g filter="url(#sh${id})"><path d="M250 380L600 110l350 270V640H250Z" fill="url(#gl${id})"/><path d="M220 390L600 90l380 300" fill="none" stroke="${p[2]}" stroke-width="22" stroke-linecap="round" stroke-linejoin="round"/></g>
<rect x="520" y="440" width="160" height="200" rx="14" fill="${p[1]}"/><circle cx="650" cy="545" r="9" fill="#fde68a"/><rect x="310" y="430" width="140" height="110" rx="10" fill="${p[2]}" opacity=".6"/><rect x="750" y="430" width="140" height="110" rx="10" fill="${p[2]}" opacity=".6"/><path d="M380 430v110M310 485h140M820 430v110M750 485h140" stroke="#fff" stroke-width="5"/>
<g class="b"><path d="M600 190c0 0-62 66-62 108a62 62 0 0 0 124 0c0-42-62-108-62-108z" fill="url(#ac${id})" stroke="#fff" stroke-width="6"/><path d="M600 250l9 24 26 1-21 16 8 25-22-15-22 15 8-25-21-16 26-1z" fill="#fff"/></g>`,
  // Wide community banner: speech bubbles
  chat: (p, id) => `<g filter="url(#sh${id})"><path d="M200 220h420a40 40 0 0 1 40 40v150a40 40 0 0 1-40 40H400l-80 70v-70h-120a40 40 0 0 1-40-40V260a40 40 0 0 1 40-40z" fill="url(#gl${id})"/><path d="M560 400h320a40 40 0 0 1 40 40v110a40 40 0 0 1-40 40h-60v60l-70-60H560a40 40 0 0 1-40-40V440a40 40 0 0 1 40-40z" fill="url(#ac${id})" transform="translate(120 -20)"/></g>
${[0, 1, 2].map(i => `<rect x="250" y="${270 + i * 40}" width="${300 - i * 50}" height="14" rx="7" fill="${p[0]}" opacity=".6"/>`).join('')}${[0, 1].map(i => `<rect x="670" y="${410 + i * 40}" width="${200 - i * 40}" height="14" rx="7" fill="#fff" opacity=".85"/>`).join('')}`
};

const SCENE_BY_SLOT = [
  [/^hero$/, 'shower', 'blue'], [/^about$/, 'house', 'sky'], [/^community-banner$/, 'chat', 'indigo'],
  [/^service-bathroom/, 'vanity', 'blue'], [/^service-tile/, 'tile', 'teal'], [/^service-(shower|.*tub)/, 'shower', 'sky'], [/^service-/, 'vanity', 'indigo'],
  [/^county-/, 'map', 'teal'], [/tile/, 'tile', 'teal'], [/tub|shower|water/, 'tub', 'sky'], [/^guide-/, 'guide', 'indigo']
];

function sceneFor(slot, label) {
  const key = `${slot} ${label}`.toLowerCase();
  const fromSlot = SCENE_BY_SLOT.find(([re]) => re.test(slot));
  if (fromSlot) return [fromSlot[1], fromSlot[2]];
  if (/tile/.test(key)) return ['tile', 'teal'];
  if (/shower|tub/.test(key)) return ['tub', 'sky'];
  return ['vanity', 'blue'];
}

function illustrationSvg(slot, label) {
  const [scene, tone] = sceneFor(slot, label);
  const p = PALETTES[tone], id = scene;
  const caption = label.length > 44 ? label.slice(0, 43) + '\u2026' : label;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 800" role="img" aria-label="${esc(caption)} illustration">${defs(p, id)}${backdrop(p, id)}${floor(p)}${scenes[scene](p, id)}</svg>`;
}

module.exports = { illustrationSvg };
