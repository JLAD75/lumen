import { FlipperArena } from './arena.js';
import { TAU, rgba } from '../util/math.js';
import { glowSprite } from '../render/sprites.js';

// RÉACTEUR INSTABLE — secteur RÉACTEUR.
// Touchez les nœuds énergétiques dans l'ordre annoncé (1, 2, 3…) avant que
// l'instabilité n'atteigne 100 %. Rotors et drones stabilisateurs gênent les tirs.
const C = { x: 281, y: 330 };
const NODE_R = 18, RING = 178;
const ANGLES = [-90, -30, 30, 90, 150, -150].map(a => a * Math.PI / 180);
const ORANGE = '#ffae2a';

export class ReactorGame extends FlipperArena {
  constructor(game, opts) {
    const lvl = opts.level || 1;
    super(game, opts, {
      gravity: 2000,
      time: 90,
      title: 'RÉACTEUR INSTABLE',
      objective: 'Touchez les nœuds dans l\'ordre (1 → 2 → 3…) — batteurs ← →',
      music: 'reactor',
      perk: { name: 'Stabilisateur', desc: 'Instabilité gelée pendant 10 s' },
    });
    this.rounds = lvl === 1 ? [3, 4, 5] : [4, 5, 6];
    // séquences stabilisées lors d'une tentative précédente (jamais la dernière)
    this.round = Math.min(this.rounds.length - 1, (this.kept && this.kept.round) || 0);
    this.seq = [];
    this.stepIdx = 0;
    this.instability = 0;
    this.instRate = 1.0 + (lvl - 1) * 0.3;
    this.freezeT = 0;
    this.chain = 0;
    this.rotorAngle = 0;
    this.rotorSpeed = 1.1 + (lvl - 1) * 0.3;
    this.droneT = 0;
    this.seqFlash = 0;
    this.critical = false;
    this.intensity = 0.8;
    this._build();
    this._newSequence();
    this.world.build();
  }

  _build() {
    const w = this.world;
    // cœur du réacteur
    this.core = w.circle(C.x, C.y, 34, { mat: 'energy', kick: 260, kickMin: 40, style: 'core' });
    this.core.onHit = (b, imp) => this.hitCore(b, imp);
    // nœuds énergétiques
    this.nodes = ANGLES.map((a, i) => {
      const x = C.x + Math.cos(a) * RING, y = C.y + Math.sin(a) * RING;
      const p = w.circle(x, y, NODE_R, { mat: 'energy', kick: 380, kickMin: 30, kickCooldown: 0.15, style: 'node' });
      const node = { i, x, y, p, flash: 0, bad: 0 };
      p.onHit = (b, imp) => this.hitNode(node, b, imp);
      return node;
    });
    // rotors (capsules en rotation autour du cœur)
    this.rotors = [0, Math.PI].map(() => {
      const p = w.seg(0, 0, 1, 1, { mat: 'metal', r: 6, dynamic: true, style: 'rotor' });
      p.ocx = C.x; p.ocy = C.y;
      return p;
    });
    // drones stabilisateurs mobiles
    this.drones = [0, 1].map((k) => w.circle(200, 640, 15, { mat: 'bumper', kick: 600, kickMin: 20, dynamic: true, style: 'drone', data: { k } }));
    for (const d of this.drones) d.onHit = () => { this.game.sfx('bumper', 2, 1); this.game.addScore(250, d.x, d.y - 26); };
    // déflecteurs latéraux au-dessus des renflements (évitent les zones mortes)
    w.seg(20, 440, 70, 470, { mat: 'metal', r: 3, style: 'rail' });
    w.seg(542, 440, 492, 470, { mat: 'metal', r: 3, style: 'rail' });
    this._placeRotors();
  }

  _placeRotors() {
    this.rotors.forEach((p, k) => {
      const a = this.rotorAngle + k * Math.PI;
      const c = Math.cos(a), s = Math.sin(a);
      this.world.moveSeg(p, C.x + c * 50, C.y + s * 50, C.x + c * 128, C.y + s * 128);
      p.omega = this.rotorSpeed;
    });
  }

  entryPoint() { return { x: 281, y: 700 }; }
  applyPerk() { this.freezeT = 10; this.perkT = 10; }

  _newSequence() {
    const n = this.rounds[this.round];
    const seq = [];
    let last = -1;
    const pool = [0, 1, 2, 3, 4, 5];
    while (seq.length < n) {
      const cand = pool.filter(i => i !== last && !seq.slice(-2).includes(i));
      const pick = cand[Math.floor(Math.random() * cand.length)];
      seq.push(pick); last = pick;
    }
    this.seq = seq;
    this.stepIdx = 0;
    this.seqFlash = 1.5;
  }

  arenaStep(dt) {
    this.rotorAngle += this.rotorSpeed * dt;
    this._placeRotors();
    this.droneT += dt;
    const sp = 0.9 + (this.level - 1) * 0.2;
    this.drones.forEach((d, k) => {
      const ph = this.droneT * sp + k * Math.PI;
      d.x = 281 + Math.sin(ph) * 150;
      d.y = 640 + Math.sin(ph * 2) * 18;
      d.vx = Math.cos(ph) * 150 * sp;
      d.vy = Math.cos(ph * 2) * 36 * sp;
    });
    if (this.state === 'play') {
      if (this.freezeT > 0) this.freezeT -= dt;
      else this.instability += this.instRate * dt;
      if (this.instability >= 70 && !this.critical) { this.critical = true; this.game.say('reactorCritical'); }
      if (this.instability >= 70) this.game.sfx('alarm');
      if (this.instability >= 100) { this.instability = 100; this.finish(false, 'overload'); }
    }
    for (const n of this.nodes) { n.flash = Math.max(0, n.flash - dt * 2); n.bad = Math.max(0, n.bad - dt * 2); }
    this.seqFlash = Math.max(0, this.seqFlash - dt);
    this.intensity = 0.7 + this.instability / 400;
  }

  hitNode(node, b) {
    if (this.state !== 'play') return;
    const g = this.game;
    const target = this.seq[this.stepIdx];
    if (node.i === target) {
      this.stepIdx++;
      this.chain++;
      node.flash = 1;
      this.instability = Math.max(0, this.instability - 5);
      const mult = Math.min(4, 1 + Math.floor(this.chain / 3));
      g.addScore(2500 * this.stepIdx * mult, node.x, node.y - 30, mult > 1 ? `CHAÎNE ×${mult}` : undefined);
      g.sfx('nodeHit', true, this.stepIdx);
      g.fx.ring(node.x, node.y, ORANGE, 50);
      g.fx.burst(node.x, node.y, ORANGE, 12, 300);
      if (this.stepIdx >= this.seq.length) {
        this.round++;
        g.addScore(10000 * this.round * this.level, C.x, C.y - 70, 'SÉQUENCE');
        g.sfx('reactorSeq');
        if (this.round >= this.rounds.length) { this.finish(true, 'stable'); return; }
        g.say('reactorSeq');
        this._newSequence();
      }
    } else if (!this.seq.slice(0, this.stepIdx).includes(node.i)) {
      node.bad = 1;
      this.chain = 0;
      this.instability = Math.min(100, this.instability + 12);
      g.sfx('nodeHit', false);
      g.fx.flash('#ff4060', 0.12);
      g.say('reactorWrong');
    }
  }

  hitCore(b, imp) {
    if (this.state !== 'play' || imp < 120) return;
    this.instability = Math.max(0, this.instability - 2);
    this.game.addScore(500, C.x, C.y - 50);
  }

  resetCombos() { this.chain = 0; }

  // séquences déjà stabilisées : reprises à la tentative suivante
  keepProgress() { return { round: this.round }; }

  results(success) {
    return {
      rewards: success ? [{ type: 'shield' }, { type: 'bumper' }] : [],
      points: success ? Math.round(this.timeLeft) * 1500 * this.level + Math.round(100 - this.instability) * 400 : this.round * 5000,
    };
  }

  progressText() {
    return `Séquence ${Math.min(this.round + 1, this.rounds.length)}/${this.rounds.length} · nœud ${this.stepIdx}/${this.seq.length} · instabilité ${Math.round(this.instability)} %`;
  }

  drawStatic(g) {
    // anneaux du réacteur peints sur le plateau
    g.strokeStyle = rgba(ORANGE, 0.12); g.lineWidth = 2;
    for (const rr of [70, 128, RING, RING + 30]) { g.beginPath(); g.arc(C.x, C.y, rr, 0, TAU); g.stroke(); }
    g.setLineDash([4, 10]);
    g.beginPath(); g.arc(C.x, C.y, RING - 30, 0, TAU); g.stroke();
    g.setLineDash([]);
    g.strokeStyle = rgba(ORANGE, 0.08);
    for (let k = 0; k < 12; k++) { const a = k * TAU / 12; g.beginPath(); g.moveTo(C.x + Math.cos(a) * 40, C.y + Math.sin(a) * 40); g.lineTo(C.x + Math.cos(a) * 240, C.y + Math.sin(a) * 240); g.stroke(); }
  }

  renderArena(ctx, r) {
    const t = r.time;
    const inst = this.instability / 100;
    const hot = inst > 0.7 ? 0.5 + 0.5 * Math.sin(t * 14) : 0;
    // faisceau vers le prochain nœud
    const next = this.nodes[this.seq[this.stepIdx]];
    if (next && this.state !== 'ended') {
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = rgba(ORANGE, 0.35 + 0.25 * Math.sin(t * 8));
      ctx.lineWidth = 4;
      ctx.setLineDash([10, 8]); ctx.lineDashOffset = -t * 60;
      ctx.beginPath(); ctx.moveTo(C.x, C.y); ctx.lineTo(next.x, next.y); ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalCompositeOperation = 'source-over';
    }
    // nœuds
    for (const n of this.nodes) {
      const order = this.seq.indexOf(n.i, this.stepIdx);
      const done = this.seq.slice(0, this.stepIdx).includes(n.i) && order < 0;
      const isNext = order === this.stepIdx;
      let col = '#55607a';
      if (isNext) col = ORANGE;
      else if (order > 0) col = '#ffd9a0';
      if (done) col = '#5dff8f';
      if (n.bad > 0) col = '#ff4060';
      const pulse = isNext ? 0.6 + 0.4 * Math.sin(t * 9) : 0.4;
      r.glow(n.x, n.y, isNext ? 110 : 70, col, pulse * (isNext ? 0.8 : 0.4) + n.flash * 0.6);
      ctx.fillStyle = '#120b06';
      ctx.beginPath(); ctx.arc(n.x, n.y, NODE_R, 0, TAU); ctx.fill();
      ctx.strokeStyle = col; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(n.x, n.y, NODE_R - 1.5, 0, TAU); ctx.stroke();
      if (order >= this.stepIdx && order >= 0) {
        r.text(String(order - this.stepIdx + 1), n.x, n.y + 1, isNext ? 18 : 14, isNext ? '#ffffff' : '#ffd9a0', 'center', isNext ? 1 : 0.7, true);
      } else if (done) r.text('✓', n.x, n.y + 1, 15, '#5dff8f');
    }
    // cœur du réacteur (instabilité)
    const coreCol = inst > 0.7 ? '#ff4060' : inst > 0.4 ? '#ff8a3d' : ORANGE;
    r.glow(C.x, C.y, 150 + inst * 80, coreCol, 0.4 + 0.3 * hot);
    const grd = ctx.createRadialGradient(C.x, C.y, 4, C.x, C.y, 34);
    grd.addColorStop(0, '#fff6dc'); grd.addColorStop(0.5, coreCol); grd.addColorStop(1, '#3a1606');
    ctx.fillStyle = grd;
    ctx.beginPath(); ctx.arc(C.x, C.y, 34, 0, TAU); ctx.fill();
    // jauge circulaire d'instabilité
    ctx.strokeStyle = 'rgba(255,255,255,0.12)'; ctx.lineWidth = 5;
    ctx.beginPath(); ctx.arc(C.x, C.y, 42, 0, TAU); ctx.stroke();
    ctx.strokeStyle = coreCol;
    ctx.beginPath(); ctx.arc(C.x, C.y, 42, -Math.PI / 2, -Math.PI / 2 + TAU * inst); ctx.stroke();
    r.text(`${Math.round(this.instability)}%`, C.x, C.y + 1, 13, '#1a0a00', 'center', 1, true);
    if (this.freezeT > 0) r.text('STABILISÉ', C.x, C.y + 58, 10, '#7fd7ff', 'center', 0.9);
    // rotors
    for (const p of this.rotors) {
      ctx.lineCap = 'round';
      ctx.strokeStyle = '#2a3550'; ctx.lineWidth = 14;
      ctx.beginPath(); ctx.moveTo(p.ax, p.ay); ctx.lineTo(p.bx, p.by); ctx.stroke();
      ctx.strokeStyle = ORANGE; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(p.ax, p.ay); ctx.lineTo(p.bx, p.by); ctx.stroke();
    }
    // drones stabilisateurs
    for (const d of this.drones) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.5;
      ctx.drawImage(glowSprite('#ffae2a', 64), d.x - 30, d.y - 30, 60, 60);
      ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
      ctx.fillStyle = '#1b2236';
      ctx.beginPath(); ctx.arc(d.x, d.y, 15, 0, TAU); ctx.fill();
      ctx.strokeStyle = '#ffd9a0'; ctx.lineWidth = 2; ctx.stroke();
      ctx.fillStyle = '#ffae2a';
      ctx.fillRect(d.x - 6, d.y - 2, 12, 4);
      ctx.strokeStyle = '#8ea4cf'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(d.x - 15, d.y); ctx.lineTo(d.x - 24, d.y - 6 * Math.sin(t * 30)); ctx.moveTo(d.x + 15, d.y); ctx.lineTo(d.x + 24, d.y + 6 * Math.sin(t * 30)); ctx.stroke();
    }
    // séquence annoncée
    if (this.seqFlash > 0) r.text(`SÉQUENCE ${this.round + 1} : ${this.seq.length} NŒUDS`, C.x, 560, 16, ORANGE, 'center', Math.min(1, this.seqFlash), true);
  }
}
