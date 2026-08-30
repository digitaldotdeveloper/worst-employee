// PASS 6 — a real combo set, better desks, and outfit presets as DRAWN frames.
//
//   node tools/pass6-combat.js desks     regenerate the weak props
//   node tools/pass6-combat.js poses     the expanded combat pose set (base outfit)
//   node tools/pass6-combat.js outfits   every pose again for each outfit preset
//
// WHY THIS EXISTS:
// The cut-up skeleton animates cheaply but it reads as cut-up — visible segments,
// stiff joints. Whole drawn frames do not have that problem. The cost is that a
// drawn frame bakes in the outfit, so customization becomes PRESETS rather than
// mix-and-match. That is a straight trade of combination count for looking good,
// and looking good is what was actually wrong.

const API = 'http://127.0.0.1:4321';
const TOKEN = '4bb94235c42a41f4eab766c1c8a33de9357d5b60c2164caf';
const REF = 'we-master.png';

const STYLE =
  'STYLE: polished stylized cartoon with soft cel shading, a warm rim light along one edge, ' +
  'subtle ambient occlusion, clean crisp edges. High-budget 2D mobile game finish.';

const SCALE =
  'Draw him at the SAME SIZE and the SAME camera distance as the attached reference image, ' +
  'standing on the same ground line, the whole figure visible from head to feet with clear ' +
  'empty space above his head and below his feet. ';

const GREEN =
  'The background must be flat pure green #00FF00, completely uniform edge to edge, no shadow, ' +
  'no gradient. Nothing he wears may be green. ';

const ONE =
  'Draw exactly ONE single figure. No duplicate, no turnaround sheet, no side-by-side poses, ' +
  'no motion-blur trails, no speed lines, no text, no watermark, no ground shadow.';

// ---------------------------------------------------------------- outfits
// Each is a complete look. The creator picks one of these rather than mixing
// parts, which is what lets every frame be a whole drawing.
const OUTFITS = {
  base:  'wearing a plain light-blue short-sleeved t-shirt, grey slacks and white sneakers, with short black hair',
  scruff:'wearing a rumpled white button-up shirt with the sleeves rolled up and a loosened dark tie, grey slacks and brown shoes, with short black hair',
  hood:  'wearing a dark grey hooded sweatshirt with the hood down, black jeans and white sneakers, with a short afro of tight curls drawn as one solid rounded shape',
  smart: 'wearing a navy blazer over a white shirt, a red tie, navy trousers and polished black shoes, with neat short black hair',
};

// ---------------------------------------------------------------- poses
// A real combo needs distinct silhouettes per beat, not one punch reused. Each
// of these has to read at a glance at phone size, so they are described by
// SHAPE - where the limbs point - not by mood.
const POSES = [
  ['idle',       'Standing idle at rest, three-quarter view facing right, weight settled, arms relaxed at his sides, a slight smirk.'],
  ['idle2',      'Standing idle, three-quarter view facing right, shifting his weight onto the other foot, one hand rubbing the back of his neck, bored.'],
  ['run-1',      'MID-RUN contact frame, facing right: right leg stretched forward heel about to land, left leg extended back, left arm forward, right arm back, leaning forward.'],
  ['run-2',      'MID-RUN passing frame, facing right: right leg straight underneath him bearing weight, left knee lifted high in front, arms roughly vertical.'],
  ['run-3',      'MID-RUN contact frame mirrored, facing right: left leg stretched forward heel about to land, right leg extended back, right arm forward, left arm back.'],
  ['run-4',      'MID-RUN passing frame mirrored, facing right: left leg straight underneath him bearing weight, right knee lifted high in front, arms roughly vertical.'],
  ['run-5',      'MID-RUN full stride, facing right: both feet off the ground at the widest point of the stride, arms swung fully opposite, body leaning hard forward.'],
  ['run-6',      'MID-RUN recovery, facing right: front foot planted flat and knee bent absorbing the landing, back leg swinging through, body compressed low.'],
  ['jump-up',    'JUMPING UPWARD, facing right, both feet off the ground tucked under him, knees bent, arms swung up, body stretched tall, looking up.'],
  ['jump-apex',  'AT THE TOP OF A JUMP, facing right, body straight and floating, legs slightly apart and relaxed, arms out for balance.'],
  ['fall',       'FALLING DOWNWARD, facing right, legs reaching down for the landing, arms out slightly for balance, body compact.'],
  ['land',       'LANDING FROM A JUMP, facing right, both knees deeply bent absorbing the impact, one hand touching the floor, head down.'],
  ['dodge',      'A FAST LOW SIDEWAYS DASH, facing right, body crouched low and leaning hard forward, one arm trailing behind, both feet barely off the floor.'],
  // --- the combo: five distinct beats ---
  ['c1-wind',    'WINDING UP A JAB, facing right, left shoulder turned forward, left fist drawn back beside his chin, right fist guarding, weight on the back foot.'],
  ['c1-hit',     'THROWING A FAST JAB, facing right, LEFT arm punching straight forward at head height fully extended, right fist tucked at his chin, front foot planted.'],
  ['c2-hit',     'THROWING A CROSS, facing right, RIGHT arm fully extended forward at chest height, torso twisted hard into the punch, left fist pulled back to his chest, back heel lifted.'],
  ['c3-hit',     'THROWING A WIDE HOOK, facing right, RIGHT arm swung round in a wide horizontal arc across his body, elbow bent at ninety degrees, torso rotated fully.'],
  ['c4-hit',     'THROWING AN UPPERCUT, facing right, RIGHT fist driving straight UPWARD from hip to head height, knees exploding upward, body rising onto the front foot.'],
  ['c5-wind',    'WINDING UP A SPINNING KICK, facing right, body turned away and coiled, arms crossed in front of his chest, weight on the front foot, about to spin.'],
  ['c5-hit',     'A HIGH SPINNING ROUNDHOUSE KICK, facing right, RIGHT leg swung up and fully extended forward at head height, body leaning back, arms out wide for balance.'],
  ['heavy-wind', 'WINDING UP A HAYMAKER, facing right, right fist pulled far back behind him, shoulder cocked, weight fully on the back foot, glaring forward.'],
  ['heavy-hit',  'LANDING A HAYMAKER, facing right, right arm fully extended forward and slightly downward, whole body committed and twisted into the blow, front knee bent deep.'],
  ['air-hit',    'A DIVING AIR ATTACK, facing right, both feet off the ground, right fist punched down and forward, body angled diagonally downward, legs trailing behind.'],
  ['carry',      'CARRYING SOMETHING HEAVY AND INVISIBLE at chest height, facing right, both arms bent up and forward as if gripping a large box, leaning back slightly. Do not draw the object.'],
  ['swing',      'SWINGING A HEAVY INVISIBLE OBJECT, facing right, both arms swung forward and across at chest height as if hurling something held in both hands, torso twisted through. Do not draw the object.'],
  ['throw',      'THROWING SOMETHING FORWARD OVERARM, facing right, right arm swung through and extended forward and down, body twisted into the throw. Do not draw the object.'],
  ['hurt',       'BEING HIT AND RECOILING BACKWARD, facing right, head snapped back, both arms flung up and back, torso arched, one foot lifting off the floor, eyes screwed shut.'],
  ['taunt',      'TAUNTING, facing right, both arms spread wide and open, chest out, chin up, grinning smugly at whoever he just wrecked.'],
];

const DESKS = [
  ['desk', `A single 2D game asset: an office desk seen straight from the SIDE, in flat side-on
elevation. It has a thick wooden desktop, a set of three drawers under one end with visible
handles, a modesty panel across the back, and sturdy square legs. It must read as a solid,
heavy piece of office furniture, not a thin bench or a table. Exactly ONE desk, nothing on it,
no chair, no computer, no duplicates.
${STYLE}
${GREEN}`],
  ['desk-alt', `A single 2D game asset: a modern office workstation desk seen straight from the SIDE in
flat side-on elevation - a dark grey desktop on a solid metal frame with a wide cable tray and a
low privacy panel rising from the back edge of the desktop. Heavy and substantial looking.
Exactly ONE desk, nothing on it, no chair, no computer, no duplicates.
${STYLE}
${GREEN}`],
  ['cabinet', `A single 2D game asset: a four-drawer metal office filing cabinet seen straight from the
SIDE in flat side-on elevation, with drawer handles and a small label holder on each drawer.
Exactly ONE cabinet, no duplicates.
${STYLE}
${GREEN}`],
];

async function api(path, opts = {}) {
  const r = await fetch(API + path, {
    ...opts,
    headers: { Authorization: 'Bearer ' + TOKEN, 'Content-Type': 'application/json', ...(opts.headers || {}) },
  });
  if (!r.ok) throw new Error(path + ' -> ' + r.status + ' ' + (await r.text()).slice(0, 200));
  return r.json();
}

function posePrompt(outfit, body) {
  return `Game animation frame for a 2D side-scrolling mobile game called "Worst Employee".
The attached image is the exact character reference. Redraw THE SAME person - same face, same
medium-brown skin, same build, same art style, same lighting. He is ${OUTFITS[outfit]}.
${SCALE}
POSE: ${body}
${STYLE}
${GREEN}
${ONE}`;
}

async function run(labels, prompts, out, attach = true) {
  const CHUNK = 14;                       // long queues stall; submit in batches
  const map = {};
  for (let i = 0; i < prompts.length; i += CHUNK) {
    const body = { prompt: prompts.slice(i, i + CHUNK).join('\n---\n'), mode: 'image' };
    if (attach) body.attach = [{ kind: 'up', file: REF }];
    const { queued } = await api('/api/generate', { method: 'POST', body: JSON.stringify(body) });
    queued.forEach((id, k) => { map[id] = labels[i + k]; });
    console.log(`  submitted ${queued.length} (${i + queued.length}/${prompts.length})`);
  }
  require('fs').writeFileSync(__dirname + '/' + out, JSON.stringify(map, null, 1));

  const seen = {};
  const total = Object.keys(map).length;
  for (let i = 0; i < 4000; i++) {
    await new Promise(r => setTimeout(r, 6000));
    const st = await api('/api/state');
    const mine = (st.jobs || []).filter(j => map[j.id]);
    for (const j of mine) {
      if (seen[j.id] === j.status || j.status === 'queued' || j.status === 'running') continue;
      seen[j.id] = j.status;
      if (j.status !== 'done') console.log(`  [${j.status}] ${map[j.id]}`);
    }
    const done = mine.filter(j => ['done', 'error', 'cancelled', 'failed'].includes(j.status));
    if (done.length % 10 === 0 && done.length) process.stdout.write(`\r  ${done.length}/${total}   `);
    if (done.length === total) { console.log(`\nDONE ${out}`); return; }
  }
};

(async () => {
  const cmd = process.argv[2];
  if (cmd === 'desks') {
    await run(DESKS.map(d => d[0]), DESKS.map(d => d[1]), 'pass6-desk-jobs.json', false);
  } else if (cmd === 'poses') {
    await run(POSES.map(p => 'base__' + p[0]),
              POSES.map(p => posePrompt('base', p[1])), 'pass6-pose-jobs.json');
  } else if (cmd === 'outfits') {
    const which = process.argv[3] ? [process.argv[3]] : ['scruff', 'hood', 'smart'];
    for (const o of which) {
      console.log('outfit: ' + o);
      await run(POSES.map(p => o + '__' + p[0]),
                POSES.map(p => posePrompt(o, p[1])), `pass6-${o}-jobs.json`);
    }
  } else console.log('usage: desks | poses | outfits [name]');
})().catch(e => { console.error('FAILED: ' + e.message); process.exit(1); });
