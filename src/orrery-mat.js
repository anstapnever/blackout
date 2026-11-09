import * as THREE from 'three';
import { G, COMMON, MRT_OUT, VERT_STD } from './glsl.js';

// ORRERY dept: one material for a whole ring. Cream porcelain, tarnished gold, crimson enamel, pierced lace.
// Three scales of surface detail chosen by pixel footprint: macro tea stains and tarnish, meso tile seams and crazing,
// micro chips, pits and scratches. The core lights the ring from inside (cel bands), the engravings fill with coral as it charges.
const TAU = 6.2831853;

export function ringMaterial(i, tex, o) {
  const u = {
    ...G,
    uScale: { value: tex.scale }, uLace: { value: tex.lace },
    uRing: { value: i }, uRm: { value: o.R }, uRn: { value: o.rI }, uRo: { value: o.rO },
    uCharge: { value: 0 }, uHeat: { value: 0 }, uCold: { value: 0 }, uRun: { value: 0 }, uFlash: { value: 0 },
    uCrack: { value: 0 }, uDead: { value: 0 }, uDial: { value: 0 }, uAfter: { value: 0 },
    uCoreW: o.coreW,
    uFire: o.fire ?? { value: new THREE.Vector4(0, 0, 0, 0) },
  };
  const vs = /* glsl */ `
    attribute vec4 aInfo;
    attribute float aRho;
    varying vec4 vInfo;
    varying float vRho;
    varying vec3 vLocal;
    ${VERT_STD}
    void main(){ vInfo = aInfo; vRho = aRho; vLocal = position; stdVertex(position, normal); }
  `;
  const fs = /* glsl */ `
    ${COMMON}
    ${MRT_OUT}
    uniform sampler2D uScale, uLace;
    uniform float uRing, uRm, uRn, uRo, uCharge, uHeat, uCold, uRun, uFlash, uCrack, uDead, uDial, uAfter;
    uniform vec3 uCoreW;
    varying vec3 vWorld, vNormalW, vNormalV, vLocal;
    varying vec4 vInfo;
    varying float vRho, vDepth;
    varying vec2 vUv;
    const float TAU = ${TAU};

    // 2D Voronoi: returns (distance to the cell border, cell id)
    vec2 voro(vec2 p){
      vec2 g = floor(p), f = fract(p), mg, mr; float md = 8.0, id = 0.0;
      for(int y=-1;y<=1;y++) for(int x=-1;x<=1;x++){
        vec2 o = vec2(float(x), float(y)); vec2 r = o + hash22(g + o) - f; float d = dot(r, r);
        if(d < md){ md = d; mr = r; mg = o; id = hash12(g + o); }
      }
      md = 8.0;
      for(int y=-2;y<=2;y++) for(int x=-2;x<=2;x++){
        vec2 o = mg + vec2(float(x), float(y)); vec2 r = o + hash22(g + o) - f;
        if(dot(mr - r, mr - r) > 1e-5) md = min(md, dot(0.5 * (mr + r), normalize(r - mr)));
      }
      return vec2(md, id);
    }
    float aaLine(float d, float w, float px){ return 1.0 - smoothstep(w - px * 0.5, w + px, d); }

    void main(){
      float part = floor(vInfo.x + 0.5), row = vInfo.z, vBand = vInfo.y, seamD = vInfo.w;
      float arc = vUv.x, sec = vUv.y;
      float px = length(fwidth(vWorld)) * 0.72;                // metres under one pixel
      float wFar = smoothstep(0.7, 3.2, px);
      vec2 lc = vec2(arc, sec);

      // ---- the lace is really cut: alpha test, and it closes up into a solid tone when too small to read
      float laceTone = 0.0;
      if(part > 3.5 && part < 4.5){
        float a = texture(uLace, vec2(arc / (TAU * uRm / 12.0), vBand), -1.0).a;
        float th = mix(0.42, 0.1, smoothstep(1.2, 4.5, px));
        if(a < th) discard;
        laceTone = smoothstep(0.5, 0.9, a);
      }
      if(uPass > 0.5 && uPass < 1.5){ oColor = vec4(1); oData = vec4(0); return; }

      vec3 N = normalize(vNormalW), NV = normalize(vNormalV);
      if(part > 3.5 && part < 4.5 && !gl_FrontFacing){ N = -N; NV = -NV; }

      vec3 p = vLocal + uRing * 17.3;
      // macro scales everywhere
      float m1 = fbm3(p * 0.016), m2 = fbm3(p * 0.055 + 9.0), m3 = fbm2(vec2(arc * 0.2, sec * 0.05) + uRing * 3.1);
      float meso = 1.0 - smoothstep(0.55, 1.5, px), micro = 1.0 - smoothstep(0.1, 0.34, px);

      // scale engravings (R line, G gold inlay, B recess)
      vec3 tx = vec3(0.0);
      if(row > -0.5){
        vec2 tuv = vec2((arc + uDial) / (TAU * uRm / 3.0), (row + 0.015 + vBand * 0.97) / 4.0);
        tuv.y = 1.0 - tuv.y;
        tx = texture(uScale, tuv).rgb;
      }
      vec3 col = vec3(0.0), goldBase = vec3(0.86, 0.62, 0.28), tarnishDark = vec3(0.22, 0.20, 0.13);
      float gold = 0.0, glaze = 0.0, ench = 0.0, biscuit = 0.0;
      float chip = 0.0, chipRim = 0.0;

      if(part < 0.5 || part > 4.5){
        // ---------- PORCELAIN
        vec3 cream = vec3(0.95, 0.89, 0.76), tea = vec3(0.68, 0.53, 0.33), ash = vec3(0.70, 0.72, 0.78);
        col = cream * (1.0 + (m1 - 0.5) * 0.3);
        col = mix(col, tea, smoothstep(0.5, 0.74, m2 * 0.62 + m1 * 0.38) * 0.3);
        col = mix(col, ash, smoothstep(0.52, 0.7, fbm3(p * 0.03 + 21.0)) * 0.25);
        col *= mix(0.93, 1.07, vRho);
        // streaks running across the band from the gold rails (tarnish weeping onto the glaze)
        float railP = row > -0.5 ? 1.0 - smoothstep(0.0, 0.42, min(vBand, 1.0 - vBand)) : 0.5;
        float streak = smoothstep(0.54, 0.72, m3) * (0.25 + 0.75 * railP);
        col = mix(col, mix(tea, tarnishDark, 0.45), streak * 0.38);
        // meso: glazed tiles and crazing
        float tile = abs(fract(arc / 19.0 + (row > 0.5 ? 0.5 : 0.0)) - 0.5) * 19.0;
        col *= 1.0 - 0.34 * aaLine(tile, 0.09, px) * meso;
        vec2 cz = voro(lc * vec2(0.24, 0.34) + 3.7 * uRing);
        float crazing = aaLine(cz.x / 0.3, 0.05, px * 3.2) * meso * smoothstep(0.42, 0.62, fbm2(lc * 0.05 + 5.0));
        col = mix(col, col * vec3(0.62, 0.5, 0.42), crazing * 0.75);
        col *= 1.0 + (cz.y - 0.5) * 0.05 * meso;
        // micro: pits, grain
        float grain = vnoise(lc * 5.5) - 0.5, grain2 = vnoise(lc * 19.0) - 0.5;
        col *= 1.0 + (grain * 0.1 + grain2 * 0.08) * micro;
        // chips: bite into the band edge and scatter over it. Dark biscuit with a bright broken lip
        float cn = fbm2(lc * 0.42 + 11.0) + 0.28 * vnoise(lc * 2.4 + 4.0) * micro;
        float bias = row > -0.5 ? (1.0 - smoothstep(0.0, 0.22, min(vBand, 1.0 - vBand))) * 0.14 : 0.04;
        float cth = 0.9 - bias;
        chip = smoothstep(cth, cth + 0.012 + px * 0.05, cn) * (1.0 - wFar);
        chipRim = smoothstep(cth - 0.03, cth - 0.03 + 0.012 + px * 0.05, cn) * (1.0 - chip) * (1.0 - wFar);
        col = mix(col, vec3(1.04, 1.0, 0.9), chipRim * 0.7);
        col = mix(col, vec3(0.32, 0.26, 0.24), chip);
        glaze = 1.0 - chip;
        // engraved scale lines
        col = mix(col, vec3(0.16, 0.12, 0.2), tx.r * 0.9 * (1.0 - chip));
        col = mix(col, goldBase * 1.02, tx.g * (1.0 - chip));
        col = mix(col, col * vec3(0.78, 0.72, 0.74), tx.b * 0.7);
        if(part > 4.5){
          // fracture: raw grey biscuit with hard fine strata
          float st = vnoise(vec2(arc * 0.5, sec * 1.8) + 8.0);
          col = mix(vec3(0.44, 0.36, 0.34), vec3(0.72, 0.64, 0.56), step(0.45, st));
          glaze = 0.0;
          biscuit = 1.0;
        }
      } else if(part < 1.5 || (part > 3.5 && part < 4.5)){
        // ---------- TARNISHED GOLD
        gold = 1.0;
        float t1 = smoothstep(0.34, 0.66, m2 * 0.55 + m1 * 0.45);
        float worn = smoothstep(0.45, 0.64, fbm2(lc * 0.09 + 13.0));
        col = mix(vec3(0.94, 0.74, 0.34), vec3(0.54, 0.38, 0.16), t1);
        col = mix(col, vec3(0.20, 0.28, 0.22), smoothstep(0.62, 0.78, m3) * 0.75);   // black-green tarnish in long streaks
        col = mix(col, vec3(1.06, 0.82, 0.4), worn * (1.0 - t1) * 0.32);
        // running beads/tooling across rails and cuffs
        if(row < -2.5){
          // cuffs: raised bands and a line of studs
          float gv = abs(fract(sec / 4.4) - 0.5) * 4.4;
          col *= mix(1.0, 0.78 + 0.22 * smoothstep(0.06, 0.22 + px * 0.5, gv), meso);
          float st = length(vec2(fract(arc / 3.1) - 0.5, (fract(sec / 4.4 + 0.5) - 0.5) * 4.4 / 3.1)) * 3.1;
          col = mix(col, vec3(1.14, 0.96, 0.6), (1.0 - smoothstep(0.32, 0.46 + px * 0.5, st)) * meso);
        } else if(row < -1.5 && vBand > 0.001 && vBand < 0.999 && part < 3.5){
          // beaded rails: little dark dots between the beads
          float bd = abs(fract(arc / 1.9) - 0.5) * 1.9;
          col *= mix(1.0, 0.7 + 0.3 * smoothstep(0.08, 0.28 + px * 0.5, bd), meso * (1.0 - smoothstep(0.34, 0.46, abs(vBand - 0.5))));
        }
        // meso/micro tooling and scratch
        col *= 1.0 + (vnoise(lc * 1.6) - 0.5) * 0.26 * meso;
        float sc = step(0.84, vnoise(vec2(arc * 8.0, sec * 0.5))) * micro;
        col = mix(col, vec3(1.15, 0.96, 0.62), sc * 0.3);
        col *= 1.0 - tx.r * 0.75;
        col = mix(col, vec3(1.1, 0.9, 0.5), tx.g * 0.8);
        if(part > 3.5) col *= mix(0.82, 1.08, laceTone);
      } else if(part < 2.5){
        // ---------- DARK GROOVE
        col = vec3(0.1, 0.08, 0.14) * (1.0 + (m2 - 0.5) * 0.6);
      } else {
        // ---------- CRIMSON ENAMEL
        ench = 1.0;
        col = mix(vec3(0.62, 0.05, 0.07), vec3(0.42, 0.03, 0.08), m2);
        col = mix(col, vec3(0.12, 0.04, 0.08), smoothstep(0.62, 0.8, m3) * 0.5);
        col = mix(col, vec3(1.0, 0.76, 0.34), tx.g);
        col = mix(col, vec3(0.1, 0.03, 0.06), tx.r * 0.7);
        glaze = 0.8;
      }

      // ---- the moon: two hard tones, a third in the deepest shade
      vec3 V = normalize(cameraPosition - vWorld);
      vec3 Key = normalize(uKeyDir * 0.62 + V * 0.95 + vec3(0.0, 0.28, 0.0));
      float ndl = dot(N, Key);
      float sh = dot(N, uKeyDir) > 0.08 ? mix(1.0, sunShadow(vWorld, N), 0.75) : 1.0;     // only surfaces the real moon reaches can be shadowed by other rings
      float lit = smoothstep(-0.02, 0.06, ndl) * sh;
      // moonlight on porcelain stays cream: only a little of the moon's blue gets into the lit side
      vec3 moonN = mix(vec3(dot(uSunColor, vec3(0.33))), uSunColor, 0.3); moonN = moonN / max(max(moonN.r, moonN.g), moonN.b);
      vec3 litC = col * moonN * mix(0.62, 1.02, uSunStrength);
      if(glaze > 0.0 && ench < 0.5) litC = mix(litC, col * vec3(1.0, 0.98, 0.93) * mix(0.8, 1.04, uSunStrength), 0.9);
      float up = smoothstep(-0.7, 0.6, N.y);
      vec3 shadeC = col * uShadeTint * mix(uBounce, vec3(1.0), up) * vec3(2.05, 1.8, 1.32);
      // porcelain falls into a cool lilac shade so the cream reads against the ultramarine
      if(glaze > 0.0 && ench < 0.5) shadeC = mix(shadeC, col * vec3(0.58, 0.6, 0.86) * mix(0.82, 1.0, up), 0.85);
      vec3 outc = mix(shadeC, litC, lit);
      float deep = step(ndl, -0.55) * step(N.y, -0.35);
      outc = mix(outc, col * uDeepTint * vec3(2.2, 1.9, 1.4), deep * 0.8);

      // highlights: glaze breaks into shapes because the surface is not perfectly flat
      vec3 pert = vec3(m1 - 0.5, m2 - 0.5, m3 - 0.5);
      vec3 Ng = normalize(N + pert * 0.16);
      vec3 H = normalize(Key + V);
      float s = dot(Ng, H);
      float hPorc = step(0.975, s) * lit * glaze * (1.0 - wFar * 0.5);
      outc = mix(outc, vec3(1.18, 1.2, 1.28), hPorc * 0.65);
      if(gold > 0.5){
        vec3 R = reflect(-V, Ng);
        float e = R.y;
        vec3 env = e > 0.45 ? vec3(0.78, 0.76, 1.0) : e > 0.1 ? vec3(0.6, 0.52, 0.7) : e > -0.12 ? vec3(1.1, 0.88, 0.58) : vec3(0.42, 0.3, 0.32);
        outc = mix(outc, col * env * mix(0.95, 1.4, lit), 0.7);
        outc = mix(outc, vec3(1.24, 1.08, 0.82), step(0.982, s) * lit * 0.8);
        // hard painted streaks of reflected sky that slide along the metal as the ring turns
        float st = sin(arc * 0.075 + dot(R, vec3(7.0, 5.0, 9.0)) + uRing * 2.0);
        float streakH = smoothstep(0.955, 0.965, st) * (1.0 - wFar * 0.6);
        outc = mix(outc, vec3(1.3, 1.1, 0.72), streakH * mix(0.32, 0.7, lit) * (1.0 - smoothstep(0.55, 0.8, m3)));
      }
      // cold rim of moonlight along every edge turned away from us
      float fres = 1.0 - max(dot(N, V), 0.0);
      float rim = smoothstep(0.7, 0.76, fres) * (0.3 + 0.7 * lit);
      outc = mix(outc, mix(uSunColor, vec3(1.0), 0.4) * 1.1, rim * 0.5 * (1.0 - wFar * 0.7));

      // ---- light from the core: cel bands, hard enough to read as painted
      vec3 toC = uCoreW - vWorld; float dc = length(toC); toC /= dc;
      float nc = dot(N, toC);
      // near = 1 on the two inner rings, 0 on the two outer ones. Outer porcelain stays cream and only takes coral on faces turned to the core.
      float near = 1.0 - smoothstep(150.0, 205.0, uRm);
      float fall = 1.0 / (1.0 + pow(dc / 118.0, 4.0));
      float facing = smoothstep(0.18, 0.42, nc);
      float inside = mix(facing * 0.8, smoothstep(-0.06, 0.2, nc) + (1.0 - abs(nc)) * 0.42, near);
      float amt = clamp(inside * mix(0.42, 1.3 * fall + 0.25, near) * uHeat, 0.0, 1.2);
      float band = floor(amt * 5.0 + 0.5) / 5.0;
      vec3 coral = mix(vec3(1.0, 0.17, 0.10), vec3(1.0, 0.56, 0.34), smoothstep(0.35, 1.0, uHeat));
      outc += col * coral * band * (biscuit > 0.5 ? 0.5 : 1.65);

      // ---- engravings fill with coral; pulses climb around the ring while it charges, weaker the further out
      float ang = arc / uRm;
      float wv = fract(ang * 3.0 / TAU - uDrawTime * 0.55 + uRing * 0.17);
      float pulse = smoothstep(0.0, 0.015, wv) * (1.0 - smoothstep(0.05, 0.4, wv));
      float inlay = max(tx.r, tx.g) * (1.0 - chip);
      float hotLine = inlay * smoothstep(0.05, 0.3, uCharge) * (0.35 + 2.4 * pulse) * mix(0.3, 1.0, near);
      outc = mix(outc, coral * 2.2, clamp(hotLine * uCharge, 0.0, 1.0));
      // inner rail burns when charged, only on the rings close to the fire
      float rail = (1.0 - smoothstep(0.015, 0.09, vRho));
      outc += coral * rail * smoothstep(0.1, 0.9, uCharge) * (gold > 0.5 ? 0.5 : 0.28) * mix(0.18, 1.0, near);

      // ---- hook: the ring is a cold thing, a hair of white runs along its inner edge
      if(uCold > 0.001){
        outc = mix(outc, outc * vec3(0.92, 1.12, 1.5), uCold * 0.85);
        float e = (1.0 - smoothstep(0.0, 0.05 + px * 0.012, vRho));
        outc += vec3(0.5, 0.76, 1.0) * e * uCold * 1.5;
        float a = fract(ang / TAU + 0.25);
        float d = min(a, 1.0 - a) * 2.0;
        float head = step(d, uRun);
        float core = smoothstep(uRun - 0.18, uRun, d);
        outc += vec3(0.86, 0.95, 1.1) * head * (1.0 - smoothstep(0.0, 0.14 + px * 0.02, vRho)) * (2.4 + 4.0 * core);
        outc += vec3(0.6, 0.8, 1.0) * uFlash * 0.9 * (1.0 - smoothstep(0.0, 0.5, vRho));
      }

      // ---- cracks: white-hot while the core still lives, black when it is dead
      if(uCrack > 0.001){
        float cp = seamD + (fbm2(vec2(sec * 0.3, uRing * 5.0)) - 0.5) * 7.0;
        float main = aaLine(abs(cp), 0.35, px);
        // long fractures that grow outward from the break lines; only part of the ring is ever crazed
        vec2 c2 = voro(lc * vec2(0.026, 0.05) + 5.0 + uRing);
        float grow = 1.0 - smoothstep(0.0, 150.0 * uCrack * uCrack + 10.0, seamD);
        float patchy = smoothstep(0.42, 0.5, fbm2(lc * 0.012 + 3.0 + uRing));
        float net = aaLine(c2.x / 0.04, 0.16, px * 0.7) * grow * patchy * smoothstep(0.05, 0.25, uCrack);
        float crack = clamp(max(main * smoothstep(0.05, 0.3, uCrack), net), 0.0, 1.0);
        vec3 hot = mix(vec3(1.0, 0.45, 0.28), vec3(1.25, 1.2, 1.08), uCharge) * (1.0 + 2.0 * uCharge);
        outc = mix(outc, mix(vec3(0.03, 0.03, 0.06), hot, 1.0 - uDead), crack);
      }
      if(uDead > 0.001){
        float l = dot(outc, vec3(0.3, 0.55, 0.15));
        outc = mix(outc, mix(vec3(l), outc, 0.72) * vec3(0.98, 0.97, 1.04), uDead * 0.8);
        outc *= 1.0 + 0.3 * uDead * glaze;
        float afterF = smoothstep(0.1, 0.5, nc) / (1.0 + pow(dc / 190.0, 2.0));
        outc += col * vec3(1.0, 0.42, 0.2) * floor(afterF * uAfter * 4.0 + 0.5) / 4.0 * 1.5;
      }

      float id = part < 0.5 || part > 4.5 ? 20.0 + uRing : (part < 1.5 ? 25.0 + mod(uRing, 2.0) : (part < 2.5 ? 27.0 : (part < 3.5 ? 28.0 : 25.0 + mod(uRing, 2.0))));
      writeOut(outc, 1.0, NV, vDepth, id);
    }
  `;
  return new THREE.ShaderMaterial({ glslVersion: THREE.GLSL3, uniforms: u, vertexShader: vs, fragmentShader: fs, side: THREE.DoubleSide });
}
