// WORST EMPLOYEE — feel test. Game state, loop, camera, renderer, shift report.

import { VERSION, VIEW, FLOOR_Y, CEIL_Y, ROOF_Y, LEVEL_W, COL, COFFEE, RANKS, ATTACK } from './config.js';
import { World } from './engine.js';
import { FX } from './fx.js';
import { ART, SPRITES, WORLD, poseFor, recolourSprites, drawHuman, drawProp, roundRect } from './art.js';
import { RIG } from './rig.js';
import { SFX } from './audio.js';
import { EventSystem } from './events.js';
import { IN, initInput, pollInput } from './input.js';
import { ChaosSystem } from './chaos.js';
import { Player } from './player.js';
import { buildOffice, angerStage } from './office.js';
import { OPTIONS, defaultLook, randomLook, saveLook, loadLook, drawCharacter, drawPortrait, lookColours, lookVariants } from './character.js';

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
  hrWatching: false, hrHeat: 0, freeCoffee: false, clientHere: false, dark: false,
  toast: (msg, cls) => toast(msg, cls),
  useArt: true,          // rendered key poses
  useRig: true,          // the cut-up skeleton — takes priority when loaded
  // Camera zoom is a RENDER-only scale. The player is 62px tall because the
  // physics and combat timings were tuned at that size and they should not move;
  // at 1:1 he is 11% of screen height, which reads as a distant doll rather than
  // a brawler. Zooming the view fixes the framing and touches no gameplay number.
  zoom: 2.15,

  addAnger(v) {
    if (this.boss && this.boss.fighting) return;
    this.anger = Math.min(100, this.anger + v);
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
    if (b.type === 'npc') { b.knock(this); this.addAnger(1.4); return; }
    if (b.type === 'boss') {
      if (!b.fighting) { this.addAnger(6); return; }
      b.hp -= dmg; b.hurtT = 0.16;
      if (b.hp <= 0) bossDown();
      return;
    }
    if (b.type !== 'prop' || b.broken) return;

    b.hp -= dmg;
    if (b.hp <= 0) {
      b.broken = true;
      b.hp = 0;
      this.destroyed++;
      this.damage += b.value;
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
  const W = innerWidth, H = innerHeight;
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
      b.className = 'sw' + (def.kind === 'colour' ? ' col' : '');
      if (def.kind === 'colour') b.style.background = v; else b.textContent = v;
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
  // Show the real rig so the creator previews what you actually get, not a
  // greybox approximation of it.
  if (RIG.ready) {
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
// GAME FLOW
// ---------------------------------------------------------------
function startShift() {
  SFX.resume();
  SFX.startMusic();
  S.mode = 'play';
  S.time = 0; S.shiftT = 0;
  S.coins = 0; S.damage = 0; S.destroyed = 0; S.annoyed = 0;
  S.hits = 0; S.playerHits = 0; S.coffees = 0; S.coffeeSpend = 0;
  S.chainsMade = 0; S.bestChain = 0;
  S.productivity = 100; S.anger = 0; S.stageIdx = 0;
  S.speedMul = 1; S.chaosMul = 1; S.boostT = 0;

  S.world = new World();
  S.chaos = new ChaosSystem(S);
  S.events = S.events || new EventSystem(S);
  S.events.reset();
  S.hrWatching = false; S.hrHeat = 0; S.freeCoffee = false;
  S.clientHere = false; S.dark = false;
  S.world.onImpact = (a, b, e) => S.chaos.onImpact(a, b, e);

  S.player = new Player(120);
  S.world.add(S.player);
  buildOffice(S.world, S);

  applyLook();

  FX.clear();
  hide('title'); hide('report'); hide('help'); hide('create');
  show('hud');
  if (HAS_TOUCH) show('touch'); else hide('touch');
  resize();
  toast('CLOCK IN.');
}

function applyLook() {
  if (RIG.ready) RIG.applyLook(lookVariants(S.look));
  if (!SPRITES.ready) return;
  const c = lookColours(S.look);
  recolourSprites(S.look, c.skin, c.shirt);
}

function startBossFight() {
  const b = S.boss;
  b.fighting = true;
  b.hp = b.maxHp = 320;
  FX.kick(16, 0.22);
  FX.flash = 1;
  SFX.bossRoar();
  SFX.setTension(1);
  toast('"I HAVE HAD ENOUGH!"', 'boss');
}

function bossDown() {
  const b = S.boss;
  b.fighting = false;
  b.mode = 'down';
  b.va = 8; b.angle = 1.5;
  b.solid = false;
  FX.kick(18, 0.25);
  toast('"...You know what? You\'ve got potential."', 'boss');
  setTimeout(() => { if (S.mode === 'play') endShift(true); }, 2600);
}

function endShift(promoted = false) {
  S.mode = 'report';
  hide('hud'); hide('touch'); hide('rotate');

  const prod = Math.max(0, S.productivity).toFixed(0);
  const score = Math.round(
    S.damage * 1.1 + S.destroyed * 220 + S.annoyed * 400 +
    S.bestChain * 900 + S.anger * 60 + S.coins * 0.5
  );
  let rank = RANKS[0].name;
  for (const r of RANKS) if (score >= r.at) rank = r.name;

  const rows = [
    ['PRODUCTIVITY', prod + '%'],
    ['COMPANY DAMAGE', '$' + S.damage.toLocaleString()],
    ['OBJECTS DESTROYED', S.destroyed],
    ['EMPLOYEES ANNOYED', S.annoyed],
    ['COFFEE CONSUMED', S.coffees],
    ['SPENT ON CAPSULES', '$' + S.coffeeSpend],
    ['BOSS ANGER', Math.round(S.anger) + '%'],
    ['CHAOS CHAINS', S.chainsMade],
    ['BEST CHAIN', '×' + S.bestChain],
    ['COINS EARNED', S.coins.toLocaleString()],
    ['CHAOS SCORE', score.toLocaleString()],
  ];
  $('reportRows').innerHTML = rows
    .map(([k, v]) => `<div><span class="lk">${k}</span><span class="lv">${v}</span></div>`)
    .join('');
  $('reportRank').textContent = promoted ? 'PROMOTION APPROVED' : rank;
  SFX.stopMusic();
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

  if (toastT > 0) { toastT -= dt; if (toastT <= 0) $('toast').className = 'toast'; }

  // coffee boost
  if (S.boostT > 0) {
    S.boostT -= dt;
    if (S.boostT <= 0) { S.speedMul = 1; S.chaosMul = 1; hide('boost'); }
  }

  S.player.update(dt, S);
  S.player.carryPose();
  for (const c of S.coworkers) c.update(dt, S);
  if (S.boss) S.boss.update(dt, S);

  S.world.step(dt);
  S.chaos.step(dt);
  S.events.step(dt);
  S.player.carryPose();

  // coffee machine interaction
  const cm = S.coffeeMachine;
  if (cm && !cm.broken && Math.abs(cm.cx - S.player.cx) < 46 && (S.boostT <= 0.01 || S.freeCoffee)) {
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
  S.cam.x += (Math.max(0, Math.min(LEVEL_W - viewW(), tx)) - S.cam.x) * Math.min(1, dt * 6);
  // Keep the floor near the bottom of the frame rather than centring on the
  // player, so jumps show headroom instead of sliding the whole office down.
  const ty = FLOOR_Y + 26 - viewH();
  S.cam.y += (ty - S.cam.y) * Math.min(1, dt * 5);

  FX.step(dt);
  updateHud();
}

function updateHud() {
  $('hCoins').textContent = S.coins.toLocaleString();
  $('hDamage').textContent = '$' + S.damage.toLocaleString();
  $('hProd').textContent = Math.max(0, S.productivity).toFixed(0) + '%';
  const st = angerStage(S.anger);
  SFX.setTension(S.anger / 100);
  $('hAngerStage').textContent = st.name;
  $('hAngerFill').style.width = S.anger + '%';

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
      // Top-align to the collider, not bottom-align: things rest on d.y, so the
      // drawn desktop has to sit exactly there or props look sunk into it.
      const w = d.w * 1.08;
      const h = w * (im.height / im.width);
      ctx.drawImage(im, d.x + (d.w - w) / 2, d.y - 2, w, h);
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

  // props — real art when it exists, greybox otherwise
  for (const b of S.world.bodies) {
    if (b.type !== 'prop') continue;
    if (!(WORLD.ready && WORLD.drawProp(ctx, b, S.time))) drawProp(ctx, b, S.time);
  }

  // coworkers — same skeleton as the player, different parts
  for (const c of S.coworkers) {
    if (c.dead) continue;
    if (c.art && RIG.cast[c.art]) {
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
    const bossArt = b.fighting ? 'boss-rage' : 'boss-calm';
    if (RIG.cast[bossArt]) {
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
  if (S.useRig && RIG.ready) {
    // the skeleton: customization survives every animation
    RIG.draw(ctx, RIG.poseFor(p, p.animT), p.cx, p.y + p.h,
      p.h * p.squash * 1.06, p.face < 0, alpha);
  } else if (S.useArt && SPRITES.ready) {
    // squash is applied to the draw height so landings still punch
    SPRITES.draw(ctx, poseFor(p, p.animT), p.cx, p.y + p.h,
      p.h * p.squash * 1.06, p.face < 0, alpha);
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
  ctx.font = '900 20px system-ui';
  ctx.fillText("WE'RE A FAMILY", 300, CEIL_Y + 56);
  ctx.fillText('PRODUCTIVITY MATTERS', 1180, CEIL_Y + 56);
  ctx.fillText('SYNERGY', 2050, CEIL_Y + 56);
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
$('verTag').textContent = 'v' + VERSION;
SPRITES.load().then(ok => {
  console.log(ok ? 'player sprites loaded: ' + Object.keys(SPRITES.img).length
                 : 'no player sprites');
});
WORLD.load().then(ok => console.log(ok ? 'world art loaded: ' + Object.keys(WORLD.props).length + ' props' : 'no world art'));
RIG.load().then(async ok => {
  if (!ok) { console.log('no rig — falling back to key poses'); return; }
  const n = await RIG.loadVariants();
  const c = await RIG.loadCast(['npc-sami', 'npc-rita', 'npc-omar', 'boss-calm', 'boss-rage']);
  console.log('rig loaded: ' + Object.keys(RIG.img).length + ' parts, ' + n + ' variants, ' + c + ' cast');
  applyLook();
});
initInput(cv);
resize();
requestAnimationFrame(frame);

for (const b of document.querySelectorAll('button')) b.addEventListener('pointerdown', () => SFX.resume());
$('btnStart').onclick = () => { SFX.resume(); SFX.ui(); openCreator(); };
$('btnAgain').onclick = startShift;
$('btnHired').onclick = () => {
  S.look.name = ($('cName').value || 'FIRASS').trim().toUpperCase().slice(0, 12);
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
$('btnHelpBack').onclick = () => { hide('help'); show('title'); };
$('btnShare').onclick = async () => {
  try {
    if (navigator.share) await navigator.share({ text: S.lastShare });
    else { await navigator.clipboard.writeText(S.lastShare); $('btnShare').textContent = 'COPIED'; }
  } catch (e) { /* user cancelled */ }
};

// keyboard shortcut: R restarts, ESC ends the shift
addEventListener('keydown', e => {
  if (S.mode === 'play' && e.key.toLowerCase() === 'r') startShift();
  if (S.mode === 'play' && e.key === 'Escape') endShift(false);
  if (e.key.toLowerCase() === 'v') {                       // cycle the renderers
    if (S.useRig) { S.useRig = false; S.useArt = true; toast('KEY POSES'); }
    else if (S.useArt) { S.useArt = false; toast('GREYBOX'); }
    else { S.useRig = true; S.useArt = true; toast('RIG'); }
  }
});

// Art hookup point. When sprites exist, uncomment and point at the files.
// ART.load({ 'player.idle': { src:'assets/player/idle.png', frames:6, fps:8 } });
window.WE = { S, ART, FX, SPRITES, RIG, applyLook };   // handy in the mobile console
