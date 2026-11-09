import * as THREE from 'three';
import { Rng } from './util.js';

// ORRERY dept: two canvas sheets, drawn once.
//   scale sheet (4 rows, repeats around the ring) : R = engraved line, G = gold inlay, B = soft recessed shade
//       row 0 degree scale with Roman numerals, row 1 medallions and lozenges, row 2 calendar script, row 3 meander
//   lace sheet : alpha = gold filigree, cut clean through the ring
// Everything is drawn with 'lighter' so each mask keeps its own channel.

const TAU = Math.PI * 2;
function cv(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d'); return [c, g]; }
const R = '#ff0000', Gd = '#00ff00', B = '#0000ff';
const NUM = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];
const MONTHS = ['IANVARIVS', 'FEBRVARIVS', 'MARTIVS', 'APRILIS', 'MAIVS', 'IVNIVS', 'QVINTILIS', 'SEXTILIS', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER'];

function line(g, x0, y0, x1, y1, w, col) { g.strokeStyle = col; g.lineWidth = w; g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke(); }

function rowDegrees(g, Wd, y, h) {
  const deg = Wd / 120;                               // one tile is 120 degrees
  line(g, 0, y + h * 0.12, Wd, y + h * 0.12, 3.2, R);
  line(g, 0, y + h * 0.17, Wd, y + h * 0.17, 1.4, R);
  line(g, 0, y + h * 0.86, Wd, y + h * 0.86, 3.2, R);
  for (let d = 0; d < 120 * 4; d++) {
    const x = (d / 4) * deg;
    const m = d % 4 === 0, five = d % 20 === 0, ten = d % 40 === 0;
    const top = y + h * 0.17, len = ten ? h * 0.42 : five ? h * 0.3 : m ? h * 0.2 : h * 0.1;
    line(g, x, top, x, top + len, ten ? 5 : five ? 3.6 : m ? 2.4 : 1.3, R);
  }
  g.textAlign = 'center'; g.textBaseline = 'middle';
  for (let d = 0; d < 120; d += 10) {
    const x = d * deg + deg * 5;
    g.font = `700 ${Math.round(h * 0.2)}px Georgia, 'Times New Roman', serif`;
    g.fillStyle = R; g.fillText(NUM[(d / 10) % 12 + 1] || 'X', x, y + h * 0.72);
    g.fillStyle = Gd;
    g.beginPath(); g.moveTo(x - deg * 5 - 12, y + h * 0.72); g.lineTo(x - deg * 5, y + h * 0.66); g.lineTo(x - deg * 5 + 12, y + h * 0.72); g.lineTo(x - deg * 5, y + h * 0.78); g.closePath(); g.fill();
  }
}

// an invented star-chart medallion: ring, pointer, a few linked dots. Never a letter from any real script.
function medallion(g, rng, cx, cy, r) {
  g.strokeStyle = Gd; g.lineWidth = 4.2; g.beginPath(); g.arc(cx, cy, r, 0, TAU); g.stroke();
  g.strokeStyle = R; g.lineWidth = 2.4; g.beginPath(); g.arc(cx, cy, r * 0.84, 0, TAU); g.stroke();
  g.lineWidth = 1.5;
  for (let i = 0; i < 24; i++) { const a = (i / 24) * TAU; line(g, cx + Math.cos(a) * r * 0.84, cy + Math.sin(a) * r * 0.84, cx + Math.cos(a) * r * 0.74, cy + Math.sin(a) * r * 0.74, 1.6, R); }
  const n = rng.int(4, 7), pts = [];
  for (let i = 0; i < n; i++) { const a = rng.range(0, TAU), q = rng.range(0.1, 0.6) * r; pts.push([cx + Math.cos(a) * q, cy + Math.sin(a) * q]); }
  g.strokeStyle = R; g.lineWidth = 2; g.beginPath();
  pts.forEach((p, i) => (i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1]))); g.stroke();
  g.fillStyle = Gd; for (const p of pts) { g.beginPath(); g.arc(p[0], p[1], rng.range(3, 6), 0, TAU); g.fill(); }
}

function lozengeChain(g, x0, x1, y, h) {
  const step = h * 1.1;
  for (let x = x0; x < x1; x += step) {
    g.strokeStyle = R; g.lineWidth = 2.2; g.beginPath(); g.moveTo(x, y); g.lineTo(x + step / 2, y - h / 2); g.lineTo(x + step, y); g.lineTo(x + step / 2, y + h / 2); g.closePath(); g.stroke();
    g.fillStyle = Gd; g.beginPath(); g.arc(x + step / 2, y, h * 0.12, 0, TAU); g.fill();
  }
}

function rowMedallions(g, Wd, y, h, rng) {
  line(g, 0, y + h * 0.08, Wd, y + h * 0.08, 3, R); line(g, 0, y + h * 0.92, Wd, y + h * 0.92, 3, R);
  const n = 16, cell = Wd / n;
  for (let i = 0; i < n; i++) {
    const cx = (i + 0.5) * cell;
    medallion(g, rng, cx, y + h * 0.5, h * 0.34);
    lozengeChain(g, cx + h * 0.42, cx + cell - h * 0.42, y + h * 0.5, h * 0.26);
    g.fillStyle = B; g.globalAlpha = 0.6; g.beginPath(); g.arc(cx, y + h * 0.5, h * 0.38, 0, TAU); g.fill(); g.globalAlpha = 1;
  }
}

function rowCalendar(g, Wd, y, h) {
  for (let k = 0; k < 2; k++) {
    const yy = y + h * (k ? 0.74 : 0.1), hh = h * 0.16;
    line(g, 0, yy, Wd, yy, 2.4, R); line(g, 0, yy + hh, Wd, yy + hh, 2.4, R);
    const n = k ? 365 : 240;
    for (let i = 0; i < n; i++) { const x = (i / n) * Wd; line(g, x, yy, x, yy + hh * (i % 5 === 0 ? 1 : 0.55), i % 5 === 0 ? 2.2 : 1.1, R); }
  }
  g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = `600 ${Math.round(h * 0.2)}px Georgia, 'Times New Roman', serif`;
  for (let i = 0; i < 4; i++) {
    const x = ((i + 0.5) / 4) * Wd;
    g.fillStyle = R; g.fillText(MONTHS[i * 3].split('').join(' '), x, y + h * 0.52);
    g.fillStyle = Gd; g.beginPath(); g.arc((i / 4) * Wd, y + h * 0.52, h * 0.09, 0, TAU); g.fill();
    line(g, (i / 4) * Wd, y + h * 0.1, (i / 4) * Wd, y + h * 0.9, 4, R);
  }
}

function rowMeander(g, Wd, y, h) {
  const u = h * 0.5, n = Math.round(Wd / (u * 1.55)), st = Wd / n;
  g.strokeStyle = Gd; g.lineWidth = 7; g.lineJoin = 'miter';
  for (let i = 0; i < n; i++) {
    const x = i * st, t = y + h * 0.22, b = y + h * 0.78;
    g.beginPath(); g.moveTo(x, b); g.lineTo(x, t); g.lineTo(x + st * 0.72, t); g.lineTo(x + st * 0.72, b - h * 0.16); g.lineTo(x + st * 0.26, b - h * 0.16); g.lineTo(x + st * 0.26, t + h * 0.18); g.lineTo(x + st * 0.48, t + h * 0.18); g.stroke();
    g.beginPath(); g.moveTo(x, b); g.lineTo(x + st, b); g.stroke();
  }
  line(g, 0, y + h * 0.1, Wd, y + h * 0.1, 3.4, R); line(g, 0, y + h * 0.9, Wd, y + h * 0.9, 3.4, R);
}

export function makeScaleSheet(renderer) {
  const Wd = 4096, Hd = 1024, row = Hd / 4;
  const [c, g] = cv(Wd, Hd);
  g.fillStyle = '#000'; g.fillRect(0, 0, Wd, Hd);
  g.globalCompositeOperation = 'lighter';
  g.lineCap = 'butt';
  const rng = new Rng(4411);
  rowDegrees(g, Wd, row * 0, row);
  rowMedallions(g, Wd, row * 1, row, rng);
  rowCalendar(g, Wd, row * 2, row);
  rowMeander(g, Wd, row * 3, row);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = THREE.RepeatWrapping; t.wrapT = THREE.ClampToEdgeWrapping;
  t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter;
  t.anisotropy = renderer.capabilities.getMaxAnisotropy();
  t.colorSpace = THREE.NoColorSpace;
  return t;
}

// Rinceau: a running vine with alternating spirals and leaves, as pierced gold. Wraps at the tile edge.
export function makeLaceSheet(renderer) {
  const Wd = 2048, Hd = 512;
  const [c, g] = cv(Wd, Hd);
  g.clearRect(0, 0, Wd, Hd);
  g.strokeStyle = '#fff'; g.fillStyle = '#fff'; g.lineCap = 'round'; g.lineJoin = 'round';
  const n = 8, cell = Wd / n;
  const mid = Hd / 2, A = Hd * 0.2;
  const vineY = (x) => mid + Math.sin((x / cell) * Math.PI) * A;
  const rng = new Rng(9021);
  const leaf = (x, y, a, L) => {
    const nx = Math.cos(a), ny = Math.sin(a), px = -ny, py = nx;
    g.beginPath(); g.moveTo(x, y);
    g.quadraticCurveTo(x + nx * L * 0.5 + px * L * 0.4, y + ny * L * 0.5 + py * L * 0.4, x + nx * L, y + ny * L);
    g.quadraticCurveTo(x + nx * L * 0.5 - px * L * 0.4, y + ny * L * 0.5 - py * L * 0.4, x, y); g.fill();
  };
  const scroll = (cx, cy, dir, r0, turns, a0) => {
    const N = 80, pts = [];
    for (let i = 0; i <= N; i++) {
      const u = i / N, a = a0 + dir * u * turns * TAU, r = r0 * (1 - u * 0.86);
      pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r, a]);
    }
    g.beginPath();
    pts.forEach((p, i) => (i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])));
    g.lineWidth = 15; g.stroke();
    const last = pts[N];
    g.beginPath(); g.arc(last[0], last[1], 17, 0, TAU); g.fill();
    pts.forEach((p, i) => { if (i % 14 === 7 && i < 70) leaf(p[0], p[1], p[2] + dir * 1.6, r0 * 0.3); });
  };
  const drawOnce = (ox) => {
    g.save(); g.translate(ox, 0);
    g.lineWidth = 22; g.beginPath();
    for (let x = 0; x <= Wd; x += 8) { const y = vineY(x); if (x) g.lineTo(x, y); else g.moveTo(x, y); }
    g.stroke();
    for (let i = 0; i < n; i++) {
      const x = (i + 0.5) * cell, up = i % 2 === 0, cy = up ? mid + A + Hd * 0.03 : mid - A - Hd * 0.03;
      const yv = vineY(x), dir = up ? 1 : -1;
      scroll(x + cell * 0.04, (yv + (up ? -Hd * 0.03 : Hd * 0.03)) + (up ? -Hd * 0.3 : Hd * 0.3) * 0.72, dir, Hd * 0.2, 1.35, up ? Math.PI * 0.5 : -Math.PI * 0.5);
      scroll(x + cell * 0.42, up ? Hd * 0.76 : Hd * 0.24, -dir, Hd * 0.1, 1.1, up ? -1.2 : 1.2);
      leaf(x - cell * 0.3, vineY(x - cell * 0.3), up ? -2.2 : 2.2, Hd * 0.2);
      leaf(x + cell * 0.32, vineY(x + cell * 0.32), up ? 1.1 : -1.1, Hd * 0.18);
      leaf(x + cell * 0.12, vineY(x + cell * 0.12), up ? 2.2 : -2.2, Hd * 0.14);
      leaf(x - cell * 0.1, vineY(x - cell * 0.1), up ? -1.1 : 1.1, Hd * 0.14);
      void cy;
    }
    g.restore();
  };
  drawOnce(-Wd); drawOnce(0); drawOnce(Wd);
  // framing rails, cross ties so the lace holds together, little beads
  g.fillRect(0, 0, Wd, Hd * 0.055); g.fillRect(0, Hd * 0.945, Wd, Hd * 0.055);
  for (let i = 0; i < n * 2; i++) { const x = (i / (n * 2)) * Wd; g.lineWidth = 11; g.beginPath(); g.moveTo(x, 0); g.lineTo(x + rng.range(-4, 4), Hd * 0.2); g.moveTo(x, Hd); g.lineTo(x + rng.range(-4, 4), Hd * 0.8); g.stroke(); }
  for (let i = 0; i < n * 8; i++) { const x = ((i + 0.5) / (n * 8)) * Wd; g.beginPath(); g.arc(x, Hd * 0.08, 5, 0, TAU); g.arc(x, Hd * 0.92, 5, 0, TAU); g.fill(); }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = THREE.RepeatWrapping; t.wrapT = THREE.ClampToEdgeWrapping;
  t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter;
  t.anisotropy = renderer.capabilities.getMaxAnisotropy();
  t.colorSpace = THREE.NoColorSpace;
  return t;
}
