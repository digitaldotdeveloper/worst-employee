// The player. Combat feel is quality priority #1 (script 39), so this file is
// mostly about frame timing: startup / active / recover, buffered jumps,
// coyote time, dodge i-frames, and a 3-hit light combo with a chain window.

import { PLAYER, ATTACK, FLOOR_Y } from './config.js';
import { Body, rectsOverlap } from './engine.js';
import { FX } from './fx.js';
import { IN } from './input.js';

export class Player extends Body {
  constructor(x) {
    super({ x, y: FLOOR_Y - PLAYER.h, w: PLAYER.w, h: PLAYER.h,
      mass: 3.2, type: 'player', bounce: 0, fric: 1, grabbable: false });
    this.face = 1;
    this.state = 'idle';
    this.coyote = 0; this.buffer = 0;
    this.atk = null;            // { kind, step, phase, t, hit:Set }
    this.comboStep = 0; this.comboTimer = 0;
    this.dodgeT = 0; this.dodgeCd = 0; this.iframes = 0;
    this.carrying = null;
    this.squash = 1;
    this.animT = 0;
    this.wasGrounded = false;
  }

  get busy() { return !!this.atk || this.dodgeT > 0; }

  update(dt, s) {
    this.s = s;
    this.animT += dt;
    if (this.comboTimer > 0) this.comboTimer -= dt; else this.comboStep = 0;
    if (this.dodgeCd > 0) this.dodgeCd -= dt;
    if (this.iframes > 0) this.iframes -= dt;

    // landing squash
    if (this.grounded && !this.wasGrounded) {
      this.squash = 0.84; FX.kick(1.2, 0);
    }
    this.wasGrounded = this.grounded;
    this.squash += (1 - this.squash) * Math.min(1, dt * 14);

    // ---------------- dodge ----------------
    if (this.dodgeT > 0) {
      this.dodgeT -= dt;
      this.vx = this.face * PLAYER.dodgeSpeed * (this.dodgeT / PLAYER.dodgeTime + 0.35);
      this.state = 'dodge';
      if (this.dodgeT <= 0) this.dodgeCd = PLAYER.dodgeCooldown;
      return;
    }
    if (IN.dodgeEdge && this.dodgeCd <= 0 && !this.atk) {
      this.dodgeT = PLAYER.dodgeTime;
      this.iframes = PLAYER.dodgeIFrames;
      if (IN.axis) this.face = Math.sign(IN.axis);
      FX.kick(2, 0);
      FX.spark(this.cx, this.cy + 14, 5, 'rgba(255,255,255,.5)', 130);
      return;
    }

    // ---------------- attack ----------------
    if (this.atk) { this._stepAttack(dt, s); return; }

    // ---------------- grab / throw ----------------
    if (IN.grabEdge) this._grabOrThrow(s);

    // ---------------- attack start ----------------
    if (IN.heavyEdge) { this._startAttack('heavy', 0); return; }
    if (IN.lightEdge) {
      const step = (this.comboTimer > 0) ? (this.comboStep % 3) : 0;
      this._startAttack('light', step);
      return;
    }

    // ---------------- move ----------------
    const target = IN.axis * PLAYER.speed * s.speedMul;
    const ctl = this.grounded ? 1 : PLAYER.airControl;
    if (IN.axis) {
      this.face = Math.sign(IN.axis);
      const a = PLAYER.accel * ctl * dt;
      this.vx += Math.sign(target - this.vx) * Math.min(a, Math.abs(target - this.vx));
      this.state = this.grounded ? 'run' : 'air';
    } else {
      const f = PLAYER.friction * ctl * dt;
      this.vx -= Math.sign(this.vx) * Math.min(f, Math.abs(this.vx));
      this.state = this.grounded ? 'idle' : 'air';
    }
    if (this.carrying) this.state = 'carry';

    // ---------------- jump ----------------
    if (this.grounded) this.coyote = PLAYER.coyote; else if (this.coyote > 0) this.coyote -= dt;
    if (IN.jumpEdge) this.buffer = PLAYER.buffer; else if (this.buffer > 0) this.buffer -= dt;
    if (this.buffer > 0 && this.coyote > 0) {
      this.vy = -PLAYER.jump;
      this.buffer = 0; this.coyote = 0; this.grounded = false;
      this.squash = 1.16;
      FX.spark(this.cx, this.y + this.h, 4, 'rgba(255,255,255,.35)', 90);
    }
    // variable jump height — release early, rise less
    if (!IN.jump && this.vy < -220) this.vy += 2600 * dt;
  }

  _startAttack(kind, step) {
    this.atk = { kind, step, phase: 'startup', t: 0, hit: new Set() };
    this.state = 'attack';
    if (this.carrying) this._throw();
    if (IN.axis) this.face = Math.sign(IN.axis);
  }

  _stepAttack(dt, s) {
    const a = this.atk;
    const d = a.kind === 'heavy' ? ATTACK.heavy : ATTACK.light[a.step];
    a.t += dt;
    this.vx -= Math.sign(this.vx) * Math.min(PLAYER.friction * 1.4 * dt, Math.abs(this.vx));

    if (a.phase === 'startup') {
      if (a.t >= d.startup) { a.phase = 'active'; a.t = 0; this._swing(d, s, a); }
    } else if (a.phase === 'active') {
      this._swing(d, s, a);
      if (a.t >= d.active) { a.phase = 'recover'; a.t = 0; }
    } else {
      if (a.t >= d.recover) {
        if (a.kind === 'light') { this.comboStep = a.step + 1; this.comboTimer = ATTACK.comboWindow; }
        this.atk = null; this.state = 'idle';
      }
    }
  }

  _swing(d, s, a) {
    const box = {
      x: this.face > 0 ? this.x + this.w - 6 : this.x - d.reach + 6,
      y: this.cy - d.hh / 2,
      w: d.reach, h: d.hh,
    };
    // small lunge on the finisher / heavy
    if (a.phase === 'active' && (d === ATTACK.heavy || a.step === 2)) {
      this.vx += this.face * 620 * (1 / 60);
    }

    for (const b of s.world.bodies) {
      if (b === this || b.dead || b.held || a.hit.has(b.id)) continue;
      if (b.type === 'deco') continue;
      if (!rectsOverlap(box, b)) continue;
      a.hit.add(b.id);

      const dirX = Math.sign(b.cx - this.cx) || this.face;
      b.vx += dirX * d.kbX / Math.max(0.6, b.mass * 0.5);
      b.vy += d.kbY / Math.max(0.6, b.mass * 0.5);
      b.va += dirX * (4 + Math.random() * 5);
      b.flash = 0.14;

      s.damageBody(b, d.dmg, this);
      s.chaos.ignite(b, Math.max(1, b.chainDepth), b.label || b.kind);

      const hx = this.cx + this.face * 30, hy = this.cy - 4;
      FX.spark(hx, hy, d === ATTACK.heavy ? 16 : 9, '#fff', d === ATTACK.heavy ? 420 : 260);
      FX.kick(d.shake, d.hitstop);
      s.hits++;
    }
  }

  _grabOrThrow(s) {
    if (this.carrying) { this._throw(); return; }
    let best = null, bestD = 999;
    for (const b of s.world.bodies) {
      if (b === this || !b.grabbable || b.dead || b.type === 'boss') continue;
      const dx = Math.abs(b.cx - this.cx), dy = Math.abs(b.cy - this.cy);
      if (dx > 62 || dy > 56) continue;
      const dd = dx + dy;
      if (dd < bestD) { bestD = dd; best = b; }
    }
    if (best) {
      best.held = true; best.va = 0; best.angle = 0;
      this.carrying = best;
      FX.float(best.cx, best.y - 8, 'GRABBED', '#7fd1ff', 11);
    }
  }

  _throw() {
    const b = this.carrying;
    if (!b) return;
    b.held = false;
    b.x = this.cx + this.face * 22;
    b.y = this.cy - b.h / 2 - 10;
    b.vx = this.face * PLAYER.throwSpeed;
    b.vy = PLAYER.throwLift;
    b.va = this.face * 12;
    b.chaosUntil = this.s.time + 3.0;   // in-flight props stay hot long enough to land
    b.chainDepth = Math.max(1, b.chainDepth);
    this.carrying = null;
    FX.kick(3, 0.02);
  }

  carryPose() {
    if (!this.carrying) return;
    const c = this.carrying;
    c.x = this.cx + this.face * PLAYER.carryOffset.x - c.w / 2;
    c.y = this.y + PLAYER.carryOffset.y - c.h / 2;
    c.vx = this.vx; c.vy = this.vy;
  }
}
