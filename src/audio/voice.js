// Voix des IA : une signature de droïde, pas une parole. Chaque réplique devient une phrase
// continue de pépiements (moins d'une seconde et quart), tirée de son texte : la même réplique
// sonne toujours pareil. Grammaire calquée sur R2-D2 : pépiements de 50 à 90 ms enchaînés sans
// silence, séparés par de brefs creux de volume, hauteur qui saute par paliers, glissés et
// trilles, timbre légèrement harmonique, chute finale vers le grave.
// LUMEN pépie dans l'aigu ; NULL, droïde sombre, parle grave et plus lentement, sa mélodie
// descend, un grondement léger l'habite et il finit toujours par une mise hors tension.
// Coût : une seule voix par réplique (oscillateur, enveloppe, vibrato), 4 à 7 nœuds au total.

import { mulberry32 } from '../util/math.js';

function hash(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

// Un pépiement : { f0, f1 (glissé de f0 à f1), d (s), trill (profondeur relative, 0 = aucune), gap (silence après) }
function phrase(text, persona, R) {
  const between = (a, b) => a + R() * (b - a);
  const isNull = persona === 'null';
  const P = isNull
    ? { lo: 340, hi: 900, n: [4, 8], d: [0.09, 0.15], drift: -0.04, trill: 0.12 }
    : { lo: 1400, hi: 2800, n: [6, 12], d: [0.05, 0.09], drift: 0, trill: 0.22 };
  const n = Math.round(P.n[0] + Math.min(1, text.length / 60) * (P.n[1] - P.n[0]) + R() * 2 - 1);
  const chirps = [];
  // marche aléatoire en demi-tons dans le registre, avec une pente (NULL descend)
  const span = Math.log2(P.hi / P.lo) * 12;
  let st = isNull ? between(span * 0.55, span) : between(span * 0.2, span * 0.8);
  for (let i = 0; i < n; i++) {
    st += (R() < 0.5 ? -1 : 1) * between(1, 5) + P.drift * 12;
    if (st < 0) st = -st * 0.5;
    if (st > span) st = span - (st - span) * 0.5;
    const f0 = P.lo * Math.pow(2, st / 12);
    const r = R();
    // contour : tenu, glissé montant, glissé descendant
    const f1 = Math.min(P.hi * 1.05, r < 0.4 ? f0 * between(0.97, 1.03) : r < 0.7 ? f0 * between(1.12, 1.35) : f0 * between(0.75, 0.9));
    chirps.push({ f0, f1, d: between(P.d[0], P.d[1]), trill: R() < 0.18 ? P.trill : 0, gap: R() < 0.12 ? between(0.03, 0.06) : 0 });
  }
  const end = text.trim().slice(-1);
  if (isNull) {
    // mise hors tension : longue descente vers le grave
    const f0 = between(420, 520);
    chirps.push({ f0, f1: f0 * 0.32, d: 0.34, trill: 0, gap: 0 });
  } else if (end === '?') {
    // question : la fin remonte
    const f0 = between(1500, 1800);
    chirps.push({ f0, f1: f0 * 1.45, d: 0.12, trill: 0, gap: 0 });
  } else if (end === '!') {
    // exclamation : trille aiguë
    const f0 = between(2300, 2700);
    chirps.push({ f0, f1: f0 * 1.05, d: 0.13, trill: 0.2, gap: 0 });
  } else if (R() < 0.7) {
    // le plus souvent, chute finale vers le grave (comme l'échantillon de référence)
    const f0 = between(1050, 1250);
    chirps.push({ f0, f1: f0 * 0.98, d: 0.09, trill: 0, gap: 0 });
  }
  return chirps;
}

export class Voice {
  constructor(A) {
    this.A = A;
    this.busyUntil = 0;
    this.chains = {};
    this.waves = {};
  }

  // timbres : quelques harmoniques douces (LUMEN), plus chargé et sombre (NULL)
  _wave(persona) {
    if (this.waves[persona]) return this.waves[persona];
    const h = persona === 'null' ? [0, 1, 0.55, 0.35, 0.22, 0.14, 0.09] : [0, 1, 0.32, 0.16, 0.06];
    const real = new Float32Array(h.length), imag = new Float32Array(h);
    return (this.waves[persona] = this.A.ctx.createPeriodicWave(real, imag));
  }

  // chaîne de sortie propre à chaque IA, créée une fois
  _chain(persona) {
    if (this.chains[persona]) return this.chains[persona];
    const A = this.A, ctx = A.ctx;
    const input = ctx.createGain();
    let node = input;
    // niveaux calés sur l'ancienne voix (rendu hors ligne), un peu en dessous
    if (persona === 'null') {
      input.gain.value = 0.42;
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2200; lp.Q.value = 0.8;
      input.connect(lp); node = lp;
    } else input.gain.value = 0.12;
    node.connect(A.buses.voice);
    const rs = ctx.createGain(); rs.gain.value = persona === 'null' ? 0.3 : 0.16;
    node.connect(rs); rs.connect(A.revSend);
    return (this.chains[persona] = input);
  }

  speak(text, persona = 'lumen') {
    const A = this.A, ctx = A.ctx, s = A.settings;
    if (s.muted || !(s.voice > 0) || !text) return;
    const isNull = persona === 'null';
    const key = isNull ? 'null' : 'lumen';
    const R = mulberry32(hash(key + text));
    const chirps = phrase(text, key, R);
    const start = Math.max(ctx.currentTime + 0.02, this.busyUntil);

    const o = ctx.createOscillator();
    o.setPeriodicWave(this._wave(key));
    const f = o.frequency;
    const g = ctx.createGain();
    const env = g.gain;
    // vibrato commun, ouvert seulement sur les pépiements trillés
    const lfo = ctx.createOscillator(); lfo.frequency.value = isNull ? 18 : 27;
    const depth = ctx.createGain(); depth.gain.value = 0;
    lfo.connect(depth); depth.connect(f);
    let tail = null;
    if (isNull) {
      // grondement : légère modulation d'amplitude, la menace sans la saturation
      tail = ctx.createGain(); tail.gain.value = 0.75;
      const am = ctx.createOscillator(); am.frequency.value = 34;
      const amk = ctx.createGain(); amk.gain.value = 0.25;
      am.connect(amk); amk.connect(tail.gain);
      g.connect(tail); tail.connect(this._chain(key));
      am.start(start); tail.am = am;
    } else g.connect(this._chain(key));
    o.connect(g);

    const peak = 0.5, dip = peak * 0.12;
    let t = start;
    f.setValueAtTime(chirps[0].f0, t);
    env.setValueAtTime(0.0001, t);
    for (const c of chirps) {
      // attaque : saut rapide vers la nouvelle hauteur, puis glissé jusqu'à la fin du pépiement
      f.exponentialRampToValueAtTime(c.f0, t + 0.012);
      f.exponentialRampToValueAtTime(c.f1, t + c.d);
      env.linearRampToValueAtTime(peak, t + 0.008);
      env.setValueAtTime(peak, t + c.d - 0.014);
      env.linearRampToValueAtTime(c.gap ? 0.0001 : dip, t + c.d);
      depth.gain.setValueAtTime(c.trill ? c.f0 * c.trill : 0, t);
      t += c.d;
      if (c.gap) { env.setValueAtTime(0.0001, t + c.gap); t += c.gap; }
    }
    env.linearRampToValueAtTime(0.0001, t + 0.03);
    const stop = t + 0.05;
    o.start(start); o.stop(stop);
    lfo.start(start); lfo.stop(stop);
    if (tail) tail.am.stop(stop);
    this.busyUntil = t + 0.1;
  }
}
