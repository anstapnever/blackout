# BLACKOUT: emotion map (written before any note)

Every musical decision below comes from this table. Times are film seconds and are anchored to `CUES` in `src/shots.js`.

## Rules derived from the client's history (music "cheerful" on an epic scene was rejected)
1. **Key: C minor** with a Phrygian Db (the C to Db semitone is the threat motif).
2. **The note E natural does not sound at all before 78.0.** The minor third Eb is held for the whole film; E arrives once, on the lamp. No major triad anywhere before 75.0.
3. Chord vocabulary before 71: Cm, Cdim, Bbm, Abm, Gm, Cm(add b9), open fifths and semitone clusters. Only minor and diminished chords move: never Ab, Eb, Bb or Db major, also not by accident against the pedal (checked by script).
4. No dance rhythm, no dotted figures, no pizzicato tunes before 71: only low even pulses, drones, tremolo, sustained brass.
5. Silence is an instrument: the reference (`ref/`) drops 10 to 15 dB for about 1 s right before each shot and hits immediately after, and clip a sits almost silent for 10 s after the climax. So: a hard gate before each fire, then the biggest level in the film straight after.
6. **The thin high ring** (bowed glass and vibraphone, G6) is the film's one recurring sound: it is what remains at 3.0, it comes back in each silence before a fire, and it is the top of the last chord's world.
7. Everything sits on a 0.5 s grid: all CUES are multiples of 0.5, so every pulse lands on a cue.

## Intensity contour (0 silent, 10 biggest)
Hook 6 rising, hum cut to 0.5 at 3.0. Dread 3 to 5. Barrage 7. Girl 2. Pre-fire silence 0.5. **Muzzle 10**. Twist 8. **Impact 10**. Recharge 6 to 8. Pre-strike silence 0.5. **Shield 10**. Melt 8 to 9.5 (long). Silence 0.5. **Fire2 10+**, **Pierce 10+**, core break 10. Fall 8 falling to 5. Aftermath 0.5. Melody 1.5. Relight 3 to 6 (warm).

## Second by second

| sec | on screen | feeling | int | harmony | what you hear |
|---|---|---|---|---|---|
| 0.0 | frame 0, gold city, dark front eating it | a jolt, "something is switching us off" | 6 | none | **dull relay click on sample 0**; city electric hum at full, no fade in |
| 0-1 | blocks die in jolts on threes, toward camera | unease, curiosity | 6 | none | a click on every jolt (0.125 s), growing closer and wider; each click steps the warm city hum down |
| 1-2 | gold clot races along cables, seams ignite | something is being fed | 6 | C hum | **rising hum in the wires** starts, cable whoosh pulls away, accelerates from 1.5 and ends in **one low metal slam at 1.917** (frame 46, pulse enters the barrel) |
| 2-3 | barrel axis, POWER 41%, ring turns at 2.5 | the ring noticed | 8 | C to Db hum bending | hum rises hard in pitch and level; very quiet relay ticks every other frame while POWER counts (frames 48-71); the ring's thin tone starts under it at 2.5 |
| 3.0 | ring faces us, flares | held breath | 0.5 | G6 only | **hum cut dead on 3.000 incl. reverb**; only the thin high ring remains |
| 3-4 | paper lantern window, last light | loneliness | 0.5 | G6 | ring alone, room tone |
| 4.2 | lamp goes out | a small loss | 0.5 | G6 | tiny dry click, the ring stops with it |
| 4.5-6 | rings unfold, the only light | awe, dread | 3 | C pedal, Cm(addb9) | contrabass, cello tremolo enter from nothing; gong rolled low; slow metal wheels; horns C to Db |
| 6-6.5 | rings turn | dread | 3 | same | drone only, swelling a little |
| 6.5-8 | transformers arc, pulse leaves | the country pours itself in | 5 | C pedal | arc snaps, pulse whoosh, sub thump; cello spiccato starts to stir |
| 8-10.5 | breakers flip, chief hauls the last lever | collective effort, heavy | 5 | C Phrygian pulses | **low ostinato** (spiccato cello, bass, 0.5 s pulse) with breaker clacks on the grid; last lever a heavy ka-chunk at the end of the shot |
| 10.5-11.5 | cannon, fans, cables | scale | 5 | Cm | fans thrum, low horns swell, timpani under the pulse |
| 11.5-13.5 | hammer rises | wound spring | 6 | Cm | **ratchet on the hammer**, trombones and tuba under, tension up |
| 13.5-16 | otter boy, sweat, swallow | fear held down | 3 | C and Db whisper | ostinato gone; **heartbeat starts** (60 bpm), cluster whisper, cockpit hum |
| 16-18 | scope, marks converge | focus | 4 | C pedal | reticle ticks climb, heartbeat 66, thin high trem |
| 18-20.5 | rockets fire, arc over the sea | a desperate strike | 7 | Cm, C Phrygian | ripple of launches, ostinato doubles to 0.25, timpani, horn stabs (minor) |
| 20.5-21 | streaks hang | "it's too quiet" | 1 | none | music gated to almost nothing |
| 21-23.5 | coral thread sweeps, batteries go up | horror, helpless | 8 | Cm over Db clusters | searing beam line, fire domes one by one, brass crashes |
| 23.5-25.5 | girl opens her eyes | utter calm, cold | 2 | open fifth C-G, high | everything drops; a single high string fifth; slow heartbeat 56 |
| 25.5-27 | core opens toward camera | it's looking at us | 6 | Cm with Db, rising | groaning metal wheel; choir and low brass slowly rising; heartbeat accelerating |
| 27-28 | paw on trigger | unbearable | 7 | Cm(addb9) | heartbeat 96 to 130 bpm, brass and strings crescendo |
| 28.0-28.5 | ECU trigger | nothing | 0.5 | G6 | **all gated**; only the ring |
| 28.5 | squeeze, hammer falls | the point of no return | 0.5 | G6 | dry trigger click, metal hammer fall |
| 29.0 | **MUZZLE** | overwhelming release | 10 | Cm tutti | sub drop, three drums, gong, whip crack, full orchestra on C minor; recoil groan; dust ring |
| 29.5-30.5 | beam leaves, trees flatten | awe | 9 | Cm | tutti decays into the beam roar |
| 30.5-31 | two beams bend | wonder, dread | 8 | Cm with Db | ice-blue high whistle, coral raw low line, circling in stereo |
| 31.0 | **cross** | a tearing | 8.5 | Db cluster | air tears; a brass semitone |
| 31-33.3 | helix, they miss | the worst feeling, slowly | 8 | Cm to Gb tritone, chromatic rise | violins climb, choir, drums building |
| 33.3-33.5 | | hold | 2 | | short gap |
| 33.5 | **IMPACT** | catastrophe | 10 | Cm with Gb and Ab | double detonation, avalanche, tutti cluster |
| 34-36.5 | wall of fire | horror | 7 falling | low cluster fading | rumble, debris, brass dying away |
| 36.5-38 | boy thrown, cockpit red | horror | 6 | C pedal, Db | alarm tick of the gauge restarts, heart returns, low trem |
| 38-39 | gauge | resolve | 6 | Cm | single horn rising C-Eb-F, trembling |
| 39-41.5 | rings realign, core brightens | it's coming again, longer | 8 | Cm, Cdim, Bbm over C pedal | ostinato back, accelerating to 0.25, timpani roll, choir, heart 76 to 130 |
| 41.5-42 | | silence before the shot | 0.5 | G6 | **all gated**, ring |
| 42-43.42 | second beam on its way | terror | 8 | Db cluster over C | coral scream starts far off, swelling, heart 112 bpm and climbing |
| 43.42-44.22 | Tortoise crouches | "he's going to do it" | 8.5 | Cm | steel loads, horn G, ostinato doubles, timpani roll |
| 44.22-45.3 | he leaves the ground, in the air | desperate courage | 9 | Cm, horn C then Db | rock cracks at launch, air rush, horn line climbs, strings slide up |
| 45.3-45.45 | he lands, both feet | weight | 9.5 | horn C | two heavy landings, rock |
| 45.45-45.72 | shield up | held breath | 0.5 | G6 | **all gated**, ring |
| 45.72 | **SHIELD HIT** | enormous, metal | 10 | Cm tutti | huge anvil and gong slam, sub, tutti |
| 45.72-46.5 | the beam pushes | noble, doomed | 8 | Cm | beam roar, low strings, choir |
| 46.5-50 | shield melts, feet plough rock | agony, sustained | 9 | C and Db pedal, strings climbing | **grinding agony**: scraped gong, bowed brake drums, stick-slip groan, rising string gliss, brass cluster, pulses from drums |
| 50-52 | boy screams | fury | 9.5 | Cm, trumpets high | brass rip up, choir wide open, drums every beat |
| 52-54.5 | girl, shaking, white | pain, endurance | 8 | high cluster | roar muffled as if inside; heart huge; thin shaking strings; teeth set |
| 54.5 | shield gone | a gasp | 9 | Cm, bass falls | metal rips, crack |
| 54.5-56.2 | Tortoise in the beam | unbearable peak | 9.5 | Cm cluster at the top | choir at the top of its range, all building |
| 56.2-57 | | silence | 0.5 | G6 | **all gated**, ring, a single last heartbeat |
| 57.0 | **FIRE2** | everything we have | 10+ | Cm tutti | biggest shot; sub, drums, gong, brass, choir fortissimo |
| 57.5-59 | white beam past Tortoise | holding on | 9.5 | Cm | full sustained tutti, beam roar |
| 59.0 | **PIERCE** | yes | 10+ | Cm with Db | shatter of porcelain and glass, tutti slam |
| 59-61 | cracks run, core implodes | awe | 9 | Cm rising | cracks, ring chords climb; sucked in at 60.5 |
| 61.0 | **core break** | light | 10 | Cm | implosion boom, huge reverb, light sphere |
| 62-65.5 | rings topple, wall of water | slow tragedy of scale | 8 down to 5 | Cm, Bbm, Abm, Gm descending | huge falling groans, water roar, bass walking down, ends unresolved on G |
| 65.5 | cut | stunned | 0.5 | none | **everything cut** |
| 65.5-68.5 | ridge, smoke, moon, cannon cooling | emptiness | 0.5 | none | wind, ember crackle, sparse metal ticks |
| 68.5-71 | boy runs, hauls hatch | fear for her | 1 | none | small quick footfalls on metal, hot hatch creaking, strain, no music |
| 71.0 | hatch opens | the moment | 1.5 | Cm | hatch clank dies; **flute alone**: G4 |
| 71-73.5 | she opens her eyes, he cries | fragile hope | 1.5 | Cm, unaccompanied | single flute line G Ab G Eb |
| 73.5 | smallest smile | a breath of warmth | 2 | still minor | flute reaches C5 |
| 73.5-75 | | waiting | 2 | | flute Bb, ring held softly on G |
| 75.0 | country comes back on | it worked | 3 | Ab(add9), first major in the film | strings enter warm, soft clicks of relays return as harp notes |
| 75-76.5 | districts relight | warmth growing | 4 | Ab | swell; flute C, Eb |
| 76.5-78 | | almost | 5 | Bbsus4 to Bb | horns, choir, harp climbing |
| 78.0 | **the little window lights** | home | 6 | **C major: the only E natural in the film** | flute Eb rises to E5, full warm chord, bell, lamp click |
| 78.15, 78.3 | the lamp flickers | tenderness | 5 | C major | two tiny glockenspiel and bell tinkles |
| 78.3-79.4 | window glows, fade to black in the last 0.35 s | peace | 5 falling to 0 | C major | chord held, breathing out to silence with the picture |

## As mixed
Generated from what the renderer played and the measured levels.

| sec | RMS dBFS | max mom. LUFS | music (instrument: sounding pitches) | SFX (**bold** = starts in this second) | ambience |
|---|---|---|---|---|---|
|    0-1    |  -24.8 |  -18.9 | cb trem C2; vc trem C2 | **hit** |  |
|    1-2    |  -20.8 |  -15.4 | cb trem C2; vc trem C2 G2 | **hit**, **cable_rush**, **cable_accel @1.6**, **barrel_slam @1.9** |  |
|    2-3    |  -21.6 |  -15.5 | cb trem C2; vc trem C2 G2; glass G6; bowed vib G6 | **relay_click**, **st @2.5**, hit, barrel_slam |  |
|    3-4    |  -40.1 |  -21.2 | cb trem C2; vc trem C2 G2; glass G6; bowed vib G6 | hit, relay_click, st |  |
|    4-5    |  -31.4 |  -28.9 | cb C1; cb trem C2; vc trem C2; glass G6; bowed vib G6 | **relay_click @4.2**, **st @4.5**, **metal groan @4.8** | wind |
|    5-6    |  -41.0 |  -36.4 | N; cb C1; cb trem C2; vc trem C2 Db2; tuba C2; trb C2; horns C3 | st, metal groan | wind |
|    6-7    |  -35.3 |  -26.0 | N; cb C1; cb trem C2; vc trem C2 Db2; tuba C2; trb C2; horns C3 Db3; vla trem Db4; vln trem C5 Db5 | **arc_burst @6.5**, **pulse_whoosh @6.7**, **st @6.5**, metal groan | wind |
|    7-8    |  -32.0 |  -23.9 | N; cb C1; cb trem C2; vc trem C2 Db2; tuba C2; trb C2; vc spicc C2; horns C3 Db3; vla trem Db4; vln trem C5 Db5 | metal groan, arc_burst, pulse_whoosh | wind |
|    8-9    |  -34.2 |  -30.4 | N; cb C1; cb spicc C1 C2; cb trem C2; vc trem C2 Db2; tuba C2; trb C2; vc spicc C2; horns G2 C3 Db3; vla trem Db4; vln trem C5 Db5 | **metal groan @8.3**, **breaker_clack** | wind |
|    9-10   |  -32.8 |  -29.9 | N; cb C1; cb trem C2; vc trem C2 Db2; tuba C2; trb C2; vc spicc C2 Db2; cb spicc C2 Db2; horns G2 Db3; vla trem Db4; vln trem C5 Db5 | **breaker_clack**, metal groan | wind |
|   10-11   |  -25.6 |  -21.5 | N; bd2_mf; add; cb C1; cb spicc C1 Eb2; cb trem C2; vc trem C2 Db2; tuba C2; trb C2; vc spicc C2 Eb2; horns G2 Db3 Eb3 G3; vla trem Db4; vln trem C5 Db5 | **lever_chunk @10.2**, **fan_thrum @10.6**, metal groan | wind |
|   11-12   |  -25.9 |  -22.4 | N; bd2_mf; add; cb C1; cb trem C2; vc trem C2 Db2; tuba C2; vc spicc C2 Db2; cb spicc C2 Db2; trb C2 G2; horns Eb3 G3 C4 Eb4; vla trem Db4; vln trem G4 Ab4 C5 Db5 | **hammer_ratchet @11.5**, metal groan, fan_thrum | wind |
|   12-13   |  -23.1 |  -21.1 | bd2_mf; add; cb C1; cb spicc C1 C2; cb trem C2; vc trem C2 Db2; tuba C2; vc spicc C2; trb C2 G2; horns G3 C4 Eb4; vla trem Db4; vln trem G4 Ab4 C5 Db5 | metal groan, fan_thrum, hammer_ratchet | wind |
|   13-14   |  -24.5 |  -20.4 | add; cb C1; cb trem C2; vc trem C2 Db2; tuba C2; trb C2 G2; vc spicc Db2; cb spicc Db2; vla trem C3 Db3 Db4; horns G3 C4 Eb4; vln trem G4 Ab4 C5 Db5 | **heartbeat @13.5**, **hit @13.5**, fan_thrum, hammer_ratchet | wind |
|   14-15   |  -36.7 |  -34.1 | cb trem C2; vla trem C3 Db3; bsn C3 | **heartbeat @14.5**, hit | wind |
|   15-16   |  -37.8 |  -33.1 | cb trem C2; vla trem C3 Db3; bsn C3 | **heartbeat @15.4**, hit | wind |
|   16-17   |  -32.7 |  -30.8 | cb spicc C1 C2; cb trem C2; vc spicc C2; vla trem C3 Db3; bsn C3; vln trem G5 Db6 | **heartbeat @16.4**, **reticle_tick**, hit | wind |
|   17-18   |  -32.1 |  -27.4 | cb trem C2; vc spicc Db2 Eb2; cb spicc Db2 Eb2; vla trem C3 Db3; vln trem G5 Db6 | **heartbeat @17.2**, **reticle_tick**, hit | wind |
|   18-19   |  -26.8 |  -21.4 | add; big drum; gong; cymbal crash; cb spicc C1 C2 Db2; vc spicc C2 Db2; trb C2 G2; vla spicc C3 Db3; vc trem C3; horns G3 C4 Eb4; vln trem C5 Db5 | **rocket** | wind |
|   19-20   |  -24.7 |  -20.3 | add; big drum; gong; cymbal crash; cb spicc Eb1 C2 Db2; vc spicc C2 Db2 Eb2; trb C2 G2; vla spicc C3 Db3 Eb3; vc trem C3; horns Gb3 C4 Eb4; vln trem C5 Db5 | **rocket @19.1** | wind |
|   20-21   |  -26.5 |  -19.9 | add; big drum; gong; cb spicc C1 C2 Db2; vc spicc C2 Db2; trb C2 G2; vla spicc C3 Db3; vc trem C3; horns G3 C4 Eb4; vln trem C5 Db5 | **rocket @20.1** | wind |
|   21-22   |  -26.4 |  -21.1 | add; big drum; gong; beam_core; bass drum fff; S; cymbal crash; tuba C2; trb C2 Db3; cb C2; vc trem C2 Db3; horns G3 Ab3 C4; vln trem C5 Db5 G5 | **beam_zap**, **boom @21.4**, **hit @21.1**, rocket | wind |
|   22-23   |  -25.9 |  -21.1 | gong; beam_core; big drum; S; tuba C2; trb C2 Db3; cb C2; vc trem C2 Db3; horns G3 Ab3 C4; vln trem C5 Db5 G5 | **boom @22.1**, rocket | wind |
|   23-24   |  -22.3 |  -17.9 | gong; beam_core; big drum; S; tuba C2; trb C2 Db3; cb C2; vc trem C2 Db3; horns G3 Ab3 C4; vln trem C5 Db5 G5; vln C5 G5 | **boom @23.2**, **heartbeat @23.7** | wind |
|   24-25   |  -40.5 |  -36.9 | gong; S; vln C5 G5 | **heartbeat @24.8**, boom | wind |
|   25-26   |  -27.3 |  -25.0 | S; add; cb trem C2; vc trem C2 Db2; trb C2 Eb3; tuba C2; choir aah C3 G3 C4 Eb4 Db5; horns Eb3 G3 Eb4; vla trem C4 Db4; vln C5 G5 | **metal groan @25.7**, **heartbeat @25.5**, **hit @25.9** | wind |
|   26-27   |  -24.6 |  -22.8 | add; cb trem C2; vc trem C2 Db2; trb C2 Eb3; tuba C2; choir aah C3 G3 C4 Eb4 Db5; horns Eb3 G3 Eb4; vla trem C4 Db4; vln trem G5 Ab5 C6 | **heartbeat @26.3**, **hit @26.1**, metal groan | wind |
|   27-28   |  -23.1 |  -20.4 | add; cb trem C2; vc trem C2 Db2; trb C2 Eb3; tuba C2; choir aah C3 G3 C4 Eb4 Db5; horns Eb3 G3 Eb4; vla trem C4 Db4; vln trem G5 Ab5 C6 | **heartbeat @27.5**, metal groan | wind |
|   28-29   |  -38.1 |  -13.2 | glass G6; bowed vib G6 | **st**, **trigger_click @28.5** | wind |
|   29-30   |  -13.6 |  -10.6 | add; bass drum fff; big drum; S; cymbal crash; hit; cb C1 C2; tuba C2; trb C2 G2 C3; vc C2 G2 C3; horns C3 Eb3 G3 C4; choir aah C3 G3 C4 Eb4 G4 C5 Eb5; vla G3 C4 Eb4; tpt C4 Eb4 G4; vln G4 C5 Eb5; vln trem G5 C6 | **muzzle_blast**, **hit @29.4** | wind |
|   30-31   |  -18.4 |  -13.9 | big drum; S; hit; add; cb C1 C2; tuba C2; trb C2 G2 C3; vc C2 G2 C3; vc trem C2 G2; cb trem C2; horns C3 Eb3 G3 C4; choir aah C3 G3 C4 Eb4 G4 C5 Db5 Eb5; vla G3 C4 Eb4; tpt C4 Eb4 G4; vla trem C4; vln G4 C5 Eb5; vln trem G4 C5 Db5 G5 C6 | **air_tear @30.1**, muzzle_blast | wind |
|   31-32   |  -23.8 |  -14.3 | big drum; S; add; hit; crash_fff; trb C2 Db3; tuba C2; vc trem C2 G2; cb trem C2; choir aah C3 G3 C4 Db5 Eb5; horns C4 Db4; vla trem C4; vln trem G4 C5 Db5 | **st**, muzzle_blast, air_tear | wind |
|   32-33   |  -25.3 |  -22.1 | S; add; hit; big drum; trb C2 Db3; tuba C2; vc trem C2 G2; cb trem C2; choir aah C3 G3 C4 Db5 Eb5; horns C4 Db4; vla trem C4; vln trem G4 C5 Db5 | muzzle_blast | wind |
|   33-34   |  -14.9 |  -10.6 | S; add; hit; big drum; bass drum fff; cymbal crash; cb C1 Gb2; trb C2 Gb2 Db3; tuba C2; vc trem C2 G2; cb trem C2; vc C2 Gb2; horns C3 Gb3 Ab3 C4 Db4; choir aah C3 Gb3 G3 Ab3 C4 Db4 Ab4 Db5 Eb5; vla Gb3 Ab3 Db4; vla trem C4; vln trem G4 C5 Db5 Gb5 Ab5 Db6; tpt Ab4 Db5 | **twin_explosion @33.5**, **hit @33.9**, muzzle_blast | wind |
|   34-35   |  -15.1 |  -10.6 | add; bass drum fff; big drum; S; cymbal crash; cb C1 Gb2; tuba C2; trb C2 Gb2 Db3; vc C2 Gb2; horns C3 Gb3 Ab3 Db4; choir aah C3 Gb3 Ab3 Db4 Ab4 Db5; vla Gb3 Ab3 Db4; tpt Ab4 Db5; vln trem Gb5 Ab5 Db6 | **dust-wave roar**, twin_explosion, hit | wind |
|   35-36   |  -17.7 |  -14.8 | big drum; S | twin_explosion, dust-wave roar, hit | wind |
|   36-37   |  -19.6 |  -16.0 | S; cb trem C2; vc trem C2 Db2; vla trem C4 Db4 | **metal_tick @36.5**, **heartbeat @36.5**, **hit @36.5**, twin_explosion, dust-wave roar | wind |
|   37-38   |  -29.3 |  -26.2 | S; cb trem C2; vc trem C2 Db2; vla trem C4 Db4 | **metal_tick**, **heartbeat @37.3**, twin_explosion, dust-wave roar, hit | wind |
|   38-39   |  -33.6 |  -27.5 | cb trem C2; vc trem C2 Db2; horns C3 Eb3; vla trem C4 Db4 | **metal_tick**, **heartbeat @38.1**, twin_explosion, hit | wind |
|   39-40   |  -26.0 |  -24.0 | add; cb spicc Db1 C2; vc spicc C2 Db2; tuba C2; cb trem C2; trb C2 G2; choir aah C3 G3 C4 Eb4 G4; horns Eb3 F3 G3 Eb4; vln trem C5 Db5 | **metal_tick**, **heartbeat @39.3**, **metal groan @39.1**, hit | wind |
|   40-41   |  -24.2 |  -20.5 | add; cb spicc Eb1 C2 Db2; vc spicc C2 Db2 Eb2; tuba C2; cb trem C2; trb C2 G2; choir aah C3 Gb3 C4 Eb4 Gb4; vla spicc Db3 Eb3; horns F3 Gb3 Eb4; vln trem C5 Db5 | **metal_tick**, **heartbeat @40.4**, **hit @40.7**, metal groan | wind |
|   41-42   |  -25.2 |  -19.9 | add; vc spicc C2; cb spicc C2; tuba C2; cb trem C2; trb C2 G2; vla spicc C3; choir aah Bb3 Db4 F4 Bb4; horns Bb3 F4; vln trem C5 Db5; glass G6; bowed vib G6 | **metal_tick**, **st @41.5**, **hit**, heartbeat, metal groan | wind |
|   42-43   |  -28.0 |  -20.7 | beam_core; beam_body; tuba C2; trb C2 Db3; cb C2; vc trem C2 Db2; horns C3 G3 Db4 Eb4; vln trem C6 Db6 | **beam_zap**, **pulse_whoosh @42.4**, **heartbeat**, hit | wind |
|   43-44   |  -21.9 |  -17.0 | beam_core; beam_body; add; cb spicc C1 Db2 Eb2; tuba C2; trb C2 Db3; cb C2; vc trem C2 Db2; vc spicc C2 Db2 Eb2; horns G2 C3 G3 Db4 Eb4; vla spicc C3 Db3 Eb3; choir aah C3 G3 Eb4 C5; vln trem G4 C5 Db5 C6 Db6 | **heartbeat**, **metal groan @43.6**, pulse_whoosh | wind |
|   44-45   |  -19.6 |  -14.9 | beam_core; beam_body; add; cb spicc C1 C2 Db2; tuba C2; trb C2 Db3; cb C2; vc trem C2 Db2; vc spicc C2 Db2; horns G2 C3 Db3 G3 C4 Db4 Eb4; vla spicc C3 Db3; choir aah C3 G3 Eb4 C5; vln trem G4 C5 Db5 C6 Db6 | **heartbeat**, **st @44.2**, **stone crunch @44.2**, **pulse_whoosh @44.3**, metal groan | wind |
|   45-46   |  -16.3 |  -10.3 | beam_core; beam_body; add; big drum; bass drum fff; S; cymbal crash; hit; cb C1 C2; tuba C2; trb C2 G2 C3 Db3; vc trem C2 Db2 G2; vc spicc C2 Db2; cb spicc C2 Db2; vc C2 G2 C3; cb trem C2; horns C3 Db3 Eb3 G3 C4 Db4 Eb4; vla spicc C3; choir aah C3 G3 C4 Eb4 G4 C5 Eb5; vla G3 C4 Eb4; tpt C4 Eb4 G4; vln trem G4 C5 Db5 G5 C6 Db6; vln G4 C5 Eb5; glass G6; bowed vib G6 | **st @45.3**, **stone crunch @45.3**, **shield_slam @45.7**, pulse_whoosh, heartbeat | wind |
|   46-47   |  -16.6 |  -10.7 | big drum; add; bass drum fff; S; cymbal crash; hit; cb C1 C2; tuba C2; trb C2 G2 C3 Db3; vc C2 G2 C3; cb trem C2; vc trem C2 Db2 G2; horns C3 Eb3 G3 C4 Eb4; choir aah C3 G3 C4 Eb4 G4 C5 Db5 Eb5; vla G3 C4 Eb4; tpt C4 Eb4 G4; vla trem Db4; vln G4 C5 Eb5; vln trem G4 C5 Db5 G5 C6 | **add @46.7**, stone crunch, shield_slam | wind |
|   47-48   |  -21.5 |  -17.6 | big drum; S; hit; add; cb C1; cb trem C2; vc trem C2 Db2; tuba C2; trb C3 Db3; choir aah C3 G3 C5 Db5 Eb5; horns G3 Eb4; vla trem Db4; vla Eb4; vln trem G4 C5 Db5 | shield_slam, add | wind |
|   48-49   |  -20.5 |  -16.3 | S; hit; add; big drum; cb C1; cb trem C2; vc trem C2 Db2; tuba C2; trb C3 Db3; choir aah C3 G3 C5 Db5 Eb5; horns G3 Eb4; vla trem Db4; vla Eb4; vln trem G4 C5 Db5 | shield_slam, add | wind |
|   49-50   |  -19.6 |  -15.5 | S; hit; add; big drum; cb C1; cb trem C2; vc trem C2 Db2; tuba C2; trb C3 Db3; choir aah C3 G3 C5 Db5 Eb5; horns G3 Eb4; vla trem Db4; vla Eb4; vln trem G4 C5 Db5 | shield_slam, add | wind |
|   50-51   |  -15.7 |  -13.9 | S; hit; add; big drum; crash_fff; cb C1; cb trem C2; vc trem C2 Db2; tuba C2; trb C3 Db3; choir aah C3 G3 C5 Db5 Eb5; horns G3 C4 Eb4; vla trem Db4; vla Eb4; vln trem G4 C5 Db5; tpt C5 Eb5 | add | wind |
|   51-52   |  -15.9 |  -14.0 | hit; add; big drum; cb C1; cb trem C2; vc trem C2 Db2; tuba C2; trb C3 Db3; choir aah C3 G3 C5 Db5 Eb5; horns G3 C4 Eb4; vla trem Db4; vla Eb4; vln trem G4 C5 Db5; tpt C5 Eb5 | add | wind |
|   52-53   |  -24.4 |  -17.4 | hit; add; big drum; cb C1; cb trem C2; vc trem C2 Db2; tuba C2; trb C3 Db3; choir aah C3 G3 C5 Db5 Eb5; horns G3 Eb4; vla trem Db4; vla Eb4; vln trem G4 C5 Db5 C6 Db6 | **heartbeat**, add | wind |
|   53-54   |  -26.0 |  -24.2 | hit; add; big drum; cb C1; cb trem C2; vc trem C2 Db2; tuba C2; trb C3 Db3; choir aah C3 G3 C5 Db5 Eb5; horns G3 Eb4; vla trem Db4; vla Eb4; vln trem G4 C5 Db5 C6 Db6 | **heartbeat @53.2**, add | wind |
|   54-55   |  -19.4 |  -14.1 | hit; add; big drum; gong; crash_fff; cb C1; cb trem C2; vc trem C2 Db2; tuba C2; trb C3 Db3; choir aah C3 G3 G4 C5 Db5 Eb5 G5 Db6; horns G3 Eb4; vla trem Db4; vla Eb4; vln trem G4 C5 Db5 C6 Db6; tpt Ab4 C5 Eb5 | **rip @54.5**, **st @54.5**, add, heartbeat | wind |
|   55-56   |  -18.4 |  -13.9 | hit; add; big drum; gong; crash_fff; cb C1; cb trem C2; vc trem C2 Db2; tuba C2; trb C3 Db3; choir aah C3 G3 G4 C5 Db5 Eb5 G5 Db6; horns G3 Eb4; vla trem Db4; vla Eb4; vln trem G4 C5 Db5; tpt Ab4 C5 Eb5 | **fit @55.3**, add, rip | wind |
|   56-57   |  -26.4 |  -12.5 | hit; add; big drum; gong; cb C1; cb trem C2; vc trem C2 Db2; tuba C2; trb C3 Db3; choir aah C3 G3 G4 C5 Db5 Eb5 G5 Db6; horns G3 Eb4; vla trem Db4; vla Eb4; vln trem G4 C5 Db5; tpt Ab4 C5 Eb5; glass G6; bowed vib G6 | **st @56.2**, **heartbeat @56.5**, add, rip, fit | wind |
|   57-58   |  -12.7 |  -10.2 | gong; add; bass drum fff; big drum; S; cymbal crash; beam_core; beam_body; cb C1 C2; tuba C2; trb C2 G2 C3; vc C2 G2 C3; horns C3 Eb3 G3 C4; choir aah C3 G3 C4 Eb4 G4 C5 Eb5 G5; vla G3 C4 Eb4; tpt C4 Eb4 G4; vln G4 C5 Eb5; vln trem G5 C6 Eb6 | **muzzle_blast** | wind |
|   58-59   |  -14.1 |  -10.8 | gong; big drum; S; add; beam_core; beam_body; cb C1 C2; tuba C2; trb C2 G2 C3; vc C2 G2 C3; horns C3 Eb3 G3 C4; choir aah C3 G3 C4 Eb4 G4 C5 Eb5 G5; vla G3 C4 Eb4; tpt C4 Eb4 G4; vln G4 C5 Eb5; vln trem G5 C6 Eb6 | muzzle_blast | wind |
|   59-60   |  -14.1 |  -10.4 | gong; big drum; S; add; bass drum fff; cymbal crash; cb C1 C2; tuba C2; trb C2 G2 C3; vc C2 G2 C3; choir aah C3 G3 C4 Eb4 G4 C5 Db5 Eb5; horns G3 C4 Eb4; vla G3 C4 Eb4; tpt G4 C5 Eb5; vln G4 C5 Eb5; vln trem G5 C6 Db6 | **pierce_shatter**, **metal groan @59.1**, muzzle_blast | wind |
|   60-61   |  -17.4 |  -12.1 | S; big drum; cb C1 C2; tuba C2; trb C2 G2 Bb2 C3 Db3; vc C2 G2 C3; vc trem C2 Bb2; choir aah C3 G3 Bb3 C4 Db4 Eb4 F4 G4 Bb4 C5 Db5 Eb5; horns G3 Bb3 C4 Db4 Eb4 F4; vla G3 Bb3 C4 Db4 Eb4; tpt G4 C5 Eb5; vln G4 C5 Eb5; vln trem Db5 F5 G5 Bb5 C6 Db6 | **hit @60.8**, muzzle_blast, pierce_shatter, metal groan | wind |
|   61-62   |  -13.8 |  -10.3 | S; big drum; add; bass drum fff; cymbal crash; cb C1 C2; tuba C2; trb C2 G2 C3; vc C2 G2 C3; horns C3 Eb3 G3 C4; choir aah C3 G3 C4 Eb4 G4 C5 Eb5; vla G3 C4 Eb4; tpt C4 Eb4 G4; vln G4 C5 Eb5; vln trem G5 C6 | **debris rattle @61.5**, muzzle_blast, pierce_shatter, metal groan, hit | wind |
|   62-63   |  -20.5 |  -17.4 | S; big drum; add; bass drum; cb C1; tuba C2; cb trem C2; vc trem C2 C3 G3; trb C3 G3; horns C3 G3 Eb4; vla trem C3 G3 Eb4; choir aah C3 G3 Eb4 G4 C5; tpt Eb4; vln trem Eb4 G4 C5 | **ring_fall**, **water_wall @62.1**, pierce_shatter, hit, debris rattle | wind |
|   63-64   |  -17.9 |  -15.4 | S; big drum; bass drum; add; N; cb Bb0; tuba Bb1; cb trem Bb1; vc trem Bb1 Bb2 F3; trb Bb2 F3; horns Bb2 F3 Db4; vla trem Bb2 F3 Db4; choir aah Bb2 F3 Db4 F4 Bb4; tpt Db4; vln trem Db4 F4 Bb4 C5 | debris rattle, ring_fall, water_wall | wind |
|   64-65   |  -17.0 |  -15.4 | S; bass drum; add; N; cb Ab0; tuba Ab1; cb trem Ab1; vc trem Ab1 Ab2 Eb3; trb Ab2 Eb3; horns Ab2 Eb3 B3; vla trem Ab2 Eb3 B3; choir aah Ab2 Eb3 B3 Eb4 Ab4; tpt B3; vln trem B3 Eb4 Ab4 C5 | debris rattle, ring_fall, water_wall | wind |
|   65-66   |  -22.4 |  -17.8 | S; bass drum; add; N; cb G0; tuba G1; cb trem G1; vc trem G1 G2 D3; trb G2 D3; horns G2 D3 Bb3; vla trem G2 D3 Bb3; choir aah G2 D3 Bb3 D4 G4; tpt Bb3; vln trem Bb3 D4 G4 C5 | **wind @65.5**, **ember_bed @65.5**, **noise2 @65.5**, **metal_tick @65.9**, debris rattle, ring_fall, water_wall | wind |
|   66-67   |  -47.2 |  -51.0 | bass drum | **metal_tick @67.0**, **walker footstep (far) @66.3**, wind, ember_bed, noise2 |  |
|   67-68   |  -49.1 |  -52.6 |  | **metal_tick @67.3**, wind, ember_bed, noise2, walker footstep (far) |  |
|   68-69   |  -51.0 |  -54.3 |  | **metal_tick @68.1**, **footfall @68.8**, wind, ember_bed, noise2 |  |
|   69-70   |  -52.3 |  -51.9 |  | **metal_tick @69.1**, **footfall**, **hatch_strain @69.7**, wind, ember_bed, noise2 |  |
|   70-71   |  -50.8 |  -42.9 |  | **metal_tick @70.4**, wind, ember_bed, noise2, hatch_strain |  |
|   71-72   |  -39.7 |  -35.6 | flute G4; bowed vib G5 | **hatch_open**, wind |  |
|   72-73   |  -37.7 |  -34.4 | flute G4 Ab4; bowed vib G5 |  |  |
|   73-74   |  -38.5 |  -34.4 | flute Eb4 G4 C5; bowed vib G5 |  |  |
|   74-75   |  -38.2 |  -33.7 | flute Bb4 C5; bowed vib G5 |  |  |
|   75-76   |  -31.1 |  -26.2 | cb Ab1; vc Ab2; vla Eb3 Ab3; choir ooh Eb3 Ab3 C4; horns Ab3 Eb4; harp Ab3 C4 Eb4 Ab4; vln C4 Eb4 Bb4; flute Bb4 C5 | **relight_tick** |  |
|   76-77   |  -28.2 |  -25.0 | cb Ab1 Bb1; vc Ab2 Bb2; vla Eb3 F3 Ab3 Bb3; choir ooh Eb3 F3 Ab3 Bb3 C4 Eb4; horns Ab3 Bb3 Eb4 F4; harp Ab3 Bb3 C4 D4 Eb4 F4 Ab4 Bb4; vln C4 Eb4 F4 Bb4; flute C5 D5 Eb5 | **relight_tick** |  |
|   77-78   |  -26.4 |  -20.5 | cb Bb1; vc Bb2; vla F3 Bb3; choir ooh F3 Bb3 D4 Eb4; harp G3 Bb3 C4 D4 F4 G4 Bb4 C5 Eb5 F5 Ab5; horns Bb3 D4 F4; vln D4 Eb4 F4 Bb4; flute D5 Eb5 | **relight_tick** |  |
|   78-79   |  -22.6 |  -18.9 | bd_vsco_mp; add; trb C2 G2; cb C2; vc C2 G2 C3; horns C3 G3 C4 E4; choir aah C3 G3 C4 E4 G4 C5 E5; harp G3 C4 G4 Bb4 C5 C6; vla G3 C4 E4; vln G4 C5 E5; flute E5; oboe E5; bell G5 C6; glock E6 G6 | **relight_tick** |  |
|   79-79.4 |        |        | bd_vsco_mp; trb C2 G2; cb C2; vc C2 G2 C3; horns C3 G3 C4 E4; choir aah C3 G3 C4 E4 G4 C5 E5; vla G3 C4 E4; vln G4 C5 E5; harp C5 C6; flute E5; oboe E5; bell G5 C6; glock E6 G6 |  |  |
