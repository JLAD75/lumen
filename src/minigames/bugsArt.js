// Rendu du minijeu CHASSE AUX BUGS (secteur SERVEURS) : salle des serveurs vue de dessus
// (dalles de faux plancher, baies le long du dôme, chemins de câbles), 9 trappes blindées,
// voyants des baies, bugs procéduraux (normal, blindé, doré, ver, petit), éclaboussures,
// jauge de vie de chaque bug, compteur de combo et grandes annonces.
// Géométrie partagée avec la logique (bugs.js).
import { rgba, TAU, mulberry32 } from '../util/math.js';
import { glowSprite } from '../render/sprites.js';
import { chrome, paint, screw, hazard } from '../render/artKit.js';

export const BG = {
  CX: 281,
  // trappes en quinconce : 2, 3 puis 4 par rangée (symétriques autour de l'axe), placées là où
  // passent les tirs des batteurs (carte des trajectoires : chaque trappe sur au moins 30 tirs sur 180)
  TRAPS: [[231, 130], [331, 130], [201, 300], [281, 300], [361, 300], [141, 425], [231, 425], [331, 425], [421, 425]],
  TRAP_R: 26,
};
const { CX, TRAPS, TRAP_R } = BG;
const PINK = '#ff6ab4', GOLD = '#ffd84a', LIME = '#7dff4f', CYAN = '#29e3ff', MAG = '#ff3df2', VIOLET = '#c77dff';
const DISPLAY = '"Orbitron", "Rajdhani", sans-serif';
const FLOOR_BOTTOM = 720;

// découpe du terrain haut (dôme + murs) pour les décors
function fieldPath(g) {
  g.beginPath();
  g.moveTo(20, FLOOR_BOTTOM); g.lineTo(20, 300);
  g.arc(300, 300, 280, Math.PI, TAU);
  g.lineTo(542, FLOOR_BOTTOM); g.closePath();
}

// voyants des baies (calculés une fois) : position, couleur, rythme
let LEDS = null;
function leds() {
  if (LEDS) return LEDS;
  const out = [], rnd = mulberry32(404);
  const cols = [LIME, PINK, CYAN, '#ffb52e'];
  for (const R of RACKS) {
    for (let k = 0; k < R.n; k++) {
      const x = R.x + R.w - 6, y = R.y + 5 + k * 10;
      out.push({ x, y, c: cols[Math.floor(rnd() * cols.length)], f: 1 + rnd() * 5, ph: rnd() * TAU });
    }
  }
  LEDS = out;
  return out;
}
// baies le long des bords du terrain (gauche et droite, sous le dôme)
const RACKS = [
  { x: 28, y: 300, w: 34, n: 18 }, { x: 500, y: 330, w: 34, n: 15 },
  { x: 70, y: 150, w: 30, n: 8 }, { x: 462, y: 150, w: 30, n: 8 },
];

export function drawBugsStatic(g, r, mg) {
  g.save();
  fieldPath(g); g.clip();
  // faux plancher : dalles perforées
  g.fillStyle = '#0d0811'; g.fillRect(0, 0, 600, FLOOR_BOTTOM);
  const tile = 46;
  for (let y = 20; y < FLOOR_BOTTOM; y += tile) {
    for (let x = 20; x < 542; x += tile) {
      g.fillStyle = (Math.floor(x / tile) + Math.floor(y / tile)) % 2 ? '#150d1a' : '#120a16';
      g.fillRect(x + 1, y + 1, tile - 2, tile - 2);
      g.fillStyle = 'rgba(0,0,0,0.5)';
      for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) g.fillRect(x + 8 + i * 9, y + 8 + j * 9, 2, 2);
    }
  }
  // lueur rose venue du dessous du plancher
  const lg = g.createRadialGradient(CX, 250, 30, CX, 250, 330);
  lg.addColorStop(0, rgba(PINK, 0.16)); lg.addColorStop(1, rgba(PINK, 0));
  g.fillStyle = lg; g.fillRect(0, 0, 600, FLOOR_BOTTOM);
  // chemins de câbles entre les trappes
  g.lineCap = 'round';
  for (const [a, b] of [[0, 1], [2, 3], [3, 4], [5, 6], [6, 7], [7, 8], [0, 3], [1, 3], [2, 6], [4, 7]]) {
    const [x0, y0] = TRAPS[a], [x1, y1] = TRAPS[b];
    g.strokeStyle = '#05030a'; g.lineWidth = 9;
    g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
    g.strokeStyle = rgba(PINK, 0.22); g.lineWidth = 1.2; g.setLineDash([4, 5]);
    g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke(); g.setLineDash([]);
  }
  // baies : armoires sombres, tiroirs 1U
  for (const R of RACKS) {
    const h = R.n * 10 + 6;
    g.fillStyle = 'rgba(0,0,0,0.55)'; g.fillRect(R.x + 3, R.y + 4, R.w, h);
    g.fillStyle = '#1b1420'; g.fillRect(R.x, R.y, R.w, h);
    g.strokeStyle = rgba(PINK, 0.5); g.lineWidth = 1; g.strokeRect(R.x + 0.5, R.y + 0.5, R.w - 1, h - 1);
    for (let k = 0; k < R.n; k++) {
      g.fillStyle = k % 2 ? '#241b2b' : '#201826'; g.fillRect(R.x + 3, R.y + 3 + k * 10, R.w - 6, 8);
      g.fillStyle = 'rgba(0,0,0,0.6)';
      for (let i = 0; i < 3; i++) g.fillRect(R.x + 6 + i * 4, R.y + 5 + k * 10, 2, 4);
    }
  }
  // inscriptions au sol
  paint(g, 'SALLE DES SERVEURS', CX, 515, 13, rgba(PINK, 0.55), { font: DISPLAY });
  paint(g, 'NULL // ZONE INFESTÉE', CX, 536, 8, rgba('#ffffff', 0.28), { font: DISPLAY });
  hazard(g, [[150, 552], [412, 552], [412, 560], [150, 560]], PINK, 0.35, 6);
  g.restore();
  // trappes : lunette chromée, trou sombre, boulons, numéro
  TRAPS.forEach(([x, y], i) => {
    g.fillStyle = 'rgba(0,0,0,0.55)'; g.beginPath(); g.arc(x + 3, y + 4, TRAP_R + 3, 0, TAU); g.fill();
    const ring = Array.from({ length: 33 }, (_, k) => [x + Math.cos(k * TAU / 32) * TRAP_R, y + Math.sin(k * TAU / 32) * TRAP_R]);
    g.fillStyle = '#050307'; g.beginPath(); g.arc(x, y, TRAP_R, 0, TAU); g.fill();
    const ig = g.createRadialGradient(x, y, 2, x, y, TRAP_R);
    ig.addColorStop(0, '#000000'); ig.addColorStop(0.7, '#0b0610'); ig.addColorStop(1, rgba(PINK, 0.35));
    g.fillStyle = ig; g.beginPath(); g.arc(x, y, TRAP_R - 3, 0, TAU); g.fill();
    chrome(g, ring, 4.5, { glow: PINK });
    for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2 + Math.PI / 4; screw(g, x + Math.cos(a) * (TRAP_R + 6), y + Math.sin(a) * (TRAP_R + 6), 1.4); }
    paint(g, '#' + String(i + 1).padStart(2, '0'), x, y + TRAP_R + 13, 6, rgba(PINK, 0.7), { font: DISPLAY });
  });
}

// ---------------------------------------------------------------- bugs
// Bug vu de dessus : pattes animées, corps selon l'espèce, tête et antennes.
function drawBug(ctx, x, y, R, kind, t, seed, crack, hurt) {
  const wob = Math.sin(t * 14 + seed) * 0.08;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(wob + Math.sin(seed) * 0.4);
  // glitch : court décalage horizontal de temps en temps
  if (Math.sin(t * 9 + seed * 3) > 0.93) ctx.translate((Math.random() - 0.5) * 5, 0);
  const s = R / 17;
  ctx.scale(s, s);
  const legA = Math.sin(t * 22 + seed) * 0.35;
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  if (kind === 'worm') {
    // ver : anneaux qui ondulent
    for (let k = 3; k >= 0; k--) {
      const px = Math.sin(t * 8 + k * 0.9 + seed) * 4, py = 10 - k * 7;
      ctx.fillStyle = k === 0 ? '#e7b4ff' : k % 2 ? VIOLET : '#a35ee0';
      ctx.beginPath(); ctx.arc(px, py, 9 - k * 0.6, 0, TAU); ctx.fill();
      ctx.strokeStyle = 'rgba(30,0,50,0.7)'; ctx.lineWidth = 1.2; ctx.stroke();
    }
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.arc(-3 + Math.sin(t * 8 + seed) * 4, -12, 2.4, 0, TAU); ctx.arc(3 + Math.sin(t * 8 + seed) * 4, -12, 2.4, 0, TAU); ctx.fill();
    ctx.restore();
    return;
  }
  const col = kind === 'gold' ? GOLD : kind === 'armor' ? '#a9b6cf' : LIME;
  const dark = kind === 'gold' ? '#8a5a00' : kind === 'armor' ? '#3a4458' : '#1f6b12';
  // pattes
  ctx.strokeStyle = kind === 'armor' ? '#7c879e' : dark; ctx.lineWidth = 2.6;
  ctx.beginPath();
  for (let k = 0; k < 3; k++) {
    const yy = -4 + k * 7, a = (k % 2 ? legA : -legA);
    ctx.moveTo(-8, yy); ctx.lineTo(-16, yy - 5 + a * 8);
    ctx.moveTo(8, yy); ctx.lineTo(16, yy - 5 - a * 8);
  }
  ctx.stroke();
  // corps
  const bg = ctx.createLinearGradient(-10, -10, 10, 14);
  bg.addColorStop(0, '#ffffff'); bg.addColorStop(0.25, col); bg.addColorStop(1, dark);
  ctx.fillStyle = hurt > 0 ? '#ffffff' : bg;
  ctx.beginPath(); ctx.ellipse(0, 4, 10, 13, 0, 0, TAU); ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.lineWidth = 1.2; ctx.stroke();
  // élytres / plaques de blindage
  ctx.strokeStyle = kind === 'armor' ? '#e8eef8' : 'rgba(0,0,0,0.45)'; ctx.lineWidth = kind === 'armor' ? 1.6 : 1.1;
  ctx.beginPath(); ctx.moveTo(0, -8); ctx.lineTo(0, 16); ctx.stroke();
  if (kind === 'armor') {
    ctx.beginPath(); ctx.moveTo(-9, 0); ctx.lineTo(9, 0); ctx.moveTo(-8, 9); ctx.lineTo(8, 9); ctx.stroke();
    if (crack) {
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.3;
      ctx.beginPath(); ctx.moveTo(-6, -4); ctx.lineTo(-1, 3); ctx.lineTo(-4, 8); ctx.lineTo(2, 13); ctx.moveTo(-1, 3); ctx.lineTo(5, 1); ctx.stroke();
    }
  }
  // motif « code » sur le dos
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  for (let k = 0; k < 3; k++) ctx.fillRect(-6 + k * 4.5, 6 + (k % 2) * 3, 2.2, 2.2);
  // tête, yeux rouges de NULL, antennes
  ctx.fillStyle = dark; ctx.beginPath(); ctx.arc(0, -11, 6, 0, TAU); ctx.fill();
  ctx.fillStyle = '#ff2050';
  ctx.beginPath(); ctx.arc(-2.4, -12.5, 1.7, 0, TAU); ctx.arc(2.4, -12.5, 1.7, 0, TAU); ctx.fill();
  ctx.strokeStyle = col; ctx.lineWidth = 1.3;
  ctx.beginPath(); ctx.moveTo(-2, -16); ctx.quadraticCurveTo(-5, -22, -9 + legA * 3, -24); ctx.moveTo(2, -16); ctx.quadraticCurveTo(5, -22, 9 - legA * 3, -24); ctx.stroke();
  ctx.restore();
}

export function renderBugs(ctx, r, mg) {
  const t = r.time;
  // voyants des baies
  for (const L of leds()) {
    const on = Math.sin(t * L.f + L.ph) > 0.2;
    ctx.fillStyle = on ? L.c : 'rgba(40,30,50,0.9)';
    ctx.fillRect(L.x, L.y, 3, 3);
  }
  // éclaboussures (sous les bugs)
  for (const S of mg.splats) {
    const u = S.t / 0.9, a = 0.75 * (1 - u);
    const rnd = mulberry32(Math.floor(S.seed * 1000));
    ctx.fillStyle = rgba(S.col, a);
    ctx.beginPath(); ctx.arc(S.x, S.y, S.r * (0.7 + 0.3 * Math.min(1, u * 4)), 0, TAU); ctx.fill();
    for (let k = 0; k < 7; k++) {
      const ang = rnd() * TAU, d = S.r * (1 + rnd() * 0.9) * Math.min(1, u * 5);
      ctx.beginPath(); ctx.arc(S.x + Math.cos(ang) * d, S.y + Math.sin(ang) * d, 2 + rnd() * 4, 0, TAU); ctx.fill();
    }
  }
  for (const P of mg.traps) {
    const B = P.bug;
    if (P.state === 'warn') {
      // la trappe clignote avant la sortie (couleur de l'espèce)
      const col = B.kind === 'gold' ? GOLD : B.kind === 'armor' ? '#cfd8ea' : B.kind === 'worm' || B.kind === 'mini' ? VIOLET : PINK;
      const blink = Math.sin(t * 30) > 0 ? 1 : 0.35;
      ctx.strokeStyle = rgba(col, blink); ctx.lineWidth = 3.5;
      ctx.beginPath(); ctx.arc(P.x, P.y, TRAP_R - 2, 0, TAU); ctx.stroke();
      r.glow(P.x, P.y, 70, col, 0.35 * blink);
      // couvercle qui s'entrouvre
      const k = Math.min(1, P.t / P.dur);
      ctx.fillStyle = rgba(col, 0.25 * k);
      ctx.beginPath(); ctx.arc(P.x, P.y, (TRAP_R - 6) * k, 0, TAU); ctx.fill();
      continue;
    }
    if (P.state === 'up' || P.state === 'down') {
      const R = (B.kind === 'gold' ? 17 : B.kind === 'mini' ? 14 : B.kind === 'armor' ? 21 : 20);
      const sc = P.state === 'up' ? Math.min(1, 0.35 + P.t / 0.12 * 0.65) : Math.max(0, 1 - P.t / 0.2);
      const glowCol = B.kind === 'gold' ? GOLD : B.kind === 'armor' ? '#cfd8ea' : B.kind === 'worm' || B.kind === 'mini' ? VIOLET : LIME;
      r.glow(P.x, P.y, 60, glowCol, 0.4 * sc);
      if (B.kind === 'gold') {
        ctx.save(); ctx.globalCompositeOperation = 'lighter';
        for (let k = 0; k < 4; k++) {
          const a = t * 3 + k * Math.PI / 2;
          ctx.drawImage(glowSprite(GOLD, 32), P.x + Math.cos(a) * 24 - 5, P.y + Math.sin(a) * 24 - 5, 10, 10);
        }
        ctx.restore();
      }
      drawBug(ctx, P.x, P.y, R * 1.2 * sc, B.kind, t, B.seed, B.crack > 0 || B.hp < 2 && B.kind === 'armor', P.flash > 0.6 ? 1 : 0);
      // jauge de vie : arc qui se vide autour de la trappe
      if (P.state === 'up' && B.life > 0) {
        const left = Math.max(0, 1 - P.t / B.life);
        ctx.strokeStyle = left < 0.3 ? (Math.sin(t * 24) > 0 ? '#ff3a3a' : '#ff9a9a') : rgba(PINK, 0.9);
        ctx.lineWidth = 3; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.arc(P.x, P.y, TRAP_R + 1, -Math.PI / 2, -Math.PI / 2 + left * TAU); ctx.stroke();
      }
    }
    if (P.state === 'squash') {
      const u = P.t / 0.35;
      ctx.strokeStyle = rgba('#ffffff', 0.8 * (1 - u)); ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(P.x, P.y, TRAP_R * (0.6 + u), 0, TAU); ctx.stroke();
    }
  }
  // compteur de combo (fenêtre de 2 s qui se vide)
  if (mg.combo >= 2 && mg.comboT > 0) {
    const m = Math.min(5, mg.combo), k = mg.comboT / 3;
    r.text(`COMBO ×${m}`, CX, 615, 22, m >= 5 ? GOLD : PINK, 'center', 0.95, true);
    ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(CX - 60, 631, 120, 6);
    ctx.fillStyle = m >= 5 ? GOLD : PINK; ctx.fillRect(CX - 60, 631, 120 * k, 6);
  }
  // paliers : 5 bugs par palier, rappel discret au sol
  const pal = Math.floor(mg.count / 5), nPal = Math.ceil(mg.target / 5);
  for (let k = 0; k < nPal; k++) {
    const x = CX - (nPal - 1) * 11 + k * 22;
    ctx.fillStyle = k < pal ? PINK : 'rgba(255,106,180,0.18)';
    ctx.beginPath(); ctx.arc(x, 582, 5, 0, TAU); ctx.fill();
  }
}

export function renderBugsTop(ctx, r, mg) {
  const C = mg.callout;
  if (!C) return;
  const u = C.t / C.life;
  const a = u < 0.1 ? u / 0.1 : u > 0.75 ? Math.max(0, (1 - u) / 0.25) : 1;
  const s = 1 + 0.5 * Math.max(0, 1 - C.t * 6);
  const j = Math.sin(r.time * 37) > 0.6 ? 3 : 1.5, size = Math.round(40 * s), y = 690;
  ctx.globalCompositeOperation = 'lighter';
  r.text(C.text, CX - j, y, size, MAG, 'center', a * 0.55, true);
  r.text(C.text, CX + j, y, size, CYAN, 'center', a * 0.55, true);
  ctx.globalCompositeOperation = 'source-over';
  r.text(C.text, CX, y, size, C.color, 'center', a, true);
  if (C.sub) r.text(C.sub, CX, y + 34, 15, '#ffffff', 'center', a * 0.9, true);
}
