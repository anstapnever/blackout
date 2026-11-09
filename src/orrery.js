import * as THREE from 'three';
import { ORRERY, SEA_Y } from './layout.js';
import { Rng, clamp, lerp, smooth, invLerp, noise1 } from './util.js';
import { makeScaleSheet, makeLaceSheet } from './orrery-tex.js';
import { buildRing, buildThrone, RINGS } from './orrery-geo.js';
import { ringMaterial } from './orrery-mat.js';
import { bakeMotion } from './orrery-motion.js';
import { buildCore, poseCore } from './orrery-core.js';
import { buildShards } from './orrery-shards.js';
import { addWarLight } from './glsl.js';

// ORRERY dept: createOrrery(ctx). See CONTRACT.md. A 520 m astrolabe of five nested gimballed rings around a lacquer core.
// Flat scene graph: every chunk's matrix is computed here from the baked motion, relative to root (at the orrery centre).

const THREAD_W = 1.2;

function buildThread(ctx) {
  const N = 48, pos = [], side = [], idx = [];
  for (let i = 0; i <= N; i++) for (const s of [-1, 1]) { pos.push(0, i / N, 0); side.push(s); }
  for (let i = 0; i < N; i++) { const a = i * 2, b = a + 2; idx.push(a, b, b + 1, a, b + 1, a + 1); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aSide', new THREE.Float32BufferAttribute(side, 1));
  g.setIndex(idx);
  const u = { ...ctx.G, uTop: { value: new THREE.Vector3() }, uBot: { value: new THREE.Vector3() }, uWidth: { value: THREAD_W }, uPxH: { value: 1 }, uHeat: { value: 0.4 }, uVis: { value: 1 } };
  const mat = new THREE.ShaderMaterial({
    glslVersion: THREE.GLSL3, uniforms: u, side: THREE.DoubleSide,
    vertexShader: /* glsl */ `
      attribute float aSide; uniform vec3 uTop, uBot; uniform float uWidth, uPxH, uDrawTime; varying float vT, vD, vS;
      void main(){
        float q = position.y; vT = q; vS = aSide;
        vec3 p = mix(uBot, uTop, q);
        float sw = sin(q * 7.0 + uDrawTime * 2.2) * (1.0 - q) * 1.1 + sin(q * 19.0 - uDrawTime * 3.1) * 0.5;
        p.x += sw; p.z += sw * 0.6;
        vec4 mv = viewMatrix * vec4(p, 1.0);
        float pxw = -mv.z * uPxH * 0.9;                 // never thinner than about one pixel
        vec3 dir = normalize((viewMatrix * vec4(uTop - uBot, 0.0)).xyz);
        vec3 s = normalize(cross(dir, vec3(0.0, 0.0, 1.0)));
        mv.xyz += s * aSide * max(uWidth, pxw);
        vD = -mv.z;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      precision highp float;
      uniform float uHeat, uPass, uDrawTime, uVis; varying float vT, vD, vS;
      layout(location = 0) out vec4 oColor; layout(location = 1) out vec4 oData;
      void main(){
        if(uPass > 0.5 || uVis < 0.5) discard;
        float tw = 0.75 + 0.25 * sin(vT * 90.0 + uDrawTime * 11.0);
        float s = 1.0 - abs(vS);
        vec3 c = mix(vec3(1.0, 0.28, 0.2), vec3(1.0, 0.75, 0.6), step(0.45, s));
        oColor = vec4(c * (1.3 + uHeat * 2.2) * tw, 0.0);
        oData = vec4(0.5, 0.5, vD, 120.0);
      }`,
  });
  const m = new THREE.Mesh(g, mat); m.frustumCulled = false; m.userData.noShadow = true;
  return m;
}

// Additive flash inside the ring. Lives in the overlay, tests the scene depth itself.
function buildFlare(ctx) {
  const g = new THREE.CircleGeometry(1, 96);
  const u = { uSceneData: { value: null }, uRes: { value: new THREE.Vector2(1, 1) }, uI: { value: 0 }, uFill: { value: 0 }, uDist: { value: 0 } };
  const mat = new THREE.ShaderMaterial({
    glslVersion: THREE.GLSL3, uniforms: u, transparent: true, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    vertexShader: /* glsl */ `varying vec2 vP; void main(){ vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `
      uniform sampler2D uSceneData; uniform vec2 uRes; uniform float uI, uFill, uDist; varying vec2 vP; out vec4 o;
      void main(){
        float d = texture(uSceneData, gl_FragCoord.xy / uRes).b;
        if(d > 0.5 && d < uDist - 40.0) discard;
        float r = length(vP);
        float edge = smoothstep(0.7, 0.99, r) * (1.0 - smoothstep(0.99, 1.0, r));
        float fill = 1.0 - smoothstep(0.0, 1.0, r);
        // the fill arrives from the rim inward, after the edge is already hot
        float front = 1.05 * (1.0 - uFill) - 0.12 * uFill;
        float a = edge * 1.5 * uI + fill * fill * 0.42 * uFill * smoothstep(front - 0.5, front + 0.1, r);
        o = vec4(vec3(0.72, 0.88, 1.0) * a * 2.6, 1.0);
      }`,
  });
  const m = new THREE.Mesh(g, mat); m.frustumCulled = false;
  return m;
}

export async function createOrrery(ctx) {
  const { scene, overlay, CUES: C, engine } = ctx;
  const center = new THREE.Vector3(...ORRERY.center);
  const root = new THREE.Group(); root.name = 'orrery'; root.position.copy(center);
  scene.add(root);
  const tex = { scale: makeScaleSheet(engine.renderer), lace: makeLaceSheet(engine.renderer) };
  const coreW = { value: new THREE.Vector3() };
  const M = bakeMotion(C, center);

  // ---- rings: one mesh per chunk, one material per ring
  const rings = [];
  for (let i = 0; i < 5; i++) {
    const cfg = RINGS[i];
    const R = (cfg.rI + cfg.rO) / 2;
    const b = buildRing(i);
    const mat = ringMaterial(i, tex, { R: b.R, rI: cfg.rI, rO: cfg.rO, coreW });
    const chunks = b.geos.map((g, c) => {
      const m = new THREE.Mesh(g, mat);
      m.matrixAutoUpdate = false; m.frustumCulled = false;
      root.add(m);
      const a = b.chunkMid[c];
      return { mesh: m, mid: a, dir: new THREE.Vector3(Math.cos(a), Math.sin(a), 0), c: new THREE.Vector3(Math.cos(a) * R, Math.sin(a) * R, 0), cluster: 0 };
    });
    b.clusters.forEach((cl, k) => cl.forEach((c) => { if (chunks[c]) chunks[c].cluster = k; }));
    rings.push({ i, cfg, R, mat, chunks, clusters: b.clusters });
  }
  // the throne on the great ring: rises at ignite, belongs to the great ring's motion
  const throne = new THREE.Mesh(buildThrone(), rings[0].mat);
  throne.matrixAutoUpdate = false; throne.frustumCulled = false; root.add(throne);

  // ---- core
  const core = buildCore();
  root.add(core.group);

  // ---- hair-thin coral thread to the sea
  const thread = buildThread(ctx); scene.add(thread);

  // ---- flare inside the ring for the hook
  const flare = buildFlare(ctx); overlay.add(flare);

  // ---- ring transforms
  const qr = new THREE.Quaternion(), qa = new THREE.Quaternion();
  const VX = new THREE.Vector3(1, 0, 0), VY = new THREE.Vector3(0, 1, 0);
  // relative-to-root gimbal matrix of ring i at time t
  function ringMatrix(i, t, out) {
    M.ringQ(t, qr);
    out.makeRotationFromQuaternion(qr);
    for (let k = 1; k <= i; k++) {
      qa.setFromAxisAngle(k % 2 ? VX : VY, M.angle[k](t));
      out.multiply(_m.makeRotationFromQuaternion(qa));
    }
    return out;
  }
  const _gmHeart = new THREE.Matrix4(), _l2 = new THREE.Matrix4(), _m = new THREE.Matrix4(), _l = new THREE.Matrix4(), _r = new THREE.Matrix4(), _s = new THREE.Matrix4(), _v = new THREE.Vector3(), _q = new THREE.Quaternion(), _a = new THREE.Vector3();

  // ---- break-up: clusters of chunks fly as rigid bodies, defined in root space from the pose at the moment of the implosion.
  const tBreak = C.coreBreak + 0.1;
  const rng = new Rng(88123);
  const breakAt = new Array(5);
  for (const r of rings) {
    const Mb = ringMatrix(r.i, tBreak, new THREE.Matrix4());
    breakAt[r.i] = Mb;
    r.fly = r.clusters.map((list, k) => {
      const cen = new THREE.Vector3(); for (const c of list) cen.add(r.chunks[c].c); cen.multiplyScalar(1 / list.length).applyMatrix4(Mb);
      const dir = cen.clone().normalize();
      const big = r.i === 0 && k === 0;
      const axis = new THREE.Vector3(rng.range(-1, 1), rng.range(-0.3, 0.3), rng.range(-1, 1)).normalize();
      // how far this piece comes away from the falling mass: the heart of the great ring never does
      const loose = big ? 0 : (r.i === 0 ? rng.range(0.35, 0.7) : rng.range(0.55, 1));
      return {
        cen, dir, loose, axis, big,
        w: rng.range(0.1, 0.3) * rng.sign() * loose, out: rng.range(14, 40) * loose, g: rng.range(30, 96) * loose, delay: rng.range(0.25, 1.5),
      };
    });
  }
  // the whole thing: a beat of nothing after the implosion, then it keels over and drops, accelerating
  const TOPPLE_AXIS = new THREE.Vector3(-0.27, 0.1, -0.96).normalize(), _gq = new THREE.Quaternion(), _gm = new THREE.Matrix4();
  const G_FALL = 76, G_DELAY = 0.42;
  function groupMatrix(tau, out) {
    const d = Math.max(0, tau - G_DELAY);
    const x = d / 3.4, ang = 1.05 * (x * x) / (x + 0.35);
    _gq.setFromAxisAngle(TOPPLE_AXIS, ang);
    out.makeRotationFromQuaternion(_gq);
    out.setPosition(d * d * 2.2, -0.5 * G_FALL * d * d, -d * d * 1.2);
    return out;
  }
  function flyMatrix(f, Mb, t, out) {
    const tau = t - tBreak;
    const inA = smooth(invLerp(0, 0.34, tau)) * (1 - smooth(invLerp(0.34, 1.0, tau)));            // implosion draws everything inward for a beat
    const sOut = Math.max(0, tau - 0.34);
    const outD = f.out * 1.2 * (1 - Math.exp((-1.15 * sOut * sOut) / (sOut + 0.6)));
    const d = Math.max(0, tau - f.delay);
    const drop = 0.5 * f.g * d * d;
    const sRot = Math.max(0, tau - 0.3);
    const ang = f.w * (sRot * sRot) / (sRot + 0.7) * 1.6;
    _q.setFromAxisAngle(f.axis, ang);
    _v.copy(f.dir).multiplyScalar(outD - inA * 14);
    _v.y -= drop;
    groupMatrix(tau, out);
    out.multiply(_l2.makeTranslation(f.cen.x + _v.x, f.cen.y + _v.y, f.cen.z + _v.z));
    out.multiply(_r.makeRotationFromQuaternion(_q));
    out.multiply(_s.makeTranslation(-f.cen.x, -f.cen.y, -f.cen.z));
    out.multiply(Mb);
    return out;
  }

  // when the falling pieces touch the sea: for FX
  const splashes = [];
  for (const r of rings) r.clusters.forEach((list, k) => {
    const f = r.fly[k], Mb = breakAt[r.i];
    let hit = null;
    const tmp = new THREE.Matrix4(), v = new THREE.Vector3();
    for (let t = tBreak; t < 69 && !hit; t += 1 / 24) {
      flyMatrix(f, Mb, t, tmp);
      for (const c of list) {
        v.copy(r.chunks[c].c).applyMatrix4(tmp).add(center);
        if (v.y < SEA_Y) { hit = { t, x: v.x, z: v.z, ring: r.i, size: list.length * ((r.cfg.rO - r.cfg.rI) * 1.6) }; break; }
      }
    }
    if (hit) splashes.push(hit);
  });
  splashes.sort((a, b) => a.t - b.t);

  // ---- flakes thrown off the rings when they crack
  const shards = buildShards(ctx, (r2, t0) => {
    const r = rings[r2.int(0, 4)], a = r2.range(0, Math.PI * 2), rad = r2.range(r.cfg.rI, r.cfg.rO);
    const mm = ringMatrix(r.i, Math.min(t0, tBreak), new THREE.Matrix4());
    return new THREE.Vector3(Math.cos(a) * rad, Math.sin(a) * rad, 0).applyMatrix4(mm);
  }, C.pierce + 0.2, C.coreBreak + 0.5);
  root.add(shards.mesh);

  // ---- pose
  const pose = { core: new THREE.Vector3(), slitDir: new THREE.Vector3(0, 0, 1), qCore: new THREE.Quaternion() };
  function rootPos(t, out) {
    const b = M.bob(t);
    const shove = M.fireShove(t), aim = M.aimAt(t);
    return out.set(b[0] - aim.x * shove, b[1] - aim.y * shove, b[2] - aim.z * shove);
  }

  const _rp = new THREE.Vector3(), _mr = new THREE.Matrix4();
  const _rollQ = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), core.ROLL);
  function update(st) {
    const t = st.t;
    rootPos(t, _rp);
    root.position.copy(center).add(_rp);
    coreW.value.copy(root.position);
    // once the core is gone its embers stay at the heart of the falling mass and cool over the shot
    const tauB = t - tBreak;
    const after = tauB > 0 ? Math.exp(-tauB * 0.42) : 0;
    if (tauB > 0) {
      groupMatrix(tauB, _gmHeart);
      _v.setFromMatrixPosition(_gmHeart);
      coreW.value.add(_v);
      addWarLight({ a: coreW.value.toArray(), r: 950, c: [2.4 * after, 0.95 * after, 0.45 * after] });
    }

    const fullyAfterBreak = t >= tBreak;
    for (const r of rings) {
      const i = r.i, u = M.deploy[i](t);
      ringMatrix(i, t, _mr);
      const vis = i === 0 || t >= C.ignite;
      const s0 = i === 0 ? 1 : 0.42;
      const scale = i === 0 ? 1 : lerp(s0, 1, clamp(u));
      const Rfold = 247;
      for (const ch of r.chunks) {
        ch.mesh.visible = vis;
        if (!vis) continue;
        if (fullyAfterBreak) {
          const f = r.fly[ch.cluster];
          flyMatrix(f, breakAt[i], t, ch.mesh.matrix);
          ch.mesh.matrixWorldNeedsUpdate = true;
          continue;
        }
        // deploy: chunks start tucked inside the great ring, slide inward and grow. Gaps close as the iris closes.
        const k = (Rfold - r.R) * (1 - u);
        _l.makeTranslation(ch.dir.x * k, ch.dir.y * k, 0);
        if (scale !== 1) {
          _l.multiply(_s.makeTranslation(ch.c.x, ch.c.y, 0));
          _l.multiply(_m.makeScale(scale, scale, scale));
          _l.multiply(_s.makeTranslation(-ch.c.x, -ch.c.y, 0));
        }
        // crack-up before the implosion: chunks shudder apart by a few metres
        const cr = M.crack(i, t);
        if (cr > 0) {
          const sep = cr * (2 + (ch.cluster % 2) * 2) + 0.8 * cr * noise1(t * 30 + ch.mid * 7, i + 3);
          _l.premultiply(_s.makeTranslation(ch.dir.x * sep, ch.dir.y * sep, noise1(t * 26 + ch.mid * 5, i + 13) * cr * 1.2));
        }
        ch.mesh.matrix.multiplyMatrices(_mr, _l);
        ch.mesh.matrixWorldNeedsUpdate = true;
      }
      const u_ = r.mat.uniforms, charge = M.charge(t);
      u_.uCharge.value = charge * clamp(u);
      u_.uHeat.value = Math.max(charge, M.bloom(t) * 0.55) * clamp(u) * (1 - 0.62 * M.broken(t));
      u_.uDial.value = M.dial(i, t);
      u_.uCold.value = M.cold(t);
      u_.uRun.value = M.run(t);
      u_.uFlash.value = M.flash(t) * M.cold(t);
      u_.uCrack.value = M.crack(i, t);
      u_.uDead.value = M.dead(t);
      u_.uAfter.value = after;
    }

    // throne stands up at ignite, hinged at the rim of the great ring
    {
      const rise = smooth(invLerp(C.ignite + 0.05, C.ignite + 0.8, t));
      throne.visible = rise > 0.001;
      if (throne.visible) {
        const b = fullyAfterBreak ? flyMatrix(rings[0].fly[0], breakAt[0], t, _mr.clone()) : ringMatrix(0, t, _mr);
        const a = Math.PI / 2;
        _l.makeRotationZ(a - Math.PI / 2);
        _l.setPosition(Math.cos(a) * 258.5, Math.sin(a) * 258.5, 0);
        _l.multiply(_m.makeRotationX((1 - rise) * 1.45));
        _l.multiply(_s.makeScale(1, rise * 0.98 + 0.02, 1));
        throne.matrix.multiplyMatrices(b, _l);
        throne.matrixWorldNeedsUpdate = true;
      }
    }

    // ---- core
    const dead = t >= C.coreBreak + 0.18 || t < C.ignite;
    core.group.visible = !dead;
    if (!dead) {
      M.coreQ(t, pose.qCore);
      core.group.quaternion.copy(pose.qCore).multiply(_rollQ);
      // implosion: one swell, then collapse to nothing
      const sw = 1 + 0.12 * smooth(invLerp(C.coreBreak - 0.5, C.coreBreak - 0.06, t));
      const col = (1 - smooth(invLerp(C.coreBreak - 0.06, C.coreBreak + 0.16, t))) * smooth(invLerp(C.ignite, C.ignite + 0.55, t));
      core.group.scale.setScalar(Math.max(0.001, sw * col));
      const bloom = Math.max(M.bloom(t), 0), slit = M.slit(t);
      poseCore(core, bloom, slit);
      const u = core.mat.uniforms, ch = M.charge(t);
      u.uCharge.value = Math.min(1.2, ch);
      u.uHot.value = Math.max(bloom, slit, ch * 0.5);
      u.uDead.value = M.dead(t);
    }
    pose.slitDir.set(0, 0, 1).applyQuaternion(pose.qCore);

    // ---- thread
    {
      const u = thread.material.uniforms;
      const R = 74;
      u.uTop.value.copy(root.position).setY(root.position.y - R * 0.97);
      u.uBot.value.set(root.position.x, SEA_Y, root.position.z);
      u.uPxH.value = (2 * Math.tan(((ctx.camera.fov * Math.PI) / 180) / 2)) / 1080;
      u.uHeat.value = M.charge(t);
      u.uVis.value = t >= C.ignite + 0.3 && t < C.pierce + 0.4 ? 1 : 0;
      thread.visible = u.uVis.value > 0.5;
    }

    // ---- flare (hook), facing the ring's own plane
    {
      const a = M.flash(t) * M.cold(t) * (t < C.ignite ? 1 : 0);
      const fl = flare.material.uniforms;
      flare.visible = a > 0.01;
      if (flare.visible) {
        flare.position.copy(root.position);
        M.ringQ(t, qr);
        flare.quaternion.copy(qr);
        flare.scale.setScalar(232);
        fl.uI.value = a;
        fl.uFill.value = M.flashFill(t) * M.cold(t) * (t < C.ignite ? 1 : 0);
        fl.uDist.value = ctx.camera.position.distanceTo(root.position);
      }
    }

    shards.update(t, 1 - M.dead(t));

    // ---- shadows only in our own shots
    const mine = ['s03', 's10', 's12', 's18', 's19', 's26', 's27'].includes(st.sid);
    const idx = ctx.shadowRoots.indexOf(root);
    if (mine && idx < 0) ctx.shadowRoots.push(root);
    if (!mine && idx >= 0) ctx.shadowRoots.splice(idx, 1);
  }

  const v0 = new THREE.Vector3();
  const api = {
    root, update, splashes, clicks: M.clicks,
    // motion review only: root-space position of each chunk's centre at time t, without touching the scene
    samplePose(t) {
      const out = [], m = new THREE.Matrix4(), v = new THREE.Vector3(), mr = new THREE.Matrix4();
      for (const r of rings) {
        ringMatrix(r.i, Math.min(t, tBreak), mr);
        r.chunks.forEach((ch) => {
          if (t >= tBreak) flyMatrix(r.fly[ch.cluster], breakAt[r.i], t, m); else m.copy(mr);
          v.copy(ch.c).applyMatrix4(m); out.push(v.x, v.y, v.z);
        });
      }
      return out;
    },
    state(t) { return { alignment: M.alignment(t), charge: clamp(M.charge(t)), broken: M.broken(t) }; },
    // anchor(name, vec3[, t]): world position. Without t uses the last updated pose.
    anchor(name, out = new THREE.Vector3(), t) {
      const c = v0.copy(center).add(rootPos(t ?? (ctx.lastState?.t ?? 0), _v));
      const useT = t ?? (ctx.lastState?.t ?? 0);
      M.coreQ(useT, _q);
      const dir = _a.set(0, 0, 1).applyQuaternion(_q);
      if (name === 'core') return out.copy(c);
      if (name === 'slit') return out.copy(c).addScaledVector(dir, 74);
      if (name === 'coral') return out.copy(c).addScaledVector(dir, 78);
      if (name === 'threadSea') return out.set(c.x, SEA_Y, c.z);
      return out.copy(c);
    },
  };
  return api;
}
