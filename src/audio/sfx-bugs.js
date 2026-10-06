// Effets sonores procéduraux du minijeu CHASSE AUX BUGS (fusionnés dans SFX par sfx.js).
// Chaque fonction reçoit le moteur (A) puis ses paramètres ; catégorie de polyphonie 'mg'.

const nf = (m) => 440 * Math.pow(2, (m - 69) / 12);
const rnd = (a, b) => a + Math.random() * (b - a);

export const SFX_BUGS = {
  // la trappe clignote : deux bips d'alerte
  bugWarn(A, pan = 0) {
    if (!A.throttle('bugWarn', 0.12) || !A.claim('mg', 0.2, 0.5)) return;
    const t = A.now, o = A.out(pan, null, 0.1);
    A.tone({ type: 'square', f: 1320, t, dur: 0.05, gain: 0.03, filter: 'lowpass', ff: 3000, dest: o });
    A.tone({ type: 'square', f: 1320, t: t + 0.1, dur: 0.05, gain: 0.03, filter: 'lowpass', ff: 3000, dest: o });
  },

  // le bug sort : grésillement d'insecte (rafale de petits clics à hauteurs aléatoires)
  bugUp(A, pan = 0, kind = 'normal') {
    if (!A.claim('mg', 0.25, 0.8)) return;
    const t = A.now, o = A.out(pan, null, 0.15);
    const base = kind === 'gold' ? 2600 : kind === 'armor' ? 900 : kind === 'mini' ? 2200 : 1600;
    for (let k = 0; k < 6; k++) A.tone({ type: 'square', f: base * rnd(0.8, 1.3), t: t + k * 0.022, dur: 0.018, gain: 0.025, filter: 'bandpass', ff: base, q: 3, dest: o });
    A.noise({ f: base * 1.5, q: 5, t, dur: 0.14, gain: 0.03, dest: o });
  },

  // écrasé : giclée (bruit grave), craquement de carapace, petit « pop » qui monte avec le combo
  bugSquash(A, pan = 0, mult = 1) {
    if (!A.claim('mg', 0.3, 2)) return;
    const t = A.now, o = A.out(pan, null, 0.25);
    A.noise({ f: 900, f2: 180, filter: 'lowpass', q: 0.8, t, dur: 0.22, gain: 0.22, dest: o });
    A.noise({ f: 4200, q: 2, t, dur: 0.04, gain: 0.12, dest: o });
    A.tone({ f: 260, f2: 70, t, dur: 0.18, gain: 0.25, dest: o });
    A.tone({ type: 'triangle', f: nf(72 + 2 * Math.min(5, mult)), t: t + 0.02, dur: 0.12, gain: 0.08, dest: o });
  },

  // coup sur un bug blindé : « clang » métallique
  bugArmor(A, pan = 0) {
    if (!A.claim('mg', 0.3, 1.5)) return;
    const t = A.now, o = A.out(pan, null, 0.3);
    A.bell({ f: 820, t, dur: 0.35, gain: 0.1, dest: o });
    A.bell({ f: 1230, t, dur: 0.25, gain: 0.06, dest: o });
    A.noise({ f: 3000, q: 3, t, dur: 0.05, gain: 0.1, dest: o });
  },

  // bug doré : carillon montant
  bugGold(A) {
    const t = A.now, o = A.out(0, null, 0.45);
    [84, 88, 91, 96].forEach((m, k) => A.bell({ f: nf(m), t: t + k * 0.06, dur: 0.5, gain: 0.07, dest: o }));
  },

  // il replonge : petite fuite descendante
  bugEscape(A, pan = 0) {
    if (!A.throttle('bugEscape', 0.2) || !A.claim('mg', 0.25, 0.3)) return;
    const t = A.now, o = A.out(pan, null, 0.1);
    A.tone({ type: 'square', f: 900, f2: 260, t, dur: 0.18, gain: 0.025, filter: 'lowpass', ff: 2000, dest: o });
  },

  // combo : note qui monte d'un ton par palier
  bugCombo(A, mult = 2) {
    if (!A.throttle('bugCombo', 0.08)) return;
    const t = A.now, o = A.out(0, null, 0.3);
    A.tone({ type: 'square', f: nf(79 + 2 * mult), t: t + 0.05, dur: 0.1, gain: 0.035, filter: 'lowpass', ff: 4000, dest: o });
    if (mult >= 5) A.tone({ type: 'square', f: nf(91), t: t + 0.13, dur: 0.18, gain: 0.035, filter: 'lowpass', ff: 4500, dest: o });
  },

  // le ver se divise : « bloup » double
  bugSplit(A) {
    const t = A.now, o = A.out(0, null, 0.2);
    A.tone({ f: 300, f2: 700, t, dur: 0.1, gain: 0.12, dest: o });
    A.tone({ f: 300, f2: 700, t: t + 0.11, dur: 0.1, gain: 0.12, dest: o });
  },

  // palier acquis : confirmation à deux notes
  bugPalier(A) {
    const t = A.now, o = A.out(0, null, 0.35);
    A.tone({ type: 'square', f: nf(76), t, dur: 0.1, gain: 0.04, filter: 'lowpass', ff: 3500, dest: o });
    A.tone({ type: 'square', f: nf(83), t: t + 0.11, dur: 0.22, gain: 0.04, filter: 'lowpass', ff: 3500, dest: o });
  },

  // purge : balayage montant puis souffle
  bugPurge(A) {
    const t = A.now, o = A.out(0, null, 0.5);
    A.tone({ type: 'sawtooth', f: 120, f2: 1800, t, dur: 0.7, gain: 0.08, filter: 'lowpass', ff: 3000, dest: o });
    A.noise({ f: 300, f2: 6000, filter: 'bandpass', q: 1.2, t, dur: 0.8, gain: 0.12, dest: o });
    [72, 76, 79, 84].forEach((m, k) => A.bell({ f: nf(m), t: t + 0.55 + k * 0.07, dur: 0.6, gain: 0.06, dest: o }));
  },
};
