import * as THREE from 'three';
import { hash, hr, GLOW, boltPts } from './fx-core.js';
import { clamp, smooth, invLerp, easeOut } from './util.js';

// s15, THE IMAGE. A corkscrew in real perspective: the axis runs from past the left of the lens away to the horizon on the
// right, so the ice-blue beam tears away from us and the coral beam comes at us out of the distance. The turns are huge
// on the left and tighten to nothing at the vanishing point. Front and back read by overlap (every stretch of both beams is
// painted far to near) and by width. Where the heads pass, each drags the other: the strands bulge and throw tendrils
// of the other beam's colour, sparks are shed, and pressure rings run out over the water.
// Helix space (a stage for this one shot, nothing else depends on it): axis along world X.

const V = THREE.Vector3;
export const HELIX = { cx: -1560, y: 124, cz: 1120, nearL: 560, farL: 3000, A: 58, lambda: 400, omega: 2.4, cross: 31.0, start: 30.5 };

export const ICE = [0.34, 0.68, 1.0], CORAL = [1.0, 0.27, 0.22];

export function createHelix(E) {
  const H = HELIX;
  const SPEED = 1150;    // m/s of each head
  const K = (Math.PI * 2) / H.lambda;
  const heroHead = (t) => H.cx + (t - H.cross) * SPEED;
  const coralHead = (t) => H.cx - (t - H.cross) * SPEED;
  // the other beam's head has just gone past this point: the strand is yanked toward it, then rings out
  const bumpAt = (x, sign, t) => {
    const dx = sign > 0 ? x - coralHead(t) : heroHead(t) - x;
    return t < H.cross - 0.12 ? 0 : Math.exp(-(dx * dx) / (170 * 170));
  };
  const envAt = (x, a) => smooth(invLerp(0, 0.32, a - Math.abs(x - H.cx) / SPEED + 0.06));
  // the turns are not a clean sine: the pitch wanders along the axis and the phase is pushed around in time
  const phaseAt = (x, sign, a) => (x - H.cx) * K + 0.75 * Math.sin((x - H.cx) * 0.0031 + 0.7) + 0.32 * Math.sin((x - H.cx) * 0.0113 + a * 1.6) + H.omega * a + (sign > 0 ? 0 : Math.PI);
  const axisPoint = (x, sign, t) => {
    const a = t - H.cross, dx = x - H.cx;
    const env = envAt(x, a), bump = bumpAt(x, sign, t);
    const pre = (1 - smooth(invLerp(-0.24, 0.14, a))) * 42;      // the two lanes close as the heads near the middle
    const ph = phaseAt(x, sign, a);
    // amplitude breathes along the length, and flares where the other head has just passed
    const amp = H.A * (0.14 + 0.86 * env) * (1 + 0.34 * Math.sin(dx * 0.0047 + a * 1.1 + (sign > 0 ? 0 : 1.7))) * (1 + 0.95 * bump);
    return new V(x, H.y + sign * pre + Math.sin(ph) * amp - sign * 36 * bump + 13 * Math.sin(dx * 0.0071 + a * 1.9), H.cz + Math.cos(ph) * amp + 16 * Math.sin(dx * 0.0052 - a * 1.3));
  };
  // + toward the lens (the camera sits on the +z side), - away from it
  const towardLens = (x, sign, a) => Math.cos(phaseAt(x, sign, a)) * envAt(x, a);

  function spine(x0, x1, sign, t) {
    const a = t - H.cross, nSeg = 420, pts = [], u = [], w = [];
    let L = 0;
    for (let i = 0; i <= nSeg; i++) {
      const x = x0 + (x1 - x0) * (i / nSeg), p = axisPoint(x, sign, t);
      if (i) L += p.distanceTo(pts[i - 1]);
      pts.push(p); u.push(L);
      const edge = clamp((H.cx + H.farL - x) / 500);       // the far end thins away at the vanishing point
      w.push((1 + 0.44 * towardLens(x, sign, a)) * (0.84 + 0.2 * Math.sin((x - H.cx) * 0.0137 + a * 2.6 + sign)) * (1 + 0.8 * bumpAt(x, sign, t)) * edge);
    }
    return { pts, u, w };
  }

  // every stroke goes into one list and is painted far to near, so the strands truly pass over and under each other
  function pieces(list, S, style, step = 12) {
    const cam = E.camera.position, n = S.pts.length, w = S.w, over = Math.ceil(step / 2);
    for (let i = 0; i < n - 1; i += step) {
      const j = Math.min(n - 1, i + step + over), q0 = (i + step >= j) ? 2 : step / (j - i);
      const pts = S.pts.slice(i, j + 1);
      // the far end comes to a point, over the next (farther) stretch of the same beam, so a stroke crossing the other beam never ends in a block
      const width = (q) => w[i + Math.round(q * (j - i))] * (q > q0 ? 1 - 0.78 * smooth((q - q0) / (1 - q0)) : 1);
      list.push({ d: pts[Math.min(pts.length - 1, Math.round(step / 2))].distanceToSquared(cam), pts, o: { ...style, u0: S.u[i], width } });
    }
  }

  // thin strands of the OTHER beam's colour wound tight around each beam, reaching out from where the heads passed
  function tendrils(list, sign, t, a, color) {
    if (a <= 0.02 || a > 2.2) return;
    const reach = Math.min(a * SPEED * 0.92, 1500);
    const fade = 1 - smooth(invLerp(1.4, 2.2, a));
    for (let i = 0; i < 2; i++) {
      const nS = Math.min(760, Math.max(40, Math.ceil((reach * 2) / 4))), pts = [], u = [], w = [];
      const off = (i / 2) * Math.PI * 2 + sign;
      let L = 0;
      for (let q = 0; q <= nS; q++) {
        const f = q / nS, x = H.cx + (f * 2 - 1) * reach, c = axisPoint(x, sign, t);
        const psi = (x - H.cx) * K * 3.2 + a * 7.5 * sign + off;
        const r = (12 + 26 * Math.exp(-Math.pow((x - H.cx) / 420, 2))) * (0.75 + 0.35 * Math.sin((x - H.cx) * 0.011 + i * 2));
        const p = c.clone().add(new V(0, Math.sin(psi) * r, Math.cos(psi) * r));
        if (q) L += p.distanceTo(pts[q - 1]);
        pts.push(p); u.push(L);
        w.push(Math.pow(Math.sin(Math.PI * f), 0.7) * (0.55 + 0.45 * Math.cos(psi)));
      }
      pieces(list, { pts, u, w }, { m: 1.7 * fade, px: 1.0, color, hot: color, power: 1.2 * fade, core: 0.2, soft: 0, seed: 1.7 + i, mode: 2 }, 16);
    }
  }

  function head(list, x, sign, t, dirX, color, width) {
    const p = axisPoint(x, sign, t);
    const tip = p.clone().add(new V(dirX * 92, 0, 0));
    const back = p.clone().add(new V(-dirX * 110, 0, 0));
    list.push({ d: p.distanceToSquared(E.camera.position) - 1, pts: [back, p, tip], o: { m: width * 1.7, px: 5, width: (s) => (s < 0.34 ? 0.42 + 0.58 * (s / 0.34) : s < 0.5 ? 1.0 : Math.max(0.02, 2 * (1 - s))), color, hot: [1, 1, 1], power: 1.3, core: 0.62, soft: 18, seed: 0.13, mode: 2 } });
    E.glows.push(p, { kind: GLOW.soft, m: 150, color, power: 0.6, mode: 2 });
  }

  // the instant they touch: two discs of pure colour jammed into a white heart, with long flat flares, held for a few drawings
  function contactFlare(C0, a) {
    if (a < -0.02 || a > 0.66) return;
    const q = Math.floor((a + 0.02) * 8), jit = 1 + (hash(q, 3, 7) - 0.5) * 0.3;
    const k = a < 0.05 ? smooth((a + 0.02) / 0.07) : 1 - smooth(invLerp(0.12, 0.66, a));
    const r = new V(1, 0, 0).applyQuaternion(E.camera.quaternion);
    const R = (30 + 26 * clamp(a * 6)) * k * jit;
    E.glows.push(C0, { kind: GLOW.soft, m: 300 * (0.6 + 0.4 * k), color: [0.8, 0.84, 1.0], power: 0.55 * k, mode: 2 });
    E.glows.push(C0.clone().addScaledVector(r, -R * 0.62), { kind: GLOW.disc, m: R * 1.06, color: ICE, power: 1.3, mode: 2, cap: 0.5 });
    E.glows.push(C0.clone().addScaledVector(r, R * 0.62), { kind: GLOW.disc, m: R, color: CORAL, power: 1.3, mode: 2, cap: 0.5 });
    E.glows.push(C0, { kind: GLOW.disc, m: R * 0.92, color: [1, 1, 1], power: 1.45, mode: 2, cap: 0.5 });
    // flat anamorphic flares through the heart
    E.glows.push(C0, { kind: GLOW.streak, m: 11 * k * jit, aspect: 26, rot: -0.07 + 0.05 * (q % 2), color: [0.82, 0.9, 1.0], power: 1.5 * k, mode: 2, cap: 0.1 });
    E.glows.push(C0, { kind: GLOW.streak, m: 8 * k, aspect: 13, rot: Math.PI / 2 - 0.1, color: [1.0, 0.76, 0.72], power: 1.2 * k, mode: 2, cap: 0.1 });
    E.light.point(C0, [1.0, 0.95, 1.0], 800, 1.5 * k);
  }

  // sparks thrown off the strands as they drag past each other: short tapered strokes, every one burns out
  function sparks(a) {
    if (a <= 0 || a > 1.9) return;
    for (let i = 0; i < 84; i++) {
      const b = hash(i, 7, 1) * 1.05, aa = a - b, life = hr(i, 7, 2, 0.32, 0.85);
      if (aa <= 0 || aa >= life) continue;
      const sign = i % 2 ? 1 : -1, x0 = H.cx + (hash(i, 7, 3) - 0.5) * 2 * Math.min(40 + b * SPEED, 1300);
      const O = axisPoint(x0, sign, H.cross + b);
      const th = hash(i, 7, 4) * 6.283, sp = hr(i, 7, 5, 110, 360);
      const vx = sign * hr(i, 7, 6, 80, 420);
      const at = (s) => new V(O.x + vx * s, O.y + Math.sin(th) * sp * s - 110 * s * s, O.z + Math.cos(th) * sp * s);
      const u = aa / life, tail = Math.max(0, aa - 0.075);
      E.beams.push([at(tail), at((tail + aa) / 2), at(aa)], { m: 1.5, px: 1.3, width: (s) => s * (1 - u * 0.7), color: sign > 0 ? CORAL : ICE, hot: [1, 1, 1], power: 1.5 * (1 - u * u), core: 0.5, soft: 4, seed: i * 0.31, mode: 2 });
    }
  }

  // the pressure of the crossing on the sea: drawn rings broken into arcs, and a V of wake under each head
  function pressure(a, hx, cx) {
    const Y = 0.8, pale = [0.62, 0.84, 1.0], hot = [0.94, 1, 1];
    for (let j = 0; j < 3 && a > 0; j++) {
      const ar = a - j * 0.14;
      if (ar <= 0 || ar >= 1.7) continue;
      const u = ar / 1.7, R = 50 + 1050 * easeOut(u, 2.2), arcs = 7;
      for (let q = 0; q < arcs; q++) {
        const a0 = ((q + hash(q, j, 11) * 0.4) / arcs) * 6.283, len = (0.5 + 0.42 * hash(q, j, 12)) * (6.283 / arcs);
        const pts = [];
        for (let s = 0; s <= 16; s++) {
          const th = a0 + len * (s / 16), r = R * (1 + 0.03 * Math.sin(th * 7 + j));
          pts.push(new V(H.cx + Math.cos(th) * r, Y, H.cz + Math.sin(th) * r));
        }
        E.beams.push(pts, { m: (1.7 - j * 0.4) * (1 - 0.4 * u), px: 1, width: (s) => Math.pow(Math.sin(Math.PI * s), 0.7), color: pale, hot, power: 0.85 * (1 - u * u), core: 0.2, soft: 3, seed: j + q * 0.2, mode: 4 });
      }
    }
    const wake = (x, dir) => {
      // never trails back under the lens: only the stretch out in front of the camera is drawn
      const camX = E.camera.position.x + 300, room = dir > 0 ? x - camX : 1e4;
      if (room < 60 || (dir < 0 && x - camX < 160)) return;
      const len = Math.min(460, room);
      for (const side of [-1, 1]) {
        const pts = [];
        for (let s = 0; s <= 36; s++) { const f = s / 36; pts.push(new V(x - dir * f * len, Y, H.cz + side * (16 + 210 * (len / 460) * Math.pow(f, 0.8)))); }
        E.beams.push(pts, { m: 1.1, px: 1, width: (s) => Math.pow(1 - s, 0.8), color: pale, hot, power: 0.7, core: 0.2, soft: 3, seed: 2.2 + side, mode: 4 });
      }
    };
    wake(hx, 1); wake(cx, -1);
  }

  function update(st) {
    const t = E.tq;
    if (st.sid !== 's15') return;
    const a = t - H.cross;
    const x0 = H.cx - H.nearL, x1 = H.cx + H.farL;
    const hx = heroHead(t), cx = coralHead(t);
    const heroEnd = Math.min(hx, x1), coralStart = Math.max(cx, x0);
    const HM = 8.5, CM = 7.5;
    const heroS = heroEnd > x0 + 2 ? spine(x0, heroEnd, 1, t) : null;
    const coralS = x1 > coralStart + 2 ? spine(coralStart, x1, -1, t) : null;

    // reflections first, ripple-broken strokes on the sea
    if (heroS) E.reflect(heroS.pts, { color: ICE, m: 0.55, seed: 3.31, step: 2 });
    if (coralS) E.reflect(coralS.pts, { color: CORAL, m: 0.5, seed: 3.72, step: 2 });
    pressure(a, hx, cx);

    // the halo pass first, then the solid drawing far to near
    const style = (color, m, seed, soft) => ({ m, px: 1.6, color, hot: [1, 1, 1], power: 1.3, core: 0.32, soft, seed, mode: 2 });
    if (heroS) E.beams.push(heroS.pts, { ...style(ICE, HM, 0.31, 24), width: (s) => heroS.w[Math.round(s * (heroS.w.length - 1))] });
    if (coralS) E.beams.push(coralS.pts, { ...style(CORAL, CM, 0.72, 24), width: (s) => coralS.w[Math.round(s * (coralS.w.length - 1))] });
    const list = [];
    if (heroS) pieces(list, heroS, style(ICE, HM, 0.31, 0));
    if (coralS) pieces(list, coralS, style(CORAL, CM, 0.72, 0));
    tendrils(list, 1, t, a, CORAL);
    tendrils(list, -1, t, a, ICE);
    if (hx < x1 + 80) head(list, hx, 1, t, 1, ICE, HM);
    if (cx > x0 - 80) head(list, cx, -1, t, -1, CORAL, CM);
    list.sort((p, q) => q.d - p.d);
    for (const s of list) E.beams.push(s.pts, s.o);

    // lights: both beams pour hard colour onto the sea and the land behind
    E.light.line(new V(x0, H.y, H.cz), new V(Math.min(hx, x1), H.y, H.cz), ICE, 250);
    E.light.line(new V(Math.max(cx, x0), H.y, H.cz), new V(x1, H.y, H.cz), CORAL, 220);

    const C0 = new V(H.cx, H.y, H.cz);
    contactFlare(C0, a);
    sparks(a);
    if (a > 0) {
      // two drawn rings of pressure racing away down the axis, seen as ellipses in perspective
      for (let j = 0; j < 2; j++) {
        const ar = a - j * 0.13;
        if (ar <= 0 || ar >= 0.95) continue;
        const u = ar / 0.95, R0 = 34 + 120 * easeOut(u, 2.1), n = 110, dx = j % 2 ? -(40 + 190 * u) : 40 + 420 * u;
        const pts = [];
        for (let q = 0; q <= n; q++) { const th = (q / n) * Math.PI * 2; pts.push(new V(H.cx + dx, H.y + Math.sin(th) * R0, H.cz + Math.cos(th) * R0)); }
        E.beams.push(pts, { m: 0.9 + 1.5 * (1 - u), px: 1, color: j % 2 ? CORAL : ICE, hot: [1, 1, 1], power: 1.0 * (1 - u * u), core: 0.34, soft: 5, seed: j + 0.5, mode: 2 });
      }
      // arcs jumping between the two beams, redrawn on threes
      const R3 = new V(1, 0, 0), U3 = new V(0, 1, 0), D = Math.floor(t * 8);
      for (let i = 0; i < 7; i++) {
        if (hash(i, D, 3) < 0.35) continue;
        // only out in the middle distance: an arc next to the lens is a fat kinked stick
        const x = Math.max(E.camera.position.x + 430, H.cx + (hash(i, D, 4) - 0.5) * 2 * Math.min(Math.max(0, a * SPEED - 40), 620));
        const p = axisPoint(x, 1, t), q = axisPoint(x + hr(i, D, 5, -30, 30), -1, t);
        E.lines.push(boltPts(p, q, 300 + D * 7 + i, R3, U3, 0.22, 3), { px: 1.4, m: 0.9, width: (s) => 1 - 0.7 * Math.abs(s - 0.5), color: i % 2 ? ICE : CORAL, power: 1.5, soft: 4, mode: 2, bias: 0, rim: 0.2 });
      }
    }
    return true;
  }

  return { update, axisPoint };
}
