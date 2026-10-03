import { Minigame } from './base.js';
import { buildFrame, L } from '../game/tableLayout.js';
import { drawSling, drawPlunger } from '../render/tableArt.js';

// Arène à batteurs (Réacteur, Duel) : la moitié basse du plateau est conservée
// (batteurs, slingshots, couloirs, lanceur) ; seule la moitié haute se transforme.
// La relance d'une bille de réserve se fait avec le lanceur, exactement comme sur le plateau.
export class FlipperArena extends Minigame {
  constructor(game, opts, cfg) {
    super(game, opts, cfg);
    this.frame = buildFrame(this.world, { idSuffix: 'mg' });
    this.plunger = { charge: 0, kick: 0, auto: false };
    this.shooterBall = null;
    this.launchPower = 0.92;
    this.slingFlash = { L: 0, R: 0 };
    this.addBarrier(20, 542, 1036);
    this.frame.slingL.face.onHit = (b, imp, nx, ny, p) => { if (imp > p.kickMin) { this.slingFlash.L = 1; game.sfx('sling', -1); } };
    this.frame.slingR.face.onHit = (b, imp, nx, ny, p) => { if (imp > p.kickMin) { this.slingFlash.R = 1; game.sfx('sling', 1); } };
  }

  launchReady() { return this.state === 'relaunch' && !!this.shooterBall; }
  launchCharge() { return this.plunger.charge; }

  step(dt, inp) {
    const f = this.frame;
    f.flipL.power = f.flipR.power = this.game.bonus.flipperPower;
    f.flipL.pressed = inp.left; f.flipR.pressed = inp.right;
    if (inp.leftPressed) this.game.sfx('flipperUp', -1);
    if (inp.rightPressed) this.game.sfx('flipperUp', 1);
    if (inp.leftReleased) this.game.sfx('flipperDown', -1);
    if (inp.rightReleased) this.game.sfx('flipperDown', 1);
    // lanceur
    const P = this.plunger;
    if (this.state === 'relaunch' && this.shooterBall) {
      if (inp.launch) {
        if (P.charge === 0) this.game.sfx('plungerStart');
        P.charge = Math.min(1, P.charge + dt / 0.95);
        this.game.audio.chargeLevel(P.charge);
      } else if (P.charge > 0) {
        this.launchPower = Math.max(0.15, P.charge);
        P.charge = 0;
        this.relaunch();
      }
    }
    P.kick = Math.max(0, P.kick - dt * 4);
    this.slingFlash.L = Math.max(0, this.slingFlash.L - dt * 6);
    this.slingFlash.R = Math.max(0, this.slingFlash.R - dt * 6);
    this.arenaStep(dt, inp);
    this.world.step(dt);
    this.afterStep(dt, inp);
    // bille retombée au lanceur après un lancement trop faible
    const b = this.ball;
    if (b && b.state === 'free' && b.x > 546 && b.y > 985 && Math.abs(b.vy) < 90 && this.state === 'play') {
      b.state = 'held'; b.setPos(L.plungerRest[0], L.plungerRest[1]); b.vx = b.vy = 0;
      this.shooterBall = b; this.state = 'relaunch'; this.relaunchWait = 0; this.autoRelaunch = false;
      this.pendingBall = b;
    }
  }

  arenaStep() {}
  afterStep() {}

  prepareRelaunch(ball) {
    ball.state = 'held';
    ball.layer = 0;
    ball.setPos(L.plungerRest[0], L.plungerRest[1]);
    if (!this.world.balls.includes(ball)) this.world.addBall(ball);
    this.shooterBall = ball;
    this.ball = ball;
    this.plunger.charge = 0;
  }

  doRelaunch(b) {
    b.state = 'free';
    b.vx = 0;
    b.vy = -(1500 + 1500 * (this.autoRelaunch ? 0.92 : this.launchPower));
    this.shooterBall = null;
    this.plunger.kick = 1;
    this.plunger.charge = 0;
    this.launchPower = 0.92;
    this.game.audio.stopCharge();
  }

  // bille d'entrée : sort du portail et tombe vers le batteur gauche
  placeEntry(ball) {
    const e = this.entryPoint();
    ball.setPos(e.x, e.y);
    ball.vx = -95; ball.vy = 140;
  }

  render(ctx, r) {
    drawSling(ctx, this.frame.slingL, this.color, this.slingFlash.L);
    drawSling(ctx, this.frame.slingR, this.color, this.slingFlash.R);
    drawPlunger(ctx, r, this.plunger, !!this.shooterBall, r.time);
    if (this.barrier && this.barrier.enabled) r.drawBarrier(this.barrier, this.barrierT);
    this.renderArena(ctx, r);
    if (this.state === 'relaunch' && this.shooterBall) {
      r.text('LANCEZ LE NOYAU', 470, 940, 13, '#ffffff', 'center', 0.6 + 0.4 * Math.sin(r.time * 6));
    }
  }

  renderArena() {}
}
