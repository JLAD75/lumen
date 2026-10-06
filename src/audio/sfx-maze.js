// Effets sonores procéduraux du minijeu LABYRINTHE GYROSCOPIQUE (fusionnés dans SFX par sfx.js).
// Chaque fonction reçoit le moteur (A) puis ses paramètres ; catégorie de polyphonie 'mg'.

const nf = (m) => 440 * Math.pow(2, (m - 69) / 12);

export const SFX_MAZE = {
  // rotation de la gravité : petit servo dont la hauteur suit la vitesse de rotation
  mazeTilt(A, dir = 1, k = 0.5) {
    if (!A.claim('mg', 0.15, 0.2)) return;
    const t = A.now, o = A.out(dir * 0.4, null, 0.05);
    const f = 140 + 120 * k;
    A.tone({ type: 'sawtooth', f, f2: f * (dir > 0 ? 1.08 : 0.93), t, dur: 0.13, gain: 0.018, filter: 'lowpass', ff: 900, dest: o });
  },

  // frein magnétique : claquement et bourdonnement bref
  mazeBrake(A) {
    if (!A.throttle('mazeBrake', 0.3) || !A.claim('mg', 0.2, 0.5)) return;
    const t = A.now, o = A.out(0, null, 0.1);
    A.noise({ f: 2400, q: 3, t, dur: 0.04, gain: 0.08, dest: o });
    A.tone({ type: 'square', f: 110, t, dur: 0.16, gain: 0.03, filter: 'lowpass', ff: 600, dest: o });
  },

  // clé ramassée : arpège qui monte avec le nombre de clés
  mazeKey(A, n = 1) {
    const t = A.now, o = A.out(0, null, 0.4);
    [76, 81, 84].forEach((m, k) => A.bell({ f: nf(m + 2 * n), t: t + k * 0.06, dur: 0.45, gain: 0.07, dest: o }));
  },

  // chute dans une trappe : sifflement descendant puis choc sourd
  mazeFall(A) {
    const t = A.now, o = A.out(0, null, 0.35);
    A.tone({ f: 900, f2: 90, t, dur: 0.5, gain: 0.12, dest: o });
    A.noise({ f: 2000, f2: 200, filter: 'bandpass', q: 2, t, dur: 0.45, gain: 0.06, dest: o });
    A.tone({ f: 80, f2: 40, t: t + 0.48, dur: 0.25, gain: 0.25, dest: o });
  },

  // retour à la balise : rematérialisation
  mazeRespawn(A) {
    const t = A.now, o = A.out(0, null, 0.3);
    A.tone({ type: 'triangle', f: 300, f2: 900, t, dur: 0.22, gain: 0.07, dest: o });
  },

  // balise activée : bip double
  mazeCheck(A) {
    const t = A.now, o = A.out(0, null, 0.2);
    A.tone({ type: 'square', f: nf(79), t, dur: 0.07, gain: 0.035, filter: 'lowpass', ff: 3500, dest: o });
    A.tone({ type: 'square', f: nf(86), t: t + 0.08, dur: 0.12, gain: 0.035, filter: 'lowpass', ff: 3500, dest: o });
  },

  // flèche d'accélération : souffle montant
  mazeBoost(A) {
    if (!A.claim('mg', 0.25, 0.8)) return;
    const t = A.now, o = A.out(0, null, 0.2);
    A.noise({ f: 500, f2: 3500, filter: 'bandpass', q: 1.5, t, dur: 0.25, gain: 0.08, dest: o });
    A.tone({ f: 200, f2: 600, t, dur: 0.2, gain: 0.06, dest: o });
  },

  // capsule +5 s : carillon bref
  mazeCapsule(A) {
    const t = A.now, o = A.out(0, null, 0.3);
    A.bell({ f: nf(88), t, dur: 0.35, gain: 0.07, dest: o });
    A.bell({ f: nf(93), t: t + 0.07, dur: 0.4, gain: 0.06, dest: o });
  },

  // porte laser : fermeture (bourdonnement qui monte) ou ouverture (qui retombe)
  mazeDoor(A, closing = 1) {
    if (!A.throttle('mazeDoor', 0.1) || !A.claim('mg', 0.2, 0.4)) return;
    const t = A.now, o = A.out(0, null, 0.15);
    A.tone({ type: 'sawtooth', f: closing ? 180 : 360, f2: closing ? 360 : 180, t, dur: 0.18, gain: 0.025, filter: 'lowpass', ff: 1500, dest: o });
  },

  // sortie ouverte : fanfare de sas
  mazeExitOpen(A) {
    const t = A.now, o = A.out(0, null, 0.45);
    A.noise({ f: 300, f2: 2400, filter: 'bandpass', q: 1, t, dur: 0.5, gain: 0.08, dest: o });
    [72, 79, 84, 88].forEach((m, k) => A.tone({ type: 'square', f: nf(m), t: t + 0.1 + k * 0.08, dur: 0.2, gain: 0.03, filter: 'lowpass', ff: 3800, dest: o }));
  },

  // victoire : aspiration par le sas et accord final
  mazeWin(A) {
    const t = A.now, o = A.out(0, null, 0.5);
    A.tone({ type: 'sawtooth', f: 100, f2: 1600, t, dur: 0.6, gain: 0.07, filter: 'lowpass', ff: 2800, dest: o });
    [72, 76, 79, 84].forEach((m) => A.bell({ f: nf(m), t: t + 0.55, dur: 0.9, gain: 0.05, dest: o }));
  },
};
