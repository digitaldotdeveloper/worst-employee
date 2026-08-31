// BARKS — the office talking.
//
// A floor where nobody says anything is a floor nobody works on. Three kinds of
// line: ambient chatter nobody asked for, what people say when you hit them, and
// what the boss says when he is lying on the carpet.
//
// Everything here is short. A bark you cannot read in one glance during a fight
// is a bark nobody reads at all.

export const CHATTER = [
  "Did anyone get that email?",
  "I'll circle back on that.",
  "Sorry, you go.",
  "Is the printer working?",
  "It's not really a bug.",
  "Quick sync?",
  "I'll put time in.",
  "Per my last email.",
  "Sorry, dropped off there.",
  "Can you see my screen?",
  "That's above my pay grade.",
  "Let's take it offline.",
  "I've got a hard stop at four.",
  "Is it Friday yet?",
  "Someone's yoghurt has a name on it.",
  "The wifi is doing that thing again.",
  "I did reply, actually.",
  "That was in scope last week.",
  "Nobody told me about this.",
  "I've been on since seven.",
  "There's cake in the kitchen.",
  "There is no cake in the kitchen.",
  "My laptop fan sounds like a plane.",
  "I'm just going to say it — no.",
  "Whose mug is this?",
];

// What people say when it lands. Ordered rough to worse.
export const HURT = [
  'OW', 'HEY', 'WHAT', 'MY ARM', 'NOT OKAY', 'STOP IT', 'SERIOUSLY',
  'AAA', 'HR!', 'MY BACK', 'WHY', 'THAT HURT', 'ENOUGH',
];

export const DOWNED = [
  "I'm fine.",
  "Tell my manager.",
  "Worth it.",
  "This is a workplace.",
  "I'm using my sick day.",
  "Ow. Ow. Ow.",
  "Not again.",
];

export const FIGHTBACK = [
  "Right. That's it.",
  "You picked the wrong department.",
  "I did kickboxing once.",
  "I have been here eleven years.",
  "I am NOT losing my parking space over this.",
];

// The boss, on the floor, at the end. He never once acknowledges what happened.
export const BOSS_DOWN = [
  "...Let's park this.",
  "...I'd like to revisit this in Q3.",
  "...Send me something in writing.",
  "...This is good feedback, actually.",
  "...We should get this on a slide.",
  "...I'm going to loop in HR.",
  "...Can you take the minutes?",
];

export const pick = (arr, i) => arr[Math.abs(i | 0) % arr.length];
