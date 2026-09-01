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

  // stapler / frying pan / hammer / rocket chair lived here and were CUT, not
  // hidden. Script 15 says a weapon must own a verb nothing else has, and four
  // of them were reskins of "swing it harder" sharing the fist animation set —
  // which is exactly what they felt like in the hand. One real alternative to
  // fists, with its own moves, beats five that all play the same.
  // Their art is still in assets/weapons/ for when they come back earning it.
};

// FILTERED AGAINST WEAPONS, ALWAYS. This was a plain literal listing all six,
// and cutting four of them from the catalogue left four ids here pointing at
// nothing — so buildShop read `undefined.cost` and the SUPPLY CUPBOARD, a button
// on the title screen, threw on open. It had been broken since the cut.
//
// A hand-kept parallel list of the same things is a list that will disagree
// with itself eventually. This one cannot: the order is intent, the contents
// are whatever actually exists.
const SHOP_ORDER_INTENT = ['fists', 'keyboard', 'stapler', 'pan', 'hammer', 'rocketchair'];
export const SHOP_ORDER = SHOP_ORDER_INTENT.filter(id => !!WEAPONS[id]);

// EVERY GRABBED PROP FIGHTS DIFFERENTLY.
//
// A chair is a wide clumsy sweep. A monitor is heavy and shatters. A fire
// extinguisher is a club that can also be SPRAYED. Treating them all as
// "mass x 0.35" made picking a thing up a numbers decision rather than a
// tactical one.
//
//   glass    shatters on impact, spraying shards that cut everyone nearby
//   sweep    hits everything in the arc, not just the first thing
//   heavy    slow, enormous knockback
//   light    fast, low damage, keeps a chain alive
//   spray    has a second use: hold USE to empty it over somebody
export const PROP_STYLES = {
  monitor:      { name: 'MONITOR',      style: 'glass', dmgMul: 2.6, kbMul: 1.8, reachMul: 1.0, wear: 1.4, shards: 14 },
  mug:          { name: 'MUG',          style: 'glass', dmgMul: 1.4, kbMul: 0.9, reachMul: 0.7, wear: 2.2, shards: 8 },
  cooler:       { name: 'WATER COOLER', style: 'glass', dmgMul: 3.0, kbMul: 2.2, reachMul: 1.1, wear: 1.1, shards: 18 },
  chair:        { name: 'CHAIR',        style: 'sweep', dmgMul: 2.2, kbMul: 2.6, reachMul: 1.4, wear: 0.5, sweep: true },
  printer:      { name: 'PRINTER',      style: 'heavy', dmgMul: 3.2, kbMul: 3.0, reachMul: 0.9, wear: 0.7 },
  cabinet:      { name: 'FILING CABINET', style: 'heavy', dmgMul: 3.6, kbMul: 3.4, reachMul: 0.9, wear: 0.4 },
  coffee:       { name: 'COFFEE MACHINE', style: 'heavy', dmgMul: 2.8, kbMul: 2.4, reachMul: 0.9, wear: 1.0 },
  extinguisher: { name: 'EXTINGUISHER', style: 'spray', dmgMul: 2.4, kbMul: 2.0, reachMul: 1.0, wear: 0.3, spray: true },
  stack:        { name: 'PAPERS',       style: 'light', dmgMul: 0.6, kbMul: 0.4, reachMul: 0.9, wear: 3.0, paper: true },
  phone:        { name: 'PHONE',        style: 'light', dmgMul: 1.3, kbMul: 1.0, reachMul: 1.2, wear: 1.6 },
  plant:        { name: 'POTTED PLANT', style: 'sweep', dmgMul: 1.8, kbMul: 1.5, reachMul: 1.1, wear: 1.5 },
  bin:          { name: 'BIN',          style: 'light', dmgMul: 1.5, kbMul: 1.4, reachMul: 1.0, wear: 1.2 },
};

export const propStyle = kind => PROP_STYLES[kind] || null;

export function propStats(wep) {
  const s = PROP_STYLES[wep.kind];
  if (!s) {
    const m = 1.6 + Math.min(1.2, wep.mass * 0.35);
    return { reach: wep.w * 0.8 + 10, hh: wep.h * 0.5, dmgMul: m, kbMul: m, spd: 1,
             shakeMul: 1.4, stopMul: 1.35, sfxMul: 1.5, wear: 0.55 };
  }
  return {
    reach: (wep.w * 0.8 + 10) * s.reachMul,
    hh: wep.h * 0.5 + (s.sweep ? 14 : 0),
    dmgMul: s.dmgMul, kbMul: s.kbMul, spd: 1,
    shakeMul: s.style === 'heavy' ? 1.8 : 1.4,
    stopMul: s.style === 'heavy' ? 1.7 : 1.35,
    sfxMul: 1.5, wear: s.wear,
    style: s.style, shards: s.shards || 0, sweep: !!s.sweep, paper: !!s.paper,
  };
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
