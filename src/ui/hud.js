import { SECTORS, TABLE_W, TABLE_H } from '../config.js';
import { fmt } from '../util/math.js';
import { saveSettings, load, save } from '../util/storage.js';

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
      bottom: $('#hud-bottom'), missionChip: $('#mission-chip'), effectsChips: $('#effects-chips'),
      launch: $('#btn-launch'), zones: $('#zone-hints'), banner: $('#banner'), tally: $('#tally'),
      pauseBtn: $('#btn-pause'), hiscores: $('#hiscores'),
      screens: { title: $('#screen-title'), help: $('#screen-help'), settings: $('#screen-settings'), pause: $('#screen-pause'), over: $('#screen-over') },
    };
    this.cache = {};
    this.screenStack = [];
    this.bannerT = 0; this.bannerQueue = [];
    this.tallyT = 0;
    this.slowT = 0;
    this.touch = typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches;
    this.el.app.classList.toggle('touch', this.touch);
    this.view = { x: 0, y: 0, w: TABLE_W, h: TABLE_H, scale: 1 };
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
        this.h.settingsChanged(k);
      });
    });
    $('#name-form').addEventListener('submit', (e) => {
      e.preventDefault();
      const name = ($('#name-input').value || 'OPR').replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 3) || 'OPR';
      this.h.saveScore(name);
      $('#name-form').classList.add('hidden');
      $('#name-input').blur();
    });
  }

  action(a) {
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
    if (first && !this.touch) setTimeout(() => first.focus(), 30);
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
    this.hideScreens(); this.screenStack = [];
    this.el.hud.classList.add('hidden');
    this.el.launch.classList.add('hidden');
    this.renderHiscores();
    this.open('title');
  }

  onGameStart() {
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

  showGameOver(d) {
    this.hideScreens(); this.screenStack = [];
    this.el.launch.classList.add('hidden');
    $('#final-score').textContent = fmt(d.score);
    $('#final-rank').textContent = d.rank === 0 ? 'NOUVEAU RECORD !' : d.rank > 0 ? `Classement : ${d.rank + 1}e` : 'Hors classement';
    const done = ['hangar', 'reactor', 'defense'].filter(s => d.sectors[s].done).length;
    $('#final-stats').innerHTML = `<span>Niveau de sécurité</span><span>${d.level}</span><span>Secteurs réactivés (cycle)</span><span>${done}/3</span>` +
      `<span>Minijeux gagnés</span><span>${d.stats.minigamesWon}/${d.stats.minigamesPlayed}</span><span>Victoires contre NULL</span><span>${d.stats.bossWins}</span>`;
    const form = $('#name-form');
    if (d.rank >= 0) { form.classList.remove('hidden'); $('#name-input').value = load('lastName', ''); }
    else form.classList.add('hidden');
    this.open('over');
  }

  renderHiscores(list) {
    list = list || this.h.scores().list;
    const ol = this.el.hiscores;
    ol.innerHTML = list.length ? list.slice(0, 5).map(e => `<li>${escapeHtml(e.name)} <span>${fmt(e.score)}</span></li>`).join('') : '<li class="empty">Aucun score enregistré</li>';
  }

  // ------------------------------------------------------------ mise en page
  layout() {
    const W = window.innerWidth, H = window.innerHeight;
    const S = this.safe();
    const ratio = TABLE_W / TABLE_H;
    const e = this.el;
    let view;
    const landscape = W / H > 0.82;
    const app = e.app;
    app.classList.toggle('landscape', landscape);
    app.classList.toggle('portrait', !landscape);
    let panels = false;
    if (landscape) {
      let h = H - 16 - S.t - S.b, w = h * ratio;
      if (w > W * 0.62) { w = W * 0.62; h = w / ratio; }
      let x = (W - w) / 2, y = (H - h) / 2 + (S.t - S.b) / 2;
      // petit écran en paysage (téléphone couché) : plateau agrandi + caméra de suivi verticale
      let follow = false, scaleOverride = 0;
      if (H < 560 && !this.settings.reducedMotion) {
        follow = true;
        scaleOverride = (h / TABLE_H) * 1.6;
        w = TABLE_W * scaleOverride;
        x = (W - w) / 2;
      }
      const side = x - 14;
      if (side >= 170) {
        panels = true;
        view = { x, y, w, h, follow, scaleOverride };
        const pw = Math.min(330, side - 6);
        e.panelL.classList.toggle('compact', pw < 270 || H < 560);
        e.panelR.classList.toggle('compact', pw < 270 || H < 560);
        e.panelL.style.cssText = `display:block;left:${Math.max(8 + S.l, x - pw - 10)}px;width:${pw}px;top:${12 + S.t}px;bottom:${12 + S.b}px`;
        const prw = Math.min(pw, W - x - w - 18 - S.r);
        this.rightPanel = { left: x + w + 10, width: prw };
        e.panelR.style.cssText = `display:block;left:${x + w + 10}px;width:${prw}px;top:${64 + S.t}px;bottom:${12 + S.b}px`;
        e.hudTop.style.display = 'none';
        e.lumenBar.style.cssText = `left:${x + w + 10}px;width:${Math.min(pw, W - x - w - 18 - S.r)}px;top:${12 + S.t}px;right:auto;border-radius:10px;border:1px solid rgba(41,227,255,0.25);white-space:normal;min-height:46px;`;
        e.mgBar.style.cssText = `left:${x + 8}px;width:${w - 16}px;top:${y + 6}px;`;
        e.bottom.style.display = 'none';
        const lsz = Math.min(96, Math.max(70, side * 0.3));
        e.launch.style.cssText = `width:${lsz}px;height:${lsz}px;right:${16 + S.r}px;bottom:${16 + S.b}px;`;
      } else {
        // paysage étroit : bandeau supérieur + plateau
        const topH = 70 + S.t;
        h = H - topH - 8 - S.b; w = h * ratio;
        x = (W - w) / 2; y = topH + 2;
        view = { x, y, w, h };
      }
    }
    if (!view) {
      const topH = 48 + 24 + S.t;
      const bottomMin = 76 + S.b;
      const availH = H - topH - bottomMin - 4;
      let w = Math.min(W - 6 - S.l - S.r, availH * ratio);
      let h = w / ratio;
      const x = (W - w) / 2;
      const y = topH + 2;
      view = { x, y, w, h };
    }
    view.scale = view.scaleOverride || view.w / TABLE_W;
    view.follow = !!view.follow;
    if (!panels) {
      e.panelL.style.display = 'none';
      e.panelR.style.display = 'none';
      e.hudTop.style.display = '';
      e.hudTop.style.height = (46 + S.t) + 'px';
      e.lumenBar.style.cssText = `top:${46 + S.t}px;`;
      const bottomH = H - (view.y + view.h);
      e.bottom.style.display = '';
      e.bottom.style.width = (W - 110) + 'px';
      const lsz = bottomH >= 92 ? 84 : 66;
      const lb = bottomH >= lsz + 8 ? Math.max(6 + S.b, (bottomH - lsz) / 2) : 10 + S.b;
      e.launch.style.cssText = `width:${lsz}px;height:${lsz}px;right:${12 + S.r}px;bottom:${lb}px;`;
      e.mgBar.style.cssText = bottomH > 70
        ? `left:${8 + S.l}px;width:${W - lsz - 36}px;bottom:${6 + S.b}px;`
        : `left:${view.x + 8}px;width:${view.w - 16}px;top:${view.y + 4}px;`;
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
      e.banner.style.left = (view.x + view.w / 2) + 'px';
      e.banner.style.top = (view.y + view.h * 0.37) + 'px';
      e.banner.style.maxWidth = (view.w * 0.92) + 'px';
      e.banner.classList.remove('side');
    }
    e.tally.style.top = (view.y + view.h * 0.4) + 'px';
    e.tally.style.left = (view.x + view.w / 2) + 'px';
    this.view = view;
    this.panels = panels;
    return view;
  }

  // ------------------------------------------------------------ messages
  banner(title, sub, color = '#29e3ff', dur = 2) {
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

  // ------------------------------------------------------------ mise à jour par image
  update(game, dt) {
    if (this.bannerT > 0) { this.bannerT -= dt; if (this.bannerT <= 0) { this.el.banner.classList.remove('show'); setTimeout(() => this._nextBanner(), 220); } }
    if (this.tallyT > 0) { this.tallyT -= dt; if (this.tallyT <= 0) this.el.tally.classList.add('hidden'); }
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
    if (c.showMg !== showMg) {
      c.showMg = showMg;
      e.mgBar.classList.toggle('hidden', !showMg);
      e.missionChip.classList.toggle('hidden', showMg);
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
      const how = id === 'hangar' ? '3 cibles gauches → rampe gauche' : id === 'reactor' ? '2 boucles → portail' : id === 'defense' ? '3 cibles droites → rampe droite' : '3 secteurs → portail';
      return `<li class="${st}" style="--c:${S.color}"><span class="ic" style="color:${S.color}">${SECTOR_ICONS[id]}</span>` +
        `<span class="nm">${S.game}<small>${how}</small></span><span class="st" style="color:${st === 'hold' ? '#ffb52e' : st === 'locked' ? '#7f93b8' : S.color}">${STATE_TXT[st]}</span>` +
        `<span class="bar"><i style="width:${Math.round(p * 100)}%;background:${S.color}"></i></span></li>`;
    }).join('');
    if (c.sectors !== sectorsHtml) { c.sectors = sectorsHtml; e.sectors.innerHTML = sectorsHtml; }
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
