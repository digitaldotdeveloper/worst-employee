// Keyboard + touch. Both produce the same action flags so gameplay never
// asks which one is being used.

import { ATTACK } from './config.js';

export const IN = {
  axis: 0,                 // -1..1
  jump: false, jumpEdge: false,
  dodge: false, dodgeEdge: false,
  grab: false, grabEdge: false,
  light: false, heavy: false,
  touch: false,
  _hitDown: 0,
};

const keys = {};
const held = {};
const MAP = {
  a: 'left', arrowleft: 'left', d: 'right', arrowright: 'right',
  w: 'jump', arrowup: 'jump', ' ': 'jump',
  j: 'light', k: 'heavy', l: 'grab', shift: 'dodge',
};

let prev = { jump: false, dodge: false, grab: false, light: false, heavy: false };

// Rising edges are LATCHED here, not sampled in pollInput. A quick tap can go
// down and up inside a single frame, and polling the held state would miss the
// press entirely — which is exactly what a fast combo is made of.
const pending = {};

// A keystroke aimed at a text field is not a game input. Without this the
// gameplay handler preventDefault()s most letters, so the name box in the
// character creator silently refused to accept them.
const typing = e => {
  const t = e.target;
  return !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
};

export function resetInput() {
  for (const k in pending) delete pending[k];
  for (const k in keys) keys[k] = false;
  for (const k in held) held[k] = false;
}

export function initInput(canvas) {
  addEventListener('keydown', e => {
    if (typing(e)) return;
    const k = MAP[e.key.toLowerCase()];
    if (!k) return;
    if (!keys[k]) pending[k] = true;
    keys[k] = true;
    e.preventDefault();
  });
  addEventListener('keyup', e => {
    if (typing(e)) return;
    const k = MAP[e.key.toLowerCase()];
    if (k) { keys[k] = false; e.preventDefault(); }
  });
  addEventListener('blur', () => { for (const k in keys) keys[k] = false; });

  setupTouch();
}

// ---------------- touch ----------------
let stickId = null, stickOx = 0, stickAxis = 0;

function setupTouch() {
  const zone = document.getElementById('stickZone');
  const base = document.getElementById('stickBase');
  const nub = document.getElementById('stickNub');
  if (!zone) return;

  const start = e => {
    for (const t of e.changedTouches) {
      if (stickId !== null) break;
      stickId = t.identifier; stickOx = t.clientX;
      base.style.left = t.clientX + 'px';
      base.style.top = t.clientY + 'px';
      base.classList.add('on');
      IN.touch = true;
    }
    e.preventDefault();
  };
  const move = e => {
    for (const t of e.changedTouches) {
      if (t.identifier !== stickId) continue;
      const dx = Math.max(-46, Math.min(46, t.clientX - stickOx));
      nub.style.transform = `translate(calc(-50% + ${dx}px),-50%)`;
      stickAxis = Math.abs(dx) < 8 ? 0 : Math.max(-1, Math.min(1, dx / 38));
    }
    e.preventDefault();
  };
  const end = e => {
    for (const t of e.changedTouches) {
      if (t.identifier !== stickId) continue;
      stickId = null; stickAxis = 0;
      base.classList.remove('on');
      nub.style.transform = 'translate(-50%,-50%)';
    }
    e.preventDefault();
  };
  zone.addEventListener('touchstart', start, { passive: false });
  zone.addEventListener('touchmove', move, { passive: false });
  zone.addEventListener('touchend', end, { passive: false });
  zone.addEventListener('touchcancel', end, { passive: false });

  for (const btn of document.querySelectorAll('.tb')) {
    const name = btn.dataset.btn;
    const down = e => {
      if (!held[name] && name !== 'hit') pending[name] = true;
      held[name] = true; btn.classList.add('down'); IN.touch = true;
      if (name === 'hit') IN._hitDown = performance.now();
      e.preventDefault();
    };
    const up = e => {
      held[name] = false; btn.classList.remove('down');
      if (name === 'hit') {
        const t = (performance.now() - IN._hitDown) / 1000;
        IN._queued = t >= ATTACK.holdForHeavy ? 'heavy' : 'light';
        IN._hitDown = 0;
      }
      e.preventDefault();
    };
    btn.addEventListener('touchstart', down, { passive: false });
    btn.addEventListener('touchend', up, { passive: false });
    btn.addEventListener('touchcancel', up, { passive: false });
  }
}

// Call once per frame, before gameplay.
export function pollInput() {
  IN.axis = (keys.right ? 1 : 0) - (keys.left ? 1 : 0);
  if (IN.axis === 0) IN.axis = stickAxis;

  const jump = !!keys.jump || !!held.jump;
  const dodge = !!keys.dodge || !!held.dodge;
  const grab = !!keys.grab || !!held.grab;

  // Touch HIT resolves on release: tap = light, hold = heavy.
  let light = !!keys.light, heavy = !!keys.heavy;
  if (IN._queued === 'light') light = true;
  if (IN._queued === 'heavy') heavy = true;
  IN._queued = null;

  IN.jumpEdge  = !!pending.jump  || (jump  && !prev.jump);
  IN.dodgeEdge = !!pending.dodge || (dodge && !prev.dodge);
  IN.grabEdge  = !!pending.grab  || (grab  && !prev.grab);
  IN.lightEdge = !!pending.light || (light && !prev.light);
  IN.heavyEdge = !!pending.heavy || (heavy && !prev.heavy);
  for (const k in pending) delete pending[k];

  IN.jump = jump; IN.dodge = dodge; IN.grab = grab;
  IN.light = light; IN.heavy = heavy;
  prev = { jump, dodge, grab, light, heavy };
}
