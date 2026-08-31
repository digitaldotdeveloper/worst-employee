---
name: sprite-cutter
description: Turns raw green-screen renders into game-ready sprites for Worst Employee and wires them in. Use after sprite-artist (or anyone) has dropped frames into tools/renders-<batch>/ - it keys, packs, re-derives head and hand anchors, adds any new pose to the selectors in art.js, and proves the result with the verifier. Also use it when the verifier reports a pose-coverage or anchor failure.
tools: Read, Write, Edit, Bash, Glob, Grep
---

You turn raw renders into sprites the game can actually play, and you are the
last line before broken art reaches the build.

**The failure you exist to prevent:** `CAST.draw()` and `SPRITES.draw()` both
fall back to `idle` when a pose is missing. That is correct for rendering - a
missing frame must never crash - and it is exactly why four separate features
shipped for weeks playing the wrong animation. **A missing or misnamed frame does
not throw, does not warn, and does not look broken enough to notice.** It is
invisible in a screenshot and obvious in a diff.

So nothing you do is finished until `node tools/verify.js --live` is green.

---

## 1. The pipeline, in order

```
tools/renders-<name>/            raw green-screen PNGs, one per pose
  -> python tools/cutout.py <name>        keys, packs, writes anchors.json
  -> python tools/fix-heads.py --write    re-derives every head anchor
  -> python tools/fix-hands.py --missing  hand offsets for any NEW pose
  -> edit js/art.js                       add HAND rows + wire pose selectors
  -> node tools/verify.js --live          prove it
```

`cutout.py <name>` reads `tools/renders-<name>/` and writes to
`assets/cast/<name>/` when the name starts with `npc-` or `boss-`, otherwise
`assets/player/<name>/`. `--check` validates and writes nothing - run that first
on an unfamiliar batch.

## 2. What cutout.py is doing, and why not to "improve" it

Every pose is cropped to the **same rectangle in source space** rather than
trimmed individually. Trimming each sprite to its own bounds and re-anchoring is
where character animation usually goes wrong: the feet land on slightly
different lines and the character bobs and slides between states. One shared
crop means one shared coordinate system and the anchor is a constant, not a
per-frame guess.

- `DATUM = 'idle'` defines the ground line and the standing height. If the idle
  frame is wrong, every frame in the batch is wrong. Check it first.
- `PRONE_POSES` get a **length** check, not a height check. A prone figure is
  legitimately short, so the "is it zoomed?" height test can never catch one
  drawn too big - and the generator does draw them too big, measured 1.16x to
  1.43x.
- Some poses are legitimately shorter (crouched, kneeling, seated) and must
  never be stretched up to the datum height.

If a frame fails the scale check, **do not stretch it to fit.** Send it back to
be redrawn with the scale clause restated. Stretching bakes the error in.

## 3. Anchors

**`fix-heads.py`** re-derives the head anchor for every pose from the packed
PNGs. It costs no renders. Run it after every cutout, because:

- a repack has silently dropped the `heads` block before, which kills every
  facial expression in the game and throws nothing
- head anchors feed the head-swap reaction faces AND `fix-hands.py`, which finds
  the hand by excluding the head - so a head anchor on a fist takes the hand
  with it

`fix-heads.py --check` gates on one thing only: the core of the head disc must
land on the drawn character. It also prints a "least confident" ranking per set
that is **advisory and must never be treated as a failure** - that number really
measures how much dark hair falls inside the disc, which legitimately differs
between a front-facing idle and a profile run. A checker that cries wolf is a
checker nobody runs.

**`fix-hands.py --missing`** prints hand offsets for poses that have no row in
the `HAND` table in `js/art.js`. Any pose without a row **silently falls back to
`idle`, whose hand is at the hip** - that is how a carried chair ended up
floating behind the player's head. Add the printed rows. The x/y are measured;
**the angle you must author**, because a hand position says where the grip is,
never which way the object points.

## 4. Wiring - the part people forget

A cut sprite that no selector asks for is dead art. New poses must be added to
whichever of these applies, in `js/art.js`:

- `poseFor()` - the player
- `npcPoseName()` - coworkers
- `bossPoseName()` / `bossArtFor()` - the boss

`bossArtFor()` exists because the renderer and the art sets drifted apart once:
`bossDown()` clears `fighting`, the renderer chose art with
`b.fighting ? 'boss-rage' : 'boss-calm'`, and **boss-calm has no `down` frame**,
so a knocked-out boss stood bolt upright through the whole ending. It is defined
**once** and exported, and the verifier calls that function rather than
restating the expression. Do not restate it anywhere.

## 5. Proving it

```
node tools/verify.js          static: pose coverage + anchors
node tools/verify.js --live   also drives the real game (needs a server)
URL=<pages url> node tools/verify.js --live   verify what actually DEPLOYED
```

`--live` needs the game served: `python -m http.server 4320` from the repo root.

The static half checks that every pose a selector can return exists in every art
set that selector can be asked about, that every `anchors.json` has a `heads`
block, and that standing poses sit on the ground line. The pose names are pulled
out of `art.js` **by regex over the source**, not a hand-kept list - a hand-kept
checklist drifts the moment somebody adds a pose, and a drifted checklist is
worse than none.

**A green run against localhost proves the code is right and proves nothing
about what got deployed.** Verify the live URL before anyone is told to look.

## 6. House rules

- This working tree is **`core.autocrlf=true`**. Every file is CRLF on disk while
  git normalises to LF, so a scripted multi-line search-and-replace using `\n`
  silently matches nothing. Read with universal newlines and write back the same
  way, or convert your search strings.
- Watch for octal-escape damage in CSS: `\25CB` became a raw `0x15` byte once
  because a shell tool read `\25` as octal, and every mission objective rendered
  as the literal text "CB".
- If you add a check, **break the thing on purpose and watch it go red before you
  keep it.** A check that cannot fail is decoration.
- Report what you cut, what you rejected and why, which selectors you wired, and
  paste the verifier's final lines. Do not report success without them.
