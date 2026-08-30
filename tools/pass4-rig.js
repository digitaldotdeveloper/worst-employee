// PASS 4 — the rig pose, and the garment variants that ride on it.
//
//   node tools/pass4-rig.js base       the rig pose candidates
//   node tools/pass4-rig.js variants   every clothing option, same rig pose
//
// WHY THIS POSE:
// The A-pose from pass 3 is front-facing, but all 17 drawn poses are
// three-quarter facing right, and the game flips them for facing. A front-facing
// rig next to three-quarter animation looks wrong.
//
// So the rig pose is three-quarter facing right with every limb STRAIGHT and
// pointing in a different direction - one arm forward, one back, one leg
// forward, one back. Straight limbs matter as much as separated ones: a bent
// elbow cannot be cut into two clean segments, and a foreshortened limb cannot
// be rotated to another angle without looking wrong.

const API = 'http://127.0.0.1:4321';
const TOKEN = '4bb94235c42a41f4eab766c1c8a33de9357d5b60c2164caf';
const REF = 'we-master.png';

const STYLE =
  'STYLE: polished stylized cartoon with soft cel shading, a warm rim light along one edge, ' +
  'subtle ambient occlusion. Clean crisp edges.';

const SAME =
  'The attached image is the exact character reference. Redraw THE SAME person - same face, ' +
  'same medium-brown skin, same build, same art style, same lighting. ';

const GREEN =
  'The background must be flat pure green #00FF00, completely uniform edge to edge, no shadow, ' +
  'no gradient. Nothing he wears may be green. ';

const ONE =
  'Draw exactly ONE single figure, no duplicate, no turnaround sheet, no text, no watermark, ' +
  'no ground shadow. Draw him at the same size and camera distance as the reference.';

const SEPARATED =
  'CRITICAL: every arm and leg must be COMPLETELY STRAIGHT, fully extended, and clearly ' +
  'SEPARATED from the body and from each other, with visible green background in the gaps ' +
  'between every limb. No limb may overlap or touch another limb or the torso. Do not bend the ' +
  'elbows or the knees. Every limb must be shown at its full length, not foreshortened.';

const RIG_POSE =
  'POSE: three-quarter view facing right, standing upright. His RIGHT arm is extended straight ' +
  'FORWARD horizontally at shoulder height, fist loosely closed. His LEFT arm is extended ' +
  'straight BACKWARD horizontally at shoulder height behind him, fist loosely closed. His RIGHT ' +
  'leg is extended straight forward and downward at about 30 degrees from vertical, and his LEFT ' +
  'leg is extended straight backward and downward at about 30 degrees from vertical, so his legs ' +
  'form a wide open stride. Head upright and facing right. ';

const BASE_OUTFIT =
  'He wears a plain light-blue short-sleeved t-shirt, grey slacks and white sneakers, and has ' +
  'short black hair. No tie, no lanyard, no badge, no glasses, no hat. ';

const BASE = [
  ['rig-a', ''],
  ['rig-b', 'Keep his torso squarely upright and his shoulders level. '],
  ['rig-c', 'Draw him slightly larger in frame, filling more of the image height. '],
];

// Each variant changes exactly ONE thing. The pose wording is identical so the
// body lands in the same place and only the changed part differs.
const VARIANTS = [
  // hair
  ['hair-buzz',   'His hair is a very short buzz cut, drawn as one solid shape with a crisp edge. '],
  ['hair-curls',  'His hair is a short afro of tight curls, drawn as one solid rounded shape with a crisp hard edge. '],
  ['hair-bun',    'His hair is pulled back into a small top-knot bun, drawn as one solid shape with a crisp edge. '],
  ['hair-long',   'His hair is straight and collar-length, drawn as one solid shape with a crisp hard edge, never wispy strands. '],
  ['hair-spiky',  'His hair is short and spiked upward, drawn as one solid shape with crisp pointed edges. '],
  // shirts
  ['shirt-polo',      'Instead of the t-shirt he wears a light-blue short-sleeved polo shirt with a small collar. '],
  ['shirt-buttonup',  'Instead of the t-shirt he wears a light-blue long-sleeved button-up shirt with the sleeves rolled to the elbow and a collar. '],
  ['shirt-hoodie',    'Instead of the t-shirt he wears a light-blue hooded sweatshirt with the hood down and long sleeves. '],
  ['shirt-vest',      'Instead of the t-shirt he wears a light-blue sleeveless V-neck sweater vest over a white shirt. '],
  ['shirt-tank',      'Instead of the t-shirt he wears a light-blue sleeveless vest top with bare shoulders and bare arms. '],
  // trousers
  ['trousers-jeans',  'Instead of the slacks he wears grey denim jeans. '],
  ['trousers-shorts', 'Instead of the slacks he wears grey knee-length shorts, so his lower legs are bare. '],
  ['trousers-cargo',  'Instead of the slacks he wears baggy grey cargo trousers with side pockets. '],
  // shoes
  ['shoes-formal',   'Instead of the sneakers he wears polished black formal leather shoes. '],
  ['shoes-boots',    'Instead of the sneakers he wears chunky brown work boots. '],
  ['shoes-sandals',  'Instead of the sneakers he wears simple brown sandals. '],
  // accessories
  ['acc-glasses',    'He is also wearing black-rimmed glasses. '],
  ['acc-tie',        'He is also wearing a dark red necktie hanging down his chest. '],
  ['acc-lanyard',    'He is also wearing a blue lanyard around his neck with a white ID badge hanging on his chest. '],
  ['acc-cap',        'He is also wearing a navy baseball cap facing forward. '],
  ['acc-headphones', 'He is also wearing large black over-ear headphones. '],
];

async function api(path, opts = {}) {
  const r = await fetch(API + path, {
    ...opts,
    headers: { Authorization: 'Bearer ' + TOKEN, 'Content-Type': 'application/json', ...(opts.headers || {}) },
  });
  if (!r.ok) throw new Error(path + ' -> ' + r.status + ' ' + (await r.text()).slice(0, 200));
  return r.json();
}

function build(extra) {
  return `Character rig pose for a 2D side-scrolling mobile game called "Worst Employee".
${SAME}${BASE_OUTFIT}${extra}
${RIG_POSE}
${SEPARATED}
${STYLE}
${GREEN}
${ONE}`;
}

async function run(items, outFile) {
  const prompts = items.map(([, extra]) => build(extra));
  const { queued } = await api('/api/generate', {
    method: 'POST',
    body: JSON.stringify({ prompt: prompts.join('\n---\n'), mode: 'image', attach: [{ kind: 'up', file: REF }] }),
  });
  const map = {};
  queued.forEach((id, i) => { map[id] = items[i][0]; });
  require('fs').writeFileSync(__dirname + '/' + outFile, JSON.stringify(map, null, 1));
  console.log('queued ' + queued.length + ' -> ' + outFile);

  const seen = {};
  for (let i = 0; i < 900; i++) {
    await new Promise(r => setTimeout(r, 5000));
    const st = await api('/api/state');
    const mine = (st.jobs || []).filter(j => map[j.id]);
    for (const j of mine) {
      if (seen[j.id] === j.status || j.status === 'queued') continue;
      seen[j.id] = j.status;
      console.log(`[${j.status}] ${map[j.id]} ${j.error || ''}`);
    }
    if (mine.filter(j => ['done', 'error', 'cancelled'].includes(j.status)).length === queued.length) {
      console.log('ALL DONE'); return;
    }
  }
  console.log('TIMED OUT');
}

(async () => {
  const cmd = process.argv[2];
  if (cmd === 'base') await run(BASE, 'pass4-base-jobs.json');
  else if (cmd === 'variants') await run(VARIANTS, 'pass4-variant-jobs.json');
  else console.log('usage: node tools/pass4-rig.js base | variants');
})().catch(e => { console.error('FAILED: ' + e.message); process.exit(1); });
