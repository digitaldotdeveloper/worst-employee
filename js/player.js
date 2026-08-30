// The player. Combat feel is quality priority #1 (script 39), so this file is
// mostly about frame timing: startup / active / recover, buffered jumps,
// coyote time, dodge i-frames, and a 3-hit light combo with a chain window.

import { PLAYER, ATTACK, FLOOR_Y } from './config.js';
import { Body, rectsOverlap } from './engine.js';
import { FX } from './fx.js';
import { IN } from './input.js';
import { SFX } from './audio.js';
import { WEAPONS, statsFor, propStats, bump, hasSkill } from './weapons.js';

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
    this.equipped = null;   // weapon id — NEVER goes in `carrying` (see weapons.js D1)
    this.lastDodge = 99;
    this._plough = new Set();
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
    this.lastDodge += dt;

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
      const rc = this.equipped === 'rocketchair' ? WEAPONS.rocketchair.charge : null;
      const spd = rc ? rc.speed : PLAYER.dodgeSpeed;
      const dur = rc ? rc.time : PLAYER.dodgeTime;
      this.vx = this.face * spd * (this.dodgeT / dur + 0.35);
      this.state = 'dodge';
      if (rc) {
        // The rocket chair turns the dodge from defensive into a plough. Nothing
        // else in the game lets you damage things by moving.
        FX.spark(this.cx - this.face * 16, this.cy + 12, 3, '#ffb35c', 220);
        for (const b of s.world.bodies) {
          if (b === this || b.dead || b.held || this._plough.has(b.id)) continue;
          if (Math.abs(b.cx - this.cx) > 30 || Math.abs(b.cy - this.cy) > 40) continue;
          this._plough.add(b.id);
          b.vx += this.face * 620 / Math.max(0.6, b.mass * 0.5);
          b.vy -= 240 / Math.max(0.6, b.mass * 0.5);
          s.damageBody(b, rc.dmg, this);
          s.chaos.ignite(b, Math.max(1, b.chainDepth), b.label || b.kind);
          bump(s, 'rc.hits');
          FX.kick(4, 0.02);
          SFX.hit(0.7);
        }
      }
      if (this.dodgeT <= 0) { this.dodgeCd = PLAYER.dodgeCooldown; this._plough.clear(); }
      return;
    }
    if (IN.dodgeEdge && this.dodgeCd <= 0 && !this.atk) {
      this.dodgeT = this.equipped === 'rocketchair' ? WEAPONS.rocketchair.charge.time : PLAYER.dodgeTime;
      this.iframes = PLAYER.dodgeIFrames;
      this.lastDodge = 0;
      this._plough.clear();
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
      // THE STICK PICKS THE MOVE. Holding a direction while you hit skips
      // straight to the beat that does that job, so the string is something you
      // steer rather than a fixed five-tap rhythm.
      //   up    -> the uppercut (launcher)
      //   down  -> the hook, which stays low and sweeps
      //   back  -> the spinning kick, which is the reversal
      let step = (this.comboTimer > 0) ? (this.comboStep % ATTACK.light.length) : 0;
      const back = IN.axis !== 0 && Math.sign(IN.axis) !== this.face;
      if (IN.axisY < -0.45) step = 3;
      else if (IN.axisY > 0.45) step = 2;
      else if (back) step = 4;
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
    // A grabbed prop beats the equipped weapon — you swing what is in your hands.
    const wep = this.carrying;
    this.atk = { kind, step, phase: 'startup', t: 0, hit: new Set(), wep,
                 eq: wep ? null : this.equipped };
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
      if (a.t >= d.startup) {
        a.phase = 'active'; a.t = 0;
        if (a.kind === 'heavy' && a.eq === 'hammer' && hasSkill(s, 'hammer.slam') && this.grounded) {
          this._slam(s, a);
        }
        this._swing(d, s, a);
      }
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
    // Weapon contributions are SCALARS applied alongside `d`, never a clone of
    // it — the `d === ATTACK.heavy` identity checks below must keep working.
    const wep = a.wep && !a.wep.dead ? a.wep : null;
    const W = wep ? propStats(wep) : statsFor(a.eq || 'fists');
    const def = a.eq ? WEAPONS[a.eq] : null;
    let mul = W.dmgMul;
    // COUNTER: swing straight out of a dodge and it lands twice as hard.
    if (!wep && a.eq === 'fists' && hasSkill(s, 'fists.counter') && this.lastDodge < 0.4) {
      mul *= 2.0;
      if (a.phase === 'active' && a.hit.size === 0) FX.float(this.cx, this.y - 16, 'COUNTER', '#ffd75e', 13);
    }
    const reach = d.reach + W.reach;
    const hh = d.hh + W.hh;
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
      b.vx += dirX * d.kbX * W.kbMul / Math.max(0.6, b.mass * 0.5);
      b.vy += d.kbY * W.kbMul / Math.max(0.6, b.mass * 0.5);
      b.va += dirX * (4 + Math.random() * 5);
      b.flash = 0.14;

      s.damageBody(b, d.dmg * mul, this);
      s.chaos.ignite(b, Math.max(1, b.chainDepth), b.label || b.kind);

      const hx = this.cx + this.face * 30, hy = this.cy - 4;
      FX.spark(hx, hy, d === ATTACK.heavy ? 16 : 9, '#fff', d === ATTACK.heavy ? 420 : 260);
      FX.kick(d.shake * W.shakeMul, d.hitstop * W.stopMul);
      SFX.hit(Math.min(1, (d === ATTACK.heavy ? 1 : 0.35 + a.step * 0.2) * W.sfxMul));

      // per-weapon effects and mastery counters
      if (def) {
        if (def.onHit) def.onHit(this, b, s);
        if (a.eq === 'keyboard') bump(s, 'keyboard.hits');
        if (a.eq === 'rocketchair') bump(s, 'rc.hits');
        if (a.eq === 'fists' && a.step === 3 && b.type === 'prop' && !b.grounded) bump(s, 'fists.launch');
        if (a.eq === 'fists' && this.lastDodge < 0.4) bump(s, 'fists.counter');
        if (a.eq === 'hammer' && d === ATTACK.heavy) bump(s, 'hammer.heavy');
      }

      // a GRABBED prop wears out as you use it; an equipped weapon never does
      if (wep && W.wear) {
        s.damageBody(wep, d.dmg * W.wear, this);
        wep.flash = 0.12;
        if (wep.broken) { this.carrying = null; a.wep = null; }
      }
      s.hits++;
    }
  }

  // GROUND SLAM — the hammer's verb. An area hit centred on the player, which
  // is the only attack in the game that reaches behind you.
  _slam(s, a) {
    const def = WEAPONS.hammer;
    let r = def.slam.radius;
    if (hasSkill(s, 'hammer.quake')) r *= 1.5;
    FX.kick(14, 0.10);
    SFX.smash('metal', 1);
    FX.debris(this.cx, FLOOR_Y - 4, 18, '#8a8f9e');
    for (let i = -1; i <= 1; i += 2) FX.spark(this.cx + i * r * 0.5, FLOOR_Y - 6, 10, '#cfd6e6', 320);
    for (const b of s.world.bodies) {
      if (b === this || b.dead || b.held) continue;
      if (Math.abs(b.cx - this.cx) > r || b.cy < this.cy - 60) continue;
      a.hit.add(b.id);
      b.vy += def.slam.kbY / Math.max(0.6, b.mass * 0.5);
      b.vx += Math.sign(b.cx - this.cx || 1) * 260 / Math.max(0.6, b.mass * 0.5);
      s.damageBody(b, def.slam.dmg, this);
      s.chaos.ignite(b, Math.max(1, b.chainDepth), b.label || b.kind);
    }
    bump(s, 'hammer.slam');
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
    if (victim) {
      // Tap = pester. But if they are already fed up with you, you pick them
      // clean up off the floor instead — which is both funnier and a much
      // bigger act of sabotage than anything you can do to a printer.
      if (victim.annoyed2 >= 2 && !victim.held) {
        victim.held = true;
        victim.mode = 'panic';
        victim.hoisted = true;
        this.carrying = victim;
        s.hoisted = (s.hoisted || 0) + 1;
        FX.float(victim.cx, victim.y - 16, 'HOISTED', '#ff9a5c', 13);
        SFX.grab();
        SFX.hit(0.4);
        s.toast(`"PUT ME DOWN"  — ${victim.name}, ${victim.title || 'staff'}`);
        return;
      }
      s.annoy(victim);
      return;
    }

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
    if (b.hoisted) {
      // A hurled colleague is a projectile AND a casualty.
      b.hoisted = false;
      b.knock(this.s);
      b.downT = 3.4;
      this.s.ruinFromThrow && this.s.ruinFromThrow(b);
      FX.float(b.cx, b.y - 16, 'WHEEEE', '#ffd75e', 14);
      SFX.hit(0.8);
    }
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
