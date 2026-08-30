// THE CAMPAIGN — script sections 6 to 9.
//
// You arrive unemployed, sit through an HR interview, get shown round by a boss
// who is genuinely delighted to have you, and are put at a desk. Only then does
// the game hand you the controls. That opening is the joke the whole game rests
// on: every promise made in the tour becomes a thing you can ruin later.
//
// A scene is a flat list of beats stepped one at a time. Deliberately not a
// coroutine or a promise chain — a flat list can be skipped, rewound and
// inspected, and the whole thing has to survive being interrupted by a player
// who mashes the screen.

import { FLOOR_Y } from './config.js';
import { SFX } from './audio.js';
import { FX } from './fx.js';

export const say = (who, text, ms) => ({ t: 'say', who, text, ms });
export const walk = (who, x, ms) => ({ t: 'walk', who, x, ms });
export const wait = ms => ({ t: 'wait', ms });
export const cam = (x, ms) => ({ t: 'cam', x, ms });
export const look = (who, dir) => ({ t: 'look', who, dir });
export const fx = fn => ({ t: 'fx', fn });
export const prompt = (text, opts) => ({ t: 'prompt', text, opts });

// ---------------------------------------------------------------
// Where the intro happens. Reception for HR, then a walk through the floor.
// ---------------------------------------------------------------
export const HR_X = 300;
export const DESK_X = 800;

export function introScene(S) {
  const P = S.player;
  const hr = S.actors.hr;
  const boss = S.actors.boss;

  return [
    fx(() => { P.x = 60; P.face = 1; S.cam.x = 0; }),
    wait(500),
    say('', 'MONDAY. 8:52 AM.', 1600),
    say(S.look.name, "I need this job. I really need this job.", 2200),
    walk('player', HR_X - 60, 2200),
    say('HR — DALIA', "Take a seat. Don't worry, this is very informal.", 2400),
    say('HR — DALIA', 'So. Why do you want to work at Vantix Solutions?', 2600),
    prompt('What do you say?', [
      { text: "I'm passionate about synergy.", reply: "Wonderful. That's exactly what we look for." },
      { text: 'I need money for rent.', reply: "Refreshing! We love honesty here. Mostly." },
      { text: 'What does this company do?', reply: "Nobody has ever asked me that. Let's move on." },
    ]),
    say('HR — DALIA', "Perfect. You start immediately. Don't tell the others.", 2400),
    wait(400),

    // the boss arrives, delighted
    fx(() => { boss.x = HR_X + 260; boss.face = -1; boss.visible = true; }),
    walk('boss', HR_X + 70, 1400),
    say('BOSS — MR. HALEY', "There he is! Welcome aboard. We're really happy you're here.", 2800),
    fx(() => {
      FX.float(P.cx + 16, P.y - 20, 'SHAKE', '#ffd75e', 12);
      FX.spark(P.cx + 20, P.cy, 6, '#ffe9a8', 140);
      SFX.ui(true);
    }),
    say('BOSS — MR. HALEY', 'Let me show you around.', 1800),
    look('boss', 1),

    // the tour — every promise here is a thing you can wreck later
    walk('boss', 380, 1500),
    walk('player', 330, 1500),
    say('BOSS — MR. HALEY', 'Water dispenser. Unlimited water.', 2200),
    fx(() => { if (S.waterCooler) FX.float(S.waterCooler.cx, S.waterCooler.y - 12, 'UNLIMITED', '#7fd1ff', 11); }),

    walk('boss', 2270, 2600),
    walk('player', 2220, 2600),
    say('BOSS — MR. HALEY', 'And free coffee. Help yourself.', 2200),
    fx(() => { if (S.coffeeMachine) FX.float(S.coffeeMachine.cx, S.coffeeMachine.y - 12, 'FREE', '#ffd9a8', 11); }),
    say('BOSS — MR. HALEY', 'Break room. Fifteen minutes, every four hours.', 2400),
    say(S.look.name, '...Fifteen.', 1500),

    walk('boss', DESK_X + 40, 3000),
    walk('player', DESK_X - 10, 3000),
    say('BOSS — MR. HALEY', "And this is your desk. You'll be working with a great team.", 2600),
    say('BOSS — MR. HALEY', "We're a family here.", 2000),
    fx(() => { S.familySaid = true; }),
    say(S.look.name, "...A family.", 1400),
    say('BOSS — MR. HALEY', "I'll leave you to it. Big things ahead!", 2200),

    // and off he goes, not to be seen again until he loses it
    look('boss', 1),
    walk('boss', 4300, 3400),
    fx(() => { boss.visible = false; S.bossHidden = true; }),
    say('', 'SIT AT YOUR DESK TO BEGIN.', 2200),
    fx(() => { S.introDone = true; }),
  ];
}

// ---------------------------------------------------------------
// The player of a scene. Steps one beat at a time; every beat is skippable.
// ---------------------------------------------------------------
export class Story {
  constructor(S) {
    this.S = S;
    this.beats = null;
    this.i = 0;
    this.t = 0;
    this.line = null;
    this.choice = null;
    this.walks = new Map();
    this.done = true;
  }

  play(beats) {
    this.beats = beats;
    this.i = 0; this.t = 0;
    this.line = null; this.choice = null;
    this.walks.clear();
    this.done = false;
    this._enter();
  }

  get active() { return !this.done && !!this.beats; }

  actor(who) {
    if (who === 'player') return this.S.player;
    return this.S.actors[who] || null;
  }

  _enter() {
    const b = this.beats && this.beats[this.i];
    if (!b) { this.done = true; this.line = null; return; }
    this.t = 0;
    if (b.t === 'say') {
      this.line = { who: b.who, text: b.text };
      SFX.ui(true);
    } else if (b.t === 'fx') {
      try { b.fn(); } catch (e) { /* a scene beat must never kill the loop */ }
      this.i++; this._enter(); return;
    } else if (b.t === 'look') {
      const a = this.actor(b.who); if (a) a.face = b.dir;
      this.i++; this._enter(); return;
    } else if (b.t === 'walk') {
      const a = this.actor(b.who);
      if (a) { this.walks.set(a, { from: a.x, to: b.x, ms: b.ms || 1200, el: 0 }); a.face = b.x > a.x ? 1 : -1; }
    } else if (b.t === 'prompt') {
      this.choice = { text: b.text, opts: b.opts, picked: null };
    }
  }

  // Advance on tap/keypress. Dialogue is skippable; a walk is not, so a mashed
  // screen cannot leave an actor stranded mid-stride.
  advance() {
    const b = this.beats && this.beats[this.i];
    if (!b || this.choice) return;
    if (b.t === 'say' || b.t === 'wait') { this.i++; this._enter(); }
  }

  pick(k) {
    if (!this.choice) return;
    const o = this.choice.opts[k];
    this.choice = null;
    SFX.ui(true);
    this.i++;
    // splice the reply in so the answer actually lands
    this.beats.splice(this.i, 0, say('HR — DALIA', o.reply, 2400));
    this._enter();
  }

  step(dt) {
    if (this.done || !this.beats) return;

    // walks run in parallel with whatever beat is showing
    for (const [a, w] of this.walks) {
      w.el += dt * 1000;
      const k = Math.min(1, w.el / w.ms);
      const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;   // ease in/out
      a.x = w.from + (w.to - w.from) * e;
      a.vx = 0;
      a.walking = k < 1;
      if (k >= 1) this.walks.delete(a);
    }

    const b = this.beats[this.i];
    if (!b) { this.done = true; this.line = null; return; }
    if (this.choice) return;

    this.t += dt * 1000;
    if (b.t === 'walk') {
      const a = this.actor(b.who);
      if (!a || !this.walks.has(a)) { this.i++; this._enter(); }
    } else if (this.t >= (b.ms || 1200)) {
      this.i++; this._enter();
    }
  }
}
