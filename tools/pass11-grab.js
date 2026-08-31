// PASS 11 — the grab, as real drawn frames.
//
// Holding someone by the neck was being faked by drawing the victim's idle
// frame floating beside the player. Both halves need their own art: the player
// with an arm out and a fist closed on a collar, and the victim dangling.

const API = 'http://127.0.0.1:4321';
const TOKEN = '4bb94235c42a41f4eab766c1c8a33de9357d5b60c2164caf';

const STYLE = 'STYLE: polished stylized cartoon with soft cel shading, a warm rim light along one ' +
  'edge, subtle ambient occlusion, clean crisp edges. High-budget 2D mobile game finish.';
const SCALE = 'Draw the figure at EXACTLY the same size and camera distance as the attached ' +
  'reference image, standing on the same ground line, whole figure visible head to feet with ' +
  'clear empty space above and below. ';
const GREEN = 'The background must be flat pure green #00FF00, uniform edge to edge, no shadow, ' +
  'no gradient. Nothing worn may be green. ';
const ONE = 'Draw exactly ONE single figure. No duplicate, no second person, no text, no ' +
  'watermark, no ground shadow. Do not draw whoever they are holding or being held by.';

const OUTFITS = {
  base:  'a plain light-blue short-sleeved t-shirt, grey slacks and white sneakers, short black hair',
  scruff:'a rumpled white button-up shirt with sleeves rolled up and a loosened dark tie, grey slacks, brown shoes, short black hair',
  hood:  'a dark grey hooded sweatshirt with the hood down, black jeans, white sneakers, a short afro',
  smart: 'a navy blazer over a white shirt, a red tie, navy trousers, polished black shoes, neat short black hair',
};

// the player half
const GRABBER = [
  ['grab-hold', 'GRIPPING SOMEBODY BY THE THROAT AT ARM\'S LENGTH, three-quarter view facing right: ' +
    'his RIGHT arm is thrust straight out and locked at shoulder height, hand closed into a tight ' +
    'grip as if holding an invisible collar, left arm drawn back, feet planted wide and braced, ' +
    'leaning into it, grinning.'],
  ['grab-slap', 'MID-SLAP while holding somebody, three-quarter view facing right: his RIGHT arm ' +
    'still thrust straight out gripping an invisible collar at shoulder height, his LEFT arm swung ' +
    'right across his body in a wide open-palmed backhand, torso twisted through the swing.'],
];

// the victim half
const VICTIM = [
  ['held', 'BEING HELD UP BY THE THROAT, three-quarter view facing LEFT, hanging with both feet ' +
    'clear off the ground and kicking, both hands up clawing at an invisible grip on the collar, ' +
    'shoulders hunched up around the ears, face panicked, mouth open.'],
];

const JOBS = [];
for (const [o, desc] of Object.entries(OUTFITS)) {
  for (const [n, pose] of GRABBER) {
    JOBS.push([`${o}__${n}`, 'we-master.png',
      `Game animation frame for a 2D side-scrolling mobile game called "Worst Employee".
The attached image is the exact character reference. Redraw THE SAME person - same face, same
medium-brown skin, same build, same art style, same lighting. He is wearing ${desc}.
${SCALE}
POSE: ${pose}
${STYLE}
${GREEN}
${ONE}`]);
  }
}
for (const who of ['npc-sami', 'npc-rita', 'npc-omar']) {
  for (const [n, pose] of VICTIM) {
    JOBS.push([`${who}__${n}`, who + '.png',
      `Game animation frame for a 2D side-scrolling mobile game called "Worst Employee".
The attached image is the exact character reference. Redraw THE SAME person - same face, same skin,
same hair, same clothes, same build, same art style.
${SCALE}
POSE: ${pose}
${STYLE}
${GREEN}
${ONE}`]);
  }
}

async function api(path, opts = {}) {
  const r = await fetch(API + path, { ...opts,
    headers: { Authorization: 'Bearer ' + TOKEN, 'Content-Type': 'application/json', ...(opts.headers || {}) } });
  if (!r.ok) throw new Error(path + ' -> ' + r.status);
  return r.json();
}

(async () => {
  const map = {};
  // group by reference image, because attach is per-request
  const byRef = {};
  for (const [label, ref, prompt] of JOBS) (byRef[ref] = byRef[ref] || []).push([label, prompt]);
  for (const [ref, list] of Object.entries(byRef)) {
    const { queued } = await api('/api/generate', {
      method: 'POST',
      body: JSON.stringify({ prompt: list.map(l => l[1]).join('\n---\n'), mode: 'image',
                             attach: [{ kind: 'up', file: ref }] }),
    });
    queued.forEach((id, i) => { map[id] = list[i][0]; });
    console.log(`${ref}: queued ${queued.length}`);
  }
  require('fs').writeFileSync(__dirname + '/pass11-jobs.json', JSON.stringify(map, null, 1));
  const total = Object.keys(map).length;
  for (let i = 0; i < 2500; i++) {
    await new Promise(r => setTimeout(r, 6000));
    const st = await api('/api/state');
    const mine = (st.jobs || []).filter(j => map[j.id]);
    const done = mine.filter(j => ['done','error','cancelled','failed'].includes(j.status));
    if (done.length === total) { console.log('DONE ' + done.length); return; }
  }
})().catch(e => { console.error('FAILED: ' + e.message); process.exit(1); });
