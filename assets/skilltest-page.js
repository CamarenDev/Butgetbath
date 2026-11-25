// Applicant skills test: loads questions with the emailed token, shows a timer, submits answers for server-side grading.
(() => {
  const root = document.querySelector('[data-skill-test]');
  if (!root) return;
  const token = new URLSearchParams(location.search).get('token') || '';
  const lang = localStorage.getItem('bbs-lang') === 'es' ? 'es' : 'en';
  const T = lang === 'es'
    ? { badLink: 'Este enlace no es válido. Use el enlace del correo de confirmación.', hello: 'Hola', pick: 'Elija la prueba de su oficio. Son 15 preguntas de opción múltiple, unos 30 minutos, y un solo intento por oficio.', start: 'Comenzar', resume: 'Continuar', done: 'Completada', time: 'Tiempo restante', submit: 'Enviar respuestas', unanswered: 'Sin responder', confirm: 'Hay preguntas sin responder. ¿Enviar de todos modos?', thanks: 'Gracias. Recibimos sus respuestas. Nuestro equipo las revisará junto con su solicitud.', next: 'Hacer otra prueba', home: 'Volver al inicio', err: 'Algo salió mal. Intente de nuevo.', q: 'Pregunta' }
    : { badLink: 'This test link is not valid. Use the link from your confirmation email.', hello: 'Hi', pick: 'Choose the test for your trade. It is 15 multiple-choice questions, about 30 minutes, and one attempt per trade.', start: 'Start', resume: 'Resume', done: 'Completed', time: 'Time left', submit: 'Submit answers', unanswered: 'Unanswered', confirm: 'Some questions are unanswered. Submit anyway?', thanks: 'Thank you. We received your answers. Our team will review them with your application.', next: 'Take another test', home: 'Back to home', err: 'Something went wrong. Please try again.', q: 'Question' };

  const el = (tag, props = {}, ...kids) => {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(props)) { if (k === 'text') n.textContent = v; else if (k in n && k !== 'class' && k !== 'for') n[k] = v; else n.setAttribute(k, v); }
    n.append(...kids.flat().filter(x => x != null));
    return n;
  };
  const pending = new Map();
  const api = async (path, body) => {
    const key = `${path}:${body ? JSON.stringify(body) : ''}`;
    if (pending.has(key)) return pending.get(key);
    const run = request(path, body);
    pending.set(key, run);
    run.finally(() => pending.delete(key)).catch(() => {});
    return run;
  };
  const request = async (path, body) => {
    const r = await fetch(path, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : undefined);
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.error || T.err);
    return d;
  };
  const notice = (msg, kind = 'danger') => root.replaceChildren(el('div', { class: `alert alert-${kind}`, text: msg }));
  let timer = null, submitting = false;

  async function menu() {
    clearInterval(timer);
    const d = await api(`/api/applications/test?token=${encodeURIComponent(token)}&lang=${lang}`);
    root.replaceChildren(el('p', { text: `${T.hello} ${d.name}. ${T.pick}` }),
      el('div', { class: 'list-group' }, d.trades.map(t => el('div', { class: 'list-group-item d-flex flex-wrap align-items-center gap-2' },
        el('strong', { text: t.trade }), el('span', { class: 'ms-auto' }, t.status === 'done' ? el('span', { class: 'badge text-bg-success', text: T.done }) : el('button', { type: 'button', class: 'btn btn-brass btn-sm', text: t.status === 'started' ? T.resume : T.start, onclick: () => run(t.trade).catch(e => notice(e.message)) })))))); 
  }

  async function run(trade) {
    const d = await api(`/api/applications/test?token=${encodeURIComponent(token)}&trade=${encodeURIComponent(trade)}&lang=${lang}`);
    submitting = false;
    const answers = {}, timeLeft = el('strong'), count = el('span', { class: 'text-muted' });
    let left = d.secondsLeft;
    const tick = () => { const m = Math.floor(left / 60), s = left % 60; timeLeft.textContent = `${m}:${String(s).padStart(2, '0')}`; count.textContent = `${Object.keys(answers).length}/${d.questions.length}`; };
    const submit = async () => {
      if (submitting) return;
      submitting = true;
      clearInterval(timer);
      const button = form.querySelector('button[type=submit]');
      button.disabled = true; button.setAttribute('aria-busy', 'true'); button.textContent = T.submit === 'Submit answers' ? 'Submitting…' : 'Enviando…';
      try { const r = await api('/api/applications/test', { token, trade, lang, answers, attemptId: d.attemptId }); finish(r); } catch (e) { notice(e.message); }
    };
    const form = el('form', { novalidate: true, onsubmit: ev => { ev.preventDefault(); if (Object.keys(answers).length < d.questions.length && !confirm(T.confirm)) return; submit(); } },
      d.questions.map((x, n) => el('fieldset', { class: 'mb-4' }, el('legend', { class: 'h6', text: `${n + 1}. ${x.q}` }),
        x.o.map((text, i) => { const id = `q${x.id}o${i}`; return el('div', { class: 'form-check' }, el('input', { class: 'form-check-input', type: 'radio', name: `q${x.id}`, id, onchange: () => { answers[x.id] = i; tick(); } }), el('label', { class: 'form-check-label', for: id, text })); }))),
      el('button', { type: 'submit', class: 'btn btn-brass btn-lg', text: T.submit }));
    root.replaceChildren(el('h2', { class: 'h4', text: trade }), el('div', { class: 'sticky-top bg-white py-2 mb-3 d-flex gap-3 border-bottom' }, el('span', {}, `${T.time}: `, timeLeft), count), form);
    tick();
    timer = setInterval(() => { left -= 1; tick(); if (left <= 0) submit(); }, 1000);
    window.scrollTo(0, 0);
  }

  function finish(r) {
    root.replaceChildren(el('div', { class: 'alert alert-success', text: T.thanks }),
      r.remaining.length ? el('button', { type: 'button', class: 'btn btn-outline-dark me-2', text: T.next, onclick: () => menu().catch(e => notice(e.message)) }) : null,
      el('a', { class: 'btn btn-brass', href: '/', text: T.home }));
  }

  if (!token) notice(T.badLink);
  else menu().catch(e => notice(e.message));
})();
