// PASS 2 — production art, style D (polished cartoon).
//
//   node tools/pass2.js master        generate master reference candidates
//   node tools/pass2.js tests <file>  attach <file> from uploads/ and run the
//                                     consistency tests (pose + garment swap)
//
// WHY THE TESTS COME BEFORE THE BULK:
// The whole paper-doll plan rests on one assumption — that we can get the SAME
// character back in a different pose with only one garment changed. Style D has
// soft shading and a rim light, which is the hardest look to reproduce exactly.
// If that assumption fails we need to know after 4 images, not after 100.

const API = 'http://127.0.0.1:4321';
const TOKEN = '4bb94235c42a41f4eab766c1c8a33de9357d5b60c2164caf';   // "my script"

// The look that won. Worded the same everywhere so it stops being a variable.
const STYLE =
  'STYLE: polished stylized cartoon with soft cel shading, a warm rim light along one edge, ' +
  'subtle ambient occlusion and slightly more realistic proportions. The premium finish of a ' +
  'high-budget mobile game character. Clean crisp edges.';

// The base outfit deliberately matches the character creator defaults: short
// hair, plain tee, slacks, sneakers, no accessory. Everything else is a layer
// that goes ON TOP of this, so the base has to be the simplest version.
const HERO =
  'A young male office worker in his early twenties, medium-brown skin, short black hair, ' +
  'wearing a plain light-blue short-sleeved t-shirt, grey slacks and white sneakers. ' +
  'No tie, no lanyard, no badge, no glasses, no hat. ' +
  'His expression is mischievous and completely unbothered - the look of someone about to do ' +
  'something he absolutely should not do.';

const GREEN =
  'The background must be flat pure green #00FF00, completely uniform, edge to edge, with no ' +
  'shadow and no gradient on it. NOTHING the character wears or carries may be green - no green ' +
  'clothing, no green shoes, no green accessories - or it will be cut away with the background.';

const ONE =
  'Draw exactly ONE single figure. Do not draw the character twice, no duplicate, no turnaround ' +
  'sheet, no side-by-side variations. Full body from head to feet, nothing cropped or cut off. ' +
  'Draw the hair as one solid clean rounded shape with a crisp hard edge, never fine wispy ' +
  'see-through strands. No text, no labels, no logos, no watermark, no shadow on the ground.';

const MASTER = [
`Character reference sheet for a 2D side-scrolling mobile game called "Worst Employee".
${HERO}
${STYLE}
POSE: standing relaxed and neutral, three-quarter view facing right, weight on both feet,
arms hanging slightly away from the body so the arms do not overlap the torso and each limb
reads separately.
${GREEN}
${ONE}`,

`Character reference sheet for a 2D side-scrolling mobile game called "Worst Employee".
${HERO}
${STYLE}
POSE: standing ready, three-quarter view facing right, feet apart in a light fighting stance,
arms bent and held clearly away from the torso so every limb reads separately.
${GREEN}
${ONE}`,

`Character reference sheet for a 2D side-scrolling mobile game called "Worst Employee".
${HERO}
${STYLE}
POSE: standing straight on, front view, feet apart, arms held out and away from the body,
palms open, the whole body clearly readable with no limb overlapping another.
${GREEN}
${ONE}`,
];
const MASTER_LABELS = ['master-neutral', 'master-ready', 'master-front'];

// ---- the four tests that decide whether the layer plan survives ----
const REF = 'The attached image is the exact character reference. Redraw THE SAME person - ' +
  'same face, same medium-brown skin, same short black hair, same build, same art style, ' +
  'same soft cel shading and warm rim light. ';

const KEEP = 'He is still wearing the plain light-blue short-sleeved t-shirt, grey slacks and ' +
  'white sneakers. ';

const TESTS = [
  { label: 'test-pose-run',
    p: `${REF}${KEEP}Now draw him MID-RUN, three-quarter view facing right, one leg forward and one back,
arms swinging, leaning slightly into the run.
${STYLE}
${GREEN}
${ONE}` },

  { label: 'test-pose-punch',
    p: `${REF}${KEEP}Now draw him THROWING A PUNCH, three-quarter view facing right, right arm fully
extended forward at shoulder height, body twisted into the punch, back foot planted.
${STYLE}
${GREEN}
${ONE}` },

  { label: 'test-garment-hoodie',
    p: `${REF}Same neutral standing pose as the reference, three-quarter view facing right, identical
body position. Change ONLY the shirt: he now wears a plain dark-grey hooded sweatshirt with the hood
down, instead of the t-shirt. Everything else is identical - same grey slacks, same white sneakers,
same hair, same face, same pose, same lighting.
${STYLE}
${GREEN}
${ONE}` },

  { label: 'test-garment-hair',
    p: `${REF}${KEEP}Same neutral standing pose as the reference, three-quarter view facing right,
identical body position. Change ONLY the hair: he now has a short afro of tight curls drawn as one
solid rounded shape with a crisp hard edge. Everything else is identical - same clothes, same face,
same pose, same lighting.
${STYLE}
${GREEN}
${ONE}` },
];

async function api(path, opts = {}) {
  const r = await fetch(API + path, {
    ...opts,
    headers: { Authorization: 'Bearer ' + TOKEN, 'Content-Type': 'application/json', ...(opts.headers || {}) },
  });
  if (!r.ok) throw new Error(path + ' -> ' + r.status + ' ' + (await r.text()).slice(0, 200));
  return r.json();
}

async function run(prompts, labels, attachFile) {
  const body = { prompt: prompts.join('\n---\n'), mode: 'image' };
  if (attachFile) body.attach = [{ kind: 'up', file: attachFile }];
  const { queued } = await api('/api/generate', { method: 'POST', body: JSON.stringify(body) });
  console.log('queued ' + queued.length + (attachFile ? ' (ref: ' + attachFile + ')' : ''));
  queued.forEach((id, i) => console.log('  ' + id + '  ' + labels[i]));

  const want = new Set(queued), seen = {};
  for (let i = 0; i < 200; i++) {
    await new Promise(r => setTimeout(r, 5000));
    const st = await api('/api/state');
    const mine = (st.jobs || []).filter(j => want.has(j.id));
    for (const j of mine) {
      if (seen[j.id] === j.status) continue;
      seen[j.id] = j.status;
      console.log(`[${j.status}] ${labels[queued.indexOf(j.id)]} ${j.error || ''}`);
    }
    // a job that has not moved in ~5 min is hung; resubmit rather than wait
    if (mine.filter(j => ['done', 'error', 'cancelled'].includes(j.status)).length === queued.length) {
      console.log('ALL DONE'); return queued;
    }
  }
  console.log('TIMED OUT');
  return queued;
}

(async () => {
  const cmd = process.argv[2];
  if (cmd === 'master') await run(MASTER, MASTER_LABELS);
  else if (cmd === 'tests') {
    const file = process.argv[3];
    if (!file) throw new Error('usage: node tools/pass2.js tests <filename-in-uploads>');
    await run(TESTS.map(t => t.p), TESTS.map(t => t.label), file);
  } else console.log('usage: node tools/pass2.js master | tests <file>');
})().catch(e => { console.error('FAILED: ' + e.message); process.exit(1); });
