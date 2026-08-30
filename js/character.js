// CHARACTER — the paper-doll rig.
//
// THE DECISION THIS FILE ENCODES:
// The player is NOT a pre-rendered character. He is a stack of layers drawn in
// order over one shared body. Pre-rendering every outfit would mean
// 4 hair x 4 skin x 6 shirts x 4 trousers x 3 shoes = 1,152 whole characters,
// each needing ~15 animations — roughly 100,000 images. Layers cost 21 pieces
// and cover every combination.
//
// SHAPE comes from art, COLOUR comes from code. We generate 6 hairstyles and
// tint them 8 ways at runtime: 48 options for the price of 6. That is how the
// creator feels rich on a $25 budget.
//
// Every layer checks ART first and falls back to greybox, so real sprites drop
// in one piece at a time without touching gameplay.

import { ART } from './art.js';

// ---------------------------------------------------------------
// THE OPTIONS WE GIVE THE PLAYER
// Add to these lists and the creator UI grows by itself.
// ---------------------------------------------------------------
export const OUTFITS = [
  { id: 'base',   name: 'THE NEW GUY', desc: 'Tee, slacks, sneakers. Blends in.' },
  { id: 'scruff', name: 'BURNT OUT',   desc: 'Shirt untucked, tie loosened. Given up.' },
  { id: 'hood',   name: 'HOODIE',      desc: 'Headphones-in energy. Not listening.' },
  { id: 'smart',  name: 'TRYING HARD', desc: 'Blazer and a tie. Wants the promotion.' },
];

export const OPTIONS = {
  outfit:     { label: 'LOOK',   kind: 'outfit',
    values: OUTFITS.map(o => o.id) },

  skin:       { label: 'SKIN',   kind: 'colour',
    values: ['#f2cba3', '#e8b98c', '#d19a6b', '#b07a4c', '#8a5a34', '#5f3d24'] },

  shirtColour:{ label: 'COLOUR', kind: 'colour',
    values: ['#7fd1ff', '#5b8dd6', '#7a6fd0', '#d06f9a', '#d0844f', '#6fb87a', '#e2e5ee', '#3c4256'] },
};

export function defaultLook() {
  return { name: 'FIRASS', outfit: 0, skin: 1, shirtColour: 0 };
}

export function randomLook(name) {
  const r = k => Math.floor(Math.random() * OPTIONS[k].values.length);
  return { name: name || 'FIRASS', outfit: r('outfit'), skin: r('skin'), shirtColour: r('shirtColour') };
}

const KEY = 'we.look.v2';   // v1 was the mix-and-match rig look
export function saveLook(look) {
  try { localStorage.setItem(KEY, JSON.stringify(look)); } catch (e) { /* private mode */ }
}
export function loadLook() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    return Object.assign(defaultLook(), JSON.parse(raw));
  } catch (e) { return null; }
}

const val = (look, key) => OPTIONS[key].values[look[key] ?? 0];

// ---------------------------------------------------------------
// DRAW
// Layer order is the whole trick: back arm, legs, shoes, torso, shirt,
// head, hair, accessory, front arm. Anything drawn later covers what came
// before, which is why a hat never needs to know what hair is under it.
// ---------------------------------------------------------------
function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  const c = i => Math.max(0, Math.min(255, ((n >> i) & 255) + amt));
  return `rgb(${c(16)},${c(8)},${c(0)})`;
}

export function drawCharacter(ctx, look, opt = {}) {
  const {
    w = 34, h = 62, t = 0, state = 'idle', flip = false, squash = 1, alpha = 1,
  } = opt;

  const skin = val(look, 'skin');
  const hairCol = val(look, 'hairColour');
  const shirtCol = val(look, 'shirtColour');
  const trouserCol = val(look, 'trouserColour');
  const hairStyle = val(look, 'hair');
  const shirtStyle = val(look, 'shirt');
  const trouserStyle = val(look, 'trousers');
  const shoeStyle = val(look, 'shoes');
  const acc = val(look, 'accessory');

  const H = h * squash;
  const dir = flip ? -1 : 1;

  ctx.save();
  ctx.globalAlpha = alpha;
  if (flip) ctx.scale(-1, 1);

  const bob = state === 'run' ? Math.sin(t * 17) * 2.2
            : state === 'idle' ? Math.sin(t * 3) * 1.1 : 0;
  const swing = state === 'run' ? Math.sin(t * 17) * 9 : 0;
  const hipY = -H * 0.44, shoulderY = -H * 0.80, headY = -H * 0.93 + bob;

  // ---- back arm (behind the torso) ----
  drawArm(ctx, -1);

  // ---- legs ----
  const legLen = Math.abs(hipY);
  const shortLeg = trouserStyle === 'shorts';
  // Stance is deliberately wide: at +/-3 the two trouser legs merge into one
  // dark slab at game size and the character loses his walk entirely.
  const stance = 5;
  ctx.strokeStyle = skin; ctx.lineWidth = 5; ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(-stance, hipY); ctx.lineTo(-stance + swing, -2);
  ctx.moveTo(stance, hipY);  ctx.lineTo(stance - swing, -2);
  ctx.stroke();

  ctx.strokeStyle = trouserCol;
  ctx.lineWidth = trouserStyle === 'cargo' ? 7.5 : 6;
  const legEnd = shortLeg ? legLen * 0.45 : legLen * 0.94;
  ctx.beginPath();
  ctx.moveTo(-stance, hipY); ctx.lineTo(-stance + swing * (legEnd / legLen), hipY + legEnd);
  ctx.moveTo(stance, hipY);  ctx.lineTo(stance - swing * (legEnd / legLen), hipY + legEnd);
  ctx.stroke();
  ctx.strokeStyle = shade(trouserCol, -28);          // seam, so the legs separate
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.moveTo(0, hipY + 1); ctx.lineTo(0, hipY + legEnd * 0.5);
  ctx.stroke();

  // ---- shoes ----
  const shoeCol = shoeStyle === 'formal' ? '#231d18'
                : shoeStyle === 'boots' ? '#4a3524'
                : shoeStyle === 'sandals' ? '#8a6a44' : '#e6e8ef';
  const shoeH = shoeStyle === 'boots' ? 8 : 5;
  ctx.fillStyle = shoeCol;
  rr(ctx, -stance - 5 + swing, -shoeH + 1, 10, shoeH, 2); ctx.fill();
  rr(ctx, stance - 5 - swing, -shoeH + 1, 10, shoeH, 2); ctx.fill();

  // ---- torso (skin base, so tanks and vests read) ----
  ctx.fillStyle = skin;
  rr(ctx, -w / 2 + 3, shoulderY + bob, w - 6, Math.abs(hipY - shoulderY) + 4, 5);
  ctx.fill();

  // ---- shirt ----
  ctx.fillStyle = shirtCol;
  const torsoTop = shoulderY + bob, torsoH = Math.abs(hipY - shoulderY) + 4;
  if (shirtStyle === 'tank') {
    rr(ctx, -w / 2 + 7, torsoTop + 3, w - 14, torsoH - 3, 3); ctx.fill();
  } else if (shirtStyle === 'vest') {
    rr(ctx, -w / 2 + 4, torsoTop + 2, w - 8, torsoH - 2, 4); ctx.fill();
    ctx.fillStyle = shade(shirtCol, -40);
    ctx.fillRect(-1.5, torsoTop + 2, 3, torsoH - 2);
  } else {
    rr(ctx, -w / 2 + 2, torsoTop, w - 4, torsoH, 4); ctx.fill();
    if (shirtStyle === 'hoodie') {                        // hood bump behind neck
      ctx.beginPath(); ctx.arc(0, torsoTop + 2, w * 0.30, Math.PI, 0); ctx.fill();
    }
    if (shirtStyle === 'buttonup') {
      ctx.strokeStyle = shade(shirtCol, -50); ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(0, torsoTop + 2); ctx.lineTo(0, torsoTop + torsoH - 2); ctx.stroke();
      ctx.fillStyle = shade(shirtCol, 45);
      rr(ctx, -w / 2 + 2, torsoTop, 7, 6, 2); ctx.fill();  // collar
      rr(ctx, w / 2 - 9, torsoTop, 7, 6, 2); ctx.fill();
    }
    if (shirtStyle === 'polo') {
      ctx.fillStyle = shade(shirtCol, 40);
      rr(ctx, -5, torsoTop, 10, 5, 2); ctx.fill();
    }
  }

  // ---- head ----
  const headR = w * 0.30;
  ctx.fillStyle = skin;
  ctx.beginPath(); ctx.arc(dir * 1.5, headY, headR, 0, Math.PI * 2); ctx.fill();
  // facing tell
  ctx.fillStyle = shade(skin, -55);
  ctx.beginPath(); ctx.arc(dir * headR, headY + 1, 2.2, 0, Math.PI * 2); ctx.fill();

  // ---- hair ----
  ctx.fillStyle = hairCol;
  const hx = dir * 1.5;
  if (hairStyle === 'buzz') {
    ctx.beginPath(); ctx.arc(hx, headY, headR + 0.6, Math.PI * 1.05, Math.PI * 2.05); ctx.fill();
  } else if (hairStyle === 'short') {
    ctx.beginPath(); ctx.arc(hx, headY - 1, headR + 1.2, Math.PI, Math.PI * 2); ctx.fill();
    ctx.fillRect(hx - headR - 1.2, headY - 2, (headR + 1.2) * 2, 3);
  } else if (hairStyle === 'curls') {
    for (let i = 0; i < 7; i++) {
      const a = Math.PI + (i / 6) * Math.PI;
      ctx.beginPath();
      ctx.arc(hx + Math.cos(a) * headR * 0.95, headY + Math.sin(a) * headR * 0.95, 3.6, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (hairStyle === 'bun') {
    ctx.beginPath(); ctx.arc(hx, headY - 1, headR + 1, Math.PI, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(hx - dir * (headR + 1), headY - headR * 0.5, 4.2, 0, Math.PI * 2); ctx.fill();
  } else if (hairStyle === 'long') {
    ctx.beginPath(); ctx.arc(hx, headY - 1, headR + 1.4, Math.PI, Math.PI * 2); ctx.fill();
    rr(ctx, hx - headR - 1.4, headY - 2, (headR + 1.4) * 2, headR * 2.1, 3); ctx.fill();
  } else {                                              // spiky
    ctx.beginPath(); ctx.arc(hx, headY - 1, headR + 0.8, Math.PI, Math.PI * 2); ctx.fill();
    for (let i = -2; i <= 2; i++) {
      ctx.beginPath();
      ctx.moveTo(hx + i * 3.4 - 2.4, headY - headR * 0.7);
      ctx.lineTo(hx + i * 3.4, headY - headR - 5.5);
      ctx.lineTo(hx + i * 3.4 + 2.4, headY - headR * 0.7);
      ctx.closePath(); ctx.fill();
    }
  }

  // ---- accessory ----
  if (acc === 'glasses') {
    ctx.strokeStyle = '#20242e'; ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.arc(hx + dir * 2.5, headY + 0.5, 3.4, 0, Math.PI * 2);
    ctx.moveTo(hx + dir * 6.2, headY + 0.5); ctx.lineTo(hx + dir * 8.5, headY);
    ctx.stroke();
  } else if (acc === 'tie') {
    ctx.fillStyle = '#b8434a';
    ctx.beginPath();
    ctx.moveTo(-2.6, torsoTop + 3); ctx.lineTo(2.6, torsoTop + 3);
    ctx.lineTo(1.6, torsoTop + torsoH * 0.72); ctx.lineTo(0, torsoTop + torsoH * 0.82);
    ctx.lineTo(-1.6, torsoTop + torsoH * 0.72);
    ctx.closePath(); ctx.fill();
  } else if (acc === 'lanyard') {
    ctx.strokeStyle = '#3f6fb5'; ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(-5, torsoTop + 2); ctx.lineTo(0, torsoTop + torsoH * 0.5);
    ctx.lineTo(5, torsoTop + 2); ctx.stroke();
    ctx.fillStyle = '#e6e8ef';
    rr(ctx, -3.4, torsoTop + torsoH * 0.5, 6.8, 8, 1.5); ctx.fill();
  } else if (acc === 'cap') {
    ctx.fillStyle = '#2f3a52';
    ctx.beginPath(); ctx.arc(hx, headY - 1, headR + 1.6, Math.PI, Math.PI * 2); ctx.fill();
    rr(ctx, hx + dir * 1, headY - 3, dir * (headR + 7), 3, 1.5); ctx.fill();
  } else if (acc === 'headphones') {
    ctx.strokeStyle = '#20242e'; ctx.lineWidth = 2.2;
    ctx.beginPath(); ctx.arc(hx, headY - 1, headR + 2.4, Math.PI * 1.1, Math.PI * 1.9); ctx.stroke();
    ctx.fillStyle = '#20242e';
    ctx.beginPath(); ctx.arc(hx - headR - 1.6, headY, 3, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(hx + headR + 1.6, headY, 3, 0, Math.PI * 2); ctx.fill();
  }

  // ---- front arm ----
  drawArm(ctx, 1);
  ctx.restore();

  function drawArm(c, side) {
    const sleeveless = shirtStyle === 'tank' || shirtStyle === 'vest';
    c.lineCap = 'round';
    c.strokeStyle = sleeveless ? skin : shirtCol;
    c.lineWidth = 5;
    c.beginPath();
    if (state === 'attack' && side === 1) {
      c.moveTo(0, shoulderY + 6 + bob); c.lineTo(dir * (w * 0.95), shoulderY + 12 + bob);
    } else if (state === 'carry' && side === 1) {
      c.moveTo(0, shoulderY + 6 + bob); c.lineTo(dir * (w * 0.55), shoulderY - 6 + bob);
    } else {
      const s = state === 'run' ? Math.sin(t * 17 + (side === 1 ? Math.PI : 0)) * 8 : 0;
      c.moveTo(0, shoulderY + 5 + bob);
      c.lineTo(dir * 4 + s, hipY - 2 + bob);
    }
    c.stroke();
    if (!sleeveless) {                                  // hand pokes out of the sleeve
      c.strokeStyle = skin; c.lineWidth = 4.4;
      const p = c;
      p.beginPath();
      if (state === 'attack' && side === 1) {
        p.moveTo(dir * (w * 0.72), shoulderY + 10 + bob);
        p.lineTo(dir * (w * 0.95), shoulderY + 12 + bob);
      } else {
        const s = state === 'run' ? Math.sin(t * 17 + (side === 1 ? Math.PI : 0)) * 8 : 0;
        p.moveTo(dir * 3 + s * 0.8, hipY - 8 + bob);
        p.lineTo(dir * 4 + s, hipY - 2 + bob);
      }
      p.stroke();
    }
  }
}

// Big centred preview for the creator screen.
export function drawPortrait(ctx, cx, baseY, scale, look, t) {
  ctx.save();
  ctx.translate(cx, baseY);
  ctx.fillStyle = 'rgba(0,0,0,.30)';
  ctx.beginPath(); ctx.ellipse(0, 2, 26 * scale * 0.55, 5 * scale * 0.5, 0, 0, Math.PI * 2); ctx.fill();
  ctx.scale(scale, scale);
  drawCharacter(ctx, look, { t, state: 'idle' });
  ctx.restore();
}

function rr(ctx, x, y, w, h, r) {
  if (w < 0) { x += w; w = -w; }
  r = Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// The colours the sprite recolourer needs, by name rather than index.
export function lookColours(look) {
  return { skin: val(look, 'skin'), shirt: val(look, 'shirtColour') };
}

export function lookOutfit(look) { return val(look, 'outfit'); }
