#!/usr/bin/env node
// Renders every email template with sample data into tmp/email-previews/ (open index.html in a browser).
// Usage: npm run email:preview
const fs = require('node:fs');
const path = require('node:path');
const { createTemplates } = require('../lib/emails');
const { site, samples, spanish } = require('../lib/email-samples');

const out = path.join(__dirname, '..', 'tmp', 'email-previews');
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });
const templates = createTemplates(site, { phone: '(630) 555-0100' });
const links = [];
for (const [name, list] of Object.entries(samples)) {
  for (const [index, args] of list.entries()) {
    for (const lang of spanish.includes(name) ? ['en', 'es'] : ['en']) {
      const mail = templates[name](lang === 'es' ? { ...args, lang } : args);
      const file = `${name}-${index + 1}${lang === 'es' ? '-es' : ''}.html`;
      fs.writeFileSync(path.join(out, file), mail.html);
      links.push(`<li><a href="${file}">${name} #${index + 1}${lang === 'es' ? ' (es)' : ''}</a> &mdash; ${mail.subject.replace(/</g, '&lt;')}</li>`);
    }
  }
}
fs.writeFileSync(path.join(out, 'index.html'), `<!doctype html><meta charset="utf-8"><title>Email previews</title><body style="font-family:system-ui;max-width:48rem;margin:2rem auto"><h1>Email previews</h1><ul>${links.join('')}</ul>`);
console.log(`Wrote ${links.length} previews to ${out}`);
