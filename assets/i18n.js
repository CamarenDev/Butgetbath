// Language support. English is the default; Spanish is chosen with the language switcher (footer, account, employee and admin settings).
// The choice is kept in localStorage and, when signed in, saved to the account so it follows the person to other devices.
(() => {
  const KEY = 'bbs-lang';
  const stored = (() => { try { return localStorage.getItem(KEY); } catch { return null; } })();
  const lang = stored === 'es' ? 'es' : 'en';
  document.documentElement.lang = lang;

  const save = next => {
    try { localStorage.setItem(KEY, next); } catch { /* private mode */ }
    return fetch('/api/auth/preferences', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ lang: next }) }).catch(() => {});
  };
  const set = async next => { if (next !== lang) { await save(next); location.reload(); } };

  const LABEL = { en: { name: 'Language', en: 'English', es: 'Spanish' }, es: { name: 'Idioma', en: 'Inglés', es: 'Español' } };
  const mount = root => (root || document).querySelectorAll('[data-lang-switch]:not([data-ready])').forEach(box => {
    box.dataset.ready = '1';
    const label = document.createElement('label'), pick = document.createElement('select');
    pick.className = 'form-select form-select-sm d-inline-block w-auto';
    pick.id = `lang-${Math.random().toString(36).slice(2, 7)}`;
    label.htmlFor = pick.id; label.className = 'me-2'; label.textContent = LABEL[lang].name; label.setAttribute('data-no-translate', '');
    for (const code of ['en', 'es']) { const o = document.createElement('option'); o.value = code; o.textContent = code === 'es' ? 'Español' : 'English'; o.selected = code === lang; pick.append(o); }
    pick.addEventListener('change', () => set(pick.value));
    box.append(label, pick);
  });

  // Called after sign-in so a saved account language wins on a new device.
  const adopt = saved => { if ((saved === 'es' || saved === 'en') && saved !== lang && !stored) { try { localStorage.setItem(KEY, saved); } catch { return; } location.reload(); } };
  window.bbsI18n = { lang, set, mount, adopt };

  const ready = fn => (document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', fn) : fn());
  ready(() => {
    mount();
    // Portals render after load, so switchers they add are mounted as they appear.
    new MutationObserver(() => mount()).observe(document.body, { childList: true, subtree: true });
  });
  if (lang !== 'es') return;

  const SKIP = new Set(['SCRIPT', 'STYLE', 'TEXTAREA', 'CODE', 'PRE']);
  const ATTRS = ['placeholder', 'aria-label', 'title', 'alt', 'data-label'];
  let dict = { exact: {}, patterns: [] };
  const skipped = n => { for (let p = n.nodeType === 1 ? n : n.parentElement; p; p = p.parentElement) if (SKIP.has(p.tagName) || p.hasAttribute('data-no-translate') || p.classList.contains('notranslate')) return true; return false; };
  const tr = raw => {
    const t = raw.trim();
    if (!t || t.length > 400) return null;
    const flat = t.replace(/\s+/g, ' ');
    const hit = dict.exact[flat];
    if (hit) return hit === flat ? null : hit;
    for (const [re, fn] of dict.patterns) { const m = flat.match(re); if (m) { const out = typeof fn === 'function' ? fn(...m.slice(1)) : flat.replace(re, fn); return out === flat ? null : out; } }
    return null;
  };
  const text = node => { const out = tr(node.nodeValue); if (out) node.nodeValue = node.nodeValue.replace(node.nodeValue.trim(), () => out); };
  const attrs = el => { for (const a of ATTRS) { const v = el.getAttribute?.(a); if (v) { const out = tr(v); if (out) el.setAttribute(a, out); } } };
  const walk = root => {
    if (!root || skipped(root)) return;
    if (root.nodeType === 3) { text(root); return; }
    if (root.nodeType !== 1) return;
    attrs(root);
    const it = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
    for (let n = it.nextNode(); n; n = it.nextNode()) {
      if (n.nodeType === 3) { if (!skipped(n)) text(n); } else if (!skipped(n)) attrs(n);
    }
  };
  const start = () => {
    walk(document.body);
    if (document.title) { const out = tr(document.title.replace(/ \| Budget Bath Solutions$/, '')); if (out) document.title = `${out} | Budget Bath Solutions`; }
    new MutationObserver(list => { for (const m of list) { if (m.type === 'characterData') walk(m.target); else if (m.type === 'attributes') attrs(m.target); else m.addedNodes.forEach(walk); } })
      .observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATTRS });
  };
  // The dictionary loads only for Spanish, so English visitors download nothing extra.
  const src = [...document.scripts].find(s => /\/i18n\.js/.test(s.src))?.src || '/i18n.js';
  const s = document.createElement('script');
  s.src = src.replace('i18n.js', 'i18n-es.js'); // keeps the ?v= fingerprint
  s.onload = () => { dict = window.BBS_ES || dict; ready(start); };
  document.head.append(s);
})();
