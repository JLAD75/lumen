// Voix des IA : une signature de droïde, pas une parole. Principe des synthétiseurs des années
// 70-80 (l'« échantillonneur-bloqueur » de l'ARP 2600 qui a servi à R2-D2) : une hauteur
// aléatoire est tenue ~80 ms puis remplacée d'un coup ; chaque saut s'accompagne d'un bref
// « brrip » de modulation de fréquence, puis d'un creux de volume. Une réplique est une suite
// de « mots » de droïde, tirée de son texte (la même réplique sonne toujours pareil) :
// babil (hauteurs tenues), douiit (glissé montant), bwoo (glissé descendant), trille, bip.
// LUMEN pépie en sinus dans l'aigu (R2-D2) ; NULL, ordinateur hostile des années 80, babille en
// onde carrée à pas réguliers, sa mélodie descend et il finit par une mise hors tension.
// Coût : une seule voix par réplique, 4 à 6 nœuds ; rien si la voix est coupée.

import { mulberry32 } from '../util/math.js';

function hash(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

// Caractère de chaque IA. lo/hi : registre (Hz) ; step : durée d'une hauteur tenue (s) ;
// wave : forme d'onde ; lp : passe-bas de la chaîne (0 = aucun) ; ring : modulation en anneau
// [fréquence, part] (timbre métallique) ; fm : fréquence du « brrip » ; words : poids des mots ;
// regular : babil à pas réguliers (machine froide) ; fall : babil qui descend ; level : niveau.
export const VOICE_STYLES = {
  lumen: { lo: 1300, hi: 2700, step: [0.055, 0.09], wave: 'sine', lp: 0, ring: null, fm: 70, level: 0.12,
    words: { burble: 0.45, dweet: 0.15, bwoo: 0.08, trill: 0.17, blip: 0.15 } },
  null: { lo: 420, hi: 1100, step: [0.075, 0.075], wave: 'square', lp: 2200, ring: null, fm: 50, regular: true, fall: true, level: 0.123,
    words: { burble: 0.65, dweet: 0, bwoo: 0.2, trill: 0.05, blip: 0.1 } },
};

function pick(R, weights) {
  let r = R() * Object.values(weights).reduce((a, b) => a + b, 0);
  for (const [k, w] of Object.entries(weights)) { r -= w; if (r <= 0) return k; }
  return 'burble';
}

// Segments : { f (hauteur), to (glissé jusqu'à), d (s), brrip (saut avec « brrip »), gate (creux après) }
// ou { rest } (silence entre deux mots).
function words(text, key, S, R) {
  const between = (a, b) => a + R() * (b - a);
  const rand = () => S.lo * Math.pow(S.hi / S.lo, R());
  const seg = [];
  const word = (w) => {
    if (w === 'burble') {
      let prev = 0;
      const n = 3 + Math.floor(R() * 5);
      const pitches = [];
      for (let i = 0; i < n; i++) {
        let f = rand();
        // pas de sauts minuscules : au moins deux demi-tons d'écart
        for (let k = 0; k < 4 && prev && Math.abs(Math.log2(f / prev)) < 2 / 12; k++) f = rand();
        prev = f;
        pitches.push(f);
      }
      if (S.fall) pitches.sort((a, b) => b - a);
      const d = between(S.step[0], S.step[1]);
      pitches.forEach((f, i) => seg.push({ f, d: S.regular ? d : between(S.step[0], S.step[1]), brrip: true, gate: i < n - 1 }));
    } else if (w === 'dweet') {
      const f = S.lo * between(1, 1.4);
      seg.push({ f, to: f * between(1.6, 2.2), d: between(0.09, 0.16), brrip: true });
    } else if (w === 'bwoo') {
      const f = S.hi * between(0.7, 1);
      seg.push({ f, to: f * between(0.4, 0.6), d: between(0.18, 0.28), brrip: true });
    } else if (w === 'trill') {
      const a = rand(), b = a * between(1.25, 1.5), q = between(0.028, 0.038);
      const n = Math.round(between(0.15, 0.24) / q);
      for (let i = 0; i < n; i++) seg.push({ f: i % 2 ? b : a, d: q, brrip: i === 0 });
    } else {
      seg.push({ f: S.hi * between(0.9, 1.15), d: between(0.025, 0.04), brrip: false });
    }
  };
  const count = 2 + Math.min(2, Math.floor(text.length / 40));
  for (let i = 0; i < count; i++) {
    word(pick(R, S.words));
    seg.push({ rest: R() < 0.3 ? 0 : between(0.03, 0.07) });
  }
  const end = text.trim().slice(-1);
  if (key === 'null') word('bwoo');            // NULL finit toujours en mise hors tension
  else if (end === '?') word('dweet');
  else if (end === '!') word('trill');
  return seg;
}

export class Voice {
  constructor(A) {
    this.A = A;
    this.busyUntil = 0;
    this.chains = {};
    this.styles = VOICE_STYLES;
  }

  // chaîne de sortie propre à chaque IA, créée une fois
  _chain(key, S) {
    if (this.chains[key]) return this.chains[key];
    const A = this.A, ctx = A.ctx;
    const input = ctx.createGain(); input.gain.value = S.level;
    let node = input;
    if (S.lp) {
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = S.lp; lp.Q.value = 0.9;
      input.connect(lp); node = lp;
    }
    node.connect(A.buses.voice);
    const rs = ctx.createGain(); rs.gain.value = key === 'null' ? 0.3 : 0.16;
    node.connect(rs); rs.connect(A.revSend);
    return (this.chains[key] = input);
  }

  speak(text, persona = 'lumen') {
    const A = this.A, ctx = A.ctx, s = A.settings;
    if (s.muted || !(s.voice > 0) || !text) return;
    const key = persona === 'null' ? 'null' : 'lumen';
    const S = this.styles[key];
    const R = mulberry32(hash(key + text));
    const segs = words(text, key, S, R);
    const start = Math.max(ctx.currentTime + 0.02, this.busyUntil);

    const o = ctx.createOscillator(); o.type = S.wave;
    const f = o.frequency;
    const env = ctx.createGain();
    // « brrip » : modulation de fréquence rapide, ouverte un instant à chaque saut
    const fm = ctx.createOscillator(); fm.frequency.value = S.fm;
    const fmk = ctx.createGain(); fmk.gain.value = 0;
    fm.connect(fmk); fmk.connect(f);
    o.connect(env);
    let out = env, ring = null;
    if (S.ring) {
      // modulation en anneau partielle : timbre métallique de machine
      const rg = ctx.createGain(); rg.gain.value = 1 - S.ring[1];
      ring = ctx.createOscillator(); ring.frequency.value = S.ring[0];
      const rk = ctx.createGain(); rk.gain.value = S.ring[1];
      ring.connect(rk); rk.connect(rg.gain);
      env.connect(rg); out = rg;
    }
    out.connect(this._chain(key, S));

    const peak = 0.5, g = env.gain;
    let t = start, open = false;
    g.setValueAtTime(0, t);
    for (const sg of segs) {
      if (sg.rest !== undefined) {
        if (sg.rest > 0 && open) { g.setValueAtTime(peak, t); g.linearRampToValueAtTime(0, t + 0.006); open = false; t += sg.rest; }
        continue;
      }
      if (!open) g.setValueAtTime(0, t);
      f.setValueAtTime(sg.f, t);                         // saut franc (échantillonneur-bloqueur)
      if (sg.to) f.exponentialRampToValueAtTime(sg.to, t + sg.d);
      if (sg.brrip) {
        fmk.gain.setValueAtTime(sg.f * 0.35, t);
        fmk.gain.linearRampToValueAtTime(0, t + 0.018);
      }
      g.linearRampToValueAtTime(peak, t + 0.005);
      if (sg.gate) {
        g.setValueAtTime(peak, t + sg.d - 0.018);
        g.linearRampToValueAtTime(peak * 0.1, t + sg.d);
      } else g.setValueAtTime(peak, t + sg.d - 0.004);
      open = true;
      t += sg.d;
    }
    g.linearRampToValueAtTime(0, t + 0.012);
    const stop = t + 0.03;
    o.start(start); o.stop(stop);
    fm.start(start); fm.stop(stop);
    if (ring) { ring.start(start); ring.stop(stop); }
    this.busyUntil = t + 0.1;
  }
}
