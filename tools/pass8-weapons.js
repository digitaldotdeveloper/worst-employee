// PASS 8 — weapon sprites (script section 15).
//
//   node tools/pass8-weapons.js
//
// Weapons are drawn as separate held objects rather than baked into new player
// frames. Six weapons x eight combat poses would be 48 renders of the player;
// as attachments they are 5 renders total, and a held object is one of the few
// things that SHOULD be a separate sprite — real hands hold separate objects.
//
// Every weapon is drawn in the same orientation: handle at the LEFT, business
// end at the RIGHT, horizontal. The game rotates from there, so a weapon drawn
// at a different angle points the wrong way the moment it swings.

const API = 'http://127.0.0.1:4321';
const TOKEN = '4bb94235c42a41f4eab766c1c8a33de9357d5b60c2164caf';

const STYLE =
  'STYLE: polished stylized cartoon with soft cel shading, a warm rim light along one edge, ' +
  'subtle ambient occlusion, clean crisp edges. High-budget 2D mobile game finish.';

const GREEN =
  'The background must be flat pure green #00FF00, uniform edge to edge, no shadow, no gradient. ' +
  'Nothing in the picture may be green. No text, no labels, no watermark, no hands, no arms.';

const ORIENT =
  'Drawn horizontally in profile with the HANDLE or GRIP at the LEFT end of the image and the ' +
  'business end at the RIGHT. Centred with generous empty space around it. Exactly ONE object, ' +
  'no duplicates, no variations, no grid.';

const W = [
  ['hammer',      'a heavy claw hammer with a worn wooden handle and a steel head'],
  ['stapler',     'a chunky red heavy-duty office stapler, closed'],
  ['pan',         'a black cast-iron frying pan with a long handle'],
  ['rocketchair', 'an office swivel chair with two crude metal rocket boosters strapped to its base with duct tape, small flames at the nozzles'],
  ['keyboard',    'a grey office computer keyboard with a coiled cable trailing from one end'],
];

async function api(path, opts = {}) {
  const r = await fetch(API + path, { ...opts,
    headers: { Authorization: 'Bearer ' + TOKEN, 'Content-Type': 'application/json', ...(opts.headers || {}) } });
  if (!r.ok) throw new Error(path + ' -> ' + r.status);
  return r.json();
}

(async () => {
  const prompts = W.map(([, d]) =>
    `A single 2D game weapon sprite for a mobile game: ${d}.\n${ORIENT}\n${STYLE}\n${GREEN}`);
  const { queued } = await api('/api/generate', {
    method: 'POST', body: JSON.stringify({ prompt: prompts.join('\n---\n'), mode: 'image' }) });
  const map = {}; queued.forEach((id, i) => { map[id] = W[i][0]; });
  require('fs').writeFileSync(__dirname + '/pass8-jobs.json', JSON.stringify(map, null, 1));
  console.log('queued ' + queued.length);
  for (let i = 0; i < 900; i++) {
    await new Promise(r => setTimeout(r, 6000));
    const st = await api('/api/state');
    const mine = (st.jobs || []).filter(j => map[j.id]);
    const done = mine.filter(j => ['done','error','cancelled','failed'].includes(j.status));
    if (done.length === queued.length) { console.log('DONE'); return; }
  }
})().catch(e => { console.error('FAILED: ' + e.message); process.exit(1); });
