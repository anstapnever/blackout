// BLACKOUT — shared motion helpers (lead). Everything is a pure function of time: a simulation is baked once at build
// time on a fixed grid and then read back by t, so frames can render in any order.
const BAKE_HZ = 240;

// Damped spring chasing a target function target(t) -> number. freq in Hz, damp 0..1 (<1 overshoots).
// Returns (t) => value. Use for ears, tails, heads, cloth, machines settling, recoil.
export function bakeSpring(target, tEnd, { freq = 3, damp = 0.45, x0, v0 = 0, tStart = 0 } = {}) {
  const n = Math.ceil((tEnd - tStart) * BAKE_HZ) + 2, a = new Float32Array(n);
  const w = 2 * Math.PI * freq, dt = 1 / BAKE_HZ;
  let x = x0 ?? target(tStart), v = v0;
  for (let i = 0; i < n; i++) {
    a[i] = x;
    const t = tStart + i * dt;
    v += (w * w * (target(t) - x) - 2 * damp * w * v) * dt; // semi-implicit Euler, stable at 240 Hz for these frequencies
    x += v * dt;
  }
  return (t) => {
    const f = Math.min(n - 1.001, Math.max(0, (t - tStart) * BAKE_HZ)), i = Math.floor(f);
    return a[i] + (a[i + 1] - a[i]) * (f - i);
  };
}

// A chain of springs (tail, ear, sash): each link chases the previous one, so motion travels down the chain with a lag.
export function bakeChain(target, tEnd, n, opts = {}) {
  const links = [];
  let prev = target;
  for (let i = 0; i < n; i++) {
    const s = bakeSpring(prev, tEnd, { freq: (opts.freq ?? 3) * (1 - i * 0.08), damp: opts.damp ?? 0.35, tStart: opts.tStart ?? 0 });
    links.push(s);
    prev = s;
  }
  return links;
}

// Vector helper: three independent springs.
export function bakeSpring3(target, tEnd, opts) {
  return [0, 1, 2].map((k) => bakeSpring((t) => target(t)[k], tEnd, opts));
}

// Timed key poses, eased per segment. keys = [[t, value], ...]. Pair it with bakeSpring for follow-through
// instead of hand-drawing overshoot on every key.
export function keyed(keys) {
  return (t) => {
    if (t <= keys[0][0]) return keys[0][1];
    for (let i = 1; i < keys.length; i++) {
      if (t < keys[i][0]) {
        const u = (t - keys[i - 1][0]) / (keys[i][0] - keys[i - 1][0]);
        return keys[i - 1][1] + (keys[i][1] - keys[i - 1][1]) * (u * u * (3 - 2 * u));
      }
    }
    return keys[keys.length - 1][1];
  };
}

// Walk planner: each foot stays planted for its whole stance phase, so feet cannot slide.
// path(t) -> [x, y, z] of the hips' ground point; stride = metres between successive landings.
// Returns footPos(side, t) -> { pos: [x,y,z], lift } with side 0 or 1.
export function planSteps(path, tStart, tEnd, stride, { stepTime = 0.34, lift = 0.1, width = 0.12 } = {}) {
  const landings = [[], []];
  const start = path(tStart);
  landings[0].push({ t: tStart - stepTime, p: [start[0], start[1], start[2]] });
  landings[1].push({ t: tStart - stepTime, p: [start[0], start[1], start[2]] });
  let t = tStart, side = 0, last = start, acc = 0;
  const dt = 1 / 120;
  while (t < tEnd) {
    t += dt;
    const p = path(t);
    acc += Math.hypot(p[0] - last[0], p[2] - last[2]);
    last = p;
    if (acc >= stride) {
      acc = 0;
      side = 1 - side;
      const q = path(t - 0.05), ang = Math.atan2(p[0] - q[0], p[2] - q[2]), s = side ? 1 : -1;
      landings[side].push({ t, p: [p[0] + Math.cos(ang) * width * s, p[1], p[2] - Math.sin(ang) * width * s] });
    }
  }
  const footPos = (s, tt) => {
    const L = landings[s];
    let i = 0;
    while (i < L.length - 1 && L[i + 1].t <= tt) i++;
    const a = L[i], b = L[i + 1];
    if (!b || tt < b.t - stepTime) return { pos: a.p, lift: 0 };           // planted: exactly at its landing point
    const u = Math.min(1, (tt - (b.t - stepTime)) / stepTime), e = u * u * (3 - 2 * u);
    return { pos: [a.p[0] + (b.p[0] - a.p[0]) * e, a.p[1] + (b.p[1] - a.p[1]) * e, a.p[2] + (b.p[2] - a.p[2]) * e], lift: Math.sin(Math.PI * u) * lift };
  };
  return { footPos, landings, stepTime };
}

// Breathing at rest (pure, period in seconds), 0..amp.
export const breathe = (t, period = 3.2, amp = 1) => amp * (0.5 - 0.5 * Math.cos((2 * Math.PI * t) / period));
