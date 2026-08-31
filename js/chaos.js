// THE CHAOS CHAIN — script section 11, the signature system.
//
// Hit a thing hard enough and it becomes "chaotic" for a few seconds. While it
// is chaotic, anything IT hits inherits the chain one link deeper. Coffee ->
// monitor -> printer -> papers -> coworker -> boss = CHAOS x6.
//
// Everything else in the game is a way of starting one of these.

import { CHAOS, VIEW } from './config.js';
import { FX } from './fx.js';
import { SFX } from './audio.js';
import { Music } from './music.js';

export class ChaosSystem {
  constructor(state) {
    this.s = state;
    this.chain = 0;
    this.best = 0;
    this.until = 0;         // chain expiry
    this.links = [];        // labels, for the toast
    this.pending = 0;       // coins banked this chain
  }

  get alive() { return this.chain > 0 && this.s.time < this.until; }
  get remain() { return Math.max(0, (this.until - this.s.time) / CHAOS.chainWindow); }

  // Mark something as a live chain link. `depth` is inherited from whatever hit it.
  ignite(body, depth, label) {
    if (body.wake) body.wake();
    body.chaosUntil = this.s.time + CHAOS.chainWindow;
    body.chainDepth = depth;
    const was = this.chain;
    this.chain = Math.max(this.chain, depth);
    this.best = Math.max(this.best, this.chain);
    // The moment a chain crosses four links is the loudest thing that happens
    // in a shift, and it happens rarely. Fired once per chain, on the crossing.
    if (was < 4 && this.chain >= 4) Music.cue('total_wipeout');
    this.until = this.s.time + CHAOS.chainWindow;
    if (label && this.links[this.links.length - 1] !== label) this.links.push(label);

    // Depth 1 pays NOTHING: the first hit is a chain seed, not income.
    // Paying per hit turns any fast weapon into a coin printer and lets you
    // farm an already-broken prop forever.
    const coins = Math.round(CHAOS.coinBase * (depth - 1) * this.s.chaosMul * (this.s.chaosDrill || 1));
    if (coins > 0) { this.pending += coins; this.s.coins += coins; }

    if (depth >= 2) {
      FX.float(body.cx, body.y - 12, `x${depth}`, '#ffd75e', 13 + Math.min(depth, 9));
      FX.kick(1.5 + depth * 0.5, 0);
      SFX.coin(depth);
    }
  }

  // Called by the physics layer for every meaningful collision.
  onImpact(a, b, energy) {
    if (energy < CHAOS.minEnergy) return;
    const now = this.s.time;

    // Which side is carrying the chain?
    const aHot = a && a.chaosUntil > now;
    const bHot = b && b.chaosUntil > now;
    if (!aHot && !bHot) return;

    const src = aHot ? a : b;
    const dst = aHot ? b : a;
    if (!dst || dst === src) return;

    // THE PLAYER IS NEVER A CHAIN NODE, in either direction.
    // Without this, a thrown or smashed prop bouncing off you ignites YOU — and
    // for the next few seconds merely walking into a colleague ran the chain
    // logic, damaged them and knocked them flat. That is exactly the "I hit
    // people just by passing them" bug, and it was invisible because
    // damageBody ignores the player.
    if (src.type === 'player' || dst.type === 'player') return;
    if (dst.chaosUntil > now && dst.chainDepth >= src.chainDepth) return;  // no ping-pong

    this.ignite(dst, src.chainDepth + 1, dst.label || dst.kind);
    this.s.damageBody(dst, energy * 0.10, src);
  }

  step(dt) {
    if (this.chain > 0 && this.s.time >= this.until) this.cash();
  }

  cash() {
    // Clear every link before banking. chainDepth used to persist forever, so a
    // prop that once reached depth 5 kept paying 4 links on every later swing —
    // the exact coin printer the depth-1-pays-nothing rule exists to prevent.
    for (const b of this.s.world.bodies) {
      if (b.chainDepth) { b.chainDepth = 0; b.chaosUntil = 0; }
    }
    if (this.chain >= 2) {
      const n = this.chain;
      FX.float(this.s.cam.x + VIEW.w / this.s.zoom / 2, this.s.cam.y + 90, `CHAOS ×${n}`, '#ffd75e', 30);
      FX.float(this.s.cam.x + VIEW.w / this.s.zoom / 2, this.s.cam.y + 118, `+${this.pending.toLocaleString()} coins`, '#fff', 15);
      SFX.chain(n);
      this.s.chainsMade++;
      if (this.s.player && this.s.player.equipped === 'stapler' && n >= 6) {
        this.s.bumpCounter && this.s.bumpCounter('stapler.chain');
      }
      if (n > this.s.bestChain) this.s.bestChain = n;
      this.s.addAnger(Math.min(14, 1.6 * n));
    }
    this.chain = 0; this.pending = 0; this.links = [];
  }

  reset() { this.chain = 0; this.best = 0; this.until = 0; this.links = []; this.pending = 0; }
}
