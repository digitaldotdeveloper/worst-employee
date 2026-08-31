// PASS 14 — THE SLAP THAT NEVER LANDS.
//
// `assets/player/base/` has exactly TWO frames for holding somebody:
// `grab-hold` and `grab-slap`. Opening `grab-slap` shows what it actually is —
// the grip arm locked out on a collar and the OTHER hand cocked open across the
// chest. That is a WIND-UP. There is no contact frame and no recovery frame.
//
//   art.js:282      return p.slapCd > 0.10 ? 'grab-slap' : 'grab-hold';
//   player.js:257   _slap() sets slapCd = 0.26 and deals the damage on frame 1
//
// So the wind-up holds for 0.16s and then cuts straight back to the grip. The
// hand never arrives. This pass draws the two beats that are missing so the
// action reads wind-up -> contact -> recovery.
//
// THREE CONSTRAINTS THAT ARE SPECIFIC TO THIS ACTION
//
//  1. DO NOT DRAW THE VICTIM. The held colleague is a separate cast sprite the
//     engine positions from a measured hand anchor. Both hands close on empty
//     air, exactly as the two existing frames do.
//  2. THE GRIP HAND MUST NOT MOVE. `player.carryPose()` pins the victim's
//     collar to `HAND[pose]`, and the two existing rows are 2 game-px apart
//     (grab-hold [24.0,-44.7], grab-slap [22.0,-45.2]). If the grip fist drifts
//     between beats the victim visibly slides up the player's arm. Hence the
//     reference is `grab-slap` itself, not the master sheet, and every prompt
//     says the far arm has not moved.
//  3. CONTACT IS AT HEAD HEIGHT. Working the anchor maths through: the fist
//     sits at feet-44.7, the victim's top lands at fist - 0.38*h and their head
//     centre ends up ABOVE the player's own head. A backhand to the torso would
//     connect with the victim's knees. The impact sparks are being moved onto
//     the victim's head in the same pass; the hand has to be up there.
//
// Usage:
//   node tools/pass14-slap.js                    submit the batch
//   DRY=1 node tools/pass14-slap.js              print what it would submit
//   RETRY=base__grab-slap-hit node tools/...     redo one label, harder scale clause

const fs = require('fs');
const path = require('path');

const API = 'http://127.0.0.1:4321';

// Reuse the token the Studio already has. NEVER mint a new one, and never
// paste one into this file — pass11 and pass13 both hardcoded it and that was
// a mistake, not a pattern.
const TOKEN = JSON.parse(fs.readFileSync(
  'C:/Users/it/Desktop/Gemini Prompt Sender/dashboard/tokens.json', 'utf8'))[0].token;

// Verbatim from pass13-anim.js. This wording is tuned; do not paraphrase it.
const STYLE =
  'STYLE: polished stylized cartoon with soft cel shading, a warm rim light along one edge, ' +
  'subtle ambient occlusion, clean crisp edges. High-budget 2D mobile game finish.';
const SCALE =
  'Draw him at the SAME SIZE and the SAME camera distance as the attached reference image, ' +
  'standing on the same ground line, the whole figure visible from head to feet with clear ' +
  'empty space above his head and below his feet. ';
const GREEN =
  'The background must be flat pure green #00FF00, completely uniform edge to edge, no shadow, ' +
  'no gradient. Nothing worn may be green. ';
const ONE =
  'Draw exactly ONE single figure. No duplicate, no turnaround sheet, no side-by-side poses, ' +
  'no motion-blur trails, no speed lines, no text, no watermark, no ground shadow.';

// Rule 9, stated twice and in the negative, because this is the pose most
// likely to hallucinate a second person into the frame.
const NO_VICTIM =
  'CRITICAL: do NOT draw the person he is holding. No second figure, no head, no face, no ' +
  'shoulder, no collar, no hand and no body part belonging to anybody else anywhere in the ' +
  'image. Both of his own hands close on EMPTY AIR. He is alone in the frame.';

// Said in the same words in both prompts, because this is the thing that makes
// the animation work and the thing the model is most likely to quietly redraw.
const GRIP_LOCKED =
  'HIS FAR ARM (his right, the one further from the camera) HAS NOT MOVED AT ALL from the ' +
  'attached reference image: it is still thrust straight out in front of him and locked ' +
  'straight at shoulder height, the fist still closed tight on an invisible collar, at ' +
  'EXACTLY the same height, EXACTLY the same length and EXACTLY the same place in the frame ' +
  'as the reference. Copy that arm across unchanged. Only his NEAR arm (his left, the one ' +
  'closer to the camera) has moved.';

const OUTFIT =
  'a plain light-blue short-sleeved t-shirt, grey slacks and white sneakers, short black hair';

const POSES = [
  // ---------------------------------------------------------------- CONTACT
  // The existing `grab-slap` is the wind-up: near hand cocked open across the
  // chest. This is where that hand arrives.
  ['grab-slap-hit',
   'THE EXACT MOMENT A BACKHAND SLAP LANDS, while still holding somebody by the collar, ' +
   'three-quarter view facing right. ' + GRIP_LOCKED + ' ' +
   'That near arm has swung the whole way across his body and is now FULLY EXTENDED forward ' +
   'and slightly UPWARD, reaching out past the gripping fist, so that his open hand is up at ' +
   'the height of the TOP OF HIS OWN HEAD — high, not at chest height, not at waist height. ' +
   'It is a BACKHAND: the back of the hand and the knuckles lead, the palm is turned back ' +
   'toward himself, the fingers are straight and together, the wrist snapped through. The hand ' +
   'has already swept THROUGH the point of impact and is following through beyond it. His torso ' +
   'is rotated wide open into the swing with the near shoulder driven forward and up, his weight ' +
   'is on the front foot with the back heel lifting, his chin is up and his eyes are on where ' +
   'the hand just went, mouth open shouting, delighted with himself. Explosive and fully ' +
   'committed at the instant of contact.'],

  // ---------------------------------------------------------------- RECOVERY
  // Settles back toward `grab-hold`, so the loop closes instead of snapping.
  ['grab-slap-rec',
   'THE FOLLOW-THROUGH AFTER A BACKHAND SLAP, the swing already over, while still holding ' +
   'somebody by the collar, three-quarter view facing right. ' + GRIP_LOCKED + ' ' +
   'That near arm has carried all the way past the target and is now out BEYOND the gripping ' +
   'fist and DROPPING — reaching forward and downward to about hip height, the elbow nearly ' +
   'straight, the hand open and completely loose with the fingers relaxed and slightly spread, ' +
   'the wrist trailing limp behind the hand. His torso is unwinding back toward square, the ' +
   'near shoulder settling down and back, his weight sinking back onto the rear foot, his head ' +
   'still up and turned toward the grip with a smug satisfied smirk. Loose and spent and ' +
   'relaxed — nothing coiled, nothing tensed, the energy has already left the arm.'],
];

function prompt(name, body) {
  return `Game animation frame for a 2D side-scrolling mobile game called "Worst Employee".
The attached image is the exact character reference. Redraw THE SAME person - same face, same
medium-brown skin, same build, same art style, same lighting, standing in the same stance on the
same ground line. He is wearing ${OUTFIT}.
${SCALE}
POSE: ${body}
Draw his hair as ONE solid clean rounded shape with a crisp hard edge, never fine wispy
see-through strands.
${STYLE}
${GREEN}
${NO_VICTIM}
${ONE}`;
}

const REF = 'we-grab-slap.png';   // tools/renders-base/grab-slap.png, flattened onto #00FF00
const JOBS = POSES.map(([n, body]) => [`base__${n}`, REF, prompt(n, body)]);

async function api(p, opts = {}) {
  const r = await fetch(API + p, {
    ...opts,
    headers: { Authorization: 'Bearer ' + TOKEN, 'Content-Type': 'application/json', ...(opts.headers || {}) },
  });
  if (!r.ok) throw new Error(p + ' -> ' + r.status + ' ' + (await r.text()).slice(0, 200));
  return r.json();
}

(async () => {
  // About one frame in ten comes back 25-40% larger than the datum pose, and
  // re-running the identical prompt does not fix it. Saying the constraint
  // again, in different words, does.
  const retry = (process.env.RETRY || '').split(',').filter(Boolean);
  let jobs = JOBS;
  if (retry.length) {
    jobs = JOBS.filter(j => retry.includes(j[0])).map(j => [j[0], j[1], j[2] +
      '\nCRITICAL: the figure must occupy exactly the same fraction of the frame ' +
      'as in the attached reference — same head size, same body height in pixels. ' +
      'Do not zoom in. Do not crop closer. Do not fill the frame with the figure. ' +
      'Leave the same generous empty margin above the head and below the feet as ' +
      'the reference has.']);
    console.log('RETRY ' + jobs.map(j => j[0]).join(' '));
  }

  const st0 = await api('/api/state');
  console.log(`quota before: ${st0.usage.current.percent}%  (resets ${st0.usage.current.resets})`);
  console.log(`${jobs.length} renders  ~${(jobs.length * 0.55).toFixed(1)}%`);
  if (process.env.DRY) { jobs.forEach(j => console.log('\n--- ' + j[0] + '  <- ' + j[1] + '\n' + j[2])); return; }

  const { queued } = await api('/api/generate', {
    method: 'POST',
    body: JSON.stringify({
      prompt: jobs.map(j => j[2]).join('\n---\n'),
      mode: 'image',
      attach: [{ kind: 'up', file: REF }],
    }),
  });

  // The prompt text goes in the map, not just the id: jobIds repeat across
  // projects in the shared Gemini library, and matching on id alone once filled
  // this repo's faces folder with pizzas from another project.
  const map = {};
  queued.forEach((id, k) => { map[id] = { label: jobs[k][0], probe: jobs[k][2].slice(0, 90) }; });

  // MERGE, never overwrite — a retry submission must not orphan the ids of the
  // batch already in flight.
  const jf = path.join(__dirname, 'pass14-jobs.json');
  let prev = {};
  try { prev = JSON.parse(fs.readFileSync(jf, 'utf8')); } catch (e) {}
  fs.writeFileSync(jf, JSON.stringify({ ...prev, ...map }, null, 1));

  const total = queued.length;
  console.log(`queued ${total}, waiting...`);
  let last = -1;
  for (let i = 0; i < 300; i++) {
    await new Promise(r => setTimeout(r, 8000));
    const st = await api('/api/state');
    const mine = (st.jobs || []).filter(j => map[j.id]);
    const fin = mine.filter(j => ['done', 'error', 'cancelled', 'failed'].includes(j.status));
    if (fin.length !== last) { console.log(`  ${fin.length}/${total}`); last = fin.length; }
    // /api/state trims finished jobs out of `jobs` once they land in the
    // library, so "all of mine have vanished" also means done.
    if (fin.length === total || (i > 2 && mine.length === 0)) {
      const bad = fin.filter(j => j.status !== 'done');
      console.log('DONE' + (bad.length ? `  (${bad.length} failed)` : ''));
      const st2 = await api('/api/state');
      console.log(`quota after: ${st2.usage.current.percent}%`);
      return;
    }
  }
  console.log('TIMEOUT');
})().catch(e => { console.error('FAILED: ' + e.message); process.exit(1); });
