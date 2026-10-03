import { TABLE_W, TABLE_H, SECTORS } from '../config.js';
import { L, SHOTS, mx } from '../game/tableLayout.js';
import { lerp, mulberry32, rgba, TAU, clamp } from '../util/math.js';
import { glowSprite } from './sprites.js';

const CYAN = '#29e3ff', MAGENTA = '#ff3df2', AMBER = '#ffb52e', VIOLET = '#a070ff';

// ---------------------------------------------------------------- statique

function playfieldPath(g) {
  g.beginPath();
  g.moveTo(20, TABLE_H);
  g.lineTo(20, 300);
  g.arc(300, 300, 280, Math.PI, 2 * Math.PI);
  g.lineTo(580, TABLE_H);
  g.closePath();
}

// Plaque métallique, circuits imprimés et décors propres à chaque secteur.
export function drawPlate(g, kind = 'table') {
  const pal = {
    table: ['#0d1328', '#121a33', CYAN], hangar: ['#0a1426', '#0f1e36', '#29d9ff'],
    reactor: ['#1a1008', '#24160b', '#ffae2a'], defense: ['#081a12', '#0c2419', '#5dff8f'],
    core: ['#1c070e', '#290b16', '#ff3d6e'],
  }[kind] || ['#0d1328', '#121a33', CYAN];
  // caisson
  g.fillStyle = '#070a14';
  g.fillRect(0, 0, TABLE_W, TABLE_H);
  const rnd = mulberry32(kind.length * 97 + 3);
  // rivets du caisson
  g.fillStyle = '#1a2238';
  for (let i = 0; i < 40; i++) { g.beginPath(); g.arc(rnd() * TABLE_W, rnd() * 260, 1.6, 0, TAU); g.fill(); }
  g.save();
  playfieldPath(g);
  g.clip();
  const grd = g.createLinearGradient(0, 0, 0, TABLE_H);
  grd.addColorStop(0, pal[1]); grd.addColorStop(0.55, pal[0]); grd.addColorStop(1, '#070b18');
  g.fillStyle = grd;
  g.fillRect(0, 0, TABLE_W, TABLE_H);
  // grille hexagonale
  g.strokeStyle = rgba(pal[2], 0.045);
  g.lineWidth = 1;
  const hs = 26;
  for (let row = 0; row < TABLE_H / (hs * 1.5) + 1; row++) {
    for (let col = 0; col < TABLE_W / (hs * 1.732) + 1; col++) {
      const cx = col * hs * 1.732 + (row % 2 ? hs * 0.866 : 0), cy = row * hs * 1.5;
      g.beginPath();
      for (let k = 0; k < 6; k++) {
        const a = Math.PI / 6 + k * Math.PI / 3;
        const x = cx + Math.cos(a) * hs * 0.98, y = cy + Math.sin(a) * hs * 0.98;
        if (k === 0) g.moveTo(x, y); else g.lineTo(x, y);
      }
      g.closePath(); g.stroke();
    }
  }
  // pistes de circuit imprimé
  g.lineWidth = 1.4;
  for (let i = 0; i < 46; i++) {
    let x = 30 + rnd() * 520, y = 60 + rnd() * 980;
    g.strokeStyle = rgba(pal[2], 0.06 + rnd() * 0.07);
    g.beginPath(); g.moveTo(x, y);
    const steps = 2 + Math.floor(rnd() * 4);
    let dir = Math.floor(rnd() * 8);
    for (let s = 0; s < steps; s++) {
      const len = 20 + rnd() * 70;
      const a = dir * Math.PI / 4;
      x += Math.cos(a) * len; y += Math.sin(a) * len;
      g.lineTo(x, y);
      dir = (dir + (rnd() < 0.5 ? 1 : 7)) % 8;
    }
    g.stroke();
    g.fillStyle = rgba(pal[2], 0.18);
    g.beginPath(); g.arc(x, y, 2.4, 0, TAU); g.fill();
  }
  // plaques de blindage
  g.strokeStyle = 'rgba(0,0,0,0.35)';
  g.lineWidth = 2;
  for (const y of [330, 690, 880]) { g.beginPath(); g.moveTo(20, y); g.lineTo(580, y); g.stroke(); }
  g.restore();
}

// Murs et guides : rails métalliques à arête lumineuse, reliés en polylignes.
export function drawStaticPrims(g, world, color = CYAN) {
  const groups = {};
  let cur = null;
  for (const p of world.statics.concat(world.dynamics)) {
    if (p.kind !== 'seg') continue;
    const st = p.style;
    if (!st || !['rail', 'guide', 'laneGuide', 'portal', 'gate', 'arenaWall'].includes(st)) { cur = null; continue; }
    if (cur && cur.style === st && Math.abs(cur.lx - p.ax) < 0.01 && Math.abs(cur.ly - p.ay) < 0.01) {
      cur.pts.push(p.bx, p.by); cur.lx = p.bx; cur.ly = p.by;
    } else {
      cur = { style: st, r: p.r, pts: [p.ax, p.ay, p.bx, p.by], lx: p.bx, ly: p.by };
      (groups[st] = groups[st] || []).push(cur);
    }
  }
  const line = (pl) => { g.beginPath(); g.moveTo(pl.pts[0], pl.pts[1]); for (let i = 2; i < pl.pts.length; i += 2) g.lineTo(pl.pts[i], pl.pts[i + 1]); };
  g.lineCap = 'round'; g.lineJoin = 'round';
  const styles = {
    rail: { w: 9, base: '#1b2338', mid: '#3c4b6e', hi: '#8ea4cf', glow: color },
    arenaWall: { w: 9, base: '#1b2338', mid: '#3c4b6e', hi: '#8ea4cf', glow: color },
    guide: { w: 6, base: '#1b2338', mid: '#46587f', hi: '#a9bce0', glow: color },
    laneGuide: { w: 8, base: '#1b2338', mid: '#56688f', hi: '#c6d6f5', glow: color },
    portal: { w: 7, base: '#1d1530', mid: '#4b3d7a', hi: '#c9b8ff', glow: VIOLET },
    gate: { w: 4, base: '#2a3550', mid: '#6d7fa6', hi: '#c6d6f5', glow: AMBER },
  };
  for (const st of Object.keys(groups)) {
    const S = styles[st];
    for (const pl of groups[st]) {
      g.globalCompositeOperation = 'lighter';
      g.strokeStyle = rgba(S.glow, 0.12); g.lineWidth = S.w + 10; line(pl); g.stroke();
      g.globalCompositeOperation = 'source-over';
      g.strokeStyle = S.base; g.lineWidth = S.w; line(pl); g.stroke();
      g.strokeStyle = S.mid; g.lineWidth = S.w * 0.6; line(pl); g.stroke();
      g.strokeStyle = S.hi; g.lineWidth = 1.2; line(pl); g.stroke();
      g.globalCompositeOperation = 'lighter';
      g.strokeStyle = rgba(S.glow, 0.55); g.lineWidth = 1; line(pl); g.stroke();
      g.globalCompositeOperation = 'source-over';
    }
  }
  // poteaux
  for (const p of world.statics) {
    if (p.kind === 'circle' && p.style === 'post') {
      g.fillStyle = '#ffe6f8';
      g.beginPath(); g.arc(p.x, p.y, p.r + 1, 0, TAU); g.fill();
      g.strokeStyle = MAGENTA; g.lineWidth = 1.5; g.stroke();
    }
  }
}

export function drawSling(g, s, color = MAGENTA, flash = 0, base = false) {
  const [A, B, C] = [s.A, s.B, s.C];
  if (base) {
    g.fillStyle = 'rgba(80,20,90,0.55)';
    g.beginPath(); g.moveTo(A[0], A[1]); g.lineTo(B[0], B[1]); g.lineTo(C[0], C[1]); g.closePath(); g.fill();
    g.strokeStyle = '#3b2550'; g.lineWidth = 6; g.lineJoin = 'round'; g.stroke();
    g.strokeStyle = rgba(MAGENTA, 0.5); g.lineWidth = 1.2; g.stroke();
    // motif intérieur
    const cx = (A[0] + B[0] + C[0]) / 3, cy = (A[1] + B[1] + C[1]) / 3;
    g.fillStyle = rgba(MAGENTA, 0.35);
    g.beginPath(); g.arc(cx, cy, 5, 0, TAU); g.fill();
    return;
  }
  // élastique de la face de frappe (dynamique)
  const bulge = flash * 7;
  const nx = (C[1] - A[1]), ny = -(C[0] - A[0]);
  const l = Math.hypot(nx, ny);
  const sx = (A[0] < 281 ? 1 : -1);
  const ox = nx / l * bulge * sx, oy = ny / l * bulge * sx;
  g.lineCap = 'round';
  if (flash > 0.05) {
    g.globalCompositeOperation = 'lighter';
    g.globalAlpha = flash;
    g.drawImage(glowSprite(color, 64), Math.min(A[0], C[0]) - 30, A[1] - 20, Math.abs(C[0] - A[0]) + 60, C[1] - A[1] + 40);
    g.globalCompositeOperation = 'source-over';
    g.globalAlpha = 1;
  }
  g.strokeStyle = '#ffe0f6'; g.lineWidth = 5;
  g.beginPath(); g.moveTo(A[0], A[1]); g.quadraticCurveTo((A[0] + C[0]) / 2 + ox, (A[1] + C[1]) / 2 + oy, C[0], C[1]); g.stroke();
  g.strokeStyle = color; g.lineWidth = 1.5; g.stroke();
}

// Lanceur à ressort + jauge de puissance (plateau et arènes à batteurs).
export function drawPlunger(ctx, r, P, hasBall, t) {
  const x = 561, top = 1054 + P.charge * 34 - (P.kick || 0) * 6;
  ctx.strokeStyle = '#8ea4cf'; ctx.lineWidth = 2;
  ctx.beginPath();
  const n = 7, y0 = top + 6, y1 = 1098;
  for (let i = 0; i <= n * 2; i++) {
    const yy = lerp(y0, y1, i / (n * 2));
    const xx = x + (i % 2 ? 9 : -9);
    i ? ctx.lineTo(xx, yy) : ctx.moveTo(x, yy);
  }
  ctx.stroke();
  ctx.fillStyle = '#c6d6f5';
  ctx.fillRect(x - 15, top, 30, 6);
  if (!hasBall) return;
  const h = 120;
  ctx.fillStyle = 'rgba(10,16,30,0.9)'; ctx.fillRect(586, 1050 - h, 9, h);
  const grd = ctx.createLinearGradient(0, 1050, 0, 1050 - h);
  grd.addColorStop(0, '#29e3ff'); grd.addColorStop(0.6, '#ffd84a'); grd.addColorStop(1, '#ff3d6e');
  ctx.fillStyle = grd; ctx.fillRect(586, 1050 - h * P.charge, 9, h * P.charge);
  ctx.strokeStyle = '#3c4b6e'; ctx.lineWidth = 1; ctx.strokeRect(586, 1050 - h, 9, h);
  if (!P.auto && P.charge === 0) r.text('▲', 561, 1000 + Math.sin(t * 6) * 4, 14, CYAN, 'center', 0.7);
  if (P.auto) r.text('AUTO', 561, 990, 9, AMBER, 'center', 0.9);
}

// ---------------------------------------------------------------- dynamique

export class TableArt {
  constructor(r) {
    this.r = r;
    this.eye = { x: 0, y: 0, blink: 0, nextBlink: 3 };
    this.robots = [{ x: 46, y: 74, arm: 0 }, { x: 556, y: 74, arm: 0 }];
  }

  staticLayer(g, table) {
    drawPlate(g, 'table');
    this._decals(g);
    drawStaticPrims(g, table.world, CYAN);
    drawSling(g, table.R.slingL, MAGENTA, 0, true);
    drawSling(g, table.R.slingR, MAGENTA, 0, true);
    // bases des bumpers
    for (const [x, y] of L.bumpers) {
      g.fillStyle = '#141b2e';
      g.beginPath(); g.arc(x, y, L.bumperR + 7, 0, TAU); g.fill();
      g.strokeStyle = '#3c4b6e'; g.lineWidth = 3; g.stroke();
    }
    // logement du portail
    g.fillStyle = '#05030c';
    g.beginPath();
    g.arc(L.portal.x, L.portal.y, L.portal.r - 2, Math.PI, 0);
    g.lineTo(L.portal.x1 - 2, L.portal.mouthY); g.lineTo(L.portal.x0 + 2, L.portal.mouthY); g.closePath(); g.fill();
  }

  _decals(g) {
    g.save();
    playfieldPath(g); g.clip();
    // tablier (apron)
    const ag = g.createLinearGradient(0, 1000, 0, TABLE_H);
    ag.addColorStop(0, '#0b0f1e'); ag.addColorStop(1, '#151d33');
    g.fillStyle = ag;
    g.beginPath();
    g.moveTo(20, 1100); g.lineTo(20, 1010); g.lineTo(150, 1010); g.lineTo(200, 1040); g.lineTo(362, 1040); g.lineTo(412, 1010); g.lineTo(542, 1010); g.lineTo(542, 1100); g.closePath(); g.fill();
    // bandes de danger près de l'évacuation
    g.save();
    g.beginPath(); g.rect(200, 1052, 162, 10); g.clip();
    for (let x = 190; x < 380; x += 14) { g.fillStyle = '#ffb52e'; g.globalAlpha = 0.35; g.beginPath(); g.moveTo(x, 1062); g.lineTo(x + 7, 1052); g.lineTo(x + 14, 1052); g.lineTo(x + 7, 1062); g.fill(); }
    g.restore();
    g.globalAlpha = 1;
    g.font = '700 15px "Orbitron", "Rajdhani", sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = rgba(CYAN, 0.55);
    g.fillText('LUMEN//NULL', 281, 1085);
    // étiquettes peintes
    g.font = '700 11px "Rajdhani", sans-serif';
    g.fillStyle = rgba('#29d9ff', 0.5);
    g.save(); g.translate(30, 655); g.rotate(-1.17); g.fillText('HANGAR', 0, 0); g.restore();
    g.fillStyle = rgba('#5dff8f', 0.5);
    g.save(); g.translate(532, 655); g.rotate(1.17); g.fillText('DÉFENSE', 0, 0); g.restore();
    g.fillStyle = rgba(CYAN, 0.35);
    g.fillText('LANCEMENT', 561, 940);
    // cercle de la station autour du portail
    g.strokeStyle = rgba(VIOLET, 0.18); g.lineWidth = 2;
    g.setLineDash([6, 8]);
    g.beginPath(); g.arc(281, 440, 78, 0, TAU); g.stroke();
    g.setLineDash([]);
    // flèches des couloirs de retour
    g.fillStyle = rgba(CYAN, 0.2);
    for (const x of [80, 482]) { g.beginPath(); g.moveTo(x - 8, 820); g.lineTo(x + 8, 820); g.lineTo(x, 836); g.fill(); }
    g.restore();
  }

  draw(ctx, table, game) {
    const r = this.r;
    const t = r.time;
    ctx.drawImage(r.layer('table', (g) => this.staticLayer(g, table)), 0, 0, TABLE_W, TABLE_H);
    const lamps = table.shotLamps();
    this._eye(ctx, table, game);
    this._robots(ctx, table, t);
    this._lanes(ctx, table, t);
    this._banks(ctx, table, t);
    this._inserts(ctx, table, lamps, t);
    this._sectorLamps(ctx, table, t);
    this._mission(ctx, game, t);
    this._apron(ctx, table, game, t);
    this._portal(ctx, table, t);
    this._bumpers(ctx, table, t);
    drawSling(ctx, table.R.slingL, MAGENTA, table.slingFlash.L);
    drawSling(ctx, table.R.slingR, MAGENTA, table.slingFlash.R);
    this._plunger(ctx, table, t);
    // billes au niveau du plateau, puis rampes, puis billes sur les rampes
    for (const b of table.world.balls) if (b.layer === 0) r.drawBall(b, 0);
    this._ramps(ctx, table, lamps, t);
    for (const b of table.world.balls) if (b.layer === 1) r.drawBall(b, 0);
    r.drawFlipper(table.R.flipL, CYAN);
    r.drawFlipper(table.R.flipR, CYAN);
  }

  // Œil de LUMEN : suit la bille, cligne, rougit quand NULL parle.
  _eye(ctx, table, game) {
    const r = this.r, E = this.eye;
    const x = 281, y = 64;
    const ball = table.world.balls.find(b => b.state === 'free') || table.world.balls[0];
    let tx = 0, ty = 0;
    if (ball) { const dx = ball.x - x, dy = ball.y - y, d = Math.hypot(dx, dy) || 1; tx = dx / d * 6; ty = dy / d * 4; }
    E.x += (tx - E.x) * 0.15; E.y += (ty - E.y) * 0.15;
    E.nextBlink -= 1 / 60;
    if (E.nextBlink <= 0) { E.blink = 1; E.nextBlink = 2.5 + Math.random() * 4; }
    E.blink = Math.max(0, E.blink - 0.12);
    const msg = game.lumen.current;
    const nullMode = msg && msg.persona === 'null';
    const col = nullMode ? '#ff3d6e' : CYAN;
    const talk = msg ? 0.5 + 0.5 * Math.sin(r.time * 22) : 0;
    r.glow(x, y, 90, col, 0.25 + 0.2 * talk);
    ctx.strokeStyle = rgba(col, 0.7); ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.ellipse(x, y, 24, 13 * (1 - E.blink * 0.9), 0, 0, TAU); ctx.stroke();
    ctx.strokeStyle = rgba(col, 0.25);
    ctx.beginPath(); ctx.arc(x, y, 30, Math.PI * 1.1, Math.PI * 1.9); ctx.stroke();
    ctx.beginPath(); ctx.arc(x, y, 30, Math.PI * 0.1, Math.PI * 0.9); ctx.stroke();
    if (E.blink < 0.6) {
      ctx.fillStyle = col;
      ctx.globalAlpha = 0.9;
      ctx.beginPath(); ctx.arc(x + E.x, y + E.y, 6 + talk * 2, 0, TAU); ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(x + E.x, y + E.y, 2.2, 0, TAU); ctx.fill();
      ctx.globalAlpha = 1;
    }
  }

  // Robots de maintenance dans les coins : réagissent aux événements.
  _robots(ctx, table, t) {
    const mood = table.mood || { kind: 'idle', t: 0 };
    this.robots.forEach((R, i) => {
      const bob = Math.sin(t * 2 + i) * 2;
      const x = R.x, y = R.y + bob;
      const cheer = mood.kind === 'cheer' && mood.t > 0;
      const alarm = mood.kind === 'alarm' && mood.t > 0;
      const eyeCol = alarm ? '#ff4060' : cheer ? '#ffd84a' : CYAN;
      const shake = alarm ? Math.sin(t * 50) * 1.5 : 0;
      ctx.save();
      ctx.translate(x + shake, y);
      // bras
      ctx.strokeStyle = '#6d7fa6'; ctx.lineWidth = 3; ctx.lineCap = 'round';
      for (const s of [-1, 1]) {
        // angle par rapport à l'horizontale (positif = vers le bas)
        const a = cheer ? -1.15 + Math.sin(t * 14 + s) * 0.3 : 0.7 + Math.sin(t * 1.6 + i + s) * 0.25;
        ctx.beginPath(); ctx.moveTo(s * 12, 4);
        ctx.lineTo(s * 12 + s * Math.cos(a) * 12, 4 + Math.sin(a) * 12);
        ctx.stroke();
      }
      // corps
      ctx.fillStyle = '#1d2740';
      ctx.beginPath(); ctx.roundRect ? ctx.roundRect(-12, -2, 24, 22, 5) : ctx.rect(-12, -2, 24, 22); ctx.fill();
      ctx.strokeStyle = '#56688f'; ctx.lineWidth = 1.5; ctx.stroke();
      ctx.fillStyle = rgba(eyeCol, 0.5 + 0.5 * Math.sin(t * 3 + i));
      ctx.fillRect(-6, 6, 4, 3); ctx.fillRect(2, 6, 4, 3);
      // tête
      ctx.fillStyle = '#26314f';
      ctx.beginPath(); ctx.arc(0, -12, 11, 0, TAU); ctx.fill();
      ctx.strokeStyle = '#6d7fa6'; ctx.stroke();
      ctx.fillStyle = eyeCol;
      ctx.globalCompositeOperation = 'lighter';
      ctx.drawImage(glowSprite(eyeCol, 32), -12, -24, 24, 24);
      ctx.globalCompositeOperation = 'source-over';
      if (cheer) { ctx.strokeStyle = eyeCol; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(-4, -11, 3, Math.PI, 0); ctx.arc(4, -11, 3, Math.PI, 0); ctx.stroke(); }
      else ctx.fillRect(-7, -14, 14, 4);
      // antenne
      ctx.strokeStyle = '#6d7fa6'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(0, -23); ctx.lineTo(0, -31); ctx.stroke();
      ctx.fillStyle = (Math.floor(t * 2 + i) % 2) ? '#ff4060' : '#401018';
      ctx.beginPath(); ctx.arc(0, -32, 2.5, 0, TAU); ctx.fill();
      // chenilles
      ctx.fillStyle = '#10172a'; ctx.fillRect(-14, 20, 28, 6);
      ctx.restore();
    });
  }

  _lanes(ctx, table, t) {
    const r = this.r;
    const letters = ['C', 'P', 'U'];
    for (let i = 0; i < 3; i++) {
      const x = L.laneGuidesX[i] + 27, y = 112;
      const lit = table.lanes[i];
      const skill = table.skillArmed && table.shooterBall && table.skillLane === i;
      const col = skill ? '#ffffff' : CYAN;
      const a = lit ? 1 : skill ? 0.6 + 0.4 * Math.sin(t * 10) : 0.18 + table.laneFlash[i] * 0.6;
      if (lit || skill) r.glow(x, y, 56, col, 0.45 * a);
      ctx.fillStyle = lit ? 'rgba(41,227,255,0.25)' : 'rgba(20,30,50,0.6)';
      ctx.beginPath(); ctx.arc(x, y, 12, 0, TAU); ctx.fill();
      ctx.strokeStyle = rgba(col, Math.max(0.35, a)); ctx.lineWidth = 1.5; ctx.stroke();
      r.text(letters[i], x, y + 1, 14, rgba(col, Math.max(0.4, a)), 'center', 1, true);
      if (skill) r.text('SKILL', x, y + 24, 9, '#ffffff', 'center', 0.9);
    }
    if (table.bonusX > 1) r.text(`BONUS ×${table.bonusX}`, 281, 167, 10, rgba(CYAN, 0.6));
  }

  _banks(ctx, table, t) {
    const r = this.r;
    for (const side of ['L', 'R']) {
      const bank = side === 'L' ? table.R.bankL : table.R.bankR;
      const lit = side === 'L' ? table.bankL : table.bankR;
      const sector = side === 'L' ? 'hangar' : 'defense';
      const col = SECTORS[sector].color;
      const st = table.sectorState(sector);
      bank.forEach((p, i) => {
        const cx = (p.ax + p.bx) / 2, cy = (p.ay + p.by) / 2;
        const on = lit[i];
        const fl = table.bankFlash[side][i];
        const pulse = st === 'ready' ? 0.6 + 0.4 * Math.sin(t * 8) : 1;
        if (on || fl > 0) r.glow(cx, cy, 70, col, (on ? 0.5 : 0) * pulse + fl * 0.5);
        ctx.lineCap = 'round';
        ctx.strokeStyle = on ? col : '#2b3a58'; ctx.lineWidth = 8;
        ctx.beginPath(); ctx.moveTo(p.ax, p.ay); ctx.lineTo(p.bx, p.by); ctx.stroke();
        ctx.strokeStyle = on ? '#ffffff' : rgba(col, 0.6); ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(p.ax, p.ay); ctx.lineTo(p.bx, p.by); ctx.stroke();
        // lampe de progression à côté de la cible
        const nx = side === 'L' ? 0.92 : -0.92, ny = 0.387;
        const lx = cx + nx * 18, ly = cy + ny * 18;
        ctx.fillStyle = on ? col : 'rgba(40,55,80,0.8)';
        ctx.beginPath(); ctx.arc(lx, ly, 4, 0, TAU); ctx.fill();
      });
    }
  }

  // Flèches de tir : objectif actif, combo possible, mission, jackpot, attente.
  _inserts(ctx, table, lamps, t) {
    const r = this.r;
    for (const id of Object.keys(SHOTS)) {
      const S = SHOTS[id], l = lamps[id];
      ctx.save();
      ctx.translate(S.x, S.y);
      const blink = l.blink ? 0.55 + 0.45 * Math.sin(t * 7) : 1;
      const col = l.color || '#3a4a6a';
      const on = !!l.main && l.main !== 'prep';
      if (on) r.glow(S.x, S.y, 90, col, 0.45 * blink);
      ctx.rotate(S.a + Math.PI / 2);
      // flèche principale
      ctx.fillStyle = on ? rgba(col, 0.85 * blink) : l.main === 'prep' ? rgba(col, 0.35) : 'rgba(30,42,66,0.85)';
      ctx.strokeStyle = on ? '#ffffff' : rgba(col, 0.6);
      ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(0, -18); ctx.lineTo(13, 4); ctx.lineTo(5, 2); ctx.lineTo(5, 14); ctx.lineTo(-5, 14); ctx.lineTo(-5, 2); ctx.lineTo(-13, 4); ctx.closePath();
      ctx.fill(); ctx.stroke();
      // chevrons de combo (défilent vers le haut)
      if (l.combo) {
        const ph = (t * 3) % 1;
        for (let k = 0; k < 3; k++) {
          const yy = 30 - ((k + ph) / 3) * 26;
          ctx.strokeStyle = rgba('#ffffff', 0.9 - k * 0.25);
          ctx.lineWidth = 2;
          ctx.beginPath(); ctx.moveTo(-8, yy + 5); ctx.lineTo(0, yy - 2); ctx.lineTo(8, yy + 5); ctx.stroke();
        }
      }
      ctx.restore();
      // étiquettes
      let ly = S.y + 30;
      if (l.label) { r.text(l.label, S.x, ly, 10, on ? '#ffffff' : rgba(col, 0.9), 'center', on ? blink : 0.85); ly += 12; }
      if (l.combo) { r.text(`COMBO ×${l.combo}`, S.x, ly, 10, '#ffffff', 'center', 0.6 + 0.4 * Math.sin(t * 10)); ly += 12; }
      if (l.mission) { r.text('◆ MISSION', S.x, ly, 9, '#ffd84a', 'center', 0.85); }
      if (l.hold) r.text('⧗', S.x + 18, S.y - 12, 13, AMBER, 'center', 0.6 + 0.4 * Math.sin(t * 4));
    }
    // délai restant du combo (barre sous le portail)
    if (table.combo.t > 0 && table.combo.count >= 1) {
      const u = table.combo.t / 4;
      ctx.fillStyle = 'rgba(255,255,255,0.15)'; ctx.fillRect(231, 486, 100, 3);
      ctx.fillStyle = '#ffffff'; ctx.fillRect(231, 486, 100 * u, 3);
    }
  }

  _sectorLamps(ctx, table, t) {
    const r = this.r;
    const ids = ['hangar', 'reactor', 'defense', 'core'];
    const icons = { hangar: '▦', reactor: '⚛', defense: '⛨', core: '☠' };
    ids.forEach((id, i) => {
      const x = 281 + (i - 1.5) * 36, y = 560;
      const st = table.sectorState(id);
      const col = SECTORS[id].color;
      const fl = table.sectors[id].flash;
      let a = 0.25, fill = 'rgba(20,28,46,0.85)';
      if (st === 'prep') a = 0.55;
      if (st === 'ready') { a = 0.6 + 0.4 * Math.sin(t * 8); fill = rgba(col, 0.35); }
      if (st === 'hold') { a = 0.5 + 0.3 * Math.sin(t * 3); fill = rgba(AMBER, 0.2); }
      if (st === 'done') { a = 1; fill = rgba(col, 0.6); }
      if (st === 'ready' || st === 'done' || fl > 0) r.glow(x, y, 50, col, 0.3 * a + fl * 0.3);
      ctx.fillStyle = fill;
      ctx.beginPath();
      for (let k = 0; k < 6; k++) { const ang = k * Math.PI / 3 + Math.PI / 6; const px = x + Math.cos(ang) * 14, py = y + Math.sin(ang) * 14; k ? ctx.lineTo(px, py) : ctx.moveTo(px, py); }
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = rgba(st === 'hold' ? AMBER : col, Math.max(0.35, a)); ctx.lineWidth = 1.5; ctx.stroke();
      r.text(st === 'done' ? '✓' : st === 'hold' ? '⧗' : icons[id], x, y + 1, 13, st === 'locked' ? '#4a5a7a' : '#ffffff', 'center', st === 'locked' ? 0.7 : 1);
      // progression (petits segments)
      const p = table.sectorProgress(id);
      if (st === 'prep' || st === 'locked') {
        ctx.fillStyle = rgba(col, 0.8);
        ctx.fillRect(x - 12, y + 17, 24 * p, 2.5);
        ctx.fillStyle = 'rgba(255,255,255,0.12)';
        ctx.fillRect(x - 12 + 24 * p, y + 17, 24 * (1 - p), 2.5);
      }
    });
  }

  _mission(ctx, game, t) {
    const m = game.missions.hud();
    if (!m) return;
    const r = this.r;
    const flash = game.missions.flash > 0 ? 0.5 + 0.5 * Math.sin(t * 16) : 0;
    r.text(`◆ ${m.text}  ${m.progress}/${m.goal}`, 281, 640, 12, '#ffd84a', 'center', 0.55 + flash * 0.45);
    const u = clamp(m.timeLeft / 60, 0, 1);
    ctx.fillStyle = 'rgba(255,216,74,0.12)'; ctx.fillRect(211, 652, 140, 2);
    ctx.fillStyle = 'rgba(255,216,74,0.6)'; ctx.fillRect(211, 652, 140 * u, 2);
  }

  _apron(ctx, table, game, t) {
    const r = this.r, B = game.bonus;
    // sauvegarde de bille entre les batteurs
    const x = 281, y = 1030;
    const saving = B.saveT > 0;
    const blink = saving && B.saveT < 2 ? (Math.sin(t * 20) > 0 ? 1 : 0.2) : 1;
    if (saving) r.glow(x, y, 90, CYAN, 0.5 * blink);
    ctx.strokeStyle = saving ? rgba(CYAN, blink) : 'rgba(60,80,110,0.7)';
    ctx.fillStyle = saving ? rgba(CYAN, 0.25 * blink) : 'rgba(15,20,35,0.8)';
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(x, y - 12); ctx.lineTo(x + 11, y - 7); ctx.lineTo(x + 9, y + 6); ctx.lineTo(x, y + 12); ctx.lineTo(x - 9, y + 6); ctx.lineTo(x - 11, y - 7); ctx.closePath();
    ctx.fill(); ctx.stroke();
    if (saving) r.text('SAUVEGARDE', x, y + 22, 9, CYAN, 'center', blink);
    // bouclier en réserve
    if (B.shield > 0) {
      r.glow(x - 34, y, 40, '#7fd7ff', 0.5);
      r.text('◈', x - 34, y + 1, 16, '#7fd7ff');
    }
    if (B.magnetT > 0) {
      r.text('⊂⊃', 39, 1000, 12, '#5dff8f', 'center', 0.6 + 0.4 * Math.sin(t * 6));
      r.text('⊂⊃', 523, 1000, 12, '#5dff8f', 'center', 0.6 + 0.4 * Math.sin(t * 6));
    }
    // multiplicateur de bonus
    for (let i = 2; i <= 5; i++) {
      const lx = 165 + (i - 2) * 22 + (i > 3 ? 120 : 0), ly = 1068;
      const on = table.bonusX >= i;
      r.text('×' + i, lx, ly, 10, on ? CYAN : '#33405c', 'center', on ? 1 : 0.8);
    }
  }

  _portal(ctx, table, t) {
    const r = this.r, P = table.portal, Lp = L.portal;
    const mode = P.mode;
    const colors = { core: SECTORS.core.color, reactor: SECTORS.reactor.color, multiball: MAGENTA, super: '#ffd84a' };
    const col = colors[mode] || VIOLET;
    const x = Lp.x, y = Lp.y + 4;
    const open = P.open;
    const k = open ? 1 : 0.35 + P.glow * 0.6;
    r.glow(x, y, open ? 130 : 80, col, 0.35 * k);
    // vortex
    ctx.save();
    ctx.translate(x, y);
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 4; i++) {
      ctx.rotate(t * (open ? 3 : 0.8) + i * 1.57);
      ctx.strokeStyle = rgba(col, 0.25 + 0.2 * k);
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(0, 0, 8 + i * 5, 0, 2.2); ctx.stroke();
    }
    ctx.globalCompositeOperation = 'source-over';
    ctx.restore();
    // volet (fermé = hexagone barré)
    if (table.R.shutter.enabled) {
      ctx.strokeStyle = rgba(col, 0.9); ctx.lineWidth = 4;
      ctx.beginPath(); ctx.moveTo(Lp.x0 + 3, Lp.mouthY); ctx.lineTo(Lp.x1 - 3, Lp.mouthY); ctx.stroke();
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(Lp.x0 + 3, Lp.mouthY); ctx.lineTo(Lp.x1 - 3, Lp.mouthY); ctx.stroke();
    } else if (open) {
      ctx.setLineDash([4, 5]);
      ctx.strokeStyle = rgba(col, 0.6 + 0.4 * Math.sin(t * 9)); ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(Lp.x0 + 3, Lp.mouthY); ctx.lineTo(Lp.x1 - 3, Lp.mouthY); ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  _bumpers(ctx, table, t) {
    const r = this.r;
    L.bumpers.forEach(([x, y], i) => {
      const f = table.bumperFlash[i];
      r.glow(x, y, 110, AMBER, 0.18 + f * 0.7);
      // jupe lumineuse
      ctx.strokeStyle = rgba(AMBER, 0.55 + f * 0.45);
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(x, y, L.bumperR + 2 - f * 3, 0, TAU); ctx.stroke();
      // chapeau
      const grd = ctx.createRadialGradient(x - 6, y - 8, 2, x, y, L.bumperR);
      grd.addColorStop(0, f > 0.3 ? '#fff6dc' : '#3b4565');
      grd.addColorStop(1, '#141b2e');
      ctx.fillStyle = grd;
      ctx.beginPath(); ctx.arc(x, y, L.bumperR - 4, 0, TAU); ctx.fill();
      // pales du réacteur (rotation)
      ctx.save(); ctx.translate(x, y); ctx.rotate(t * (1.5 + f * 8) * (i % 2 ? -1 : 1));
      ctx.fillStyle = rgba(AMBER, 0.5 + f * 0.5);
      for (let k = 0; k < 3; k++) {
        ctx.rotate(TAU / 3);
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, 15, -0.35, 0.35); ctx.closePath(); ctx.fill();
      }
      ctx.restore();
      ctx.fillStyle = '#0b0f1c';
      ctx.beginPath(); ctx.arc(x, y, 5, 0, TAU); ctx.fill();
    });
  }

  _plunger(ctx, table, t) {
    drawPlunger(ctx, this.r, table.plunger, !!table.shooterBall, t);
  }

  _ramps(ctx, table, lamps, t) {
    const r = this.r, g = L.ramp;
    for (const side of ['L', 'R']) {
      const m = side === 'L' ? (x) => x : mx;
      const sector = side === 'L' ? 'hangar' : 'defense';
      const col = SECTORS[sector].color;
      const lamp = lamps[side === 'L' ? 'lramp' : 'rramp'];
      const lit = lamp.main === 'mode' || lamp.main === 'jackpot';
      const fl = table.rampFlash[side];
      // canal de verre (montée + virage + descente)
      ctx.save();
      const path = new Path2D();
      path.moveTo(m(g.upX0), g.mouthY);
      path.lineTo(m(g.upX0), g.topY);
      const tcx = m(g.turnCx);
      if (side === 'L') {
        path.arc(tcx, g.topY, g.turnR0, 0, -Math.PI, true);
      } else {
        path.arc(tcx, g.topY, g.turnR0, Math.PI, 0, false);
      }
      path.lineTo(m(g.downX1), g.exitY);
      path.lineTo(m(g.downX0), g.exitY);
      path.lineTo(m(g.downX0), g.topY);
      if (side === 'L') path.arc(tcx, g.topY, g.turnR1, -Math.PI, 0, false);
      else path.arc(tcx, g.topY, g.turnR1, 0, -Math.PI, true);
      path.lineTo(m(g.upX1), g.mouthY);
      path.closePath();
      ctx.fillStyle = rgba(col, 0.07 + fl * 0.12);
      ctx.fill(path);
      ctx.strokeStyle = rgba(col, 0.55 + fl * 0.45);
      ctx.lineWidth = 2;
      ctx.stroke(path);
      // reflet vitré
      ctx.strokeStyle = 'rgba(255,255,255,0.12)';
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(m(g.upX0 + 6), g.mouthY - 10); ctx.lineTo(m(g.upX0 + 6), g.topY + 8); ctx.stroke();
      // chevrons lumineux quand la rampe est allumée
      if (lit) {
        const ccol = lamp.color || col;
        for (let k = 0; k < 4; k++) {
          const u = ((t * 1.4 + k / 4) % 1);
          const yy = lerp(g.mouthY - 20, g.topY + 20, u);
          const xx = m((g.upX0 + g.upX1) / 2);
          ctx.strokeStyle = rgba(ccol, 1 - u * 0.6);
          ctx.lineWidth = 2.5;
          ctx.beginPath(); ctx.moveTo(xx - 9, yy + 6); ctx.lineTo(xx, yy - 3); ctx.lineTo(xx + 9, yy + 6); ctx.stroke();
        }
      }
      ctx.restore();
      // portail du sommet (secteur accessible)
      const st = table.sectorState(sector);
      const rp = side === 'L' ? table.R.rampL : table.R.rampR;
      if (st === 'ready') {
        r.glow(rp.portalX, rp.portalY, 90, col, 0.5 + 0.3 * Math.sin(t * 6));
        ctx.save(); ctx.translate(rp.portalX, rp.portalY);
        ctx.globalCompositeOperation = 'lighter';
        for (let i = 0; i < 3; i++) { ctx.rotate(t * 4 + i * 2.1); ctx.strokeStyle = rgba(col, 0.7); ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, 0, 6 + i * 4, 0, 2.4); ctx.stroke(); }
        ctx.restore();
      } else if (st === 'hold') {
        r.text('⧗', rp.portalX, rp.portalY + 1, 14, AMBER, 'center', 0.7);
      }
    }
  }
}
