// MUSIC — the generated soundtrack, and the director that decides what plays.
//
// `audio.js` still synthesises every sound effect, and it still contains a
// complete synthesised score. This module sits on top of that with the MP3s
// made in Gemini Studio: a theme, a bed for each room, and three escalating
// chaos loops. The synth score stays as the fallback — if the files fail to
// load, or the browser refuses them, `Music.failed` goes true and the caller
// starts the synth instead, so the game is never silent.
//
// Two rules that shape everything here:
//
//   1. Nothing loads until it is needed. Eighteen tracks is 12.7 MB, which is
//      five times the rest of the build, so `preload` is 'none' and a track is
//      only fetched the first time the director asks for it. A quiet shift in
//      two rooms costs three files, not eighteen.
//   2. Nothing plays until a real user gesture. Same rule as audio.js — a
//      browser will not start an audio context before one, and the failure is
//      silent.
//
// Crossfades run on two decks. One plays, the other is loaded and faded up
// underneath, and they swap. That is what makes walking between rooms feel like
// one score rather than a playlist.

import { SFX } from './audio.js';

const DIR = 'assets/audio/';

// Which bed belongs to which room id in config.js (ops floor and exec floor).
// Open plan gets 'calm' — it is the default working area, so the soundtrack's
// own office-calm loop belongs there rather than a room-specific bed.
const ROOM_BED = {
  reception: 'room_reception',
  openplan: 'calm',
  break: 'room_break',
  meeting: 'room_meeting',
  admin: 'room_machines',
  lift: 'room_lift',
  boardroom: 'room_boardroom',
  pa: 'room_boardroom',
  boss: 'room_boss',
};

// Higher wins immediately; equal or lower has to wait out the hold below, so a
// chain that expires for half a second cannot yank the music back down.
const PRIORITY = {
  fired: 90, promote: 90,
  bosschase: 70,
  chaos3: 60, chaos2: 50, chaos1: 40,
  shop: 30, menu: 30, theme: 30,
  calm: 10, room_reception: 10, room_break: 10, room_meeting: 10,
  room_machines: 10, room_lift: 10, room_boardroom: 10, room_boss: 10,
};

// IMPACT CUES. These are the same ~30s generated tracks as everything else, but
// each one OPENS on its hit and then keeps playing, so only the front is usable
// and `secs` is how much of it we keep.
//
// Only five made it in, and only the big infrequent moments. The per-material
// smashes from the same pack are deliberately absent: glass/metal/paper/plastic
// fire constantly during a chain, `SFX.smash()` already does them for nothing,
// and a 700 KB download per impact for half a second of audio is a bad trade.
// These five are rare enough that a musical flourish reads as punctuation.
const CUES = {
  combo_finish:  { secs: 2.4, gain: 0.95, cool: 0.9 },
  ground_slam:   { secs: 2.2, gain: 1.00, cool: 0.9 },
  dinner_bell:   { secs: 1.8, gain: 0.85, cool: 1.4 },
  full_throttle: { secs: 3.0, gain: 0.90, cool: 2.0 },
  total_wipeout: { secs: 3.2, gain: 1.00, cool: 6.0, duck: 0.45 },
};

// Which cue a weapon wants loaded before it is swung.
const WEAPON_CUE = { hammer: 'ground_slam', pan: 'dinner_bell', rocketchair: 'full_throttle' };

const HOLD = 5.0;      // seconds a track is kept before any sideways switch
const SETTLE = 2.5;    // how long a calmer choice must persist before it wins

export const Music = {
  enabled: true,
  failed: false,
  ready: false,
  // The bed sat at 0.62 while a hurt yelp peaks at 0.21 and a smash at 0.15 —
  // the reactions were playing underneath the soundtrack rather than over it.
  // The music is the room; the hits are the game.
  volume: 0.45,

  _ctx: null,
  _bus: null,
  _decks: [],
  _live: -1,          // index of the deck currently playing
  _key: null,         // what is playing
  _want: null,
  _wantAt: 0,
  _switchedAt: -999,
  _scene: null,       // set by the UI screens; null means the shift is running
  _fresh: false,      // first director choice after a scene change: switch at once
  _cues: {},          // key -> a trimmed AudioBuffer, ready to fire
  _warming: {},
  _cueAt: {},         // key -> when it may fire again

  // Called from a user gesture, same as SFX.resume().
  init() {
    if (this.ready || this.failed) return;
    const bus = SFX.bus();
    if (!bus) { this.failed = true; return; }
    this._ctx = bus.ctx;

    this._bus = this._ctx.createGain();
    this._bus.gain.value = this.volume;
    this._bus.connect(bus.master);

    for (let i = 0; i < 2; i++) {
      const el = new Audio();
      el.preload = 'none';
      el.loop = true;
      // A file that will not load must not take the whole score with it.
      el.addEventListener('error', () => this._onDeckError(i));
      let gain;
      try {
        const src = this._ctx.createMediaElementSource(el);
        gain = this._ctx.createGain();
        gain.gain.value = 0;
        src.connect(gain);
        gain.connect(this._bus);
      } catch {
        gain = null;         // no routing: fall back to the element's own volume
        el.volume = 0;
      }
      this._decks.push({ el, gain, key: null });
    }
    this.ready = true;
  },

  _onDeckError(i) {
    const d = this._decks[i];
    console.warn('[music] could not load', d && d.key);
    // Only a total failure disables the module: one missing bed should not stop
    // the theme from playing.
    if (i === this._live) { this._key = null; this._live = -1; }
  },

  _setGain(deck, to, secs) {
    if (deck.gain) {
      const t = this._ctx.currentTime;
      deck.gain.gain.cancelScheduledValues(t);
      deck.gain.gain.setValueAtTime(deck.gain.gain.value, t);
      deck.gain.gain.linearRampToValueAtTime(to, t + Math.max(0.01, secs));
    } else {
      deck.el.volume = to;                      // no WebAudio routing available
    }
  },

  // Crossfade to `key`. Repeating the key that is already playing does nothing,
  // which is what lets the director be called every frame.
  play(key, { loop = true, fade = 1.0 } = {}) {
    if (!this.enabled || this.failed) return;
    this.init();
    if (!this.ready || key === this._key) return;

    const next = this._decks[this._live === 0 ? 1 : 0];
    const cur = this._live >= 0 ? this._decks[this._live] : null;

    next.key = key;
    next.el.loop = loop;
    next.el.src = DIR + key + '.mp3';
    next.el.currentTime = 0;
    this._setGain(next, 0, 0.01);

    // IF IT DOES NOT ACTUALLY START, DO NOT PRETEND IT DID.
    // This swallowed the rejection and set `_key` regardless, so the director's
    // `if (key === this._key) return` saw the job as done and never tried
    // again. Measured: the whole shift silent, deck loaded with calm.mp3 and
    // `paused: true`, for as long as you played. Clearing the key is what lets
    // the director pick it up on the next frame, once a gesture exists.
    const started = next.el.play();
    if (started && started.catch) {
      started.catch(() => {
        if (this._key === key) { this._key = null; this._want = null; }
      });
    }

    this._setGain(next, 1, fade);
    if (cur) {
      this._setGain(cur, 0, fade);
      // stop the old deck once it is silent, so it stops using bandwidth
      const el = cur.el;
      setTimeout(() => { if (el !== next.el) { el.pause(); } }, fade * 1000 + 80);
    }

    this._live = this._live === 0 ? 1 : 0;
    this._key = key;
    this._switchedAt = performance.now() / 1000;
  },

  stop(fade = 0.6) {
    if (!this.ready) return;
    for (const d of this._decks) {
      this._setGain(d, 0, fade);
      const el = d.el;
      setTimeout(() => el.pause(), fade * 1000 + 80);
    }
    this._key = null;
    this._live = -1;
    this._want = null;
  },

  // A one-shot over the top of whatever is playing: the bed ducks, the sting
  // runs, the bed comes back. Used for the lift chime.
  sting(key, { duck = 0.35, secs = 3.0 } = {}) {
    if (!this.enabled || this.failed) return;
    this.init();
    if (!this.ready) return;
    const el = new Audio(DIR + key + '.mp3');
    el.volume = 0.9;
    el.play().catch(() => {});
    setTimeout(() => { el.pause(); el.src = ''; }, secs * 1000);

    const live = this._live >= 0 ? this._decks[this._live] : null;
    if (!live) return;
    this._setGain(live, duck, 0.25);
    setTimeout(() => { if (this._decks[this._live] === live) this._setGain(live, 1, 0.7); }, secs * 700);
  },

  // The title screen chooses its music before any gesture has happened, so the
  // first tap replays whatever was chosen rather than leaving the menu silent.
  resume() {
    this.init();
    if (!this.ready || this.failed || this._key) return;
    const s = this._scene;
    if (s) { this._scene = null; this.scene(s); }
  },

  // The UI screens set a scene; the shift clears it by passing null.
  scene(name) {
    this._scene = name;
    // Handing control back to the director is a hard cut, not a drift: the hold
    // below exists to stop the music thrashing *inside* a shift, and letting it
    // apply here left the menu loop running for five seconds after the shift
    // had started.
    if (name === null) { this._fresh = true; this._want = null; }
    if (!this.enabled || this.failed) return;
    if (name === 'title') this.play('theme');
    else if (name === 'menu') this.play('menu');
    else if (name === 'shop') this.play('shop');
    else if (name === 'promote') this.play('promote', { loop: false, fade: 0.25 });
    else if (name === 'fired') this.play('fired', { loop: false, fade: 0.25 });
    else if (name !== null) {
      // AN UNKNOWN SCENE IS NOT A SCENE. Any other string fell through every
      // branch, played nothing, and — because `update()` bails on a truthy
      // `_scene` — locked the director out for the rest of the shift. A typo in
      // a scene name would have been permanent silence with no error anywhere.
      this._scene = null;
      this._fresh = true;
      this._want = null;
    }
  },

  // ---- impact cues --------------------------------------------------------

  // Fetch, decode, and throw away everything after the first `secs`.
  //
  // The trim is the whole point. decodeAudioData has to decode the entire file,
  // and a 30s stereo track is about 10 MB of float PCM — five of those resident
  // is 50 MB on a phone for what amounts to twelve seconds of audio. Copying
  // out the front and dropping the rest costs ~4 MB for all five.
  async warm(key) {
    if (!this.enabled || this.failed || !CUES[key]) return;
    this.init();
    if (!this.ready || this._cues[key] || this._warming[key]) return;
    this._warming[key] = true;
    try {
      const res = await fetch(DIR + key + '.mp3');
      if (!res.ok) throw new Error('http ' + res.status);
      const full = await this._ctx.decodeAudioData(await res.arrayBuffer());
      const want = Math.min(full.duration, CUES[key].secs);
      const frames = Math.floor(want * full.sampleRate);
      const trimmed = this._ctx.createBuffer(full.numberOfChannels, frames, full.sampleRate);
      for (let ch = 0; ch < full.numberOfChannels; ch++) {
        trimmed.getChannelData(ch).set(full.getChannelData(ch).subarray(0, frames));
      }
      this._cues[key] = trimmed;
    } catch (e) {
      console.warn('[music] cue', key, 'unavailable:', e.message);
    }
    this._warming[key] = false;
  },

  // Load whatever the equipped weapon is going to want, before it is swung.
  warmFor(weaponId) {
    const key = WEAPON_CUE[weaponId];
    if (key) this.warm(key);
  },

  // Fire a cue. If it has not finished loading this call is skipped rather than
  // queued — a flourish that arrives two seconds after the punch is worse than
  // no flourish — and the load is kicked off so the next one lands on time.
  cue(key) {
    if (!this.enabled || this.failed) return;
    const def = CUES[key];
    if (!def) return;
    this.init();
    if (!this.ready) return;

    const buf = this._cues[key];
    if (!buf) { this.warm(key); return; }
    const now = this._ctx.currentTime;
    if ((this._cueAt[key] || 0) > now) return;   // one hit can touch several bodies
    this._cueAt[key] = now + def.cool;

    const src = this._ctx.createBufferSource();
    src.buffer = buf;
    const g = this._ctx.createGain();
    g.gain.setValueAtTime(def.gain, now);
    // a hard cut at the trim point clicks; ride it out over the last 200ms
    g.gain.setValueAtTime(def.gain, now + Math.max(0.05, buf.duration - 0.2));
    g.gain.linearRampToValueAtTime(0.0001, now + buf.duration);
    src.connect(g);
    g.connect(this._bus);
    src.start(now);

    // the big ones push the bed out of the way for a moment
    const live = this._live >= 0 ? this._decks[this._live] : null;
    if (def.duck && live) {
      this._setGain(live, def.duck, 0.15);
      setTimeout(() => {
        if (this._decks[this._live] === live) this._setGain(live, 1, 0.8);
      }, buf.duration * 800);
    }
  },

  // ---- the director -------------------------------------------------------
  //
  // Called every frame while a shift runs. It works out what the music *should*
  // be from the game state, then applies hysteresis so it does not thrash: a
  // more intense choice takes over at once, a calmer one has to hold for a
  // couple of seconds and no track is swapped sideways inside HOLD.
  choose(S) {
    if (S.boss && S.boss.fighting && !S.boss.dead) return 'bosschase';

    let tier = 0;
    if (S.chaos && S.chaos.alive) tier = Math.min(3, S.chaos.chain);
    // The boss's temper counts even between chains — a furious office should not
    // drop back to lift muzak just because nothing is currently airborne.
    const anger = S.anger || 0;
    if (anger >= 70) tier = Math.max(tier, 2);
    else if (anger >= 35) tier = Math.max(tier, 1);

    if (tier >= 3) return 'chaos3';
    if (tier === 2) return 'chaos2';
    if (tier === 1) return 'chaos1';
    return ROOM_BED[S.room] || 'calm';
  },

  update(S) {
    if (!this.enabled || this.failed || this._scene) return;
    if (!S || S.mode !== 'play') return;
    this.init();
    if (!this.ready) return;

    // SELF-HEAL. A deck can end up loaded-but-paused — an autoplay refusal, a
    // browser suspending media, a tab coming back from the background. The
    // director's whole shortcut is "the key already matches, nothing to do", so
    // without this it would sit next to a silent deck forever.
    const live = this._live >= 0 ? this._decks[this._live] : null;
    if (this._key && live && live.el && live.el.paused && live.key === this._key) {
      const again = live.el.play();
      if (again && again.catch) again.catch(() => { this._key = null; this._want = null; });
    }

    const key = this.choose(S);
    const now = performance.now() / 1000;
    if (key !== this._want) { this._want = key; this._wantAt = now; }
    if (key === this._key) { this._fresh = false; return; }

    if (this._fresh) { this._fresh = false; return this.play(key, { fade: 0.9 }); }
    const up = (PRIORITY[key] || 0) > (PRIORITY[this._key] || 0);
    if (up) return this.play(key, { fade: 0.35 });
    if (now - this._wantAt >= SETTLE && now - this._switchedAt >= HOLD) this.play(key, { fade: 1.2 });
  },
};
