// Shared building blocks for the transactional email templates. The look follows the website's design system
// (navy header with a blue accent rule, Inter-style type, 10px/14px radii). Layouts are tables with inline styles for
// client compatibility; a small <style> block adds the mobile rules for clients that support it (Gmail, Apple Mail, Outlook.com).
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const brand = {
  name: 'Budget Bath Solutions', ink: '#0a1f44', navy: '#061430', accent: '#2563eb', brass: '#1d4ed8', soft: '#e8efff',
  sand: '#f4f6fa', line: '#e2e8f0', muted: '#64748b', text: '#1e293b', sky: '#7dd3fc', page: '#f1f5f9'
};
const font = "Inter,'Segoe UI',system-ui,-apple-system,Roboto,'Helvetica Neue',Arial,sans-serif";

const FOOTER = {
  en: { tagline: 'Bathroom remodeling &amp; tile in Kane, Kendall, DuPage and DeKalb counties, Illinois', estimate: 'Free estimate', account: 'My account', call: 'Call us' },
  es: { tagline: 'Remodelación de baños y azulejo en los condados de Kane, Kendall, DuPage y DeKalb, Illinois', estimate: 'Estimado gratis', account: 'Mi cuenta', call: 'Llámenos' }
};

const paragraphs = lines => lines.filter(Boolean).map(l => `<p style="margin:0 0 16px;font-family:${font};font-size:16px;line-height:1.6;color:${brand.text};">${l}</p>`).join('');

const button = (url, label) => `<table role="presentation" class="btn-table" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 24px;"><tr><td class="btn-cell" align="center" bgcolor="${brand.accent}" style="background:${brand.accent};border:1px solid ${brand.brass};border-radius:10px;"><a href="${esc(url)}" class="btn-link" style="display:inline-block;padding:14px 28px;font-family:${font};font-size:16px;font-weight:600;line-height:1.25;color:#ffffff;text-decoration:none;">${esc(label)}</a></td></tr></table>`;

const details = rows => {
  const shown = rows.filter(([, v]) => v);
  if (!shown.length) return '';
  return `<table role="presentation" class="card" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 24px;background:${brand.sand};border:1px solid ${brand.line};border-left:3px solid ${brand.accent};border-radius:10px;"><tr><td style="padding:8px 20px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${shown.map(([k, v]) => `<tr><td class="kv-k" valign="top" width="34%" style="padding:10px 12px 10px 0;font-family:${font};font-size:13px;font-weight:600;line-height:1.5;color:${brand.muted};">${esc(k)}</td><td class="kv-v" valign="top" style="padding:10px 0;font-family:${font};font-size:15px;line-height:1.5;color:${brand.text};">${esc(v).replace(/\n/g, '<br>')}</td></tr>`).join('')}</table></td></tr></table>`;
};

// Escaped text with line breaks and clickable http(s) links, for free-form message bodies.
const linkify = escaped => escaped.replace(/https?:\/\/[^\s<]+/g, match => {
  const url = match.replace(/(?:[.,;:!?)]|&#39;|&quot;)+$/, '');
  return `<a href="${url}" style="color:${brand.brass};word-break:break-all;">${url}</a>${match.slice(url.length)}`;
});
const rich = text => String(text ?? '').split(/\n{2,}/).filter(part => part.trim()).map(part => linkify(esc(part)).replace(/\n/g, '<br>'));

const quote = html => `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 24px;"><tr><td style="padding:16px 20px;border-left:3px solid ${brand.accent};background:${brand.sand};border-radius:0 10px 10px 0;font-family:${font};font-size:16px;line-height:1.6;color:${brand.text};">${html}</td></tr></table>`;

const css = `
  body,table,td,a{-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%}
  table,td{mso-table-lspace:0;mso-table-rspace:0}
  img{border:0;outline:none;text-decoration:none;-ms-interpolation-mode:bicubic}
  a{word-break:break-word}
  @media only screen and (max-width:620px){
    .outer{padding:12px 8px!important}
    .container{width:100%!important;max-width:100%!important;border-radius:12px!important}
    .px{padding-left:20px!important;padding-right:20px!important}
    .h1{font-size:22px!important;line-height:1.3!important}
    .btn-table{width:100%!important}
    .btn-cell{width:100%!important}
    .btn-link{display:block!important;padding:15px 16px!important}
    .kv-k,.kv-v{display:block!important;width:100%!important;padding:2px 0!important}
    .kv-v{padding-bottom:12px!important}
    .footer-links a{display:inline-block;padding:6px 0}
  }`;

function layout({ preheader = '', heading, body, siteUrl, footnote = '', eyebrow = '', lang = 'en', phone = '' }) {
  const t = FOOTER[lang] || FOOTER.en;
  const host = siteUrl.replace(/^https?:\/\//, '');
  const pad = '&#8199;&zwnj;'.repeat(40);
  const tel = phone ? ` &middot; <a href="tel:${esc(phone.replace(/[^\d+]/g, ''))}" style="color:${brand.brass};text-decoration:none;">${t.call}: ${esc(phone)}</a>` : '';
  return `<!doctype html>
<html lang="${lang === 'es' ? 'es' : 'en'}" xmlns="http://www.w3.org/1999/xhtml">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="X-UA-Compatible" content="IE=edge"><meta name="x-apple-disable-message-reformatting"><meta name="format-detection" content="telephone=no,date=no,address=no,email=no"><meta name="color-scheme" content="light only"><meta name="supported-color-schemes" content="light only"><title>${esc(heading)}</title>
<!--[if mso]><style>table,td,a,p,h1{font-family:Arial,sans-serif!important}</style><![endif]-->
<style>${css}</style></head>
<body style="margin:0;padding:0;width:100%;background:${brand.page};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all;font-size:1px;line-height:1px;color:${brand.page};">${esc(preheader)}${pad}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${brand.page}" style="background:${brand.page};"><tr><td class="outer" align="center" style="padding:32px 16px;">
<table role="presentation" class="container" width="600" cellpadding="0" cellspacing="0" border="0" bgcolor="#ffffff" style="width:100%;max-width:600px;background:#ffffff;border:1px solid ${brand.line};border-radius:14px;overflow:hidden;">
<tr><td class="px" bgcolor="${brand.ink}" style="background:${brand.ink};background-image:linear-gradient(135deg,${brand.ink},${brand.navy});padding:24px 32px;border-bottom:3px solid ${brand.accent};">
<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
<td valign="middle" style="padding-right:12px;"><a href="${esc(siteUrl)}"><img src="${esc(siteUrl)}/icon-192.png" width="40" height="40" alt="" style="display:block;width:40px;height:40px;border-radius:10px;"></a></td>
<td valign="middle"><a href="${esc(siteUrl)}" style="font-family:${font};font-size:20px;font-weight:700;letter-spacing:-.02em;color:#ffffff;text-decoration:none;">Budget Bath <span style="color:${brand.sky};">Solutions</span></a></td>
</tr></table></td></tr>
<tr><td class="px" style="padding:36px 32px 12px;font-family:${font};">${eyebrow ? `<p style="margin:0 0 10px;font-family:${font};font-size:12px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:${brand.brass};">${esc(eyebrow)}</p>` : ''}<h1 class="h1" style="margin:0 0 20px;font-family:${font};font-size:26px;font-weight:700;line-height:1.25;letter-spacing:-.022em;color:${brand.ink};">${esc(heading)}</h1>${body}</td></tr>
${footnote ? `<tr><td class="px" style="padding:8px 32px 28px;"><p style="margin:0;font-family:${font};font-size:13px;line-height:1.6;color:${brand.muted};">${footnote}</p></td></tr>` : '<tr><td style="height:16px;line-height:16px;font-size:1px;">&nbsp;</td></tr>'}
<tr><td class="px" bgcolor="${brand.sand}" style="background:${brand.sand};border-top:1px solid ${brand.line};padding:22px 32px;font-family:${font};font-size:12px;line-height:1.7;color:${brand.muted};">
<strong style="color:${brand.ink};">${brand.name}</strong><br>${t.tagline}<br>
<span class="footer-links"><a href="${esc(siteUrl)}/book/" style="color:${brand.brass};text-decoration:none;">${t.estimate}</a> &middot; <a href="${esc(siteUrl)}/account/" style="color:${brand.brass};text-decoration:none;">${t.account}</a> &middot; <a href="${esc(siteUrl)}" style="color:${brand.brass};text-decoration:none;">${esc(host)}</a>${tel}</span>
</td></tr>
</table></td></tr></table></body></html>`;
}

function build(siteUrl, { subject, preheader, heading, htmlBody, text, footnote, eyebrow, lang, phone }) {
  return { subject, html: layout({ preheader, heading, body: htmlBody, siteUrl, footnote, eyebrow, lang, phone }), text: `${text}\n\n--\n${brand.name}\n${siteUrl}\n` };
}

module.exports = { esc, brand, font, paragraphs, button, details, linkify, rich, quote, layout, build };
