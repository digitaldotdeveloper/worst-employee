// Minimal 2D physics. AABB bodies, gravity, floor, body-vs-body impulses.
// Deliberately not a physics library: zero dependencies, zero cost, and the
// whole thing is small enough to tune by hand for feel.

import { GRAVITY, FLOOR_Y, LEVEL_W } from './config.js';

let nextId = 1;

// How far a shoved piece of furniture creeps per frame. ~0.9px at 60Hz is
// about 55px/s — a quarter of running speed, so it reads as effort.
const PUSH_PER_FRAME = 0.9;

export class Body {
  constructor(o = {}) {
    this.id = nextId++;
    this.x = o.x || 0; this.y = o.y || 0;
    this.w = o.w || 20; this.h = o.h || 20;
    this.vx = 0; this.vy = 0;
    this.angle = 0; this.va = 0;          // visual spin only
    this.mass = o.mass ?? 1;
    this.bounce = o.bounce ?? 0.28;
    this.fric = o.fric ?? 0.86;           // ground friction when resting
    this.air = o.air ?? 0.999;
    this.static = !!o.static;
    this.solid = o.solid ?? true;         // participates in body-body pushes
    this.grounded = false;
    this.type = o.type || 'prop';
    this.kind = o.kind || '';
    this.hp = o.hp ?? 30;
    this.maxHp = this.hp;
    this.value = o.value ?? 100;          // $ of company damage when destroyed
    this.broken = false;
    this.chaosUntil = 0;                  // > now => this thing is a live chain link
    this.chainDepth = 0;
    this.grabbable = o.grabbable ?? true;
    this.held = false;
    this.dead = false;
    this.flash = 0;
    this.sleepT = 0;
    this.asleep = false;
    Object.assign(this, o.extra || {});
  }
  // Waking is explicit. Anything that should disturb a resting object calls
  // this: a hit, a chain ignite, a grab, a throw, or a fast neighbour.
  wake() { this.asleep = false; this.sleepT = 0; }

  get cx() { return this.x + this.w / 2; }
  get cy() { return this.y + this.h / 2; }
  get speed() { return Math.hypot(this.vx, this.vy); }
}

export class World {
  constructor() {
    this.bodies = [];
    this.statics = [];      // platforms/walls: {x,y,w,h}
    this.levelW = LEVEL_W;
    this.time = 0;
    this.onImpact = null;   // (a, b, energy) => void
  }
  add(b) { this.bodies.push(b); return b; }
  addStatic(r) { this.statics.push(r); return r; }
  remove(b) { b.dead = true; }

  step(dt) {
    this.time += dt;
    const bodies = this.bodies;

    for (const b of bodies) {
      if (b.static || b.held || b.dead) continue;

      // SLEEPING. Props spawn touching each other — a monitor and a paper tray
      // share a desk, chairs sit against desks — and the mutual push-apart kept
      // re-injecting velocity that friction never fully killed. The result was
      // the whole office very slowly sliding around on its own, which reads as
      // "running moves everything" even with the player parked 4000px away.
      // A grounded, slow body goes to sleep and STAYS put until something wakes
      // it. Only a hit moves a prop now, which is the actual rule wanted.
      // ONLY PROPS SLEEP. Anything that drives itself — the player, coworkers,
      // the boss — must never be skipped: a sleeping body has its integration
      // skipped entirely, so a resting player simply stops responding to input.
      if (b.type === 'prop') {
        if (b.asleep) { b.vx = 0; b.vy = 0; b.va = 0; continue; }
        if (b.grounded && Math.abs(b.vx) < 7 && Math.abs(b.vy) < 7 && Math.abs(b.va) < 0.5) {
          b.sleepT += dt;
          if (b.sleepT > 0.35) { b.asleep = true; b.vx = 0; b.vy = 0; b.va = 0; continue; }
        } else b.sleepT = 0;
      }

      b.py = b.y;                       // previous top, for one-way platforms
      b.vy += GRAVITY * dt;
      b.vx *= b.air; b.vy *= b.air;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.angle += b.va * dt;
      if (b.flash > 0) b.flash -= dt;

      b.grounded = false;

      // --- static geometry (desks, walls) FIRST, floor last ---
      // Order matters: a static can push a body downward, and the floor clamp
      // has to be the thing that gets the final say or props sink through it.
      for (const s of this.statics) this._vsStatic(b, s);

      // --- floor ---
      if (b.y + b.h >= FLOOR_Y) {
        const impact = b.vy;
        b.y = FLOOR_Y - b.h;
        if (impact > 240) {
          b.vy = -impact * b.bounce;
          this._impact(b, null, impact);
        } else if (b.vy > 0) b.vy = 0;
        b.grounded = true;
        b.vx *= b.fric;
        b.va *= 0.82;
        if (Math.abs(b.va) < 0.4) b.va = 0;
      }

      // --- level bounds ---
      if (b.x < 0) { b.x = 0; b.vx = Math.abs(b.vx) * b.bounce; }
      const maxX = this.levelW - b.w;
      if (b.x > maxX) { b.x = maxX; b.vx = -Math.abs(b.vx) * b.bounce; }
    }

    // --- body vs body ---
    for (let i = 0; i < bodies.length; i++) {
      const a = bodies[i];
      if (a.dead || a.held || !a.solid) continue;
      for (let j = i + 1; j < bodies.length; j++) {
        const b = bodies[j];
        if (b.dead || b.held || !b.solid) continue;
        if (a.static && b.static) continue;
        if (a.asleep && b.asleep) continue;
        this._vsBody(a, b);
      }
    }

    // sweep the dead
    for (let i = bodies.length - 1; i >= 0; i--) if (bodies[i].dead) bodies.splice(i, 1);
  }

  _vsStatic(b, s) {
    if (b.x + b.w <= s.x || b.x >= s.x + s.w || b.y + b.h <= s.y || b.y >= s.y + s.h) return;

    // Desks are one-way: you land ON them, you never get walled in by them.
    // A solid waist-high desk every 320px turns the office into a corridor of
    // blockers and traversal stops feeling good, so they only catch a fall.
    if (s.oneWay) {
      const prevBottom = (b.py ?? b.y) + b.h;
      if (b.vy < 0 || prevBottom > s.y + 6) return;
      b.y = s.y - b.h;
      if (b.vy > 240) this._impact(b, null, b.vy);
      b.vy = 0;
      b.grounded = true;
      b.vx *= b.fric;
      b.va *= 0.82;
      if (Math.abs(b.va) < 0.4) b.va = 0;
      return;
    }

    const ox = (b.x + b.w / 2 < s.x + s.w / 2) ? (s.x - (b.x + b.w)) : (s.x + s.w - b.x);
    const oy = (b.y + b.h / 2 < s.y + s.h / 2) ? (s.y - (b.y + b.h)) : (s.y + s.h - b.y);
    if (Math.abs(ox) < Math.abs(oy)) {
      b.x += ox;
      if (Math.abs(b.vx) > 200) this._impact(b, null, Math.abs(b.vx));
      b.vx = -b.vx * b.bounce;
    } else {
      b.y += oy;
      if (oy < 0) {                      // landed on top
        if (b.vy > 240) this._impact(b, null, b.vy);
        b.grounded = true; b.vx *= b.fric; b.va *= 0.82;
      }
      b.vy = -b.vy * b.bounce;
      if (Math.abs(b.vy) < 60) b.vy = 0;
    }
  }

  _vsBody(a, b) {
    if (a.x + a.w <= b.x || a.x >= b.x + b.w || a.y + a.h <= b.y || a.y >= b.y + b.h) return;

    const pa = a.type === 'player', pb = b.type === 'player';
    const person = x => x.type === 'npc' || x.type === 'boss' || x.type === 'player';

    // PEOPLE ARE NOT PROPS. You walk past colleagues, you do not shoulder-barge
    // them across the floor. Contact between two people resolves to nothing at
    // all — the only way to move someone is to hit them.
    if (person(a) && person(b)) return;

    // Running must not bulldoze the office. Resolving a player/prop overlap by
    // shoving the prop meant it got carried along at running speed for as long
    // as you kept touching it — measured at 2,661px, i.e. the whole floor swept
    // ahead of you. Nothing broke, but everything MOVED, which reads as
    // destruction.
    //
    // So: light clutter has no collision with the player at all (you walk
    // through a mug), and heavy furniture moves the PLAYER, never itself. The
    // only thing that moves a prop is a hit.
    // THE PLAYER DOES NOT COLLIDE WITH PROPS AT ALL.
    //
    // Three attempts got here. Shoving props resolved the overlap by moving
    // them, so they were carried along at running speed — the whole floor swept
    // 2,600px ahead of you. Blocking outright walled you into reception. A slow
    // shove still cost 199px of drift and made crossing the office a chore.
    //
    // In a brawler, furniture is a TARGET, not an obstacle. Attacks still reach
    // props (the swing tests world bodies directly, not physics), thrown props
    // still collide with each other and the floor, and chains still work. The
    // only thing that moves a prop is a hit — which is exactly the rule that was
    // asked for.
    if ((pa || pb) && (a.type === 'prop' || b.type === 'prop')) return;

    const rel = Math.hypot(a.vx - b.vx, a.vy - b.vy);
    const ox = (a.cx < b.cx) ? (b.x - (a.x + a.w)) : (b.x + b.w - a.x);
    const oy = (a.cy < b.cy) ? (b.y - (a.y + a.h)) : (b.y + b.h - a.y);
    const ma = a.static ? 0 : 1 / a.mass;
    const mb = b.static ? 0 : 1 / b.mass;
    const tot = ma + mb;
    if (tot === 0) return;

    if (Math.abs(ox) < Math.abs(oy)) {
      a.x += ox * (ma / tot); b.x -= ox * (mb / tot);
      const va = a.vx, vb = b.vx;
      if (!a.static) a.vx = (vb * mb + va * ma * 0.2) / tot * 0.7;
      if (!b.static) b.vx = (va * ma + vb * mb * 0.2) / tot * 0.7;
    } else {
      a.y += oy * (ma / tot); b.y -= oy * (mb / tot);
      if (oy < 0 && !a.static) { a.grounded = true; a.vy = Math.min(a.vy, 0); }
      else if (!b.static) { b.grounded = true; b.vy = Math.min(b.vy, 0); }
      if (!a.static) a.vy *= 0.4;
      if (!b.static) b.vy *= 0.4;
    }

    if (rel > 24) { a.wake(); b.wake(); }
    if (rel > 90) this._impact(a, b, rel);
  }

  _impact(a, b, energy) { if (this.onImpact) this.onImpact(a, b, energy); }
}

export function rectsOverlap(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}
