import * as THREE from 'three';
import { G, COMMON, MRT_OUT, VERT_STD } from './glsl.js';
import { DETAIL_GLSL } from './detail.js';

// MECH dept: cel-painted riveted metal, three scales of surface detail that fade by pixel footprint and distance.
// Macro: paint blotches, soot, oil runs. Meso: plate seams, rivet rows, dribble stains. Micro: chips, grain.
// Lights: the moon comes in through uKeyDir; muzzle, beams and explosions are hard-banded point and line lights set per frame.

// shared per-frame light state (one object, every material references the same {value}s)
export const ML = {
  uLP: { value: [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()] },
  uLC: { value: [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()] },
  uLR: { value: [1, 1, 1, 1] },
  uSegA: { value: [new THREE.Vector3(), new THREE.Vector3()] },
  uSegB: { value: [new THREE.Vector3(), new THREE.Vector3()] },
  uSegC: { value: [new THREE.Vector3(), new THREE.Vector3()] },
  uSegR: { value: [1, 1] },
};

export function mechMaterial(o = {}) {
  const u = {
    ...G, ...ML,
    uSeamFront: { value: -999 },      // local z of the igniting front (emis 1 seams)
    uSeamK: { value: 0 },
    uLens: { value: 1 },              // emis 2: the Heron's lens
    uHeat: { value: 0 },              // barrel tube glow (emis 5)
    uHeatFront: { value: 90 },
    uScorch: { value: 0 },            // burned paint
    uScorchC: { value: new THREE.Vector3(0, 12, 0) },
    uWarK: { value: 1 },              // how much the shared war lights count on this body (s25: the Heron must stay readable next to the beam)
    uDarkRim: { value: 0 },           // cold moon line along the top edge of the silhouette (cannon only)
    uDark: { value: 0 },              // the machine as a black silhouette (s01b): only its emissive parts survive
    uChargeK: { value: 0 },           // ice-blue charge: seams and bore run cold white-blue instead of amber
    uRimC: { value: new THREE.Color(0, 0, 0) },   // coloured contour light, e.g. the charge around a silhouette
    uLitGain: { value: 1 },           // moonlit albedo lift for saturated colours (copper and teal go dark under blue light)
    uSil: { value: 0 },               // silhouette against a white beam
    uSilRim: { value: new THREE.Color('#fff6e2') },
    uHoleR: { value: -1 },            // shield: melted hole radius in local xy
    uHoleC: { value: new THREE.Vector2(0, 0) },
    uHoleSeed: { value: 0 },
  };
  const skin = o.skin ? { SKIN: 1 } : {};
  const hole = o.hole ? { HOLE: 1 } : {};
  const vs = /* glsl */ `
    attribute vec3 aCol;
    attribute vec4 aMat;
    attribute vec3 aEx;
    attribute vec3 aPan;
    #ifdef SKIN
    attribute vec3 aRest;
    varying vec3 vRest;
    #endif
    varying vec3 vCol, vLocal, vLocalN, vEx, vPan;
    varying vec4 vMat;
    ${VERT_STD}
    void main(){
      vCol = aCol; vMat = aMat; vEx = aEx; vPan = aPan; vLocal = position; vLocalN = normal;
      #ifdef SKIN
      vRest = aRest;
      #endif
      stdVertex(position, normal);
    }
  `;
  const fs = /* glsl */ `
    ${COMMON}
    ${DETAIL_GLSL}
    ${MRT_OUT}
    uniform vec3 uLP[4], uLC[4], uSegA[2], uSegB[2], uSegC[2];
    uniform float uLR[4], uSegR[2];
    uniform float uSeamFront, uSeamK, uLens, uHeat, uHeatFront, uScorch, uSil, uHoleR, uHoleSeed, uLitGain, uChargeK, uDark, uWarK, uDarkRim;
    uniform vec3 uScorchC, uSilRim, uRimC;
    uniform vec2 uHoleC;
    varying vec3 vWorld, vNormalW, vNormalV, vCol, vLocal, vLocalN, vEx, vPan;
    varying vec4 vMat;
    varying float vDepth;
    varying vec2 vUv;
    #ifdef SKIN
    varying vec3 vRest;
    #endif

    float holeD(vec2 p){
      vec2 q = p - uHoleC; float r = length(q) + 1e-4, a = atan(q.y, q.x);
      float lobes = 1.0 + 0.28 * sin(5.0 * a + 1.3 + uHoleSeed) + 0.16 * sin(9.0 * a + 4.1) + 0.08 * sin(17.0 * a + 0.7);
      return uHoleR * lobes - r;   // > 0 inside the hole
    }

    vec3 dynLight(vec3 N, vec3 P){
      vec3 sum = vec3(0.0);
      for(int i = 0; i < 4; i++){
        if(dot(uLC[i], vec3(1.0)) < 0.001) continue;
        vec3 L = uLP[i] - P; float d = length(L); L /= d;
        float nl = dot(N, L);
        float band = smoothstep(0.0, 0.1, nl) * (0.78 + 0.22 * step(0.55, nl));
        float r2 = uLR[i] * uLR[i];
        sum += uLC[i] * band * r2 / (r2 + d * d);
      }
      for(int i = 0; i < 2; i++){
        if(dot(uSegC[i], vec3(1.0)) < 0.001) continue;
        vec3 ab = uSegB[i] - uSegA[i];
        float h = clamp(dot(P - uSegA[i], ab) / dot(ab, ab), 0.0, 1.0);
        vec3 L = uSegA[i] + ab * h - P; float d = length(L); L /= max(d, 0.01);
        float nl = dot(N, L);
        float band = smoothstep(-0.05, 0.08, nl) * (0.8 + 0.2 * step(0.5, nl));
        float r2 = uSegR[i] * uSegR[i];
        sum += uSegC[i] * band * r2 / (r2 + d * d);
      }
      return sum;
    }

    void main(){
      float dHole = 1e3;
      #ifdef HOLE
      if(uHoleR > 0.0){
        #ifdef SKIN
        dHole = -holeD(vRest.xy);
        #else
        dHole = -holeD(vLocal.xy);
        #endif
        if(dHole < 0.0) discard;
      }
      #endif
      if(uPass > 0.5 && uPass < 1.5){ oColor = vec4(1); oData = vec4(0); return; }

      vec3 N = normalize(vNormalW), NV = normalize(vNormalV);
      if(!gl_FrontFacing){ N = -N; NV = -NV; }
      vec3 V = normalize(cameraPosition - vWorld);
      vec3 col = vCol;
      float metal = vMat.x, detail = vMat.y, emis = vMat.z, idF = floor(vMat.w + 0.5);
      float edge = vEx.x, wearK = vEx.y, seam = vEx.z;
      float pw = vPan.x, ph = vPan.y, riv = vPan.z;
      float dist = vDepth;
      vec3 p = vLocal;
      vec2 uv = vUv;
      float px = max(length(vec2(dFdx(uv.x), dFdy(uv.x))), length(vec2(dFdx(uv.y), dFdy(uv.y))));
      px = max(px, 1e-4);

      // ---- meso: plate grid in metres, staggered courses like riveted boiler plate
      float row = floor(uv.y / ph);
      vec2 q = vec2(uv.x / pw + fract(row * 0.37) * 0.8, uv.y / ph);
      vec2 cell = floor(q), f = fract(q);
      vec2 pm = f * vec2(pw, ph);
      float dE = min(min(pm.x, pw - pm.x), min(pm.y, ph - pm.y));
      float lineW = 0.02 + 0.006 * ph;
      float lineAA = clamp(lineW / px * 2.2, 0.0, 1.0);               // the seam fades with footprint, never thickens to noise
      float seamL = clamp((lineW + px * 0.5 - dE) / px, 0.0, 1.0) * lineAA * detail;
      float plateN = hash12(cell + 7.0);
      float plateFade = smoothstep(0.7, 0.18, px);                    // far: no per-plate tone, solid cel
      col *= 1.0 + (plateN - 0.5) * 0.11 * plateFade * detail;

      // ---- rivet rows along plate edges
      float rivM = 0.0, rivH = 0.0, dribble = 0.0;
      if(riv > 0.0 && px < riv * 0.5){
        float inset = 0.13 + ph * 0.05;
        vec2 d1 = vec2(mod(pm.x + riv * 0.5, riv) - riv * 0.5, min(pm.y, ph - pm.y) - inset);
        vec2 d2 = vec2(min(pm.x, pw - pm.x) - inset, mod(pm.y + riv * 0.5, riv) - riv * 0.5);
        vec2 dr = abs(length(d1)) < abs(length(d2)) ? d1 : d2;
        float rr = length(dr), R = 0.075 + riv * 0.05;
        float rFade = smoothstep(riv * 0.5, riv * 0.15, px) * smoothstep(R * 2.2, R * 0.6, px);
        rivM = (1.0 - smoothstep(R - px, R + px, rr)) * rFade * detail;
        rivH = (1.0 - smoothstep(R * 0.45 - px, R * 0.45 + px, length(dr - vec2(-R * 0.25, R * 0.3)))) * rFade * detail;
        // rust dribble below some rivets
        float cn = hash12(floor((uv + vec2(riv * 0.5)) / riv) + cell);
        if(cn > 0.7 && d1.y < 0.0 && abs(d1.x) < 0.05 + 0.04 * cn && -d1.y < 0.5 + 2.0 * (cn - 0.7) / 0.3)
          dribble = rFade;
      }

      // ---- macro + micro from the shared detail library (kind 2 = metal)
      vec3 sd = surfaceDetail(p, dist, 2.0);
      float nearD = 1.0 - smoothstep(35.0, 260.0, dist);
      col *= mix(1.0, sd.x + 0.26 * sd.y, 0.55 * detail);
      col = mix(col, col * vec3(0.78, 0.74, 0.76), sd.y * 0.3 * nearD * detail * wearK * smoothstep(0.6, 0.68, fbm3(p * 0.11 + 13.0)));

      float blotch = fbm3(p * 0.045 + 3.1);
      float bleach = step(0.6, blotch) * (1.0 - 0.0);
      col = mix(col, col * vec3(1.05, 1.03, 0.98), bleach * detail * 0.5);
      float soot = fbm3(vec3(p.x * 0.09, p.y * 0.26, p.z * 0.09) + 5.0);
      col = mix(col, col * vec3(0.8, 0.76, 0.76), step(0.62, soot) * detail * wearK);

      // oil and rust runs: stretched down the panel, hard edged, thinning by distance
      float oilN = fbm3(vec3(p.x * 1.6, p.y * 0.11, p.z * 1.6) + 7.0);
      float oilM = smoothstep(0.685, 0.70, oilN) * smoothstep(0.45, 0.6, fbm3(p * 0.4 + 2.0)) * smoothstep(320.0, 60.0, dist) * detail * wearK;
      col = mix(col, col * vec3(0.5, 0.42, 0.42), oilM);
      float rustR = fbm3(vec3(p.x * 1.0, p.y * 0.08, p.z * 1.0) + 19.0);
      float rustM = smoothstep(0.7, 0.72, rustR) * smoothstep(320.0, 60.0, dist) * detail * wearK;
      col = mix(col, mix(col, vec3(0.5, 0.25, 0.15), 0.7), rustM);
      col = mix(col, mix(col, vec3(0.42, 0.2, 0.13), 0.75), dribble * 0.85 * wearK);

      // chips: bare metal with a pale primer rim, thickest along seams and bevels
      float edgeProx = max(smoothstep(0.28, 0.02, dE), edge);
      float chipN = fbm3(p * 4.2 + 11.0) + 0.3 * vnoise3(p * 17.0) + 0.14 * edgeProx - 0.08 * (1.0 - edgeProx);
      float chipT = 0.97 - 0.05 * wearK;
      float chipFade = smoothstep(90.0, 22.0, dist);
      float chip = smoothstep(chipT, chipT + 0.01, chipN) * chipFade * detail * wearK;
      float chipRim = smoothstep(chipT - 0.035, chipT - 0.03, chipN) * (1.0 - chip) * chipFade * detail * wearK;
      vec3 bare = mix(vCol, vec3(0.20, 0.17, 0.17), 0.8);
      col = mix(col, mix(col, vec3(0.88, 0.82, 0.68), 0.5), chipRim * 0.6);
      col = mix(col, bare, chip);
      // polished worn bevels catch light
      col = mix(col, col * vec3(1.18, 1.14, 1.08), smoothstep(0.2, 0.9, edge) * 0.8);

      // panel seam: inked groove, a warm dirty halo below it
      col = mix(col, col * vec3(0.55, 0.5, 0.56), seamL * 0.85);
      col = mix(col, col * 0.62, rivM * 0.75);
      col = mix(col, col * 1.55, rivH * 0.85);

      // ---- two hard tones (moon key), third deep tone
      float ndl = dot(N, uKeyDir);
      float sh = sunShadow(vWorld, N);
      float lit = smoothstep(-0.03, 0.05, ndl) * sh;
      vec3 litCol = col * mix(uSkyTint, uSunColor * 1.06, uSunStrength) * uLitGain;
      float up = smoothstep(-0.7, 0.6, N.y);
      float skyN = 0.5 + 0.5 * N.y;
      vec3 shadeCol = col * uShadeTint * mix(uBounce, vec3(1.0), up) * 1.4 + col * vec3(0.2, 0.3, 0.72) * (0.2 + 0.32 * skyN);
      vec3 outc = mix(mix(shadeCol, litCol, 0.1), litCol, lit);
      float deep = step(ndl, -0.45) * step(N.y, -0.3);
      outc = mix(outc, col * uDeepTint * 1.5, deep * 0.85);

      // metal: a hard painted sky band reflected in lit faces
      vec3 R = reflect(-V, N);
      float bandR = smoothstep(0.32, 0.36, R.y) * (1.0 - smoothstep(0.62, 0.66, R.y));
      outc = mix(outc, outc * vec3(1.12, 1.18, 1.3), bandR * metal * lit * 0.6 * nearD);

      vec3 H = normalize(uKeyDir + V);
      float sp = dot(N, H);
      // a small drawn glint that follows the form: a thin curved stroke on bright metal, nothing on paint
      float spec = 0.0;   // drawn specular removed: the ink and the sky rim carry the metal
      outc = mix(outc, mix(vec3(1.0), uSunColor, 0.3) * 1.05, spec * smoothstep(0.5, 0.85, metal) * 0.55 * (1.0 - seamL));
      // moon rim
      float fres = 1.0 - max(dot(N, V), 0.0);
      float back = smoothstep(0.1, 0.5, dot(-V, uKeyDir));
      float rimL = smoothstep(0.68, 0.72, fres) * smoothstep(-0.05, 0.15, ndl) * back * uSunStrength;
      outc = mix(outc, uSunColor * 1.15, rimL * 0.8);
      outc += uRimC * smoothstep(0.52, 0.86, fres) * (0.35 + 0.65 * smoothstep(-0.4, 0.6, N.y));
      // cool sky rim on the shadow side so dark shapes never merge with the night
      float rimS0 = smoothstep(0.62, 0.8, fres) * (1.0 - lit) * smoothstep(-0.3, 0.5, N.y);
      outc += col * vec3(0.3, 0.42, 0.85) * rimS0 * 0.55 + vec3(0.03, 0.05, 0.13) * rimS0;

      // ---- scorch: char blossoms from the heat centre on burned parts
      if(uScorch > 0.001){
        float d = length(vLocal - uScorchC);
        float sc = fbm3(p * 0.3 + 5.0) + 0.5 * uScorch - d * 0.012;
        float mask = smoothstep(0.62, 0.66, sc);
        outc = mix(outc, outc * vec3(0.18, 0.16, 0.18), mask * smoothstep(0.0, 0.5, uScorch));
      }

      // ---- dynamic lights (muzzle, beams, blasts)
      outc += col * dynLight(N, vWorld);       // MECH-only cheats (heat glow on the chest, shield bounce)
      outc += warLight(col, vWorld, N) * uWarK;        // beams, muzzle, blasts from every department

      // ---- silhouette against a white beam
      if(uSil > 0.001){
        vec3 sil = mix(outc * 0.28, vec3(0.06, 0.05, 0.13), 0.6);
        outc = mix(outc, sil, uSil);
        float rimS = smoothstep(0.66, 0.86, fres);
        outc = mix(outc, uSilRim * (1.0 + 1.2 * rimS), rimS * 0.7 * uSil);
      }

      outc = mix(outc, outc * 0.05 + vec3(0.004, 0.005, 0.011), uDark);
      if(uDark * uDarkRim > 0.0){
        // the top chords' upper metre catches the moon; the top faces too, for anything seen from above
        float topY = p.z < 14.0 ? 8.3 : (p.z > 176.0 ? 7.5 : mix(15.5, 9.0, clamp(p.z / 180.0, 0.0, 1.0)) + 2.05);
        float band = smoothstep(topY - 1.15, topY - 0.25, p.y) * ((p.z < 14.0 || p.z > 176.0) ? step(p.y, topY + 0.4) : 1.0);
        float edge = smoothstep(0.62, 0.9, fres) * smoothstep(-0.1, 0.6, N.y);
        outc += vec3(0.42, 0.62, 1.15) * uDark * uDarkRim * max(max(band * 0.85, smoothstep(0.55, 0.9, N.y) * 0.5), edge * 0.7);
      }

      // ---- emissive classes
      if(emis > 0.5 && emis < 1.5){
        // power seams: run from breech to muzzle with a white leading edge
        float k = smoothstep(uSeamFront + 1.0, uSeamFront - 14.0, p.z) * uSeamK;
        float lead = smoothstep(14.0, 2.0, abs(p.z - uSeamFront)) * uSeamK;
        vec3 seamCol = mix(vec3(1.9, 1.15, 0.42), vec3(0.75, 1.5, 2.6), uChargeK);
        outc = mix(outc, seamCol * (1.0 + 2.0 * lead) + vec3(0.8) * lead, clamp(k + lead, 0.0, 1.0));
      } else if(emis > 1.5 && emis < 2.5){
        float fr = smoothstep(0.75, 0.97, max(dot(N, V), 0.0));
        outc = mix(vec3(0.12, 0.03, 0.03), mix(vec3(1.3, 0.34, 0.12), vec3(1.5, 1.25, 0.8), fr), uLens);
      } else if(emis > 2.5 && emis < 3.5){
        // indicator lamps on the machines
        outc = mix(vec3(1.4, 0.82, 0.32), vec3(0.6, 1.2, 2.0), uChargeK * smoothstep(uSeamFront + 2.0, uSeamFront - 8.0, p.z)) * mix(0.62, 1.0, uSeamK);
      } else if(emis > 5.5){
        // cooling fins: light up from the breech with the charge, brightest low in the pack, ribbed by the darker fins
        float fk = uChargeK * smoothstep(uSeamFront + 4.0, uSeamFront - 12.0, p.z);
        float lead = smoothstep(8.0, 1.0, abs(p.z - uSeamFront)) * uChargeK;
        outc = mix(outc, vec3(0.42, 0.95, 1.9) * (1.0 + 0.5 * lead), clamp(fk * (0.55 + 0.45 * smoothstep(5.0, -7.0, p.y - 0.0)) + lead, 0.0, 1.0));
      } else if(emis > 4.5){
        float h = smoothstep(uHeatFront - 90.0, uHeatFront + 40.0, p.z) * uHeat;
        outc = mix(outc, mix(mix(vec3(0.75, 0.13, 0.06), vec3(0.2, 0.55, 1.5), uChargeK), mix(vec3(1.7, 0.75, 0.25), vec3(1.4, 2.2, 3.2), uChargeK), h), clamp(h * 1.4, 0.0, 1.0));
      }

      // ---- the molten edge of the shield hole
      if(dHole < 40.0){
        float e = dHole;
        vec3 mcol = e < 0.5 ? vec3(2.2, 1.9, 1.3) : (e < 1.6 ? vec3(1.9, 0.82, 0.24) : (e < 3.8 ? vec3(0.95, 0.27, 0.09) : vec3(0.36, 0.1, 0.08)));
        outc = mix(outc, mcol, smoothstep(7.5, 3.5, e));
        // heat-blackened halo further out
        outc = mix(outc, outc * vec3(0.26, 0.2, 0.24), smoothstep(15.0, 7.5, e) * (1.0 - smoothstep(7.5, 3.5, e)));
      }
      writeOut(outc, 1.0, NV, vDepth, idF);
    }
  `;
  return new THREE.ShaderMaterial({ glslVersion: THREE.GLSL3, uniforms: u, vertexShader: vs, fragmentShader: fs, defines: { ...skin, ...hole }, side: THREE.DoubleSide, transparent: false, extensions: {} });
}

// A plain unlit panel: the in-world POWER counter and hull stencils use it, ink-free (id 130+).
export function panelMaterial(tex, o = {}) {
  const u = { ...G, uMap: { value: tex }, uTint: { value: new THREE.Color(o.tint ?? '#ffffff') }, uDim: { value: 1 }, uId: { value: o.id ?? 131 } };
  const vs = `${VERT_STD} void main(){ stdVertex(position, normal); }`;
  const fs = `${COMMON} ${MRT_OUT}
    uniform sampler2D uMap; uniform vec3 uTint; uniform float uDim, uId;
    varying vec3 vWorld, vNormalW, vNormalV; varying float vDepth; varying vec2 vUv;
    void main(){
      if(uPass > 0.5 && uPass < 1.5){ oColor = vec4(1); oData = vec4(0); return; }
      vec4 m = texture(uMap, vUv);
      writeOut(m.rgb * uTint * uDim, 1.0, normalize(vNormalV), vDepth, uId);
    }`;
  return new THREE.ShaderMaterial({ glslVersion: THREE.GLSL3, uniforms: u, vertexShader: vs, fragmentShader: fs, side: THREE.DoubleSide });
}
