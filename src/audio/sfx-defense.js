// Effets sonores procéduraux du minijeu DÉFENSE DE LA STATION (fusionnés dans SFX).
// Chaque fonction reçoit le moteur (A) puis ses paramètres ; catégorie de polyphonie 'mg'.

const nf = (m) => 440 * Math.pow(2, (m - 69) / 12);

export const SFX_DEFENSE = {
  // impact sur une tourelle : clac mécanique + montée de charge (plus aiguë à chaque tourelle armée)
  defTurretHit(A, pan = 0, lit = 1) {
    if (!A.claim('mg', 0.16, 2)) return;
    const o = A.out(pan * 0.5, null, 0.12);
    A.noise({ f: 2600, q: 2.2, dur: 0.035, gain: 0.2, dest: o });
    A.tone({ f: 210, f2: 85, dur: 0.08, gain: 0.3, dest: o });
    A.tone({ type: 'sawtooth', f: nf(62 + lit * 5), f2: nf(74 + lit * 5), glide: 0.09, dur: 0.13, gain: 0.04, filter: 'lowpass', ff: 2600, dest: o });
  },

  // tir de tourelle (rayon) : claquement aigu, chute en dents de scie, coup sourd
  defTurretFire(A, pan = 0, power = 1) {
    if (!A.claim('mg', 0.2, 2)) return;
    const t = A.now, o = A.out(pan * 0.6, null, 0.22);
    A.noise({ f: 5500, q: 0.8, filter: 'highpass', dur: 0.05, gain: 0.14, dest: o });
    A.tone({ type: 'sawtooth', f: 2600, f2: 170, glide: 0.16, dur: 0.18, gain: 0.06, filter: 'lowpass', ff: 5000, ff2: 600, dest: o });
    A.tone({ type: 'square', f: 1300, f2: 90, glide: 0.12, dur: 0.13, gain: 0.022, dest: o });
    A.tone({ f: 115, f2: 45, dur: 0.16, gain: 0.28, dest: o });
    if (power > 1) A.tone({ type: 'sawtooth', f: 3600, f2: 380, dur: 0.22, gain: 0.04, filter: 'bandpass', ff: 2600, q: 3, t: t + 0.02, dest: o });
  },

  // SALVE : trois tirs en rafale, accord de cuivres synthétiques, onde de choc grave
  defSalvo(A) {
    const t = A.now, o = A.out(0, null, 0.55);
    for (let k = 0; k < 3; k++) {
      A.noise({ f: 6000, q: 0.8, filter: 'highpass', dur: 0.05, gain: 0.12, t: t + k * 0.08, dest: o });
      A.tone({ type: 'sawtooth', f: 2400 - k * 300, f2: 160, glide: 0.15, dur: 0.17, gain: 0.05, filter: 'lowpass', ff: 4500, t: t + k * 0.08, dest: o });
    }
    for (const m of [64, 71, 76, 83]) A.tone({ type: 'sawtooth', f: nf(m), t: t + 0.22, dur: 0.7, gain: 0.04, filter: 'lowpass', ff: 900, ff2: 5000, fglide: 0.15, dest: o });
    A.tone({ f: 70, f2: 26, dur: 0.9, gain: 0.5, t: t + 0.2, dest: o });
    A.noise({ f: 2400, f2: 120, q: 0.6, filter: 'lowpass', dur: 0.8, gain: 0.25, t: t + 0.2, dest: o });
  },

  // bouclier d'un drone qui encaisse : scintillement vitreux + bourdonnement
  defShield(A, pan = 0) {
    if (!A.claim('mg', 0.18, 1)) return;
    const o = A.out(pan * 0.5, null, 0.25);
    A.tone({ type: 'triangle', f: 1800, f2: 2600, dur: 0.12, gain: 0.05, dest: o });
    A.tone({ type: 'sawtooth', f: 96, dur: 0.18, gain: 0.05, filter: 'bandpass', ff: 700, q: 4, dest: o });
    A.noise({ f: 7000, q: 5, dur: 0.1, gain: 0.07, dest: o });
  },

  // point faible du porte-drones touché : gong métallique + cloche
  defWeakPoint(A) {
    const o = A.out(0, null, 0.4);
    A.tone({ f: 90, f2: 40, dur: 0.35, gain: 0.4, dest: o });
    A.bell({ f: nf(81), dur: 0.7, gain: 0.1, ratio: 1.41, index: 3, dest: o });
    A.noise({ f: 3000, f2: 400, q: 1, dur: 0.25, gain: 0.15, dest: o });
  },

  // klaxon d'alerte du porte-drones (deux tons descendants)
  defCarrierAlarm(A) {
    if (!A.throttle('defCarrier', 2.5)) return;
    const t = A.now, o = A.out(0, null, 0.3);
    for (let k = 0; k < 3; k++) {
      A.tone({ type: 'sawtooth', f: 620, f2: 440, t: t + k * 0.5, dur: 0.42, gain: 0.05, filter: 'lowpass', ff: 1800, dest: o });
      A.tone({ type: 'square', f: 310, f2: 220, t: t + k * 0.5, dur: 0.42, gain: 0.025, filter: 'lowpass', ff: 1200, dest: o });
    }
  },

  // canon orbital : sifflement montant puis décharge massive
  defOrbital(A) {
    const t = A.now, o = A.out(0, null, 0.6);
    A.tone({ type: 'sawtooth', f: 200, f2: 2400, glide: 0.25, dur: 0.28, gain: 0.04, filter: 'lowpass', ff: 3000, dest: o });
    A.noise({ f: 300, f2: 6000, q: 3, dur: 0.26, gain: 0.06, dest: o });
    A.noise({ f: 8000, f2: 300, q: 0.6, filter: 'lowpass', dur: 0.7, gain: 0.3, t: t + 0.26, dest: o });
    A.tone({ f: 60, f2: 24, dur: 0.8, gain: 0.5, t: t + 0.26, dest: o });
    A.tone({ type: 'square', f: 1760, f2: 110, dur: 0.5, gain: 0.03, t: t + 0.26, dest: o });
  },

  // matérialisation d'un drone (téléportation holographique)
  defWarp(A, pan = 0) {
    if (!A.claim('mg', 0.12, 0)) return;
    const o = A.out(pan * 0.6, null, 0.3);
    A.tone({ type: 'triangle', f: 300, f2: 1500, dur: 0.14, gain: 0.03, dest: o });
    A.noise({ f: 1200, f2: 5000, q: 6, dur: 0.12, gain: 0.03, dest: o });
  },

  // drone proche de la ligne : double bip d'alerte
  defWarning(A, pan = 0) {
    if (!A.throttle('defWarn', 0.45)) return;
    const t = A.now, o = A.out(pan * 0.5);
    A.tone({ type: 'square', f: 1480, t, dur: 0.05, gain: 0.03, filter: 'lowpass', ff: 3000, dest: o });
    A.tone({ type: 'square', f: 1480, t: t + 0.09, dur: 0.05, gain: 0.03, filter: 'lowpass', ff: 3000, dest: o });
  },

  // vague repoussée : arpège montant
  defWaveClear(A) {
    const t = A.now, o = A.out(0, null, 0.5);
    [64, 67, 71, 76, 79].forEach((m, k) => A.tone({ type: 'square', f: nf(m), t: t + k * 0.06, dur: 0.16, gain: 0.04, filter: 'lowpass', ff: 3500, dest: o }));
    A.bell({ f: nf(88), t: t + 0.3, dur: 0.9, gain: 0.07, dest: o });
  },
};
