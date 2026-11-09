import { onTwos, noise1, clamp, lerp, smooth, invLerp } from './util.js';
import { bakeSpring, bakeChain, keyed, breathe } from './motion.js';
import { SET, DECK, deckY } from './folk-sets.js';

// BLACKOUT, the performances. Everything is a pure function of film time, sampled on twos. Principles, per creature:
//   weight over support, planted feet (explicit footfall lists, no foot moves unless it is lifted or marked as a slip),
//   anticipation before each action, overshoot and settle through baked springs, secondary motion on chains
//   (tail, goggles strap, apron panels), head stabilised against the body, breathing and tremor at rest.
// Poses: { pos, yaw, hip, hipRot, waist, spine, neck, head, legs:{L:{foot,yaw,pitch,pole}}, arms:{L:{target,pole,palm,fingerDir,curl..}}, face, ears, tailChain, strap, flaps }
// +X is the character's left, +Z forward; +pitch on the spine bends forward, +pitch on a foot drops the toe.

const PI = Math.PI;
const spr = (keys, t0, t1, freq = 5, damp = 0.5) => bakeSpring(keyed(keys), t1, { freq, damp, tStart: t0, x0: keys[0][1] });
const n1 = noise1;
const FACE = { look: [0, 0], pupil: 0.4, mouth: 0, jaw: 0, lid: 0, lidB: 0, tilt: 0, browUp: 0, browTilt: 0, wet: 0, smile: 0, teeth: 0, narrow: 0, ymouthK: 0.3, tear: 0, tear2: 0 };
const face = (o) => ({ ...FACE, ...o });
const add3 = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const lerp3 = (a, b, u) => [lerp(a[0], b[0], u), lerp(a[1], b[1], u), lerp(a[2], b[2], u)];
// blink: a lid closure that lasts about 0.2 s, faster down than up
const blinkAt = (t, at) => { const d = t - at; if (d < 0 || d > 0.22) return 0; return d < 0.06 ? d / 0.06 : d < 0.1 ? 1 : 1 - (d - 0.1) / 0.12; };
const blinks = (t, list) => list.reduce((m, a) => Math.max(m, blinkAt(t, a)), 0);

// ------------------------------------------------------------------ feet
// events[side]: [{ t: landing time, end: time the foot leaves again, p:[x,z], yaw, slip:{t0,t1,d:[dx,dz]}, lift, push }, ...]
// groundY(x,z) and surfacePitch(x,z,yaw) describe the ground under the foot.
function footState(evts, t, D, groundY, surfP) {
  let i = -1; while (i + 1 < evts.length && evts[i + 1].t <= t) i++;
  const fh = D.footH, fl = D.footL;
  const posOf = (e, tt) => {
    let [x, z] = e.p;
    if (e.slip) { const u = smooth(invLerp(e.slip.t0, e.slip.t1, tt)); x += e.slip.d[0] * u; z += e.slip.d[1] * u; }
    return [x, z];
  };
  const frame = (cx, cz, yaw, rel, base, g, lOv) => {
    // pivot on the heel when the toe is up, on the ball when the heel is up: the contact point does not move during the roll
    const l = lOv ?? (rel > 0 ? fl * 0.85 : (rel < 0 ? -fl * 0.2 : 0)), p = rel + base, c = Math.cos(p), s = Math.sin(p), sy = Math.sin(yaw), cy = Math.cos(yaw);
    const gx = cx + sy * l, gz = cz + cy * l, gy = g ?? groundY(gx, gz);
    // offset of (0,-fh,l) in foot space after pitch, then yaw
    const oy = -fh * c - l * s, oz = -fh * s + l * c;
    return { ankle: [gx - sy * oz, gy - oy, gz - cy * oz], pitch: p, contact: [gx, gy, gz] };
  };
  if (i < 0) { const e = evts[0]; const [x, z] = e.p; const f = frame(x, z, e.yaw, 0, surfP(x, z, e.yaw)); return { ...f, yaw: e.yaw, planted: true, swing: 0 }; }
  const a = evts[i], b = evts[i + 1];
  const end = a.end ?? Infinity;
  if (!b || t < end) {
    const [x, z] = posOf(a, t);
    const since = t - a.t, push = a.push ?? 0;
    let rel = 0;
    if (a.strike && since < 0.08) rel = -a.strike * (1 - since / 0.08);
    if (push && t > end - 0.09) rel = push * smooth((t - (end - 0.09)) / 0.09);
    if (a.toes != null) rel = Math.max(rel, typeof a.toes === 'function' ? a.toes(t) : a.toes);
    const f = frame(x, z, a.yaw, rel, surfP(x, z, a.yaw));
    const slipping = a.slip && t > a.slip.t0 && t < a.slip.t1;
    return { ...f, yaw: a.yaw, planted: !slipping, slip: !!slipping, swing: 0 };
  }
  // swing: an arc from the old contact to the new one, the toe hanging down early and lifting before the landing
  const u = clamp((t - end) / (b.t - end)), e = smooth(u);
  const [x0, z0] = posOf(a, end), [x1, z1] = b.p;
  const x = lerp(x0, x1, e), z = lerp(z0, z1, e), yaw = lerp(a.yaw, b.yaw, e);
  const lift = (b.lift ?? 0.12) * Math.pow(Math.sin(PI * Math.min(1, u * 1.05)), 0.8);
  const rel = lerp(a.push ?? 0.2, -(b.strike ?? 0), smooth(u));
  const g = lerp(groundY(x0, z0), groundY(x1, z1), e) + lift;
  const lPiv = lerp((a.push ?? 0) > 0 ? fl * 0.85 : 0, (b.strike ?? 0) > 0 ? -fl * 0.2 : 0, smooth(u));
  const f = frame(x, z, yaw, 0, surfP(x, z, yaw) + rel, g, lPiv);
  return { ankle: f.ankle, pitch: f.pitch, contact: f.contact, yaw, planted: false, swing: u };
}

// forward kinematics helpers for hand targets in the body frame
const bodyTo = (pos, yaw, x, y, z) => { const s = Math.sin(yaw), c = Math.cos(yaw); return [pos[0] + x * c + z * s, pos[1] + y, pos[2] - x * s + z * c]; };

const chainPose = (links, t) => links.map(([p, y]) => [p(t), y ? y(t) : 0]);

export function createPerformances(ctx, R, SETS) {
  const { CUES } = ctx;
  const boy = R.boy, girl = R.girl, chief = R.chief;

  // ================================================================ BOY, seated in cockpit A
  const A = SET.A, Aw = (x, y, z) => [A[0] + x, A[1] + y, A[2] + z];
  const GRIP_R = [-0.26, 0.785, 0.205], KNOB_L = [0.31, 0.86, 0.33];
  const seatLegs = (c = {}) => ({
    L: { foot: Aw(0.13, 0.32 + (c.fl ?? 0), 0.36), yaw: 0.1, pitch: 0.42, pole: Aw(0.4, 1.0, 1.6) },
    R: { foot: Aw(-0.13, 0.32 + (c.fr ?? 0), 0.36), yaw: -0.1, pitch: 0.42, pole: Aw(-0.4, 1.0, 1.6) },
  });
  const seatedArms = (o = {}) => ({
    L: { target: Aw(KNOB_L[0] + (o.lx ?? 0), KNOB_L[1] + 0.078 + (o.ly ?? 0), KNOB_L[2] - 0.05), pole: Aw(0.75, 0.4, -0.5), palm: [0, -1, 0], fingerDir: [0, -0.1, 1], palmW: 1, curl: o.curlL ?? 0.75, thumb: 0.8, spread: 0.1 },
    R: { target: Aw(GRIP_R[0] - 0.078 + (o.rx ?? 0), GRIP_R[1] + 0.012 + (o.ry ?? 0), GRIP_R[2] - 0.045 + (o.rz ?? 0)), pole: Aw(-0.8, 0.4, -0.5), palm: [1, 0, 0], fingerDir: [0, -0.04, 1], palmW: 1,
      curls: o.curlsR ?? [0.46, 0.9, 0.96, 0.98], thumb: o.thumbR ?? 0.85, spread: 0.02 },
  });
  const earsStill = [0, 0];
  const seatedBase = (c) => ({
    pos: Aw(0, 0, 0), yaw: 0, hip: [c.hx ?? 0, 0.55 + (c.hy ?? 0), -0.04 + (c.hz ?? 0)],
    hipRot: [-0.2 + (c.hp ?? 0), c.hyaw ?? 0, c.hr ?? 0], waist: [0.05 + (c.w ?? 0), 0, 0], spine: [0.16 + (c.s ?? 0), c.syaw ?? 0, c.sr ?? 0],
    neck: [0.02 + (c.n ?? 0), c.ny ?? 0, c.nr ?? 0], head: [-0.02 + (c.h ?? 0), c.hy2 ?? 0, c.hrz ?? 0], legs: seatLegs(), ears: c.ears ?? earsStill,
  });

  // s07 — fear held down: tiny fast breaths, a dart of the eyes, sweat, the swallow
  const S7 = (() => {
    const t0 = 13.5, t1 = 16.0, sw = 14.92;
    return {
      head: spr([[t0, 0.02], [sw - 0.36, 0.04], [sw - 0.14, 0.19], [sw + 0.04, -0.07], [sw + 0.26, 0.03], [t1, 0.05]], t0, t1, 6, 0.42),
      neck: spr([[t0, 0], [sw - 0.14, -0.05], [sw + 0.04, 0.06], [sw + 0.3, 0], [t1, 0]], t0, t1, 7, 0.5),
      hy: spr([[t0, 0], [sw - 0.14, -0.006], [sw + 0.04, 0.012], [sw + 0.3, 0], [t1, 0]], t0, t1, 7, 0.45),
      lookX: spr([[t0, -0.05], [14.05, -0.05], [14.14, -0.46], [14.5, -0.46], [14.6, 0.04], [t1, 0.06]], t0, t1, 16, 0.75),
      pup: keyed([[t0, 0.24], [14.2, 0.2], [sw + 0.08, 0.17], [t1, 0.2]]),
      lid: keyed([[t0, 0.1], [sw - 0.1, 0.18], [sw + 0.05, 0.26], [sw + 0.22, 0.13], [t1, 0.12]]),
      mouth: keyed([[t0, 0.0], [sw - 0.3, 0.03], [sw - 0.12, 0], [sw + 0.5, 0], [sw + 0.72, 0.06], [t1, 0.02]]),
    };
  })();
  function poseS7(t, q) {
    const c = S7, br = breathe(q, 0.86, 1), tr = (s, a) => n1(q * 17, s) * a;
    const P = seatedBase({ h: c.head(q) + tr(1, 0.006), n: c.neck(q), hy: c.hy(q) + br * 0.0035, s: br * 0.013, w: br * 0.006, hy2: -0.12 + tr(2, 0.009), hrz: tr(3, 0.006), ears: [-0.05 + tr(4, 0.03), 0.14 + tr(5, 0.02)] });
    P.arms = seatedArms({ curlL: 0.82 });
    P.pawWhite = 0.18;
    P.face = face({ look: [c.lookX(q), 0.06], pupil: c.pup(q), lid: c.lid(q), lidB: 0.14, tilt: 0.3, browUp: 0.4, browTilt: 0.34, mouth: c.mouth(q), narrow: 0.42, smile: -0.5, ymouthK: 0.12, blink: blinks(q, [13.95, 14.86, 15.6]) * 1, wet: 0.2, jaw: 0, detail: 1, sweat: invLerp(13.9, 15.7, q) });
    return P;
  }

  // s13 — the squeeze, seen on the paw
  const fire = CUES.fire1;
  const S13 = {
    index: spr([[27.5, 0.46], [28.0, 0.46], [28.3, 0.58], [fire - 0.04, 0.72], [fire + 0.07, 0.92], [fire + 0.5, 0.86], [29, 0.86]], 27.5, 29, 14, 0.6),
    hand: spr([[27.5, 0], [fire - 0.1, 0.006], [fire + 0.08, -0.012], [fire + 0.3, -0.004], [29, 0]], 27.5, 29, 9, 0.35),
  };
  function poseS13(t, q) {
    const P = seatedBase({ s: breathe(q, 0.8, 1) * 0.012 });
    const shake = invLerp(27.6, fire, q) * 0.0018;
    P.arms = seatedArms({ curlL: 0.85, curlsR: [S13.index(q), 0.92, 0.97, 1.0], thumbR: 0.9, rx: n1(q * 18, 2) * shake, ry: n1(q * 18, 3) * shake + S13.hand(q), rz: S13.hand(q) * 0.6 });
    P.pawWhite = 0.25;
    P.face = face({ pupil: 0.2, mouth: 0, teeth: 0.5, smile: -0.3, tilt: -0.1, browTilt: -0.2 });
    return P;
  }

  // s17 — thrown in the harness, then the gauge, horror turning into resolve
  const S17 = (() => {
    const t0 = 36.5, t1 = 39, hit = 36.56;
    return {
      hz: spr([[t0, 0], [hit, 0.0], [hit + 0.08, 0.06], [hit + 0.36, -0.015], [hit + 0.7, 0.006], [t1, 0.0]], t0, t1, 8, 0.28),
      hx: spr([[t0, 0], [hit + 0.08, 0.02], [hit + 0.4, -0.02], [hit + 0.9, 0.002], [t1, 0]], t0, t1, 6, 0.3),
      sp: spr([[t0, 0], [hit, 0], [hit + 0.1, 0.55], [hit + 0.42, -0.1], [hit + 0.9, 0.08], [t1, 0.05]], t0, t1, 6.5, 0.26),
      sr: spr([[t0, 0], [hit + 0.1, 0.16], [hit + 0.4, -0.14], [hit + 0.8, 0.02], [t1, 0]], t0, t1, 6, 0.3),
      nk: spr([[t0, 0], [hit + 0.05, -0.4], [hit + 0.2, 0.34], [hit + 0.5, -0.06], [hit + 1.0, 0.06], [t1, 0.02]], t0, t1, 7, 0.26),
      hd: spr([[t0, 0], [hit + 0.07, -0.3], [hit + 0.28, 0.3], [hit + 0.6, -0.12], [hit + 1.05, 0.03], [37.7, -0.1], [t1, 0.08]], t0, t1, 7, 0.3),
      hy2: spr([[t0, 0], [37.2, 0.02], [37.45, -0.62], [38.1, -0.58], [38.6, -0.3], [t1, -0.26]], t0, t1, 5, 0.55),
      lookX: spr([[t0, 0], [37.32, 0], [37.42, -0.62], [38.3, -0.62], [38.5, -0.28], [t1, -0.2]], t0, t1, 16, 0.75),
      pup: keyed([[t0, 0.16], [37.4, 0.12], [38.1, 0.16], [38.6, 0.3], [t1, 0.32]]),
      mouth: keyed([[t0, 0.1], [hit + 0.06, 1.4], [37.3, 0.9], [37.7, 0.3], [38.2, 0.0], [t1, 0]]),
      jaw: keyed([[t0, 0], [hit + 0.06, 0.36], [37.3, 0.2], [37.7, 0.04], [t1, 0]]),
      brow: keyed([[t0, 0.3], [37.6, 0.42], [38.1, 0.34], [38.55, -0.42], [t1, -0.52]]),
      browU: keyed([[t0, 0.7], [37.6, 0.6], [38.1, 0.2], [38.55, -0.5], [t1, -0.55]]),
      teeth: keyed([[t0, 0], [38.0, 0], [38.3, 0.5], [38.6, 0.72], [t1, 0.7]]),
      curl: keyed([[t0, 0.85], [hit + 0.05, 1], [37.4, 0.9], [38.4, 0.95], [t1, 1.0]]),
      wy: spr([[t0, 0], [hit + 0.1, -0.12], [hit + 0.5, 0.05], [t1, 0]], t0, t1, 5, 0.35),
    };
  })();
  function poseS17(t, q) {
    const c = S17, lt = q - 36.5, panic = Math.exp(-lt * 0.9), br = breathe(q, lerp(1.4, 0.7, panic), 1);
    const tr = (s) => n1(q * 15, s);
    const P = seatedBase({ hz: c.hz(q), hx: c.hx(q), w: c.sp(q) * 0.4 + br * 0.008, s: c.sp(q) * 0.7 + br * 0.02, sr: c.sr(q), n: c.nk(q) + tr(1) * 0.004, h: c.hd(q), hy2: c.hy2(q), syaw: c.wy(q), hrz: c.sr(q) * -0.5 + tr(2) * 0.006, ears: [-0.25 * panic - 0.1, 0.28 * panic + 0.1] });
    P.arms = seatedArms({ curlL: c.curl(q) });
    P.pawWhite = 0.4;
    P.face = face({ look: [c.lookX(q), 0.08], pupil: c.pup(q), lid: lt > 1.75 ? invLerp(38.3, 38.65, q) * 0.3 : 0, lidB: lt > 1.7 ? 0.28 : 0.04, tilt: c.brow(q) * 1.35, browUp: c.browU(q) * 1.15, browTilt: c.brow(q) * 1.35, mouth: c.mouth(q), jaw: c.jaw(q), teeth: c.teeth(q), smile: lt > 1.6 ? -0.12 : -0.9, narrow: 0, ymouthK: 0, blink: blinks(q, [37.58, 38.34]), detail: 1, wet: lerp(0.45, 0.2, invLerp(38.2, 38.7, q)), sweat: 1 });
    return P;
  }

  // s22 — fury: leaning into the grip, screaming at the gauge
  const S22 = (() => {
    const t0 = 50, t1 = 52;
    return {
      sp: spr([[t0, 0.05], [50.18, -0.08], [50.46, 0.3], [51.0, 0.25], [51.5, 0.34], [t1, 0.26]], t0, t1, 4.5, 0.42),
      nk: spr([[t0, 0], [50.18, 0.1], [50.46, 0.0], [t1, 0.02]], t0, t1, 6, 0.4),
      hd: spr([[t0, 0], [50.2, 0.2], [50.46, -0.14], [51.2, -0.12], [51.6, -0.18], [t1, -0.12]], t0, t1, 6, 0.4),
      mouth: spr([[t0, 0.2], [50.2, 0.05], [50.48, 1.12], [51.3, 1.04], [51.7, 1.16], [t1, 0.98]], t0, t1, 9, 0.5),
      jaw: spr([[t0, 0.02], [50.22, 0], [50.48, 0.34], [51.3, 0.3], [51.7, 0.36], [t1, 0.28]], t0, t1, 9, 0.5),
      hy: spr([[t0, 0], [50.2, -0.012], [50.46, 0.03], [t1, 0.02]], t0, t1, 6, 0.4),
    };
  })();
  function poseS22(t, q) {
    const c = S22, sh = (s, a) => n1(q * 20, s) * a, lt = q - 50;
    const P = seatedBase({ hy: c.hy(q), s: c.sp(q), w: c.sp(q) * 0.3, n: c.nk(q) + sh(1, 0.01), h: c.hd(q) + sh(2, 0.018), hy2: -0.16 + sh(3, 0.016), hrz: sh(4, 0.016), ears: [-0.42, 0.34], sr: sh(5, 0.012) });
    P.arms = seatedArms({ curlL: 1, curlsR: [0.95, 1, 1, 1], thumbR: 1, rx: sh(6, 0.0025), ry: sh(7, 0.0035), rz: sh(8, 0.0025) });
    P.pawWhite = 0.92;
    P.face = face({ look: [-0.2, 0.02], pupil: 0.13, lid: 0.3, lidB: 0.38, tilt: -1.15, browUp: -1.25, browTilt: -1.5, mouth: c.mouth(q), jaw: c.jaw(q), smile: -0.8, ymouthK: 0, wet: 0.55, detail: 1, sweat: 1 });
    void lt;
    return P;
  }

  // ================================================================ GIRL, reclined in cockpit B
  const B = SET.B, Bw = (x, y, z) => [B[0] + x, B[1] + y, B[2] + z];
  const girlBase = (c) => ({
    pos: Bw(0, 0, 0), yaw: 0, hip: [c.hx ?? 0, 0.68 + (c.hy ?? 0), 0.42 + (c.hz ?? 0)],
    hipRot: [-0.96 + (c.hp ?? 0), 0, c.hr ?? 0], waist: [0.05 + (c.w ?? 0), 0, 0], spine: [0.08 + (c.s ?? 0), c.syaw ?? 0, c.sr ?? 0],
    neck: [0.08 + (c.n ?? 0), c.ny ?? 0, c.nr ?? 0], head: [-0.02 + (c.h ?? 0), c.hy2 ?? 0, c.hrz ?? 0],
    legs: { L: { foot: Bw(0.15, 0.42, 0.97), yaw: 0.1, pitch: -0.1, pole: Bw(0.3, 1.5, 1.2) }, R: { foot: Bw(-0.15, 0.42, 0.97), yaw: -0.1, pitch: -0.1, pole: Bw(-0.3, 1.5, 1.2) } },
    ears: c.ears ?? [0, 0],
  });
  const girlArms = (o = {}) => ({
    L: { target: Bw(0.33, 0.97 + (o.ly ?? 0), 0.33), pole: Bw(0.8, 0.75, 0.35), palm: [-0.7, 0, 0.7], fingerDir: [0.1, 0.05, 1], palmW: 1, curl: o.curl ?? 0.78, thumb: 0.86, spread: 0.04 },
    R: { target: Bw(-0.33, 0.97 + (o.ry ?? 0), 0.33), pole: Bw(-0.8, 0.75, 0.35), palm: [0.7, 0, 0.7], fingerDir: [-0.1, 0.05, 1], palmW: 1, curl: o.curl ?? 0.78, thumb: 0.86, spread: 0.04 },
  });
  // s11 — eyes closed, then open. Nothing else moves but a slow breath.
  const S11 = (() => {
    const t0 = 23.5, t1 = 25.5, open = 24.55;
    return {
      lid: keyed([[t0, 1], [open - 0.05, 0.98], [open + 0.32, 0.5], [open + 0.48, 0.38], [open + 0.72, 0.32], [t1, 0.32]]),
      brow: spr([[t0, 0.02], [open - 0.1, 0.1], [open + 0.3, -0.05], [t1, -0.04]], t0, t1, 3.5, 0.7),
      ear: spr([[t0, 0.18], [open + 0.1, 0.18], [open + 0.44, -0.08], [t1, -0.03]], t0, t1, 7, 0.32),
      head: spr([[t0, 0.02], [open - 0.05, 0.05], [open + 0.34, -0.03], [t1, -0.015]], t0, t1, 3, 0.75),
      pup: keyed([[t0, 0.3], [open, 0.3], [open + 0.4, 0.24], [t1, 0.34]]),
    };
  })();
  function poseS11(t, q) {
    const c = S11, br = breathe(q + 0.7, 4.0, 1);
    const P = girlBase({ s: br * 0.028, w: br * 0.012, hy: br * 0.003, h: c.head(q), ears: [c.ear(q), 0] });
    P.arms = girlArms({ curl: 0.72 });
    P.tailChain = [[0.2, 0.1], [0.1, 0.1], [0.1, 0.05], [0.1, 0], [0.1, 0], [0.05, 0], [0.05, 0], [0, 0]];
    P.face = face({ lid: Math.max(c.lid(q), 0.24), pupil: c.pup(q), look: [0, 0.0], tilt: 0.08, browUp: c.brow(q), browTilt: 0.02, mouth: 0, smile: 0, narrow: 0.1, ymouthK: 0.16, detail: 1, wet: 0.08 });
    return P;
  }
  // s23 — holding on, the whole body shaking, teeth set
  function poseS23(t, q) {
    const lt = q - 52, sh = (s, a) => n1(q * 21, s) * a, grow = 0.6 + 0.4 * invLerp(0, 2.2, lt);
    // the seam gives at 1.1: a hit she takes in the neck; between hits the whole body shudders on twos
    const jolt = lt > 1.1 ? Math.exp(-(lt - 1.1) * 7) : 0, sag = 0.5 + 0.5 * Math.sin(lt * 3.1);
    const P = girlBase({ hy: sh(1, 0.022) * grow - 0.03 * jolt, hx: sh(2, 0.014) * grow, hz: sh(3, 0.014) * grow, s: 0.1 + 0.05 * sag + 0.1 * jolt + sh(4, 0.05) * grow, sr: sh(5, 0.05) * grow, h: 0.06 + 0.16 * jolt - 0.05 * sag + sh(6, 0.06) * grow, hy2: 0.3 + sh(7, 0.06) * grow, ny: 0.22, syaw: 0.04, hrz: 0.015 + sh(8, 0.045) * grow, ears: [-0.55 + sh(11, 0.1), 0.26 + sh(12, 0.1)] });
    P.arms = girlArms({ curl: 1, ly: sh(9, 0.008) * grow, ry: sh(10, 0.008) * grow });
    P.tailChain = [[0.2, 0.1], [0.1, 0.1], [0.1, 0.05], [0.1, 0], [0.1, 0], [0.05, 0], [0.05, 0], [0, 0]];
    P.pawWhite = 0.55;
    const wince = 0.5 + 0.5 * Math.sin(lt * 2.4);
    P.face = face({ lid: 0.3 + wince * 0.2, lidL: 0.34 + wince * 0.25 + sh(13, 0.05) + 0.35 * jolt, lidR: Math.min(1, 0.42 + wince * 0.18 + sh(14, 0.05) + 0.4 * jolt), lidB: 0.38, look: [0.04, 0.05], pupil: 0.22, tilt: -0.28, browUp: -0.45, browTilt: -0.46, mouth: 0, teeth: 0.92, smile: -0.25, narrow: 0, ymouthK: 0, detail: 1, wet: 0.22, sweat: 1 });
    return P;
  }

  // ================================================================ s29 — the run, the burn, the haul
  const TH0 = 68.5, TH1 = 72.0, hatchOpen = CUES.hatchOpen - TH0;     // lt seconds
  const DK = SET.DECK, Dw = (x, y, z) => [DK[0] + x, DK[1] + y, DK[2] + z];
  const D = boy.D;
  const speed = (u) => (u < 0.66 ? 4.6 : 4.6 * (1 - smooth(invLerp(0.66, 1.08, u))));
  const cumN = 1200, cum = new Float32Array(cumN + 1); for (let i = 1; i <= cumN; i++) cum[i] = cum[i - 1] + speed((i - 0.5) / cumN * 3) * (3 / cumN);
  const trav = (u) => { const f = clamp(u / 3, 0, 1) * cumN, i = Math.min(cumN - 1, Math.floor(f)); return cum[i] + (cum[i + 1] - cum[i]) * (f - i); };
  const ARRIVE = 1.16, Z0 = ARRIVE + trav(1.5);
  const runZ = (u) => Z0 - (u < 0 ? u * 4.6 : trav(u));
  const runX = (u) => -0.5 * (1 - smooth(invLerp(0.0, 1.05, u)));
  // yaw: he runs toward -Z; yaw PI faces -Z
  const FY = PI;
  const YL = FY + 0.14, YR = FY - 0.14;       // feet toe out a little
  const lead = 0.035;   // the foot lands slightly ahead of the centre of mass
  const stance = 0.1;
  const runFoot = (t, side) => { const u = t + lead; return { t, end: t + stance, p: [runX(u) + (side === 'L' ? -0.075 : 0.075), runZ(u)], yaw: side === 'L' ? YL : YR, strike: 0.28, push: 0.9, lift: 0.17 }; };
  const FE = {
    L: [
      runFoot(-0.24, 'L'), runFoot(0.225, 'L'), runFoot(0.695, 'L'),
      { t: 1.08, end: 1.8, p: [-0.12, 0.98], yaw: YL, strike: 0.3, lift: 0.12, slip: { t0: 1.08, t1: 1.2, d: [0.0, -0.05] }, toes: (t) => 0.75 * smooth(invLerp(1.14, 1.2, t)) * (1 - smooth(invLerp(1.26, 1.34, t))) },
      { t: 1.96, end: 2.53, p: [-0.1, 1.02], yaw: YL + 0.1, lift: 0.1, push: 0, slip: { t0: 2.1, t1: 2.26, d: [0.01, -0.14] }, toes: (t) => 0.35 * smooth(invLerp(2.0, 2.05, t)) * (1 - smooth(invLerp(2.4, 2.48, t))) },
      { t: 2.78, end: 3.22, p: [-0.15, 1.62], yaw: YL + 0.3, strike: 0.6, lift: 0.22 },
      { t: 3.46, p: [-0.16, 1.2], yaw: YL, lift: 0.14 },
    ],
    R: [
      runFoot(-0.008, 'R'), runFoot(0.46, 'R'),
      { t: 0.91, end: 1.32, p: [0.17, 1.18], yaw: YR, strike: 0.2, push: 0.3, lift: 0.17, toes: (t) => 0.35 * smooth(invLerp(1.08, 1.16, t)) },
      { t: 1.46, end: 1.62, p: [0.2, 1.54], yaw: YR, lift: 0.1, strike: 0.15 },
      { t: 1.8, end: 2.52, p: [0.18, 1.3], yaw: YR - 0.08, lift: 0.1, strike: 0.2, slip: { t0: 2.14, t1: 2.3, d: [0.0, -0.16] }, toes: (t) => 0.3 * (1 - smooth(invLerp(2.1, 2.2, t))) },
      { t: 2.82, end: 3.08, p: [0.24, 1.98], yaw: YR - 0.3, strike: 0.5, lift: 0.14 },
      { t: 3.3, p: [0.22, 1.5], yaw: YR, lift: 0.12 },
    ],
  };
  const groundD = (x, z) => deckY(x, z) + 0.008;
  const surfPitch = (x, z, yaw) => {
    // slope of the shell along the foot's forward direction: positive slope up means toe up (negative pitch)
    const fx = Math.sin(yaw), fz = Math.cos(yaw), dydf = -(x * fx + z * fz) / DECK.R;
    return -Math.atan(dydf);
  };
  const allLand = [...FE.L, ...FE.R].filter((e) => e.t < 1).map((e) => e.t).sort((a, b) => a - b);
  // the run's vertical: compressed in stance, ballistic in flight (lowest at mid-stance, highest mid-flight)
  const runBob = (u) => {
    if (u > 1.0) return 0;
    let last = allLand[0]; for (const l of allLand) if (l <= u) last = l;
    const next = allLand.find((l) => l > last) ?? last + 0.235, ph = u - last, st = stance, Tf = Math.max(0.05, next - last - st);
    if (ph < st) return -0.05 * Math.sin(PI * ph / st);
    return 0.03 * Math.sin(PI * clamp((ph - st) / Tf));
  };
  const runPhase = (u) => ((u + 0.008) / 0.47) * 2 * PI;    // R foot lands at phase 0 (mod 2pi)
  const runAmt = (u) => 1 - smooth(invLerp(0.76, 1.08, u));
  // whole-body keys (lt seconds)
  const K = {
    hy: spr([[-0.2, 0.47], [0.72, 0.47], [0.95, 0.45], [1.1, 0.42], [1.26, 0.44], [1.36, 0.45], [1.56, 0.46], [1.76, 0.42], [1.92, 0.385], [2.06, 0.33], [2.3, 0.27], [2.5, 0.25], [2.62, 0.21], [2.9, 0.14], [3.2, 0.2], [3.5, 0.34]], -0.2, 3.7, 6, 0.55),
    hz: spr([[-0.2, 0], [1.1, 0], [1.2, -0.03], [1.36, 0.1], [1.56, 0.1], [1.78, 0.02], [1.92, -0.03], [2.1, -0.08], [2.3, -0.12], [2.5, -0.04], [2.72, 0.72], [2.95, 0.9], [3.2, 0.62], [3.5, 0.22]], -0.2, 3.7, 6.5, 0.48),
    hx: spr([[-0.2, 0], [1.1, 0.02], [1.36, -0.03], [1.56, 0.08], [1.92, 0.0], [2.3, 0.03], [2.5, 0.02], [2.9, -0.04], [3.5, 0]], -0.2, 3.7, 5, 0.6),
    pitch: spr([[-0.2, 0.34], [0.7, 0.32], [0.95, -0.06], [1.1, 0.22], [1.27, 0.28], [1.36, -0.16], [1.56, 0.08], [1.78, 0.2], [1.92, 0.24], [2.08, 0.04], [2.3, -0.2], [2.5, -0.28], [2.72, -0.82], [2.95, -0.6], [3.2, 0.16], [3.5, 0.56]], -0.2, 3.7, 7, 0.42),
    waist: spr([[-0.2, 0.12], [0.8, 0.1], [1.1, 0.08], [1.36, -0.18], [1.6, 0.0], [1.92, 0.05], [2.3, -0.1], [2.5, -0.12], [2.72, 0.12], [3.0, 0.2], [3.5, 0.15]], -0.2, 3.7, 6, 0.42),
    spine: spr([[-0.2, 0.14], [0.8, 0.1], [1.1, 0.06], [1.36, -0.28], [1.6, -0.05], [1.92, 0.03], [2.3, -0.12], [2.5, -0.16], [2.72, 0.22], [3.0, 0.14], [3.5, 0.1]], -0.2, 3.7, 7, 0.42),
    headW: spr([[-0.2, 0.08], [0.95, 0.06], [1.1, 0.02], [1.3, 0.08], [1.42, -0.42], [1.62, 0.1], [1.82, 0.12], [1.95, 0.02], [2.3, -0.28], [2.5, -0.34], [2.68, -0.05], [2.95, 0.3], [3.2, 0.44], [3.5, 0.5]], -0.2, 3.7, 8, 0.45),
    bar: spr([[-0.2, 0.55], [1.94, 0.55], [2.06, 0.68], [2.14, 0.68], [2.3, 0.92], [2.38, 0.92], [2.5, 1.16]], -0.2, 2.51, 22, 0.8),
    weightY: keyed([[-0.2, 0], [1.0, 0], [1.2, 0.2], [1.4, 0], [1.9, 0], [2.3, 0.1], [3.7, 0]]),
  };
  const PIVOT = [0, 0.21, 0], BARL = 0.86;
  const barAngle = (u) => (u < 2.5 ? K.bar(u) : lerp(1.16, 1.55, smooth(invLerp(2.5, 2.58, u))));
  // hatch cover: flies up once the latch is free, slams to its stop and rattles
  const coverS = bakeSpring((t) => (t < hatchOpen ? 0 : 2.05), TH1 - TH0 + 0.2, { freq: 2.6, damp: 0.46, tStart: -0.1, x0: 0 });
  // before it gives, the lid fights him: it lifts a finger's width on each heave and slams back on its seat
  const coverResist = keyed([[1.16, 0], [1.22, 0.035], [1.3, 0], [2.04, 0], [2.1, 0.05], [2.17, 0.015], [2.26, 0.09], [2.34, 0.045], [2.46, 0.13], [2.5, 0.13]]);
  const coverA = (u) => Math.max(0, Math.min(2.24, Math.max(coverResist(u), u < hatchOpen ? 0 : coverS(u))));
  const barTop = (u, xoff = 0) => {
    // the lever rides on the lid: the lifted lid carries the pivot up and tips the bar back toward the hinge
    const c = coverResist(u), a = barAngle(u) - c, HZ = DECK.rHatch + 0.05, py = 0.13 + 0.08 * Math.cos(c) + HZ * Math.sin(c), pz = -HZ - 0.08 * Math.sin(c) + HZ * Math.cos(c);
    return Dw(xoff, py + Math.cos(a) * BARL, pz + Math.sin(a) * BARL);
  };
  const wBar = keyed([[0.26, 0], [1.14, 1], [1.27, 1], [1.4, 0], [1.66, 0], [1.9, 1], [2.5, 1], [2.58, 0]]);
  const curlK = keyed([[-0.2, 0.92], [0.9, 0.9], [1.04, 0.15], [1.11, 0.7], [1.26, 0.85], [1.33, 0.05], [1.6, 0.25], [1.76, 0.1], [1.91, 0.78], [2.0, 0.96], [2.5, 1], [2.56, 0.1], [2.9, 0.3], [3.5, 0.4]]);
  // chains: tail and goggle strap, driven by the body's motion
  const bodyVel = (u) => { const e = 1 / 60; return [(hipZ(u + e) - hipZ(u - e)) / (2 * e), (hipY(u + e) - hipY(u - e)) / (2 * e)]; };
  // keep the shoulders within arm's reach of the bar while the paws are on it: the hips give way before the arms overstretch
  const reachFix = (u) => {
    const w = smooth(wBar(u)); if (w <= 0) return 0;
    const z = ARRIVE + K.hz(u), y = K.hy(u), th = K.pitch(u) + K.waist(u) + K.spine(u) * 0.6, a = barAngle(u);
    const sz = z - Math.sin(th) * 0.44, sy = y + Math.cos(th) * 0.44, tz = Math.sin(a) * BARL, ty = PIVOT[1] + Math.cos(a) * BARL;
    const d = Math.hypot(sz - tz, sy - ty), ex = Math.max(0, d - 0.47);
    return -ex * ((sz - tz) / (d || 1)) * 1.15 * w;
  };
  const hipZ = (u) => (u < 1.12 ? runZ(u) + K.hz(u) : ARRIVE + K.hz(u)) + reachFix(u);
  const hipX = (u) => (u < 1.12 ? runX(u) * (1 - invLerp(1.0, 1.12, u)) + K.hx(u) : K.hx(u));
  const hipY = (u) => K.hy(u) + runBob(u) * runAmt(u);
  const pitchVel = (u) => { const e = 1 / 30; return (K.pitch(u + e) - K.pitch(u - e)) / (2 * e); };
  const tailP = bakeChain((u) => clamp(0.05 + 0.08 * bodyVel(u)[1] + 0.035 * pitchVel(u), -0.14, 0.22), 3.7, 7, { freq: 4.2, damp: 0.26, tStart: -0.2 });
  const tailY = bakeChain((u) => 0.17 * Math.sin(runPhase(u) - 0.5) * runAmt(u) + (u > 2.6 && u < 3.25 ? 0.08 * smooth(invLerp(2.6, 2.85, u)) : 0) + 0.04 * n1(u * 3, 9), 3.7, 7, { freq: 3.6, damp: 0.25, tStart: -0.2 });
  const strapP = bakeChain((u) => clamp(0.09 * bodyVel(u)[0] * -1 - 0.16 * bodyVel(u)[1], -1.4, 1.2), 3.7, 5, { freq: 6, damp: 0.25, tStart: -0.2 });
  const strapR = bakeChain((u) => 0.25 * Math.sin(runPhase(u)) * runAmt(u), 3.7, 5, { freq: 5, damp: 0.3, tStart: -0.2 });
  const earKick = bakeSpring((u) => clamp(-0.25 * bodyVel(u)[1], -0.5, 0.5), 3.7, { freq: 11, damp: 0.3, tStart: -0.2 });
  const shakeHaul = (u, s, a) => n1(u * 26, s) * a * (u > 1.95 && u < 2.5 ? 1 : 0);

  function poseS29(t, q) {
    const u = q - TH0;
    const hx = hipX(u), hz = hipZ(u), base = groundD(hx, hz);
    const run = runAmt(u), ph = runPhase(u);
    const twist = 0.2 * Math.sin(ph) * run, roll = 0.09 * Math.cos(ph) * run, sway = 0.024 * Math.cos(ph) * run;
    const hipYv = hipY(u);
    const yaw = FY + (u < 1.05 ? -0.22 * (1 - smooth(invLerp(0.0, 1.05, u))) : 0) + K.weightY(u) * 0;
    const pos = Dw(hx + sway * Math.cos(yaw), base, hz);
    const pitch = K.pitch(u), waist = K.waist(u) + 0.1 * Math.sin(ph * 2 + 0.6) * run, spine = K.spine(u) - 0.07 * Math.sin(ph * 2 + 0.6) * run;
    const shoulderYaw = -0.38 * Math.sin(ph) * run;
    // the head stays level against the body: its world pitch is keyed, the neck takes up the difference
    const headWorld = K.headW(u), bodyPitch = pitch + waist + spine + 0.07, nk = (headWorld - bodyPitch) * 0.42, hd = (headWorld - bodyPitch) * 0.58;
    const LF = footState(FE.L, u, D, groundD, surfPitch), RF = footState(FE.R, u, D, groundD, surfPitch);
    const footOut = (f, side) => ({ foot: Dw(f.ankle[0], f.ankle[1], f.ankle[2]), yaw: f.yaw - yaw, pitch: f.pitch, pole: bodyTo(pos, f.yaw, side * 0.14, hipYv * 0.8, 1.6), planted: f.planted, slip: f.slip, contact: Dw(...f.contact) });
    // hands: pumped in the run, on the bar, or thrown away from it
    const handT = (side) => {
      const sgn = side === 'L' ? 1 : -1, pump = Math.sin(ph) * (side === 'L' ? 1 : -1) * (1 - smooth(invLerp(0, 0.5, wBar(u))));
      const recoil = smooth(invLerp(1.27, 1.36, u)) * (1 - smooth(invLerp(1.6, 1.8, u)));
      const reachOut = u < 1.2 ? smooth(invLerp(0, 0.4, wBar(u))) : 0;   // on the way to the bar the paw travels low and in front, clear of the shoulder
      const fall = smooth(invLerp(2.5, 2.62, u));
      const bodyHand = [sgn * (0.19 - 0.03 * recoil + 0.1 * fall), hipYv + lerp(0.34, 0.27 + 0.13 * pump, run) - 0.1 * fall - 0.14 * reachOut, lerp(0.1, 0.02 + 0.19 * pump, run) + 0.26 * reachOut + 0.08 * recoil - 0.14 * fall];
      const bh = bodyTo(pos, yaw, ...bodyHand);
      // when he burns himself, the paws shake once
      if (recoil > 0.3) { bh[1] += n1(u * 30, sgn === 1 ? 3 : 4) * 0.018 * recoil; bh[0] += n1(u * 30, 5) * 0.012 * recoil; }
      const w = wBar(u);
      if (w <= 0) return { p: bh, w: 0 };
      const bt = barTop(u, -sgn * 0.22);        // his left hand on the world -X side of the bar
      // wrist sits behind the bar on the body side
      const elbowish = [bt[0] - bh[0], bt[1] - bh[1], bt[2] - bh[2]], L = Math.hypot(...elbowish) || 1;
      void L;
      const f = norm([bt[0] - pos[0] - 0, bt[1] - (pos[1] + hipYv + 0.5), bt[2] - pos[2]]);
      const wr = [bt[0] - f[0] * (D.hand * 1.05), bt[1] - f[1] * (D.hand * 1.05) + 0.05, bt[2] - f[2] * (D.hand * 1.05)];
      // while the bar is still out of reach the arms stretch out ahead of him, so the paw never folds in past the shoulder
      const leanT = pitch + waist + spine * 0.6, S = bodyTo(pos, yaw, sgn * 0.19, hipYv + Math.cos(leanT) * 0.44, Math.sin(leanT) * 0.44), toBar = [wr[0] - S[0], wr[1] - S[1], wr[2] - S[2]], dBar = Math.hypot(...toBar) || 1, kR = Math.min(1, 0.4 / dBar);
      const rp = [S[0] + toBar[0] * kR, S[1] + toBar[1] * kR, S[2] + toBar[2] * kR];
      const p = lerp3(bh, rp, smooth(invLerp(0, 0.62, w)));
      { const ant = smooth(invLerp(0.84, 0.98, u)) * (1 - smooth(invLerp(0.98, 1.1, u))) * 0.2; p[0] += (S[0] - p[0]) * ant; p[1] += (S[1] - 0.08 - p[1]) * ant; p[2] += (S[2] - p[2]) * ant; }
      p[0] += shakeHaul(u, sgn + 10, 0.004); p[1] += shakeHaul(u, sgn + 12, 0.006);
      return { p, w, f };
    };
    const hL = handT('L'), hR = handT('R');
    const curl = curlK(u);
    const arm = (h, sgn) => ({
      target: h.p, pole: lerp3(bodyTo(pos, yaw, sgn * 0.7, hipYv + 0.2, -0.75), bodyTo(pos, yaw, sgn * 0.95, hipYv - 0.05, 0.05), smooth(invLerp(0, 0.4, h.w))),   // elbows back in the run, down and out once he has the bar
      ...(h.f ? { palm: palmOf(h.f), fingerDir: h.f, palmW: smooth(h.w) } : {}),
      curl, thumb: lerp(0.3, curl, 0.8), spread: curl < 0.3 ? 0.5 : 0.08,
    });
    const shake = shakeHaul(u, 20, 0.018);
    const P = {
      pos, yaw, hip: [0, hipYv, 0], hipRot: [pitch, twist, roll], waist: [waist, -twist * 0.5, -roll * 0.5], spine: [spine, shoulderYaw + shake, -roll * 0.4],
      neck: [nk, twist * 0.2 - shoulderYaw * 0.4, 0], head: [hd + shake * 0.5, twist * 0.2 - shoulderYaw * 0.4, shake], legs: { L: footOut(LF, 1), R: footOut(RF, -1) },
      arms: { L: arm(hL, 1), R: arm(hR, -1) },
      ears: [-0.1 + earKick(u) * 0.8 - (u > 1.25 && u < 2.55 ? 0.25 : 0), 0.12], tailChain: chainPose(tailP.map((p, i) => [p, tailY[i]]), u).map((c, i) => { const W = smooth(invLerp(2.5, 2.62, u)) * (1 - smooth(invLerp(3.3, 3.62, u))); return [lerp(c[0], i ? 0.07 + c[0] * 0.2 : -pitch + 0.46, W), c[1]]; }), strap: strapP.map((p, i) => [-p(u) * 0.5, strapR[i](u) * 0.5]),
    };
    P.face = hatchFace(u);
    return P;
  }
  const norm = (v) => { const L = Math.hypot(...v) || 1; return [v[0] / L, v[1] / L, v[2] / L]; };
  const palmOf = (f) => {
    // the palm faces down toward the deck side of the bar: perpendicular to the finger direction
    const up = [0, 1, 0]; const d = f[0] * up[0] + f[1] * up[1] + f[2] * up[2];
    return norm([-up[0] + d * f[0], -up[1] + d * f[1], -up[2] + d * f[2]]);
  };
  function hatchFace(u) {
    const grab = smooth(invLerp(1.02, 1.12, u)) * (1 - smooth(invLerp(1.3, 1.36, u)));
    const burn = smooth(invLerp(1.2, 1.3, u)) * (1 - smooth(invLerp(1.6, 1.8, u)));
    const haul = smooth(invLerp(1.9, 2.0, u)) * (1 - smooth(invLerp(2.5, 2.6, u)));
    const fall = smooth(invLerp(2.5, 2.62, u)) * (1 - smooth(invLerp(3.0, 3.2, u)));
    const pre = smooth(invLerp(1.66, 1.82, u)) * (1 - smooth(invLerp(1.9, 2.0, u)));
    const opn = smooth(invLerp(2.26, 2.36, u));   // eyes squeezed shut through the first of the haul, then they snap open on the last of it
    const clench = Math.max(grab * 0.62, burn * 0.9, haul);
    return face({
      look: [0, 0.1 + 0.2 * smooth(invLerp(0.9, 1.1, u))], pupil: lerp(lerp(0.32, 0.2, burn), 0.18, haul),
      lid: lerp(lerp(lerp(0.05, 0.2, grab), 0.92, burn), lerp(1, 0.08, opn), haul), lidB: 0.05 + 0.3 * Math.max(burn, haul * (1 - opn)),
      tilt: lerp(lerp(-0.2, 0.5, burn), lerp(-0.7, -0.5, opn), haul), browUp: lerp(lerp(-0.25, 0.5, burn), lerp(-0.85, -0.45, opn), haul), browTilt: lerp(lerp(-0.3, 0.6, burn), -0.9, haul),
      mouth: Math.max(fall * 0.8, pre * 0.16, u < 1 ? 0.25 + 0.15 * Math.sin(u * 22) : 0) * (1 - Math.min(1, clench * 1.6)), jaw: Math.max(fall * 0.2, u < 1 ? 0.06 : 0), teeth: clench * (1 - fall), smile: -0.7, ymouthK: 0, wet: lerp(0.3, 0.55, haul), detail: 1, sweat: 1,
    });
  }

  // ================================================================ s30 — inside. The boy leans in; she opens her eyes.
  const S30 = (() => {
    const t0 = 72, t1 = 75;
    return {
      gLid: keyed([[t0, 1], [72.14, 1], [72.4, 0.6], [72.52, 0.42], [72.78, 0.26], [t1, 0.25]]),
      gHead: spr([[t0, 0.14], [72.2, 0.14], [72.6, 0.06], [t1, 0.04]], t0, t1, 3, 0.75),
      gSmile: keyed([[t0, 0], [CUES.smile, 0], [CUES.smile + 0.55, 0.28], [t1, 0.32]]),
      bLean: spr([[t0, 0], [72.3, 0.04], [72.9, -0.02], [t1, 0]], t0, t1, 4, 0.5),
      bMouth: keyed([[t0, 0.05], [72.7, 0.04], [73.2, 0.03], [t1, 0.03]]),
      bTears: keyed([[t0, 0.1], [72.7, 0.34], [73.4, 0.72], [t1, 0.9]]),
      tear2: keyed([[t0, 0], [72.75, 0.26], [73.45, 0.66], [t1, 0.82]]),
    };
  })();
  function poseS30Girl(t, q) {
    const c = S30, br = breathe(q, 2.1, 1);
    const P = girlBase({ s: br * 0.02, w: br * 0.01, h: c.gHead(q), hy2: 0.14, n: -0.06, ears: [0.15 - 0.2 * invLerp(72.2, 72.8, q), 0.05] });
    P.arms = { L: { target: Bw(0.25, 0.74, 0.5), pole: Bw(0.7, 0.7, 0.2), curl: 0.4, thumb: 0.3 }, R: { target: Bw(-0.25, 0.74, 0.5), pole: Bw(-0.7, 0.7, 0.2), curl: 0.4, thumb: 0.3 } };
    P.tailChain = [[0.2, 0.1], [0.1, 0.1], [0.1, 0.05], [0.1, 0], [0.1, 0], [0.05, 0], [0.05, 0], [0, 0]];
    P.face = face({ lid: c.gLid(q), pupil: 0.3, look: [0.05, 0.42], tilt: 0.3 * invLerp(72.8, 73.6, q), browUp: 0.06 + 0.3 * invLerp(72.8, 73.6, q), browTilt: 0.04 + 0.32 * invLerp(72.8, 73.6, q), mouth: 0, smile: c.gSmile(q), narrow: 0.3, ymouthK: 0.16, detail: 1, wet: 0.55 });
    return P;
  }
  function poseS30Boy(t, q) {
    const c = S30, sob = Math.pow(0.5 + 0.5 * Math.sin((q - 72) * 8.2), 3), H = SETS.B.H;
    // hanging into the hatch from the rim: chest over the collar, head down toward her, both paws braced on the rim
    const rim = (x, z) => Bw(H[0] + x, H[1] + 0.105, H[2] + z);
    const pos = Bw(H[0], H[1] + 0.26 + sob * 0.004, H[2] + 0.8);
    const P = {
      pos, yaw: PI, hip: [0, 0, 0], hipRot: [1.56 + c.bLean(q), 0, 0], waist: [0.06 + sob * 0.02, 0, 0], spine: [0.06 + sob * 0.04, 0, 0],
      neck: [-0.34 - sob * 0.02, 0, 0], head: [-0.4 + sob * 0.05, 0.05, sob * 0.02],
      legs: { L: { thigh: [-0.15, 0, 0.1], knee: 0.5 }, R: { thigh: [-0.2, 0, -0.1], knee: 0.65 } },
      arms: {
        L: { target: rim(-0.52, 0.34), pole: add3(pos, [-1.3, 0.8, -0.2]), palm: [0, -1, 0], fingerDir: [-0.85, 0, -0.5], palmW: 1, curl: 0.55, thumb: 0.7 },
        R: { target: rim(0.52, 0.34), pole: add3(pos, [1.3, 0.8, -0.2]), palm: [0, -1, 0], fingerDir: [0.85, 0, -0.5], palmW: 1, curl: 0.55, thumb: 0.7 },
      },
      ears: [0.15, 0.08], strap: [[0.15, 0], [0.1, 0], [0.05, 0], [0, 0], [0, 0]],
      tailChain: [[0.1, 0.1], [0.1, 0.1], [0, 0], [0, 0], [0, 0], [0, 0], [0, 0]],
    };
    const quiver = n1(q * 15, 31) * 0.1 * invLerp(72.7, 73, q);   // the corner of the mouth will not hold still
    P.face = face({ look: [0, -0.3 - 0.1 * invLerp(72, 73, q)], pupil: 0.46, lid: 0.08 + sob * 0.08, lidB: 0.24, tilt: 0.6, browUp: 0.5, browTilt: 0.82, mouth: c.bMouth(q), jaw: 0, smile: lerp(-0.2, 0.62, smooth(invLerp(72.75, 73.35, q))) + quiver, ymouthK: 0, wet: 1, tear: c.bTears(q), tear2: c.tear2(q), detail: 1, narrow: 0.42 });
    return P;
  }

  // ================================================================ s05 — the badger chief pulls the master lever
  const HT = SET.HUT, Hw = (x, y, z) => [HT[0] + x, HT[1] + y, HT[2] + z];
  const T5 = 8.0, T5e = 10.5;
  const hutLever = (u) => ang5(u);
  const ang5 = keyed([[0, 0.75], [0.55, 0.78], [0.92, 0.8], [1.04, 0.62], [1.4, -1.08], [1.44, -1.16], [1.56, -1.1], [1.72, -1.14], [2.5, -1.14]]);
  const CH = chief.D;
  const Hup = (u) => ang5(u);
  const leverTip = (u, xo) => { const L = SETS.hut.LEN, P0 = SETS.hut.PIV, a = Hup(u); return Hw(P0.x + xo, P0.y + Math.sin(a) * L, P0.z + Math.cos(a) * L); };
  const Ck = {
    hy: spr([[-0.2, 0.62], [0.55, 0.61], [0.94, 0.68], [1.06, 0.66], [1.42, 0.34], [1.54, 0.3], [1.8, 0.36], [2.5, 0.38]], -0.2, 2.8, 5, 0.46),
    hz: spr([[-0.2, -1.0], [0.55, -1.02], [0.94, -1.14], [1.42, -0.82], [1.6, -0.78], [2.5, -0.82]], -0.2, 2.8, 5, 0.5),
    hx: spr([[-0.2, 1.72], [0.55, 1.62], [0.94, 1.72], [1.42, 1.82], [2.5, 1.76]], -0.2, 2.8, 3, 0.6),
    pitch: spr([[-0.2, 0.06], [0.55, 0.02], [0.94, -0.2], [1.06, -0.12], [1.42, 0.4], [1.54, 0.46], [1.8, 0.34], [2.5, 0.32]], -0.2, 2.8, 5.5, 0.42),
    spine: spr([[-0.2, 0.0], [0.55, -0.05], [0.94, -0.32], [1.08, -0.1], [1.42, 0.16], [1.56, 0.22], [1.8, 0.12], [2.5, 0.1]], -0.2, 2.8, 6, 0.42),
    heels: keyed([[0, 0], [0.55, 0], [0.92, 0.72], [1.04, 0.72], [1.36, 0.08], [1.42, 0]]),
    hdW: spr([[-0.2, -0.32], [0.5, -0.46], [0.94, -0.66], [1.1, -0.4], [1.44, -0.22], [1.6, -0.12], [2.0, -0.12], [2.3, -0.08], [2.5, -0.06]], -0.2, 2.8, 5, 0.42),
    roll: spr([[-0.2, 0], [0.94, 0.04], [1.42, -0.06], [1.7, 0.03], [2.5, 0.01]], -0.2, 2.8, 3, 0.55),
    mouth: keyed([[0, 0.08], [0.82, 0.1], [0.94, 0.3], [1.08, 0.2], [1.4, 1.0], [1.6, 0.82], [2.1, 0.4], [2.5, 0.3]]),
  };
  const ChFeet = {
    L: [{ t: -1, p: [1.5, -1.16], yaw: PI + 0.16, toes: (t) => Ck.heels(t) }],
    R: [{ t: -1, p: [1.96, -0.9], yaw: PI - 0.16, toes: (t) => Ck.heels(t) * 0.85 }],
  };
  const groundH = () => 0, flatP = () => 0;
  const bulbTurn = spr([[-0.2, 0], [1.56, 0], [1.9, 1], [2.8, 1]], -0.2, 2.8, 4.5, 0.55);
  const motionVy = (u) => (Ck.hy(u + 0.016) - Ck.hy(u - 0.016)) / 0.032;
  const apronS = [0, 1, 2].map((i) => bakeChain((u) => clamp(-0.32 * motionVy(u) + 0.08 * Ck.pitch(u) - 0.05 * i, -0.8, 0.9), 2.8, 2, { freq: 3.8 - i * 0.2, damp: 0.3, tStart: -0.2 }));
  const chTail = bakeChain((u) => clamp(0.36 * motionVy(u), -0.6, 0.6), 2.8, 3, { freq: 6, damp: 0.3, tStart: -0.2 });
  const chStrap = bakeChain((u) => clamp(-0.45 * motionVy(u), -1, 1), 2.8, 4, { freq: 5, damp: 0.25, tStart: -0.2 });
  const chEar = bakeSpring((u) => clamp(-0.3 * motionVy(u), -0.5, 0.5), 2.8, { freq: 9, damp: 0.32, tStart: -0.2 });
  function poseChief(t, q) {
    const u = q - T5;
    const fixZ = (() => {
      // whole-body reach: the hips are pulled toward the lever if the arms would overstretch
      const z = Ck.hz(u), y = Ck.hy(u), th = Ck.pitch(u) + Ck.spine(u) * 0.8, tip = leverTip(u, 0);
      const sz = z - Math.sin(th) * 0.62, sy = y + Math.cos(th) * 0.62, tz = tip[2] - HT[2], ty = tip[1] - HT[1];
      const d = Math.hypot(sz - tz, sy - ty), ex = Math.max(0, d - 0.56);
      return -ex * (sz - tz) / (d || 1);
    })();
    const hx = Ck.hx(u), hz = Ck.hz(u) + fixZ, hy = Ck.hy(u) + breathe(u, u > 1.6 ? 0.62 : 2.4, 1) * (u > 1.6 ? 0.012 : 0.004);
    const pitch = Ck.pitch(u), spine = Ck.spine(u), pant = u > 1.55 ? breathe(u, 0.62, 1) * 0.04 : breathe(u, 2.4, 1) * 0.012;
    const bulbLook = bulbTurn(u);
    const headW = Ck.hdW(u), bodyP = pitch + spine + 0.06, nk = (headW - bodyP) * 0.4, hd = (headW - bodyP) * 0.6;
    const pos = Hw(hx, 0, hz);
    const L = footState(ChFeet.L, u, CH, groundH, flatP), R = footState(ChFeet.R, u, CH, groundH, flatP);
    const f = (st, sd) => ({ foot: Hw(...st.ankle), yaw: st.yaw - PI, pitch: st.pitch, pole: Hw(sd * 0.3 + hx, 0.55, hz - 1.4), planted: st.planted, contact: Hw(...st.contact) });
    const hand = (sd) => {
      // hands stay shut on the handle the whole time: the wrists follow the lever tip exactly
      const tip = leverTip(u, sd * -0.15);
      const a = Hup(u);
      const fdir = norm([0, -Math.cos(a) * 0.3 - 0.3 + Math.sin(a) * 0.6, -Math.cos(a) * 0.5 - 0.4]);
      void fdir;
      const body = Hw(hx, hy + 0.9, hz);
      const dir = norm([tip[0] - body[0], tip[1] - body[1], tip[2] - body[2]]);
      return { target: [tip[0] - dir[0] * CH.hand * 1.1, tip[1] - dir[1] * CH.hand * 1.1, tip[2] - dir[2] * CH.hand * 1.1], pole: Hw(hx - sd * 1.1, hy + 0.15, hz + 0.25), palm: palmOf(dir), fingerDir: dir, palmW: 1, curl: 0.92, thumb: 0.9, spread: 0.03 };
    };
    const P = {
      pos, yaw: PI, hip: [0, hy, 0], hipRot: [pitch, 0, Ck.roll(u)], waist: [spine * 0.45 + pant * 0.3, 0, 0], spine: [spine * 0.55 + pant, 0, -Ck.roll(u) * 0.5],
      neck: [nk - 0.04 * bulbLook, -0.4 * bulbLook, 0], head: [hd - 0.08 * bulbLook, -0.1 - 0.72 * bulbLook, 0.06 * bulbLook], legs: { L: f(L, 1), R: f(R, -1) }, arms: { L: hand(1), R: hand(-1) },
      ears: [-0.1 + chEar(u), 0.04], tailChain: chTail.map((c) => [-0.2 + c(u), 0]), strap: chStrap.map((c) => [-c(u) * 0.5, 0]),
      flaps: apronS.map((c) => [clamp(c[0](u), -0.8, 0.9), clamp(c[1](u) - c[0](u) * 0.5, -0.6, 0.6)]),
    };
    P.face = face({ look: [-0.05, 0.3 - 0.45 * smooth(invLerp(1.1, 1.5, u))], pupil: 0.26, lid: lerp(0.3, 0.5, smooth(invLerp(1.2, 1.4, u))) * (u > 1.7 ? 0.7 : 1), lidB: 0.24, tilt: -0.4, browUp: -0.7, browTilt: -0.7, mouth: Ck.mouth(u), jaw: Ck.mouth(u) * 0.28, teeth: 0, smile: -0.6, ymouthK: 0 });
    return P;
  }
  // the breakers: row by row from the top, each column a beat later, the last row with the master
  const breakerT = (r, c) => T5 + 0.08 + (6 - r) * 0.226 + c * 0.012;
  const CREWB = [spr([[7.8, 0.95], [9.3, 0.95], [9.62, 0.1], [10.8, 0.1]], 7.8, 10.8, 6, 0.5), spr([[7.8, 0.95], [9.56, 0.95], [9.86, 0.75], [10.8, 0.8]], 7.8, 10.8, 6, 0.5)];
  const crewPose = (i, q) => {
    const spot = [[-3.3, -1.42, PI + 0.1], [-0.5, -1.4, PI - 0.1], [-2.0, 1.2, 0.05]][i];
    const [x, z, yaw] = spot;
    const reach = i === 2 ? 0 : smooth(invLerp(8.25 + i * 0.5, 8.5 + i * 0.5, q)) * (1 - smooth(invLerp(9.4 + i * 0.1, 9.7 + i * 0.1, q)));
    const breathing = breathe(q + i * 0.7, 2.2 + 0.3 * i, 1);
    const pos = Hw(x, 0, z);
    const bt = (lx, ly, lz) => bodyTo(pos, yaw, lx, ly, lz);
    const handUp = i === 2 ? 0.95 : 1.0 + reach * 0.45;
    // the two at the wall keep a hand on the breakers and look back over the shoulder for the chief's signal; the sheep holds it longest
    const back = i === 2 ? 0 : CREWB[i](q);
    const P = {
      pos, yaw, hip: [0, 0.76 + breathing * 0.005, 0], hipRot: [0.05, 0, 0], spine: [0.08 + reach * 0.12 * (1 - back) + breathing * 0.015, 0.1 * (i - 1) - 0.34 * back, 0], neck: [0, -0.5 * back, 0], head: [-0.1 - reach * 0.2 * (1 - back), 0.15 * (i - 1) * (1 - back) + 0.1 * Math.sin(q * 1.2 + i) * (1 - back) - 0.8 * back, 0.08 * back],
      legs: { L: { foot: bt(0.12, 0.07, 0.0), yaw: 0.1, pitch: 0 }, R: { foot: bt(-0.12, 0.07, -0.05), yaw: -0.1, pitch: 0 } },
      arms: { L: { sh: [-0.3, 0, 0.14], el: 0.9, curl: 0.5 }, R: i === 2 ? { target: bt(-0.26, 0.96, 0.42), pole: bt(-0.6, 0.6, -0.4), curl: 0.3 } : { target: bt(-0.24, handUp, 0.33 + reach * 0.08), pole: bt(-0.9, 0.7, 0.0), curl: 0.3 + reach * 0.4 } },
      ears: [0, 0], tail: [0.1 * Math.sin(q * 1.8 + i), 0],
      face: face({ look: [0, 0.14], pupil: 0.36, lid: 0.04, mouth: 0.05 + reach * 0.1, tilt: 0.3, browUp: 0.3, browTilt: 0.3, smile: -0.35, ymouthK: 0.2 }),
    };
    return P;
  };

  // lamp child (s02): only the silhouette: looks up at the ring, one small step of the head, the paw rises to the pane
  const LC = {
    head: spr([[3, 0], [3.3, -0.05], [3.62, 0.4], [4.1, 0.42], [4.5, 0.42]], 3, 4.5, 5, 0.42),
    sway: spr([[3, 0], [3.3, -0.018], [3.62, 0.012], [4.5, 0.0]], 3, 4.5, 3, 0.5),
    hand: spr([[3, 0], [3.6, 0.0], [3.9, 0.9], [4.5, 1.0]], 3, 4.5, 6, 0.42),
  };
  // s32: lamp back on; the child's head was bowed, it dips, comes up toward the outside light with an overshoot, and one small wave
  const LE = {
    head: spr([[77.5, -0.14], [78.5, -0.14], [78.58, -0.2], [78.84, 0.58], [79.4, 0.5]], 77.5, 79.4, 7, 0.45),
    sway: spr([[77.5, 0], [78.5, 0], [78.58, -0.012], [78.84, 0.018], [79.4, 0.008]], 77.5, 79.4, 5, 0.5),
    hand: spr([[77.5, 0], [78.62, 0], [78.82, 1.9], [79.4, 2.0]], 77.5, 79.4, 8, 0.5),
  };
  const lampChild = (t) => { const q = onTwos(t); if (t >= 77.5) return { head: LE.head(q), sway: LE.sway(q), hand: LE.hand(q), wave: Math.sin((q - 78.8) * 2 * PI * 2.6) * smooth(invLerp(78.76, 78.86, q)), breath: breathe(q, 2.2, 1) }; return { head: LC.head(q), sway: LC.sway(q), hand: LC.hand(q), breath: breathe(q, 2.2, 1) }; };

  return {
    poseFor(st) {
      // returns which rigs are visible and their poses for this frame
      const t = st.t, q = onTwos(t), sid = st.sid, out = { boy: null, girl: null, chief: null, crew: null };
      if (sid === 's07') out.boy = poseS7(t, q);
      else if (sid === 's13') out.boy = poseS13(t, q);
      else if (sid === 's17') out.boy = poseS17(t, q);
      else if (sid === 's22') out.boy = poseS22(t, q);
      else if (sid === 's11') out.girl = poseS11(t, q);
      else if (sid === 's23') out.girl = poseS23(t, q);
      else if (sid === 's29') out.boy = poseS29(t, q);
      else if (sid === 's30') { out.boy = poseS30Boy(t, q); out.girl = poseS30Girl(t, q); }
      else if (sid === 's05') { out.chief = poseChief(t, q); out.crew = [0, 1, 2].map((i) => (i === 2 && st.lt >= 1.72 ? null : crewPose(i, q))); }   // the hare steps out of the close-up: he would stand on the chief's head
      return out;
    },
    fns: { barAngle, coverA, coverResist, breakerT, hutLever, lampChild, ang5, T5, TH0 },
  };
}
