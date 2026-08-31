# Audio

Everything the game makes noise with, and why it is built the way it is.

Two systems, deliberately separated:

| | | |
|---|---|---|
| `js/audio.js` | **synthesised** | every sound effect, every character voice. No files, no bytes, no licensing. |
| `js/music.js` + `assets/audio/` | **generated MP3s** | the score, the room beds, five impact cues. |

The split is not stylistic. Effects fire constantly and have to vary per hit, so
they are built at runtime from the game state. Music is long, plays rarely, and
benefits from being a real arrangement — so it is 23 MP3s made in Gemini Studio.

---

## 1. The rule that breaks everything if you forget it

**Nothing starts until a real user gesture.** Browsers suspend an audio context
created before one, and the failure is silent — the game boots, runs, and makes
no sound at all. `SFX.resume()` and `Music.resume()` are wired to `pointerdown`
on every button. If you add a new entry point, wire it there too.

---

## 2. Sound effects — `js/audio.js`

Built from three primitives: `env()`, `tone()` and `noise()`. Both `tone` and
`noise` take an optional final `dest` argument so a sound can sit behind its own
fader or panner; omit it and they go straight to `sfxGain` as before.

### Hits, smashes, the rest
`hit(power)`, `smash(material, size)`, `whiff()`, `jump()`, `land(hard)`,
`dodge()`, `coin(chain)`, `chain(n)`, `alarm()`, `bossRoar()`, `ui(up)`,
`promote()`. `smash` is tinted by material — `glass`, `paper`, `metal`, and
plastic as the default.

### Grab and throw
```js
SFX.grab(style, mass)
SFX.throw_(power, style, mass)
```
`style` comes from **`PROP_STYLES` in `weapons.js`** via `propStyle(kind).style`,
never a second table, so the two cannot drift apart — add a prop there and it
gets a sound for free. Unknown styles fall back to `light`. A hoisted colleague
passes `'person'`.

`mass` sets pitch and length (`heft = min(1, mass / 4)`); `style` adds the
material on top via `GRAB_TINT` — glass tinks, sweep rattles, spray clanks,
heavy is just weight. Throws detune the tint randomly so twenty in a row are not
twenty identical sounds.

### Coffee
`SFX.coffee()` runs the whole beat: dispense, three climbing gulps, the exhale,
and the cup going down. **It must finish inside the 0.9s per-cup gate**
(`S.coffeeCd` in `main.js`) or a second cup starts while the first is still
being swallowed. Currently 0.95s.

### Boss footsteps
```js
SFX.step(weight, dxFromPlayer)
```
Only the boss has them, and they are distance-attenuated on purpose: hearing him
cross the floor before he is on screen is the point. Six coworkers milling about
would just be noise.

Driven from `Boss.update()` in `office.js` by **distance travelled, not a
timer**, so the pace stays right whether he is patrolling (stride 58) or
charging (46).

**In practice you mostly hear these during the fight.** Outside it the boss
returns to `homeX` and stops — `if (Math.abs(d) > 40)` — so if he is already
home he never moves and never steps. Wanting to hear him pacing outside his
office means giving him an actual patrol, which is a gameplay change, not an
audio one. The call sits above the cutscene `return` because he walks in
those too. Attenuation is squared over 620px, with a stereo pan of ±0.7 from
`dx / 380`.

### Character voices
```js
SFX.voice(who, kind, power)   // kind: hurt | scream | curse | mutter
```
Two oscillators through bandpass filters parked on vowel formants — the Animal
Crossing / Simlish trick. Synthesised rather than recorded because the music
model is instrumental by design, Veo only produces voice inside a video with no
way to extract it here, and recorded lines are the one asset class that cannot
be made for free. It also pitches per character and per hit, so the boss and the
intern are audibly different people.

**Swearing is gibberish under a 1 kHz censor bleep.** Funnier than profanity,
cannot fail a store rating, needs no translating.

- `fscale` — the formant stretch — is what separates male from female, far more
  than pitch. Change that first.
- `CAST_VOICE` maps the named staff; anyone unlisted gets a stable voice from a
  hash of their name, so a new coworker is never mute and never changes voice
  mid-shift.
- `voiceBusy` locks each character so they never talk over themselves. Without
  it a five-hit combo stacked five screams.

Fires at: knockdowns, both places a coworker hits back, the panic transition (a
third of them, not all), the boss taking a hit, losing his temper, going down,
and being pestered.

---

## 3. Music — `js/music.js`

Two `<audio>` decks, crossfaded. One plays while the other loads underneath,
then they swap. **`preload` is `'none'`** — 23 tracks is 16 MB, five times the
rest of the build, so a track is only fetched the first time it is asked for.

### The director
`Music.update(S)` runs every frame and picks:

1. `bosschase` while the boss is fighting
2. `chaos1/2/3` by chain depth, with boss anger counting too (≥70 → tier 2,
   ≥35 → tier 1) so a furious office does not drop back to lift muzak
3. otherwise the room's bed, from `ROOM_BED`

Menus call `Music.scene('title'|'menu'|'shop'|'promote'|'fired')`; a shift calls
`Music.scene(null)` to hand control back.

### Three placement rules, each of which cost a bug
- **`Music.update(S)` sits at the TOP of `update(dt)`**, above the cutscene
  branch — that branch `return`s, and underneath it the menu loop played through
  the entire opening scene.
- **`scene(null)` sets `_fresh`**, which bypasses the hold once. The hold exists
  to stop thrashing *inside* a shift; applying it to the handover left the menu
  loop running five seconds into the game.
- **The music bus hangs off `master`, not `musicGain`.** The synthesised score
  owns `musicGain` and `SFX.stopMusic()` ramps it to zero, which would cut the
  files off mid-bar.

Hysteresis: a louder choice takes over instantly (`PRIORITY`), a calmer one has
to hold for `SETTLE` 2.5s, and nothing swaps sideways inside `HOLD` 5s.

### Impact cues
`Music.cue(key)` fires a musical flourish over the top. Five of them, the big
infrequent moments only:

| cue | fires on |
|---|---|
| `combo_finish` | the 5th beat of the light string, **on connect only** |
| `ground_slam` | the hammer's ground slam |
| `dinner_bell` | the pan stunning someone |
| `full_throttle` | starting a rocket-chair charge |
| `total_wipeout` | a chaos chain crossing four links |

The per-material smashes from the same generated pack are deliberately **not**
here: they fire constantly, `SFX.smash()` already does them for nothing, and
700 KB per impact for half a second of audio is a bad trade.

**`Music.warm()` trims the decoded buffer, and that is the whole point.**
`decodeAudioData` decodes the entire file; a 30s stereo track is ~10 MB of float
PCM, so five resident would be **50 MB on a phone for twelve seconds of audio**.
Copying out the front and dropping the rest measures 4.2 MB for all five.

A cue that has not finished loading is **skipped, not queued** — a flourish
arriving two seconds after the punch is worse than none. So warming happens
early: `combo_finish` and `total_wipeout` at `startShift()`, the weapon ones via
`Music.warmFor(id)` on equip and on weapon cycle. Each cue has its own cooldown,
because one swing can touch several bodies and `_swing` runs per body.

---

## 4. Regenerating the music

The tracks come from **Gemini Studio**'s Audio section (`Desktop\Gemini Prompt
Sender\dashboard`), which holds five preset packs written against this repo —
Soundtrack, Character stings, Props & destruction, Combat & combos, World &
ambience, 44 presets total.

```
generate in the Studio  →  python tools/collect-music.py
```

`collect-music.py` matches tracks **by prompt text, never by job id** — job ids
restart at `j1` every time the Studio server restarts while its library
persists, so an id matches old runs.

Two facts about the generator that shape every prompt:

- **Word it as music.** A "sound effect" prompt returns a written Foley recipe
  instead of audio. "a comedy music sting" returns audio. There is usually a
  *Create music* tool in Gemini's menu now, which makes this reliable, but it is
  not always there.
- **Length is ignored.** Every track comes back at ~30s whatever you ask for.
  Fine for loops; short cues put the gag in the first bar and vamp after it,
  which is why `CUES` trims them.

---

## 5. Levels

Measured on the master bus with an AnalyserNode, music muted — not judged by
ear. Peak amplitude:

| sound | peak |
|---|---|
| `hit(1.0)` | 0.48 |
| music cues | 0.34 – 0.45 |
| `smash` glass / metal | 0.19 / 0.14 |
| `bossRoar` | 0.16 |
| footstep, next to you | 0.15 |
| `throw_` (mug → cabinet) | 0.079 – 0.140 |
| voices: scream | 0.14 – 0.25 |
| voices: curse | 0.13 – 0.15 |
| voices: hurt | 0.12 – 0.18 |
| `promote` / `coin` | 0.12 / 0.11 |
| voices: mutter | 0.095 |
| `grab` (mug → cabinet) | 0.085 – 0.126 |
| coffee | 0.074 |
| footstep, 350px away | 0.026 |

Footsteps attenuate 0.15 → 0.084 → 0.026 → silent at 0 / 150 / 350 / 600px.
Grab and throw track mass by spectral centroid: papers 4244 Hz, mug 3486, chair
2299, printer 1703, cabinet 1811 on grab; papers 2248 down to cabinet 1261 on
throw.

**The voices were mixed three times quieter than this at first** and the first
thing anyone said about them was that they could not hear them in game. They
measured 0.036-0.127 against hits at 0.48 — audible in isolation, gone under a
hit, a smash and a music bed. They now sit alongside `smash` (0.19) and
`bossRoar` (0.16) and still under a punch. If they ever need moving again, the
numbers to change are the `loud` arguments in `SFX.voice`; the bandpass pair at
Q=7 throws away most of the oscillator's energy, which is why the raw values
look so hot next to the measured peaks.

---

## 6. If something goes quiet

Check where the fundamental sits **before** touching the gain. A mutter was once
inaudible at 0.014 peak because its pitch multiplier put the boss's fundamental
below the formant band — raising the gain barely moved it, and the fix was
pitch. The same trap is waiting in anything that filters a low voice.
