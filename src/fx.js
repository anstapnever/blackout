import * as THREE from 'three';
import {
  hash, hr, GEO, ID, KIND, PAL, PuffBatch, puffMaterial, ChunkBatch, LineBatch, boltMaterial, boltPts,
  GlowBatch, glowMaterial, GLOW, planeRingMaterial, screenFlashMaterial,
} from './fx-core.js';
import { RibbonBatch, beamMaterial, trailMaterial, linePts } from './fx-beam.js';
import { fireDome, eruption, fireWall, plume } from './fx-fire.js';
import { createRockets } from './fx-rockets.js';
import { createHelix, ICE, CORAL } from './fx-helix.js';
import { createWater } from './fx-water.js';
import * as FX_CAMS from './fx-cams.js';
import { holeRadiusFn, holeDist } from './mech-shield.js';
import { registerCams } from './shots.js';
import { COMMON, MRT_OUT, G, addWarLight } from './glsl.js';
import { CANNON, ORRERY, TORTOISE, HERON, aimDir } from './layout.js';
import { clamp, smooth, invLerp, easeOut, easeIn, onThrees } from './util.js';

// BLACKOUT FX department. Drawn on threes, big confident shapes, white cores, hard colour bands.
// World-space and pure in state.t; beams and fire light the land through addWarLight (see E.light).

const V = THREE.Vector3;
const GOLD = [1.0, 0.68, 0.22];

function petalMaterial() {
  const u = { ...G, uId: { value: 81 } };
  const vs = /* glsl */ `
    varying vec3 vNV, vCol, vObj;
    varying float vDepth;
    void main(){
      vec4 mv = viewMatrix * modelMatrix * instanceMatrix * vec4(position, 1.0);
      vNV = normalize(mat3(viewMatrix) * mat3(modelMatrix) * mat3(instanceMatrix) * normal);
      vDepth = -mv.z; vObj = position;
      #ifdef USE_INSTANCING_COLOR
        vCol = instanceColor;
      #else
        vCol = vec3(1.0);
      #endif
      gl_Position = projectionMatrix * mv;
    }
  `;
  const fs = /* glsl */ `
    ${COMMON}
    ${MRT_OUT}
    uniform float uId;
    varying vec3 vNV, vCol, vObj;
    varying float vDepth;
    void main(){
      if(uPass > 0.5 && uPass < 1.5){ oColor = vec4(1); oData = vec4(0); return; }
      vec3 NV = normalize(vNV);
      if(!gl_FrontFacing) NV = -NV;
      // drawn heat: a white-hot edge, the body in the instance colour, a darker cooling heart
      float e = length(vObj.xz * vec2(1.9, 1.0));
      float n = vnoise(vObj.xz * 5.0 + vCol.rg * 13.0);
      vec3 c = vCol;
      c = mix(c * 0.5, c, smoothstep(0.26, 0.34, e + n * 0.12));
      c = mix(c, vec3(1.25, 1.15, 0.95) * max(vCol.r, 0.4), smoothstep(0.38, 0.42, e + n * 0.06));
      writeOut(c * 1.25, 1.0, NV, vDepth, uId);
    }
  `;
  return new THREE.ShaderMaterial({ glslVersion: THREE.GLSL3, uniforms: u, vertexShader: vs, fragmentShader: fs, side: THREE.DoubleSide });
}

// The sphere of light of s26: concentric hard bands, jagged redrawn edge.
function orbMaterial() {
  const u = { uCenter: { value: new V() }, uR: { value: 1 }, uPower: { value: 0 }, uDrawing: { value: 0 } };
  const vs = /* glsl */ `
    uniform vec3 uCenter;
    uniform float uR;
    varying vec2 vQ;
    void main(){
      vec4 mv = viewMatrix * vec4(uCenter, 1.0);
      vQ = position.xy * 2.0;
      mv.xy += vQ * uR * 1.25;
      gl_Position = projectionMatrix * mv;
    }
  `;
  const fs = /* glsl */ `
    uniform float uPower, uDrawing;
    varying vec2 vQ;
    out vec4 oColor;
    float h12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
    float vn(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f*f*(3.-2.*f);
      return mix(mix(h12(i), h12(i+vec2(1,0)), u.x), mix(h12(i+vec2(0,1)), h12(i+vec2(1,1)), u.x), u.y); }
    void main(){
      float r = length(vQ) * 1.25;
      float an = atan(vQ.y, vQ.x);
      float n = vn(vec2(an * 5.0, uDrawing * 0.9)) * 0.12 + vn(vec2(an * 19.0, uDrawing * 1.7)) * 0.05;
      float edge = 1.0 + n - 0.08;
      float aa = 0.006;
      float body = smoothstep(edge + aa, edge - aa, r);
      float rim = smoothstep(edge + 0.075 + aa, edge + 0.075 - aa, r) * (1.0 - body);
      float halo = clamp(1.35 - r, 0.0, 1.0); halo = halo * halo * 0.55;
      // concentric drawn rings inside the sphere
      float ring = smoothstep(0.012, 0.0, abs(fract(r * 3.4 - uDrawing * 0.06) - 0.5) - 0.02) * step(r, 0.9);
      vec3 cIn = vec3(1.25, 1.18, 1.05), cMid = vec3(1.05, 0.72, 0.62), cRim = vec3(1.0, 0.27, 0.22) * 1.3;
      vec3 c = mix(cIn, cMid, smoothstep(0.72, 0.76, r + n * 0.5));
      c = mix(c, cMid * 1.1, ring * 0.6);
      vec3 rgb = c * body + cRim * rim + vec3(1.0, 0.35, 0.3) * halo * (1.0 - body - rim);
      float a = max(body, rim * 0.95);
      a = max(a, halo * 0.75);
      rgb *= uPower; a *= uPower;
      if(a < 0.003) discard;
      oColor = vec4(rgb, a);
    }
  `;
  const m = new THREE.ShaderMaterial({ glslVersion: THREE.GLSL3, uniforms: u, vertexShader: vs, fragmentShader: fs, transparent: true, depthTest: false, depthWrite: false });
  m.blending = THREE.CustomBlending; m.blendEquation = THREE.AddEquation; m.blendSrc = THREE.OneFactor; m.blendDst = THREE.OneMinusSrcAlphaFactor;
  m.blendSrcAlpha = THREE.OneFactor; m.blendDstAlpha = THREE.OneMinusSrcAlphaFactor; m.premultipliedAlpha = true;
  return m;
}

export async function createFx(ctx) {
  const { scene, overlay, engine, camera, CUES: C } = ctx;
  const S = engine.S;
  registerCams(FX_CAMS);

  let SLAM_T = 45.72;
  try { const mm = await import('./mech-map.js'); if (Number.isFinite(mm.SLAM_T)) SLAM_T = mm.SLAM_T; } catch { /* mech not ready */ }
  if (Number.isFinite(ctx.mech?.slamT)) SLAM_T = ctx.mech.slamT;

  // ---------------------------------------------------- batches
  const puffs = new PuffBatch(puffMaterial(S), 7000);
  const petals = new ChunkBatch(GEO.petal(), petalMaterial(), 420);
  scene.add(puffs.mesh, petals.mesh);

  const glows = new GlowBatch(glowMaterial(S), 400);
  const beams = new RibbonBatch(beamMaterial(S), 60000);
  const trails = new RibbonBatch(trailMaterial(S), 30000);
  const lines = new LineBatch(boltMaterial(S), 24000);
  const ring = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), planeRingMaterial());
  ring.frustumCulled = false; ring.visible = false;
  const flash = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), screenFlashMaterial());
  flash.frustumCulled = false; flash.visible = false;
  const orb = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), orbMaterial());
  orb.frustumCulled = false; orb.visible = false;
  ring.renderOrder = 1; trails.mesh.renderOrder = 2; orb.renderOrder = 3; glows.mesh.renderOrder = 4; beams.mesh.renderOrder = 5; lines.mesh.renderOrder = 6; flash.renderOrder = 10;
  overlay.add(ring, trails.mesh, orb, glows.mesh, beams.mesh, lines.mesh, flash);
  flash.material.uniforms.uRes.value.set(engine.IW, engine.IH);

  // ---------------------------------------------------- environment shared with the sub-modules
  const lightReq = [];
  const groundY = (x, z, fb = 0) => { try { const g = ctx.land?.groundY?.(x, z); return Number.isFinite(g) ? g : fb; } catch { return fb; } };
  // A department's anchor, or the contract map when it is missing (land answers 0,0,0 for names it does not know).
  function anchorOf(obj, name, fb) {
    try {
      if (obj && typeof obj.anchor === 'function') {
        const v = new V();
        const r = obj.anchor(name, v);
        const got = r && r.isVector3 ? r : v;
        if (got.lengthSq() > 0) return got.clone();
      }
    } catch { /* fall back */ }
    return new V(fb[0], fb[1], fb[2]);
  }
  const aim = new V(...aimDir());
  const skyFlash = new THREE.Color();
  const E = {
    C, CUES: C, ctx, scene, camera, puffs, petals, glows, beams, trails, lines, tq: 0, t: 0, draw: 0, ringQueue: [],
    bay: new V(0, 0, 300), orreryCore: new V(...ORRERY.center),
    inkZ(x, y, z) { const m = camera.matrixWorldInverse.elements; return Math.max(-(m[2] * x + m[6] * y + m[10] * z + m[14]), 0.5); },
    battery(i, out) {
      const fb = [-2480 + 70 * Math.sin(i * 1.7), 40, 250 + (i % 8) * 200];
      const b = anchorOf(ctx.land, `battery${i % 8}`, fb);
      if (b.y === fb[1] && b.x === fb[0]) b.y = groundY(b.x, b.z, fb[1]);
      return out.copy(b);
    },
    light: {
      line(a, b, color, radius) { lightReq.push({ a: [a.x, a.y, a.z], b: [b.x, b.y, b.z], r: radius * 2.4, c: color.map((x) => x * 2.3), s: 2.3 * radius }); },
      point(p, color, radius, power = 1) { lightReq.push({ a: [p.x, p.y, p.z], r: radius * 2.2, c: color.map((x) => x * 2.0 * power), s: 2.0 * power * radius }); },
    },
    sky(r, g, b) { skyFlash.r = Math.max(skyFlash.r, r); skyFlash.g = Math.max(skyFlash.g, g); skyFlash.b = Math.max(skyFlash.b, b); },
  };

  // Fixed places, measured once the other departments exist.
  const MUZZLE0 = () => anchorOf(ctx.mech, 'muzzle', CANNON.muzzle);
  const FAR = anchorOf(ctx.land, 'farMountain', [3300, 1460, -1800]);
  const wallFb = new V(...CANNON.muzzle).addScaledVector(aim, 270);
  const RIDGE_HIT = anchorOf(ctx.land, 'ridgeImpact', [wallFb.x, groundY(wallFb.x, wallFb.z, 640), wallFb.z]);
  E.bay.copy(anchorOf(ctx.land, 'bayPoint', [0, 0, 300]));
  {
    const S0 = FX_CAMS.STAGE, B = E.battery(2, new V()), M = MUZZLE0(), Br = anchorOf(ctx.mech, 'breech', [-3200, 666, 2100]);
    S0.battery = [B.x, B.y, B.z]; S0.orrery = [...ORRERY.center]; S0.muzzle = [M.x, M.y, M.z]; S0.breech = [Br.x, Br.y, Br.z];
    S0.far = [FAR.x, FAR.y, FAR.z]; S0.wall = [RIDGE_HIT.x, RIDGE_HIT.y, RIDGE_HIT.z]; S0.aim = [aim.x, aim.y, aim.z];
  }

  // A beam's reflection on the sea, drawn as ripple-broken strokes: each is a tapered horizontal lens lying on the water where the
  // mirror image is seen, in short runs that shimmer and redraw on threes.
  E.reflect = (pts, o = {}) => {
    const cam = camera.position, step = o.step ?? 2, R = new V(1, 0, 0).applyQuaternion(camera.quaternion).setY(0).normalize();
    const th = Math.tan((camera.fov * Math.PI) / 360), seed = Math.floor((o.seed ?? 1) * 97), D = E.draw;
    const fv = new V(0, 0, -1).applyQuaternion(camera.quaternion).setY(0).normalize();
    const colour = o.color ?? [1, 1, 1];
    for (let i = 0; i < pts.length; i += step) {
      const p = pts[i];
      if (p.y <= 0) continue;
      const k = cam.y / (cam.y + p.y);
      const wx = cam.x + (p.x - cam.x) * k, wz = cam.z + (p.z - cam.z) * k, d = Math.hypot(wx - cam.x, wz - cam.z);
      const mpp = (d * th * 2) / 1080;      // metres per 1080p pixel across the view at this distance
      for (let q = 0; q < 2; q++) {
        if (hash(i, q, seed + D * 3) < 0.25) continue;
        const half = (36 + 240 * Math.pow(hash(i, q, seed + D * 3 + 1), 2)) * mpp * 0.5;
        // ripples spread the mirror image along the view
        const jd = (hash(i, q, seed + D * 3 + 2) - 0.5) * d * 0.22, js = (hash(i, q, seed + D * 3 + 3) - 0.5) * half * 0.8;
        const cx = wx + fv.x * jd + R.x * js, cz = wz + fv.z * jd + R.z * js;
        const st = [];
        for (let s = -3; s <= 3; s++) st.push(new V(cx + R.x * half * (s / 3), 0.7, cz + R.z * half * (s / 3)));
        E.beams.push(st, { m: (o.m ?? 1.2) * (0.6 + 0.7 * hash(i, q, seed + 5)), px: 1.1, width: (s) => Math.pow(Math.sin(Math.PI * s), 0.65), color: colour, hot: [1, 1, 1], power: 0.74, core: 0.24, soft: 2, seed: 0.3 + q, mode: 4 });
      }
    }
  };

  const rockets = createRockets(E);
  const helix = createHelix(E);
  const water = createWater(E);

  // ---------------------------------------------------- generic beam
  function beam(a, b, o) {
    const n = o.n ?? (o.flare ? 90 : 34);
    const pts = linePts(a, b, n);
    const fl = o.flare ?? 0;
    // a flared beam starts from a rounded nose at the muzzle, never a flat cut
    const noseL = o.flare ? Math.min(0.03, 60 / Math.max(a.distanceTo(b), 1)) : 0;
    E.beams.push(pts, {
      m: o.m, px: o.px ?? 1.5, color: o.color, hot: [1, 1, 1], power: o.power ?? 1.3, core: o.core ?? 0.5, soft: o.soft ?? 22, seed: o.seed ?? 0.4, mode: o.mode ?? 0, bias: o.bias ?? 12,
      width: (s) => (1 + fl * Math.exp(-s * 26)) * (o.taper ? o.taper(s) : 1) * (noseL > 0 && s < noseL ? Math.sqrt(s / noseL) : 1),
    });
    if (o.reflect) {
      E.reflect(pts, { color: o.color, m: Math.min(o.m * 0.3, 2.2), seed: (o.seed ?? 0.4) + 3, step: 1 });
    }
  }
  const spear = (s) => (s > 0.93 ? (1 - s) / 0.07 : 1);   // pointed head

  // ---------------------------------------------------- hook: the gold clot along the wires, and the surge from the yard
  function fallbackCables(from, to, sag, count = 3, spacing = 7) {
    const out = [];
    const up = new V(0, 1, 0), dir = new V().subVectors(to, from).normalize(), side = new V().crossVectors(dir, up).normalize();
    for (let c = 0; c < count; c++) {
      const off = side.clone().multiplyScalar((c - (count - 1) / 2) * spacing);
      const spans = 7, perSpan = 12, line = [];
      for (let s = 0; s < spans; s++) for (let q = 0; q < perSpan; q++) {
        const u = (s + q / perSpan) / spans, w = q / perSpan;
        const p = new V().lerpVectors(from, to, u).add(off);
        p.y -= sag * 4 * w * (1 - w);
        line.push(p);
      }
      line.push(to.clone().add(off));
      out.push(line);
    }
    return out;
  }
  const asLines = (c) => (!c || !c.length ? null : c[0].isVector3 ? [c] : c);
  const cable = (name, from, to, sag) => asLines(ctx.land?.cables?.[name]) ?? fallbackCables(from, to, sag);

  function pulseAlong(lines0, s, len, color, m, power, seed) {
    for (let l = 0; l < lines0.length; l++) {
      const line = lines0[l];
      const n = line.length;
      const headF = s * (n - 1);
      const tailF = Math.max(0, headF - len * (n - 1));
      const i0 = Math.floor(tailF), i1 = Math.min(n - 1, Math.ceil(headF));
      if (i1 <= i0) continue;
      const pts = line.slice(i0, i1 + 1);
      E.beams.push(pts, { m, px: 2.0, width: (u) => 0.18 + 0.82 * u * u, color, hot: [1, 1, 1], power, core: 0.5, soft: 22, seed: seed + l, mode: 0, bias: 8 });
      E.glows.push(line[Math.min(n - 1, Math.round(headF))], { kind: GLOW.kira, m: m * 18, color, power: 0.9 * power, mode: 0, bias: 10, rot: 0.3 });
    }
  }

  // Sized in screen pixels so it reads on a phone at any distance: a fat gold clot with a long tail, riding the wire,
  // a ring of sparks snapping around it and the wire burning behind.
  function goldClot(line, s, t, k = 1, tailN = 24, over = false) {
    const dep = (b) => (over ? { mode: 2 } : { mode: 0, bias: b });
    const n = line.length, headF = s * (n - 1), hi = Math.min(n - 1, Math.round(headF));
    const tailI = Math.max(0, hi - tailN), tail = line.slice(tailI, hi + 1), P = line[hi];
    const tan = new V().subVectors(line[Math.min(n - 1, hi + 1)], line[Math.max(0, hi - 1)]).normalize();
    if (tail.length > 1) {
      E.beams.push(tail, { m: 0.8 * k, px: 20 * k, width: (u) => 0.08 + 0.92 * u * u * u, color: GOLD, hot: [1, 0.97, 0.78], power: 1.35, core: 0.46, soft: 34, seed: 0.61, ...dep(18) });
    }
    E.glows.push(P, { kind: GLOW.soft, px: 210 * k, color: GOLD, power: 0.85, ...dep(30) });
    E.glows.push(P, { kind: GLOW.disc, px: 40 * k, color: GOLD, power: 1.5, ...dep(30) });
    E.glows.push(P, { kind: GLOW.kira, px: 140 * k, color: GOLD, power: 0.9, ...dep(30), rot: 0.3 });
    const D = Math.floor(t * 8);
    const d = camera.position.distanceTo(P), mpp = (d * Math.tan((camera.fov * Math.PI) / 360) * 2) / 1080;
    const u1 = new V().crossVectors(tan, new V(0, 1, 0)).normalize(), u2 = new V().crossVectors(tan, u1).normalize();
    // a ring snapped around the wire, thrown back along it and redrawn on threes, plus a few sparks off it
    for (let j = 0; j < 2; j++) {
      const R = mpp * (62 + 50 * j + 16 * hash(D, j, 3)) * k, back = -mpp * 26 * j * k;
      const pts = [];
      for (let q = 0; q <= 32; q++) { const th = (q / 32) * Math.PI * 2; pts.push(P.clone().addScaledVector(tan, back).addScaledVector(u1, Math.cos(th) * R).addScaledVector(u2, Math.sin(th) * R)); }
      E.beams.push(pts, { m: 0, px: (3.4 - j * 1.1) * Math.max(0.5, k), color: GOLD, hot: [1, 0.96, 0.75], power: 1.4 - j * 0.35, core: 0.5, soft: 8, seed: 0.3 + D * 0.1 + j, ...dep(24) });
    }
    for (let i = 0; i < 14; i++) {
      const th = hash(i, D, 5) * 6.283, L = mpp * hr(i, D, 6, 60, 190) * k, r0 = mpp * 40 * k;
      const dirS = u1.clone().multiplyScalar(Math.cos(th)).addScaledVector(u2, Math.sin(th)).addScaledVector(tan, -0.6).normalize();
      const a = P.clone().addScaledVector(dirS, r0), b = P.clone().addScaledVector(dirS, r0 + L);
      E.beams.push([a, a.clone().lerp(b, 0.5), b], { m: 0, px: 2.8, width: (u) => 1 - u, color: GOLD, hot: [1, 0.96, 0.75], power: 1.4, core: 0.5, soft: 3, seed: i * 0.2, ...dep(24) });
    }
    E.light.point(P, GOLD, 110, 1.3);
  }

  // After the cut to the low camera behind the gun (frames 36-47): the clot leaves the last tower, runs the last span to the
  // barrel's base, accelerating and shrinking, and goes in at frame 46 with a short flash and a small glow left behind.
  // Timed on ones (E.t), so all twelve frames move.
  function hookArrival(line) {
    const t = E.t, ARRIVE = 46 / 24;
    const tower = line[line.length - 1], base = anchorOf(ctx.mech, 'breech', [-3200, 666, 2100]);
    const raw = [];
    for (let q = 0; q <= 48; q++) {
      const f = q / 48, p = new V().lerpVectors(tower, base, f);
      p.y -= 16 * 4 * f * (1 - f);       // the sag of the last span
      raw.push(p);
    }
    // The span runs nearly at the lens, so equal metres are very unequal pixels: resample it evenly on screen,
    // or the clot sits still for eight frames and jumps at the end.
    const scr = raw.map((p) => p.clone().project(camera)), arc = [0];
    for (let q = 1; q < scr.length; q++) arc.push(arc[q - 1] + Math.hypot((scr[q].x - scr[q - 1].x) * (16 / 9), scr[q].y - scr[q - 1].y));
    const path = [];
    for (let q = 0, a = 0; q <= 48; q++) {
      const want = (q / 48) * arc[48];
      while (a < 47 && arc[a + 1] < want) a++;
      path.push(new V().lerpVectors(raw[a], raw[a + 1], clamp((want - arc[a]) / Math.max(1e-6, arc[a + 1] - arc[a]))));
    }
    const u = clamp((t - 1.5) / (ARRIVE - 1.5));
    const s = Math.pow(u, 1.8);
    const glow = 1 - smooth(invLerp(1.82, 1.98, t));
    // the run behind the tower still burns, and the span burns behind the clot
    E.beams.push(line, { m: 0.9, px: 2.6, color: GOLD, hot: [1, 0.92, 0.62], power: 1.15 * glow, core: 0.4, soft: 12, seed: 1.3, mode: 0, bias: 8 });
    if (t < ARRIVE) {
      const hi = Math.max(2, Math.round(s * 48));
      E.beams.push(path.slice(0, hi + 1), { m: 0.9, px: 2.6, color: GOLD, hot: [1, 0.92, 0.62], power: 1.15, core: 0.4, soft: 12, seed: 2.3, mode: 2 });
      goldClot(path, Math.max(0.03, s), t, 1 - 0.72 * smooth(invLerp(0.05, 1, s)), 14, true);   // over the gun's bulk, which stands between the tower and the base
      return;
    }
    // in: one flash, then the small glow at the base until the cut
    const a = t - ARRIVE, flash = 1 - smooth(a / 0.08);
    E.glows.push(base, { kind: GLOW.soft, px: 300 * (0.5 + 0.5 * flash), color: GOLD, power: 0.95 * flash, mode: 0, bias: 30 });
    E.glows.push(base, { kind: GLOW.disc, px: 62 * flash, color: GOLD, power: 1.5, mode: 0, bias: 30 });
    E.glows.push(base, { kind: GLOW.soft, px: 72, color: GOLD, power: 0.8, mode: 0, bias: 30 });
    E.glows.push(base, { kind: GLOW.disc, px: 8, color: GOLD, power: 1.3, mode: 0, bias: 30 });
    E.light.point(base, GOLD, 90, 0.7 + 0.8 * flash);
  }

  function hookWire() {
    const t = E.tq;
    if (t < 0.92 || E.t >= 2.0) return;
    const from = new V(-1400, 340, 1600), to = new V(-3120, 660, 2080);
    if (E.t >= 1.5) { hookArrival(cable('hook', from, to, 34)[0]); return; }
    // the land's run starts behind this camera: the clot leaves from the point nearest the lens and races away down the line
    const L = cable('hook', from, to, 34).map((line) => {
      let near = 0, best = Infinity;
      line.forEach((p, i) => { const d = p.distanceToSquared(camera.position); if (d < best) { best = d; near = i; } });
      return near < line.length - 8 ? line.slice(near + 1) : line;
    });
    const s = easeIn(clamp((t - 1.0) / 0.86), 1.25);
    if (t < 1.9 && t >= 1.0) goldClot(L[0], Math.max(0.03, s), t);
    // what the clot leaves behind: the wires still glowing gold, cooling to nothing before the cut
    const glow = 1 - smooth(invLerp(1.82, 1.98, t));
    if (t >= 1.0) for (let l = 0; l < L.length; l++) {
      const line = L[l], end = Math.max(2, Math.round(s * (line.length - 1)));
      E.beams.push(line.slice(0, end + 1), { m: 0.9, px: 2.6, color: GOLD, hot: [1, 0.92, 0.62], power: 1.15 * glow, core: 0.4, soft: 12, seed: 1.3 + l, mode: 0, bias: 8 });
    }
  }

  function surge() {
    const t = E.tq, t0 = C.surge;
    if (t < t0 - 0.05 || t > t0 + 1.55) return;
    const yard = anchorOf(ctx.land, 'yard', [-2690, groundY(-2690, 1975, 200) + 14, 1975]);
    const D = Math.floor(t * 8);
    // arcs jumping between the transformer tops, stuttering on threes
    const R = new V(1, 0, 0).applyQuaternion(camera.quaternion), U = new V(0, 1, 0).applyQuaternion(camera.quaternion);
    const P = [];
    for (let i = 0; i < 6; i++) P.push(anchorOf(ctx.land, `yardCoil${i}`, [yard.x + (i - 2.5) * 22, yard.y + 16, yard.z + (i % 2 ? 14 : -14)]));
    const on = 1 - smooth(invLerp(1.0, 1.5, t - t0));
    for (let i = 0; i < 9; i++) {
      if (hash(i, D, 3) < 0.25 + 0.3 * (1 - on)) continue;
      const a = P[i % 6], b = P[(i + 1 + (hash(i, D, 4) * 3 | 0)) % 6];
      if (a === b) continue;
      const pts = boltPts(a, b, 41 + i * 13 + D * 5, R, U, 0.16, 4);
      const hot = i % 3 === 0;
      lines.push(pts, { px: hot ? 2.6 : 1.5, m: hot ? 0.9 : 0.4, width: (s) => 0.5 + 0.5 * Math.abs(Math.sin(s * 6)), color: hot ? [0.75, 0.85, 1.0] : GOLD, power: 1.7 * on, soft: 10, mode: 0, bias: 4, rim: 0.3 });
    }
    glows.push(yard.clone().setY(yard.y + 10), { kind: GLOW.soft, m: 70, color: GOLD, power: 0.8 * on, mode: 0, bias: 20 });
    E.light.point(yard.clone().setY(yard.y + 12), [0.95, 0.76, 0.5], 120, 0.8 * (0.6 + 0.4 * hash(D, 1, 9)) * on);
    // white pulse leaves through the cables toward the ridge
    const from = yard.clone().setY(yard.y + 18), to = new V(-3120, 660, 2080);
    const L = cable('surge', from, to, 18);
    const s = easeIn(clamp((t - t0 - 0.35) / 0.8), 1.5);
    if (t - t0 > 0.35) pulseAlong(L, Math.min(0.995, Math.max(0.02, s)), 0.16, [0.82, 0.9, 1.0], 2.4, 1.4 * (1 - smooth(invLerp(1.15, 1.45, t - t0))), 0.2);
  }

  // ---------------------------------------------------- muzzle blast + flattened ring of dust
  const ringU = ring.material.uniforms;
  const setRing = (x, z, R, pw, y, col, shade) => {
    ringU.uR.value.set(x, z, R, pw);
    ringU.uY.value = y;
    ringU.uColor.value.setRGB(col[0], col[1], col[2]);
    ringU.uShade.value.setRGB(shade[0], shade[1], shade[2]);
    ringU.uDrawing.value = E.draw;
    ringU.uCamPos.value.copy(camera.position);
    ringU.uCam.value.copy(camera.matrixWorld);
    const th = Math.tan((camera.fov * Math.PI) / 360);
    ringU.uTan.value.set(th * camera.aspect, th);
    ring.visible = true;
  };
  const guard = () => {
    const h = ctx.mech?.heron?.getWorldPosition?.(new V()) ?? new V(...HERON.pos);
    const tt = ctx.mech?.tortoise?.getWorldPosition?.(new V()) ?? new V(...TORTOISE.pos);
    return [{ p: h, r: 40 }, { p: tt, r: 42 }];
  };
  function muzzleBlast(t0, size) {
    const a = E.tq - t0;
    if (a < -0.02 || a > 3.4) return;
    const M = MUZZLE0();
    const k = 1 - smooth(invLerp(0.05, 0.7, a));
    if (a < 0.9) {
      const P = M.clone().addScaledVector(aim, 30);
      E.glows.push(P, { kind: GLOW.burst, m: 170 * size * (0.7 + 0.5 * clamp(a * 5)), color: [0.55, 0.82, 1.0], power: 1.5 * k, mode: 0, bias: 60, seed: 0.3 + (Math.floor(a * 8) % 4) * 0.11 });
      E.glows.push(P, { kind: GLOW.soft, m: 380 * size, color: ICE, power: 0.75 * k, mode: 0, bias: 60 });
      // long drawn rays fanning forward off the muzzle, redrawn each drawing
      const R = new V(1, 0, 0).applyQuaternion(camera.quaternion), U = new V(0, 1, 0).applyQuaternion(camera.quaternion);
      const D = Math.floor(a * 8);
      for (let i = 0; i < 16; i++) {
        const th = hash(i, D, 11) * 6.283;
        const len = hr(i, D, 12, 90, 320) * size * k;
        const dir = new V().copy(R).multiplyScalar(Math.cos(th)).addScaledVector(U, Math.sin(th)).addScaledVector(aim, hr(i, D, 13, 0.25, 0.9)).normalize();
        const q = linePts(P, P.clone().addScaledVector(dir, len), 6);
        E.beams.push(q, { m: 6 * size * k, px: 1.2, width: (s) => (1 - s) * (1 - s), color: ICE, hot: [1, 1, 1], power: 1.5, core: 0.62, soft: 8, seed: i + D * 0.31, mode: 0, bias: 40 });
      }
      E.light.point(P, [0.78, 0.92, 1.0], 620 * size, 1.5 * k);
      E.sky(0.32 * k * size, 0.31 * k * size, 0.62 * k * size);
    }
    // ring of flattened dust: a hard drawn lip running out over the ground, big torn lobes riding it
    const yG = groundY(M.x, M.z, 640) + 6;
    const front = (u) => 30 + 700 * size * (1 - Math.exp(-u / 0.55));
    if (a >= 0 && a < 2.6) setRing(M.x, M.z, front(a), 1 - smooth(invLerp(1.3, 2.6, a)), yG, [0.95, 0.98, 1.0], [0.6, 0.72, 0.92]);
    const G0 = guard();
    const n = 96;
    for (let i = 0; i < n; i++) {
      const az = (i / n) * Math.PI * 2 + hash(i, 44, 1) * 0.06;
      const row = i % 3 === 0 ? 1 : 0;
      const ua = a - (row ? 0.14 : 0) - hash(i, 44, 2) * 0.05;
      if (ua <= 0 || ua > 2.8) continue;
      const Ri = front(ua) * (row ? 0.88 : 1);
      const dx = Math.cos(az), dz = Math.sin(az);
      const x = M.x + dx * Ri, z = M.z + dz * Ri;
      const g = groundY(x, z, 640);
      if (g < yG - 90) continue;           // never hang dust in the air past the shelf edge
      let near = false;
      for (const q of G0) if (Math.hypot(x - q.p.x, z - q.p.z) < q.r) near = true;
      if (near || Math.hypot(x - camera.position.x, z - camera.position.z) < 130) continue;
      const r = (10 + 14 * hash(i, 44, 3)) * size * (0.6 + 0.8 * clamp(ua));
      const fade = clamp(invLerp(1.1, 2.7, ua + hash(i, 44, 4) * 0.5));
      E.puffs.inkZ = E.inkZ(x, g, z) + (i % 3) * 16;
      if (row === 0 && i % 2 === 0) E.puffs.push(x - dx * r, g + r * 0.5, z - dz * r, r * 0.9, r * 2.6, 0.32, 0.3, dx, 0.16, dz, i % 97, 0.1, fade, KIND.TONGUE, PAL.ICEDUST, ID.DUST[i % 3]);
      else E.puffs.push(x, g + r * (row ? 1.2 : 0.7), z, r * (row ? 1.15 : 1), 0, 1, 0.34, 0, 1, 0, i % 97, 0.05, fade, KIND.PUFF, row ? PAL.ICEDUST : PAL.CORALDUST, ID.DUST[i % 3]);
    }
    E.puffs.inkZ = 0;
  }

  // ---------------------------------------------------- beams through the film
  const coreNow = () => anchorOf(ctx.orrery, 'coral', ORRERY.center);
  const orreryCentre = () => anchorOf(ctx.orrery, 'core', ORRERY.center);
  const shieldAt = () => anchorOf(ctx.mech, 'shieldCenter', [TORTOISE.stance[0], TORTOISE.stance[1] + 24, TORTOISE.stance[2]]);

  // s10: thin coral beam sweeps the hills, battery after battery goes up
  const hitT = (j) => C.answer + 0.22 + j * 0.27;
  function answerSweep() {
    const t = E.tq;
    if (t < C.answer - 0.05 || t > C.answer + 3.0) return;
    const O = coreNow();
    for (let j = 0; j < 8; j++) fireDome(E, E.battery(j, new V()), hitT(j), hr(j, 1, 1, 58, 96), 30 + j, 2.1, { n: 30, collar: 10 });
    if (t < C.answer || t > C.answer + 2.5) return;
    const u = clamp((t - C.answer - 0.1) / (hitT(7) - C.answer));
    const fj = u * 7;
    const j0 = Math.min(6, Math.floor(fj)), f = smooth(fj - j0);
    const P = new V().lerpVectors(E.battery(j0, new V()), E.battery(j0 + 1, new V()), f); P.y += 4;
    const pw = t > C.answer + 2.25 ? 1 - smooth(invLerp(C.answer + 2.25, C.answer + 2.48, t)) : smooth((t - C.answer) / 0.06);
    if (pw > 0.01) {
      beam(O, P, { m: 7, px: 2.5, color: CORAL, power: 1.3 * pw, core: 0.55, soft: 18, seed: 0.51, flare: 1.4, reflect: true });
      E.glows.push(P, { kind: GLOW.burst, m: 90, color: [1.0, 0.5, 0.3], power: 1.0 * pw, mode: 0, bias: 40, seed: 0.2 + (Math.floor(t * 8) % 3) * 0.2 });
      E.light.line(O, P, CORAL, 300);
      E.sky(0.22 * pw, 0.05 * pw, 0.05 * pw);
    }
  }

  // Shot 1, both beams: hero leaves the muzzle in s14, both end in s16; s15 is drawn by helix.
  function firstExchange(st) {
    const t = E.tq;
    const M = MUZZLE0();
    if (st.sid === 's14' && t >= C.muzzle) {
      const a = t - C.muzzle;
      const reach = 180 + 2200 * easeIn(clamp(a / 1.3), 1.25);
      const end = M.clone().addScaledVector(aim, reach);
      beam(M, end, { m: 15, px: 2, color: ICE, power: 1.4, core: 0.55, soft: 30, seed: 0.33, flare: 0.9, taper: spear });
      E.light.line(M, end, ICE, 420);
    }
    // the misses
    if (t >= C.impact - 0.05) {
      eruption(E, FAR.clone().setY(FAR.y * 0.92), C.impact, 620, 7);
      const toO = new V(...ORRERY.center).sub(RIDGE_HIT).setY(0).normalize();
      fireWall(E, RIDGE_HIT, toO, C.impact, 620, 300, 11);
    }
    const w = t - C.impact;
    if (w >= 0 && w < 1.5) {
      const k = 1 - smooth(invLerp(0.1, 1.5, w));
      E.sky(0.13 * k, 0.08 * k, 0.0);
    }
  }

  // ---------------------------------------------------- second exchange: coral on the shield, petals, last stand, the final shot
  function secondCoral() {
    const t = E.tq, t0 = C.strike, end = C.pierce + 0.45;
    if (t < t0 || t > end) return;
    const O = coreNow();
    const SC = shieldAt();
    const pw = t > C.pierce - 0.15 ? 1 - smooth(invLerp(C.pierce - 0.15, end, t)) : 1;
    const aHit = t - SLAM_T;
    const reach = t < SLAM_T ? easeIn(clamp((t - t0) / (SLAM_T - t0)), 1.15) : 1;
    const head = new V().lerpVectors(O, SC, reach);
    const close = E.sid === 's21';
    if (pw > 0.005) {
      const m = (t < SLAM_T ? 17 : 22) * pw;
      if (close) {
        // the melt close-up: a thin spear that stops on the keel, and leaves the plate to be read
        const R = meltR(E.tq);
        const n0 = new V().subVectors(O, SC).normalize();
        beam(O, SC.clone().addScaledVector(n0, Math.max(0, 6 - R * 0.5)), { m: 2.6 * pw, px: 1.5 * pw, color: CORAL, power: 1.3, core: 0.44, soft: 7, seed: 0.51, flare: 0.2, bias: 5 });
        E.light.line(O, head, CORAL, 300 * pw);
        E.sky(0.15 * pw, 0.04 * pw, 0.02 * pw);
      } else {
        beam(O, head, { m, px: 3 * pw, color: CORAL, power: 1.45, core: 0.55, soft: 34, seed: 0.51, flare: 0.8, taper: t < SLAM_T ? spear : null, bias: 22 });
        E.light.line(O, head, CORAL, 560 * pw);
        E.sky(0.24 * pw, 0.06 * pw, 0.03 * pw);
      }
    }
    if (aHit >= 0) { if (close) meltCloseUp(O, SC, aHit, pw); else shieldSplash(O, SC, aHit, pw); }
    else {
      glows.push(head, { kind: GLOW.soft, m: 130, color: CORAL, power: 0.7, mode: 0, bias: 40 });
      E.light.point(head, [1.0, 0.45, 0.32], 900 * reach + 200, 1.4 * reach);   // the ridge lights up as it comes
    }
  }

  // ---- s21, the melt seen close: the plate has to stay readable, so the power sits at its rim and the metal does the acting.
  const meltR = holeRadiusFn(C.melt, C.shieldGone);
  const sHalf = (y) => { const u = clamp((y + 18) / 38); return 7.5 + 9.5 * Math.pow(u, 0.62); };
  const sKeel = (y) => 12 + 2 * Math.sin(((y + 18) / 38) * 2.6);
  const onPlate = (x, y) => y > -17.6 && y < 19.6 && Math.abs(x) < sHalf(y) * 0.985;
  const lobes = (a) => 1 + 0.28 * Math.sin(5 * a + 1.3) + 0.16 * Math.sin(9 * a + 4.1) + 0.08 * Math.sin(17 * a + 0.7);
  // a point on the bow's deformed skin, from its rest (x, y): the same formula Mech's deformSkin uses
  function skinPoint(x, y, R, lift = 0) {
    const sv = clamp(x / sHalf(y), -1, 1);
    let z = sKeel(y) * (1 - Math.pow(Math.abs(sv), 1.55));
    const rr = Math.hypot(x, y) + 1e-3;
    z -= 3 * Math.exp(-rr * rr / 180);
    let X = x, Y = y;
    if (R > 0) {
      const e = -holeDist(x, y, R);
      if (e < 11) {
        const c = Math.exp(-Math.max(0, e) / 4.5);
        X += (x / rr) * c * 1.9; Y += (y / rr) * c * 1.9 - c * c * 3.5; z -= c * 4 + c * c * c * 2;
      }
    }
    return ctx.mech.shield.localToWorld(new V(X, Y, z + lift));
  }

  function meltCloseUp(O, SC, a, pw) {
    const rise = 1 - Math.exp(-a / 0.15), R = Math.max(0.6, meltR(E.tq)), D = E.draw;
    const n = new V().subVectors(O, SC).normalize();
    const ux = new V().crossVectors(n, new V(0, 1, 0)).normalize();
    const uy = new V().crossVectors(ux, n).normalize();
    const toCam = new V().subVectors(camera.position, SC).normalize();
    const melt = smooth(invLerp(C.melt, C.shieldGone, E.tq));
    // 1. the burst, thin, running round the rim of the plate and bending back past it; none comes at the lens
    for (let i = 0; i < 16; i++) {
      const th = (i / 16) * Math.PI * 2 + 0.5 * (hash(i, 3, 2) - 0.5) + 0.2 * Math.sin(E.tq * 2.0 + i);
      const dx = Math.cos(th), dy = Math.sin(th);
      const R0 = 1 / Math.hypot(dx / 16.5, dy / 19);
      const dirW = ux.clone().multiplyScalar(dx).addScaledVector(uy, dy);
      const fac = dirW.dot(toCam) > 0.12 ? 0.3 : 1;
      const spread = 1 + 0.4 * Math.sin(D * 0.7 + i * 2.1);
      const R1 = R0 + (22 + 44 * hash(i, 3, 3)) * spread * rise * fac;
      const back = (46 + 96 * hash(i, 3, 4)) * rise * fac;
      const pts = [];
      for (let q = 0; q <= 24; q++) { const u = q / 24; pts.push(SC.clone().addScaledVector(dirW, R0 + (R1 - R0) * Math.pow(u, 0.7)).addScaledVector(n, 4 - back * u * u)); }
      E.beams.push(pts, { m: (0.4 + 0.7 * hash(i, 3, 5)) * pw, px: 1 * pw, width: (s) => Math.pow(1 - s, 1.1) * Math.min(1, s * 8 + 0.4), color: CORAL, hot: [1, 0.86, 0.72], power: 1.4, core: 0.5, soft: 5, seed: i + 0.3, mode: 0, bias: 3 });
    }
    // 2. the contact, small
    const G0 = SC.clone().addScaledVector(n, Math.max(0, 6 - R * 0.5));
    glows.push(G0, { kind: GLOW.burst, m: (4.5 + 3 * melt) * rise, color: [1.0, 0.6, 0.45], power: 1.15 * pw, mode: 0, bias: 5, seed: 0.15 + (D % 4) * 0.13 });
    glows.push(G0, { kind: GLOW.soft, m: 24, color: CORAL, power: 0.24 * pw, mode: 0, bias: 6 });
    E.light.point(G0, [1.0, 0.72, 0.6], 340, 0.95 * pw);
    // 3. the hole's lip burning: two strokes on the real edge of the metal
    const runs = [[]];
    for (let q = 0; q <= 132; q++) {
      const A = (q / 132) * Math.PI * 2, r = R * lobes(A), x = Math.cos(A) * r, y = Math.sin(A) * r;
      if (onPlate(x, y)) runs[runs.length - 1].push(skinPoint(x, y, R, 0.5));
      else if (runs[runs.length - 1].length) runs.push([]);
    }
    for (const pts of runs) {
      if (pts.length < 3) continue;
      E.beams.push(pts, { m: 0.85, px: 2, color: [0.95, 0.2, 0.06], hot: [1, 0.42, 0.12], power: 0.8, core: 0.3, soft: 9, seed: 1.7, mode: 0, bias: 3 });
      E.beams.push(pts, { m: 0.2, px: 2, color: [1, 0.6, 0.18], hot: [1, 0.95, 0.8], power: 1.45, core: 0.6, soft: 3, seed: 2.7, mode: 0, bias: 4 });
    }
    // 4. the metal sags: tongues crawl down the skin from the lip, necking, and let go of a drop
    for (let j = 0; j < 13; j++) {
      const A = -Math.PI + (j + 0.5) / 13 * Math.PI * 1.3 - 0.15 * Math.PI + 0.1 * (hash(j, 8, 1) - 0.5);
      const r0 = R * lobes(A), x0 = Math.cos(A) * r0, y0 = Math.sin(A) * r0;
      if (!onPlate(x0, y0)) continue;
      const T = hr(j, 8, 2, 0.9, 1.7), ph = (E.tq / T + hash(j, 8, 3)) % 1;
      const maxL = hr(j, 8, 4, 5, 13) * (0.5 + 0.5 * clamp(R / 10));
      const grow = smooth(clamp(ph / 0.62)), L = maxL * grow, wide = hr(j, 8, 5, 0.2, 0.42);
      const pts = [];
      for (let q = 0; q <= 16; q++) {
        const u = q / 16, y = Math.max(-17.6, y0 - L * u), x = x0 * (1 - 0.05 * u) + 0.14 * Math.sin(u * 5 + j);
        if (onPlate(x, y)) pts.push(skinPoint(x, y, R, 0.5));
      }
      if (pts.length > 3) {
        E.beams.push(pts, { m: wide, px: 2, width: (s) => (s < 0.72 ? 1 - 0.68 * s / 0.72 : 0.32 + 1.3 * Math.sin((s - 0.72) / 0.28 * Math.PI) * 0.7), color: [1, 0.36, 0.08], hot: [1, 0.86, 0.46], power: 1.3, core: 0.55, soft: 3, seed: j * 0.3, mode: 0, bias: 4 });
      }
      if (ph > 0.62 && pts.length) {
        const fall = (ph - 0.62) * T, P0 = pts[pts.length - 1];
        const g = 46, vy = g * fall, dy = 0.5 * g * fall * fall;
        const P = P0.clone(); P.y -= dy;
        if (P.y > groundY(P.x, P.z, 640) + 0.4) {
          const len = 1.2 + vy * 0.075, up = P.clone(); up.y += len;
          E.beams.push([up, up.clone().lerp(P, 0.5), P], { m: wide * 0.8, px: 1.5, width: (s) => (s < 0.65 ? 0.12 + 0.6 * s : 0.5 + 0.5 * Math.sin((s - 0.65) / 0.35 * Math.PI)), color: [1, 0.42, 0.1], hot: [1, 0.9, 0.55], power: 1.3, core: 0.5, soft: 6, seed: j * 0.7, mode: 0, bias: 2 });
        }
      }
    }
  }

  function shieldSplash(O, SC, a, pw) {
    const rise = 1 - Math.exp(-a / 0.15);
    const melt = smooth(invLerp(C.melt, C.shieldGone, E.tq));
    const naked = smooth(invLerp(C.shieldGone - 0.2, C.shieldGone + 0.3, E.tq));
    const n = new V().subVectors(O, SC).normalize();     // shield normal, toward the source
    const ux = new V().crossVectors(n, new V(0, 1, 0)).normalize();
    const uy = new V().crossVectors(ux, n).normalize();
    const D = Math.floor(E.t * 8);
    // the beam bursts around the shield in a few fat ribbons bending backward past it
    const nR = 11;
    for (let i = 0; i < nR; i++) {
      const th = (i / nR) * Math.PI * 2 + 0.6 * (hash(i, 3, 2) - 0.5) + 0.2 * Math.sin(E.tq * 2.0 + i);
      const spread = 1 + 0.45 * Math.sin(D * 0.7 + i * 2.1);
      const R0 = (11 + 8 * melt) * (1 - 0.55 * naked);
      const R1 = (90 + 130 * hash(i, 3, 3)) * spread * rise * (1 + 0.2 * melt);
      const back = (260 + 260 * hash(i, 3, 4)) * rise * (1 + 0.3 * melt);
      const dx = Math.cos(th), dy = Math.sin(th);
      const P = (u) => SC.clone().addScaledVector(ux, dx * (R0 + (R1 - R0) * Math.pow(u, 0.7))).addScaledVector(uy, dy * (R0 + (R1 - R0) * Math.pow(u, 0.7))).addScaledVector(n, 6 - back * u * u);
      const pts = []; for (let q = 0; q <= 44; q++) pts.push(P(q / 44));
      const w = (5 + 6 * hash(i, 3, 5)) * pw;
      E.beams.push(pts, { m: w, px: 1.5 * pw, width: (s) => Math.pow(1 - s, 1.1) * Math.min(1, s * 8 + 0.35), color: CORAL, hot: [1, 1, 1], power: 1.45, core: 0.56, soft: 20, seed: i + 0.3, mode: 0, bias: 14 });
    }
    // white-hot knot on the shield face, swelling as it melts
    const G0 = SC.clone().addScaledVector(n, 4);
    glows.push(G0, { kind: GLOW.burst, m: (34 + 26 * melt) * rise, color: [1.0, 0.6, 0.45], power: 1.45 * pw, mode: 0, bias: 14, seed: 0.15 + (D % 4) * 0.13 });
    glows.push(G0, { kind: GLOW.soft, m: 130, color: CORAL, power: 0.55 * pw, mode: 0, bias: 16 });
    E.light.point(G0, [1.0, 0.8, 0.72], 620, 1.7 * pw);
    // drawn shock rings running out over the face
    for (let j = 0; j < 3; j++) {
      const ar = (a * 1.3 + j * 0.45) % 1.3;
      const R = 14 + 90 * easeOut(ar / 1.3, 2);
      const q = [];
      for (let s = 0; s <= 36; s++) { const th = (s / 36) * Math.PI * 2; q.push(SC.clone().addScaledVector(ux, Math.cos(th) * R).addScaledVector(uy, Math.sin(th) * R).addScaledVector(n, 6)); }
      E.beams.push(q, { m: 2.4, px: 1.2, color: CORAL, hot: [1, 1, 1], power: 1.1 * (1 - ar / 1.3) * pw, core: 0.5, soft: 6, seed: j, mode: 0, bias: 14 });
    }
  }

  // glowing melt petals peeling from the centre outward, a few big shapes, falling and cooling to nothing
  function meltPetals() {
    const t = E.tq;
    if (t < C.melt || t > C.shieldGone + 3.4) return;
    const SC = shieldAt();
    const O = coreNow();
    const n = new V().subVectors(O, SC).normalize();
    const ux = new V().crossVectors(n, new V(0, 1, 0)).normalize();
    const uy = new V().crossVectors(ux, n).normalize();
    const COUNT = 72;
    for (let i = 0; i < COUNT; i++) {
      const b = C.melt + (i / COUNT) * (C.shieldGone - C.melt) + hash(i, 9, 1) * 0.3;
      const a = t - b;
      const life = hr(i, 9, 2, 2.0, 3.2);
      if (a < 0 || a > life) continue;
      const u = a / life;
      // each piece tears off the hole's edge as it stood when it let go
      const th = hash(i, 9, 3) * Math.PI * 2;
      const dx = Math.cos(th), dy = Math.sin(th);
      const radial = Math.min(25, 3 + Math.max(0.6, meltR(b)) * lobes(th));
      const speed = hr(i, 9, 4, 18, 40);
      const p0 = SC.clone().addScaledVector(ux, dx * radial).addScaledVector(uy, dy * radial).addScaledVector(n, 3);
      // peel off toward the source side of the plate and fall
      const v = new V().addScaledVector(ux, dx * speed * 0.75).addScaledVector(uy, dy * speed * 0.75 + 16).addScaledVector(n, speed * 0.3);
      const y0 = groundY(p0.x, p0.z, 640) + 1;
      const px = p0.x + v.x * a, pz = p0.z + v.z * a;
      const py = Math.max(y0, p0.y + v.y * a - 0.5 * 12 * a * a);
      const P = new V(px, py, pz), dc = camera.position.distanceTo(P);
      if (dc < 34) continue;   // never a giant plate across the lens
      const sp = a * hr(i, 9, 5, 1.5, 3.6);
      const big = hash(i, 9, 8) > 0.8;
      const len = (big ? hr(i, 9, 6, 8, 13) : hr(i, 9, 6, 2.5, 7)) * (1 - Math.pow(u, 4)) * Math.min(1, dc / 85);
      const wid = hr(i, 9, 7, 0.46, 0.8);
      const heat = u < 0.15 ? 1 : 1 - (u - 0.15) / 0.85;
      // a torn, curled piece of ship's plating: an angular outline, dark steel inside, an edge that burns and cools, and a frame rib across it
      const edge = heat > 0.5 ? [1.0, 0.46 + 0.3 * (heat - 0.5), 0.14] : [0.3 + heat * 1.4, 0.1 + heat * 0.5, 0.08];
      const tumble = sp + i * 1.7, A = new V().addScaledVector(ux, Math.cos(tumble)).addScaledVector(uy, Math.sin(tumble)).addScaledVector(n, 0.25 * Math.sin(sp * 1.4)).normalize();
      const flip = 0.32 + 0.68 * Math.abs(Math.cos(sp * 1.25 + i));
      const J = []; for (let q = 0; q <= 6; q++) J.push(hr(i, 40 + q, 9, 0.42, 1));
      const pts = [];
      for (let q = -6; q <= 6; q++) {
        const f = q / 6, bend = (0.2 + 0.3 * Math.sin(sp * 0.7 + i)) * (f * f);
        pts.push(P.clone().addScaledVector(A, f * len * 0.5).addScaledVector(uy, bend * len * 0.5).addScaledVector(ux, bend * len * 0.3));
      }
      const w = (s) => { const q = Math.min(5, Math.floor(s * 6)), f = s * 6 - q; return (J[q] + (J[q + 1] - J[q]) * f) * flip; };
      E.beams.push(pts, { m: len * wid, px: 0, width: w, color: edge, hot: [0.1, 0.07, 0.075], power: 1, core: 0.8, soft: 0, seed: 0.2 + i * 0.37, mode: 0, bias: 3 });
      if (big) E.beams.push(pts, { m: len * 0.035, px: 0.8, color: [0.34, 0.2, 0.17], hot: [0.34, 0.2, 0.17], power: 1, core: 0.8, soft: 0, seed: 0.5 + i, mode: 0, bias: 4 });
    }
  }

  // Shot 2: full power, white with an ice-blue edge, goes through the rings and on.
  function secondHero() {
    const t = E.tq, t0 = C.fire2;
    muzzleBlast(t0, 1.35);
    if (t < t0 || t > C.coreBreak + 0.12) return;
    const M = MUZZLE0();
    const O = orreryCentre();
    const dir = new V().subVectors(O, M).normalize();
    const dist = M.distanceTo(O);
    const reach = t < C.pierce ? 120 + (dist - 120) * easeIn(clamp((t - t0) / (C.pierce - t0)), 1.3) : dist + 2600;
    const end = M.clone().addScaledVector(dir, reach);
    const pw = t > C.coreBreak - 0.25 ? 1 - smooth(invLerp(C.coreBreak - 0.25, C.coreBreak + 0.1, t)) : 1;
    // starts as a thin line out of the muzzle's charge glow and swells to full width over about half a second
    const grow = 0.14 + 0.86 * smooth((t - t0) / 0.5);
    beam(M, end, { m: 24 * pw * grow, px: 3 * pw, color: [0.5, 0.82, 1.0], power: 1.5, core: 0.62, soft: 36, seed: 0.31, flare: 0.7, taper: t < C.pierce ? spear : null, bias: 18 });
    E.light.line(M, end, [0.75, 0.9, 1.0], 620 * pw);
    E.sky(0.26 * pw, 0.26 * pw, 0.5 * pw);
    // where it pierces the rings
    if (t >= C.pierce) {
      const D = Math.floor(t * 8);
      const k = 1 - smooth(invLerp(C.coreBreak - 0.3, C.coreBreak, t));
      const jit = 1 + (hash(D, 2, 7) - 0.5) * 0.24;
      glows.push(O, { kind: GLOW.disc, m: 92 * jit * k, color: [0.62, 0.84, 1.0], power: 1.5, mode: 0, bias: 160 });
      glows.push(O, { kind: GLOW.soft, m: 340, color: [0.7, 0.85, 1.0], power: 0.7 * k, mode: 0, bias: 160 });
      glows.push(O, { kind: GLOW.streak, m: 24 * k * jit, aspect: 24, rot: 0.14 + 0.08 * (D % 2), color: [0.82, 0.9, 1.0], power: 1.5 * k, mode: 0, bias: 160 });
      glows.push(O, { kind: GLOW.kira, m: 380, color: [0.7, 0.85, 1.0], power: 0.9 * k, mode: 0, bias: 160, rot: 0.3 });
    }
  }

  // s26: the core implodes (streaks rush in), a sphere of light swells, then collapses to a star on the cut.
  const orbU = orb.material.uniforms;
  function implosion() {
    const t = E.tq, t0 = C.coreBreak;
    orb.visible = false;
    if (t < t0 - 0.5 || t > t0 + 1.25) return;
    const O = orreryCentre();
    const D = Math.floor(t * 8);
    const R3 = new V(1, 0, 0).applyQuaternion(camera.quaternion), U3 = new V(0, 1, 0).applyQuaternion(camera.quaternion);
    if (t < t0) {
      const k = smooth(invLerp(t0 - 0.5, t0, t));
      for (let i = 0; i < 26; i++) {
        const th = hash(i, D, 7) * 6.283;
        const dir = new V().copy(R3).multiplyScalar(Math.cos(th)).addScaledVector(U3, Math.sin(th));
        const far = hr(i, D, 8, 240, 520) * (1.05 - k);
        const near = far * hr(i, D, 9, 0.2, 0.55);
        const pts = linePts(O.clone().addScaledVector(dir, far), O.clone().addScaledVector(dir, near), 8);
        E.beams.push(pts, { m: 5, px: 1.5, width: (s) => s, color: CORAL, hot: [1, 1, 1], power: 1.4 * k, core: 0.62, soft: 10, seed: i * 0.3, mode: 2 });
      }
      glows.push(O, { kind: GLOW.soft, m: 180, color: CORAL, power: 1.0 * k, mode: 2 });
      E.light.point(O, [1.0, 0.45, 0.35], 900, 1.2 * k);
      return;
    }
    const a = t - t0;
    const grow = easeOut(clamp(a / 0.55), 2.2);
    const collapse = clamp((a - 0.72) / 0.28);
    const R = (50 + 610 * grow) * (1 - easeIn(collapse, 2.4));
    orbU.uCenter.value.copy(O);
    orbU.uR.value = R;
    orbU.uDrawing.value = E.draw;
    orbU.uPower.value = 1;
    orb.visible = R > 1;
    if (a > 0.86) glows.push(O, { kind: GLOW.kira, m: 760 * (1 - clamp((a - 1.02) / 0.22)), color: [0.95, 0.75, 0.65], power: 1.3, mode: 2, rot: 0.25 });
    const k = 1 - easeIn(collapse, 2);
    E.light.point(O, [1.0, 0.82, 0.74], 1100, 1.8 * k);
    E.sky(0.65 * k, 0.38 * k, 0.32 * k);
    // shock ring lines around it
    for (let j = 0; j < 2; j++) {
      const ar = a - j * 0.14;
      if (ar <= 0 || ar > 1.1) continue;
      const u = ar / 1.1, RR = 90 + 920 * easeOut(u, 2);
      const q = [];
      for (let s = 0; s <= 44; s++) { const th = (s / 44) * Math.PI * 2; q.push(O.clone().addScaledVector(R3, Math.cos(th) * RR).addScaledVector(U3, Math.sin(th) * RR)); }
      E.beams.push(q, { m: 7 * (1 - u) + 1, px: 1.2, color: CORAL, hot: [1, 1, 1], power: 1.2 * (1 - u * u), core: 0.5, soft: 8, seed: j + 0.7, mode: 2 });
    }
  }

  // full-frame flash: short, always with a source in frame
  const fu = flash.material.uniforms;
  function flashes(st) {
    const t = st.t;
    // held for a couple of drawings, then gone: a soft fade over a dark frame reads as grey, a cut does not
    const pulse = (t0, dur, v) => (E.tq >= t0 && E.tq < t0 + dur ? v : 0);
    let a = 0, col = [1, 1, 1], src = null;
    const consider = (v, c, s) => { if (v > a) { a = v; col = c; src = s; } };
    consider(pulse(C.muzzle, 0.125, 0.86), [0.86, 0.95, 1.0], MUZZLE0);
    consider(pulse(C.fire2, 0.25, 0.92), [0.92, 0.97, 1.0], MUZZLE0);
    consider(pulse(C.impact, 0.125, 0.7), [1.0, 0.86, 0.76], () => FAR);
    consider(pulse(SLAM_T, 0.125, 0.78), [1.0, 0.82, 0.76], shieldAt);
    consider(pulse(C.coreBreak, 0.125, 0.85), [1.0, 0.92, 0.84], orreryCentre);
    fu.uA.value = a;
    if (a > 0.002) {
      fu.uColor.value.setRGB(col[0], col[1], col[2]);
      const sp = src().project(camera);
      fu.uCenter.value.set(clamp(sp.x * 0.5 + 0.5, -0.5, 1.5), clamp(sp.y * 0.5 + 0.5, -0.5, 1.5));
    }
    flash.visible = a > 0.002;
  }

  // s28, s29: the ridge smokes, the hatch smokes
  function afterSmoke(st) {
    const t = E.tq;
    if (t < C.silence - 0.5) return;
    // the ridge smokes only while we look at the ridge: in the hatch shots' wide framing it stood on the horizon as a strange blue object
    if (!['s29', 's30', 's31', 's32'].includes(st.sid)) {
      plume(E, RIDGE_HIT, C.silence - 6, C.end, 62, 3, { life: 8, dt: 0.6, H: 420 });
      plume(E, RIDGE_HIT.clone().add(new V(150, 0, -70)), C.silence - 6, C.end, 48, 5, { life: 8, dt: 0.72, H: 360 });
    }
    const h = anchorOf(ctx.mech, 'hatch', [TORTOISE.stance[0], TORTOISE.stance[1] + 34, TORTOISE.stance[2]]);
    if (st.sid === 's29' || st.sid === 's30') plume(E, h, C.silence, C.end, 1.1, 8, { life: 4, dt: 0.32, H: 12, pal: PAL.SMOKE });
  }

  function endRingQueue() {
    if (!E.ringQueue.length || ring.visible) return;
    const r = E.ringQueue.sort((a, b) => b.k * b.r - a.k * a.r)[0];
    setRing(r.x, r.z, r.r, r.k, 1.5, [0.97, 1.0, 1.0], [0.55, 0.78, 0.92]);
  }

  // ---------------------------------------------------- frame
  function update(st) {
    const t = st.t;
    E.t = t; E.tq = onThrees(t); E.draw = Math.floor(t * 8); E.sid = st.sid;
    E.orreryCore.copy(orreryCentre());
    puffs.begin(camera.position); petals.begin(); glows.begin(camera); beams.begin(); trails.begin(); lines.begin();
    E.ringQueue.length = 0; lightReq.length = 0; skyFlash.setRGB(0, 0, 0);
    ring.visible = false;
    puffs.mesh.material.uniforms.uFogD.value = engine.mAtmos.uniforms.uFogDensity.value;
    puffs.mesh.material.uniforms.uDrawing.value = E.draw;
    beams.mesh.material.uniforms.uDrawing.value = E.draw;
    trails.mesh.material.uniforms.uDrawing.value = E.draw;
    const bu = beams.mesh.material.uniforms, th = Math.tan((camera.fov * Math.PI) / 360);
    bu.uCam.value.copy(camera.matrixWorld); bu.uCamPos.value.copy(camera.position); bu.uTan.value.set(th * camera.aspect, th);

    const steps = [hookWire, surge, () => rockets.update(st), answerSweep, () => muzzleBlast(C.muzzle, 1), () => firstExchange(st), () => helix.update(st),
      secondCoral, meltPetals, secondHero, implosion, () => water.update(st), () => afterSmoke(st), endRingQueue, () => flashes(st)];
    for (const f of steps) { try { f(); } catch (e) { console.error(`[fx] step failed: ${e.stack || e}`); } }

    puffs.end(); petals.end(); glows.end(); beams.end(); trails.end(); lines.end();

    // light the world: the strongest requests take the free slots
    lightReq.sort((a, b) => b.s - a.s);
    for (const l of lightReq.slice(0, 6)) addWarLight(l);
    const sky = ctx.world?.sky?.material?.uniforms?.uSkyFlash;
    if (sky && (skyFlash.r > 0 || skyFlash.g > 0 || skyFlash.b > 0)) sky.value.setRGB(skyFlash.r, skyFlash.g, skyFlash.b);
  }

  const beamOn = (t) => ({
    hero: (t >= C.muzzle && t < C.impact + 1.2) || (t >= C.fire2 && t < C.coreBreak + 0.1),
    coral: (t >= C.answer && t < C.answer + 2.5) || (t >= C.cross - 0.5 && t < C.impact + 1.2) || (t >= C.strike && t < C.pierce + 0.45),
  });
  return { update, beamOn, SLAM_T, _meshes: { puffs: puffs.mesh, petals: petals.mesh, glows: glows.mesh, beams: beams.mesh, trails: trails.mesh, lines: lines.mesh, ring, orb, flash } };
}
