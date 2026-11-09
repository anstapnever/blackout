// BLACKOUT character designs. Animals with real builds: nothing here resembles the reference's human pilots.
// Otter: flat broad skull, tiny low ears, whisker pad, long body, short legs, thick rudder tail, carried low.
// Snow leopard: small wide-set round ears, broad short face, deep chest, big paws, huge thick tail.
// Badger: long wedge head, heavy shoulders, short legs, wide stance, hardly any tail.

const OTTER_HEAD = {
  hw: 1.08, hh: 0.8, hd: 0.92, cy: 0.1, cheek: [0.5, -0.2, 0.2, 0.4], cheekW: 1.18,
  muzzle: { len: 0.3, r0: 0.38, r1: 0.31, y: -0.2, up: 0.02, sx: 1.42, sy: 0.7, z0: 0.54, k: 0.28 },
  tufts: [[[0.8, -0.18, -0.02], [1.14, -0.3, -0.12], 0.14, 0.09]],
  whiskers: 5, pat: 9, p: [0.62, -0.25, 0.4, 0], ymouth: 1, mouthW: 0.3, mouthDrop: 0.16, mouthDepth: 0.46, noseUp: 0.72,
};
const LEOPARD_HEAD = {
  hw: 1.14, hh: 0.84, hd: 0.92, cy: 0.04, cheek: [0.5, -0.28, 0.18, 0.42], cheekW: 1.14,
  muzzle: { len: 0.17, r0: 0.34, r1: 0.28, y: -0.28, up: 0.02, sx: 1.26, sy: 0.76, z0: 0.58, k: 0.3 },
  tufts: [[[0.74, -0.3, -0.02], [1.34, -0.66, -0.14], 0.22, 0.16], [[0.56, -0.5, 0.04], [1.02, -1.0, -0.1], 0.2, 0.16]],
  whiskers: 4, pat: 8, p: [0.5, -0.32, 0.34, 0], ymouth: 1, mouthW: 0.24, mouthDrop: 0.16, mouthDepth: 0.42, noseUp: 0.74,
};
const BADGER_HEAD = {
  hw: 1.0, hh: 0.86, hd: 0.98, cy: 0.06, cheek: [0.46, -0.3, 0.12, 0.42], cheekW: 1.1,
  muzzle: { len: 0.66, r0: 0.34, r1: 0.12, y: -0.22, up: 0.03, sx: 1.0, sy: 0.84, z0: 0.42, k: 0.3 },
  tufts: [[[0.62, -0.34, -0.02], [0.96, -0.62, -0.18], 0.16, 0.1]],
  whiskers: 3, pat: 4, p: [0.4, -0.3, 0.3, 0], mouthW: 0.2, mouthDrop: 0.17, mouthDepth: 0.5, noseUp: 0.6,
};
const RACCOON_HEAD = { hw: 1.05, hh: 0.9, cheek: [0.48, -0.25, 0.15, 0.4], muzzle: { len: 0.5, r0: 0.3, r1: 0.1, y: -0.22, up: 0.06, sx: 0.95, sy: 0.85, z0: 0.42 }, tufts: [[[0.75, -0.25, 0.0], [1.15, -0.42, -0.12], 0.14, 0.08]], pat: 3, p: [0.34, -0.33, 0.24, 0], mouthW: 0.14, mouthDrop: 0.16, mouthDepth: 0.5 };
const SHEEP_HEAD = { hw: 0.98, hh: 0.95, cheek: [0.4, -0.3, 0.18, 0.36], muzzle: { len: 0.42, r0: 0.3, r1: 0.19, y: -0.27, up: -0.02, sx: 0.98, sy: 0.9, z0: 0.45 }, woolCap: true, pat: 6, mouthW: 0.14, mouthDrop: 0.18, ymouth: 1 };
const HARE_HEAD = { hw: 0.95, hh: 1.0, cy: 0.08, cheek: [0.42, -0.32, 0.24, 0.42], cheekW: 1.1, tufts: [[[0.72, -0.3, -0.04], [1.08, -0.52, -0.16], 0.16, 0.09]], muzzle: { len: 0.3, r0: 0.32, r1: 0.22, y: -0.3, up: 0.04, sx: 1.2, sy: 0.84, z0: 0.54, k: 0.32 }, pat: 2, p: [0.42, -0.34, 0.3, 0], ymouth: 1, mouthW: 0.14, mouthDrop: 0.15, mouthDepth: 0.4 };

export const OTTER = {
  name: 'boy', kind: 'otter', seed: 1, eyeDetail: 0.55, digits: { claw: '#2a1c18', pads: '#3c2a26', web: 0.3 },
  fur: { base: '#a87044', light: '#f0d6ae', dark: '#5a3a22', inner: '#c49870', eyeSkin: '#a87044', eyeSkinLow: '#f0d6ae', neck: '#b88a5c' },
  face: { head: OTTER_HEAD, noseR: 0.1, noseCol: '#241612', mouthW: 0.3,
    iris: '#6a3a1c', irisDark: '#1c0e08', irisLight: '#e0a860', eye: 0.74, eyeX: 0.45, eyeY: 0.27, irisR: 0.6, pupil: 0.4, brow: '#3a2216', browW: 1.05, browT: 0.034, lashW: 0.16, line: '#20140e' },
  ears: { type: 'round', w: 0.3, x: 0.9, y: 0.36, z: -0.02, tip: '#4c3020', back: '#4c3020' },
  tail: { type: 'chain', links: 7, len: 0.9, r0: 0.112, r1: 0.012, taper: 0.8, flat: 0.78, col: '#a87044', tip: '#7a5030' },
  jacket: { body: '#b48a52', dark: '#8a6238', rib: '#6e4a2c', collar: '#3f7f86', hemY: 0.62, zip: '#d8b46a', patch: '#b23a28' },
  cloth: { pants: '#3e4a56', longSleeves: '#b48a52', cuff: '#6e4a2c', belt: '#4a3020' },
  goggles: { rim: '#c8963c', glass: '#3a6a7a', strap: '#4a3226', tail: 5 },
};

export const SNOWLEOPARD = {
  name: 'girl', kind: 'leopard', seed: 2, eyeDetail: 0.6, digits: { claw: '#3a3438', pads: '#6a5a60', web: 0 },
  fur: { base: '#d9d4ca', light: '#f6f3ec', dark: '#3e3a40', inner: '#c8b8b0', eyeSkin: '#d9d4ca', eyeSkinLow: '#f6f3ec' },
  face: { head: LEOPARD_HEAD, noseR: 0.085, noseCol: '#a8707a', mouthW: 0.22,
    iris: '#8fb0a0', irisDark: '#2f4a48', irisLight: '#e4f6e8', eye: 0.86, eyeX: 0.46, eyeY: 0.13, eyeW: 1.08, irisR: 0.66, pupil: 0.3, brow: '#7c7880', browW: 0.9, browT: 0.016, lashW: 0.1, line: '#2a2630' },
  ears: { type: 'round', w: 0.52, x: 0.76, y: 0.62, z: -0.1, tip: '#3e3a40', back: '#3e3a40' },
  tail: { type: 'chain', links: 8, len: 1.0, r0: 0.075, r1: 0.075, flat: 1, col: '#d9d4ca', tip: '#3e3a40', rings: true },
  jacket: { body: '#2e3e74', dark: '#1e2a54', rib: '#1e2a54', collar: '#c8d0dc', hemY: 0.66, zip: '#b0b8c8', patch: '#d8b050' },
  cloth: { pants: '#1f2c54', longSleeves: '#2e3e74', cuff: '#1e2a54', belt: '#a07c3a' },
};

export const CHIEF = {
  name: 'chief', kind: 'chief', seed: 3, eyeDetail: 0.3, digits: { claw: '#c8c0a8', pads: '#2a2228', web: 0 },
  fur: { base: '#8f8d94', light: '#ece8e2', dark: '#26242c', inner: '#c8c0c0', eyeSkin: '#26242c', eyeSkinLow: '#ece8e2', neck: '#8f8d94' },
  face: { head: BADGER_HEAD, noseR: 0.1, noseCol: '#1c181c', mouthW: 0.2,
    iris: '#8a5a2a', irisDark: '#3a2010', irisLight: '#e8c080', eye: 0.72, eyeX: 0.34, eyeY: 0.14, irisR: 0.66, pupil: 0.34, brow: '#ece8e2', browT: 0.05, lashW: 0.14, line: '#1c181c' },
  ears: { type: 'round', w: 0.36, x: 0.72, y: 0.62, tip: '#ece8e2', back: '#26242c' },
  tail: { type: 'chain', links: 3, len: 0.2, r0: 0.075, r1: 0.04, flat: 1, col: '#4a4850', tip: '#2e2c34' },
  jacket: { body: '#5a6a68', dark: '#404c4c', rib: '#404c4c', collar: '#7a8684', hemY: 0.6, zip: '#a08a58', patch: '#8a6a30' },
  cloth: { pants: '#3a3638', longSleeves: '#5a6a68', cuff: '#404c4c', belt: '#3a2a20', boots: '#2e2420', apron: '#6e5238' },
  goggles: { rim: '#a07830', glass: '#6a5a30', strap: '#2a2020', tail: 4 },
  apronSkirt: { col: '#6e5238', stain: '#2c2420', panels: 3 },
};

// hut crew (background, seen at medium distance)
export const CREW = [
  { name: 'crewA', kind: 'adult', seed: 11, detail: 0, fur: { base: '#8c8890', light: '#f2f0f2', dark: '#2e2a32', inner: '#d8d0d0', eyeSkin: '#8c8890' }, face: { head: RACCOON_HEAD, noseCol: '#1e1a20', iris: '#5a3a2a', irisDark: '#1e1008', irisLight: '#c09070', eye: 0.95 }, ears: { type: 'round', w: 0.45, x: 0.6, y: 0.75, tip: '#f2f0f2' }, tail: { type: 'bushy', len: 0.4, r: 0.05, rings: 5, tip: '#2e2a32' }, cloth: { top: '#5a6a68', pants: '#3a3638', topLen: 1.1, longSleeves: '#5a6a68', cuff: '#404c4c', shoes: '#2e2420' }, hat: { type: 'cap', color: '#2f4644' } },
  { name: 'crewB', kind: 'adult', seed: 12, detail: 0, fur: { base: '#cfc8bc', light: '#ded8cc', dark: '#3a3438', inner: '#e8c8c0', eyeSkin: '#f4efe6' }, face: { head: SHEEP_HEAD, noseCol: '#3a2e30', iris: '#8a6a3a', irisDark: '#3a2a10', irisLight: '#e0c080', eye: 0.9 }, ears: { type: 'droop', len: 0.45, w: 0.4, x: 0.85, y: 0.35, splay: -1.3 }, tail: null, cloth: { top: '#7a5a3a', pants: '#4a4238', topLen: 1.1, longSleeves: '#7a5a3a', cuff: '#5a4028', shoes: '#2e2420' }, hat: { type: 'kerchief', color: '#3e6a80' } },
  { name: 'crewC', kind: 'adult', seed: 13, detail: 0, fur: { base: '#b89878', light: '#f0e8d8', dark: '#5a4638', inner: '#e0a8a8', eyeSkin: '#b89878' }, face: { head: HARE_HEAD, noseCol: '#b06a70', iris: '#4a3a2a', irisDark: '#1a100a', irisLight: '#c0a080', eye: 0.9 }, ears: { type: 'long', len: 1.3, w: 0.42, splay: 0.14, rx: -0.12, x: 0.32, y: 0.92, bendR: 0.75 }, tail: null, cloth: { top: '#5a6a68', pants: '#3a3638', topLen: 1.1, longSleeves: '#5a6a68', cuff: '#404c4c', shoes: '#2e2420' } , hat: { type: 'cap', color: '#34464a' } },
];
