import { Minigame, Paddle, zeroGHook } from './base.js';
import { rand, clamp, TAU, rgba } from '../util/math.js';

// DÉFENSE DE LA STATION — secteur DÉFENSE.
// Le noyau devient un projectile réutilisable : renvoyez-le avec la plateforme
// pour détruire les drones avant qu'ils n'atteignent la ligne de défense.
const GREEN = '#5dff8f';
const LINE_Y = 932;

const TYPES = {
  scout:   { hp: 1, r: 15, speed: 36, pts: 1500 },
  tank:    { hp: 3, r: 22, speed: 22, pts: 4000 },
  gunner:  { hp: 2, r: 18, speed: 60, pts: 3000 },
  carrier: { hp: 10, r: 40, speed: 60, pts: 20000 },
};

export class DefenseGame extends Minigame {
  constructor(game, opts) {
    const lvl = opts.level || 1;
    super(game, opts, {
      gravity: 0, damping: 0,
      time: 100,
      title: 'DÉFENSE DE LA STATION',
      objective: 'Détruisez les 3 vagues de drones — ← → déplacent la plateforme',
      music: 'defense',
      perk: { name: 'Tourelle d\'appoint', desc: 'La plateforme tire seule pendant 12 s' },
    });
    this.speedK = 1 + (lvl - 1) * 0.15;
    this.hpBonus = lvl - 1;
    this.hull = lvl === 1 ? 5 : 4;
    this.hullMax = this.hull;
    this.paddle = new Paddle(300, 990, 132);
    this.paddle.minX = 23; this.paddle.maxX = 577;
    this.drones = [];
    this.bolts = [];
    this.beams = [];
    this.wave = 0;            // vague en cours (1..3)
    this.cleared = 0;
    this.spawnQueue = [];
    this.waveDelay = 1.4;
    this.turretT = 0;
    this.turretCd = 0;
    this.chain = 0;
    this.hullFlash = 0;
    this.pierceT = 0;
    this._buildArena();
    this.world.ballHook = zeroGHook(() => 880 + this.wave * 50 + (this.level - 1) * 60);
  }

  _buildArena() {
    const w = this.world;
    const rail = { mat: 'metal', r: 3, style: 'rail' };
    w.arc(300, 300, 280, -Math.PI, 0, { ...rail, segLen: 12 });
    w.seg(20, 300, 20, 1110, rail);
    w.seg(580, 300, 580, 1110, rail);
    this.addBarrier(20, 580, 1040);
    w.build();
  }

  entryPoint() { return { x: 300, y: 720 }; }
  placeEntry(ball) {
    ball.setPos(300, 720); ball.vx = rand(-60, 60); ball.vy = 420;
    if (this.game.bonus.phaseT > 0) this.pierceT = Math.min(6, this.game.bonus.phaseT);
  }
  applyPerk() { this.turretT = 12; this.perkT = 12; }

  _startWave(n) {
    this.wave = n;
    const q = [];
    if (n === 1) for (let i = 0; i < 6; i++) q.push({ t: i * 1.3, type: 'scout' });
    if (n === 2) {
      ['scout', 'tank', 'scout', 'gunner', 'scout', 'tank', 'scout'].forEach((type, i) => q.push({ t: i * 1.25, type }));
    }
    if (n === 3) {
      q.push({ t: 0, type: 'carrier' });
      q.push({ t: 1.5, type: 'gunner' });
      q.push({ t: 3.5, type: 'gunner' });
    }
    this.spawnQueue = q;
    this.game.sfx('waveStart');
    this.game.say(n === 3 ? 'defenseCarrier' : 'defenseWave', { n });
    this.game.banner(`VAGUE ${n}/3`, n === 3 ? 'Porte-drones : détruisez son cœur' : 'Drones en approche', GREEN, 1.4);
  }

  _spawn(type, x) {
    const T = TYPES[type];
    const p = this.world.circle(0, 0, T.r, { mat: 'metal', dynamic: true, style: 'drone' });
    p.pierceable = true;
    const d = {
      type, p, hp: T.hp + (type === 'scout' ? 0 : this.hpBonus), maxHp: 0,
      x: x ?? rand(70, 530), y: type === 'carrier' ? 160 : 70, r: T.r,
      vx: type === 'carrier' || type === 'gunner' ? (Math.random() < 0.5 ? -1 : 1) * T.speed * this.speedK : 0,
      vy: type === 'carrier' ? 0 : T.speed * this.speedK, phase: rand(0, TAU), flash: 0, fireT: rand(1.2, 2.6),
      hover: rand(230, 330), alive: true, t: 0,
    };
    if (type === 'gunner') d.vy = 70;
    d.maxHp = d.hp;
    p.x = d.x; p.y = d.y;
    p.onHit = () => this.damage(d, 1);
    this.drones.push(d);
    return d;
  }

  step(dt, inp) {
    this.paddle.update(dt, inp);
    const frozen = this.state !== 'play';
    if (this.pierceT > 0) this.pierceT -= dt;
    for (const b of this.world.balls) {
      b.pierce = this.pierceT > 0;
      if (b.state === 'held') b.setPos(this.paddle.x, this.paddle.y - this.paddle.h / 2 - b.r - 1);
    }
    if (!frozen) this._updateWaves(dt);
    this.world.step(dt);
    for (const b of this.world.balls) {
      if (b.state !== 'free') continue;
      if (this.paddle.collide(b, 880 + this.wave * 50)) { this.chain = 0; this.game.sfx('paddle', (b.x - this.paddle.x) / (this.paddle.w / 2)); }
    }
    this._updateBolts(dt, frozen);
    if (this.turretT > 0 && !frozen) this._turret(dt);
    for (let i = this.beams.length - 1; i >= 0; i--) { this.beams[i].t -= dt; if (this.beams[i].t <= 0) this.beams.splice(i, 1); }
    if (this.hullFlash > 0) this.hullFlash -= dt;
    if (this.state === 'relaunch' && inp.launchPressed) this.relaunch();
  }

  _updateWaves(dt) {
    if (this.wave === 0 || (this.drones.length === 0 && this.spawnQueue.length === 0)) {
      if (this.wave > 0 && this.cleared < this.wave) {
        this.cleared = this.wave;
        this.game.addScore(15000 * this.wave * this.level, 300, 500, `VAGUE ${this.wave} DÉTRUITE`);
        this.game.sfx('reward');
        if (this.wave >= 3) { this.finish(true, 'waves'); return; }
        this.waveDelay = 1.6;
      }
      this.waveDelay -= dt;
      if (this.waveDelay <= 0) this._startWave(this.wave + 1);
      return;
    }
    for (let i = this.spawnQueue.length - 1; i >= 0; i--) {
      const s = this.spawnQueue[i];
      s.t -= dt;
      if (s.t <= 0) { this.spawnQueue.splice(i, 1); this._spawn(s.type); }
    }
    for (const d of [...this.drones]) {
      d.t += dt;
      d.flash = Math.max(0, d.flash - dt * 4);
      if (d.type === 'scout') {
        d.vx = Math.cos(d.t * 1.7 + d.phase) * 70;
      } else if (d.type === 'gunner') {
        if (d.y >= d.hover) { d.vy = 0; if (Math.abs(d.vx) < 1) d.vx = 70; }
        d.fireT -= dt;
        if (d.fireT <= 0 && d.y >= d.hover - 5) { d.fireT = 2.6 / this.speedK; this.bolts.push({ x: d.x, y: d.y + d.r, vy: 270 * this.speedK, alive: true }); this.game.sfx('laser'); }
      } else if (d.type === 'carrier') {
        d.fireT -= dt;
        if (d.fireT <= 0) {
          d.fireT = 4.5 / this.speedK;
          if (this.drones.filter(o => o.type === 'scout').length < 4) { const s = this._spawn('scout', d.x); s.y = d.y + 40; }
        }
      }
      d.x += d.vx * dt; d.y += d.vy * dt;
      if (d.x < 40 + d.r) { d.x = 40 + d.r; d.vx = Math.abs(d.vx); }
      if (d.x > 560 - d.r) { d.x = 560 - d.r; d.vx = -Math.abs(d.vx); }
      d.p.x = d.x; d.p.y = d.y; d.p.vx = d.vx; d.p.vy = d.vy;
      if (d.y + d.r >= LINE_Y) this._breach(d);
    }
  }

  _breach(d) {
    this._kill(d, false);
    this.hull--;
    this.hullFlash = 0.6;
    this.game.sfx('hullHit');
    this.game.fx.shake(6);
    this.game.fx.flash('#ff4060', 0.2);
    this.game.fx.burst(d.x, LINE_Y, '#ff4060', 16, 300);
    this.game.say('defenseHull', { hull: `${this.hull}/${this.hullMax}` });
    if (this.hull <= 0) this.finish(false, 'hull');
  }

  damage(d, n) {
    if (!d.alive || this.state === 'ended') return;
    d.hp -= n;
    d.flash = 1;
    if (d.hp <= 0) { this._kill(d, true); return; }
    this.game.sfx('droneHit');
    this.game.fx.burst(d.x, d.y, '#c8ffd8', 5, 180);
  }

  _kill(d, byPlayer) {
    if (!d.alive) return;
    d.alive = false;
    d.p.enabled = false; // désactivé (pas de retrait pendant l'itération de la simulation)
    const i = this.drones.indexOf(d);
    if (i >= 0) this.drones.splice(i, 1);
    if (!byPlayer) return;
    this.chain++;
    const mult = Math.min(5, 1 + Math.floor(this.chain / 2));
    this.game.addScore(TYPES[d.type].pts * mult, d.x, d.y - 20, mult > 1 ? `CHAÎNE ×${mult}` : undefined);
    this.game.sfx(d.type === 'carrier' ? 'explosion' : 'droneExplode');
    this.game.fx.burst(d.x, d.y, GREEN, d.type === 'carrier' ? 30 : 12, d.type === 'carrier' ? 420 : 280);
    this.game.fx.ring(d.x, d.y, GREEN, d.r * 2.5);
    if (d.type === 'carrier') { this.game.fx.shake(8); for (const o of [...this.drones]) this._kill(o, true); }
  }

  _updateBolts(dt, frozen) {
    const P = this.paddle;
    const ball = this.world.balls.find(b => b.state === 'free');
    for (let i = this.bolts.length - 1; i >= 0; i--) {
      const s = this.bolts[i];
      if (!frozen) s.y += s.vy * dt;
      if (ball && Math.hypot(ball.x - s.x, ball.y - s.y) < ball.r + 7) {
        this.bolts.splice(i, 1);
        this.game.addScore(300, s.x, s.y);
        this.game.fx.burst(s.x, s.y, '#ff6080', 6, 200);
        continue;
      }
      if (s.y > P.y - P.h / 2 && s.y < P.y + P.h && Math.abs(s.x - P.x) < P.w / 2) {
        this.bolts.splice(i, 1);
        P.stun = 1.2;
        this.game.sfx('droneHit');
        this.game.fx.burst(s.x, P.y, '#ff4060', 10, 240);
        continue;
      }
      if (s.y > 1080) this.bolts.splice(i, 1);
    }
  }

  _turret(dt) {
    this.turretT -= dt;
    this.turretCd -= dt;
    if (this.turretCd > 0) return;
    let best = null;
    for (const d of this.drones) if (Math.abs(d.x - this.paddle.x) < 80 && (!best || d.y > best.y)) best = d;
    if (!best) return;
    this.turretCd = 0.6;
    this.beams.push({ x0: this.paddle.x, y0: this.paddle.y - 10, x1: best.x, y1: best.y, t: 0.15 });
    this.game.sfx('turret');
    this.damage(best, 1);
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
    const s = 880 + this.wave * 50;
    b.vx = Math.sin(ang) * s; b.vy = -Math.cos(ang) * s;
  }

  resetCombos() { this.chain = 0; this.pierceT = 0; }

  results(success) {
    const extra = this.hull >= Math.ceil(this.hullMax / 2) ? 2 : 1;
    return {
      rewards: success ? [{ type: 'deferredMB', count: extra }] : [],
      points: 15000 * this.cleared * this.level + (success ? Math.round(this.timeLeft) * 800 : 0),
    };
  }

  progressText() { return `Vague ${Math.max(1, this.wave)}/3 · coque ${this.hull}/${this.hullMax}`; }

  drawStatic(g) {
    // grille radar
    g.strokeStyle = rgba(GREEN, 0.08); g.lineWidth = 1;
    for (let r = 100; r < 900; r += 110) { g.beginPath(); g.arc(300, 1040, r, Math.PI, TAU); g.stroke(); }
    for (let k = 1; k < 12; k++) { const a = Math.PI + k * Math.PI / 12; g.beginPath(); g.moveTo(300, 1040); g.lineTo(300 + Math.cos(a) * 900, 1040 + Math.sin(a) * 900); g.stroke(); }
    // coque de la station
    g.fillStyle = '#121a2c';
    g.fillRect(20, 1046, 560, 60);
    g.fillStyle = rgba('#ffd84a', 0.35);
    for (let x = 40; x < 570; x += 34) g.fillRect(x, 1062, 14, 6);
  }

  render(ctx, r) {
    const t = r.time;
    // ligne de défense
    ctx.setLineDash([12, 8]); ctx.lineDashOffset = -t * 30;
    ctx.strokeStyle = rgba(this.hullFlash > 0 ? '#ff4060' : GREEN, 0.55);
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(24, LINE_Y); ctx.lineTo(576, LINE_Y); ctx.stroke();
    ctx.setLineDash([]);
    r.text('LIGNE DE DÉFENSE', 90, LINE_Y - 10, 10, GREEN, 'center', 0.5);
    // intégrité de la coque
    for (let i = 0; i < this.hullMax; i++) {
      const on = i < this.hull;
      ctx.fillStyle = on ? GREEN : 'rgba(255,64,96,0.35)';
      ctx.fillRect(300 - this.hullMax * 18 + i * 36, 1084, 30, 7);
    }
    r.text('COQUE', 300 - this.hullMax * 18 - 30, 1088, 10, GREEN, 'center', 0.7);
    if (this.hullFlash > 0) { ctx.fillStyle = `rgba(255,64,96,${this.hullFlash * 0.4})`; ctx.fillRect(20, 1046, 560, 60); }
    // drones
    for (const d of this.drones) this._drawDrone(ctx, r, d, t);
    // tirs ennemis
    for (const s of this.bolts) { r.glow(s.x, s.y, 34, '#ff4060', 0.9); ctx.fillStyle = '#ffd0d8'; ctx.fillRect(s.x - 2, s.y - 7, 4, 14); }
    // tourelle
    for (const bm of this.beams) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = rgba(GREEN, bm.t / 0.15); ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(bm.x0, bm.y0); ctx.lineTo(bm.x1, bm.y1); ctx.stroke();
      ctx.globalCompositeOperation = 'source-over';
    }
    if (this.barrier && this.barrier.enabled) r.drawBarrier(this.barrier, this.barrierT);
    r.drawPaddle(this.paddle, GREEN);
    if (this.turretT > 0) r.text('TOURELLE', this.paddle.x, this.paddle.y + 22, 9, GREEN, 'center', 0.8);
    if (this.wave === 0 || (this.waveDelay > 0 && this.drones.length === 0 && this.cleared < 3)) {
      r.text(`VAGUE ${Math.min(3, this.cleared + 1)}`, 300, 420, 26, GREEN, 'center', 0.5 + 0.5 * Math.sin(t * 6), true);
    }
  }

  _drawDrone(ctx, r, d, t) {
    const x = d.x, y = d.y, R = d.r;
    const col = d.flash > 0 ? '#ffffff' : d.type === 'carrier' ? '#ff6b3d' : d.type === 'gunner' ? '#ffb52e' : d.type === 'tank' ? '#9fb6d8' : GREEN;
    r.glow(x, y, R * 4, col, 0.3 + d.flash * 0.5);
    ctx.save();
    ctx.translate(x, y);
    if (d.type === 'carrier') {
      ctx.fillStyle = '#1d1420';
      ctx.beginPath(); ctx.moveTo(-R * 1.4, -8); ctx.lineTo(-R, -R * 0.7); ctx.lineTo(R, -R * 0.7); ctx.lineTo(R * 1.4, -8); ctx.lineTo(R, R * 0.6); ctx.lineTo(-R, R * 0.6); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.stroke();
      for (let k = -2; k <= 2; k++) { ctx.fillStyle = (Math.floor(t * 4 + k) % 2) ? '#ffd84a' : '#5a3a10'; ctx.fillRect(k * 14 - 3, R * 0.25, 6, 4); }
      ctx.fillStyle = '#ff4060'; ctx.beginPath(); ctx.arc(0, -4, 10 + Math.sin(t * 8) * 2, 0, TAU); ctx.fill();
    } else if (d.type === 'tank') {
      ctx.fillStyle = '#26314f';
      ctx.beginPath(); for (let k = 0; k < 6; k++) { const a = k * TAU / 6; ctx.lineTo(Math.cos(a) * R, Math.sin(a) * R); } ctx.closePath(); ctx.fill();
      ctx.strokeStyle = col; ctx.lineWidth = 2.5; ctx.stroke();
      ctx.fillStyle = '#ff4060'; ctx.fillRect(-6, -3, 12, 6);
    } else if (d.type === 'gunner') {
      ctx.fillStyle = '#2a2236';
      ctx.beginPath(); ctx.arc(0, 0, R, 0, TAU); ctx.fill();
      ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.stroke();
      ctx.fillStyle = '#8ea4cf'; ctx.fillRect(-3, R - 4, 6, 10);
      ctx.fillStyle = '#ffb52e'; ctx.beginPath(); ctx.arc(0, -2, 5, 0, TAU); ctx.fill();
    } else {
      ctx.rotate(Math.sin(t * 3 + d.phase) * 0.3);
      ctx.fillStyle = '#16261e';
      ctx.beginPath(); ctx.moveTo(0, R); ctx.lineTo(-R, -R * 0.6); ctx.lineTo(0, -R * 0.2); ctx.lineTo(R, -R * 0.6); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.stroke();
      ctx.fillStyle = '#ff4060'; ctx.beginPath(); ctx.arc(0, R * 0.25, 3.5, 0, TAU); ctx.fill();
    }
    ctx.restore();
    if (d.maxHp > 1) {
      for (let i = 0; i < d.maxHp; i++) {
        ctx.fillStyle = i < d.hp ? col : 'rgba(255,255,255,0.15)';
        ctx.fillRect(x - d.maxHp * 4 + i * 8, y - R - 10, 6, 3);
      }
    }
  }
}
