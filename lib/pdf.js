// Minimal dependency-free PDF writer: text, tables, rules and page footers (Helvetica, US Letter).
const HELV = [278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556,
  1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556,
  333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584];
const WIN = { '\u2018': 0x91, '\u2019': 0x92, '\u201c': 0x93, '\u201d': 0x94, '\u2022': 0x95, '\u2013': 0x96, '\u2014': 0x97, '\u20ac': 0x80, '\u2026': 0x85, '\u2122': 0x99 };

const clean = s => String(s ?? '').replace(/\r/g, '').replace(/\t/g, '    ').replace(/[\u0000-\u0009\u000b-\u001f]/g, '');
const encode = s => Array.from(s, ch => { const c = ch.codePointAt(0); return WIN[ch] ? String.fromCharCode(WIN[ch]) : c >= 32 && c <= 126 || c >= 161 && c <= 255 ? ch : '?'; }).join('');
const esc = s => encode(s).replace(/[\\()]/g, m => `\\${m}`);
const charW = (ch, bold) => (HELV[ch.charCodeAt(0) - 32] ?? 556) * (bold ? 1.06 : 1);
const textW = (s, size, bold) => Array.from(encode(s)).reduce((a, ch) => a + charW(ch, bold), 0) * size / 1000;

function wrap(text, width, size, bold) {
  const out = [];
  for (const para of clean(text).split('\n')) {
    if (!para.trim()) { out.push(''); continue; }
    let line = '';
    for (const word of para.split(/(?<= )/)) {
      if (textW((line + word).trimEnd(), size, bold) <= width) { line += word; continue; }
      if (line) out.push(line.trimEnd());
      line = '';
      let rest = word;
      while (textW(rest.trimEnd(), size, bold) > width) { let n = rest.length; while (n > 1 && textW(rest.slice(0, n), size, bold) > width) n--; out.push(rest.slice(0, n)); rest = rest.slice(n); }
      line = rest;
    }
    out.push(line.trimEnd());
  }
  return out;
}

class Pdf {
  constructor({ title = 'Document', author = '', footer = '' } = {}) {
    this.W = 612; this.H = 792; this.M = 54;
    this.title = title; this.author = author; this.footer = footer;
    this.pages = []; this.newPage();
  }
  newPage() { this.ops = []; this.pages.push(this.ops); this.y = this.H - this.M; }
  get width() { return this.W - this.M * 2; }
  ensure(h) { if (this.y - h < this.M + 24) this.newPage(); }
  put(x, y, s, { size = 10, bold = false, italic = false, gray = 0 } = {}) {
    this.ops.push(`BT /${italic ? 'F3' : bold ? 'F2' : 'F1'} ${size} Tf ${gray} g ${x.toFixed(2)} ${y.toFixed(2)} Td (${esc(s)}) Tj ET`);
  }
  space(h = 8) { this.y -= h; return this; }
  rule(gray = 0.7) { this.ensure(6); this.ops.push(`${gray} G 0.6 w ${this.M} ${this.y - 2} m ${this.W - this.M} ${this.y - 2} l S`); this.y -= 8; return this; }
  text(s, { size = 10, bold = false, italic = false, gray = 0, indent = 0, align = 'left', gap = 2 } = {}) {
    const lead = size * 1.3;
    for (const line of wrap(s, this.width - indent, size, bold)) {
      this.ensure(lead); this.y -= lead;
      const w = textW(line, size, bold), x = align === 'right' ? this.W - this.M - w : align === 'center' ? this.M + (this.width - w) / 2 : this.M + indent;
      if (line) this.put(x, this.y, line, { size, bold, italic, gray });
    }
    this.y -= gap;
    return this;
  }
  heading(s, size = 14) { this.space(6); return this.text(s, { size, bold: true, gap: 4 }); }
  // rows: arrays of cells; widths are fractions of the page width; the last column is right-aligned when `numeric` is true.
  table(rows, { widths, bold = false, size = 10, numeric = true, gray = 0 } = {}) {
    const cols = rows[0].length, fr = widths || Array(cols).fill(1 / cols);
    for (const row of rows) {
      const cells = row.map((c, i) => wrap(c, this.width * fr[i] - 6, size, bold)), lines = Math.max(...cells.map(c => c.length)), lead = size * 1.3;
      this.ensure(lines * lead);
      for (let l = 0; l < lines; l++) {
        this.y -= lead;
        let x = this.M;
        cells.forEach((c, i) => {
          const s = c[l] || '', w = this.width * fr[i];
          if (s) this.put(numeric && i === cols - 1 && cols > 1 ? x + w - 6 - textW(s, size, bold) : x, this.y, s, { size, bold, gray });
          x += w;
        });
      }
      this.y -= 2;
    }
    return this;
  }
  box(title, lines) {
    this.space(6); this.rule(0.5);
    this.text(title, { size: 11, bold: true });
    for (const l of lines) this.text(l, { size: 9, gray: 0.2, gap: 1 });
    return this;
  }
  build() {
    const objs = [];
    const add = s => { objs.push(s); return objs.length; };
    add('<< /Type /Catalog /Pages 2 0 R >>');
    add('PLACEHOLDER');
    ['Helvetica', 'Helvetica-Bold', 'Helvetica-Oblique'].forEach(f => add(`<< /Type /Font /Subtype /Type1 /BaseFont /${f} /Encoding /WinAnsiEncoding >>`));
    const total = this.pages.length, kids = [];
    this.pages.forEach((ops, i) => {
      const foot = `${this.footer}${this.footer ? '   |   ' : ''}Page ${i + 1} of ${total}`;
      const body = [...ops, `BT /F1 8 Tf 0.45 g ${this.M} ${this.M - 6} Td (${esc(foot)}) Tj ET`].join('\n');
      const stream = add(`<< /Length ${body.length} >>\nstream\n${body}\nendstream`);
      kids.push(add(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${this.W} ${this.H}] /Resources << /Font << /F1 3 0 R /F2 4 0 R /F3 5 0 R >> >> /Contents ${stream} 0 R >>`));
    });
    objs[1] = `<< /Type /Pages /Kids [${kids.map(k => `${k} 0 R`).join(' ')}] /Count ${total} >>`;
    const stamp = `D:${new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14)}Z`;
    const info = add(`<< /Title (${esc(this.title)}) /Author (${esc(this.author)}) /Producer (Budget Bath Solutions) /CreationDate (${stamp}) >>`);
    let out = '%PDF-1.4\n'; const offsets = [];
    objs.forEach((o, i) => { offsets.push(out.length); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
    const xref = out.length;
    out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offsets.map(o => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size ${objs.length + 1} /Root 1 0 R /Info ${info} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
    return Buffer.from(out, 'latin1');
  }
}

module.exports = { Pdf };
