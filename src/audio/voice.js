// Voix robotique procédurale : chaque syllabe du message devient une impulsion
// filtrée par deux formants (voyelle), modulée en anneau (LUMEN) ou saturée et
// hachée (NULL). Brève par conception : seules les premières syllabes sont « dites ».

const FORMANTS = {
  a: [800, 1250], e: [480, 1750], é: [420, 2050], è: [560, 1800], i: [300, 2300], o: [480, 900],
  u: [320, 1700], y: [300, 2200], ou: [320, 800], on: [500, 850], an: [700, 1100], in: [550, 1600],
};

function syllables(text) {
  const words = text.toLowerCase().replace(/[^a-zàâäéèêëïîôöùûüç' ]/g, ' ').split(/\s+/).filter(Boolean);
  const out = [];
  for (const w of words) {
    const re = /([^aeiouyàâäéèêëïîôöùûü]*)([aeiouyàâäéèêëïîôöùûü]+)/g;
    let m;
    while ((m = re.exec(w))) {
      let v = m[2];
      let key = 'e';
      if (v.startsWith('ou')) key = 'ou';
      else if (/[aàâä]/.test(v[0])) key = 'a';
      else if (/[é]/.test(v[0])) key = 'é';
      else if (/[èêë]/.test(v[0])) key = 'è';
      else if (/[iîïy]/.test(v[0])) key = 'i';
      else if (/[oôö]/.test(v[0])) key = 'o';
      else if (/[uùûü]/.test(v[0])) key = 'u';
      const c = m[1];
      out.push({ v: key, plosive: /[ptkbdgq]/.test(c), fric: /[sfzjhx]|ch/.test(c), wordStart: m.index === 0 });
    }
  }
  return out;
}

export class Voice {
  constructor(A) {
    this.A = A;
    this.busyUntil = 0;
  }

  speak(text, persona = 'lumen') {
    const A = this.A, ctx = A.ctx;
    const now = ctx.currentTime;
    const sy = syllables(text).slice(0, persona === 'null' ? 10 : 14);
    if (!sy.length) return;
    const isNull = persona === 'null';
    const rate = isNull ? 0.12 : 0.078;
    const base = isNull ? 82 : 196;
    let t = Math.max(now + 0.02, this.busyUntil);
    // chaîne de sortie commune au message
    const out = ctx.createGain(); out.gain.value = 1;
    let chainIn = out;
    if (isNull) {
      const ws = ctx.createWaveShaper();
      const c = new Float32Array(256);
      for (let i = 0; i < 256; i++) { const x = i / 128 - 1; c[i] = Math.round(Math.tanh(x * 4) * 6) / 6; }
      ws.curve = c;
      out.connect(ws); chainIn = ws;
    }
    const ring = ctx.createGain(); ring.gain.value = 0;
    const rm = ctx.createOscillator(); rm.frequency.value = isNull ? 38 : 72;
    const rmg = ctx.createGain(); rmg.gain.value = isNull ? 0.9 : 0.55;
    rm.connect(rmg); rmg.connect(ring.gain);
    const dry = ctx.createGain(); dry.gain.value = isNull ? 0.3 : 0.6;
    chainIn.connect(ring); chainIn.connect(dry);
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 140;
    ring.connect(hp); dry.connect(hp);
    hp.connect(A.buses.voice);
    const rs = ctx.createGain(); rs.gain.value = isNull ? 0.5 : 0.2; hp.connect(rs); rs.connect(A.revSend);
    const start = t;
    sy.forEach((s, i) => {
      const u = i / sy.length;
      // intonation : légère montée puis descente finale
      let f0 = base * (1 + 0.08 * Math.sin(u * Math.PI) - (u > 0.8 ? 0.12 * (u - 0.8) * 5 : 0)) * (0.94 + Math.random() * 0.12);
      if (isNull && Math.random() < 0.25) f0 *= 0.7;
      const d = rate * (s.wordStart ? 1.15 : 1) * (0.85 + Math.random() * 0.3);
      const [F1, F2] = FORMANTS[s.v] || FORMANTS.e;
      if (s.plosive) A.noise({ t, f: 1800, q: 1, dur: 0.02, gain: 0.25, dest: out });
      if (s.fric) A.noise({ t, f: 5500, filter: 'highpass', q: 0.7, dur: 0.045, gain: 0.12, dest: out });
      const src = ctx.createOscillator();
      src.type = isNull ? 'square' : 'sawtooth';
      src.frequency.setValueAtTime(f0, t);
      src.frequency.linearRampToValueAtTime(f0 * (isNull ? 0.85 : 1.04), t + d);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(0.5, t + 0.01);
      g.gain.setValueAtTime(0.5, t + d * 0.65);
      g.gain.exponentialRampToValueAtTime(0.0001, t + d);
      for (const [F, q, k] of [[F1, 7, 1], [F2, 10, 0.6]]) {
        const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = F; bp.Q.value = q;
        const kg = ctx.createGain(); kg.gain.value = k;
        src.connect(bp); bp.connect(kg); kg.connect(g);
      }
      g.connect(out);
      src.start(t); src.stop(t + d + 0.02);
      t += d + (s.wordStart ? 0.012 : 0);
      // hachures numériques de NULL
      if (isNull && Math.random() < 0.15) t += 0.05;
    });
    rm.start(start); rm.stop(t + 0.3);
    this.busyUntil = t + 0.05;
    // atténuation de la musique pendant la voix
    const md = A.musicDuck.gain;
    md.cancelScheduledValues(now);
    md.setTargetAtTime(0.65, start, 0.05);
    md.setTargetAtTime(1, t + 0.1, 0.3);
  }
}
