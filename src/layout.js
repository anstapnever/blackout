// BLACKOUT — the one shared map. Metres, Y up, sea level y = 0. The bay opens toward +Z.
// Every department places things from these numbers. Lead owns this file.

export const SEA_Y = 0;
export const CITY = { center: [0, 0, 0], radius: 1400 };
export const ORRERY = { center: [0, 540, 300], radius: 260 };          // outer ring radius (the astrolabe is ~520 m across)
export const RIDGE = { firing: [-3200, 640, 2100] };                  // the gun's position on the ridge
export const CANNON = { base: [-3200, 640, 2100], length: 180, muzzle: [-3050, 690, 1990] };
export const HERON = { pos: [-3232, 640, 2130] };                      // kneeling behind the breech
export const TORTOISE = { pos: [-3030, 640, 1960], stance: [-3005, 640, 1930] };   // jumps to stance between the muzzle and the Orrery
export const MOON = { elev: 42, az: 150 };

// The aim line from the gun's muzzle to the Orrery centre, normalised.
export function aimDir() {
  const a = CANNON.muzzle, b = ORRERY.center;
  const v = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const l = Math.hypot(...v);
  return v.map((x) => x / l);
}

// THE BLACKOUT FRONT. Every light in the land asks this for its state, so the dark sweeps as one straight front.
// In s01 the front travels along +Z toward the camera, which looks along -Z from above the shore.
// The front moves in whole blocks (BLOCK metres): a block dies in one drawing, so the wave reads in visible jolts.
const FRONT_START = -1.0, FRONT_END = 1.0, Z_FAR = -4000, Z_NEAR = 2800, BLOCK = 80;     // film seconds, world z range the front crosses
const snapZ = (z) => Math.floor(z / BLOCK) * BLOCK;
export function darkAt(z) {
  const k = Math.min(1, Math.max(0, (snapZ(z) - Z_FAR) / (Z_NEAR - Z_FAR)));
  return FRONT_START + (FRONT_END - FRONT_START) * k;
}
const RELIGHT_START = 75.0, RELIGHT_END = 78.0;
export function relightAt(z) {
  const k = Math.min(1, Math.max(0, (Z_NEAR - snapZ(z)) / (Z_NEAR - Z_FAR)));
  return RELIGHT_START + (RELIGHT_END - RELIGHT_START) * k;
}
// lit(z, t, jitter 0..1): 1 = window on, 0 = off. jitter gives each light a slightly different moment.
export function lit(z, t, jitter = 0) {
  const off = darkAt(z) + (jitter - 0.5) * 0.18, on = relightAt(z) + (jitter - 0.5) * 0.2;
  if (t < off) return 1;
  if (t < off + 0.08) return 1 - (t - off) / 0.08;
  if (t < on) return 0;
  return Math.min(1, (t - on) / 0.1);
}
// GLSL twin of lit() so window shaders match the JS exactly. It needs no uniforms: pass the time in.
export const LIT_GLSL = /* glsl */ `
float litAt(float zIn, float t, float jitter){
  float z = floor(zIn / ${BLOCK.toFixed(1)}) * ${BLOCK.toFixed(1)};
  float k = clamp((z - (${Z_FAR.toFixed(1)})) / (${(Z_NEAR - Z_FAR).toFixed(1)}), 0.0, 1.0);
  float off = ${FRONT_START.toFixed(2)} + ${(FRONT_END - FRONT_START).toFixed(2)} * k + (jitter - 0.5) * 0.18;
  float q = clamp((${Z_NEAR.toFixed(1)} - z) / (${(Z_NEAR - Z_FAR).toFixed(1)}), 0.0, 1.0);
  float on = ${RELIGHT_START.toFixed(2)} + ${(RELIGHT_END - RELIGHT_START).toFixed(2)} * q + (jitter - 0.5) * 0.2;
  if(t < off) return 1.0;
  if(t < off + 0.08) return 1.0 - (t - off) / 0.08;
  if(t < on) return 0.0;
  return min(1.0, (t - on) / 0.1);
}`;
