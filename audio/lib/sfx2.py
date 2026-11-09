"""BLACKOUT sound design. Each function returns stereo (n, 2) starting at its event time. Pitched bodies are tuned to C minor.
Built on the sampled percussion in sfx.P plus filtered noise (never bare oscillators for anything musical)."""
import math
import numpy as np
from dsp import (SR, secs, white, pink, brown, smooth_noise, lp, hp, bp, reson, pan, env_points, db, load, varispeed,
                 modal, rng, fade, sweep_lp, polyblep_saw)
import sfx as X
from sfx import S, st, expenv, thump, grains, add_at

C_TONES = np.array([24, 31, 36, 37, 43, 48, 49, 51, 55, 60])  # C, G, C, Db, G, C, Db, Eb, G, C


def N(key, ratio=1.0, peak=1.0, dur=None):
    """Sample normalised to a peak (the library's raw levels differ wildly)."""
    x = S(key, ratio, dur)
    return x / (np.abs(x).max() + 1e-12) * peak


def noise2(n, seed, kind=pink):
    return np.stack([kind(n, seed), kind(n, seed + 1)], 1)


def fit(x, n):
    """Truncate or crossfade-loop a stereo buffer to n samples."""
    if len(x) >= n:
        return x[:n].copy()
    out = x.copy()
    xf = min(secs(0.25), len(x) // 3)
    w = np.sin(np.linspace(0, math.pi / 2, xf))[:, None]
    while len(out) < n:
        tail = out[-xf:] * w[::-1] + x[:xf] * w
        out = np.concatenate([out[:-xf], tail, x[xf:]])
    return out[:n]


def rotate(x, pos):
    """Equal-power pan of a stereo buffer's mid signal by pos(-1..1) per sample, keeping some of the original width."""
    m = x.mean(1)
    a = (pos + 1) * math.pi / 4
    return np.stack([m * np.cos(a), m * np.sin(a)], 1) * 1.2 + (x - m[:, None]) * 0.4


# ------------------------------------------------------------------ hook
def relay_click(seed=0, weight=1.0, width=0.2):
    """Dull click: a heavy relay dropping out. Muted drum thud + a short contact tick, no bright snap."""
    r = rng(seed)
    n = secs(0.3)
    out = np.zeros((n, 2))
    add_at(out, lp(N('bd_muted_mf', 1.5 + 0.2 * r.random(), 0.8, 0.15), 1200) * weight, 0.0)
    m = secs(0.05)
    tick = hp(white(m, seed + 3), 450) * np.exp(-np.arange(m) / secs(0.0035))
    tick = lp(tick, 3200)
    add_at(out, pan(tick * 0.9, r.uniform(-width, width)), 0.0)
    body = reson(white(m, seed + 5) * np.exp(-np.arange(m) / secs(0.006)), 240 + 110 * r.random(), 5)
    add_at(out, st(body * 2.2 * weight, 0.3, seed), 0.001)
    return out


def city_hum(dur, seed):
    """The electric hum of a living city at its full warmth; the caller steps it down."""
    n = secs(dur)
    tt = np.arange(n) / SR
    s = polyblep_saw(np.full(n, 110.0), seed) + 0.6 * polyblep_saw(np.full(n, 220.5), seed + 1)
    s = bp(s, 90, 900) * (1 + 0.1 * np.sin(2 * np.pi * 120 * tt))
    bed = bp(noise2(n, seed + 3), 200, 1200)
    return (st(s * 0.28, 0.5, seed) + bed * 0.14)


def wire_hum(dur, seed, f0=65.406, bend=1.0):
    """The rising hum in the wires: buzzing mains tone bending up a semitone, opening up in brightness."""
    n = secs(dur)
    u = np.arange(n) / n
    f = f0 * 2 ** (bend * u ** 2.2 / 12)
    voices = [(1.0, 0.0), (0.998, 0.0), (2.0, 0.6), (3.003, 0.4), (4.0, 0.25)]
    y = np.zeros(n)
    for k, (m, a) in enumerate(voices):
        y += polyblep_saw(f * m, seed + k) * (a or 0.9)
    y2 = sweep_lp(np.stack([y, y], 1), 260 + 4200 * u ** 1.6)
    gate = (np.sin(2 * np.pi * np.cumsum(f * 2) / SR) > 0.55).astype(float)
    buzz = bp(noise2(n, seed + 11), 1100, 7000) * (gate * (0.2 + 0.8 * u ** 1.5))[:, None]
    return y2 * 0.22 + buzz * 0.22


def cable_rush(dur, seed, p0=-0.3, p1=0.8):
    """The clot of energy running away along the cable: a receding band of noise."""
    n = secs(dur)
    u = np.arange(n) / n
    x = sweep_lp(hp(noise2(n, seed), 260), 7000 * (1 - u) ** 2 + 420)
    e = env_points(n, [(0, 0), (dur * 0.15, 1), (dur, 0.15)])
    x = x * e[:, None]
    return rotate(x, p0 + (p1 - p0) * u) * 0.8


def seam_clunk(seed=0, big=1.0, p=0.0):
    """One seam of the barrel igniting: heavy clunk + short spit of sparks."""
    r = rng(seed)
    n = secs(1.2)
    out = np.zeros((n, 2))
    add_at(out, st(thump(95, 42, 0.14, 0.7, seed) * 0.9 * big, 0), 0.0)
    add_at(out, lp(N('brake_hammer', 0.5 + 0.08 * r.random(), 0.7, 0.8), 1500) * big, 0.0)
    add_at(out, grains(0.3, lambda t: 500 * math.exp(-t / 0.05), seed + 2, 2500, 9000, (0.001, 0.004), (6, 18)) * 0.5, 0.0)
    return X_pan(out, p)


def X_pan(x, p):
    gl = min(1.0, 1 - p) ** 0.5 if p > 0 else 1.0
    gr = min(1.0, 1 + p) ** 0.5 if p < 0 else 1.0
    y = x.copy()
    y[:, 0] *= gl
    y[:, 1] *= gr
    return y


# ------------------------------------------------------------------ electricity, machinery
def arc_burst(dur, seed, density=1.0):
    """Transformer arcs: sputtering HF noise gated irregularly with a 100 Hz throat."""
    n = secs(dur)
    r = rng(seed)
    tt = np.arange(n) / SR
    g = np.zeros(n)
    t = 0.0
    while t < dur:
        L = r.uniform(0.004, 0.05)
        i, j = secs(t), min(n, secs(t + L))
        g[i:j] = r.uniform(0.3, 1.0)
        t += L + r.exponential(0.05 / density)
    g = lp(g, 900)
    z = hp(noise2(n, seed + 1, white), 2200) * g[:, None]
    throat = (np.sin(2 * np.pi * 100 * tt) > 0).astype(float) * 2 - 1
    tone = bp(throat, 100, 1500) * g
    return z * 0.8 + st(tone * 0.5, 0.5, seed) * fade(np.ones((n, 1)), 0.02, 0.2)


def pulse_whoosh(dur, seed, p0, p1):
    n = secs(dur)
    u = np.arange(n) / n
    e = np.sin(np.pi * np.minimum(1, u * 1.02)) ** 1.3
    x = sweep_lp(hp(noise2(n, seed), 200), 400 + 5200 * e ** 2) * e[:, None]
    return rotate(x, p0 + (p1 - p0) * u)


def breaker_clack(seed=0, size=1.0, p=0.0):
    r = rng(seed)
    n = secs(0.4)
    out = np.zeros((n, 2))
    add_at(out, lp(N('brake_hammer', 0.75 + 0.25 * r.random(), 0.55, 0.25), 2800) * size, 0.0)
    add_at(out, st(thump(135, 80, 0.05, 0.3, seed) * 0.8 * size, 0), 0.0)
    m = secs(0.012)
    t = hp(white(m, seed + 2), 1000) * np.exp(-np.arange(m) / secs(0.002))
    add_at(out, pan(t * 0.8, 0), 0.0)
    return X_pan(out, p)


def lever_chunk(seed=0):
    """The last lever: an effortful pull, then a double ka-CHUNK that shakes the hut."""
    n = secs(2.4)
    out = np.zeros((n, 2))
    add_at(out, lp(N('brake_hammer', 0.42, 0.9, 1.8), 1600), 0.0)
    add_at(out, st(thump(90, 40, 0.24, 1.1, seed) * 1.0, 0), 0.0)
    add_at(out, lp(N('anvil', 0.4, 0.7, 1.4), 1800), 0.14)
    add_at(out, st(thump(70, 32, 0.35, 1.4, seed + 1) * 1.2, 0), 0.14)
    add_at(out, grains(0.6, lambda t: 300 * math.exp(-t / 0.1), seed + 2, 1200, 7000, (0.001, 0.005), (6, 18)) * 0.45, 0.14)
    return out


def hammer_ratchet(dur, seed=0):
    """The hammer winding up: slowed ratchet, teeth heavy and getting further apart, body under it."""
    x = S('ratchet_slow', 0.62)
    n = secs(dur)
    x = fit(x / (np.abs(x).max() + 1e-12), n)
    u = np.arange(n) / n
    body = lp(noise2(n, seed, brown), 160) * (0.35 + 0.65 * u)[:, None]
    return lp(x, 3600) * (0.6 + 0.4 * u)[:, None] + body * 0.4


def fan_thrum(dur, seed):
    n = secs(dur)
    tt = np.arange(n) / SR
    am = 0.55 + 0.45 * np.sin(2 * np.pi * 10.5 * tt) ** 2
    x = bp(noise2(n, seed), 70, 620) * am[:, None]
    return x


def reticle_tick(seed=0):
    n = secs(0.12)
    t = np.arange(n) / SR
    y = np.sin(2 * np.pi * (1760 + 300 * rng(seed).random()) * t) * np.exp(-t / 0.01)
    return pan(hp(y, 600), rng(seed + 1).uniform(-0.3, 0.3))


def trigger_click(seed=0):
    """Squeeze: an oily small click, then the hammer falling, metal on metal."""
    n = secs(0.7)
    out = np.zeros((n, 2))
    m = secs(0.015)
    t1 = bp(white(m, seed), 900, 6500) * np.exp(-np.arange(m) / secs(0.003))
    add_at(out, pan(t1, 0), 0.0)
    add_at(out, lp(N('brake_hammer', 1.05, 0.6, 0.45), 6000), 0.035)
    add_at(out, st(thump(140, 70, 0.07, 0.4, seed) * 0.6, 0), 0.035)
    return out


# ------------------------------------------------------------------ rockets, batteries
def rocket(seed=0, p=0.0, flight=2.0):
    """Launch: ignition bang, rising hiss, receding toward the far side."""
    r = rng(seed)
    n = secs(flight + 0.5)
    out = np.zeros((n, 2))
    add_at(out, lp(N('bd_vsco_ff', 1.1 + 0.25 * r.random(), 0.65, 0.5), 3000), 0.0)
    m = n - secs(0.02)
    u = np.arange(m) / m
    e = np.clip(u / 0.04, 0, 1) * (1 - u) ** 1.2
    hiss = sweep_lp(hp(noise2(m, seed + 5), 700), 9000 * (1 - 0.8 * u) + 700)
    add_at(out, rotate(hiss * e[:, None] * 0.6, p + (0.5 * np.sign(p or 0.3)) * u), 0.01)
    add_at(out, st(thump(100, 44, 0.3, 1.4, seed) * 0.8, 0), 0.0)
    return X_pan(out, p * 0.7)


def boom(seed=0, size=1.0, dist=1.0, p=0.0):
    """A fire dome going up at some distance: a thud and a rolling whoomp, more air and less top when further."""
    n = secs(3.5)
    r = rng(seed)
    out = np.zeros((n, 2))
    add_at(out, st(thump(75, 26, 0.7 * size, 3.5, seed) * 1.1 * size, 0), 0.0)
    add_at(out, lp(N('bd2_f', 0.72 + 0.1 * r.random(), 0.9), 900) * size, 0.0)
    whoomp = lp(noise2(n, seed + 3, brown), 700) * expenv(n, 0.02, 1.1 * size)[:, None]
    out += whoomp * 0.9 * size
    add_at(out, X.debris_rattle(1.6, seed + 4, 0.35 * size, 0.8), 0.1)
    return X_pan(lp(out, 8000 / dist) / dist, p)


def air_tear(seed=0):
    """The two beams meet: a tearing through air, rising, ending in a crack."""
    n = secs(1.1)
    u = np.arange(n) / n
    x = bp(noise2(n, seed, white), 350, 9000)
    x = sweep_lp(x, 800 + 9000 * u ** 2)
    e = np.minimum(1.0, u / 0.85) ** 2 * (1 - np.clip((u - 0.87) / 0.13, 0, 1)) ** 2
    out = x * e[:, None] * 1.1
    g = grains(1.1, lambda t: 80 + 400 * t, seed + 3, 2000, 9000, (0.001, 0.004), (5, 12)) * 0.35
    add_at(out, g, 0.0)
    return out


# ------------------------------------------------------------------ beams (designed, not musical pitch sources)
def beam_core(dur, seed, kind='hero', flutter=1.0):
    """Sustained energy. kind 'hero': icy, narrow, high. kind 'coral': raspy, low, tearing."""
    n = secs(dur)
    tt = np.arange(n) / SR
    if kind == 'hero':
        base = [(523.25, 0.9, 40), (783.99, 0.7, 45), (1046.5, 1.0, 55), (2093.0, 0.5, 70), (3136.0, 0.3, 90)]
        band = hp(noise2(n, seed), 500)
    else:
        base = [(73.42, 0.9, 16), (138.59, 0.8, 18), (277.18, 0.6, 22), (415.3, 0.5, 26), (830.6, 0.35, 34)]
        band = bp(noise2(n, seed, white), 120, 5200)
    y = np.zeros((n, 2))
    for f, a, q in base:
        y += reson(band, f, q) * a * 3.0
    y = y * (1 + 0.28 * flutter * smooth_noise(n, 24, seed + 2))[:, None]
    if kind == 'coral':
        grit = bp(noise2(n, seed + 7, white), 900, 6500) * (0.5 + 0.5 * np.abs(smooth_noise(n, 60, seed + 8)))[:, None]
        y = y + grit * 0.5
    return y / (np.sqrt(np.mean(y ** 2)) + 1e-9) * 0.12


def beam_body(dur, seed, weight=1.0):
    """The roar around a beam: chest pressure and air."""
    n = secs(dur)
    low = lp(noise2(n, seed, brown), 170)
    air = bp(noise2(n, seed + 2), 180, 2400)
    y = low * 1.0 + air * 0.32
    y = y * (1 + 0.18 * smooth_noise(n, 9, seed + 4))[:, None]
    return y / (np.sqrt(np.mean(y ** 2)) + 1e-9) * 0.14 * weight


def beam_zap(seed=0):
    """A beam starting: a thin high snap with a long air-pull."""
    n = secs(0.8)
    x = hp(noise2(n, seed, white), 3500) * expenv(n, 0.001, 0.08)[:, None]
    return x * 0.8


# ------------------------------------------------------------------ the big hits
def muzzle_blast(seed=500, scale=1.0):
    """The gun: enormous sub drop and whip crack, recoil, a dust wall running out."""
    n = secs(11.0)
    out = np.zeros((n, 2))
    add_at(out, st(thump(100 + 12 * scale, 22, 3.2 * scale, 11.0, seed) * 1.7, 0), 0.0)
    add_at(out, S('bd_vsco_fff2', 0.55) * 1.2, 0.0)
    add_at(out, S('bd2_ff', 0.62) * 1.1, 0.002)
    add_at(out, S('bd_vsco_fff', 0.78) * 0.9, 0.006)
    add_at(out, lp(S('gong2_fff', 0.52), 2600) * 1.0, 0.01)
    add_at(out, S('crash_fff', 0.82) * 0.55, 0.0)
    # whip crack
    m = secs(0.3)
    whip = hp(noise2(m, seed + 3, white), 2500) * expenv(m, 0.0005, 0.07)[:, None]
    add_at(out, whip * 1.1, 0.0)
    # chest air
    body = lp(noise2(n, seed + 5, brown), 800) * expenv(n, 0.004, 3.8)[:, None]
    out += body * 0.8
    # recoil: the whole gun and mech ride back on steel
    add_at(out, metal_groan(3.6, seed + 7, 0.8, 0.9), 0.05)
    add_at(out, X.debris_rattle(5.0, seed + 8, 0.55, 1.2), 0.7)
    add_at(out, X.dust_roar(4.5, seed + 9) * 0.45, 0.2)
    return out


def twin_explosion(seed=540):
    """Far mountain erupts and, an instant later, the ridge impact: fire wall right at the camera."""
    n = secs(11.0)
    out = np.zeros((n, 2))
    add_at(out, lp(X.explosion(seed), 4000) * 0.8, 0.0)
    add_at(out, X.explosion(seed + 40) * 1.05, 0.34)
    add_at(out, X.dust_roar(5.0, seed + 60) * 0.8, 0.5)
    return out


def shield_slam(seed=700):
    """Beam into ship's bow: the hugest metal strike. A clang tuned to C, not a thud."""
    n = secs(10.0)
    out = np.zeros((n, 2))
    add_at(out, st(thump(90, 24, 2.6, 10.0, seed) * 1.6, 0), 0.0)
    add_at(out, S('bd_vsco_fff', 0.6) * 1.2, 0.0)
    add_at(out, S('bd2_ff', 0.66) * 1.1, 0.003)
    add_at(out, lp(N('anvil', 0.38, 1.0, 2.0), 3500) * 0.95, 0.0)
    add_at(out, lp(N('anvil', 0.62, 0.6, 2.0), 7000), 0.02)
    add_at(out, lp(S('gong_fff', 0.65), 3000) * 0.9, 0.005)
    add_at(out, S('crash_fff', 0.8) * 0.5, 0.0)
    # modal hull, ringing on C
    m = n
    exc = np.zeros(m)
    exc[0] = 1
    exc = lp(exc, 2000)
    freqs = 440 * 2 ** ((np.array([24, 36, 43, 48, 51, 55, 60, 63, 67]) - 69) / 12)
    hull = modal(exc, freqs, [3.5, 3.0, 2.5, 2.2, 1.8, 1.6, 1.3, 1.0, 0.8], [1, .9, .8, .7, .5, .45, .35, .25, .2])
    add_at(out, st(hull / (np.abs(hull).max() + 1e-9) * 0.75, 0.7, seed), 0.0)
    add_at(out, X.debris_rattle(4.0, seed + 5, 0.7, 1.2), 0.2)
    return out


def metal_groan(dur, seed, base=1.0, level=1.0, bend=0.25):
    """Huge metal creak tuned to C Phrygian: stick-slip pulses through a modal body + bowed brake drum pitched down."""
    n = secs(dur)
    r = rng(seed)
    tt = np.arange(n) / SR
    rate = 14 + 10 * smooth_noise(n, 0.8, seed) + 6 * np.sin(2 * np.pi * tt / dur * r.uniform(0.5, 1.5))
    ph = np.cumsum(np.maximum(3, rate) / SR)
    imp = np.zeros(n)
    idx = np.searchsorted(ph, np.arange(1, int(ph[-1])))
    imp[idx[idx < n]] = r.uniform(0.3, 1.0, len(idx[idx < n]))
    ms = C_TONES.astype(float)
    freqs = 440 * 2 ** ((ms - 69) / 12) * 2 ** (r.uniform(-0.12, 0.12, len(ms)) / 12)
    body = modal(imp, freqs, [2.2, 1.8, 1.5, 1.3, 1.0, 0.9, 0.7, 0.5, 0.4, 0.3], [1, .9, .8, .7, .55, .45, .35, .25, .2, .12])
    body = lp(body, 2500)
    b = S('brake_bowed1' if seed % 2 else 'brake_bowed2')
    b = b / (np.abs(b).max() + 1e-9) * 0.9
    want = 60 + 12 * math.log2(base)
    tgt = min([43, 48, 49, 55, 60, 61], key=lambda q: abs(q - want))
    r0 = 440 * 2 ** ((tgt - 69) / 12) / 1050.0
    ratio = r0 * (1 + bend * 0.25 * smooth_noise(n, 0.6, seed + 3))
    bb = varispeed(b, np.full(n, 1.0) * ratio)
    m = min(n, len(bb))
    out = np.zeros((n, 2))
    out[:m] += bb[:m] * 0.9
    out += st(body / (np.abs(body).max() + 1e-9) * 0.75, 0.9, seed)
    e = env_points(n, [(0, 0), (dur * 0.2, 1), (dur * 0.7, 0.85), (dur, 0)])
    return lp(out, 2000) * e[:, None] * level


def melt_grind(dur, seed=800):
    """Eight seconds of a ship's bow being eaten: scraped and bowed metal, stick-slip, sizzling, ripples of rivets."""
    n = secs(dur)
    out = np.zeros((n, 2))
    scr = N('gong_scrape3', 0.5, 0.9)
    out += fit(scr, n) * 0.7
    add_at(out, fit(N('gong2_scrape', 0.44, 0.9), secs(dur - 1.2)) * 0.5, 1.2)
    add_at(out, fit(N('sus_scrape', 0.42, 0.9), n) * 0.7, 0.0)
    for k, (t0, d, base) in enumerate([(0.0, dur, 1.0), (dur * 0.15, dur * 0.85, 0.7), (dur * 0.42, dur * 0.58, 1.4)]):
        add_at(out, metal_groan(d, seed + 10 + k, base, 1.0, 0.45), t0)
    hiss = bp(noise2(n, seed + 20, white), 2000, 12000) * (0.4 + 0.6 * np.abs(smooth_noise(n, 15, seed + 21)))[:, None]
    u = np.arange(n) / n
    out += hiss * (0.12 + 0.2 * u)[:, None]
    rv = grains(dur, lambda t: 10 + 26 * (t / dur), seed + 22, 400, 3000, (0.004, 0.02), (3, 8), 1.0)
    return out + rv * 0.7


def rip(seed=820):
    """Shield gone: tearing metal, one last shriek."""
    n = secs(2.6)
    out = np.zeros((n, 2))
    b = N('brake_bowed2', 1.0, 0.9)
    k = secs(1.4)
    ratio = np.interp(np.arange(k), [0, k * 0.1, k], [2.0, 1.7, 0.7])
    sh = varispeed(fit(b, k * 3), ratio)[:k]
    sh = hp(sh, 400) * env_points(len(sh), [(0, 0), (0.04, 1), (1.4, 0)])[:, None]
    add_at(out, sh * 0.8, 0.0)
    add_at(out, X.grinding_crack(1.6, seed + 2, 1.1), 0.0)
    add_at(out, st(thump(80, 30, 0.6, 2.0, seed) * 0.8, 0), 0.0)
    add_at(out, X.debris_rattle(2.2, seed + 3, 0.6), 0.1)
    return out


def pierce_shatter(seed=900):
    """The white beam punches through the rings: huge slam, porcelain and gold ring cracking outward."""
    n = secs(8.0)
    out = np.zeros((n, 2))
    add_at(out, st(thump(95, 24, 2.3, 8.0, seed) * 1.5, 0), 0.0)
    add_at(out, S('bd_vsco_fff2', 0.6) * 1.2, 0.0)
    add_at(out, lp(S('gong_fff', 0.82), 5500) * 0.9, 0.0)
    add_at(out, S('crash_fff', 0.95) * 0.6, 0.0)
    add_at(out, N('anvil', 0.75, 0.55, 1.2), 0.0)
    # brittle cracks (ring of porcelain and gold)
    add_at(out, grains(3.5, lambda t: 500 * math.exp(-t / 0.6) + 25, seed + 2, 1200, 8000, (0.002, 0.012), (8, 25), 1.0) * 1.1, 0.0)
    m = secs(4.0)
    gl = np.zeros((m, 2))
    r = rng(seed + 5)
    for i in range(40):
        t = float(r.uniform(0, 2.5))
        f = float(r.uniform(1800, 7500))
        L = secs(float(r.uniform(0.15, 0.8)))
        tt = np.arange(L) / SR
        y = np.sin(2 * np.pi * f * tt) * np.exp(-tt / (L / SR / 4)) * float(r.uniform(0.05, 0.25))
        add_at(gl, pan(y, float(r.uniform(-0.9, 0.9))), t)
    add_at(out, gl * 1.2, 0.0)
    return out


def implosion(seed=950):
    """Core break: inward suck (place at t - len), then a deep concussion and a slowly collapsing sphere."""
    n_pre = secs(0.55)
    pre = N('gong_roll', 0.55, 0.9)[::-1][:n_pre].copy()
    pre = pre * np.linspace(0, 1, len(pre))[:, None] ** 2.4
    pre2 = sweep_lp(noise2(n_pre, seed, pink), 300 + 8000 * np.linspace(0, 1, n_pre) ** 2) * np.linspace(0, 1, n_pre)[:, None] ** 3
    head = pre * 0.7 + pre2 * 0.35
    n = secs(9.0)
    out = np.zeros((n, 2))
    add_at(out, st(thump(78, 20, 3.0, 9.0, seed) * 1.8, 0), 0.0)
    add_at(out, S('bd_vsco_fff', 0.5) * 1.2, 0.0)
    add_at(out, lp(S('gong2_fff', 0.48), 2200) * 0.9, 0.02)
    body = lp(noise2(n, seed + 4, brown), 500) * expenv(n, 0.01, 4.0)[:, None]
    out += body * 0.8
    return np.concatenate([head, out]), n_pre / SR


def ring_fall(dur, seed=1000):
    """The dead rings toppling: long descending groans, huge and slow."""
    n = secs(dur)
    out = np.zeros((n, 2))
    b = N('brake_bowed1', 1.0, 0.9)
    k = n
    ratio = np.interp(np.arange(k), [0, k], [0.26, 0.11])
    y = varispeed(fit(b, int(k * 0.35)), ratio)
    y = y[:k]
    out[:len(y)] += lp(y, 1400) * 1.1
    add_at(out, metal_groan(dur * 0.8, seed + 2, 0.55, 1.1, 0.6), 0.0)
    add_at(out, metal_groan(dur * 0.7, seed + 3, 0.4, 1.0, 0.6), dur * 0.25)
    u = np.arange(n) / n
    rb = lp(noise2(n, seed + 7, brown), 130) * (0.45 + 0.55 * u)[:, None]
    return out + rb * 0.9


def water_wall(dur, seed=1050):
    """A slow, huge wall of water rising and falling: broadband roar with a slow swell, deep surges."""
    n = secs(dur)
    u = np.arange(n) / n
    e = np.sin(np.pi * np.minimum(1, u)) ** 0.8
    x = sweep_lp(hp(noise2(n, seed), 90), 1100 + 5600 * e)
    surge = lp(noise2(n, seed + 3, brown), 220) * (0.8 + 0.2 * smooth_noise(n, 1.3, seed + 6))[:, None]
    return (x * 0.7 + surge * 0.9) * e[:, None]


# ------------------------------------------------------------------ aftermath, fragile end
def ember_bed(dur, seed=1100):
    """A dying battlefield: sparse crackle and hiss."""
    n = secs(dur)
    x = grains(dur, lambda t: 9, seed, 1500, 8000, (0.001, 0.006), (6, 18), 1.2) * 0.55
    h = hp(noise2(n, seed + 3), 3000) * (0.6 + 0.4 * smooth_noise(n, 2.5, seed + 4))[:, None]
    return x + h * 0.012


def metal_tick(seed, freq=None):
    """A cooling gun ticking, small."""
    r = rng(seed)
    n = secs(0.35)
    exc = np.zeros(n)
    exc[0] = 1
    f = freq or float(r.uniform(1800, 4200))
    y = modal(exc, [f, f * 1.42, f * 2.35], [0.08, 0.05, 0.03], [1, .6, .3])
    y = y / (np.abs(y).max() + 1e-9)
    return pan(y, float(r.uniform(-0.6, 0.6)))


def footfall(seed=0, weight=1.0, p=0.0):
    """Small quick paws on hot plate."""
    n = secs(0.25)
    r = rng(seed)
    out = np.zeros((n, 2))
    add_at(out, st(thump(150, 90, 0.04, 0.18, seed) * 0.6 * weight, 0), 0.0)
    m = secs(0.04)
    t = bp(white(m, seed + 1), 500, 3400) * np.exp(-np.arange(m) / secs(0.006))
    add_at(out, pan(t * 0.6 * weight, p), 0.0)
    return out


def hatch_strain(dur, seed=1200):
    """The hot hatch fighting the paws: a stick-slip creak rising in pitch, one groan of hinge."""
    n = secs(dur)
    r = rng(seed)
    tt = np.arange(n) / SR
    rate = 16 + 18 * tt / dur + 5 * smooth_noise(n, 2.2, seed)
    ph = np.cumsum(np.maximum(4, rate) / SR)
    imp = np.zeros(n)
    idx = np.searchsorted(ph, np.arange(1, int(ph[-1])))
    imp[idx[idx < n]] = r.uniform(0.3, 1.0, len(idx[idx < n]))
    ms = np.array([48, 55, 60, 63, 67, 72])
    freqs = 440 * 2 ** ((ms - 69) / 12) * 2 ** (r.uniform(-0.15, 0.15, len(ms)) / 12)
    b = modal(imp, freqs, [1.0, 0.8, 0.6, 0.5, 0.35, 0.3], [1, .8, .7, .5, .3, .2])
    y = lp(b, 3500) / (np.abs(b).max() + 1e-9)
    return st(y * 0.8 * env_points(n, [(0, 0), (dur * 0.2, 0.6), (dur, 1)]), 0.6, seed)


def hatch_open(seed=1250):
    n = secs(1.6)
    out = np.zeros((n, 2))
    add_at(out, st(thump(100, 45, 0.3, 1.2, seed) * 0.9, 0), 0.0)
    add_at(out, lp(N('brake_hammer', 0.5, 0.8, 1.2), 2200), 0.0)
    h = bp(noise2(secs(1.2), seed + 3), 1500, 7000) * expenv(secs(1.2), 0.02, 0.5)[:, None]
    add_at(out, h * 0.4, 0.03)
    return out


def relight_tick(seed=0, p=0.0):
    """The hook's relay click, softened: lights coming back."""
    n = secs(0.2)
    out = np.zeros((n, 2))
    add_at(out, lp(N('bd_muted_pp', 1.8, 0.45, 0.14), 1500), 0.0)
    m = secs(0.03)
    t = bp(white(m, seed + 3), 500, 3000) * np.exp(-np.arange(m) / secs(0.004))
    add_at(out, pan(t * 0.5, p), 0.0)
    return out


def ring_snap(seed=0, amp=1.0, p=0.0):
    """One ring of the Orrery clacking home: a hard porcelain-and-gold clack tuned to C, with a small low weight."""
    r = rng(seed)
    n = secs(0.9)
    out = np.zeros((n, 2))
    add_at(out, lp(N('brake_hammer', 0.55 + 0.1 * r.random(), 0.7, 0.7), 4200), 0.0)
    exc = np.zeros(n)
    exc[0] = 1
    freqs = 440 * 2 ** ((np.array([60, 67, 72, 75, 79]) - 69) / 12)
    y = modal(exc, freqs, [0.5, 0.4, 0.3, 0.22, 0.16], [1, .7, .5, .35, .25])
    add_at(out, st(y / (np.abs(y).max() + 1e-9) * 0.5, 0.5, seed), 0.0)
    add_at(out, st(thump(110, 55, 0.08, 0.5, seed) * 0.5 * min(1.5, amp), 0), 0.0)
    return X_pan(out, p)


def cable_accel(dur, seed=0):
    """The pulse on the last span: noise rising in level and brightness, ending exactly on the slam."""
    n = secs(dur)
    u = np.arange(n) / n
    x = sweep_lp(hp(noise2(n, seed), 240), 600 + 8400 * u ** 2.2)
    return rotate(x * (0.12 + 0.88 * u ** 2.4)[:, None], 0.5 * (1 - u)) * 0.95


def barrel_slam(seed=0):
    """The pulse hits the barrel base: one clear low metal slam with a short sub tail, tuned to C."""
    n = secs(1.3)
    out = np.zeros((n, 2))
    add_at(out, st(thump(92, 34, 0.26, 1.2, seed) * 1.25, 0), 0.0)
    add_at(out, lp(N('brake_hammer', 0.42, 0.95, 1.0), 1500), 0.0)
    add_at(out, lp(N('anvil', 0.5, 0.65, 0.9), 2600), 0.002)
    exc = np.zeros(n)
    exc[0] = 1
    freqs = 440 * 2 ** ((np.array([36, 43, 48, 55]) - 69) / 12)
    y = modal(exc, freqs, [0.5, 0.42, 0.34, 0.26], [1, .75, .55, .35])
    add_at(out, st(y / (np.abs(y).max() + 1e-9) * 0.6, 0.4, seed), 0.0)
    add_at(out, grains(0.25, lambda t: 400 * math.exp(-t / 0.05), seed + 2, 1800, 7000, (0.001, 0.004), (6, 18)) * 0.3, 0.0)
    return out
