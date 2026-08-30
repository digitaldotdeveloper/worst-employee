// The player. Combat feel is quality priority #1 (script 39), so this file is
// mostly about frame timing: startup / active / recover, buffered jumps,
// coyote time, dodge i-frames, and a 3-hit light combo with a chain window.

import { PLAYER, ATTACK, FLOOR_Y } from './config.js';
import { Body, rectsOverlap } from './engine.js';
import { FX } from './fx.js';
import { IN } from './input.js';
import { SFX } from './audio.js';

export class Player extends Body {
  constructor(x) {
    super({ x, y: FLOOR_Y - PLAYER.h, w: PLAYER.w, h: PLAYER.h,
      mass: 3.2, type: 'player', bounce: 0, fric: 1, grabbable: false });
    this.face = 1;
    this.state = 'idle';
    this.coyote = 0; this.buffer = 0;
    this.atk = null;            // { kind, step, phase, t, hit:Set }
    this.comboStep = 0; this.comboTimer = 0;
    this.dodgeT = 0; this.dodgeCd = 0; this.iframes = 0; this.hurtT = 0; this.landT = 0;
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
    if (this.hurtT > 0) this.hurtT -= dt;
    if (this.landT > 0) this.landT -= dt;

    // landing squash
    if (this.grounded && !this.wasGrounded) {
      this.squash = 0.84; FX.kick(1.2, 0);
      if (Math.abs(this.vy) > 260 || this.wasAir > 0.22) this.landT = 0.16;
      SFX.land(Math.min(1, Math.abs(this.vy) / 900));
    }
    this.wasAir = this.grounded ? 0 : (this.wasAir || 0) + dt;
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
      SFX.dodge();
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
      const step = (this.comboTimer > 0) ? (this.comboStep % ATTACK.light.length) : 0;
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
      SFX.jump();
    }
    // variable jump height — release early, rise less
    if (!IN.jump && this.vy < -220) this.vy += 2600 * dt;
  }

  _startAttack(kind, step) {
    // Script section 15: a weapon should change what you can DO, not just deal
    // more damage. Swinging what you are holding gets more reach and far more
    // knockback than a fist, and the object takes damage too — so a chair is a
    // few good hits before it becomes debris.
    const wep = this.carrying;
    this.atk = { kind, step, phase: 'startup', t: 0, hit: new Set(), wep };
    SFX.whiff();
    this.state = 'attack';
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
    // A held object extends reach by its own size and multiplies the hit.
    const wep = a.wep && !a.wep.dead ? a.wep : null;
    const reach = d.reach + (wep ? wep.w * 0.8 + 10 : 0);
    const hh = d.hh + (wep ? wep.h * 0.5 : 0);
    const mul = wep ? 1.6 + Math.min(1.2, wep.mass * 0.35) : 1;
    const box = {
      x: this.face > 0 ? this.x + this.w - 6 : this.x - reach + 6,
      y: this.cy - hh / 2,
      w: reach, h: hh,
    };
    // small lunge on the finisher / heavy
    if (a.phase === 'active' && (d === ATTACK.heavy || a.step >= 3)) {
      this.vx += this.face * 520 * (1 / 60);
    }

    for (const b of s.world.bodies) {
      if (b === this || b.dead || b.held || a.hit.has(b.id)) continue;
      if (b.type === 'deco') continue;
      if (b === a.wep) continue;
      if (!rectsOverlap(box, b)) continue;
      a.hit.add(b.id);

      const dirX = Math.sign(b.cx - this.cx) || this.face;
      b.vx += dirX * d.kbX * mul / Math.max(0.6, b.mass * 0.5);
      b.vy += d.kbY * mul / Math.max(0.6, b.mass * 0.5);
      b.va += dirX * (4 + Math.random() * 5);
      b.flash = 0.14;

      s.damageBody(b, d.dmg * mul, this);
      s.chaos.ignite(b, Math.max(1, b.chainDepth), b.label || b.kind);

      const hx = this.cx + this.face * 30, hy = this.cy - 4;
      FX.spark(hx, hy, d === ATTACK.heavy ? 16 : 9, '#fff', d === ATTACK.heavy ? 420 : 260);
      FX.kick(d.shake * (wep ? 1.4 : 1), d.hitstop * (wep ? 1.35 : 1));
      SFX.hit(Math.min(1, (d === ATTACK.heavy ? 1 : 0.35 + a.step * 0.2) * (wep ? 1.5 : 1)));
      if (wep) {                       // the weapon wears out as you use it
        s.damageBody(wep, d.dmg * 0.55, this);
        wep.flash = 0.12;
        if (wep.broken) { this.carrying = null; a.wep = null; }
      }
      s.hits++;
    }
  }

  _grabOrThrow(s) {
    if (this.carrying) { this._throw(); return; }

    // A coworker within arm's reach takes priority over a prop. Annoying people
    // is the whole premise of the game and it needs to be a thing you can DO,
    // not just a side effect of breaking their monitor — especially now that
    // destruction is opt-in and a quiet playthrough is a real option.
    let victim = null, vd = 999;
    for (const c of s.coworkers) {
      if (c.dead || c.mode === 'down' || c.annoyCd > 0) continue;
      const dx = Math.abs(c.cx - this.cx), dy = Math.abs(c.cy - this.cy);
      if (dx > 56 || dy > 44) continue;
      if (dx < vd) { vd = dx; victim = c; }
    }
    if (victim) { s.annoy(victim); return; }

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
      SFX.grab();
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
    SFX.throw_();
  }

  carryPose() {
    if (!this.carrying) return;
    const c = this.carrying;
    const a = this.atk;
    if (a && a.wep === c) {
      // swing arc: back on the wind-up, thrown forward on the active frames
      const k = a.phase === 'startup' ? -0.5 : (a.phase === 'active' ? 1.5 : 0.7);
      c.x = this.cx + this.face * (PLAYER.carryOffset.x + 16 * k) - c.w / 2;
      c.y = this.cy - c.h / 2 - 10 + (a.phase === 'active' ? 6 : -6);
      c.angle = this.face * (a.phase === 'active' ? 1.1 : -0.7);
    } else {
      c.x = this.cx + this.face * PLAYER.carryOffset.x - c.w / 2;
      c.y = this.y + PLAYER.carryOffset.y - c.h / 2;
      c.angle = 0;
    }
    c.vx = this.vx; c.vy = this.vy;
  }
}
