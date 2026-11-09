import { CUES } from './shots.js';
import { bakeSpring, keyed, breathe } from './motion.js';
import { lerp, clamp, smooth, smoother, easeIn, easeOut, easeInOut, invLerp, noise1, track } from './util.js';
import { SHOVE, SLAM_T, TORTOISE_STANCE as ST, TORTOISE_WAIT as WT } from './mech-map.js';

// MECH dept: the whole performance as pure functions of film time. Springs are baked once at load (motion.js), frames render in any order.
export const END = CUES.end + 0.5;

// ------------------------------------------------------------------ the gun
export const FIRE1 = CUES.muzzle, FIRE2 = CUES.fire2;
const recoilOne = (u, A) => (u < 0 ? 0 : A * (1 - Math.exp(-u * 34)) * Math.exp(-u * 1.05));
export const slideZ = (t) => -(recoilOne(t - FIRE1, 7.5) + recoilOne(t - FIRE2, 12));
// the bed bucks a little with every shot
export const bedKick = (t) => {
  const a = t - FIRE1, b = t - FIRE2;
  return (a >= 0 ? 0.55 * Math.exp(-a * 3.5) * Math.sin(a * 42) : 0) + (b >= 0 ? 0.8 * Math.exp(-b * 3) * Math.sin(b * 38) : 0);
};
// hammer: 85 deg = resting forward on the striker, -52 deg = cocked. Rises at CUES.hammer, falls at fire1; re-cocked unseen, falls just before fire2.
export const hammerAngle = bakeSpring(keyed([
  [0, 85], [CUES.hammer - 0.15, 85], [CUES.hammer + 0.05, 93], [CUES.hammer + 1.6, -52], [CUES.fire1 - 0.04, -52], [CUES.fire1 + 0.08, 86],
  [CUES.fire1 + 0.3, 80], [CUES.recharge + 1.5, 85], [CUES.recharge + 4, -52], [CUES.fire2 - 0.34, -52], [CUES.fire2 - 0.22, 86], [CUES.fire2 + 0.1, 80], [CUES.end, 85],
]), END, { freq: 7, damp: 0.5 });
export const fanSpeed = (t) => {
  const on = smooth(invLerp(5.5, 9, t));
  const f1 = smooth(invLerp(CUES.recharge, CUES.recharge + 2, t)), f2 = 0.5 * (1 - smooth(invLerp(CUES.fire2 + 6, CUES.silence + 1.5, t)));
  return on * (9 + 7 * f1) * (t > CUES.fire2 ? 0.35 + f2 : 1);
};
// cumulative fan phase, integrated at build
const fanTab = (() => { const a = new Float32Array(Math.ceil(END * 24) + 2); let s = 0; for (let i = 0; i < a.length; i++) { a[i] = s; s += fanSpeed(i / 24) / 24; } return a; })();
export const fanPhase = (t) => { const f = Math.min(fanTab.length - 1.001, Math.max(0, t * 24)), i = Math.floor(f); return fanTab[i] + (fanTab[i + 1] - fanTab[i]) * (f - i); };

// the counter on the hull
// hook push-in: a steady zoom from f48, with an extra ease-in from f61, the ring 1.5x on f71
const F71 = 71 / 24;
export const s01cZoom = (t) => { const u = clamp((t - 2) / (F71 - 2), 0, 1), e = Math.max(0, (u - 0.54) / 0.46); return 1 + 0.5 * (0.62 * u + 0.38 * e * e); };
export function powerPct(t) {
  if (t < 3.2 && t >= 2) {           // the country's power pouring in: 12 at f48, 41 at f71, a tick every frame or two, the last digit flickering
    return Math.round(lerp(12, 41, clamp((Math.round(t * 24) - 48) / 23, 0, 1)));
  }
  if (t < 2) return 12;
  if (t < FIRE1) return Math.min(99, Math.round(lerp(41, 99, smooth(invLerp(3.2, FIRE1 - 0.6, t)))));
  if (t < FIRE1 + 0.25) return 100;
  if (t < FIRE2) return Math.min(99, Math.round(lerp(0, 99, smooth(invLerp(CUES.recharge + 0.5, FIRE2 - 0.6, t)))));
  if (t < FIRE2 + 0.25) return 100;
  return 0;
}
// ice-blue charge of the second shot: builds through the last seconds of s24, peaks with the shot, bleeds off through s26
export const chargeK = (t) => clamp(smooth(invLerp(FIRE2 - 1.9, FIRE2 - 0.25, t)) * (1 - smooth(invLerp(FIRE2 + 1.1, FIRE2 + 3.4, t))), 0, 1);
export const seamFront = (t) => {
  if (t >= FIRE2) return lerp(-22, 192, easeIn(invLerp(FIRE2, FIRE2 + 0.62, t)));   // the shot climbs the barrel as a bright front
  if (t >= FIRE2 - 1.9) return lerp(-22, 192, smooth(invLerp(FIRE2 - 1.9, FIRE2 - 0.3, t)));
  return lerp(-22, 192, smooth(invLerp(1.5, 2.0, t)));
};
export const seamK = (t) => {
  if (t < 1.45) return 0;
  const fade = 1 - 0.75 * smooth(invLerp(3.2, 9, t));
  const f1 = 1 - smooth(invLerp(FIRE1, FIRE1 + 0.5, t));
  return Math.max(clamp(fade * (t > CUES.recharge + 2 ? Math.max(f1, 0.45) : f1), 0, 1), chargeK(t));
};
export const barrelHeat = (t) => {
  const a = t - FIRE1, b = t - FIRE2;
  return Math.max(a > 0 ? Math.exp(-a * 0.32) * 0.9 : 0, b > 0 ? Math.exp(-b * 0.13) : 0);
};

// ------------------------------------------------------------------ Heron
const HT = {
  leanS: 10.6, leanE: 12.2,
};
const leanT = keyed([[0, 0], [HT.leanS, 0], [HT.leanS + 0.3, -0.12], [HT.leanE, 1], [CUES.end, 1]]);
// ride the recoil: chest is shoved back, head lags, pelvis follows on a slower spring; after the shot it settles with overshoot
const recoilSrc = (t) => slideZ(t);
export const heronChestZ = bakeSpring((t) => recoilSrc(t) * 0.24, END, { freq: 1.6, damp: 0.42 });
export const heronPelvisZ = bakeSpring((t) => recoilSrc(t) * 0.11, END, { freq: 0.9, damp: 0.5 });
export const heronHeadLag = bakeSpring((t) => recoilSrc(t) * 0.14, END, { freq: 1.1, damp: 0.34 });
export const heronSink = bakeSpring((t) => Math.abs(recoilSrc(t)) * 0.08, END, { freq: 1.3, damp: 0.55 });
// body-wide slow settling: weight onto the planted knee
export const heronLean = bakeSpring(leanT, END, { freq: 1.2, damp: 0.6 });
const slumpT = keyed([[0, 0], [CUES.silence - 0.1, 0], [CUES.silence + 2.6, 1], [CUES.end, 1]]);
export const heronSlump = bakeSpring(slumpT, END, { freq: 0.8, damp: 0.75 });
// the pilot is spent: the fore hand slides off its grip first, the rear hand a beat later; each arm falls with weight and bounces once
export const heronReleaseL = bakeSpring(keyed([[0, 0], [CUES.silence + 0.15, 0], [CUES.silence + 1.5, 1], [CUES.end, 1]]), END, { freq: 1.3, damp: 0.5 });
export const heronReleaseR = bakeSpring(keyed([[0, 0], [CUES.silence + 0.95, 0], [CUES.silence + 2.3, 1], [CUES.end, 1]]), END, { freq: 1.1, damp: 0.55 });
export const heronHammerFlinch = (t) => {
  const a = t - CUES.hammer;
  return a > 0 && a < 2 ? Math.exp(-a * 2.5) * Math.sin(a * 11) * 0.5 : 0;
};
export function quake(t) {                // ground shake envelope from big impacts (fx hits)
  const hits = [[CUES.impact + 0.05, 1.0], [SLAM_T, 0.9]];
  let e = 0; for (const [h, a] of hits) if (t >= h) e = Math.max(e, a * Math.exp(-(t - h) * 1.8));
  return e;
}
export const heronBreath = (t) => breathe(t, 4.2, 1);
// small servo corrections: the target jumps every second or so, the joint snaps there and settles
const servoStep = (ch) => (t) => { const k = Math.floor((t + ch * 0.7) / 1.35), n = Math.sin(k * 12.9898 + ch * 78.233) * 43758.5453; return (n - Math.floor(n)) * 2 - 1; };
const servos = [0, 1, 2].map((ch) => bakeSpring(servoStep(ch + 1), END, { freq: 5, damp: 0.38 }));
export const heronServo = (ch, t) => servos[ch](t);

// ------------------------------------------------------------------ Tortoise: the jump, the plant, the shove
export const TT = { inhale: 43.4, crouchS: 43.72, crouchE: 44.14, launch: 44.2, air: 44.36, land: 45.3, plant2: 45.37, slam: SLAM_T, melt: CUES.melt, gone: CUES.shieldGone, collapse: 59.6, collapsed: 63.2 };
const S_W = { x: WT.x, z: WT.z }, S_S = { x: ST.x, z: ST.z };

// the shove: a huge kick then jolts as the beam bites: pure keyed curve, then a spring so the mass never starts or stops dead
const shoveKeys = keyed([[0, 0], [TT.slam - 0.02, 0], [TT.slam + 0.42, 0.3], [47.1, 0.34], [47.5, 0.44], [48.5, 0.47], [49.0, 0.57], [50.2, 0.61], [50.75, 0.72], [52.0, 0.75], [52.6, 0.86], [53.8, 0.9], [54.5, 1], [CUES.end, 1]]);
const shoveT = bakeSpring((t) => shoveKeys(t) * SHOVE, END, { freq: 2.2, damp: 0.68 });
export const shove = (t) => shoveT(t);
export const footShove = (side, t) => shoveT(t - (side ? 0.1 : 0.2));          // feet lag: one bites, then the other

// pelvis height above the pad, target curve (no spring; authored overshoots)
// waits low beside the gun with the shield at its side; rises as s19 ends, which also starts the jump's wind-up
export const kneelK = (t) => 1 - smooth(invLerp(42.75, TT.inhale + 0.05, t));
function pelvisTargetY(t) {
  const stand = 16.4 + breathe(t, 3.7, 0.08);
  if (t < TT.inhale) return lerp(stand, 9.6, kneelK(t));
  if (t < TT.crouchS) return stand + 1.2 * easeOut((t - TT.inhale) / (TT.crouchS - TT.inhale), 2);   // draws itself up first
  if (t < TT.crouchE) return lerp(stand + 1.2, 7.2, easeInOut((t - TT.crouchS) / (TT.crouchE - TT.crouchS), 2));   // 10-frame squash
  if (t < TT.launch) return 7.2 + 0.14 * Math.sin((t - TT.crouchE) * 70);   // loaded: a tremor in the legs before they let go
  if (t < TT.air) return lerp(7.2, 17.8, easeIn((t - TT.launch) / (TT.air - TT.launch), 1.5));
  if (t < TT.land) { const u = (t - TT.air) / (TT.land - TT.air); return lerp(17.8, 18.0, u) + 4 * 13.5 * u * (1 - u); }   // ballistic
  const a = t - TT.land, end = TT.slam - TT.land;
  if (a < 0.24) return lerp(18.0, 6.6, easeOut(a / 0.24, 2.0));     // knees take it
  if (a < 0.36) return lerp(6.6, 11.4, smooth((a - 0.24) / 0.12));  // rebound
  if (t < TT.slam) return lerp(11.4, 10.0, smooth((a - 0.36) / (end - 0.36)));
  return 11.0;
}
const pelvisYT = bakeSpring(pelvisTargetY, END, { freq: 7, damp: 0.72 });
const pelvisBraceY = keyed([[0, 0], [TT.slam, 0], [TT.slam + 0.25, -2.6], [TT.slam + 1.2, -2.0], [TT.melt, -1.4], [TT.gone, -2.2], [TT.gone + 0.55, -4.0], [TT.gone + 1.1, -2.4], [TT.gone + 1.7, -4.6], [TT.gone + 2.4, -2.2], [TT.collapse, -2.9], [TT.collapsed, -6.2], [CUES.end, -8.1]]);
const pelvisBrace = bakeSpring(pelvisBraceY, END, { freq: 2.2, damp: 0.6 });

function pelvisXZ(t) {
  if (t < TT.launch) return [S_W.x, S_W.z];
  if (t >= TT.land) return [S_S.x, S_S.z - shoveT(t)];
  const P0 = 0.09;   // how far of the trip the push covers while the feet are still down
  if (t < TT.air) { const k = P0 * easeIn((t - TT.launch) / (TT.air - TT.launch), 1.6); return [lerp(S_W.x, S_S.x, k), lerp(S_W.z, S_S.z, k)]; }
  const u = P0 + (1 - P0) * clamp((t - TT.air) / (TT.land - TT.air));   // no force in the air: constant speed in plan
  return [lerp(S_W.x, S_S.x, u), lerp(S_W.z, S_S.z, u)];
}
// torso pitch (+ forward): keyed then springs so each joint arrives a beat late
const pitchKeys = keyed([[0, 16], [42.75, 16], [TT.inhale, 3], [TT.crouchS, -5], [TT.crouchE - 0.06, 36], [TT.launch, 36], [TT.air, -16], [TT.air + 0.42, 20], [TT.land - 0.06, -12], [TT.land + 0.24, 34], [TT.land + 0.36, 10], [TT.slam, 14], [TT.slam + 0.3, -10], [47, 10], [TT.gone, 16], [TT.gone + 0.55, 25], [TT.gone + 1.1, 15], [TT.gone + 1.7, 27], [TT.gone + 2.4, 12], [TT.collapse, 22], [TT.collapsed, 44], [CUES.end, 44]]);
const chestPitch = bakeSpring(pitchKeys, END, { freq: 5, damp: 0.55 });
const pelvisPitch = bakeSpring(keyed([[0, 10], [42.75, 10], [TT.crouchS, 0], [TT.crouchE - 0.08, 20], [TT.air, -12], [TT.air + 0.42, 12], [TT.land - 0.06, -6], [TT.land + 0.24, 20], [TT.slam, 4], [TT.slam + 0.3, -4], [TT.gone, 6], [TT.collapsed, 22], [CUES.end, 22]]), END, { freq: 4.6, damp: 0.6 });
const headPitch = bakeSpring(keyed([[0, 2], [TT.crouchS, 2], [TT.crouchE, -14], [TT.land, 6], [TT.slam + 0.1, -8], [TT.gone + 1.6, 12], [TT.gone + 2.3, -16], [TT.collapse, -4], [TT.collapsed, 28], [CUES.end, 28]]), END, { freq: 3.4, damp: 0.42 });

const G = { x: 7.2 };
function footPlant(side, t) {               // side 0 = L (+x), 1 = R
  const sx = side ? -1 : 1;
  const wait = [S_W.x + sx * G.x, S_W.z + (side ? -1.5 : 1.5)];
  const stance = [S_S.x + sx * (G.x + 0.8), S_S.z + (side ? -5.5 : 5.0)];   // braced split stance, left foot forward
  const shv = footShove(side, t);
  return { wait, stance: [stance[0], stance[1] - shv] };
}
// foot position (plan x, height y above the pad, plan z) and foot pitch
export function footState(side, t) {
  const { wait, stance } = footPlant(side, t);
  const tLand = side ? TT.plant2 : TT.land;
  const tOff = TT.air + (side ? 0.04 : 0);
  if (t < tOff) return { x: wait[0], y: 2.8, z: wait[1], pitch: t > TT.launch ? 0.5 * smooth(invLerp(TT.launch, tOff, t)) : 0 };   // toes push off last
  if (t >= tLand) {
    const a = t - tLand;
    const bite = a < 0.2 ? easeOut(a / 0.2, 2) : 1;
    return { x: stance[0], y: 2.8 - 0.55 * bite - (t > TT.slam ? 0.32 * smooth(invLerp(TT.slam, TT.slam + 0.7, t)) : 0), z: stance[1], pitch: a < 0.1 ? lerp(-0.22, 0, a / 0.1) : 0 };
  }
  const [px, pz] = pelvisXZ(t), py = pelvisYT(t);
  const sx = side ? -1 : 1;
  // trail behind on the way up, tuck at the top, reach out for the landing
  const u = clamp((t - tOff) / (TT.land - tOff));
  const tuck = smooth(invLerp(0.05, 0.42, u)) * (1 - smooth(invLerp(0.55, 0.92, u)));
  const fwd = lerp(lerp(-6.5, 2.5, smooth(invLerp(0, 0.42, u))), 6.5, smooth(invLerp(0.55, 0.9, u)));
  const rel = [sx * (G.x + 0.8 * u), -(15.4 - 8.4 * tuck), fwd + (side ? -2.2 : 2.2)];
  const pre = smooth(invLerp(tLand - 0.2, tLand, t));
  const post = smooth(invLerp(tOff, tOff + 0.12, t));
  const x0 = lerp(wait[0], px + rel[0], post), y0 = lerp(2.8, py + rel[1], post), z0 = lerp(wait[1], pz + rel[2], post);
  const air = lerp(lerp(0.65, -0.1, smooth(invLerp(0, 0.42, u))), -0.24, smooth(invLerp(0.55, 0.9, u)));
  return { x: lerp(x0, stance[0], pre), y: Math.max(2.8, lerp(y0, 2.8, pre)), z: lerp(z0, stance[1], pre), pitch: air };
}

// shield pose relative to the pelvis: [x, y, z, yawDeg, pitchDeg]
const SH_KEYS = [
  [0, 18.2, 8, 11, 70, 6], [TT.crouchE, 15, 2, 10, 68, 10], [TT.launch, 15.5, 7, 12, 62, 6], [44.8, 6.5, 15, 23, 22, -6],
  [TT.land, -12, 14, 21.6, 0, -3], [TT.land + 0.28, -12, 14.5, 25, 0, 0], [TT.slam - 0.08, -13, 19.0, 20.5, 0, -7], [TT.slam, -13.5, 19.2, 19.8, 0, -6],
  [TT.slam + 0.2, -13, 18.0, 13.2, 0, 2], [TT.melt, -13, 18.7, 15, 0, -3], [TT.gone - 1, -13, 19.2, 14.2, 0, -3], [TT.gone, -13, 19.2, 14, 0, -3], [CUES.end, -13, 19.2, 14, 0, -3],
];
const shieldTrack = (i) => (t) => {
  if (t <= SH_KEYS[0][0]) return SH_KEYS[0][i];
  for (let k = 1; k < SH_KEYS.length; k++) if (t < SH_KEYS[k][0]) {
    const u = smooth((t - SH_KEYS[k - 1][0]) / (SH_KEYS[k][0] - SH_KEYS[k - 1][0]));
    return lerp(SH_KEYS[k - 1][i], SH_KEYS[k][i], u);
  }
  return SH_KEYS[SH_KEYS.length - 1][i];
};
const sX = bakeSpring(shieldTrack(1), END, { freq: 3, damp: 0.55 }), sY = bakeSpring(shieldTrack(2), END, { freq: 3, damp: 0.55 }), sZ = bakeSpring(shieldTrack(3), END, { freq: 3, damp: 0.55 });
const sYaw = bakeSpring(shieldTrack(4), END, { freq: 2.6, damp: 0.6 }), sPit = bakeSpring(shieldTrack(5), END, { freq: 3, damp: 0.5 });

// the slab has inertia: through the jump and the landing it reaches each height a few frames after the body
const shieldLag = (t) => (t > TT.crouchS && t < TT.slam + 0.1 ? clamp(pelvisYT(t - 0.11) - pelvisYT(t), -6, 6) : 0);
export function shieldPose(t) { return { x: sX(t), y: sY(t) + shieldLag(t) + 6.8 * kneelK(t), z: sZ(t), yaw: sYaw(t), pitch: sPit(t) }; }

// Vibration of the whole mech under the beam: grows as the melt advances
export function strain(t) {
  if (t < TT.slam) return 0;
  const onset = 1 - Math.exp(-(t - TT.slam) * 5);
  const end = 1 - smooth(invLerp(FIRE2 + 2.2, FIRE2 + 3, t));
  return onset * (0.55 + 0.45 * smooth(invLerp(TT.slam, TT.gone, t))) * end;
}

// the last stand: the knees give twice under the beam, each time he rights himself, then the head comes up
const buckleRoll = bakeSpring(keyed([[0, 0], [TT.gone, 0], [TT.gone + 0.55, 5], [TT.gone + 1.1, -2], [TT.gone + 1.7, 7], [TT.gone + 2.4, 0], [CUES.end, 1.5]]), END, { freq: 2.4, damp: 0.5 });
export function tortoiseState(t) {
  const [x, z] = pelvisXZ(t);
  const y = pelvisYT(t) + pelvisBrace(t);
  const str = strain(t);
  const shakeA = 0.14 * str;
  return {
    x: x + noise1(t * 18, 3) * shakeA * 0.8,
    y: y + noise1(t * 21, 9) * shakeA * 0.6,
    z: z + noise1(t * 16, 5) * shakeA,
    pelvisPitch: pelvisPitch(t) + noise1(t * 14, 12) * 1.6 * str,
    chestPitch: chestPitch(t) + noise1(t * 11, 15) * 2.4 * str,
    headPitch: headPitch(t),
    roll: noise1(t * 9, 17) * 2.0 * str + buckleRoll(t),
    str,
  };
}

export const ARMS_CROSS = (t) => smooth(invLerp(TT.gone - 0.25, TT.gone + 0.7, t));
export const ARMS_DROP = (t) => smooth(invLerp(TT.collapse + 0.2, TT.collapsed - 0.5, t));
export const SCORCH = (t) => smooth(invLerp(TT.melt, TT.gone + 1.2, t));

// the hatch: opened by hand at CUES.hatchOpen, heavy door with a slow start and a bounce against its stop
export const hatchAngleFn = bakeSpring(keyed([[0, 0], [CUES.hatchOpen, 0], [CUES.hatchOpen + 0.2, -0.02], [CUES.hatchOpen + 1.3, 1.95], [CUES.end, 1.95]]), END, { freq: 2.2, damp: 0.55 });
