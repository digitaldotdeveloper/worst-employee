// Minimal 2D physics. AABB bodies, gravity, floor, body-vs-body impulses.
// Deliberately not a physics library: zero dependencies, zero cost, and the
// whole thing is small enough to tune by hand for feel.

import { GRAVITY, FLOOR_Y, LEVEL_W } from './config.js';

let nextId = 1;

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
    Object.assign(this, o.extra || {});
  }
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

    const rel = Math.hypot(a.vx - b.vx, a.vy - b.vy);
    const ox = (a.cx < b.cx) ? (b.x - (a.x + a.w)) : (b.x + b.w - a.x);
    const oy = (a.cy < b.cy) ? (b.y - (a.y + a.h)) : (b.y + b.h - a.y);
    const ma = a.static ? 0 : 1 / a.mass;
    const mb = b.static ? 0 : 1 / b.mass;
    const tot = ma + mb;
    if (tot === 0) return;

    // The player shoves things; things do not shove the player. Without this
    // you get caught on a bin and the whole game feels like walking in mud.
    const pa = a.type === 'player', pb = b.type === 'player';

    // Brushing past something must NOT launch it. Handing the prop the player's
    // full velocity meant it kept flying after you stopped, so simply running
    // through the office scattered — and chain-reacted — the entire floor.
    // Destroying the place should be a thing you choose to do. The overlap is
    // still resolved so you never get stuck; the prop just gets a nudge scaled
    // by its own mass, and heavy things barely register you.
    const nudge = (mover, target, dir) => {
      const push = Math.min(70, Math.abs(mover.vx) * 0.30) / Math.max(0.6, target.mass);
      if (Math.abs(target.vx) < push) target.vx = dir * push;
    };

    if (Math.abs(ox) < Math.abs(oy)) {
      if (pa && !b.static) { b.x -= ox; nudge(a, b, Math.sign(a.vx) || Math.sign(-ox) || 1); }
      else if (pb && !a.static) { a.x += ox; nudge(b, a, Math.sign(b.vx) || Math.sign(ox) || 1); }
      else {
        a.x += ox * (ma / tot); b.x -= ox * (mb / tot);
        const va = a.vx, vb = b.vx;
        if (!a.static) a.vx = (vb * mb + va * ma * 0.2) / tot * 0.7;
        if (!b.static) b.vx = (va * ma + vb * mb * 0.2) / tot * 0.7;
      }
    } else {
      a.y += oy * (ma / tot); b.y -= oy * (mb / tot);
      if (oy < 0 && !a.static) { a.grounded = true; a.vy = Math.min(a.vy, 0); }
      else if (!b.static) { b.grounded = true; b.vy = Math.min(b.vy, 0); }
      if (!a.static) a.vy *= 0.4;
      if (!b.static) b.vy *= 0.4;
    }

    if (rel > 90) this._impact(a, b, rel);
  }

  _impact(a, b, energy) { if (this.onImpact) this.onImpact(a, b, energy); }
}

export function rectsOverlap(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}
