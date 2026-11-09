import * as THREE from 'three';
import { G, COMMON, MRT_OUT, VERT_STD } from './glsl.js';
import { Rng } from './util.js';

// ORRERY dept: broken porcelain. Thick curved tiles with a cream glazed outside and a dark broken edge, a few big ones and fewer small ones.
// Three drawn outlines, ballistic and pure in t.
function tileGeometry(seed) {
  const r = new Rng(seed), n = r.int(5, 8), outline = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + r.range(-0.22, 0.22), rad = r.range(0.62, 1.08);
    outline.push([Math.cos(a) * rad * 1.15, Math.sin(a) * rad * 0.85]);
  }
  const dome = (x, z) => 0.2 - 0.09 * (x * x + z * z);
  const top = outline.map(([x, z]) => new THREE.Vector3(x, dome(x, z), z));
  // the underside is smaller and uneven: the piece tore out of the ring thicker on one side
  const bot = outline.map(([x, z]) => new THREE.Vector3(x * r.range(0.62, 0.86), dome(x, z) - r.range(0.34, 0.62), z * r.range(0.62, 0.86)));
  const P = [], Nn = [], F = [];
  const tri = (a, b, c, face) => {
    const N = new THREE.Vector3().crossVectors(b.clone().sub(a), c.clone().sub(a)).normalize();
    for (const v of [a, b, c]) { P.push(v.x, v.y, v.z); Nn.push(N.x, N.y, N.z); F.push(face); }
  };
  const cTop = new THREE.Vector3(0, dome(0, 0), 0), cBot = new THREE.Vector3(0, dome(0, 0) - 0.5, 0);
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    tri(cTop, top[j], top[i], 1);
    tri(cBot, bot[i], bot[j], 1);
    tri(top[i], top[j], bot[j], 0);
    tri(top[i], bot[j], bot[i], 0);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(Nn, 3));
  g.setAttribute('aFace', new THREE.Float32BufferAttribute(F, 1));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array((P.length / 3) * 2), 2));
  return g;
}

export function buildShards(ctx, ringPoint, tStart, tEnd) {
  const rng = new Rng(6621);
  const uHot = { value: 1 };
  const mat = new THREE.ShaderMaterial({
    glslVersion: THREE.GLSL3, uniforms: { ...G, uHot }, side: THREE.DoubleSide,
    vertexShader: /* glsl */ `
      ${VERT_STD}
      attribute float aFace;
      varying float vTone, vFace; varying vec3 vP;
      void main(){
        vec3 P = (instanceMatrix * vec4(position, 1.0)).xyz, Nn = normalize(mat3(instanceMatrix) * normal);
        vTone = fract(instanceMatrix[3][0] * 0.0137 + instanceMatrix[0][0] * 0.31);
        vFace = aFace; vP = position;
        stdVertex(P, Nn);
      }`,
    fragmentShader: /* glsl */ `
      ${COMMON}
      ${MRT_OUT}
      uniform float uHot;
      varying vec3 vWorld, vNormalW, vNormalV, vP; varying float vDepth, vTone, vFace; varying vec2 vUv;
      void main(){
        if(uPass > 0.5 && uPass < 1.5){ oColor = vec4(1); oData = vec4(0); return; }
        vec3 N = normalize(vNormalW), V = normalize(cameraPosition - vWorld);
        if(dot(N, V) < 0.0) N = -N;
        vec3 Key = normalize(uKeyDir * 0.62 + V * 0.95 + vec3(0.0, 0.28, 0.0));
        float lit = smoothstep(-0.02, 0.06, dot(N, Key));
        float glazed = step(0.5, vFace);
        vec3 cream = vec3(0.95, 0.89, 0.76), tea = vec3(0.72, 0.58, 0.4);
        vec3 col = mix(cream, tea, step(0.62, vTone) * 0.55);
        // a stripe of the ring's gold rail survives on some pieces
        if(vTone < 0.3) col = mix(col, vec3(1.0, 0.74, 0.3), smoothstep(0.26, 0.3, abs(vP.x + vP.z * 0.5 - 0.1)) < 0.5 ? 1.0 : 0.0);
        vec3 side = mix(vec3(0.24, 0.19, 0.21), vec3(0.46, 0.38, 0.34), step(0.58, vnoise(vP.xz * 2.3 + vP.y * 1.4 + vTone * 9.0)));
        // glaze: tea stain, a hairline crack, a chipped rim
        float stain = smoothstep(0.5, 0.62, vnoise(vP.xz * 1.7 + vTone * 13.0));
        col = mix(col, tea, stain * 0.4);
        float crk = abs(vnoise(vP.xz * 2.4 + vTone * 21.0) - 0.5);
        col = mix(col, vec3(0.25, 0.19, 0.2), 1.0 - smoothstep(0.012, 0.03, crk));
        float rim = smoothstep(0.82, 0.98, length(vP.xz));
        col = mix(col, vec3(0.28, 0.22, 0.22), step(0.55, vnoise(vP.xz * 9.0 + vTone * 5.0)) * rim);
        vec3 base = mix(side, col, glazed);
        vec3 moonN = mix(vec3(dot(uSunColor, vec3(0.33))), uSunColor, 0.3); moonN /= max(max(moonN.r, moonN.g), moonN.b);
        vec3 c = mix(base * uShadeTint * vec3(2.05, 1.8, 1.32), base * moonN * mix(0.7, 1.1, uSunStrength), lit);
        // only the raw broken edge still glows
        c += vec3(1.0, 0.45, 0.2) * (1.0 - glazed) * smoothstep(-0.02, 0.12, vP.y) * uHot * 0.9;
        writeOut(c, 1.0, normalize(vNormalV), vDepth, 22.0);
      }`,
  });
  const group = new THREE.Group();
  const counts = [16, 14, 14];
  const sets = counts.map((n, k) => {
    const m = new THREE.InstancedMesh(tileGeometry(4101 + k * 97), mat, n);
    m.frustumCulled = false; m.userData.noShadow = true;
    group.add(m);
    const items = [];
    for (let i = 0; i < n; i++) {
      const t0 = tStart + rng.range(0, 1) * rng.range(0.3, 1) * (tEnd - tStart);
      const P = ringPoint(rng, t0);
      const u = rng.next();
      const size = u < 0.3 ? rng.range(20, 34) : u < 0.72 ? rng.range(9, 18) : rng.range(4, 7);
      const dir = P.clone().setY(P.y * 0.6).normalize();
      const speed = rng.range(30, 110) * (24 / (size + 18));
      items.push({
        p: P, t0, s: size,
        v: dir.multiplyScalar(speed).add(new THREE.Vector3(rng.range(-24, 24), rng.range(0, 36), rng.range(-24, 24))),
        ax: new THREE.Vector3(rng.range(-1, 1), rng.range(-1, 1), rng.range(-1, 1)).normalize(),
        w: (rng.range(0.5, 2.6) * rng.sign() * 14) / (size + 10),
        g: 62 + rng.range(0, 22),
        sq: [rng.range(0.85, 1.3), rng.range(0.38, 0.62), rng.range(0.75, 1.15)],
      });
    }
    return { m, items };
  });
  const M = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), o = new THREE.Vector3();
  const update = (t, heat) => {
    uHot.value = heat;
    let any = false;
    for (const { m, items } of sets) {
      for (let i = 0; i < items.length; i++) {
        const it = items[i], d = t - it.t0;
        if (d < 0) { M.makeScale(0, 0, 0); m.setMatrixAt(i, M); continue; }
        any = true;
        o.copy(it.p).addScaledVector(it.v, d); o.y -= 0.5 * it.g * d * d;
        q.setFromAxisAngle(it.ax, it.w * d);
        s.set(it.sq[0] * it.s, it.sq[1] * it.s, it.sq[2] * it.s);
        M.compose(o, q, s);
        m.setMatrixAt(i, M);
      }
      m.instanceMatrix.needsUpdate = true;
    }
    group.visible = any;
  };
  return { mesh: group, update };
}
