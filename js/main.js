// WORST EMPLOYEE — feel test. Game state, loop, camera, renderer, shift report.

import { VERSION, VIEW, FLOOR_Y, CEIL_Y, ROOF_Y, LEVEL_W, COL, COFFEE, RANKS, QUIET_RANKS,
         ATTACK, ROOMS, DOOR_W, DOOR_H, roomAt, FLOORS, CUR, ANGER } from './config.js';
import { World } from './engine.js';
import { FX } from './fx.js';
import { ART, SPRITES, WORLD, CAST, WEAPON_ART, FACES, poseFor, npcPoseName, bossPoseName,
         drawWeapon, recolourSprites, drawHuman, drawProp, roundRect } from './art.js';
import { RIG } from './rig.js';
import { SFX } from './audio.js';
import { Music } from './music.js';
import { EventSystem } from './events.js';
import { WEAPONS, SHOP_ORDER, loadCareer, saveCareer, defaultCareer,
         bump, checkUnlocks, buy, hasSkill } from './weapons.js';
import { Sabotage, RUIN, ruinTier, rankFor } from './sabotage.js';
import { Story, introScene, HR_X } from './story.js';
import { CHATTER, HURT, DOWNED, FIGHTBACK, BOSS_DOWN, pick } from './barks.js';
import { MISSIONS, MissionRun, missionState, nextMission } from './missions.js';
import { DAYS, dayById, freshDay, interact, chaosPct } from './days.js';
import { Coworker } from './office.js';
import { IN, initInput, pollInput, resetInput } from './input.js';
import { ChaosSystem } from './chaos.js';
import { Player } from './player.js';
import { buildOffice, angerStage } from './office.js';
import { OPTIONS, defaultLook, randomLook, saveLook, loadLook, drawCharacter, drawPortrait, lookColours, lookOutfit, OUTFITS } from './character.js';

const cv = document.getElementById('game');
const ctx = cv.getContext('2d');
const $ = id => document.getElementById(id);
const HAS_TOUCH = matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0;
const viewW = () => VIEW.w / S.zoom;
const viewH = () => VIEW.h / S.zoom;

// ---------------------------------------------------------------
// STATE
// ---------------------------------------------------------------
const S = {
  mode: 'title',          // title | play | report
  time: 0,
  world: null, player: null, boss: null, coworkers: [], chaos: null,
  cam: { x: 0, y: 0 },
  coins: 0, damage: 0, destroyed: 0, annoyed: 0, hits: 0, playerHits: 0,
  coffees: 0, coffeeSpend: 0, chainsMade: 0, bestChain: 0,
  productivity: 100,
  anger: 0, stageIdx: 0,
  speedMul: 1, chaosMul: 1, boostT: 0,
  coffeeMachine: null,
  shiftT: 0,
  look: loadLook() || defaultLook(),
  career: loadCareer(),
  actors: {}, story: null, intro: false,
  mode2: 'free', mission: null, run: null,
  day: freshDay(), dayDef: null,
  ruin: 0, deskDown: 0, knocked: 0, killed: {}, roomKills: {}, jobsDone: 0,
  salaryAcc: 0,
  cleanT: 0,
  room: null,
  hrWatching: false, hrHeat: 0, freeCoffee: false, clientHere: false, dark: false,
  toast: (msg, cls) => toast(msg, cls),
  useArt: true,          // rendered key poses
  // Drawn frames are the default. The cut-up skeleton animates for almost
  // nothing but it READS as cut up — visible segments, stiff joints — and that
  // was the single loudest complaint. Whole drawn frames cost outfit
  // combinations (a frame bakes in what he is wearing) so customization becomes
  // presets. That trade buys the thing that was actually wrong.
  useRig: false,         // press V to compare against the skeleton
  // Camera zoom is a RENDER-only scale. The player is 62px tall because the
  // physics and combat timings were tuned at that size and they should not move;
  // at 1:1 he is 11% of screen height, which reads as a distant doll rather than
  // a brawler. Zooming the view fixes the framing and touches no gameplay number.
  zoom: 2.15,

  addAnger(v) {
    if (this.boss && this.boss.fighting) return;
    this.anger = Math.min(100, this.anger + v * ANGER.rate);
    const st = angerStage(this.anger);
    const idx = ['FRIENDLY','CONCERNED','ANNOYED','ANGRY','BOSS FIGHT'].indexOf(st.name);
    if (idx > this.stageIdx) {
      this.stageIdx = idx;
      toast(st.line, idx >= 3 ? 'boss' : '');
      if (st.name === 'BOSS FIGHT') startBossFight();
    }
  },

  damageBody(b, dmg, src) {
    if (!b || b.dead) return;
    if (b.type === 'npc') {
      // A scrape is not a hit — but the cutoff has to sit BETWEEN combo beats,
      // not above them. 14 is above light[1] (12) and below light[2] (15), so
      // the opening jabs stagger and the string still escalates into a
      // knockdown. At 18 the first three beats did nothing and it read as
      // unresponsive.
      if (dmg < 14) {
        b.hurtT = Math.max(b.hurtT, 0.22);
        b.vx += Math.sign(b.cx - (src ? src.cx : b.cx) || 1) * 60;
        b.provoke(this, 0.5);
        // A scrape still lands on a person, so it still gets a grunt. Silence
        // here is why the opening jabs of every combo read as hitting nothing:
        // beats 1 and 2 do 10 and 12 damage, both under this cutoff.
        SFX.voice(b.name, 'mutter', 0.45);
        this.addAnger(0.4);
        return;
      }
      // A real blow eats HEALTH. Only an empty bar puts them on the floor —
      // one punch used to flatten anybody, which made every fight one frame long.
      const floored = b.hit(this, dmg);
      faceFor(b, floored ? 'dazed' : (b.hp < b.maxHp * 0.4 ? 'fury' : 'shock'));
      bark(b, floored ? pick(DOWNED, this.hits * 3) : pick(HURT, this.hits * 5),
           floored ? '#ffd75e' : '#ff9a9a');
      if (floored) {
        this.knocked = (this.knocked || 0) + 1;
        this.ruin += RUIN.workerDown;
        this.addAnger(1.4);
      } else this.addAnger(0.6);
      return;
    }
    if (b.type === 'boss') {
      if (!b.fighting) { this.addAnger(6); return; }
      b.hp -= dmg; b.hurtT = 0.16;
      // He swears when hurt. It is gibberish under a bleep, so it stays funny
      // and stays rateable.
      SFX.voice('boss', Math.random() < 0.45 ? 'curse' : 'hurt', 0.8);
      if (b.hp <= 0) { S.bossBeaten = true; bossDown(); }
      return;
    }
    if (b.type !== 'prop' || b.broken) return;

    b.hp -= dmg;
    if (b.hp <= 0) {
      b.broken = true;
      b.hp = 0;
      this.destroyed++;
      this.damage += b.value;
      this.day.damage += b.value;
      this.day.chaos += 70;
      this.day.suspicion = Math.min(100, this.day.suspicion + 2);

      // RUIN is the real score: not what it cost, but how much of the working
      // day stopped because of it.
      this.killed[b.kind] = (this.killed[b.kind] || 0) + 1;
      const rm = roomAt(b.cx);
      if (rm) this.roomKills[rm.id] = (this.roomKills[rm.id] || 0) + 1;
      let r = 40;
      if (b.kind === 'coffee') r = RUIN.coffeeDead;
      else if (b.kind === 'cooler') r = RUIN.waterDead;
      else if (b.kind === 'printer') r = RUIN.printerDead;
      else if (b.kind === 'monitor') { r = RUIN.deskDown; this.deskDown++; }
      this.ruin += r;
      this.productivity = Math.max(0, this.productivity - 1.6);
      this.addAnger(b.value > 500 ? 5 : 2);
      const mat = ({ monitor: 'glass', stack: 'paper', printer: 'plastic', bin: 'metal',
                     phone: 'plastic', mug: 'glass', cooler: 'glass', coffee: 'metal',
                     extinguisher: 'metal', chair: 'plastic' })[b.kind] || 'plastic';
      SFX.smash(mat, Math.min(1, b.value / 1200));
      FX.debris(b.cx, b.cy, 12, b.color || COL.prop);
      FX.float(b.cx, b.y - 6, `-$${b.value.toLocaleString()}`, '#ff8a5c', 12);
      if (b.kind === 'stack' || b.kind === 'printer') FX.paper(b.cx, b.cy, 16);
      if (b.kind === 'coffee') toast('"...Who drank all the coffee?"');
    }
  },
};

// ---------------------------------------------------------------
// CANVAS SIZING
// ---------------------------------------------------------------
let scale = 1, offX = 0, offY = 0;
function resize() {
  const dpr = Math.min(devicePixelRatio || 1, 2);
  // visualViewport is the honest number once the address bar is involved.
  const vv = window.visualViewport;
  const W = Math.round(vv ? vv.width : innerWidth);
  const H = Math.round(vv ? vv.height : innerHeight);
  VIEW.w = Math.round(Math.min(VIEW.maxW, Math.max(VIEW.minW, VIEW.h * (W / H))));
  scale = Math.min(W / VIEW.w, H / VIEW.h);
  const w = Math.round(VIEW.w * scale), h = Math.round(VIEW.h * scale);
  cv.style.width = w + 'px'; cv.style.height = h + 'px';
  cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
  ctx.setTransform(dpr * scale, 0, 0, dpr * scale, 0, 0);

  const portrait = H > W && W < 760;
  $('rotate').classList.toggle('hidden', !portrait || S.mode !== 'play');
}
addEventListener('resize', resize);
addEventListener('orientationchange', () => setTimeout(resize, 120));

// ---------------------------------------------------------------
// UI HELPERS
// ---------------------------------------------------------------
let toastT = 0;
// A cutscene has to silence the touch pad as well as the HUD. #touch is a
// sibling of #hud, so the `scene` class never reached it and the swap/grab
// buttons drew straight over the dialogue answers — and still swallowed taps
// meant for them.
function setScene(on) {
  $('hud').classList.toggle('scene', on);
  $('touch').classList.toggle('scene', on);
}

// REACTION FACES ARE A PANEL, NOT A MASK.
//
// These used to be painted straight onto the character's own head, on the
// argument that "a bubble floating above someone is a UI element; a face that
// changes is a performance". The argument is good and the result was not: a
// 96px circular portrait scaled down onto a ~26px head keeps its own lighting,
// its own framing and a hard circular edge, so at the size the game actually
// runs it reads as a sticker pasted over the face that is already drawn there —
// two faces, which is exactly what it was reported as.
//
// It also demanded a per-pose head anchor accurate to a couple of pixels across
// 255 frames, and every one of those that drifted put a face on a fist.
//
// A bubble asks for none of that, and the characters already ACT: the hurt and
// dazed body frames carry the performance. The portrait is the punchline beside
// it. (Head anchors are still derived and still checked — tools/fix-hands.py
// finds the hand by excluding the head.)
function reactionBubble(ctx, art, emo, who, k) {
  FACES.draw(ctx, art, emo, who.cx + who.w * 0.62, who.y - who.h * 0.30,
             who.h * 0.62, k);
}

function toast(text, cls = '') {
  const el = $('toast');
  el.textContent = text;
  el.className = 'toast on ' + cls;
  toastT = 2.4;
}

function show(id) { $(id).classList.remove('hidden'); }
function hide(id) { $(id).classList.add('hidden'); }


// ---------------------------------------------------------------
// CHARACTER CREATION
// The paper-doll payoff: these lists come straight from character.js, so
// adding an option there grows this screen with no work here.
// ---------------------------------------------------------------
const pv = $('preview');
const pvx = pv.getContext('2d');

function buildOptionRows() {
  const wrap = $('optionRows');
  wrap.innerHTML = '';
  for (const [key, def] of Object.entries(OPTIONS)) {
    const row = document.createElement('div');
    row.className = 'orow';
    const lab = document.createElement('label');
    lab.textContent = def.label;
    // Accessories are not rig parts yet — glasses, a tie and a cap all live on
    // parts something else already owns. Say so rather than shipping a control
    // that quietly does nothing.
    if (key === 'accessory' && RIG.ready) {
      const note = document.createElement('span');
      note.className = 'soon';
      note.textContent = 'NEXT BATCH';
      lab.appendChild(note);
    }
    row.appendChild(lab);
    const sws = document.createElement('div');
    sws.className = 'swatches';
    def.values.forEach((v, i) => {
      const b = document.createElement('button');
      b.className = 'sw' + (def.kind === 'colour' ? ' col' : (def.kind === 'outfit' ? ' outfit' : ''));
      if (def.kind === 'colour') {
        b.style.background = v;
      } else if (def.kind === 'outfit') {
        const o = OUTFITS.find(x => x.id === v) || { name: v, desc: '' };
        b.innerHTML = `<b>${o.name}</b><span>${o.desc}</span>`;
      } else b.textContent = v;
      b.onclick = () => { S.look[key] = i; refreshSwatches(); saveLook(S.look); applyLook(); SFX.ui(); };
      b.dataset.key = key; b.dataset.i = i;
      sws.appendChild(b);
    });
    row.appendChild(sws);
    wrap.appendChild(row);
  }
  refreshSwatches();
}

function refreshSwatches() {
  for (const b of document.querySelectorAll('.sw'))
    b.classList.toggle('on', S.look[b.dataset.key] === +b.dataset.i);
}

let pvT = 0;
function drawPreview(dt) {
  pvT += dt;
  pvx.clearRect(0, 0, pv.width, pv.height);
  // Preview the actual drawn frames, and cycle idle -> walk -> jab so the look
  // is judged in motion rather than as a mugshot.
  if (SPRITES.ready) {
    const cycle = pvT % 6;
    let pose = 'idle';
    if (cycle > 2.2 && cycle < 4.0) {
      const order = ['run-1', 'run-2', 'run-5', 'run-3', 'run-4', 'run-6'];
      pose = order[Math.floor(pvT * 9) % order.length];
    } else if (cycle >= 4.6 && cycle < 5.0) pose = 'c2-hit';
    else if (cycle >= 5.0 && cycle < 5.3) pose = 'c3-hit';
    SPRITES.draw(pvx, pose, pv.width / 2, pv.height - 20, 230, false, 1);
  } else if (RIG.ready) {
    RIG.draw(pvx, RIG.poseFor({ grounded: true, vx: 0, vy: 0, atk: null,
      dodgeT: 0, hurtT: 0, carrying: null }, pvT),
      pv.width / 2, pv.height - 26, 210, false, 1);
  } else {
    drawPortrait(pvx, pv.width / 2, pv.height - 34, 3.4, S.look, pvT);
  }
}

function openCreator() {
  hide('title'); show('create');
  applyLook();
  $('cName').value = S.look.name || 'FIRASS';
  buildOptionRows();
}

// ---------------------------------------------------------------
// THE SUPPLY CUPBOARD
// Weapons are bought with banked coins; skills are EARNED (script section 16),
// so the shop shows a weapon's challenges but never sells one. Secret skills
// show as ??? until the counter trips, which is the point of them.
// ---------------------------------------------------------------
function buildMissions() {
  const list = $('msnList');
  const done = S.career.missions || [];
  $('msnRank').textContent = S.career.title || 'INTERN';
  list.innerHTML = '';
  MISSIONS.forEach((m, i) => {
    const st = missionState(S.career, m, i);
    const b = document.createElement('button');
    b.className = 'msn ' + st + (st === 'open' && !done.includes(m.id) ? ' next' : '');
    b.innerHTML = `<div class="r1"><span class="nm">${m.name}</span>
      <span class="pay">${st === 'done' ? 'COMPLETE' : m.pay.toLocaleString() + ' coins'}</span></div>
      <div class="role">${m.role} &middot; ${m.verb}</div>
      <div class="bf">${m.brief}</div>
      <div class="hint">${m.hint}</div>
      <div class="gl">${m.goals.map(g => `<span>${g.text}</span>`).join('')}</div>`;
    if (st !== 'locked') {
      b.onclick = () => {
        S.mode2 = 'mission';
        S.mission = m;
        SFX.ui(true);
        hide('missions');
        openCreator();
      };
    }
    list.appendChild(b);
  });
}

function buildShop() {
  const list = $('shopList');
  $('shopBank').textContent = S.career.bank.toLocaleString();
  list.innerHTML = '';

  for (const id of SHOP_ORDER) {
    const w = WEAPONS[id];
    const owned = S.career.owned.includes(id);
    const equipped = S.career.equipped === id;
    const afford = S.career.bank >= w.cost;

    const b = document.createElement('button');
    b.className = 'wpn' + (equipped ? ' equipped' : owned ? ' owned' : afford ? '' : ' locked');
    const pic = w.art
      ? `<img src="assets/weapons/${w.art}.png" alt="">`
      : '<span class="fist">&#128074;</span>';
    const price = owned
      ? (equipped ? 'EQUIPPED' : 'TAP TO EQUIP')
      : w.cost.toLocaleString() + ' coins';

    const skills = w.skills.map(sk => {
      const got = S.career.skills.includes(sk.id);
      const label = got ? (sk.reveal ? sk.reveal.split(' —')[0] : sk.name)
                        : (sk.secret ? '???' : sk.name);
      return `<span class="${got ? 'got' : ''}" title="${got ? (sk.reveal || sk.hint) : sk.hint}">${label}</span>`;
    }).join('');

    b.innerHTML = `<div class="pic">${pic}</div><div class="body">
      <div class="row1"><span class="nm">${w.name}</span>
      <span class="pr ${owned ? 'have' : ''}">${price}</span></div>
      <div class="vb">${w.verb}</div>
      <div class="ds">${w.desc}</div>
      <div class="sk">${skills}</div></div>`;

    b.onclick = () => {
      if (owned) {
        S.career.equipped = id;
        saveCareer(S.career);
        if (S.player) S.player.equipped = id;
        SFX.ui(true);
      } else if (buy(S.career, id)) {
        if (S.player) S.player.equipped = id;
        SFX.promote();
        checkUnlocks(S);
      } else {
        SFX.ui(false);
        toast(`${(w.cost - S.career.bank).toLocaleString()} coins short.`);
        return;
      }
      buildShop();
    };
    list.appendChild(b);
  }
}

// ---------------------------------------------------------------
// GAME FLOW
// ---------------------------------------------------------------
function startShift() {
  if (S.endTimer) { clearTimeout(S.endTimer); S.endTimer = null; }
  S.shiftId = (S.shiftId || 0) + 1;
  SFX.resume();
  // The MP3 score takes over here; the synthesised one in audio.js is the
  // fallback for a browser or a build where the files will not load.
  Music.scene(null);
  Music.init();
  if (Music.failed) SFX.startMusic();
  S.mode = 'play';
  S.time = 0; S.shiftT = 0;
  S.coins = 0; S.damage = 0; S.destroyed = 0; S.annoyed = 0;
  S.hits = 0; S.playerHits = 0; S.coffees = 0; S.coffeeSpend = 0; S.annoyCount = 0;
  S.chainsMade = 0; S.bestChain = 0;
  S.salary = 0; S.salaryAcc = 0; S.cleanT = 0; S.lastDamage = 0; S.coffeeCd = 0;
  S.liftCd = 0; S.nearLift = false; fade = 0; S.summoned = false;
  $('btnLift').classList.add('hidden');
  S.bossBeaten = false; S.slaps = 0; S.failedShown = false; S.drillRuin = 0;
  S.timesDown = 0;
  S.clockT = 0; S.deadlineDone = false; S.dayRoute = null;
  $('clock').classList.add('hidden');
  S.day = freshDay(); S.dayDef = null;
  S.ruin = 0; S.deskDown = 0; S.knocked = 0; S.killed = {}; S.roomKills = {}; S.jobsDone = 0;
  S.run = (S.mode2 === 'mission' && S.mission) ? new MissionRun(S, S.mission) : null;
  $('msnHud').classList.toggle('hidden', !S.run);
  S.sabotage = S.sabotage || new Sabotage(S);
  S.career.lastJobs = S.sabotage.roll(S.career.lastJobs);
  saveCareer(S.career);
  S.productivity = 100; S.anger = 0; S.stageIdx = 0;
  S.speedMul = 1; S.chaosMul = 1; S.boostT = 0;

  S.world = new World();
  S.chaos = new ChaosSystem(S);
  S.events = S.events || new EventSystem(S);
  S.events.reset();
  S.room = null;
  S.hrWatching = false; S.hrHeat = 0; S.freeCoffee = false;
  // Free roam is the brawl mode: hit anyone and the whole floor comes for you.
  S.freeForAll = S.mode2 === 'free';
  S.clientHere = false; S.dark = false;
  S.world.onImpact = (a, b, e) => S.chaos.onImpact(a, b, e);

  S.player = new Player(120);
  S.player.equipped = S.career.equipped || 'fists';
  // Load the cues that always apply, and the one this weapon will want. A cue
  // that has not finished loading is skipped rather than played late, so
  // warming early is what makes the first one land.
  Music.warm('combo_finish');
  Music.warm('total_wipeout');
  Music.warmFor(S.player.equipped);
  S.world.add(S.player);
  buildOffice(S.world, S, 'ops');

  applyLook();

  // FIRST DAY. You get the tour before you get the controls — every promise
  // made on it is something you can wreck later, which is the whole joke.
  S.story = S.story || new Story(S);
  if (!S.career.hired) {
    const hr = new Coworker(HR_X, 'DALIA');
    hr.title = 'HR'; hr.art = 'npc-rita'; hr.homeX = HR_X; hr.mode = 'work';
    S.world.add(hr); S.coworkers.push(hr);
    S.actors.hr = hr;
    const bs = new Coworker(HR_X + 400, 'MR. HALEY');
    bs.title = 'YOUR MANAGER'; bs.art = 'boss-calm'; bs.mode = 'work'; bs.visible = false;
    S.world.add(bs); S.coworkers.push(bs);
    S.actors.boss = bs;
    S.intro = true;
    S.story.play(introScene(S));
  } else {
    S.intro = false;
    S.story.done = true;
  }

  setScene(false);
  // The move hint sits in the middle of the screen. It earns that spot while you
  // are learning the string and stops earning it after a few shifts.
  $('hud').classList.toggle('veteran', (S.career.shifts || 0) >= 3);
  resetInput();
  FX.clear();
  hide('title'); hide('report'); hide('help'); hide('create'); hide('shop'); hide('boost');
  show('hud');
  if (HAS_TOUCH) show('touch'); else hide('touch');
  resize();
  toast('CLOCK IN.');
}

let outfitToken = 0;

// Pestering a colleague: no damage, no destruction, but it costs the company
// real productivity and it winds the boss up. This is the quiet player's way of
// being the worst employee in the building.
const JABS = [
  'Quick question.', 'You busy?', 'Weird smell in here.', 'Is that a new mug?',
  'Big weekend?', 'Did you get my email?', 'You look tired.', 'We should sync.',
  "I'll let you get on.", 'Circle back on that?',
];
S.annoy = function (c) {
  c.annoyCd = 1.1;
  // Being pestered is not being hit: they grumble rather than yelp, and the
  // third time they properly swear about it.
  SFX.voice(c.name, c.annoyed2 >= 2 ? 'curse' : 'mutter', 0.4);
  c.annoyed2++;
  c.mode = 'panic';
  c.timer = 0.9;
  c.vx += Math.sign(c.cx - S.player.cx || 1) * 90;
  if (!c.annoyed) { c.annoyed = true; S.annoyed++; }

  // Annoying the same person over and over used to pay MORE each time
  // (55 + n*18, unbounded), so parking next to one colleague and mashing was
  // the best-paying thing in the game. It pays for the first reaction and
  // decays to nothing — the joke is the reaction, and a joke does not get
  // funnier the fifth time.
  const pay = Math.max(0, 55 - (c.annoyed2 - 1) * 14);
  S.coins += pay;
  S.productivity = Math.max(0, S.productivity - 1.1);
  S.addAnger(2.2);
  S.ruin += RUIN.workerAnnoyed;
  faceFor(c, c.annoyed2 > 3 ? 'fury' : 'weary');
  if (c.annoyed2 === 1) { S.day.relationships++; S.day.metPeople = (S.day.metPeople || 0) + 1; }
  S.annoyCount = (S.annoyCount || 0) + 1;

  FX.float(c.cx, c.y - 12, '+' + pay, '#ffd75e', 12);
  FX.float(S.player.cx, S.player.y - 22, JABS[S.annoyCount % JABS.length], '#c6ccdd', 10);
  SFX.ui(true);
  if (c.annoyed2 === 4) toast(`"${c.name}, could you please stop."`);
};

S.bumpCounter = key => bump(S, key);

// Walk a colleague forward during the tour so being introduced to somebody
// actually looks like being introduced to somebody.
S.introMeet = i => {
  const c = S.coworkers[i];
  if (!c) return;
  c.mode = 'work';
  c.face = c.cx > S.player.cx ? -1 : 1;
  faceFor(c, i === 1 ? 'weary' : 'shock', 2200);
  S.day.metPeople = (S.day.metPeople || 0) + 1;
  S.day.relationships++;
};
// Show a reaction on someone's face. Held on the actor so it follows them.
// The player's own expression. Same mechanism as the cast, different art set.
// Somebody says something. Short, above their head, gone in a moment — a bark
// you cannot read at a glance during a fight is a bark nobody reads.
function bark(who, text, col) {
  if (!who || who.dead) return;
  FX.float(who.cx, who.y - 18, text, col || '#cfd6e6', 11);
  who.barkCd = 2.2;
  who.talkT = 1.1;          // and it looks like talking, not standing there
}

function playerFace(emo, ms = 1400) {
  S.player.face_emo = emo;
  S.player.face_t = ms / 1000;
  S.player.face_max = ms / 1000;
}

function faceFor(who, emo, ms = 1500) {
  if (!who) return;
  who.face_emo = emo;
  who.face_t = ms / 1000;
  who.face_max = ms / 1000;
}

const SLAP_LINES = ['OW', 'HEY', 'STOP', 'PLEASE', 'WHY', 'NOT AGAIN', 'HELP'];
S.onMissionFailed = (m, why) => {
  if (S.failedShown) return;
  S.failedShown = true;
  toast('MISSION FAILED — ' + why, 'boss');
  SFX.ui(false);
};
S.onMissionComplete = m => {
  const done = S.career.missions || (S.career.missions = []);
  if (!done.includes(m.id)) {
    done.push(m.id);
    S.coins += m.pay;
    saveCareer(S.career);
  }
  toast(`${m.name} — COMPLETE  ·  +${m.pay.toLocaleString()}`, 'boss');
  SFX.promote();
  FX.kick(9, 0.08);
};
// THE DISCOVERY. After the tutorial the game stops instructing and the player
// finds that almost everything responds. Almost none of it is an objective —
// that is the point, it is the first taste of free chaos.
S.tryInteract = function () {
  const p = S.player;

  // YOUR DESK. The intro ends on "SIT AT YOUR DESK TO BEGIN" and until now that
  // was a line of text attached to nothing at all.
  // Already in it: USE gets you back out. Without this, the button that sat you
  // down just sits you down again.
  if (p.sitting) { p.sitting = false; SFX.ui(false); return true; }

  const d = S.playerDesk;
  if (d && Math.abs((d.x + d.w / 2) - p.cx) < 62 && p.grounded && !p.carrying) {
    p.sitting = true;
    p.sitT = 0;
    p.x = d.x + d.w / 2 - p.w / 2 + 10;
    p.vx = 0;
    p.face = 1;
    SFX.ui(true);
    if (!S.hasSat) {
      S.hasSat = true;
      S.day.work = (S.day.work || 0) + 1;
      toast('You sort the documents. It takes four minutes.');
      playerFace('grimace', 1800);
      // THE DISCOVERY. The whole game turns on this beat: the task is done,
      // it meant nothing, nobody checked, and nobody is watching you.
      setTimeout(() => { if (S.mode === 'play') toast('Nobody checked.'); }, 3200);
      setTimeout(() => {
        if (S.mode !== 'play') return;
        toast('Nobody is watching you at all.', 'boss');
        playerFace('smirk', 2600);
      }, 6000);
    } else {
      toast('You look busy. It is not the same as being busy.');
      playerFace('smirk', 1400);
    }
    return true;
  }

  let best = null, bd = 999;
  for (const b of S.world.bodies) {
    if (b.type !== 'prop' || b.dead || b.broken) continue;
    const dx = Math.abs(b.cx - p.cx), dy = Math.abs(b.cy - p.cy);
    if (dx > 46 || dy > 52) continue;
    if (dx < bd) { bd = dx; best = b; }
  }
  if (!best) return false;
  const r = interact(S.day, best.kind, best.id);
  if (!r) { toast('Nothing left to do with that.'); SFX.ui(false); return true; }

  S.ruin += Math.round((r.chaos || 0) * 0.6);
  S.coins += Math.round((r.chaos || 0) * 0.5 + (r.work || 0) * 3);
  if (r.suspicion) S.addAnger(r.suspicion * 0.5);
  toast(r.text);
  // The small stuff is the whole game: fiddling with somebody's chair should
  // show on your face.
  playerFace(r.secret ? 'glee' : (r.work ? 'grimace' : 'smirk'), 1400);
  S.player.fiddleT = 0.45;
  FX.float(best.cx, best.y - 10,
    r.secret ? 'SECRET' : (r.work ? '+WORK' : '+CHAOS'),
    r.secret ? '#c39bff' : (r.work ? '#8fd6a0' : '#ffd75e'), 12);
  SFX.ui(true);
  if (r.secret) { SFX.promote(); toast('SECRET FOUND — ' + r.secret, 'boss'); }
  return true;
};

// A brittle thing broken over somebody. The shards are the point: everyone
// standing nearby gets cut, which turns one swing into a room-wide incident.
const SWEARS = ['WHAT THE', 'MY EYES', 'ARE YOU SERIOUS', 'OH COME ON',
                'I CANNOT SEE', 'THIS IS NEW', 'MY LAPTOP', 'ABSOLUTELY NOT'];
S.onSprayed = (c, dt) => {
  c.sprayedT = (c.sprayedT || 0) + dt;
  c.sprayHold = 0.45;       // holds the coughing frame past the last spray tick
  c.mode = 'panic';
  c.timer = 1.6;
  c.vx += Math.sign(c.cx - S.player.cx || 1) * 260 * dt;
  S.ruin += 90 * dt;
  S.coins += 16 * dt;   // hold-to-earn; kept low on purpose
  S.day.chaos += 70 * dt;
  S.addAnger(1.6 * dt);
  if (!c.annoyed) { c.annoyed = true; S.annoyed++; }
  if (c.sprayedT > 0.35 && !c.swore) {
    c.swore = true;
    faceFor(c, 'fury', 2000);
    toast(`"${SWEARS[(S.sprayCount = (S.sprayCount || 0) + 1) % SWEARS.length]}"  — ${c.name}`);
    FX.float(c.cx, c.y - 16, '!!!', '#ffd75e', 15);
    SFX.ui(false);
  }
  if (c.sprayedT > 1.4) { c.hit(S, 10); c.sprayedT = 0; c.swore = false; }
};

S.shatter = (wep, victim, count) => {
  const x = victim ? victim.cx : wep.cx, y = victim ? victim.cy : wep.cy;
  for (let i = 0; i < count; i++) {
    FX.spark(x, y, 1, i % 3 ? '#dff2ff' : '#ffffff', 520);
  }
  FX.debris(x, y, Math.round(count * 0.8), '#cfe6f5');
  SFX.smash('glass', 1);
  FX.kick(11, 0.10);

  for (const c of S.coworkers) {
    if (c.dead || Math.abs(c.cx - x) > 96) continue;
    c.hit(S, 16);
    S.bleed(c);
    faceFor(c, 'shock');
    S.ruin += 40;
  }
  if (Math.abs(S.player.cx - x) < 70) { S.player.takeHit(S, 8); S.bleed(S.player); }
  toast('It went everywhere.');
};

// Blood. Sparse and dark, not a fountain -- this is an office, not a horror game.
S.bleed = who => {
  for (let i = 0; i < 7; i++) FX.spark(who.cx, who.cy - 8, 1, i % 2 ? '#a11d1d' : '#7d1414', 260);
  who.bleedT = 3.2;
};
S.onPlayerDown = () => {
  toast('They put you on the floor.', 'boss');
  SFX.bossRoar();
  FX.kick(16, 0.16);
  S.timesDown = (S.timesDown || 0) + 1;
};
S.onPlayerUp = () => { toast('You get up.'); SFX.ui(true); };

S.onFloorTurns = n => {
  toast(`THE WHOLE FLOOR HAS HAD ENOUGH — ${n} of them are coming.`, 'boss');
  SFX.bossRoar();
  Music.cue('full_throttle');
};
S.onFightBack = c => {
  bark(c, pick(FIGHTBACK, (S.fbN = (S.fbN || 0) + 1) * 3), '#ff7b7b');
  toast(c.name + ' has had enough of you.', 'boss');
  faceFor(c, 'fury', 2200);
  SFX.bossRoar();
  S.addAnger(4);
};
S.onGrabPerson = v => {
  if (!v.annoyed) { v.annoyed = true; S.annoyed++; }
  S.ruin += RUIN.workerAnnoyed;
  S.addAnger(2);
  toast(`"PUT ME DOWN"  — ${v.name}, ${v.title || 'staff'}`);
  faceFor(v, 'shock');
};
S.onSlap = (v, n) => {
  S.ruin += 26 + n * 6;
  S.coins += Math.max(0, 18 - n * 4);   // a running gag, not an income stream
  S.productivity = Math.max(0, S.productivity - 0.5);
  S.addAnger(1.1);
  S.slaps = (S.slaps || 0) + 1;
  if (v.provoke) v.provoke(S, 0.7);
  FX.float(v.cx, v.y - 14, SLAP_LINES[Math.min(SLAP_LINES.length - 1, n - 1)], '#ff9a9a', 12);
  if (n === 5) toast(`${v.name} has stopped asking you to stop.`);
  faceFor(v, n > 3 ? 'dazed' : 'shock');
};
S.ruinFromThrow = b => {
  S.ruin += RUIN.workerDown * 2;
  S.addAnger(6);
  toast(`${b.name} has been thrown across the office.`);
  faceFor(b, 'dazed');
};

// D5 — a wage. Destruction is opt-in, so a player who breaks nothing still has
// to be able to afford the shop. Standing around earns slowly; a clean streak
// (no damage for a while) multiplies it, so the quiet route is deliberate work
// rather than idling.
function tickSalary(dt) {
  S.cleanT = S.damage === S.lastDamage ? S.cleanT + dt : 0;
  S.lastDamage = S.damage;
  const streak = 1 + Math.min(1.5, S.cleanT / 18);
  S.salaryAcc += dt * 9 * streak;    // a wage, not a living
  if (S.salaryAcc >= 1) {
    const n = Math.floor(S.salaryAcc);
    S.salaryAcc -= n;
    S.coins += n;
    S.salary = (S.salary || 0) + n;
  }
}

function bankShift() {
  S.career.bank += S.coins;
  S.career.lifetime += S.coins;
  S.career.shifts++;
  saveCareer(S.career);
}

// ---------------------------------------------------------------
// THE DEADLINE. Only THE ASSIGNMENT runs a clock, because a deadline is what
// turns four options into a decision — with unlimited time you would simply do
// all of them. At 3:00 the manager comes to collect whatever exists.
// ---------------------------------------------------------------
const ROUTES = [
  { id: 'work',     test: d => d.work >= 70,
    line: 'You sat down and fixed it yourself. Nobody will ever know you did.' },
  { id: 'steal',    test: d => d.secrets >= 3,
    line: "You handed over another department's deck with the logo changed." },
  { id: 'delegate', test: d => d.relationships >= 3,
    line: 'Somebody who actually knows the client did it for you. You watched.' },
  { id: 'burn',     test: d => d.chaos >= 2600,
    line: 'There is no presentation. There is no projector. There is no meeting.' },
];

function tickClock(dt) {
  const m = S.run && S.run.m;
  if (!m || !m.clock) return;
  const c = m.clock;
  S.clockT = Math.min(c.seconds, (S.clockT || 0) + dt);
  const k = S.clockT / c.seconds;
  const mins = c.start + (c.end - c.start) * k;
  const hh24 = Math.floor(mins / 60), mm = Math.floor(mins % 60);
  const hh = ((hh24 + 11) % 12) + 1;
  const el = $('clock');
  el.classList.remove('hidden');
  $('clockT').textContent = `${hh}:${String(mm).padStart(2, '0')} ${hh24 < 12 ? 'AM' : 'PM'}`;
  const left = c.seconds - S.clockT;
  el.classList.toggle('late', left < c.seconds * 0.35 && left >= 30);
  el.classList.toggle('urgent', left < 30);
  $('clockNote').textContent = left < 30 ? 'THE MEETING IS NOW' : 'until the meeting';

  if (S.clockT >= c.seconds && !S.deadlineDone) {
    S.deadlineDone = true;
    threeOClock();
  }
}

function threeOClock() {
  const d = S.day;
  const won = ROUTES.find(r => r.test(d));
  if (won) {
    S.dayRoute = won.line;
    S.run.state = S.run.state.map(() => true);
    S.run.complete = true;
    toast('3:00 PM — ' + won.line, 'boss');
    SFX.promote();
    FX.kick(10, 0.09);
    if (S.onMissionComplete) S.onMissionComplete(S.run.m);
  } else {
    S.run.failed = true;
    S.run.failReason = 'You had until three.';
    S.dayRoute = 'You had nothing. He looked at you for a long time.';
    toast('3:00 PM — you had nothing.', 'boss');
    SFX.ui(false);
  }
  setTimeout(() => { if (S.mode === 'play') endShift(false); }, 3200);
}

function drawMissionHud() {
  const h = $('msnHud'), r = S.run;
  if (!r) return;
  const sig = r.m.id + r.state.join('');
  if (h._sig === sig) return;
  h._sig = sig;
  h.innerHTML = `<div class="t">${r.m.name}</div><div class="hint2">${r.m.hint}</div>` +
    r.m.goals.map((g, i) => `<div class="g${r.state[i] ? ' ok' : ''}">${g.text}</div>`).join('');
}

function drawDialogue() {
  const st = S.story;
  const d = $('dlg'), c = $('choices');
  if (st.choice) {
    d.classList.remove('hidden');
    $('dlgWho').textContent = '';
    $('dlgText').textContent = st.choice.text;
    if (c._n !== st.choice.opts.length) {
      c._n = st.choice.opts.length;
      c.innerHTML = '';
      st.choice.opts.forEach((o, i) => {
        const b = document.createElement('button');
        b.textContent = o.text;
        b.onclick = () => { c.classList.add('hidden'); c._n = 0; st.pick(i); };
        c.appendChild(b);
      });
    }
    c.classList.remove('hidden');
    return;
  }
  c.classList.add('hidden'); c._n = 0;
  if (st.line) {
    d.classList.remove('hidden');
    $('dlgWho').textContent = st.line.who || '';
    $('dlgText').textContent = st.line.text;
  } else d.classList.add('hidden');
}

async function applyLook() {
  const c = lookColours(S.look);
  const want = lookOutfit(S.look);
  const mine = ++outfitToken;
  if (SPRITES.outfit !== want) {
    // A whole frame set has to load; ignore the result if the player has
    // clicked on to another look in the meantime.
    await SPRITES.setOutfit(want);
    if (mine !== outfitToken) return;
  }
  if (SPRITES.ready) recolourSprites(S.look, c.skin, c.shirt);
}

// Riding the lift rebuilds the level in place. The shift, your coins, your ruin
// and the sabotage jobs all continue — this is one workday across two floors,
// not two levels.
let fade = 0;
function travelTo(floorId) {
  const F = FLOORS[floorId];
  if (!F) return;
  if (F.needRuin && (S.career.ruin || 0) + S.ruin < F.needRuin) {
    toast(F.locked, 'boss');
    SFX.ui(false);
    return;
  }
  fade = 1;
  SFX.ui(true);
  Music.sting('lift_ding');
  setTimeout(() => {
    const keep = S.player;
    S.world = new World();
    S.chaos.s = S;
    S.world.onImpact = (a, b, e) => S.chaos.onImpact(a, b, e);
    S.world.add(keep);
    buildOffice(S.world, S, floorId);
    keep.x = FLOORS[floorId].liftX + (floorId === 'exec' ? 90 : -90);
    keep.y = FLOOR_Y - keep.h;
    keep.vx = 0; keep.vy = 0;
    S.cam.x = Math.max(0, keep.x - 200);
    S.room = null;
    applyLook();
    toast(F.name);
    if (floorId === 'exec' && S.summoned && S.boss) {
      setTimeout(() => { if (S.mode === 'play' && S.boss) startBossFight(); }, 900);
    }
  }, 260);
}

function rideLift() {
  if (!S.nearLift || S.liftCd > 0) return;
  S.liftCd = 1.2;
  travelTo(S.floor === 'ops' ? 'exec' : 'ops');
}

function startBossFight() {
  const b = S.boss;
  // He is on 13. Max out the anger down here and all you get is a summons —
  // which is the hook: the fight is something you have to go and find.
  if (!b) {
    toast('"MY OFFICE. FLOOR THIRTEEN. NOW."', 'boss');
    SFX.bossRoar();
    S.summoned = true;
    return;
  }
  b.fighting = true;
  b.hp = b.maxHp = 320;
  FX.kick(16, 0.22);
  FX.flash = 1;
  SFX.bossRoar();
  SFX.voice('boss', 'curse', 1);
  SFX.setTension(1);
  faceFor(S.boss, 'fury', 2600);
  toast('"I HAVE HAD ENOUGH!"', 'boss');
}

// WHICH BOSS ART. One expression, used by the renderer and by tools/verify.js,
// because the two drifting apart is how the defeated boss ended up rendering
// standing upright: `bossDown()` clears `fighting`, that flipped the art to
// boss-calm, and boss-calm has no `down` frame so CAST.draw fell back to idle.
function bossArtFor(b) { return (b.fighting || b.defeated) ? 'boss-rage' : 'boss-calm'; }

function bossDown() {
  const b = S.boss;
  b.fighting = false;
  b.defeated = true;
  b.mode = 'down';
  b.va = 0;
  b.angle = 0;
  b.solid = false;
  b.vx = 0;
  S.bossBeaten = true;
  FX.kick(20, 0.28);
  SFX.bossRoar();
  SFX.setTension(0);
  faceFor(b, 'dazed', 6000);

  // He is flat on the carpet and he STILL will not say what happened. That is
  // the joke — not "you've got potential", which let him keep his dignity.
  const line = pick(BOSS_DOWN, (S.career.shifts || 0) * 5 + S.destroyed);
  setTimeout(() => { if (S.mode === 'play') { bark(b, '...', '#ff9a9a'); } }, 700);
  setTimeout(() => {
    if (S.mode !== 'play') return;
    toast('MR. HALEY, from the floor:  "' + line + '"', 'boss');
    faceFor(b, 'dazed', 4000);
  }, 1700);
  setTimeout(() => {
    if (S.mode !== 'play') return;
    toast('He does not get up.');
  }, 4200);

  const myShift = S.shiftId;
  S.endTimer = setTimeout(() => {
    if (S.mode === 'play' && S.shiftId === myShift) endShift(true);
  }, 6200);
}

function endShift(promoted = false) {
  S.mode = 'report';
  hide('hud'); hide('touch'); hide('rotate');

  if (S.chaos) S.chaos.cash();     // a chain still alive must still count
  S.career.ruin = (S.career.ruin || 0) + Math.round(S.ruin);
  bankShift();
  const prod = Math.max(0, S.productivity).toFixed(0);
  const score = Math.round(
    S.damage * 1.1 + S.destroyed * 220 + S.annoyed * 400 +
    S.bestChain * 900 + S.anger * 60 + S.coins * 0.5
  );
  // A shift with almost no damage is a deliberate playstyle, not a failed one.
  const quiet = S.damage < 900 && S.destroyed < 6;
  let rank;
  if (quiet) {
    rank = QUIET_RANKS[0].name;
    for (const r of QUIET_RANKS) if (S.coins >= r.at) rank = r.name;
  } else {
    rank = RANKS[0].name;
    for (const r of RANKS) if (score >= r.at) rank = r.name;
  }

  // THE SIX NUMBERS. "How did the day go" is not one axis — you can finish the
  // work AND wreck the place AND get away with it, and those are three separate
  // achievements. Damage is deliberately small and in dollars; chaos is a
  // percentage of what you COULD have caused.
  const D = S.day;
  D.chaos += Math.round(S.ruin * 0.5);
  const rows = [
    ['WORK',          Math.round(D.work) + '%'],
    ['CHAOS',         chaosPct(D) + '%'],
    ['SUSPICION',     Math.round(D.suspicion) + '%'],
    ['DAMAGE',        '$' + (D.damage || S.damage).toLocaleString()],
    ['RELATIONSHIPS', D.relationships],
    ['SECRETS DISCOVERED', D.secrets],
    ['—', ''],
    ['RUIN',          Math.round(S.ruin).toLocaleString()],
    ['SABOTAGE JOBS', `${S.jobsDone || 0} / 3`],
    ['BEST CHAIN',    '×' + S.bestChain],
    ['COINS EARNED',  S.coins.toLocaleString()],
    ['BANK',          S.career.bank.toLocaleString()],
  ];
  $('reportRows').innerHTML = rows
    .map(([k, v]) => `<div><span class="lk">${k}</span><span class="lv">${v}</span></div>`)
    .join('');
  if (S.dayRoute) {
    $('reportRows').insertAdjacentHTML('afterbegin',
      `<div><span class="lk">3:00 PM</span><span class="lv" style="color:#ffd75e;font-weight:700;text-align:right;max-width:62%">${S.dayRoute}</span></div>`);
  }
  if (S.run) {
    $('reportRows').insertAdjacentHTML('afterbegin',
      `<div><span class="lk">MISSION</span><span class="lv">${S.run.complete ? 'COMPLETE' : (S.run.failed ? 'FAILED' : 'INCOMPLETE')}</span></div>`);
  }
  if (D.secretList && D.secretList.length) {
    $('reportRows').insertAdjacentHTML('beforeend',
      `<div><span class="lk">YOU FOUND OUT</span><span class="lv" style="color:#c39bff">${D.secretList.join(', ')}</span></div>`);
  }
  const tier = ruinTier(S.ruin);
  const rk = rankFor(S.career.ruin || 0);
  $('reportRank').textContent = tier.name;
  $('reportNote').textContent = tier.note;
  $('reportRankRow').textContent = rk.rank.title
    + (rk.next ? `  ·  next: ${rk.next.title} at ${rk.next.at.toLocaleString()} ruin` : '  ·  TOP OF THE LADDER');
  if (rk.rank.title !== S.career.title) {
    S.career.title = rk.rank.title;
    saveCareer(S.career);
    toast('PROMOTED — ' + rk.rank.title, 'boss');
  }
  SFX.stopMusic();
  Music.scene(promoted ? 'promote' : 'fired');
  if (promoted) SFX.promote(); else SFX.ui(false);
  S.lastShare =
    `WORST EMPLOYEE\nProductivity: ${prod}%\nCompany damage: $${S.damage.toLocaleString()}\n` +
    `Chaos combo: ×${S.bestChain}\nChaos score: ${score.toLocaleString()}\nRank: ${rank}`;
  show('report');
}

// ---------------------------------------------------------------
// UPDATE
// ---------------------------------------------------------------
function update(dt) {
  S.time += dt;
  S.shiftT += dt;
  pollInput();

  // Picks the bed for the room, or a chaos loop, or the boss theme. Safe to
  // call every frame — it only acts when the choice actually changes. It sits
  // above the cutscene branch below deliberately: that branch returns, and
  // having the director underneath it left the menu loop playing all the way
  // through the opening scene.
  Music.update(S);

  if (toastT > 0) { toastT -= dt; if (toastT <= 0) $('toast').className = 'toast'; }

  // coffee boost
  if (S.boostT > 0) {
    S.boostT -= dt;
    if (S.boostT <= 0) { S.speedMul = 1; S.chaosMul = 1; hide('boost'); }
  }

  if (S.story && S.story.active) {
    S.story.step(dt);
    setScene(true);
    show('btnSkip');
    drawDialogue();
    // the camera follows whoever is talking/walking
    const foc = S.story.walks.size
      ? [...S.story.walks.keys()][0] : S.player;
    const tx0 = foc.cx - viewW() / 2;
    S.cam.x += (Math.max(0, Math.min(LEVEL_W - viewW(), tx0)) - S.cam.x) * Math.min(1, dt * 3);
    const ty0 = FLOOR_Y + 26 - viewH();
    S.cam.y += (ty0 - S.cam.y) * Math.min(1, dt * 5);
    S.world.step(dt);
    FX.step(dt);
    updateHud();
    return;
  }
  if (S.intro && S.story && S.story.done) {
    S.intro = false;
    setScene(false);
    hide('dlg'); hide('choices'); hide('btnSkip');
    S.career.hired = true;
    saveCareer(S.career);
    toast('CLOCK IN. Ruin the day.');
  }

  S.player.update(dt, S);
  S.player.carryPose();
  S.chatCd = (S.chatCd || 4) - dt;
  if (S.chatCd <= 0) {
    S.chatCd = 3.5 + Math.random() * 4;
    const near = S.coworkers.filter(c => !c.dead && c.mode !== 'down' && !c.fighting
      && Math.abs(c.cx - S.player.cx) < 260);
    if (near.length) {
      const c = near[Math.floor(Math.random() * near.length)];
      if (!(c.barkCd > 0)) bark(c, pick(CHATTER, (S.chatN = (S.chatN || 0) + 1) * 7), '#9aa1b5');
    }
  }

  for (const c of S.coworkers) {
    c.update(dt, S);
    if (c.barkCd > 0) c.barkCd -= dt;
    if (c.face_t > 0) c.face_t -= dt;
    if (c.bleedT > 0) {
      c.bleedT -= dt;
      if (Math.random() < 0.10) FX.spark(c.cx, c.cy - 4, 1, '#8d1717', 90);
    }
  }
  if (S.boss && S.boss.face_t > 0) S.boss.face_t -= dt;
  if (S.player.face_t > 0) S.player.face_t -= dt;
  if (S.player.fiddleT > 0) S.player.fiddleT -= dt;
  if (S.boss && !S.boss.dead) S.boss.update(dt, S);

  S.world.step(dt);
  S.chaos.step(dt);
  S.events.step(dt);
  // ruin banked while the alarm is going, for the drill mission
  if (S.events && S.events.active && S.events.active.id === 'drill') {
    S.drillRuin = (S.drillRuin || 0) + Math.max(0, S.ruin - (S.lastRuinTick || 0));
  }
  S.lastRuinTick = S.ruin;
  tickClock(dt);
  S.sabotage.step();
  if (S.dayRoute) {
    $('reportRows').insertAdjacentHTML('afterbegin',
      `<div><span class="lk">3:00 PM</span><span class="lv" style="color:#ffd75e;font-weight:700;text-align:right;max-width:62%">${S.dayRoute}</span></div>`);
  }
  if (S.run) { S.run.step(); drawMissionHud(); }
  tickSalary(dt);

  // Announce the room you walk into. Rooms are only worth having if arriving in
  // one is an event.
  const rm = roomAt(S.player.cx);
  if (rm && rm.id !== S.room) {
    if (S.room) { toast(rm.name); SFX.ui(true); }
    S.room = rm.id;
  }
  S.player.carryPose();

  // the lift
  const lf = S.lift;
  S.nearLift = !!(lf && Math.abs(lf.cx - S.player.cx) < 54 && S.player.grounded);
  // The lift used to ride on "hold up" -- but W is both up AND jump, so simply
  // jumping next to the doors teleported you between floors. It is its own
  // button now, shown only when you are actually at the doors.
  $('btnLift').classList.toggle('hidden', !S.nearLift);
  if (S.nearLift && IN.useEdge && S.liftCd <= 0) rideLift();
  if (S.liftCd > 0) S.liftCd -= dt;
  if (fade > 0) fade = Math.max(0, fade - dt * 3);

  // coffee machine interaction
  const cm = S.coffeeMachine;
  if (S.coffeeCd > 0) S.coffeeCd -= dt;
  if (cm && !cm.broken && S.coffeeCd <= 0 &&
      Math.abs(cm.cx - S.player.cx) < 46 && (S.boostT <= 0.01 || S.freeCoffee)) {
    S.coffeeCd = 0.9;   // per-cup gate, independent of the 12s boost
    if (S.player.grounded && Math.abs(S.player.vx) < 40) {
      S.coffees++;
      S.coffeeSpend += COFFEE.capsuleCost;
      S.boostT = COFFEE.duration;
      S.speedMul = COFFEE.speedMul;
      S.chaosMul = COFFEE.chaosMul;
      S.productivity = Math.max(0, S.productivity - 0.4);
      show('boost');
      SFX.coffee();
      FX.float(cm.cx, cm.y - 10, '+COFFEE', '#ffd9a8', 13);
      if (S.coffees === 12) toast('"WE SPENT $400 ON COFFEE CAPSULES THIS WEEK."');
    }
  }

  // slow productivity drain while causing trouble
  if (S.chaos.alive) S.productivity = Math.max(0, S.productivity - dt * 3);

  // camera
  const tx = S.player.cx - viewW() / 2 + S.player.face * 40;
  S.cam.x += (Math.max(0, Math.min(LEVEL_W - viewW(), tx)) - S.cam.x) * Math.min(1, dt * 4.2);
  // Keep the floor near the bottom of the frame rather than centring on the
  // player, so jumps show headroom instead of sliding the whole office down.
  const ty = FLOOR_Y + 26 - viewH();
  S.cam.y += (ty - S.cam.y) * Math.min(1, dt * 5);

  FX.step(dt);
  updateHud();
}

function updateHud() {
  $('hCoins').textContent = S.coins.toLocaleString();
  const wq = WEAPONS[S.player.equipped] || WEAPONS.fists;
  $('hWeapon').textContent = wq.name;
  const hpf = Math.max(0, S.player.hp / S.player.maxHp);
  $('hpFill').style.width = (hpf * 100) + '%';
  $('hpFill').style.background = hpf > 0.5 ? '#8fd6a0' : (hpf > 0.22 ? '#ffd75e' : '#ff5c5c');
  $('hRuin').textContent = Math.round(S.ruin).toLocaleString();
  $('hRuinTier').textContent = ruinTier(S.ruin).name;
  $('hProd').textContent = Math.max(0, S.productivity).toFixed(0) + '%';
  const st = angerStage(S.anger);
  SFX.setTension(S.anger / 100);
  $('hAngerStage').textContent = st.name;
  $('hAngerFill').style.width = S.anger + '%';

  // sabotage briefing
  const jl = $('jobs');
  if (S.sabotage && S.sabotage.active.length) {
    // Show at most two, unfinished first. Three or four open jobs stacked into a
    // column tall enough to cover a third of the screen, and a job you cannot
    // read is not a job you are playing towards.
    const shown = S.sabotage.active
      .slice()
      .sort((a, b) => (a.complete ? 1 : 0) - (b.complete ? 1 : 0))
      .slice(0, 2);
    const more = S.sabotage.active.length - shown.length;
    const sig = shown.map(j => j.id + (j.complete ? '1' : '0')).join(',') + '|' + more;
    if (jl._sig !== sig) {
      jl._sig = sig;
      jl.innerHTML = shown.map(j =>
        `<div class="job${j.complete ? ' done' : ''}"><b>${j.name}</b><span>${j.complete ? j.done : j.brief}</span></div>`
      ).join('') + (more > 0 ? `<div class="job more">+${more} more</div>` : '');
    }
  }

  const cw = $('comboWrap');
  const p2 = S.player;
  if (p2 && p2.comboTimer > 0 && p2.comboStep > 0) {
    cw.classList.add('on');
    $('comboN').textContent = '×' + p2.comboStep;
    $('comboBar').firstElementChild.style.width =
      (p2.comboTimer / ATTACK.comboWindow * 100) + '%';
  } else cw.classList.remove('on');

  const ev = $('eventBar');
  if (S.events && S.events.active) {
    ev.classList.remove('hidden');
    $('eventName').textContent = S.events.active.name;
    $('eventFill').style.width = (S.events.t / S.events.active.dur * 100) + '%';
  } else ev.classList.add('hidden');

  const w = $('chainWrap');
  if (S.chaos.chain >= 2) {
    w.classList.add('on');
    $('chainX').textContent = `CHAOS ×${S.chaos.chain}`;
    $('chainBar').firstElementChild.style.width = (S.chaos.remain * 100) + '%';
  } else w.classList.remove('on');
}

// ---------------------------------------------------------------
// RENDER
// ---------------------------------------------------------------
function render() {
  const camX = S.cam.x + (FX.shake ? (Math.random() - 0.5) * FX.shake * 2 : 0);
  const camY = S.cam.y + (FX.shake ? (Math.random() - 0.5) * FX.shake * 2 : 0);

  ctx.fillStyle = COL.bgFar;
  ctx.fillRect(0, 0, VIEW.w, VIEW.h);

  ctx.save();
  ctx.scale(S.zoom, S.zoom);
  ctx.translate(-camX, -camY);

  drawBackground(camX);

  drawFloor(camX);

  // desks — real art when loaded
  for (const d of S.world.statics) {
    const im = WORLD.props && WORLD.props.desk;
    if (im) {
      // Drawn 1:1 into the collider. Scaling the art by its own aspect made the
      // desk 55% too tall, so it stood chest-high on a 62px character.
      ctx.drawImage(im, d.x, d.y - 2, d.w, d.h + 4);
      continue;
    }
    ctx.fillStyle = '#39405a';
    roundRect(ctx, d.x, d.y, d.w, d.h, 3); ctx.fill();
    ctx.fillStyle = '#2b3049';
    ctx.fillRect(d.x + 6, d.y + d.h - 3, 8, 3);
    ctx.fillRect(d.x + d.w - 14, d.y + d.h - 3, 8, 3);
    ctx.strokeStyle = 'rgba(0,0,0,.3)'; ctx.lineWidth = 1;
    roundRect(ctx, d.x, d.y, d.w, d.h, 3); ctx.stroke();
  }

  // contact shadows first — nothing reads as standing on a floor without one
  if (WORLD.ready) {
    ctx.fillStyle = 'rgba(0,0,0,.30)';
    for (const b of S.world.bodies) {
      if (b.type !== 'prop' || b.y + b.h < FLOOR_Y - 6) continue;
      ctx.beginPath();
      ctx.ellipse(b.cx, FLOOR_Y + 1, b.w * 0.52, 3.5, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // the lift doors
  if (S.lift) {
    const l = S.lift;
    ctx.fillStyle = '#1b2030';
    ctx.fillRect(l.x - 4, l.y - 6, l.w + 8, l.h + 6);
    ctx.fillStyle = '#39405c';
    ctx.fillRect(l.x, l.y, l.w, l.h);
    ctx.fillStyle = '#20263a';
    ctx.fillRect(l.cx - 1.5, l.y + 4, 3, l.h - 4);
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#5b6486';
    ctx.strokeRect(l.x, l.y, l.w, l.h);
    ctx.fillStyle = '#ffd75e';
    ctx.font = `700 ${7 / S.zoom * 1.7}px system-ui`; ctx.textAlign = 'center';
    ctx.fillText(S.floor === 'ops' ? '12' : '13', l.cx, l.y - 10);
    if (S.nearLift) {
      ctx.fillStyle = 'rgba(255,215,94,.9)';
      ctx.font = `800 ${9 / S.zoom * 1.7}px system-ui`;
      ctx.fillText('CALL LIFT', l.cx, l.y - 22);
    }
  }

  // props — real art when it exists, greybox otherwise
  for (const b of S.world.bodies) {
    if (b.type !== 'prop') continue;
    if (!(WORLD.ready && WORLD.drawProp(ctx, b, S.time))) drawProp(ctx, b, S.time);
  }

  // coworkers — same skeleton as the player, different parts
  for (const c of S.coworkers) {
    if (c.dead || c.visible === false) continue;
    if (c.art && CAST.has(c.art)) {
      CAST.draw(ctx, c.art, npcPoseName(c, c.animT),
        c.cx, c.y + c.h, c.h * 1.10, c.face < 0, 1);
      // a health bar, but only while they are actually hurt
      // the expression, painted over their own face
      if (FACES.ready && c.face_t > 0) {
        reactionBubble(ctx, c.art, c.face_emo, c, 1 - c.face_t / c.face_max);
      }
      if (c.hp < c.maxHp && c.mode !== 'down') {
        const w = 26, hx = c.cx - w / 2, hy = c.y - 20;
        ctx.fillStyle = 'rgba(0,0,0,.6)'; ctx.fillRect(hx, hy, w, 3);
        ctx.fillStyle = c.hp > c.maxHp * 0.4 ? '#8fd6a0' : '#ff7b7b';
        ctx.fillRect(hx, hy, w * Math.max(0, c.hp / c.maxHp), 3);
      }
      if (c.mode !== 'down' && Math.abs(c.cx - S.player.cx) < 190) {
        const fs = 1 / S.zoom;
        ctx.textAlign = 'center';
        ctx.fillStyle = 'rgba(230,235,250,.62)';
        ctx.font = `800 ${9 * fs * 1.7}px system-ui`;
        ctx.fillText(c.name, c.cx, c.y - 14);
        ctx.fillStyle = 'rgba(140,150,180,.6)';
        ctx.font = `700 ${7 * fs * 1.7}px system-ui`;
        ctx.fillText(c.title || 'STAFF', c.cx, c.y - 6);
      }
    } else if (c.art && RIG.cast[c.art]) {
      RIG.drawCast(ctx, c.art, RIG.npcPose(c, c.animT, c.mode),
        c.cx, c.y + c.h, c.h * 1.06, c.face < 0, 1);
    } else {
      drawHuman(ctx, c, {
        body: c.mode === 'down' ? COL.npcHurt : COL.npc,
        dark: '#4a4f63', t: c.animT, flip: c.face < 0,
        state: c.mode === 'panic' ? 'run' : 'idle',
      });
    }
  }

  // boss
  if (S.boss && !S.boss.dead) {
    const b = S.boss;
    // `bossDown()` clears `fighting` and sets `defeated`, which used to flip the
    // art back to boss-calm — and boss-calm has no `down` frame, so CAST.draw
    // fell back to `idle` and the KNOCKED-OUT boss rendered standing bolt
    // upright. He was enraged when you put him there; he stays in that art.
    const bossArt = bossArtFor(b);
    if (CAST.has(bossArt)) {
      CAST.draw(ctx, bossArt, bossPoseName(b, b.animT),
        b.cx, b.y + b.h, b.h * 1.10, b.face < 0, b.hurtT > 0 ? 0.65 : 1);
      if (FACES.ready && b.face_t > 0) {
        reactionBubble(ctx, bossArt, b.face_emo, b, 1 - b.face_t / b.face_max);
      }
    } else if (RIG.cast[bossArt]) {
      RIG.drawCast(ctx, bossArt, RIG.bossPose(b, b.animT),
        b.cx, b.y + b.h, b.h * 1.06, b.face < 0, b.hurtT > 0 ? 0.6 : 1);
    } else {
      drawHuman(ctx, b, {
        body: b.hurtT > 0 ? '#fff' : COL.boss, dark: COL.bossD,
        t: b.animT, flip: b.face < 0, state: b.fighting ? 'run' : 'idle',
      });
    }
    if (b.fighting) {
      const w = 90, hp = Math.max(0, b.hp / b.maxHp);
      ctx.fillStyle = 'rgba(0,0,0,.6)'; ctx.fillRect(b.cx - w / 2, b.y - 18, w, 6);
      ctx.fillStyle = '#ff5c5c'; ctx.fillRect(b.cx - w / 2, b.y - 18, w * hp, 6);
    }
    ctx.fillStyle = '#ff9a9a'; ctx.font = `700 ${9 / S.zoom * 1.7}px system-ui`; ctx.textAlign = 'center';
    ctx.fillText('BOSS', b.cx, b.y - 18);
  }


  // player — real sprites when they have loaded, layered greybox rig otherwise
  const p = S.player;
  ctx.save();
  ctx.translate(p.cx, p.y + p.h);
  ctx.fillStyle = 'rgba(0,0,0,.35)';
  ctx.beginPath(); ctx.ellipse(0, 2, p.w * 0.55, 5, 0, 0, Math.PI * 2); ctx.fill();
  ctx.restore();

  const alpha = p.iframes > 0 ? 0.45 : 1;
  const curPose = (S.useArt && SPRITES.ready) ? poseFor(p, p.animT) : null;
  if (S.useRig && RIG.ready) {
    // the skeleton: customization survives every animation
    RIG.draw(ctx, RIG.poseFor(p, p.animT), p.cx, p.y + p.h,
      p.h * p.squash * 1.06, p.face < 0, alpha);
  } else if (S.useArt && SPRITES.ready) {
    // squash is applied to the draw height so landings still punch.
    // There WAS a special case here that took the standing `hurt` frame and
    // rotated it 77 degrees to fake lying down. It is gone: `down` and `getup`
    // are drawn frames now, and `poseFor` returns them, so the general path
    // handles being floored like any other state.
    SPRITES.draw(ctx, curPose, p.cx, p.y + p.h,
      p.h * p.squash * 1.06, p.face < 0, alpha);
    // the equipped weapon rides in the hand; a grabbed prop is drawn by the
    // props loop instead, so never draw both
    const eqw = WEAPONS[p.equipped];
    if (eqw && eqw.art && !p.carrying) {
      drawWeapon(ctx, eqw.art, curPose, p.cx, p.y + p.h, p.h * p.squash * 1.06, p.face < 0);
    }
  } else {
    ctx.save();
    ctx.translate(p.cx, p.y + p.h);
    drawCharacter(ctx, S.look, {
      w: p.w, h: p.h, t: p.animT, flip: p.face < 0,
      state: p.state === 'dodge' ? 'run' : p.state,
      squash: p.squash, alpha,
    });
    ctx.restore();
  }
  if (FACES.ready && p.face_t > 0) {
    reactionBubble(ctx, 'player', p.face_emo, p, 1 - p.face_t / p.face_max);
  }
  ctx.fillStyle = 'rgba(255,255,255,.5)';
  ctx.font = `700 ${8 / S.zoom * 1.6}px system-ui`; ctx.textAlign = 'center';
  ctx.fillText(S.look.name || 'YOU', p.cx, p.y - 6);

  // attack arc tell
  if (p.atk && p.atk.phase === 'active') {
    const d = p.atk.kind === 'heavy' ? ATTACK.heavy : ATTACK.light[p.atk.step];
    ctx.fillStyle = 'rgba(255,255,255,.20)';
    const bx = p.face > 0 ? p.x + p.w - 6 : p.x - d.reach + 6;
    roundRect(ctx, bx, p.cy - d.hh / 2, d.reach, d.hh, 8); ctx.fill();
  }

  FX.draw(ctx, 1 / S.zoom);
  ctx.restore();

  // ceiling vignette + hit flash
  const g = ctx.createLinearGradient(0, 0, 0, 70);
  g.addColorStop(0, 'rgba(0,0,0,.5)'); g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, VIEW.w, 70);
  if (S.dark) {
    ctx.fillStyle = 'rgba(4,5,12,.55)';
    ctx.fillRect(0, 0, VIEW.w, VIEW.h);
  }
  if (S.hrWatching) {
    // a red creep from the edges: standing still is literally the safe zone
    const h = Math.min(1, S.hrHeat || 0);
    const g = ctx.createRadialGradient(VIEW.w / 2, VIEW.h / 2, VIEW.h * 0.25,
                                       VIEW.w / 2, VIEW.h / 2, VIEW.h * 0.78);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, `rgba(190,30,30,${0.20 + h * 0.5})`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, VIEW.w, VIEW.h);
  }
  if (fade > 0) {
    ctx.fillStyle = `rgba(6,7,12,${Math.min(1, fade)})`;
    ctx.fillRect(0, 0, VIEW.w, VIEW.h);
  }
  if (FX.flash > 0) {
    ctx.fillStyle = `rgba(255,90,90,${Math.min(0.5, FX.flash * 0.5)})`;
    ctx.fillRect(0, 0, VIEW.w, VIEW.h);
  }
}

function tileStrip(im, camX, y, h, parallax) {
  // Parallax means the layer scrolls slower than the camera, which is what
  // gives a flat side-on office any sense of depth at all.
  const w = im.width * (h / im.height);
  const off = ((camX * parallax) % w + w) % w;
  const start = camX - off;
  for (let x = start; x < camX + viewW() + w; x += w) {
    ctx.drawImage(im, x, y, w + 1, h);      // +1 hides sub-pixel seams
  }
}

function drawBackground(camX) {
  const bgW = WORLD.bg['bg-wall'], bgC = WORLD.bg['bg-ceiling'], bgF = WORLD.bg['bg-floor'];

  if (bgW) {
    tileStrip(bgW, camX, CEIL_Y, FLOOR_Y - CEIL_Y, 0.35);
    // darken the wall so the characters stay the brightest thing on screen
    // Push the backdrop back so the characters are the brightest thing on
    // screen — a readable silhouette matters more than showing off the wall.
    ctx.fillStyle = 'rgba(12,14,24,.52)';
    ctx.fillRect(camX, CEIL_Y, viewW(), FLOOR_Y - CEIL_Y);
    // each room gets its own wash so you can feel where you are
    for (const r of CUR.rooms) {
      const a = Math.max(r.x0, camX), b2 = Math.min(r.x1, camX + viewW());
      if (b2 <= a) continue;
      ctx.fillStyle = r.tint + '55';
      ctx.fillRect(a, CEIL_Y, b2 - a, FLOOR_Y - CEIL_Y);
    }
    const depth = ctx.createLinearGradient(0, CEIL_Y, 0, FLOOR_Y);
    depth.addColorStop(0, 'rgba(8,9,16,.45)');
    depth.addColorStop(0.55, 'rgba(8,9,16,0)');
    depth.addColorStop(1, 'rgba(8,9,16,.35)');
    ctx.fillStyle = depth;
    ctx.fillRect(camX, CEIL_Y, viewW(), FLOOR_Y - CEIL_Y);
  } else {
    ctx.fillStyle = COL.bgWall;
    ctx.fillRect(0, CEIL_Y, LEVEL_W, FLOOR_Y - CEIL_Y);
    for (let x = 60; x < LEVEL_W; x += 260) {
      ctx.fillStyle = COL.window;
      roundRect(ctx, x, CEIL_Y + 26, 150, 96, 4); ctx.fill();
      ctx.strokeStyle = COL.bgTrim; ctx.lineWidth = 5;
      roundRect(ctx, x, CEIL_Y + 26, 150, 96, 4); ctx.stroke();
    }
  }

  if (bgC) {
    tileStrip(bgC, camX, ROOF_Y, CEIL_Y - ROOF_Y, 0.55);
    ctx.fillStyle = 'rgba(12,14,24,.45)';
    ctx.fillRect(camX, ROOF_Y, viewW(), CEIL_Y - ROOF_Y);
  } else {
    ctx.fillStyle = COL.bgTrim;
    ctx.fillRect(0, ROOF_Y, LEVEL_W, CEIL_Y - ROOF_Y);
  }

  // light pools on the floor, drawn regardless — they sell the fluorescent strips
  for (let x = Math.floor(camX / 300) * 300; x < camX + viewW() + 300; x += 300) {
    const g = ctx.createLinearGradient(0, CEIL_Y, 0, FLOOR_Y);
    g.addColorStop(0, 'rgba(255,246,208,.09)');
    g.addColorStop(1, 'rgba(255,246,208,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(x, CEIL_Y); ctx.lineTo(x + 110, CEIL_Y);
    ctx.lineTo(x + 170, FLOOR_Y); ctx.lineTo(x - 60, FLOOR_Y);
    ctx.closePath(); ctx.fill();
  }

  ctx.fillStyle = 'rgba(255,255,255,.07)';
  ctx.font = '900 26px system-ui'; ctx.textAlign = 'left';
  ctx.font = '900 18px system-ui';
  const SIGNS = S.floor === 'exec'
    ? [[700, 'LEADERSHIP'], [1600, 'CONFIDENTIAL'], [2150, 'RESULTS']]
    : [[300, "WE'RE A FAMILY"], [1180, 'PRODUCTIVITY MATTERS'],
       [2400, 'PLEASE WASH YOUR MUG'], [3020, 'SYNERGY'], [3820, 'ADMIN']];
  for (const [sx, txt] of SIGNS) ctx.fillText(txt, sx, CEIL_Y + 54);

  // Partition walls with a doorway you walk through. This is what turns one long
  // corridor into rooms — the wall tints alone read as a gradient, not as having
  // arrived somewhere. The opening is taller than the player so there is no
  // collider here at all; you just walk through.
  for (const r of CUR.rooms) {
    if (r.x0 <= 0) continue;
    const wx = r.x0 - 13;
    if (wx + 26 < camX - 60 || wx > camX + viewW() + 60) continue;
    const dx = r.x0 - DOOR_W / 2;

    ctx.fillStyle = '#151824';
    ctx.fillRect(wx, CEIL_Y - 8, 26, FLOOR_Y - CEIL_Y + 8);
    ctx.fillStyle = 'rgba(255,255,255,.06)';
    ctx.fillRect(wx, CEIL_Y - 8, 5, FLOOR_Y - CEIL_Y + 8);
    ctx.fillStyle = 'rgba(0,0,0,.35)';
    ctx.fillRect(wx + 21, CEIL_Y - 8, 5, FLOOR_Y - CEIL_Y + 8);

    // the opening — darker than the wall so it reads as depth
    ctx.fillStyle = '#0b0e15';
    ctx.fillRect(dx, FLOOR_Y - DOOR_H, DOOR_W, DOOR_H);
    ctx.fillStyle = 'rgba(120,150,200,.06)';
    ctx.fillRect(dx + 7, FLOOR_Y - DOOR_H + 7, DOOR_W - 14, DOOR_H - 7);
    ctx.strokeStyle = '#454c66'; ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(dx, FLOOR_Y); ctx.lineTo(dx, FLOOR_Y - DOOR_H);
    ctx.lineTo(dx + DOOR_W, FLOOR_Y - DOOR_H); ctx.lineTo(dx + DOOR_W, FLOOR_Y);
    ctx.stroke();

    ctx.fillStyle = 'rgba(230,235,250,.5)';
    ctx.font = '700 8px system-ui'; ctx.textAlign = 'center';
    ctx.fillText(r.name, r.x0, FLOOR_Y - DOOR_H - 10);
    ctx.textAlign = 'left';
  }
}

function drawFloor(camX) {
  const bgF = WORLD.bg['bg-floor'];
  if (bgF) {
    tileStrip(bgF, camX, FLOOR_Y - 4, viewH() + 44, 1);
    ctx.fillStyle = 'rgba(14,16,26,.55)';
    ctx.fillRect(camX, FLOOR_Y - 4, viewW(), viewH() + 44);
  } else {
    ctx.fillStyle = COL.floor;
    ctx.fillRect(0, FLOOR_Y, LEVEL_W, VIEW.h - FLOOR_Y + 40);
    ctx.strokeStyle = COL.floorLn; ctx.lineWidth = 1;
    for (let x = 0; x < LEVEL_W; x += 60) {
      ctx.beginPath(); ctx.moveTo(x, FLOOR_Y); ctx.lineTo(x - 30, VIEW.h + 40); ctx.stroke();
    }
  }
  ctx.strokeStyle = 'rgba(0,0,0,.45)'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(camX, FLOOR_Y); ctx.lineTo(camX + viewW(), FLOOR_Y); ctx.stroke();
}

// ---------------------------------------------------------------
// LOOP
// ---------------------------------------------------------------
let last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  let dt = (now - last) / 1000;
  last = now;
  if (dt > 0.05) dt = 0.05;                 // tab-switch guard

  if (S.mode !== 'play') {
    if (!$('create').classList.contains('hidden')) drawPreview(dt);
    return;
  }

  if (FX.hitstop > 0) {                     // freeze gameplay, keep drawing
    FX.hitstop -= dt;
    render();
    return;
  }
  update(dt);
  render();
}

// ---------------------------------------------------------------
// WIRING
// ---------------------------------------------------------------
// Phones leave the browser chrome in place on rotate, which eats a third of a
// landscape screen. Ask for fullscreen (and a landscape lock where the browser
// allows it) on the first real gesture — it can only be requested from one.
function goFullscreen() {
  const el = document.documentElement;
  const fn = el.requestFullscreen || el.webkitRequestFullscreen || el.msRequestFullscreen;
  if (fn && !document.fullscreenElement) {
    try {
      const r = fn.call(el);
      if (r && r.then) r.then(() => {
        if (screen.orientation && screen.orientation.lock) {
          screen.orientation.lock('landscape').catch(() => {});
        }
      }).catch(() => {});
    } catch (e) { /* desktop, or the browser said no */ }
  }
  // iOS Safari has no fullscreen API on iPhone at all, so the address bar stays
  // put. Scrolling by one pixel is the only lever that hides it.
  window.scrollTo(0, 1);
  setTimeout(resize, 220);
  setTimeout(resize, 700);
}

function isFullscreen() {
  return !!(document.fullscreenElement || document.webkitFullscreenElement);
}
addEventListener('fullscreenchange', () => { setTimeout(resize, 120); syncFsBtn(); });
addEventListener('orientationchange', () => setTimeout(resize, 260));
// visualViewport moves when the address bar slides away; the canvas has to
// follow it or the bottom of the game sits under browser chrome.
if (window.visualViewport) {
  visualViewport.addEventListener('resize', () => setTimeout(resize, 60));
}
function syncFsBtn() {
  const b = document.getElementById('btnFS');
  if (b) b.classList.toggle('hidden', isFullscreen());
}

// The very first touch anywhere asks for fullscreen — waiting for a specific
// button meant anyone starting from FREE ROAM or the mission list never got it.
let askedFs = false;
addEventListener('pointerdown', () => {
  if (askedFs) return;
  askedFs = true;
  goFullscreen();
}, { capture: true });

$('verTag').textContent = 'v' + VERSION;
SPRITES.load().then(ok => {
  console.log(ok ? 'player sprites loaded: ' + Object.keys(SPRITES.img).length
                 : 'no player sprites');
});
WEAPON_ART.load().then(n => console.log('weapon art loaded: ' + n));
FACES.load().then(n => console.log('reaction faces loaded: ' + n));
WORLD.load().then(ok => console.log(ok ? 'world art loaded: ' + Object.keys(WORLD.props).length + ' props' : 'no world art'));
CAST.load(['npc-sami', 'npc-rita', 'npc-omar', 'boss-calm', 'boss-rage'])
  .then(n => console.log('cast frames loaded: ' + n + ' characters'));
RIG.load().then(async ok => {
  if (!ok) { console.log('no rig — falling back to key poses'); return; }
  const c = await RIG.loadCast(['npc-sami', 'npc-rita', 'npc-omar', 'boss-calm', 'boss-rage']);
  console.log('rig loaded: ' + Object.keys(RIG.img).length + ' parts, ' + c + ' cast');
  applyLook();
});
initInput(cv);
resize();
requestAnimationFrame(frame);

// The title screen picks its music before any gesture exists, and a browser
// will not start audio until one does. Every button resumes both, and Music
// replays whatever scene was already chosen.
Music.scene('title');
for (const b of document.querySelectorAll('button')) {
  b.addEventListener('pointerdown', () => { SFX.resume(); Music.resume(); });
}
$('btnStart').addEventListener('pointerdown', goFullscreen);
$('btnFree').addEventListener('pointerdown', goFullscreen);
$('btnHired').addEventListener('pointerdown', goFullscreen);
$('btnStart').onclick = () => { SFX.resume(); SFX.ui(); Music.scene('menu'); buildMissions(); hide('title'); show('missions'); };
$('btnFree').onclick = () => { SFX.resume(); SFX.ui(); Music.scene('menu'); S.mode2 = 'free'; S.mission = null; openCreator(); };
$('btnMsnBack').onclick = () => { SFX.ui(false); Music.scene('title'); hide('missions'); show('title'); };
$('btnAgain').onclick = startShift;
$('btnHired').onclick = () => {
  S.look.name = ($('cName').value.trim().toUpperCase().slice(0, 12)) || 'FIRASS';
  saveLook(S.look);
  startShift();
};
$('btnRandom').onclick = () => {
  Object.assign(S.look, randomLook($('cName').value));
  refreshSwatches(); saveLook(S.look); applyLook();
};
$('cName').oninput = () => { S.look.name = $('cName').value.toUpperCase(); };
$('btnEnd').onclick = () => endShift(false);
$('btnHelp').onclick = () => { hide('title'); show('help'); };
$('btnShop').onclick = () => { SFX.resume(); SFX.ui(); Music.scene('shop'); buildShop(); hide('title'); show('shop'); };
function cycleWeapon() {
  const owned = S.career.owned.filter(id => WEAPONS[id]);
  if (owned.length < 2) { toast('Buy something first.'); SFX.ui(false); return; }
  const i = (owned.indexOf(S.player.equipped) + 1) % owned.length;
  S.player.equipped = owned[i];
  S.career.equipped = owned[i];
  Music.warmFor(owned[i]);
  saveCareer(S.career);
  toast(WEAPONS[owned[i]].name);
  SFX.ui(true);
}
addEventListener('pointerdown', e => {
  if (S.story && S.story.active && !S.story.choice && !e.target.closest('button')) S.story.advance();
});
addEventListener('keydown', e => {
  if (S.story && S.story.active && (e.key === ' ' || e.key === 'Enter')) S.story.advance();
});
$('btnSkip').onclick = () => {
  if (!S.story) return;
  // Run every remaining fx beat so the world ends up in the state the scene
  // would have left it in — skipping must not strand the boss mid-tour.
  for (let i = S.story.i; i < S.story.beats.length; i++) {
    const b = S.story.beats[i];
    if (b.t === 'fx') { try { b.fn(); } catch (e) {} }
    if (b.t === 'walk') { const a = S.story.actor(b.who); if (a) a.x = b.x; }
  }
  S.story.walks.clear();
  S.story.done = true;
  S.story.line = null;
  S.story.choice = null;
  SFX.ui(false);
};
$('btnLift').addEventListener('pointerdown', e => { e.preventDefault(); rideLift(); });
$('btnFS').addEventListener('click', () => { goFullscreen(); syncFsBtn(); });
$('btnSwap').addEventListener('pointerdown', e => { e.preventDefault(); cycleWeapon(); });
$('btnShopFromReport').onclick = () => { Music.scene('shop'); buildShop(); hide('report'); show('shop'); S.shopFrom = 'report'; };
$('btnShopBack').onclick = () => {
  SFX.ui(false); hide('shop');
  show(S.shopFrom === 'report' ? 'report' : 'title');
  S.shopFrom = null;
};
$('btnHelpBack').onclick = () => { Music.scene('title'); hide('help'); show('title'); };
$('btnShare').onclick = async () => {
  try {
    if (navigator.share) await navigator.share({ text: S.lastShare });
    else { await navigator.clipboard.writeText(S.lastShare); $('btnShare').textContent = 'COPIED'; }
  } catch (e) { /* user cancelled */ }
};

// keyboard shortcut: R restarts, ESC ends the shift
addEventListener('keydown', e => {
  // Typing a name containing V used to flip the renderer mid-creator.
  const tg = e.target;
  if (tg && (tg.tagName === 'INPUT' || tg.tagName === 'TEXTAREA' || tg.isContentEditable)) return;
  if (S.mode === 'play' && e.key.toLowerCase() === 'r') startShift();
  if (S.mode === 'play' && e.key === 'Escape') endShift(false);
  if (S.mode === 'play' && e.key.toLowerCase() === 'q') cycleWeapon();
  if (S.mode === 'play' && e.key.toLowerCase() === 'v') {                       // cycle the renderers
    if (S.useRig) { S.useRig = false; S.useArt = true; toast('KEY POSES'); }
    else if (S.useArt) { S.useArt = false; toast('GREYBOX'); }
    else { S.useRig = true; S.useArt = true; toast('RIG'); }
  }
});

// Art hookup point. When sprites exist, uncomment and point at the files.
// ART.load({ 'player.idle': { src:'assets/player/idle.png', frames:6, fps:8 } });
window.WE = { S, ART, FX, SPRITES, RIG, CAST, applyLook, poseFor, npcPoseName, bossPoseName, bossArtFor };   // handy in the mobile console
