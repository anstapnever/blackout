# BLACKOUT — production contract

A 78.5-second, 24 fps, 1920×1080 anime short rendered in the browser with three.js r170 (WebGL2), captured frame by frame
with headless Chrome and encoded with ffmpeg. A **shot-for-shot retelling of the ACTIONS** of a famous anime sequence (a
whole country gives up its electricity for one giant gun aimed at a floating enemy; the enemy answers, the two beams twist
around each other and both miss; while the gun recharges, a second pilot shields it with a melting plate; the second
shot wins; one pilot tears open the other's burning hatch). **Everything visual is our own design**: the reference must be
recognisable ONLY by what happens and by camera work. The film is a one-night production with 6-8 hours of work.


## Hard rules
- Copy **actions, staging, camera angles, lens feel, camera moves and timing** of the reference. **Never copy the look**: every design here is our own.
- **Cel anime, not CGI**: crisp two-tone cel shading, confident ink lines, gouache painted backgrounds. Not vector art,
  not low-poly. The night is deep and saturated (ultramarine, teal, huge moon, painted moonlit clouds), never murky grey.
- **HOOK is the first thing the viewer sees**: `s01` frame 0 already has the darkness eating a glowing city. No fade from
  black at the start (the old opening fade is removed in `src/shots.js`).
- **TEXTURE DETAIL is this film's first upgrade over the last one**: ground, rock, walls, roofs, metal must show
  structure at 3 scales: macro blotches and streaks, meso cracks and seams, micro chips and grain. Use `src/detail.js`
  or better. Detail fades with distance (noise on far objects reads as transparency). Nothing large is a flat colour.
- **LIGHT AND COLOUR are the second upgrade**: every shot has a key, a rim, a bounce and a purpose. Light changes only with
  a visible cause (beam, muzzle, explosion, moon). Beams light the land and the machines around them.
- **LIVING MOTION is the third upgrade**: anything alive shifts weight, keeps its centre of mass over its support, plants
  feet without sliding, anticipates before acting, overshoots and settles, has follow-through on ears, tail, clothes and
  head (use `src/motion.js` springs), moves on arcs, breathes at rest. Heavy things move slowly and land with mass.
- Characters on twos (`onTwos`), FX on threes (`onThrees`), held poses, snappy accents. No sliding feet, heads on necks.
- **No clipping, ever** (see QA). Effects: **no thousands of particles near a hero's body**; shape FX as a few big drawn forms.
- Close-up faces carry the emotion the shot table names; check them before you report.
- Each story beat must actually be visible from the shot's camera: check with a still.
- Deliver a complete working pass of everything you own early, then keep improving detail, light and motion until the
  lead asks you to stop. There is plenty of time: do not stop at "good enough".

## Reference
The reference clips are not part of this repository. Do not copy any design.

## Story and shots (`src/shots.js`: SHOTS, CUES, film seconds)
| id | name | time | owner | what happens |
|---|---|---|---|---|
| s01 | **wave (HOOK)** | 0-1 | land (+orrery) | Frame 0 is a finished poster at full brightness: a high view over a city of warm gold to the horizon, a sharp diagonal border through the centre, black districts beyond it, half of the border block already dead, and a thin cold ring hanging over the clouds at top centre (about a quarter of the frame wide). Camera already moving forward and descending. Blocks die in jolts on threes toward camera; by frame 20 the dark passes under camera, only the ring remains. |
| s01b | **wire (HOOK)** | 1-2 | land (+fx) | Match-cut on the motion, from below along a pylon: a clot of gold light races along the cables away from camera to the horizon; around frame 36 it reaches the ridge and the silhouette of a mountain-sized gun barrel shows, its seams igniting one after another. |
| s01c | **barrel (HOOK)** | 2-3 | mech (+orrery) | Cut on the barrel axis, low along it, the ring exactly in line with the muzzle. An in-world counter on the hull reads POWER 41%. At CUES.ringTurn (frame 60) the ring starts turning its opening toward the barrel; white light runs along its inner edge; at frame 72 it faces us as a full circle and flares inside. |
| s02 | window | 3-4.5 | folk | CU of a round paper-lantern window in a dark wall, the last light in the country, a little otter child's silhouette inside; the ring's cold light is visible in the sky reflected in the glass. It goes out at CUES.lampOut. |
| s03 | ignite | 4.5-6.5 | orrery | Total dark bay. High above, the ring unfolds into vast concentric rings, turning: the only light in the world. |
| s04 | surge | 6.5-8 | land (+fx) | Transformer yard on a hillside: arcs jump, a white pulse leaves through the cables toward the ridge. |
| s05 | lever | 8-10.5 | folk (+land) | Control hut: a wall of brass breakers flipping row by row, old badger chief hauls the last lever with his whole body. |
| s06 | cannon | 10.5-13.5 | mech | The cannon on the ridge, cooling fans spinning, cables thick as trees; the kneeling Heron mech cradles it; the hammer rises at CUES.hammer. |
| s07 | boy | 13.5-16 | folk | Cockpit: otter boy pilot, sweat, swallowing, pupils tight, the scope's red glow on his face. Emotion: fear held down. |
| s08 | scope | 16-18 | mech (+orrery) | Scope view in a circular brass reticle: the rings far off, target marks converge. |
| s09 | barrage | 18-21 | fx (+land) | Rocket batteries on the hills fire, streaks arc over the dark sea at the rings. |
| s10 | answer | 21-23.5 | orrery (+fx,land) | The rings align; a thin coral beam sweeps the hills; battery after battery goes up in fire domes. |
| s11 | girl | 23.5-25.5 | folk | Cockpit 2: snow-leopard girl, eyes closed, she opens them. Emotion: utterly calm. |
| s12 | core | 25.5-27.5 | orrery | The rings part, the crimson core opens toward camera. |
| s13 | trigger | 27.5-29 | folk (+mech) | ECU paw and trigger; he squeezes at CUES.fire1; the hammer falls. Stars of light on the scope. |
| s14 | muzzle | 29-30.5 | mech (+fx) | The cannon fires: ice-blue beam, recoil rides the whole mech back, trees and dust flatten in a ring. |
| s15 | **twist** | 30.5-33.5 | fx (+orrery) | THE IMAGE: over the sea the ice-blue beam and a coral beam from the rings bend around each other in a helix and pass. |
| s16 | impacts | 33.5-36.5 | fx (+land,mech) | Both miss: a mountain far behind the rings erupts, the coral beam hits the ridge just short of the cannon, a wall of fire. |
| s17 | shaken | 36.5-39 | folk | Boy thrown in the harness, the cockpit goes red; the gauge restarts: the gun needs time. Emotion: horror then resolve. |
| s18 | aligns | 39-42 | orrery | The rings slowly realign and the core brightens: charging again, much longer. |
| s19 | strike | 42-43.5 | orrery (+fx) | The second coral beam is on its way toward camera, the ridge lit like day. |
| s20 | shield | 43.5-46.5 | mech (+fx) | The Tortoise mech jumps in front of the cannon, plants its feet, raises the ship's-bow shield. The beam slams into it. |
| s21 | melt | 46.5-50 | mech (+fx) | The shield melts in petals from the centre, the mech is shoved back with feet ploughing the rock. |
| s22 | roar | 50-52 | folk | Boy screaming at the gauge; paws white on the trigger. Emotion: fury. |
| s23 | holds | 52-54.5 | folk | Cockpit 2 lit white through the seams, girl shaking, teeth set, does not let go. |
| s24 | last | 54.5-57 | mech (+fx) | The shield is gone; the Tortoise stands in the beam with bare arms crossed, silhouette in white. |
| s25 | fire2 | 57-59 | mech (+fx) | Second shot, full power. The white beam leaves past the Tortoise. |
| s26 | pierce | 59-62 | orrery (+fx) | The beam goes through the rings' centre; rings crack, core implodes, a sphere of light (a213 a214). |
| s27 | fall | 62-65.5 | orrery (+fx,land) | The dead rings topple into the bay; a slow, huge wall of water rises. |
| s28 | silence | 65.5-68.5 | mech | The ridge at night, smoke, moon. The Heron lowers itself, cannon cooling. Almost no sound. |
| s29 | hatch | 68.5-72 | folk (+mech) | Otter boy runs over the scorched Tortoise and hauls open its smoking hatch with bare paws, pulling back with his whole weight. |
| s30 | alive | 72-75 | folk | Inside, the girl opens her eyes. He is crying with relief. The smallest smile from her at the end. |
| s31 | **lights (PAYOFF)** | 75-78.5 | land (+folk) | Same camera as s01, front running the other way: district by district the country comes back on. Last the little round window lights up. Cut to black. |

HOOK rules : the viewer must ask at 3.0 s "the ring noticed, will they fire first?". Do not reveal the first shot's result in the hook. Gold city against cold ring must stay readable on a phone at low brightness; dark districts are clean black without noise. The film's last shot rhymes with frame 0.

CUES (see `src/shots.js`): dark front runs -1..1 s; ringTurn 2.5; ringFace 3.0; lampOut 4.2; ignite 4.5; surge 6.5; lever 8.0; hammer 11.5;
barrage 18.0; answer 21.0; coreOpen 25.5; fire1 28.5; muzzle 29.0; cross 31.0; impact 33.5; recharge 36.5; align 39.0; strike 42.0;
shieldHit 43.5; melt 46.5; shieldGone 54.5; fire2 57.0; pierce 59.0; coreBreak 61.0; fall 62.0; silence 65.5; hatchOpen 71.0;
smile 73.5; relight 75.0; lampBack 78.0; end 78.5. **The world is continuous in time and pure in state.t**: frames render in random order.

## Designs (ours)
- **Land**: a volcanic archipelago called the Terraces. A harbour city on a wide bay: thousands of rounded ochre and
  terracotta stucco houses climbing stepped terraces, deep indigo tile roofs, water stairs, canals, lighthouses; hill
  villages among terraced fields. Warm amber window lights and strings of round paper lanterns. Transformer yards and steel
  pylons in clear lines over the hills. Basalt shoreline, wet black rock. Every light uses `lit()`/`LIT_GLSL` from `src/layout.js`.
- **Sky**: enormous pale moon, ultramarine night, dense stars, painted moonlit cumulus, faint teal aurora bands.
- **The Orrery (enemy)**: a 520 m wide floating astrolabe of 5 nested rings of cream porcelain and tarnished gold filigree,
  engraved scales, rotating at different speeds and axes around a lacquer-crimson eyeless core; a hair-thin coral thread
  falls from it to the sea. When firing the rings snap into a plane and a slit opens. Beam: coral-crimson with white core.
- **The Long Arm (cannon)**: built from bridge girders on the ridge: 180 m barrel, cream paint and oxide red, riveted
  sections, cooling fin stacks and giant fans, rail mount, cable bundles thick as trees running down the mountain.
  Beam: ice blue with a white core.
- **Heron (sniper mech)**: 42 m, lanky, white lacquer and vermilion, wide round brimmed helm with a single round lens.
  Kneels on one knee to the gun. **Tortoise (shield mech)**: 40 m, squat, copper and dark teal, rounded shell back, a
  hatch high on the back. Carries a shield made from the riveted steel bow of a ship.
- **Pilots**: **Otter boy** (14, 1.4 m): tan flight jacket, goggles on forehead, expressive. **Snow-leopard girl** (14, 1.45 m):
  navy flight suit, pale fur with rosettes, huge calm eyes. **Badger chief**: old, goggles, oil-stained apron. Control hut crew: mixed animal folk.
- **Lamp child**: small otter silhouette (s02) in a paper lantern window.

## Map (`src/layout.js` — the one shared map)
Metres, Y up, sea level y = 0. City centre (0, 0, 0), radius ~1400 around the bay, bay opens to +Z. Orrery centre (0, 540, 300).
Ridge and gun: firing position at (-3200, 640, 2100). Moon elevation 42°, azimuth 150°.

## Departments and file ownership — edit ONLY your files
| Department | Owns |
|---|---|
| Lead | `index.html`, `src/main.js`, `src/engine.js`, `src/glsl.js`, `src/materials.js`, `src/bgmaterials.js`, `src/passes-env.js`, `src/look.js`, `src/shots.js`, `src/layout.js`, `src/util.js`, `src/motion.js`, `src/detail.js`, `src/world*.js`, `src/tex-foliage.js`, `tools/*`, `CONTRACT.md` |
| Land | `src/land.js`, `src/land-*.js`, `src/cams/land.js` |
| Orrery | `src/orrery.js`, `src/orrery-*.js`, `src/cams/orrery.js` |
| Mech | `src/mech.js`, `src/mech-*.js`, `src/cams/mech.js` |
| Folk | `src/folk.js`, `src/folk-*.js`, `src/cams/folk.js` |
| FX | `src/fx.js`, `src/fx-*.js` |
| Sound | `audio/**` (output `out/soundtrack.wav`) |

Never edit a file you do not own; put requests in your report.

## Cameras and looks
`src/cams/<dept>.js`: `export const CAMS = { s05: (lt, d, t, st) => ({ pos:[x,y,z], look:[x,y,z], fov, roll?, near?, far? }) };`
`export const LOOKS = { s05: (lt, d, t, st) => ({ k, sunElev, sunAz, shafts, shadow:{center,radius,depth}, key:[x,y,z], mistMul, fogMul, veil, exposure, paintRadius, inkWidth, fade, fadeColor }) };`
`look.k` = 1 clean moonlit night, 0.5 = smoke and fire haze after impacts. `look.key` is the character key light.
`look.shadow` enables the shadow map around `center`; add character roots to `ctx.shadowRoots`.
Live cameras: slight handheld drift on close shots via `noise1`, heavy shake only on impacts.

## Department APIs
Factories get `ctx` = `{ THREE, scene, overlay, engine, camera, atlas, G, CUES, SHOTS, FPS, W, H, shadowRoots, colliders }`
and later `ctx.world/land/orrery/mech/folk/fx`. Update order: world, land, orrery, mech, folk, fx. Factories:
`buildLand(ctx)`, `createOrrery(ctx)`, `createMech(ctx)`, `createFolk(ctx)`, `createFx(ctx)`, each `{ update(st), ...api }` (may be async).
- `ctx.land`: `groundY(x, z)`; `anchor(name, vec3)` for `ridgeImpact`, `batteryN` (N 0..7 rocket batteries), `farMountain`, `bayPoint`.
- `ctx.orrery`: `root`; `anchor(name, vec3)` for `core`, `slit`, `coral` (beam origin); `state(t)` = `{ alignment 0..1, charge 0..1, broken 0..1 }`.
- `ctx.mech`: `heron`, `tortoise`, `cannon` roots; `anchor(name, vec3)` for `muzzle`, `breech`, `shieldCenter`, `hatch`, `heronCockpit`.
- `ctx.folk`: `boy`, `girl`, `chief` each with `root`, `anchor(name, vec3)` (head, eyeL, eyeR, handL, handR).
- `ctx.fx`: beams (`beamHero`, `beamCoral`, helix in s15), arcs and cable pulse, rockets, fire domes, muzzle blast, melt petals (with mech), the implosion, the wave, ring splashes.

## Engine facts
- Pass order: shadow → main MRT → paint (Kuwahara brush on painted pixels) → ink (cel pixels) → atmosphere → overlay → bloom → grade.
- Material ids in `writeOut`: 0 painted (brushwork, no ink), 1-99 inked cel, 100+ cel without ink. Neighbouring parts use different ids.
  Ranges: land 1-19 (+0 painted), orrery 20-29, mech 30-39, folk 40-59, fx 60-99.
- `celMaterial` (`src/materials.js`), `paintMaterial`/`cityMaterial`/`foliageMaterial` (`src/bgmaterials.js`). You may copy and adapt into your own files.
- Pure function of `state.t` / CUES. Seeded RNG from `src/util.js`, never `Math.random`. Keep things within 8000 m of camera (depth > 8000 counts as sky).
- No `SkinnedMesh`: rigid parts in a hierarchy, or CPU-deform your own geometry.
- GPU shared with another film and other departments: keep stills small (`--scale 1`), never run full renders.

## Tools
- `node tools/check.mjs 60` — loads the page headless, prints console errors.
- `node tools/snap.mjs --scale 1 t:40.2 t:46 f:1100` — stills in `out/snaps/` (`--sheet` for a contact sheet).
- Test camera: `node tools/snap.mjs "q:test=1&cam=0,2,-200&at=0,40,-300&fov=40&t=46"`. Skip departments with `&fx=0&folk=0` etc.
- **Look at your stills with Read every time.** Your own scripts go under `out/<dept>/`.

## QA (mandatory, the lead runs it before the render)
Register real geometry in `ctx.colliders.push({ name, dept, obj, kind, contact })`: `kind: 'solid'` (closed meshes, non-instanced: rock/ground near characters, hut, cockpit, cannon, shield) or `'body'` (every rigid character/mech part). `contact`: names of solids the body rests on (up to 3 cm penetration there, 0 elsewhere). `tools/qa.mjs` tests bodies vs solids vs other departments' bodies on every 2nd frame with three-mesh-bvh, and fails on penetration or a camera inside a solid.

## Reporting
When you finish, report briefly: what you built, which shots you set cameras for, known weaknesses, requests for others, and 2-4 paths of your best stills.

## Event light (lead, available to every department)
`import { addWarLight } from './glsl.js'` and call it in your `update(st)` during the event: `addWarLight({ a:[x,y,z], b:[x,y,z] /* optional, makes it a beam */, r: 900 /* reach in metres */, c:[3,1.2,0.8] })`. Six per frame, cleared each frame. Used automatically by `paintLight` and `celMaterial`; a custom material gets it by adding `warLight(albedo, worldPos, N)`. Sky flash: `ctx.world.sky.material.uniforms.uSkyFlash.value.setRGB(r,g,b)` from update (reset by applyLook every frame). Light changes only with a cause in frame: every beam, muzzle blast and fire must light what is near it through this.

## Added after the draft review (lead)
s32 **lamp** 78.0-79.4, set `window`, Folk: the same camera as s02. The film now ends here: at CUES.lampBack the paper-lantern window comes back on after a small flicker, the little otter silhouette lifts its head toward the light outside, closing to black in the last 0.35 s. Film length is 79.4 s. CUES.shieldHit is 45.72.
