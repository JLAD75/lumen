import { Minigame, Paddle, zeroGHook } from './base.js';
import { rand, choose, clamp, dist } from '../util/math.js';

// CASSE-BRIQUES ORBITAL — secteur HANGAR.
// Objectif : briser les 3 VERROUS dorés protégés par des briques blindées,
// explosives et mobiles. Gravité coupée : la bille garde sa vitesse.
const COLS = 9, BW = 56, BH = 24, GAP = 4, X0 = 32, Y0 = 236;

const LAYOUTS = [
  [
    '.aaaLaaa.',
    'nnxnnnxnn',
    'nnnnnnnnn',
    'mm..mm..m',
    'aLannnaLa',
    'nnnxnxnnn',
    '.nnnnnnn.',
  ],
  [
    'aaaaLaaaa',
    'nxnnannxn',
    'mmm...mmm',
    'nnaxnxann',
    'aLannnaLa',
    'nnnnxnnnn',
    'a.nnnnn.a',
  ],
];

const CAPSULES = {
  large: { label: 'LARGE', color: '#29e3ff', name: 'Plateforme élargie' },
  perfo: { label: 'PERFO', color: '#b07bff', name: 'Perforation' },
  time:  { label: '+8 s',  color: '#5dff8f', name: 'Temps supplémentaire' },
  mult:  { label: '×2',    color: '#ffd84a', name: 'Multiplicateur ×2 (plateau)' },
  jack:  { label: 'JACK',  color: '#ffb52e', name: 'Jackpot de rampe renforcé' },
};

export class BreakoutGame extends Minigame {
  constructor(game, opts) {
    const lvl = opts.level || 1;
    super(game, opts, {
      gravity: 0, damping: 0,
      time: lvl === 1 ? 75 : 68,
      title: 'CASSE-BRIQUES ORBITAL',
      objective: 'Brisez les 3 verrous dorés — ← → déplacent la plateforme',
      music: 'brick',
      perk: { name: 'Plateforme élargie', desc: 'Plateforme élargie pendant 12 s' },
    });
    this.targetSpeed = 820 + (lvl - 1) * 70;
    this.paddle = new Paddle(300, 990, lvl === 1 ? 124 : 108);
    this.paddle.minX = 23; this.paddle.maxX = 577;
    this.bricks = [];
    this.capsules = [];
    this.locksLeft = 3;
    this.chain = 0;
    this.pierceT = 0;
    this.collected = { mult: false, jack: 0 };
    this.moveT = 0;
    this.explodeQueue = [];
    this._buildArena(lvl);
    this.world.ballHook = zeroGHook(() => this.currentSpeed());
  }

  currentSpeed() { return Math.min(this.targetSpeed + this.time * 6, this.targetSpeed + 280); }

  _buildArena(lvl) {
    const w = this.world;
    const rail = { mat: 'metal', r: 3, style: 'rail' };
    w.arc(300, 300, 280, -Math.PI, 0, { ...rail, segLen: 12 });
    w.seg(20, 300, 20, 1110, rail);
    w.seg(580, 300, 580, 1110, rail);
    this.addBarrier(20, 580, 1040);
    const layout = LAYOUTS[Math.min(lvl - 1, LAYOUTS.length - 1)];
    layout.forEach((row, ri) => {
      [...row].forEach((ch, ci) => {
        if (ch === '.') return;
        const x = X0 + ci * (BW + GAP), y = Y0 + ri * (BH + GAP + 4);
        let type = { n: 'normal', a: 'armor', x: 'explosive', m: 'mobile', L: 'lock' }[ch];
        if (lvl >= 3 && type === 'normal' && (ci + ri) % 4 === 0) type = 'armor';
        const hp = type === 'armor' ? (lvl === 1 ? 3 : 4) : type === 'lock' ? (lvl === 1 ? 2 : 3) : 1;
        const p = w.rect(x, y, BW, BH, { mat: 'brick', style: 'brick' });
        p.pierceable = true;
        const brick = { p, type, hp, maxHp: hp, x, y, bx: x, row: ri, flash: 0, alive: true, hue: ri };
        p.data = brick;
        p.onHit = (b, imp, nx, ny, prim, pierced) => this.hitBrick(brick, b, pierced);
        this.bricks.push(brick);
      });
    });
  }

  entryPoint() { return { x: 300, y: 720 }; }

  placeEntry(ball) {
    ball.setPos(300, 720);
    ball.vx = rand(-60, 60); ball.vy = 420;
    // effet compatible : le noyau phasique perfore les briques quelques secondes
    if (this.game.bonus.phaseT > 0) { this.pierceT = Math.min(6, this.game.bonus.phaseT); }
  }

  applyPerk() { this.paddle.wideT = 12; this.perkT = 12; }

  step(dt, inp) {
    this.paddle.update(dt, inp);
    this.moveT += dt;
    // rangée mobile : oscillation horizontale
    const amp = 92, spd = 0.9 + (this.level - 1) * 0.25;
    const off = Math.sin(this.moveT * spd) * amp;
    const vel = Math.cos(this.moveT * spd) * amp * spd;
    for (const br of this.bricks) {
      if (!br.alive || br.type !== 'mobile') continue;
      br.x = clamp(br.bx + off, 24, 576 - BW);
      br.p.x0 = br.x; br.p.x1 = br.x + BW; br.p.vx = vel;
    }
    if (this.pierceT > 0) this.pierceT -= dt;
    for (const b of this.world.balls) {
      b.pierce = this.pierceT > 0;
      if (b.state === 'held') { b.setPos(this.paddle.x, this.paddle.y - this.paddle.h / 2 - b.r - 1); }
    }
    this.world.step(dt);
    for (const b of this.world.balls) {
      if (b.state !== 'free') continue;
      if (this.paddle.collide(b, this.currentSpeed())) {
        this.chain = 0;
        this.game.sfx('paddle', (b.x - this.paddle.x) / (this.paddle.w / 2));
      }
    }
    // explosions en chaîne (léger délai pour la lisibilité)
    for (let i = this.explodeQueue.length - 1; i >= 0; i--) {
      const e = this.explodeQueue[i];
      e.t -= dt;
      if (e.t <= 0) { this.explodeQueue.splice(i, 1); this.explode(e.brick); }
    }
    this.updateCapsules(dt);
    if (this.state === 'relaunch' && inp.launchPressed) this.relaunch();
  }

  hitBrick(br, ball, pierced) {
    if (!br.alive || this.state === 'ended') return;
    br.hp -= 1;
    br.flash = 1;
    const g = this.game;
    if (br.hp > 0) {
      g.sfx('brickArmor', br.hp);
      g.fx.burst(br.x + BW / 2, br.y + BH / 2, '#9fb6d8', 4, 160);
      return;
    }
    this.destroyBrick(br, ball);
  }

  destroyBrick(br) {
    if (!br.alive) return;
    br.alive = false;
    br.p.enabled = false; // retiré de la simulation (sans modifier la liste en cours d'itération)
    const g = this.game;
    const cx = br.x + BW / 2, cy = br.y + BH / 2;
    this.chain++;
    const base = { normal: 300, armor: 800, explosive: 500, mobile: 600, lock: 5000 }[br.type];
    const chainMult = Math.min(5, 1 + Math.floor(this.chain / 3));
    g.addScore(base * chainMult, cx, cy - 10, chainMult > 1 ? `CHAÎNE ×${chainMult}` : undefined);
    const col = br.type === 'lock' ? '#ffd84a' : br.type === 'explosive' ? '#ff5a3d' : br.type === 'armor' ? '#c8d6f0' : '#29d9ff';
    g.fx.burst(cx, cy, col, br.type === 'lock' ? 26 : 10, br.type === 'lock' ? 420 : 260);
    g.sfx(br.type === 'lock' ? 'lockBreak' : 'brickBreak', this.chain);
    if (br.type === 'explosive') {
      g.fx.ring(cx, cy, '#ff5a3d', 90);
      g.fx.shake(4);
      g.sfx('explosion');
      for (const o of this.bricks) {
        if (o.alive && o !== br && dist(o.x, o.y, br.x, br.y) < 80) this.explodeQueue.push({ brick: o, t: 0.07 });
      }
    }
    if (br.type === 'lock') {
      this.locksLeft--;
      g.fx.flash('#ffd84a', 0.2);
      if (this.locksLeft > 0) g.say('brickLock', { n: this.locksLeft });
      else { this.finish(true, 'locks'); return; }
    }
    if (br.type === 'normal' || br.type === 'mobile') {
      const chance = 0.2 + (this.capsules.length === 0 ? 0.05 : 0);
      if (Math.random() < chance) this.spawnCapsule(cx, cy);
    }
  }

  explode(br) {
    if (!br.alive) return;
    br.hp -= 2;
    br.flash = 1;
    if (br.hp <= 0) this.destroyBrick(br);
  }

  spawnCapsule(x, y) {
    const pool = ['large', 'perfo', 'time', 'jack'];
    if (!this.collected.mult) pool.push('mult', 'mult');
    const type = choose(pool);
    this.capsules.push({ x, y, type, vy: 190, t: 0 });
  }

  updateCapsules(dt) {
    const P = this.paddle;
    for (let i = this.capsules.length - 1; i >= 0; i--) {
      const c = this.capsules[i];
      c.t += dt; c.y += c.vy * dt;
      if (c.y > P.y - 18 && c.y < P.y + 14 && Math.abs(c.x - P.x) < P.w / 2 + 14) {
        this.capsules.splice(i, 1);
        this.collect(c);
      } else if (c.y > 1080) this.capsules.splice(i, 1);
    }
  }

  collect(c) {
    const g = this.game, C = CAPSULES[c.type];
    g.sfx('capsule');
    g.fx.ring(c.x, c.y, C.color, 40);
    if (c.type === 'large') this.paddle.wideT = 12;
    if (c.type === 'perfo') this.pierceT = 6;
    if (c.type === 'time') this.timeLeft = Math.min(this.timeLimit + 20, this.timeLeft + 8);
    if (c.type === 'mult') this.collected.mult = true;
    if (c.type === 'jack') this.collected.jack++;
    g.addScore(1000, c.x, c.y - 20, C.label);
    g.say('brickCapsule', { name: C.name });
  }

  prepareRelaunch(ball) {
    ball.state = 'held';
    ball.setPos(this.paddle.x, this.paddle.y - 30);
    this.world.addBall(ball);
    this.ball = ball;
  }

  doRelaunch(b) {
    b.state = 'free';
    const ang = clamp(this.paddle.vx / this.paddle.maxV, -1, 1) * 0.5 + rand(-0.12, 0.12);
    const s = this.currentSpeed();
    b.vx = Math.sin(ang) * s; b.vy = -Math.cos(ang) * s;
  }

  resetCombos() { this.chain = 0; this.pierceT = 0; }

  results(success) {
    const rewards = [];
    if (success) {
      rewards.push({ type: 'rampJackpot', extra: this.collected.jack * 20000 });
      rewards.push({ type: 'phase' });
      if (this.collected.mult) rewards.push({ type: 'mult' });
    }
    const destroyed = this.bricks.filter(b => !b.alive).length;
    return {
      rewards,
      partialRewards: !success && this.collected.mult ? [{ type: 'mult' }] : [],
      points: success ? Math.round(this.timeLeft) * 1500 * this.level : destroyed * 100,
    };
  }

  progressText() { return `Verrous ${3 - this.locksLeft}/3`; }

  render(ctx, r) {
    r.drawArenaFrame(this.color, 'hangar');
    const t = this.time;
    // briques
    for (const br of this.bricks) {
      if (!br.alive) continue;
      if (br.flash > 0) br.flash -= 0.05;
      r.drawBrick(br, BW, BH, t);
    }
    // capsules
    for (const c of this.capsules) r.drawCapsule(c, CAPSULES[c.type]);
    if (this.barrier && this.barrier.enabled) r.drawBarrier(this.barrier, this.barrierT);
    r.drawPaddle(this.paddle, this.color);
  }
}
