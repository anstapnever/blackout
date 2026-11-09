import * as THREE from 'three';
import { hash, hr, GLOW, KIND, PAL, ID } from './fx-core.js';
import { clamp, smooth, invLerp, easeOut } from './util.js';

// s09: rocket batteries fire, streaks arc over the dark sea at the rings. Each rocket is a hot head on a smoke
// ribbon drawn as one solid arcing shape; ribbons age from the tail and break up into strands that reach zero.

const V = THREE.Vector3;
const COUNT = 54;

export function createRockets(E) {
  const { CUES: C } = E;
  // positions on the ballistic arc
  const bez = (a, m, b, u, out) => {
    const iu = 1 - u;
    return out.set(iu * iu * a.x + 2 * iu * u * m.x + u * u * b.x, iu * iu * a.y + 2 * iu * u * m.y + u * u * b.y, iu * iu * a.z + 2 * iu * u * m.z + u * u * b.z);
  };
  const LIT = [0.62, 0.72, 0.9], DARK = [0.13, 0.16, 0.32];
  const mid = new V(), end = new V();

  function rocket(i, st) {
    const t0 = C.barrage + 0.04 + (i / COUNT) * 2.0 + hash(i, 3, 1) * 0.12;
    const T = hr(i, 3, 2, 1.25, 1.75);
    const a = E.tq - t0;
    const hitAt = t0 + T;
    if (a < -0.1 || E.tq > C.answer + 0.6) return;
    const b = i % 8;
    const P0 = E.battery(b, new V()).add(new V(hr(i, 3, 3, -14, 14), 10, hr(i, 3, 4, -14, 14)));
    const O = E.orreryCore;
    // detonates short of the rings: the rings shrug them off on an invisible skin
    const off = new V().subVectors(P0, O).normalize();
    const skin = hr(i, 3, 5, 210, 320);
    const P1 = end.copy(O).addScaledVector(off, skin).add(new V(hr(i, 3, 6, -130, 130), hr(i, 3, 7, -120, 160), hr(i, 3, 8, -130, 130)));
    mid.lerpVectors(P0, P1, 0.48);
    mid.y += P0.distanceTo(P1) * hr(i, 3, 9, 0.22, 0.42);

    const uHead = clamp(a / T);
    const flying = a >= 0 && a < T;
    // drawn head, on threes: a white-hot point with an orange flare
    if (flying) {
      const P = bez(P0, mid, P1, uHead, new V());
      E.glows.push(P, { kind: GLOW.disc, m: 5, px: 3, color: [1.0, 0.72, 0.28], power: 1.4, mode: 0, bias: 30 });
      E.glows.push(P, { kind: GLOW.soft, m: 24, color: [1.0, 0.55, 0.18], power: 0.7, mode: 0, bias: 40 });
      if (i % 9 === 0) E.light.point(P, [1.0, 0.6, 0.25], 240, 1.2);
    }
    // smoke ribbon from the tube to the head
    if (a > 0) {
      const nS = 34, pts = [];
      const age = E.tq - t0;
      const tailU = clamp((age - 0.5) / 2.2) * uHead;   // old smoke disperses from the launch end
      for (let q = 0; q <= nS; q++) pts.push(bez(P0, mid, P1, tailU + (uHead - tailU) * (q / nS), new V()));
      const dissolve = smooth(invLerp(hitAt + 0.25, hitAt + 1.15, E.tq));
      const seed = 0.1 + i * 0.37;
      E.trails.push(pts, { m: 3.6, px: 1.4, width: (s) => 0.6 + 0.9 * (1 - s) * (1 - s) - 0.4 * s * s * s, color: DARK, hot: LIT, power: dissolve, soft: 0, seed, bias: 25, mode: 0 });
      // hot line riding the last stretch behind the head
      if (flying) {
        const hot = [];
        for (let q = 0; q <= 8; q++) hot.push(bez(P0, mid, P1, Math.max(0, uHead - 0.09) + 0.09 * (q / 8), new V()));
        E.beams.push(hot, { m: 3.6, px: 1.3, width: (s) => 0.2 + 0.8 * s, color: [1.0, 0.45, 0.14], hot: [1, 0.95, 0.7], power: 1.2, core: 0.5, soft: 6, seed, bias: 30 });
      }
    }
    // launch chuff at the battery: a few big lobes, gone soon
    if (a > 0 && a < 0.9) {
      const k = clamp(a / 0.9);
      E.puffs.inkZ = E.inkZ(P0.x, P0.y, P0.z) + 8;
      for (let q = 0; q < 3; q++) {
        const az = hash(i, q, 17) * 6.28;
        const x = P0.x + Math.cos(az) * 24 * easeOut(k, 2), z = P0.z + Math.sin(az) * 24 * easeOut(k, 2), y = P0.y - 2 + 8 * k;
        const r = 10 + 12 * k;
        E.puffs.push(x, y, z, r, 0, 1, 0.3, 0, 1, 0, (i * 3 + q) % 97, -0.1 + 0.6 * k, clamp(invLerp(0.5, 1, k + q * 0.06)), KIND.PUFF, k < 0.25 ? PAL.FIRE : PAL.SMOKE, ID.DUST[q]);
      }
      E.puffs.inkZ = 0;
      E.light.point(P0, [1.0, 0.55, 0.22], 90, 1.1 * (1 - k));
    }
    // detonation on the invisible skin: a drawn ring and a white pop that burns out in a few drawings
    const ha = E.tq - hitAt;
    if (ha >= 0 && ha < 0.72) {
      const k = ha / 0.72;
      const R = 34 + 90 * easeOut(k, 2.2);
      const pts = [];
      const n = 28;
      const ux = new V(1, 0, 0).applyQuaternion(E.camera.quaternion), uy = new V(0, 1, 0).applyQuaternion(E.camera.quaternion);
      for (let q = 0; q <= n; q++) {
        const th = (q / n) * Math.PI * 2;
        pts.push(P1.clone().addScaledVector(ux, Math.cos(th) * R).addScaledVector(uy, Math.sin(th) * R));
      }
      E.beams.push(pts, { m: 3.2 * (1 - k * 0.8), px: 1.2, color: [1.0, 0.65, 0.34], hot: [1, 0.97, 0.8], power: (1 - k) * 1.4, core: 0.55, soft: 4, seed: i * 0.7, bias: 30 });
      E.glows.push(P1, { kind: GLOW.burst, m: 90 * (0.7 + 0.5 * k), color: [1.0, 0.74, 0.34], power: 1.35 * (1 - k), mode: 0, bias: 30, seed: 0.1 + i * 0.07 });
      E.puffs.inkZ = E.inkZ(P1.x, P1.y, P1.z);
      for (let q = 0; q < 5; q++) {
        const az = hash(i, q, 41) * 6.28, el = hash(i, q, 42) * 3.14;
        const gr = easeOut(k, 2) * 42;
        E.puffs.push(P1.x + Math.cos(az) * Math.sin(el) * gr, P1.y + Math.cos(el) * gr, P1.z + Math.sin(az) * Math.sin(el) * gr, 20 + 28 * k, 0, 1, 0.3, 0, 1, 0, (i + q) % 97, -0.4 + 1.5 * k, clamp(invLerp(0.45, 1, k)), KIND.PUFF, PAL.FIRE, ID.DUST[q % 3]);
      }
      E.puffs.inkZ = 0;
      if (i % 4 === 0) E.light.point(P1, [1.0, 0.65, 0.3], 300, 1.1 * (1 - k));
    }
  }
  return {
    update(st) {
      if (E.tq < C.barrage - 0.2 || E.tq > C.answer + 0.6) return;
      for (let i = 0; i < COUNT; i++) rocket(i, st);
    },
  };
}
