import { noise1, lerp, smooth, invLerp, clamp } from '../util.js';
import { plan, fr, PAD_Y, TORTOISE_STANCE, AXIS, SLAM_T } from '../mech-map.js';
import { shove, TT, strain, FIRE1, FIRE2, quake, s01cZoom } from '../mech-anim.js';
import { CUES } from '../shots.js';

// MECH cameras + looks. Plan helper P(x, h, z): x across the gun's line, h metres above the pad, z along the barrel (0 = breech, 180 = muzzle).
const P = (x, h, z) => plan(x, z, PAD_Y + h).toArray();
const drift = (t, a, s = 0) => [noise1(t * 0.55, 11 + s) * a, noise1(t * 0.47, 23 + s) * a * 0.7, noise1(t * 0.6, 37 + s) * a * 0.5];
const shake = (t, a, s = 0) => [noise1(t * 22, 3 + s) * a, noise1(t * 26, 5 + s) * a, noise1(t * 19, 7 + s) * a * 0.5];
const add = (p, ...ds) => ds.reduce((o, d) => [o[0] + d[0], o[1] + d[1], o[2] + d[2]], p);
const L3 = (a, b, u) => [lerp(a[0], b[0], u), lerp(a[1], b[1], u), lerp(a[2], b[2], u)];
// light directions in the world from gun-frame terms (toward the light)
const key = (x, y, z) => { const v = AXIS.x.clone().multiplyScalar(x).addScaledVector(AXIS.y, y).addScaledVector(AXIS.z, z).normalize(); return [v.x, v.y, v.z]; };

export const CAMS = {
  // barrel axis, low on the deck: the ring sits exactly over the muzzle
  s01c: (lt, d, t) => {
    const u = lt / d;
    // telephoto down the open top of the girder: muzzle just under frame centre, the ring large and exactly above it, POWER panel in the near foreground
    const z = s01cZoom(t), tilt = (z - 1) / 0.5;
    const fov = 2 * Math.atan(Math.tan((19 * Math.PI) / 360) / z) * (180 / Math.PI);
    return { pos: add(fr(0, 24 - lt * 0.1, 40 + lt * 3), shake(t, 0.015), drift(t, 0.02)), look: add(fr(0, 16.7 + 2.9 * tilt, 180), drift(t + 3, 0.04)), fov, near: 1, far: 8600 };
  },
  // the side of the gun, past the breech and the Heron; hammer rises in frame, fans behind
  s06: (lt, d, t) => {
    const u = smooth(lt / d);
    return { pos: add(L3(P(-90, 42, -74), P(-83, 39, -66), u), drift(t, 0.25)), look: add(L3(P(-8, 3, 50), P(-6, 3, 57), u), drift(t + 7, 0.12)), fov: 42 };
  },
  // long lens through the scope
  s08: (lt, d, t) => {
    const u = lt / d;
    return { pos: add(fr(-11.4, 21, 14), shake(t, 0.015)), look: add(fr(0, 2, 3700), drift(t, 1.1)), fov: lerp(9.6, 8.6, smooth(u)), far: 8600 };
  },
  // broad profile: the whole gun, the beam leaves to the right, the recoil rides through it
  s14: (lt, d, t) => {
    const a = t - FIRE1;
    const sh = a > 0 ? Math.exp(-a * 3) * 1.1 : 0;
    return { pos: add(P(-205 - lt * 3, 10, 96 + lt * 2), shake(t, sh), drift(t, 0.3)), look: add(P(0, 21, 150), shake(t + 2, sh * 0.5)), fov: 46 };
  },
  // low, to the side of the muzzle, looking at the landing point
  s20: (lt, d, t) => {
    const u = smooth(lt / d);
    const landShock = t > TT.land ? Math.exp(-(t - TT.land) * 5) * 1.4 : 0;
    const slam = t > SLAM_T ? Math.exp(-(t - SLAM_T) * 3.6) * 1.2 : 0;
    return { pos: add(L3(P(-46, 6.5, 196), P(-44, 7.5, 204), u), shake(t, landShock + slam), drift(t, 0.2)), look: add(L3(P(24, 26, 226), P(22, 24, 230), u), shake(t + 3, (landShock + slam) * 0.45)), fov: 54 };
  },
  // low three-quarter: the shield eats itself from the middle, feet plough rock toward us
  s21: (lt, d, t) => {
    const z = TORTOISE_STANCE.z - shove(t);
    const str = strain(t);
    // three-quarter on the melting face, low enough that the feet and the furrows behind them read; the crane only starts once they have (f1175)
    const e = lt < 2.46 ? 0.22 * smooth(lt / 2.46) : lerp(0.22, 1, smooth((lt - 2.46) / (d - 2.46)));
    const ang = lerp(28, 20, e) * Math.PI / 180, R = lerp(56, 45, e);
    return { pos: add(P(24 - R * Math.cos(ang), lerp(6, 16, e), z + R * Math.sin(ang)), shake(t, 0.35 * str), drift(t, 0.15)), look: add(P(lerp(14, 18, e), lerp(14, 24, e), z + lerp(14, 18, e)), shake(t + 2, 0.2 * str)), fov: lerp(54, 48, e) };
  },
  // from behind and below: a black shape held in the white beam, arms crossed
  s24: (lt, d, t) => {
    const z = TORTOISE_STANCE.z - shove(t);
    const u = lt / d;
    return { pos: add(P(lerp(70, 76, u), lerp(4, 6, u), z - lerp(50, 44, u)), shake(t, 0.28), drift(t, 0.1)), look: add(P(23, 21, z + 8), drift(t + 2, 0.1)), fov: 42 };
  },
  // the muzzle at point-blank range, white light leaves past the Tortoise
  s25: (lt, d, t) => {
    const a = t - FIRE2;
    const sh = a > 0 ? Math.exp(-a * 3.2) * 1.8 : 0;
    const u = smooth(lt / d);
    return { pos: add(L3(P(-72, 6, -4), P(-69, 6.6, -9), u), shake(t, sh + 0.05), drift(t, 0.08)), look: add(L3(P(-10, 30, 14), P(-10, 31, 18), u), shake(t + 3, sh * 0.5)), fov: 50 };
  },
  // silence: smoke, moon, the machines still; slow descent of the Heron's shoulders
  s28: (lt, d, t) => {
    const u = smooth(lt / d);
    return { pos: add(L3(P(-96, 13, -86), P(-90, 12, -78), u), drift(t, 0.08)), look: L3(P(-16, 18, -10), P(-17, 15, -10), u), fov: 36 };
  },
};

export const LOOKS = {
  s01c: (lt, d, t) => ({ k: 1, key: key(-0.45, 0.8, -0.15), exposure: 1.2, paintRadius: 3, mistMul: 2.5 }),
  s06: (lt, d, t) => ({ k: 1, key: key(-0.74, 0.6, -0.18), shadow: { center: P(-5, 22, 30), radius: 120, depth: 260 }, exposure: 1.18 }),
  s08: () => ({ k: 1, paintRadius: 2, exposure: 1.1 }),
  s14: (lt, d, t) => ({ k: 1, key: key(-0.5, 0.75, 0.4), exposure: 1.12 }),
  s20: (lt, d, t) => ({ k: lerp(1, 0.78, smooth(invLerp(SLAM_T, SLAM_T + 0.8, t))), key: key(-0.45, 0.8, -0.3), shadow: { center: P(24, 18, 225), radius: 80, depth: 220 }, exposure: 1.18 }),
  s21: (lt, d, t) => ({ k: 0.75, key: key(-0.55, 0.4, 0.65), exposure: 1.1 }),
  s24: (lt, d, t) => ({ k: 0.75, key: key(0.1, 0.3, 0.9), exposure: 1.2 }),
  s25: (lt, d, t) => ({ k: 0.9, key: key(-0.5, 0.65, 0.4), exposure: 1.18 }),
  s28: (lt, d, t) => ({ k: 0.92, key: key(-0.65, 0.55, 0.45), shadow: { center: P(-15, 18, 20), radius: 90, depth: 240 }, exposure: 1.2, mistMul: 1.4 }),
};
