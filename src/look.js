import * as THREE from 'three';
import { G } from './glsl.js';
import { ENV } from './passes-env.js';
import { deg } from './util.js';

// Colour script for BLACKOUT: a deep ultramarine night that the war slowly sets on fire.
//   k = 1    clean moonlit night: cold silver key, indigo shadows, stars and aurora, black where the power died
//   k = 0.5  burning: orange from below in smoke, the moon a dull disc behind it
// Gold belongs to the city, coral to the Orrery, ice blue to the gun. The grade never mixes these up.
export const PRESETS = {
  burn: {
    sunColor: '#ffb27a', sunStrength: 0.72, skyTint: '#5c5468', shadeTint: '#3a3458', deepTint: '#1a1630', bounce: '#c8703e',
    sky: { zenith: '#0a0c2c', mid: '#1e2048', warm: '#d86a30', cool: '#5a3440', cloudLit: '#ffb070', cloudMid: '#7a4a48', cloudShade: '#2a2240' },
    fog: { warm: '#7a3a28', cool: '#3a2030', density: 0.00085, mist: 0.3, mistHeight: 42 },
    grade: { lift: '#06030a', gain: '#fff4e6', sat: 1.1, contrast: 1.26, pivot: 0.3, black: 0.012, shadow: '#e4e0ff', high: '#fff0dc', halation: '#ffe0c8' },
    night: 0.55, aurora: 0,
  },
  night: {
    sunColor: '#b6c6ee', sunStrength: 0.64, skyTint: '#566aac', shadeTint: '#28336f', deepTint: '#0f153c', bounce: '#5a68aa',
    sky: { zenith: '#071142', mid: '#14286e', warm: '#33458c', cool: '#20327a', cloudLit: '#c4d0ee', cloudMid: '#5e6eae', cloudShade: '#1b2556' },
    fog: { warm: '#1e2b5e', cool: '#121c4a', density: 0.00011, mist: 0.05, mistHeight: 30 },
    grade: { lift: '#02030a', gain: '#f8f7ff', sat: 1.16, contrast: 1.22, pivot: 0.3, black: 0.012, shadow: '#d4dcff', high: '#fff6e8', halation: '#ffe4d8' },
    night: 1, aurora: 1,
  },
};

const ca = new THREE.Color(), cb = new THREE.Color();
const mixC = (target, a, b, k) => target.copy(ca.set(a)).lerp(cb.set(b), k);
const mixN = (a, b, k) => a + (b - a) * k;
const clamp01 = (x) => Math.min(1, Math.max(0, x));

// look: { k, sunElev (deg), sunAz (deg, 0 = -Z north, + toward +X east), sunDisk, shafts, veil, mistMul, fogMul,
//         fogDensity, fogWarm, fogCool, exposure, gamma, contrast, paintRadius, inkWidth, key: [x,y,z], shadow: {center, radius, depth},
//         fade, fadeColor, cloudDrift, aurora, cityGlow, skyFlash: [r,g,b], vignette, bloom }
export function applyLook(ctx, look) {
  const A = PRESETS.burn, B = PRESETS.night;
  const k = clamp01(((look.k ?? 1) - 0.5) / 0.5);
  const el = deg(look.sunElev ?? 42), az = deg(look.sunAz ?? 150);
  G.uSunDir.value.set(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el)).normalize();
  mixC(G.uSunColor.value, A.sunColor, B.sunColor, k);
  G.uSunStrength.value = mixN(A.sunStrength, B.sunStrength, k);
  mixC(G.uSkyTint.value, A.skyTint, B.skyTint, k);
  mixC(G.uShadeTint.value, A.shadeTint, B.shadeTint, k);
  mixC(G.uDeepTint.value, A.deepTint, B.deepTint, k);
  mixC(G.uBounce.value, A.bounce, B.bounce, k);

  ENV.uRain.value = 0;
  ENV.uRainbow.value = 0;
  ENV.uVeil.value = clamp01(look.veil ?? (1 - k) * 0.5);
  ENV.uWaterOn.value = 0;

  const sky = ctx.world && ctx.world.sky;
  if (sky) {
    const u = sky.material.uniforms;
    mixC(u.uZenith.value, A.sky.zenith, B.sky.zenith, k);
    mixC(u.uMid.value, A.sky.mid, B.sky.mid, k);
    mixC(u.uHorizonWarm.value, A.sky.warm, B.sky.warm, k);
    mixC(u.uHorizonCool.value, A.sky.cool, B.sky.cool, k);
    mixC(u.uCloudLit.value, A.sky.cloudLit, B.sky.cloudLit, k);
    mixC(u.uCloudMid.value, A.sky.cloudMid, B.sky.cloudMid, k);
    mixC(u.uCloudShade.value, A.sky.cloudShade, B.sky.cloudShade, k);
    u.uSunDisk.value = look.sunDisk ?? 1;
    u.uCloudDrift.value = look.cloudDrift ?? 0;
    u.uNight.value = mixN(A.night, B.night, k);
    u.uAurora.value = look.aurora ?? mixN(A.aurora, B.aurora, k);
    u.uCityGlow.value = look.cityGlow ?? 0;
    const fl = look.skyFlash; u.uSkyFlash.value.setRGB(fl ? fl[0] : 0, fl ? fl[1] : 0, fl ? fl[2] : 0);
  }
  const e = ctx.engine;
  const a = e.mAtmos.uniforms;
  mixC(a.uFogWarm.value, A.fog.warm, B.fog.warm, k);
  mixC(a.uFogCool.value, A.fog.cool, B.fog.cool, k);
  if (look.fogWarm) a.uFogWarm.value.set(look.fogWarm);
  if (look.fogCool) a.uFogCool.value.set(look.fogCool);
  a.uFogDensity.value = (look.fogDensity ?? mixN(A.fog.density, B.fog.density, k)) * (look.fogMul ?? 1);
  a.uMist.value = mixN(A.fog.mist, B.fog.mist, k) * (look.mistMul ?? 1);
  a.uMistHeight.value = mixN(A.fog.mistHeight, B.fog.mistHeight, k);
  a.uShafts.value = look.shafts ?? 0;
  const f = e.mFinal.uniforms;
  mixC(f.uLift.value, A.grade.lift, B.grade.lift, k);
  mixC(f.uGain.value, A.grade.gain, B.grade.gain, k);
  f.uSat.value = mixN(A.grade.sat, B.grade.sat, k);
  f.uExposure.value = look.exposure ?? 1.08;
  f.uGamma.value = look.gamma ?? 0.92;
  f.uContrast.value = look.contrast ?? mixN(A.grade.contrast, B.grade.contrast, k);
  f.uPivot.value = mixN(A.grade.pivot, B.grade.pivot, k);
  f.uBlack.value = mixN(A.grade.black, B.grade.black, k);
  mixC(f.uSplitShadow.value, A.grade.shadow, B.grade.shadow, k);
  mixC(f.uSplitHigh.value, A.grade.high, B.grade.high, k);
  mixC(f.uHalation.value, A.grade.halation, B.grade.halation, k);
  f.uVignette.value = look.vignette ?? 0.3;
  if (look.bloom != null) f.uBloom.value = look.bloom;
}
