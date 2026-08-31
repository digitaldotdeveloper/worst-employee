// PASS 10 — reaction faces.
//
// Head-and-shoulders busts, one per character per emotion, popped in a callout
// bubble beside whoever it just happened to. Character-specific rather than
// generic emoji: the joke is SAMI's face when you take his monitor, not a
// yellow circle. Same reference-attach trick as every other cast pass.

const API = 'http://127.0.0.1:4321';
const TOKEN = '4bb94235c42a41f4eab766c1c8a33de9357d5b60c2164caf';

const STYLE =
  'STYLE: polished stylized cartoon with soft cel shading, clean crisp edges, bold readable ' +
  'exaggerated expression. High-budget 2D mobile game finish.';

const FRAME =
  'Draw ONLY the head and shoulders, filling the frame, facing the viewer, centred, with clear ' +
  'space around the head. Exactly ONE face. No body, no hands, no props, no speech bubble, ' +
  'no text, no watermark.';

const GREEN =
  'The background must be flat pure green #00FF00, uniform edge to edge, no shadow, no gradient. ' +
  'Nothing worn may be green.';

const EMO = [
  ['shock',  'utterly SHOCKED and horrified: eyes enormous and round, eyebrows shot up, mouth hanging wide open, cheeks pale'],
  ['fury',   'INCANDESCENT with rage: face red, brows slammed down into a deep V, teeth bared, veins standing out on the forehead'],
  ['dazed',  'completely DAZED and concussed: eyes crossed and unfocused, tongue slightly out, a woozy lopsided grin, head tilted'],
  ['weary',  'utterly FED UP and exhausted: heavy-lidded half-closed eyes, flat unimpressed mouth, one eyebrow raised, deeply unbothered'],
];

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
    const prompts = EMO.map(([, d]) =>
      `Character expression portrait for a 2D mobile game called "Worst Employee".
The attached image is the exact character reference. Draw THE SAME person - same face, same skin
tone, same hair, same clothes - now ${d}.
${FRAME}
${STYLE}
${GREEN}`);
    const { queued } = await api('/api/generate', {
      method: 'POST',
      body: JSON.stringify({ prompt: prompts.join('\n---\n'), mode: 'image', attach: [{ kind: 'up', file: ref }] }),
    });
    queued.forEach((id, i) => { map[id] = who + '__' + EMO[i][0]; });
    console.log(`${who}: queued ${queued.length}`);
  }
  require('fs').writeFileSync(__dirname + '/pass10-jobs.json', JSON.stringify(map, null, 1));
  const total = Object.keys(map).length;
  for (let i = 0; i < 2000; i++) {
    await new Promise(r => setTimeout(r, 6000));
    const st = await api('/api/state');
    const mine = (st.jobs || []).filter(j => map[j.id]);
    const done = mine.filter(j => ['done','error','cancelled','failed'].includes(j.status));
    if (done.length === total) { console.log('DONE ' + done.length); return; }
  }
})().catch(e => { console.error('FAILED: ' + e.message); process.exit(1); });
