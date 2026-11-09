import * as THREE from 'three';
import { smooth, smoother, invLerp, clamp, track, easeIn, easeOut } from './util.js';

// ORRERY dept: every moving number is baked once from CUES, then read back by t. Rings have inertia:
//   FREE    velocity servo toward a slow spin (heavy lag)
//   SOFT    Hermite glide (from the current angle and speed) to just short of the plane, arriving before the snap
//   ANTIC   a few degrees of wind-back
//   SNAP    stiff under-damped spring: clack, overshoot, settle
const HZ = 240, T_END = 72;
const AIM_GUN = new THREE.Vector3(-3050, 690, 1990);
const AIM_HILLS = new THREE.Vector3(-1950, 240, 1250);

export function makeTimeline(C, center) {
  const toAim = (p) => p.clone().sub(center).normalize();
  // soft: begin of the glide. snap: time the outermost ring clacks. stagger between rings. hold: rad short of the plane before the snap.
  const EV = [
    { soft: 18.3, snap: C.answer + 0.14, stagger: 0.12, release: 23.8, hold: 0.48, antic: 0.24, aim: toAim(AIM_HILLS) },
    // s12: the rings stand across the core like bars, then roll flat out of its way. Slow spring, not a clack.
    { soft: 24.0, snap: C.coreOpen + 0.42, stagger: 0.13, release: 27.32, hold: 1.2, antic: 0.26, aim: toAim(AIM_GUN), fSnap: 0.62, zSnap: 0.62, part: true },
    { soft: 27.3, snap: 29.36, stagger: 0.085, release: 34.0, hold: 0.14, antic: 0.2, aim: toAim(AIM_GUN) },
    { soft: 37.0, snap: 40.72, stagger: 0.3, release: C.pierce + 0.02, hold: 0.3, antic: 0.34, aim: toAim(AIM_GUN) },
  ];
  return EV;
}

const hermite = (p0, m0, p1, m1, u) => {
  const u2 = u * u, u3 = u2 * u;
  return (2 * u3 - 3 * u2 + 1) * p0 + (u3 - 2 * u2 + u) * m0 + (-2 * u3 + 3 * u2) * p1 + (u3 - u2) * m1;
};

function simAngle(EV, C, cfg) {
  const n = Math.ceil(T_END * HZ) + 2, a = new Float32Array(n), dt = 1 / HZ;
  let th = cfg.th0 ?? 0, w = 0, latch = -1, t0 = 0, th0 = 0, m0 = 0, tgt = 0, sg = 1;
  const tStart = cfg.tStart;
  for (let k = 0; k < n; k++) {
    a[k] = th;
    const t = k / HZ;
    if (t < tStart) { continue; }
    let evI = -1;
    for (let e = 0; e < EV.length; e++) if (t >= EV[e].soft && t < EV[e].release) evI = e;
    let acc;
    if (evI >= 0) {
      const ev = EV[evI], snap = ev.snap + cfg.i * ev.stagger, t1 = snap - ev.antic;
      if (latch !== evI) {
        latch = evI; t0 = t; th0 = th; m0 = w;
        const dir = Math.sign(w) || 1;
        let m = Math.round(th / Math.PI);
        if ((m * Math.PI - th) * dir < 0.05) m += dir;
        tgt = m * Math.PI;
        sg = -dir;
      }
      if (t < t1) {
        const dur = t1 - t0, u = clamp((t - t0) / dur);
        const target = tgt + sg * ev.hold, prev = th;
        th = hermite(th0, m0 * dur, target, 0, u);
        w = (th - prev) / dt;
        a[k] = th;
        continue;
      } else if (t < snap) {
        const f = 2.0, z = 0.95, W = 2 * Math.PI * f;
        acc = W * W * (tgt + sg * ev.hold * 1.35 - th) - 2 * z * W * w;
      } else {
        const f = ev.fSnap ?? 1.5, z = ev.zSnap ?? 0.36, W = 2 * Math.PI * f;
        acc = W * W * (tgt - th) - 2 * z * W * w;
      }
    } else if (t >= C.pierce) {
      // pierced: a kick throws every ring out of the plane; a weak spring and heavy damping bring them to rest crooked
      if (latch !== 99) { latch = 99; w += cfg.kick; tgt = Math.round(th / Math.PI) * Math.PI + cfg.kick * 0.28; }
      const f = 0.42, z = 0.34, W = 2 * Math.PI * f;
      acc = W * W * (tgt - th) - 2 * z * W * w;
    } else {
      latch = -1;
      acc = (cfg.w - w) / (t < cfg.tStart + 3 ? 0.8 : 2.2);
    }
    w += acc * dt; th += w * dt;
  }
  return (t) => { const f = Math.min(n - 1.001, Math.max(0, t * HZ)), i = Math.floor(f); return a[i] + (a[i + 1] - a[i]) * (f - i); };
}

export function bakeMotion(C, center) {
  const EV = makeTimeline(C, center);
  const toGun = AIM_GUN.clone().sub(center).normalize();
  const Y = new THREE.Vector3(0, 1, 0);
  const aimQuat = (dir, roll = 0) => {
    const z = dir.clone().normalize(), x = new THREE.Vector3().crossVectors(Y, z).normalize(), y = new THREE.Vector3().crossVectors(z, x);
    const q = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
    if (roll) q.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), roll));
    return q;
  };
  // --- hook pose: 45 degrees off the line to the gun, so it is clearly a ring from the barrel and from the city
  const toCity = new THREE.Vector3(0, 0.05, 1).normalize();
  const perp = toCity.clone().addScaledVector(toGun, -toCity.dot(toGun)).normalize();
  const nHook = toGun.clone().multiplyScalar(Math.SQRT1_2).addScaledVector(perp, Math.SQRT1_2).normalize();
  const Qhook = aimQuat(nHook, 0.2), Qface = aimQuat(toGun, 0.2);

  const ringsCfg = [
    null,
    { i: 1, w: 0.27, tStart: C.ignite + 0.75, kick: 0.9 },
    { i: 2, w: -0.36, tStart: C.ignite + 0.92, kick: -0.7 },
    { i: 3, w: 0.5, tStart: C.ignite + 1.08, kick: 1.1 },
    { i: 4, w: -0.66, tStart: C.ignite + 1.24, kick: -1.3 },
  ];
  const angle = [() => 0];
  for (let i = 1; i < 5; i++) angle[i] = simAngle(EV, C, ringsCfg[i]);

  // great ring blend a0: 0 = free precession, 1 = locked on the aim direction. Same phases as the rings, in blend units.
  const a0sim = (() => {
    const n = Math.ceil(T_END * HZ) + 2, a = new Float32Array(n), dt = 1 / HZ;
    let v = 1, w = 0, latch = -1, t0 = 0, v0 = 0, m0 = 0;
    for (let k = 0; k < n; k++) {
      a[k] = v;
      const t = k / HZ;
      if (t < C.ignite + 0.8) continue;
      let evI = -1;
      for (let e = 0; e < EV.length; e++) if (t >= EV[e].soft && t < EV[e].release) evI = e;
      let acc;
      if (evI >= 0) {
        const ev = EV[evI], t1 = ev.snap - ev.antic;
        if (latch !== evI) { latch = evI; t0 = t; v0 = v; m0 = w; }
        if (t < t1) {
          const dur = t1 - t0, u = clamp((t - t0) / dur), prev = v;
          v = hermite(v0, m0 * dur, 0.9, 0, u); w = (v - prev) / dt; a[k] = v; continue;
        } else if (t < ev.snap) {
          const W = 2 * Math.PI * 2; acc = W * W * (0.87 - v) - 2 * 0.95 * W * w;
        } else {
          const W = 2 * Math.PI * 1.3; acc = W * W * (1 - v) - 2 * 0.4 * W * w;
        }
      } else if (t >= C.pierce) {
        const W = 2 * Math.PI * 0.4; acc = W * W * (0.92 - v) - 2 * 0.5 * W * w;
      } else {
        latch = -1;
        const W = 2 * Math.PI * 0.14; acc = W * W * (0 - v) - 2 * 1.0 * W * w;
      }
      w += acc * dt; v += w * dt;
    }
    return (t) => { const f = Math.min(n - 1.001, Math.max(0, t * HZ)), i = Math.floor(f); return a[i] + (a[i + 1] - a[i]) * (f - i); };
  })();

  const q1 = new THREE.Quaternion(), q2 = new THREE.Quaternion(), qT = new THREE.Quaternion();
  const VX = new THREE.Vector3(1, 0, 0), VY = new THREE.Vector3(0, 1, 0), VZ = new THREE.Vector3(0, 0, 1);

  // free precession: a slow wander around the line to the gun, so the rings keep showing their open side to the ridge
  const freeQuat = (t, out) => {
    out.copy(Qface);
    q1.setFromAxisAngle(VX, 0.42 * Math.sin(0.21 * t + 0.6));
    q2.setFromAxisAngle(VY, 0.5 * Math.sin(0.145 * t + 2.0));
    out.multiply(q1).multiply(q2);
    q1.setFromAxisAngle(VZ, 0.055 * t);
    out.multiply(q1);
    return out;
  };
  const slerpX = (a, b, k, out) => out.slerpQuaternions(a, b, k);       // three's slerp extrapolates fine for small overshoots

  // hook turn: anticipate away, swing, settle exactly on frame 72
  const hookBlend = (t) => {
    if (t <= C.ringTurn) return 0;
    const face = C.ringFace - 1 / 24;
    if (t < face) {
      const u = (t - C.ringTurn) / (face - C.ringTurn);
      // a heavy wind-up away from the gun, then the look: fast off the mark, long settle, landing dead on
      if (u < 0.36) return -0.17 * smooth(u / 0.36);
      const s = (u - 0.36) / 0.64;
      return -0.17 + 1.17 * (1 - Math.pow(1 - Math.pow(s, 1.4), 3));
    }
    const d = t - face;
    return 1 + 0.018 * Math.exp(-d * 3.2) * Math.sin(d * 11);
  };

  // aim direction: the gun, until each event takes over, blended over 1.2 s so nothing pops
  const _aim = new THREE.Vector3();
  const aimAt = (t) => {
    let prev = toGun, cur = toGun, ts = -99;
    for (const e of EV) if (t >= e.soft) { prev = cur; cur = e.aim; ts = e.soft; }
    return _aim.copy(prev).lerp(cur, smooth(invLerp(ts, ts + 1.2, t))).normalize().clone();
  };
  const ringQ = (t, out) => {
    if (t < C.ignite + 0.8) {
      // hook and ignite: hook pose -> face the gun
      return slerpX(Qhook, Qface, hookBlend(t), out);
    }
    freeQuat(t, qT);
    let dir = aimAt(t);
    const qa = aimQuat(dir, 0.2);
    return slerpX(qT, qa, a0sim(t), out);
  };
  // great ring blends away from Qface smoothly: freeQuat(t) is close to Qface at ignite + 0.8 because of how a0 starts at 1

  // deploy: rings iris out of the great ring, outermost first
  const deploy = [];
  for (let i = 0; i < 5; i++) {
    const t0 = C.ignite + 0.02 + (i - 1) * 0.15;
    deploy[i] = i === 0 ? () => 1 : ((t) => {
      if (t <= t0) return 0;
      const d = t - t0, u = clamp(d / 0.62);
      return smooth(u) + 0.08 * Math.exp(-Math.max(0, d - 0.62) * 3.6) * Math.sin(Math.max(0, d - 0.62) * 9) * smooth(u);
    });
  }

  const charge = (t) => track([
    [C.ignite - 0.05, 0], [C.ignite + 0.5, 0.2], [C.answer - 1.6, 0.12], [C.answer + 0.45, 1], [23.5, 1], [24.6, 0.3], [C.coreOpen, 0.22], [26.6, 0.8], [28.2, 0.55], [29.6, 1],
    [33.6, 1], [35.2, 0.2], [C.align, 0.14], [C.strike - 0.25, 1, (u) => easeIn(u, 2.1)], [C.pierce, 1], [C.pierce + 0.8, 1], [C.coreBreak - 0.1, 1.25], [C.coreBreak + 0.25, 0],
  ], t);
  const slit = (t) => track([
    [20.9, 0], [21.5, 1], [23.5, 1], [24.1, 0], [29.3, 0], [29.8, 1], [33.6, 1], [34.3, 0], [41.45, 0], [41.95, 1], [C.coreBreak, 1], [C.coreBreak + 0.2, 1],
  ], t);
  const bloom = (t) => track([
    [C.coreOpen - 0.02, 0], [C.coreOpen + 0.25, -0.06], [C.coreOpen + 1.05, 1, (u) => easeOut(u, 3)], [27.45, 1], [28.9, 0.05], [29.3, 0], [C.coreBreak, 0],
  ], t);
  const aC = (t) => track([
    [18.6, 0], [20.6, 1], [23.8, 1], [24.8, 1], [34, 1], [35.5, 0.2], [38.5, 0.2], [40.5, 1],
  ], t);
  const cold = (t) => 1 - smooth(invLerp(C.ignite - 0.05, C.ignite + 0.45, t));
  const run = (t) => clamp(invLerp(C.ringTurn + 0.06, C.ringFace, t)) * clamp(1 - invLerp(C.ringFace + 0.25, C.ignite - 0.1, t));
  // hook flare, built over f66-71: the inner edge heats first, the disc fills after it, both at maximum on f71, then it decays
  const flareP = (t) => clamp(invLerp(C.ringFace - 7 / 24, C.ringFace - 1 / 24, t));
  const flareDecay = (t) => Math.exp(-Math.max(0, t - (C.ringFace - 1 / 24)) * 3.4);
  const flash = (t) => smooth(invLerp(0, 0.8, flareP(t))) * flareDecay(t);
  const flashFill = (t) => smooth(invLerp(0.35, 1, flareP(t))) * flareDecay(t);

  const broken = (t) => smooth(invLerp(C.pierce + 0.04, C.coreBreak + 0.15, t));
  const dead = (t) => smooth(invLerp(C.coreBreak + 0.02, C.coreBreak + 0.5, t));
  const crack = (i, t) => smooth(invLerp(C.pierce + 0.06 + i * 0.09, C.coreBreak - 0.25 + i * 0.05, t));

  // jolts when each ring clacks home, and a shove at each firing
  const clicks = [];
  for (const e of EV) for (let i = 0; i < 5; i++) clicks.push({ t: e.snap + i * e.stagger, amp: e === EV[EV.length - 1] ? 2.4 : e.part ? 0.7 : 1.6, ring: i });
  const joltAt = (t) => {
    let y = 0;
    for (const c of clicks) if (t > c.t) y += c.amp * Math.exp(-(t - c.t) * 3.2) * Math.sin((t - c.t) * 19);
    return y;
  };
  const fireShove = (t) => {
    const a = smooth(invLerp(21.75, 22.05, t)) * (1 - smooth(invLerp(23.4, 25, t))) + smooth(invLerp(29.9, 30.15, t)) * (1 - smooth(invLerp(33.6, 35.2, t))) + smooth(invLerp(41.95, 42.2, t)) * (1 - smooth(invLerp(C.pierce, C.pierce + 2, t)));
    return a * 7;
  };

  // alignment 0..1: 1 only when every ring lies in the plane and the great ring is locked
  const al = new Float32Array(Math.ceil(T_END * 24) + 2);
  for (let k = 0; k < al.length; k++) {
    const t = k / 24;
    let m = 1;
    for (let i = 1; i < 5; i++) {
      const d = Math.abs(Math.sin(angle[i](t)));            // 0 in plane
      m = Math.min(m, 1 - smooth(invLerp(0.03, 0.42, d)));
    }
    const g = t < C.ignite ? 0 : clamp(invLerp(0.5, 0.98, a0sim(t))) * (t > 24 && t < 27.6 ? 0 : 1);
    const dep = clamp(invLerp(0.98, 1.0, deploy[4](t)));
    al[k] = Math.min(m, g) * (t > C.ignite + 1 ? 1 : dep * 0.0 + 0);
  }
  const alignment = (t) => { const f = Math.min(al.length - 1.001, Math.max(0, t * 24)), i = Math.floor(f); return al[i] + (al[i + 1] - al[i]) * (f - i); };

  // the engraved scale tracks creep inside their rings like vernier dials, and stop when the rings lock
  const dial = (i, t) => (i % 2 ? 1 : -1) * (0.012 + i * 0.006) * t * 40;

  const bob = (t) => [Math.sin(t * 0.33 + 1.0) * 2.0, Math.sin(t * 0.54) * 3.0 + joltAt(t), Math.sin(t * 0.27 + 2.0) * 2.0];

  const coreIdleAim = (t) => {
    const d = toGun.clone();
    d.x += 0.35 * Math.sin(t * 0.17); d.y += 0.2 * Math.sin(t * 0.23 + 1.0); d.z += 0.35 * Math.cos(t * 0.13);
    return d.normalize();
  };
  const coreQ = (t, out) => {
    const idle = aimQuat(coreIdleAim(t), 0);
    const aim = aimQuat(aimAt(t), 0);
    return slerpX(idle, aim, aC(t), out);
  };

  return { EV, dial, angle, ringQ, coreQ, deploy, charge, slit, bloom, cold, run, flash, flashFill, broken, dead, crack, alignment, bob, fireShove, aimAt, a0: a0sim, clicks, Qface };
}
