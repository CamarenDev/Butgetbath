// Admin portal. All data is inserted with textContent / setAttribute (never innerHTML).
(() => {
  const $ = s => document.querySelector(s);
  const el = (tag, props = {}, ...kids) => {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(props)) { if (v === false || v == null) continue; if (k === 'class') n.className = v; else if (k === 'text') n.textContent = v; else if (k.startsWith('on')) n.addEventListener(k.slice(2), v); else n.setAttribute(k, v === true ? '' : v); }
    n.append(...kids.flat().filter(k => k != null && k !== false));
    return n;
  };
  const SVG = 'http://www.w3.org/2000/svg';
  const sv = (tag, attrs = {}, text) => { const n = document.createElementNS(SVG, tag); for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v); if (text != null) n.textContent = text; return n; };
  const api = async (url, opts = {}) => {
    const r = await fetch(url, opts);
    const d = await r.json().catch(() => ({}));
    if (!r.ok) { const e = new Error(d.error || 'Something went wrong.'); e.status = r.status; throw e; }
    return d;
  };
  const send = (url, method, body) => api(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) });
  const when = v => v ? new Date(v).toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : '';
  const view = $('#view');
  let toastBox;
  const toast = (msg, kind = 'success') => {
    if (!toastBox) { toastBox = el('div', { class: 'toast-container position-fixed bottom-0 end-0 p-3', role: 'status', 'aria-live': 'polite' }); document.body.append(toastBox); }
    const t = el('div', { class: `alert alert-${kind} shadow mb-2`, text: msg });
    toastBox.append(t); setTimeout(() => t.remove(), 3500);
  };
  const guard = fn => async (...a) => { try { await fn(...a); } catch (e) { if (e.status === 401 || e.status === 403) return boot(); toast(e.message, 'danger'); } };
  const input = (label, props = {}, tag = 'input') => {
    const id = 'f' + Math.random().toString(36).slice(2, 8);
    const ctl = el(tag, { class: tag === 'select' ? 'form-select' : 'form-control', id, ...props });
    return { ctl, wrap: el('div', { class: 'mb-3' }, el('label', { class: 'form-label', for: id, text: label }), ctl) };
  };
  const panel = (title, ...kids) => el('section', { class: 'panel' }, title ? el('h2', { class: 'mb-3', text: title }) : null, ...kids);
  const tableOf = (heads, rows) => el('div', { class: 'table-wrap' }, el('table', { class: 'table align-middle mb-0' }, el('thead', {}, el('tr', {}, heads.map(h => el('th', { scope: 'col', text: h })))), el('tbody', {}, rows)));
  const empty = text => el('p', { class: 'text-muted mb-0', text });
  const btn = (text, onclick, cls = 'btn-outline-secondary') => el('button', { type: 'button', class: `btn btn-sm ${cls}`, onclick: guard(onclick), text });
  const badge = (text, cls = 'secondary') => el('span', { class: `badge text-bg-${cls}`, text });

  const SECTIONS = [
    ['dashboard', 'Dashboard', '\u25A6'], ['customers', 'Customers', '\u2616'], ['employees', 'Employees', '\u2692'], ['live', 'Live now', '\u25C9'], ['location', 'Location', '\u25CE'], ['jobs', 'Jobs', '\u2302'], ['estimator', 'Estimator', '\u2630'], ['company', 'Company', '\u25A4'], ['accounting', 'Accounting', '\u0024'], ['zoho', 'Zoho Books', '\u21C5'], ['seo', 'SEO files', '\u2315'], ['security', 'Security log', '\u26E8'], ['holidays', 'Holiday sales', '\u2744'], ['hr', 'HR', '\u270E'], ['knowledge', 'Knowledge base', '\u2139'], ['contacts', 'Contacts', '\u2709'], ['support', 'Support', '\u260E'], ['forum', 'Forum', '\u2756'],
    ['reviews', 'Reviews', '\u2605'], ['projects', 'Projects', '\u25A3'], ['images', 'Images', '\u25A8'], ['visitors', 'Visitors', '\u2197'], ['users', 'Users', '\u263A'], ['settings', 'Settings', '\u2699']
  ];
  let badges = {};
  const GROUPS = [
    ['Overview', ['dashboard', 'company', 'visitors']],
    ['Work', ['customers', 'jobs', 'estimator', 'employees', 'live', 'location']],
    ['Money', ['accounting', 'zoho', 'holidays']],
    ['Inbox', ['contacts', 'support', 'hr']],
    ['Website', ['projects', 'images', 'reviews', 'forum', 'knowledge', 'seo']],
    ['Admin', ['users', 'security', 'settings']]
  ];
  const openGroups = new Set(['Overview', 'Work']);
  const renderNav = current => {
    const nav = $('#admin-nav'); nav.replaceChildren();
    for (const [name, ids] of GROUPS) {
      if (ids.includes(current)) openGroups.add(name);
      const total = ids.reduce((t, id) => t + (badges[id] || 0), 0);
      const d = el('details', { class: 'nav-group', open: openGroups.has(name) ? '' : null, ontoggle: () => { d.open ? openGroups.add(name) : openGroups.delete(name); } },
        el('summary', {}, el('span', { text: name }), total ? el('span', { class: 'nav-badge', text: String(total) }) : null));
      for (const id of ids) {
        const [, label, glyph] = SECTIONS.find(x => x[0] === id), n = badges[id];
        d.append(el('a', { class: `nav-link${id === current ? ' active' : ''}`, href: `#${id}`, 'aria-current': id === current ? 'page' : null }, el('span', { 'aria-hidden': 'true', text: glyph }), label, n ? el('span', { class: 'nav-badge', text: String(n) }) : null));
      }
      nav.append(d);
    }
  };

  // ---------- Dashboard & visitors
  const tile = (cls, n, l) => el('div', { class: 'col-6 col-lg-3' }, el('div', { class: `tile ${cls}` }, el('div', { class: 'n', text: String(n) }), el('div', { class: 'l', text: l })));
  function chart(series) {
    const W = 640, H = 220, P = 28, max = Math.max(4, ...series.map(s => s.views));
    const x = i => P + i * (W - 2 * P) / Math.max(1, series.length - 1), y = v => H - P - v / max * (H - 2 * P);
    const pts = k => series.map((s, i) => `${x(i).toFixed(1)},${y(s[k]).toFixed(1)}`).join(' ');
    const svg = sv('svg', { class: 'chart', viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': 'Page views and visitors for the last 30 days' });
    for (let i = 0; i <= 4; i++) { const v = Math.round(max * i / 4); svg.append(sv('line', { class: 'grid', x1: P, x2: W - P, y1: y(v), y2: y(v) }), sv('text', { x: 2, y: y(v) + 4 }, String(v))); }
    svg.append(sv('polygon', { class: 'area', points: `${P},${H - P} ${pts('views')} ${W - P},${H - P}` }), sv('polyline', { class: 'line1', points: pts('views') }), sv('polyline', { class: 'line2', points: pts('visitors') }));
    svg.append(sv('text', { x: P, y: H - 8 }, series[0].day.slice(5)), sv('text', { x: W - P - 24, y: H - 8 }, series.at(-1).day.slice(5)));
    return svg;
  }
  const bars = (items, empt) => items.length ? el('div', {}, items.map(i => {
    const top = items[0].n;
    const svg = sv('svg', { class: 'bar-track-svg', viewBox: '0 0 100 4', width: '100%', height: '8', preserveAspectRatio: 'none', 'aria-hidden': 'true' });
    svg.append(sv('rect', { width: 100, height: 4, rx: 2, fill: '#eee9ff' }), sv('rect', { width: Math.max(2, i.n / top * 100), height: 4, rx: 2, fill: '#7c5cff' }));
    return el('div', { class: 'mb-2' }, el('div', { class: 'd-flex justify-content-between small' }, el('span', { class: 'text-truncate', text: i.name }), el('b', { text: String(i.n) })), svg);
  })) : empty(empt);

  const dashboard = async () => {
    const s = await api('/api/admin/stats'), c = s.counts;
    badges = { hr: badges.hr, contacts: c.newContacts, support: c.openTickets, reviews: c.pendingReviews };
    view.replaceChildren(
      el('div', { class: 'row g-3 mb-4' }, tile('t1', c.newContacts, 'New contacts'), tile('t2', c.openTickets, 'Open support requests'), tile('t3', c.pendingReviews, 'Reviews to approve'), tile('t4', c.placeholders, 'Placeholder images to replace'),
        tile('t5', c.threads, 'Forum topics'), tile('t6', c.users, 'Registered users'), tile('t1', c.reviews, 'Published reviews'), tile('t2', c.projects, 'Projects shown')),
      panel('Visits (last 30 days)', chart(s.series), el('p', { class: 'mb-1 mt-2 fw-semibold', text: `${s.series.reduce((a, d) => a + d.views, 0)} views, ${s.series.reduce((a, d) => a + d.visitors, 0)} visitor-days, ${Math.round(s.series.reduce((a, d) => a + d.views, 0) / Math.max(1, s.series.length))} views per day on average.` }), el('p', { class: 'small text-muted mb-0', text: 'Purple: page views. Pink: unique visitors per day. Statistics only record visits while visit statistics are turned on in Settings.' })),
      el('div', { class: 'row g-3' }, el('div', { class: 'col-md-6' }, panel('To do', el('ul', { class: 'mb-0' },
        el('li', {}, el('a', { href: '#contacts', text: `${c.newContacts} new contact(s)` })), el('li', {}, el('a', { href: '#reviews', text: `${c.pendingReviews} review(s) waiting` })),
        el('li', {}, el('a', { href: '#images', text: `${c.placeholders} placeholder image(s)` })), el('li', {}, el('a', { href: '#support', text: `${c.openTickets} open support request(s)` }))))),
        el('div', { class: 'col-md-6' }, panel('Forum', el('p', { class: 'mb-1', text: `${c.threads} topics, ${c.posts} replies.` }), el('a', { href: '#forum', text: 'Moderate forum' }))))
    );
    renderNav('dashboard');
  };
  const heatmap = (ins) => {
    const W = 660, H = 230, L = 40, T = 22, cw = (W - L - 6) / 24, ch = 26, max = Math.max(1, ...ins.heat.flat());
    const svg = sv('svg', { class: 'chart', viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': `Visitor heatmap by weekday and hour, ${ins.timezone} time` });
    const hr = h => h === 0 ? '12a' : h < 12 ? `${h}a` : h === 12 ? '12p' : `${h - 12}p`;
    for (let h = 0; h < 24; h += 3) svg.append(sv('text', { x: L + h * cw + 2, y: 14 }, hr(h)));
    ins.heat.forEach((row, d) => {
      svg.append(sv('text', { x: 2, y: T + d * ch + 17 }, ins.dow[d]));
      row.forEach((n, h) => { const r = sv('rect', { x: L + h * cw + 1, y: T + d * ch + 1, width: cw - 2, height: ch - 2, rx: 3, fill: n ? '#7c5cff' : '#eee9ff', 'fill-opacity': n ? (0.2 + 0.8 * n / max).toFixed(2) : 1 }); r.append(sv('title', {}, `${ins.dow[d]} ${hr(h)}: ${n} view${n === 1 ? '' : 's'}`)); svg.append(r); });
    });
    return svg;
  };
  const pageHeatmap = ins => {
    if (!ins.pageHeat.length) return empty('No data yet.');
    const max = Math.max(1, ...ins.pageHeat.flatMap(p => p.cells));
    return el('div', { class: 'table-wrap' }, el('table', { class: 'table table-sm align-middle mb-0' }, el('thead', {}, el('tr', {}, el('th', { scope: 'col', text: 'Page' }), ins.dow.map(d => el('th', { scope: 'col', class: 'text-center', text: d })))),
      el('tbody', {}, ins.pageHeat.map(p => el('tr', {}, el('th', { scope: 'row', class: 'fw-normal text-break', text: p.path }), p.cells.map(n => { const td = el('td', { class: 'text-center', text: n ? String(n) : '', title: `${n} views` }); if (n) td.setAttribute('data-heat', String(Math.ceil(n / max * 4))); return td; }))))));
  };
  let visitDays = 30;
  const visitors = async () => {
    const [s, ins] = await Promise.all([api('/api/admin/stats'), api(`/api/admin/visitors/insights?days=${visitDays}`)]);
    const span = select('Heatmap period', [[7, 'Last 7 days'], [30, 'Last 30 days'], [90, 'Last 90 days']], visitDays);
    span.ctl.addEventListener('change', () => { visitDays = Number(span.ctl.value); guard(visitors)(); });
    view.replaceChildren(
      el('div', { class: 'row g-3 mb-4' }, tile('t1', s.today.views, 'Views today'), tile('t2', s.today.visitors, 'Visitors today'), tile('t3', s.week.views, 'Views, 7 days'), tile('t4', s.month.visitors, 'Visitors, 30 days')),
      panel('Last 30 days', chart(s.series)),
      panel('When visitors browse', el('div', { class: 'd-flex flex-wrap gap-3 align-items-end mb-2' }, span.wrap, el('p', { class: 'mb-3 text-muted', text: ins.busiest ? `${ins.views} views, ${ins.sessions} visits. Busiest: ${ins.busiest.day} around ${ins.busiest.hour % 12 || 12}${ins.busiest.hour < 12 ? 'am' : 'pm'} (${ins.timezone}).` : 'No visits recorded yet.' })), heatmap(ins)),
      panel('Pages by weekday', pageHeatmap(ins)),
      el('div', { class: 'row g-3' }, el('div', { class: 'col-md-4' }, panel('Top pages', bars(s.topPages, 'No data yet.'))), el('div', { class: 'col-md-4' }, panel('Referrers', bars(s.referrers, 'No referrers yet.'))), el('div', { class: 'col-md-4' }, panel('Landing pages', bars(ins.entry, 'No data yet.')))),
      el('div', { class: 'row g-3 mt-0' }, el('div', { class: 'col-md-4' }, panel('Devices', bars(ins.devices, 'No data yet.'))), el('div', { class: 'col-md-4' }, panel('Browsers', bars(ins.browsers, 'No data yet.'))), el('div', { class: 'col-md-4' }, panel('Operating systems', bars(ins.systems, 'No data yet.')))),
      panel(`Recent visits (${ins.sessionsList.length})`, ins.sessionsList.length ? tableOf(['When', 'Device', 'Came from', 'Pages viewed', 'Time on site'], ins.sessionsList.map(v => el('tr', {}, el('td', { text: when(v.first) }), el('td', { text: `${v.device}, ${v.browser} on ${v.os}` }), el('td', { text: v.referrer }), el('td', { class: 'text-break', text: v.pages.join('  \u2192  ') }), el('td', { text: v.views > 1 ? `${Math.floor(v.seconds / 60)}m ${v.seconds % 60}s` : 'single page' })))) : empty('No visits yet.'), el('p', { class: 'small text-muted mt-2 mb-0', text: ins.note }))
    );
  };

  // ---------- Contacts
  const contacts = async () => {
    const { contacts: rows } = await api('/api/admin/contacts');
    const render = () => view.replaceChildren(panel(`Contact submissions (${rows.length})`, rows.length ? el('div', { class: 'd-grid gap-3' }, rows.map(c => {
      const notes = el('textarea', { class: 'form-control mb-2', rows: '2', 'aria-label': `Notes for ${c.name}`, maxlength: '2000' }); notes.value = c.notes;
      const status = el('select', { class: 'form-select form-select-sm w-auto', 'aria-label': `Status for ${c.name}` }, ['new', 'contacted', 'closed'].map(v => el('option', { value: v, text: v, selected: v === c.status })));
      return el('article', { class: 'border rounded-4 p-3' },
        el('div', { class: 'd-flex flex-wrap gap-2 align-items-center mb-1' }, el('strong', { text: c.name }), badge(c.type, 'info'), el('span', { class: 'text-muted small ms-auto', text: when(c.created_at) })),
        el('div', { class: 'small mb-2' }, el('a', { href: `mailto:${c.email}`, text: c.email }), c.phone ? [' \u00B7 ', el('a', { href: `tel:${c.phone.replace(/[^\d+]/g, '')}`, text: c.phone })] : null, [c.location, c.interest].filter(Boolean).length ? ` \u00B7 ${[c.location, c.interest].filter(Boolean).join(' \u00B7 ')}` : ''),
        c.message ? el('p', { class: 'pre-wrap', text: c.message }) : null, notes,
        el('div', { class: 'd-flex flex-wrap gap-2' }, status, btn('Save', async () => { await send(`/api/admin/contacts/${c.id}`, 'POST', { status: status.value, notes: notes.value }); c.status = status.value; c.notes = notes.value; toast('Saved'); }, 'btn-primary'),
          btn('Delete', async () => { if (!confirm('Delete this contact?')) return; await send(`/api/admin/contacts/${c.id}`, 'DELETE'); rows.splice(rows.indexOf(c), 1); render(); }, 'btn-outline-danger')));
    })) : empty('No contact submissions yet.')));
    render();
  };

  // ---------- Support tickets
  const support = async () => {
    const { requests } = await api('/api/admin/requests');
    view.replaceChildren(panel(`Support requests (${requests.length})`, requests.length ? tableOf(['#', 'Request', 'Customer', 'Priority', 'Status', 'Next visit', 'Updated', ''], requests.map(r => el('tr', {},
      el('td', { text: String(r.id) }), el('td', {}, el('strong', { text: r.title }), el('div', { class: 'small text-muted', text: [r.projectType, r.location].filter(Boolean).join(' \u00B7 ') })),
      el('td', {}, r.customer.name, el('div', { class: 'small text-muted', text: r.customer.email })), el('td', {}, badge(r.priorityLabel, { urgent: 'danger', high: 'warning', low: 'secondary' }[r.priority] || 'info')), el('td', {}, badge(r.statusLabel, r.unread ? 'warning' : 'secondary')), el('td', { text: r.nextAppointment ? when(r.nextAppointment) : '\u2014' }), el('td', { text: when(r.lastMessageAt) }),
      el('td', {}, el('a', { class: 'btn btn-sm btn-primary', href: `/account/request/?id=${r.id}`, target: '_blank', rel: 'noopener', text: 'Open' }))))) : empty('No support requests yet.')));
  };

  // ---------- Forum
  const forum = async () => {
    const data = await api('/api/admin/forum');
    const cats = data.categories, threads = data.threads;
    const catSel = (value) => el('select', { class: 'form-select form-select-sm', 'aria-label': 'Category' }, cats.map(c => el('option', { value: c.slug, text: c.name, selected: c.slug === value })));
    const newTitle = input('Title', { maxlength: '140' }), newBody = input('Post as Team (plain text; blank line = new paragraph)', { rows: '6', maxlength: '5000' }, 'textarea'), newCat = input('Category', {}, 'select');
    cats.forEach(c => newCat.ctl.append(el('option', { value: c.slug, text: c.name })));
    const catName = input('New category name', { maxlength: '80' }), catDesc = input('Description', { maxlength: '240' });
    const render = () => view.replaceChildren(
      panel('New topic as Team', newTitle.wrap, newCat.wrap, newBody.wrap, btn('Publish', async () => {
        await send('/api/forum/threads', 'POST', { title: newTitle.ctl.value, body: newBody.ctl.value, category: newCat.ctl.value, asTeam: true });
        toast('Topic published'); forum();
      }, 'btn-primary')),
      panel(`Topics (${threads.length})`, threads.length ? tableOf(['Title', 'Category', 'Replies', 'Status', 'Actions'], threads.map(t => el('tr', {},
        el('td', {}, el('strong', { text: t.title }), t.pinned ? [' ', badge('pinned', 'info')] : null, t.locked ? [' ', badge('locked', 'dark')] : null, el('div', { class: 'small text-muted', text: `${t.author} \u00B7 ${when(t.createdAt)}` })),
        el('td', { text: t.categoryName }), el('td', { text: String(t.replies) }), el('td', {}, badge(t.status, t.status === 'published' ? 'success' : 'warning')),
        el('td', {}, el('div', { class: 'd-flex flex-wrap gap-1' },
          btn(t.pinned ? 'Unpin' : 'Pin', async () => { await send(`/api/admin/forum/threads/${t.id}`, 'POST', { pinned: !t.pinned }); t.pinned = !t.pinned; render(); }),
          btn(t.locked ? 'Unlock' : 'Lock', async () => { await send(`/api/admin/forum/threads/${t.id}`, 'POST', { locked: !t.locked }); t.locked = !t.locked; render(); }),
          btn(t.status === 'published' ? 'Hide' : 'Show', async () => { const s = t.status === 'published' ? 'hidden' : 'published'; await send(`/api/admin/forum/threads/${t.id}`, 'POST', { status: s }); t.status = s; render(); }),
          btn('Replies', () => replies(t)), btn('Edit', () => editThread(t)),
          btn('Delete', async () => { if (!confirm('Delete this topic and its replies?')) return; await send(`/api/admin/forum/threads/${t.id}`, 'DELETE'); threads.splice(threads.indexOf(t), 1); render(); }, 'btn-outline-danger')))))) : empty('No topics.')),
      panel('Categories', cats.length ? el('ul', { class: 'list-group mb-3' }, cats.map(c => el('li', { class: 'list-group-item d-flex justify-content-between align-items-center gap-2' }, el('span', {}, el('strong', { text: c.name }), el('div', { class: 'small text-muted', text: c.description })),
        btn('Delete', async () => { if (!confirm('Delete this category and all its topics?')) return; await send(`/api/admin/forum/categories/${c.id}`, 'DELETE'); forum(); }, 'btn-outline-danger')))) : empty('No categories.'),
        catName.wrap, catDesc.wrap, btn('Add category', async () => { await send('/api/admin/forum/categories', 'POST', { name: catName.ctl.value, description: catDesc.ctl.value }); forum(); }, 'btn-primary'))
    );
    const editThread = t => {
      const title = input('Title', {}), body = input('Body', { rows: '10', maxlength: '5000' }, 'textarea'), cat = catSel(t.category);
      title.ctl.value = t.title;
      api(`/api/forum/threads/${t.id}`).then(d => { body.ctl.value = d.thread.body; });
      view.replaceChildren(panel(`Edit: ${t.title}`, title.wrap, el('div', { class: 'mb-3' }, cat), body.wrap, el('div', { class: 'd-flex gap-2' },
        btn('Save', async () => { await send(`/api/admin/forum/threads/${t.id}`, 'POST', { title: title.ctl.value, body: body.ctl.value, category: cat.value }); toast('Saved'); forum(); }, 'btn-primary'), btn('Cancel', () => render()))));
    };
    const replies = async t => {
      const d = await api(`/api/forum/threads/${t.id}`);
      const reply = input('Reply as Team', { rows: '4', maxlength: '5000' }, 'textarea');
      const draw = () => view.replaceChildren(panel(`Replies: ${t.title}`, d.posts.length ? el('div', { class: 'd-grid gap-2 mb-3' }, d.posts.map(p => el('div', { class: 'border rounded-4 p-3' },
        el('div', { class: 'small text-muted mb-1', text: `${p.author}${p.staff ? ' (staff)' : ''} \u00B7 ${when(p.createdAt)} \u00B7 ${p.status}` }), el('p', { class: 'pre-wrap mb-2', text: p.body }),
        el('div', { class: 'd-flex gap-1' }, btn(p.status === 'published' ? 'Hide' : 'Show', async () => { const s = p.status === 'published' ? 'hidden' : 'published'; await send(`/api/admin/forum/posts/${p.id}`, 'POST', { status: s }); p.status = s; draw(); }),
          btn('Delete', async () => { if (!confirm('Delete this reply?')) return; await send(`/api/admin/forum/posts/${p.id}`, 'DELETE'); d.posts.splice(d.posts.indexOf(p), 1); draw(); }, 'btn-outline-danger'))))) : empty('No replies yet.'),
        reply.wrap, el('div', { class: 'd-flex gap-2' }, btn('Post reply', async () => { await send(`/api/forum/threads/${t.id}/replies`, 'POST', { body: reply.ctl.value, asTeam: true }); toast('Reply posted'); replies(t); }, 'btn-primary'), btn('Back', () => forum()))));
      draw();
    };
    render();
  };

  // ---------- Reviews
  const reviews = async () => {
    const { reviews: rows } = await api('/api/admin/reviews');
    const n = input('Name', { maxlength: '100' }), t = input('Town', { maxlength: '100' }), r = input('Rating (1-5)', { type: 'number', min: '1', max: '5', value: '5' }), x = input('Review text', { rows: '3', maxlength: '1500' }, 'textarea');
    const set = (rv, patch) => async () => { await send(`/api/admin/reviews/${rv.id}`, 'POST', patch); reviews(); };
    view.replaceChildren(
      panel('Add a review', el('div', { class: 'row' }, el('div', { class: 'col-md-4' }, n.wrap), el('div', { class: 'col-md-4' }, t.wrap), el('div', { class: 'col-md-4' }, r.wrap)), x.wrap,
        btn('Publish review', async () => { await send('/api/admin/reviews', 'POST', { name: n.ctl.value, town: t.ctl.value, rating: Number(r.ctl.value), text: x.ctl.value }); reviews(); }, 'btn-primary')),
      panel(`Reviews (${rows.length})`, rows.length ? el('div', { class: 'd-grid gap-3' }, rows.map(rv => el('article', { class: 'border rounded-4 p-3' },
        el('div', { class: 'd-flex flex-wrap gap-2 align-items-center' }, el('strong', { text: rv.name }), el('span', { class: 'text-muted', text: rv.town }), el('span', { 'aria-label': `${rv.rating} stars`, text: '\u2605'.repeat(rv.rating) }), badge(rv.status, rv.status === 'published' ? 'success' : rv.status === 'pending' ? 'warning' : 'secondary'), rv.sample ? badge('sample', 'info') : null, el('span', { class: 'small text-muted ms-auto', text: when(rv.created_at) })),
        el('p', { class: 'pre-wrap my-2', text: rv.text }),
        el('div', { class: 'd-flex flex-wrap gap-1' }, rv.status !== 'published' ? btn('Approve', set(rv, { status: 'published', sample: false }), 'btn-primary') : null, rv.status !== 'hidden' ? btn('Hide', set(rv, { status: 'hidden' })) : null,
          btn('Edit text', async () => { const v = prompt('Review text', rv.text); if (v) await set(rv, { text: v })(); }),
          btn('Delete', async () => { if (!confirm('Delete this review?')) return; await send(`/api/admin/reviews/${rv.id}`, 'DELETE'); reviews(); }, 'btn-outline-danger'))))) : empty('No reviews yet.'))
    );
  };

  // ---------- Projects
  const projects = async () => {
    const { projects: rows } = await api('/api/admin/projects');
    const title = input('Title', { maxlength: '120' }), cat = input('Category (e.g. Shower, Tile)', { maxlength: '60' }), county = input('County', { maxlength: '60' }), summ = input('Summary', { maxlength: '240' }), alt = input('Image description (alt text)', { maxlength: '200' });
    view.replaceChildren(
      panel('Add a project', el('div', { class: 'row' }, [title, cat, county].map(f => el('div', { class: 'col-md-4' }, f.wrap))), summ.wrap, alt.wrap,
        btn('Add project', async () => { await send('/api/admin/projects', 'POST', { title: title.ctl.value, category: cat.ctl.value, county: county.ctl.value, summary: summ.ctl.value, alt: alt.ctl.value }); toast('Added. Upload its photo in Images.'); projects(); }, 'btn-primary')),
      panel(`Projects (${rows.length})`, rows.length ? tableOf(['Project', 'Details', 'Visible', 'Actions'], rows.map(p => el('tr', {},
        el('td', {}, el('strong', { text: p.title }), p.sample ? [' ', badge('sample', 'info')] : null), el('td', { class: 'small', text: [p.category, p.county, p.summary].filter(Boolean).join(' \u00B7 ') }), el('td', {}, badge(p.published ? 'shown' : 'hidden', p.published ? 'success' : 'secondary')),
        el('td', {}, el('div', { class: 'd-flex flex-wrap gap-1' },
          btn(p.published ? 'Hide' : 'Show', async () => { await send(`/api/admin/projects/${p.id}`, 'POST', { published: !p.published }); projects(); }),
          btn('Edit', async () => { const v = prompt('Title', p.title); if (v === null) return; const s = prompt('Summary', p.summary); await send(`/api/admin/projects/${p.id}`, 'POST', { title: v, summary: s ?? p.summary, sample: false }); projects(); }),
          btn('Delete', async () => { if (!confirm('Delete this project?')) return; await send(`/api/admin/projects/${p.id}`, 'DELETE'); projects(); }, 'btn-outline-danger')))))) : empty('No projects.'))
    );
  };

  // ---------- Images
  const images = async () => {
    const { slots } = await api('/api/admin/media');
    const groups = [...new Set(slots.map(s => s.group))];
    const sections = groups.map(g => el('div', { class: 'mb-4' }, el('h2', { class: 'h5 mb-3', text: g }), el('div', { class: 'row g-3' }, slots.filter(s => s.group === g).map(s => {
      const file = el('input', { type: 'file', accept: 'image/jpeg,image/png,image/webp', class: 'form-control form-control-sm', 'aria-label': `Upload image for ${s.label}` });
      const img = el('img', { src: `/media/${s.slot}?v=${encodeURIComponent(s.updatedAt || 'p')}`, alt: `Current image for ${s.label}`, loading: 'lazy', width: '400', height: '250' });
      return el('div', { class: 'col-sm-6 col-xl-4' }, el('div', { class: 'media-card' }, img, el('div', { class: 'body' },
        el('div', { class: 'd-flex justify-content-between gap-2' }, el('strong', { text: s.label }), badge(s.custom ? 'Your image' : 'Placeholder', s.custom ? 'success' : 'warning')), el('div', { class: 'small text-muted', text: `Suggested ratio ${s.ratio}. JPG, PNG or WebP, up to 8 MB.` }), file,
        el('div', { class: 'd-flex gap-2' }, btn('Upload', async () => {
          if (!file.files[0]) return toast('Choose a file first.', 'warning');
          await api(`/api/admin/media/${s.slot}`, { method: 'POST', headers: { 'Content-Type': file.files[0].type }, body: file.files[0] }); toast('Image replaced'); images();
        }, 'btn-primary'), s.custom ? btn('Restore placeholder', async () => { await send(`/api/admin/media/${s.slot}`, 'DELETE'); images(); }) : null))));
    }))));
    view.replaceChildren(panel('Image library', el('p', { class: 'text-muted', text: 'Every image on the website has a placeholder until you upload your own. Replace them here and the site updates immediately.' })), ...sections);
  };

  // ---------- Users
  const users = async () => {
    const { users: rows } = await api('/api/admin/users');
    view.replaceChildren(panel(`Registered users (${rows.length})`, rows.length ? tableOf(['Name', 'Email', 'Phone', 'Requests', 'Status', 'Joined'], rows.map(u => el('tr', {}, el('td', { text: u.name }), el('td', {}, el('a', { href: `mailto:${u.email}`, text: u.email })), el('td', { text: u.phone || '' }), el('td', { text: String(u.requests) }),
      el('td', {}, u.admin ? badge('admin', 'info') : null, ' ', badge(u.verified ? 'verified' : 'unverified', u.verified ? 'success' : 'secondary')), el('td', { text: when(u.created_at) })))) : empty('No users yet.')));
  };

  // ---------- Customers
  const fmtSize = n => n > 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`;
  const customers = async () => {
    const id = Number(location.hash.split('/')[1]);
    return id ? customerDetail(id) : customerList();
  };
  const customerForm = (c, statuses, onSave, label) => {
    const f = {
      name: input('Name', { value: c.name || '', maxlength: 120, required: true }), email: input('Email', { type: 'email', value: c.email || '', maxlength: 200 }),
      phone: input('Phone', { value: c.phone || '', maxlength: 40 }), address: input('Address', { value: c.address || '', maxlength: 300 }),
      status: input('Status', {}, 'select'), notes: input('Private notes', { rows: 3, maxlength: 5000 }, 'textarea')
    };
    for (const s of statuses) f.status.ctl.append(el('option', { value: s, text: s[0].toUpperCase() + s.slice(1), selected: s === (c.status || 'lead') }));
    f.notes.ctl.value = c.notes || '';
    return el('div', {}, el('div', { class: 'row' }, ['name', 'email', 'phone', 'address', 'status'].map(k => el('div', { class: 'col-md-6' }, f[k].wrap))), f.notes.wrap,
      btn(label, () => onSave(Object.fromEntries(Object.entries(f).map(([k, v]) => [k, v.ctl.value]))), 'btn-primary'));
  };
  const customerList = async () => {
    const search = input('Search customers', { type: 'search', placeholder: 'Name, email, phone or address' });
    const holder = el('div');
    const list = input('Show', {}, 'select');
    for (const [v, t] of [['', 'Everyone'], ['leads', 'Leads (potential customers)'], ['website', 'From the website forms'], ['mailing', 'Mailing list (opted in)']]) list.ctl.append(el('option', { value: v, text: t }));
    let statuses = [];
    const load = async () => {
      const r = await api(`/api/admin/customers?q=${encodeURIComponent(search.ctl.value)}&list=${list.ctl.value}`);
      statuses = r.statuses;
      holder.replaceChildren(r.customers.length ? tableOf(['Customer', 'Contact', 'Status', 'Source', 'Files', 'History', 'Updated'], r.customers.map(c => el('tr', {},
        el('td', {}, el('a', { href: `#customers/${c.id}`, class: 'fw-semibold', text: c.name }), el('div', { class: 'small text-muted', text: c.address })),
        el('td', {}, c.email ? el('div', { text: c.email }) : null, el('div', { class: 'small', text: c.phone })), el('td', {}, badge(c.status, c.status === 'active' ? 'success' : c.status === 'lead' ? 'warning' : 'secondary')),
        el('td', {}, c.source ? el('div', { class: 'small', text: c.source.replace('website-', 'Website: ') }) : null, c.mailing ? badge('Mailing list', 'info') : null),
        el('td', { text: String(c.fileCount) }), el('td', { text: String(c.entryCount) }), el('td', { text: when(c.updatedAt) })))) : empty('No customers found.'));
    };
    await load();
    list.ctl.addEventListener('change', guard(load));
    let timer; search.ctl.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(guard(load), 250); });
    view.replaceChildren(
      panel('Add a customer', customerForm({}, statuses, async v => { const r = await send('/api/admin/customers', 'POST', v); location.hash = `#customers/${r.id}`; }, 'Create customer')),
      panel('All customers', el('div', { class: 'd-flex flex-wrap gap-2 align-items-end mb-3' }, el('div', { class: 'flex-grow-1' }, search.wrap), el('div', {}, list.wrap), el('a', { class: 'btn btn-sm btn-outline-primary mb-3', href: '/api/admin/customers/mailing-list.csv', text: 'Export mailing list (CSV)' }), btn('Import users & estimate requests', async () => { const r = await send('/api/admin/customers/import', 'POST'); toast(`${r.added} customer(s) added`); await load(); })), holder));
  };
  const customerDetail = async id => {
    const d = await api(`/api/admin/customers/${id}`), c = d.customer, base = `/api/admin/customers/${id}`;
    const refresh = () => customerDetail(id);
    const fileUrl = f => `/api/admin/customer-files/${f.id}`;
    const fileCard = f => el('div', { class: 'col-6 col-md-4 col-xl-3' }, el('div', { class: 'border rounded p-2 h-100' },
      f.mime.startsWith('image/') ? el('a', { href: fileUrl(f), target: '_blank', rel: 'noopener' }, el('img', { src: fileUrl(f), alt: f.title || f.name, class: 'img-fluid rounded mb-2', loading: 'lazy' })) : null,
      el('div', { class: 'small fw-semibold text-break' }, el('a', { href: fileUrl(f), target: '_blank', rel: 'noopener', text: f.title || f.name })),
      el('div', { class: 'small text-muted', text: `${f.category} \u00B7 ${fmtSize(f.size)} \u00B7 ${when(f.createdAt)}` }),
      el('div', { class: 'form-check mt-2' }, el('input', { class: 'form-check-input', type: 'checkbox', id: `sh-${f.id}`, checked: f.shared, onchange: guard(async e => { await send(`/api/admin/customer-files/${f.id}/share`, 'POST', { shared: e.target.checked }); toast(e.target.checked ? 'Shared with customer' : 'Hidden from customer'); }) }), el('label', { class: 'form-check-label small', for: `sh-${f.id}`, text: 'Customer can see' })),
      btn('Delete', async () => { if (!confirm('Delete this file permanently?')) return; await send(`/api/admin/customer-files/${f.id}/delete`, 'POST'); await refresh(); }, 'btn-outline-danger mt-2')));
    const cat = input('Type', {}, 'select'); for (const k of d.categories) cat.ctl.append(el('option', { value: k, text: k[0].toUpperCase() + k.slice(1) }));
    const ttl = input('Title (optional)', { maxlength: 200 }), pick = input('Files', { type: 'file', multiple: true, accept: 'image/jpeg,image/png,image/webp,application/pdf,.docx,.xlsx' });
    const shareUp = el('input', { class: 'form-check-input', type: 'checkbox', id: 'share-up' });
    const upload = async () => {
      const files = [...pick.ctl.files]; if (!files.length) return toast('Choose at least one file.', 'danger');
      for (const file of files) await api(`${base}/files`, { method: 'POST', headers: { 'X-Filename': encodeURIComponent(file.name), 'X-Category': cat.ctl.value, 'X-Title': encodeURIComponent(ttl.ctl.value), 'X-Shared': shareUp.checked ? '1' : '0' }, body: file });
      toast(`${files.length} file(s) uploaded`); await refresh();
    };
    const kind = input('Type', {}, 'select'); for (const k of d.kinds) kind.ctl.append(el('option', { value: k, text: k[0].toUpperCase() + k.slice(1) }));
    const shareNote = el('input', { class: 'form-check-input', type: 'checkbox', id: 'share-note' });
    const attach = d.files.map(f => ({ f, box: el('input', { class: 'form-check-input', type: 'checkbox', id: `at-${f.id}` }) }));
    const note = input('Details', { rows: 3, maxlength: 5000 }, 'textarea');
    const subj = input('Subject', { maxlength: 200 }), msg = input('Message', { rows: 6, maxlength: 5000 }, 'textarea');
    const kindBadge = { email: 'primary', note: 'secondary', conversation: 'info', call: 'warning', meeting: 'success' };
    view.replaceChildren(
      el('p', {}, el('a', { href: '#customers', text: '\u2190 All customers' })),
      panel(c.name, customerForm(c, d.statuses, async v => { await send(base, 'POST', v); toast('Customer saved'); await refresh(); }, 'Save changes'),
        el('p', { class: 'small mt-3 mb-2', text: `${c.source ? `Came from: ${c.source.replace('website-', 'website ')}. ` : ''}${c.mailing ? `On the mailing list${c.optinAt ? ` since ${c.optinAt.slice(0, 10)}` : ''}.` : 'Not on the mailing list (no marketing email is sent).'}` }),
        btn(c.mailing ? 'Remove from mailing list' : 'Add to mailing list', async () => { await send(`${base}/mailing`, 'POST', { subscribed: !c.mailing }); await refresh(); }, 'btn-outline-secondary'),
        el('div', { class: 'mt-3' }, btn('Delete customer', async () => { if (!confirm('Delete this customer and all their files?')) return; await send(`${base}/delete`, 'POST'); location.hash = '#customers'; }, 'btn-outline-danger'))),
      panel(`Email ${c.name}`, c.email ? el('div', {}, el('p', { class: 'small text-muted', text: `Sends to ${c.email} and saves a copy in the history below.` }), subj.wrap, msg.wrap,
        attach.length ? el('fieldset', { class: 'mb-3' }, el('legend', { class: 'form-label fs-6', text: 'Attach files (up to 10, 20 MB total)' }), attach.map(({ f, box }) => el('div', { class: 'form-check' }, box, el('label', { class: 'form-check-label', for: box.id, text: `${f.title || f.name} (${fmtSize(f.size)})` })))) : null,
        btn('Send email', async () => { const r = await send(`${base}/email`, 'POST', { subject: subj.ctl.value, body: msg.ctl.value, fileIds: attach.filter(a => a.box.checked).map(a => a.f.id) }); toast(r.skipped ? 'Email service not configured: logged only.' : 'Email sent', r.skipped ? 'warning' : 'success'); await refresh(); }, 'btn-primary'))
        : empty('Add an email address to this customer to send email.')),
      panel(`Files, photos & receipts (${d.files.length})`, el('div', { class: 'row g-2 align-items-end mb-3' }, el('div', { class: 'col-md-3' }, cat.wrap), el('div', { class: 'col-md-4' }, ttl.wrap), el('div', { class: 'col-md-5' }, pick.wrap)),
        el('div', { class: 'form-check mb-2' }, shareUp, el('label', { class: 'form-check-label', for: 'share-up', text: 'Let the customer see these files in their account' })),
        btn('Upload', upload, 'btn-primary mb-3'), d.files.length ? el('div', { class: 'row g-3' }, d.files.map(fileCard)) : empty('No files yet. Upload job photos, receipts, contracts and other documents.')),
      panel('Conversations & notes', el('div', { class: 'row g-2' }, el('div', { class: 'col-md-3' }, kind.wrap), el('div', { class: 'col-md-9' }, note.wrap)),
        el('div', { class: 'form-check mb-2' }, shareNote, el('label', { class: 'form-check-label', for: 'share-note', text: 'Let the customer see this entry' })),
        btn('Add to history', async () => { await send(`${base}/entries`, 'POST', { kind: kind.ctl.value, body: note.ctl.value, shared: shareNote.checked }); await refresh(); }, 'btn-primary mb-3'),
        d.entries.length ? el('div', {}, d.entries.map(e => el('div', { class: 'border-top py-2' }, el('div', { class: 'd-flex gap-2 align-items-center small text-muted' }, badge(e.kind, kindBadge[e.kind] || 'secondary'), e.shared ? badge('visible to customer', 'light') : null, el('span', { text: `${e.author} \u00B7 ${when(e.createdAt)}` }),
          el('button', { type: 'button', class: 'btn btn-link btn-sm ms-auto p-0 text-danger', onclick: guard(async () => { if (!confirm('Remove this entry?')) return; await send(`${base}/entries/${e.id}/delete`, 'POST'); await refresh(); }), text: 'Remove' })),
          e.subject ? el('div', { class: 'fw-semibold', text: e.subject }) : null, el('div', { class: 'pre-wrap', text: e.body })))) : empty('Nothing recorded yet.')),
      d.requests.length || d.contacts.length ? panel('Website activity', d.requests.length ? el('ul', {}, d.requests.map(r => el('li', {}, el('a', { href: '#support', text: `Support request: ${r.title}` }), ` (${r.status})`))) : null,
        d.contacts.length ? el('ul', { class: 'mb-0' }, d.contacts.map(k => el('li', { text: `${when(k.createdAt)}: ${k.type} \u2014 ${k.interest || k.message.slice(0, 80)}` }))) : null) : null
    );
  };

  // ---------- Employees, jobs, applications, knowledge base
  const money = c => `$${(c / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const hrs = m => `${(m / 60).toFixed(2).replace(/\.?0+$/, '')} h`;
  const STATUS_COLOR = { active: 'success', inactive: 'secondary', open: 'primary', in_progress: 'info', completed: 'success', cancelled: 'secondary', pending: 'warning', approved: 'success', rejected: 'danger', denied: 'danger', signed: 'success', void: 'secondary', new: 'warning', reviewing: 'info', interview: 'primary', hired: 'success' };
  const sBadge = s => badge(s.replace('_', ' '), STATUS_COLOR[s] || 'secondary');
  const select = (label, options, value) => { const f = input(label, {}, 'select'); for (const [v, t] of options) f.ctl.append(el('option', { value: v, text: t, selected: String(v) === String(value) })); return f; };
  const sub = (route, fn) => async () => { const seg = location.hash.split('/')[1], id = seg === 'new' ? 'new' : Number(seg); return id ? fn(id) : route(); };

  const employeeList = async () => {
    const { employees: list } = await api('/api/admin/employees');
    const f = { name: input('Full name', { maxlength: 120 }), email: input('Email', { type: 'email', maxlength: 200 }), phone: input('Phone', { maxlength: 40 }), roleTitle: input('Role', { maxlength: 100 }), rate: input('Hourly rate ($)', { type: 'number', min: '0', step: '0.01' }), hiredOn: input('Hire date', { type: 'date', value: new Date().toISOString().slice(0, 10) }) };
    view.replaceChildren(
      panel('Create employee account', el('p', { class: 'small text-muted', text: 'Only you can create accounts. The employee gets an email with a link to choose a password.' }), el('div', { class: 'row' }, Object.values(f).map(x => el('div', { class: 'col-md-4' }, x.wrap))),
        btn('Create & send invite', async () => { const r = await send('/api/admin/employees', 'POST', Object.fromEntries(Object.entries(f).map(([k, v]) => [k, v.ctl.value]))); toast('Employee created. Invite sent.'); location.hash = `#employees/${r.id}`; }, 'btn-primary')),
      panel('Employees', list.length ? tableOf(['Employee', 'Role', 'Rate', 'Status', 'Needs attention'], list.map(e => el('tr', {}, el('td', {}, el('a', { href: `#employees/${e.id}`, class: 'fw-semibold', text: e.name }), el('div', { class: 'small text-muted', text: e.email })), el('td', { text: e.roleTitle }), el('td', { text: money(e.rateCents) }), el('td', {}, sBadge(e.status)),
        el('td', { class: 'small', text: [e.pendingHours && `${e.pendingHours} hours`, e.pendingRequests && `${e.pendingRequests} requests`, e.pendingContracts && `${e.pendingContracts} unsigned contracts`].filter(Boolean).join(', ') })))) : empty('No employees yet.')));
  };
  const employeeDetail = async id => {
    const d = await api(`/api/admin/employees/${id}`), e = d.employee, base = `/api/admin/employees/${id}`, refresh = () => employeeDetail(id), t = d.totals;
    const f = { name: input('Name', { value: e.name, maxlength: 120 }), phone: input('Phone', { value: e.phone || '', maxlength: 40 }), roleTitle: input('Role', { value: e.roleTitle || '', maxlength: 100 }), rate: input('Hourly rate ($)', { type: 'number', min: '0', step: '0.01', value: (e.rateCents / 100).toFixed(2) }),
      hiredOn: input('Hire date', { type: 'date', value: e.hiredOn || '' }), status: select('Status', [['active', 'Active'], ['inactive', 'Inactive (signed out)']], e.status), emergencyName: input('Emergency contact', { value: e.emergencyName || '', maxlength: 120 }), emergencyPhone: input('Emergency phone', { value: e.emergencyPhone || '', maxlength: 40 }) };
    const canEstimate = el('input', { class: 'form-check-input', type: 'checkbox', id: 'can-estimate', ...(e.canEstimate ? { checked: true } : {}) });
    const notes = input('Private notes', { rows: 3, maxlength: 5000 }, 'textarea'); notes.ctl.value = e.notes || '';
    const newNote = input('Add a dated note (private, admins only)', { rows: 2, maxlength: 3000 }, 'textarea');
    const pay = { amount: input('Amount ($)', { type: 'number', min: '0.01', step: '0.01' }), paidOn: input('Date', { type: 'date', value: new Date().toISOString().slice(0, 10) }), method: input('Method', { maxlength: 60, placeholder: 'Check, Zelle, cash' }), memo: input('Memo', { maxlength: 300 }) };
    const ct = input('Contract title', { maxlength: 150 }), cb = input('Contract text', { rows: 8, maxlength: 20000 }, 'textarea');
    const ft = input('Title', { maxlength: 200 }), fp = input('File', { type: 'file', accept: 'image/jpeg,image/png,image/webp,application/pdf,.docx,.xlsx' });
    const answer = r => { const reply = input('Reply (emailed to employee)', { rows: 2, maxlength: 2000 }, 'textarea'); return el('div', { class: 'mt-2' }, reply.wrap, el('div', { class: 'd-flex gap-2' }, ['approved', 'denied'].map(s => btn(s === 'approved' ? 'Approve' : 'Deny', async () => { await send(`/api/admin/employee-requests/${r.id}/respond`, 'POST', { status: s, response: reply.ctl.value }); await refresh(); }, s === 'approved' ? 'btn-success' : 'btn-outline-danger')))); };
    const locBox = el('div', { class: 'mb-4' });
    view.replaceChildren(
      el('p', {}, el('a', { href: '#employees', text: '\u2190 All employees' })),
      panel(e.name, el('p', { class: 'text-muted', text: e.email }), el('div', { class: 'row' }, Object.values(f).map(x => el('div', { class: 'col-md-6' }, x.wrap))), notes.wrap, el('div', { class: 'form-check form-switch mb-3' }, canEstimate, el('label', { class: 'form-check-label', for: 'can-estimate', text: 'Can use the bathroom estimator (sees only their own estimates, no markup or profit)' })),
        el('div', { class: 'd-flex flex-wrap gap-2' }, btn('Save changes', async () => { await send(base, 'POST', { ...Object.fromEntries(Object.entries(f).map(([k, v]) => [k, v.ctl.value])), notes: notes.ctl.value, canEstimate: canEstimate.checked }); toast('Saved'); await refresh(); }, 'btn-primary'),
          btn('Send new setup link', async () => { await send(`${base}/invite`, 'POST'); toast('Invite sent'); }))),
      panel('Hours & pay', el('div', { class: 'row g-3 mb-3' }, [['Approved', hrs(t.approvedMinutes)], ['Pending', hrs(t.pendingMinutes)], ['Earned', money(t.earnedCents)], ['Paid', money(t.paidCents)], ['Balance owed', money(t.balanceCents)]].map(([l, v]) => el('div', { class: 'col-6 col-md' }, el('div', { class: 'h5 mb-0', text: v }), el('div', { class: 'small text-muted', text: l })))),
        d.hours.length ? tableOf(['Date', 'Hours', 'Job', 'Note', 'Status', ''], d.hours.map(h => el('tr', {}, el('td', { text: h.date }), el('td', { text: hrs(h.minutes) }), el('td', { text: h.jobTitle }), el('td', { text: h.note }), el('td', {}, sBadge(h.status)),
          el('td', { class: 'text-nowrap' }, h.status === 'pending' ? [btn('Approve', async () => { await send(`/api/admin/hours/${h.id}/approve`, 'POST'); await refresh(); }, 'btn-success'), ' ', btn('Reject', async () => { await send(`/api/admin/hours/${h.id}/reject`, 'POST'); await refresh(); }, 'btn-outline-danger')] : btn('Delete', async () => { if (confirm('Delete this entry?')) { await send(`/api/admin/hours/${h.id}/delete`, 'POST'); await refresh(); } }, 'btn-outline-secondary'))))) : empty('No hours logged.')),
      panel('Record a payment', el('div', { class: 'row' }, Object.values(pay).map(x => el('div', { class: 'col-md-3' }, x.wrap))), btn('Record payment', async () => { await send(`${base}/payments`, 'POST', Object.fromEntries(Object.entries(pay).map(([k, v]) => [k, v.ctl.value]))); toast('Payment recorded'); await refresh(); }, 'btn-primary'),
        d.payments.length ? el('div', { class: 'mt-3' }, tableOf(['Date', 'Amount', 'Method', 'Memo', ''], d.payments.map(p => el('tr', {}, el('td', { text: p.paidOn }), el('td', { text: money(p.amountCents) }), el('td', { text: p.method }), el('td', { text: p.memo }), el('td', {}, btn('Delete', async () => { if (confirm('Delete this payment record?')) { await send(`/api/admin/payments/${p.id}/delete`, 'POST'); await refresh(); } }, 'btn-outline-danger')))))) : null),
      panel(`Notes history (${d.noteLog.length})`, newNote.wrap, btn('Add note', async () => { await send(`${base}/notes`, 'POST', { body: newNote.ctl.value }); await refresh(); }, 'btn-primary mb-3'),
        d.noteLog.length ? d.noteLog.map(n => el('div', { class: 'border-top py-2' }, el('div', { class: 'd-flex small text-muted' }, el('span', { text: `${n.author} \u00B7 ${when(n.createdAt)}` }), el('button', { type: 'button', class: 'btn btn-link btn-sm ms-auto p-0 text-danger', onclick: guard(async () => { if (!confirm('Remove this note?')) return; await send(`${base}/notes/${n.id}/delete`, 'POST'); await refresh(); }), text: 'Remove' })), el('div', { class: 'pre-wrap', text: n.body }))) : empty('No notes yet.')),
      panel('Requests', d.requests.length ? d.requests.map(r => el('div', { class: 'border-top py-2' }, el('div', { class: 'd-flex gap-2 align-items-center' }, el('strong', { text: r.subject }), sBadge(r.status), el('span', { class: 'small text-muted', text: `${r.typeLabel} \u00B7 ${when(r.createdAt)}` })), r.body ? el('div', { class: 'pre-wrap', text: r.body }) : null, r.response ? el('div', { class: 'small', text: `Reply: ${r.response}` }) : null, r.status === 'pending' ? answer(r) : null)) : empty('No requests.')),
      panel('Contracts', el('div', { class: 'mb-3' }, ct.wrap, cb.wrap, btn('Send contract for signature', async () => { await send(`${base}/contracts`, 'POST', { title: ct.ctl.value, body: cb.ctl.value }); toast('Contract sent'); await refresh(); }, 'btn-primary')),
        d.contracts.length ? d.contracts.map(c => el('details', { class: 'border-top py-2' }, el('summary', {}, el('strong', { text: c.title }), ' ', sBadge(c.status), c.signedAt ? el('span', { class: 'small text-muted', text: ` signed by ${c.signedName} ${when(c.signedAt)}` }) : null), el('div', { class: 'pre-wrap small my-2', text: c.body }),
          c.status === 'pending' ? btn('Void', async () => { if (confirm('Void this contract?')) { await send(`/api/admin/contracts/${c.id}/void`, 'POST'); await refresh(); } }, 'btn-outline-danger') : null)) : empty('No contracts yet.')),
      panel(`Documents (${d.files.length})`, el('div', { class: 'row g-2 align-items-end' }, el('div', { class: 'col-md-5' }, ft.wrap), el('div', { class: 'col-md-5' }, fp.wrap), el('div', { class: 'col-md-2 mb-3' }, btn('Upload', async () => { const file = fp.ctl.files[0]; if (!file) return toast('Choose a file.', 'danger'); await api(`${base}/files`, { method: 'POST', headers: { 'X-Filename': encodeURIComponent(file.name), 'X-Title': encodeURIComponent(ft.ctl.value) }, body: file }); await refresh(); }, 'btn-primary'))),
        d.files.map(x => el('div', { class: 'd-flex gap-2 border-top py-2' }, el('a', { href: `/api/admin/employee-files/${x.id}`, target: '_blank', rel: 'noopener', text: x.title || x.name }), el('span', { class: 'small text-muted', text: `${fmtSize(x.size)} \u00B7 from ${x.uploadedBy}` }), el('span', { class: 'ms-auto' }, btn('Delete', async () => { if (confirm('Delete this file?')) { await send(`/api/admin/employee-files/${x.id}/delete`, 'POST'); await refresh(); } }, 'btn-outline-danger'))))),
      el('h2', { class: 'h5 mb-3', text: 'Location & time clock' }), locBox,
      panel('Assigned jobs', d.jobs.length ? el('ul', { class: 'mb-0' }, d.jobs.map(j => el('li', {}, el('a', { href: `#jobs/${j.id}`, text: `#${j.id} ${j.title}` }), ' ', sBadge(j.status)))) : empty('Not assigned to any jobs.')));
    await drawLocation(locBox, `${base}/location`, {}, true);
  };
  const employees = sub(employeeList, employeeDetail);

  const jobList = async () => {
    const r = await api('/api/admin/jobs');
    const f = { title: input('Title', { maxlength: 150 }), area: input('Area / neighborhood (shown to all employees)', { maxlength: 100 }), address: input('Address (only shown to assigned employees)', { maxlength: 300 }), scheduledAt: input('Scheduled', { maxlength: 40, placeholder: 'e.g. 2025-06-02 8:00 AM' }) };
    const desc = input('Description', { rows: 3, maxlength: 5000 }, 'textarea');
    view.replaceChildren(
      panel('Post a job', el('div', { class: 'row' }, Object.values(f).map(x => el('div', { class: 'col-md-6' }, x.wrap))), desc.wrap, btn('Create job', async () => { const v = Object.fromEntries(Object.entries(f).map(([k, x]) => [k, x.ctl.value])); const j = await send('/api/admin/jobs', 'POST', { ...v, description: desc.ctl.value }); location.hash = `#jobs/${j.id}`; }, 'btn-primary')),
      panel('Jobs', r.jobs.length ? tableOf(['Job', 'Area', 'Team', 'Status', ''], r.jobs.map(j => el('tr', {}, el('td', {}, el('a', { href: `#jobs/${j.id}`, class: 'fw-semibold', text: `#${j.id} ${j.title}` }), el('div', { class: 'small text-muted', text: j.customerName })), el('td', { text: j.area }), el('td', { text: j.team }), el('td', {}, sBadge(j.status)), el('td', {}, j.interest ? badge(`${j.interest} interested`, 'warning') : null)))) : empty('No jobs yet.')));
  };
  const jobDetail = async id => {
    const field = await api(`/api/admin/jobs/${id}/field`);
    const d = await api(`/api/admin/jobs/${id}`), j = d.job, base = `/api/admin/jobs/${id}`, refresh = () => jobDetail(id);
    const f = { title: input('Title', { value: j.title, maxlength: 150 }), area: input('Area', { value: j.area, maxlength: 100 }), address: input('Address', { value: j.address, maxlength: 300 }), scheduledAt: input('Scheduled', { value: j.scheduledAt, maxlength: 40 }),
      status: select('Status', d.statuses.map(s => [s, s.replace('_', ' ')]), j.status), customerId: select('Customer', [['', 'None'], ...d.customers.map(c => [c.id, c.name])], j.customerId ?? '') };
    const desc = input('Description', { rows: 4, maxlength: 5000 }, 'textarea'); desc.ctl.value = j.description;
    const assigned = new Set(d.assigned.map(a => a.id)), boxes = d.employees.map(e => ({ e, box: el('input', { class: 'form-check-input', type: 'checkbox', id: `as-${e.id}`, checked: assigned.has(e.id) }) }));
    const site = { lat: input('Latitude', { type: 'number', step: 'any', value: j.site ? String(j.site.lat) : '' }), lng: input('Longitude', { type: 'number', step: 'any', value: j.site ? String(j.site.lng) : '' }), radius: input('Radius (meters)', { type: 'number', min: '50', max: '2000', step: '10', value: String(j.site?.radius || 150) }) };
    const upd = input('Post an update (visible to assigned employees)', { rows: 2, maxlength: 2000 }, 'textarea');
    view.replaceChildren(
      el('p', {}, el('a', { href: '#jobs', text: '\u2190 All jobs' })),
      panel(`Job #${j.id}`, el('div', { class: 'row' }, Object.values(f).map(x => el('div', { class: 'col-md-6' }, x.wrap))), desc.wrap,
        el('div', { class: 'd-flex gap-2' }, btn('Save job', async () => { await send(base, 'POST', { ...Object.fromEntries(Object.entries(f).map(([k, x]) => [k, x.ctl.value])), description: desc.ctl.value }); toast('Saved'); await refresh(); }, 'btn-primary'),
          btn('Delete job', async () => { if (confirm('Delete this job?')) { await send(`${base}/delete`, 'POST'); location.hash = '#jobs'; } }, 'btn-outline-danger'))),
      panel('Job site (GPS)', el('p', { class: 'small text-muted', text: 'Employees must be inside this circle to clock in. If they leave it for more than a few minutes the time is unpaid, you are alerted, and they are clocked out automatically after 20 minutes away. Stand at the site and use "Use my current location".' }),
        el('div', { class: 'row' }, Object.values(site).map(x => el('div', { class: 'col-md-4' }, x.wrap))),
        el('div', { class: 'd-flex flex-wrap gap-2' }, btn('Use my current location', async () => {
          const pos = await new Promise((resolve, reject) => navigator.geolocation ? navigator.geolocation.getCurrentPosition(resolve, () => reject(new Error('Could not read your location. Allow location for this page.')), { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }) : reject(new Error('This browser has no location support.')));
          site.lat.ctl.value = pos.coords.latitude.toFixed(6); site.lng.ctl.value = pos.coords.longitude.toFixed(6); toast(`Position filled in (\u00b1${Math.round(pos.coords.accuracy)} m). Save to apply.`);
        }), btn('Save job site', async () => { await send(`/api/admin/jobs/${id}/site`, 'POST', { lat: site.lat.ctl.value, lng: site.lng.ctl.value, radius: site.radius.ctl.value }); toast('Job site saved'); await refresh(); }, 'btn-primary'),
          j.site ? btn('Remove job site', async () => { await send(`/api/admin/jobs/${id}/site`, 'POST', { clear: true }); await refresh(); }, 'btn-outline-danger') : null),
        j.site ? el('p', { class: 'small mt-2 mb-0' }, 'Current site: ', mapsLink(j.site, `${j.site.lat.toFixed(5)}, ${j.site.lng.toFixed(5)}`), ` \u00b7 ${j.site.radius} m radius`) : el('p', { class: 'small text-warning mt-2 mb-0', text: 'No job site set: arrival and leaving checks are off for this job.' })),
      panel('Assigned employees', d.interested.length ? el('div', { class: 'alert alert-warning' }, el('strong', { text: 'Interested: ' }), d.interested.map(i => `${i.name}${i.body ? ` (${i.body})` : ''}`).join(', '), el('div', { class: 'small', text: 'Tick them below and save, or answer under Employees \u2192 Requests.' })) : null,
        boxes.length ? boxes.map(({ e, box }) => el('div', { class: 'form-check' }, box, el('label', { class: 'form-check-label', for: box.id, text: e.name }))) : empty('No active employees.'),
        btn('Save assignments', async () => { await send(`${base}/assign`, 'POST', { employeeIds: boxes.filter(b => b.box.checked).map(b => b.e.id) }); toast('Assignments saved'); await refresh(); }, 'btn-primary mt-3')),
      panel('Daily reports', field.reports.length ? tableOf(['Date', 'By', 'Status', 'Done', 'Summary', 'Left to do', 'Problems'], field.reports.map(r => el('tr', {}, el('td', { text: r.date }), el('td', { text: r.by }), el('td', { text: r.statusLabel }), el('td', { text: `${r.percent}%` }), el('td', { class: 'pre-wrap', text: r.summary }), el('td', { class: 'pre-wrap', text: r.remaining }), el('td', { class: 'pre-wrap text-danger', text: r.problems })))) : empty('No daily reports yet.')),
      panel('Liability records', field.liabilities.length ? field.liabilities.map(l => el('div', { class: 'border-top py-2' },
        el('strong', { text: `${l.typeLabel} \u00B7 ${l.consented ? 'Homeowner agreed' : 'HOMEOWNER DECLINED'}` }), el('div', { class: 'small text-muted', text: `${l.by} \u00B7 ${when(l.createdAt)} \u00B7 Homeowner: ${l.homeowner}` }), el('div', { class: 'pre-wrap', text: l.description }), el('div', { class: 'small', text: l.consentText }),
        el('div', { class: 'd-flex flex-wrap gap-2 align-items-center my-1' }, l.videoUrl ? el('a', { href: l.videoUrl, target: '_blank', rel: 'noopener', text: 'Consent video' }) : null, l.signatureUrl ? el('a', { href: l.signatureUrl, target: '_blank', rel: 'noopener' }, el('img', { src: l.signatureUrl, alt: `Signature of ${l.homeowner}`, class: 'field-thumb' })) : null),
        l.reviewedAt ? el('div', { class: 'small text-success', text: `Reviewed by ${l.reviewedBy} ${when(l.reviewedAt)}${l.reviewNote ? `: ${l.reviewNote}` : ''}` }) : btn('Mark reviewed', async () => { const note = prompt('Review note (optional)') ?? ''; await send(`/api/admin/liabilities/${l.id}/review`, 'POST', { note }); await refresh(); }, 'btn-outline-primary'))) : empty('No liability records.')),
      panel(`Job photos and videos (${field.media.length})`, field.media.length ? el('div', { class: 'd-flex flex-wrap gap-2' }, field.media.map(m => m.type === 'image' ? el('a', { href: m.url, target: '_blank', rel: 'noopener', title: `${m.phase} \u00B7 ${m.kind} \u00B7 ${m.by} \u00B7 ${m.caption}` }, el('img', { src: m.url, alt: m.caption || `${m.phase} photo`, class: 'field-thumb', loading: 'lazy' })) : el('a', { href: m.url, target: '_blank', rel: 'noopener', class: 'btn btn-sm btn-outline-secondary', text: `Video \u00B7 ${m.phase} \u00B7 ${m.by}` }))) : empty('No photos yet.')),
      panel('Updates', upd.wrap, btn('Post update', async () => { await send(`${base}/updates`, 'POST', { body: upd.ctl.value }); await refresh(); }, 'btn-primary mb-3'),
        d.updates.length ? d.updates.map(u => el('div', { class: 'border-top py-2' }, el('div', { class: 'small text-muted', text: `${u.author} \u00B7 ${when(u.createdAt)}` }), el('div', { class: 'pre-wrap', text: u.body }))) : empty('No updates yet.')));
  };
  const jobs = sub(jobList, jobDetail);

  const TRADE_FLAGS = [['licensed', 'Licensed'], ['insured', 'Insured'], ['ownTools', 'Own tools'], ['ownVehicle', 'Own vehicle'], ['workAuthorized', 'Work authorized']];
  let hrFilter = 'all';
  const hr = async () => {
    const [r, o] = await Promise.all([api('/api/admin/applications'), api('/api/admin/hr')]);
    badges.hr = o.pipeline.new;
    renderNav('hr');
    const tile2 = (value, label, href) => el('div', { class: 'col-6 col-md-3 col-xl' }, el('a', { href: href || '#hr', class: 'panel d-block text-decoration-none text-reset h-100' }, el('div', { class: 'h3 mb-0', text: String(value) }), el('div', { class: 'small text-muted', text: label })));
    const card = a => {
      const x = a.data, status = select('Status', r.statuses.map(s => [s, s]), a.status), notes = input('Interview / review notes', { rows: 2, maxlength: 5000 }, 'textarea'); notes.ctl.value = a.notes || '';
      const rating = select('Rating', [[0, 'Not rated'], [1, '1 \u2605'], [2, '2 \u2605'], [3, '3 \u2605'], [4, '4 \u2605'], [5, '5 \u2605']], a.rating), iv = input('Interview', { maxlength: 40, value: a.interviewAt || '', placeholder: 'e.g. 2026-12-01 10:00 AM' });
      const line = (l, v) => v ? el('div', {}, el('strong', { text: `${l}: ` }), v) : null;
      return el('details', { class: 'panel' }, el('summary', {}, el('strong', { text: a.name }), ' ', sBadge(a.status), ...(a.tests || []).filter(t => t.submittedAt).map(t => [' ', badge(`${t.trade.split(' ')[0]} ${t.score}/${t.total}`, t.passed ? 'success' : 'danger')]), a.rating ? el('span', { class: 'ms-2', text: '\u2605'.repeat(a.rating) }) : null, el('span', { class: 'small text-muted', text: ` ${(x.trades || []).join(', ')} \u00B7 ${when(a.createdAt)}${a.interviewAt ? ` \u00B7 interview ${a.interviewAt}` : ''}` })),
        el('div', { class: 'mt-3' }, line('Email', a.email), line('Phone', a.phone), line('City', a.city), line('Years of experience', x.years), line('Availability', x.availability), line('Desired rate', x.desiredRate), line('Available from', x.startDate),
          line('Checks', TRADE_FLAGS.map(([k, l]) => `${l}: ${x[k] || '?'}`).join(' \u00B7 ')), line('License', x.licenseDetails), line('Insurance', x.insuranceDetails), line('Tools', x.tools),
          el('div', { class: 'mt-2' }, el('strong', { text: 'Skills test: ' }), (x.trades || []).length ? (x.trades || []).map(tr => { const t = (a.tests || []).find(z => z.trade === (['Tile setter', 'Tile helper', 'Remodeler / carpenter', 'Plumber', 'Electrician', 'Painter / finisher', 'Drywall'].includes(tr) ? tr : 'General handyman')); const out = el('div', { class: 'small' }); return el('div', { class: 'mb-1' }, `${tr}: `, !t ? 'not started' : !t.submittedAt ? 'started, not finished' : [badge(`${t.score}/${t.total} ${t.passed ? 'passed' : 'below 70%'}`, t.passed ? 'success' : 'danger'), t.late ? ' (late)' : '', ' ', btn('Missed questions', async () => { const d = await api(`/api/admin/applications/${a.id}/test/${encodeURIComponent(t.trade)}`); out.replaceChildren(...d.missed.map(m => el('div', { class: 'border-top py-1' }, el('div', { text: m.question }), el('div', { class: 'text-danger', text: `Answered: ${m.given || 'no answer'}` }), el('div', { class: 'text-success', text: `Correct: ${m.correct}` })))); }), ' ', btn('Reset attempt', async () => { if (confirm('Let the applicant retake this test?')) { await send(`/api/admin/applications/${a.id}/test/${encodeURIComponent(t.trade)}`, 'POST'); await hr(); } }, 'btn-outline-danger')], out); }) : 'n/a'),
          line('Experience', null), x.experience ? el('div', { class: 'pre-wrap', text: x.experience }) : null, x.references ? line('References', null) : null, x.references ? el('div', { class: 'pre-wrap', text: x.references }) : null),
        el('div', { class: 'row mt-3' }, el('div', { class: 'col-md-4' }, status.wrap), el('div', { class: 'col-md-4' }, rating.wrap), el('div', { class: 'col-md-4' }, iv.wrap), el('div', { class: 'col-12' }, notes.wrap)),
        el('div', { class: 'd-flex flex-wrap gap-2' }, btn('Save', async () => { await send(`/api/admin/applications/${a.id}`, 'POST', { status: status.ctl.value, notes: notes.ctl.value, rating: Number(rating.ctl.value), interviewAt: iv.ctl.value }); toast('Saved'); await hr(); }, 'btn-primary'),
          a.email ? el('a', { class: 'btn btn-sm btn-outline-secondary', href: `mailto:${a.email}`, text: 'Email applicant' }) : null,
          a.employeeId ? el('a', { class: 'btn btn-sm btn-outline-success', href: `#employees/${a.employeeId}`, text: 'View employee record' }) : a.status !== 'hired' ? btn('Hire & create account', async () => { if (!confirm(`Create an employee account for ${a.name} and email an invite to ${a.email}?`)) return; const e = await send('/api/admin/employees', 'POST', { name: a.name, email: a.email, phone: a.phone, roleTitle: (x.trades || [])[0] || '', applicationId: a.id }); location.hash = `#employees/${e.id}`; }, 'btn-success') : null,
          btn('Delete', async () => { if (confirm('Delete this application?')) { await send(`/api/admin/applications/${a.id}/delete`, 'POST'); await hr(); } }, 'btn-outline-danger')));
    };
    const shown = r.applications.filter(a => hrFilter === 'all' || a.status === hrFilter);
    const tabs = el('ul', { class: 'nav nav-pills mb-3 flex-wrap' }, ['all', ...r.statuses].map(s => el('li', { class: 'nav-item' }, el('button', { type: 'button', class: `nav-link${s === hrFilter ? ' active' : ''}`, onclick: guard(async () => { hrFilter = s; await hr(); }), text: `${s[0].toUpperCase() + s.slice(1)} (${s === 'all' ? r.applications.length : o.pipeline[s]})` }))));
    view.replaceChildren(
      el('div', { class: 'row g-3 mb-4' }, tile2(o.pipeline.new, 'New applications'), tile2(o.pipeline.interview, 'In interview'), tile2(o.staff.active, 'Active employees', '#employees'), tile2(o.attention.hours + o.attention.requests, 'Hours & requests to review', '#employees'), tile2(o.attention.contracts, 'Unsigned contracts', '#employees'), tile2(money(Math.round(o.owed)), 'Wages owed', '#employees')),
      el('p', { class: 'text-muted', text: 'Applications arrive from the public Handyman Application page. Move them through the pipeline, then hire to create the employee account.' }),
      el('p', {}, el('a', { href: '#employees', class: 'me-3', text: 'Employees' }), el('a', { href: '#knowledge', text: 'Knowledge base' })),
      tabs, ...(shown.length ? shown.map(card) : [panel(null, empty('No applications in this stage.'))]));
  };

  const knowledge = sub(async () => {
    const { articles } = await api('/api/admin/kb');
    view.replaceChildren(panel('Knowledge base articles', el('p', {}, btn('New article', async () => { location.hash = '#knowledge/new'; }, 'btn-primary')),
      articles.length ? tableOf(['Title', 'Category', 'Order', 'Status', 'Updated'], articles.map(a => el('tr', {}, el('td', {}, el('a', { href: `#knowledge/${a.id}`, class: 'fw-semibold', text: a.title }), el('div', { class: 'small text-muted', text: a.summary })), el('td', { text: a.category }), el('td', { text: String(a.sort) }), el('td', {}, badge(a.published ? 'published' : 'draft', a.published ? 'success' : 'secondary')), el('td', { text: when(a.updatedAt) })))) : empty('No articles yet. Add how-to guides, job information and checklists for your team.')));
  }, async id => kbEditor(id));
  const kbEditor = async id => {
    const a = id === 'new' ? { title: '', category: 'General', summary: '', body: '', sort: 0, published: true } : (await api(`/api/admin/kb/${id}`)).article;
    const f = { title: input('Title', { value: a.title, maxlength: 150 }), category: input('Category', { value: a.category, maxlength: 60 }), sort: input('Sort order', { type: 'number', value: String(a.sort) }), summary: input('Short summary', { value: a.summary, maxlength: 300 }) };
    const body = input('Article text', { rows: 16, maxlength: 20000 }, 'textarea'); body.ctl.value = a.body;
    const pub = el('input', { class: 'form-check-input', type: 'checkbox', id: 'kb-pub', checked: a.published });
    view.replaceChildren(el('p', {}, el('a', { href: '#knowledge', text: '\u2190 All articles' })),
      panel(id === 'new' ? 'New article' : 'Edit article', el('div', { class: 'row' }, Object.values(f).map((x, i) => el('div', { class: i === 3 ? 'col-12' : 'col-md-4' }, x.wrap))), body.wrap,
        el('p', { class: 'small text-muted', text: 'Formatting: start a line with "# " for a heading and "- " for a bullet. Blank lines separate paragraphs.' }),
        el('div', { class: 'form-check form-switch mb-3' }, pub, el('label', { class: 'form-check-label', for: 'kb-pub', text: 'Published (visible to employees)' })),
        el('div', { class: 'd-flex gap-2' }, btn('Save article', async () => { const v = { ...Object.fromEntries(Object.entries(f).map(([k, x]) => [k, x.ctl.value])), body: body.ctl.value, published: pub.checked, sort: Number(f.sort.ctl.value) }; const r = await send(id === 'new' ? '/api/admin/kb' : `/api/admin/kb/${id}`, 'POST', v); toast('Article saved'); location.hash = `#knowledge/${r.id || id}`; if (id !== 'new') await kbEditor(id); }, 'btn-primary'),
          id !== 'new' ? btn('Delete', async () => { if (confirm('Delete this article?')) { await send(`/api/admin/kb/${id}/delete`, 'POST'); location.hash = '#knowledge'; } }, 'btn-outline-danger') : null)));
  };

  // ---------- Settings
  const settings = async () => {
    const s = await api('/api/admin/settings');
    const text = input('Announcement banner text', { maxlength: '240' }); text.ctl.value = s.banner;
    const on = el('input', { class: 'form-check-input', type: 'checkbox', id: 'bn-on', checked: s.bannerOn }), an = el('input', { class: 'form-check-input', type: 'checkbox', id: 'an-on', checked: s.analyticsOn });
    view.replaceChildren(panel('Site settings', text.wrap,
      el('div', { class: 'form-check form-switch mb-3' }, on, el('label', { class: 'form-check-label', for: 'bn-on', text: 'Show the banner on every page' })),
      el('div', { class: 'form-check form-switch mb-1' }, an, el('label', { class: 'form-check-label', for: 'an-on', text: 'Record visit statistics' })),
      el('p', { class: 'small text-muted', text: 'Records page, referring site and device type with a daily-changing anonymous visitor code. No IP address is stored and visitors with Do Not Track or Global Privacy Control are skipped. Described in the privacy policy.' }),
      el('div', { class: 'border-top pt-3 mb-3' }, el('div', { class: 'fw-semibold mb-1', text: 'Display language' }), el('div', { 'data-lang-switch': '' }), el('p', { class: 'small text-muted mt-1 mb-0', text: 'English is the default. Your choice is saved to your account.' })),
      btn('Save settings', async () => { await send('/api/admin/settings', 'POST', { banner: text.ctl.value, bannerOn: on.checked, analyticsOn: an.checked }); toast('Settings saved'); }, 'btn-primary')));
  };

  const estimator = async () => {
    view.replaceChildren(panel('Bathroom estimator', el('p', { text: 'Build parts, labor and extra-cost estimates on any phone or tablet, send them to customers to sign and pay, and manage your price book. Turn it on for individual employees from their employee page.' }),
      el('div', { class: 'd-flex flex-wrap gap-2' }, el('a', { class: 'btn btn-primary', href: '/estimator/', text: 'Open estimator' }), el('a', { class: 'btn btn-outline-dark', href: '/estimator/#book', text: 'Price book' }), el('a', { class: 'btn btn-outline-dark', href: '/estimator/#settings', text: 'Defaults' }))));
  };
  // ---------- Location tracking: live view, alerts, charts, shift history and route review
  const mapsLink = (p, text) => el('a', { href: `https://www.google.com/maps?q=${p.lat},${p.lng}`, target: '_blank', rel: 'noopener noreferrer', text });
  const KIND_LABEL = { left_site: 'Left job site', location_off: 'Location turned off', location_lost: 'Location lost', left_site_auto: 'Left site, auto clock-out', max_shift: 'Shift too long', lunch_overrun: 'Lunch overrun, auto clock-out', gps_jump: 'Impossible GPS jump', gps_static: 'Fake GPS suspected', device_mismatch: 'Different device used', new_device: 'New device' };
  const EVENT_LABEL = { permission_denied: 'Location permission denied', permission_granted: 'Location back on', position_unavailable: 'Position unavailable', timeout: 'GPS timeout', tracking_paused: 'App moved to background', tracking_resumed: 'Tracking resumed', low_accuracy: 'Low accuracy', offline_batch: 'Offline', battery_low: 'Battery low', left_site: 'Left job site', returned_to_site: 'Returned to job site', auto_clock_out: 'Clocked out automatically', lunch_start: 'Lunch started', lunch_end: 'Lunch ended', gps_jump: 'Impossible GPS jump', gps_static: 'Frozen / fake GPS suspected', device_mismatch: 'Different device used', new_device: 'New device', browser_changed: 'Browser changed' };

  function barChart(series, key, color, label, fmt = String) {
    const W = 640, H = 200, P = 28, max = Math.max(1, ...series.map(d => d[key])), bw = (W - 2 * P) / Math.max(1, series.length);
    const svg = sv('svg', { class: 'chart', viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': label });
    svg.append(sv('line', { x1: P, x2: W - P, y1: H - P, y2: H - P, stroke: '#e7e3ff' }));
    series.forEach((d, i) => {
      const h = d[key] / max * (H - 2 * P), bar = sv('rect', { x: (P + i * bw + 1).toFixed(1), y: (H - P - h).toFixed(1), width: Math.max(1, bw - 2).toFixed(1), height: Math.max(0, h).toFixed(1), rx: 2, fill: color });
      bar.append(sv('title', {}, `${d.day || d.name}: ${fmt(d[key])}`)); svg.append(bar);
    });
    svg.append(sv('text', { x: P, y: H - 8 }, (series[0]?.day || '').slice(5)), sv('text', { x: W - P - 24, y: H - 8 }, (series.at(-1)?.day || '').slice(5)), sv('text', { x: P, y: 14 }, `max ${fmt(max)}`));
    return svg;
  }
  const hbars = (items, key, fmt, link) => items.length ? el('div', {}, items.slice(0, 12).map(i => {
    const top = items[0][key] || 1, svg = sv('svg', { viewBox: '0 0 100 4', width: '100%', height: '8', preserveAspectRatio: 'none', 'aria-hidden': 'true' });
    svg.append(sv('rect', { width: 100, height: 4, rx: 2, fill: '#eee9ff' }), sv('rect', { width: Math.max(2, i[key] / top * 100), height: 4, rx: 2, fill: '#7c5cff' }));
    return el('div', { class: 'mb-2' }, el('div', { class: 'd-flex justify-content-between small' }, link ? el('a', { href: link(i), class: 'text-truncate', text: i.name || i.title }) : el('span', { class: 'text-truncate', text: i.name || i.title }), el('b', { text: fmt(i) })), svg);
  })) : empty('No shifts in this period.');

  // Draws the GPS trail with an equirectangular projection (no external map tiles). The job site radius is the dashed circle.
  function routeMap(points, site, shift) {
    const W = 640, H = 340, P = 24, pts = points.map(p => ({ lat: p.lat, lng: p.lng })).concat(site ? [{ lat: site.lat, lng: site.lng }] : []);
    if (!pts.length) return empty('No GPS points were recorded for this shift.');
    const lat0 = pts.reduce((n, p) => n + p.lat, 0) / pts.length, k = Math.cos(lat0 * Math.PI / 180);
    const xs = pts.map(p => p.lng * k), ys = pts.map(p => p.lat);
    const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
    const span = Math.max(maxX - minX, maxY - minY, 0.0006), scale = (Math.min(W, H) - 2 * P) / span;
    const px = p => ((p.lng * k - minX) * scale + (W - (maxX - minX) * scale) / 2), py = p => H - ((p.lat - minY) * scale + (H - (maxY - minY) * scale) / 2);
    const svg = sv('svg', { class: 'chart route-map', viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': 'Route taken during this shift' });
    svg.append(sv('rect', { width: W, height: H, rx: 12, fill: '#f6f4ff' }));
    if (site) svg.append(sv('circle', { cx: px(site).toFixed(1), cy: py(site).toFixed(1), r: Math.max(6, site.radius / 111320 * scale).toFixed(1), fill: '#2fbf71', 'fill-opacity': '.12', stroke: '#2fbf71', 'stroke-dasharray': '6 4' }), sv('text', { x: px(site) + 8, y: py(site) - 8 }, `Job site (${site.radius} m)`));
    svg.append(sv('polyline', { points: points.map(p => `${px(p).toFixed(1)},${py(p).toFixed(1)}`).join(' '), fill: 'none', stroke: '#7c5cff', 'stroke-width': 3, 'stroke-linejoin': 'round' }));
    points.forEach(p => { const c = sv('circle', { cx: px(p).toFixed(1), cy: py(p).toFixed(1), r: 3, fill: '#7c5cff' }); c.append(sv('title', {}, `${when(p.at)} \u00b1${Math.round(p.accuracy || 0)} m`)); svg.append(c); });
    const first = points[0], last = points.at(-1);
    svg.append(sv('circle', { cx: px(first).toFixed(1), cy: py(first).toFixed(1), r: 8, fill: '#2fbf71', stroke: '#fff', 'stroke-width': 2 }), sv('text', { x: px(first) + 11, y: py(first) + 4 }, 'Start'));
    if (points.length > 1) svg.append(sv('circle', { cx: px(last).toFixed(1), cy: py(last).toFixed(1), r: 8, fill: shift.clockOutAt ? '#e5484d' : '#ff9f1c', stroke: '#fff', 'stroke-width': 2 }), sv('text', { x: px(last) + 11, y: py(last) + 4 }, shift.clockOutAt ? 'End' : 'Latest'));
    return svg;
  }

  async function shiftDetailView(id, onChange) {
    const d = await api(`/api/admin/location/shifts/${id}`), s = d.shift;
    const box = panel(`Shift #${s.id}: ${s.employeeName}`,
      el('p', { class: 'text-muted' }, `${when(s.clockInAt)} \u2192 ${s.clockOutAt ? when(s.clockOutAt) : 'still clocked in'} \u00b7 ${s.jobTitle || 'No specific job'}`),
      el('div', { class: 'row g-3 mb-3' }, [['On the clock', hrs(s.minutes)], ['Paid', s.paidMinutes != null ? hrs(s.paidMinutes) : hrs(Math.max(0, s.minutes - s.offsiteMinutes))], ['Off site (unpaid)', hrs(s.offsiteMinutes)], ['Distance', `${s.distanceKm} km`], ['GPS points', String(s.points)], ['Avg accuracy', s.avgAccuracyM == null ? 'n/a' : `\u00b1${s.avgAccuracyM} m`]].map(([l, v]) => el('div', { class: 'col-6 col-md-2' }, el('div', { class: 'h5 mb-0', text: v }), el('div', { class: 'small text-muted', text: l })))),
      s.closedBy ? el('p', { class: 'small' }, `Closed by ${s.closedBy}${s.note ? `: ${s.note}` : ''}.`) : null,
      routeMap(d.points, d.site, s),
      el('p', { class: 'small mt-2' }, s.in ? [mapsLink(s.in, 'Clock-in location'), ' \u00b7 '] : null, s.out ? [mapsLink(s.out, 'Clock-out location'), ' \u00b7 '] : null, d.site ? mapsLink(d.site, 'Job site') : 'This job has no GPS site set, so on-site checks are off (set it on the job page).'),
      el('h3', { class: 'h6 mt-3', text: 'Timeline' }), d.events.length ? tableOf(['When', 'Event', 'Detail'], d.events.map(e => el('tr', {}, el('td', { text: when(e.at) }), el('td', { text: EVENT_LABEL[e.kind] || e.kind }), el('td', { text: e.detail })))) : empty('No interruptions recorded.'),
      el('h3', { class: 'h6 mt-3', text: 'Device' }), d.device ? el('p', { class: 'small mb-1' }, `${d.device.label} \u00b7 device ID ${d.device.id} \u00b7 first seen ${when(d.device.firstSeen)} \u00b7 screen ${d.device.details.screen || 'n/a'} \u00b7 ${d.device.details.timezone || ''}`) : empty('No device record.'),
      el('h3', { class: 'h6 mt-3', text: 'Location consent' }), el('p', { class: 'small mb-1' }, `Accepted ${when(d.consent.at)} (notice ${d.consent.version}) from IP ${d.consent.ip || 'n/a'}.`), el('p', { class: 'small text-muted fst-italic', text: d.consentText }),
      s.clockOutAt ? null : btn('Close this shift now', async () => { if (confirm('Clock this employee out now?')) { await send(`/api/admin/location/shifts/${s.id}/close`, 'POST'); toast('Shift closed'); await onChange(); } }, 'btn-outline-danger'),
      el('details', { class: 'mt-3' }, el('summary', { text: `Raw GPS points (${d.points.length})` }), d.points.length ? tableOf(['Time', 'Lat', 'Lng', 'Accuracy', 'Speed', 'Battery'], d.points.slice(0, 500).map(p => el('tr', {}, el('td', { text: when(p.at) }), el('td', { text: p.lat.toFixed(6) }), el('td', { text: p.lng.toFixed(6) }), el('td', { text: p.accuracy == null ? '' : `\u00b1${Math.round(p.accuracy)} m` }), el('td', { text: p.speed == null ? '' : `${(p.speed * 2.237).toFixed(1)} mph` }), el('td', { text: p.battery == null ? '' : `${Math.round(p.battery * 100)}%` })))) : null));
    return box;
  }

  // Renders the location dashboard into `box`. Used for the company-wide page and, scoped to one person, in the employee file.
  async function drawLocation(box, endpoint, st, scoped) {
    const qs = new URLSearchParams(Object.entries(st).filter(([, v]) => v));
    const d = await api(`${endpoint}${qs.toString() ? `?${qs}` : ''}`), t = d.totals;
    const redraw = guard(() => drawLocation(box, endpoint, st, scoped));
    const from = input('From', { type: 'date', value: d.from }), to = input('To', { type: 'date', value: d.to });
    const emp = scoped ? null : select('Employee', [['', 'All employees'], ...d.employees.map(e => [e.id, e.name])], st.employeeId || '');
    const job = select('Job', [['', 'All jobs'], ...d.jobs.map(j => [j.id, `#${j.id} ${j.title}`])], st.jobId || '');
    const detail = el('div');
    const apply = () => { st.from = from.ctl.value; st.to = to.ctl.value; st.jobId = job.ctl.value; if (emp) st.employeeId = emp.ctl.value; return redraw(); };
    const quick = days => btn(`Last ${days} days`, () => { st.to = new Date().toISOString().slice(0, 10); st.from = new Date(Date.now() - (days - 1) * 864e5).toISOString().slice(0, 10); return drawLocation(box, endpoint, st, scoped); }, 'btn-outline-secondary');
    const open = id => guard(async () => { detail.replaceChildren(await shiftDetailView(id, () => drawLocation(box, endpoint, st, scoped))); detail.scrollIntoView({ block: 'start' }); });
    const open_alerts = d.alerts.filter(a => !a.acknowledgedAt);
    box.replaceChildren(
      open_alerts.length ? el('div', { class: 'alert alert-danger' }, el('div', { class: 'd-flex align-items-center mb-2' }, el('strong', { text: `${open_alerts.length} location alert${open_alerts.length === 1 ? '' : 's'} need review` }), el('span', { class: 'ms-auto' }, btn('Acknowledge all', async () => { await send('/api/admin/location/alerts/ack-all', 'POST'); await drawLocation(box, endpoint, st, scoped); }, 'btn-outline-dark'))),
        open_alerts.slice(0, 10).map(a => el('div', { class: 'd-flex flex-wrap gap-2 border-top py-1 small' }, el('span', { text: when(a.createdAt) }), el('strong', { text: a.employeeName }), badge(KIND_LABEL[a.kind] || a.kind, 'danger'), el('span', { text: a.message }), el('span', { class: 'ms-auto' }, a.shiftId ? btn('Review', open(a.shiftId), 'btn-outline-secondary') : null, ' ', btn('Dismiss', async () => { await send(`/api/admin/location/alerts/${a.id}/ack`, 'POST'); await drawLocation(box, endpoint, st, scoped); }, 'btn-outline-secondary'))))) : null,
      panel('Clocked in now', d.live.length ? tableOf(['Employee', 'Job', 'Since', 'Status', 'Last location', 'Device', ''], d.live.map(s => el('tr', {}, el('td', { text: s.employeeName }), el('td', { text: s.jobTitle || '\u2014' }), el('td', { text: `${when(s.clockInAt)} (${hrs(s.minutes)})` }),
        el('td', {}, badge(s.offsiteSince ? 'off site' : s.status === 'lunch' ? 'on lunch' : s.status, s.status === 'lunch' ? 'info' : s.status === 'live' && !s.offsiteSince ? 'success' : 'danger'), s.geofence ? null : el('div', { class: 'small text-muted', text: 'no job site set' })),
        el('td', { class: 'small' }, s.last ? [mapsLink(s.last, `\u00b1${Math.round(s.last.accuracy || 0)} m`), ` ${when(s.last.at)}`] : 'none'), el('td', { class: 'small', text: s.deviceLabel }), el('td', {}, btn('Route', open(s.id), 'btn-outline-secondary'))))) : empty('Nobody is clocked in right now.')),
      detail,
      panel('Filters', el('div', { class: 'row align-items-end' }, el('div', { class: 'col-md-2' }, from.wrap), el('div', { class: 'col-md-2' }, to.wrap), emp ? el('div', { class: 'col-md-3' }, emp.wrap) : null, el('div', { class: 'col-md-3' }, job.wrap), el('div', { class: 'col-md-2 mb-3' }, btn('Apply', apply, 'btn-primary'))), el('div', { class: 'd-flex gap-2' }, quick(7), quick(30), quick(90))),
      el('div', { class: 'row g-3 mb-4' }, tile('t1', t.shifts, 'Shifts'), tile('t2', hrs(t.paidMinutes), 'Paid time (on site)'), tile('t3', hrs(t.offsiteMinutes), 'Off-site time (unpaid)'), tile('t4', `${t.distanceKm} km`, 'Distance traveled'),
        tile('t1', t.employees, 'Employees worked'), tile('t2', t.interruptions, 'Location interruptions'), tile('t3', d.unacknowledged, 'Open alerts'), tile('t4', t.stale, 'Stale live shifts')),
      el('div', { class: 'row g-3' }, el('div', { class: 'col-lg-6' }, panel('Hours on the clock per day', barChart(d.byDay, 'minutes', '#7c5cff', 'Hours on the clock per day', m => hrs(m)))), el('div', { class: 'col-lg-6' }, panel('Shifts per day', barChart(d.byDay, 'shifts', '#ff7ab6', 'Shifts per day')))),
      el('div', { class: 'row g-3' }, scoped ? null : el('div', { class: 'col-lg-6' }, panel('Paid hours by employee', hbars(d.byEmployee, 'minutes', i => hrs(i.minutes), i => `#employees/${i.id}`))), el('div', { class: scoped ? 'col-12' : 'col-lg-6' }, panel('Hours by job', hbars(d.byJob, 'minutes', i => hrs(i.minutes), i => i.id ? `#jobs/${i.id}` : '#location')))),
      scoped && d.devices ? panel('Registered devices', d.devices.length ? tableOf(['Device', 'Device ID', 'Platform', 'First seen', 'Last seen'], d.devices.map(x => el('tr', {}, el('td', { text: x.label }), el('td', { class: 'small', text: x.id }), el('td', { text: [x.platform, x.details.platformVersion].filter(Boolean).join(' ') }), el('td', { text: when(x.firstSeen) }), el('td', { text: when(x.lastSeen) })))) : empty('No devices yet. A device is registered the first time this employee clocks in.')) : null,
      scoped ? null : panel('Per employee', d.byEmployee.length ? tableOf(['Employee', 'Shifts', 'Paid time', 'Off site', 'Distance', 'Jobs', 'Interruptions'], d.byEmployee.map(e => el('tr', {}, el('td', {}, el('a', { href: `#employees/${e.id}`, text: e.name })), el('td', { text: String(e.shifts) }), el('td', { text: hrs(e.minutes) }), el('td', { text: hrs(e.offsiteMinutes) }), el('td', { text: `${e.distanceKm} km` }), el('td', { text: String(e.jobs) }), el('td', { text: String(e.interruptions) })))) : empty('No shifts in this period.')),
      panel(`Shift history (${d.shifts.length})`, d.shifts.length ? tableOf([scoped ? 'Date' : 'Employee', 'Job', 'In', 'Out', 'Paid', 'Off site', 'Distance', 'Points', 'Flags', ''], d.shifts.map(s => el('tr', {}, el('td', { text: scoped ? s.clockInAt.slice(0, 10) : s.employeeName }), el('td', { text: s.jobTitle || '\u2014' }), el('td', { text: when(s.clockInAt) }), el('td', { text: s.clockOutAt ? when(s.clockOutAt) : 'on the clock' }),
        el('td', { text: hrs(s.paidMinutes ?? Math.max(0, s.minutes - s.offsiteMinutes)) }), el('td', { text: s.offsiteMinutes ? hrs(s.offsiteMinutes) : '' }), el('td', { text: `${s.distanceKm} km` }), el('td', { text: String(s.points) }),
        el('td', {}, s.closedBy === 'system' ? badge('auto clock-out', 'danger') : null, s.interruptions ? badge(`${s.interruptions} gap${s.interruptions === 1 ? '' : 's'}`, 'warning') : null), el('td', {}, btn('Route', open(s.id), 'btn-outline-secondary'))))) : empty('No shifts in this period.')));
    badges.location = d.unacknowledged;
  }
  const locationPage = async () => {
    const box = el('div');
    view.replaceChildren(el('p', { class: 'text-muted' }, 'Employees are tracked only while clocked in, and only after accepting the location notice. Time away from a job site is not paid, and people are clocked out automatically if location stops.'), box);
    await drawLocation(box, '/api/admin/location', {}, false);
    renderNav('location');
  };

  // ---------- Live board: where every employee is and what they are doing, refreshed automatically
  let liveTimer = null;
  const livePage = async () => {
    clearInterval(liveTimer);
    const box = el('div');
    view.replaceChildren(box);
    const draw = async () => {
      const d = await api('/api/admin/location/live'), t = d.totals;
      const lvl = r => !r.shift ? ['not clocked in', 'secondary'] : r.shift.status === 'lunch' ? ['on lunch', 'info'] : r.shift.offsiteSince ? ['off site', 'danger'] : r.shift.status === 'stale' ? ['signal lost', 'warning'] : ['on site', 'success'];
      const ago = iso => { if (!iso) return 'no fix yet'; const m = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60000)); return m < 1 ? 'just now' : `${m} min ago`; };
      const live = d.rows.filter(r => r.shift), idle = d.rows.filter(r => !r.shift);
      const card = r => { const [label, cls] = lvl(r), s = r.shift; return el('div', { class: 'col-md-6 col-xl-4' }, el('div', { class: 'panel h-100 mb-0' },
        el('div', { class: 'd-flex align-items-center gap-2 mb-1' }, el('a', { class: 'fw-bold text-truncate', href: `#employees/${r.id}`, text: r.name }), el('span', { class: 'ms-auto' }, badge(label, cls))),
        el('div', { class: 'small text-muted mb-2', text: r.roleTitle || 'Employee' }),
        el('div', { class: 'mb-2', text: r.doing }),
        el('div', { class: 'small' }, s ? [`Clocked in ${when(s.clockInAt)} (${hrs(s.minutes)}), ${hrs(r.todayMinutes)} today`] : `${hrs(r.todayMinutes)} logged today`),
        s ? el('div', { class: 'small' }, 'Location: ', s.last ? [mapsLink(s.last, `open map (\u00b1${Math.round(s.last.accuracy || 0)} m)`), `, updated ${ago(s.lastFixAt || s.last.at)}`] : 'waiting for first fix', s.lunchMinutes ? ` \u00b7 lunch ${s.lunchMinutes} min` : '') : null,
        s ? el('div', { class: 'small text-muted', text: `Device: ${s.deviceLabel || 'unknown'}` }) : null,
        r.update ? el('div', { class: 'small mt-2 border-top pt-1' }, el('strong', { text: 'Latest job update: ' }), `${r.update.body.slice(0, 120)} (${ago(r.update.at)})`) : null,
        r.events.length ? el('div', { class: 'small text-muted' }, r.events.map(e => el('div', { text: `${ago(e.at)}: ${EVENT_LABEL[e.kind] || e.kind}` }))) : null,
        s ? el('div', { class: 'mt-2' }, el('a', { class: 'btn btn-sm btn-outline-secondary', href: `#location`, text: 'History' }), ' ', btn('Clock out now', async () => { if (confirm(`Clock ${r.name} out now?`)) { await send(`/api/admin/location/shifts/${s.id}/close`, 'POST'); toast('Shift closed'); await draw(); } }, 'btn-outline-danger')) : null)); };
      box.replaceChildren(
        el('p', { class: 'text-muted' }, `Updated ${new Date(d.at).toLocaleTimeString()}. Refreshes every 20 seconds while this page is open.`),
        d.totals.openAlerts ? el('div', { class: 'alert alert-danger' }, `${t.openAlerts} open location alert${t.openAlerts === 1 ? '' : 's'}. `, el('a', { href: '#location', text: 'Review alerts' })) : null,
        el('div', { class: 'row g-3 mb-4' }, tile('t1', `${t.clockedIn} / ${t.employees}`, 'Clocked in'), tile('t2', t.onSite, 'On site'), tile('t3', t.offSite + t.stale, 'Off site or signal lost'), tile('t4', t.onLunch, 'On lunch')),
        el('h2', { class: 'h5', text: 'Working now' }), live.length ? el('div', { class: 'row g-3 mb-4' }, live.map(card)) : empty('Nobody is clocked in right now.'),
        idle.length ? [el('h2', { class: 'h5', text: 'Not clocked in' }), el('div', { class: 'row g-3' }, idle.map(card))] : null);
      badges.location = t.openAlerts;
    };
    await draw();
    liveTimer = setInterval(() => { if (document.hidden) return; if (!location.hash.startsWith('#live')) { clearInterval(liveTimer); return; } draw().catch(() => {}); }, 20000);
    renderNav('live');
  };

  // ---------- Accounting, taxes and legal paperwork
  let acctYear = new Date().getFullYear();
  const accounting = async () => {
    const d = await api(`/api/admin/accounting?year=${acctYear}`), S = d.summary, base = '/api/admin/accounting', refresh = () => accounting();
    const today = new Date().toISOString().slice(0, 10);
    const year = select('Tax year', Array.from({ length: 6 }, (_, i) => [new Date().getFullYear() - i, new Date().getFullYear() - i]), acctYear);
    year.ctl.addEventListener('change', () => { acctYear = Number(year.ctl.value); refresh(); });
    const dl = (type, label) => el('a', { class: 'btn btn-sm btn-outline-primary', href: `${base}/export?type=${type}&year=${d.year}`, text: label });
    const lvl = { danger: 'danger', warning: 'warning', info: 'info' };
    const months = (() => {
      const W = 640, H = 200, P = 28, max = Math.max(100, ...S.months.flatMap(m => [m.revenueCents, m.expenseCents])), bw = (W - 2 * P) / 12 / 2 - 2;
      const svg = sv('svg', { class: 'chart', viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': `Revenue and expenses by month, ${d.year}` });
      S.months.forEach((m, i) => {
        const x = P + i * (W - 2 * P) / 12, h = v => Math.max(1, v / max * (H - 2 * P));
        svg.append(sv('rect', { x, y: H - P - h(m.revenueCents), width: bw, height: h(m.revenueCents), fill: '#2e7d32' }), sv('rect', { x: x + bw + 2, y: H - P - h(m.expenseCents), width: bw, height: h(m.expenseCents), fill: '#c62828' }), sv('text', { x, y: H - 10 }, m.month.slice(5)));
      });
      return svg;
    })();
    const sale = c => el('div', { class: 'col-6 col-lg-3' }, el('div', { class: 'panel mb-0' }, el('div', { class: 'h4 mb-0', text: money(c[1]) }), el('div', { class: 'small text-muted', text: c[0] })));

    const set = { business_name: input('Business name', { value: d.settings.business_name, maxlength: 150 }), ein: input('EIN', { value: d.settings.ein, maxlength: 20, placeholder: 'XX-XXXXXXX' }), state: input('State', { value: d.settings.state, maxlength: 20 }),
      entity: select('Business type', Object.entries(d.entities), d.settings.entity), income_tax_pct: input('Effective income tax rate (%)', { type: 'number', step: '0.5', value: d.settings.income_tax_pct }),
      payroll_tax_pct: input('Employer payroll tax (%)', { type: 'number', step: '0.01', value: d.settings.payroll_tax_pct }), mileage_rate: input('Mileage rate ($/mile)', { type: 'number', step: '0.001', value: d.settings.mileage_rate }) };

    const ex = { date: input('Date', { type: 'date', value: today }), vendor: input('Vendor or purpose', { maxlength: 150 }), category: select('Category', Object.entries(d.categories).map(([k, v]) => [k, `${v.label}`]), 'materials'),
      amount: input('Amount ($)', { type: 'number', min: '0', step: '0.01' }), miles: input('Miles (mileage only)', { type: 'number', min: '0', step: '0.1' }), method: select('Paid with', d.payMethods.map(x => [x, x]), 'card'),
      jobId: select('Job (optional)', [['', 'Not tied to a job'], ...d.jobList.map(j => [j.id, `#${j.id} ${j.title}`])], ''), memo: input('Memo', { maxlength: 500 }), receipt: input('Receipt (photo or PDF)', { type: 'file', accept: 'image/jpeg,image/png,image/webp,application/pdf' }) };
    const attach = async (kind, id, file) => { await api(`${base}/upload/${kind}/${id}`, { method: 'POST', headers: { 'Content-Type': 'application/octet-stream' }, body: file }); };
    const catLabel = k => d.categories[k]?.label || k;

    const doc = { kind: select('Type', Object.entries(d.docKinds), 'license'), title: input('Title', { maxlength: 200 }), number: input('Number', { maxlength: 100 }), authority: input('Issued by', { maxlength: 150 }),
      issuedOn: input('Issued', { type: 'date' }), expiresOn: input('Expires', { type: 'date' }), notes: input('Notes', { maxlength: 1000 }), file: input('Scan or PDF', { type: 'file', accept: 'image/jpeg,image/png,image/webp,application/pdf' }) };
    const stateBadge = st => badge(st, { 'on file': 'success', ok: 'success', missing: 'danger', expired: 'danger', expiring: 'warning' }[st] || 'secondary');

    view.replaceChildren(
      el('div', { class: 'row g-3 align-items-end mb-2' }, el('div', { class: 'col-md-3' }, year.wrap), el('div', { class: 'col-md-9 d-flex flex-wrap gap-2 mb-3' }, el('a', { class: 'btn btn-sm btn-primary', href: `${base}/export?type=packet&year=${d.year}`, text: `Download ${d.year} accountant packet (ZIP)` }),
        dl('summary', 'Summary PDF'), dl('profit-and-loss', 'Profit & loss'), dl('income', 'Income'), dl('expenses', 'Expenses'), dl('jobs', 'Jobs'), dl('payroll-and-contractor-payments', 'Payroll'), dl('1099-nec-worksheet', '1099 worksheet'), dl('w2-wage-summary', 'W-2 wages'), dl('mileage-log', 'Mileage'), dl('general-journal', 'Journal'), dl('legal-and-compliance-register', 'Legal register'), dl('signed-agreements', 'Signed agreements'), dl('job-liability-records', 'Liability records'))),
      panel('Needs attention', d.alerts.length ? d.alerts.map(a => el('div', { class: `alert alert-${lvl[a.level]} py-2 mb-2`, text: a.message })) : empty('Everything looks in order.')),
      el('div', { class: 'row g-3 mb-3' }, [['Net revenue', S.revenueCents], ['Total expenses', S.expenseTotalCents], ['Net profit', S.netProfitCents], ['Set aside per quarter', S.tax.quarterlyCents]].map(sale)),
      panel(`Revenue and expenses by month (${d.year})`, months, el('p', { class: 'small text-muted mt-2 mb-0', text: 'Green is revenue received (cash basis, before sales tax); red is expenses and labor paid.' })),
      panel('Profit and loss', tableOf(['Line', 'Schedule C', 'Amount'], [
        el('tr', {}, el('td', { text: 'Gross receipts' }), el('td'), el('td', { text: money(S.grossReceiptsCents) })), el('tr', {}, el('td', { text: 'Sales tax collected (not income)' }), el('td'), el('td', { text: `-${money(S.salesTaxCollectedCents)}` })),
        ...S.expenses.map(e => el('tr', {}, el('td', { text: e.label }), el('td', { class: 'small text-muted', text: e.scheduleC }), el('td', { text: money(e.deductibleCents) }))),
        el('tr', {}, el('td', { text: 'Employee wages' }), el('td', { class: 'small text-muted', text: 'Line 26' }), el('td', { text: money(S.wagesCents) })), el('tr', {}, el('td', { text: 'Contract labor' }), el('td', { class: 'small text-muted', text: 'Line 11' }), el('td', { text: money(S.contractorCents) })),
        el('tr', {}, el('td', { text: 'Employer payroll taxes (estimate)' }), el('td', { class: 'small text-muted', text: 'Line 23' }), el('td', { text: money(S.employerTaxCents) })), el('tr', { class: 'fw-bold' }, el('td', { text: 'Net profit' }), el('td'), el('td', { text: money(S.netProfitCents) }))])),
      panel('Estimated taxes', tableOf(['', 'Amount'], [['Self-employment tax', S.tax.selfEmploymentCents], ['Income tax at your effective rate', S.tax.incomeTaxCents], ['Total estimated', S.tax.totalCents], ['Per quarter', S.tax.quarterlyCents]].map(([l, v]) => el('tr', {}, el('td', { text: l }), el('td', { text: money(v) })))), el('p', { class: 'small text-muted mt-2 mb-0', text: `${S.tax.note} Planning estimate only; confirm with your CPA.` })),
      panel('Record an expense', el('div', { class: 'row' }, ['date', 'vendor', 'category', 'amount', 'miles', 'method', 'jobId', 'memo', 'receipt'].map(k => el('div', { class: 'col-md-4' }, ex[k].wrap))),
        btn('Save expense', async () => { const r = await send(`${base}/expenses`, 'POST', { date: ex.date.ctl.value, vendor: ex.vendor.ctl.value, category: ex.category.ctl.value, amount: ex.amount.ctl.value, miles: ex.miles.ctl.value, method: ex.method.ctl.value, jobId: ex.jobId.ctl.value, memo: ex.memo.ctl.value }); if (ex.receipt.ctl.files[0]) await attach('expense', r.id, ex.receipt.ctl.files[0]); toast('Expense saved'); await refresh(); }, 'btn-primary')),
      panel(`Expenses (${d.expenses.length})`, d.expenses.length ? tableOf(['Date', 'Vendor', 'Category', 'Job', 'Amount', 'Receipt', ''], d.expenses.map(x => el('tr', {}, el('td', { text: x.date }), el('td', { text: x.vendor || x.memo }), el('td', { text: catLabel(x.category) }), el('td', { text: x.jobTitle }), el('td', { text: money(x.amountCents) }),
        el('td', {}, x.hasReceipt ? el('a', { href: `${base}/file/expense/${x.id}`, target: '_blank', rel: 'noopener', text: 'View' }) : btn('Attach', async () => { const pick = el('input', { type: 'file', accept: 'image/jpeg,image/png,image/webp,application/pdf' }); pick.addEventListener('change', guard(async () => { await attach('expense', x.id, pick.files[0]); await refresh(); })); pick.click(); })),
        el('td', {}, btn('Delete', async () => { if (confirm('Delete this expense?')) { await send(`${base}/expenses/${x.id}/delete`, 'POST'); await refresh(); } }, 'btn-outline-danger'))))) : empty('No expenses recorded for this year.')),
      panel(`Income received (${d.income.length})`, d.income.length ? tableOf(['Date', 'Estimate', 'Customer', 'Method', 'Received', 'Sales tax'], d.income.map(r => el('tr', {}, el('td', { text: r.date }), el('td', { text: `${r.number} ${r.title}` }), el('td', { text: r.customer }), el('td', { text: r.method }), el('td', { text: money(r.grossCents) }), el('td', { text: money(r.taxCents) })))) : empty('No customer payments recorded for this year. Record them on the estimate.')),
      panel('Job profit', d.jobs.length ? tableOf(['Job', 'Contract', 'Paid', 'Balance', 'Labor', 'Other costs', 'Profit', 'Margin'], d.jobs.map(j => el('tr', {}, el('td', {}, el('a', { href: `#jobs/${j.id}`, text: `#${j.id} ${j.title}` })), el('td', { text: money(j.contractCents) }), el('td', { text: money(j.paidCents) }), el('td', { text: money(j.balanceCents) }), el('td', { text: `${money(j.laborCents)} (${hrs(j.laborMinutes)})` }), el('td', { text: money(j.costCents) }), el('td', { text: money(j.profitCents) }), el('td', { text: j.marginPct == null ? '' : `${j.marginPct}%` })))) : empty('Jobs with estimates, time or expenses appear here.')),
      panel('Workers: tax forms and 1099s', el('p', { class: 'small text-muted', text: `Mark each person as an employee (W-2) or contractor (1099). Contractors paid ${money(d.contractors[0]?.thresholdCents || 200000)} or more in the year need a 1099-NEC. Only the last four digits of a tax ID are stored here.` }),
        d.workers.length ? d.workers.map(w => { const f = { type: select('Type', Object.entries(d.workerTypes), w.type), last4: input('TIN last 4', { maxlength: 4, value: w.last4 || '' }), w4: input('W-4 received', { type: 'date', value: w.w4 || '' }), w9: input('W-9 received', { type: 'date', value: w.w9 || '' }), i9: input('I-9 completed', { type: 'date', value: w.i9 || '' }) };
          return el('div', { class: 'border-top py-2' }, el('strong', { text: `${w.name} \u00B7 paid ${money(w.paidCents)} in ${d.year}` }), el('div', { class: 'row align-items-end mt-1' }, Object.values(f).map(x => el('div', { class: 'col-md-2' }, x.wrap)), el('div', { class: 'col-md-2 mb-3' }, btn('Save', async () => { await send(`${base}/workers/${w.id}`, 'POST', Object.fromEntries(Object.entries(f).map(([k, v]) => [k, v.ctl.value]))); toast('Saved'); await refresh(); }, 'btn-primary')))); }) : empty('No employees yet.')),
      panel('Legal and compliance checklist', tableOf(['Requirement', 'Status'], d.compliance.checklist.map(c => el('tr', {}, el('td', { text: c.label }), el('td', {}, stateBadge(c.status))))), el('p', { class: 'small text-muted mt-2 mb-0', text: 'Requirements differ by city and state. Add each license, policy and registration below with its expiry date and the system will warn you before it lapses.' })),
      panel('Add a legal or compliance document', el('div', { class: 'row' }, Object.values(doc).map(x => el('div', { class: 'col-md-4' }, x.wrap))),
        btn('Save document', async () => { const r = await send(`${base}/docs`, 'POST', Object.fromEntries(Object.entries(doc).filter(([k]) => k !== 'file').map(([k, v]) => [k, v.ctl.value]))); if (doc.file.ctl.files[0]) await attach('doc', r.id, doc.file.ctl.files[0]); toast('Document saved'); await refresh(); }, 'btn-primary')),
      panel(`Document register (${d.compliance.docs.length})`, d.compliance.docs.length ? tableOf(['Document', 'Number', 'Issued by', 'Expires', 'Status', 'File', ''], d.compliance.docs.map(x => el('tr', {}, el('td', { text: `${x.kindLabel}: ${x.title}` }), el('td', { text: x.number }), el('td', { text: x.authority }), el('td', { text: x.expiresOn }), el('td', {}, stateBadge(x.state)),
        el('td', {}, x.hasFile ? el('a', { href: `${base}/file/doc/${x.id}`, target: '_blank', rel: 'noopener', text: 'View' }) : null), el('td', {}, btn('Delete', async () => { if (confirm('Delete this document?')) { await send(`${base}/docs/${x.id}/delete`, 'POST'); await refresh(); } }, 'btn-outline-danger'))))) : empty('Nothing on file yet.')),
      panel(`${d.year} tax calendar`, tableOf(['Date', 'What', 'Notes'], d.deadlines.map(x => el('tr', { class: x.date < today ? 'text-muted' : '' }, el('td', { text: x.date }), el('td', { text: x.name }), el('td', { class: 'small', text: x.note }))))),
      panel('Accounting settings', el('div', { class: 'row' }, Object.values(set).map(x => el('div', { class: 'col-md-4' }, x.wrap))), btn('Save settings', async () => { await send(`${base}/settings`, 'POST', Object.fromEntries(Object.entries(set).map(([k, v]) => [k, v.ctl.value]))); toast('Saved'); await refresh(); }, 'btn-primary'),
        el('p', { class: 'small text-muted mt-3 mb-0', text: 'This tool organizes your books and prepares the numbers and files your accountant needs. It does not file returns or run payroll withholding, and it is not tax or legal advice.' })));
  };

  // ---------- Company overview
  const company = async () => {
    const d = await api('/api/admin/company'), T = d.totals;
    const W = 680, H = 230, P = 30, max = Math.max(100, ...d.trend.flatMap(t => [t.revenueCents, t.expenseCents]));
    const chartSvg = (label, draw) => { const svg = sv('svg', { class: 'chart', viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': label }); draw(svg); return svg; };
    const slot = (W - 2 * P) / 12, month = t => t.month.slice(5);
    const money$ = chartSvg('Payments received and expenses by month for the last 12 months', svg => d.trend.forEach((t, i) => {
      const x = P + i * slot, bw = slot / 2 - 3, h = v => Math.max(1, v / max * (H - 2 * P));
      svg.append(sv('rect', { x, y: H - P - h(t.revenueCents), width: bw, height: h(t.revenueCents), fill: '#2e7d32' }), sv('rect', { x: x + bw + 2, y: H - P - h(t.expenseCents), width: bw, height: h(t.expenseCents), fill: '#c62828' }), sv('text', { x, y: H - 10 }, month(t)));
    }));
    const countChart = (label, keys) => { const m = Math.max(3, ...d.trend.flatMap(t => keys.map(k => t[k[0]]))); return chartSvg(label, svg => d.trend.forEach((t, i) => { const bw = slot / keys.length - 3; keys.forEach((k, j) => { const h = Math.max(1, t[k[0]] / m * (H - 2 * P)); svg.append(sv('rect', { x: P + i * slot + j * (bw + 2), y: H - P - h, width: bw, height: h, fill: k[1] })); }); svg.append(sv('text', { x: P + i * slot, y: H - 10 }, month(t))); })); };
    const sale = (label, c, cls = '') => el('div', { class: 'col-6 col-lg-3' }, el('div', { class: 'panel mb-0' }, el('div', { class: `h4 mb-0 ${cls}`, text: c }), el('div', { class: 'small text-muted', text: label })));
    const named = rows => rows.map(r => ({ name: String(r.name).replace(/_/g, ' '), n: r.n }));
    const legend = (...items) => el('p', { class: 'small text-muted mb-0 mt-2', text: items.join('   ') });
    view.replaceChildren(
      el('div', { class: 'row g-3 mb-4' }, sale('Payments received (12 mo)', money(T.revenueCents)), sale('Expenses and labor (12 mo)', money(T.expenseCents)), sale('Profit before tax', money(T.profitCents), T.profitCents < 0 ? 'text-danger' : 'text-success'), sale('Owed on accepted estimates', money(T.outstandingCents))),
      el('div', { class: 'row g-3 mb-4' }, sale('Open jobs', String(d.people.openJobs)), sale('Customers', String(d.people.customers)), sale('Estimate win rate', d.winRate == null ? 'n/a' : `${d.winRate}%`), sale('Emailable customers', String(d.people.marketable))),
      panel('Money in and out by month', money$, legend('Green: payments received.', 'Red: expenses plus approved labor.')),
      el('div', { class: 'row g-3' },
        el('div', { class: 'col-lg-6' }, panel('New leads and customers', countChart('New leads and customers by month', [['leads', '#7c5cff'], ['customers', '#2e7d32']]), legend('Purple: leads.', 'Green: new customers.'))),
        el('div', { class: 'col-lg-6' }, panel('Jobs finished and crew hours', countChart('Jobs finished and hours by month', [['jobsDone', '#ef6c00'], ['hours', '#0277bd']]), legend('Orange: jobs finished.', 'Blue: hours worked.')))),
      el('div', { class: 'row g-3 mt-0' },
        el('div', { class: 'col-md-4' }, panel('Estimate pipeline', tableOf(['Stage', 'Count', 'Value'], d.pipeline.map(p => el('tr', {}, el('td', { text: p.status }), el('td', { text: String(p.n) }), el('td', { text: money(p.cents) })))))),
        el('div', { class: 'col-md-4' }, panel('Customers', bars(named(d.customersByStatus), 'No customers yet.'))),
        el('div', { class: 'col-md-4' }, panel('Jobs', bars(named(d.jobsByStatus), 'No jobs yet.')))),
      el('div', { class: 'row g-3 mt-0' },
        el('div', { class: 'col-md-4' }, panel('Where leads come from', bars(named(d.leadsByType), 'No leads yet.'))),
        el('div', { class: 'col-md-4' }, panel('Where the money goes', bars(d.expensesByCategory.map(r => ({ name: r.name.replace(/_/g, ' '), n: r.n })), 'No expenses logged.'))),
        el('div', { class: 'col-md-4' }, panel('Crew hours, last 30 days', d.crew.length ? bars(d.crew.map(c => ({ name: `${c.name} (${c.jobs} job${c.jobs === 1 ? '' : 's'})`, n: c.hours })), '') : empty('No hours yet.')))),
      panel('Top customers by payments', d.topCustomers.length ? tableOf(['Customer', 'Jobs', 'Paid'], d.topCustomers.map(c => el('tr', {}, el('td', {}, el('a', { href: `#customers/${c.id}`, text: c.name })), el('td', { text: String(c.jobs) }), el('td', { text: money(c.cents) })))) : empty('No payments recorded yet.')),
      el('p', { class: 'small text-muted', text: `Updated ${when(d.generatedAt)}. Holiday emails sent so far: ${d.holidays.emailsSent}.` })
    );
  };

  // ---------- Holiday sales and greetings
  const zoho = async () => {
    const base = '/api/admin/zoho';
    const zohoRender = async () => {
      const st = await api(`${base}/status`);
      const f = {
        id: input('Client ID', { value: st.clientId, maxlength: 120, disabled: st.credentialsFromEnv }), secret: input(st.hasSecret ? 'Client secret (saved, leave blank to keep)' : 'Client secret', { type: 'password', maxlength: 120, autocomplete: 'off', disabled: st.credentialsFromEnv }),
        dc: input('Zoho data center', {}, 'select'), since: input('Only sync records dated on or after', { type: 'date', value: st.since }),
        expense: input('Default expense account ID', { value: st.expenseAccount, maxlength: 40 }), paid: input('Paid-through account ID (bank or card)', { value: st.paidThrough, maxlength: 40 }),
        deposit: input('Deposit-to account ID for customer payments', { value: st.depositAccount, maxlength: 40 }), income: input('Income account ID for invoice lines (optional)', { value: st.incomeAccount, maxlength: 40 }),
        auto: input('Automatic sync', {}, 'select')
      };
      for (const [k, v] of Object.entries(st.dcs)) f.dc.ctl.append(el('option', { value: k, text: `${v} (zoho.${k})`, selected: k === st.dc }));
      f.auto.ctl.append(el('option', { value: '0', text: 'Off: sync only when I press Sync now', selected: !st.auto }), el('option', { value: '1', text: 'On: sync every 30 minutes', selected: st.auto }));
      const gather = () => ({ clientId: f.id.ctl.value, clientSecret: f.secret.ctl.value, dc: f.dc.ctl.value, since: f.since.ctl.value, expenseAccount: f.expense.ctl.value, paidThrough: f.paid.ctl.value, depositAccount: f.deposit.ctl.value, incomeAccount: f.income.ctl.value, auto: f.auto.ctl.value === '1' });
      const save = async () => { await send(`${base}/settings`, 'POST', gather()); toast('Zoho settings saved.'); };
      const refresh = async () => { view.replaceChildren(await zohoRender()); };
      const code = input('Grant code from the Zoho API console (Self Client)', { maxlength: 200, autocomplete: 'off' });
      const out = el('pre', { class: 'small bg-light border rounded p-2 mt-2 mb-0 d-none', tabindex: '0' });
      const show = t => { out.textContent = t; out.classList.remove('d-none'); };
      const rep = el('div', { class: 'mt-3' });
      const runReport = async name => {
        const r = await api(`${base}/reports/${name}`);
        rep.replaceChildren(el('h3', { class: 'h6', text: `${r.title}, ${r.from} to ${r.to}` }), r.rows.length ? tableOf(['Account', 'Amount'], r.rows.map(x => el('tr', {}, el('td', { text: `${'\u00A0\u00A0'.repeat(Math.min(x.depth, 5))}${x.name}` }), el('td', { class: 'text-end', text: money(Math.round(x.total * 100)) })))) : empty('Zoho returned no rows for this period.'));
      };
      if (!st.enabled) return el('div', {}, el('div', { class: 'panel' }, el('div', { class: 'd-flex flex-wrap justify-content-between gap-2 mb-2' }, el('h2', { class: 'mb-0', text: 'Zoho Books' }), badge('Plugin off', 'secondary')),
        el('p', { class: 'text-muted', text: 'This optional plugin is turned off. Nothing is sent to or read from Zoho. Turn it on to connect and sync your books.' }), btn('Turn on', async () => { await send(`${base}/enable`, 'POST', { enabled: true }); await refresh(); }, 'btn-primary')));
      const pend = st.pending, linkN = k => st.links[k] || 0;
      return el('div', {},
        el('div', { class: 'panel' }, el('div', { class: 'd-flex flex-wrap align-items-center justify-content-between gap-2 mb-2' }, el('h2', { class: 'mb-0', text: 'Zoho Books' }), btn('Turn plugin off', async () => { if (!confirm('Turn off the Zoho Books plugin? Syncing stops; your connection is kept.')) return; await send(`${base}/enable`, 'POST', { enabled: false }); await refresh(); }, 'btn-outline-secondary'), st.connected ? badge(`Connected: ${st.orgName || st.orgId}`, 'success') : badge(st.hasToken ? 'Choose an organization' : 'Not connected', 'warning')),
          el('p', { class: 'text-muted mb-0', text: 'Accepted estimates become invoices, customer payments are applied to them, and expenses and labor payments become Zoho expenses. Nothing is deleted in Zoho. Licensing and online payments stay with this system.' })),
        panel('1. Connect', el('p', { class: 'small text-muted', text: `Create a Self Client at api-console.zoho.${st.dc} with scope ${st.scope}, generate a grant code and paste it below. Or use the server flow: add ${st.redirectUri} as the authorized redirect URI of a Server-based Application.` }),
          el('div', { class: 'row g-2' }, [f.id, f.secret, f.dc, f.since, f.expense, f.paid, f.deposit, f.income, f.auto].map(x => el('div', { class: 'col-sm-6 col-lg-4' }, x.wrap))),
          el('div', { class: 'd-flex flex-wrap gap-2 mb-3' }, btn('Save settings', async () => { await save(); await refresh(); }, 'btn-primary'),
            btn('Sign in with Zoho', async () => { await save(); const r = await api(`${base}/authorize`); location.href = r.url; })),
          el('div', { class: 'row g-2 align-items-end' }, el('div', { class: 'col-md-8' }, code.wrap), el('div', { class: 'col-md-4 mb-3' }, btn('Connect with grant code', async () => { await save(); const r = await send(`${base}/connect`, 'POST', { code: code.ctl.value }); toast(r.connected ? 'Connected to Zoho Books.' : 'Connected. Now choose your organization.'); await refresh(); }, 'btn-success'))),
          st.hasToken && !st.connected ? btn('Pick my organization', async () => {
            const r = await api(`${base}/organizations`);
            if (r.selected) return refresh();
            const pick = input('Organization', {}, 'select'); for (const o of r.organizations) pick.ctl.append(el('option', { value: o.id, text: o.name }));
            const go = btn('Use this organization', async () => { await send(`${base}/organization`, 'POST', { id: pick.ctl.value }); await refresh(); }, 'btn-primary');
            view.querySelector('.zoho-org')?.replaceChildren(pick.wrap, go);
          }) : null, el('div', { class: 'zoho-org mt-2' })),
        st.connected ? panel('2. Sync', el('div', { class: 'row g-3 mb-3' }, [['Invoices waiting', pend.invoices, `${linkN('invoice')} in Zoho`], ['Payments waiting', pend.payments, `${linkN('payment')} in Zoho`], ['Expenses and labor waiting', pend.expenses, `${linkN('expense') + linkN('payroll')} in Zoho`], ['Customers in Zoho', linkN('customer'), st.lastSync ? `Last sync ${new Date(st.lastSync).toLocaleString()}` : 'Never synced']].map(([a, b, c]) => el('div', { class: 'col-6 col-lg-3' }, el('div', { class: 'stat' }, el('div', { class: 'small text-muted', text: a }), el('div', { class: 'h4 mb-0', text: String(b) }), el('div', { class: 'small text-muted', text: c }))))),
          el('div', { class: 'd-flex flex-wrap gap-2' }, ...[['Sync everything now', 'all', 'btn-primary'], ['Invoices', 'invoices'], ['Payments', 'payments'], ['Expenses and labor', 'expenses']].map(([label, scope, cls]) => btn(label, async () => {
            const r = (await send(`${base}/sync`, 'POST', { scope })).result;
            show(`Customers ${r.customers}, invoices ${r.invoices}, payments ${r.payments}, expenses ${r.expenses}, labor ${r.payroll}. Errors: ${r.errors}.${r.more ? ' More records are waiting; run Sync again (Zoho limits calls per minute).' : ''}`); toast(`Sync finished: ${r.customers + r.invoices + r.payments + r.expenses + r.payroll} sent, ${r.errors} errors${r.more ? ', more waiting' : ''}.`, r.errors ? 'warning' : 'success'); await refresh();
          }, cls || 'btn-outline-primary')), btn('Load my accounts', async () => {
            const r = await api(`${base}/accounts`);
            show(`Copy an account ID into the fields above.\n\nBank and card accounts:\n${r.banks.map(a => `${a.id}  ${a.name}`).join('\n')}\n\nAccounts:\n${r.accounts.map(a => `${a.id}  ${a.name} (${a.type})`).join('\n')}`);
          }), btn('Disconnect', async () => { if (!confirm('Disconnect from Zoho Books? Records already in Zoho stay there.')) return; await send(`${base}/disconnect`, 'POST', {}); await refresh(); }, 'btn-outline-danger')), out) : null,
        st.connected ? panel('3. Books and reports from Zoho', el('div', { class: 'd-flex flex-wrap gap-2' }, Object.entries(st.reports).map(([k, v]) => btn(v, () => runReport(k)))), rep) : null,
        panel('Sync log', st.log.length ? tableOf(['When', 'Type', 'Record', 'Result'], st.log.map(l => el('tr', {}, el('td', { text: new Date(l.at).toLocaleString() }), el('td', { text: l.kind }), el('td', { text: l.local_id }), el('td', {}, badge(l.ok ? 'OK' : 'Error', l.ok ? 'success' : 'danger'), el('span', { class: 'ms-2 small', text: l.ok ? '' : l.message }))))) : empty('Nothing has synced yet.')));
    };
    view.replaceChildren(await zohoRender());
  };
  const seo = async () => {
    const draw = async () => {
      const st = await api('/api/admin/seo');
      const when = v => v ? new Date(v).toLocaleString() : 'never';
      view.replaceChildren(panel('SEO files', el('p', { class: 'text-muted', text: 'sitemap.xml, robots.txt and llms.txt are generated by the system and refresh automatically whenever site content changes. Page dates only move when a page really changes.' }),
        el('div', { class: 'table-responsive' }, el('table', { class: 'table align-middle' }, el('thead', {}, el('tr', {}, ...['File', 'Size', 'Updated'].map(h => el('th', { text: h })))), el('tbody', {}, ...st.files.map(f => el('tr', {}, el('td', {}, el('a', { href: `/${f.name}`, target: '_blank', rel: 'noopener', text: f.name })), el('td', { text: f.missing ? 'missing' : `${f.bytes.toLocaleString()} bytes` }), el('td', { text: f.missing ? '' : when(f.updatedAt) })))))),
        el('p', { class: 'small', text: st.stats ? `Last generation: ${st.stats.pages} pages in the sitemap, ${st.stats.changed} new or changed, ${st.stats.removed} removed (${when(st.stats.generatedAt)}).` : 'Not generated yet.' }),
        el('p', { class: 'small text-muted', text: `Automatic updates: ${st.auto ? 'on' : 'off'}. ${st.lastRun ? `Last run ${when(st.lastRun)} (${st.lastReason}).` : ''}` }),
        st.lastError ? el('pre', { class: 'small text-danger', text: st.lastError }) : null,
        btn(st.running ? 'Regenerating\u2026' : 'Regenerate now', async () => { await api('/api/admin/seo/regenerate', { method: 'POST', body: '{}', headers: { 'Content-Type': 'application/json' } }); toast('SEO files regenerated'); draw(); }, 'btn-primary')));
    };
    await draw();
  };
  const security = async () => {
    const days = input('Period', {}, 'select'); [[1, 'Last 24 hours'], [7, 'Last 7 days'], [30, 'Last 30 days']].forEach(([v, t]) => days.ctl.append(el('option', { value: v, text: t, selected: v === 7 })));
    const only = input('Show', {}, 'select'); [['', 'All events'], ['warn', 'Warnings only']].forEach(([v, t]) => only.ctl.append(el('option', { value: v, text: t })));
    const out = el('div');
    const draw = async () => {
      const d = await api(`/api/admin/security?days=${days.ctl.value}&severity=${only.ctl.value}&limit=300`);
      out.replaceChildren(el('div', { class: 'd-flex flex-wrap gap-2 mb-3' }, ...(d.summary.length ? d.summary.map(s => badge(`${s.kind.replace(/_/g, ' ')}: ${s.n}`, /failed|gps_|shared/.test(s.kind) ? 'warning' : 'secondary')) : [el('span', { class: 'text-muted', text: 'No events in this period.' })])),
        d.events.length ? tableOf(['When', 'Event', 'Account', 'IP', 'Detail'], d.events.map(e => el('tr', {}, el('td', { text: new Date(e.at).toLocaleString() }), el('td', {}, badge(e.kind.replace(/_/g, ' '), e.severity === 'warn' ? 'warning' : 'secondary')), el('td', { text: e.email || (e.userId ? `user ${e.userId}` : '') }), el('td', { text: e.ip || '' }), el('td', { text: e.detail || '' })))) : null);
    };
    days.ctl.addEventListener('change', draw); only.ctl.addEventListener('change', draw);
    view.replaceChildren(panel('Security log', el('p', { class: 'text-muted', text: 'Sign-in failures, account lockouts, fake-GPS and device-sharing findings, and admin overrides of time clock records. Accounts lock for 15 minutes after 8 failed sign-ins.' }), el('div', { class: 'row g-2 mb-3' }, el('div', { class: 'col-sm-4' }, days.wrap), el('div', { class: 'col-sm-4' }, only.wrap)), out));
    await draw();
  };
  const holidays = async () => {
    const d = await api('/api/admin/holidays'), base = '/api/admin/holidays';
    const master = input('Automatic holiday emails', {}, 'select');
    master.ctl.append(el('option', { value: '1', text: 'On: send greetings and sales automatically', selected: d.master }), el('option', { value: '0', text: 'Off: send nothing', selected: !d.master }));
    const addr = input('Mailing address shown in the email footer (required by CAN-SPAM)', { value: d.address, maxlength: 200, placeholder: 'Budget Bath Solutions, 123 Main St, Aurora, IL 60505' });
    const code = input('Check a holiday code', { maxlength: 40, placeholder: 'BLACKFRIDAY26' }), codeOut = el('p', { class: 'mb-0 small', role: 'status' });
    const campaignRow = c => el('tr', {}, el('td', { text: c.name }), el('td', { text: c.send_on }), el('td', { text: c.pct ? `${c.pct}% off, ${c.code}, through ${c.valid_through}` : 'Greeting only' }), el('td', {}, badge(c.status, c.status === 'done' ? 'success' : 'warning')), el('td', { text: `${c.sent} sent${c.failed ? `, ${c.failed} failed` : ''} of ${c.recipients}` }));
    const card = h => {
      const f = {
        enabled: input('Send this holiday', {}, 'select'), sale: input('Include a discount', {}, 'select'),
        pct: input('Discount (%)', { type: 'number', min: '1', max: '90', value: h.pct }), lead: input('Send how many days before', { type: 'number', min: '0', max: '30', value: h.lead }),
        tail: input('Offer stays valid days after', { type: 'number', min: '0', max: '60', value: h.tail }), code: input('Code prefix (year is added)', { value: h.code, maxlength: 20 }),
        subject: input('Custom subject (optional)', { value: h.subject, maxlength: 150, placeholder: `${h.greeting} from Budget Bath Solutions` }), message: input('Extra message (optional)', { rows: '2', maxlength: 1000 }, 'textarea')
      };
      f.enabled.ctl.append(el('option', { value: '1', text: 'Yes', selected: h.enabled }), el('option', { value: '0', text: 'No', selected: !h.enabled }));
      f.sale.ctl.append(el('option', { value: '1', text: 'Yes, with a code', selected: h.sale }), el('option', { value: '0', text: 'No, greeting only', selected: !h.sale }));
      f.message.ctl.value = h.message;
      const out = el('pre', { class: 'small bg-light border rounded p-2 mt-2 mb-0 d-none', tabindex: '0' });
      const gather = () => ({ enabled: f.enabled.ctl.value === '1', sale: f.sale.ctl.value === '1', pct: Number(f.pct.ctl.value), lead: Number(f.lead.ctl.value), tail: Number(f.tail.ctl.value), code: f.code.ctl.value, subject: f.subject.ctl.value, message: f.message.ctl.value });
      const save = async () => { await send(`${base}/${h.key}`, 'POST', gather()); toast(`${h.name} saved.`); };
      const camp = h.campaign ? badge(h.campaign.status === 'done' ? `Sent ${h.campaign.sent}` : 'Sending', h.campaign.status === 'done' ? 'success' : 'warning') : badge(h.enabled ? 'Scheduled' : 'Off', h.enabled ? 'primary' : 'secondary');
      return el('article', { class: 'panel' },
        el('div', { class: 'd-flex flex-wrap justify-content-between gap-2 mb-2' }, el('div', {}, el('h3', { class: 'h5 mb-0', text: `${h.name}, ${new Date(`${h.next.holidayOn}T12:00:00Z`).toLocaleDateString(undefined, { timeZone: 'UTC', month: 'long', day: 'numeric', year: 'numeric' })}` }), el('div', { class: 'small text-muted', text: `Greeting: "${h.greeting}". Goes out ${h.next.sendOn}${h.sale ? `, offer through ${h.next.validThrough}, code ${h.next.code}` : ''}.` })), camp),
        el('div', { class: 'row g-2' }, Object.values(f).map(x => el('div', { class: 'col-sm-6 col-lg-3' }, x.wrap))),
        el('div', { class: 'd-flex flex-wrap gap-2' }, btn('Save', save, 'btn-primary'),
          btn('Preview', async () => { const r = await send(`${base}/${h.key}/preview`, 'POST'); out.textContent = `${r.subject}\n\n${r.text}`; out.classList.remove('d-none'); }),
          btn('Send a test to me', async () => { await save(); const r = await send(`${base}/${h.key}/test`, 'POST'); toast(`Test sent to ${r.to}.`); }),
          btn('Send to customers now', async () => { if (!confirm(`Send ${h.name} ${h.next.year} to ${d.audience.eligible} customers right now?`)) return; await save(); await send(`${base}/${h.key}/send-now`, 'POST'); toast('Sending started.'); holidays(); }, 'btn-outline-danger')), out);
    };
    view.replaceChildren(
      panel('Holiday greetings and sales', el('p', { class: 'text-muted', text: `Every holiday email opens with a warm greeting, for example "Merry Christmas" or "Happy Thanksgiving", and sale holidays add a discount code. Emails go out automatically at ${d.sendHour}am ${d.timezone} to ${d.audience.eligible} customers. ${d.audience.optedOut} have opted out and are never emailed. Each email has a one-click unsubscribe link.` }),
        master.wrap, addr.wrap, btn('Save settings', async () => { await send(`${base}/settings`, 'POST', { master: master.ctl.value === '1', address: addr.ctl.value }); toast('Settings saved.'); }, 'btn-primary')),
      panel('Look up a code', el('div', { class: 'd-flex flex-wrap gap-2 align-items-end' }, code.wrap, el('div', { class: 'mb-3' }, btn('Check', async () => { const r = await api(`${base}/code?code=${encodeURIComponent(code.ctl.value)}`); codeOut.textContent = r.message; codeOut.className = `mb-0 small ${r.valid ? 'text-success' : 'text-danger'}`; }))), codeOut, el('p', { class: 'small text-muted mb-0 mt-2', text: 'When a customer mentions a code, check it here, then enter the discount on their estimate.' })),
      ...d.holidays.map(card),
      panel('Campaign history', d.campaigns.length ? tableOf(['Campaign', 'Sent on', 'Offer', 'Status', 'Results'], d.campaigns.map(campaignRow)) : empty('Nothing sent yet.'))
    );
  };

  const routes = { dashboard, customers, employees, live: livePage, location: locationPage, jobs, estimator, accounting, company, zoho, seo, security, holidays, hr, knowledge, contacts, support, forum, reviews, projects, images, visitors, users, settings };
  async function route() {
    const key = location.hash.slice(1).split('/')[0], id = routes[key] ? key : 'dashboard';
    $('#admin-title').textContent = SECTIONS.find(s => s[0] === id)[1];
    renderNav(id);
    view.replaceChildren(el('p', { class: 'text-muted', text: 'Loading...' }));
    try { await routes[id](); } catch (e) { if (e.status === 401 || e.status === 403) return boot(); view.replaceChildren(el('div', { class: 'alert alert-danger', text: e.message })); }
    const off = $('#side'); if (off && window.bootstrap) bootstrap.Offcanvas.getInstance(off)?.hide();
  }

  async function boot() {
    let me = null;
    try { me = (await api('/api/auth/me')).user; window.bbsI18n?.adopt(me.lang); } catch { /* signed out */ }
    $('#admin-app').hidden = !(me && me.admin); $('#admin-login').hidden = Boolean(me && me.admin);
    if (me && me.admin) { $('#admin-user').textContent = me.email; try { badges.hr = (await api('/api/admin/hr')).pipeline.new; badges.location = (await api(`/api/admin/location?from=${new Date().toISOString().slice(0, 10)}&to=${new Date().toISOString().slice(0, 10)}`)).unacknowledged; } catch { /* optional */ } route(); }
    else if (me) { const st = $('#login-form .form-status'); st.textContent = 'This account does not have admin access.'; }
  }
  $('#login-form').addEventListener('submit', async e => {
    e.preventDefault(); const st = e.target.querySelector('.form-status'); st.textContent = '';
    try { await send('/api/auth/login', 'POST', { email: $('#lg-email').value, password: $('#lg-pass').value }); await boot(); } catch (err) { st.textContent = err.message; }
  });
  $('#logout').addEventListener('click', async () => { await send('/api/auth/logout', 'POST', {}); boot(); });
  window.addEventListener('hashchange', () => { if (!$('#admin-app').hidden) route(); });
  boot();
})();
