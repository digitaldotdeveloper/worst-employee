// SABOTAGE — the actual game.
//
// The fantasy is NOT "I get to beat up my boss". It is "how catastrophically can
// I ruin this workday?" That distinction decides everything in this file:
//
//  - The headline number is RUIN, not damage. Damage is money; ruin is how much
//    of the working day stopped happening because of you.
//  - Consequences PERSIST and COMPOUND. A wrecked desk doesn't just cost $420,
//    it takes a person out of action for the rest of the shift, and their work
//    stops with them.
//  - Objectives are specific acts of sabotage with names, because "destroy 10
//    objects" is a chore and "make the printer eat the quarterly report" is a
//    story you retell.
//
// Combat is a means to ruin, never the point.

import { FX } from './fx.js';
import { SFX } from './audio.js';

// ---------------------------------------------------------------
// RUIN. Every source is weighted by how much of the WORKDAY it stops, not by
// how expensive it was. Unplugging one monitor beats smashing three plants.
// ---------------------------------------------------------------
export const RUIN = {
  deskDown: 140,      // a workstation nobody can use again today
  workerDown: 90,     // a person who has stopped working
  workerAnnoyed: 18,
  coffeeDead: 400,    // the entire floor notices
  waterDead: 220,
  printerDead: 260,
  chainLink: 24,
  objective: 0,       // objectives carry their own value
};

export const RUIN_TIERS = [
  { at: 0,     name: 'A NORMAL DAY',        note: 'Nobody will remember this.' },
  { at: 400,   name: 'A BAD MORNING',       note: 'Someone has already complained.' },
  { at: 1100,  name: 'AN INCIDENT',         note: 'There will be an email about this.' },
  { at: 2200,  name: 'A SITUATION',         note: 'HR has opened a file.' },
  { at: 3800,  name: 'A CATASTROPHE',       note: 'The floor stopped working at 11am.' },
  { at: 6000,  name: 'A DAY OFF FOR EVERYONE', note: 'They sent everyone home.' },
  { at: 9000,  name: 'AN INSURANCE CLAIM',  note: 'Legal is involved now.' },
];

export const ruinTier = v => {
  let t = RUIN_TIERS[0];
  for (const r of RUIN_TIERS) if (v >= r.at) t = r;
  return t;
};

// ---------------------------------------------------------------
// SABOTAGE JOBS. Three per shift, drawn from the pool. Each is a named act with
// a punchline, not a counter.
// ---------------------------------------------------------------
export const JOBS = [
  { id: 'coffee', name: 'CUT THE COFFEE',
    brief: 'Destroy the coffee machine.',
    done: 'The floor has nothing left to live for.',
    ruin: 500, pay: 900,
    check: s => s.coffeeMachine && s.coffeeMachine.broken },

  { id: 'desks3', name: 'CLEAR THE FLOOR',
    brief: 'Put 3 workstations out of action.',
    done: 'Three people are now just sitting there.',
    ruin: 420, pay: 800,
    check: s => s.deskDown >= 3 },

  { id: 'pester', name: 'DEATH BY A THOUSAND CHATS',
    brief: 'Pester 6 colleagues.',
    done: 'Nobody on this floor finished a thought today.',
    ruin: 260, pay: 700,
    check: s => (s.annoyCount || 0) >= 6 },

  { id: 'chain6', name: 'DOMINO EFFECT',
    brief: 'Set off a chain of 6 or longer.',
    done: 'One shove. Six casualties.',
    ruin: 380, pay: 850,
    check: s => s.bestChain >= 6 },

  { id: 'printer', name: 'PAPER JAM',
    brief: 'Destroy 2 printers.',
    done: 'Nothing will be printed here again.',
    ruin: 300, pay: 650,
    check: s => (s.killed && s.killed.printer >= 2) },

  { id: 'water', name: 'DROUGHT',
    brief: 'Take out a water cooler.',
    done: 'Unlimited water. Allegedly.',
    ruin: 240, pay: 550,
    check: s => (s.killed && s.killed.cooler >= 1) },

  { id: 'flatten', name: 'TEAM BUILDING',
    brief: 'Knock 4 colleagues off their feet.',
    done: 'Morale is described internally as "mixed".',
    ruin: 340, pay: 750,
    check: s => (s.knocked || 0) >= 4 },

  { id: 'quiet', name: 'PLAUSIBLE DENIABILITY',
    brief: 'Reach 800 ruin without destroying more than 4 things.',
    done: 'Nobody can prove it was you.',
    ruin: 500, pay: 1200,
    check: s => s.ruin >= 800 && s.destroyed <= 4 },

  { id: 'meeting', name: 'CANCEL THE MEETING',
    brief: 'Wreck 4 things in the meeting room.',
    done: 'The 2pm is postponed indefinitely.',
    ruin: 320, pay: 700,
    check: s => (s.roomKills && s.roomKills.meeting >= 4) },

  { id: 'boss', name: 'PERFORMANCE REVIEW',
    brief: "Wreck 3 things in the boss's office.",
    done: 'He is going to notice that.',
    ruin: 600, pay: 1400,
    check: s => (s.roomKills && s.roomKills.boss >= 3) },
];

export class Sabotage {
  constructor(S) { this.S = S; this.active = []; }

  // Three jobs, never the same two shifts running if it can be helped.
  roll(seedList) {
    const pool = JOBS.filter(j => !(seedList || []).includes(j.id));
    const src = pool.length >= 3 ? pool : JOBS;
    const picked = [];
    const used = new Set();
    // deterministic-ish spread without Math.random in a workflow-safe way
    while (picked.length < 3 && used.size < src.length) {
      const i = Math.floor(Math.random() * src.length);
      if (used.has(i)) continue;
      used.add(i);
      picked.push({ ...src[i], complete: false });
    }
    this.active = picked;
    return picked.map(p => p.id);
  }

  step() {
    const s = this.S;
    for (const j of this.active) {
      if (j.complete) continue;
      let ok = false;
      try { ok = !!j.check(s); } catch (e) { ok = false; }
      if (!ok) continue;
      j.complete = true;
      s.ruin += j.ruin;
      s.coins += j.pay;
      s.jobsDone = (s.jobsDone || 0) + 1;
      s.toast(`${j.name} — ${j.done}`, 'event');
      FX.float(s.player.cx, s.player.y - 30, `+${j.pay}`, '#ffd75e', 15);
      FX.kick(7, 0.06);
      SFX.promote();
    }
  }
}

// ---------------------------------------------------------------
// CAREER LADDER — script section 20. You climb by ruining things, which is the
// joke: the worse the day you cause, the better your year goes.
// ---------------------------------------------------------------
export const RANKS = [
  { at: 0,      title: 'INTERN',          pay: 500 },
  { at: 3000,   title: 'EMPLOYEE',        pay: 1800 },
  { at: 9000,   title: 'SENIOR EMPLOYEE', pay: 3200 },
  { at: 20000,  title: 'SUPERVISOR',      pay: 5000 },
  { at: 38000,  title: 'MANAGER',         pay: 8000 },
  { at: 65000,  title: 'SENIOR MANAGER',  pay: 12000 },
  { at: 100000, title: 'DIRECTOR',        pay: 18000 },
  { at: 150000, title: 'VICE PRESIDENT',  pay: 26000 },
  { at: 220000, title: 'EXECUTIVE',       pay: 40000 },
  { at: 320000, title: 'CEO',             pay: 90000 },
];

export function rankFor(lifetimeRuin) {
  let r = RANKS[0], next = null;
  for (let i = 0; i < RANKS.length; i++) {
    if (lifetimeRuin >= RANKS[i].at) { r = RANKS[i]; next = RANKS[i + 1] || null; }
  }
  return { rank: r, next };
}
