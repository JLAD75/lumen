import { SFX } from './sfx.js';
import { Music } from './music.js';
import { Soundtrack } from './soundtrack.js';
import { Voice } from './voice.js';
import { Ambience } from './ambience.js';
import { clamp } from '../util/math.js';

// Moteur audio procédural (Web Audio) : bus séparés musique / effets / voix / ambiance,
// réverbération générée, compression maîtresse, limitation de polyphonie par catégorie.
const LIMITS = { impact: 7, flipper: 4, bumper: 5, event: 6, ui: 3, mg: 8, voice: 3 };

export class AudioEngine {
  constructor(settings) {
    this.settings = settings;
    this.ctx = null;
    this.ready = false;
    this.paused = false;
    this.active = {};
    for (const k of Object.keys(LIMITS)) this.active[k] = [];
    this.throttles = new Map();
    this.music = new MusicProxy();   // utilisable avant le déverrouillage
  }

  // Doit être appelé lors d'une interaction utilisateur (contraintes mobiles).
  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended' && !document.hidden) this.ctx.resume().catch(() => {});
      if (this.soundtrack) this.soundtrack.retry();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    // Mobile : tampon de sortie plus large (« balanced ») ; le plus petit tampon possible
    // (« interactive ») sous-alimente la sortie d'un téléphone modeste dès que le rendu
    // charge le processeur, d'où une musique qui crache. ~20 ms de latence en plus.
    const mobile = typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches;
    this.mobile = mobile;
    try { this.ctx = new AC({ latencyHint: mobile ? 'balanced' : 'interactive' }); } catch (_) { this.ctx = new AC(); }
    const ctx = this.ctx;
    this.master = ctx.createGain();
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16; comp.knee.value = 8; comp.ratio.value = 4; comp.attack.value = 0.004; comp.release.value = 0.2;
    const lim = ctx.createDynamicsCompressor();
    lim.threshold.value = -3; lim.knee.value = 0; lim.ratio.value = 20; lim.attack.value = 0.001; lim.release.value = 0.08;
    this.master.connect(comp); comp.connect(lim); lim.connect(ctx.destination);
    // analyseur de sortie (contrôle des niveaux / saturation en test)
    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 2048;
    lim.connect(this.analyser);
    const bus = (g) => { const n = ctx.createGain(); n.gain.value = g; n.connect(this.master); return n; };
    this.buses = { music: bus(0.5), sfx: bus(0.8), voice: bus(0.7), amb: bus(0.4) };
    // filtre de la musique (pause, tension)
    this.musicIn = ctx.createBiquadFilter();
    this.musicIn.type = 'lowpass'; this.musicIn.frequency.value = 18000; this.musicIn.Q.value = 0.5;
    this.musicDuck = ctx.createGain();
    this.musicIn.connect(this.musicDuck); this.musicDuck.connect(this.buses.music);
    // réverbération
    this.reverb = ctx.createConvolver();
    // le coût de la convolution suit la longueur de la réponse : plus courte sur mobile
    this.reverb.buffer = this.mobile ? this._impulse(1.4, 2.4) : this._impulse(2.4, 2.8);
    this.revOut = ctx.createGain(); this.revOut.gain.value = 0.32;
    this.reverb.connect(this.revOut); this.revOut.connect(this.master);
    this.revSend = ctx.createGain(); this.revSend.gain.value = 1; this.revSend.connect(this.reverb);
    // bruits
    this.noiseBuf = this._noise(2, 'white');
    this.pinkBuf = this._noise(4, 'pink');
    this.ready = true;
    this.applyVolumes();
    const proc = new Music(this);
    this.soundtrack = new Soundtrack(this);
    this.soundtrack.unlock();
    const mix = new MusicMix(proc, this.soundtrack, this);
    this.music.attach(mix);
    this.music = mix;
    this.voice = new Voice(this);
    this.amb = new Ambience(this);
    proc.start();
    // fondus de la bande-son (indépendants de la boucle de jeu, qui s'arrête en pause)
    let last = performance.now();
    setInterval(() => { const now = performance.now(); this.soundtrack.update(Math.min(0.25, (now - last) / 1000)); last = now; }, 50);
    this.amb.start();
    document.addEventListener('visibilitychange', () => {
      if (!this.ctx) return;
      if (document.hidden) this.ctx.suspend().catch(() => {});
      else this.ctx.resume().catch(() => {});
    });
  }

  _impulse(seconds, decay) {
    const ctx = this.ctx, rate = ctx.sampleRate, len = Math.floor(rate * seconds);
    const buf = ctx.createBuffer(2, len, rate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay) * (i < rate * 0.01 ? i / (rate * 0.01) : 1);
    }
    return buf;
  }

  _noise(seconds, kind) {
    const ctx = this.ctx, len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      if (kind === 'pink') { b0 = 0.99765 * b0 + w * 0.099046; b1 = 0.963 * b1 + w * 0.2965164; b2 = 0.57 * b2 + w * 1.0526913; d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.18; }
      else d[i] = w;
    }
    return buf;
  }

  applyVolumes() {
    if (!this.ready) return;
    const s = this.settings, t = this.ctx.currentTime;
    const m = s.muted ? 0 : 1;
    this.master.gain.setTargetAtTime(m, t, 0.05);
    const p = this.paused;
    this.buses.music.gain.setTargetAtTime(s.music * 0.55 * (p ? 0.35 : 1), t, 0.08);
    this.buses.sfx.gain.setTargetAtTime(s.sfx * 0.9 * (p ? 0 : 1), t, 0.05);
    this.buses.voice.gain.setTargetAtTime(s.voice * 0.9 * (p ? 0 : 1), t, 0.05);
    // l'ambiance de la station se tait quand une piste enregistrée joue (ambK = 0)
    this.buses.amb.gain.setTargetAtTime(s.sfx * 0.45 * (p ? 0.3 : 1) * (this.ambK ?? 1), t, 0.6);
    this.musicIn.frequency.setTargetAtTime(p ? 700 : 18000, t, 0.1);
  }

  setAmbience(k) { if (this.ambK !== k) { this.ambK = k; this.applyVolumes(); } }

  setPaused(p) {
    this.paused = p;
    if (!p) this.stopCharge();
    this.applyVolumes();
  }

  get now() { return this.ctx ? this.ctx.currentTime : 0; }

  // Polyphonie : refuse un nouveau son si la catégorie est saturée et moins prioritaire.
  claim(cat, dur, pri = 1) {
    const list = this.active[cat];
    if (!list) return true;
    const now = this.now;
    for (let i = list.length - 1; i >= 0; i--) if (list[i].end <= now) list.splice(i, 1);
    if (list.length >= LIMITS[cat]) {
      let low = 0;
      for (let i = 1; i < list.length; i++) if (list[i].pri < list[low].pri) low = i;
      if (list[low].pri >= pri) return false;
      list.splice(low, 1);
    }
    list.push({ end: now + dur, pri });
    return true;
  }

  throttle(key, seconds) {
    const now = this.now;
    const last = this.throttles.get(key) || -1;
    if (now - last < seconds) return false;
    this.throttles.set(key, now);
    return true;
  }

  // ------------------------------------------------- briques de synthèse
  out(pan = 0, dest, rev = 0) {
    const ctx = this.ctx;
    const g = ctx.createGain();
    let node = g;
    if (pan && ctx.createStereoPanner) {
      const p = ctx.createStereoPanner();
      p.pan.value = clamp(pan, -1, 1);
      g.connect(p); node = p;
    }
    node.connect(dest || this.buses.sfx);
    if (rev > 0) { const s = ctx.createGain(); s.gain.value = rev; g.connect(s); s.connect(this.revSend); }
    return g;
  }

  env(param, t, a, peak, d, sustain = 0.0001, release = 0) {
    param.setValueAtTime(0.0001, t);
    param.linearRampToValueAtTime(peak, t + a);
    param.exponentialRampToValueAtTime(Math.max(0.0001, sustain), t + a + d);
    if (release) param.exponentialRampToValueAtTime(0.0001, t + a + d + release);
  }

  // Oscillateur enveloppé, glissando optionnel, filtre optionnel.
  tone(o) {
    const ctx = this.ctx, t = o.t ?? ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = o.type || 'sine';
    osc.frequency.setValueAtTime(o.f, t);
    if (o.f2) osc.frequency.exponentialRampToValueAtTime(Math.max(1, o.f2), t + (o.glide ?? o.dur));
    if (o.detune) osc.detune.value = o.detune;
    const g = ctx.createGain();
    const a = o.a ?? 0.004, dur = o.dur ?? 0.2;
    this.env(g.gain, t, a, o.gain ?? 0.2, Math.max(0.01, dur - a));
    let node = osc;
    if (o.filter) {
      const f = ctx.createBiquadFilter();
      f.type = o.filter; f.frequency.value = o.ff || 1000; f.Q.value = o.q || 1;
      if (o.ff2) f.frequency.exponentialRampToValueAtTime(o.ff2, t + (o.fglide ?? dur));
      osc.connect(f); node = f;
    }
    node.connect(g);
    g.connect(o.dest || this.out(o.pan || 0, o.bus, o.rev || 0));
    osc.start(t);
    osc.stop(t + dur + 0.05);
    return osc;
  }

  noise(o) {
    const ctx = this.ctx, t = o.t ?? ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = o.pink ? this.pinkBuf : this.noiseBuf;
    src.loop = true;
    const off = Math.random() * 1.5;
    const f = ctx.createBiquadFilter();
    f.type = o.filter || 'bandpass';
    f.frequency.setValueAtTime(o.f || 1000, t);
    if (o.f2) f.frequency.exponentialRampToValueAtTime(o.f2, t + (o.glide ?? o.dur));
    f.Q.value = o.q ?? 1;
    const g = ctx.createGain();
    const a = o.a ?? 0.002, dur = o.dur ?? 0.1;
    this.env(g.gain, t, a, o.gain ?? 0.2, Math.max(0.005, dur - a));
    src.connect(f); f.connect(g);
    g.connect(o.dest || this.out(o.pan || 0, o.bus, o.rev || 0));
    src.start(t, off);
    src.stop(t + dur + 0.05);
    return src;
  }

  // Cloche FM (bumpers, notes de récompense).
  bell(o) {
    const ctx = this.ctx, t = o.t ?? ctx.currentTime;
    const car = ctx.createOscillator(), mod = ctx.createOscillator();
    const mg = ctx.createGain(), g = ctx.createGain();
    car.frequency.value = o.f;
    mod.frequency.value = o.f * (o.ratio || 2);
    const idx = o.f * (o.index || 2.5);
    mg.gain.setValueAtTime(idx, t);
    mg.gain.exponentialRampToValueAtTime(Math.max(1, idx * 0.05), t + (o.dur || 0.5) * 0.6);
    mod.connect(mg); mg.connect(car.frequency);
    this.env(g.gain, t, 0.003, o.gain ?? 0.18, (o.dur || 0.5));
    car.connect(g);
    g.connect(o.dest || this.out(o.pan || 0, o.bus, o.rev ?? 0.3));
    car.start(t); mod.start(t);
    car.stop(t + (o.dur || 0.5) + 0.1); mod.stop(t + (o.dur || 0.5) + 0.1);
  }

  // ------------------------------------------------- API de jeu
  sfx(name, ...args) {
    if (!this.ready || this.paused) return;
    const fn = SFX[name];
    if (!fn) return;
    try { fn(this, ...args); } catch (e) { console.warn('sfx', name, e); }
  }

  impact(mat, speed, x = 300) {
    if (!this.ready || this.paused || speed < 70) return;
    if (!this.throttle('imp-' + mat, 0.022)) return;
    try { SFX.impact(this, mat, speed, x); } catch (e) { console.warn(e); }
  }

  speak(text, persona) {
    if (!this.ready || this.paused || !this.voice) return;
    this.voice.speak(text, persona);
  }

  chargeLevel(c) { if (this.ready && !this.paused) SFX.chargeLevel(this, c); }
  stopCharge() { if (this.ready) SFX.stopCharge(this); }

  pan(x) { return clamp((x / 600) * 2 - 1, -1, 1) * 0.65; }
}

// Aiguillage musical : la piste enregistrée du mode (assets/music) si elle existe,
// sinon la musique procédurale. La multibille a sa propre piste sur le plateau.
const TRACK_OF = {
  title: 'title', table: 'table', brick: 'hangar', reactor: 'reactor', tag: 'graffiti', defense: 'defense',
  vault: 'vault', arena: 'arena', duel: 'duel', gameover: 'gameover',
};
// morceau de remplacement tant qu'un nouveau morceau n'a pas été déposé dans assets/music
const TRACK_FALLBACK = { graffiti: 'hangar', vault: 'reactor', arena: 'defense', frenzy: 'multiball' };

class MusicMix {
  constructor(proc, st, A) {
    this.proc = proc; this.st = st; this.A = A;
    this.mode = 'title'; this.flags = {};
    st.onPlaying = (key) => { if (key === this.key) { this.proc.muted = true; A.setAmbience(0); } };
    st.onFail = () => this._route();
  }

  _route() {
    let key = TRACK_OF[this.mode] || null;
    if (key === 'table' && this.flags.frenzy) key = 'frenzy';
    else if (key === 'table' && this.flags.multiball && this.st.usable('multiball')) key = 'multiball';
    if (key && !this.st.usable(key) && TRACK_FALLBACK[key]) key = TRACK_FALLBACK[key];
    if (key && this.st.usable(key)) {
      if (key !== this.key) this.st.play(key, { resume: key === 'table' });
      this.key = key;
    } else {
      this.key = null;
      this.st.stop();
      this.proc.muted = false;
      this.A.setAmbience(1);
    }
  }

  setMode(m, immediate) { this.mode = m; this.proc.setMode(m, immediate); this._route(); }
  setFlag(k, v) { this.flags[k] = v; this.proc.setFlag(k, v); if (k === 'multiball' || k === 'frenzy') this._route(); }
  setIntensity(v) { this.proc.setIntensity(v); }
  setTension(v) { this.proc.setTension(v); }
  setLevel(l) { this.proc.setLevel(l); }
  bump(x) { this.proc.bump(x); }
  currentChord() { return this.proc.currentChord(); }
}

// Permet d'appeler setMode/setIntensity avant le déverrouillage audio.
class MusicProxy {
  constructor() { this.state = { mode: 'title', intensity: 0.3, tension: 0, flags: {} }; }
  setMode(m) { this.state.mode = m; }
  setIntensity(v) { this.state.intensity = v; }
  setTension(v) { this.state.tension = v; }
  setFlag(k, v) { this.state.flags[k] = v; }
  setLevel(l) { this.state.level = l; }
  bump() {}
  currentChord() { return [220, 261.6, 329.6]; }
  attach(real) {
    real.setMode(this.state.mode, true);
    real.setIntensity(this.state.intensity);
    real.setTension(this.state.tension);
    if (this.state.level) real.setLevel(this.state.level);
    for (const [k, v] of Object.entries(this.state.flags)) real.setFlag(k, v);
  }
}
