// PASS 7 — drawn frames for the rest of the cast.
//
//   node tools/pass7-cast.js npc-sami
//   node tools/pass7-cast.js all
//
// The player got whole drawn frames in pass 6 and stopped looking assembled;
// the coworkers and the boss did not, so they still read as cut-up. Same fix,
// same pipeline, fewer poses each — an NPC never throws a five-hit combo.
//
// Each character is generated against ITS OWN full-body render as the reference,
// not the player's, or they all drift toward being the same person.

const API = 'http://127.0.0.1:4321';
const TOKEN = '4bb94235c42a41f4eab766c1c8a33de9357d5b60c2164caf';

const STYLE =
  'STYLE: polished stylized cartoon with soft cel shading, a warm rim light along one edge, ' +
  'subtle ambient occlusion, clean crisp edges. High-budget 2D mobile game finish.';

const SCALE =
  'Draw the figure at EXACTLY the same size and camera distance as the attached reference image - ' +
  'it must occupy the same fraction of the image height as the reference, no closer, no zoom. ' +
  'Whole figure from head to feet with clear empty space above the head and below the feet. ';

const GREEN =
  'The background must be flat pure green #00FF00, uniform edge to edge, no shadow, no gradient. ' +
  'Nothing worn may be green. ';

const ONE =
  'Draw exactly ONE single figure. No duplicate, no turnaround sheet, no side-by-side poses, ' +
  'no motion-blur trails, no speed lines, no text, no watermark, no ground shadow.';

// A coworker's whole job is: stand about, pretend to work, panic, get hit.
const NPC_POSES = [
  ['idle',  'Standing about doing nothing, three-quarter view facing right, weight on one leg, arms hanging, bored and vacant.'],
  ['idle2', 'Standing about, three-quarter view facing right, arms folded across the chest, looking off to one side, unimpressed.'],
  ['work',  'Leaning forward slightly as if typing at a desk, three-quarter view facing right, both arms reaching forward at waist height, shoulders hunched, staring blankly ahead.'],
  ['run-1', 'PANICKED RUN, contact frame, facing right: right leg stretched forward heel about to land, left leg extended back, arms flung up beside the head, mouth open in alarm.'],
  ['run-2', 'PANICKED RUN, passing frame, facing right: right leg straight underneath bearing weight, left knee lifted high, arms up beside the head, eyes wide.'],
  ['run-3', 'PANICKED RUN, contact frame mirrored, facing right: left leg stretched forward heel about to land, right leg extended back, arms flung up, panicking.'],
  ['run-4', 'PANICKED RUN, passing frame mirrored, facing right: left leg straight underneath bearing weight, right knee lifted high, arms up, terrified.'],
  ['hurt',  'BEING HIT AND RECOILING BACKWARD, facing right, head snapped back, both arms flung up and back, torso arched, one foot lifting off the floor, eyes screwed shut.'],
  ['down',  'KNOCKED FLAT ON THE FLOOR, lying on the back with limbs sprawled out, head to the left and feet to the right, seen from the side, completely flattened, dazed.'],
];

const BOSS_CALM = [
  ['idle',  'Standing with hands on hips, three-quarter view facing right, chest out, smug and self-satisfied, surveying the office.'],
  ['idle2', 'Standing with arms folded across the chest, three-quarter view facing right, one eyebrow raised, watching disapprovingly.'],
  ['run-1', 'WALKING, contact frame, facing right: right leg forward heel landing, left leg back, arms swinging naturally, striding with self-importance.'],
  ['run-2', 'WALKING, passing frame, facing right: right leg straight underneath bearing weight, left knee coming through, arms mid-swing.'],
  ['run-3', 'WALKING, contact frame mirrored, facing right: left leg forward heel landing, right leg back, arms swinging opposite.'],
  ['run-4', 'WALKING, passing frame mirrored, facing right: left leg straight underneath bearing weight, right knee coming through.'],
];

const BOSS_RAGE = [
  ['idle',  'Standing in a furious fighting stance, three-quarter view facing right, both fists raised in front of the chest, knees bent, shoulders hunched, breathing hard.'],
  ['idle2', 'Standing in a fighting stance, three-quarter view facing right, fists up, leaning forward and snarling.'],
  ['run-1', 'CHARGING FORWARD, contact frame, facing right: right leg stretched forward, left leg back, both fists up, body leaning aggressively forward.'],
  ['run-2', 'CHARGING FORWARD, passing frame, facing right: right leg underneath bearing weight, left knee driving up, fists up, furious.'],
  ['run-3', 'CHARGING FORWARD, contact frame mirrored, facing right: left leg stretched forward, right leg back, fists up, leaning in.'],
  ['run-4', 'CHARGING FORWARD, passing frame mirrored, facing right: left leg underneath bearing weight, right knee driving up, fists up.'],
  ['c1-wind', 'WINDING UP A HUGE PUNCH, facing right, right fist pulled far back behind him, shoulder cocked, weight on the back foot, roaring.'],
  ['c1-hit',  'LANDING A HUGE PUNCH, facing right, right arm fully extended forward at chest height, whole body twisted into the blow, front knee bent deep.'],
  ['hurt',    'BEING PUNCHED AND RECOILING, facing right, head snapped back, arms flung up and back, torso arched, staggering.'],
  ['down',    'DEFEATED AND LYING FLAT ON THE FLOOR ON HIS BACK, limbs sprawled, head to the left and feet to the right, seen from the side, completely beaten.'],
];

const CAST = {
  'npc-sami':  { ref: 'npc-sami.png',  poses: NPC_POSES },
  'npc-rita':  { ref: 'npc-rita.png',  poses: NPC_POSES },
  'npc-omar':  { ref: 'npc-omar.png',  poses: NPC_POSES },
  'boss-calm': { ref: 'boss-calm.png', poses: BOSS_CALM },
  'boss-rage': { ref: 'boss-rage.png', poses: BOSS_RAGE },
};

async function api(path, opts = {}) {
  const r = await fetch(API + path, {
    ...opts,
    headers: { Authorization: 'Bearer ' + TOKEN, 'Content-Type': 'application/json', ...(opts.headers || {}) },
  });
  if (!r.ok) throw new Error(path + ' -> ' + r.status + ' ' + (await r.text()).slice(0, 200));
  return r.json();
}

async function run(who) {
  const c = CAST[who];
  const prompts = c.poses.map(([, body]) =>
    `Game animation frame for a 2D side-scrolling mobile game called "Worst Employee".
The attached image is the exact character reference. Redraw THE SAME person - same face, same
skin tone, same hair, same clothes, same build, same art style, same lighting.
${SCALE}
POSE: ${body}
${STYLE}
${GREEN}
${ONE}`);
  const labels = c.poses.map(p => who + '__' + p[0]);

  const map = {};
  const CHUNK = 10;
  for (let i = 0; i < prompts.length; i += CHUNK) {
    const { queued } = await api('/api/generate', {
      method: 'POST',
      body: JSON.stringify({
        prompt: prompts.slice(i, i + CHUNK).join('\n---\n'),
        mode: 'image',
        attach: [{ kind: 'up', file: c.ref }],
      }),
    });
    queued.forEach((id, k) => { map[id] = labels[i + k]; });
  }
  const fs = require('fs');
  const f = __dirname + `/pass7-${who}-jobs.json`;
  fs.writeFileSync(f, JSON.stringify(map, null, 1));
  console.log(`${who}: queued ${Object.keys(map).length}`);

  const total = Object.keys(map).length;
  for (let i = 0; i < 3000; i++) {
    await new Promise(r => setTimeout(r, 6000));
    const st = await api('/api/state');
    const mine = (st.jobs || []).filter(j => map[j.id]);
    const done = mine.filter(j => ['done', 'error', 'cancelled', 'failed'].includes(j.status));
    for (const j of done) if (j.status !== 'done') console.log(`  [${j.status}] ${map[j.id]}`);
    if (done.length === total) { console.log(`${who}: DONE`); return; }
  }
}

(async () => {
  const who = process.argv[2];
  const list = (!who || who === 'all') ? Object.keys(CAST) : [who];
  for (const w of list) await run(w);
})().catch(e => { console.error('FAILED: ' + e.message); process.exit(1); });
