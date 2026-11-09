// BLACKOUT, land department: the shape of the Terraces archipelago. Pure functions of (x, z), baked once.
// Coast polygons + analytic hills give a signed coast distance and a height; the terrace steps, the city density
// and the farmland masks all read from them. Same numbers in JS (groundY, placing houses) and GLSL (a baked texture).
import { RIDGE } from './layout.js';

export const MAP = { size: 8200, n: 1025 };          // baked grid: -size..size, 16 m a texel
export const STEP = 4.2;                             // one terrace riser, metres
export const ROW = 21;                               // house row spacing on a wide tread
export const SKEW = -0.3;                            // the blackout border runs diagonally: w = z + SKEW * x
// The front key fed to litAt(): the near city (beyond W0) is stretched so the wave crosses it in the first second, the far country is compressed.
export const FRONT = { A: 5.2, B: -2519, W0: 369, FAR: 0.6 };
export const frontKey = (w) => (w > FRONT.W0 ? FRONT.A * w + FRONT.B : FRONT.A * FRONT.W0 + FRONT.B + FRONT.FAR * (w - FRONT.W0));
export const CELL = 128;                             // one city block (the unit that dies in one drawing)

const sst = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const clamp01 = (x) => Math.min(1, Math.max(0, x));
const hsh = (x, y) => { const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return s - Math.floor(s); };
export function vn(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hsh(xi, yi), b = hsh(xi + 1, yi), c = hsh(xi, yi + 1), d = hsh(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
export function fbm(x, y, o = 4) { let s = 0, a = 0.5, n = 0; for (let i = 0; i < o; i++) { s += a * vn(x, y); n += a; x = x * 2.03 + 1.7; y = y * 2.03 + 9.2; a *= 0.5; } return s / n; }
export function ridged(x, y, o = 5) { let s = 0, a = 0.5, n = 0; for (let i = 0; i < o; i++) { s += a * (1 - Math.abs(vn(x, y) * 2 - 1)); n += a; x = x * 2.1 + 3.1; y = y * 2.1 + 5.7; a *= 0.5; } return s / n; }

// ---------------------------------------------------------------- the islands (clockwise, x z)
// Main island with the bay cut into its south side, opening toward +Z.
export const MAIN = [
  [-760, 1950], [-1090, 1560], [-1210, 1060], [-1270, 520], [-1600, 120], [-1980, -320], [-2240, -940], [-2200, -1900],
  [-2600, -3400], [-2500, -5200], [-3200, -7600], [3800, -7600], [5400, -5200], [5100, -2600], [4400, -800], [3700, 900], [3060, 1900], [2360, 2620], [1560, 3000], [950, 2960],
  [720, 2520], [640, 1880], [610, 1260], [520, 660], [360, 150], [130, -120], [-140, -130], [-370, 130], [-520, 640], [-595, 1220], [-630, 1680],
];
// The ridge island west of the strait: gun on a shelf high on its east side.
export const RIDGE_ISLE = [
  [-2460, -1160], [-2310, 280], [-2360, 1180], [-2500, 2300], [-2720, 3120], [-3340, 3920], [-4320, 4300], [-5300, 3100], [-5500, 820], [-5120, -1040], [-4040, -1760], [-3040, -1640],
];
// Rock islets carrying the hook power line across the strait, and scattered islands to make it an archipelago.
export const ISLETS = [
  [-1560, 1560, 92], [-1880, 1695, 74], [-2170, 1815, 86],
  [-1780, 760, 120], [-1950, 2700, 210], [-1200, 3050, 260], [260, 3700, 340], [2750, 3650, 420], [4900, 2100, 560], [-6000, 4200, 800], [5400, 3700, 620], [-1300, 4700, 520], [1500, 5200, 700],
];
// Canals: narrow channels from the bay into the low city.
export const CANALS = [
  { a: [-120, -60], b: [-250, -760], w: 15 }, { a: [300, 60], b: [540, -540], w: 13 },
  { a: [560, 980], b: [1160, 880], w: 14 }, { a: [600, 1560], b: [1320, 1680], w: 14 }, { a: [-555, 820], b: [-1010, 720], w: 12 },
];
const segDist = (px, pz, ax, az, bx, bz) => {
  const dx = bx - ax, dz = bz - az, l = dx * dx + dz * dz || 1;
  const t = clamp01(((px - ax) * dx + (pz - az) * dz) / l);
  return Math.hypot(px - ax - t * dx, pz - az - t * dz);
};
function polyDist(px, pz, P) {
  let d = 1e12, inside = false;
  for (let i = 0, n = P.length, j = n - 1; i < n; j = i++) {
    const [ax, az] = P[j], [bx, bz] = P[i];
    d = Math.min(d, segDist(px, pz, ax, az, bx, bz));
    if ((az > pz) !== (bz > pz) && px < ((bx - ax) * (pz - az)) / (bz - az) + ax) inside = !inside;
  }
  return inside ? d : -d;
}

// ---------------------------------------------------------------- the gun's shelf: exactly y = 640
const [FX, , FZ] = RIDGE.firing;
const SHELF = { cx: FX + 92, cz: FZ - 60, ax: 0.8743, az: -0.4854, la: 345, lb: 235 };
export function shelfSd(x, z) {
  const dx = x - SHELF.cx, dz = z - SHELF.cz;
  const a = Math.abs(dx * SHELF.ax + dz * SHELF.az) - SHELF.la, b = Math.abs(-dx * SHELF.az + dz * SHELF.ax) - SHELF.lb;
  return Math.hypot(Math.max(a, 0), Math.max(b, 0)) + Math.min(Math.max(a, b), 0);
}
export const VOLCANO = { x: 3300, z: -1800, h: 1460 };
export const YARD = { x: -2625, z: 1905, y: 0, w: 150, d: 100, ry: 0.5 };      // y filled in by bake

function heightMain(x, z, c) {
  if (c <= 0) return Math.max(-40, c * 0.14);
  const lip = 3.4 * sst(0, 9, c);
  let h = lip + 150 * (1 - Math.exp(-c / 720)) + c * 0.02;
  const n1 = fbm(x * 0.0011 + 3, z * 0.0011 + 8, 4);
  h += (n1 - 0.42) * 300 * sst(160, 1500, c);
  const nz = sst(-1000, -4600, z);
  if (nz > 0) h += nz * (280 + 1300 * Math.pow(ridged(x * 0.00046 + 2, z * 0.00046 + 9, 5), 1.7));
  h += sst(-1400, -3600, z) * 90 * (ridged(x * 0.0017, z * 0.0017, 4) - 0.4);
  const dv = Math.hypot(x - VOLCANO.x, z - VOLCANO.z);
  if (dv < 5200) h = Math.max(h, VOLCANO.h * Math.exp(-Math.pow(dv / 1320, 1.22)) * (0.93 + 0.14 * ridged(x * 0.0014, z * 0.0014, 4)));
  return h;
}
function heightRidge(x, z, c) {
  if (c <= 0) return Math.max(-40, c * 0.22);
  // a black basalt wall at the sea, then the long shoulder up to the spine
  const cliff = 34 * (1 - Math.exp(-c / 14));
  let h = cliff + 860 * Math.pow(1 - Math.exp(-c / 520), 1.25);
  const n = ridged(x * 0.0021 + 7, z * 0.0021 + 1, 5), m = fbm(x * 0.0007 + 4, z * 0.0007 + 3, 3);
  h += ((n - 0.5) * 170 + (m - 0.5) * 160) * sst(40, 520, c);
  return h;
}

let M = null;
export function landMap() {
  if (M) return M;
  const { size, n } = MAP;
  const dx = (2 * size) / (n - 1);
  const C = new Float32Array(n * n), H0 = new Float32Array(n * n), IS = new Uint8Array(n * n);
  for (let j = 0; j < n; j++) {
    const z = -size + j * dx;
    for (let i = 0; i < n; i++) {
      const x = -size + i * dx;
      // the coast is warped so the polygon's straight runs read as natural shore (keeping the bay where the map says)
      const wa = 70 * (fbm(x * 0.0019 + 11, z * 0.0019 + 2, 3) - 0.5), wb = 70 * (fbm(x * 0.0019 + 5, z * 0.0019 + 17, 3) - 0.5);
      const fine = (fbm(x * 0.013 + 1, z * 0.013 + 6, 3) - 0.5) * 18;
      const wx = x + wa, wz = z + wb;
      let cm = polyDist(wx, wz, MAIN);
      for (const k of CANALS) cm = Math.min(cm, segDist(wx, wz, k.a[0], k.a[1], k.b[0], k.b[1]) - k.w);
      const cr = polyDist(wx, wz, RIDGE_ISLE);
      let is = 0, c = cm, h;
      if (cr > c) { c = cr; is = 1; }
      for (const [ix, iz, ir] of ISLETS) {
        const ci = ir - Math.hypot(wx - ix, wz - iz);
        if (ci > c) { c = ci; is = 2; }
      }
      c += fine;
      if (is === 1) h = heightRidge(x, z, c);
      else if (is === 2) h = c <= 0 ? Math.max(-30, c * 0.2) : 24 * (1 - Math.exp(-c / 16)) + c * 0.26 * (0.7 + 0.8 * fbm(x * 0.01, z * 0.01, 3));
      else h = heightMain(x, z, c);
      C[j * n + i] = c; H0[j * n + i] = h; IS[j * n + i] = is;
    }
  }
  const bil = (arr, x, z) => {
    const u = clamp01((x + size) / (2 * size)) * (n - 1), v = clamp01((z + size) / (2 * size)) * (n - 1);
    const i = Math.min(n - 2, Math.floor(u)), j = Math.min(n - 2, Math.floor(v)), f = u - i, g = v - j;
    return arr[j * n + i] * (1 - f) * (1 - g) + arr[j * n + i + 1] * f * (1 - g) + arr[(j + 1) * n + i] * (1 - f) * g + arr[(j + 1) * n + i + 1] * f * g;
  };
  const near = (arr, x, z) => {
    const u = clamp01((x + size) / (2 * size)) * (n - 1), v = clamp01((z + size) / (2 * size)) * (n - 1);
    return arr[Math.round(v) * n + Math.round(u)];
  };
  const coast = (x, z) => bil(C, x, z);
  const h0 = (x, z) => bil(H0, x, z);
  const island = (x, z) => near(IS, x, z);
  // city where the land is low around the bay, hill villages further out; the rest is fields and forest
  function cityDensity(x, z) {
    if (island(x, z) !== 0) return 0;
    const c = Math.max(coast(x, z), 16);
    if (coast(x, z) < 0) return 0;
    const n = fbm(x * 0.0009 + 21, z * 0.0009 + 4, 3);
    const inner = sst(3900, 2100, Math.hypot((x - 700) * 0.78, (z + 400) * 0.56) + (n - 0.5) * 900);
    const vil = fbm(x * 0.0037 + 31, z * 0.0037 + 12, 3);
    const village = sst(0.66, 0.72, vil);
    const park = sst(0.8, 0.72, fbm(x * 0.0052 + 9, z * 0.0052 + 44, 3));
    const steep = sst(1000, 620, h0(x, z));
    return clamp01(Math.max(inner * park, village) * steep);
  }
  const farmMask = (x, z) => (island(x, z) === 0 ? sst(0.24, 0.0, cityDensity(x, z)) * sst(18, 60, coast(x, z)) * sst(1050, 760, h0(x, z)) : (island(x, z) === 1 ? sst(0.56, 0.62, fbm(x * 0.0031 + 3, z * 0.0031 + 9, 3)) * sst(70, 110, coast(x, z)) * sst(520, 360, h0(x, z)) : 0));
  // the final height: terrace steps follow the contour lines wherever people have built or farmed
  function terraceK(x, z, c) {
    if (c < 8) return 0;
    return Math.max(cityDensity(x, z), farmMask(x, z) * 0.85);
  }
  function terraced(x, z) {
    const h = h0(x, z), c = coast(x, z);
    if (c <= 0) return h;
    const k = terraceK(x, z, c);
    if (k <= 0.01) return h;
    const q = h / STEP, f = q - Math.floor(q);
    const hq = (Math.floor(q) + sst(0.82, 1, f)) * STEP;
    return h + (hq - h) * sst(0.05, 0.4, k);
  }
  function ridgeFine(x, z, c) {
    // rock relief only where someone can see it: off the shelf, up the ridge
    return (ridged(x * 0.021 + 2.1, z * 0.021 + 1.3, 4) - 0.5) * 18 * sst(30, 170, c) + (fbm(x * 0.09, z * 0.09, 3) - 0.5) * 4.2 * sst(10, 60, c);
  }
  const yardPad = (x, z) => {
    const c = Math.cos(YARD.ry), s = Math.sin(YARD.ry), dxx = x - YARD.x, dz = z - YARD.z;
    const a = Math.abs(dxx * c - dz * s) - YARD.w / 2, b = Math.abs(dxx * s + dz * c) - YARD.d / 2;
    return Math.hypot(Math.max(a, 0), Math.max(b, 0)) + Math.min(Math.max(a, b), 0);
  };
  YARD.y = Math.round(h0(YARD.x, YARD.z) + ridgeFine(YARD.x, YARD.z, coast(YARD.x, YARD.z)) * 0.3);
  function groundY(x, z) {
    let h = terraced(x, z);
    const isl = island(x, z), c = coast(x, z);
    if (isl === 1 && c > 0) {
      h += ridgeFine(x, z, c);
      const sd = shelfSd(x, z);
      // the shelf: dead flat under every machine, a rim of tumbled rock, a scarp behind and a slope in front
      if (sd < 150) h += (640 - h) * (1 - sst(0, 150, sd));
      const yd = yardPad(x, z);
      if (yd < 90) h += (YARD.y - h) * (1 - sst(0, 90, yd));
    }
    return h;
  }
  // baked RGBA float: r city density, g coast distance, b height, a farm(+) / forest
  function bakeTexelData() {
    const data = new Float32Array(n * n * 4);
    for (let j = 0; j < n; j++) {
      const z = -size + j * dx;
      for (let i = 0; i < n; i++) {
        const x = -size + i * dx, k = (j * n + i) * 4;
        data[k] = cityDensity(x, z); data[k + 1] = C[j * n + i]; data[k + 2] = groundY(x, z); data[k + 3] = farmMask(x, z);
      }
    }
    return data;
  }
  M = { size, n, dx, coast, h0, island, cityDensity, farmMask, terraced, groundY, bakeTexelData };
  return M;
}

// GLSL: which city block a surface belongs to. Same numbers as blockOf() below.
const BA = Math.atan2(SKEW, 1);
const CA = Math.cos(BA), SA = Math.sin(BA);
export const BLOCK_GLSL = /* glsl */ `
float blockHash(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
vec2 blockUV(vec2 xz){ return vec2(${CA.toFixed(6)} * xz.x - ${SA.toFixed(6)} * xz.y, ${SA.toFixed(6)} * xz.x + ${CA.toFixed(6)} * xz.y) / ${CELL.toFixed(1)}; }
// returns front coordinate (feed to litAt) and block jitter
vec2 blockOf(vec2 xz){
  vec2 q = vec2(${CA.toFixed(6)} * xz.x - ${SA.toFixed(6)} * xz.y, ${SA.toFixed(6)} * xz.x + ${CA.toFixed(6)} * xz.y) / ${CELL.toFixed(1)};
  vec2 c = floor(q);
  float w = (c.y + 0.5) * ${CELL.toFixed(1)} * ${Math.hypot(1, SKEW).toFixed(6)};
  float front = w > ${FRONT.W0.toFixed(1)} ? ${FRONT.A.toFixed(3)} * w + (${FRONT.B.toFixed(1)}) : ${(FRONT.A * FRONT.W0 + FRONT.B).toFixed(3)} + ${FRONT.FAR.toFixed(3)} * (w - ${FRONT.W0.toFixed(1)});
  float h = blockHash(c);
  return vec2(front, 0.5 + (h - 0.5) * 0.4);
}`;
export function blockOf(x, z) {
  const u = (CA * x - SA * z) / CELL, v = (SA * x + CA * z) / CELL;
  const iu = Math.floor(u), iv = Math.floor(v);
  const fh = (a, b) => { const p3 = [a * 0.1031 % 1, b * 0.1031 % 1, a * 0.1031 % 1].map((p) => p - Math.floor(p)); const dt = p3[0] * (p3[1] + 33.33) + p3[1] * (p3[2] + 33.33) + p3[2] * (p3[0] + 33.33); const q = p3.map((p) => p + dt); const r = (q[0] + q[1]) * q[2]; return r - Math.floor(r); };
  return { front: frontKey((iv + 0.5) * CELL * Math.hypot(1, SKEW)), jitter: 0.5 + (fh(iu, iv) - 0.5) * 0.4, iu, iv };
}
export function frontOf(x, z) { return frontKey(z + SKEW * x); }
