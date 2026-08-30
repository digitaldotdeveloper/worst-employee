// PASS 5 — the world: environment layers, props, coworkers, the boss.
//
//   node tools/pass5-world.js            everything
//   node tools/pass5-world.js props      just the props
//
// Props are generated ONE PER IMAGE on green rather than as a grid sheet. A
// sheet has to be segmented afterwards and the model duplicates items in it
// (the pass-1 sheet came back with two mugs and two chairs); one per image keys
// straight to a cutout with no segmentation step at all.
//
// Coworkers and the boss are generated in the SAME rig pose as the player, so
// they can be sliced by the same code and driven by the same skeleton.

const API = 'http://127.0.0.1:4321';
const TOKEN = '4bb94235c42a41f4eab766c1c8a33de9357d5b60c2164caf';
const REF = 'we-master.png';

const STYLE =
  'STYLE: polished stylized cartoon with soft cel shading, a warm rim light along one edge, ' +
  'subtle ambient occlusion, clean crisp edges. The look of a high-budget 2D mobile game.';

const GREEN =
  'The background must be flat pure green #00FF00, completely uniform edge to edge, no shadow, ' +
  'no gradient, no ground plane. Nothing in the picture may be green. ' +
  'No text, no labels, no watermark.';

// ---------------------------------------------------------------- props
const PROPS = [
  ['chair',        'a single office swivel chair with five castor wheels, a mesh back and armrests, seen from the side'],
  ['monitor',      'a single desktop computer monitor on a stand, screen dark, seen from the side at a slight angle'],
  ['printer',      'a single squat office laser printer with a paper tray, seen from the side'],
  ['phone',        'a single grey office desk telephone with a curly cord and a handset on its cradle, seen from the side'],
  ['mug',          'a single ceramic coffee mug with a handle, seen from the side'],
  ['bin',          'a single grey metal office waste bin, seen from the side'],
  ['plant',        'a single small potted office plant with broad green leaves in a terracotta pot, seen from the side'],
  ['extinguisher', 'a single red fire extinguisher standing upright with a black hose, seen from the side'],
  ['stack',        'a single untidy stack of white A4 papers lying flat, seen from the side'],
  ['cooler',       'a single office water cooler with a blue bottle on top and a white base, seen from the side'],
  ['coffee',       'a single black office coffee machine with a glass jug, seen from the side'],
  ['desk',         'a single plain rectangular office desk with a wooden top and grey legs, seen straight from the side'],
];

const BROKEN = [
  ['monitor-broken', 'a single desktop computer monitor, SMASHED and destroyed: the screen is cracked and shattered, the stand is bent, it is tipped over on its side'],
  ['printer-broken', 'a single office laser printer, SMASHED and destroyed: the casing is cracked open, the paper tray is snapped off, crumpled paper spills out of it'],
  ['chair-broken',   'a single office swivel chair, BROKEN and destroyed: the back is snapped off and hanging, two castor wheels are missing, it lies collapsed on its side'],
  ['bin-broken',     'a single grey metal office waste bin, CRUSHED and dented flat on one side, lying on its side with rubbish spilling out'],
  ['cooler-broken',  'a single office water cooler, DESTROYED: the blue bottle is cracked and empty, the base is split open and tipped over'],
  ['plant-broken',   'a single small potted plant, DESTROYED: the terracotta pot is smashed into pieces, soil and broken leaves scattered'],
];

// ---------------------------------------------------------------- environment
const ENV = [
  ['bg-wall',
   `A seamless side-on wall of a drab open-plan corporate office, drawn as a flat 2D game
background layer with NO perspective and NO vanishing point - a straight-on elevation.
Beige painted wall, a row of tall office windows showing a grey rainy city outside,
window frames in dark grey aluminium. The left and right edges must match so the image
can tile horizontally and repeat seamlessly. No floor, no ceiling, no furniture, no people.
${STYLE}
No text, no watermark. Wide banner composition.`],

  ['bg-ceiling',
   `A seamless side-on strip of a suspended office ceiling drawn as a flat 2D game layer with
NO perspective: white ceiling tiles in a grid, a recessed fluorescent strip light, and an air
conditioning vent. The left and right edges must match so it tiles horizontally and repeats
seamlessly. Nothing else in the image, no walls, no floor, no furniture, no people.
${STYLE}
No text, no watermark. Very wide and short banner composition.`],

  ['bg-floor',
   `A seamless side-on strip of drab grey-blue office carpet tile flooring, drawn as a flat 2D
game floor layer viewed straight on from the side, with a dark skirting board line along the
top edge. Slightly worn and stained. The left and right edges must match so it tiles
horizontally and repeats seamlessly. Nothing else, no furniture, no people, no perspective.
${STYLE}
No text, no watermark. Very wide and short banner composition.`],
];

// ---------------------------------------------------------------- cast
const RIG_POSE =
  'POSE: three-quarter view facing right, standing upright. The RIGHT arm is extended straight ' +
  'FORWARD horizontally at shoulder height, fist loosely closed. The LEFT arm is extended ' +
  'straight BACKWARD horizontally at shoulder height behind. The RIGHT leg is extended straight ' +
  'forward and downward at about 30 degrees from vertical, and the LEFT leg straight backward ' +
  'and downward at about 30 degrees, forming a wide open stride. Head upright, facing right. ';

const SEPARATED =
  'CRITICAL: every arm and leg must be COMPLETELY STRAIGHT, fully extended and clearly SEPARATED ' +
  'from the body and from each other, with visible green background in the gaps between every ' +
  'limb. No limb may overlap or touch another limb or the torso. Do not bend the elbows or knees. ' +
  'Draw exactly ONE single figure, no duplicate, no turnaround sheet.';

const CAST = [
  ['npc-sami',  'A bored male office worker in his thirties, pale skin, short brown hair, a neat beard, wearing a wrinkled white shirt with the sleeves rolled up, a loose grey tie, navy trousers and brown shoes.'],
  ['npc-rita',  'A tired female office worker in her late twenties, olive skin, dark hair tied back in a low ponytail drawn as one solid shape with a crisp edge, wearing a plain maroon blouse, black trousers and black flat shoes.'],
  ['npc-omar',  'An older male office worker in his fifties, brown skin, thinning grey hair, wearing a beige cardigan over a checked shirt, brown trousers and dark shoes.'],
  ['boss-calm', 'A heavy-set male office boss in his fifties, pale skin, balding on top with neat grey hair at the sides and a thick grey moustache, wearing a slightly-too-tight charcoal suit jacket, white shirt, red tie, and polished black shoes. He looks smug and pleased with himself.'],
  ['boss-rage', 'A heavy-set male office boss in his fifties, pale skin, balding on top with neat grey hair at the sides and a thick grey moustache, FURIOUS and red in the face with veins showing, his suit jacket thrown off so he is in a white shirt with the sleeves rolled up and a loosened red tie, dark suit trousers and polished black shoes.'],
];

async function api(path, opts = {}) {
  const r = await fetch(API + path, {
    ...opts,
    headers: { Authorization: 'Bearer ' + TOKEN, 'Content-Type': 'application/json', ...(opts.headers || {}) },
  });
  if (!r.ok) throw new Error(path + ' -> ' + r.status + ' ' + (await r.text()).slice(0, 200));
  return r.json();
}

function propPrompt(desc) {
  return `A single 2D game asset for a mobile game: ${desc}.
Drawn as a flat side-on game sprite, centred in the image with generous empty space around it,
the whole object visible and nothing cropped. Exactly ONE object, no duplicates, no variations,
no grid, no shadow on the ground.
${STYLE}
${GREEN}`;
}

function castPrompt(desc) {
  return `Character rig pose for a 2D side-scrolling mobile game called "Worst Employee".
${desc}
${RIG_POSE}
${SEPARATED}
${STYLE}
${GREEN}
Draw the figure at the same size and camera distance as the attached reference image.`;
}

async function run(items, prompts, out, attach) {
  const body = { prompt: prompts.join('\n---\n'), mode: 'image' };
  if (attach) body.attach = [{ kind: 'up', file: REF }];
  const { queued } = await api('/api/generate', { method: 'POST', body: JSON.stringify(body) });
  const map = {};
  queued.forEach((id, i) => { map[id] = items[i]; });
  require('fs').writeFileSync(__dirname + '/' + out, JSON.stringify(map, null, 1));
  console.log(`queued ${queued.length} -> ${out}`);

  const seen = {};
  for (let i = 0; i < 1200; i++) {
    await new Promise(r => setTimeout(r, 5000));
    const st = await api('/api/state');
    const mine = (st.jobs || []).filter(j => map[j.id]);
    for (const j of mine) {
      if (seen[j.id] === j.status || j.status === 'queued') continue;
      seen[j.id] = j.status;
      if (j.status !== 'running') console.log(`[${j.status}] ${map[j.id]} ${j.error || ''}`);
    }
    if (mine.filter(j => ['done', 'error', 'cancelled', 'failed'].includes(j.status)).length === queued.length) {
      console.log('DONE ' + out); return;
    }
  }
}

(async () => {
  const only = process.argv[2];
  if (!only || only === 'props') {
    const all = [...PROPS, ...BROKEN];
    await run(all.map(p => p[0]), all.map(p => propPrompt(p[1])), 'pass5-prop-jobs.json', false);
  }
  if (!only || only === 'env') {
    await run(ENV.map(e => e[0]), ENV.map(e => e[1]), 'pass5-env-jobs.json', false);
  }
  if (!only || only === 'cast') {
    await run(CAST.map(c => c[0]), CAST.map(c => castPrompt(c[1])), 'pass5-cast-jobs.json', true);
  }
})().catch(e => { console.error('FAILED: ' + e.message); process.exit(1); });
