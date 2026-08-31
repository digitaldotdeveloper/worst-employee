// PASS 13 — THE MISSING ANIMATION.
//
// Three gaps found by reading the pose selectors against the frame folders,
// not by looking at the game:
//
//   1. `player.js` sets `this.downT = 2.2` when you are knocked out, and
//      `poseFor()` has NO branch for it — so a knocked-out player lies there
//      showing a STANDING hurt frame for over two seconds.
//   2. Coworkers fight back (the user asked for it, it works) using `run-1..4`.
//      They have no attack frame at all. A colleague swinging at you currently
//      looks like a colleague jogging at you.
//   3. The game's first instruction is "SIT AT YOUR DESK TO BEGIN" and the
//      player has no `sit` frame. The cast got one in pass 12; he did not.
//
// Everything else here is a beat that was being covered by a reused frame:
// combo steps 2-4 borrowed the PREVIOUS step's hit frame as their wind-up, so
// the chain read as four impacts and no anticipation, and the extinguisher
// borrowed `c2-hit`.

const API = 'http://127.0.0.1:4321';
const TOKEN = '4bb94235c42a41f4eab766c1c8a33de9357d5b60c2164caf';

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

const OUTFITS = {
  base:  'wearing a plain light-blue short-sleeved t-shirt, grey slacks and white sneakers, with short black hair',
  scruff:'wearing a rumpled white button-up shirt with the sleeves rolled up and a loosened dark tie, grey slacks and brown shoes, with short black hair',
  hood:  'wearing a dark grey hooded sweatshirt with the hood down, black jeans and white sneakers, with a short afro of tight curls drawn as one solid rounded shape',
  smart: 'wearing a navy blazer over a white shirt, a red tie, navy trousers and polished black shoes, with neat short black hair',
};

// A prone figure drawn from anywhere above floor level reads as FLOATING however
// it is anchored — pass 9 learned this the expensive way. The camera height is
// the whole instruction.
const PRONE =
  'STRICT SIDE VIEW WITH THE CAMERA AT FLOOR LEVEL, as if lying on the floor looking across it. ' +
  'The figure must be HORIZONTAL and LOW and WIDE — much wider than tall — filling the frame ' +
  'left to right. Do not draw him from above. Do not tilt the camera down. ';

const PLAYER_POSES = [
  ['down',
   'KNOCKED OUT COLD, lying flat on his back on the floor with his head to the left and his feet ' +
   'to the right. ' + PRONE + 'Arms flung out loose above his head, legs sprawled apart and limp, ' +
   'head lolled to one side, eyes shut, mouth open. Completely unconscious, no tension anywhere.'],
  ['getup',
   'PUSHING HIMSELF UP OFF THE FLOOR, side view facing right: down on one knee with the other foot ' +
   'planted flat, one hand pressed on the floor taking his weight, the other arm braced on the ' +
   'raised knee, head coming up, dazed and furious. Low crouched shape, not standing.'],
  ['sit',
   'SEATED ON AN OFFICE CHAIR AND TYPING, strict side view facing right: knees bent at a right ' +
   'angle with the lower legs vertical and feet flat on the floor, thighs horizontal, back slightly ' +
   'hunched forward, both arms reaching forward and slightly down as if resting on a keyboard, head ' +
   'tilted toward a screen, bored. Do NOT draw the chair, the desk or the keyboard — only the ' +
   'person, in the seated shape.'],
  ['spray',
   'AIMING A NOZZLE, side view facing right: braced on a wide stance leaning slightly back, BOTH ' +
   'hands closed around an invisible grip held out in front of his chest at arm length toward ' +
   'the right, elbows slightly bent, shoulders hunched, face screwed up and turned half away as if ' +
   'flinching from what he is spraying. Do NOT draw the fire extinguisher, the nozzle, the hose or ' +
   'any spray — draw ONLY the person in the aiming shape, hands closed around empty air.'],
  ['c2-wind',
   'WINDING UP A CROSS PUNCH, facing right: rear shoulder pulled all the way back with the rear ' +
   'fist cocked beside his jaw, front arm up guarding, hips twisted away from the target, weight ' +
   'loaded onto the back foot, chin tucked. Coiled and about to fire — nothing extended.'],
  ['c3-wind',
   'WINDING UP A HOOK, facing right: near arm drawn back and out to the side with the elbow bent at ' +
   'a right angle and the fist level with his ear, torso rotated open away from the target, front ' +
   'foot pivoting. Wide and loaded — the fist is behind him, not in front.'],
  ['c4-wind',
   'CROUCHING TO LAUNCH AN UPPERCUT, facing right: dropped low with both knees deeply bent, the ' +
   'striking fist down at hip height, shoulder dipped, looking upward at the target, body compressed ' +
   'like a spring. Nothing extended, everything gathered low.'],
  ['walk-1',
   'WALKING at an unhurried stroll, side view facing right, CONTACT frame: front heel just touching ' +
   'down with the leg straight, back toe still on the floor, legs open in a narrow A, arms swinging ' +
   'gently and close to the body, upright posture, relaxed. A WALK, not a run — feet stay near the ' +
   'floor, stride is short, no forward lean.'],
  ['walk-2',
   'WALKING at an unhurried stroll, side view facing right, PASSING frame: weight fully on the ' +
   'straight front leg, the other knee lifted only slightly and passing beside it, body at its ' +
   'highest, arms nearly vertical at his sides, upright and relaxed. A WALK, not a run.'],
  ['walk-3',
   'WALKING at an unhurried stroll, side view facing right, CONTACT frame mirrored: the OTHER heel ' +
   'just touching down with that leg straight, opposite toe still on the floor, arms swung the ' +
   'opposite way, upright, relaxed. A WALK, not a run — short stride, feet near the floor.'],
  ['walk-4',
   'WALKING at an unhurried stroll, side view facing right, PASSING frame mirrored: weight fully on ' +
   'the other straight leg, the first knee lifted slightly and passing beside it, arms nearly ' +
   'vertical, upright and relaxed. A WALK, not a run.'],
];

// The cast. They fight back, get sprayed, get up, and talk — none of which they
// had a frame for.
const CAST_POSES = [
  ['swing',
   'THROWING A WILD ANGRY HAYMAKER, facing right: the striking arm fully extended forward at head ' +
   'height with the fist closed, the whole body committed and rotated behind it, back foot up on ' +
   'the toe, other arm flung back for balance, face furious, teeth bared. Fully extended at the ' +
   'moment of impact.'],
  ['wind',
   'WINDING UP AN ANGRY PUNCH, facing right: fist drawn right back behind the shoulder, elbow high, ' +
   'torso twisted away from the target, other hand raised in front, leaning back onto the rear foot, ' +
   'furious and about to swing. Nothing extended — everything cocked back.'],
  ['getup',
   'CLIMBING BACK UP OFF THE FLOOR, side view facing right: on one knee with the other foot planted, ' +
   'one hand on the floor, the other hand on the raised knee, head up, shaken and angry. Low ' +
   'crouched shape, definitely not standing upright.'],
  ['sprayed',
   'BEING SPRAYED IN THE FACE AND COUGHING, facing right: staggering backward with both forearms ' +
   'flung up crossed in front of the face, head twisted away and down, back arched, one leg back ' +
   'catching the stumble, mouth wide open coughing, eyes screwed shut. Do NOT draw any spray, foam, ' +
   'smoke or extinguisher — only the person reacting.'],
  ['talk',
   'MID-SENTENCE, standing three-quarter view facing right, saying something dull and slightly ' +
   'smug: one hand raised palm-up in a small explaining gesture at chest height, the other on the ' +
   'hip, weight on one leg, mouth open talking, eyebrows up.'],
  ['point',
   'POINTING at something off to the right and slightly up, three-quarter view facing right: near ' +
   'arm fully extended with the index finger out, other hand on the hip, weight settled, head ' +
   'turned to follow the point, pleased and explaining.'],
];

// A stroll, for everyone who walks through a scripted scene. Story beats tween
// `x` with `vx` pinned to zero, so a character with no walk cycle delivers the
// whole tour standing upright and sliding.
const WALK = [
  ['walk-1',
   'WALKING at an unhurried stroll, side view facing right, CONTACT frame: front heel just touching ' +
   'down with the leg straight, back toe still on the floor, legs open in a narrow A, arms swinging ' +
   'gently close to the body, upright, relaxed. A WALK, not a run — short stride, feet near the floor.'],
  ['walk-2',
   'WALKING at an unhurried stroll, side view facing right, PASSING frame: weight fully on the ' +
   'straight front leg, the other knee lifted only slightly and passing beside it, body at its ' +
   'highest, arms nearly vertical at the sides, upright and relaxed. A WALK, not a run.'],
  ['walk-3',
   'WALKING at an unhurried stroll, side view facing right, CONTACT frame mirrored: the OTHER heel ' +
   'just touching down with that leg straight, opposite toe still on the floor, arms swung the ' +
   'opposite way, upright, relaxed. A WALK, not a run — short stride, feet near the floor.'],
  ['walk-4',
   'WALKING at an unhurried stroll, side view facing right, PASSING frame mirrored: weight fully on ' +
   'the other straight leg, the first knee lifted slightly and passing beside it, arms nearly ' +
   'vertical, upright and relaxed. A WALK, not a run.'],
];

// The boss gets a second attack beat so his fight is not one punch on a loop,
// plus the two states the tour needs him in.
const BOSS_RAGE = [
  ['c2-wind',
   'WINDING UP A HUGE TWO-HANDED OVERHEAD SLAM, facing right: both fists clenched together and ' +
   'raised high above and behind his head, back arched, chest thrown out, roaring, weight on the ' +
   'back foot. Gathered high — nothing coming down yet.'],
  ['c2-hit',
   'SLAMMING BOTH FISTS DOWN, facing right: both arms driven straight down together to just below ' +
   'waist height, knees bent deep, back rounded over the blow, head down, the whole body committed ' +
   'downward at the moment of impact.'],
  ['getup',
   'HAULING HIMSELF BACK UP OFF THE FLOOR, side view facing right: on one knee, one hand on the ' +
   'floor, the other fist clenched, head up glaring, shirt untucked, red in the face. Low crouched ' +
   'shape, not standing.'],
  ['sprayed',
   'BEING SPRAYED IN THE FACE, facing right: reeling backward with both forearms crossed up over ' +
   'the face, head wrenched away, mouth open bellowing, one foot back catching the stumble. Do NOT ' +
   'draw any spray, foam or extinguisher — only the person reacting.'],
];

// The tour boss. He points at the water dispenser and shakes your hand in the
// opening — both were being played with the idle frame.
const BOSS_CALM = [
  ['point',
   'POINTING PROUDLY at something off to the right, three-quarter view facing right: near arm fully ' +
   'extended, index finger out, other hand spread open at his chest, beaming, chest out, delighted ' +
   'with what he is showing you.'],
  ['talk',
   'MID-SENTENCE and pleased with himself, three-quarter view facing right: both hands raised in a ' +
   'small open presenting gesture at chest height, mouth open talking, eyebrows up, warm and ' +
   'insincere.'],
  ['shake',
   'SHAKING HANDS, three-quarter view facing right: near arm extended forward and slightly down ' +
   'with the hand open and turned side-on to grip, leaning in, the other hand reaching to clap an ' +
   'unseen shoulder, beaming broadly. Draw ONLY him — no second person, no other hand.'],
  ['hurt',
   'TAKING A HARD PUNCH TO THE FACE, facing right: head snapped back and to the side, both arms ' +
   'flying up and back, torso arched backward, one foot lifting, eyes squeezed shut, mouth open. ' +
   'The moment of impact.'],
];

// ---------------------------------------------------------------- jobs
const JOBS = [];   // [label, refFile, prompt]

function playerPrompt(outfit, body) {
  return `Game animation frame for a 2D side-scrolling mobile game called "Worst Employee".
The attached image is the exact character reference. Redraw THE SAME person - same face, same
medium-brown skin, same build, same art style, same lighting. He is ${OUTFITS[outfit]}.
${SCALE}
POSE: ${body}
${STYLE}
${GREEN}
${ONE}`;
}
function castPrompt(body) {
  return `Game animation frame for a 2D side-scrolling mobile game called "Worst Employee".
The attached image is the exact character reference. Redraw THE SAME person - same face, same skin,
same hair, same clothes, same build, same art style.
Draw the figure at the same camera distance as the reference, whole figure visible, clear space
above and below.
POSE: ${body}
${STYLE}
${GREEN}
${ONE}`;
}

for (const outfit of ['base', 'scruff', 'hood', 'smart'])
  for (const [name, body] of PLAYER_POSES)
    JOBS.push([`player-${outfit}__${name}`, 'we-master.png', playerPrompt(outfit, body)]);

for (const who of ['npc-sami', 'npc-rita', 'npc-omar'])
  for (const [name, body] of CAST_POSES)
    JOBS.push([`${who}__${name}`, who + '.png', castPrompt(body)]);

for (const [name, body] of BOSS_RAGE)
  JOBS.push([`boss-rage__${name}`, 'boss-rage.png', castPrompt(body)]);
for (const [name, body] of BOSS_CALM)
  JOBS.push([`boss-calm__${name}`, 'boss-calm.png', castPrompt(body)]);

// boss-calm walks the entire opening tour; the NPCs walk in later scenes.
for (const who of ['boss-calm', 'npc-sami', 'npc-rita', 'npc-omar'])
  for (const [name, body] of WALK)
    JOBS.push([`${who}__${name}`, who + '.png', castPrompt(body)]);

// ---------------------------------------------------------------- submit
async function api(path, opts = {}) {
  const r = await fetch(API + path, {
    ...opts,
    headers: { Authorization: 'Bearer ' + TOKEN, 'Content-Type': 'application/json', ...(opts.headers || {}) },
  });
  if (!r.ok) throw new Error(path + ' -> ' + r.status + ' ' + (await r.text()).slice(0, 200));
  return r.json();
}

(async () => {
  // RETRY=a,b,c regenerates exactly those labels with the scale clause turned
  // up. About one frame in ten comes back 25-40% larger than the datum pose,
  // which the height check catches and no amount of re-running the same prompt
  // reliably fixes — saying it twice, in different words, does.
  const retry = (process.env.RETRY || '').split(',').filter(Boolean);
  const only = process.argv[2];                       // optional label filter
  let jobs = only ? JOBS.filter(j => j[0].includes(only)) : JOBS;
  if (retry.length) {
    jobs = JOBS.filter(j => retry.includes(j[0])).map(j => [j[0], j[1], j[2] +
      '\nCRITICAL: the figure must occupy exactly the same fraction of the frame ' +
      'as in the attached reference — same head size, same body height in pixels. ' +
      'Do not zoom in. Do not crop closer. Do not fill the frame with the figure. ' +
      'Leave the same generous empty margin above the head and below the feet as ' +
      'the reference has.']);
    console.log('RETRY ' + jobs.map(j => j[0]).join(' '));
  }
  console.log(`${jobs.length} renders`);
  if (process.env.DRY) { jobs.forEach(j => console.log('  ' + j[0] + '  <- ' + j[1])); return; }

  // Group by reference image — one attachment per submission — then chunk,
  // because long queues stall.
  const byRef = {};
  for (const j of jobs) (byRef[j[1]] = byRef[j[1]] || []).push(j);

  const map = {};
  const CHUNK = 12;
  for (const [ref, list] of Object.entries(byRef)) {
    for (let i = 0; i < list.length; i += CHUNK) {
      const slice = list.slice(i, i + CHUNK);
      const { queued } = await api('/api/generate', {
        method: 'POST',
        body: JSON.stringify({
          prompt: slice.map(s => s[2]).join('\n---\n'),
          mode: 'image',
          attach: [{ kind: 'up', file: ref }],
        }),
      });
      // The prompt goes in the map too: jobIds repeat across projects in the
      // shared library, so the collector has to verify the TEXT, not the id.
      queued.forEach((id, k) => { map[id] = { label: slice[k][0], probe: slice[k][2].slice(0, 90) }; });
      console.log(`  ${ref} +${queued.length}`);
      await new Promise(r => setTimeout(r, 1200));
    }
  }

  // MERGE, never overwrite. A second submission for a few extra labels must not
  // throw away the mapping for the batch already in flight — without the old
  // ids the collector cannot tell those renders apart from any other project's.
  const fs = require('fs'), jf = __dirname + '/pass13-jobs.json';
  let prev = {};
  try { prev = JSON.parse(fs.readFileSync(jf, 'utf8')); } catch (e) {}
  fs.writeFileSync(jf, JSON.stringify({ ...prev, ...map }, null, 1));
  const total = Object.keys(map).length;
  console.log(`queued ${total}, waiting...`);

  let last = -1;
  for (let i = 0; i < 3000; i++) {
    await new Promise(r => setTimeout(r, 8000));
    const st = await api('/api/state');
    const mine = (st.jobs || []).filter(j => map[j.id]);
    const fin = mine.filter(j => ['done', 'error', 'cancelled', 'failed'].includes(j.status));
    if (fin.length !== last) { console.log(`  ${fin.length}/${total}`); last = fin.length; }
    if (fin.length === total) {
      const bad = fin.filter(j => j.status !== 'done');
      console.log('DONE' + (bad.length ? `  (${bad.length} failed)` : ''));
      return;
    }
  }
  console.log('TIMEOUT');
})().catch(e => { console.error('FAILED: ' + e.message); process.exit(1); });
