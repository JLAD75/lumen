import { PhysicsWorld } from '../physics/world.js';
import { Ball } from '../physics/ball.js';
import { buildCortexTable, T, SHOTS, WORLD, M_PF, M_RAMP, M_DECK, domePoint, mx } from './tableLayout.js';
import { RULES, SECTORS } from '../config.js';
import { rand, dist, easeInOutCubic, lerp } from '../util/math.js';

export const SHOT_IDS = ['lorbit', 'lramp', 'portal', 'rramp', 'rorbit'];
const SHOT_BASE = { lorbit: 4000, lramp: 6000, portal: 3000, rramp: 5000, rorbit: 4000 };

// Plateau principal : physique + règles. Trois niveaux : plateau, rampes, pont supérieur.
// Accès aux secteurs :
//   HANGAR   : 3 cibles gauches → rampe du pont (gauche)
//   DÉFENSE  : 3 cibles tombantes droites → rampe droite
//   RÉACTEUR : 4 cellules du pont → éjecteur UPLINK (sur le pont)
//   NOYAU    : 3 secteurs réactivés → portail central
export class Table {
  constructor(game) {
    this.game = game;
    this.bounds = WORLD;            // étendue du monde affiché (plateau long)
    this.world = new PhysicsWorld();
    this.R = buildCortexTable(this.world);
    this._sensors();
    this._hooks();
    this.world.build();
    this.world.onContact = (b, p, imp, x, y) => game.onContact(b, p, imp, x, y);
    this.time = 0;
    this.resetForGame();
  }

  // ------------------------------------------------------------------ état
  resetForGame() {
    for (const b of [...this.world.balls]) this.world.removeBall(b);
    this.lanes = [false, false, false];
    this.laneFlash = [0, 0, 0];
    this.skillTarget = 1; this.skillArmed = false;
    this.bankL = [false, false, false];
    this.bankFlash = { L: [0, 0, 0], R: [0, 0, 0] };
    this.drops = [false, false, false];
    this.dropResetT = 0;
    this.deckTargets = [false, false, false, false];
    this.deckFlash = [0, 0, 0, 0];
    this.deckVisits = 0;
    this.deckSeen = false;
    this.uplink = { ball: null, t: 0, flash: 0, mode: null };
    this.spinners = { L: { a: 0, w: 0, n: 0 }, R: { a: 0, w: 0, n: 0 } };
    this.kickback = { lit: true, flash: 0 };
    this.announced = {};        // secteurs dont l'accès a été annoncé (annonce au passage à « accessible »)
    this.loops = 0;
    this.sectors = {};
    for (const id of Object.keys(SECTORS)) this.sectors[id] = { done: false, attempts: 0, wins: 0, flash: 0, phaseKept: 0, kept: null };
    this.cpuCount = 0;
    this.multiballLit = false;
    this.multiball = false;
    this.jackpots = { lorbit: false, lramp: false, rramp: false, rorbit: false };
    this.superLit = false;
    this.jackpotValue = 0;
    this.combo = { count: 0, last: null, t: 0 };
    this.orbitIn = null;
    this.launchQueue = [];
    this.plunger = { charge: 0, auto: false, autoT: 0, pull: 0, kick: 0 };
    this.shooterBall = null;
    this.portal = { open: false, mode: null, ejectT: 0, anim: 0, glow: 0 };
    this.anims = [];
    this.deferredT = -1;
    this.bumperFlash = [0, 0, 0];
    this.slingFlash = { L: 0, R: 0 };
    this.rampFlash = { L: 0, R: 0 };
    this.orbitFlash = { L: 0, R: 0 };
    this.deckFlashAll = 0;
    this.shotFlash = {};
    this.bonusX = 1;
    this.resetBallStats();
    this.lastLaunchT = -99;
    this.lockedOut = false;     // plateau gelé (transition vers un minijeu)
    this.timers = [];
    this.mood = { kind: 'idle', t: 0 };
    for (const p of this.R.drops) p.enabled = true;
  }

  // humeur des robots de maintenance (décor animé)
  react(kind, t = 2) { this.mood = { kind, t }; }

  later(t, fn) { this.timers.push({ t, fn }); }

  resetBallStats() {
    this.ballStats = { ramps: 0, loops: 0, targets: 0, bumpers: 0, lanes: 0, modes: 0, deck: 0, spins: 0 };
    this.bonusX = 1;
  }

  // ------------------------------------------------------------ capteurs
  _sensors() {
    const w = this.world, Y = T.orbitSensorY;
    w.sensor(20, Y, 81, Y, { onCross: (b, d) => this.onOrbit('L', d, b) });
    w.sensor(mx(81), Y, 542, Y, { onCross: (b, d) => this.onOrbit('R', d, b) });
    // haut des couloirs d'orbite : l'orbite est validée dès que la bille y monte
    w.sensor(20, T.orbitTopY, 62, T.orbitTopY, { onCross: (b, d) => { if (d > 0) this.onOrbitTop('L', b); } });
    w.sensor(500, T.orbitTopY, 542, T.orbitTopY, { onCross: (b, d) => { if (d > 0) this.onOrbitTop('R', b); } });
    // spinners dans les couloirs d'orbite
    w.sensor(20, T.spinnerY, 62, T.spinnerY, { onCross: (b) => this.onSpinner('L', b) });
    w.sensor(500, T.spinnerY, 542, T.spinnerY, { onCross: (b) => this.onSpinner('R', b) });
    // rampe gauche : entrée, puis dépôt sur le pont
    const gl = T.rampL;
    w.sensor(gl.x0, gl.entryY, gl.x1, gl.entryY, { mask: M_PF | M_RAMP, onCross: (b, d) => this.onRampEntry('L', d, b) });
    w.sensor(gl.x0, gl.deckY, gl.x1, gl.deckY, { mask: M_RAMP, onCross: (b, d) => { if (d > 0) this.onDeckRamp(b); } });
    // rampe droite : entrée, sommet, descente, sortie
    const g = T.rampR;
    w.sensor(g.upX0, g.entryY, g.upX1, g.entryY, { mask: M_PF | M_RAMP, onCross: (b, d) => this.onRampEntry('R', d, b) });
    w.sensor(g.upX0, g.topY + 6, g.upX1, g.topY + 6, { mask: M_RAMP, onCross: (b, d) => this.onRampTop('R', d, b) });
    w.sensor(g.downX0, g.topY + 6, g.downX1, g.topY + 6, { mask: M_RAMP, onCross: (b, d) => { if (d < 0) { b.maxSpeed = 1150; b.gScale = 1; } } });
    w.sensor(g.downX0, g.exitY, g.downX1, g.exitY, { mask: M_RAMP, onCross: (b, d) => this.onRampExit('R', d, b) });
    // lancer : au-dessus de la porte, la bille lancée passe sur le pont
    const D = T.deck;
    const [sx0, sy0] = domePoint(D.plungeSensorAng, 214), [sx1, sy1] = domePoint(D.plungeSensorAng, 279);
    w.sensor(sx0, sy0, sx1, sy1, { onCross: (b) => { if (b.plunged) this.onPlungeDeck(b); } });
    // pont : la bille qui passe entre les petits batteurs retombe sur le plateau
    w.sensor(D.drainX0, D.drainY, D.drainX1, D.drainY, { mask: M_DECK, onCross: (b, d) => { if (d < 0) this.onDeckDrain(b); } });
    this.uplinkZone = w.zone(D.uplink.x, D.uplink.y, D.uplink.r, { mask: M_DECK, onEnter: (b) => this.onUplink(b) });
    const gx = T.lanesX;
    for (let i = 0; i < 3; i++) {
      w.sensor(gx[i] + 4, T.laneSensorY, gx[i + 1] - 4, T.laneSensorY, { onCross: (b, d) => this.onLane(i, b, d) });
    }
    w.sensor(23, 790, 55, 790, { onCross: (b, d) => { if (d < 0) this.onOutlane('L', b); } });
    w.sensor(61, 790, 101, 790, { onCross: (b, d) => { if (d < 0) this.onInlane('L', b); } });
    w.sensor(mx(55), 790, mx(23), 790, { onCross: (b, d) => { if (d < 0) this.onOutlane('R', b); } });
    w.sensor(mx(101), 790, mx(61), 790, { onCross: (b, d) => { if (d < 0) this.onInlane('R', b); } });
    w.sensor(544, 360, 578, 360, { onCross: (b, d) => { if (d > 0) this.onShooterExit(b); } });
    this.portalZone = w.zone(T.portal.x, T.portal.y + 2, 22, { enabled: false, onEnter: (b) => this.onPortalEnter(b) });
  }

  _hooks() {
    const R = this.R;
    R.bumpers.forEach((p, i) => { p.onHit = (b, imp) => this.onBumper(i, b, imp); });
    R.slingL.face.onHit = (b, imp, nx, ny, p) => { if (imp > p.kickMin) this.onSling('L', b); };
    R.slingR.face.onHit = (b, imp, nx, ny, p) => { if (imp > p.kickMin) this.onSling('R', b); };
    R.bankL.forEach((p) => { p.onHit = (b, imp, nx, ny, prim, phased) => this.onTarget('L', prim.data.i, b, imp, phased); });
    R.drops.forEach((p) => { p.onHit = (b, imp, nx, ny, prim, phased) => this.onDrop(prim.data.i, b, imp, phased); });
    R.deck.targets.forEach((p) => {
      p.onHit = (b, imp, nx, ny, prim, phased) => {
        // seule la face avant (côté batteurs du pont) est un contact
        if (!phased && nx * prim.data.nx + ny * prim.data.ny < 0.2) return;
        this.onDeckTarget(prim.data.i, b, imp, phased);
      };
    });
    R.shutter.onHit = (b, imp) => this.onShutter(b, imp);
  }

  // -------------------------------------------------------------- billes
  get balls() { return this.world.balls; }

  ballsInPlay() { return this.world.balls.length + this.launchQueue.length; }

  serveBall(opts = {}) {
    // opts.ball : bille existante (retour de minijeu) — même identité
    const b = opts.ball || new Ball(T.plungerRest[0], T.plungerRest[1]);
    b.layer = 0; b.gScale = 1; b.maxSpeed = 0; b.scale = 1; b.alpha = 1; b.pierce = false; b.plunged = false;
    b.setPos(T.plungerRest[0], T.plungerRest[1]);
    b.vx = b.vy = 0;
    b.state = 'held';
    b.saveOnExit = !opts.auto && !opts.noSave;
    b.hue = this.world.balls.length * 70;
    this.world.addBall(b);
    this.shooterBall = b;
    this.plunger.charge = 0;
    this.plunger.auto = !!opts.auto;
    this.plunger.autoT = opts.autoDelay ?? 0.55;
    if (!opts.auto) {
      this.skillArmed = true;
      this.skillTarget = Math.floor(Math.random() * 4);
      this.lanes = [false, false, false];
    }
    return b;
  }

  queueLaunch(delay = 0.4) { this.launchQueue.push({ t: delay }); }

  launch(power) {
    const b = this.shooterBall;
    if (!b) return;
    b.state = 'free';
    b.vx = 0;
    b.vy = -(1500 + 1500 * power);
    b.plunged = true;
    this.shooterBall = null;
    this.plunger.kick = 1;
    this.lastLaunchT = this.time;
    this.game.sfx('plungerRelease', power);
    this.game.audio?.stopCharge?.();
  }

  // Bille revenant d'un minijeu par le portail central.
  receiveBall(ball) {
    ball.layer = 0; ball.gScale = 1; ball.maxSpeed = 0; ball.state = 'free';
    ball.scale = 1; ball.alpha = 1; ball.pierce = false; ball.plunged = false;
    ball.setPos(T.portal.x, T.portal.y + 18);
    ball.vx = rand(-90, 90); ball.vy = 480;
    this.world.addBall(ball);
    this.portal.ejectT = 0.7;
    this.portal.glow = 1;
    this.game.bonus.startSave(RULES.returnProtection, 'return');
  }

  // ------------------------------------------------------------ entrées
  handleInput(inp, dt) {
    const R = this.R, bonus = this.game.bonus;
    R.flipL.power = R.flipR.power = bonus.flipperPower;
    R.flipL.pressed = R.deck.flipL.pressed = inp.left;
    R.flipR.pressed = R.deck.flipR.pressed = inp.right;
    if (inp.leftPressed) { this.game.sfx('flipperUp', -1); this.rotateLanes(-1); }
    if (inp.rightPressed) { this.game.sfx('flipperUp', 1); this.rotateLanes(1); }
    if (inp.leftReleased) this.game.sfx('flipperDown', -1);
    if (inp.rightReleased) this.game.sfx('flipperDown', 1);
    const P = this.plunger;
    // la commande de lancement doit être relâchée une fois (ex. Espace utilisé pour démarrer)
    if (this.plungerLock) { if (!inp.launch) this.plungerLock = false; return; }
    if (this.shooterBall && !P.auto) {
      if (inp.launch) {
        const before = P.charge;
        P.charge = Math.min(1, P.charge + dt / 0.95);
        if (before === 0) this.game.sfx('plungerStart');
        this.game.audio?.chargeLevel?.(P.charge);
      } else if (P.charge > 0) {
        const c = P.charge; P.charge = 0;
        this.launch(Math.max(0.12, c));
      }
    } else if (!inp.launch) P.charge = 0;
  }

  // Les batteurs décalent les couloirs allumés et, avant le lancer, la cellule « skill shot ».
  rotateLanes(dir) {
    if (this.skillArmed && this.shooterBall) this.skillTarget = (this.skillTarget + (dir < 0 ? 3 : 1)) % 4;
    if (this.lanes.every(Boolean)) return;
    const l = this.lanes;
    this.lanes = dir < 0 ? [l[1], l[2], l[0]] : [l[2], l[0], l[1]];
  }

  // ------------------------------------------------------------- update
  update(dt, inp) {
    this.time += dt;
    const g = this.game;
    for (let i = this.timers.length - 1; i >= 0; i--) {
      const tm = this.timers[i];
      tm.t -= dt;
      if (tm.t <= 0) { this.timers.splice(i, 1); tm.fn(); }
    }
    if (!this.lockedOut) this.handleInput(inp, dt);
    else for (const f of this.world.flippers) f.pressed = false;

    for (const b of this.world.balls) { b.px = b.x; b.py = b.y; b.phase = g.bonus.phaseT > 0; }
    for (const f of this.world.flippers) f.prevAngle = f.angle;
    this.world.step(dt);

    this._updateAnims(dt);
    this._checkBalls(dt);
    this._updateShooter(dt);
    this._updatePortal(dt);
    this._updateUplink(dt);
    this._updateSpinners(dt);
    this._updateDrops(dt);

    if (this.combo.t > 0) { this.combo.t -= dt; if (this.combo.t <= 0) { this.combo.count = 0; this.combo.last = null; } }
    // un secteur qui devient réellement accessible (fin de multibille, dernier secteur gagné…) est annoncé
    if (!this.lockedOut) for (const id of ['hangar', 'reactor', 'defense', 'core']) if (!this.announced[id] && this.sectorState(id) === 'ready') this.sectorReady(id);
    if (this.orbitIn && this.time - this.orbitIn.t > RULES.loopWindow) this.orbitIn = null;
    if (this.multiball && this.ballsInPlay() <= 1 && this.anims.length === 0 && !this.uplink.ball) this.endMultiball();
    if (this.deferredT > 0) {
      this.deferredT -= dt;
      if (this.deferredT <= 0) {
        const n = g.bonus.deferredMB; g.bonus.deferredMB = 0;
        if (n > 0) this.beginMultiball(n, 'deferred');
      }
    }
    if (this.skillArmed && !this.shooterBall && this.time - this.lastLaunchT > RULES.skillShotWindow + 4) this.skillArmed = false;
    // déclin des lumières
    const k = dt * 3;
    for (let i = 0; i < 3; i++) { this.bumperFlash[i] = Math.max(0, this.bumperFlash[i] - k * 1.5); this.laneFlash[i] = Math.max(0, this.laneFlash[i] - k); }
    for (let i = 0; i < 4; i++) this.deckFlash[i] = Math.max(0, this.deckFlash[i] - k);
    for (const s of ['L', 'R']) {
      this.slingFlash[s] = Math.max(0, this.slingFlash[s] - k * 2);
      this.rampFlash[s] = Math.max(0, this.rampFlash[s] - k * 0.6);
      this.orbitFlash[s] = Math.max(0, this.orbitFlash[s] - k * 0.6);
      for (let i = 0; i < 3; i++) this.bankFlash[s][i] = Math.max(0, this.bankFlash[s][i] - k);
    }
    for (const id in this.shotFlash) this.shotFlash[id] = Math.max(0, this.shotFlash[id] - k * 0.5);
    for (const id in this.sectors) this.sectors[id].flash = Math.max(0, this.sectors[id].flash - dt);
    this.portal.glow = Math.max(0, this.portal.glow - dt);
    this.uplink.flash = Math.max(0, this.uplink.flash - dt * 1.5);
    this.kickback.flash = Math.max(0, this.kickback.flash - dt * 2);
    this.deckFlashAll = Math.max(0, this.deckFlashAll - dt);
    if (this.mood.t > 0) this.mood.t -= dt;
    this.plunger.kick = Math.max(0, this.plunger.kick - dt * 4);
  }

  _checkBalls(dt) {
    const g = this.game;
    const drained = [];
    const flippersHeld = this.R.flipL.pressed || this.R.flipR.pressed;
    for (const b of this.world.balls) {
      b.age += dt;
      if (b.state !== 'free') continue;
      if (!Number.isFinite(b.x) || !Number.isFinite(b.y) || b.x < -10 || b.x > 610 || b.y < -170) {
        drained.push({ b, lostInSpace: true });
        continue;
      }
      if (b.y > T.drainY) { drained.push({ b }); continue; }
      // garde-fous de couches : le pont s'arrête au-dessus du plateau central
      if (b.layer === 2 && b.y > 175) { b.layer = 0; }
      if (b.plunged && this.time - this.lastLaunchT > 3) b.plunged = false;
      // bille retombée dans le couloir de lancement
      if (b.x > 546 && b.y > 985 && Math.abs(b.vy) < 90 && b.layer === 0) {
        if (!this.shooterBall) {
          b.state = 'held'; b.setPos(T.plungerRest[0], T.plungerRest[1]); b.vx = b.vy = 0;
          b.plunged = false;
          this.shooterBall = b; this.plunger.auto = false; this.plunger.charge = 0;
          continue;
        }
      }
      // détection de blocage
      if (dist(b.x, b.y, b.stuckX, b.stuckY) > 6) { b.stuckX = b.x; b.stuckY = b.y; b.stuckT = 0; }
      else if (!flippersHeld) {
        b.stuckT += dt;
        // micro-vibration du plateau : rompt les équilibres instables sans effet visible
        if (b.stuckT > 0.7 && b.stuckT - dt <= 0.7) { b.vx += rand(-70, 70); b.vy -= 40; }
        if (b.stuckT > 2.6) {
          b.stuckT = 0;
          b.stuckCount = (b.stuckCount || 0) + 1;
          if (b.stuckCount >= 3) { drained.push({ b, lostInSpace: true }); continue; }
          b.vx += rand(-350, 350); b.vy -= 900;
          if (b.layer === 1) { b.layer = 0; b.gScale = 1; }
          g.fx.ring(b.x, b.y, '#29e3ff', 50);
          g.sfx('nudge');
          g.say('stuck');
        }
      }
    }
    for (const d of drained) {
      this.world.removeBall(d.b);
      if (d.lostInSpace) { // remise en jeu sans pénalité
        this.queueLaunch(0.3);
        g.say('stuck');
        continue;
      }
      this.onDrain(d.b);
    }
  }

  onDrain(ball) {
    const g = this.game;
    const remaining = this.ballsInPlay() + (this.uplink.ball ? 1 : 0);
    g.fx.drain(ball.x);
    if (g.bonus.saveT > 0) {
      this.queueLaunch(0.5);
      g.sfx('ballSave');
      g.banner('SAUVEGARDE', 'Noyau réinjecté', '#29e3ff', 1.2, 'ballSave');
      g.say('ballSaved');
      return;
    }
    if (remaining === 0 && g.bonus.useShield()) {
      this.queueLaunch(0.5);
      g.sfx('shield');
      g.banner('BOUCLIER', 'Perte annulée — bouclier consommé', '#7fd7ff', 1.6, 'shield');
      g.say('shieldUsed');
      return;
    }
    if (remaining > 0) { g.sfx('drainMulti'); return; }
    this.react('alarm', 2);
    g.onBallLost('table');
  }

  _updateShooter(dt) {
    const P = this.plunger;
    if (this.shooterBall && P.auto) {
      P.autoT -= dt;
      P.charge = Math.min(0.95, P.charge + dt * 2);
      if (P.autoT <= 0) this.launch(0.93 + Math.random() * 0.05);
    }
    if (!this.shooterBall && this.launchQueue.length) {
      const q = this.launchQueue[0];
      q.t -= dt;
      if (q.t <= 0) { this.launchQueue.shift(); this.serveBall({ auto: true }); }
    }
  }

  _updateAnims(dt) {
    for (let i = this.anims.length - 1; i >= 0; i--) {
      const a = this.anims[i];
      a.t += dt;
      const u = Math.min(1, a.t / a.dur);
      const e = easeInOutCubic(u);
      const b = a.ball;
      b.px = b.x; b.py = b.y;
      if (a.kind === 'portal') {
        const ang = a.t * 14, rad = (1 - e) * 18;
        b.x = lerp(a.fx, a.tx, e) + Math.cos(ang) * rad;
        b.y = lerp(a.fy, a.ty, e) + Math.sin(ang) * rad;
        b.scale = 1 - 0.75 * e;
      } else {
        b.x = lerp(a.fx, a.tx, e); b.y = lerp(a.fy, a.ty, e);
      }
      if (u >= 1) { this.anims.splice(i, 1); a.done && a.done(b); }
    }
  }

  // Aspire la bille vers un point (portail, éjecteur) puis appelle done.
  captureBall(b, x, y, dur, kind, done) {
    b.state = 'captured';
    b.trail.length = 0;
    this.anims.push({ ball: b, fx: b.x, fy: b.y, tx: x, ty: y, t: 0, dur, kind, done });
  }

  // ------------------------------------------------------------- portail
  portalMode() {
    if (this.multiball || this.launchQueue.length > 0) return this.superLit ? 'super' : null;
    if (this.sectorState('core') === 'ready') return 'core';
    if (this.multiballLit) return 'multiball';
    return null;
  }

  _updatePortal(dt) {
    const P = this.portal, Lp = T.portal;
    P.mode = this.portalMode();
    if (P.ejectT > 0) P.ejectT -= dt;
    P.anim += dt;
    const open = !!P.mode && P.ejectT <= 0;
    this.portalZone.enabled = open;
    let inside = false;
    for (const b of this.world.balls) {
      if (b.state === 'free' && b.layer === 0 && b.x > Lp.x0 - 4 && b.x < Lp.x1 + 4 && b.y > Lp.y - Lp.r - 10 && b.y < Lp.mouthY + 2) inside = true;
    }
    if (open || P.ejectT > 0) this.R.shutter.enabled = false;
    else if (!inside) this.R.shutter.enabled = true;
    P.open = open;
  }

  onPortalEnter(b) {
    const g = this.game, mode = this.portal.mode, Lp = T.portal;
    if (mode === 'super') {
      this.captureBall(b, Lp.x, Lp.y, 0.35, 'portal', () => {
        this.awardSuperJackpot();
        this.world.removeBall(b);
        this.receiveBallLocal(b);
      });
      return;
    }
    if (mode === 'core') {
      if (!g.canStartMinigame()) return;
      this.startMinigameCapture(mode, b, Lp.x, Lp.y);
      return;
    }
    if (mode === 'multiball') {
      this.multiballLit = false;
      g.sfx('portalOpen');
      this.captureBall(b, Lp.x, Lp.y, 0.9, 'portal', () => {
        this.world.removeBall(b);
        this.receiveBallLocal(b);
        this.beginMultiball(2, 'replication');
      });
    }
  }

  // éjection locale (après super jackpot / réplication) sans changer de mode
  receiveBallLocal(b) {
    b.scale = 1;
    b.state = 'free';
    b.layer = 0;
    b.setPos(T.portal.x, T.portal.y + 18);
    b.vx = rand(-90, 90); b.vy = 480;
    this.world.addBall(b);
    this.portal.ejectT = 0.7;
  }

  startMinigameCapture(sector, b, x, y) {
    const g = this.game;
    this.lockedOut = true;
    g.sfx('portalWarp');
    this.combo.count = 0; this.combo.t = 0; this.combo.last = null;
    this.captureBall(b, x, y, 0.55, 'portal', () => {
      this.world.removeBall(b);
      this.lockedOut = false;
      g.startMinigame(sector, b, x, y);
    });
  }

  // ------------------------------------------------------------- pont supérieur
  onPlungeDeck(b) {
    b.plunged = false;
    b.layer = 2;
    this.deckVisits++;
    this.ballStats.deck++;
    this.deckFlashAll = 1;
    this.game.sfx('deckEnter', 1);
    if (!this.deckSeen) { this.deckSeen = true; this.game.say('deckFirst'); }
  }

  onDeckRamp(b) {
    const g = this.game;
    b.layer = 2; b.gScale = 1; b.maxSpeed = 0;
    this.rampFlash.L = 1;
    this.ballStats.ramps++;
    this.ballStats.deck++;
    this.deckVisits++;
    this.deckFlashAll = 1;
    g.sfx('rampMade', this.combo.t > 0 ? this.combo.count : 0);
    g.missions.event('ramp');
    g.missions.event('deck');
    this.shot('lramp', b, { label: 'PONT' });
    this._rampJackpot('lramp');
    // secteur HANGAR : la rampe du pont ouvre l'accès au casse-briques
    if (this.sectorState('hangar') === 'hold') { g.say('hold'); return; }
    if (this.sectorState('hangar') === 'ready' && g.canStartMinigame() && this.ballsInPlay() === 1) {
      const rp = this.R.rampL;
      this.startMinigameCapture('hangar', b, rp.portalX, rp.portalY);
    }
  }

  onDeckDrain(b) {
    b.layer = 0; b.gScale = 1;
    this.game.sfx('deckDrop');
    this.game.addScore(250, b.x, b.y + 20);
  }

  onDeckTarget(i, b, imp, phased) {
    const g = this.game;
    this.deckFlash[i] = 1;
    this.ballStats.targets++;
    g.missions.event('target');
    g.missions.event('deckTarget');
    g.sfx('target', i, phased);
    // skill shot : la cellule clignotante touchée peu après le lancer
    if (this.skillArmed && i === this.skillTarget && this.time - this.lastLaunchT < RULES.skillShotWindow + 4) {
      this.skillArmed = false;
      g.addScore(30000 * g.level, b.x, b.y - 30, 'SKILL SHOT');
      g.sfx('skillShot');
      g.banner('SKILL SHOT', 'Cellule visée depuis le pont', '#29e3ff', 1.5, 'skillShot', { value: 30000 * g.level * g.bonus.mult });
      g.say('skillShot');
    }
    if (this.deckTargets[i]) { g.addScore(500, b.x, b.y - 20); return; }
    this.deckTargets[i] = true;
    g.addScore(2000, b.x, b.y - 20);
    if (this.deckTargets.every(Boolean)) {
      this.deckFlashAll = 1.5;
      g.sfx('bankComplete');
      if (!this.sectors.reactor.done) {
        this.sectorReady('reactor');
      } else {
        g.addScore(25000 * g.level, 285, -20, 'CELLULES');
        this.later(0.6, () => this.deckTargets.fill(false));
      }
      if (!this.kickback.lit) { this.kickback.lit = true; this.kickback.flash = 1; g.banner('KICKBACK ALLUMÉ', 'Le couloir extérieur gauche est protégé', '#5dff8f', 1.4); }
    } else if (!this.sectors.reactor.done) {
      g.say('targetProgress', { sector: SECTORS.reactor.name, n: this.deckTargets.filter(Boolean).length, max: 4 });
    }
  }

  // Éjecteur UPLINK sur le pont : retient la bille, récompense, puis la renvoie.
  onUplink(b) {
    if (this.uplink.ball || b.layer !== 2) return;
    const g = this.game, U = T.deck.uplink;
    this.uplink.ball = b;
    this.uplink.flash = 1;
    g.missions.event('uplink');
    if (this.sectorState('reactor') === 'ready' && g.canStartMinigame() && this.ballsInPlay() === 1) {
      this.uplink.ball = null;
      this.startMinigameCapture('reactor', b, U.x, U.y);
      return;
    }
    if (this.sectorState('reactor') === 'hold') g.say('hold');
    g.sfx('uplinkIn');
    this.captureBall(b, U.x, U.y, 0.18, 'uplink', () => { this.uplink.t = 0.9; });
    g.addScore(5000 * g.level, U.x, U.y - 30, 'UPLINK');
    g.say('uplink');
    this.shot('uplink', b, { base: 0 });
  }

  _updateUplink(dt) {
    const u = this.uplink;
    if (!u.ball || u.ball.state !== 'captured' || this.anims.some(a => a.ball === u.ball)) return;
    u.t -= dt;
    if (u.t > 0) return;
    const b = u.ball, U = T.deck.uplink;
    u.ball = null;
    b.state = 'free';
    b.setPos(U.x, U.y);
    b.vx = rand(-160, 160); b.vy = 520;
    this.uplink.flash = 1;
    this.game.sfx('uplinkOut');
    this.game.fx.ring(U.x, U.y, '#ffae2a', 40);
  }

  // ------------------------------------------------------------- spinners, cibles tombantes
  onSpinner(side, b) {
    if (b.layer !== 0) return;
    const s = this.spinners[side];
    const v = Math.abs(b.vy);
    s.w = Math.min(46, Math.max(s.w, v / 70));
  }

  _updateSpinners(dt) {
    const g = this.game;
    for (const side of ['L', 'R']) {
      const s = this.spinners[side];
      if (s.w <= 0.05) { s.w = 0; continue; }
      const before = Math.floor(s.a / Math.PI);
      s.a += s.w * dt;
      s.w *= Math.exp(-1.5 * dt);
      if (Math.floor(s.a / Math.PI) !== before) {
        s.n++;
        this.ballStats.spins++;
        g.addScore(100 * g.level, side === 'L' ? 41 : 521, T.spinnerY - 10);
        g.sfx('spinner', side === 'L' ? -1 : 1, s.w);
        g.missions.event('spin');
      }
    }
  }

  onDrop(i, b, imp, phased) {
    const g = this.game;
    if (this.drops[i]) return;
    if (!phased && imp < 120) return;
    this.drops[i] = true;
    this.R.drops[i].enabled = false;
    this.bankFlash.R[i] = 1;
    this.ballStats.targets++;
    g.missions.event('target');
    g.sfx('dropTarget', i);
    g.fx.burst(b.x, b.y, '#5dff8f', 6, 220);
    g.addScore(1500, b.x, b.y - 20);
    if (this.drops.every(Boolean)) {
      g.sfx('bankComplete');
      if (!this.sectors.defense.done) this.sectorReady('defense');
      else g.addScore(25000 * g.level, 472, 640, 'BOUCLIERS');
      this.dropResetT = this.sectors.defense.done ? 1.2 : -1;
    } else if (!this.sectors.defense.done) {
      g.say('targetProgress', { sector: SECTORS.defense.name, n: this.drops.filter(Boolean).length, max: 3 });
    }
  }

  // Remonte les cibles tombantes (jamais sur une bille).
  raiseDrops() {
    for (const b of this.world.balls) if (b.layer === 0 && b.x > 470 && b.y > 570 && b.y < 720) { this.dropResetT = 0.3; return; }
    this.drops = [false, false, false];
    for (const p of this.R.drops) p.enabled = true;
    this.dropResetT = 0;
    this.game.sfx('dropReset');
  }

  _updateDrops(dt) {
    if (this.dropResetT > 0) { this.dropResetT -= dt; if (this.dropResetT <= 0) this.raiseDrops(); }
  }

  // ------------------------------------------------------------- secteurs
  sectorProgress(id) {
    if (id === 'hangar') return this.bankL.filter(Boolean).length / 3;
    if (id === 'defense') return this.drops.filter(Boolean).length / 3;
    if (id === 'reactor') return this.deckTargets.filter(Boolean).length / 4;
    if (id === 'core') return ['hangar', 'reactor', 'defense'].filter(s => this.sectors[s].done).length / 3;
    return 0;
  }

  minigamesOnHold() { return this.multiball || this.launchQueue.length > 0 || this.game.bonus.deferredMB > 0; }

  // locked | prep | ready | hold | done
  sectorState(id) {
    const s = this.sectors[id];
    if (s.done) return 'done';
    const p = this.sectorProgress(id);
    if (p >= 1) return this.minigamesOnHold() ? 'hold' : 'ready';
    return p > 0 ? 'prep' : 'locked';
  }

  // Annonce d'accès à un secteur. En multibille, l'accès est qualifié mais en attente :
  // l'annonce « accessible » viendra quand le secteur deviendra jouable.
  sectorReady(id) {
    const g = this.game, s = SECTORS[id];
    const st = this.sectorState(id);
    if (st === 'hold') {
      this.sectors[id].flash = 2;
      g.sfx('sectorReady');
      g.banner(`${s.name} QUALIFIÉ`, 'Accès en attente : fin de la multibille', '#ffb52e', 1.8, 'banner');
      g.say('hold');
      return;
    }
    if (st !== 'ready' || this.announced[id]) return;
    this.announced[id] = true;
    this.sectors[id].flash = 2;
    g.fx.sweep?.(s.color);
    g.sfx('sectorReady');
    const where = { hangar: 'rampe du pont (gauche)', defense: 'rampe droite', reactor: 'éjecteur UPLINK du pont', core: 'portail central' }[id];
    g.banner(`${s.name} ACCESSIBLE`, `${s.game} — ${where}`, s.color, 2, 'sectorReady', { name: s.name });
    g.say('sectorReady', { sector: id });
    this.react('cheer', 1.5);
  }

  onMinigameEnd(sector, success) {
    const s = this.sectors[sector];
    this.announced[sector] = false;
    s.attempts++;
    if (success) { s.done = true; s.wins++; }
    if (sector === 'hangar') this.bankL = [false, false, false];
    if (sector === 'defense') this.raiseDrops();
    if (sector === 'reactor') this.deckTargets = [false, false, false, false];
    this.ballStats.modes++;
  }

  // Après la victoire contre NULL : nouveau cycle, difficulté accrue.
  newCycle() {
    this.announced = {};
    for (const id of Object.keys(this.sectors)) { this.sectors[id].done = false; this.sectors[id].phaseKept = 0; this.sectors[id].kept = null; }
    this.bankL = [false, false, false];
    this.deckTargets = [false, false, false, false];
    this.raiseDrops();
    this.kickback.lit = true;
  }

  // ---------------------------------------------------------------- tirs
  shot(id, ball, opts = {}) {
    const g = this.game;
    const c = this.combo;
    if (c.t > 0 && c.last !== id) c.count++;
    else c.count = 1;
    c.last = id; c.t = RULES.comboWindow;
    const mult = Math.min(6, c.count);
    const S = SHOTS[id] || { x: ball.x, y: ball.y + 40, label: opts.label };
    this.shotFlash[id] = 1;
    let label = opts.label || S.label;
    if (c.count >= 2) {
      label = `COMBO ×${c.count}`;
      g.sfx('combo', c.count);
      g.dmd?.('combo', { n: c.count });
      if (c.count === 3) g.missions.event('combo3');
      if (c.count === 3 || c.count === 5) g.say('combo', { n: c.count });
      g.music?.bump(0.12);
    }
    const base = opts.base ?? SHOT_BASE[id] ?? 2000;
    if (base > 0 || c.count >= 2) g.addScore(Math.max(base, 1000) * mult, S.x, S.y - 50, label);
    if (this.multiball && this.jackpots[id]) {
      this.jackpots[id] = false;
      const v = this.jackpotValue;
      const won = g.addScore(v, S.x, S.y - 90, 'JACKPOT');
      g.dmd?.('jackpot', { value: won });
      g.sfx('jackpot');
      g.fx.flash('#ffd84a', 0.25);
      g.fx.shake(6);
      g.fx.sweep?.('#ffd84a', 1080, -140, 0.45);
      g.say('jackpot');
      this.react('cheer', 2);
      if (!Object.values(this.jackpots).some(Boolean)) {
        this.superLit = true;
        g.banner('SUPER JACKPOT', 'Portail central', '#ffd84a', 1.6);
      }
    }
  }

  _rampJackpot(id) {
    const g = this.game;
    if (g.bonus.rampJT <= 0) return;
    const v = g.bonus.rampJValue;
    g.addScore(v, SHOTS[id].x, SHOTS[id].y - 120, 'JACKPOT RAMPE');
    g.bonus.rampJValue = Math.round(v * 1.25);
    g.sfx('jackpot');
    g.fx.flash('#ffb52e', 0.2);
  }

  onOrbit(side, dir, b) {
    const g = this.game;
    if (b.layer !== 0) return;
    if (dir > 0) {
      this.orbitIn = { side, t: this.time };
      g.sfx('orbitIn', side === 'L' ? -1 : 1);
      g.addScore(500, side === 'L' ? 46 : 516, 380);
      return;
    }
    // sortie vers le bas de l'autre côté : boucle complète (prime supplémentaire)
    if (this.orbitIn && this.orbitIn.side !== side && this.orbitIn.made) {
      this.orbitFlash[side] = 1;
      g.addScore(6000 * g.level, side === 'L' ? 60 : 502, 360, 'BOUCLE COMPLÈTE');
      g.sfx('loop');
    }
    this.orbitIn = null;
  }

  // La bille atteint le haut d'un couloir d'orbite : l'orbite (boucle) est validée.
  onOrbitTop(side, b) {
    const g = this.game;
    if (b.layer !== 0 || !this.orbitIn || this.orbitIn.side !== side || this.orbitIn.made) return;
    this.orbitIn.made = true;
    const id = side === 'L' ? 'lorbit' : 'rorbit';
    this.orbitFlash[side] = 1;
    this.ballStats.loops++;
    this.loops++;
    g.sfx('orbitIn', side === 'L' ? -1 : 1);
    g.missions.event('loop');
    this.shot(id, b, { label: 'BOUCLE' });
  }

  onRampEntry(side, dir, b) {
    if (dir > 0) {
      b.layer = 1; b.gScale = 1.32; b.maxSpeed = 0;
      this.game.sfx('rampEnter', side === 'L' ? -1 : 1);
    } else {
      b.layer = 0; b.gScale = 1; b.maxSpeed = 0;
    }
  }

  onRampTop(side, dir, b) {
    if (dir <= 0) return;
    b.gScale = 1;
    const sector = 'defense';
    if (this.sectorState(sector) === 'hold') { this.game.say('hold'); return; }
    if (this.sectorState(sector) === 'ready' && this.game.canStartMinigame() && this.ballsInPlay() === 1) {
      const rp = this.R.rampR;
      this.startMinigameCapture(sector, b, rp.portalX, rp.portalY);
    }
  }

  onRampExit(side, dir, b) {
    if (dir > 0) return;
    const g = this.game;
    b.layer = 0; b.gScale = 1; b.maxSpeed = 0;
    b.vy = Math.min(b.vy, 700);
    this.rampFlash[side] = 1;
    this.ballStats.ramps++;
    g.sfx('rampMade', this.combo.t > 0 ? this.combo.count : 0);
    g.missions.event('ramp');
    this.shot('rramp', b);
    this._rampJackpot('rramp');
  }

  onLane(i, b) {
    const g = this.game;
    if (b.layer !== 0) return;
    this.laneFlash[i] = 1;
    if (this.lanes[i]) { g.addScore(200, T.lanesX[i] + 27, T.laneY1); g.sfx('lane', i, false); return; }
    this.lanes[i] = true;
    this.ballStats.lanes++;
    g.addScore(1000, T.lanesX[i] + 27, T.laneY1);
    g.sfx('lane', i, true);
    if (this.lanes.every(Boolean)) {
      this.cpuCount++;
      this.bonusX = Math.min(RULES.bonusXMax, this.bonusX + 1);
      g.addScore(10000, 281, T.laneY1 + 20, 'C·P·U');
      g.sfx('lanesComplete');
      g.missions.event('lanes');
      if (this.cpuCount % 2 === 0 && !this.multiball && !this.multiballLit) {
        this.multiballLit = true;
        g.banner('RÉPLICATION PRÊTE', 'Multibille au portail central', '#ff3df2', 1.8);
        g.say('multiballLit');
      } else {
        g.banner(`BONUS ×${this.bonusX}`, this.multiballLit || this.multiball ? 'C·P·U complété' : 'Encore un C·P·U pour la multibille', '#29e3ff', 1.3);
      }
      this.later(0.5, () => { this.lanes = [false, false, false]; });
    }
  }

  onInlane(side, b) {
    if (b.layer !== 0) return;
    this.game.addScore(500, side === 'L' ? 80 : 482, 800);
    this.game.sfx('inlane', side === 'L' ? -1 : 1);
  }

  onOutlane(side, b) {
    const g = this.game;
    if (b.layer !== 0) return;
    g.addScore(2500, side === 'L' ? 39 : 523, 800);
    // kickback gauche : renvoie la bille dans le jeu
    if (side === 'L' && this.kickback.lit) {
      this.kickback.lit = false;
      this.kickback.flash = 1;
      const K = T.kickback;
      g.sfx('kickback');
      g.fx.ring(K.x, K.y, '#5dff8f', 50);
      this.captureBall(b, K.x, K.y - 40, 0.25, 'magnet', () => {
        b.state = 'free';
        b.vx = 60; b.vy = -2300;
        b.trail.length = 0;
      });
      g.say('kickback');
      return;
    }
    if (g.bonus.magnetT > 0) {
      const x = side === 'L' ? 39 : 523;
      g.sfx('magnet');
      g.fx.ring(x, 820, '#5dff8f', 60);
      this.captureBall(b, x, 760, 0.45, 'magnet', () => {
        b.state = 'free';
        b.vx = side === 'L' ? 520 : -520; b.vy = -1500;
        b.trail.length = 0;
      });
      g.say('magnet');
    } else g.sfx('outlane');
  }

  onShooterExit(b) {
    if (b.saveOnExit) {
      b.saveOnExit = false;
      const g = this.game;
      g.bonus.startSave(g.bonus.launchSaveSeconds(), 'launch');
      if (g.bonus.startMagnet > 0) g.bonus.grant('magnet', { duration: g.bonus.startMagnet });
    }
  }

  onBumper(i, b) {
    const g = this.game;
    this.bumperFlash[i] = 1;
    this.ballStats.bumpers++;
    const lvl = g.bonus.bumperLevel;
    const [x, y] = T.bumpers[i];
    g.addScore(150 * lvl, x, y - 34);
    g.sfx('bumper', i, lvl);
    g.fx.burst(b.x, b.y, '#ffae2a', 6, 240);
    // arc électrique vers un bumper voisin
    const [ox, oy] = T.bumpers[(i + 1 + (Math.random() < 0.5 ? 0 : 1)) % 3];
    g.fx.arc?.(x, y, ox, oy, ['#22e4ff', '#ff2bd6', '#ffb02e'][i]);
    g.missions.event('bumper');
  }

  onSling(side, b) {
    const g = this.game;
    this.slingFlash[side] = 1;
    g.addScore(30, side === 'L' ? 128 : 434, 820);
    g.sfx('sling', side === 'L' ? -1 : 1);
    g.fx.burst(b.x, b.y, '#ff3df2', 5, 200);
  }

  onTarget(side, i, b, imp, phased) {
    const g = this.game;
    const bank = this.bankL;
    const sector = 'hangar';
    this.bankFlash[side][i] = 1;
    this.ballStats.targets++;
    g.missions.event('target');
    g.sfx('target', i, phased);
    if (phased) g.fx.burst(b.x, b.y, '#b07bff', 8, 260);
    if (bank[i]) { g.addScore(300, b.x, b.y - 20); return; }
    bank[i] = true;
    g.addScore(1500, b.x, b.y - 20);
    if (bank.every(Boolean)) {
      if (this.sectors[sector].done) {
        g.addScore(25000 * g.level, 90, 640, 'BANQUE');
        g.sfx('bankComplete');
        this.later(0.6, () => bank.fill(false));
      } else {
        g.sfx('bankComplete');
        this.sectorReady(sector);
      }
    } else if (!this.sectors[sector].done) {
      g.say('targetProgress', { sector: SECTORS[sector].name, n: bank.filter(Boolean).length, max: 3 });
    }
  }

  onShutter(b, imp) {
    if (imp < 250) return;
    const g = this.game;
    this.portal.glow = 1;
    g.addScore(1000, 281, 470);
    g.sfx('shutter');
    if (this.sectorState('core') === 'hold') g.say('hold');
    g.missions.event('portal');
    this.shot('portal', b, { base: 2000, label: 'PORTAIL' });
  }

  // ------------------------------------------------------------ multibille
  beginMultiball(extra, reason) {
    const g = this.game;
    const total = Math.min(RULES.maxActiveBalls, this.ballsInPlay() + extra);
    const add = total - this.ballsInPlay();
    for (let i = 0; i < add; i++) this.queueLaunch(0.35 + i * 0.25);
    this.multiball = true;
    this.multiballLit = false;
    this.jackpotValue = Math.max(this.jackpotValue, 25000 * g.level);
    for (const k of Object.keys(this.jackpots)) this.jackpots[k] = true;
    this.superLit = false;
    g.bonus.startSave(10, 'multiball');
    g.sfx('multiball');
    g.fx.flash('#ff3df2', 0.3);
    g.fx.sweep?.('#ff3df2');
    g.banner(reason === 'deferred' ? 'MULTIBILLE DIFFÉRÉE' : 'RÉPLICATION DU NOYAU', 'Multibille ! Jackpots sur rampes et orbites', '#ff3df2', 2, 'multiball');
    g.say(reason === 'deferred' ? 'deferredMB' : 'multiball');
    this.react('cheer', 2.5);
    g.music?.setFlag('multiball', true);
  }

  awardSuperJackpot() {
    const g = this.game;
    const v = this.jackpotValue * 4;
    const won = g.addScore(v, 281, 380, 'SUPER JACKPOT');
    g.dmd?.('superJackpot', { value: won });
    g.sfx('superJackpot');
    g.fx.flash('#ffffff', 0.4);
    g.fx.sweep?.('#ffd84a', 1080, -140, 0.5);
    g.fx.shake(10);
    g.say('superJackpot');
    this.react('cheer', 3);
    this.superLit = false;
    this.jackpotValue = Math.round(this.jackpotValue * 1.5);
    for (const k of Object.keys(this.jackpots)) this.jackpots[k] = true;
  }

  endMultiball() {
    const g = this.game;
    this.multiball = false;
    this.superLit = false;
    for (const k of Object.keys(this.jackpots)) this.jackpots[k] = false;
    g.music?.setFlag('multiball', false);
    g.say('multiballEnd');
    // les accès aux minijeux mis en attente redeviennent disponibles
    for (const id of ['hangar', 'reactor', 'defense', 'core']) {
      if (this.sectorState(id) === 'ready') { this.sectors[id].flash = 2; }
    }
  }

  // ------------------------------------------------------- fin de bille
  endOfBallBonus() {
    const s = this.ballStats;
    const lines = [
      ['Rampes', s.ramps, 2000], ['Boucles', s.loops, 1500], ['Pont', s.deck, 2500], ['Cibles', s.targets, 300],
      ['Bumpers', s.bumpers, 60], ['Spinners', s.spins, 40], ['Couloirs', s.lanes, 400], ['Minijeux', s.modes, 10000],
    ].filter(l => l[1] > 0).map(([name, n, v]) => ({ name, n, pts: n * v }));
    const sub = lines.reduce((a, l) => a + l.pts, 0);
    return { lines, sub, mult: this.bonusX, total: sub * this.bonusX };
  }

  // ------------------------------------------------------- état lampes
  shotLamps() {
    const out = {};
    const g = this.game;
    const mission = g.missions.hud();
    for (const id of SHOT_IDS) {
      const lamp = { main: null, color: null, label: null, blink: 0, combo: 0, mission: false, jackpot: false, hold: false };
      if (mission && mission.shots && mission.shots.includes(id)) lamp.mission = true;
      if (this.combo.t > 0 && this.combo.last !== id && this.combo.count >= 1) lamp.combo = this.combo.count + 1;
      if (this.multiball && this.jackpots[id]) lamp.jackpot = true;
      out[id] = lamp;
    }
    const setMode = (id, sector, label) => {
      const st = this.sectorState(sector);
      const l = out[id];
      if (st === 'ready') { l.main = 'mode'; l.color = SECTORS[sector].color; l.label = label; l.blink = 1; }
      else if (st === 'hold') { l.main = 'hold'; l.color = '#ffb52e'; l.label = 'EN ATTENTE'; l.hold = true; }
    };
    setMode('lramp', 'hangar', 'BRIQUES');
    setMode('rramp', 'defense', 'DÉFENSE');
    const pm = this.portalMode();
    if (pm === 'core') { out.portal.main = 'mode'; out.portal.color = SECTORS.core.color; out.portal.label = 'DUEL NULL'; out.portal.blink = 1; }
    else if (pm === 'multiball') { out.portal.main = 'mode'; out.portal.color = '#ff3df2'; out.portal.label = 'MULTIBILLE'; out.portal.blink = 1; }
    else if (pm === 'super') { out.portal.main = 'jackpot'; out.portal.color = '#ffd84a'; out.portal.label = 'SUPER JACKPOT'; out.portal.blink = 1; }
    else if (this.sectorState('core') === 'hold') { out.portal.main = 'hold'; out.portal.color = '#ffb52e'; out.portal.label = 'EN ATTENTE'; out.portal.hold = true; }
    // rampe du pont : invite à monter quand le réacteur se prépare ou attend sur le pont
    const rs = this.sectorState('reactor');
    if (!out.lramp.main && (rs === 'prep' || rs === 'ready')) {
      out.lramp.main = rs === 'ready' ? 'mode' : 'prep'; out.lramp.color = SECTORS.reactor.color;
      out.lramp.label = rs === 'ready' ? 'RÉACTEUR' : 'PONT'; out.lramp.blink = rs === 'ready' ? 1 : 0;
    }
    for (const id of SHOT_IDS) {
      const l = out[id];
      if (!l.main && l.jackpot) { l.main = 'jackpot'; l.color = '#ffd84a'; l.label = 'JACKPOT'; l.blink = 1; }
      if (!l.main && g.bonus.rampJT > 0 && (id === 'lramp' || id === 'rramp')) { l.main = 'jackpot'; l.color = '#ffb52e'; l.label = 'JACKPOT'; l.blink = 0.5; }
    }
    return out;
  }

  // Prochain objectif conseillé (lisibilité) : texte court et couleur.
  nextGoal() {
    if (this.multiball) {
      return this.superLit ? { text: 'Super jackpot : portail central', color: '#ffd84a' } : { text: 'Multibille : jackpots sur rampes et orbites', color: '#ff3df2' };
    }
    const where = { core: 'Portail central : duel contre NULL', hangar: 'Rampe du pont : HANGAR', defense: 'Rampe droite : DÉFENSE', reactor: 'Pont supérieur → UPLINK : RÉACTEUR' };
    for (const id of ['core', 'hangar', 'defense', 'reactor']) {
      if (this.sectorState(id) === 'ready') return { text: where[id], color: SECTORS[id].color };
    }
    if (this.multiballLit) return { text: 'Portail central : multibille', color: '#ff3df2' };
    const counts = {
      hangar: [this.bankL.filter(Boolean).length, 3, 'cibles gauches'],
      defense: [this.drops.filter(Boolean).length, 3, 'cibles tombantes'],
      reactor: [this.deckTargets.filter(Boolean).length, 4, 'cellules du pont'],
    };
    let best = null;
    for (const id of ['hangar', 'defense', 'reactor']) {
      if (this.sectors[id].done) continue;
      if (!best || counts[id][0] / counts[id][1] > counts[best][0] / counts[best][1]) best = id;
    }
    if (best) { const [n, m, what] = counts[best]; return { text: `${SECTORS[best].name} : ${what} ${n}/${m}`, color: SECTORS[best].color }; }
    return { text: 'C·P·U : allumez les 3 couloirs', color: '#29e3ff' };
  }

  // ------------------------------------------------------- débogage
  debugQualify(sector) {
    if (sector === 'hangar') this.bankL = [true, true, true];
    if (sector === 'defense') { this.drops = [true, true, true]; for (const p of this.R.drops) p.enabled = false; }
    if (sector === 'reactor') this.deckTargets = [true, true, true, true];
    if (sector === 'core') { this.sectors.hangar.done = this.sectors.reactor.done = this.sectors.defense.done = true; }
  }
}
