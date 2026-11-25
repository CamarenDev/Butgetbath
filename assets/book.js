// Public and private booking widget. Network retries never recreate an appointment or discard customer input.
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
    try {
      const res = await fetch(url, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {});
      let data = {};
      try { data = await res.json(); } catch { /* empty */ }
      if (!res.ok) throw Object.assign(new Error(data.error || 'Something went wrong. Your booking details have not been cleared.'), { status: res.status });
      return data;
    } catch (error) {
      if (!error.status) error.message = 'We could not reach the server. Your details are still here; check your connection and try again.';
      throw error;
    }
  };
  const params = new URLSearchParams(location.search);
  const state = { cfg: null, kind: '', days: [], page: 0, date: '', slots: [], slot: null, done: null, booking: null, mode: manage ? 'view' : 'book', busy: false, loading: true, loadingDays: false, loadingSlots: false, error: '', retry: null, retryLabel: '', draft: {} };
  const PAGE = 14;
  const token = params.get('token') || '';
  const dayLabel = d => { const x = new Date(`${d}T12:00:00`); return [x.toLocaleDateString('en-US', { weekday: 'short' }), x.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })]; };
  const longDay = d => new Date(`${d}T12:00:00`).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  const fail = (error, retry, retryLabel = 'Try again') => { state.error = error.message || String(error); state.retry = retry; state.retryLabel = retryLabel; };
  const clearError = () => { state.error = ''; state.retry = null; };
  const scrollTo = step => root.querySelector(`[data-step="${step}"]`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  const capture = form => {
    for (const field of form.elements) if (field.name && field.type !== 'submit') state.draft[field.name] = field.type === 'checkbox' ? field.checked : field.value;
  };

  async function refreshDays(reset = true) {
    state.loadingDays = true; clearError(); draw();
    try {
      state.days = (await api(`/api/book/days?kind=${encodeURIComponent(state.kind)}`)).days;
      state.page = 0;
      if (reset) { state.date = ''; state.slots = []; state.slot = null; }
    } catch (error) {
      fail(error, () => refreshDays(reset), 'Reload available days');
    } finally { state.loadingDays = false; draw(); }
  }
  async function refreshSlots() {
    if (!state.date) return;
    state.loadingSlots = true; clearError(); draw();
    try { state.slots = (await api(`/api/book/slots?kind=${encodeURIComponent(state.kind)}&date=${encodeURIComponent(state.date)}`)).slots; }
    catch (error) { state.slots = []; fail(error, refreshSlots, 'Reload available times'); }
    finally { state.loadingSlots = false; draw(); }
  }
  async function pickKind(kind) {
    if (state.busy) return;
    state.kind = kind;
    await refreshDays();
    scrollTo('day');
  }
  async function pickDay(date) {
    if (state.busy) return;
    state.date = date; state.slot = null;
    await refreshSlots();
    scrollTo('time');
  }

  const kindCards = () => el('div', { class: 'book-kinds', role: 'radiogroup', 'aria-label': 'Type of appointment' }, state.cfg.kinds.map(k => el('button', {
    type: 'button', role: 'radio', 'aria-checked': String(state.kind === k.key), class: `book-kind${state.kind === k.key ? ' on' : ''}`, disabled: state.busy, onclick: () => pickKind(k.key)
  }, el('strong', { text: k.label }), el('span', { class: 'small', text: k.blurb }), el('span', { class: 'badge text-bg-light', text: `${k.duration} min` }))));

  const dayPicker = () => {
    if (state.loadingDays) return el('p', { class: 'book-loading', role: 'status', text: 'Loading available days...' });
    if (!state.days.length) return el('div', { class: 'book-empty', role: 'status' },
      el('p', { class: 'mb-2', text: 'No open times are available right now.' }),
      el('p', { class: 'small mb-0' }, 'Call us or send a message and we will find a time for you.'),
      el('div', { class: 'book-actions mt-3' }, el('button', { class: 'btn btn-outline-primary', type: 'button', onclick: () => refreshDays(), text: 'Check again' }), el('a', { class: 'btn btn-outline-secondary', href: '/contact/', text: 'Send a message' })));
    const shown = state.days.slice(state.page * PAGE, state.page * PAGE + PAGE);
    return el('div', { 'data-step': 'day' },
      el('div', { class: 'book-days', role: 'group', 'aria-label': 'Choose a day' }, shown.map(d => { const [w, m] = dayLabel(d.date); return el('button', { type: 'button', class: `book-day${state.date === d.date ? ' on' : ''}`, 'aria-pressed': String(state.date === d.date), disabled: state.busy, onclick: () => pickDay(d.date) }, el('small', { text: w }), el('b', { text: m })); })),
      el('div', { class: 'd-flex justify-content-between mt-2' },
        el('button', { type: 'button', class: 'btn btn-sm btn-outline-secondary', disabled: state.page === 0 || state.busy, onclick: () => { state.page--; draw(); }, text: 'Earlier days' }),
        el('button', { type: 'button', class: 'btn btn-sm btn-outline-secondary', disabled: (state.page + 1) * PAGE >= state.days.length || state.busy, onclick: () => { state.page++; draw(); }, text: 'Later days' })));
  };
  const slotPicker = () => {
    if (!state.date) return null;
    return el('div', { 'data-step': 'time', class: 'mt-3' },
      el('h3', { class: 'h6', text: `Open times on ${longDay(state.date)} (${state.cfg.timeZone})` }),
      state.loadingSlots ? el('p', { class: 'book-loading', role: 'status', text: 'Loading open times...' }) : state.slots.length ? el('div', { class: 'book-slots', role: 'group', 'aria-label': 'Choose a time' }, state.slots.map(s => el('button', {
        type: 'button', class: `book-slot${state.slot === s.startsAt ? ' on' : ''}`, 'aria-pressed': String(state.slot === s.startsAt), disabled: state.busy,
        onclick: () => { state.slot = s.startsAt; clearError(); draw(); scrollTo('details'); }, text: s.label
      }))) : el('div', { class: 'book-empty', role: 'status' }, el('p', { class: 'mb-2', text: 'That day just filled up or is no longer available.' }), el('button', { class: 'btn btn-sm btn-outline-primary', type: 'button', onclick: refreshSlots, text: 'Check this day again' })));
  };

  const field = (id, label, props = {}) => {
    const tag = props.tag || 'input';
    const attrs = { id: `bk-${id}`, name: id, class: 'form-control form-control-lg', ...props.attrs };
    if (tag === 'input') attrs.value = state.draft[id] ?? '';
    return el('div', { class: props.col || 'col-12' }, el('label', { for: `bk-${id}`, class: 'form-label', text: label }), el(tag, attrs, tag === 'textarea' ? state.draft[id] || '' : null));
  };
  const calendarLinks = b => el('div', { class: 'book-cal' },
    el('a', { class: 'btn btn-brass', href: b.icsPath, text: 'Add to Apple Calendar (iPhone/Mac)' }),
    el('a', { class: 'btn btn-outline-primary', href: b.googleUrl, target: '_blank', rel: 'noopener noreferrer', text: 'Add to Google Calendar' }),
    el('a', { class: 'btn btn-outline-primary', href: b.outlookUrl, target: '_blank', rel: 'noopener noreferrer', text: 'Add to Outlook' }));
  const failedDeliveries = b => Object.values(b.delivery?.channels || {}).some(x => x.status === 'failed' || x.status === 'pending');
  async function retryDeliveries() {
    if (state.busy) return;
    state.busy = true; clearError(); draw();
    try {
      const target = state.done || state.booking;
      const manageToken = token || (target?.manageUrl ? new URL(target.manageUrl, location.href).searchParams.get('token') : '');
      const data = await api('/api/book/retry-deliveries', { token: manageToken });
      if (state.done) state.done = data.booking;
      else state.booking = data.booking;
      if (failedDeliveries(data.booking)) fail(new Error('Some notifications still need attention. Please try again or contact us.'), retryDeliveries, 'Retry notifications');
    } catch (error) { fail(error, retryDeliveries, 'Retry notifications'); }
    finally { state.busy = false; draw(); }
  }
  const deliveryStatus = b => {
    const customer = b.delivery?.channels?.customer;
    if (!b.delivery || (!failedDeliveries(b) && customer?.status !== 'failed')) return null;
    return el('div', { class: 'alert alert-warning book-delivery', role: 'alert' },
      el('b', { text: 'Your appointment is saved.' }),
      ' A confirmation or calendar update could not be delivered. Your appointment is not duplicated when you retry.',
      failedDeliveries(b) && el('button', { class: 'btn btn-sm btn-outline-dark ms-2 mt-2', type: 'button', disabled: state.busy, onclick: retryDeliveries, text: state.busy ? 'Retrying...' : 'Retry notifications' }));
  };

  async function submit(form) {
    if (state.busy) return;
    capture(form);
    if (state.draft.website) return;
    state.busy = true; clearError(); draw();
    try {
      const data = await api('/api/book', { kind: state.kind, startsAt: state.slot, name: state.draft.name, email: state.draft.email, phone: state.draft.phone, address: state.draft.address || '', interest: state.draft.interest || '', notes: state.draft.notes || '', consent: state.draft.consent === true, marketing: state.draft.marketing === true, lang: localStorage.getItem('bbs-lang') === 'es' ? 'es' : 'en' });
      state.done = data.booking;
    } catch (error) {
      fail(error, () => submit(form), 'Try booking this time again');
      if (error.status === 409) { state.slot = null; await refreshSlots(); fail(new Error('That time was just taken. Choose another available time; your details are still filled in.'), () => scrollTo('time'), 'Choose another time'); }
    } finally { state.busy = false; draw(); }
  }

  const detailsForm = () => {
    if (!state.slot) return null;
    const when = new Date(state.slot);
    const form = el('form', { class: 'row g-3 mt-1', 'data-step': 'details', novalidate: true, oninput: () => capture(form), onsubmit: e => { e.preventDefault(); capture(form); if (!form.checkValidity()) { form.reportValidity(); return; } submit(form); } },
      el('div', { class: 'col-12' }, el('div', { class: 'book-summary', role: 'status' }, el('b', { text: state.cfg.kinds.find(k => k.key === state.kind).label }), ` on ${longDay(state.date)} at ${when.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: state.cfg.timeZoneId || undefined })} ${state.cfg.timeZone}`)),
      el('div', { class: 'visually-hidden', 'aria-hidden': 'true' }, el('label', { for: 'bk-website', text: 'Leave this field empty' }), el('input', { id: 'bk-website', name: 'website', tabindex: '-1', autocomplete: 'off', value: '' })),
      field('name', 'Full name', { col: 'col-12', attrs: { required: true, autocomplete: 'name', maxlength: '120' } }),
      field('phone', 'Mobile phone', { col: 'col-md-6', attrs: { type: 'tel', required: true, autocomplete: 'tel', inputmode: 'tel', maxlength: '40' } }),
      field('email', 'Email (we send your confirmation here)', { col: 'col-md-6', attrs: { type: 'email', required: true, autocomplete: 'email', maxlength: '200' } }),
      state.kind === 'in_home' && field('address', 'Address of the bathroom', { attrs: { required: true, autocomplete: 'street-address', maxlength: '300', placeholder: 'Street, city, ZIP' } }),
      el('div', { class: 'col-12' }, el('label', { for: 'bk-interest', class: 'form-label', text: 'What are you planning?' }), el('select', { id: 'bk-interest', name: 'interest', class: 'form-select form-select-lg' }, el('option', { value: '', text: 'Choose one' }), [...services, 'Not sure yet'].map(s => el('option', { value: s, selected: state.draft.interest === s, text: s })))),
      field('notes', 'Anything we should know? (optional)', { tag: 'textarea', attrs: { rows: '2', maxlength: '1000' } }),
      el('div', { class: 'col-12' }, el('div', { class: 'form-check' }, el('input', { class: 'form-check-input', type: 'checkbox', id: 'bk-consent', name: 'consent', required: true, checked: state.draft.consent === true }), el('label', { class: 'form-check-label small', for: 'bk-consent' }, 'I agree to be contacted about this appointment and have read the ', el('a', { href: '/privacy/', target: '_blank', rel: 'noopener noreferrer', text: 'Privacy Policy' }), '.'))),
      el('div', { class: 'col-12' }, el('div', { class: 'form-check' }, el('input', { class: 'form-check-input', type: 'checkbox', id: 'bk-marketing', name: 'marketing', checked: state.draft.marketing === true }), el('label', { class: 'form-check-label small', for: 'bk-marketing', text: 'Send me occasional offers and seasonal specials by email. Unsubscribe any time. (optional)' }))),
      el('div', { class: 'col-12' }, el('button', { class: 'btn btn-brass btn-lg w-100', type: 'submit', disabled: state.busy, text: state.busy ? 'Saving your appointment...' : 'Confirm my appointment' })));
    return form;
  };

  const summary = b => el('dl', { class: 'book-dl' }, [['When', `${b.when} (${b.timeZone})`], ['Type', b.kindLabel], ['Length', `${b.durationMin} minutes`], ['Where / how', b.where], ['Name', b.name]].flatMap(([k, v]) => [el('dt', { text: k }), el('dd', { text: v })]));
  function drawDone() {
    const b = state.done, sent = b.delivery?.channels?.customer?.status === 'sent';
    return el('div', { class: 'book-done', role: 'status' },
      el('h2', { class: 'h3', text: 'You are booked!' }),
      el('p', { class: 'lead', text: sent ? `We emailed your confirmation to ${b.email}.` : `Your appointment with ${b.email} is saved. Check the delivery status below before relying on the email.` }),
      summary(b), calendarLinks(b), deliveryStatus(b),
      el('p', { class: 'small text-muted mt-3' }, 'Need to change it? Use ', el('a', { href: b.manageUrl, text: 'your private appointment link' }), '.'),
      el('a', { class: 'btn btn-outline-secondary mt-2', href: '/', text: 'Back to home' }));
  }

  async function loadBooking() {
    state.loading = true; clearError(); draw();
    try { state.booking = (await api(`/api/book/manage?token=${encodeURIComponent(token)}`)).booking; }
    catch (error) { fail(error, loadBooking, 'Try loading the appointment again'); }
    finally { state.loading = false; draw(); }
  }
  async function doCancel() {
    if (state.busy || !confirm('Cancel this appointment?')) return;
    state.busy = true; clearError(); draw();
    try { state.booking = (await api('/api/book/cancel', { token })).booking; }
    catch (error) {
      fail(error, doCancel, 'Try cancellation again');
      if (error.status === 400) {
        try { state.booking = (await api(`/api/book/manage?token=${encodeURIComponent(token)}`)).booking; clearError(); } catch { /* original error remains */ }
      }
    } finally { state.busy = false; draw(); }
  }
  async function doReschedule() {
    if (state.busy || !state.slot) return;
    state.busy = true; clearError(); draw();
    try {
      state.booking = (await api('/api/book/reschedule', { token, startsAt: state.slot })).booking;
      state.mode = 'view'; state.slot = null;
    } catch (error) {
      fail(error, doReschedule, 'Try this new time again');
      if (error.status === 409) { state.slot = null; await refreshSlots(); fail(new Error('That time is no longer available. Choose another time; your current appointment is unchanged.'), () => scrollTo('time'), 'Choose another time'); }
    } finally { state.busy = false; draw(); }
  }

  function drawManage() {
    const b = state.booking;
    if (state.loading) return el('p', { class: 'book-loading', role: 'status', text: 'Loading your appointment...' });
    if (!b) return el('div', {}, el('p', { role: 'status', text: 'We could not load that appointment yet.' }), el('a', { class: 'btn btn-brass', href: '/book/', text: 'Book an appointment' }));
    if (state.mode === 'move') return el('div', {}, el('h2', { class: 'h4', text: 'Pick a new time' }), dayPicker(), slotPicker(),
      el('div', { class: 'd-flex flex-wrap gap-2 mt-3' }, el('button', { class: 'btn btn-brass', type: 'button', disabled: !state.slot || state.busy, onclick: doReschedule, text: state.busy ? 'Saving...' : 'Confirm new time' }), el('button', { class: 'btn btn-outline-secondary', type: 'button', disabled: state.busy, onclick: () => { state.mode = 'view'; clearError(); draw(); }, text: 'Keep current time' })));
    const live = b.status === 'scheduled';
    return el('div', {}, el('h2', { class: 'h3', text: live ? 'Your appointment' : b.status === 'cancelled' ? 'This appointment was cancelled' : 'This appointment is finished' }), summary(b),
      deliveryStatus(b), live && calendarLinks(b),
      live && el('div', { class: 'd-flex flex-wrap gap-2 mt-3' }, el('button', { class: 'btn btn-outline-primary', type: 'button', disabled: state.busy, onclick: async () => { state.kind = b.kind; state.mode = 'move'; await refreshDays(); }, text: 'Reschedule' }), el('button', { class: 'btn btn-outline-danger', type: 'button', disabled: state.busy, onclick: doCancel, text: state.busy ? 'Working...' : 'Cancel appointment' })),
      !live && el('a', { class: 'btn btn-brass mt-3', href: '/book/', text: 'Book a new time' }),
      state.cfg?.phone && el('p', { class: 'small text-muted mt-3' }, 'Questions? Call ', el('a', { href: `tel:${state.cfg.phone.replace(/[^\d+]/g, '')}`, text: state.cfg.phone }), '.'));
  }
  const errorBox = () => state.error && el('div', { class: 'alert alert-danger book-error mt-3', role: 'alert' }, el('span', { text: state.error }), state.retry && el('button', { class: 'btn btn-sm btn-outline-danger ms-2 mt-2', type: 'button', disabled: state.busy, onclick: state.retry, text: state.retryLabel }));

  function draw() {
    if (!state.cfg) {
      root.replaceChildren(el('div', { class: 'book-shell' }, state.loading ? el('p', { class: 'book-loading', role: 'status', text: 'Loading appointment options...' }) : null, errorBox()));
      return;
    }
    if (manage) { root.replaceChildren(drawManage(), errorBox()); return; }
    if (state.done) { root.replaceChildren(drawDone(), errorBox()); return; }
    if (!state.cfg.enabled) { root.replaceChildren(el('p', { text: 'Online booking is paused. Please send us a message and we will schedule you personally.' }), el('a', { class: 'btn btn-brass', href: '/contact/', text: 'Send a message' })); return; }
    root.replaceChildren(...[
      el('h2', { class: 'h3 mb-1', text: 'Book your free estimate' }),
      el('p', { class: 'text-muted small mb-3', text: 'Takes about a minute. Pick how you want to meet, choose a time, and get a calendar invitation.' }),
      el('h3', { class: 'h6', text: '1. How would you like to talk?' }), kindCards(),
      state.kind && el('h3', { class: 'h6 mt-3', text: '2. Pick a day' }), state.kind && dayPicker(),
      slotPicker(), state.slot && el('h3', { class: 'h6 mt-3', text: '3. Your details' }), detailsForm(), errorBox(),
      el('p', { class: 'form-assure small text-muted mt-3 mb-0', text: 'Free, no obligation. Your details stay private and are never sold.' })
    ].filter(Boolean));
  }

  async function load() {
    state.loading = true; clearError(); draw();
    try {
      state.cfg = await api('/api/book/config');
      if (manage) await loadBooking();
      else if (state.cfg.kinds.some(k => k.key === params.get('kind'))) await pickKind(params.get('kind'));
    } catch (error) { fail(error, load, 'Try loading booking again'); }
    finally { state.loading = false; draw(); }
  }
  window.addEventListener('offline', () => { fail(new Error('You appear to be offline. Your entered details remain on this page; reconnect and try again.'), null); draw(); });
  load();
})();
