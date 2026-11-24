// Bathroom estimator (staff). Mobile-first. All data is inserted with textContent / setAttribute (never innerHTML).
(() => {
  const root = document.querySelector('[data-estimator-page]');
  if (!root) return;
  const el = (tag, props = {}, ...kids) => {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(props)) {
      if (v === false || v == null) continue;
      if (k === 'class') n.className = v; else if (k === 'text') n.textContent = v; else if (k.startsWith('on')) n.addEventListener(k.slice(2), v); else n.setAttribute(k, v === true ? '' : v);
    }
    n.append(...kids.flat().filter(k => k != null && k !== false));
    return n;
  };
  const api = async (url, options = {}) => {
    const response = await fetch(url, options);
    const data = await response.json().catch(() => ({}));
    if (!response.ok) { const error = new Error(data.error || 'Something went wrong. Please try again.'); error.status = response.status; throw error; }
    return data;
  };
  const send = (url, body) => api(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) });
  const usd = c => `$${((c || 0) / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const day = v => v ? new Date(/^\d{4}-\d{2}-\d{2}$/.test(v) ? `${v}T12:00:00` : v).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : '';
  const COLORS = { draft: 'secondary', sent: 'primary', accepted: 'success', declined: 'danger', void: 'dark' };
  const badge = s => el('span', { class: `est-pill est-pill-${COLORS[s] ? s : 'draft'}`, text: s });
  const stat = (label, value, tone = '') => el('div', { class: `est-stat ${tone}` }, el('span', { class: 'est-stat-v', text: value }), el('span', { class: 'est-stat-l', text: label }));
  const KIND_FALLBACK = { material: 'Materials', labor: 'Labor', sub: 'Subcontractor', equipment: 'Equipment', fee: 'Fees & permits', other: 'Other' };

  let me = null, boot_ = null, alertBox = el('div', { class: 'mb-3 est-alert', role: 'status', 'aria-live': 'polite' });
  const notice = (kind, message) => { alertBox.className = `alert alert-${kind} mb-3`; alertBox.textContent = message; alertBox.scrollIntoView({ block: 'nearest' }); };
  const clear = () => { alertBox.className = 'mb-3'; alertBox.textContent = ''; };
  const act = fn => async (...a) => { try { clear(); await fn(...a); } catch (e) { if (e.status === 401) return start(); notice('danger', e.message); } };
  const btn = (label, onclick, cls = 'btn-outline-dark') => el('button', { type: 'button', class: `btn ${cls}`, text: label, onclick: act(onclick) });
  const field = (label, props = {}, tag = 'input') => {
    const id = `f${Math.random().toString(36).slice(2, 8)}`;
    const ctl = el(tag, { class: tag === 'select' ? 'form-select form-select-lg' : 'form-control form-control-lg', id, ...props });
    return { ctl, wrap: el('div', { class: 'mb-3' }, el('label', { class: 'form-label', for: id, text: label }), ctl) };
  };
  const select = (label, options, value) => {
    const f = field(label, {}, 'select');
    for (const [v, t] of options) f.ctl.append(el('option', { value: v, text: t, ...(String(v) === String(value) ? { selected: true } : {}) }));
    return f;
  };
  const check = (label, checked = false) => {
    const id = `c${Math.random().toString(36).slice(2, 8)}`;
    const ctl = el('input', { class: 'form-check-input', type: 'checkbox', id, ...(checked ? { checked: true } : {}) });
    return { ctl, wrap: el('div', { class: 'form-check form-switch mb-2 fs-6' }, ctl, el('label', { class: 'form-check-label', for: id, text: label })) };
  };
  const card = (title, ...kids) => el('section', { class: 'est-card' }, title ? el('h3', { class: 'est-card-title', text: title }) : null, ...kids);
  const num = v => (v === '' || v == null ? undefined : Number(v));

  // ---------- Sign-in & boot
  async function start() {
    try { me = await api('/api/estimator/me'); } catch (e) {
      if (e.status === 401) return login();
      root.className = 'alert alert-warning';
      root.textContent = e.status === 403 ? 'Estimator access is turned off for your account. Ask the office to enable it.' : e.message;
      return;
    }
    boot_ = boot_ || await api('/api/estimator/bootstrap');
    root.className = '';
    window.removeEventListener('hashchange', route);
    window.addEventListener('hashchange', route);
    await route();
  }
  function login() {
    const email = field('Email', { type: 'email', autocomplete: 'username' }), password = field('Password', { type: 'password', autocomplete: 'current-password' });
    const status = el('div', { class: 'mt-3', role: 'status', 'aria-live': 'polite' });
    const submit = async e => {
      e.preventDefault();
      try { await send('/api/auth/login', { email: email.ctl.value, password: password.ctl.value }); await start(); } catch (error) { status.className = 'alert alert-danger mt-3'; status.textContent = error.message; }
    };
    root.className = '';
    root.replaceChildren(el('div', { class: 'row justify-content-center' }, el('div', { class: 'col-lg-5' }, el('form', { class: 'est-card est-login', onsubmit: submit, novalidate: true },
      el('h2', { class: 'est-card-title', text: 'Estimator sign in' }), el('p', { class: 'text-muted small', text: 'Staff only. Use the same email and password as your employee account.' }), email.wrap, password.wrap, el('button', { class: 'btn btn-primary btn-lg w-100', type: 'submit', text: 'Sign in' }), status))));
  }

  const TABS = [['list', 'Estimates'], ['new', 'Start estimate'], ['book', 'Price book', 1], ['learning', 'AI learning', 1], ['tasks', 'Handyman tasks', 1], ['settings', 'Defaults', 1]];
  const header = current => el('header', { class: 'est-head' },
    el('div', { class: 'est-bar' }, el('div', { class: 'est-title' }, el('span', { class: 'est-avatar', 'aria-hidden': 'true', text: (me.name || '?').trim().charAt(0).toUpperCase() }),
      el('span', {}, el('strong', { text: 'Estimator' }), el('span', { class: 'est-sub', text: `${me.name} \u00b7 ${me.role}` }))),
      btn('Sign out', async () => { await send('/api/auth/logout', {}); boot_ = null; await start(); }, 'btn-sm btn-outline-secondary')),
    el('nav', { class: 'est-tabs', 'aria-label': 'Estimator sections' }, TABS.filter(t => !t[2] || me.role === 'admin').map(([id, label]) =>
      el('a', { class: `est-tab${id === current || (id === 'list' && current === 'edit') ? ' active' : ''}`, href: `#${id}`, ...(id === current ? { 'aria-current': 'page' } : {}), text: label }))));

  const page = (current, ...kids) => { alertBox.className = 'mb-3'; alertBox.textContent = ''; root.replaceChildren(header(current), alertBox, ...kids); };

  const processRows = proc => {
    if (!proc) return [];
    const list = items => el('ul', { class: 'mb-1 ps-3' }, ...items.map(t => el('li', { text: t })));
    const rows = (proc.steps || proc.tasks || []).map(st => el('details', { class: 'mb-1' },
      el('summary', { class: 'fw-bold', text: `${st.n}. ${st.title || st.name} \u00b7 ${st.hours} hrs${st.crew ? ` \u00b7 crew ${st.crew}` : ''}${st.qty ? ` \u00b7 ${st.qty} ${st.unit}` : ''}` }),
      el('div', { class: 'fw-semibold' }, 'How'), el('ol', { class: 'mb-1 ps-3' }, ...st.steps.map(t => el('li', { text: t }))),
      el('div', { class: 'fw-semibold' }, 'Tools'), list(st.tools), el('div', { class: 'fw-semibold' }, 'Supplies'), list(st.supplies),
      ...(st.jobSupplies && st.jobSupplies.length ? [el('div', { class: 'fw-semibold' }, 'Quantities for this job'), list(st.jobSupplies.map(l => `${l.name}: ${l.qty} ${l.unit}`))] : [])));
    const grp = (title, nodes) => nodes.length ? el('details', { class: 'mb-1' }, el('summary', { class: 'fw-bold', text: title }), ...nodes) : null;
    const extra = [
      grp('Access, supplies, debris, cleanup and travel', (proc.logistics || []).map(r => el('p', { class: 'mb-1' }, el('strong', { text: `${r.label}: ` }), r.text))),
      proc.travel ? grp('Driving and tolls', [list([`${proc.travel.oneWayMiles} miles, about ${proc.travel.oneWayMinutes} minutes each way; ${proc.travel.vehicles} vehicle(s) over ${proc.travel.days} day(s)`, `Paid drive time ${proc.travel.driveHours} hrs, mileage ${proc.travel.miles} mi${proc.travel.toll ? `, tolls $${proc.travel.toll} per one-way trip` : ', no tolls'}`])]) : null,
      grp('Who does what (crew roles)', (proc.crew || []).map(c => el('div', { class: 'mb-1' }, el('strong', { text: `${c.role}${c.people > 1 ? ` x${c.people}` : ''} \u00b7 ${c.hours} hrs` }), el('div', { class: 'text-muted', text: c.note })))),
      grp('Day-by-day plan', (proc.dayPlan || []).map(d => el('div', { class: 'border-bottom py-1', text: `${d.days}: ${d.title}${d.crew ? ` (crew ${d.crew})` : ''}${d.roles && d.roles.length ? ` \u2014 ${d.roles.join(', ')}` : ''}${d.note ? `. ${d.note}` : ''}` }))),
      grp('Daily cleanup, final clean, disposal and paperwork', Object.entries(proc.closeout || {}).map(([k, v]) => el('div', { class: 'mb-1' }, el('div', { class: 'fw-semibold text-capitalize', text: k }), list(v))))
    ].filter(Boolean);
    return [el('h3', { class: 'h6 mt-2', text: `Step-by-step process (${proc.totalHours} hrs, includes ${proc.cushionPct}% cushion for human error and unforeseen conditions)` }), ...rows, ...extra];
  };
  async function route() {
    const hash = location.hash.replace(/^#/, '') || 'list';
    const [name, id] = hash.split('/');
    try {
      if (name === 'new') return await newEstimate();
      if (name === 'e' && Number(id)) return await editor(Number(id));
      if (name === 'book' && me.role === 'admin') return await priceBook();
      if (name === 'learning' && me.role === 'admin') return await learning();
      if (name === 'tasks' && me.role === 'admin') return await tasks();
      if (name === 'settings' && me.role === 'admin') return await defaults();
      return await list();
    } catch (e) { if (e.status === 401) return start(); page('list'); notice('danger', e.message); }
  }

  // ---------- Estimate list
  async function list() {
    const q = field('Search', { type: 'search', placeholder: 'Title, number or customer' }), status = select('Status', [['', 'All'], ['draft', 'Draft'], ['sent', 'Sent'], ['accepted', 'Accepted'], ['declined', 'Declined'], ['void', 'Void']], '');
    const out = el('div', { class: 'est-rows' }), tiles = el('div', { class: 'est-stats mb-3' });
    const load = act(async () => {
      const { estimates } = await api(`/api/estimator/estimates?q=${encodeURIComponent(q.ctl.value)}&status=${status.ctl.value}`);
      const sum = k => estimates.filter(e => e.status === k).reduce((a, e) => a + (e.totalCents || 0), 0);
      tiles.replaceChildren(stat('Estimates', String(estimates.length)), stat('Open (draft + sent)', usd(sum('draft') + sum('sent'))), stat('Accepted', usd(sum('accepted')), 'good'));
      out.replaceChildren(...(estimates.length ? estimates.map(e => el('a', { class: 'est-row', href: `#e/${e.id}` },
        el('div', { class: 'est-row-main' }, el('strong', { text: e.title }), el('span', { class: 'est-row-meta', text: [e.number, e.customerName, day(e.createdAt)].filter(Boolean).join(' \u00b7 ') })),
        el('div', { class: 'est-row-end' }, el('strong', { class: 'est-row-amt', text: usd(e.totalCents) }), badge(e.status)))) : [el('div', { class: 'est-empty' }, el('p', { class: 'mb-2', text: q.ctl.value || status.ctl.value ? 'No estimates match your search.' : 'No estimates yet.' }), el('a', { class: 'btn btn-primary', href: '#new', text: 'Create your first estimate' }))]));
    });
    let timer;
    q.ctl.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(load, 250); });
    status.ctl.addEventListener('change', load);
    page('list', el('div', { class: 'est-start' }, el('div', {}, el('h2', { class: 'est-start-t', text: 'Ready for a new estimate?' }), el('p', { class: 'mb-0', text: 'Answer a few questions, starting with the room, and get a full price, schedule and plan.' })), el('a', { class: 'btn btn-light btn-lg est-start-btn', href: '#new', text: 'Start estimate' })), tiles, el('div', { class: 'est-card' }, el('div', { class: 'row g-2' }, el('div', { class: 'col-sm-8' }, q.wrap), el('div', { class: 'col-sm-4' }, status.wrap))), out);
    await load();
  }

  // ---------- New estimate with quick wizard
  async function newEstimate() {
    const title = field('Estimate title', { maxlength: 150, value: 'Bathroom remodel' });
    const search = field('Find customer', { type: 'search', placeholder: 'Name, email or phone' }), customerResults = el('div', { class: 'mb-3' });
    let customerId = null;
    const picked = el('div', { class: 'fw-bold mb-3' });
    const nc = { name: field('New customer name', { maxlength: 120 }), email: field('Email', { type: 'email', maxlength: 200 }), phone: field('Phone', { type: 'tel', maxlength: 40 }), address: field('Address', { maxlength: 300 }) };
    let timer;
    search.ctl.addEventListener('input', () => {
      clearTimeout(timer);
      timer = setTimeout(act(async () => {
        const { customers } = await api(`/api/estimator/customers?q=${encodeURIComponent(search.ctl.value)}`);
        customerResults.replaceChildren(...customers.map(c => el('button', { type: 'button', class: 'list-group-item list-group-item-action w-100 text-start', text: `${c.name}${c.address ? ` \u00b7 ${c.address}` : ''}`, onclick: () => { customerId = c.id; picked.textContent = `Customer: ${c.name}`; results.replaceChildren(); } })));
      }), 250);
    });
    const w = {
      bathType: select('Bathroom type', [['full', 'Full bath'], ['master', 'Primary bath'], ['hall', 'Hall bath (tub)'], ['half', 'Half bath'], ['powder', 'Powder room']], 'full'),
      tier: select('Finish level', [['good', 'Good (value)'], ['better', 'Better'], ['best', 'Best (premium)']], 'better'),
      length: field('Room length (ft)', { type: 'number', inputmode: 'decimal', min: '0', max: '60', value: '8' }),
      width: field('Room width (ft)', { type: 'number', inputmode: 'decimal', min: '0', max: '60', value: '5' }),
      ceilingHeight: field('Ceiling height (ft)', { type: 'number', inputmode: 'decimal', min: '7', max: '20', value: '8' }),
      city: field('City or village of the job (for permits and codes)', { maxlength: '80', placeholder: 'e.g. Aurora' }),
      homeYear: field('Year home was built', { type: 'number', inputmode: 'numeric', min: '1800', max: '2100', placeholder: 'e.g. 1965' }),
      level: select('Floor level', [['first', 'First floor'], ['upper', 'Upper floor'], ['basement', 'Basement']], 'first'),
      condition: select('Condition behind the walls', [['good', 'Good'], ['fair', 'Fair / unknown'], ['poor', 'Poor (rot, leaks)']], 'fair'),
      flooring: select('Flooring', [['tile', 'Tile'], ['lvp', 'Luxury vinyl plank'], ['vinyl', 'Sheet vinyl'], ['none', 'Keep existing']], 'tile'),
      tilePattern: select('Tile pattern', [['standard', 'Standard'], ['diagonal', 'Diagonal'], ['herringbone', 'Herringbone']], 'standard'),
      shower: select('Shower / tub', [['walk_in', 'Walk-in shower'], ['tub_surround', 'Tub surround'], ['none', 'None']], 'walk_in'),
      showerStyle: select('Shower build', [['tile', 'Custom tile'], ['prefab', 'Prefab base and surround']], 'tile'),
      glassType: select('Shower enclosure', [['none', 'None'], ['curtain', 'Curtain and rod'], ['slider', 'Sliding door'], ['frameless', 'Frameless glass'], ['panel', 'Fixed glass panel']], 'none'),
      vanityType: select('Vanity', [['single', 'Single'], ['double', 'Double']], 'single'),
      toiletMode: select('Toilet', [['replace', 'Replace'], ['rebuild', 'Rebuild internals only'], ['keep', 'Keep']], 'replace'),
      wallTileSf: field('Shower wall tile (sq ft, blank = calculate)', { type: 'number', inputmode: 'decimal', min: '0' }),
      showerLength: field('Shower or tub length (ft)', { type: 'number', inputmode: 'decimal', min: '0', max: '12', placeholder: 'e.g. 5' }),
      showerWidth: field('Shower or tub width (ft)', { type: 'number', inputmode: 'decimal', min: '0', max: '12', placeholder: 'e.g. 3' }),
      windowCount: field('Windows in the room', { type: 'number', inputmode: 'numeric', min: '0', max: '6', value: '0' }),
      floorSf: field('Floor area (sq ft, blank = length x width)', { type: 'number', inputmode: 'decimal', min: '0' }),
      wainscotSf: field('Wainscot or accent wall (sq ft, 0 = none)', { type: 'number', inputmode: 'decimal', min: '0', value: '0' }),
      ceilingWork: select('Ceiling', [['none', 'Leave as is'], ['patch', 'Patch and repaint'], ['replace', 'Replace the ceiling']], 'none'),
      vanities: field('Vanities', { type: 'number', inputmode: 'numeric', min: '0', max: '4', value: '1' })
    };
    const toggles = { demo: check('Demolition & haul-away', true), niche: check('Shower niche', true), bench: check('Shower bench'), curbless: check('Curbless shower entry'), heatedFloor: check('Heated floor'), newTub: check('New tub'), fan: check('Exhaust fan', true), lighting: check('New lighting', true), paint: check('Paint', true), permit: check('Permit', true), plumbingChanges: check('Relocate plumbing'), electricalChanges: check('Update or add electrical circuits'), insulation: check('Add wall insulation'), framing: check('Framing and blocking repairs'), soundproof: check('Soundproofing'), suggestUpgrades: check('Offer optional upgrades to the customer', true) };
    const dp = {
      walls: select('Walls and ceiling: how far in?', [['refresh', 'Surface only: patch, paint and trim'], ['repair', 'Open up where fixtures change, then patch'], ['studs', 'Down to the studs: gut and rebuild']], 'repair'),
      floor: select('Floor: how far down?', [['subfloor', 'Remove the old floor to the subfloor'], ['over', 'Install the new floor over the existing surface'], ['level', 'Remove to the subfloor, then level the floor'], ['replace', 'Cut out the floor and replace the plywood subfloor'], ['replaceLevel', 'Replace the plywood, then level before flooring']], 'subfloor')
    };
    const LAZY = ['electricalChanges', 'insulation', 'framing', 'soundproof'];
    const startDate = field('Planned start date (optional)', { type: 'date' });
    const jobType = select('Job type', [['bathroom', 'Bathroom remodel'], ['handyman', 'Handyman / home repair']], 'bathroom');
    const hm = { qty: {}, city: field('City or village of the job', { maxlength: '80', placeholder: 'e.g. Aurora' }), homeYear: field('Year home was built', { type: 'number', inputmode: 'numeric', min: '1800', max: '2100' }), startDate: field('Planned start date (optional)', { type: 'date' }), condo: check('Condo or HOA building') };
    const handymanBox = el('div');
    const tasksLoaded = api('/api/estimator/handyman/tasks').then(d => {
      handymanBox.append(el('div', { class: 'row' }, ...[hm.city, hm.homeYear, hm.startDate].map(f => el('div', { class: 'col-md-4' }, f.wrap))), hm.condo.wrap);
      for (const cat of d.categories) {
        const list = d.tasks.filter(t => t.category === cat); if (!list.length) continue;
        handymanBox.append(el('details', { class: 'mb-2' }, el('summary', { class: 'fw-bold', text: cat }), ...list.map(t => {
          const f = field(`${t.name} (per ${t.unit})${t.permit ? ' \u2022 may need a permit' : ''}`, { type: 'number', inputmode: 'decimal', min: '0', max: '1000', value: '0' });
          hm.qty[t.code] = f.ctl; return f.wrap;
        })));
      }
    });
    const isHandyman = () => jobType.ctl.value === 'handyman';
    const lgf = {
      stairFlights: field('Flights of stairs to the work area (blank = from floor level)', { type: 'number', inputmode: 'numeric', min: '0', max: '10' }),
      carryFt: field('Carry distance from truck to door (ft)', { type: 'number', inputmode: 'numeric', min: '0', max: '1000', value: '50' }),
      elevator: check('Building has an elevator (condo or high-rise)'),
      parking: select('Parking', [['onsite', 'Driveway or lot at the door'], ['street', 'Street parking only']], 'onsite'),
      supplyMode: select('How supplies get to the site', [['own', 'Our truck'], ['rental', 'Rent a truck or van'], ['supplier', 'Supplier delivers'], ['customer', 'Customer supplies materials']], 'own'),
      supplyTrips: field('Supply runs (blank = estimate)', { type: 'number', inputmode: 'numeric', min: '0', max: '40' }),
      debrisMode: select('Demo debris and garbage', [['dumpster', 'We rent a dumpster'], ['haul', 'We haul it away in our truck'], ['junk', 'Junk removal service'], ['customer', 'Customer removes it']], 'dumpster'),
      cleanupBy: select('Final cleanup', [['us', 'We do the final clean'], ['service', 'Hire a cleaning service'], ['customer', 'Customer cleans']], 'us'),
      driveMiles: field('Drive to the customer (miles one way)', { type: 'number', inputmode: 'decimal', min: '0', max: '300', value: '15' }),
      driveMinutes: field('Drive time one way (minutes, blank = estimate)', { type: 'number', inputmode: 'numeric', min: '0', max: '360' }),
      tollsOneWay: field('Tolls one way ($)', { type: 'number', inputmode: 'decimal', min: '0', max: '100', value: '0' }),
      siteVisits: field('Pre-job site visits', { type: 'number', inputmode: 'numeric', min: '0', max: '6', value: '1' })
    };
    const lgValues = () => Object.fromEntries(Object.entries(lgf).map(([k, f]) => [k, f.ctl.type === 'checkbox' ? f.ctl.checked : f.ctl.value]).filter(([, v]) => v !== ''));
    const lgBox = el('div', {}, el('p', { class: 'small text-muted', text: 'Stairs, long carries, truck rental, debris, cleanup, driving and tolls are priced and added to the crew hours.' }), el('div', { class: 'row' }, ...Object.values(lgf).map(f => el('div', { class: 'col-md-6' }, f.wrap))));
    lgBox.addEventListener('input', () => refresh()); lgBox.addEventListener('change', () => refresh());
    const handymanValues = () => ({ ...lgValues(), jobType: 'handyman', startDate: hm.startDate.ctl.value, city: hm.city.ctl.value, homeYear: hm.homeYear.ctl.value, condo: hm.condo.ctl.checked, tasks: Object.fromEntries(Object.entries(hm.qty).map(([k, c]) => [k, Number(c.value) || 0]).filter(([, n]) => n > 0)) });
    const wizardValues = () => {
      if (isHandyman()) return handymanValues();
      const v = { ...lgValues(), startDate: startDate.ctl.value, ...Object.fromEntries(Object.entries(w).map(([k, f]) => [k, f.ctl.value])), ...Object.fromEntries(Object.entries(toggles).filter(([k, f]) => f.ctl.checked || !LAZY.includes(k)).map(([k, f]) => [k, f.ctl.checked])) };
      v.drywall = dp.walls.ctl.value !== 'refresh'; v.fullRemodel = dp.walls.ctl.value === 'studs';
      const fl = dp.floor.ctl.value;
      if (fl === 'replace' || fl === 'replaceLevel') v.subfloor = true;
      if (fl === 'level' || fl === 'replaceLevel') v.leveler = true;
      if (fl === 'over') v.demo = v.demo && dp.walls.ctl.value !== 'refresh';
      return v;
    };
    const advice = el('div', { class: 'small pre-wrap' }), phasesBox = el('div', { class: 'small mt-3' }), processBox = el('div', { class: 'small mt-3' }), preview = el('div', { class: 'est-stats est-stats-2 mb-3' });
    let adviceTimer;
    const learned = el('p', { class: 'small text-muted' });
    const insightBox = el('div', { class: 'small mt-3' });
    const codeRows = c => [el('h4', { class: 'h6 mt-3', text: `Permits and codes: ${c.city ? c.city.name : 'Illinois'}${c.city && !c.city.verified ? ' (unverified, call the city)' : ''}` }),
      el('p', { class: 'mb-1 fw-bold', text: c.permitNeeded ? `Permits likely needed: ${[...new Set(c.permits.map(p => p.type))].join(', ')}` : c.noPermitNote }),
      ...[['Why', c.permits.map(p => `${p.type}: ${p.why}`)], ['Inspections to book', c.inspections], ['Flags', c.flags], [c.city ? `${c.city.dept}` : 'City not in database', c.city ? [...c.city.notes, c.city.url].filter(Boolean) : ['Add it under AI learning > Codes or confirm with the building department.']], ['Illinois rules', c.stateRules], ['Before you apply', c.checklist]].map(([t, l]) => l.length ? el('details', { class: 'mb-1' }, el('summary', { class: 'fw-bold', text: t }), el('ul', { class: 'mb-1' }, l.map(x => el('li', { text: x })))) : null),
      el('p', { class: 'text-muted', text: c.disclaimer })];
    const insightRows = i => {
      const m = c => usd(c), li = (t, list) => list && list.length ? el('details', { class: 'mb-1' }, el('summary', { class: 'fw-bold', text: t }), el('ul', { class: 'mb-1' }, list.map(x => el('li', { text: x })))) : null;
      return [el('h4', { class: 'h6', text: `AI insights (${i.confidence.score}% confidence, likely ${m(i.confidence.lowCents)} to ${m(i.confidence.highCents)})` }), el('p', { class: 'mb-1', text: i.summary }),
        li('Good / better / best', (i.tiers || []).map(t => `${t.tier}: ${m(t.costCents)} cost`)), li('Risks and exposure', i.risks.map(r => `${r.name}: up to ${m(r.exposureCents)}. ${r.why}`)),
        li('Margin and benchmark', [`Gross margin ${i.margin.grossPct}% (${m(i.margin.grossCents)}), ${m(i.margin.perLaborHourCents)} per labor hour`, i.benchmark ? `$${i.benchmark.perSf} per sq ft, ${i.benchmark.flag} vs typical` : null, `Biggest cost drivers: ${i.drivers.map(d => `${d.section} ${d.pct}%`).join(', ')}`, `A 10% swing: materials ${m(i.sensitivity.materials10Cents)}, labor ${m(i.sensitivity.labor10Cents)}`, i.priceAge.note]),
        li('Ways to save', i.valueEngineering), li('Order early (lead times)', i.leadTimes.map(l => `${l.note} (about ${l.days} business days)`)),
        li('Payment milestones', i.payments.map(p => `${p.name}: ${m(p.cents)}`)), li('Code and inspections', [...i.code, ...i.inspections]),
        li('Sizing', [i.fan?.note, i.electrical?.note, i.tile ? `Tile: order ${i.tile.orderSf} sq ft (${i.tile.overagePct}% extra), about ${i.tile.boxes12sf} boxes of 12 sq ft. ${i.tile.note}` : null, i.dumpster ? `Dumpster: ${i.dumpster.size} (${i.dumpster.cubicYards} cu yd). ${i.dumpster.note}` : null].filter(Boolean)),
        li('Crew by trade (hours)', i.trades.map(t => `${t.trade}: ${t.hours}`)), li('Accessibility and aging in place', i.accessibility), li('Homeowner prep and downtime', [i.downtime.note, ...i.customerPrep]),
        li('Warranty and resale', [...i.warranty, i.resale?.note, i.seasonal].filter(Boolean)), li('Still needed for a tighter estimate', i.completeness.missing), li('Shopping list by section', i.shopping.map(g => `${g.section}: ${g.items.map(x => `${x.name} x${x.qty} ${x.unit}`).join('; ')}`))];
    };

    const advisorBox = el('div', { class: 'small mt-3' }), lastAdvice = { r: null };
    const advisorRows = a => {
      const m = usd, d = x => x ? new Date(`${x}T12:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '', li = (t, list, open) => list && list.length ? el('details', { class: 'mb-1', ...(open ? { open: '' } : {}) }, el('summary', { class: 'fw-bold', text: t }), el('ul', { class: 'mb-1' }, list.map(x => el('li', { text: x })))) : null;
      return [
        ...(a.conflicts.length ? [el('div', { class: 'est-callout', role: 'alert' }, el('strong', { text: 'Check these before quoting' }), el('ul', { class: 'mb-0' }, a.conflicts.map(c => el('li', { text: `${c.severity === 'high' ? 'Important: ' : ''}${c.text}` }))))] : []),
        el('h4', { class: 'h6 mt-3', text: 'Advisor' }),
        el('div', { class: 'est-meter', role: 'img', 'aria-label': `Estimate readiness ${a.readiness.score}%` }, el('span', { class: `est-meter-bar est-w${Math.round(a.readiness.score / 10) * 10}` })),
        li(`Readiness ${a.readiness.score}%`, a.readiness.sections.map(x => `${x.name}: ${x.answered} of ${x.total} answered${x.missing.length ? ` (missing ${x.missing.join(', ')})` : ''}`)),
        li(`Hidden-condition allowance ${m(a.hidden.lowCents)} to ${m(a.hidden.highCents)}`, a.hidden.items.map(x => `${x.name}: ${m(x.lowCents)} to ${m(x.highCents)}. ${x.why}`)),
        li(a.permit.needed ? `Permit: about ${a.permit.reviewDays[0]}-${a.permit.reviewDays[1]} business days, ${m(a.permit.feeCents[0])} to ${m(a.permit.feeCents[1])}` : 'Permit', [a.permit.note]),
        li('Order by these dates', a.orders.map(o => `${d(o.orderBy)}: ${o.item} (${o.leadDays} business days). ${o.note}`)),
        li(`Price volatility: ${a.volatility.volatilePct}% of materials; quote valid ${a.volatility.suggestedValidDays} days (now ${a.volatility.currentValidDays})`, [a.volatility.note]),
        li('Financing examples', [...a.financing.options.map(o => `${o.months} months: ${m(o.monthlyCents)} per month (${m(o.totalCents)} total at ${a.financing.aprPct}% APR)`), a.financing.note]),
        li(`Walk-away price ${m(a.walkAway.floorCents)}`, [a.walkAway.belowFloor ? 'The current price is BELOW your walk-away price.' : `${m(a.walkAway.headroomCents)} of headroom above your ${a.walkAway.minMarginPct}% minimum margin.`, `Target price at ${a.negotiation.targetMarginPct}% margin: ${m(a.negotiation.targetPriceCents)}. You can discount up to ${m(a.negotiation.maxDiscountCents)} (${a.negotiation.maxDiscountPct}%) and stay on target.`]),
        li(`True profit after overhead: ${m(a.trueProfit.profitCents)} (${a.trueProfit.profitPct}%)`, [`Overhead at ${a.trueProfit.overheadPct}%: ${m(a.trueProfit.overheadCents)}`, `Cost mix: ${a.mix.laborPct}% labor, ${a.mix.materialPct}% materials (${a.mix.flag}). ${a.mix.note}`]),
        li(`One lost day costs ${m(a.delay.delayDayCents)}`, [`Crew ${m(a.delay.crewDayCents)} plus overhead ${m(a.delay.overheadDayCents)}.`, a.delay.note]),
        li(`Season and holidays (${a.season.month} start)`, [...a.season.notes, a.season.holidayNote, ...a.season.holidaysInSchedule.map(h => `${h.name}: ${d(h.date)}`)].filter(Boolean)),
        a.noBathroom ? li(`No-bathroom plan: about ${a.noBathroom.calendarDays} days`, [a.noBathroom.plan]) : null,
        a.condo ? li('Condo and HOA checklist', a.condo.items) : null,
        li('Inspection calendar', a.inspections.map(x => `Book by ${d(x.bookBy)}: ${x.inspection} (${x.phase}, ${d(x.date)})`)),
        li('Payment schedule', a.payments.map(p => `${d(p.when) || p.when}: ${p.name}, ${m(p.cents)}`)),
        li('Trade schedule', a.trades.map(t => `${t.trade}: ${d(t.start)} to ${d(t.end)}`)),
        li(`Contingency ${a.contingency.adequate ? 'is adequate' : `is short by ${m(a.contingency.shortfallCents)}`}`, [`Held ${m(a.contingency.heldCents)}, expected loss ${m(a.contingency.expectedLossCents)}, worst case ${m(a.contingency.exposureCents)}.`, a.contingency.note]),
        li('Change-order rates (pre-priced)', a.changeRates.map(r => `${r.name}: ${m(r.rateCents)} per ${r.unit}`)),
        li('Maintenance and warranty calendar', a.maintenance.map(x => `${d(x.date)}: ${x.name}. ${x.note}`)),
        li('Water and energy savings', [...a.savings.items.map(x => `${x.name}: about $${x.dollarsPerYear} per year`), a.savings.note])
      ].filter(Boolean);
    };
    const refresh = () => {
      clearTimeout(adviceTimer);
      adviceTimer = setTimeout(act(async () => {
        const r = await send('/api/estimator/advice', { inputs: wizardValues() });
        liveTotal.textContent = `Running estimate: ${usd(r.totalCents)} \u00b7 ${r.hours} labor hrs \u00b7 ${r.schedule.days} working days \u00b7 ${r.advisor.readiness.score}% ready`;
        preview.replaceChildren(stat('Estimated price', usd(r.totalCents), 'hero'), stat('Labor hours', String(r.hours)), stat('Crew', `${r.crew} ${r.crew === 1 ? 'person' : 'people'}`), stat('Working days', String(r.schedule.days)), stat('Line items', `${r.lineCount} + ${r.optionalCount} optional`), stat('Contingency', `${r.contingencyPct}%`));
        learned.textContent = r.learnedJobs ? `Learned from ${r.learnedJobs} finished job${r.learnedJobs === 1 ? '' : 's'}.` : '';
        advice.textContent = r.notes.join('\n');
        processBox.replaceChildren(...processRows(r.process));
        lastAdvice.r = r; advisorBox.replaceChildren(...advisorRows(r.advisor));
        insightBox.replaceChildren(...insightRows(r.insights).filter(Boolean), ...codeRows(r.codes).filter(Boolean));
        phasesBox.replaceChildren(...r.schedule.phases.map(p => el('div', { class: 'est-phase' }, el('span', { text: p.phase }), el('span', { class: 'text-nowrap text-muted', text: p.crew ? `${p.start.slice(5)} \u00b7 ${p.crew} people \u00b7 ${p.hours} hrs` : `${p.start.slice(5)} \u00b7 waiting ${p.days}d` }))));
      }), 400);
    };
    const pdfBtn = btn('Download results PDF', async () => {
      const res = await fetch('/api/estimator/advice/pdf', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: title.ctl.value, inputs: wizardValues() }) });
      if (!res.ok) throw new Error('Could not create the PDF.');
      const url = URL.createObjectURL(await res.blob());
      window.open(url, '_blank', 'noopener'); setTimeout(() => URL.revokeObjectURL(url), 60000);
    }, 'btn-outline-primary w-100 mt-3');
    let fromVision = false;
    const photos = el('input', { type: 'file', accept: 'image/jpeg,image/png,image/webp', multiple: true, class: 'form-control form-control-lg mb-3', 'aria-label': 'Bathroom photos' });
    const consent = check('The customer agreed that these photos may be analyzed by an AI service. Photos are not saved.');
    const findings = el('div', { class: 'small pre-wrap mt-3' });
    const shrink = file => new Promise((resolve, reject) => {
      const img = new Image(), url = URL.createObjectURL(file);
      img.onload = () => { const k = Math.min(1, 1600 / Math.max(img.width, img.height)), c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k); c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(url); resolve(c.toDataURL('image/jpeg', 0.82)); };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('One of the photos could not be read.')); };
      img.src = url;
    });
    const analyzeBtn = btn('Analyze photos and fill in the estimate', async () => {
      const files = [...photos.files].slice(0, 4);
      if (!files.length) throw new Error('Choose 1 to 4 photos of the bathroom.');
      if (!consent.ctl.checked) throw new Error('Confirm the customer agreed to AI photo analysis.');
      analyzeBtn.disabled = true; findings.textContent = 'Reading photos\u2026';
      try {
        const r = await send('/api/estimator/vision', { consent: true, images: await Promise.all(files.map(shrink)) });
        for (const [k, v] of Object.entries(r.inputs)) { if (w[k]) w[k].ctl.value = String(v); else if (toggles[k]) toggles[k].ctl.checked = v; }
        fromVision = true; refresh();
        findings.textContent = [`Confidence: ${Math.round(r.confidence * 100)}%`, '', 'What I see:', ...r.observations.map(x => `\u2022 ${x}`), '', 'Hidden conditions to confirm on site:', ...r.risks.map(x => `\u2022 ${x}`), '', 'Guessed, please check:', ...r.assumptions.map(x => `\u2022 ${x}`)].join('\n');
      } catch (error) { findings.textContent = ''; throw error; } finally { analyzeBtn.disabled = false; }
    }, 'btn-brass w-100');
    const grid = fs => el('div', { class: 'row' }, ...fs.map(f => el('div', { class: 'col-md-6' }, f.wrap)));
    const tg = (...keys) => keys.map(k => toggles[k].wrap);
    const note = t => el('p', { class: 'est-hint', text: t });
    const sect = t => el('h3', { class: 'est-sect', text: t });
    const ROOMS = [['full', 'Full bathroom', 'Tub or shower, toilet and vanity'], ['master', 'Primary bathroom', 'Larger room, often a double vanity'], ['hall', 'Hall bathroom', 'Tub and shower combo'], ['half', 'Half bath', 'Toilet and sink, no shower'], ['powder', 'Powder room', 'Small guest bath'], ['handyman', 'Other repairs', 'Handyman and home repair tasks']];
    const roomCards = () => el('div', { class: 'est-choices', role: 'group', 'aria-label': 'Which room' }, ROOMS.map(([v, t, d]) => {
      const on = v === 'handyman' ? isHandyman() : !isHandyman() && w.bathType.ctl.value === v;
      return el('button', { type: 'button', class: `est-choice${on ? ' on' : ''}`, 'aria-pressed': on ? 'true' : 'false', onclick: () => {
        const was = isHandyman();
        if (v !== 'handyman') w.bathType.ctl.value = v;
        jobType.ctl.value = v === 'handyman' ? 'handyman' : 'bathroom';
        if (was !== isHandyman() || v === 'handyman') title.ctl.value = isHandyman() ? 'Handyman and home repair' : `${t} remodel`; else title.ctl.value = `${t} remodel`;
        renderStep(); refresh();
      } }, el('strong', { text: t }), el('span', { text: d }));
    }));
    const wet = () => !['half', 'powder'].includes(w.bathType.ctl.value);
    const hasShower = () => wet() && w.shower.ctl.value !== 'none';
    const stages = {
      room: () => [roomCards(), el('details', { class: 'est-more' }, el('summary', { text: 'Have photos? Let the AI read the room (optional)' }), note('Take 1 to 4 photos. The AI fills in the questions that follow and flags hidden risks. Always check its answers and measure on site.'), photos, consent.wrap, analyzeBtn, findings)],
      size: () => [note('Measure the room wall to wall. The estimator uses these for flooring, wall area, paint, demo and debris.'), grid([w.length, w.width, w.ceilingHeight]), w.floorSf.wrap],
      details: () => [note('Now the other sizes in the room. Leave a box blank and the estimator works it out from the room size.'),
        ...(hasShower() ? [sect('Shower or tub'), grid([w.showerLength, w.showerWidth, w.wallTileSf])] : []), sect('Walls and openings'), grid([w.windowCount, w.wainscotSf]), ...(wet() ? [sect('Vanity'), grid([w.vanityType, w.vanities])] : [])],
      updates: () => [note('Choose what is being replaced or upgraded.'), grid([w.tier]), ...(wet() ? [sect('Shower and tub'), grid([w.shower, w.showerStyle, w.glassType, w.tilePattern]), ...tg('niche', 'bench', 'curbless', 'newTub')] : []),
        sect('Floor and fixtures'), grid([w.flooring, w.toiletMode]), ...tg('heatedFloor', 'fan', 'lighting', 'paint')],
      depth: () => [note('How far into the room do we have to go? This decides demolition, framing and what has to be rebuilt before the finish work.'), dp.walls.wrap, dp.floor.wrap, w.ceilingWork.wrap, grid([w.level, w.condition]), w.homeYear.wrap,
        el('p', { class: 'est-callout', text: 'Tip: choose "level" when the floor is out of flat before tile or vinyl, and "cut out and replace the plywood" when it is soft, stained or water damaged.' })],
      extras: () => [note('Everything else needed to finish the job. Pick whatever applies; the estimator adds the labor, materials, tool rental and cure times.'), sect('Prep and structure'), ...tg('framing', 'insulation', 'soundproof'), sect('Plumbing and electrical'), ...tg('plumbingChanges', 'electricalChanges'), sect('Paperwork and options'), ...tg('permit', 'suggestUpgrades')],
      site: () => [note('Where is the job and how does the crew get to it?'), w.city.wrap, startDate.wrap, lgBox],
      customer: () => [title.wrap, picked, search.wrap, el('div', { class: 'list-group mb-3' }, customerResults), el('details', { class: 'est-more' }, el('summary', { text: 'Or add a new customer' }), ...Object.values(nc).map(f => f.wrap)), note('You can also skip this and attach a customer later.')],
      tasks: () => [note('Enter a quantity for each task that applies. Open a group to see its tasks.'), handymanBox],
      access: () => [lgBox],
      review: () => [resultsCard, el('div', { class: 'est-card est-final' }, quick.wrap, create)]
    };
    const stepDefs = () => isHandyman() ? [
      ['Room', 'Which room is the work in?', 'room'], ['Tasks', 'Which repairs does the job include?', 'tasks'], ['Site', 'How will the crew get to and work at the site?', 'access'], ['Customer', 'Who is this estimate for?', 'customer'], ['Review', 'Review your estimate', 'review']
    ] : [
      ['Room', 'Which room are we working on?', 'room'], ['Size', 'How big is the room?', 'size'], ['Details', 'What are the other sizes in the room?', 'details'], ['Updates', 'What are we updating?', 'updates'], ['How far in', 'How far in do we have to go?', 'depth'],
      ['Prep', 'What else is needed to finish the job?', 'extras'], ['Site', 'Where is the job and how do we get there?', 'site'], ['Customer', 'Who is this estimate for?', 'customer'], ['Review', 'Review your estimate', 'review']
    ];
    let cur = 0;
    const WHY = { room: 'the room type sets the standard scope, fixtures and prices.', size: 'size drives flooring, wall area, paint, demolition and debris.', details: 'fixture and opening sizes change tile, glass and framing quantities.', updates: 'what you replace is most of the material cost.', depth: 'how far in we go decides demolition, framing and rebuild work.', extras: 'hidden prep like leveling or subfloor repair is where estimates usually go wrong.', site: 'access, distance and start date set travel, parking, carry and schedule.', customer: 'we attach the estimate to a customer so it can be sent and signed.' };
    const prog = el('ol', { class: 'est-steps', 'aria-label': 'Estimate steps' }), stage = el('div', { class: 'est-stage' }), nav = el('div', { class: 'est-nav' }), liveTotal = el('div', { class: 'est-live', role: 'status' });
    stage.addEventListener('input', () => refresh()); stage.addEventListener('change', e => { refresh(); if (e.target === w.shower.ctl || e.target === w.bathType.ctl) renderStep(); });
    const go = i => { cur = i; renderStep(); window.scrollTo({ top: 0, behavior: 'smooth' }); };
    function renderStep() {
      const defs = stepDefs(); cur = Math.max(0, Math.min(cur, defs.length - 1));
      const [name, question, key] = defs[cur], last = cur === defs.length - 1;
      prog.replaceChildren(...defs.map(([n], i) => el('li', {}, el('button', { type: 'button', class: `est-step${i === cur ? ' active' : i < cur ? ' done' : ''}`, ...(i === cur ? { 'aria-current': 'step' } : {}), onclick: () => go(i) },
        el('span', { class: 'est-step-n', text: i < cur ? '\u2713' : String(i + 1) }), el('span', { class: 'est-step-t', text: n })))));
      const head = [el('p', { class: 'est-kicker', text: `Step ${cur + 1} of ${defs.length}` }), el('h2', { class: 'est-q', text: question })];
      stage.replaceChildren(el('div', { class: key === 'review' ? '' : 'est-card' }, ...head, ...(WHY[key] ? [el('p', { class: 'est-why', text: `Why we ask: ${WHY[key]}` })] : []), ...stages[key](), ...(key === 'review' ? [reviewTools()] : [])));
      if (cur === 0) stage.prepend(drafted);
      if (key === 'size' || key === 'details') stage.prepend(warnBox);
      nav.replaceChildren(cur > 0 ? el('button', { type: 'button', class: 'btn btn-outline-secondary btn-lg', text: '\u2190 Back', onclick: () => go(cur - 1) }) : el('span'), last ? el('span') : el('button', { type: 'button', class: 'btn btn-primary btn-lg', text: `Next: ${defs[cur + 1][0]} \u2192`, onclick: () => go(cur + 1) }));
      liveTotal.classList.toggle('d-none', last); nav.classList.toggle('est-nav-static', last);
    }
    // Draft, warnings, compare, copy, print
    const DRAFT = 'bbs-estimate-draft', draftCtl = { ...Object.fromEntries(Object.entries(w).map(([k, v]) => [`w.${k}`, v.ctl])), ...Object.fromEntries(Object.entries(toggles).map(([k, v]) => [`t.${k}`, v.ctl])), ...Object.fromEntries(Object.entries(dp).map(([k, v]) => [`d.${k}`, v.ctl])), title: title.ctl, start: startDate.ctl };
    const saveDraft = () => { try { localStorage.setItem(DRAFT, JSON.stringify({ at: Date.now(), cur, v: Object.fromEntries(Object.entries(draftCtl).map(([k, c]) => [k, c.type === 'checkbox' ? c.checked : c.value])) })); } catch { /* storage unavailable */ } };
    const warnBox = el('div', { class: 'est-warns', role: 'status' }), drafted = el('div', { class: 'est-callout d-none' });
    const warnings = () => {
      const n = k => Number(w[k].ctl.value), out = [], L = n('length'), W = n('width'), H = n('ceilingHeight');
      if (L && W && (L > 40 || W > 40 || L < 3 || W < 3)) out.push(`A bathroom of ${L} by ${W} ft is unusual. Check the units (feet, not inches).`);
      if (H && (H < 6.5 || H > 14)) out.push(`A ${H} ft ceiling is unusual. Typical is 8 to 9 ft.`);
      if (L && W && w.floorSf.ctl.value && Math.abs(n('floorSf') - L * W) / (L * W) > 0.35) out.push(`Floor area ${n('floorSf')} sq ft differs a lot from ${L} x ${W} = ${Math.round(L * W)} sq ft.`);
      if (L && W && w.showerLength.ctl.value && w.showerWidth.ctl.value && n('showerLength') * n('showerWidth') > L * W * 0.7) out.push('The shower takes up most of the room. Check its size.');
      if (n('windowCount') > 5) out.push('More than 5 windows in a bathroom is unusual.');
      return out;
    };
    const showWarn = () => warnBox.replaceChildren(...warnings().map(t => el('p', { class: 'est-warn', text: `Check: ${t}` })));
    const reset = () => { try { localStorage.removeItem(DRAFT); } catch { /* ignore */ } location.reload(); };
    try {
      const d = JSON.parse(localStorage.getItem(DRAFT) || 'null');
      if (d && d.v && Date.now() - d.at < 7 * 864e5) {
        for (const [k, v] of Object.entries(d.v)) { const c = draftCtl[k]; if (c) { if (c.type === 'checkbox') c.checked = !!v; else c.value = v; } }
        cur = Math.min(d.cur || 0, 3);
        drafted.classList.remove('d-none'); drafted.append(`Resumed your draft from ${new Date(d.at).toLocaleString()}. `, el('button', { type: 'button', class: 'btn btn-sm btn-outline-secondary', text: 'Start over', onclick: reset }));
      }
    } catch { /* bad draft */ }
    stage.addEventListener('input', () => { saveDraft(); showWarn(); }); stage.addEventListener('change', saveDraft);
    stage.addEventListener('keydown', e => {
      if (e.key !== 'Enter' || e.target.tagName !== 'INPUT' || e.target.type === 'checkbox' || cur >= stepDefs().length - 1) return;
      e.preventDefault(); go(cur + 1);
    });
    const pins = [];
    const summaryText = r => [`${title.ctl.value || 'Bathroom remodel'}`, `Estimated price: ${usd(r.totalCents)} (deposit ${usd(r.depositCents)})`, `Timeline: about ${r.schedule.days} working days${r.schedule.endDate ? `, finishing around ${r.schedule.endDate}` : ''}`, `Crew: ${r.crew}`, '', ...r.advisor.payments.map(p => `${p.name}: ${usd(p.cents)}`), '', 'Estimate is valid for 30 days. Hidden damage found when walls are opened is handled by written change order.'].join('\n');
    const reviewTools = () => {
      const r = lastAdvice.r, note2 = el('span', { class: 'small text-muted', role: 'status' }), cmp = el('div', { class: 'mt-3' });
      const drawPins = () => cmp.replaceChildren(...(pins.length ? [el('table', { class: 'table table-sm est-compare' }, el('thead', {}, el('tr', {}, ['Scenario', 'Price', 'Days', 'Crew', 'Profit'].map(h => el('th', { text: h })))), el('tbody', {}, pins.map(x => el('tr', {}, [x.label, usd(x.total), String(x.days), String(x.crew), usd(x.profit)].map(t => el('td', { text: t }))))))] : []));
      return el('div', { class: 'est-card est-tools' }, el('h3', { class: 'est-card-title', text: 'Share and compare' }), el('div', { class: 'd-flex flex-wrap gap-2 align-items-center' },
        btn('Copy customer summary', async () => { if (!lastAdvice.r) return; await navigator.clipboard.writeText(summaryText(lastAdvice.r)); note2.textContent = 'Copied.'; }, 'btn-outline-primary'),
        btn('Print this page', async () => { window.print(); }, 'btn-outline-secondary'),
        btn('Pin to compare', async () => { const x = lastAdvice.r || r; if (!x) return; if (pins.length >= 4) pins.shift(); pins.push({ label: `${w.tier.ctl.selectedOptions[0].text} #${pins.length + 1}`, total: x.totalCents, days: x.schedule.days, crew: x.crew, profit: x.advisor.trueProfit.profitCents }); drawPins(); note2.textContent = 'Pinned. Go back, change an answer, and pin again.'; }, 'btn-outline-secondary'), note2), cmp);
    };
    handymanBox.addEventListener('input', refresh); handymanBox.addEventListener('change', refresh);
    refresh(); showWarn();
    const quick = check('Pre-fill line items with the quick estimator', true);
    const create = btn('Create estimate', async () => {
      const body = { title: title.ctl.value };
      if (customerId) body.customerId = customerId; else if (nc.name.ctl.value) body.newCustomer = Object.fromEntries(Object.entries(nc).map(([k, v]) => [k, v.ctl.value]));
      if (quick.ctl.checked) body.wizard = wizardValues(); if (fromVision) body.vision = true;
      const { id } = await send('/api/estimator/estimates', body);
      location.hash = `#e/${id}`;
    }, 'btn-primary btn-lg w-100');
    const resultsCard = card('Your estimate', preview, learned, advice, el('h4', { class: 'est-sub-title', text: 'Crew and hours by phase' }), phasesBox, processBox, advisorBox, insightBox, pdfBtn);
    renderStep();
    page('new', prog, liveTotal, stage, nav);
  }

  // ---------- Estimate editor
  async function editor(id) {
    const base = `/api/estimator/estimates/${id}`, admin = me.role === 'admin';
    const data = await api(base), e = data.estimate, t = data.totals, lines = data.lines, editable = data.editable;
    const refresh = () => editor(id);
    const kinds = boot_.kinds && Object.keys(boot_.kinds).length ? boot_.kinds : KIND_FALLBACK, kindLabel = k => (boot_.kinds && boot_.kinds[k]) || KIND_FALLBACK[k] || k;
    const sections = [...new Set(lines.map(l => l.section))];
    const lineCard = l => {
      const qty = field('Qty', { type: 'number', inputmode: 'decimal', step: 'any', min: '0', value: String(l.qty) }), cost = field(`Unit cost ($/${l.unit})`, { type: 'number', inputmode: 'decimal', step: '0.01', min: '0', value: (l.cost_cents / 100).toFixed(2) });
      const name = field('Description', { maxlength: 200, value: l.name }), optional = check('Optional add-on (customer chooses)', l.optional);
      const body = el('div', { class: 'pt-2' }, name.wrap, el('div', { class: 'row' }, el('div', { class: 'col-6' }, qty.wrap), el('div', { class: 'col-6' }, cost.wrap)), optional.wrap,
        el('div', { class: 'd-flex gap-2' }, btn('Save line', async () => { await send(`${base}/items/${l.id}`, { name: name.ctl.value, qty: Number(qty.ctl.value), cost: Number(cost.ctl.value), optional: optional.ctl.checked }); await refresh(); }, 'btn-primary'),
          btn('Delete', async () => { await send(`${base}/items/${l.id}/delete`); await refresh(); }, 'btn-outline-danger')));
      return el('details', { class: 'border-bottom py-2' }, el('summary', { class: 'd-flex justify-content-between gap-2' },
        el('span', {}, `${l.name}${l.optional ? ' (optional)' : ''}`, el('span', { class: 'small text-muted d-block', text: `${l.qty} ${l.unit} \u00b7 ${kindLabel(l.kind)}${admin ? ` \u00b7 cost ${usd(l.cost)}` : ''}` })), el('strong', { text: usd(l.price) })), editable ? body : null);
    };
    const secCards = sections.map(s => card(s || 'General', ...lines.filter(l => l.section === s).map(lineCard)));

    // Add from the price book
    const cat = boot_.catalog, cats = [...new Set(cat.map(c => c.category))];
    const find = field('Search price book', { type: 'search', placeholder: 'tile, vanity, labor...' }), pick = el('div', { class: 'list-group mt-2' });
    const addFromBook = async (c, qtyValue) => { await send(`${base}/items`, { catalogId: c.id, qty: qtyValue }); await refresh(); };
    find.ctl.addEventListener('input', () => {
      const term = find.ctl.value.trim().toLowerCase();
      pick.replaceChildren(...(term.length < 2 ? [] : cat.filter(c => `${c.name} ${c.category} ${c.tier}`.toLowerCase().includes(term)).slice(0, 15).map(c =>
        el('button', { type: 'button', class: 'list-group-item list-group-item-action d-flex justify-content-between gap-2', onclick: act(async () => { const v = Number(prompt(`Quantity (${c.unit})`, '1')); if (v > 0) await addFromBook(c, v); }) },
          el('span', { text: `${c.name}${c.tier ? ` (${c.tier})` : ''}` }), el('span', { class: 'text-nowrap small', text: `${usd(c.costCents)}/${c.unit}` })))));
    });
    const browse = el('details', { class: 'mt-2' }, el('summary', { text: 'Browse by category' }), ...cats.map(k => el('details', { class: 'ms-2' }, el('summary', { text: k }), ...cat.filter(c => c.category === k).map(c =>
      el('button', { type: 'button', class: 'list-group-item list-group-item-action d-flex justify-content-between gap-2', onclick: act(async () => { const v = Number(prompt(`Quantity (${c.unit})`, '1')); if (v > 0) await addFromBook(c, v); }) }, el('span', { text: `${c.name}${c.tier ? ` (${c.tier})` : ''}` }), el('span', { class: 'text-nowrap small', text: `${usd(c.costCents)}/${c.unit}` }))))));
    const custom = { name: field('Custom item', { maxlength: 200 }), kind: select('Type', Object.entries(kinds), 'material'), qty: field('Qty', { type: 'number', inputmode: 'decimal', step: 'any', value: '1' }), unit: select('Unit', (boot_.units || ['ea']).map(u => [u, u]), (boot_.units || ['ea'])[0]), cost: field('Unit cost ($)', { type: 'number', inputmode: 'decimal', step: '0.01', min: '0' }), section: field('Section', { maxlength: 100, value: 'Extras' }) };
    const addCustom = btn('Add custom line', async () => { await send(`${base}/items`, { name: custom.name.ctl.value, kind: custom.kind.ctl.value, qty: Number(custom.qty.ctl.value), unit: custom.unit.ctl.value, cost: Number(custom.cost.ctl.value), section: custom.section.ctl.value }); await refresh(); }, 'btn-primary');
    const adders = editable ? card('Add items', find.wrap, pick, browse, el('hr'), el('div', { class: 'row' }, ...Object.values(custom).map(f => el('div', { class: 'col-6' }, f.wrap))), addCustom) : null;

    // Details
    const d = { title: field('Title', { maxlength: 150, value: e.title }), scope: field('Scope of work (shown to customer)', { rows: 4, maxlength: 5000 }, 'textarea'), exclusions: field('Not included', { rows: 3, maxlength: 5000 }, 'textarea'), terms: field('Terms', { rows: 4, maxlength: 5000 }, 'textarea'), notes: field('Internal notes (never shown to customer)', { rows: 2, maxlength: 5000 }, 'textarea'), display: select('Customer sees', [['itemized', 'Every line item'], ['sections', 'Section totals only']], e.display), validUntil: field('Valid until', { type: 'date', value: e.validUntil || '' }) };
    d.scope.ctl.value = e.scope || ''; d.exclusions.ctl.value = e.exclusions || ''; d.terms.ctl.value = e.terms || ''; d.notes.ctl.value = e.internalNotes || '';
    const pricing = admin ? { markupPct: field('Markup %', { type: 'number', inputmode: 'decimal', step: '0.1', min: '0', value: String(e.markupBp / 100) }), taxPct: field('Sales tax % (materials)', { type: 'number', inputmode: 'decimal', step: '0.01', min: '0', value: String(e.taxBp / 100) }), contingencyPct: field('Contingency %', { type: 'number', inputmode: 'decimal', step: '0.1', min: '0', value: String(e.contingencyBp / 100) }), depositPct: field('Deposit %', { type: 'number', inputmode: 'decimal', step: '1', min: '0', value: String(e.depositBp / 100) }), discount: field('Discount ($)', { type: 'number', inputmode: 'decimal', step: '0.01', min: '0', value: (e.discountCents / 100).toFixed(2) }) } : {};
    const saveDetails = btn('Save details', async () => {
      await send(base, { title: d.title.ctl.value, scope: d.scope.ctl.value, exclusions: d.exclusions.ctl.value, terms: d.terms.ctl.value, internalNotes: d.notes.ctl.value, display: d.display.ctl.value, validUntil: d.validUntil.ctl.value || null, ...Object.fromEntries(Object.entries(pricing).map(([k, v]) => [k, Number(v.ctl.value || 0)])) });
      notice('success', 'Saved.'); await refresh();
    }, 'btn-primary');
    const detailsCard = editable ? card('Details', d.title.wrap, d.scope.wrap, d.exclusions.wrap, d.terms.wrap, d.notes.wrap, d.display.wrap, d.validUntil.wrap, admin ? el('div', { class: 'row' }, ...Object.values(pricing).map(f => el('div', { class: 'col-6' }, f.wrap))) : null, saveDetails) : card('Details', el('p', { class: 'pre-wrap mb-0', text: e.scope || 'No scope written.' }));

    // Totals
    const row = (label, value, cls = '') => el('div', { class: `d-flex justify-content-between py-1 ${cls}` }, el('span', { text: label }), el('span', { text: value }));
    const totalsCard = el('div', { class: 'card card-body mb-3 border-primary' }, el('h3', { class: 'h5', text: 'Totals' }),
      ...(admin ? Object.entries(t.byKind).filter(([, v]) => v).map(([k, v]) => row(`${kindLabel(k)} (cost)`, usd(v), 'text-muted small')) : []), admin ? row('Your cost', usd(t.costCents), 'text-muted small') : null,
      row('Subtotal', usd(t.subtotalCents)), t.contingencyCents ? row('Contingency', usd(t.contingencyCents)) : null, t.discountCents ? row('Discount', `-${usd(t.discountCents)}`) : null, t.taxCents ? row('Sales tax', usd(t.taxCents)) : null,
      row('Total', usd(t.totalCents), 'fw-bold fs-4 border-top'), row('Deposit', usd(t.depositCents)), admin ? row('Profit', `${usd(t.profitCents)} (${t.marginPct}%)`, 'text-success') : null,
      e.status === 'accepted' ? row('Paid / balance', `${usd(t.paidCents)} / ${usd(t.balanceCents)}`) : null);

    // Admin workflow
    const flow = [];
    if (admin) {
      if (['draft', 'sent'].includes(e.status)) flow.push(btn(e.status === 'sent' ? 'Resend to customer' : 'Send to customer', async () => { await send(`${base}/send`); notice('success', 'Estimate emailed. The customer can review, sign and pay in their account.'); await refresh(); }, 'btn-brass'));
      if (['sent', 'declined'].includes(e.status)) flow.push(btn('Reopen as draft', async () => { await send(`${base}/reopen`); await refresh(); }));
      if (e.status !== 'accepted' && e.status !== 'void') flow.push(btn('Void', async () => { if (confirm('Void this estimate?')) { await send(`${base}/void`); await refresh(); } }, 'btn-outline-danger'));
      if (e.status !== 'accepted') flow.push(btn('Delete', async () => { if (confirm('Delete this estimate permanently?')) { await send(`${base}/delete`); location.hash = '#list'; } }, 'btn-outline-danger'));
      if (e.status === 'accepted') { flow.push(btn('Change order', async () => { const r = await send(`${base}/change-order`); location.hash = `#e/${r.id}`; }));
        if (!e.jobId) flow.push(btn('Create job', async () => { await send(`${base}/job`); notice('success', 'Job created. Assign crew in Admin \u2192 Jobs.'); await refresh(); }, 'btn-success')); }
    }
    flow.push(btn('Duplicate', async () => { const r = await send(`${base}/duplicate`); location.hash = `#e/${r.id}`; }));
    flow.push(el('a', { class: 'btn btn-outline-dark', href: `${base}/pdf`, target: '_blank', rel: 'noopener', text: 'PDF' }));

    // Record what the job really cost so the estimator learns (admin)
    const toolsCard = (() => {
      const body = el('div', { class: 'mt-2' });
      let loaded = false;
      const draw = async () => {
        const d = await api(`${base}/tools`);
        body.replaceChildren(el('p', { class: 'small text-muted', text: d.jobId ? 'This list is on the crew job page. Employees tick items off as they pack the truck.' : 'Create the job after the customer signs and this list goes to the crew automatically.' }),
          ...[...new Set(d.tools.map(t => t.group))].map(g => el('div', { class: 'mb-2' }, el('strong', { text: g }), el('ul', { class: 'mb-0 small' }, d.tools.filter(t => t.group === g).map(t => el('li', { text: `${t.name}${t.qty > 1 ? ` x${t.qty}` : ''} (${d.labels[t.src]})${t.note ? `: ${t.note}` : ''}` }))))),
          admin && d.jobId ? btn('Update the crew list from this estimate', async () => { await send(`${base}/tools`, {}); await draw(); }) : null);
      };
      return el('details', { class: 'card card-body mb-3', ontoggle: async ev => { if (ev.target.open && !loaded) { loaded = true; try { await draw(); } catch (err) { loaded = false; body.textContent = err.message; } } } }, el('summary', { class: 'h6', text: 'Tools needed for this job' }), body);
    })();
    const outcomeCard = admin && ['accepted', 'sent'].includes(e.status) ? (() => {
      const actual = field('What the job really cost you ($): materials, labor, subs, rentals', { type: 'number', inputmode: 'decimal', min: '0', step: '0.01' }), hours = field(data.crew ? 'Total labor hours (GPS-tracked time is filled in)' : 'Total labor hours', { type: 'number', inputmode: 'decimal', min: '0', step: '0.5', value: String(data.crew?.trackedHours || 0) }), notes = field('What surprised you?', { maxlength: 1000 }, 'textarea');
      const per = sections.filter(sec => lines.some(l => l.section === sec && !l.optional)).map(sec => ({ sec, f: field(`${sec}: actual cost ($, optional)`, { type: 'number', inputmode: 'decimal', min: '0', step: '0.01' }) }));
      return el('details', { class: 'card card-body mb-3' }, el('summary', { class: 'h6', text: 'Teach the AI estimator: record real job costs' }),
        el('p', { class: 'small text-muted mt-2', text: 'After the job, enter what it really cost. The estimator compares this with its own prediction and gets more accurate on similar jobs. Section costs are optional but make it learn faster.' }),
        data.crew ? crewBlock(data.crew) : el('p', { class: 'small text-muted', text: 'No clocked-in crew time is linked to this job yet. Link the estimate to a job and have employees clock in on it to record who did the work.' }),
        actual.wrap, hours.wrap, el('div', { class: 'row' }, ...per.map(x => el('div', { class: 'col-md-6' }, x.f.wrap))), notes.wrap,
        btn('Save actual results', async () => { const r = await send(`${base}/outcome`, { actualCost: Number(actual.ctl.value), actualHours: Number(hours.ctl.value), notes: notes.ctl.value, sections: per.map(x => ({ section: x.sec, cost: x.f.ctl.value })) }); notice('success', `Saved. The estimator has now learned from ${r.learnedJobs} finished job${r.learnedJobs === 1 ? '' : 's'}.`); }, 'btn-primary'));
    })() : null;

    // Quick estimator regenerate
    const regen = editable ? (() => {
      const tier = select('Finish level', [['good', 'Good'], ['better', 'Better'], ['best', 'Best']], 'better'), floor = field('Floor sq ft', { type: 'number', value: '40' }), wall = field('Wall tile sq ft', { type: 'number', value: '80' }), shower = select('Shower', [['walk_in', 'Walk-in'], ['tub_surround', 'Tub surround'], ['none', 'None']], 'walk_in');
      return el('details', { class: 'card card-body mb-3' }, el('summary', { class: 'h6', text: 'Re-run quick estimator' }), el('p', { class: 'small text-muted mt-2', text: 'Adds the standard bathroom scope for these measurements. Replaces existing lines when checked.' }),
        el('div', { class: 'row' }, ...[tier, floor, wall, shower].map(f => el('div', { class: 'col-6' }, f.wrap))), (() => { const rep = check('Replace existing lines'), gut = check('Full remodel (gut to the studs)'); return el('div', {}, rep.wrap, gut.wrap, btn('Generate', async () => { await send(`${base}/generate`, { replace: rep.ctl.checked, inputs: { fullRemodel: gut.ctl.checked, tier: tier.ctl.value, floorSf: Number(floor.ctl.value), wallTileSf: Number(wall.ctl.value), shower: shower.ctl.value, demo: true, floorTile: true, toilet: true, drywall: true, fan: true, paint: true, permit: true, niche: true } }); await refresh(); }, 'btn-primary')); })());
    })() : null;

    // Payments & documents (admin)
    let paymentsCard = null, docsCard = null;
    if (admin && e.status === 'accepted') {
      const pay = { amount: field('Amount ($)', { type: 'number', inputmode: 'decimal', step: '0.01', min: '0.01' }), method: field('Method', { maxlength: 60, placeholder: 'Check, cash, Zelle' }), memo: field('Memo', { maxlength: 300 }) };
      paymentsCard = card('Payments', ...data.payments.map(p => el('div', { class: 'd-flex justify-content-between align-items-center border-bottom py-1' }, el('span', { text: `${day(p.paidOn)} \u00b7 ${usd(p.amountCents)} \u00b7 ${p.method || 'payment'}` }), btn('Remove', async () => { if (confirm('Remove this payment?')) { await send(`${base}/payments/${p.id}/delete`); await refresh(); } }, 'btn-sm btn-outline-danger'))),
        el('div', { class: 'mt-3' }, ...Object.values(pay).map(f => f.wrap), btn('Record payment', async () => { await send(`${base}/payments`, { amount: Number(pay.amount.ctl.value), method: pay.method.ctl.value, memo: pay.memo.ctl.value }); await refresh(); }, 'btn-primary')));
    }
    if (admin && e.status !== 'void') {
      const tpl = select('Add a legal document', [['', 'Choose a template...'], ...(boot_.templates || []).map(k => [k, k.replace('_', ' ')])], '');
      docsCard = card('Legal documents for customer signature', ...data.documents.map(x => el('div', { class: 'border-bottom py-2 d-flex justify-content-between align-items-center gap-2' }, el('span', {}, el('strong', { text: x.title }), el('span', { class: 'd-block small text-muted', text: x.status === 'signed' ? `Signed by ${x.signedName} ${day(x.signedAt)}` : x.status })),
        el('span', { class: 'd-flex gap-2' }, el('a', { class: 'btn btn-sm btn-outline-dark', href: `${base}/documents/${x.id}/pdf`, target: '_blank', rel: 'noopener', text: 'PDF' }), x.status === 'pending' ? btn('Void', async () => { await send(`${base}/documents/${x.id}/void`); await refresh(); }, 'btn-sm btn-outline-danger') : null))),
        el('div', { class: 'mt-3' }, tpl.wrap, btn('Add document', async () => { if (!tpl.ctl.value) throw new Error('Choose a template first.'); await send(`${base}/documents`, { template: tpl.ctl.value }); notice('success', 'Added. The customer sees it in their account.'); await refresh(); }, 'btn-primary')),
        el('p', { class: 'small text-muted mt-2 mb-0', text: 'Templates are general starting points. Have an attorney review them for your state.' }));
    }

    // Permits (admin edits, staff view)
    const pBase = `${base}/permits`, permits = data.permits || [], pm_ = data.permitMeta || { types: [], statuses: {}, results: {} };
    const permitRow = x => {
      const status = select('Status', Object.entries(pm_.statuses), x.status), num = field('Permit number', { maxlength: 60, value: x.number }), fee = field('Fee ($)', { type: 'number', inputmode: 'decimal', min: '0', step: '0.01', value: x.feeCents ? String(x.feeCents / 100) : '' });
      const applied = field('Applied on', { type: 'date', value: x.appliedOn }), issued = field('Issued on', { type: 'date', value: x.issuedOn }), expires = field('Expires on', { type: 'date', value: x.expiresOn });
      const cnote = field('Note shown to the customer', { maxlength: 500, value: x.customerNote }), inote = field('Internal note', { maxlength: 1000, value: x.internalNote || '' });
      const insName = field('Add inspection', { maxlength: 120, placeholder: 'e.g. Rough plumbing' }), insDate = field('Scheduled for', { type: 'date' });
      return el('details', { class: 'border rounded p-2 mb-2' },
        el('summary', { class: 'fw-bold', text: `${x.type}${x.number ? ` #${x.number}` : ''} \u00b7 ${x.statusLabel}${x.city ? ` \u00b7 ${x.city}` : ''}` }),
        el('p', { class: 'small text-muted mt-2 mb-2', text: `${x.description || 'No description'}. City review usually takes ${x.reviewDays[0]} to ${x.reviewDays[1]} business days.` }),
        ...x.inspections.map(i => el('div', { class: 'd-flex flex-wrap justify-content-between align-items-center gap-2 border-bottom py-1' }, el('span', { text: `${i.name}${i.scheduledOn ? ` \u00b7 ${day(i.scheduledOn)}` : ''}` }),
          el('span', { class: 'd-flex gap-1' }, ...Object.entries(pm_.results).map(([k, v]) => btn(v, async () => { await send(`${pBase}/${x.id}/inspections/${i.id}`, { result: k }); await refresh(); }, k === i.result ? 'btn-sm btn-dark' : 'btn-sm btn-outline-dark')), btn('Remove', async () => { await send(`${pBase}/${x.id}/inspections/${i.id}/delete`); await refresh(); }, 'btn-sm btn-outline-danger')))),
        el('div', { class: 'row mt-2' }, ...[insName, insDate].map(f => el('div', { class: 'col-md-6' }, f.wrap))),
        btn('Add inspection', async () => { await send(`${pBase}/${x.id}/inspections`, { name: insName.ctl.value, scheduledOn: insDate.ctl.value }); await refresh(); }),
        el('div', { class: 'row mt-3' }, ...[status, num, fee, applied, issued, expires, cnote, inote].map(f => el('div', { class: 'col-md-6' }, f.wrap))),
        el('div', { class: 'd-flex gap-2' }, btn('Save permit', async () => { await send(`${pBase}/${x.id}`, { status: status.ctl.value, number: num.ctl.value, fee: fee.ctl.value, appliedOn: applied.ctl.value, issuedOn: issued.ctl.value, expiresOn: expires.ctl.value, customerNote: cnote.ctl.value, internalNote: inote.ctl.value }); notice('success', 'Permit saved.'); await refresh(); }, 'btn-primary'),
          btn('Delete', async () => { if (confirm('Delete this permit record?')) { await send(`${pBase}/${x.id}/delete`); await refresh(); } }, 'btn-outline-danger')));
    };
    let permitsCard = null;
    if (e.status !== 'void') {
      const pType = select('Permit type', pm_.types.map(t => [t, t]), pm_.types[0]), pCity = field('City or village', { maxlength: 80, placeholder: 'e.g. Aurora' }), pDesc = field('What it covers', { maxlength: 300, placeholder: 'e.g. Replace tub and move drain' });
      permitsCard = card('Permits and inspections', permits.length ? permits.map(admin ? permitRow : (x => el('p', { class: 'mb-1', text: `${x.type}: ${x.statusLabel}${x.number ? ` #${x.number}` : ''}` }))) : el('p', { class: 'text-muted', text: 'No permits tracked yet. Use the permit guidance in the quick estimator to see what this job needs.' }),
        admin ? el('div', { class: 'mt-3' }, el('div', { class: 'row' }, ...[pType, pCity, pDesc].map(f => el('div', { class: 'col-md-4' }, f.wrap))), btn('Track a permit', async () => { await send(pBase, { type: pType.ctl.value, city: pCity.ctl.value, description: pDesc.ctl.value }); await refresh(); }, 'btn-primary')) : null,
        el('p', { class: 'small text-muted mt-2 mb-0', text: 'Customers see the permit status, number, dates and inspections (not internal notes) in their account.' }));
    }

    page('list', el('p', {}, el('a', { href: '#list', text: '\u2190 All estimates' })),
      el('div', { class: 'd-flex flex-wrap justify-content-between gap-2 mb-2' }, el('h2', { class: 'h4 mb-0', text: `${e.number} \u00b7 ${e.title}` }), badge(e.status)),
      el('p', { class: 'text-muted', text: `${data.customer ? `${data.customer.name}${data.customer.phone ? ` \u00b7 ${data.customer.phone}` : ''}${data.customer.address ? ` \u00b7 ${data.customer.address}` : ''}` : 'No customer attached'}${e.signedAt ? ` \u00b7 signed ${day(e.signedAt)}` : ''}` }),
      e.status === 'accepted' ? el('div', { class: 'alert alert-info', text: 'This estimate is signed and locked. Use a change order for scope changes.' }) : null,
      !data.customer && editable ? customerAttach(base, refresh) : null,
      totalsCard, ...(secCards.length ? secCards : [el('p', { class: 'text-muted', text: 'No line items yet. Add some below or re-run the quick estimator.' })]), adders, regen, permitsCard, toolsCard, outcomeCard, detailsCard, paymentsCard, docsCard,
      el('div', { class: 'd-flex flex-wrap gap-2 mb-4' }, ...flow));
  }

  function customerAttach(base, refresh) {
    const search = field('Attach a customer', { type: 'search', placeholder: 'Name, email or phone' }), results = el('div', { class: 'list-group' });
    let timer;
    search.ctl.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(act(async () => {
      const { customers } = await api(`/api/estimator/customers?q=${encodeURIComponent(search.ctl.value)}`);
      results.replaceChildren(...customers.map(c => el('button', { type: 'button', class: 'list-group-item list-group-item-action', text: c.name, onclick: act(async () => { await send(base, { customerId: c.id }); await refresh(); }) })));
    }), 250); });
    return card(null, search.wrap, results);
  }

  // ---------- AI learning (admin)
  async function tasks() {
    const d = await api('/api/estimator/handyman/tasks');
    const rows = d.tasks.map(t => {
      const hrs = el('input', { class: 'form-control form-control-sm', type: 'number', step: '0.05', min: '0', value: String(t.hrs), 'aria-label': `Hours per ${t.unit}` });
      const mat = el('input', { class: 'form-control form-control-sm', type: 'number', step: '0.01', min: '0', value: (t.matCents / 100).toFixed(2), 'aria-label': 'Material cost' });
      const save = btn('Save', async () => { await send('/api/estimator/handyman/tasks', { code: t.code, hrs: hrs.value, mat: mat.value }); notice('success', 'Saved.'); }, 'btn-sm btn-outline-secondary');
      return el('tr', {}, el('td', { text: t.category }), el('td', { text: `${t.name} (${t.unit})` }), el('td', {}, hrs), el('td', {}, mat), el('td', {}, save));
    });
    const name = field('New task name', { maxlength: 200 }), cat = select('Category', d.categories.map(c => [c, c])), unit = select('Unit', ['ea', 'sf', 'lf', 'hr', 'ls'].map(u => [u, u])), nh = field('Hours per unit', { type: 'number', step: '0.05', min: '0', value: '1' }), nm = field('Material $ per unit', { type: 'number', step: '0.01', min: '0', value: '0' });
    page('tasks', card('Handyman task prices', el('p', { class: 'small text-muted', text: 'Reference hours and Home Depot material prices. Edit them to match your costs. Labor rates are in Defaults.' }),
      el('div', { class: 'table-responsive' }, el('table', { class: 'table table-sm align-middle' }, el('thead', {}, el('tr', {}, ...['Category', 'Task', 'Hours', 'Material $', ''].map(h => el('th', { text: h })))), el('tbody', {}, ...rows)))),
      card('Add a custom task', name.wrap, cat.wrap, unit.wrap, nh.wrap, nm.wrap, btn('Add task', async () => { await send('/api/estimator/handyman/tasks', { name: name.ctl.value, category: cat.ctl.value, unit: unit.ctl.value, hrs: nh.ctl.value, mat: nm.ctl.value }); await tasks(); }, 'btn-brass')));
  }

  const crewBlock = c => el('div', { class: 'border rounded p-2 mb-3 small' }, el('strong', { text: `Crew on this job (GPS-tracked): ${c.trackedHours} hrs, ${c.crewSize} ${c.crewSize === 1 ? 'person' : 'people'}, ${c.workDays} work day${c.workDays === 1 ? '' : 's'} (${c.firstDay} to ${c.lastDay})` }),
    ...c.employees.map(p => el('div', { text: `${p.name}${p.role ? ` (${p.role})` : ''}: ${p.hours} hrs over ${p.days.length} day${p.days.length === 1 ? '' : 's'}: ${p.days.join(', ')}` })));

  async function learning() {
    const d = await api('/api/estimator/learning');
    const pctText = v => (v === null ? 'n/a' : `${v}%`);
    const rows = Object.entries(d.sections).map(([k, v]) => el('li', { text: `${k}: ${v > 1 ? '+' : ''}${Math.round((v - 1) * 100)}%` }));
    page('learning',
      card('What the estimator has learned', el('p', { text: `Finished jobs recorded: ${d.jobs}. Overall price correction: ${d.jobs ? `${d.overall > 1 ? '+' : ''}${Math.round((d.overall - 1) * 100)}%` : 'none yet'}.` }),
        el('p', { text: `Accuracy on the last ${d.accuracy.jobs} jobs: the built-in price book was off by ${pctText(d.accuracy.baseErrorPct)}, the learning estimator was off by ${pctText(d.accuracy.adjustedErrorPct)}.` }),
        rows.length ? el('ul', {}, ...rows) : el('p', { class: 'text-muted small', text: 'Section corrections appear after at least two jobs record section costs.' }),
        el('p', { class: 'small text-muted', text: 'Open a signed estimate and use "Teach the AI estimator" after the job is done. Corrections are limited to -25% and +40% so one odd job cannot throw it off.' })),
      card('Photo estimating', el('p', { class: d.aiPhotos ? 'text-success' : 'text-muted', text: d.aiPhotos ? 'AI photo analysis is on. Use it on the New estimate page.' : 'AI photo analysis is off. Set AI_API_KEY on the server to turn it on.' })),
      card('What the crew reports from the field', el('p', { class: 'small', text: `${d.field.reports} daily check-ins on ${d.field.jobs} jobs; ${d.field.delayed} behind schedule, ${d.field.blocked} blocked, ${d.field.withProblems} with problems; ${d.field.media} photos and videos stored.` }),
        ...(d.field.liabilities.length ? d.field.liabilities.map(l => el('div', { class: 'small', text: `Liability records, ${l.type.replace(/_/g, ' ')}: ${l.count} (${l.consented} with homeowner consent)` })) : [el('p', { class: 'small text-muted', text: 'No liability records yet.' })]),
        ...d.field.recentProblems.map(r => el('div', { class: 'small border-top py-1', text: `${r.date} ${r.title}: ${r.problems}` }))),
      card('Who did the work (from GPS time clock)', ...(d.crew.length ? d.crew.map(p => el('div', { class: 'border-bottom py-2 small', text: `${p.name}: ${p.jobs} finished job${p.jobs === 1 ? '' : 's'}, ${p.hours} hrs, last worked ${p.lastDay || 'n/a'} (${Object.entries(p.jobTypes).map(([k, v]) => `${k} x${v}`).join(', ')})` })) : [el('p', { class: 'text-muted small mb-0', text: 'Crew data appears once employees clock in on jobs and you record the job results.' })])),
      card('Recent finished jobs', ...(d.recent.length ? d.recent.map(r => el('div', { class: 'border-bottom py-2 small' }, el('a', { href: `#e/${r.estimateId}`, text: `Estimate #${r.estimateId}` }), el('div', { text: `Base estimate ${usd(r.baseCostCents)} \u00b7 predicted ${usd(r.predictedCostCents)} \u00b7 actual ${usd(r.actualCostCents)} \u00b7 ${r.actualHours} hrs` }), r.crew ? el('div', { text: `Crew: ${r.crew.employees.map(p => `${p.name} ${p.hours}h`).join(', ')} \u00b7 ${r.crew.firstDay} to ${r.crew.lastDay}` }) : null, r.notes ? el('div', { class: 'text-muted', text: r.notes }) : null)) : [el('p', { class: 'text-muted', text: 'No finished jobs recorded yet.' })])));
  }

  // ---------- Price book (admin)
  async function priceBook() {
    const { catalog, settings: st } = await api('/api/estimator/bootstrap'); boot_.catalog = catalog;
    const search = field('Search', { type: 'search' }), out = el('div');
    const draw = () => {
      const term = search.ctl.value.trim().toLowerCase();
      out.replaceChildren(...catalog.filter(c => !term || `${c.name} ${c.category}`.toLowerCase().includes(term)).slice(0, 60).map(c => {
        const cost = field('Unit cost ($)', { type: 'number', step: '0.01', min: '0', value: (c.costCents / 100).toFixed(2) }), name = field('Name', { value: c.name, maxlength: 200 }), waste = field('Waste %', { type: 'number', step: '0.5', min: '0', value: String(c.wasteBp / 100) });
        return el('details', { class: 'border-bottom py-2' }, el('summary', { class: 'd-flex justify-content-between gap-2' }, el('span', { text: `${c.name}${c.tier ? ` (${c.tier})` : ''}` }), el('span', { class: 'text-nowrap', text: `${usd(c.costCents)}/${c.unit}` })),
          el('div', { class: 'pt-2' }, name.wrap, el('div', { class: 'row' }, el('div', { class: 'col-6' }, cost.wrap), el('div', { class: 'col-6' }, waste.wrap)), el('div', { class: 'd-flex gap-2' },
            btn('Save', async () => { await send(`/api/estimator/catalog/${c.id}`, { code: c.code, category: c.category, name: name.ctl.value, kind: c.kind, unit: c.unit, tier: c.tier, cost: Number(cost.ctl.value), wastePct: Number(waste.ctl.value) }); notice('success', 'Price saved.'); await priceBook(); }, 'btn-primary'),
            btn('Remove', async () => { if (confirm('Remove this item from the price book?')) { await send(`/api/estimator/catalog/${c.id}/delete`); await priceBook(); } }, 'btn-outline-danger'))));
      }));
    };
    search.ctl.addEventListener('input', draw);
    const n = { name: field('Name', { maxlength: 200 }), category: field('Category', { maxlength: 100 }), kind: select('Type', Object.entries(boot_.kinds && Object.keys(boot_.kinds).length ? boot_.kinds : KIND_FALLBACK), 'material'), unit: select('Unit', (boot_.units || ['ea']).map(u => [u, u]), 'ea'), cost: field('Unit cost ($)', { type: 'number', step: '0.01', min: '0' }) };
    page('book', card('Add price book item', el('div', { class: 'row' }, ...Object.values(n).map(f => el('div', { class: 'col-6' }, f.wrap))),
      btn('Add item', async () => { await send('/api/estimator/catalog', { name: n.name.ctl.value, category: n.category.ctl.value, kind: n.kind.ctl.value, unit: n.unit.ctl.value, cost: Number(n.cost.ctl.value), tier: '', code: '' }); await priceBook(); }, 'btn-primary')),
      card('Your costs', el('p', { class: 'small text-muted', text: 'These are your costs. Markup, contingency and tax are added on each estimate. Starter prices are Home Depot reference prices for our service area. Update them to match your suppliers.' }), el('p', { class: 'small', text: `Prices last updated ${st.prices_updated || 'n/a'}. ${st.price_source || ''}` }), search.wrap, out));
    draw();
  }

  // ---------- Defaults (admin)
  async function defaults() {
    const { settings } = await api('/api/estimator/bootstrap');
    const f = { overhead_pct: field('Overhead % (advisor)', { type: 'number', step: '0.1', min: '0', value: settings.overhead_pct }), target_margin_pct: field('Target margin % (advisor)', { type: 'number', step: '0.1', min: '0', value: settings.target_margin_pct }), min_margin_pct: field('Minimum margin % / walk-away (advisor)', { type: 'number', step: '0.1', min: '0', value: settings.min_margin_pct }), finance_apr: field('Financing example APR %', { type: 'number', step: '0.01', min: '0', value: settings.finance_apr }), water_cost_per_1000gal: field('Water and sewer $ per 1,000 gal', { type: 'number', step: '0.01', min: '0', value: settings.water_cost_per_1000gal }), kwh_cost: field('Electricity $ per kWh', { type: 'number', step: '0.01', min: '0', value: settings.kwh_cost }), markup_pct: field('Default markup %', { type: 'number', step: '0.1', min: '0', value: settings.markup_pct }), tax_pct: field('Sales tax % on materials', { type: 'number', step: '0.01', min: '0', value: settings.tax_pct }), contingency_pct: field('Contingency %', { type: 'number', step: '0.1', min: '0', value: settings.contingency_pct }), deposit_pct: field('Deposit %', { type: 'number', step: '1', min: '0', value: settings.deposit_pct }), region_factor_pct: field('Local labor rate factor % (100 = price book)', { type: 'number', step: '1', min: '50', max: '200', value: settings.region_factor_pct || '100' }), handyman_rate: field('Handyman rate ($/hr)', { type: 'number', step: '1', min: '20', max: '400', value: settings.handyman_rate || '75' }), licensed_rate: field('Licensed plumber/electrician rate ($/hr)', { type: 'number', step: '1', min: '40', max: '500', value: settings.licensed_rate || '125' }), handyman_min_hours: field('Minimum service visit (hours)', { type: 'number', step: '0.5', min: '0', max: '8', value: settings.handyman_min_hours || '2' }), weekend_premium_pct: field('Saturday premium % (when Saturday work is on)', { type: 'number', step: '1', min: '0', max: '100', value: settings.weekend_premium_pct || '0' }), work_start: field('Work day starts (24-hour)', { type: 'time', value: settings.work_start || '08:00' }), work_end: field('Work day ends (24-hour)', { type: 'time', value: settings.work_end || '16:30' }), lunch_min: field('Unpaid lunch (minutes)', { type: 'number', step: '5', min: '0', value: settings.lunch_min || '30' }), break_min: field('Paid breaks per day (minutes)', { type: 'number', step: '5', min: '0', value: settings.break_min || '30' }), work_saturday: select('Weekend work', [['0', 'Monday to Friday only'], ['1', 'Include Saturdays']], settings.work_saturday || '0'), valid_days: field('Estimate valid for (days)', { type: 'number', step: '1', min: '1', value: settings.valid_days }), exclusions: field('Standard exclusions', { rows: 4 }, 'textarea'), terms: field('Standard terms', { rows: 6 }, 'textarea') };
    f.exclusions.ctl.value = settings.exclusions || ''; f.terms.ctl.value = settings.terms || '';
    page('settings', card('Defaults for new estimates', ...Object.values(f).map(x => x.wrap), btn('Save defaults', async () => { await send('/api/estimator/settings', Object.fromEntries(Object.entries(f).map(([k, v]) => [k, v.ctl.value]))); boot_ = await api('/api/estimator/bootstrap'); notice('success', 'Saved. New estimates use these values.'); }, 'btn-primary')));
  }

  start().catch(e => { root.className = 'alert alert-danger'; root.textContent = e.message; });
})();
