import { PHYS, RULES, SECTORS, MINI_SECTORS, TABLE_W, TABLE_H } from '../config.js';
import { fmt } from '../util/math.js';
import { Table } from './table.js';
import { BonusManager } from './bonus.js';
import { Missions } from './missions.js';
import { Lumen } from './lumen.js';
import { Transition } from './transition.js';
import { Ball } from '../physics/ball.js';
import { BreakoutGame } from '../minigames/breakout.js';
import { SingularityGame } from '../minigames/singularity.js';
import { GraffitiGame } from '../minigames/graffiti.js';
import { DefenseGame } from '../minigames/defense.js';
import { VaultGame } from '../minigames/vault.js';
import { CyberballGame } from '../minigames/cyberball.js';
import { BugsGame } from '../minigames/bugs.js';
import { DuelGame } from '../minigames/duel.js';
import { Scores } from '../util/storage.js';

const MINIGAMES = {
  hangar: BreakoutGame, reactor: SingularityGame, tag: GraffitiGame,
  defense: DefenseGame, vault: VaultGame, arena: CyberballGame, bugs: BugsGame, core: DuelGame,
};

// Statistiques de la partie (rapport de fin de session)
const newStats = () => ({
  minigamesWon: 0, minigamesPlayed: 0, bossWins: 0,
  jackpots: 0, superJackpots: 0, multiballs: 0, bestCombo: 0, skillShots: 0, missions: 0, extraBalls: 0, time: 0,
  frenzies: 0, frenzyWins: 0,
});

// Orchestrateur : états de partie, scènes (plateau / transition / minijeu),
// score, réserve de billes commune, bonus, missions et IA.
export class Game {
  constructor({ renderer, audio, input, ui, settings }) {
    this.renderer = renderer;
    this.audio = audio;
    this.input = input;
    this.ui = ui;
    this.settings = settings;
    this.fx = renderer.fx;
    this.bonus = new BonusManager(this);
    this.missions = new Missions(this);
    this.lumen = new Lumen(this);
    this.table = new Table(this);
    this.state = 'title';          // title | play | pause | over
    this.scene = 'table';          // table | transition | minigame
    this.minigame = null;
    this.transition = null;
    this.acc = 0;
    this.clock = 0;
    this.score = 0;
    this.ballsLeft = RULES.startBalls;
    this.maxBalls = RULES.startBalls;  // réserve maximale (agrandie par une FURIE réussie)
    this.nextLifeAt = RULES.lifeEvery; // prochain million : une vie (ou la FURIE si la réserve est pleine)
    this.frenzy = null;                // FURIE en cours : { intro, t, dur, need, kept }
    this.pendingFrenzy = 0;            // 0 ou 1 : une seule FURIE peut attendre son déclenchement
    this.frenzyLock = false;           // FURIE (et sa multibille) en cours : le compteur du million est gelé
    this.lifeScore = 0;                // score vu au dernier passage de _lives()
    this.lifeTick = 0;                 // nombre de millions franchis (éclair de la lampe du cadran)
    this.level = 1;
    this.extraBallsThisLevel = 0;
    this.camera = { x: TABLE_W / 2, y: TABLE_H / 2, zoom: 1 };
    this.betweenBalls = 0;         // délai avant la bille suivante
    this.resumeT = 0;              // compte à rebours de reprise après pause
    this.timeScale = 1;
    this.slowT = 0;
    this.lastInput = null;
    this.scores = new Scores();
    this.stats = newStats();
    this.ledgerErrors = 0;
    this.timers = [];
  }

  // minuterie en temps de jeu (gelée pendant la pause)
  later(t, fn) { this.timers.push({ t, fn }); }

  get music() { return this.audio.music; }

  // ------------------------------------------------------------ partie
  newGame() {
    this.score = 0;
    this.ballsLeft = RULES.startBalls;
    this.maxBalls = RULES.startBalls;
    this.nextLifeAt = RULES.lifeEvery;
    this.frenzy = null;
    this.pendingFrenzy = 0;
    this.frenzyLock = false;
    this.lifeScore = 0;
    this.lifeTick = 0;
    this.level = 1;
    this.extraBallsThisLevel = 0;
    this.bonus.reset();
    this.missions.reset();
    this.lumen.reset();
    this.table.resetForGame();
    this.minigame = null;
    this.transition = null;
    this.scene = 'table';
    this.betweenBalls = 0;
    this.timers = [];
    this.camera = { x: TABLE_W / 2, y: TABLE_H / 2, zoom: 1 };
    this.stats = newStats();
    this.state = 'play';
    this.applyDifficulty();
    this.table.serveBall();
    this.table.plungerLock = true;
    this.input.swallow();
    this.music.setMode('table');
    this.music.setFlag('multiball', false);
    this.music.setFlag('frenzy', false);
    this.ui.onGameStart();          // l'afficheur passe en mode jeu avant la première réplique
    this.say('gameStart');
  }

  pause() {
    if (this.state !== 'play') return;
    this.state = 'pause';
    this.input.releaseAll();
    this.audio.setPaused(true);
    this.ui.showPause(true);
  }

  resume() {
    if (this.state !== 'pause') return;
    this.state = 'play';
    this.resumeT = 0.9;            // courte grâce : la simulation reprend après le décompte
    this.input.swallow();
    this.audio.setPaused(false);
    this.ui.showPause(false);
  }

  quitToTitle() {
    this.frenzy = null;
    this.frenzyLock = false;
    this.pendingFrenzy = 0;
    this.music.setFlag('frenzy', false);
    this.state = 'title';
    this.input.releaseAll();
    this.audio.setPaused(false);
    this.music.setMode('title');
    this.ui.showTitle();
  }

  // ------------------------------------------------------------- boucle
  frame(dtReal) {
    dtReal = Math.min(dtReal, 0.1);
    this.clock += dtReal;
    if (this.state === 'play') {
      if (this.resumeT > 0) { this.resumeT -= dtReal; this.input.poll(); this.renderer.alpha = 1; return; }
      if (this.slowT > 0) this.slowT -= dtReal;
      const scale = this.slowT > 0 ? 0.35 : this.timeScale;
      this.acc += dtReal * scale;
      const dt = PHYS.tick;
      let n = 0;
      while (this.acc >= dt && n < 10) { this.tick(dt); this.acc -= dt; n++; }
      if (n >= 10) this.acc = 0;
      this.renderer.alpha = this.acc / dt;
    } else {
      this.renderer.alpha = 1;
      if (this.state === 'title' || this.state === 'over') this.table.time += dtReal; // animations d'ambiance
    }
    this.lumen.update(dtReal);
    this.fx.update(dtReal);
  }

  tick(dt) {
    const inp = this.input.poll();
    this.lastInput = inp;
    for (let i = this.timers.length - 1; i >= 0; i--) {
      const tm = this.timers[i];
      tm.t -= dt;
      if (tm.t <= 0) { this.timers.splice(i, 1); tm.fn(); }
    }
    if (this.state !== 'play') return;
    this.stats.time += dt;
    this.bonus.paused = this.scene !== 'table';
    this.bonus.update(dt);
    this._lives();
    if (this.scene === 'table') {
      this.table.update(dt, inp);
      this._updateFrenzy(dt);
      this.missions.update(dt);
      if (this.betweenBalls > 0) {
        this.betweenBalls -= dt;
        if (this.betweenBalls <= 0) { if (this.ballsLeft > 0) this._nextBall(); else this.gameOver(); }
      }
    } else if (this.scene === 'transition') {
      this.transition.update(dt, inp);
    } else if (this.scene === 'minigame') {
      this.minigame.update(dt, inp);
    }
    this._trails();
    this._music();
    this._checkLedger();
  }

  _trails() {
    for (const b of this.activeBalls()) {
      if (b.state === 'held') { b.trail.length = 0; continue; }
      b.trail.push(b.x, b.y);
      if (b.trail.length > 28) b.trail.splice(0, 2);
    }
  }

  _music() {
    const t = this.table;
    let intensity = 0.45;
    let tension = 0;
    if (this.scene === 'table') {
      intensity += Math.min(0.3, t.combo.count * 0.07);
      if (t.multiball) intensity = 0.9;
      if (this.frenzy) { intensity = 1; tension = 0.6; }
      if (this.ballsLeft === 1) tension = 0.35;
    } else if (this.minigame) {
      intensity = 0.75;
      const hud = this.minigame.hud();
      if (hud.timeLeft !== undefined && hud.timeLeft < 12) tension = 0.9;
      if (this.minigame.intensity) intensity = this.minigame.intensity;
    }
    this.music.setIntensity(intensity);
    this.music.setTension(tension);
  }

  // Toutes les billes existantes (plateau, transition, minijeu) : vérifie l'absence de doublon.
  activeBalls() {
    const out = [];
    if (this.scene === 'table' || this.scene === 'transition') out.push(...this.table.world.balls);
    if (this.transition && this.transition.ball && !out.includes(this.transition.ball)) out.push(this.transition.ball);
    if (this.minigame) for (const b of this.minigame.world.balls) out.push(b);
    return out;
  }

  _checkLedger() {
    const balls = this.activeBalls();
    const ids = new Set();
    for (const b of balls) {
      if (ids.has(b.id)) { this.ledgerErrors++; console.error('Bille dupliquée', b.id); }
      ids.add(b.id);
    }
    if (this.minigame && this.minigame.world.balls.length > 1 && !this.minigame.allowMulti) {
      this.ledgerErrors++; console.error('Plusieurs billes dans un minijeu');
    }
  }

  // ------------------------------------------------------------ services
  addScore(pts, x, y, label) {
    const m = this.bonus.mult;
    const v = Math.round(pts * m);
    this.score += v;
    if (x !== undefined && v >= 500) {
      this.fx.text(x, y, (label ? label + ' ' : '') + (v >= 1000 ? Math.round(v / 100) / 10 + 'k' : v), label ? '#ffd84a' : '#bfe9ff', label ? 1.25 : 0.9);
    }
    return v;
  }

  sfx(name, ...args) { this.audio.sfx(name, ...args); }
  say(key, params) { this.lumen.say(key, params); }
  // Annonce : afficheur à points (animation selon kind) + bannière à côté du plateau.
  banner(title, sub, color, dur, kind, data) { this.ui.banner(title, sub, color, dur, kind, data); this._screenFx(kind, { color, ...(data || {}) }); }
  dmd(kind, data) { if (this.ui.dmd) this.ui.dmd.show(kind, data); this._screenFx(kind, data || {}); }

  // Glitchs et impulsions néon du post-traitement, selon le type d'annonce.
  _screenFx(kind, d) {
    this._tally(kind, d);
    const r = this.renderer;
    if (!r.pulse) return;
    switch (kind) {
      case 'jackpot': r.pulse('#ffd84a', 1); break;
      case 'superJackpot': r.pulse('#ffd84a', 1.4); r.glitch(0.3, 0.2); break;
      case 'multiball': r.pulse('#ff3df2', 1); break;
      case 'extraBall': r.pulse('#5dff8f', 1); break;
      case 'sectorReady': case 'minigameWin': r.pulse(d.color || '#29e3ff', 0.9); break;
      case 'skillShot': r.pulse('#29e3ff', 0.7); break;
      case 'combo': if (d.n >= 4) r.pulse('#ffffff', 0.35); break;
      case 'minigameFail': r.glitch(0.5, 0.3); break;
      case 'ballLost': r.glitch(0.8, 0.4); break;
      case 'levelUp': r.pulse('#ff3d6e', 1.2); r.glitch(0.4, 0.3); break;
      case 'gameOver': r.glitch(1, 0.6); break;
      case 'pivot': r.pulse(d.color || '#ffb52e', 0.6); break;
      case 'frenzy': r.pulse('#ff3040', 1.4); r.glitch(0.7, 0.45); break;
      case 'frenzyWin': r.pulse('#5dff8f', 1.3); break;
      case 'frenzyFail': r.glitch(0.5, 0.3); break;
    }
  }
  // Compteurs du rapport de fin de session (chaque annonce n'est émise qu'une fois).
  _tally(kind, d) {
    const s = this.stats;
    switch (kind) {
      case 'jackpot': s.jackpots++; break;
      case 'superJackpot': s.superJackpots++; break;
      case 'multiball': s.multiballs++; break;
      case 'skillShot': s.skillShots++; break;
      case 'missionDone': s.missions++; break;
      case 'extraBall': s.extraBalls++; break;
      case 'frenzy': s.frenzies++; break;
      case 'frenzyWin': s.frenzyWins++; break;
      case 'combo': s.bestCombo = Math.max(s.bestCombo, d.n || 0); break;
    }
  }

  onLumenMessage(msg) {
    this.ui.lumen(msg);
    if (msg && msg.persona === 'null' && this.renderer.glitch) this.renderer.glitch(0.5, 0.3);
    if (msg) this.audio.speak(msg.text, msg.persona);
  }

  onContact(ball, prim, impact, x, y) {
    let mat = 'metal';
    if (!prim) mat = 'ball';
    else if (prim.side !== undefined && prim.len) mat = 'flipper';
    else mat = prim.sound || 'metal';
    if (mat !== 'bumper' && mat !== 'brick' && mat !== 'boss') this.audio.impact(mat, impact, x);
    if (impact > 700 && mat !== 'bumper') this.fx.spark(x, y, impact);
    if (prim && prim.flash !== undefined && impact > 200) prim.flash = 1;
  }

  // Une vie à chaque million de points ; réserve déjà pleine = FURIE (dès que le plateau le permet).
  // Pendant une FURIE et la multibille qui la prolonge, les points marqués ne comptent pas pour
  // le prochain million : sinon les dix billes enchaînent les FURIES à l'infini.
  _lives() {
    if (this.state !== 'play') return;
    const gained = this.score - this.lifeScore;
    this.lifeScore = this.score;
    if (this.frenzyLock) {
      this.nextLifeAt += gained;   // la jauge reste figée là où la FURIE l'a trouvée
      if (!this.frenzy && !this.table.multiball) this.frenzyLock = false;
      return;
    }
    while (this.score >= this.nextLifeAt) {
      const m = this.nextLifeAt;
      this.nextLifeAt += RULES.lifeEvery;
      this.lifeTick++;
      if (this.ballsLeft < this.maxBalls) {
        this.ballsLeft++;
        this.sfx('extraBall');
        this.banner('VIE SUPPLÉMENTAIRE', `${fmt(m)} points atteints`, '#5dff8f', 2.4, 'extraBall');
        this.say('extraLife');
        this.ui.flashBalls();
      } else this.pendingFrenzy = 1;   // jamais de file d'attente de FURIES
    }
    if (this.pendingFrenzy > 0 && !this.frenzy) this._tryFrenzy();
  }

  _tryFrenzy() {
    const t = this.table;
    if (this.scene !== 'table' || this.betweenBalls > 0 || t.lockedOut || t.magnet || t.shooterBall) return;
    if (t.barrels.L.anim || t.barrels.R.anim || t.anims.length) return;
    if (!t.world.balls.some(b => b.state === 'free')) return;
    this.pendingFrenzy = 0;
    this.startFrenzy();
  }

  // FURIE : la machine s'énerve et lâche des billes jusqu'à RULES.frenzyBalls en jeu.
  // En garder au moins RULES.frenzyKeep jusqu'au bout agrandit la réserve d'une vie.
  // Pendant la FURIE : pas de sauvegarde, jackpots allumés, batteurs qui surchauffent.
  startFrenzy() {
    const t = this.table;
    const inPlay = t.ballsInPlay();
    const add = Math.max(0, RULES.frenzyBalls - inPlay);
    this.frenzyLock = true;
    this.frenzy = { intro: 0.4 + add * 0.17, t: RULES.frenzyTime, dur: RULES.frenzyTime, need: RULES.frenzyKeep, kept: inPlay + add };
    t.spawnFrenzyBalls(add);
    t.multiball = true; t.multiballLit = false;
    t.jackpotValue = Math.max(t.jackpotValue, 25000 * this.level);
    for (const k of Object.keys(t.jackpots)) t.jackpots[k] = true;
    t.superLit = false;
    this.bonus.saveT = 0;
    this.music.setFlag('multiball', true);   // les billes restantes continuent ensuite en multibille
    this.music.setFlag('frenzy', true);
    this.sfx('frenzyStart');
    this.banner('MODE FURIE', `${RULES.frenzyBalls} billes : gardez-en ${RULES.frenzyKeep} pendant ${RULES.frenzyTime} s`, '#ff3040', 3, 'frenzy');
    this.say('frenzyStart', { n: RULES.frenzyBalls, k: RULES.frenzyKeep });
    t.react('alarm', 3);
  }

  _updateFrenzy(dt) {
    const F = this.frenzy;
    if (!F) return;
    F.kept = this.table.ballsInPlay();
    if (F.intro > 0) { F.intro -= dt; return; }
    F.t -= dt;
    if (F.kept < F.need) this.endFrenzy(false);
    else if (F.t <= 0) this.endFrenzy(true);
  }

  endFrenzy(success) {
    const F = this.frenzy;
    if (!F) return;
    this.frenzy = null;
    this.music.setFlag('frenzy', false);
    if (success) {
      this.maxBalls = Math.min(RULES.maxBallsCap, this.maxBalls + 1);
      this.ballsLeft = Math.min(this.maxBalls, this.ballsLeft + 1);
      this.addScore(50000 * F.kept * this.level);
      this.sfx('frenzyWin');
      this.banner('FURIE MAÎTRISÉE', `${F.kept} billes tenues · réserve portée à ${this.maxBalls} vies`, '#5dff8f', 3, 'frenzyWin');
      this.say('frenzyWin', { n: this.maxBalls });
      this.ui.flashBalls();
    } else {
      this.sfx('frenzyFail');
      this.banner('FURIE PERDUE', `Moins de ${F.need} billes : la multibille continue`, '#ff7a7a', 2.4, 'frenzyFail');
      this.say('frenzyFail');
    }
  }

  awardExtraBall(source) {
    if (this.ballsLeft >= this.maxBalls || this.extraBallsThisLevel >= 1) {
      this.addScore(50000 * this.level, 281, 560, 'BONUS');
      return 'Bonus 50k (réserve pleine)';
    }
    this.ballsLeft++;
    this.extraBallsThisLevel++;
    this.dmd('extraBall');
    this.sfx('extraBall');
    this.say('extraBall');
    this.ui.flashBalls();
    return 'BILLE SUPPLÉMENTAIRE';
  }

  // ------------------------------------------------------------ minijeux
  canStartMinigame() {
    return this.state === 'play' && this.scene === 'table' && this.betweenBalls <= 0 &&
      this.table.world.balls.length === 1 && !this.table.minigamesOnHold();
  }

  startMinigame(sector, ball, x, y) {
    const Cls = MINIGAMES[sector];
    const S = this.table.sectors[sector];
    const mg = new Cls(this, { level: this.level, sector, kept: S.kept || null, phaseKept: S.phaseKept || 0 });
    this.stats.minigamesPlayed++;
    if (this.renderer.glitch) this.renderer.glitch(0.9, 0.45);
    this.scene = 'transition';
    this.transition = new Transition(this, 'enter', { ball, from: { x, y }, minigame: mg, sector });
  }

  // appelé par la transition d'entrée quand l'arène est révélée
  _beginMinigame(mg, ball) {
    this.minigame = mg;
    this.transition = null;
    this.scene = 'minigame';
    mg.begin(ball);
    this.music.setMode(mg.musicMode);
    this.say('enter_' + mg.sector);
    if (mg.sector === 'core') this.later(1.8, () => this.say('null_start'));
    this.input.swallow();
  }

  // Le minijeu se termine : la bille (ou la bille en attente) revient sur le plateau.
  finishMinigame(result) {
    const mg = this.minigame;
    if (!mg || this.scene !== 'minigame') return;
    const sector = mg.sector;
    this.table.onMinigameEnd(sector, result.success);
    // progression conservée pour la prochaine tentative (effacée en cas de réussite)
    this.table.sectors[sector].kept = result.success ? null : (result.kept || null);
    if (sector === 'core' && !result.success) this.table.sectors.core.phaseKept = result.phaseKept || 0;
    if (result.success) this.stats.minigamesWon++;
    this.scene = 'transition';
    this.transition = new Transition(this, 'exit', { ball: result.ball, pending: result.pending, minigame: mg, result });
  }

  // appelé par la transition de sortie quand le plateau réapparaît
  _endMinigame(result, ball, pending) {
    const mg = this.minigame;
    this.minigame = null;
    this.transition = null;
    this.scene = 'table';
    this.music.setMode('table');
    if (pending || !ball) { this.table.serveBall({ ball, noSave: false }); this.table.pivotPending(); } // la bille attend au lanceur
    else this.table.receiveBall(ball);
    this.input.swallow();
    this._applyRewards(mg, result);
  }

  _applyRewards(mg, result) {
    const sector = mg.sector;
    const S = SECTORS[sector];
    const msgs = [];
    if (result.points) this.addScore(result.points, 281, 520, 'SECTEUR');
    if (result.success) {
      for (const r of result.rewards || []) {
        const out = this.bonus.grant(r.type, r);
        msgs.push(out.title);
      }
      if (sector === 'defense' && this.bonus.deferredMB > 0) this.table.deferredT = 3;
      const pct = Math.round(12 + 88 * this.table.sectorsDone() / MINI_SECTORS.length);
      if (sector === 'core') {
        this.levelUp();
      } else {
        this.say('mgSuccess', { pct: Math.min(100, pct) });
        if (this.table.sectorState('core') === 'ready') this.later(2.6, () => this.table.sectorReady('core'));
      }
      this.banner(`${S.name} RÉACTIVÉ`, msgs.join(' · '), S.color, 2.8, 'minigameWin');
      this.sfx('reward');
    } else {
      for (const r of result.partialRewards || []) {
        const out = this.bonus.grant(r.type, r);
        msgs.push(out.title);
      }
      const WHY = { timeout: 'Temps écoulé', hull: 'Coque détruite' };
      const why = result.drained ? 'Noyau retombé — retour au plateau' : (WHY[result.reason] || 'Échec');
      this.banner(`${S.name} : ÉCHEC`, msgs.length ? why + ' · ' + msgs.join(' · ') : why + ' · progression conservée', '#ff7a7a', 2.4, 'minigameFail');
      this.say(sector === 'core' ? 'null_win' : result.drained ? 'mgDrained' : 'mgFail');
    }
  }

  // Difficulté du plateau selon le niveau de sécurité : gravité +3 %/niveau (max +12 %),
  // musique plus rapide. Les minijeux lisent eux-mêmes le niveau (vitesse, PV, séquences…).
  applyDifficulty() {
    const k = Math.min(1.12, 1 + 0.03 * (this.level - 1));
    this.table.world.gy = PHYS.gravity * k;
    if (this.music.setLevel) this.music.setLevel(this.level);
  }

  levelUp() {
    this.level++;
    this.stats.bossWins++;
    this.extraBallsThisLevel = 0;
    this.table.newCycle();
    this.applyDifficulty();
    this.say('levelUp', { lvl: this.level });
    this.dmd('levelUp', { lvl: this.level });
    this.later(3, () => this.banner(`NIVEAU DE SÉCURITÉ ${this.level}`, 'Les secteurs se reverrouillent — difficulté accrue', '#ff3d6e', 2.6));
  }

  // La bille tombe dans un minijeu : aucune bille de la réserve n'est consommée.
  // Bouclier disponible = relance automatique de la même bille ; sinon le minijeu
  // échoue et la bille revient sur le plateau principal (progression conservée).
  ballLostInMinigame(ball) {
    const mg = this.minigame;
    if (this.bonus.useShield()) {
      this.sfx('shield');
      this.banner('BOUCLIER', 'Chute annulée — relance automatique', '#7fd7ff', 1.5, 'shield');
      this.say('shieldUsed');
      mg.awaitRelaunch(ball || new Ball(), { auto: true });
      return;
    }
    this.sfx('drainMulti');
    mg.finish(false, 'drain', ball || new Ball());
  }

  // Perte de la dernière bille sur le plateau.
  onBallLost() {
    const t = this.table;
    this.sfx('ballLost');
    this.fx.flash('#ff3050', 0.18);
    t.combo.count = 0; t.combo.t = 0;
    const bonus = t.endOfBallBonus();
    this.score += bonus.total;
    this.ballsLeft--;
    this.dmd('ballLost', { bonus: bonus.total });
    this.ui.flashBalls();
    this.ui.tally(bonus, this.ballsLeft > 0);
    if (this.ballsLeft > 0) {
      this.say('ballLost');
      this.betweenBalls = 2.6;
    } else {
      this.betweenBalls = 2.2;
    }
  }

  _nextBall() {
    this.table.resetBallStats();
    this.table.serveBall();
    this.say(this.ballsLeft === 1 ? 'lastBall' : 'ballStart');
  }

  gameOver() {
    if (this.state === 'over') return;
    this.state = 'over';
    this.input.releaseAll();
    this.music.setMode('gameover');
    this.sfx('gameOver');
    this.dmd('gameOver', { score: this.score });
    const rank = this.scores.rank(this.score);
    // le record est annoncé par LUMEN au moment de sa révélation (séquence de fin, ui)
    this.say('gameOver');
    this.ui.showGameOver({ score: this.score, rank, level: this.level, stats: this.stats, sectors: this.table.sectors, best: this.scores.best });
  }

  // ------------------------------------------------------------ rendu
  render() {
    this.renderer.render(this);
  }

  // ------------------------------------------------------------ débogage
  debug(cmd, arg) {
    if (cmd === 'qualify') this.table.debugQualify(arg);
    if (cmd === 'start' && this.scene === 'table') {
      const b = this.table.world.balls.find(x => x.state === 'free') || this.table.world.balls[0];
      if (!b) return 'aucune bille';
      if (this.table.shooterBall === b) { this.table.shooterBall = null; }
      this.table.world.removeBall(b);
      this.startMinigame(arg, b, 281, 430);
    }
    if (cmd === 'multiball') this.table.beginMultiball(2, 'replication');
    if (cmd === 'win' && this.minigame) this.minigame.debugWin();
    if (cmd === 'lose' && this.minigame) this.minigame.debugLoseBall();
    if (cmd === 'drain') { for (const b of this.table.world.balls) if (b.state === 'free') b.y = 1200; }
    return 'ok';
  }
}
