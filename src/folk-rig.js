import * as THREE from 'three';
import { furMaterial, eyeMaterial, headMaterial } from './folk-mat.js';
import { headSDF, meshSDF, surfFn, eyePatch, deriveHead } from './folk-head.js';
import { paint, hex, mixc, sstep, deform, ell, limb, garment, tube, tuft, merge, torus } from './folk-geo.js';

// One anthropomorphic animal, built from rigid parts in a pivot hierarchy (no skinning).
//   root -> hips -> [pelvis, tail, thighL/R -> shin -> foot] , chest -> [torso, clothes, shoulderL/R -> fore -> hand, neck -> head]
// Poses are applied by setPose(): spine/neck/head FK, legs by two-bone IK to world foot targets,
// arms by FK or IK to world hand targets. Faces: eye lids, look, pupil, brows, mouth, ears, tail.

const v3 = (x, y, z) => new THREE.Vector3(x, y, z);
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _d = new THREE.Vector3(), _e = new THREE.Vector3();
const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _m = new THREE.Matrix4();
const NEG_Y = v3(0, -1, 0);

// ------------------------------------------------------------------ proportions
export const DIMS = {
  // long body, short legs, low centre of mass
  otter: { footH: 0.05, footL: 0.16, footW: 0.07, shin: 0.25, thigh: 0.26, legR: [0.085, 0.06, 0.062, 0.04], hipW: 0.085,
    pelvis: [0.15, 0.12, 0.12], abd: 0.14, spine: 0.13, chest: [0.135, 0.16, 0.105], chestCY: 0.1, neckY: 0.21, neckL: 0.03, neckR: [0.9, 1.0], headR: 0.135,
    sh: [0.155, 0.22], upper: 0.23, fore: 0.2, armR: [0.05, 0.04, 0.042, 0.032], hand: 0.06 },
  // long legged, deep chested, big paws
  leopard: { footH: 0.05, footL: 0.18, footW: 0.075, shin: 0.31, thigh: 0.31, legR: [0.085, 0.06, 0.06, 0.042], hipW: 0.09,
    pelvis: [0.14, 0.11, 0.11], abd: 0.12, spine: 0.13, chest: [0.13, 0.17, 0.11], chestCY: 0.1, neckY: 0.215, neckL: 0.03, neckR: [0.8, 0.92], headR: 0.13,
    sh: [0.15, 0.21], upper: 0.27, fore: 0.24, armR: [0.052, 0.042, 0.046, 0.036], hand: 0.072 },
  // old, heavy, short legged, wide
  chief: { footH: 0.07, footL: 0.2, footW: 0.09, shin: 0.29, thigh: 0.3, legR: [0.12, 0.085, 0.085, 0.06], hipW: 0.13,
    pelvis: [0.24, 0.17, 0.18], abd: 0.16, spine: 0.16, chest: [0.22, 0.24, 0.18], chestCY: 0.14, neckY: 0.262, neckL: 0.04, neckR: [0.92, 1.02], headR: 0.17,
    sh: [0.26, 0.26], upper: 0.28, fore: 0.26, armR: [0.075, 0.06, 0.06, 0.045], hand: 0.085 },
  kid: { footH: 0.05, footL: 0.12, footW: 0.055, shin: 0.2, thigh: 0.205, legR: [0.062, 0.047, 0.049, 0.034], hipW: 0.066,
    pelvis: [0.122, 0.1, 0.1], spine: 0.1, chest: [0.122, 0.15, 0.1], chestCY: 0.1, neckY: 0.2, neckL: 0.05, headR: 0.186,
    sh: [0.112, 0.155], upper: 0.15, fore: 0.135, armR: [0.042, 0.034, 0.036, 0.028], hand: 0.042 },
  adult: { footH: 0.07, footL: 0.17, footW: 0.075, shin: 0.39, thigh: 0.4, legR: [0.085, 0.065, 0.062, 0.045], hipW: 0.1,
    pelvis: [0.19, 0.15, 0.15], spine: 0.16, chest: [0.19, 0.25, 0.15], chestCY: 0.16, neckY: 0.35, neckL: 0.1, headR: 0.19,
    sh: [0.175, 0.27], upper: 0.29, fore: 0.26, armR: [0.06, 0.048, 0.048, 0.038], hand: 0.06 },
  tot: { footH: 0.04, footL: 0.09, footW: 0.045, shin: 0.13, thigh: 0.13, legR: [0.045, 0.035, 0.035, 0.027], hipW: 0.05,
    pelvis: [0.1, 0.085, 0.085], spine: 0.07, chest: [0.1, 0.11, 0.085], chestCY: 0.07, neckY: 0.15, neckL: 0.035, headR: 0.15,
    sh: [0.09, 0.115], upper: 0.1, fore: 0.09, armR: [0.032, 0.026, 0.027, 0.022], hand: 0.035 },
};
export function hipHeight(D) { return D.footH + D.shin + D.thigh - 0.012; }

// material cache shared by all characters (keyed by colour + id + flags)
const MATS = new Map();
const lerp2 = (a, b, t) => a + (b - a) * t;
function fm(color, id, o = {}) {
  const key = `${color}|${id}|${o.fur ?? 1}|${o.gloss ?? 0}|${o.rim ?? 1}|${o.side ?? 0}`;
  if (!MATS.has(key)) MATS.set(key, furMaterial({ color, id, ...o }));
  return MATS.get(key);
}

let SEQ = 0;
export function buildCritter(spec) {
  const D = { ...DIMS[spec.kind ?? 'kid'], ...(spec.dims || {}) };
  const S = spec;
  const F = S.fur;
  const C = (h) => hex(h);
  const base = C(F.base), light = C(F.light ?? F.base), dark = C(F.dark ?? F.base), inner = C(F.inner ?? F.light ?? F.base);
  const HI = spec.detail ?? 1;     // 1 hero detail, 0 crowd
  const segs = (n) => Math.max(8, Math.round(n * (HI ? 1 : 0.55)));
  const name = spec.name ?? `folk${SEQ++}`;
  const parts = [];
  const contactParts = new Set();
  const mk = (geo, mat, parent, nm, contact) => {
    const m = new THREE.Mesh(geo, mat);
    m.name = `${name}.${nm}`;
    parent.add(m); parts.push(m);
    if (contact) contactParts.add(m);
    return m;
  };
  const grp = (parent, x = 0, y = 0, z = 0, nm = 'g') => { const g = new THREE.Group(); g.name = `${name}.${nm}`; g.position.set(x, y, z); parent.add(g); return g; };

  const root = new THREE.Group(); root.name = name;
  const hipY = hipHeight(D);
  const hips = grp(root, 0, hipY, 0, 'hips');
  const abd = grp(hips, 0, D.abd ?? 0, 0, 'abd');                  // waist: the spine bends in two places
  const chest = grp(abd, 0, D.spine, 0, 'chest');
  const neck = grp(chest, 0, D.neckY, 0, 'neck');
  const head = grp(neck, 0, D.neckL, 0, 'head');

  const cloth = S.cloth || {};
  const pants = cloth.pants ? C(cloth.pants) : null;
  // ---------------------------------------------------------------- pelvis + legs
  {
    const [rx, ry, rz] = D.pelvis;
    const g = paint(ell(rx, ry, rz, segs(24), segs(16)), (v) => pants ? pants : (cloth.short ? C(cloth.short) : (v.z > 0 && v.y < 0 ? light : base)));
    g.translate(0, -ry * 0.15, 0);
    mk(g, fm('#ffffff', 48), hips, 'pelvis', true);
  }
  const legs = {};
  for (const side of [1, -1]) {
    const L = side === 1 ? 'L' : 'R';
    const thigh = grp(hips, side * D.hipW, -0.02, 0, 'thigh' + L);
    const [r0, r1, r2, r3] = D.legR;
    const shortsTo = cloth.shorts ?? 0.55;     // fraction of the thigh covered by shorts (from the top)
    const tg = paint(limb(D.thigh, r0, r1, segs(18), { bulge: r0 * 0.16 }), (v) => pants ? pants : (cloth.short ? (v.y > -D.thigh * shortsTo ? C(cloth.short) : base) : base));
    mk(tg, fm('#ffffff', 49), thigh, 'thigh' + L, true);
    const knee = grp(thigh, 0, -D.thigh, 0, 'knee' + L);
    const sockFrom = F.socks ? 0.25 : 2;
    const sg = paint(limb(D.shin, r2, r3, segs(18), { bulge: r2 * 0.22 }), (v) => pants && !cloth.shortPants ? pants : (-v.y / D.shin > sockFrom ? dark : base));
    mk(sg, fm('#ffffff', 49), knee, 'shin' + L, true);   // same id as the thigh: no ink seam at the knee
    const ankle = grp(knee, 0, -D.shin, 0, 'ankle' + L);
    // paw/foot with a flat sole; sandal or shoe under it
    const fh = D.footH, fl = D.footL, fw = D.footW;
    const fg = ell(fw, fh * 0.75, fl * 0.55, segs(18), segs(12));
    deform(fg, (v) => { v.z += fl * 0.25; v.y = Math.max(v.y, -fh * 0.55); v.x *= 1 + 0.15 * sstep(0, fl * 0.5, v.z); });
    paint(fg, () => (F.socks ? dark : (cloth.shoes || cloth.boots ? C(cloth.shoes ?? cloth.boots) : base)));
    fg.translate(0, -fh * 0.42, 0);
    mk(fg, fm('#ffffff', 51), ankle, 'foot' + L, true);
    if (S.digits && !cloth.boots && !cloth.shoes) {
      const toes = [];
      for (let i = 0; i < 4; i++) {
        const tg = ell(fw * 0.32, fh * 0.42, fl * 0.2, 10, 8); tg.translate((i - 1.5) * fw * 0.5, -fh * 0.75, fl * (0.78 - 0.05 * Math.abs(i - 1.5)));
        paint(tg, () => base); toes.push(tg);
        const cl = new THREE.ConeGeometry(fw * 0.1, fl * 0.14, 6, 1); cl.rotateX(Math.PI / 2); cl.translate((i - 1.5) * fw * 0.5, -fh * 0.86, fl * (0.97 - 0.05 * Math.abs(i - 1.5)));
        paint(cl, () => C(S.digits.claw)); toes.push(cl);
      }
      mk(merge(toes), fm('#ffffff', 51), ankle, 'toes' + L, true);
    }
    if (cloth.sandals) {
      const sole = new THREE.CylinderGeometry(1, 1, 1, segs(20));
      sole.scale(fw * 1.12, fh * 0.2, fl * 0.6); sole.translate(0, -fh + fh * 0.1, fl * 0.24);
      paint(sole, () => C(cloth.sandals));
      mk(sole, fm('#ffffff', 52), ankle, 'sole' + L, true);
      const strap = torus(1, 0.12, 6, segs(20)); strap.rotateX(Math.PI / 2); strap.scale(fw * 1.06, fh * 0.6, fw * 0.9); strap.translate(0, -fh * 0.45, fl * 0.32);
      paint(strap, () => C(cloth.sandals));
      mk(strap, fm('#ffffff', 52), ankle, 'strap' + L);
    }
    legs[L] = { thigh, knee, ankle };
  }
  // ---------------------------------------------------------------- tail
  const tailPivot = grp(hips, 0, -D.pelvis[1] * 0.1, -D.pelvis[2] * 0.85, 'tail');
  const tailLinks = [];
  if (S.tail && S.tail.type === 'chain') {
    const T = S.tail, N = T.links, l = T.len / N, tc = C(T.col), tp = C(T.tip);
    let parent = tailPivot;
    for (let i = 0; i < N; i++) {
      const u0 = i / N, u1 = (i + 1) / N, r = (u) => (T.taper ? T.r1 + (T.r0 - T.r1) * Math.pow(1 - u, T.taper) : T.r0 + (T.r1 - T.r0) * u);
      const g = limb(l * 1.04, r(u0), r(u1), segs(14), { bulge: r(u0) * 0.04 }); g.rotateX(Math.PI / 2);
      g.scale(1, T.flat ?? 1, 1);
      paint(g, (v) => {
        const u = u0 + (-v.z / l) * (u1 - u0);
        if (T.rings) {
          if (u > 0.82) return tp;
          const a = Math.atan2(v.x, v.y), ph = Math.sin(u * 42) + 0.8 * Math.sin(a * 3 + u * 19);
          return ph > 1.15 ? tp : tc;
        }
        return mixc(tc, tp, sstep(0.55, 1, u));
      });
      const piv = grp(parent, 0, 0, i ? -l : 0, 'tail' + i);
      mk(g, fm('#ffffff', 53), piv, 'tail' + i);
      tailLinks.push(piv);
      parent = piv;
    }
  } else if (S.tail) {
    const T = S.tail, k = D.pelvis[0] / 0.122;
    let g;
    if (T.type === 'pom') { g = paint(ell(0.05 * k, 0.05 * k, 0.045 * k, 14, 10), () => light); g.translate(0, 0, -0.02 * k); }
    else if (T.type === 'curl') { g = tube([v3(0, 0, 0), v3(0, 0.03, -0.04), v3(0.03, 0.06, -0.03), v3(0.01, 0.07, 0.0)].map((p) => p.multiplyScalar(k)), () => 0.009 * k, 6, 12); paint(g, () => base); }
    else {
      const len = (T.len ?? 0.3) * k, r = (T.r ?? 0.05) * k;
      const pts = [v3(0, 0, 0), v3(0, -len * 0.1, -len * 0.35), v3(0, -len * 0.05, -len * 0.7), v3(0, len * 0.12, -len)];
      g = tube(pts, (t) => r * (T.type === 'bushy' ? (0.45 + 1.1 * Math.sin(Math.min(1, t * 1.15) * Math.PI) * (1 - t * 0.25)) : (1 - 0.5 * t)) + 0.004, segs(12), segs(20));
      const tip = T.tip ? C(T.tip) : base, rings = T.rings;
      paint(g, (v) => { const t = -v.z / len; if (rings && Math.sin(t * Math.PI * rings) > 0.3) return dark; return t > (T.tipFrom ?? 0.78) ? tip : base; });
    }
    mk(g, fm('#ffffff', 53), tailPivot, 'tail');
  }
  // ---------------------------------------------------------------- torso + clothes
  let jacket = null;
  const flaps = [];
  if (S.jacket) {
    // one continuous CPU-skinned shell over hips, waist and chest: it bends with the spine, no rigid seam at the waist
    const J = S.jacket, [rx, ry, rz] = D.chest, cy = D.chestCY - D.spine * 0.25, k = rx / 0.135;
    const hipDrop = D.spine + (D.abd ?? 0), hem = -hipDrop + D.pelvis[1] * (J.hemY ?? 0.6) - 0.02;
    const prof = [[rx * 0.5, cy + ry * 1.24], [rx * 0.78, cy + ry * 1.12], [rx * 1.04, cy + ry * 0.76], [rx * 1.14, cy + ry * 0.2], [rx * 1.06, cy - ry * 0.5], [rx * 1.0, (cy - ry * 0.9 + hem) / 2 + 0.02], [rx * 1.14, hem + 0.05], [rx * 1.16, hem]];
    const g = garment(prof, { seg: segs(72), folds: 11, depth: 0.011 * k, sz: rz / rx * 1.05, phase: S.seed ?? 0 });
    const fold = g.userData.fold, body = C(J.body), dk = C(J.dark), rib = C(J.rib), zip = C(J.zip);
    paint(g, (v) => {
      if (v.y < hem + 0.042) return rib;
      if (v.z > 0 && Math.abs(v.x) < 0.012 * k) return zip;
      if (v.z > 0 && Math.abs(v.x) < 0.026 * k) return dk;
      // yoke across the shoulders, darker
      if (v.y > cy + ry * 0.74) return dk;
      return body;
    });
    { const a = g.attributes.aCol.array; for (let i = 0; i < fold.length; i++) { const q = 1 - 0.22 * Math.max(0, -fold[i]); a[i * 3] *= q; a[i * 3 + 1] *= q; a[i * 3 + 2] *= q; } }
    const P0 = g.attributes.position, N0 = g.attributes.normal, n = P0.count;
    const rest = Float32Array.from(P0.array), restN = Float32Array.from(N0.array), w = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const y = rest[i * 3 + 1];
      const c = sstep(-D.spine * 0.7, D.spine * 0.4, y), h = 1 - sstep(-hipDrop + 0.0, -hipDrop + (D.abd ?? 0) * 1.1, y);
      w[i * 3] = c; w[i * 3 + 2] = h * (1 - c); w[i * 3 + 1] = 1 - c - w[i * 3 + 2];
    }
    const m = new THREE.Mesh(g, furMaterial({ color: '#ffffff', id: 46, fur: 0.2, side: THREE.DoubleSide }));
    m.name = `${name}.jacket`; m.frustumCulled = false;
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0.8, 0), 1.4); g.boundingBox = new THREE.Box3(new THREE.Vector3(-0.8, -0.2, -0.8), new THREE.Vector3(0.8, 1.8, 0.8));
    root.add(m); parts.push(m);
    jacket = { mesh: m, rest, restN, w, oA: D.spine, oH: hipDrop };
    // shearling collar + pocket flaps + shoulder patch ride the chest
    const nr = D.headR * (D.neckR ? D.neckR[1] : 0.38);   // a thick padded collar the neck sinks into
    const col = torus(1, 0.3, 12, segs(40)); col.rotateX(Math.PI / 2); col.scale(nr * 0.94, nr * 0.86, nr * 0.94); col.translate(0, cy + ry * 1.04, 0);
    deform(col, (v) => { const a = Math.atan2(v.x, v.z); const b = 1 + 0.018 * Math.sin(a * 7 + 0.4); v.x *= b; v.z *= b; if (v.z < 0) v.z *= 0.74; });
    paint(col, () => C(J.collar));
    mk(col, fm('#ffffff', 47, { fur: 0.1, face: 0.6 }), chest, 'collar');
    const pockets = [];
    for (const sx of [1, -1]) {
      const pg = ell(0.062 * k, 0.015 * k, 0.012 * k, 14, 8); pg.translate(sx * rx * 0.52, cy + ry * 0.1, rz * 1.02);
      paint(pg, () => dk); pockets.push(pg);
          }
    mk(merge(pockets), fm('#ffffff', 47, { fur: 0, gloss: 0.3 }), chest, 'pockets');
    if (S.apronSkirt) {
      // heavy leather apron: bib rigid on the chest, the skirt in hinged panels that swing with the hips
      const A = S.apronSkirt, ac = C(A.col), st = C(A.stain);
      const stain = (v) => (Math.sin(v.x * 37 + v.y * 11) + Math.sin(v.y * 53 - v.x * 23) > 1.05 ? st : ac);
      const bib = ell(rx * 0.76, ry * 0.86, rz * 0.2, 18, 12); bib.translate(0, cy + ry * 0.06, rz * 1.05);
      paint(bib, stain);
      mk(bib, fm('#ffffff', 45, { fur: 0.05 }), chest, 'bib');
      const belt = torus(1, 0.09, 8, segs(36)); belt.rotateX(Math.PI / 2); belt.scale(D.pelvis[0] * 1.08, 0.5, D.pelvis[2] * 1.1); belt.translate(0, D.pelvis[1] * 0.68, 0);
      paint(belt, () => C(cloth.belt ?? '#3a2a20'));
      mk(belt, fm('#ffffff', 47), hips, 'belt');
      const W = D.pelvis[0] * 0.56, Hh = D.thigh * 0.62;
      for (let i = 0; i < A.panels; i++) {
        const x = (i - (A.panels - 1) / 2) * W * 0.98, y = D.pelvis[1] * 0.45, z = D.pelvis[2] * 1.06;
        const f0 = grp(hips, x, y, z, 'flap' + i);
        const fg = new THREE.BoxGeometry(W, Hh, 0.016, 6, 8, 1); fg.translate(0, -Hh / 2, 0.008); paint(fg, stain);
        mk(fg, fm('#ffffff', 45, { fur: 0.05 }), f0, 'flap' + i);
        const f1 = grp(f0, 0, -Hh, 0.0, 'flap' + i + 'b');
        const fg2 = new THREE.BoxGeometry(W * 0.96, Hh * 0.7, 0.016, 6, 6, 1); fg2.translate(0, -Hh * 0.35, 0.008); paint(fg2, stain);
        mk(fg2, fm('#ffffff', 45, { fur: 0.05 }), f1, 'flap' + i + 'b');
        flaps.push({ f0, f1, i });
      }
    }
  } else {
    const [rx, ry, rz] = D.chest;
    const g = paint(ell(rx, ry, rz, segs(24), segs(18)), (v) => (v.z > rz * 0.2 && v.y < ry * 0.6 ? light : base));
    g.translate(0, D.chestCY - D.spine * 0.25, 0);
    mk(g, fm('#ffffff', 40), chest, 'torso');
    if (cloth.top) {
      const kk = rx / 0.122;
      const top = C(cloth.top);
      const len = cloth.topLen ?? 1;                 // 1 to the hip, 1.6 to the knee (dress/robe)
      const cy = D.chestCY - D.spine * 0.25;
      // barrel chest -> pinched waist -> flared skirt; shoulders slope down into the arms
      const prof = [[rx * 0.5, cy + ry * 1.2], [rx * 0.74, cy + ry * 1.12], [rx * 0.98, cy + ry * 0.82], [rx * 1.12, cy + ry * 0.36], [rx * 1.08, cy - ry * 0.08], [rx * 0.95, cy - ry * 0.5]];
      const hemY = -D.spine - D.pelvis[1] * (0.25 + (len - 1) * 3.0);
      const midY = (cy - ry * 0.45 + hemY) / 2;
      prof.push([rx * (1.06 + 0.06 * len), midY], [rx * (1.27 + 0.25 * (len - 1)), hemY]);   // flared hem
      const gg = garment(prof, { seg: segs(40), folds: 8 + Math.round(len * 3), depth: 0.012 * kk * len, sz: rz / rx * 1.06, phase: S.seed ?? 0 });
      const f = gg.userData.fold;
      paint(gg, () => top);
      { const a = gg.attributes.aCol.array; for (let i = 0; i < f.length; i++) { const q = 1 - 0.18 * Math.max(0, -f[i]); a[i * 3] *= q; a[i * 3 + 1] *= q; a[i * 3 + 2] *= q; } }
      // trim band at the hem and neckline
      if (cloth.trim) { const tr = C(cloth.trim); const p = gg.attributes.position, a = gg.attributes.aCol.array; for (let i = 0; i < p.count; i++) { const y = p.getY(i); if (y < hemY + 0.022 * kk || y > cy + ry * 1.1) { a[i * 3] = tr[0]; a[i * 3 + 1] = tr[1]; a[i * 3 + 2] = tr[2]; } } }
      mk(gg, fm('#ffffff', 46, { fur: 0.25 }), chest, 'top');
      {
        // collar: a rolled band at the neckline; belt at the waist when there is no sash or apron
        const sz = rz / rx * 1.06;
        const trimC = cloth.trim ? C(cloth.trim) : mixc(top, [0, 0, 0], 0.22);
        const col = torus(1, 0.2, 8, segs(36)); col.rotateX(Math.PI / 2); col.scale(rx * 0.54, rx * 0.12, rx * 0.54 * sz); col.translate(0, cy + ry * 1.17, 0);
        paint(col, () => trimC);
        const parts3 = [col];
        if (!cloth.sash && !cloth.apron) {
          const bt = torus(1, 0.14, 8, segs(40)); bt.rotateX(Math.PI / 2); bt.scale(rx * 0.99, rx * 0.16, rx * 0.99 * sz); bt.translate(0, cy - ry * 0.5, 0);
          paint(bt, () => C(cloth.belt ?? '#5a3a26'));
          const buckle = ell(0.016 * kk, 0.02 * kk, 0.008 * kk, 10, 8); buckle.translate(0, cy - ry * 0.5, rx * 0.99 * sz + 0.004 * kk);
          paint(buckle, () => C('#c9a24a'));
          parts3.push(bt, buckle);
        }
        mk(merge(parts3), fm('#ffffff', 47, { fur: 0.1 }), chest, 'collar');
      }
      if (cloth.apron) {
        const ap = garment([[rx * 1.14, cy - ry * 0.2], [rx * 1.2, midY], [rx * 1.32, hemY - 0.03 * kk]], { seg: segs(24), folds: 5, depth: 0.008 * kk, sz: rz / rx * 1.12 });
        // keep only the front half
        const p = ap.attributes.position; for (let i = 0; i < p.count; i++) if (p.getZ(i) < 0) p.setZ(i, p.getZ(i) * 0.02 + 0.0);
        ap.computeVertexNormals();
        paint(ap, () => C(cloth.apron));
        mk(ap, fm('#ffffff', 47, { fur: 0.2 }), chest, 'apron');
      }
      if (cloth.sash) {
        const sg = torus(1, 0.16, 8, segs(32)); sg.rotateX(Math.PI / 2); sg.scale(rx * 1.0, rx * 0.3, rx * 1.0 * rz / rx * 1.06);
        sg.translate(0, cy - ry * 0.5, 0);
        paint(sg, () => C(cloth.sash));
        const knot = ell(0.022 * kk, 0.02 * kk, 0.016 * kk, 10, 8); knot.translate(rx * 0.5, cy - ry * 0.5, rz * 1.04);
        paint(knot, () => mixc(C(cloth.sash), [0, 0, 0], 0.12));
        const tail1 = tuft(0.03 * kk, 0.09 * kk, 0.008 * kk, 0.01); tail1.rotateZ(Math.PI * 0.92); tail1.translate(rx * 0.53, cy - ry * 0.53, rz * 1.08);
        paint(tail1, () => C(cloth.sash));
        mk(merge([sg, knot, tail1]), fm('#ffffff', 47, { fur: 0.1 }), chest, 'sash');
      }
    }
    if (S.satchel) {
      const kk = rx / 0.122, cy = D.chestCY - D.spine * 0.25;
      // strap diagonal across the chest: an ellipse tilted around the torso
      const st = torus(1, 0.05, 6, segs(40)); st.scale(rx * 1.22, ry * 1.35, rz * 1.32); st.rotateY(Math.PI / 2); st.rotateZ(0.0);
      const p = st.attributes.position;
      for (let i = 0; i < p.count; i++) { const y = p.getY(i), z = p.getZ(i), x = p.getX(i); p.setXYZ(i, x * 0.4 + y * 0.0, y, z); }
      st.rotateZ(-0.62); st.translate(0, cy + ry * 0.1, 0);
      st.computeVertexNormals();
      paint(st, () => mixc(C(S.satchel), [0.2, 0.15, 0.1], 0.3));
      const bag = ell(0.075 * kk, 0.06 * kk, 0.03 * kk, 14, 10);
      deform(bag, (v) => { v.y = Math.max(v.y, -0.045 * kk); });
      bag.translate(-rx * 1.12, cy - ry * 0.75, rz * 0.2); bag.rotateY(0);
      paint(bag, (v) => (v.y > cy - ry * 0.62 ? mixc(C(S.satchel), [1, 1, 1], 0.12) : C(S.satchel)));
      mk(merge([st, bag]), fm('#ffffff', 56, { fur: 0.1, gloss: 0 }), chest, 'satchel');
    }
    if (S.cape) {
      const rx2 = rx, cy = D.chestCY - D.spine * 0.25, kk = rx / 0.122;
      const prof = [[rx2 * 0.62, cy + ry * 1.22], [rx2 * 1.25, cy + ry * 0.98], [rx2 * 1.45, cy + ry * 0.55], [rx2 * 1.55, cy + ry * 0.05], [rx2 * 1.62, cy - ry * 0.35]];
      const g = garment(prof, { seg: segs(44), folds: 9, depth: 0.012 * kk, sz: 0.95, open: 0.5, phase: 1.3 });
      paint(g, () => C(S.cape));
      { const f = g.userData.fold, a = g.attributes.aCol.array; for (let i = 0; i < f.length; i++) { const q = 1 - 0.2 * Math.max(0, -f[i]); a[i * 3] *= q; a[i * 3 + 1] *= q; a[i * 3 + 2] *= q; } }
      mk(g, fm('#ffffff', 58, { fur: 0.2 }), chest, 'cape');
      // hood lying on the back of the shoulders
      const hood = ell(0.13 * kk, 0.09 * kk, 0.1 * kk, segs(20), segs(14));
      deform(hood, (v) => { if (v.z > 0.02 * kk) v.z = 0.02 * kk + (v.z - 0.02 * kk) * 0.2; });
      hood.translate(0, cy + ry * 1.05, -rz * 1.25);
      paint(hood, (v) => (v.z > 0.0 ? mixc(C(S.cape), [0.3, 0.15, 0.05], 0.35) : C(S.cape)));
      const clasp = ell(0.018 * kk, 0.018 * kk, 0.01 * kk, 10, 8); clasp.translate(0, cy + ry * 1.0, rz * 0.98);
      paint(clasp, () => C('#b8862a'));
      mk(merge([hood, clasp]), fm('#ffffff', 57, { fur: 0.2, gloss: 1 }), chest, 'hood');
    }
  }
  // ---------------------------------------------------------------- arms
  const arms = {};
  let rig_paw = null;
  for (const side of [1, -1]) {
    const L = side === 1 ? 'L' : 'R';
    const sh = grp(chest, side * D.sh[0], D.sh[1], 0, 'shoulder' + L);
    const [r0, r1, r2, r3] = D.armR;
    const sleeve = cloth.sleeves ? C(cloth.sleeves) : (cloth.longSleeves ? C(cloth.longSleeves) : null);
    const sleeveTo = cloth.longSleeves && !cloth.sleeves ? 2 : (cloth.sleeveLen ?? 0.6);
    const ug = paint(limb(D.upper, r0, r1, segs(14), { bulge: r0 * 0.08 }), (v) => (sleeve && -v.y < D.upper * sleeveTo ? sleeve : base));
    if (sleeve) { // sleeve cuff flare
      deform(ug, (v) => { const k = sstep(D.upper * sleeveTo - 0.02, D.upper * sleeveTo, -v.y) ; const c = -v.y < D.upper * sleeveTo ? 1.14 : 1.0; v.x *= c; v.z *= c; void k; });
    }
    mk(ug, fm('#ffffff', 49), sh, 'upper' + L);
    if (sleeve && sleeveTo < 1.5) {
      // cuff band at the sleeve end
      const yc = -D.upper * sleeveTo, rr = (r0 + (r1 - r0) * sleeveTo) * 1.16;
      const cf = torus(1, 0.16, 8, segs(24)); cf.rotateX(Math.PI / 2); cf.scale(rr, rr * 0.9, rr); cf.translate(0, yc + rr * 0.08, 0);
      paint(cf, () => (cloth.trim ? C(cloth.trim) : mixc(sleeve, [0, 0, 0], 0.2)));
      mk(cf, fm('#ffffff', 47, { fur: 0.1 }), sh, 'cuff' + L);
    }
    const el = grp(sh, 0, -D.upper, 0, 'elbow' + L);
    const longSleeve = cloth.longSleeves ? C(cloth.longSleeves) : null;
    const fg = paint(limb(D.fore, r2, r3, segs(16), { bulge: r2 * 0.15 }), () => (longSleeve ? longSleeve : (F.gloves ? dark : base)));
    mk(fg, fm('#ffffff', 49), el, 'fore' + L);   // same id as the upper arm: no ink seam at the elbow
    if (longSleeve) {
      // drawn sleeve: padded shoulder, elbow point, crease arcs that gather at the bend and at the cuff
      const crease = mixc(longSleeve, [0, 0, 0], 0.38);
      const cap = ell(r0 * 1.3, r0 * 1.12, r0 * 1.26, segs(14), segs(10)); cap.translate(side * r0 * 0.1, -r0 * 0.18, 0); paint(cap, () => longSleeve);
      mk(cap, fm('#ffffff', 49), sh, 'shoulderCap' + L);
      const elb = ell(r1 * 1.16, r1 * 1.2, r1 * 1.22, segs(12), segs(10)); elb.translate(0, 0, -r1 * 0.14); paint(elb, () => longSleeve);
      mk(elb, fm('#ffffff', 49), el, 'elbowCap' + L);
      const arcs = [];
      const arc = (R0, y, rx, rz, tube, a0, span, list) => { const t = new THREE.TorusGeometry(R0, tube, 5, 14, span); t.rotateX(Math.PI / 2); t.rotateY(a0); t.rotateX(rx); t.rotateZ(rz); t.translate(0, y, 0); paint(t, () => crease); list.push(t); };
      for (const [f, a, tilt] of [[0.62, 0.3, 0.26], [0.76, 2.4, -0.3], [0.88, 0.9, 0.2]]) arc(lerp2(r0, r1, f) * 1.05, -D.upper * f, tilt, tilt * 0.5, 0.0055, a, 2.6, arcs);
      mk(merge(arcs), fm('#ffffff', 49, { fur: 0 }), sh, 'foldsU' + L);
      const arcs2 = [];
      for (const [f, a, tilt] of [[0.12, 1.2, -0.28], [0.26, 3.6, 0.32], [0.72, 0.4, 0.2], [0.86, 2.8, -0.24]]) arc(lerp2(r2, r3, f) * 1.06 + r2 * 0.05 * Math.sin(f * Math.PI), -D.fore * f, tilt, tilt * 0.5, 0.0055, a, 2.4, arcs2);
      mk(merge(arcs2), fm('#ffffff', 49, { fur: 0 }), el, 'foldsF' + L);
    }
    if (cloth.cuff) {
      const cf = torus(1, 0.2, 8, segs(24)); cf.rotateX(Math.PI / 2); cf.scale(r3 * 1.18, r3 * 1.3, r3 * 1.18); cf.translate(0, -D.fore + r3 * 0.25, 0);
      paint(cf, () => C(cloth.cuff));
      mk(cf, fm('#ffffff', 47, { fur: 0.1 }), el, 'cuff' + L);
    }
    const wr = grp(el, 0, -D.fore, 0, 'wrist' + L);
    const h = D.hand;
    let fingers = [], th;
    let thumbs = null;
    if (S.digits) {
      // a real paw: palm with pads on the -Z side, four two-joint fingers with claws, an opposable thumb
      if (!rig_paw) rig_paw = furMaterial({ color: '#ffffff', id: 51, fur: 0.35 });
      const pawC = base, padC = C(S.digits.pads), clawC = C(S.digits.claw);
      const palm = ell(h * 0.9, h * 0.84, h * 0.5, segs(18), segs(12)); palm.translate(0, -h * 0.74, 0);
      paint(palm, () => pawC);
      mk(palm, rig_paw, wr, 'palm' + L, true);
      const pad = ell(h * 0.58, h * 0.42, h * 0.12, 14, 8); pad.translate(0, -h * 0.82, -h * 0.47); paint(pad, () => padC);
      mk(pad, rig_paw, wr, 'pad' + L);
      for (let i = 0; i < 4; i++) {
        const x = side * (i - 1.5) * h * 0.46, ln = h * (0.72 - 0.06 * Math.abs(i - 1)), r0f = h * 0.21;
        const f0 = grp(wr, x, -h * 1.42, 0, 'finger' + L + i);
        const g0 = limb(ln * 0.56, r0f, r0f * 0.86, segs(10)); paint(g0, () => pawC);
        const gp0 = ell(r0f * 0.8, ln * 0.2, r0f * 0.36, 8, 6); gp0.translate(0, -ln * 0.32, -r0f * 0.74); paint(gp0, () => padC);
        mk(g0, rig_paw, f0, 'fingerA' + L + i, true);
        mk(gp0, rig_paw, f0, 'fingerPadA' + L + i);
        const f1 = grp(f0, 0, -ln * 0.56, 0, 'fingerB' + L + i);
        const g1 = limb(ln * 0.44, r0f * 0.84, r0f * 0.62, segs(10)); paint(g1, () => pawC);
        const cl = new THREE.ConeGeometry(r0f * 0.42, ln * 0.34, 8, 1); cl.rotateX(Math.PI); cl.translate(0, -ln * 0.58, r0f * 0.12); paint(cl, () => clawC);
        mk(g1, rig_paw, f1, 'fingerB' + L + i, true);
        mk(cl, fm('#ffffff', 52, { fur: 0, gloss: 0.6 }), f1, 'claw' + L + i);
        fingers.push({ f0, f1, i });
      }
      th = grp(wr, -side * h * 0.86, -h * 0.72, -h * 0.1, 'thumb' + L);
      const lnT = h * 0.62;
      const tg0 = limb(lnT * 0.55, h * 0.24, h * 0.2, segs(10)); paint(tg0, () => pawC);
      mk(tg0, rig_paw, th, 'thumbA' + L, true);
      const th1 = grp(th, 0, -lnT * 0.55, 0, 'thumbB' + L);
      const tg1 = limb(lnT * 0.45, h * 0.2, h * 0.14, segs(10)); paint(tg1, () => pawC);
      mk(tg1, rig_paw, th1, 'thumbB' + L, true);
      const tc = new THREE.ConeGeometry(h * 0.09, lnT * 0.3, 8, 1); tc.rotateX(Math.PI); tc.translate(0, -lnT * 0.55, h * 0.03); paint(tc, () => clawC);
      mk(tc, fm('#ffffff', 52, { fur: 0, gloss: 0.6 }), th1, 'clawT' + L);
      thumbs = [th, th1];
    } else {
    // mitten: palm and a single rounded finger block (curls as one), separate thumb
    const hc = F.gloves ? dark : light;
    const palm = ell(h * 0.84, h * 0.92, h * 0.56, segs(14), segs(10)); palm.translate(0, -h * 0.72, 0);
    paint(palm, () => hc);
    mk(palm, fm('#ffffff', 51), wr, 'palm' + L, true);
    {
      const fp = grp(wr, 0, -h * 1.22, h * 0.02, 'mitt' + L);
      const fgeo = limb(h * 0.66, h * 0.4, h * 0.3, segs(12), { bulge: h * 0.04 }); fgeo.scale(1.95, 1, 1.2);
      paint(fgeo, () => hc);
      mk(fgeo, fm('#ffffff', 51), fp, 'mitt' + L);   // same id as the palm: one mitten, no ink seam
      fingers.push(fp);
    }
    th = grp(wr, -side * 0.0 + side * h * 0.6, -h * 0.75, h * 0.35, 'thumb' + L);
    const tgeo = limb(h * 0.42, h * 0.24, h * 0.2, segs(8)); paint(tgeo, () => (F.gloves ? dark : light));
    th.rotation.set(-0.6, 0, side * 0.5);
    mk(tgeo, fm('#ffffff', 52), th, 'thumb' + L);
    }
    arms[L] = { sh, el, wr, fingers, thumb: th, thumbs, side };
  }
  // ---------------------------------------------------------------- neck + head
  {
    const ng = paint(limb(D.neckL + 0.04, D.headR * (D.neckR ? D.neckR[0] : 0.3), D.headR * (D.neckR ? D.neckR[1] : 0.38), segs(24)), () => (F.neck ? C(F.neck) : light));
    ng.translate(0, D.neckL + 0.02, 0);
    mk(ng, fm('#ffffff', 40, { face: 1 }), neck, 'neck');
  }
  const R = D.headR;
  const face = { eyes: [], brows: [], mouth: null, ears: [], earTips: [], headMat: null, nose: null };
  const headCY = R * 0.88;
  const skull = grp(head, 0, headCY, 0, 'skull');
  const fc = S.face || {};
  // ---- the head skin: one SDF surface (cranium, cheeks, jaw, muzzle, tufts, ruff, bangs, wool)
  const H = fc.head || deriveHead(fc);
  const sdf = headSDF(H);
  const headGeo = meshSDF(sdf.f, [-1.75, -1.4, -1.3], [1.75, 1.6, 2.0], HI ? 1 / 34 : 1 / 11, R);
  const surf = surfFn(sdf.f, R);
  const hm = headMaterial({ R, base: F.base, light: F.light ?? F.base, dark: F.dark ?? F.base, blush: fc.blush, pat: H.pat ?? 2, p: H.p, ymouth: H.ymouth ?? 0, line: fc.line ?? '#2a1a22', fang: fc.fang ?? 1 });
  face.headMat = hm;
  mk(headGeo, hm, skull, 'skull');
  const skullGeo = headGeo;
  // ---- fringe: tapered, curved fur locks (round section, pointed tips), roots buried in the scalp, overlapping
  if (H.fringe) {
    const locks = [];
    for (const [bd, td, r, bow] of H.fringe) {
      const b = surf(v3(...bd)), e = surf(v3(...td));
      const p0 = b.p.clone().addScaledVector(b.n, -R * 0.05);
      const p3 = e.p.clone().addScaledVector(e.n, R * 0.05);
      const n = b.n.clone().add(e.n).normalize();
      const p1 = p0.clone().lerp(p3, 0.35).addScaledVector(n, R * (bow ?? 0.14));
      const p2 = p0.clone().lerp(p3, 0.72).addScaledVector(n, R * (bow ?? 0.14) * 0.75);
      locks.push(tube([p0, p1, p2, p3], (t) => R * r * Math.pow(1 - t, 0.75) * (0.75 + 0.5 * Math.sin(Math.min(1, t * 2.2) * Math.PI * 0.5)) + R * 0.004, segs(14), segs(18)));
    }
    const lg = merge(locks); paint(lg, () => base);
    mk(lg, fm('#ffffff', 41, { fur: 0.3 }), skull, 'fringe');   // head id: no ink seam at the roots
  }
  // ---- nose on the muzzle tip
  const tip = sdf.muzzleTip;
  const nsp = surf(v3(tip[0], tip[1] + sdf.muzzleR1 * (H.noseUp ?? 0.55), tip[2]));
  {
    const nr = R * (fc.noseR ?? 0.09);
    let g;
    if (fc.noseType === 'disc') {
      g = new THREE.CylinderGeometry(nr * 1.15, nr * 1.2, nr * 0.7, segs(24)).rotateX(Math.PI / 2);
      paint(g, (v, n) => (n.z > 0.7 && Math.hypot(Math.abs(v.x) - nr * 0.45, v.y) < nr * 0.22 ? mixc(C(fc.noseCol ?? '#2a1e24'), [0, 0, 0], 0.5) : C(fc.noseCol ?? '#2a1e24')));
    } else {
      // rounded triangle nose: wider on top
      g = ell(nr * 1.25, nr * 0.85, nr * 0.8, segs(20), segs(14));
      deform(g, (v) => { v.x *= 1 + 0.25 * Math.max(0, v.y / nr); });
      paint(g, () => C(fc.noseCol ?? '#2a1e24'));
    }
    const npiv = grp(skull, nsp.p.x, nsp.p.y, nsp.p.z, 'nose');
    npiv.quaternion.setFromUnitVectors(v3(0, 0, 1), nsp.n.clone().lerp(v3(0, 0, 1), 0.5).normalize());
    g.translate(0, 0, -nr * 0.3);
    mk(g, fm('#ffffff', 43, { fur: 0, gloss: 1 }), npiv, 'nose');
    // mouth painted on the muzzle: centre just below the nose, front projection
    const my = nsp.p.y / R - (H.mouthDrop ?? 0.2);
    hm.uniforms.uMouthC.value.set(my, tip[2] - (H.mouthDepth ?? 0.5), H.mouthW ?? (fc.mouthW ?? 0.2), nsp.p.y / R - nr / R * 0.7);
    // the jaw: everything below the mouth line, in front of the hinge, swings down in the vertex shader
    const hp = headGeo.attributes.position, wJ = new Float32Array(hp.count);
    for (let i = 0; i < hp.count; i++) { const y = hp.getY(i) / R, z = hp.getZ(i) / R; wJ[i] = sstep(my + 0.01, my - 0.26, y) * sstep(-0.4, 0.15, z); }
    headGeo.setAttribute('aJaw', new THREE.BufferAttribute(wJ, 1));
    hm.uniforms.uHinge.value.set(0, my * R + R * 0.02, -R * 0.12);
  }
  // ---- whiskers, tusks, antlers
  if (H.whiskers) {
    const wl = [];
    for (const side of [1, -1]) for (let i = 0; i < (H.whiskers === true ? 3 : H.whiskers); i++) {
      const s0 = surf(v3(side * (0.45 + i * 0.03), tip[1] - 0.03 - i * 0.05, tip[2] - 0.15));
      const a = s0.p.clone(), b = a.clone().add(v3(side * R * (0.72 + 0.05 * i), H.whiskers === 5 ? R * (0.3 - i * 0.06) : R * (0.1 - i * 0.1), -R * 0.1));
      wl.push(tube([a, a.clone().lerp(b, 0.5).add(v3(0, R * 0.05, 0)), b], (t) => R * 0.013 * (1 - t * 0.8), 4, 8));
    }
    const g = merge(wl); paint(g, () => C(F.light ?? '#ffffff'));
    mk(g, fm('#ffffff', 56, { fur: 0, rim: 0.3 }), skull, 'whiskers');
  }
  if (H.tusks) {
    const tl = [];
    for (const side of [1, -1]) {
      const s0 = surf(v3(side * 0.3, tip[1] - 0.2, tip[2] - 0.12));
      const a = s0.p.clone();
      tl.push(tube([a, a.clone().add(v3(side * R * 0.05, R * 0.1, R * 0.04)), a.clone().add(v3(side * R * 0.04, R * 0.2, -R * 0.02))], (t) => R * 0.045 * (1 - t * 0.85), 6, 8));
    }
    const g = merge(tl); paint(g, () => [0.98, 0.95, 0.86]);
    mk(g, fm('#ffffff', 56, { fur: 0, gloss: 1 }), skull, 'tusks');
  }
  if (H.antlers) {
    const al = [];
    for (const side of [1, -1]) {
      const b = surf(v3(side * 0.4, 0.85, -0.05)).p;
      const p1 = b.clone().add(v3(side * R * 0.25, R * 0.45, -R * 0.1)), p2 = p1.clone().add(v3(side * R * 0.15, R * 0.4, -R * 0.15));
      al.push(tube([b, p1, p2], (t) => R * 0.05 * (1 - t * 0.6), 6, 10));
      al.push(tube([p1, p1.clone().add(v3(side * R * 0.02, R * 0.25, R * 0.15))], (t) => R * 0.035 * (1 - t * 0.6), 5, 6));
    }
    const g = merge(al); paint(g, () => C(H.antlers));
    mk(g, fm('#ffffff', 55, { fur: 0, gloss: 0.3 }), skull, 'antlers');
  }
  // ---- eyes: painted on a patch of the face skin (set INTO the face), lids/lashes/iris in the shader
  const eyeMul = fc.eye ?? 1;
  for (const side of [1, -1]) {
    const ex = fc.eyeX ?? 0.42, ey = fc.eyeY ?? 0.12;
    const e = v3(side * ex, ey, Math.sqrt(Math.max(0.05, 1 - ex * ex - ey * ey))).normalize();
    const sp = surf(e);
    const rx = R * 0.32 * eyeMul * (fc.eyeW ?? 1), ry = R * 0.42 * eyeMul, rz = R * 0.13;
    const dir = sp.n.clone().lerp(v3(0, 0, 1), 0.35).normalize();
    const pos = sp.p.clone().addScaledVector(dir, -R * 0.3);
    const piv = grp(skull, pos.x, pos.y, pos.z, 'eye' + (side === 1 ? 'L' : 'R'));
    piv.quaternion.setFromUnitVectors(v3(0, 0, 1), dir);
    piv.updateMatrix();
    const mat = eyeMaterial({ skin: F.eyeSkin ?? F.base, iris: fc.iris, irisDark: fc.irisDark, irisLight: fc.irisLight, side, detail: HI ? (S.eyeDetail ?? 0.3) : 0, irisR: fc.irisR ?? 0.6, pupil: fc.pupil ?? 0.4, lashW: fc.lashW ?? 0.17, round: fc.roundEye ?? 0, patch: true });
    mat.polygonOffset = true; mat.polygonOffsetFactor = -2; mat.polygonOffsetUnits = -4;
    const g = eyePatch(headGeo, piv, rx, ry, rz, R * 0.006);
    const m = mk(g, mat, piv, 'eye' + (side === 1 ? 'L' : 'R'));
    m.scale.set(rx, ry, rz);
    face.eyes.push({ piv, mesh: m, mat, side });
    hm.uniforms[side === 1 ? 'uEye0' : 'uEye1'].value.set(sp.p.x / R, sp.p.y / R, sp.p.z / R);
    hm.uniforms.uEyeS.value.set(rx / R, ry / R);
    // brow: a tapered stroke lying on the brow ridge
    const eb = v3(e.x * 0.95, e.y + 0.52 * eyeMul, e.z);
    const bs = surf(eb);
    const bp = grp(skull, bs.p.x, bs.p.y, bs.p.z, 'brow');
    const zA = bs.n.clone(), yA0 = v3(0, 1, 0); yA0.addScaledVector(zA, -yA0.dot(zA)).normalize();
    const xA = new THREE.Vector3().crossVectors(yA0, zA), yA = yA0;
    bp.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(xA, yA, zA));
    const bw = R * 0.2 * eyeMul * (fc.browW ?? 1);
    const curve = (x) => -(x * x) / (2 * R) * 1.1;
    const sx = side;
    const bg = tube([v3(-bw * sx, -bw * 0.1, curve(bw)), v3(-bw * 0.2 * sx, bw * 0.08, 0), v3(bw * 0.5 * sx, bw * 0.02, curve(bw * 0.5)), v3(bw * sx, -bw * 0.16, curve(bw))], (t) => R * (fc.browT ?? 0.026) * (1 - 0.7 * Math.pow(Math.abs(t - 0.35) / 0.65, 1.5)) + 0.0012, 6, 12);
    paint(bg, () => C(fc.brow ?? F.dark ?? F.base));
    bg.translate(0, 0, R * 0.014);
    const bpi = grp(bp, 0, 0, 0, 'browPivot');
    mk(bg, fm('#ffffff', 54, { fur: 0, rim: 0 }), bpi, 'brow');
    face.brows.push({ piv: bpi, side, base: bp.position.clone() });
  }
  // glasses: round rims floating just in front of the eyes, a small arched bridge
  if (S.glasses) {
    const parts2 = [];
    const r = R * (S.glassR ?? 0.42) * eyeMul;
    const cs = [];
    for (const ey of face.eyes) {
      const ring = torus(r, R * 0.026, 8, segs(48)); ring.scale(0.88, 1, 1);   // tall ovals: clear of the nose bridge
      const sp = surf(ey.piv.position.clone().normalize());
      // ring plane between the eye axis and the surface normal (follows the face curvature)
      const nrm = v3(0, 0, 1).lerp(sp.n, 0.22).normalize();   // lenses nearly coplanar, a slight wrap
      ring.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(v3(0, 0, 1), nrm));
      nrm.y -= 0.22; nrm.normalize();                // bottom of the rim forward, clear of the cheeks
      const c = sp.p.clone().addScaledVector(nrm, R * (S.glassOff ?? 0.2));
      ring.translate(c.x, c.y, c.z);
      parts2.push(ring); cs.push({ c, nrm, side: ey.side });
    }
    const [L, Rr] = cs;
    face.lenses = cs.map((o) => ({ c: o.c.clone(), n: o.nrm.clone(), r }));
    const inner = (o) => o.c.clone().add(v3(-o.side * r * 0.88 * 0.98, r * 0.18, 0));
    const a0 = inner(L), a1 = inner(Rr);
    parts2.push(tube([a0, v3(0, (a0.y + a1.y) / 2 + r * 0.22, Math.max(a0.z, a1.z) + R * 0.03), a1], () => R * 0.022, 5, 12));
    // temple arms: from the outer rim edge back along the head to above the ear
    for (const o of cs) {
      // follows the head surface from the outer rim edge back to above the ear
      const e0 = o.c.clone().add(v3(o.side * r * 0.88 * 0.97, r * 0.1, -r * 0.1));
      const hinge = e0.clone().add(v3(0, 0, -R * 0.16));
      const d0 = hinge.clone().normalize(), d1 = v3(o.side * 0.86, 0.16, -0.5).normalize();
      const pts = [e0, hinge];
      for (let i = 1; i <= 5; i++) {
        const t = i / 5, d = d0.clone().lerp(d1, t).normalize(), q = surf(d);
        const onS = q.p.clone().addScaledVector(q.n, R * 0.035);
        pts.push(hinge.clone().lerp(onS, Math.min(1, t * 1.6)).lerp(onS, t));   // eases from the hinge onto the head
      }
      parts2.push(tube(pts, () => R * 0.02, 5, 16));
    }
    const gg = merge(parts2); paint(gg, () => C(S.glasses));
    mk(gg, fm('#ffffff', 55, { fur: 0, gloss: 1, rim: 0.5 }), skull, 'glasses');
  }
  // flight goggles pushed up on the forehead; a strap around the skull, its loose end hanging behind on a chain of links
  const strapLinks = [];
  if (S.goggles) {
    const Gg = S.goggles, parts2 = [], glass = [], lr = R * 0.25;
    for (const sd of [1, -1]) {
      const sp = surf(v3(sd * 0.3, 0.86, 0.48));
      const nrm = sp.n.clone().lerp(v3(0, 0.5, 0.86).normalize(), 0.6).normalize();
      const c = sp.p.clone().addScaledVector(nrm, R * 0.09);
      const qq = new THREE.Quaternion().setFromUnitVectors(v3(0, 0, 1), nrm);
      const cup = new THREE.CylinderGeometry(lr * 1.04, lr * 1.16, R * 0.17, segs(26), 1, true).rotateX(Math.PI / 2).applyQuaternion(qq).translate(c.x, c.y, c.z).translate(-nrm.x * R * 0.06, -nrm.y * R * 0.06, -nrm.z * R * 0.06);
      const ring = torus(lr * 1.04, R * 0.05, 8, segs(30)).applyQuaternion(qq).translate(c.x, c.y, c.z);
      parts2.push(cup, ring);
      const g = ell(lr * 0.98, lr * 0.98, R * 0.05, segs(20), 10).applyQuaternion(qq).translate(c.x, c.y, c.z);
      paint(g, (v) => { const q = v.clone().sub(c); return q.x * 0.6 + q.y * 0.8 > lr * 0.34 && q.x * 0.6 + q.y * 0.8 < lr * 0.62 ? [0.86, 0.95, 0.98] : C(Gg.glass); });
      glass.push(g);
    }
    { const br = tube([surf(v3(0.18, 0.84, 0.54)).p.addScaledVector(v3(0, 0.3, 0.9), R * 0.1), surf(v3(0, 0.86, 0.56)).p.addScaledVector(v3(0, 0.3, 0.9), R * 0.13), surf(v3(-0.18, 0.84, 0.54)).p.addScaledVector(v3(0, 0.3, 0.9), R * 0.1)], () => R * 0.032, 6, 10); parts2.push(br); }
    const gm = merge(parts2); paint(gm, () => C(Gg.rim));
    mk(gm, fm('#ffffff', 55, { fur: 0, gloss: 1, face: 0.75 }), skull, 'goggles');
    mk(merge(glass), fm('#ffffff', 56, { fur: 0, gloss: 1, rim: 0.3, face: 0.6 }), skull, 'gogglesGlass');
    // strap: follows the real skull surface
    const pts = [];
    for (let i = 0; i < 40; i++) { const a = (i / 40) * Math.PI * 2, sq = surf(v3(Math.sin(a) * 1.0, 0.62 + 0.28 * Math.cos(a), Math.cos(a))); pts.push(sq.p.clone().addScaledVector(sq.n, R * 0.035)); }
    const stG = tube(pts, () => R * 0.05, 6, segs(70), true); stG.scale(1, 1, 1); paint(stG, () => C(Gg.strap));
    mk(stG, fm('#ffffff', 54, { fur: 0, rim: 0.3 }), skull, 'strap');
    const bk = surf(v3(0, 0.34, -1));
    let par = grp(skull, bk.p.x + R * 0.1, bk.p.y, bk.p.z - R * 0.04, 'strapEnd');
    const ll = R * 0.2;
    for (let i = 0; i < (Gg.tail ?? 4); i++) {
      const lg = new THREE.BoxGeometry(R * 0.12, ll * 1.1, R * 0.024).translate(0, -ll * 0.5, 0); paint(lg, () => C(Gg.strap));
      const piv = i ? grp(par, 0, -ll, 0, 'strapL' + i) : par;
      mk(lg, fm('#ffffff', 54, { fur: 0, rim: 0.3 }), piv, 'strapL' + i);
      strapLinks.push(piv); par = piv;
    }
  }
  // ears
  if (S.ears) {
    const E = S.ears;
    for (const side of [1, -1]) {
      const ax = E.x ?? 0.55, ay = E.y ?? 0.78;
      const d = v3(side * ax, ay, E.z ?? -0.05).normalize();
      const es = surf(d); const epp = es.p.clone().addScaledVector(es.n, -R * 0.07);   // root sits on the real head surface
      const ep = grp(skull, epp.x, epp.y, epp.z, 'ear');
      const len = R * (E.len ?? 0.9), w = R * (E.w ?? 0.45);
      let g;
      if (E.type === 'long') {
        g = limb(len * 0.5, w * 0.42, w * 0.5, segs(28), { bulge: w * 0.12, sx: 1, sz: 0.38 });
        g.rotateZ(Math.PI); g.translate(0, 0, 0);
      } else if (E.type === 'round') {
        g = ell(w * 0.55, w * 0.5, w * 0.22, 14, 10); g.translate(0, w * 0.3, 0);
      } else if (E.type === 'droop') {
        g = limb(len, w * 0.3, w * 0.42, segs(12), { bulge: w * 0.08, sz: 0.35 });
      } else {
        // a thick cup: rounded-triangle section, the front hollowed into a bowl, tip curling slightly back
        g = new THREE.ConeGeometry(w * 0.5, len, segs(32), segs(14)); g.translate(0, len / 2, 0); g.scale(1, 1, 0.56);
        deform(g, (v) => {
          const t = Math.max(0, v.y / len), rx = w * 0.5 * (1 - t) + 1e-4;
          if (v.z > 0) v.z -= 0.62 * v.z * (1 - Math.pow(Math.min(1, Math.abs(v.x) / rx), 2)) * (1 - t * 0.6);   // the bowl
          v.z += -0.25 * w * Math.pow(t, 2); v.x *= 1 + 0.25 * Math.sin(Math.min(1, t) * Math.PI);
        });
        g.computeVertexNormals();
      }
      const tipC = E.tip ? C(E.tip) : base, backC = E.back ? C(E.back) : null;
      paint(g, (v, n) => {
        if (backC && n.z < -0.15 && E.type !== 'long') return backC;
        const t = E.type === 'droop' ? -v.y / len : v.y / (E.type === 'long' ? len * 0.5 : len);
        if (E.type === 'long' && v.z > 0 && Math.abs(v.x) < w * 0.3 && t < 0.9) return inner;
        if (E.type !== 'droop' && E.type !== 'long' && n.z > 0.35 && Math.abs(v.x) < w * 0.33 * (1 - t * 0.7) && t < 0.86) return inner;
        return t > (E.tipFrom ?? 0.72) ? tipC : base;
      });
      const em = grp(ep, 0, 0, 0, 'earPivot');
      em.rotation.set(E.rx ?? -0.15, 0, -side * (E.splay ?? 0.35));
      mk(g, fm('#ffffff', 45, { face: 1 }), em, 'ear');
      face.ears.push({ piv: em, side, rx: em.rotation.x, rz: em.rotation.z });
      if (E.type === 'long') {
        const tipP = grp(em, 0, len * 0.5, 0, 'earTip');
        const g2 = limb(len * 0.52, w * 0.38, w * 0.48, segs(28), { bulge: w * 0.12, sz: 0.38 }); g2.rotateZ(Math.PI);
        paint(g2, (v) => { const t = v.y / (len * 0.52); if (v.z > 0 && Math.abs(v.x) < w * 0.28 * (1 - t * 0.5) && t < 0.86) return inner; return t > 0.8 ? tipC : base; });
        mk(g2, fm('#ffffff', 57, { face: 1 }), tipP, 'earTip');
        face.earTips.push({ piv: tipP, side, bend: side === 1 ? (E.bendL ?? 0) : (E.bendR ?? 0) });
      }
      if (E.innerTuft) {
        // cream fur locks curling up out of the bowl (tapered, pointed, overlapping)
        const it = [];
        for (let i = 0; i < 3; i++) {
          const x0 = (i - 1) * w * 0.12, h0 = len * (0.04 + 0.03 * Math.abs(i - 1));
          const pts = [v3(x0, h0, w * 0.02), v3(x0 * 1.4, h0 + len * 0.2, w * 0.13), v3(x0 * 1.9, h0 + len * (0.42 - 0.08 * Math.abs(i - 1)), w * 0.15)];
          it.push(tube(pts, (t) => w * (0.11 - 0.015 * Math.abs(i - 1)) * Math.pow(1 - t, 0.8) + w * 0.006, segs(10), segs(12)));
        }
        const tg = merge(it); paint(tg, () => C(E.innerTuft));
        mk(tg, fm('#ffffff', 57, { fur: 0.4 }), em, 'earFluff');
      }
      if (E.tuft) {
        // tall black tuft: a tapered lock rising from the tip, curling slightly forward
        const tf = tube([v3(0, len * 0.86, -0.06 * R), v3(0, len * 1.0 + R * 0.18, -0.07 * R), v3(R * 0.02, len * 1.0 + R * 0.42, -0.01 * R), v3(R * 0.05, len * 1.0 + R * 0.58, 0.05 * R)], (t) => R * 0.045 * Math.pow(1 - t, 0.8) + R * 0.004, segs(10), segs(14));
        paint(tf, () => dark);
        mk(tf, fm('#ffffff', 57), em, 'earTuft');
      }
    }
  }
  // horns (goat)
  if (S.horns) {
    for (const side of [1, -1]) {
      const h = tube([v3(side * R * 0.35, R * 0.75, R * 0.1), v3(side * R * 0.5, R * 1.05, -R * 0.15), v3(side * R * 0.55, R * 1.05, -R * 0.55), v3(side * R * 0.6, R * 0.8, -R * 0.75)], (t) => R * 0.09 * (1 - t * 0.75), 8, 14);
      paint(h, (v) => mixc(C(S.horns), [1, 1, 1], (Math.sin(v.y * 160) > 0.6 ? 0.15 : 0)));
      mk(h, fm('#ffffff', 55, { fur: 0, gloss: 1 }), skull, 'horn');
    }
  }
  if (S.hat) {
    const H = S.hat;
    let g;
    // fit to the designed head: scale the old sphere-head hat by the real crown height and head width
    const topY = surf(v3(0, 1, 0)).p.y, sideX = surf(v3(1, 0.25, 0)).p.x;
    if (H.type === 'kerchief') {
      // a cloth cap over the crown: front edge high on the forehead (clear of brows), back edge low on the nape
      const fz = surf(v3(0, 0.2, 1)).p.z, bz = -surf(v3(0, 0.2, -1)).p.z;
      g = ell(sideX * 1.07, topY * 1.05, (fz + bz) * 0.5 * 1.07, segs(24), segs(16), 0); g.translate(0, 0, (fz - bz) * 0.5);
      const cut = (z) => R * (0.36 + 0.3 * z / R);
      deform(g, (v) => { const c = cut(v.z); if (v.y < c) v.y = c - (c - v.y) * 0.06; });
      g.scale(R / sideX / 1.03, R / topY / 1.02, R / sideX / 1.03);   // undone by the fit scale below
    }
    else if (H.type === 'cap') { const a = new THREE.CylinderGeometry(R * 0.72, R * 0.86, R * 0.42, segs(22)); a.translate(0, R * 0.82, -R * 0.05); const b = new THREE.CylinderGeometry(R * 1.25, R * 1.25, R * 0.05, segs(24)); b.translate(0, R * 0.62, -R * 0.05); g = merge([a, b]); }
    else { const a = new THREE.CylinderGeometry(R * 0.5, R * 0.7, R * 0.5, segs(18)); a.translate(0, R * 0.95, -R * 0.08); g = a; }
    g.scale(sideX / R * 1.03, topY / R * 1.02, sideX / R * 1.03);
    paint(g, () => C(H.color));
    mk(g, fm('#ffffff', 58, { fur: 0.2 }), skull, 'hat');
  }

  // ---------------------------------------------------------------- pose
  const rig = { name, root, hips, abd, chest, neck, head, skull, legs, arms, face, parts, contactParts, D, spec, hipY, tailPivot, tailLinks, strapLinks, jacket, flaps, pawMat: rig_paw };
  rig.setPose = (P) => setPose(rig, P);
  rig.anchor = (nm, out = new THREE.Vector3()) => {
    root.updateWorldMatrix(true, true);
    if (nm === 'head') return skull.getWorldPosition(out);
    if (nm === 'eyeL') return face.eyes[0].piv.getWorldPosition(out);
    if (nm === 'eyeR') return face.eyes[1].piv.getWorldPosition(out);
    if (nm === 'handL') return arms.L.wr.localToWorld(out.set(0, -D.hand * 0.8, 0));
    if (nm === 'handR') return arms.R.wr.localToWorld(out.set(0, -D.hand * 0.8, 0));
    if (nm === 'chest') return chest.getWorldPosition(out);
    return root.getWorldPosition(out);
  };
  return rig;
}

// ------------------------------------------------------------------ IK
function ik2(parent, upper, lower, target, pole, a, b, flipZ) {
  parent.updateWorldMatrix(true, false);
  const T = parent.worldToLocal(_a.copy(target));
  const Pl = parent.worldToLocal(_b.copy(pole));
  const Sp = upper.position;
  const d = _c.copy(T).sub(Sp);
  let dist = d.length();
  dist = Math.min(Math.max(dist, Math.abs(a - b) + 1e-3), (a + b) * 0.9995);
  const dir = d.normalize();
  const pn = _d.copy(Pl).sub(Sp); pn.addScaledVector(dir, -pn.dot(dir)).normalize();
  const cosA = (a * a + dist * dist - b * b) / (2 * a * dist);
  const A = Math.acos(Math.min(1, Math.max(-1, cosA)));
  const u = _e.copy(dir).multiplyScalar(Math.cos(A)).addScaledVector(pn, Math.sin(A));
  // upper basis: -Y along u, Z toward the pole (legs: knee forward) or away (arms: elbow back)
  const yA = u.clone().negate();
  const zA = pn.clone().multiplyScalar(flipZ ? -1 : 1); zA.addScaledVector(yA, -zA.dot(yA)).normalize();
  const xA = new THREE.Vector3().crossVectors(yA, zA);
  _m.makeBasis(xA, yA, zA);
  upper.quaternion.setFromRotationMatrix(_m);
  const K = Sp.clone().addScaledVector(u, a);
  const w = T.clone().sub(K).normalize();      // parent-local direction of the lower bone (with the reached distance)
  // use the clamped end point
  const Tend = Sp.clone().addScaledVector(dir, dist);
  w.copy(Tend).sub(K).normalize();
  _q.copy(upper.quaternion).invert();
  w.applyQuaternion(_q);
  lower.quaternion.setFromUnitVectors(NEG_Y, w);
}

const _xA = new THREE.Vector3(), _yA = new THREE.Vector3(), _zA = new THREE.Vector3(), _wq = new THREE.Quaternion();
const E = new THREE.Euler();
function setE(o, r, order = 'XYZ') { if (r) { E.set(r[0] || 0, r[1] || 0, r[2] || 0, order); o.quaternion.setFromEuler(E); } else o.quaternion.identity(); }

export function setPose(rig, P) {
  const { root, hips, abd, chest, neck, head, legs, arms, face, D } = rig;
  root.visible = P.visible !== false;
  if (!root.visible) return;
  root.position.set(...P.pos);
  root.rotation.set(0, P.yaw ?? 0, 0);
  const hp = P.hip ?? [0, rig.hipY, 0];
  hips.position.set(hp[0], hp[1], hp[2]);
  setE(hips, P.hipRot, 'YXZ');
  setE(abd, P.waist, 'YXZ');
  setE(chest, P.spine, 'YXZ');
  setE(neck, P.neck, 'YXZ');
  setE(head, P.head, 'YXZ');
  root.updateWorldMatrix(true, true);
  // legs
  for (const L of ['L', 'R']) {
    const g = legs[L], lp = P.legs && P.legs[L];
    if (lp && lp.foot) {
      const pole = lp.pole ? _c.set(...lp.pole) : (() => { const k = hips.localToWorld(new THREE.Vector3(L === 'L' ? D.hipW * 1.4 : -D.hipW * 1.4, -0.2, 1.5)); return k; })();
      ik2(hips, g.thigh, g.knee, new THREE.Vector3(...lp.foot), pole.clone(), D.thigh, D.shin, false);
      // foot orientation in world: yaw (+ root yaw), pitch, roll
      g.knee.updateWorldMatrix(true, false);
      g.knee.getWorldQuaternion(_q2);
      E.set(lp.pitch ?? 0, (P.yaw ?? 0) + (lp.yaw ?? 0), lp.roll ?? 0, 'YXZ');
      _q.setFromEuler(E);
      g.ankle.quaternion.copy(_q2.invert().multiply(_q));
    } else {
      setE(g.thigh, lp && lp.thigh); g.knee.rotation.set((lp && lp.knee) || 0, 0, 0); setE(g.ankle, lp && lp.ankle);
    }
  }
  // arms
  for (const L of ['L', 'R']) {
    const g = arms[L], ap = (P.arms && P.arms[L]) || {};
    if (ap.target) {
      const pole = ap.pole ? new THREE.Vector3(...ap.pole) : chest.localToWorld(new THREE.Vector3(g.side * 0.6, -0.1, -0.6));
      ik2(chest, g.sh, g.el, new THREE.Vector3(...ap.target), pole, D.upper, D.fore, true);
    } else {
      setE(g.sh, ap.sh ?? [0.05, 0, g.side * 0.12]);
      g.el.rotation.set(-(ap.el ?? 0.15), 0, 0);
    }
    setE(g.wr, ap.wr ?? [0, 0, 0]);
    if (ap.palm) {
      // aim the hand in world space: fingers along fingerDir (local -Y), palm along palm (local -Z), blended by palmW
      _yA.set(-ap.fingerDir[0], -ap.fingerDir[1], -ap.fingerDir[2]).normalize();
      _zA.set(-ap.palm[0], -ap.palm[1], -ap.palm[2]); _zA.addScaledVector(_yA, -_zA.dot(_yA)).normalize();
      _xA.crossVectors(_yA, _zA);
      _m.makeBasis(_xA, _yA, _zA);
      _wq.setFromRotationMatrix(_m);
      g.el.updateWorldMatrix(true, false);
      g.el.getWorldQuaternion(_q2);
      _wq.premultiply(_q2.invert());
      g.wr.quaternion.slerp(_wq, ap.palmW ?? 1);
    }
    const curl = ap.curl ?? 0.25;
    if (g.thumbs) {
      // ap.curls = per-finger overrides (index first), ap.spread fans the fingers, ap.thumb 0 open .. 1 closed
      const cs = ap.curls;
      for (const f of g.fingers) {
        const c = cs ? cs[f.i] : curl;
        f.f0.rotation.set(c * 1.32, 0, -g.side * (f.i - 1.5) * (ap.spread ?? 0.06) * 0.5);
        f.f1.rotation.set(c * 1.15, 0, 0);
      }
      const tc = ap.thumb ?? curl;
      g.thumbs[0].rotation.set(-0.15 + tc * 0.75, 0, g.side * (1.05 - tc * 0.85));
      g.thumbs[1].rotation.set(0.25 + tc * 0.8, 0, 0);
    } else {
      for (const f of g.fingers) f.rotation.set(curl * 1.5, 0, 0);
      g.thumb.rotation.set(-0.6 + curl * 0.6, 0, g.side * (0.5 - curl * 0.3));
    }
  }
  // face
  const fc = P.face || {};
  const blink = fc.blink ?? 0;
  for (const ey of face.eyes) {
    const u = ey.mat.uniforms;
    const lid = Math.max(blink, ey.side === 1 ? (fc.lidL ?? fc.lid ?? 0) : (fc.lidR ?? fc.lid ?? 0));
    u.uLidT.value = Math.min(1, lid);
    u.uLidB.value = fc.lidB ?? 0;
    u.uTilt.value = fc.tilt ?? 0;
    u.uLook.value.set(...(fc.look ?? [0, 0]));
    if (fc.pupil != null) u.uPupil.value = fc.pupil;
    u.uWet.value = fc.wet ?? 0;
    if (fc.detail != null) u.uDetail.value = fc.detail;
    if (fc.irisR != null) u.uIrisR.value = fc.irisR;
  }
  for (const b of face.brows) {
    const bl = Math.max(blink * 0.45, b.side === 1 ? (fc.lidL ?? fc.lid ?? 0) : (fc.lidR ?? fc.lid ?? 0));
    b.piv.position.set(0, ((fc.browUp ?? 0) - 1.15 * bl * bl * (2 - bl)) * D.headR * 0.18, 0);
    b.piv.rotation.set(0, 0, -b.side * (fc.browTilt ?? 0) * 0.5);
  }
  if (face.headMat) {
    const u = face.headMat.uniforms;
    // painted mouth: open amount, corners up (smile) or down (fear/shock: small pupils or worried brows)
    u.uMouth.value = (fc.mouth ?? 0) * 0.62;
    u.uSmile.value = fc.smile ?? 0;
    u.uDetail.value = fc.detail ?? 0;
    u.uYMouthK.value = fc.ymouthK ?? 1;      // 0: drop the Y/':3' cat mouth (shock, grief)
    u.uNarrow.value = fc.narrow ?? 0;        // small tight mouth
    u.uTear.value = fc.tear ?? 0;            // progress of the tears rolling down the cheeks
    u.uTear2.value = fc.tear2 ?? 0;
    u.uTeeth.value = fc.teeth ?? 0;
    u.uJaw.value = fc.jaw ?? 0;
  }
  for (const ey of face.eyes) ey.mat.uniforms.uRefl.value = fc.refl ?? 0;
  const ears = P.ears ?? [0, 0];
  for (const e of face.ears) e.piv.rotation.set(e.rx + ears[0], 0, e.rz - e.side * ears[1]);
  for (const e of face.earTips) e.piv.rotation.set((P.earTip ?? 0.2) + (e.bend ?? 0), 0, -e.side * (P.earTipZ ?? 0));
  const tl = P.tail ?? [0, 0];
  rig.tailPivot.rotation.set((rig.tailLinks.length ? 0 : -0.35) + tl[0], tl[1], 0);
  if (rig.tailLinks.length) rig.tailLinks.forEach((l, i) => { const c = P.tailChain && P.tailChain[i]; if (c) l.rotation.set(c[0], c[1], 0); else l.rotation.set(0, 0, 0); });
  if (rig.strapLinks.length) rig.strapLinks.forEach((l, i) => { const c = P.strap && P.strap[i]; if (c) l.rotation.set(c[0], 0, c[1]); else l.rotation.set(0, 0, 0); });
  if (rig.flaps.length) for (const f of rig.flaps) { const c = P.flaps && P.flaps[f.i]; f.f0.rotation.set(c ? c[0] : 0, 0, 0); f.f1.rotation.set(c ? c[1] : 0, 0, 0); }
  if (rig.pawMat) rig.pawMat.uniforms.uTint.value.set(0.96, 0.92, 0.88, P.pawWhite ?? 0);
  if (rig.jacket) skinJacket(rig);
  root.updateWorldMatrix(true, true);
  // glasses glare: lens planes in world space for the head and eye shaders
  if (face.lenses) {
    const k = fc.lens ?? 0;
    const mats = [face.headMat, ...face.eyes.map((e) => e.mat)];
    for (const m of mats) m.uniforms.uLensK.value = k;
    if (k > 0) {
      rig.skull.getWorldQuaternion(_lq); rig.skull.getWorldScale(_ls);
      face.lenses.forEach((l, i) => {
        const C = rig.skull.localToWorld(_lc.copy(l.c)), Nn = _ln.copy(l.n).applyQuaternion(_lq), X = _lx.set(1, 0, 0).applyQuaternion(_lq);
        X.addScaledVector(Nn, -X.dot(Nn)).normalize();
        for (const m of mats) { const u = m.uniforms; u['uLC' + i].value.copy(C); u['uLN' + i].value.copy(Nn); u['uLX' + i].value.copy(X); u.uLR.value.set(l.r * 0.88 * _ls.x, l.r * _ls.x); }
      });
    }
  }
}
const _lq = new THREE.Quaternion(), _ls = new THREE.Vector3(), _lc = new THREE.Vector3(), _ln = new THREE.Vector3(), _lx = new THREE.Vector3();

// CPU skinning of the jacket over hips / waist / chest (linear blend, in root space)
const _mH = new THREE.Matrix4(), _mA = new THREE.Matrix4(), _mC = new THREE.Matrix4();
function skinJacket(rig) {
  const { rest, restN, w, oA, oH, mesh } = rig.jacket;
  rig.hips.updateMatrix(); rig.abd.updateMatrix(); rig.chest.updateMatrix();
  _mH.copy(rig.hips.matrix); _mA.multiplyMatrices(_mH, rig.abd.matrix); _mC.multiplyMatrices(_mA, rig.chest.matrix);
  const ec = _mC.elements, ea = _mA.elements, eh = _mH.elements;
  const P = mesh.geometry.attributes.position, N = mesh.geometry.attributes.normal, pa = P.array, na = N.array;
  for (let i = 0, n = P.count; i < n; i++) {
    const i3 = i * 3, x = rest[i3], y0 = rest[i3 + 1], z = rest[i3 + 2], c = w[i3], a = w[i3 + 1], h = w[i3 + 2];
    const nx = restN[i3], ny = restN[i3 + 1], nz = restN[i3 + 2];
    const b = (e, y, wt, o, q) => {
      o[0] += wt * (e[0] * x + e[4] * y + e[8] * z + e[12]); o[1] += wt * (e[1] * x + e[5] * y + e[9] * z + e[13]); o[2] += wt * (e[2] * x + e[6] * y + e[10] * z + e[14]);
      q[0] += wt * (e[0] * nx + e[4] * ny + e[8] * nz); q[1] += wt * (e[1] * nx + e[5] * ny + e[9] * nz); q[2] += wt * (e[2] * nx + e[6] * ny + e[10] * nz);
    };
    const o = _o.fill(0), q = _q3.fill(0);
    if (c > 0) b(ec, y0, c, o, q);
    if (a > 0) b(ea, y0 + oA, a, o, q);
    if (h > 0) b(eh, y0 + oH, h, o, q);
    pa[i3] = o[0]; pa[i3 + 1] = o[1]; pa[i3 + 2] = o[2];
    na[i3] = q[0]; na[i3 + 1] = q[1]; na[i3 + 2] = q[2];
  }
  P.needsUpdate = true; N.needsUpdate = true;
}
const _o = [0, 0, 0], _q3 = [0, 0, 0];
