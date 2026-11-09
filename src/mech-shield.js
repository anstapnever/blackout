import * as THREE from 'three';
import { Kit, v3, hull, cbox, cylZ, cylX, ball, boxUV, sweep, ringZ, extrude } from './mech-geo.js';
import { Rng, lerp, clamp, smooth } from './util.js';

// MECH dept: the Tortoise's SHIELD: the riveted steel bow of a ship, cut from its hull. Local: x across, y up, keel at z+, the cut (back) at z ≈ 0.
// The outer skin is a CPU-deformed grid so the melt really moves metal; the hole is cut in the fragment shader from the same formula.
// Centre of the shield (the beam's aim point) is at local (0, 0). Top y = +20, bottom y = -18.
export const SHIELD = { top: 20, bottom: -18, halfW: 17 };

const halfB = (y) => { const u = clamp((y + 18) / 38); return lerp(7.5, 17, Math.pow(u, 0.62)); };       // flare: narrow forefoot, wide top
const keelZ = (y) => 12 + 2 * Math.sin(((y + 18) / 38) * 2.6);
const secZ = (s, y) => { const a = 1 - Math.pow(Math.abs(s), 1.55); return keelZ(y) * a; };              // V section, sharp at the stem

export function holeRadiusFn(tMelt, tGone) {
  const K = (t) => clamp((t - tMelt) / (tGone - tMelt));
  return (t) => {
    if (t < tMelt - 0.2) return -1;
    const k = K(t);
    // starts as a white spot at once, grows in surges as the beam bites, until nothing remains
    const base = k < 0 ? 0 : Math.pow(k, 0.72) * 34;
    const surge = 1.2 * Math.sin(k * 21) * (1 - k);
    return Math.max(0.05, base + surge);
  };
}
export function holeDist(x, y, R, seed = 0) {            // >0 inside the hole
  const r = Math.hypot(x, y) + 1e-4, a = Math.atan2(y, x);
  const lobes = 1 + 0.28 * Math.sin(5 * a + 1.3 + seed) + 0.16 * Math.sin(9 * a + 4.1) + 0.08 * Math.sin(17 * a + 0.7);
  return R * lobes - r;
}

const STRK = { col: '#3c4454', metal: 0.5, detail: 1, tone: 0, wear: 1.1, pw: 7, ph: 1.5, riv: 0.55 };
export function buildShieldSkin(nu = 170, nv = 130) {
  // Rest grid, x across (s -1..1), y up. Skin is one thick closed shell: front and back sheets plus a rim.
  const Vtx = (nu + 1) * (nv + 1);
  const rest = new Float32Array(Vtx * 3), uvs = new Float32Array(Vtx * 2);
  for (let j = 0, p = 0; j <= nv; j++) {
    const v = j / nv, y = lerp(SHIELD.bottom, SHIELD.top, v), b = halfB(y);
    for (let i = 0; i <= nu; i++, p++) {
      const s = lerp(-1, 1, i / nu);
      rest[p * 3] = b * s; rest[p * 3 + 1] = y; rest[p * 3 + 2] = secZ(s, y);
      uvs[p * 2] = (b * s + 40) * 1.0; uvs[p * 2 + 1] = y + 18;
    }
  }
  const idx = [];
  const at = (i, j) => j * (nu + 1) + i;
  for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) {
    const a = at(i, j), b = at(i + 1, j), c = at(i + 1, j + 1), d = at(i, j + 1);
    idx.push(a, b, c, a, c, d);
  }
  // a thin back sheet, reused rim handled by creasing: close the shell with a second layer at -0.4 m z
  const N = Vtx;
  const pos2 = new Float32Array(N * 6), uvs2 = new Float32Array(N * 4), rest2 = new Float32Array(N * 6);
  for (let i = 0; i < N; i++) {
    for (let k = 0; k < 3; k++) { rest2[i * 3 + k] = rest[i * 3 + k]; rest2[(N + i) * 3 + k] = rest[i * 3 + k]; }
    rest2[(N + i) * 3 + 2] -= 0.6;
    for (let k = 0; k < 2; k++) { uvs2[i * 2 + k] = uvs[i * 2 + k]; uvs2[(N + i) * 2 + k] = uvs[i * 2 + k] + 3.1; }
  }
  const idx2 = [];
  for (let t = 0; t < idx.length; t += 3) { idx2.push(idx[t], idx[t + 1], idx[t + 2], idx[t] + N, idx[t + 2] + N, idx[t + 1] + N); }
  const perim = [];
  for (let i = 0; i < nu; i++) perim.push([at(i, 0), at(i + 1, 0)]);
  for (let j = 0; j < nv; j++) perim.push([at(nu, j), at(nu, j + 1)]);
  for (let i = nu; i > 0; i--) perim.push([at(i, nv), at(i - 1, nv)]);
  for (let j = nv; j > 0; j--) perim.push([at(0, j), at(0, j - 1)]);
  for (const [a, b] of perim) idx2.push(a, a + N, b + N, a, b + N, b);

  const count = N * 2;
  const g = new THREE.BufferGeometry();
  const pos = new THREE.BufferAttribute(new Float32Array(count * 3), 3).setUsage(THREE.DynamicDrawUsage);
  const nor = new THREE.BufferAttribute(new Float32Array(count * 3), 3).setUsage(THREE.DynamicDrawUsage);
  g.setAttribute('position', pos); g.setAttribute('normal', nor);
  g.setAttribute('uv', new THREE.BufferAttribute(uvs2, 2));
  g.setAttribute('aRest', new THREE.BufferAttribute(rest2, 3));
  const col = new Float32Array(count * 3), mat = new Float32Array(count * 4), ex = new Float32Array(count * 3), pan = new Float32Array(count * 3);
  const c = new THREE.Color(STRK.col);
  for (let i = 0; i < count; i++) {
    col.set([c.r, c.g, c.b], i * 3); mat.set([STRK.metal, STRK.detail, 0, 31], i * 4); ex.set([0, STRK.wear, 0], i * 3); pan.set([STRK.pw, STRK.ph, STRK.riv], i * 3);
  }
  g.setAttribute('aCol', new THREE.BufferAttribute(col, 3));
  g.setAttribute('aMat', new THREE.BufferAttribute(mat, 4));
  g.setAttribute('aEx', new THREE.BufferAttribute(ex, 3));
  g.setAttribute('aPan', new THREE.BufferAttribute(pan, 3));
  g.setIndex(idx2);
  return { g, rest2, pos, nor, count, nu, nv, N };
}

// Deform the skin in place: the rim of the hole curls back and sags. ride = 0..1 overall denting toward the holder.
export function deformSkin(sk, R, ride, seed = 0) {
  const { rest2, pos, count } = sk;
  const P = pos.array;
  for (let i = 0; i < count; i++) {
    let x = rest2[i * 3], y = rest2[i * 3 + 1], z = rest2[i * 3 + 2];
    // the whole bow dents around the impact
    const rr = Math.hypot(x, y);
    z -= ride * 3.0 * Math.exp(-rr * rr / 180);
    if (R > 0) {
      const e = -holeDist(x, y, R, seed);    // metres outside the hole edge
      if (e < 11) {
        const c = Math.exp(-Math.max(0, e) / 4.5);
        const rx = x / (rr + 1e-3), ry = y / (rr + 1e-3);
        // the petal curls radially outward and back, and drips under gravity at the lip
        x += rx * c * 1.9;
        y += ry * c * 1.9 - c * c * 3.5;
        z -= c * 4.0 + c * c * c * 2.0;
      }
    }
    P[i * 3] = x; P[i * 3 + 1] = y; P[i * 3 + 2] = z;
  }
  pos.needsUpdate = true;
  sk.g.computeVertexNormals();
}

// inner ribs, frames and the handles (rigid, also cut by the same hole in the shader)
export function buildShieldFrame(material) {
  const k = new Kit(53);
  const j = { frame: new THREE.Group(), grips: new THREE.Group() };
  const FR = { col: '#6b3726', metal: 0.3, detail: 1, tone: 0.1, wear: 1.1, pw: 3, ph: 1, riv: 0.6 };
  const FRD = { col: '#3e2b28', metal: 0.3, detail: 0.9, tone: 0.1, wear: 1, pw: 3, ph: 1, riv: 0 };
  const IR = { col: '#2c2a30', metal: 0.5, detail: 0.7, tone: 0.06, wear: 0.8, pw: 2.5, ph: 1, riv: 0 };
  const CH = { col: '#2a2628', metal: 0.5, detail: 0.5, tone: 0.1, wear: 0.8, pw: 2, ph: 1, riv: 0 };
  // transverse ribs: curved ship's frames at every 3.2 m of height, behind the plating
  for (let y = SHIELD.bottom + 2; y <= SHIELD.top - 1; y += 3.2) {
    const b = halfB(y);
    const P = [];
    for (let i = 0; i <= 14; i++) { const s = lerp(-0.97, 0.97, i / 14); P.push(v3(b * s, y, secZ(s, y) - 0.95)); }
    k.add('frame', sweep(P, 0.46, 44, 4), FR);
  }
  // the keel bar and longitudinal stringers
  { const P = []; for (let y = SHIELD.bottom; y <= SHIELD.top; y += 3) P.push(v3(0, y, secZ(0, y) - 0.5)); k.add('frame', sweep(P, 0.85, 40, 6), FRD); }
  for (const s of [-0.75, -0.42, 0.42, 0.75]) { const P = []; for (let y = SHIELD.bottom + 1; y <= SHIELD.top - 1; y += 2.5) P.push(v3(halfB(y) * s, y, secZ(s, y) - 0.8)); k.add('frame', sweep(P, 0.34, 40, 4), FR); }
  // main transverse beams behind the bow: what the hands hold
  for (const y of [8, -5]) {
    const b = halfB(y) * 0.84;
    k.member('frame', [-b, y, 1.0], [b, y, 1.0], 1.3, 1.6, FRD, { ibeam: true });
  }
  // stem bar and the rub rail along the top edge, on the outside
  { const P = []; for (let y = SHIELD.bottom; y <= SHIELD.top + 0.5; y += 2) P.push(v3(0, y, secZ(0, y) + 0.32)); k.add('frame', sweep(P, 0.62, 36, 6), IR); }
  { const b = halfB(SHIELD.top); const P = []; for (let i = 0; i <= 24; i++) { const s = lerp(-1, 1, i / 24); P.push(v3(b * s, SHIELD.top + 0.15, secZ(s, SHIELD.top) + 0.1)); } k.add('frame', sweep(P, 0.4, 56, 6), IR); }
  // hawse pipe and a stowed anchor, the unmistakable mark of a ship's bow
  for (const s of [1, -1]) {
    const M = { mirror: s < 0 };
    const y = 11.5, ss = 0.56, b = halfB(y), z = secZ(ss, y);
    const n = v3(1, 0, 0.45).normalize();
    void n;
    k.add('frame', cylZ(1.5, 1.2, 22), IR, [b * ss, y, z + 0.1], [0, 28, 0], M);
    k.add('frame', ringZ(1.35, 0.3, 26, 6), { col: '#b98f4c', metal: 0.8, detail: 0.3, wear: 0.4, pw: 2, ph: 1 }, [b * ss, y, z + 0.4], [0, 28, 0], M);
    // the anchor hanging from it (fluke + shank)
    k.add('frame', boxUV(0.6, 6.5, 0.6), CH, [b * ss + 0.6, y - 3.7, z + 0.85], [0, 28, 0], M);
    k.add('frame', hull([v3(-2.2, -0.5, 0), v3(2.2, -0.5, 0), v3(-2.8, 0.8, 0.2), v3(2.8, 0.8, 0.2), v3(0, -0.9, 0.5), v3(0, -0.9, -0.3)], 25), CH, [b * ss + 0.6, y - 7.2, z + 0.95], [0, 28, 0], M);
    // chain links down the plating
    for (let i = 0; i < 5; i++) k.add('frame', new THREE.TorusGeometry(0.34, 0.12, 6, 10).scale(1, 1.3, 1), CH, [b * ss + 0.6, y - 0.8 - i * 0.54, z + 1.0], [0, i % 2 ? 90 : 0, 0], M);
  }
  // handles: separate bin (a hand always wraps around these)
  k.add('grips', boxUV(13, 1.6, 1.6), IR, [0, 8, -1.2]);
  k.add('grips', boxUV(13, 1.6, 1.6), IR, [0, -5, -1.2]);
  for (const y of [8, -5]) for (const x of [-7.2, 7.2]) k.add('grips', cbox(1.6, 2.5, 2.8, 0.2), IR, [x, y, -0.2]);
  const meshes = k.finish(j, material);
  return { j, meshes };
}
export const GRIP_L = new THREE.Vector3(4.4, -5, -1.2), GRIP_R = new THREE.Vector3(-4.4, 8, -1.2);
