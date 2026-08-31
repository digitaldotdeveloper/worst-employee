// MISSIONS — the campaign, script section 3.
//
// Two ways to play, which is the split the script asks for:
//   MISSIONS   a ladder of briefs, each unlocking the next. You start entry
//              level and you are told exactly how little is expected of you.
//   FREE ROAM  the same office with no brief at all. Ruin it however you like.
//
// A mission is a goal plus a pass condition, NOT a script. The office does not
// change between them — what changes is what counts as a good day.

export const MISSIONS = [
  {
    id: 'entry',
    name: 'ENTRY LEVEL',
    role: 'INTERN',
    brief: 'It is your first day. Nobody expects anything of you, which is the '
         + 'safest position you will ever be in. Have a look around. Bother somebody.',
    goals: [
      { text: 'Pester 3 colleagues', check: s => (s.annoyCount || 0) >= 3 },
      { text: 'Reach 300 ruin',      check: s => s.ruin >= 300 },
    ],
    pay: 1200,
  },
  {
    id: 'probation',
    name: 'STILL ON PROBATION',
    role: 'INTERN',
    brief: 'HR has started keeping notes. Break things, but be somewhere else '
         + 'when anyone looks up.',
    goals: [
      { text: 'Destroy 6 objects',            check: s => s.destroyed >= 6 },
      { text: 'Keep boss anger under 55%',    check: s => s.anger < 55, fail: s => s.anger >= 55 },
    ],
    pay: 2200,
  },
  {
    id: 'teamplayer',
    name: 'TEAM PLAYER',
    role: 'EMPLOYEE',
    brief: 'Morale is described internally as "an area for growth". Help.',
    goals: [
      { text: 'Knock 4 colleagues off their feet', check: s => (s.knocked || 0) >= 4 },
      { text: 'Slap somebody 5 times',             check: s => (s.slaps || 0) >= 5 },
    ],
    pay: 3400,
  },
  {
    id: 'printer',
    name: 'THE PRINTER INCIDENT',
    role: 'EMPLOYEE',
    brief: 'Nothing has printed correctly since 2019. Finish the job.',
    goals: [
      { text: 'Destroy 2 printers',        check: s => (s.killed && s.killed.printer >= 2) },
      { text: 'Set off a chain of 5+',     check: s => s.bestChain >= 5 },
    ],
    pay: 5000,
  },
  {
    id: 'caffeine',
    name: 'CAFFEINE WITHDRAWAL',
    role: 'SENIOR EMPLOYEE',
    brief: 'The coffee machine is the only thing holding this floor together. '
         + 'Find out what happens without it.',
    goals: [
      { text: 'Destroy the coffee machine', check: s => s.coffeeMachine && s.coffeeMachine.broken },
      { text: 'Reach 1200 ruin',            check: s => s.ruin >= 1200 },
    ],
    pay: 7500,
  },
  {
    id: 'catastrophe',
    name: 'A GENUINE CATASTROPHE',
    role: 'SUPERVISOR',
    brief: 'Stop pacing yourself.',
    goals: [
      { text: 'Reach 3800 ruin in one shift', check: s => s.ruin >= 3800 },
      { text: 'Complete 2 sabotage jobs',     check: s => (s.jobsDone || 0) >= 2 },
    ],
    pay: 12000,
  },
  {
    id: 'thirteen',
    name: 'FLOOR THIRTEEN',
    role: 'MANAGER',
    brief: 'They have finally given you a lift pass. Go and see what the money '
         + 'looks like up close.',
    goals: [
      { text: 'Reach the executive floor', check: s => s.floor === 'exec' },
      { text: 'Wreck 3 things up there',   check: s => (s.roomKills && (s.roomKills.boss || 0) + (s.roomKills.boardroom || 0) >= 3) },
    ],
    pay: 18000,
  },
  {
    id: 'review',
    name: 'PERFORMANCE REVIEW',
    role: 'MANAGER',
    brief: 'He wants a word. Bring everything you have.',
    goals: [
      { text: 'Push his anger to 100%', check: s => s.anger >= 100 },
      { text: 'Win the fight',          check: s => !!s.bossBeaten },
    ],
    pay: 30000,
  },
];

export const missionById = id => MISSIONS.find(m => m.id === id);

export function nextMission(career) {
  const done = career.missions || [];
  return MISSIONS.find(m => !done.includes(m.id)) || null;
}

export function missionState(career, m, i) {
  const done = career.missions || [];
  if (done.includes(m.id)) return 'done';
  const prev = MISSIONS[i - 1];
  if (!prev || done.includes(prev.id)) return 'open';
  return 'locked';
}

// Evaluated every frame during a mission run.
export class MissionRun {
  constructor(S, m) {
    this.S = S;
    this.m = m;
    this.state = m.goals.map(() => false);
    this.failed = false;
    this.complete = false;
  }

  step() {
    if (this.complete || this.failed) return;
    const s = this.S;
    let all = true;
    this.m.goals.forEach((g, i) => {
      if (g.fail && g.fail(s)) this.failed = true;
      // A goal that has been met STAYS met — a mission is a set of things you
      // did during the shift, not a state you have to be holding at the end.
      let ok = false;
      try { ok = !!g.check(s); } catch (e) { ok = false; }
      if (ok) this.state[i] = true;
      if (!this.state[i]) all = false;
    });
    if (all && !this.failed) {
      this.complete = true;
      s.onMissionComplete && s.onMissionComplete(this.m);
    }
  }
}
