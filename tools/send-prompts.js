// Submit the Worst Employee concept prompts to Gemini Studio.
//
//   node tools/send-prompts.js          submit pass 1 and poll until done
//   node tools/send-prompts.js --list   print the prompts, submit nothing
//
// Gemini Studio must be running (tray app) at 127.0.0.1:4321. Jobs are QUEUED,
// not awaited — finished files land in the dashboard's library/<date>/ and the
// job record's `file` field is the relative path.

const API = 'http://127.0.0.1:4321';
const TOKEN = '4bb94235c42a41f4eab766c1c8a33de9357d5b60c2164caf';   // "my script"

// The character, worded identically everywhere so style is the only variable.
const HERO =
  'A young male office worker in his early twenties, medium-brown skin, short black hair, ' +
  'wearing a rumpled light-blue button-up shirt with the sleeves rolled up, a loosened dark navy tie, ' +
  'grey slacks and white sneakers, with a staff ID badge hanging from a blue lanyard around his neck. ' +
  'His expression is mischievous and completely unbothered - the look of someone about to do something ' +
  'he absolutely should not do.';

const RULES =
  'Draw exactly ONE single figure. Do not draw the character twice, no duplicate, no turnaround sheet. ' +
  'Full body from head to feet, nothing cropped. Three-quarter view facing right. ' +
  'Draw the hair as one solid clean rounded shape with a crisp hard edge, never fine wispy see-through strands. ' +
  'The silhouette must stay readable when shrunk very small. Plain flat neutral light-grey background, ' +
  'no scenery, no text, no logos, no watermark.';

const PROMPTS = [
// ---------------------------------------------------------------- style tests
`Character concept art for a 2D side-scrolling mobile beat-em-up comedy game called "Worst Employee".
${HERO}
STYLE: bold flat vector cartoon. Thick confident black outlines, flat colour fills with almost no gradients,
a limited punchy palette, chunky exaggerated proportions with a large head and short sturdy body.
The look of a modern mobile brawler that has to read clearly on a small phone screen.
${RULES}`,

`Character concept art for a 2D side-scrolling mobile beat-em-up comedy game called "Worst Employee".
${HERO}
STYLE: hand-drawn ink comic. Loose scratchy expressive linework with visible pen texture, flat cel shading,
slightly wobbly imperfect lines, the energy of a newspaper comic strip about office life.
Comedy first - the drawing itself should be funny.
${RULES}`,

`Character concept art for a 2D side-scrolling mobile beat-em-up comedy game called "Worst Employee".
${HERO}
STYLE: clean modern flat illustration. No outlines at all, built from simple geometric shapes,
a muted corporate palette of greys and desaturated blues lifted by one single hot accent colour,
soft long shadows. Elegant and graphic rather than cartoonish.
${RULES}`,

`Character concept art for a 2D side-scrolling mobile beat-em-up comedy game called "Worst Employee".
${HERO}
STYLE: polished stylized cartoon with soft cel shading, a warm rim light along one edge,
subtle ambient occlusion and slightly more realistic proportions. The premium finish of a
high-budget mobile game character select screen.
${RULES}`,

// ---------------------------------------------------------------- environment
`Environment concept art for a 2D side-scrolling mobile game called "Worst Employee".
A wide open-plan corporate office drawn as a flat side-on elevation, exactly like a 2D platformer stage -
the camera looks straight at the wall, no perspective, no vanishing point, everything in one flat plane.
Left to right: a row of grey cubicle desks with monitors and office chairs, a photocopier, a water cooler,
a coffee machine, a sad potted plant, a wall of tall windows showing a dull grey city, harsh fluorescent
ceiling strip lights, and a motivational poster on the wall reading "WE'RE A FAMILY".
Slightly grim, slightly funny, soulless corporate beige and grey with cold blue window light.
Flat clean vector cartoon style, bold outlines, no characters, no people. Wide banner composition.`,

// ---------------------------------------------------------------- boss stages
`Character sheet for a 2D mobile game called "Worst Employee".
The SAME middle-aged male office boss drawn FIVE times in a single horizontal row, left to right,
showing his emotional decline. He is heavy-set, balding on top with neat grey hair at the sides,
a thick moustache, wearing a slightly-too-tight charcoal suit with a red tie and polished black shoes.
It must obviously be the same man in all five: same suit, same build, same face.
1. FRIENDLY - warm welcoming smile, arms open, genuinely pleased.
2. CONCERNED - polite tight smile, one eyebrow raised, checking his watch.
3. ANNOYED - arms folded, frowning, tapping one foot.
4. ANGRY - red in the face, pointing accusingly, tie askew.
5. ENRAGED - jacket thrown off, sleeves rolled up, veins showing, ready to fight, absolutely furious.
Bold flat vector cartoon, thick black outlines, flat fills, readable at small size.
Full body each, all five the same height, evenly spaced, plain flat light-grey background,
no text, no labels, no numbers, no watermark.`,

// ---------------------------------------------------------------- props sheet
`Game asset sheet for a 2D side-scrolling mobile game called "Worst Employee".
A neat grid of separate office objects drawn in flat side-on elevation, like 2D platformer props.
Include: an office swivel chair, a desktop computer monitor, a printer, a desk telephone,
a coffee mug, a metal waste bin, a small potted plant, a red fire extinguisher, a stack of loose papers,
a water cooler, a coffee machine, and a plain office desk.
Every object clearly separated from the others with generous space between them, none overlapping,
each one complete and centred in its own cell.
Bold flat vector cartoon style, thick black outlines, flat colour fills, muted office palette
of greys, beiges and dull blues. Objects must read instantly as tiny silhouettes.
Plain flat light-grey background, no text, no labels, no captions, no watermark.`,
];

const LABELS = [
  'style-A-flat-vector', 'style-B-ink-comic', 'style-C-flat-illustration',
  'style-D-polished-cartoon', 'environment-office', 'boss-five-stages', 'props-sheet',
];

async function api(path, opts = {}) {
  const r = await fetch(API + path, {
    ...opts,
    headers: { 'Authorization': 'Bearer ' + TOKEN, 'Content-Type': 'application/json', ...(opts.headers || {}) },
  });
  if (!r.ok) throw new Error(path + ' -> ' + r.status + ' ' + (await r.text()).slice(0, 200));
  return r.json();
}

(async () => {
  if (process.argv.includes('--list')) {
    PROMPTS.forEach((p, i) => console.log('\n===== ' + LABELS[i] + ' =====\n' + p));
    return;
  }

  const { queued } = await api('/api/generate', {
    method: 'POST',
    body: JSON.stringify({ prompt: PROMPTS.join('\n---\n'), mode: 'image' }),
  });
  console.log('queued ' + queued.length + ' jobs');
  queued.forEach((id, i) => console.log('  ' + id + '  ' + (LABELS[i] || '')));

  const want = new Set(queued);
  const seen = {};
  for (let i = 0; i < 240; i++) {                 // up to ~20 min
    await new Promise(r => setTimeout(r, 5000));
    const st = await api('/api/state');
    const mine = (st.jobs || []).filter(j => want.has(j.id));
    for (const j of mine) {
      if (seen[j.id] === j.status) continue;
      seen[j.id] = j.status;
      const label = LABELS[queued.indexOf(j.id)] || '';
      console.log(`[${j.status}] ${label} ${j.file || ''} ${j.error || ''}`);
    }
    const done = mine.filter(j => ['done', 'error', 'cancelled'].includes(j.status));
    if (done.length === queued.length) { console.log('ALL DONE'); break; }
  }
})().catch(e => { console.error('FAILED: ' + e.message); process.exit(1); });
