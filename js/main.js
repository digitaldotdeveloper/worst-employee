// WORST EMPLOYEE — feel test. Game state, loop, camera, renderer, shift report.

import { VERSION, VIEW, FLOOR_Y, LEVEL_W, COL, COFFEE, RANKS, ATTACK } from './config.js';
import { World } from './engine.js';
import { FX } from './fx.js';
import { ART, drawHuman, drawProp, roundRect } from './art.js';
import { IN, initInput, pollInput } from './input.js';
import { ChaosSystem } from './chaos.js';
import { Player } from './player.js';
import { buildOffice, angerStage } from './office.js';

const cv = document.getElementById('game');
const ctx = cv.getContext('2d');
const $ = id => document.getElementById(id);
const HAS_TOUCH = matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0;

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
// GAME FLOW
// ---------------------------------------------------------------
function startShift() {
  S.mode = 'play';
  S.time = 0; S.shiftT = 0;
  S.coins = 0; S.damage = 0; S.destroyed = 0; S.annoyed = 0;
  S.hits = 0; S.playerHits = 0; S.coffees = 0; S.coffeeSpend = 0;
  S.chainsMade = 0; S.bestChain = 0;
  S.productivity = 100; S.anger = 0; S.stageIdx = 0;
  S.speedMul = 1; S.chaosMul = 1; S.boostT = 0;

  S.world = new World();
  S.chaos = new ChaosSystem(S);
  S.world.onImpact = (a, b, e) => S.chaos.onImpact(a, b, e);

  S.player = new Player(120);
  S.world.add(S.player);
  buildOffice(S.world, S);

  FX.clear();
  hide('title'); hide('report'); hide('help');
  show('hud');
  if (HAS_TOUCH) show('touch'); else hide('touch');
  resize();
  toast('CLOCK IN.');
}

function startBossFight() {
  const b = S.boss;
  b.fighting = true;
  b.hp = b.maxHp = 320;
  FX.kick(16, 0.22);
  FX.flash = 1;
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
  S.player.carryPose();

  // coffee machine interaction
  const cm = S.coffeeMachine;
  if (cm && !cm.broken && Math.abs(cm.cx - S.player.cx) < 46 && S.boostT <= 0.01) {
    if (S.player.grounded && Math.abs(S.player.vx) < 40) {
      S.coffees++;
      S.coffeeSpend += COFFEE.capsuleCost;
      S.boostT = COFFEE.duration;
      S.speedMul = COFFEE.speedMul;
      S.chaosMul = COFFEE.chaosMul;
      S.productivity = Math.max(0, S.productivity - 0.4);
      show('boost');
      FX.float(cm.cx, cm.y - 10, '+COFFEE', '#ffd9a8', 13);
      if (S.coffees === 12) toast('"WE SPENT $400 ON COFFEE CAPSULES THIS WEEK."');
    }
  }

  // slow productivity drain while causing trouble
  if (S.chaos.alive) S.productivity = Math.max(0, S.productivity - dt * 3);

  // camera
  const tx = S.player.cx - VIEW.w / 2 + S.player.face * 60;
  S.cam.x += (Math.max(0, Math.min(LEVEL_W - VIEW.w, tx)) - S.cam.x) * Math.min(1, dt * 6);

  FX.step(dt);
  updateHud();
}

function updateHud() {
  $('hCoins').textContent = S.coins.toLocaleString();
  $('hDamage').textContent = '$' + S.damage.toLocaleString();
  $('hProd').textContent = Math.max(0, S.productivity).toFixed(0) + '%';
  const st = angerStage(S.anger);
  $('hAngerStage').textContent = st.name;
  $('hAngerFill').style.width = S.anger + '%';

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
  const camY = (FX.shake ? (Math.random() - 0.5) * FX.shake * 2 : 0);

  ctx.fillStyle = COL.bgFar;
  ctx.fillRect(0, 0, VIEW.w, VIEW.h);

  ctx.save();
  ctx.translate(-camX, -camY);

  drawBackground(camX);

  // floor
  ctx.fillStyle = COL.floor;
  ctx.fillRect(0, FLOOR_Y, LEVEL_W, VIEW.h - FLOOR_Y + 40);
  ctx.strokeStyle = COL.floorLn; ctx.lineWidth = 1;
  for (let x = 0; x < LEVEL_W; x += 60) {
    ctx.beginPath(); ctx.moveTo(x, FLOOR_Y); ctx.lineTo(x - 30, VIEW.h + 40); ctx.stroke();
  }
  ctx.strokeStyle = '#3d4356'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(0, FLOOR_Y); ctx.lineTo(LEVEL_W, FLOOR_Y); ctx.stroke();

  // desks
  for (const d of S.world.statics) {
    ctx.fillStyle = '#39405a';
    roundRect(ctx, d.x, d.y, d.w, d.h, 3); ctx.fill();
    ctx.fillStyle = '#2b3049';
    ctx.fillRect(d.x + 6, d.y + d.h - 3, 8, 3);
    ctx.fillRect(d.x + d.w - 14, d.y + d.h - 3, 8, 3);
    ctx.strokeStyle = 'rgba(0,0,0,.3)'; ctx.lineWidth = 1;
    roundRect(ctx, d.x, d.y, d.w, d.h, 3); ctx.stroke();
  }

  // props
  for (const b of S.world.bodies) {
    if (b.type === 'prop') drawProp(ctx, b, S.time);
  }

  // coworkers
  for (const c of S.coworkers) {
    if (c.dead) continue;
    drawHuman(ctx, c, {
      body: c.mode === 'down' ? COL.npcHurt : COL.npc,
      dark: '#4a4f63', t: c.animT, flip: c.face < 0,
      state: c.mode === 'panic' ? 'run' : 'idle',
      alpha: 1, face: null,
    });
  }

  // boss
  if (S.boss && !S.boss.dead) {
    const b = S.boss;
    drawHuman(ctx, b, {
      body: b.hurtT > 0 ? '#fff' : COL.boss, dark: COL.bossD,
      t: b.animT, flip: b.face < 0,
      state: b.fighting ? 'run' : 'idle',
    });
    if (b.fighting) {
      const w = 90, hp = Math.max(0, b.hp / b.maxHp);
      ctx.fillStyle = 'rgba(0,0,0,.6)'; ctx.fillRect(b.cx - w / 2, b.y - 18, w, 6);
      ctx.fillStyle = '#ff5c5c'; ctx.fillRect(b.cx - w / 2, b.y - 18, w * hp, 6);
    }
    ctx.fillStyle = '#ff9a9a'; ctx.font = '700 9px system-ui'; ctx.textAlign = 'center';
    ctx.fillText('BOSS', b.cx, b.y - 24);
  }

  // player
  const p = S.player;
  drawHuman(ctx, p, {
    body: p.iframes > 0 ? 'rgba(127,209,255,.45)' : COL.player,
    dark: COL.playerD, t: p.animT, flip: p.face < 0,
    state: p.state === 'dodge' ? 'run' : p.state,
    squash: p.squash,
  });

  // attack arc tell
  if (p.atk && p.atk.phase === 'active') {
    const d = p.atk.kind === 'heavy' ? ATTACK.heavy : ATTACK.light[p.atk.step];
    ctx.fillStyle = 'rgba(255,255,255,.20)';
    const bx = p.face > 0 ? p.x + p.w - 6 : p.x - d.reach + 6;
    roundRect(ctx, bx, p.cy - d.hh / 2, d.reach, d.hh, 8); ctx.fill();
  }

  FX.draw(ctx);
  ctx.restore();

  // ceiling vignette + hit flash
  const g = ctx.createLinearGradient(0, 0, 0, 90);
  g.addColorStop(0, 'rgba(0,0,0,.45)'); g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, VIEW.w, 90);
  if (FX.flash > 0) {
    ctx.fillStyle = `rgba(255,90,90,${Math.min(0.5, FX.flash * 0.5)})`;
    ctx.fillRect(0, 0, VIEW.w, VIEW.h);
  }
}

function drawBackground(camX) {
  // back wall
  ctx.fillStyle = COL.bgWall;
  ctx.fillRect(0, 90, LEVEL_W, FLOOR_Y - 90);

  // windows, parallax-free (they are the wall)
  for (let x = 60; x < LEVEL_W; x += 260) {
    ctx.fillStyle = COL.window;
    roundRect(ctx, x, 130, 150, 120, 4); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.05)';
    roundRect(ctx, x + 8, 138, 60, 104, 3); ctx.fill();
    ctx.strokeStyle = COL.bgTrim; ctx.lineWidth = 5;
    roundRect(ctx, x, 130, 150, 120, 4); ctx.stroke();
  }
  // ceiling strip + lights
  ctx.fillStyle = COL.bgTrim;
  ctx.fillRect(0, 60, LEVEL_W, 30);
  for (let x = 120; x < LEVEL_W; x += 300) {
    ctx.fillStyle = 'rgba(255,246,208,.75)';
    roundRect(ctx, x, 78, 100, 8, 4); ctx.fill();
    const g = ctx.createLinearGradient(0, 86, 0, 300);
    g.addColorStop(0, 'rgba(255,246,208,.06)'); g.addColorStop(1, 'rgba(255,246,208,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(x, 86); ctx.lineTo(x + 100, 86);
    ctx.lineTo(x + 160, 320); ctx.lineTo(x - 60, 320);
    ctx.closePath(); ctx.fill();
  }
  // wall signage — comedy is free here
  ctx.fillStyle = 'rgba(255,255,255,.10)';
  ctx.font = '900 26px system-ui'; ctx.textAlign = 'left';
  ctx.fillText("WE'RE A FAMILY", 300, 300);
  ctx.fillText('PRODUCTIVITY MATTERS', 1180, 300);
  ctx.fillText('SYNERGY', 2050, 300);
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

  if (S.mode !== 'play') return;

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
initInput(cv);
resize();
requestAnimationFrame(frame);

$('btnStart').onclick = startShift;
$('btnAgain').onclick = startShift;
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
});

// Art hookup point. When sprites exist, uncomment and point at the files.
// ART.load({ 'player.idle': { src:'assets/player/idle.png', frames:6, fps:8 } });
window.WE = { S, ART, FX };     // handy in the mobile console
