import * as THREE from 'three';
import { Kit, v3, hull, cbox, superPts, cyl, cylZ, cylX, ring, ball, tube, patch, solid, extrude, boxUV, coneZ, lames, seg } from './mech-geo.js';

// MECH dept: HERON, the sniper mech. 42 m, lanky, white lacquer and vermilion, wide brimmed helm with one round lens.
// Metres. Root at the pelvis. +Y up, +Z forward, +X its left. Limbs hang along -Y from each joint.
export const SK_H = {
  waist: 3.0, chest: 3.6, neck: 8.6, head: 2.4,
  shX: 6.0, shY: 6.4, L1a: 12.6, L2a: 13.2,
  hipX: 2.7, hipY: -1.6, L1: 11.2, L2: 11.2, ankleH: 2.5,
};

const W = { col: '#e9e6dc', metal: 0.42, detail: 0.62, tone: 0.03, wear: 0.55, pw: 8.5, ph: 6.5, riv: 0 };
const WD = { col: '#cfccc4', metal: 0.4, detail: 0.8, tone: 0.04, wear: 0.75, pw: 5.5, ph: 3.2, riv: 0.8 };
const VER = { col: '#d9402a', metal: 0.5, detail: 0.8, tone: 0.04, wear: 0.6, pw: 3, ph: 1.8, riv: 0 };
const VERD = { col: '#a52d22', metal: 0.5, detail: 0.8, tone: 0.05, wear: 0.7, pw: 2, ph: 1.5, riv: 0.5 };
const JT = { col: '#2b2d38', metal: 0.5, detail: 0.5, tone: 0.06, wear: 0.4, pw: 2, ph: 0.6, riv: 0 };
const GOLD = { col: '#c9a35a', metal: 0.9, detail: 0.4, tone: 0.03, wear: 0.4, pw: 2, ph: 1, riv: 0 };
const LENS = { col: '#c04a20', metal: 0, detail: 0, emis: 2, tone: 0, wear: 0 };
const IR = { col: '#3a3844', metal: 0.5, detail: 0.7, tone: 0.06, wear: 0.8, pw: 1.8, ph: 0.8, riv: 0 };

export function buildHeron(material) {
  const j = {};
  const root = new THREE.Group(); root.name = 'heron'; j.root = root;
  const J = (name, parent, pos) => { const g = new THREE.Group(); g.name = name; g.position.set(...pos); parent.add(g); j[name] = g; return g; };
  const k = new Kit(11);
  const pelvis = J('pelvis', root, [0, 0, 0]);
  const waist = J('waist', pelvis, [0, SK_H.waist, 0]);
  const chest = J('chest', waist, [0, SK_H.chest, 0]);
  const neck = J('neck', chest, [0, SK_H.neck, 0.5]);
  J('head', neck, [0, SK_H.head, 0.4]);
  for (const [s, L] of [[1, 'L'], [-1, 'R']]) {
    const hip = J('hip' + L, pelvis, [s * SK_H.hipX, SK_H.hipY, 0]);
    const knee = J('knee' + L, hip, [0, -SK_H.L1, 0]);
    J('ank' + L, knee, [0, -SK_H.L2, 0]);
    const sh = J('sh' + L, chest, [s * SK_H.shX, SK_H.shY, -0.3]);
    const el = J('el' + L, sh, [0, -SK_H.L1a, 0]);
    const wr = J('wr' + L, el, [0, -SK_H.L2a, 0]);
    J('hand' + L, wr, [0, 0, 0]);
  }
  head(k); neckBuild(k); torso(k);
  for (const [s, L] of [[1, 'L'], [-1, 'R']]) { leg(k, s, L); arm(k, s, L); }
  const meshes = k.finish(j, material);
  return { root, j, meshes, tris: k.tris };
}

function head(k) {
  const b = 'head';
  // the brim: a wide lacquered hat, shallow cone with a raised crown
  const brimR = 6.6;
  const brim = hull(superPts(brimR, 0.42, brimR, 2.0, 30).map((p) => p.add(v3(0, 2.0, -0.4))), 36);
  k.add(b, brim, W);
  k.add(b, new THREE.TorusGeometry(brimR - 0.08, 0.2, 6, 72).rotateX(Math.PI / 2), GOLD, [0, 2.0, -0.4]);
  const cone = hull(superPts(3.4, 1.7, 3.4, 2.1, 26).map((p) => p.add(v3(0, 3.2, -0.4))), 40);
  k.add(b, cone, W);
  k.add(b, new THREE.TorusGeometry(3.42, 0.2, 6, 48).rotateX(Math.PI / 2), VER, [0, 2.65, -0.4]);
  k.add(b, ball(0.7, 12, 8), GOLD, [0, 5.0, -0.4]);
  k.add(b, new THREE.CylinderGeometry(0.28, 0.5, 2.0, 10), GOLD, [0, 6.1, -0.4]);
  // radial ribs across the underside of the brim
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    k.add(b, hull([v3(0.0, -0.05, 3.2), v3(0.25, -0.05, 3.2), v3(0, -0.05, 6.4), v3(0.25, -0.05, 6.4), v3(0.0, 0.2, 3.2), v3(0.25, 0.2, 3.2), v3(0.0, 0.2, 6.4), v3(0.25, 0.2, 6.4)], 20), VER, [0, 1.62, -0.4], [0, (a * 180) / Math.PI, 0]);
  }
  // face: a narrow armoured drum with the one round lens
  k.add(b, solid(tube([[-0.8, 1.55, 1.75, 0.2, 2.3], [0.3, 2.05, 2.25, 0.2, 2.3], [1.0, 2.15, 2.35, 0.2, 2.3], [1.75, 2.05, 2.2, 0.0, 2.3]]), { nu: 28, nv: 6 }), WD);
  k.add(b, new THREE.CylinderGeometry(2.0, 1.75, 0.4, 28), VERD, [0, -1.0, 0.2]);
  // the lens
  k.add(b, coneZ(1.45, 1.75, 0.55, 40), { ...GOLD, detail: 0.2 }, [0, 0.45, 2.35]);
  k.add(b, new THREE.TorusGeometry(1.6, 0.26, 8, 44), JT, [0, 0.45, 2.66]);
  k.add(b, new THREE.TorusGeometry(1.17, 0.14, 6, 40), GOLD, [0, 0.45, 2.75]);
  k.add(b, new THREE.SphereGeometry(1.06, 22, 14).scale(1, 1, 0.42), LENS, [0, 0.45, 2.55]);
  // cheek guards and little cooling slits
  for (const s of [1, -1]) {
    const M = { mirror: s < 0 };
    k.add(b, cbox(0.7, 2.6, 2.6, 0.18, { dt: 1.4, zt: 0.3 }), VERD, [2.2, -0.05, 0.6], [0, 0, 8], M);
    for (let i = 0; i < 3; i++) k.add(b, boxUV(0.14, 0.14, 1.1), JT, [2.56, 0.28 - i * 0.48, 0.6], undefined, M);
    // long crest plumes sweeping back, the heron's nape feathers
    k.add(b, hull([v3(1.0, 0.6, -2.2), v3(2.0, 0.8, -2.0), v3(1.8, 0.6, -6.5), v3(1.0, 0.4, -9.5), v3(1.45, 0.25, -4.2)], 30), W, undefined, undefined, M);
    k.add(b, hull([v3(1.4, 0.2, -1.9), v3(2.3, 0.3, -1.7), v3(2.6, -0.3, -5.2), v3(2.0, -0.7, -7.0)], 30), VER, undefined, undefined, M);
  }
  // chin keel
  k.add(b, hull([v3(0, -1.4, 1.5), v3(0.8, -0.9, 1.5), v3(-0.8, -0.9, 1.5), v3(0, -1.9, 0.7), v3(0.7, -1.0, 0.2), v3(-0.7, -1.0, 0.2)], 20), GOLD);
}

function neckBuild(k) {
  const b = 'neck';
  for (let i = 0; i < 5; i++) k.add(b, new THREE.CylinderGeometry(1.7 - i * 0.1, 1.85 - i * 0.1, 0.62, 16), i % 2 ? JT : IR, [0, -i * 1.18, -0.1 - i * 0.05]);
  k.add(b, cbox(1.0, 1.6, 2.2, 0.2), VERD, [0, 1.5, 0.05]);
  for (const s of [1, -1]) k.member(b, [s * 0.9, 1.1, -0.2], [s * 1.5, -6.2, 0.1], 0.5, 0.5, GOLD);
}

function torso(k) {
  // chest: narrow and tall, a keel plate down the front
  const C = tube([[-0.8, 3.2, 2.5, 0.1, 2.3], [2.2, 4.3, 3.1, 0.3, 2.3], [5.2, 4.8, 3.5, 0.4, 2.3], [7.8, 3.8, 3.0, 0.1, 2.3], [8.6, 1.9, 1.7, 0.1, 2.3]]);
  k.add('chest', solid(C, { nu: 28, nv: 12 }), WD);
  for (const s of [1, -1]) {
    const M = { mirror: s < 0 };
    k.add('chest', patch(C, [[0.04, 0.26], [0.16, 0.25], [0.18, 0.78], [0.05, 0.82]], { nu: 6, nv: 7, t: 0.34, crown: 0.22 }), W, undefined, undefined, M);
    k.add('chest', patch(C, [[0.17, 0.2], [0.34, 0.2], [0.34, 0.72], [0.18, 0.76]], { nu: 5, nv: 6, t: 0.3, crown: 0.2 }), W, undefined, undefined, M);
    k.add('chest', patch(C, [[0.34, 0.25], [0.46, 0.25], [0.46, 0.75], [0.34, 0.76]], { nu: 4, nv: 5, t: 0.26, crown: 0.14 }), WD, undefined, undefined, M);
    k.add('chest', patch(C, [[0.04, 0.82], [0.32, 0.8], [0.3, 0.97], [0.05, 0.98]], { nu: 6, nv: 3, t: 0.22 }), VER, undefined, undefined, M);
    // shoulder bearing and a thin spaulder blade
    k.add('chest', cylX(1.8, 2.4, 32), JT, [5.2, 6.4, -0.3], undefined, M);
    k.add('chest', hull([v3(4.4, 8.4, -2.8), v3(9.2, 8.8, -3.6), v3(10.2, 7.6, -0.5), v3(9.2, 8.8, 2.8), v3(4.4, 8.4, 2.4), v3(4.8, 7.2, 0.1), v3(9.0, 6.8, 0.1)], 24), W, undefined, undefined, M);
    k.add('chest', hull([v3(6, 8.82, -2.9), v3(9.3, 8.85, -3.3), v3(9.3, 8.85, 2.5), v3(6, 8.82, 2.2), v3(6.3, 8.95, -2.2), v3(9.0, 8.98, -2.7), v3(9.0, 8.98, 2.0), v3(6.3, 8.95, 1.7)], 20), VER, undefined, undefined, M);
    // dorsal vents
    k.add('chest', cbox(1.6, 4.8, 1.8, 0.3, { dt: 1.2 }), IR, [2.0, 4.2, -3.1], undefined, M);
    for (let i = 0; i < 4; i++) k.add('chest', boxUV(1.2, 0.12, 0.3), JT, [2.0, 2.8 + i * 1.1, -4.0], undefined, M);
  }
  // cockpit pod on the keel: a lacquered front with vermilion stripe and a round port
  k.add('chest', patch(C, [[-0.04, 0.3], [0.04, 0.3], [0.03, 0.9], [-0.03, 0.9]], { nu: 3, nv: 8, t: 0.5, crown: 0.28 }), VER);
  k.add('chest', new THREE.TorusGeometry(0.72, 0.2, 8, 28), GOLD, [0, 5.5, 3.95]);
  k.add('chest', new THREE.CircleGeometry(0.66, 24), { ...JT, detail: 0 }, [0, 5.5, 3.98]);
  // waist: a slender dark ribbed column under the chest
  const b = 'waist';
  for (let i = 0; i < 6; i++) k.add(b, new THREE.CylinderGeometry(1.75 - Math.sin(i / 5 * Math.PI) * 0.3, 1.75 - Math.sin(i / 5 * Math.PI) * 0.3, 0.46, 18), i % 2 ? IR : JT, [0, -1.9 + i * 0.75, 0]);
  k.add(b, cbox(2.7, 1.4, 2.0, 0.2), W, [0, 2.2, 0]);
  // pelvis: narrow slung plates with vermilion tassets
  const P = 'pelvis';
  k.add(P, hull(superPts(3.4, 1.9, 2.6, 2.3, 24).map((p) => p.add(v3(0, 0, 0))), 32), WD);
  k.add(P, hull([v3(-0.6, 1.2, 2.2), v3(0.6, 1.2, 2.2), v3(-0.7, -2.0, 2.7), v3(0.7, -2.0, 2.7), v3(-0.4, -3.2, 2.0), v3(0.4, -3.2, 2.0), v3(0, 0.3, 3.0)], 22), VER);
  for (const s of [1, -1]) {
    const M = { mirror: s < 0 };
    k.add(P, cbox(1.3, 5.6, 3.7, 0.28, { wt: 1.0, dt: 2.8 }), W, [3.4, -1.9, 0.1], [0, 0, -8], M);
    k.add(P, cbox(0.25, 4.6, 2.6, 0.06), VER, [4.15, -2.1, 0.1], [0, 0, -8], M);
    k.add(P, cylX(1.25, 1.0, 25), JT, [2.5, -1.6, 0], undefined, M);
  }
}

function leg(k, s, L) {
  const M = { mirror: s < 0 };
  const h = 'hip' + L, kn = 'knee' + L, an = 'ank' + L;
  // thigh: long, narrow, lacquer plates over a dark frame (mirrored after modelling for the right leg)
  const T = tube([[0.6, 2.2, 2.4, 0.2, 2.2], [-3.2, 2.7, 3.0, 0.3, 2.2], [-7.5, 2.1, 2.5, 0.2, 2.2], [-10.8, 1.5, 1.8, 0.1, 2.2]]);
  k.add(h, solid(T, { nu: 22, nv: 10 }), WD);
  lames(k, h, T, [[0.12, 0.34], [0.32, 0.56], [0.54, 0.78], [0.76, 0.92]], [{ ...W, pw: 2.8, ph: 1.6, riv: 0.5, detail: 0.8 }, { ...WD, pw: 2.8, ph: 1.6, riv: 0.5 }], { sectors: 5, t: 0.14, step: 0.05, ch: 0.08, crown: 0.1 });
  k.add(h, patch(T, [[0.08, 0.15], [0.22, 0.15], [0.2, 0.85], [0.1, 0.85]], { nu: 4, nv: 6, t: 0.22, crown: 0.14 }), VER);
  k.add(h, patch(T, [[-0.08, 0.15], [-0.22, 0.15], [-0.2, 0.85], [-0.1, 0.85]], { nu: 4, nv: 6, t: 0.22, crown: 0.14 }), VER);
  k.add(h, patch(T, [[0.42, 0.1], [0.58, 0.1], [0.56, 0.88], [0.44, 0.88]], { nu: 4, nv: 6, t: 0.28 }), WD);
  k.add(h, cylX(1.5, 3.8, 28), JT, [0, 0, 0]);
  // knee: big pulley and a pointed vermilion cap
  k.add(kn, cylX(1.45, 3.7, 28), JT, [0, 0, 0]);
  k.add(kn, hull([v3(-1.4, 1.5, 0.7), v3(1.4, 1.5, 0.7), v3(-1.3, -1.4, 0.8), v3(1.3, -1.4, 0.8), v3(0, 2.1, 2.3), v3(-0.7, -0.5, 2.5), v3(0.7, -0.5, 2.5), v3(0, -2.1, 1.6)], 26), VER);
  // shin: long stilt, tapering, spine plate behind, like a wading bird's leg
  const S = tube([[-0.4, 1.7, 1.9, 0, 2.2], [-3.6, 2.2, 2.45, -0.1, 2.2], [-7.4, 1.5, 1.8, -0.1, 2.2], [-10.6, 1.05, 1.3, 0, 2.2]]);
  k.add(kn, solid(S, { nu: 20, nv: 10 }), WD);
  lames(k, kn, S, [[0.1, 0.32], [0.3, 0.54], [0.52, 0.76], [0.74, 0.9]], [{ ...W, pw: 2.8, ph: 1.6, riv: 0.5, detail: 0.8 }, { ...WD, pw: 2.8, ph: 1.6, riv: 0.5 }], { sectors: 5, t: 0.13, step: 0.05, ch: 0.08, crown: 0.08 });
  k.add(kn, patch(S, [[0.07, 0.1], [0.22, 0.1], [0.2, 0.92], [0.09, 0.92]], { nu: 4, nv: 6, t: 0.2, crown: 0.12 }), WD);
  k.add(kn, patch(S, [[-0.07, 0.1], [-0.22, 0.1], [-0.2, 0.92], [-0.09, 0.92]], { nu: 4, nv: 6, t: 0.2, crown: 0.12 }), WD);
  k.add(kn, patch(S, [[0.42, 0.05], [0.58, 0.05], [0.57, 0.85], [0.43, 0.85]], { nu: 3, nv: 7, t: 0.34, ridge: 0.2 }), VER);
  for (const y of [-2.2, -4.2, -6.2, -8.2]) k.add(kn, boxUV(0.7, 0.16, 0.3), JT, [0, y, 2.0]);
  // ankle ball and bird foot
  k.add(an, ball(1.3, 16, 12), JT, [0, 0, 0]);
  k.add(an, new THREE.CylinderGeometry(1.1, 1.3, 1.0, 18), IR, [0, -1.0, 0]);
  const foot = [v3(-2.2, -2.5, -1.5), v3(2.2, -2.5, -1.5), v3(-1.6, -2.5, 4.8), v3(1.6, -2.5, 4.8), v3(-1.7, -1.0, -1.4), v3(1.7, -1.0, -1.4), v3(-1.2, -0.95, 3.4), v3(1.2, -0.95, 3.4), v3(0, -0.9, 5.2)];
  k.add(an, hull(foot, 24), { ...WD, pw: 2.5, ph: 1.6 });
  // three long toes and a rear spur that bite the rock
  for (const a of [-1, 0, 1]) k.add(an, hull([v3(-0.72, -2.52, 3.6), v3(0.72, -2.52, 3.6), v3(-0.6, -2.0, 3.6), v3(0.6, -2.0, 3.6), v3(-0.16, -2.5, 10.2), v3(0.16, -2.5, 10.2), v3(0, -2.3, 10.4)], 28), { ...W, pw: 2, ph: 1 }, [a * 1.0, 0, 0], [0, -a * 18, 0]);
  k.add(an, hull([v3(-0.9, -2.5, -1.2), v3(0.9, -2.5, -1.2), v3(-0.6, -1.5, -1.1), v3(0.6, -1.5, -1.1), v3(-0.14, -2.5, -5.0), v3(0.14, -2.5, -5.0)], 26), VERD);
  void M;
}

function arm(k, s, L) {
  const b = 'sh' + L, el = 'el' + L, h = 'hand' + L;
  // upper arm: slim tube, shoulder ball, lacquer sleeve
  k.add(b, ball(1.7, 16, 12), JT, [0, 0, 0]);
  const U = tube([[-1.0, 1.55, 1.6, 0, 2.3], [-5, 1.95, 2.05, 0, 2.3], [-11.0, 1.35, 1.45, 0, 2.3]]);
  k.add(b, solid(U, { nu: 18, nv: 8 }), WD);
  lames(k, b, U, [[0.12, 0.42], [0.4, 0.7], [0.68, 0.92]], [{ ...W, pw: 2.8, ph: 1.6, riv: 0.5, detail: 0.8 }, { ...WD, pw: 2.8, ph: 1.6, riv: 0.5 }], { sectors: 4, t: 0.12, step: 0.05, ch: 0.08, crown: 0.08 });
  k.add(b, patch(U, [[0.08, 0.1], [0.22, 0.1], [0.22, 0.85], [0.08, 0.85]], { nu: 3, nv: 5, t: 0.18 }), VER);
  k.add(el, cylX(1.32, 3.1, 25), JT, [0, 0, 0]);
  // forearm: flared gauntlet with vermilion cuff
  const F = tube([[-0.4, 1.28, 1.35, 0, 2.3], [-5, 1.9, 2.0, 0, 2.3], [-11.2, 2.1, 2.25, 0, 2.3], [-12.6, 1.45, 1.55, 0, 2.3]]);
  k.add(el, solid(F, { nu: 18, nv: 10 }), WD);
  lames(k, el, F, [[0.08, 0.3], [0.28, 0.5], [0.48, 0.72]], [{ ...W, pw: 2.8, ph: 1.6, riv: 0.5, detail: 0.8 }, { ...WD, pw: 2.8, ph: 1.6, riv: 0.5 }], { sectors: 4, t: 0.12, step: 0.05, ch: 0.08, crown: 0.08 });
  for (let i = 0; i < 5; i++) k.add(el, boxUV(0.14, 0.12, 1.5), JT, [s * 2.05, -5.0 - i * 0.7, 0]);
  k.add(el, patch(F, [[0.05, 0.55], [0.46, 0.55], [0.46, 0.92], [0.05, 0.92]], { nu: 6, nv: 3, t: 0.28 }), VER);
  k.add(el, patch(F, [[0.55, 0.15], [0.95, 0.15], [0.95, 0.5], [0.55, 0.5]], { nu: 5, nv: 3, t: 0.2 }), WD);
  // hand: palm with back plates, three fingers with real phalanges and knuckles, a thumb
  k.add(h, cbox(2.9, 1.6, 3.2, 0.28, { wt: 2.6, dt: 2.8 }), { ...IR, pw: 2, ph: 1.4 }, [0, -1.1, 0.5]);
  for (let i = 0; i < 2; i++) k.add(h, cbox(2.8 - i * 0.2, 0.8, 0.26, 0.07), i ? VER : W, [0, -0.7 - i * 0.72, 2.2]);
  for (let f = -1; f <= 1; f++) {
    const x = f * 0.95, K = [x, -1.8, 2.0], M = [x, -3.2, 2.7], T = [x, -4.2, 2.4], E = [x, -4.3, 1.3];
    for (const q of [K, M, T]) k.add(h, cylX(0.4, 0.78, 19), JT, q);
    seg(k, h, K, M, 0.78, 0.86, W);
    seg(k, h, M, T, 0.72, 0.8, WD);
    seg(k, h, T, E, 0.64, 0.7, VER, { wt: 0.46, dt: 0.5 });
  }
  const T0 = [s * 1.45, -0.7, 1.0], T1 = [s * 1.95, -2.1, 1.6], T2 = [s * 1.4, -3.0, 1.1];
  k.add(h, ball(0.5, 12, 8), JT, T0); k.add(h, ball(0.44, 12, 8), JT, T1);
  seg(k, h, T0, T1, 0.8, 0.8, W); seg(k, h, T1, T2, 0.66, 0.66, VER, { wt: 0.48, dt: 0.48 });
}
