// DAYS — the campaign proper.
//
// THE FUNDAMENTAL RULE: the game states the GOAL and never the METHOD.
// Day 1 teaches the sandbox. Day 2 teaches that the sandbox is the mission
// system. After that the game stops telling you anything.
//
// The scoreboard is six numbers, not one, because "how did the day go" is not a
// single axis: you can finish the work AND wreck the place AND get away with it,
// and those are three different achievements.

// ---------------------------------------------------------------
// THE SIX NUMBERS
// ---------------------------------------------------------------
export function freshDay() {
  return {
    work: 0,          // % of the assigned task actually done
    chaos: 0,         // % of the mess you could have caused
    suspicion: 0,     // % chance anyone thinks it was you
    damage: 0,        // $ of company property
    relationships: 0, // colleagues who now consider you a person
    secrets: 0,       // things you were not supposed to find out
    seen: [],         // interactable ids already used
  };
}

// Chaos is measured against a ceiling rather than raw, so the number means
// "how close to total" rather than "big number go up".
export const CHAOS_CEILING = 4200;

// ---------------------------------------------------------------
// INTERACTABLES — the discovery.
//
// After the tutorial the game stops giving instructions, and the player finds
// that almost everything answers back. Almost none of this is a mission
// objective. That is the point: it is the first taste of free chaos.
//
// Every entry is: what you get, what it costs you, and a line worth reading.
// ---------------------------------------------------------------
export const INTERACTIONS = {
  printer: [
    { text: 'You feed the tray back to front. It will take them a week to notice.',
      chaos: 60, suspicion: 3 },
    { text: 'You set the default to 400 copies. Of one page. Of a spreadsheet.',
      chaos: 90, suspicion: 6 },
    { text: 'You open every panel and close none of them.', chaos: 40, suspicion: 2 },
  ],
  coffee: [
    { text: "You drink someone's coffee. It has a name on it. You know whose it is.",
      chaos: 30, relationships: -1, suspicion: 4 },
    { text: 'You switch it to decaf. Nobody will ever know why the afternoon died.',
      chaos: 120, suspicion: 1, secret: 'THE DECAF INCIDENT' },
  ],
  cabinet: [
    { text: 'Drawer one: forty pens. Drawer two: a single crisp. Drawer three: locked.',
      chaos: 10 },
    { text: "You find last year's redundancy list. Your name is not on it. Two others are.",
      chaos: 20, secret: 'THE LIST', suspicion: 5 },
    { text: 'Someone has been keeping a diary of the meetings. It is very angry.',
      chaos: 15, secret: "SOMEBODY'S DIARY" },
  ],
  monitor: [
    { text: 'You change their desktop background. Subtly. Just enough.',
      chaos: 45, suspicion: 3 },
    { text: 'You swap two colleagues\' keyboards. Nothing else. Just the keyboards.',
      chaos: 55, suspicion: 2 },
    { text: 'Their email is open. You could read it. You do read it.',
      chaos: 25, secret: 'THE EMAIL', suspicion: 9 },
  ],
  stack: [
    { text: "You read the documents you were asked to sort. They're about you.",
      chaos: 20, secret: 'THE FILE', work: 6 },
    { text: 'You sort three pages. It is the most work you will do today.', work: 14 },
    { text: 'You put page 40 in the middle of page 4. Statistically, nobody checks.',
      chaos: 50, work: 4, suspicion: 2 },
  ],
  cooler: [
    { text: 'You drink directly from the tap. A colleague sees. Neither of you speaks.',
      chaos: 25, relationships: -1 },
    { text: 'You loosen the bottle. Not enough to spill. Just enough to worry.',
      chaos: 70, suspicion: 3 },
  ],
  plant: [
    { text: 'You water it with cold coffee. It seems fine with this.', chaos: 20 },
    { text: 'The plant is plastic. Someone has been watering it for four years.',
      chaos: 10, secret: 'THE PLANT' },
  ],
  bin: [
    { text: "You go through the bin. Someone printed their CV. It's dated Tuesday.",
      chaos: 15, secret: 'THE CV' },
  ],
  phone: [
    { text: 'You take the phone off the hook. Somewhere, a client is not getting through.',
      chaos: 65, suspicion: 4 },
  ],
  chair: [
    { text: 'You lower their chair by exactly two inches.', chaos: 35, suspicion: 1 },
  ],
  desk: [
    { text: 'You sit down and do some actual work. It is horrible.', work: 18 },
  ],
};

// ---------------------------------------------------------------
// THE DAYS
// ---------------------------------------------------------------
export const DAYS = [
  {
    id: 'day1',
    name: 'DAY 1 — WELCOME TO HELL',
    goal: 'Survive your first day.',
    // Morning is scripted; then the game shuts up and lets you find things out.
    tutorial: true,
    task: 'Sort these documents.',
    goals: [
      { text: 'Meet the floor',        check: d => d.metPeople >= 3 },
      { text: 'Find out what you can touch', check: d => d.seen.length >= 4 },
      { text: 'Survive until the afternoon', check: d => d.afternoon },
    ],
    // three ways to face the afternoon check
    verdicts: [
      { id: 'good',  need: d => d.work >= 60,
        line: '"Good. Genuinely. Well done."', pay: 1400 },
      { id: 'lazy',  need: d => d.work >= 20,
        line: '"...Right. Get the rest to me tomorrow."', pay: 900 },
      { id: 'worst', need: () => true,
        line: '"What happened here?"  You point at somebody else. He believes you.', pay: 2200 },
    ],
  },
  {
    id: 'day2',
    name: 'DAY 2 — THE ASSIGNMENT',
    goal: 'Get the presentation ready before 3:00 PM.',
    task: 'Fix the presentation.',
    deadline: 210,      // seconds of shift time
    goals: [
      { text: 'Get the presentation ready', check: d => d.presentation },
      { text: 'Be somewhere when 3pm lands', check: d => d.afternoon },
    ],
    // FOUR ROUTES, none of them signposted in game. The brief only ever says
    // "get it ready by 3". Everything below is something you have to notice.
    routes: [
      { id: 'work',      text: 'You sat down and fixed it yourself. Nobody will remember.',
        need: d => d.work >= 70 },
      { id: 'steal',     text: "You took another department's deck and changed the logo.",
        need: d => d.secrets >= 2 && d.chaos >= 30 },
      { id: 'delegate',  text: 'You convinced someone who actually knows the client to do it.',
        need: d => d.relationships >= 3 },
      { id: 'sabotage',  text: 'There is no presentation. There is no projector. There is no meeting.',
        need: d => d.chaos >= 65 },
    ],
  },
];

export const dayById = id => DAYS.find(d => d.id === id);

// ---------------------------------------------------------------
// Rolling one interaction. Returns the line to show, or null if this exact
// interaction has already been used — repeats are boring and farmable.
// ---------------------------------------------------------------
export function interact(day, kind, id) {
  const pool = INTERACTIONS[kind];
  if (!pool) return null;
  const key = kind + ':' + id;
  const used = day.seen.filter(s => s.startsWith(kind + ':')).length;
  if (day.seen.includes(key)) return null;
  const opt = pool[Math.min(pool.length - 1, used)] || pool[0];
  day.seen.push(key);

  day.work = Math.min(100, day.work + (opt.work || 0));
  day.chaos += opt.chaos || 0;
  day.suspicion = Math.max(0, Math.min(100, day.suspicion + (opt.suspicion || 0)));
  day.relationships = Math.max(0, day.relationships + (opt.relationships || 0));
  if (opt.secret) { day.secrets++; day.secretList = (day.secretList || []).concat(opt.secret); }
  return opt;
}

export const chaosPct = day => Math.min(100, Math.round(day.chaos / CHAOS_CEILING * 100));
