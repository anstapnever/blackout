import { smooth, invLerp } from './util.js';

// BLACKOUT — 79.4 s, 24 fps. Hook first, payoff last. Shot list per CONTRACT.md.
export const FPS = 24;
const LIST = [
  ['s01', 'wave', 'city', 1.0, ''], ['s01b', 'wire', 'pylons', 1.0, ''], ['s01c', 'barrel', 'barrel', 1.0, ''],
  ['s02', 'window', 'window', 1.5, ''], ['s03', 'ignite', 'bay', 2.0, 'a111'],
  ['s04', 'surge', 'pylons', 1.5, 'b005 a053'], ['s05', 'lever', 'hut', 2.5, 'b003 b004'], ['s06', 'cannon', 'ridge', 3.0, 'a051 a057 b018'],
  ['s07', 'boy', 'cockpitA', 2.5, 'a070 b021'], ['s08', 'scope', 'scope', 2.0, 'b016 b023'], ['s09', 'barrage', 'hills', 3.0, 'a013 a016'],
  ['s10', 'answer', 'bay', 2.5, 'a018 a021'], ['s11', 'girl', 'cockpitB', 2.0, 'b024'], ['s12', 'core', 'bay', 2.0, 'a112 b043'],
  ['s13', 'trigger', 'cockpitA', 1.5, 'b025 b026'], ['s14', 'muzzle', 'ridge', 1.5, 'b027 b028'], ['s15', 'twist', 'sea', 3.0, 'b029 b032'],
  ['s16', 'impacts', 'hills', 3.0, 'b034 b036 a119'], ['s17', 'shaken', 'cockpitA', 2.5, 'a138 a141'], ['s18', 'aligns', 'bay', 3.0, 'a148 a151'],
  ['s19', 'strike', 'ridge', 1.5, 'a152'], ['s20', 'shield', 'ridge', 3.0, 'a154 b050'], ['s21', 'melt', 'ridge', 3.5, 'a166 a172'],
  ['s22', 'roar', 'cockpitA', 2.0, 'a185 b057'], ['s23', 'holds', 'cockpitB', 2.5, 'b052'], ['s24', 'last', 'ridge', 2.5, 'a178 b053'],
  ['s25', 'fire2', 'ridge', 2.0, 'a200 b060'], ['s26', 'pierce', 'bay', 3.0, 'a107 a212 b063'], ['s27', 'fall', 'bay', 3.5, 'b064 a216'],
  ['s28', 'silence', 'ridge', 3.0, 'b059'], ['s29', 'hatch', 'hatch', 3.5, ''], ['s30', 'alive', 'hatch', 3.0, ''], ['s31', 'lights', 'city', 3.0, ''], ['s32', 'lamp', 'window', 1.4, ''],
];
export const SHOTS = [];
{
  let t = 0;
  for (const [id, name, set, d, ref] of LIST) { SHOTS.push({ id, name, set, start: +t.toFixed(3), end: +(t + d).toFixed(3), ref }); t += d; }
}
export const DURATION = SHOTS[SHOTS.length - 1].end;
export const FRAMES = Math.round(FPS * DURATION);

export const CUES = {
  ringTurn: 2.5, ringFace: 3.0, lampOut: 4.2, ignite: 4.5, surge: 6.5, lever: 8.0, hammer: 11.5, barrage: 18.0, answer: 21.0, coreOpen: 25.5, fire1: 28.5, muzzle: 29.0,
  cross: 31.0, impact: 33.5, recharge: 36.5, align: 39.0, strike: 42.0, shieldHit: 45.72, melt: 46.5, shieldGone: 54.5, fire2: 57.0, pierce: 59.0,
  coreBreak: 61.0, fall: 62.0, silence: 65.5, hatchOpen: 71.0, smile: 73.5, relight: 75.0, lampBack: 78.0, end: DURATION,
};

const CAMS = {}, LOOKS = {};
export function registerCams(mod) { Object.assign(CAMS, mod.CAMS || {}); Object.assign(LOOKS, mod.LOOKS || {}); }

const DEFAULT_CAM = {
  city: { pos: [0, 620, 2500], look: [0, 40, 0], fov: 40 }, bay: { pos: [-900, 90, 2200], look: [0, 500, 300], fov: 42 }, window: { pos: [0, 3, 4], look: [0, 3, 0], fov: 32 },
  barrel: { pos: [-3120, 655, 2070], look: [0, 540, 300], fov: 40 },
  pylons: { pos: [-1400, 340, 1600], look: [-3200, 640, 2100], fov: 44 }, hut: { pos: [-3120, 650, 2200], look: [-3120, 648, 2190], fov: 40 }, ridge: { pos: [-3300, 660, 2230], look: [-3100, 680, 2000], fov: 40 },
  cockpitA: { pos: [0, 1.5, 1.2], look: [0, 1.4, 0], fov: 36 }, cockpitB: { pos: [0, 1.5, 1.2], look: [0, 1.4, 0], fov: 36 }, scope: { pos: [-3050, 690, 1990], look: [0, 540, 300], fov: 7 },
  hills: { pos: [-1800, 300, 1400], look: [0, 500, 300], fov: 42 }, sea: { pos: [-1600, 160, 1500], look: [-1600, 600, 900], fov: 46 }, hatch: { pos: [-3020, 665, 1985], look: [-3005, 660, 1940], fov: 40 },
};
const DEFAULT_LOOK = { k: 1, sunElev: 42, sunAz: 150 };

export function shotAt(t) {
  for (let i = 0; i < SHOTS.length; i++) if (t < SHOTS[i].end) return i;
  return SHOTS.length - 1;
}
export const shotById = (id) => SHOTS.find((s) => s.id === id);

export function evalFrame(frame) {
  const t = frame / FPS;
  const si = shotAt(t);
  const sh = SHOTS[si];
  const lt = t - sh.start, dur = sh.end - sh.start;
  const st = { frame, t, si, sid: sh.id, shot: sh.name, set: sh.set, lt, dur, cues: CUES, fade: 0, fadeColor: '#ffffff', shadow: null, key: null };
  const lf = LOOKS[sh.id];
  st.look = { ...DEFAULT_LOOK, ...(lf ? lf(lt, dur, t, st) : {}) };
  // the gold on the horizon follows the power: gone with the front, back with the relight
  if (st.look.cityGlow == null) st.look.cityGlow = Math.max(1 - smooth(invLerp(-0.3, 0.95, t)), smooth(invLerp(75.0, 78.0, t)));
  st.shadow = st.look.shadow ?? null;
  st.key = st.look.key ?? null;
  const cf = CAMS[sh.id];
  st.cam = cf ? cf(lt, dur, t, st) : DEFAULT_CAM[sh.set];
  if (st.look.fade != null) st.fade = st.look.fade;
  if (st.look.fadeColor) st.fadeColor = st.look.fadeColor;
  // HOOK: never open on a fade. The film only closes to black, on the payoff's last beat.
  if (t > DURATION - 0.35) { st.fade = Math.max(st.fade, smooth(invLerp(DURATION - 0.35, DURATION, t))); st.fadeColor = '#000000'; }
  return st;
}
