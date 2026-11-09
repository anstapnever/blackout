// MECH dept: modelling kit (adapted from the Colossus / Leviathan-archer kit, MIT). Units are metres. Ink ids 30..39.
import * as THREE from 'three';
import { ConvexGeometry } from '../vendor/addons/ConvexGeometry.js';
import { toCreasedNormals } from '../vendor/addons/BufferGeometryUtils.js';
import { Rng, deg, clamp } from './util.js';

export const V = THREE.Vector3;
export const v3 = (x, y, z) => new V(x, y, z);

export function creased(g, a) { g.scale(30, 30, 30); const r = toCreasedNormals(g, a); r.scale(1 / 30, 1 / 30, 1 / 30); return r; }

export function hull(points, crease = 30) { return creased(new ConvexGeometry(points), deg(crease)); }

// box with chamfered edges, optional taper (top size) and top offset
export function cbox(w, h, d, c = 0.2, o = {}) {
  const wt = o.wt ?? w, dt = o.dt ?? d, zt = o.zt ?? 0, zb = o.zb ?? 0, xt = o.xt ?? 0;
  const pts = [];
  for (const [y, ww, dd, zz, xx] of [[-h / 2, w, d, zb, 0], [h / 2, wt, dt, zt, xt]]) {
    const ys = Math.sign(y);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const x = sx * ww / 2 + xx, z = sz * dd / 2 + zz;
      pts.push(v3(x - sx * c, y, z - sz * c), v3(x, y - ys * c, z - sz * c), v3(x - sx * c, y - ys * c, z));
    }
  }
  return hull(pts, o.crease ?? 28);
}

export function superPts(rx, ry, rz, e, n, fn) {
  const pts = [], p = 2 / e;
  const f = (c) => Math.sign(c) * Math.pow(Math.abs(c), p);
  for (let i = 0; i <= n; i++) {
    const a = -Math.PI / 2 + (Math.PI * i) / n;
    for (let k = 0; k < n * 2; k++) {
      const b = -Math.PI + (Math.PI * k) / n;
      const q = v3(rx * f(Math.cos(a)) * f(Math.cos(b)), ry * f(Math.sin(a)), rz * f(Math.cos(a)) * f(Math.sin(b)));
      if (fn) fn(q);
      pts.push(q);
    }
  }
  return pts;
}

// cylinders with their own uv in metres (u around, v along): panel lines wrap instead of breaking at box-projection seams
export function cylUV(rt, rb, h, seg = 24, hs = 1, open = false) {
  const g = new THREE.CylinderGeometry(rt, rb, h, seg, hs, open);
  const uv = g.attributes.uv, r = (rt + rb) / 2;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * Math.PI * 2 * r, uv.getY(i) * h);
  g.userData.ownUV = true;
  return g;
}
export const cyl = (rt, rb, h, seg = 20) => cylUV(rt, rb, h, seg);
export const cylZ = (r, h, seg = 20) => cylUV(r, r, h, seg).rotateX(Math.PI / 2);
export const cylX = (r, h, seg = 20) => cylUV(r, r, h, seg).rotateZ(Math.PI / 2);
export const coneZ = (rt, rb, h, seg = 20) => cylUV(rt, rb, h, seg).rotateX(Math.PI / 2);   // +y of the cylinder (rt) goes to +z
export const ring = (r, tube, seg = 32, sides = 6) => new THREE.TorusGeometry(r, tube, sides, seg).rotateX(Math.PI / 2);
export const ringZ = (r, tube, seg = 32, sides = 6) => new THREE.TorusGeometry(r, tube, sides, seg);
export const ball = (r, w = 14, h = 10) => new THREE.SphereGeometry(r, w, h);

// Extruded silhouette: profile in XY, thickness along Z, centred.
export function extrude(pts, depth, bevel = 0.08, holes = [], crease = 30) {
  const sh = new THREE.Shape(pts.map((p) => new THREE.Vector2(p[0], p[1])));
  for (const h of holes) {
    const pth = new THREE.Path();
    if (h.r) pth.absarc(h.x, h.y, h.r, 0, Math.PI * 2, true);
    else pth.setFromPoints(h.map((p) => new THREE.Vector2(p[0], p[1])));
    sh.holes.push(pth);
  }
  const g = new THREE.ExtrudeGeometry(sh, { depth, bevelEnabled: bevel > 0, bevelSize: bevel, bevelThickness: bevel, bevelSegments: 1, curveSegments: 16 });
  g.translate(0, 0, -depth / 2);
  g.deleteAttribute('uv');
  return creased(g, deg(crease));
}

// A swept tube along world points. uv in metres.
export function sweep(points, r, seg = 180, sides = 8) {
  const c = new THREE.CatmullRomCurve3(points, false, 'centripetal');
  const g = new THREE.TubeGeometry(c, seg, r, sides, false);
  const uv = g.attributes.uv, L = c.getLength();
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * L, uv.getY(i) * Math.PI * 2 * r);
  g.userData.ownUV = true;
  return g;
}

// A sculpted body surface around the Y axis. secs: [y, rx, rz, cz = 0, e = 2.4, cx = 0]. u turns: 0 = +Z, .25 = +X.
export function crSample(arr, t) {
  const n = arr.length - 1, x = clamp(t) * n, i = Math.min(Math.floor(x), n - 1), f = x - i;
  const a = arr[Math.max(i - 1, 0)], b = arr[i], c = arr[i + 1], d = arr[Math.min(i + 2, n)];
  return b.map((_, k) => 0.5 * (2 * b[k] + (-a[k] + c[k]) * f + (2 * a[k] - 5 * b[k] + 4 * c[k] - d[k]) * f * f + (-a[k] + 3 * b[k] - 3 * c[k] + d[k]) * f * f * f));
}
export function tube(secs) {
  const S = secs.map((s) => [s[0], s[1], s[2], s[3] ?? 0, s[4] ?? 2.4, s[5] ?? 0]);
  const fr = (vv) => crSample(S, vv);
  return {
    p(u, vv, out = new V()) {
      const [y, rx, rz, cz, e, cx] = fr(vv);
      const a = u * Math.PI * 2, c = Math.cos(a), s = Math.sin(a), p = 2 / e;
      return out.set(cx + rx * Math.sign(s) * Math.pow(Math.abs(s), p), y, cz + rz * Math.sign(c) * Math.pow(Math.abs(c), p));
    },
    c(u, vv, out = new V()) { const [y, , , cz, , cx] = fr(vv); return out.set(cx, y, cz); },
  };
}
function orientTri(pos, i, q) {
  const ax = pos[i], ay = pos[i + 1], az = pos[i + 2], bx = pos[i + 3], by = pos[i + 4], bz = pos[i + 5], cx = pos[i + 6], cy = pos[i + 7], cz = pos[i + 8];
  const ux = bx - ax, uy = by - ay, uz = bz - az, wx = cx - ax, wy = cy - ay, wz = cz - az;
  const nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx;
  const mx = (ax + bx + cx) / 3 - q.x, my = (ay + by + cy) / 3 - q.y, mz = (az + bz + cz) / 3 - q.z;
  return nx * mx + ny * my + nz * mz < 0;
}
// Solid skin of a tube, closed: the usual body of a limb. uv in metres.
export function solid(S, o = {}) {
  const nu = Math.ceil((o.nu ?? 20) * 1.8), nv = Math.ceil((o.nv ?? 10) * 1.8), caps = o.caps ?? true;   // dense enough that close-ups show a curve, not facets
  const pos = [], uv = [];
  const p = (i, j) => S.p(i / nu, j / nv);
  let lenU = 0; { const a = S.p(0, 0.5), b = S.p(0.5 / nu, 0.5); lenU = a.distanceTo(b) * 2 * nu; }
  const lenV = S.p(0, 0).distanceTo(S.p(0, 1));
  for (let i = 0; i < nu; i++) for (let j = 0; j < nv; j++) {
    const a = p(i, j), b = p(i + 1, j), d = p(i + 1, j + 1), e = p(i, j + 1);
    pos.push(a.x, a.y, a.z, b.x, b.y, b.z, d.x, d.y, d.z, a.x, a.y, a.z, d.x, d.y, d.z, e.x, e.y, e.z);
    const u0 = (i / nu) * lenU, u1 = ((i + 1) / nu) * lenU, v0 = (j / nv) * lenV, v1 = ((j + 1) / nv) * lenV;
    uv.push(u0, v0, u1, v0, u1, v1, u0, v0, u1, v1, u0, v1);
  }
  if (caps) for (const j of [0, nv]) {
    const c = S.c(0, j / nv);
    for (let i = 0; i < nu; i++) { const a = p(i, j), b = p(i + 1, j); pos.push(c.x, c.y, c.z, a.x, a.y, a.z, b.x, b.y, b.z); uv.push(0, 0, 1, 0, 1, 1); }
  }
  for (let i = 0; i < pos.length; i += 9) {
    const qy = (pos[i + 1] + pos[i + 4] + pos[i + 7]) / 3, y0 = S.c(0, 0).y, y1 = S.c(0, 1).y;
    const ref = S.c(0, clamp((qy - y0) / (y1 - y0 + 1e-6)));
    if (orientTri(pos, i, ref)) {
      for (let k = 0; k < 3; k++) { const x = pos[i + 3 + k]; pos[i + 3 + k] = pos[i + 6 + k]; pos[i + 6 + k] = x; }
      const t = (i / 9) * 6;
      const a0 = uv[t + 2], a1 = uv[t + 3]; uv[t + 2] = uv[t + 4]; uv[t + 3] = uv[t + 5]; uv[t + 4] = a0; uv[t + 5] = a1;
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  const r = creased(g, deg(o.crease ?? 42));
  r.userData.ownUV = true;
  return r;
}

// One armour plate on surface S between 4 [u,v] corners, floating `lift` above the skin, thickness t, chamfer ch.
export function patch(S, c, o = {}) {
  const nu = Math.ceil((o.nu ?? 4) * 1.9), nv = Math.ceil((o.nv ?? 5) * 1.9), lift = o.lift ?? 0.02, t = o.t ?? 0.25, ch = o.ch ?? 0.12;
  const ridge = o.ridge ?? 0, crown = o.crown ?? 0;
  const uvAt = (s, r) => { const [a, b, d, e] = c; return [(1 - r) * ((1 - s) * a[0] + s * b[0]) + r * ((1 - s) * e[0] + s * d[0]), (1 - r) * ((1 - s) * a[1] + s * b[1]) + r * ((1 - s) * e[1] + s * d[1])]; };
  const _p = new V(), _c = new V(), _a = new V(), _b = new V();
  const P = (s, r, off) => {
    const [u, vv] = uvAt(s, r);
    const p = S.p(u, vv, new V());
    const e = 0.01;
    const [u1, v1] = uvAt(Math.min(s + e, 1), r), [u0, v0] = uvAt(Math.max(s - e, 0), r);
    const [u3, v3_] = uvAt(s, Math.min(r + e, 1)), [u2, v2] = uvAt(s, Math.max(r - e, 0));
    S.p(u1, v1, _a).sub(S.p(u0, v0, _p)); S.p(u3, v3_, _b).sub(S.p(u2, v2, _p));
    const n = _a.clone().cross(_b);
    S.c(u, vv, _c);
    const out = p.clone().sub(_c);
    if (n.lengthSq() < 1e-10) n.copy(out);
    n.normalize();
    if (n.dot(out) < 0) n.negate();
    const k = off + ridge * (1 - Math.abs(2 * s - 1)) + crown * Math.sin(Math.PI * s) * Math.sin(Math.PI * r);
    return p.addScaledVector(n, k);
  };
  const lenU = Math.max(S.p(...uvAt(0, 0.5)).distanceTo(S.p(...uvAt(1, 0.5))), 0.1);
  const lenV = Math.max(S.p(...uvAt(0.5, 0)).distanceTo(S.p(...uvAt(0.5, 1))), 0.1);
  const eU = Math.min(ch / lenU, 0.3), eV = Math.min(ch / lenV, 0.3);
  const pos = [], uv = [], edge = [];
  const uvOf = (s, r) => [s * lenU, r * lenV];
  const top = (i, j) => P(eU + (1 - 2 * eU) * (i / nu), eV + (1 - 2 * eV) * (j / nv), lift + t);
  const grid = [];
  for (let i = 0; i <= nu; i++) { grid[i] = []; for (let j = 0; j <= nv; j++) grid[i][j] = top(i, j); }
  const tri = (a, b, d, ua, ub, ud, e) => { pos.push(a.x, a.y, a.z, b.x, b.y, b.z, d.x, d.y, d.z); uv.push(...ua, ...ub, ...ud); edge.push(e, e, e); };
  const G_ = (i, j) => [grid[i][j], uvOf(i / nu, j / nv)];
  for (let i = 0; i < nu; i++) for (let j = 0; j < nv; j++) {
    const [a, ua] = G_(i, j), [b, ub] = G_(i + 1, j), [d, ud] = G_(i + 1, j + 1), [e, ue] = G_(i, j + 1);
    tri(a, b, d, ua, ub, ud, 0); tri(a, d, e, ua, ud, ue, 0);
  }
  const per = [];
  for (let i = 0; i < nu; i++) per.push([i, 0]);
  for (let j = 0; j < nv; j++) per.push([nu, j]);
  for (let i = nu; i > 0; i--) per.push([i, nv]);
  for (let j = nv; j > 0; j--) per.push([0, j]);
  const ringB = per.map(([i, j]) => P(i / nu, j / nv, lift + t * 0.45));
  const ringC = per.map(([i, j]) => P(i / nu, j / nv, lift - 0.1));
  for (let k = 0; k < per.length; k++) {
    const k2 = (k + 1) % per.length;
    const [i, j] = per[k], [i2, j2] = per[k2];
    const a = grid[i][j], b = grid[i2][j2], u1 = uvOf(i / nu, j / nv), u2 = uvOf(i2 / nu, j2 / nv);
    tri(a, b, ringB[k2], u1, u2, u2, 1); tri(a, ringB[k2], ringB[k], u1, u2, u1, 1);
    tri(ringB[k], ringB[k2], ringC[k2], u1, u2, u2, 0.35); tri(ringB[k], ringC[k2], ringC[k], u1, u2, u1, 0.35);
  }
  const mid = P(0.5, 0.5, lift);
  const [u, vv] = uvAt(0.5, 0.5);
  const below = mid.clone().lerp(S.c(u, vv), 0.5);
  for (let i = 0; i < pos.length; i += 9) {
    if (orientTri(pos, i, below)) {
      for (let k = 0; k < 3; k++) { const x = pos[i + 3 + k]; pos[i + 3 + k] = pos[i + 6 + k]; pos[i + 6 + k] = x; }
      const ti = (i / 9) * 6, a0 = uv[ti + 2], a1 = uv[ti + 3]; uv[ti + 2] = uv[ti + 4]; uv[ti + 3] = uv[ti + 5]; uv[ti + 4] = a0; uv[ti + 5] = a1;
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('aEdge', new THREE.Float32BufferAttribute(edge, 1));
  const r = creased(g, deg(o.crease ?? 30));
  r.userData.ownUV = true;
  return r;
}

// Overlapping armour bands around a tube surface: rows of [v0, v1], each row a ring of plates, later rows lie over earlier ones.
export function lames(k, bin, S, rows, styles, o = {}) {
  const n = o.sectors ?? 6, gap = o.gap ?? 0.006, u0 = o.u0 ?? 0, span = o.span ?? 1;
  rows.forEach(([v0, v1], r) => {
    for (let i = 0; i < n; i++) {
      const a = u0 + (i + (r % 2) * 0.5) * (span / n) + gap, b = a + span / n - 2 * gap;
      k.add(bin, patch(S, [[a, v0], [b, v0], [b, v1], [a, v1]], { nu: o.nu ?? 6, nv: o.nv ?? 3, t: o.t ?? 0.32, lift: (o.lift ?? 0.04) + r * (o.step ?? 0.05), crown: o.crown ?? 0.2, ch: o.ch ?? 0.16 }), styles[(i + r) % styles.length]);
    }
  });
}
// a chamfered bar from A to B, its width across local x, depth across the bend
export function seg(k, bin, A, B, w, d, st, o = {}) {
  const a = v3(...A), b = v3(...B), L = a.distanceTo(b);
  const y = b.clone().sub(a).normalize();
  const z = new V(1, 0, 0).cross(y).normalize(), x = y.clone().cross(z).normalize();
  const m = new THREE.Matrix4().makeBasis(x, y, z).setPosition(a.clone().add(b).multiplyScalar(0.5));
  return k.addM(bin, cbox(w, L, d, Math.min(0.3, w * 0.18), o), st, m);
}

// ----------------------------------------------------------------- merge kit
// style: { col, metal, detail, emis, wear, tone, pw, ph, riv } pw/ph = plate size (m), riv = rivet spacing (0 none).
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler();
export class Kit {
  constructor(seed = 1) { this.bins = new Map(); this.n = 0; this.rng = new Rng(seed); this._c = new THREE.Color(); this.tris = 0; }
  id() { this.n++; return 30 + ((this.n * 3) % 10); }
  add(bin, geo, st, pos = [0, 0, 0], rot = [0, 0, 0], o = {}) {
    if (Array.isArray(geo)) { const id = o.id ?? st.id ?? this.id(); for (const g of geo) this.add(bin, g, st, pos, rot, { ...o, id }); return id; }
    _q.setFromEuler(_e.set(deg(rot[0]), deg(rot[1]), deg(rot[2])));
    const m = new THREE.Matrix4().compose(new V(...pos), _q, o.scale ? new V(...o.scale) : new V(1, 1, 1));
    return this.addM(bin, geo, st, m, o);
  }
  addM(bin, geo, st, m, o = {}) {
    const id = o.id ?? st.id ?? this.id();
    const g = geo.index ? geo.toNonIndexed() : geo;
    if (!g.attributes.normal) g.computeVertexNormals();
    const P = g.attributes.position, N = g.attributes.normal, own = g.userData.ownUV || geo.userData.ownUV, UV = own ? g.attributes.uv : null, EDGE = g.attributes.aEdge;
    if (o.mirror) m = m.clone().premultiply(new THREE.Matrix4().makeScale(-1, 1, 1));
    const nm = new THREE.Matrix3().getNormalMatrix(m);
    let B = this.bins.get(bin);
    if (!B) { B = { pos: [], nor: [], uv: [], col: [], mat: [], edge: [], pan: [] }; this.bins.set(bin, B); }
    const c = this._c.set(st.col ?? '#c8ccd8');
    const jit = 1 + (st.tone ?? 0.05) * (this.rng.next() * 2 - 1);
    const cc = [c.r * jit, c.g * jit, c.b * jit];
    const flip = !!o.mirror;
    const a = new V(), b = new V(), d = new V(), na = new V(), nb = new V(), nd = new V();
    const ou = this.rng.next() * 37, ov = this.rng.next() * 37;
    const n = P.count;
    for (let i = 0; i + 2 < n; i += 3) {
      const i0 = i, i1 = flip ? i + 2 : i + 1, i2 = flip ? i + 1 : i + 2;
      a.fromBufferAttribute(P, i0).applyMatrix4(m); b.fromBufferAttribute(P, i1).applyMatrix4(m); d.fromBufferAttribute(P, i2).applyMatrix4(m);
      na.fromBufferAttribute(N, i0).applyMatrix3(nm).normalize(); nb.fromBufferAttribute(N, i1).applyMatrix3(nm).normalize(); nd.fromBufferAttribute(N, i2).applyMatrix3(nm).normalize();
      B.pos.push(a.x, a.y, a.z, b.x, b.y, b.z, d.x, d.y, d.z);
      B.nor.push(na.x, na.y, na.z, nb.x, nb.y, nb.z, nd.x, nd.y, nd.z);
      if (UV) {
        B.uv.push(UV.getX(i0) + ou, UV.getY(i0) + ov, UV.getX(i1) + ou, UV.getY(i1) + ov, UV.getX(i2) + ou, UV.getY(i2) + ov);
      } else {
        const ux = b.x - a.x, uy = b.y - a.y, uz = b.z - a.z, wx = d.x - a.x, wy = d.y - a.y, wz = d.z - a.z;
        const fx = Math.abs(uy * wz - uz * wy), fy = Math.abs(uz * wx - ux * wz), fz = Math.abs(ux * wy - uy * wx);
        const pr = fx >= fy && fx >= fz ? (q) => [q.z, q.y] : (fy >= fz ? (q) => [q.x, q.z] : (q) => [q.x, q.y]);
        for (const q of [a, b, d]) { const [s, r] = pr(q); B.uv.push(s + ou, r + ov); }
      }
      for (let k = 0; k < 3; k++) {
        B.col.push(cc[0], cc[1], cc[2]);
        B.mat.push(st.metal ?? 0.5, st.detail ?? 1, st.emis ?? 0, id);
        const idx = [i0, i1, i2][k];
        B.edge.push(EDGE ? EDGE.getX(idx) : 0, st.wear ?? 1, st.seam ?? 0);
        B.pan.push(st.pw ?? 3, st.ph ?? 2, st.riv ?? 0);
      }
    }
    this.tris += n / 3;
    return id;
  }
  // a straight member between two points: rectangular (w across x, h across y) and optionally I-shaped
  member(bin, a, b, w, h, st, o = {}) {
    const A = v3(...a), B = v3(...b), L = A.distanceTo(B);
    const z = B.clone().sub(A).normalize();
    const up = Math.abs(z.y) > 0.92 ? v3(1, 0, 0) : v3(0, 1, 0);
    const x = up.clone().cross(z).normalize(), y = z.clone().cross(x);
    const mid = A.clone().add(B).multiplyScalar(0.5);
    const m = new THREE.Matrix4().makeBasis(x, y, z).setPosition(mid);
    const id = o.id ?? st.id ?? this.id();
    if (o.ibeam) {
      const tf = Math.min(w, h) * 0.17;
      this.addM(bin, boxUV(w, tf, L), st, new THREE.Matrix4().multiplyMatrices(m, new THREE.Matrix4().makeTranslation(0, h / 2 - tf / 2, 0)), { id, ...o });
      this.addM(bin, boxUV(w, tf, L), st, new THREE.Matrix4().multiplyMatrices(m, new THREE.Matrix4().makeTranslation(0, -h / 2 + tf / 2, 0)), { id, ...o });
      this.addM(bin, boxUV(tf, h - tf * 2, L), st, m, { id, ...o });
    } else this.addM(bin, boxUV(w, h, L), st, m, { id, ...o });
    return id;
  }
  // Builds one mesh per bin and parents it under joints[name]
  finish(joints, material, meshes = []) {
    for (const [name, B] of this.bins) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(B.pos, 3));
      g.setAttribute('normal', new THREE.Float32BufferAttribute(B.nor, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(B.uv, 2));
      g.setAttribute('aCol', new THREE.Float32BufferAttribute(B.col, 3));
      g.setAttribute('aMat', new THREE.Float32BufferAttribute(B.mat, 4));
      g.setAttribute('aEx', new THREE.Float32BufferAttribute(B.edge, 3));
      g.setAttribute('aPan', new THREE.Float32BufferAttribute(B.pan, 3));
      const mesh = new THREE.Mesh(g, material);
      mesh.name = 'kit:' + name;
      mesh.frustumCulled = false;
      if (!joints[name]) throw new Error('kit: no joint ' + name);
      joints[name].add(mesh);
      meshes.push(mesh);
    }
    this.bins.clear();
    return meshes;
  }
}

// plain box with uv in metres on every face, so plate lines run along a member
export function boxUV(w, h, d) {
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.attributes.uv, n = g.attributes.normal;
  for (let i = 0; i < uv.count; i++) {
    const nx = Math.abs(n.getX(i)), ny = Math.abs(n.getY(i));
    const su = nx > 0.5 ? d : w, sv = ny > 0.5 ? d : h;
    uv.setXY(i, uv.getX(i) * su, uv.getY(i) * sv);
  }
  g.userData.ownUV = true;
  return g;
}
