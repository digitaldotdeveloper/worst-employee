// THE SKELETON.
//
// Ten cut-out body parts from one render, rotated about their joints. This is
// what lets customization survive animation: a shirt is one swapped part and it
// works across every pose automatically. The alternative was generating every
// garment in every pose - about 440 renders instead of 26.
//
// No angle in here is hard-coded to the source art. rig.json records where each
// joint sits in the original image, and each bone's REST angle is derived from
// its two joints at load time. Poses below are absolute angles in degrees, and
// what actually gets drawn is (pose - rest). Re-render the rig in a different
// stance and this all still works.
//
// Angles are screen-space: 0 = pointing right, 90 = pointing down.

const D = Math.PI / 180;

// Bone angles per state. Missing bones fall back to the idle entry.
// `torso` and `head` are near-vertical (-90 = straight up).
const POSES = {
  idle: {
    torso: -90, head: -90,
    'arm-back-upper': 80, 'arm-back-fore': 86,
    'arm-front-upper': 96, 'arm-front-fore': 90,
    'leg-back-thigh': 91, 'leg-back-shin': 90,
    'leg-front-thigh': 89, 'leg-front-shin': 90,
  },
  // Four run keys, interpolated. Legs and arms are in opposition, as they are
  // on a real body: front arm forward when the back leg is forward.
  run: [
    { 'leg-front-thigh': 55, 'leg-front-shin': 78, 'leg-back-thigh': 125, 'leg-back-shin': 128,
      'arm-back-upper': 55, 'arm-back-fore': 30, 'arm-front-upper': 125, 'arm-front-fore': 150, torso: -84 },
    { 'leg-front-thigh': 84, 'leg-front-shin': 60, 'leg-back-thigh': 105, 'leg-back-shin': 130,
      'arm-back-upper': 75, 'arm-back-fore': 50, 'arm-front-upper': 105, 'arm-front-fore': 130, torso: -86 },
    { 'leg-front-thigh': 125, 'leg-front-shin': 128, 'leg-back-thigh': 55, 'leg-back-shin': 78,
      'arm-back-upper': 125, 'arm-back-fore': 150, 'arm-front-upper': 55, 'arm-front-fore': 30, torso: -84 },
    { 'leg-front-thigh': 105, 'leg-front-shin': 130, 'leg-back-thigh': 84, 'leg-back-shin': 60,
      'arm-back-upper': 105, 'arm-back-fore': 130, 'arm-front-upper': 75, 'arm-front-fore': 50, torso: -86 },
  ],
  air: {
    torso: -88, head: -88,
    'arm-back-upper': 40, 'arm-back-fore': 10, 'arm-front-upper': 45, 'arm-front-fore': 15,
    'leg-back-thigh': 110, 'leg-back-shin': 140, 'leg-front-thigh': 70, 'leg-front-shin': 95,
  },
  fall: {
    torso: -92, head: -92,
    'arm-back-upper': 60, 'arm-back-fore': 35, 'arm-front-upper': 120, 'arm-front-fore': 145,
    'leg-back-thigh': 100, 'leg-back-shin': 95, 'leg-front-thigh': 80, 'leg-front-shin': 88,
  },
  dodge: {
    torso: -60, head: -70,
    'arm-back-upper': 30, 'arm-back-fore': 0, 'arm-front-upper': 140, 'arm-front-fore': 165,
    'leg-back-thigh': 130, 'leg-back-shin': 150, 'leg-front-thigh': 60, 'leg-front-shin': 100,
  },
  attackWind: {
    torso: -100, head: -92,
    'arm-back-upper': 60, 'arm-back-fore': 30,
    'arm-front-upper': 150, 'arm-front-fore': 175,
    'leg-back-thigh': 100, 'leg-back-shin': 95, 'leg-front-thigh': 80, 'leg-front-shin': 88,
  },
  attackHit: {
    torso: -82, head: -86,
    'arm-back-upper': 110, 'arm-back-fore': 130,
    'arm-front-upper': 2, 'arm-front-fore': 0,
    'leg-back-thigh': 108, 'leg-back-shin': 100, 'leg-front-thigh': 72, 'leg-front-shin': 86,
  },
  kick: {
    torso: -104, head: -95,
    'arm-back-upper': 45, 'arm-back-fore': 20, 'arm-front-upper': 135, 'arm-front-fore': 160,
    'leg-back-thigh': 95, 'leg-back-shin': 92,
    'leg-front-thigh': 8, 'leg-front-shin': 0,
  },
  carry: {
    torso: -93, head: -90,
    'arm-back-upper': 40, 'arm-back-fore': -10, 'arm-front-upper': 35, 'arm-front-fore': -12,
    'leg-back-thigh': 93, 'leg-back-shin': 90, 'leg-front-thigh': 87, 'leg-front-shin': 90,
  },
  hurt: {
    torso: -110, head: -120,
    'arm-back-upper': 25, 'arm-back-fore': -15, 'arm-front-upper': 155, 'arm-front-fore': 190,
    'leg-back-thigh': 100, 'leg-back-shin': 105, 'leg-front-thigh': 70, 'leg-front-shin': 70,
  },
};

// Back to front. Anything later covers what came before.
//
// The front UPPER arm goes BEHIND the torso deliberately. Its cut face at the
// shoulder is a straight edge; rotate the arm down to hang at the side and that
// edge turns horizontal and reads as a seam across the shoulder. Behind the
// torso it is covered, and since the shoulder sits on the torso's outer edge the
// rest of the arm still shows. The forearm stays in front so a punch reads.
const ORDER = [
  'arm-back-upper', 'arm-back-fore',
  'leg-back-thigh', 'leg-back-shin',
  'leg-front-thigh', 'leg-front-shin',
  'arm-front-upper',
  'torso', 'head',
  'arm-front-fore',
];

// Parent joint for each bone, so a forearm follows its upper arm.
const PARENT = {
  'arm-front-fore': 'arm-front-upper',
  'arm-back-fore': 'arm-back-upper',
  'leg-front-shin': 'leg-front-thigh',
  'leg-back-shin': 'leg-back-thigh',
};

export const RIG = {
  ready: false,
  meta: null,
  img: {},
  rest: {},
  tinted: null,

  async load(dir = 'assets/rig/rig-a/') {
    try {
      const r = await fetch(dir + 'rig.json');
      if (!r.ok) return false;
      this.meta = await r.json();
    } catch (e) { return false; }

    await Promise.all(Object.keys(this.meta.parts).map(name => new Promise(res => {
      const im = new Image();
      im.onload = () => { this.img[name] = im; res(); };
      im.onerror = res;
      im.src = dir + name + '.png';
    })));

    // Derive each bone's rest angle from the joints it spans. Nothing about the
    // source pose is assumed.
    const J = this.meta.joints;
    for (const [bone, [a, b]] of Object.entries(this.meta.bones)) {
      if (!b || !J[a] || !J[b]) { this.rest[bone] = -90; continue; }
      this.rest[bone] = Math.atan2(J[b][1] - J[a][1], J[b][0] - J[a][0]) / D;
    }
    this.rest.head = -90;

    this.ready = Object.keys(this.img).length >= 8;
    return this.ready;
  },

  poseFor(p, t) {
    if (p.atk) {
      if (p.atk.kind === 'light' && p.atk.step === 2) return POSES.kick;
      return p.atk.phase === 'startup' ? POSES.attackWind : POSES.attackHit;
    }
    if (p.hurtT > 0) return POSES.hurt;
    if (p.dodgeT > 0) return POSES.dodge;
    if (!p.grounded) return p.vy < 0 ? POSES.air : POSES.fall;
    if (p.carrying) return POSES.carry;
    if (Math.abs(p.vx) > 30) {
      // blend between the four run keys so the cycle is smooth rather than
      // four discrete snapshots
      const f = (t * 9) % 4;
      const i = Math.floor(f), k = f - i;
      const a = POSES.run[i], b = POSES.run[(i + 1) % 4];
      const out = {};
      for (const key in a) out[key] = a[key] + (b[key] - a[key]) * k;
      return { ...POSES.idle, ...out };
    }
    return POSES.idle;
  },

  // Draw the skeleton with the hips positioned so the feet land on groundY.
  draw(ctx, pose, x, groundY, height, flip, alpha = 1, bob = 0) {
    if (!this.ready) return false;
    const m = this.meta;
    const s = height / m.standingH;
    const src = this.tinted || this.img;

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(x, groundY);
    if (flip) ctx.scale(-1, 1);
    ctx.scale(s, s);

    // joint positions in rig-source pixels, relative to the hip
    const J = m.joints;
    const hipX = J.hip[0], hipY = J.hip[1];
    const local = j => [J[j][0] - hipX, J[j][1] - hipY];
    // where the hip sits above the ground in the source pose
    const hipUp = m.groundY - hipY;

    ctx.translate(0, -hipUp + bob);

    const angleOf = bone => (pose[bone] !== undefined ? pose[bone] : POSES.idle[bone] ?? this.rest[bone]);

    for (const bone of ORDER) {
      const im = src[bone];
      const info = m.parts[bone];
      if (!im || !info) continue;

      const [ja] = m.bones[bone];
      let ox, oy;
      const parent = PARENT[bone];
      if (parent) {
        // hang off the parent's tip so a bent elbow stays attached
        const [pa, pb] = m.bones[parent];
        const [pax, pay] = local(pa);
        const len = Math.hypot(J[pb][0] - J[pa][0], J[pb][1] - J[pa][1]);
        const pang = angleOf(parent) * D;
        ox = pax + Math.cos(pang) * len;
        oy = pay + Math.sin(pang) * len;
      } else {
        [ox, oy] = local(ja);
      }

      ctx.save();
      ctx.translate(ox, oy);
      ctx.rotate((angleOf(bone) - this.rest[bone]) * D);
      ctx.drawImage(im, -info.px, -info.py);
      ctx.restore();
    }
    ctx.restore();
    return true;
  },
};

export { POSES as RIG_POSES };
