const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createTemplates } = require('../lib/emails');
const { site, samples, spanish } = require('../lib/email-samples');

const templates = createTemplates(site, { phone: '(630) 555-0100' });
const root = path.join(__dirname, '..');

function* renderAll() {
  for (const [name, list] of Object.entries(samples)) {
    for (const [index, args] of list.entries()) {
      yield [`${name}#${index}`, templates[name](args)];
      if (spanish.includes(name)) yield [`${name}#${index}:es`, templates[name]({ ...args, lang: 'es' })];
    }
  }
}

test('every template used by the app exists and has a sample', () => {
  const files = [...fs.readdirSync(path.join(root, 'lib')).map(f => path.join(root, 'lib', f)), path.join(root, 'server.js')].filter(f => f.endsWith('.js'));
  const used = new Set();
  for (const file of files) for (const m of fs.readFileSync(file, 'utf8').matchAll(/templates\??\.([A-Za-z]+)/g)) used.add(m[1]);
  assert.ok(used.size >= 20);
  for (const name of used) {
    assert.equal(typeof templates[name], 'function', `templates.${name} is used but not defined`);
    assert.ok(samples[name], `templates.${name} has no sample in lib/email-samples.js`);
  }
  for (const name of Object.keys(templates)) assert.ok(samples[name], `templates.${name} has no sample in lib/email-samples.js`);
});

test('every template renders a complete, responsive, branded message', () => {
  let count = 0;
  for (const [label, mail] of renderAll()) {
    count++;
    assert.ok(mail.subject && !/undefined|\[object/.test(mail.subject), `${label} subject`);
    assert.ok(mail.text && !/undefined|\[object|NaN/.test(mail.text), `${label} text`);
    assert.ok(!/undefined|\[object|NaN/.test(mail.html.replace(/<style>[\s\S]*?<\/style>/, '')), `${label} html has an unfilled value`);
    assert.match(mail.html, /^<!doctype html>/i, label);
    assert.match(mail.html, /name="viewport" content="width=device-width,initial-scale=1"/, label);
    assert.match(mail.html, /@media only screen and \(max-width:620px\)/, label);
    assert.match(mail.html, /<html lang="(en|es)"/, label);
    assert.match(mail.html, /#0a1f44/, `${label} uses the site navy`);
    assert.match(mail.html, /<h1 /, label);
    assert.ok(mail.text.includes('Budget Bath Solutions'), `${label} text footer`);
    assert.ok(!/<(script|iframe|form)\b/i.test(mail.html), `${label} has unsafe markup`);
    assert.equal((mail.html.match(/<table/g) || []).length, (mail.html.match(/<\/table>/g) || []).length, `${label} balanced tables`);
  }
  assert.ok(count > 40);
});

test('Spanish versions are served only when requested', () => {
  for (const name of spanish) {
    const args = samples[name][0];
    const en = templates[name](args), es = templates[name]({ ...args, lang: 'es' });
    assert.match(en.html, /<html lang="en"/, name);
    assert.match(es.html, /<html lang="es"/, name);
    if (name === 'customerMessage') assert.match(es.text, /^Hola /); else assert.notEqual(en.subject, es.subject, `${name} subject is translated`);
  }
});

test('dynamic values are escaped and bodies are linkified safely', () => {
  const evil = '<img src=x onerror=alert(1)>';
  const mail = templates.customerMessage({ name: evil, subject: `Hi ${evil}`, body: `${evil}\n\nSee https://example.com/a?b=1&c=2.` });
  assert.ok(!mail.html.includes(evil));
  assert.match(mail.html, /href="https:\/\/example\.com\/a\?b=1&amp;c=2"/);
  const notice = templates.officeAlert({ subject: 'S', body: 'javascript:alert(1)', url: 'https://example.com/x' });
  assert.ok(!/href="javascript:/i.test(notice.html));
  const details = templates.newRequestAlert({ ...samples.newRequestAlert[0], user: { name: evil, email: 'a@b.co', phone: '' } });
  assert.ok(!details.html.includes(evil));
});

test('layout keeps the phone number, preheader and call-to-action accessible', () => {
  const mail = templates.estimateReady(samples.estimateReady[0]);
  assert.match(mail.html, /href="tel:\(?6305550100\)?"|href="tel:6305550100"/);
  assert.match(mail.html, /class="btn-link"[^>]*>Review my estimate</);
  assert.match(mail.html, /Estimate E-1001 is ready to review\./);
  assert.ok(mail.text.includes(site));
});
