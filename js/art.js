// ART SEAM.
// Right now every actor and prop is drawn as greybox shapes. When Gemini Studio
// sprites arrive, register them here and `draw()` switches over automatically —
// no gameplay code changes. That is the whole point of this file.
//
//   ART.load({ 'player.idle': 'assets/player/idle.png', ... })
//
// Sheets are expected as horizontal strips of equal frames; see assets/manifest.json
// for the full list of slots the game will eventually ask for.

import { COL } from './config.js';

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

  async load(base = 'assets/player/base/') {
    try {
      const r = await fetch(base + 'anchors.json');
      if (!r.ok) return false;
      this.meta = await r.json();
    } catch (e) { return false; }

    this.img = {};
    const jobs = this.meta.poses.map(name => new Promise(res => {
      const im = new Image();
      im.onload = () => { this.img[name] = im; res(); };
      im.onerror = () => { this.missing.add(name); res(); };
      im.src = base + name + '.png';
    }));
    await Promise.all(jobs);
    this.ready = Object.keys(this.img).length > 0;
    return this.ready;
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
    const im = (this.tinted && this.tinted[name]) || this.img[name];
    if (!im || !this.meta) return false;
    const m = this.meta;
    const s = height / m.standingH;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(x, groundY);
    if (flip) ctx.scale(-1, 1);
    ctx.drawImage(im, -m.centreX * s, -m.groundY * s, m.frameW * s, m.frameH * s);
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
  { wind: 'c1-hit',  hit: 'c2-hit' },
  { wind: 'c2-hit',  hit: 'c3-hit' },
  { wind: 'c3-hit',  hit: 'c4-hit' },
  { wind: 'c5-wind', hit: 'c5-hit' },
];

export function poseFor(p, t) {
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
  if (p.carrying) return 'carry';
  if (Math.abs(p.vx) > 26) {
    // six frames instead of four: the extra stride and recovery frames are what
    // stop a run cycle looking like a shuffle
    const order = ['run-1', 'run-2', 'run-5', 'run-3', 'run-4', 'run-6'];
    const speed = Math.min(1.5, Math.abs(p.vx) / 205);
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
