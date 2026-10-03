// Effets sonores procéduraux du minijeu SINGULARITÉ (fusionnés dans SFX par sfx.js).
// Chaque fonction reçoit le moteur (A) puis ses paramètres ; catégorie de polyphonie 'mg'.

const nf = (m) => 440 * Math.pow(2, (m - 69) / 12);
// gamme pentatonique (ré) : les récoltes enchaînées montent
const PENTA = [62, 64, 66, 69, 71, 74, 76, 78, 81, 83, 86, 88];

export const SFX_SINGULARITY = {
  // récolte d'une cellule : tintement cristallin, plus aigu à chaque cellule enchaînée ;
  // orbite intérieure (tier 0) : double cloche plus riche
  sgCell(A, pan = 0, tier = 2, combo = 1) {
    if (!A.claim('mg', 0.3, 2)) return;
    const t = A.now, o = A.out(pan * 0.6, null, 0.3);
    const m = PENTA[Math.min(PENTA.length - 1, (combo - 1) + (2 - tier) * 2)];
    A.bell({ f: nf(m + 12), dur: 0.5, gain: 0.08, ratio: 3.5, index: 1.6, dest: o });
    A.tone({ type: 'triangle', f: nf(m + 24), dur: 0.12, gain: 0.04, dest: o });
    A.noise({ f: 9000, q: 3, dur: 0.06, gain: 0.05, dest: o });
    if (tier === 0) {
      A.bell({ f: nf(m + 19), t: t + 0.06, dur: 0.6, gain: 0.07, ratio: 2.01, index: 2, dest: o });
      A.tone({ type: 'sawtooth', f: nf(m), f2: nf(m + 12), glide: 0.12, dur: 0.18, gain: 0.025, filter: 'lowpass', ff: 3000, dest: o });
    }
  },

  // nouvelle cellule matérialisée sur son orbite (discret)
  sgSpawn(A, pan = 0) {
    if (!A.throttle('sgSpawn', 0.25) || !A.claim('mg', 0.12, 0)) return;
    const o = A.out(pan * 0.5, null, 0.25);
    A.tone({ f: 700, f2: 1400, dur: 0.12, gain: 0.02, dest: o });
  },

  // repères de la fronde en préparation (150°, 210°, 270°) : trois notes qui montent
  sgCharge(A, step = 1) {
    if (!A.claim('mg', 0.15, 1)) return;
    const o = A.out(0, null, 0.2);
    const m = [0, 74, 78, 81][step] || 81;
    A.tone({ type: 'square', f: nf(m), dur: 0.09, gain: 0.025, filter: 'lowpass', ff: 2600, dest: o });
    A.tone({ f: nf(m + 12), dur: 0.12, gain: 0.03, dest: o });
  },

  // FRONDE : souffle qui monte, coup de fouet, accord majeur éclatant
  sgFronde(A) {
    const t = A.now, o = A.out(0, null, 0.55);
    A.noise({ f: 400, f2: 7000, q: 2, dur: 0.32, gain: 0.12, dest: o });
    A.tone({ type: 'sawtooth', f: 160, f2: 1900, glide: 0.3, dur: 0.32, gain: 0.05, filter: 'lowpass', ff: 1200, ff2: 6000, fglide: 0.3, dest: o });
    A.noise({ f: 3000, q: 0.7, filter: 'highpass', dur: 0.08, gain: 0.18, t: t + 0.3, dest: o });
    for (const m of [62, 69, 74, 78, 81]) A.tone({ type: 'sawtooth', f: nf(m), t: t + 0.3, dur: 0.9, gain: 0.035, filter: 'lowpass', ff: 1400, ff2: 5200, fglide: 0.2, dest: o });
    A.bell({ f: nf(86), t: t + 0.32, dur: 1.1, gain: 0.09, ratio: 1.41, index: 2.5, dest: o });
    A.tone({ f: 90, f2: 45, t: t + 0.3, dur: 0.5, gain: 0.3, dest: o });
  },

  // bille happée : chute grave (aspiration), râle saturé, souffle inversé
  sgCapture(A) {
    const t = A.now, o = A.out(0, null, 0.5);
    A.tone({ f: 220, f2: 26, glide: 0.7, dur: 0.8, gain: 0.45, dest: o });
    A.tone({ type: 'sawtooth', f: 110, f2: 32, glide: 0.6, dur: 0.7, gain: 0.07, filter: 'lowpass', ff: 900, ff2: 120, fglide: 0.6, dest: o });
    A.tone({ type: 'sawtooth', f: 116, f2: 34, glide: 0.6, dur: 0.7, gain: 0.06, filter: 'lowpass', ff: 900, ff2: 120, fglide: 0.6, dest: o });
    A.noise({ f: 6000, f2: 150, q: 0.8, filter: 'lowpass', dur: 0.7, gain: 0.22, dest: o });
    A.noise({ f: 2000, q: 4, dur: 0.05, gain: 0.1, t: t + 0.4, dest: o });
  },

  // bille recrachée : éructation d'énergie, éclat montant
  sgSpit(A, pan = 0) {
    const t = A.now, o = A.out(pan, null, 0.35);
    A.noise({ f: 250, f2: 3500, q: 1.2, dur: 0.22, gain: 0.25, dest: o });
    A.tone({ f: 70, f2: 160, dur: 0.18, gain: 0.35, dest: o });
    A.tone({ type: 'square', f: 300, f2: 1200, glide: 0.15, dur: 0.17, gain: 0.025, filter: 'lowpass', ff: 3000, t: t + 0.02, dest: o });
  },

  // cellules dispersées : pluie de scintillements
  sgDisperse(A) {
    if (!A.claim('mg', 0.4, 1)) return;
    const t = A.now, o = A.out(0, null, 0.4);
    for (let k = 0; k < 5; k++) A.tone({ type: 'triangle', f: nf(86 - k * 3), t: t + k * 0.05, dur: 0.12, gain: 0.03, dest: o });
  },

  // la singularité grossit : double pulsation infra, sirène, grondement
  sgGrow(A, stage = 1) {
    const t = A.now, o = A.out(0, null, 0.45);
    for (let k = 0; k < 2; k++) A.tone({ f: 58, f2: 38, t: t + k * 0.32, dur: 0.3, gain: 0.5, dest: o });
    A.noise({ f: 160, q: 0.7, filter: 'lowpass', dur: 1.1, gain: 0.3, dest: o, pink: true });
    const base = 70 + stage * 2;
    for (let k = 0; k < 2; k++) {
      A.tone({ type: 'sawtooth', f: nf(base), f2: nf(base - 5), t: t + 0.1 + k * 0.42, dur: 0.38, gain: 0.04, filter: 'lowpass', ff: 2200, dest: o });
    }
  },

  // champ saturé : la singularité relâche la bille (descente molle)
  sgSaturate(A) {
    if (!A.throttle('sgSat', 1)) return;
    const o = A.out(0, null, 0.3);
    A.tone({ type: 'triangle', f: 520, f2: 90, glide: 0.5, dur: 0.55, gain: 0.05, dest: o });
    A.noise({ f: 1200, f2: 200, q: 1, dur: 0.5, gain: 0.06, dest: o });
  },

  // champ de confinement : rebond énergétique sur l'horizon
  sgConfine(A, pan = 0) {
    if (!A.claim('mg', 0.2, 2)) return;
    const o = A.out(pan * 0.5, null, 0.3);
    A.tone({ type: 'square', f: 440, f2: 1760, glide: 0.08, dur: 0.12, gain: 0.03, filter: 'lowpass', ff: 3500, dest: o });
    A.tone({ type: 'triangle', f: 2400, f2: 3200, dur: 0.18, gain: 0.04, dest: o });
    A.noise({ f: 7000, q: 5, dur: 0.12, gain: 0.06, dest: o });
  },

  // STABILISATION : sirène montante et accord en crescendo
  sgStabilize(A) {
    const t = A.now, o = A.out(0, null, 0.55);
    A.tone({ type: 'sawtooth', f: 220, f2: 880, glide: 0.8, dur: 0.85, gain: 0.04, filter: 'lowpass', ff: 1500, ff2: 4000, fglide: 0.8, dest: o });
    for (const m of [50, 57, 62, 66, 69]) A.tone({ type: 'sawtooth', f: nf(m), t: t + 0.6, a: 0.3, dur: 1.4, gain: 0.035, filter: 'lowpass', ff: 700, ff2: 3500, fglide: 0.9, dest: o });
    A.tone({ f: 55, t: t + 0.6, a: 0.2, dur: 1.2, gain: 0.35, dest: o });
  },

  // frappe intermédiaire sur l'anneau de confinement : gong métallique + verrou
  sgRing(A, n = 1) {
    const t = A.now, o = A.out(0, null, 0.45);
    A.tone({ f: 95, f2: 42, dur: 0.4, gain: 0.45, dest: o });
    A.bell({ f: nf(74 + n * 5), dur: 0.9, gain: 0.11, ratio: 1.41, index: 3, dest: o });
    A.noise({ f: 3500, f2: 500, q: 1, dur: 0.3, gain: 0.15, dest: o });
    A.tone({ type: 'square', f: nf(86), t: t + 0.12, dur: 0.06, gain: 0.03, dest: o });
    A.tone({ type: 'square', f: nf(93), t: t + 0.2, dur: 0.08, gain: 0.03, dest: o });
  },

  // implosion : tout est aspiré (montée inversée), silence, puis déflagration et accord final
  sgImplode(A) {
    const t = A.now, o = A.out(0, null, 0.7);
    A.noise({ f: 200, f2: 9000, q: 1.5, a: 1.0, dur: 1.2, gain: 0.25, dest: o });
    A.tone({ type: 'sawtooth', f: 900, f2: 60, glide: 1.2, a: 0.6, dur: 1.2, gain: 0.05, filter: 'lowpass', ff: 3000, dest: o });
    A.tone({ f: 40, f2: 20, a: 0.8, dur: 1.2, gain: 0.3, dest: o });
    const b = t + 1.27;
    A.noise({ f: 9000, f2: 120, q: 0.6, filter: 'lowpass', dur: 1.4, gain: 0.45, t: b, dest: o });
    A.tone({ f: 70, f2: 22, dur: 1.4, gain: 0.6, t: b, dest: o });
    for (const m of [62, 69, 74, 78, 81, 86]) A.tone({ type: 'sawtooth', f: nf(m), t: b + 0.05, dur: 1.8, gain: 0.03, filter: 'lowpass', ff: 1200, ff2: 6000, fglide: 0.4, dest: o });
    A.bell({ f: nf(93), t: b + 0.1, dur: 1.6, gain: 0.1, ratio: 1.5, index: 2, dest: o });
  },
};
