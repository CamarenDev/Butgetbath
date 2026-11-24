// New-hire onboarding wizard (forms, contract, experience, training). Built with textContent only, never innerHTML.
(() => {
  const el = (tag, props = {}, ...kids) => {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(props)) { if (v === false || v == null) continue; if (k === 'class') n.className = v; else if (k === 'text') n.textContent = v; else if (k.startsWith('on')) n.addEventListener(k.slice(2), v); else n.setAttribute(k, v === true ? '' : v); }
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
  const BASE = '/api/employee/onboarding';
  const stamp = v => v ? new Date(v).toLocaleString(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' }) : '';

  let status;
  const notice = (kind, message) => { status.className = `alert alert-${kind}`; status.textContent = message; status.scrollIntoView({ block: 'nearest' }); };
  const field = (label, props = {}, tag = 'input') => {
    const id = `o${Math.random().toString(36).slice(2, 8)}`;
    const ctl = el(tag, { class: tag === 'select' ? 'form-select' : 'form-control', id, ...props });
    return { ctl, wrap: el('div', { class: 'mb-3' }, el('label', { class: 'form-label', for: id, text: label }), ctl) };
  };
  const select = (label, options, value) => {
    const f = field(label, {}, 'select');
    for (const [v, t] of options) f.ctl.append(el('option', { value: v, text: t }));
    if (value) f.ctl.value = value;
    return f;
  };
  const check = (label, checked) => {
    const id = `o${Math.random().toString(36).slice(2, 8)}`;
    const ctl = el('input', { class: 'form-check-input', type: 'checkbox', id, ...(checked ? { checked: true } : {}) });
    return { ctl, wrap: el('div', { class: 'form-check mb-2' }, ctl, el('label', { class: 'form-check-label', for: id, text: label })) };
  };
  const submitter = (ctx, label, run) => el('button', { type: 'button', class: 'btn btn-brass', text: label, onclick: async event => {
    const b = event.currentTarget; b.disabled = true;
    try { await run(); } catch (e) { if (e.status === 401) return ctx.done(); notice('danger', e.message); } finally { b.disabled = false; }
  } });
  const num = (f) => f.ctl.value === '' ? '' : Number(f.ctl.value);

  // ---------- Steps
  function personal(ctx, s) {
    const p = s.profile;
    const f = { address: field('Street address', { value: p.address, maxlength: 200, autocomplete: 'street-address' }), city: field('City', { value: p.city, maxlength: 80 }), state: field('State', { value: p.state, maxlength: 40 }), zip: field('ZIP code', { value: p.zip, maxlength: 12, autocomplete: 'postal-code' }),
      phone: field('Mobile phone', { type: 'tel', value: p.phone, maxlength: 40, autocomplete: 'tel' }), emergencyName: field('Emergency contact name', { value: p.emergencyName, maxlength: 120 }), emergencyPhone: field('Emergency contact phone', { type: 'tel', value: p.emergencyPhone, maxlength: 40 }), emergencyRelation: field('Relationship', { value: p.emergencyRelation, maxlength: 60 }) };
    return el('div', {}, el('h3', { class: 'h5', text: 'Step 1: About you' }), el('p', { class: 'text-muted', text: 'We use this for payroll records and so we can reach someone if you are ever hurt on the job.' }),
      el('div', { class: 'row' }, Object.values(f).map(x => el('div', { class: 'col-md-6' }, x.wrap))),
      submitter(ctx, 'Save and continue', async () => { await send(`${BASE}/personal`, Object.fromEntries(Object.entries(f).map(([k, v]) => [k, v.ctl.value]))); await ctx.reload(); }));
  }

  function tax(ctx, s) {
    const t = s.tax;
    const f = {
      ssnLast4: field('Social Security number: last 4 digits', { value: t.ssnLast4, maxlength: 4, inputmode: 'numeric', autocomplete: 'off' }),
      filing: select('Filing status (W-4 step 1)', Object.entries(s.options.filing), t.filingStatus || 'single'),
      credits: field('Credits for children and dependents, per year ($, W-4 step 3)', { type: 'number', min: '0', step: '1', value: '0' }),
      other: field('Other income not from jobs ($ per year, step 4a)', { type: 'number', min: '0', step: '1', value: '0' }),
      deductions: field('Deductions beyond the standard deduction ($ per year, step 4b)', { type: 'number', min: '0', step: '1', value: '0' }),
      extra: field('Extra withholding each paycheck ($, step 4c)', { type: 'number', min: '0', step: '1', value: '0' }),
      i9: select('Work authorization (I-9 section 1)', Object.entries(s.options.i9), t.i9Status || 'citizen'),
      docs: field('Documents you will bring to show the office (original ID and work authorization)', { value: t.i9Docs, maxlength: 300, placeholder: 'e.g. Driver license and Social Security card' }),
      depType: select('How would you like to be paid?', [['checking', 'Direct deposit: checking'], ['savings', 'Direct deposit: savings'], ['check', 'Paper check']], t.depositType || 'checking'),
      bank: field('Bank name', { value: t.depositBank, maxlength: 80 }), last4: field('Account number: last 4 digits', { value: t.depositLast4, maxlength: 4, inputmode: 'numeric', autocomplete: 'off' }),
      name: field('Type your full legal name to sign', { maxlength: 120, autocomplete: 'name', value: '' })
    };
    const multi = check('I (or my spouse) have more than one job at a time (W-4 step 2)', t.multipleJobs), agree = check(s.contract.w4Text, false);
    const bankRows = el('div', { class: 'row' }, el('div', { class: 'col-md-6' }, f.bank.wrap), el('div', { class: 'col-md-6' }, f.last4.wrap));
    const toggle = () => { bankRows.classList.toggle('d-none', f.depType.ctl.value === 'check'); };
    f.depType.ctl.addEventListener('change', toggle); toggle();
    return el('div', {}, el('h3', { class: 'h5', text: 'Step 2: Tax forms and pay' }),
      el('p', { class: 'text-muted', text: 'This information is used to prepare your IRS Form W-4 and the employer part of Form I-9. Never type your full Social Security or bank account number here: the office will collect those securely in person. You will need to show original ID and work authorization documents within 3 business days of your start date.' }),
      el('div', { class: 'row' }, [f.ssnLast4, f.filing, f.credits, f.other, f.deductions, f.extra].map(x => el('div', { class: 'col-md-6' }, x.wrap))), multi.wrap,
      el('hr'), el('div', { class: 'row' }, [f.i9, f.docs].map(x => el('div', { class: 'col-md-6' }, x.wrap))),
      el('hr'), el('div', { class: 'row' }, el('div', { class: 'col-md-6' }, f.depType.wrap)), bankRows,
      el('hr'), agree.wrap, f.name.wrap,
      submitter(ctx, 'Sign and continue', async () => {
        await send(`${BASE}/tax`, { ssnLast4: f.ssnLast4.ctl.value, filingStatus: f.filing.ctl.value, multipleJobs: multi.ctl.checked, credits: num(f.credits), otherIncome: num(f.other), deductions: num(f.deductions), extraWithholding: num(f.extra), i9Status: f.i9.ctl.value, i9Docs: f.docs.ctl.value,
          depositType: f.depType.ctl.value, depositBank: f.bank.ctl.value, depositLast4: f.last4.ctl.value, signName: f.name.ctl.value, agree: agree.ctl.checked });
        await ctx.reload();
      }));
  }

  function contract(ctx, s) {
    const c = s.contract, name = field('Type your full legal name to sign', { maxlength: 120, autocomplete: 'name' });
    const agree = check('I have read and agree to the employment agreement and policies above.', false), consent = check(c.locationConsent, false);
    return el('div', {}, el('h3', { class: 'h5', text: 'Step 3: Employment agreement' }), el('p', { class: 'text-muted', text: 'Read the whole agreement, then sign with your typed name. We record the time, your device and your address as proof you signed.' }),
      el('div', { class: 'border rounded p-3 mb-3 contract-box pre-wrap', tabindex: '0', role: 'region', 'aria-label': 'Employment agreement', text: c.text }),
      agree.wrap, el('h4', { class: 'h6 mt-3', text: 'Location tracking notice' }), consent.wrap, name.wrap,
      submitter(ctx, 'Sign agreement', async () => { await send(`${BASE}/contract`, { signName: name.ctl.value, agree: agree.ctl.checked, locationConsent: consent.ctl.checked }); await ctx.reload(); }));
  }

  // ---------- Experience (also reused as a normal tab after onboarding)
  function experienceForm(ctx, s, { editing = false } = {}) {
    const cat = s.catalog, saved = s.experience || { trades: [], tasks: {} };
    const tasks = {}, taskRows = cat.tasks.map(([key, label]) => {
      const sel = el('select', { class: 'form-select form-select-sm', 'aria-label': label }, cat.levels.map((l, i) => el('option', { value: String(i), text: l })));
      sel.value = String(saved.tasks?.[key] ?? 0); tasks[key] = sel;
      return el('div', { class: 'col-md-6' }, el('label', { class: 'form-label small mb-1', text: label }), sel);
    });
    const trades = cat.trades.map(name => {
      const have = saved.trades?.find(t => t.name === name);
      const years = el('input', { type: 'number', min: '0', max: '60', class: 'form-control form-control-sm', value: have ? String(have.years) : '', placeholder: 'Years', 'aria-label': `${name} years` });
      const level = el('select', { class: 'form-select form-select-sm', 'aria-label': `${name} level` }, [['0', 'Not my trade'], ['1', 'Helper'], ['2', 'Skilled'], ['3', 'Lead / expert']].map(([v, t]) => el('option', { value: v, text: t })));
      level.value = String(have?.level || 0);
      return { name, years, level, row: el('div', { class: 'col-md-6' }, el('div', { class: 'fw-bold small', text: name }), el('div', { class: 'd-flex gap-2' }, level, years)) };
    });
    const bools = { ownVehicle: check('I have a reliable vehicle', saved.ownVehicle), driversLicense: check('I have a valid driver license', saved.driversLicense), canLift50: check('I can lift 50 lb regularly', saved.canLift50), okWithHeights: check('I am comfortable on ladders and at heights', saved.okWithHeights) };
    const texts = { certifications: field('Certifications and training (OSHA, EPA lead-safe, etc.)', { value: saved.certifications || '', maxlength: 600 }), licenses: field('Trade licenses', { value: saved.licenses || '', maxlength: 600 }),
      toolsOwned: field('Tools you own and can bring', { value: saved.toolsOwned || '', maxlength: 800 }, 'input'), languages: field('Languages you speak', { value: saved.languages || '', maxlength: 200 }),
      priorEmployers: field('Past employers and what you did there', { value: saved.priorEmployers || '', rows: 3, maxlength: 1000 }, 'textarea'), availability: field('Availability and any limits', { value: saved.availability || '', maxlength: 300 }), notes: field('Anything else we should know', { value: saved.notes || '', rows: 2, maxlength: 1500 }, 'textarea') };
    texts.priorEmployers.ctl.value = saved.priorEmployers || ''; texts.notes.ctl.value = saved.notes || '';
    return el('div', {}, el('h3', { class: 'h5', text: editing ? 'My experience' : 'Step 4: Your experience' }),
      el('p', { class: 'text-muted', text: 'Be honest: this is how the office decides which jobs to give you and who to pair you with. Saying you can do something you cannot hurts you and the customer. You can update this any time.' }),
      el('h4', { class: 'h6', text: 'Your trades' }), el('div', { class: 'row g-2 mb-3' }, trades.map(t => t.row)),
      el('h4', { class: 'h6', text: 'How comfortable are you with each task?' }), el('div', { class: 'row g-2 mb-3' }, taskRows),
      el('div', { class: 'mb-3' }, Object.values(bools).map(b => b.wrap)), Object.values(texts).map(t => t.wrap),
      submitter(ctx, editing ? 'Save experience' : 'Save and start training', async () => {
        const r = await send(`${BASE}/experience`, { trades: trades.filter(t => t.level.value !== '0' && t.years.value !== '').map(t => ({ name: t.name, years: Number(t.years.value), level: Number(t.level.value) })),
          tasks: Object.fromEntries(Object.entries(tasks).map(([k, v]) => [k, Number(v.value)])), ...Object.fromEntries(Object.entries(bools).map(([k, v]) => [k, v.ctl.checked])), ...Object.fromEntries(Object.entries(texts).map(([k, v]) => [k, v.ctl.value])) });
        if (editing) notice('success', 'Experience saved.'); else await ctx.reload();
        return r;
      }));
  }

  // ---------- Training
  function training(ctx, s) {
    const t = s.training, box = el('div');
    const row = (m, final) => el('div', { class: 'card card-body mb-2' }, el('div', { class: 'd-flex flex-wrap justify-content-between gap-2 align-items-center' },
      el('div', {}, el('strong', { text: m.title }), el('div', { class: 'small text-muted', text: final ? `${t.finalQuestions} scenario questions \u00b7 ${m.attemptsLeft} attempt${m.attemptsLeft === 1 ? '' : 's'} left` : `Day ${m.day} \u00b7 about ${m.minutes} minutes${m.attempts ? ` \u00b7 best score ${m.bestPercent}%` : ''}` })),
      m.passed ? el('span', { class: 'badge text-bg-success', text: `Passed ${m.bestPercent}%` }) : m.locked ? el('span', { class: 'badge text-bg-secondary', text: final ? 'Pass every module first' : m.unlockAt ? `Unlocks ${stamp(m.unlockAt)}` : 'Locked' }) : final && m.attemptsLeft < 1 ? el('span', { class: 'badge text-bg-danger', text: 'Ask the office to reset' })
        : el('button', { type: 'button', class: 'btn btn-sm btn-brass', text: m.attempts ? 'Try again' : 'Start', onclick: () => lesson(m.key) })));
    const list = () => {
      const done = t.modules.filter(m => m.passed).length;
      box.replaceChildren(el('h3', { class: 'h5', text: 'Step 5: Training' }),
        el('p', { class: 'text-muted', text: `Your training runs ${t.days} day${t.days === 1 ? '' : 's'}. Read each lesson, then pass its quiz with ${t.passMark}% or better. A new day of lessons unlocks about every 18 hours. Finish with the final exam; the office reviews your results and unlocks the app.` }),
        el('div', { class: 'd-flex gap-1 mb-1', role: 'img', 'aria-label': `${done} of ${t.modules.length} modules passed` }, t.modules.map(m => el('div', { class: `flex-fill rounded p-1 ${m.passed ? 'bg-success' : 'bg-secondary-subtle'}` }))),
        el('p', { class: 'small text-muted mb-3', text: `${done} of ${t.modules.length} modules passed` }),
        ...t.modules.map(m => row(m, false)), row(t.final, true));
    };
    const lesson = async key => {
      try {
        const d = await api(`${BASE}/training/${key}`);
        const picks = {}, qs = d.questions.map(q => el('fieldset', { class: 'mb-3' }, el('legend', { class: 'h6', text: `${q.id + 1}. ${q.q}` }), q.o.map((o, i) => {
          const id = `q${key}${q.id}${i}`;
          return el('div', { class: 'form-check' }, el('input', { class: 'form-check-input', type: 'radio', name: `q${key}${q.id}`, id, onchange: () => { picks[q.id] = i; } }), el('label', { class: 'form-check-label', for: id, text: o }));
        })));
        box.replaceChildren(el('button', { type: 'button', class: 'btn btn-link p-0 mb-2', text: '\u2190 Back to training', onclick: () => ctx.reload() }), el('h3', { class: 'h5', text: d.title }),
          ...d.lessons.map(l => el('div', { class: 'mb-3' }, el('h4', { class: 'h6', text: l.h }), el('p', { class: 'pre-wrap mb-0', text: l.p }))),
          el('hr'), el('h4', { class: 'h5', text: key === 'final' ? 'Final exam' : 'Quiz' }), ...qs,
          submitter(ctx, 'Submit answers', async () => {
            if (Object.keys(picks).length < d.questions.length) { notice('warning', 'Answer every question first.'); return; }
            const r = await send(`${BASE}/training/${key}`, { answers: picks });
            const missed = r.missed.map(x => el('li', { class: 'mb-1' }, x.question, x.correct ? el('div', { class: 'small text-success', text: `Right answer: ${x.correct}` }) : null));
            box.replaceChildren(el('h3', { class: 'h5', text: r.passed ? 'You passed' : 'Not yet' }), el('p', { text: `You scored ${r.score} of ${r.total} (${r.percent}%). ${r.passed ? '' : `You need ${t.passMark}%.`}${r.attemptsLeft != null && !r.passed ? ` Attempts left: ${r.attemptsLeft}.` : ''}` }),
              missed.length ? el('div', {}, el('h4', { class: 'h6', text: 'Review these' }), el('ul', {}, missed)) : null, el('button', { type: 'button', class: 'btn btn-brass', text: 'Continue', onclick: () => ctx.reload() }));
          }));
        box.scrollIntoView({ block: 'start' });
      } catch (e) { notice('danger', e.message); }
    };
    list();
    return box;
  }

  function waiting(ctx, s) {
    return el('div', { class: 'card card-body' }, el('h3', { class: 'h5', text: 'Training complete: waiting for the office' }), el('p', { class: 'mb-3', text: 'You finished the forms, your experience profile, every module and the final exam. The office is reviewing your results and will unlock clock-in and your jobs. You will get an email.' }), el('div', {}, el('button', { type: 'button', class: 'btn btn-outline-dark btn-sm', text: 'Check again', onclick: () => ctx.reload() })));
  }

  const STEPS = [['personal', 'About you'], ['tax', 'Tax and pay'], ['contract', 'Agreement'], ['experience', 'Experience'], ['training', 'Training']];
  async function mount(root, { done, signOut }) {
    const ctx = { done, reload: () => mount(root, { done, signOut }) };
    const s = await api(BASE);
    if (s.done) return done();
    status = el('div', { role: 'status', 'aria-live': 'polite' });
    const current = !s.steps.personal ? 'personal' : !s.steps.tax ? 'tax' : !s.steps.contract ? 'contract' : !s.steps.experience ? 'experience' : 'training';
    const idx = STEPS.findIndex(x => x[0] === current);
    const body = current === 'personal' ? personal(ctx, s) : current === 'tax' ? tax(ctx, s) : current === 'contract' ? contract(ctx, s) : current === 'experience' ? experienceForm(ctx, s) : s.stage === 'review' ? waiting(ctx, s) : training(ctx, s);
    root.className = '';
    root.replaceChildren(el('div', { class: 'd-flex flex-wrap justify-content-between align-items-center gap-3 mb-3' }, el('div', {}, el('h2', { class: 'h3 mb-0', text: `Welcome, ${s.profile.name.split(' ')[0]}` }), el('span', { class: 'text-muted', text: 'Finish these steps to unlock the app. Your progress is saved.' })), el('button', { type: 'button', class: 'btn btn-sm btn-outline-dark', text: 'Sign out', onclick: signOut })),
      el('ol', { class: 'nav nav-pills mb-4 flex-wrap onboard-steps' }, STEPS.map(([k, label], i) => el('li', { class: 'nav-item' }, el('span', { class: `nav-link${i === idx ? ' active' : ''}${i < idx ? ' done' : ''}`, 'aria-current': i === idx ? 'step' : null, text: `${i < idx ? '\u2713 ' : ''}${i + 1}. ${label}` })))),
      status, current === 'training' && s.stage === 'review' ? body : el('div', { class: 'card card-body' }, body));
  }

  async function experienceTab(box) {
    status = el('div', { role: 'status', 'aria-live': 'polite' });
    const s = await api(BASE);
    box.replaceChildren(status, el('div', { class: 'card card-body' }, experienceForm({ done: () => {}, reload: () => {} }, s, { editing: true })));
  }

  window.bbsOnboarding = { mount, experienceTab };
})();
