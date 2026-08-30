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
    body.chaosUntil = this.s.time + CHAOS.chainWindow;
    body.chainDepth = depth;
    this.chain = Math.max(this.chain, depth);
    this.best = Math.max(this.best, this.chain);
    this.until = this.s.time + CHAOS.chainWindow;
    if (label && this.links[this.links.length - 1] !== label) this.links.push(label);

    const coins = Math.round(CHAOS.coinBase * depth * this.s.chaosMul);
    this.pending += coins;
    this.s.coins += coins;

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
    if (dst.chaosUntil > now && dst.chainDepth >= src.chainDepth) return;  // no ping-pong

    this.ignite(dst, src.chainDepth + 1, dst.label || dst.kind);
    this.s.damageBody(dst, energy * 0.10, src);
  }

  step(dt) {
    if (this.chain > 0 && this.s.time >= this.until) this.cash();
  }

  cash() {
    if (this.chain >= 2) {
      const n = this.chain;
      FX.float(this.s.cam.x + VIEW.w / this.s.zoom / 2, this.s.cam.y + 90, `CHAOS ×${n}`, '#ffd75e', 30);
      FX.float(this.s.cam.x + VIEW.w / this.s.zoom / 2, this.s.cam.y + 118, `+${this.pending.toLocaleString()} coins`, '#fff', 15);
      SFX.chain(n);
      this.s.chainsMade++;
      if (n > this.s.bestChain) this.s.bestChain = n;
      this.s.addAnger(Math.min(14, 1.6 * n));
    }
    this.chain = 0; this.pending = 0; this.links = [];
  }

  reset() { this.chain = 0; this.best = 0; this.until = 0; this.links = []; this.pending = 0; }
}
