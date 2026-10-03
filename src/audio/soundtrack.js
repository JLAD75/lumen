// Bande-son en fichiers (assets/music/*.mp3) : deux platines qui alternent pour les
// fondus enchaînés. Seul le morceau utile est téléchargé (lecture en flux). La musique
// procédurale reste le repli pour tout morceau absent ou illisible.
// Servie en http(s), chaque platine passe par le graphe Web Audio (volume, filtre de pause,
// atténuation sous les voix, iOS compris) ; en file://, le graphe rendrait du silence
// (restriction d'origine) : on règle alors directement le volume de l'élément.

const FILES = {
  title: 'title', table: 'table', multiball: 'multiball', frenzy: 'frenzy', hangar: 'hangar', reactor: 'reactor',
  graffiti: 'graffiti', defense: 'defense', vault: 'vault', arena: 'arena', duel: 'duel', gameover: 'gameover',
};
const FADE = 1.1;          // durée des fondus enchaînés (s)
const LOOP_DIP = 1.4;      // creux de volume autour du point de bouclage (s)
const TRACK_GAIN = 0.85;   // niveau global des pistes face aux effets
// égalisation mesurée (RMS ramené à environ -17,5 dB)
const NORM = {
  title: 1, table: 0.97, multiball: 0.9, frenzy: 0.99, hangar: 0.93, reactor: 0.84, graffiti: 1.03,
  defense: 1.05, vault: 0.76, arena: 1.01, duel: 1.15, gameover: 0.87,
};

export class Soundtrack {
  constructor(A) {
    this.A = A;
    const base = (typeof window !== 'undefined' && window.LN_ASSET_BASE) || '';
    this.base = base + 'assets/music/';
    this.graph = typeof location !== 'undefined' && /^https?:$/.test(location.protocol);
    this.status = {};            // clé → 'ok' | 'error' (inconnu tant que non essayé)
    this.pos = {};               // position mémorisée par morceau (reprise du plateau)
    this.decks = [this._deck(), this._deck()];
    this.active = null;          // platine qui joue le morceau courant
    this.onPlaying = null;       // (clé) → la musique procédurale peut se taire
    this.onFail = null;          // (clé) → revenir à la musique procédurale
    this.hidden = false;
    // application en arrière-plan : les platines s'arrêtent, puis reprennent au retour
    document.addEventListener('visibilitychange', () => {
      this.hidden = document.hidden;
      for (const d of this.decks) {
        if (!d.key) continue;
        if (this.hidden) d.el.pause();
        else if (d.want) this._playEl(d);
      }
    });
  }

  _deck() {
    const el = new Audio();
    el.preload = 'auto';
    el.loop = true;
    if (this.graph) el.crossOrigin = 'anonymous';
    const d = { el, key: null, want: false, vol: 0, target: 0, gain: null };
    if (this.graph) {
      try {
        const ctx = this.A.ctx;
        const src = ctx.createMediaElementSource(el);
        d.gain = ctx.createGain(); d.gain.gain.value = 0;
        src.connect(d.gain); d.gain.connect(this.A.musicIn);
      } catch (_) { this.graph = false; }
    }
    el.addEventListener('error', () => this._failed(d));
    el.addEventListener('playing', () => { if (d.key && d.want) { this.status[d.key] = 'ok'; if (this.onPlaying) this.onPlaying(d.key); } });
    return d;
  }

  usable(key) { return !!FILES[key] && this.status[key] !== 'error'; }

  // Débloque les deux platines pendant le premier geste de l'utilisateur (iOS).
  unlock() {
    for (const d of this.decks) {
      if (d.unlocked) continue;
      d.unlocked = true;
      const p = d.el.play();
      if (p && p.catch) p.then(() => { if (!d.want) d.el.pause(); }).catch(() => {});
    }
  }

  // Joue un morceau ; resume = reprendre là où il s'était arrêté.
  play(key, opts = {}) {
    if (!this.usable(key)) return false;
    const cur = this.active;
    if (cur && cur.key === key && cur.want) return true;
    if (cur && cur.key) this.pos[cur.key] = cur.el.currentTime || 0;
    const d = this.decks.find(x => x !== cur) || this.decks[0];
    if (cur) this._fadeOut(cur);
    const url = this.base + FILES[key] + '.mp3';
    if (d.key !== key || !d.el.src) { d.el.src = url; d.key = key; }
    const start = opts.resume ? (this.pos[key] || 0) : 0;
    const seek = () => { try { d.el.currentTime = start; } catch (_) { /* pas encore prêt */ } };
    if (d.el.readyState >= 1) seek(); else d.el.addEventListener('loadedmetadata', seek, { once: true });
    d.want = true; d.target = 1;
    this.active = d;
    this._playEl(d);
    return true;
  }

  // Nouveau geste de l'utilisateur : relance une platine dont la lecture avait été refusée.
  retry() {
    for (const d of this.decks) if (d.want && d.el.paused && !this.hidden) this._playEl(d);
  }

  stop() {
    for (const d of this.decks) if (d.want) this._fadeOut(d);
    if (this.active && this.active.key) this.pos[this.active.key] = this.active.el.currentTime || 0;
    this.active = null;
  }

  _fadeOut(d) { d.want = false; d.target = 0; }

  _playEl(d) {
    if (this.hidden) return;
    const p = d.el.play();
    if (p && p.catch) p.catch(() => { /* lecture refusée : réessayée au prochain geste */ });
  }

  _failed(d) {
    if (!d.key) return;
    const key = d.key;
    this.status[key] = 'error';
    d.want = false; d.target = 0; d.vol = 0;
    if (this.active === d) this.active = null;
    if (this.onFail) this.onFail(key);
  }

  // Appelé régulièrement : fondus, creux de bouclage, volume en mode direct.
  update(dt) {
    const s = this.A.settings, paused = this.A.paused;
    for (const d of this.decks) {
      if (!d.key) continue;
      const k = Math.min(1, dt / (FADE * 0.35));
      d.vol += (d.target - d.vol) * k;
      if (!d.want && d.vol < 0.01) { d.vol = 0; if (!d.el.paused) d.el.pause(); }
      // creux de volume autour du point de bouclage (fin du morceau → début)
      let dip = 1;
      const T = d.el.duration, t = d.el.currentTime;
      if (T > 10 && Number.isFinite(T)) {
        if (t > T - LOOP_DIP) dip = Math.max(0.15, (T - t) / LOOP_DIP);
        else if (t < LOOP_DIP * 0.5) dip = Math.max(0.15, t / (LOOP_DIP * 0.5));
      }
      const v = d.vol * dip * TRACK_GAIN * (NORM[d.key] || 1);
      if (d.gain) d.gain.gain.setTargetAtTime(v, this.A.ctx.currentTime, 0.05);
      else {
        d.el.muted = !!s.muted;
        d.el.volume = Math.max(0, Math.min(1, v * s.music * (paused ? 0.35 : 1)));
      }
    }
  }
}
