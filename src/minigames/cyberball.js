import { FlipperArena } from './arena.js';
import { addLines } from '../game/lumen.js';
import { rand, clamp, lerp, approach } from '../util/math.js';
import { CB, drawCyberballStatic, renderCyberball, renderCyberballTop } from './cyberballArt.js';

// CYBERBALL — secteur ARÈNE.
// Un stade néon remplace la moitié haute de l'arène. Objectif : marquer des buts
// (5 au premier cycle) dans le temps imparti, contre le GARDIEN de NULL, un drone qui
// coulisse devant la ligne de but et anticipe la trajectoire de la bille (temps de réaction
// et vitesse limités). Deux DÉFENSEURS patrouillent au milieu du terrain.
// - Tir puissant sur le gardien : il est assommé quelques secondes (but ouvert).
// - Montant touché : « POTEAU ! ». But contre un montant : LUCARNE, points ×2.
// - Chaque but : ralenti, feux d'artifice, clameur, puis engagement au rond central
//   (barrière de protection) ; l'équipe de NULL se renforce (gardien plus vif, défenseur
//   supplémentaire, pressing).
// - CORNERS : un tir qui remonte un couloir latéral allumé est renvoyé en centre vers le but.
// - Bille tombée : fin du minijeu ; jusqu'à 3 buts sont conservés pour la tentative suivante.
const { CX, CEIL_Y, GOAL_Y, POST_L, POST_R, POST_RAD, KEEPER_Y, KEEPER_R, DEF_R, KICK, LUC, WING, CORNERS, CORNER_R } = CB;
const BLUE = '#4d7dff', GOLD = '#ffd84a', RED = '#ff3d6e', CYAN = '#29e3ff', LIME = '#5dff8f';
const WALL_L = 20, WALL_R = 542;

// Réglages par niveau (cycle) : le gardien devient plus vif, plus large, plus dur à assommer.
export function cyberballTuning(lvl) {
  const k = Math.max(0, lvl - 1);
  return {
    goals: lvl >= 4 ? 6 : 5,
    time: 75,
    kSpeed: Math.min(640, 260 + 60 * k),        // vitesse max du gardien (unités/s)
    kAccel: 3600 + 700 * k,                      // accélération du gardien
    react: Math.max(0.12, 0.32 - 0.055 * k),     // temps de réaction (s)
    err: Math.max(6, 26 - 6 * k),                // erreur d'anticipation (±)
    hl: Math.min(28, 14 + 4 * k),                // demi-longueur du corps (hors embouts)
    stunImpact: 1800 + 150 * k,                  // impact qui assomme le gardien
    stunDur: Math.max(2.5, 4.5 - 0.6 * k),       // durée du K.O. (s)
    defK: 1 + 0.15 * k,                          // cadence des défenseurs
    cornerCd: 7 + 2 * k,                         // recharge d'un lanceur CORNER (s)
    track: Math.min(0.45, 0.25 + 0.07 * k),      // placement d'attente : suit le côté de la bille
  };
}

// Défenseurs : patrouille sinusoïdale (lisible, donc « timable »). Le n° 10 dort au départ.
const DEFS = [
  { x0: 158, y: 410, amp: 72, freq: 0.85, phase: 0, n: 4 },
  { x0: 404, y: 410, amp: 72, freq: 0.85, phase: Math.PI, n: 5 },
  { x0: CX, y: 478, amp: 150, freq: 0.62, phase: Math.PI / 2, n: 10, sleeper: true },
];

// Montée en puissance de NULL après chaque but (n = buts marqués).
const ESCALATE = {
  1: { title: 'LE GARDIEN ACCÉLÈRE', sub: 'Vitesse du gardien +12 %', say: 'cbFaster' },
  2: { title: 'UN DÉFENSEUR SE RÉVEILLE', sub: 'Le n° 10 entre sur le terrain', say: 'cbWake' },
  3: { title: 'GARDIEN SURCADENCÉ', sub: 'Réflexes du gardien +20 %', say: 'cbFaster' },
  4: { title: 'PRESSING !', sub: 'Les défenseurs accélèrent', say: 'cbPressing' },
  5: { title: 'GARDIEN ÉLARGI', sub: 'Le gardien déploie ses gants', say: 'cbFaster' },
};

addLines({
  enter_arena: { pri: 4, cd: 0, v: [
    'Stade Cortex-9, tribunes pleines. Cinq buts au gardien de NULL : frappez fort, il déteste ça.',
    'Coup d\'envoi ! Cinq buts contre le gardien de NULL. Vos batteurs font office de crampons.',
  ] },
  cbGoal: { pri: 3, cd: 1, v: ['BUUUT ! {score}.', 'Au fond des filets ! {score}.', 'But ! La tribune perd la tête. {score}.', 'Imparable. {score}.'] },
  cbLucarne: { pri: 3, cd: 1, v: ['En pleine lucarne ! Points doublés.', 'Lucarne ! Même le gardien applaudit. Intérieurement.'] },
  cbHatTrick: { pri: 3, cd: 0, v: ['Triplé ! La foule scande votre matricule.'] },
  cbLast: { pri: 3, cd: 0, v: ['Balle de match. Un but et la tribune explose.', 'Plus qu\'un but. Le stade retient son souffle.'] },
  cbWin: { pri: 4, cd: 0, v: ['Victoire ! Les tribunes réclament un tour d\'honneur.', 'Match plié. NULL demande un remboursement.'] },
  cbPost: { pri: 2, cd: 4, v: ['Poteau ! Le métal a dit non.', 'Poteau ! Ça résonne jusqu\'au réacteur.', 'Le poteau. Meilleur défenseur de NULL.'] },
  cbStun: { pri: 3, cd: 3, v: ['Gardien K.O. ! Le but est grand ouvert !', 'Frappe canon : le gardien redémarre. Vite !'] },
  cbSave: { pri: 1, cd: 9, v: ['Arrêt du gardien. Il lit vos trajectoires.', 'Tirez plus fort : au-delà d\'une certaine vitesse, il s\'assomme.', 'Visez les coins : il ne couvre pas tout.'] },
  cbFaster: { pri: 2, cd: 0, v: ['Le gardien accélère. Il a vu le score.', 'Le gardien passe en mode surcadencé.'] },
  cbWake: { pri: 2, cd: 0, v: ['Un défenseur supplémentaire entre sur le terrain. NULL panique.'] },
  cbPressing: { pri: 2, cd: 0, v: ['Pressing des défenseurs ! Gardez votre sang-froid.'] },
  cbCorner: { pri: 2, cd: 5, v: ['Corner ! Centre au second poteau.', 'Corner. Je vous la remets dans la surface.', 'Centre ! Le gardien a intérêt à sortir.'] },
  cbClear: { pri: 2, cd: 6, v: ['Sauvetage sur la ligne ! La barrière était bien placée.', 'Dégagé sur la ligne. On respire.'] },
  cbNullGoal: { persona: 'null', pri: 4, cd: 0, v: ['BUT POUR NULL. L\'ARBITRE, C\'EST MOI.', 'NULL MARQUE. VOTRE DÉFENSE EST UN BOGUE.'] },
});

export class CyberballGame extends FlipperArena {
  constructor(game, opts) {
    const lvl = opts.level || 1;
    const T = cyberballTuning(lvl);
    super(game, opts, {
      gravity: 2000,
      time: T.time,
      title: 'CYBERBALL',
      objective: `Marquez ${T.goals} buts — un tir puissant assomme le gardien`,
      music: 'arena',
      perk: { name: 'Gardien en retard', desc: 'Temps de réaction du gardien doublé pendant 10 s' },
    });
    this.T = T;
    this.target = T.goals;
    this.kSpeed = T.kSpeed;
    this.react = T.react;
    this.defK = T.defK;
    this.goals = 0;               // buts au tableau (conservés compris)
    this.goalsNow = 0;            // buts marqués pendant cette tentative
    this.nullGoals = 0;
    this.lucarnes = 0; this.postHits = 0; this.saves = 0; this.stuns = 0; this.defHits = 0;
    this.clears = 0; this.unstuck = 0;
    this.seq = null;              // célébration d'un but (bille dans le filet → engagement)
    this.kickSide = -1;
    this.stk = { x: 0, y: 0, t: 0, slow: 0 };
    this.rockets = [];
    this.confetti = [];
    this.callout = null;          // grand texte au-dessus du terrain
    this.jumbo = { kind: 'idle', t: 0 };
    this.net = { x: CX, y: GOAL_Y - 30, k: 0 };
    this.hype = 0.3;              // excitation de la foule (0..1)
    this.kickBeam = 0;
    this.cross = null;            // centre en cours (bille dans un lanceur CORNER)
    this.crosses = 0;
    this.openFlash = 0;
    this.clearCd = 0; this.dmdCd = 0;
    this.lastVy = 0;
    this.intensity = 0.75;
    this._build();
    // buts conservés d'une tentative précédente (jamais le dernier)
    const kept = clamp((this.kept && this.kept.goals) || 0, 0, Math.min(3, this.target - 1));
    this.goals = kept;
    for (let n = 1; n <= kept; n++) this._escalate(n, true);
    this.world.build();
  }

  _build() {
    const w = this.world;
    // plafond : bord inférieur de la tribune (au-dessus, le décor : écran géant, public)
    w.seg(70, CEIL_Y, 530, CEIL_Y, { mat: 'metal', r: 4, style: 'cbRoof' });
    // cage : montants verticaux jusqu'à la tribune (l'intérieur n'est accessible que par la ligne)
    w.seg(POST_L, GOAL_Y, POST_L, CEIL_Y, { mat: 'metal', r: 4, style: 'cbGoal' });
    w.seg(POST_R, GOAL_Y, POST_R, CEIL_Y, { mat: 'metal', r: 4, style: 'cbGoal' });
    this.posts = [POST_L, POST_R].map((x, i) => {
      const P = { i, x, y: GOAL_Y, flash: 0, cd: 0 };
      P.p = w.circle(x, GOAL_Y, POST_RAD, { mat: 'post', e: 0.68, style: 'cbPost' });
      P.p.onHit = (b, imp) => this._postHit(P, b, imp);
      // aile : une bille qui monte juste à côté du montant est rabattue vers la bouche
      // (le haut de l'aile fait partie du montant : « POTEAU ! »)
      const sx = i ? 1 : -1;
      P.wing = w.seg(x + sx * WING.dx, GOAL_Y + WING.dy, x, GOAL_Y, { mat: 'metal', r: 4, style: 'cbWing' });
      P.wing.onHit = (b, imp) => { if (Math.hypot(b.x - x, b.y - GOAL_Y) < 34) this._postHit(P, b, imp); };
      return P;
    });
    // ligne de but : franchie vers le haut entre les montants = but
    this.line = w.sensor(POST_L, GOAL_Y, POST_R, GOAL_Y, { onCross: (b, dir) => { if (dir > 0) this._goal(b); } });
    // gardien : capsule mobile devant la ligne
    const hl = this.T.hl;
    const K = this.keeper = {
      x: CX, vx: 0, hl, tgt: CX, err: 0, stun: 0, reboot: 0, flash: 0, save: 0, hitCd: 0,
      ht: [], hp: [], tilt: 0, t: 0, ko: 0,
    };
    K.p = w.seg(CX - hl, KEEPER_Y, CX + hl, KEEPER_Y, { mat: 'rubber', e: 0.55, mu: 0.1, r: KEEPER_R, dynamic: true, style: 'none' });
    K.p.onHit = (b, imp, nx, ny) => this._keeperHit(b, imp, nx, ny);
    // défenseurs
    this.defs = DEFS.map((D) => {
      const d = { ...D, x: D.x0, vx: 0, t: 0, flash: 0, cd: 0, sleep: !!D.sleeper, wake: D.sleeper ? 0 : 1, face: Math.PI / 2 };
      d.p = w.circle(D.x0, D.y, DEF_R, { mat: 'rubber', kick: 160, kickMin: 90, kickCooldown: 0.12, dynamic: true, enabled: !d.sleep, style: 'none' });
      d.p.onHit = (b, imp) => this._defHit(d, b, imp);
      return d;
    });
    // lanceurs CORNER : la bille qui remonte le couloir est renvoyée en centre vers le but
    this.corners = CORNERS.map((c, i) => {
      const C = { i, x: c.x, y: c.y, lit: true, cd: 0, charge: 0, flash: 0, side: i ? 1 : -1 };
      w.zone(c.x, c.y, CORNER_R, { onInside: (b) => this._cornerTry(C, b) });
      return C;
    });
    // barrière de protection : un rebond dessus = « sauvetage sur la ligne »
    if (this.barrier) this.barrier.onHit = (b, imp) => this._lineClear(b, imp);
  }

  entryPoint() { return { x: KICK.x, y: KICK.y }; }

  begin(ball) {
    super.begin(ball);
    this.game.sfx('cbWhistle', 2);
    this.kickBeam = 1;
  }

  applyPerk() { this.perkT = 10; }

  // ------------------------------------------------------------ boucle
  arenaStep(dt) {
    if (this.clearCd > 0) this.clearCd -= dt;
    if (this.dmdCd > 0) this.dmdCd -= dt;
    if (this.seq) {
      this._updateSeq(dt);
      // chrono gelé pendant la célébration
      if (this.state === 'play') this.timeLeft = Math.min(this.timeLimit, this.timeLeft + dt);
    }
    if (this.state === 'ended') return;
    if (this.keeper.hold) this._updateHold(dt);
    if (this.cross) this._updateCross(dt);
    this._updateCorners(dt);
    this._updateKeeper(dt);
    this._updateDefenders(dt);
    this._updateFx(dt);
    const b = this.ball;
    if (b && b.state === 'free') {
      if (this.lastVy >= 0 && b.vy < 0) this.keeper.err = rand(-1, 1) * this.T.err;   // nouvelle trajectoire
      this.lastVy = b.vy;
    }
    const left = this.target - this.goals;
    this.intensity = 0.72 + (1 - left / this.target) * 0.18 + (this.keeper.stun > 0 ? 0.08 : 0);
  }

  // anti-blocage : bille immobile (ou qui se traîne) hors des batteurs = petite poussée
  afterStep(dt) {
    const b = this.ball, S = this.stk;
    if (!b || b.state !== 'free' || this.state !== 'play' || this.seq) { S.t = 0; S.slow = 0; return; }
    const f = this.frame;
    const cradle = b.y > 860 && (f.flipL.pressed || f.flipR.pressed);
    if (!cradle && Math.abs(b.x - S.x) < 5 && Math.abs(b.y - S.y) < 5) S.t += dt;
    else { S.x = b.x; S.y = b.y; S.t = 0; }
    const sp = Math.hypot(b.vx, b.vy);
    if (b.y < 860 && sp < 100) S.slow += dt; else if (sp > 250 || b.y >= 860) S.slow = 0;
    if (S.t > 1.5 || S.slow > 2.5) {
      S.t = 0; S.slow = 0;
      this.unstuck++;
      b.vx = rand(-280, 280); b.vy = -420;
      this.game.say('stuck');
    }
  }

  // ------------------------------------------------------------ gardien
  // Point où la bille croisera le rail du gardien (balistique, un rebond latéral au plus).
  _predict(b) {
    if (this.cross) return this.cross.tx;          // le gardien lit le centre
    if (!b || b.state !== 'free') return CX;
    if (b.vy < -40 && b.y > KEEPER_Y + 10) {
      const A = 0.5 * this.world.gy, B = b.vy, C = b.y - KEEPER_Y;
      const disc = B * B - 4 * A * C;
      if (disc >= 0) {
        const t = (-B - Math.sqrt(disc)) / (2 * A);
        if (t > 0 && t < 1.2) {
          let x = b.x + b.vx * t;
          const lo = WALL_L + b.r, hi = WALL_R - b.r;
          if (x < lo) x = 2 * lo - x;
          if (x > hi) x = 2 * hi - x;
          return x;
        }
      }
    }
    // pas de tir en cours : se place entre l'axe et le côté de la bille
    return lerp(CX, b.x, this.T.track);
  }

  _keeperRange() {
    const hl = this.keeper.hl;
    return [POST_L + POST_RAD + KEEPER_R + 2 + hl, POST_R - POST_RAD - KEEPER_R - 2 - hl];
  }

  _updateKeeper(dt) {
    const K = this.keeper, b = this.ball;
    K.t += dt;
    K.flash = Math.max(0, K.flash - dt * 3);
    K.save = Math.max(0, K.save - dt * 2.5);
    if (K.hitCd > 0) K.hitCd -= dt;
    const [lo, hi] = this._keeperRange();
    let solid = true;
    if (K.stun > 0) {
      K.stun -= dt;
      solid = false;
      K.vx = approach(K.vx, 0, 1200 * dt);
      K.x = clamp(K.x + K.vx * dt + (CX - K.x) * Math.min(1, dt * 0.6), lo, hi);
      K.ko = Math.min(1, K.ko + dt * 4);
      if (K.stun <= 0) { K.reboot = 0.5; this.game.sfx('cbReboot'); }
    } else if (K.reboot > 0) {
      K.reboot -= dt;
      solid = false;
      K.ko = Math.max(0, K.ko - dt * 2.5);
    } else {
      K.ko = Math.max(0, K.ko - dt * 3);
      const late = this.perkT > 0;
      const react = this.react * (late ? 2 : 1);
      const vmax = this.kSpeed * (late ? 0.8 : 1);
      // mémoire courte : le gardien réagit à ce qu'il voyait il y a « react » secondes
      const pred = this.seq ? CX : this._predict(b);
      K.ht.push(this.time); K.hp.push(pred);
      while (K.ht.length > 2 && K.ht[1] <= this.time - react) { K.ht.shift(); K.hp.shift(); }
      const seen = K.hp[0];
      K.tgt = clamp(seen + (this.seq ? 0 : K.err), lo, hi);
      const want = clamp((K.tgt - K.x) * 9, -vmax, vmax);
      K.vx = approach(K.vx, want, this.T.kAccel * dt);
      K.x += K.vx * dt;
      if (K.x < lo) { K.x = lo; K.vx = 0; }
      if (K.x > hi) { K.x = hi; K.vx = 0; }
    }
    K.tilt += (clamp(K.vx / 600, -1, 1) * 0.12 - K.tilt) * Math.min(1, dt * 8);
    this.world.moveSeg(K.p, K.x - K.hl, KEEPER_Y, K.x + K.hl, KEEPER_Y);
    K.p.vx = solid ? K.vx : 0; K.p.vy = 0;
    // réactivation seulement si la bille n'est pas dans la silhouette
    if (solid && !K.p.enabled && b && b.state === 'free') {
      const dx = Math.max(0, Math.abs(b.x - K.x) - K.hl), dy = b.y - KEEPER_Y;
      if (dx * dx + dy * dy < (KEEPER_R + b.r + 3) ** 2) solid = false;
    }
    K.p.enabled = solid;
  }

  _keeperHit(b, imp, nx, ny) {
    const K = this.keeper;
    if (this.state !== 'play' || this.seq || K.hitCd > 0 || imp < 120) return;
    K.hitCd = 0.2;
    const g = this.game;
    if (imp >= this.T.stunImpact && ny > 0.2) { this._stunKeeper(b, imp); return; }
    this.saves++;
    K.flash = 1; K.save = 1;
    g.sfx('cbSave', (b.x - CX) / CX, Math.min(1, imp / this.T.stunImpact));
    g.fx.burst(b.x, b.y - 10, '#ffd0dc', 6, 200);
    if (ny > 0.3) {
      g.fx.text(K.x, KEEPER_Y + 46, 'ARRÊT !', '#ff9ab5', 0.95);
      g.addScore(1000, K.x, KEEPER_Y + 70);
      g.say('cbSave');
      this.hype = Math.max(this.hype, 0.55);
      if (imp > this.T.stunImpact * 0.75) this.jumbo = { kind: 'close', t: 0 };
      // tir arrêté de face : le gardien capte la bille, puis la relance vers un batteur
      if (b === this.ball && b.state === 'free' && !K.hold) {
        b.state = 'captured';
        K.hold = { t: 0, dx: clamp(b.x - K.x, -K.hl, K.hl) };
        b.vx = b.vy = 0;
      }
    }
  }

  // relance du gardien : la bille repart vers le batteur le plus éloigné du gardien
  _updateHold(dt) {
    const K = this.keeper, H = K.hold, b = this.ball;
    if (!b || b.state !== 'captured' || this.seq) { K.hold = null; return; }
    H.t += dt;
    H.dx *= Math.exp(-6 * dt);
    b.x = K.x + H.dx; b.y = KEEPER_Y + KEEPER_R + b.r + 1;
    b.px = b.x; b.py = b.y;
    if (H.t < 0.55) return;
    K.hold = null;
    const tx = K.x > CX ? 206 : 356;                  // milieu d'un batteur
    const T = Math.sqrt(2 * (930 - b.y) / this.world.gy);
    b.state = 'free';
    b.setPos(b.x, b.y + 3);
    b.vx = (tx - b.x) / T; b.vy = 60;
    K.flash = 1;
    this.game.sfx('cbThrow');
  }

  _stunKeeper(b, imp) {
    const K = this.keeper, g = this.game;
    K.stun = this.T.stunDur;
    K.flash = 1;
    K.p.enabled = false;
    this.stuns++;
    this.openFlash = 1;
    g.addScore(10000 * this.level, K.x, KEEPER_Y + 50, 'GARDIEN K.O.');
    g.sfx('cbStun');
    g.fx.burst(K.x, KEEPER_Y, '#ffffff', 16, 420);
    g.fx.burst(K.x, KEEPER_Y, RED, 18, 320);
    g.fx.ring(K.x, KEEPER_Y, '#ffffff', 90, 0.45);
    g.fx.arc(K.x - K.hl, KEEPER_Y, K.x + K.hl, KEEPER_Y - 6, '#ff9ab5', 0.3);
    g.fx.shake(6);
    g.slowT = Math.max(g.slowT, 0.25);
    g.say('cbStun');
    if (this.dmdCd <= 0) { g.dmd('banner', { title: 'GARDIEN K.O.', sub: 'But ouvert : frappez !', color: LIME }); this.dmdCd = 2; }
    this.callout = { text: 'K.O. !', sub: 'BUT OUVERT', color: LIME, t: 0, life: 1.2, y: 330 };
    this.jumbo = { kind: 'ko', t: 0 };
    this.hype = 1;
  }

  // ------------------------------------------------------------ défenseurs
  _updateDefenders(dt) {
    const b = this.ball;
    for (const d of this.defs) {
      d.flash = Math.max(0, d.flash - dt * 4);
      if (d.cd > 0) d.cd -= dt;
      const p = d.p;
      if (d.sleep) { p.enabled = false; p.x = d.x; p.y = d.y; p.vx = 0; continue; }
      if (d.wake < 1) d.wake = Math.min(1, d.wake + dt / 0.8);
      d.t += dt * this.defK;
      const nx = d.x0 + Math.sin(d.t * d.freq + d.phase) * d.amp;
      d.vx = (nx - d.x) / dt;
      d.x = nx;
      p.x = d.x; p.y = d.y; p.vx = d.vx; p.vy = 0;
      if (b) d.face += Math.atan2(Math.sin(Math.atan2(b.y - d.y, b.x - d.x) - d.face), Math.cos(Math.atan2(b.y - d.y, b.x - d.x) - d.face)) * Math.min(1, dt * 6);
      let solid = d.wake >= 0.6;
      if (solid && !p.enabled && b && b.state === 'free' && Math.hypot(b.x - d.x, b.y - d.y) < DEF_R + b.r + 2) solid = false;
      p.enabled = solid;
    }
  }

  _defHit(d, b, imp) {
    if (this.state !== 'play' || d.cd > 0 || imp < 80) return;
    d.cd = 0.15;
    d.flash = 1;
    this.defHits++;
    const g = this.game;
    g.sfx('cbTackle', (d.x - CX) / CX);
    g.fx.burst(b.x, b.y, '#ff9ab5', 5, 180);
    g.addScore(500, d.x, d.y - 32);
  }

  // ------------------------------------------------------------ corners
  _cornerTry(C, b) {
    if (!C.lit || this.state !== 'play' || this.seq || this.cross || b !== this.ball || b.state !== 'free' || b.vy > -250) return;
    C.lit = false;
    C.cd = this.T.cornerCd;
    C.flash = 1;
    this.crosses++;
    b.state = 'captured';
    // cible : vers le second poteau (le premier est masqué par l'aile), lucarne comprise
    const far = POST_R - POST_RAD - b.r - 3, near = CX - 29;
    const tx = rand(near, far);
    this.cross = { C, t: 0, x0: b.x, y0: b.y, tx: C.side < 0 ? tx : 2 * CX - tx, fired: false };
    const g = this.game;
    g.sfx('cbCorner', C.side);
    g.fx.ring(C.x, C.y, GOLD, 70, 0.4);
    g.fx.burst(b.x, b.y, GOLD, 10, 260);
    g.say('cbCorner');
    this.callout = { text: 'CORNER !', sub: 'CENTRE', color: GOLD, t: 0, life: 0.9, y: 470 };
    this.jumbo = { kind: 'corner', t: 0 };
    this.hype = Math.max(this.hype, 0.7);
  }

  _updateCross(dt) {
    const X = this.cross, b = this.ball, C = X.C;
    if (!b || b.state !== 'captured' || this.seq) { this.cross = null; return; }
    X.t += dt;
    const u = Math.min(1, X.t / 0.18);
    const e = u * u * (3 - 2 * u);
    b.x = lerp(X.x0, C.x, e); b.y = lerp(X.y0, C.y, e);
    b.px = b.x; b.py = b.y;
    C.charge = Math.min(1, X.t / 0.4);
    if (X.t < 0.4) return;
    // tir : passe tendue qui franchit la ligne en montant
    const T = 0.2, gy = this.world.gy;
    b.state = 'free';
    b.setPos(C.x, C.y);
    b.vx = (X.tx - C.x) / T;
    b.vy = (GOAL_Y - C.y) / T - 0.5 * gy * T;
    C.charge = 0; C.flash = 1;
    this.cross = null;
    this.lastVy = b.vy;
    this.game.sfx('cbKick', C.side);
    this.game.fx.burst(C.x, C.y, '#ffffff', 8, 300);
  }

  _updateCorners(dt) {
    for (const C of this.corners) {
      C.flash = Math.max(0, C.flash - dt * 2.5);
      if (!C.lit && !(this.cross && this.cross.C === C)) {
        C.cd -= dt;
        if (C.cd <= 0) { C.lit = true; C.flash = 1; this.game.sfx('cbCornerLit', C.side); }
      }
    }
  }

  // ------------------------------------------------------------ poteaux, ligne, but
  _postHit(P, b, imp) {
    if (this.state !== 'play' || this.seq || P.cd > 0 || imp < 160) return;
    P.cd = 0.4;
    P.flash = 1;
    this.postHits++;
    const g = this.game;
    g.sfx('cbPost', (P.x - CX) / CX, Math.min(1, imp / 2200));
    g.sfx('cbOoh');
    g.fx.burst(P.x, P.y, '#ffffff', 10, 360);
    g.fx.ring(P.x, P.y, GOLD, 50, 0.4);
    g.fx.text(P.x, P.y + 46, 'POTEAU !', GOLD, 1.1);
    g.fx.shake(3);
    g.addScore(2500 * this.level, P.x, P.y + 70);
    g.say('cbPost');
    if (this.dmdCd <= 0) { g.dmd('banner', { title: 'POTEAU !', sub: 'Si près du but…', color: GOLD }); this.dmdCd = 3; }
    this.jumbo = { kind: 'post', t: 0 };
    this.hype = Math.max(this.hype, 0.8);
  }

  // la barrière de protection repousse une bille qui allait tomber
  _lineClear(b, imp) {
    if (this.state !== 'play' || imp < 100 || this.clearCd > 0) return;
    this.clearCd = 2;
    this.clears++;
    const g = this.game;
    g.fx.text(b.x, 1000, 'SAUVÉ SUR LA LIGNE', CYAN, 0.9);
    g.say('cbClear');
  }

  _goal(b) {
    if (this.state !== 'play' || this.seq || b !== this.ball || b.state !== 'free') return;
    const g = this.game;
    const edge = Math.min(b.x - (POST_L + POST_RAD + b.r), (POST_R - POST_RAD - b.r) - b.x);
    const lucarne = edge < LUC;
    this.goals++;
    this.goalsNow++;
    if (lucarne) this.lucarnes++;
    const final = this.goals >= this.target;
    b.state = 'captured';
    this.seq = { t: 0, ball: b, vx: b.vx * 0.55, vy: Math.min(-260, b.vy * 0.55), final, lucarne, moved: false, done: false };
    this.net = { x: b.x, y: b.y, k: 1 };
    const color = lucarne ? GOLD : BLUE;
    const score = `LUMEN ${this.goals} – ${this.nullGoals} NULL`;
    g.addScore(25000 * this.level * (lucarne ? 2 : 1), b.x, GOAL_Y + 50, lucarne ? 'LUCARNE' : 'BUT');
    g.slowT = Math.max(g.slowT, final ? 1.3 : 0.8);
    g.sfx('cbGoal', lucarne ? 1 : 0);
    g.sfx('cbCrowd', final ? 1.4 : 1);
    if (lucarne) g.sfx('cbLucarne');
    g.fx.flash(color, 0.32);
    g.fx.shake(final ? 12 : 8);
    g.fx.burst(b.x, b.y, '#ffffff', 22, 380);
    g.fx.burst(b.x, b.y, color, 26, 320);
    g.fx.ring(b.x, b.y, color, 110, 0.6);
    g.fx.ring(b.x, b.y, '#ffffff', 60, 0.4);
    if (g.renderer && g.renderer.pulse) g.renderer.pulse(color, final ? 1.4 : 1);
    this._fireworks(final ? 10 : lucarne ? 6 : 4);
    this._confetti(final ? 110 : 55);
    this.hype = 1;
    this.callout = { text: final ? 'VICTOIRE !' : lucarne ? 'LUCARNE !' : 'BUT !', sub: lucarne ? 'POINTS ×2' : `${this.goals} – ${this.nullGoals}`, color, t: 0, life: final ? 2.2 : 1.5, y: 360 };
    this.jumbo = { kind: 'goal', t: 0 };
    g.banner(final ? 'VICTOIRE !' : lucarne ? 'LUCARNE !' : 'BUT !', lucarne ? `Points ×2 · ${score}` : score, color, 1.6);
    if (final) g.say('cbWin');
    else if (lucarne) g.say('cbLucarne');
    else if (this.goals === 3) g.say('cbHatTrick');
    else if (this.goals === this.target - 1) g.say('cbLast');
    else g.say('cbGoal', { score });
  }

  // bille dans le filet → aspirée → rematérialisée au rond central → engagement
  _updateSeq(dt) {
    const S = this.seq, b = S.ball;
    S.t += dt;
    if (S.t < 0.5) {
      const k = Math.exp(-6 * dt);
      S.vx *= k; S.vy *= k;
      b.x += S.vx * dt; b.y += S.vy * dt;
      const x0 = POST_L + 16, x1 = POST_R - 16, y0 = CEIL_Y + 18;
      if (b.x < x0) { b.x = x0; S.vx = Math.abs(S.vx) * 0.3; }
      if (b.x > x1) { b.x = x1; S.vx = -Math.abs(S.vx) * 0.3; }
      if (b.y < y0) { b.y = y0; S.vy = Math.abs(S.vy) * 0.15; }
      b.px = b.x; b.py = b.y;
      this.net.x = b.x; this.net.y = b.y;
      return;
    }
    if (S.final) {
      if (S.t >= 1.7 && !S.done) { S.done = true; this.finish(true, 'goals'); }
      return;
    }
    if (S.t < 0.85) { b.scale = Math.max(0, 1 - (S.t - 0.5) / 0.35); return; }
    if (S.t < 1.35) {
      if (!S.moved) {
        S.moved = true;
        b.setPos(KICK.x, KICK.y);
        b.vx = b.vy = 0;
        this.kickBeam = 1;
        this.game.sfx('cbBeam');
      }
      b.scale = Math.min(1, (S.t - 0.85) / 0.5);
      return;
    }
    // engagement : la bille part vers un batteur, barrière armée
    b.scale = 1;
    b.state = 'free';
    b.setPos(KICK.x, KICK.y);
    b.vx = this.kickSide * 115; b.vy = 40;
    this.kickSide *= -1;
    this.seq = null;
    this.setBarrier(4);
    this.game.sfx('cbWhistle', 1);
    this._escalate(this.goals, false);
  }

  _escalate(n, silent) {
    const E = ESCALATE[n];
    if (!E) return;
    const K = this.keeper;
    if (n === 1) this.kSpeed *= 1.12;
    else if (n === 2) { const d = this.defs.find(o => o.sleeper); if (d) { d.sleep = false; d.wake = silent ? 1 : 0; } }
    else if (n === 3) { this.react *= 0.8; this.kSpeed *= 1.06; }
    else if (n === 4) this.defK *= 1.25;
    else if (n === 5) K.hl += 3;
    if (silent) return;
    const g = this.game;
    g.dmd('banner', { title: E.title, sub: E.sub, color: RED });
    g.sfx('cbAlert');
    g.later(0.9, () => { if (this.state === 'play') g.say(E.say); });
    if (n === 2) g.sfx('cbDefWake');
  }

  // ------------------------------------------------------------ fête
  _fireworks(n) {
    for (let i = 0; i < n; i++) {
      if (this.rockets.length >= 16) this.rockets.shift();
      const side = i % 2 ? 1 : -1;
      const x = side < 0 ? rand(60, 150) : rand(412, 500);
      this.rockets.push({ x, y: 700, vx: -side * rand(40, 140), vy: rand(-1050, -820), t: -i * 0.12, fuse: rand(0.55, 0.8), color: [BLUE, CYAN, GOLD, '#ff3df2', LIME][(i + this.goals) % 5] });
    }
  }

  _confetti(n) {
    const cols = [BLUE, CYAN, GOLD, '#ff3df2', '#ffffff'];
    for (let i = 0; i < n; i++) {
      if (this.confetti.length >= 140) this.confetti.shift();
      this.confetti.push({ x: rand(30, 530), y: rand(CEIL_Y - 30, CEIL_Y + 10), vx: rand(-60, 60), vy: rand(20, 160), a: rand(0, 6.28), va: rand(-9, 9), t: 0, life: rand(1.6, 2.8), c: cols[i % cols.length], w: rand(3, 6) });
    }
  }

  _updateFx(dt) {
    const g = this.game;
    this.hype = Math.max(0.25, this.hype - dt * 0.35);
    this.kickBeam = Math.max(0, this.kickBeam - dt * 1.6);
    this.openFlash = Math.max(0, this.openFlash - dt * 2);
    this.net.k = Math.max(0, this.net.k - dt * 1.4);
    this.jumbo.t += dt;
    for (const P of this.posts) { P.flash = Math.max(0, P.flash - dt * 2.5); if (P.cd > 0) P.cd -= dt; }
    if (this.callout) { this.callout.t += dt; if (this.callout.t >= this.callout.life) this.callout = null; }
    for (let i = this.rockets.length - 1; i >= 0; i--) {
      const R = this.rockets[i];
      R.t += dt;
      if (R.t < 0) continue;
      R.x += R.vx * dt; R.y += R.vy * dt; R.vy += 700 * dt;
      if (R.t >= R.fuse) {
        this.rockets.splice(i, 1);
        g.fx.burst(R.x, R.y, R.color, 26, 330);
        g.fx.burst(R.x, R.y, '#ffffff', 8, 200);
        g.fx.ring(R.x, R.y, R.color, 70, 0.5);
        g.sfx('cbFirework', (R.x - CX) / CX);
      }
    }
    for (let i = this.confetti.length - 1; i >= 0; i--) {
      const c = this.confetti[i];
      c.t += dt;
      if (c.t >= c.life) { this.confetti.splice(i, 1); continue; }
      c.vy = Math.min(c.vy + 160 * dt, 170);
      c.x += (c.vx + Math.sin(c.t * 5 + c.a) * 40) * dt; c.y += c.vy * dt; c.a += c.va * dt;
    }
  }

  // ------------------------------------------------------------ fin, chute, progression
  // Chute avec bouclier : NULL « marque » (la bille est relancée). Sans bouclier : fin du match.
  onBallLost(ball) {
    if (this.state !== 'play') return;
    if (this.game.bonus.shield > 0) {
      this.nullGoals++;
      this.jumbo = { kind: 'null', t: 0 };
      this.game.say('cbNullGoal');
    }
    super.onBallLost(ball);
  }

  onTimeout() {
    if (this.seq) { this.timeLeft = 0.02; return; }     // jamais pendant une célébration
    super.onTimeout();
  }

  keepProgress() { return { goals: Math.min(3, this.goals) }; }

  results(success) {
    return {
      rewards: success ? [{ type: 'mult' }, { type: 'magnet' }] : [],
      // échec honorable (3 buts au tableau, dont au moins un marqué cette fois) : aimant court
      partialRewards: !success && this.goals >= 3 && this.goalsNow > 0 ? [{ type: 'magnet', duration: 15 }] : [],
      points: success ? (40000 + Math.round(this.timeLeft) * 1500) * this.level : 0,
    };
  }

  progressText() {
    const open = this.keeper.stun > 0 ? ' · BUT OUVERT !' : '';
    return `Buts ${this.goals}/${this.target} · LUMEN ${this.goals} – ${this.nullGoals} NULL${open}`;
  }

  debugWin() { this.goals = this.target - 1; this.finish(true, 'debug'); }

  // ------------------------------------------------------------ rendu
  drawStatic(g, r) { drawCyberballStatic(g, r, this); }
  renderArena(ctx, r) { renderCyberball(ctx, r, this); }
  renderTop(ctx, r) { renderCyberballTop(ctx, r, this); }
}
