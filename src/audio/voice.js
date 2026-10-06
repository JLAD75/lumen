// Voix des IA : une signature de droïde, pas une parole. Chaque réplique devient une courte
// phrase de notes synthétisées (moins d'une seconde), tirée de son texte : la même réplique
// sonne toujours pareil. LUMEN siffle, trille et « boupe » (R2-D2, BB-8) ; NULL grogne,
// saute de fréquence et grésille à travers une saturation crénelée.
// Coût : 2 à 4 nœuds par note, aucun filtre par note ; rien du tout si la voix est coupée.

import { mulberry32 } from '../util/math.js';

function hash(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

// Une note : { type, f: [fréquences enchaînées en glissando] | steps, d, gain, trill: [Hz, profondeur] }
function lumenPhrase(text, R) {
  const between = (a, b) => a + R() * (b - a);
  const n = 2 + Math.min(4, Math.ceil(text.length / 22));
  const notes = [];
  for (let i = 0; i < n; i++) {
    const r = R();
    if (r < 0.34) {
      // sifflet : glissando franc, vers le haut ou vers le bas
      const f0 = between(1100, 2300);
      notes.push({ type: 'sine', f: [f0, f0 * (R() < 0.5 ? between(1.3, 1.8) : between(0.55, 0.8))], d: between(0.06, 0.13), gain: 0.2 });
    } else if (r < 0.52) {
      // trille : vibrato rapide, le gazouillis de R2-D2
      const f0 = between(1500, 2500);
      notes.push({ type: 'sine', f: [f0, f0 * between(0.9, 1.15)], d: between(0.12, 0.2), gain: 0.17, trill: [between(22, 34), between(0.1, 0.2)] });
    } else if (r < 0.72) {
      // « boup » rond et grave de BB-8
      const f0 = between(420, 760);
      notes.push({ type: 'triangle', f: [f0, f0 * between(1.3, 1.8)], d: between(0.07, 0.12), gain: 0.32 });
    } else if (r < 0.86) {
      // envolée : monte puis retombe
      const f0 = between(900, 1500);
      notes.push({ type: 'sine', f: [f0, f0 * between(1.6, 2.1), f0 * between(0.9, 1.2)], d: between(0.12, 0.18), gain: 0.18 });
    } else {
      // « dit » bref et aigu
      notes.push({ type: 'sine', f: [between(2200, 3200)], d: between(0.03, 0.045), gain: 0.16 });
    }
  }
  // intonation finale : une question remonte, une exclamation finit en trille
  const end = text.trim().slice(-1);
  if (end === '?') { const f0 = between(900, 1300); notes.push({ type: 'sine', f: [f0, f0 * 2.2], d: 0.16, gain: 0.19 }); }
  else if (end === '!') { const f0 = between(1800, 2400); notes.push({ type: 'sine', f: [f0, f0 * 1.1], d: 0.14, gain: 0.16, trill: [30, 0.18] }); }
  return notes;
}

function nullPhrase(text, R) {
  const between = (a, b) => a + R() * (b - a);
  const n = 2 + Math.min(3, Math.ceil(text.length / 30));
  const notes = [];
  for (let i = 0; i < n; i++) {
    const r = R();
    if (r < 0.4) {
      // grognement qui plonge
      const f0 = between(110, 200);
      notes.push({ type: 'sawtooth', f: [f0, f0 * between(0.5, 0.7)], d: between(0.12, 0.2), gain: 0.2 });
    } else if (r < 0.75) {
      // sauts de fréquence numériques
      const steps = Array.from({ length: 3 + Math.floor(R() * 3) }, () => between(160, 720));
      notes.push({ type: 'square', steps, d: between(0.1, 0.16), gain: 0.12 });
    } else {
      // décharge : chute rapide de l'aigu au grave
      notes.push({ type: 'square', f: [between(800, 1100), between(90, 140)], d: between(0.07, 0.1), gain: 0.12 });
    }
  }
  // la fin descend toujours, longue et grave
  const f0 = between(150, 190);
  notes.push({ type: 'sawtooth', f: [f0, f0 * 0.45], d: 0.24, gain: 0.2 });
  return notes;
}

export class Voice {
  constructor(A) {
    this.A = A;
    this.busyUntil = 0;
    this.chains = {};
  }

  // chaîne de sortie propre à chaque IA, créée une fois
  _chain(persona) {
    if (this.chains[persona]) return this.chains[persona];
    const A = this.A, ctx = A.ctx;
    const input = ctx.createGain();
    let node = input;
    // niveaux calés sur l'ancienne voix (rendu hors ligne), un peu en dessous : les sifflets
    // aigus de LUMEN tombent là où l'oreille est la plus sensible
    if (persona !== 'null') input.gain.value = 0.3;
    if (persona === 'null') {
      const ws = ctx.createWaveShaper();
      const c = new Float32Array(256);
      for (let i = 0; i < 256; i++) { const x = i / 128 - 1; c[i] = Math.round(Math.tanh(x * 3) * 5) / 5; }
      ws.curve = c;
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2600; lp.Q.value = 3;
      const level = ctx.createGain(); level.gain.value = 0.45;
      input.connect(ws); ws.connect(lp); lp.connect(level); node = level;
    }
    node.connect(A.buses.voice);
    const rs = ctx.createGain(); rs.gain.value = persona === 'null' ? 0.35 : 0.18;
    node.connect(rs); rs.connect(A.revSend);
    return (this.chains[persona] = input);
  }

  _note(dest, t, n) {
    const ctx = this.A.ctx;
    const o = ctx.createOscillator();
    o.type = n.type;
    const f = o.frequency;
    if (n.steps) {
      f.setValueAtTime(n.steps[0], t);
      for (let i = 1; i < n.steps.length; i++) f.setValueAtTime(n.steps[i], t + (n.d * i) / n.steps.length);
    } else {
      f.setValueAtTime(n.f[0], t);
      for (let i = 1; i < n.f.length; i++) f.exponentialRampToValueAtTime(n.f[i], t + (n.d * i) / (n.f.length - 1));
    }
    if (n.trill) {
      const lfo = ctx.createOscillator(); lfo.frequency.value = n.trill[0];
      const depth = ctx.createGain(); depth.gain.value = n.f[0] * n.trill[1];
      lfo.connect(depth); depth.connect(f);
      lfo.start(t); lfo.stop(t + n.d + 0.02);
    }
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(n.gain, t + 0.008);
    g.gain.setValueAtTime(n.gain, t + n.d * 0.7);
    g.gain.exponentialRampToValueAtTime(0.0001, t + n.d);
    o.connect(g); g.connect(dest);
    o.start(t); o.stop(t + n.d + 0.02);
  }

  speak(text, persona = 'lumen') {
    const A = this.A, ctx = A.ctx, s = A.settings;
    if (s.muted || !(s.voice > 0) || !text) return;
    const isNull = persona === 'null';
    const R = mulberry32(hash(persona + text));
    const notes = isNull ? nullPhrase(text, R) : lumenPhrase(text, R);
    const dest = this._chain(isNull ? 'null' : 'lumen');
    let t = Math.max(ctx.currentTime + 0.02, this.busyUntil);
    for (const n of notes) {
      this._note(dest, t, n);
      // petits silences entre les notes, parfois enchaînées sans pause
      t += n.d + (R() < 0.25 ? 0 : 0.02 + R() * 0.04);
    }
    this.busyUntil = t + 0.08;
  }
}
