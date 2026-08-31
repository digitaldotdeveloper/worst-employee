// PASS 12 — seated workers, and expressions for the player.
//
// Colleagues stood bolt upright "at" a desk, which is the single most obviously
// fake thing in the office. And the player was the only character whose face
// never changed, because the reaction set only covered the cast.

const API='http://127.0.0.1:4321', TOKEN='4bb94235c42a41f4eab766c1c8a33de9357d5b60c2164caf';
const STYLE='STYLE: polished stylized cartoon with soft cel shading, a warm rim light along one edge, subtle ambient occlusion, clean crisp edges. High-budget 2D mobile game finish.';
const GREEN='The background must be flat pure green #00FF00, uniform edge to edge, no shadow, no gradient. Nothing worn may be green.';
const ONE='Draw exactly ONE single figure, no duplicate, no text, no watermark, no ground shadow.';

const SIT = 'SEATED ON AN OFFICE CHAIR AND TYPING, strict side view facing right: knees bent at a '
  + 'right angle with the lower legs vertical and feet flat on the floor, thighs horizontal, back '
  + 'slightly hunched forward, both arms reaching forward and slightly down as if resting on a '
  + 'keyboard, head tilted toward a screen. Do NOT draw the chair, the desk or the keyboard — only '
  + 'the person, in the seated shape.';

const FACES = [
  ['smirk',   'wearing a smug, delighted, self-satisfied smirk, one eyebrow raised, clearly pleased with himself'],
  ['grimace', 'GRIMACING with effort and distaste, teeth gritted, one eye squeezed shut, nose wrinkled'],
  ['glee',    'openly DELIGHTED and cackling, eyes screwed up, mouth wide open laughing, head tipped back'],
];
const FACE_FRAME = 'Draw ONLY the head and shoulders, filling the frame, facing the viewer, centred, '
  + 'with clear space around the head. Exactly ONE face. No body, no hands, no props, no text.';

const JOBS=[];
for (const who of ['npc-sami','npc-rita','npc-omar']) {
  JOBS.push([who+'__sit', who+'.png',
`Game animation frame for a 2D side-scrolling mobile game called "Worst Employee".
The attached image is the exact character reference. Redraw THE SAME person - same face, same skin,
same hair, same clothes, same build, same art style.
Draw the figure at the same camera distance as the reference, whole figure visible, clear space
above and below.
POSE: ${SIT}
${STYLE}
${GREEN}
${ONE}`]);
}
for (const [n,d] of FACES) {
  JOBS.push(['player__'+n, 'we-master.png',
`Character expression portrait for a 2D mobile game called "Worst Employee".
The attached image is the exact character reference. Draw THE SAME person - same face, same
medium-brown skin, same short black hair - now ${d}.
${FACE_FRAME}
${STYLE}
${GREEN}`]);
}

async function api(path,opts={}){const r=await fetch(API+path,{...opts,headers:{Authorization:'Bearer '+TOKEN,'Content-Type':'application/json',...(opts.headers||{})}});if(!r.ok)throw new Error(path+' -> '+r.status);return r.json();}
(async()=>{
  const map={}, byRef={};
  for (const [label,ref,prompt] of JOBS) (byRef[ref]=byRef[ref]||[]).push([label,prompt]);
  for (const [ref,list] of Object.entries(byRef)) {
    const {queued}=await api('/api/generate',{method:'POST',
      body:JSON.stringify({prompt:list.map(l=>l[1]).join('\n---\n'),mode:'image',attach:[{kind:'up',file:ref}]})});
    queued.forEach((id,i)=>{map[id]=list[i][0];});
    console.log(ref+': '+queued.length);
  }
  require('fs').writeFileSync(__dirname+'/pass12-jobs.json',JSON.stringify(map,null,1));
  const total=Object.keys(map).length;
  for(let i=0;i<2500;i++){
    await new Promise(r=>setTimeout(r,6000));
    const st=await api('/api/state');
    const mine=(st.jobs||[]).filter(j=>map[j.id]);
    if(mine.filter(j=>['done','error','cancelled','failed'].includes(j.status)).length===total){console.log('DONE');return;}
  }
})().catch(e=>{console.error('FAILED: '+e.message);process.exit(1);});
