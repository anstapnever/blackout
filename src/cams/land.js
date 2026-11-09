// BLACKOUT cameras and looks, land department.
import { smooth, smoother, lerp, invLerp, noise1, clamp } from '../util.js';
import { YARD } from '../land-map.js';

const lerp3 = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];

// s01 / s31: the poster. One camera, descending forward over the east arm toward the ring.
const WAVE_A = [1700, 360, 1500], WAVE_B = [1490, 225, 1350];
const AT = [-400, 205, 0];

function waveCam(u, fov = 34) {
  const p = lerp3(WAVE_A, WAVE_B, u);
  const at = lerp3(AT, [-330, 150, -20], u);
  return { pos: p, look: at, fov, far: 9000 };
}

export const CAMS = {
  s01: (lt, d) => waveCam(smooth(lt / d) * 0.5 + (lt / d) * 0.5),
  s31: (lt, d) => waveCam(smooth(lt / d) * 0.3),
  // From the quay under the first tower, along the cables over the strait; the lens runs out to the ridge as the clot gets there.
  s01b: (lt, d) => {
    const u = clamp(lt / d, 0, 1), z = 0;
    // From frame 36 a cut to the shelf, low behind the gun: its silhouette against the open sky, rails leading in, the pulse landing on the last towers beside it
    if (u >= 0.5) {
      const v = smooth((u - 0.5) / 0.5);
      return { pos: lerp3([-3382, 647, 2161], [-3365, 649, 2150], v), look: lerp3([-3040, 678, 2045], [-3040, 684, 2042], v), fov: 42, roll: lerp(1.2, -0.8, v), far: 9000 };
    }
    // Low on the axis of the line, the first tower a dark frame at the edge, the rest receding to the ridge; then the lens runs out to the muzzle.
    const along = lerp(98, 56, u);
    const T0 = [-1205, 1455], D = [-0.959, 0.284], S = [0.284, 0.959];
    const px = T0[0] - D[0] * along + S[0] * 26, pz = T0[1] - D[1] * along + S[1] * 26;
    return { pos: [px, lerp(17, 34, z), pz], look: [lerp(-2460, -3041.6, z), lerp(245, 659, z), lerp(1885, 2018.8, z)], fov: lerp(36, 3.6, z), roll: -2.5 * (1 - z), far: 9000 };
  },
  s04: (lt, d) => {
    const u = lt / d;
    const a = YARD.ry, cs = Math.cos(a), sn = Math.sin(a);
    const P = (lx, ly, lz) => [YARD.x + lx * cs + lz * sn, YARD.y + ly, YARD.z - lx * sn + lz * cs];
    return { pos: P(lerp(-4, 8, u), 1.6 + 0.8 * u, 44), look: P(-14, 24, -8), fov: 44, roll: -7 };
  },
};

export const LOOKS = {
  s01: () => ({ k: 1, exposure: 1.1, paintRadius: 2.2, fogMul: 0.8, bloom: 0.55 }),
  s31: () => ({ k: 1, exposure: 1.1, paintRadius: 2.2, fogMul: 0.8, bloom: 0.55 }),
  s01b: () => ({ k: 1, paintRadius: 2.5, exposure: 1.2 }),
  s04: () => ({ k: 1, paintRadius: 2.5, exposure: 1.2, inkWidth: 1.2 }),
};
