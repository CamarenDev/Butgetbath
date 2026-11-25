const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

class Element {
  constructor(tag = 'div') {
    this.tagName = tag.toUpperCase();
    this.children = [];
    this.listeners = {};
    this.attributes = {};
    this.parentElement = null;
    this.className = '';
    this._text = '';
    this.hidden = false;
    this.disabled = false;
    this.value = '';
    this.checked = false;
    this.open = false;
  }
  set textContent(value) { this._text = String(value ?? ''); this.children = []; }
  get textContent() { return this._text + this.children.map(x => typeof x === 'string' ? x : x.textContent).join(''); }
  setAttribute(name, value) {
    this.attributes[name] = String(value);
    if (name === 'class') this.className = String(value);
    if (name === 'id') this.id = String(value);
  }
  removeAttribute(name) { delete this.attributes[name]; }
  append(...children) {
    for (const child of children.flat(Infinity)) {
      if (child == null || child === false) continue;
      if (typeof child === 'string') this._text += child;
      else { child.parentElement = this; this.children.push(child); }
    }
  }
  replaceChildren(...children) { this._text = ''; this.children = []; this.append(...children); }
  addEventListener(type, listener) { (this.listeners[type] ||= []).push(listener); }
  emit(type) {
    const event = { type, target: this, currentTarget: this, preventDefault() { this.defaultPrevented = true; } };
    return Promise.all((this.listeners[type] || []).map(listener => listener(event)));
  }
  remove() {
    if (!this.parentElement) return;
    this.parentElement.children = this.parentElement.children.filter(x => x !== this);
    this.parentElement = null;
  }
  get classList() {
    return {
      add: (...names) => { this.className = [...new Set(`${this.className} ${names.join(' ')}`.trim().split(/\s+/))].join(' '); },
      remove: (...names) => { this.className = this.className.split(/\s+/).filter(x => !names.includes(x)).join(' '); },
      contains: name => this.className.split(/\s+/).includes(name)
    };
  }
  matches(selector) {
    if (selector.startsWith('#')) return this.id === selector.slice(1);
    if (selector.startsWith('.')) return this.classList.contains(selector.slice(1));
    if (selector.startsWith('[') && selector.endsWith(']')) {
      const key = selector.slice(1, -1);
      return key in this.attributes;
    }
    return selector === this.tagName.toLowerCase();
  }
  descendants() { return this.children.flatMap(x => typeof x === 'string' ? [] : [x, ...x.descendants()]); }
  querySelector(selector) { return this.descendants().find(x => x.matches(selector)) || null; }
  querySelectorAll(selector) { return this.descendants().filter(x => x.matches(selector)); }
  closest(selector) { for (let node = this; node; node = node.parentElement) if (node.matches(selector)) return node; return null; }
  focus() {}
  scrollIntoView() {}
  reportValidity() { return true; }
  click() { return this.emit('click'); }
}

const response = (status, body = {}) => ({ ok: status >= 200 && status < 300, status, json: async () => body });
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
};

function fixture(fetchImpl = async () => response(200, {})) {
  const byId = {};
  const register = (id, tag = 'div', className = '') => {
    const node = new Element(tag);
    node.id = id; node.className = className;
    byId[id] = node;
    return node;
  };
  const app = register('admin-app'); app.hidden = true;
  const login = register('admin-login'); login.hidden = true;
  const form = register('login-form', 'form', 'login-card');
  const status = new Element('div'); status.className = 'form-status';
  const submit = new Element('button'); submit.setAttribute('type', 'submit');
  form.append(status, submit);
  const heading = register('login-heading');
  const intro = register('login-intro');
  const retry = register('login-retry', 'button'); retry.hidden = true;
  const loginStatus = () => status;
  form.reportValidity = () => true;
  form.querySelector = selector => selector === '[type="submit"]' ? submit : Element.prototype.querySelector.call(form, selector);
  const body = new Element('body');
  body.append(app, login);
  const side = register('side');
  const main = register('admin-main');
  const title = register('admin-title');
  const nav = register('admin-nav');
  const view = register('view', 'main');
  const user = register('admin-user');
  const logout = register('logout', 'button');
  const email = register('lg-email', 'input');
  const password = register('lg-pass', 'input');
  login.append(form, heading, intro, retry);
  app.append(side, main); main.append(title, view, user); side.append(nav, logout);
  login.append(email, password);
  const document = {
    body,
    hidden: false,
    createElement: tag => new Element(tag),
    createElementNS: (namespace, tag) => new Element(tag),
    querySelector(selector) {
      if (selector === '#login-form .form-status') return loginStatus();
      if (selector.startsWith('#')) return byId[selector.slice(1).split(' ')[0]] || body.querySelector(selector);
      if (selector.startsWith('.')) return body.querySelector(selector);
      return body.querySelector(selector);
    }
  };
  const location = { hash: '#dashboard', origin: 'https://admin.example.test', replace() {} };
  const windowListeners = {};
  const window = {
    __adminPortalTestMode: true,
    __adminPortalNoBoot: true,
    addEventListener(type, listener) { (windowListeners[type] ||= []).push(listener); },
    location,
    bbsI18n: { adopt() {} }
  };
  window.window = window;
  const context = {
    window, document, location, fetch: fetchImpl, AbortController,
    URLSearchParams, console, confirm: () => true,
    setTimeout: () => 1, clearTimeout() {}, setInterval: () => 1, clearInterval() {},
    structuredClone, Math, Date, WeakSet, Promise, Error
  };
  vm.createContext(context);
  const source = fs.readFileSync(path.join(__dirname, '../assets/admin/admin.js'), 'utf8');
  vm.runInContext(source, context, { filename: 'assets/admin/admin.js' });
  return { app, login, heading, intro, retry, status, submit, view, byId, window, location, portal: window.__adminPortalTest };
}

test('classifies authentication, access, validation, server and network failures', async () => {
  const f = fixture();
  const cases = [
    [401, {}, 'auth', 401],
    [403, { error: 'Admin access required.' }, 'forbidden', 403],
    [422, { error: 'Name is required.' }, 'validation', 422],
    [500, {}, 'server', 500]
  ];
  for (const [status, body, kind, expectedStatus] of cases) {
    const local = fixture(async () => response(status, body));
    await assert.rejects(local.portal.api('/api/test'), error => error.kind === kind && error.status === expectedStatus);
  }
  const offline = fixture(async () => { throw new TypeError('fetch failed'); });
  await assert.rejects(offline.portal.api('/api/test'), error => error.kind === 'network' && /offline/i.test(error.message));
  assert.ok(f.portal);
});

test('the final selected route wins even when an older request ignores abort', async () => {
  const old = deferred();
  const f = fixture(async url => url === '/slow' ? old.promise : response(200, { name: 'new' }));
  f.portal.routes.dashboard = async () => {
    const data = await f.portal.api('/slow');
    f.view.replaceChildren(data.name);
  };
  f.portal.routes.customers = async () => {
    const data = await f.portal.api('/new');
    f.view.replaceChildren(data.name);
  };
  const first = f.portal.route();
  f.location.hash = '#customers';
  await f.portal.route();
  old.resolve(response(200, { name: 'old' }));
  await first;
  assert.equal(f.view.textContent, 'new');
  assert.equal(f.byId['admin-title'].textContent, 'Customers');
});

test('consequential button actions are locked before their first await', async () => {
  const f = fixture();
  const work = deferred();
  let calls = 0;
  const button = f.portal.btn('Save', async () => { calls++; await work.promise; });
  documentAttach(f, button);
  const first = button.emit('click');
  const duplicate = button.emit('click');
  assert.equal(calls, 1);
  assert.equal(button.disabled, true);
  assert.equal(button.attributes['aria-busy'], 'true');
  work.resolve();
  await Promise.all([first, duplicate]);
  assert.equal(calls, 1);
  assert.equal(button.disabled, false);
});

test('session expiry opens login while forbidden routes explain access', async () => {
  const expired = fixture(async () => response(401, { error: 'Please sign in.' }));
  expired.portal.routes.dashboard = async () => expired.portal.api('/api/private');
  await expired.portal.route();
  assert.equal(expired.login.hidden, false);
  assert.equal(expired.app.hidden, true);
  assert.match(expired.status.textContent, /session expired/i);

  const forbidden = fixture(async () => response(403, { error: 'Admin access required.' }));
  forbidden.portal.routes.dashboard = async () => forbidden.portal.api('/api/admin/stats');
  await forbidden.portal.route();
  assert.match(forbidden.view.textContent, /Admin access required/);
  assert.match(forbidden.view.textContent, /do not have permission/i);
  assert.doesNotMatch(forbidden.view.textContent, /sign in again/i);
});

test('server, offline, validation and empty states are distinct and retryable', async () => {
  let attempts = 0;
  const f = fixture(async () => {
    attempts++;
    return attempts === 1 ? response(500, { error: 'boom' }) : response(200, { ok: true });
  });
  f.portal.routes.dashboard = async () => {
    await f.portal.api('/api/section');
    f.view.replaceChildren('Loaded');
  };
  await f.portal.route();
  assert.match(f.view.textContent, /could not load/i);
  assert.match(f.view.textContent, /server could not complete/i);
  const retry = findByText(f.view, 'Try again');
  assert.ok(retry);
  await retry.emit('click');
  assert.equal(f.view.textContent, 'Loaded');
  assert.equal(attempts, 2);

  const offline = fixture(async () => { throw new TypeError('offline'); });
  offline.portal.routes.dashboard = async () => offline.portal.api('/api/section');
  await offline.portal.route();
  assert.match(offline.view.textContent, /offline/i);
  assert.ok(findByText(offline.view, 'Try again'));

  const invalid = fixture(async () => response(422, { error: 'Title is required.' }));
  const panel = invalid.portal.panel('Edit');
  const save = invalid.portal.btn('Save', async () => invalid.portal.api('/api/save', { method: 'POST' }));
  panel.append(save); invalid.view.append(panel);
  await save.emit('click');
  assert.match(panel.textContent, /Title is required/);
  assert.ok(panel.querySelector('[data-form-error]'));

  const empty = f.portal.empty('No contact submissions yet.');
  assert.equal(empty.attributes.role, 'status');
  assert.ok(empty.classList.contains('admin-empty'));
  assert.match(empty.textContent, /No contact submissions/);
});

test('auth bootstrap retries 500s and keeps 403 separate from a signed-out session', async () => {
  let calls = 0;
  const f = fixture(async url => {
    calls++;
    if (url === '/api/auth/me') return calls === 1 ? response(500) : response(200, { user: { admin: true, email: 'admin@example.test' } });
    return response(200, { pipeline: { new: 0 }, unacknowledged: 0 });
  });
  f.portal.routes.dashboard = async () => f.view.replaceChildren('Dashboard ready');
  await f.portal.boot();
  assert.equal(f.login.hidden, false);
  assert.equal(f.heading.textContent, 'Admin portal unavailable');
  assert.equal(f.retry.hidden, false);
  await f.retry.emit('click');
  assert.equal(calls >= 4, true);
  assert.equal(f.app.hidden, false);
  assert.equal(f.view.textContent, 'Dashboard ready');

  const noAccess = fixture(async () => response(200, { user: { admin: false, email: 'staff@example.test' } }));
  await noAccess.portal.boot();
  assert.equal(noAccess.heading.textContent, 'Admin access required');
  assert.match(noAccess.status.textContent, /does not have admin access/i);
});

test('admin shell has keyboard and mobile overflow affordances', () => {
  const root = path.join(__dirname, '..');
  const html = fs.readFileSync(path.join(root, 'assets/admin/index.html'), 'utf8');
  const css = fs.readFileSync(path.join(root, 'assets/admin.css'), 'utf8') + fs.readFileSync(path.join(root, 'assets/enterprise.css'), 'utf8');
  assert.match(html, /class="admin-skip-link"/);
  assert.match(html, /id="view"[^>]+tabindex="-1"/);
  assert.match(css, /\.admin-view \.table-wrap[^{]*{[^}]*overflow-x:auto/);
  assert.match(css, /min-height:44px/);
  assert.match(css, /\.admin-side\{width:min\(20rem,88vw\)/);
});

function documentAttach(fixture, button) {
  fixture.view.append(button);
}

function findByText(root, text) {
  return root.descendants().find(node => node.textContent === text);
}
