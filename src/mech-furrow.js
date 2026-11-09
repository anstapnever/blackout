import * as THREE from 'three';
import { Kit } from './mech-geo.js';
import { plan, PAD_Y, SHOVE } from './mech-map.js';
import { noise1 } from './util.js';

// MECH dept: what the Tortoise's feet do to the rock. Landing craters of tilted slabs, two furrows that open row by row
// behind each foot as it is shoved back (draw range grows with footShove, pure in t), a mound of rubble pushed ahead of the foot.
const STEP = 0.6, HALF = 5.7;
const ROCK = { col: '#6a605e', metal: 0, detail: 0.45, wear: 0.5, seam: 0, pw: 60, ph: 60, riv: 0, tone: 0.16 };
const FRESH = { col: '#a08d7d', metal: 0, detail: 0.3, wear: 0.2, seam: 0, pw: 60, ph: 60, riv: 0, tone: 0.14 };
const FLOOR = { col: '#3d3841', metal: 0, detail: 0.7, wear: 0.4, seam: 0, pw: 60, ph: 60, riv: 0, tone: 0.1 };

const tri = (arr, a, b, c) => arr.push(...a, ...b, ...c);
function ribbon(rowA, rowB) {
  const p = [];
  for (let i = 0; i + 1 < rowA.length; i++) {
    tri(p, rowA[i], rowA[i + 1], rowB[i + 1]);
    tri(p, rowA[i], rowB[i + 1], rowB[i]);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
  g.computeVertexNormals();
  return g;
}
function rock(k, bin, st, pos, r, flat = 0.55) {
  const g = new THREE.IcosahedronGeometry(1, 0);
  k.add(bin, g, st, pos, [k.rng.next() * 360, k.rng.next() * 360, k.rng.next() * 360], { id: 33, scale: [r * (0.8 + k.rng.next() * 0.7), r * flat * (0.7 + k.rng.next() * 0.8), r * (0.8 + k.rng.next() * 0.7)] });
}

export function buildFurrows(groundW, stances, material) {
  const root = new THREE.Group(); root.name = 'furrows';
  const out = [];
  for (const [side, S] of stances.entries()) {
    const k = new Kit(71 + side * 13), joints = { f: new THREE.Group(), crater: new THREE.Group(), mound: new THREE.Group() };
    for (const n in joints) root.add(joints[n]);
    const counts = [0];
    const nRows = Math.ceil(SHOVE / STEP);
    const profile = (r) => {
      const z = S.z - r * STEP, cur = noise1(r * 0.07, 40 + side) * 0.8;          // the foot wanders a little under load
      const grow = Math.min(1, r / 6);
      const hL = (0.9 + 1.5 * Math.abs(noise1(r * 0.31, 3 + side))) * grow, hR = (0.9 + 1.5 * Math.abs(noise1(r * 0.27, 9 + side))) * grow;
      const pts = [[-HALF - 4.2, -0.05], [-HALF - 2.1, hL * 0.72], [-HALF - 0.9, hL], [-HALF, 0.34 * hL], [-HALF + 0.5, 0.07], [HALF - 0.5, 0.07], [HALF, 0.34 * hR], [HALF + 0.9, hR], [HALF + 2.1, hR * 0.72], [HALF + 4.2, -0.05]];
      return pts.map(([x, h]) => {
        const p = plan(S.x + cur + x + noise1(r * 0.5 + x, 5) * 0.24, z);
        return [p.x, groundW(p.x, p.z) + h, p.z];
      });
    };
    let prev = profile(0);
    for (let r = 1; r <= nRows; r++) {
      const next = profile(r);
      k.add('f', ribbon(prev.slice(4, 6), next.slice(4, 6)), FLOOR, undefined, undefined, { id: 33 });
      k.add('f', ribbon(prev.slice(0, 5), next.slice(0, 5)), ROCK, undefined, undefined, { id: 33 });
      k.add('f', ribbon(prev.slice(5), next.slice(5)), ROCK, undefined, undefined, { id: 33 });
      // torn slabs along both lips and claw gouges in the floor
      for (const s of [-1, 1]) {
        if (k.rng.next() < 0.75) {
          const p = plan(S.x + s * (HALF + 0.8 + k.rng.next() * 2.4), S.z - r * STEP);
          rock(k, 'f', k.rng.next() < 0.45 ? FRESH : ROCK, [p.x, groundW(p.x, p.z) + 0.8, p.z], 0.45 + k.rng.next() * 1.0);
        }
      }
      counts.push(k.tris);
      prev = next;
    }
    // landing crater: slabs thrown up around the plant
    for (let i = 0; i < 20; i++) {
      const a = (i / 20) * Math.PI * 2 + k.rng.next() * 0.2, rr = 6.2 + k.rng.next() * 3.4;
      const w = 2.4 + k.rng.next() * 2.4;
      const g = new THREE.BoxGeometry(w, 0.8 + k.rng.next() * 0.7, 3.2 + k.rng.next() * 2.4, 1, 1, 1);
      k.add('crater', g, k.rng.next() < 0.4 ? FRESH : ROCK, [Math.cos(a) * rr, 0.7, Math.sin(a) * rr], [Math.sin(a) * -28 + (k.rng.next() - 0.5) * 16, (-a * 180) / Math.PI + 90, Math.cos(a) * 28 + (k.rng.next() - 0.5) * 16], { id: 33 });
    }
    for (let i = 0; i < 26; i++) { const a = k.rng.next() * 6.28, rr = 7 + k.rng.next() * 7; rock(k, 'crater', k.rng.next() < 0.5 ? FRESH : ROCK, [Math.cos(a) * rr, 0.25, Math.sin(a) * rr], 0.35 + k.rng.next() * 0.8); }
    // the mound of broken rock the foot pushes in front of it
    for (let i = 0; i < 70; i++) {
      const u = k.rng.next(), x = (k.rng.next() - 0.5) * (HALF * 2 + 4), zz = -u * 5.6, env = 1 - Math.abs(x) / (HALF + 3);
      rock(k, 'mound', k.rng.next() < 0.5 ? FRESH : ROCK, [x, (1 - u) * env * 2.8 + 0.4, zz], 0.4 + k.rng.next() * 0.85, 0.8);
    }
    k.finish(joints, material);
    const pC = plan(S.x, S.z); joints.crater.position.set(pC.x, groundW(pC.x, pC.z), pC.z);
    joints.crater.quaternion.copy(S.q); joints.mound.quaternion.copy(S.q);
    out.push({ side, S, joints, counts, mesh: joints.f.children[0] });
  }
  return { root, out, STEP };
}
