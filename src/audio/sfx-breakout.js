// Effets sonores du CASSE-BRIQUES ORBITAL (secteur HANGAR), à fusionner dans SFX.
// Chaque fonction reçoit le moteur (A) puis ses paramètres ; x = position monde (panoramique).

const nf = (m) => 440 * Math.pow(2, (m - 69) / 12);
const rnd = (a, b) => a + Math.random() * (b - a);
const PENTA = [0, 3, 5, 7, 10, 12, 15, 17, 19, 22, 24, 27];
let shardIdx = 0;

export const SFX_BREAKOUT = {
  // tir laser jumelé de la plateforme : piqué bref, deux voix légèrement désaccordées
  bkLaser(A, x = 300) {
    if (!A.claim('mg', 0.12, 1)) return;
    const o = A.out(A.pan(x) * 0.6, null, 0.12);
    const k = rnd(0.96, 1.04);
    A.tone({ type: 'sawtooth', f: 2600 * k, f2: 380, dur: 0.12, gain: 0.05, filter: 'bandpass', ff: 2400, q: 2.5, dest: o });
    A.tone({ type: 'square', f: 1900 * k, f2: 520, dur: 0.08, gain: 0.025, filter: 'lowpass', ff: 4200, detune: 18, dest: o });
    A.noise({ f: 7000, q: 2, dur: 0.025, gain: 0.05, dest: o });
  },

  // impact d'un tir laser (brique ou chrome)
  bkBoltHit(A, x = 300, chrome = false) {
    if (!A.claim('mg', 0.08, 0)) return;
    const o = A.out(A.pan(x) * 0.6);
    A.noise({ f: chrome ? 5200 : 3200, q: 3, dur: 0.04, gain: 0.08, dest: o });
    A.tone({ type: 'square', f: chrome ? 1700 : 900, f2: 300, dur: 0.05, gain: 0.03, filter: 'lowpass', ff: 3000, dest: o });
  },

  // éclats de verre néon : bruit cristallin + tintements aléatoires, montent avec la chaîne
  bkShard(A, chain = 1, x = 300) {
    if (!A.claim('mg', 0.12, 0.5)) return;
    const t = A.now, o = A.out(A.pan(x) * 0.7, null, 0.2);
    const v = shardIdx++ % 3;
    A.noise({ f: rnd(5200, 8200), q: rnd(1.2, 3.5), dur: rnd(0.04, 0.08), gain: 0.08, dest: o });
    if (v === 1) A.noise({ f: 2400, f2: 900, q: 1.2, dur: 0.07, gain: 0.05, t: t + 0.01, dest: o });
    const base = nf(79 + PENTA[Math.min(chain, PENTA.length - 1)] % 24);
    const n = v === 2 ? 4 : 3;
    for (let i = 0; i < n; i++) {
      A.tone({ f: base * rnd(1.9, 3.3), t: t + i * rnd(0.008, 0.022), dur: rnd(0.03, 0.08), gain: 0.022, dest: o });
    }
  },

  // brique de chrome indestructible : tintement métallique sec
  bkChrome(A, x = 300) {
    if (!A.throttle('bkChrome', 0.05) || !A.claim('mg', 0.18, 0.5)) return;
    const o = A.out(A.pan(x) * 0.6, null, 0.15);
    const b = rnd(1500, 1800);
    for (const [m, k] of [[1, 1], [2.32, 0.5], [3.95, 0.35], [5.1, 0.2]]) A.tone({ f: b * m, dur: 0.14 + 0.1 * k, gain: 0.035 * k, dest: o });
    A.noise({ f: 6000, q: 4, dur: 0.02, gain: 0.08, dest: o });
  },

  // verrou touché mais pas encore brisé
  bkLockHit(A, x = 300) {
    if (!A.claim('mg', 0.3, 2)) return;
    const t = A.now, o = A.out(A.pan(x) * 0.5, null, 0.35);
    A.bell({ f: nf(81), ratio: 3.5, index: 2, dur: 0.45, gain: 0.08, t, dest: o });
    A.tone({ f: 110, f2: 60, dur: 0.12, gain: 0.2, t, dest: o });
    A.noise({ f: 3000, q: 2, dur: 0.05, gain: 0.08, t, dest: o });
  },

  // multiplicateur de chaîne en hausse
  bkCombo(A, n = 2) {
    if (!A.claim('mg', 0.25, 2)) return;
    const t = A.now, o = A.out(0, null, 0.3);
    const r = 72 + Math.min(5, n) * 2;
    [0, 7, 12].forEach((d, k) => A.tone({ type: 'square', f: nf(r + d), t: t + k * 0.04, dur: 0.09, gain: 0.04, filter: 'lowpass', ff: 3500, dest: o }));
  },

  // capsule libérée par une brique
  bkCapsuleDrop(A, x = 300) {
    if (!A.claim('mg', 0.15, 0.5)) return;
    const o = A.out(A.pan(x) * 0.5, null, 0.2);
    A.tone({ type: 'triangle', f: 1400, f2: 700, dur: 0.12, gain: 0.05, dest: o });
    A.tone({ type: 'triangle', f: 2100, f2: 1050, dur: 0.1, gain: 0.025, t: A.now + 0.04, dest: o });
  },

  // capsule manquée : petit grésillement descendant
  bkCapsuleLost(A, x = 300) {
    if (!A.claim('mg', 0.2, 0)) return;
    const o = A.out(A.pan(x) * 0.5);
    A.tone({ type: 'sawtooth', f: 600, f2: 120, dur: 0.18, gain: 0.025, filter: 'lowpass', ff: 1200, dest: o });
  },

  // signature propre à chaque bonus (en plus du son « capsule »)
  bkPowerUp(A, kind = 'large') {
    const t = A.now, o = A.out(0, null, 0.35);
    switch (kind) {
      case 'laser':
        for (let k = 0; k < 3; k++) A.tone({ type: 'sawtooth', f: 900 + k * 500, f2: 2600 + k * 400, dur: 0.12, gain: 0.03, filter: 'bandpass', ff: 2200, q: 2, t: t + k * 0.05, dest: o });
        break;
      case 'aimant':
        A.tone({ type: 'sine', f: 70, f2: 140, dur: 0.5, gain: 0.25, dest: o });
        A.tone({ type: 'sawtooth', f: 140, dur: 0.5, gain: 0.03, filter: 'lowpass', ff: 300, ff2: 2500, fglide: 0.4, dest: o });
        break;
      case 'ralenti':
        A.tone({ type: 'triangle', f: nf(84), f2: nf(60), dur: 0.6, gain: 0.08, dest: o });
        A.tone({ type: 'triangle', f: nf(79), f2: nf(55), dur: 0.6, gain: 0.05, t: t + 0.05, dest: o });
        break;
      case 'perfo':
        A.noise({ f: 400, f2: 6000, q: 3, dur: 0.35, gain: 0.07, dest: o });
        A.tone({ type: 'square', f: 220, f2: 880, dur: 0.3, gain: 0.03, filter: 'lowpass', ff: 2000, dest: o });
        break;
      case 'time':
        [84, 88, 91].forEach((m, k) => A.bell({ f: nf(m), dur: 0.5, gain: 0.06, t: t + k * 0.07, dest: o }));
        break;
      case 'mult': case 'jack':
        [76, 83, 88, 95].forEach((m, k) => A.bell({ f: nf(m), ratio: 2, index: 1.5, dur: 0.6, gain: 0.07, t: t + k * 0.06, dest: o }));
        break;
      case 'echo':
        SFX_BREAKOUT.bkEcho(A);
        break;
      default:
        A.tone({ type: 'sawtooth', f: nf(60), f2: nf(72), dur: 0.25, gain: 0.05, filter: 'lowpass', ff: 2500, dest: o });
    }
  },

  // aimant : la plateforme attrape la bille
  bkCatch(A, x = 300) {
    const t = A.now, o = A.out(A.pan(x) * 0.5, null, 0.2);
    A.tone({ f: 160, f2: 70, dur: 0.12, gain: 0.3, dest: o });
    A.tone({ type: 'sawtooth', f: 220, f2: 440, dur: 0.25, gain: 0.03, filter: 'lowpass', ff: 1200, t: t + 0.03, dest: o });
    A.noise({ f: 900, q: 1, dur: 0.05, gain: 0.08, dest: o });
  },

  // libération de la bille tenue
  bkRelease(A, x = 300) {
    const o = A.out(A.pan(x) * 0.5, null, 0.2);
    A.noise({ f: 800, f2: 5000, q: 1.5, dur: 0.16, gain: 0.08, dest: o });
    A.tone({ type: 'triangle', f: 300, f2: 900, dur: 0.12, gain: 0.08, dest: o });
  },

  // apparition des échos holographiques : scintillement en chœur
  bkEcho(A) {
    const t = A.now, o = A.out(0, null, 0.55);
    for (const [m, d] of [[79, -12], [83, 9], [86, -5], [91, 14]]) {
      A.tone({ type: 'sawtooth', f: nf(m), dur: 0.45, gain: 0.02, filter: 'bandpass', ff: 2500, q: 3, detune: d, t: t + (m - 79) * 0.01, dest: o });
    }
    A.noise({ f: 9000, q: 5, dur: 0.3, gain: 0.03, t, dest: o });
  },

  // écho dissipé
  bkEchoFade(A, x = 300) {
    if (!A.claim('mg', 0.3, 0)) return;
    const o = A.out(A.pan(x) * 0.5, null, 0.4);
    A.tone({ type: 'sine', f: nf(91), f2: nf(67), dur: 0.3, gain: 0.04, dest: o });
    A.noise({ f: 7000, f2: 2000, q: 4, dur: 0.25, gain: 0.025, dest: o });
  },

  // mur effondré : fanfare synthétique + balayage
  bkStageClear(A) {
    const t = A.now, o = A.out(0, null, 0.6);
    [[60, 64, 67], [62, 67, 71], [64, 67, 72, 76]].forEach((ch, k) => {
      for (const m of ch) A.tone({ type: 'sawtooth', f: nf(m + 12), t: t + k * 0.14, dur: k === 2 ? 0.9 : 0.16, gain: 0.04, filter: 'lowpass', ff: 3800, dest: o });
    });
    A.noise({ f: 300, f2: 8000, q: 1.2, dur: 0.6, gain: 0.06, t, dest: o });
    A.bell({ f: nf(96), t: t + 0.28, dur: 1.2, gain: 0.08, dest: o });
  },

  // effondrement en cascade des briques restantes
  bkCollapse(A) {
    const t = A.now, o = A.out(0, null, 0.5);
    A.tone({ f: 55, f2: 28, dur: 0.9, gain: 0.35, dest: o });
    for (let k = 0; k < 6; k++) A.noise({ f: rnd(3000, 7000), q: 2, dur: 0.06, gain: 0.05, t: t + k * 0.09 + rnd(0, 0.04), dest: o });
    A.noise({ f: 1200, f2: 150, q: 0.6, filter: 'lowpass', dur: 0.8, gain: 0.15, t, dest: o });
  },

  // le nouveau mur se verrouille en place
  bkWallDrop(A) {
    const t = A.now, o = A.out(0, null, 0.45);
    A.tone({ f: 70, f2: 32, dur: 0.45, gain: 0.45, dest: o });
    A.noise({ f: 900, f2: 120, q: 0.8, filter: 'lowpass', dur: 0.35, gain: 0.2, dest: o });
    A.tone({ type: 'square', f: 880, dur: 0.06, gain: 0.03, t: t + 0.12, dest: o });
    A.tone({ type: 'square', f: 1320, dur: 0.08, gain: 0.03, t: t + 0.2, dest: o });
  },

  // descente du mur : servo bref (cadencé par le jeu)
  bkWallStep(A) {
    if (!A.claim('mg', 0.2, 0)) return;
    const o = A.out(0, null, 0.1);
    A.tone({ type: 'sawtooth', f: 90, f2: 70, dur: 0.18, gain: 0.04, filter: 'lowpass', ff: 500, dest: o });
  },
};
