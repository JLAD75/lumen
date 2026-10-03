import { PhysicsWorld } from '../physics/world.js';
import { SECTORS, RULES } from '../config.js';
import { clamp, rand, sign } from '../util/math.js';

// Base commune des minijeux : même bille, mêmes commandes, chrono maîtrisé,
// perte = une bille de la réserve commune, relance par la commande de lancement.
export class Minigame {
  constructor(game, opts, cfg) {
    this.game = game;
    this.level = opts.level || 1;
    this.sector = opts.sector;
    this.S = SECTORS[this.sector];
    this.color = this.S.color;
    this.world = new PhysicsWorld({ gravity: cfg.gravity ?? 2000, damping: cfg.damping });
    this.world.onContact = (b, p, imp, x, y) => game.onContact(b, p, imp, x, y);
    this.timeLimit = cfg.time;
    this.timeLeft = cfg.time;
    this.time = 0;
    this.state = 'intro';           // intro | play | relaunch | ended
    this.ball = null;
    this.pendingBall = null;
    this.relaunchWait = 0;
    this.autoRelaunch = false;
    this.barrierT = 0;              // barrière d'entrée (protection)
    this.barrier = null;
    this.perk = cfg.perk || null;
    this.perkT = 0;
    this.title = cfg.title;
    this.objective = cfg.objective;
    this.musicMode = cfg.music;
    this.intensity = 0.75;
    this.points = 0;
    this.allowMulti = false;
    this.flash = 0;
    this.hurried = false;
  }

  // Barrière d'énergie sous la zone de jeu (entrée jouable, perk de duel…).
  addBarrier(x0, x1, y) {
    this.barrier = this.world.seg(x0, y, x1, y, { mat: 'energy', r: 4, kick: 250, kickMin: 0, style: 'barrier', dynamic: true, enabled: false });
  }

  setBarrier(seconds) {
    if (!this.barrier) return;
    this.barrierT = Math.max(this.barrierT, seconds);
    this.barrier.enabled = true;
  }

  entryPoint() { return { x: 281, y: 600 }; }
  exitPoint() { return this.ball ? { x: this.ball.x, y: this.ball.y } : { x: 281, y: 600 }; }

  begin(ball) {
    this.ball = ball;
    ball.state = 'free'; ball.layer = 0; ball.gScale = 1; ball.maxSpeed = 0;
    ball.scale = 1; ball.alpha = 1; ball.trail.length = 0;
    this.placeEntry(ball);
    this.world.addBall(ball);
    this.state = 'play';
    this.setBarrier(5);
    this.applyPerk();
    // effets compatibles conservés : le noyau phasique devient perforation
    this.game.banner(this.title, this.objective, this.color, 2.6);
    if (this.perk) this.game.later(1.4, () => this.game.banner('AVANTAGE D\'ENTRÉE', this.perk.desc, this.color, 2.2));
    this.game.sfx('minigameStart', this.sector);
  }

  placeEntry(ball) { ball.setPos(281, 600); ball.vx = 0; ball.vy = 200; }
  applyPerk() {}

  update(dt, inp) {
    if (this.state === 'ended') return;
    this.time += dt;
    if (this.flash > 0) this.flash -= dt;
    if (this.perkT > 0) this.perkT -= dt;
    if (this.barrierT > 0) {
      this.barrierT -= dt;
      if (this.barrierT <= 0 && this.barrier) this.barrier.enabled = false;
    }
    if (this.state === 'play') {
      this.timeLeft -= dt;
      if (this.timeLeft < 10 && !this.hurried) { this.hurried = true; this.game.say('mgHurry'); this.game.sfx('hurry'); }
      if (this.timeLeft <= 0) { this.timeLeft = 0; this.onTimeout(); return; }
    } else if (this.state === 'relaunch') {
      this.relaunchWait += dt;
      if (this.relaunchWait > RULES.minigameRelaunchAuto || this.autoRelaunch && this.relaunchWait > 0.6) this.relaunch();
    }
    for (const b of this.world.balls) { b.px = b.x; b.py = b.y; }
    for (const f of this.world.flippers) f.prevAngle = f.angle;
    this.step(dt, inp);
    if (this.state === 'ended') return;
    // perte physique de la bille
    for (const b of [...this.world.balls]) {
      if (b.state !== 'free') continue;
      if (b.y > 1080 || !Number.isFinite(b.x) || b.x < -20 || b.x > 620 || b.y < -80) {
        this.world.removeBall(b);
        if (b === this.ball) this.ball = null;
        this.game.fx.drain(b.x);
        this.onBallLost();
      }
    }
  }

  step(dt, inp) { this.world.step(dt); }

  onBallLost() {
    if (this.state !== 'play') return;
    this.resetCombos();
    this.game.ballLostInMinigame();
  }

  resetCombos() {}

  // La réserve a fourni une nouvelle bille : elle attend la commande de lancement.
  awaitRelaunch(ball, opts = {}) {
    if (this.state === 'ended') return;
    this.state = 'relaunch';
    this.pendingBall = ball;
    this.relaunchWait = 0;
    this.autoRelaunch = !!opts.auto;
    this.prepareRelaunch(ball);
  }

  prepareRelaunch(ball) {}

  relaunch() {
    const b = this.pendingBall;
    if (!b) return;
    this.pendingBall = null;
    this.ball = b;
    this.state = 'play';
    this.doRelaunch(b);
    if (!this.world.balls.includes(b)) this.world.addBall(b);
    this.setBarrier(3);
    this.game.sfx('plungerRelease', 0.8);
  }

  doRelaunch(b) { b.state = 'free'; }

  onTimeout() { this.finish(false, 'timeout'); }

  // Fin du minijeu (réussite ou échec à l'objectif) : retour au plateau.
  finish(success, reason) {
    if (this.state === 'ended') return;
    const pending = this.state === 'relaunch' || !this.ball;
    this.state = 'ended';
    const res = this.results(success, reason);
    res.success = success;
    res.ball = pending ? null : this.ball;
    res.pending = pending;
    if (success) this.game.sfx('minigameWin'); else this.game.sfx('minigameFail');
    this.game.fx.flash(success ? this.color : '#ff4060', 0.3);
    this.game.later(success ? 1.0 : 0.6, () => this.game.finishMinigame(res));
  }

  results() { return { rewards: [], points: this.points }; }

  abort() { this.state = 'ended'; }

  hud() {
    return {
      title: this.title, objective: this.objective, color: this.color,
      timeLeft: this.timeLeft, timeLimit: this.timeLimit, progress: this.progressText(),
      relaunch: this.state === 'relaunch', perk: this.perkT > 0 ? this.perk : null,
    };
  }

  progressText() { return ''; }

  debugWin() { this.finish(true, 'debug'); }
  debugLoseBall() { if (this.ball) this.ball.y = 1200; }

  render() {}
}

// Plateforme de rebond (casse-briques, défense) : gauche/droite la déplacent,
// l'angle de sortie dépend du point d'impact.
export class Paddle {
  constructor(x, y, w) {
    this.x = x; this.y = y; this.w = w; this.baseW = w; this.h = 16;
    this.vx = 0; this.maxV = 1150; this.acc = 9000;
    this.stun = 0; this.wideT = 0; this.hitFlash = 0; this.px = x;
    this.minX = 20; this.maxX = 580;
    this.maxAngle = 64 * Math.PI / 180;
  }

  update(dt, inp) {
    this.px = this.x;
    const dir = (inp.right ? 1 : 0) - (inp.left ? 1 : 0);
    const maxV = this.stun > 0 ? this.maxV * 0.35 : this.maxV;
    const target = dir * maxV;
    const a = (dir === 0 ? this.acc * 1.4 : this.acc) * dt;
    if (this.vx < target) this.vx = Math.min(target, this.vx + a); else this.vx = Math.max(target, this.vx - a);
    this.x += this.vx * dt;
    const hw = this.w / 2;
    if (this.x - hw < this.minX) { this.x = this.minX + hw; this.vx = 0; }
    if (this.x + hw > this.maxX) { this.x = this.maxX - hw; this.vx = 0; }
    if (this.stun > 0) this.stun -= dt;
    if (this.hitFlash > 0) this.hitFlash -= dt * 3;
    if (this.wideT > 0) { this.wideT -= dt; this.w += (this.baseW * 1.55 - this.w) * Math.min(1, dt * 8); }
    else this.w += (this.baseW - this.w) * Math.min(1, dt * 8);
  }

  // Collision capsule ; renvoie true si la bille a rebondi sur le dessus.
  collide(ball, speed) {
    const hw = this.w / 2 - this.h / 2, r = this.h / 2;
    const qx = clamp(ball.x, this.x - hw, this.x + hw), qy = this.y;
    let dx = ball.x - qx, dy = ball.y - qy;
    const d2 = dx * dx + dy * dy, R = ball.r + r;
    if (d2 >= R * R) return false;
    const d = Math.sqrt(d2) || 0.001;
    const nx = dx / d, ny = dy / d;
    ball.x += nx * (R - d); ball.y += ny * (R - d);
    if (ny < -0.3 && ball.vy > -50) {
      const u = clamp((ball.x - this.x) / (this.w / 2), -1, 1);
      const ang = u * this.maxAngle + clamp(this.vx / this.maxV, -1, 1) * 0.12;
      const s = Math.max(speed, Math.hypot(ball.vx, ball.vy) * 0.9);
      ball.vx = Math.sin(ang) * s;
      ball.vy = -Math.cos(ang) * s;
      this.hitFlash = 1;
      return true;
    }
    const vn = ball.vx * nx + ball.vy * ny;
    if (vn < 0) { ball.vx -= 2 * vn * nx; ball.vy -= 2 * vn * ny; }
    return false;
  }
}

// Microgravité : vitesse maintenue autour d'une cible, jamais trop horizontale.
export function zeroGHook(getTarget) {
  return (b, h) => {
    const target = getTarget(b);
    let s = Math.hypot(b.vx, b.vy);
    if (s < 1) { b.vx = rand(-0.3, 0.3) * target; b.vy = -target; s = target; }
    const ns = s + (target - s) * Math.min(1, h * 3);
    let vx = b.vx / s * ns, vy = b.vy / s * ns;
    const minVy = 0.24 * ns;
    if (Math.abs(vy) < minVy) {
      vy = sign(vy || -1) * minVy;
      vx = sign(vx) * Math.sqrt(Math.max(0, ns * ns - vy * vy));
    }
    b.vx = vx; b.vy = vy;
  };
}
