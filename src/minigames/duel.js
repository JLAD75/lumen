import { FlipperArena } from './arena.js';
import { TAU, rgba, lerp } from '../util/math.js';
import { glowSprite } from '../render/sprites.js';

// DUEL CONTRE NULL — secteur NOYAU.
// Phase 1 : détruire les 2 générateurs de bouclier. Phase 2 : frapper le noyau
// à travers les brèches de l'anneau tournant. Phase 3 : NULL se déplace, deux
// plaques le protègent. Ses attaques modifient l'arène (pare-feu, sentinelles,
// distorsion de gravité) mais sont toujours annoncées et visibles.
const RED = '#ff3d6e';
const B0 = { x: 281, y: 245 };
const RING_R = 82, CORE_R = 40;
const PIECES = 12;

export class DuelGame extends FlipperArena {
  constructor(game, opts) {
    const lvl = opts.level || 1;
    super(game, opts, {
      gravity: 2000,
      time: 120,
      title: 'DUEL CONTRE NULL',
      objective: 'Détruisez les générateurs, puis frappez le noyau rouge',
      music: 'duel',
      perk: { name: 'Bouclier initial', desc: 'Barrière d\'énergie sous les batteurs pendant 12 s' },
    });
    this.lvl = lvl;
    this.phase = 1;
    this.bx = B0.x; this.by = B0.y; this.bvx = 0;
    this.ringAngle = 0;
    this.ringSpeed = 0.45;
    this.ringDir = 1;
    this.coreHp = 0; this.coreMax = 0;
    this.hitCd = 0;
    this.flinch = 0;
    this.attackT = 7;
    this.attackIdx = 0;
    this.attack = null;           // { kind, t, warn, dur, ... }
    this.gravX = 0;
    this.eyeT = 0;
    this.defeatT = 0;
    this.intensity = 0.85;
    this._build();
    const kept = opts.phaseKept || 0;
    if (kept >= 1) { for (const g of this.gens) this._killGen(g, true); }
    if (kept >= 2) this._enterPhase(3, true);
    this.world.build();
  }

  _build() {
    const w = this.world;
    // noyau de NULL
    this.core = w.circle(B0.x, B0.y, CORE_R, { mat: 'boss', kick: 320, kickMin: 40, dynamic: true, style: 'boss' });
    this.core.onHit = (b, imp) => this.hitCore(b, imp);
    // anneau de blindage : 12 pièces (3 sous-segments chacune)
    this.pieces = [];
    for (let k = 0; k < PIECES; k++) {
      const segs = [];
      for (let s = 0; s < 3; s++) {
        const p = w.seg(0, 0, 1, 1, { mat: 'metal', r: 7, dynamic: true, style: 'armor' });
        p.onHit = () => this.game.sfx('bossShield');
        segs.push(p);
      }
      this.pieces.push({ k, segs, alive: true });
    }
    // générateurs de bouclier
    const hp = 3 + (this.lvl - 1);
    this.gens = [[128, 360], [434, 360]].map(([x, y]) => {
      const p = w.circle(x, y, 24, { mat: 'metal', kick: 200, kickMin: 40, dynamic: true, style: 'gen' });
      const g = { x, y, p, hp, maxHp: hp, alive: true, flash: 0, cd: 0 };
      p.onHit = (b, imp) => this.hitGen(g, imp);
      return g;
    });
    // plaques de la phase 3
    this.plates = [0, Math.PI].map(() => {
      const segs = [];
      for (let s = 0; s < 4; s++) { const p = w.seg(0, 0, 1, 1, { mat: 'metal', r: 7, dynamic: true, style: 'armor', enabled: false }); p.onHit = () => this.game.sfx('bossShield'); segs.push(p); }
      return segs;
    });
    // pare-feu (attaque) et sentinelles
    this.wall = w.seg(0, 0, 1, 1, { mat: 'energy', r: 5, kick: 200, kickMin: 30, dynamic: true, enabled: false, style: 'firewall' });
    this.minions = [0, 1].map(() => w.circle(0, 0, 13, { mat: 'bumper', kick: 520, kickMin: 20, dynamic: true, enabled: false, style: 'minion' }));
    // déflecteurs latéraux
    w.seg(20, 440, 70, 470, { mat: 'metal', r: 3, style: 'rail' });
    w.seg(542, 440, 492, 470, { mat: 'metal', r: 3, style: 'rail' });
    this._placeArmor();
  }

  entryPoint() { return { x: 281, y: 700 }; }
  applyPerk() { this.setBarrier(12); this.perkT = 12; }

  _placeArmor() {
    const cx = this.bx, cy = this.by;
    const step = TAU / PIECES;
    const gap = 0.06;
    for (const pc of this.pieces) {
      const a0 = this.ringAngle + pc.k * step + gap, a1 = a0 + step - gap * 2;
      pc.segs.forEach((p, s) => {
        const u0 = lerp(a0, a1, s / 3), u1 = lerp(a0, a1, (s + 1) / 3);
        this.world.moveSeg(p, cx + Math.cos(u0) * RING_R, cy + Math.sin(u0) * RING_R, cx + Math.cos(u1) * RING_R, cy + Math.sin(u1) * RING_R);
        p.ocx = cx; p.ocy = cy; p.omega = this.ringSpeed * this.ringDir; p.vx = this.bvx;
        p.enabled = pc.alive && this.phase < 3;
      });
    }
    this.plates.forEach((segs, k) => {
      const a0 = this.ringAngle * 2.2 + k * Math.PI, span = 70 * Math.PI / 180;
      segs.forEach((p, s) => {
        const u0 = a0 + span * s / 4, u1 = a0 + span * (s + 1) / 4;
        const R = 70;
        this.world.moveSeg(p, cx + Math.cos(u0) * R, cy + Math.sin(u0) * R, cx + Math.cos(u1) * R, cy + Math.sin(u1) * R);
        p.ocx = cx; p.ocy = cy; p.omega = this.ringSpeed * 2.2; p.vx = this.bvx;
        p.enabled = this.phase === 3;
      });
    });
    this.core.x = cx; this.core.y = cy; this.core.vx = this.bvx;
  }

  _enterPhase(n, silent) {
    this.phase = n;
    const g = this.game;
    if (n === 2) {
      // brèches : on retire 2 pièces sur 4 → trois ouvertures de 60°
      for (const pc of this.pieces) pc.alive = pc.k % 4 < 2;
      this.ringSpeed = 0.9 + (this.lvl - 1) * 0.25;
      this.coreMax = this.coreHp = 4 + (this.lvl - 1);
      if (!silent) { g.say('null_phase2'); g.sfx('bossPhase'); g.banner('PHASE 2 : NOYAU EXPOSÉ', 'Visez le noyau à travers les brèches', RED, 1.8); }
    } else if (n === 3) {
      for (const pc of this.pieces) pc.alive = false;
      for (const gg of this.gens) if (gg.alive) this._killGen(gg, true);
      this.ringSpeed = 1.0 + (this.lvl - 1) * 0.2;
      this.coreMax = this.coreHp = 5 + (this.lvl - 1);
      if (!silent) { g.say('null_phase3'); g.sfx('bossPhase'); g.banner('PHASE 3 : SURCHARGE', 'NULL se déplace — frappez entre les plaques', RED, 1.8); g.fx.shake(8); }
    }
    this.attackT = 4;
  }

  hitGen(gen, imp) {
    if (!gen.alive || this.phase !== 1 || imp < 150 || gen.cd > 0) return;
    gen.cd = 0.3;
    gen.hp--;
    gen.flash = 1;
    const g = this.game;
    g.sfx('bossHit');
    g.fx.burst(gen.x, gen.y, RED, 10, 260);
    g.addScore(5000 * this.lvl, gen.x, gen.y - 36);
    if (gen.hp <= 0) this._killGen(gen);
  }

  _killGen(gen, silent) {
    gen.alive = false;
    gen.p.enabled = false;
    if (!silent) {
      const g = this.game;
      g.sfx('explosion');
      g.fx.burst(gen.x, gen.y, RED, 26, 380);
      g.fx.ring(gen.x, gen.y, RED, 90);
      g.fx.shake(5);
      g.addScore(15000 * this.lvl, gen.x, gen.y - 50, 'GÉNÉRATEUR');
      g.say('null_hit');
    }
    if (this.phase === 1 && this.gens.every(x => !x.alive) && !silent) this._enterPhase(2);
    else if (this.phase === 1 && this.gens.every(x => !x.alive)) this._enterPhase(2, true);
  }

  hitCore(b, imp) {
    const g = this.game;
    if (this.phase === 1 || this.hitCd > 0 || imp < 140 || this.state !== 'play') { if (this.phase === 1) g.sfx('bossShield'); return; }
    this.hitCd = 0.45;
    this.coreHp--;
    this.flinch = 1;
    this.ringDir *= -1;
    g.sfx('bossHit');
    g.fx.shake(5);
    g.fx.burst(this.bx, this.by, RED, 18, 360);
    g.addScore(25000 * this.lvl, this.bx, this.by - 70, 'NOYAU');
    g.say('null_hit');
    if (this.coreHp <= 0) {
      if (this.phase === 2) this._enterPhase(3);
      else this._defeat();
    }
  }

  _defeat() {
    const g = this.game;
    this.defeatT = 1.2;
    g.sfx('bossDefeat');
    g.say('null_defeat');
    g.fx.flash('#ffffff', 0.5);
    g.fx.shake(14);
    for (let i = 0; i < 4; i++) g.fx.ring(this.bx, this.by, i % 2 ? '#ffffff' : RED, 80 + i * 60, 0.9);
    g.fx.burst(this.bx, this.by, RED, 50, 520);
    g.banner('NULL NEUTRALISÉ', 'Jackpot majeur', '#ffd84a', 2.4);
    this.core.enabled = false;
    for (const segs of this.plates) for (const p of segs) p.enabled = false;
    this.finish(true, 'defeat');
  }

  // --------------------------------------------------------- attaques
  _startAttack() {
    const kinds = this.phase === 3 ? ['wall', 'gravity', 'minions'] : ['wall', 'minions'];
    const kind = kinds[this.attackIdx++ % kinds.length];
    const g = this.game;
    const a = { kind, t: 0, warn: 1.3, dur: kind === 'gravity' ? 3.5 : kind === 'minions' ? 8 : 5 };
    if (kind === 'wall') {
      const pats = [[40, 640, 170, 590], [522, 640, 392, 590], [205, 600, 357, 600]];
      a.pat = pats[Math.floor(Math.random() * pats.length)];
      g.say('null_wall');
    } else if (kind === 'gravity') {
      a.dir = Math.random() < 0.5 ? -1 : 1;
      g.say('null_gravity');
    } else g.say('null_minions');
    g.sfx('bossWarn');
    this.attack = a;
  }

  _updateAttack(dt) {
    const a = this.attack;
    if (!a) {
      this.attackT -= dt;
      if (this.attackT <= 0 && this.phase >= 2) this._startAttack();
      return;
    }
    a.t += dt;
    const active = a.t >= a.warn;
    if (a.kind === 'wall') {
      const [x0, y0, x1, y1] = a.pat;
      this.world.moveSeg(this.wall, x0, y0, x1, y1);
      this.wall.enabled = active;
    } else if (a.kind === 'gravity') {
      this.gravX = active ? a.dir * 650 : 0;
      this.world.gx = this.gravX;
    } else if (a.kind === 'minions') {
      this.minions.forEach((m, k) => {
        const ang = this.time * 1.6 + k * Math.PI;
        m.x = this.bx + Math.cos(ang) * 132; m.y = this.by + Math.sin(ang) * 132;
        m.vx = -Math.sin(ang) * 132 * 1.6; m.vy = Math.cos(ang) * 132 * 1.6;
        m.enabled = active;
      });
    }
    if (a.t >= a.warn + a.dur) {
      this.wall.enabled = false;
      for (const m of this.minions) m.enabled = false;
      this.world.gx = 0; this.gravX = 0;
      this.attack = null;
      this.attackT = Math.max(4, 7 - this.lvl * 0.5 - (this.phase === 3 ? 1 : 0));
    }
  }

  arenaStep(dt) {
    this.ringAngle += this.ringSpeed * this.ringDir * dt;
    if (this.phase === 3 && this.defeatT <= 0) {
      const nx = B0.x + Math.sin(this.time * 0.7) * 100;
      this.bvx = (nx - this.bx) / dt;
      this.bx = nx;
    } else this.bvx = 0;
    this._placeArmor();
    if (this.state === 'play') this._updateAttack(dt);
    else if (this.attack && this.attack.kind === 'gravity') { this.world.gx = 0; }
    if (this.hitCd > 0) this.hitCd -= dt;
    this.flinch = Math.max(0, this.flinch - dt * 3);
    this.eyeT += dt;
    for (const gg of this.gens) { gg.flash = Math.max(0, gg.flash - dt * 3); if (gg.cd > 0) gg.cd -= dt; }
    if (this.defeatT > 0) this.defeatT -= dt;
    this.intensity = 0.85 + this.phase * 0.05;
  }

  resetCombos() { this.world.gx = 0; }

  onTimeout() {
    this.world.gx = 0;
    this.finish(false, 'timeout');
  }

  results(success) {
    return {
      rewards: success ? [{ type: 'durable' }] : [],
      points: success ? 150000 * this.lvl + Math.round(this.timeLeft) * 2000 : 0,
      phaseKept: this.phase - 1,
    };
  }

  progressText() {
    if (this.phase === 1) return `Phase 1 · générateurs ${this.gens.filter(g => !g.alive).length}/2`;
    return `Phase ${this.phase} · noyau ${this.coreMax - this.coreHp}/${this.coreMax}`;
  }

  drawStatic(g) {
    g.strokeStyle = rgba(RED, 0.08); g.lineWidth = 1.5;
    for (let k = 0; k < 18; k++) {
      const a = k * TAU / 18;
      g.beginPath(); g.moveTo(B0.x + Math.cos(a) * 110, B0.y + Math.sin(a) * 110); g.lineTo(B0.x + Math.cos(a) * 420, B0.y + Math.sin(a) * 420); g.stroke();
    }
    for (const rr of [110, 160, 230]) { g.beginPath(); g.arc(B0.x, B0.y, rr, 0, TAU); g.stroke(); }
    g.font = '900 54px "Orbitron", sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = rgba(RED, 0.06);
    g.fillText('NULL', 281, 640);
  }

  renderArena(ctx, r) {
    const t = r.time;
    const a = this.attack;
    // attaques annoncées
    if (a) {
      const warn = a.t < a.warn;
      const blink = warn ? (Math.sin(t * 24) > 0 ? 1 : 0.35) : 1;
      if (a.kind === 'wall') {
        const [x0, y0, x1, y1] = a.pat;
        ctx.globalCompositeOperation = 'lighter';
        ctx.strokeStyle = rgba(RED, (warn ? 0.6 : 0.9) * blink);
        ctx.lineWidth = warn ? 2 : 10;
        if (warn) ctx.setLineDash([8, 6]);
        ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
        ctx.setLineDash([]);
        if (!warn) { ctx.strokeStyle = '#ffd0dc'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke(); }
        ctx.globalCompositeOperation = 'source-over';
        if (warn) r.text('PARE-FEU', (x0 + x1) / 2, (y0 + y1) / 2 - 18, 11, RED, 'center', blink);
      } else if (a.kind === 'gravity') {
        const dir = a.dir;
        ctx.strokeStyle = rgba('#b07bff', (warn ? 0.5 : 0.35) * blink);
        ctx.lineWidth = 2;
        for (let k = 0; k < 9; k++) {
          const y = 480 + k * 50;
          const off = ((t * 120 * dir) % 80 + 80) % 80;
          for (let x = 40 + off - 80; x < 540; x += 80) {
            ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 24 * dir, y); ctx.lineTo(x + 16 * dir, y - 6); ctx.moveTo(x + 24 * dir, y); ctx.lineTo(x + 16 * dir, y + 6); ctx.stroke();
          }
        }
        if (warn) r.text('DISTORSION GRAVITATIONNELLE', 281, 470, 13, '#b07bff', 'center', blink, true);
      } else if (a.kind === 'minions' && warn) {
        r.text('SENTINELLES', this.bx, this.by + 150, 12, RED, 'center', blink);
      }
    }
    // liens d'énergie des générateurs
    for (const gg of this.gens) {
      if (!gg.alive) {
        r.text('✕', gg.x, gg.y, 20, '#55304a');
        continue;
      }
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = rgba(RED, 0.25 + 0.2 * Math.sin(t * 10 + gg.x));
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(gg.x, gg.y); ctx.quadraticCurveTo((gg.x + this.bx) / 2, gg.y - 60, this.bx, this.by); ctx.stroke();
      ctx.globalCompositeOperation = 'source-over';
      r.glow(gg.x, gg.y, 90, RED, 0.35 + gg.flash * 0.6);
      ctx.fillStyle = '#1e0a12';
      ctx.beginPath();
      for (let k = 0; k < 6; k++) { const an = k * TAU / 6 + t * 0.5; ctx.lineTo(gg.x + Math.cos(an) * 24, gg.y + Math.sin(an) * 24); }
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = gg.flash > 0 ? '#ffffff' : RED; ctx.lineWidth = 2.5; ctx.stroke();
      for (let i = 0; i < gg.maxHp; i++) { ctx.fillStyle = i < gg.hp ? RED : 'rgba(255,255,255,0.15)'; ctx.fillRect(gg.x - gg.maxHp * 5 + i * 10, gg.y + 30, 8, 3); }
      r.text('⚡', gg.x, gg.y + 1, 15, '#ffd0dc');
    }
    // anneau de blindage
    ctx.lineCap = 'round';
    for (const pc of this.pieces) {
      if (!pc.alive || this.phase === 3) continue;
      const s0 = pc.segs[0];
      ctx.strokeStyle = '#3a2232'; ctx.lineWidth = 16;
      ctx.beginPath(); ctx.moveTo(s0.ax, s0.ay); for (const s of pc.segs) ctx.lineTo(s.bx, s.by); ctx.stroke();
      ctx.strokeStyle = this.phase === 1 ? '#8a5a70' : RED; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.moveTo(s0.ax, s0.ay); for (const s of pc.segs) ctx.lineTo(s.bx, s.by); ctx.stroke();
    }
    for (const segs of this.plates) {
      if (!segs[0].enabled) continue;
      ctx.strokeStyle = '#3a2232'; ctx.lineWidth = 16;
      ctx.beginPath(); ctx.moveTo(segs[0].ax, segs[0].ay); for (const s of segs) ctx.lineTo(s.bx, s.by); ctx.stroke();
      ctx.strokeStyle = '#ff9ab5'; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.moveTo(segs[0].ax, segs[0].ay); for (const s of segs) ctx.lineTo(s.bx, s.by); ctx.stroke();
    }
    // sentinelles
    for (const m of this.minions) {
      if (!a || a.kind !== 'minions') continue;
      const on = m.enabled;
      ctx.globalAlpha = on ? 1 : 0.35 + 0.3 * Math.sin(t * 20);
      ctx.drawImage(glowSprite(RED, 64), m.x - 26, m.y - 26, 52, 52);
      ctx.fillStyle = '#2a0f1a'; ctx.beginPath(); ctx.arc(m.x, m.y, 13, 0, TAU); ctx.fill();
      ctx.strokeStyle = RED; ctx.lineWidth = 2; ctx.stroke();
      ctx.fillStyle = '#ffd0dc'; ctx.fillRect(m.x - 5, m.y - 1.5, 10, 3);
      ctx.globalAlpha = 1;
    }
    // NULL : tête robotique
    this._drawBoss(ctx, r, t);
  }

  _drawBoss(ctx, r, t) {
    if (this.defeatT > 0 && Math.sin(t * 40) > 0) return;
    const x = this.bx + (this.flinch > 0 ? Math.sin(t * 60) * 4 * this.flinch : 0), y = this.by;
    const vuln = this.phase >= 2;
    r.glow(x, y, 240, RED, 0.25 + (vuln ? 0.2 : 0) + this.flinch * 0.4);
    // plaque de tête
    ctx.fillStyle = '#160910';
    ctx.beginPath();
    ctx.moveTo(x - 62, y - 30); ctx.lineTo(x - 36, y - 62); ctx.lineTo(x + 36, y - 62); ctx.lineTo(x + 62, y - 30);
    ctx.lineTo(x + 56, y + 34); ctx.lineTo(x + 26, y + 58); ctx.lineTo(x - 26, y + 58); ctx.lineTo(x - 56, y + 34); ctx.closePath();
    ctx.globalAlpha = 0.65; ctx.fill(); ctx.globalAlpha = 1;
    ctx.strokeStyle = rgba(RED, 0.5); ctx.lineWidth = 1.5; ctx.stroke();
    // mandibules
    const jaw = Math.sin(this.eyeT * 3) * 4 + this.flinch * 8;
    ctx.strokeStyle = '#8a5a70'; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(x - 30, y + 50); ctx.lineTo(x - 18, y + 64 + jaw); ctx.moveTo(x + 30, y + 50); ctx.lineTo(x + 18, y + 64 + jaw); ctx.stroke();
    // antennes
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(x - 30, y - 62); ctx.lineTo(x - 44, y - 90); ctx.moveTo(x + 30, y - 62); ctx.lineTo(x + 44, y - 90); ctx.stroke();
    ctx.fillStyle = (Math.floor(t * 3) % 2) ? RED : '#4a0f20';
    ctx.beginPath(); ctx.arc(x - 44, y - 92, 4, 0, TAU); ctx.arc(x + 44, y - 92, 4, 0, TAU); ctx.fill();
    // noyau / œil
    const grd = ctx.createRadialGradient(x, y, 4, x, y, CORE_R);
    grd.addColorStop(0, vuln ? '#fff0f4' : '#7a6070');
    grd.addColorStop(0.45, vuln ? RED : '#5a2a3a');
    grd.addColorStop(1, '#1a0008');
    ctx.fillStyle = grd;
    ctx.beginPath(); ctx.arc(x, y, CORE_R, 0, TAU); ctx.fill();
    // pupille qui suit la bille
    const b = this.world.balls.find(o => o.state === 'free');
    let px = 0, py = 0;
    if (b) { const dx = b.x - x, dy = b.y - y, d = Math.hypot(dx, dy) || 1; px = dx / d * 12; py = dy / d * 12; }
    ctx.fillStyle = '#0a0004';
    ctx.beginPath(); ctx.ellipse(x + px, y + py, 7, 14, 0, 0, TAU); ctx.fill();
    if (vuln) {
      // marqueurs de point faible
      ctx.strokeStyle = rgba('#ffffff', 0.5 + 0.5 * Math.sin(t * 8));
      ctx.lineWidth = 2;
      for (let k = 0; k < 4; k++) {
        const an = k * Math.PI / 2 + t;
        ctx.beginPath(); ctx.arc(x, y, CORE_R + 8, an, an + 0.5); ctx.stroke();
      }
    }
    // barre de vie
    if (this.coreMax > 0) {
      const w = 120;
      ctx.fillStyle = 'rgba(255,255,255,0.12)'; ctx.fillRect(x - w / 2, y - 112, w, 6);
      ctx.fillStyle = RED; ctx.fillRect(x - w / 2, y - 112, w * (this.coreHp / this.coreMax), 6);
    }
    r.text(`NULL · PHASE ${this.phase}`, x, y - 124, 11, RED, 'center', 0.9, true);
  }
}
