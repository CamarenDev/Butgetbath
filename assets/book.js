// Public booking widget: choose phone, video or in-home, pick an open day and time, confirm, then add to Apple, Google or Outlook calendar.
// The same script powers the private reschedule/cancel page (data-booking="manage").
(() => {
  const root = document.querySelector('[data-booking]');
  if (!root) return;
  const manage = root.dataset.booking === 'manage';
  const services = (() => { try { return JSON.parse(root.dataset.services || '[]'); } catch { return []; } })();
  const el = (tag, props = {}, ...kids) => {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(props)) {
      if (k === 'text') n.textContent = v;
      else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
      else if (v === true) n.setAttribute(k, '');
      else if (v !== false && v != null) n.setAttribute(k, v);
    }
    for (const kid of kids.flat()) if (kid != null && kid !== false) n.append(kid);
    return n;
  };
  const api = async (url, body) => {
    const res = await fetch(url, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {});
    let data = {};
    try { data = await res.json(); } catch { /* empty */ }
    if (!res.ok) throw Object.assign(new Error(data.error || 'Something went wrong. Please try again.'), { status: res.status });
    return data;
  };
  const params = new URLSearchParams(location.search);
  const state = { cfg: null, kind: '', days: [], page: 0, date: '', slots: [], slot: null, done: null, booking: null, mode: manage ? 'view' : 'book', busy: false, error: '' };
  const PAGE = 14;
  const dayLabel = d => { const x = new Date(`${d}T12:00:00`); return [x.toLocaleDateString('en-US', { weekday: 'short' }), x.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })]; };
  const longDay = d => new Date(`${d}T12:00:00`).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  const token = params.get('token') || '';

  async function loadDays() {
    state.days = (await api(`/api/book/days?kind=${state.kind}`)).days; state.page = 0; state.date = ''; state.slots = []; state.slot = null;
  }
  async function pickKind(kind) {
    state.kind = kind; state.error = '';
    try { await loadDays(); } catch (e) { state.error = e.message; }
    draw();
    root.querySelector('[data-step="day"]')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }
  async function pickDay(date) {
    state.date = date; state.slot = null; state.error = '';
    try { state.slots = (await api(`/api/book/slots?kind=${state.kind}&date=${date}`)).slots; } catch (e) { state.error = e.message; }
    draw();
    root.querySelector('[data-step="time"]')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  const kindCards = () => el('div', { class: 'book-kinds', role: 'radiogroup', 'aria-label': 'Type of appointment' }, state.cfg.kinds.map(k => el('button', {
    type: 'button', role: 'radio', 'aria-checked': String(state.kind === k.key), class: `book-kind${state.kind === k.key ? ' on' : ''}`, onclick: () => pickKind(k.key)
  }, el('strong', { text: k.label }), el('span', { class: 'small', text: k.blurb }), el('span', { class: 'badge text-bg-light', text: `${k.duration} min` }))));

  const dayPicker = () => {
    if (!state.days.length) return el('p', { class: 'text-muted', text: 'No open times right now. Please call us or send a message and we will find a time for you.' });
    const shown = state.days.slice(state.page * PAGE, state.page * PAGE + PAGE);
    return el('div', { 'data-step': 'day' },
      el('div', { class: 'book-days', role: 'group', 'aria-label': 'Choose a day' }, shown.map(d => { const [w, m] = dayLabel(d.date); return el('button', { type: 'button', class: `book-day${state.date === d.date ? ' on' : ''}`, 'aria-pressed': String(state.date === d.date), onclick: () => pickDay(d.date) }, el('small', { text: w }), el('b', { text: m })); })),
      el('div', { class: 'd-flex justify-content-between mt-2' },
        el('button', { type: 'button', class: 'btn btn-sm btn-outline-secondary', disabled: state.page === 0, onclick: () => { state.page--; draw(); }, text: 'Earlier days' }),
        el('button', { type: 'button', class: 'btn btn-sm btn-outline-secondary', disabled: (state.page + 1) * PAGE >= state.days.length, onclick: () => { state.page++; draw(); }, text: 'Later days' })));
  };

  const slotPicker = () => state.date && el('div', { 'data-step': 'time', class: 'mt-3' },
    el('h3', { class: 'h6', text: `Open times on ${longDay(state.date)} (${state.cfg.timeZone})` }),
    state.slots.length ? el('div', { class: 'book-slots', role: 'group', 'aria-label': 'Choose a time' }, state.slots.map(s => el('button', { type: 'button', class: `book-slot${state.slot === s.startsAt ? ' on' : ''}`, 'aria-pressed': String(state.slot === s.startsAt), onclick: () => { state.slot = s.startsAt; state.error = ''; draw(); root.querySelector('[data-step="details"]')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }, text: s.label }))) : el('p', { class: 'text-muted', text: 'That day just filled up. Please choose another day.' }));

  const field = (id, label, props = {}) => el('div', { class: props.col || 'col-12' }, el('label', { for: `bk-${id}`, class: 'form-label', text: label }), el(props.tag || 'input', { id: `bk-${id}`, name: id, class: 'form-control form-control-lg', ...props.attrs }, ...(props.kids || [])));
  const calendarLinks = b => el('div', { class: 'book-cal' },
    el('a', { class: 'btn btn-brass', href: b.icsPath, text: 'Add to Apple Calendar (iPhone/Mac)' }),
    el('a', { class: 'btn btn-outline-primary', href: b.googleUrl, target: '_blank', rel: 'noopener noreferrer', text: 'Add to Google Calendar' }),
    el('a', { class: 'btn btn-outline-primary', href: b.outlookUrl, target: '_blank', rel: 'noopener noreferrer', text: 'Add to Outlook' }));

  async function submit(form) {
    if (state.busy) return;
    const f = new FormData(form);
    if (f.get('website')) return;
    const kind = state.kind;
    state.busy = true; state.error = ''; draw();
    try {
      const data = await api('/api/book', { kind, startsAt: state.slot, name: f.get('name'), email: f.get('email'), phone: f.get('phone'), address: f.get('address') || '', interest: f.get('interest') || '', notes: f.get('notes') || '', consent: f.get('consent') === 'on', marketing: f.get('marketing') === 'on', lang: localStorage.getItem('bbs-lang') === 'es' ? 'es' : 'en' });
      state.done = data.booking;
    } catch (e) {
      state.error = e.message;
      if (e.status === 409) { await loadDays().catch(() => {}); state.slot = null; }
    }
    state.busy = false; draw();
  }

  const detailsForm = () => {
    if (!state.slot) return null;
    const when = new Date(state.slot);
    const form = el('form', { class: 'row g-3 mt-1', 'data-step': 'details', novalidate: true, onsubmit: e => { e.preventDefault(); if (!form.checkValidity()) { form.reportValidity(); return; } submit(form); } },
      el('div', { class: 'col-12' }, el('div', { class: 'book-summary', role: 'status' }, el('b', { text: state.cfg.kinds.find(k => k.key === state.kind).label }), ` on ${longDay(state.date)} at ${when.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: state.cfg.timeZoneId || undefined })} ${state.cfg.timeZone}`)),
      el('div', { class: 'visually-hidden', 'aria-hidden': 'true' }, el('label', { for: 'bk-website', text: 'Leave this field empty' }), el('input', { id: 'bk-website', name: 'website', tabindex: '-1', autocomplete: 'off' })),
      field('name', 'Full name', { col: 'col-12', attrs: { required: true, autocomplete: 'name', maxlength: '120' } }),
      field('phone', 'Mobile phone', { col: 'col-md-6', attrs: { type: 'tel', required: true, autocomplete: 'tel', inputmode: 'tel', maxlength: '40' } }),
      field('email', 'Email (we send your confirmation here)', { col: 'col-md-6', attrs: { type: 'email', required: true, autocomplete: 'email', maxlength: '200' } }),
      state.kind === 'in_home' && field('address', 'Address of the bathroom', { attrs: { required: true, autocomplete: 'street-address', maxlength: '300', placeholder: 'Street, city, ZIP' } }),
      el('div', { class: 'col-12' }, el('label', { for: 'bk-interest', class: 'form-label', text: 'What are you planning?' }), el('select', { id: 'bk-interest', name: 'interest', class: 'form-select form-select-lg' }, el('option', { value: '', text: 'Choose one' }), [...services, 'Not sure yet'].map(s => el('option', { text: s })))),
      field('notes', 'Anything we should know? (optional)', { tag: 'textarea', attrs: { rows: '2', maxlength: '1000' } }),
      el('div', { class: 'col-12' }, el('div', { class: 'form-check' }, el('input', { class: 'form-check-input', type: 'checkbox', id: 'bk-consent', name: 'consent', required: true }), el('label', { class: 'form-check-label small', for: 'bk-consent' }, 'I agree to be contacted about this appointment and have read the ', el('a', { href: '/privacy/', target: '_blank', rel: 'noopener noreferrer', text: 'Privacy Policy' }), '.'))),
      el('div', { class: 'col-12' }, el('div', { class: 'form-check' }, el('input', { class: 'form-check-input', type: 'checkbox', id: 'bk-marketing', name: 'marketing' }), el('label', { class: 'form-check-label small', for: 'bk-marketing', text: 'Send me occasional offers and seasonal specials by email. Unsubscribe any time. (optional)' }))),
      el('div', { class: 'col-12' }, el('button', { class: 'btn btn-brass btn-lg w-100', type: 'submit', disabled: state.busy, text: state.busy ? 'Booking...' : 'Confirm my appointment' })));
    return form;
  };

  const summary = b => el('dl', { class: 'book-dl' }, [['When', `${b.when} (${b.timeZone})`], ['Type', b.kindLabel], ['Length', `${b.durationMin} minutes`], ['Where / how', b.where], ['Name', b.name]].flatMap(([k, v]) => [el('dt', { text: k }), el('dd', { text: v })]));

  function drawDone() {
    const b = state.done;
    return el('div', { class: 'book-done', role: 'status' },
      el('h2', { class: 'h3', text: 'You are booked!' }),
      el('p', { class: 'lead', text: `We emailed your confirmation to ${b.email}. Add it to your calendar now so you get a reminder a day before and an hour before.` }),
      summary(b), calendarLinks(b),
      el('p', { class: 'small text-muted mt-3' }, 'Need to change it? Use the button in your email, or ', el('a', { href: b.manageUrl, text: 'manage your appointment here' }), '. Keep that email; the link in it is private.'),
      el('a', { class: 'btn btn-outline-secondary mt-2', href: '/', text: 'Back to home' }));
  }

  async function doCancel() {
    if (!confirm('Cancel this appointment?')) return;
    try { state.booking = (await api('/api/book/cancel', { token })).booking; state.error = ''; } catch (e) { state.error = e.message; }
    draw();
  }
  async function doReschedule() {
    try { state.booking = (await api('/api/book/reschedule', { token, startsAt: state.slot })).booking; state.mode = 'view'; state.error = ''; state.slot = null; } catch (e) { state.error = e.message; if (e.status === 409) { await loadDays().catch(() => {}); state.slot = null; } }
    draw();
  }

  function drawManage() {
    const b = state.booking;
    if (!b) return el('div', {}, el('p', { role: 'alert', class: 'text-danger', text: state.error || 'Loading...' }), el('a', { class: 'btn btn-brass', href: '/book/', text: 'Book an appointment' }));
    if (state.mode === 'move') {
      return el('div', {}, el('h2', { class: 'h4', text: 'Pick a new time' }), dayPicker(), slotPicker(),
        el('div', { class: 'd-flex gap-2 mt-3' }, el('button', { class: 'btn btn-brass', type: 'button', disabled: !state.slot, onclick: doReschedule, text: 'Confirm new time' }), el('button', { class: 'btn btn-outline-secondary', type: 'button', onclick: () => { state.mode = 'view'; draw(); }, text: 'Keep current time' })));
    }
    const live = b.status === 'scheduled';
    return el('div', {}, el('h2', { class: 'h3', text: live ? 'Your appointment' : b.status === 'cancelled' ? 'This appointment was cancelled' : 'This appointment is finished' }), summary(b),
      live && calendarLinks(b),
      live && el('div', { class: 'd-flex flex-wrap gap-2 mt-3' }, el('button', { class: 'btn btn-outline-primary', type: 'button', onclick: async () => { state.kind = b.kind; await loadDays().catch(() => {}); state.mode = 'move'; draw(); }, text: 'Reschedule' }), el('button', { class: 'btn btn-outline-danger', type: 'button', onclick: doCancel, text: 'Cancel appointment' })),
      !live && el('a', { class: 'btn btn-brass mt-3', href: '/book/', text: 'Book a new time' }),
      state.cfg.phone && el('p', { class: 'small text-muted mt-3' }, 'Questions? Call ', el('a', { href: `tel:${state.cfg.phone.replace(/[^\d+]/g, '')}`, text: state.cfg.phone }), '.'));
  }

  function draw() {
    const status = state.error ? el('div', { class: 'alert alert-danger', role: 'alert', text: state.error }) : null;
    if (!state.cfg) return;
    if (manage) { root.replaceChildren(...[drawManage(), status].filter(Boolean)); return; }
    if (state.done) { root.replaceChildren(drawDone()); return; }
    if (!state.cfg.enabled) { root.replaceChildren(el('p', { text: 'Online booking is paused. Please send us a message and we will schedule you personally.' }), el('a', { class: 'btn btn-brass', href: '/contact/', text: 'Send a message' })); return; }
    root.replaceChildren(...[
      el('h2', { class: 'h3 mb-1', text: 'Book your free estimate' }),
      el('p', { class: 'text-muted small mb-3', text: 'Takes about a minute. Pick how you want to meet, choose a time that works, and get a calendar invite with reminders.' }),
      el('h3', { class: 'h6', text: '1. How would you like to talk?' }), kindCards(),
      state.kind && el('h3', { class: 'h6 mt-3', text: '2. Pick a day' }), state.kind && dayPicker(),
      slotPicker(),
      state.slot && el('h3', { class: 'h6 mt-3', text: '3. Your details' }), detailsForm(), status,
      el('p', { class: 'form-assure small text-muted mt-3 mb-0', text: 'Free, no obligation. Your details stay private and are never sold.' })
    ].filter(Boolean));
  }

  (async () => {
    try {
      state.cfg = await api('/api/book/config');
      if (manage) {
        try { state.booking = (await api(`/api/book/manage?token=${encodeURIComponent(token)}`)).booking; } catch (e) { state.error = e.message; }
      } else if (state.cfg.kinds.some(k => k.key === params.get('kind'))) { await pickKind(params.get('kind')); return; }
    } catch (e) { root.replaceChildren(el('p', { class: 'text-danger', text: 'Booking is unavailable right now. Please send us a message instead.' }), el('a', { class: 'btn btn-brass', href: '/contact/', text: 'Send a message' })); return; }
    draw();
  })();
})();
