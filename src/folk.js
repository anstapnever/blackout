import * as THREE from 'three';
import { buildCritter } from './folk-rig.js';
import { OTTER, SNOWLEOPARD, CHIEF, CREW } from './folk-species.js';
import { SET, DECK, buildCockpitA, buildCockpitB, buildHut, buildDeck, buildWindow, needleA, deckY } from './folk-sets.js';
import { createPerformances } from './folk-act.js';
import { lightFor, lampK } from './folk-lights.js';
import { glowMaterial } from './folk-mat.js';
import { bakeSpring } from './motion.js';
import { onTwos, onThrees, noise1, smooth, invLerp, lerp, clamp } from './util.js';

// FOLK department: the people inside the machines. Two cockpits, the breaker hut, the scorched hatch, the paper window.
// Every set lives high above the map and is visible only in its own shots. All state is a pure function of st.t.
const _a = new THREE.Vector3(), _b = new THREE.Vector3();
const needleU = {
  // the charge gauge: full before the first shot, dead after it, creeping back up through the second charge
  charge(t, C) {
    if (t < C.fire1) return lerp(0.72, 0.98, smooth(invLerp(10, 28, t)));
    if (t < C.recharge + 0.75) return lerp(0.98, 0.0, smooth(invLerp(C.muzzle, C.muzzle + 0.4, t)));
    if (t < C.recharge + 1.05) return 0.0;
    return 0.02 + 0.05 * smooth(invLerp(C.recharge + 1.05, C.recharge + 1.8, t)) + 0.85 * smooth(invLerp(C.recharge + 1.8, C.fire2, t));   // a visible first tick off the peg, then the long climb
  },
};
export async function createFolk(ctx) {
  const { scene, CUES } = ctx;
  const group = new THREE.Group(); group.name = 'folk'; scene.add(group);
  const A = buildCockpitA(ctx, group), B = buildCockpitB(ctx, group), hut = buildHut(ctx, group), deck = buildDeck(ctx, group), win = buildWindow(ctx, group);
  const boy = buildCritter(OTTER), girl = buildCritter(SNOWLEOPARD), chief = buildCritter(CHIEF);
  const crew = CREW.map((s) => buildCritter(s));
  for (const r of [boy, girl, chief, ...crew]) { group.add(r.root); ctx.shadowRoots.push(r.root); r.root.visible = false; }

  const sweat = new THREE.Mesh(new THREE.SphereGeometry(1, 14, 12).setAttribute('aCol', new THREE.BufferAttribute(new Float32Array(4 * 3 * 240).fill(1), 3)), glowMaterial({ color: '#dbe7ee', k: 0.6, id: 124 })); sweat.name = 'sweat'; sweat.visible = false; boy.head.add(sweat);
  const SETS = { A, B, hut, deck, win };
  const perf = createPerformances(ctx, { boy, girl, chief, crew }, SETS);
  const F = perf.fns;

  // QA: every rigid part; contact = what that creature may press into (3 cm allowance: paws on grips, seat under the hips)
  const reg = (rig, contact) => { for (const m of rig.parts) ctx.colliders.push({ name: `${rig.name}_${m.name}`, dept: 'folk', obj: m, kind: 'body', contact }); };
  reg(boy, ['cockpitA_seat', 'cockpitA_floor', 'cockpitA_grip', 'cockpitA_throttle', 'deckShell', 'deckCollar', 'latchBar', 'hatchCover', 'cockpitB_collar']);
  reg(girl, ['cockpitB_seat', 'cockpitB_floor', 'cockpitB_levers']);
  reg(chief, ['hut_floor', 'hut_lever']);
  for (const r of crew) reg(r, ['hut_floor', 'hut_console']);

  // the bulb swings on its cord, kicked when the master lever hits home
  const bulbA = bakeSpring((t) => (t < F.T5 + 1.44 ? 0.05 : 0.4 * Math.exp(-(t - F.T5 - 1.44) * 9)), F.T5 + 3, { freq: 0.8, damp: 0.09, tStart: F.T5 - 2, x0: 0.08 });
  const HW = SET.HUT, CH = [2.75, 2.9, -0.7], CL = 0.72;

  const showRig = (r, P) => { if (P) { r.setPose(P); r.root.visible = true; } else r.root.visible = false; };
  const shots = {
    cockpitA: new Set(['s07', 's13', 's17', 's22']), cockpitB: new Set(['s11', 's23', 's30']), hut: new Set(['s05']), deck: new Set(['s29']), win: new Set(['s02', 's32']),
  };
  const tick = (o, on) => { o.root.visible = on; };

  function updateA(st) {
    const t = st.t, q = onTwos(t), C = CUES;
    A.root.traverse((o) => { if (o.name === 'cockpitA_brass' && o.material.uniforms && o.material.uniforms.uGloss) { o.userData.g0 ??= o.material.uniforms.uGloss.value; o.material.uniforms.uGloss.value = st.sid === 's22' ? 0 : o.userData.g0; } });
    { const showG = st.sid !== 's22'; A.gaugeNeedle.visible = showG; A.gaugeNeedle.userData.face.visible = showG; }   // edge-on beside the s22 lens it reads as a blade
    A.gaugeNeedle.rotation.z = needleA(needleU.charge(q, C) + 0.004 * noise1(q * 18, 3));
    A.needles.forEach((n, i) => { n.rotation.z = needleA(0.42 + 0.06 * i + 0.03 * noise1(q * (3 + i), 20 + i) + (st.sid === 's17' ? 0.4 * Math.exp(-(t - 36.56) * 2) * Math.sin(t * 40 + i) : 0)); });
    // the hammer: cocked at the top, thrown down by the trigger, re-cocked for the second shot
    const fired = t > C.fire1 + 0.05, recock = smooth(invLerp(C.fire1 + 0.8, C.fire1 + 1.6, t));
    const fall = fired ? 1 - recock : smooth(invLerp(C.fire1 - 0.02, C.fire1 + 0.05, t));
    const bounce = (t > C.fire1 + 0.05 && t < C.fire1 + 0.5) ? 0.12 * Math.exp(-(t - C.fire1 - 0.05) * 12) * Math.abs(Math.sin((t - C.fire1) * 36)) : 0;
    A.hammer.rotation.x = -1.05 * (1 - fall) + 0.2 + bounce;
    const pull = st.sid === 's13' ? 0.68 * smooth(invLerp(28.0, C.fire1 - 0.04, onTwos(t))) + 0.32 * smooth(invLerp(C.fire1 - 0.02, C.fire1 + 0.07, onTwos(t))) : 0;   // slow take-up from f672, then the break
    A.trigger.rotation.x = 0.32 * pull;
    // scope glass and alarm lamps: these drive the light table, so they follow it
    const rg = A.glowScope.uniforms;
    const stab = st.sid === 's22' ? Math.min(0.7, Math.max(0, noise1(onThrees(t) * 6.3, 13) - 0.12) * 2.6) : 0;
    rg.uK.value = st.sid === 's13' && t > C.fire1 ? lerp(2.2, 5, Math.exp(-(t - C.fire1) * 4)) : 2.2 + stab * 1.2;
    A.lampsR.uniforms.uK.value = (st.sid === 's17' || st.sid === 's22') ? (Math.floor(onThrees(t) * 3.4) % 2 ? 2.6 : 0.3) : 0;
    A.lampsA.uniforms.uK.value = (st.sid === 's17' || st.sid === 's22') ? 0.2 : 1.5;
    A.gaugeGlow.uniforms.uK.value = st.sid === 's17' ? (Math.floor(onThrees(t) * 5) % 2 ? 3 : 0.4) : 0.3;
    // stars on the scope after the squeeze
    A.stars.visible = st.sid === 's13' && st.lt > 1.18;
    if (A.stars.visible) for (const s of A.starsList) { const a = st.lt - 1.18 - s.delay, k = a < 0 ? 0 : Math.min(1, a / 0.08) * (1 + 0.15 * noise1(t * 40, s.delay * 90)); s.m.visible = a > 0; s.m.scale.setScalar(k); }
    // harness: from the top of the seat over each shoulder down to the buckle; a lap belt over the hips
    const c = boy.chest, h = boy.hips, w = (o, x, y, z) => o.localToWorld(_a.set(x, y, z)).clone();
    const sw = (x, y, z) => _b.set(SET.A[0] + x, SET.A[1] + y, SET.A[2] + z).clone();
    A.straps[0].setEnds(sw(0.1, 1.13, -0.27), w(c, 0.08, 0.0, 0.115));
    A.straps[1].setEnds(sw(-0.1, 1.13, -0.27), w(c, -0.08, 0.0, 0.115));
    A.straps[2].setEnds(sw(0.26, 0.42, -0.12), w(h, 0.02, -0.0, 0.13));
    A.straps[3].setEnds(sw(-0.26, 0.42, -0.12), w(h, -0.02, -0.0, 0.13));
  }
  function updateB(st) {
    const t = st.t, q = onTwos(t);
    const white = st.sid === 's23' ? (3.6 + 0.8 * noise1(onThrees(t) * 8, 5)) : st.sid === 's11' ? 0.05 : 0.02;
    B.seamMat.uniforms.uK.value = white;
    B.lampsA.uniforms.uK.value = st.sid === 's23' ? 0.1 : 1.2;
    B.needles.forEach((n, i) => { n.rotation.z = needleA(st.sid === 's23' ? 0.92 + 0.05 * noise1(q * 26, i) : 0.3 + 0.1 * i); });
    B.coverOpen.visible = st.sid === 's30';
    const c = girl.chest, w = (o, x, y, z) => o.localToWorld(_a.set(x, y, z)).clone();
    const sw = (x, y, z) => _b.set(SET.B[0] + x, SET.B[1] + y, SET.B[2] + z).clone();
    B.straps[0].setEnds(sw(0.14, 1.13, -0.42), w(c, 0.08, 0.02, 0.12));
    B.straps[1].setEnds(sw(-0.14, 1.13, -0.42), w(c, -0.08, 0.02, 0.12));
  }
  function updateHut(st) {
    const t = st.t, q = onTwos(t), u = q - F.T5;
    hut.setBreakers(t, F.breakerT);
    hut.lever.rotation.x = -F.ang5(u);
    const a = bulbA(t), p0 = _a.set(HW[0] + CH[0], HW[1] + CH[1], HW[2] + CH[2]).clone(), p1 = _b.set(p0.x + Math.sin(a) * CL, p0.y - Math.cos(a) * CL, p0.z + Math.sin(a * 0.6) * CL * 0.3).clone();
    hut.cord.setEnds(p0, p1);
    hut.bulb.position.set(p1.x - HW[0], p1.y - HW[1], p1.z - HW[2]); hut.bulb.position.y -= 0.05;
    hut.cage.position.copy(hut.bulb.position);
    // bulb, cage and cord are parented to the set; the cord takes set-local ends
    hut.cord.position.sub(_a.set(...HW));
    st.bulbP = [p1.x, p1.y - 0.05, p1.z]; st.bulbX = Math.sin(a);
    hut.bulbM.uniforms.uK.value = 3.0 * (u > 1.44 && u < 1.5 ? 0.3 : 1);
  }
  function updateDeck(st) {
    const t = st.t, q = onTwos(t), u = q - F.TH0;
    deck.lever.rotation.x = F.barAngle(u);
    deck.hinge.rotation.x = -F.coverA(u);
    const open = smooth(invLerp(2.5, 2.62, u));
    const leak = u < 2.5 ? F.coverResist(u) / 0.13 : 1;
    deck.holeM.uniforms.uK.value = (0.9 * leak + 3.2 * open) * (1 + 0.1 * noise1(onThrees(t) * 7, 2));
    const skL = clamp((u - 2.1) / 0.16, 0, 1), skR = clamp((u - 2.14) / 0.16, 0, 1), mu0 = deck.mat.uniforms;
    mu0.uSkK.value = skL > 0 ? 1 - 0.75 * smooth(invLerp(2.32, 2.7, u)) : 0;
    mu0.uSkL.value.set(-0.1, 1.06, -0.1 + 0.01 * skL, 1.06 - 0.14 * skL);
    mu0.uSkR.value.set(0.18, 1.34, 0.18, 1.34 - 0.16 * skR);
    deck.mat.uniforms.uSpill.value = (0.3 * leak * (1 - open) + 1.15 * open) * (1 + 0.12 * noise1(onThrees(t) * 5, 9));
    deck.mat.uniforms.uHeat.value = (0.75 + 0.25 * noise1(onThrees(t) * 3, 1)) * (1 - 0.35 * open);
    // sparks off the heels: thrown back from each scrape, on threes, falling back to the plates
    const fr = (x) => x - Math.floor(x), tq0 = onThrees(t) - F.TH0;
    deck.sparks.forEach((m, i) => {
      const left = i % 2 === 0, t0 = (left ? 2.1 : 2.14) + (i >> 1) * 0.024, a = tq0 - t0, r1 = fr(Math.sin(i * 12.9898) * 43758.5), r2 = fr(Math.sin(i * 78.233) * 12543.7), r3 = fr(Math.sin(i * 39.1) * 9811.3);
      const on = a >= 0 && a <= 0.3; m.visible = on; if (!on) return;
      const k = clamp((t0 - (left ? 2.1 : 2.14)) / 0.16, 0, 1), hx = left ? -0.1 : 0.18, hz = left ? 1.06 - 0.14 * k : 1.34 - 0.16 * k;
      const vx = (r1 - 0.5) * 1.1, vy = 0.75 + 0.8 * r2, vz = 0.8 + 1.0 * r3, x = hx + vx * a, z = hz + vz * a, y = 0.02 + vy * a - 3.6 * a * a;
      m.visible = y > 0.005; m.position.set(x, deckY(x, z) + y, z);
      _a.set(vx, vy - 7.2 * a, vz).normalize(); m.quaternion.setFromUnitVectors(_b.set(0, 0, 1), _a);
    });
    // smoke: slow big forms leaking from the seam, then one fat column when the cover goes
    const tq = onThrees(t);
    for (let i = 0; i < deck.puffs.length; i++) {
      const p = deck.puffs[i], late = i >= 6, born = late ? F.TH0 + 2.5 + (i - 6) * 0.12 : F.TH0 - 2.2 + p.t0 * 2.5, a = tq - born, life = late ? 1.9 : 3.3;
      const rise = late ? p.v * 1.05 : p.v * 0.45;
      if (a < 0 || a > life) { p.m.visible = false; continue; }
      const ax = late ? 0 : Math.sin(p.a) * (DECK.rCollar + 0.02), az = late ? 0 : Math.cos(p.a) * (DECK.rCollar + 0.02);
      const k = a / life;
      p.m.visible = true;
      p.m.position.set(ax + Math.sin(a * p.sw + p.a) * 0.18 * a, 0.1 + rise * a * (1 - k * 0.25), az + Math.cos(a * p.sw * 0.8) * 0.18 * a + 0.1 * a);
      const s = p.s * (late ? 0.78 : 0.42) * (0.35 + 1.4 * Math.sqrt(k)) * (1 - Math.pow(k, 5));
      p.m.scale.set(s * 1.9, s * 1.9, 1); p.m.quaternion.copy(ctx.camera.quaternion); p.m.rotateZ(p.a * 0.3 + a * 0.2);
      const mu = p.m.material.uniforms; mu.uHot.value = (late ? 0.8 : 0.25) * (1 - k); mu.uFade.value = 1 - Math.pow(k, 3);
    }
  }
  function updateWin(st) {
    const u = win.mat.uniforms, c = F.lampChild(st.t);
    u.uHead.value = c.head; u.uSway.value = c.sway; u.uHand.value = c.hand; u.uBreath.value = c.breath; u.uWave.value = c.wave ?? 0;
    u.uLamp.value = lampK(st.t); u.uRingK.value = st.sid === 's32' ? 0 : 1;   // the ring is gone from the glass at the end
  }

  const api = {
    group, sets: SETS, boy: { root: boy.root, anchor: boy.anchor, rig: boy }, girl: { root: girl.root, anchor: girl.anchor, rig: girl }, chief: { root: chief.root, anchor: chief.anchor, rig: chief }, crew,
    perf,
    update(st) {
      const id = st.sid;
      const on = { A: shots.cockpitA.has(id), B: shots.cockpitB.has(id), hut: shots.hut.has(id), deck: shots.deck.has(id), win: shots.win.has(id) };
      tick(A, on.A); tick(B, on.B); tick(hut, on.hut); tick(deck, on.deck); tick(win, on.win);
      const p = perf.poseFor(st);
      showRig(boy, p.boy); showRig(girl, p.girl); showRig(chief, p.chief);
      {
        // one drop of sweat creeping down the temple, a little faster each time it meets a whisker line
        const u = p.boy && p.boy.face ? p.boy.face.sweat : undefined;
        sweat.visible = u != null && u > 0 && u < 0.98 && id !== 's29';
        if (sweat.visible) {
          const e = Math.pow(u, 1.5), g = smooth(invLerp(0, 0.12, u));
          sweat.position.set(0.122 + 0.008 * e, 0.128 - 0.05 * e, 0.078 + 0.004 * e);
          const w = 0.0046 + 0.0008 * e;
          sweat.scale.set(w * g, w * g * (1.5 + 0.3 * e), w * g);
        }
      }
      crew.forEach((r, i) => showRig(r, p.crew && p.crew[i]));
      if (on.A) updateA(st);
      if (on.B) updateB(st);
      if (on.hut) updateHut(st);
      if (on.deck) updateDeck(st);
      if (on.win) updateWin(st);
      lightFor(st);
    },
  };
  ctx.folk = api;
  return api;
}
