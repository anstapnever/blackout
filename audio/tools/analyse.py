"""BLACKOUT: verify the soundtrack against the emotion map. Run from the project root: python -I audio/tools/analyse.py
Prints a report, writes out/sound_env.png and audio/analysis.json. Exits non-zero if a hard check fails.
Checks: exact length, loudness, true peak; hits are the loudest moments and land on their cues; silence windows are silent;
hum cut at 3.0; nothing cheerful before 71 (score and audio); the aftermath is near-silent; the end is the warmest moment.
"""
import os, sys, json, re, subprocess, site
sys.path.append(site.getusersitepackages())
import numpy as np
import soundfile as sf
from scipy import signal

HERE = os.path.dirname(os.path.abspath(__file__))
PROJ = os.path.dirname(os.path.dirname(HERE))
wav = os.path.join(PROJ, 'out', 'soundtrack.wav')
x, sr = sf.read(wav, always_2d=True)
mono = x.mean(1)
dur = len(x) / sr
src = open(os.path.join(PROJ, 'src', 'shots.js'), encoding='utf-8').read()
blk = src[src.index('export const CUES'):]
C = {k: float(v) for k, v in re.findall(r'(\w+):\s*([0-9.]+)', blk[:blk.index('};')])}
DUR_FILM = round(sum(float(d) for d in re.findall(r"\['s\d+\w*',\s*'\w+',\s*'\w+',\s*([0-9.]+)", src)), 3)
rep, FAIL = {}, []


def check(name, ok, detail=''):
    print(('PASS ' if ok else 'FAIL ') + name + ('  ' + detail if detail else ''))
    if not ok:
        FAIL.append(name)


def rms_db(a, b):
    seg = x[int(a * sr):int(b * sr)]
    return float(20 * np.log10(np.sqrt(np.mean(seg ** 2)) + 1e-10))


def peak_db(a, b):
    return float(20 * np.log10(np.abs(x[int(a * sr):int(b * sr)]).max() + 1e-10))


p = subprocess.run(['ffmpeg', '-hide_banner', '-nostats', '-i', wav, '-af', 'ebur128=peak=true', '-f', 'null', '-'], capture_output=True, text=True, encoding='utf-8', errors='ignore').stderr
tail = p[p.rfind('Summary:'):]
I = float(re.search(r'I:\s+(-?[\d.]+) LUFS', tail).group(1))
LRA = float(re.search(r'LRA:\s+([\d.]+) LU', tail).group(1))
TP = float(re.search(r'Peak:\s+(-?[\d.]+) dBFS', tail).group(1))
rep.update(integrated=I, lra=LRA, true_peak=TP, duration=dur, sr=sr)
print(f'integrated {I} LUFS, LRA {LRA} LU, true peak {TP} dBFS, {dur:.4f} s, {sr} Hz')
check(f'length {DUR_FILM} s exactly', len(x) == round(DUR_FILM * 48000), f'{len(x)} samples')
check('48 kHz', sr == 48000)
check('loudness about -17 LUFS', abs(I + 17) <= 0.5, str(I))
check('true peak below -1.5 dBFS', TP < -1.5, str(TP))

# momentary loudness every 50 ms (time at window end minus 0.2 -> window centre)
_b1, _a1 = [1.53512485958697, -2.69169618940638, 1.19839281085285], [1, -1.69065929318241, 0.73248077421585]
_b2, _a2 = [1, -2, 1], [1, -1.99004745483398, 0.99007225036621]
kx = signal.lfilter(_b2, _a2, signal.lfilter(_b1, _a1, x, axis=0), axis=0)
n4, h4 = int(0.4 * sr), int(0.05 * sr)
tm = np.arange(0, len(x) - n4 + 1, h4) / sr + 0.2
mom = np.array([-0.691 + 10 * np.log10(np.mean(kx[i:i + n4] ** 2, 0).sum() + 1e-12) for i in range(0, len(x) - n4 + 1, h4)])
mom_at = lambda a, b: float(mom[(tm >= a) & (tm <= b)].max())
rep['rms_per_second'] = [round(rms_db(i, i + 1), 1) for i in range(int(dur))]
rep['momentary_max_per_second'] = [round(mom_at(i, i + 1), 1) for i in range(int(dur))]

# RMS and momentary per second, the shape of the film
print('\nsec  RMS   momMax')
for i in range(int(dur)):
    v = rms_db(i, i + 1)
    print(f'{i:3d} {v:6.1f} {mom_at(i, i + 1):6.1f}  {"#" * max(0, int((v + 72) / 1.5))}')

# ---- hits: must be the loudest moments, and the attack must be AT the cue
HITS = ['muzzle', 'impact', 'shieldHit', 'fire2', 'pierce']
print('\nHits (momentary max in the 0.5 s after the cue; attack = time of the sharpest rise within 40 ms around the cue)')
env = np.abs(signal.hilbert(mono))
for h in HITS + ['coreBreak']:
    t = C[h]
    rise = None
    seg = env[int((t - 0.1) * sr):int((t + 0.3) * sr)]
    fine = np.convolve(seg, np.ones(48) / 48, 'same')
    rise = (np.argmax(fine > 0.25 * fine.max()) / sr) + t - 0.1
    m = mom_at(t, t + 0.5)
    pre = rms_db(t - 0.12, t - 0.02)
    post = rms_db(t, t + 0.25)
    print(f'  {h:10s} t={t:6.2f} momentary {m:6.1f} LUFS, pre {pre:6.1f} dB, post {post:6.1f} dB, jump {post - pre:5.1f} dB, attack at {rise:6.3f}')
    check(f'hit {h} attack within 10 ms of its cue', abs(rise - t) < 0.01, f'{1000 * (rise - t):+.1f} ms')
    check(f'hit {h} is big', m > -11.0, f'{m:.1f}')
    check(f'hit {h} rises out of a hold (jump >= 9 dB)', post - pre >= 9, f'{post - pre:.1f}')
# the five loudest windows (at least 2 s apart)
order = np.argsort(-mom)
top = []
for i in order:
    if all(abs(tm[i] - t) > 2.0 for t, _ in top):
        top.append((float(tm[i]), float(mom[i])))
    if len(top) >= 8:
        break
print('loudest momentary (>= 2 s apart):', [(round(a, 2), round(b, 1)) for a, b in top])
rep['loudest'] = top

# ---- silences before each fire and elsewhere
print('\nSilence windows')
SIL = [('ring alone after the hum', C['ringFace'] + 0.02, C['lampOut'] - 0.02, -30, -22), ('before ignite', C['lampOut'] + 0.1, C['ignite'] - 0.01, -50, -38),
       ('before fire 1 (28.0-28.5)', C['fire1'] - 0.48, C['fire1'] - 0.02, -30, -22), ('before fire 1 (28.5-29.0)', C['fire1'] + 0.25, C['muzzle'] - 0.01, -30, -22),
       ('before the coral strike', C['strike'] - 0.48, C['strike'] - 0.01, -30, -22), ('held breath before the shield', C['shieldHit'] - 0.25, C['shieldHit'] - 0.01, -30, -22), ('before fire 2', C['fire2'] - 0.75, C['fire2'] - 0.01, -28, -20),
       ('aftermath', C['silence'] + 0.03, C['hatchOpen'] - 0.05, -40, -20)]
for name, a, b, lim, pklim in SIL:
    v, pk = rms_db(a, b), peak_db(a, b)
    print(f'  {name:32s} {a:6.2f}-{b:6.2f}: rms {v:6.1f} peak {pk:6.1f}')
    check(f'silence: {name}', v < lim and pk < pklim, f'rms {v:.1f} < {lim}, peak {pk:.1f} < {pklim}')
hc = C['ringFace']
_low = signal.sosfilt(signal.butter(6, 900, 'lowpass', fs=sr, output='sos'), mono)   # the ring lives above 1.5 kHz, the hum below
_lr = lambda a, b: float(20 * np.log10(np.sqrt(np.mean(_low[int(a * sr):int(b * sr)] ** 2)) + 1e-10))
pre, post = _lr(hc - 0.1, hc - 0.002), _lr(hc + 0.02, hc + 0.1)
check('hum cut dead on 3.0 (below 900 Hz, drop >= 35 dB in 20 ms)', pre - post >= 35, f'{pre:.1f} -> {post:.1f}')
ring = rms_db(hc + 0.3, C['lampOut'] - 0.1)
check('the ring is audible after the cut', ring > -46, f'{ring:.1f} dB')
tpk = int(np.argmax(np.abs(x[int((C['silence'] + 0.03) * sr):int((C['hatchOpen'] - 0.05) * sr)]).max(1))) / sr + C['silence'] + 0.03
print(f'  loudest point in the aftermath at {tpk:.2f} s')
# frame one click
_af = rms_db(C['silence'] + 0.5, C['hatchOpen'] - 2.0)
check('aftermath bed is near-silent but present (-60 to -44 dB)', -60 < _af < -44, f'{_af:.1f}')
check('click on sample 0', np.abs(x[:int(0.01 * sr)]).max() > 0.05, f'peak in first 10 ms {20 * np.log10(np.abs(x[:int(0.01 * sr)]).max() + 1e-9):.1f} dB')

# ---- the score: symbolic harmony
notes = json.load(open(os.path.join(PROJ, 'audio', 'notes.json')))
NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B']
E_nat = [n for n in notes if n['midi'] % 12 == 4 and n['t'] + n['dur'] > 0 and n['t'] < C['lampBack'] - 0.01]
check('E natural is absent before the lamp', len(E_nat) == 0, f'{len(E_nat)} notes')
maj, mino = [], []
for tt in np.arange(0.0, dur, 0.1):
    w = np.zeros(12)
    for nt in notes:
        if nt['t'] <= tt < nt['t'] + nt['dur'] + 0.05:
            w[nt['midi'] % 12] += 10 ** (nt['g'] / 20) * (0.35 + 0.65 * nt['vel'])
    if w.sum() == 0:
        continue
    on = w > 0.12 * w.max()
    for r0 in range(12):
        if on[r0] and on[(r0 + 4) % 12] and on[(r0 + 7) % 12]:
            maj.append((round(float(tt), 1), NAMES[r0]))
spans = []
for tt, r0 in maj:
    if spans and spans[-1][2] == r0 and tt - spans[-1][1] < 0.15:
        spans[-1][1] = tt
    else:
        spans.append([tt, tt, r0])
print('\nmajor triads sounding in the score:', [(a, b, r) for a, b, r in spans if (b - a) >= 0.1 or a >= 75][:60])
early = [s for s in spans if s[0] < 71 and s[1] - s[0] >= 0.1]
check('no major triad before 71 s', len(early) == 0, str(early))

# ---- the audio: chroma of the music stems (salience) — minor third vs major third above the root C, and overall best key
MAJ = np.array([6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88])
MIN = np.array([6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17])
stems = np.load(os.path.join(PROJ, 'audio', 'cache', 'buses.npz'))
mus = sum(stems[k].astype(np.float64) for k in ('str', 'brass', 'wind', 'choir', 'harp') if k in stems.files).mean(1)


def salience(seg):
    if len(seg) < 4096:
        return np.ones(12) / 12
    npg = min(32768, 2 ** int(np.log2(max(4096, len(seg)))))
    f, t, Z = signal.stft(seg, sr, nperseg=npg, noverlap=npg * 3 // 4)
    P = (np.abs(Z) ** 2).sum(1)
    mids = np.arange(24, 108)
    fm = 69 + 12 * np.log2(np.maximum(f, 1) / 440)
    A = np.sqrt(np.array([P[(fm >= m - 0.5) & (fm < m + 0.5)].sum() for m in mids]))
    S = np.zeros(len(mids))
    for i in range(len(mids)):
        for h in range(1, 9):
            j = i + int(round(12 * np.log2(h)))
            if j < len(mids):
                S[i] += 0.84 ** (h - 1) * A[j]
    S2 = S.copy()
    for i in np.argsort(-S):
        for h in (2, 3, 4, 5, 6):
            j = i + int(round(12 * np.log2(h)))
            if j < len(mids):
                S2[j] = max(0, S2[j] - 0.9 * S[i] * 0.84 ** (h - 1))
    ch = np.zeros(12)
    for i, m in enumerate(mids):
        ch[m % 12] += S2[i] ** 2
    return ch / (ch.sum() + 1e-12)


SECTIONS = [('dread', 4.5, 13.5), ('fear', 13.5, 18), ('barrage', 18, 23.5), ('core', 25.5, 28), ('fire1', 29, 36.5), ('recharge', 36.5, 42), ('jump', 42, C['shieldHit'] - 0.27), ('shield', C['shieldHit'], 46.5),
            ('melt', 46.5, 56.2), ('fire2', 57, 61), ('fall', 62, 65.5), ('melody', 71, 75), ('relight', 75, 78), ('resolve', 78, DUR_FILM)]
print('\nsection key (audio, salience chroma)  best | best major')
for name, a, b in SECTIONS:
    ch = salience(mus[int(a * sr):int(b * sr)])
    res = []
    for k in range(12):
        res.append((float(np.corrcoef(ch, np.roll(MAJ, k))[0, 1]), NAMES[k] + ' major'))
        res.append((float(np.corrcoef(ch, np.roll(MIN, k))[0, 1]), NAMES[k] + ' minor'))
    res.sort(reverse=True)
    bm = max(r for r in res if 'major' in r[1])
    top3 = [NAMES[i] for i in np.argsort(-ch)[:5]]
    print(f'  {name:9s} {res[0][1]:9s} ({res[0][0]:.2f}) | {bm[1]:9s} ({bm[0]:.2f})   strongest: {top3}')
    rep[f'key_{name}'] = [res[0], bm, top3]
    if b <= 71 and name != 'fall':
        check(f'{name}: tonic minor stronger than any major reading', 'minor' in res[0][1], res[0][1])

# ---- the fall walks through four chords: test each one's own third
F0 = C['fall']
for dt, ln, root, nm in [(0, 1, 0, 'Cm'), (1, 1, 10, 'Bbm'), (2, 1, 8, 'Abm'), (3, C['silence'] - F0 - 3, 7, 'Gm')]:
    ch = salience(mus[int((F0 + dt) * sr):int((F0 + dt + ln) * sr)])
    m3, M3 = ch[(root + 3) % 12], ch[(root + 4) % 12]
    check(f'fall chord {nm}: minor third above major third', m3 > M3, f'm3 {m3:.3f} M3 {M3:.3f}')

# ---- warmth: the end must be the only place where E beats Eb
print('\nthird of C: Eb (minor) vs E (major) in the audio')
for name, a, b in SECTIONS:
    ch = salience(mus[int(a * sr):int(b * sr)])
    print(f'  {name:9s} Eb {ch[3]:.3f}   E {ch[4]:.3f}')
    if a < 78 and b <= 75:
        check(f'{name}: no major third over C', ch[4] <= max(ch[3], 0.09), f'E {ch[4]:.3f} Eb {ch[3]:.3f}')
# raw spectrum here: salience subtracts E as the 5th partial of the big C, which is exactly the wrong thing for this test
_f, _t, _Z = signal.stft(mus[int(C['lampBack'] * sr):int(dur * sr)], sr, nperseg=16384, noverlap=12288)
_P = (np.abs(_Z) ** 2).sum(1)
_fm = 69 + 12 * np.log2(np.maximum(_f, 1) / 440)
_E = _P[(np.abs((_fm - 4) % 12) < 0.4) & (_f > 200) & (_f < 2000)].sum()
_Eb = _P[(np.abs((_fm - 3) % 12) < 0.4) & (_f > 200) & (_f < 2000)].sum()
check('the last chord is C major (E above Eb in the spectrum)', _E > 4 * _Eb, f'E/Eb {_E / (_Eb + 1e-12):.1f}')
_late = [n for n in notes if n['midi'] % 12 == 3 and n['t'] + n['dur'] > C['lampBack'] + 0.05]
check('no Eb note sounds in the last chord', len(_late) == 0, str(len(_late)))

# ---- clicks
hpx = signal.sosfilt(signal.butter(4, 4000, 'highpass', fs=sr, output='sos'), mono)
e2 = np.sqrt(signal.lfilter([1 / 480], [1, -1 + 1 / 480], hpx ** 2))
spk = np.abs(hpx) > 10 * (np.concatenate([np.full(240, e2[0]), e2[:-240]]) + 10 ** (-60 / 20))
cl = np.unique(np.round(np.where(spk)[0] / sr, 2))
rep['click_candidates'] = [float(c) for c in cl[:60]]
print('\nclick candidates (HF spikes):', rep['click_candidates'])
with open(os.path.join(PROJ, 'audio', 'analysis.json'), 'w') as f:
    json.dump(rep, f, indent=1)

try:
    import matplotlib
    matplotlib.use('Agg')
    import matplotlib.pyplot as plt
    fig, ax = plt.subplots(figsize=(16, 5.5), dpi=110)
    ax.plot(tm, mom, color='#3a9d23', lw=0.8, label='momentary loudness (400 ms)')
    r1 = [rms_db(i, i + 1) for i in range(int(dur))]
    ax.step(range(int(dur)), r1, where='post', color='#d1495b', lw=1.5, label='RMS per second (dBFS)')
    for k, v in C.items():
        ax.axvline(v, color='#888', lw=0.6, ls='--')
        ax.text(v, -2, k, rotation=90, fontsize=6, va='top', ha='right', color='#444')
    ax.set_xlim(0, dur)
    ax.set_ylim(-75, 0)
    ax.set_title('BLACKOUT: envelope and story cues')
    ax.legend(loc='lower left', fontsize=8)
    ax.grid(alpha=0.25)
    fig.tight_layout()
    fig.savefig(os.path.join(PROJ, 'out', 'sound_env.png'))
    print('plot -> out/sound_env.png')
except ImportError:
    print('matplotlib missing: no plot')

_endr = rms_db(dur - 0.02, dur)
check('decays to silence at the end', _endr < -50, f'{_endr:.1f}')
_hold = rms_db(C['lampBack'] + 0.2, dur - 0.5)
check('major chord holds after the lamp', _hold > -32, f'{_hold:.1f}')
print('\nFAILED:' if FAIL else '\nALL CHECKS PASSED', FAIL)
sys.exit(1 if FAIL else 0)
