import { ORRERY } from '../layout.js';
import { noise1, lerp, smooth, invLerp } from '../util.js';

// ORRERY dept cameras and looks: s03 s10 s12 s18 s19 s26 s27.
const [ox, oy, oz] = ORRERY.center;
const SHADOW = { center: [ox, oy, oz], radius: 340, depth: 620 };
const drift = (t, a, s = 0) => [noise1(t * 0.5, 3 + s) * a, noise1(t * 0.43, 7 + s) * a];

export const CAMS = {
  // total dark bay, the rings high above: low on the water, looking up
  s03: (lt, d, t) => {
    const u = lt / d, [dx, dy] = drift(t, 4);
    return { pos: [lerp(-560, -520, u) + dx, 26 + dy * 0.4, lerp(2240, 2170, u)], look: [ox, oy - 30, oz], fov: 23 };
  },
  // the answer: the rings high on the right, the sweep tearing through the batteries below them. The lens opens as it spreads.
  s10: (lt, d, t) => {
    const u = smooth(lt / d), [dx, dy] = drift(t, 3);
    return { pos: [lerp(-900, -880, u) + dx, 260 + dy, lerp(4200, 4120, u)], look: [lerp(-980, -1210, u), lerp(330, 300, u), 2000], fov: lerp(31, 37, u) };
  },
  s12: (lt, d, t) => {
    const u = smooth(lt / d), [dx, dy] = drift(t, 1.5);
    const dist = lerp(760, 640, u);
    const G = [-0.803, 0.041, 0.595];
    return { pos: [ox + G[0] * dist + dx, oy + G[1] * dist + dy + 18, oz + G[2] * dist], look: [ox, oy, oz], fov: 30 };
  },
  s18: (lt, d, t) => {
    const u = smooth(lt / d), [dx, dy] = drift(t, 2);
    const dist = lerp(1020, 860, u);
    const G = [-0.803, 0.041, 0.595];
    return { pos: [ox + G[0] * dist + dx + lerp(-100, 0, u), oy + G[1] * dist + dy - 120, oz + G[2] * dist + lerp(60, 0, u)], look: [ox, oy, oz], fov: 34 };
  },
  s19: (lt, d, t) => {
    const [dx, dy] = drift(t, 6);
    return { pos: [-3120 + dx, 712 + dy, 2010], look: [ox, oy + 22, oz], fov: 12 };
  },
  s26: (lt, d, t) => {
    const u = lt / d, [dx, dy] = drift(t, 2);
    return { pos: [-120 + dx + lerp(-30, 30, u), 215 + dy, 1330 + lerp(0, -60, u)], look: [ox - 30, oy - 10, oz], fov: 35 };
  },
  s27: (lt, d, t) => {
    const u = lt / d, [dx, dy] = drift(t, 2.5 + 7 * smooth(invLerp(0.5, 0.8, u)));
    const follow = u * u;
    return { pos: [-420 + dx, 22 + dy * 0.4, 2120 + lerp(0, -60, u)], look: [ox - 20 + 90 * follow, lerp(532, 150, follow), oz], fov: 19 };
  },
};

export const LOOKS = {
  s03: () => ({ k: 1, exposure: 1.0, fogMul: 0.6, shadow: SHADOW, cityGlow: 0 }),
  s10: () => ({ k: 1, exposure: 1.05, fogMul: 0.5, shadow: SHADOW }),
  s12: () => ({ k: 1, exposure: 1.05, fogMul: 0.15, shadow: SHADOW }),
  s18: () => ({ k: 0.72, exposure: 1.05, fogMul: 0.2, shadow: SHADOW }),
  s19: () => ({ k: 0.8, exposure: 1.1, fogMul: 0.4, shadow: SHADOW }),
  s26: () => ({ k: 0.75, exposure: 1.05, fogMul: 0.25, shadow: SHADOW }),
  s27: (lt, d) => ({ k: 0.92 + (lt / d) * 0.08, exposure: 1.14, fogMul: 0.35, shadow: { center: [ox, 260, oz], radius: 620, depth: 900 } }),
};
