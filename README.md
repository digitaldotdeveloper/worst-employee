# WORK RELATED — feel test

> HATE YOUR JOB? BECOME THE WORST EMPLOYEE.

A browser **greybox prototype** for an Android 2D action-comedy game. You are a
new hire in a company that keeps saying "we're a family". Destroying the place
turns out to be the fastest route to a promotion.

**This build has no art on purpose.** It exists to answer one question before a
single sprite is drawn: *does it feel good?* Combat timing, physics, knockback,
hit-stop and the chaos-chain system are the whole point. Everything is coloured
boxes until those are right.

## Play

Open the page. Landscape on a phone.

| | Keyboard | Touch |
|---|---|---|
| Move | `A` / `D` or arrows | left thumb, anywhere |
| Jump | `W` / `Space` | JUMP |
| Light hit | `J` | tap HIT |
| Heavy hit | `K` | hold HIT |
| Dodge | `Shift` | DODGE — brief i-frames |
| Grab / throw | `L` | GRAB |
| Restart / end shift | `R` / `Esc` | END SHIFT |

Walk into the coffee machine for the boost.

## The chaos chain

Hit something hard enough and it turns **chaotic** (it glows). Anything it then
hits inherits the chain one link deeper. Coffee → monitor → printer → papers →
coworker → boss. The longer the chain, the bigger the multiplier and the payout.

Productivity going **down** is the win condition. Fill the boss's anger bar
through five stages and he fights you.

## What's implemented

- Movement with coyote time, jump buffering, variable jump height
- 3-hit light combo with a chain window, plus a heavy with real commitment
- Frame-accurate startup / active / recover on every attack
- Hit-stop, screen shake, knockback, impact sparks, debris, flying paper
- Custom AABB physics, one-way desks, throwable and destructible props
- The chaos chain, coin payouts, company damage tracking
- Coworkers who panic, a boss with five anger stages and a boss fight
- Shift report with a shareable result

## Layout

```
index.html          markup, HUD, screens
css/game.css        all styling
js/config.js        every tuning number that decides feel — start here
js/engine.js        AABB physics, one-way platforms, impact events
js/player.js        movement + combat state machine
js/office.js        props, coworkers, boss, level build
js/chaos.js         the chain system
js/fx.js            hit-stop, shake, particles, floating numbers
js/art.js           ART SEAM — greybox now, sprites later
js/input.js         keyboard + touch, latched edges
js/main.js          state, loop, camera, renderer, shift report
assets/manifest.json  every art slot the game will ask for
```

## Art

All visuals are generated with our own **Gemini Studio** — characters,
animation, props, backgrounds, UI. Nothing bought, no subscriptions. See
`assets/manifest.json` for the full slot list and the generation rules.

To wire sprites in, register them in `js/art.js`:

```js
ART.load({ 'player.idle': { src: 'assets/player/idle.png', frames: 6, fps: 8 } });
```

Gameplay code does not change — `drawHuman` / `drawProp` fall back to greybox
for anything that has not loaded.

## Run locally

Any static server (ES modules need http, not `file://`):

```
npx serve .
```

## Status

Prototype. Not the game — the proof that the game is worth building.
