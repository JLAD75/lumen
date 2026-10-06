import { MINI_SECTORS } from '../config.js';
import { fmt } from '../util/math.js';
import { load } from '../util/storage.js';

// Fin de session : cinématique (signal perdu, extinction du plateau, NULL prend la main),
// rapport d'opération (score, statistiques, classement), saisie d'initiales façon borne
// d'arcade, puis tableau des scores animé en boucle pendant la musique de fin.
// Piloté par UI.update (temps réel) : aucune minuterie du navigateur, tout s'arrête avec stop().

const CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
// repères de la cinématique (s depuis la fin de partie)
const T = { shut: 0.5, lumenOff: 2.05, nullOn: 4.15, title: 4.9, score: 6.5, count: 2.8, stats: 10, step: 0.42 };
const SLICE_COLS = ['#29e3ff', '#ff3df2', '#ff4060', '#ffffff'];
const FW_COLS = ['#ffd84a', '#ff3df2', '#29e3ff', '#5dff8f', '#ffffff'];

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ord = (n) => n === 1 ? '1<sup>er</sup>' : `${n}<sup>e</sup>`;
const duration = (s) => { s = Math.floor(s || 0); return s < 60 ? `${s} s` : `${Math.floor(s / 60)} min ${String(s % 60).padStart(2, '0')} s`; };

// Lignes du tableau des scores (fin de session et écran d'accueil).
// o.n : nombre de lignes (cases vides en pointillés), o.me : ligne à mettre en avant, o.you : score hors classement.
export function scoreRows(list, o = {}) {
  const n = o.n ?? 10, me = o.me ?? -1;
  const row = (cls, i, rk, nm, lv, sc) => `<li class="lb-row${cls}" style="--i:${i}"><b class="rk">${rk}</b><span class="nm">${nm}</span><i class="ld"></i><span class="lv">${lv}</span><span class="sc">${sc}</span></li>`;
  let h = '';
  for (let i = 0; i < n; i++) {
    const e = list[i];
    const cls = (e && i < 3 ? ' r' + (i + 1) : '') + (i === me ? ' me' : '') + (e ? '' : ' empty');
    h += row(cls, i, String(i + 1).padStart(2, '0'), e ? esc(e.name) : '···', e && e.level ? 'NIV ' + e.level : '', e ? fmt(e.score) : '—');
  }
  if (o.you) h += row(' you', n, '—', 'VOUS', o.you.level ? 'NIV ' + o.you.level : '', fmt(o.you.score));
  return h;
}

export class GameOverSeq {
  constructor(ui) {
    this.ui = ui;
    const root = this.root = document.getElementById('screen-over');
    const q = (s) => root.querySelector(s);
    this.e = {
      stage: q('.go-stage'), veil: q('.go-veil'), flash: q('.go-flash'), signal: q('.go-signal'),
      status: q('.go-status'), bar: q('.go-bar i'), pct: q('.go-pw b'), msg: q('.go-msg'),
      head: q('.go-head'), title: q('.go-title'), report: q('.go-report'), score: q('.go-score'), stats: q('.go-stats'), rank: q('.go-rank'),
      side: q('.go-side'), entry: q('.go-entry'), slots: [...root.querySelectorAll('.go-slot')], hint: q('.go-hint'),
      board: q('.go-board'), lb: q('.go-board .lb'), tabs: [...root.querySelectorAll('.go-tabs button')],
      menu: q('.go-menu'), skip: q('.go-skip'), sparks: q('.go-sparks'),
    };
    this.active = false; this.phase = 'off'; this.d = null; this.game = null;
    this.t = 0; this.guardAt = -9; this.timers = []; this.fws = []; this.rep = null; this.wide = null;
    this.count = null; this.statsT = null; this.boardT = null; this.ent = null; this.rows = [];
    this._bind();
  }

  get settings() { return this.ui.settings; }
  get touch() { return this.ui.touch; }

  _bind() {
    const e = this.e;
    // toucher ou clic pendant la cinématique : passer au résultat
    this.root.addEventListener('pointerdown', (ev) => {
      if (!this.active || this.phase !== 'cine') return;
      ev.preventDefault();
      this.skip();
    });
    // cases : toucher pour corriger une lettre (jamais de focus : Entrée valide toujours la saisie)
    e.slots.forEach((s, i) => {
      s.addEventListener('pointerdown', (ev) => ev.preventDefault());
      s.addEventListener('click', (ev) => { ev.preventDefault(); s.blur(); if (ev.detail !== 0 && this._ok()) this._select(i); });
    });
    for (const b of this.root.querySelectorAll('.go-key')) {
      const k = b.dataset.key;
      const act = () => {
        if (!this._ok()) return;
        if (k === 'ok') { this._validate(); return; }
        const d = k === 'next' ? 1 : -1;
        this._cycle(d);
        this.rep = { d, t: 0.42 };      // maintien : défilement automatique
      };
      // pas de focus au toucher : Espace et Entrée restent des commandes de jeu
      b.addEventListener('pointerdown', (ev) => { ev.preventDefault(); act(); });
      b.addEventListener('click', (ev) => { ev.preventDefault(); b.blur(); if (ev.detail === 0) { act(); this.rep = null; } });
      for (const n of ['pointerup', 'pointercancel', 'pointerleave']) b.addEventListener(n, () => { this.rep = null; });
    }
    e.tabs.forEach((b) => b.addEventListener('click', (ev) => { ev.preventDefault(); b.blur(); this._view(b.dataset.view); this.altT = 16; }));
    window.addEventListener('keydown', (ev) => this._key(ev));
  }

  // ------------------------------------------------------------ cycle de vie
  start(d) {
    this.stop();
    const e = this.e;
    this.d = d; this.active = true; this.phase = 'cine';
    this.t = 0; this.cue = 0; this.fast = false; this.guardAt = -9;
    this.saved = false; this.me = -1; this.ent = null; this.view = 'report'; this.altT = 0; this.pct = -1;
    this.rec = d.rank === 0 && d.score > 0;
    this.ranked = d.rank >= 0 && d.score > 0;
    // titre en tranches (assemblage glitché)
    const txt = 'FIN DE SESSION', N = 7;
    let h = `<span class="go-sz">${txt}</span>`;
    for (let i = 0; i < N; i++) {
      const dx = Math.round((Math.random() < 0.5 ? -1 : 1) * (50 + Math.random() * 190));
      // bandes jointives ; les bords extérieurs débordent pour ne pas rogner le halo néon
      const t0 = i ? (i * 100 / N - 0.6).toFixed(2) + '%' : '-60px', b0 = i < N - 1 ? (100 - (i + 1) * 100 / N - 0.6).toFixed(2) + '%' : '-60px';
      h += `<span class="sl" aria-hidden="true" style="--i:${i};--t:${t0};--b:${b0};--dx:${dx}px;--sc:${SLICE_COLS[i % 4]}">${txt}</span>`;
    }
    e.title.innerHTML = h;
    // rapport : score (largeur fixe par chiffre) et statistiques
    const s = fmt(d.score);
    e.score.style.setProperty('--em', ([...s].reduce((a, c) => a + (c === ' ' ? 0.32 : 0.8), 0) + 0.3).toFixed(2));
    this.scoreStr = null;
    this._setScore(0);
    const st = d.stats || {}, sec = d.sectors || {};
    const done = MINI_SECTORS.filter(k => sec[k] && sec[k].done).length;
    const n = (v) => fmt(v);
    this.rows = [
      ['Niveau de sécurité', d.level || 1, n],
      ['Secteurs réactivés', done, (v) => `${v} / ${MINI_SECTORS.length}`],
      ['Minijeux gagnés', st.minigamesWon || 0, (v) => `${v} / ${st.minigamesPlayed || 0}`],
      ['Victoires sur NULL', st.bossWins || 0, n],
      ['Jackpots', st.jackpots || 0, (v) => n(v) + (st.superJackpots ? ` + ${st.superJackpots} super` : '')],
      ['Multibilles', st.multiballs || 0, n],
      ['Meilleur combo', st.bestCombo || 0, (v) => v ? '×' + v : '—'],
      ['Skill shots', st.skillShots || 0, n],
      ['Missions réussies', st.missions || 0, n],
      ['Durée de session', st.time || 0, (v) => duration(v)],
    ].map(([k, v, f]) => ({ k, v, f, on: false, done: false, t0: 0 }));
    e.stats.innerHTML = this.rows.map((r) => `<li style="--n:${r.k.length}"><span class="k">${r.k}</span><i class="ld"></i><span class="v">${r.f(0)}</span></li>`).join('');
    this.rowEls = [...e.stats.children];
    this.statsT = null; this.boardT = null; this.count = null;
    e.skip.textContent = this.touch ? 'Toucher pour passer ▸▸' : 'Espace / Entrée : passer ▸▸';
    const rankAt = T.stats + this.rows.length * T.step + 0.5;
    this.cues = [
      [0, '_impact'], [T.shut, '_shutdown'], [T.lumenOff, '_lumenOff'], [T.nullOn, '_null'], [T.title, '_title'],
      [T.score, '_score'], [T.stats, '_stats'], [rankAt, '_rank'], [rankAt + (this.rec ? 2.4 : 1.6), '_result'],
    ];
    this._layout();
  }

  // Remet tout à zéro (nouvelle partie, retour au menu) : rien ne doit continuer à tourner.
  stop() {
    const r = this.game && this.game.renderer;
    if (r && r.powerOn) r.powerOn();
    if (!this.active && !this.d) return;
    const e = this.e;
    this.active = false; this.phase = 'off'; this.d = null;
    this.timers.length = 0; this.rep = null; this.count = null; this.statsT = null; this.boardT = null; this.ent = null;
    for (const f of this.fws) f.el.remove();
    this.fws.length = 0;
    e.sparks.textContent = '';
    for (const el of [...this.root.querySelectorAll('.on')]) el.classList.remove('on');
    e.stage.className = 'go-stage'; delete e.stage.dataset.view; this.wide = null;
    e.side.classList.remove('entry', 'board'); e.entry.classList.remove('done', 'ready');
    e.veil.classList.remove('lift');
    e.score.className = 'go-score'; e.score.textContent = ''; e.stats.textContent = ''; e.lb.textContent = '';
    e.rank.className = 'go-rank'; e.rank.textContent = '';
    e.msg.className = 'go-msg'; e.msg.textContent = '';
  }

  update(game, dt) {
    this.game = game;
    if (!this.active) return;
    this.t += dt;
    this._layout();
    while (this.cue < this.cues.length && this.t >= this.cues[this.cue][0]) this[this.cues[this.cue++][1]]();
    for (let i = 0; i < this.timers.length;) {
      if (this.t >= this.timers[i].t) this.timers.splice(i, 1)[0].fn(); else i++;
    }
    for (let i = this.fws.length - 1; i >= 0; i--) if (this.t >= this.fws[i].end) { this.fws[i].el.remove(); this.fws.splice(i, 1); }
    this._tickStatus();
    this._tickCount();
    this._tickStats();
    this._tickBoard();
    if (this.rep && this.phase === 'entry') { this.rep.t -= dt; if (this.rep.t <= 0) { this.rep.t = 0.085; this._cycle(this.rep.d); } }
    if (this.phase === 'idle') this._tickIdle(dt);
  }

  later(t, fn) { this.timers.push({ t: this.t + t, fn }); }

  // ------------------------------------------------------------ commandes
  // Entrée (confirm), Espace / ↓ (launchKey), Échap (pause) : routées par main.js en fin de partie.
  command(cmd, focusedBtn) {
    if (!this.active) return false;
    const go = cmd === 'confirm' || cmd === 'launchKey';
    if (this.phase === 'cine') { this.skip(); return true; }
    if (this.phase === 'entry') { if (go && this._ok()) this._validate(); return true; }
    if (this.phase === 'idle' && go && !focusedBtn && this._ok()) {
      if (this.ui.h.sfx) this.ui.h.sfx('uiClick');
      this.ui.action('play');
    }
    return true;
  }

  // Clavier pendant la saisie : ← → changent la lettre, ⌫ revient, lettres et chiffres s'inscrivent directement.
  _key(ev) {
    if (!this.active || this.phase !== 'entry' || ev.ctrlKey || ev.metaKey || ev.altKey) return;
    const k = ev.key;
    if (k === 'ArrowLeft') this._cycle(-1);
    else if (k === 'ArrowRight' || k === 'ArrowUp') this._cycle(1);
    else if (k === 'Backspace' || k === 'Delete') { if (!ev.repeat) this._back(); }
    else if (k.length === 1 && /[a-z0-9]/i.test(k)) { if (!ev.repeat) this._type(k.toUpperCase()); }
    else return;
    ev.preventDefault();
  }

  // délai de garde après un saut ou un changement d'étape (un toucher ne déclenche pas deux actions)
  _ok() { return this.t - this.guardAt > 0.45; }
  canLeave() { return !this.active || (this.phase !== 'cine' && this._ok()); }

  // Quitter (Rejouer / Menu) pendant la saisie : le score est enregistré avec les initiales en cours.
  leave() {
    if (this.active && this.ent && !this.saved) this._save(true);
  }

  // Passer la cinématique : tout s'affiche dans son état final, puis le résultat.
  skip() {
    if (!this.active || this.phase !== 'cine') return;
    const e = this.e, r = this.game && this.game.renderer;
    this.fast = true;
    e.stage.classList.add('go-fast');
    while (this.cue < this.cues.length) this[this.cues[this.cue++][1]]();
    if (r && r.shutdownEnd) r.shutdownEnd();
    if (this.count && !this.count.done) this._countEnd(true);
    this.rows.forEach((x, i) => { if (!x.done) this._row(i, true); });
    for (const el of [e.signal, e.flash, e.status]) el.classList.remove('on');
    this.fast = false;
    this.guardAt = this.t;
  }

  // ------------------------------------------------------------ cinématique
  _impact() {
    if (this.fast) return;
    const g = this.game, r = g.renderer;
    if (r.glitch) r.glitch(1, this.settings.reducedFx ? 0.5 : 1.4);
    if (r.pulse) r.pulse('#ff2050', 1.5);
    g.fx.flash('#ff2040', 0.9);
    g.fx.shake(14);
    this._place();
    this._on(this.e.flash); this._on(this.e.signal);
  }

  _shutdown() {
    const r = this.game.renderer;
    if (r.shutdown) r.shutdown({ pre: 0.45, dur: 2.8, redAt: T.nullOn - T.shut });
    if (this.fast) return;
    this.game.sfx('warpOut');
    this._on(this.e.status);
  }

  _lumenOff() {
    if (this.fast) return;
    this._msg('◉ LUMEN · hors ligne', 'lumen');
    this.game.sfx('drainMulti');
  }

  _null() {
    if (this.fast) return;
    const g = this.game, r = g.renderer;
    this._msg('▲ NULL · contrôle total de la station', 'null');
    g.sfx('bossWarn');
    if (r.glitch) r.glitch(0.7, 0.5);
    if (r.pulse) r.pulse('#ff2050', 1);
  }

  _title() {
    const e = this.e;
    for (const el of [e.signal, e.flash, e.status]) el.classList.remove('on');
    this._on(e.veil); this._on(e.head);
    if (!this.fast) this.game.sfx('shutter');
  }

  _score() {
    this._on(this.e.report);
    this.count = { t0: this.t, dur: this.d.score > 0 ? T.count : 0.4, tick: 0, done: false };
    if (this.fast) this._countEnd(true);
    else if (this.d.score > 0) this.game.sfx('warpIn');
  }

  _stats() {
    this.statsT = this.t;
    if (this.fast) this.rows.forEach((x, i) => this._row(i, true));
  }

  _rank() {
    const d = this.d, e = this.e, g = this.game, list = this.ui.h.scores().list;
    const best = d.best ?? (list[0] ? list[0].score : 0);
    let cls = 'out', m1 = 'HORS CLASSEMENT', m2 = '';
    if (this.rec) {
      cls = 'rec'; m1 = 'NOUVEAU RECORD !';
      m2 = best > 0 ? `Ancien record ${fmt(best)} · +${fmt(d.score - best)}` : 'Premier record de la station';
    } else if (this.ranked) {
      cls = 'top'; m1 = `CLASSEMENT : ${ord(d.rank + 1)}`;
      m2 = best > 0 ? `Record à battre : ${fmt(best)}` : '';
    } else {
      m2 = d.score <= 0 ? 'Aucun point marqué' : list.length >= 10 ? `Il manquait ${fmt(list[9].score - d.score + 1)} points pour le top 10` : '';
    }
    e.rank.className = 'go-rank ' + cls;
    e.rank.innerHTML = `<div class="rm1">${m1}</div>${m2 ? `<div class="rm2">${m2}</div>` : ''}`;
    this._on(e.rank);
    if (this.rec) {
      e.score.classList.add('gold');
      g.sfx('extraBall');
      this.later(0.55, () => g.sfx('jackpot'));
      if (g.say) g.say('highScore');
      this._celebrate(5);
    } else if (this.ranked) {
      g.sfx('skillShot');
      this._celebrate(2, '#29e3ff');
    } else g.sfx('missionFail');
  }

  _result() {
    this.phase = 'result';
    this.guardAt = this.t;
    this._on(this.e.menu);
    if (this.ranked && !this.saved) this._entryStart(); else this._boardStart();
  }

  // ------------------------------------------------------------ animations continues
  _tickStatus() {
    if (!this.e.status.classList.contains('on')) return;
    const S = this.game.renderer.shut;
    const p = S ? Math.round(100 * (1 - (S.u || 0))) : 100;
    if (p === this.pct) return;
    this.pct = p;
    this.e.pct.textContent = p + ' %';
    this.e.bar.style.width = p + '%';
    this.e.status.style.setProperty('--pc', p > 60 ? '#29e3ff' : p > 25 ? '#ffb52e' : '#ff2a4a');
  }

  _setScore(v) {
    const s = fmt(v);
    if (s === this.scoreStr) return;
    this.scoreStr = s;
    this.e.score.innerHTML = [...s].map(c => c === ' ' ? '<i class="s"></i>' : `<i class="d">${c}</i>`).join('');
  }

  _tickCount() {
    const c = this.count;
    if (!c || c.done) return;
    const p = Math.min(1, (this.t - c.t0) / c.dur);
    this._setScore(Math.round(this.d.score * (1 - Math.pow(1 - p, 3))));
    if (this.t >= c.tick && p < 1 && this.d.score > 0) { c.tick = this.t + 0.075; this.game.sfx('missionTick', p); }
    if (p >= 1) this._countEnd(false);
  }

  _countEnd(quiet) {
    this.count.done = true;
    this._setScore(this.d.score);
    if (quiet) return;
    this._replay(this.e.score, 'punch');
    this.game.sfx('reward');
    const r = this.game.renderer;
    if (r.pulse) r.pulse('#29e3ff', 0.9);
  }

  _row(i, fast) {
    const x = this.rows[i], el = this.rowEls[i];
    x.on = true; x.t0 = this.t;
    el.classList.add('on');
    if (fast) { x.done = true; el.querySelector('.v').textContent = x.f(x.v); }
    else this.game.sfx('uiMove');
  }

  _tickStats() {
    if (this.statsT === null) return;
    this.rows.forEach((x, i) => {
      if (!x.on && this.t >= this.statsT + i * T.step) this._row(i, false);
      if (x.on && !x.done) {
        const p = Math.max(0, Math.min(1, (this.t - x.t0 - 0.12) / 0.35));
        this.rowEls[i].querySelector('.v').textContent = x.f(p >= 1 ? x.v : Math.round(x.v * p));
        if (p >= 1) x.done = true;
      }
    });
  }

  // une note par ligne du tableau qui arrive
  _tickBoard() {
    if (this.boardT === null || this.boardTick >= this.boardRows) return;
    const n = Math.floor((this.t - this.boardT) / 0.085);
    if (n > this.boardTick && n >= 0) { this.boardTick = n; this.game.sfx('uiMove'); }
  }

  _tickIdle(dt) {
    // petit écran : rapport et classement en alternance ; grand écran : le tableau se recompose de temps en temps
    this.altT -= dt;
    if (this.altT <= 0) {
      if (this.wide) { this.altT = 24; this._replay(this.e.lb, 'on'); }
      else { this.altT = 10; this._view(this.view === 'board' ? 'report' : 'board'); }
    }
    // record : feux d'artifice de temps en temps
    if (this.fwN > 0) { this.fwT -= dt; if (this.fwT <= 0) { this.fwT = 5 + Math.random() * 3; this.fwN--; this._celebrate(2, null, true); } }
  }

  // ------------------------------------------------------------ initiales
  _entryStart() {
    const e = this.e;
    this.phase = 'entry';
    const last = String(load('lastName', '') || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 3);
    this.ent = { l: (last + 'AAA').slice(0, 3).split(''), cur: 0 };
    e.side.classList.add('entry'); e.side.classList.remove('board');
    this._on(e.side);
    this._view('entry');
    e.hint.innerHTML = this.touch
      ? '◀ ▶ changent la lettre · OK valide · touchez une case pour la corriger'
      : '<kbd>←</kbd> <kbd>→</kbd> lettre · <kbd>Espace</kbd>/<kbd>Entrée</kbd> valider · <kbd>⌫</kbd> retour · ou tapez vos initiales';
    e.skip.textContent = '';
    this._drawEntry();
  }

  _drawEntry() {
    const E = this.ent;
    this.e.slots.forEach((s, i) => {
      s.textContent = E.l[i];
      s.classList.toggle('cur', i === E.cur);
      s.classList.toggle('set', i < E.cur);
    });
    this.e.entry.classList.toggle('ready', E.cur >= 3);
  }

  _cycle(d) {
    const E = this.ent;
    if (!E || this.phase !== 'entry') return;
    if (E.cur > 2) E.cur = 2;
    const i = CHARS.indexOf(E.l[E.cur]);
    E.l[E.cur] = CHARS[(Math.max(0, i) + d + CHARS.length) % CHARS.length];
    this.game.sfx('uiMove');
    this._drawEntry();
    this._replay(this.e.slots[E.cur], d > 0 ? 'up' : 'dn');
  }

  _validate() {
    const E = this.ent;
    if (!E || this.phase !== 'entry') return;
    if (E.cur >= 2) { this._save(false); return; }
    E.cur++;
    this.game.sfx('uiClick');
    this._drawEntry();
  }

  _back() {
    const E = this.ent;
    if (!E || E.cur <= 0) return;
    E.cur--;
    this.game.sfx('uiMove');
    this._drawEntry();
  }

  _type(ch) {
    const E = this.ent;
    if (!E || E.cur > 2) return;
    E.l[E.cur] = ch;
    this._replay(this.e.slots[E.cur], 'up');
    E.cur++;
    this.game.sfx('uiClick');
    this._drawEntry();
  }

  _select(i) {
    const E = this.ent;
    if (!E || this.phase !== 'entry') return;
    E.cur = i;
    this.game.sfx('uiMove');
    this._drawEntry();
  }

  _save(quiet) {
    const name = this.ent.l.join('');
    this.ui.h.saveScore(name);
    this.saved = true;
    const list = this.ui.h.scores().list, sc = Math.floor(this.d.score);
    this.me = list.findIndex((x, i) => i >= this.d.rank && x.name === name && x.score === sc);
    if (this.me < 0) this.me = list.findIndex((x) => x.name === name && x.score === sc);
    if (quiet) return;
    this.phase = 'saving';
    this.e.entry.classList.add('done');
    this.game.sfx('missionComplete');
    this.later(0.8, () => this._boardStart());
  }

  // ------------------------------------------------------------ tableau des scores
  _boardStart() {
    const e = this.e, list = this.ui.h.scores().list;
    this.phase = 'idle';
    this.guardAt = this.t;
    e.entry.classList.remove('done');
    e.side.classList.remove('entry'); e.side.classList.add('board');
    this._on(e.side);
    e.lb.innerHTML = scoreRows(list, { n: 10, me: this.me, you: this.ranked ? null : { score: this.d.score, level: this.d.level } });
    this.boardRows = e.lb.children.length;
    this._replay(e.lb, 'on');
    this._on(e.board);
    this.boardT = this.t + 0.3; this.boardTick = 0;
    this._view('board');
    this.altT = 12;
    e.stage.classList.add('idle');
    e.skip.textContent = this.touch ? '' : 'Entrée / Espace : rejouer';
    this.fwN = this.rec ? 6 : 0; this.fwT = 5;
    // afficheur : boucle d'attente avec les meilleurs scores
    this.ui.dmd.setHiscores(list);
    this.ui.dmd.setMode('attract');
  }

  _view(v) {
    this.view = v;
    this.e.stage.dataset.view = v;
    for (const b of this.e.tabs) b.classList.toggle('cur', b.dataset.view === v);
  }

  // ------------------------------------------------------------ effets
  // Gerbes : dans le plateau (coordonnées monde, via game.fx) et à l'écran (particules DOM).
  _celebrate(n, col = null, quiet = false) {
    const g = this.game, r = g.renderer, rm = this.settings.reducedMotion;
    const cols = col ? [col, '#ffffff'] : FW_COLS;
    if (r.pulse) r.pulse(cols[0], quiet ? 0.6 : 1.2);
    if (this.rec && !quiet) { this.e.veil.classList.add('lift'); this.later(2.8, () => this.e.veil.classList.remove('lift')); }
    if (rm) return;
    for (let i = 0; i < n; i++) {
      this.later(i * 0.42, () => {
        const c = cols[i % cols.length];
        const x = 110 + Math.random() * 380, y = -60 + Math.random() * 400;
        g.fx.burst(x, y, c, 30, 460);
        g.fx.ring(x, y, c, 150, 0.7);
        this._firework(i, c);
      });
    }
  }

  _firework(i, color) {
    const W = window.innerWidth, H = window.innerHeight;
    let x, y;
    const R = this.e.rank.getBoundingClientRect();
    if (i % 2 === 0 && R.width > 0) { x = R.left + R.width * (0.15 + Math.random() * 0.7); y = R.top - 10 - Math.random() * Math.min(140, H * 0.2); }
    else { x = W * (0.12 + Math.random() * 0.76); y = H * (0.1 + Math.random() * 0.4); }
    const k = this.settings.reducedFx ? 0.35 : this.touch ? 0.5 : 1, n = Math.round(34 * k), sz = Math.min(W, H) * (0.2 + Math.random() * 0.1);
    let h = '<b class="core"></b>';
    for (let j = 0; j < n; j++) {
      const a = (j / n) * Math.PI * 2 + Math.random() * 0.3, d = sz * (0.55 + Math.random() * 0.45);
      h += `<i style="--x:${(Math.cos(a) * d).toFixed(1)}px;--y:${(Math.sin(a) * d + sz * 0.35).toFixed(1)}px;--d:${(0.9 + Math.random() * 0.6).toFixed(2)}s"></i>`;
    }
    const el = document.createElement('div');
    el.className = 'fw';
    el.style.cssText = `left:${x.toFixed(0)}px;top:${y.toFixed(0)}px;--c:${color}`;
    el.innerHTML = h;
    this.e.sparks.appendChild(el);
    this.fws.push({ el, end: this.t + 1.8 });
  }

  _msg(text, cls) { this.e.msg.textContent = text; this.e.msg.className = 'go-msg ' + cls; }
  _on(el) { el.classList.add('on'); }
  // relance une animation CSS (classe retirée puis remise)
  _replay(el, cls) { el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls); }

  // place « signal perdu » et la jauge d'alimentation sur le plateau
  _place() {
    const R = this.ui.screenRect, e = this.e;
    if (!R) return;
    e.signal.style.top = (R.y + R.h * 0.4).toFixed(0) + 'px';
    e.status.style.left = (R.x + R.w / 2).toFixed(0) + 'px';
    e.status.style.top = Math.min(window.innerHeight - 90, R.y + R.h * 0.86).toFixed(0) + 'px';
  }

  // deux colonnes (rapport | initiales / classement) si l'écran est assez large
  _layout() {
    const W = window.innerWidth, H = window.innerHeight;
    const wide = W >= 600 && W >= H * 1.25;
    if (wide === this.wide) return;
    this.wide = wide;
    this.e.stage.classList.toggle('go-wide', wide);
  }
}
