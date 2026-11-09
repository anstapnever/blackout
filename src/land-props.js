// BLACKOUT, land department: dressing. Lighthouses, harbour moles and water stairs, boulders and basalt spires on the ridge,
// pines and cypress on the hills. Rocks are real closed meshes with the world-space basalt shader.
import * as THREE from 'three';
import { Rng } from './util.js';
import { shelfSd, YARD, CANALS, frontOf, blockOf } from './land-map.js';
import { G3 } from './land-power.js';

const hsh = (x, y) => { const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return s - Math.floor(s); };

// ---------------------------------------------------------------- boulders: subdivided icosahedra pushed by noise, merged
function boulderInto(arr, rng, x, y, z, r, flat = 0.75, detail = 3, column = false) {
  const geo = new THREE.IcosahedronGeometry(1, detail);
  const P = geo.attributes.position;
  const ry = rng.range(0, 6.28), rx = column ? rng.range(-0.05, 0.05) : rng.range(-0.3, 0.3), rz = column ? rng.range(-0.05, 0.05) : rng.range(-0.3, 0.3);
  const m = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rx, ry, rz));
  const seed = rng.range(0, 99);
  const v = new THREE.Vector3();
  const facet = (a, b, c) => { const n = (Math.sin(a * 2.3 + seed) + Math.sin(b * 3.1 + seed * 2) + Math.sin(c * 2.7 - seed)) / 3; return n; };
  // anything big enough to be looked at is a convex cut: random planes, or the hexagon-ish faces of a basalt column
  let planes = null;
  if (column || (r >= 1.2 && detail >= 2)) {
    const lr = new Rng(Math.floor(seed * 1000) + 17);
    planes = [];
    const n = column ? 6 + Math.floor(lr.next() * 2) : 9 + Math.floor(lr.next() * 5);
    for (let i = 0; i < n; i++) {
      if (column) { const a = (i / n) * 6.283 + lr.range(-0.2, 0.2); planes.push([Math.cos(a), lr.range(-0.05, 0.05), Math.sin(a), lr.range(0.64, 0.84)]); }
      else { const a = lr.range(0, 6.283), c = lr.range(-1, 1), s = Math.sqrt(1 - c * c); planes.push([Math.cos(a) * s, c, Math.sin(a) * s, lr.range(0.58, 0.92)]); }
    }
    if (column) { const tx = lr.range(-0.5, 0.5), tz = lr.range(-0.5, 0.5), l = Math.hypot(tx, 1, tz); planes.push([tx / l, 1 / l, tz / l, lr.range(0.74, 0.92)]); }
  }
  for (let i = 0; i < P.count; i++) {
    v.fromBufferAttribute(P, i);
    let d;
    if (planes) { d = 1.14; for (const p of planes) { const dn = v.x * p[0] + v.y * p[1] + v.z * p[2]; if (dn > 1e-3) d = Math.min(d, p[3] / dn); } d *= 1 + 0.012 * facet(v.x * 5, v.y * 6, v.z * 5); }
    else d = 1 + 0.32 * facet(v.x, v.y, v.z) + 0.16 * facet(v.y * 2.1, v.z * 2.4, v.x * 2.2) + 0.08 * facet(v.z * 4.6, v.x * 5.1, v.y * 4.1);
    v.multiplyScalar(d).applyMatrix4(m);
    arr.pos.push(x + v.x * r, y + v.y * r * flat, z + v.z * r);
  }
  const base = arr.n;
  const idx = geo.index ? geo.index.array : null;
  if (idx) for (let i = 0; i < idx.length; i++) arr.idx.push(idx[i] + base);
  else for (let i = 0; i < P.count; i++) arr.idx.push(base + i);
  arr.n += P.count;
  geo.dispose();
}

// the hook's key view (s01c, from the barrel top toward the ring): nothing of ours may stand in front of the ring, even at the end of its 1.5x push-in
const inRingView = (x, z, r = 0) => { const dx = x + 3164.5, dz = z - 2080, s = dx * 0.8716 - dz * 0.4904, perp = Math.abs(dx * 0.4904 + dz * 0.8716); return s > 40 && s < 2800 && perp - r < 4 + s * 0.095; };

export function buildRocks(M) {
  const arr = { pos: [], idx: [], n: 0 };
  const skip = { pos: [], idx: [], n: 0 };                         // rocks in the ring's view are built here and dropped, so the random sequence, and every other rock, stays where it was
  const rng = new Rng(2204);
  const G = M.groundY;
  // no tall scatter over the machine capsule: from (-3252, 2129) to (-2969, 1970), radius 60, plus margin
  const capsuleD = (x, z) => { const ax = -3252, az = 2129, bx = -2969, bz = 1970; const dx = bx - ax, dz = bz - az; const t = Math.min(1, Math.max(0, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz))); return Math.hypot(x - ax - t * dx, z - az - t * dz); };
  // boulders tumbled around the shelf rim and on the slopes in front of it
  for (let i = 0; i < 2600; i++) {
    const x = rng.range(-3800, -2600), z = rng.range(1460, 2780);
    const sd = shelfSd(x, z);
    const cd = capsuleD(x, z);
    if (cd < 85) continue;
    if (sd < -40 && rng.next() > 0.08) continue;
    if (rng.next() > 0.7 - Math.min(0.5, Math.abs(sd - 40) / 300)) continue;
    const r = Math.pow(rng.next(), 2.4) * 16 + 0.7;
    const y = G(x, z);
    boulderInto(inRingView(x, z, r) ? skip : arr, rng, x, y + r * 0.08, z, r, rng.range(0.55, 0.95));
  }
  // stones and rubble on the shelf where the cameras get low; low and small, clear of the machine feet
  for (let i = 0; i < 26000 && arr.n < 2200000; i++) {
    const x = rng.range(-3700, -2750), z = rng.range(1700, 2500);
    const sd = shelfSd(x, z), cd = capsuleD(x, z);
    if (sd > 70 || cd < 64) continue;
    if (Math.hypot(x + 3120, z - 2190) < 28) continue;             // the control hut
    const r = Math.pow(rng.next(), 3) * 1.1 + 0.14;
    boulderInto(arr, rng, x, G(x, z) - r * 0.18, z, r, rng.range(0.45, 0.8), r > 0.6 ? 2 : 1);
  }
  // basalt spires on the scarp behind the gun: a jagged skyline for the medium shots
  for (let i = 0; i < 55; i++) {
    const a = rng.range(-0.5, 0.5) * 3.0 + 3.14;
    const d = rng.range(420, 620);
    const x = -3110 + Math.cos(a) * d, z = 2040 + Math.sin(a) * d * 0.9;
    const y = G(x, z);
    const h = rng.range(26, 68), r0 = rng.range(10, 21);
    // a group of basalt columns of unequal height
    const n = 2 + Math.floor(rng.next() * 3);
    for (let k = 0; k < n; k++) {
      const a2 = rng.range(0, 6.283), off = k ? r0 * rng.range(0.7, 1.15) : 0, rr = r0 * (k ? rng.range(0.45, 0.72) : 0.85), hh = h * (k ? rng.range(0.4, 0.85) : 1) + 10;
      boulderInto(arr, rng, x + Math.cos(a2) * off, y - 10 + hh / 2, z + Math.sin(a2) * off, rr, (hh / 2) / (rr * 0.82), 4, true);
    }
  }
  // the basalt sea cliffs on the strait: columnar stacks
  for (let i = 0; i < 180; i++) {
    const z = rng.range(1100, 3200), x = -2520 + rng.range(-120, 70) + (z - 2000) * -0.08;
    const c = M.coast(x, z);
    if (c < 2 || c > 150) continue;
    const r = rng.range(6, 21);
    boulderInto(inRingView(x, z, r) ? skip : arr, rng, x, M.groundY(x, z) * 0.7, z, r, rng.range(0.9, 1.5));
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(arr.pos, 3));
  g.setIndex(arr.n > 65535 ? new THREE.Uint32BufferAttribute(arr.idx, 1) : new THREE.Uint16BufferAttribute(arr.idx, 1));
  g.computeVertexNormals();
  g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(arr.n * 2), 2));
  g.computeBoundingSphere();
  return g;
}

// ---------------------------------------------------------------- pines and cypress on the hills (tree sprites from the shared atlas)
export function treeList(M) {
  const rng = new Rng(555);
  const list = [];
  const capsuleD = (x, z) => { const ax = -3252, az = 2129, bx = -2969, bz = 1970; const dx = bx - ax, dz = bz - az; const t = Math.min(1, Math.max(0, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz))); return Math.hypot(x - ax - t * dx, z - az - t * dz); };
  for (let i = 0; i < 26000; i++) {
    const near = rng.next() < 0.6;
    const x = near ? rng.range(-4300, -2400) : rng.range(-4500, 4200), z = near ? rng.range(600, 3400) : rng.range(-4800, 3400);
    const c = M.coast(x, z);
    if (c < 30) continue;
    const dens = M.cityDensity(x, z);
    if (dens > 0.2) continue;
    if (capsuleD(x, z) < 200 && M.island(x, z) === 1) continue;
    const y = M.groundY(x, z);
    if (y > 980) continue;
    // keep the transformer yard and its apron clear
    if (Math.hypot(x - YARD.x, z - YARD.z) < 120) continue;
    const e = 5, gx = (M.groundY(x + e, z) - M.groundY(x - e, z)) / (2 * e), gz = (M.groundY(x, z + e) - M.groundY(x, z - e)) / (2 * e);
    if (gx * gx + gz * gz > 0.28) continue;      // no trees hanging on cliffs
    if (hsh(x * 0.0091, z * 0.0091) < 0.28) continue;
    const big = rng.next() < 0.6;
    const hgt = big ? rng.range(14, 30) : rng.range(7, 13);
    const kind = rng.next();
    if (inRingView(x, z, hgt * 0.3)) continue;
    list.push([x, y - 0.5, z, hgt * 0.52, kind < 0.48 ? 0 : kind < 0.72 ? 1 : kind < 0.86 ? 2 : 3, hgt]);
  }
  return list;
}

// ---------------------------------------------------------------- our own conifers, painted: skirts of boughs in four flat tones
// r = tone, g = hue variation, same channels as the shared foliage atlas. Cells: 0 fir, 1 tall fir, 2 cypress, 3 wind-bent pine
export function makeConiferAtlas() {
  const S = 512, cols = 2, rows = 2;
  const c = document.createElement('canvas');
  c.width = cols * S; c.height = rows * S;
  const g = c.getContext('2d');
  const rng = new Rng(3317);
  const TV = [0.12, 0.37, 0.62, 0.87];
  const fill = (t, h) => { g.fillStyle = `rgb(${Math.round(TV[t] * 255)},${Math.round(h * 255)},0)`; };
  const skirt = (cx, top, bot, hw, p) => {
    const H = bot - top, pts = [];
    const steps = 6;
    for (let i = 0; i <= steps; i++) { const t = i / steps; pts.push([cx + hw * Math.pow(t, p) + (i && i < steps ? rng.range(-3, 3) : 0), top + H * t]); }
    const teeth = 6 + Math.floor(hw / 12);
    for (let i = 1; i < teeth; i++) { const t = 1 - i / teeth, up = i % 2 ? rng.range(0.14, 0.34) : rng.range(0, 0.06); pts.push([cx - hw + 2 * hw * t + rng.range(-3, 3), bot - H * up]); }
    for (let i = steps; i >= 1; i--) { const t = i / steps; pts.push([cx - hw * Math.pow(t, p) + (i < steps ? rng.range(-3, 3) : 0), top + H * t]); }
    const path = () => { g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath(); };
    const hue = rng.next() * 0.3;
    fill(0, hue); path(); g.fill();
    g.save(); path(); g.clip();
    const dabs = [];
    for (let i = 0; i < hw * H * 0.03; i++) {
      const x = cx + rng.range(-hw, hw), y = top + rng.next() * H;
      const s = -((x - cx) / hw) * 0.62 + ((bot - y) / H) * 0.32 - 0.04 + rng.range(-0.14, 0.14);
      if (s < 0.02) continue;
      dabs.push([x, y, s < 0.3 ? 1 : s < 0.6 ? 2 : 3, rng.range(6, 15)]);
    }
    dabs.sort((a, b) => a[2] - b[2]);
    for (const [x, y, t, r] of dabs) { fill(t, hue + rng.next() * 0.1); g.beginPath(); g.ellipse(x, y, r, r * 0.34, Math.PI / 2 - ((x - cx) / hw) * 0.9, 0, Math.PI * 2); g.fill(); }
    g.restore();
  };
  const tree = (idx, n, wb, wt, sway, p, trunk) => {
    const ox = (idx % cols) * S, oy = (rows - 1 - Math.floor(idx / cols)) * S;
    const cx0 = ox + S / 2, base = oy + S - 5, topY = oy + 18;
    fill(0, 0.1);
    g.beginPath(); g.moveTo(cx0 - trunk, base); g.lineTo(cx0 + trunk, base); g.lineTo(cx0 + sway * S, topY + S * 0.3); g.closePath(); g.fill();
    const low = oy + S * 0.87, tierH = (low - topY) / (n * 0.56 + 0.44);
    for (let k = 0; k < n; k++) {
      const f = n > 1 ? k / (n - 1) : 0;
      const bot = low - f * (low - topY - tierH);
      skirt(cx0 + sway * S * f, bot - tierH, bot, (wb + (wt - wb) * f) * S, p);
    }
  };
  tree(0, 6, 0.46, 0.15, 0, 1.25, 9);
  tree(1, 8, 0.33, 0.1, 0, 1.3, 8);
  tree(2, 1, 0.17, 0.17, 0, 0.55, 6);
  tree(3, 4, 0.47, 0.22, 0.09, 1.1, 11);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.NoColorSpace; t.premultiplyAlpha = false; t.anisotropy = 8;
  t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter;
  return { texture: t, cols, rows };
}

// ---------------------------------------------------------------- the harbour: lighthouses, moles, water stairs, boats, canal bridges
const col = (hex) => { const c = new THREE.Color(hex); return [c.r, c.g, c.b]; };
export function buildHarbour(M, lanterns) {
  const gb = new G3();
  const rng = new Rng(77012);
  const STONE = col('#8a8796'), STONED = col('#5e5c6e'), WHITEW = col('#d8d2c4'), INDIGO = col('#27357a'), HULLC = [col('#3a3548'), col('#5a2f2a'), col('#2c4a5a')];
  // a lighthouse: tapered stucco tower with indigo bands, gallery, glass lantern, a big gold light that dies with its block
  const house = (x, z, h) => {
    const y = M.groundY(x, z) - 1;
    const prof = [[7.4, -2], [6.6, 1.4], [5.6, h * 0.4], [4.2, h]];
    gb.lathe([x, y, z], [0, 1, 0], prof.map(([r, v]) => [r, v]), 26, WHITEW, 1);
    const rAt = (v) => { for (let i = 0; i < prof.length - 1; i++) { const [r0, v0] = prof[i], [r1, v1] = prof[i + 1]; if (v <= v1) return r0 + (r1 - r0) * Math.max(0, (v - v0) / (v1 - v0)); } return prof[prof.length - 1][0]; };
    for (const f of [0.3, 0.62]) { const b0 = f * h, b1 = b0 + h * 0.09; gb.lathe([x, y, z], [0, 1, 0], [[rAt(b0) + 0.14, b0], [rAt(b1) + 0.14, b1]], 26, INDIGO, 1); }
    for (const f of [0.12, 0.47, 0.8]) { const v = f * h; gb.lathe([x, y, z], [0, 1, 0], [[rAt(v) + 0.32, v], [rAt(v) + 0.32, v + 0.4]], 26, STONED, 1); }
    gb.lathe([x, y + h, z], [0, 1, 0], [[3.8, 0], [6.0, 0.2], [6.0, 1.1], [4.2, 1.2]], 20, STONED, 1);
    // gallery rail, then an open lamp room: mullions and a roof, so the light itself is seen
    for (let i = 0; i < 16; i++) { const a = (i / 16) * 2 * Math.PI, cx = x + Math.cos(a) * 5.75, cz = z + Math.sin(a) * 5.75; gb.beam([cx, y + h + 1.1, cz], [cx, y + h + 2.4, cz], 0.06, STONED, 0); }
    gb.lathe([x, y + h + 2.3, z], [0, 1, 0], [[5.8, 0], [5.8, 0.14]], 20, STONED, 0);
    gb.lathe([x, y + h + 1.1, z], [0, 1, 0], [[3.0, 0], [3.0, 0.9]], 16, STONED, 1);
    for (let i = 0; i < 8; i++) { const a = ((i + 0.5) / 8) * 2 * Math.PI, cx = x + Math.cos(a) * 2.8, cz = z + Math.sin(a) * 2.8; gb.beam([cx, y + h + 2.0, cz], [cx, y + h + 5.0, cz], 0.09, INDIGO, 0); }
    gb.lathe([x, y + h + 5.0, z], [0, 1, 0], [[3.4, 0], [2.3, 0.7], [0.5, 1.8], [0.02, 2.4]], 16, INDIGO, 1);
    const bk = blockOf(x, z);
    lanterns.push([x, y + h + 3.4, z, 5.5, bk.front, bk.jitter, 0.2]);
    // a door and three small windows on the side that looks at the bay
    const ba = Math.atan2(900 - z, -x), bx = Math.cos(ba), bz = Math.sin(ba);
    gb.box(x + bx * 6.75, y + 2.2, z + bz * 6.75, 2.3, 3.6, 0.5, Math.atan2(bx, bz), col('#2a1f26'), 0);
    for (const f of [0.26, 0.54, 0.76]) { const v = f * h, rr = rAt(v) + 0.25; lanterns.push([x + bx * rr, y + v, z + bz * rr, 0.55, bk.front, bk.jitter, 0.3]); }
  };
  // find a good spot on a cape: step inland from the given point until coast distance is > 12 m
  const onLand = (x0, z0, tx, tz) => { let x = x0, z = z0; for (let i = 0; i < 60 && M.coast(x, z) < 12; i++) { x += tx * 8; z += tz * 8; } return [x, z]; };
  // where a straight scan from the bay centre first meets land, on either side
  const shoreX = (z, sx) => { let last = M.coast(sx * 10, z); for (let x = 10; x < 1200; x += 3) { const c = M.coast(sx * x, z); if (last < 0 && c >= 0) return sx * x; last = c; } return null; };
  const headZ = (x) => { let last = M.coast(x, 400); for (let z = 400; z > -700; z -= 3) { const c = M.coast(x, z); if (last < 0 && c >= 0) return z; last = c; } return null; };
  const L1X = shoreX(1880, -1), L2 = onLand(1020, 2980, -0.1, -1), L3 = onLand(-180, -120, 0.1, -1), L4 = onLand(620, 2440, 1, 0);
  if (L1X !== null) house(L1X - 16, 1880, 44);
  house(L2[0], L2[1], 40); house(L3[0], L3[1], 32); house(L4[0], L4[1], 36);
  // stone moles reaching into the bay
  const moles = [];
  for (const [z, sx, L] of [[640, -1, 180], [760, 1, 200], [1500, -1, 240], [1500, 1, 260]]) { const x0 = shoreX(z, sx); if (x0 !== null) moles.push([x0 + sx * 8, z, sx < 0 ? 0 : Math.PI, L]); }
  { const z0 = headZ(140); if (z0 !== null) moles.push([140, z0 - 8, -Math.PI / 2, 170]); }
  for (const [x, z, ry, L] of moles) {
    const cs = Math.cos(ry), sn = Math.sin(ry);
    for (let i = 0; i < L / 12; i++) {
      const k = i * 12 + 6;
      gb.box(x + cs * k, -3, z - sn * k, 12.4, 5.2, 10, ry, STONE, 1);
    }
    const tx = x + cs * (L + 2), tz = z - sn * (L + 2);
    gb.box(tx, -3, tz, 16, 6.2, 16, ry, STONED, 1);
    gb.lathe([tx, 3.2, tz], [0, 1, 0], [[2.2, 0], [1.8, 11], [2.7, 11.5], [2.7, 11.9]], 14, WHITEW, 1);
    gb.lathe([tx, 3.2 + 4.2, tz], [0, 1, 0], [[2.12, 0], [2.04, 1.6]], 14, INDIGO, 1);
    for (let i = 0; i < 6; i++) { const a = ((i + 0.5) / 6) * 2 * Math.PI, cx = tx + Math.cos(a) * 2.0, cz = tz + Math.sin(a) * 2.0; gb.beam([cx, 3.2 + 11.9, cz], [cx, 3.2 + 14.2, cz], 0.07, INDIGO, 0); }
    gb.lathe([tx, 3.2 + 14.2, tz], [0, 1, 0], [[2.7, 0], [0.4, 1.3], [0.02, 1.7]], 14, INDIGO, 1);
    const bk = blockOf(tx, tz);
    lanterns.push([tx, 3.2 + 13.0, tz, 3.0, bk.front, bk.jitter, 0.1]);
    // lamp posts down the middle of the top, iron bollards on both edges
    for (let i = 1; i < L / 18; i++) { const k = i * 18, px = x + cs * k, pz = z - sn * k; gb.beam([px, 2.2, pz], [px, 5.0, pz], 0.07, STONED, 0); const b2 = blockOf(px, pz); lanterns.push([px, 5.2, pz, 0.9, b2.front, b2.jitter, rng.next()]); }
    for (let i = 1; i < L / 9; i++) { const k = i * 9 + 3; for (const e of [-5.4, 5.4]) gb.lathe([x + cs * k + sn * e, 2.2, z - sn * k + cs * e], [0, 1, 0], [[0.3, 0], [0.22, 0.6], [0.38, 0.72], [0.02, 0.84]], 8, col('#3a3640'), 0); }
  }
  // water stairs: broad flights of pale steps going down into the sea at intervals along the bay shore
  const shore = [];
  for (let z = -160; z < 2200; z += 3) for (const sx of [-1, 1]) {
    let lastC = M.coast(sx * 10, z);
    for (let x = 10; x < 900; x += 3) {
      const c = M.coast(sx * x, z);
      if (lastC < 0 && c >= 0) { shore.push([sx * x, z]); break; }
      lastC = c;
    }
  }
  for (let i = 0; i < shore.length; i += 20 + Math.floor(rng.next() * 40)) {
    const [x, z] = shore[i];
    const e = 6, gx = M.coast(x + e, z) - M.coast(x - e, z), gz = M.coast(x, z + e) - M.coast(x, z - e);
    const l = Math.hypot(gx, gz) || 1, nx = gx / l, nz = gz / l;     // inland normal
    const ry = Math.atan2(nx, nz);
    const w = rng.range(16, 30);
    for (let k = 0; k < 7; k++) {
      const px = x + nx * (k * 2.1 - 7), pz = z + nz * (k * 2.1 - 7);
      gb.box(px, -1.4 + k * 0.42, pz, w, 0.42, 2.3, ry, k < 2 ? STONED : STONE, 1);
    }
  }
  // the quay itself: lamp posts, stacked crates, barrels and bollards on the flat strip in front of the first houses
  const WOOD = col('#7a5638'), WOODD = col('#4d3628'), BARREL = col('#46404e'), IRON = col('#34303a');
  for (let i = 0; i < shore.length; i += 3 + Math.floor(rng.next() * 6)) {
    const [x0, z0] = shore[i];
    let x = x0, z = z0, ok = false;
    for (let s = 0; s < 16; s++) {
      const e = 4, gx = M.coast(x + e, z) - M.coast(x - e, z), gz = M.coast(x, z + e) - M.coast(x, z - e);
      const l = Math.hypot(gx, gz) || 1;
      if (M.coast(x, z) >= 10.5) { ok = true; break; }
      x += (gx / l) * 1.2; z += (gz / l) * 1.2;
    }
    if (!ok || M.coast(x, z) > 13.5) continue;
    const y = M.groundY(x, z);
    if (y < 1 || Math.abs(M.groundY(x + 2.5, z) - y) + Math.abs(M.groundY(x, z + 2.5) - y) > 1.0) continue;
    const e = 4, gx = M.coast(x + e, z) - M.coast(x - e, z), gz = M.coast(x, z + e) - M.coast(x, z - e);
    const l = Math.hypot(gx, gz) || 1, nx = gx / l, nz = gz / l, tx = nz, tz = -nx;
    const kind = rng.next(), bk = blockOf(x, z);
    if (kind < 0.36) {
      // lamp post with a short arm toward the water
      gb.beam([x, y, z], [x, y + 4.6, z], 0.07, IRON, 0);
      gb.beam([x, y + 4.5, z], [x - nx * 0.9, y + 4.7, z - nz * 0.9], 0.04, IRON, 0);
      lanterns.push([x - nx * 0.9, y + 4.35, z - nz * 0.9, 0.7, bk.front, bk.jitter, rng.next()]);
    } else if (kind < 0.62) {
      // crates, stacked and turned a little
      const n = 2 + Math.floor(rng.next() * 3), ry = rng.range(0, 1.57);
      for (let k = 0; k < n; k++) { const s = rng.range(0.9, 1.5), o = (k - n * 0.5) * 1.3; gb.box(x + tx * o, y, z + tz * o, s, s, s, ry + rng.range(-0.3, 0.3), rng.next() < 0.5 ? WOOD : WOODD, 1); if (rng.next() < 0.45) gb.box(x + tx * o, y + s, z + tz * o, s * 0.75, s * 0.75, s * 0.75, ry + rng.range(-0.4, 0.4), WOOD, 1); }
    } else if (kind < 0.8) {
      for (let k = 0; k < 4; k++) { const bxx = x + tx * (k - 1.5) * 1.1 + nx * rng.range(-0.4, 0.4), bzz = z + tz * (k - 1.5) * 1.1 + nz * rng.range(-0.4, 0.4); gb.lathe([bxx, y, bzz], [0, 1, 0], [[0.42, 0], [0.52, 0.65], [0.42, 1.3], [0.02, 1.32]], 10, BARREL, 1); }
    } else {
      for (let k = -1; k <= 1; k++) gb.lathe([x - nx * 3 + tx * k * 4, y, z - nz * 3 + tz * k * 4], [0, 1, 0], [[0.3, 0], [0.22, 0.6], [0.38, 0.72], [0.02, 0.84]], 8, IRON, 0);
    }
  }
  // moored boats: dark hulls in the harbour and on the canals, a lantern on each
  const boat = (x, z, ry) => {
    const L = rng.range(9, 14);
    gb.lathe([x, 0.2, z], [Math.sin(ry), 0, Math.cos(ry)], [[0.02, -L / 2], [1.2, -L * 0.3], [1.5, 0], [1.2, L * 0.3], [0.02, L / 2]], 10, rng.pick(HULLC), 0);
    gb.box(x, 0.9, z, 1.9, 0.14, L * 0.5, ry, col('#6a5a48'), 1);                                     // deck boards
    gb.beam([x, 0.9, z], [x, 2.9, z], 0.06, STONED, 0);                                                 // the lantern's pole
    const bk = blockOf(x, z);
    lanterns.push([x, 2.6, z, 0.7, bk.front, bk.jitter, rng.next()]);
  };
  for (let i = 0; i < 170; i++) {
    const a = rng.range(0, 2 * Math.PI), r = rng.range(0.55, 0.96);
    const x = Math.cos(a) * 590 * r, z = 900 + Math.sin(a) * 1050 * r;
    if (M.coast(x, z) > -5 || M.coast(x, z) < -80) continue;
    boat(x, z, a + rng.range(-0.3, 0.3));
  }
  for (const c of CANALS) {
    const L = Math.hypot(c.b[0] - c.a[0], c.b[1] - c.a[1]);
    const dx = (c.b[0] - c.a[0]) / L, dz = (c.b[1] - c.a[1]) / L;
    const ry = Math.atan2(dx, dz);
    for (let k = 90; k < L - 20; k += rng.range(120, 190)) {
      // an arched bridge deck across the canal
      const x = c.a[0] + dx * k, z = c.a[1] + dz * k;
      const span = c.w * 2 + 8;
      const by = Math.max(M.groundY(x + dz * span * 0.6, z - dx * span * 0.6), M.groundY(x - dz * span * 0.6, z + dx * span * 0.6));
      for (let s = -8; s <= 8; s++) {
        const o = (s * span) / 17, bx = x + Math.cos(ry) * o, bz = z - Math.sin(ry) * o, yy = by + (64 - s * s) * 0.048;
        gb.box(bx, yy - 0.7, bz, span / 17 + 0.5, 1.2, 8, ry, STONE, 1);
        for (const k of [-1, 1]) gb.box(bx + Math.sin(ry) * k * 3.9, yy + 0.5, bz + Math.cos(ry) * k * 3.9, span / 17 + 0.5, 0.8, 0.35, ry, STONED, 1);
      }
      for (const s2 of [-1, 1]) { const bk = blockOf(x + dx * s2 * 3, z + dz * s2 * 3), lx = x + dx * s2 * 3.9, lz = z + dz * s2 * 3.9, ly = by + 64 * 0.048; gb.beam([lx, ly + 0.8, lz], [lx, ly + 3.2, lz], 0.06, STONED, 0); lanterns.push([lx, ly + 3.4, lz, 0.9, bk.front, bk.jitter, rng.next()]); }
    }
    for (let k = 25; k < L - 30; k += rng.range(38, 90)) boat(c.a[0] + dx * k + rng.range(-3, 3) * dz, c.a[1] + dz * k, ry + rng.range(-0.15, 0.15) + Math.PI / 2 * 0);
  }
  return gb.build();
}

export { hsh };
