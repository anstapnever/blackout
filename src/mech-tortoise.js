import * as THREE from 'three';
import { Kit, v3, hull, cbox, superPts, cyl, cylZ, cylX, ball, tube, patch, solid, boxUV, coneZ, extrude, ring, ringZ, lames, seg } from './mech-geo.js';

// MECH dept: TORTOISE, the shield mech. 40 m, squat, copper and dark teal, rounded shell, hatch high on the back.
// Metres. Root at the pelvis, +Y up, +Z forward, +X its left. Limbs hang along -Y from each joint.
export const SK_T = {
  waist: 2.6, chest: 3.6, head: 18.0,
  shX: 13.6, shY: 9.0, L1a: 10.0, L2a: 11.0,
  hipX: 7.0, hipY: -1.4, L1: 7.6, L2: 7.6, ankleH: 2.8,
};

const COP = { col: '#b56a3c', metal: 0.82, detail: 1, tone: 0.06, wear: 1, pw: 6.5, ph: 3.2, riv: 0.9 };
const COPL = { col: '#d29060', metal: 0.85, detail: 0.8, tone: 0.05, wear: 0.8, pw: 3.2, ph: 2.0, riv: 0 };
const TEAL = { col: '#4b9a92', metal: 0.42, detail: 1, tone: 0.06, wear: 1, pw: 7.5, ph: 4.2, riv: 0.9 };
const TEALD = { col: '#347a78', metal: 0.42, detail: 1, tone: 0.06, wear: 1.1, pw: 6, ph: 3.6, riv: 0.8 };
const JT = { col: '#23222a', metal: 0.5, detail: 0.5, tone: 0.06, wear: 0.5, pw: 2, ph: 0.8, riv: 0 };
const IR = { col: '#3c3a42', metal: 0.5, detail: 0.7, tone: 0.06, wear: 0.9, pw: 2.2, ph: 1.0, riv: 0.5 };
const BRASS = { col: '#c49a50', metal: 0.9, detail: 0.5, tone: 0.04, wear: 0.5, pw: 1.4, ph: 1, riv: 0 };
const GLOW = { col: '#ffbb66', metal: 0, detail: 0, emis: 3, tone: 0, wear: 0 };

export function buildTortoise(material) {
  const j = {};
  const root = new THREE.Group(); root.name = 'tortoise'; j.root = root;
  const J = (name, parent, pos) => { const g = new THREE.Group(); g.name = name; g.position.set(...pos); parent.add(g); j[name] = g; return g; };
  const k = new Kit(37);
  const pelvis = J('pelvis', root, [0, 0, 0]);
  const waist = J('waist', pelvis, [0, SK_T.waist, 0]);
  const chest = J('chest', waist, [0, SK_T.chest, 0]);
  J('head', chest, [0, SK_T.head, 4.2]);
  const hatch = J('hatch', chest, [0, 18.2, -11.9]);       // pivot at the upper edge of the door: it opens up and back
  for (const [s, L] of [[1, 'L'], [-1, 'R']]) {
    const hip = J('hip' + L, pelvis, [s * SK_T.hipX, SK_T.hipY, 0]);
    const knee = J('knee' + L, hip, [0, -SK_T.L1, 0]);
    J('ank' + L, knee, [0, -SK_T.L2, 0]);
    const sh = J('sh' + L, chest, [s * SK_T.shX, SK_T.shY, 0]);
    const el = J('el' + L, sh, [0, -SK_T.L1a, 0]);
    J('wr' + L, el, [0, -SK_T.L2a, 0]);
  }
  shell(k);
  headBuild(k);
  hatchBuild(k);
  lower(k);
  for (const [s, L] of [[1, 'L'], [-1, 'R']]) { leg(k, s, L); arm(k, s, L); }
  const meshes = k.finish(j, material);
  return { root, j, meshes, tris: k.tris };
}

function shell(k) {
  const b = 'chest';
  // the great rounded shell: dome from the waist to the crown, set back
  const S = tube([[-1.5, 8.6, 7.0, -0.6, 2.25], [2.5, 11.4, 8.9, -1.6, 2.2], [8.0, 12.9, 10.4, -2.6, 2.2], [13.5, 11.8, 10.2, -3.0, 2.25], [18.0, 8.0, 7.8, -3.0, 2.3], [21.0, 1.4, 1.4, -3.0, 2.3]]);
  k.add(b, solid(S, { nu: 40, nv: 16, crease: 48 }), TEALD);
  // back and side scutes in staggered rows: copper-bound hexagons
  const rows = [[0.08, 0.32], [0.32, 0.55], [0.55, 0.78], [0.78, 0.97]];
  rows.forEach(([v0, v1], r) => {
    const n = r === 3 ? 4 : 6, off = r % 2 ? 0.5 : 0;
    for (let i = 0; i < n; i++) {
      const u0 = 0.27 + (i + off * 0.5) * (0.46 / n), u1 = u0 + 0.46 / n - 0.008;
      const cu = (u0 + u1) / 2, h = (u1 - u0) / 2;
      const shape = [[cu - h, v0 + 0.012], [cu + h, v0 + 0.012], [cu + h * 0.94, v1 - 0.012], [cu - h * 0.94, v1 - 0.012]];
      const skip = (r === 2 && Math.abs(cu - 0.5) < 0.07);      // the hatch sits here
      if (skip) continue;
      k.add(b, patch(S, shape, { nu: 6, nv: 4, t: 0.42, crown: 0.42, ch: 0.28 }), i % 2 === r % 2 ? TEAL : { ...TEALD, col: '#234d4c' });
      k.add(b, patch(S, [[cu - h * 0.56, v0 + 0.05], [cu + h * 0.56, v0 + 0.05], [cu + h * 0.54, v1 - 0.05], [cu - h * 0.54, v1 - 0.05]], { nu: 4, nv: 3, t: 0.28, lift: 0.44, crown: 0.16 }), { ...COP, pw: 2.2, ph: 1.6, riv: 0.46 });
    }
  });
  // chest front: copper breastplate and teal side plates, a riveted collar
  k.add(b, patch(S, [[-0.15, 0.1], [0.15, 0.1], [0.14, 0.72], [-0.14, 0.72]], { nu: 6, nv: 7, t: 0.6, crown: 0.9 }), COP);
  for (const s of [1, -1]) {
    const M = { mirror: s < 0 };
    k.add(b, patch(S, [[0.15, 0.1], [0.27, 0.1], [0.27, 0.72], [0.14, 0.72]], { nu: 4, nv: 7, t: 0.44, crown: 0.5 }), TEAL, undefined, undefined, M);
    // horizontal bracing straps
    k.add(b, patch(S, [[0.0, 0.42], [0.27, 0.42], [0.27, 0.48], [0.0, 0.48]], { nu: 6, nv: 1, t: 0.62, lift: 0.5 }), { ...BRASS, pw: 3, ph: 1 }, undefined, undefined, M);
    // shoulder ring
    k.add(b, cylX(5.2, 2.6, 44), TEALD, [11.8, 9.0, -1], undefined, M);
    k.add(b, new THREE.TorusGeometry(5.2, 0.4, 8, 36).rotateY(Math.PI / 2), BRASS, [13.1, 9.0, -1], undefined, M);
  }
  // central viewing slot on the breastplate
  k.add(b, cbox(5.6, 0.9, 0.7, 0.12), JT, [0, 13.2, 11.2]);
  k.add(b, cbox(5.0, 0.3, 0.4, 0.06), GLOW, [0, 13.2, 11.5]);
  // crown collar around the head
  k.add(b, new THREE.TorusGeometry(5.0, 0.7, 10, 44).rotateX(Math.PI / 2), BRASS, [0, 19.7, 4.1]);
  k.add(b, new THREE.CylinderGeometry(4.9, 5.4, 1.5, 36), TEALD, [0, 18.9, 4.2]);
}

function headBuild(k) {
  const b = 'head';
  // squat, sunk in the collar: wide dome with a slit visor and a chin plate
  const H = tube([[-1.6, 3.3, 3.2, 0.1, 2.2], [0.4, 4.1, 4.0, 0.1, 2.2], [2.4, 3.9, 3.8, 0, 2.2], [3.6, 2.6, 2.7, -0.1, 2.2], [4.3, 0.8, 0.8, -0.1, 2.2]]);
  k.add(b, solid(H, { nu: 26, nv: 8 }), { ...COP, pw: 2.2, ph: 1.6, riv: 0.46 });
  k.add(b, cbox(7.2, 1.0, 1.6, 0.18), JT, [0, 1.1, 3.6]);
  k.add(b, cbox(6.2, 0.34, 0.5, 0.08), GLOW, [0, 1.1, 4.3]);
  k.add(b, hull([v3(-3.1, -0.3, 3.5), v3(3.1, -0.3, 3.5), v3(-2.4, -1.8, 4.2), v3(2.4, -1.8, 4.2), v3(-2.5, -1.6, 1.8), v3(2.5, -1.6, 1.8)], 22), TEAL);
  for (const s of [1, -1]) k.add(b, cylX(1.1, 0.8, 25), BRASS, [s * 4.1, 0.9, 0.4]);
  k.add(b, cbox(0.5, 1.8, 3.8, 0.14), COPL, [0, 4.5, -0.6]);
}

function hatchBuild(k) {
  const b = 'hatch';
  // circular steel door hinged at its top edge; local -Y runs down the door, +Z points out of the shell
  const R = 2.6, cy = -2.75;
  k.add(b, cylZ(R, 0.42, 34), { ...TEAL, pw: 2.2, ph: 1.6, riv: 0.4 }, [0, cy, 0]);
  k.add(b, new THREE.TorusGeometry(R, 0.22, 8, 40), BRASS, [0, cy, 0.22]);
  k.add(b, cylZ(0.95, 0.5, 18), IR, [0, cy, 0.4]);
  // hand wheel
  k.add(b, new THREE.TorusGeometry(1.15, 0.16, 8, 30), BRASS, [0, cy, 0.9]);
  for (let i = 0; i < 4; i++) { const a = (i / 4) * Math.PI * 2; k.add(b, boxUV(0.16, 1.1, 0.16), BRASS, [Math.cos(a) * 0.62, cy + Math.sin(a) * 0.62, 0.86], [0, 0, (a * 180) / Math.PI - 90]); }
  // heavy pull handle a small pilot could reach
  k.add(b, boxUV(1.4, 0.2, 0.2), IR, [0, cy - 1.3, 0.5]);
  for (const s of [-1, 1]) k.add(b, cylX(0.36, 1.3, 19), IR, [s * 1.4, 0, 0]);
  // the frame on the shell (static, on the chest)
  const c = 'chest';
  k.add(c, new THREE.TorusGeometry(R + 0.3, 0.5, 8, 40).scale(1, 1, 0.5), { ...IR, pw: 1.8, ph: 1 }, [0, 18.2 + cy, -11.85], [14, 0, 0]);
  k.add(c, cylZ(R - 0.2, 0.6, 28), { ...JT, detail: 0 }, [0, 18.2 + cy, -11.7], [14, 0, 0]);
}

function lower(k) {
  const W = 'waist', P = 'pelvis';
  for (let i = 0; i < 5; i++) k.add(W, cylUVB(7.8 - Math.sin(i / 4 * Math.PI) * 0.8, 0.82), i % 2 ? IR : JT, [0, -1.8 + i * 1.0, -0.6]);
  k.add(P, hull(superPts(9.6, 3.4, 7.8, 2.3, 26).map((p) => p.add(v3(0, -0.7, -0.5))), 34), TEALD);
  for (const s of [1, -1]) {
    const M = { mirror: s < 0 };
    k.add(P, cbox(1.5, 6.4, 7.0, 0.32, { wt: 1.1, dt: 5.5 }), COP, [10.4, -2.2, -0.5], [0, 0, -9], M);
    k.add(P, cylX(3.3, 2.4, 32), JT, [8.2, -1.4, 0], undefined, M);
  }
  k.add(P, hull([v3(-3.2, 0.8, 7.2), v3(3.2, 0.8, 7.2), v3(-2.6, -3.2, 8.0), v3(2.6, -3.2, 8.0), v3(-1.6, -5.0, 6.2), v3(1.6, -5.0, 6.2), v3(0, -1.0, 8.6)], 24), COP);
}
const cylUVB = (r, h) => new THREE.CylinderGeometry(r, r, h, 40);

function leg(k, s, L) {
  const h = 'hip' + L, kn = 'knee' + L, an = 'ank' + L;
  k.add(h, cylX(3.6, 6.0, 35), JT, [0, 0, 0]);
  const T = tube([[1.0, 4.4, 4.8, 0.2, 2.25], [-2.6, 5.0, 5.4, 0.4, 2.25], [-6.8, 3.9, 4.3, 0.2, 2.25]]);
  k.add(h, solid(T, { nu: 26, nv: 8 }), TEALD);
  lames(k, h, T, [[0.14, 0.38], [0.36, 0.6], [0.58, 0.82]], [{ ...TEAL, pw: 3.2, ph: 1.8, riv: 0.5 }, { ...TEALD, pw: 3.2, ph: 1.8, riv: 0.5 }], { sectors: 6, t: 0.3, step: 0.08 });
  k.add(h, patch(T, [[-0.12, 0.08], [0.12, 0.08], [0.12, 0.85], [-0.12, 0.85]], { nu: 6, nv: 4, t: 0.3, lift: 0.5, crown: 0.4 }), { ...COP, pw: 3.2, ph: 1.6, riv: 0.5 });
  for (let i = 0; i < 5; i++) k.add(h, boxUV(2.2, 0.16, 0.3), JT, [0, -2.0 - i * 0.95, -5.3]);
  k.add(kn, cylX(3.4, 7.0, 35), JT, [0, 0, 0]);
  k.add(kn, hull(superPts(3.6, 3.8, 2.3, 2.3, 22).map((p) => p.add(v3(0, -0.5, 3.0))), 28), { ...COP, pw: 2.6, ph: 1.6, riv: 0.46 });
  const S = tube([[-0.6, 3.7, 4.0, -0.2, 2.25], [-3.4, 4.6, 5.0, -0.3, 2.25], [-6.9, 3.7, 4.0, 0, 2.25]]);
  k.add(kn, solid(S, { nu: 26, nv: 8 }), TEALD);
  lames(k, kn, S, [[0.12, 0.36], [0.34, 0.58], [0.56, 0.8], [0.78, 0.94]], [{ ...TEAL, pw: 3.2, ph: 1.8, riv: 0.5 }, { ...TEALD, pw: 3.2, ph: 1.8, riv: 0.5 }], { sectors: 6, t: 0.3, step: 0.07 });
  k.add(kn, patch(S, [[-0.13, 0.15], [0.13, 0.15], [0.13, 0.92], [-0.13, 0.92]], { nu: 6, nv: 4, t: 0.3, lift: 0.5, crown: 0.34 }), { ...COP, pw: 3, ph: 1.6, riv: 0.5 });
  k.add(kn, patch(S, [[0, 0.5], [1, 0.5], [1, 0.54], [0, 0.54]], { nu: 26, nv: 1, t: 0.18, lift: 0.72 }), { ...BRASS, pw: 3, ph: 1 });
  // ankle and foot: an elephant's pad with claws that dig
  k.add(an, ball(3.2, 30, 20), JT, [0, 0, 0]);
  k.add(an, hull([v3(-5.0, -2.8, -3.6), v3(5.0, -2.8, -3.6), v3(-5.6, -2.8, 3.4), v3(5.6, -2.8, 3.4), v3(-4.6, -0.6, -2.5), v3(4.6, -0.6, -2.5), v3(-4.3, -0.5, 1.8), v3(4.3, -0.5, 1.8), v3(-4.8, -0.4, 5.6), v3(4.8, -0.4, 5.6), v3(-5.5, -2.8, 7.4), v3(5.5, -2.8, 7.4)], 24), TEALD);
  k.add(an, hull([v3(-5.3, -2.82, 7.2), v3(5.3, -2.82, 7.2), v3(-4.7, -1.7, 7.0), v3(4.7, -1.7, 7.0), v3(-5, -2.82, 8.0), v3(5, -2.82, 8.0)], 22), BRASS);
  for (const a of [-1, 0, 1]) k.add(an, hull([v3(-1.5, -2.8, 7.2), v3(1.5, -2.8, 7.2), v3(-1.0, -1.7, 7.2), v3(1.0, -1.7, 7.2), v3(-0.4, -2.8, 11.2), v3(0.4, -2.8, 11.2), v3(0, -2.4, 11.4)], 28), COP, [a * 3.5, 0, 0], [0, -a * 8, 0]);
  void s;
}

function arm(k, s, L) {
  const b = 'sh' + L, el = 'el' + L, wr = 'wr' + L;
  const COPS = { ...COP, pw: 3.2, ph: 1.5, riv: 0.5 }, COPT = { ...COPL, pw: 2.6, ph: 1.4, riv: 0.5 };
  const TL = { ...TEAL, pw: 3.0, ph: 1.6, riv: 0.5 }, TD = { ...TEALD, pw: 3.0, ph: 1.6, riv: 0.5 };
  // shoulder drum and a pauldron of overlapping copper lames over a dark core: never a smooth ball
  k.add(b, ball(4.8, 30, 22), JT, [0, 0, 0]);
  const P = tube([[-2.0, 5.0, 5.0, 0, 2.35, s * 0.8], [0.2, 6.3, 6.3, 0, 2.35, s * 0.8], [2.6, 6.2, 6.1, 0, 2.35, s * 0.8], [4.6, 4.8, 4.7, 0, 2.3, s * 0.8], [6.4, 1.6, 1.5, 0, 2.2, s * 0.8]]);
  k.add(b, solid(P, { nu: 26, nv: 10 }), TEALD);
  lames(k, b, P, [[0.04, 0.27], [0.25, 0.47], [0.45, 0.68], [0.66, 0.9]], [COPS, COPT], { sectors: 6, t: 0.34, step: 0.1, crown: 0.26 });
  k.add(b, new THREE.TorusGeometry(6.0, 0.3, 10, 72).rotateX(Math.PI / 2), BRASS, [s * 0.8, -1.2, 0]);
  // a riveted crest and a flared outer plate: the pauldron must not read as a ball in silhouette
  k.add(b, hull([v3(s * 0.2, 4.4, -6.2), v3(s * 1.5, 4.4, -6.2), v3(s * 0.2, 4.4, 5.6), v3(s * 1.5, 4.4, 5.6), v3(s * 0.65, 10.2, -5.0), v3(s * 1.05, 10.2, -5.0), v3(s * 0.65, 8.2, 3.0), v3(s * 1.05, 8.2, 3.0)], 24), COPS);
  k.add(b, hull([v3(s * 5.2, 3.4, -5.4), v3(s * 5.2, 3.4, 5.4), v3(s * 5.2, -2.2, -4.6), v3(s * 5.2, -2.2, 4.6), v3(s * 9.0, 1.0, -3.6), v3(s * 9.0, 1.0, 3.6), v3(s * 9.0, -4.4, -2.8), v3(s * 9.0, -4.4, 2.8)], 24), TD);
  // vents and a tiny service hatch for size
  for (let i = 0; i < 5; i++) k.add(b, boxUV(0.2, 0.22, 4.4), JT, [s * 9.05, -3.2 + i * 0.86, 0]);
  k.add(b, cbox(0.25, 1.5, 1.0, 0.06), IR, [s * 7.05, 4.6, 0], [0, 0, s * 24]);
  k.add(b, new THREE.TorusGeometry(0.22, 0.05, 6, 14).rotateY(Math.PI / 2), BRASS, [s * 7.2, 4.6, 0]);
  // upper arm: rings of overlapping plates and straps
  const U = tube([[-1.5, 3.6, 3.8, 0, 2.3], [-5.0, 4.3, 4.5, 0, 2.3], [-9.2, 3.5, 3.6, 0, 2.3]]);
  k.add(b, solid(U, { nu: 22, nv: 8 }), TEALD);
  lames(k, b, U, [[0.12, 0.34], [0.32, 0.54], [0.52, 0.74], [0.72, 0.9]], [TL, TD], { sectors: 5, t: 0.3, step: 0.07 });
  k.add(b, patch(U, [[0.08, 0.3], [0.42, 0.3], [0.42, 0.7], [0.08, 0.7]], { nu: 7, nv: 4, t: 0.26, lift: 0.5, crown: 0.26 }), COPS);
  k.add(b, patch(U, [[0, 0.46], [1, 0.46], [1, 0.52], [0, 0.52]], { nu: 26, nv: 1, t: 0.2, lift: 0.82 }), { ...BRASS, pw: 3, ph: 1 });
  // elbow and forearm: a heavy gauntlet, overlapping toward the wrist, ribbed and vented
  k.add(el, cylX(3.1, 6.0, 54), JT, [0, 0, 0]);
  k.add(el, hull(superPts(3.5, 2.7, 3.1, 2.3, 16).map((p) => p.add(v3(0, 0.1, 2.7))), 30), COPS);
  const F = tube([[-0.8, 3.4, 3.6, 0, 2.3], [-5, 4.6, 4.9, 0, 2.3], [-9.6, 4.9, 5.1, 0, 2.3], [-10.9, 3.6, 3.8, 0, 2.3]]);
  k.add(el, solid(F, { nu: 22, nv: 10 }), TEALD);
  lames(k, el, F, [[0.08, 0.3], [0.28, 0.5], [0.48, 0.7], [0.68, 0.9]], [TL, TD], { sectors: 5, t: 0.3, step: 0.07 });
  k.add(el, patch(F, [[0.0, 0.25], [0.5, 0.25], [0.5, 0.86], [0.0, 0.86]], { nu: 8, nv: 4, t: 0.3, lift: 0.5, crown: 0.34 }), COPS);
  for (const v of [0.34, 0.62]) k.add(el, patch(F, [[0, v], [1, v], [1, v + 0.05], [0, v + 0.05]], { nu: 26, nv: 1, t: 0.18, lift: 0.84 }), { ...BRASS, pw: 3, ph: 1 });
  for (let i = 0; i < 6; i++) k.add(el, boxUV(1.4, 0.18, 0.36), JT, [s * 4.8, -3.6 - i * 1.15, 0], [0, 90, 0]);
  // wrist cuff, back-of-hand lames, palm, and fingers with three real phalanges and knuckle joints
  k.add(wr, ball(2.5, 24, 16), JT, [0, 0, 0]);
  k.add(wr, new THREE.CylinderGeometry(3.6, 3.1, 1.3, 30), COPS, [0, -0.6, 0.4]);
  k.add(wr, cbox(6.2, 2.8, 5.0, 0.85, { wt: 5.0, dt: 3.9 }), { ...IR, pw: 2.0, ph: 1.4, riv: 0.5 }, [0, -2.6, 0.5]);
  for (const q of [-1, 0, 1]) { k.add(wr, boxUV(3.9, 0.14, 0.34), JT, [0, -1.18, 0.5 + q * 1.15]); k.add(wr, cbox(0.3, 2.1, 0.7, 0.08), COPS, [s * 3.02, -2.7, 0.5 + q * 1.5]); }
  k.add(wr, cbox(4.0, 1.2, 0.34, 0.1), COPS, [0, -2.6, -1.98]);
  for (let i = 0; i < 3; i++) k.add(wr, cbox(6.0 - i * 0.3, 1.45, 0.55, 0.14), i === 1 ? TL : COPS, [0, -1.4 - i * 1.12, 3.1 + i * 0.1], [-6, 0, 0]);
  for (let f = -1; f <= 1; f++) {
    const x = f * 2.05, K = [x, -4.1, 3.2], M = [x, -6.4, 3.6], T = [x, -7.3, 1.4], E = [x, -6.2, -0.5];
    for (const q of [K, M, T]) k.add(wr, cylX(0.95, 1.7, 28), JT, q);
    seg(k, wr, K, M, 1.7, 1.9, TL);
    seg(k, wr, M, T, 1.6, 1.7, TD);
    seg(k, wr, T, E, 1.45, 1.5, COPS, { wt: 1.05, dt: 1.1 });
    k.add(wr, boxUV(1.25, 0.34, 0.3), BRASS, [x, -4.1, 4.15]);
    k.add(wr, boxUV(1.15, 0.3, 0.3), BRASS, [x, -6.4, 4.55]);
  }
  // thumb
  const T0 = [s * 3.1, -2.0, 1.4], T1 = [s * 4.1, -4.2, 2.4], T2 = [s * 3.1, -5.6, 1.2];
  k.add(wr, ball(1.1, 16, 12), JT, T0); k.add(wr, ball(0.95, 16, 12), JT, T1);
  seg(k, wr, T0, T1, 1.75, 1.75, TL);
  seg(k, wr, T1, T2, 1.5, 1.5, COPS, { wt: 1.1, dt: 1.1 });
}
