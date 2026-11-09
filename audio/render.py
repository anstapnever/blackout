"""BLACKOUT soundtrack: score + designed SFX + ambience, mixed and mastered to out/soundtrack.wav.

Deterministic: same samples + same code -> same file.  Usage (from the project root):
    python -I audio/render.py
Key: C minor (Phrygian Db). E natural first sounds at CUES.lampBack. Every time below derives from CUES / SHOTS in src/shots.js.
"""
import os, sys, math, time, json, re, inspect, site
sys.path.append(site.getusersitepackages())
import numpy as np
import soundfile as sf
from scipy import signal
from scipy.ndimage import minimum_filter1d, uniform_filter1d

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, 'lib'))
from dsp import *  # noqa
import sfx as X  # noqa
import sfx2 as Y  # noqa

PROJ = os.path.dirname(HERE)
OUT = os.path.join(PROJ, 'out', 'soundtrack.wav')
T0 = time.time()


def read_timeline():
    """CUES and shot starts from src/shots.js, the single source of truth."""
    src = open(os.path.join(PROJ, 'src', 'shots.js'), encoding='utf-8').read()
    blk = src[src.index('export const CUES'):]
    blk = blk[:blk.index('};')]
    cues = {k: float(v) for k, v in re.findall(r'(\w+):\s*([0-9.]+)', blk)}
    shots, t = {}, 0.0
    for sid, d in re.findall(r"\['(s\d+\w*)',\s*'\w+',\s*'\w+',\s*([0-9.]+)", src):
        shots[sid] = t
        t += float(d)
    cues['end'] = round(t, 3)
    return cues, shots, round(t, 3)


C, SH, DUR = read_timeline()
N = secs(DUR)
print(f'timeline: {DUR} s, {len(SH)} shots, cues {len(C)}')

HOLD = 0.27                       # the held breath before the shield impact


def src_text(name):
    return open(os.path.join(PROJ, 'src', name), encoding='utf-8').read()


def front_steps():
    """Block deaths: the land department's front runs on threes (film time quantised to 1/8 s) until FRONT_END."""
    end = float(re.search(r'FRONT_END\s*=\s*(-?[0-9.]+)', src_text('layout.js')).group(1))
    return [k / 8.0 for k in range(0, int(round(end * 8)) + 1)]


def tortoise_times():
    """The jump, from mech-anim.js."""
    src = src_text('mech-anim.js')
    src = src[src.index('export const TT'):]
    return {k: float(re.search(k + r':\s*([0-9.]+)', src).group(1)) for k in ('crouchS', 'launch', 'air', 'land', 'plant2')}


def orrery_clicks():
    """Ring snaps, same formula as orrery-motion.js: 5 rings per event."""
    src = src_text('orrery-motion.js')
    src = src[src.index('const EV = ['):]
    src = src[:src.index('];')]
    ev = []
    for line in src.splitlines():
        m = re.search(r'snap:\s*(?:C\.(\w+)\s*\+\s*)?([0-9.]+),\s*stagger:\s*([0-9.]+)', line)
        if m:
            ev.append(((C[m.group(1)] if m.group(1) else 0.0) + float(m.group(2)), float(m.group(3)), 'part: true' in line))
    out = []
    for k, (snap, stag, part) in enumerate(ev):
        amp = 2.4 if k == len(ev) - 1 else 0.7 if part else 1.6
        out += [(snap + i * stag, amp, i) for i in range(5)]
    return out


BUSES = ['str', 'brass', 'wind', 'choir', 'harp', 'perc', 'sub', 'sfx', 'world', 'beam', 'amb', 'hush']
B = {k: np.zeros((N, 2)) for k in BUSES}


def log(*a):
    print(f'[{time.time() - T0:6.1f}s]', *a, flush=True)


def M(n):
    return midi(n) if isinstance(n, str) else n


SEAT = {'vn_sus': -0.45, 'vn_trem': -0.45, 'va_sus': 0.15, 'va_trem': 0.15, 'vc_sus': 0.4, 'vc_trem': 0.4, 'vc_spic': 0.35,
        'cb_sus': 0.55, 'cb_trem': 0.55, 'cb_spic': 0.5, 'va_spic': 0.1, 'hn_sus': -0.3, 'hn_stac': -0.3, 'tb_sus': 0.3, 'tb_stac': 0.3,
        'tu_sus': 0.45, 'tu_stac': 0.45, 'tp_sus': 0.05, 'fl': -0.1, 'ob': 0.1, 'cl': -0.1, 'bn': 0.2,
        'harp': -0.6, 'glock': -0.25, 'glass': 0.0, 'bells': 0.3, 'vib_bow': 0.0}
BUSOF = {'vn': 'str', 'va': 'str', 'vc': 'str', 'cb': 'str', 'hn': 'brass', 'tb': 'brass', 'tu': 'brass',
         'tp': 'brass', 'fl': 'wind', 'ob': 'wind', 'cl': 'wind', 'bn': 'wind', 'harp': 'harp', 'glock': 'harp',
         'glass': 'harp', 'bells': 'harp', 'vib': 'harp'}
INST, NOTES, EVENTS = {}, [], []
_add = add


def add(bus, x, t, gain=1.0):  # noqa: F811  (logs every non-note sound for the cue sheet)
    fr = inspect.currentframe().f_back
    if fr.f_code.co_name not in ('note', 'choir', 'gliss'):
        src_fr = fr.f_back if fr.f_code.co_name in ('hit',) else fr
        line = (inspect.getframeinfo(src_fr).code_context or [''])[0]
        m = re.search(r"(?:X|Y)\.S\('(\w+)'", line) or re.search(r"(?:X|Y)\.(\w+)\(", line) or re.search(r"(\w+)\(", line)
        label = m.group(1) if m else 'sound'
        y = x if x.ndim == 1 else np.abs(x).max(1)
        pk = np.abs(y).max() * gain + 1e-12
        idx = np.where(np.abs(y) * gain > pk * 0.1)[0]
        if len(idx):
            lvl = 20 * np.log10(np.sqrt(np.mean((x[idx[0]:idx[-1] + 1] * gain) ** 2)) + 1e-12)
            EVENTS.append([round(t + idx[0] / SR, 2), round(t + idx[-1] / SR, 2), [k for k, v in B.items() if v is bus][0], label, round(float(lvl), 1)])
    _add(bus, x, t, gain)


def spread(x, p):
    gl = min(1.0, 1 - p) ** 0.5 if p > 0 else 1.0
    gr = min(1.0, 1 + p) ** 0.5 if p < 0 else 1.0
    y = x.copy()
    y[:, 0] *= gl
    y[:, 1] *= gr
    if p > 0:
        y[:, 1] += x[:, 0] * (1 - gl) * 0.7
    elif p < 0:
        y[:, 0] += x[:, 1] * (1 - gr) * 0.7
    return y


def I(key):
    if key not in INST:
        INST[key] = Inst(key)
    return INST[key]


def note(key, n, t, dur, vel=0.6, g=0.0, att=0.0, rel=0.6, shape=None, bus=None, cents=0.0, rr=0):
    """One sampled note. g = gain dB; shape = [(t_rel, gain), ...] inside the note."""
    NOTES.append({'t': round(t, 3), 'dur': round(dur, 3), 'midi': M(n), 'vel': vel, 'g': g, 'inst': key})
    x = I(key).note(M(n), dur, vel=vel, att=att, rel=rel, cents=cents, rr=rr)
    if shape:
        x = x * env_points(len(x), shape)[:, None]
    add(B[bus or BUSOF[key.split('_')[0]]], spread(x, SEAT.get(key, 0.0)), t, db(g))


def chord(key, notes, t, dur, rr=0, **kw):
    for i, n in enumerate(notes):
        note(key, n, t, dur, rr=rr + i, **kw)


def gliss(key, n, t, dur, pts, vel=0.6, g=0.0, att=0.1, rel=0.3, shape=None, bus=None, rr=0):
    """A sampled note that bends: pts = [(t_rel, semitones), ...]. The whole note is resampled, so the section really slides."""
    NOTES.append({'t': round(t, 3), 'dur': round(dur, 3), 'midi': M(n), 'vel': vel, 'g': g, 'inst': key, 'bend': pts[-1][1]})
    total = secs(dur + rel)
    x = I(key).note(M(n), (dur + rel) * 2 + 0.5, vel=vel, att=0, rel=0.05, rr=rr)
    ratio = 2 ** (env_points(total, pts) / 12)
    y = varispeed(x, ratio)[:total]
    e = env_points(len(y), [(0, 0), (att, 1), (dur, 1), (dur + rel, 0)])
    if shape:
        e = e * env_points(len(y), shape)
    add(B[bus or BUSOF[key.split('_')[0]]], spread(y * e[:, None], SEAT.get(key, 0.0)), t, db(g))


def choir(n, t, d, seed, voices=10, vowel='a', att=0.4, rel=0.8, g=0.0, shape=None, vib=0.012):
    NOTES.append({'t': round(t, 3), 'dur': round(d, 3), 'midi': M(n), 'vel': 0.6, 'g': g, 'inst': 'choir_' + vowel})
    x = choir_note(M(n), d, seed, voices, vowel, att=att, rel=rel, vib=vib)
    if shape:
        x = x * env_points(len(x), shape)[:, None]
    add(B['choir'], x, t, db(g))


def hit(bus, x, t, g=0.0):
    add(B[bus], x, t, db(g))


def timp(n, t, g=0.0, drum=2, dur=3.0):
    f, pk = X.TIMP[drum]
    x = load(f)
    pk = pk or 150.0
    ratio = hz(M(n)) / pk
    while ratio > 1.26:
        ratio /= 2
    while ratio < 0.63:
        ratio *= 2
    y = varispeed(x, ratio)[:secs(dur)]
    add(B['perc'], fade(y.copy(), 0.0005, 0.3), t, db(g))


def ride(x, pts):
    """Shape a buffer with [(t_rel, gain_linear)]."""
    return x * env_points(len(x), pts)[:, None]


def tutti(t, d, V, g=0.0, vel=1.0, shape=None, rel=1.2, att=0.0):
    """Full orchestra on the voicing V (see the family trims below)."""
    TR = {'tu': ('tu_sus', -3), 'tb': ('tb_sus', -4), 'hn': ('hn_sus', -4), 'tp': ('tp_sus', -9), 'cb': ('cb_sus', -4),
          'vc': ('vc_sus', -5), 'va': ('va_sus', -6), 'vn': ('vn_sus', -7), 'vt': ('vn_trem', -9), 'ct': ('vc_trem', -8)}
    sh = shape or [(0, 1), (0.5, 0.85), (d, 0.55), (d + rel, 0.0)]
    for k, (key, tr) in TR.items():
        for i, n in enumerate(V.get(k, [])):
            note(key, n, t, d, vel=vel, g=g + tr, att=att, rel=rel, shape=sh, rr=i)
    for i, n in enumerate(V.get('cm', [])):
        choir(n, t, d, 3000 + int(t * 50) + i, 10, 'a', att=max(0.05, att), rel=rel, g=g - 3, shape=sh)
    for i, n in enumerate(V.get('cf', [])):
        choir(n, t, d, 3400 + int(t * 50) + i, 12, 'a', att=max(0.05, att), rel=rel, g=g - 5, shape=sh)


def low_hit(t, g=0.0, gong='gong_ff'):
    """The percussion that goes with every big orchestral hit."""
    timp('C2', t, 2 + g, drum=2)
    hit('perc', X.S('bd_vsco_fff', 0.82), t, 1 + g)
    hit('perc', X.S('bd2_ff', 0.72), t + 0.003, -1 + g)
    hit('perc', X.S(gong, 0.8), t + 0.008, -3 + g)
    hit('perc', X.S('crash_ff'), t, -8 + g)


def ring(t0, t1, g=-30.0):
    """THE thin high ring, in the hush bus so it survives every gate: bowed glass and vibraphone on G6, a pair of beating sine partials."""
    d = t1 - t0
    note('glass', 'G6', t0, d, vel=0.6, g=g, att=0.03, rel=0.04, bus='hush')
    note('vib_bow', 'G6', t0, d, vel=0.5, g=g - 8, att=0.05, rel=0.04, bus='hush')
    n = secs(d)
    tt = np.arange(n) / SR
    y = (np.sin(2 * np.pi * 1567.98 * tt) + 0.5 * np.sin(2 * np.pi * 1570.4 * tt) + 0.16 * np.sin(2 * np.pi * 3136 * tt)) * 0.05
    add(B['hush'], fade(X.st(y, 0.5, 11), 0.015, 0.008), t0, db(g + 6))


def heart(t0, t1, bpm0, bpm1, lv0, lv1, g=-10.0, bus='sub', seed=0):
    """Heartbeats whose rate moves from bpm0 to bpm1; the last beat never crosses t1."""
    t, k = t0, 0
    while t < t1 - 0.28:
        u = (t - t0) / max(1e-3, t1 - t0)
        lv = lv0 + (lv1 - lv0) * u
        hit(bus, X.heartbeat(lv, 150 + seed + k), t, g)
        t += 60 / (bpm0 + (bpm1 - bpm0) * u)
        k += 1


OST = ['C2', 'C2', 'Db2', 'C2', 'C2', 'Eb2', 'Db2', 'C2']


def ostinato(t0, t1, step, g0, g1, v0, v1, seed=0, viola=False, accent_every=4):
    """Low even pulses, no dance: spiccato cello and bass, rarely violas, always on the grid."""
    k = int(round((t1 - t0) / step))
    dt = (t1 - t0) / k
    for i in range(k):
        t = t0 + i * dt
        u = i / max(1, k - 1)
        nm = OST[(i + seed) % len(OST)]
        acc = i % accent_every == 0
        v = min(1.0, v0 + (v1 - v0) * u + (0.15 if acc else 0.0))
        g = g0 + (g1 - g0) * u + (2.0 if acc else 0.0)
        note('vc_spic', nm, t, dt * 0.8, vel=v, g=g, rel=0.12, rr=i)
        note('cb_spic', M(nm) - 12 if acc else nm, t, dt * 0.8, vel=v, g=g - 2.0, rel=0.14, rr=i)
        if viola:
            note('va_spic', M(nm) + 12, t, dt * 0.7, vel=v * 0.8, g=g - 6.0, rel=0.1, rr=i + 1)


# ==========================================================================================================================
# HOOK 0-3: clicks, rising hum, hum cut dead at 3.0, one thin high ring
# ==========================================================================================================================
def sec_hook():
    log('hook')
    steps_t = front_steps()               # the land department's jolts on threes
    steps = [(0.0, 1.0)]
    for k, t in enumerate(steps_t):
        u = k / (len(steps_t) - 1)
        c = Y.relay_click(100 + k, 0.7 + 0.45 * u, 0.1 + 0.6 * u)
        hit('sfx', c, t, -5 + 4 * u if k else 0)
        if k:
            steps += [(t - 0.001, 1.0 - (k - 1) / (len(steps_t) - 1)), (t + 0.001, 1.0 - k / (len(steps_t) - 1))]
    steps += [(0.95, 0.0), (1.1, 0.0)]
    ch = Y.city_hum(1.1, 110)
    hit('sfx', ride(ch, steps), 0.0, -7)
    # the rising hum in the wires, bending from C to Db and opening up; cut dead by the 3.0 gate
    t0 = 0.6
    d = C['ringFace'] - t0 + 0.2
    h = Y.wire_hum(d, 120)
    env = [(0, 0), (0.4, 0.16), (1.4, 0.45), (1.9, 0.72), (d, 1.0)]
    hit('sfx', ride(h, env), t0, 1.0)
    # the same hum in the section: basses and celli bend up with it (real strings under the buzz)
    b_pts = [(0, 0.0), (0.5, 0.15), (d, 1.0)]
    gliss('cb_trem', 'C2', t0, d, b_pts, vel=0.6, g=-9, att=0.5, rel=0.05, shape=[(0, 0.3), (d, 1.0)])
    gliss('vc_trem', 'C2', t0 + 0.2, d - 0.2, b_pts, vel=0.6, g=-8, att=0.4, rel=0.05, shape=[(0, 0.25), (d - 0.2, 1.0)])
    gliss('vc_trem', 'G2', t0 + 0.6, d - 0.6, b_pts, vel=0.6, g=-12, att=0.3, rel=0.05, shape=[(0, 0.2), (d - 0.6, 1.0)])
    # the pulse runs the cable, accelerates from 1.5 down the last span and slams into the barrel base on frame 46
    slam = 46 / 24.0
    hit('sfx', ride(Y.cable_rush(1.0, 130), [(0, 1), (0.45, 0.6), (0.6, 0.0), (1.0, 0.0)]), 1.0, -4)
    hit('sfx', Y.cable_accel(slam - 1.5, 131), 1.5, -2)
    hit('world', Y.barrel_slam(140), slam, -3)
    # the POWER counter, frames 48-71: a very quiet fast relay under the hum, every other frame
    for k, f in enumerate(range(48, 72, 2)):
        hit('sfx', Y.relay_click(160 + k, 0.22, 0.25), f / 24.0, -19)
    # the ring: starts under the hum, is all that remains at 3.0, dies with the last lamp
    ring(C['ringTurn'], C['lampOut'], -31)
    hit('hush', Y.relay_click(150, 0.35, 0.05), C['lampOut'], -42)


# ==========================================================================================================================
# 4.5-13.5 dread: drones from nothing, surge, lever, ostinato, hammer
# ==========================================================================================================================
def sec_dread():
    log('dread')
    t, end = C['ignite'], SH['s07']
    d = end - t
    swell = [(0, 0.5), (3.5, 1.0), (d, 1.4), (d + 0.3, 0.0)]
    note('cb_trem', 'C2', t, d, vel=0.45, g=-10, att=0.6, rel=0.2, shape=swell)
    note('cb_sus', 'C1', t, d, vel=0.35, g=-11, att=1.2, rel=0.2, shape=swell)
    note('vc_trem', 'C2', t + 0.4, d - 0.4, vel=0.35, g=-13, att=1.4, rel=0.2, shape=swell)
    note('vc_trem', 'Db2', t + 1.2, d - 1.2, vel=0.3, g=-16, att=1.8, rel=0.2, shape=swell)
    note('tu_sus', 'C2', t + 0.8, d - 0.8, vel=0.3, g=-16, att=2.0, rel=0.2, shape=swell)
    note('va_trem', 'Db4', t + 1.5, d - 1.5, vel=0.2, g=-24, att=2.0, rel=0.2)
    note('vn_trem', 'C5', t + 2.0, d - 2.0, vel=0.2, g=-27, att=2.0, rel=0.2)
    note('vn_trem', 'Db5', t + 2.2, d - 2.2, vel=0.2, g=-27, att=2.0, rel=0.2)
    hit('sub', X.st(X.thump(58, 26, 2.2, 5.0, 200) * 1.0, 0), t, -3)
    hit('perc', ride(lp(Y.N('gong_roll', 0.5, 0.7, 7.0), 1000), [(0, 0), (2.5, 1), (7, 0.2)]), t, -9)
    hit('sfx', Y.metal_groan(4.0, 203, 0.7, 1.0, 0.5), t, -13)
    hit('sfx', Y.metal_groan(5.0, 204, 0.5, 1.0, 0.5), t + 3.5, -14)
    # the semitone threat in low horns, twice
    for t1, gg in [(t + 1.0, -14), (C['surge'] + 1.0, -11)]:
        note('hn_sus', 'C3', t1, 1.2, vel=0.35, g=gg, att=0.3, rel=0.25)
        note('hn_sus', 'Db3', t1 + 1.15, 1.8, vel=0.4, g=gg + 1, att=0.2, rel=0.5)
        note('tb_sus', 'C2', t1, 3.0, vel=0.3, g=gg - 3, att=0.7, rel=0.6)
    # surge: arcs and the white pulse leaving
    t = C['surge']
    hit('sfx', Y.arc_burst(1.4, 210, 1.4), t, 3.0)
    hit('sfx', Y.pulse_whoosh(1.3, 212, -0.8, 0.6), t + 0.1, -2)
    hit('sub', X.st(X.thump(80, 34, 0.5, 1.4, 215), 0), t, -6)
    hit('sub', X.st(X.thump(95, 36, 0.3, 1.0, 216), 0), t + 0.3, -8)
    # the ostinato stirs just before the lever and locks on it
    t = C['lever']
    for i, tt in enumerate((t - 1.0, t - 0.5)):
        note('vc_spic', 'C2', tt, 0.3, vel=0.5, g=-14 + 2 * i, rel=0.1, rr=i)
    ostinato(t, end, 0.5, -11, -7, 0.55, 0.85, 0)
    # breakers: rows flipping on the 0.25 grid, each row a tight spray of contacts, ka-CHUNK on the last lever
    r = rng(220)
    for row, tr in enumerate(np.arange(0.0, 2.0, 0.25)):
        for j in range(3 + (row % 2)):
            tb_ = t + tr + 0.018 * j + r.uniform(0, 0.006)
            hit('world', Y.breaker_clack(230 + row * 5 + j, 0.75, float(r.uniform(-0.7, 0.7))), tb_, -9 - j * 1.5)
    hit('world', Y.lever_chunk(260), t + 2.25, -1)
    hit('perc', X.S('bd2_mf', 0.75), t + 2.25, -5)
    # the low brass under the breakers
    note('tb_sus', 'C2', t, 2.3, vel=0.45, g=-11, att=0.7, rel=0.4)
    note('hn_sus', 'G2', t + 0.5, 2.0, vel=0.45, g=-13, att=0.7, rel=0.4)
    # cannon, fans: the pulse grows, Fm then Cm, timpani on the beats, hammer wound up
    t = SH['s06']
    hit('world', ride(Y.fan_thrum(end - t, 270), [(0, 0), (0.4, 1), (end - t, 1)]), t, -16)
    for i in range(int(round((end - t) / 0.5))):
        tt = t + i * 0.5
        timp('C2', tt, -11 + 0.6 * i + (3 if i % 2 == 0 else 0), drum=2, dur=1.4)
    hn = 'hn_sus'
    note(hn, 'Eb3', t, 1.0, vel=0.5, g=-12, att=0.4, rel=0.3)
    note(hn, 'G3', t, 1.0, vel=0.5, g=-13, att=0.4, rel=0.3)
    note('tb_sus', 'C2', t, 1.0, vel=0.5, g=-12, att=0.5, rel=0.3)
    h = C['hammer']
    chord(hn, ['G3', 'C4', 'Eb4'], h, end - h, vel=0.65, g=-11, att=0.4, rel=0.15, shape=[(0, 0.5), (end - h, 1.3), (end - h + 0.3, 1.0)])
    chord('tb_sus', ['C2', 'G2'], h, end - h, vel=0.65, g=-10, att=0.5, rel=0.15, shape=[(0, 0.5), (end - h, 1.3), (end - h + 0.3, 1.0)])
    note('tu_sus', 'C2', h, end - h, vel=0.6, g=-11, att=0.5, rel=0.15)
    chord('vn_trem', ['G4', 'Ab4'], h, end - h, vel=0.4, g=-14, att=0.8, rel=0.15)
    hit('sfx', Y.hammer_ratchet(end - h, 280), h, -4)


# ==========================================================================================================================
# 13.5-18 fear held down, scope
# ==========================================================================================================================
def sec_fear():
    log('fear')
    t = SH['s07']
    end = C['barrage']
    d = end - t
    heart(t, end, 60, 74, 0.55, 1.0, -7, seed=300)
    note('cb_trem', 'C2', t, d, vel=0.35, g=-14, att=0.6, rel=0.2, shape=[(0, 1), (d, 1.6)])
    note('va_trem', 'C3', t, d, vel=0.25, g=-22, att=0.8, rel=0.2)
    note('va_trem', 'Db3', t + 0.3, d - 0.3, vel=0.25, g=-23, att=1.0, rel=0.2)
    # a held note in the bassoon: the swallow, a held fear
    note('bn', 'C3', t + 0.5, 2.5, vel=0.35, g=-18, att=1.0, rel=0.8)
    # cockpit hum, sealed, faint
    n = secs(d)
    cpt = lp(bp(Y.noise2(n, 305), 70, 300), 340) * 0.5
    hit('sfx', cpt, t, -8)
    # scope: the reticle closes in, ticks accelerating, high whisper
    s = SH['s08']
    for k in range(8):
        tt = s + k * 0.25
        hit('sfx', Y.reticle_tick(310 + k), tt, -19 + 1.4 * k)
    note('vn_trem', 'G5', s, end - s, vel=0.3, g=-24, att=0.6, rel=0.1)
    note('vn_trem', 'Db6', s + 0.3, end - s - 0.3, vel=0.3, g=-25, att=0.8, rel=0.1)
    # the pulse returns under the scope, at a whisper
    ostinato(s + 0.0, end, 0.5, -19, -13, 0.4, 0.55, 3)


# ==========================================================================================================================
# 18-23.5 barrage, the answer
# ==========================================================================================================================
def sec_barrage():
    log('barrage')
    t = C['barrage']
    a = C['answer']
    ostinato(t, a, 0.25, -7, -2, 0.75, 1.0, 1, viola=True)
    for i in range(int(round((a - t) / 0.5))):
        tt = t + i * 0.5
        timp('C2', tt, -8 + 1.0 * i, drum=2, dur=1.2)
        hit('perc', X.S('bd2_f', 0.8, 1.2), tt, -10 + 0.9 * i)
    hit('perc', X.S('gong_mf', 0.8), t, -6)
    hit('perc', X.S('crash_ff', 0.95), t, -13)
    # horns in C minor, sustained stabs, cold (no fanfare rhythm)
    for tt, ns, gg in [(t, ['G3', 'C4', 'Eb4'], -8), (t + 1.0, ['Gb3', 'C4', 'Eb4'], -7), (t + 2.0, ['G3', 'C4', 'Eb4'], -6)]:
        chord('hn_sus', ns, tt, 0.9, vel=0.8, g=gg, att=0.05, rel=0.3)
        chord('tb_sus', ['C2', 'G2'], tt, 0.9, vel=0.8, g=gg - 1, att=0.05, rel=0.3)
    chord('vn_trem', ['C5', 'Db5'], t, a - t, vel=0.55, g=-12, att=0.4, rel=0.1)
    note('vc_trem', 'C3', t, a - t, vel=0.55, g=-11, att=0.3, rel=0.1)
    # rockets: a ripple left and right, on the grid with small human error
    r = rng(330)
    for i in range(16):
        tt = t + i * 0.16 + r.uniform(0, 0.03)
        hit('world', Y.rocket(340 + i, float(r.uniform(-0.8, 0.8)), 2.0), tt, -7)
    # 21.0 the answer: the coral thread, domes one after another
    t = a
    end = SH['s11']
    hit('sfx', Y.beam_zap(360), t, 2)
    hit('beam', ride(Y.beam_core(end - t, 361, 'coral'), [(0, 0.8), (0.3, 1), (end - t, 1)]), t, 5)
    tutti(t, end - t, {'tu': ['C2'], 'tb': ['C2', 'Db3'], 'hn': ['G3', 'Ab3', 'C4'], 'cb': ['C2'], 'ct': ['C2', 'Db3'], 'vt': ['C5', 'Db5', 'G5']}, g=-3, vel=0.85,
          att=0.08, rel=0.1, shape=[(0, 0.75), (end - t, 1.2), (end - t + 0.1, 0.0)])
    low_hit(t, -5)
    r = rng(370)
    domes = [0.35, 0.78, 1.1, 1.45, 1.72, 1.98, 2.18, 2.34]
    for i, dd in enumerate(domes):
        hit('world', Y.boom(380 + i, 0.7 + 0.08 * i, 2.0 - 0.14 * i, float(r.uniform(-0.75, 0.75))), t + dd, -1 + 0.4 * i)


# ==========================================================================================================================
# 23.5-29 the girl, the core, the trigger: tension up to the first silence
# ==========================================================================================================================
def sec_core():
    log('girl, core')
    t = SH['s11']
    d = C['coreOpen'] - t
    # her calm: a thin open fifth in the hush bus, one slow heart
    note('vn_sus', 'C5', t + 0.05, d, vel=0.25, g=-26, att=0.4, rel=0.25, bus='hush')
    note('vn_sus', 'G5', t + 0.05, d, vel=0.25, g=-29, att=0.4, rel=0.25, bus='hush')
    heart(t + 0.2, t + d, 56, 56, 0.6, 0.6, -16, bus='hush', seed=400)
    # the core: wheels groan open, choir and brass climb, heart accelerates to the trigger
    t = C['coreOpen']
    end = C['fire1'] - 0.5        # 28.0: everything gates off
    d = end - t
    up = [(0, 0.35), (d, 1.4), (d + 0.1, 1.4)]
    hit('sfx', Y.metal_groan(d + 0.2, 405, 0.6, 1.2, 0.6), t, -7)
    heart(t, end, 72, 132, 0.7, 1.0, -7, seed=410)
    note('cb_trem', 'C2', t, d, vel=0.5, g=-9, att=0.3, rel=0.05, shape=up)
    chord('vc_trem', ['C2', 'Db2'], t, d, vel=0.5, g=-10, att=0.3, rel=0.05, shape=up)
    chord('va_trem', ['Db4', 'C4'], t + 0.3, d - 0.3, vel=0.4, g=-14, att=0.6, rel=0.05, shape=up)
    chord('vn_trem', ['G5', 'Ab5', 'C6'], t + 0.5, d - 0.5, vel=0.5, g=-17, att=0.7, rel=0.05, shape=up)
    chord('hn_sus', ['G3', 'Eb4'], t, d, vel=0.6, g=-10, att=0.5, rel=0.05, shape=up)
    chord('hn_sus', ['Eb3'], t, d, vel=0.6, g=-8, att=0.5, rel=0.05, shape=up)
    chord('tb_sus', ['C2', 'Eb3'], t, d, vel=0.6, g=-10, att=0.5, rel=0.05, shape=up)
    note('tu_sus', 'C2', t, d, vel=0.6, g=-11, att=0.5, rel=0.05, shape=up)
    for i, n in enumerate(['C3', 'G3', 'Eb4']):
        choir(n, t, d, 420 + i, 10, 'a', att=0.6, rel=0.05, g=-9, shape=up)
    for i, n in enumerate(['C4', 'Db5']):
        choir(n, t + 0.4, d - 0.4, 430 + i, 10, 'a', att=0.6, rel=0.05, g=-11, shape=up)
    roll = varispeed(load(X.P['timp_roll2']), 0.72)[:secs(d)]
    add(B['perc'], fade((roll * np.linspace(0.05, 1.0, len(roll))[:, None] ** 2).copy(), 0.1, 0.05), t, db(-4))
    # 28.0-29.0: silence. ring only. 28.5 trigger, hammer falls.
    ring(end + 0.02, C['muzzle'], -29)
    hit('hush', Y.trigger_click(450), C['fire1'], -33)


# ==========================================================================================================================
# 29-36.5 FIRE 1 and the miss
# ==========================================================================================================================
CM_TUTTI = {'tu': ['C2'], 'cb': ['C1', 'C2'], 'tb': ['C2', 'G2', 'C3'], 'hn': ['C3', 'Eb3', 'G3', 'C4'], 'tp': ['C4', 'Eb4', 'G4'],
            'vc': ['C2', 'G2', 'C3'], 'va': ['G3', 'C4', 'Eb4'], 'vn': ['G4', 'C5', 'Eb5'], 'vt': ['G5', 'C6']}


def sec_fire1():
    log('fire 1')
    t = C['muzzle']
    hit('sub', Y.muzzle_blast(500), t, -1)
    V = dict(CM_TUTTI, cm=['C3', 'G3', 'C4', 'Eb4'], cf=['G4', 'C5', 'Eb5'])
    tutti(t, 1.5, V, g=6, shape=[(0, 1.0), (0.4, 0.8), (1.4, 0.5), (2.8, 0.0)], rel=1.4)
    low_hit(t, 4, 'gong_ff')
    # the beams: ice-blue from the muzzle, coral from the rings, twisting around each other
    end = C['impact'] - 0.2
    t1 = SH['s15']
    hd = end - t
    uh = np.arange(secs(hd)) / SR
    hero = Y.beam_core(hd, 510, 'hero') * (0.55 + 0.45 * np.clip((uh - (t1 - t)) / 0.6, 0, 1))[:, None]
    co = Y.beam_core(end - t1, 511, 'coral')
    hb = Y.beam_body(hd, 512, 1.4)
    tw = end - t1
    # helix: the two beams trade places in the stereo field, 1.4 rotations per second, tightening
    a = np.arange(secs(tw)) / SR
    ph = 2 * np.pi * (1.3 * a + 0.3 * a ** 2)
    hero2 = Y.rotate(hero[-len(ph):], np.sin(ph))
    co2 = Y.rotate(co, -np.sin(ph))
    hit('beam', hero[:secs(t1 - t)], t, 10)
    add(B['beam'], hero2, t1, db(10))
    hit('beam', co2, t1, 7)
    hit('beam', hb, t, 3)
    # the twist: minor, climbing, with the cross as a tear
    t = t1
    cr = C['cross']
    hit('sfx', Y.air_tear(530), cr - 0.96, 6)
    hit('perc', X.S('crash_fff', 0.85), cr, -10)
    hit('sub', X.st(X.thump(88, 32, 0.7, 2.0, 531) * 1.1, 0), cr, 1)
    chord('hn_sus', ['C4', 'Db4'], cr, 2.1, vel=0.85, g=-5, att=0.05, rel=0.2, shape=[(0, 1.2), (0.3, 0.7), (2.1, 1.1)])
    chord('tb_sus', ['C2', 'Db3'], cr, 2.1, vel=0.9, g=-6, att=0.05, rel=0.2, shape=[(0, 1.2), (0.3, 0.7), (2.1, 1.1)])
    note('tu_sus', 'C2', cr, 2.1, vel=0.8, g=-7, att=0.05, rel=0.2)
    dd = end - t
    for k, (n, gg) in enumerate([('C5', -9), ('Db5', -10), ('G4', -11)]):
        gliss('vn_trem', n, t, dd, [(0, 0), (dd, 7)], vel=0.8, g=gg, att=0.3, rel=0.05, shape=[(0, 0.5), (dd, 1.6)], rr=k)
    gliss('va_trem', 'C4', t, dd, [(0, 0), (dd, 6)], vel=0.7, g=-12, att=0.3, rel=0.05, shape=[(0, 0.5), (dd, 1.5)])
    chord('vc_trem', ['C2', 'G2'], t, dd, vel=0.7, g=-8, att=0.3, rel=0.05, shape=[(0, 0.6), (dd, 1.2)])
    note('cb_trem', 'C2', t, dd, vel=0.7, g=-8, att=0.3, rel=0.05, shape=[(0, 0.6), (dd, 1.2)])
    for i, n in enumerate(['C3', 'G3', 'C4', 'Db5', 'Eb5']):
        choir(n, t, dd, 540 + i, 11, 'a', att=0.4, rel=0.05, g=-7 if i < 3 else -10, shape=[(0, 0.5), (dd, 1.4)])
    roll = varispeed(load(X.P['timp_roll']), 0.72)[:secs(dd)]
    add(B['perc'], fade((roll * np.linspace(0.12, 1.0, len(roll))[:, None] ** 1.7).copy(), 0.1, 0.05), t, db(-1))
    for i in range(int(round(dd / 0.5))):
        hit('perc', X.S('bd2_f', 0.8, 1.2), t + i * 0.5, -9 + i * 1.2)
    # 33.5 IMPACT: the far mountain, then the ridge
    t = C['impact']
    hit('world', Y.twin_explosion(540), t, 1)
    V = {'tu': ['C2'], 'cb': ['C1', 'Gb2'], 'tb': ['C2', 'Gb2', 'Db3'], 'hn': ['C3', 'Gb3', 'Ab3', 'Db4'], 'tp': ['Ab4', 'Db5'],
         'vc': ['C2', 'Gb2'], 'va': ['Gb3', 'Ab3', 'Db4'], 'vt': ['Gb5', 'Ab5', 'Db6'], 'cm': ['C3', 'Gb3', 'Ab3'], 'cf': ['Db4', 'Ab4', 'Db5']}
    tutti(t, 1.4, V, g=6, shape=[(0, 1.0), (0.5, 0.8), (1.4, 0.45), (2.9, 0.0)], rel=1.5)
    low_hit(t, 4, 'gong_ff')
    # the wall of fire, burning down to the rumble of the next shot
    hit('world', ride(X.dust_roar(4.5, 570), [(0, 1), (3.0, 1.0), (4.5, 0.15)]), t + 0.3, -7)
    n = secs(6.0)
    bed = lp(Y.noise2(n, 575, brown), 240) * env_points(n, [(0, 0), (0.5, 1), (3.5, 0.7), (6, 0)])[:, None]
    hit('sub', bed, t + 0.3, -8)


# ==========================================================================================================================
# 36.5-43.5 horror, resolve, recharge, the second beam on its way
# ==========================================================================================================================
def sec_recharge():
    log('recharge')
    t = C['recharge']
    a = C['align']
    # the gauge restarts: dry ticks on the grid
    for i in range(int(round((C['strike'] - 0.5 - t) / 0.5))):
        tt = t + i * 0.5
        hit('sfx', Y.metal_tick(600 + i, 1250), tt, -16 + 0.4 * i)
    heart(t, C['strike'] - 0.5, 72, 136, 0.7, 1.0, -7, seed=610)
    d = a - t
    note('cb_trem', 'C2', t, d, vel=0.45, g=-11, att=0.3, rel=0.2, shape=[(0, 1), (d, 1.5)])
    chord('vc_trem', ['C2', 'Db2'], t, d, vel=0.4, g=-13, att=0.4, rel=0.2)
    chord('va_trem', ['Db4', 'C4'], t, d, vel=0.3, g=-17, att=0.5, rel=0.2)
    # resolve: one horn, trembling upward
    for tt, n, dd, gg in [(t + 1.5, 'C3', 0.5, -10), (t + 2.0, 'Eb3', 0.5, -9), (a - 0.0, 'F3', 1.0, -8)]:
        note('hn_sus', n, tt, dd + 0.05, vel=0.6, g=gg, att=0.08, rel=0.25)
    # cockpit roar far away (the fire outside), low
    n = secs(d + 2.5)
    rb = lp(Y.noise2(n, 615, brown), 220) * (env_points(n, [(0, 1), (d + 2.5, 0.5)]))[:, None]
    hit('sub', rb, t, -14)
    # aligns: ostinato, then double time, choir Cm, Abm, Bbm over C, timpani roll
    t = a
    e = C['strike'] - 0.5
    mid = t + 1.5
    ostinato(t, mid, 0.5, -9, -6, 0.65, 0.85, 2)
    ostinato(mid, e, 0.25, -6, -2, 0.85, 1.0, 5, viola=True)
    note('tu_sus', 'C2', t, e - t, vel=0.6, g=-11, att=0.5, rel=0.1, shape=[(0, 0.6), (e - t, 1.2)])
    note('cb_trem', 'C2', t, e - t, vel=0.55, g=-10, att=0.3, rel=0.1, shape=[(0, 0.7), (e - t, 1.2)])
    # Cm, Cdim, Bbm over the C pedal, no major colour
    ch = [(t, 1.0, ['C3', 'G3'], ['C4', 'Eb4', 'G4'], ['G3', 'Eb4'], 0.8), (t + 1.0, 1.0, ['C3', 'Gb3'], ['C4', 'Eb4', 'Gb4'], ['Gb3', 'Eb4'], 1.0),
          (t + 2.0, e - t - 2.0, ['Bb3', 'Db4'], ['Db4', 'F4', 'Bb4'], ['Bb3', 'F4'], 1.2)]
    for k, (t0, d0, low, high, hn, g0) in enumerate(ch):
        for i, nn in enumerate(low):
            choir(nn, t0, d0, 620 + k * 10 + i, 10, 'a', att=0.15, rel=0.1, g=-8 + g0)
        for i, nn in enumerate(high):
            choir(nn, t0, d0, 660 + k * 10 + i, 12, 'a', att=0.15, rel=0.1, g=-10 + g0)
        chord('hn_sus', hn, t0, d0, vel=0.7, g=-11 + g0, att=0.1, rel=0.08)
    chord('tb_sus', ['C2', 'G2'], t, e - t, vel=0.6, g=-11, att=0.4, rel=0.1, shape=[(0, 0.7), (e - t, 1.3)])
    chord('vn_trem', ['C5', 'Db5'], t, e - t, vel=0.55, g=-14, att=0.4, rel=0.08, shape=[(0, 0.6), (e - t, 1.4)])
    hit('sfx', Y.metal_groan(3.0, 650, 0.5, 1.0, 0.5), t, -10)
    roll = varispeed(load(X.P['timp_roll']), 0.72)[:secs(e - t)]
    add(B['perc'], fade((roll * np.linspace(0.05, 1.0, len(roll))[:, None] ** 2).copy(), 0.15, 0.05), t, db(-3))
    # ring in the gap
    ring(e + 0.02, C['strike'], -29)
    # 42.0 strike: the coral beam on its way; everything rises through the Tortoise's jump, then a held breath before the impact
    t = C['strike']
    h = C['shieldHit'] - HOLD
    d = h - t
    TT = tortoise_times()
    cr, la, ai, ld, pl = TT['crouchS'] - t, TT['launch'] - t, TT['air'] - t, TT['land'] - t, TT['plant2'] - t
    rise = [(0, 0.28), (cr, 0.5), (la, 0.85), (ld, 1.3), (d, 1.45), (d + 0.1, 0.0)]
    hit('sfx', Y.beam_zap(670), t, 3)
    hit('beam', ride(Y.beam_core(d, 671, 'coral'), [(0, 0.25), (cr, 0.45), (la, 0.7), (ld, 1.0), (d, 1.1)]), t, 8)
    hit('beam', ride(Y.beam_body(d, 672, 1.1), [(0, 0.25), (cr, 0.45), (la, 0.7), (ld, 1.0), (d, 1.1)]), t, 5)
    hit('sfx', Y.pulse_whoosh(d, 673, -0.2, 0.2), t, 0)
    tutti(t, d, {'tu': ['C2'], 'tb': ['C2', 'Db3'], 'hn': ['G3', 'Eb4'], 'cb': ['C2'], 'ct': ['C2', 'Db2'], 'vt': ['C6', 'Db6']}, g=0, vel=0.9, att=0.1, rel=0.05, shape=rise)
    for k, (n, gg) in enumerate([('C3', -5), ('Db4', -7)]):
        gliss('hn_sus', n, t, d, [(0, 0), (d, 5)], vel=0.85, g=gg, att=0.08, rel=0.05, shape=rise, rr=k)
    for k, (n, gg) in enumerate([('C5', -11), ('Db5', -12), ('G4', -12)]):
        gliss('vn_trem', n, t + cr, d - cr, [(0, 0), (d - cr, 7)], vel=0.85, g=gg, att=0.2, rel=0.05, shape=[(0, 0.5), (d - cr, 1.5)], rr=k)
    heart(t, h, 112, 150, 0.8, 1.0, -8, seed=680)
    ostinato(t + cr, t + ld, 0.25, -6, -1, 0.85, 1.0, 4, viola=True)
    roll = varispeed(load(X.P['timp_roll2']), 0.72)[:secs(d - cr)]
    add(B['perc'], fade((roll * np.linspace(0.1, 1.0, len(roll))[:, None] ** 1.8).copy(), 0.1, 0.05), t + cr, db(-3))
    # the line that climbs with him: G (crouch), C (he leaves the ground), Db (in the air), C (he lands)
    for tt, nn, d0, gg in [(cr, 'G3', la - cr, -7), (la, 'C4', 0.62, -6), (la + 0.62, 'Db4', ld - la - 0.62, -5), (ld, 'C4', d - ld, -4)]:
        note('hn_sus', nn, t + tt, d0 + 0.04, vel=0.9, g=gg, att=0.05, rel=0.08)
        note('hn_sus', M(nn) - 12, t + tt, d0 + 0.04, vel=0.9, g=gg - 3, att=0.05, rel=0.08)
    for i, (nn, gg) in enumerate([('C3', -9), ('G3', -10), ('Eb4', -11), ('C5', -12)]):
        choir(nn, t + cr, d - cr, 690 + i, 11, 'a', att=0.5, rel=0.05, g=gg, shape=[(0, 0.5), (la - cr, 0.8), (d - cr, 1.5)])
    # his body: the crouch loads steel, the launch cracks rock, air, two feet down
    hit('sfx', Y.metal_groan(la - cr + 0.25, 695, 0.6, 1.2, 0.6), t + cr, -5)
    hit('sub', X.st(X.thump(88, 30, 0.5, 1.5, 696) * 1.1, 0), t + la, 0)
    hit('world', X.stone_crunch(1.1, 697, 1.0), t + la, -3)
    hit('sfx', Y.pulse_whoosh(ld - la, 698, -0.6, 0.6), t + la, 2)
    for tt, gg, sd in [(ld, 2, 700), (pl, -1, 703)]:
        hit('sub', X.st(X.thump(80, 26, 0.6, 1.6, sd) * 1.2, 0), t + tt, gg)
        hit('world', X.stone_crunch(1.0, sd + 1, 1.1), t + tt, gg - 3)
        hit('perc', X.S('bd2_ff', 0.72, 1.2), t + tt, gg - 3)
    ring(h + 0.02, C['shieldHit'], -29)


# ==========================================================================================================================
# 43.5-57 shield, melt, agony
# ==========================================================================================================================
def sec_shield():
    log('shield and melt')
    t = C['shieldHit']
    me = C['melt']
    fire2 = C['fire2']
    cutoff = fire2 - 0.8
    hit('sub', Y.shield_slam(700), t, 1)
    V = dict(CM_TUTTI, cm=['C3', 'G3', 'C4', 'Eb4'], cf=['G4', 'C5', 'Eb5'])
    tutti(t, 0.7, V, g=6, shape=[(0, 1.0), (0.3, 0.8), (0.7, 0.5), (1.6, 0.0)], rel=0.9)
    low_hit(t, 4, 'gong_ff')
    # beam roar bed under everything until the second silence
    d = cutoff - t
    n = secs(d)
    co = Y.beam_core(d, 710, 'coral')
    bb = Y.beam_body(d, 711, 1.3)
    ts = np.arange(n) / SR
    # the cockpit shots: low-pass the world (boy, then girl)
    f = env_points(n, [(0, 18000), (C['melt'] - t + 3.4, 18000), (C['melt'] - t + 3.5, 900), (C['melt'] - t + 7.9, 650),
                       (C['melt'] - t + 8.0, 18000), (d, 18000)])
    co = sweep_lp(co, f)
    bb = sweep_lp(bb, f)
    lv = env_points(n, [(0, 1), (C['melt'] - t, 1.0), (C['melt'] - t + 3.5, 1.2), (C['melt'] - t + 5.5, 1.0), (C['melt'] - t + 8.0, 0.75),
                        (C['melt'] - t + 8.1, 1.45), (d, 1.7)])
    hit('beam', ride(co, list(zip(ts[::4800], lv[::4800]))), t, 6)
    hit('beam', ride(bb, list(zip(ts[::4800], lv[::4800]))), t, 4)
    # the short plateau between the slam and the melt
    note('cb_trem', 'C2', t, me - t, vel=0.65, g=-8, att=0.05, rel=0.3)
    chord('vc_trem', ['C2', 'G2'], t, me - t, vel=0.6, g=-9, att=0.05, rel=0.3)
    for i, (nn, gg) in enumerate([('C3', -10), ('G3', -11), ('Eb4', -13)]):
        choir(nn, t, me - t, 730 + i, 10, 'a', att=0.1, rel=0.3, g=gg)
    timp('C2', t + 0.5, -6, drum=2, dur=1.2)

    # -------------------------------- the melt: 46.5 to 56.2, unbroken agony
    t = me
    d = cutoff - t
    gr = Y.melt_grind(d, 800)
    n2 = len(gr)
    tt2 = np.arange(n2) / SR
    bys = (SH['s22'] - t, SH['s23'] - t, C['shieldGone'] - t)
    # muffle while inside a cockpit, and let it grow
    f = env_points(n2, [(0, 18000), (bys[0], 18000), (bys[0] + 0.05, 1100), (bys[2] - 0.05, 900), (bys[2], 18000), (d, 18000)])
    gr = sweep_lp(gr, f)
    glv = env_points(n2, [(0, 0.4), (bys[0], 1.0), (bys[1], 0.7), (bys[2], 0.8), (bys[2] + 0.1, 1.5), (d, 1.8)])
    add(B['sfx'], gr * glv[:, None], t, db(-2))
    # the semitone pedal and the climbing strings
    note('cb_trem', 'C2', t, d, vel=0.8, g=-6, att=0.05, rel=0.05, shape=[(0, 0.9), (d, 1.4)])
    note('cb_sus', 'C1', t, d, vel=0.8, g=-7, att=0.05, rel=0.05)
    chord('vc_trem', ['C2', 'Db2'], t, d, vel=0.8, g=-7, att=0.05, rel=0.05, shape=[(0, 0.9), (d, 1.4)])
    note('tu_sus', 'C2', t, d, vel=0.7, g=-8, att=0.2, rel=0.05, shape=[(0, 0.7), (d, 1.3)])
    chord('tb_sus', ['C3', 'Db3'], t, d, vel=0.8, g=-9, att=0.3, rel=0.05, shape=[(0, 0.7), (d, 1.3)])
    chord('hn_sus', ['G3', 'Eb4'], t, d, vel=0.75, g=-8, att=0.3, rel=0.05, shape=[(0, 0.7), (d, 1.3)])
    note('va_sus', 'Eb4', t, d, vel=0.7, g=-11, att=0.3, rel=0.05, shape=[(0, 0.7), (d, 1.3)])
    # three climbing voices: a slow unbroken slide up, the sound of it not stopping (rising to the G a third above)
    for k, (nn, gg) in enumerate([('C5', -11), ('Db5', -12), ('G4', -12)]):
        gliss('vn_trem', nn, t, d, [(0, 0), (d, 7)], vel=0.9, g=gg, att=0.2, rel=0.05, shape=[(0, 0.5), (d, 1.5)], rr=k)
    gliss('va_trem', 'Db4', t, d, [(0, 0), (d, 6)], vel=0.7, g=-13, att=0.3, rel=0.05, shape=[(0, 0.5), (d, 1.4)])
    # the wail: a choir held under the slide, widening
    for i, (nn, gg) in enumerate([('C3', -9), ('G3', -10), ('Db5', -10), ('C5', -11), ('Eb5', -12)]):
        choir(nn, t, d, 820 + i, 11, 'a', att=0.5, rel=0.05, g=gg, shape=[(0, 0.5), (bys[0], 0.9), (bys[2], 1.0), (d, 1.5)])
    # relentless pulses: drums tighten as the shield goes
    for i in range(int(round(d / 0.5))):
        tt = t + i * 0.5
        u = i / max(1, d / 0.5)
        timp('C2', tt, -7 + 6 * u, drum=2, dur=1.0)
        if i % 2 == 0:
            hit('perc', X.S('bd2_f', 0.78, 1.5), tt, -8 + 4 * u)
    roll = varispeed(load(X.P['timp_roll2']), 0.72)[:secs(d)]
    add(B['perc'], fade((roll * np.linspace(0.08, 1.0, len(roll))[:, None] ** 1.5).copy(), 0.2, 0.05), t, db(-6))
    # 50-52 fury: brass rip upward, cymbal, choir swell
    b = SH['s22']
    tp_shape = [(0, 0.6), (bys[1] - bys[0], 1.2), (bys[1] - bys[0] + 0.2, 0.0)]
    chord('tp_sus', ['C5', 'Eb5'], b, SH['s23'] - b, vel=0.95, g=-9, att=0.1, rel=0.15, shape=tp_shape)
    gliss('hn_sus', 'G3', b, SH['s23'] - b, [(0, 0), (SH['s23'] - b, 5)], vel=1.0, g=-6, att=0.05, rel=0.1)
    gliss('hn_sus', 'C4', b, SH['s23'] - b, [(0, 0), (SH['s23'] - b, 5)], vel=1.0, g=-7, att=0.05, rel=0.1)
    hit('perc', X.S('crash_fff', 0.85), b, -7)
    # 52-54.5 girl: a white roar far away, inside her cockpit only the huge heart and a thin shaking string
    c = SH['s23']
    gone = C['shieldGone']
    heart(c, gone, 96, 124, 1.0, 1.0, -3, seed=840)
    note('vn_trem', 'C6', c, gone - c, vel=0.5, g=-13, att=0.1, rel=0.1, shape=[(0, 0.6), (gone - c, 1.0)])
    note('vn_trem', 'Db6', c, gone - c, vel=0.5, g=-14, att=0.1, rel=0.1, shape=[(0, 0.6), (gone - c, 1.0)])
    # 54.5 shield gone: metal rips, full weight back
    t = gone
    hit('sfx', Y.rip(860), t, 2)
    hit('sub', X.st(X.thump(80, 26, 0.9, 2.5, 861) * 1.1, 0), t, 1)
    hit('perc', X.S('gong_ff', 0.75), t, -6)
    hit('perc', X.S('crash_fff', 0.9), t, -11)
    d = cutoff - t
    up = [(0, 0.8), (d, 1.5)]
    chord('tp_sus', ['Ab4', 'C5', 'Eb5'], t, d, vel=1.0, g=-9, att=0.08, rel=0.05, shape=up)
    for i, (nn, gg) in enumerate([('G4', -9), ('C5', -9), ('Eb5', -10), ('G5', -12), ('Db6', -13)]):
        choir(nn, t, d, 870 + i, 12, 'a', att=0.1, rel=0.05, g=gg, shape=up)
    hit('sfx', ride(Y.fit(Y.N('sus_scrape', 0.5, 0.9), secs(d)), [(0, 0.3), (d, 1.0)]), t, -8)
    # 56.2-57.0: the gate shuts everything: ring and one last heart
    ring(cutoff + 0.02, fire2, -29)
    hit('hush', X.heartbeat(1.0, 880), cutoff + 0.28, -37)


# ==========================================================================================================================
# 57-65.5 FIRE 2, pierce, core, the fall
# ==========================================================================================================================
def sec_fire2():
    log('fire 2')
    t = C['fire2']
    p = C['pierce']
    hit('sub', Y.muzzle_blast(900, 1.3), t, 2)
    V = dict(CM_TUTTI, cm=['C3', 'G3', 'C4', 'Eb4', 'G4'], cf=['G4', 'C5', 'Eb5', 'G5'], vt=['G5', 'C6', 'Eb6'])
    tutti(t, p - t - 0.1, V, g=6, shape=[(0, 1.15), (0.3, 0.9), (p - t - 0.1, 1.0), (p - t, 0.0)], rel=0.1)
    low_hit(t, 5, 'gong_ff')
    for i in range(int(round((p - t) / 0.5))):
        timp('C2', t + i * 0.5, -3, drum=2, dur=1.0)
        hit('perc', X.S('bd2_ff', 0.75, 1.3), t + i * 0.5, -6)
    d = p - t
    hit('beam', ride(Y.beam_core(d, 910, 'hero'), [(0, 1.1), (d, 1.0)]), t, 12)
    hit('beam', ride(Y.beam_body(d, 911, 1.6), [(0, 1.1), (d, 1.0)]), t, 6)
    # 59 PIERCE
    t = p
    hit('world', Y.pierce_shatter(920), t, 4)
    V = dict(CM_TUTTI, cm=['C3', 'G3', 'C4', 'Eb4'], cf=['G4', 'C5', 'Eb5', 'Db5'], hn=['G3', 'C4', 'Eb4'], vt=['G5', 'C6', 'Db6'], tp=['G4', 'C5', 'Eb5'])
    tutti(t, 1.6, V, g=6, shape=[(0, 1.1), (0.4, 0.8), (1.6, 0.8), (2.0, 0.6)], rel=0.4)
    low_hit(t, 5, 'gong_ff')
    # rings cracking, chords climbing to the implosion
    t0 = t + 1.6
    cb = C['coreBreak']
    hit('sfx', Y.metal_groan(cb - t + 0.2, 930, 0.8, 1.2, 0.7), t, -6)
    cd = cb - t0
    V2 = {'tu': ['C2'], 'tb': ['C2', 'Bb2', 'Db3'], 'hn': ['Bb3', 'Db4', 'F4'], 'cb': ['C2'], 'ct': ['C2', 'Bb2'], 'vt': ['Db5', 'F5', 'Bb5'], 'va': ['Bb3', 'Db4'],
          'cm': ['Bb3', 'Db4'], 'cf': ['F4', 'Bb4', 'Db5']}
    tutti(t0, cd, V2, g=-1, vel=0.85, att=0.1, rel=0.05, shape=[(0, 0.6), (cd, 1.4), (cd + 0.1, 0.0)])
    # 61 core break
    t = cb
    y, pre = Y.implosion(950)
    hit('sub', y, t - pre, 2.5)
    V3 = dict(CM_TUTTI, cm=['C3', 'G3', 'C4', 'Eb4'], cf=['G4', 'C5', 'Eb5'])
    tutti(t, 0.9, V3, g=5, shape=[(0, 1.0), (0.35, 0.8), (0.9, 0.5), (1.5, 0.1)], rel=0.5)
    low_hit(t, 3, 'gong_ff')
    hit('world', X.debris_rattle(4.0, 960, 0.6, 1.5), t + 0.5, -6)
    # 62 fall: the rings topple, bass walks down, minor chord by minor chord, ends on Gm, unresolved
    t = C['fall']
    end = C['silence']
    d = end - t
    hit('sfx', Y.ring_fall(d + 0.2, 1000), t, 1)
    hit('world', Y.water_wall(d + 0.2, 1050), t, 0)
    prog = [(0.0, 'C2', ['C3', 'G3'], ['Eb4', 'G4', 'C5']), (1.0, 'Bb1', ['Bb2', 'F3'], ['Db4', 'F4', 'Bb4']), (2.0, 'Ab1', ['Ab2', 'Eb3'], ['Cb4', 'Eb4', 'Ab4']),
          (3.0, 'G1', ['G2', 'D3'], ['Bb3', 'D4', 'G4'])]
    for k, (dt, bs, lo, hi) in enumerate(prog):
        d0 = (prog[k + 1][0] if k < 3 else d) - dt
        tt = t + dt
        v = 0.9 - 0.08 * k
        g0 = -k * 0.6
        note('tu_sus', bs, tt, d0, vel=v, g=-3 + g0, att=0.06, rel=0.1)
        note('cb_sus', M(bs) - 12, tt, d0, vel=v, g=-3 + g0, att=0.06, rel=0.1)
        note('cb_trem', bs, tt, d0, vel=v, g=-5 + g0, att=0.06, rel=0.1)
        chord('tb_sus', lo, tt, d0, vel=v, g=-3 + g0, att=0.1, rel=0.1)
        chord('hn_sus', lo + hi[:1], tt, d0, vel=v, g=-5 + g0, att=0.1, rel=0.1)
        chord('tp_sus', hi[:1], tt, d0, vel=v * 0.8, g=-13 + g0, att=0.1, rel=0.1)   # the minor third on top
        chord('vc_trem', [bs] + lo, tt, d0, vel=v, g=-6 + g0, att=0.05, rel=0.1)
        chord('va_trem', lo + hi[:1], tt, d0, vel=v, g=-8 + g0, att=0.05, rel=0.1)
        chord('vn_trem', hi, tt, d0, vel=v, g=-10 + g0, att=0.05, rel=0.1)
        for i, nn in enumerate(lo):
            choir(nn, tt, d0, 1100 + k * 10 + i, 10, 'a', att=0.1, rel=0.1, g=-6 + g0)
        for i, nn in enumerate(hi):
            choir(nn, tt, d0, 1150 + k * 10 + i, 11, 'a', att=0.1, rel=0.1, g=-8 + g0)
        timp(bs, tt, -4 + g0, drum=2, dur=2.5)
        hit('perc', X.S('bd_vsco_ff', 0.75), tt, -7 + g0)
    # the last strings glide down as the wall of water falls
    gliss('vn_trem', 'C5', t + 1.0, d - 1.0, [(0, 0), (d - 1.0, -6)], vel=0.7, g=-12, att=0.3, rel=0.05)
    hit('perc', ride(lp(Y.N('gong_roll', 0.6, 0.8, d + 0.3), 1800), [(0, 0.3), (d, 1.0)]), t, -8)


# ==========================================================================================================================
# 65.5-71 aftermath (near silence), hatch; 71- melody; 75- relight; 78 C major
# ==========================================================================================================================
def sec_end():
    log('end')
    t = C['silence']
    h = C['hatchOpen']
    d = h - t
    hit('hush', ride(X.wind(d + 0.6, 1300), [(0, 0.5), (1.2, 0.85), (d, 0.85), (d + 0.6, 0)]), t, -21)
    hit('hush', Y.ember_bed(d, 1320), t, -22)
    # sub bed so the emptiness has weight, decaying from the climax
    n = secs(d)
    hit('hush', ride(lp(Y.noise2(n, 1330, brown), 70), [(0, 1), (3.5, 0.45), (d, 0.3)]), t, -24)
    # the cooling gun: sparse small ticks, and one low tick of the barrel settling
    r = rng(1340)
    tt = t + 0.4
    k = 0
    while tt < h - 0.3:
        hit('hush', Y.metal_tick(1341 + k), tt, -32 + float(r.uniform(-4, 4)))
        tt += float(r.uniform(0.25, 1.2))
        k += 1
    hit('hush', lp(X.footstep_far(1360, 0.25), 240), t + 0.8, -38)   # a distant collapse
    # the boy: quick small footfalls over the plate, then the hot hatch
    s = SH['s29']
    ee = h - 1.4
    tt = s + 0.3
    k = 0
    while tt < ee:
        p = 0.3 * math.sin(k * 1.7)
        hit('hush', Y.footfall(1370 + k, 1.0, p), tt, -43 + 1.2 * k * 0.3)
        tt += 0.22 + 0.03 * math.sin(k)
        k += 1
    hit('hush', Y.hatch_strain(h - ee, 1400), ee, -47)
    hit('hush', Y.hatch_open(1410), h, -37)
    # 71: flute alone, ring held very soft under it (still cold, still the G)
    rel = C['relight']
    note('vib_bow', 'G5', h, rel - h, vel=0.25, g=-40, att=1.0, rel=0.8, bus='wind')
    fl = [(h + 0.05, 'G4', 0.95), (h + 1.0, 'Ab4', 0.5), (h + 1.5, 'G4', 0.5), (h + 2.0, 'Eb4', 0.5), (C['smile'], 'C5', 1.0), (C['smile'] + 1.0, 'Bb4', 0.5)]
    for t0, nn, dd in fl:
        note('fl', nn, t0, dd + 0.08, vel=0.3, g=-13, att=0.1, rel=0.4)
    # 75-78 relight: Ab(add9), Bbsus4 to Bb, swell, then C major on the lamp at 78
    t = rel
    lb = C['lampBack']
    end = DUR
    mid = t + 1.5
    late = t + 2.25
    for tt, nn, dd in [(t, 'C5', 1.0), (t + 1.0, 'Eb5', 0.5), (mid, 'D5', 0.75), (late, 'Eb5', 0.75)]:
        last = nn == 'Eb5' and tt == late
        note('fl', nn, tt, dd if last else dd + 0.08, vel=0.4 + 0.1 * (tt - t), g=-12, att=0.08, rel=0.03 if last else 0.25)
    fin = [(0, 1.0), (0.6, 1.0), (end - lb - 0.45, 0.62), (end - lb, 0.0)]
    note('fl', 'E5', lb, end - lb, vel=0.6, g=-11, att=0.04, rel=0.02, shape=fin)
    note('ob', 'E5', lb, end - lb, vel=0.5, g=-19, att=0.04, rel=0.02, shape=fin)
    sh = lambda d0: [(0, 0.4), (d0, 1.2)]
    # warm strings, soft horns, choir ooh: everything swells toward the lamp
    def voice(t0, d0, bass, va, vn, hn, g0):
        note('cb_sus', bass, t0, d0, vel=0.45, g=-10 + g0, att=0.25, rel=0.2, shape=sh(d0))
        note('vc_sus', M(bass) + 12, t0, d0, vel=0.45, g=-10 + g0, att=0.25, rel=0.2, shape=sh(d0))
        chord('va_sus', va, t0, d0, vel=0.45, g=-13 + g0, att=0.25, rel=0.2, shape=sh(d0))
        chord('vn_sus', vn, t0, d0, vel=0.45, g=-14 + g0, att=0.3, rel=0.2, shape=sh(d0))
        chord('hn_sus', hn, t0, d0, vel=0.5, g=-14 + g0, att=0.3, rel=0.2, shape=sh(d0))
        for i, nn in enumerate(va[:2] + vn[:1]):
            choir(nn, t0, d0, 1500 + int(t0 * 20) + i, 10, 'u', att=0.4, rel=0.2, g=-16 + g0, shape=sh(d0), vib=0.008)
    voice(t, mid - t, 'Ab1', ['Eb3', 'Ab3'], ['C4', 'Eb4', 'Bb4'], ['Ab3', 'Eb4'], 0)
    voice(mid, late - mid, 'Bb1', ['F3', 'Bb3'], ['Eb4', 'F4', 'Bb4'], ['Bb3', 'F4'], 2)
    voice(late, lb - late, 'Bb1', ['F3', 'Bb3'], ['D4', 'F4', 'Bb4'], ['Bb3', 'D4'], 4)
    # the relight: the hook's clicks return as soft relays with harp notes, rising up the scale, district by district
    grid = np.arange(t, lb - 0.01, 0.25)
    notes = ['Ab3', 'C4', 'Eb4', 'Ab4', 'Bb3', 'D4', 'F4', 'Bb4', 'C5', 'Eb5', 'F5', 'Ab5', 'Bb5']
    r = rng(1500)
    for i, tt in enumerate(grid):
        nn = notes[min(i, len(notes) - 1)]
        hit('sfx', Y.relight_tick(1510 + i, float(r.uniform(-0.6, 0.6))), tt, -12 + 0.5 * i)
        note('harp', nn, tt, min(1.2, lb - tt), vel=0.35 + 0.03 * i, g=-14 + 0.3 * i, rel=0.04)
        if tt + 0.125 < lb:           # the front runs on threes: a softer relay between the harp notes
            hit('sfx', Y.relight_tick(1560 + i, float(r.uniform(-0.6, 0.6))), tt + 0.125, -16 + 0.5 * i)
    # a harp sweep into the lamp, ending on C5
    gl = ['G3', 'C4', 'G4', 'Bb4', 'C5']
    for i, nn in enumerate(gl):
        note('harp', nn, lb - 0.2 + i * 0.04, lb - (lb - 0.2 + i * 0.04) + 0.3, vel=0.4 + 0.05 * i, g=-13, rel=0.04)
    # 78: C major at last, warm, not triumphant, held to the end and breathing out to silence
    d = end - lb
    cmaj = {'cb': ['C2'], 'vc': ['C2', 'G2', 'C3'], 'va': ['G3', 'C4', 'E4'], 'vn': ['G4', 'C5', 'E5'], 'hn': ['C3', 'G3', 'C4', 'E4'], 'tb': ['C2', 'G2'], 'cm': ['C3', 'G3', 'C4'], 'cf': ['E4', 'G4', 'C5', 'E5']}
    tutti(lb, d, cmaj, g=0, vel=0.7, att=0.03, rel=0.02, shape=fin)
    note('bells', 'C6', lb, d, vel=0.5, g=-10, rel=0.02, shape=fin)
    note('harp', 'C5', lb, d, vel=0.6, g=-9, rel=0.02, shape=fin)
    note('harp', 'C6', lb, d, vel=0.6, g=-11, rel=0.02, shape=fin)
    hit('sfx', Y.relight_tick(1599, 0.0), lb, -5)
    hit('perc', X.S('bd_vsco_mp', 0.8), lb, -12)
    timp('C2', lb, -10, drum=2)
    # the lamp flickers: two tiny warm tinkles
    for tt, nn, bl, gg in [(lb + 0.15, 'E6', 'G5', -14), (lb + 0.3, 'G6', 'C6', -12)]:
        note('glock', nn, tt, min(1.0, end - tt), vel=0.4, g=gg, rel=0.02, shape=[(0, 1), (end - tt, 0.15)])
        note('bells', bl, tt, min(1.0, end - tt), vel=0.35, g=gg - 6, rel=0.02, shape=[(0, 1), (end - tt, 0.15)])
        hit('sfx', Y.relight_tick(1600 + int(tt * 10), 0.0), tt, -12)


def sec_orrery():
    """The rings clacking home, from orrery.clicks. In a closed gate a clack goes to the hush bus, very small."""
    log('orrery snaps')
    closed = [(a, b) for a, b, f in windows() if f < -60]
    for k, (t, amp, i) in enumerate(orrery_clicks()):
        x = Y.ring_snap(1700 + k, amp, 0.5 - 0.25 * i)
        if any(a <= t < b for a, b in closed):
            hit('hush', x, t, -48 + 6 * math.log10(amp))
        else:
            hit('sfx', x, t, -10 + 6 * math.log10(amp))


# ==========================================================================================================================
# ambience: a low sea wind that only breathes under the dread
# ==========================================================================================================================
def ambience():
    log('ambience')
    t = C['ignite']
    d = C['silence'] - t
    n = secs(d)
    lv = env_points(n, [(0, 0.3), (1.5, 0.8), (d * 0.5, 0.8), (d, 0.5)])
    hit('amb', X.wind(d, 1600, lv), t, -24)


# ==========================================================================================================================
# Mix + master
# ==========================================================================================================================
GROUPS = {'music': ['str', 'brass', 'wind', 'choir', 'harp', 'perc'], 'fx': ['sfx', 'world', 'beam'], 'sub': ['sub']}


def rides():
    """Fader rides (dB): the dynamic contour of the film, from the emotion map."""
    g = C
    s = SH
    # girl's cockpit at 52-54.5: orchestra dips so the heart is on top; the fury 50-52 is the loudest sustained moment
    music = [(0, 0), (s['s22'] - 0.05, 0), (s['s22'], 2), (s['s23'] - 0.05, 2), (s['s23'], -7), (g['shieldGone'] - 0.02, -7), (g['shieldGone'], 2), (g['fire2'], 2), (DUR, 0)]
    fx = [(0, 0), (DUR, 0)]
    return {'music': music, 'fx': fx, 'sub': [(0, 0), (DUR, 0)]}


def windows():
    """Silences and gates, derived from CUES. (t0, t1, floor_dB). Hush bus is never gated."""
    g, s = C, SH
    return [
        (g['ringFace'], g['ignite'], -200),                      # hum cut dead on 3.000, ring alone until ignite
        (g['answer'] - 0.5, g['answer'], -24),                    # hanging before the coral answer
        (s['s11'], g['coreOpen'], -16),                           # the girl: everything dropped
        (g['fire1'] - 0.5, g['muzzle'], -200),                    # silence before fire 1
        (g['impact'] - 0.2, g['impact'], -14),                    # hold before the impact
        (g['strike'] - 0.5, g['strike'], -200),                   # silence before the second coral shot
        (g['shieldHit'] - HOLD, g['shieldHit'], -200),             # held breath before the shield
        (g['fire2'] - 0.8, g['fire2'], -200),                     # silence before fire 2
        (g['pierce'] - 0.15, g['pierce'], -12),                   # hold before the pierce
        (g['coreBreak'] - 0.06, g['coreBreak'], -8),              # tiny gap in the implosion
        (g['silence'], g['hatchOpen'], -200),                     # aftermath
    ]


def gate_env():
    pts = [(0.0, 0.0)]
    gen = np.ones(N)
    for a, b, floor in windows():
        ia, ib = secs(a), secs(b)
        f = db(floor)
        e = np.full(ib - ia, f)
        down = min(ib - ia, secs(0.002))
        e[:down] = np.linspace(1.0, f, down) if floor < -60 else np.linspace(1.0, f, down)
        up = min(ib - ia, secs(0.0006))
        e[-up:] = np.linspace(f, 1.0, up)
        gen[ia:ib] = e
    return gen


def kweight(x):
    b1, a1 = [1.53512485958697, -2.69169618940638, 1.19839281085285], [1, -1.69065929318241, 0.73248077421585]
    b2, a2 = [1, -2, 1], [1, -1.99004745483398, 0.99007225036621]
    return signal.lfilter(b2, a2, signal.lfilter(b1, a1, x, axis=0), axis=0)


def lufs(x):
    k = kweight(x)
    blk, hop = secs(0.4), secs(0.1)
    ms = np.array([np.mean(k[i:i + blk] ** 2, 0).sum() for i in range(0, len(k) - blk, hop)])
    l = -0.691 + 10 * np.log10(ms + 1e-12)
    g = ms[l > -70]
    rel = -0.691 + 10 * np.log10(g.mean()) - 10
    g2 = ms[(l > -70) & (l > rel)]
    return -0.691 + 10 * np.log10(g2.mean())


def true_peak(x):
    return np.abs(signal.resample_poly(x, 4, 1, axis=0)).max()


def softclip(x, knee):
    a = np.abs(x)
    over = a > knee
    y = x.copy()
    h = 1.0 - knee
    y[over] = np.sign(x[over]) * (knee + h * np.tanh((a[over] - knee) / h))
    return y


def limiter(x, ceiling_db=-1.8):
    c = db(ceiling_db)
    up = np.abs(signal.resample_poly(x, 4, 1, axis=0)).max(1)
    pk = up.reshape(-1, 4).max(1)[:len(x)]
    if len(pk) < len(x):
        pk = np.pad(pk, (0, len(x) - len(pk)))
    req = np.minimum(1.0, c / (pk + 1e-12))
    la = secs(0.004)
    g = minimum_filter1d(req, 2 * la + 1)
    h = 48
    m = len(g) // h
    gc = g[:m * h].reshape(m, h).min(1)
    a = math.exp(-1 / (0.15 * 1000))
    out = np.empty(m)
    prev = 1.0
    for i in range(m):
        v = gc[i]
        prev = v if v < prev else prev * a + v * (1 - a)
        out[i] = prev
    gs = np.interp(np.arange(len(x)), np.arange(m) * h + h / 2, out)
    gs = np.minimum(gs, g)
    gs = uniform_filter1d(minimum_filter1d(gs, la + 1), la)
    return x * gs[:, None], 20 * np.log10(gs.min())


def seg_tables():
    """Emotion map as loudness: (t0, t1, target max momentary LUFS). Segment boundaries sit on shot cuts and cues."""
    g, s = C, SH
    main = [(0.0, 3.0, -14.5), (4.5, 6.5, -28), (6.5, 8.0, -23), (8.0, 10.5, -22), (10.5, 13.5, -19.5), (13.5, 16.0, -31), (16.0, 18.0, -29),
            (18.0, 20.5, -19), (21.0, 23.5, -17), (25.5, 28.0, -19.5), (29.0, 30.5, -8.5), (30.5, 33.3, -13), (33.5, 36.5, -8.5), (36.5, 39.0, -24), (39.0, 41.5, -19),
            (42.0, g['shieldHit'] - HOLD, -14), (g['shieldHit'], 46.5, -8.5), (46.5, 50.0, -15), (50.0, 52.0, -13), (52.0, 54.5, -22), (54.5, 56.2, -13), (57.0, 59.0, -8.5), (59.0, 61.0, -8.5),
            (61.0, 62.0, -9), (62.0, 65.5, -14.5), (71.0, 75.0, -33), (75.0, 78.0, -22), (78.0, DUR, -18)]
    hush = [(3.0, 4.15, -32), (23.5, 25.5, -36), (28.0, 29.0, -32), (41.5, 42.0, -32), (56.2, 57.0, -32), (65.5, 68.4, -50)]
    return main, hush


def step_env(segs, trims):
    pts, last = [(0.0, trims[0])], trims[0]
    for (a, b, _), v in zip(segs, trims):
        pts += [(max(0.0, a - 0.02), last), (a + 0.02, v)]
        last = v
    pts.append((DUR, last))
    return pts


def build(trims, htrims):
    main, hush_s = seg_tables()
    Bx = {k: v * db(env_points(N, step_env(main, trims)))[:, None] for k, v in B.items() if k != 'hush'}
    Bx['hush'] = B['hush'] * db(env_points(N, step_env(hush_s, htrims)))[:, None]
    return master(Bx)


def calibrate():
    main, hush_s = seg_tables()
    trims, htrims = [0.0] * len(main), [0.0] * len(hush_s)
    for it in range(7):
        mix = build(trims, htrims)
        g = db(-17 - lufs(mix))
        k = kweight(mix * g)
        nn, hh = secs(0.4), secs(0.05)
        ms = np.array([np.mean(k[i:i + nn] ** 2, 0).sum() for i in range(0, len(k) - nn + 1, hh)])
        mom = -0.691 + 10 * np.log10(ms + 1e-12)
        tt = np.arange(len(mom)) * 0.05 + 0.2
        worst = 0.0
        for arr, tab in ((trims, main), (htrims, hush_s)):
            for i, (a, b, target) in enumerate(tab):
                lead = 0.26 if tab is hush_s else 0.2     # hush windows must not see the last 2 ms of the gate closing
                sel = (tt >= a + lead - 1e-6) & (tt <= b - 0.2 + 1e-6)
                m = mom[sel].max() if sel.any() else target
                dv = float(np.clip(target - m, -14, 14))
                arr[i] += dv * 0.85
                worst = max(worst, abs(dv))
            if tab is hush_s:          # the ring is one sound: the same level in every silence, measured where it is alone
                arr[2] = arr[3] = arr[4] = arr[0]
        log(f'  calibrate {it}: worst segment error {worst:.1f} dB')
        if worst < 0.5:
            break
    main_str = ', '.join(f'{a:g}:{v:+.1f}' for (a, b, _), v in zip(main, trims))
    log('segment trims (dB):', main_str)
    log('hush trims (dB):', ', '.join(f'{a:g}:{v:+.1f}' for (a, b, _), v in zip(hush_s, htrims)))
    return build(trims, htrims)


def master(BB=None):
    if BB is None:
        BB = B
    log('reverbs')
    hall = make_ir(3.6, 3.0, 1.8, 77, predelay=0.025)
    big = make_ir(6.0, 5.0, 2.5, 78, predelay=0.04)
    outdoor = make_ir(1.4, 0.9, 0.5, 79, predelay=0.012, width=0.8)
    mix = np.zeros((N, 2))
    sends = {
        'str': (0, 0.30, 0.12, 0), 'brass': (0, 0.28, 0.14, 0), 'wind': (0, 0.42, 0.06, 0),
        'choir': (0, 0.26, 0.42, 0), 'harp': (0, 0.42, 0.10, 0), 'perc': (0, 0.18, 0.18, 0),
        'sub': (0, 0.0, 0.08, 0), 'sfx': (0, 0.03, 0.24, 0), 'world': (0, 0.0, 0.16, 0.12), 'beam': (0, 0, 0.1, 0),
        'amb': (0, 0.0, 0.0, 0.25)}
    BX = {k: v.copy() for k, v in BB.items()}
    for k, pts in rides().items():
        for bk in GROUPS[k]:
            BX[bk] *= db(env_points(N, pts))[:, None]
    wet_h = np.zeros((N, 2))
    wet_b = np.zeros((N, 2))
    wet_o = np.zeros((N, 2))
    for k, (d, sh, sb, so) in sends.items():
        x = BX[k]
        mix += x * db(d)
        wet_h += x * sh
        wet_b += x * sb
        wet_o += x * so
    mix += convolve(wet_h, hall) * 0.55
    mix += convolve(wet_b, big) * 0.55
    mix += convolve(wet_o, outdoor) * 0.5
    mix = hp(mix, 22, 2)
    mid_, side = (mix[:, 0] + mix[:, 1]) / 2, (mix[:, 0] - mix[:, 1]) / 2
    side = hp(side, 110, 4)
    mix = np.stack([mid_ + side, mid_ - side], 1)
    gate = gate_env()
    hush = BX['hush'] + convolve(BX['hush'] * 0.22, outdoor) * 0.5
    mix = mix * gate[:, None] + hush
    # breathes out to silence with the picture's fade; no fade in at the start: the click is on sample 0
    mix *= env_points(N, [(0, 1), (DUR - 0.5, 1), (DUR, 0)])[:, None]
    os.makedirs(os.path.join(HERE, 'cache'), exist_ok=True)
    np.save(os.path.join(HERE, 'cache', 'premaster.npy'), mix.astype(np.float32))
    return mix


def finalize(mix, target=-17.0):
    log('loudness')
    y = mix.copy()
    for it in range(4):
        L = lufs(y)
        y = y * db(target - L)
        low = lp(lp(y, 150, 2), 150, 2)
        y = (y - low) + softclip(low, db(-9.0))
        y = softclip(y, db(-3.5))
        y, gr = limiter(y, -1.8)
        L2 = lufs(y)
        log(f'  iter {it}: {L:.2f} -> {L2:.2f} LUFS, max GR {gr:.1f} dB')
        if abs(L2 - target) < 0.12:
            break
    r = rng(4242)
    d = (r.random(y.shape) - r.random(y.shape)) / 32768
    y16 = np.clip(np.round((y + d) * 32767), -32768, 32767).astype(np.int16)
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    sf.write(OUT, y16[:N], SR, subtype='PCM_16')
    log('wrote', OUT, f'{len(y16) / SR:.3f} s', f'LUFS {lufs(y):.2f}', f'TP {20 * np.log10(true_peak(y)):.2f} dBTP')


if __name__ == '__main__':
    sec_hook()
    sec_dread()
    sec_fear()
    sec_barrage()
    sec_core()
    sec_fire1()
    sec_recharge()
    sec_shield()
    sec_fire2()
    sec_end()
    sec_orrery()
    ambience()
    with open(os.path.join(HERE, 'notes.json'), 'w') as f:
        json.dump(NOTES, f)
    with open(os.path.join(HERE, 'events.json'), 'w') as f:
        json.dump(EVENTS, f)
    os.makedirs(os.path.join(HERE, 'cache'), exist_ok=True)
    np.savez_compressed(os.path.join(HERE, 'cache', 'buses.npz'), **{k: v.astype(np.float32) for k, v in B.items()})
    mix = calibrate()
    finalize(mix)
    log('done')
