// Musique électronique adaptative : séquenceur à anticipation (lookahead).
// Chaque mode a son tempo, sa tonalité et sa progression ; l'intensité active
// des couches (basse, kick, hats, snare, arpège, lead), la tension ajoute
// des doubles-croches et ouvre le filtre. Les changements de mode tombent sur la mesure.

const nf = (m) => 440 * Math.pow(2, (m - 69) / 12);

const SONGS = {
  title:    { bpm: 92,  root: 57, prog: [[0, 3, 7, 10], [-4, 0, 3, 7], [3, 7, 10, 14], [-5, -2, 2, 7]], style: 'ambient' },
  table:    { bpm: 116, root: 57, prog: [[0, 3, 7], [-4, 0, 3], [3, 7, 10], [-2, 2, 5]], style: 'drive' },
  brick:    { bpm: 128, root: 60, prog: [[0, 4, 7], [-5, -1, 2], [-3, 0, 4], [-7, -3, 0]], style: 'bounce' },
  reactor:  { bpm: 122, root: 62, prog: [[0, 3, 7], [0, 3, 7], [-4, 0, 3], [-5, -1, 2]], style: 'pulse' },
  defense:  { bpm: 136, root: 64, prog: [[0, 3, 7], [-4, 0, 3], [-2, 2, 5], [-5, -1, 2]], style: 'drive' },
  tag:      { bpm: 124, root: 67, prog: [[0, 4, 7], [-3, 0, 4], [-5, -1, 2], [-7, -3, 0]], style: 'bounce' },
  vault:    { bpm: 118, root: 59, prog: [[0, 3, 7], [-2, 2, 5], [-4, 0, 3], [-5, -1, 2]], style: 'pulse' },
  arena:    { bpm: 132, root: 65, prog: [[0, 4, 7], [-5, -1, 2], [-3, 0, 4], [-1, 2, 6]], style: 'drive' },
  duel:     { bpm: 140, root: 57, prog: [[0, 3, 7], [1, 5, 8], [0, 3, 7], [-2, 2, 5]], style: 'dark' },
  maze:     { bpm: 104, root: 60, prog: [[0, 3, 7], [-4, 0, 3], [-2, 2, 5], [-5, -2, 2]], style: 'pulse' },
  bugs:     { bpm: 134, root: 69, prog: [[0, 4, 7], [-3, 0, 4], [-5, -1, 2], [-1, 2, 6]], style: 'bounce' },
  gameover: { bpm: 76,  root: 57, prog: [[0, 3, 7], [-4, 0, 3], [-7, -4, 0], [-5, -1, 2]], style: 'ambient' },
};

const BASS = {
  drive:  [0, null, 0, 12, null, 0, 7, null, 0, null, 0, 12, null, 7, 0, null],
  bounce: [0, null, 12, null, 0, 12, null, 7, 0, null, 12, null, 7, null, 12, null],
  pulse:  [0, 0, null, 0, 0, null, 0, 0, null, 0, 0, null, 12, 0, null, 0],
  dark:   [0, 0, 0, null, 0, 0, 1, null, 0, 0, 0, null, -2, 0, 1, null],
  ambient: [0, null, null, null, null, null, null, null, 7, null, null, null, null, null, null, null],
};

const LEAD = [12, null, 15, null, 19, null, 17, 15, 12, null, 10, null, 12, null, null, null];

export class Music {
  constructor(A) {
    this.A = A;
    this.ctx = A.ctx;
    this.mode = 'title';
    this.pending = null;
    this.song = SONGS.title;
    this.intensity = 0.3; this.target = 0.3;
    this.tension = 0; this.tensionT = 0;
    this.flags = {};
    this.boost = 0;
    this.step = 0;
    this.bar = 0;
    this.nextTime = 0;
    this.timer = null;
    // bus interne : délai pour les arpèges
    const ctx = this.ctx;
    this.out = A.musicIn;
    this.delay = ctx.createDelay(1);
    this.delay.delayTime.value = 0.36;
    this.fb = ctx.createGain(); this.fb.gain.value = 0.32;
    this.dlp = ctx.createBiquadFilter(); this.dlp.type = 'lowpass'; this.dlp.frequency.value = 2500;
    this.delay.connect(this.dlp); this.dlp.connect(this.fb); this.fb.connect(this.delay);
    this.dlp.connect(this.out);
    this.delaySend = ctx.createGain(); this.delaySend.gain.value = 0.35;
    this.delaySend.connect(this.delay);
    this.revSend = ctx.createGain(); this.revSend.gain.value = 0.25;
    this.revSend.connect(A.revSend);
    // distorsion pour la basse du duel
    this.dist = ctx.createWaveShaper();
    const c = new Float32Array(512);
    for (let i = 0; i < 512; i++) { const x = i / 256 - 1; c[i] = Math.tanh(x * 3.5); }
    this.dist.curve = c;
    this.dist.connect(this.out);
  }

  start() {
    this.nextTime = this.ctx.currentTime + 0.12;
    this.timer = setInterval(() => this._schedule(), 25);
  }

  setMode(m, immediate) {
    if (!SONGS[m]) return;
    if (m === this.mode && !this.pending) return;
    if (immediate) { this.mode = m; this.song = SONGS[m]; this.pending = null; return; }
    this.pending = m;
  }

  setIntensity(v) { this.target = Math.max(0, Math.min(1, v)); }
  setLevel(l) { this.level = l; }
  get bpm() { return this.song.bpm + (this.mode === 'table' ? Math.min(12, ((this.level || 1) - 1) * 3) : 0); }
  setTension(v) { this.tension = Math.max(0, Math.min(1, v)); }
  setFlag(k, v) { this.flags[k] = v; }
  bump(x) { this.boost = Math.min(0.35, this.boost + x); }

  currentChord() {
    const s = this.song;
    const ch = s.prog[this.bar % s.prog.length];
    return ch.slice(0, 3).map(d => nf(s.root + d - 12 + 12));
  }

  _schedule() {
    const ctx = this.ctx;
    if (ctx.state !== 'running') { this.nextTime = ctx.currentTime + 0.1; return; }
    while (this.nextTime < ctx.currentTime + 0.12) {
      this._playStep(this.step, this.nextTime);
      const spb = 60 / this.bpm / 4;
      this.nextTime += spb;
      this.step++;
      if (this.step >= 16) {
        this.step = 0; this.bar++;
        if (this.pending) { this.mode = this.pending; this.song = SONGS[this.pending]; this.pending = null; this.bar = 0; }
      } else if (this.pending && this.step % 4 === 0 && (this.pending === 'gameover' || this.mode === 'title')) {
        this.mode = this.pending; this.song = SONGS[this.pending]; this.pending = null; this.step = 0; this.bar = 0;
      }
    }
    this.intensity += (this.target + this.boost - this.intensity) * 0.04;
    this.boost *= 0.985;
  }

  _playStep(step, t) {
    if (this.muted) return;          // une piste enregistrée joue à sa place
    const s = this.song, A = this.A;
    const I = Math.min(1, this.intensity + (this.flags.multiball && this.mode === 'table' ? 0.3 : 0));
    const T = this.tension;
    const chord = s.prog[this.bar % s.prog.length];
    const root = s.root;
    const amb = s.style === 'ambient';
    const spb = 60 / this.bpm / 4;

    // nappe (pad) : accord tenu sur la mesure
    if (step === 0) this._pad(chord.map(d => nf(root + d)), t, spb * 16, amb ? 0.05 : 0.035 * (1.2 - I * 0.5));

    // basse
    const bp = BASS[s.style] || BASS.drive;
    if ((I > 0.15 || amb) && bp[step] !== null && bp[step] !== undefined) {
      this._bass(nf(root - 24 + chord[0] + bp[step]), t, spb * (amb ? 6 : 1.6), s.style === 'dark');
    }
    if (amb) {
      if (step % 4 === 2) this._arp(nf(root + 12 + chord[(step / 4 | 0) % chord.length]), t, 0.035);
      return;
    }
    // kick
    if (I > 0.3) {
      const four = step % 4 === 0;
      const extra = s.style === 'dark' && (step === 14 || step === 7);
      if (four || extra) this._kick(t, s.style === 'dark' ? 0.9 : 0.75);
    }
    // charleston
    if (I > 0.4) {
      const sixteenth = I > 0.8 || T > 0.5;
      if (step % 4 === 2 || (sixteenth && step % 2 === 1)) this._hat(t, step % 4 === 2 ? 0.07 : 0.035, step % 8 === 6 && I > 0.7);
    }
    // caisse claire / clap
    if (I > 0.5 && (step === 4 || step === 12)) this._snare(t);
    if (I > 0.75 && s.style === 'drive' && step === 15) this._snare(t, 0.4);
    // arpège
    if (I > 0.58) {
      const notes = [chord[0], chord[1], chord[2], chord[0] + 12, chord[2], chord[1]];
      const n = notes[step % notes.length] + (s.style === 'bounce' ? 12 : 0);
      if (s.style !== 'pulse' || step % 2 === 0) this._arp(nf(root + 12 + n), t, 0.03 + I * 0.015);
    }
    // lead (multibille, duel)
    if ((I > 0.88 || this.flags.multiball && this.mode === 'table') && LEAD[step] !== null) {
      this._lead(nf(root + 12 + LEAD[step] + chord[0]), t, spb * 2);
    }
    // tension : tic métronomique aigu
    if (T > 0.6 && step % 2 === 0) A.tone({ type: 'square', f: 2637, t, dur: 0.02, gain: 0.012 * T, dest: this.out });
  }

  _pad(freqs, t, dur, gain) {
    const ctx = this.ctx;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass';
    lp.frequency.setValueAtTime(500 + this.tension * 1500, t);
    lp.frequency.linearRampToValueAtTime(900 + this.tension * 2500, t + dur * 0.5);
    lp.Q.value = 1;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(gain, t + Math.min(0.5, dur * 0.3));
    g.gain.setValueAtTime(gain, t + dur * 0.8);
    g.gain.linearRampToValueAtTime(0.0001, t + dur + 0.3);
    lp.connect(g); g.connect(this.out); g.connect(this.revSend);
    for (const f of freqs) {
      for (const d of [-7, 7]) {
        const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; o.detune.value = d;
        o.connect(lp); o.start(t); o.stop(t + dur + 0.4);
      }
    }
  }

  _bass(f, t, dur, dark) {
    const ctx = this.ctx;
    const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f;
    const sub = ctx.createOscillator(); sub.type = 'square'; sub.frequency.value = f / 2;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 6;
    lp.frequency.setValueAtTime(900 + this.intensity * 900, t);
    lp.frequency.exponentialRampToValueAtTime(180, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.16, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    const sg = ctx.createGain(); sg.gain.value = 0.5;
    o.connect(lp); sub.connect(sg); sg.connect(lp); lp.connect(g);
    g.connect(dark ? this.dist : this.out);
    o.start(t); sub.start(t); o.stop(t + dur + 0.05); sub.stop(t + dur + 0.05);
  }

  _kick(t, gain) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.frequency.setValueAtTime(155, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.12);
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain * 0.6, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.38);
    o.connect(g); g.connect(this.out);
    o.start(t); o.stop(t + 0.4);
    this.A.noise({ t, f: 3000, q: 1, dur: 0.008, gain: 0.08, dest: this.out });
  }

  _hat(t, gain, open) {
    this.A.noise({ t, f: 8000, filter: 'highpass', q: 0.5, dur: open ? 0.14 : 0.03, gain, dest: this.out });
  }

  _snare(t, k = 1) {
    this.A.noise({ t, f: 1900, q: 0.8, dur: 0.16, gain: 0.12 * k, dest: this.out });
    this.A.tone({ t, type: 'triangle', f: 190, f2: 140, dur: 0.08, gain: 0.08 * k, dest: this.out });
    if (k === 1) { const s = this.ctx.createGain(); s.gain.value = 1; s.connect(this.revSend); this.A.noise({ t, f: 1900, q: 0.8, dur: 0.12, gain: 0.04, dest: s }); }
  }

  _arp(f, t, gain) {
    const ctx = this.ctx;
    const o = ctx.createOscillator(); o.type = this.mode === 'brick' ? 'square' : 'triangle'; o.frequency.value = f;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2200 + this.tension * 3000;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(gain, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
    o.connect(lp); lp.connect(g); g.connect(this.out); g.connect(this.delaySend);
    o.start(t); o.stop(t + 0.2);
  }

  _lead(f, t, dur) {
    const ctx = this.ctx;
    const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f;
    const vib = ctx.createOscillator(); vib.frequency.value = 5.5;
    const vg = ctx.createGain(); vg.gain.value = f * 0.008;
    vib.connect(vg); vg.connect(o.frequency);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2400; lp.Q.value = 3;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.035, t + 0.02);
    g.gain.setValueAtTime(0.035, t + dur * 0.7); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(lp); lp.connect(g); g.connect(this.out); g.connect(this.delaySend);
    o.start(t); vib.start(t); o.stop(t + dur + 0.05); vib.stop(t + dur + 0.05);
  }
}
