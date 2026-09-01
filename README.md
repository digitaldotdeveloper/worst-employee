# WORK RELATED

> HATE YOUR JOB? BECOME THE WORST EMPLOYEE.

A 2D side-on office beat-'em-up that runs in a browser. You are FIRASS, a new
hire in a company that keeps saying "we're a family". Wrecking the place turns
out to be the fastest route to a promotion.

**[Play it](https://digitaldotdeveloper.github.io/worst-employee/)** — landscape,
phone or desktop.

Vanilla ES modules. No build step, no framework, no dependencies. It runs by
serving the folder.

## Controls

| | Keyboard | Touch |
|---|---|---|
| Move | `A` / `D` or arrows | left thumb, anywhere |
| Jump | `W` / `Space` | JUMP |
| Light hit | `J` | tap HIT |
| Heavy hit | `K` | hold HIT |
| Dodge | `Shift` | DODGE — brief i-frames |
| Grab / throw | `L` | GRAB |
| Slap someone you are holding | `J` | HIT |
| Restart / end shift | `R` / `Esc` | END SHIFT |

Grab a colleague from **behind** and you choke them instead. Walk into the
coffee machine for the boost.

## The chaos chain

Hit something hard enough and it turns **chaotic** — it glows. Anything it then
hits inherits the chain one link deeper. Coffee, monitor, printer, papers,
colleague, boss. The longer the chain, the bigger the multiplier and the
payout.

Productivity going **down** is the win condition. Fill the boss's anger bar
through five stages and he comes for you.

## The building

Six floors, a lift with a working button panel, and a staircase:

```
FLOOR 13   EXECUTIVE      the boss's office
FLOOR 12   OPERATIONS     where you start
FLOOR 11   IT & HR
FLOOR 10   FINANCE
FLOOR  9   SALES
P          CAR PARK
```

Each floor is divided into rooms you walk between, with doors into meeting
rooms, the kitchen and the departments. Security patrol, and they will come for
you.

## What is in

- Movement with coyote time, jump buffering and variable jump height
- A 3-hit light combo with a chain window, and a heavy with real commitment
- Frame-accurate startup / active / recover on every attack
- Hit-stop, screen shake, knockback, impact sparks, debris, flying paper
- Custom AABB physics, one-way desks, throwable and destructible props
- Grab, throw, slap and choke, each with its own animation set
- Colleagues who sit at their desks and work, panic, flee, or fight back and
  hit you — and who stay on the floor once they are actually out
- A boss with five anger stages and a boss fight
- Synthesised SFX and a generated music bed that follows the scene
- The chaos chain, coin payouts, company damage tracking, and a shift report

## Layout

```
index.html            markup, HUD, screens
css/game.css          all styling
js/config.js          every tuning number that decides feel — start here
js/engine.js          AABB physics, one-way platforms, impact events
js/player.js          movement + combat state machine
js/office.js          coworkers, boss, props, level build
js/art.js             sprite sets and the pose selectors
js/chaos.js           the chain system
js/fx.js              hit-stop, shake, particles, floating numbers
js/audio.js music.js  synthesised SFX, and the music director
js/input.js           keyboard + touch, latched edges
js/main.js            state, loop, camera, renderer, shift report
assets/               every drawn frame the game loads
tools/verify.js       the verifier — see below
```

## Art

Every frame is generated with our own **Gemini Studio** — characters,
animation, props, backgrounds, UI. Nothing bought, no subscriptions. Raw
renders are cut to game frames by `tools/cutout.py`, which also writes the head
and hand anchors each pose is drawn from.

The pose selectors in `js/art.js` map game state to a frame filename. A pose
that does not exist **falls back to `idle` silently**, so coverage is checked
rather than trusted:

```bash
python -m http.server 4320
node tools/verify.js          # pose coverage + anchors
node tools/verify.js --live   # + in-game behaviour checks
```

Run it after any change to a selector, and before any push.

## Run locally

ES modules need http, not `file://`:

```bash
python -m http.server 4320
```

## Status

In development, and playable. Currently in a testing phase: free roam only, one
outfit, all floors unlocked.
