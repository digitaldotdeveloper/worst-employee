// PASS 3 — animation key poses, style D, against the locked master reference.
//
//   node tools/pass3-anim.js
//
// Key poses, not every frame. A 4-frame run cycle reads fine at phone size and
// costs a quarter of what 8 frames cost; the engine already adds bob, squash
// and swing on top. Frame counts in assets/manifest.json are the ceiling, not
// the order.
//
// Scale consistency is the thing that matters most here: every pose must be
// drawn at the same camera distance with the feet on the same ground line, or
// the character will jitter in size between animation states.

const API = 'http://127.0.0.1:4321';
const TOKEN = '4bb94235c42a41f4eab766c1c8a33de9357d5b60c2164caf';
const REF_FILE = 'we-master.png';

const STYLE =
  'STYLE: polished stylized cartoon with soft cel shading, a warm rim light along one edge, ' +
  'subtle ambient occlusion. Clean crisp edges.';

const SAME =
  'The attached image is the exact character reference. Redraw THE SAME person - same face, ' +
  'same medium-brown skin, same short black hair, same build, same art style, same lighting. ' +
  'He is still wearing the plain light-blue short-sleeved t-shirt, grey slacks and white sneakers. ';

const SCALE =
  'Draw him at the SAME SIZE and the SAME camera distance as the reference image, standing on ' +
  'the same ground line, the whole figure visible from head to feet with clear empty space above ' +
  'his head and below his feet. ';

const GREEN =
  'The background must be flat pure green #00FF00, completely uniform edge to edge, no shadow, ' +
  'no gradient. Nothing he wears may be green. ';

const ONE =
  'Draw exactly ONE single figure. No duplicate, no turnaround sheet, no side-by-side poses, ' +
  'no motion-blur trails, no speed lines, no text, no watermark, no ground shadow.';

const POSES = [
  ['idle',        'Standing idle at rest, three-quarter view facing right, weight settled, arms relaxed at his sides, a slight smirk.'],
  ['run-1',       'MID-RUN contact frame, three-quarter view facing right: right leg stretched forward with the heel about to land, left leg extended back, left arm forward, right arm back, torso leaning slightly forward.'],
  ['run-2',       'MID-RUN passing frame, three-quarter view facing right: right leg straight and bearing weight underneath him, left knee lifted high in front, arms roughly vertical at his sides, body at its highest point.'],
  ['run-3',       'MID-RUN contact frame mirrored, three-quarter view facing right: left leg stretched forward with the heel about to land, right leg extended back, right arm forward, left arm back, torso leaning slightly forward.'],
  ['run-4',       'MID-RUN passing frame mirrored, three-quarter view facing right: left leg straight and bearing weight underneath him, right knee lifted high in front, arms roughly vertical at his sides.'],
  ['jump-up',     'JUMPING UPWARD, three-quarter view facing right, both feet off the ground and tucked slightly under him, knees bent, arms swung up, body stretched tall, looking up.'],
  ['fall',        'FALLING DOWNWARD, three-quarter view facing right, legs reaching down for the landing, arms out slightly for balance, body compact.'],
  ['dodge',       'DODGING - a fast low sideways dash, three-quarter view facing right, body crouched low and leaning hard forward, one arm trailing behind, both feet barely off the floor.'],
  ['light1',      'THROWING A QUICK JAB, three-quarter view facing right, left arm punching straight forward at shoulder height, right fist held up guarding his chin, feet planted.'],
  ['light2',      'THROWING A CROSS PUNCH, three-quarter view facing right, right arm fully extended forward at shoulder height, torso twisted into the punch, left fist pulled back to his chest.'],
  ['light3',      'THROWING A HIGH ROUNDHOUSE KICK, three-quarter view facing right, right leg swung up and extended forward at chest height, arms out for balance, standing on his left leg.'],
  ['heavy-wind',  'WINDING UP A HEAVY PUNCH, three-quarter view facing right, right fist pulled far back behind him, shoulder cocked, weight shifted onto the back foot, glaring forward.'],
  ['heavy-hit',   'LANDING A HEAVY HAYMAKER PUNCH, three-quarter view facing right, right arm fully extended forward and slightly downward, whole body committed and twisted into the blow, front knee bent deep.'],
  ['carry',       'CARRYING SOMETHING HEAVY AND INVISIBLE at chest height, three-quarter view facing right, both arms bent up and forward as if gripping a large box, leaning back slightly to take the weight. Do not draw the object, only his posture.'],
  ['throw',       'THROWING SOMETHING FORWARD OVERARM, three-quarter view facing right, right arm swung through and extended forward and down, body twisted into the throw, front foot planted. Do not draw the object.'],
  ['hurt',        'BEING HIT AND RECOILING BACKWARD, three-quarter view facing right, head snapped back, both arms flung up and back, torso arched, one foot lifting off the floor, eyes screwed shut.'],

  // The rig sheet: limbs deliberately separated so each body part can be cut
  // out cleanly. This is the one that decides whether customization can survive
  // animation - see the note in _CONTINUE-HERE.md.
  ['rig-apose',   'Standing in a wide symmetrical A-POSE, FRONT VIEW facing the camera directly, legs apart, both arms held straight out and DOWN at roughly 45 degrees away from the body, palms open and flat, fingers together. Every limb must be clearly separated with visible green background between the arms and the torso and between the legs. No limb may overlap or touch any other limb.'],
];

async function api(path, opts = {}) {
  const r = await fetch(API + path, {
    ...opts,
    headers: { Authorization: 'Bearer ' + TOKEN, 'Content-Type': 'application/json', ...(opts.headers || {}) },
  });
  if (!r.ok) throw new Error(path + ' -> ' + r.status + ' ' + (await r.text()).slice(0, 200));
  return r.json();
}

(async () => {
  const prompts = POSES.map(([, body]) =>
    `Game animation frame for a 2D side-scrolling mobile game called "Worst Employee".
${SAME}${SCALE}
POSE: ${body}
${STYLE}
${GREEN}
${ONE}`);
  const labels = POSES.map(p => p[0]);

  const { queued } = await api('/api/generate', {
    method: 'POST',
    body: JSON.stringify({ prompt: prompts.join('\n---\n'), mode: 'image', attach: [{ kind: 'up', file: REF_FILE }] }),
  });
  console.log('queued ' + queued.length + ' poses');
  const map = {};
  queued.forEach((id, i) => { map[id] = labels[i]; console.log('  ' + id + '  ' + labels[i]); });
  require('fs').writeFileSync(__dirname + '/pass3-jobs.json', JSON.stringify(map, null, 1));

  const seen = {};
  for (let i = 0; i < 400; i++) {
    await new Promise(r => setTimeout(r, 5000));
    const st = await api('/api/state');
    const mine = (st.jobs || []).filter(j => map[j.id]);
    for (const j of mine) {
      if (seen[j.id] === j.status) continue;
      seen[j.id] = j.status;
      if (j.status !== 'queued') console.log(`[${j.status}] ${map[j.id]} ${j.error || ''}`);
    }
    const done = mine.filter(j => ['done', 'error', 'cancelled'].includes(j.status));
    if (done.length === queued.length) { console.log('ALL DONE'); break; }
  }
})().catch(e => { console.error('FAILED: ' + e.message); process.exit(1); });
