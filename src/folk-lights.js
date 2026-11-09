import * as THREE from 'three';
import { FL } from './folk-mat.js';
import { SET } from './folk-sets.js';
import { noise1, smooth, invLerp, lerp, clamp, onThrees } from './util.js';
import { CUES } from './shots.js';

// One light table per shot. Every value has a cause you can see in frame: the scope glass, the alarm lamps, the swinging
// bulb, the seams of the shell with the beam behind them, the moon, the glowing cracks round the hatch.
const off = (b, x, y, z) => [b[0] + x, b[1] + y, b[2] + z];
const A = SET.A, B = SET.B, H = SET.HUT, D = SET.DECK;
const C = (h, k = 1) => { const c = new THREE.Color(h); return [c.r * k, c.g * k, c.b * k]; };
const set = (u, v) => u.value.setRGB(v[0], v[1], v[2]);

function apply(o) {
  set(FL.uFKey, o.key); set(FL.uFShade, o.shade);
  set(FL.uFBounce, o.bounce ?? [0, 0, 0]); FL.uFBounceDir.value.set(...(o.bounceDir ?? [0, -1, 0])).normalize();
  set(FL.uFRim, o.rim ?? [0, 0, 0]); FL.uFRimDir.value.set(...(o.rimDir ?? [0, 1, -1])).normalize();
  FL.uFP0.value.set(...(o.p0 ?? [0, 0, 0])); set(FL.uFP0C, o.p0c ?? [0, 0, 0]);
  FL.uFP1.value.set(...(o.p1 ?? [0, 0, 0])); set(FL.uFP1C, o.p1c ?? [0, 0, 0]);
  FL.uFPR.value.set(o.r0 ?? 0.6, o.r1 ?? 0.6);
  set(FL.uFSet, o.set ?? [1, 1, 1]);
  FL.uFFace.value = o.face ? o.face.k : 0;
  if (o.face) { set(FL.uFFaceKey, o.face.key); set(FL.uFFaceShade, o.face.shade); FL.uFFaceV.value.set(...(o.face.v ?? [-0.6, 0.55, 0.55])); }
  if (o.seam) { FL.uFSeam.value.set(...o.seam); set(FL.uFSeamC, o.seamC ?? [3, 3, 3]); FL.uFSeamFP.value.set(...(o.seamFP ?? [6, 0])); } else FL.uFSeam.value.w = 0;
}

// alarm pulse: a hard on/off lamp with a soft tail, on threes
const pulse = (t, hz) => { const ph = (onThrees(t) * hz) % 1; return ph < 0.5 ? 1 : Math.max(0.12, 1 - (ph - 0.5) * 4); };

export function lightFor(st) {
  const t = st.t, lt = st.lt, sid = st.sid;
  if (sid === 's02' || sid === 's32') {
    const on = lampK(t);
    apply({ key: C('#8a9ad8', 0.4), shade: C('#1a2348', 0.8), bounce: C('#ff9c50', 1.1 * on), bounceDir: [0, 0, 1], rim: C('#b8caf8', 0.4), rimDir: [-0.5, 0.8, 0.4], p0: off(SET.WIN, 0, 0, 0.5), p0c: C('#ffa458', 2.0 * on), r0: 1.5 });
    return;
  }
  if (sid === 's05') {
    const u = t - 8, sw = st.bulbX ?? 0;
    // the breaker lamps go from amber to red row by row: the wall's colour follows them
    const red = smooth(invLerp(0.1, 1.5, u));
    apply({ face: { k: 0.85, key: C('#ffe0c8', 1.05), shade: C('#a8c0dc', 0.95), v: [0.7, 0.45, 0.5] },
      set: C('#d8c8b4', 0.85),
      key: C('#ffdcb0', 1.15), shade: C('#2e5678', 1.0), bounce: C('#ff4a2a', 0.5 * red + 0.05), bounceDir: [0, 0.1, -1], rim: C('#8cc8f4', 1.15), rimDir: [0.2, 0.6, 1],
      p0: st.bulbP ?? off(H, 2.75 + sw, 2.2, -0.7), p0c: C('#ffc890', 0.75), r0: 2.4, p1: off(H, -1.2, 1.5, -1.6), p1c: lerp3(C('#ffb060', 0.6), C('#ff3820', 1.1), red), r1: 3.2,
    });
    return;
  }
  if (sid === 's07') {
    const flick = 0.92 + 0.08 * noise1(t * 9, 3);
    apply({ face: { k: 0.85, key: C('#ffe8e0', 1.12), shade: C('#a4ccd8', 0.92), v: [-0.26, 0.62, 0.74] }, set: [0.28, 0.22, 0.3], key: C('#ff9a80', 0.85 * flick), shade: C('#4a90a8', 0.8), bounce: C('#3a9a94', 0.7), bounceDir: [-0.8, -0.2, 0.5], rim: C('#7fe4e8', 1.25), rimDir: [0.5, 0.45, -1],
      p0: off(A, 0, 1.15, 0.46), p0c: C('#ff4a2c', 0.55 * flick), r0: 0.7, p1: off(A, -0.1, 1.7, -1.1), p1c: C('#ffa860', 0.5), r1: 1.4 });
    return;
  }
  if (sid === 's11') {
    const open = smooth(invLerp(0.9, 1.5, lt));
    apply({ face: { k: 0.85, key: C('#f6f2ec', 1.08), shade: C('#a0b4d0', 0.95), v: [-0.55, 0.5, 0.6] }, set: [0.5, 0.55, 0.6], key: C('#a8d4d4', 0.72 + 0.1 * open), shade: C('#22305e', 0.95), bounce: C('#d07838', 0.55), bounceDir: [0, -0.7, 0.7], rim: C('#ffd4a0', 0.55), rimDir: [-0.6, 0.3, -0.5],
      p0: off(B, 0, 1.05, 1.4), p0c: C('#ffb060', 0.55), r0: 1.2, p1: off(B, 0, 2.3, 0.6), p1c: C('#bfe8e8', 0.95), r1: 1.7 });
    return;
  }
  if (sid === 's13') {
    const f = smooth(invLerp(28.5, 28.56, t)) * Math.exp(-Math.max(0, t - 28.56) * 3.5);
    apply({ face: { k: 0.85, key: C('#ffe8e0', 1.1 + f * 0.2), shade: C('#a4ccd8', 0.9), v: [-0.26, 0.62, 0.74] }, set: [0.4, 0.34, 0.42], key: C('#ff9a80', 1.05 + f), shade: C('#4a90a8', 0.8), bounce: C('#b08a40', 0.3), bounceDir: [0, -1, 0], rim: C('#9cc0ff', 2.3), rimDir: [0.52, 0.68, 0.22],   // cool edge along the upper right of finger and trigger in the close-up
      p0: off(A, 0, 1.14, 0.5), p0c: C('#ff4028', 1.2), r0: 0.9 });
    return;
  }
  if (sid === 's17') {
    const hit = Math.exp(-Math.max(0, lt - 0.05) * 6), pul = pulse(t, 1.7), red = smooth(invLerp(0.05, 0.5, lt));
    apply({ face: { k: 0.82, key: lerp3(C('#fff0e4', 1.08), C('#ffe8e0', 1.08 + 0.08 * pul), red), shade: lerp3(C('#a4acd0', 0.95), C('#a4ccd8', 0.88), red), v: [-0.26, 0.62, 0.74] },
      set: lt > 0.85 && lt < 1.65 ? [1, 1, 1] : [0.3, 0.22, 0.28], key: lerp3(C('#ffc8a0', 1.6), C('#ff5a40', 0.55 + 0.8 * pul), Math.max(red, 1 - hit)), shade: lerp3(C('#32244e', 1.0), C('#54205a', 1.0), red), bounce: C('#d03020', 0.45), bounceDir: [0, -1, 0.2], rim: C('#88d8e4', 1.1), rimDir: [0, 1, -0.5],
      p0: off(A, 0, 1.15, 0.46), p0c: C('#ff3a20', 0.5), r0: 0.8, p1: off(A, 0, 2.05, 0.1), p1c: C('#ff2a18', 1.3 * pul), r1: 1.5,
    });
    return;
  }
  if (sid === 's22') {
    // the beam outside comes in through the scope: white stabs over the deep red alarm
    const pul = pulse(t, 2.2), stab = Math.min(0.7, Math.max(0, noise1(onThrees(t) * 6.3, 13) - 0.12) * 2.6) * (lt > 0.42 ? 1 : 0.2);
    apply({ face: { k: 0.86, key: lerp3(C('#ffdccc', 1.08 + 0.06 * pul), C('#fff0ea', 1.05), stab), shade: C('#9cc0d8', 0.85), v: [0.6, 0.5, 0.55] },
      set: [0.2, 0.14, 0.2], key: lerp3(C('#ff5a40', 0.62 + 0.3 * pul), C('#ffe4dc', 0.95), stab), shade: C('#44709c', 0.8), bounce: C('#ff4a30', 0.5), bounceDir: [0, -1, 0.3], rim: C('#9fdcec', 1.0), rimDir: [0.5, 0.5, -0.8],
      p0: off(A, 0, 1.15, 0.46), p0c: lerp3(C('#ff3a20', 0.4), C('#ffd8d0', 0.4), stab), r0: 0.9, p1: off(A, 0, 2.05, 0.1), p1c: C('#ff2a18', 0.6 * pul), r1: 1.4,
    });
    return;
  }
  if (sid === 's23') {
    const fl = 1 + 0.12 * noise1(onThrees(t) * 8, 5);
    apply({ face: { k: 0.95, key: C('#dce6ff', 1.5 * fl), shade: C('#6a6cc4', 0.74), v: [-0.62, 0.52, 0.5] },   // the white from the split seams, hard across her face
      set: [0.45, 0.45, 0.6], key: C('#c6c8f4', 0.5), shade: C('#2c2a6a', 1.0), bounce: C('#ff8a60', 0.22), bounceDir: [0, -1, 0.2], rim: C('#ffffff', 0.85 * fl), rimDir: [0.8, 0.4, 0.4],
      p0: off(B, 0.9, 1.5, 0.3), p0c: C('#f4f0ff', 0.4 * fl), r0: 1.1, seam: [B[0], 0, B[2] + 0.6, 0.86], seamC: C('#ffffff', 3.2 * fl), seamFP: [6.0, 0.4 + 0.05 * Math.sin(t * 2)],
    });
    return;
  }
  if (sid === 's29') {
    const u = t - 68.5, open = smooth(invLerp(2.5, 2.62, u));
    const glow = 1 + 0.12 * noise1(onThrees(t) * 5, 7);
    apply({ face: { k: 0.82 * Math.min(1, u > 2.6 ? 1.2 - 0.5 * open : 1), key: C('#f0f4ff', 1.1), shade: C('#dcb0a0', 0.95), v: [-0.5, 0.75, 0.42] },
      key: C('#c4d4fa', 1.55), shade: C('#6a7cc8', 1.15), bounce: C('#ff7a30', (0.55 + 0.85 * open) * glow), bounceDir: [0, -1, 0], rim: C('#d6e4ff', 0.9), rimDir: [-0.4, 0.7, -0.5],
      p0: off(D, 0, 0.12 + 0.3 * open, 0.2), p0c: C('#ff7a2a', (0.25 + 1.15 * open) * glow), r0: 1.0 + 1.3 * open,
    });
    return;
  }
  if (sid === 's30') {
    apply({ face: { k: 0.86, key: C('#faf6ff', 1.12), shade: C('#bcc4e8', 1.0), v: [-0.55, 0.5, 0.6] },
      set: [0.5, 0.5, 0.65], key: C('#d4e0fc', 1.05), shade: C('#8c94d4', 1.15), bounce: C('#ff9a60', 0.12), bounceDir: [0, -0.8, 0.5], rim: C('#e8f0ff', 0.9), rimDir: [0.3, 0.8, 0.5],
      p0: off(B, 0, 1.0, 1.4), p0c: C('#ffb060', 0.22), r0: 1.3, p1: off(B, 0.05, 2.2, 0.6), p1c: C('#c8d8fc', 1.0), r1: 1.15,
    });
  }
}
const lerp3 = (a, b, u) => [lerp(a[0], b[0], u), lerp(a[1], b[1], u), lerp(a[2], b[2], u)];

// the paper lamp: steady, one stutter, then gone at CUES.lampOut
export function lampK(t) {
  // the last beat of the film: dark since the lamp went out, then two false starts and it holds
  const back = CUES.lampBack + 0.15;
  if (t >= back) { const u = t - back; if (u < 0.06) return 0.7; if (u < 0.15) return 0.04; if (u < 0.2) return 0.55; if (u < 0.27) return 0.04; return lerp(0.75, 1, smooth(invLerp(0.27, 0.37, u))); }
  const out = CUES.lampOut;
  if (t >= out + 0.05) return 0;
  const f = t > out - 0.34 ? (Math.floor(t * 24) % 3 === 0 ? 0.35 : 1) : 1;
  return f * (t > out ? 1 - (t - out) / 0.05 : 1);
}
