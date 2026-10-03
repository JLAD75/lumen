// Effets sonores procéduraux du minijeu CYBERBALL (fusionnés dans SFX par sfx.js).
// Chaque fonction reçoit le moteur (A) puis ses paramètres ; catégorie de polyphonie 'mg'.

const nf = (m) => 440 * Math.pow(2, (m - 69) / 12);
const rnd = (a, b) => a + Math.random() * (b - a);

// coup de sifflet d'arbitre : roulement rapide de deux hauteurs + souffle
function whistle(A, t, dur, o) {
  const n = Math.max(3, Math.round(dur / 0.028));
  for (let k = 0; k < n; k++) {
    A.tone({ f: k % 2 ? 3150 : 2880, t: t + k * 0.028, dur: 0.034, a: 0.003, gain: 0.05, dest: o });
  }
  A.noise({ f: 3000, q: 4, t, dur, a: 0.01, gain: 0.05, dest: o });
}

export const SFX_CYBERBALL = {
  // coup de sifflet (n coups : 2 au coup d'envoi, 1 à l'engagement)
  cbWhistle(A, n = 1) {
    if (!A.throttle('cbWhistle', 0.4)) return;
    const t = A.now, o = A.out(0, null, 0.25);
    if (n >= 2) { whistle(A, t, 0.16, o); whistle(A, t + 0.24, 0.42, o); } else whistle(A, t, 0.3, o);
  },

  // BUT : déflagration, klaxon de stade, fanfare synthétique (cloches en plus pour une lucarne)
  cbGoal(A, lucarne = 0) {
    const t = A.now, o = A.out(0, null, 0.5);
    A.tone({ f: 70, f2: 28, dur: 0.9, gain: 0.55, dest: o });
    A.noise({ f: 6000, f2: 400, q: 0.6, filter: 'lowpass', dur: 0.7, gain: 0.3, dest: o });
    for (const m of [58, 65]) {
      A.tone({ type: 'sawtooth', f: nf(m), t: t + 0.06, dur: 1.1, a: 0.03, gain: 0.07, filter: 'lowpass', ff: 1400, dest: o });
      A.tone({ type: 'sawtooth', f: nf(m) * 1.004, t: t + 0.06, dur: 1.1, a: 0.03, gain: 0.05, filter: 'lowpass', ff: 1100, dest: o });
    }
    [72, 76, 79, 84].forEach((m, k) => A.tone({ type: 'square', f: nf(m), t: t + 0.3 + k * 0.08, dur: 0.22, gain: 0.035, filter: 'lowpass', ff: 3800, dest: o }));
    A.tone({ type: 'square', f: nf(88), t: t + 0.66, dur: 0.6, gain: 0.03, filter: 'lowpass', ff: 4200, dest: o });
    if (lucarne) [91, 96, 100, 103].forEach((m, k) => A.bell({ f: nf(m), t: t + 0.4 + k * 0.07, dur: 0.6, gain: 0.06, dest: o }));
  },

  // clameur de la foule : nappes de bruit rose décalées + sifflets épars
  cbCrowd(A, k = 1) {
    const t = A.now, o = A.out(0, null, 0.6);
    const n = 6 + Math.round(k * 2);
    for (let i = 0; i < n; i++) {
      const d = rnd(1.6, 2.4) * k;
      A.noise({ pink: true, f: rnd(450, 1500), q: rnd(0.6, 1.2), t: t + rnd(0, 0.3), dur: d, a: rnd(0.15, 0.35), gain: 0.07 * Math.min(1.3, k), dest: o });
    }
    A.noise({ pink: true, f: 2600, q: 1.5, t: t + 0.15, dur: 1.8 * k, a: 0.3, gain: 0.04, dest: o });
    for (let i = 0; i < 4; i++) {
      const f = rnd(1800, 2800), s = t + rnd(0.2, 1.4);
      A.tone({ f, f2: f * rnd(1.2, 1.5), t: s, dur: 0.25, glide: 0.18, gain: 0.018, dest: o });
    }
  },

  // « ooooh » du public sur une occasion manquée (formants descendants)
  cbOoh(A) {
    if (!A.throttle('cbOoh', 1.2)) return;
    const t = A.now, o = A.out(0, null, 0.5);
    for (let i = 0; i < 5; i++) {
      const s = t + rnd(0, 0.12);
      A.noise({ pink: true, f: rnd(480, 560), f2: rnd(320, 380), q: 3, t: s, dur: 1.0, a: 0.18, gain: 0.08, dest: o });
      A.noise({ pink: true, f: rnd(850, 950), f2: rnd(640, 720), q: 4, t: s, dur: 0.9, a: 0.2, gain: 0.04, dest: o });
    }
  },

  // poteau : choc métallique inharmonique qui résonne
  cbPost(A, pan = 0, k = 0.6) {
    if (!A.claim('mg', 0.5, 3)) return;
    const o = A.out(pan * 0.6, null, 0.35);
    A.noise({ f: 4200, q: 1.5, dur: 0.04, gain: 0.25, dest: o });
    A.tone({ f: 180, f2: 90, dur: 0.12, gain: 0.3, dest: o });
    A.bell({ f: 880, ratio: 2.76, index: 3.2, dur: 0.9 + k * 0.5, gain: 0.1 + k * 0.06, dest: o });
    A.bell({ f: 1320, ratio: 1.41, index: 2, dur: 0.6, gain: 0.05, dest: o });
  },

  // arrêt du gardien : gants (choc sourd) + bip électronique
  cbSave(A, pan = 0, k = 0.5) {
    if (!A.claim('mg', 0.2, 2)) return;
    const t = A.now, o = A.out(pan * 0.5, null, 0.15);
    A.tone({ f: 150, f2: 55, dur: 0.12, gain: 0.35 + k * 0.15, dest: o });
    A.noise({ f: 900, q: 0.8, filter: 'lowpass', dur: 0.06, gain: 0.25, dest: o });
    A.tone({ type: 'square', f: 660, f2: 440, t: t + 0.05, dur: 0.09, gain: 0.025, filter: 'lowpass', ff: 2500, dest: o });
  },

  // gardien assommé : décharge, crépitement, extinction descendante
  cbStun(A) {
    const t = A.now, o = A.out(0, null, 0.4);
    A.tone({ type: 'sawtooth', f: 1900, f2: 80, glide: 0.4, dur: 0.45, gain: 0.07, filter: 'lowpass', ff: 5000, ff2: 400, dest: o });
    A.noise({ f: 5000, q: 0.7, filter: 'highpass', dur: 0.3, gain: 0.12, dest: o });
    for (let k = 0; k < 6; k++) A.noise({ f: rnd(2500, 7000), q: 6, t: t + 0.05 + k * rnd(0.04, 0.08), dur: 0.03, gain: 0.08, dest: o });
    A.tone({ f: 700, f2: 50, t: t + 0.1, dur: 0.8, glide: 0.75, gain: 0.12, dest: o });
    A.tone({ f: 90, f2: 35, dur: 0.4, gain: 0.35, dest: o });
  },

  // le gardien redémarre
  cbReboot(A) {
    const t = A.now, o = A.out(0, null, 0.2);
    A.tone({ type: 'square', f: 200, f2: 900, glide: 0.3, dur: 0.32, gain: 0.03, filter: 'lowpass', ff: 2400, dest: o });
    A.tone({ type: 'square', f: 1320, t: t + 0.34, dur: 0.06, gain: 0.03, dest: o });
    A.tone({ type: 'square', f: 1760, t: t + 0.42, dur: 0.08, gain: 0.03, dest: o });
  },

  // défenseur percuté : tacle sourd + grésillement
  cbTackle(A, pan = 0) {
    if (!A.claim('mg', 0.12, 1)) return;
    const o = A.out(pan * 0.6, null, 0.1);
    A.tone({ f: 120, f2: 50, dur: 0.09, gain: 0.3, dest: o });
    A.noise({ f: 700, q: 1, dur: 0.05, gain: 0.18, dest: o });
    A.tone({ type: 'sawtooth', f: 520, f2: 260, dur: 0.07, gain: 0.025, filter: 'bandpass', ff: 900, q: 3, dest: o });
  },

  // un défenseur se matérialise sur le terrain
  cbDefWake(A) {
    const t = A.now, o = A.out(0, null, 0.35);
    A.tone({ type: 'triangle', f: 160, f2: 1400, glide: 0.5, dur: 0.55, gain: 0.05, dest: o });
    A.noise({ f: 900, f2: 6000, q: 5, dur: 0.5, gain: 0.04, dest: o });
    A.tone({ f: 60, f2: 40, t: t + 0.45, dur: 0.3, gain: 0.3, dest: o });
  },

  // feu d'artifice : détonation et crépitement
  cbFirework(A, pan = 0) {
    if (!A.claim('mg', 0.35, 1)) return;
    const t = A.now, o = A.out(pan * 0.7, null, 0.5);
    A.noise({ f: 1800, q: 0.7, filter: 'highpass', dur: 0.06, gain: 0.16, dest: o });
    A.tone({ f: 95, f2: 38, dur: 0.25, gain: 0.25, dest: o });
    for (let k = 0; k < 7; k++) A.noise({ f: rnd(3000, 8000), q: 5, t: t + 0.08 + rnd(0, 0.45), dur: 0.02, gain: 0.06, dest: o });
  },

  // montée en puissance de NULL : klaxon bref
  cbAlert(A) {
    if (!A.throttle('cbAlert', 1)) return;
    const t = A.now, o = A.out(0, null, 0.2);
    for (let k = 0; k < 2; k++) {
      A.tone({ type: 'sawtooth', f: 620, f2: 480, t: t + k * 0.22, dur: 0.18, gain: 0.04, filter: 'lowpass', ff: 1800, dest: o });
      A.tone({ type: 'square', f: 310, f2: 240, t: t + k * 0.22, dur: 0.18, gain: 0.02, filter: 'lowpass', ff: 1200, dest: o });
    }
  },

  // rematérialisation de la bille au rond central
  cbBeam(A) {
    const o = A.out(0, null, 0.3);
    A.tone({ type: 'triangle', f: 300, f2: 1300, glide: 0.4, dur: 0.45, gain: 0.04, dest: o });
    A.noise({ f: 1500, f2: 7000, q: 6, dur: 0.45, gain: 0.035, dest: o });
  },

  // CORNER : la bille est happée, le lanceur se charge
  cbCorner(A, side = 0) {
    const t = A.now, o = A.out(side * 0.6, null, 0.3);
    A.tone({ type: 'sawtooth', f: 180, f2: 1100, glide: 0.38, dur: 0.4, gain: 0.04, filter: 'lowpass', ff: 900, ff2: 4000, dest: o });
    A.bell({ f: nf(84), t, dur: 0.5, gain: 0.07, dest: o });
    A.bell({ f: nf(88), t: t + 0.1, dur: 0.5, gain: 0.05, dest: o });
  },

  // lanceur CORNER de nouveau allumé
  cbCornerLit(A, side = 0) {
    if (!A.claim('mg', 0.2, 0)) return;
    A.bell({ f: nf(91), dur: 0.35, gain: 0.04, pan: side * 0.6 });
  },

  // frappe du lanceur CORNER (passe tendue)
  cbKick(A, side = 0) {
    const o = A.out(side * 0.6, null, 0.2);
    A.tone({ f: 140, f2: 60, dur: 0.1, gain: 0.35, dest: o });
    A.noise({ f: 900, f2: 3800, q: 1.2, dur: 0.22, gain: 0.1, dest: o });
  },

  // relance du gardien
  cbThrow(A) {
    if (!A.claim('mg', 0.15, 1)) return;
    const o = A.out(0, null, 0.15);
    A.noise({ f: 1400, f2: 500, q: 1.2, dur: 0.18, gain: 0.08, dest: o });
    A.tone({ type: 'square', f: 880, f2: 520, dur: 0.08, gain: 0.02, filter: 'lowpass', ff: 2400, dest: o });
  },

  // lucarne : scintillement montant
  cbLucarne(A) {
    const t = A.now, o = A.out(0, null, 0.5);
    [84, 88, 91, 96, 100].forEach((m, k) => A.tone({ type: 'triangle', f: nf(m), t: t + 0.05 + k * 0.05, dur: 0.3, gain: 0.04, dest: o }));
  },
};
