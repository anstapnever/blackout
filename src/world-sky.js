import { Rng } from './util.js';

// Towering summer cumulus, in sky degrees (az, el): rows of billows, cauliflower buds
// on the rims and a flat lavender base. The sky shader shades the union.
function cloudTower(rng, o) {
  const puffs = [];
  const R0 = o.r ?? 3.4;
  const rows = Math.max(1, Math.round(o.h / (R0 * 0.9)));
  const prof = o.prof ?? ((f) => 1 - 0.42 * f * f);
  for (let k = 0; k <= rows; k++) {
    const f = rows ? k / rows : 0;
    const y = o.base + R0 * 0.55 + f * (o.h - R0 * 1.35);
    const width = Math.max(R0 * 0.6, o.w * prof(f));
    const n = Math.max(1, Math.round(width / (R0 * 1.12)));
    for (let i = 0; i < n; i++) {
      const uu = n === 1 ? 0 : i / (n - 1) - 0.5;
      const x = o.az + (o.lean ?? 0) * f * o.h + uu * (width - R0) + rng.range(-0.3, 0.3) * R0;
      const r = R0 * rng.range(0.8, 1.15) * (1 - 0.2 * f);
      const z = (1 - f) * R0 * 1.6 + (0.5 - Math.abs(uu)) * R0 * 1.3 + rng.range(0, 0.5) * R0;
      puffs.push([x, y + rng.range(-0.3, 0.3) * R0, r, z]);
    }
  }
  const body = puffs.length;
  for (let i = 0; i < body * 1.6 && puffs.length < 96; i++) {
    const [x, y, r, z] = puffs[i % body];
    if (y < o.base + o.h * 0.25 || rng.next() < 0.35) continue;
    const a = rng.range(0.25, Math.PI - 0.25);
    puffs.push([x + Math.cos(a) * r * 0.85, y + Math.sin(a) * r * 0.8, r * rng.range(0.32, 0.5), z + r * 0.35]);
  }
  const topY = o.base + o.h - R0 * 0.7;
  const topW = Math.max(R0, o.w * prof(1));
  const nc = Math.max(2, Math.round(topW / (R0 * 0.7)));
  for (let i = 0; i < nc; i++) {
    const uu = i / (nc - 1) - 0.5;
    puffs.push([o.az + (o.lean ?? 0) * o.h + uu * topW * 0.85, topY - Math.abs(uu) * R0 * 1.1 + rng.range(-0.2, 0.3) * R0, R0 * rng.range(0.5, 0.72), rng.range(-0.3, 0.2) * R0]);
  }
  return { puffs: puffs.slice(0, 110), cut: o.cut ?? o.base + R0 * 0.3, haze: o.haze ?? 0 };
}

export function makeClouds() {
  const rng = new Rng(7310);
  const T = [];
  const add = (o) => T.push(cloudTower(rng, o));
  // BLACKOUT night: long low banks along the horizon; the sky above stays open for the moon, stars, aurora and the Orrery
  for (const [az, w, h, r] of [[-70, 34, 9, 2.0], [-30, 20, 5, 1.5], [6, 16, 3.4, 1.2], [42, 30, 7, 1.8], [86, 26, 8, 2.0], [128, 28, 10, 2.1], [172, 24, 7, 1.8], [214, 30, 9, 2.0], [262, 30, 8, 2.0], [306, 22, 6, 1.6]]) {
    add({ az, base: -1.5, w, h, r, lean: 0.02 });
  }
  return { towers: T };
}
