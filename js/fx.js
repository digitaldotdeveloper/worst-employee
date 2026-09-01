// Juice: hit-stop, screen shake, impact sparks, floating numbers, paper.
// Script section 14 says the player must feel every hit. This file is that.

const parts = [];
const floats = [];

export const FX = {
  shake: 0,
  hitstop: 0,
  flash: 0,

  kick(shake = 4, stop = 0) {
    this.shake = Math.max(this.shake, shake);
    this.hitstop = Math.max(this.hitstop, stop);
  },

  spark(x, y, n = 8, col = '#fff', spread = 260) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = spread * (0.35 + Math.random() * 0.9);
      parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 60,
        life: 0.24 + Math.random() * 0.26, max: 0.5, col, r: 1.6 + Math.random() * 2.4, g: 900 });
    }
  },

  debris(x, y, n = 10, col = '#4a5066') {
    for (let i = 0; i < n; i++) {
      const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.4;
      const s = 120 + Math.random() * 320;
      parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s,
        life: 0.6 + Math.random() * 0.5, max: 1.1, col, r: 2 + Math.random() * 3, g: 1500, box: true,
        // step() already spins anything with a `rot`, but debris never set one,
        // so every chip drew as an axis-aligned fillRect - a smashed monitor
        // threw off a handful of tidy little SQUARES. One starting angle each
        // and they tumble like debris instead.
        rot: Math.random() * Math.PI });
    }
  },

  paper(x, y, n = 12) {
    for (let i = 0; i < n; i++) {
      const a = -Math.PI / 2 + (Math.random() - 0.5) * 3;
      const s = 90 + Math.random() * 260;
      parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s,
        life: 1.4 + Math.random(), max: 2.4, col: '#e6e8ef', r: 4 + Math.random() * 3,
        g: 260, box: true, flutter: true, rot: Math.random() * 6 });
    }
  },

  float(x, y, text, col = '#ffd75e', size = 14) {
    floats.push({ x, y, text, col, size, life: 0.95, max: 0.95, vy: -46 });
  },

  step(dt) {
    if (this.hitstop > 0) this.hitstop -= dt;
    this.shake *= Math.pow(0.0016, dt);
    if (this.shake < 0.1) this.shake = 0;
    if (this.flash > 0) this.flash -= dt * 3.4;

    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i];
      p.life -= dt;
      if (p.life <= 0) { parts.splice(i, 1); continue; }
      p.vy += (p.g || 900) * dt;
      if (p.flutter) p.vx += Math.sin(p.life * 9) * 34 * dt;
      p.x += p.vx * dt; p.y += p.vy * dt;
      if (p.rot !== undefined) p.rot += dt * 6;
    }
    for (let i = floats.length - 1; i >= 0; i--) {
      const f = floats[i];
      f.life -= dt;
      if (f.life <= 0) { floats.splice(i, 1); continue; }
      f.y += f.vy * dt; f.vy *= 0.94;
    }
  },

  // `ts` is 1/zoom: floating numbers are positioned in world space but should
  // read at a constant size on screen, not balloon as the camera zooms in.
  draw(ctx, ts = 1) {
    for (const p of parts) {
      const a = Math.max(0, p.life / p.max);
      ctx.globalAlpha = a;
      ctx.fillStyle = p.col;
      if (p.box) {
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot || 0);
        ctx.fillRect(-p.r, -p.r * 0.7, p.r * 2, p.r * 1.4); ctx.restore();
      } else {
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r * a, 0, Math.PI * 2); ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
    ctx.textAlign = 'center';
    for (const f of floats) {
      const a = Math.min(1, f.life / f.max * 1.6);
      ctx.globalAlpha = a;
      ctx.font = `900 ${Math.max(7, f.size * ts)}px system-ui`;
      ctx.lineWidth = 3 * ts; ctx.strokeStyle = 'rgba(0,0,0,.65)';
      ctx.strokeText(f.text, f.x, f.y);
      ctx.fillStyle = f.col;
      ctx.fillText(f.text, f.x, f.y);
    }
    ctx.globalAlpha = 1;
  },

  clear() { parts.length = 0; floats.length = 0; this.shake = 0; this.hitstop = 0; },
};
