// BLACKOUT, land department: tens of thousands of stucco houses on the terraces, instanced, plus strings of paper lanterns.
import * as THREE from 'three';
import { Rng } from './util.js';
import { landMap, blockOf, STEP, ROW } from './land-map.js';

const WALLS = ['#c9975d', '#d3a56c', '#b97e50', '#a96c49', '#c88a64', '#d8b681', '#b5704a', '#a05c3e', '#cfa574', '#bf8b52'];
const col3 = (hex) => { const c = new THREE.Color(hex); return [c.r, c.g, c.b]; };

// every house: a true box with a hipped roof, flat faces, 4 sides
function unitBox(R) {
  const C = [[0.5, 0.5], [-0.5, 0.5], [-0.5, -0.5], [0.5, -0.5]], Nn = [[0, 1], [-1, 0], [0, -1], [1, 0]];
  const pos = [], nrm = [], au = [], idx = [];
  let n = 0;
  for (let i = 0; i < 4; i++) {
    const a = C[i], b = C[(i + 1) % 4], f = Nn[i];
    pos.push(a[0], 0, a[1], a[0], 1, a[1], b[0], 0, b[1], b[0], 1, b[1]);
    for (let k = 0; k < 4; k++) nrm.push(f[0], 0, f[1]);
    au.push(i / 4, 0, 0, i, i / 4, 0, 0, i, (i + 1) / 4, 0, 0, i, (i + 1) / 4, 0, 0, i);
    idx.push(n, n + 1, n + 2, n + 2, n + 1, n + 3); n += 4;
    for (let k = 0; k < R.length; k++) { const [t, y] = R[k]; pos.push(a[0], y, a[1], b[0], y, b[1]); nrm.push(f[0], 0, f[1], f[0], 0, f[1]); au.push(i / 4, 1, t, i, (i + 1) / 4, 1, t, i); }
    for (let k = 0; k < R.length - 1; k++) { const q = n + k * 2; idx.push(q, q + 2, q + 1, q + 1, q + 2, q + 3); }
    n += R.length * 2;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('aU', new THREE.Float32BufferAttribute(au, 4));
  g.setIndex(idx);
  return g;
}

function attrs(list, g) {
  const n = list.length;
  const A = new Float32Array(n * 4), B = new Float32Array(n * 4), C = new Float32Array(n * 4), L = new Float32Array(n * 4);
  list.forEach((h, i) => { A.set(h.a, i * 4); B.set(h.b, i * 4); C.set(h.c, i * 4); L.set(h.l, i * 4); });
  const ig = new THREE.InstancedBufferGeometry();
  ig.setIndex(g.index); ig.setAttribute('position', g.attributes.position); ig.setAttribute('normal', g.attributes.normal); ig.setAttribute('aU', g.attributes.aU);
  ig.setAttribute('uv', new THREE.BufferAttribute(new Float32Array((g.attributes.position.count) * 2), 2));
  ig.setAttribute('aA', new THREE.InstancedBufferAttribute(A, 4));
  ig.setAttribute('aB', new THREE.InstancedBufferAttribute(B, 4));
  ig.setAttribute('aC', new THREE.InstancedBufferAttribute(C, 4));
  ig.setAttribute('aL', new THREE.InstancedBufferAttribute(L, 4));
  ig.instanceCount = n;
  return ig;
}

// a near-camera zone gets the rounded high-LOD houses at full density
export const HERO = { x: 1150, z: 1050, r: 1300 };

export function buildCity(mapL) {
  const M = mapL || landMap();
  const rng = new Rng(4412);
  const near = [], far = [], lanterns = [];
  // spatial hash for dart throwing
  const CELLH = 34, grid = new Map();
  const key = (i, j) => i * 73856093 ^ j * 19349663;
  const tooClose = (x, z, r) => {
    const i0 = Math.floor(x / CELLH), j0 = Math.floor(z / CELLH);
    for (let i = i0 - 1; i <= i0 + 1; i++) for (let j = j0 - 1; j <= j0 + 1; j++) {
      const l = grid.get(key(i, j));
      if (!l) continue;
      for (const [hx, hz, hr] of l) if (Math.hypot(hx - x, hz - z) < hr + r) return true;
    }
    return false;
  };
  const place = (x, z, r) => { const k = key(Math.floor(x / CELLH), Math.floor(z / CELLH)); if (!grid.has(k)) grid.set(k, []); grid.get(k).push([x, z, r]); };
  const X0 = -2500, X1 = 4300, Z0 = -5200, Z1 = 3050;
  const DARTS = 4200000, HERO_DARTS = 1600000;
  const wallCols = WALLS.map(col3);
  const push = (list, h) => list.push(h);
  for (let d = 0; d < DARTS; d++) {
    // the first darts fill the area nearest the poster camera
    const ang = rng.next() * Math.PI * 2, rad = Math.sqrt(rng.next()) * HERO.r;
    const x = d < HERO_DARTS ? HERO.x + Math.cos(ang) * rad : rng.range(X0, X1), z = d < HERO_DARTS ? HERO.z + Math.sin(ang) * rad : rng.range(Z0, Z1);
    const dHero = Math.hypot(x - HERO.x, z - HERO.z);
    const tier = dHero < HERO.r ? 0 : dHero < 3200 ? 1 : 2;
    const dens = M.cityDensity(x, z);
    if (dens < 0.2 || rng.next() > dens * (tier === 2 ? 0.4 : 1)) continue;
    const c = M.coast(x, z);
    if (c < 14) continue;
    // the power line easement: an open strip under the first towers
    { const ax = -940, az = 1365, bx = -1215, bz = 1458, tt = Math.min(1, Math.max(0, ((x - ax) * (bx - ax) + (z - az) * (bz - az)) / ((bx - ax) ** 2 + (bz - az) ** 2))); if (Math.hypot(x - (ax + (bx - ax) * tt), z - (az + (bz - az) * tt)) < 48) continue; }
    const h = M.h0(x, z);
    // row fields: terrace bands from the contour, an extra street every ROW on a wide tread
    const e = 6, gx = (M.h0(x + e, z) - M.h0(x - e, z)) / (2 * e), gz = (M.h0(x, z + e) - M.h0(x, z - e)) / (2 * e);
    const g = Math.hypot(gx, gz) || 1e-4;
    const q = h / STEP, f = q - Math.floor(q);
    if (f > 0.78) continue;
    const tread = STEP / g;
    const pos = f * tread;
    const rowF = pos / ROW;
    const fr = rowF - Math.floor(rowF);
    if (tread > ROW * 1.4 && (fr < 0.18 || fr > 0.85)) continue;
    // radial stairs up from the bay
    const th = Math.atan2(z - 500, x);
    const rd = Math.hypot(x, z - 500);
    const spoke = Math.abs(((th * 18) / Math.PI) % 1);
    if (rd > 400 && Math.min(spoke, 1 - spoke) * rd * Math.PI / 18 < 5.5) continue;
    // size: small near, chunkier and sparser where nobody will see single houses
    const size = tier === 0 ? rng.range(0.85, 1.15) : tier === 1 ? rng.range(1.0, 1.3) : rng.range(1.6, 2.1);
    const w = rng.range(7.2, 11.5) * size, dd = rng.range(6.4, 9.5) * size;
    const r = (w + dd) * 0.25 + rng.range(0.1, 0.9);       // terraced rows: neighbours share walls
    if (tooClose(x, z, r)) continue;
    place(x, z, r);
    const ry = Math.atan2(gx, gz) + rng.range(-0.1, 0.1);
    const fh = 3.1;
    const closeBay = Math.exp(-c / 400);
    let floors = Math.round(rng.range(1.5, 3.2 + 2.4 * closeBay));
    if (rng.next() < 0.05) floors += rng.int(2, 4);     // an occasional tall house breaks the skyline
    const hgt = floors * fh * (tier === 2 ? 1.1 : 1);
    const y = M.groundY(x, z);
    const bk = blockOf(x, z);
    const c3 = rng.pick(wallCols);
    const list = tier === 0 ? near : far;
    const tall = rng.next();
    const hj = { a: [x, y, z, ry], b: [w, dd, hgt, fh], c: [c3[0], c3[1], c3[2], rng.next() * 40], l: [bk.front, bk.jitter + rng.range(-0.05, 0.05), rng.next(), rng.range(0.8, 2.6)] };
    push(list, hj);
    // a second, set-back upper volume breaks the skyline on some houses (near rounded tower)
    if (tier < 2 && tall < 0.3) {
      const w2 = w * rng.range(0.45, 0.65), d2 = dd * rng.range(0.45, 0.65);
      const c4 = rng.pick(wallCols);
      const ox = rng.range(-0.15, 0.15) * w, oz = rng.range(-0.15, 0.15) * dd;
      const wx = x + ox * Math.cos(ry) + oz * Math.sin(ry), wz = z - ox * Math.sin(ry) + oz * Math.cos(ry);
      push(list, { a: [wx, y + hgt - 0.5, wz, ry], b: [w2, d2, fh * rng.range(1.0, 1.7), fh], c: [c4[0], c4[1], c4[2], rng.next() * 40], l: [bk.front, bk.jitter, rng.next(), 0.2] });
    }
    // strings of round paper lanterns on the street side
    const nL = tier === 0 ? rng.int(1, 4) : tier === 1 ? rng.int(1, 3) : rng.int(1, 2);
    const fx = -Math.sin(ry) * -1, fz = -Math.cos(ry);
    for (let k = 0; k < nL; k++) {
      const o = rng.range(-0.6, 0.6) * w;
      const lx = x + Math.cos(ry) * o + (fx) * (dd / 2 + 1.8), lz = z - Math.sin(ry) * o + fz * (dd / 2 + 1.8);
      const yl = y + rng.range(2.6, 4.2);
      lanterns.push([lx, yl, lz, rng.range(0.62, 0.95) * (tier === 2 ? 3.0 : tier === 1 ? 1.6 : 1.0), bk.front, bk.jitter + rng.range(-0.08, 0.08), rng.next()]);
    }
  }
  // hill villages: from the height of the poster they are clusters of gold points climbing the hills
  for (let v = 0; v < 900; v++) {
    const cx = rng.range(-5200, 4800), cz = rng.range(-5600, 3100);
    if (M.cityDensity(cx, cz) > 0.12 || M.coast(cx, cz) < 40 || M.groundY(cx, cz) > 520 || Math.hypot(cx + 3050, cz - 2050) < 620) continue;
    const r0 = rng.range(26, 120), n0 = Math.floor(rng.range(14, 110));
    for (let k = 0; k < n0; k++) {
      const a = rng.next() * Math.PI * 2, rr = r0 * Math.sqrt(-Math.log(1 - rng.next() * 0.95)) * 0.6;
      const x = cx + Math.cos(a) * rr, z = cz + Math.sin(a) * rr;
      if (M.coast(x, z) < 12) continue;
      const bk = blockOf(x, z);
      lanterns.push([x, M.groundY(x, z) + rng.range(2.5, 6), z, rng.range(1.2, 2.6), bk.front, bk.jitter + rng.range(-0.08, 0.08), rng.next()]);
    }
  }
  // merge into meshes
  const gNear = attrs(near, unitBox([[0, 0], [0.5, 0.44], [1, 1]]));
  const gFar = attrs(far, unitBox([[0, 0], [1, 1]]));
  return { near: gNear, far: gFar, lanterns, count: near.length + far.length };
}

// The far city: one continuous roof blanket over the city ground, varied per quarter-block so crests have rooflines.
export function buildMass(mapL) {
  const M = mapL || landMap();
  const S = 10, X0 = -2520, X1 = 4320, Z0 = -5220, Z1 = 3060;
  const W = Math.floor((X1 - X0) / S) + 1, H = Math.floor((Z1 - Z0) / S) + 1;
  const pos = new Float32Array(W * H * 3), aH = new Float32Array(W * H), keep = new Uint8Array(W * H);
  const sst = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  const rndT = (i, j) => { const s = Math.sin(i * 127.1 + j * 311.7) * 43758.5453; return s - Math.floor(s); };
  // bilinear between quarter-block heights: rooflines roll, no saw teeth from the 10 m grid
  const tileH = (x, z) => { const fx = x / 34, fz = z / 34, i = Math.floor(fx), j = Math.floor(fz), u = fx - i, v = fz - j; return (rndT(i, j) * (1 - u) + rndT(i + 1, j) * u) * (1 - v) + (rndT(i, j + 1) * (1 - u) + rndT(i + 1, j + 1) * u) * v; };
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    const x = X0 + i * S, z = Z0 + j * S, k = j * W + i;
    const dens = M.cityDensity(x, z), c = M.coast(x, z), h = Math.max(M.h0(x, z), M.groundY(x, z));
    const roof = (7 + 5 * tileH(x, z)) * sst(0.03, 0.16, dens) * sst(14, 42, c);
    pos[k * 3] = x; pos[k * 3 + 1] = h + roof - 3.5 * (1 - sst(5, 26, c)) * (1 - sst(0.5, 3, roof)); pos[k * 3 + 2] = z;
    aH[k] = h;
    keep[k] = dens > 0.03 && c > 2 ? 1 : 0;
  }
  const idx = [];
  for (let j = 0; j < H - 1; j++) for (let i = 0; i < W - 1; i++) {
    const a = j * W + i, b = a + 1, c = a + W, d = c + 1;
    if (keep[a] + keep[b] + keep[c] + keep[d] < 4) continue;
    idx.push(a, c, b, b, c, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aH', new THREE.BufferAttribute(aH, 1));
  g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(W * H * 2), 2));
  g.setIndex(new THREE.Uint32BufferAttribute(idx, 1));
  g.computeVertexNormals();
  return g;
}

export function lanternGeometry(list) {
  const n = list.length;
  const P = new Float32Array(n * 4), K = new Float32Array(n * 4);
  list.forEach(([x, y, z, s, key, j, hue], i) => { P.set([x, y, z, s], i * 4); K.set([key, j, hue, i * 0.017], i * 4); });
  const ig = new THREE.InstancedBufferGeometry();
  ig.setAttribute('position', new THREE.Float32BufferAttribute([-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0], 3));
  ig.setIndex([0, 1, 2, 0, 2, 3]);
  ig.setAttribute('aP', new THREE.InstancedBufferAttribute(P, 4));
  ig.setAttribute('aK', new THREE.InstancedBufferAttribute(K, 4));
  ig.instanceCount = n;
  return ig;
}
