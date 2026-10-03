import { SECTORS, TABLE_W, TABLE_H } from '../config.js';
import { fmt } from '../util/math.js';
import { saveSettings, save } from '../util/storage.js';
import { DMD } from './dmd.js';
import { GameOverSeq, scoreRows } from './gameover.js';

const $ = (s) => document.querySelector(s);
const SECTOR_ICONS = { hangar: '▦', reactor: '⚛', defense: '⛨', core: '☠' };
const STATE_TXT = { locked: 'VERROUILLÉ', prep: 'EN PRÉPARATION', ready: 'ACCESSIBLE', hold: 'EN ATTENTE', done: 'RÉACTIVÉ' };

// Interface DOM : mise en page adaptative (portrait / paysage), HUD, bannières, écrans.
export class UI {
  constructor(settings, handlers) {
    this.settings = settings;
    this.h = handlers;
    this.el = {
      app: $('#app'), hud: $('#hud'), hudTop: $('#hud-top'), score: $('#score'), hiscore: $('#hiscore'),
      balls: $('#balls'), balls2: $('#balls2'), mult: $('#mult'), mult2: $('#mult2'), bonusx: $('#bonusx'), level: $('#level'),
      score2: $('#score2'), lumenBar: $('#lumen-bar'), lumenText: $('#lumen-text'), lumenLog: $('#lumen-log'),
      mgBar: $('#mg-bar'), mgTitle: $('#mg-title'), mgProgress: $('#mg-progress'), mgTime: $('#mg-time'), mgFill: $('#mg-timer-fill'), mgPerk: $('#mg-perk'),
      panelL: $('#panel-left'), panelR: $('#panel-right'), sectors: $('#sectors'), mission: $('#mission'), effects: $('#effects'),
      bottom: $('#hud-bottom'), missionChip: $('#mission-chip'), effectsChips: $('#effects-chips'), goal: $('#goal'), goal2: $('#goal2'),
      launch: $('#btn-launch'), zones: $('#zone-hints'), banner: $('#banner'), tally: $('#tally'),
      pauseBtn: $('#btn-pause'), hiscores: $('#hiscores'), dmd: $('#dmd'),
      screens: { title: $('#screen-title'), help: $('#screen-help'), settings: $('#screen-settings'), pause: $('#screen-pause'), over: $('#screen-over') },
    };
    this.cache = {};
    this.screenStack = [];
    this.bannerT = 0; this.bannerQueue = [];
    this.tallyT = 0;
    this.slowT = 0;
    this.touch = typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches;
    this.el.app.classList.toggle('touch', this.touch);
    this.el.app.classList.toggle('rm', !!settings.reducedMotion);
    // afficheur à points façon vrai flipper (score, événements, messages de LUMEN)
    this.dmd = new DMD(this.el.dmd, settings);
    this.el.hud.classList.add('dmd-on');
    this.view = { x: 0, y: 0, w: TABLE_W, h: TABLE_H, scale: 1 };
    this.bounds = { x0: 0, y0: 0, w: TABLE_W, h: TABLE_H };
    this.over = new GameOverSeq(this);   // fin de session : cinématique et tableau des scores
    this._bind();
    this._safeProbe();
  }

  _safeProbe() {
    const p = document.createElement('div');
    p.style.cssText = 'position:fixed;left:0;top:0;visibility:hidden;padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)';
    document.body.appendChild(p);
    this.probe = p;
  }

  safe() {
    const cs = getComputedStyle(this.probe);
    return { t: parseFloat(cs.paddingTop) || 0, r: parseFloat(cs.paddingRight) || 0, b: parseFloat(cs.paddingBottom) || 0, l: parseFloat(cs.paddingLeft) || 0 };
  }

  _bind() {
    document.querySelectorAll('[data-action]').forEach((b) => {
      b.addEventListener('click', (e) => {
        e.preventDefault();
        this.h.sfx && this.h.sfx('uiClick');
        this.action(b.dataset.action);
      });
    });
    this.el.pauseBtn.addEventListener('pointerdown', (e) => { e.stopPropagation(); e.preventDefault(); this.h.pause(); });
    document.querySelectorAll('[data-set]').forEach((inp) => {
      const k = inp.dataset.set;
      if (inp.type === 'checkbox') inp.checked = !!this.settings[k];
      else inp.value = this.settings[k];
      inp.addEventListener('input', () => {
        this.settings[k] = inp.type === 'checkbox' ? inp.checked : parseFloat(inp.value);
        saveSettings(this.settings);
        if (k === 'reducedMotion') this.el.app.classList.toggle('rm', !!this.settings.reducedMotion);
        this.h.settingsChanged(k);
      });
    });
  }

  action(a) {
    // fin de session : pas de départ involontaire, initiales en cours enregistrées
    if ((a === 'play' || a === 'title') && this.over.active) { if (!this.over.canLeave()) return; this.over.leave(); }
    switch (a) {
      case 'play': this.h.play(); break;
      case 'help': this.open('help'); break;
      case 'settings': this.open('settings'); break;
      case 'back': this.back(); break;
      case 'resume': this.h.resume(); break;
      case 'quit': this.h.quit(); break;
      case 'title': this.h.quit(); break;
      case 'fullscreen': this.h.fullscreen(); break;
    }
  }

  // ------------------------------------------------------------ écrans
  hideScreens() { for (const s of Object.values(this.el.screens)) s.classList.add('hidden'); }
  open(name) {
    const cur = this.screenStack[this.screenStack.length - 1];
    if (cur) this.el.screens[cur].classList.add('hidden');
    this.screenStack.push(name);
    this.el.screens[name].classList.remove('hidden');
    const first = this.el.screens[name].querySelector('.btn.primary, .btn');
    // fin de session : rien n'a le focus (Entrée et Espace pilotent la séquence)
    if (first && !this.touch && name !== 'over') setTimeout(() => first.focus(), 30);
    this.h.menuOpen && this.h.menuOpen(true);
  }
  back() {
    const cur = this.screenStack.pop();
    if (cur) this.el.screens[cur].classList.add('hidden');
    const prev = this.screenStack[this.screenStack.length - 1];
    if (prev) this.el.screens[prev].classList.remove('hidden');
    else this.h.menuOpen && this.h.menuOpen(false);
    if (cur === 'help') save('helpSeen', true);
  }
  topScreen() { return this.screenStack[this.screenStack.length - 1] || null; }

  showTitle() {
    this.over.stop();
    this.hideScreens(); this.screenStack = [];
    this.el.hud.classList.add('hidden');
    this.el.launch.classList.add('hidden');
    this.renderHiscores();
    this.dmd.setHiscores(this.h.scores().list);
    this.dmd.setMode('attract');
    this.open('title');
  }

  onGameStart() {
    this.over.stop();
    this.dmd.setMode('play');
    this.hideScreens(); this.screenStack = [];
    this.h.menuOpen && this.h.menuOpen(false);
    this.el.hud.classList.remove('hidden');
    this.cache = {};
    this.el.lumenLog.innerHTML = '';
    if (this.settings.showZones && this.touch) {
      const z = this.el.zones;
      z.classList.remove('hidden', 'fade');
      clearTimeout(this._zt);
      this._zt = setTimeout(() => { z.classList.add('fade'); setTimeout(() => z.classList.add('hidden'), 900); }, 4200);
    }
  }

  showPause(on) {
    if (on) { this.hideScreens(); this.screenStack = []; this.open('pause'); }
    else { this.hideScreens(); this.screenStack = []; this.h.menuOpen && this.h.menuOpen(false); }
  }

  // Fin de partie : la séquence (src/ui/gameover.js) enchaîne cinématique, rapport,
  // initiales et tableau des scores ; elle est animée par update().
  showGameOver(d) {
    this.hideScreens(); this.screenStack = [];
    this.el.launch.classList.add('hidden');
    this.el.tally.classList.add('hidden'); this.tallyT = 0;
    clearTimeout(this._zt); this.el.zones.classList.add('hidden');
    this.bannerQueue.length = 0; this.bannerT = 0; this.el.banner.classList.remove('show');
    this.over.start(d);
    this.open('over');
  }

  renderHiscores(list) {
    list = list || this.h.scores().list;
    const ol = this.el.hiscores;
    ol.classList.add('lb');
    ol.innerHTML = list.length ? scoreRows(list, { n: Math.min(5, list.length) }) : '<li class="empty">Aucun score enregistré</li>';
  }

  // ------------------------------------------------------------ mise en page
  // Vue inclinée (3D) : le plateau est dessiné à plat sur son canevas, puis basculé en CSS
  // autour de son bord inférieur. Perspective proportionnelle à la taille du plateau :
  // hauteur projetée = h·c, largeur du bord haut = w·k (formules fermées).
  tiltParams(deg = 24) {
    const PK = 1.6;
    const th = deg * Math.PI / 180;
    const k = 1 / (1 + Math.sin(th) / PK);
    return { deg, PK, k, c: Math.cos(th) * k };
  }

  layout() {
    const W = window.innerWidth, H = window.innerHeight;
    const S = this.safe();
    const B = this.bounds;
    const ratio = B.w / B.h;
    const e = this.el;
    const landscape = W / H > 0.82;
    const app = e.app;
    app.classList.toggle('landscape', landscape);
    app.classList.toggle('portrait', !landscape);
    // petit écran en paysage (téléphone couché) : plateau agrandi + caméra de suivi, sans inclinaison
    const follow = landscape && H < 560 && !this.settings.reducedMotion;
    const tilt0 = this.settings.tilt !== false && !follow ? this.tiltParams(24) : null;
    let tilt = tilt0;
    // Si la largeur limite le plateau (portrait), on incline moins (jusqu'à 12°) pour occuper
    // la hauteur disponible : le haut du plateau reste plus lisible.
    const fit = (aw, ah) => {
      tilt = tilt0;
      if (tilt0) {
        const hw = aw / ratio;
        if (hw * tilt0.c < ah) {
          let lo = 12, hi = 24;
          for (let i = 0; i < 12; i++) { const m = (lo + hi) / 2; if (hw * this.tiltParams(m).c > ah) lo = m; else hi = m; }
          tilt = this.tiltParams(hi);
        }
      }
      const c = tilt ? tilt.c : 1;
      const h = Math.max(50, Math.min(ah / c, aw / ratio));
      return { w: h * ratio, h, hp: h * c };
    };
    const dmdH = W < 360 ? 48 : 56;      // afficheur du bandeau supérieur (format 4:1)
    let scr = null, panels = false, scaleOverride = 0;
    if (landscape) {
      let f = fit(W * 0.62, H - 16 - S.t - S.b);
      let x = (W - f.w) / 2;
      const y = (H - f.hp) / 2 + (S.t - S.b) / 2;
      if (follow) { scaleOverride = (f.h / B.h) * 1.6; f = { ...f, w: B.w * scaleOverride }; x = (W - f.w) / 2; }
      const side = x - 14;
      if (side >= 170) {
        panels = true;
        scr = { x, y, w: f.w, h: f.hp, flatH: f.h };
        const pw = Math.min(330, side - 6);
        e.panelL.classList.toggle('compact', pw < 270 || H < 560);
        e.panelR.classList.toggle('compact', pw < 270 || H < 560);
        e.panelL.style.cssText = `display:block;left:${Math.max(8 + S.l, x - pw - 10)}px;width:${pw}px;top:${12 + S.t}px;bottom:${12 + S.b}px`;
        const prw = Math.min(pw, W - x - f.w - 18 - S.r);
        this.rightPanel = { left: x + f.w + 10, width: prw };
        e.panelR.style.cssText = `display:block;left:${x + f.w + 10}px;width:${prw}px;top:${64 + S.t}px;bottom:${12 + S.b}px`;
        e.hudTop.style.display = 'none';
        const dH = Math.round(prw / 4);
        this._placeDmd(false, x + f.w + 10, 12 + S.t, prw, dH);
        const lumenTop = 12 + S.t + dH + 10;
        e.panelR.style.top = (lumenTop + 58) + 'px';
        e.lumenBar.style.cssText = `left:${x + f.w + 10}px;width:${prw}px;top:${lumenTop}px;right:auto;border-radius:10px;border:1px solid rgba(41,227,255,0.25);white-space:normal;min-height:46px;`;
        e.mgBar.style.cssText = `left:${x + 8}px;width:${f.w - 16}px;top:${y + 6}px;`;
        e.bottom.style.display = 'none';
        const lsz = Math.min(96, Math.max(70, side * 0.3));
        e.launch.style.cssText = `width:${lsz}px;height:${lsz}px;right:${16 + S.r}px;bottom:${16 + S.b}px;`;
      } else {
        // paysage étroit : bandeau supérieur (afficheur) + plateau
        const topH = dmdH + 14 + S.t;
        const availH = H - topH - 8 - S.b;
        const f2 = follow ? f : fit(W - 12, availH);
        scr = { x: (W - f2.w) / 2, y: topH + 2, w: f2.w, h: follow ? availH : f2.hp, flatH: follow ? availH : f2.h };
      }
    }
    if (!scr) {
      const topH = dmdH + 14 + S.t;
      const bottomMin = 76 + S.b;
      const f = fit(W - 6 - S.l - S.r, H - topH - bottomMin - 4);
      scr = { x: (W - f.w) / 2, y: topH + 2, w: f.w, h: f.hp, flatH: f.h };
    }
    // placement du canevas du plateau
    let view, cv;
    if (tilt) {
      const mTop = 40, mBot = 40;
      const yb = scr.y + scr.h;
      cv = {
        left: 0, top: yb - scr.flatH - mTop, width: W, height: scr.flatH + mTop + mBot,
        transform: `perspective(${(tilt.PK * scr.flatH).toFixed(1)}px) rotateX(${tilt.deg}deg)`,
        origin: `${(scr.x + scr.w / 2).toFixed(1)}px ${(mTop + scr.flatH).toFixed(1)}px`,
      };
      view = { x: scr.x, y: mTop, w: scr.w, h: scr.flatH, tilt };
    } else {
      cv = { left: 0, top: 0, width: W, height: H, transform: 'none', origin: '50% 50%' };
      view = { x: scr.x, y: scr.y, w: scr.w, h: scr.flatH, follow, scaleOverride };
    }
    view.scale = view.scaleOverride || view.w / B.w;
    view.follow = !!view.follow;
    if (!panels) {
      e.panelL.style.display = 'none';
      e.panelR.style.display = 'none';
      e.hudTop.style.display = '';
      e.hudTop.style.height = (dmdH + 10 + S.t) + 'px';
      this._placeDmd(true, 0, 0, dmdH * 4, dmdH);
      e.lumenBar.style.cssText = `top:${dmdH + 10 + S.t}px;`;
      const bottomH = H - (scr.y + scr.h);
      e.bottom.style.display = '';
      e.bottom.style.width = (W - 110) + 'px';
      const lsz = bottomH >= 92 ? 84 : 66;
      const lb = bottomH >= lsz + 8 ? Math.max(6 + S.b, (bottomH - lsz) / 2) : 10 + S.b;
      e.launch.style.cssText = `width:${lsz}px;height:${lsz}px;right:${12 + S.r}px;bottom:${lb}px;`;
      e.mgBar.style.cssText = bottomH > 70
        ? `left:${8 + S.l}px;width:${W - lsz - 36}px;bottom:${6 + S.b}px;`
        : `left:${scr.x + 8}px;width:${scr.w - 16}px;top:${scr.y + 4}px;`;
    }
    // Annonces : dans le panneau latéral sur grand écran (le plateau reste dégagé),
    // sinon au tiers du plateau, en semi-transparence.
    if (panels) {
      const pr = this.rightPanel;
      e.banner.style.left = (pr.left + pr.width / 2) + 'px';
      e.banner.style.top = (H * 0.42) + 'px';
      e.banner.style.maxWidth = (pr.width + 10) + 'px';
      e.banner.classList.add('side');
    } else {
      e.banner.style.left = (scr.x + scr.w / 2) + 'px';
      e.banner.style.top = (scr.y + scr.h * 0.37) + 'px';
      e.banner.style.maxWidth = (scr.w * 0.92) + 'px';
      e.banner.classList.remove('side');
    }
    e.tally.style.top = (scr.y + scr.h * 0.4) + 'px';
    e.tally.style.left = (scr.x + scr.w / 2) + 'px';
    this.view = view;
    this.mgInWorld = !view.follow && B.y0 < 0;
    this.screenRect = scr;
    this.canvasRect = cv;
    this.panels = panels;
    return view;
  }

  // Afficheur : dans le bandeau supérieur (portrait) ou en tête du panneau droit (grand écran).
  _placeDmd(inTop, x, y, w, h) {
    const el = this.el.dmd, e = this.el;
    if (inTop) { if (el.parentNode !== e.hudTop) e.hudTop.prepend(el); el.style.cssText = 'position:relative;'; }
    else { if (el.parentNode !== e.hud) e.hud.appendChild(el); el.style.cssText = `position:absolute;left:${x}px;top:${y}px;`; }
    e.hud.classList.toggle('dmd-top', inTop);
    this.dmd.resize(Math.round(w), Math.round(h), Math.min(window.devicePixelRatio || 1, 2));
  }

  // ------------------------------------------------------------ messages
  banner(title, sub, color = '#29e3ff', dur = 2, kind = 'banner', data = null) {
    this.dmd.show(kind, { title, sub, color, ...(data || {}) });
    // sans panneau latéral, la bannière couvrirait le plateau : l'afficheur suffit
    if (!this.panels && !(data && data.force)) return;
    this.bannerQueue.push({ title, sub, color, dur });
    if (this.bannerQueue.length > 3) this.bannerQueue.shift();
    if (this.bannerT <= 0) this._nextBanner();
  }

  _nextBanner() {
    const b = this.bannerQueue.shift();
    const el = this.el.banner;
    if (!b) { el.classList.remove('show'); return; }
    el.style.setProperty('--bc', b.color);
    el.innerHTML = `<div class="bt">${escapeHtml(b.title)}</div>${b.sub ? `<div class="bs">${escapeHtml(b.sub)}</div>` : ''}`;
    el.classList.add('show');
    this.bannerT = b.dur;
  }

  lumen(msg) {
    if (msg) this.dmd.say(msg.text, msg.persona);
    const bar = this.el.lumenBar;
    if (!msg) { bar.classList.remove('talk'); return; }
    this.el.lumenText.textContent = msg.persona === 'null' ? 'NULL › ' + msg.text : msg.text;
    bar.classList.toggle('null', msg.persona === 'null');
    bar.classList.add('talk');
    clearTimeout(this._talkT);
    this._talkT = setTimeout(() => bar.classList.remove('talk'), Math.min(2500, msg.text.length * 55));
    const li = document.createElement('li');
    li.textContent = msg.text;
    if (msg.persona === 'null') li.className = 'null';
    this.el.lumenLog.prepend(li);
    while (this.el.lumenLog.children.length > 5) this.el.lumenLog.lastChild.remove();
  }

  tally(b, more) {
    const el = this.el.tally;
    el.innerHTML = `<h4>BONUS DE FIN DE BILLE</h4>` +
      b.lines.map(l => `<div class="l"><span>${l.name} ×${l.n}</span><span>${fmt(l.pts)}</span></div>`).join('') +
      `<div class="l"><span>Multiplicateur</span><span>×${b.mult}</span></div>` +
      `<div class="l tot"><span>Total</span><span>${fmt(b.total)}</span></div>` +
      (more ? '' : '<div class="l" style="justify-content:center;color:#ff4060;margin-top:6px">DERNIÈRE BILLE PERDUE</div>');
    el.classList.remove('hidden');
    this.tallyT = 2.4;
  }

  flashBalls() {
    for (const b of [this.el.balls, this.el.balls2]) { b.classList.remove('flash'); void b.offsetWidth; b.classList.add('flash'); }
  }

  _updateDmd(game, dt) {
    const d = this.dmd;
    if (game.state !== 'title') {
      d.setScore(game.score);
      d.setInfo({ balls: game.ballsLeft, level: game.level, mult: game.bonus.mult, bonusX: game.table.bonusX });
      const mg = game.minigame;
      if (mg && game.scene === 'minigame') {
        const h = mg.hud();
        d.setMinigame({ title: h.title, timeLeft: h.timeLeft, timeLimit: h.timeLimit, progress: h.relaunch ? 'RELANCE' : h.progress, color: h.color });
      } else d.setMinigame(null);
    }
    d.update(dt);
    d.draw();
  }

  // ------------------------------------------------------------ mise à jour par image
  update(game, dt) {
    this.over.update(game, dt);
    if (this.bannerT > 0) { this.bannerT -= dt; if (this.bannerT <= 0) { this.el.banner.classList.remove('show'); setTimeout(() => this._nextBanner(), 220); } }
    if (this.tallyT > 0) { this.tallyT -= dt; if (this.tallyT <= 0) this.el.tally.classList.add('hidden'); }
    this._updateDmd(game, dt);
    if (game.state === 'title') return;
    const c = this.cache, e = this.el;
    const sc = fmt(game.score);
    if (c.score !== sc) { c.score = sc; e.score.textContent = sc; e.score2.textContent = sc; }
    const best = Math.max(game.scores.best, game.score);
    if (c.best !== best) { c.best = best; e.hiscore.textContent = 'Record ' + fmt(best); }
    if (c.balls !== game.ballsLeft) {
      c.balls = game.ballsLeft;
      const n = Math.max(3, game.ballsLeft);
      const html = Array.from({ length: n }, (_, i) => `<i class="${i < game.ballsLeft ? '' : 'off'}"></i>`).join('');
      e.balls.innerHTML = html; e.balls2.innerHTML = html;
    }
    const m = game.bonus.mult;
    const multTxt = (m > 1 ? `×${m} ` : '') + (game.table.combo.count >= 2 ? `COMBO ×${game.table.combo.count}` : '');
    if (c.mult !== multTxt) { c.mult = multTxt; e.mult.textContent = multTxt; e.mult2.textContent = '×' + m; }
    if (c.bonusx !== game.table.bonusX) { c.bonusx = game.table.bonusX; e.bonusx.textContent = '×' + game.table.bonusX; }
    if (c.level !== game.level) { c.level = game.level; e.level.textContent = game.level; }

    // barre de minijeu
    const mg = game.minigame;
    const showMg = !!mg && game.scene === 'minigame';
    if (c.showMg !== showMg || c.mgInWorld !== this.mgInWorld) {
      c.showMg = showMg; c.mgInWorld = this.mgInWorld;
      // l'écran du minijeu est dessiné au-dessus de l'arène, sauf en caméra de suivi
      e.mgBar.classList.toggle('hidden', !showMg || (this.mgInWorld && this.panels));
      e.mgBar.classList.toggle('slim', this.mgInWorld && !this.panels);
      e.missionChip.classList.toggle('hidden', showMg);
      e.goal.classList.toggle('hidden', showMg);
      e.effectsChips.classList.toggle('hidden', showMg);
    }
    if (showMg) {
      const h = mg.hud();
      e.mgBar.style.setProperty('--mg', h.color);
      if (c.mgTitle !== h.title) { c.mgTitle = h.title; e.mgTitle.textContent = h.title; }
      const prog = h.relaunch ? 'BILLE PERDUE — LANCER' : h.progress;
      if (c.mgProg !== prog) { c.mgProg = prog; e.mgProgress.textContent = prog; }
      const tt = Math.ceil(h.timeLeft) + ' s';
      if (c.mgTime !== tt) { c.mgTime = tt; e.mgTime.textContent = tt; e.mgTime.classList.toggle('hurry', h.timeLeft < 10); }
      e.mgFill.style.width = (100 * Math.max(0, h.timeLeft) / h.timeLimit) + '%';
      const perk = h.perk ? `Avantage : ${h.perk.name}` : h.objective;
      if (c.mgPerk !== perk) { c.mgPerk = perk; e.mgPerk.textContent = perk; }
    }

    // bouton de lancement
    let launchVisible = false, charge = 0;
    if (game.state === 'play') {
      if (game.scene === 'table' && game.table.shooterBall && !game.table.plunger.auto) { launchVisible = true; charge = game.table.plunger.charge; }
      if (showMg && mg.launchReady && mg.launchReady()) { launchVisible = true; charge = mg.launchCharge ? mg.launchCharge() : 0; }
    }
    if (c.launch !== launchVisible) { c.launch = launchVisible; e.launch.classList.toggle('hidden', !launchVisible); e.launch.classList.toggle('pulse', launchVisible); }
    if (launchVisible) e.launch.style.setProperty('--charge', charge.toFixed(3));

    // panneaux (rafraîchis 5 fois par seconde)
    this.slowT -= dt;
    if (this.slowT > 0) return;
    this.slowT = 0.2;
    const t = game.table;
    const sectorsHtml = ['hangar', 'reactor', 'defense', 'core'].map(id => {
      const st = t.sectorState(id), S = SECTORS[id];
      const p = st === 'done' ? 1 : t.sectorProgress(id);
      const how = id === 'hangar' ? '3 cibles gauches → rampe du pont' : id === 'reactor' ? '4 cellules du pont → UPLINK' : id === 'defense' ? '3 cibles tombantes → rampe droite' : '3 secteurs → portail';
      return `<li class="${st}" style="--c:${S.color}"><span class="ic" style="color:${S.color}">${SECTOR_ICONS[id]}</span>` +
        `<span class="nm">${S.game}<small>${how}</small></span><span class="st" style="color:${st === 'hold' ? '#ffb52e' : st === 'locked' ? '#7f93b8' : S.color}">${STATE_TXT[st]}</span>` +
        `<span class="bar"><i style="width:${Math.round(p * 100)}%;background:${S.color}"></i></span></li>`;
    }).join('');
    if (c.sectors !== sectorsHtml) { c.sectors = sectorsHtml; e.sectors.innerHTML = sectorsHtml; }
    const goal = t.nextGoal ? t.nextGoal() : null;
    const gk = goal ? goal.text + goal.color : '';
    if (c.goal !== gk) {
      c.goal = gk;
      for (const el of [e.goal, e.goal2]) { el.textContent = goal ? goal.text : ''; el.style.setProperty('--g', goal ? goal.color : ''); }
    }
    const mi = game.missions.hud();
    const missionHtml = mi ? `<div class="mt">${escapeHtml(mi.text)}</div>${mi.progress}/${mi.goal} · ${Math.ceil(mi.timeLeft)} s<div class="mp"><i style="width:${Math.round(100 * mi.progress / mi.goal)}%"></i></div>` : '<span class="muted">En attente d\'une tâche…</span>';
    if (c.mission !== missionHtml) { c.mission = missionHtml; e.mission.innerHTML = missionHtml; }
    const chip = mi && !showMg ? `◆ ${mi.text} ${mi.progress}/${mi.goal} · ${Math.ceil(mi.timeLeft)} s` : '';
    if (c.chip !== chip) { c.chip = chip; e.missionChip.textContent = chip; }
    const eff = game.bonus.active();
    const effHtml = eff.length ? eff.map(x => `<li style="--c:${x.color}"><span>${x.label}</span><span class="t">${x.t >= 0 ? Math.ceil(x.t) + ' s' : x.durable ? 'durable' : ''}</span></li>`).join('') : '<li class="none">Aucun effet actif</li>';
    if (c.eff !== effHtml) { c.eff = effHtml; e.effects.innerHTML = effHtml; }
    const chips = eff.filter(x => !x.durable).slice(0, 5).map(x => `<span style="--c:${x.color}">${x.label}${x.t >= 0 ? ' ' + Math.ceil(x.t) + 's' : ''}</span>`).join('');
    if (c.chips !== chips) { c.chips = chips; e.effectsChips.innerHTML = chips; }
  }
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
}
