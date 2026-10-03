// Effets sonores procéduraux du minijeu FRESQUE NÉON (fusionnés dans SFX par sfx.js).
// Chaque fonction reçoit le moteur (A) puis ses paramètres ; pan ∈ [-1, 1].
// Signature sonore : le « pschit » d'aérosol (bruit filtré aigu) et le cliquetis de la
// bille de mélange qui secoue la bombe.

const nf = (m) => 440 * Math.pow(2, (m - 69) / 12);
const rnd = (a, b) => a + Math.random() * (b - a);

// cliquetis de la bille de mélange (bombe qu'on secoue)
function rattle(A, t, o, n = 4, gap = 0.075, gain = 0.2) {
  for (let k = 0; k < n; k++) {
    const tk = t + k * gap + rnd(0, 0.012);
    A.noise({ f: rnd(2600, 3400), q: 7, dur: 0.018, gain: gain * (k % 2 ? 0.75 : 1), t: tk, dest: o });
    A.tone({ type: 'triangle', f: rnd(1900, 2300), dur: 0.025, gain: gain * 0.12, t: tk, dest: o });
  }
}

// « pschiiit » : souffle d'aérosol (bruit passe-haut qui s'ouvre puis se referme)
function hiss(A, t, o, dur, gain, f0 = 5200, f1 = 7600) {
  A.noise({ filter: 'highpass', f: f0, f2: f1, q: 0.7, a: 0.02, dur, gain, t, dest: o });
  A.noise({ f: 9000, q: 1.5, a: 0.03, dur: dur * 0.8, gain: gain * 0.5, t, dest: o });
}

export const SFX_GRAFFITI = {
  // pulvérisation continue (appelée ~9 fois/s tant que la bille peint du neuf)
  tagSpray(A, pan = 0, amount = 0.5, aerosol = false) {
    if (!A.claim('mg', 0.12, 0)) return;
    const o = A.out(pan * 0.6, null, 0.04);
    const g = (aerosol ? 0.1 : 0.06) * (0.4 + 0.6 * amount);
    A.noise({ filter: 'highpass', f: aerosol ? 3600 : rnd(5200, 6400), q: 0.6, a: 0.015, dur: 0.14, gain: g, dest: o });
    if (aerosol) A.noise({ f: 1400, q: 0.8, a: 0.02, dur: 0.12, gain: g * 0.5, dest: o });
  },

  // bombe de peinture percutée : « splat » humide + bloop accordé + pschit
  tagSplash(A, pan = 0, i = 0) {
    if (!A.claim('mg', 0.3, 2)) return;
    const t = A.now, o = A.out(pan * 0.55, null, 0.22);
    const base = [nf(72), nf(76), nf(79)][i % 3] * rnd(0.98, 1.02);
    A.tone({ f: 150, f2: 55, dur: 0.12, gain: 0.32, dest: o });
    A.noise({ filter: 'lowpass', f: 1800, f2: 260, q: 1.2, dur: 0.16, gain: 0.3, dest: o });
    A.tone({ f: base * 1.5, f2: base * 0.7, glide: 0.09, dur: 0.12, gain: 0.09, dest: o });
    A.tone({ type: 'triangle', f: base * 2, dur: 0.18, gain: 0.03, t: t + 0.02, dest: o });
    hiss(A, t + 0.03, o, 0.22, 0.07);
  },

  // matérialisation des drones nettoyeurs
  tagDroneWarp(A) {
    const t = A.now, o = A.out(0, null, 0.3);
    A.tone({ type: 'triangle', f: 220, f2: 1320, dur: 0.35, gain: 0.08, dest: o });
    A.noise({ f: 900, f2: 5200, q: 5, dur: 0.3, gain: 0.07, dest: o });
    for (let k = 0; k < 3; k++) A.tone({ type: 'square', f: 880, t: t + 0.4 + k * 0.12, dur: 0.05, gain: 0.02, filter: 'lowpass', ff: 2400, dest: o });
  },

  // raclette qui efface la peinture : couinement mouillé (étranglé)
  tagScrub(A, pan = 0) {
    if (!A.throttle('tagScrub', 0.26) || !A.claim('mg', 0.12, 0)) return;
    const o = A.out(pan * 0.6, null, 0.05);
    const f = rnd(1500, 2100);
    A.tone({ type: 'triangle', f, f2: f * rnd(1.15, 1.35), dur: 0.09, gain: 0.04, dest: o });
    A.noise({ f: 2600, f2: 1600, q: 3, dur: 0.1, gain: 0.08, dest: o });
  },

  // drone percuté : « bonk » métallique, étincelles, sifflet de tournis
  tagDroneStun(A, pan = 0) {
    if (!A.claim('mg', 0.4, 3)) return;
    const t = A.now, o = A.out(pan * 0.55, null, 0.3);
    A.tone({ f: 420, f2: 160, dur: 0.12, gain: 0.25, dest: o });
    for (const [m, k] of [[1, 1], [2.7, 0.5], [4.1, 0.3]]) A.tone({ f: 640 * m, dur: 0.2, gain: 0.05 * k, dest: o });
    A.noise({ f: 6000, q: 1, dur: 0.06, gain: 0.12, dest: o });
    A.tone({ type: 'sine', f: 1500, f2: 500, glide: 0.5, dur: 0.55, gain: 0.04, t: t + 0.08, dest: o });
    A.tone({ type: 'triangle', f: 1200, f2: 380, glide: 0.5, dur: 0.55, gain: 0.025, t: t + 0.14, dest: o });
    hiss(A, t + 0.02, o, 0.18, 0.06);
  },

  // drone qui reprend ses esprits : moteur qui remonte
  tagDroneWake(A, pan = 0) {
    if (!A.claim('mg', 0.3, 0)) return;
    const o = A.out(pan * 0.55, null, 0.1);
    A.tone({ type: 'sawtooth', f: 90, f2: 240, dur: 0.35, gain: 0.04, filter: 'lowpass', ff: 700, ff2: 2000, dest: o });
  },

  // capsule AÉROSOL qui apparaît : on secoue la bombe
  tagCapsule(A, pan = 0) {
    const t = A.now, o = A.out(pan * 0.5, null, 0.2);
    rattle(A, t, o, 5, 0.07, 0.42);
    A.bell({ f: nf(88), t: t + 0.36, dur: 0.4, gain: 0.09, dest: o });
  },

  // capsule ramassée : cliquetis, long pschiiit, arpège montant
  tagAerosol(A) {
    const t = A.now, o = A.out(0, null, 0.3);
    rattle(A, t, o, 3, 0.06, 0.42);
    hiss(A, t + 0.16, o, 0.65, 0.14, 3800, 8200);
    [72, 76, 79, 84, 88].forEach((m, k) => A.tone({ type: 'square', f: nf(m), t: t + 0.18 + k * 0.05, dur: 0.12, gain: 0.03, filter: 'lowpass', ff: 3800, dest: o }));
  },

  // palier de couverture franchi (n = 1 : 25 %, n = 2 : 50 %)
  tagMilestone(A, n = 1) {
    const t = A.now, o = A.out(0, null, 0.4);
    const root = n >= 2 ? 67 : 64;
    [0, 4, 7, 12, 16].forEach((d, k) => A.tone({ type: 'sawtooth', f: nf(root + d), t: t + k * 0.06, dur: 0.22, gain: 0.045, filter: 'lowpass', ff: 3200, dest: o }));
    A.bell({ f: nf(root + 24), t: t + 0.3, dur: 0.8, gain: 0.11, dest: o });
    hiss(A, t, o, 0.4, 0.08);
    rattle(A, t + 0.3, o, 2, 0.06, 0.12);
  },

  // fresque achevée : grand accord, longue pulvérisation, pluie de clochettes
  tagWin(A) {
    const t = A.now, o = A.out(0, null, 0.6);
    for (const m of [60, 64, 67, 71, 76]) A.tone({ type: 'sawtooth', f: nf(m), t: t + 0.05, dur: 1.4, gain: 0.03, filter: 'lowpass', ff: 700, ff2: 5200, fglide: 0.5, dest: o });
    A.tone({ f: 65, f2: 32, dur: 1.0, gain: 0.4, dest: o });
    hiss(A, t, o, 1.1, 0.12, 2600, 9000);
    for (let k = 0; k < 8; k++) A.bell({ f: nf(84 + [0, 4, 7, 12, 7, 12, 16, 19][k]), t: t + 0.35 + k * 0.08, dur: 0.6, gain: 0.05, dest: o });
  },

  // LUMEN signe l'œuvre : griffonnage du marqueur, puis petite note
  tagSign(A) {
    const t = A.now, o = A.out(0.4, null, 0.2);
    for (let k = 0; k < 9; k++) {
      const tk = t + k * 0.13 + rnd(0, 0.04);
      A.noise({ f: rnd(2200, 4200), f2: rnd(1800, 5000), q: 4, a: 0.01, dur: rnd(0.06, 0.11), gain: 0.12, t: tk, dest: o });
    }
    A.bell({ f: nf(91), t: t + 1.3, dur: 0.9, gain: 0.07, dest: o });
    A.bell({ f: nf(96), t: t + 1.42, dur: 0.9, gain: 0.05, dest: o });
  },
};
