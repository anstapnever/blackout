import * as THREE from 'three';
import { hash, hr, KIND, PAL, ID, GLOW } from './fx-core.js';
import { clamp, smooth, invLerp, easeOut } from './util.js';

// Fire and impacts, all as big drawn lobes (PuffBatch cauliflower billows in hard colour bands),
// never a cloud of small particles. Lobes burn out through a hard noise dissolve and shrink to nothing.

const V = THREE.Vector3;

// One big lobe of fire with its smaller lobes riding on the side away from the core: cauliflower, not a stack of balls.
// core: [x, y, z] the point the fire burns outward from; the shader lights the lobe from there.
function lobe(E, x, y, z, r, seed, tone, fade, pal, id, core = null, kids = 0) {
  if (fade >= 0.985 || r <= 0.05) return;
  const f = clamp(fade);
  const rr = r * (1 - f * f * f);
  let dx = 0, dy = 1, dz = 0;
  if (core) {
    const ox = x - core[0], oy = y - core[1], oz = z - core[2], l = Math.hypot(ox, oy, oz);
    if (l > 1e-3) { dx = ox / l; dy = oy / l; dz = oz / l; }
  }
  const lump = core ? 0.52 : 0.36;
  E.puffs.push(x, y, z, rr, 0, 1, lump, dx, dy, dz, seed % 97, tone, Math.max(0, f - 0.05) * 0.96, KIND.PUFF, pal, id);
  for (let k = 0; k < kids; k++) {
    const h1 = hash(seed | 0, k, 51), h2 = hash(seed | 0, k, 52), h3 = hash(seed | 0, k, 53);
    // a tangent frame around the outward direction
    const ax = Math.abs(dy) > 0.9 ? 1 : 0, ay = ax ? 0 : 1;
    let tx = dy * 0 - dz * ay, ty = dz * ax - dx * 0, tz = dx * ay - dy * ax;
    const tl = Math.hypot(tx, ty, tz) || 1; tx /= tl; ty /= tl; tz /= tl;
    const bx = dy * tz - dz * ty, by = dz * tx - dx * tz, bz = dx * ty - dy * tx;
    const th = h1 * Math.PI * 2, sp = 0.45 + 0.75 * h2, c = Math.cos(th) * sp, q = Math.sin(th) * sp;
    const K = rr * (0.74 + 0.16 * h3), rk = rr * (0.26 + 0.26 * h3);
    const px = x + (dx + tx * c + bx * q) * K, py = y + (dy + ty * c + by * q) * K, pz = z + (dz + tz * c + bz * q) * K;
    E.puffs.push(px, py, pz, rk, 0, 1, lump, dx, dy, dz, (seed + 13 * (k + 1)) % 97 + 0.41, tone + 0.14 + 0.14 * h2, Math.max(0, f - 0.05) * 0.96, KIND.PUFF, pal, ID.DUST[k % 3]);
  }
}

// Small things flung off the fire: dark soot flecks and hot embers, flat spinning shapes that rise, drift and shrink to nothing.
function flecks(E, p, spanX, spanZ, H, t0, life, seed, n) {
  const a0 = E.tq - t0;
  if (a0 < 0 || a0 > life + 1) return;
  const col = new THREE.Color();
  for (let i = 0; i < n; i++) {
    const b = hash(i, seed, 61) * life * 0.7, a = a0 - b, L = hr(i, seed, 62, 1.0, 2.2);
    if (a < 0 || a > L) continue;
    const u = a / L, ember = i % 3 === 0;
    const al = hash(i, seed, 63) - 0.5, sw = hash(i, seed, 64) * 6.28;
    const y = p.y + H * (0.25 + 0.45 * hash(i, seed, 65)) + H * (0.5 + 0.5 * hash(i, seed, 66)) * (1 - Math.exp(-a * 0.9));
    const x = p.x + spanX * al + Math.sin(sw + a * 1.7) * H * 0.07 + H * 0.12 * a;
    const z = p.z + spanZ * al + Math.cos(sw + a * 1.3) * H * 0.07;
    const sz = H * hr(i, seed, 67, 0.011, 0.03) * (1 - u * u * u);
    if (ember) col.setRGB(1.0, 0.42 + 0.3 * (1 - u), 0.12); else col.setRGB(0.05, 0.035, 0.07);
    const sp = a * hr(i, seed, 68, 2.2, 5.2);
    E.petals.push(x, y, z, sp + i, sp * 0.7, sp * 0.5 + i, sz * 0.7, sz * 0.5, sz, col);
  }
}

// A fire dome on the ground: white heart, yellow body, orange and crimson skirt, a cap of soot that lifts and burns away.
// R metres, life seconds. Returns the light power so the caller can register a point light.
export function fireDome(E, p, t0, R, seed, life = 2.6, o = {}) {
  const a = E.tq - t0;
  if (a < 0 || a >= life) return 0;
  const grow = 1 - Math.exp(-a / 0.13);
  const n = o.n ?? 38;
  E.puffs.inkZ = E.inkZ(p.x, p.y + R * 0.4, p.z) + (seed % 4) * R * 0.2;
  for (let i = 0; i < n; i++) {
    const h1 = hash(i, seed, 1), h2 = hash(i, seed, 2), h3 = hash(i, seed, 3), h4 = hash(i, seed, 4), h5 = hash(i, seed, 5);
    const az = h1 * Math.PI * 2, c = 0.04 + 0.96 * h2, s = Math.sqrt(1 - c * c);
    const rho = (0.5 + 0.5 * h3) * R * grow * (1 + 0.14 * a);
    const lift = Math.max(0, a - 0.42) * R * (0.16 + 0.4 * c);
    const x = p.x + Math.cos(az) * s * rho;
    const y = p.y + c * rho * 0.82 + lift;
    const z = p.z + Math.sin(az) * s * rho;
    const r = R * (0.2 + 0.2 * h4) * grow * (0.9 + 0.3 * clamp(a));
    const age = a / life;
    const soot = c * 0.5 + h5 * 0.5 < (age - 0.2) * 1.5;
    const tone = soot ? 0.06 + 0.3 * h4 : -0.55 + 1.5 * age + (1 - rho / (R * grow + 1)) * -0.3 + (0.5 - c) * 0.35;
    const fade = clamp(invLerp(0.7 - 0.3 * c, 1.0, age + h5 * 0.1));
    lobe(E, x, y, z, r, (seed * 3 + i) % 97, tone, fade, soot ? PAL.SOOT : PAL.FIRE, ID.STEAM[i % 3], [p.x, p.y - R * 0.1, p.z], R > 200 ? 3 : 2);
  }
  E.puffs.inkZ = 0;
  // the base skirt: a drawn ring of orange dust licking outward along the ground
  const collar = o.collar ?? 12;
  E.puffs.inkZ = E.inkZ(p.x, p.y, p.z) + R;
  for (let i = 0; i < collar; i++) {
    const az = (i / collar) * Math.PI * 2 + hash(i, seed, 8) * 0.4;
    const g = easeOut(clamp(a / 0.5), 2.4);
    const rr = R * (0.9 + 0.5 * g);
    const x = p.x + Math.cos(az) * rr, z = p.z + Math.sin(az) * rr;
    lobe(E, x, p.y + R * 0.08, z, R * 0.16 * (0.7 + 0.5 * g), (i * 7 + seed) % 97, -0.05 + 0.8 * a / life, clamp(invLerp(0.3, 0.75, a / life + hash(i, seed, 9) * 0.1)), PAL.FIRE, ID.DUST[i % 3], [p.x, p.y, p.z]);
  }
  E.puffs.inkZ = 0;
  const pw = (1 - smooth(invLerp(life * 0.45, life * 0.9, a))) * smooth(a / 0.06);
  E.glows.push(new V(p.x, p.y + R * 0.4, p.z), { kind: GLOW.soft, m: R * 2.2, color: [1.0, 0.56, 0.2], power: 0.4 * pw, mode: 0, bias: R * 0.6 });
  if (a < life * 0.72) E.light.point(new V(p.x, p.y + R * 0.8, p.z), [1.0, 0.55, 0.22], R * 3.4, 1.0 * pw);
  return pw;
}

// Fire column at the far mountain: the hero beam misses the rings and hits behind them.
export function eruption(E, p, t0, R, seed) {
  const a = E.tq - t0, life = 6.0;
  if (a < -0.02 || a >= life) return;
  // the first drawings are a white pillar of ice-blue light standing on the mountain
  if (a < 0.6) {
    const k = (1 - smooth(invLerp(0.25, 0.6, a))) * smooth((a + 0.02) / 0.06);
    const top = new V(p.x, p.y + R * 2.6, p.z);
    E.beams.push([new V(p.x, p.y, p.z), new V(p.x, p.y + R * 1.3, p.z), top], { m: R * 0.22 * (0.6 + k), color: [0.42, 0.75, 1.0], hot: [1, 1, 1], power: 1.4 * k, core: 0.62, soft: 40, seed: 0.77, mode: 0, bias: R });
    E.light.line(p, top, [0.55, 0.82, 1.0], R * 2.6);
  }
  fireDome(E, new V(p.x, p.y + R * 0.1, p.z), t0, R, seed, life, { n: 56, collar: 18 });
  // a column of big lobes climbing from the crater, staying fire near the base
  const n = 42;
  E.puffs.inkZ = E.inkZ(p.x, p.y + R, p.z) + R * 0.4;
  for (let i = 0; i < n; i++) {
    const b = hash(i, seed, 21) * 1.1;
    const aa = a - b;
    if (aa <= 0) continue;
    const h = 1 - Math.exp(-aa / 1.5);
    const az = hash(i, seed, 22) * 6.283, off = hash(i, seed, 23) * R * (0.24 + 0.16 * h);
    const y = p.y + R * 0.2 + R * 2.8 * h;
    const x = p.x + Math.cos(az) * off + 0.2 * R * aa * hash(i, seed, 24);
    const z = p.z + Math.sin(az) * off;
    const r = R * (0.3 + 0.24 * hash(i, seed, 25)) * (0.5 + h);
    const age = aa / (life - b);
    const soot = hash(i, seed, 26) * 0.4 + h * 0.8 > 0.62 - 0.3 * age;
    const fade = clamp(invLerp(0.72, 1, age + hash(i, seed, 27) * 0.12));
    lobe(E, x, y, z, r, (seed * 11 + i) % 97, soot ? 0.14 : -0.1 + 0.8 * age, fade, soot ? PAL.SOOT : PAL.FIRE, ID.STEAM[i % 3], [p.x, y - R * 0.6, p.z], 3);
  }
  E.puffs.inkZ = 0;
  // lava thrown out in a few fat arcs and ground-glow lines down the slope
  if (a < 3.2) {
    for (let i = 0; i < 16; i++) {
      const b = hash(i, seed, 31) * 0.5, aa = a - b;
      if (aa <= 0) continue;
      const az = hash(i, seed, 32) * 6.283, v = hr(i, seed, 33, 0.3, 1.0) * R * 1.3;
      const vy = hr(i, seed, 34, 0.7, 1.4) * R * 1.3;
      const pts = [];
      const tail = Math.max(0, aa - 0.5);
      for (let q = 0; q <= 12; q++) {
        const u = tail + (aa - tail) * (q / 12);
        const d = v * u, y = vy * u - 0.5 * R * 1.6 * u * u;
        pts.push(new V(p.x + Math.cos(az) * d, p.y + R * 0.3 + y, p.z + Math.sin(az) * d));
      }
      const fade = 1 - smooth(invLerp(2.0, 3.2, a + hash(i, seed, 35) * 0.4));
      E.beams.push(pts, { m: R * 0.03, px: 1.5, width: (s) => 0.25 + 0.75 * s, color: [1.0, 0.45, 0.14], hot: [1, 0.93, 0.68], power: 1.2 * fade, core: 0.42, soft: 5, seed: 0.3 + i, bias: R });
    }
  }
  const pw = 1 - smooth(invLerp(1.6, 5.4, a));
  E.light.point(new V(p.x, p.y + R * 1.2, p.z), [1.0, 0.5, 0.2], R * 5, 1.1 * pw);
}

// The wall of fire across the ridge where the coral beam lands short of the gun: a torn, cauliflower explosion.
// White-hot along the base, reds toward the crown, a few uneven stacks of soot tearing upward with embers and flecks.
export function fireWall(E, p, dir, t0, W, H, seed) {
  const a = E.tq - t0, life = 5.8;
  if (a < 0 || a >= life) return;
  const sx = -dir.z, sz = dir.x;   // along the wall
  const rise = 1 - Math.exp(-a / 0.3);
  const spread = clamp(a / 0.5), age = a / life;
  const n = 46;
  E.puffs.inkZ = E.inkZ(p.x, p.y + H * 0.5, p.z) + W * 0.05;
  // the skyline is ragged: big uneven shoulders, not a dome
  const sky = (u) => (1 - Math.pow(u * 2 - 1, 2) * 0.62) * (0.72 + 0.34 * Math.sin(u * 11.0 + seed) + 0.2 * Math.sin(u * 27.0 + seed * 2.0));
  for (let i = 0; i < n; i++) {
    const u = (i + hash(i, seed, 7)) / n, w = (u - 0.5) * 2;
    const along = w * W * 0.5 * (0.3 + 0.7 * spread) + (hash(i, seed, 1) - 0.5) * W * 0.05;
    const k = hash(i, seed, 2);
    const y = p.y + H * rise * sky(u) * (0.08 + 0.92 * k);
    const off = (hash(i, seed, 3) - 0.5) * H * 0.3;
    const x = p.x + sx * along + dir.x * off;
    const z = p.z + sz * along + dir.z * off;
    const big = hash(i, seed, 8);
    const r = H * (big > 0.66 ? 0.2 + 0.17 * hash(i, seed, 4) : 0.08 + 0.1 * hash(i, seed, 4)) * (0.55 + 0.45 * rise) * (1.15 - 0.45 * k);
    const soot = k + hash(i, seed, 5) * 0.2 > 1.22 - 0.9 * age;
    const lift = Math.max(0, a - 0.9) * H * 0.22 * (0.3 + k);
    const tone = soot ? 0.1 + k * 0.1 : -0.62 + k * 1.05 + 1.0 * age;
    const fade = clamp(invLerp(0.6 + 0.2 * (1 - k), 1.0, age + hash(i, seed, 6) * 0.14));
    // the fire burns outward from the line of the impact along the ground
    const core = [p.x + sx * along * 0.9, p.y - H * 0.08, p.z + sz * along * 0.9];
    lobe(E, x, y + lift, z, r, (seed * 3 + i) % 97, tone, fade, soot ? PAL.SOOT : PAL.FIRE, ID.STEAM[i % 3], core, r > H * 0.14 ? 5 : 3);
  }
  // the hot base: low flat white and yellow lobes churning along the ground line
  for (let i = 0; i < 16; i++) {
    const u = (i + 0.5) / 16, w = (u - 0.5) * 2;
    const along = w * W * 0.54 * (0.3 + 0.7 * spread);
    const x = p.x + sx * along, z = p.z + sz * along;
    const f = clamp(invLerp(0.42, 0.72, age + hash(i, seed, 9) * 0.1));
    lobe(E, x, p.y + H * 0.05, z, H * (0.1 + 0.08 * hash(i, seed, 10)) * (0.6 + 0.4 * spread), (seed + i * 5) % 97, -0.9, f, PAL.FIRE, ID.DUST[i % 3], [x, p.y - H * 0.4, z], 2);
  }
  // uneven stacks of soot, each one tearing upward at its own speed
  for (let c = 0; c < 5; c++) {
    const c0 = hash(c, seed, 40) * 0.9 - 0.45, sp = hr(c, seed, 41, 0.45, 1.15);
    for (let q = 0; q < 9; q++) {
      const b = 0.25 + q * 0.14 + hash(c, q, 42) * 0.1, aa = a - b;
      if (aa <= 0) continue;
      const along = c0 * W * 0.9 + (hash(c, q, 43) - 0.5) * H * 0.3, h = H * (0.85 + sp * aa * 0.75);
      const x = p.x + sx * along + H * 0.05 * aa, z = p.z + sz * along;
      const r = H * (0.08 + 0.09 * hash(c, q, 44)) * (0.5 + 0.5 * clamp(aa / 0.8)) * (1 + 0.16 * aa);
      const fade = clamp(invLerp(0.55, 1, age + q * 0.022 + hash(c, q, 45) * 0.12));
      lobe(E, x, p.y + h, z, r, (seed * 5 + c * 11 + q) % 97, 0.05 + 0.12 * hash(c, q, 46), fade, PAL.SOOT, ID.STEAM[q % 3], [x, p.y, z], 3);
    }
  }
  E.puffs.inkZ = 0;
  flecks(E, p, sx * W * 0.9, sz * W * 0.9, H, t0 + 0.15, life * 0.75, seed + 3, 120);
  const pw = 1 - smooth(invLerp(life * 0.42, life * 0.92, a));
  E.light.point(new V(p.x, p.y + H * 0.6, p.z), [1.0, 0.5, 0.22], H * 3.2, 1.2 * pw);
  E.light.line(new V(p.x - sx * W * 0.5, p.y + H * 0.25, p.z - sz * W * 0.5), new V(p.x + sx * W * 0.5, p.y + H * 0.25, p.z + sz * W * 0.5), [1.0, 0.48, 0.2], H * 1.6);
}

// A slow plume of smoke from a scorched place (s28, s29): big lobes, moonlit, rising and thinning to nothing.
export function plume(E, p, t0, t1, R, seed, o = {}) {
  const life = o.life ?? 7, dt = o.dt ?? 0.55, H = o.H ?? R * 6, pal = o.pal ?? PAL.SMOKE;
  const tq = E.tq;
  if (tq < t0 || tq > t1 + life) return;
  const kNow = Math.floor(tq / dt);
  E.puffs.inkZ = E.inkZ(p.x, p.y + R, p.z) + R * 0.5;
  for (let q = 0; q < Math.ceil(life / dt); q++) {
    const k = kNow - q, b = k * dt, a = tq - b;
    if (b < t0 || b > t1 || a < 0 || a > life) continue;
    const u = a / life;
    const y = p.y + H * (1 - Math.exp(-a / (life * 0.42)));
    const x = p.x + (hash(k, seed, 1) - 0.5) * R * 1.6 * u + R * 1.2 * u * u;
    const z = p.z + (hash(k, seed, 2) - 0.5) * R * 1.6 * u;
    const r = R * (0.45 + 1.15 * u) * (0.85 + 0.3 * hash(k, seed, 3)) * smooth(a / 0.5);
    const fade = clamp(invLerp(0.55, 1.0, u + hash(k, seed, 4) * 0.08));
    lobe(E, x, y, z, r, (k + seed * 7) % 97, 0.1 + 0.2 * u, fade, pal, ID.STEAM[Math.abs(k) % 3]);
  }
  E.puffs.inkZ = 0;
}
