// Cameras for the shots the FX department owns: s09 barrage, s15 twist, s16 impacts. Registered from createFx.
import { noise1 } from './util.js';
import { HELIX } from './fx-helix.js';

// Filled by createFx once the land anchors exist.
export const STAGE = {
  battery: [-2480, 40, 900], orrery: [0, 540, 300], muzzle: [-3050, 690, 1990], breech: [-3200, 666, 2100],
  far: [3300, 1000, -1800], wall: [-2820, 650, 1860], aim: [0.874, -0.043, -0.484],
};
const add = (a, b, k = 1) => [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k];
const shake = (t, amp, seed = 0) => [noise1(t * 7, seed) * amp, noise1(t * 7, seed + 3) * amp, noise1(t * 7, seed + 7) * amp];

export const CAMS = {
  // A: under the battery, trails climbing past the lens. B: over the dark strait, long lens, the streaks arcing at the rings.
  s09: (lt) => {
    if (lt < 1.45) {
      const B = STAGE.battery, O = STAGE.orrery;
      const d = [O[0] - B[0], 0, O[2] - B[2]], l = Math.hypot(d[0], d[2]);
      const f = [d[0] / l, 0, d[2] / l], side = [-f[2], 0, f[0]];
      const pos = add(add(add(B, f, -150), side, 95), [0, 16 + lt * 3, 0]);
      const look = add(add(B, f, 150 + lt * 40), [0, 105 + lt * 90, 0]);
      return { pos: add(pos, shake(lt, 0.8)), look, fov: 46 };
    }
    const u = lt - 1.45;
    const O = STAGE.orrery;
    return { pos: add([-1950 + u * 60, 90, 2150], shake(lt, 0.5, 4)), look: [-700 + u * 90, 380 + u * 20, 1000], fov: 30 };
  },
  // Low over the water beside the axis, yawed along it: the helix fills the left of the frame and runs away to a vanishing point on the right.
  s15: (lt, d, t) => {
    const H = HELIX;
    const u = lt / d, D = 240, yaw = (24 * Math.PI) / 180;
    const hit = t >= H.cross ? Math.exp(-(t - H.cross) * 2.6) : 0;
    const pos = [H.cx - 620 + 46 * u, 34 + 5 * u, H.cz + D];
    return {
      pos: add(pos, shake(t, 0.8 + 6 * hit, 2)),
      look: add([pos[0] + Math.cos(yaw) * 1000, pos[1] + 62, pos[2] - Math.sin(yaw) * 1000], shake(t * 0.8, 2 * hit, 9)), fov: 33,
    };
  },
  // A: across the strait past the rings, the far mountain erupts. B: behind the gun, the wall of fire stands up over it.
  s16: (lt, d, t) => {
    if (lt < 1.5) {
      // on the line from the far mountain through the rings, so the eruption stands behind them
      const F = STAGE.far, O = STAGE.orrery, d = [O[0] - F[0], O[1] - F[1], O[2] - F[2]], l = Math.hypot(...d), dir = d.map((x) => x / l);
      const pos = add(O, dir, 2500); pos[1] = 95;
      return { pos: add(pos, shake(t, 1.2 * Math.exp(-lt * 1.5), 6)), look: add(F, [0, 320 + lt * 50, 0]), fov: 24 };
    }
    const u = (lt - 1.5) / 1.5;
    const M = STAGE.breech, A = STAGE.aim, W = STAGE.wall;
    const side = [-A[2], 0, A[0]];
    const pos = add(add(add(M, A, -150 - 25 * u), side, -135), [0, 32 + 8 * u, 0]);
    return { pos: add(pos, shake(t, 2.2 * (1 - u * 0.5), 12)), look: add(W, [0, 92 + 34 * u, 0]), fov: 50 };
  },
};

export const LOOKS = {
  s15: () => ({ inkWidth: 1.0, paintRadius: 4 }),
};
