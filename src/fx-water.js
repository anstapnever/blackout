import * as THREE from 'three';
import { COMMON, MRT_OUT, G } from './glsl.js';
import { hash, hr, ID, KIND, PAL } from './fx-core.js';
import { clamp, smooth, invLerp, easeOut, lerp, onThrees } from './util.js';

// s27: the wall of water the dead rings raise when they topple into the bay, ring splashes, and drawn water.
// The wall is one CPU-deformed ribbon of geometry, cel-shaded with hard bands and an inked crest: one mass, not a heap of balls.
const V = THREE.Vector3;

function waveMaterial() {
  const u = { ...G, uDrawing: { value: 0 }, uTear: { value: 240 }, uFoam: { value: new THREE.Color('#f6fbff') }, uBody: { value: new THREE.Color('#2f7ea8') }, uDeep: { value: new THREE.Color('#123a70') }, uShade: { value: new THREE.Color('#1b5180') } };
  const vs = /* glsl */ `
    attribute float aV;
    attribute float aTh;
    varying float vV, vTh, vDepth;
    varying vec3 vWorld, vN, vNV;
    void main(){
      vec4 w = modelMatrix * vec4(position, 1.0);
      vWorld = w.xyz; vV = aV; vTh = aTh;
      vN = normalize(mat3(modelMatrix) * normal);
      vNV = normalize(mat3(viewMatrix) * vN);
      vec4 mv = viewMatrix * w;
      vDepth = -mv.z;
      gl_Position = projectionMatrix * mv;
    }
  `;
  const fs = /* glsl */ `
    ${COMMON}
    ${MRT_OUT}
    uniform float uDrawing;
    uniform vec3 uFoam, uBody, uDeep, uShade;
    uniform float uTear;
    varying float vV, vTh, vDepth;
    varying vec3 vWorld, vN, vNV;
    // two nearest cells: their difference draws a net of lines, the lace foam leaves on a breaking face
    float lace(vec2 p){
      vec2 ip = floor(p), fp = fract(p); float d1 = 8.0, d2 = 8.0;
      for(int y = -1; y <= 1; y++) for(int x = -1; x <= 1; x++){
        vec2 g = vec2(float(x), float(y));
        vec2 o = fract(sin(vec2(dot(ip + g, vec2(127.1, 311.7)), dot(ip + g, vec2(269.5, 183.3)))) * 43758.5453);
        float d = length(g + o - fp);
        if(d < d1){ d2 = d1; d1 = d; } else if(d < d2) d2 = d;
      }
      return d2 - d1;
    }
    void main(){
      if(uPass > 0.5 && uPass < 1.5){ oColor = vec4(1.0); oData = vec4(0.0); return; }
      vec3 N = normalize(vN);
      vec3 NV = normalize(vNV);
      if(!gl_FrontFacing){ N = -N; NV = -NV; }
      // the top of the sheet is torn, spray broken off the lip, redrawn on threes
      // rounded billows along the crest, a few sizes of them, boiling on threes
      float th1 = vTh * uTear * 1.3 + 2.4 * vnoise(vec2(vTh * uTear * 0.25, uDrawing * 0.11));
      float th2 = vTh * uTear * 3.1 + 1.6 * vnoise(vec2(vTh * uTear * 0.6 + 5.0, uDrawing * 0.17));
      float crestE = 0.84 + 0.12 * pow(abs(sin(th1)), 0.55) * (0.55 + 0.9 * vnoise(vec2(vTh * uTear * 0.2 + 9.0, 3.0))) + 0.04 * pow(abs(sin(th2)), 0.6);
      if(vV > crestE) discard;
      float flow = vnoise(vec2(vTh * 90.0, vV * 3.4 - uDrawing * 0.34));
      float flow2 = vnoise(vec2(vTh * 230.0 + 11.0, vV * 8.5 - uDrawing * 0.61));
      // the foam cap runs down the face in long dribbles
      float dribble = smoothstep(0.56, 0.84, vnoise(vec2(vTh * 170.0 + 3.0, 1.7 + uDrawing * 0.05)));
      float foamLine = 0.76 + (flow - 0.5) * 0.2 + (flow2 - 0.5) * 0.07 - 0.3 * dribble;
      float lit = dot(N, normalize(uSunDir + vec3(0.0, 0.3, 0.0)));
      vec3 col = mix(uShade, uBody, smoothstep(0.08, 0.16, lit + (flow - 0.5) * 0.14));
      col = mix(col, uDeep, step(vV, 0.32 + (flow2 - 0.5) * 0.1) * 0.8);
      // hard pale streak bands running up the face
      col = mix(col, uBody * 1.55 + vec3(0.06, 0.1, 0.12), step(0.67, flow) * step(vV, 0.92) * (1.0 - step(0.62, vV) * 0.5) * 0.45);
      // painted streaks: long thin brush lines pouring off the lip, light ones and dark ones, on threes
      float s1 = vnoise(vec2(vTh * 760.0, vV * 2.6 - uDrawing * 0.42));
      float s2 = vnoise(vec2(vTh * 1560.0 + 31.0, vV * 5.2 - uDrawing * 0.71));
      float light = step(0.70, s1) * smoothstep(0.08, 0.32, vV) + step(0.74, s2) * smoothstep(0.3, 0.62, vV);
      col = mix(col, uBody * 1.8 + vec3(0.12, 0.2, 0.26), clamp(light, 0.0, 1.0) * 0.62);
      col = mix(col, uDeep * 0.62, step(s1, 0.27) * 0.6);
      // lace: a net of foam lines hanging under the cap, thinning out down the face
      float lc = lace(vec2(vTh * 380.0, vV * 22.0 - uDrawing * 0.3));
      float band = smoothstep(foamLine - 0.24, foamLine - 0.02, vV) * smoothstep(0.46, 0.7, vnoise(vec2(vTh * 95.0 + 40.0, vV * 7.0)));
      col = mix(col, mix(uBody * 1.8, uFoam, 0.6), step(lc, 0.02 + 0.09 * band) * step(0.05, band) * 0.85);
      // foot of the wall, whipped white with a broken edge
      float footE = 0.03 + 0.1 * vnoise(vec2(vTh * 120.0, uDrawing * 0.2));
      if(vV < footE) col = uFoam;
      if(vV > foamLine){
        // the cap is two tones: a pale shade pooled in the hollows
        float sh = vnoise(vec2(vTh * 340.0 + 17.0, vV * 26.0 - uDrawing * 0.46));
        col = mix(uFoam, vec3(0.72, 0.82, 0.94), step(0.62, sh + (crestE - vV) * 0.55 - 0.06));
      }
      else if(vV > foamLine - 0.05) col = mix(uBody, uFoam, 0.55);
      writeOut(col, 1.0, NV, vDepth, 83.0);
    }
  `;
  return new THREE.ShaderMaterial({ glslVersion: THREE.GLSL3, uniforms: u, vertexShader: vs, fragmentShader: fs, side: THREE.DoubleSide });
}

export function createWater(E) {
  const { CUES: C, scene } = E;
  const NT = 240, NV = 16;
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array((NT + 1) * (NV + 1) * 3), aV = new Float32Array((NT + 1) * (NV + 1)), aTh = new Float32Array((NT + 1) * (NV + 1));
  const idx = [];
  for (let j = 0; j <= NT; j++) for (let i = 0; i <= NV; i++) {
    const k = j * (NV + 1) + i;
    aV[k] = i / NV; aTh[k] = j / NT;
    if (j < NT && i < NV) { idx.push(k, k + 1, k + NV + 2, k, k + NV + 2, k + NV + 1); }
  }
  geo.setIndex(idx);
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('aV', new THREE.BufferAttribute(aV, 1));
  geo.setAttribute('aTh', new THREE.BufferAttribute(aTh, 1));
  const wave = new THREE.Mesh(geo, waveMaterial());
  wave.frustumCulled = false; wave.visible = false; wave.userData.noShadow = true;
  scene.add(wave);

  let lastDraw = -1;
  // the orrery publishes where and when its pieces hit the water (sorted by time); fall back to the cue
  const splashes = () => (Array.isArray(E.ctx.orrery?.splashes) ? E.ctx.orrery.splashes : []);
  const firstContact = () => splashes()[0]?.t ?? C.fall + 0.15;

  // radius and height of the wall as functions of time
  const wallR = (a) => 240 + 340 * (1 - Math.exp(-a / 2.2)) + 170 * a;
  // the rings touch the sea late in the shot, so the wall leaps up: it has under two seconds before the cut
  const wallH = (a) => 320 * (1 - Math.exp(-a / 0.75)) * (1 - 0.22 * smooth(invLerp(2.4, 3.6, a))) * Math.exp(-Math.max(a - 4.5, 0) * 0.7);

  const crestN = (th, a) => Math.sin(th * 5 + 1.3) * 0.16 + Math.sin(th * 11 + 4.1) * 0.1 + Math.sin(th * 23 + 0.7 + a * 1.4) * 0.045;

  // What the sheet cannot do alone: foam boiling at the foot so the wall stands in water, not on a line, and spray off the crest.
  function waveDress() {
    const a = E.tq - firstContact();
    if (a < 0 || a > 7.5) return;
    const R = wallR(a), H = wallH(a), CX = E.bay.x, CZ = E.bay.z, cam = E.camera.position;
    const lean = 1 - 0.55 * smooth(invLerp(1.2, 3.2, a));
    const ang = Math.atan2(cam.z - CZ, cam.x - CX), big = clamp(H / 150);
    const N = 56;
    for (let i = 0; i <= N; i++) for (let row = 0; row < 3; row++) {
      if (row === 2 && i % 2) continue;
      const th = ang - 1.3 + (2.6 * (i + 0.6 * hash(i, row, 1))) / N;
      const out = [-4, 30, 80][row] + hr(i, row, 2, -14, row === 2 ? 44 : 18) + 12 * Math.sin(th * 17 + a);
      const r0 = R - 150 + out;
      const rr = [hr(i, row, 3, 14, 36), hr(i, row, 3, 9, 22), hr(i, row, 3, 4, 12)][row] * big;
      const y = [hr(i, row, 4, 2, 34), hr(i, row, 4, 1, 12), 1][row] * big;
      E.puffs.push(CX + Math.cos(th) * r0, y, CZ + Math.sin(th) * r0, rr, 0, 1, 0.36, 0, 1, 0, (i * 7 + row * 13) % 97, 0.02 + 0.2 * hash(i, row, 5), 0, KIND.PUFF, PAL.WATER, ID.STEAM[i % 3]);
    }
    // foam laid flat on the water, thick where it laps the foot and thinning toward the lens: it breaks the line the wall stands on
    const arc = (th0, half, out, m, color, power, seed, bias) => {
      const pts = [];
      for (let q = 0; q <= 10; q++) { const th = th0 - half + (2 * half * q) / 10, r0 = R - 150 + out + 6 * Math.sin(th * 41 + seed); pts.push(new V(CX + Math.cos(th) * r0, 0.8, CZ + Math.sin(th) * r0)); }
      E.beams.push(pts, { m, px: 1.4, width: (s) => Math.pow(Math.sin(Math.PI * s), 0.6), color, hot: [1, 1, 1], power, core: 0.45, soft: 0, seed, mode: 0, bias });
    };
    const DK = Math.floor(E.tq * 8);
    for (let i = 0; i < 44; i++) {
      const th0 = ang - 1.3 + (2.6 * (i + hash(i, 12, 1))) / 44, wob = (hash(i, 12, DK % 3) - 0.5) * 8;
      arc(th0, hr(i, 12, 2, 0.05, 0.11), hr(i, 12, 3, -6, 40) + wob, hr(i, 12, 4, 2.2, 5.5) * big, [0.6, 0.78, 0.95], 0.9, i * 0.17, 70);
    }
    for (let k = 0; k < 10; k++) {
      const fade = 1 - k / 10, out = 60 + 26 * k + 3 * k * k;
      for (let i = 0; i < 8; i++) {
        const th0 = ang - 0.95 + 1.9 * (i + hash(i, k, 13)) / 8, half = hr(i, k, 14, 0.015, 0.075);
        if (hash(i, k, 15) < 0.25) continue;
        arc(th0, half, out + hr(i, k, 16, -14, 14) + 60 * a, (0.5 + 0.12 * k) * big, [0.3 + 0.3 * fade, 0.5 + 0.26 * fade, 0.86], 0.35 + 0.4 * fade, k + i * 0.3, 2);
      }
    }
    const NC = 88;
    for (let i = 0; i <= NC; i++) {
      const th = ang - 1.3 + (2.6 * (i + 0.5 * hash(i, 5, 1))) / NC;
      const crest = H * (1 + crestN(th, a));
      const r0 = R - 30 + crest * 0.17 * lean;
      const x = CX + Math.cos(th) * r0, z = CZ + Math.sin(th) * r0, y = crest * 0.9 + hr(i, 5, 2, -10, 10);
      // spray thrown off the lip, a loop per stroke
      const T = hr(i, 5, 5, 0.5, 1.0), ph = (E.tq / T + hash(i, 5, 6)) % 1, tf = ph * T;
      const vr = hr(i, 5, 7, 12, 60), vy = hr(i, 5, 8, 45, 130), g = 240;
      const P = new V(x + Math.cos(th) * vr * tf, y + vy * tf - 0.5 * g * tf * tf, z + Math.sin(th) * vr * tf);
      const dt = 0.07, Q = new V(P.x - Math.cos(th) * vr * dt, P.y - (vy - g * tf) * dt, P.z - Math.sin(th) * vr * dt);
      E.beams.push([Q, Q.clone().lerp(P, 0.5), P], { m: 0.5, px: 1.5, width: (s) => Math.sin(Math.PI * s), color: [0.86, 0.95, 1], hot: [1, 1, 1], power: 1.1, core: 0.5, soft: 2, seed: i * 0.2, mode: 0, bias: 6 });
    }
  }

  // Where a piece of the rings strikes: a spout thrown straight up, tall enough to stand clear over the wall, breaking into drops.
  function spouts(list) {
    const maxS = Math.max(1e-3, ...list.map((q) => q.size ?? 1));
    list.forEach((q, j) => {
      const a = E.tq - q.t, life = 2.8;
      if (a < 0 || a > life || (q.size ?? 1) / maxS < 0.3) return;
      const k = clamp((q.size ?? 1) / maxS), hMax = 330 + 130 * k;
      const h = hMax * (1 - Math.exp(-a / 0.2)) * (1 - 0.3 * smooth(invLerp(0.9, life, a)));
      const thin = 1 - 0.65 * smooth(invLerp(1.2, life, a)), w0 = (9 + 11 * k) * (1 + 0.2 * a) * thin;
      const dirA = hash(j, 6, 1) * 6.283, lean = hr(j, 6, 2, 12, 46);
      const style = { color: [0.4, 0.6, 0.86], hot: [0.84, 0.93, 1], power: 0.82, core: 0.5, soft: 0, mode: 0, bias: 4 };
      const pts = [];
      for (let i = 0; i <= 20; i++) {
        const f = i / 20, wob = 7 * Math.sin(f * 7 + j * 2) * f;
        pts.push(new V(q.x + Math.cos(dirA) * (lean * f + wob), h * 0.9 * f, q.z + Math.sin(dirA) * (lean * f + wob)));
      }
      E.beams.push(pts, { ...style, m: w0, px: 3, width: (s) => (1 - 0.7 * s) * (s > 0.9 ? (1 - s) / 0.1 : 1), seed: j + 0.4 });
      // the head splits into fingers that fan out and droop
      for (let n = 0; n < 4; n++) {
        const f0 = hr(n, j, 21, 0.5, 0.86), base = pts[Math.round(f0 * 20)], th = dirA + hr(n, j, 22, 0, 6.283);
        const spread = hr(n, j, 23, 30, 90) * (0.5 + 0.5 * clamp(a / 0.6)), top = h * (0.9 + hr(n, j, 24, 0, 0.22)) - base.y;
        const fp = [];
        for (let q2 = 0; q2 <= 12; q2++) {
          const u = q2 / 12, dr = spread * Math.pow(u, 1.5);
          fp.push(new V(base.x + Math.cos(th) * dr, base.y + top * (1 - (1 - u) * (1 - u)) - 34 * u * u * clamp(a - 0.3), base.z + Math.sin(th) * dr));
        }
        E.beams.push(fp, { ...style, m: w0 * hr(n, j, 25, 0.26, 0.5), px: 2, width: (s) => Math.pow(1 - s, 0.8), seed: j + n * 0.2 });
      }
      // falling water pulled out of the spout's head as drawn strokes
      for (let i = 0; i < 12; i++) {
        const th = hash(i, j, 9) * 6.283, vr = hr(i, j, 10, 30, 150), vy = hr(i, j, 11, 120, 480) * (0.7 + 0.5 * k), g = 260;
        const tf = a, P = new V(q.x + Math.cos(th) * vr * tf, vy * tf - 0.5 * g * tf * tf + h * 0.25, q.z + Math.sin(th) * vr * tf);
        if (P.y < 2) continue;
        const dt = 0.055, Q = new V(P.x - Math.cos(th) * vr * dt, P.y - (vy - g * tf) * dt, P.z - Math.sin(th) * vr * dt);
        E.beams.push([Q, Q.clone().lerp(P, 0.5), P], { m: 0.6, px: 1.6, width: (s) => Math.sin(Math.PI * s), color: [0.86, 0.95, 1], hot: [1, 1, 1], power: 1.1, core: 0.5, soft: 2, seed: i * 0.13 + j, mode: 0, bias: 6 });
      }
    });
  }

  function updateWave(st) {
    const t0 = firstContact(), a = E.tq - t0;
    if (a < 0 || a > 7.5) { wave.visible = false; return; }
    wave.visible = true;
    wave.material.uniforms.uDrawing.value = E.draw;
    const k = Math.floor(E.tq * 8);
    if (k === lastDraw) return;
    lastDraw = k;
    const CX = E.bay.x, CZ = E.bay.z;
    const R = wallR(a), H = wallH(a);
    const lean = 1 - 0.55 * smooth(invLerp(1.2, 3.2, a));   // the crest curls and slumps forward
    for (let j = 0; j <= NT; j++) {
      const th = (j / NT) * Math.PI * 2;
      const nA = crestN(th, a);
      const crest = H * (1 + nA);
      for (let i = 0; i <= NV; i++) {
        const v = i / NV;
        // cross section: a broad back slope, a steep face, the lip thrown forward over it
        const rb = R - 60 + (1 - v) * -90;
        const curl = Math.pow(v, 3) * crest * 0.17 * lean;
        const r = rb + 30 * v + curl;
        const y = crest * Math.pow(v, 0.62) * (1 - 0.08 * Math.pow(v, 6));
        const ptr = (j * (NV + 1) + i) * 3;
        pos[ptr] = CX + Math.cos(th) * r;
        pos[ptr + 1] = y - 2;
        pos[ptr + 2] = CZ + Math.sin(th) * r;
      }
    }
    geo.attributes.position.needsUpdate = true;
    geo.computeVertexNormals();
  }

  // a crown of water where a piece of the rings strikes the bay: one torn sheet, the same drawing as the wall
  const crowns = [];
  const CT = 72, CV = 8;
  for (let n = 0; n < 9; n++) {
    const g = new THREE.BufferGeometry();
    const P = new Float32Array((CT + 1) * (CV + 1) * 3), aVv = new Float32Array((CT + 1) * (CV + 1)), aThv = new Float32Array((CT + 1) * (CV + 1));
    const id = [];
    for (let j = 0; j <= CT; j++) for (let i = 0; i <= CV; i++) {
      const k = j * (CV + 1) + i;
      aVv[k] = i / CV; aThv[k] = j / CT;
      if (j < CT && i < CV) id.push(k, k + 1, k + CV + 2, k, k + CV + 2, k + CV + 1);
    }
    g.setIndex(id);
    g.setAttribute('position', new THREE.BufferAttribute(P, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aV', new THREE.BufferAttribute(aVv, 1));
    g.setAttribute('aTh', new THREE.BufferAttribute(aThv, 1));
    const mat = waveMaterial();
    mat.uniforms.uTear.value = 70;
    const m = new THREE.Mesh(g, mat);
    m.frustumCulled = false; m.visible = false; m.userData.noShadow = true;
    scene.add(m);
    crowns.push(m);
  }
  function crown(n, x, z, t0, R, seed) {
    const m = crowns[n], a = E.tq - t0;
    if (a < 0 || a > 3.4) { m.visible = false; return; }
    m.visible = true;
    m.material.uniforms.uDrawing.value = E.draw;
    const k = Math.floor(E.tq * 8);
    if (m.userData.d === k) return;
    m.userData.d = k;
    const P = m.geometry.attributes.position.array;
    // shoots up fast, hangs, falls back into the sea: the sheet sinks to nothing, it never pops off
    const up = (1 - Math.exp(-a / 0.28)) * (1 - smooth(invLerp(1.3, 3.3, a)));
    const H = R * 1.05 * up;
    const Rt = R * (0.55 + 0.75 * (1 - Math.exp(-a / 0.5)) + 0.22 * a);
    for (let j = 0; j <= CT; j++) {
      const th = (j / CT) * Math.PI * 2;
      const wob = 1 + 0.26 * Math.sin(th * 7 + seed) + 0.16 * Math.sin(th * 15 + seed * 2.3);
      const crest = H * wob;
      for (let i = 0; i <= CV; i++) {
        const v = i / CV;
        const r = Rt * (0.82 + 0.3 * v * v);
        const ptr = (j * (CV + 1) + i) * 3;
        P[ptr] = x + Math.cos(th) * r;
        P[ptr + 1] = crest * Math.pow(v, 0.8) - 1;
        P[ptr + 2] = z + Math.sin(th) * r;
      }
    }
    m.geometry.attributes.position.needsUpdate = true;
    m.geometry.computeVertexNormals();
    E.ringQueue.push({ x, z, r: R * 0.6 + 170 * a, k: 1 - smooth(invLerp(0.8, 2.6, a)) });
  }

  return {
    update(st) {
      updateWave(st);
      waveDress();
      const O = E.bay, list = splashes();
      spouts(list);
      const maxS = Math.max(1e-3, ...list.map((q) => q.size ?? 1));
      for (let j = 0; j < 9; j++) {
        const q = list[j];
        if (q) { crown(j, q.x, q.z, q.t, 46 + 70 * clamp((q.size ?? 1) / maxS), j + 2); continue; }
        if (list.length) { crowns[j].visible = false; continue; }
        const tt = C.fall + 0.25 + j * 0.34 + hash(j, 2, 1) * 0.14;
        const a = hr(j, 2, 2, 0, 6.28), r = hr(j, 2, 3, 0.15, 1.0) * 260;
        crown(j, O.x + Math.cos(a) * r, O.z + Math.sin(a) * r * 0.9, tt, hr(j, 2, 4, 42, 96), j + 2);
      }
    },
  };
}
