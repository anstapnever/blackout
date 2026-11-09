import * as THREE from 'three';

// Drawn energy beams for BLACKOUT, plus their broken reflection on the sea and arcing smoke ribbons.
// Everything is a camera-facing ribbon in the overlay. The overlay has no depth buffer, so depth comes
// from the scene data texture and draw order is the order of push().
//   beam : white core, hard colour band, darker hard rim, thin soft halo for the bloom
//   mode 0 = depth tested, 2 = always on top, 3 = on the sea plane with crawling dashes, 4 = on the sea plane, whole strokes

const premult = (m) => {
  m.blending = THREE.CustomBlending;
  m.blendEquation = THREE.AddEquation;
  m.blendSrc = THREE.OneFactor;
  m.blendDst = THREE.OneMinusSrcAlphaFactor;
  m.blendSrcAlpha = THREE.OneFactor;
  m.blendDstAlpha = THREE.OneMinusSrcAlphaFactor;
  m.premultipliedAlpha = true;
  return m;
};

const HASH = /* glsl */ `
float h12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float vn(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f*f*(3.-2.*f);
  return mix(mix(h12(i), h12(i+vec2(1,0)), u.x), mix(h12(i+vec2(0,1)), h12(i+vec2(1,1)), u.x), u.y); }
`;

const RIBBON_VS = /* glsl */ `
  attribute vec3 aPrev, aNext;
  attribute vec4 aA, aC, aH, aK;
  uniform vec2 uRes;
  uniform float uS;
  varying vec2 vA;
  varying float vDepth, vW, vPad;
  varying vec4 vC;
  varying vec4 vH;
  varying vec4 vK;
  varying vec2 vN;
  const float NEARZ = -0.6;
  vec4 toNear(vec4 a, vec4 b){ return mix(a, b, clamp((NEARZ - a.z) / (b.z - a.z), 0.0, 1.0)); }
  void main(){
    vec4 v = viewMatrix * vec4(position, 1.0);
    vec4 vp = viewMatrix * vec4(aPrev, 1.0);
    vec4 vn = viewMatrix * vec4(aNext, 1.0);
    if(v.z > NEARZ){
      if(vn.z < NEARZ) v = toNear(v, vn);
      else if(vp.z < NEARZ) v = toNear(v, vp);
      else { gl_Position = vec4(3.0, 3.0, 3.0, 1.0); return; }
    }
    if(vp.z > NEARZ) vp = toNear(vp, v);
    if(vn.z > NEARZ) vn = toNear(vn, v);
    vec4 c = projectionMatrix * v, cp = projectionMatrix * vp, cn = projectionMatrix * vn;
    vec2 s = c.xy / c.w * 0.5 * uRes, sp = cp.xy / cp.w * 0.5 * uRes, sn = cn.xy / cn.w * 0.5 * uRes;
    vec2 d = sn - sp;
    float l = length(d);
    d = l > 1e-3 ? d / l : vec2(1.0, 0.0);
    vec2 nr = vec2(-d.y, d.x);
    float ppm = projectionMatrix[1][1] * 0.5 * uRes.y / max(-v.z, 0.1);
    float w = aA.z * uS + aA.w * ppm;
    float pad = w * 1.45 + aH.w * uS + 1.5 * uS;
    vec2 P = s + nr * aA.x * pad;
    vA = vec2(aA.x * pad, aA.y);
    vW = w; vPad = pad;
    vC = aC; vH = aH; vK = aK; vN = nr;
    vDepth = -v.z;
    gl_Position = vec4(P / (0.5 * uRes) * c.w, c.z, c.w);
  }
`;

const camU = () => ({ uCam: { value: new THREE.Matrix4() }, uCamPos: { value: new THREE.Vector3() }, uTan: { value: new THREE.Vector2(1, 1) } });

export function beamMaterial(S) {
  const u = { uSceneData: { value: null }, uRes: { value: new THREE.Vector2(1, 1) }, uS: { value: S }, uDrawing: { value: 0 }, ...camU() };
  const fs = /* glsl */ `
    uniform sampler2D uSceneData;
    uniform vec2 uRes, uTan;
    uniform float uS, uDrawing;
    uniform mat4 uCam;
    uniform vec3 uCamPos;
    varying vec2 vA;
    varying float vDepth, vW, vPad;
    varying vec4 vC;
    varying vec4 vH;
    varying vec4 vK;
    out vec4 oColor;
    ${HASH}
    void main(){
      vec2 uv = gl_FragCoord.xy / uRes;
      float sd = texture(uSceneData, uv).b;
      float mode = vK.x, seed = vK.z;
      float dash = 1.0;
      if(mode < 0.5){
        if(sd > 0.01 && sd < 8000.0 && vDepth > sd + vK.y) discard;
      } else if(mode > 2.5){
        // sea reflection: only on pixels that really are the water plane, broken into horizontal dashes
        vec3 rd = mat3(uCam) * vec3((uv * 2.0 - 1.0) * uTan, -1.0);
        if(rd.y >= -1e-4) discard;
        float t = -uCamPos.y / rd.y;
        if(sd < 0.01 || abs(sd - t) > t * 0.03 + 3.0) discard;
        vec3 P = uCamPos + rd * t;
        // long flat dashes that crawl sideways on threes, opening up nearer the camera
        float n = vn(vec2(P.x * 0.012 + seed * 7.0 + uDrawing * 0.9, P.z * 0.11 + seed));
        float n2 = vn(vec2(P.x * 0.05 - uDrawing * 1.3, P.z * 0.4 + seed * 3.0));
        dash = mode > 3.5 ? 1.0 : step(0.46, n * 0.72 + n2 * 0.34);
        if(dash < 0.5) discard;
      }
      float w = max(vW, 0.6);
      float u_ = vA.y;
      float side = sign(vA.x);
      float d = abs(vA.x);
      // edges wobble along the length and redraw on threes: big slow bulge plus a finer ragged lip
      float wob = vn(vec2(u_ * 0.017 + seed * 3.1 + side * 11.0, uDrawing * 0.37)) - 0.5;
      float wob2 = vn(vec2(u_ * 0.11 + seed * 7.7 + side * 5.0, uDrawing * 0.91)) - 0.5;
      float edge = 1.0 + wob * 0.42 + wob2 * 0.18;
      float coreF = vK.w;
      float coreR = w * coreF * (1.0 + wob * 0.8 - wob2 * 0.45);
      float aa = 1.2 * uS;
      float core = smoothstep(coreR + aa, coreR - aa * 0.2, d);
      float band = smoothstep(w * edge + aa, w * edge - aa * 0.2, d);
      float rimW = w * edge * 1.16 + 1.1 * uS;
      float rim = smoothstep(rimW + aa, rimW - aa * 0.2, d);
      float pw = vC.a;
      // streaks running down the colour band, redrawn on threes
      float st = vn(vec2(d / max(w, 1.0) * 4.5 + seed, u_ * 0.012 - uDrawing * 1.7));
      vec3 c = vC.rgb;
      vec3 bandC = mix(c, min(c * 1.7, vec3(1.0)) * 1.15, step(0.56, st) * 0.65);
      bandC *= 0.95 + 0.1 * min(pw, 2.0);
      // the core is white, tinted a touch at its very edge so it never reads as a grey stripe
      vec3 hot = mix(vH.rgb, c, 0.08) * (1.15 + 0.3 * min(pw, 2.0));
      float soft = clamp(1.0 - max(d - rimW, 0.0) / max(vPad - rimW, 0.5), 0.0, 1.0);
      soft = soft * soft * soft;
      vec3 deep = c * 0.46;
      vec3 rgb = hot * core + bandC * band * (1.0 - core) + deep * rim * (1.0 - band) + c * soft * 0.3 * pw * (1.0 - rim);
      float a = max(max(core, band), rim * 0.82);
      float vis = min(pw, 1.0);
      rgb *= vis; a *= vis;
      if(a < 0.003 && dot(rgb, rgb) < 1e-5) discard;
      oColor = vec4(rgb, a);
    }
  `;
  return premult(new THREE.ShaderMaterial({ glslVersion: THREE.GLSL3, uniforms: u, vertexShader: RIBBON_VS, fragmentShader: fs, transparent: true, depthTest: false, depthWrite: false, side: THREE.DoubleSide }));
}

// ---------------------------------------------------------- arcing smoke ribbon: two-tone cel smoke with an inked lip
export function trailMaterial(S) {
  const u = { uSceneData: { value: null }, uRes: { value: new THREE.Vector2(1, 1) }, uS: { value: S }, uDrawing: { value: 0 } };
  const fs = /* glsl */ `
    uniform sampler2D uSceneData;
    uniform vec2 uRes;
    uniform float uS, uDrawing;
    varying vec2 vA;
    varying float vDepth, vW, vPad;
    varying vec4 vC;
    varying vec4 vH;
    varying vec4 vK;
    varying vec2 vN;
    out vec4 oColor;
    ${HASH}
    void main(){
      vec2 uv = gl_FragCoord.xy / uRes;
      float sd = texture(uSceneData, uv).b;
      if(sd > 0.01 && sd < 8000.0 && vDepth > sd + vK.y) discard;
      float seed = vK.z, age = vC.a;                      // age 0 fresh .. 1 gone
      float w = max(vW, 0.6);
      float c = vA.x / w;
      float u_ = vA.y;
      float n = vn(vec2(u_ * 0.03 + seed * 5.0, seed + uDrawing * 0.21));
      float n2 = vn(vec2(u_ * 0.13 + seed * 2.0, seed * 3.0 - uDrawing * 0.13));
      float edge = 0.72 + 0.34 * n + 0.1 * n2;
      if(abs(c) > edge) discard;
      // the ribbon thins into broken strands as it ages, always reaching zero
      float brk = vn(vec2(u_ * 0.018 + seed * 9.0, c * 1.4 + seed));
      if(brk * 1.15 < age * 1.2 - 0.06) discard;
      // key from the moon above the ribbon, one hard terminator
      vec2 lit2 = normalize(vec2(-0.25, 1.0));
      float sh = dot(vN, lit2) * c * 0.8 + (n2 - 0.5) * 0.5;
      vec3 lit = vH.rgb, dark = vC.rgb;
      vec3 col = sh > 0.05 ? lit : dark;
      // ink lip
      float ink = smoothstep(edge - 0.12 - 2.0 * uS / w, edge - 0.05, abs(c));
      col = mix(col, dark * 0.45, ink * 0.85);
      oColor = vec4(col, 1.0);
    }
  `;
  return new THREE.ShaderMaterial({ glslVersion: THREE.GLSL3, uniforms: u, vertexShader: RIBBON_VS, fragmentShader: fs, transparent: false, depthTest: false, depthWrite: false, side: THREE.DoubleSide });
}

// ---------------------------------------------------------- geometry: same ribbon layout for both materials
export class RibbonBatch {
  constructor(material, maxVerts = 30000) {
    this.max = maxVerts;
    const g = new THREE.BufferGeometry();
    const mk = (n) => { const a = new THREE.BufferAttribute(new Float32Array(maxVerts * n), n); a.setUsage(THREE.DynamicDrawUsage); return a; };
    this.aPos = mk(3); this.aPrev = mk(3); this.aNext = mk(3);
    this.aA = mk(4); this.aC = mk(4); this.aH = mk(4); this.aK = mk(4);
    g.setAttribute('position', this.aPos); g.setAttribute('aPrev', this.aPrev); g.setAttribute('aNext', this.aNext);
    g.setAttribute('aA', this.aA); g.setAttribute('aC', this.aC); g.setAttribute('aH', this.aH); g.setAttribute('aK', this.aK);
    this.idx = new THREE.BufferAttribute(new Uint32Array(maxVerts * 3), 1);
    this.idx.setUsage(THREE.DynamicDrawUsage);
    g.setIndex(this.idx);
    g.setDrawRange(0, 0);
    this.geo = g;
    this.mesh = new THREE.Mesh(g, material);
    this.mesh.frustumCulled = false;
    this.nv = 0; this.ni = 0;
  }
  begin() { this.nv = 0; this.ni = 0; }
  // pts: Vector3[]. o: { px, m, width(s 0..1 along), color, hot, power(s) or number, soft, mode, bias, seed, core, u0 }
  push(pts, o = {}) {
    const n = pts.length;
    if (n < 2 || this.nv + n * 2 > this.max) return;
    const px = o.px ?? 0, m = o.m ?? 1, soft = o.soft ?? 14, mode = o.mode ?? 0, bias = o.bias ?? 6, seed = o.seed ?? 0.3, core = o.core ?? 0.42;
    const c = o.color ?? [1, 1, 1], hot = o.hot ?? [1, 1, 1], fw = o.width, fp = typeof o.power === 'function' ? o.power : null;
    const P0 = fp ? 1 : (o.power ?? 1);
    const base = this.nv;
    let u = o.u0 ?? 0;
    const pA = this.aPos.array, prA = this.aPrev.array, nxA = this.aNext.array, aA = this.aA.array, aC = this.aC.array, aH = this.aH.array, aK = this.aK.array;
    for (let i = 0; i < n; i++) {
      const s = i / (n - 1);
      const p = pts[i], a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)];
      if (i > 0) u += p.distanceTo(a);
      const wk = fw ? fw(s) : 1;
      const pw = fp ? fp(s) : P0;
      for (let sd = 0; sd < 2; sd++) {
        const v = this.nv++;
        pA[v * 3] = p.x; pA[v * 3 + 1] = p.y; pA[v * 3 + 2] = p.z;
        prA[v * 3] = a.x; prA[v * 3 + 1] = a.y; prA[v * 3 + 2] = a.z;
        nxA[v * 3] = b.x; nxA[v * 3 + 1] = b.y; nxA[v * 3 + 2] = b.z;
        aA[v * 4] = sd ? 1 : -1; aA[v * 4 + 1] = u; aA[v * 4 + 2] = px * wk; aA[v * 4 + 3] = m * wk;
        aC[v * 4] = c[0]; aC[v * 4 + 1] = c[1]; aC[v * 4 + 2] = c[2]; aC[v * 4 + 3] = pw;
        aH[v * 4] = hot[0]; aH[v * 4 + 1] = hot[1]; aH[v * 4 + 2] = hot[2]; aH[v * 4 + 3] = soft;
        aK[v * 4] = mode; aK[v * 4 + 1] = bias; aK[v * 4 + 2] = seed; aK[v * 4 + 3] = core;
      }
      if (i < n - 1) {
        const q = base + i * 2, ia = this.idx.array, k = this.ni;
        ia[k] = q; ia[k + 1] = q + 1; ia[k + 2] = q + 2; ia[k + 3] = q + 1; ia[k + 4] = q + 3; ia[k + 5] = q + 2;
        this.ni += 6;
      }
    }
  }
  end() {
    this.geo.setDrawRange(0, this.ni);
    for (const a of [this.aPos, this.aPrev, this.aNext, this.aA, this.aC, this.aH, this.aK, this.idx]) { a.needsUpdate = true; a.clearUpdateRanges?.(); }
    this.mesh.visible = this.ni > 0;
  }
}

// Straight or bent spine sampled so a ribbon has enough vertices for its wobble and taper.
export function linePts(a, b, n = 24) {
  const out = [];
  for (let i = 0; i <= n; i++) out.push(new THREE.Vector3().lerpVectors(a, b, i / n));
  return out;
}
