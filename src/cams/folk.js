import { noise1, smooth, invLerp, lerp } from '../util.js';

// FOLK cameras and looks. lt = seconds into the shot, d = shot length, t = film time. Sets sit at fixed world offsets.
const A = [0, 1500, 0], B = [14, 1500, 0], H = [30, 1500, 0], D = [70, 1500, 0], W = [100, 1500, 0];
const of = (b, x, y, z) => [b[0] + x, b[1] + y, b[2] + z];
const L3 = (a, b, u) => [lerp(a[0], b[0], u), lerp(a[1], b[1], u), lerp(a[2], b[2], u)];
const add = (p, ...ds) => ds.reduce((o, d) => [o[0] + d[0], o[1] + d[1], o[2] + d[2]], p);
// handheld drift (small, slow) and shake (fast, decaying)
const drift = (t, a = 0.008, s = 0) => [noise1(t * 0.7, 11 + s) * a, noise1(t * 0.55, 23 + s) * a * 0.7, noise1(t * 0.6, 37 + s) * a * 0.5];
const shake = (t, a, s = 0) => [noise1(t * 22, 3 + s) * a, noise1(t * 25, 5 + s) * a, noise1(t * 20, 7 + s) * a * 0.5];
const NEAR = 0.04, FAR = 40;
const inside = (o) => ({ near: NEAR, far: FAR, ...o });

export const CAMS = {
  s02: (lt, d, t) => ({ pos: add(of(W, 0.06 - 0.03 * lt / d, -0.06, 2.3 - 0.28 * smooth(lt / d)), drift(t, 0.006)), look: of(W, 0.0, -0.01, 0), fov: 30, near: 0.1, far: 100 }),

  // the wall of breakers raked from the side, then cut low and close to the chief as he commits his weight
  s32: (lt, d, t) => ({ pos: add(of(W, 0.06 - 0.03 * lt / d, -0.06, 2.3 - 0.28 * smooth(lt / d)), drift(t, 0.006)), look: of(W, 0.0, -0.01, 0), fov: 30, near: 0.1, far: 100 }),

  s05: (lt, d, t) => {
    // the wall of breakers raked from the side; the chief from behind throwing it; then low and close on his face
    if (lt < 0.62) {
      const u = lt / 0.62;
      return inside({ pos: add(of(H, lerp(-0.1, 0.25, u), 1.05, lerp(0.55, 0.4, u)), drift(t, 0.012)), look: of(H, lerp(-2.6, -2.1, u), 1.32, -2.0), fov: 42 });
    }
    const hit = lt > 1.44 ? Math.exp(-(lt - 1.44) * 7) : 0;
    if (lt < 1.72) {
      const u = smooth(invLerp(0.62, 1.72, lt));
      return inside({ pos: add(of(H, lerp(3.0, 2.9, u), lerp(1.45, 1.25, u), lerp(1.3, 1.05, u)), drift(t, 0.012), shake(t, 0.03 * hit)), look: add(of(H, 1.2, lerp(1.18, 1.0, u), -1.4), shake(t, 0.02 * hit, 3)), fov: 48 });
    }
    const u = smooth(invLerp(1.72, 2.5, lt));
    return inside({ pos: add(of(H, lerp(2.86, 2.8, u), lerp(1.3, 1.34, u), lerp(-1.66, -1.62, u)), drift(t, 0.006), shake(t, 0.012 * hit)), look: of(H, 1.84, lerp(1.2, 1.22, u), -0.92), fov: 28 });
  },

  s07: (lt, d, t) => inside({ pos: add(of(A, lerp(0.4, 0.33, smooth(lt / d)), 1.21, lerp(0.57, 0.5, smooth(lt / d))), drift(t, 0.005)), look: of(A, -0.02, 1.22, 0.02), fov: 30 }),

  s11: (lt, d, t) => inside({ pos: add(of(B, 0.02, 1.64 - 0.012 * lt, 0.64 - 0.02 * lt), drift(t, 0.002)), look: of(B, 0, 1.17, -0.02), fov: 23 }),

  s13: (lt, d, t) => {
    if (lt < 1.18) return inside({ pos: add(of(A, -0.62, 0.745, 0.575), drift(t, 0.003)), look: of(A, -0.27, 0.855, 0.315), fov: 26 });
    return inside({ pos: of(A, 0.0, 1.145, -1.56), look: of(A, 0, 1.145, -2.1), fov: 60 });
  },

  s17: (lt, d, t) => {
    const hit = Math.exp(-Math.max(0, lt - 0.04) * 3.2);
    if (lt < 0.85) return inside({ pos: add(of(A, 0.36, 1.2, 0.55), drift(t, 0.006), shake(t, 0.03 * hit)), look: add(of(A, 0.0, 1.2, 0.03), shake(t, 0.03 * hit, 7)), fov: 36, roll: 3 * hit * Math.sin(t * 30) });
    if (lt < 1.65) return inside({ pos: add(of(A, -0.26, 1.235, 0.28), drift(t, 0.003)), look: of(A, -0.49, 1.26, 0.56), fov: 32 });
    return inside({ pos: add(of(A, -0.3 + 0.03 * (lt - 1.65), 1.2, 0.58 - 0.05 * (lt - 1.65)), drift(t, 0.004)), look: of(A, -0.03, 1.22, 0.02), fov: 28 });
  },

  s22: (lt, d, t) => {
    const k = smooth(invLerp(0.2, 0.5, lt));
    return inside({ pos: add(of(A, -0.2, 0.99, 0.56 - 0.03 * k), drift(t, 0.005), shake(t, 0.004 + 0.01 * k)), look: add(of(A, -0.06, 1.2, 0.05), shake(t, 0.006 * k, 5)), fov: 40, roll: -3 });
  },

  // three-quarter from the front, level: both eyes and the gritted mouth inside the head's shape, the white seams behind her
  s23: (lt, d, t) => { const jolt = lt > 1.1 ? Math.exp(-(lt - 1.1) * 7) : 0; return inside({ pos: add(of(B, 0.4, 1.3, 0.62), drift(t, 0.004), shake(t, 0.005 + 0.012 * jolt)), look: add(of(B, 0.02, 1.2, 0.0), shake(t, 0.008 * jolt, 5)), fov: 32 }); },

  s29: (lt, d, t) => {
    // the pulls: in his face, from over the hatch, fists left and right of it, on the regrab and the haul
    if (lt >= 2.08) {
      // the climax, whole: hull, hatch, lid and hero in one frame, high enough to read the round lid on the plates
      const e = smooth(invLerp(2.5, 3.1, lt)), hit = lt > 2.5 ? Math.exp(-(lt - 2.5) * 5) : 0, heave = smooth(invLerp(2.08, 2.5, lt));
      return inside({ pos: add(of(D, lerp(2.5, 2.78, e) - 0.08 * heave, lerp(1.16, 1.34, e), lerp(-0.72, -0.66, e)), drift(t, 0.01), shake(t, 0.004 + 0.008 * heave + 0.04 * hit)), look: add(of(D, 0, lerp(0.52, 0.66, e), lerp(0.52, 0.42, e)), shake(t, 0.02 * hit, 5)), fov: lerp(38, 42, e), far: 9000 });
    }
    if (lt >= 1.02) {
      const u = smooth(invLerp(1.02, 2.52, lt)), strain = smooth(invLerp(1.9, 2.1, lt));
      return inside({ pos: add(of(D, lerp(0.62, 0.48, u), lerp(1.12, 1.2, u), lerp(-0.62, -0.5, u)), drift(t, 0.006), shake(t, 0.003 + 0.008 * strain)), look: add(of(D, 0.03, lerp(1.04, 0.88, u), lerp(0.85, 0.95, u)), shake(t, 0.004 + 0.006 * strain, 5)), fov: lerp(30, 26, u), far: 9000 });
    }
    // low and to the side: he comes at us out of the moon, the pan brings him to the hatch, then the haul nearly in profile
    const u = smooth(invLerp(0.0, 1.15, lt)), p = smooth(invLerp(1.15, 2.2, lt)), e = smooth(invLerp(2.5, 3.0, lt)), hit = lt > 2.5 ? Math.exp(-(lt - 2.5) * 5) : 0;
    const near = smooth(invLerp(0.45, 1.02, lt));
    const pos = add(of(D, lerp(1.75, 1.95, u), lerp(0.4, 0.5, u) + 0.4 * (1 - near) + 0.14 * near, lerp(2.9, -0.15, u)), [0, 0, -0.1 * p], drift(t, 0.012), shake(t, 0.03 * hit));
    const zs = [5.16, 3.3, 1.7, 1.2], f = Math.min(2.999, lt / 0.4), i = Math.floor(f), k = smooth(f - i), zl = lerp(zs[i], zs[i + 1] ?? zs[3], k);
    const lookZ = lt < 1.2 ? zl : lerp(1.2, 0.85, p);
    return inside({ pos, look: add(of(D, 0, lerp(0.62, 0.5, u) - lerp(0.62, 0.04, smooth(invLerp(0, 1.02, lt))), lookZ), [0, 0.04 * e, 0.45 * e], shake(t, 0.015 * hit, 5)), fov: lerp(36, 40, p), far: 9000 });
  },

  s30: (lt, d, t) => {
    if (lt < 0.72) return inside({ pos: add(of(B, 0.08, 1.64, 0.62), drift(t, 0.002)), look: of(B, 0.01, 1.17, -0.02), fov: 23, far: 9000 });
    if (lt < 1.45) return inside({ pos: add(of(B, -0.14, 1.72, 0.05), drift(t, 0.002)), look: of(B, 0.06, 2.44, 0.5), fov: 26, far: 9000 });
    const u = smooth(invLerp(1.45, 3, lt));
    return inside({ pos: add(of(B, 0.08, 1.64 - 0.02 * u, 0.62 - 0.04 * u), drift(t, 0.002)), look: of(B, 0.01, 1.17, -0.02), fov: 23 - 2.5 * u, far: 9000 });
  },
};

const NO_FX = { k: 1, mistMul: 0, fogMul: 0, veil: 0, shafts: 0, paintRadius: 3, exposure: 1.08 };
const shadowAt = (c, r = 1.4, depth = 5) => ({ center: c, radius: r, depth });

export const LOOKS = {
  s02: () => ({ ...NO_FX, key: [0, 0.4, 1] }),
  s32: () => ({ ...NO_FX, key: [0, 0.4, 1] }),
  s05: () => ({ ...NO_FX, key: [0.62, 0.66, 0.42], shadow: shadowAt(of(H, 1.7, 0.9, -1.1), 2.2) }),
  s07: () => ({ ...NO_FX, key: [0.1, -0.42, 1], shadow: shadowAt(of(A, 0, 1.1, 0.05)) }),
  s11: () => ({ ...NO_FX, key: [0.2, 0.9, 0.45], shadow: shadowAt(of(B, 0, 1.1, 0)) }),
  s13: () => ({ ...NO_FX, key: [0.5, 0.3, 0.8], shadow: shadowAt(of(A, -0.31, 0.8, 0.33), 0.8) }),
  s17: () => ({ ...NO_FX, key: [0.1, 0.9, 0.4], shadow: shadowAt(of(A, 0, 1.1, 0.05)) }),
  s22: () => ({ ...NO_FX, key: [-0.62, 0.22, 0.75], shadow: shadowAt(of(A, 0, 1.1, 0.05)) }),
  s23: () => ({ ...NO_FX, key: [0.85, 0.4, 0.3], shadow: shadowAt(of(B, 0, 1.1, 0)) }),
  s29: () => ({ k: 0.92, mistMul: 0.2, fogMul: 0.1, veil: 0, shafts: 0, paintRadius: 3, exposure: 1.08, key: [0.37, 0.67, 0.64], cityGlow: 0, shadow: shadowAt(of(D, 0, 0.5, 1.4), 3.2, 8) }),
  s30: () => ({ k: 0.95, mistMul: 0, fogMul: 0, veil: 0, shafts: 0, paintRadius: 3, exposure: 1.08, key: [0.12, 0.5, 0.85], cityGlow: 0, shadow: shadowAt(of(B, 0, 1.4, 0)) }),
};
