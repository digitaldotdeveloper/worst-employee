// The player. Combat feel is quality priority #1 (script 39), so this file is
// mostly about frame timing: startup / active / recover, buffered jumps,
// coyote time, dodge i-frames, and a 3-hit light combo with a chain window.

import { PLAYER, ATTACK, FLOOR_Y, SLAP, CARRY } from './config.js';
import { Body, rectsOverlap } from './engine.js';
import { FX } from './fx.js';
import { IN } from './input.js';
import { SFX } from './audio.js';
import { WEAPONS, statsFor, propStats, propStyle, bump, hasSkill } from './weapons.js';
import { Music } from './music.js';
import { handAt, poseFor, castHeadAt } from './art.js';

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
    this.hp = 100; this.maxHp = 100;   // Body defaults to 30; you are not a mug
    this.downT = 0;
    this.hitFlash = 0;
    this.carrying = null;
    this.holdingPerson = false;
    this.slapCd = 0;
    this.heaveT = 0;
    this.buffered = null;
    this.bufferT = 0;
    this.equipped = null;   // weapon id — NEVER goes in `carrying` (see weapons.js D1)
    this.lastDodge = 99;
    this._plough = new Set();
    this.squash = 1;
    this.animT = 0;
    this.wasGrounded = false;
  }

  get busy() { return !!this.atk || this.dodgeT > 0; }

  // Damage taken. Returns true if this one put you down.
  takeHit(s, dmg) {
    if (this.iframes > 0 || this.downT > 0) return false;
    this.hp -= dmg;
    this.hurtT = 0.3;
    this.hitFlash = 0.18;
    s.playerHits++;
    // YOU make a noise when you get hit, wherever the hit came from. This used
    // to live at two call sites — a coworker's swing and the boss's — so a
    // thrown monitor, a chain link or a falling prop hurt you in silence.
    // Putting it here means every source is covered; SFX.voice rate-limits per
    // person, so overlapping sources still only yelp once.
    SFX.voice('player', dmg >= 22 ? 'scream' : 'hurt', Math.min(1, 0.45 + dmg / 45));
    if (this.hp > 0) return false;
    this.hp = 0;
    this.downT = 2.2;
    this.atk = null;
    if (s.onPlayerDown) s.onPlayerDown();
    return true;
  }

  update(dt, s) {
    this.s = s;
    this.animT += dt;
    if (this.comboTimer > 0) this.comboTimer -= dt; else this.comboStep = 0;
    if (this.dodgeCd > 0) this.dodgeCd -= dt;
    if (this.iframes > 0) this.iframes -= dt;
    if (this.hurtT > 0) this.hurtT -= dt;
    if (this.landT > 0) this.landT -= dt;
    if (this.slapCd > 0) {
      this.slapCd -= dt;
      // Land the blow when the window reaches the contact beat. Guarded by
      // slapHit so a long frame cannot resolve the same slap twice.
      if (!this.slapHit && this.slapCd <= SLAP.contact) {
        this.slapHit = true;
        this._slapContact(s);
      }
    }
    if (this.hitFlash > 0) this.hitFlash -= dt;

    // THE HEAVE. Set when you pick something up, scaled by its mass. While it
    // runs you are committed: you cannot walk or swing, and the heavier the
    // thing the longer that lasts. This is where "different feeling per object"
    // actually lives — the stat table always differed, the moment of lifting
    // never did.
    if (this.heaveT > 0) {
      this.heaveT -= dt;
      this.vx *= 0.62;
      this.state = 'idle';
      return;
    }

    // FLOORED. Nothing responds until you get back up, which is the price of
    // wading into a room you have spent all morning annoying.
    if (this.downT > 0) {
      this.downT -= dt;
      this.vx *= 0.82;
      this.state = 'hurt';
      if (this.carrying) { this.carrying.held = false; this.carrying.choked = false; this.carrying = null; this.holdingPerson = false; this.choking = false; }
      this.heaveT = 0;
      if (this.downT <= 0) {
        this.hp = Math.round(this.maxHp * 0.6);
        this.iframes = 1.1;                 // a moment to get clear
        if (s.onPlayerUp) s.onPlayerUp();
      }
      return;
    }
    // SITTING. Everything is suspended; any movement input stands you up, so
    // you can never be stuck in the chair.
    if (this.sitting) {
      this.vx *= 0.7;
      this.state = 'idle';
      this.sitT = (this.sitT || 0) + dt;
      if (IN.left || IN.right || IN.jump || (IN.attack && this.sitT > 0.4)) {
        this.sitting = false;
        if (s.onStand) s.onStand();
      }
      return;
    }
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
    // HOISTED ABOVE BOTH BRANCHES. This was declared inside the dodge-ACTIVE
    // branch below and also read from the dodge-START branch after it, where
    // there is no binding at all — a ReferenceError on every press of dodge.
    // Guarding a dead reference is not the same as scoping it correctly, and
    // the guard is what made it look finished.
    const rc = WEAPONS.rocketchair && this.equipped === 'rocketchair'
      ? WEAPONS.rocketchair.charge : null;   // inert while the chair is cut
    if (this.dodgeT > 0) {
      this.dodgeT -= dt;
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
          b.wake();
          b.vx += this.face * 620 / Math.max(0.6, b.mass * 0.5);
          b.vy -= 240 / Math.max(0.6, b.mass * 0.5);
          s.damageBody(b, rc.dmg, this);
          s.chaos.ignite(b, 1, b.label || b.kind);
          bump(s, 'rc.hits');
          FX.kick(4, 0.02);
          SFX.hit(0.7);
        }
      }
      if (this.dodgeT <= 0) { this.dodgeCd = PLAYER.dodgeCooldown; this._plough.clear(); }
      return;
    }
    if (IN.dodgeEdge && this.dodgeCd <= 0 && !this.atk) {
      this.dodgeT = rc ? rc.time : PLAYER.dodgeTime;
      if (this.equipped === 'rocketchair') Music.cue('full_throttle');
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
    if (this.atk) {
      // Buffer a press made mid-swing and fire it the instant recovery ends.
      if (IN.lightEdge) this.buffered = { kind: 'light', y: IN.axisY, back: IN.axis !== 0 && Math.sign(IN.axis) !== this.face };
      else if (IN.heavyEdge) this.buffered = { kind: 'heavy' };
      if (this.buffered) this.bufferT = 0.22;
      if (this.bufferT > 0) this.bufferT -= dt; else this.buffered = null;
      this._stepAttack(dt, s);
      return;
    }

    // a press buffered during the last swing fires now
    if (this.buffered) {
      const q = this.buffered;
      this.buffered = null;
      if (q.kind === 'heavy') { this._startAttack('heavy', 0); return; }
      let step = (this.comboTimer > 0) ? (this.comboStep % ATTACK.light.length) : 0;
      if (q.y < -0.45) step = 3;
      else if (q.y > 0.45) step = 2;
      else if (q.back) step = 4;
      this._startAttack('light', step);
      return;
    }

    // ---------------- grab / throw ----------------
    if (IN.grabEdge) this._grabOrThrow(s);

    // ---------------- use / interact ----------------
    // Holding an extinguisher turns USE into the trigger. It is the only prop
    // with a second verb, and it is by far the funniest thing you can do to a
    // colleague without touching them.
    const st = this.carrying && !this.holdingPerson ? propStyle(this.carrying.kind) : null;
    this.spraying = false;
    if (st && st.spray) {
      if (IN.use) { this._spray(s, dt); return; }
      if (this.sprayed) { this.sprayed = false; this.sprayT = 0; }
    }

    // The discovery button. Everything in the office answers back.
    if (IN.useEdge && s.tryInteract) { s.tryInteract(); return; }

    // ---------------- attack start ----------------
    // holding someone? every hit is a slap
    if (this.holdingPerson && this.carrying) {
      if ((IN.lightEdge || IN.heavyEdge) && this.slapCd <= 0) { this._slap(s); return; }
      if (IN.lightEdge || IN.heavyEdge) return;
    }

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
    // What you are carrying is now in your legs. A filing cabinet (mass 5.5) is
    // a shuffle; a mug (0.4) is barely felt. Clamped so heavy never becomes
    // stuck — being unable to move is not weight, it is a bug that looks like one.
    const load = this.carrying ? (this.carrying.mass || 1) : 0;
    const carryMul = Math.max(CARRY.minSpeed, 1 - load * CARRY.slowPerMass);
    const target = IN.axis * PLAYER.speed * s.speedMul * carryMul;
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

  // SLAP. Only available while you have hold of someone, and it is deliberately
  // not a combo beat: it is fast, repeatable, does almost no damage and a lot of
  // ruin. Humiliation, not violence.
  _slap(s) {
    if (!this.carrying) return;
    this.slapCd = SLAP.cd;
    this.slapHit = false;       // the blow itself lands on the contact beat
  }

  // The impact, fired from update() when the window reaches SLAP_CONTACT rather
  // than the moment the button went down. The slap used to resolve instantly on
  // a single drawn frame, so it connected with nothing: the sparks appeared
  // while the arm was still back and the hand never arrived.
  _slapContact(s) {
    const v = this.carrying;
    if (!v) return;
    // A CHOKE HAS ITS OWN ATTACK. Pressing HIT used to do nothing at all while
    // choking — no slap, no sound, no damage, a dead button. You cannot slap
    // with both arms round a throat, so HIT tightens instead: more damage than
    // a slap, no wind-up, and it reads through the sound rather than a frame.
    if (this.choking) {
      v.hurtT = 0.2;
      s.damageBody(v, 9, this);
      const hd0 = castHeadAt(v);
      FX.spark(hd0 ? hd0.x : v.cx, hd0 ? hd0.y : v.cy - 10, 5, '#ff9a9a', 150);
      FX.kick(3, 0.04);
      SFX.hit(0.42);
      SFX.voice(v.name, 'scream', 0.75);
      return;
    }
    v.slaps = (v.slaps || 0) + 1;
    v.hurtT = 0.25;

    // Aim at the face they are actually wearing. `v.cy - 10` was a fixed offset
    // off body CENTRE, so it hit the chest — and stayed on the chest whether
    // they were upright, doubled over or slumped. castHeadAt derives the head
    // from the frame on screen; the fallback keeps the old point if a character
    // has no head anchors (the rig path), because no sparks is worse than low ones.
    const hd = castHeadAt(v);
    FX.spark(hd ? hd.x + this.face * hd.r * 0.45 : v.cx + this.face * 12,
             hd ? hd.y : v.cy - 10,
             7, '#ffd9d9', 220);
    FX.kick(4, 0.05);
    SFX.hit(0.30 + Math.min(0.4, v.slaps * 0.05));
    s.onSlap && s.onSlap(v, v.slaps);
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
    let hitCount = 0;
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
      if (!W.sweep && hitCount >= 1 && b.type === 'prop') continue;
      a.hit.add(b.id);
      hitCount++;

      b.wake();
      const dirX = Math.sign(b.cx - this.cx) || this.face;
      // SOMEONE FIGHTING BACK BRACES. At full knockback a colleague who had
      // turned was launched 200px on every hit and spent the entire fight
      // walking back into range — measured, they landed one swing in 26 rounds
      // and it never reached you. A person squaring up does not ragdoll.
      const brace = (b.type === 'npc' && b.fighting) ? 0.3 : 1;
      b.vx += dirX * d.kbX * W.kbMul * brace / Math.max(0.6, b.mass * 0.5);
      b.vy += d.kbY * W.kbMul / Math.max(0.6, b.mass * 0.5);
      b.va += dirX * (4 + Math.random() * 5);
      b.flash = 0.14;

      s.damageBody(b, d.dmg * mul, this);
      s.chaos.ignite(b, 1, b.label || b.kind);

      const hx = this.cx + this.face * 30, hy = this.cy - 4;
      FX.spark(hx, hy, d === ATTACK.heavy ? 16 : 9, '#fff', d === ATTACK.heavy ? 420 : 260);
      FX.kick(d.shake * W.shakeMul, d.hitstop * W.stopMul);
      SFX.hit(Math.min(1, (d === ATTACK.heavy ? 1 : 0.35 + a.step * 0.2) * W.sfxMul));
      // The spin kick that ends the five-beat string gets a flourish over the
      // top of the synthesised hit. Only on connect - a finisher fanfare on a
      // whiff reads as a bug. Music.cue has its own cooldown, so a swing that
      // catches three bodies still only fires it once.
      if (a.kind === 'light' && a.step === 4) Music.cue('combo_finish');

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
      // GLASS. Breaking something brittle over somebody sprays the room: shards
      // cut everyone nearby and somebody is going to bleed.
      if (wep && W.style === 'glass' && W.shards && !wep.shattered) {
        const dead = wep.hp - d.dmg * W.wear <= 0;
        if (dead) {
          wep.shattered = true;
          s.shatter && s.shatter(wep, b, W.shards);
        }
      }
      if (wep && W.paper) FX.paper(b.cx, b.cy, 10);
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
    if (!def) return;            // hammer is cut; this path is unreachable
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
      hitCount++;
      b.wake();
      b.vy += def.slam.kbY / Math.max(0.6, b.mass * 0.5);
      b.vx += Math.sign(b.cx - this.cx || 1) * 260 / Math.max(0.6, b.mass * 0.5);
      s.damageBody(b, def.slam.dmg, this);
      s.chaos.ignite(b, 1, b.label || b.kind);
    }
    Music.cue('ground_slam');
    bump(s, 'hammer.slam');
  }

  // A continuous cone of CO2. Does almost no damage — it blinds people, drives
  // them off and makes them extremely rude about it.
  _spray(s, dt) {
    this.state = 'attack';
    this.spraying = true;
    this.vx *= 0.86;
    this.sprayT = (this.sprayT || 0) + dt;
    this.sprayed = true;
    const tip = this.cx + this.face * 34;
    const tipY = this.cy - 4;

    for (let i = 0; i < 3; i++) {
      FX.spark(tip + this.face * (10 + Math.random() * 46), tipY + (Math.random() - 0.5) * 26,
        1, '#eef4ff', 210);
    }
    if (this.carrying) this.carrying.angle = this.face * -0.35;

    if ((this.sprayT % 0.22) < dt) SFX.whiff();

    for (const c of s.coworkers) {
      if (c.dead || c.mode === 'down') continue;
      const dx = (c.cx - this.cx) * this.face;
      if (dx < 6 || dx > 118 || Math.abs(c.cy - this.cy) > 46) continue;
      s.onSprayed && s.onSprayed(c, dt);
    }
    // it empties
    if (this.sprayT > 4.5 && this.carrying) {
      s.damageBody(this.carrying, 999, this);
      this.carrying = null;
      this.sprayT = 0;
      s.toast('The extinguisher is empty.');
    }
  }

  _grabOrThrow(s) {
    if (this.carrying) { this._throw(); return; }

    // PEOPLE ARE NOT PROPS. A colleague in reach is always grabbable — no
    // build-up, no gate — and grabbing one puts you in a different state from
    // carrying a monitor: while you have hold of someone, HIT slaps them
    // instead of swinging them, and GRAB again throws them.
    let victim = null, vd = 999;
    for (const c of s.coworkers) {
      if (c.dead || c.held || c.visible === false) continue;
      const dx = Math.abs(c.cx - this.cx), dy = Math.abs(c.cy - this.cy);
      if (dx > 52 || dy > 46) continue;
      if (dx < vd) { vd = dx; victim = c; }
    }
    if (victim) {
      victim.held = true;
      victim.hoisted = true;
      // FROM BEHIND IS A CHOKE — and "behind" is about WHERE YOU ARE, not which
      // way you both happen to point. This read `victim.face === this.face`,
      // which is true whenever two people face the same way even if you are
      // standing right in front of them, so roughly half of all grabs became a
      // choke by accident. It is behind you when the victim is facing AWAY from
      // you: their facing points along the line from you to them.
      const toVictim = Math.sign(victim.cx - this.cx) || 1;
      const fromBehind = victim.face === toVictim;
      victim.choked = fromBehind;
      this.choking = fromBehind;
      victim.heldT = 0;
      victim.mode = 'panic';
      victim.slaps = 0;
      this.carrying = victim;
      this.holdingPerson = true;
      s.onGrabPerson && s.onGrabPerson(victim);
      SFX.grab('person', victim.mass || 2.4);
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
      best.held = true; best.va = 0; best.angle = 0; best.wake();
      this.carrying = best;
      // THE HEAVE. Picking something up used to be instantaneous whatever it
      // weighed, which is most of why every prop felt the same in the hand.
      this.heaveT = Math.min(CARRY.heaveMax,
        CARRY.heaveMin + (best.mass || 1) * CARRY.heavePerMass);
      FX.float(best.cx, best.y - 8, (best.mass || 1) >= 3 ? 'HEAVE' : 'GRABBED',
               '#7fd1ff', 11);
      const gs = propStyle(best.kind);
      SFX.grab(gs ? gs.style : 'light', best.mass || 1);
    }
  }

  _throw() {
    const b = this.carrying;
    if (!b) return;
    b.held = false;
    b.choked = false;
    this.choking = false;
    this.holdingPerson = false;
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
    // A printer does not fly like a sheet of paper. Same clamp reasoning as the
    // walk: heavy throws short, never drops at your feet.
    const tm = Math.max(CARRY.throwMin, 1 - (b.mass || 1) * CARRY.throwPerMass);
    b.vx = this.face * PLAYER.throwSpeed * tm;
    b.vy = PLAYER.throwLift * tm;
    b.va = this.face * 12;
    b.chaosUntil = this.s.time + 3.0;   // in-flight props stay hot long enough to land
    b.chainDepth = Math.max(1, b.chainDepth);
    this.carrying = null;
    FX.kick(3, 0.02);
    const ts = propStyle(b.kind);
    SFX.throw_(0.85, this.holdingPerson || b.hoisted ? 'person' : (ts ? ts.style : 'light'), b.mass || 1);
  }

  carryPose() {
    if (!this.carrying) return;
    const c = this.carrying;

    // A PERSON IS HELD BY THE NECK -- upright, at arm's length, feet just off
    // the floor and kicking. Nothing like the overhead carry a monitor gets,
    // which is what made grabbing someone feel wrong.
    if (this.holdingPerson) {
      // Line the victim up with the fist that is actually DRAWN, per pose, from
      // the same measured table the weapons use — `grab-hold` and `grab-slap`
      // both have rows now. The old code guessed the fist at 38% of body height
      // from the top and, despite the comment, put the victim's feet 10px
      // THROUGH the carpet: measured feet-above-ground was -10. They read as
      // kneeling on the floor beside you rather than hanging off your fist.
      const fist = handAt(poseFor(this, this.animT), this.cx, this.y + this.h,
                          this.h * (this.squash || 1) * 1.06, this.face < 0);
      c.x = fist.x + this.face * (c.w * 0.10) - c.w / 2;
      // Their collar meets the grip and their feet swing about 10px clear.
      c.y = fist.y - c.h * 0.38;
      c.vx = this.vx; c.vy = 0;
      c.face = -this.face;                  // facing you, which is the point
      c.angle = Math.sin(this.animT * 14) * (this.slapCd > 0 ? 0.20 : 0.07);
      c.grounded = false;
      return;
    }

    const a = this.atk;
    if (this.spraying) {
      c.x = this.cx + this.face * 30 - c.w / 2;
      c.y = this.cy - c.h / 2 - 8;
      c.angle = this.face * 1.35;        // nozzle forward
      c.vx = this.vx; c.vy = 0;
      return;
    }
    // WHERE THE HANDS ACTUALLY ARE, for the pose actually being drawn. This used
    // to be `PLAYER.carryOffset`, one constant for every pose — and because that
    // y is measured from `this.y`, which is the player's TOP, a carried chair
    // hovered 18px ABOVE his head and behind him while the carry frame reached
    // out in front holding nothing.
    const hand = handAt(poseFor(this, this.animT), this.cx, this.y + this.h,
                        this.h * (this.squash || 1) * 1.06, this.face < 0);
    if (a && a.wep === c) {
      // swing arc: back on the wind-up, thrown forward on the active frames
      const k = a.phase === 'startup' ? -0.5 : (a.phase === 'active' ? 1.5 : 0.7);
      c.x = hand.x + this.face * 16 * k - c.w / 2;
      c.y = hand.y - c.h / 2 + (a.phase === 'active' ? 6 : -6);
      c.angle = this.face * (a.phase === 'active' ? 1.1 : -0.7);
    } else {
      c.x = hand.x - c.w / 2;
      c.y = hand.y - c.h / 2;
      c.angle = 0;
    }
    c.vx = this.vx; c.vy = this.vy;
  }
}
