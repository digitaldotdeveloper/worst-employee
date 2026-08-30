// PASS 9 — redo the knocked-down frame as a SIDE view.
//
// The first attempt came back as a bird's-eye view: the body splayed out as if
// the camera were above it. In a side-scroller that reads as floating however
// you anchor it, because the bulk of the drawing sits well above its own lowest
// pixel. What a side-on game needs is a LOW WIDE silhouette hugging the ground.

const API = 'http://127.0.0.1:4321';
const TOKEN = '4bb94235c42a41f4eab766c1c8a33de9357d5b60c2164caf';

const STYLE =
  'STYLE: polished stylized cartoon with soft cel shading, a warm rim light along one edge, ' +
  'subtle ambient occlusion, clean crisp edges. High-budget 2D mobile game finish.';

const GREEN =
  'The background must be flat pure green #00FF00, uniform edge to edge, no shadow, no gradient. ' +
  'Nothing worn may be green. No text, no watermark, no ground shadow, no motion lines.';

const POSE =
  'POSE: KNOCKED OUT AND LYING ON THE GROUND, drawn in STRICT SIDE VIEW as if the camera is ' +
  'down at floor level looking horizontally across the floor. This is NOT a view from above - ' +
  'do not draw him from a bird\'s-eye angle. He is lying on his SIDE, curled slightly, facing ' +
  'right, knees bent up a little, both arms tucked in near his chest rather than splayed out ' +
  'wide. His whole body rests flat ON the ground: the silhouette must be LOW and WIDE, no taller ' +
  'than about one third of his standing height, and the underside of his body, hip, shoulder and ' +
  'head must all sit along the SAME flat horizontal ground line at the very bottom of the figure. ' +
  'Eyes closed or dazed, mouth open.';

const WHO = [
  ['npc-sami',  'npc-sami.png'],
  ['npc-rita',  'npc-rita.png'],
  ['npc-omar',  'npc-omar.png'],
  ['boss-rage', 'boss-rage.png'],
];

async function api(path, opts = {}) {
  const r = await fetch(API + path, { ...opts,
    headers: { Authorization: 'Bearer ' + TOKEN, 'Content-Type': 'application/json', ...(opts.headers || {}) } });
  if (!r.ok) throw new Error(path + ' -> ' + r.status);
  return r.json();
}

(async () => {
  const map = {};
  for (const [who, ref] of WHO) {
    const prompt = `Game animation frame for a 2D side-scrolling mobile game called "Worst Employee".
The attached image is the exact character reference. Redraw THE SAME person - same face, same skin
tone, same hair, same clothes, same build, same art style, same lighting.
Draw the figure at the same camera distance as the reference, whole body visible, with clear empty
space above and below it.
${POSE}
${STYLE}
${GREEN}
Draw exactly ONE single figure, no duplicate, no turnaround sheet.`;
    const { queued } = await api('/api/generate', {
      method: 'POST',
      body: JSON.stringify({ prompt, mode: 'image', attach: [{ kind: 'up', file: ref }] }),
    });
    map[queued[0]] = who + '__down';
  }
  require('fs').writeFileSync(__dirname + '/pass9-jobs.json', JSON.stringify(map, null, 1));
  console.log('queued ' + Object.keys(map).length);

  const total = Object.keys(map).length;
  for (let i = 0; i < 900; i++) {
    await new Promise(r => setTimeout(r, 6000));
    const st = await api('/api/state');
    const mine = (st.jobs || []).filter(j => map[j.id]);
    const done = mine.filter(j => ['done','error','cancelled','failed'].includes(j.status));
    if (done.length === total) { console.log('DONE'); return; }
  }
})().catch(e => { console.error('FAILED: ' + e.message); process.exit(1); });
