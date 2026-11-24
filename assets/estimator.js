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
  const badge = s => el('span', { class: `badge text-bg-${COLORS[s] || 'secondary'}`, text: s });
  const KIND_FALLBACK = { material: 'Materials', labor: 'Labor', sub: 'Subcontractor', equipment: 'Equipment', fee: 'Fees & permits', other: 'Other' };

  let me = null, boot_ = null, alertBox = el('div', { class: 'mb-3', role: 'status', 'aria-live': 'polite' });
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
  const card = (title, ...kids) => el('div', { class: 'card card-body mb-3' }, title ? el('h3', { class: 'h5', text: title }) : null, ...kids);
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
    root.replaceChildren(el('div', { class: 'row justify-content-center' }, el('div', { class: 'col-lg-5' }, el('form', { class: 'card card-body p-4 shadow', onsubmit: submit, novalidate: true },
      el('h2', { class: 'h4', text: 'Estimator sign in' }), email.wrap, password.wrap, el('button', { class: 'btn btn-brass btn-lg', type: 'submit', text: 'Sign in' }), status))));
  }

  const header = current => el('div', { class: 'mb-3' },
    el('div', { class: 'd-flex flex-wrap justify-content-between align-items-center gap-2 mb-2' }, el('span', { class: 'text-muted', text: `${me.name} \u00b7 ${me.role}` }),
      btn('Sign out', async () => { await send('/api/auth/logout', {}); boot_ = null; await start(); }, 'btn-sm btn-outline-secondary')),
    el('ul', { class: 'nav nav-pills flex-wrap gap-1' }, [['list', 'Estimates'], ['new', 'New estimate'], ...(me.role === 'admin' ? [['book', 'Price book'], ['learning', 'AI learning'], ['tasks', 'Handyman tasks'], ['settings', 'Defaults']] : [])].map(([id, label]) =>
      el('li', { class: 'nav-item' }, el('a', { class: `nav-link${id === current ? ' active' : ''}`, href: `#${id}`, text: label })))));

  const page = (current, ...kids) => { alertBox.className = 'mb-3'; alertBox.textContent = ''; root.replaceChildren(header(current), alertBox, ...kids); };

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
    const out = el('div');
    const load = act(async () => {
      const { estimates } = await api(`/api/estimator/estimates?q=${encodeURIComponent(q.ctl.value)}&status=${status.ctl.value}`);
      out.replaceChildren(...(estimates.length ? estimates.map(e => el('a', { class: 'card card-body mb-2 text-decoration-none text-reset', href: `#e/${e.id}` },
        el('div', { class: 'd-flex justify-content-between gap-2' }, el('strong', { text: e.title }), badge(e.status)),
        el('div', { class: 'small text-muted', text: [e.number, e.customerName, day(e.createdAt)].filter(Boolean).join(' \u00b7 ') }),
        el('div', { class: 'fw-bold', text: usd(e.totalCents) }))) : [el('p', { class: 'text-muted', text: 'No estimates yet.' })]));
    });
    let timer;
    q.ctl.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(load, 250); });
    status.ctl.addEventListener('change', load);
    page('list', el('div', { class: 'row g-2' }, el('div', { class: 'col-8' }, q.wrap), el('div', { class: 'col-4' }, status.wrap)), out);
    await load();
  }

  // ---------- New estimate with quick wizard
  async function newEstimate() {
    const title = field('Estimate title', { maxlength: 150, value: 'Bathroom remodel' });
    const search = field('Find customer', { type: 'search', placeholder: 'Name, email or phone' }), results = el('div', { class: 'mb-3' });
    let customerId = null;
    const picked = el('div', { class: 'fw-bold mb-3' });
    const nc = { name: field('New customer name', { maxlength: 120 }), email: field('Email', { type: 'email', maxlength: 200 }), phone: field('Phone', { type: 'tel', maxlength: 40 }), address: field('Address', { maxlength: 300 }) };
    let timer;
    search.ctl.addEventListener('input', () => {
      clearTimeout(timer);
      timer = setTimeout(act(async () => {
        const { customers } = await api(`/api/estimator/customers?q=${encodeURIComponent(search.ctl.value)}`);
        results.replaceChildren(...customers.map(c => el('button', { type: 'button', class: 'list-group-item list-group-item-action w-100 text-start', text: `${c.name}${c.address ? ` \u00b7 ${c.address}` : ''}`, onclick: () => { customerId = c.id; picked.textContent = `Customer: ${c.name}`; results.replaceChildren(); } })));
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
      vanities: field('Vanities', { type: 'number', inputmode: 'numeric', min: '0', max: '4', value: '1' })
    };
    const toggles = { demo: check('Demolition & haul-away', true), niche: check('Shower niche', true), bench: check('Shower bench'), curbless: check('Curbless shower entry'), heatedFloor: check('Heated floor'), newTub: check('New tub'), drywall: check('Drywall repair', true), fan: check('Exhaust fan', true), lighting: check('New lighting', true), paint: check('Paint', true), permit: check('Permit', true), plumbingChanges: check('Relocate plumbing'), fullRemodel: check('Full remodel: gut walls to the studs and floor to the subfloor'), suggestUpgrades: check('Offer optional upgrades to the customer', true) };
    const startDate = field('Planned start date (optional)', { type: 'date' });
    const jobType = select('Job type', [['bathroom', 'Bathroom remodel'], ['handyman', 'Handyman / home repair']], 'bathroom');
    const hm = { qty: {}, city: field('City or village of the job', { maxlength: '80', placeholder: 'e.g. Aurora' }), homeYear: field('Year home was built', { type: 'number', inputmode: 'numeric', min: '1800', max: '2100' }), startDate: field('Planned start date (optional)', { type: 'date' }), condo: check('Condo or HOA building') };
    const handymanBox = el('div', { class: 'd-none' });
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
    const handymanValues = () => ({ jobType: 'handyman', startDate: hm.startDate.ctl.value, city: hm.city.ctl.value, homeYear: hm.homeYear.ctl.value, condo: hm.condo.ctl.checked, tasks: Object.fromEntries(Object.entries(hm.qty).map(([k, c]) => [k, Number(c.value) || 0]).filter(([, n]) => n > 0)) });
    const wizardValues = () => isHandyman() ? handymanValues() : ({ startDate: startDate.ctl.value, ...Object.fromEntries(Object.entries(w).map(([k, v]) => [k, v.ctl.value])), ...Object.fromEntries(Object.entries(toggles).map(([k, v]) => [k, v.ctl.checked])) });
    const advice = el('div', { class: 'small pre-wrap' }), phasesBox = el('div', { class: 'small mt-3' }), preview = el('div', { class: 'fw-bold mb-2' });
    let adviceTimer;
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
    const refresh = () => {
      clearTimeout(adviceTimer);
      adviceTimer = setTimeout(act(async () => {
        const r = await send('/api/estimator/advice', { inputs: wizardValues() });
        preview.textContent = `Estimated price ${usd(r.totalCents)} (${r.lineCount} lines, ${r.optionalCount} optional upgrades). Crew: ${r.crew} people, about ${r.hours} labor hours over ${r.schedule.days} working days. ${r.contingencyPct}% contingency${r.learnedJobs ? `, learned from ${r.learnedJobs} finished job${r.learnedJobs === 1 ? '' : 's'}` : ''}.`;
        advice.textContent = r.notes.join('\n');
        insightBox.replaceChildren(...insightRows(r.insights), ...codeRows(r.codes));
        phasesBox.replaceChildren(...r.schedule.phases.map(p => el('div', { class: 'd-flex justify-content-between gap-2 border-bottom py-1' }, el('span', { text: p.phase }), el('span', { class: 'text-nowrap text-muted', text: p.crew ? `${p.start.slice(5)} \u00b7 ${p.crew} people \u00b7 ${p.hours} hrs` : `${p.start.slice(5)} \u00b7 waiting ${p.days}d` }))));
      }), 400);
    };
    const pdfBtn = btn('Download results PDF', async () => {
      const res = await fetch('/api/estimator/advice/pdf', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: title.ctl.value, inputs: wizardValues() }) });
      if (!res.ok) throw new Error('Could not create the PDF.');
      const url = URL.createObjectURL(await res.blob());
      window.open(url, '_blank', 'noopener'); setTimeout(() => URL.revokeObjectURL(url), 60000);
    }, 'btn-outline-primary w-100 mt-2');
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
    const wizardFields = el('div', {}, el('div', { class: 'row' }, ...[...Object.values(w), startDate].map(f => el('div', { class: 'col-md-6' }, f.wrap))), ...Object.values(toggles).map(t => t.wrap));
    wizardFields.addEventListener('input', refresh); wizardFields.addEventListener('change', refresh);
    handymanBox.addEventListener('input', refresh); handymanBox.addEventListener('change', refresh);
    jobType.ctl.addEventListener('change', () => {
      wizardFields.classList.toggle('d-none', isHandyman()); handymanBox.classList.toggle('d-none', !isHandyman());
      title.ctl.value = isHandyman() ? 'Handyman and home repair' : 'Bathroom remodel'; refresh();
    });
    refresh();
    const quick = check('Pre-fill line items with the quick estimator', true);
    const create = btn('Create estimate', async () => {
      const body = { title: title.ctl.value };
      if (customerId) body.customerId = customerId; else if (nc.name.ctl.value) body.newCustomer = Object.fromEntries(Object.entries(nc).map(([k, v]) => [k, v.ctl.value]));
      if (quick.ctl.checked) body.wizard = wizardValues(); if (fromVision) body.vision = true;
      const { id } = await send('/api/estimator/estimates', body);
      location.hash = `#e/${id}`;
    }, 'btn-brass btn-lg w-100');
    page('new', card('Customer', picked, search.wrap, el('div', { class: 'list-group mb-3' }, results), el('details', {}, el('summary', { class: 'mb-2', text: 'Or add a new customer' }), ...Object.values(nc).map(f => f.wrap))),
      card('Job', jobType.wrap, title.wrap), card('Photo estimate (AI)', el('p', { class: 'small text-muted', text: 'Take 1 to 4 photos of the bathroom. The AI reads the room, fills in the questions below and flags hidden risks. Always check its answers and measure on site.' }), photos, consent.wrap, analyzeBtn, findings), card('Smart estimator', quick.wrap, wizardFields, handymanBox), card('What the estimator did', preview, advice, el('h4', { class: 'h6 mt-3', text: 'Crew and hours by phase' }), phasesBox, insightBox, pdfBtn), create);
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
      const actual = field('What the job really cost you ($): materials, labor, subs, rentals', { type: 'number', inputmode: 'decimal', min: '0', step: '0.01' }), hours = field('Total labor hours', { type: 'number', inputmode: 'decimal', min: '0', step: '0.5', value: '0' }), notes = field('What surprised you?', { maxlength: 1000 }, 'textarea');
      const per = sections.filter(sec => lines.some(l => l.section === sec && !l.optional)).map(sec => ({ sec, f: field(`${sec}: actual cost ($, optional)`, { type: 'number', inputmode: 'decimal', min: '0', step: '0.01' }) }));
      return el('details', { class: 'card card-body mb-3' }, el('summary', { class: 'h6', text: 'Teach the AI estimator: record real job costs' }),
        el('p', { class: 'small text-muted mt-2', text: 'After the job, enter what it really cost. The estimator compares this with its own prediction and gets more accurate on similar jobs. Section costs are optional but make it learn faster.' }),
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

    page('list', el('p', {}, el('a', { href: '#list', text: '\u2190 All estimates' })),
      el('div', { class: 'd-flex flex-wrap justify-content-between gap-2 mb-2' }, el('h2', { class: 'h4 mb-0', text: `${e.number} \u00b7 ${e.title}` }), badge(e.status)),
      el('p', { class: 'text-muted', text: `${data.customer ? `${data.customer.name}${data.customer.phone ? ` \u00b7 ${data.customer.phone}` : ''}${data.customer.address ? ` \u00b7 ${data.customer.address}` : ''}` : 'No customer attached'}${e.signedAt ? ` \u00b7 signed ${day(e.signedAt)}` : ''}` }),
      e.status === 'accepted' ? el('div', { class: 'alert alert-info', text: 'This estimate is signed and locked. Use a change order for scope changes.' }) : null,
      !data.customer && editable ? customerAttach(base, refresh) : null,
      totalsCard, ...(secCards.length ? secCards : [el('p', { class: 'text-muted', text: 'No line items yet. Add some below or re-run the quick estimator.' })]), adders, regen, toolsCard, outcomeCard, detailsCard, paymentsCard, docsCard,
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
      card('Recent finished jobs', ...(d.recent.length ? d.recent.map(r => el('div', { class: 'border-bottom py-2 small' }, el('a', { href: `#e/${r.estimateId}`, text: `Estimate #${r.estimateId}` }), el('div', { text: `Base estimate ${usd(r.baseCostCents)} \u00b7 predicted ${usd(r.predictedCostCents)} \u00b7 actual ${usd(r.actualCostCents)} \u00b7 ${r.actualHours} hrs` }), r.notes ? el('div', { class: 'text-muted', text: r.notes }) : null)) : [el('p', { class: 'text-muted', text: 'No finished jobs recorded yet.' })])));
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
    const f = { markup_pct: field('Default markup %', { type: 'number', step: '0.1', min: '0', value: settings.markup_pct }), tax_pct: field('Sales tax % on materials', { type: 'number', step: '0.01', min: '0', value: settings.tax_pct }), contingency_pct: field('Contingency %', { type: 'number', step: '0.1', min: '0', value: settings.contingency_pct }), deposit_pct: field('Deposit %', { type: 'number', step: '1', min: '0', value: settings.deposit_pct }), region_factor_pct: field('Local labor rate factor % (100 = price book)', { type: 'number', step: '1', min: '50', max: '200', value: settings.region_factor_pct || '100' }), handyman_rate: field('Handyman rate ($/hr)', { type: 'number', step: '1', min: '20', max: '400', value: settings.handyman_rate || '75' }), licensed_rate: field('Licensed plumber/electrician rate ($/hr)', { type: 'number', step: '1', min: '40', max: '500', value: settings.licensed_rate || '125' }), handyman_min_hours: field('Minimum service visit (hours)', { type: 'number', step: '0.5', min: '0', max: '8', value: settings.handyman_min_hours || '2' }), weekend_premium_pct: field('Saturday premium % (when Saturday work is on)', { type: 'number', step: '1', min: '0', max: '100', value: settings.weekend_premium_pct || '0' }), work_start: field('Work day starts (24-hour)', { type: 'time', value: settings.work_start || '08:00' }), work_end: field('Work day ends (24-hour)', { type: 'time', value: settings.work_end || '16:30' }), lunch_min: field('Unpaid lunch (minutes)', { type: 'number', step: '5', min: '0', value: settings.lunch_min || '30' }), break_min: field('Paid breaks per day (minutes)', { type: 'number', step: '5', min: '0', value: settings.break_min || '30' }), work_saturday: select('Weekend work', [['0', 'Monday to Friday only'], ['1', 'Include Saturdays']], settings.work_saturday || '0'), valid_days: field('Estimate valid for (days)', { type: 'number', step: '1', min: '1', value: settings.valid_days }), exclusions: field('Standard exclusions', { rows: 4 }, 'textarea'), terms: field('Standard terms', { rows: 6 }, 'textarea') };
    f.exclusions.ctl.value = settings.exclusions || ''; f.terms.ctl.value = settings.terms || '';
    page('settings', card('Defaults for new estimates', ...Object.values(f).map(x => x.wrap), btn('Save defaults', async () => { await send('/api/estimator/settings', Object.fromEntries(Object.entries(f).map(([k, v]) => [k, v.ctl.value]))); boot_ = await api('/api/estimator/bootstrap'); notice('success', 'Saved. New estimates use these values.'); }, 'btn-primary')));
  }

  start().catch(e => { root.className = 'alert alert-danger'; root.textContent = e.message; });
})();
