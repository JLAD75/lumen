// Ambiance spatiale : bourdon des réacteurs, recyclage d'air, et événements
// aléatoires (servomoteurs, bips de robots, crépitements de circuits, moteurs lointains).

export class Ambience {
  constructor(A) {
    this.A = A;
    this.nextEvent = 0;
    this.timer = null;
  }

  start() {
    const A = this.A, ctx = A.ctx, t = ctx.currentTime;
    const bus = A.buses.amb;
    // bourdon
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 170; lp.Q.value = 2;
    const g = ctx.createGain(); g.gain.value = 0.11;
    for (const f of [55, 55.4, 82.6]) { const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; o.connect(lp); o.start(t); }
    const lfo = ctx.createOscillator(); lfo.frequency.value = 0.07;
    const lg = ctx.createGain(); lg.gain.value = 60;
    lfo.connect(lg); lg.connect(lp.frequency); lfo.start(t);
    lp.connect(g); g.connect(bus);
    // recyclage d'air
    const src = ctx.createBufferSource(); src.buffer = A.pinkBuf; src.loop = true;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 420; bp.Q.value = 0.6;
    const ag = ctx.createGain(); ag.gain.value = 0.25;
    const lfo2 = ctx.createOscillator(); lfo2.frequency.value = 0.11;
    const lg2 = ctx.createGain(); lg2.gain.value = 0.1;
    lfo2.connect(lg2); lg2.connect(ag.gain); lfo2.start(t);
    src.connect(bp); bp.connect(ag); ag.connect(bus); src.start(t);
    this.nextEvent = t + 3;
    this.timer = setInterval(() => this._tick(), 400);
  }

  _tick() {
    const A = this.A, ctx = A.ctx;
    if (ctx.state !== 'running' || A.paused) return;
    const t = ctx.currentTime;
    if (t < this.nextEvent) return;
    this.nextEvent = t + 3 + Math.random() * 6;
    const bus = A.buses.amb;
    const pan = Math.random() * 1.6 - 0.8;
    const o = A.out(pan, bus, 0.6);
    const kind = Math.floor(Math.random() * 4);
    if (kind === 0) { // servomoteur
      A.tone({ type: 'sawtooth', f: 180, f2: 420, dur: 0.6, gain: 0.05, filter: 'bandpass', ff: 900, q: 3, dest: o });
      A.tone({ type: 'sawtooth', f: 420, f2: 240, t: t + 0.7, dur: 0.4, gain: 0.04, filter: 'bandpass', ff: 900, q: 3, dest: o });
    } else if (kind === 1) { // bips de robot
      const n = 2 + Math.floor(Math.random() * 4);
      for (let i = 0; i < n; i++) A.tone({ f: 900 + Math.random() * 1600, t: t + i * 0.08, dur: 0.05, gain: 0.04, dest: o });
    } else if (kind === 2) { // crépitement de circuit
      for (let i = 0; i < 8; i++) A.noise({ f: 3000 + Math.random() * 4000, q: 4, t: t + Math.random() * 0.5, dur: 0.012, gain: 0.08, dest: o });
    } else { // moteur lointain
      A.noise({ pink: true, f: 120, f2: 260, q: 1.2, filter: 'lowpass', dur: 2.5, a: 0.8, gain: 0.25, dest: o });
    }
  }
}
