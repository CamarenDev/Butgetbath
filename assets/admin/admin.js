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
    ['dashboard', 'Dashboard', '\u25A6'], ['customers', 'Customers', '\u2616'], ['employees', 'Employees', '\u2692'], ['jobs', 'Jobs', '\u2302'], ['estimator', 'Estimator', '\u2630'], ['hr', 'HR', '\u270E'], ['knowledge', 'Knowledge base', '\u2139'], ['contacts', 'Contacts', '\u2709'], ['support', 'Support', '\u260E'], ['forum', 'Forum', '\u2756'],
    ['reviews', 'Reviews', '\u2605'], ['projects', 'Projects', '\u25A3'], ['images', 'Images', '\u25A8'], ['visitors', 'Visitors', '\u2197'], ['users', 'Users', '\u263A'], ['settings', 'Settings', '\u2699']
  ];
  let badges = {};
  const renderNav = current => {
    const nav = $('#admin-nav'); nav.replaceChildren();
    for (const [id, label, glyph] of SECTIONS) {
      const n = badges[id];
      nav.append(el('a', { class: `nav-link${id === current ? ' active' : ''}`, href: `#${id}`, 'aria-current': id === current ? 'page' : null }, el('span', { 'aria-hidden': 'true', text: glyph }), label, n ? el('span', { class: 'nav-badge', text: String(n) }) : null));
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
  const visitors = async () => {
    const s = await api('/api/admin/stats');
    view.replaceChildren(
      el('div', { class: 'row g-3 mb-4' }, tile('t1', s.today.views, 'Views today'), tile('t2', s.today.visitors, 'Visitors today'), tile('t3', s.week.views, 'Views, 7 days'), tile('t4', s.month.visitors, 'Visitors, 30 days')),
      panel('Last 30 days', chart(s.series)),
      el('div', { class: 'row g-3' }, el('div', { class: 'col-md-4' }, panel('Top pages', bars(s.topPages, 'No data yet.'))), el('div', { class: 'col-md-4' }, panel('Referrers', bars(s.referrers, 'No data yet.'))), el('div', { class: 'col-md-4' }, panel('Devices', bars(s.devices, 'No data yet.'))))
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
    let statuses = [];
    const load = async () => {
      const r = await api(`/api/admin/customers?q=${encodeURIComponent(search.ctl.value)}`);
      statuses = r.statuses;
      holder.replaceChildren(r.customers.length ? tableOf(['Customer', 'Contact', 'Status', 'Files', 'History', 'Updated'], r.customers.map(c => el('tr', {},
        el('td', {}, el('a', { href: `#customers/${c.id}`, class: 'fw-semibold', text: c.name }), el('div', { class: 'small text-muted', text: c.address })),
        el('td', {}, c.email ? el('div', { text: c.email }) : null, el('div', { class: 'small', text: c.phone })), el('td', {}, badge(c.status, c.status === 'active' ? 'success' : c.status === 'lead' ? 'warning' : 'secondary')),
        el('td', { text: String(c.fileCount) }), el('td', { text: String(c.entryCount) }), el('td', { text: when(c.updatedAt) })))) : empty('No customers found.'));
    };
    await load();
    let timer; search.ctl.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(guard(load), 250); });
    view.replaceChildren(
      panel('Add a customer', customerForm({}, statuses, async v => { const r = await send('/api/admin/customers', 'POST', v); location.hash = `#customers/${r.id}`; }, 'Create customer')),
      panel('All customers', el('div', { class: 'd-flex gap-2 align-items-end mb-3' }, el('div', { class: 'flex-grow-1' }, search.wrap), btn('Import users & estimate requests', async () => { const r = await send('/api/admin/customers/import', 'POST'); toast(`${r.added} customer(s) added`); await load(); })), holder));
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
    const pay = { amount: input('Amount ($)', { type: 'number', min: '0.01', step: '0.01' }), paidOn: input('Date', { type: 'date', value: new Date().toISOString().slice(0, 10) }), method: input('Method', { maxlength: 60, placeholder: 'Check, Zelle, cash' }), memo: input('Memo', { maxlength: 300 }) };
    const ct = input('Contract title', { maxlength: 150 }), cb = input('Contract text', { rows: 8, maxlength: 20000 }, 'textarea');
    const ft = input('Title', { maxlength: 200 }), fp = input('File', { type: 'file', accept: 'image/jpeg,image/png,image/webp,application/pdf,.docx,.xlsx' });
    const answer = r => { const reply = input('Reply (emailed to employee)', { rows: 2, maxlength: 2000 }, 'textarea'); return el('div', { class: 'mt-2' }, reply.wrap, el('div', { class: 'd-flex gap-2' }, ['approved', 'denied'].map(s => btn(s === 'approved' ? 'Approve' : 'Deny', async () => { await send(`/api/admin/employee-requests/${r.id}/respond`, 'POST', { status: s, response: reply.ctl.value }); await refresh(); }, s === 'approved' ? 'btn-success' : 'btn-outline-danger')))); };
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
      panel('Requests', d.requests.length ? d.requests.map(r => el('div', { class: 'border-top py-2' }, el('div', { class: 'd-flex gap-2 align-items-center' }, el('strong', { text: r.subject }), sBadge(r.status), el('span', { class: 'small text-muted', text: `${r.typeLabel} \u00B7 ${when(r.createdAt)}` })), r.body ? el('div', { class: 'pre-wrap', text: r.body }) : null, r.response ? el('div', { class: 'small', text: `Reply: ${r.response}` }) : null, r.status === 'pending' ? answer(r) : null)) : empty('No requests.')),
      panel('Contracts', el('div', { class: 'mb-3' }, ct.wrap, cb.wrap, btn('Send contract for signature', async () => { await send(`${base}/contracts`, 'POST', { title: ct.ctl.value, body: cb.ctl.value }); toast('Contract sent'); await refresh(); }, 'btn-primary')),
        d.contracts.length ? d.contracts.map(c => el('details', { class: 'border-top py-2' }, el('summary', {}, el('strong', { text: c.title }), ' ', sBadge(c.status), c.signedAt ? el('span', { class: 'small text-muted', text: ` signed by ${c.signedName} ${when(c.signedAt)}` }) : null), el('div', { class: 'pre-wrap small my-2', text: c.body }),
          c.status === 'pending' ? btn('Void', async () => { if (confirm('Void this contract?')) { await send(`/api/admin/contracts/${c.id}/void`, 'POST'); await refresh(); } }, 'btn-outline-danger') : null)) : empty('No contracts yet.')),
      panel(`Documents (${d.files.length})`, el('div', { class: 'row g-2 align-items-end' }, el('div', { class: 'col-md-5' }, ft.wrap), el('div', { class: 'col-md-5' }, fp.wrap), el('div', { class: 'col-md-2 mb-3' }, btn('Upload', async () => { const file = fp.ctl.files[0]; if (!file) return toast('Choose a file.', 'danger'); await api(`${base}/files`, { method: 'POST', headers: { 'X-Filename': encodeURIComponent(file.name), 'X-Title': encodeURIComponent(ft.ctl.value) }, body: file }); await refresh(); }, 'btn-primary'))),
        d.files.map(x => el('div', { class: 'd-flex gap-2 border-top py-2' }, el('a', { href: `/api/admin/employee-files/${x.id}`, target: '_blank', rel: 'noopener', text: x.title || x.name }), el('span', { class: 'small text-muted', text: `${fmtSize(x.size)} \u00B7 from ${x.uploadedBy}` }), el('span', { class: 'ms-auto' }, btn('Delete', async () => { if (confirm('Delete this file?')) { await send(`/api/admin/employee-files/${x.id}/delete`, 'POST'); await refresh(); } }, 'btn-outline-danger'))))),
      panel('Assigned jobs', d.jobs.length ? el('ul', { class: 'mb-0' }, d.jobs.map(j => el('li', {}, el('a', { href: `#jobs/${j.id}`, text: `#${j.id} ${j.title}` }), ' ', sBadge(j.status)))) : empty('Not assigned to any jobs.')));
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
    const d = await api(`/api/admin/jobs/${id}`), j = d.job, base = `/api/admin/jobs/${id}`, refresh = () => jobDetail(id);
    const f = { title: input('Title', { value: j.title, maxlength: 150 }), area: input('Area', { value: j.area, maxlength: 100 }), address: input('Address', { value: j.address, maxlength: 300 }), scheduledAt: input('Scheduled', { value: j.scheduledAt, maxlength: 40 }),
      status: select('Status', d.statuses.map(s => [s, s.replace('_', ' ')]), j.status), customerId: select('Customer', [['', 'None'], ...d.customers.map(c => [c.id, c.name])], j.customerId ?? '') };
    const desc = input('Description', { rows: 4, maxlength: 5000 }, 'textarea'); desc.ctl.value = j.description;
    const assigned = new Set(d.assigned.map(a => a.id)), boxes = d.employees.map(e => ({ e, box: el('input', { class: 'form-check-input', type: 'checkbox', id: `as-${e.id}`, checked: assigned.has(e.id) }) }));
    const upd = input('Post an update (visible to assigned employees)', { rows: 2, maxlength: 2000 }, 'textarea');
    view.replaceChildren(
      el('p', {}, el('a', { href: '#jobs', text: '\u2190 All jobs' })),
      panel(`Job #${j.id}`, el('div', { class: 'row' }, Object.values(f).map(x => el('div', { class: 'col-md-6' }, x.wrap))), desc.wrap,
        el('div', { class: 'd-flex gap-2' }, btn('Save job', async () => { await send(base, 'POST', { ...Object.fromEntries(Object.entries(f).map(([k, x]) => [k, x.ctl.value])), description: desc.ctl.value }); toast('Saved'); await refresh(); }, 'btn-primary'),
          btn('Delete job', async () => { if (confirm('Delete this job?')) { await send(`${base}/delete`, 'POST'); location.hash = '#jobs'; } }, 'btn-outline-danger'))),
      panel('Assigned employees', d.interested.length ? el('div', { class: 'alert alert-warning' }, el('strong', { text: 'Interested: ' }), d.interested.map(i => `${i.name}${i.body ? ` (${i.body})` : ''}`).join(', '), el('div', { class: 'small', text: 'Tick them below and save, or answer under Employees \u2192 Requests.' })) : null,
        boxes.length ? boxes.map(({ e, box }) => el('div', { class: 'form-check' }, box, el('label', { class: 'form-check-label', for: box.id, text: e.name }))) : empty('No active employees.'),
        btn('Save assignments', async () => { await send(`${base}/assign`, 'POST', { employeeIds: boxes.filter(b => b.box.checked).map(b => b.e.id) }); toast('Assignments saved'); await refresh(); }, 'btn-primary mt-3')),
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
      return el('details', { class: 'panel' }, el('summary', {}, el('strong', { text: a.name }), ' ', sBadge(a.status), a.rating ? el('span', { class: 'ms-2', text: '\u2605'.repeat(a.rating) }) : null, el('span', { class: 'small text-muted', text: ` ${(x.trades || []).join(', ')} \u00B7 ${when(a.createdAt)}${a.interviewAt ? ` \u00B7 interview ${a.interviewAt}` : ''}` })),
        el('div', { class: 'mt-3' }, line('Email', a.email), line('Phone', a.phone), line('City', a.city), line('Years of experience', x.years), line('Availability', x.availability), line('Desired rate', x.desiredRate), line('Available from', x.startDate),
          line('Checks', TRADE_FLAGS.map(([k, l]) => `${l}: ${x[k] || '?'}`).join(' \u00B7 ')), line('License', x.licenseDetails), line('Insurance', x.insuranceDetails), line('Tools', x.tools),
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
      btn('Save settings', async () => { await send('/api/admin/settings', 'POST', { banner: text.ctl.value, bannerOn: on.checked, analyticsOn: an.checked }); toast('Settings saved'); }, 'btn-primary')));
  };

  const estimator = async () => {
    view.replaceChildren(panel('Bathroom estimator', el('p', { text: 'Build parts, labor and extra-cost estimates on any phone or tablet, send them to customers to sign and pay, and manage your price book. Turn it on for individual employees from their employee page.' }),
      el('div', { class: 'd-flex flex-wrap gap-2' }, el('a', { class: 'btn btn-primary', href: '/estimator/', text: 'Open estimator' }), el('a', { class: 'btn btn-outline-dark', href: '/estimator/#book', text: 'Price book' }), el('a', { class: 'btn btn-outline-dark', href: '/estimator/#settings', text: 'Defaults' }))));
  };
  const routes = { dashboard, customers, employees, jobs, estimator, hr, knowledge, contacts, support, forum, reviews, projects, images, visitors, users, settings };
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
    try { me = (await api('/api/auth/me')).user; } catch { /* signed out */ }
    $('#admin-app').hidden = !(me && me.admin); $('#admin-login').hidden = Boolean(me && me.admin);
    if (me && me.admin) { $('#admin-user').textContent = me.email; try { badges.hr = (await api('/api/admin/hr')).pipeline.new; } catch { /* optional */ } route(); }
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
