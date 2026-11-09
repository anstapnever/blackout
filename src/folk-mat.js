import * as THREE from 'three';
import { G, COMMON, MRT_OUT, VERT_STD } from './glsl.js';
import { DETAIL_GLSL } from './detail.js';

// BLACKOUT: every folk surface (characters and their sets) reads the shot's own light rig from FL, set per shot in
// folk-lights.js, so a cockpit is lit by what is in it (scope, alarm lamps, seams) and not by the global moon.
export const FL = {
  uFKey: { value: new THREE.Color('#ffffff') }, uFShade: { value: new THREE.Color('#505878') },
  uFBounce: { value: new THREE.Color('#000000') }, uFBounceDir: { value: new THREE.Vector3(0, -1, 0) },
  uFRim: { value: new THREE.Color('#ffffff') }, uFRimDir: { value: new THREE.Vector3(0, 1, 0) },
  uFP0: { value: new THREE.Vector3() }, uFP0C: { value: new THREE.Color('#000000') },
  uFP1: { value: new THREE.Vector3() }, uFP1C: { value: new THREE.Color('#000000') },
  uFPR: { value: new THREE.Vector2(0.6, 0.6) },
  uFFace: { value: 0 }, uFFaceKey: { value: new THREE.Color('#ffffff') }, uFFaceShade: { value: new THREE.Color('#808090') }, uFFaceV: { value: new THREE.Vector3(-0.6, 0.55, 0.55) },
  uFSet: { value: new THREE.Color('#ffffff') }, uFSeam: { value: new THREE.Vector4(0, 0, 0, 0) }, uFSeamC: { value: new THREE.Color('#ffffff') }, uFSeamFP: { value: new THREE.Vector2(7, 0) },
};

// Folk materials: soft-edged cel fur / cloth (two hard tones, fur-serrated terminator, warm rim),
// and the anime eye (white, gradient iris, pupil, two highlights, lids and lashes drawn in the shader).

const FUR_VS = /* glsl */ `
  attribute vec3 aCol;
  attribute vec3 aCol2;
  attribute float aMask;
  varying vec3 vCol, vCol2;
  varying float vMask;
  varying vec3 vLocal;
  ${VERT_STD}
  void main(){ vCol = aCol; vCol2 = aCol2; vMask = aMask; vLocal = position; stdVertex(position, normal); }
`;

const LIGHT = /* glsl */ `
  // two hard tones + a soft bounce, up to two practical lights with stepped falloff, a directional rim, and seam bars
  uniform float uShOff;
  #ifndef SEAMCAP
  #define SEAMCAP 0.8
  #endif
  uniform float uFFace, uFaceMat;
  uniform vec3 uFFaceKey, uFFaceShade, uFFaceV;
  uniform vec3 uFKey, uFShade, uFBounce, uFBounceDir, uFRim, uFRimDir, uFP0, uFP0C, uFP1, uFP1C, uFSeamC;
  uniform vec2 uFPR, uFSeamFP;
  uniform vec4 uFSeam;
  vec3 practical(vec3 col, vec3 N, vec3 P, vec3 C, float R, float serr){
    vec3 L = P - vWorld; float d = length(L); L /= max(d, 1e-4);
    float band = smoothstep(0.0, 0.06, dot(N, L) + serr);
    float a = R * R / (R * R + d * d);
    return col * C * band * (smoothstep(0.14, 0.18, a) * 0.5 + smoothstep(0.42, 0.47, a) * 0.5);
  }
  vec3 folkLight(vec3 col, vec3 N, vec3 V, float fur, vec3 lp, float rimK, float gloss){
    float ndl = dot(N, uKeyDir);
    // fur breaks the terminator into small serrations, only where it is already tight on screen
    float serr = (vnoise3(lp * 90.0) - 0.5) * 0.12 * fur * clamp(fwidth(ndl) * 30.0, 0.0, 1.0);
    float sh = sunShadow(vWorld + uKeyDir * uShOff, N);
    float lit = smoothstep(-0.02, 0.04, ndl + serr) * sh;
    vec3 o = mix(col * uFShade, col * uFKey, lit);
    o += col * uFBounce * smoothstep(0.05, 0.6, dot(N, uFBounceDir)) * (1.0 - lit * 0.8);
    o += practical(col, N, uFP0, uFP0C, uFPR.x, serr);
    o += practical(col, N, uFP1, uFP1C, uFPR.y, serr);
    // close-ups: a clean two-tone face key in the design's own colours, placed relative to the camera (cel-anime cheat)
    if(uFaceMat * uFFace > 0.001){
      vec3 fd = normalize(vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]) * uFFaceV.x + vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]) * uFFaceV.y + vec3(viewMatrix[0][2], viewMatrix[1][2], viewMatrix[2][2]) * uFFaceV.z);
      o = mix(o, col * mix(uFFaceShade, uFFaceKey, smoothstep(-0.03, 0.03, dot(N, fd))), uFaceMat * uFFace);
    }
    float fres = 1.0 - max(dot(N, V), 0.0);
    float rim = smoothstep(0.6, 0.7, fres) * smoothstep(0.02, 0.32, dot(N, uFRimDir)) * rimK;
    o = mix(o, col * uFRim + uFRim * 0.1, rim * 0.85);
    // soft knee: no light in the table may push a lit surface past the grade's white or into the bloom (hue is kept)
    { float kn = max(o.r, max(o.g, o.b)); if(kn > 0.6){ o *= (0.6 + 0.24 * (1.0 - exp(-(kn - 0.6) / 0.24))) / kn; } }
    if(uFSeam.w > 0.001){
      vec3 q = vWorld - uFSeam.xyz;
      float a = atan(q.x, q.z + 1e-4) * uFSeamFP.x + uFSeamFP.y;
      float bar = smoothstep(0.13, 0.095, abs(fract(a) - 0.5));
      o = mix(o, min(uFSeamC, vec3(SEAMCAP)), bar * uFSeam.w * smoothstep(-0.2, 0.3, dot(N, -normalize(q))));
    }
    vec3 H = normalize(uKeyDir + V);
    float sp = step(0.975, dot(N, H)) * lit * gloss;
    o = mix(o, vec3(1.0), sp * 0.85);
    return o;
  }
`;

export function furMaterial(o = {}) {
  const u = {
    ...G, ...FL,
    uColor: { value: new THREE.Color(o.color ?? '#ffffff') },
    uId: { value: o.id ?? 40 },
    uFur: { value: o.fur ?? 1 },
    uRim: { value: o.rim ?? 1 },
    uFaceMat: { value: o.face ?? 0 },
    uGloss: { value: o.gloss ?? 0 },
    uFold: { value: o.fold ?? 0 },
    uAlphaCut: { value: 0 },
    uTint: { value: new THREE.Vector4(1, 1, 1, 0) },
  };
  const fs = /* glsl */ `
    ${COMMON}
    ${MRT_OUT}
    uniform vec3 uColor;
    uniform float uId, uFur, uRim, uGloss, uFold;
    uniform vec4 uTint;
    varying vec3 vWorld, vNormalW, vNormalV, vCol, vCol2, vLocal;
    varying float vMask;
    varying float vDepth;
    varying vec2 vUv;
    ${LIGHT}
    void main(){
      if(uPass > 0.5 && uPass < 1.5){ oColor = vec4(1); oData = vec4(0); return; }
      vec3 N = normalize(vNormalW), NV = normalize(vNormalV);
      if(!gl_FrontFacing){ N = -N; NV = -NV; }
      vec3 V = normalize(cameraPosition - vWorld);
      // hard-edged colour pattern: the mask is smooth per vertex, thresholded per pixel
      vec3 col = uColor * mix(vCol, vCol2, step(0.5, vMask));
      col = mix(col, uTint.rgb, uTint.a);
      vec3 c = folkLight(col, N, V, uFur, vLocal, uRim, uGloss);
      writeOut(c, 1.0, NV, vDepth, uId);
    }
  `;
  return new THREE.ShaderMaterial({ glslVersion: THREE.GLSL3, uniforms: u, vertexShader: FUR_VS, fragmentShader: fs, side: o.side ?? THREE.FrontSide });
}

// ------------------------------------------------------------------ anime eye
// The eye is a unit sphere scaled flat (mesh.scale = rx, ry, rz) facing +Z. Everything inside is drawn here:
// the upper lid (skin colour, written with the HEAD's ink id so the ink line follows the lid edge), the lash line,
// the white with the lid's cool shadow, the iris (vertical gradient, light crescent, striations, limbal ring),
// pupil, two highlights and, when wet, a trembling tear line and extra glints.

// glasses lenses: the glare is painted by the surfaces BEHIND the lens (ray from the camera through the lens plane),
// so it needs no transparent mesh and draws no ink outline: warm dusty diagonal streaks, specks and a soft sheen
export const LENS = /* glsl */ `
  uniform vec3 uLC0, uLC1, uLN0, uLN1, uLX0, uLX1;
  uniform vec2 uLR;
  uniform float uLensK;
  vec3 lensOne(vec3 col, vec3 wp, vec3 C, vec3 Nl, vec3 X){
    vec3 ro = cameraPosition, rd = wp - ro; float L = length(rd); rd /= L;
    float dn = dot(rd, Nl); if(abs(dn) < 1e-4) return col;
    float tt = dot(C - ro, Nl) / dn; if(tt <= 0.0 || tt > L - 1e-4) return col;
    vec3 h = ro + rd * tt - C; vec3 Y = normalize(cross(Nl, X));
    vec2 q = vec2(dot(h, X) / uLR.x, dot(h, Y) / uLR.y); float rr = length(q);
    if(rr > 0.97) return col;
    float s = q.x * 0.72 + q.y * 0.69;
    float b1 = smoothstep(0.13, 0.07, abs(s - 0.28)), b2 = smoothstep(0.05, 0.025, abs(s - 0.58));
    float dust = step(0.92, vnoise(q * 38.0)) * 0.45 + smoothstep(0.6, 0.9, vnoise(q * 6.0 + 3.0)) * 0.12;
    float sheen = 0.05 + 0.07 * smoothstep(1.0, 0.2, rr);
    vec3 gc = vec3(1.0, 0.88, 0.64);
    return mix(col, gc * 1.05, clamp((b1 * 0.42 + b2 * 0.6 + dust * 0.4 + sheen) * uLensK, 0.0, 0.85));
  }
  vec3 lensGlare(vec3 col, vec3 wp){
    if(uLensK < 0.01) return col;
    col = lensOne(col, wp, uLC0, uLN0, uLX0);
    return lensOne(col, wp, uLC1, uLN1, uLX1);
  }
`;
export const lensUniforms = () => ({
  uLC0: { value: new THREE.Vector3() }, uLC1: { value: new THREE.Vector3() }, uLN0: { value: new THREE.Vector3(0, 0, 1) }, uLN1: { value: new THREE.Vector3(0, 0, 1) },
  uLX0: { value: new THREE.Vector3(1, 0, 0) }, uLX1: { value: new THREE.Vector3(1, 0, 0) }, uLR: { value: new THREE.Vector2(0.05, 0.06) }, uLensK: { value: 0 },
});

export function eyeMaterial(o = {}) {
  const u = {
    ...G, ...FL,
    uSkin: { value: new THREE.Color(o.skin ?? '#c86a3a') },
    uSkinLow: { value: new THREE.Color(o.skinLow ?? o.skin ?? '#c86a3a') },
    uIris: { value: new THREE.Color(o.iris ?? '#3fa58a') },
    uIrisDark: { value: new THREE.Color(o.irisDark ?? '#173c3a') },
    uIrisLight: { value: new THREE.Color(o.irisLight ?? '#a8f0d0') },
    uLash: { value: new THREE.Color(o.lash ?? '#2a1a22') },
    uId: { value: o.id ?? 42 },
    uSkinId: { value: o.skinId ?? 41 },
    uSide: { value: o.side ?? 1 },          // +1 left eye (character's left = screen right when facing camera), -1 right
    uLidT: { value: 0 },                     // upper lid closure 0 open .. 1 shut
    uLidB: { value: 0 },                     // lower lid raise 0..1
    uTilt: { value: 0 },                     // + worried (inner corner up), - angry (inner corner down)
    uLook: { value: new THREE.Vector2(0, 0) },
    uPupil: { value: o.pupil ?? 0.42 },
    uIrisR: { value: o.irisR ?? 0.6 },
    uWet: { value: 0 },
    uDetail: { value: o.detail ?? 0 }, uFaceMat: { value: 1 },
    uShine: { value: 1 },
    uLashW: { value: o.lashW ?? 0.15 },
    uRound: { value: o.round ?? 0 },         // 1 = no lid arch (glasses / round eyes)
    uPatch: { value: o.patch ? 1 : 0 },      // 1 = the eye is a patch of the face skin: lid/skin pixels are discarded (skin shows)
    uRefl: { value: 0 },                     // the giant's head reflected in the iris (dark disc + bright slit)
    ...lensUniforms(),
  };
  const vs = /* glsl */ `
    varying vec3 vLocal;
    ${VERT_STD}
    void main(){ vLocal = position; stdVertex(position, normal); }
  `;
  const fs = /* glsl */ `
    ${COMMON}
    ${MRT_OUT}
    uniform vec3 uSkin, uSkinLow, uIris, uIrisDark, uIrisLight, uLash;
    uniform float uId, uSkinId, uSide, uLidT, uLidB, uTilt, uPupil, uIrisR, uWet, uDetail, uShine, uLashW, uRound, uPatch, uRefl;
    ${LENS}
    uniform vec2 uLook;
    varying vec3 vWorld, vNormalW, vNormalV, vLocal;
    varying float vDepth;
    varying vec2 vUv;
    ${LIGHT}
    float ell(vec2 p, vec2 c, vec2 r){ return length((p - c) / r); }
    void main(){
      if(uPass > 0.5 && uPass < 1.5){ oColor = vec4(1); oData = vec4(0); return; }
      vec3 N = normalize(vNormalW), NV = normalize(vNormalV);
      vec3 V = normalize(cameraPosition - vWorld);
      vec2 p = vLocal.xy;
      // x mirrored so +x is always toward the OUTER corner
      float xo = p.x * uSide;
      float t = uDrawTime;
      // ---- lid edges
      float arch = mix(0.30, 0.08, uRound);
      float yU = mix(1.02, -0.14, uLidT) - arch * xo * xo * (1.0 - 0.7 * uLidT) + uTilt * (-xo) * 0.35 * (1.0 - uLidT)
                 + 0.06 * xo * (1.0 - uRound);
      float yL = mix(-0.9, -0.3, uLidB) + 0.42 * xo * xo * (1.0 - uRound * 0.5) - 0.06 * xo;
      // both lids travel: the lower one rises to meet the upper one in the middle of the eye
      yL = mix(yL, min(yL + 0.72, yU - 0.03), smoothstep(0.45, 1.0, uLidT));
      if(uLidT > 0.98){ yU = -0.14 - 0.13 * xo * xo; yL = yU - 0.05; }
      bool skin = p.y > yU || p.y < yL || vLocal.z < 0.05 || length(p * vec2(1.0, 0.97)) > 1.0;
      float flick = step(0.6, xo) * step(abs(p.y - (yU + 0.02 + (xo - 0.6) * 0.55)), 0.075) * (1.0 - uLidT) * step(0.0, vLocal.z) * (1.0 - uRound);
      if(skin && flick > 0.5){
        writeOut(uLash, 1.0, NV, vDepth, uId);
        return;
      }
      // lash band drawn just above the lid edge too (bold upper line), only on the patch eyes
      float lwOut = uLashW * 0.55 * (1.0 + 0.8 * smoothstep(0.2, 0.95, xo)) * step(abs(xo), 1.02) * (1.0 - uLidT * 0.3);
      if(skin && uPatch > 0.5 && p.y > yU && p.y < yU + lwOut && length(p * vec2(0.98, 0.9)) < 1.08){
        writeOut(uLash, 1.0, NV, vDepth, uId);
        return;
      }
      if(skin && uPatch > 0.5) discard;
      if(skin){
        vec3 c = folkLight(p.y < yL + 0.02 ? uSkinLow : uSkin, N, V, 1.0, vLocal * 0.06, 0.6, 0.0);
        writeOut(c, 1.0, NV, vDepth, uSkinId);
        return;
      }
      // ---- white
      vec3 col = vec3(0.985, 0.975, 1.0);
      float lidSh = smoothstep(0.42, 0.18, yU - p.y);
      col = mix(col, vec3(0.80, 0.80, 0.95), lidSh * 0.9);
      col = mix(col, vec3(0.90, 0.89, 0.98), smoothstep(0.25, 0.0, p.y - yL) * 0.6);
      // ---- iris
      vec2 c0 = uLook * vec2(0.42, 0.3);
      vec2 d = (p - c0) / vec2(uIrisR * 0.88, uIrisR);
      float r = length(d);
      if(r < 1.0){
        float v = clamp(0.5 - d.y * 0.5, 0.0, 1.0);          // 0 top .. 1 bottom
        vec3 ic = mix(uIrisDark, uIris, smoothstep(0.05, 0.75, v));
        // light crescent in the lower half
        float cres = smoothstep(0.45, 0.75, r) * smoothstep(0.98, 0.8, r) * smoothstep(0.0, -0.5, d.y);
        ic = mix(ic, uIrisLight, cres * 0.85);
        // radial striations (strong in the extreme close-up)
        float a = atan(d.y, d.x);
        float st = vnoise(vec2(a * 9.0, r * 2.5)) * 0.6 + vnoise(vec2(a * 23.0, r * 5.0)) * 0.4;
        ic *= mix(1.0, 0.82 + 0.34 * st, 0.2 + 0.3 * uDetail);
        // collarette ring around the pupil
        float coll = smoothstep(0.08, 0.0, abs(r - uPupil * 1.55)) * uDetail;
        ic = mix(ic, uIrisLight, coll * 0.5);
        // limbal ring
        ic = mix(ic, uIrisDark * 0.55, smoothstep(0.84, 0.95, r));
        col = ic;
        // lid shadow over the iris top
        col = mix(col, col * vec3(0.55, 0.55, 0.75), lidSh * 0.85);
        // pupil
        float pr = uPupil;
        if(r < pr){ col = mix(vec3(0.05, 0.04, 0.08), uIrisDark * 0.25, smoothstep(pr * 0.6, pr, r) * 0.6); }
        else col = mix(col, vec3(0.08, 0.06, 0.1), smoothstep(pr + 0.06, pr, r) * 0.5);
        // reflection of the giant: a dark round head with a bright vertical slit (grows as the pupil shrinks)
        if(uRefl > 0.01){
          vec2 rq = (d - vec2(0.04, 0.16)) / (0.44 * uRefl + 0.001);
          float head = smoothstep(1.0, 0.9, length(rq * vec2(1.0, 0.92)));
          float shoulders = smoothstep(0.06, -0.02, rq.y + 1.12 - 0.22 * rq.x * rq.x) * smoothstep(2.6, 2.3, abs(rq.x));
          // the bright sky mirrored on the cornea first, so the dark silhouette has something to stand against
          float sky = smoothstep(-1.25, -0.95, rq.y) * smoothstep(1.0, 0.8, r);
          col = mix(col, mix(uIrisLight, vec3(0.86, 0.9, 1.0), 0.5) * 0.95, sky * 0.62 * uRefl);
          col = mix(col, uIrisDark * 0.12, max(head, shoulders) * 0.94 * uRefl);
          float slit = smoothstep(0.11, 0.05, abs(rq.x)) * smoothstep(0.62, 0.45, abs(rq.y + 0.05));
          col = mix(col, vec3(1.0, 0.96, 0.78) * 1.3, slit * head * uRefl);
        }
      }
      { vec3 kc = mix(uFKey, uFFaceKey, uFFace); vec3 kn = kc / max(max(kc.r, max(kc.g, kc.b)), 0.001); col *= mix(vec3(1.0), kn, 0.62 - 0.52 * uFFace); }
      // ---- highlights (fixed to the eye like painted cels), shiver when wet
      vec2 sh = vec2(sin(t * 37.0), cos(t * 29.0)) * 0.015 * uWet;
      // (the main highlight shrinks and slides to the rim while the giant's reflection fills the iris)
      float hDrop = max(0.0, c0.y + 0.62 * uIrisR - (mix(1.02, -0.14, uLidT) - 0.04));
      float h1 = ell(p, c0 + vec2(-0.34 - 0.24 * uRefl, 0.36 + 0.2 * uRefl) * uIrisR - vec2(0.0, hDrop) + sh, vec2(0.24, 0.30) * uIrisR * (1.0 + 0.35 * uWet) * (1.0 - 0.5 * uRefl));
      float h2 = ell(p, c0 + vec2(0.30, -0.38) * uIrisR - sh, vec2(0.11, 0.11) * uIrisR * (1.0 + 0.4 * uWet));
      float hl = max(step(h1, 1.0), step(h2, 1.0)) * uShine;
      // a third tiny glint when wet
      float h3 = ell(p, c0 + vec2(-0.05, -0.62) * uIrisR + sh * 2.0, vec2(0.08, 0.06) * uIrisR);
      hl = max(hl, step(h3, 1.0) * uWet);
      col = mix(col, vec3(1.0), hl * 0.96);
      // ---- tears: a bright wobbling line welling on the lower lid
      float wob = yL + 0.13 + 0.035 * sin(p.x * 9.0 + t * 6.0);
      float tear = smoothstep(0.13, 0.02, abs(p.y - wob)) * uWet;
      col = mix(col, col * vec3(0.62, 0.8, 1.0) + vec3(0.04, 0.1, 0.2), tear * 0.85);      // a thick welling band of water, tinted so it reads on the white
      float men = smoothstep(0.022, 0.006, abs(p.y - wob - 0.11)) * uWet;
      col = mix(col, vec3(0.22, 0.36, 0.62), men * 0.8);                                  // dark meniscus edge on top of the water
      float tHi = smoothstep(0.03, 0.0, abs(p.y - wob - 0.06)) * smoothstep(0.9, 0.3, abs(p.x)) * uWet;
      col = mix(col, vec3(1.0), tHi * 0.97);                                              // its bright glossy rim
      col = mix(col, col * 1.06 + vec3(0.02, 0.04, 0.06), uWet * 0.4);
      // ---- lashes: thick upper line, flick at the outer corner; thin lower line on the outer half
      float lw = uLashW * (1.0 + 0.7 * smoothstep(0.2, 0.95, xo));
      float lash = step(yU - p.y, lw);
      float low = step(p.y - yL, 0.05) * smoothstep(-0.2, 0.3, xo);
      col = mix(col, uLash, max(lash, low * 0.9));
      // eyes stay bright; only a gentle cool tone in deep shadow
      float ndl = dot(N, uKeyDir);
      col *= mix(vec3(0.86, 0.87, 0.97), vec3(1.0), smoothstep(-0.6, 0.0, ndl));
      col = lensGlare(col, vWorld);
      writeOut(col, 1.0, NV, vDepth, uId);
    }
  `;
  return new THREE.ShaderMaterial({ glslVersion: THREE.GLSL3, uniforms: u, vertexShader: vs, fragmentShader: fs, side: THREE.FrontSide });
}

// ------------------------------------------------------------------ head skin
// Colour regions are analytic curves in head space (R units), anti-aliased per pixel: clean designed boundaries.
// The mouth is painted on the muzzle (opens, smiles/frowns, cat 'w' + philtrum), sockets get a soft shade,
// and in the extreme close-up (uDetail) the fur gets fine strands.
// patterns: 0 plain, 1 fox (white jaw/cheeks under a curve), 2 muzzle patch, 3 raccoon mask, 4 badger stripes,
//           5 light front face, 6 wool cap (sheep), 7 cat/lynx muzzle patch + ruff
export function headMaterial(o = {}) {
  const u = {
    ...G, ...FL,
    uR: { value: o.R ?? 0.17 },
    uBase: { value: new THREE.Color(o.base ?? '#c08060') },
    uLight: { value: new THREE.Color(o.light ?? '#fff4e8') },
    uDark: { value: new THREE.Color(o.dark ?? '#3a2a26') },
    uBlush: { value: new THREE.Color(o.blush ?? '#ff8a7a') },
    uBlushK: { value: o.blush ? 0.45 : 0 },
    uLine: { value: new THREE.Color(o.line ?? '#2a1a22') },
    uPat: { value: o.pat ?? 2 },
    uP: { value: new THREE.Vector4(...(o.p ?? [0.5, -0.3, 0.38, 0])) },
    uEye0: { value: new THREE.Vector3() }, uEye1: { value: new THREE.Vector3() }, uEyeS: { value: new THREE.Vector2(0.34, 0.42) },
    uMouthC: { value: new THREE.Vector4(-0.4, 0.3, 0.2, -0.3) },   // y, zmin, half width, nose bottom y (R units)
    uMouth: { value: 0 }, uSmile: { value: 1 }, uYMouth: { value: o.ymouth ?? 0 },
    uDetail: { value: 0 }, uFaceMat: { value: 1 },
    uShOff: { value: (o.R ?? 0.17) * 2.6 },
    uTear: { value: 0 }, uYMouthK: { value: 1 }, uNarrow: { value: 0 }, uTear2: { value: 0 }, uTeeth: { value: 0 }, uJaw: { value: 0 }, uHinge: { value: new THREE.Vector3() }, uFang: { value: o.fang ?? 0 },
    ...lensUniforms(),
    uId: { value: o.id ?? 41 },
  };
  const fs = /* glsl */ `
    ${COMMON}
    ${MRT_OUT}
    in vec3 vSph;
    uniform float uR, uPat, uBlushK, uMouth, uSmile, uYMouth, uDetail, uId, uTear, uYMouthK, uNarrow, uTear2, uTeeth, uFang;
    ${LENS}
    uniform vec3 uBase, uLight, uDark, uBlush, uLine, uEye0, uEye1;
    uniform vec2 uEyeS;
    uniform vec4 uP, uMouthC;
    varying vec3 vWorld, vNormalW, vNormalV, vCol, vCol2, vLocal;
    varying float vMask;
    varying float vDepth;
    varying vec2 vUv;
    ${LIGHT}
    float aa(float e){ float w = fwidth(e) * 0.8 + 1e-5; return smoothstep(-w, w, e); }
    void main(){
      if(uPass > 0.5 && uPass < 1.5){ oColor = vec4(1); oData = vec4(0); return; }
      vec3 N = normalize(vNormalW), NV = normalize(vNormalV);
      vec3 V = normalize(cameraPosition - vWorld);
      vec3 p = vLocal / uR;
      float ax = abs(p.x);
      vec3 c = uBase;
      float lightM = 0.0, darkM = 0.0, goldM = 0.0;
      if(uPat > 0.5 && uPat < 1.5){
        // fox: white below a curve that runs along the muzzle side, dips under the eyes, flares out to the cheek tufts
        float yl = uP.x + uP.y * smoothstep(0.18, 0.72, ax) * (1.0 - smoothstep(0.7, 1.0, p.z)) + uP.w * max(p.z - 0.5, 0.0) + uP.z * smoothstep(0.8, 1.2, ax);   // follows the upturned muzzle
        lightM = aa(yl - p.y);
      } else if(uPat > 1.5 && uPat < 7.5 && uPat != 6.0){
        vec2 q = vec2(p.x / uP.x, (p.y - uP.y) / uP.z);
        lightM = aa(1.0 - length(q)) * aa(p.z - 0.05);
        lightM = max(lightM, aa(-0.62 - p.y + 0.35 * max(p.z, 0.0)) * aa(p.z + 0.2));    // chin / throat
        if(uPat > 6.5){
          // lynx: cream lower face and ruff; the boundary sweeps down toward the back of the head
          lightM = max(lightM, aa(-0.14 + 0.08 * ax - 0.9 * max(-0.05 - p.z, 0.0) - p.y));
        }
        if(uPat > 4.5 && uPat < 5.5) lightM = max(lightM, aa(p.z - 0.5));
      }
      if(uPat > 7.5 && uPat < 8.5){
        // snow leopard: pale muzzle and jaw, dark rosettes and spots over the crown, temples and cheeks
        vec2 q = vec2(p.x / uP.x, (p.y - uP.y) / uP.z);
        float mEdge = -0.22 + 0.14 * ax - 0.16 * smoothstep(0.1, 0.62, ax) - 0.9 * max(-0.05 - p.z, 0.0) + 0.1 * (vnoise(vec2(p.x * 7.0 + 1.3, p.z * 6.0 + 4.1)) - 0.5);
        lightM = max(aa(1.0 - length(q)) * aa(p.z - 0.05), aa(mEdge - p.y));
        // drawn rosettes: wobbling broken blotches of different sizes, a warm gold centre, dying away toward the muzzle
        vec2 w = p.xy + 0.09 * (vec2(vnoise(p.xy * 6.0 + 3.1), vnoise(p.xy * 6.0 + 9.7)) - 0.5);
        vec2 g = vec2(atan(w.x, p.z + 0.15) * 3.3, w.y * 4.1 + 0.32);
        vec2 cid = floor(g), f = fract(g) - 0.5, j = (hash22(cid) - 0.5) * 0.42, d = f - j;
        float h0 = hash12(cid), h1 = hash12(cid + 3.0), big = step(0.3, hash12(cid + 7.0));
        float rl = max(length(d), 1e-3); vec2 dir = d / rl;
        float lump = 0.72 + 0.6 * vnoise(dir * 1.7 + h0 * 37.0);
        float fade = smoothstep(-0.1, 0.34, p.y);
        float r = rl / ((0.62 + 0.62 * h1) * lump * mix(0.6, 1.0, fade));
        float gaps = vnoise(dir * 2.4 + h1 * 41.0);
        float ring = big > 0.5 ? aa(0.37 - r) * aa(r - (0.14 + 0.07 * h0)) * aa(gaps - 0.3) : aa(0.17 - r);
        float eyeD = min(length((p.xy - uEye0.xy) / uEyeS), length((p.xy - uEye1.xy) / uEyeS));
        float clear = aa(ax - 0.2 - 0.25 * max(-p.y, 0.0)) * aa(eyeD - 1.08);
        // whole rosettes only: a spot lives or dies by where its own centre is, never sliced by the mask edge
        float cy = (cid.y + 0.5 + j.y - 0.32) / 4.1;
        float keep = step(-0.3, cy) * (1.0 - step(length(vec2(p.x / uP.x, (cy - uP.y) / uP.z)), 1.12));
        darkM = max(darkM, ring * clear * keep * mix(0.5, 1.0, fade));
        goldM = big * aa(0.15 - r) * clear * keep * fade;
        // small solid spots on the forehead, placed by hand and unevenly
        const vec3 FS[11] = vec3[11](vec3(-0.07, 0.6, 0.03), vec3(0.12, 0.55, 0.04), vec3(-0.17, 0.75, 0.048), vec3(0.04, 0.77, 0.026), vec3(0.2, 0.7, 0.034), vec3(-0.02, 0.49, 0.022), vec3(0.15, 0.85, 0.042), vec3(-0.09, 0.88, 0.03), vec3(-0.24, 0.6, 0.028), vec3(0.27, 0.53, 0.024), vec3(0.0, 0.67, 0.018));
        for(int k = 0; k < 11; k++){ darkM = max(darkM, aa(1.0 - length((w - FS[k].xy) / (FS[k].z * vec2(1.0, 1.25)))) * aa(p.z + 0.1)); }
      }
      if(uPat > 8.5 && uPat < 9.5){
        // otter: cream whisker pad, throat and cheeks; dark crown
        vec2 q = vec2(p.x / uP.x, (p.y - uP.y) / uP.z);
        lightM = max(aa(1.0 - length(q)) * aa(p.z - 0.05), aa(-0.26 + 0.1 * ax - p.y) * aa(p.z + 0.35));
        c = mix(c, uDark, 0.18 * aa(p.y - 0.42 - 0.12 * ax));
      }
      c = mix(c, uLight, lightM);
      c = mix(c, vec3(0.66, 0.4, 0.12), goldM * 0.85);
      c = mix(c, uDark, darkM);
      if(uPat > 2.5 && uPat < 3.5){
        // raccoon mask: a dark band through the eyes
        float band = aa(0.2 - abs(p.y - 0.12 + 0.18 * p.x * p.x)) * aa(ax - 0.1) * aa(p.z - 0.1);
        c = mix(c, uDark, band);
      }
      if(uPat > 3.5 && uPat < 4.5){
        // badger: white blaze, black bands over the eyes to the ears, white cheeks
        float faceW = aa(p.z + 0.2 - 0.25 * max(p.y, 0.0));
        c = mix(c, uLight, faceW);
        // the band's axis runs nose -> eye -> ear; it bows a little, starts as a point and is widest across the eye
        float axb = ax - 0.09;
        float sb = (axb + 1.25 * (p.y + 0.28)) / 1.6;
        float db = (p.y + 0.28 - 1.25 * axb) / 1.6 + 0.05 * sin(clamp(sb, 0.0, 1.3) * 2.8);
        float wb = mix(0.016, 0.175, smoothstep(0.0, 0.46, sb)) * mix(1.0, 0.78, smoothstep(0.55, 1.2, sb));
        c = mix(c, uDark, aa(wb - abs(db)) * aa(sb + 0.02) * aa(p.z + 0.55));
      }
      if(uPat > 5.5 && uPat < 6.5){
        // sheep: dark face, wool everywhere else
        float faceM = aa(p.z - 0.3) * aa(0.42 - p.y + 0.25 * p.z) * aa(0.78 - ax);
        c = mix(uLight, uBase, faceM);
      }
      // blush
      // blush: a soft gradient with three short diagonal hatch strokes (anime cheek), not a hard decal
      {
        vec2 bq = vec2((ax - 0.56) / 0.17, (p.y + 0.22) / 0.1);
        float bl = (1.0 - smoothstep(0.0, 1.0, length(bq))) * aa(p.z - 0.25);
        c = mix(c, uBlush, bl * uBlushK * 0.7);
        float hs = 1e3;
        for(int i = -1; i <= 1; i++){ float cx = float(i) * 0.5; hs = min(hs, abs(bq.x - cx - 0.35 * bq.y) + 0.0 * cx); }
        float hatch = aa(0.07 - hs) * aa(0.55 - abs(bq.y)) * aa(1.25 - abs(bq.x)) * aa(p.z - 0.25);
        c = mix(c, uBlush * 0.82, hatch * uBlushK * 1.5);
      }
      // fine fur strands (extreme close-up only)
      if(uDetail > 0.5){
        vec2 fl = normalize(vec2(p.x, p.y + 0.8) + 1e-4);
        float s1 = vnoise(vec2(dot(p.xy, fl) * 9.0, dot(p.xy, vec2(-fl.y, fl.x)) * 150.0));
        c *= 0.985 + 0.03 * s1;
      }
      // the two tones follow a rounded head, not the small lumps of the mesh
      vec3 Ns = normalize(N * 0.55 + normalize(vSph));
      vec3 col = folkLight(c, Ns, V, 0.0, vLocal, 1.0, 0.0);
      // eye sockets: soft shade above the eye, lid crease in close-ups
      for(int i = 0; i < 2; i++){
        vec3 e = i == 0 ? uEye0 : uEye1;
        vec2 q = (p.xy - e.xy) / uEyeS;
        float L = length(q);
        float sock = smoothstep(1.55, 1.08, L) * smoothstep(-0.2, 0.5, q.y) * step(0.0, p.z);
        col *= 1.0 - sock * 0.06;
        float crease = (1.0 - smoothstep(0.0, 0.045, abs(L - 1.2))) * smoothstep(0.25, 0.6, q.y) * uDetail * step(0.0, p.z);
        col = mix(col, uLine, crease * 0.0);
      }
      // mouth, painted on the muzzle (front projection)
      float id = uId;
      if(p.z > uMouthC.y){
        float mw = uMouthC.z * (1.0 - 0.45 * uNarrow) * (1.0 + 0.42 * smoothstep(0.25, 1.0, uMouth));
        float mx = p.x / mw, my = (p.y - uMouthC.x) / mw;
        float axm = abs(mx);
        float wsh = uYMouth * uYMouthK * 0.3 * (1.0 - pow(abs(axm * 2.0 - 1.0), 2.0)) * step(axm, 1.0);
        float cy = uSmile * 0.32 * mx * mx - wsh;
        float open = uMouth * 0.82 * max(0.0, 1.0 - mx * mx * mx * mx);
        float inside = step(axm, 1.0) * step(cy - open, my) * step(my, cy + 0.05) * step(0.03, uMouth);
        float teethTop = cy - open * 0.1;
        if(inside > 0.5){
          vec3 mc = my < cy - open + 0.42 * open ? vec3(0.78, 0.34, 0.4) : vec3(0.24, 0.07, 0.11);
          col = folkLight(mc, N, V, 0.0, vLocal, 0.0, 0.0);
          id = 44.0;
          // upper teeth + two fangs, when the mouth is well open
          if(uMouth > 0.15 && my > teethTop){ col = folkLight(vec3(0.98, 0.97, 0.92), N, V, 0.0, vLocal, 0.0, 0.0); id = 46.0; }
          float fng = step(abs(axm - 0.56), 0.075 * (1.0 - clamp((teethTop - my) / 0.15, 0.0, 1.0))) * step(teethTop - 0.15, my) * step(my, teethTop) * uFang;
          if(fng > 0.5 && uMouth > 0.15){ col = folkLight(vec3(1.0, 0.99, 0.95), N, V, 0.0, vLocal, 0.0, 0.0); id = 46.0; }
        } else {
          float lw = 0.07 * (1.0 - 0.6 * smoothstep(0.6, 1.0, axm));
          float ln = step(abs(my - cy), lw) * step(axm, 1.0);
          float ph = uYMouth * step(abs(mx), 0.06 / (1.0 - 0.45 * uNarrow)) * step(cy, my) * step(p.y, uMouthC.w);
          col = mix(col, uLine, max(ln, ph) * 0.9);
        }
        // clenched teeth: a rounded bar of teeth with a bite line and vertical gaps, corners dragged by uSmile
        if(uTeeth > 0.02){
          float th = 0.42 * uTeeth * (1.0 - 0.32 * axm * axm);
          float yc = -th * 0.5 + uSmile * 0.26 * mx * mx;
          if(axm < 1.0 && abs(my - yc) < th){
            float gap = step(abs(fract(mx * 2.3 + 0.5) - 0.5), 0.045) + step(abs(my - yc), 0.03);
            vec3 tc = mix(vec3(0.99, 0.98, 0.93), uLine, clamp(gap, 0.0, 1.0));
            if(abs(abs(my - yc) - th) < 0.07 || axm > 0.92) tc = uLine;
            col = folkLight(tc, N, V, 0.0, vLocal, 0.0, 0.0);
            id = 46.0;
          }
        }
      }
      // tears: drawn teardrops that well on the lid, slide a little and sit on the cheek (inked, two tones, a big highlight)
      for(int i = 0; i < 2; i++){
        float tp = i == 0 ? uTear : uTear2;
        if(tp < 0.002 || p.z < 0.15) continue;
        vec3 e = i == 0 ? uEye0 : uEye1; float sx = sign(e.x);
        float y0 = e.y - uEyeS.y * 0.92;
        for(int j = 0; j < 2; j++){
          float tj = j == 0 ? tp : clamp((tp - 0.42) / 0.58, 0.0, 1.0);
          if(tj < 0.002) continue;
          float fall = 1.0 - (1.0 - tj) * (1.0 - tj);
          float sz = (j == 0 ? 0.105 : 0.078) * smoothstep(0.0, 0.14, tj);
          vec2 c0 = vec2(e.x + sx * (j == 0 ? 0.02 + 0.03 * fall : -0.05 + 0.02 * fall), y0 - (j == 0 ? 0.04 + 0.26 * fall : 0.02 + 0.09 * fall));
          vec2 q = (p.xy - c0) / max(sz, 1e-3);
          // round belly, pointed top
          float hw = q.y < 0.0 ? sqrt(max(0.0, 1.0 - q.y * q.y)) : pow(max(0.0, 1.0 - q.y / 1.75), 1.35);
          float inD = step(abs(q.x), hw) * step(-1.0, q.y) * step(q.y, 1.75);
          if(inD > 0.5){
            col = mix(vec3(0.42, 0.68, 0.98), vec3(0.74, 0.92, 1.0), smoothstep(-0.55, 0.3, q.y - 0.25 * q.x * sx));
            float hi = step(length((q - vec2(-0.3 * sx, -0.1)) / vec2(0.3, 0.46)), 1.0);
            float hi2 = step(length((q - vec2(0.36 * sx, -0.58)) / vec2(0.14, 0.12)), 1.0);
            col = mix(col, vec3(1.0), max(hi, hi2));
            id = 59.0;
          }
        }
      }
      col = lensGlare(col, vWorld);
      writeOut(col, 1.0, NV, vDepth, id);
    }
  `;
  const vs = /* glsl */ `
    varying vec3 vLocal, vSph;
    varying vec3 vCol, vCol2;
    varying float vMask;
    attribute float aJaw;
    uniform float uJaw; uniform vec3 uHinge;
    ${VERT_STD}
    void main(){
      vLocal = position; vCol = vec3(1); vCol2 = vec3(1); vMask = 0.0; vSph = mat3(modelMatrix) * position;
      vec3 P = position, Nn = normal;
      float a = uJaw * aJaw;
      if(a > 1e-4){
        float c = cos(a), s = sin(a); vec3 q = P - uHinge;
        P = vec3(q.x, q.y * c - q.z * s, q.y * s + q.z * c) + uHinge;
        Nn = vec3(Nn.x, Nn.y * c - Nn.z * s, Nn.y * s + Nn.z * c);
      }
      stdVertex(P, Nn);
    }
  `;
  return new THREE.ShaderMaterial({ glslVersion: THREE.GLSL3, uniforms: u, vertexShader: vs, fragmentShader: fs });
}


// ------------------------------------------------------------------ set dressing (cockpits, hut)
// Colour from aCol, three scales of wear from detail.js, grime gathering where it would, lit by the shot's light rig.
export function setMaterial(o = {}) {
  const u = { ...G, ...FL, uId: { value: o.id ?? 50 }, uScale: { value: o.scale ?? 9 }, uKind: { value: o.kind ?? 2 }, uGloss: { value: o.gloss ?? 0 }, uGrime: { value: o.grime ?? 0.5 }, uRimK: { value: o.rim ?? 0.5 }, uMap: { value: o.map ?? null }, uUseMap: { value: o.map ? 1 : 0 } };
  const vs = /* glsl */ `
    attribute vec3 aCol; varying vec3 vCol, vLocal;
    ${VERT_STD}
    void main(){ vCol = aCol; vLocal = position; stdVertex(position, normal); }
  `;
  const fs = /* glsl */ `
    ${COMMON}
    ${MRT_OUT}
    ${DETAIL_GLSL}
    uniform float uId, uScale, uKind, uGloss, uGrime, uRimK, uUseMap; uniform sampler2D uMap; uniform vec3 uFSet;
    varying vec3 vWorld, vNormalW, vNormalV, vCol, vLocal; varying float vDepth; varying vec2 vUv;
    #define SEAMCAP 99.0
    ${LIGHT}
    void main(){
      if(uPass > 0.5 && uPass < 1.5){ oColor = vec4(1); oData = vec4(0); return; }
      vec3 N = normalize(vNormalW), NV = normalize(vNormalV);
      if(!gl_FrontFacing){ N = -N; NV = -NV; }
      vec3 V = normalize(cameraPosition - vWorld);
      vec3 col = vCol;
      if(uUseMap > 0.5){ vec4 m = texture(uMap, vUv); col = mix(col, m.rgb, m.a); }
      vec3 d = surfaceDetail(vLocal * uScale, 2.0, uKind);
      col *= d.x;
      col = mix(col, col * vec3(0.72, 0.68, 0.7), d.z * 0.6);
      float gr = fbm3(vLocal * vec3(3.0, 0.8, 3.0) + 4.0);
      col = mix(col, col * vec3(0.66, 0.6, 0.58), smoothstep(0.42, 0.72, gr) * uGrime);
      vec3 c = folkLight(col * uFSet, N, V, 0.0, vLocal, uRimK, uGloss);
      writeOut(c, 1.0, NV, vDepth, uId);
    }
  `;
  return new THREE.ShaderMaterial({ glslVersion: THREE.GLSL3, uniforms: u, vertexShader: vs, fragmentShader: fs, side: o.side ?? THREE.DoubleSide });
}

// A cel smoke form: a camera-facing card with a lobed edge, a lit top and a shaded belly; hot from below when near the hatch.
export function smokeMaterial(o = {}) {
  const u = { ...G, ...FL, uSeed: { value: o.seed ?? 0 }, uHot: { value: 0 }, uFade: { value: 1 }, uId: { value: o.id ?? 58 } };
  const vs = /* glsl */ `varying vec2 vP; ${VERT_STD} void main(){ vP = position.xy; stdVertex(position, normal); }`;
  const fs = /* glsl */ `
    ${COMMON}
    ${MRT_OUT}
    uniform float uSeed, uHot, uFade, uId; varying vec2 vP; varying vec3 vNormalV, vWorld, vNormalW; varying float vDepth; varying vec2 vUv;
    void main(){
      vec2 p = vP * (1.0 + (1.0 - uFade) * 0.5);
      // overlapping scallops, painted back to front: each lobe has its own lit cap, as a drawn smoke form does
      float hit = 0.0, lit = 0.0, edge = 1.0;
      for(int i = 0; i < 9; i++){
        vec2 h = vec2(float(i) * 1.37, uSeed);
        float ang = hash12(h) * 6.283, rad = mix(0.1, 0.56, hash12(h + 3.1)), R = mix(0.2, 0.38, hash12(h + 5.7));
        vec2 c = vec2(cos(ang), sin(ang)) * rad, n = (p - c) / R;
        float d = length(n);
        if(d < 1.0){ hit = 1.0; lit = step(0.0, dot(n, normalize(vec2(-0.4, 0.9))) + 0.25 + 0.2 * (1.0 - d)); edge = smoothstep(0.86, 1.0, d); }
      }
      if(hit < 0.5) discard;
      if(uPass > 0.5 && uPass < 1.5){ oColor = vec4(1); oData = vec4(0); return; }
      vec3 c = mix(vec3(0.15, 0.15, 0.31), vec3(0.5, 0.53, 0.76), lit);
      c = mix(c, c * 0.72, edge * 0.5);
      float low = smoothstep(0.1, -0.8, vP.y);
      c = mix(c, c + vec3(1.0, 0.34, 0.12), low * uHot);
      writeOut(c, 1.0, normalize(vNormalV), vDepth, uId);
    }
  `;
  return new THREE.ShaderMaterial({ glslVersion: THREE.GLSL3, uniforms: u, vertexShader: vs, fragmentShader: fs, side: THREE.DoubleSide });
}

// Self-lit lamps, dial glass and seam light. uK may exceed 1 for bloom; id >= 100 draws no ink.
export function glowMaterial(o = {}) {
  const u = { ...G, uColor: { value: new THREE.Color(o.color ?? '#ffffff') }, uK: { value: o.k ?? 1 }, uId: { value: o.id ?? 120 }, uMap: { value: o.map ?? null }, uUseMap: { value: o.map ? 1 : 0 } };
  const vs = /* glsl */ `attribute vec3 aCol; varying vec3 vCol; ${VERT_STD} void main(){ vCol = aCol; stdVertex(position, normal); }`;
  const fs = /* glsl */ `
    ${COMMON}
    ${MRT_OUT}
    uniform vec3 uColor; uniform float uK, uId, uUseMap; uniform sampler2D uMap;
    varying vec3 vNormalV, vCol, vWorld, vNormalW; varying float vDepth; varying vec2 vUv;
    void main(){
      if(uPass > 0.5 && uPass < 1.5){ oColor = vec4(1); oData = vec4(0); return; }
      vec3 c = uColor * vCol * uK;
      if(uUseMap > 0.5) c *= texture(uMap, vUv).rgb;
      writeOut(c, 1.0, normalize(vNormalV), vDepth, uId);
    }
  `;
  return new THREE.ShaderMaterial({ glslVersion: THREE.GLSL3, uniforms: u, vertexShader: vs, fragmentShader: fs, side: THREE.DoubleSide });
}

// The burnt shell of the Tortoise around the hatch: copper plates with seams and rivets, teal paint blistered off,
// soot, and cracks still glowing with heat (uHeat falls as the metal cools).
export function deckMaterial(o = {}) {
  const u = { ...G, ...FL, uHeat: { value: 1 }, uSpill: { value: 0 }, uSkK: { value: 0 }, uSkL: { value: new THREE.Vector4() }, uSkR: { value: new THREE.Vector4() }, uId: { value: o.id ?? 52 } };
  const vs = /* glsl */ `varying vec3 vLocal; ${VERT_STD} void main(){ vLocal = position; stdVertex(position, normal); }`;
  const fs = /* glsl */ `
    ${COMMON}
    ${MRT_OUT}
    ${DETAIL_GLSL}
    uniform float uHeat, uId, uSpill, uSkK;
    uniform vec4 uSkL, uSkR;
    varying vec3 vWorld, vNormalW, vNormalV, vLocal; varying float vDepth; varying vec2 vUv;
    ${LIGHT}
    void main(){
      if(uPass > 0.5 && uPass < 1.5){ oColor = vec4(1); oData = vec4(0); return; }
      vec3 N = normalize(vNormalW), NV = normalize(vNormalV);
      vec3 V = normalize(cameraPosition - vWorld);
      vec2 q = vLocal.xz;
      float R = length(q), A = atan(q.x, q.y);
      // plate pattern: rings and sectors of the shell, staggered every other ring
      float ring = floor(R / 1.5), ph = mod(ring, 2.0) * 0.5, k = 6.0 + ring * 4.0;
      float fr = fract(R / 1.5), fa = fract(A / 6.2832 * k + ph);
      float seamD = min(min(fr, 1.0 - fr) * 1.5, min(fa, 1.0 - fa) * 6.2832 * max(R, 0.5) / k);
      float seam = smoothstep(0.022, 0.012, seamD);
      // rivets along the seams
      float rv = 0.0;
      { float n = max(4.0, floor(R * 18.0)); float a2 = fract(A / 6.2832 * n) - 0.5; vec2 rq = vec2(a2 * 6.2832 * R / n, (fr - 0.075) * 1.5);
        rv = smoothstep(0.022, 0.016, length(rq)); }
      vec3 d = surfaceDetail(vLocal * 5.0, 2.0, 2.0);
      float paintM = smoothstep(0.42, 0.58, fbm3(vLocal * 2.2 + 3.0) - 0.08);      // where teal paint survived
      float soot = smoothstep(0.46, 0.86, fbm3(vLocal * 1.2 + 9.0) + 0.1 * (1.0 - smoothstep(0.5, 2.0, R)));
      vec3 cop = mix(vec3(0.66, 0.35, 0.17), vec3(0.38, 0.2, 0.12), smoothstep(0.35, 0.7, fbm3(vLocal * 4.0)));
      vec3 c = mix(cop, vec3(0.1, 0.27, 0.28), paintM);
      c = mix(c, vec3(0.05, 0.045, 0.05), soot * 0.62);
      float blister = smoothstep(0.66, 0.7, fbm3(vLocal * 14.0 + 2.0)) * paintM;
      c = mix(c, vec3(0.42, 0.3, 0.22), blister * 0.8);
      c *= d.x; c = mix(c, c * 0.55, seam);
      c = mix(c, vec3(0.7, 0.5, 0.32), rv * 0.75);
      float run = smoothstep(0.55, 0.62, fbm3(vec3(A * 2.2, R * 0.6, 2.0)));
      c = mix(c, vec3(0.2, 0.15, 0.13), run * 0.5);
      vec3 col = folkLight(c, N, V, 0.0, vLocal, 0.35, 0.0);
      // glowing hairline cracks in the plates, brightest next to the hatch
      float crack = smoothstep(0.032, 0.008, abs(fbm3(vLocal * 2.6 + 1.3) - 0.5)) * smoothstep(0.36, 0.72, fbm3(vLocal * 1.1 + 6.0));
      float heat = uHeat * (1.0 - smoothstep(0.8, 3.6, R)) + 0.12 * uHeat;
      col += vec3(1.8, 0.56, 0.16) * (crack + seam * 0.5) * heat;
      // the glow pouring out of the open hatch runs along the plates
      float spill = exp(-max(R - 0.62, 0.0) * 2.4);
      col += vec3(1.0, 0.3, 0.07) * uSpill * spill * (0.5 + 0.5 * c.r / 0.66);
      // the heels' scrape: two hot claw lines cut across the plates
      for(int k = 0; k < 2; k++){
        vec4 s = k == 0 ? uSkL : uSkR;
        for(float o = -0.03; o < 0.04; o += 0.06){
          vec2 a = s.xy + vec2(o, 0.0), ab = s.zw - s.xy;
          float h = clamp(dot(q - a, ab) / max(dot(ab, ab), 1e-5), 0.0, 1.0);
          col += vec3(2.6, 1.3, 0.42) * uSkK * h * h * smoothstep(0.016, 0.005, length(q - a - ab * h));
        }
      }
      writeOut(col, 1.0, NV, vDepth, uId);
    }
  `;
  return new THREE.ShaderMaterial({ glslVersion: THREE.GLSL3, uniforms: u, vertexShader: vs, fragmentShader: fs });
}

// The paper window of s02: warm paper with the child's silhouette, drawn analytically, the ring reflected in the glass.
export function windowMaterial() {
  const u = { ...G, uLamp: { value: 1 }, uHead: { value: 0 }, uSway: { value: 0 }, uHand: { value: 0 }, uWave: { value: 0 }, uBreath: { value: 0 }, uRingK: { value: 1 }, uId: { value: 121 } };
  const vs = /* glsl */ `varying vec3 vLocal; ${VERT_STD} void main(){ vLocal = position; stdVertex(position, normal); }`;
  const fs = /* glsl */ `
    ${COMMON}
    ${MRT_OUT}
    uniform float uLamp, uHead, uSway, uHand, uWave, uBreath, uRingK, uId;
    varying vec3 vWorld, vNormalW, vNormalV, vLocal; varying float vDepth; varying vec2 vUv;
    float sdE(vec2 p, vec2 c, vec2 r, float rot){ vec2 d = p - c; float cr = cos(rot), sr = sin(rot); d = vec2(cr * d.x + sr * d.y, -sr * d.x + cr * d.y); float k0 = length(d / r), k1 = length(d / (r * r)); return k0 * (k0 - 1.0) / max(k1, 1e-5); }
    float smn(float a, float b, float k){ float h = max(k - abs(a - b), 0.0) / k; return min(a, b) - h * h * k * 0.25; }
    float cap(vec2 p, vec2 a, vec2 b, float r0, float r1){ vec2 pa = p - a, ba = b - a; float t = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0); return length(pa - ba * t) - mix(r0, r1, t); }
    float otter(vec2 p){
      // a small otter child behind the paper, drawn in one flat shape: right of the centre mullion, in three-quarter profile to the left,
      // flat broad skull, low ears, muzzle up toward the outside light, narrow shoulders, one paw on the sill, the other arm up
      p.x -= uSway; float ha = uHead;
      vec2 hc = vec2(0.232, -0.222 + 0.018 * ha + uBreath * 0.004);
      float a = -0.36 * ha, ca = cos(a), sa = sin(a);
      vec2 q = p - hc; q = vec2(ca * q.x + sa * q.y, -sa * q.x + ca * q.y) / 0.86;
      // head
      float d = sdE(q, vec2(0.02, 0.0), vec2(0.195, 0.122), 0.0);
      d = smn(d, sdE(q, vec2(0.075, -0.05), vec2(0.115, 0.095), 0.0), 0.03);          // cheek and jaw
      d = smn(d, sdE(q, vec2(-0.15, -0.04), vec2(0.082, 0.07), 0.08), 0.03);       // muzzle
      d = smn(d, sdE(q, vec2(-0.226, -0.012), vec2(0.022, 0.019), 0.0), 0.012);        // nose bump
      d = min(d, sdE(q, vec2(0.135, 0.108), vec2(0.03, 0.026), -0.5));                // small low ears
      d = min(d, sdE(q, vec2(-0.03, 0.118), vec2(0.024, 0.021), 0.2));
      // whiskers
      d = min(d, cap(q, vec2(-0.19, -0.06), vec2(-0.3, -0.028), 0.0055, 0.0035));
      d = min(d, cap(q, vec2(-0.185, -0.075), vec2(-0.305, -0.082), 0.0055, 0.0035));
      d = min(d, cap(q, vec2(-0.175, -0.088), vec2(-0.28, -0.135), 0.0055, 0.0035));
      d *= 0.86;
      // neck notch, narrow shoulders, body ending behind the sill bar
      float b = cap(p, vec2(0.262, -0.33), vec2(0.272, -0.43), 0.058, 0.066);
      b = smn(b, sdE(p, vec2(0.272, -0.47), vec2(0.12, 0.05), 0.0), 0.03);
      b = smn(b, cap(p, vec2(0.272, -0.5), vec2(0.28, -0.8), 0.105, 0.14 + uBreath * 0.006), 0.04);
      d = smn(d, b, 0.018);
      // far paw on the sill
      d = min(d, cap(p, vec2(0.17, -0.5), vec2(0.13, -0.615), 0.04, 0.03));
      d = min(d, cap(p, vec2(0.13, -0.615), vec2(0.075, -0.655), 0.03, 0.03));
      d = min(d, sdE(p, vec2(0.058, -0.66), vec2(0.056, 0.032), 0.0));
      // raised arm: shoulder, elbow, a distinct wrist, a small paw with two toes
      float r = clamp(uHand * 0.5, 0.0, 1.0);
      vec2 sh = vec2(0.37, -0.47), c1 = mix(vec2(0.5, -0.58), vec2(0.56, -0.47), r), wr = mix(vec2(0.56, -0.64), vec2(0.535, -0.255), r);
      // one soft curve from the shoulder to the wrist, thick and tapering
      vec2 pv = sh;
      for(int i = 1; i <= 8; i++){
        float u1 = float(i) / 8.0, u0 = float(i - 1) / 8.0;
        vec2 b1 = (1.0 - u1) * (1.0 - u1) * sh + 2.0 * u1 * (1.0 - u1) * c1 + u1 * u1 * wr;
        d = min(d, cap(p, pv, b1, mix(0.066, 0.036, u0), mix(0.066, 0.036, u1)));
        pv = b1;
      }
      // the wave is a small turn at the wrist
      vec2 f0 = normalize(wr - c1); float wa = uWave * 0.42, wc = cos(wa), ws = sin(wa);
      vec2 fw = vec2(wc * f0.x - ws * f0.y, ws * f0.x + wc * f0.y), fs = vec2(-fw.y, fw.x);
      vec2 pw = wr + fw * 0.06;
      d = min(d, sdE(p, pw, vec2(0.05, 0.055), atan(fw.y, fw.x) - 1.5708));
      d = min(d, sdE(p, pw + fw * 0.052 + fs * 0.03, vec2(0.016, 0.022), 0.0));
      d = min(d, sdE(p, pw + fw * 0.052 - fs * 0.03, vec2(0.016, 0.022), 0.0));
      // the sill bar: what the body disappears behind; nothing of him below it
      d = max(d, -(p.y + 0.77));
      d = min(d, max(p.y + 0.77 - 0.082, -(p.y + 0.77)));
      return d;
    }
    void main(){
      if(uPass > 0.5 && uPass < 1.5){ oColor = vec4(1); oData = vec4(0); return; }
      vec2 p = vLocal.xy / 0.5;   // pane radius 0.5 m
      float fib = vnoise(p * vec2(60.0, 14.0)) * 0.5 + vnoise(p * vec2(14.0, 70.0)) * 0.5, mot = fbm2(p * 3.0 + 2.0);
      float glowM = exp(-dot(p - vec2(-0.12, -0.22), p - vec2(-0.12, -0.22)) * 1.6);
      vec3 paper = mix(vec3(0.92, 0.42, 0.15), vec3(1.25, 0.8, 0.36), glowM) * (0.9 + 0.22 * fib) * (0.92 + 0.18 * mot);
      float sd = otter(p);
      paper = mix(paper, vec3(0.1, 0.04, 0.05) * (0.86 + 0.28 * fib), smoothstep(0.0075, -0.0075, sd) * 0.95);
      vec3 c = mix(vec3(0.05, 0.05, 0.1), paper, uLamp);
      // the glass: sky and the cold ring reflected in it, carrying the shot when the lamp dies
      vec2 rp = p - vec2(0.3, 0.42);
      float rr = length(rp * vec2(1.0, 1.32));
      float band = smoothstep(0.03, 0.012, abs(rr - 0.24)) * (0.35 + 0.65 * smoothstep(0.1, -0.1, sin(atan(rp.y, rp.x) + 0.4)));
      float inner = smoothstep(0.012, 0.004, abs(rr - 0.17)) * 0.4;
      float glare = pow(max(0.0, 1.0 - length(rp) * 1.5), 2.0) * 0.32;
      vec3 sky = vec3(0.1, 0.16, 0.34) * (0.5 + 0.5 * smoothstep(-1.0, 1.0, p.y)) * mix(0.6, 1.0, 1.0 - uLamp);
      c += sky + vec3(1.5, 1.9, 2.4) * (band + inner) * uRingK + vec3(0.18, 0.26, 0.42) * glare * uRingK;
      writeOut(c, 1.0, normalize(vNormalV), vDepth, uId);
    }
  `;
  return new THREE.ShaderMaterial({ glslVersion: THREE.GLSL3, uniforms: u, vertexShader: vs, fragmentShader: fs });
}
