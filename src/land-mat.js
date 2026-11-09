// BLACKOUT, land department: gouache night materials. Everything takes its lit/dead state from litAt() on a whole city
// block, so the darkness travels in chunks, on threes. Surface detail has three scales and fades with distance.
import * as THREE from 'three';
import { G, COMMON, MRT_OUT, VERT_STD } from './glsl.js';
import { LIT_GLSL } from './layout.js';
import { BLOCK_GLSL, MAP } from './land-map.js';
import { PAINT_LIGHT } from './bgmaterials.js';

// Shared land uniforms, written by land.update(st).
export const LU = {
  uLitT: { value: -5 },              // film time on threes (the front only jumps every third frame)
  uMask: { value: null },            // baked r city density, g coast distance, b height, a farm
  uDeadMoon: { value: 1 },           // how much moonlight dead districts catch (hook: near black, story: readable)
  uHazeNear: { value: new THREE.Color('#1a2a66') },
  uRidgeCut: { value: new THREE.Vector4(1e6, 1e6, -1e6, -1e6) },     // main ground is cut away under the ridge patch
  uSeaBright: { value: 1 },
  uCamY: { value: 300 },
  uRoofMoon: { value: 1 },
  uMoonGain: { value: 1 },
  uCityNear: { value: 640 },         // beyond this single houses sink into the merged roof mass
  uCityFar: { value: 900 },
  uWireK: { value: 1 },              // wire weight on screen: bold in the hook shot
  uNotch: { value: 0 },              // s01b only: the rim opens in the line of sight to the muzzle
};
const base = (extra) => ({ ...G, ...LU, ...extra });
const S = MAP.size.toFixed(1);

function mat(uniforms, vs, fs, opts = {}) {
  return new THREE.ShaderMaterial({ glslVersion: THREE.GLSL3, uniforms, vertexShader: vs, fragmentShader: fs, side: opts.side ?? THREE.DoubleSide, transparent: false, ...opts });
}

// ---------------------------------------------------------------- shared GLSL
export const LAND_GLSL = /* glsl */ `
uniform float uLitT, uDeadMoon, uSeaBright, uCamY, uRoofMoon, uMoonGain;
uniform sampler2D uMask;
uniform vec3 uHazeNear;
${LIT_GLSL}
${BLOCK_GLSL}
const vec3 GOLD = vec3(1.0, 0.60, 0.20);
vec4 maskAt(vec2 xz){ return texture(uMask, (xz + ${S}) / (2.0 * ${S})); }
float blockLit(vec2 xz){ vec2 b = blockOf(xz); return litAt(b.x, uLitT, b.y); }
// voronoi crack distance, cheap 2-neighbour search
float _vId = 0.0, _vId2 = 0.0, _vId3 = 0.0;
float vEdge(vec3 p){
  vec3 g = floor(p), f = fract(p); float d1 = 8.0, d2 = 8.0; _vId = 0.0;
  for(int z = -1; z <= 1; z++) for(int y = -1; y <= 1; y++) for(int x = -1; x <= 1; x++){
    vec3 o = vec3(float(x), float(y), float(z));
    vec3 h = fract(sin(vec3(dot(g + o, vec3(127.1, 311.7, 74.7)), dot(g + o, vec3(269.5, 183.3, 246.1)), dot(g + o, vec3(113.5, 271.9, 124.6)))) * 43758.5453);
    float d = length(o + h - f);
    if(d < d1){ d2 = d1; d1 = d; _vId = h.x; _vId2 = h.y; _vId3 = h.z; } else if(d < d2){ d2 = d; }
  }
  return d2 - d1;
}
// basalt: three scales of structure. d = distance to camera. Returns colour multiplier in x, ledge height y, crack z, lichen w.
// the big carved forms of a rock face in metres: ribs and gullies running down the slope, broken by faults
float rockForm(vec3 p){
  vec3 q = p + vec3(fbm3(p * 0.011) * 46.0, 0.0, fbm3(p * 0.013 + 5.0) * 46.0);
  float r1 = 1.0 - abs(2.0 * vnoise3(vec3(q.x * 0.026, q.y * 0.007, q.z * 0.026)) - 1.0);
  float r2 = 1.0 - abs(2.0 * vnoise3(vec3(q.x * 0.08, q.y * 0.03, q.z * 0.08) + 4.0) - 1.0);
  float r3 = vnoise3(q * 0.23 + 9.0);
  return r1 * r1 * 6.0 + r2 * 1.5 + r3 * 0.35;
}
vec4 rockDetail(vec3 p, float d, float bed){
  float mid = 1.0 - smoothstep(900.0, 2200.0, d);
  float near = 1.0 - smoothstep(60.0, 340.0, d);
  float macro = fbm3(p * 0.008 + 3.0);
  float streak = fbm3(vec3(p.x * 0.05, p.y * 0.006, p.z * 0.05) + 2.0);
  // bedding only in patches, irregular: never a regular stripe
  float sPatch = smoothstep(0.5, 0.66, fbm3(p * 0.006 + 40.0));
  float yy = p.y + p.x * 0.14 + p.z * 0.08 + fbm3(p * 0.012) * 26.0;
  float strata = bed > 0.5 ? (0.5 + (vnoise3(vec3(0.0, yy * 0.21, 3.0)) - 0.5) * 0.8 * sPatch + (vnoise3(vec3(1.0, yy * 0.7, 9.0)) - 0.5) * 0.4 * sPatch) : 0.5;
  float m = 0.86 + (macro - 0.5) * 0.22 + (streak - 0.5) * 0.24 + (strata - 0.5) * 0.3 * mid;
  float crack = 0.0, led = strata * 0.24, lichen = 0.0;
  if(mid > 0.01){
    float joints = vEdge(p * 0.052 + fbm3(p * 0.03) * 0.5);
    float keep = smoothstep(0.53, 0.66, vnoise3(p * 0.034 + 13.0));
    float c1 = (1.0 - smoothstep(0.0, 0.014, joints)) * mid * keep;
    crack = c1; led += joints * 0.2;
    m -= c1 * 0.3;
    m += (_vId - 0.5) * 0.08 * mid;
  }
  if(near > 0.01){
    float cr2 = vEdge(p * 0.42 + fbm3(p * 0.5) * 0.4);
    float keep2 = smoothstep(0.56, 0.7, vnoise3(p * 0.3 + 3.0));
    float c2 = (1.0 - smoothstep(0.0, 0.045, cr2)) * near * keep2;
    crack = max(crack, c2);
    m -= c2 * 0.24;
    m += (_vId - 0.5) * 0.1 * near;
    led += cr2 * 0.22 * near;
    float grit = vnoise3(p * 6.0) * 0.55 + vnoise3(p * 17.0) * 0.45;
    m += (grit - 0.5) * 0.3 * near;
    float chip = smoothstep(0.76, 0.82, vnoise3(p * 3.1) * 0.6 + vnoise3(p * 11.0) * 0.4) * near;
    m += chip * 0.16;
    lichen = smoothstep(0.62, 0.68, fbm3(p * 0.9 + 21.0)) * near;
  }
  return vec4(m, led, crack, lichen);
}
`;

// Moon light for anything drawn on land (needs PAINT_LIGHT for sunShadow and warLight). Hard-edged like poster colour.
export const MOON_GLSL = /* glsl */ `
vec3 moonLight(vec3 alb, vec3 N, vec3 P, float ao){
  float ndl = dot(N, uSunDir);
  float mlit = smoothstep(0.02, 0.16, ndl) * sunShadow(P, N);
  float up = N.y * 0.5 + 0.5;
  vec3 amb = mix(vec3(0.022, 0.032, 0.105), vec3(0.085, 0.115, 0.27), up) * ao;
  vec3 moonC = vec3(0.86, 0.9, 1.02) * (0.5 + 0.34 * smoothstep(0.34, 0.5, ndl));
  // a blast drowns the moon: no navy left to turn the fire light lavender
  vec3 war = warLight(alb, P, N);
  war *= mix(vec3(1.3, 0.62, 0.42), vec3(1.0), smoothstep(0.02, 0.3, dot(war, vec3(0.33))));      // the thin edge of a warm pool goes red, never olive over the navy
  float wl = clamp(dot(war, vec3(0.33)) / max(dot(alb, vec3(0.33)), 0.01) * 0.9, 0.0, 0.92);
  return alb * (amb + moonC * mlit * uSunStrength * 1.5) * uMoonGain * (1.0 - wl) + war;
}
`;

// ---------------------------------------------------------------- terrain
export function terrainMaterial(o = {}) {
  const u = base({ uPatch: { value: o.patch ?? 0 }, uForceRock: { value: o.rock ?? 0 } });
  const vs = /* glsl */ `${VERT_STD}
    uniform float uNotch;
    varying float vNotch;
    void main(){
      vec3 p = position;
      vNotch = 0.0;
      if(uNotch > 0.0){
        vec2 rel = p.xz - vec2(-3050.0, 1990.0);
        float s = dot(rel, vec2(0.959, -0.284)), q = dot(rel, vec2(0.284, 0.959));
        vNotch = uNotch * smoothstep(40.0, 70.0, s) * (1.0 - smoothstep(520.0, 760.0, s)) * (1.0 - smoothstep(34.0, 96.0, abs(q)));
        p.y -= 120.0 * vNotch;
      }
      stdVertex(p, normal);
    }`;
  const fs = /* glsl */ `
    ${COMMON}
    ${MRT_OUT}
    ${PAINT_LIGHT}
    ${LAND_GLSL}
    ${MOON_GLSL}
    uniform float uPatch, uForceRock;
    uniform vec4 uRidgeCut;
    varying float vNotch;
    // relief of the flat rock, in metres, three scales fading with distance
    float shelfH(vec2 p, float d){
      float n0 = 1.0 - smoothstep(30.0, 200.0, d), m0 = 1.0 - smoothstep(220.0, 1100.0, d);
      vec2 w = p + vec2(fbm2(p * 0.021) * 14.0, fbm2(p * 0.019 + 7.0) * 14.0);
      float sj = vEdge(vec3(w * 0.06, 1.0));
      float h = smoothstep(0.0, 0.07, sj) * 0.5 * m0 + (_vId - 0.5) * 0.35 * m0;
      float L = (w.x * 0.62 + w.y * 0.78) * 0.085 + fbm2(p * 0.03 + 3.0) * 2.6;
      h += smoothstep(0.0, 0.25, fract(L)) * 0.28 * m0;
      if(n0 > 0.01){
        float g = vEdge(vec3(p * 1.8, 2.0));
        float gm = smoothstep(0.46, 0.6, fbm2(p * 0.06 + 11.0));
        h += n0 * gm * (smoothstep(0.0, 0.2, g) * 0.16 + (_vId - 0.5) * 0.05);
        h += n0 * vnoise3(vec3(p * 4.0, 0.0)) * 0.03;
      }
      return h;
    }
    varying vec3 vWorld, vNormalW, vNormalV;
    varying float vDepth;
    void main(){
      vec3 P = vWorld;
      if(uPatch < 0.5 && P.x > uRidgeCut.x && P.z > uRidgeCut.y && P.x < uRidgeCut.z && P.z < uRidgeCut.w) discard;
      if(P.y < -6.0) discard;
      vec3 N = normalize(vNormalW);
      vec3 NV = normalize(vNormalV);
      if(!gl_FrontFacing){ N = -N; NV = -NV; }
      if(uPass > 0.5 && uPass < 1.5){ oColor = vec4(1); oData = vec4(0); return; }
      vec3 V = cameraPosition - P;
      float d = length(V);
      vec4 m = maskAt(P.xz);
      float city = m.r, coast = m.g, farm = m.a;
      // bare rock behind the substation: field and grass colours turn yellow-green under the warm yard light (x, z of YARD)
      float yardFar = smoothstep(280.0, 480.0, distance(P.xz, vec2(-2625.0, 1905.0)));
      farm *= yardFar;
      // the opened rim of the tele shot: true facet normals, and detail judged by the zoomed footprint, not by the metres
      float nk = smoothstep(0.0, 0.1, vNotch);
      if(nk > 0.001){
        vec3 Nf = normalize(cross(dFdx(P), dFdy(P)));
        if(dot(Nf, V) < 0.0) Nf = -Nf;
        N = normalize(mix(N, Nf, nk));
        NV = normalize((viewMatrix * vec4(N, 0.0)).xyz);
        d = mix(d, 90.0, nk);
      }
      // boulders are cut stone: flat planes and hard arrises while they are close enough to see
      if(uForceRock > 0.5 && d < 900.0){
        vec3 Nf = normalize(cross(dFdx(P), dFdy(P)));
        if(dot(Nf, V) < 0.0) Nf = -Nf;
        N = normalize(mix(N, Nf, 0.75 * (1.0 - smoothstep(300.0, 900.0, d))));
        NV = normalize((viewMatrix * vec4(N, 0.0)).xyz);
      }
      float slope = 1.0 - N.y;

      // basalt, the bones of the islands: cold violet-black with ochre weathering
      vec4 rock = rockDetail(P, d, 1.0);
      vec3 cRock = mix(vec3(0.13, 0.15, 0.19), vec3(0.33, 0.35, 0.4), smoothstep(0.55, 1.05, rock.x));
      cRock = mix(cRock, vec3(0.4, 0.4, 0.41), smoothstep(0.62, 0.92, fbm3(P * 0.022 + 9.0)) * 0.3);
      cRock *= clamp(rock.x, 0.25, 1.3);
      cRock = mix(cRock, vec3(0.38, 0.47, 0.40), rock.w * 0.5);

      // hillside: dry grass and scrub; forest clots where the noise is high
      float g1 = fbm3(P * 0.0065 + 2.0), g2 = fbm3(P * 0.04 + 7.0);
      vec3 cGrass = mix(vec3(0.15, 0.25, 0.29), vec3(0.27, 0.35, 0.3), smoothstep(0.35, 0.72, g1));
      cGrass *= 0.82 + 0.4 * g2;
      float forest = smoothstep(0.54, 0.62, fbm3(P * 0.0052 + 31.0) + g2 * 0.09) * (1.0 - farm) * (1.0 - city);
      cGrass = mix(cGrass, vec3(0.12, 0.21, 0.24) * (0.82 + 0.36 * fbm3(P * 0.05)), forest * (uPatch > 0.5 ? 0.45 : 1.0));
      float rockK = max(max(max(uForceRock, nk), 1.0 - yardFar), smoothstep(0.22, 0.44, slope + (g2 - 0.5) * 0.25));
      vec3 col = mix(cGrass, cRock, rockK);
      if(nk > 0.001){
        // bedded basalt in the cut: level courses that step and break, vertical joints, scree lying on every ledge
        vec2 wn = vec2(P.x * 0.96 - P.z * 0.28, P.y + fbm2(P.xz * 0.05) * 6.0);
        float bedH = 5.5, by0 = wn.y / bedH, bI = floor(by0), bf = fract(by0);
        float jx = wn.x / (9.0 + 7.0 * fract(sin(bI * 7.7) * 437.5)) + bI * 0.37, jI = floor(jx);
        float tn = fract(sin(bI * 21.3 + jI * 47.1) * 43758.5);
        vec3 bas = mix(vec3(0.12, 0.14, 0.19), vec3(0.3, 0.33, 0.4), tn) * (0.75 + 0.5 * fbm3(P * 0.11));
        bas *= 1.0 - 0.75 * (1.0 - smoothstep(0.0, 0.07, min(bf, 1.0 - bf)));
        bas *= 1.0 - 0.65 * (1.0 - smoothstep(0.0, 0.05, min(fract(jx), 1.0 - fract(jx))));
        bas = mix(bas, vec3(0.34, 0.36, 0.42) * (0.6 + 0.8 * vnoise3(P * 1.3)), smoothstep(0.1, 0.0, bf) * smoothstep(0.42, 0.62, fbm2(P.xz * 0.09)));
        col = mix(col, bas, nk);
      }

      // terraced fields: contour bands, tilled rows, dry-stone lips; plots change colour along the contour
      if(farm > 0.02){
        float h = P.y / 4.2;
        float band = abs(fract(h) - 0.5);
        float rowFade = 1.0 - smoothstep(600.0, 2600.0, d);
        float plot = fract(sin(floor(h) * 12.9898 + floor((P.x * 0.7 - P.z * 0.7) / 34.0) * 78.233) * 43758.5453);
        vec3 fC = mix(vec3(0.17, 0.26, 0.21), vec3(0.26, 0.29, 0.2), plot);
        fC = mix(fC, vec3(0.13, 0.23, 0.27), step(0.72, plot));
        fC *= 0.86 + 0.25 * fbm3(P * 0.035);
        fC *= 1.0 + 0.1 * (step(0.5, fract((P.x * 0.7 + P.z * 0.7) / 3.0)) - 0.5) * (1.0 - smoothstep(180.0, 720.0, d));
        vec3 lip = vec3(0.25, 0.25, 0.28);
        fC = mix(fC, lip, smoothstep(0.42, 0.48, band) * rowFade);
        col = mix(col, fC, farm * (1.0 - rockK * 0.8));
      }
      // the city's ground: paved terraces, dust, stone stairs
      float cityK = smoothstep(0.04, 0.3, city);
      if(cityK > 0.0){
        vec3 pave = vec3(0.31, 0.27, 0.28) * (0.72 + 0.5 * fbm3(P * 0.09 + 5.0));
        float near2 = 1.0 - smoothstep(100.0, 520.0, d);
        if(near2 > 0.0){
          float rz = P.z / 0.85, rI = floor(rz), bx = P.x / 1.5 + rI * 0.5, bI = floor(bx);
          float px2 = length(fwidth(P.xz));
          float joint = max(1.0 - smoothstep(0.0, 0.06, min(fract(rz), 1.0 - fract(rz))), 1.0 - smoothstep(0.0, 0.05, min(fract(bx), 1.0 - fract(bx)))) * clamp(1.0 - px2 * 6.0, 0.0, 1.0);
          float st = fract(sin(rI * 12.9 + bI * 78.2) * 43758.5);
          pave *= 1.0 - near2 * 0.45 * joint;
          pave *= 1.0 + near2 * (st - 0.5) * 0.3;
          pave *= 0.92 + 0.16 * near2 * vnoise3(P * 3.3);
        }
        col = mix(col, pave, cityK);
      }

      // the machine shelf and every flat of the ridge: a real rock surface in three scales, strata, joints, gravel, dust, scorch and oil
      float flatK = 0.0, oil = 0.0;
      if(uPatch > 0.5 && uForceRock < 0.5){
        flatK = (1.0 - smoothstep(0.05, 0.16, slope)) * (1.0 - vNotch);
        if(flatK > 0.01){
          vec2 p = P.xz;
          float m0 = 1.0 - smoothstep(260.0, 1200.0, d), n0 = 1.0 - smoothstep(30.0, 200.0, d);
          vec2 w = p + vec2(fbm2(p * 0.021) * 14.0, fbm2(p * 0.019 + 7.0) * 14.0);
          float sj = vEdge(vec3(w * 0.06, 1.0));
          float sid = _vId;
          vec3 ba = mix(vec3(0.15, 0.17, 0.21), vec3(0.3, 0.32, 0.37), sid * 0.5 + fbm2(p * 0.012) * 0.5);
          ba *= 0.84 + 0.32 * fbm2(p * 0.08 + 3.0) * m0 + 0.16 * (1.0 - m0);
          // slab joints come and go; the beds crop out in sinuous lines
          float jk = smoothstep(0.42, 0.58, vnoise3(vec3(p * 0.04, 13.0)));
          ba *= 1.0 - 0.55 * (1.0 - smoothstep(0.0, 0.018, sj)) * m0 * jk;
          float lN = (w.x * 0.62 + w.y * 0.78) * 0.085 + fbm2(p * 0.03 + 3.0) * 2.6;
          float lf = fract(lN);
          ba *= 1.0 - 0.3 * (1.0 - smoothstep(0.0, 0.06, lf)) * m0 * smoothstep(0.4, 0.55, fbm2(p * 0.018 + 19.0));
          // dust lanes blown across the rock
          float dust = smoothstep(0.5, 0.72, fbm2(vec2(dot(p, vec2(0.9, 0.42)) * 0.012, dot(p, vec2(-0.42, 0.9)) * 0.07) + 5.0));
          ba = mix(ba, vec3(0.36, 0.35, 0.36), dust * 0.55);
          // scree and gravel in drifts; each stone its own tone
          float gm = smoothstep(0.46, 0.6, fbm2(p * 0.06 + 11.0)) * (1.0 - dust * 0.7);
          if(n0 > 0.01){
            float g = vEdge(vec3(p * 1.8, 2.0));
            vec3 stone = mix(vec3(0.1, 0.11, 0.14), vec3(0.42, 0.43, 0.47), _vId2);
            stone *= 0.45 + 0.55 * smoothstep(0.0, 0.16, g);
            ba = mix(ba, stone, gm * n0 * 0.9);
            float cr = vEdge(vec3(p * 0.62, 7.0));
            ba *= 1.0 - 0.5 * (1.0 - smoothstep(0.0, 0.03, cr)) * smoothstep(0.5, 0.64, vnoise3(vec3(p * 0.45, 5.0))) * n0;
            ba *= 0.9 + 0.2 * vnoise3(vec3(p * 7.0, 1.0)) * n0;
          }
          // scorch: blast fans in front of the muzzle and around the breech, ragged edges
          vec2 m1 = p - vec2(-3050.0, 1990.0), m2 = p - vec2(-3180.0, 2095.0), m3 = p - vec2(-2960.0, 1910.0);
          float eN = fbm2(p * 0.09 + 31.0);
          float burn = max(max(1.0 - smoothstep(16.0, 46.0, length(m1 * vec2(1.0, 1.5)) + (eN - 0.5) * 34.0), 1.0 - smoothstep(10.0, 34.0, length(m2) + (eN - 0.5) * 26.0)), 1.0 - smoothstep(8.0, 30.0, length(m3) + (eN - 0.5) * 22.0));
          ba = mix(ba, vec3(0.03, 0.03, 0.04) * (0.7 + 0.8 * fbm2(p * 0.4 + 2.0)), burn * 0.92);
          // oil where the machines stand and the rails run
          vec2 rr = p - vec2(-3252.0, 2129.0), rd = vec2(283.0, -159.0);
          float tt = clamp(dot(rr, rd) / dot(rd, rd), 0.0, 1.0);
          float toRail = length(rr - rd * tt);
          oil = smoothstep(0.58, 0.64, fbm2(p * 0.11 + 23.0)) * (1.0 - smoothstep(24.0, 62.0, toRail)) * m0;
          ba = mix(ba, vec3(0.03, 0.03, 0.05), oil * 0.9);
          col = mix(col, ba, flatK);
        }
      }

      // the shore: black wet basalt shelf, a bright salt line, water stains
      float shoreW = mix(16.0, 7.0, city);
      float shore = smoothstep(shoreW, 2.0, coast);
      if(shore > 0.0){
        vec3 wet = vec3(0.05, 0.06, 0.11) * (0.7 + 0.6 * rock.x);
        col = mix(col, wet, shore * 0.92);
        col = mix(col, vec3(0.28, 0.34, 0.46), smoothstep(5.0, 3.0, coast) * smoothstep(1.5, 3.0, coast) * 0.5);
      }

      // the sea walls of the city: dressed courses, a black tide band, rust and damp running down
      float seaW = cityK * smoothstep(0.16, 0.34, slope) * (1.0 - smoothstep(48.0, 70.0, P.y));
      float wallS = abs(N.x) > abs(N.z) ? P.z : P.x;
      if(seaW > 0.01){
        float wpx2 = length(fwidth(P));
        float cy = P.y / 1.5, cI = floor(cy), al = wallS / 3.2 + cI * 0.5, aI = floor(al);
        float st2 = fract(sin(cI * 41.3 + aI * 17.9) * 43758.5);
        vec3 wallC = mix(vec3(0.27, 0.27, 0.31), vec3(0.37, 0.36, 0.39), mix(0.5, st2, 1.0 - smoothstep(90.0, 320.0, d))) * (0.75 + 0.5 * fbm3(P * 0.22));
        float aaJ = clamp(1.0 - wpx2 * 5.0, 0.0, 1.0);
        float jH = 1.0 - smoothstep(0.0, 0.05, min(fract(cy), 1.0 - fract(cy)));
        float jV = 1.0 - smoothstep(0.0, 0.035, min(fract(al), 1.0 - fract(al)));
        wallC *= 1.0 - 0.55 * max(jH, jV) * aaJ;
        wallC *= 1.0 - 0.4 * smoothstep(0.62, 0.8, vnoise(vec2(wallS * 0.55, P.y * 0.02 + 3.0)));
        float tide = 1.0 - smoothstep(1.2, 4.0 + 1.6 * fbm2(vec2(wallS * 0.08, 1.0)), P.y);
        wallC = mix(wallC, vec3(0.035, 0.05, 0.06), tide * 0.9);
        col = mix(col, wallC, seaW);
      }

      // light: moon + sky, with detail shaping the normal so rock has facets
      float dd = 1.0 - smoothstep(30.0, 500.0, d);
      vec3 N2 = N;
      if(flatK > 0.01 && d < 1100.0){
        float e = max(0.35, d * 0.0025);
        float h0n = shelfH(P.xz, d);
        vec2 gr2 = vec2(shelfH(P.xz + vec2(e, 0.0), d) - h0n, shelfH(P.xz + vec2(0.0, e), d) - h0n) / e;
        N2 = normalize(N2 - vec3(gr2.x, 0.0, gr2.y) * flatK * 1.1);
      }
      if(dd > 0.0 && rockK > 0.05){
        float ex = 0.9;
        vec4 ra = rockDetail(P + vec3(ex, 0.0, 0.0), d, 1.0), rb = rockDetail(P + vec3(0.0, 0.0, ex), d, 1.0), rc = rockDetail(P + vec3(0.0, ex, 0.0), d, 1.0);
        vec3 grad = vec3(ra.y - rock.y, rc.y - rock.y, rb.y - rock.y) / ex;
        N2 = normalize(N - grad * 0.7 * dd * rockK);
      }
      float ao = mix(1.0, 0.72, smoothstep(0.1, 0.5, rock.z)) * (1.0 - 0.3 * forest);
      // the carved forms of the rock: big planes of moon and shadow, the painter's shapes
      float fade = (1.0 - smoothstep(1400.0, 3400.0, d)) * rockK;
      if(fade > 0.01){
        float e = 2.2;
        float f0 = rockForm(P);
        vec3 gr = vec3(rockForm(P + vec3(e, 0.0, 0.0)) - f0, rockForm(P + vec3(0.0, e, 0.0)) - f0, rockForm(P + vec3(0.0, 0.0, e)) - f0) / e;
        gr -= N * dot(gr, N);
        N2 = normalize(N2 - gr * 1.0 * fade);
        ao *= mix(1.0, smoothstep(0.5, 5.0, f0) * 0.55 + 0.45, fade);
      }
      float pF = (1.0 - smoothstep(2200.0, 6000.0, d)) * rockK;
      if(pF > 0.01){
        vec3 Pw = P + vec3(fbm3(P * 0.006) * 64.0, 0.0, fbm3(P * 0.0065 + 7.0) * 64.0);
        float pj = vEdge(Pw * 0.0085);
        vec3 tilt = vec3(_vId, _vId2, _vId3) - 0.5;
        N2 = normalize(N2 + tilt * vec3(1.0, 0.2, 1.0) * 0.95 * pF);
        float wpx = length(fwidth(P));
        float crackW = 0.012 + wpx * 0.0085;
        ao *= 1.0 - 0.62 * (1.0 - smoothstep(crackW * 0.5, crackW * 1.5, pj)) * pF;
        float steep = smoothstep(0.3, 0.6, slope);
        float spacing = 10.0 + tilt.y * 8.0;
        float bed = abs(fract((P.y + dot(tilt.xz, P.xz) * 0.5) / spacing) - 0.5) * spacing;
        float bedLine = (1.0 - smoothstep(0.35, 0.35 + wpx * 1.5, bed)) * clamp(0.9 / max(wpx, 0.001), 0.0, 1.0);
        ao *= 1.0 - 0.45 * bedLine * steep * pF;
      }
      vec3 outc = moonLight(col, N2, P, ao);
      outc += vec3(0.16, 0.22, 0.36) * oil * pow(max(dot(reflect(-normalize(cameraPosition - P), N2), uSunDir), 0.0), 18.0) * 0.5;
      outc *= 1.0 - 0.6 * vNotch;     // the opened rim is in shadow, the gun stands on the sky
      // deep crevices stay ink dark, bright facets catch a silver rim
      outc *= 1.0 - 0.5 * rock.z * dd;

      // lit district: warm pools of light on the streets and steps, very strong: this is what makes the city gold
      float lt = max(cityK, shore * 0.5 * step(0.02, city)) > 0.0 ? blockLit(P.xz) : 0.0;
      if(lt > 0.0){
        outc *= mix(1.0, 0.4, lt * cityK);      // gold streets, not moon on pale paving
        float pool = 0.5 + 0.5 * vnoise(P.xz * 0.06);
        float dots = 0.0;
        outc += col * GOLD * (0.2 + 0.62 * pool * pool * pool) * lt * cityK;
        outc += GOLD * vec3(1.0, 0.9, 0.75) * 0.05 * lt * max(cityK, shore * 0.5);
      }
      // the gold water throws its light back on the sea walls, in moving-water bands
      float wallGlow = seaW * (1.0 - smoothstep(2.0, 46.0, P.y));
      if(wallGlow > 0.01){
        float lS = blockLit(P.xz);
        float rip = 0.55 + 0.45 * sin(P.y * 1.3 + fbm2(vec2(wallS * 0.06, P.y * 0.05)) * 9.0);
        outc += col * vec3(1.1, 0.55, 0.2) * (0.5 + 0.6 * rip) * lS * wallGlow * 0.7;
      }
      // dead districts sink toward black in the hook
      if(cityK > 0.0 && lt < 1.0) outc *= mix(1.0, uDeadMoon, cityK * (1.0 - lt));
      writeOut(outc, 1.0, NV, vDepth, 0.0);
    }
  `;
  return mat(u, vs, fs);
}

// ---------------------------------------------------------------- houses (instanced)
export function houseMaterial() {
  const u = base({});
  const vs = /* glsl */ `
    uniform float uCityNear, uCityFar;
    attribute vec4 aA;   // x, y, z, ry
    attribute vec4 aB;   // w, d, h, floor height
    attribute vec4 aC;   // rgb, seed
    attribute vec4 aL;   // front key, jitter, roof tone, plinth
    attribute vec4 aU;   // perimeter 0..1, kind (0 wall, 1 roof), roof t, face index
    uniform float uLitT;
    ${LIT_GLSL}
    varying vec3 vWorld, vNormalW, vNormalV;
    varying float vDepth, vType;
    varying vec4 vC, vB;
    varying vec3 vLoc;      // u metres along the face, v metres above street, roof t
    varying vec3 vFace;     // face index, face length, gable end flag
    varying vec2 vLit;
    void main(){
      float ry = aA.w, cr = cos(ry), sr = sin(ry);
      float w = aB.x, d = aB.y, h = aB.z, kind = aU.y;
      vec3 p = position;
      vec3 n = normal;
      vec3 lp;
      float face = aU.w, faceL = mod(face, 2.0) < 0.5 ? w : d;
      float uLoc = (aU.x * 4.0 - face) * faceL;
      float type = fract(aC.a * 0.37);        // < .55 hip, < .82 gable, < .94 flat terrace, else hip
      float gableEnd = 0.0;
      if(kind < 0.5){
        float y = p.y * (h + aL.w) - aL.w;
        lp = vec3(p.x * w, y, p.z * d);
      } else {
        float t = aU.z;
        bool isFlat = type > 0.82 && type < 0.94, gable = type >= 0.55 && type <= 0.82;
        float mn = min(w, d);
        float rise = isFlat ? 0.3 : (0.3 + 0.2 * fract(aC.a * 1.9)) * mn + 0.5;
        float run = 0.5 * mn + 0.42;
        float inset = t * run - 0.42;
        vec2 q = vec2(p.x * w, p.z * d);
        vec2 o;
        if(gable){
          if(w >= d){ o = vec2(q.x + sign(q.x) * 0.3, sign(q.y) * max(abs(q.y) - inset, 0.0)); gableEnd = step(0.5, abs(n.x)); }
          else { o = vec2(sign(q.x) * max(abs(q.x) - inset, 0.0), q.y + sign(q.y) * 0.3); gableEnd = step(0.5, abs(n.z)); }
        } else o = sign(q) * max(abs(q) - inset, vec2(0.0));
        lp = vec3(o.x, h + p.y * rise - 0.18, o.y);
        if(gableEnd < 0.5){
          float slp = rise / run;
          n = normalize(vec3(n.x * slp, 1.0, n.z * slp));
        }
      }
      vec3 wp = vec3(aA.x + lp.x * cr + lp.z * sr, aA.y + lp.y, aA.z - lp.x * sr + lp.z * cr);
      // far away single houses sink into the merged roof mass: no grain of tiny roofs
      float sink = smoothstep(uCityNear, uCityFar, distance(cameraPosition, aA.xyz));
      wp.y -= sink * (h + 10.0);
      vWorld = wp;
      vec3 nw = vec3(n.x * cr + n.z * sr, n.y, -n.x * sr + n.z * cr);
      vNormalW = nw;
      vNormalV = normalize(mat3(viewMatrix) * nw);
      vec4 mv = viewMatrix * vec4(wp, 1.0);
      vDepth = -mv.z;
      vC = aC; vB = aB; vType = type;
      vLoc = vec3(uLoc, lp.y, aU.z);
      vFace = vec3(face, faceL, gableEnd);
      vLit = vec2(litAt(aL.x, uLitT, aL.y), aL.z);
      gl_Position = sink >= 1.0 ? vec4(2.0, 2.0, 2.0, 1.0) : projectionMatrix * mv;
    }
  `;
  const fs = /* glsl */ `
    ${COMMON}
    ${MRT_OUT}
    ${PAINT_LIGHT}
    ${LAND_GLSL}
    ${MOON_GLSL}
    varying vec3 vWorld, vNormalW, vNormalV, vLoc, vFace;
    varying float vDepth, vType;
    varying vec4 vC, vB;
    varying vec2 vLit;
    float hsh2(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
    // box of half width a around 0, antialiased by px; thin features average out instead of sparkling
    float aaBox(float x, float a, float px){ return 1.0 - smoothstep(a - px, a + px, abs(x)); }
    void main(){
      if(uPass > 0.5 && uPass < 1.5){ oColor = vec4(1); oData = vec4(0); return; }
      vec3 P = vWorld, N = normalize(vNormalW), NV = normalize(vNormalV);
      if(!gl_FrontFacing){ N = -N; NV = -NV; }
      float d = length(cameraPosition - P);
      float seed = floor(vC.a * 64.0 + 0.5) / 64.0, lit = vLit.x;
      vec3 outc;
      float isRoof = (step(0.001, vLoc.z) + step(vB.z + 0.02, vLoc.y)) * (1.0 - vFace.z);
      float nearF = 1.0 - smoothstep(120.0, 520.0, d);
      float midF = 1.0 - smoothstep(600.0, 2100.0, d);
      float faceI = floor(vFace.x + 0.5), L = floor(vFace.y * 16.0 + 0.5) / 16.0, u0 = vLoc.x, v = vLoc.y;
      float pxU = max(fwidth(u0), 1e-4), pxV = max(fwidth(v), 1e-4);
      float faceSeed = fract(seed * 1.37 + faceI * 0.271);
      if(isRoof > 0.5){
        float rt = vLoc.z;
        float mn = min(vB.x, vB.y);
        float macro = fbm3(vec3(P.x, P.y * 0.3, P.z) * 0.12 + seed);
        float ao = mix(0.6, 1.0, smoothstep(-0.3, 0.3, rt));
        vec3 alb;
        if(vType > 0.82 && vType < 0.94){
          // a flat roof terrace: pale lime render, a dark parapet line, tar patches
          alb = vec3(0.46, 0.4, 0.33) * (0.72 + 0.6 * macro);
          float rim = 1.0 - smoothstep(0.03, 0.09, rt);
          alb = mix(alb, vec3(0.2, 0.19, 0.2), rim * midF);
          alb = mix(alb, vec3(0.1, 0.1, 0.12), smoothstep(0.62, 0.68, fbm3(P * 0.4 + seed)) * nearF * 0.7);
        } else {
          // indigo glazed tile: rows staggered by half a tile, each tile curved; some replaced, some broken; caps on ridge and hips
          vec3 tileA = mix(vec3(0.075, 0.105, 0.34), vec3(0.13, 0.19, 0.5), vLit.y);
          alb = tileA * (0.72 + 0.65 * macro);
          float run = max(rt, 0.0) * (0.5 * mn + 0.42);
          float pxR = max(fwidth(run), 1e-4);
          float cN = run / 0.38, ci = floor(cN), cf = fract(cN);
          float tN = u0 / 0.3 + ci * 0.5, ti = floor(tN), tf = fract(tN);
          float tile = hsh2(vec2(ti + faceI * 91.0, ci + seed * 3.0));
          float mf = clamp(1.0 - pxR * 6.0, 0.0, 1.0) * nearF;
          alb *= mix(1.0, 0.56 + 0.62 * smoothstep(0.0, 0.85, cf) * (1.0 - smoothstep(0.92, 1.0, cf)), mf);
          alb *= mix(1.0, 0.82 + 0.26 * sin(tf * 3.14159), mf * clamp(1.0 - pxU * 8.0, 0.0, 1.0));
          alb = mix(alb, mix(vec3(0.2, 0.26, 0.5), vec3(0.42, 0.24, 0.18), step(0.5, fract(tile * 61.0))), step(tile, 0.05) * mf * 0.8);
          alb = mix(alb, vec3(0.025, 0.03, 0.05), step(0.985, tile) * mf);
          // caps
          float capR = smoothstep(0.965, 0.99, rt);
          float capH = (vType < 0.55 || vType >= 0.94) ? 1.0 - smoothstep(0.0, 0.5 / L, min(u0 / L, 1.0 - u0 / L)) : 0.0;
          alb = mix(alb, tileA * 1.7 + vec3(0.03, 0.03, 0.04), max(capR, capH) * midF);
          // patches of older tile and moss
          alb = mix(alb, alb * vec3(1.3, 1.25, 1.08), step(0.66, vnoise3(P * 0.5 + seed)) * midF * 0.5);
          alb = mix(alb, vec3(0.14, 0.18, 0.15), smoothstep(0.62, 0.72, fbm3(P * 0.33 + 17.0)) * midF * 0.55);
        }
        outc = moonLight(alb, N, P, ao) * uRoofMoon;
        vec3 H = normalize(uSunDir + normalize(cameraPosition - P));
        outc += uSunColor * pow(max(dot(N, H), 0.0), 40.0) * 0.18 * uRoofMoon;
        float eave = 1.0 - smoothstep(0.0, 0.85, rt);
        outc += alb * GOLD * lit * (0.1 + 1.0 * eave);
        if(lit < 1.0) outc *= mix(1.0, uDeadMoon, 1.0 - lit);
      } else {
        float fh = floor(vB.w * 64.0 + 0.5) / 64.0, H = floor(vB.z * 16.0 + 0.5) / 16.0;
        vec3 alb = vC.rgb;
        float macro = fbm3(P * 0.06 + seed * 3.0);
        float streak = fbm3(vec3(P.x * 0.5, P.y * 0.05, P.z * 0.5) + seed);
        alb *= 0.82 + 0.42 * macro;
        // large: replastered patches with a seam; rain runs
        float plN = vnoise3(vec3(u0 * 0.42, v * 0.62, seed + faceI));
        plN += (vnoise3(vec3(u0 * 3.3, v * 3.3, seed + 2.0)) - 0.5) * 0.07;            // trowel edges are ragged, never a smooth curve
        alb = mix(alb, alb * vec3(1.1, 1.07, 0.98), smoothstep(0.6, 0.63, plN) * midF * 0.55);
        alb *= 1.0 - 0.14 * (1.0 - smoothstep(0.0, 0.01, abs(plN - 0.615))) * nearF;
        alb *= 1.0 - 0.3 * smoothstep(0.54, 0.8, streak) * midF;
        // damp rising at the base, wavy edge
        float dampH = 0.8 + 0.8 * fbm2(vec2(u0 * 0.4, seed)) + 0.18 * sin(u0 * 2.3 + seed);
        alb = mix(alb, vec3(0.17, 0.21, 0.19), smoothstep(dampH, dampH - 0.55, v) * midF * 0.62);
        float grime = smoothstep(fh * 1.3, 0.0, v);
        alb *= 1.0 - 0.18 * grime * midF;
        // plaster gone at corners and in chunks: the brick shows
        float cornerD = min(u0, L - u0);
        float lossN = vnoise3(vec3(u0 * 0.7, v * 0.85, seed + faceI * 3.0));
        float loss = max(smoothstep(0.72, 0.5, cornerD * 0.9 + (lossN - 0.5) * 1.5) * step(0.45, faceSeed), smoothstep(0.76, 0.79, fbm3(vec3(u0 * 0.33, v * 0.4, seed + 5.0)))) * step(0.15, v) * nearF;
        if(loss > 0.01){
          float cy = v / 0.26, cr = floor(cy), bn = u0 / 0.52 + cr * 0.5, bx = fract(bn);
          float mortar = max(1.0 - smoothstep(0.02, 0.1, fract(cy)), 1.0 - smoothstep(0.0, 0.06, min(bx, 1.0 - bx)));
          vec3 brick = mix(vec3(0.4, 0.2, 0.15), vec3(0.54, 0.31, 0.22), hsh2(vec2(floor(bn), cr)));
          brick = mix(brick, vec3(0.46, 0.42, 0.38), mortar * clamp(1.0 - pxV * 5.0, 0.0, 1.0));
          alb = mix(alb, brick, smoothstep(0.0, 0.2, loss));
          alb *= 1.0 - 0.36 * (1.0 - smoothstep(0.0, 0.14, abs(loss - 0.12)));
        }
        // plinth: dressed stone courses
        float wallMask = smoothstep(0.1, 0.0, v);
        if(wallMask > 0.0){
          float crs = fract(v * 1.25), bond = fract(u0 * 0.7 + floor(v * 1.25) * 0.5);
          vec3 stone = vec3(0.3, 0.3, 0.34) * (0.78 + 0.4 * vnoise3(P * 1.7));
          stone *= 1.0 - 0.4 * (smoothstep(0.92, 1.0, crs) + smoothstep(0.95, 1.0, bond)) * nearF;
          alb = mix(alb, stone, wallMask);
        }
        // meso cracks and micro grain
        if(nearF > 0.0){
          vec2 crJ = vec2(vnoise3(vec3(u0 * 2.1, v * 2.1, seed)), vnoise3(vec3(u0 * 2.1, v * 2.1, seed + 9.0))) - 0.5;
          float crE = vEdge(vec3(u0 * 0.28 + crJ.x * 0.09, v * 0.36 + crJ.y * 0.09, seed));
          alb *= 1.0 - 0.3 * (1.0 - smoothstep(0.0, 0.008, crE)) * smoothstep(0.66, 0.82, vnoise3(vec3(u0, v, seed) * 0.31)) * nearF;
          alb *= 0.93 + 0.14 * vnoise3(P * 9.0) * nearF;
        }
        // the window grid is fitted to the wall, so no half windows at the corners
        float nW = max(1.0, floor(L / (2.5 + 0.9 * fract(seed * 7.3))));
        float sp = L / nW;
        float fx = u0 / sp, fy = (v - 0.45) / fh;
        float ix = floor(fx), iy = floor(fy), hx = fract(fx) - 0.5, hy = fract(fy);
        float aaX = pxU / sp, aaY = pxV / fh;
        float wW = 0.22 + 0.04 * fract(seed * 3.1), h0 = 0.3, h1 = 0.78;
        float floors = floor((H - 0.8) / fh);
        float above = step(-0.01, iy) * step(iy, floors - 0.5);
        float rnd = hsh2(vec2(ix + faceI * 37.0, iy + seed * 5.0));
        float isDoor = step(abs(ix - floor(nW * 0.5)), 0.1) * step(0.35, faceSeed);
        float doorM = isDoor * aaBox(hx, 0.2, aaX) * step(0.0, v) * step(fy, 0.72);
        float groundDoor = isDoor * step(abs(iy), 0.1);
        float archK = step(0.55, fract(seed * 5.7));
        float win = aaBox(hx, wW, aaX) * smoothstep(h0 - aaY, h0 + aaY, hy) * smoothstep(h1 + aaY, h1 - aaY, hy);
        if(archK > 0.5){ float ad = length(vec2(hx * sp, (hy - h1) * fh)); win = max(win, step(h1, hy) * (1.0 - smoothstep(wW * sp - pxU, wW * sp + pxU, ad))); }
        win *= above * (1.0 - groundDoor);
        // painted joinery goes into the albedo so the light falls on it
        float detail = clamp(1.0 - aaX * 22.0, 0.0, 1.0);
        vec3 shutC = mix(mix(vec3(0.12, 0.3, 0.3), vec3(0.16, 0.2, 0.42), step(0.5, fract(seed * 2.3))), vec3(0.42, 0.2, 0.15), step(0.78, fract(seed * 3.9)));
        // sill and lintel in pale stone, dirt running from the sill
        float sillB = aaBox(hx, wW + 0.05, aaX) * smoothstep(h0 - 0.04 - aaY, h0 - 0.04 + aaY, hy) * smoothstep(h0 + aaY, h0 - aaY, hy) * above * (1.0 - groundDoor);
        alb = mix(alb, vec3(0.52, 0.5, 0.46), sillB * detail);
        float stainB = hy / (h0 - 0.04);
        alb *= 1.0 - 0.3 * aaBox(hx, wW * 0.85, aaX) * step(hy, h0 - 0.04) * stainB * smoothstep(0.35, 0.7, vnoise3(vec3(u0 * 5.0, v * 0.6, seed))) * above * midF;
        // open shutters beside the window, slatted; closed ones replace the window below
        float closed = step(rnd, 0.24) * (1.0 - groundDoor);
        float slat = 0.8 + 0.2 * smoothstep(0.3, 0.5, abs(fract(hy * fh / 0.12) - 0.5)) * clamp(1.0 - pxV * 12.0, 0.0, 1.0);
        float sideS = step(wW, abs(hx)) * aaBox(hx, wW + 0.17, aaX) * smoothstep(h0 - aaY, h0 + aaY, hy) * smoothstep(h1 + aaY, h1 - aaY, hy) * above * (1.0 - groundDoor);
        alb = mix(alb, shutC * slat, sideS * (1.0 - closed) * detail * step(0.3, fract(seed * 11.0)));
        // door: planks and a small lit fanlight
        if(groundDoor > 0.5){
          float plank = 0.82 + 0.18 * smoothstep(0.1, 0.3, abs(fract(hx * sp / 0.2) - 0.5));
          alb = mix(alb, mix(vec3(0.2, 0.13, 0.1), shutC, step(0.5, fract(seed * 6.1))) * mix(1.0, plank, detail), doorM);
        }
        // balconies: a stone slab and an iron rail along part of an upper floor
        float balHere = step(hsh2(vec2(iy + faceI * 7.0, seed)), 0.3) * step(0.5, iy) * step(iy, floors - 0.5) * step(0.4, faceSeed) * step(abs(ix - floor(nW * 0.5 + fract(seed) * 2.0 - 1.0)), 1.1);
        float slab = balHere * smoothstep(0.045 + aaY, 0.045 - aaY, hy);
        float rail = balHere * step(0.045, hy) * step(hy, 0.27);
        float bars = clamp(1.0 - pxU * 14.0, 0.0, 1.0);
        float railC = max(aaBox(fract(u0 / 0.17) - 0.5, 0.14, pxU / 0.17) * bars + 0.28 * (1.0 - bars), aaBox(hy - 0.26, 0.012, aaY));
        alb = mix(alb, vec3(0.05, 0.05, 0.07), rail * railC * 0.92);
        alb = mix(alb, vec3(0.34, 0.33, 0.33), slab);
        // drainpipe
        float pipeU = step(0.5, fract(faceSeed * 3.0)) > 0.5 ? 0.32 : L - 0.32;
        alb = mix(alb, vec3(0.08, 0.09, 0.11), aaBox(u0 - pipeU, 0.05, pxU) * step(0.0, v) * step(v, H) * step(0.3, faceSeed));
        // shop signs over ground floor openings, hand-painted bands
        float signB = step(faceSeed, 0.5) * step(abs(iy), 0.1) * aaBox(hx, 0.42, aaX) * smoothstep(0.83 - aaY, 0.83 + aaY, hy) * smoothstep(1.0, 0.98, hy);
        if(signB > 0.01){
          vec3 board = mix(vec3(0.42, 0.13, 0.1), vec3(0.1, 0.16, 0.36), step(0.5, fract(seed * 13.0)));
          float cG = floor(u0 / 0.34), rG = floor(hy * 9.0);
          float gly = step(0.42, hsh2(vec2(cG + floor(ix) * 3.0, rG + seed))) * aaBox(fract(u0 / 0.34) - 0.5, 0.33, pxU / 0.34) * aaBox(hy - 0.915, 0.05, aaY) * nearF;
          alb = mix(alb, mix(board, vec3(0.8, 0.72, 0.55), gly), signB * detail);
        }
        // laundry on a line between windows
        float lnHere = step(hsh2(vec2(iy * 3.0 + faceI, seed * 2.0)), 0.14) * step(0.5, iy) * step(iy, floors - 0.5);
        if(lnHere > 0.5 && nearF > 0.02){
          float q = 2.0 * abs(fract(fx * 0.5 + seed) - 0.5) - 1.0;
          float ly = 0.9 - 0.06 * (1.0 - q * q);
          alb = mix(alb, vec3(0.1, 0.1, 0.12), aaBox(hy - ly, 0.006, aaY) * nearF);
          float cu = floor(u0 / 0.9);
          float clen = 0.16 + 0.16 * hsh2(vec2(cu, seed));
          float cloth = aaBox(fract(u0 / 0.9) - 0.5, 0.34, pxU / 0.9) * step(hy, ly) * step(ly - clen, hy) * step(0.35, hsh2(vec2(cu * 3.0, seed)));
          vec3 cc = mix(vec3(0.8, 0.76, 0.66), vec3(0.34, 0.42, 0.6), step(0.5, hsh2(vec2(cu, seed * 5.0))));
          alb = mix(alb, cc, cloth * nearF);
        }
        // a closed window is its shutters
        alb = mix(alb, shutC * slat * 0.95, win * closed * detail);
        // a dead wall goes to moon colours; a lit one keeps the ochre under the lamps
        alb = mix(alb, vec3(dot(alb, vec3(0.33))) * vec3(0.78, 0.85, 1.12), (1.0 - lit) * 0.55);
        outc = moonLight(alb, N, P, 1.0 - 0.25 * grime) * (1.0 - 0.45 * lit);
        float glowUp = exp(-max(v, 0.0) / (fh * 1.6));
        outc += alb * vec3(1.0, 0.7, 0.42) * lit * (1.0 * glowUp + 0.42);
        // a window is one of two things: a clean warm pane with a mullion and curtains, or dark glass with a moon glint
        float paper = fract(rnd * 7.1);
        vec3 warm = mix(vec3(1.0, 0.5, 0.14), vec3(1.0, 0.72, 0.34), paper);
        float farAvg = 1.0 - smoothstep(700.0, 2000.0, d);
        float on = step(rnd, 0.82) * (1.0 - closed) * step(0.01, lit);
        float aMm = clamp(1.0 - aaX * 30.0, 0.0, 1.0);
        float mull = max(aaBox(hx, 0.014, aaX), aaBox(hy - 0.52, 0.012, aaY)) * aMm;
        float yy = clamp((hy - h0) / (h1 - h0), 0.0, 1.0);
        if(win > 0.01 && closed < 0.5){
          vec3 wc;
          if(on > 0.5){
            vec3 lamp = warm * (2.6 + 1.4 * paper) * lit * (1.06 - 0.16 * yy);
            float curt = smoothstep(0.62, 0.95, abs(hx) / wW * (0.82 + 0.3 * yy));
            wc = mix(lamp, lamp * vec3(0.55, 0.36, 0.22), curt * detail);
            wc = mix(wc, wc * 0.22, mull);
          } else {
            vec3 glass = mix(vec3(0.03, 0.05, 0.13), vec3(0.08, 0.11, 0.22), yy);
            float dg = hx / wW + yy * 1.2 - 0.35;
            float glint = aaBox(dg, 0.14, aaX * 8.0) * max(dot(N, uSunDir), 0.0) * detail;
            wc = glass + vec3(0.24, 0.32, 0.6) * glint;
            wc = mix(wc, wc * 0.3, mull);
            if(lit < 1.0) wc *= mix(1.0, max(uDeadMoon, 0.3), 1.0 - lit);
          }
          outc = mix(outc, wc, farAvg * win);
        }
        if(lit > 0.0) outc += warm * 0.5 * (1.0 - farAvg) * lit * above;
        if(lit < 1.0) outc *= mix(1.0, uDeadMoon, 1.0 - lit);
      }
      writeOut(outc, 1.0, NV, vDepth, 0.0);
    }
  `;
  return mat(u, vs, fs);
}

// ---------------------------------------------------------------- the far city: one merged roof mass per district
export function massMaterial() {
  const u = base({});
  const vs = /* glsl */ `
    attribute float aH;
    varying float vH;
    ${VERT_STD}
    void main(){ vH = aH; stdVertex(position, normal); }`;
  const fs = /* glsl */ `
    ${COMMON}
    ${MRT_OUT}
    ${PAINT_LIGHT}
    ${LAND_GLSL}
    ${MOON_GLSL}
    varying vec3 vWorld, vNormalW, vNormalV;
    uniform float uCityNear;
    varying float vDepth, vH;
    // an anti-aliased line of half width w metres at world distance dist; fades out when thinner than a pixel, so it never sparkles
    float aaLine(float dist, float w, float px){
      return (1.0 - smoothstep(w, w + px * 1.4, dist)) * clamp(w * 2.0 / max(px, 0.001), 0.0, 1.0);
    }
    void main(){
      vec3 P = vWorld, N = normalize(vNormalW), NV = normalize(vNormalV);
      if(uPass > 0.5 && uPass < 1.5){ oColor = vec4(1); oData = vec4(0); return; }
      if(!gl_FrontFacing){ N = -N; NV = -NV; }
      vec3 V = cameraPosition - P;
      float d = length(V); V /= d;
      if(d < uCityNear + 30.0 + 70.0 * vnoise(P.xz * 0.03)) discard;
      float px = length(fwidth(P.xz)) * 0.7;
      float lit = blockLit(P.xz);
      // districts: whole blocks of one roof colour
      vec2 q = blockUV(P.xz), c = floor(q), f = fract(q);
      float tone = blockHash(c + 3.7);
      vec2 cD = floor(q / 4.0);
      float district = blockHash(cD + 11.0);
      float grade = fbm2(P.xz * 0.0025 + 4.0);
      // dark lanes: block edges, the radial stairs from the bay, every fourth terrace wall
      float bEdge = min(min(f.x, 1.0 - f.x), min(f.y, 1.0 - f.y)) * 128.0;
      float lane = aaLine(bEdge, 3.2, px);
      float th = atan(P.z - 500.0, P.x), rd = length(vec2(P.x, P.z - 500.0));
      float sp = fract(th * 18.0 / 3.14159265);
      float stair = rd > 400.0 ? aaLine(min(sp, 1.0 - sp) * rd * 3.14159265 / 18.0, 4.5, px) : 0.0;
      float gr = sqrt(max(1.0 - N.y * N.y, 0.0)) / max(N.y, 0.2);
      float hq = abs(fract(vH / 16.8 + 0.5) - 0.5) * 16.8 / max(gr, 0.04);
      float terr = aaLine(hq, 2.4, px) * smoothstep(0.03, 0.09, gr);
      float lines = max(lane, stair);
      // the roofs: only a soft mottle that fades with distance, never single tiles
      float near = 1.0 - smoothstep(800.0, 2600.0, d);
      float mott = fbm2(P.xz * 0.05 + tone * 9.0);
      float ndl = dot(N, uSunDir);
      float side = smoothstep(0.1, 0.55, ndl);
      float rimV = pow(1.0 - max(dot(N, V), 0.0), 4.0);
      // a dead district: near black silhouette, one faint moonlit edge on the lanes and terrace walls
      vec3 dead = mix(vec3(0.012, 0.017, 0.05), vec3(0.03, 0.044, 0.115), tone * 0.5 + district * 0.5) * (0.75 + 0.6 * side);
      dead *= 1.0 - 0.75 * max(lines, terr);
      float rim = max(aaLine(abs(bEdge - 5.5), 1.4, px), aaLine(abs(hq - 4.5), 1.3, px) * smoothstep(0.03, 0.09, gr)) * smoothstep(0.0, 0.3, ndl + 0.15);
      dead += vec3(0.1, 0.15, 0.34) * rim * 0.32 * (0.4 + uDeadMoon);
      dead += vec3(0.07, 0.11, 0.26) * rimV * 0.32 * side;
      dead *= mix(0.55, 1.0, uDeadMoon);
      // a lit district: gold roofs in the street glow, brighter lanes, terrace walls in shade; colour varies by block
      vec3 goldA = mix(vec3(0.5, 0.21, 0.07), vec3(0.98, 0.56, 0.16), tone * 0.6 + grade * 0.4);
      goldA = mix(goldA, vec3(0.2, 0.17, 0.36), (0.14 + 0.2 * district) * near);
      goldA *= 0.86 + 0.28 * mix(0.5, mott, near);
      goldA *= 0.7 + 0.5 * fbm2(P.xz * 0.016 + tone * 9.0);        // roofs come in clots even far away, never a flat plate
      goldA = mix(goldA, vec3(1.0, 0.56, 0.2), lines * 0.3);
      goldA = mix(goldA, vec3(0.34, 0.14, 0.05), terr * 0.75);
      goldA *= (0.72 + 0.42 * side) * (0.72 + 0.6 * district);
      vec3 outc = mix(dead, goldA, lit) + warLight(mix(vec3(0.3, 0.25, 0.28), goldA, lit), P, N);
      writeOut(outc, 1.0, NV, vDepth, 0.0);
    }
  `;
  return mat(u, vs, fs);
}

// ---------------------------------------------------------------- lanterns: round paper dots, sprites with a minimum screen size
export function lanternMaterial() {
  const u = base({ uPx: { value: new THREE.Vector2(1920, 1080) } });
  const vs = /* glsl */ `
    uniform float uCityNear, uCityFar;
    attribute vec4 aP;    // world xyz, size
    attribute vec4 aK;    // key, jitter, hue, seed
    uniform float uLitT;
    uniform vec2 uPx;
    ${LIT_GLSL}
    varying vec2 vUvQ;
    varying float vDepth;
    varying vec3 vCol;
    varying float vLit;
    varying float vSize;
    void main(){
      float dW = distance(cameraPosition, aP.xyz);
      vec4 mv = viewMatrix * vec4(aP.xyz + vec3(0.0, smoothstep(uCityNear, uCityFar, dW) * 11.0, 0.0), 1.0);
      float depth = -mv.z;
      vDepth = depth;
      float lit = litAt(aK.x, uLitT, aK.y);
      vLit = lit;
      vec4 clip = projectionMatrix * mv;
      // never smaller than 1.5 px on screen: the far city is a carpet of gold points
      float pxSize = aP.w * projectionMatrix[1][1] * uPx.y * 0.5 / max(depth, 1.0);
      // far away only a part of the lanterns stay, so the distance reads as glow and not as grain
      float seedK = fract(aK.w * 7.13) * 2400.0 + uCityFar;
      float px = max(pxSize, mix(1.5, 0.0, smoothstep(seedK, seedK + 600.0, depth)));
      vSize = pxSize;
      vUvQ = position.xy * 2.0;
      vec2 off = position.xy * 2.0 * px / uPx;
      gl_Position = vec4(clip.xy + off * clip.w, clip.z, clip.w);
      if(lit <= 0.001 || px < 0.3) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
      vCol = mix(vec3(1.0, 0.56, 0.16), vec3(1.0, 0.78, 0.42), aK.z);
    }
  `;
  const fs = /* glsl */ `
    ${MRT_OUT}
    varying vec2 vUvQ;
    varying float vDepth, vLit, vSize;
    varying vec3 vCol;
    void main(){
      float r = length(vUvQ);
      if(r > 1.0) discard;
      float ribs = vSize > 8.0 ? (0.86 + 0.14 * sin(vUvQ.y * 22.0)) : 1.0;
      vec3 c = vCol * ribs * (2.2 + 2.4 * smoothstep(1.0, 0.1, r)) * vLit;
      writeOut(c, 1.0, vec3(0.0, 0.0, 1.0), vDepth, 121.0);
    }
  `;
  return mat(u, vs, fs, { side: THREE.DoubleSide });
}

// ---------------------------------------------------------------- the sea
export function seaMaterial() {
  const u = base({ uHorizon: { value: new THREE.Color('#14246a') }, uDeep: { value: new THREE.Color('#040a2c') } });
  const vs = /* glsl */ `${VERT_STD} void main(){ stdVertex(position, normal); }`;
  const fs = /* glsl */ `
    ${COMMON}
    ${MRT_OUT}
    ${LAND_GLSL}
    uniform vec3 uHorizon, uDeep;
    varying vec3 vWorld, vNormalW, vNormalV;
    varying float vDepth;
    void main(){
      vec3 P = vWorld;
      if(uPass > 0.5 && uPass < 1.5){ oColor = vec4(1); oData = vec4(0); return; }
      vec4 m = maskAt(P.xz);
      vec3 V = cameraPosition - P;
      float dist = length(V);
      V /= dist;
      float t = floor(uTime * 8.0) / 8.0;     // the sea is drawn on threes
      // painted swell: long brushstrokes, broken by the wind
      float n1 = fbm2(P.xz * vec2(0.006, 0.018) + vec2(t * 0.02, -t * 0.05));
      float n2 = fbm2(P.xz * vec2(0.02, 0.05) + vec2(-t * 0.08, t * 0.12) + 7.0);
      float n3 = fbm2(P.xz * vec2(0.11, 0.3) + vec2(t * 0.3, t * 0.2) + 3.0);
      float fade2 = 1.0 - smoothstep(900.0, 3200.0, dist);
      float fade3 = 1.0 - smoothstep(220.0, 1100.0, dist);
      vec2 nS = vec2(n1 - 0.5, n1 * 0.4 - 0.2) * 0.1 + vec2(n2 - 0.5, n2 - 0.5) * 0.14 * fade2 + vec2(n3 - 0.5, 0.5 - n3) * 0.16 * fade3;
      vec3 Nw = normalize(vec3(nS.x, 1.0, nS.y));
      float fres = 0.04 + 0.96 * pow(1.0 - max(dot(V, Nw), 0.0), 3.0);
      // a real mirror: march the reflected ray along its height. Land hides the sky; lit blocks paint gold pillars.
      float hcam = max(cameraPosition.y, 1.0);
      vec2 dir = normalize(P.xz - cameraPosition.xz);
      float dh = dist / hcam;
      float sway = (n2 - 0.5) * 34.0 * fade2 + (n3 - 0.5) * 16.0 * fade3;
      vec2 perp = vec2(-dir.y, dir.x);
      vec3 refl = mix(uHorizon, uDeep, smoothstep(0.0, 0.8, dot(reflect(-V, Nw), vec3(0.0, 1.0, 0.0))));
      float hit = 0.0, gold = 0.0, hills = 0.0;
      for(int i = 0; i < 14; i++){
        float h = 3.0 + float(i * i) * 1.6;
        float s = h * dh;
        vec2 q = P.xz + dir * s + perp * sway;
        vec4 mm = maskAt(q);
        if(mm.g > 0.0 && mm.b + 10.0 + 26.0 * mm.r >= h){
          hit = 1.0;
          float bl = blockLit(q);
          gold = mm.r * bl * (0.55 + 0.45 * (1.0 - float(i) / 14.0));
          hills = mm.b / 800.0;
          break;
        }
      }
      vec3 reflC = mix(refl, vec3(0.01, 0.015, 0.05) + vec3(0.05, 0.07, 0.18) * hills, hit);
      float strokes = smoothstep(0.3, 0.62, fbm2(vec2((P.x * 0.7 + P.z * 0.3) * 0.045, dist * 0.2) + t * 0.25));
      float strokes2 = smoothstep(0.42, 0.66, fbm2(vec2((P.x * 0.7 + P.z * 0.3) * 0.16, dist * 0.7) - t * 0.4));
      reflC += GOLD * vec3(1.0, 0.8, 0.58) * gold * (0.12 + 1.15 * strokes * (0.45 + 0.9 * strokes2));
      // deep water colour with drawn swell banding
      vec3 water = mix(uDeep, uHorizon * 0.95, smoothstep(0.3, 0.7, n1));
      water *= 0.75 + 0.5 * n2 * fade2;
      float band = smoothstep(0.56, 0.6, n2) * fade2;
      water = mix(water, uHorizon * 0.9, band * 0.4);
      vec3 col = mix(water, reflC, clamp(fres + 0.05, 0.0, 1.0));
      // the moon's road
      vec3 Rv = reflect(-V, normalize(vec3(nS.x * 1.2, 1.0, nS.y * 1.2)));
      float sp = max(dot(Rv, uSunDir), 0.0);
      float glit = step(0.985, sp) * smoothstep(0.46, 0.56, n3 * 0.5 + n2 * 0.5) + pow(sp, 300.0) * 0.5;
      col += uSunColor * glit * 1.1 * uSunStrength;
      // foam lace along the shore, wet stains on the basalt
      float c = m.g;
      float foam = smoothstep(-22.0, -3.0, c) * smoothstep(0.32, 0.58, n3 + 0.28 * sin(c * 0.5 + t * 2.0)) * fade3;
      col = mix(col, vec3(0.58, 0.68, 0.92), foam * 0.75);
      col *= uSeaBright;
      writeOut(col, 1.0, vec3(0.0, 0.0, 1.0), vDepth, 0.0);
    }
  `;
  return mat(u, vs, fs);
}

// ---------------------------------------------------------------- steel: pylons, gantries, transformers (inked cel with weathering)
export function steelMaterial(o = {}) {
  const u = base({ uId: { value: o.id ?? 5 }, uLit: { value: 1 } });
  const vs = /* glsl */ `
    attribute vec4 aS;     // col rgb, kind (0 steel, 1 concrete, 2 porcelain, 3 hazard paint)
    varying vec4 vS;
    ${VERT_STD}
    void main(){ vS = aS; stdVertex(position, normal); }`;
  const fs = /* glsl */ `
    ${COMMON}
    ${MRT_OUT}
    ${PAINT_LIGHT}
    ${LAND_GLSL}
    ${MOON_GLSL}
    uniform float uId;
    varying vec3 vWorld, vNormalW, vNormalV;
    varying float vDepth;
    varying vec4 vS;
    void main(){
      vec3 P = vWorld, N = normalize(vNormalW), NV = normalize(vNormalV);
      if(!gl_FrontFacing){ N = -N; NV = -NV; }
      if(uPass > 0.5 && uPass < 1.5){ oColor = vec4(1); oData = vec4(0); return; }
      float d = length(cameraPosition - P);
      vec3 alb = vS.rgb;
      float kind = vS.a;
      float nearF = 1.0 - smoothstep(14.0, 130.0, d);
      float midF = 1.0 - smoothstep(90.0, 620.0, d);
      float macro = fbm3(P * 0.13 + 3.0);
      float streak = fbm3(vec3(P.x * 0.9, P.y * 0.09, P.z * 0.9) + 5.0);
      if(kind < 0.5){
        alb *= 0.72 + 0.6 * macro;
        float rust = smoothstep(0.54, 0.66, streak);
        alb = mix(alb, vec3(0.34, 0.2, 0.15), rust * 0.75 * midF);
        alb *= 1.0 - 0.4 * smoothstep(0.75, 0.9, vnoise3(P * 3.4)) * nearF;
        alb += vec3(0.11, 0.09, 0.08) * smoothstep(0.8, 0.86, vnoise3(P * 8.0)) * nearF;
      } else if(kind < 1.5){
        alb *= 0.74 + 0.5 * macro;
        alb *= 1.0 - 0.34 * smoothstep(0.5, 0.75, streak) * midF;
        if(nearF > 0.0){ float cr = vEdge(P * 0.55 + vec3(3.0)); alb *= 1.0 - 0.5 * (1.0 - smoothstep(0.0, 0.05, cr)) * nearF; alb *= 0.9 + 0.2 * vnoise3(P * 5.0) * nearF; }
      } else if(kind < 2.5){
        alb *= 0.92 + 0.14 * macro;
      } else {
        float st = step(0.5, fract((P.x + P.y) * 1.3));
        alb = mix(vec3(0.68, 0.45, 0.1), vec3(0.04, 0.04, 0.05), st);
      }
      float ao = mix(1.0, 0.82, smoothstep(0.0, 0.7, N.y * -1.0));
      float lit = smoothstep(-0.04, 0.08, dot(N, uSunDir));
      vec3 col = paintLight(alb, N, P, 1.0, ao);
      if(kind > 1.5 && kind < 2.5){ col += uSunColor * step(0.96, dot(N, normalize(uSunDir + normalize(cameraPosition - P)))) * lit * 0.5; }
      writeOut(col, 1.0, NV, vDepth, uId);
    }
  `;
  return mat(u, vs, fs);
}

// ---------------------------------------------------------------- simple screen-space wires (land's own colour logic)
export function wireMat(o = {}) {
  const u = base({ uRes: { value: new THREE.Vector2(1920, 1080) }, uWidth: { value: o.width ?? 1.3 }, uColor: { value: new THREE.Color(o.color ?? '#0d1228') }, uId: { value: o.id ?? 102 } });
  const vs = /* glsl */ `
    attribute vec3 aOther;
    attribute float aSide;
    uniform vec2 uRes;
    uniform float uWidth, uWireK;
    varying float vDepth;
    varying vec3 vWorld;
    void main(){
      vec4 wp = modelMatrix * vec4(position, 1.0);
      vec4 wo = modelMatrix * vec4(aOther, 1.0);
      vWorld = wp.xyz;
      vec4 mv = viewMatrix * wp;
      vDepth = -mv.z;
      vec4 cp = projectionMatrix * mv;
      vec4 co = projectionMatrix * viewMatrix * wo;
      vec2 a = cp.xy / max(cp.w, 1e-3), b = co.xy / max(co.w, 1e-3);
      vec2 d = (b - a) * uRes;
      d = length(d) > 1e-5 ? normalize(d) : vec2(1.0, 0.0);
      vec2 n = vec2(-d.y, d.x);
      float wpx = uWidth * uWireK * clamp(60.0 / max(vDepth, 1.0), 0.8, 2.4);
      cp.xy += n * aSide * wpx / uRes * cp.w;
      gl_Position = cp;
    }
  `;
  const fs = /* glsl */ `
    ${COMMON}
    ${MRT_OUT}
    uniform vec3 uColor;
    uniform float uId;
    varying float vDepth;
    varying vec3 vWorld;
    void main(){
      if(uPass > 0.5 && uPass < 1.5){ oColor = vec4(1); oData = vec4(0); return; }
      vec3 c = uColor + uSunColor * 0.12 * uSunStrength;
      writeOut(c, 1.0, vec3(0.0, 0.0, 1.0), vDepth, uId);
    }
  `;
  return mat(u, vs, fs, { side: THREE.DoubleSide });
}
