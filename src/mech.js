import * as THREE from 'three';
import { mechMaterial, ML } from './mech-mat.js';
import { buildCannon } from './mech-cannon.js';
import { buildHeron, SK_H } from './mech-heron.js';
import { buildTortoise, SK_T } from './mech-tortoise.js';
import { buildScope } from './mech-scope.js';
import { buildFurrows } from './mech-furrow.js';
import { buildShieldSkin, buildShieldFrame, deformSkin, holeRadiusFn, GRIP_L, GRIP_R } from './mech-shield.js';
import { solveLimb, setWorldQ } from './mech-rig.js';
import * as A from './mech-anim.js';
import { BREECH, FRAME_Q, MUZZLE, PAD_Y, fromFrame, plan, levelQ, HERON_AT, TORTOISE_WAIT, AXIS, SLAM_T } from './mech-map.js';
import { CUES } from './shots.js';
import { addWarLight } from './glsl.js';
import { lerp, smooth, invLerp, clamp, noise1, onTwos, deg } from './util.js';

const _v = new THREE.Vector3(), _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3();
const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _e = new THREE.Euler();
const axisX = new THREE.Vector3(1, 0, 0), axisY = new THREE.Vector3(0, 1, 0);

export async function createMech(ctx) {
  const { scene, colliders } = ctx;
  const land = ctx.land;
  const groundW = (x, z) => { const g = land && land.groundY ? land.groundY(x, z) : PAD_Y; return g; };
  const groundAt = (x, z) => { const w = fromFrame(x, 0, z); return groundW(w.x, w.z) - w.y; };
  const padAt = (planV) => groundW(planV.x, planV.z);

  // -------------------------------------------------- cannon
  const cannonMat = mechMaterial({});
  const C = buildCannon(ctx, cannonMat, groundAt);
  C.root.position.copy(BREECH);
  C.root.quaternion.copy(FRAME_Q);
  scene.add(C.root);
  ctx.shadowRoots.push(C.root);
  colliders.push({ name: 'cannon', dept: 'mech', obj: C.j.bed, kind: 'solid' });
  colliders.push({ name: 'cannon-slide', dept: 'mech', obj: C.j.slide, kind: 'solid' });
  C.j.bed.traverse((o) => { o.userData.deptName = 'cannon'; });

  // -------------------------------------------------- heron
  const heronMat = mechMaterial({});
  cannonMat.uniforms.uLitGain.value = 1.75;
  const H = buildHeron(heronMat);
  scene.add(H.root);
  ctx.shadowRoots.push(H.root);
  const HJ = H.j;
  const gripRear = new THREE.Vector3(-12.3, -1.5, -6), gripFore = new THREE.Vector3(-12.3, 0.5, 9);
  const heronFootL = plan(HERON_AT.x + 4.0, HERON_AT.z + 11.5);
  const heronFootR = plan(HERON_AT.x - 4.2, HERON_AT.z - 15.4);
  for (const [i, n] of Object.keys(HJ).entries()) {
    void i;
    if (n === 'root') continue;
    const isLeg = /hip|knee|ank/.test(n);
    colliders.push({ name: 'heron-' + n, dept: 'mech', obj: HJ[n], kind: 'body', contact: ['cannon', 'cannon-slide'], noGround: isLeg || n === 'pelvis' });
  }

  // -------------------------------------------------- tortoise
  const tortMat = mechMaterial({});
  const T = buildTortoise(tortMat);
  scene.add(T.root);
  ctx.shadowRoots.push(T.root);
  const TJ = T.j;
  for (const n of Object.keys(TJ)) {
    if (n === 'root') continue;
    const isLeg = /hip|knee|ank/.test(n);
    colliders.push({ name: 'tortoise-' + n, dept: 'mech', obj: TJ[n], kind: 'body', contact: ['tortoise-shield'], noGround: isLeg || n === 'pelvis' });
  }
  tortMat.uniforms.uScorchC.value.set(0, 8, 8);

  // shield: skin + frame, under one joint that the hands track
  const shield = new THREE.Group(); shield.name = 'shield'; scene.add(shield); ctx.shadowRoots.push(shield);
  const skinMat = mechMaterial({ skin: true, hole: true });
  const frameMat = mechMaterial({ hole: true });
  const sk = buildShieldSkin();
  const skinMesh = new THREE.Mesh(sk.g, skinMat); skinMesh.frustumCulled = false;
  shield.add(skinMesh);
  tortMat.uniforms.uLitGain.value = 2.0; skinMat.uniforms.uLitGain.value = 2.6; frameMat.uniforms.uLitGain.value = 2.2;
  const SF = buildShieldFrame(frameMat);
  shield.add(SF.j.frame); shield.add(SF.j.grips);
  deformSkin(sk, -1, 0);
  colliders.push({ name: 'tortoise-shield', dept: 'mech', obj: skinMesh, kind: 'solid' });
  const holeR = holeRadiusFn(CUES.melt, CUES.shieldGone);
  for (const m of [skinMat, frameMat]) m.uniforms.uHoleC.value.set(0, 0);

  // furrows and craters in the rock under the Tortoise's feet
  const furrowMat = mechMaterial({});
  const stances = [0, 1].map((side) => { const f = A.footState(side, A.TT.slam - 0.06); return { x: f.x, z: f.z, q: levelQ }; });
  const FR = buildFurrows(groundW, stances, furrowMat);
  scene.add(FR.root); ctx.shadowRoots.push(FR.root);

  const SC = buildScope(ctx.overlay);
  // shared state for anchors and cameras (refreshed each update; every anchor is pure in st)
  let lastT = 0;

  function poseCannon(t) {
    C.j.slide.position.z = A.slideZ(t);
    C.j.slide.position.y = A.bedKick(t) * 0.5;
    C.j.bed.position.y = A.bedKick(t) * 0.18;
    C.j.grips.position.copy(C.j.slide.position);
    C.j.hammer.rotation.x = deg(A.hammerAngle(t));
    const ph = A.fanPhase(t);
    for (const f of C.fans) f.joint.rotation.x = ph * f.dir;
    const u = cannonMat.uniforms;
    u.uSeamFront.value = A.seamFront(t); u.uSeamK.value = A.seamK(t);
    u.uHeat.value = A.barrelHeat(t); u.uHeatFront.value = lerp(160, -10, A.chargeK(t));
    const ck = A.chargeK(t), hit = t >= A.FIRE2 ? Math.exp(-(t - A.FIRE2) * 2.4) : 0;
    u.uChargeK.value = ck;
    u.uRimC.value.setRGB(0.28, 0.6, 1.1).multiplyScalar(ck * (0.7 + 1.1 * hit));
    heronMat.uniforms.uChargeK.value = ck;
    heronMat.uniforms.uRimC.value.setRGB(0.36, 0.72, 1.3).multiplyScalar(ck * (0.75 + 0.6 * hit));
    C.counter.draw(A.powerPct(t));
    C.counter.mesh.visible = true;
  }

  function poseHeron(t) {
    const r = H.root;
    const lean = A.heronLean(t), slump = A.heronSlump(t), breath = A.heronBreath(t);
    const qk = A.quake(t);
    const n = (s) => noise1(t * 13, s) * qk;
    // pelvis rides the recoil with a lag, then sinks a little on the planted knee
    const hip = plan(HERON_AT.x + lean * 0.5 - 1.9 - slump * 1.1 + A.slideZ(t) * 0.075, HERON_AT.z + A.heronPelvisZ(t) + lean * 1.2 - slump * 1.6, PAD_Y, _a);
    r.position.set(hip.x + n(1) * 0.4, PAD_Y + 13.5 - lean * 0.7 - slump * 1.6 + breath * 0.16 - A.heronSink(t) + n(2) * 0.24, hip.z + n(3) * 0.4);
    _q.copy(levelQ).multiply(_q2.setFromAxisAngle(axisY, deg(lean * 5)));
    r.quaternion.copy(_q);
    r.updateMatrixWorld(true);
    // spine: leans forward, breathes, rides the recoil
    HJ.pelvis.rotation.set(deg(14 + lean * 5 + slump * 3), 0, deg(lean * 1.5 + slump * 6));
    HJ.waist.rotation.set(deg(4 + lean * 3 - A.heronChestZ(t) * -1.2 + breath * 0.8), 0, deg(lean * 1.2 + A.heronServo(2, t) * 0.7 - A.slideZ(t) * 0.72));   // the kick throws the torso off the breech
    HJ.chest.rotation.set(deg(4 + lean * 2 + breath * 1.7 - A.heronChestZ(t) * -2.0 + n(4) * 1.5), deg(lean * 1.5), deg(lean * -1.2));
    // head on a neck: looks along the barrel, drops a little at the end
    HJ.neck.rotation.set(deg(-8 + slump * 14), 0, deg(1.5 + slump * 5));
    const headQ = _q.copy(levelQ).multiply(_q2.setFromAxisAngle(axisX, deg(-1 + slump * 22 + A.heronHeadLag(t) * -1.4 + n(5) * 1.2)));
    headQ.multiply(_q2.setFromAxisAngle(axisY, deg(A.heronServo(0, t) * 1.6)));
    headQ.multiply(_q2.setFromAxisAngle(axisX, deg(A.heronServo(1, t) * 1.3)));
    setWorldQ(HJ.head, headQ);
    // legs: knee down, foot planted (nothing here may slide)
    const hipZ = 0;
    void hipZ;
    legIK(HJ.hipL, HJ.kneeL, HJ.ankL, SK_H, _b.copy(heronFootL).setY(padAt(heronFootL) + SK_H.ankleH), fwdFrom(heronFootL, 14), 0);
    // rear leg: knee on the rock, shin lying back, foot flat on its sole with the toes pointing behind
    const toe = _c.copy(heronFootR).setY(padAt(heronFootR) + SK_H.ankleH).addScaledVector(AXIS.z, -1.2 * slump);
    solveLimb(HJ.hipR, HJ.kneeR, SK_H.L1, SK_H.L2, toe, plan(HERON_AT.x - 4.2, HERON_AT.z + 8, PAD_Y - 16));
    _q.copy(levelQ).multiply(_q2.setFromAxisAngle(axisY, Math.PI));
    setWorldQ(HJ.ankR, _q);
    // arms: both hands stay on the cannon grips; the slide carries them back on recoil
    const sl = C.j.slide; sl.updateMatrixWorld(true);
    const gR = _v.copy(gripRear); sl.localToWorld(gR);
    gR.lerp(plan(HERON_AT.x - 12, HERON_AT.z + 3, PAD_Y + 5.5), A.heronReleaseR(t));
    gR.addScaledVector(AXIS.x, A.slideZ(t) * 0.06);
    armIK(HJ.shR, HJ.elR, HJ.wrR, SK_H, gR, plan(HERON_AT.x - 16, HERON_AT.z + 2, PAD_Y + 12));
    const gL = _v.copy(gripFore); sl.localToWorld(gL);
    gL.lerp(plan(HERON_AT.x - 2.5, HERON_AT.z + 13, PAD_Y + 10.5), A.heronReleaseL(t));
    gL.addScaledVector(AXIS.x, A.slideZ(t) * 0.06);   // the hand rides the grip's outer face through the recoil, clear of the sliding breech
    armIK(HJ.shL, HJ.elL, HJ.wrL, SK_H, gL, plan(HERON_AT.x - 4, HERON_AT.z + 8, PAD_Y + 26));
    heronMat.uniforms.uLens.value = (0.72 + 0.28 * Math.max(0, noise1(onTwos(t) * 2.2, 8))) * (1 + 0.5 * A.chargeK(t));
  }

  // ankle target -> hip/knee solve and a world foot orientation (pitch forward by footPitch)
  function legIK(hipJ, kneeJ, ankJ, S, target, pole, footPitch = 0) {
    solveLimb(hipJ, kneeJ, S.L1, S.L2, target, pole);
    _q.copy(levelQ).multiply(_q2.setFromAxisAngle(axisX, footPitch));
    setWorldQ(ankJ, _q);
  }
  function armIK(sh, el, wr, S, grip, pole, palmD = 4.0) {
    sh.updateWorldMatrix(true, false);
    const s = sh.getWorldPosition(new THREE.Vector3());
    const dir = _a.copy(s).sub(grip).normalize();
    const palm = grip.clone().addScaledVector(dir, palmD);
    solveLimb(sh, el, S.L1a, S.L2a, palm, pole);
  }
  const fwdFrom = (p, f, up = 0) => new THREE.Vector3().copy(p).setY(p.y + 8 + up).addScaledVector(AXIS.z, f);

  function poseTortoise(t) {
    const r = T.root, s = A.tortoiseState(t);
    const base = plan(s.x, s.z, PAD_Y + s.y, _a);
    r.position.copy(base);
    r.quaternion.copy(levelQ).multiply(_q2.setFromAxisAngle(AXIS.z, 0));
    r.updateMatrixWorld(true);
    TJ.pelvis.rotation.set(deg(s.pelvisPitch), 0, deg(s.roll * 0.6));
    TJ.waist.rotation.set(deg(s.chestPitch * 0.35), 0, deg(s.roll * 0.3));
    TJ.chest.rotation.set(deg(s.chestPitch * 0.65), 0, deg(s.roll * 0.4));
    TJ.head.rotation.set(deg(s.headPitch), 0, 0);
    // feet: planted on the rock, or following the plan during the leap and the shove
    for (const [side, L] of [[0, 'L'], [1, 'R']]) {
      const f = A.footState(side, t);
      const p = plan(f.x, f.z, PAD_Y + f.y);
      p.y = (land && land.groundY ? land.groundY(p.x, p.z) : PAD_Y) + f.y;
      const pole = new THREE.Vector3().copy(p).setY(p.y + 8).addScaledVector(AXIS.z, 14);
      legIK(TJ['hip' + L], TJ['knee' + L], TJ['ank' + L], SK_T, p, pole, f.pitch);
    }
    // shield
    const sp = A.shieldPose(t);
    const sh = plan(s.x + sp.x, s.z + sp.z + 2.2, PAD_Y + s.y + sp.y, _b);
    const visible = t < CUES.shieldGone + 0.3;
    shield.visible = visible;
    shield.position.copy(sh).addScaledVector(AXIS.y, s.str * noise1(t * 26, 21) * 0.08);
    shield.quaternion.copy(levelQ).multiply(_q2.setFromAxisAngle(axisY, deg(sp.yaw)));
    shield.quaternion.multiply(_q2.setFromAxisAngle(axisX, deg(sp.pitch)));
    shield.updateMatrixWorld(true);
    // melt: skin deforms (only when anything changed), hole in the shader
    const R = holeR(t);
    const ride = smooth(invLerp(SLAM_T, CUES.melt + 0.3, t));
    deformSkin(sk, R, ride);
    for (const m of [skinMat, frameMat]) m.uniforms.uHoleR.value = R;
    skinMesh.visible = visible;
    // arms: hold the shield handles, then cross in the beam, then drop as it collapses
    const cross = A.ARMS_CROSS(t), drop = A.ARMS_DROP(t);
    for (const [sgn, L, grip, crossT] of [[1, 'L', GRIP_L, [-5.0, 12, 15.2]], [-1, 'R', GRIP_R, [5.0, 16, 13.2]]]) {
      const g = grip.clone(); shield.localToWorld(g);
      const cw = crossT.slice(); const chest = TJ.chest.localToWorld(new THREE.Vector3(...cw));
      const dropAt = plan(s.x + sgn * 9.5, s.z + 13, PAD_Y + 4.2);
      dropAt.y = groundW(dropAt.x, dropAt.z) + 4.2;
      const tgt = g.lerp(chest, cross).lerp(dropAt, drop);
      const pole = chest.clone().addScaledVector(AXIS.x, sgn * 16).addScaledVector(AXIS.y, -8).addScaledVector(AXIS.z, -9);
      armIK(TJ['sh' + L], TJ['el' + L], TJ['wr' + L], SK_T, tgt, pole, 5.0 + 1.6 * A.kneelK(t));
    }
    // hatch: pivot opens up and back
    TJ.hatch.rotation.x = -A.hatchAngleFn(t);
    // lighting: heat of the melting bow on the chest
    tortMat.uniforms.uScorch.value = A.SCORCH(t);
  }

  function poseFurrows(t) {
    for (const F of FR.out) {
      const tLand = F.side ? A.TT.plant2 : A.TT.land;
      const a = t - tLand;
      const J = F.joints;
      J.crater.visible = a >= 0;
      if (a >= 0) { const u = Math.min(1, a / 0.14); J.crater.scale.set(0.55 + 0.45 * u, u, 0.55 + 0.45 * u); }
      const shv = Math.max(0, A.footShove(F.side, t));
      const rows = Math.min(F.counts.length - 1, Math.floor(shv / FR.STEP));
      J.f.visible = rows > 0;
      F.mesh.geometry.setDrawRange(0, F.counts[rows] * 3);
      const fs = A.footState(F.side, t);
      const grow = smooth(invLerp(0.3, 7, shv));
      J.mound.visible = shv > 0.3;
      const p = plan(fs.x, fs.z - 3.4);
      J.mound.position.set(p.x, groundW(p.x, p.z) + noise1(t * 15, 60 + F.side) * 0.1 * grow, p.z);
      J.mound.scale.set(0.5 + 0.5 * grow, grow, 0.45 + 0.55 * grow);
    }
  }

  function setLights(st) {
    const t = st.t;
    // Seam ignition in the hook: warm glow along the barrel
    const s = A.seamK(t);
    if (s > 0.01 && t < 8) addWarLight({ a: MUZZLE.toArray(), b: fromFrame(0, 0, A.seamFront(t)).toArray(), r: 120, c: [1.6 * s, 0.9 * s, 0.3 * s] });
    // Second charge: an ice-blue line up the barrel, lights the fins, the truss and the Heron's near side
    const ck = A.chargeK(t);
    const lx = st.sid === 's25' ? -30 : 0;    // s25 is seen from the moon-side flank: the line sits outboard so the near faces and the Heron catch it
    if (ck > 0.02) addWarLight({ a: fromFrame(lx, 8, -14).toArray(), b: fromFrame(lx, 8, Math.max(10, A.seamFront(t))).toArray(), r: lx ? 60 : 95, c: [0.42 * ck, 0.85 * ck, 1.6 * ck] });
    // Shield heat: bounces into the Tortoise and the barrel
    const R = holeR(t);
    if (R > 0 && t < CUES.shieldGone + 0.2) {
      const c = new THREE.Vector3(0, 0, -1).applyQuaternion(shield.quaternion).multiplyScalar(4).add(shield.position);
      addWarLight({ a: c.toArray(), r: 150, c: [2.2, 1.15, 0.6] });
    }
    // MECH-only cheats: rim of the muzzle tube is lit by the barrel heat
    ML.uLC.value[0].set(0, 0, 0); ML.uSegC.value[0].set(0, 0, 0);
  }

  const api = {
    cannon: C.root,
    heron: H.root,
    tortoise: T.root,
    shield,
    slamT: SLAM_T,
    hatchAngle: (t) => A.hatchAngleFn(t),
    holeRadius: (t) => Math.max(0, holeR(t)),
    shieldGoneT: CUES.shieldGone,
    update(st) {
      const t = st.t;
      const pt = onTwos(t);
      lastT = t;
      poseCannon(t);
      poseHeron(pt);
      T.root.visible = t >= 10;   // waits kneeling beside the gun from s06 on shield.visible = shield.visible && T.root.visible;
      FR.root.visible = T.root.visible;
      if (T.root.visible) { poseTortoise(pt); poseFurrows(pt); }
      cannonMat.uniforms.uSil.value = 0;
      heronMat.uniforms.uSil.value = 0;
      tortMat.uniforms.uSil.value = st.sid === 's24' ? 0.92 : (st.sid === 's21' ? 0.45 : 0);
      skinMat.uniforms.uSil.value = frameMat.uniforms.uSil.value = st.sid === 's21' ? 0.28 : 0;
      setLights(st);
      C.j.key.visible = st.sid !== 's01c' && st.sid !== 's08';
      // hook: the POWER plate rides the zoom, so it holds its place and size on screen while the ring grows
      const hud = C.j.hud;
      if (st.sid === 's01c') {
        const z = A.s01cZoom(t), tilt = (z - 1) / 0.5, lt = t - 2;
        const axisY = lerp(22.4, 23.05, tilt);
        hud.position.set(-4.6 / z, axisY + (19 - 22.4) / z, 69.95 + lt * 3);
        hud.scale.setScalar(1 / z);
      } else { hud.position.set(-4.6, 19, 69.95); hud.scale.setScalar(1); }
      // hook: frames 36-48 the gun is a black silhouette with the seams igniting; in s01c the same seams only smoulder
      heronMat.uniforms.uWarK.value = st.sid === 's25' ? 0.3 : 1;
      if (st.sid === 's06') cannonMat.uniforms.uRimC.value.setRGB(0.3, 0.44, 0.85);
      const dark = st.sid === 's01b' ? smooth(invLerp(1.38, 1.5, st.t)) : 0;
      cannonMat.uniforms.uDark.value = dark; heronMat.uniforms.uDark.value = dark; cannonMat.uniforms.uDarkRim.value = 1; heronMat.uniforms.uDarkRim.value = 0.7;
      if (st.sid === 's01c') cannonMat.uniforms.uSeamK.value *= 0.3;
      SC.mesh.visible = st.sid === 's08';
      if (SC.mesh.visible) { SC.u.uConv.value = smooth(invLerp(16.1, 17.5, t)); SC.u.uTurn.value = 0.12 * smooth(invLerp(16.0, 17.8, t)); }
    },
    anchor(name, v) {
      switch (name) {
        case 'muzzle': return v.copy(C.j.slide.localToWorld(_v.set(0, 0, 180)));
        case 'breech': return v.copy(C.j.slide.localToWorld(_v.set(0, 0, -14)));
        case 'shieldCenter': {
          if (lastT < CUES.shieldGone) return v.copy(shield.localToWorld(_v.set(0, 0, 8)));
          return v.copy(TJ.chest.localToWorld(_v.set(0, 12, 12)));
        }
        case 'hatch': return v.copy(TJ.hatch.localToWorld(_v.set(0, 0, 0)));
        case 'heronCockpit': return v.copy(HJ.chest.localToWorld(_v.set(0, 5.5, 4)));
        case 'scope': return v.copy(C.j.slide.localToWorld(_v.set(-11.4, 10.2, 13)));
        default: return v.copy(MUZZLE);
      }
    },
  };
  return api;
}
