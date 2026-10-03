import { PHYS, RULES, SECTORS, TABLE_W, TABLE_H } from '../config.js';
import { Table } from './table.js';
import { BonusManager } from './bonus.js';
import { Missions } from './missions.js';
import { Lumen } from './lumen.js';
import { Transition } from './transition.js';
import { Ball } from '../physics/ball.js';
import { BreakoutGame } from '../minigames/breakout.js';
import { ReactorGame } from '../minigames/reactor.js';
import { DefenseGame } from '../minigames/defense.js';
import { DuelGame } from '../minigames/duel.js';
import { Scores } from '../util/storage.js';

const MINIGAMES = { hangar: BreakoutGame, reactor: ReactorGame, defense: DefenseGame, core: DuelGame };

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
    this.level = 1;
    this.extraBallsThisLevel = 0;
    this.camera = { x: TABLE_W / 2, y: TABLE_H / 2, zoom: 1 };
    this.betweenBalls = 0;         // délai avant la bille suivante
    this.resumeT = 0;              // compte à rebours de reprise après pause
    this.timeScale = 1;
    this.slowT = 0;
    this.lastInput = null;
    this.scores = new Scores();
    this.stats = { minigamesWon: 0, minigamesPlayed: 0, bossWins: 0 };
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
    this.stats = { minigamesWon: 0, minigamesPlayed: 0, bossWins: 0 };
    this.state = 'play';
    this.applyDifficulty();
    this.table.serveBall();
    this.table.plungerLock = true;
    this.input.swallow();
    this.music.setMode('table');
    this.music.setFlag('multiball', false);
    this.say('gameStart');
    this.ui.onGameStart();
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
    this.bonus.paused = this.scene !== 'table';
    this.bonus.update(dt);
    if (this.scene === 'table') {
      this.table.update(dt, inp);
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
  banner(title, sub, color, dur) { this.ui.banner(title, sub, color, dur); }
  onLumenMessage(msg) {
    this.ui.lumen(msg);
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

  awardExtraBall(source) {
    if (this.ballsLeft >= RULES.maxBalls || this.extraBallsThisLevel >= 1) {
      this.addScore(50000 * this.level, 281, 560, 'BONUS');
      return 'Bonus 50k (réserve pleine)';
    }
    this.ballsLeft++;
    this.extraBallsThisLevel++;
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
    const mg = new Cls(this, { level: this.level, sector, phaseKept: this.table.sectors[sector].phaseKept || 0 });
    this.stats.minigamesPlayed++;
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
    if (pending || !ball) this.table.serveBall();       // la bille de remplacement attend au lanceur
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
      const pct = 12 + 22 * ['hangar', 'reactor', 'defense'].filter(s => this.table.sectors[s].done).length;
      if (sector === 'core') {
        this.levelUp();
      } else {
        this.say('mgSuccess', { pct: Math.min(100, pct) });
        if (this.table.sectorState('core') === 'ready') this.later(2.6, () => this.table.sectorReady('core'));
      }
      this.banner(`${S.name} RÉACTIVÉ`, msgs.join(' · '), S.color, 2.8);
      this.sfx('reward');
    } else {
      for (const r of result.partialRewards || []) {
        const out = this.bonus.grant(r.type, r);
        msgs.push(out.title);
      }
      this.banner(`${S.name} : ÉCHEC`, msgs.length ? 'Prime partielle : ' + msgs.join(' · ') : 'Requalifiez le secteur pour réessayer', '#ff7a7a', 2.4);
      this.say(sector === 'core' ? 'null_win' : 'mgFail');
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
    this.later(3, () => this.banner(`NIVEAU DE SÉCURITÉ ${this.level}`, 'Les secteurs se reverrouillent — difficulté accrue', '#ff3d6e', 2.6));
  }

  // Perte de la bille du minijeu : consomme une bille de la réserve commune.
  ballLostInMinigame() {
    const mg = this.minigame;
    if (this.bonus.useShield()) {
      this.sfx('shield');
      this.banner('BOUCLIER', 'Perte annulée — relance automatique', '#7fd7ff', 1.5);
      this.say('shieldUsed');
      mg.awaitRelaunch(new Ball(), { auto: true });
      return;
    }
    this.ballsLeft--;
    this.sfx('ballLost');
    this.ui.flashBalls();
    const bonus = this.table.endOfBallBonus();
    if (bonus.total > 0) { this.score += bonus.total; this.banner('BONUS DE BILLE', `+${bonus.total.toLocaleString('fr-FR')}`, '#29e3ff', 1.4); }
    this.table.resetBallStats();
    if (this.ballsLeft > 0) {
      this.say('mgBallLost');
      mg.awaitRelaunch(new Ball(), { auto: false });
    } else {
      mg.abort();
      this.gameOver();
    }
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
    const rank = this.scores.rank(this.score);
    if (rank === 0 && this.score > 0) this.say('highScore'); else this.say('gameOver');
    this.ui.showGameOver({ score: this.score, rank, level: this.level, stats: this.stats, sectors: this.table.sectors });
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
