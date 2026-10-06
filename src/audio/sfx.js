// Effets sonores procéduraux. Chaque fonction reçoit le moteur (A) puis ses paramètres.
// Les sons sont synchronisés aux événements physiques (appelés depuis la simulation).

import { SFX_DEFENSE } from './sfx-defense.js';
import { SFX_BREAKOUT } from './sfx-breakout.js';
import { SFX_SINGULARITY } from './sfx-singularity.js';
import { SFX_GRAFFITI } from './sfx-graffiti.js';
import { SFX_VAULT } from './sfx-vault.js';
import { SFX_CYBERBALL } from './sfx-cyberball.js';
import { SFX_BUGS } from './sfx-bugs.js';
import { SFX_MAZE } from './sfx-maze.js';

const nf = (m) => 440 * Math.pow(2, (m - 69) / 12);
const rnd = (a, b) => a + Math.random() * (b - a);
let bumperIdx = 0, bumperLast = 0, bumperRun = 0;
let charge = null;

function chordNote(A, i, oct = 1) {
  const ch = A.music.currentChord ? A.music.currentChord() : [220, 261.6, 329.6];
  const n = ch.length;
  const k = ((i % n) + n) % n;
  return ch[k] * Math.pow(2, oct + Math.floor(i / n));
}

export const SFX = {
  // ---------------------------------------------------------------- impacts
  impact(A, mat, speed, x) {
    const v = Math.min(1, speed / 2600);
    const g = 0.04 + 0.32 * Math.pow(v, 1.1);
    const pan = A.pan(x);
    if (!A.claim('impact', 0.25, v)) return;
    const o = A.out(pan, null, 0.08);
    switch (mat) {
      case 'metal': {
        A.noise({ f: 3200 + v * 1800, q: 2.5, dur: 0.05, gain: g * 0.9, dest: o });
        const base = rnd(900, 1300);
        for (const [m, k] of [[1, 1], [2.43, 0.6], [3.71, 0.35]]) A.tone({ f: base * m, dur: 0.08 + v * 0.18, gain: g * 0.22 * k, dest: o });
        break;
      }
      case 'rubber': case 'post':
        A.tone({ f: 150 + v * 60, f2: 70, dur: 0.08, gain: g * 0.9, dest: o });
        A.noise({ f: 700, q: 0.7, filter: 'lowpass', dur: 0.035, gain: g * 0.6, dest: o });
        break;
      case 'flipper':
        A.tone({ f: 190 + v * 80, f2: 95, dur: 0.07, gain: g * 0.8, dest: o });
        A.noise({ f: 1400, q: 1.2, dur: 0.03, gain: g * 0.5, dest: o });
        break;
      case 'plastic':
        A.noise({ f: 1600, q: 1.5, dur: 0.035, gain: g * 0.7, dest: o });
        A.tone({ type: 'square', f: 520 + v * 200, f2: 300, dur: 0.03, gain: g * 0.12, dest: o });
        break;
      case 'glass':
        A.tone({ f: 2100 + v * 600, dur: 0.09, gain: g * 0.25, dest: o });
        A.tone({ f: 3170 + v * 900, dur: 0.06, gain: g * 0.12, dest: o });
        A.noise({ f: 5000, q: 2, dur: 0.02, gain: g * 0.3, dest: o });
        break;
      case 'target':
        A.tone({ f: 340, f2: 190, dur: 0.06, gain: g * 0.8, dest: o });
        A.noise({ f: 2200, q: 2, dur: 0.02, gain: g * 0.5, dest: o });
        break;
      case 'ball':
        A.noise({ f: 3000, q: 6, dur: 0.025, gain: g * 0.9, dest: o });
        A.tone({ f: 1850, dur: 0.035, gain: g * 0.25, dest: o });
        break;
      case 'energy':
        A.tone({ type: 'sawtooth', f: 900, f2: 220, dur: 0.07, gain: g * 0.25, filter: 'bandpass', ff: 1200, q: 2, dest: o });
        break;
      default:
        A.noise({ f: 1800, q: 1.2, dur: 0.03, gain: g * 0.6, dest: o });
    }
  },

  // ---------------------------------------------------------------- batteurs / lanceur
  flipperUp(A, side) {
    if (!A.claim('flipper', 0.15, 2)) return;
    const o = A.out(side * 0.45, null, 0.05);
    const k = rnd(0.96, 1.04);
    A.tone({ f: 95 * k, f2: 42, dur: 0.09, gain: 0.42, dest: o });
    A.noise({ f: 1900 * k, q: 2, dur: 0.035, gain: 0.3, dest: o });
    A.noise({ f: 5200, q: 3, dur: 0.012, gain: 0.18, dest: o });
    A.tone({ f: 540 * k, dur: 0.1, gain: 0.04, dest: o });
    A.tone({ f: 910 * k, dur: 0.07, gain: 0.025, dest: o });
  },

  flipperDown(A, side) {
    if (!A.claim('flipper', 0.08, 1)) return;
    const o = A.out(side * 0.45);
    A.noise({ f: 1250, q: 1.5, dur: 0.025, gain: 0.13, dest: o });
    A.tone({ f: 120, f2: 70, dur: 0.04, gain: 0.12, dest: o });
  },

  plungerStart(A) {
    SFX.stopCharge(A);
    const ctx = A.ctx, t = ctx.currentTime;
    const o = A.out(0.6);
    const osc = ctx.createOscillator(); osc.type = 'sawtooth'; osc.frequency.value = 70;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 400; lp.Q.value = 4;
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.06, t + 0.05);
    osc.connect(lp); lp.connect(g); g.connect(o);
    // cliquetis de crémaillère : bruit haché par un LFO carré
    const src = ctx.createBufferSource(); src.buffer = A.noiseBuf; src.loop = true;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 2600; bp.Q.value = 3;
    const cg = ctx.createGain(); cg.gain.value = 0;
    const lfo = ctx.createOscillator(); lfo.type = 'square'; lfo.frequency.value = 9;
    const lg = ctx.createGain(); lg.gain.value = 0.05;
    lfo.connect(lg); lg.connect(cg.gain);
    src.connect(bp); bp.connect(cg); cg.connect(o);
    osc.start(t); src.start(t); lfo.start(t);
    charge = { osc, lp, g, lfo, src, cg, o };
  },

  chargeLevel(A, c) {
    if (!charge) return;
    const t = A.ctx.currentTime;
    charge.osc.frequency.setTargetAtTime(70 + 200 * c, t, 0.03);
    charge.lp.frequency.setTargetAtTime(400 + 1800 * c, t, 0.03);
    charge.lfo.frequency.setTargetAtTime(9 + 22 * c, t, 0.03);
  },

  stopCharge(A) {
    if (!charge) return;
    const t = A.ctx.currentTime, c = charge;
    charge = null;
    c.g.gain.setTargetAtTime(0.0001, t, 0.02);
    c.cg.gain.cancelScheduledValues(t);
    try { c.osc.stop(t + 0.1); c.src.stop(t + 0.1); c.lfo.stop(t + 0.1); } catch (_) { /* déjà arrêté */ }
  },

  plungerRelease(A, power = 0.8) {
    SFX.stopCharge(A);
    const o = A.out(0.6, null, 0.12);
    A.tone({ f: 320, f2: 110, dur: 0.18, gain: 0.25, dest: o });
    A.noise({ f: 500, f2: 3500, q: 1, dur: 0.28, gain: 0.12 + 0.2 * power, dest: o });
    A.noise({ f: 2200, q: 2, dur: 0.03, gain: 0.3, dest: o });
  },

  // ---------------------------------------------------------------- éléments du plateau
  bumper(A, i, level = 1) {
    if (!A.claim('bumper', 0.45, 2)) return;
    const now = A.now;
    bumperRun = now - bumperLast < 0.6 ? Math.min(bumperRun + 1, 10) : 0;
    bumperLast = now;
    bumperIdx = (bumperIdx + 1 + (bumperRun > 4 ? 1 : 0)) % 6;
    const f = chordNote(A, bumperIdx + Math.floor(bumperRun / 3), 1);
    const pan = [-0.35, 0.35, 0][i] || 0;
    const o = A.out(pan, null, 0.25);
    A.bell({ f, ratio: 2, index: 2 + level * 0.3, dur: 0.45, gain: 0.16, dest: o });
    A.tone({ f: 110, f2: 55, dur: 0.08, gain: 0.35, dest: o });
    A.noise({ f: 2800, q: 1.5, dur: 0.02, gain: 0.2, dest: o });
  },

  sling(A, side) {
    if (!A.claim('event', 0.15, 1)) return;
    const o = A.out(side * 0.5, null, 0.05);
    A.noise({ f: 900, q: 1, dur: 0.05, gain: 0.3, dest: o });
    A.tone({ f: 230, f2: 105, dur: 0.07, gain: 0.3, dest: o });
    A.tone({ type: 'triangle', f: 180, dur: 0.08, gain: 0.08, dest: o });
  },

  target(A, i, phased) {
    if (!A.claim('event', 0.3, 1)) return;
    const o = A.out(0, null, 0.15);
    if (phased) {
      A.tone({ f: 600, f2: 1800, dur: 0.18, gain: 0.08, dest: o });
      A.tone({ f: 606, f2: 1820, dur: 0.18, gain: 0.08, dest: o });
    }
    A.tone({ f: 330, f2: 190, dur: 0.06, gain: 0.3, dest: o });
    A.tone({ type: 'square', f: 1500, dur: 0.015, gain: 0.05, dest: o });
    A.tone({ type: 'triangle', f: chordNote(A, i + 3, 1), dur: 0.16, gain: 0.1, dest: o });
  },

  bankComplete(A) {
    const t = A.now, o = A.out(0, null, 0.3);
    for (let k = 0; k < 5; k++) A.tone({ type: 'triangle', f: chordNote(A, k, 1), t: t + k * 0.06, dur: 0.2, gain: 0.12, dest: o });
    A.noise({ f: 6000, q: 1, dur: 0.4, gain: 0.05, t, dest: o });
  },

  lane(A, i, isNew) {
    const o = A.out((i - 1) * 0.3, null, 0.2);
    const f = chordNote(A, i * 2, isNew ? 2 : 1);
    A.tone({ f, dur: 0.12, gain: isNew ? 0.14 : 0.06, dest: o });
    if (isNew) A.tone({ f: f * 2, dur: 0.08, gain: 0.05, dest: o });
  },

  lanesComplete(A) {
    const t = A.now, o = A.out(0, null, 0.35);
    for (let k = 0; k < 6; k++) A.tone({ type: k % 2 ? 'square' : 'triangle', f: chordNote(A, k, 1), t: t + k * 0.05, dur: 0.18, gain: 0.08, filter: 'lowpass', ff: 3000, dest: o });
  },

  inlane(A, pan) { const o = A.out(pan * 0.5); A.tone({ f: 880, dur: 0.05, gain: 0.05, dest: o }); },

  // ---------------------------------------------------------- pont supérieur et nouveaux éléments
  deckEnter(A) {
    if (!A.throttle('deckEnter', 0.4)) return;
    const t = A.now, o = A.out(0.2, null, 0.4);
    A.noise({ f: 500, f2: 3500, q: 2, dur: 0.3, gain: 0.08, dest: o });
    [76, 83, 88].forEach((m, k) => A.tone({ type: 'triangle', f: nf(m), t: t + k * 0.05, dur: 0.16, gain: 0.07, dest: o }));
  },

  deckDrop(A) {
    if (!A.throttle('deckDrop', 0.3)) return;
    const o = A.out(0, null, 0.15);
    A.tone({ f: 900, f2: 300, dur: 0.18, gain: 0.07, dest: o });
    A.noise({ f: 1200, q: 2, dur: 0.05, gain: 0.12, t: A.now + 0.16, dest: o });
  },

  uplinkIn(A) {
    const t = A.now, o = A.out(0, null, 0.45);
    A.tone({ f: 70, f2: 40, dur: 0.18, gain: 0.35, dest: o });
    A.noise({ f: 800, q: 3, dur: 0.06, gain: 0.2, dest: o });
    for (let k = 0; k < 4; k++) A.tone({ type: 'square', f: nf(72 + k * 5), t: t + 0.15 + k * 0.08, dur: 0.07, gain: 0.04, filter: 'lowpass', ff: 3000, dest: o });
  },

  uplinkOut(A) {
    const o = A.out(0, null, 0.3);
    A.noise({ f: 300, f2: 2500, q: 1.5, dur: 0.12, gain: 0.25, dest: o });
    A.tone({ f: 120, f2: 60, dur: 0.12, gain: 0.3, dest: o });
  },

  // spinner : clic métallique dont la hauteur suit la vitesse de rotation
  spinner(A, pan = 0, w = 10) {
    if (!A.claim('event', 0.04, 0.5)) return;
    const o = A.out(pan * 0.6);
    const f = 1500 + Math.min(40, w) * 25;
    A.tone({ type: 'square', f, dur: 0.018, gain: 0.035, filter: 'bandpass', ff: f, q: 4, dest: o });
    A.noise({ f: 5000, q: 3, dur: 0.012, gain: 0.05, dest: o });
  },

  dropTarget(A, i = 0) {
    if (!A.claim('event', 0.25, 2)) return;
    const o = A.out(0.6, null, 0.15);
    A.noise({ f: 700, f2: 200, q: 1, dur: 0.08, gain: 0.35, dest: o });
    A.tone({ f: 140, f2: 60, dur: 0.12, gain: 0.3, dest: o });
    A.tone({ type: 'triangle', f: chordNote(A, i + 2, 1), dur: 0.2, gain: 0.08, dest: o });
  },

  dropReset(A) {
    const t = A.now, o = A.out(0.6, null, 0.1);
    for (let k = 0; k < 3; k++) { A.noise({ f: 900, q: 1.5, dur: 0.04, gain: 0.2, t: t + k * 0.07, dest: o }); A.tone({ f: 200, f2: 120, dur: 0.05, gain: 0.15, t: t + k * 0.07, dest: o }); }
  },

  kickback(A) {
    const o = A.out(-0.7, null, 0.3);
    A.tone({ f: 90, f2: 300, dur: 0.15, gain: 0.4, dest: o });
    A.noise({ f: 600, f2: 3000, q: 1.2, dur: 0.2, gain: 0.25, dest: o });
  },

  outlane(A) {
    const o = A.out(0, null, 0.1);
    A.tone({ f: 220, f2: 90, dur: 0.3, gain: 0.15, type: 'triangle', dest: o });
  },

  rampEnter(A, pan) {
    if (!A.throttle('rampEnter', 0.3)) return;
    const o = A.out(pan * 0.4, null, 0.15);
    A.noise({ f: 300, f2: 1900, q: 2, dur: 0.38, gain: 0.12, dest: o });
    A.tone({ f: 200, f2: 520, dur: 0.35, gain: 0.04, dest: o });
  },

  rampMade(A, combo = 0) {
    const t = A.now, o = A.out(0, null, 0.35);
    const up = Math.min(combo, 6) * 2;
    A.bell({ f: nf(76 + up), dur: 0.35, gain: 0.13, t, dest: o });
    A.bell({ f: nf(83 + up), dur: 0.5, gain: 0.13, t: t + 0.09, dest: o });
  },

  orbitIn(A, pan) {
    if (!A.throttle('orbit', 0.2)) return;
    const o = A.out(pan * 0.6);
    A.noise({ f: 600, f2: 2400, q: 2.5, dur: 0.3, gain: 0.09, dest: o });
  },

  loop(A) {
    const ctx = A.ctx, t = ctx.currentTime;
    if (!ctx.createStereoPanner) return;
    const p = ctx.createStereoPanner();
    p.pan.setValueAtTime(-0.9, t); p.pan.linearRampToValueAtTime(0.9, t + 0.5);
    p.connect(A.buses.sfx);
    const g = ctx.createGain(); g.connect(p);
    A.noise({ f: 800, f2: 3000, q: 3, dur: 0.5, gain: 0.14, dest: g });
    A.tone({ type: 'sawtooth', f: 300, f2: 900, dur: 0.45, gain: 0.04, filter: 'lowpass', ff: 1500, dest: g });
  },

  combo(A, n) {
    const t = A.now, o = A.out(0, null, 0.3);
    const up = Math.min(n, 8);
    for (let k = 0; k < 3; k++) {
      A.tone({ type: 'sawtooth', f: chordNote(A, k + up, 1), t: t + k * 0.045, dur: 0.14, gain: 0.07, filter: 'lowpass', ff: 2500 + up * 400, dest: o });
    }
    A.noise({ f: 4000 + up * 500, q: 1, dur: 0.25, gain: 0.04, t, dest: o });
  },

  shutter(A) {
    const o = A.out(0, null, 0.2);
    A.noise({ f: 1400, q: 3, dur: 0.06, gain: 0.25, dest: o });
    A.tone({ f: 180, dur: 0.2, gain: 0.12, dest: o });
    A.tone({ f: 410, dur: 0.15, gain: 0.05, dest: o });
  },

  portalOpen(A) {
    const o = A.out(0, null, 0.5);
    A.tone({ type: 'sawtooth', f: 110, f2: 880, dur: 0.7, gain: 0.06, filter: 'lowpass', ff: 400, ff2: 4000, dest: o });
    A.noise({ f: 2000, f2: 8000, q: 4, dur: 0.6, gain: 0.05, dest: o });
  },

  portalWarp(A) {
    const ctx = A.ctx, t = ctx.currentTime;
    const o = A.out(0, null, 0.5);
    A.tone({ f: 60, f2: 30, dur: 1.1, gain: 0.35, dest: o });
    // tourbillon : bande passante modulée par LFO
    const src = ctx.createBufferSource(); src.buffer = A.noiseBuf; src.loop = true;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 900; bp.Q.value = 6;
    const lfo = ctx.createOscillator(); lfo.frequency.setValueAtTime(3, t); lfo.frequency.linearRampToValueAtTime(14, t + 1);
    const lg = ctx.createGain(); lg.gain.value = 700;
    lfo.connect(lg); lg.connect(bp.frequency);
    const g = ctx.createGain(); A.env(g.gain, t, 0.15, 0.25, 0.95);
    src.connect(bp); bp.connect(g); g.connect(o);
    src.start(t); lfo.start(t); src.stop(t + 1.2); lfo.stop(t + 1.2);
  },

  warpIn(A) {
    const o = A.out(0, null, 0.5);
    A.tone({ type: 'sawtooth', f: 80, f2: 1200, dur: 1.0, gain: 0.08, filter: 'lowpass', ff: 300, ff2: 6000, dest: o });
    A.noise({ f: 400, f2: 6000, q: 0.8, dur: 1.1, gain: 0.12, dest: o });
  },

  warpOut(A) {
    const o = A.out(0, null, 0.5);
    A.tone({ type: 'sawtooth', f: 1200, f2: 90, dur: 0.9, gain: 0.08, filter: 'lowpass', ff: 6000, ff2: 400, dest: o });
    A.noise({ f: 6000, f2: 500, q: 0.8, dur: 1.0, gain: 0.12, dest: o });
  },

  // ---------------------------------------------------------------- événements
  jackpot(A) {
    if (!A.claim('event', 1, 5)) return;
    const t = A.now, o = A.out(0, null, 0.6);
    A.noise({ f: 300, f2: 6000, q: 0.7, dur: 0.25, gain: 0.1, t, dest: o });
    const ch = A.music.currentChord();
    for (const f of [...ch, ch[0] * 2]) {
      A.tone({ type: 'sawtooth', f: f * 2, t: t + 0.2, dur: 0.9, gain: 0.07, filter: 'lowpass', ff: 600, ff2: 5000, fglide: 0.08, dest: o });
      A.tone({ type: 'sawtooth', f: f * 2 * 1.006, t: t + 0.2, dur: 0.9, gain: 0.05, filter: 'lowpass', ff: 600, ff2: 4000, fglide: 0.08, dest: o });
    }
    A.bell({ f: ch[0] * 8, t: t + 0.2, dur: 1, gain: 0.08, dest: o });
    A.tone({ f: 80, f2: 40, t: t + 0.2, dur: 0.5, gain: 0.35, dest: o });
  },

  superJackpot(A) {
    const t = A.now, o = A.out(0, null, 0.7);
    A.noise({ f: 200, f2: 9000, q: 0.6, dur: 0.6, gain: 0.14, t, dest: o });
    A.tone({ type: 'sawtooth', f: 100, f2: 800, dur: 0.6, gain: 0.05, filter: 'lowpass', ff: 300, ff2: 3000, t, dest: o });
    const ch = A.music.currentChord();
    for (let k = 0; k < 8; k++) A.bell({ f: ch[k % 3] * Math.pow(2, 2 + Math.floor(k / 3)), t: t + 0.6 + k * 0.07, dur: 0.8, gain: 0.07, dest: o });
    for (const f of ch) A.tone({ type: 'sawtooth', f: f * 2, t: t + 0.6, dur: 1.6, gain: 0.07, filter: 'lowpass', ff: 800, ff2: 6000, fglide: 0.1, dest: o });
    A.tone({ f: 60, f2: 30, t: t + 0.6, dur: 1, gain: 0.45, dest: o });
  },

  ballLost(A) {
    const t = A.now, o = A.out(0, null, 0.5);
    A.tone({ type: 'sawtooth', f: 520, f2: 45, dur: 1.3, gain: 0.12, filter: 'lowpass', ff: 3000, ff2: 120, dest: o });
    A.tone({ type: 'sawtooth', f: 553, f2: 48, dur: 1.3, gain: 0.08, filter: 'lowpass', ff: 3000, ff2: 120, dest: o });
    A.noise({ f: 1200, f2: 150, q: 1, dur: 1, gain: 0.08, t: t + 0.05, dest: o });
    A.tone({ f: 70, f2: 30, dur: 0.8, gain: 0.3, dest: o });
  },

  drainMulti(A) {
    const o = A.out(0, null, 0.2);
    A.tone({ f: 320, f2: 110, dur: 0.28, gain: 0.15, type: 'triangle', dest: o });
  },

  ballSave(A) {
    const t = A.now, o = A.out(0, null, 0.4);
    A.tone({ f: 400, f2: 1300, dur: 0.18, gain: 0.12, dest: o });
    A.noise({ f: 3000, q: 1, dur: 0.12, gain: 0.08, dest: o });
    A.bell({ f: 1046, t: t + 0.12, dur: 0.5, gain: 0.1, dest: o });
  },

  shield(A) {
    const t = A.now, o = A.out(0, null, 0.5);
    for (const d of [-8, 0, 8]) A.tone({ type: 'sawtooth', f: 220, f2: 880, detune: d, dur: 0.6, gain: 0.05, filter: 'lowpass', ff: 600, ff2: 5000, dest: o });
    A.bell({ f: 1318, t: t + 0.3, dur: 0.7, gain: 0.1, dest: o });
  },

  extraBall(A) {
    const t = A.now, o = A.out(0, null, 0.5);
    [72, 76, 79, 84, 88, 91].forEach((m, k) => A.tone({ type: 'square', f: nf(m), t: t + k * 0.08, dur: 0.22, gain: 0.06, filter: 'lowpass', ff: 3500, dest: o }));
    A.bell({ f: nf(96), t: t + 0.5, dur: 1, gain: 0.1, dest: o });
  },

  multiball(A) {
    const t = A.now, o = A.out(0, null, 0.5);
    for (let k = 0; k < 6; k++) A.tone({ type: 'square', f: k % 2 ? 660 : 880, t: t + k * 0.09, dur: 0.07, gain: 0.05, dest: o });
    A.noise({ f: 300, f2: 8000, q: 0.8, dur: 0.6, gain: 0.12, t: t + 0.4, dest: o });
    const ch = A.music.currentChord();
    for (const f of ch) A.tone({ type: 'sawtooth', f: f * 2, t: t + 1, dur: 1, gain: 0.06, filter: 'lowpass', ff: 700, ff2: 5000, fglide: 0.1, dest: o });
  },

  skillShot(A) {
    const t = A.now, o = A.out(0, null, 0.5);
    A.tone({ type: 'sawtooth', f: 300, f2: 2400, dur: 0.25, gain: 0.07, filter: 'bandpass', ff: 1500, q: 2, dest: o });
    for (const m of [79, 83, 86]) A.bell({ f: nf(m), t: t + 0.2, dur: 0.8, gain: 0.08, dest: o });
  },

  missionStart(A) {
    const t = A.now, o = A.out(0, null, 0.3);
    A.tone({ f: nf(81), t, dur: 0.12, gain: 0.08, dest: o });
    A.tone({ f: nf(88), t: t + 0.12, dur: 0.2, gain: 0.08, dest: o });
  },

  missionTick(A, p) {
    const o = A.out(0, null, 0.2);
    A.tone({ type: 'triangle', f: nf(76 + Math.round(p * 12)), dur: 0.08, gain: 0.07, dest: o });
  },

  missionComplete(A) {
    const t = A.now, o = A.out(0, null, 0.4);
    [76, 81, 88].forEach((m, k) => A.bell({ f: nf(m), t: t + k * 0.1, dur: 0.6, gain: 0.1, dest: o }));
  },

  missionFail(A) {
    const t = A.now, o = A.out(0, null, 0.3);
    A.tone({ type: 'triangle', f: nf(72), t, dur: 0.18, gain: 0.08, dest: o });
    A.tone({ type: 'triangle', f: nf(67), t: t + 0.18, dur: 0.3, gain: 0.08, dest: o });
  },

  sectorReady(A) {
    const t = A.now, o = A.out(0, null, 0.5);
    A.noise({ f: 900, q: 2, dur: 0.08, gain: 0.25, t, dest: o });
    A.tone({ f: 110, f2: 55, dur: 0.15, gain: 0.3, t, dest: o });
    A.tone({ type: 'sawtooth', f: 110, f2: 440, dur: 0.6, gain: 0.05, filter: 'lowpass', ff: 300, ff2: 3000, t: t + 0.1, dest: o });
    [0, 1, 2, 3].forEach(k => A.bell({ f: chordNote(A, k, 2), t: t + 0.25 + k * 0.08, dur: 0.6, gain: 0.07, dest: o }));
  },

  reward(A) {
    const t = A.now, o = A.out(0, null, 0.5);
    for (let k = 0; k < 7; k++) A.tone({ type: 'triangle', f: chordNote(A, k, 2), t: t + k * 0.06, dur: 0.3, gain: 0.07, dest: o });
    A.noise({ f: 7000, q: 1, dur: 0.6, gain: 0.04, t, dest: o });
  },

  nudge(A) {
    const o = A.out(0);
    A.tone({ f: 90, f2: 45, dur: 0.12, gain: 0.35, dest: o });
    A.noise({ f: 600, q: 1, dur: 0.06, gain: 0.2, dest: o });
  },

  magnet(A) {
    const ctx = A.ctx, t = ctx.currentTime, o = A.out(0, null, 0.2);
    const osc = ctx.createOscillator(); osc.type = 'square'; osc.frequency.setValueAtTime(60, t); osc.frequency.linearRampToValueAtTime(140, t + 0.5);
    const trem = ctx.createOscillator(); trem.frequency.value = 18;
    const tg = ctx.createGain(); tg.gain.value = 0.04;
    const g = ctx.createGain(); A.env(g.gain, t, 0.05, 0.06, 0.5);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 700;
    trem.connect(tg); tg.connect(g.gain);
    osc.connect(lp); lp.connect(g); g.connect(o);
    osc.start(t); trem.start(t); osc.stop(t + 0.6); trem.stop(t + 0.6);
  },

  // ---------------------------------------------------------------- barillets et aimant
  chevron(A, n = 1) {
    const t = A.now, o = A.out(0, null, 0.25);
    const base = 76 + (n - 1) * 4;
    for (let k = 0; k < n; k++) A.tone({ type: 'square', f: nf(base + k * 7), t: t + k * 0.06, dur: 0.09, gain: 0.05, filter: 'lowpass', ff: 3200, dest: o });
    A.tone({ f: nf(base - 24), dur: 0.18, gain: 0.18, dest: o });
  },
  barrelWarn(A, pan = 0) {
    const t = A.now, o = A.out(pan * 0.6, null, 0.2);
    for (let k = 0; k < 2; k++) A.tone({ type: 'square', f: 1250, t: t + k * 0.16, dur: 0.08, gain: 0.05, filter: 'bandpass', ff: 1400, q: 4, dest: o });
  },
  // vérins qui se déverrouillent : choc métallique puis échappement pneumatique
  barrelUnlock(A, pan = 0) {
    const t = A.now, o = A.out(pan * 0.7, null, 0.35);
    A.noise({ f: 2400, q: 6, dur: 0.05, gain: 0.35, dest: o });
    A.tone({ type: 'triangle', f: 310, f2: 180, dur: 0.12, gain: 0.25, dest: o });
    A.noise({ f: 5000, f2: 1800, q: 0.7, t: t + 0.06, dur: 0.38, gain: 0.16, filter: 'highpass', dest: o });
    for (let k = 0; k < 2; k++) A.noise({ f: 3000, q: 8, t: t + 0.22 + k * 0.1, dur: 0.03, gain: 0.25, dest: o });
  },
  // servomoteur : gémissement qui monte et descend sur toute la rotation
  barrelServo(A, pan = 0) {
    const t = A.now, o = A.out(pan * 0.7, null, 0.2);
    A.tone({ type: 'sawtooth', f: 70, f2: 150, glide: 0.8, dur: 1.55, gain: 0.06, filter: 'lowpass', ff: 600, ff2: 1400, dest: o });
    A.tone({ type: 'square', f: 460, f2: 690, glide: 0.8, dur: 1.55, gain: 0.018, filter: 'bandpass', ff: 900, q: 3, dest: o });
    A.noise({ f: 600, q: 2, dur: 1.55, gain: 0.05, dest: o });
  },
  // cran de rotation : cliquet lourd
  barrelStep(A, pan = 0, n = 1) {
    const t = A.now, o = A.out(pan * 0.7, null, 0.3);
    A.noise({ f: 1800 + n * 300, q: 5, dur: 0.04, gain: 0.32, dest: o });
    A.tone({ f: 120, f2: 60, dur: 0.12, gain: 0.3, dest: o });
    A.noise({ f: 4200, q: 9, t: t + 0.05, dur: 0.02, gain: 0.18, dest: o });
  },
  // verrouillage : grand « clonk » et retombée de pression
  barrelLock(A, pan = 0) {
    const t = A.now, o = A.out(pan * 0.7, null, 0.45);
    A.tone({ f: 85, f2: 42, dur: 0.35, gain: 0.5, dest: o });
    A.tone({ type: 'triangle', f: 520, f2: 260, dur: 0.18, gain: 0.18, dest: o });
    A.noise({ f: 1400, q: 3, dur: 0.08, gain: 0.35, dest: o });
    A.noise({ f: 6000, f2: 2500, q: 0.6, t: t + 0.12, dur: 0.5, gain: 0.09, filter: 'highpass', dest: o });
  },
  magnetGrab(A) {
    const t = A.now, o = A.out(0, null, 0.4);
    A.tone({ type: 'sawtooth', f: 55, f2: 110, dur: 0.8, gain: 0.12, filter: 'lowpass', ff: 300, ff2: 1600, dest: o });
    A.tone({ f: 880, f2: 1760, dur: 0.8, gain: 0.04, dest: o });
    A.noise({ f: 3000, f2: 7000, q: 4, dur: 0.6, gain: 0.05, dest: o });
  },
  magnetLock(A) {
    const t = A.now, o = A.out(0, null, 0.5);
    A.tone({ f: 60, dur: 0.4, gain: 0.35, dest: o });
    A.tone({ type: 'square', f: 120, dur: 1.6, gain: 0.025, filter: 'lowpass', ff: 500, a: 0.1, dest: o });
    A.noise({ f: 2000, q: 2, dur: 0.06, gain: 0.25, dest: o });
  },
  magnetRelease(A) {
    const o = A.out(0, null, 0.3);
    A.tone({ type: 'sawtooth', f: 220, f2: 60, dur: 0.3, gain: 0.1, filter: 'lowpass', ff: 1200, dest: o });
    A.noise({ f: 1200, f2: 300, q: 1.5, dur: 0.2, gain: 0.12, dest: o });
  },

  // ---------------------------------------------------------------- FURIE
  frenzyStart(A) {
    const t = A.now, o = A.out(0, null, 0.5);
    // sirène à deux tons
    for (let k = 0; k < 6; k++) A.tone({ type: 'sawtooth', f: k % 2 ? 660 : 880, t: t + k * 0.22, dur: 0.22, gain: 0.07, filter: 'lowpass', ff: 2400, dest: o });
    A.tone({ f: 55, f2: 35, dur: 1.4, gain: 0.45, dest: o });
    A.noise({ f: 300, f2: 3000, q: 0.8, dur: 1.2, gain: 0.12, dest: o });
  },
  frenzyDrop(A, i = 0) {
    const t = A.now, o = A.out(((i % 3) - 1) * 0.4, null, 0.2);
    A.tone({ type: 'square', f: nf(64 + (i % 5) * 3), f2: nf(52), dur: 0.12, gain: 0.05, filter: 'lowpass', ff: 2000, dest: o });
    A.noise({ f: 2500, q: 4, dur: 0.03, gain: 0.15, dest: o });
  },
  frenzyWin(A) {
    const t = A.now, o = A.out(0, null, 0.6);
    [[67, 71, 74], [69, 72, 76], [71, 74, 79], [72, 76, 84]].forEach((ch, k) => {
      for (const m of ch) A.tone({ type: 'sawtooth', f: nf(m), t: t + k * 0.14, dur: k === 3 ? 1.3 : 0.16, gain: 0.05, filter: 'lowpass', ff: 3800, dest: o });
    });
    A.tone({ f: nf(48), t: t + 0.42, dur: 1.2, gain: 0.3, dest: o });
  },
  frenzyFail(A) {
    const t = A.now, o = A.out(0, null, 0.4);
    A.tone({ type: 'sawtooth', f: 330, f2: 82, dur: 0.9, gain: 0.08, filter: 'lowpass', ff: 1500, ff2: 300, dest: o });
    A.tone({ f: 70, f2: 40, dur: 0.6, gain: 0.3, dest: o });
  },
  // batteur en surchauffe : grésillement et choc de relâche
  flipperOverheat(A, side = 0) {
    const t = A.now, o = A.out(side * 0.5, null, 0.2);
    A.noise({ f: 4500, f2: 1500, q: 0.8, dur: 0.6, gain: 0.18, filter: 'highpass', dest: o });
    A.tone({ type: 'square', f: 180, f2: 90, dur: 0.25, gain: 0.08, filter: 'lowpass', ff: 900, dest: o });
    A.tone({ type: 'square', f: 1700, t: t + 0.05, dur: 0.06, gain: 0.04, dest: o });
  },

  hurry(A) {
    const t = A.now, o = A.out(0);
    for (let k = 0; k < 4; k++) A.tone({ type: 'square', f: 1760, t: t + k * 0.14, dur: 0.03, gain: 0.04, dest: o });
  },

  gameOver(A) {
    const t = A.now, o = A.out(0, null, 0.7);
    [[57, 60, 64], [53, 57, 60], [50, 53, 57], [52, 56, 59]].forEach((ch, k) => {
      for (const m of ch) A.tone({ type: 'sawtooth', f: nf(m), t: t + k * 0.45, dur: 0.9, gain: 0.045, filter: 'lowpass', ff: 1400, dest: o });
    });
  },

  uiClick(A) { const o = A.out(0); A.tone({ type: 'square', f: 1200, dur: 0.025, gain: 0.04, dest: o }); A.tone({ f: 600, dur: 0.04, gain: 0.05, dest: o }); },
  uiMove(A) { const o = A.out(0); A.tone({ type: 'triangle', f: 900, dur: 0.03, gain: 0.03, dest: o }); },

  // ---------------------------------------------------------------- minijeux
  minigameStart(A, sector) {
    const t = A.now, o = A.out(0, null, 0.5);
    const roots = { hangar: 72, reactor: 62, tag: 67, maze: 60, defense: 64, vault: 59, arena: 65, bugs: 69, core: 57 };
    const r = roots[sector] || 69;
    const iv = sector === 'core' ? [0, 1, 7, 12] : sector === 'hangar' ? [0, 4, 7, 12] : [0, 3, 7, 12];
    iv.forEach((d, k) => A.tone({ type: 'sawtooth', f: nf(r + d), t: t + k * 0.09, dur: 0.35, gain: 0.06, filter: 'lowpass', ff: 2500, dest: o }));
    A.tone({ f: nf(r - 24), t, dur: 0.6, gain: 0.25, dest: o });
  },

  minigameWin(A) {
    const t = A.now, o = A.out(0, null, 0.6);
    [[72, 76, 79], [74, 77, 81], [76, 79, 84]].forEach((ch, k) => {
      for (const m of ch) A.tone({ type: 'sawtooth', f: nf(m), t: t + k * 0.16, dur: k === 2 ? 1.1 : 0.2, gain: 0.05, filter: 'lowpass', ff: 3500, dest: o });
    });
    A.bell({ f: nf(96), t: t + 0.32, dur: 1.2, gain: 0.1, dest: o });
  },

  minigameFail(A) {
    const t = A.now, o = A.out(0, null, 0.5);
    [67, 63, 60].forEach((m, k) => A.tone({ type: 'triangle', f: nf(m), t: t + k * 0.18, dur: 0.35, gain: 0.1, dest: o }));
  },

  paddle(A, off = 0) {
    if (!A.claim('mg', 0.1, 2)) return;
    const o = A.out(off * 0.3);
    A.tone({ type: 'square', f: 330 + off * 90, dur: 0.06, gain: 0.07, filter: 'lowpass', ff: 2000, dest: o });
    A.tone({ f: 150, f2: 80, dur: 0.06, gain: 0.2, dest: o });
  },

  brickBreak(A, chain = 1) {
    if (!A.claim('mg', 0.2, 1)) return;
    const o = A.out(0, null, 0.15);
    const scale = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24];
    A.noise({ f: 4500, q: 0.8, filter: 'highpass', dur: 0.06, gain: 0.12, dest: o });
    A.tone({ type: 'triangle', f: nf(72 + scale[Math.min(chain, scale.length - 1)]), dur: 0.12, gain: 0.09, dest: o });
  },

  brickArmor(A) {
    if (!A.claim('mg', 0.2, 1)) return;
    const o = A.out(0, null, 0.1);
    const b = rnd(700, 900);
    for (const [m, k] of [[1, 1], [2.76, 0.5], [5.4, 0.3]]) A.tone({ f: b * m, dur: 0.18, gain: 0.06 * k, dest: o });
    A.noise({ f: 2500, q: 3, dur: 0.03, gain: 0.15, dest: o });
  },

  lockBreak(A) {
    const t = A.now, o = A.out(0, null, 0.6);
    A.noise({ f: 2000, f2: 300, q: 0.7, dur: 0.5, gain: 0.25, dest: o });
    A.tone({ f: 70, f2: 35, dur: 0.5, gain: 0.4, dest: o });
    [84, 88, 91].forEach((m, k) => A.bell({ f: nf(m), t: t + 0.05 + k * 0.05, dur: 0.9, gain: 0.08, dest: o }));
  },

  explosion(A) {
    if (!A.claim('mg', 0.6, 3)) return;
    const o = A.out(0, null, 0.4);
    A.noise({ f: 1800, f2: 90, q: 0.6, filter: 'lowpass', dur: 0.6, gain: 0.35, dest: o });
    A.tone({ f: 90, f2: 30, dur: 0.4, gain: 0.4, dest: o });
  },

  capsule(A) {
    const t = A.now, o = A.out(0, null, 0.3);
    [76, 81, 86, 91].forEach((m, k) => A.tone({ type: 'square', f: nf(m), t: t + k * 0.045, dur: 0.1, gain: 0.05, filter: 'lowpass', ff: 4000, dest: o }));
  },

  alarm(A) {
    if (!A.throttle('alarm', 1.2)) return;
    const t = A.now, o = A.out(0, null, 0.2);
    for (let k = 0; k < 2; k++) {
      A.tone({ type: 'square', f: 880, t: t + k * 0.36, dur: 0.17, gain: 0.04, filter: 'lowpass', ff: 2000, dest: o });
      A.tone({ type: 'square', f: 660, t: t + k * 0.36 + 0.18, dur: 0.17, gain: 0.04, filter: 'lowpass', ff: 2000, dest: o });
    }
  },

  droneHit(A) {
    if (!A.claim('mg', 0.15, 1)) return;
    const o = A.out(0, null, 0.1);
    A.tone({ type: 'sawtooth', f: 1400, f2: 500, dur: 0.08, gain: 0.07, filter: 'bandpass', ff: 1500, q: 2, dest: o });
    A.noise({ f: 3000, q: 2, dur: 0.04, gain: 0.15, dest: o });
  },

  droneExplode(A) {
    if (!A.claim('mg', 0.4, 2)) return;
    const o = A.out(0, null, 0.3);
    A.noise({ f: 2500, f2: 200, q: 0.7, filter: 'lowpass', dur: 0.35, gain: 0.25, dest: o });
    A.tone({ f: 140, f2: 50, dur: 0.25, gain: 0.25, dest: o });
    A.noise({ f: 6000, q: 4, dur: 0.15, gain: 0.06, t: A.now + 0.08, dest: o });
  },

  hullHit(A) {
    const o = A.out(0, null, 0.3);
    A.tone({ f: 60, f2: 28, dur: 0.5, gain: 0.5, dest: o });
    A.noise({ f: 400, q: 0.6, filter: 'lowpass', dur: 0.4, gain: 0.3, dest: o });
    SFX.alarm(A);
  },

  laser(A) {
    if (!A.claim('mg', 0.12, 1)) return;
    const o = A.out(0);
    A.tone({ type: 'square', f: 1600, f2: 300, dur: 0.12, gain: 0.04, filter: 'lowpass', ff: 3000, dest: o });
  },

  waveStart(A) {
    const t = A.now, o = A.out(0, null, 0.5);
    A.tone({ f: 1200, dur: 0.25, gain: 0.08, t, dest: o });
    A.tone({ f: 1200, dur: 0.6, gain: 0.05, t: t + 0.35, dest: o });
    A.noise({ f: 300, f2: 3000, q: 4, dur: 0.6, gain: 0.05, t, dest: o });
  },

  turret(A) {
    if (!A.claim('mg', 0.08, 0)) return;
    const o = A.out(0);
    A.tone({ type: 'square', f: 2400, f2: 900, dur: 0.06, gain: 0.025, dest: o });
  },

  bossHit(A) {
    const t = A.now, o = A.out(0, null, 0.4);
    A.tone({ f: 80, f2: 35, dur: 0.4, gain: 0.5, dest: o });
    A.noise({ f: 1500, f2: 200, q: 0.8, dur: 0.35, gain: 0.25, dest: o });
    A.tone({ type: 'sawtooth', f: 160, f2: 60, dur: 0.4, gain: 0.08, filter: 'lowpass', ff: 900, t: t + 0.03, dest: o });
  },

  bossShield(A) {
    if (!A.claim('mg', 0.2, 1)) return;
    const o = A.out(0, null, 0.2);
    A.tone({ type: 'sawtooth', f: 2000, f2: 600, dur: 0.12, gain: 0.05, filter: 'bandpass', ff: 1800, q: 3, dest: o });
    A.noise({ f: 5000, q: 3, dur: 0.06, gain: 0.08, dest: o });
  },

  bossPhase(A) {
    const t = A.now, o = A.out(0, null, 0.7);
    A.tone({ type: 'sawtooth', f: 400, f2: 40, dur: 1.4, gain: 0.12, filter: 'lowpass', ff: 3000, ff2: 200, dest: o });
    A.noise({ f: 3000, f2: 100, q: 0.5, dur: 1.2, gain: 0.2, dest: o });
    A.tone({ f: 50, f2: 25, dur: 1.2, gain: 0.5, t: t + 0.1, dest: o });
  },

  bossWarn(A) {
    const t = A.now, o = A.out(0);
    for (let k = 0; k < 5; k++) A.tone({ type: 'square', f: 500 + k * 120, t: t + k * (0.2 - k * 0.025), dur: 0.06, gain: 0.05, dest: o });
  },

  bossDefeat(A) {
    const t = A.now, o = A.out(0, null, 0.8);
    for (let k = 0; k < 6; k++) A.noise({ f: 2000 - k * 200, f2: 100, q: 0.6, filter: 'lowpass', dur: 0.5, gain: 0.3, t: t + k * 0.22, dest: o });
    A.tone({ f: 60, f2: 20, dur: 2, gain: 0.5, t, dest: o });
    for (const m of [69, 73, 76, 81]) A.tone({ type: 'sawtooth', f: nf(m), t: t + 1.4, dur: 1.8, gain: 0.05, filter: 'lowpass', ff: 800, ff2: 5000, fglide: 0.3, dest: o });
  },
};

// sons des minijeux définis dans leurs propres modules
Object.assign(SFX, SFX_DEFENSE, SFX_BREAKOUT, SFX_SINGULARITY, SFX_GRAFFITI, SFX_VAULT, SFX_CYBERBALL, SFX_BUGS, SFX_MAZE);
