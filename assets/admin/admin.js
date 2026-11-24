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
    ['dashboard', 'Dashboard', '\u25A6'], ['contacts', 'Contacts', '\u2709'], ['support', 'Support', '\u260E'], ['forum', 'Forum', '\u2756'],
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
    badges = { contacts: c.newContacts, support: c.openTickets, reviews: c.pendingReviews };
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

  const routes = { dashboard, contacts, support, forum, reviews, projects, images, visitors, users, settings };
  async function route() {
    const id = routes[location.hash.slice(1)] ? location.hash.slice(1) : 'dashboard';
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
    if (me && me.admin) { $('#admin-user').textContent = me.email; route(); }
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
