import * as THREE from 'three';
import { Kit, v3, cbox, hull, cyl, cylZ, cylX, coneZ, ring, ringZ, ball, sweep, boxUV, extrude } from './mech-geo.js';
import { panelMaterial } from './mech-mat.js';
import { fromFrame, BARREL } from './mech-map.js';
import { Rng, lerp } from './util.js';

// MECH dept: the LONG ARM. A cannon built from bridge girders: 180 m of riveted lattice around a bore tube, on a recoil bed.
// All geometry in the firing frame: origin at the breech axis point, +Z to the muzzle, +Y up.
// 'bed' stays fixed on the rock; 'slide' recoils along -Z; hammer and fans are joints of the slide.

const CREAM = { col: '#dccba6', metal: 0.25, detail: 1, tone: 0.05, wear: 1, pw: 4.5, ph: 2.2, riv: 0.8 };
const CREAMD = { col: '#c7b48e', metal: 0.25, detail: 1, tone: 0.06, wear: 1, pw: 3.5, ph: 1.8, riv: 0.7 };
const OXIDE = { col: '#8f3f2c', metal: 0.28, detail: 1, tone: 0.07, wear: 1, pw: 3, ph: 0.9, riv: 0.55 };
const OXIDED = { col: '#6b2c21', metal: 0.3, detail: 1, tone: 0.07, wear: 1, pw: 3, ph: 1.0, riv: 0.6 };
const IRON = { col: '#3d3a44', metal: 0.6, detail: 0.8, tone: 0.08, wear: 0.8, pw: 2.5, ph: 1.2, riv: 0.5 };
const DARK = { col: '#26242d', metal: 0.5, detail: 0.5, tone: 0.06, wear: 0.5, pw: 2, ph: 1.5, riv: 0 };
const BRASS = { col: '#b98f4c', metal: 0.85, detail: 0.5, tone: 0.05, wear: 0.6, pw: 1.5, ph: 0.8, riv: 0 };
const RUBBER = { col: '#23262c', metal: 0.2, detail: 0.35, tone: 0.1, wear: 0.4, pw: 3, ph: 1, riv: 0 };
const HAZ = { col: '#c9a23a', metal: 0.2, detail: 1, tone: 0.04, wear: 1.2, pw: 3, ph: 1.5, riv: 0 };
const SEAM = { col: '#6a4a2a', metal: 0, detail: 0, emis: 1, tone: 0, wear: 0 };
const LAMP = { col: '#c07820', metal: 0, detail: 0, emis: 3, tone: 0, wear: 0 };
const BORE = { col: '#2a2830', metal: 0.2, detail: 0.3, emis: 5, tone: 0, wear: 0 };

export const CANNON_Z0 = 14, CANNON_Z1 = 166;
export const halfW = (z) => lerp(5.8, 3.8, Math.min(1, Math.max(0, z / BARREL)));
// the two deep side trusses of the through-girder: half width, top chord, bottom chord (a railway bridge with a gun down its middle)
const u01 = (z) => Math.min(1, Math.max(0, z / BARREL));
export const TW = (z) => lerp(10.2, 6.2, u01(z)), TT = (z) => lerp(15.5, 9.0, u01(z)), TB = (z) => lerp(-12.8, -8.2, u01(z));

export function buildCannon(ctx, material, groundAt) {
  const j = {};
  const root = new THREE.Group(); root.name = 'cannon'; j.root = root;
  const J = (name, parent, pos) => { const g = new THREE.Group(); g.name = name; g.position.set(...pos); parent.add(g); j[name] = g; return g; };
  const bed = J('bed', root, [0, 0, 0]);
  const slide = J('slide', root, [0, 0, 0]);
  const hammer = J('hammer', slide, [0, 8.8, -11.5]);
  J('key', slide, [0, 0, 0]);   // the long cream jacket along the top of the girder; hidden from the shots looking down the gun (s01c, s08)
  J('hud', slide, [-4.6, 19.0, 69.95]);   // POWER plate, its post and backing: s01c rides this with the zoom so the plate stays where it is on screen
  J('grips', root, [0, 0, 0]);   // moved with the slide in poseCannon, kept out of the slide's solid collider
  const fans = [];
  // fans lie flat on top of the radiator shelves (mount turns the joint's x axis to vertical), so no spoked wheel faces the viewer
  for (const [i, s] of [[0, 1], [1, -1]]) for (const zf of [34, 59]) {
    const mount = J('fanMount' + fans.length, slide, [s * (TW(zf) + 5.6), 5.9, zf]);
    mount.rotation.z = Math.PI / 2; mount.scale.setScalar(0.56);
    const f = J('fan' + fans.length, mount, [0, 0, 0]);
    fans.push({ joint: f, dir: s * (zf > 40 ? 1 : -1) });
    void i;
  }
  const WEB_B = { col: '#6b2c21', metal: 0.3, detail: 1, tone: 0.07, wear: 1, pw: 4, ph: 1.0, riv: 0.55 };
  const k = new Kit(61);
  const R = new Rng(90);

  // ----------------------------------------------------------- bore tube and lattice girder (slide)
  const B = 'slide';
  const y0 = 0;
  // bore tube in 15 m sections with oxide collars
  for (let z = CANNON_Z0, i = 0; z < CANNON_Z1; z += 15, i++) {
    const r0 = lerp(3.0, 2.25, z / BARREL), L = 13.8;
    k.add(B, cylZ(r0, L, 28), { ...CREAM, emis: 0 }, [0, y0, z + L / 2]);
    k.add(B, cylZ(r0 * 0.97, L + 1.4, 20), BORE, [0, y0, z + L / 2]);
    k.add(B, cylZ(r0 + 0.42, 1.2, 28), OXIDE, [0, y0, z + 0.6]);
    k.add(B, cylZ(r0 + 0.42, 1.2, 28), OXIDE, [0, y0, z + L + 0.2]);
    for (let a = 0; a < 16; a++) {
      const th = (a / 16) * Math.PI * 2;
      k.add(B, ball(0.16, 6, 4), IRON, [Math.cos(th) * (r0 + 0.46), y0 + Math.sin(th) * (r0 + 0.46), z + 0.6]);
    }
    void i;
  }
  // the lattice: bays with four longerons, batten frames, X diagonals, gussets
  const BAY = 7.6;
  const pts = (z) => { const w = halfW(z); return [[-w, w * 0.94], [w, w * 0.94], [w, -w * 0.94], [-w, -w * 0.94]]; };
  for (let z = CANNON_Z0, n = 0; z < CANNON_Z1 - 0.1; z += BAY, n++) {
    const z1 = Math.min(z + BAY, CANNON_Z1);
    const a = pts(z), b = pts(z1);
    for (let c = 0; c < 4; c++) {
      k.member(B, [a[c][0], a[c][1], z], [b[c][0], b[c][1], z1], 1.25, 1.25, c < 2 ? CREAM : OXIDED, { ibeam: true });
      // battens
      const d = (c + 1) % 4;
      k.member(B, [a[c][0], a[c][1], z], [a[d][0], a[d][1], z], 0.75, 0.75, OXIDE, { ibeam: false });
    }
    // X diagonals on the two sides and the belly
    for (const [c, d] of [[1, 2], [3, 0], [2, 3]]) {
      k.member(B, [a[c][0], a[c][1], z], [b[d][0], b[d][1], z1], 0.42, 0.42, OXIDE);
      k.member(B, [a[d][0], a[d][1], z], [b[c][0], b[c][1], z1], 0.42, 0.42, OXIDE);
    }
    // spider ring around the bore
    if (n % 2 === 0) {
      const r0 = lerp(3.0, 2.25, z / BARREL);
      for (let c = 0; c < 4; c++) {
        const [ax, ay] = a[c], al = Math.hypot(ax, ay);
        k.member(B, [ax, ay, z + 1], [(ax / al) * (r0 + 0.5), (ay / al) * (r0 + 0.5), z + 1], 0.46, 0.46, IRON);
      }
    }
    // gusset plates with bolts at every node (the top ones)
    for (const c of [0, 1]) {
      const sx = Math.sign(a[c][0]);
      k.add(B, boxUV(2.4, 0.16, 2.6), { ...IRON, pw: 2.4, ph: 2.6, riv: 0.38 }, [a[c][0] - sx * 0.3, a[c][1] + 0.72, z]);
    }
  }
  // the deck along the top: riveted cream plating the eye runs along in the hook shot
  const deckTop = (z) => halfW(z) * 0.94 + 0.84;
  for (let z = CANNON_Z0, i = 0; z < CANNON_Z1; z += 12, i++) {
    const zc = z + 6, wd = halfW(zc) + 0.2, h = deckTop(zc);
    k.add(B, boxUV(wd * 2, 0.34, 11.9), { ...CREAM, pw: 3.2, ph: 2.1, riv: 0.5 }, [0, h, zc], [-0.75, 0, 0]);
    // hazard stripes on the last sections and on the first
    if (i >= 10 || i === 0) {
      for (let s = -3; s <= 3; s++) k.add(B, hull([v3(-wd * 0.55, 0.2, 0), v3(wd * 0.55, 0.2, 0), v3(-wd * 0.55, 0.2, 1.5), v3(wd * 0.55, 0.2, 1.5), v3(-wd * 0.55, 0, 0), v3(wd * 0.55, 0, 0), v3(-wd * 0.55, 0, 1.5), v3(wd * 0.55, 0, 1.5)], 20), s % 2 ? HAZ : DARK, [0, h + 0.12, zc + s * 1.6 - 0.75], [-0.75, 0, 0]);
    }
    // deck rails with stanchions, a riveted angle iron at each edge
    for (const s of [-1, 1]) {
      k.member(B, [s * (wd - 0.1), h + 0.25, z], [s * (wd - 0.1), h + 0.08, z + 12], 0.34, 0.36, OXIDED);
      k.member(B, [s * (wd - 0.1), h + 2.1, z], [s * (wd - 0.1), h + 1.95, z + 12], 0.12, 0.12, IRON);
      for (let q = 0; q < 3; q++) { const zq = z + q * 4; k.member(B, [s * (wd - 0.1), h + 0.3, zq], [s * (wd - 0.1), h + 2.05, zq], 0.12, 0.12, IRON); }
      // real rivets close to the camera of the hook shot
      if (z < 90) for (let q = 0; q < 16; q++) k.add(B, ball(0.08, 6, 4), IRON, [s * (wd - 0.42), h + 0.22, z + 0.3 + q * 0.75], undefined, { scale: [1, 0.55, 1] });
    }
    // transverse glowing seam across the deck, the hook's fuse
    k.add(B, boxUV(wd * 1.2, 0.08, 0.22), SEAM, [0, h + 0.19, z + 0.3]);
  }
  // ignition seams along the top longerons
  for (let z = CANNON_Z0; z < CANNON_Z1; z += BAY) {
    const a = pts(z), b = pts(z + BAY);
    for (const c of [0, 1]) {
      const sx = Math.sign(a[c][0]);
      k.member(B, [a[c][0] + sx * 0.66, a[c][1] + 0.1, z + 0.3], [b[c][0] + sx * 0.66, b[c][1] + 0.1, Math.min(z + BAY, CANNON_Z1)], 0.14, 0.3, SEAM);
    }
  }
  // service rails, pipes and cable trays along the sides of the girder
  for (const s of [-1, 1]) {
    for (let run = 0; run < 3; run++) {
      const yy = [3.8, 2.4, -2.8][run], r = [0.34, 0.24, 0.42][run];
      const P = [];
      for (let z = CANNON_Z0 + 1; z < CANNON_Z1 - 2; z += 8) P.push(v3(s * (halfW(z) + 0.9 + run * 0.1), yy * halfW(z) / 5.8, z));
      k.add(B, sweep(P, r, 90, 6), run === 2 ? OXIDED : BRASS);
      for (let z = CANNON_Z0 + 3; z < CANNON_Z1 - 2; z += 12) k.add(B, boxUV(1.3, 0.9, 0.5), IRON, [s * (halfW(z) + 0.6), (yy * halfW(z)) / 5.8, z]);
    }
  }

  // ----------------------------------------------------------- THROUGH TRUSS: two deep riveted side girders, portal struts overhead
  const PANEL = 12, TZ0 = 14, TZ1 = 170;
  const TN = Math.round((TZ1 - TZ0) / PANEL);
  const nodeZ = (i) => TZ0 + ((TZ1 - TZ0) * i) / TN;
  const CHORD = { ...CREAM, pw: 5.5, ph: 1.6, riv: 0.75 };
  const CHORDL = { ...OXIDE, pw: 5.5, ph: 1.6, riv: 0.75 };
  const WEB = { ...OXIDED, pw: 4, ph: 1.0, riv: 0.55 };
  const GUS = { ...CREAMD, pw: 2.2, ph: 2.2, riv: 0.8 };
  const HATCH = { ...IRON, pw: 1.4, ph: 2.2, riv: 0.3 };
  const GRID = { ...DARK, pw: 1.6, ph: 0.8, riv: 0 };
  for (const s of [-1, 1]) {
    for (let i = 0; i < TN; i++) {
      const z0 = nodeZ(i), z1 = nodeZ(i + 1), zm = (z0 + z1) / 2;
      const a = [s * TW(z0), TT(z0), z0], b = [s * TW(z1), TT(z1), z1], c = [s * TW(z0), TB(z0), z0], d = [s * TW(z1), TB(z1), z1];
      // box chords, the massive part of the silhouette
      k.member(B, a, b, 3.0, 3.2, CHORD);
      k.member(B, [a[0], a[1] + 1.82, z0], [b[0], b[1] + 1.82, z1], 3.7, 0.42, WEB);
      k.member(B, c, d, 3.4, 3.4, CHORDL);
      // vertical at each node, Warren diagonals between them
      k.member(B, a, c, 1.5, 2.0, CHORD, { ibeam: true });
      if (i % 2 === 0) { k.member(B, a, [s * TW(zm), TB(zm), zm], 1.3, 1.5, WEB, { ibeam: true }); k.member(B, [s * TW(zm), TB(zm), zm], b, 1.3, 1.5, WEB, { ibeam: true }); }
      else { k.member(B, c, [s * TW(zm), TT(zm), zm], 1.3, 1.5, WEB, { ibeam: true }); k.member(B, [s * TW(zm), TT(zm), zm], d, 1.3, 1.5, WEB, { ibeam: true }); }
      // gusset plates at the nodes, on the outer face
      k.add(B, boxUV(0.2, 3.4, 4.2), GUS, [s * (TW(z0) + 1.56), TT(z0) - 1.3, z0]);
      k.add(B, boxUV(0.2, 3.4, 4.2), GUS, [s * (TW(z0) + 1.76), TB(z0) + 1.3, z0]);
      // power seams on the outer face: lines along both chords, a strip up each vertical, a ring on every gusset. They ignite node by node, breech to muzzle.
      k.member(B, [s * (TW(z0) + 1.62), TT(z0) + 0.85, z0], [s * (TW(z1) + 1.62), TT(z1) + 0.85, z1], 0.22, 0.5, SEAM);
      k.member(B, [s * (TW(z0) + 1.82), TB(z0) + 0.9, z0], [s * (TW(z1) + 1.82), TB(z1) + 0.9, z1], 0.22, 0.5, SEAM);
      k.member(B, [s * (TW(z0) + 1.12), TT(z0) - 3.2, z0], [s * (TW(z0) + 1.12), TB(z0) + 3.2, z0], 0.2, 0.45, SEAM);
      for (const [yy, dx] of [[TT(z0) - 1.3, 1.72], [TB(z0) + 1.3, 1.92]]) k.add(B, new THREE.TorusGeometry(1.25, 0.24, 8, 28).rotateY(Math.PI / 2), SEAM, [s * (TW(z0) + dx), yy, z0]);
      // hatches with a tiny wheel in the side of the top chord: 2 m tall against a 180 m gun
      const zh = z0 + 4 + (i % 3);
      k.add(B, boxUV(0.14, 1.9, 1.15), HATCH, [s * (TW(zh) + 1.56), TT(zh) - 0.1, zh]);
      k.add(B, new THREE.TorusGeometry(0.24, 0.05, 5, 12).rotateY(Math.PI / 2), BRASS, [s * (TW(zh) + 1.66), TT(zh) - 0.1, zh]);
      // a row of small lamps under the top chord, another along the catwalk
      for (let q = 0; q < 4; q++) {
        const zl = z0 + 1.5 + q * 3;
        k.add(B, ball(0.2, 6, 4), LAMP, [s * (TW(zl) + 1.62), TT(zl) - 1.5, zl]);
        k.add(B, ball(0.16, 6, 4), LAMP, [s * (TW(zl) + 3.15), -0.65, zl]);
      }
      // ladder bolted to the vertical, from the catwalk up to the top chord
      const lx = s * (TW(z0) + 1.2), lz = z0 + 1.9;
      for (const dz of [-0.36, 0.36]) k.member(B, [lx, -2.0, lz + dz], [lx, TT(z0) - 1.6, lz + dz], 0.09, 0.09, IRON);
      for (let y = -1.7; y < TT(z0) - 1.8; y += 0.5) k.member(B, [lx, y, lz - 0.36], [lx, y, lz + 0.36], 0.06, 0.06, IRON);
    }
    // catwalk outside the truss: grating, handrail and stanchions at human scale
    for (let z = TZ0; z < TZ1 - 2; z += 4) {
      const x = s * (TW(z + 2) + 2.6);
      k.add(B, boxUV(1.5, 0.1, 3.98), GRID, [x, -2.0, z + 2]);
      k.member(B, [s * TW(z), -3.2, z], [x, -2.1, z], 0.22, 0.22, IRON);
      for (const e of [-0.72, 0.72]) {
        k.member(B, [x + e, -1.1, z], [x + e, -1.1, z + 4], 0.08, 0.08, IRON);
        k.member(B, [x + e, -1.95, z], [x + e, -0.95, z], 0.08, 0.08, IRON);
      }
    }
  }
  // portal struts and knee braces overhead, top laterals, belly laterals: you walk through it
  for (let i = 0; i <= TN; i++) {
    const z = nodeZ(i), w = TW(z), t = TT(z), b = TB(z);
    if (i % 2 === 0 && i <= 2) {
      k.member(B, [-w, t + 0.2, z], [w, t + 0.2, z], 2.0, 2.4, CHORD, { ibeam: true });
      for (const s of [-1, 1]) k.member(B, [s * w, t - 4.6, z], [s * (w - 5.0), t + 0.2, z], 1.0, 1.0, WEB, { ibeam: true });
    }
    k.member(B, [-w, b, z], [w, b, z], 2.0, 2.2, CHORDL, { ibeam: true });
    if (i < TN) {
      const z2 = nodeZ(i + 1), w2 = TW(z2);
      if (i % 2 === 0 && i < 2) { k.member(B, [-w, t + 0.2, z], [w2, TT(z2) + 0.2, z2], 0.5, 0.5, WEB); k.member(B, [w, t + 0.2, z], [-w2, TT(z2) + 0.2, z2], 0.5, 0.5, WEB); }
      k.member(B, [-w, b, z], [w2, TB(z2), z2], 0.8, 0.8, WEB); k.member(B, [w, b, z], [-w2, TB(z2), z2], 0.8, 0.8, WEB);
      // floor beams tying the gun carrier into the side trusses
      if (i % 2 === 0) for (const s of [-1, 1]) k.member(B, [s * w, b + 3, z], [s * halfW(z), -halfW(z) * 0.94, z], 1.0, 1.0, WEB, { ibeam: true });
    }
  }
  // thick cable bundles running the length of the gun, slung under the catwalks and clamped at each node
  const CAB = [
    { col: '#26282f', metal: 0.2, detail: 0.5, tone: 0.1, wear: 0.5, pw: 8, ph: 1, riv: 0 },
    { col: '#3b2a26', metal: 0.2, detail: 0.5, tone: 0.1, wear: 0.5, pw: 8, ph: 1, riv: 0 },
  ];
  for (const s of [-1, 1]) for (let st = 0; st < 5; st++) {
    const P = [], r = 0.6 + (st % 3) * 0.16;
    for (let i = 0; i <= TN * 2; i++) {
      const z = TZ0 + 1 + ((TZ1 - TZ0 - 2) * i) / (TN * 2), sag = i % 2 ? 0.55 : 0;
      P.push(v3(s * (TW(z) + 2.25 + (st % 2) * 1.0), -4.1 - st * 1.0 - sag, z));
    }
    k.add(B, sweep(P, r, 150, 7), CAB[st % 2]);
  }
  for (const s of [-1, 1]) for (let i = 0; i <= TN; i++) {
    const z = nodeZ(i);
    k.add(B, cbox(3.0, 6.2, 0.9, 0.15), IRON, [s * (TW(z) + 2.75), -6.3, z]);
  }

  // ----------------------------------------------------------- muzzle
  for (let i = 0; i < 5; i++) {
    const z = CANNON_Z1 + i * 2.2, r = 5.4 + i * 0.28;
    k.add(B, cbox(r * 2, r * 2, 1.2, 0.5), { ...CREAMD, pw: 2.2, ph: 1, riv: 0.5 }, [0, 0, z]);
    for (const s of [-1, 1]) { k.add(B, boxUV(0.9, r * 2, 2.2), OXIDED, [s * (r - 0.1), 0, z + 1.1]); k.add(B, boxUV(r * 2, 0.9, 2.2), OXIDED, [0, s * (r - 0.1), z + 1.1]); }
  }
  k.add(B, cylZ(3.1, 11, 20), { ...OXIDE, pw: 3, ph: 1.4, riv: 0.5 }, [0, 0, CANNON_Z1 + 7]);
  k.add(B, cbox(15, 15, 2.6, 0.7), { ...CREAM, pw: 3.5, ph: 3, riv: 0.8 }, [0, 0, BARREL - 1.1]);
  k.add(B, ringZ(4.2, 0.5, 40, 8), BRASS, [0, 0, BARREL + 0.3]);
  k.add(B, cylZ(3.8, 1.0, 40), DARK, [0, 0, BARREL + 0.1]);
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (let i = 0; i < 3; i++) {
    k.add(B, ball(0.34, 8, 5), BRASS, [sx * (6.6 - i * 0.05), sy * (6.6 - i * 2.2), BARREL + 0.25], undefined, { scale: [1, 1, 0.6] });
    k.add(B, ball(0.34, 8, 5), BRASS, [sx * (6.6 - i * 2.2), sy * 6.6, BARREL + 0.25], undefined, { scale: [1, 1, 0.6] });
  }

  // ----------------------------------------------------------- breech block
  k.add(B, cbox(18, 16, 28, 1.1, { wt: 15.5, dt: 25, zt: 1 }), { ...CREAMD, pw: 4.5, ph: 3, riv: 0.75 }, [0, -0.7, 0]);
  // armoured cheeks, oxide
  for (const s of [-1, 1]) {
    k.add(B, cbox(0.9, 11.5, 22, 0.35), { ...OXIDE, pw: 3.8, ph: 2.4, riv: 0.6 }, [s * 9.3, -1.1, -1.5]);
    k.add(B, cylZ(1.55, 19, 18), { ...IRON, pw: 3, ph: 1.2 }, [s * 8.0, -6.8, -2]);       // recoil cylinders
    k.add(B, cylZ(1.05, 25, 16), { ...BRASS, pw: 3, ph: 1.2 }, [s * 8.0, -6.8, 13]);
    k.add(B, cbox(2.8, 2.8, 2.4, 0.3), IRON, [s * 8.0, -6.8, 28]);
    for (let z = -11; z <= 8; z += 3.8) k.add(B, ball(0.22, 8, 5), BRASS, [s * 9.82, 3.6, z], undefined, { scale: [0.6, 1, 1] });
  }
  // rear of the block: a flat bolted end frame and two box columns, nothing round
  k.add(B, cbox(16, 18, 2.2, 0.5), { ...OXIDED, pw: 4, ph: 3, riv: 0.8 }, [0, -0.7, -14.9]);
  k.add(B, cbox(12, 12, 1.5, 0.4), { ...CREAMD, pw: 3, ph: 2, riv: 0.7 }, [0, -0.7, -16.4]);
  for (const sx of [-1, 1]) k.add(B, cbox(2.2, 20, 2.2, 0.3), { ...IRON, metal: 0.2, pw: 3, ph: 3, riv: 0.6 }, [sx * 6.4, -0.5, -16.9]);
  for (let i = -2; i <= 2; i++) k.add(B, boxUV(0.5, 12, 0.3), DARK, [i * 2.4, -0.7, -17.3]);
  k.add(B, boxUV(2.2, 2.2, 0.8), BRASS, [0, -0.7, -17.5]);
  // the firing striker the hammer falls on
  k.add(B, cylZ(0.95, 3.2, 18), BRASS, [0, 8.0, -0.8]);
  // top-of-breech boxes, vents and handrails
  k.add(B, cbox(6, 1.9, 8.5, 0.24), OXIDED, [0, 7.8, 7.8]);
  for (let i = 0; i < 6; i++) k.add(B, boxUV(5.2, 0.35, 0.4), DARK, [0, 8.9, 4.2 + i * 1.5]);
  for (const s of [-1, 1]) k.add(B, cbox(1.9, 5, 2, 0.15), IRON, [s * 3.2, 9.0, -11.6]);
  // lamps
  for (let z = -10; z < 12; z += 4) k.add(B, ball(0.24, 8, 6), LAMP, [-9.85, 4.5, z]);

  // ----------------------------------------------------------- the sight pod on the Heron's side
  k.add(B, cbox(4.2, 1.2, 6, 0.2), IRON, [-9.2, 7.1, 3]);
  k.add(B, cbox(2.0, 2.3, 3.5, 0.2), IRON, [-11.4, 8.4, 3]);
  k.add(B, cylZ(1.25, 20, 18), { ...OXIDED, pw: 3.2, ph: 1.4 }, [-11.4, 10.2, 2.5]);
  for (const z of [-7.0, -2, 3, 8, 12.8]) k.add(B, cylZ(1.5, 0.7, 18), BRASS, [-11.4, 10.2, z]);
  k.add(B, cylZ(1.25, 0.5, 18), { col: '#ff8a4a', metal: 0, detail: 0, emis: 3, wear: 0 }, [-11.4, 10.2, 13.0]);
  k.add(B, coneZ(2.3, 1.6, 2.4, 20), DARK, [-11.4, 10.2, -9.2]);
  k.add(B, cylZ(0.5, 3.4, 10), BRASS, [-11.4, 8.2, -6]);

  // ----------------------------------------------------------- grips the Heron holds (on the moon-side cheek)
  // rear grip, a ribbed vertical bar in front of the cheek
  for (const [zg, yg] of [[-6, -1.5], [9, 0.5]]) {
    k.member('grips', [-12.3, yg + 3, zg], [-12.3, yg - 3, zg], 1.2, 1.4, IRON);
    k.add('grips', boxUV(1.3, 0.6, 1.5), RUBBER, [-12.3, yg + 2.0, zg]);
    k.add('grips', boxUV(1.3, 0.6, 1.5), RUBBER, [-12.3, yg - 2.0, zg]);
    for (const dy of [-3.1, 3.1]) k.member('grips', [-12.4, yg + dy, zg], [-9.3, yg + dy, zg], 0.6, 0.6, IRON);
  }

  // ----------------------------------------------------------- recoil jacket: one unbroken cream tube the whole length, on saddles, so the gun reads as a gun
  const keyY = (z) => TT(z) + 3.3;
  {
    const zs = [8, 40, 72, 104, 136, 168, 182];
    k.add('key', sweep(zs.map((z) => v3(0, keyY(z), z)), 1.75, 60, 20), { ...CREAM, pw: 9, ph: 3.2, riv: 0.9 });
    for (let z = 14; z <= 176; z += 18) k.add('key', cylZ(2.2, 0.9, 28), BRASS, [0, keyY(z), z], [-2.2, 0, 0]);
    for (let z = 20; z < 170; z += 36) {
      k.member('key', [-TW(z), TT(z) + 2.0, z], [TW(z), TT(z) + 2.0, z], 0.6, 0.8, OXIDED);
      k.add('key', cbox(3.2, 1.4, 1.4, 0.3), IRON, [0, keyY(z) - 1.9, z]);
    }
  }

  // ----------------------------------------------------------- radiator shelves: fin packs off the truss, fans flat on top
  for (const s of [-1, 1]) {
    for (const [z0, z1] of [[24, 45], [48, 70]]) {
      const zc = (z0 + z1) / 2, x = s * (TW(zc) + 5.6);
      for (let z = z0; z <= z1; z += 0.9) k.add(B, boxUV(8.6, 11.6, 0.16), (z - z0) % 4.5 < 0.9 ? OXIDED : { ...CREAMD, pw: 4, ph: 3, riv: 0, emis: 6 }, [x, -1.0, z]);
      for (const yy of [5.0, -7.0]) k.add(B, cbox(9.4, 0.9, z1 - z0 + 1.2, 0.2), { ...OXIDE, pw: 5, ph: 1.4, riv: 0.6 }, [x, yy, zc]);
      for (const zb of [z0 + 1, zc, z1 - 1]) k.member(B, [s * (TW(zb) + 1), -9.4, zb], [x + s * 4.2, -7.2, zb], 0.7, 0.9, WEB_B, { ibeam: true });
      // fan housing: a square curb and a louvre grid over the blades
      k.add(B, cbox(8.4, 0.9, 8.4, 0.2), { ...CREAM, pw: 3.2, ph: 2.4, riv: 0.5 }, [x, 5.9, zc + (z0 < 30 ? -0.5 : 0)]);
      for (let g = -3; g <= 3; g++) k.add(B, boxUV(7.8, 0.14, 0.16), IRON, [x, 6.42, zc + (z0 < 30 ? -0.5 : 0) + g * 1.15]);
    }
  }
  // fans: hub and 9 swept blades, each its own joint
  fans.forEach((f, i) => {
    const s = i < 2 ? 1 : -1;
    k.add('fan' + i, cylX(1.5, 1.6, 20), IRON, [0, 0, 0]);
    k.add('fan' + i, ball(1.26, 14, 10), BRASS, [s * 0.9, 0, 0], undefined, { scale: [0.7, 1, 1] });
    for (let b = 0; b < 9; b++) {
      const a = (b / 9) * 360;
      const blade = hull([v3(0, 1.2, -0.52), v3(0, 1.2, 0.52), v3(0.16, 6.5, -1.55), v3(0.16, 6.5, 1.12), v3(-0.16, 6.3, -1.55), v3(-0.16, 6.3, 1.12)], 24);
      k.add('fan' + i, blade, { ...CREAMD, pw: 3, ph: 2, riv: 0 }, [0, 0, 0], [a, s * 12, 0]);
    }
  });

  // ----------------------------------------------------------- hammer (joint, pivot at the top rear of the breech)
  const H = 'hammer';
  k.add(H, cylX(1.6, 4.2, 20), IRON, [0, 0, 0]);
  for (const s of [-1, 1]) k.add(H, extrude([[-1.1, -1.1], [1.1, -1.1], [1.0, 10.5], [0.2, 11.8], [-1.0, 10.8]], 0.7, 0.14), { ...OXIDE, pw: 3, ph: 2, riv: 0.5 }, [s * 1.3, 0, 0], [0, 90, 0]);
  k.add(H, cbox(4.4, 3.3, 3.5, 0.34), { ...IRON, pw: 2, ph: 1.4, riv: 0.4 }, [0, 11.1, 0.3]);
  k.add(H, cbox(2.5, 1.6, 2.0, 0.2), BRASS, [0, 11.1, 2.4]);
  k.add(H, cylZ(0.42, 1.8, 10), BRASS, [0, 10.2, 3.5]);

  // ----------------------------------------------------------- the bed: recoil rails, trestles, sleepers (fixed)
  const Bd = 'bed';
  const gy = (x, z) => groundAt(x, z);
  const RAILY = -9.1;
  for (const s of [-1, 1]) {
    k.add(Bd, cbox(3.0, 2.4, 86, 0.25), { ...OXIDED, pw: 6, ph: 1.2, riv: 0.6 }, [s * 8.0, RAILY, -4]);
    k.add(Bd, boxUV(1.1, 0.5, 86.2), { ...BRASS, detail: 0.4 }, [s * 8.0, RAILY + 1.45, -4]);
    // carriage rollers under the block live on the slide (see below)
  }
  // the plinth: two continuous plate walls with buttresses, tied by deep transoms (no sleepers, no viaduct piers)
  const y0p = Math.min(gy(-8, -4), gy(8, -4)) - 1.5, wallH = RAILY - 1.2 - y0p;
  for (const s of [-1, 1]) {
    k.add(Bd, cbox(5.6, wallH, 90, 0.35), { ...IRON, metal: 0.05, pw: 9, ph: 3.2, riv: 0.5 }, [s * 8.0, y0p + wallH / 2, -4]);
    k.add(Bd, cbox(6.6, 1.4, 90.4, 0.3), { ...OXIDED, pw: 6, ph: 1.2, riv: 0.6 }, [s * 8.0, RAILY - 1.1, -4]);
    for (let z = -44; z <= 36; z += 10) {
      if (s < 0 && z < 16) continue;
      k.add(Bd, hull([v3(0, 0, -1.1), v3(0, 0, 1.1), v3(0, wallH, -0.9), v3(0, wallH, 0.9), v3(s * 3.4, 0, -1.3), v3(s * 3.4, 0, 1.3), v3(s * 0.6, wallH, -0.9), v3(s * 0.6, wallH, 0.9)], 24), { ...IRON, metal: 0.05, pw: 3, ph: 3, riv: 0.4 }, [s * 10.8, y0p, z]);
    }
    for (let z = -45; z <= 35; z += 2.5) k.add(Bd, boxUV(0.16, 0.5, 1.0), LAMP, [s * 10.82, RAILY - 2.4, z]);
  }
  for (let z = -40; z <= 32; z += 12) k.add(Bd, cbox(10.4, wallH * 0.7, 3.4, 0.3), { ...OXIDED, pw: 4, ph: 3, riv: 0.5 }, [0, y0p + wallH * 0.35, z]);
  // long ground rails under the barrel, on a kerb, carrying the cradle bents
  const RX = 14;
  for (const s of [-1, 1]) {
    const yr = Math.min(gy(s * RX, 100), gy(s * RX, 40)) - 0.2;
    k.add(Bd, cbox(5.0, 1.0, 150, 0.25), { ...IRON, pw: 12, ph: 1, riv: 0.3 }, [s * RX, yr + 0.5, 103]);
    k.add(Bd, cbox(1.8, 1.3, 150, 0.2), { ...OXIDED, pw: 6, ph: 0.8, riv: 0.5 }, [s * RX, yr + 1.6, 103]);
    k.add(Bd, boxUV(0.9, 0.3, 150.2), BRASS, [s * RX, yr + 2.3, 103]);
  }
  // cradle bents: thick box legs from the rails up to the bottom chords, a deep saddle girder across
  for (const zt of [80, 118, 152]) {
    const w = TW(zt), under = TB(zt) - 1.9;
    const yg = Math.min(gy(-RX, zt), gy(RX, zt)) + 2.4;
    for (const s of [-1, 1]) {
      const top = [s * w, under, zt], foot = [s * RX, yg, zt];
      k.member(Bd, [top[0], top[1], zt - 4.0], [foot[0], foot[1], zt - 6.0], 2.6, 2.8, OXIDE);
      k.member(Bd, [top[0], top[1], zt + 4.0], [foot[0], foot[1], zt + 6.0], 2.6, 2.8, OXIDE);
      const steps = Math.max(2, Math.floor((under - yg) / 4));
      for (let q = 0; q < steps; q++) {
        const u0 = (q + 0.5) / steps, u1 = (q + 1.5) / steps;
        const a = [lerp(top[0], foot[0], u0), lerp(top[1], foot[1], u0)], b = [lerp(top[0], foot[0], Math.min(1, u1)), lerp(top[1], foot[1], Math.min(1, u1))];
        const wz0 = lerp(4.0, 6.0, u0), wz1 = lerp(4.0, 6.0, Math.min(1, u1));
        k.member(Bd, [a[0], a[1], zt - wz0], [b[0], b[1], zt + wz1], 0.6, 0.6, OXIDED);
        k.member(Bd, [a[0], a[1], zt + wz0], [b[0], b[1], zt - wz1], 0.6, 0.6, OXIDED);
        k.member(Bd, [a[0], a[1], zt - wz0], [a[0], a[1], zt + wz0], 0.7, 0.7, OXIDED);
      }
      k.add(Bd, cbox(8.0, 2.0, 15.5, 0.4), { ...IRON, pw: 4, ph: 2, riv: 0.6 }, [foot[0], yg - 0.2, zt]);
      for (const dz of [-5, 0, 5]) k.add(Bd, cylX(1.0, 1.5, 12), BRASS, [foot[0], yg - 1.5, zt + dz]);
    }
    k.add(Bd, cbox(2 * w + 4, 2.2, 10.5, 0.4), { ...OXIDE, pw: 6, ph: 2, riv: 0.7 }, [0, under - 0.5, zt]);
    for (const s of [-1, 0, 1]) k.add(Bd, cylX(0.7, 2.2, 10), BRASS, [s * (w * 0.6), under + 0.7, zt]);
  }

  // ----------------------------------------------------------- slide carriage under the block, riding the rails
  for (const s of [-1, 1]) {
    k.add(B, cbox(4, 1.8, 26, 0.3), { ...IRON, pw: 6, ph: 1.5, riv: 0.6 }, [s * 8.0, -8.9 + 2.5, -2]);
    for (let z = -12; z <= 8; z += 5) k.add(B, cylX(0.9, 2.8, 14), BRASS, [s * 8.0, -8.9 + 1.9, z]);
  }

  // ----------------------------------------------------------- cable bundles down the mountain (fixed)
  buildCables(k, Bd, groundAt, R);

  // post that carries the POWER counter into the hook shot's foreground
  k.member('hud', [0, -13.1, 0.05], [0, -0.8, 0.05], 0.34, 0.34, OXIDED);
  k.add('hud', cbox(3.75, 1.7, 0.22, 0.05), IRON, [0, 0, 0.7]);

  const meshes = k.finish(j, material);

  // ----------------------------------------------------------- POWER counter on the hull (hook)
  const counter = makeCounter();
  const plate = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 1.72), panelMaterial(counter.tex, { id: 131 }));
  // faces the hook camera (see CAMS.s01c): z toward the lens, x to screen right
  plate.position.set(0, 0, 0);
  plate.scale.setScalar(0.82);
  {
    const nz = new THREE.Vector3(4.6, 5.0, -30).normalize(), nx = new THREE.Vector3(0, 1, 0).cross(nz).normalize(), ny = nz.clone().cross(nx);
    plate.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(nx, ny, nz));
  }
  plate.frustumCulled = false;
  j.hud.add(plate);
  counter.mesh = plate;

  return { root, j, meshes, fans, counter, tris: k.tris };
}

function buildCables(k, bin, groundAt, R) {
  // Heavy conductor bundles come off a bus box behind the rail bed and snake down the back of the ridge (-Z in the frame).
  const STRANDS = 10;
  const BUS = { x: 0, z: -56, y: groundAt(0, -56) + 3 };
  k.add(bin, cbox(26, 7, 7, 0.4, { wt: 23, dt: 5.5 }), { ...IRON, pw: 4, ph: 2.2, riv: 0.5 }, [0, BUS.y + 0.2, BUS.z]);
  for (let i = -3; i <= 3; i++) k.add(bin, ball(0.8, 10, 8), BRASS, [i * 3.4, BUS.y + 4.1, BUS.z]);
  const STY = [
    { col: '#26282f', metal: 0.2, detail: 0.5, tone: 0.1, wear: 0.5, pw: 8, ph: 1, riv: 0 },
    { col: '#3b2a26', metal: 0.2, detail: 0.5, tone: 0.1, wear: 0.5, pw: 8, ph: 1, riv: 0 },
    { col: '#1f2730', metal: 0.2, detail: 0.5, tone: 0.1, wear: 0.5, pw: 8, ph: 1, riv: 0 },
  ];
  for (let s = 0; s < STRANDS; s++) {
    const off = (s - (STRANDS - 1) / 2) * 3.0;
    const r = 0.95 + (s % 3) * 0.28;
    const P = [v3(off, BUS.y + 0.6, BUS.z - 3)];
    let x = off, z = BUS.z - 7;
    const steps = 26, sway = R.range(-16, 16);
    for (let i = 0; i < steps; i++) {
      const u = i / steps;
      x += Math.sin(u * 5.4 + s * 0.7) * 6.4 + (sway * 0.7) / steps + off * 0.018;
      z -= 22 + R.range(-2, 2);
      const g = groundAt(x, z);
      P.push(v3(x, g + r * 0.72 + (s % 4 === 0 ? 0.5 : 0), z));
    }
    k.add(bin, sweep(P, r, 340, 7), STY[s % 3]);
    // clamps every few tens of metres
    for (let i = 2; i < P.length - 1; i += 4) k.add(bin, cbox(r * 3, r * 2.8, 1.2, 0.2), IRON, [P[i].x, P[i].y, P[i].z]);
  }
  // short flex loops from the bus box to the breech, slack enough for the recoil
  for (let s = 0; s < 6; s++) {
    const off = (s - 2.5) * 2.1;
    const P = [v3(off, BUS.y + 3.1, BUS.z + 2), v3(off * 1.05, BUS.y + 8, BUS.z + 18), v3(off, -12, -31), v3(off * 0.7, -5.5, -20.5)];
    k.add(bin, sweep(P, 0.5 + (s % 2) * 0.16, 48, 7), STY[s % 3]);
  }
}

// mechanical counter face: amber digits on a black plate; redrawn only when the number changes
function makeCounter() {
  const c = document.createElement('canvas'); c.width = 900; c.height = 370;
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.NoColorSpace;
  tex.anisotropy = 8;
  let shown = null;
  const g = c.getContext('2d');
  const draw = (pct) => {
    if (shown === pct) return;
    shown = pct;
    g.fillStyle = '#100d12'; g.fillRect(0, 0, 900, 370);
    g.strokeStyle = '#b08a4a'; g.lineWidth = 14; g.strokeRect(10, 10, 880, 350);
    for (const [x, y] of [[34, 34], [866, 34], [34, 336], [866, 336]]) { g.fillStyle = '#c4a060'; g.beginPath(); g.arc(x, y, 9, 0, 7); g.fill(); }
    g.fillStyle = '#d6b071'; g.font = 'bold 70px "Courier New", monospace'; g.textBaseline = 'alphabetic'; g.textAlign = 'left';
    g.fillText('POWER', 64, 118);
    const s = String(pct).padStart(2, '0');
    g.shadowColor = '#ff9a30'; g.shadowBlur = 42;
    g.fillStyle = '#ffc24d'; g.font = 'bold 232px "Courier New", monospace'; g.textAlign = 'right';
    g.fillText(s, 700, 322);
    g.font = 'bold 150px "Courier New", monospace'; g.fillText('%', 860, 322);
    g.shadowBlur = 0;
    tex.needsUpdate = true;
  };
  return { tex, draw };
}

export const worldOf = fromFrame;
