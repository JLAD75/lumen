import { Minigame, Paddle, zeroGHook } from './base.js';
import { Ball } from '../physics/ball.js';
import { rand, clamp, lerp, sign, easeOutCubic, easeOutBack } from '../util/math.js';
import { BK, ROW_COLORS, CAPS, drawFloor, drawFloorFx, drawBricks, drawCapsules, drawPaddle, drawBolts, drawShards, drawFlashes, drawEchoFx } from './breakoutArt.js';

// CASSE-BRIQUES ORBITAL — secteur HANGAR.
// Deux murs de briques néon, chacun tenu par 3 VERROUS dorés : briser les 3 verrous
// effondre le mur ; le second mur arrive ensuite et descend lentement vers la plateforme.
// Gravité coupée : la bille garde une vitesse constante (zeroGHook), plafond plat.
const { BW, BH, GX, GY, X0, PY, L: WL, R: WR, CEIL, CH } = BK;

// n normale · a blindée · x explosive · c chrome indestructible · p capsule · L verrou · . vide
export const STAGES = [
  {
    // veines d'explosifs : chaque verrou latéral est relié au bas du mur par 3 explosives
    name: 'RIDEAU NÉON', y0: 180, speed: 0, maxDrop: 0,
    rows: [
      'nnnnnnnnnnn',
      'npnnnannnpn',
      'nanannnanan',
      'nnLnnannLnn',
      'nnxncLcnxnn',
      'nxnnnxnnnxn',
      'nnxnnnnnxnn',
      '.nnpnnnpnn.',
    ],
  },
  {
    // toit blindé, verrou central dans un berceau de chrome au bout d'une veine verticale
    name: 'HERSE DESCENDANTE', y0: 140, speed: 2.6, maxDrop: 150,
    rows: [
      'aaaaaaaaaaa',
      'nnnncLcnnnn',
      'npnnnxnnnpn',
      'nncnnxnncnn',
      'nnLnnxnnLnn',
      'nxnnaxannxn',
      'nnxnnnnnxnn',
      'nnnnnnnnnnn',
      '..npnnnpn..',
    ],
  },
];

const PTS = { n: 300, p: 600, x: 500, a: 800, L: 5000 };
const CAP_POOL = [['large', 14], ['laser', 14], ['aimant', 10], ['ralenti', 8], ['perfo', 10], ['time', 12], ['mult', 7], ['jack', 8], ['echo', 11]];
const SHARD_MAX = 180;

export class BreakoutGame extends Minigame {
  constructor(game, opts) {
    const lvl = opts.level || 1;
    super(game, opts, {
      gravity: 0, damping: 0,
      time: lvl === 1 ? 90 : lvl === 2 ? 85 : 80,
      title: 'CASSE-BRIQUES ORBITAL',
      objective: 'Verrous dorés · ← → plateforme · LANCER : laser',
      music: 'brick',
      perk: { name: 'Plateforme élargie', desc: 'Plateforme élargie pendant 12 s' },
    });
    this.baseSpeed = 760 + (Math.min(lvl, 4) - 1) * 80;
    this.paddle = new Paddle(300, PY, lvl === 1 ? 120 : 104);
    this.paddle.minX = WL + 3; this.paddle.maxX = WR - 3;
    this.bricks = [];
    this.capsules = [];
    this.bolts = [];
    this.echoes = [];
    this.queue = [];            // dégâts différés (explosions en chaîne)
    this.collapsing = [];       // effondrement en cascade d'un mur terminé
    this.shards = []; this.flashes = []; this.blasts = [];
    this.chain = 0; this.chainMult = 1; this.chainPop = 0;
    this.pierceT = 0; this.laserT = 0; this.laserCd = 0; this.laserKick = 0;
    this.magnetT = 0; this.ralentiT = 0;
    this.hold = null;           // bille tenue sur la plateforme (aimant, relance, nouveau mur)
    this.trans = null;          // changement de mur en cours (chrono gelé)
    this.stageDone = null;
    this.idleT = 0;
    this.stepSfxT = 0;
    this.collected = { mult: false, jack: 0, caps: 0 };
    this.destroyed = 0;
    this.lastCap = null;
    this.wall = null;
    this._buildArena();
    // progression d'une tentative précédente : mur atteint et briques déjà détruites
    const k = this.kept;
    const st = k && Number.isInteger(k.stage) ? clamp(k.stage, 0, STAGES.length - 1) : 0;
    this.buildStage(st, false);
    if (k && Array.isArray(k.gone)) {
      for (const i of k.gone) { const br = this.bricks[i]; if (br && br.alive && br.kind !== 'c') this.kill(br); }
      if (this.locksLeft <= 0) this.buildStage(st, false);
    }
    this.resumed = !!(k && (st > 0 || (k.gone && k.gone.length)));
    const zg = zeroGHook(() => this.currentSpeed());
    this.world.ballHook = (b, h) => {
      zg(b, h);
      // après un choc entre billes (échos) : jamais de bille quasi arrêtée ni catapultée
      const t = this.currentSpeed(), s = Math.hypot(b.vx, b.vy);
      if (s < t * 0.75 || s > t * 1.4) { const f = clamp(s, t * 0.75, t * 1.4) / (s || 1); b.vx *= f; b.vy *= f; }
    };
  }

  currentSpeed() {
    const s = this.baseSpeed + Math.min(this.time * 2.2, 150);
    return this.ralentiT > 0 ? s * 0.68 : s;
  }

  _buildArena() {
    const w = this.world;
    // murs élastiques (e = 1) : aucune perte d'énergie qui aplatirait la trajectoire
    const wall = { mat: 'metal', e: 1, mu: 0, eFall: 0, r: 3, style: 'rail' };
    const segs = w.poly([[WL, 1110], [WL, CEIL + CH], [WL + CH, CEIL], [WR - CH, CEIL], [WR, CEIL + CH], [WR, 1110]], wall);
    segs[0].onHit = segs[4].onHit = (b) => this.onSideWall(b);
    segs[2].onHit = (b) => this.onCeiling(b);
    this.addBarrier(WL, WR, 1040);
    w.build();
  }

  // ------------------------------------------------------------ murs de briques
  buildStage(idx, animated) {
    for (const br of this.bricks) this.world.remove(br.p);
    this.bricks = [];
    this.stageIdx = idx;
    const S = STAGES[idx], lvl = this.level;
    this.wall = { y0: S.y0, drop: 0, speed: S.speed * (1 + 0.3 * (Math.min(lvl, 3) - 1)), maxDrop: S.maxDrop, rows: S.rows.length, enterT: 0, entering: animated };
    this.locksTotal = 0;
    S.rows.forEach((row, r) => {
      [...row].forEach((ch, c) => {
        if (ch === '.') return;
        let kind = ch;
        if (lvl >= 2 && kind === 'n' && (r + 2 * c) % 5 === 0) kind = 'a';
        const hp = { n: 1, p: 1, x: 1, a: lvl === 1 ? 2 : 3, L: lvl <= 2 ? 2 : 3, c: 1e9 }[kind];
        const x = X0 + c * (BW + GX), by = r * (BH + GY), y = S.y0 + by;
        const p = this.world.rect(x, y, BW, BH, { mat: 'brick', style: 'brick', enabled: !animated });
        p.pierceable = kind !== 'c';
        const br = {
          i: this.bricks.length, kind, hp, maxHp: hp, row: r, col: c, x, y, by, alive: true, p,
          color: ROW_COLORS[r % ROW_COLORS.length], flash: 0, shake: 0, doomed: false,
          dy: animated ? -(560 + (S.rows.length - r) * 26) : 0, dy0: 0, delay: animated ? (S.rows.length - 1 - r) * 0.05 + Math.abs(c - 5) * 0.022 : 0,
        };
        br.dy0 = br.dy;
        p.onHit = (b, imp, nx, ny, prim, pierced) => this.onBrickHit(br, b, pierced);
        if (kind === 'L') this.locksTotal++;
        this.bricks.push(br);
      });
    });
    this.locksLeft = this.locksTotal;
  }

  // brique retirée sans effet (progression conservée)
  kill(br) {
    br.alive = false; br.p.enabled = false;
    if (br.kind === 'L') this.locksLeft--;
  }

  limitY() {
    const W = this.wall;
    return W && W.maxDrop > 0 ? W.y0 + W.rows * (BH + GY) + W.maxDrop : 0;
  }

  updateWall(dt) {
    const W = this.wall;
    if (W.entering) {
      W.enterT += dt;
      let done = true;
      for (const br of this.bricks) {
        const u = clamp((W.enterT - br.delay) / 0.5, 0, 1);
        br.dy = br.dy0 * (1 - easeOutBack(u));
        if (u < 1) done = false;
      }
      if (done) this.wallLanded();
      return;
    }
    const moving = W.speed > 0 && !this.trans && this.state === 'play' && W.drop < W.maxDrop;
    if (moving) {
      W.drop = Math.min(W.maxDrop, W.drop + W.speed * dt);
      this.stepSfxT -= dt;
      if (this.stepSfxT <= 0) { this.stepSfxT = 4; this.game.sfx('bkWallStep'); }
    }
    for (const br of this.bricks) {
      const y = W.y0 + br.by + W.drop;
      if (y !== br.y) { br.y = y; br.p.y0 = y; br.p.y1 = y + BH; }
      br.p.vy = moving ? W.speed : 0;
    }
  }

  // le nouveau mur se verrouille en place : collisions actives
  wallLanded() {
    const W = this.wall, g = this.game;
    W.entering = false;
    for (const br of this.bricks) {
      br.dy = 0;
      if (!br.alive) continue;
      br.p.enabled = true;
      // une bille déjà là (cas rare) pulvérise la brique
      for (const b of this.world.balls) {
        if (b.state === 'free' && b.x > br.x - b.r && b.x < br.x + BW + b.r && b.y > br.y - b.r && b.y < br.y + BH + b.r && br.kind !== 'L' && br.kind !== 'c') this.destroy(br);
      }
    }
    g.fx.shake(6);
    g.sfx('bkWallDrop');
    for (let c = 0; c < 6; c++) this.addFlash(X0 + c * 100, W.y0 + W.rows * (BH + GY), 140, '#29d9ff', 0.4, 0.5);
    if (this.trans) {
      this.trans.landed = true;
      if (this.hold && this.hold.kind === 'stage') { this.hold.ready = true; this.hold.auto = this.hold.t + 1.5; }
      else this.trans = null;
    }
  }

  // ------------------------------------------------------------ entrée, relance
  entryPoint() { return { x: 300, y: 600 }; }

  placeEntry(ball) {
    ball.setPos(300, 600);
    ball.vx = rand(-70, 70); ball.vy = 430;
    // effet compatible : le noyau phasique perfore les briques quelques secondes
    if (this.game.bonus.phaseT > 0) this.pierceT = Math.min(6, this.game.bonus.phaseT);
  }

  begin(ball) {
    super.begin(ball);
    if (this.resumed) this.game.fx.text(300, 560, `REPRISE · MUR ${this.stageIdx + 1}/${STAGES.length}`, '#29d9ff', 1.3);
  }

  applyPerk() { this.paddle.wideT = 12; this.perkT = 12; }

  prepareRelaunch(ball) {
    ball.state = 'held';
    ball.vx = ball.vy = 0;
    if (!this.world.balls.includes(ball)) this.world.addBall(ball);
    this.ball = ball;
    this.hold = { kind: 'relaunch', ball, off: 0, t: 0, auto: Infinity, ready: false, recall: 1 };
    this.placeHeld();
  }

  doRelaunch(b) {
    if (this.hold && this.hold.ball === b) this.hold = null;
    this.launchFrom(b, rand(-0.2, 0.2));
  }

  launchFrom(b, u) {
    const P = this.paddle;
    b.state = 'free';
    b.setPos(clamp(b.x, WL + 16, WR - 16), P.y - P.h / 2 - b.r - 2);
    const ang = clamp(u, -1, 1) * 0.85 + clamp(P.vx / P.maxV, -1, 1) * 0.18;
    const s = this.currentSpeed();
    b.vx = Math.sin(ang) * s; b.vy = -Math.cos(ang) * s;
    this.idleT = 0;
  }

  launchReady() { return this.state === 'relaunch' || !!(this.hold && this.hold.ready) || this.laserT > 0; }
  launchCharge() { return this.hold && this.hold.ready && this.hold.auto < Infinity ? clamp(this.hold.t / this.hold.auto, 0, 1) : 0; }

  // ------------------------------------------------------------ boucle
  update(dt, inp) {
    // après la fin : les éclats et l'effondrement continuent pendant le délai de sortie
    if (this.state === 'ended') { this.updateCollapse(dt); this.updateVfx(dt); return; }
    super.update(dt, inp);
  }

  step(dt, inp) {
    const P = this.paddle;
    P.update(dt, inp);
    if (this.trans && this.state === 'play') this.timeLeft += dt;   // chrono gelé pendant le changement de mur
    this.tickTimers(dt);
    // commande de lancement : relance > libération de la bille tenue > laser
    let used = false;
    if (inp.launchPressed && this.state === 'relaunch') { this.relaunch(); used = true; }
    if (!used && inp.launchPressed && this.hold && this.hold.ready && this.hold.kind !== 'relaunch') { this.releaseHold(); used = true; }
    if (this.laserCd > 0) this.laserCd -= dt;
    if (!used && this.laserT > 0 && !this.hold && !this.trans && this.state === 'play' && inp.launch && (inp.launchPressed || this.laserCd <= 0)) this.fireLaser();
    this.updateHold(dt);
    this.updateWall(dt);
    const pierce = this.pierceT > 0;
    for (const b of this.world.balls) b.pierce = pierce;
    this.world.step(dt);
    // plateforme
    for (const b of this.world.balls) {
      if (b.state !== 'free') continue;
      if (P.collide(b, this.currentSpeed())) {
        this.game.sfx('paddle', (b.x - P.x) / (P.w / 2));
        if (!b.echo) {
          this.chain = 0; this.chainMult = 1; this.idleT = 0;
          if (this.magnetT > 0 && !this.hold && !this.trans && this.state === 'play') this.catchBall(b);
        }
      }
    }
    this.updateQueue(dt);
    this.updateBolts(dt);
    this.updateCapsules(dt);
    this.updateEchoes(dt);
    this.updateCollapse(dt);
    if (this.stageDone && this.state !== 'ended') { const br = this.stageDone; this.stageDone = null; this.clearStage(br); }
    this.updateTrans(dt);
    this.updateVfx(dt);
    this.checkIdle(dt);
  }

  tickTimers(dt) {
    if (this.pierceT > 0) this.pierceT -= dt;
    if (this.laserT > 0) this.laserT -= dt;
    if (this.magnetT > 0) this.magnetT -= dt;
    if (this.ralentiT > 0) this.ralentiT -= dt;
    if (this.laserKick > 0) this.laserKick = Math.max(0, this.laserKick - dt * 8);
    if (this.chainPop > 0) this.chainPop = Math.max(0, this.chainPop - dt * 3);
  }

  // ------------------------------------------------------------ rebonds de l'arène
  // Mur latéral : légère verticalisation déterministe (évite les longs zigzags horizontaux).
  onSideWall(b) {
    const s = Math.hypot(b.vx, b.vy) || 1;
    if (Math.abs(b.vy) < 0.42 * s) { b.vy += sign(b.vy) * 0.07 * s; this.renorm(b, s); }
  }

  // Plafond : léger recentrage, et jamais de boucle parfaitement verticale.
  onCeiling(b) {
    const s = Math.hypot(b.vx, b.vy) || 1;
    b.vx += (300 - b.x) * 0.25;
    if (Math.abs(b.vx) < 0.12 * s) b.vx = sign(300 - b.x) * 0.12 * s;
    this.renorm(b, s);
  }

  renorm(b, s) {
    const k = s / (Math.hypot(b.vx, b.vy) || 1);
    b.vx *= k; b.vy *= k;
  }

  // ------------------------------------------------------------ briques
  onBrickHit(br, b, pierced) {
    if (!br.alive || br.doomed || this.state === 'ended') return;
    if (br.kind === 'c') { this.hitChrome(br, b); return; }
    this.damage(br, pierced ? 3 : 1);
  }

  hitChrome(br, b) {
    br.flash = 0.7; br.shake = 0.5;
    this.game.sfx('bkChrome', b.x);
    // casse les allers-retours verticaux entre chrome et plafond
    const s = Math.hypot(b.vx, b.vy) || 1;
    if (Math.abs(b.vx) < 0.15 * s) { b.vx = (b.x < br.x + BW / 2 ? -1 : 1) * 0.15 * s; this.renorm(b, s); }
    this.spawnShards(b.x, b.y - sign(b.vy) * 6, '#dfe8ff', 3, 0.6);
  }

  // blast = dégâts d'explosion (score sans texte flottant, pour ne pas saturer l'écran)
  damage(br, n, blast = false) {
    if (!br.alive || br.doomed || br.kind === 'c') return;
    br.hp -= n;
    br.flash = 1; br.shake = 1;
    this.idleT = 0;
    const g = this.game, cx = br.x + BW / 2, cy = br.y + BH / 2;
    if (br.hp > 0) {
      if (br.kind === 'L') {
        g.sfx('bkLockHit', cx);
        g.addScore(500, cx, cy - 12);
        g.fx.burst(cx, cy, '#ffd84a', 8, 260);
        this.addFlash(cx, cy, 110, '#ffd84a', 0.25, 0.8);
      } else {
        g.sfx('brickArmor', br.hp);
        g.addScore(150);
        this.spawnShards(cx, cy, '#c8d6f0', 4, 0.7);
      }
      return;
    }
    this.destroy(br, blast ? 'blast' : '');
  }

  // mode : '' (impact direct), 'blast' (explosion) ou 'collapse' (effondrement du mur)
  destroy(br, mode = '') {
    if (!br.alive) return;
    const collapse = mode === 'collapse';
    br.alive = false; br.p.enabled = false;
    const g = this.game, cx = br.x + BW / 2, cy = br.y + BH / 2;
    const col = br.kind === 'L' ? '#ffd84a' : br.kind === 'x' ? '#ff6a2b' : br.kind === 'a' ? '#c8d6f0' : br.kind === 'c' ? '#e8f0ff' : br.kind === 'p' ? '#ffffff' : br.color;
    this.spawnShards(cx, cy, col, collapse ? 5 : br.kind === 'L' ? 16 : 9, collapse ? 0.8 : 1);
    if (br.kind === 'p') this.spawnShards(cx, cy, '#ff5fe8', 4, 1);
    this.addFlash(cx, cy, collapse ? 70 : 96, col, 0.15, 0.55);
    if (collapse) { g.addScore(100 * this.level); return; }
    this.destroyed++;
    this.idleT = 0;
    this.chain++;
    const m = Math.min(5, 1 + Math.floor(this.chain / 4));
    if (m > this.chainMult) {
      this.chainMult = m; this.chainPop = 1;
      g.fx.text(cx, cy - 28, `CHAÎNE ×${m}`, '#ff3df2', 1.35);
      g.sfx('bkCombo', m);
    }
    const quiet = mode === 'blast' && br.kind !== 'L' && br.kind !== 'x';
    if (quiet) g.addScore(PTS[br.kind] * m);
    else g.addScore(PTS[br.kind] * m, cx, cy - 8, br.kind === 'L' ? 'VERROU' : undefined);
    g.fx.burst(cx, cy, col, br.kind === 'L' ? 4 : 3, 200);
    g.sfx('brickBreak', this.chain);
    g.sfx('bkShard', this.chain, cx);
    if (br.kind === 'x') this.explode(br);
    if (br.kind === 'p') this.spawnCapsule(cx, cy);
    else if (br.kind === 'n' && this.capsules.length < 3 && Math.random() < 0.05) this.spawnCapsule(cx, cy);
    if (br.kind === 'L') {
      this.locksLeft--;
      g.sfx('lockBreak');
      g.fx.flash('#ffd84a', 0.22);
      g.fx.ring(cx, cy, '#ffd84a', 80);
      g.fx.burst(cx, cy, '#ffd84a', 22, 440);
      g.fx.shake(4);
      this.addFlash(cx, cy, 240, '#ffd84a', 0.4, 0.7);
      if (this.locksLeft > 0) g.say('brickLock', { n: this.locksLeft });
      else this.stageDone = br;
    }
  }

  explode(br) {
    const g = this.game, cx = br.x + BW / 2, cy = br.y + BH / 2;
    g.sfx('explosion');
    g.fx.ring(cx, cy, '#ff6a2b', 90);
    g.fx.flash('#ff5a2b', 0.12);
    g.fx.shake(6);
    g.fx.burst(cx, cy, '#ffb21f', 12, 420);
    this.blasts.push({ x: cx, y: cy, t: 0 });
    this.spawnShards(cx, cy, '#ffb21f', 8, 1.5);
    for (const o of this.bricks) {
      if (!o.alive || o === br || o.kind === 'c' || o.doomed) continue;
      if (Math.abs(o.x - br.x) <= (BW + GX) * 1.05 && Math.abs(o.y - br.y) <= (BH + GY) * 1.05) {
        this.queue.push({ br: o, t: 0.08, n: 2 });
      }
    }
  }

  updateQueue(dt) {
    for (let i = this.queue.length - 1; i >= 0; i--) {
      const q = this.queue[i];
      q.t -= dt;
      if (q.t <= 0) { this.queue.splice(i, 1); this.damage(q.br, q.n, true); }
    }
  }

  // ------------------------------------------------------------ changement de mur
  clearStage(last) {
    const g = this.game;
    const final = this.stageIdx >= STAGES.length - 1;
    g.slowT = Math.max(g.slowT || 0, final ? 0.7 : 0.5);
    g.fx.flash('#ffd84a', 0.3);
    g.fx.shake(8);
    this.queue.length = 0;
    this.collapse(last);
    g.sfx('bkCollapse');
    if (final) { this.finish(true, 'locks'); return; }
    g.addScore(15000 * this.level, 300, 470, `MUR ${this.stageIdx + 1} EFFONDRÉ`);
    g.sfx('bkStageClear');
    const next = STAGES[this.stageIdx + 1];
    g.banner(`MUR ${this.stageIdx + 1} EFFONDRÉ`, `Mur ${this.stageIdx + 2} : ${next.name.toLowerCase()} · 3 verrous`, this.color, 2);
    g.say('brickWall', { n: this.stageIdx + 2 });
    this.dissolveEchoes();
    this.bolts.length = 0;
    this.trans = { t: 0, built: false, landed: false };
    // la bille est rappelée sur la plateforme le temps que le mur suivant arrive
    const b = this.ball;
    if (this.hold && this.hold.kind !== 'relaunch') { this.hold.kind = 'stage'; this.hold.ready = false; this.hold.auto = Infinity; }
    else if (this.state === 'play' && b && b.state === 'free') {
      b.state = 'held';
      this.hold = { kind: 'stage', ball: b, off: 0, t: 0, auto: Infinity, ready: false, recall: 0, fx: b.x, fy: b.y };
    }
  }

  // les briques restantes se désagrègent en vague depuis le dernier verrou
  collapse(origin) {
    const ox = origin.x, oy = origin.y;
    for (const br of this.bricks) {
      if (!br.alive || br.doomed) continue;
      br.doomed = true; br.p.enabled = false;
      this.collapsing.push({ br, t: 0.06 + Math.hypot(br.x - ox, (br.y - oy) * 1.6) / 1100 });
    }
  }

  updateCollapse(dt) {
    for (let i = this.collapsing.length - 1; i >= 0; i--) {
      const c = this.collapsing[i];
      c.t -= dt;
      if (c.t > 0) continue;
      this.collapsing.splice(i, 1);
      if (c.br.alive) this.destroy(c.br, 'collapse');
      if (i % 4 === 0) this.game.sfx('bkShard', 3 + (i % 7), c.br.x);
    }
  }

  updateTrans(dt) {
    const T = this.trans;
    if (!T) return;
    T.t += dt;
    if (!T.built && T.t >= 1.0 && !this.collapsing.length) {
      T.built = true;
      this.capsules.length = 0;
      this.buildStage(this.stageIdx + 1, true);
      this.game.fx.text(300, 520, `MUR ${this.stageIdx + 1}/${STAGES.length}`, '#29d9ff', 1.6);
    }
  }

  // ------------------------------------------------------------ bille tenue
  catchBall(b) {
    const P = this.paddle;
    b.state = 'held';
    b.vx = b.vy = 0;
    this.hold = { kind: 'magnet', ball: b, off: clamp(b.x - P.x, -P.w / 2 + 8, P.w / 2 - 8), t: 0, auto: 2, ready: true, recall: 1 };
    this.placeHeld();
    this.game.sfx('bkCatch', b.x);
    this.addFlash(b.x, b.y, 90, '#b26bff', 0.25, 0.8);
  }

  placeHeld() {
    const h = this.hold, P = this.paddle, b = h.ball;
    const tx = clamp(P.x + h.off, WL + 16, WR - 16), ty = P.y - P.h / 2 - b.r - 1;
    if (h.recall < 1) {
      const e = easeOutCubic(h.recall);
      b.x = b.px = lerp(h.fx, tx, e); b.y = b.py = lerp(h.fy, ty, e);
    } else b.setPos(tx, ty);
  }

  updateHold(dt) {
    const h = this.hold;
    if (!h) return;
    const b = h.ball;
    if (b.state !== 'held' || !this.world.balls.includes(b)) { this.hold = null; return; }
    h.t += dt;
    if (h.recall < 1) h.recall = Math.min(1, h.recall + dt / 0.5);
    this.placeHeld();
    b.vx = b.vy = 0;
    if (h.kind !== 'relaunch' && h.ready && h.t >= h.auto) this.releaseHold();
  }

  releaseHold() {
    const h = this.hold;
    if (!h) return;
    this.hold = null;
    const P = this.paddle, b = h.ball;
    const u = h.kind === 'stage' ? rand(-0.25, 0.25) : h.off / (P.w / 2);
    this.launchFrom(b, u);
    this.game.sfx('bkRelease', b.x);
    this.game.fx.ring(b.x, b.y, h.kind === 'magnet' ? '#b26bff' : this.color, 40);
    // nouveau mur : le chrono repart, avec une courte barrière de protection
    if (h.kind === 'stage') { this.trans = null; this.setBarrier(3); }
  }

  // ------------------------------------------------------------ laser
  fireLaser() {
    const P = this.paddle, off = P.w / 2 - 9;
    for (const sx of [-1, 1]) this.bolts.push({ x: P.x + sx * off, y: P.y - 22, py: P.y - 22 });
    this.laserCd = 0.26;
    this.laserKick = 1;
    this.game.sfx('bkLaser', P.x);
  }

  updateBolts(dt) {
    for (let i = this.bolts.length - 1; i >= 0; i--) {
      const bo = this.bolts[i];
      bo.py = bo.y; bo.y -= 1500 * dt;
      let hit = null;
      for (const br of this.bricks) {
        if (!br.alive || br.doomed || !br.p.enabled) continue;
        if (bo.x < br.x - 1.5 || bo.x > br.x + BW + 1.5) continue;
        if (bo.y <= br.y + BH && bo.py >= br.y && (!hit || br.y > hit.y)) hit = br;
      }
      if (hit) {
        this.bolts.splice(i, 1);
        this.game.fx.spark(bo.x, hit.y + BH, 700);
        this.game.sfx('bkBoltHit', bo.x, hit.kind === 'c');
        if (hit.kind === 'c') { hit.flash = 0.6; hit.shake = 0.4; } else this.damage(hit, 1);
      } else if (bo.y < CEIL + 6) {
        this.bolts.splice(i, 1);
        this.game.fx.spark(bo.x, CEIL + 6, 500);
      }
    }
  }

  // ------------------------------------------------------------ capsules
  spawnCapsule(x, y) {
    const pool = CAP_POOL.filter(([k]) => k !== this.lastCap && !(k === 'mult' && (this.collected.mult || this.capsules.some(c => c.type === 'mult'))));
    let tot = 0;
    for (const [, w] of pool) tot += w;
    let r = Math.random() * tot, type = pool[0][0];
    for (const [k, w] of pool) { r -= w; if (r <= 0) { type = k; break; } }
    this.lastCap = type;
    this.capsules.push({ x: clamp(x, WL + 30, WR - 30), y, type, vy: 150 + 10 * Math.min(this.level, 4), t: 0 });
    this.game.sfx('bkCapsuleDrop', x);
  }

  updateCapsules(dt) {
    const P = this.paddle;
    for (let i = this.capsules.length - 1; i >= 0; i--) {
      const c = this.capsules[i];
      c.t += dt; c.y += c.vy * dt;
      if (c.y + 9 >= P.y - P.h / 2 && c.y - 9 <= P.y + P.h / 2 && Math.abs(c.x - P.x) <= P.w / 2 + 26) {
        this.capsules.splice(i, 1);
        this.collect(c);
      } else if (c.y > 1070) {
        this.capsules.splice(i, 1);
        this.game.sfx('bkCapsuleLost', c.x);
      }
    }
  }

  collect(c) {
    const g = this.game, C = CAPS[c.type], P = this.paddle;
    g.sfx('capsule');
    g.sfx('bkPowerUp', c.type);
    g.fx.ring(c.x, P.y - 6, C.color, 70);
    g.fx.text(c.x, P.y - 48, C.label, C.color, 1.3);
    this.addFlash(P.x, P.y, P.w * 2.4, C.color, 0.35, 0.45);
    this.collected.caps++;
    switch (c.type) {
      case 'large': P.wideT = 12; break;
      case 'laser': this.laserT = 12; this.laserCd = 0; break;
      case 'aimant': this.magnetT = 12; break;
      case 'ralenti': this.ralentiT = 8; break;
      case 'perfo': this.pierceT = 6; break;
      case 'time': this.timeLeft = Math.min(this.timeLimit + 20, this.timeLeft + 8); break;
      case 'mult':
        this.collected.mult = true;
        for (const o of this.capsules) if (o.type === 'mult') o.type = 'jack';   // un seul ×2 par tentative
        break;
      case 'jack': this.collected.jack++; break;
      case 'echo': this.spawnEchoes(); break;
    }
    g.addScore(1000);
    g.say('brickCapsule', { name: C.name });
  }

  // ------------------------------------------------------------ échos holographiques
  // Billes temporaires projetées par la plateforme : elles cassent les briques et
  // s'évanouissent en tombant (jamais comptées comme la bille du joueur).
  spawnEchoes() {
    const P = this.paddle;
    if (this.echoes.length >= 2) { for (const e of this.echoes) { e.echoT = 14; e.alpha = 0.62; } return; }
    for (const sx of [-1, 1]) {
      if (this.echoes.length >= 2) break;
      const e = new Ball(clamp(P.x + sx * 28, WL + 20, WR - 20), P.y - P.h / 2 - 16);
      e.echo = true; e.tag = 'echo'; e.alpha = 0.62; e.hue = 70; e.echoT = 14;
      const a = sx * 0.4 + rand(-0.06, 0.06), s = this.currentSpeed();
      e.vx = Math.sin(a) * s; e.vy = -Math.cos(a) * s;
      e.pierce = this.pierceT > 0;
      this.world.addBall(e);
      this.echoes.push(e);
    }
    this.allowMulti = true;
    this.game.sfx('bkEcho');
    this.addFlash(P.x, P.y - 20, 160, '#7dfff0', 0.4, 0.6);
  }

  updateEchoes(dt) {
    for (let i = this.echoes.length - 1; i >= 0; i--) {
      const e = this.echoes[i];
      e.echoT -= dt;
      if (e.echoT < 0.6) e.alpha = 0.62 * Math.max(0, e.echoT / 0.6);
      if (e.echoT <= 0 || e.y > 1050 || !Number.isFinite(e.x)) this.removeEcho(i);
    }
    this.allowMulti = this.echoes.length > 0;
  }

  removeEcho(i) {
    const e = this.echoes[i];
    this.echoes.splice(i, 1);
    this.world.removeBall(e);
    if (Number.isFinite(e.x)) {
      this.spawnShards(e.x, Math.min(e.y, 1040), '#7dfff0', 6, 0.7);
      this.addFlash(e.x, Math.min(e.y, 1040), 70, '#7dfff0', 0.3, 0.7);
      this.game.sfx('bkEchoFade', e.x);
    }
  }

  dissolveEchoes() {
    while (this.echoes.length) this.removeEcho(this.echoes.length - 1);
    this.allowMulti = false;
  }

  // Bille sortie de l'arène : un écho disparaît simplement, la bille du joueur suit la règle commune.
  onBallLost(ball) {
    if (ball.echo) {
      const i = this.echoes.indexOf(ball);
      if (i >= 0) this.echoes.splice(i, 1);
      this.allowMulti = this.echoes.length > 0;
      return;
    }
    if (this.hold && this.hold.ball === ball) this.hold = null;
    super.onBallLost(ball);
  }

  resetCombos() { this.chain = 0; this.chainMult = 1; this.pierceT = 0; }

  // Sécurité : une bille qui ne touche plus rien d'utile est légèrement déviée.
  checkIdle(dt) {
    const b = this.ball;
    if (!b || b.state !== 'free' || this.state !== 'play') return;
    this.idleT += dt;
    if (this.idleT > 7) {
      this.idleT = 3.5;
      const s = Math.hypot(b.vx, b.vy) || 1;
      b.vx += sign(300 - b.x) * 0.3 * s;
      if (b.vy < 0 && b.y < 500) b.vy = Math.abs(b.vy);
      this.renorm(b, s);
    }
  }

  // ------------------------------------------------------------ effets visuels
  spawnShards(x, y, c, n, power = 1) {
    const rf = this.game.settings && this.game.settings.reducedFx;
    if (rf) n = Math.ceil(n * 0.35);
    for (let i = 0; i < n; i++) {
      if (this.shards.length >= SHARD_MAX) this.shards.shift();
      const a = rand(0, Math.PI * 2), sp = rand(70, 300) * power;
      this.shards.push({ x: x + rand(-12, 12), y: y + rand(-5, 5), vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - rand(60, 200) * power, a: rand(0, 6.28), va: rand(-14, 14), s: rand(2.5, 6.5), c, t: 0, life: rand(0.55, 1.0) });
    }
  }

  addFlash(x, y, size, color, life = 0.2, a = 0.9, k = 1) {
    if (this.flashes.length >= 24) this.flashes.shift();
    this.flashes.push({ x, y, size, color, t: 0, life, a, k });
  }

  updateVfx(dt) {
    for (const br of this.bricks) {
      if (br.flash > 0) br.flash = Math.max(0, br.flash - dt * 6);
      if (br.shake > 0) br.shake = Math.max(0, br.shake - dt * 7);
    }
    for (let i = this.shards.length - 1; i >= 0; i--) {
      const s = this.shards[i];
      s.t += dt;
      if (s.t >= s.life || s.y > 1100) { this.shards.splice(i, 1); continue; }
      s.vy += 900 * dt; s.vx *= 1 - dt * 1.2;
      s.x += s.vx * dt; s.y += s.vy * dt; s.a += s.va * dt;
    }
    for (let i = this.flashes.length - 1; i >= 0; i--) { const f = this.flashes[i]; f.t += dt; if (f.t >= f.life) this.flashes.splice(i, 1); }
    for (let i = this.blasts.length - 1; i >= 0; i--) { const b = this.blasts[i]; b.t += dt; if (b.t >= 0.4) this.blasts.splice(i, 1); }
  }

  // ------------------------------------------------------------ fin, résultats
  finish(success, reason, drainedBall = null) {
    if (this.state === 'ended') return;
    this.dissolveEchoes();
    this.bolts.length = 0;
    this.hold = null;
    super.finish(success, reason, drainedBall);
  }

  results(success) {
    const rewards = [];
    if (success) {
      rewards.push({ type: 'rampJackpot', extra: this.collected.jack * 20000 });
      rewards.push({ type: 'phase' });
      if (this.collected.mult) rewards.push({ type: 'mult' });
    }
    return {
      rewards,
      partialRewards: !success && this.collected.mult ? [{ type: 'mult' }] : [],
      points: success ? Math.round(this.timeLeft) * 1500 * this.level : this.destroyed * 100,
    };
  }

  // Mur atteint + briques détruites : la tentative suivante reprend au même point.
  keepProgress() {
    if (this.trans && !this.trans.built) return { stage: Math.min(this.stageIdx + 1, STAGES.length - 1), gone: [] };
    const gone = [];
    for (const br of this.bricks) if (!br.alive && br.kind !== 'c') gone.push(br.i);
    return { stage: this.stageIdx, gone };
  }

  progressText() {
    const n = this.trans && !this.trans.built ? this.stageIdx + 2 : this.stageIdx + 1;
    const broken = this.trans && !this.trans.built ? 0 : this.locksTotal - this.locksLeft;
    return `Mur ${Math.min(n, STAGES.length)}/${STAGES.length} · Verrous ${broken}/${this.locksTotal}`;
  }

  debugLoseBall() {
    if (this.hold && this.hold.ball === this.ball) { this.hold = null; this.ball.state = 'free'; }
    super.debugLoseBall();
  }

  // ------------------------------------------------------------ rendu
  drawStatic(g, r) { drawFloor(g, this.color, r.fontD); }

  render(ctx, r) {
    const t = r.time, W = this.wall;
    const lim = this.limitY();
    drawFloorFx(ctx, t, this.color, lim, W && W.drop > W.maxDrop * 0.6, r.fontD);
    if (W && W.entering) {
      // le nouveau mur traverse le plafond : découpe à l'arène
      ctx.save(); ctx.beginPath(); ctx.rect(WL, CEIL, WR - WL, 1100 - CEIL); ctx.clip();
      drawBricks(ctx, r, this.bricks, t);
      ctx.restore();
    } else drawBricks(ctx, r, this.bricks, t);
    drawCapsules(ctx, r, this.capsules);
    if (this.barrier && this.barrier.enabled) r.drawBarrier(this.barrier, this.barrierT);
    const P = this.paddle;
    drawPaddle(ctx, P, {
      x: lerp(P.px, P.x, r.alpha), color: this.color, t,
      laser: this.laserT > 0 && (this.laserT > 2 || Math.sin(t * 20) > 0), magnet: this.magnetT > 0 && (this.magnetT > 2 || Math.sin(t * 20) > 0),
      kick: this.laserKick,
    });
    drawBolts(ctx, this.bolts);
  }

  renderTop(ctx, r) {
    const t = r.time, P = this.paddle;
    drawEchoFx(ctx, this.echoes, t);
    drawShards(ctx, this.shards);
    drawFlashes(ctx, this.flashes, this.blasts);
    // multiplicateur de chaîne
    if (this.chainMult > 1) {
      const s = 1 + this.chainPop * 0.5;
      r.glow(510, 600, 130 * s, '#ff3df2', 0.35 + 0.3 * this.chainPop);
      r.text(`CHAÎNE ×${this.chainMult}`, 562, 600, Math.round(17 * s), '#ffd6fb', 'right', 1, true);
    }
    // bille tenue : invite et jauge de libération automatique
    const h = this.hold;
    if (h && h.ready && h.kind !== 'relaunch') {
      const b = h.ball;
      r.text('LANCER ▲', P.x, P.y - 56, 13, '#ffffff', 'center', 0.55 + 0.45 * Math.sin(t * 7), true);
      if (h.auto < Infinity) {
        ctx.strokeStyle = h.kind === 'magnet' ? '#b26bff' : this.color; ctx.lineWidth = 2.5; ctx.globalAlpha = 0.9;
        ctx.beginPath(); ctx.arc(b.x, b.y, b.r + 6, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (1 - clamp(h.t / h.auto, 0, 1))); ctx.stroke();
        ctx.globalAlpha = 1;
      }
    }
    // effets actifs (sous la piste)
    let x = 30;
    const chips = [['laser', this.laserT, 12], ['aimant', this.magnetT, 12], ['ralenti', this.ralentiT, 8], ['perfo', this.pierceT, 6], ['large', P.wideT, 12]];
    for (const [k, v, max] of chips) {
      if (v <= 0) continue;
      const C = CAPS[k];
      ctx.fillStyle = 'rgba(6,8,18,0.75)'; ctx.fillRect(x, 1050, 72, 18);
      ctx.fillStyle = C.color; ctx.globalAlpha = 0.85; ctx.fillRect(x, 1066, 72 * clamp(v / max, 0, 1), 2); ctx.globalAlpha = 1;
      ctx.strokeStyle = C.color; ctx.lineWidth = 1; ctx.strokeRect(x + 0.5, 1050.5, 71, 17);
      r.text(C.label, x + 36, 1059, 11, C.color, 'center', 1, true);
      x += 80;
    }
  }
}
