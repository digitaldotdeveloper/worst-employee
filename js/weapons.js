// WEAPONS AND THE COIN ECONOMY — script sections 15 and 16.
//
// FIVE DECISIONS THIS FILE ENCODES (they came out of an adversarial design
// review; each one closes a specific way this breaks):
//
// D1. An equipped weapon lives in `player.equipped`, NEVER in `player.carrying`.
//     `carrying` drives two things in art.js — the 'carry' and 'swing' frames —
//     and the grab button. Putting a weapon there would freeze the player in the
//     carry pose for the whole shift and hijack GRAB. So `_startAttack` reads
//     `this.carrying || this.equipped` and a grabbed prop still wins.
//
// D2. The equipped weapon's Body is NOT in world.bodies. It never collides, is
//     never drawn by the props loop, is never a target of its own swing, and —
//     the important one — is never passed to damageBody, so it can never break,
//     count as destroyed, add to company damage, or move the anger bar.
//
// D3. Equipped weapons cannot be thrown. GRAB keeps exactly one meaning: pick up
//     and hurl WORLD props. Chairs are still throwable; there are seven of them.
//
// D4. Depth-1 chaos ignites pay nothing (see chaos.js). A hit is a chain SEED,
//     not income. Otherwise a fast weapon is a coin printer and re-hitting an
//     already-broken prop farms forever.
//
// D5. A salary ticks while you work. Destruction is opt-in, so a player who
//     breaks nothing must still be able to afford the shop.

import { SFX } from './audio.js';
import { Music } from './music.js';
import { FX } from './fx.js';

// ---------------------------------------------------------------
// The career save. Coins, owned weapons and earned skills outlive a shift;
// everything else in S is per-shift and gets wiped by startShift().
// ---------------------------------------------------------------
const KEY = 'we.career.v1';

export function defaultCareer() {
  return {
    v: 1,
    bank: 0,            // coins carried between shifts
    lifetime: 0,        // total ever earned, for rank flavour
    owned: ['fists'],
    equipped: 'fists',
    skills: [],
    counters: {},       // mastery progress; skills read this
    shifts: 0,
  };
}

export function loadCareer() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return defaultCareer();
    const d = JSON.parse(raw);
    // Merge onto the default so a save written by an older build never arrives
    // missing a field a newer build reads.
    const c = Object.assign(defaultCareer(), d);
    c.owned = Array.isArray(c.owned) && c.owned.length ? c.owned : ['fists'];
    if (!c.owned.includes('fists')) c.owned.unshift('fists');
    if (!c.owned.includes(c.equipped)) c.equipped = 'fists';
    c.skills = Array.isArray(c.skills) ? c.skills : [];
    c.counters = c.counters && typeof c.counters === 'object' ? c.counters : {};
    return c;
  } catch (e) { return defaultCareer(); }
}

export function saveCareer(c) {
  try { localStorage.setItem(KEY, JSON.stringify(c)); } catch (e) { /* private mode */ }
}

// ---------------------------------------------------------------
// Mastery counters. bump() is the only way one moves, and it checks unlocks on
// the spot so the toast fires mid-shift, when you did the thing.
// ---------------------------------------------------------------
export function bump(s, key, n = 1) {
  const c = s.career.counters;
  c[key] = (c[key] || 0) + n;
  checkUnlocks(s);
}

export function hasSkill(s, id) { return s.career.skills.includes(id); }

export function checkUnlocks(s) {
  const c = s.career.counters;
  for (const id of s.career.owned) {
    const w = WEAPONS[id];
    if (!w) continue;
    for (const sk of w.skills) {
      if (s.career.skills.includes(sk.id) || !sk.req(c)) continue;
      s.career.skills.push(sk.id);
      saveCareer(s.career);
      s.toast(sk.name + ' UNLOCKED', 'boss');
      SFX.promote();
      FX.kick(6, 0.05);
    }
  }
}

// ---------------------------------------------------------------
// THE WEAPONS.
// Script section 15: "Weapons should not simply be stronger versions of previous
// weapons." So every entry below owns one VERB nothing else has, and the stat
// block is secondary. Prices are set so the first unlock lands in shift 1-2.
// ---------------------------------------------------------------
export const WEAPONS = {
  fists: {
    id: 'fists', name: 'FISTS', cost: 0, tag: 'STARTER',
    art: null,
    desc: 'Nothing in your hands. The fastest recovery in the game, and the only '
        + 'loadout where the five-beat string loops inside the combo window.',
    verb: 'Fastest. Full five-hit combo.',
    stats: { reach: 0, hh: 0, dmgMul: 1, kbMul: 1, spd: 1,
             shakeMul: 1, stopMul: 1, sfxMul: 1, wear: 0 },
    skills: [
      { id: 'fists.uppercut', name: 'UPPERCUT', secret: false,
        hint: 'Launch 25 things clean off the floor with beat 4.',
        req: c => (c['fists.launch'] || 0) >= 25 },
      { id: 'fists.counter', name: '???', secret: true,
        hint: '???',
        reveal: 'COUNTER — swing within 0.4s of a dodge and hit twice as hard.',
        req: c => (c['fists.counter'] || 0) >= 6 },
    ],
  },

  keyboard: {
    id: 'keyboard', name: 'KEYBOARD', cost: 2500, tag: 'CHEAP',
    art: 'keyboard',
    desc: 'Ripped out of someone\'s desk. Long, light, and it sprays keycaps '
        + 'everywhere, which starts chains a fist cannot reach.',
    verb: 'Long reach, almost no weight.',
    stats: { reach: 26, hh: 8, dmgMul: 1.25, kbMul: 0.9, spd: 1.05,
             shakeMul: 1.1, stopMul: 1.05, sfxMul: 1.1, wear: 0 },
    onHit: (p, b, s) => { if (Math.random() < 0.5) FX.paper(b.cx, b.cy, 4); },
    skills: [
      { id: 'kb.spray', name: 'KEYCAP SPRAY', secret: false,
        hint: 'Hit 60 things with the keyboard.',
        req: c => (c['keyboard.hits'] || 0) >= 60 },
    ],
  },

  stapler: {
    id: 'stapler', name: 'STAPLER', cost: 9000, tag: 'CHAIN',
    art: 'stapler',
    desc: 'Heavy-duty, and it barely knocks anything back. That is the point — '
        + 'things stay exactly where you can hit them again.',
    verb: 'Keeps targets close. Built for chains.',
    // The only weapon that deliberately does NOT scatter. kbMul below 1 means
    // props stay in reach, which is what makes long chains reachable at all.
    stats: { reach: 8, hh: 4, dmgMul: 1.5, kbMul: 0.28, spd: 1.15,
             shakeMul: 0.9, stopMul: 0.9, sfxMul: 1, wear: 0 },
    skills: [
      { id: 'stapler.jam', name: 'PAPER JAM', secret: false,
        hint: 'Land a chain of 6 or longer while holding it.',
        req: c => (c['stapler.chain'] || 0) >= 1 },
      { id: 'stapler.audit', name: '???', secret: true,
        hint: '???',
        reveal: 'FULL AUDIT — chains you seed with the stapler pay 50% more.',
        req: c => (c['stapler.chain'] || 0) >= 8 },
    ],
  },

  pan: {
    id: 'pan', name: 'FRYING PAN', cost: 22000, tag: 'STUN',
    art: 'pan',
    desc: 'From the break room. Nobody knows whose it is. Connects with a noise '
        + 'that stops a room, and stops people too.',
    verb: 'Stuns people on contact.',
    stats: { reach: 20, hh: 12, dmgMul: 2.1, kbMul: 1.5, spd: 0.9,
             shakeMul: 1.5, stopMul: 1.6, sfxMul: 1.4, wear: 0 },
    // The only weapon that reliably takes a person out of the fight.
    onHit: (p, b, s) => {
      if (b.type === 'npc' && b.knock) {
        b.downT = Math.max(b.downT || 0, 2.6);
        bump(s, 'pan.stun');
        // "connects with a noise that stops a room" - so it gets the bell.
        Music.cue('dinner_bell');
      }
      SFX.smash('metal', 0.5);
    },
    skills: [
      { id: 'pan.ring', name: 'DINNER BELL', secret: false,
        hint: 'Flatten 12 colleagues with it.',
        req: c => (c['pan.stun'] || 0) >= 12 },
    ],
  },

  hammer: {
    id: 'hammer', name: 'HAMMER', cost: 48000, tag: 'DEMOLITION',
    art: 'hammer',
    desc: 'Found in a maintenance cupboard nobody locks. Heavy enough that the '
        + 'heavy attack becomes a ground slam that levels everything nearby.',
    verb: 'Heavy attack becomes a ground slam.',
    stats: { reach: 22, hh: 16, dmgMul: 3.0, kbMul: 2.4, spd: 0.78,
             shakeMul: 1.8, stopMul: 1.7, sfxMul: 1.6, wear: 0 },
    // DISTINCT VERB: an area attack. Nothing else in the game hits behind you.
    slam: { radius: 96, dmg: 34, kbY: -520 },
    skills: [
      { id: 'hammer.slam', name: 'GROUND SLAM', secret: false,
        hint: 'Land 10 heavy hits with the hammer.',
        req: c => (c['hammer.heavy'] || 0) >= 10 },
      { id: 'hammer.quake', name: '???', secret: true,
        hint: '???',
        reveal: 'AFTERSHOCK — the slam reaches half again as far.',
        req: c => (c['hammer.slam'] || 0) >= 15 },
    ],
  },

  rocketchair: {
    id: 'rocketchair', name: 'ROCKET CHAIR', cost: 110000, tag: 'CHAOS',
    art: 'rocketchair',
    desc: 'Two boosters and a lot of duct tape. Dodge becomes a rocket-assisted '
        + 'charge that ploughs through the entire floor.',
    verb: 'Dodge becomes a rocket charge.',
    stats: { reach: 26, hh: 20, dmgMul: 2.4, kbMul: 3.0, spd: 0.85,
             shakeMul: 1.7, stopMul: 1.4, sfxMul: 1.5, wear: 0 },
    // DISTINCT VERB: a movement tool. The dodge stops being defensive.
    charge: { speed: 980, time: 0.52, dmg: 26 },
    skills: [
      { id: 'rc.ride', name: 'FULL THROTTLE', secret: false,
        hint: 'Plough through 40 things in one career.',
        req: c => (c['rc.hits'] || 0) >= 40 },
    ],
  },
};

export const SHOP_ORDER = ['fists', 'keyboard', 'stapler', 'pan', 'hammer', 'rocketchair'];

// Stats for a grabbed world prop — lifted from the original inline maths so a
// grabbed monitor behaves exactly as it did before weapons existed.
export function propStats(wep) {
  const m = 1.6 + Math.min(1.2, wep.mass * 0.35);
  return { reach: wep.w * 0.8 + 10, hh: wep.h * 0.5, dmgMul: m, kbMul: m, spd: 1,
           shakeMul: 1.4, stopMul: 1.35, sfxMul: 1.5, wear: 0.55 };
}

export function statsFor(id) {
  return (WEAPONS[id] || WEAPONS.fists).stats;
}

export function canAfford(career, id) {
  const w = WEAPONS[id];
  return !!w && career.bank >= w.cost;
}

export function buy(career, id) {
  const w = WEAPONS[id];
  if (!w || career.owned.includes(id) || career.bank < w.cost) return false;
  career.bank -= w.cost;
  career.owned.push(id);
  career.equipped = id;
  saveCareer(career);
  return true;
}
