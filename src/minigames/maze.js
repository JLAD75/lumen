import { Minigame } from './base.js';
import { addLines } from '../game/lumen.js';
import { clamp } from '../util/math.js';
import { MZ, planFor, cellCenter, wallSegments } from './mazeGen.js';
import { drawMazeStatic, renderMaze, renderMazeTop } from './mazeArt.js';

// LABYRINTHE GYROSCOPIQUE — secteur CONDUITS.
// Pas de batteurs : ← et → font tourner la gravité (rotation continue, sans retour
// automatique) ; ← + → ensemble (ou LANCER) serrent le frein magnétique. La bille roule dans
// les conduits : ramasser les clés de données ouvre la sortie, l'atteindre gagne.
// - Trappes : la bille tombe et repart de la dernière balise franchie, contre 3 s.
//   On ne peut pas perdre la bille : seul le chrono fait échouer.
// - Flèches au sol : accélèrent la bille dans leur sens. Capsules : +5 s.
// - Portes laser (niveau 2 et plus) : s'ouvrent et se ferment en rythme, annoncées.
// - Paliers : chaque clé ramassée est acquise pour la tentative suivante.
const { CS } = MZ;
const SILVER = '#cfe0ff', GOLD = '#ffd84a', LIME = '#5dff8f', RED = '#ff3d6e', CYAN = '#29e3ff';
const BALL_R = 13;
const TRAP_FALL = 11;               // centre de la bille à moins de … du centre de la trappe
const PICK = 28;                    // rayon de ramassage (clés, capsules, balises)
const DOOR = { open: 2.6, closed: 2.0, warn: 0.5 };

// Réglages par niveau
export function mazeTuning(lvl) {
  const k = Math.max(0, lvl - 1);
  return {
    time: Math.max(70, [75, 80, 95][Math.min(2, k)] - 5 * Math.max(0, k - 2)),
    G: 1150,                          // gravité (unités/s²)
    damping: 0.9,                     // roulement (par seconde)
    cap: 520,                         // vitesse maximale de la bille
    w0: 3.5, w1: 8, wa: 14,           // rotation de la gravité : départ, maximum (rad/s), accélération
  };
}

addLines({
  enter_maze: { pri: 4, cd: 0, v: [
    'Conduits de la station. Vous tenez la gravité : ← et → la font tourner. Les deux ensemble : frein.',
    'Labyrinthe gyroscopique. Ramassez les clés, puis la sortie. Et regardez où vous mettez la bille.',
  ] },
  mazeKey: { pri: 2, cd: 0, v: ['Clé {n} sur {max}.', 'Clé de données récupérée : {n}/{max}.'] },
  mazeAllKeys: { pri: 4, cd: 0, v: ['Toutes les clés ! La sortie est ouverte, en haut.', 'Sortie déverrouillée. Remontez au sommet.'] },
  mazeFall: { pri: 2, cd: 4, v: ['Trappe. Retour à la dernière balise.', 'Chute. Je vous redépose à la balise, contre trois secondes.'] },
  mazeCheck: { pri: 1, cd: 6, v: ['Balise activée : point de reprise enregistré.'] },
  mazeKept: { pri: 3, cd: 0, v: ['Clés conservées : {n} déjà en poche.'] },
  mazeBrake: { pri: 1, cd: 30, v: ['Astuce : les deux commandes ensemble serrent le frein magnétique.'] },
  mazeWin: { pri: 4, cd: 0, v: ['Sortie atteinte. Les conduits sont à nous.', 'Parcours bouclé. NULL a perdu le nord. Littéralement.'] },
  mazePerfect: { pri: 4, cd: 0, v: ['Sans une seule chute. Jackpot de rampe mérité.'] },
  mazeDoor: { persona: 'null', pri: 2, cd: 12, v: ['PORTES LASER EN SERVICE. BONNE CHANCE.', 'MES PORTES ONT LE SENS DU RYTHME. PAS VOUS.'] },
});

export class MazeGame extends Minigame {
  constructor(game, opts) {
    const lvl = opts.level || 1;
    const T = mazeTuning(lvl);
    const plan = planFor(lvl);
    super(game, opts, {
      gravity: 0, damping: T.damping,
      time: T.time,
      title: 'LABYRINTHE GYROSCOPIQUE',
      objective: `${plan.keys.length} clés puis la sortie · ← → font tourner la gravité`,
      music: 'maze',
      perk: { name: 'Trappes scellées', desc: 'Les trappes sont fermées pendant 12 s' },
    });
    this.T = T;
    this.plan = plan;
    this.world.speedCap = T.cap;
    this.phi = 0;                   // direction de la gravité (0 = vers le bas, sens horaire)
    this.omega = 0;                 // vitesse de rotation en cours (rad/s, signée)
    this.braking = false;
    this.sealT = 0;
    this.falls = 0; this.checksOn = 0; this.capsTaken = 0; this.boostsUsed = 0;
    this.fall = null; this.winSeq = null;
    this.callout = null;
    this.servoT = 0;
    this.tipT = 0;
    const center = ([c, r]) => cellCenter(c, r);
    this.keys = plan.keys.map((k, i) => { const [x, y] = center(k); return { i, x, y, got: false, t: 0 }; });
    this.traps = plan.traps.map((k) => { const [x, y] = center(k); return { x, y }; });
    this.checks = plan.checks.map((k) => { const [x, y] = center(k); return { x, y, on: false, flash: 0 }; });
    this.boosts = plan.boosts.map((b) => { const [x, y] = cellCenter(b.c, b.r); return { x, y, dx: b.dx, dy: b.dy, cd: 0, flash: 0 }; });
    this.caps = plan.caps.map((k) => { const [x, y] = center(k); return { x, y, got: false }; });
    const [sx, sy] = center(plan.start), [ex, ey] = center(plan.exit);
    this.startPos = { x: sx, y: sy };
    this.respawn = { x: sx, y: sy };
    this.exit = { x: ex, y: ey, open: false, t: 0 };
    this._build();
    // clés conservées d'une tentative précédente (jamais toutes)
    const kept = (this.kept && Array.isArray(this.kept.keys)) ? this.kept.keys.filter(i => this.keys[i]).slice(0, this.keys.length - 1) : [];
    for (const i of kept) this.keys[i].got = true;
    this.keptStart = kept.length;
    this.world.build();
  }

  get keysGot() { return this.keys.filter(k => k.got).length; }

  _build() {
    const w = this.world;
    for (const [ax, ay, bx, by] of wallSegments(this.plan)) w.seg(ax, ay, bx, by, { mat: 'metal', e: 0.35, mu: 0.08, r: 4, style: 'none' });
    // portes laser : segment en travers du passage, activé en rythme
    this.doors = this.plan.doors.map((D) => {
      const x0 = MZ.X0 + D.c * CS, y0 = MZ.Y0 + D.r * CS;
      let s;
      if (D.d === 'n') s = [x0 + 6, y0, x0 + CS - 6, y0];
      else if (D.d === 's') s = [x0 + 6, y0 + CS, x0 + CS - 6, y0 + CS];
      else if (D.d === 'e') s = [x0 + CS, y0 + 6, x0 + CS, y0 + CS - 6];
      else s = [x0, y0 + 6, x0, y0 + CS - 6];
      const p = w.seg(s[0], s[1], s[2], s[3], { mat: 'energy', e: 0.5, r: 3, dynamic: true, enabled: false, style: 'none' });
      return { s, p, t: D.ph, closed: false, warn: 0, flash: 0 };
    });
  }

  entryPoint() { return { x: this.startPos.x, y: this.startPos.y }; }

  placeEntry(ball) {
    ball.setPos(this.startPos.x, this.startPos.y);
    ball.vx = 0; ball.vy = 0;
  }

  begin(ball) {
    super.begin(ball);
    if (this.keptStart > 0) this.game.later(3.6, () => { if (this.state === 'play') this.game.say('mazeKept', { n: this.keptStart }); });
    if (this.doors.length) this.game.later(5.5, () => { if (this.state === 'play') this.game.say('mazeDoor'); });
  }

  applyPerk() { this.sealT = 12; this.perkT = 12; }

  // Les murs sont fermés : la bille ne sort pas. Par sécurité, une relance (bouclier) la
  // repose immobile à la dernière balise.
  prepareRelaunch(ball) {
    ball.state = 'held'; ball.vx = ball.vy = 0; ball.scale = 1;
    ball.setPos(this.respawn.x, this.respawn.y);
    if (!this.world.balls.includes(ball)) this.world.addBall(ball);
    this.ball = ball;
    this.autoRelaunch = true;
  }

  doRelaunch(b) {
    b.state = 'free';
    b.setPos(this.respawn.x, this.respawn.y);
    b.vx = 0; b.vy = 0;
  }

  // ------------------------------------------------------------ boucle
  step(dt, inp) {
    const g = this.game, b = this.ball;
    if (this.sealT > 0) this.sealT -= dt;
    if (this.winSeq) { this._updateWin(dt); if (this.state === 'play') this.timeLeft = Math.min(this.timeLimit, this.timeLeft + dt); }
    if (this.state === 'ended') return;
    // commandes : rotation continue, frein (les deux ensemble, ou LANCER)
    const L = !!inp.left, Rt = !!inp.right;
    this.braking = (L && Rt) || !!inp.launch;
    const T = this.T;
    if (this.braking || (!L && !Rt)) this.omega = 0;
    else {
      const dir = Rt ? 1 : -1;
      const w = Math.sign(this.omega) === dir ? Math.min(T.w1, Math.abs(this.omega) + T.wa * dt) : T.w0;
      this.omega = dir * w;
      this.phi += this.omega * dt;
      this.servoT -= dt;
      if (this.servoT <= 0) { g.sfx('mazeTilt', dir, Math.abs(this.omega) / T.w1); this.servoT = 0.14; }
    }
    if (this.braking && inp.leftPressed !== inp.rightPressed) g.sfx('mazeBrake');
    const G = T.G * (this.braking ? 0.25 : 1);
    this.world.gx = Math.sin(this.phi) * G;
    this.world.gy = Math.cos(this.phi) * G;
    this.world.damping = this.braking ? 5 : T.damping;
    this._updateDoors(dt);
    this.world.step(dt);
    if (this.fall) this._updateFall(dt);
    else if (b && b.state === 'free' && !this.winSeq) this._items(b, dt);
    for (const B of this.boosts) { if (B.cd > 0) B.cd -= dt; B.flash = Math.max(0, B.flash - dt * 2); }
    for (const C of this.checks) C.flash = Math.max(0, C.flash - dt * 2);
    for (const K of this.keys) K.t += dt;
    this.exit.t += dt;
    if (this.callout) { this.callout.t += dt; if (this.callout.t >= this.callout.life) this.callout = null; }
    // conseil du frein si la bille file vite longtemps
    if (b && Math.hypot(b.vx, b.vy) > T.cap * 0.9) { this.tipT += dt; if (this.tipT > 2) { this.tipT = -30; g.say('mazeBrake'); } }
    this.intensity = 0.6 + 0.3 * (this.keysGot / this.keys.length) + (this.exit.open ? 0.08 : 0);
  }

  _updateDoors(dt) {
    const b = this.ball;
    for (const D of this.doors) {
      D.t += dt;
      D.flash = Math.max(0, D.flash - dt * 3);
      const P = DOOR.open + DOOR.closed, u = ((D.t % P) + P) % P;
      const want = u >= DOOR.open;
      D.warn = !want && u > DOOR.open - DOOR.warn ? 1 : 0;
      if (want && !D.closed) {
        // jamais refermée sur la bille : attend qu'elle soit passée
        if (b && segDist(b.x, b.y, D.s) < BALL_R + 6) { D.t -= dt; continue; }
        D.closed = true; D.flash = 1;
        this.game.sfx('mazeDoor', 1);
      } else if (!want && D.closed) { D.closed = false; this.game.sfx('mazeDoor', 0); }
      D.p.enabled = D.closed;
    }
  }

  _items(b, dt) {
    const g = this.game;
    const near = (o, r) => Math.hypot(b.x - o.x, b.y - o.y) < r;
    // trappes
    if (this.sealT <= 0) {
      for (const T of this.traps) if (near(T, TRAP_FALL)) { this._startFall(T); return; }
    }
    for (const C of this.checks) {
      if (C.on || !near(C, PICK)) continue;
      for (const o of this.checks) if (o !== C && o === this.lastCheck) o.on = false;
      C.on = true; C.flash = 1; this.lastCheck = C; this.checksOn++;
      this.respawn = { x: C.x, y: C.y };
      g.sfx('mazeCheck');
      g.fx.ring(C.x, C.y, LIME, 50, 0.4);
      g.fx.text(C.x, C.y - 30, 'BALISE', LIME, 0.8);
      g.say('mazeCheck');
    }
    for (const K of this.keys) {
      if (K.got || !near(K, PICK)) continue;
      K.got = true;
      const n = this.keysGot, max = this.keys.length;
      g.addScore(8000 * this.level, K.x, K.y - 30, 'CLÉ');
      g.sfx('mazeKey', n);
      g.fx.burst(K.x, K.y, GOLD, 16, 300);
      g.fx.ring(K.x, K.y, GOLD, 60, 0.45);
      if (n >= max) this._openExit();
      else {
        g.say('mazeKey', { n, max });
        this.callout = { text: `CLÉ ${n}/${max}`, color: GOLD, t: 0, life: 1.1 };
      }
    }
    for (const Cp of this.caps) {
      if (Cp.got || !near(Cp, PICK)) continue;
      Cp.got = true; this.capsTaken++;
      this.timeLeft = Math.min(this.timeLimit + 30, this.timeLeft + 5);
      g.sfx('mazeCapsule');
      g.fx.text(Cp.x, Cp.y - 30, '+5 s', CYAN, 1.1);
      g.fx.burst(Cp.x, Cp.y, CYAN, 12, 260);
    }
    for (const B of this.boosts) {
      if (B.cd > 0 || !near(B, 24)) continue;
      const along = b.vx * B.dx + b.vy * B.dy, want = this.T.cap * 0.9;
      if (along < want) { b.vx += (want - along) * B.dx; b.vy += (want - along) * B.dy; }
      B.cd = 0.8; B.flash = 1; this.boostsUsed++;
      g.sfx('mazeBoost');
    }
    if (this.exit.open && near(this.exit, 26)) this._startWin(b);
  }

  _openExit() {
    const g = this.game;
    this.exit.open = true; this.exit.t = 0;
    g.sfx('mazeExitOpen');
    g.say('mazeAllKeys');
    g.banner('SORTIE OUVERTE', 'Remontez au sommet du labyrinthe', SILVER, 1.8);
    g.dmd('banner', { title: 'SORTIE OUVERTE', sub: 'Toutes les clés', color: SILVER });
    this.callout = { text: 'SORTIE OUVERTE', color: SILVER, t: 0, life: 1.6 };
    if (g.renderer && g.renderer.pulse) g.renderer.pulse(SILVER, 1);
  }

  // ------------------------------------------------------------ chute et reprise
  _startFall(T) {
    const g = this.game, b = this.ball;
    this.falls++;
    b.state = 'captured';
    this.fall = { t: 0, x: T.x, y: T.y, sx: b.x, sy: b.y };
    this.timeLeft = Math.max(0.5, this.timeLeft - 3);
    g.sfx('mazeFall');
    g.fx.text(T.x, T.y - 32, '−3 s', RED, 1);
    g.fx.shake(3);
    g.say('mazeFall');
  }

  _updateFall(dt) {
    const F = this.fall, b = this.ball;
    F.t += dt;
    const u = Math.min(1, F.t / 0.45);
    b.x = F.sx + (F.x - F.sx) * u; b.y = F.sy + (F.y - F.sy) * u;
    b.px = b.x; b.py = b.y;
    b.scale = Math.max(0, 1 - u);
    if (F.t < 0.75) return;
    // rematérialisée à la dernière balise, immobile
    b.setPos(this.respawn.x, this.respawn.y);
    b.vx = 0; b.vy = 0; b.scale = 1; b.state = 'free';
    this.fall = null;
    this.game.sfx('mazeRespawn');
    this.game.fx.ring(this.respawn.x, this.respawn.y, LIME, 44, 0.4);
  }

  // ------------------------------------------------------------ victoire
  _startWin(b) {
    const g = this.game;
    b.state = 'captured';
    this.winSeq = { t: 0, sx: b.x, sy: b.y, done: false };
    g.sfx('mazeWin');
    g.say(this.falls === 0 ? 'mazePerfect' : 'mazeWin');
    g.fx.flash(SILVER, 0.3);
    g.slowT = Math.max(g.slowT, 0.5);
    this.callout = { text: this.falls === 0 ? 'PARCOURS PARFAIT' : 'SORTIE !', color: this.falls === 0 ? GOLD : SILVER, t: 0, life: 1.8 };
    if (g.renderer && g.renderer.pulse) g.renderer.pulse(SILVER, 1.3);
  }

  _updateWin(dt) {
    const W = this.winSeq, b = this.ball;
    W.t += dt;
    const u = Math.min(1, W.t / 0.5);
    b.x = W.sx + (this.exit.x - W.sx) * u; b.y = W.sy + (this.exit.y - W.sy) * u;
    b.px = b.x; b.py = b.y;
    b.scale = Math.max(0.15, 1 - u * 0.85);
    if (W.t >= 1.3 && !W.done) { W.done = true; b.scale = 1; this.finish(true, 'exit'); }
  }

  onTimeout() {
    if (this.winSeq) { this.timeLeft = 0.02; return; }
    super.onTimeout();
  }

  // ------------------------------------------------------------ fin et progression
  keepProgress() { return { keys: this.keys.filter(k => k.got).map(k => k.i).slice(0, this.keys.length - 1) }; }

  results(success) {
    const rewards = [{ type: 'shield' }, { type: 'magnet' }];
    if (this.falls === 0) rewards.push({ type: 'rampJackpot' });
    return {
      rewards: success ? rewards : [],
      points: success ? (35000 + Math.round(this.timeLeft) * 1000) * this.level : 0,
    };
  }

  progressText() {
    const ex = this.exit.open ? ' · SORTIE OUVERTE' : '';
    const fl = this.falls ? ` · chutes ${this.falls}` : '';
    return `Clés ${this.keysGot}/${this.keys.length}${ex}${fl}`;
  }

  debugWin() { for (const K of this.keys) K.got = true; this.finish(true, 'debug'); }
  debugLoseBall() { this.timeLeft = 0.01; }

  // ------------------------------------------------------------ rendu
  drawStatic(g, r) { drawMazeStatic(g, r, this); }
  render(ctx, r) { renderMaze(ctx, r, this); }
  renderTop(ctx, r) { renderMazeTop(ctx, r, this); }
}

function segDist(px, py, s) {
  const [ax, ay, bx, by] = s, dx = bx - ax, dy = by - ay;
  const t = clamp(((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy), 0, 1);
  return Math.hypot(px - (ax + dx * t), py - (ay + dy * t));
}
