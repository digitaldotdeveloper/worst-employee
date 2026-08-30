// The office: props, coworkers, the boss, and the level layout.
// Script section 10 — objects must interact physically, not decorate.

import { Body } from './engine.js';
import { FLOOR_Y, LEVEL_W, COL, ANGER_STAGES } from './config.js';
import { FX } from './fx.js';

// kind -> { w,h,mass,hp,value,label,color }
export const PROPS = {
  chair:    { w:28, h:34, mass:1.6, hp:34,  value:180,  label:'CHAIR',   color:'#5f6a86' },
  monitor:  { w:30, h:24, mass:1.1, hp:22,  value:420,  label:'PC',      color:'#4d5570' },
  printer:  { w:40, h:28, mass:3.0, hp:48,  value:1250, label:'PRINTER', color:'#6a7190' },
  phone:    { w:16, h:12, mass:0.5, hp:14,  value:90,   label:'',        color:'#576080' },
  mug:      { w:14, h:14, mass:0.4, hp:8,   value:12,   label:'',        color:'#8a5a2b' },
  bin:      { w:24, h:26, mass:0.9, hp:20,  value:40,   label:'BIN',     color:'#4a5169' },
  plant:    { w:22, h:38, mass:1.2, hp:18,  value:70,   label:'',        color:'#4a6b52' },
  extinguisher:{ w:16, h:34, mass:2.2, hp:26, value:150, label:'',       color:'#a3474a' },
  stack:    { w:20, h:16, mass:0.5, hp:6,   value:30,   label:'',        color:'#d8dbe6' },
  cooler:   { w:26, h:52, mass:4.0, hp:60,  value:340,  label:'WATER',   color:'#5a7fa0' },
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
    this.name = name;
    this.face = Math.random() < 0.5 ? -1 : 1;
    this.mode = 'work';          // work | wander | panic | down
    this.timer = 1 + Math.random() * 3;
    this.downT = 0;
    this.annoyed = false;
    this.animT = Math.random() * 4;
    this.label = 'COWORKER';
  }

  update(dt, s) {
    this.animT += dt;
    if (this.mode === 'down') {
      this.downT -= dt;
      this.angle += this.va * dt * 0.3;
      if (this.downT <= 0 && this.grounded) {
        this.mode = 'wander'; this.angle = 0; this.va = 0; this.timer = 1;
      }
      return;
    }

    this.timer -= dt;
    const panic = s.chaos.alive || s.anger > 60;
    if (panic && this.mode !== 'panic') { this.mode = 'panic'; this.timer = 2 + Math.random() * 2; }

    if (this.mode === 'panic') {
      const away = Math.sign(this.cx - s.player.cx) || 1;
      this.face = away;
      this.vx += away * 900 * dt;
      this.vx = Math.max(-260, Math.min(260, this.vx));
      if (this.timer <= 0) { this.mode = 'wander'; this.timer = 2; }
    } else if (this.mode === 'wander') {
      this.vx += this.face * 320 * dt;
      this.vx = Math.max(-90, Math.min(90, this.vx));
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

  knock(s) {
    if (this.mode === 'down') return;
    this.mode = 'down';
    this.downT = 1.1 + Math.random() * 0.8;
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
  }

  update(dt, s) {
    this.animT += dt;
    if (this.hurtT > 0) this.hurtT -= dt;

    if (!this.fighting) {
      // patrols near his office and glares
      const d = this.homeX - this.cx;
      if (Math.abs(d) > 40) { this.vx += Math.sign(d) * 300 * dt; this.face = Math.sign(d); }
      else this.vx *= 0.85;
      this.vx = Math.max(-110, Math.min(110, this.vx));
      return;
    }

    // ---- boss fight ----
    const dx = s.player.cx - this.cx;
    this.face = Math.sign(dx) || 1;
    this.attackCd -= dt;

    if (Math.abs(dx) > 90) {
      this.vx += this.face * 620 * dt;
      this.vx = Math.max(-235, Math.min(235, this.vx));
    } else {
      this.vx *= 0.86;
      if (this.attackCd <= 0) {
        this.attackCd = 1.15 + Math.random() * 0.7;
        this.swing(s);
      }
    }
  }

  swing(s) {
    const p = s.player;
    const box = { x: this.face > 0 ? this.x + this.w : this.x - 62, y: this.y + 10, w: 62, h: 50 };
    FX.spark(this.cx + this.face * 34, this.cy, 10, '#ff9a9a', 300);
    FX.kick(5, 0.03);
    if (p.iframes > 0) { FX.float(p.cx, p.y - 10, 'DODGED', '#7fd1ff', 13); return; }
    if (p.x < box.x + box.w && p.x + p.w > box.x && p.y < box.y + box.h && p.y + p.h > box.y) {
      p.vx += this.face * 520; p.vy -= 240;
      s.playerHits++;
      FX.kick(9, 0.09);
      FX.float(p.cx, p.y - 10, 'OW', '#ff7b7b', 15);
    }
  }
}

// ---------------------------------------------------------------
// Level build
// ---------------------------------------------------------------
export function buildOffice(world, s) {
  world.levelW = LEVEL_W;
  world.statics.length = 0;

  const desks = [];
  // a row of desks down the floor; each is solid, with a monitor + chair + mug on it
  for (let i = 0; i < 7; i++) {
    const x = 220 + i * 320;
    const dw = 120, dh = 40;
    const desk = { x, y: FLOOR_Y - dh, w: dw, h: dh, label: 'DESK', oneWay: true };
    world.addStatic(desk);
    desks.push(desk);

    world.add(makeProp('monitor', x + 12, desk.y - PROPS.monitor.h));
    world.add(makeProp('mug', x + 74, desk.y - PROPS.mug.h));
    world.add(makeProp('chair', x + 140, FLOOR_Y - PROPS.chair.h)); // clear of the desk collider
    if (i % 2 === 0) world.add(makeProp('stack', x + 92, desk.y - PROPS.stack.h));
    if (i % 3 === 1) world.add(makeProp('phone', x + 40, desk.y - PROPS.phone.h));
  }

  // scattered floor props
  const floorProps = [
    ['bin', 150], ['plant', 480], ['printer', 640], ['extinguisher', 860],
    ['bin', 1080], ['printer', 1320], ['plant', 1580], ['bin', 1760],
    ['extinguisher', 2020], ['printer', 2180], ['plant', 2380],
  ];
  for (const [kind, x] of floorProps) world.add(makeProp(kind, x));

  // coffee machine + water cooler — the running joke and the boost
  const coffee = makeProp('cooler', 760);
  coffee.label = 'COFFEE'; coffee.color = '#7a5a3a'; coffee.kind = 'coffee';
  coffee.grabbable = false; coffee.hp = 90; coffee.value = 900;
  world.add(coffee);
  s.coffeeMachine = coffee;

  const water = makeProp('cooler', 1500);
  water.kind = 'water';
  world.add(water);

  // coworkers
  const names = ['SAMI', 'RITA', 'OMAR', 'LEA', 'KARIM', 'NOUR'];
  s.coworkers = [];
  for (let i = 0; i < names.length; i++) {
    const c = new Coworker(340 + i * 360, names[i]);
    world.add(c); s.coworkers.push(c);
  }

  // boss
  const boss = new Boss(2320);
  world.add(boss);
  s.boss = boss;

  return { desks };
}

export function angerStage(v) {
  let st = ANGER_STAGES[0];
  for (const a of ANGER_STAGES) if (v >= a.at) st = a;
  return st;
}
