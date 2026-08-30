// WORST EMPLOYEE — tuning. Every number that decides "feel" lives here.
// Change these first; do not scatter magic numbers through the systems.

export const VERSION = '0.1.0';

// Logical resolution. `h` is fixed — it defines the world scale. `w` is set
// at runtime from the device aspect ratio so a wide phone fills its screen
// instead of being pillarboxed. Read it, never cache it.
export const VIEW = { w: 960, h: 540, minW: 760, maxW: 1400 };
export const GRAVITY = 2100;                      // px/s^2
export const FLOOR_Y = 470;                       // office floor line
// Ceiling height, in world px above the floor. The greybox office was 412px of
// wall for a 62px character — 6.6 character-heights, so once the camera zoomed
// in to make the cast readable most of the frame was empty wall. A real office
// is about 1.5x a person; this is a bit more for headroom over a jump.
export const CEIL_Y = FLOOR_Y - 168;
export const ROOF_Y = CEIL_Y - 42;                // ceiling tile strip sits here
export const LEVEL_W = 2600;                      // office width

export const PLAYER = {
  w: 34, h: 62,
  speed: 300,
  accel: 2600,
  friction: 2200,
  airControl: 0.55,
  jump: 720,
  coyote: 0.10,          // grace after leaving ground
  buffer: 0.12,          // jump pressed slightly early still fires
  dodgeSpeed: 660,
  dodgeTime: 0.20,
  dodgeIFrames: 0.16,
  dodgeCooldown: 0.36,
  carryOffset: { x: 26, y: -18 },
  throwSpeed: 900,
  throwLift: -260,
};

// Attacks. `startup` = wind-up, `active` = hitbox live, `recover` = locked after.
// Combat feel is priority #1 in the script, so these get their own block.
export const ATTACK = {
  light: [
    { startup:0.055, active:0.070, recover:0.105, dmg:10, kbX:300, kbY:-110, reach:44, hh:34, hitstop:0.045, shake:3 },
    { startup:0.050, active:0.070, recover:0.110, dmg:12, kbX:340, kbY:-130, reach:46, hh:34, hitstop:0.050, shake:3.5 },
    { startup:0.085, active:0.090, recover:0.230, dmg:22, kbX:640, kbY:-330, reach:54, hh:44, hitstop:0.105, shake:8 },
  ],
  heavy: { startup:0.185, active:0.100, recover:0.300, dmg:34, kbX:900, kbY:-420, reach:62, hh:52, hitstop:0.140, shake:11 },
  comboWindow: 0.34,     // time after recover to chain the next light
  holdForHeavy: 0.19,    // touch: hold HIT this long -> heavy
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
