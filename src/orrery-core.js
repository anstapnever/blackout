import * as THREE from 'three';
import { G, COMMON, MRT_OUT, VERT_STD } from './glsl.js';

// ORRERY dept: the lacquer core. A lacquer sphere built like a dome with sliding shutters: long meridian gores around the local Y axis,
// the four front gores slide away over the rear shell like observatory shutters. A slit is a few degrees of that slide, "opening" is the whole of it.
// No pupil, no iris, no radial lines toward the viewer: when it opens there is only a furnace. Local +Z is the firing direction, the group is rolled so the slit is never vertical.
const R = 74, ROLL = 0.58;

function dirOf(p, a) { return [Math.sin(p) * Math.sin(a), Math.cos(p), Math.sin(p) * Math.cos(a)]; }
function pushPatch(pos, nor, inf, idx, R0, a0, a1, p0, p1, seg, part, flip = false) {
  const base = pos.length / 3;
  const na = Math.max(2, Math.round(seg * Math.min(1, Math.abs(a1 - a0) / 1.2) + 2));
  for (let i = 0; i <= seg; i++) for (let j = 0; j <= na; j++) {
    const p = p0 + (p1 - p0) * (i / seg), a = a0 + (a1 - a0) * (j / na);
    const d = dirOf(p, a);
    pos.push(d[0] * R0, d[1] * R0, d[2] * R0); nor.push(flip ? -d[0] : d[0], flip ? -d[1] : d[1], flip ? -d[2] : d[2]); inf.push(part, p, a, j / na);
  }
  for (let i = 0; i < seg; i++) for (let j = 0; j < na; j++) {
    const q = base + i * (na + 1) + j, r = q + na + 1;
    idx.push(q, r, r + 1, q, r + 1, q + 1);
  }
}
// edge wall along a meridian
function pushRim(pos, nor, inf, idx, R0, R1, a, p0, p1, seg, part, sign) {
  const base = pos.length / 3;
  const nx = Math.cos(a) * sign, nz = -Math.sin(a) * sign;
  for (let j = 0; j <= seg; j++) for (let k = 0; k < 2; k++) {
    const p = p0 + (p1 - p0) * (j / seg), d = dirOf(p, a), r = k ? R1 : R0;
    pos.push(d[0] * r, d[1] * r, d[2] * r); nor.push(nx, 0, nz); inf.push(part, p, a, 0);
  }
  for (let j = 0; j < seg; j++) { const q = base + j * 2, r = q + 2; idx.push(q, r, r + 1, q, r + 1, q + 1); }
}
function buildGeo(fn) {
  const pos = [], nor = [], inf = [], idx = [];
  fn(pos, nor, inf, idx);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('aInfo', new THREE.Float32BufferAttribute(inf, 4));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array((pos.length / 3) * 2), 2));
  g.setIndex(idx);
  return g;
}

export function coreMaterial() {
  const u = { ...G, uCharge: { value: 0 }, uHot: { value: 0 }, uDead: { value: 0 }, uCrack: { value: 0 } };
  const vs = /* glsl */ `
    attribute vec4 aInfo; varying vec4 vInfo; varying vec3 vLocal;
    ${VERT_STD}
    void main(){ vInfo = aInfo; vLocal = position; stdVertex(position, normal); }
  `;
  const fs = /* glsl */ `
    ${COMMON}
    ${MRT_OUT}
    uniform float uCharge, uHot, uDead, uCrack;
    varying vec3 vWorld, vNormalW, vNormalV, vLocal; varying vec4 vInfo; varying float vDepth; varying vec2 vUv;
    float aaL(float d, float w, float px){ return 1.0 - smoothstep(w - px * 0.5, w + px, d); }
    void main(){
      if(uPass > 0.5 && uPass < 1.5){ oColor = vec4(1); oData = vec4(0); return; }
      float part = floor(vInfo.x + 0.5);
      vec3 N = normalize(vNormalW), NV = normalize(vNormalV);
      vec3 V = normalize(cameraPosition - vWorld);
      float px = length(fwidth(vWorld)) * 0.72;
      vec3 outc;
      float id = 29.0;
      if(part > 2.5){
        // the inner sphere: pure heat in hard concentric bands. No dark centre, nothing that could read as a pupil.
        float rr = 1.0 - max(dot(N, V), 0.0);
        // a furnace of hard concentric lobes: coral with cream-white crests, a small white heart. Ripples run outward.
        vec3 pw = normalize(vLocal) * 3.4;
        float wob = (fbm3(pw + vec3(0.0, uDrawTime * 0.5, 0.0)) - 0.5) * 0.62 + 0.28 * sin(atan(vLocal.y, vLocal.x) * 3.0 + uDrawTime * 1.4) * rr;
        float q = rr * 0.8 + wob;
        float bands = floor(q * 6.0) / 6.0;
        vec3 c = mix(vec3(1.0, 0.42, 0.18), vec3(0.72, 0.07, 0.09), smoothstep(0.1, 0.75, bands));
        float crest = step(0.66, fract(q * 9.0 - uDrawTime * 1.8));
        c = mix(c, vec3(1.0, 0.72, 0.42) * 1.15, crest * 0.75);
        c = mix(c, vec3(1.05, 0.98, 0.86) * 1.35, 1.0 - smoothstep(0.0, 0.05, q));
        outc = c * (0.25 + 0.95 * uHot);
        id = 110.0;
      } else {
        float m = fbm3(vLocal * 0.02), m2 = fbm3(vLocal * 0.09 + 7.0);
        float p = vInfo.y, az = vInfo.z;
        vec3 col = mix(vec3(0.66, 0.035, 0.05), vec3(0.34, 0.02, 0.06), smoothstep(0.35, 0.7, m));
        // lacquer brush banding and fine crackle
        float meso = 1.0 - smoothstep(0.5, 1.4, px);
        col *= 1.0 + (fbm2(vec2(az * 6.0, p * 60.0)) - 0.5) * 0.3 * meso;
        float crack = 0.0;
        { vec3 q = vLocal * 0.2; float e = abs(fract(q.x + vnoise3(q * 0.9) * 2.0) - 0.5) + abs(fract(q.z + vnoise3(q * 0.7 + 5.0) * 2.0) - 0.5); crack = aaL(e, 0.03, px * 0.4) * meso; }
        col = mix(col, vec3(0.2, 0.02, 0.06), crack * 0.6);
        // gold: latitude hairlines and little studs along the gores
        float lat = abs(fract(p * 6.0) - 0.5) / 6.0 * ${R.toFixed(1)};
        float g = aaL(lat, 0.11, px) * meso;
        float inner = step(1.5, part);
        vec3 gold = vec3(0.98, 0.72, 0.32) * (0.75 + 0.5 * m2);
        col = mix(col, gold, g * 0.75 * (1.0 - inner));
        if(part > 0.5 && part < 1.5) col = gold * (0.8 + 0.5 * m2);
        if(inner > 0.5) col = vec3(0.34, 0.03, 0.06) * (0.7 + 0.8 * m2);

        float ndl = dot(N, uKeyDir);
        float lit = smoothstep(-0.02, 0.06, ndl) * sunShadow(vWorld, N);
        vec3 litC = col * mix(uSkyTint, uSunColor * 1.5, uSunStrength);
        vec3 shC = col * uShadeTint * 1.5;
        outc = mix(shC, litC, lit);
        vec3 R2 = reflect(-V, normalize(N + (vec3(m, m2, m) - 0.5) * 0.05));
        float e = R2.y;
        vec3 env = e > 0.55 ? vec3(0.6, 0.7, 1.0) * 0.72 : e > 0.22 ? vec3(0.28, 0.3, 0.55) * 0.45 : e > -0.08 ? vec3(0.12, 0.1, 0.22) : vec3(0.24, 0.1, 0.16);
        if(inner < 0.5){
          outc += env * 0.32;
          // a painted reflection, not a specular dot: a curved window with two mullions, a thin second arc, and a few beads running off its end.
          vec3 A = normalize(V + uKeyDir * 0.3 + vec3(0.0, 0.25, 0.0));
          vec3 T = normalize(cross(vec3(0.0, 1.0, 0.0), A)), B = cross(A, T);
          vec2 hp = vec2(dot(N, T), dot(N, B));
          float hr = length(hp), ha = atan(hp.y, hp.x), fw = fwidth(hr) * 1.2 + 0.002;
          float front = step(0.0, dot(N, A));
          // main window: top left, a lens that tapers to points
          float da = (ha - 2.25) / 0.5;
          float w = 0.085 * sqrt(max(0.0, 1.0 - da * da));
          float win = (1.0 - smoothstep(w - fw, w + fw, abs(hr - 0.62))) * step(abs(da), 1.0);
          float mull = 1.0 - (1.0 - smoothstep(0.012, 0.022, abs(ha - 2.11))) - (1.0 - smoothstep(0.012, 0.022, abs(ha - 2.42)));
          win *= clamp(mull, 0.0, 1.0);
          float upper = smoothstep(0.62 - fw, 0.62 + fw, hr);
          // second arc, thin, under the window's far end
          float db = (ha - 2.82) / 0.3;
          float wb = 0.02 * sqrt(max(0.0, 1.0 - db * db));
          float arc2 = (1.0 - smoothstep(wb - fw, wb + fw, abs(hr - 0.8))) * step(abs(db), 1.0);
          // lower right: the warm reflected band of the land
          float dc2 = (ha + 0.72) / 0.62;
          float wc = 0.036 * sqrt(max(0.0, 1.0 - dc2 * dc2));
          float arc3 = (1.0 - smoothstep(wc - fw, wc + fw, abs(hr - 0.74))) * step(abs(dc2), 1.0);
          // beads
          float beads = 0.0;
          for(int i = 0; i < 3; i++){
            float fi = float(i), a0 = 1.66 - fi * 0.13, rb = 0.62 - fi * 0.01;
            vec2 c0 = vec2(cos(a0), sin(a0)) * rb;
            beads = max(beads, 1.0 - smoothstep(0.018 - fi * 0.004 - fw, 0.018 - fi * 0.004 + fw, distance(hp, c0)));
          }
          outc = mix(outc, mix(vec3(0.82, 0.86, 1.0), vec3(1.18, 1.14, 1.2), upper), win * front * 0.95);
          outc = mix(outc, vec3(0.92, 0.84, 1.0), arc2 * front * 0.55);
          outc = mix(outc, vec3(1.0, 0.52, 0.42), arc3 * front * 0.5);
          outc = mix(outc, vec3(1.1, 1.06, 1.14), beads * front * 0.85);
          float fres = 1.0 - max(dot(N, V), 0.0);
          outc = mix(outc, vec3(0.9, 0.34, 0.3), smoothstep(0.66, 0.72, fres) * 0.7);
        }
        // charged: seams and the latitude gold flush with coral
        vec3 coral = mix(vec3(1.0, 0.2, 0.1), vec3(1.0, 0.72, 0.5), uCharge);
        if(inner > 0.5) outc += coral * (0.12 + 0.75 * uHot);
        outc += coral * g * uCharge * 1.6 * (1.0 - inner);
        outc += coral * (part > 0.5 && part < 1.5 ? 1.0 : 0.0) * uCharge * 2.0;
        float pulse = pow(0.5 + 0.5 * sin(uDrawTime * 5.0 + p * 7.0), 3.0);
        outc += vec3(1.0, 0.16, 0.1) * col * uCharge * (0.15 + 0.8 * pulse) * (1.0 - inner);
        if(uDead > 0.001){ float l = dot(outc, vec3(0.3, 0.55, 0.15)); outc = mix(outc, vec3(l) * vec3(0.5, 0.5, 0.7), uDead * 0.85); }
        id = part > 0.5 && part < 1.5 ? 26.0 : 29.0;
      }
      writeOut(outc, 1.0, NV, vDepth, id);
    }
  `;
  return new THREE.ShaderMaterial({ glslVersion: THREE.GLSL3, uniforms: u, vertexShader: vs, fragmentShader: fs, side: THREE.DoubleSide });
}

// returns { group, gores: [{mesh, side, order}], inner, back, mat }
export function buildCore() {
  const mat = coreMaterial();
  const group = new THREE.Group();
  const P0 = 0.09, P1 = Math.PI - 0.09, QA = Math.PI / 4, thick = 5;
  const gores = [];
  const makeGore = (a0, a1, Rg, side, order) => {
    const g = buildGeo((pos, nor, inf, idx) => {
      pushPatch(pos, nor, inf, idx, Rg, a0, a1, P0, P1, 40, 0);
      pushPatch(pos, nor, inf, idx, Rg - thick, a0, a1, P0, P1, 20, 2, true);
      pushRim(pos, nor, inf, idx, Rg, Rg - thick, a0, P0, P1, 30, 1, -1);
      pushRim(pos, nor, inf, idx, Rg, Rg - thick, a1, P0, P1, 30, 1, 1);
      // raised gold bead down the middle of each gore
      const am = (a0 + a1) / 2, dA = 0.008;
      pushPatch(pos, nor, inf, idx, Rg + 0.32, am - dA, am + dA, P0 + 0.05, P1 - 0.05, 26, 1);
    });
    const m = new THREE.Mesh(g, mat); m.matrixAutoUpdate = false; m.frustumCulled = false;
    group.add(m);
    gores.push({ mesh: m, side, order });
  };
  // front gores: inner pair rides on the outer pair rides on the rear shell
  makeGore(0.008, QA, R + 2.8, 1, 0);
  makeGore(QA - 0.02, 2 * QA, R + 1.4, 1, 1);
  makeGore(-QA, -0.008, R + 2.8, -1, 0);
  makeGore(-2 * QA, -QA + 0.02, R + 1.4, -1, 1);
  // rear shell, gold collars at the poles
  const backG = buildGeo((pos, nor, inf, idx) => {
    pushPatch(pos, nor, inf, idx, R, Math.PI / 2 - 0.01, 3 * Math.PI / 2 + 0.01, P0, P1, 56, 0);
    for (const lat of [0.72, 1.24, Math.PI - 1.24, Math.PI - 0.72]) pushPatch(pos, nor, inf, idx, R + 0.34, Math.PI / 2, 3 * Math.PI / 2, lat - 0.008, lat + 0.008, 2, 1);
    // pole caps
    for (const [p0, p1] of [[0, P0 + 0.14], [P1 - 0.14, Math.PI]]) pushPatch(pos, nor, inf, idx, R + 3.4, 0, Math.PI * 2, p0, p1, 8, 1);
  });
  const back = new THREE.Mesh(backG, mat); back.frustumCulled = false;
  group.add(back);
  // lining, and the furnace inside
  const lining = buildGeo((pos, nor, inf, idx) => { pushPatch(pos, nor, inf, idx, R - thick - 1.5, Math.PI / 2 - 0.2, 3 * Math.PI / 2 + 0.2, 0, Math.PI, 40, 2, true); });
  const lin = new THREE.Mesh(lining, mat); lin.frustumCulled = false; group.add(lin);
  const innerG = new THREE.SphereGeometry(R - thick - 12, 48, 32);
  innerG.setAttribute('aInfo', new THREE.Float32BufferAttribute(new Float32Array(innerG.attributes.position.count * 4).fill(3), 4));
  const inner = new THREE.Mesh(innerG, mat); inner.frustumCulled = false;
  group.add(inner);
  return { group, gores, inner, back, mat, R, ROLL };
}

// bloom 0..1 slides the shutters fully open; slit 0..1 parts the inner pair by a few degrees.
export function poseCore(core, bloom, slit) {
  for (const { mesh, side, order } of core.gores) {
    const open = order === 0 ? bloom * 1.54 + slit * 0.075 : bloom * 0.77;
    mesh.matrix.makeRotationY(side * open);
    mesh.matrixWorldNeedsUpdate = true;
  }
}
