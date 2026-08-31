// The office: props, coworkers, the boss, and the level layout.
// Script section 10 — objects must interact physically, not decorate.

import { Body } from './engine.js';
import { FLOOR_Y, LEVEL_W, COL, ANGER_STAGES, ROOMS, FLOORS, FLOOR_ROOMS,
         FLOOR_STAFF, CUR } from './config.js';
import { FX } from './fx.js';
import { SFX } from './audio.js';

// kind -> { w,h,mass,hp,value,label,color }
export const PROPS = {
  chair:    { w:26, h:32, mass:1.6, hp:34,  value:180,  label:'CHAIR',   color:'#5f6a86' },
  monitor:  { w:26, h:20, mass:1.1, hp:22,  value:420,  label:'PC',      color:'#4d5570' },
  printer:  { w:34, h:20, mass:3.0, hp:48,  value:1250, label:'PRINTER', color:'#6a7190' },
  phone:    { w:14, h:8, mass:0.5, hp:14,  value:90,   label:'',        color:'#576080' },
  mug:      { w:9, h:9, mass:0.4, hp:8,   value:12,   label:'',        color:'#8a5a2b' },
  bin:      { w:20, h:22, mass:0.9, hp:20,  value:40,   label:'BIN',     color:'#4a5169' },
  plant:    { w:20, h:30, mass:1.2, hp:18,  value:70,   label:'',        color:'#4a6b52' },
  extinguisher:{ w:13, h:27, mass:2.2, hp:26, value:150, label:'',       color:'#a3474a' },
  stack:    { w:18, h:7, mass:0.5, hp:6,   value:30,   label:'',        color:'#d8dbe6' },
  cooler:   { w:22, h:44, mass:4.0, hp:60,  value:340,  label:'WATER',   color:'#5a7fa0' },
  cabinet:  { w:28, h:46, mass:5.5, hp:90,  value:620,  label:'FILES',   color:'#6a7086' },
  coffee:   { w:22, h:38, mass:4.5, hp:90,  value:900,  label:'COFFEE',  color:'#7a5a3a' },
};

export function makeProp(kind, x, y) {
  const d = PROPS[kind];
  const b = new Body({ x, y: y ?? (FLOOR_Y - d.h), w: d.w, h: d.h,
    mass: d.mass, hp: d.hp, value: d.value, type: 'prop', kind, bounce: 0.34 });
  b.label = d.label; b.color = d.color;
  return b;
}

export class Coworker extends Body {
  constructor(x, name) {
    super({ x, y: FLOOR_Y - 58, w: 30, h: 58, mass: 2.4, hp: 60, value: 0,
      type: 'npc', kind: 'coworker', bounce: 0.1, fric: 1 });
    this.hp = 100; this.maxHp = 100;   // people are not props: they wear down
    this.hitFlash = 0;
    this.name = name;
    this.face = Math.random() < 0.5 ? -1 : 1;
    this.mode = 'work';          // work | wander | panic | down
    this.timer = 1 + Math.random() * 3;
    this.downT = 0;
    this.annoyed = false;
    this.animT = Math.random() * 4;
    this.label = 'COWORKER';
    this.art = null;          // set by buildOffice
    this.hurtT = 0;
    this.annoyCd = 0;   // cannot be pestered again instantly
    this.rage = 0;      // how much of this they have taken
    this.swingCd = 0;
    this.fighting = false;
    this.annoyed2 = 0;  // how many times this one has put up with you
  }

  update(dt, s) {
    // Animation timers tick before any behaviour branch — several of those
    // branches `return` early, and a timer that only runs on some frames
    // leaves a character stuck mid-swing.
    if (this.sprayHold > 0) this.sprayHold -= dt;
    if (this.talkT > 0) this.talkT -= dt;
    if (this.pointT > 0) this.pointT -= dt;
    if (this.swingT > 0) {
      const was = this.swingT;
      this.swingT -= dt;
      if (was > 0.16 && this.swingT <= 0.16) this.swing(s);   // contact frame
      if (this.swingT < 0) this.swingT = 0;
    }
    this.animT += dt;
    if (this.hurtT > 0) this.hurtT -= dt;
    if (s.story && s.story.active) { this.vx *= 0.7; return; }
    if (this.annoyCd > 0) this.annoyCd -= dt;
    if (this.swingCd > 0) this.swingCd -= dt;
    if (this.hitFlash > 0) this.hitFlash -= dt;
    if (this.held) { this.vx = 0; return; }
    if (this.mode === 'down') {
      this.downT -= dt;
      this.angle += this.va * dt * 0.3;
      if (this.downT <= 0 && this.grounded) {
        this.angle = 0; this.va = 0;
        // They get up. If they have taken enough, they get up ANGRY.
        if (this.rage >= 2) {
          this.fighting = true; this.mode = 'fight'; this.timer = 9;
          if (s.onFightBack) s.onFightBack(this);
        } else { this.mode = 'wander'; this.timer = 1; }
      }
      return;
    }

    // FIGHTING BACK. Push someone far enough and they stop running away and
    // come for you instead. It is an office, not a shooting gallery.
    if (this.fighting) {
      const dx = s.player.cx - this.cx;
      this.face = Math.sign(dx) || 1;
      this.timer -= dt;
      if (this.timer <= 0) { this.fighting = false; this.rage = 0; this.mode = 'wander'; return; }
      if (Math.abs(dx) > 46) {
        this.vx += this.face * 620 * dt;
        this.vx = Math.max(-170, Math.min(170, this.vx));
      } else {
        this.vx *= 0.8;
        // Start a WIND-UP, do not hit. The blow itself fires out of the timer
        // below, 0.26s later. An instant hit is not a fight, it is a tax.
        if (this.swingCd <= 0 && this.swingT <= 0) { this.swingCd = 1.35; this.swingT = 0.42; }
      }
      return;
    }

    this.timer -= dt;
    const panic = s.chaos.alive || s.anger > 60;
    if (panic && this.mode !== 'panic') {
      this.mode = 'panic';
      this.timer = 2 + Math.random() * 2;
      // Not everyone screams at once — a third of them, or the room turns into
      // a single wall of noise the moment a chain starts.
      if (Math.random() < 0.34) SFX.voice(this.name, 'scream', 0.7);
    }

    // Sitting down at your own desk. Standing bolt upright "at" a desk was the
    // single most obviously fake thing on the floor.
    this.seated = this.mode === 'work' && this.deskX != null
      && Math.abs(this.cx - this.deskX) < 60 && this.grounded;

    if (this.mode === 'panic') {
      const away = Math.sign(this.cx - s.player.cx) || 1;
      this.face = away;
      this.vx += away * 900 * dt;
      this.vx = Math.max(-190, Math.min(190, this.vx));
      if (this.timer <= 0) { this.mode = 'wander'; this.timer = 2; }
    } else if (this.mode === 'wander') {
      this.vx += this.face * 320 * dt;
      this.vx = Math.max(-64, Math.min(64, this.vx));
      if (this.timer <= 0) {
        this.timer = 1.5 + Math.random() * 3;
        this.mode = Math.random() < 0.5 ? 'work' : 'wander';
        this.face = Math.random() < 0.5 ? -1 : 1;
      }
    } else {
      this.vx *= 0.82;
      if (this.timer <= 0) { this.mode = 'wander'; this.timer = 2 + Math.random() * 3; }
    }
  }

  // Downtime scales with the blow. A chain tick drops you briefly; a hammer
  // flattens you. A re-knock EXTENDS the stay rather than being ignored, or
  // combo beats 2-5 land on a downed body and visibly do nothing.
  // Being hit builds rage. Three real blows and they turn round.
  provoke(s, amount = 1) {
    if (this.held) return;
    // Rage builds even while they are ON THE FLOOR. Knocking someone down used
    // to reset the counter in practice — they spent the whole fight flat, so
    // they could never reach the point of getting up angry. Now they do.
    this.rage += amount;
    if (this.mode === 'down') return;
    // FREE ROAM IS A BRAWL. There is no shift to keep and nobody to impress, so
    // the floor does not politely take turns: the first person you touch turns,
    // and the whole room turns with them, and they stay turned. In a mission
    // they still need two real blows each, because a mission is a place you are
    // pretending to work.
    const need = (s.freeForAll && !this.isManager) ? 1 : 2;
    if (this.rage >= need && !this.fighting) {
      this.fighting = true;
      this.mode = 'fight';
      this.timer = s.freeForAll ? 600 : 9;
      if (s.onFightBack) s.onFightBack(this);
      if (s.freeForAll) {
        // Set them directly rather than calling provoke, or this recurses
        // through the whole floor once per person.
        let joined = 0;
        for (const c of s.coworkers) {
          if (c === this || c.dead || c.held || c.fighting || c.visible === false) continue;
          if (c.isManager) continue;              // he has his own arc; see main.js
          c.rage = Math.max(c.rage, need);
          c.fighting = true;
          c.timer = 600;
          if (c.mode !== 'down') c.mode = 'fight';
          joined++;
        }
        if (joined && s.onFloorTurns) s.onFloorTurns(joined);
      }
    }
  }

  swing(s) {
    const p = s.player;
    const box = { x: this.face > 0 ? this.x + this.w : this.x - 44, y: this.y + 8, w: 44, h: 46 };
    FX.spark(this.cx + this.face * 26, this.cy, 7, '#ffb3b3', 220);
    SFX.whiff();
    if (p.iframes > 0) { FX.float(p.cx, p.y - 10, 'DODGED', '#7fd1ff', 12); return; }
    if (p.x < box.x + box.w && p.x + p.w > box.x && p.y < box.y + box.h && p.y + p.h > box.y) {
      p.vx += this.face * 300; p.vy -= 120;
      const floored = p.takeHit(s, 14);
      FX.kick(floored ? 12 : 6, floored ? 0.11 : 0.06);
      SFX.hit(floored ? 0.9 : 0.6);
      SFX.voice('player', 'hurt', 0.5);
      FX.float(p.cx, p.y - 10, floored ? 'DOWN' : 'OW', '#ff7b7b', floored ? 16 : 13);
    }
  }

  // TAKING A HIT IS NOT THE SAME AS GOING DOWN. A blow staggers them and eats
  // their health; they only hit the floor when it runs out. One punch used to
  // flatten anybody, which made every fight one frame long.
  hit(s, dmg = 20) {
    if (this.mode === 'down') { this.downT = Math.max(this.downT, 0.6); return; }
    this.hp -= dmg;
    this.hurtT = 0.28;
    this.hitFlash = 0.16;
    this.vx += Math.sign(this.cx - s.player.cx || 1) * (40 + dmg * 2);
    if (this.hp > 0) {
      // THEY MAKE A NOISE WHEN YOU HIT THEM. The voice used to live only in
      // knock(), so a colleague absorbed a whole combo in total silence and
      // then yelped once, on the floor. SFX.voice rate-limits per person, so
      // a five-beat string does not stack five yelps.
      SFX.voice(this.name, dmg > 24 ? 'scream' : 'hurt', Math.min(1, 0.35 + dmg / 50));
      this.provoke(s, 1);
      return false;
    }
    this.knock(s, dmg);
    return true;
  }

  knock(s, dmg = 38) {
    const t = 1.1 + Math.min(1.6, dmg / 38 * 1.6) + Math.random() * 0.3;
    if (this.mode === 'down') { this.downT = Math.max(this.downT, t); return; }
    this.mode = 'down';
    this.hurtT = 0.3;
    this.downT = t;
    this.hp = Math.round(this.maxHp * 0.55);   // they get up hurt, not fresh
    // A real thumping gets a scream; a shove gets a yelp. The voice module
    // rate-limits per person, so a combo does not stack four of them.
    SFX.voice(this.name, dmg > 45 ? 'scream' : 'hurt', Math.min(1, dmg / 60));
    this.va = (Math.random() - 0.5) * 12;
    if (!this.annoyed) { this.annoyed = true; s.annoyed++; }
  }
}

export class Boss extends Body {
  constructor(x) {
    super({ x, y: FLOOR_Y - 72, w: 40, h: 72, mass: 6, hp: 320, value: 0,
      type: 'boss', kind: 'boss', bounce: 0.05, fric: 1, grabbable: false });
    this.face = -1;
    this.stage = 0;
    this.fighting = false;
    this.attackCd = 1.6;
    this.hurtT = 0;
    this.animT = 0;
    this.label = 'BOSS';
    this.homeX = x;
    this.swingT = 0;
    this.defeated = false;
  }

  update(dt, s) {
    this.animT += dt;

    // Footsteps, paced off distance travelled rather than a timer, so they stay
    // in step whether he is patrolling or charging. Above the cutscene return
    // below on purpose - he walks in those too.
    this._stepPhase = (this._stepPhase || 0) + Math.abs(this.vx) * dt;
    const stride = this.fighting ? 46 : 58;   // more urgency, shorter stride
    if (this._stepPhase >= stride) {
      this._stepPhase = 0;
      if (this.grounded !== false && !this.defeated) {
        SFX.step(this.fighting ? 1.15 : 0.8, this.cx - s.player.cx);
      }
    }

    if (this.hurtT > 0) this.hurtT -= dt;
    if (s.story && s.story.active) { this.vx *= 0.7; return; }
    if (this.swingT > 0) this.swingT -= dt;

    if (!this.fighting) {
      // patrols near his office and glares
      const d = this.homeX - this.cx;
      if (Math.abs(d) > 40) { this.vx += Math.sign(d) * 300 * dt; this.face = Math.sign(d); }
      else this.vx *= 0.85;
      this.vx = Math.max(-78, Math.min(78, this.vx));
      return;
    }

    // ---- boss fight ----
    const dx = s.player.cx - this.cx;
    this.face = Math.sign(dx) || 1;
    this.attackCd -= dt;

    if (Math.abs(dx) > 90) {
      this.vx += this.face * 620 * dt;
      this.vx = Math.max(-172, Math.min(172, this.vx));
    } else {
      this.vx *= 0.86;
      if (this.attackCd <= 0) {
        this.attackCd = 1.5 + Math.random() * 0.8;
        this.swingT = 0.32;
        this.swing(s);
      }
    }
  }

  swing(s) {
    const p = s.player;
    const box = { x: this.face > 0 ? this.x + this.w : this.x - 62, y: this.y + 10, w: 62, h: 50 };
    FX.spark(this.cx + this.face * 34, this.cy, 10, '#ff9a9a', 300);
    FX.kick(5, 0.03);
    SFX.whiff();
    if (p.iframes > 0) { FX.float(p.cx, p.y - 10, 'DODGED', '#7fd1ff', 13); return; }
    if (p.x < box.x + box.w && p.x + p.w > box.x && p.y < box.y + box.h && p.y + p.h > box.y) {
      p.vx += this.face * 520; p.vy -= 240;
      const bossFloored = p.takeHit(s, 26);
      FX.kick(bossFloored ? 15 : 9, bossFloored ? 0.14 : 0.09);
      SFX.hit(bossFloored ? 1 : 0.9);
      SFX.voice('player', 'hurt', 0.8);
      FX.float(p.cx, p.y - 10, bossFloored ? 'FLOORED' : 'OW', '#ff7b7b', bossFloored ? 17 : 15);
    }
  }
}

// ---------------------------------------------------------------
// Level build
//
// Props used to be sprinkled along one long corridor at arbitrary x values,
// which is exactly why the office read as unarranged: there was no structure to
// arrange them around. Now every room has a purpose and its own furniture
// rules, and a workstation is a single unit — desk, monitor, keyboard, mug,
// papers, chair — placed as a unit rather than as six independent props.
// ---------------------------------------------------------------

const DESK_W = 84, DESK_H = 38;

function desk(world, x) {
  const d = { x, y: FLOOR_Y - DESK_H, w: DESK_W, h: DESK_H, label: 'DESK', oneWay: true };
  world.addStatic(d);
  return d;
}

// One tidy workstation. Everything sits ON the desk surface at d.y, so nothing
// looks sunk into the top, and the chair is tucked in front rather than dumped
// on the floor beside it.
function workstation(world, x, opt = {}) {
  const d = desk(world, x);
  const top = d.y;
  world.add(makeProp('monitor', x + 8, top - PROPS.monitor.h));
  if (opt.keyboard !== false) world.add(makeProp('stack', x + 38, top - PROPS.stack.h));
  world.add(makeProp('mug', x + 64, top - PROPS.mug.h));
  if (opt.phone) world.add(makeProp('phone', x + 24, top - PROPS.phone.h));
  world.add(makeProp('chair', x + 34, FLOOR_Y - PROPS.chair.h));
  if (opt.bin) world.add(makeProp('bin', x + DESK_W + 12));
  return d;
}

// The lift. A prop you cannot break, that you ride by pressing UP next to it.
function lift(world, s, x) {
  const b = makeProp('cabinet', x);
  b.kind = 'lift'; b.label = 'LIFT';
  b.w = 46; b.h = 96; b.y = FLOOR_Y - 96;
  b.grabbable = false; b.static = true; b.solid = false;
  b.hp = 1e9; b.value = 0; b.isLift = true;
  world.add(b);
  s.lift = b;
  return b;
}

// ---------------------------------------------------------------
// FURNISHING BY ROOM KIND.
//
// Floors 12 and 13 are hand-built because they carry the story — your desk, the
// coffee machine the game jokes about, the boss's office. Every OTHER floor is
// generated from the room list in config, because eight hand-written build
// functions is how a building stops being worth adding rooms to.
//
// Each recipe fills a span with the furniture that room would actually have.
// Spacing is derived from the span so a wide room gets more desks rather than
// the same desks further apart — an empty middle reads as unfinished, and
// "unarranged" was the note on the very first version of floor 12.
// ---------------------------------------------------------------
function furnish(world, s, room) {
  const P = (kind, x) => world.add(makeProp(kind, x));
  const span = room.x1 - room.x0;
  const at = f => room.x0 + span * f;

  switch (room.kind) {
    case 'lobby':
      P('plant', at(0.25)); P('plant', at(0.75)); P('bin', at(0.5));
      break;

    case 'openplan': {
      // one workstation per ~380px, never fewer than two in a real room
      const n = Math.max(2, Math.round(span / 380));
      for (let i = 0; i < n; i++) {
        const x = room.x0 + span * ((i + 0.5) / n);
        workstation(world, x, { phone: i % 2 === 0, bin: i % 2 === 1 });
      }
      P('printer', at(0.5));
      if (span > 900) P('cabinet', at(0.9));
      P('extinguisher', room.x1 - 40);
      break;
    }

    case 'office': {
      // one person's room: a big desk, status objects, nothing shared
      const d = desk(world, at(0.45));
      P('monitor', at(0.45) + 16); P('stack', at(0.6)); P('phone', at(0.72));
      world.add(makeProp('chair', at(0.32), FLOOR_Y - PROPS.chair.h));
      P('cabinet', at(0.15)); P('plant', at(0.88));
      return d;
    }

    case 'meeting': {
      const tables = Math.max(2, Math.round(span / 220));
      for (let i = 0; i < tables; i++) desk(world, room.x0 + span * ((i + 0.5) / tables));
      for (let i = 0; i < tables + 2; i++) {
        world.add(makeProp('chair', room.x0 + span * (i / (tables + 1)), FLOOR_Y - PROPS.chair.h));
      }
      P('mug', at(0.3)); P('stack', at(0.5)); P('mug', at(0.7));
      P('plant', room.x1 - 60);
      break;
    }

    case 'kitchen': {
      const c = makeProp('coffee', at(0.2)); c.grabbable = false; world.add(c);
      if (!s.coffeeMachine) s.coffeeMachine = c;
      const w = makeProp('cooler', at(0.32)); w.isWater = true; world.add(w);
      desk(world, at(0.55));
      P('mug', at(0.55)); P('mug', at(0.6)); P('stack', at(0.66));
      world.add(makeProp('chair', at(0.48), FLOOR_Y - PROPS.chair.h));
      world.add(makeProp('chair', at(0.68), FLOOR_Y - PROPS.chair.h));
      P('bin', at(0.82)); P('plant', at(0.92));
      break;
    }

    case 'server':
      // racks read as cabinets; nothing here is comfortable and nothing is yours
      for (let i = 0; i < Math.max(3, Math.round(span / 160)); i++) {
        P('cabinet', room.x0 + span * ((i + 0.5) / Math.max(3, Math.round(span / 160))));
      }
      P('extinguisher', room.x1 - 50);
      break;

    case 'archive':
      for (let i = 0; i < Math.max(2, Math.round(span / 150)); i++) {
        P('cabinet', room.x0 + span * ((i + 0.5) / Math.max(2, Math.round(span / 150))));
      }
      P('stack', at(0.3)); P('stack', at(0.7));
      break;

    case 'park':
      // No desks. The joke is that it is the only floor with nothing to ruin,
      // which is also why it is the one you are not allowed on.
      P('bin', at(0.15)); P('bin', at(0.6));
      P('extinguisher', at(0.35)); P('extinguisher', at(0.85));
      break;

    case 'empty':
    default:
      break;
  }
  return null;
}

// A whole floor from its room list. Returns anything a caller needs to keep.
function buildGeneric(world, s, F, floorId) {
  world.statics.length = 0;
  s.coworkers = [];
  const rooms = FLOOR_ROOMS[floorId] || [];
  for (const r of rooms) furnish(world, s, r);

  for (const [name, title, art, roomId] of (FLOOR_STAFF[floorId] || [])) {
    const r = rooms.find(x => x.id === roomId) || rooms[0];
    if (!r) continue;
    const x = r.x0 + (r.x1 - r.x0) * 0.5;
    const c = new Coworker(x, name);
    c.title = title; c.art = art; c.homeX = x; c.deskX = x;
    world.add(c); s.coworkers.push(c);
  }

  lift(world, s, F.liftX);
  s.boss = null;
  return {};
}

export function buildOffice(world, s, floorId = 'ops') {
  const F = FLOORS[floorId] || FLOORS.ops;
  CUR.rooms = FLOOR_ROOMS[floorId] || FLOOR_ROOMS.ops;
  CUR.floor = floorId;
  s.floor = floorId;
  world.levelW = F.w;
  if (floorId === 'exec') return buildExec(world, s, F);
  // Floors 12 and 13 are hand-built because they carry the story. Everything
  // else is generated from its room list.
  if (floorId !== 'ops') return buildGeneric(world, s, F, floorId);
  world.levelW = LEVEL_W;
  world.statics.length = 0;
  s.coworkers = [];

  const P = (kind, x) => world.add(makeProp(kind, x));

  // ── RECEPTION ─ sparse and tidy: the bit visitors see ──────────────────
  P('plant', 90);
  P('cabinet', 170);
  P('plant', 470);
  P('bin', 560);
  const waterR = makeProp('cooler', 380); waterR.isWater = true; world.add(waterR);

  // ── OPEN PLAN ─ four workstations in a row, service kit between them ───
  // Plus YOURS, at the head of the row next to the bin and the cooler, which is
  // the desk you give the new person. The tour used to point at Sami's.
  const mine = workstation(world, 600, { phone: false });
  mine.isPlayerDesk = true;
  mine.label = 'YOUR DESK';
  s.playerDesk = mine;

  const stations = [740, 1060, 1500, 1820];
  stations.forEach((x, i) => workstation(world, x, { phone: i % 2 === 0, bin: i % 2 === 1 }));
  P('printer', 940);
  P('cabinet', 1400);
  P('extinguisher', 1392);
  P('printer', 1740);
  P('plant', 2100);

  // ── BREAK ROOM ─ coffee, water, a table, mess ─────────────────────────
  const coffee = makeProp('coffee', 2260);
  coffee.grabbable = false;
  world.add(coffee);
  s.coffeeMachine = coffee;
  const waterB = makeProp('cooler', 2340); waterB.isWater = true; world.add(waterB);
  const table = desk(world, 2480);
  P('mug', 2500); P('mug', 2540); P('stack', 2570);
  world.add(makeProp('chair', 2460, FLOOR_Y - PROPS.chair.h));
  world.add(makeProp('chair', 2620, FLOOR_Y - PROPS.chair.h));
  P('bin', 2700); P('plant', 2830);

  // ── MEETING ROOM ─ one long table, chairs down both sides ─────────────
  desk(world, 2990); desk(world, 3110);
  for (const cx of [2970, 3060, 3150, 3240]) {
    world.add(makeProp('chair', cx, FLOOR_Y - PROPS.chair.h));
  }
  P('mug', 3010); P('stack', 3080); P('mug', 3160);
  P('plant', 3330); P('cabinet', 3420);

  // ── BOSS'S OFFICE ─ big desk, status objects, nothing shared ──────────
  const bossDesk = desk(world, 3760);
  P('monitor', 3776); P('stack', 3830); P('phone', 3866);
  world.add(makeProp('chair', 3720, FLOOR_Y - PROPS.chair.h));
  P('cabinet', 3660);
  P('plant', 4020);
  P('extinguisher', 4090);
  P('bin', 4160);

  // ── the cast, seated where they belong ────────────────────────────────
  // Titles matter: ruining a SENIOR DEVELOPER's day is funnier than ruining
  // "coworker 3", and it tells you who is worth bothering.
  const staff = [
    ['SAMI',  'SENIOR DEVELOPER', 'npc-sami', 800],
    ['RITA',  'ACCOUNTS',         'npc-rita', 1120],
    ['OMAR',  'IT SUPPORT',       'npc-omar', 1560],
    ['LEA',   'MARKETING',        'npc-rita', 1880],
    ['KARIM', 'INTERN',           'npc-sami', 2560],   // break room
    ['NOUR',  'HR',               'npc-omar', 3070],   // meeting room
  ];
  for (const [name, title, art, x] of staff) {
    const c = new Coworker(x, name);
    c.title = title;
    c.art = art;
    c.homeX = x;                    // they drift, but they belong somewhere
    c.deskX = x;                    // and this is the desk they belong AT
    world.add(c); s.coworkers.push(c);
  }

  lift(world, s, F.liftX);

  // The boss is NOT here. He is on 13, which is the whole point: after the tour
  // you don't see him again until you can get up there.
  s.boss = null;

  return {};
}

// ---------------------------------------------------------------
// FLOOR 13 — where the money is. Fewer people, better furniture, and the man
// himself. Everything up here is worth more to break.
// ---------------------------------------------------------------
function buildExec(world, s, F) {
  world.statics.length = 0;
  s.coworkers = [];
  const P = (kind, x) => world.add(makeProp(kind, x));

  lift(world, s, F.liftX);

  // lift lobby — deliberately empty and expensive-looking
  P('plant', 260); P('plant', 430);

  // boardroom — one enormous table, twelve chairs, nothing useful
  for (let i = 0; i < 5; i++) desk(world, 640 + i * 120);
  for (let i = 0; i < 8; i++) {
    world.add(makeProp('chair', 620 + i * 120, FLOOR_Y - PROPS.chair.h));
  }
  P('stack', 760); P('mug', 900); P('stack', 1080); P('mug', 1220);
  P('monitor', 1000);
  P('plant', 1440);

  // the executive assistant, guarding the door
  const pa = new Coworker(1660, 'DALIA');
  pa.title = 'EXECUTIVE ASSISTANT';
  pa.art = 'npc-rita';
  pa.homeX = 1660;
  world.add(pa); s.coworkers.push(pa);
  workstation(world, 1560, { phone: true });
  P('cabinet', 1730);
  P('printer', 1900);

  // the boss's office
  const bd = desk(world, 2180);
  P('monitor', 2196); P('stack', 2250); P('phone', 2286);
  world.add(makeProp('chair', 2140, FLOOR_Y - PROPS.chair.h));
  P('cabinet', 2080);
  P('plant', 2420);
  P('extinguisher', 2500);
  P('coffee', 2340);

  const boss = new Boss(2300);
  world.add(boss);
  s.boss = boss;
  return {};
}

export function angerStage(v) {
  let st = ANGER_STAGES[0];
  for (const a of ANGER_STAGES) if (v >= a.at) st = a;
  return st;
}
