// BLACKOUT, land department: the Terraces archipelago. Builds terrain, sea, the city, the power lines and the ridge.
import * as THREE from 'three';
import { landMap, MAP, YARD, shelfSd, VOLCANO } from './land-map.js';
import { terrainMaterial, houseMaterial, massMaterial, lanternMaterial, seaMaterial, steelMaterial, wireMat, LU } from './land-mat.js';
import { buildCity, buildMass, lanternGeometry } from './land-city.js';
import { buildPower, wireGeometry } from './land-power.js';
import { buildRocks, treeList, buildHarbour, makeConiferAtlas } from './land-props.js';
import { foliageMaterial } from './bgmaterials.js';
import { RIDGE, CANNON } from './layout.js';
import { onThrees, Rng } from './util.js';

const CUT = { x0: -3950, z0: 1280, x1: -2560, z1: 2860 };

// One non-uniform grid for the main land: 8 m over the city, growing outward.
function terrainGrid(M) {
  const xs = [], zs = [];
  const near = (a0, a1, s, far, lim) => { const out = []; for (let v = a0; v <= a1; v += s) out.push(v); let v = a1, st = s; while (v < lim) { st *= 1.12; v += Math.min(st, far); out.push(v); } v = a0; st = s; while (v > -lim) { st *= 1.12; v -= Math.min(st, far); out.push(v); } return out.sort((a, b) => a - b); };
  xs.push(...near(-1700, 2900, 8, 80, 6800));
  zs.push(...near(-2600, 3300, 8, 80, 7200));
  const W = xs.length, Hn = zs.length;
  const pos = new Float32Array(W * Hn * 3), idx = [];
  for (let j = 0; j < Hn; j++) for (let i = 0; i < W; i++) {
    const k = (j * W + i) * 3; pos[k] = xs[i]; pos[k + 1] = M.groundY(xs[i], zs[j]); pos[k + 2] = zs[j];
  }
  for (let j = 0; j < Hn - 1; j++) for (let i = 0; i < W - 1; i++) {
    const a = j * W + i, b = a + 1, c = a + W, d = c + 1;
    if (Math.max(pos[a * 3 + 1], pos[b * 3 + 1], pos[c * 3 + 1], pos[d * 3 + 1]) < -7) continue;
    idx.push(a, c, b, b, c, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(W * Hn * 2), 2));
  g.setIndex(new THREE.Uint32BufferAttribute(idx, 1));
  g.computeVertexNormals();
  return g;
}
// The 1.6 m ridge patch: the shelf and rock around the gun; holds up in medium shots.
function ridgePatch(M) {
  const STEPS = 1.6;
  const xs = [], zs = [];
  for (let x = CUT.x0; x <= CUT.x1; x += STEPS) xs.push(x);
  for (let z = CUT.z0; z <= CUT.z1; z += STEPS) zs.push(z);
  const W = xs.length, Hn = zs.length;
  const pos = new Float32Array(W * Hn * 3), idx = [];
  for (let j = 0; j < Hn; j++) for (let i = 0; i < W; i++) {
    const k = (j * W + i) * 3; pos[k] = xs[i]; pos[k + 1] = M.groundY(xs[i], zs[j]); pos[k + 2] = zs[j];
  }
  for (let j = 0; j < Hn - 1; j++) for (let i = 0; i < W - 1; i++) { const a = j * W + i, b = a + 1, c = a + W, d = c + 1; idx.push(a, c, b, b, c, d); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(W * Hn * 2), 2));
  g.setIndex(new THREE.Uint32BufferAttribute(idx, 1));
  g.computeVertexNormals();
  g.computeBoundingSphere();
  return g;
}

export async function buildLand(ctx) {
  const { scene, CUES } = ctx;
  const root = new THREE.Group(); root.name = 'land'; scene.add(root);
  const M = landMap();

  // baked world masks for every land shader
  const tex = new THREE.DataTexture(M.bakeTexelData(), MAP.n, MAP.n, THREE.RGBAFormat, THREE.FloatType);
  tex.minFilter = tex.magFilter = THREE.LinearFilter; tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping; tex.needsUpdate = true;
  LU.uMask.value = tex;
  LU.uRidgeCut.value.set(CUT.x0 + 1.6, CUT.z0 + 1.6, CUT.x1 - 1.6, CUT.z1 - 1.6);

  const add = (g, m, name) => { const me = new THREE.Mesh(g, m); me.frustumCulled = false; me.name = name; me.userData.noShadow = true; root.add(me); return me; };

  add(terrainGrid(M), terrainMaterial({}), 'land-ground');
  const ridgeGeo = ridgePatch(M);
  const ridgeMesh = add(ridgeGeo, terrainMaterial({ patch: 1 }), 'land-ridge');

  // the sea: a mirror drawn in the shader
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(26000, 26000, 1, 1).rotateX(-Math.PI / 2), seaMaterial());
  sea.frustumCulled = false; sea.name = 'land-sea'; sea.userData.noShadow = true; sea.position.y = 0;
  root.add(sea);

  // the city
  const city = buildCity(M);
  const hm = houseMaterial();
  add(city.near, hm, 'houses-near');
  add(city.far, hm, 'houses-far');
  add(buildMass(M), massMaterial(), 'city-mass');
  const harbourGeo = buildHarbour(M, city.lanterns);
  add(harbourGeo, steelMaterial({ id: 8 }), 'harbour');
  const lg = add(lanternGeometry(city.lanterns), lanternMaterial(), 'lanterns');
  void lg;

  // power lines, yard
  const power = buildPower(ctx, M);
  const steel = steelMaterial({ id: 6 });
  const pylonsMesh = add(power.geo, steel, 'pylons');
  const yardMesh = add(power.yardGeo, steelMaterial({ id: 7 }), 'yard');
  add(wireGeometry(power.wires), wireMat({ width: 1.3 }), 'wires');
  void pylonsMesh; void yardMesh;

  // rocks and trees on the ridge and the hills
  const rockMesh = add(buildRocks(M), terrainMaterial({ patch: 1, rock: 1 }), 'land-boulders');
  void rockMesh;
  {
    const list = treeList(M);
    const geo = new THREE.PlaneGeometry(1, 1);
    const pine = foliageMaterial(makeConiferAtlas(), { deep: '#0a1426', shade: '#16304a', mid: '#2c5258', light: '#5f8a80', blossom: '#5f8a80', blossom2: '#5f8a80' });
    const im = new THREE.InstancedMesh(geo, pine, list.length);
    const aVar = new Float32Array(list.length * 4);
    const Mx = new THREE.Matrix4();
    const hs = (a, b) => { const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return s - Math.floor(s); };
    list.forEach(([x, y, z, w, idx, hgt], i) => { Mx.makeScale(w, hgt, 1).setPosition(x, y, z); im.setMatrixAt(i, Mx); aVar.set([idx, (hs(x, z) - 0.5) * 0.3, hs(z, x), hs(x * 3, z) < 0.5 ? 1 : 0], i * 4); });
    geo.setAttribute('aVar', new THREE.InstancedBufferAttribute(aVar, 4));
    im.frustumCulled = false; im.userData.noShadow = true; im.name = 'trees'; root.add(im);
  }

  // collider for the ridge shelf and the hut ground (one closed solid, flat where the machines stand)
  const col = new THREE.Mesh(ridgeSolid(M), new THREE.MeshBasicMaterial());
  col.visible = false; col.name = 'col-ridge'; root.add(col);
  ctx.colliders.push({ name: 'ridge', dept: 'land', obj: col, kind: 'solid' });

  const anchors = {
    ridgeImpact: new THREE.Vector3(CANNON.muzzle[0] + 180, 610, CANNON.muzzle[2] - 110),
    farMountain: new THREE.Vector3(VOLCANO.x, VOLCANO.h, VOLCANO.z),
    bayPoint: new THREE.Vector3(0, 0, 300),
    yard: new THREE.Vector3(YARD.x, YARD.y + 10, YARD.z),
  };
  // eight rocket batteries on the hills facing the bay
  const batteries = [[-1560, 1560], [-1880, 1695], [-860, 1320], [-1040, 980], [-1120, 620], [-720, 1720], [-1260, 280], [-2170, 1815]];
  batteries.forEach(([x, z], i) => { anchors['battery' + i] = new THREE.Vector3(x, M.groundY(x, z) + 7, z); });
  power.coils.forEach((c, i) => { if (i < 6) anchors['yardCoil' + i] = c.clone(); });

  const land = {
    root, groundY: M.groundY, map: M,
    cables: { hook: power.runs.hook, surge: power.runs.surge, yard: power.runs.yard, north: power.runs.north },
    anchor(name, v = new THREE.Vector3()) { const a = anchors[name]; return a ? v.copy(a) : v.set(0, 0, 0); },
    update(st) {
      const t = st.t;
      LU.uLitT.value = onThrees(t);
      LU.uCamY.value = ctx.camera.position.y;
      // in the hook the dead city must be true black; in the story the moon reads on the roofs
      const inHook = t < 3.2 || t > 75;
      LU.uDeadMoon.value = inHook ? 0.05 : 0.6;
      LU.uRoofMoon.value = inHook ? 0.3 : 1;
      LU.uMoonGain.value = inHook ? 0.62 : 0.82;
      LU.uNotch.value = 0;       // the s01b tele shot through the rim was replaced by the south shore camera
      LU.uWireK.value = t >= 1 && t < 1.5 ? 2.4 : 1;
      LU.uCityNear.value = inHook ? 1500 : 640;
      LU.uCityFar.value = inHook ? 2100 : 900;
      LU.uSeaBright.value = inHook ? 1.5 : 1;
      const sky = ctx.world && ctx.world.sky ? ctx.world.sky.material.uniforms : null;
      if (sky) { sea.material.uniforms.uHorizon.value.copy(sky.uHorizonCool.value); }
    },
  };
  ctx.land = land;
  void CUES; void RIDGE; void Rng; void shelfSd; void ridgeMesh;
  return land;
}

// A closed solid over the shelf area for QA: top from groundY at 6 m, sides and bottom.
function ridgeSolid(M) {
  const x0 = -3600, x1 = -2820, z0 = 1780, z1 = 2420, s = 6;
  const xs = [], zs = [];
  for (let x = x0; x <= x1; x += s) xs.push(x);
  for (let z = z0; z <= z1; z += s) zs.push(z);
  const W = xs.length, Hn = zs.length;
  const pos = [], idx = [];
  for (let j = 0; j < Hn; j++) for (let i = 0; i < W; i++) pos.push(xs[i], M.groundY(xs[i], zs[j]), zs[j]);
  const bot = pos.length / 3;
  for (let j = 0; j < Hn; j++) for (let i = 0; i < W; i++) pos.push(xs[i], 200, zs[j]);
  const at = (i, j, b = 0) => j * W + i + b * bot;
  for (let j = 0; j < Hn - 1; j++) for (let i = 0; i < W - 1; i++) {
    idx.push(at(i, j), at(i, j + 1), at(i + 1, j), at(i + 1, j), at(i, j + 1), at(i + 1, j + 1));
    idx.push(at(i, j, 1), at(i + 1, j, 1), at(i, j + 1, 1), at(i + 1, j, 1), at(i + 1, j + 1, 1), at(i, j + 1, 1));
  }
  for (let i = 0; i < W - 1; i++) { for (const j of [0, Hn - 1]) { const fl = j === 0; const a = at(i, j), b = at(i + 1, j), c = at(i, j, 1), d = at(i + 1, j, 1); if (fl) idx.push(a, b, c, b, d, c); else idx.push(a, c, b, b, c, d); } }
  for (let j = 0; j < Hn - 1; j++) { for (const i of [0, W - 1]) { const fl = i === 0; const a = at(i, j), b = at(i, j + 1), c = at(i, j, 1), d = at(i, j + 1, 1); if (fl) idx.push(a, c, b, b, c, d); else idx.push(a, b, c, b, d, c); } }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  g.computeBoundingSphere();
  return g;
}
