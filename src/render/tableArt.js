import { TABLE_W, TABLE_H, SECTORS } from '../config.js';
import { T, SHOTS, WORLD } from '../game/tableLayout.js';
import { lerp, mulberry32, rgba, TAU } from '../util/math.js';
import { glowSprite } from './sprites.js';
import {
  NEON, SHADOW, polyPath, chrome, wireRamp, post, screw, plastic, paint,
  insertBase, insertLit, synthGrid, skyline, circuits, hazard, grain,
} from './artKit.js';

const CYAN = '#29e3ff', MAGENTA = '#ff3df2', AMBER = '#ffb52e', VIOLET = '#a070ff';

// ---------------------------------------------------------------- arènes (moitié basse commune)

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
  // rails et guides chromés (même matière que le plateau principal)
  for (const st of Object.keys(groups)) {
    for (const pl of groups[st]) {
      const pts = [];
      for (let i = 0; i < pl.pts.length; i += 2) pts.push([pl.pts[i], pl.pts[i + 1]]);
      const w = st === 'rail' || st === 'arenaWall' ? 7 : st === 'laneGuide' ? 6 : st === 'gate' ? 3 : 4.5;
      chrome(g, pts, w, { glow: st === 'portal' ? VIOLET : st === 'gate' ? AMBER : color });
    }
  }
  // poteaux
  for (const p of world.statics) {
    if (p.kind === 'circle' && p.style === 'post') post(g, p.x, p.y, p.r);
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

// ---------------------------------------------------------------- plateau principal

const C = NEON;
const DISPLAY = '"Orbitron", "Rajdhani", sans-serif';
const TEXT = '"Rajdhani", "Segoe UI", sans-serif';

// ---------------------------------------------------------------- disposition des inserts
const RING = { x: 281, y: 672, r: 84 };
const RING_ITEMS = [
  { id: 'core', ang: -90, col: C.red, label: 'DUEL NULL' },
  { id: 'defense', ang: -45, col: C.green, label: 'DÉFENSE' },
  { id: 'multiball', ang: 0, col: C.magenta, label: 'MULTIBILLE' },
  { id: 'super', ang: 45, col: C.gold, label: 'SUPER JACKPOT' },
  { id: 'mission', ang: 90, col: C.amber, label: 'MISSION' },
  { id: 'kickback', ang: 135, col: C.lime, label: 'KICKBACK' },
  { id: 'reactor', ang: 180, col: C.orange, label: 'RÉACTEUR' },
  { id: 'hangar', ang: -135, col: C.cyan, label: 'HANGAR' },
];
const ringPos = (it) => [RING.x + Math.cos(it.ang * Math.PI / 180) * RING.r, RING.y + Math.sin(it.ang * Math.PI / 180) * RING.r];

const ARROWS = {
  lorbit: { x: 86, y: 522, rot: -0.42, col: C.violet },
  lramp: { x: 147, y: 530, rot: 0, col: C.cyan },
  portal: { x: 281, y: 510, rot: 0, col: C.violet },
  rramp: { x: 415, y: 530, rot: 0, col: C.green },
  rorbit: { x: 476, y: 522, rot: 0.42, col: C.violet },
};
const BONUSX = [[221, 792], [261, 792], [301, 792], [341, 792]];
const SAVE = { x: 281, y: 1020 };
const LANE_C = [228, 282, 336];

function bankInserts() {
  // le long de la banque gauche (face (62,600)→(20,700)), décalées vers le terrain
  const L = [0.2, 0.5, 0.8].map(t => [62 - 42 * t + 0.922 * 24, 600 + 100 * t + 0.387 * 24]);
  const R = [0.2, 0.5, 0.8].map(t => [500 + 42 * t - 0.922 * 26, 600 + 100 * t + 0.387 * 26]);
  return { L, R };
}
const BANK_INS = bankInserts();

function deckCellInserts() {
  const fx = 281, fy = 98;
  return T.deck.targets.map(([x, y]) => {
    let dx = fx - x, dy = fy - y; const l = Math.hypot(dx, dy); dx /= l; dy /= l;
    return [x + dx * 24, y + dy * 24];
  });
}
const CELL_INS = deckCellInserts();

// ---------------------------------------------------------------- formes de référence
function tablePath(g) {
  const { cx, cy, r } = T.dome;
  g.beginPath();
  g.moveTo(20, 1100);
  g.lineTo(20, cy);
  g.arc(cx, cy, r, Math.PI, 2 * Math.PI);
  g.lineTo(580, 1100);
  g.closePath();
}

// Plancher du pont : calotte du dôme au-dessus des guides, échancrure entre les batteurs.
function deckFloorPath(g, R) {
  const { cx, cy, r } = T.dome;
  const D = T.deck;
  const [lx, ly] = R.deck.guideL[0], eL = R.deck.guideL[1];
  const [rx, ry] = R.deck.guideR[0], eR = R.deck.guideR[1];
  g.beginPath();
  g.moveTo(lx, ly);
  g.arc(cx, cy, r, D.guideAngL * Math.PI / 180, D.guideAngR * Math.PI / 180);
  g.lineTo(rx, ry);
  g.lineTo(eR[0], eR[1]);
  g.lineTo(D.flipR[0] + 12, D.flipR[1] + 6);
  g.lineTo(D.flipR[0] + 4, 124);
  g.lineTo(D.drainX1 + 4, 124);
  g.lineTo(D.drainX1, 112);
  g.lineTo(D.drainX0, 112);
  g.lineTo(D.drainX0 - 4, 124);
  g.lineTo(D.flipL[0] - 4, 124);
  g.lineTo(D.flipL[0] - 12, D.flipL[1] + 6);
  g.lineTo(eL[0], eL[1]);
  g.closePath();
}

export class TableArt {
  constructor(r) {
    this.r = r;
    this.eye = { x: 0, y: 0, blink: 0, nextBlink: 3 };
    this.flashers = { tl: 0, tr: 0, bl: 0, br: 0 };
    this.lastScore = 0;
  }

  // ============================================================ calque statique (plateau)
  staticLayer(g, table) {
    const B = WORLD;
    // caisse du flipper : bois sombre laqué + rails latéraux
    g.fillStyle = '#07050d';
    g.fillRect(B.x0, B.y0, B.w, B.h);
    const side = g.createLinearGradient(0, 0, 20, 0);
    side.addColorStop(0, '#2b2f3c'); side.addColorStop(0.5, '#9aa6bd'); side.addColorStop(1, '#1b1e28');
    g.fillStyle = side; g.fillRect(0, B.y0, 20, B.h);
    const side2 = g.createLinearGradient(580, 0, 600, 0);
    side2.addColorStop(0, '#1b1e28'); side2.addColorStop(0.5, '#9aa6bd'); side2.addColorStop(1, '#2b2f3c');
    g.fillStyle = side2; g.fillRect(580, B.y0, 20, B.h);
    // coins hauts de la caisse : panneaux de métal brossé, vis
    g.save();
    g.beginPath(); g.rect(20, B.y0, 560, 300); tablePath(g); g.clip('evenodd');
    const top = g.createLinearGradient(0, B.y0, 0, 150);
    top.addColorStop(0, '#120c22'); top.addColorStop(1, '#0a0714');
    g.fillStyle = top; g.fillRect(20, B.y0, 560, 300);
    circuits(g, 20, B.y0, 580, 150, 30, C.violet, 11, 0.18);
    g.restore();
    for (const [x, y] of [[34, -136], [566, -136], [34, 40], [566, 40]]) screw(g, x, y, 3);

    // ---- plateau peint
    g.save();
    tablePath(g); g.clip();
    const base = g.createLinearGradient(0, B.y0, 0, 1100);
    base.addColorStop(0, '#1a0f33'); base.addColorStop(0.35, '#120a26'); base.addColorStop(0.7, '#0d0820'); base.addColorStop(1, '#08050f');
    g.fillStyle = base; g.fillRect(0, B.y0, 600, B.h);
    this._art(g, table);
    grain(g, 20, B.y0, 580, 1100, 9000, 5, 0.035);
    g.restore();

    this._insertsBase(g);
    this._labels(g);
    this._guides(g, table);
    this._slingPlastics(g, table);
    this._bumperBases(g);
    this._portalHousing(g);
    this._spinnerBrackets(g);
    this._apron(g);
    // lumière générale (GI) : halos chauds sous les plastiques
    g.globalCompositeOperation = 'lighter';
    for (const [x, y, c, s] of [[118, 830, '#ffd6a0', 120], [444, 830, '#ffd6a0', 120], [62, 740, C.cyan, 70], [500, 740, C.magenta, 70], [281, 360, '#a080ff', 160]]) {
      g.globalAlpha = 0.16; g.drawImage(glowSprite(c, 64), x - s / 2, y - s / 2, s, s);
    }
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
  }

  // Décors peints : grille, mégapole, emblème de la station, portraits, circuits.
  _art(g, table) {
    // couloirs d'orbite : piste plus claire avec chevrons peints
    g.save();
    g.lineWidth = 42;
    g.strokeStyle = 'rgba(120,90,220,0.08)';
    const O = T.orbitInner;
    g.beginPath(); g.moveTo(41, 470); g.lineTo(41, 150); g.arc(300, 150, 250, Math.PI, 0); g.lineTo(521, 470); g.stroke();
    g.restore();
    for (const x of [41, 521]) {
      for (let y = 220; y < 440; y += 34) {
        g.strokeStyle = rgba(C.violet, 0.35); g.lineWidth = 3;
        g.beginPath(); g.moveTo(x - 9, y + 6); g.lineTo(x, y - 3); g.lineTo(x + 9, y + 6); g.stroke();
      }
    }
    // zone centrale haute : ciel nocturne, mégapole, grille synthwave
    g.save();
    g.beginPath(); g.rect(62, T.ceilY, 438, 330); g.clip();
    const sky = g.createLinearGradient(0, T.ceilY, 0, 300);
    sky.addColorStop(0, '#2a0c3e'); sky.addColorStop(0.6, '#3a0f4a'); sky.addColorStop(1, '#14082a');
    g.fillStyle = sky; g.fillRect(62, T.ceilY, 438, 330);
    // soleil néon rayé
    const sx = 281, sy = 238;
    const sun = g.createLinearGradient(0, sy - 60, 0, sy + 30);
    sun.addColorStop(0, '#ffd84a'); sun.addColorStop(0.5, '#ff5aa8'); sun.addColorStop(1, '#8b2bff');
    g.fillStyle = sun; g.globalAlpha = 0.55;
    g.beginPath(); g.arc(sx, sy, 62, Math.PI, 0); g.fill();
    g.globalAlpha = 1;
    g.fillStyle = '#2a0c3e';
    for (let k = 0; k < 6; k++) g.fillRect(sx - 70, sy - 26 + k * 6, 140, 1.5 + k * 0.5);
    skyline(g, 62, 500, 252, 70, 21, [C.cyan, C.magenta, C.amber]);
    synthGrid(g, 40, 522, 252, 450, C.magenta, 0.3);
    g.restore();
    // emblème de la station Cortex-9 sous l'anneau d'inserts
    this._emblem(g);
    // portraits peints : LUMEN (gauche) et NULL (droite)
    this._portrait(g, 134, 676, 'lumen');
    this._portrait(g, 428, 676, 'null');
    // circuits et traînées néon dans la moitié basse
    circuits(g, 30, 720, 530, 1000, 34, C.cyan, 31, 0.1);
    circuits(g, 30, 440, 530, 720, 20, C.magenta, 32, 0.08);
    // zone d'évacuation : bandes de danger
    hazard(g, [[200, 1050], [362, 1050], [362, 1064], [200, 1064]], C.amber, 0.45, 9);
    // couloir de lancement : règle graduée
    for (let y = 400; y < 1040; y += 20) {
      g.fillStyle = rgba(C.cyan, y % 100 === 0 ? 0.4 : 0.15);
      g.fillRect(544, y, y % 100 === 0 ? 10 : 5, 1.5);
    }
    // sous le pont : machinerie sombre
    g.save();
    g.beginPath(); g.arc(O.cx, O.cy, O.r, Math.PI, 0); g.lineTo(O.cx + O.r, T.ceilY); g.lineTo(O.cx - O.r, T.ceilY); g.closePath(); g.clip();
    g.fillStyle = '#0a0616'; g.fillRect(40, -100, 500, 230);
    circuits(g, 60, -80, 500, 120, 26, C.magenta, 41, 0.16);
    g.restore();
  }

  _emblem(g) {
    const { x, y } = RING;
    g.save();
    const halo = g.createRadialGradient(x, y, 20, x, y, 150);
    halo.addColorStop(0, 'rgba(60,30,120,0.55)'); halo.addColorStop(1, 'rgba(10,5,25,0)');
    g.fillStyle = halo; g.beginPath(); g.arc(x, y, 150, 0, TAU); g.fill();
    // anneaux et rayons de la station
    g.strokeStyle = rgba('#b9a6ff', 0.35); g.lineWidth = 2;
    for (const rr of [118, 104, 68, 40]) { g.beginPath(); g.arc(x, y, rr, 0, TAU); g.stroke(); }
    g.strokeStyle = rgba('#b9a6ff', 0.18); g.lineWidth = 8;
    g.beginPath(); g.arc(x, y, 111, 0, TAU); g.stroke();
    for (let k = 0; k < 48; k++) {
      const a = k * TAU / 48;
      g.strokeStyle = rgba('#d8ccff', k % 6 === 0 ? 0.5 : 0.18); g.lineWidth = k % 6 === 0 ? 2 : 1;
      g.beginPath(); g.moveTo(x + Math.cos(a) * 104, y + Math.sin(a) * 104); g.lineTo(x + Math.cos(a) * 118, y + Math.sin(a) * 118); g.stroke();
    }
    for (let k = 0; k < 6; k++) {
      const a = k * TAU / 6 + 0.26;
      g.strokeStyle = rgba('#8b5cff', 0.3); g.lineWidth = 5;
      g.beginPath(); g.moveTo(x + Math.cos(a) * 40, y + Math.sin(a) * 40); g.lineTo(x + Math.cos(a) * 68, y + Math.sin(a) * 68); g.stroke();
    }
    g.restore();
    // logement de l'œil de LUMEN
    g.fillStyle = '#05030b';
    g.beginPath(); g.arc(x, y, 30, 0, TAU); g.fill();
    chrome(g, [[x + 31, y], ...Array.from({ length: 33 }, (_, i) => [x + Math.cos(i * TAU / 32) * 31, y + Math.sin(i * TAU / 32) * 31])], 3, { shadow: false });
  }

  _portrait(g, x, y, who) {
    const col = who === 'lumen' ? C.cyan : C.red;
    g.save();
    g.translate(x, y);
    g.scale(0.86, 0.86);
    const glow = g.createRadialGradient(0, 0, 4, 0, 0, 70);
    glow.addColorStop(0, rgba(col, 0.25)); glow.addColorStop(1, rgba(col, 0));
    g.fillStyle = glow; g.beginPath(); g.arc(0, 0, 70, 0, TAU); g.fill();
    g.lineJoin = 'round';
    if (who === 'lumen') {
      // casque arrondi, visière unique, antennes
      g.fillStyle = '#16233a';
      g.beginPath(); g.ellipse(0, 0, 30, 36, 0, 0, TAU); g.fill();
      g.strokeStyle = rgba(col, 0.8); g.lineWidth = 2; g.stroke();
      g.fillStyle = '#04121c';
      g.beginPath(); g.ellipse(0, -2, 22, 10, 0, 0, TAU); g.fill();
      const v = g.createLinearGradient(-22, 0, 22, 0);
      v.addColorStop(0, rgba(col, 0.2)); v.addColorStop(0.5, rgba(col, 0.95)); v.addColorStop(1, rgba(col, 0.2));
      g.fillStyle = v; g.beginPath(); g.ellipse(0, -2, 18, 4, 0, 0, TAU); g.fill();
      g.strokeStyle = rgba(col, 0.6); g.lineWidth = 1.5;
      g.beginPath(); g.moveTo(-14, 16); g.lineTo(14, 16); g.stroke();
      g.beginPath(); g.moveTo(-30, -4); g.lineTo(-40, -22); g.moveTo(30, -4); g.lineTo(40, -22); g.stroke();
      paint(g, 'LUMEN', 0, 50, 10, col, { font: DISPLAY });
    } else {
      // casque anguleux, fentes rouges, parasites
      g.fillStyle = '#2a0f18';
      g.beginPath(); g.moveTo(-28, -30); g.lineTo(28, -30); g.lineTo(34, 6); g.lineTo(14, 36); g.lineTo(-14, 36); g.lineTo(-34, 6); g.closePath(); g.fill();
      g.strokeStyle = rgba(col, 0.85); g.lineWidth = 2; g.stroke();
      g.fillStyle = col;
      g.beginPath(); g.moveTo(-22, -6); g.lineTo(-6, -1); g.lineTo(-22, 2); g.closePath(); g.fill();
      g.beginPath(); g.moveTo(22, -6); g.lineTo(6, -1); g.lineTo(22, 2); g.closePath(); g.fill();
      g.strokeStyle = rgba(col, 0.5); g.lineWidth = 1.5;
      for (let k = 0; k < 4; k++) { g.beginPath(); g.moveTo(-12 + k * 8, 18); g.lineTo(-12 + k * 8, 28); g.stroke(); }
      const rnd = mulberry32(7);
      for (let k = 0; k < 7; k++) { g.fillStyle = rgba(k % 2 ? C.cyan : col, 0.5); g.fillRect(-40 + rnd() * 70, -36 + rnd() * 70, 8 + rnd() * 18, 1.5); }
      paint(g, 'NULL', 0, 50, 10, col, { font: DISPLAY });
    }
    g.restore();
  }

  _insertsBase(g) {
    for (const id of Object.keys(ARROWS)) {
      const A = ARROWS[id];
      insertBase(g, 'arrow', A.x, A.y, 14, A.col, A.rot);
      const [cx, cy] = this._along(A, -27);
      insertBase(g, 'chevron', cx, cy, 8, C.white, A.rot);
      const [mx2, my2] = this._along(A, 22);
      insertBase(g, 'circle', mx2, my2, 4.5, C.gold, 0);
    }
    for (const it of RING_ITEMS) { const [x, y] = ringPos(it); insertBase(g, 'circle', x, y, 12, it.col); }
    BONUSX.forEach(([x, y]) => insertBase(g, 'triangle', x, y, 11, C.cyan));
    insertBase(g, 'circle', SAVE.x, SAVE.y, 13, C.red);
    for (const x of LANE_C) insertBase(g, 'circle', x, T.laneSensorY, 11, C.cyan);
    BANK_INS.L.forEach(([x, y]) => insertBase(g, 'circle', x, y, 5, SECTORS.hangar.color));
    BANK_INS.R.forEach(([x, y]) => insertBase(g, 'circle', x, y, 5, SECTORS.defense.color));
    insertBase(g, 'arrow', 39, 812, 9, C.lime);
    insertBase(g, 'arrow', 80, 812, 7, C.cyan);
    insertBase(g, 'arrow', 482, 812, 7, C.cyan);
  }

  // point sur l'axe d'une flèche : d < 0 vers la pointe, d > 0 derrière
  _along(A, d) { return [A.x - Math.sin(A.rot) * d, A.y + Math.cos(A.rot) * d]; }

  _labels(g) {
    const lab = (s, x, y, size, col, rot) => paint(g, s, x, y, size, col, { font: DISPLAY, rot, alpha: 0.9 });
    for (const id of Object.keys(ARROWS)) {
      if (id === 'portal') continue;          // le portail porte déjà son nom sur son arche
      const A = ARROWS[id];
      const [x, y] = this._along(A, 36);
      lab(SHOTS[id].label, x, y, 9, rgba(A.col, 0.95));
    }
    // étiquettes de l'anneau : à l'extérieur, sous l'insert pour les positions latérales
    for (const it of RING_ITEMS) {
      const [x, y] = ringPos(it);
      const a = it.ang * Math.PI / 180;
      const lateral = Math.abs(Math.cos(a)) > 0.9;
      const lx = lateral ? x : RING.x + Math.cos(a) * (RING.r + 26);
      const ly = lateral ? y + 21 : RING.y + Math.sin(a) * (RING.r + 22);
      paint(g, it.label, lx, ly, 7.5, rgba(it.col, 0.95), { font: DISPLAY });
    }
    ['×2', '×3', '×4', '×5'].forEach((s, i) => paint(g, s, BONUSX[i][0], BONUSX[i][1] + 15, 8, '#bfefff', { font: DISPLAY }));
    paint(g, 'BONUS', 281, 818, 8, rgba(C.cyan, 0.8), { font: DISPLAY, spacing: 2 });
    lab('ORBITE', 41, 290, 10, rgba(C.violet, 0.85), -Math.PI / 2);
    lab('ORBITE', 521, 290, 10, rgba(C.violet, 0.85), Math.PI / 2);
    lab('HANGAR', 26, 620, 9, rgba(SECTORS.hangar.color, 0.9), -1.17);
    lab('DÉFENSE', 536, 620, 9, rgba(SECTORS.defense.color, 0.9), 1.17);
    lab('LANCEMENT', 561, 900, 9, rgba(C.cyan, 0.6), -Math.PI / 2);
    lab('KICKBACK', 39, 846, 7, rgba(C.lime, 0.9), -Math.PI / 2);
    paint(g, 'C', LANE_C[0], T.laneSensorY + 1, 11, '#d8f7ff', { font: DISPLAY });
    paint(g, 'P', LANE_C[1], T.laneSensorY + 1, 11, '#d8f7ff', { font: DISPLAY });
    paint(g, 'U', LANE_C[2], T.laneSensorY + 1, 11, '#d8f7ff', { font: DISPLAY });
  }

  // Rails et guides chromés à partir des primitives physiques du plateau.
  _guides(g, table) {
    const w = table.world;
    const groups = [];
    let cur = null;
    for (const p of w.statics) {
      if (p.kind !== 'seg' || !(p.mask & 1)) { cur = null; continue; }
      const st = p.style;
      if (!['rail', 'guide', 'orbitInner', 'portal', 'deckFront'].includes(st)) { cur = null; continue; }
      if (cur && cur.style === st && Math.abs(cur.lx - p.ax) < 0.01 && Math.abs(cur.ly - p.ay) < 0.01) {
        cur.pts.push([p.bx, p.by]); cur.lx = p.bx; cur.ly = p.by;
      } else {
        cur = { style: st, pts: [[p.ax, p.ay], [p.bx, p.by]], lx: p.bx, ly: p.by };
        groups.push(cur);
      }
    }
    for (const pl of groups) {
      if (pl.style === 'rail') chrome(g, pl.pts, 7, { glow: C.violet });
      else if (pl.style === 'portal') chrome(g, pl.pts, 5, { glow: C.violet, mid: '#8f7fc0' });
      else if (pl.style === 'deckFront') chrome(g, pl.pts, 5, {});
      else chrome(g, pl.pts, 4.5, { glow: C.cyan });
    }
    // guides de couloir en plastique (C·P·U)
    for (const x of T.lanesX) {
      g.fillStyle = 'rgba(0,0,0,0.45)'; g.fillRect(x - 4 + SHADOW.dx * 0.5, T.laneY0 + SHADOW.dy * 0.5, 8, T.laneY1 - T.laneY0);
      const lg = g.createLinearGradient(x - 4, 0, x + 4, 0);
      lg.addColorStop(0, '#5a4a8a'); lg.addColorStop(0.5, '#e8e0ff'); lg.addColorStop(1, '#4a3a7a');
      g.fillStyle = lg;
      g.beginPath(); g.roundRect ? g.roundRect(x - 4, T.laneY0, 8, T.laneY1 - T.laneY0, 4) : g.rect(x - 4, T.laneY0, 8, T.laneY1 - T.laneY0); g.fill();
    }
    // poteaux caoutchoutés du plateau
    for (const p of w.statics) if (p.kind === 'circle' && p.style === 'post' && (p.mask & 1)) post(g, p.x, p.y, p.r);
    // porte anti-retour du couloir de lancement
    const [ax, ay, bx, by] = T.gate;
    chrome(g, [[ax, ay], [bx, by]], 3, { glow: C.amber });
  }

  _slingPlastics(g, table) {
    for (const s of [table.R.slingL, table.R.slingR]) {
      const [A, B, Cc] = [s.A, s.B, s.C];
      const right = A[0] > 281;
      const pts = [[A[0] + (right ? 4 : -4), A[1] - 10], [B[0] + (right ? 6 : -6), B[1] + 8], [Cc[0] + (right ? -2 : 2), Cc[1] + 10]];
      plastic(g, pts, right ? C.magenta : C.cyan, {
        alpha: 0.85,
        art: (gg, x0, y0, x1, y1) => {
          gg.strokeStyle = 'rgba(255,255,255,0.25)'; gg.lineWidth = 1;
          for (let k = 0; k < 6; k++) { gg.beginPath(); gg.moveTo(x0, y0 + k * 18); gg.lineTo(x1, y0 + k * 18 + 30); gg.stroke(); }
          paint(gg, right ? 'NULL' : 'LUMEN', (x0 + x1) / 2 + (right ? 8 : -8), (y0 + y1) / 2 + 6, 7, '#ffffff', { font: DISPLAY, rot: right ? -1.2 : 1.2 });
        },
        screws: [[A[0] + (right ? 4 : -4), A[1] - 2], [B[0] + (right ? 3 : -3), B[1] + 2]],
      });
      // caoutchoucs blancs des côtés
      g.strokeStyle = '#efeee8'; g.lineWidth = 4; g.lineCap = 'round';
      g.beginPath(); g.moveTo(A[0], A[1]); g.lineTo(B[0], B[1]); g.lineTo(Cc[0], Cc[1]); g.stroke();
      post(g, A[0], A[1], 3.5, false); post(g, B[0], B[1], 3.5, false); post(g, Cc[0], Cc[1], 3.5, false);
    }
  }

  _bumperBases(g) {
    for (const [x, y] of T.bumpers) {
      g.fillStyle = 'rgba(0,0,0,0.5)';
      g.beginPath(); g.arc(x + SHADOW.dx, y + SHADOW.dy, T.bumperR + 8, 0, TAU); g.fill();
      const grd = g.createRadialGradient(x, y, T.bumperR - 4, x, y, T.bumperR + 8);
      grd.addColorStop(0, '#1b1028'); grd.addColorStop(0.7, '#3a2a5a'); grd.addColorStop(1, '#0d0816');
      g.fillStyle = grd; g.beginPath(); g.arc(x, y, T.bumperR + 8, 0, TAU); g.fill();
    }
  }

  _portalHousing(g) {
    const P = T.portal;
    g.fillStyle = '#030208';
    g.beginPath(); g.arc(P.x, P.y, P.r - 2, Math.PI, 0); g.lineTo(P.x1 - 2, P.mouthY); g.lineTo(P.x0 + 2, P.mouthY); g.closePath(); g.fill();
    // plastique en arche au-dessus du portail
    plastic(g, [[P.x0 - 14, P.y + 4], [P.x0 - 14, P.y - 18], [P.x - 20, P.y - P.r - 16], [P.x + 20, P.y - P.r - 16], [P.x1 + 14, P.y - 18], [P.x1 + 14, P.y + 4], [P.x1 + 4, P.y + 4], [P.x1 + 4, P.y - 12], [P.x + 16, P.y - P.r - 4], [P.x - 16, P.y - P.r - 4], [P.x0 - 4, P.y - 12], [P.x0 - 4, P.y + 4]], C.violet, {
      alpha: 0.9, screws: [[P.x0 - 9, P.y - 2], [P.x1 + 9, P.y - 2]],
    });
    paint(g, 'PORTAIL', P.x, P.y - P.r - 10, 6.5, '#e9dcff', { font: DISPLAY });
  }

  _spinnerBrackets(g) {
    for (const [x0, x1] of [[20, 62], [500, 542]]) {
      const y = T.spinnerY;
      chrome(g, [[x0 + 2, y - 4], [x1 - 2, y - 4]], 2.5, {});
      post(g, x0 + 3, y - 4, 2.5, false); post(g, x1 - 3, y - 4, 2.5, false);
    }
  }

  _apron(g) {
    // tablier métallique en bas, cartes d'instructions, logo
    const pts = [[20, 1100], [20, 1006], [150, 1006], [200, 1040], [362, 1040], [412, 1006], [542, 1006], [542, 1100]];
    g.save();
    g.translate(0, -3); g.fillStyle = 'rgba(0,0,0,0.5)'; polyPath(g, pts, true); g.fill();
    g.restore();
    const ag = g.createLinearGradient(0, 1000, 0, 1100);
    ag.addColorStop(0, '#2a2f40'); ag.addColorStop(0.15, '#121521'); ag.addColorStop(1, '#0b0d16');
    g.fillStyle = ag; polyPath(g, pts, true); g.fill();
    chrome(g, pts.slice(1, -1), 3, { shadow: false });
    // cartes
    const card = (x, y, w, h, title, lines, col) => {
      g.fillStyle = '#efe8d8'; g.fillRect(x, y, w, h);
      g.fillStyle = col; g.fillRect(x, y, w, 9);
      g.fillStyle = '#ffffff'; g.font = `800 6.5px ${DISPLAY}`; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(title, x + w / 2, y + 5);
      g.fillStyle = '#1a1626'; g.font = `700 6.2px ${TEXT}`; g.textAlign = 'left';
      lines.forEach((l, i) => g.fillText(l, x + 4, y + 16 + i * 7.4));
    };
    card(30, 1018, 112, 66, 'SECTEURS', ['3 cibles gauches → PONT : HANGAR', '3 tombantes → RAMPE : DÉFENSE', '4 cellules du pont → UPLINK', '3 secteurs → PORTAIL : NULL', 'C·P·U ×2 → MULTIBILLE'], C.violet);
    card(420, 1018, 112, 66, 'COMMANDES', ['← / A : batteurs gauches', '→ / D : batteurs droits', 'ESPACE : charger, lancer', 'ÉCHAP : pause', 'Les 2 niveaux jouent ensemble'], C.magenta);
    paint(g, 'SAUVEGARDE', SAVE.x, 1050, 6.5, '#ffb3c2', { font: DISPLAY, spacing: 1 });
    paint(g, 'LUMEN//NULL', 281, 1076, 15, '#e9f8ff', { font: DISPLAY, spacing: 1 });
    paint(g, 'STATION CORTEX-9', 281, 1092, 6.5, rgba(C.cyan, 0.8), { font: DISPLAY, spacing: 2 });
    for (const [x, y] of [[26, 1012], [536, 1012], [26, 1094], [536, 1094]]) screw(g, x, y, 2.4);
  }

  // ============================================================ calque du pont (deuxième niveau)
  deckLayer(g, table) {
    const R = table.R;
    // ombre portée du pont sur le plateau
    g.save(); g.translate(SHADOW.dx * 1.6, SHADOW.dy * 1.6);
    g.fillStyle = 'rgba(0,0,0,0.5)'; deckFloorPath(g, R); g.fill();
    g.restore();
    // plancher en acrylique fumé
    g.save();
    deckFloorPath(g, R); g.clip();
    const fl = g.createLinearGradient(0, -130, 0, 130);
    fl.addColorStop(0, 'rgba(34,14,62,0.9)'); fl.addColorStop(1, 'rgba(18,8,40,0.82)');
    g.fillStyle = fl; g.fillRect(20, -140, 560, 280);
    // hexagones gravés et lignes néon
    g.strokeStyle = 'rgba(255,43,214,0.12)'; g.lineWidth = 1;
    const hs = 16;
    for (let row = 0; row < 18; row++) {
      for (let col = 0; col < 24; col++) {
        const cx = 20 + col * hs * 1.732 + (row % 2 ? hs * 0.866 : 0), cy = -140 + row * hs * 1.5;
        g.beginPath();
        for (let k = 0; k < 6; k++) { const a = Math.PI / 6 + k * Math.PI / 3; k ? g.lineTo(cx + Math.cos(a) * hs, cy + Math.sin(a) * hs) : g.moveTo(cx + Math.cos(a) * hs, cy + Math.sin(a) * hs); }
        g.closePath(); g.stroke();
      }
    }
    // reflet du vernis
    const sh = g.createLinearGradient(0, -130, 140, 60);
    sh.addColorStop(0, 'rgba(255,255,255,0.10)'); sh.addColorStop(0.5, 'rgba(255,255,255,0)');
    g.fillStyle = sh; g.fillRect(20, -140, 560, 280);
    paint(g, 'PONT SUPÉRIEUR', 281, 40, 10, rgba(C.magenta, 0.75), { font: DISPLAY, spacing: 2 });
    paint(g, 'UPLINK', T.deck.uplink.x, T.deck.uplink.y + 30, 7, rgba(C.amber, 0.9), { font: DISPLAY, spacing: 1 });
    g.restore();
    // bord avant chromé du pont + piliers
    chrome(g, [[R.deck.guideL[1][0], R.deck.guideL[1][1]], [T.deck.flipL[0] - 12, T.deck.flipL[1] + 6], [T.deck.flipL[0] - 4, 124], [T.deck.drainX0 - 4, 124], [T.deck.drainX0, 112], [T.deck.drainX1, 112], [T.deck.drainX1 + 4, 124], [T.deck.flipR[0] + 4, 124], [T.deck.flipR[0] + 12, T.deck.flipR[1] + 6], [R.deck.guideR[1][0], R.deck.guideR[1][1]]], 3, { shadow: false, glow: C.magenta });
    // guides du pont
    chrome(g, R.deck.guideL, 5, { glow: C.magenta });
    chrome(g, R.deck.guideR, 5, { glow: C.magenta });
    for (const p of R.deck.posts) post(g, p.x, p.y, 4);
    // cuvette de l'UPLINK
    const U = T.deck.uplink;
    const cup = g.createRadialGradient(U.x, U.y, 2, U.x, U.y, U.r + 6);
    cup.addColorStop(0, '#000'); cup.addColorStop(0.7, '#1a1028'); cup.addColorStop(1, '#6d6390');
    g.fillStyle = cup; g.beginPath(); g.arc(U.x, U.y, U.r + 6, 0, TAU); g.fill();
    chrome(g, Array.from({ length: 25 }, (_, i) => [U.x + Math.cos(i * TAU / 24) * (U.r + 6), U.y + Math.sin(i * TAU / 24) * (U.r + 6)]), 2.5, { shadow: false, glow: C.amber });
    CELL_INS.forEach(([x, y]) => insertBase(g, 'diamond', x, y, 7, C.orange));
  }

  // ============================================================ calque des rampes
  rampLayer(g, table) {
    // rampe du pont (gauche) : plastique transparent teinté cyan
    const gl = T.rampL;
    this._plasticRamp(g, [[gl.x0, gl.mouthY + 14], [gl.x0, gl.deckY - 6], [gl.x1, gl.deckY - 6], [gl.x1, gl.mouthY + 14]], C.cyan, 'PONT', (gl.x0 + gl.x1) / 2, 330);
    // rampe droite : montée en plastique, virage, descente en fil
    const g2 = T.rampR;
    const up = new Path2D();
    up.moveTo(g2.upX0, g2.mouthY + 14); up.lineTo(g2.upX0, g2.topY);
    up.arc(g2.turnCx, g2.topY, g2.turnR1, Math.PI, 0);
    up.lineTo(g2.downX1, g2.topY + 30); up.lineTo(g2.downX0, g2.topY + 30);
    up.arc(g2.turnCx, g2.topY, g2.turnR0, 0, Math.PI, true);
    up.lineTo(g2.upX1, g2.mouthY + 14); up.closePath();
    g.save(); g.translate(SHADOW.dx * 1.5, SHADOW.dy * 1.5); g.fillStyle = 'rgba(0,0,0,0.35)'; g.fill(up); g.restore();
    g.fillStyle = rgba(C.green, 0.14); g.fill(up);
    g.strokeStyle = rgba('#eafff0', 0.6); g.lineWidth = 2.5; g.stroke(up);
    g.strokeStyle = rgba(C.green, 0.8); g.lineWidth = 1; g.stroke(up);
    paint(g, 'RAMPE', (g2.upX0 + g2.upX1) / 2, 330, 8, '#eafff0', { font: DISPLAY, rot: -Math.PI / 2 });
    // descente en fil (rails chromés)
    const mid = (g2.downX0 + g2.downX1) / 2;
    wireRamp(g, [[mid, g2.topY + 24], [mid, g2.exitY - 10], [mid - 4, g2.exitY + 20]], g2.downX1 - g2.downX0, { glow: C.green });
    // lèvres métalliques des entrées
    for (const [x0, x1] of [[gl.x0, gl.x1], [g2.upX0, g2.upX1]]) {
      chrome(g, [[x0, T.rampL.mouthY + 12], [x1, T.rampL.mouthY + 12]], 4, {});
    }
  }

  // Rampe en plastique transparent : plancher qui s'éclaircit en montant, parois épaisses,
  // nervures, autocollant, supports vissés et lèvre métallique à l'entrée.
  _plasticRamp(g, pts, col, label, lx, ly) {
    const x0 = pts[0][0], x1 = pts[2][0], yb = pts[0][1], yt = pts[1][1];
    g.save(); g.translate(SHADOW.dx * 2, SHADOW.dy * 2); g.fillStyle = 'rgba(0,0,0,0.38)'; polyPath(g, pts, true); g.fill(); g.restore();
    const fl = g.createLinearGradient(0, yb, 0, yt);
    fl.addColorStop(0, rgba(col, 0.1)); fl.addColorStop(1, rgba(col, 0.26));
    g.fillStyle = fl; polyPath(g, pts, true); g.fill();
    // nervures du plancher
    for (let y = yt + 24; y < yb - 10; y += 22) {
      g.strokeStyle = 'rgba(255,255,255,0.09)'; g.lineWidth = 1;
      g.beginPath(); g.moveTo(x0 + 6, y); g.lineTo(x1 - 6, y); g.stroke();
    }
    // parois : tranche épaisse, reflet, liseré néon
    for (const [x, dir] of [[x0, 1], [x1, -1]]) {
      const wg = g.createLinearGradient(x - 3 * dir, 0, x + 6 * dir, 0);
      wg.addColorStop(0, 'rgba(255,255,255,0.55)'); wg.addColorStop(0.4, rgba(col, 0.35)); wg.addColorStop(1, 'rgba(255,255,255,0.04)');
      g.fillStyle = wg; g.fillRect(Math.min(x - 3 * dir, x + 6 * dir), yt, 9, yb - yt);
      g.strokeStyle = rgba(col, 0.95); g.lineWidth = 1.2;
      g.beginPath(); g.moveTo(x, yb); g.lineTo(x, yt); g.stroke();
    }
    // autocollant (flèche + nom)
    const mx = (x0 + x1) / 2;
    g.fillStyle = 'rgba(8,4,20,0.75)';
    g.beginPath(); g.roundRect ? g.roundRect(mx - 12, ly - 34, 24, 68, 5) : g.rect(mx - 12, ly - 34, 24, 68); g.fill();
    g.strokeStyle = rgba(col, 0.8); g.lineWidth = 1; g.stroke();
    paint(g, label, mx, ly + 6, 8, '#e8fbff', { font: DISPLAY, rot: -Math.PI / 2 });
    g.fillStyle = col;
    g.beginPath(); g.moveTo(mx, ly - 30); g.lineTo(mx + 7, ly - 20); g.lineTo(mx - 7, ly - 20); g.closePath(); g.fill();
    // supports vissés
    for (const y of [160, 320]) {
      g.fillStyle = 'rgba(0,0,0,0.4)'; g.fillRect(x0 - 9 + SHADOW.dx, y + SHADOW.dy, x1 - x0 + 18, 6);
      chrome(g, [[x0 - 9, y], [x1 + 9, y]], 3.4, { shadow: false });
      screw(g, x0 - 6, y, 1.8); screw(g, x1 + 6, y, 1.8);
    }
    // reflet général
    g.strokeStyle = 'rgba(255,255,255,0.16)'; g.lineWidth = 2.5;
    g.beginPath(); g.moveTo(x0 + 9, yb - 20); g.lineTo(x0 + 9, yt + 20); g.stroke();
  }

  // ============================================================ rendu par image
  draw(ctx, table, game) {
    const r = this.r;
    const t = r.time;
    r.blitLayer(ctx, r.layer('table', (g) => this.staticLayer(g, table)));
    const lamps = table.shotLamps();
    this._inserts(ctx, table, game, lamps, t);
    this._eye(ctx, table, game);
    this._lanes(ctx, table, t);
    this._bankTargets(ctx, table, t);
    this._drops(ctx, table, t);
    this._spinners(ctx, table);
    this._kickback(ctx, table, t);
    this._portal(ctx, table, t);
    this._bumpers(ctx, table, t);
    drawSling(ctx, table.R.slingL, C.cyan, table.slingFlash.L);
    drawSling(ctx, table.R.slingR, C.magenta, table.slingFlash.R);
    drawPlunger(ctx, r, table.plunger, !!table.shooterBall, t);
    for (const b of table.world.balls) if (b.layer === 0) r.drawBall(b, 0);
    r.drawFlipper(table.R.flipL, C.cyan);
    r.drawFlipper(table.R.flipR, C.magenta);
    // deuxième niveau
    r.blitLayer(ctx, r.layer('tableDeck', (g) => this.deckLayer(g, table)));
    this._deck(ctx, table, t);
    r.drawFlipper(table.R.deck.flipL, C.cyan);
    r.drawFlipper(table.R.deck.flipR, C.magenta);
    for (const b of table.world.balls) if (b.layer === 2) r.drawBall(b, 0);
    // rampes
    r.blitLayer(ctx, r.layer('tableRamps', (g) => this.rampLayer(g, table)));
    this._rampLights(ctx, table, lamps, t);
    for (const b of table.world.balls) if (b.layer === 1) r.drawBall(b, 0);
    this._flashers(ctx, table, game, t);
  }

  _inserts(ctx, table, game, lamps, t) {
    for (const id of Object.keys(ARROWS)) {
      const A = ARROWS[id], l = lamps[id];
      const blink = l.blink ? (Math.sin(t * 9) > -0.2 ? 1 : 0.25) : 1;
      const col = l.color || A.col;
      let k = l.main === 'prep' ? 0.45 : l.main ? blink : 0;
      k = Math.max(k, table.shotFlash[id] || 0);
      if (k > 0) { this.r.glow(A.x, A.y, 70, col, 0.55 * k); insertLit(ctx, 'arrow', A.x, A.y, 14, col, k, A.rot); }
      const [cx, cy] = this._along(A, -27);
      if (l.combo) { const kk = (Math.sin(t * 12) > 0) ? 1 : 0.35; insertLit(ctx, 'chevron', cx, cy, 8, '#ffffff', kk, A.rot); this.r.glow(cx, cy, 34, '#ffffff', 0.35 * kk); }
      const [mx2, my2] = this._along(A, 22);
      if (l.mission) insertLit(ctx, 'circle', mx2, my2, 4.5, C.gold, 0.6 + 0.4 * Math.sin(t * 6));
      if (l.hold) this.r.text('⧗', A.x + 18, A.y - 10, 12, C.amber, 'center', 0.6 + 0.4 * Math.sin(t * 4));
    }
    // anneau d'état
    const st = (id) => table.sectorState(id);
    const ringK = {};
    for (const id of ['hangar', 'reactor', 'defense', 'core']) {
      const s = st(id);
      ringK[id] = s === 'done' ? 1 : s === 'ready' ? (Math.sin(t * 8) > -0.3 ? 1 : 0.2) : s === 'hold' ? 0.35 + 0.25 * Math.sin(t * 3) : s === 'prep' ? 0.25 + 0.15 * Math.sin(t * 2) : 0;
      ringK[id] = Math.max(ringK[id], table.sectors[id].flash > 0 ? (Math.sin(t * 20) > 0 ? 1 : 0) : 0);
    }
    ringK.multiball = table.multiball ? 1 : table.multiballLit ? (Math.sin(t * 8) > -0.3 ? 1 : 0.2) : 0;
    ringK.super = table.superLit ? (Math.sin(t * 10) > 0 ? 1 : 0.2) : 0;
    ringK.kickback = table.kickback.lit ? 1 : 0;
    const m = game.missions.hud();
    ringK.mission = m ? (m.timeLeft < 10 ? (Math.sin(t * 10) > 0 ? 1 : 0.3) : 0.85) : 0;
    for (const it of RING_ITEMS) {
      const k = ringK[it.id] || 0;
      if (k <= 0.01) continue;
      const [x, y] = ringPos(it);
      const col = table.sectors[it.id] && st(it.id) === 'hold' ? C.amber : it.col;
      this.r.glow(x, y, 54, col, 0.45 * k);
      insertLit(ctx, 'circle', x, y, 12, col, k);
    }
    // multiplicateur de bonus
    BONUSX.forEach(([x, y], i) => {
      if (table.bonusX >= i + 2) { this.r.glow(x, y, 40, C.cyan, 0.35); insertLit(ctx, 'triangle', x, y, 11, C.cyan, 1); }
    });
    // sauvegarde (clignote à la fin)
    const B = game.bonus;
    if (B.saveT > 0) {
      const k = B.saveT < 2 ? (Math.sin(t * 20) > 0 ? 1 : 0.2) : 1;
      this.r.glow(SAVE.x, SAVE.y, 70, C.red, 0.5 * k);
      insertLit(ctx, 'circle', SAVE.x, SAVE.y, 13, C.red, k);
    }
    // couloirs de retour
    if (B.magnetT > 0) for (const x of [80, 482]) insertLit(ctx, 'arrow', x, 812, 7, C.green, 0.6 + 0.4 * Math.sin(t * 6));
    // banques
    BANK_INS.L.forEach(([x, y], i) => { const on = table.bankL[i]; const k = on ? 1 : table.bankFlash.L[i]; if (k > 0) { insertLit(ctx, 'circle', x, y, 5, SECTORS.hangar.color, k); this.r.glow(x, y, 26, SECTORS.hangar.color, 0.4 * k); } });
    BANK_INS.R.forEach(([x, y], i) => { const on = table.drops[i]; const k = on ? 1 : table.bankFlash.R[i]; if (k > 0) { insertLit(ctx, 'circle', x, y, 5, SECTORS.defense.color, k); this.r.glow(x, y, 26, SECTORS.defense.color, 0.4 * k); } });
    // délai restant du combo (barre sous le portail)
    if (table.combo.t > 0 && table.combo.count >= 1) {
      const u = table.combo.t / 4;
      ctx.fillStyle = 'rgba(255,255,255,0.15)'; ctx.fillRect(241, 478, 80, 3);
      ctx.fillStyle = '#ffffff'; ctx.fillRect(241, 478, 80 * u, 3);
    }
  }

  // Œil de LUMEN au centre de l'emblème : suit la bille, rougit quand NULL parle.
  _eye(ctx, table, game) {
    const r = this.r, E = this.eye;
    const { x, y } = RING;
    const ball = table.world.balls.find(b => b.state === 'free') || table.world.balls[0];
    let tx = 0, ty = 0;
    if (ball) { const dx = ball.x - x, dy = ball.y - y, d = Math.hypot(dx, dy) || 1; tx = dx / d * 9; ty = dy / d * 7; }
    E.x += (tx - E.x) * 0.15; E.y += (ty - E.y) * 0.15;
    E.nextBlink -= 1 / 60;
    if (E.nextBlink <= 0) { E.blink = 1; E.nextBlink = 2.5 + Math.random() * 4; }
    E.blink = Math.max(0, E.blink - 0.12);
    const msg = game.lumen.current;
    const nullMode = msg && msg.persona === 'null';
    const col = nullMode ? C.red : C.cyan;
    const talk = msg ? 0.5 + 0.5 * Math.sin(r.time * 22) : 0;
    r.glow(x, y, 110, col, 0.3 + 0.25 * talk);
    const iris = ctx.createRadialGradient(x + E.x, y + E.y, 1, x + E.x, y + E.y, 22);
    iris.addColorStop(0, '#ffffff'); iris.addColorStop(0.25, col); iris.addColorStop(1, rgba(col, 0.05));
    ctx.save();
    ctx.beginPath(); ctx.ellipse(x, y, 27, 27 * (1 - E.blink * 0.92), 0, 0, TAU); ctx.clip();
    ctx.fillStyle = '#04060c'; ctx.fillRect(x - 30, y - 30, 60, 60);
    ctx.fillStyle = iris; ctx.beginPath(); ctx.arc(x + E.x, y + E.y, 18 + talk * 3, 0, TAU); ctx.fill();
    ctx.fillStyle = '#02030a'; ctx.beginPath(); ctx.arc(x + E.x * 1.1, y + E.y * 1.1, 5.5, 0, TAU); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.8)'; ctx.beginPath(); ctx.arc(x + E.x - 6, y + E.y - 7, 2.6, 0, TAU); ctx.fill();
    ctx.restore();
  }

  _lanes(ctx, table, t) {
    for (let i = 0; i < 3; i++) {
      const x = LANE_C[i], y = T.laneSensorY;
      const k = table.lanes[i] ? 1 : table.laneFlash[i];
      if (k > 0.02) { this.r.glow(x, y, 46, C.cyan, 0.45 * k); insertLit(ctx, 'circle', x, y, 11, C.cyan, k); this.r.text('CPU'[i], x, y + 1, 11, '#05222c', 'center', k, true); }
    }
  }

  _bankTargets(ctx, table, t) {
    const col = SECTORS.hangar.color;
    const ready = table.sectorState('hangar') === 'ready';
    table.R.bankL.forEach((p, i) => {
      const on = table.bankL[i], fl = table.bankFlash.L[i];
      const cx = (p.ax + p.bx) / 2, cy = (p.ay + p.by) / 2;
      // cible debout : pastille rectangulaire jaune vif (allumée) ou terne
      ctx.save();
      ctx.translate(cx, cy); ctx.rotate(Math.atan2(p.by - p.ay, p.bx - p.ax));
      const len = Math.hypot(p.bx - p.ax, p.by - p.ay);
      ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(-len / 2 + 2, 2, len, 8);
      ctx.fillStyle = on ? '#fff6c8' : '#c9b64a';
      ctx.fillRect(-len / 2, -4, len, 8);
      ctx.fillStyle = on ? col : '#3a3a28'; ctx.fillRect(-len / 2 + 2, -2, len - 4, 4);
      ctx.restore();
      if (on || fl > 0) this.r.glow(cx, cy, 56, col, (on ? 0.35 : 0) * (ready ? 0.6 + 0.4 * Math.sin(t * 8) : 1) + fl * 0.5);
    });
  }

  _drops(ctx, table, t) {
    const col = SECTORS.defense.color;
    table.R.drops.forEach((p, i) => {
      const down = table.drops[i];
      const ang = Math.atan2(p.by - p.ay, p.bx - p.ax);
      const len = Math.hypot(p.bx - p.ax, p.by - p.ay);
      const cx = (p.ax + p.bx) / 2, cy = (p.ay + p.by) / 2;
      ctx.save();
      ctx.translate(cx, cy); ctx.rotate(ang);
      if (down) {
        ctx.fillStyle = '#050308'; ctx.fillRect(-len / 2, -2, len, 4);
        ctx.strokeStyle = rgba(col, 0.4); ctx.lineWidth = 1; ctx.strokeRect(-len / 2, -2, len, 4);
      } else {
        ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(-len / 2 + 3, 1, len, 11);
        const gr = ctx.createLinearGradient(0, -6, 0, 6);
        gr.addColorStop(0, '#e9fff1'); gr.addColorStop(0.5, col); gr.addColorStop(1, '#0d4a26');
        ctx.fillStyle = gr; ctx.fillRect(-len / 2, -5, len, 10);
        ctx.fillStyle = '#062012'; ctx.font = `800 6px ${DISPLAY}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('⛨', 0, 0.5);
      }
      ctx.restore();
      if (table.bankFlash.R[i] > 0) this.r.glow(cx, cy, 50, col, table.bankFlash.R[i] * 0.6);
    });
  }

  _spinners(ctx, table) {
    for (const [side, x0, x1] of [['L', 20, 62], ['R', 500, 542]]) {
      const s = table.spinners[side];
      const h = Math.abs(Math.cos(s.a)) * 9 + 1;
      const y = T.spinnerY + 2;
      const face = Math.cos(s.a) > 0;
      ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.fillRect(x0 + 6 + 3, y + 4, x1 - x0 - 12, h);
      const gr = ctx.createLinearGradient(x0, 0, x1, 0);
      gr.addColorStop(0, '#59647a'); gr.addColorStop(0.5, face ? '#f1f5ff' : '#9aa6bd'); gr.addColorStop(1, '#59647a');
      ctx.fillStyle = gr; ctx.fillRect(x0 + 6, y - h / 2, x1 - x0 - 12, h);
      if (face && h > 6) { ctx.fillStyle = C.violet; ctx.fillRect(x0 + 10, y - h / 2 + 2, x1 - x0 - 20, Math.max(1, h - 4)); }
      if (s.w > 4) this.r.glow((x0 + x1) / 2, y, 40, C.violet, Math.min(0.5, s.w / 60));
    }
  }

  _kickback(ctx, table, t) {
    const K = T.kickback, k = table.kickback;
    if (k.lit) { insertLit(ctx, 'arrow', 39, 812, 9, C.lime, 0.75 + 0.25 * Math.sin(t * 4)); this.r.glow(39, 812, 34, C.lime, 0.3); }
    // piston du kickback
    ctx.fillStyle = '#2b3242'; ctx.fillRect(K.x - 9, K.y - 4 - k.flash * 14, 18, 8);
    ctx.fillStyle = '#c9d4ea'; ctx.fillRect(K.x - 9, K.y - 4 - k.flash * 14, 18, 2);
    if (k.flash > 0) this.r.glow(K.x, K.y - 20, 60, C.lime, k.flash * 0.6);
  }

  _portal(ctx, table, t) {
    const r = this.r, P = table.portal, Lp = T.portal;
    const mode = P.mode;
    const colors = { core: SECTORS.core.color, multiball: C.magenta, super: C.gold };
    const col = colors[mode] || C.violet;
    const x = Lp.x, y = Lp.y + 4;
    const open = P.open;
    const k = open ? 1 : 0.35 + P.glow * 0.6;
    r.glow(x, y, open ? 130 : 80, col, 0.35 * k);
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
    if (table.R.shutter.enabled) {
      ctx.strokeStyle = rgba(col, 0.9); ctx.lineWidth = 5;
      ctx.beginPath(); ctx.moveTo(Lp.x0 + 3, Lp.mouthY); ctx.lineTo(Lp.x1 - 3, Lp.mouthY); ctx.stroke();
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(Lp.x0 + 3, Lp.mouthY); ctx.lineTo(Lp.x1 - 3, Lp.mouthY); ctx.stroke();
    } else if (open) {
      ctx.setLineDash([4, 5]);
      ctx.strokeStyle = rgba(col, 0.6 + 0.4 * Math.sin(t * 9)); ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(Lp.x0 + 3, Lp.mouthY); ctx.lineTo(Lp.x1 - 3, Lp.mouthY); ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  // Pop bumpers : jupe, anneau chromé, chapeau translucide qui s'illumine au contact.
  _bumpers(ctx, table, t) {
    const r = this.r;
    const cols = [C.cyan, C.magenta, C.amber];
    T.bumpers.forEach(([x, y], i) => {
      const f = table.bumperFlash[i];
      const col = cols[i];
      r.glow(x, y, 100, col, 0.2 + f * 0.7);
      const R0 = T.bumperR;
      // anneau de frappe (descend au contact)
      ctx.strokeStyle = '#d6dded'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(x, y, R0 + 1 - f * 2, 0, TAU); ctx.stroke();
      // chapeau
      const cap = ctx.createRadialGradient(x - 7, y - 9, 2, x, y, R0 - 3);
      cap.addColorStop(0, f > 0.25 ? '#ffffff' : rgba(col, 0.95));
      cap.addColorStop(0.55, rgba(col, 0.75 + f * 0.25));
      cap.addColorStop(1, '#14081f');
      ctx.fillStyle = cap; ctx.beginPath(); ctx.arc(x, y, R0 - 4, 0, TAU); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 1; ctx.stroke();
      // motif « réacteur » sérigraphié
      ctx.save(); ctx.translate(x, y); ctx.rotate(t * (0.6 + f * 6) * (i % 2 ? -1 : 1));
      ctx.fillStyle = rgba('#ffffff', 0.35 + f * 0.5);
      for (let k = 0; k < 3; k++) { ctx.rotate(TAU / 3); ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, 13, -0.32, 0.32); ctx.closePath(); ctx.fill(); }
      ctx.restore();
      ctx.fillStyle = '#0b0712'; ctx.beginPath(); ctx.arc(x, y, 4.5, 0, TAU); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.55)'; ctx.beginPath(); ctx.ellipse(x - 8, y - 10, 7, 3.5, -0.6, 0, TAU); ctx.fill();
    });
  }

  _deck(ctx, table, t) {
    const r = this.r, D = T.deck, R = table.R;
    // cellules (cibles du pont)
    R.deck.targets.forEach((p, i) => {
      const on = table.deckTargets[i], fl = table.deckFlash[i];
      const skill = table.skillArmed && i === table.skillTarget && (table.shooterBall || table.time - table.lastLaunchT < 9);
      const ang = Math.atan2(p.by - p.ay, p.bx - p.ax);
      const len = Math.hypot(p.bx - p.ax, p.by - p.ay);
      const cx = (p.ax + p.bx) / 2, cy = (p.ay + p.by) / 2;
      ctx.save(); ctx.translate(cx, cy); ctx.rotate(ang);
      ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(-len / 2 + 2, 2, len, 9);
      const gr = ctx.createLinearGradient(0, -5, 0, 5);
      const col = on ? C.orange : '#7a4a1a';
      gr.addColorStop(0, on ? '#fff0d0' : '#c08850'); gr.addColorStop(1, col);
      ctx.fillStyle = gr; ctx.fillRect(-len / 2, -5, len, 10);
      ctx.restore();
      const [ix, iy] = CELL_INS[i];
      const k = on ? 1 : skill ? (Math.sin(t * 12) > 0 ? 1 : 0.2) : fl;
      if (k > 0.02) { insertLit(ctx, 'diamond', ix, iy, 7, skill && !on ? '#ffffff' : C.orange, k); r.glow(ix, iy, 36, skill && !on ? '#ffffff' : C.orange, 0.4 * k); }
      if (fl > 0) r.glow(cx, cy, 60, C.orange, fl * 0.5);
    });
    // UPLINK : anneau lumineux, plus vif quand le réacteur est accessible
    const U = D.uplink;
    const ready = table.sectorState('reactor') === 'ready';
    const k = Math.max(table.uplink.flash, ready ? 0.6 + 0.4 * Math.sin(t * 7) : 0.25);
    r.glow(U.x, U.y, 70, C.amber, 0.45 * k);
    ctx.strokeStyle = rgba(C.amber, 0.5 + 0.5 * k); ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(U.x, U.y, U.r + 2, t * 2, t * 2 + 4.2); ctx.stroke();
    if (table.uplink.ball) r.glow(U.x, U.y, 40, '#ffffff', 0.5);
    if (table.deckFlashAll > 0) r.glow(281, 20, 260, C.magenta, table.deckFlashAll * 0.25);
  }

  _rampLights(ctx, table, lamps, t) {
    for (const side of ['L', 'R']) {
      const id = side === 'L' ? 'lramp' : 'rramp';
      const lamp = lamps[id];
      const lit = lamp.main === 'mode' || lamp.main === 'jackpot' || lamp.main === 'prep';
      const fl = table.rampFlash[side];
      const x = side === 'L' ? (T.rampL.x0 + T.rampL.x1) / 2 : (T.rampR.upX0 + T.rampR.upX1) / 2;
      const top = side === 'L' ? T.rampL.deckY + 30 : T.rampR.topY + 10;
      if (fl > 0) this.r.glow(x, (top + 470) / 2, 120, side === 'L' ? C.cyan : C.green, fl * 0.35);
      if (!lit) continue;
      const col = lamp.color || C.cyan;
      for (let k = 0; k < 5; k++) {
        const u = ((t * 1.3 + k / 5) % 1);
        const yy = lerp(T.rampL.mouthY - 10, top, u);
        ctx.strokeStyle = rgba(col, 1 - u * 0.7);
        ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(x - 10, yy + 7); ctx.lineTo(x, yy - 3); ctx.lineTo(x + 10, yy + 7); ctx.stroke();
      }
      // portail de secteur au sommet
      const sector = side === 'L' ? 'hangar' : 'defense';
      if (table.sectorState(sector) === 'ready') {
        const rp = side === 'L' ? table.R.rampL : table.R.rampR;
        this.r.glow(rp.portalX, rp.portalY, 90, SECTORS[sector].color, 0.5 + 0.3 * Math.sin(t * 6));
      }
    }
  }

  // Flashers : dômes en haut du plateau, déclenchés par les grands événements.
  _flashers(ctx, table, game, t) {
    const F = this.flashers;
    for (const k in F) F[k] = Math.max(0, F[k] - 1 / 30);
    if (game.score - this.lastScore >= 20000) { F.tl = F.tr = 1; }
    if (table.rampFlash.L > 0.95) F.tl = 1;
    if (table.rampFlash.R > 0.95) F.tr = 1;
    this.lastScore = game.score;
    const spots = [['tl', 44, -30, C.magenta], ['tr', 556, -30, C.cyan]];
    for (const [k, x, y, col] of spots) {
      const v = F[k];
      const dome = ctx.createRadialGradient(x - 4, y - 5, 1, x, y, 13);
      dome.addColorStop(0, v > 0.1 ? '#ffffff' : rgba(col, 0.7)); dome.addColorStop(1, rgba(col, 0.25 + v * 0.6));
      ctx.fillStyle = dome; ctx.beginPath(); ctx.arc(x, y, 12, 0, TAU); ctx.fill();
      ctx.strokeStyle = '#9aa6bd'; ctx.lineWidth = 2; ctx.stroke();
      if (v > 0.02) { this.r.glow(x, y, 260 * v + 40, col, 0.6 * v); }
    }
  }
}
