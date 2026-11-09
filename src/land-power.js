// BLACKOUT, land department: steel lattice pylons, conductors with real catenary sag, the transformer yard.
import * as THREE from 'three';
import { Rng } from './util.js';
import { YARD } from './land-map.js';

const col = (hex) => { const c = new THREE.Color(hex); return [c.r, c.g, c.b]; };
const STEEL = col('#6a7188'), DARKSTEEL = col('#3c4258'), RUST = col('#7a5a48'), CONC = col('#79778a'), PORC = col('#d9d8e6'), CONCD = col('#555468');

export class G3 {
  constructor() { this.pos = []; this.nrm = []; this.s = []; this.idx = []; this.n = 0; }
  v(p, n, c, k) { this.pos.push(p[0], p[1], p[2]); this.nrm.push(n[0], n[1], n[2]); this.s.push(c[0], c[1], c[2], k); return this.n++; }
  // a beam (rect) from a to b, half thickness h; up hint for orientation
  beam(a, b, hw, c, k = 0, hh) {
    hh = hh ?? hw;
    const d = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    const L = d.length();
    if (L < 1e-3) return;
    d.divideScalar(L);
    const up = Math.abs(d.y) > 0.95 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
    const u = new THREE.Vector3().crossVectors(up, d).normalize(), w = new THREE.Vector3().crossVectors(d, u).normalize();
    const crn = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
    for (let i = 0; i < 4; i++) {
      const [s0, t0] = crn[i], [s1, t1] = crn[(i + 1) % 4];
      const nx = u.clone().multiplyScalar((s0 + s1) / 2).add(w.clone().multiplyScalar((t0 + t1) / 2)).normalize();
      const P0a = [a[0] + u.x * s0 * hw + w.x * t0 * hh, a[1] + u.y * s0 * hw + w.y * t0 * hh, a[2] + u.z * s0 * hw + w.z * t0 * hh];
      const P0b = [b[0] + u.x * s0 * hw + w.x * t0 * hh, b[1] + u.y * s0 * hw + w.y * t0 * hh, b[2] + u.z * s0 * hw + w.z * t0 * hh];
      const P1a = [a[0] + u.x * s1 * hw + w.x * t1 * hh, a[1] + u.y * s1 * hw + w.y * t1 * hh, a[2] + u.z * s1 * hw + w.z * t1 * hh];
      const P1b = [b[0] + u.x * s1 * hw + w.x * t1 * hh, b[1] + u.y * s1 * hw + w.y * t1 * hh, b[2] + u.z * s1 * hw + w.z * t1 * hh];
      const n = [nx.x, nx.y, nx.z];
      const i0 = this.v(P0a, n, c, k), i1 = this.v(P1a, n, c, k), i2 = this.v(P1b, n, c, k), i3 = this.v(P0b, n, c, k);
      this.idx.push(i0, i1, i2, i0, i2, i3);
    }
  }
  // lathe around a vertical (or arbitrary) axis
  lathe(a, axis, prof, seg, c, k) {
    const d = new THREE.Vector3(...axis).normalize();
    const up = Math.abs(d.y) > 0.95 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
    const u = new THREE.Vector3().crossVectors(up, d).normalize(), w = new THREE.Vector3().crossVectors(d, u);
    const base = this.n;
    for (let j = 0; j < prof.length; j++) {
      const [r, y] = prof[j];
      const pp = prof[Math.max(0, j - 1)], pn = prof[Math.min(prof.length - 1, j + 1)];
      let nr = pn[1] - pp[1], ny = -(pn[0] - pp[0]);
      const l = Math.hypot(nr, ny) || 1; nr /= l; ny /= l;
      for (let i = 0; i <= seg; i++) {
        const t = (i / seg) * Math.PI * 2, cs = Math.cos(t), sn = Math.sin(t);
        const rx = u.x * cs + w.x * sn, ry = u.y * cs + w.y * sn, rz = u.z * cs + w.z * sn;
        this.v([a[0] + rx * r + d.x * y, a[1] + ry * r + d.y * y, a[2] + rz * r + d.z * y], [rx * nr + d.x * ny, ry * nr + d.y * ny, rz * nr + d.z * ny], c, k);
      }
    }
    for (let j = 0; j < prof.length - 1; j++) for (let i = 0; i < seg; i++) {
      const a0 = base + j * (seg + 1) + i, b0 = a0 + seg + 1;
      this.idx.push(a0, b0, a0 + 1, a0 + 1, b0, b0 + 1);
    }
  }
  box(cx, y0, cz, w, h, d, ry, c, k) {
    const cs = Math.cos(ry), sn = Math.sin(ry);
    const P = (lx, ly, lz) => [cx + lx * cs + lz * sn, y0 + ly, cz - lx * sn + lz * cs];
    const hw = w / 2, hd = d / 2;
    const faces = [
      [P(-hw, 0, hd), P(hw, 0, hd), P(hw, h, hd), P(-hw, h, hd)], [P(hw, 0, -hd), P(-hw, 0, -hd), P(-hw, h, -hd), P(hw, h, -hd)],
      [P(hw, 0, hd), P(hw, 0, -hd), P(hw, h, -hd), P(hw, h, hd)], [P(-hw, 0, -hd), P(-hw, 0, hd), P(-hw, h, hd), P(-hw, h, -hd)],
      [P(-hw, h, hd), P(hw, h, hd), P(hw, h, -hd), P(-hw, h, -hd)],
    ];
    for (const f of faces) {
      const a = new THREE.Vector3(f[1][0] - f[0][0], f[1][1] - f[0][1], f[1][2] - f[0][2]), b = new THREE.Vector3(f[3][0] - f[0][0], f[3][1] - f[0][1], f[3][2] - f[0][2]);
      const n = a.cross(b).normalize();
      const nn = [n.x, n.y, n.z];
      const i0 = this.v(f[0], nn, c, k), i1 = this.v(f[1], nn, c, k), i2 = this.v(f[2], nn, c, k), i3 = this.v(f[3], nn, c, k);
      this.idx.push(i0, i1, i2, i0, i2, i3);
    }
  }
  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nrm, 3));
    g.setAttribute('aS', new THREE.Float32BufferAttribute(this.s, 4));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(this.n * 2), 2));
    g.setIndex(this.n > 65535 ? new THREE.Uint32BufferAttribute(this.idx, 1) : new THREE.Uint16BufferAttribute(this.idx, 1));
    g.computeBoundingSphere();
    return g;
  }
}

// One lattice tower. Returns attachment points (world) for the three-phase conductors, each side: [ [x,y,z]..6 ]
function pylon(gb, x, y0, z, H, ry, o = {}) {
  const cs = Math.cos(ry), sn = Math.sin(ry);
  const W = (lx, ly, lz) => [x + lx * cs + lz * sn, y0 + ly, z - lx * sn + lz * cs];
  const fine = o.fine ?? false;
  const baseW = H * 0.24, topW = H * 0.05;
  const nSec = 8;
  const wAt = (t) => baseW + (topW - baseW) * Math.pow(t, 0.72);
  const hA = (fine ? 0.23 : 0.28) * (H / 60), hB = (fine ? 0.1 : 0.14) * (H / 60);
  // footing blocks
  for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
    const q = W(sx * baseW / 2, 0, sz * baseW / 2);
    gb.box(q[0], y0 - 1.2, q[2], baseW * 0.13, 1.9, baseW * 0.13, ry, CONC, 1);
  }
  const corner = (t, sx, sz) => { const hw = wAt(t) / 2; return W(sx * hw, t * H, sz * hw); };
  for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
    for (let k = 0; k < nSec; k++) gb.beam(corner(k / nSec, sx, sz), corner((k + 1) / nSec, sx, sz), hA * (1 - 0.4 * k / nSec), STEEL, 0);
  }
  const panel = (sxa, sza, sxb, szb) => {
    for (let k = 0; k < nSec; k++) {
      const a0 = corner(k / nSec, sxa, sza), a1 = corner((k + 1) / nSec, sxa, sza), b0 = corner(k / nSec, sxb, szb), b1 = corner((k + 1) / nSec, sxb, szb);
      gb.beam(a0, b1, hB, DARKSTEEL, 0);
      gb.beam(b0, a1, hB, DARKSTEEL, 0);
      gb.beam(a1, b1, hB, DARKSTEEL, 0);
      if (fine) { const m = [(a0[0] + b0[0]) / 2, (a0[1] + b0[1]) / 2, (a0[2] + b0[2]) / 2], m2 = [(a1[0] + b1[0]) / 2, (a1[1] + b1[1]) / 2, (a1[2] + b1[2]) / 2]; gb.beam(m, m2, hB * 0.6, DARKSTEEL, 0); }
    }
  };
  panel(-1, -1, 1, -1); panel(1, -1, 1, 1); panel(1, 1, -1, 1); panel(-1, 1, -1, -1);
  // cross-arms (three tiers), insulator strings, conductor attachment
  const tiers = [[0.78, 1.0], [0.88, 0.8], [0.97, 0.62]];
  const attach = [];
  for (const [t, wide] of tiers) {
    const yy = t * H;
    const armL = H * 0.22 * wide;
    const hw = wAt(t) / 2;
    for (const s of [-1, 1]) {
      const root = W(s * hw, yy, 0), rootUp = W(s * hw, yy + 2.4 * H / 60, 0), tip = W(s * armL, yy + 0.3, 0);
      gb.beam(root, tip, hA * 0.85, STEEL, 0);
      gb.beam(rootUp, tip, hB * 1.3, STEEL, 0);
      gb.beam(root, W(s * hw * 1.4, yy + 0.2, H * 0.03), hB, DARKSTEEL, 0);
      // insulator string: ribbed porcelain, hanging
      const strLen = 3.1 * H / 60;
      const prof = [];
      const ribs = fineRibs(fine);
      for (let r = 0; r < ribs; r++) { const u = r / ribs; prof.push([0.18, u * strLen], [0.42, (u + 0.3 / ribs) * strLen], [0.15, (u + 0.6 / ribs) * strLen]); }
      gb.lathe(tip, [0, -1, 0], prof.map(([a, b]) => [a * (H / 60), b]), fine ? 10 : 6, PORC, 2);
      const end = [tip[0], tip[1] - strLen, tip[2]];
      attach.push(end);
    }
  }
  // cap
  gb.beam(W(0, H, 0), W(0, H * 1.05, 0), hB, DARKSTEEL, 0);
  return attach;
}
function fineRibs(fine) { return fine ? 6 : 3; }

// Catenary between two points: sag metres at the middle, n segments
export function catenary(a, b, sag, n) {
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const x = a[0] + (b[0] - a[0]) * t, z = a[2] + (b[2] - a[2]) * t;
    const y = a[1] + (b[1] - a[1]) * t - sag * (1 - Math.pow(2 * t - 1, 2));
    pts.push(new THREE.Vector3(x, y, z));
  }
  return pts;
}

// Lines of towers: returns geometry, wire segments, and named cable runs
export function buildPower(ctx, M) {
  const gb = new G3();
  const wires = [];
  const runs = {};
  const rng = new Rng(9001);
  const groundY = M.groundY;

  // towers along a list of [x, z]; `fine` = hero-detail lattice near the camera of s01b
  function line(name, pts, H, spec = {}) {
    const towers = [];
    for (let i = 0; i < pts.length; i++) {
      const [x, z] = pts[i];
      const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
      const ry = Math.atan2(-(b[1] - a[1]), b[0] - a[0]) + Math.PI / 2;
      const y0 = groundY(x, z);
      const fine = spec.fine && (spec.fine === true || spec.fine.includes(i));
      const att = pylon(gb, x, y0, z, H * (spec.hs ? spec.hs[i % spec.hs.length] : 1), ry, { fine });
      towers.push({ x, y0, z, ry, att });
    }
    const pairs = [];
    for (let i = 0; i < towers.length - 1; i++) {
      const A = towers[i], B = towers[i + 1];
      const L = Math.hypot(B.x - A.x, B.z - A.z);
      for (let c = 0; c < 6; c++) {
        const pa = A.att[c];
        const pb = B.att[c];
        const sag = spec.sag ?? L * 0.05;
        const seg = Math.max(16, Math.round(L / 16));
        const cat = catenary(pa, pb, sag * (0.95 + rng.next() * 0.1), seg);
        for (let k = 0; k < cat.length - 1; k++) wires.push([cat[k], cat[k + 1]]);
        if (c === 2) pairs.push(cat);
      }
    }
    // one continuous cable for FX: middle conductor, joined span by span
    const run = [];
    pairs.forEach((cat, i) => { for (let k = i === 0 ? 0 : 1; k < cat.length; k++) run.push(cat[k]); });
    runs[name] = run;
    return towers;
  }

  // ---- the hook line: over the strait on rock islets, up the ridge to the gun
  const towersHook = line('hook', [[-1205, 1455], [-1560, 1560], [-1880, 1695], [-2170, 1815], [-2462, 1900], [-2505, 2085], [-2565, 2255], [-2700, 2330], [-2830, 2335], [-2935, 2295], [-2965, 2215], [-2930, 2150]], 72, { fine: [1, 2], hs: [1], sag: 13 });
  // ---- feeder along the west shore of the city up onto the strait line
  line('feedW', [[-1040, 300], [-1090, 700], [-1150, 1060], [-1205, 1455]], 58, { sag: 11 });
  // ---- north line over the hills into the ridge
  line('north', [[-1900, -700], [-2240, -780], [-2720, -380], [-3080, 200], [-3280, 700], [-3340, 1280], [-3250, 1720], [-3050, 1960]].slice(0, 7), 66, { sag: 16 });
  // ---- city trunk lines climbing the hills (in clear lines)
  line('east1', [[1300, 1500], [1500, 1100], [1660, 640], [1760, 140], [1820, -420], [1760, -960], [1560, -1540]], 62, { sag: 13 });
  line('east2', [[1560, -1540], [980, -1740], [340, -1900], [-280, -2000], [-940, -1900], [-1500, -1500], [-1900, -700]], 62, { sag: 14 });
  line('hills', [[1000, 2200], [1300, 1500]], 62, { sag: 12 });
  // ---- the yard's own line: from the hook feed into the yard, then up the shelf
  const yardIn = [[YARD.x + 78, YARD.z - 42], [YARD.x - 60, YARD.z + 30]];
  const towersYard = line('yard', [[-2462, 1900], [YARD.x + 86, YARD.z - 44]], 44, { sag: 7 });
  const surge = line('surge', [[YARD.x - 72, YARD.z + 34], [-2885, 2060], [-2940, 2118]], 40, { sag: 4.5 });
  void towersHook; void towersYard; void surge; void yardIn;

  // ---- the transformer yard (s04): a pad on the ridge flank, tanks with radiators, bushings like porcelain columns
  const yard = new G3();
  const gYard = (x, z) => groundY(x, z);
  const yy = YARD.y;
  yard.box(YARD.x, yy - 0.5, YARD.z, YARD.w, 0.6, YARD.d, YARD.ry, CONC, 1);
  const cR = Math.cos(YARD.ry), sR = Math.sin(YARD.ry);
  const WP = (lx, lz) => [YARD.x + lx * cR + lz * sR, YARD.z - lx * sR + lz * cR];
  const coils = [];
  const tanks = [[-46, -18], [-46, 18], [-12, -18], [-12, 18], [22, -18], [22, 18]];
  for (let i = 0; i < tanks.length; i++) {
    const [lx, lz] = tanks[i];
    const [cx, cz] = WP(lx, lz);
    const tw = 15, td = 9.2, th = 9.5;
    yard.box(cx, yy, cz, tw + 4, 0.8, td + 4, YARD.ry, CONCD, 1);
    yard.box(cx, yy + 0.8, cz, tw, th, td, YARD.ry, DARKSTEEL, 0);
    yard.box(cx, yy + 0.8 + th, cz, tw + 0.5, 0.5, td + 0.5, YARD.ry, STEEL, 0);
    // radiator fin banks on both long sides
    for (const s of [-1, 1]) {
      for (let f = -6; f <= 6; f++) {
        const [fx, fz] = WP(lx + f * 1.05, lz + s * (td / 2 + 1.4));
        yard.box(fx, yy + 1.1, fz, 0.32, th - 1.4, 2.4, YARD.ry, RUST, 0);
      }
    }
    // conservator drum on top
    const [dx, dz] = WP(lx, lz);
    const drumY = yy + 0.8 + th + 2.2;
    yard.lathe([dx - 6 * cR, drumY, dz + 6 * sR], [cR, 0, -sR], [[0, 0], [1.1, 0], [1.2, 0.3], [1.2, 11.4], [1.1, 11.7], [0, 11.7]], 12, STEEL, 0);
    for (const q of [-4, 4]) { const [qx, qz] = WP(lx + q, lz); yard.box(qx, yy + 0.8 + th + 0.5, qz, 0.7, 1.3, 0.7, YARD.ry, DARKSTEEL, 0); }
    // three tall bushings on each tank: ribbed porcelain with a cap and a live bar
    for (const b of [-5, 0, 5]) {
      const [bx, bz] = WP(lx + b, lz);
      const baseY = yy + 0.8 + th + 0.5;
      const prof = [[1.0, 0], [0.7, 0.4]];
      const ribs = 13;
      for (let r = 0; r < ribs; r++) { const u = r / ribs; prof.push([0.52, 0.5 + u * 7.2], [0.95, 0.5 + (u + 0.34 / ribs) * 7.2], [0.5, 0.5 + (u + 0.68 / ribs) * 7.2]); }
      prof.push([0.5, 7.8], [0.28, 8.0], [0.45, 8.3], [0, 8.5]);
      yard.lathe([bx, baseY, bz], [0, 1, 0], prof, 16, PORC, 2);
      coils.push(new THREE.Vector3(bx, baseY + 8.5, bz));
    }
    // red valves, oil pipe
    const [vx, vz] = WP(lx + 8, lz + td / 2 + 0.2);
    yard.lathe([vx, yy + 2.0, vz], [0, 1, 0], [[0.36, 0], [0.36, 0.7]], 10, col('#9a3a2c'), 0);
  }
  // steel gantry above the tanks with catwalks and bus bars
  const gantryL = [-66, -30, 6, 42, 70];
  for (let i = 0; i < gantryL.length; i++) {
    const lx = gantryL[i];
    for (const s of [-1, 1]) { const [px, pz] = WP(lx, s * 34); yard.beam([px, yy, pz], [px, yy + 31, pz], 0.45, STEEL, 0); yard.box(px, yy - 0.2, pz, 1.8, 0.6, 1.8, YARD.ry, CONC, 1); }
    const [a0x, a0z] = WP(lx, -34), [a1x, a1z] = WP(lx, 34);
    yard.beam([a0x, yy + 31, a0z], [a1x, yy + 31, a1z], 0.5, STEEL, 0);
    yard.beam([a0x, yy + 24, a0z], [a1x, yy + 24, a1z], 0.32, DARKSTEEL, 0);
    for (let q = -3; q <= 3; q++) { const [m0x, m0z] = WP(lx, q * 8), [m1x, m1z] = WP(lx + 0.0, (q + 1) * 8); if (q < 3) yard.beam([m0x, yy + 24, m0z], [m1x, yy + 31, m1z], 0.16, DARKSTEEL, 0); }
  }
  // bus bars along the gantry, porcelain standoffs, and busbar taps down to the bushings
  const busRuns = [];
  for (const lz of [-22, -11, 11, 22]) {
    const a = WP(-72, lz), b = WP(76, lz);
    const y = yy + 26;
    yard.beam([a[0], y, a[1]], [b[0], y, b[1]], 0.3, col('#b58e4a'), 0);
    busRuns.push([[a[0], y, a[1]], [b[0], y, b[1]]]);
  }
  coils.forEach((c, i) => {
    const near = WP(tanks[Math.floor(i / 3)][0] + [-5, 0, 5][i % 3], tanks[Math.floor(i / 3)][1] < 0 ? -22 : 22);
    const m = [near[0], yy + 26, near[1]];
    const cat = catenary([c.x, c.y, c.z], m, 1.1, 8);
    for (let k = 0; k < cat.length - 1; k++) wires.push([cat[k], cat[k + 1]]);
  });
  // chain-link fence posts and wire around the yard, warning placards (bolt on yellow, no text)
  const fence = [];
  for (let i = 0; i <= 28; i++) fence.push(WP(-YARD.w / 2 + 2 + (i / 28) * (YARD.w - 4), YARD.d / 2 - 2));
  for (let i = 0; i <= 28; i++) fence.push(WP(-YARD.w / 2 + 2 + (i / 28) * (YARD.w - 4), -YARD.d / 2 + 2));
  for (const [fx, fz] of fence) { yard.beam([fx, yy, fz], [fx, yy + 3.6, fz], 0.06, STEEL, 0); }
  const placards = [WP(30, YARD.d / 2 - 2.1), WP(-30, YARD.d / 2 - 2.1), WP(30, -YARD.d / 2 + 2.1), WP(-30, -YARD.d / 2 + 2.1)];
  for (const [fx, fz] of placards) { yard.box(fx, yy + 1.2, fz, 2.6, 1.8, 0.08, YARD.ry, col('#c79a1e'), 3); }

  return { geo: gb.build(), yardGeo: yard.build(), wires, runs, coils };
}

// screen-space ribbons for all conductors
export function wireGeometry(wires) {
  const pos = [], oth = [], side = [], idx = [];
  let n = 0;
  for (const [p0, p1] of wires) {
    for (const [p, o, s] of [[p0, p1, -1], [p0, p1, 1], [p1, p0, 1], [p1, p0, -1]]) { pos.push(p.x, p.y, p.z); oth.push(o.x, o.y, o.z); side.push(s); }
    idx.push(n, n + 1, n + 2, n, n + 2, n + 3); n += 4;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aOther', new THREE.Float32BufferAttribute(oth, 3));
  g.setAttribute('aSide', new THREE.Float32BufferAttribute(side, 1));
  g.setIndex(new THREE.Uint32BufferAttribute(idx, 1));
  return g;
}
