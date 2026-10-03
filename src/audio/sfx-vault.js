// Effets sonores procéduraux du minijeu BRAQUAGE DU COFFRE (fusionnés dans SFX par sfx.js).
// Chaque fonction reçoit le moteur (A) puis ses paramètres ; catégorie de polyphonie 'mg'.

const nf = (m) => 440 * Math.pow(2, (m - 69) / 12);

export const SFX_VAULT = {
  // assemblage d'un coffre : pênes qui claquent un à un, servo, verrou final
  vaultAssemble(A, rings = 2) {
    const t = A.now, o = A.out(0, null, 0.3);
    A.tone({ type: 'sawtooth', f: 70, f2: 140, dur: 0.9, gain: 0.05, filter: 'lowpass', ff: 500, ff2: 1400, dest: o });
    for (let k = 0; k < 4 + rings * 2; k++) {
      const tk = t + 0.12 + k * 0.1;
      A.noise({ f: 2400 + k * 120, q: 4, dur: 0.03, gain: 0.12, t: tk, dest: o });
      A.tone({ f: 260 - k * 8, f2: 120, dur: 0.05, gain: 0.12, t: tk, dest: o });
    }
    const tl = t + 0.2 + (4 + rings * 2) * 0.1;
    A.tone({ f: 95, f2: 48, dur: 0.3, gain: 0.35, t: tl, dest: o });
    A.noise({ f: 900, q: 1.2, dur: 0.12, gain: 0.2, t: tl, dest: o });
  },

  // coffre armé : double bip de sécurité
  vaultArmed(A) {
    const t = A.now, o = A.out(0, null, 0.2);
    A.tone({ type: 'square', f: nf(81), dur: 0.07, gain: 0.03, filter: 'lowpass', ff: 3000, t, dest: o });
    A.tone({ type: 'square', f: nf(88), dur: 0.1, gain: 0.03, filter: 'lowpass', ff: 3000, t: t + 0.09, dest: o });
  },

  // impact sur une plaque (fissure) : choc blindé sourd + tintement métallique
  vaultCrack(A, pan = 0, k = 1) {
    if (!A.claim('mg', 0.2, 2)) return;
    const o = A.out(pan * 0.5, null, 0.15);
    A.tone({ f: 150 - k * 20, f2: 60, dur: 0.12, gain: 0.32, dest: o });
    A.noise({ f: 3800, q: 3, dur: 0.05, gain: 0.16, dest: o });
    A.bell({ f: nf(76 - k * 3), dur: 0.35, gain: 0.05, ratio: 2.76, index: 1.6, dest: o });
    A.noise({ f: 6500, f2: 2000, q: 1.5, dur: 0.18, gain: 0.05, dest: o });
  },

  // plaque arrachée : déchirure métallique, coup de boutoir, éclats
  vaultBreak(A, pan = 0, k = 1) {
    if (!A.claim('mg', 0.4, 3)) return;
    const t = A.now, o = A.out(pan * 0.5, null, 0.3);
    A.tone({ f: 110 - k * 12, f2: 34, dur: 0.32, gain: 0.45, dest: o });
    A.noise({ f: 2600, f2: 300, q: 0.8, filter: 'lowpass', dur: 0.35, gain: 0.3, dest: o });
    A.tone({ type: 'sawtooth', f: 900, f2: 120, dur: 0.22, gain: 0.05, filter: 'bandpass', ff: 1500, q: 3, dest: o });
    for (let i = 0; i < 4; i++) A.noise({ f: 5000 + i * 900, q: 6, dur: 0.03, gain: 0.08, t: t + 0.06 + i * 0.05, dest: o });
    A.bell({ f: nf(70 - k * 2), t: t + 0.02, dur: 0.5, gain: 0.05, ratio: 1.41, index: 3, dest: o });
  },

  // forçage (bille enfermée) : foreuse qui monte puis claquement
  vaultDrill(A, pan = 0) {
    if (!A.claim('mg', 0.5, 2)) return;
    const t = A.now, o = A.out(pan * 0.5, null, 0.2);
    A.tone({ type: 'sawtooth', f: 180, f2: 900, dur: 0.3, gain: 0.05, filter: 'bandpass', ff: 1200, q: 2, dest: o });
    A.noise({ f: 3000, f2: 7000, q: 4, dur: 0.3, gain: 0.08, dest: o });
    A.tone({ f: 120, f2: 40, dur: 0.25, gain: 0.35, t: t + 0.28, dest: o });
    A.noise({ f: 1800, f2: 200, q: 0.7, filter: 'lowpass', dur: 0.25, gain: 0.22, t: t + 0.28, dest: o });
  },

  // frottement de la bille contre un anneau qui tourne
  vaultGrind(A, pan = 0) {
    if (!A.throttle('vaultGrind', 0.09)) return;
    if (!A.claim('mg', 0.1, 0)) return;
    const o = A.out(pan * 0.5);
    A.noise({ f: 4200 + Math.random() * 1500, q: 5, dur: 0.08, gain: 0.05, dest: o });
    A.tone({ type: 'square', f: 1900 + Math.random() * 400, dur: 0.04, gain: 0.008, dest: o });
  },

  // alignement des brèches : verrouillage du laser de visée
  vaultAlign(A) {
    if (!A.throttle('vaultAlign', 0.8)) return;
    const t = A.now, o = A.out(0, null, 0.25);
    A.tone({ type: 'sawtooth', f: 400, f2: 1600, dur: 0.16, gain: 0.03, filter: 'lowpass', ff: 3000, dest: o });
    [84, 91].forEach((m, k) => A.tone({ type: 'square', f: nf(m), t: t + 0.12 + k * 0.08, dur: 0.07, gain: 0.03, filter: 'lowpass', ff: 4000, dest: o }));
  },

  // COFFRE PERCÉ : détonation, sirène brève, cascade de pièces
  vaultPierce(A, jackpot = false) {
    const t = A.now, o = A.out(0, null, 0.55);
    A.tone({ f: 70, f2: 24, dur: 0.9, gain: 0.55, dest: o });
    A.noise({ f: 6000, f2: 150, q: 0.6, filter: 'lowpass', dur: 0.8, gain: 0.35, dest: o });
    A.tone({ type: 'sawtooth', f: 220, f2: 1760, glide: 0.2, dur: 0.24, gain: 0.04, filter: 'lowpass', ff: 3500, t: t + 0.05, dest: o });
    const n = jackpot ? 16 : 10;
    for (let i = 0; i < n; i++) {
      const tk = t + 0.18 + i * 0.045 + Math.random() * 0.02;
      A.bell({ f: nf(88 + (i % 5) * 2 + (i > 8 ? 5 : 0)), t: tk, dur: 0.25, gain: 0.045, ratio: 3.01, index: 1.2, dest: o });
    }
    for (const m of [64, 68, 71, 76]) A.tone({ type: 'sawtooth', f: nf(m), t: t + 0.25, dur: 0.6, gain: 0.03, filter: 'lowpass', ff: 900, ff2: 4500, fglide: 0.15, dest: o });
  },

  // jackpot du coffre : fanfare cuivrée sur l'accord de la musique
  vaultJackpot(A) {
    const t = A.now, o = A.out(0, null, 0.6);
    const ch = A.music.currentChord();
    for (const f of [...ch, ch[0] * 2]) {
      A.tone({ type: 'sawtooth', f: f * 2, t: t + 0.35, dur: 1.1, gain: 0.06, filter: 'lowpass', ff: 700, ff2: 5200, fglide: 0.1, dest: o });
      A.tone({ type: 'sawtooth', f: f * 2 * 1.007, t: t + 0.35, dur: 1.1, gain: 0.04, filter: 'lowpass', ff: 700, ff2: 4200, fglide: 0.1, dest: o });
    }
    [0, 1, 2, 3, 4].forEach(k => A.bell({ f: ch[k % ch.length] * 4 * (k > 2 ? 2 : 1), t: t + 0.35 + k * 0.07, dur: 0.8, gain: 0.06, dest: o }));
  },

  // butin ramassé : pièce (aiguë) ou lingot (cloche grave) ; la hauteur monte avec la rafle
  vaultCoin(A, bar = false, chain = 1, pan = 0) {
    if (!A.claim('mg', 0.25, 2)) return;
    const t = A.now, o = A.out(pan * 0.5, null, 0.25);
    const up = Math.min(12, (chain - 1) * 2);
    if (bar) {
      A.bell({ f: nf(76 + up), dur: 0.5, gain: 0.08, ratio: 2.0, index: 2.2, dest: o });
      A.bell({ f: nf(83 + up), t: t + 0.06, dur: 0.45, gain: 0.06, ratio: 2.0, index: 2.2, dest: o });
      A.tone({ f: 180, f2: 90, dur: 0.12, gain: 0.15, dest: o });
    } else {
      A.tone({ type: 'square', f: nf(88 + up), dur: 0.05, gain: 0.03, filter: 'lowpass', ff: 6000, dest: o });
      A.tone({ type: 'square', f: nf(95 + up), t: t + 0.05, dur: 0.12, gain: 0.03, filter: 'lowpass', ff: 6000, dest: o });
      A.noise({ f: 8000, q: 3, dur: 0.04, gain: 0.04, dest: o });
    }
  },
};
