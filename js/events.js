// RANDOM EVENTS — script section 25.
//
// "Random events prevent repetitive gameplay." Each one changes the rules of the
// shift for a while rather than just printing a message: HR makes standing still
// the winning move, a fire drill empties the floor, free coffee day removes the
// cooldown. That is the difference between an event and a notification.

import { FX } from './fx.js';
import { SFX } from './audio.js';
import { COFFEE } from './config.js';

export const EVENTS = [
  {
    id: 'hr',
    name: 'HR INSPECTION',
    line: 'HR is here. PRETEND TO WORK.',
    dur: 9,
    start(s) { s.hrWatching = true; },
    tick(s, dt) {
      // moving or swinging while HR watches is the only way to fail an event
      const p = s.player;
      const busy = Math.abs(p.vx) > 40 || p.atk || !p.grounded;
      if (busy) {
        s.hrHeat = Math.min(1, (s.hrHeat || 0) + dt * 0.85);
        if (s.hrHeat >= 1) {
          s.hrHeat = 0;
          s.addAnger(9);
          FX.float(p.cx, p.y - 14, 'SEEN', '#ff7b7b', 14);
          SFX.ui(false);
        }
      } else {
        s.hrHeat = Math.max(0, (s.hrHeat || 0) - dt * 0.6);
        s.coins += Math.round(38 * dt);          // paid to do nothing
      }
    },
    end(s) {
      s.hrWatching = false; s.hrHeat = 0;
      s.toast('HR has left. "Model employee."');
    },
  },
  {
    id: 'drill',
    name: 'FIRE DRILL',
    line: 'FIRE DRILL. Nobody is watching you.',
    dur: 11,
    start(s) {
      SFX.alarm();
      for (const c of s.coworkers) { c.mode = 'panic'; c.timer = 11; }
      s.chaosMul *= 1.5;
    },
    tick(s) { if (Math.random() < 0.02) SFX.alarm(); },
    end(s) { s.chaosMul /= 1.5; s.toast('Drill over. Back to work.'); },
  },
  {
    id: 'freecoffee',
    name: 'FREE COFFEE DAY',
    line: 'FREE COFFEE DAY. Unlimited.',
    dur: 14,
    start(s) { s.freeCoffee = true; s.speedMul = COFFEE.speedMul; s.boostT = 14; },
    end(s) {
      s.freeCoffee = false;
      s.toast(`"WE SPENT $${(s.coffeeSpend * 6).toLocaleString()} ON COFFEE CAPSULES."`);
    },
  },
  {
    id: 'client',
    name: 'BIG CLIENT',
    line: 'A big client is visiting. Do NOT embarrass us.',
    dur: 12,
    start(s) { s.clientHere = true; },
    tick(s, dt) { if (s.chaos.alive) s.addAnger(dt * 4); },   // chaos costs double
    end(s) { s.clientHere = false; s.toast('The client has gone. Quietly.'); },
  },
  {
    id: 'budget',
    name: 'BUDGET CUT',
    line: 'BUDGET CUT. Half the lights are off.',
    dur: 13,
    start(s) { s.dark = true; },
    end(s) { s.dark = false; s.toast('Lights back on. Somehow that cost money.'); },
  },
];

export class EventSystem {
  constructor(state) {
    this.s = state;
    this.active = null;
    this.t = 0;
    this.next = 16 + Math.random() * 10;
    this.seen = [];
  }

  reset() {
    this.active = null; this.t = 0;
    this.next = 16 + Math.random() * 10;
    this.seen = [];
  }

  step(dt) {
    const s = this.s;
    if (this.active) {
      this.t -= dt;
      if (this.active.tick) this.active.tick(s, dt);
      if (this.t <= 0) {
        if (this.active.end) this.active.end(s);
        this.active = null;
        this.next = 18 + Math.random() * 14;
      }
      return;
    }
    // never while the boss fight is on — it would just be noise
    if (s.boss && s.boss.fighting) return;
    this.next -= dt;
    if (this.next > 0) return;

    // don't repeat until every event has had a turn
    let pool = EVENTS.filter(e => !this.seen.includes(e.id));
    if (!pool.length) { this.seen = []; pool = EVENTS; }
    const e = pool[Math.floor(Math.random() * pool.length)];
    this.seen.push(e.id);

    this.active = e;
    this.t = e.dur;
    if (e.start) e.start(s);
    s.toast(e.line, 'event');
    SFX.ui(true);
  }
}
