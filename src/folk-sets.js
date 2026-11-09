import * as THREE from 'three';
import { paint, hex, mixc, sstep, deform, ell, limb, tube, merge, torus } from './folk-geo.js';
import { setMaterial, glowMaterial, deckMaterial, windowMaterial, smokeMaterial } from './folk-mat.js';
import { bakeSpring, keyed } from './motion.js';
import { Rng } from './util.js';

// FOLK sets: the two cockpits, the control hut with its wall of brass breakers, the scorched shell around the hatch, the
// paper window. All are placed high above the map, near x = z = 0, so nothing else in the film can show through them
// and float precision stays good in the extreme close-ups. Each set: { root, update(t, st) }, visible only in its shots.
export const SET = { A: [0, 1500, 0], B: [14, 1500, 0], HUT: [30, 1500, 0], DECK: [70, 1500, 0], WIN: [100, 1500, 0] };

const v3 = (x, y, z) => new THREE.Vector3(x, y, z);
const C = (h) => hex(h);

// a bag of painted geometry that becomes one mesh
function bag(parent, name, mat, solidList, ctx) {
  const list = [];
  const o = {
    add(g, col) { paint(g, typeof col === 'function' ? col : () => (Array.isArray(col) ? col : C(col))); list.push(g); return g; },
    build() {
      const m = new THREE.Mesh(merge(list), mat); m.name = name; parent.add(m);
      if (solidList) ctx.colliders.push({ name, dept: 'folk', obj: m, kind: 'solid' });
      return m;
    },
  };
  return o;
}
const box = (w, h, d, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sg = 1) => {
  const g = new THREE.BoxGeometry(w, h, d, sg, sg, sg);
  if (rx || ry || rz) g.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rx, ry, rz, 'YXZ')));
  g.translate(x, y, z); return g;
};
const cyl = (r0, r1, h, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, seg = 24) => {
  const g = new THREE.CylinderGeometry(r0, r1, h, seg);
  if (rx || ry || rz) g.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rx, ry, rz, 'YXZ')));
  g.translate(x, y, z); return g;
};
const place = (g, q, p) => { g.applyQuaternion(q); g.translate(p.x, p.y, p.z); return g; };
const faceTo = (p, target) => new THREE.Quaternion().setFromUnitVectors(v3(0, 0, 1), target.clone().sub(p).normalize());

// closed shell of revolution: profile(y) inner radius, thickness th
function shell(yList, rFn, th) {
  const inner = yList.map((y) => new THREE.Vector2(Math.max(0.001, rFn(y)), y));
  const outer = [...yList].reverse().map((y) => new THREE.Vector2(Math.max(0.001, rFn(y) + th), y));
  const pts = [...inner, ...outer, inner[0]];
  return new THREE.LatheGeometry(pts, 72);
}

// a dial face drawn on a canvas: cream paper, ticks, latin numerals, a red sector
function dialTexture({ sectors = 10, red = [0.75, 1], label = '', dark = false, seed = 1 }) {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const x = c.getContext('2d'), R = 118;
  x.fillStyle = dark ? '#1d2422' : '#e9dfc2'; x.beginPath(); x.arc(128, 128, 127, 0, 7); x.fill();
  const A = (u) => Math.PI * (0.75 + 1.5 * u);
  x.strokeStyle = '#a4221c'; x.lineWidth = 16; x.beginPath(); x.arc(128, 128, R - 10, A(red[0]), A(red[1])); x.stroke();
  x.strokeStyle = dark ? '#d8caa0' : '#22201c'; x.fillStyle = x.strokeStyle;
  for (let i = 0; i <= sectors * 5; i++) {
    const u = i / (sectors * 5), a = A(u), major = i % 5 === 0;
    x.lineWidth = major ? 5 : 2;
    x.beginPath(); x.moveTo(128 + Math.cos(a) * R, 128 + Math.sin(a) * R); x.lineTo(128 + Math.cos(a) * (R - (major ? 24 : 12)), 128 + Math.sin(a) * (R - (major ? 24 : 12))); x.stroke();
  }
  x.font = 'bold 26px Georgia, serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
  for (let i = 0; i <= sectors; i += 2) { const a = A(i / sectors); x.fillText(String(i * 10), 128 + Math.cos(a) * (R - 44), 128 + Math.sin(a) * (R - 44)); }
  x.font = 'bold 19px Georgia, serif'; x.fillText(label, 128, 93);
  const t = new THREE.CanvasTexture(c); t.anisotropy = 4; void seed; return t;
}

// a round brass-bezelled dial facing `to`, with a needle group
function makeDial(root, brass, opts) {
  const { p, to, r, tex } = opts;
  const q = faceTo(p, to);
  brass.add(place(new THREE.TorusGeometry(r, r * 0.13, 10, 40), q, p), '#c99a42');
  brass.add(place(new THREE.CylinderGeometry(r * 1.02, r * 1.1, r * 0.24, 36).rotateX(Math.PI / 2).translate(0, 0, -r * 0.14), q, p), '#7a5a2a');
  const face = new THREE.Mesh(paint(new THREE.CircleGeometry(r * 0.98, 40), () => [1, 1, 1]), setMaterial({ id: 50, map: tex, grime: 0.2, scale: 30, kind: 1, rim: 0 }));
  place(face.geometry, q, p.clone().add(v3(0, 0, r * 0.03).applyQuaternion(q)));
  face.name = 'dialFace'; root.add(face);
  // rotation.z is written every frame, so the facing lives on a parent: on one object it would overwrite the facing's own Euler z
  const nFace = new THREE.Group(); nFace.position.copy(p).add(v3(0, 0, r * 0.08).applyQuaternion(q)); nFace.quaternion.copy(q); root.add(nFace);
  const nGroup = new THREE.Group(); nFace.add(nGroup);
  const needle = new THREE.Mesh(paint(new THREE.ConeGeometry(r * 0.075, r * 0.88, 8).translate(0, r * 0.38, 0), () => C(opts.needle || '#c8302a')), setMaterial({ id: 53, grime: 0, rim: 0.4 }));
  const hub = new THREE.Mesh(paint(new THREE.CylinderGeometry(r * 0.1, r * 0.1, r * 0.08, 14).rotateX(Math.PI / 2), () => C('#201c1c')), setMaterial({ id: 53, grime: 0 }));
  nGroup.add(needle, hub);
  nGroup.userData.face = face;
  return nGroup;
}
// u 0..1 along the scale -> needle angle (rotation.z); the dial texture runs clockwise from lower-left
export const needleA = (u) => (1.5 - 3 * u) * Math.PI * 0.5;

function rivets(bagOf, pts, r, col, n) {
  for (const p of pts) { const g = ell(r, r, r * 0.5, 6, 4); g.lookAt(n ?? v3(0, 0, 1)); g.translate(p.x, p.y, p.z); bagOf.add(g, col); }
}

// a flat strap stretched between two moving points
function strapMesh(parent, name, w, th, col, mat) {
  const g = new THREE.BoxGeometry(w, 1, th, 1, 8, 1).translate(0, 0.5, 0);
  paint(g, () => C(col));
  const m = new THREE.Mesh(g, mat); m.name = name; m.frustumCulled = false; parent.add(m);
  const a = new THREE.Vector3(), d = new THREE.Vector3();
  const Y = v3(0, 1, 0), Q = new THREE.Quaternion();
  m.setEnds = (p0, p1) => {
    a.copy(p0); d.copy(p1).sub(p0); const L = d.length() || 1;
    m.position.copy(a); Q.setFromUnitVectors(Y, d.divideScalar(L)); m.quaternion.copy(Q); m.scale.set(1, L, 1);
  };
  return m;
}

// ------------------------------------------------------------------ Cockpit A (Heron): teal enamel, cream, brass
export function buildCockpitA(ctx, group) {
  const root = new THREE.Group(); root.name = 'cockpitA'; root.position.set(...SET.A); group.add(root);
  const wallMat = setMaterial({ id: 50, scale: 8, grime: 0.55, rim: 0.2 });
  const wall = bag(root, 'cockpitA_shell', wallMat, true, ctx);
  const R0 = 1.34, ys = []; for (let i = 0; i <= 34; i++) ys.push(-0.12 + i * (2.65 / 34));
  const rF = (y) => (y < 1.55 ? R0 : R0 * Math.sqrt(Math.max(0.01, 1 - Math.pow((y - 1.55) / 0.98, 2))));
  const teal = C('#2f6a66'), cream = C('#d9cfae'), oxide = C('#8e3a2a');
  wall.add(shell(ys, rF, 0.14), (v) => {
    if (v.y < 0.82) return teal;
    if (v.y < 0.9) return oxide;
    return cream;
  });
  wall.build();
  const floor = bag(root, 'cockpitA_floor', setMaterial({ id: 51, scale: 9, grime: 0.8, rim: 0 }), true, ctx);
  floor.add(cyl(R0 + 0.02, R0 + 0.02, 0.14, 0, -0.07, 0, 0, 0, 0, 48), '#3a3a3a');
  floor.add(box(0.5, 0.05, 0.3, 0, 0.19, 0.42, -0.3, 0, 0), '#6a6660');
  floor.add(box(0.46, 0.16, 0.05, 0, 0.1, 0.56), '#5a5650');
  floor.build();
  const brass = bag(root, 'cockpitA_brass', setMaterial({ id: 53, scale: 22, grime: 0.45, gloss: 0.9, rim: 0.7 }), false);
  // ribs
  for (const y of [0.42, 0.86, 1.32]) brass.add(new THREE.TorusGeometry(R0 - 0.015, 0.024, 8, 90).rotateX(Math.PI / 2).translate(0, y, 0), '#b98b3c');
  for (let i = 0; i < 18; i++) {
    const a = (i / 18) * Math.PI * 2; if (Math.abs(a - Math.PI / 2 * 0) < 0.01) continue;
    const g = new THREE.BoxGeometry(0.03, 1.3, 0.05); g.translate(0, 0.72, -R0 + 0.03); g.rotateY(a); brass.add(g, '#9e7a34');
    for (let k = 0; k < 5; k++) { const y = 0.2 + k * 0.28, q = v3(Math.sin(a) * (R0 - 0.06), y, Math.cos(a) * (R0 - 0.06)); const rv = new THREE.SphereGeometry(0.0085, 6, 4); rv.translate(q.x, q.y, q.z); brass.add(rv, '#e0b860'); }
  }
  // seat
  const leather = bag(root, 'cockpitA_seat', setMaterial({ id: 54, scale: 16, grime: 0.5, kind: 1, rim: 0.6 }), true, ctx);
  const seatC = '#7a2e22';
  leather.add(box(0.5, 0.11, 0.46, 0, 0.33, -0.02), seatC);
  leather.add(box(0.52, 0.8, 0.1, 0, 0.84, -0.28, -0.14, 0, 0), seatC);
  leather.add(box(0.28, 0.2, 0.1, 0, 1.33, -0.36, -0.14, 0, 0), seatC);
  leather.add(box(0.1, 0.1, 0.46, -0.34, 0.6, 0.02), '#4a2a22');
  leather.add(box(0.1, 0.1, 0.46, 0.34, 0.6, 0.02), '#4a2a22');
  leather.build();
  brass.add(box(0.04, 0.2, 0.3, -0.34, 0.46, -0.02), '#6a5a3a');
  brass.add(box(0.04, 0.2, 0.3, 0.34, 0.46, -0.02), '#6a5a3a');
  for (let i = 0; i < 6; i++) for (const s of [1, -1]) { const q = v3(s * 0.24, 0.5 + i * 0.13, -0.232 - i * 0.018); const rv = new THREE.SphereGeometry(0.009, 6, 4); rv.translate(q.x, q.y, q.z); brass.add(rv, '#e0b860'); }
  // console: a slab under the scope, dials on its face; solid
  const consoleB = bag(root, 'cockpitA_console', setMaterial({ id: 52, scale: 10, grime: 0.6, rim: 0.3 }), true, ctx);
  consoleB.add(box(1.5, 0.6, 0.34, 0, 0.72, 0.92, 0.3, 0, 0), '#2a5450');
  consoleB.add(box(1.5, 0.12, 0.5, 0, 1.08, 1.0), '#22423e');
  consoleB.build();
  const dialsAt = [
    [-0.46, 0.84, 0.76, 0.075, 'PSI'], [-0.26, 0.86, 0.75, 0.06, 'AMP'], [0.26, 0.86, 0.75, 0.06, 'VOLT'], [0.46, 0.84, 0.76, 0.075, 'TEMP'],
    [-0.6, 1.0, 0.66, 0.055, ''], [0.6, 1.0, 0.66, 0.055, ''],
  ];
  const needles = [];
  for (const [x, y, z, r, label] of dialsAt) needles.push(makeDial(root, brass, { p: v3(x, y, z), to: v3(0, 1.18, 0), r, tex: dialTexture({ label, seed: x * 9 }) }));
  // scope: a brass tube on an arm ahead of the face, red glass eyepiece toward the pilot
  brass.add(cyl(0.085, 0.1, 0.46, 0, 1.13, 0.72, Math.PI / 2 - 0.05), '#a8802f');
  brass.add(new THREE.TorusGeometry(0.103, 0.024, 10, 30).translate(0, 1.145, 0.49), '#d6a84c');
  brass.add(new THREE.TorusGeometry(0.12, 0.012, 8, 30).translate(0, 1.145, 0.53), '#d6a84c');
  brass.add(box(0.05, 0.3, 0.05, 0.0, 0.96, 0.8), '#6a5a3a');
  const glowScope = glowMaterial({ color: '#ff3a24', k: 2.2 });
  const scopeGlass = new THREE.Mesh(paint(new THREE.CircleGeometry(0.096, 32).translate(0, 1.145, 0.476).rotateY(Math.PI), () => [1, 1, 1]), glowScope);
  scopeGlass.position.set(0, 0, 0.0); scopeGlass.geometry.translate(0, 0, 0.952); scopeGlass.name = 'scopeGlass'; root.add(scopeGlass);
  // the crosshair across the glass
  // big power gauge to the pilot's right, angled at his face
  const gaugeP = v3(-0.5, 1.26, 0.56);
  const gaugeNeedle = makeDial(root, brass, { p: gaugeP, to: v3(0, 1.2, 0.05), r: 0.165, needle: '#120e0c', tex: dialTexture({ sectors: 10, red: [0, 0.14], label: 'CHARGE' }) });
  const gaugeGlow = glowMaterial({ color: '#ff5030', k: 0 });
  const gaugeLamp = new THREE.Mesh(paint(new THREE.SphereGeometry(0.03, 12, 8).translate(gaugeP.x + 0.13, gaugeP.y + 0.2, gaugeP.z - 0.06), () => [1, 1, 1]), gaugeGlow); gaugeLamp.name = 'gaugeLamp'; root.add(gaugeLamp);
  brass.add(box(0.05, 0.28, 0.05, -0.52, 1.0, 0.62), '#6a5a3a');
  // trigger grip at the right hand, throttle at the left; both on armrest pedestals
  const grip = new THREE.Group(); grip.name = 'grip'; grip.position.set(-0.26, 0.725, 0.205); root.add(grip);
  const gMat = setMaterial({ id: 55, scale: 34, grime: 0.3, gloss: 0.5, rim: 0.7 });
  const gripB = bag(grip, 'cockpitA_grip', gMat, true, ctx);
  gripB.add(cyl(0.05, 0.062, 0.1, 0, -0.08, 0), '#5a4a30');
  gripB.add(limbZ(0.21, 0.034, 0.042).translate(0, 0.16, 0), '#3a2a22');            // the grip column, wrapped dark leather
  gripB.add(new THREE.TorusGeometry(0.048, 0.008, 8, 20).rotateX(Math.PI / 2).translate(0, 0.01, 0), '#d6a84c');
  gripB.add(new THREE.TorusGeometry(0.048, 0.008, 8, 20).rotateX(Math.PI / 2).translate(0, 0.16, 0), '#d6a84c');
  // housing on top of the grip with the hammer in it
  gripB.add(cyl(0.03, 0.037, 0.13, 0, 0.2, 0.04, Math.PI / 2, 0, 0, 20), '#b8892f');                 // sear housing: a turned brass barrel, not a block
  gripB.add(new THREE.SphereGeometry(0.03, 16, 10).scale(1, 1, 0.7).translate(0, 0.2, 0.105), '#d6a84c');
  gripB.add(new THREE.TorusGeometry(0.037, 0.006, 8, 24).translate(0, 0.2, -0.018), '#d6a84c');
  gripB.add(new THREE.TorusGeometry(0.032, 0.005, 8, 24).translate(0, 0.2, 0.09), '#d6a84c');
  gripB.add(new THREE.TorusGeometry(0.056, 0.0065, 8, 28, Math.PI * 1.12).rotateZ(-Math.PI * 0.58).rotateY(-Math.PI / 2).translate(0, 0.134, 0.052), '#d6a84c');     // trigger guard
  gripB.build();
  const trigger = new THREE.Group(); trigger.name = 'trigger'; trigger.position.set(0, 0.145, 0.055); grip.add(trigger);
  const trigG = paint(merge([box(0.012, 0.06, 0.016, 0, -0.03, 0.01, -0.22), box(0.016, 0.012, 0.022, 0, -0.058, 0.02)]), () => C('#c8dce8'));
  const trigM = new THREE.Mesh(trigG, setMaterial({ id: 55, scale: 34, grime: 0.1, gloss: 0.7, rim: 1.8 })); trigM.name = 'triggerBar'; trigger.add(trigM);
  const hammer = new THREE.Group(); hammer.name = 'hammer'; hammer.position.set(0, 0.215, -0.02); grip.add(hammer);
  const hamG = paint(merge([box(0.016, 0.075, 0.018, 0, 0.038, 0), cyl(0.018, 0.018, 0.02, 0, 0.072, 0, 0, 0, Math.PI / 2, 14)]), () => C('#d0c8b0'));
  const hamM = new THREE.Mesh(hamG, gMat); hamM.name = 'hammerM'; hammer.add(hamM);
  const throttle = bag(root, 'cockpitA_throttle', gMat, true, ctx);
  throttle.add(cyl(0.05, 0.06, 0.1, 0.31, 0.62, 0.33), '#5a4a30');
  throttle.add(cyl(0.024, 0.024, 0.16, 0.31, 0.76, 0.33), '#b98b3c');
  throttle.add(new THREE.SphereGeometry(0.042, 14, 10).translate(0.31, 0.86, 0.33), '#3a2a22');
  throttle.build();
  // back wall details behind the head: valves, a pipe run, warning lamps
  const pipes = bag(root, 'cockpitA_pipes', setMaterial({ id: 56, scale: 14, grime: 0.7, rim: 0.6 }), false);
  const circle = (y, r, a0, a1, n = 14) => { const p = []; for (let i = 0; i <= n; i++) { const a = a0 + (a1 - a0) * i / n; p.push(v3(Math.sin(a) * r, y, Math.cos(a) * r)); } return p; };
  pipes.add(tube(circle(1.08, R0 - 0.1, Math.PI * 0.62, Math.PI * 1.38), () => 0.03, 8, 40), '#8e5a30');
  pipes.add(tube(circle(1.2, R0 - 0.11, Math.PI * 0.7, Math.PI * 1.3), () => 0.018, 8, 40), '#c0a060');
  for (const a of [Math.PI * 0.85, Math.PI * 1.02, Math.PI * 1.2]) { const p = v3(Math.sin(a) * (R0 - 0.1), 1.08, Math.cos(a) * (R0 - 0.1)); pipes.add(new THREE.TorusGeometry(0.052, 0.012, 8, 14).rotateX(Math.PI / 2).translate(p.x, p.y + 0.06, p.z), '#c4322a'); }
  pipes.add(box(0.5, 0.22, 0.05, -0.1, 1.68, -1.24), '#3a3a34');
  pipes.build();
  const lampsA = glowMaterial({ color: '#ffb060', k: 1.5 }), lampsR = glowMaterial({ color: '#ff2a20', k: 0 });
  const addLamps = (mat, list, nm) => { const g = merge(list.map(([x, y, z, r]) => paint(new THREE.SphereGeometry(r, 10, 8).translate(x, y, z), () => [1, 1, 1]))); const m = new THREE.Mesh(g, mat); m.name = nm; root.add(m); };
  addLamps(lampsA, [[-0.26, 1.72, -1.2, 0.022], [-0.14, 1.72, -1.2, 0.022], [-0.02, 1.72, -1.2, 0.022], [0.1, 1.72, -1.2, 0.022], [-0.35, 1.3, -1.25, 0.018], [0.35, 1.3, -1.25, 0.018]], 'lampsA');
  addLamps(lampsR, [[0.45, 2.0, 0.2, 0.05], [-0.45, 2.0, 0.2, 0.05], [0, 1.72, -1.2, 0.03], [0.7, 1.7, 0.7, 0.04], [-0.7, 1.7, 0.7, 0.04], [0, 2.1, -0.6, 0.045]], 'lampsR');
  // seat straps, re-stretched every frame between the pilot's chest and the top of the seat
  const strapMat = setMaterial({ id: 57, scale: 30, grime: 0.3, kind: 1, rim: 0.5 });
  const straps = [strapMesh(root, 'strapL', 0.05, 0.008, '#c9a24a', strapMat), strapMesh(root, 'strapR', 0.05, 0.008, '#c9a24a', strapMat), strapMesh(root, 'strapLapL', 0.05, 0.008, '#a8822e', strapMat), strapMesh(root, 'strapLapR', 0.05, 0.008, '#a8822e', strapMat)];
  brass.build();

  // stars of light on the scope (s13): set inside the scope, seen by a camera at the eyepiece
  const stars = new THREE.Group(); stars.name = 'scopeStars'; root.add(stars);
  const sM = glowMaterial({ color: '#ffffff', k: 6 });
  const starGeo = (n, r) => { const parts = []; for (let i = 0; i < n; i++) parts.push(paint(new THREE.PlaneGeometry(r * 2, r * 0.05).rotateZ((i / n) * Math.PI), () => [1, 1, 1])); parts.push(paint(new THREE.CircleGeometry(r * 0.16, 18), () => [1, 1, 1])); return merge(parts); };
  const dark = new THREE.Mesh(paint(new THREE.CircleGeometry(0.9, 48), () => C('#05060e')), glowMaterial({ color: '#ffffff', k: 1 })); dark.position.set(0, 0, -0.14); stars.add(dark);
  const ringG = new THREE.Mesh(paint(new THREE.RingGeometry(0.325, 0.345, 64), () => C('#c8a040')), glowMaterial({ color: '#ffffff', k: 1.4 })); ringG.position.z = -0.1; stars.add(ringG);
  const ringB = new THREE.Mesh(paint(new THREE.RingGeometry(0.29, 0.298, 64), () => C('#2a5a9a')), glowMaterial({ color: '#ffffff', k: 1.4 })); ringB.position.z = -0.1; stars.add(ringB);
  const starsList = [];
  const rng = new Rng(77);
  for (let i = 0; i < 9; i++) {
    const a = rng.range(0, 6.3), r = i === 0 ? 0 : rng.range(0.1, 0.3);
    const sm = new THREE.Mesh(starGeo(4, rng.range(0.06, 0.13)), sM); sm.position.set(Math.cos(a) * r, Math.sin(a) * r, -0.08); stars.add(sm);
    starsList.push({ m: sm, delay: i * 0.022 });
  }
  stars.position.set(0, 1.145, -2.0); stars.rotation.y = 0; stars.visible = false;

  const flipGlow = glowMaterial;
  void flipGlow;
  return { root, needles, gaugeNeedle, trigger, hammer, grip, straps, scopeGlass, glowScope, gaugeGlow, lampsA, lampsR, stars, starsList };
}

// a tapered cylinder along Y, closed (limb is along -Y and open-capped by the lathe)
function limbZ(h, r0, r1) { return new THREE.CylinderGeometry(r0, r1, h, 16, 4).translate(0, -h / 2, 0); }

// ------------------------------------------------------------------ Cockpit B (Tortoise): copper plates, dark teal, seams
export function buildCockpitB(ctx, group) {
  const root = new THREE.Group(); root.name = 'cockpitB'; root.position.set(...SET.B); group.add(root);
  const HX = 0, HZ = 0.6, R0 = 1.32, Htop = 2.3;
  const sh = new THREE.Group(); sh.position.set(HX, 0, HZ); root.add(sh);
  const wall = bag(sh, 'cockpitB_shell', setMaterial({ id: 50, scale: 7, grime: 0.6, rim: 0.2 }), true, ctx);
  const ys = []; for (let i = 0; i <= 40; i++) ys.push(-0.1 + (i / 40) * (Htop + 0.1));
  const rF = (y) => {
    const u = (y + 0.1) / (Htop + 0.1);
    if (u > 0.985) return 0.56;
    return Math.max(0.56, R0 * Math.sqrt(Math.max(0, 1 - Math.pow((y - 0.75) / 1.72, 2))));
  };
  const tealC = C('#1b4a4a'), copper = C('#9a5a34'), dcop = C('#6e3e26');
  wall.add(shell(ys, rF, 0.12), (v) => {
    const a = Math.atan2(v.x, v.z), band = Math.floor(a * 3 + 10) % 2;
    if (v.y < 0.55) return dcop;
    return band ? tealC : mixc(tealC, copper, 0.25);
  });
  wall.build();
  sh.children[0].name = 'cockpitB_shell';
  const floor = bag(root, 'cockpitB_floor', setMaterial({ id: 51, scale: 9, grime: 0.8, rim: 0 }), true, ctx);
  floor.add(cyl(R0 - 0.05, R0 - 0.05, 0.14, 0, -0.07, HZ, 0, 0, 0, 40), '#2a2626');
  floor.add(box(0.6, 0.05, 0.34, 0, 0.26, 1.04, -0.42, 0, 0), '#5a4a40');
  floor.build();
  // seam strips: thin lines of light along meridians and rings of the shell
  const seamG = [];
  const seamA = (n) => (n / 12) * Math.PI * 2;
  const strip = (p0, p1, w = 0.012) => {
    const d = p1.clone().sub(p0), L = d.length(), c = p0.clone().add(p1).multiplyScalar(0.5);
    const g = new THREE.PlaneGeometry(w, L); const n = c.clone().sub(v3(0, 0.75, 0)).normalize().negate();
    const y = d.clone().normalize(), z = n.clone(); const x = new THREE.Vector3().crossVectors(y, z).normalize(); z.crossVectors(x, y).normalize();
    g.applyMatrix4(new THREE.Matrix4().makeBasis(x, y, z)); g.translate(c.x, c.y, c.z); return paint(g, () => [1, 1, 1]);
  };
  for (let m = 0; m < 12; m++) {
    const a = seamA(m);
    let prev = null;
    for (let k = 0; k <= 16; k++) {
      const y = 0.15 + k * 0.122, r = rF(y) - 0.02, p = v3(Math.sin(a) * r, y, Math.cos(a) * r);
      if (prev) seamG.push(strip(prev, p, 0.014));
      prev = p;
    }
  }
  for (const y of [0.55, 1.1, 1.6]) {
    let prev = null;
    for (let i = 0; i <= 64; i++) { const a = (i / 64) * Math.PI * 2, r = rF(y) - 0.02, p = v3(Math.sin(a) * r, y, Math.cos(a) * r); if (prev) seamG.push(strip(prev, p, 0.012)); prev = p; }
  }
  const seamMat = glowMaterial({ color: '#ffffff', k: 0.03, id: 122 });
  const seams = new THREE.Mesh(merge(seamG), seamMat); seams.name = 'seams'; seams.frustumCulled = false; sh.add(seams);
  const brass = bag(root, 'cockpitB_brass', setMaterial({ id: 53, scale: 22, grime: 0.45, gloss: 0.9, rim: 0.7 }), false);
  // ribs and rivets following the shell
  for (let m = 0; m < 12; m++) {
    const a = seamA(m) + Math.PI / 12;
    for (let k = 0; k < 9; k++) { const y = 0.3 + k * 0.2, r = rF(y) - 0.012; const rv = new THREE.SphereGeometry(0.012, 6, 4); rv.translate(Math.sin(a) * r + HX, y, Math.cos(a) * r + HZ); brass.add(rv, '#c89a48'); }
  }
  // hatch rim (seen from below): a thick brass collar
  const coll = bag(sh, 'cockpitB_collar', setMaterial({ id: 53, scale: 22, grime: 0.45, gloss: 0.9, rim: 0.7 }), true, ctx);
  const cProf = [new THREE.Vector2(0.56, Htop - 0.1), new THREE.Vector2(0.62, Htop - 0.1), new THREE.Vector2(0.66, Htop + 0.08), new THREE.Vector2(0.5, Htop + 0.08), new THREE.Vector2(0.5, Htop - 0.02), new THREE.Vector2(0.56, Htop - 0.1)];
  coll.add(new THREE.LatheGeometry(cProf, 72), '#a8802f');
  coll.build();
  // the seat: reclined, the pilot lies back and looks up at the hatch
  const leather = bag(root, 'cockpitB_seat', setMaterial({ id: 54, scale: 16, grime: 0.5, kind: 1, rim: 0.6 }), true, ctx);
  const RECL = 0.96;           // recline angle from vertical
  const backC = v3(0, 0.74, 0.0);
  leather.add(box(0.54, 1.02, 0.1, backC.x, backC.y, backC.z, -RECL), '#6a2c24');
  const headC = backC.clone().add(v3(0, Math.cos(RECL) * 0.58, -Math.sin(RECL) * 0.58));
  leather.add(box(0.3, 0.24, 0.1, headC.x, headC.y, headC.z, -RECL), '#6a2c24');
  leather.add(box(0.54, 0.1, 0.44, 0, 0.3, 0.46, 0.22), '#6a2c24');
  leather.build();
  brass.add(box(0.5, 0.05, 0.05, 0, 0.42, 0.2), '#7a5a2a');
  // twin holding levers
  const lm = bag(root, 'cockpitB_levers', setMaterial({ id: 55, scale: 30, grime: 0.3, gloss: 0.5, rim: 0.7 }), true, ctx);
  for (const s of [1, -1]) {
    lm.add(cyl(0.05, 0.06, 0.1, s * 0.33, 0.42, 0.5), '#5a4a30');
    lm.add(cyl(0.022, 0.024, 0.42, s * 0.33, 0.66, 0.46, -0.2), '#b98b3c');
    lm.add(limbZ(0.14, 0.03, 0.03).rotateZ(s * 0.4).translate(s * 0.33, 0.92, 0.42), '#2a221e');
  }
  lm.build();
  // small dial
  const needles = [makeDial(root, brass, { p: v3(-0.56, 0.86, 0.96), to: v3(0, 1.05, -0.2), r: 0.09, tex: dialTexture({ sectors: 10, red: [0.7, 1], label: 'HEAT' }) }),
    makeDial(root, brass, { p: v3(0.56, 0.86, 0.96), to: v3(0, 1.05, -0.2), r: 0.09, tex: dialTexture({ sectors: 10, red: [0.7, 1], label: 'SHELL' }) })];
  brass.build();
  const lampsA = glowMaterial({ color: '#ffb060', k: 1.2 });
  const mL = new THREE.Mesh(merge([[0.3, 1.0, 1.34, 0.02], [0.18, 1.06, 1.42, 0.02], [-0.18, 1.06, 1.42, 0.02], [-0.3, 1.0, 1.34, 0.02]].map(([x, y, z, r]) => paint(new THREE.SphereGeometry(r, 10, 8).translate(x, y, z), () => [1, 1, 1]))), lampsA); mL.name = 'lampsB'; root.add(mL);
  // the cover stands open above the hole in s30 (seen against the sky from inside)
  const coverOpen = new THREE.Group(); coverOpen.name = 'coverOpen'; coverOpen.position.set(HX, Htop + 0.1, HZ - 0.54); coverOpen.rotation.x = -1.95; root.add(coverOpen);
  const cm = new THREE.Mesh(paint(new THREE.CylinderGeometry(0.5, 0.5, 0.08, 40).translate(0, 0, 0.54), (v, n) => (n.y < -0.5 ? C('#5a3a28') : C('#3a2a24'))), setMaterial({ id: 52, scale: 10, grime: 0.8 })); cm.name = 'coverOpenM'; coverOpen.add(cm);
  coverOpen.visible = false;
  const strapMat = setMaterial({ id: 57, scale: 30, grime: 0.3, kind: 1, rim: 0.5 });
  const straps = [strapMesh(root, 'strapBL', 0.055, 0.008, '#8a3a2a', strapMat), strapMesh(root, 'strapBR', 0.055, 0.008, '#8a3a2a', strapMat)];
  return { root, H: [HX, Htop, HZ], seams, seamMat, lampsA, coverOpen, straps, needles };
}

// ------------------------------------------------------------------ Control hut: a wall of brass breakers
export function buildHut(ctx, group) {
  const root = new THREE.Group(); root.name = 'hut'; root.position.set(...SET.HUT); group.add(root);
  const wM = setMaterial({ id: 50, scale: 5, grime: 0.7, kind: 1, rim: 0.2 });
  const walls = bag(root, 'hut_walls', wM, true, ctx);
  const plaster = '#7a6a52', dado = '#3a4a48';
  walls.add(box(8, 3.0, 0.12, -0.5, 1.5, -2.06, 0, 0, 0, 2), (v) => (v.y < 0.55 ? C(dado) : C(plaster)));
  walls.add(box(0.12, 3.0, 5, 3.5, 1.5, 0.4, 0, 0, 0, 2), (v) => (v.y < 0.55 ? C(dado) : C(plaster)));
  walls.add(box(0.12, 3.0, 5, -4.5, 1.5, 0.4, 0, 0, 0, 2), (v) => (v.y < 0.55 ? C(dado) : C(plaster)));
  walls.add(box(8, 3.0, 0.12, -0.5, 1.5, 2.94, 0, 0, 0, 2), plaster);
  walls.add(box(8, 0.12, 5.2, -0.5, 3.0, 0.4), '#3a3026');
  walls.build();
  const fl = bag(root, 'hut_floor', setMaterial({ id: 51, scale: 7, grime: 0.9, rim: 0 }), true, ctx);
  fl.add(box(8.2, 0.2, 5.4, -0.5, -0.1, 0.4), '#4a4038');
  fl.build();
  const brassM = setMaterial({ id: 53, scale: 18, grime: 0.5, gloss: 0.9, rim: 0.7 });
  const brass = bag(root, 'hut_brass', brassM, false);
  const X0 = -3.6, COLS = 22, ROWS = 7, DX = 0.215, DY = 0.3, Y0 = 0.62, Z = -2.0;
  // backing plates, one per row
  const panels = bag(root, 'hut_panels', setMaterial({ id: 54, scale: 12, grime: 0.55, gloss: 0.3, rim: 0.5 }), false);
  for (let r = 0; r < ROWS; r++) panels.add(box(COLS * DX + 0.14, DY * 0.93, 0.03, X0 + (COLS - 1) * DX * 0.5, Y0 + r * DY, Z + 0.015), r % 2 ? '#a8802f' : '#946e2a');
  panels.add(box(COLS * DX + 0.34, 0.06, 0.09, X0 + (COLS - 1) * DX * 0.5, Y0 - 0.2, Z + 0.04), '#3a3026');
  panels.add(box(COLS * DX + 0.34, 0.06, 0.09, X0 + (COLS - 1) * DX * 0.5, Y0 + 6.7 * DY, Z + 0.04), '#3a3026');
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    const x = X0 + c * DX, y = Y0 + r * DY;
    panels.add(box(0.15, 0.2, 0.012, x, y, Z + 0.036), '#c9a24a');
    for (const [a, b] of [[-0.06, 0.08], [0.06, 0.08], [-0.06, -0.08], [0.06, -0.08]]) { const rv = new THREE.SphereGeometry(0.007, 6, 4); rv.translate(x + a, y + b, Z + 0.044); brass.add(rv, '#e8c470'); }
  }
  panels.build();
  // knife-switch handles and lamps: instanced, updated per frame
  const hGeo = paint(merge([box(0.024, 0.13, 0.02, 0, 0.0, 0.05), new THREE.SphereGeometry(0.034, 10, 8).translate(0, 0.082, 0.058)]), (v) => (v.y > 0.05 ? C('#f2d68a') : C('#4a3626')));
  const hMat = setMaterial({ id: 55, scale: 40, grime: 0.2, gloss: 0.6, rim: 0.8 });
  const handles = new THREE.InstancedMesh(hGeo, hMat, ROWS * COLS); handles.name = 'hut_handles'; handles.frustumCulled = false;
  // instanced vertex needs the instance matrix: use a small chunk patch
  hMat.onBeforeCompile = () => {};
  hMat.vertexShader = hMat.vertexShader.replace('stdVertex(position, normal);', 'stdVertex((instanceMatrix * vec4(position, 1.0)).xyz, mat3(instanceMatrix) * normal);');
  root.add(handles);
  const lampGeo = paint(new THREE.SphereGeometry(0.016, 8, 6), () => [1, 1, 1]);
  const lampMat = new THREE.ShaderMaterial({ glslVersion: THREE.GLSL3, uniforms: {}, side: THREE.DoubleSide,
    vertexShader: `attribute vec3 aCol; in float aOn; out float vOn; out float vD; void main(){ vOn = aOn; vec4 mv = modelViewMatrix * instanceMatrix * vec4(position, 1.0); vD = -mv.z; gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `in float vOn; in float vD; layout(location=0) out vec4 c; layout(location=1) out vec4 d; void main(){ c = vec4(mix(vec3(2.4, 1.3, 0.35), vec3(3.2, 0.18, 0.08), vOn), 0.0); d = vec4(0.5, 0.5, vD, 121.0); }` });
  const lamps = new THREE.InstancedMesh(lampGeo, lampMat, ROWS * COLS); lamps.name = 'hut_lamps'; lamps.frustumCulled = false;
  const lampOn = new Float32Array(ROWS * COLS);
  lamps.geometry.setAttribute('aOn', new THREE.InstancedBufferAttribute(lampOn, 1));
  root.add(lamps);
  const _M = new THREE.Matrix4(), _E = new THREE.Euler(), _P = new THREE.Vector3(), _S = new THREE.Vector3(1, 1, 1), _Q = new THREE.Quaternion();
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    const i = r * COLS + c, x = X0 + c * DX, y = Y0 + r * DY;
    lamps.setMatrixAt(i, _M.makeTranslation(x, y + 0.115, Z + 0.05));
  }
  lamps.instanceMatrix.needsUpdate = true;

  // the master lever on the wall right of the breakers
  const PIV = v3(1.72, 1.15, -1.86), LEN = 0.55;
  const mountB = bag(root, 'hut_mount', brassM, true, ctx);
  mountB.add(box(0.5, 1.5, 0.08, PIV.x, PIV.y, -1.96), '#7a5a2a');
  mountB.add(cyl(0.11, 0.11, 0.42, PIV.x, PIV.y, PIV.z, 0, 0, Math.PI / 2), '#c9a24a');
  for (const s of [1, -1]) mountB.add(box(0.05, 1.4, 0.2, PIV.x + s * 0.2, PIV.y, -1.86), '#6a5a3a');
  mountB.build();
  const lever = new THREE.Group(); lever.name = 'masterLever'; lever.position.copy(PIV); root.add(lever);
  const lvM = setMaterial({ id: 55, scale: 30, grime: 0.4, gloss: 0.25, rim: 0.5 });
  const leverB = bag(lever, 'hut_lever', lvM, false);
  leverB.add(box(0.06, 0.09, LEN, 0, 0, LEN / 2), '#b98b3c');
  leverB.add(cyl(0.034, 0.034, 0.5, 0, 0, LEN, 0, 0, Math.PI / 2, 14), '#2a241e');
  leverB.add(new THREE.SphereGeometry(0.048, 12, 8).translate(0.27, 0, LEN), '#c9a24a');
  leverB.add(new THREE.SphereGeometry(0.048, 12, 8).translate(-0.27, 0, LEN), '#c9a24a');
  leverB.build();
  // caged bulb on a cord: the moving key light
  const cord = strapMesh(root, 'cord', 0.012, 0.012, '#1c1a18', setMaterial({ id: 56, grime: 0 }));
  const bulbM = glowMaterial({ color: '#ffd9a0', k: 3.2 });
  const bulb = new THREE.Mesh(paint(new THREE.SphereGeometry(0.05, 16, 12), () => [1, 1, 1]), bulbM); bulb.name = 'bulb'; root.add(bulb);
  const cage = new THREE.Mesh(paint(new THREE.SphereGeometry(0.076, 8, 6), () => C('#1c1a18')), new THREE.MeshBasicMaterial({ color: '#1c1a18', wireframe: true }));
  cage.material = setMaterial({ id: 56, grime: 0, side: THREE.DoubleSide });
  cage.geometry = paint(merge([new THREE.TorusGeometry(0.076, 0.004, 6, 22), new THREE.TorusGeometry(0.076, 0.004, 6, 22).rotateY(Math.PI / 2), new THREE.TorusGeometry(0.076, 0.004, 6, 22).rotateX(Math.PI / 2)]), () => C('#1c1a18'));
  cage.name = 'cage'; root.add(cage);
  // side console for the crew
  const con = bag(root, 'hut_console', setMaterial({ id: 52, scale: 10, grime: 0.6, rim: 0.4 }), true, ctx);
  con.add(box(1.6, 0.9, 0.5, -2.0, 0.45, 1.9), '#3a4a48');
  con.add(box(1.6, 0.06, 0.6, -2.0, 0.93, 1.85, 0.18), '#2a3634');
  con.build();
  brass.build();
  // a flip unit response, baked once: a thrown knife switch overshoots and rattles against its stop
  const flip = bakeSpring((t) => (t < 0 ? 0 : 1), 1.6, { freq: 7.5, damp: 0.34, tStart: -0.1, x0: 0 });
  const onTwosT = (t) => Math.floor(t * 12 + 1e-6) / 12;
  function setBreakers(t, tRow) {
    const q = onTwosT(t);
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const i = r * COLS + c, x = X0 + c * DX, y = Y0 + r * DY;
        const t0 = tRow(r, c), u = flip(q - t0);
        const ang = 0.7 - 1.4 * u;
        _E.set(ang, 0, 0); _Q.setFromEuler(_E); _P.set(x, y, Z + 0.04);
        handles.setMatrixAt(i, _M.compose(_P, _Q, _S));
        lampOn[i] = q > t0 ? 1 : 0;
      }
    }
    handles.instanceMatrix.needsUpdate = true;
    lamps.geometry.attributes.aOn.needsUpdate = true;
  }
  return { root, lever, PIV, LEN, ROWS, COLS, cord, bulb, cage, bulbM, setBreakers };
}

// ------------------------------------------------------------------ The scorched shell around the hatch
export const DECK = { R: 15, rHatch: 0.5, rCollar: 0.66, yCollar: 0.075 };
export const deckY = (x, z) => -(x * x + z * z) / (2 * DECK.R);
export function deckGrad(x, z) { return [x / DECK.R, z / DECK.R]; }   // height falls away by -(grad . dir)

export function buildDeck(ctx, group) {
  const root = new THREE.Group(); root.name = 'deck'; root.position.set(...SET.DECK); group.add(root);
  const mat = deckMaterial({ id: 52 });
  // a closed slab: top surface and a bottom skirt
  const N = 180, S = 30;
  const P = [], I = [];
  for (let j = 0; j <= N; j++) for (let i = 0; i <= N; i++) { const x = (i / N - 0.5) * S, z = (j / N - 0.5) * S; P.push(x, deckY(x, z), z); }
  const idx = (i, j) => j * (N + 1) + i;
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) { I.push(idx(i, j), idx(i, j + 1), idx(i + 1, j), idx(i + 1, j), idx(i, j + 1), idx(i + 1, j + 1)); }
  const top = new THREE.BufferGeometry(); top.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); top.setIndex(I); top.computeVertexNormals();
  const skirtG = new THREE.BoxGeometry(S * 0.99, 0.3, S * 0.99); skirtG.translate(0, -S * S / (4 * DECK.R) - 2.2, 0);
  const deck = new THREE.Mesh(top, mat); deck.name = 'deckShell'; root.add(deck);
  deck.userData.noShadow = true;
  // QA: a closed proxy of the shell: top + walls + bottom
  const col = (() => {
    const P2 = [...P], I2 = [...I], M = N + 1, base = M * M;
    for (let j = 0; j <= N; j++) for (let i = 0; i <= N; i++) { P2.push((i / N - 0.5) * S, -30, (j / N - 0.5) * S); }
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) { I2.push(base + idx(i, j), base + idx(i + 1, j), base + idx(i, j + 1), base + idx(i + 1, j), base + idx(i + 1, j + 1), base + idx(i, j + 1)); }
    for (let i = 0; i < N; i++) {
      I2.push(idx(i, 0), base + idx(i, 0), idx(i + 1, 0), idx(i + 1, 0), base + idx(i, 0), base + idx(i + 1, 0));
      I2.push(idx(i, N), idx(i + 1, N), base + idx(i, N), idx(i + 1, N), base + idx(i + 1, N), base + idx(i, N));
      I2.push(idx(0, i), idx(0, i + 1), base + idx(0, i), idx(0, i + 1), base + idx(0, i + 1), base + idx(0, i));
      I2.push(idx(N, i), base + idx(N, i), idx(N, i + 1), idx(N, i + 1), base + idx(N, i), base + idx(N, i + 1));
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P2, 3)); g.setIndex(I2);
    const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ visible: false })); m.name = 'deckShell'; m.visible = true; root.add(m); m.material.colorWrite = false; return m;
  })();
  col.renderOrder = -1;
  ctx.colliders.push({ name: 'deckShell', dept: 'folk', obj: col, kind: 'solid' });
  const metal = setMaterial({ id: 53, scale: 12, grime: 0.9, gloss: 0.4, rim: 0.7 });
  const R1 = DECK.rHatch, R2 = DECK.rCollar, H = DECK.yCollar;
  const cB = bag(root, 'deckCollar', metal, true, ctx);
  const pf = [new THREE.Vector2(R1 + 0.02, -0.12), new THREE.Vector2(R2 + 0.08, -0.12), new THREE.Vector2(R2 + 0.04, H * 0.4), new THREE.Vector2(R2 - 0.03, H), new THREE.Vector2(R1 + 0.04, H), new THREE.Vector2(R1 + 0.02, -0.12)];
  cB.add(new THREE.LatheGeometry(pf, 72), (v) => mixc(C('#b4683a'), C('#5a3322'), sstep(0.5, 0.9, Math.sin(v.x * 11) * Math.cos(v.z * 13))));
  for (let i = 0; i < 24; i++) { const a = (i / 24) * Math.PI * 2, r = R2 - 0.01; const rv = new THREE.SphereGeometry(0.018, 8, 6); rv.translate(Math.sin(a) * r, H + 0.005, Math.cos(a) * r); cB.add(rv, '#7a6a5a'); }
  // the hinge lugs on the far side
  cB.add(box(0.5, 0.11, 0.14, 0, 0.13, -R1 - 0.09), '#3a2a24');
  cB.build();
  // the dark hole, glowing a sullen red when the cover comes off
  const holeM = glowMaterial({ color: '#ff5a20', k: 0.0, id: 123 });
  const holeGeo = paint(new THREE.CircleGeometry(R1 + 0.03, 48).rotateX(-Math.PI / 2).translate(0, 0.01, 0), (v) => { const r = Math.hypot(v.x, v.z); return [0.2 + 0.8 * (1 - r / 0.55), 0.2 + 0.8 * (1 - r / 0.55), 0.2 + 0.8 * (1 - r / 0.55)]; });
  const hole = new THREE.Mesh(holeGeo, holeM); hole.name = 'hatchHole'; root.add(hole);
  // cover: hinged on the far side; the lever-latch sits on it
  const hinge = new THREE.Group(); hinge.name = 'hatchHinge'; hinge.position.set(0, 0.13, -R1 - 0.05); root.add(hinge);
  const coverB = bag(hinge, 'hatchCover', metal, true, ctx);
  const czC = R1 + 0.05;
  coverB.add(cyl(R1 + 0.0, R1 + 0.0, 0.09, 0, -0.04, czC, 0, 0, 0, 56), (v) => mixc(C('#c47a42'), C('#7a4428'), sstep(0.4, 0.8, Math.sin(v.x * 9 + 1) * Math.sin(v.z * 8 + 2))));
  coverB.add(new THREE.TorusGeometry(R1 - 0.05, 0.022, 8, 56).rotateX(Math.PI / 2).translate(0, 0.012, czC), '#7a5a3a');
  // the lid is a piece of the Tortoise: a raised centre scute and six ribs out to the rim
  coverB.add(new THREE.CylinderGeometry(0.2, 0.225, 0.022, 6).rotateY(Math.PI / 6).translate(0, 0.016, czC), '#d89a56');
  for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; coverB.add(box(0.032, 0.022, 0.22, Math.sin(a) * 0.32, 0.014, czC + Math.cos(a) * 0.32, 0, a, 0), '#a8622f'); }
  for (let i = 0; i < 14; i++) { const a = (i / 14) * Math.PI * 2, r = R1 - 0.11; const rv = new THREE.SphereGeometry(0.016, 8, 6); rv.translate(Math.sin(a) * r, 0.012, czC + Math.cos(a) * r); coverB.add(rv, '#8a7a6a'); }
  coverB.add(box(0.26, 0.09, 0.14, 0, -0.01, 0.02), '#2a221e');
  coverB.add(cyl(0.05, 0.08, 0.1, 0, 0.04, czC, 0, 0, 0, 20), '#2a221e');
  // the underside, seen once it swings up: ring and cross braces
  coverB.add(new THREE.TorusGeometry(R1 - 0.1, 0.02, 8, 48).rotateX(Math.PI / 2).translate(0, -0.088, czC), '#5a3322');
  coverB.add(box(0.74, 0.03, 0.07, 0, -0.092, czC), '#6a3c26');
  coverB.add(box(0.07, 0.03, 0.74, 0, -0.092, czC), '#6a3c26');
  coverB.build();
  // lever-latch: the bar he hauls on
  const leverLen = 0.86;
  const lever = new THREE.Group(); lever.name = 'latchLever'; lever.position.set(0, 0.08, czC); hinge.add(lever);
  const lv = bag(lever, 'latchBar', setMaterial({ id: 55, scale: 20, grime: 0.8, gloss: 0.5, rim: 0.8 }), true, ctx);
  lv.add(cyl(0.024, 0.03, leverLen, 0, leverLen / 2, 0, 0, 0, 0, 12), (v) => mixc(C('#3a2a24'), C('#c8501e'), sstep(0.2, 0.8, v.y / leverLen) * 0.8));
  lv.add(cyl(0.028, 0.028, 0.6, 0, leverLen, 0, 0, 0, Math.PI / 2, 14), '#c0431a');
  lv.add(new THREE.SphereGeometry(0.04, 10, 8).translate(0.3, leverLen, 0), '#7a2e16');
  lv.add(new THREE.SphereGeometry(0.04, 10, 8).translate(-0.3, leverLen, 0), '#7a2e16');
  lv.build();
  // smoke: a few big drawn forms rising out of the seam, then the hole
  const rng = new Rng(4242);
  const puffs = [];
  for (let i = 0; i < 0; i++) {   // the hatch smoke is FX's plume now
    const m = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), smokeMaterial({ seed: 7.3 * i + 1.7 })); m.name = 'smokePuff'; m.userData.noShadow = true; m.visible = false; m.frustumCulled = false; root.add(m);
    puffs.push({ m, t0: rng.range(0, 1), a: rng.range(0, 6.28), v: rng.range(1.0, 1.7), s: rng.range(0.18, 0.34), sw: rng.range(0.2, 0.6) });
  }
  // a little ridge of broken armour far along the shell, for depth
  const debris = bag(root, 'deckDebris', metal, false);
  for (let i = 0; i < 10; i++) {
    const a = rng.range(0, 6.28), r = rng.range(1.3, 5.5), x = Math.sin(a) * r, z = Math.cos(a) * r, y = deckY(x, z);
    if (Math.abs(x) < 1.0 && z > 0) continue;   // keep the running lane clear
    const g = box(rng.range(0.12, 0.34), 0.05, rng.range(0.12, 0.34), x, y + 0.03, z, rng.range(-0.3, 0.3), rng.range(0, 3), rng.range(-0.3, 0.3)); debris.add(g, '#23201f');
  }
  debris.build();
  // sparks thrown back from the skidding heels
  const sparkM = glowMaterial({ color: '#ffcf80', k: 3.4, id: 123 });
  const sparks = [];
  for (let i = 0; i < 16; i++) { const m = new THREE.Mesh(paint(new THREE.BoxGeometry(0.007, 0.007, 0.055), () => [1, 1, 1]), sparkM); m.name = 'heelSpark'; m.visible = false; m.frustumCulled = false; m.userData.noShadow = true; root.add(m); sparks.push(m); }
  return { root, deck, hinge, lever, hole, holeM, sparks, puffs, mat, leverLen };
}

// ------------------------------------------------------------------ The paper window (s02)
export function buildWindow(ctx, group) {
  const root = new THREE.Group(); root.name = 'window'; root.position.set(...SET.WIN); group.add(root);
  const wall = bag(root, 'win_wall', setMaterial({ id: 50, scale: 3.5, grime: 0.6, kind: 1, rim: 0 }), false);
  // wall with a round hole: a ring-shaped slab (the pane sits behind it)
  wall.add(new THREE.RingGeometry(0.62, 4, 80, 2).toNonIndexed(), '#2c3a5a');
  for (let i = 0; i < 40; i++) { const a = (i / 40) * 6.28, r = 0.66 + (i % 3) * 0.05; const g = ell(0.03, 0.022, 0.012, 6, 4); g.translate(Math.cos(a) * r, Math.sin(a) * r, 0.01); wall.add(g, '#1c2840'); }
  wall.build();
  const frameM = setMaterial({ id: 53, scale: 14, grime: 0.4, rim: 0.8 });
  const fr = bag(root, 'win_frame', frameM, false);
  fr.add(new THREE.TorusGeometry(0.56, 0.075, 12, 72).translate(0, 0, 0.03), '#5a3a26');
  fr.add(new THREE.TorusGeometry(0.47, 0.018, 8, 64).translate(0, 0, 0.05), '#3a2418');
  // lattice in front of the paper
  for (const k of [-1, 0, 1]) { fr.add(box(0.016, 1.0, 0.02, k * 0.2, 0, 0.018), '#2a1a12'); fr.add(box(1.0, 0.014, 0.02, 0, k * 0.22, 0.018), '#2a1a12'); }
  fr.build();
  const mat = windowMaterial();
  const pane = new THREE.Mesh(new THREE.CircleGeometry(0.5, 72), mat); pane.position.z = -0.0; pane.name = 'winPane'; root.add(pane);
  // a string of paper lanterns, already dead, crossing the corner of the frame
  const lm = setMaterial({ id: 54, scale: 8, grime: 0.2, kind: 1, rim: 0.5 });
  const ln = bag(root, 'win_lanterns', lm, false);
  const curve = new THREE.CatmullRomCurve3([v3(-1.6, 1.15, 0.5), v3(-0.9, 0.82, 0.6), v3(0.1, 0.94, 0.65), v3(1.1, 1.26, 0.6), v3(1.7, 1.38, 0.5)]);
  ln.add(new THREE.TubeGeometry(curve, 40, 0.005, 5), '#1a1820');
  for (const u of [0.18, 0.42, 0.68, 0.9]) { const p = curve.getPointAt(u); const g = ell(0.075, 0.095, 0.075, 16, 12); g.translate(p.x, p.y - 0.1, p.z); ln.add(g, '#a8706a'); ln.add(cyl(0.022, 0.022, 0.02, p.x, p.y - 0.01, p.z), '#1a1820'); }
  ln.build();
  return { root, mat };
}
