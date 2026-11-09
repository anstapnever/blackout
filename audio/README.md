# BLACKOUT soundtrack (sound department)

Output: `out/soundtrack.wav`, 48 kHz, stereo, 16-bit, exactly 79.400 s, about -17 LUFS, true peak below -1.5 dBFS.

From the project root, Python 3.13 with numpy, scipy, soundfile (matplotlib for the plot):

```
python -I audio/render.py                    # about 5 min; re-reads CUES and shot times from src/shots.js
python -I audio/tools/analyse.py             # hard checks against the emotion map, out/sound_env.png, audio/analysis.json
python -I audio/tools/cuesheet.py            # prints the second-by-second table of what was actually mixed
```

| File | What |
|---|---|
| `cuesheet.md` | the emotion map, written before the music, plus the as-mixed table |
| `render.py` | score by section, bus mix, gates (silences), loudness calibration to the emotion map, master |
| `lib/dsp.py` | sample engine, filters, reverb, choir |
| `lib/sfx.py`, `lib/sfx2.py` | sound design; `sfx2.py` is this film's (hook, beams, shield, melt, implosion, aftermath) |
| `tools/analyse.py` | checks: length, loudness, hits on cues, silence windows, no major colour before 71 s |

`tools/dump_cues.mjs` and `tools/make_notes.py` are leftovers of the previous film and are not used here.
All randomness is seeded: same samples and code give the same file.
