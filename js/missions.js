// MISSIONS — the campaign ladder.
//
// THREE RULES THIS FILE OBEYS:
//
// 1. THE BRIEF STATES THE GOAL, NEVER THE METHOD. Every mission tells you what
//    a good day looks like and refuses to tell you how. The `hint` line is a
//    nudge toward a VERB, never a walkthrough.
//
// 2. A DIFFERENT VERB EACH TIME. Explore, investigate, fake it, sneak, chain,
//    time it, negotiate, escalate. If two missions in a row are "hit things
//    until a number goes up", one of them is wrong. Fighting is ONE verb out of
//    nine, and it is the last one.
//
// 3. IT GETS HARDER BY ASKING MORE OF YOU, not by raising a threshold. Mission 2
//    wants a number. Mission 5 wants you to understand how chains work. Mission
//    7 wants you to notice that there are four ways to solve it.

export const MISSIONS = [
  {
    id: 'entry',
    name: 'ENTRY LEVEL',
    role: 'INTERN',
    verb: 'EXPLORE',
    brief: 'First day. Nobody expects anything of you, which is the safest '
         + 'position you will ever hold. Have a look around.',
    hint: 'Almost everything in this office does something. Try the USE button on things.',
    goals: [
      { text: 'Say hello to 3 colleagues',   check: s => (s.annoyCount || 0) >= 3 },
      { text: 'Find 4 things you can touch', check: s => (s.day.seen || []).length >= 4 },
    ],
    pay: 1200,
  },

  {
    id: 'documents',
    name: 'SORT THESE DOCUMENTS',
    role: 'INTERN',
    verb: 'DECIDE',
    brief: 'A stack of papers and no explanation of what sorting them means. '
         + 'Your manager will check at the end of the day.',
    hint: 'You could do it. You could also make it look done. Both count.',
    // TWO WAYS TO PASS, and the mission never says which it wants.
    goals: [
      { text: 'Do the work (40%) — or make it moot (20 chaos)',
        check: s => s.day.work >= 40 || s.day.chaos >= 900 },
      { text: 'Keep suspicion below 40%', check: s => s.day.suspicion < 40,
        fail: s => s.day.suspicion >= 40 },
    ],
    pay: 2000,
  },

  {
    id: 'whodrank',
    name: 'WHO DRANK MY COFFEE',
    role: 'EMPLOYEE',
    verb: 'INVESTIGATE',
    brief: "Somebody has been taking other people's mugs. There is a culprit. "
         + 'This office is full of things people leave lying around.',
    hint: 'Drawers. Bins. Screens. People write things down and then throw them away.',
    goals: [
      { text: 'Find 3 secrets',      check: s => s.day.secrets >= 3 },
      { text: 'Break nothing at all', check: s => s.destroyed === 0, fail: s => s.destroyed > 0 },
    ],
    pay: 3200,
  },

  {
    id: 'decaf',
    name: 'THE DECAF CONSPIRACY',
    role: 'EMPLOYEE',
    verb: 'SNEAK',
    brief: 'The coffee machine holds this floor together. Find out what happens '
         + 'without it — without anyone working out that it was you.',
    hint: 'There is a quiet way to ruin coffee and a loud one. Only one of them keeps suspicion down.',
    goals: [
      { text: 'Deal with the coffee', check: s => s.day.secretList && s.day.secretList.includes('THE DECAF INCIDENT') },
      { text: 'Suspicion under 25%',  check: s => s.day.suspicion < 25, fail: s => s.day.suspicion >= 25 },
    ],
    pay: 4600,
  },

  {
    id: 'accident',
    name: 'IT LOOKED LIKE AN ACCIDENT',
    role: 'SENIOR EMPLOYEE',
    verb: 'CHAIN',
    brief: 'The printer has to stop working today. It must not look like anybody '
         + 'touched it.',
    hint: 'Hitting it yourself is obvious. Something else hitting it is not. '
        + 'Hit one thing HARD and see what it lands on.',
    goals: [
      { text: 'Destroy a printer',              check: s => (s.killed && s.killed.printer >= 1) },
      { text: 'Do it inside a chain of 4+',     check: s => s.bestChain >= 4 },
      { text: 'Destroy fewer than 6 things',    check: s => s.destroyed < 6, fail: s => s.destroyed >= 6 },
    ],
    pay: 6800,
  },

  {
    id: 'drill',
    name: 'NOBODY IS WATCHING',
    role: 'SENIOR EMPLOYEE',
    verb: 'TIME IT',
    brief: 'There is a fire drill scheduled. For eleven seconds this floor will '
         + 'be completely empty of witnesses. Be ready.',
    hint: 'Wait for the drill. Everything you do while the alarm is going counts double.',
    goals: [
      { text: 'Cause 900 ruin DURING a drill', check: s => (s.drillRuin || 0) >= 900 },
    ],
    pay: 9000,
  },

  {
    id: 'presentation',
    name: 'THE ASSIGNMENT',
    role: 'SUPERVISOR',
    verb: 'YOUR CHOICE',
    brief: 'There is a client presentation. It is terrible. Get it ready.',
    hint: 'The brief says get it ready. It does not say fix it, and it does not '
        + 'say who has to do it.',
    // FOUR ROUTES, none signposted. Any ONE of them passes.
    goals: [
      { text: 'Get the presentation ready — somehow',
        check: s => s.day.work >= 70
                 || s.day.secrets >= 3
                 || s.day.relationships >= 3
                 || s.day.chaos >= 2600 },
    ],
    routes: [
      'You sat down and fixed it. Nobody will ever know you did.',
      "You took another department's deck and changed the logo.",
      'You got somebody who actually knows the client to do it for you.',
      'There is no presentation. There is no projector. There is no meeting.',
    ],
    pay: 14000,
  },

  {
    id: 'thirteen',
    name: 'FLOOR THIRTEEN',
    role: 'MANAGER',
    verb: 'ESCALATE',
    brief: 'Nobody below management has ever seen floor thirteen. They give out '
         + 'lift passes for results, and results means damage.',
    hint: 'The lift will not take you up until you have earned it. Ruin enough of twelve.',
    goals: [
      { text: 'Reach the executive floor', check: s => s.floor === 'exec' },
      { text: 'Take 3 things up there apart',
        check: s => (s.roomKills && (s.roomKills.boss || 0) + (s.roomKills.boardroom || 0) + (s.roomKills.pa || 0) >= 3) },
    ],
    pay: 20000,
  },

  {
    id: 'review',
    name: 'PERFORMANCE REVIEW',
    role: 'MANAGER',
    verb: 'FIGHT',
    brief: 'He wants a word. Upstairs. Now.',
    hint: 'You have been building to this since the handshake.',
    goals: [
      { text: 'Push him to 100%',  check: s => s.anger >= 100 },
      { text: 'Win',               check: s => !!s.bossBeaten },
    ],
    pay: 40000,
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

export class MissionRun {
  constructor(S, m) {
    this.S = S;
    this.m = m;
    this.state = m.goals.map(() => false);
    this.failed = false;
    this.failReason = '';
    this.complete = false;
  }

  step() {
    if (this.complete || this.failed) return;
    const s = this.S;
    let all = true;
    this.m.goals.forEach((g, i) => {
      if (g.fail) {
        let bad = false;
        try { bad = !!g.fail(s); } catch (e) { bad = false; }
        if (bad) { this.failed = true; this.failReason = g.text; }
      }
      // A goal once met STAYS met: a mission is a set of things you did during
      // the day, not a state you have to be holding when the whistle goes.
      let ok = false;
      try { ok = !!g.check(s); } catch (e) { ok = false; }
      if (ok) this.state[i] = true;
      if (!this.state[i]) all = false;
    });
    if (this.failed && s.onMissionFailed) { s.onMissionFailed(this.m, this.failReason); return; }
    if (all && !this.failed) {
      this.complete = true;
      if (s.onMissionComplete) s.onMissionComplete(this.m);
    }
  }
}
