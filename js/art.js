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
