// WORST EMPLOYEE — tuning. Every number that decides "feel" lives here.
// Change these first; do not scatter magic numbers through the systems.

export const VERSION = '0.1.0';

// Logical resolution. `h` is fixed — it defines the world scale. `w` is set
// at runtime from the device aspect ratio so a wide phone fills its screen
// instead of being pillarboxed. Read it, never cache it.
export const VIEW = { w: 960, h: 540, minW: 760, maxW: 1400 };
export const GRAVITY = 1750;                      // px/s^2
export const FLOOR_Y = 470;                       // office floor line
// Ceiling height, in world px above the floor. The greybox office was 412px of
// wall for a 62px character — 6.6 character-heights, so once the camera zoomed
// in to make the cast readable most of the frame was empty wall. A real office
// is about 1.5x a person; this is a bit more for headroom over a jump.
export const CEIL_Y = FLOOR_Y - 168;
export const ROOF_Y = CEIL_Y - 42;                // ceiling tile strip sits here
export const LEVEL_W = 2600;                      // office width

// PACE. Everything here was roughly 40% faster and it read as twitchy rather
// than punchy — you could cross the office before a swing finished, so nothing
// had weight. Slower movement and longer attack frames give each hit room to
// land. If it ever feels sluggish, raise `speed` and `accel` together and shorten
// `recover`, in that order.
export const PLAYER = {
  w: 34, h: 62,
  speed: 205,
  accel: 1500,
  friction: 1500,
  airControl: 0.48,
  jump: 640,
  coyote: 0.11,
  buffer: 0.14,
  dodgeSpeed: 500,
  dodgeTime: 0.26,
  dodgeIFrames: 0.20,
  dodgeCooldown: 0.48,
  carryOffset: { x: 26, y: -18 },
  throwSpeed: 780,
  throwLift: -230,
};

// A FIVE-BEAT COMBO. Each beat has its own drawn frame and its own silhouette:
// jab, cross, hook, uppercut, spinning kick. The finisher launches.
// `startup` = wind-up, `active` = hitbox live, `recover` = locked after.
export const ATTACK = {
  light: [
    { startup:0.085, active:0.075, recover:0.150, dmg:10, kbX:230, kbY:-70,  reach:46, hh:34, hitstop:0.055, shake:3,   pose:'c1' },
    { startup:0.080, active:0.075, recover:0.155, dmg:12, kbX:280, kbY:-90,  reach:48, hh:34, hitstop:0.060, shake:3.5, pose:'c2' },
    { startup:0.095, active:0.085, recover:0.180, dmg:15, kbX:340, kbY:-120, reach:52, hh:38, hitstop:0.070, shake:4.5, pose:'c3' },
    { startup:0.110, active:0.090, recover:0.210, dmg:20, kbX:300, kbY:-430, reach:50, hh:46, hitstop:0.095, shake:7,   pose:'c4' },
    { startup:0.150, active:0.110, recover:0.330, dmg:28, kbX:760, kbY:-330, reach:62, hh:48, hitstop:0.130, shake:10,  pose:'c5' },
  ],
  heavy: { startup:0.240, active:0.120, recover:0.380, dmg:38, kbX:980, kbY:-420, reach:66, hh:54, hitstop:0.165, shake:12, pose:'heavy' },
  comboWindow: 0.45,     // longer, so a five-hit string is actually reachable
  holdForHeavy: 0.20,
};

export const CHAOS = {
  minEnergy: 130,        // impact speed needed to make a thing "chaotic"
  chainWindow: 2.4,      // seconds a chain stays alive
  coinBase: 60,          // coins per link, before multiplier
  damageScale: 1.0,
};

export const COFFEE = {
  duration: 12,
  speedMul: 1.30,        // script: +30% movement
  chaosMul: 1.10,        // +10% chaos generation
  capsuleCost: 14,       // $ per cup, feeds the running joke
};

// Boss anger, script section 17.
export const ANGER_STAGES = [
  { at: 0,   name: 'FRIENDLY',  line: "Hey, don't worry about it." },
  { at: 20,  name: 'CONCERNED', line: "Maybe don't do that again." },
  { at: 45,  name: 'ANNOYED',   line: "What are you doing?" },
  { at: 75,  name: 'ANGRY',     line: "FIRASS!" },
  { at: 100, name: 'BOSS FIGHT',line: "I HAVE HAD ENOUGH!" },
];

// Two ways to end a shift. Wrecking the place is the loud one; doing almost
// nothing and still getting paid is the other (script section 28, QUIET
// QUITTING). Destruction is opt-in, so the report has to recognise both.
export const QUIET_RANKS = [
  { at: 0,   name: 'MODEL EMPLOYEE' },
  { at: 250, name: 'QUIET QUITTER' },
  { at: 700, name: 'PROFESSIONAL LOITERER' },
  { at: 1400, name: 'PAID TO EXIST' },
];

export const RANKS = [
  { at: 0,      name: 'EMPLOYEE OF THE MONTH' },
  { at: 4000,   name: 'UNDERPERFORMER' },
  { at: 12000,  name: 'HR CONCERN' },
  { at: 26000,  name: 'LIABILITY' },
  { at: 48000,  name: 'CORPORATE TERROR' },
  { at: 80000,  name: 'WORST EMPLOYEE' },
];

// Greybox palette. Replaced wholesale once real art lands.
export const COL = {
  bgFar:   '#1a1d27',
  bgWall:  '#232735',
  bgTrim:  '#2c3142',
  window:  '#3a4a66',
  floor:   '#2a2e3c',
  floorLn: '#343949',
  player:  '#7fd1ff',
  playerD: '#3f8fc4',
  npc:     '#9aa1b5',
  npcHurt: '#c96b6b',
  boss:    '#ff7b7b',
  bossD:   '#b83f3f',
  prop:    '#5a6076',
  propHot: '#ffd75e',
  broken:  '#3a3f52',
  paper:   '#e6e8ef',
  coffee:  '#8a5a2b',
};
