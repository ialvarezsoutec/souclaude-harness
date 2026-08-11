/**
 * Genera un SVG de 1920x1080 por lamina, listo para File > Import en Figma.
 *
 *   node docs/presentacion/build-svg.mjs            # tema claro  -> slides/
 *   node docs/presentacion/build-svg.mjs --dark     # tema oscuro -> slides-dark/
 *
 * Cada lamina entra a Figma como un Frame con capas nombradas. Sin dependencias.
 */

import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const DARK = process.argv.includes('--dark');
const OUT = join(HERE, DARK ? 'slides-dark' : 'slides');

const W = 1920;
const H = 1080;

/* ── tokens ─────────────────────────────────────────────────────────── */

const light = {
  surface: '#FFFFFF', surface2: '#F2F4F8', surface3: '#E7EAF0',
  ink: '#13171E', ink2: '#39424F', muted: '#5C6573',
  line: '#D2D7DF', line2: '#BBC3CE',
  accent: '#A8761C', accentWash: '#F3E8D2',
  ok: '#0F7A4A', okWash: '#E2F0E9',
  info: '#2F6BA8', infoWash: '#E3ECF7',
  hold: '#B23A26', holdWash: '#F7E4E0'
};

const dark = {
  surface: '#171B22', surface2: '#1E232C', surface3: '#262C36',
  ink: '#E2E6EC', ink2: '#B4BCC7', muted: '#8C95A2',
  line: '#2A303A', line2: '#3A424E',
  accent: '#D9A441', accentWash: '#2C2618',
  ok: '#3EA372', okWash: '#16281F',
  info: '#5A9AD6', infoWash: '#16222E',
  hold: '#DB6A50', holdWash: '#2C1B16'
};

const C = {
  ...(DARK ? dark : light),
  termBg: DARK ? '#0A0D12' : '#14181F',
  termLine: DARK ? '#232932' : '#2B323D',
  termInk: '#DCE2EA', termMuted: '#79838F',
  termAccent: '#D9A441', termOk: '#3EA372'
};

const F = {
  serif: 'Georgia, Constantia, Charter, serif',
  sans: 'Segoe UI, Helvetica Neue, Arial, sans-serif',
  mono: 'Roboto Mono, Cascadia Mono, Consolas, monospace'
};

/* ── geometria ──────────────────────────────────────────────────────── */

const GUT = 88;          // ancho del margen izquierdo
const PAD_X = 68;        // padding horizontal del panel
const PAD_T = 62;
const PAD_B = 52;
const X0 = GUT + PAD_X;
const CW = W - GUT - PAD_X * 2;

/* ── helpers ────────────────────────────────────────────────────────── */

const esc = (s) => String(s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// ancho medio por caracter, como fraccion del font-size
const RATIO = { serif: 0.505, sans: 0.515, mono: 0.601 };

const textWidth = (s, size, face) => s.length * size * RATIO[face];

function wrap(str, maxW, size, face) {
  const words = String(str).split(/\s+/).filter(Boolean);
  const lines = [];
  let cur = '';
  for (const w of words) {
    const probe = cur ? cur + ' ' + w : w;
    if (cur && textWidth(probe, size, face) > maxW) {
      lines.push(cur);
      cur = w;
    } else {
      cur = probe;
    }
  }
  if (cur) lines.push(cur);
  return lines.length ? lines : [''];
}

/**
 * Texto con marcado ligero:  *negrita*  y  `mono`.
 * Devuelve <tspan> encadenados dentro de un solo <text> por linea.
 */
function tokenize(str) {
  const out = [];
  const re = /(\*[^*]+\*|`[^`]+`)/g;
  let last = 0, m;
  while ((m = re.exec(str)) !== null) {
    if (m.index > last) out.push({ t: str.slice(last, m.index), k: 'n' });
    const body = m[0].slice(1, -1);
    out.push({ t: body, k: m[0][0] === '*' ? 'b' : 'c' });
    last = m.index + m[0].length;
  }
  if (last < str.length) out.push({ t: str.slice(last), k: 'n' });
  return out;
}

const plain = (str) => str.replace(/[*`]/g, '');

function richLine(x, y, str, { size, face, fill, weight = 400, anchor = 'start' }) {
  const parts = tokenize(str);
  const spans = parts.map((p) => {
    if (p.k === 'b') return `<tspan font-weight="650" fill="${C.ink}">${esc(p.t)}</tspan>`;
    if (p.k === 'c') return `<tspan font-family="${F.mono}" font-size="${(size * 0.9).toFixed(1)}" fill="${C.ink}">${esc(p.t)}</tspan>`;
    return `<tspan>${esc(p.t)}</tspan>`;
  }).join('');
  return `<text x="${x}" y="${y}" font-family="${F[face]}" font-size="${size}" font-weight="${weight}" fill="${fill}" text-anchor="${anchor}" xml:space="preserve">${spans}</text>`;
}

function para(x, y, w, str, { size, face = 'sans', fill = C.ink2, lh = 1.45, weight = 400 }) {
  const lines = wrap(plain(str), w, size, face);
  // re-inyecta el marcado linea por linea: se reparte por longitud acumulada
  const marked = remark(str, lines);
  const svg = marked.map((ln, i) =>
    richLine(x, y + size * 0.78 + i * size * lh, ln, { size, face, fill, weight })
  ).join('');
  return { svg, h: lines.length * size * lh };
}

/** Reparte el marcado original sobre las lineas ya cortadas en texto plano. */
function remark(src, plainLines) {
  const parts = tokenize(src);
  const out = [];
  let pi = 0, off = 0;
  for (const target of plainLines) {
    let need = target.length;
    let buf = '';
    while (need > 0 && pi < parts.length) {
      const avail = parts[pi].t.length - off;
      const take = Math.min(avail, need);
      const chunk = parts[pi].t.substr(off, take);
      buf += parts[pi].k === 'b' ? `*${chunk}*` : parts[pi].k === 'c' ? `\`${chunk}\`` : chunk;
      off += take;
      need -= take;
      if (off >= parts[pi].t.length) { pi++; off = 0; }
    }
    // consume el espacio que wrap() se comio entre lineas
    while (pi < parts.length && off < parts[pi].t.length && parts[pi].t[off] === ' ') off++;
    if (pi < parts.length && off >= parts[pi].t.length) { pi++; off = 0; }
    out.push(buf);
  }
  return out;
}

const rect = (x, y, w, h, o = {}) =>
  `<rect x="${x}" y="${y}" width="${Math.max(0, w)}" height="${Math.max(0, h)}"` +
  ` fill="${o.fill || 'none'}"` +
  (o.stroke ? ` stroke="${o.stroke}" stroke-width="${o.sw || 1}"` : '') +
  ` rx="${o.rx == null ? 2 : o.rx}"/>`;

const line = (x1, y1, x2, y2, stroke = C.line, sw = 1) =>
  `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${stroke}" stroke-width="${sw}"/>`;

const dot = (cx, cy, r, fill) => `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}"/>`;

const label = (x, y, str, { size = 13, face = 'mono', fill = C.muted, weight = 600, ls = 1.9, anchor = 'start', upper = true }) =>
  `<text x="${x}" y="${y}" font-family="${F[face]}" font-size="${size}" font-weight="${weight}"` +
  ` letter-spacing="${ls}" fill="${fill}" text-anchor="${anchor}">${esc(upper ? str.toUpperCase() : str)}</text>`;

const g = (id, body) => `<g id="${esc(id)}">${body}</g>`;

/* ── bloques ────────────────────────────────────────────────────────── */
/* Cada renderer: (x, y, w, block) -> { svg, h } */

const B = {};

B.lead = (x, y, w, b) => {
  const size = b.size || 21;
  return para(x, y, Math.min(w, 1180), b.text, { size, fill: C.ink2, lh: 1.5 });
};

B.note = (x, y, w, b) => {
  const size = b.size || 17;
  const inner = w - 34;
  const p = para(x + 22, y + 15, inner, b.text, { size, fill: C.ink2, lh: 1.45 });
  const h = p.h + 30;
  const accent = b.tone ? C[b.tone] : C.accent;
  const wash = b.tone ? C[b.tone + 'Wash'] : C.accentWash;
  return {
    svg: g('note', rect(x, y, w, h, { fill: wash }) + rect(x, y, 3, h, { fill: accent, rx: 0 }) + p.svg),
    h
  };
};

B.bullets = (x, y, w, b) => {
  const size = b.size || 18;
  let cy = y, out = '';
  for (const it of b.items) {
    const p = para(x + 20, cy, w - 20, it, { size, fill: C.ink2, lh: 1.42 });
    out += dot(x + 5, cy + size * 0.5, 3.5, C.accent) + p.svg;
    cy += p.h + 10;
  }
  return { svg: g('bullets', out), h: Math.max(0, cy - y - 10) };
};

B.steps = (x, y, w, b) => {
  const size = b.size || 19;
  let cy = y, out = '';
  b.items.forEach((it, i) => {
    const n = String(i + 1).padStart(2, '0');
    out += `<text x="${x}" y="${cy + size * 0.78}" font-family="${F.mono}" font-size="${size - 4}" font-weight="600" fill="${C.accent}">${n}</text>`;
    const p = para(x + 42, cy, w - 42, it, { size, fill: C.ink2, lh: 1.45 });
    out += p.svg;
    cy += p.h + 13;
  });
  return { svg: g('steps', out), h: Math.max(0, cy - y - 13) };
};

B.cards = (x, y, w, b) => {
  const n = b.items.length;
  const gap = b.gap == null ? 18 : b.gap;
  const cw = (w - gap * (n - 1)) / n;
  const size = b.size || 17;
  let maxH = 0;
  const bodies = b.items.map((it, i) => {
    const cx = x + i * (cw + gap);
    let cy = y + 24;
    let inner = '';
    if (it.tag) {
      inner += label(cx + 24, cy + 10, it.tag, { size: 12.5, fill: it.tone ? C[it.tone] : C.accent, ls: 1.6 });
      cy += 26;
    }
    if (it.h) {
      const hl = wrap(it.h, cw - 48, 21, 'sans');
      hl.forEach((ln, j) => {
        inner += `<text x="${cx + 24}" y="${cy + 16 + j * 27}" font-family="${F.sans}" font-size="21" font-weight="650" fill="${C.ink}">${esc(ln)}</text>`;
      });
      cy += hl.length * 27 + 6;
    }
    for (const pTxt of (it.p || [])) {
      const p = para(cx + 24, cy, cw - 48, pTxt, { size, fill: C.ink2, lh: 1.45 });
      inner += p.svg;
      cy += p.h + 12;
    }
    if (it.bullets) {
      const bl = B.bullets(cx + 24, cy, cw - 48, { items: it.bullets, size: size - 1 });
      inner += bl.svg;
      cy += bl.h + 12;
    }
    const hh = cy - y + 12;
    if (hh > maxH) maxH = hh;
    return { cx, cw, inner, tone: it.top };
  });
  const svg = bodies.map((bd) =>
    rect(bd.cx, y, bd.cw, maxH, { fill: C.surface2, stroke: C.line }) +
    (bd.tone ? rect(bd.cx, y, bd.cw, 3, { fill: C[bd.tone], rx: 0 }) : '') +
    bd.inner
  ).join('');
  return { svg: g('cards', svg), h: maxH };
};

B.table = (x, y, w, b) => {
  const size = b.size || 16.5;
  const cols = b.cols;
  const total = cols.reduce((a, c) => a + c.w, 0);
  const xs = [];
  let acc = 0;
  for (const c of cols) { xs.push(x + (acc / total) * w); acc += c.w; }
  const cwOf = (i) => (cols[i].w / total) * w - 22;

  let out = '';
  let cy = y;
  cols.forEach((c, i) => { out += label(xs[i], cy + 12, c.t, { size: 12, ls: 1.5 }); });
  cy += 24;
  out += line(x, cy, x + w, cy, C.line2);
  cy += 12;

  for (const row of b.rows) {
    let rowH = 0;
    const cells = row.map((cell, i) => {
      if (cell && cell.dot) {
        const t = `<text x="${xs[i] + 15}" y="${cy + 14}" font-family="${F.mono}" font-size="${size}" font-weight="600" fill="${C[cell.dot]}">${esc(cell.t)}</text>`;
        rowH = Math.max(rowH, 26);
        return dot(xs[i] + 5, cy + 8, 4.5, C[cell.dot]) + t;
      }
      const p = para(xs[i], cy, cwOf(i), String(cell == null ? '' : cell), { size, fill: C.ink2, lh: 1.36 });
      rowH = Math.max(rowH, p.h);
      return p.svg;
    }).join('');
    out += cells;
    cy += rowH + 13;
    out += line(x, cy - 6, x + w, cy - 6, C.line);
  }
  return { svg: g('table', out), h: cy - y - 6 };
};

B.term = (x, y, w, b) => {
  const size = b.size || 17;
  const lh = size * 1.62;
  const h = b.lines.length * lh + 40;
  let out = rect(x, y, w, h, { fill: C.termBg, stroke: C.termLine, rx: 3 });
  b.lines.forEach((ln, i) => {
    const yy = y + 20 + size * 0.8 + i * lh;
    const parts = Array.isArray(ln) ? ln : [[ln, 'ink']];
    let cx = x + 22;
    for (const [txt, kind] of parts) {
      const fill = kind === 'p' ? C.termAccent : kind === 'c' ? C.termMuted
        : kind === 'g' ? C.termOk : C.termInk;
      out += `<text x="${cx}" y="${yy}" font-family="${F.mono}" font-size="${size}" fill="${fill}" xml:space="preserve">${esc(txt)}</text>`;
      cx += textWidth(txt, size, 'mono');
    }
  });
  return { svg: g('terminal', out), h };
};

B.tree = (x, y, w, b) => {
  const size = b.size || 16;
  const lh = size * 1.62;
  let out = '';
  b.lines.forEach((ln, i) => {
    const yy = y + size * 0.8 + i * lh;
    const [code, note] = Array.isArray(ln) ? ln : [ln, ''];
    out += `<text x="${x}" y="${yy}" font-family="${F.mono}" font-size="${size}" font-weight="${/^\S/.test(code) ? 600 : 400}" fill="${C.ink}" xml:space="preserve">${esc(code)}</text>`;
    if (note) out += `<text x="${x + 300}" y="${yy}" font-family="${F.mono}" font-size="${size - 1}" fill="${C.muted}">${esc(note)}</text>`;
  });
  return { svg: g('tree', out), h: b.lines.length * lh };
};

B.chain = (x, y, w, b) => {
  const n = b.items.length;
  const arrow = 26;
  const cw = (w - arrow * (n - 1)) / n;
  const h = 92;
  let out = '';
  b.items.forEach((it, i) => {
    const cx = x + i * (cw + arrow);
    out += rect(cx, y, cw, h, { fill: C.surface2, stroke: C.line });
    out += rect(cx, y, cw, 2, { fill: C.accent, rx: 0 });
    out += label(cx + 16, y + 26, it.k, { size: 11.5, ls: 1.4 });
    const vs = wrap(it.v, cw - 32, 16, 'mono');
    vs.slice(0, 2).forEach((ln, j) => {
      out += `<text x="${cx + 16}" y="${y + 50 + j * 21}" font-family="${F.mono}" font-size="16" font-weight="600" fill="${C.ink}">${esc(ln)}</text>`;
    });
    if (i < n - 1) {
      out += `<text x="${cx + cw + arrow / 2}" y="${y + h / 2 + 8}" font-family="${F.sans}" font-size="22" fill="${C.accent}" text-anchor="middle">→</text>`;
    }
  });
  return { svg: g('chain', out), h };
};

B.flow = (x, y, w, b) => {
  const h = 46;
  const gap = 12;
  const sizes = b.items.map((it) => textWidth(it.t, 17, 'mono') + 34);
  const arrows = b.items.length - 1;
  const total = sizes.reduce((a, s) => a + s, 0) + arrows * (gap * 2 + 14);
  const scale = total > w ? w / total : 1;
  let cx = x;
  let out = '';
  b.items.forEach((it, i) => {
    const bw = sizes[i] * scale;
    const isGate = it.k === 'gate';
    out += rect(cx, y, bw, h, {
      fill: isGate ? C.holdWash : C.surface2,
      stroke: isGate ? C.hold : C.line2
    });
    out += `<text x="${cx + bw / 2}" y="${y + 29}" font-family="${F.mono}" font-size="${(17 * scale).toFixed(1)}" font-weight="${isGate ? 700 : 600}" fill="${isGate ? C.hold : C.ink}" text-anchor="middle">${esc(it.t)}</text>`;
    cx += bw;
    if (i < b.items.length - 1) {
      out += `<text x="${cx + (gap * 2 + 14) * scale / 2}" y="${y + 30}" font-family="${F.sans}" font-size="20" fill="${C.accent}" text-anchor="middle">→</text>`;
      cx += (gap * 2 + 14) * scale;
    }
  });
  return { svg: g('flow', out), h };
};

B.kanban = (x, y, w, b) => {
  const n = b.cols.length;
  const gap = 16;
  const cw = (w - gap * (n - 1)) / n;
  const h = b.h || 220;
  let out = '';
  b.cols.forEach((col, i) => {
    const cx = x + i * (cw + gap);
    out += rect(cx, y, cw, h, { fill: C.surface2, stroke: C.line });
    out += label(cx + 16, y + 28, col.t, { size: 12.5, ls: 1.5 });
    out += line(cx + 16, y + 40, cx + cw - 16, y + 40, C.line);
    let ty = y + 54;
    for (const t of col.tasks) {
      const tone = t.tone ? C[t.tone] : C.line2;
      const th = 62;
      out += rect(cx + 14, ty, cw - 28, th, {
        fill: t.tone === 'hold' ? C.holdWash : C.surface,
        stroke: C.line
      });
      out += rect(cx + 14, ty, 2.5, th, { fill: tone, rx: 0 });
      out += `<text x="${cx + 26}" y="${ty + 20}" font-family="${F.mono}" font-size="14.5" font-weight="600" fill="${t.done ? C.muted : C.ink}"${t.done ? ` text-decoration="line-through"` : ''}>${esc(t.id)}</text>`;
      out += `<text x="${cx + 26}" y="${ty + 38}" font-family="${F.sans}" font-size="14.5" fill="${C.ink2}">${esc(t.d)}</text>`;
      out += `<text x="${cx + 26}" y="${ty + 54}" font-family="${F.mono}" font-size="13" fill="${C.muted}">${esc(t.w)}</text>`;
      ty += th + 10;
    }
  });
  return { svg: g('kanban', out), h };
};

B.tiles = (x, y, w, b) => {
  const n = b.items.length;
  const gap = 16;
  const cw = (w - gap * (n - 1)) / n;
  const h = 128;
  let out = '';
  b.items.forEach((it, i) => {
    const cx = x + i * (cw + gap);
    out += rect(cx, y, cw, h, { fill: C.surface2, stroke: C.line });
    out += label(cx + 20, y + 30, it.k, { size: 12, ls: 1.5 });
    out += `<text x="${cx + 20}" y="${y + 84}" font-family="${F.serif}" font-size="46" fill="${C.ink}">${esc(it.n)}` +
      (it.u ? `<tspan font-family="${F.mono}" font-size="19" fill="${C.muted}">${esc(it.u)}</tspan>` : '') +
      `</text>`;
    out += `<text x="${cx + 20}" y="${y + 108}" font-family="${F.sans}" font-size="14" fill="${C.muted}">${esc(it.s)}</text>`;
  });
  return { svg: g('tiles', out), h };
};

B.bars = (x, y, w, b) => {
  const rowH = 30;
  const lbW = 92;
  const vlW = 74;
  const trW = w - lbW - vlW - 28;
  let out = '';
  b.items.forEach((it, i) => {
    const yy = y + i * rowH;
    out += `<text x="${x}" y="${yy + 18}" font-family="${F.mono}" font-size="15.5" fill="${C.ink2}">${esc(it.k)}</text>`;
    out += rect(x + lbW, yy + 5, trW, 16, { fill: C.surface3 });
    const fw = Math.max(3, trW * it.pct);
    out += `<path d="M${x + lbW} ${yy + 5} H${x + lbW + fw - 4} a4 4 0 0 1 4 4 v8 a4 4 0 0 1 -4 4 H${x + lbW} Z" fill="${C.info}"/>`;
    out += `<text x="${x + w}" y="${yy + 18}" font-family="${F.mono}" font-size="15.5" font-weight="600" fill="${C.ink}" text-anchor="end">${esc(it.v)}</text>`;
  });
  return { svg: g('bars', out), h: b.items.length * rowH };
};

B.kv = (x, y, w, b) => {
  const size = b.size || 16.5;
  const kW = b.kw || 168;
  let cy = y, out = '';
  for (const r of b.rows) {
    out += `<text x="${x}" y="${cy + size * 0.8}" font-family="${F.mono}" font-size="${size - 1}" font-weight="600" fill="${C.accent}">${esc(r.k)}</text>`;
    const p = para(x + kW, cy, w - kW, r.v, { size, fill: C.ink2, lh: 1.4 });
    out += p.svg;
    cy += Math.max(p.h, size * 1.4) + 14;
    out += line(x, cy - 8, x + w, cy - 8, C.line);
  }
  return { svg: g('kv', out), h: cy - y - 8 };
};

B.spacer = (x, y, w, b) => ({ svg: '', h: b.h || 16 });

B.row = (x, y, w, b) => {
  const gap = b.gap == null ? 30 : b.gap;
  const weights = b.widths || b.cols.map(() => 1);
  const sum = weights.reduce((a, v) => a + v, 0);
  const avail = w - gap * (b.cols.length - 1);
  let cx = x, maxH = 0, out = '';
  b.cols.forEach((blocks, i) => {
    const cwi = (weights[i] / sum) * avail;
    const r = stack(cx, y, cwi, blocks);
    out += r.svg;
    maxH = Math.max(maxH, r.h);
    cx += cwi + gap;
  });
  return { svg: out, h: maxH };
};

function stack(x, y, w, blocks) {
  let cy = y, out = '';
  for (const b of blocks) {
    const fn = B[b.type];
    if (!fn) throw new Error('bloque desconocido: ' + b.type);
    const r = fn(x, cy, w, b);
    out += r.svg;
    cy += r.h + (b.gap == null ? 22 : b.gap);
  }
  return { svg: out, h: Math.max(0, cy - y - 22) };
}

/* ── chasis de la lamina ────────────────────────────────────────────── */

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'];

function frame(slide, idx, total) {
  let out = rect(0, 0, W, H, { fill: C.surface, rx: 0 });

  if (slide.hero) {
    out += rect(0, 0, W, H, { fill: C.surface, rx: 0 });
    out += `<rect x="${W * 0.42}" y="0" width="${W * 0.58}" height="${H * 0.62}" fill="url(#wash)"/>`;
    return g('slide-' + String(idx + 1).padStart(2, '0'), out + heroBody(slide));
  }

  // margen izquierdo — el borde del instrumento
  out += rect(0, 0, GUT, H, { fill: C.surface2, rx: 0 });
  out += line(GUT, 0, GUT, H, C.line);
  out += `<text transform="translate(${GUT / 2 + 6} 92) rotate(90)" font-family="${F.mono}" font-size="13" font-weight="600" letter-spacing="2.2" fill="${C.accent}">${esc(slide.act.toUpperCase())}</text>`;
  out += line(GUT / 2, 300, GUT / 2, H - 130, C.line2);
  out += `<text transform="translate(${GUT / 2 + 5} ${H - 110}) rotate(90)" font-family="${F.mono}" font-size="12.5" fill="${C.muted}">${ROMAN[slide.actIdx]}</text>`;

  // encabezado
  out += label(X0, PAD_T + 14, slide.eyebrow, { size: 13, fill: C.accent, ls: 2.1 });
  out += `<text x="${W - PAD_X}" y="${PAD_T + 14}" font-family="${F.mono}" font-size="13" fill="${C.muted}" text-anchor="end">${String(idx + 1).padStart(2, '0')} / ${total}</text>`;
  out += line(X0, PAD_T + 36, W - PAD_X, PAD_T + 36, C.line);

  // titulo
  const tSize = 50;
  const tLines = wrap(slide.title, CW - 40, tSize, 'serif');
  let cy = PAD_T + 36 + 46;
  tLines.forEach((ln, i) => {
    out += `<text x="${X0}" y="${cy + i * (tSize * 1.08)}" font-family="${F.serif}" font-size="${tSize}" fill="${C.ink}">${esc(ln)}</text>`;
  });
  cy += (tLines.length - 1) * (tSize * 1.08) + 34;

  // pie
  let footH = 0;
  if (slide.foot) {
    const p = para(X0, 0, CW, slide.foot, { size: 16, fill: C.muted, lh: 1.45 });
    footH = p.h + 22;
  }

  // cuerpo
  out += stack(X0, cy, CW, slide.body).svg;

  if (slide.foot) {
    const fy = H - PAD_B - footH + 22;
    out += line(X0, fy - 16, W - PAD_X, fy - 16, C.line);
    out += para(X0, fy - 4, CW, slide.foot, { size: 16, fill: C.muted, lh: 1.45 }).svg;
  }

  return g('slide-' + String(idx + 1).padStart(2, '0'), out);
}

function heroBody(s) {
  const x = 150;
  let out = label(x, 250, s.eyebrow, { size: 15, fill: C.accent, ls: 2.4 });
  const tLines = wrap(s.title, 1200, 82, 'serif');
  tLines.forEach((ln, i) => {
    out += `<text x="${x}" y="${330 + i * 92}" font-family="${F.serif}" font-size="82" fill="${C.ink}">${esc(ln)}</text>`;
  });
  let cy = 330 + tLines.length * 92 - 30;
  out += rect(x, cy + 4, 112, 3, { fill: C.accent, rx: 0 });
  cy += 46;
  const p = para(x, cy, 1040, s.lead, { size: 25, fill: C.ink2, lh: 1.5 });
  out += p.svg;
  cy += p.h + 40;
  const t = B.term(x, cy, 880, { size: 21, lines: s.term });
  out += t.svg;
  cy += t.h + 42;
  out += `<text x="${x}" y="${cy}" font-family="${F.mono}" font-size="16" letter-spacing="0.9" fill="${C.muted}">${esc(s.meta)}</text>`;
  return out;
}

/* ── contenido ──────────────────────────────────────────────────────── */

const ACTS = ['Qué es', 'Proyecto nuevo', 'Proyecto existente', 'El hilo', 'Equipo', 'Monitor', 'Empezar'];

const slides = [
  {
    hero: true,
    act: ACTS[0], actIdx: 0,
    eyebrow: 'SOUTEC · Metodología CCEM',
    title: 'El harness, de punta a punta',
    lead: 'Cómo se instala en un proyecto nuevo, cómo se adopta en uno que ya lleva años, y cómo el tablero compartido y el monitor de tokens vuelven visible el trabajo de todo el equipo.',
    term: [
      [['# en cualquier repo, nuevo o legacy', 'c']],
      [['$ ', 'p'], ['npx github:ialvarezsoutec/souclaude-harness#v1', 'ink']]
    ],
    meta: 'souclaude-harness v2.3.0   ·   Node ≥ 22.4 + git   ·   sin registry, sin token'
  },

  {
    act: ACTS[0], actIdx: 0,
    eyebrow: 'Qué es',
    title: 'Tres capas que conviene no confundir',
    body: [
      {
        type: 'cards', items: [
          {
            tag: 'El método', h: 'CCEM',
            p: ['Los principios, el flujo Spec-Driven, el prompting anti-hack, la trazabilidad y los criterios para evaluar herramientas.',
              'Vive en `.claude/skills/` y `docs/constitution.md`']
          },
          {
            tag: 'Cómo se ejecuta', h: 'Orquestación multiagente',
            p: ['Un patrón *opt-in*: cuatro roles con herramientas acotadas que hacen cumplir CCEM. No corre en cada sesión — lo pides cuando lo quieres.',
              'Vive en `.claude/agents/` y `AGENTS.md`']
          },
          {
            tag: 'El vehículo', h: 'souclaude-harness',
            p: ['El CLI que emite y mantiene al día todo lo anterior en cualquier repo: uno vacío, uno legacy o uno con una versión vieja.',
              'Vive en `src/`, `templates/` y `bin/cli.mjs`']
          }
        ]
      }
    ],
    foot: 'Las skills son *project-local*: se commitean con el repo. Quien clona, las tiene — no hay instalación por persona ni por máquina.'
  },

  {
    act: ACTS[1], actIdx: 1,
    eyebrow: 'Proyecto nuevo',
    title: 'Un comando. Cuatro verbos.',
    body: [
      {
        type: 'row', widths: [1.05, 1], cols: [
          [
            {
              type: 'table',
              cols: [{ t: 'Comando', w: 26 }, { t: 'Qué hace', w: 74 }],
              rows: [
                [{ dot: 'ok', t: 'init' }, 'Instala. Sirve igual en un repo vacío y en uno con cinco años de código.'],
                [{ dot: 'info', t: 'upgrade' }, 'Actualiza a la última versión y aplica las migraciones.'],
                [{ dot: 'muted', t: 'status' }, 'Solo lectura. Salida 0 al día · 1 hay upgrade · 2 hay drift.'],
                [{ dot: 'hold', t: 'adopt' }, 'Para una estructura hecha a mano. *No toca ningún archivo*: solo escribe el lockfile.']
              ]
            },
            { type: 'note', text: 'Sin comando, *se autodetecta*: hay lockfile → `upgrade` · hay estructura previa → `adopt` · repo limpio → `init`.' }
          ],
          [
            {
              type: 'term', size: 16, lines: [
                [['# ver el plan sin escribir un solo byte', 'c']],
                [['$ ', 'p'], ['npx …souclaude-harness#v1 --dry-run', 'ink']],
                [['', 'ink']],
                [['create', 'g'], ['   CLAUDE.md', 'ink']],
                [['create', 'g'], ['   docs/constitution.md', 'ink']],
                [['create', 'g'], ['   .claude/skills/ccem-core/', 'ink']],
                [['noop', 'c'], ['     .gitignore (bloque ya presente)', 'c']],
                [['', 'ink']],
                [['→ 0 bytes escritos', 'c']]
              ]
            },
            {
              type: 'bullets', items: [
                '*--dry-run* imprime el plan y no escribe nada. El árbol queda byte-idéntico.',
                '*--yes* acepta los defaults; `--name --type --stack --lang` responden sin modo interactivo.'
              ]
            }
          ]
        ]
      }
    ]
  },

  {
    act: ACTS[1], actIdx: 1,
    eyebrow: 'Proyecto nuevo',
    title: 'Día 1, de cero a listo',
    body: [
      {
        type: 'row', widths: [1.1, 1], cols: [
          [{
            type: 'steps', items: [
              '*Ten git y Node ≥ 22.4.* Nada más: no hay registry, ni `.npmrc`, ni token.',
              '*Corre el instalador* en la raíz del repo, con `npx github:ialvarezsoutec/souclaude-harness#v1`',
              '*Responde las cuatro preguntas* — nombre, tipo, stack e idioma — o pásalas por flag y sáltate el modo interactivo.',
              '*Conecta el Vault* cuando lo pida: `--vault-path` si ya lo tienes clonado, `--no-vault` para omitirlo.',
              '*Abre el repo con Claude Code.* Lo primero que lee es `CLAUDE.md` y `docs/constitution.md`.',
              '*Completa P7 y P8* de la constitución: son los dos principios que cada proyecto define por su cuenta.'
            ]
          }],
          [
            {
              type: 'cards', items: [{
                tag: 'Lo que NO tienes que hacer',
                bullets: [
                  'Instalar skills a mano, una por una.',
                  'Copiar un `CLAUDE.md` de otro repo y editarlo.',
                  'Pedirle a cada persona que configure su máquina.',
                  'Sincronizar las reglas entre proyectos a mano.'
                ]
              }]
            },
            { type: 'note', text: '*El repo queda autosuficiente.* Quien lo clona recibe el método completo — mismas skills, misma constitución, mismas reglas de Git.' }
          ]
        ]
      }
    ]
  },

  {
    act: ACTS[1], actIdx: 1,
    eyebrow: 'Proyecto nuevo',
    title: 'Qué queda instalado',
    body: [
      {
        type: 'row', widths: [1, 1], cols: [
          [{
            type: 'tree', lines: [
              ['CLAUDE.md', 'contexto del proyecto, <200 líneas'],
              ['AGENTS.md', 'mapa del flujo multiagente'],
              ['notes.md', 'scratchpad persistente'],
              ['docs/', ''],
              ['  constitution.md', 'principios P1-P10'],
              ['  decisions/', 'ADRs + su template'],
              ['specs/', 'plantillas SDD: full y lite'],
              ['progress/', 'estado vivo del trabajo'],
              ['.claude/', ''],
              ['  settings.json', 'permisos + deny de secretos'],
              ['  harness.json', 'lockfile: versión + hash'],
              ['  vault.local.json', 'ruta local del Vault'],
              ['  skills/', 'ccem-* · soutec-github · comandos'],
              ['  agents/', 'orchestrator · spec-author'],
              ['', 'implementer · reviewer'],
              ['.github/', 'plantilla de PR + CODEOWNERS'],
              ['.gitignore', 'solo un bloque delimitado']
            ]
          }],
          [
            { type: 'lead', size: 19, text: 'Cada archivo tiene una *política* que decide qué pasa cuando llega una versión nueva del harness.' },
            {
              type: 'kv', rows: [
                { k: 'user-owned', v: 'Se siembra una vez. Si lo editas, no se pisa nunca. `CLAUDE.md` `constitution.md` `notes.md`' },
                { k: 'managed', v: 'El harness es dueño y el upgrade lo mantiene fresco. `skills/` `agents/` `AGENTS.md`' },
                { k: 'merge-json', v: 'Solo agrega claves que faltan. Jamás pisa un valor tuyo. `.claude/settings.json`' },
                { k: 'append-block', v: 'Solo gestiona un bloque delimitado. Tus líneas quedan intactas. `.gitignore`' }
              ]
            }
          ]
        ]
      }
    ]
  },

  {
    act: ACTS[2], actIdx: 2,
    eyebrow: 'Proyecto existente',
    title: 'El mismo comando, tres puntos de partida',
    body: [
      {
        type: 'cards', items: [
          {
            tag: 'init', tone: 'ok', top: 'ok', h: 'Repo legacy, sin harness',
            p: ['Cinco años de código y ninguna carpeta `.claude/`. El instalador *solo agrega la superficie de Claude*: no toca tu código, tus tests ni tu build.',
              'Nada de lo tuyo entra en el plan.']
          },
          {
            tag: 'adopt', tone: 'hold', top: 'hold', h: 'Estructura hecha a mano',
            p: ['Ya tienes un `CLAUDE.md` y skills propias que armaste tú. *No se escribe ni un archivo*: solo se anota en el lockfile que lo que hay ya cuenta como harness.',
              'Desde ahí, los upgrades funcionan normal.']
          },
          {
            tag: 'upgrade', tone: 'info', top: 'info', h: 'Harness de una versión vieja',
            p: ['Trae skills nuevas, reglas nuevas y corre las *migraciones*, que transforman lo viejo antes de comparar — así un fix antiguo aparece como un update normal.',
              'Se invoca con `/harness-upgrade`.']
          }
        ]
      },
      { type: 'note', text: 'Los tres son *el mismo code path*. No hay tres flujos con tres conjuntos de bugs: hay una sola tabla de veredictos, y es la de la próxima lámina.' }
    ]
  },

  {
    act: ACTS[2], actIdx: 2,
    eyebrow: 'Proyecto existente · la garantía',
    title: 'Un archivo tuyo nunca se sobrescribe en silencio',
    body: [
      { type: 'lead', size: 19, text: 'El motor cruza tres cosas para cada archivo: qué hay *en disco*, qué dice el *lockfile* que había, y qué querría *emitir el harness hoy*.' },
      {
        type: 'table', size: 16,
        cols: [
          { t: 'En disco', w: 19 }, { t: 'En el lockfile', w: 16 }, { t: '¿Cambió el template?', w: 15 },
          { t: 'Veredicto', w: 16 }, { t: 'Qué pasa', w: 34 }
        ],
        rows: [
          ['no está', 'no está', '—', { dot: 'ok', t: 'create' }, 'Se crea.'],
          ['*está*', 'no está', '—', { dot: 'hold', t: 'foreign' }, '*Nunca se pisa* → queda `.new` al lado.'],
          ['está, intacto', 'está', 'no', { dot: 'muted', t: 'noop' }, 'Nada.'],
          ['está, intacto', 'está', 'sí', { dot: 'info', t: 'update' }, 'Se actualiza. No pierdes nada: no lo habías tocado.'],
          ['está, *editado por ti*', 'está', 'no', { dot: 'muted', t: 'local-edit' }, 'Se respeta. No se toca.'],
          ['está, *editado por ti*', 'está', 'sí', { dot: 'hold', t: 'conflict' }, '*Nunca se pisa* → queda `.new` al lado.'],
          ['lo escribimos, lo borraste', 'está', '—', { dot: 'ok', t: 'restore' }, 'Se reescribe.'],
          ['está', 'ya no en el manifest', '—', { dot: 'hold', t: 'obsolete' }, 'Solo con `--prune` y doble confirmación.']
        ]
      }
    ],
    foot: 'Salvaguardas: backup de todo lo sobrescrito en `.claude/backup-<ts>/` · `--prune` exige tipear BORRAR · `--force` exige tipear FORCE. La herramienta obedece la misma constitución que instala.'
  },

  {
    act: ACTS[2], actIdx: 2,
    eyebrow: 'Proyecto existente · mantenerlo al día',
    title: 'Qué haces cuando aparece un .new',
    body: [
      {
        type: 'row', widths: [1, 1], cols: [
          [
            {
              type: 'term', size: 16, lines: [
                [['# 1 · ¿estoy al día?', 'c']],
                [['$ ', 'p'], ['npx …#v1 status', 'ink']],
                [['→ salida 1: hay una versión nueva', 'c']],
                [['', 'ink']],
                [['# 2 · ¿qué cambiaría?', 'c']],
                [['$ ', 'p'], ['npx …#v1 upgrade --dry-run', 'ink']],
                [['', 'ink']],
                [['# 3 · aplicarlo', 'c']],
                [['$ ', 'p'], ['npx …#v1 upgrade', 'ink']],
                [['update', 'g'], ['    .claude/skills/ccem-sdd/', 'ink']],
                [['conflict', 'c'], ['  CLAUDE.md → CLAUDE.md.new', 'c']]
              ]
            },
            { type: 'note', text: 'Desde Claude Code es un solo comando: `/harness-upgrade`. Corre `status`, luego el `--dry-run`, *espera tu OK* y recién ahí aplica.' }
          ],
          [
            {
              type: 'cards', items: [{
                tag: 'El archivo .new', h: 'La propuesta queda al lado. Tú decides.',
                p: ['Cuando tu archivo difiere del que el harness querría emitir, no hay pisada y no hay merge automático: aparece `<archivo>.new` junto al tuyo y el original queda intacto.',
                  'Lo comparas con `git diff --no-index CLAUDE.md CLAUDE.md.new`, te llevas lo que sirve y borras el `.new`.',
                  'Es una *sugerencia*, no una migración pendiente.']
              }]
            }
          ]
        ]
      }
    ],
    foot: 'Los dos invariantes que sostienen esto en los tests: *idempotencia* — correr `init` dos veces no cambia nada la segunda — y *pureza de --dry-run* — el árbol queda byte-idéntico.'
  },

  {
    act: ACTS[3], actIdx: 3,
    eyebrow: 'El día a día',
    title: 'El ID del hito es el hilo',
    body: [
      { type: 'lead', size: 19, text: 'La roca nace en la reunión trimestral y se descompone en hitos. *El hito emite el ID*, y ese ID reaparece idéntico en cada eslabón hasta el release.' },
      {
        type: 'chain', items: [
          { k: 'Roca · trimestre', v: 'Q3Y26-REA' },
          { k: 'Hito', v: 'REA-H3' },
          { k: 'Carpeta de spec', v: 'specs/REA-H3-captura-lead/' },
          { k: 'Rama', v: 'feature/REA-H3-captura-lead' },
          { k: 'Tasks', v: 'REA-H3-T001…' },
          { k: 'PR · release', v: 'squash & merge' }
        ]
      },
      {
        type: 'cards', items: [
          {
            tag: 'Por qué importa',
            p: ['`grep -r REA-H3 specs/` y `git log --grep=REA-H3` devuelven *lo mismo*. Cualquiera puede reconstruir por qué existe una línea de código sin preguntarle a nadie.',
              'Un hito puede producir varios specs: mismo ID, distinto slug. Cada carpeta es una rama y un PR.']
          },
          {
            tag: 'La regla dura', tone: 'hold', top: 'hold', h: 'Si no tienes el ID, pregunta. No lo inventes.',
            p: ['Sin ID no hay rama — *los hotfixes incluidos*. La urgencia cambia la prioridad, nunca el procedimiento. Si una rama o un release no tiene ID, la cadena está rota y se repara antes de seguir.']
          }
        ]
      }
    ]
  },

  {
    act: ACTS[3], actIdx: 3,
    eyebrow: 'El día a día',
    title: 'Tres frenos humanos antes de escribir código',
    body: [
      {
        type: 'flow', items: [
          { t: 'spec.md' }, { t: '⏸ HUMANO', k: 'gate' }, { t: 'plan.md' }, { t: '⏸ HUMANO', k: 'gate' },
          { t: 'tasks.md' }, { t: '⏸ HUMANO', k: 'gate' }, { t: 'implement' }, { t: 'review' }, { t: 'PR' }
        ]
      },
      { type: 'lead', size: 19, text: 'Hasta que los tres estén aprobados, la rama *solo admite commits `docs:`*. Durante implement el review es incremental, task por task — nunca en batch al final.' },
      {
        type: 'row', widths: [1, 1], cols: [
          [{
            type: 'table', size: 16,
            cols: [{ t: 'Agente', w: 26 }, { t: 'Rol', w: 58 }, { t: '¿Código?', w: 16 }],
            rows: [
              ['`orchestrator`', 'Descompone, coordina y hace respetar los checkpoints.', { dot: 'hold', t: 'no' }],
              ['`spec-author`', 'Redacta spec, plan y tasks — una fase por invocación.', { dot: 'hold', t: 'no' }],
              ['`implementer`', 'Implementa task por task, cada cambio con su test.', { dot: 'ok', t: 'sí' }],
              ['`reviewer`', 'Aprueba o rechaza. Sin herramientas de escritura: dictamina.', { dot: 'hold', t: 'no' }]
            ]
          }],
          [
            { type: 'note', text: '*La separación es el punto.* Quien especifica no implementa, y quien implementa *no se aprueba a sí mismo*. Un `reviewer` sin permiso de escritura no es una recomendación: es enforcement.' },
            {
              type: 'cards', items: [{
                tag: 'Cuándo NO montar todo esto',
                p: ['Bug fix puntual, ajuste cosmético, spike, script one-off, hotfix o typo: *se hace directo*. Ceremonia que no sirve viola P9 — Simplicity First.',
                  'Para un cambio mediano existe la versión comprimida: `/spec-new <ID> <slug> --lite`. Mismos checkpoints, menos ceremonia.']
              }]
            }
          ]
        ]
      }
    ]
  },

  {
    act: ACTS[4], actIdx: 4,
    eyebrow: 'Trabajo en equipo',
    title: 'Dos repos con reglas opuestas, a propósito',
    body: [
      {
        type: 'cards', items: [
          {
            tag: 'Repo del proyecto', tone: 'info', top: 'info', h: 'Todo cambio se revisa',
            bullets: [
              'Código, tests, specs y progreso.',
              'Siempre *rama + Pull Request*. Nunca directo a `main`.',
              'El coordinador hace el squash & merge.'
            ],
            p: ['*Por qué:* lo que entra al código pasa por revisión, sin excepciones y sin atajos por urgencia.']
          },
          {
            tag: 'El Vault', top: 'accent', h: 'El tablero refleja el ahora',
            bullets: [
              'Kanban, espejos de specs y progreso, rocas, evidencia.',
              '*Push directo a `main`*, sin PR.',
              'Repo aparte, para no ensuciar el del proyecto.'
            ],
            p: ['*Por qué:* si el tablero esperara a un merge, mostraría el pasado. Tiene que mostrar el ahora.']
          }
        ]
      },
      {
        type: 'row', widths: [1, 1, 1], gap: 20, cols: [
          [{ type: 'note', tone: 'info', text: 'Nunca se cruzan: código, diffs y tests *jamás* van al Vault.' }],
          [{ type: 'note', text: 'La ruta local vive en `.claude/vault.local.json`, que escribe el instalador.' }],
          [{ type: 'note', tone: 'hold', text: 'Si el Vault no está configurado, el espejo *se omite sin fallar*. El trabajo local nunca se bloquea.' }]
        ]
      }
    ]
  },

  {
    act: ACTS[4], actIdx: 4,
    eyebrow: 'Trabajo en equipo · el tablero',
    title: 'Nadie pisa el trabajo de nadie',
    body: [
      {
        type: 'kanban', h: 200, cols: [
          {
            t: 'Backlog', tasks: [
              { id: 'REA-H3-T004', d: 'validar formulario', w: '@pendiente' },
              { id: 'REA-H3-T005', d: 'reintento de envío', w: '@pendiente' }
            ]
          },
          { t: 'En curso', tasks: [{ id: 'REA-H3-T003', d: 'capturar lead al cierre', w: '@sofia', tone: 'hold' }] },
          { t: 'En review', tasks: [{ id: 'REA-H3-T002', d: 'persistencia del ticket', w: '@nacho', tone: 'accent' }] },
          { t: 'Hecho', tasks: [{ id: 'REA-H3-T001', d: 'esqueleto del dominio', w: '@nacho', tone: 'ok', done: true }] }
        ]
      },
      {
        type: 'row', widths: [1.05, 1], cols: [
          [
            { type: 'lead', size: 18, text: '*La tarjeta se mueve al empezar*, no al terminar. Por eso el tablero sirve como señal en vivo y no como reporte tardío.' },
            {
              type: 'table', size: 16,
              cols: [{ t: 'Quién', w: 28 }, { t: 'Mueve la tarjeta', w: 72 }],
              rows: [
                ['`spec-author`', 'La crea en *Backlog* al emitir `tasks.md`.'],
                ['`implementer`', 'A *En curso* al tomarla; a *En review* al cerrarla.'],
                ['`reviewer`', 'A *Hecho* con `APPROVED`, o de vuelta a *En curso*.']
              ]
            }
          ],
          [
            {
              type: 'term', size: 15.5, lines: [
                [['# obligatorio antes de tomar un task', 'c']],
                [['$ ', 'p'], ['git -C "<vault>" pull --rebase', 'ink']],
                [['# y lee Project-REA/kanban.md', 'c']]
              ]
            },
            {
              type: 'cards', items: [{
                tag: 'El anti-solapamiento', tone: 'hold', top: 'hold',
                p: ['Si la tarjeta ya está en *En curso* con otro dueño, la está trabajando otra persona u otra máquina: *paras y preguntas*. No la tomas, no la mueves y no saltas a otra por tu cuenta.',
                  'Una tarjeta = una línea, así que dos personas nunca se contradicen al hacer merge: se conservan ambas.']
              }]
            }
          ]
        ]
      }
    ]
  },

  {
    act: ACTS[5], actIdx: 5,
    eyebrow: 'Monitor de tokens',
    title: 'Cada lanzamiento elige su modelo, y queda anotado',
    body: [
      {
        type: 'cards', items: [
          {
            tag: 'Paso 1 · clasificar',
            p: ['La tarea se cuenta contra un checklist de señales, no por intuición.',
              '*mecánica* 0 señales · *estándar* 1-2 blandas · *compleja* ≥3 blandas o ≥1 dura']
          },
          {
            tag: 'Paso 2 · rutear',
            p: ['La matriz *agente × clase* decide modelo y esfuerzo.',
              'Cambiar la política es editar un solo archivo: la skill `ccem-model-router`.']
          },
          {
            tag: 'Paso 3 · registrar',
            p: ['Una línea JSONL por lanzamiento en `progress/model-router.jsonl`.',
              '*Un hito sin líneas es una violación visible del protocolo.*']
          }
        ]
      },
      {
        type: 'row', widths: [1.15, 1], cols: [
          [
            {
              type: 'table', size: 16,
              cols: [{ t: 'Agente', w: 28 }, { t: 'mecánica', w: 20 }, { t: 'estándar', w: 20 }, { t: 'compleja', w: 32 }],
              rows: [
                ['`spec-author`', 'Ejecución', 'Ejecución', '*Decisiones*'],
                ['`implementer`', 'Volumen', 'Ejecución', 'Ejecución + Advisor'],
                ['`reviewer`', 'Ejecución', 'Ejecución', 'Ejecución']
              ]
            },
            { type: 'lead', size: 16, text: 'El `implementer` complejo no sube de tier: consulta puntualmente al modelo de Decisiones (~400-700 tokens) en vez de correr el task entero en el modelo caro.' }
          ],
          [{
            type: 'term', size: 15, lines: [
              [['// una línea por lanzamiento', 'c']],
              [['{"hito": ', 'ink'], ['"REA-H3"', 'g'], [',', 'ink']],
              [[' "task": ', 'ink'], ['"REA-H3-T003"', 'g'], [',', 'ink']],
              [[' "agente": ', 'ink'], ['"implementer"', 'g'], [',', 'ink']],
              [[' "clase": ', 'ink'], ['"estandar"', 'g'], [',', 'ink']],
              [[' "senales": [', 'ink'], ['"mas_de_3_archivos"', 'g'], ['],', 'ink']],
              [[' "resultado": ', 'ink'], ['"approved"', 'g'], [',', 'ink']],
              [[' "rework": ', 'ink'], ['0', 'p'], [',', 'ink']],
              [[' "tokens_in": ', 'ink'], ['42150', 'p'], [',', 'ink']],
              [[' "tokens_out": ', 'ink'], ['8300', 'p'], [',', 'ink']],
              [[' "costo_usd": ', 'ink'], ['0.94', 'p'], [',', 'ink']],
              [[' "medicion": ', 'ink'], ['"estimado"', 'g'], ['}', 'ink']]
            ]
          }]
        ]
      }
    ]
  },

  {
    act: ACTS[5], actIdx: 5,
    eyebrow: 'Monitor de tokens · qué te dice',
    title: 'El equipo ve dónde se va el esfuerzo',
    body: [
      {
        type: 'tiles', items: [
          { k: 'Lanzamientos', n: '48', s: 'en el trimestre' },
          { k: 'Escaladas', n: '6,2', u: '%', s: 'umbral de revisión: 10 %' },
          { k: 'Rework', n: '7', s: 'devoluciones del reviewer' },
          { k: 'Medido', n: '34', u: '%', s: 'el resto es estimación' }
        ]
      },
      {
        type: 'row', widths: [1, 1.05], cols: [
          [
            { type: 'lead', size: 16, text: 'COSTO POR HITO · USD' },
            {
              type: 'bars', items: [
                { k: 'REA-H1', pct: 0.46, v: '4,10' },
                { k: 'REA-H2', pct: 0.71, v: '6,35' },
                { k: 'REA-H3', pct: 1.00, v: '8,90' },
                { k: 'REA-H4', pct: 0.29, v: '2,58' },
                { k: 'REA-H5', pct: 0.38, v: '3,40' }
              ]
            },
            { type: 'lead', size: 15, text: 'Cifras de ejemplo para mostrar la forma del informe — no son telemetría real de ningún proyecto.' }
          ],
          [
            {
              type: 'cards', items: [{
                tag: 'La regla de honestidad', tone: 'hold', top: 'hold',
                p: ['Si la herramienta no reporta el uso real de tokens, el orchestrator *estima* por tamaño de artefactos y lo marca como tal. Un `estimado` sirve para *comparar* celdas de la matriz e hitos entre sí — *jamás* se presenta como cifra contable ni de facturación.']
              }]
            },
            {
              type: 'cards', items: [{
                tag: 'El ritual · /rock-close',
                p: ['Al cerrar el trimestre se resume el JSONL y se ajusta la matriz si:'],
                bullets: [
                  'las escaladas superan el *10 %* de los lanzamientos,',
                  'una celda *concentra el rework* — su tier quedó corto,',
                  'una celda *nunca falla* — puede bajar un tier.'
                ]
              }]
            }
          ]
        ]
      }
    ]
  },

  {
    act: ACTS[6], actIdx: 6,
    eyebrow: 'Cómo empezar hoy',
    title: 'Dos caminos, el mismo comando',
    body: [
      {
        type: 'row', widths: [1, 1], cols: [
          [{
            type: 'cards', items: [{
              tag: 'Proyecto nuevo', tone: 'ok', top: 'ok',
              p: ['`npx github:ialvarezsoutec/souclaude-harness#v1`'],
              bullets: [
                'Responde nombre, tipo, stack e idioma.',
                'Conecta el Vault y completa P7 y P8.',
                'Abre el repo con Claude Code y arranca.'
              ]
            }]
          }],
          [{
            type: 'cards', items: [{
              tag: 'Proyecto existente', tone: 'info', top: 'info',
              p: ['`npx …#v1 status` y después `npx …#v1 upgrade --dry-run`'],
              bullets: [
                'Lee el plan antes de aplicar nada.',
                'Revisa cada `.new` con `git diff --no-index`.',
                'Desde Claude Code: `/harness-upgrade`.'
              ]
            }]
          }]
        ]
      },
      {
        type: 'cards', items: [
          {
            tag: 'Antes de cada task',
            p: ['`git -C "<vault>" pull --rebase`, lee el kanban y mueve tu tarjeta *al empezar*. Si ya la tiene otra persona, para y pregunta.']
          },
          {
            tag: 'Antes de cada PR',
            p: ['`/constitution-check` audita tu diff contra P1-P10 y te marca las violaciones con archivo y línea. Completa la plantilla de PR de verdad.']
          },
          {
            tag: 'Cuando dudes',
            p: ['Las fuentes de verdad son `docs/constitution.md`, `AGENTS.md` y `progress/README.md`. Si algo es ambiguo: *para y pregunta*.']
          }
        ]
      }
    ],
    foot: 'P9 — Simplicity First y P10 — Surgical Changes aplican siempre, en todo proyecto. Todo lo demás es andamiaje para que esas dos se cumplan solas.'
  }
];

/* ── salida ─────────────────────────────────────────────────────────── */

const slugs = [
  'portada', 'tres-capas', 'un-comando', 'dia-1', 'que-instala',
  'tres-puntos-partida', 'tabla-veredictos', 'archivo-new', 'el-hilo',
  'checkpoints-agentes', 'dos-repos', 'kanban-vivo', 'monitor-como-decide',
  'monitor-que-dice', 'empezar-hoy'
];

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

slides.forEach((s, i) => {
  const defs = `<defs><radialGradient id="wash" cx="70%" cy="12%" r="80%">` +
    `<stop offset="0%" stop-color="${C.accentWash}" stop-opacity="1"/>` +
    `<stop offset="100%" stop-color="${C.accentWash}" stop-opacity="0"/>` +
    `</radialGradient></defs>`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">` +
    defs + frame(s, i, slides.length) + `</svg>\n`;
  const name = `${String(i + 1).padStart(2, '0')}-${slugs[i]}.svg`;
  writeFileSync(join(OUT, name), svg, 'utf8');
  console.log('  ' + name);
});

console.log(`\n${slides.length} laminas en ${OUT}`);
console.log('Figma: File > Import > selecciona los .svg (cada uno entra como Frame 1920x1080).');
