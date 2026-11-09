import * as THREE from 'three';
import { Rng } from './util.js';

// ORRERY dept: sweep geometry for the five rings. A ring lies in its local XY plane, axis +Z.
// Attributes: position, normal, uv = (arc metres, section metres), aInfo = (part, v across band 0..1, scale row or -1, seam distance m),
// aRho = radial position across the whole ring 0 (inner edge) .. 1 (outer edge).
// Parts: 0 porcelain, 1 gold, 2 dark groove, 3 crimson enamel, 4 pierced gold lace, 5 broken biscuit (fracture face).

export const P = { PORC: 0, GOLD: 1, DARK: 2, ENAMEL: 3, LACE: 4, BROKEN: 5 };

export class Buf {
  constructor() { this.p = []; this.n = []; this.uv = []; this.info = []; this.rho = []; this.idx = []; this.count = 0; }
  v(x, y, z, nx, ny, nz, u, s, part, vv, row, seam, rho) {
    this.p.push(x, y, z); this.n.push(nx, ny, nz); this.uv.push(u, s); this.info.push(part, vv, row, seam); this.rho.push(rho);
    return this.count++;
  }
  tri(a, b, c) { this.idx.push(a, b, c); }
  quad(a, b, c, d) { this.idx.push(a, b, c, a, c, d); }
  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('aInfo', new THREE.Float32BufferAttribute(this.info, 4));
    g.setAttribute('aRho', new THREE.Float32BufferAttribute(this.rho, 1));
    g.setIndex(this.idx);
    return g;
  }
}

// ---------------------------------------------------------------- cross sections
// bands run across the top face from the inner edge to the outer edge
export function section(W, T, bands, { innerPart = P.GOLD, outerStrap = true, maxSeg = 1.6 } = {}) {
  const h0 = T / 2, top = [];
  const sum = bands.reduce((a, b) => a + b.w, 0), k = W / sum;
  let x = -W / 2;
  const add = (a, b, part, row = -1, v0 = 0, v1 = 0) => top.push({ a, b, part, row, v0, v1 });
  for (const b of bands) {
    const w = b.w * k;
    if (b.t === 'rail') {
      const e = b.e ?? Math.min(1.25, w * 0.3);
      add([x, h0], [x + 0.2 * w, h0 + e], b.p ?? P.GOLD);
      add([x + 0.2 * w, h0 + e], [x + 0.8 * w, h0 + e], b.p ?? P.GOLD, -2, 0, 1);
      add([x + 0.8 * w, h0 + e], [x + w, h0], b.p ?? P.GOLD);
    } else if (b.t === 'flat') {
      add([x, h0], [x + w, h0], b.p ?? P.PORC, b.r ?? -1, 0, 1);
    } else if (b.t === 'groove') {
      const g = b.g ?? 0.7;
      add([x, h0], [x + 0.08 * w, h0 - g], P.DARK);
      add([x + 0.08 * w, h0 - g], [x + 0.92 * w, h0 - g], P.DARK);
      add([x + 0.92 * w, h0 - g], [x + w, h0], P.DARK);
    } else if (b.t === 'bead') {
      const e = w * 0.46, N = 5;
      for (let i = 0; i < N; i++) {
        const a0 = Math.PI * (i / N), a1 = Math.PI * ((i + 1) / N);
        add([x + (0.5 - 0.5 * Math.cos(a0)) * w, h0 + Math.sin(a0) * e], [x + (0.5 - 0.5 * Math.cos(a1)) * w, h0 + Math.sin(a1) * e], b.p ?? P.GOLD);
      }
    }
    x += w;
  }
  const segs = [];
  const outerH = top[top.length - 1].b[1], innerH = top[0].a[1];
  // inner wall, bottom to top
  segs.push({ a: [-W / 2, -innerH], b: [-W / 2, innerH], part: innerPart, row: -1, v0: 0, v1: 1 });
  for (const s of top) segs.push(s);
  // outer wall, top to bottom, with a gold strap in the middle
  if (outerStrap && T > 5) {
    const q = outerH * 0.42;
    segs.push({ a: [W / 2, outerH], b: [W / 2, q], part: P.PORC, row: -1, v0: 0, v1: 1 });
    segs.push({ a: [W / 2, q], b: [W / 2 + 0.5, q * 0.9], part: P.GOLD, row: -1, v0: 0, v1: 0 });
    segs.push({ a: [W / 2 + 0.5, q * 0.9], b: [W / 2 + 0.5, -q * 0.9], part: P.GOLD, row: -2, v0: 0, v1: 1 });
    segs.push({ a: [W / 2 + 0.5, -q * 0.9], b: [W / 2, -q], part: P.GOLD, row: -1, v0: 0, v1: 0 });
    segs.push({ a: [W / 2, -q], b: [W / 2, -outerH], part: P.PORC, row: -1, v0: 0, v1: 1 });
  } else {
    segs.push({ a: [W / 2, outerH], b: [W / 2, -outerH], part: P.GOLD, row: -2, v0: 0, v1: 1 });
  }
  for (let i = top.length - 1; i >= 0; i--) {
    const s = top[i];
    segs.push({ a: [s.b[0], -s.b[1]], b: [s.a[0], -s.a[1]], part: s.part, row: s.row, v0: s.v1, v1: s.v0 });
  }
  // split long segments (the fracture line needs points to bite into) and accumulate section length
  const out = [];
  let acc = 0;
  for (const s of segs) {
    const L = Math.hypot(s.b[0] - s.a[0], s.b[1] - s.a[1]), n = Math.max(1, Math.ceil(L / maxSeg));
    const nx = -(s.b[1] - s.a[1]) / L, ny = (s.b[0] - s.a[0]) / L;
    for (let i = 0; i < n; i++) {
      const u0 = i / n, u1 = (i + 1) / n;
      out.push({
        a: [s.a[0] + (s.b[0] - s.a[0]) * u0, s.a[1] + (s.b[1] - s.a[1]) * u0], b: [s.a[0] + (s.b[0] - s.a[0]) * u1, s.a[1] + (s.b[1] - s.a[1]) * u1],
        n: [nx, ny], part: s.part, row: s.row, v0: s.v0 + (s.v1 - s.v0) * u0, v1: s.v0 + (s.v1 - s.v0) * u1, s0: acc + L * u0, s1: acc + L * u1,
      });
    }
    acc += L;
  }
  return { segs: out, total: acc, W, T };
}

export function jagFn(seed, total, amp = 2.6) {
  const r = new Rng(seed), a = [r.range(0, 7), r.range(0, 7), r.range(0, 7)], f = [r.range(0.6, 1.0), r.range(1.7, 2.6), r.range(4.0, 6.0)];
  return (s) => amp * Math.sin((Math.PI * s) / total) * (Math.sin(s * f[0] + a[0]) + 0.6 * Math.sin(s * f[1] + a[1]) + 0.32 * Math.sin(s * f[2] + a[2]));
}
const noJag = () => 0;

// Sweep a section around an arc. rhoMap converts a section offset to the 0..1 across-ring coordinate.
export function sweep(b, sec, R, th0, th1, steps, o = {}) {
  const j0 = o.jag0 ?? noJag, j1 = o.jag1 ?? noJag, rhoMap = o.rhoMap ?? (() => 0.5), caps = o.caps ?? true, partOverride = o.part;
  const arcL = (th1 - th0) * R;
  for (const s of sec.segs) {
    const part = partOverride ?? s.part;
    let prev = null;
    for (let k = 0; k <= steps; k++) {
      const q = k / steps, th = th0 + (th1 - th0) * q;
      const jA = k === 0 ? j0(s.s0) : k === steps ? j1(s.s0) : 0, jB = k === 0 ? j0(s.s1) : k === steps ? j1(s.s1) : 0;
      const ra = R + s.a[0], rb = R + s.b[0];
      const tha = th + jA / ra, thb = th + jB / rb;
      const nc = Math.cos(th), ns = Math.sin(th);
      const u = th * R, seam = Math.min(q * arcL, (1 - q) * arcL);
      const A = b.v(Math.cos(tha) * ra, Math.sin(tha) * ra, s.a[1], nc * s.n[0], ns * s.n[0], s.n[1], u, s.s0, part, s.v0, s.row, seam, rhoMap(s.a[0]));
      const B = b.v(Math.cos(thb) * rb, Math.sin(thb) * rb, s.b[1], nc * s.n[0], ns * s.n[0], s.n[1], u, s.s1, part, s.v1, s.row, seam, rhoMap(s.b[0]));
      if (prev) b.quad(prev[0], A, B, prev[1]);
      prev = [A, B];
    }
  }
  if (caps) {
    for (const end of [0, 1]) {
      const th = end ? th1 : th0, jag = end ? j1 : j0, sg = end ? 1 : -1;
      const nx = -Math.sin(th) * sg, ny = Math.cos(th) * sg;
      let cx = 0, cy = 0; for (const s of sec.segs) { cx += s.a[0]; cy += s.a[1]; } cx /= sec.segs.length; cy /= sec.segs.length;
      const rc = R + cx;
      const pc = o.capPart ?? P.BROKEN;
      const C = b.v(Math.cos(th) * rc, Math.sin(th) * rc, cy, nx, ny, 0, th * R, 0, pc, 0.5, -1, 0, 0.5);
      for (const s of sec.segs) {
        const ra = R + s.a[0], rb = R + s.b[0], tha = th + jag(s.s0) / ra, thb = th + jag(s.s1) / rb;
        const A = b.v(Math.cos(tha) * ra, Math.sin(tha) * ra, s.a[1], nx, ny, 0, th * R + s.a[0], s.a[1], pc, 0.5, -1, 0, 0.5);
        const B = b.v(Math.cos(thb) * rb, Math.sin(thb) * rb, s.b[1], nx, ny, 0, th * R + s.b[0], s.b[1], pc, 0.5, -1, 0, 0.5);
        if (end) b.tri(C, A, B); else b.tri(C, B, A);
      }
    }
  }
}

export const boxSection = (r0, r1, h0, h1, opts = {}) => {
  const out = [], pts = [[r0, h0], [r0, h1], [r1, h1], [r1, h0]];
  const row = opts.row ?? -2;
  let acc = 0;
  for (let i = 0; i < 4; i++) {
    const a = pts[i], b = pts[(i + 1) % 4], L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    out.push({ a, b, n: [-(b[1] - a[1]) / L, (b[0] - a[0]) / L], part: opts.part ?? P.GOLD, row, v0: 0, v1: 1, s0: acc, s1: acc + L }); acc += L;
  }
  return { segs: out, total: acc };
};

// A beveled cuff that wraps the whole band: rectangular with chamfered corners
export function cuffSection(rIn, rOut, hHalf, chamfer, part = P.GOLD) {
  const pts = [[rIn, -hHalf + chamfer], [rIn, hHalf - chamfer], [rIn + chamfer, hHalf], [rOut - chamfer, hHalf], [rOut, hHalf - chamfer], [rOut, -hHalf + chamfer], [rOut - chamfer, -hHalf], [rIn + chamfer, -hHalf]];
  const out = []; let acc = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length], L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    out.push({ a, b, n: [-(b[1] - a[1]) / L, (b[0] - a[0]) / L], part, row: -3, v0: 0, v1: 1, s0: acc, s1: acc + L }); acc += L;
  }
  return { segs: out, total: acc };
}

// Lobed rosette boss sitting on a ring face. side = +1 / -1
export function rosette(b, th, rad, z, side, r, part = P.GOLD, lobes = 8) {
  const ex = Math.cos(th), ey = Math.sin(th), tx = -ey, ty = ex;
  const cx = ex * rad, cy = ey * rad;
  const NA = 40, NR = 6;
  const H = (q, a) => {
    const lobe = 0.72 + 0.28 * Math.pow(Math.abs(Math.cos((a * lobes) / 2)), 0.6);
    const rr = q / lobe;
    if (rr >= 1) return 0;
    const dome = Math.sqrt(1 - rr * rr) * r * 0.34;
    return dome + (rr < 0.4 ? r * 0.12 * (1 - rr / 0.4) : 0);
  };
  const ids = [];
  for (let i = 0; i <= NR; i++) {
    ids.push([]);
    for (let j = 0; j <= NA; j++) {
      const q = i / NR, a = (j / NA) * Math.PI * 2, rx = Math.cos(a) * q * r, ry = Math.sin(a) * q * r, e = 0.02;
      const h = H(q, a), dq = (H(Math.min(1, q + e), a) - H(Math.max(0, q - e), a)) / (2 * e * r), da = (H(q, a + 0.05) - H(q, a - 0.05)) / (0.1 * Math.max(q * r, 0.5));
      const nr = -dq, nt = -da;
      const nx = Math.cos(a) * nr - Math.sin(a) * nt, ny = Math.sin(a) * nr + Math.cos(a) * nt;
      let wx = nx * ex + ny * tx, wy = nx * ey + ny * ty, wz = side;
      const l = Math.hypot(wx, wy, wz); wx /= l; wy /= l; wz /= l;
      ids[i].push(b.v(cx + rx * ex + ry * tx, cy + rx * ey + ry * ty, z + side * h, wx, wy, wz, th * rad + rx, ry, part, 0, -1, 99, 0.5));
    }
  }
  for (let i = 0; i < NR; i++) for (let j = 0; j < NA; j++) {
    if (side > 0) b.quad(ids[i][j], ids[i + 1][j], ids[i + 1][j + 1], ids[i][j + 1]);
    else b.quad(ids[i][j], ids[i][j + 1], ids[i + 1][j + 1], ids[i + 1][j]);
  }
}

// Lathe around the radial direction at angle th: prof = [[rho, radius], ...] (bearing pins, finials)
export function latheRadial(b, th, prof, part = P.GOLD, segs = 20) {
  const ex = Math.cos(th), ey = Math.sin(th), tx = -ey, ty = ex;
  for (let i = 0; i < prof.length - 1; i++) {
    const [r0, a0] = prof[i], [r1, a1] = prof[i + 1];
    const L = Math.hypot(r1 - r0, a1 - a0) || 1, nr = -(a1 - a0) / L, na = (r1 - r0) / L;
    let prev = null;
    for (let j = 0; j <= segs; j++) {
      const q = (j / segs) * Math.PI * 2, c = Math.cos(q), s = Math.sin(q);
      const mk = (ρ, a) => b.v(ex * ρ + tx * c * a, ey * ρ + ty * c * a, s * a, ex * nr + tx * c * na, ey * nr + ty * c * na, s * na, q * a, ρ, part, 0, -2, 99, 0.5);
      const A = mk(r0, a0), B = mk(r1, a1);
      if (prev) b.quad(prev[0], A, B, prev[1]);
      prev = [A, B];
    }
  }
}

// Flat pierced annulus sector (the lace), two faces share it. v runs inner to outer.
export function laceStrip(b, r0, r1, th0, th1, steps, z = 0, rhoMap = () => 0.5) {
  let prev = null;
  const arcL = (th1 - th0) * ((r0 + r1) / 2);
  for (let k = 0; k <= steps; k++) {
    const q = k / steps, th = th0 + (th1 - th0) * q, c = Math.cos(th), s = Math.sin(th), u = th * ((r0 + r1) / 2), seam = Math.min(q * arcL, (1 - q) * arcL);
    const A = b.v(c * r0, s * r0, z, 0, 0, 1, u, 0, P.LACE, 0, -1, seam, rhoMap(r0));
    const B = b.v(c * r1, s * r1, z, 0, 0, 1, u, r1 - r0, P.LACE, 1, -1, seam, rhoMap(r1));
    if (prev) b.quad(prev[0], A, B, prev[1]);
    prev = [A, B];
  }
}

// Imports a THREE geometry (non indexed) into the buffer, as part `part`.
export function pushGeometry(b, geo, matrix, part = P.GOLD, seam = 99) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  const p = g.attributes.position, n = g.attributes.normal, v = new THREE.Vector3(), w = new THREE.Vector3();
  const nm = new THREE.Matrix3().getNormalMatrix(matrix);
  for (let i = 0; i < p.count; i += 3) {
    const ids = [];
    for (let k = 0; k < 3; k++) {
      v.fromBufferAttribute(p, i + k).applyMatrix4(matrix);
      w.fromBufferAttribute(n, i + k).applyMatrix3(nm).normalize();
      ids.push(b.v(v.x, v.y, v.z, w.x, w.y, w.z, v.x * 0.7 + v.y * 0.3, v.z + v.y * 0.5, part, 0, -2, seam, 0.5));
    }
    b.tri(ids[0], ids[1], ids[2]);
  }
}

// ---------------------------------------------------------------- the five rings
// Each ring: { R (mean radius), rOuter, rInner, seams[], clusters, build(chunkBufs, chunkFor) }

function makeSeams(rng, n) {
  const a = [];
  for (let i = 0; i < n; i++) a.push(((i + rng.range(-0.28, 0.28)) / n) * Math.PI * 2 + 0.2);
  a.sort((x, y) => x - y);
  return a;
}

export const RINGS = [
  { name: 'great', rI: 234, rO: 260, T: 13, chunks: 12, cluster: [[0, 1, 2, 3, 4, 5, 6, 7, 8], [9, 10, 11]], pivotOut: null, pivotIn: 'x' },
  { name: 'gear', rI: 214.5, rO: 229.5, T: 9, chunks: 14, cluster: [[0, 1, 2, 3, 4, 5], [6, 7, 8, 9], [10, 11, 12, 13]], pivotOut: 'x', pivotIn: 'y' },
  { name: 'rete', rI: 168, rO: 207.5, T: 7, chunks: 14, cluster: [[0, 1, 2, 3, 4], [5, 6, 7], [8, 9, 10, 11, 12, 13]], pivotOut: 'y', pivotIn: 'x' },
  { name: 'dial', rI: 144, rO: 162, T: 9, chunks: 12, cluster: [[0, 1, 2, 3], [4, 5, 6, 7, 8], [9, 10, 11]], pivotOut: 'x', pivotIn: 'y' },
  { name: 'inner', rI: 105, rO: 135, T: 16, chunks: 10, cluster: [[0, 1, 2, 3, 4], [5, 6], [7, 8, 9]], pivotOut: 'y', pivotIn: null },
];
export const CORE_R = 74;

function ringSection(i) {
  if (i === 0) return section(26, 13, [
    { t: 'rail', w: 2.4 }, { t: 'groove', w: 0.9 }, { t: 'flat', w: 9.4, r: 0 }, { t: 'bead', w: 1.5 }, { t: 'flat', w: 8.0, r: 1 }, { t: 'groove', w: 0.9 }, { t: 'rail', w: 2.9 },
  ]);
  if (i === 1) return section(15, 9, [
    { t: 'rail', w: 1.7 }, { t: 'flat', w: 11.6, p: P.GOLD, r: 3 }, { t: 'rail', w: 1.7 },
  ]);
  if (i === 3) return section(18, 9, [
    { t: 'rail', w: 1.8 }, { t: 'groove', w: 0.7 }, { t: 'flat', w: 11.0, r: 2 }, { t: 'groove', w: 0.7 }, { t: 'rail', w: 1.8 },
  ]);
  if (i === 4) return section(30, 16, [
    { t: 'rail', w: 3.0 }, { t: 'groove', w: 0.9 }, { t: 'flat', w: 6.0, p: P.ENAMEL, r: 3 }, { t: 'bead', w: 1.5 }, { t: 'flat', w: 13.6, r: 0 }, { t: 'groove', w: 0.9 }, { t: 'rail', w: 3.0 },
  ]);
  return null;
}

// Builds per-chunk geometry for ring i. Returns { geos: [...], seams, clusters, R, chunkMid[] }.
export function buildRing(i) {
  const cfg = RINGS[i], rng = new Rng(1771 + i * 37);
  const seams = makeSeams(rng, cfg.chunks);
  const N = cfg.chunks;
  const R = (cfg.rI + cfg.rO) / 2;
  const bufs = Array.from({ length: N }, () => new Buf());
  const th0 = (c) => seams[c], th1 = (c) => (c === N - 1 ? seams[0] + Math.PI * 2 : seams[c + 1]);
  const chunkFor = (th) => {
    let a = th; const base = seams[0];
    while (a < base) a += Math.PI * 2;
    while (a >= base + Math.PI * 2) a -= Math.PI * 2;
    for (let c = 0; c < N; c++) if (a < th1(c)) return c;
    return N - 1;
  };
  const toLocalA = (th, c) => { let a = th; const lo = th0(c), hi = th1(c); while (a < lo) a += Math.PI * 2; while (a > hi) a -= Math.PI * 2; return a; };
  const rhoMap = (ρ) => (R + ρ - cfg.rI) / (cfg.rO - cfg.rI);
  const stepsFor = (c) => Math.max(10, Math.round(((th1(c) - th0(c)) * R) / 3.6));

  const sec = ringSection(i);
  if (sec) {
    const jags = seams.map((_, k) => jagFn(i * 100 + k + 5, sec.total, i === 1 ? 1.6 : 2.6));
    for (let c = 0; c < N; c++) sweep(bufs[c], sec, R, th0(c), th1(c), stepsFor(c), { jag0: jags[c], jag1: jags[(c + 1) % N], rhoMap });
  } else {
    // ring 2 (the rete): two rails with a pierced lace web between them and spokes
    const Ra = cfg.rO - 3.5, Rb = cfg.rI + 3;
    const sa = section(7, 7, [{ t: 'rail', w: 1.5 }, { t: 'flat', w: 4, r: 0 }, { t: 'rail', w: 1.5 }]);
    const sb = section(6, 7, [{ t: 'rail', w: 1.3 }, { t: 'flat', w: 3.4, r: 3, p: P.GOLD }, { t: 'rail', w: 1.3 }]);
    const ja = seams.map((_, k) => jagFn(200 + k, sa.total, 1.8)), jb = seams.map((_, k) => jagFn(260 + k, sb.total, 1.6));
    for (let c = 0; c < N; c++) {
      sweep(bufs[c], sa, Ra, th0(c), th1(c), stepsFor(c), { jag0: ja[c], jag1: ja[(c + 1) % N], rhoMap: (ρ) => (Ra + ρ - cfg.rI) / (cfg.rO - cfg.rI) });
      sweep(bufs[c], sb, Rb, th0(c), th1(c), stepsFor(c), { jag0: jb[c], jag1: jb[(c + 1) % N], rhoMap: (ρ) => (Rb + ρ - cfg.rI) / (cfg.rO - cfg.rI) });
      laceStrip(bufs[c], cfg.rI + 6, cfg.rO - 7, th0(c), th1(c), stepsFor(c), 0, (r) => (r - cfg.rI) / (cfg.rO - cfg.rI));
    }
    // spokes every 20 degrees, thick moulded bars, in absolute polar form because they cross radii
    for (let k = 0; k < 18; k++) {
      const a = ((k + 0.5) / 18) * Math.PI * 2, c = chunkFor(a), A = toLocalA(a, c), halfW = 1.7;
      const ex = Math.cos(A), ey = Math.sin(A), tx = -ey, ty = ex;
      const r0 = cfg.rI + 5, r1 = cfg.rO - 6, h = 2.6, b = bufs[c], part = P.GOLD;
      const P4 = (r, t, z) => [ex * r + tx * t, ey * r + ty * t, z];
      const face = (a1, a2, a3, a4, n) => {
        const ids = [a1, a2, a3, a4].map((v, q) => b.v(v[0], v[1], v[2], n[0], n[1], n[2], r0 + (q === 1 || q === 2 ? r1 - r0 : 0), q < 2 ? 0 : 3, part, 0, -2, 99, 0.5));
        b.quad(ids[0], ids[1], ids[2], ids[3]);
      };
      face(P4(r0, -halfW, h), P4(r1, -halfW, h), P4(r1, halfW, h), P4(r0, halfW, h), [0, 0, 1]);
      face(P4(r0, halfW, -h), P4(r1, halfW, -h), P4(r1, -halfW, -h), P4(r0, -halfW, -h), [0, 0, -1]);
      face(P4(r0, halfW, h), P4(r1, halfW, h), P4(r1, halfW, -h), P4(r0, halfW, -h), [tx, ty, 0]);
      face(P4(r0, -halfW, -h), P4(r1, -halfW, -h), P4(r1, -halfW, h), P4(r0, -halfW, h), [-tx, -ty, 0]);
      for (const s of [1, -1]) rosette(b, A, (r0 + r1) / 2, s * h, s, 3.6, P.GOLD, 6);
    }
  }

  const hTop = cfg.T / 2 + 0.2;
  const addCuff = (a, arcLen, extra = 1.4, hExtra = 1.5, part = P.GOLD) => {
    const c = chunkFor(a), A = toLocalA(a, c), d = arcLen / R / 2;
    const lo = Math.max(th0(c) + 0.003, A - d), hi = Math.min(th1(c) - 0.003, A + d);
    if (hi - lo < d * 0.8) return c;
    sweep(bufs[c], cuffSection(cfg.rI - extra - R, cfg.rO + extra - R, cfg.T / 2 + hExtra, 0.8, part), R, lo, hi, 3, { capPart: P.GOLD, rhoMap: () => 0.5 });
    return c;
  };
  const addRosettes = (a, n, r) => {
    const c = chunkFor(a), A = toLocalA(a, c);
    for (let q = 0; q < n; q++) {
      const ρ = cfg.rI + ((q + 0.5) / n) * (cfg.rO - cfg.rI);
      rosette(bufs[c], A, ρ, cfg.T / 2 + 0.05, 1, r); rosette(bufs[c], A, ρ, -cfg.T / 2 - 0.05, -1, r);
    }
  };

  // cuffs + rosettes at regular stations, every ring its own rhythm
  const stations = [12, 16, 0, 20, 12][i];
  for (let k = 0; k < stations; k++) {
    const a = ((k + 0.25) / stations) * Math.PI * 2;
    const big = k % 3 === 0;
    addCuff(a, big ? 13 : 6, big ? 1.5 : 0.8, big ? 1.8 : 1.0);
    if (i !== 1 && big) addRosettes(a, 1, cfg.T * 0.42);
    if (i === 4 && !big) addCuff(a + 0.09, 3, 0.5, 0.5, P.ENAMEL);
  }
  // little dark gear teeth on the gear ring
  if (i === 1) {
    const n = 240;
    for (let k = 0; k < n; k++) {
      const a = ((k + 0.5) / n) * Math.PI * 2, c = chunkFor(a), A = toLocalA(a, c), d = (2.4 / 3.5) / R;
      if (A - d < th0(c) + 0.003 || A + d > th1(c) - 0.003) continue;
      sweep(bufs[c], boxSection(cfg.rO - R - 0.1, cfg.rO - R + 1.8, -2.6, 2.6, { part: P.GOLD }), R, A - d, A + d, 1, { capPart: P.GOLD });
    }
  }
  // radial ribs across the porcelain faces of the outer and inner rings
  if (i === 0 || i === 4 || i === 3) {
    const n = [72, 0, 0, 60, 48][i];
    for (let k = 0; k < n; k++) {
      const a = ((k + 0.5) / n) * Math.PI * 2;
      const c = chunkFor(a), A = toLocalA(a, c), d = 0.42 / R;
      if (A - d < th0(c) + 0.003 || A + d > th1(c) - 0.003) continue;
      sweep(bufs[c], boxSection(cfg.rI - R + (i === 0 ? 3.6 : 3.8), cfg.rO - R - 3.6, cfg.T / 2 - 0.1, cfg.T / 2 + 0.55, { part: P.GOLD }), R, A - d, A + d, 1, { capPart: P.GOLD });
      sweep(bufs[c], boxSection(cfg.rI - R + (i === 0 ? 3.6 : 3.8), cfg.rO - R - 3.6, -cfg.T / 2 - 0.55, -cfg.T / 2 + 0.1, { part: P.GOLD }), R, A - d, A + d, 1, { capPart: P.GOLD });
    }
  }
  // bearing pins: outward towards the parent ring on the axis this ring pivots about
  if (cfg.pivotOut) {
    const angs = cfg.pivotOut === 'x' ? [0, Math.PI] : [Math.PI / 2, -Math.PI / 2];
    const parent = RINGS[i - 1];
    for (const a of angs) {
      const c = addCuff(a, 15, 2.2, 2.6);
      addRosettes(a, 1, cfg.T * 0.46);
      latheRadial(bufs[c], a, [[cfg.rO - 0.2, 5.6], [cfg.rO + 0.6, 5.6], [cfg.rO + 1.0, 3.6], [parent.rI - 1.2, 3.6], [parent.rI - 0.8, 5.0], [parent.rI + 0.3, 5.0]]);
    }
  }
  if (cfg.pivotIn) {
    // sockets: a heavy cuff where the child's pin arrives
    const angs = cfg.pivotIn === 'x' ? [0, Math.PI] : [Math.PI / 2, -Math.PI / 2];
    for (const a of angs) { addCuff(a, 17, 2.4, 2.8); addRosettes(a, 1, cfg.T * 0.46); }
  }

  const geos = bufs.map((b) => b.build());
  const chunkMid = [];
  for (let c = 0; c < N; c++) chunkMid.push((th0(c) + th1(c)) / 2);
  return { geos, seams, chunkMid, R, cfg, clusters: cfg.cluster };
}

// The hanging throne (kursi) of an astrolabe, on the great ring. Local: x along the tangent, y outward from the rim.
export function buildThrone() {
  const b = new Buf();
  const s = new THREE.Shape();
  const W = 40;
  s.moveTo(-W, 0);
  s.bezierCurveTo(-W * 0.95, 14, -W * 0.62, 12, -W * 0.56, 24);
  s.bezierCurveTo(-W * 0.5, 34, -W * 0.3, 28, -W * 0.25, 42);
  s.bezierCurveTo(-W * 0.2, 56, -W * 0.08, 50, 0, 64);
  s.bezierCurveTo(W * 0.08, 50, W * 0.2, 56, W * 0.25, 42);
  s.bezierCurveTo(W * 0.3, 28, W * 0.5, 34, W * 0.56, 24);
  s.bezierCurveTo(W * 0.62, 12, W * 0.95, 14, W, 0);
  s.lineTo(-W, 0);
  const hole = (cx, cy, r) => { const h = new THREE.Path(); for (let i = 0; i <= 40; i++) { const a = (i / 40) * Math.PI * 2, q = r * (0.74 + 0.26 * Math.abs(Math.cos(a * 2))); const x = cx + Math.cos(a) * q, y = cy + Math.sin(a) * q; if (i) h.lineTo(x, y); else h.moveTo(x, y); } s.holes.push(h); };
  hole(0, 24, 13); hole(-22, 12, 7.5); hole(22, 12, 7.5);
  const g = new THREE.ExtrudeGeometry(s, { depth: 7, bevelEnabled: true, bevelThickness: 1.1, bevelSize: 1.0, bevelSegments: 2, curveSegments: 18 });
  g.translate(0, 0, -3.5);
  const M = new THREE.Matrix4();
  pushGeometry(b, g, M, P.GOLD);
  const hoop = new THREE.TorusGeometry(10, 1.8, 12, 56);
  hoop.translate(0, 74, 0);
  pushGeometry(b, hoop, M, P.GOLD);
  return b.build();
}
