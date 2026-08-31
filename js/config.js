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
export const LEVEL_W = 4400;                      // office width

// ROOMS. The office was one undifferentiated corridor with props sprinkled along
// it, which is why it read as unarranged — there was nothing to arrange them
// AROUND. Each room now has a purpose, its own furniture rules and its own wall
// tint, and they are separated by partition walls with doorways you walk through.
export const DOOR_W = 74;                         // gap you walk through
export const DOOR_H = 104;                        // taller than the player
// Two floors. The boss is NOT on your floor — you never meet him again after the
// tour until you can reach the executive floor, which is the progression gate
// and the reason the lift exists at all.
// THE BUILDING.
//
// Floors are DATA, not code. There were two hand-written build functions, one
// per floor, which is fine for two and absurd for eight — so a floor is now a
// list of rooms, each room names a `kind`, and office.js knows how to furnish
// each kind. Adding a department is adding a row here.
//
// `no` is the number on the lift panel and orders it. `locked` is a reason
// string: present means you cannot go there yet and the panel says why.
// TESTING: every floor open, including the ruin-gated executive floor. The
// `locked` reasons and the needRuin gate below are the real progression and are
// left in place — flip this back to false to restore them. Do not build
// anything that depends on all floors being reachable.
export const UNLOCK_ALL = true;

// liftX is the MIDDLE of every floor now — it sat at the far right of 12 and
// the far left of everything else, so arriving anywhere meant a long walk to
// nothing. stairX is the alternative route, always a room or two away from the
// lift so the two are a real choice rather than the same door twice.
export const FLOORS = {
  park: { id:'park', no:0,  name:'P — CAR PARK',            w:2600, liftX:1300, stairX:1900,
          locked:'The car park is below reception. You do not have a pass.' },
  sales:{ id:'sales', no:9, name:'FLOOR 9 — SALES',         w:3200, liftX:1600, stairX:2200,
          locked:'Sales are on a call. They are always on a call.' },
  fin:  { id:'fin',  no:10, name:'FLOOR 10 — FINANCE',      w:3200, liftX:1600, stairX:2200,
          locked:'Finance have not approved your access request.' },
  it:   { id:'it',   no:11, name:'FLOOR 11 — IT & HR',      w:3400, liftX:1700, stairX:2300,
          locked:'IT will get to your ticket. IT will not get to your ticket.' },
  ops:  { id:'ops',  no:12, name:'FLOOR 12 — OPERATIONS',   w:4400, liftX:2200, stairX:2800 },
  exec: { id:'exec', no:13, name:'FLOOR 13 — EXECUTIVE',    w:2600, liftX:1300, stairX:900,
          needRuin: 2500,
          locked: 'The lift needs an executive pass. Ruin enough of floor 12 and they will hand you one.' },
};

// Each room is [id, name, x0, x1, tint, kind]. `kind` is the furnishing recipe
// office.js runs; `name` is what the floor label says as you walk through.
export const FLOOR_ROOMS = {
  park: [
    { id:'bays',   name:'PARKING BAYS',     x0:0,    x1:1700, tint:'#22242c', kind:'park' },
    { id:'ramp',   name:'THE RAMP',         x0:1700, x1:2200, tint:'#25272f', kind:'empty' },
    { id:'plobby', name:'LIFT LOBBY',       x0:2200, x1:2600, tint:'#2b2e3a', kind:'lobby' },
  ],
  sales: [
    { id:'slobby', name:'LIFT LOBBY',       x0:0,    x1:420,  tint:'#2f3346', kind:'lobby' },
    { id:'floor',  name:'THE SALES FLOOR',  x0:420,  x1:2200, tint:'#2b2636', kind:'openplan' },
    { id:'pit',    name:'THE BULLPEN',      x0:2200, x1:2800, tint:'#302a38', kind:'openplan' },
    { id:'smgr',   name:"SALES MANAGER",    x0:2800, x1:3200, tint:'#38303c', kind:'office' },
  ],
  fin: [
    { id:'flobby', name:'LIFT LOBBY',       x0:0,    x1:420,  tint:'#2f3346', kind:'lobby' },
    { id:'acct',   name:'ACCOUNTING',       x0:420,  x1:1700, tint:'#262a38', kind:'openplan' },
    { id:'payr',   name:'PAYROLL',          x0:1700, x1:2400, tint:'#242c34', kind:'openplan' },
    { id:'fmgr',   name:'FINANCE DIRECTOR', x0:2400, x1:2900, tint:'#333042', kind:'office' },
    { id:'vault',  name:'THE ARCHIVE',      x0:2900, x1:3200, tint:'#222630', kind:'archive' },
  ],
  it: [
    { id:'ilobby', name:'LIFT LOBBY',       x0:0,    x1:420,  tint:'#2f3346', kind:'lobby' },
    { id:'helpd',  name:'IT HELPDESK',      x0:420,  x1:1500, tint:'#232c34', kind:'openplan' },
    { id:'server', name:'SERVER ROOM',      x0:1500, x1:2100, tint:'#1e2830', kind:'server' },
    { id:'hr',     name:'HR',               x0:2100, x1:2800, tint:'#332c38', kind:'openplan' },
    { id:'hrmtg',  name:'THE QUIET ROOM',   x0:2800, x1:3400, tint:'#36303a', kind:'meeting' },
  ],
  ops: [
    { id:'reception', name:'RECEPTION',     x0:0,    x1:640,  tint:'#2f3346', kind:'reception' },
    { id:'openplan',  name:'OPEN PLAN',     x0:640,  x1:2180, tint:'#262a38', kind:'openplan' },
    { id:'break',     name:'BREAK ROOM',    x0:2180, x1:2900, tint:'#33301f', kind:'kitchen' },
    { id:'meeting',   name:'CONFERENCE ROOM', x0:2900, x1:3560, tint:'#232b39', kind:'meeting' },
    { id:'admin',     name:'ADMIN',         x0:3560, x1:4400, tint:'#2b2f3f', kind:'openplan' },
  ],
  exec: [
    { id:'lift',      name:'LIFT LOBBY',    x0:0,    x1:520,  tint:'#3a3348', kind:'lobby' },
    { id:'boardroom', name:'BOARDROOM',     x0:520,  x1:1500, tint:'#2b3040', kind:'meeting' },
    { id:'pa',        name:"EXECUTIVE ASSISTANT", x0:1500, x1:1980, tint:'#333a4e', kind:'openplan' },
    { id:'boss',      name:"THE BOSS'S OFFICE", x0:1980, x1:2600, tint:'#42302c', kind:'bossoffice' },
  ],
};

// Who works where. [name, title, art, room id]. The art sets repeat on purpose
// for now — three coworker sets across eight departments — so these read as
// different PEOPLE through name and title until more sets exist.
export const FLOOR_STAFF = {
  sales: [['TAREK','SALES LEAD','npc-sami','floor'], ['MAYA','ACCOUNT EXEC','npc-rita','floor'],
          ['ZIAD','ACCOUNT EXEC','npc-omar','pit'],  ['HANA','SALES MANAGER','npc-rita','smgr']],
  fin:   [['RITA','ACCOUNTS','npc-rita','acct'],     ['FADI','PAYROLL','npc-omar','payr'],
          ['GEORGES','FINANCE DIRECTOR','npc-sami','fmgr']],
  it:    [['OMAR','IT SUPPORT','npc-omar','helpd'],  ['SILA','SYSADMIN','npc-rita','server'],
          ['NOUR','HR','npc-rita','hr'],             ['WALID','HR MANAGER','npc-sami','hrmtg']],
};

export const ROOMS = [
  { id:'reception', name:'RECEPTION',        x0:0,    x1:640,  tint:'#2f3346' },
  { id:'openplan',  name:'OPEN PLAN',        x0:640,  x1:2180, tint:'#262a38' },
  { id:'break',     name:'BREAK ROOM',       x0:2180, x1:2900, tint:'#33301f' },
  { id:'meeting',   name:'MEETING ROOM',     x0:2900, x1:3560, tint:'#232b39' },
  { id:'boss',      name:"THE BOSS'S OFFICE",x0:3560, x1:4400, tint:'#3a2b2b' },
];
// The active floor's rooms. Set by buildOffice; roomAt() follows it.
export const CUR = { rooms: FLOOR_ROOMS.ops, floor: 'ops' };
export const roomAt = x => CUR.rooms.find(r => x >= r.x0 && x < r.x1) || CUR.rooms[0];

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

// THE SLAP — three beats inside one window, counted DOWN from `cd` to 0.
//   cd .. contact   wind-up   (the arm is still back)
//   contact .. recover   contact   (the hand has arrived; the blow lands here)
//   recover .. 0    recovery  (back to the grip)
// `cd` is a balance number — it gates how fast you can slap and therefore ruin
// per second — and is deliberately unchanged from the value the economy was
// measured against. The other two are animation. They live here rather than in
// player.js because poseFor reads them too, and the pose boundaries drifting
// away from the moment the blow lands is precisely how the slap ended up
// connecting with nothing in the first place.
export const SLAP = { cd: 0.26, contact: 0.19, recover: 0.10 };

// WEIGHT. Prop masses already ran 0.4 (mug) to 5.5 (filing cabinet) — a 14x
// spread that changed nothing you could feel. You snatched a cabinet as fast as
// a phone, walked at full speed carrying it, and threw a sheet of paper on the
// same arc as a printer. The stats existed; the FEEL of picking something up
// did not, which is why every prop played the same in the hand.
export const CARRY = {
  slowPerMass:  0.085,   // fraction of top speed lost per unit of mass
  minSpeed:     0.45,    // a cabinet is a shuffle, never a standstill
  heavePerMass: 0.055,   // seconds of pickup lockout per unit of mass
  heaveMin:     0.05,    // even a mug has a beat, so light still reads as light
  heaveMax:     0.40,
  throwPerMass: 0.085,   // heavy things go shorter and drop sooner
  throwMin:     0.40,
};

export const CHAOS = {
  minEnergy: 130,        // impact speed needed to make a thing "chaotic"
  // 2.4s was long enough that a chain essentially never lapsed during ordinary
  // play — measured: continuously alive across 60s of mashing. If the window
  // never closes, the multiplier stops being a reward for setting something up
  // and becomes a number that only goes up. Short enough now that a cascade has
  // to actually cascade.
  chainWindow: 1.4,      // seconds a chain stays alive
  coinBase: 13,          // coins per link, before multiplier
  damageScale: 1.0,
};

// Boss anger, globally scaled. Fourteen call sites raise anger and each was
// individually reasonable; together they took a mashing bot from FRIENDLY to
// BOSS FIGHT in 60 seconds, which spends the game's one polished set-piece
// before the player has used jump, dodge, grab or a weapon. The five stages are
// meant to be a shift-long arc, so the whole curve is scaled in one place
// rather than re-balancing every site.
export const ANGER = { rate: 0.3 };

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
