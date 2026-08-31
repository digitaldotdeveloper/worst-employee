// ART SEAM.
// Right now every actor and prop is drawn as greybox shapes. When Gemini Studio
// sprites arrive, register them here and `draw()` switches over automatically —
// no gameplay code changes. That is the whole point of this file.
//
//   ART.load({ 'player.idle': 'assets/player/idle.png', ... })
//
// Sheets are expected as horizontal strips of equal frames; see assets/manifest.json
// for the full list of slots the game will eventually ask for.

import { COL, SLAP } from './config.js';

export const ART = {
  sprites: {},          // key -> { img, frames, fw, fh, fps, anchorY }
  loaded: 0, wanted: 0,

  load(map) {
    for (const [key, def] of Object.entries(map)) {
      const d = typeof def === 'string' ? { src: def } : def;
      const img = new Image();
      this.wanted++;
      img.onload = () => {
        const frames = d.frames || 1;
        this.sprites[key] = {
          img, frames,
          fw: img.width / frames, fh: img.height,
          fps: d.fps || 12,
          anchorY: d.anchorY ?? 1,
        };
        this.loaded++;
      };
      img.onerror = () => { this.wanted--; };   // missing art just falls back
      img.src = d.src;
    }
  },

  has(key) { return !!this.sprites[key]; },

  // Draw a registered sprite centred on (x, baseY) with `baseY` at the feet.
  drawSprite(ctx, key, x, baseY, t, flip, scale = 1) {
    const s = this.sprites[key];
    if (!s) return false;
    const f = Math.floor(t * s.fps) % s.frames;
    const w = s.fw * scale, h = s.fh * scale;
    ctx.save();
    ctx.translate(x, baseY);
    if (flip) ctx.scale(-1, 1);
    ctx.drawImage(s.img, f * s.fw, 0, s.fw, s.fh, -w / 2, -h * s.anchorY, w, h);
    ctx.restore();
    return true;
  },
};

// ---------------------------------------------------------------
// Greybox drawing. Silhouette-first: readable shapes, clear facing,
// visible squash on impact. Ugly on purpose so we judge FEEL, not looks.
// ---------------------------------------------------------------

function roundRect(ctx, x, y, w, h, r) {
  r = Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export function drawHuman(ctx, b, opt = {}) {
  const {
    body = COL.npc, dark = '#000', t = 0, flip = false,
    state = 'idle', squash = 1, alpha = 1, face = null,
  } = opt;

  const w = b.w, h = b.h * squash;
  const x = b.cx, y = b.y + b.h;          // feet
  const dir = flip ? -1 : 1;

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(x, y);
  if (b.angle) ctx.rotate(b.angle);

  // shadow
  ctx.fillStyle = 'rgba(0,0,0,.35)';
  ctx.beginPath();
  ctx.ellipse(0, 2, w * 0.55, 5, 0, 0, Math.PI * 2);
  ctx.fill();

  const bob = (state === 'run') ? Math.sin(t * 17) * 2.2 : (state === 'idle' ? Math.sin(t * 3) * 1.1 : 0);
  const legSwing = (state === 'run') ? Math.sin(t * 17) * 9 : 0;

  // legs
  ctx.strokeStyle = dark; ctx.lineWidth = 6; ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(-3, -h * 0.42); ctx.lineTo(-3 + legSwing, -1);
  ctx.moveTo(3, -h * 0.42);  ctx.lineTo(3 - legSwing, -1);
  ctx.stroke();

  // torso
  ctx.fillStyle = body;
  roundRect(ctx, -w / 2, -h * 0.86 + bob, w, h * 0.46, 5);
  ctx.fill();

  // head
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.arc(dir * 1.5, -h * 0.95 + bob, w * 0.30, 0, Math.PI * 2);
  ctx.fill();
  // facing tell — a nose. Cheap, but you always know which way you point.
  ctx.fillStyle = dark;
  ctx.beginPath();
  ctx.arc(dir * (w * 0.30), -h * 0.95 + bob, 2.4, 0, Math.PI * 2);
  ctx.fill();

  // arms
  ctx.strokeStyle = body; ctx.lineWidth = 5;
  ctx.beginPath();
  if (state === 'attack') {
    ctx.moveTo(0, -h * 0.72 + bob); ctx.lineTo(dir * (w * 0.95), -h * 0.66 + bob);
  } else if (state === 'carry') {
    ctx.moveTo(0, -h * 0.72 + bob); ctx.lineTo(dir * (w * 0.55), -h * 0.92 + bob);
  } else {
    const sw = (state === 'run') ? Math.sin(t * 17 + Math.PI) * 8 : 0;
    ctx.moveTo(0, -h * 0.74 + bob); ctx.lineTo(dir * 4 + sw, -h * 0.46 + bob);
  }
  ctx.stroke();

  if (face) {
    ctx.fillStyle = '#fff'; ctx.font = '700 11px system-ui'; ctx.textAlign = 'center';
    ctx.fillText(face, 0, -h - 8);
  }
  ctx.restore();
}

// Props are labelled boxes. The label is doing the work art will do later.
export function drawProp(ctx, b, t) {
  const hot = b.chaosUntil > t;
  ctx.save();
  ctx.translate(b.cx, b.cy);
  ctx.rotate(b.angle);

  ctx.fillStyle = 'rgba(0,0,0,.25)';
  roundRect(ctx, -b.w / 2 + 2, -b.h / 2 + 3, b.w, b.h, 3); ctx.fill();

  ctx.fillStyle = b.broken ? COL.broken : (hot ? COL.propHot : (b.color || COL.prop));
  roundRect(ctx, -b.w / 2, -b.h / 2, b.w, b.h, 3); ctx.fill();

  if (b.flash > 0) {
    ctx.fillStyle = `rgba(255,255,255,${Math.min(0.8, b.flash * 5)})`;
    roundRect(ctx, -b.w / 2, -b.h / 2, b.w, b.h, 3); ctx.fill();
  }

  ctx.strokeStyle = hot ? '#fff6d0' : 'rgba(0,0,0,.35)';
  ctx.lineWidth = hot ? 2 : 1;
  roundRect(ctx, -b.w / 2, -b.h / 2, b.w, b.h, 3); ctx.stroke();

  if (b.w > 26 && b.label) {
    ctx.fillStyle = hot ? '#4a3200' : 'rgba(255,255,255,.5)';
    ctx.font = '700 8px system-ui';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(b.label, 0, 0);
  }
  if (b.broken) {
    ctx.strokeStyle = 'rgba(0,0,0,.5)'; ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(-b.w / 2, -b.h / 4); ctx.lineTo(b.w / 4, b.h / 3);
    ctx.moveTo(b.w / 3, -b.h / 2); ctx.lineTo(-b.w / 6, b.h / 2);
    ctx.stroke();
  }
  ctx.restore();
}

export { roundRect };

// ---------------------------------------------------------------
// PLAYER SPRITES
// Every frame shares one crop and one scale (see tools/cutout.py), so the
// ground line and centre are constants. That is what stops the character
// sliding or bobbing as he changes animation state.
// ---------------------------------------------------------------
export const SPRITES = {
  ready: false,
  meta: null,
  img: {},
  tinted: null,
  outfit: 'base',
  missing: new Set(),

  _gen: 0,

  // Loads into a LOCAL map and swaps atomically. Assigning into this.img while
  // frames were still arriving meant an outfit change briefly left the set empty
  // — the player and the creator preview vanished while the weapon kept drawing —
  // and two overlapping loads could interleave into a mixed set.
  async load(base = 'assets/player/base/') {
    const gen = ++this._gen;
    let meta;
    try {
      const r = await fetch(base + 'anchors.json');
      if (!r.ok) return false;
      meta = await r.json();
    } catch (e) { return false; }

    const img = {};
    await Promise.all(meta.poses.map(name => new Promise(res => {
      const im = new Image();
      im.onload = () => { img[name] = im; res(); };
      im.onerror = () => { this.missing.add(name); res(); };
      im.src = base + name + '.png';
    })));
    if (gen !== this._gen) return false;          // a newer load won
    if (!Object.keys(img).length) return false;   // keep the old set rather than blank

    this.meta = meta;
    this.img = img;
    this.tinted = null;
    this.ready = true;
    return true;
  },

  has(name) { return !!this.img[name]; },

  // Swap the whole frame set for another outfit. Each outfit is a complete set
  // of drawn frames, so this is a reload rather than a part swap — the cost of
  // frames that look whole instead of assembled.
  async setOutfit(name) {
    if (this.outfit === name) return true;
    const ok = await this.load('assets/player/' + name + '/');
    if (ok) { this.outfit = name; this.tinted = null; }
    return ok;
  },

  // Draw with the feet at (x, groundY) and the body scaled to `height`.
  draw(ctx, name, x, groundY, height, flip, alpha = 1) {
    // A single missing frame should not blank the character. One generation in a
    // set can fail or come back unusable; fall back to idle rather than vanish.
    let key = name;
    let im = (this.tinted && this.tinted[name]) || this.img[name];
    if (!im) { key = 'idle'; im = (this.tinted && this.tinted.idle) || this.img.idle; }
    if (!im || !this.meta) return false;
    const m = this.meta;
    const s = height / m.standingH;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(x, groundY);
    if (flip) ctx.scale(-1, 1);
    ctx.drawImage(im, -m.centreX * s, -anchorFor(m, key) * s, m.frameW * s, m.frameH * s);
    ctx.restore();
    return true;
  },
};

// Which drawn frame each gameplay state uses.
//
// Every combo beat gets its own silhouette — jab, cross, hook, uppercut,
// spinning kick — because a five-hit string where every hit looks the same
// reads as one long twitch. Wind-up frames exist only where the beat needs
// telegraphing; the rest carry the previous beat's frame through the startup so
// the string flows instead of resetting to neutral five times.
const COMBO = [
  { wind: 'c1-wind', hit: 'c1-hit' },
  { wind: 'c2-wind', hit: 'c2-hit' },
  { wind: 'c3-wind', hit: 'c3-hit' },
  { wind: 'c4-wind', hit: 'c4-hit' },
  { wind: 'c5-wind', hit: 'c5-hit' },
];

export function poseFor(p, t) {
  // A scripted pose beats every live state except being on the floor.
  if (p.poseHold && p.downT <= 0) return p.poseHold;
  // FLOORED. `downT` runs 2.2 -> 0 and used to draw a STANDING hurt frame the
  // whole way, which is why being knocked out never read as being knocked out.
  // The last 0.7s is him pushing himself back up.
  if (p.downT > 0) return p.downT > 0.7 ? 'down' : 'getup';
  // Sat at his own desk, pretending.
  if (p.sitting) return 'sit';
  // Holding somebody has its own drawn frames now: an arm locked out on a
  // collar, and a backhand that keeps the grip. The slap is THREE beats, and
  // the boundaries come from SLAP in config.js rather than being restated
  // here — player.js fires the blow at SLAP.contact, and a pose boundary that
  // drifts away from the moment the blow lands is exactly how this action
  // ended up connecting with nothing. One number, one source.
  if (p.holdingPerson && p.carrying) {
    if (p.slapCd > SLAP.contact) return 'grab-slap';      // wind-up, arm still back
    if (p.slapCd > SLAP.recover) return 'grab-slap-hit';  // contact, on entry
    if (p.slapCd > 0) return 'grab-slap-rec';             // recovery, back to the grip
    return 'grab-hold';
  }
  // Spraying is AIMING, not carrying. The carry frame holds a box at chest
  // height with both arms, which reads nothing like working a nozzle.
  if (p.spraying) return 'spray';
  if (p.atk) {
    const wind = p.atk.phase === 'startup';
    if (!p.grounded) return 'air-hit';
    if (p.carrying) return 'swing';
    if (p.atk.kind === 'heavy') return wind ? 'heavy-wind' : 'heavy-hit';
    const c = COMBO[p.atk.step] || COMBO[0];
    return wind ? c.wind : c.hit;
  }
  if (p.hurtT > 0) return 'hurt';
  if (p.dodgeT > 0) return 'dodge';
  if (!p.grounded) {
    if (p.vy < -180) return 'jump-up';
    if (p.vy < 120) return 'jump-apex';
    return 'fall';
  }
  if (p.landT > 0) return 'land';
  if (p.fiddleT > 0) return 'land';   // a crouch: reaching for something
  if (p.carrying) return 'carry';
  const spd = Math.abs(p.vx);
  if (spd > 26 || p.walking) {
    // A STROLL IS NOT A SPRINT. Story beats move an actor by tweening `x` with
    // `vx` pinned to zero, so before this the entire opening tour played out
    // with everybody standing bolt upright in the idle frame, sliding along
    // the floor. `walking` is the scripted case; the speed band is the live one.
    if (p.walking || spd < 108) {
      return ['walk-1', 'walk-2', 'walk-3', 'walk-4'][Math.floor(t * 6.5) % 4];
    }
    // six frames instead of four: the extra stride and recovery frames are what
    // stop a run cycle looking like a shuffle
    const order = ['run-1', 'run-2', 'run-5', 'run-3', 'run-4', 'run-6'];
    const speed = Math.min(1.5, spd / 205);
    return order[Math.floor(t * 11 * speed) % order.length];
  }
  // a second idle keeps a standing character from looking frozen
  return (Math.floor(t * 0.42) % 5 === 4) ? 'idle2' : 'idle';
}

// ---------------------------------------------------------------
// RECOLOURING THE RENDERED SPRITES
// The renders are one fixed outfit, so without this the character creator
// stops meaning anything the moment real art loads. Skin and shirt are
// separable by HUE — the shirt is the only blue on the figure and skin the
// only orange — so they can be remapped safely at load time.
//
// Hair and trousers are deliberately NOT remapped: hair is near-black and so
// are every outline in the drawing, and the slacks are grey, which has no hue
// to key on. Those need generated variants, not a colour trick.
// ---------------------------------------------------------------
function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2;
  if (mx === mn) return [0, 0, l];
  const d = mx - mn;
  const s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
  let h;
  if (mx === r) h = ((g - b) / d + (g < b ? 6 : 0));
  else if (mx === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return [h * 60, s, l];
}

function hslToRgb(h, s, l) {
  h = ((h % 360) + 360) % 360 / 360;
  if (s === 0) { const v = Math.round(l * 255); return [v, v, v]; }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
  const f = tt => {
    let x = tt; if (x < 0) x += 1; if (x > 1) x -= 1;
    if (x < 1 / 6) return p + (q - p) * 6 * x;
    if (x < 1 / 2) return q;
    if (x < 2 / 3) return p + (q - p) * (2 / 3 - x) * 6;
    return p;
  };
  return [Math.round(f(h + 1 / 3) * 255), Math.round(f(h) * 255), Math.round(f(h - 1 / 3) * 255)];
}

const hexHsl = hex => {
  const n = parseInt(hex.slice(1), 16);
  return rgbToHsl((n >> 16) & 255, (n >> 8) & 255, n & 255);
};

// Source ranges measured off the master render.
const SHIRT_HUE = [185, 235];   // the light-blue tee
const SKIN_HUE = [8, 48];       // forearms, neck, face

export function recolourSprites(look, skinHex, shirtHex) {
  if (!SPRITES.ready) return;
  // Re-tinting 28 full-size frames on every swatch click is why the creator felt
  // sticky. Nothing changed, nothing to do.
  const tk = SPRITES.outfit + '|' + skinHex + '|' + shirtHex;
  if (SPRITES._tintKey === tk && SPRITES.tinted) return;
  SPRITES._tintKey = tk;
  const [sh] = hexHsl(shirtHex);
  const shs = hexHsl(shirtHex)[1];
  const [kh, ks] = hexHsl(skinHex);
  const kl = hexHsl(skinHex)[2];

  SPRITES.tinted = {};
  for (const [name, im] of Object.entries(SPRITES.img)) {
    const c = document.createElement('canvas');
    c.width = im.width; c.height = im.height;
    const x = c.getContext('2d', { willReadFrequently: true });
    x.drawImage(im, 0, 0);
    const d = x.getImageData(0, 0, c.width, c.height);
    const a = d.data;
    for (let i = 0; i < a.length; i += 4) {
      if (a[i + 3] < 8) continue;
      const [h, s, l] = rgbToHsl(a[i], a[i + 1], a[i + 2]);
      let out = null;
      if (s > 0.10 && l > 0.32 && h >= SHIRT_HUE[0] && h <= SHIRT_HUE[1]) {
        out = hslToRgb(sh, Math.max(0.10, shs * 0.9), l);      // keep the shading
      } else if (s > 0.16 && l > 0.18 && l < 0.86 && h >= SKIN_HUE[0] && h <= SKIN_HUE[1]) {
        out = hslToRgb(kh, ks, Math.min(0.95, l * (kl / 0.62)));
      }
      if (out) { a[i] = out[0]; a[i + 1] = out[1]; a[i + 2] = out[2]; }
    }
    x.putImageData(d, 0, 0);
    SPRITES.tinted[name] = c;
  }
}

// ---------------------------------------------------------------
// PROP + BACKGROUND ART
// Props keep their greybox collider and gain a sprite drawn slightly larger
// than it — art that exactly matches its collision box reads as a box.
// ---------------------------------------------------------------
export const WORLD = {
  ready: false,
  props: {},
  meta: null,
  bg: {},

  async load(base = 'assets/') {
    try {
      const r = await fetch(base + 'props/props.json');
      if (r.ok) {
        this.meta = (await r.json()).props || {};
        await Promise.all(Object.keys(this.meta).map(name => new Promise(res => {
          const im = new Image();
          im.onload = () => { this.props[name] = im; res(); };
          im.onerror = res;
          im.src = base + 'props/' + name + '.png';
        })));
      }
    } catch (e) { /* greybox */ }

    await Promise.all(['bg-wall', 'bg-ceiling', 'bg-floor'].map(n => new Promise(res => {
      const im = new Image();
      im.onload = () => { this.bg[n] = im; res(); };
      im.onerror = res;
      im.src = base + 'bg/' + n + '.jpg';
    })));

    this.ready = Object.keys(this.props).length > 0;
    return this.ready;
  },

  drawProp(ctx, b, t) {
    const key = b.broken ? (b.kind + '-broken') : b.kind;
    const im = this.props[key] || this.props[b.kind];
    if (!im) return false;
    const m = this.meta[key] || this.meta[b.kind];
    const ss = (m && m.ss) || 2;
    const w = im.width / ss, h = im.height / ss;

    ctx.save();
    ctx.translate(b.cx, b.cy);
    ctx.rotate(b.angle);

    const hot = b.chaosUntil > t;
    if (hot) {                       // chaotic things glow, same as greybox did
      ctx.shadowColor = '#ffd75e';
      ctx.shadowBlur = 14;
    }
    ctx.drawImage(im, -w / 2, -h / 2, w, h);
    ctx.shadowBlur = 0;

    if (b.flash > 0) {               // white impact flash, masked to the sprite
      ctx.globalCompositeOperation = 'source-atop';
      ctx.fillStyle = `rgba(255,255,255,${Math.min(0.85, b.flash * 5)})`;
      ctx.fillRect(-w / 2, -h / 2, w, h);
      ctx.globalCompositeOperation = 'source-over';
    }
    ctx.restore();
    return true;
  },
};

// ---------------------------------------------------------------
// CAST SPRITES
// The player stopped looking assembled the moment he became whole drawn frames;
// the coworkers and boss did not, because they were still the cut-up skeleton.
// Same fix, fewer frames each — a coworker never throws a five-hit combo.
// ---------------------------------------------------------------
// Poses where the body is ON the floor rather than standing on its feet. These
// anchor to the frame's own lowest pixel instead of the shared standing ground
// line — the ground line comes from the idle pose, so a body lying flat hovers
// above it by however much the generator shifted it up the canvas (measured at
// 23.5px for the coworkers, which is very visible).
const PRONE = new Set(['down']);

function anchorFor(meta, pose) {
  if (PRONE.has(pose) && meta.poseBottom && meta.poseBottom[pose] != null) {
    return meta.poseBottom[pose];
  }
  return meta.groundY;
}

export const CAST = {
  sets: {},

  async load(names, base = 'assets/cast/') {
    await Promise.all(names.map(async name => {
      let meta;
      try {
        const r = await fetch(base + name + '/anchors.json');
        if (!r.ok) return;
        meta = await r.json();
      } catch (e) { return; }
      const img = {};
      await Promise.all(meta.poses.map(pose => new Promise(res => {
        const im = new Image();
        im.onload = () => { img[pose] = im; res(); };
        im.onerror = res;
        im.src = base + name + '/' + pose + '.png';
      })));
      if (Object.keys(img).length) this.sets[name] = { meta, img };
    }));
    return Object.keys(this.sets).length;
  },

  has(name) { return !!this.sets[name]; },

  // Whether a character actually HAS a given frame. `draw` silently falls back
  // to idle for a missing pose, which is right for rendering and wrong for
  // picking an animation: a four-frame cycle where three frames fall back looks
  // far worse than the three-frame cycle that character does have.
  hasPose(name, pose) { const s = this.sets[name]; return !!(s && s.img[pose]); },

  draw(ctx, name, pose, x, groundY, height, flip, alpha = 1) {
    const s = this.sets[name];
    if (!s) return false;
    const key = s.img[pose] ? pose : 'idle';
    const im = s.img[key];
    if (!im) return false;
    const m = s.meta;
    const k = height / m.standingH;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(x, groundY);
    if (flip) ctx.scale(-1, 1);
    ctx.drawImage(im, -m.centreX * k, -anchorFor(m, key) * k, m.frameW * k, m.frameH * k);
    ctx.restore();
    return true;
  },
};

export function npcPoseName(c, t) {
  if (c.poseHold && c.mode !== 'down') return c.poseHold;
  if (c.held && c.hoisted) return 'held';
  // Getting up is its own shape. Without it people teleport from flat on the
  // floor to standing between two frames.
  if (c.mode === 'down') return c.downT < 0.55 ? 'getup' : 'down';
  if (c.sprayHold > 0) return 'sprayed';
  // A punch with a wind-up. `swingT` runs 0.42 -> 0 and the blow lands at 0.16,
  // so the first 0.26s is pure telegraph — which is what makes dodging a skill
  // rather than a coin flip.
  if (c.swingT > 0.16) return 'wind';
  if (c.swingT > 0) return 'swing';
  if (c.hurtT > 0) return 'hurt';
  if (c.mode === 'fight') return ['run-1','run-2','run-3','run-4'][Math.floor(t*9)%4];
  if (c.talkT > 0 && c.mode !== 'panic') return 'talk';
  if (c.pointT > 0) return 'point';
  // Scripted walks pin `vx` to zero and tween `x`, so without this the boss
  // delivers his entire tour standing bolt upright and sliding along the floor.
  if (c.walking) {
    return CAST.hasPose(c.art, 'walk-1')
      ? ['walk-1', 'walk-2', 'walk-3', 'walk-4'][Math.floor(t * 6.5) % 4]
      : ['run-1', 'run-2', 'run-3', 'run-4'][Math.floor(t * 5) % 4];
  }
  if (c.mode === 'panic') {
    return ['run-1', 'run-2', 'run-3', 'run-4'][Math.floor(t * 10) % 4];
  }
  if (c.mode === 'work') return c.seated ? 'sit' : 'work';
  if (Math.abs(c.vx) > 22) return ['run-1', 'run-2', 'run-3', 'run-4'][Math.floor(t * 5) % 4];
  return (Math.floor(t * 0.4) % 3 === 2) ? 'idle2' : 'idle';
}

export function bossPoseName(b, t) {
  if (b.defeated) return 'down';
  if (b.hurtT > 0) return 'hurt';
  // He works sitting down. `sit` exists only on boss-calm — bossArtFor forces
  // boss-rage the moment he is fighting or defeated, and a seated brawler would
  // be nonsense anyway, so this can never ask boss-rage for a frame it lacks.
  if (b.seated && !b.fighting) return 'sit';
  if (b.fighting && b.swingT > 0) return b.swingT > 0.20 ? 'c1-wind' : 'c1-hit';
  if (Math.abs(b.vx) > 22) return ['run-1', 'run-2', 'run-3', 'run-4'][Math.floor(t * (b.fighting ? 8 : 4)) % 4];
  return (Math.floor(t * 0.4) % 3 === 2) ? 'idle2' : 'idle';
}

// ---------------------------------------------------------------
// THE EQUIPPED WEAPON, drawn in hand.
// Sprites are authored handle-left / business-end-right and rotated about the
// grip, so one image covers every pose. The hand position per pose is a small
// table rather than derived from the art: the drawn frames are whole figures,
// there is no hand joint to read, and eight hand-tuned offsets beat a wrong
// guess in every frame.
// ---------------------------------------------------------------
export const WEAPON_ART = {
  meta: null,
  img: {},

  async load(base = 'assets/weapons/') {
    try {
      const r = await fetch(base + 'weapons.json');
      if (!r.ok) return 0;
      this.meta = (await r.json()).weapons || {};
    } catch (e) { return 0; }
    await Promise.all(Object.keys(this.meta).map(n => new Promise(res => {
      const im = new Image();
      im.onload = () => { this.img[n] = im; res(); };
      im.onerror = res;
      im.src = base + n + '.png';
    })));
    return Object.keys(this.img).length;
  },
};

// Hand position per drawn pose: x from the body centre, y from the feet (negative
// is up), then the angle the weapon points. The POSITIONS are measured off the
// art itself — tools found the most-extended skin pixel in each frame — because
// hand-guessed offsets put a hammer at chest height while the idle frame has its
// arms at the hips. The ANGLES have to be authored: a hand position says where
// the grip is, never which way the weapon points.
const HAND = {
  'air-hit': [27.0, -37.2, 0.5],
  'c1-hit': [24.0, -44.7, -0.1],
  'c1-wind': [25.5, -44.7, -1.25],
  'c2-hit': [27.5, -42.2, 0.02],
  'c3-hit': [24.5, -45.7, 0.62],
  'c4-hit': [13.5, -46.2, -1.3],
  'c5-hit': [15.0, -42.2, 0.75],
  'c5-wind': [10.5, -40.2, -1.05],
  'carry': [18.5, -44.7, -0.35],
  'dodge': [30, -27.2, 0.85],
  'fall': [17.0, -29.7, 0.95],
  'heavy-hit': [27.5, -41.2, 0.18],
  'heavy-wind': [24.5, -41.7, -1.55],
  'hurt': [17.5, -11.2, -0.85],
  'idle': [8.5, -26.2, 1.15],
  'idle2': [10.5, -43.2, 0.95],
  'jump-apex': [9.0, -25.7, 1.0],
  'jump-up': [10.5, -50, -0.55],
  'land': [15.5, -6, 1.35],
  'run-1': [19.5, -39.2, 0.55],
  'run-2': [13.5, -27.7, 0.95],
  'run-3': [19.5, -40.7, 0.5],
  'run-4': [14.0, -42.7, 0.9],
  'run-5': [20.5, -39.2, 0.35],
  'run-6': [15.0, -33.2, 0.8],
  'swing': [18.0, -44.2, 0.25],
  'taunt': [21.5, -31.7, -0.45],
  'throw': [26.0, -39.7, 0.28],
  // Thirteen poses had NO row here and silently fell back to `idle`, whose hand
  // is down at the hip — including the whole walk cycle and both grab frames,
  // which are most of the time you spend actually carrying something. That is
  // why a picked-up chair floated behind your head while your arms reached
  // forward holding nothing. Positions from tools/fix-hands.py, which measures
  // the same way the rows above were measured (most-extended skin pixel that is
  // not the head) and reproduces them to within a couple of px. Angles are
  // authored, because a hand position never says which way the object points.
  'walk-1': [11.0, -29.7, 0.95],
  'walk-2': [0.0, -29.0, 1.05],
  'walk-3': [11.0, -29.8, 0.95],
  'walk-4': [8.0, -27.5, 1.0],
  'grab-hold': [24.0, -44.7, -0.35],
  // The three slap beats DELIBERATELY share one row. The held colleague is
  // pinned to handAt(poseFor(...)) every frame, so any difference between the
  // beats becomes a twitch on a 0.26s action. Measured, the grip fist really
  // does barely move — x 22.5/22.0/22.5, y -45.5/-44.5/-45.5 — so separate
  // rows would buy nothing and risk a jump. HAND is authored, not derived:
  // an identical row makes the anchor provably identical.
  //
  // fix-hands.py --missing prints [21.5, -51.7] for grab-slap-hit. Do not use
  // it. In that frame the head, the grip arm and the slapping arm survive
  // erosion as ONE blob, so the y it reports is the centre of a blob running
  // from the hair to the fist, not the fist. It would lift the victim 6.5px
  // for 0.09s and drop him back.
  'grab-slap': [22.0, -45.2, -0.2],
  'grab-slap-hit': [22.0, -45.2, -0.2],
  'grab-slap-rec': [22.0, -45.2, -0.2],
  'c2-wind': [14.5, -45.2, -1.25],
  'c3-wind': [26.5, -44.8, -1.2],
  'c4-wind': [14.0, -27.1, -1.3],
  'getup': [23.5, -12.1, 1.0],
  'sit': [12.0, -31.7, 1.0],
  'spray': [17.5, -41.0, 1.35],
  'down': [17.5, -11.2, -0.85],
};

// Where a carried thing actually sits, in world space, for the pose being drawn.
// The weapon renderer has always used this table; a GRABBED prop did not, and
// was placed by one fixed offset from config instead — so it sat in the same
// spot whether the player was idle, walking, or holding someone over his head.
export function handAt(pose, x, groundY, height, flip) {
  const h = HAND[pose] || HAND.idle;
  const s = height / 62;              // same scale drawWeapon derives
  const d = flip ? -1 : 1;
  return { x: x + d * h[0] * s, y: groundY + h[1] * s, angle: d * h[2] };
}

export function drawWeapon(ctx, artName, pose, x, groundY, height, flip) {
  const im = WEAPON_ART.img[artName];
  const m = WEAPON_ART.meta && WEAPON_ART.meta[artName];
  if (!im || !m) return false;
  const h = HAND[pose] || HAND.idle;
  const k = height / 124;                 // same standing height the frames use
  const ss = m.ss || 2;

  ctx.save();
  ctx.translate(x, groundY);
  if (flip) ctx.scale(-1, 1);
  ctx.translate(h[0] * k * (124 / 62), h[1] * k * (124 / 62));
  ctx.rotate(h[2]);
  ctx.drawImage(im, -m.gripX / ss * k * 2, -m.gripY / ss * k * 2,
                im.width / ss * k * 2, im.height / ss * k * 2);
  ctx.restore();
  return true;
}

// ---------------------------------------------------------------
// REACTION FACES. A circular bust that pops beside whoever it just happened to.
// Character-specific rather than generic emoji: the joke is SAMI'S face when you
// take his monitor, not a yellow circle.
// ---------------------------------------------------------------
// HEAD SWAPS. The character's OWN head, redrawn with a different face, keyed and
// trimmed at the neck (tools/cut-faces.py) from portraits generated against each
// character's existing sprite as the reference.
//
// This is the third attempt at reaction faces and the first one that is actually
// the character. A circular portrait badge painted over the head read as a
// sticker; a bubble beside them read as UI. Swapping the head reads as the
// person, because it IS the person — same hair, same collar, same palette, just
// a different expression, scaled onto the head anchor the cutout tool measures.
export const HEADS = {
  img: {}, meta: null, ready: false,

  async load(base = 'assets/faces/heads/') {
    let m;
    try {
      const r = await fetch(base + 'heads.json');
      if (!r.ok) return 0;
      m = await r.json();
    } catch (e) { return 0; }
    this.meta = m.heads || {};
    await Promise.all(Object.keys(this.meta).map(n => new Promise(res => {
      const im = new Image();
      im.onload = () => { this.img[n] = im; res(); };
      im.onerror = res;
      im.src = base + n + '.png';
    })));
    this.ready = Object.keys(this.img).length > 0;
    return Object.keys(this.img).length;
  },

  has(art, emo) { return !!this.img[art + '-' + emo]; },

  // Swept 1.0 / 1.15 / 1.3 / 1.5 against the real sprites at real game scale
  // and looked: 1.0 is the one that stays the same person. Everything above it
  // is a bobblehead — which is what 1.5 looked like offline at 6x zoom, and is
  // why the sweep had to be done in the game rather than in a contact sheet.
  draw(ctx, art, emo, meta, pose, x, groundY, height, flip) {
    const im = this.img[art + '-' + emo];
    if (!im || !meta || !meta.heads) return false;
    const h = meta.heads[pose] || meta.heads.idle;
    if (!h) return false;
    const s = height / meta.standingH;
    const w = 2 * h[2] * 1.0 * s;
    const hh = w * (im.height / im.width);
    const hx = (h[0] - meta.centreX) * s * (flip ? -1 : 1);
    const hy = (h[1] - anchorFor(meta, pose)) * s;
    ctx.save();
    ctx.translate(x + hx, groundY + hy);
    if (flip) ctx.scale(-1, 1);
    // The cutout's own face sits about 58% down it, so line THAT up with the
    // anchor rather than the image centre, or the swap rides high on the hair.
    ctx.drawImage(im, -w / 2, -hh * 0.58, w, hh);
    ctx.restore();
    return true;
  },
};

// Where a character's HEAD actually is, in world space, for the pose being
// drawn — the same derivation HEADS.draw uses to place a swapped head. Impact
// FX has to come from here rather than a fixed offset off body centre: a slap
// aimed at the face was sparking off the chest because `v.cy - 10` is the same
// point whether they are upright, doubled over, or lying on the carpet.
// Returns the head centre and its RADIUS, so a caller can spread an effect
// across the face instead of guessing a second offset.
export function headAt(meta, pose, x, groundY, height, flip) {
  if (!meta || !meta.heads) return null;
  const h = meta.heads[pose] || meta.heads.idle;
  if (!h) return null;
  const s = height / meta.standingH;
  return {
    x: x + (h[0] - meta.centreX) * s * (flip ? -1 : 1),
    y: groundY + (h[1] - anchorFor(meta, pose)) * s,
    r: h[2] * s,
  };
}

// Resolve that straight off a cast member, deriving the art set, the pose and
// the scale EXACTLY as the renderer does — including CAST.draw's fallback to
// `idle` for a missing frame, so the head follows the frame actually on screen.
// `bossArtFor` exists because a caller once restated the renderer's expression
// and the two drifted; restating `c.h * 1.10` here would be the same mistake.
export function castHeadAt(c) {
  const set = c && c.art && CAST.sets[c.art];
  if (!set) return null;
  const pose = npcPoseName(c, c.animT);
  return headAt(set.meta, set.img[pose] ? pose : 'idle',
                c.cx, c.y + c.h, c.h * 1.10, c.face < 0);
}

export const FACES = {
  img: {}, size: 96, ready: false,

  async load(base = 'assets/faces/') {
    let meta;
    try {
      const r = await fetch(base + 'faces.json');
      if (!r.ok) return 0;
      meta = await r.json();
    } catch (e) { return 0; }
    this.size = meta.size || 96;
    await Promise.all((meta.faces || []).map(n => new Promise(res => {
      const im = new Image();
      im.onload = () => { this.img[n] = im; res(); };
      im.onerror = res;
      im.src = base + n + '.png';
    })));
    this.ready = Object.keys(this.img).length > 0;
    return Object.keys(this.img).length;
  },

  has(art, emo) { return !!this.img[art + '-' + emo]; },

  // NOTE: drawOnHead lived here and painted the expression onto the character's
  // own head. It was removed, not disabled — see reactionBubble() in main.js for
  // why. Head anchors are still produced and still checked; tools/fix-hands.py
  // locates the hand by excluding the head, so they earn their keep either way.

  // `k` is 0..1 through the pop: it scales in, holds, then fades.
  draw(ctx, art, emo, x, y, px, k) {
    const im = this.img[art + '-' + emo];
    if (!im) return false;
    const grow = k > 0.82 ? (1 - k) / 0.18 : Math.min(1, k / 0.12);
    const s = px * (0.75 + 0.25 * Math.min(1, grow * 1.4));
    ctx.save();
    ctx.globalAlpha = Math.min(1, grow * 1.6);
    ctx.translate(x, y);
    // bubble
    ctx.beginPath(); ctx.arc(0, 0, s / 2 + 2.5, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(12,14,22,.9)'; ctx.fill();
    ctx.lineWidth = 1.6; ctx.strokeStyle = 'rgba(255,255,255,.28)'; ctx.stroke();
    // tail
    ctx.beginPath();
    ctx.moveTo(-s * 0.18, s / 2 - 1); ctx.lineTo(0, s / 2 + s * 0.28); ctx.lineTo(s * 0.18, s / 2 - 1);
    ctx.closePath(); ctx.fillStyle = 'rgba(12,14,22,.9)'; ctx.fill();
    ctx.drawImage(im, -s / 2, -s / 2, s, s);
    ctx.restore();
    return true;
  },
};
