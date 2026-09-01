// VERIFY — does the art the game asks for actually exist, and does it play?
//
//   node tools/verify.js            static coverage only, no browser
//   node tools/verify.js --live     also drive the game and check it animates
//
// ---------------------------------------------------------------------------
// WHY THIS EXISTS
//
// Every animation bug found in pass 13 was found by DIFFING THE POSE SELECTORS
// AGAINST THE FRAME FOLDERS, not by playing the game. That is not a coincidence
// and it is not luck:
//
//   CAST.draw()    falls back to `idle` when a pose is missing.
//   SPRITES.draw() does the same.
//
// Which is correct for rendering — a missing frame must never be a black box or
// a crash — and it means a missing frame is INVISIBLE. It does not throw, it
// does not warn, it just quietly plays the wrong animation forever. Four
// separate features had been shipping like that for weeks:
//
//   * the player had `downT = 2.2` on a knockout and no `down` frame, so
//     main.js rotated the STANDING hurt frame 77 degrees to fake lying down
//   * coworkers fought back by playing `run-1..4`
//   * "SIT AT YOUR DESK TO BEGIN" pointed at a desk that was not yours, and
//     the player had no `sit` frame
//   * every scripted walk was frozen on frame one
//
// None of that is visible in a screenshot. All of it is visible in a diff.
// So: the selectors are the spec, the folders are the implementation, and this
// compares them. Run it after every generation pass and after any edit to
// poseFor / npcPoseName / bossPoseName.
// ---------------------------------------------------------------------------

const fs = require('fs');
const path = require('path');

const ROOT = path.dirname(__dirname);
const ART = fs.readFileSync(path.join(ROOT, 'js', 'art.js'), 'utf8');

let fail = 0;
const bad = m => { fail++; console.log('  FAIL  ' + m); };
const ok = m => console.log('  ok    ' + m);

// --------------------------------------------------------------- the spec
// Pull the quoted pose names out of each selector. Deliberately regex over the
// source rather than a hand-kept list: a hand-kept list drifts the moment
// somebody adds a pose, and a drifted checklist is worse than none.
function selector(name) {
  const re = new RegExp('(?:export )?function ' + name + '\\s*\\([^)]*\\)\\s*\\{');
  const m = re.exec(ART);
  if (!m) return null;
  let i = m.index + m[0].length, depth = 1;
  while (i < ART.length && depth > 0) {
    if (ART[i] === '{') depth++;
    else if (ART[i] === '}') depth--;
    i++;
  }
  return ART.slice(m.index, i);
}

// Words that appear in quotes inside a selector but are NOT pose names: they are
// mode names, attack kinds and phase names being compared against.
// `hunt` joins these: it is security's MODE — walking towards the trouble
// instead of away from it — and that branch returns walk-1..4, not a frame
// called hunt. Any new mode name compared inside a selector belongs here.
const NOT_A_POSE = new Set(['fight', 'panic', 'work', 'hunt', 'heavy', 'startup', 'down-mode']);

function posesIn(src) {
  if (!src) return [];
  // A CYCLE IS FOUR FRAMES UNDER ONE NAME. `cycle(c, 'charge', t, 9)` builds
  // 'charge-1'..'charge-4' at runtime, so scraping quoted strings sees a pose
  // called 'charge' that does not exist and misses the four that do. Expanding
  // it here makes the check STRONGER — a half-delivered cycle now fails.
  const bases = [...(src.match(/cycle\(\s*\w+\s*,\s*'([a-z0-9-]+)'/g) || [])]
    .map(m => /'([a-z0-9-]+)'/.exec(m)[1]);
  const expanded = bases.flatMap(b => [1, 2, 3, 4].map(i => b + '-' + i));
  return [...new Set([
    ...(src.match(/'[a-z0-9][a-z0-9-]*'/g) || [])
      .map(s => s.slice(1, -1))
      .filter(s => !NOT_A_POSE.has(s) && !bases.includes(s)),
    ...expanded,
  ])];
}

const comboBlock = /const COMBO = \[[\s\S]*?\];/.exec(ART);
const PLAYER_POSES = [...new Set([
  ...posesIn(selector('poseFor')),
  ...posesIn(comboBlock && comboBlock[0]),
])].sort();
const NPC_POSES = posesIn(selector('npcPoseName')).sort();
const BOSS_POSES = posesIn(selector('bossPoseName')).sort();

// ------------------------------------------------------- the implementation
function anchors(rel) {
  const p = path.join(ROOT, rel, 'anchors.json');
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

const PLAYER_SETS = fs.readdirSync(path.join(ROOT, 'assets', 'player'))
  .filter(d => fs.existsSync(path.join(ROOT, 'assets', 'player', d, 'anchors.json')));
const CAST_SETS = fs.readdirSync(path.join(ROOT, 'assets', 'cast'))
  .filter(d => fs.existsSync(path.join(ROOT, 'assets', 'cast', d, 'anchors.json')));

console.log('\n=== POSE COVERAGE ===');
console.log(`selectors ask for: player ${PLAYER_POSES.length}, npc ${NPC_POSES.length}, boss ${BOSS_POSES.length}`);

function coverage(label, rel, want) {
  const a = anchors(rel);
  if (!a) return bad(`${label}: no anchors.json`);
  const have = new Set(a.poses);
  const missing = want.filter(p => !have.has(p));
  if (missing.length) bad(`${label}: ${a.poses.length} frames, MISSING ${missing.join(' ')}`);
  else ok(`${label}: ${a.poses.length} frames, all ${want.length} requested poses present`);
}

// The boss has TWO art sets and `bossPoseName` does not map onto them evenly:
//   const bossArt = (b.fighting || b.defeated) ? 'boss-rage' : 'boss-calm';
// so the fighting poses can only ever be asked of boss-rage, and boss-calm is
// only ever asked for the states he can be in while NOT fighting. Checking the
// flat selector list against both sets reports two frames that are unreachable
// by construction — and a checker that cries wolf is a checker nobody runs.
const BOSS_CALM_REACHABLE = BOSS_POSES.filter(p => !/^c\d-(wind|hit)$/.test(p) && p !== 'down');
// The mirror of that, added when the boss got a `sit` frame. bossPoseName only
// returns 'sit' for `b.seated && !b.fighting`, and bossArtFor only chooses
// boss-rage for `b.fighting || b.defeated` — and a defeated boss returns 'down'
// on the line above 'sit' anyway. So boss-rage can never be asked for it.
// Exempting it is the same call as the line above, for the same reason, and it
// was checked against the two selectors rather than assumed.
const BOSS_RAGE_REACHABLE = BOSS_POSES.filter(p => p !== 'sit');

for (const s of PLAYER_SETS) coverage('player/' + s, `assets/player/${s}`, PLAYER_POSES);
for (const s of CAST_SETS) {
  const want = s === 'boss-calm' ? BOSS_CALM_REACHABLE
             : s === 'boss-rage' ? BOSS_RAGE_REACHABLE
             : NPC_POSES;
  coverage('cast/' + s, `assets/cast/${s}`, want);
}

// ------------------------------------------------------------------ anchors
// A frame that exists but is anchored wrong is the other half of the problem:
// it draws, so nothing looks broken, it just floats or sinks.
console.log('\n=== ANCHORS ===');
const PRONE = new Set(['down']);
const CROUCHED = new Set(['sit', 'getup', 'land', 'c4-wind', 'dodge', 'held']);

for (const [label, rel] of [
  ...PLAYER_SETS.map(s => ['player/' + s, `assets/player/${s}`]),
  ...CAST_SETS.map(s => ['cast/' + s, `assets/cast/${s}`]),
]) {
  const a = anchors(rel);
  if (!a) continue;
  const issues = [];

  // Every face in the game stops drawing if this is missing, and nothing
  // throws. It has been silently dropped by a repack before.
  if (!a.heads) issues.push('NO heads block — every facial expression is dead');
  else {
    const noHead = a.poses.filter(p => !a.heads[p]);
    if (noHead.length) issues.push(`no head for ${noHead.join(' ')}`);
  }

  // Feet on the floor. Prone frames anchor to their own bottom, and airborne
  // and crouched frames are legitimately off it, so only standing poses count.
  const AIR = new Set(['jump-up', 'jump-apex', 'fall', 'air-hit']);
  for (const p of a.poses) {
    if (PRONE.has(p) || CROUCHED.has(p) || AIR.has(p)) continue;
    const b = a.poseBottom && a.poseBottom[p];
    if (b == null) continue;
    if (Math.abs(b - a.groundY) > 14) {
      issues.push(`${p} stands ${(b - a.groundY).toFixed(0)}px off the ground line`);
    }
  }
  if (issues.length) bad(`${label}: ` + issues.join('; '));
  else ok(`${label}: heads present, every standing pose on the ground line`);
}

// -------------------------------------------------------------------- live
if (!process.argv.includes('--live')) {
  console.log(fail ? `\n${fail} PROBLEM(S)\n` : '\nall static checks passed\n');
  process.exit(fail ? 1 : 0);
}

// Needs the game served locally and Playwright borrowed from the Gemini
// dashboard — this repo has no dependencies of its own and is not getting any.
const PW = 'C:/Users/it/Desktop/Gemini Prompt Sender/dashboard/node_modules/playwright-core';
const URL = process.env.URL || 'http://127.0.0.1:4320/';

(async () => {
  const { chromium } = require(PW);
  const b = await chromium.launch({
    channel: 'chrome',
    args: ['--no-sandbox', '--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--disk-cache-size=1'],
  });
  const ctx = await b.newContext({
    viewport: { width: 960, height: 540 },
    extraHTTPHeaders: { 'Cache-Control': 'no-cache' },
  });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  p.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });

  console.log('\n=== LIVE ===  ' + URL);
  await p.goto(URL, { waitUntil: 'networkidle' });
  await p.evaluate(() => localStorage.clear());
  await p.reload({ waitUntil: 'networkidle' });
  await p.waitForTimeout(4200);

  // A patch landing between `async` and `function` kills the whole module graph
  // with no useful error. This has happened twice.
  if (!(await p.evaluate(() => !!window.WE))) {
    bad('window.WE missing — the module graph did not load');
    console.log(errs.slice(0, 4).join('\n'));
    await b.close();
    process.exit(1);
  }
  ok('module graph loaded');

  await p.click('#btnFree'); await p.waitForTimeout(500);
  // The creator is SKIPPED while every appearance option has one value, so
  // FREE ROAM drops straight into the shift and START MONDAY never appears.
  // Clicking it unconditionally hung the whole run. Click it only if the
  // screen is actually up, so this works either way.
  if (await p.evaluate(() => !document.getElementById('create').classList.contains('hidden'))) {
    await p.click('#btnHired', { force: true });
  }
  await p.waitForTimeout(800);

  // THE TOUR. Story beats tween `x` with `vx` pinned to zero, so a walk cycle
  // that reads `vx` alone renders everybody standing still and sliding.
  const seenP = new Set(), seenB = new Set();
  for (let i = 0; i < 600; i++) {
    await p.waitForTimeout(90);
    const s = await p.evaluate(() => {
      const S = window.WE.S;
      if (!S.story || !S.story.active) return 'over';
      if (S.story.choice) { S.story.pick(1); return 'q'; }
      const bo = S.actors.boss;
      return {
        pl: window.WE.poseFor(S.player, S.player.animT || 0),
        bo: bo && bo.visible ? window.WE.npcPoseName(bo, bo.animT || 0) : null,
      };
    });
    if (s === 'over') break;
    if (s === 'q') continue;
    seenP.add(s.pl);
    if (s.bo) seenB.add(s.bo);
  }
  const walked = [...seenP].filter(x => x.startsWith('walk-')).length;
  walked >= 3 ? ok(`tour: player walks (${walked} walk frames)`)
              : bad(`tour: player used ${walked} walk frames — scripted walks are not animating`);
  const bWalk = [...seenB].filter(x => x.startsWith('walk-')).length;
  bWalk >= 3 ? ok(`tour: boss walks (${bWalk} walk frames)`)
             : bad(`tour: boss used ${bWalk} walk frames`);
  [...seenB].includes('point') ? ok('tour: boss points at what he is describing')
                               : bad('tour: boss never points');

  if (await p.isVisible('#btnSkip')) { await p.click('#btnSkip', { force: true }); await p.waitForTimeout(900); }

  // YOUR DESK — the intro's closing instruction has to actually do something.
  const desk = await p.evaluate(() => {
    const S = window.WE.S;
    if (!S.playerDesk) return null;
    S.player.x = S.playerDesk.x + 20; S.player.vx = 0;
    return S.playerDesk.label;
  });
  if (!desk) bad('no player desk — "SIT AT YOUR DESK TO BEGIN" points at nothing');
  else {
    await p.waitForTimeout(300);
    await p.evaluate(() => window.WE.S.tryInteract());
    await p.waitForTimeout(600);
    const st = await p.evaluate(() => ({
      sitting: window.WE.S.player.sitting,
      pose: window.WE.poseFor(window.WE.S.player, 1),
    }));
    st.sitting && st.pose === 'sit' ? ok(`desk: sits at "${desk}" and plays the sit frame`)
                                    : bad(`desk: sitting=${st.sitting} pose=${st.pose}`);
    await p.evaluate(() => { window.WE.S.player.sitting = false; });
  }

  // THE COMBO. Every beat needs its own wind-up, or the chain reads as four
  // impacts with no anticipation between them.
  const combo = new Set();
  for (let k = 0; k < 5; k++) {
    await p.keyboard.press('j');
    for (let i = 0; i < 8; i++) {
      await p.waitForTimeout(28);
      combo.add(await p.evaluate(() => window.WE.poseFor(window.WE.S.player, window.WE.S.player.animT)));
    }
    await p.waitForTimeout(90);
  }
  const winds = [...combo].filter(x => /^c\d-wind$/.test(x)).length;
  winds >= 4 ? ok(`combo: ${winds} distinct wind-ups`)
             : bad(`combo: only ${winds} wind-ups — beats are reusing hit frames`);

  // FLOORED. `downT` was set for weeks with no frame behind it.
  await p.evaluate(() => {
    const S = window.WE.S;
    S.player.iframes = 0; S.player.hp = 1; S.player.takeHit(S, 50);
  });
  const floored = [];
  for (let i = 0; i < 26; i++) {
    await p.waitForTimeout(100);
    const q = await p.evaluate(() => window.WE.poseFor(window.WE.S.player, 1));
    if (floored[floored.length - 1] !== q) floored.push(q);
  }
  floored[0] === 'down' && floored.includes('getup')
    ? ok('floored: down -> getup -> up')
    : bad('floored: ' + floored.join(' -> '));

  // THE SLAP. It shipped with ONE drawn frame and a two-state toggle, so the
  // hand was still cocked back at the moment the blow resolved: the action
  // literally connected with nothing. It is three beats now, and the
  // boundaries are read from SLAP in config.js by both player.js (which fires
  // the impact) and poseFor (which picks the frame). Two things are checked,
  // because the failure has two halves and only one of them is a missing file:
  //   1. all three frames are actually reached during one window, in order
  //   2. the held colleague does not MOVE across them. He is pinned to
  //      handAt(poseFor(...)) every frame, so the three beats share one HAND
  //      row on purpose. Separate rows — including the one fix-hands.py
  //      measures for grab-slap-hit, whose blob merges with the head — snap
  //      him up and back inside 0.09s.
  const slap = await p.evaluate(async () => {
    const S = window.WE.S, pl = S.player;
    const c = S.coworkers.find(x => !x.dead && x.visible !== false);
    if (!c) return { err: 'no coworker to grab' };
    pl.downT = 0; pl.hurtT = 0; pl.sitting = false; pl.vx = 0; pl.slapCd = 0;
    c.dead = false; c.held = false; c.downT = 0;
    c.x = pl.cx + pl.face * 24 - c.w / 2; c.y = pl.y + pl.h - c.h;
    // FACE HIM. Grabbing someone facing the same way you are is a CHOKE now,
    // not a collar grab, and a choke has no slap in it — both arms are busy.
    // Without this the test took whichever hold the wandering NPC's facing
    // happened to give it, so it passed or failed at random. A test about the
    // slap has to set up the hold the slap belongs to.
    c.face = -pl.face;
    pl._grabOrThrow(S);
    if (!pl.holdingPerson || !pl.carrying) return { err: 'grab did not take' };
    pl._slap(S);
    // Sample EVERY frame. The beats are 70/90/100ms long, so a polling loop
    // from the test runner steps straight over one of them.
    const seen = [], hold = [];
    for (let i = 0; i < 60 && pl.slapCd > 0; i++) {
      await new Promise(r => requestAnimationFrame(r));
      const q = window.WE.poseFor(pl, pl.animT);
      if (seen[seen.length - 1] !== q) seen.push(q);
      if (pl.carrying) hold.push(pl.carrying.y - (pl.y + pl.h));
    }
    await new Promise(r => requestAnimationFrame(r));
    seen.push(window.WE.poseFor(pl, pl.animT));
    // Put him down. The fight-back check below reuses this coworker, and a
    // colleague still dangling off your fist plays `held`, not `wind`/`swing`.
    const v = pl.carrying;
    if (v) { v.held = false; v.hoisted = false; v.angle = 0; v.mode = 'idle'; }
    pl.carrying = null; pl.holdingPerson = false; pl.slapCd = 0;
    return { seen, spread: hold.length ? Math.max(...hold) - Math.min(...hold) : null };
  });
  if (slap.err) bad('slap: ' + slap.err);
  else {
    const want = ['grab-slap', 'grab-slap-hit', 'grab-slap-rec', 'grab-hold'];
    const got = slap.seen.filter((v, i) => v !== slap.seen[i - 1]);
    JSON.stringify(got) === JSON.stringify(want)
      ? ok('slap: ' + want.join(' -> '))
      : bad('slap: played ' + got.join(' -> ') + ' — wanted ' + want.join(' -> '));
    slap.spread == null ? bad('slap: never had hold of anybody')
      : slap.spread <= 2
        ? ok(`slap: the held colleague stays put (${slap.spread.toFixed(2)}px over the whole window)`)
        : bad(`slap: the held colleague jumps ${slap.spread.toFixed(1)}px mid-slap `
              + '— the three beats are not sharing one HAND row');
  }

  // FROM BEHIND IS A DIFFERENT MOVE. Same button, and the only thing that
  // decides it is which way the victim was facing — so it is exactly the kind
  // of branch that rots silently. Both halves are checked: the player locks
  // into `choke`, and the victim plays `choked` rather than hanging in `held`.
  const choke = await p.evaluate(async () => {
    const S = window.WE.S, pl = S.player;
    const c = S.coworkers.find(x => !x.dead && x.visible !== false);
    if (!c) return { err: 'no coworker to grab' };
    if (pl.carrying) { pl.carrying.held = false; pl.carrying = null; pl.holdingPerson = false; }
    pl.downT = 0; pl.hurtT = 0; pl.sitting = false; pl.vx = 0; pl.slapCd = 0; pl.choking = false;
    c.dead = false; c.held = false; c.downT = 0; c.mode = 'idle';
    c.x = pl.cx + pl.face * 24 - c.w / 2; c.y = pl.y + pl.h - c.h;
    c.face = pl.face;                       // same way = you came up behind him
    pl._grabOrThrow(S);
    if (!pl.holdingPerson) return { err: 'grab did not take' };
    const out = { player: window.WE.poseFor(pl, pl.animT),
                  victim: window.WE.npcPoseName(c, c.animT), choking: !!pl.choking };
    if (pl.carrying) { pl.carrying.held = false; pl.carrying.choked = false; pl.carrying = null; }
    pl.holdingPerson = false; pl.choking = false;
    return out;
  });
  if (choke.err) bad('choke: ' + choke.err);
  else if (choke.player === 'choke' && choke.victim === 'choked')
    ok('choke: taken from behind, he chokes and they claw at it');
  else
    bad(`choke: player played ${choke.player} and the victim ${choke.victim} `
        + '— wanted choke / choked');

  // EVERY MENU SCREEN OPENS. The live checks all drove the SHIFT and none of
  // them opened a menu, so the SUPPLY CUPBOARD threw on open — reading `cost`
  // off a weapon that had been cut from the catalogue — and stayed broken
  // through several passes because nothing ever pressed the button. A screen
  // nobody tests is a screen that is broken.
  const screens = await p.evaluate(async () => {
    const errs = [];
    const onerr = e => errs.push(String(e.message || e));
    window.addEventListener('error', onerr);
    const press = id => { const b = document.getElementById(id); if (b) b.click(); };
    const seen = {};
    for (const [open, close, name] of [['btnShop', 'btnShopBack', 'shop'],
                                       ['btnHelp', 'btnHelpBack', 'help'],
                                       ['btnStart', 'btnMsnBack', 'missions']]) {
      // FREE_ROAM_ONLY hides these while the game is being tested through one
      // door. A hidden button is not a broken one — skip it rather than
      // reporting the deliberate state as a failure.
      const ob = document.getElementById(open);
      if (!ob || ob.classList.contains('hidden')) { seen[name] = 'hidden'; continue; }
      try {
        press(open);
        await new Promise(r => setTimeout(r, 60));
        const el = document.getElementById(name === 'missions' ? 'missions' : name);
        seen[name] = !!el && !el.classList.contains('hidden');
        press(close);
        await new Promise(r => setTimeout(r, 60));
      } catch (e) { errs.push(name + ': ' + e.message); }
    }
    window.removeEventListener('error', onerr);
    return { errs, seen };
  });
  if (screens.errs.length) bad('menus: ' + screens.errs.slice(0, 2).join(' | '));
  else if (Object.values(screens.seen).every(Boolean)) {
    const shown = Object.entries(screens.seen).filter(([, v]) => v !== 'hidden').map(([k]) => k);
    ok(shown.length
      ? `menus: ${shown.join(', ')} open and close cleanly`
      : 'menus: all hidden by FREE_ROAM_ONLY, nothing to open');
  } else bad('menus: a screen did not open — ' + JSON.stringify(screens.seen));

  // A SLAP TAKES HEALTH, AND OUT MEANS OUT. Both were true-by-omission for a
  // long time: slapping paid in ruin but never touched hp, so you could hold
  // someone and hit them forever; and everyone got back up, so a floor of eight
  // never got any emptier however long you worked. Neither shows in a
  // screenshot, which is why they are checked.
  const kout = await p.evaluate(async () => {
    const S = window.WE.S, pl = S.player;
    const c = S.coworkers.find(x => !x.dead && x.visible !== false && !x.isManager);
    if (!c) return { err: 'no coworker' };
    if (pl.carrying) { pl.carrying.held = false; pl.carrying = null; pl.holdingPerson = false; }
    pl.choking = false; pl.downT = 0; pl.slapCd = 0;
    c.x = pl.cx + 24 * pl.face - c.w / 2; c.y = pl.y + pl.h - c.h;
    c.mode = 'idle'; c.downT = 0; c.held = false; c.hp = c.maxHp; c.out = false;
    c.face = -pl.face;                      // front grab, so HIT is a slap
    pl._grabOrThrow(S);
    if (!pl.holdingPerson) return { err: 'grab did not take' };
    const start = c.hp;
    pl.slapCd = 0; pl.slapHit = false; pl._slap(S);
    await new Promise(r => setTimeout(r, 340));
    const afterOne = c.hp;
    for (let i = 0; i < 24 && !c.out; i++) {
      pl.slapCd = 0; pl.slapHit = false; pl._slap(S);
      await new Promise(r => setTimeout(r, 330));
    }
    const wentOut = !!c.out;
    const modes = [];
    for (let i = 0; i < 8; i++) { await new Promise(r => setTimeout(r, 250)); modes.push(c.mode); }
    return { start, afterOne, wentOut, gotUp: modes.some(m => m !== 'down') };
  });
  if (kout.err) bad('knockout: ' + kout.err);
  else {
    kout.afterOne < kout.start
      ? ok(`slap: takes health (${kout.start} -> ${kout.afterOne} on one slap)`)
      : bad(`slap: took no health — ${kout.start} -> ${kout.afterOne}`);
    !kout.wentOut ? bad('knockout: slapping never put them out')
      : kout.gotUp ? bad('knockout: they got back up — out is supposed to be out')
        : ok('knockout: out stays out, two seconds of floor with no getup');
  }

  // THE TELEGRAPH. An instant hit is not a fight, it is a tax.
  await p.evaluate(() => {
    const S = window.WE.S; const c = S.coworkers[0];
    c.x = S.player.cx + 30; c.y = 470 - c.h; c.vx = 0;
    c.fighting = true; c.mode = 'fight'; c.timer = 9; c.swingCd = 0; c.swingT = 0;
    S.player.iframes = 99;
  });
  const np = new Set();
  for (let i = 0; i < 70; i++) {
    await p.waitForTimeout(35);
    np.add(await p.evaluate(() => {
      const c = window.WE.S.coworkers[0];
      return window.WE.npcPoseName(c, c.animT || 1);
    }));
  }
  np.has('wind') && np.has('swing')
    ? ok('fight-back: winds up, then swings')
    : bad('fight-back: poses were ' + [...np].sort().join(' '));

  // THE BOSS ON THE CARPET. `bossDown()` clears `fighting`, which used to flip
  // the art to boss-calm — a set with no `down` frame — so the defeated boss
  // silently fell back to `idle` and stood there. The ending depends on him
  // being on the floor, and nothing about the failure was visible in code.
  const ko = await p.evaluate(() => {
    const S = window.WE.S;
    if (!S.boss) {
      // He is on 13 until you go up. Fabricate the state the ending produces.
      S.boss = { fighting: true, defeated: false, hurtT: 0, animT: 1, vx: 0,
                 cx: 0, cy: 0, x: 0, y: 0, w: 40, h: 70, face: 1 };
    }
    const b = S.boss;
    b.fighting = false; b.defeated = true; b.hurtT = 0; b.vx = 0;
    const art = window.WE.bossArtFor(b);
    const pose = window.WE.npcPoseName && window.WE.bossPoseName
      ? window.WE.bossPoseName(b, b.animT) : null;
    return { art, pose, hasFrame: window.WE.CAST.hasPose(art, pose) };
  });
  ko.pose === 'down' && ko.hasFrame
    ? ok(`boss KO: draws ${ko.art}/${ko.pose} — he stays on the floor`)
    : bad(`boss KO: art=${ko.art} pose=${ko.pose} frameExists=${ko.hasFrame} `
          + '— the defeated boss renders standing');

  errs.length ? bad('runtime errors:\n        ' + errs.slice(0, 4).join('\n        '))
              : ok('no runtime errors');

  await b.close();
  console.log(fail ? `\n${fail} PROBLEM(S)\n` : '\nall checks passed\n');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('verify crashed: ' + e.message); process.exit(1); });
