const fs = require('node:fs');
const path = require('node:path');
const site = require('./site.json');
const { services, counties, guides, questions } = require('./content');

const out = path.join(__dirname, 'dist');
const today = new Date().toISOString().slice(0, 10);
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const phoneHref = site.phone ? 'tel:' + site.phone.replace(/[^\d+]/g, '') : '';
const areaNames = counties.map(c => c.name).join(', ').replace(/, ([^,]*)$/, ' and $1');
const pages = [];

const icons = {
  'bathroom-remodeling': '<path d="M4 12h16v2a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5zM6 12V6a2 2 0 0 1 4 0M3 12h18"/>',
  'tile-installation': '<path d="M3 3h8v8H3zM13 3h8v8h-8zM3 13h8v8H3zM13 13h8v8h-8z"/>',
  'shower-and-tub-remodeling': '<path d="M5 20V8a4 4 0 0 1 8 0M13 8h6M9 13v1m4 2v1m-8-1v1m4 1v1"/>',
  'basement-and-other-remodeling': '<path d="M14 4l6 6-3 3-6-6zM11 7L4 14v6h6l7-7"/>',
  check: '<path d="M5 12l5 5 9-10"/>',
  arrow: '<path d="M5 12h14m-6-6l6 6-6 6"/>',
  phone: '<path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z"/>',
  shield: '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/><path d="M9 12l2 2 4-4"/>',
  chat: '<path d="M4 5h16v11H9l-5 4z"/>',
  pin: '<path d="M12 21s7-6 7-12a7 7 0 0 0-14 0c0 6 7 12 7 12z"/><circle cx="12" cy="9" r="2.5"/>'
};
const icon = (name, cls = '') => `<svg class="icon ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${icons[name]}</svg>`;

const contactLine = () => phoneHref ? `<a href="${phoneHref}">${esc(site.phone)}</a>` : '<a href="/contact/">Request a call</a>';
const cta = (label = 'Get a Free Estimate', cls = 'btn-brass') => `<a class="btn ${cls} btn-lg" href="/contact/">${label} ${icon('arrow', 'ms-1')}</a>`;
const callUs = () => phoneHref ? `call us at <a href="${phoneHref}">${esc(site.phone)}</a>` : '<a href="/contact/">contact us</a>';

function field(id, label, opts = {}) {
  const { type = 'text', required = false, col = 'col-md-6', autocomplete = '', hint = '', attrs = '' } = opts;
  return `<div class="${col}"><label for="${id}" class="form-label">${label}${required ? ' <span class="text-danger" aria-hidden="true">*</span>' : ''}</label><input class="form-control form-control-lg" id="${id}" name="${id}" type="${type}"${attrs}${required ? ' required' : ''}${autocomplete ? ` autocomplete="${autocomplete}"` : ''}${hint ? ` aria-describedby="${id}-hint"` : ''}>${hint ? `<div id="${id}-hint" class="form-text">${hint}</div>` : ''}<div class="invalid-feedback">Please enter a valid ${label.toLowerCase()}.</div></div>`;
}
function select(id, label, options, required = true) {
  return `<div class="col-md-6"><label for="${id}" class="form-label">${label}${required ? ' <span class="text-danger" aria-hidden="true">*</span>' : ''}</label><select class="form-select form-select-lg" id="${id}" name="${id}"${required ? ' required' : ''}><option value="">Choose one</option>${options.map(o => `<option>${esc(o)}</option>`).join('')}</select><div class="invalid-feedback">Please choose an option.</div></div>`;
}
function form(type, { interestLabel, interestOptions, messageLabel, button, heading, note }) {
  return `<form class="lead-form card card-body p-4 p-lg-5 shadow-lg" action="/api/submissions" method="post" novalidate data-form>
<h2 class="h3 mb-1">${heading}</h2><p class="text-muted mb-4">${note}</p>
<input type="hidden" name="type" value="${type}">
<div class="visually-hidden" aria-hidden="true"><label for="${type}-website">Leave this field empty</label><input id="${type}-website" name="website" tabindex="-1" autocomplete="off"></div>
<div class="row g-3">
${field('name', 'Full name', { required: true, autocomplete: 'name' })}${field('email', 'Email', { type: 'email', required: true, autocomplete: 'email' })}
${field('phone', 'Phone', { type: 'tel', autocomplete: 'tel' })}
${select('location', 'County', counties.map(c => c.name).concat(['Other / not sure']))}
${select('interest', interestLabel, interestOptions)}
<div class="col-12"><label for="message" class="form-label">${messageLabel}</label><textarea class="form-control form-control-lg" id="message" name="message" rows="4" maxlength="4000"></textarea></div>
<div class="col-12"><div class="form-check"><input class="form-check-input" type="checkbox" id="consent" name="consent" required><label class="form-check-label" for="consent">I agree to be contacted about this request and have read the <a href="/privacy/" target="_blank" rel="noopener">Privacy Policy</a>.</label><div class="invalid-feedback">Please agree so we can respond.</div></div></div>
<div class="col-12"><button class="btn btn-brass btn-lg w-100" type="submit">${button}</button><div class="form-status mt-3" role="status" aria-live="polite"></div></div>
</div></form>`;
}
const projectForm = () => form('project', { heading: 'Request your free estimate', note: 'Tell us a little about your project. We will follow up to schedule a time to talk.', interestLabel: 'Project type', interestOptions: services.map(s => s.name).concat(['Not sure yet']), messageLabel: 'Tell us about your project', button: 'Request My Free Estimate' });

function layout({ url, title, desc, body, ld = [], noindex = false, crumbs = [], main = '' }) {
  const canonical = site.url + url;
  const fullTitle = url === '/' ? title : `${title} | ${site.name}`;
  const breadcrumb = crumbs.length ? [{ '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [['Home', '/']].concat(crumbs).map(([n, u], i) => ({ '@type': 'ListItem', position: i + 1, name: n, item: site.url + u })) }] : [];
  const org = { '@context': 'https://schema.org', '@type': 'GeneralContractor', '@id': site.url + '/#business', name: site.name, url: site.url + '/', image: site.url + '/og-image.png', description: 'Bathroom remodeling and tile installation in Kane, Kendall, DuPage and DeKalb counties, Illinois.', areaServed: counties.map(c => ({ '@type': 'AdministrativeArea', name: `${c.name}, Illinois` })), ...(site.phone && { telephone: site.phone }), ...(site.email && { email: site.email }) };
  const schema = (url === '/' ? [org, { '@context': 'https://schema.org', '@type': 'WebSite', name: site.name, url: site.url + '/' }] : []).concat(ld, breadcrumb);
  const nav = [['Services', '/services/'], ['Service Areas', '/service-areas/'], ['Homeowner Help', '/homeowner-help/'], ['Community Q&A', '/community/'], ['About', '/about/'], ['Work With Us', '/work-with-us/'], ['My Account', '/account/']];
  const current = n => (url === n[1] || (n[1] !== '/' && url.startsWith(n[1]))) ? ' active" aria-current="page' : '';
  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(fullTitle)}</title><meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${canonical}">${noindex ? '<meta name="robots" content="noindex, follow">' : '<meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1">'}
<meta name="theme-color" content="#12302f"><link rel="icon" href="/favicon.svg" type="image/svg+xml">
<meta property="og:type" content="website"><meta property="og:site_name" content="${site.name}"><meta property="og:locale" content="en_US">
<meta property="og:title" content="${esc(fullTitle)}"><meta property="og:description" content="${esc(desc)}"><meta property="og:url" content="${canonical}">
<meta property="og:image" content="${site.url}/og-image.png"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630"><meta property="og:image:alt" content="${site.name}: bathroom remodeling and tile in Kane, Kendall, DuPage and DeKalb counties">
<meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${esc(fullTitle)}"><meta name="twitter:description" content="${esc(desc)}"><meta name="twitter:image" content="${site.url}/og-image.png">
<link rel="stylesheet" href="/vendor/bootstrap.min.css"><link rel="stylesheet" href="/styles.css">
${schema.map(s => `<script type="application/ld+json">${JSON.stringify(s).replace(/</g, '\\u003c')}</script>`).join('\n')}
</head><body>
<a class="skip-link" href="#main">Skip to main content</a>
<header class="site-header sticky-top"><nav class="navbar navbar-expand-lg" aria-label="Main">
<div class="container"><a class="navbar-brand" href="/"><img src="/favicon.svg" alt="" width="36" height="36"> <span>Budget Bath <b>Solutions</b></span></a>
<button class="navbar-toggler" type="button" data-bs-toggle="collapse" data-bs-target="#nav" aria-controls="nav" aria-expanded="false" aria-label="Toggle navigation"><span class="navbar-toggler-icon"></span></button>
<div class="collapse navbar-collapse" id="nav"><ul class="navbar-nav ms-auto align-items-lg-center gap-lg-1">
${nav.map(n => `<li class="nav-item"><a class="nav-link${current(n)}" href="${n[1]}">${n[0]}</a></li>`).join('')}
<li class="nav-item ms-lg-2 mt-2 mt-lg-0"><a class="btn btn-brass" href="/contact/">Free Estimate</a></li></ul></div></div></nav></header>
<main id="main">${body}</main>
<footer class="site-footer"><div class="container"><div class="row g-5">
<div class="col-lg-4"><p class="footer-brand">Budget Bath Solutions</p><p>Bathroom remodeling and tile for homeowners in ${areaNames}, Illinois.</p><p class="mb-1">${icon('phone', 'me-1')} ${contactLine()}</p>${site.email ? `<p class="mb-1"><a href="mailto:${esc(site.email)}">${esc(site.email)}</a></p>` : ''}<p class="small opacity-75">${site.hours}</p></div>
<div class="col-6 col-lg-2"><h2 class="footer-h">Services</h2><ul class="list-unstyled">${services.map(s => `<li><a href="/services/${s.slug}/">${s.name}</a></li>`).join('')}</ul></div>
<div class="col-6 col-lg-3"><h2 class="footer-h">Service Areas</h2><ul class="list-unstyled">${counties.map(c => `<li><a href="/service-areas/${c.slug}/">${c.name}</a></li>`).join('')}</ul></div>
<div class="col-6 col-lg-3"><h2 class="footer-h">Company</h2><ul class="list-unstyled"><li><a href="/about/">About</a></li><li><a href="/homeowner-help/">Homeowner Help</a></li><li><a href="/community/">Community Q&amp;A</a></li><li><a href="/work-with-us/">Work With Us</a></li><li><a href="/contact/">Contact</a></li></ul></div>
</div><hr><div class="d-flex flex-wrap justify-content-between gap-2 small"><span>&copy; ${new Date().getFullYear()} ${site.name}. All rights reserved.</span><span><a href="/privacy/">Privacy Policy</a> &middot; <a href="/terms/">Terms of Use</a> &middot; <a href="/accessibility/">Accessibility</a> &middot; <a href="/sitemap.xml">Sitemap</a></span></div></div></footer>
<div class="mobile-cta d-lg-none">${phoneHref ? `<a class="btn btn-outline-light" href="${phoneHref}">Call</a>` : ''}<a class="btn btn-brass" href="/contact/">Free Estimate</a></div>
<script src="/vendor/bootstrap.bundle.min.js" defer></script><script src="/app.js" defer></script>${url.startsWith('/account/') ? '<script src="/account.js" defer></script>' : ''}
</body></html>`;
}

function add(p) { pages.push(p); }
const crumbBlock = crumbs => `<nav aria-label="Breadcrumb" class="mb-3"><ol class="breadcrumb">${[['Home', '/']].concat(crumbs).map(([n, u], i, a) => i === a.length - 1 ? `<li class="breadcrumb-item active" aria-current="page">${n}</li>` : `<li class="breadcrumb-item"><a href="${u}">${n}</a></li>`).join('')}</ol></nav>`;
const pageHead = (h1, lead, crumbs) => `<section class="page-hero"><div class="container">${crumbs ? crumbBlock(crumbs) : ''}<h1>${h1}</h1><p class="lead">${lead}</p></div></section>`;
const serviceCard = s => `<div class="col-md-6 col-xl-3"><a class="card service-card h-100" href="/services/${s.slug}/"><div class="card-body p-4"><span class="icon-badge">${icon(s.slug)}</span><h3 class="h5 mt-3">${s.name}</h3><p class="text-muted">${s.short}</p><span class="more">Learn more ${icon('arrow', 'ms-1')}</span></div></a></div>`;
const ctaBand = (h = 'Ready to talk about your bathroom?') => `<section class="cta-band"><div class="container text-center"><h2>${h}</h2><p class="lead">Free estimates for homeowners in ${areaNames}.</p>${cta()}</div></section>`;

// Home
add({
  url: '/', title: 'Bathroom Remodeling & Tile in Kane, Kendall, DuPage & DeKalb Counties, IL', desc: 'Budget Bath Solutions: bathroom remodeling and tile installation for Illinois homeowners in Kane, Kendall, DuPage and DeKalb counties. Request a free estimate.',
  body: `<section class="hero"><div class="container"><div class="row align-items-center g-5"><div class="col-lg-6">
<p class="eyebrow">Kane &middot; Kendall &middot; DuPage &middot; DeKalb</p><h1>Beautiful bathrooms,<br>without the <em>runaround</em>.</h1>
<p class="lead">Bathroom remodeling and tile installation for Illinois homeowners. Clear communication, careful craftsmanship and a free estimate.</p>
<div class="d-flex flex-wrap gap-3">${cta()}<a class="btn btn-outline-light btn-lg" href="/services/">Explore Services</a></div>
<ul class="trust list-unstyled"><li>${icon('check')} Free in-home estimates</li><li>${icon('check')} Local to northern Illinois</li><li>${icon('check')} Written scope &amp; schedule</li></ul></div>
<div class="col-lg-6"><div class="hero-art"><img src="/bathroom.svg" alt="Illustration of a modern bathroom with an arched mirror, tile wall and freestanding tub" width="1100" height="1200" fetchpriority="high"></div></div></div></div></section>
<section class="section"><div class="container"><div class="section-head"><p class="eyebrow dark">What we do</p><h2>Bathrooms and tile are our specialty</h2><p>We also take on other home projects. Tell us what you have in mind.</p></div><div class="row g-4">${services.map(serviceCard).join('')}</div></div></section>
<section class="section bg-sand"><div class="container"><div class="row g-5 align-items-center"><div class="col-lg-5"><p class="eyebrow dark">Why homeowners call us</p><h2>A calmer way to remodel</h2><p class="lead">A remodel is a big decision. We keep it simple.</p></div><div class="col-lg-7"><div class="row g-4">
${[['chat', 'Straight answers', 'We explain your options plainly and tell you honestly what makes sense for your home.'], ['shield', 'Care for your home', 'Clean job sites, respectful crews and attention to the details you will live with every day.'], ['pin', 'Local to you', 'We work in Kane, Kendall, DuPage and DeKalb counties, so we know the homes and the towns.'], ['check', 'Clear next steps', 'A written scope and schedule, so you know what to expect before work begins.']].map(([i, t, d]) => `<div class="col-sm-6"><div class="feature"><span class="icon-badge">${icon(i)}</span><h3 class="h5">${t}</h3><p>${d}</p></div></div>`).join('')}
</div></div></div></div></section>
<section class="section"><div class="container"><div class="section-head"><p class="eyebrow dark">Where we work</p><h2>Serving four Illinois counties</h2></div><div class="row g-4">${counties.map(c => `<div class="col-md-6 col-xl-3"><a class="card area-card h-100" href="/service-areas/${c.slug}/"><div class="card-body p-4"><h3 class="h5">${c.name}</h3><p class="text-muted small mb-0">${c.cities.slice(0, 5).join(', ')} &amp; more</p></div></a></div>`).join('')}</div></div></section>
<section class="section bg-sand"><div class="container"><div class="section-head"><p class="eyebrow dark">Homeowner help</p><h2>Plan smarter before you remodel</h2></div><div class="row g-4">${guides.slice(0, 3).map(g => `<div class="col-md-4"><a class="card guide-card h-100" href="/homeowner-help/${g.slug}/"><div class="card-body p-4"><h3 class="h5">${g.title}</h3><p class="text-muted">${g.short}</p><span class="more">Read the guide ${icon('arrow', 'ms-1')}</span></div></a></div>`).join('')}</div></div></section>
<section class="section"><div class="container"><div class="row justify-content-center"><div class="col-lg-8">${projectForm()}</div></div></div></section>`
});

// Services
add({ url: '/services/', title: 'Bathroom Remodeling & Tile Services', desc: 'Bathroom remodeling, tile installation, shower and tub remodeling and more for homeowners in Kane, Kendall, DuPage and DeKalb counties, Illinois.', crumbs: [['Services', '/services/']], body: pageHead('Our Services', 'Bathroom remodeling and tile are our specialty. We also handle other home projects.', [['Services', '/services/']]) + `<section class="section"><div class="container"><div class="row g-4">${services.map(serviceCard).join('')}</div></div></section>` + ctaBand() });
for (const s of services) {
  const crumbs = [['Services', '/services/'], [s.name, `/services/${s.slug}/`]];
  add({
    url: `/services/${s.slug}/`, title: s.title, desc: s.desc, crumbs,
    ld: [{ '@context': 'https://schema.org', '@type': 'Service', name: s.name, description: s.desc, provider: { '@id': site.url + '/#business' }, areaServed: counties.map(c => ({ '@type': 'AdministrativeArea', name: `${c.name}, Illinois` })) }],
    body: pageHead(s.name, s.intro, crumbs) + `<section class="section"><div class="container"><div class="row g-5"><div class="col-lg-7"><h2>What is included</h2><ul class="check-list">${s.points.map(p => `<li>${icon('check')}${p}</li>`).join('')}</ul>
<h2 class="mt-5">Frequently asked questions</h2><div class="accordion" id="faq">${s.faqs.map((f, i) => `<div class="accordion-item"><h3 class="accordion-header"><button class="accordion-button${i ? ' collapsed' : ''}" type="button" data-bs-toggle="collapse" data-bs-target="#f${i}" aria-expanded="${i ? 'false' : 'true'}" aria-controls="f${i}">${f[0]}</button></h3><div id="f${i}" class="accordion-collapse collapse${i ? '' : ' show'}" data-bs-parent="#faq"><div class="accordion-body">${f[1]}</div></div></div>`).join('')}</div>
<p class="mt-4 lead">Have a question about your project? ${callUs()} and we will help.</p></div><div class="col-lg-5">${projectForm()}</div></div></div></section>`
  });
}

// Areas
add({ url: '/service-areas/', title: 'Service Areas: Kane, Kendall, DuPage & DeKalb Counties', desc: 'Budget Bath Solutions serves homeowners across Kane, Kendall, DuPage and DeKalb counties in northern Illinois.', crumbs: [['Service Areas', '/service-areas/']], body: pageHead('Where We Work', `We serve homeowners across ${areaNames}, Illinois.`, [['Service Areas', '/service-areas/']]) + `<section class="section"><div class="container"><div class="row g-4">${counties.map(c => `<div class="col-md-6"><a class="card area-card h-100" href="/service-areas/${c.slug}/"><div class="card-body p-4"><h2 class="h4">${c.name}</h2><p class="text-muted">${c.cities.join(', ')}</p><span class="more">Bathroom remodeling in ${c.name} ${icon('arrow', 'ms-1')}</span></div></a></div>`).join('')}</div></div></section>` + ctaBand() });
for (const c of counties) {
  const crumbs = [['Service Areas', '/service-areas/'], [c.name, `/service-areas/${c.slug}/`]];
  add({
    url: `/service-areas/${c.slug}/`, title: `Bathroom Remodeling & Tile in ${c.name}, IL`, desc: `Bathroom remodeling and tile installation for homeowners in ${c.name}, Illinois, including ${c.cities.slice(0, 4).join(', ')}. Request a free estimate.`, crumbs,
    ld: [{ '@context': 'https://schema.org', '@type': 'Service', name: `Bathroom remodeling in ${c.name}, Illinois`, provider: { '@id': site.url + '/#business' }, areaServed: { '@type': 'AdministrativeArea', name: `${c.name}, Illinois` } }],
    body: pageHead(`Bathroom Remodeling in ${c.name}, Illinois`, c.blurb, crumbs) + `<section class="section"><div class="container"><div class="row g-5"><div class="col-lg-7"><h2>Communities we serve in ${c.name}</h2><ul class="city-list">${c.cities.map(x => `<li>${x}</li>`).join('')}</ul><p class="text-muted">Do not see your town? ${callUs()}. We may still be able to help.</p>
<h2 class="mt-5">Services in ${c.name}</h2><ul class="check-list">${services.map(s => `<li>${icon('check')}<a href="/services/${s.slug}/">${s.name}</a></li>`).join('')}</ul></div><div class="col-lg-5">${projectForm()}</div></div></div></section>`
  });
}

// Homeowner help
add({ url: '/homeowner-help/', title: 'Homeowner Help: Bathroom Remodeling Guides', desc: 'Helpful overviews for Illinois homeowners planning a bathroom remodel or tile project: planning, tile, water damage and tub-to-shower conversions.', crumbs: [['Homeowner Help', '/homeowner-help/']], body: pageHead('Homeowner Help', 'Practical overviews to help you plan. For advice specific to your home, talk to us.', [['Homeowner Help', '/homeowner-help/']]) + `<section class="section"><div class="container"><div class="row g-4">${guides.map(g => `<div class="col-md-6"><a class="card guide-card h-100" href="/homeowner-help/${g.slug}/"><div class="card-body p-4"><h2 class="h4">${g.title}</h2><p class="text-muted">${g.short}</p><span class="more">Read the guide ${icon('arrow', 'ms-1')}</span></div></a></div>`).join('')}</div></div></section>` + ctaBand('Questions about your project?') });
for (const g of guides) {
  const crumbs = [['Homeowner Help', '/homeowner-help/'], [g.title, `/homeowner-help/${g.slug}/`]];
  add({
    url: `/homeowner-help/${g.slug}/`, title: g.title, desc: g.desc, crumbs,
    ld: [{ '@context': 'https://schema.org', '@type': 'Article', headline: g.title, description: g.desc, dateModified: today, author: { '@type': 'Organization', name: site.name }, publisher: { '@id': site.url + '/#business' }, mainEntityOfPage: site.url + `/homeowner-help/${g.slug}/` }],
    body: pageHead(g.title, g.short, crumbs) + `<section class="section"><div class="container"><div class="row g-5"><div class="col-lg-8 article">${g.body.map(([h, t]) => `<h2>${h}</h2><p>${t}</p>`).join('')}<div class="callout"><strong>Every home is different.</strong> This overview is general information, not a substitute for an inspection. To talk about your project, ${callUs()} or <a href="/contact/">request a free estimate</a>.</div></div><aside class="col-lg-4"><div class="sticky-lg-top aside-sticky">${projectForm()}</div></aside></div></div></section>`
  });
}

// Community Q&A
add({
  url: '/community/', title: 'Community Q&A for Illinois Homeowners', desc: 'Homeowner questions about bathroom remodeling and tile, with short answers. Ask your own question and our team will follow up.', crumbs: [['Community Q&A', '/community/']],
  body: pageHead('Community Q&amp;A', 'Real questions from homeowners, with short answers. Have your own? Ask below.', [['Community Q&A', '/community/']]) + `<section class="section"><div class="container"><div class="row g-5"><div class="col-lg-7"><div class="accordion" id="qa">${questions.map((q, i) => `<div class="accordion-item"><h2 class="accordion-header"><button class="accordion-button${i ? ' collapsed' : ''}" type="button" data-bs-toggle="collapse" data-bs-target="#q${i}" aria-expanded="${i ? 'false' : 'true'}" aria-controls="q${i}">${q[0]}</button></h2><div id="q${i}" class="accordion-collapse collapse${i ? '' : ' show'}" data-bs-parent="#qa"><div class="accordion-body">${q[1]}</div></div></div>`).join('')}</div><p class="mt-4 text-muted">Questions are reviewed by our team and are not posted publicly. For the detailed answer, ${callUs()}.</p></div><div class="col-lg-5">${form('question', { heading: 'Ask a question', note: 'Send us your question. We will reply and may add common questions to this page.', interestLabel: 'Topic', interestOptions: ['Remodeling', 'Tile', 'Showers & tubs', 'Repairs', 'Budget & timing', 'Other'], messageLabel: 'Your question', button: 'Send My Question' })}</div></div></div></section>`
});

// About, Contact, Work With Us
add({ url: '/about/', title: 'About Budget Bath Solutions', desc: 'Budget Bath Solutions helps homeowners in Kane, Kendall, DuPage and DeKalb counties with bathroom remodeling, tile and home projects.', crumbs: [['About', '/about/']], body: pageHead('About Budget Bath Solutions', 'A local team focused on bathrooms, tile and straightforward service.', [['About', '/about/']]) + `<section class="section"><div class="container"><div class="row g-5"><div class="col-lg-7 article"><h2>Our approach</h2><p>We started with a simple idea: remodeling should be less stressful. That means listening first, explaining options in plain language and doing careful work in your home.</p><h2>What we do</h2><p>Bathroom remodeling and tile installation are our specialty, along with shower and tub remodeling and other home projects. We serve ${areaNames}, Illinois.</p><h2>How we work</h2><ul class="check-list">${['You request a free estimate', 'We talk through your goals and visit your home', 'You receive a written scope and schedule', 'We do the work and walk through it with you'].map(x => `<li>${icon('check')}${x}</li>`).join('')}</ul><p class="mt-4">Want to join us? See <a href="/work-with-us/">Work With Us</a>.</p></div><div class="col-lg-5">${projectForm()}</div></div></div></section>` });
add({ url: '/contact/', title: 'Contact Us & Request a Free Estimate', desc: 'Request a free bathroom remodeling or tile estimate in Kane, Kendall, DuPage or DeKalb county, Illinois. Contact Budget Bath Solutions.', crumbs: [['Contact', '/contact/']], body: pageHead('Contact Us', 'Tell us about your project and we will be in touch to schedule your free estimate.', [['Contact', '/contact/']]) + `<section class="section"><div class="container"><div class="row g-5"><div class="col-lg-7">${projectForm()}</div><div class="col-lg-5"><div class="card card-body p-4 contact-card"><h2 class="h4">Reach us</h2><p>${icon('phone', 'me-1')} ${contactLine()}</p>${site.email ? `<p><a href="mailto:${esc(site.email)}">${esc(site.email)}</a></p>` : ''}<p>${icon('pin', 'me-1')} Serving ${areaNames}, Illinois</p><p class="mb-0">${site.hours}</p></div></div></div></div></section>` });
add({
  url: '/work-with-us/', title: 'Work With Us: Careers & Subcontractor Opportunities', desc: 'Join Budget Bath Solutions. We are looking for tile setters, bathroom remodelers and skilled trades in Kane, Kendall, DuPage and DeKalb counties, IL.', crumbs: [['Work With Us', '/work-with-us/']],
  ld: [{ '@context': 'https://schema.org', '@type': 'WebPage', name: 'Work With Us', url: site.url + '/work-with-us/' }],
  body: pageHead('Work With Us', 'Skilled in tile, remodeling or the trades? Join a team that values quality and communication.', [['Work With Us', '/work-with-us/']]) + `<section class="section"><div class="container"><div class="row g-5"><div class="col-lg-5"><h2>Who we are looking for</h2><ul class="check-list">${['Tile setters and helpers', 'Bathroom remodelers and carpenters', 'Plumbers and electricians', 'Painters and finishers', 'Reliable subcontractors'].map(x => `<li>${icon('check')}${x}</li>`).join('')}</ul><h2 class="mt-5">What you can expect</h2><p>Respect, clear expectations and steady local work. Tell us about your experience and we will be in touch about next steps.</p><p class="text-muted small">Submitting this form does not create an employment or contracting relationship. Positions and pay vary and are not guaranteed.</p></div><div class="col-lg-7">${form('work', { heading: 'Apply to work with us', note: 'Share a few details and we will follow up if there is a fit.', interestLabel: 'Trade / role', interestOptions: ['Tile setter', 'Tile helper', 'Remodeler / carpenter', 'Plumber', 'Electrician', 'Painter / finisher', 'Other'], messageLabel: 'Your experience, licenses and availability', button: 'Send My Application' })}</div></div></div></section>`
});

// Legal
const legal = (url, title, desc, html) => add({ url, title, desc, crumbs: [[title, url]], body: pageHead(title, `Last updated ${today}`, [[title, url]]) + `<section class="section"><div class="container"><div class="article legal">${html}</div></div></section>` });
legal('/privacy/', 'Privacy Policy', 'How Budget Bath Solutions collects, uses and protects information submitted through this website.', `<p>This policy explains how ${site.name} handles information you provide through this website.</p><h2>Information we collect</h2><p>When you submit a form, we collect the details you enter, such as your name, email, phone, county, project or role details and message. We also keep standard technical information needed to run and secure the site, such as IP address in server logs and rate limiting.</p><h2>How we use it</h2><p>We use your information to respond to your request, provide estimates, evaluate work applications and operate and protect the site. We do not sell your personal information.</p><h2>Customer accounts and photos</h2><p>If you create a free account, we store your name, email, optional phone number, a securely hashed password, and the project requests and photos you send. Photos are stored privately and are visible only to you and our team. Please do not upload images that show people&rsquo;s faces, documents or other sensitive information.</p><h2>Cookies and analytics</h2><p>When you sign in, we set one essential session cookie to keep you signed in. We do not use advertising trackers. If we add analytics or advertising tools, we will update this policy.</p><h2>Email</h2><p>We send transactional emails such as account confirmation, password resets, and replies to your requests. We do not send marketing email without your permission.</p><h2>Sharing</h2><p>We share information only with service providers who help us run the business, such as Resend, which delivers our email, and where required by law.</p><h2>Retention and security</h2><p>We keep submissions as long as needed to respond and for business records, and we use reasonable safeguards. No method of transmission or storage is completely secure.</p><h2>Your choices</h2><p>You may ask us to access, correct or delete your information by ${callUs()}. Do not send sensitive personal information, such as Social Security or financial account numbers, through the forms.</p><h2>Children</h2><p>This site is not directed to children under 13.</p><h2>Changes</h2><p>We may update this policy and will post the date above.</p>`);
legal('/terms/', 'Terms of Use', 'Terms governing use of the Budget Bath Solutions website.', `<p>By using this website you agree to these terms.</p><h2>General information only</h2><p>Content, including homeowner guides and Q&amp;A, is general information and not professional, legal or engineering advice. Conditions in your home vary. Contact us for advice specific to your project.</p><h2>No contract by website</h2><p>Submitting a form or reading an estimate range does not create a contract. Work is performed only under a separate written agreement.</p><h2>Acceptable use</h2><p>Do not misuse the site, submit false or harmful content, attempt unauthorized access or interfere with its operation.</p><h2>Intellectual property</h2><p>Site content belongs to ${site.name} or its licensors. You may not copy it without permission.</p><h2>Disclaimer and limitation of liability</h2><p>The site is provided &ldquo;as is.&rdquo; To the fullest extent permitted by law, ${site.name} is not liable for damages arising from your use of the site.</p><h2>Governing law</h2><p>These terms are governed by the laws of the State of Illinois.</p><h2>Changes</h2><p>We may update these terms at any time.</p>`);
legal('/accessibility/', 'Accessibility Statement', 'Budget Bath Solutions is committed to making this website usable by everyone, including people with disabilities.', `<p>We want everyone to be able to use this website. We aim to follow the Web Content Accessibility Guidelines (WCAG) 2.2 Level AA.</p><h2>What we do</h2><ul><li>Semantic headings, landmarks and a skip link</li><li>Keyboard-operable navigation and forms with labels</li><li>Sufficient color contrast and responsive layouts</li><li>Respect for reduced-motion preferences</li></ul><h2>Feedback</h2><p>If you have trouble using any part of this site, please ${callUs()} and tell us what happened. We will work to help and fix the issue.</p>`);
add({ url: '/thank-you/', title: 'Thank You', desc: 'Thanks for contacting Budget Bath Solutions.', noindex: true, body: pageHead('Thank you!', 'We received your information and will be in touch soon.') + `<section class="section"><div class="container text-center"><a class="btn btn-brass btn-lg" href="/">Back to Home</a></div></section>` });
add({ url: '/404.html', file: '404.html', title: 'Page Not Found', desc: 'The page you were looking for could not be found.', noindex: true, body: pageHead('Page not found', 'That page does not exist or has moved.') + `<section class="section"><div class="container text-center"><a class="btn btn-brass btn-lg" href="/">Back to Home</a></div></section>` });

// Customer accounts (rendered by assets/account.js; never indexed)
const acct = (url, title, lead, inner, page) => add({ url, title, desc: `${title} for Budget Bath Solutions customers.`, noindex: true, body: pageHead(title, lead) + `<section class="section"><div class="container"><div class="row justify-content-center"><div class="${page === 'dashboard' || page === 'request' || page === 'admin' ? 'col-lg-10' : 'col-lg-6'}" data-account-page="${page}">${inner}</div></div></div></section>` });
const authForm = ({ api, button, fields, extra = '', redirect = '' }) => `<form class="lead-form card card-body p-4 p-lg-5 shadow-lg" data-auth data-api="${api}"${redirect ? ` data-redirect="${redirect}"` : ''} novalidate><div class="row g-3">${fields}<div class="col-12"><button class="btn btn-brass btn-lg w-100" type="submit">${button}</button><div class="form-status mt-3" role="status" aria-live="polite"></div></div></div>${extra}</form>`;
const emailField = field('email', 'Email', { type: 'email', required: true, col: 'col-12', autocomplete: 'email' });
const passField = (label, auto) => field('password', label, { type: 'password', required: true, col: 'col-12', autocomplete: auto, attrs: ' minlength="10" maxlength="200"', hint: auto === 'new-password' ? 'At least 10 characters.' : '' });
const projectTypes = services.map(s => s.name).concat(['Not sure yet']);
const timelines = ['As soon as possible', 'Within 1-3 months', '3-6 months', 'Just exploring'];
const budgets = ['Under $5,000', '$5,000-$10,000', '$10,000-$20,000', '$20,000+', 'Not sure yet'];
acct('/account/login/', 'Sign In', 'Welcome back. Sign in to manage your project requests.', authForm({ api: '/api/auth/login', button: 'Sign In', redirect: '/account/', fields: emailField + passField('Password', 'current-password'), extra: '<p class="mt-4 mb-0 text-center"><a href="/account/forgot-password/">Forgot your password?</a> &middot; <a href="/account/register/">Create a free account</a></p>' }), 'login');
acct('/account/register/', 'Create Your Free Account', 'Send us photos and tell us what you are looking for. It only takes a minute.', authForm({ api: '/api/auth/register', button: 'Create Free Account', fields: field('name', 'Full name', { required: true, col: 'col-12', autocomplete: 'name' }) + emailField + field('phone', 'Phone (optional)', { type: 'tel', col: 'col-12', autocomplete: 'tel' }) + passField('Password', 'new-password') + '<div class="col-12"><div class="form-check"><input class="form-check-input" type="checkbox" id="consent" name="consent" required><label class="form-check-label" for="consent">I agree to the <a href="/terms/" target="_blank" rel="noopener">Terms of Use</a> and <a href="/privacy/" target="_blank" rel="noopener">Privacy Policy</a>.</label><div class="invalid-feedback">Please agree to continue.</div></div></div>', extra: '<p class="mt-4 mb-0 text-center">Already have an account? <a href="/account/login/">Sign in</a></p>' }), 'register');
acct('/account/forgot-password/', 'Forgot Password', 'Enter your email and we will send you a link to reset it.', authForm({ api: '/api/auth/forgot', button: 'Send Reset Link', fields: emailField }), 'forgot');
acct('/account/reset-password/', 'Choose a New Password', 'Pick a new password for your account.', authForm({ api: '/api/auth/reset', button: 'Update Password', redirect: '/account/login/', fields: passField('New password', 'new-password') }), 'reset');
acct('/account/verify/', 'Confirm Your Email', 'One moment while we confirm your email address.', '<div class="card card-body p-4 p-lg-5 text-center"><div class="form-status" role="status" aria-live="polite">Confirming...</div><p class="mt-4 mb-0"><a class="btn btn-brass" href="/account/login/">Sign In</a></p></div>', 'verify');
acct('/account/', 'My Account', 'Your project requests, photos and messages to our team.', '<div id="account-root" class="form-status" role="status" aria-live="polite">Loading...</div>', 'dashboard');
acct('/account/new/', 'New Project Request', 'Tell us what you are looking for and add photos of your space.', `<form class="lead-form card card-body p-4 p-lg-5 shadow-lg" data-request-form novalidate><div class="row g-3">${field('title', 'Project title', { required: true, col: 'col-12', attrs: ' maxlength="120" placeholder="e.g. Primary bath remodel"' })}${select('projectType', 'Project type', projectTypes)}${select('location', 'County', counties.map(c => c.name).concat(['Other / not sure']))}${select('timeline', 'Timeline', timelines, false)}${select('budget', 'Budget range', budgets, false)}<div class="col-12"><label for="description" class="form-label">What are you looking for? <span class="text-danger" aria-hidden="true">*</span></label><textarea class="form-control form-control-lg" id="description" name="description" rows="5" minlength="10" maxlength="4000" required></textarea><div class="invalid-feedback">Please describe your project (at least 10 characters).</div></div><div class="col-12"><label for="photos" class="form-label">Photos (optional)</label><input class="form-control form-control-lg" id="photos" type="file" accept="image/jpeg,image/png,image/webp" multiple aria-describedby="photos-hint"><div id="photos-hint" class="form-text">Up to 10 JPG, PNG or WebP photos, 8 MB each. Photos are private and only visible to you and our team.</div></div><div class="col-12"><button class="btn btn-brass btn-lg w-100" type="submit">Send to Budget Bath Solutions</button><div class="form-status mt-3" role="status" aria-live="polite"></div></div></div></form>`, 'new');
acct('/account/request/', 'Project Request', 'Details and photos for your request.', '<div id="account-root" class="form-status" role="status" aria-live="polite">Loading...</div>', 'request');
acct('/account/admin/', 'Customer Requests', 'Submitted project requests and photos (staff only).', '<div id="account-root" class="form-status" role="status" aria-live="polite">Loading...</div>', 'admin');

// Write
fs.rmSync(out, { recursive: true, force: true });
const write = (rel, data) => { const f = path.join(out, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, data); };
for (const p of pages) write(p.file || (p.url === '/' ? 'index.html' : p.url.slice(1) + 'index.html'), layout(p));
const indexable = pages.filter(p => !p.noindex);
write('sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${indexable.map(p => `<url><loc>${site.url}${p.url}</loc><lastmod>${today}</lastmod></url>`).join('\n')}\n</urlset>\n`);
write('robots.txt', `User-agent: *\nAllow: /\nDisallow: /api/\n\nSitemap: ${site.url}/sitemap.xml\n`);
// og-card.html is only the source for rendering og-image.png; it is not published.
for (const f of fs.readdirSync(path.join(__dirname, 'assets')).filter(f => f !== 'og-card.html')) fs.copyFileSync(path.join(__dirname, 'assets', f), path.join(out, f));
const bs = path.join(__dirname, 'node_modules/bootstrap/dist');
fs.mkdirSync(path.join(out, 'vendor'), { recursive: true });
fs.copyFileSync(path.join(bs, 'css/bootstrap.min.css'), path.join(out, 'vendor/bootstrap.min.css'));
fs.copyFileSync(path.join(bs, 'js/bootstrap.bundle.min.js'), path.join(out, 'vendor/bootstrap.bundle.min.js'));
console.log(`Built ${pages.length} pages into dist/`);
