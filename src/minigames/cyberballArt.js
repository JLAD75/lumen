// Rendu du minijeu CYBERBALL (secteur ARÈNE) : stade néon, tribunes et public, écran géant,
// projecteurs, panneaux publicitaires, pelouse et tracés, cage et filet, gardien drone,
// défenseurs, lanceurs CORNER, lampes de buts, feux d'artifice.
// Géométrie partagée avec la logique (cyberball.js).
import { rgba, TAU, clamp, mulberry32 } from '../util/math.js';
import { glowSprite } from '../render/sprites.js';
import { chrome, post, insertBase, insertLit, paint, hazard, screw, circuits } from '../render/artKit.js';

export const CB = {
  CX: 281,                      // axe du terrain
  CEIL_Y: 125,                  // bord inférieur de la tribune (plafond du terrain)
  GOAL_Y: 212,                  // ligne de but
  POST_L: 188, POST_R: 374,     // montants
  POST_RAD: 9,
  KEEPER_Y: 230,                // rail du gardien (devant la ligne)
  KEEPER_R: 8,
  DEF_R: 16,
  KICK: { x: 281, y: 560 },     // point d'engagement (rond central)
  LUC: 18,                      // largeur de la zone « lucarne » contre chaque montant
  WING: { dx: 46, dy: 48 },     // ailes de la cage : rabattent les tirs presque cadrés
  CORNERS: [{ x: 52, y: 360 }, { x: 510, y: 360 }],   // lanceurs CORNER (couloirs latéraux)
  CORNER_R: 36,
};

const { CX, CEIL_Y, GOAL_Y, POST_L, POST_R, POST_RAD, KEEPER_Y, KEEPER_R, DEF_R, KICK, WING, CORNERS, CORNER_R } = CB;
const BLUE = '#4d7dff', CYAN = '#29e3ff', RED = '#ff3d6e', GOLD = '#ffd84a', LIME = '#5dff8f', MAG = '#ff3df2';
const LINE = '#bfe9ff';
const JUMBO = { x0: 170, x1: 392, y0: 56, y1: 108 };
const ADS = { x0: 96, x1: 504, y0: 112, y1: 123 };
const TOWERS = [{ x: 38, y: 66, side: -1 }, { x: 562, y: 66, side: 1 }];
const FIELD_BOTTOM = 745;
const LAMP_Y = 690;
const ADS_TEXT = '  LUMEN ENERGY ◆ CORTEX-9 ARENA ◆ NÉO-LIGUE CYBERBALL ◆ NULL = 0 ◆ STATION CORTEX-9 ◆ BOISSON IONIQUE ZAP ◆ ';
const TIPS = ['TIR PUISSANT = GARDIEN K.O.', 'VISEZ LES COINS : LUCARNE ×2', 'COULOIRS ALLUMÉS = CORNER', 'LE GARDIEN LIT VOS TRAJECTOIRES'];

// ---------------------------------------------------------------- ressources paresseuses
let SEATS = null, LED = null, BEAM = null;

// sièges du public : rangées concentriques du dôme, au-dessus du terrain, hors écran géant
function seats() {
  if (SEATS) return SEATS;
  const out = [], rnd = mulberry32(2077);
  for (let row = 0; row < 10; row++) {
    const R = 271 - row * 9.5;
    const step = 8.6 / R;
    for (let a = -Math.PI + 0.04 + (row % 2) * step / 2; a < -0.04; a += step) {
      const x = 300 + Math.cos(a) * R + (rnd() - 0.5) * 2, y = 300 + Math.sin(a) * R;
      if (y > 107 || x < 28 || x > 572) continue;
      if (x > JUMBO.x0 - 7 && x < JUMBO.x1 + 7 && y > JUMBO.y0 - 9 && y < JUMBO.y1 + 10) continue;
      out.push({ x, y, s: 0.85 + rnd() * 0.3, ph: rnd() * TAU, light: rnd() < 0.3 ? Math.floor(rnd() * 3) : -1 });
    }
  }
  SEATS = out;
  return out;
}

// trame de points de l'écran géant
function ledPattern(ctx) {
  if (LED) return LED;
  const c = document.createElement('canvas');
  c.width = c.height = 3;
  const g = c.getContext('2d');
  g.fillStyle = 'rgba(0,0,0,0.55)';
  g.fillRect(2, 0, 1, 3); g.fillRect(0, 2, 3, 1);
  LED = ctx.createPattern(c, 'repeat');
  return LED;
}

// faisceau de projecteur (cône doux, vers le bas du sprite)
function beamSprite() {
  if (BEAM) return BEAM;
  const c = document.createElement('canvas');
  c.width = 128; c.height = 512;
  const g = c.getContext('2d');
  for (let k = 0; k < 7; k++) {
    const w = 64 * (1 - k * 0.13);
    const grd = g.createLinearGradient(0, 0, 0, 512);
    grd.addColorStop(0, 'rgba(255,255,255,0.22)'); grd.addColorStop(0.5, 'rgba(255,255,255,0.08)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd;
    g.beginPath(); g.moveTo(64 - 4, 0); g.lineTo(64 + 4, 0); g.lineTo(64 + w, 512); g.lineTo(64 - w, 512); g.closePath(); g.fill();
  }
  BEAM = c;
  return c;
}

// contour du terrain (sous la tribune)
function fieldPath(g) {
  g.beginPath();
  g.moveTo(20, FIELD_BOTTOM); g.lineTo(20, 300);
  g.arc(300, 300, 280, Math.PI, TAU);
  g.lineTo(580, FIELD_BOTTOM); g.closePath();
}

// contour de la tribune (dôme au-dessus du plafond)
function standPath(g) {
  const dx = Math.sqrt(280 * 280 - (300 - CEIL_Y) ** 2);
  const a0 = Math.atan2(CEIL_Y - 300, -dx), a1 = Math.atan2(CEIL_Y - 300, dx);
  g.beginPath();
  g.arc(300, 300, 280, a0, a1);
  g.closePath();
}

// ================================================================ calque statique
export function drawCyberballStatic(g, r, mg) {
  drawStands(g);
  drawTowersBase(g);
  drawJumboFrame(g);
  drawPitch(g, mg);
  drawGoalBase(g);
  drawCornersBase(g);
  drawLampsBase(g, mg);
}

function drawStands(g) {
  g.save();
  standPath(g);
  g.clip();
  const grd = g.createLinearGradient(0, 20, 0, CEIL_Y);
  grd.addColorStop(0, '#120c30'); grd.addColorStop(0.55, '#1c1a55'); grd.addColorStop(1, '#2a1f66');
  g.fillStyle = grd;
  g.fillRect(0, 0, 600, CEIL_Y + 2);
  // gradins : arcs concentriques et allées rayonnantes
  for (let row = 0; row < 10; row++) {
    const R = 276 - row * 11.5;
    g.strokeStyle = row % 2 ? 'rgba(77,125,255,0.10)' : 'rgba(77,125,255,0.18)';
    g.lineWidth = 1.2;
    g.beginPath(); g.arc(300, 300, R, Math.PI, TAU); g.stroke();
  }
  g.strokeStyle = 'rgba(0,0,0,0.6)'; g.lineWidth = 3;
  for (let k = 1; k < 14; k++) {
    const a = Math.PI + k * Math.PI / 14;
    g.beginPath(); g.moveTo(300 + Math.cos(a) * 180, 300 + Math.sin(a) * 180); g.lineTo(300 + Math.cos(a) * 280, 300 + Math.sin(a) * 280); g.stroke();
  }
  // lueur des projecteurs sur les premiers rangs
  const lg = g.createLinearGradient(0, 50, 0, CEIL_Y);
  lg.addColorStop(0, 'rgba(255,61,242,0)'); lg.addColorStop(1, 'rgba(255,61,242,0.22)');
  g.fillStyle = lg; g.fillRect(0, 50, 600, CEIL_Y - 50);
  g.restore();
  // muret de tribune (bord avant) et bande de panneaux
  g.fillStyle = '#05060c';
  g.fillRect(ADS.x0 - 4, ADS.y0 - 2, ADS.x1 - ADS.x0 + 8, ADS.y1 - ADS.y0 + 4);
  g.strokeStyle = rgba(BLUE, 0.6); g.lineWidth = 1;
  g.strokeRect(ADS.x0 - 3.5, ADS.y0 - 1.5, ADS.x1 - ADS.x0 + 7, ADS.y1 - ADS.y0 + 3);
}

function drawTowersBase(g) {
  for (const T of TOWERS) {
    const x = T.x, y = T.y;
    // mât en treillis vers le bord du caisson
    g.strokeStyle = '#2a3350'; g.lineWidth = 2;
    g.beginPath();
    g.moveTo(x - 5, y + 18); g.lineTo(x - 3 * T.side - 5, 150); g.moveTo(x + 5, y + 18); g.lineTo(x - 3 * T.side + 5, 150);
    for (let k = 0; k < 6; k++) { const yy = y + 22 + k * 21; g.moveTo(x - 5, yy); g.lineTo(x + 5, yy + 10); }
    g.stroke();
    // panneau de lampes (orienté vers le terrain)
    g.save();
    g.translate(x, y);
    g.rotate(T.side * 0.35);
    g.fillStyle = '#0b0f1e'; g.fillRect(-22, -14, 44, 28);
    g.strokeStyle = '#7d8aa3'; g.lineWidth = 1.5; g.strokeRect(-22, -14, 44, 28);
    for (let i = 0; i < 4; i++) for (let j = 0; j < 2; j++) {
      g.fillStyle = '#1c2236'; g.beginPath(); g.arc(-15 + i * 10, -6 + j * 12, 4, 0, TAU); g.fill();
    }
    g.restore();
  }
}

function drawJumboFrame(g) {
  const J = JUMBO;
  // câbles de suspension vers le dôme
  g.strokeStyle = 'rgba(160,180,220,0.35)'; g.lineWidth = 1;
  g.beginPath();
  g.moveTo(J.x0 + 20, J.y0); g.lineTo(J.x0 + 6, 32); g.moveTo(J.x1 - 20, J.y0); g.lineTo(J.x1 - 6, 32);
  g.moveTo(CX, J.y0); g.lineTo(CX, 22);
  g.stroke();
  // caisson chromé
  g.fillStyle = 'rgba(0,0,0,0.5)';
  g.fillRect(J.x0 - 3, J.y0 + 2, J.x1 - J.x0 + 12, J.y1 - J.y0 + 10);
  g.fillStyle = '#151a2a';
  g.fillRect(J.x0 - 6, J.y0 - 6, J.x1 - J.x0 + 12, J.y1 - J.y0 + 12);
  g.strokeStyle = '#8f9bb3'; g.lineWidth = 1.5;
  g.strokeRect(J.x0 - 6, J.y0 - 6, J.x1 - J.x0 + 12, J.y1 - J.y0 + 12);
  g.fillStyle = '#020309';
  g.fillRect(J.x0, J.y0, J.x1 - J.x0, J.y1 - J.y0);
  for (const [x, y] of [[J.x0 - 2, J.y0 - 2], [J.x1 + 2, J.y0 - 2], [J.x0 - 2, J.y1 + 2], [J.x1 + 2, J.y1 + 2]]) screw(g, x, y, 1.8);
}

function drawPitch(g, mg) {
  g.save();
  fieldPath(g);
  g.clip();
  g.beginPath(); g.rect(20, CEIL_Y, 562, FIELD_BOTTOM - CEIL_Y); g.clip();
  // pelouse synthétique : dégradé, bandes de tonte, fondu vers le bas
  const grd = g.createLinearGradient(0, CEIL_Y, 0, FIELD_BOTTOM);
  grd.addColorStop(0, 'rgba(14,30,78,0.95)'); grd.addColorStop(0.55, 'rgba(9,20,56,0.85)'); grd.addColorStop(1, 'rgba(8,14,40,0)');
  g.fillStyle = grd;
  g.fillRect(20, CEIL_Y, 562, FIELD_BOTTOM - CEIL_Y);
  for (let y = CEIL_Y, k = 0; y < FIELD_BOTTOM; y += 32, k++) {
    if (k % 2) continue;
    g.fillStyle = `rgba(77,125,255,${0.05 * (1 - (y - CEIL_Y) / (FIELD_BOTTOM - CEIL_Y))})`;
    g.fillRect(20, y, 562, 32);
  }
  circuits(g, 30, 300, 530, 700, 18, BLUE, 909, 0.06);
  // tracés : lueur large puis trait fin
  const lines = (p) => {
    p.beginPath();
    p.moveTo(34, GOAL_Y); p.lineTo(536, GOAL_Y);                                   // ligne de but
    p.moveTo(120, GOAL_Y); p.lineTo(120, 330); p.lineTo(442, 330); p.lineTo(442, GOAL_Y); // surface de réparation
    p.moveTo(166, GOAL_Y); p.lineTo(166, 262); p.lineTo(396, 262); p.lineTo(396, GOAL_Y); // surface de but
    p.moveTo(281 + 62 * Math.cos(0.55), 298 + 62 * Math.sin(0.55));
    p.arc(281, 298, 62, 0.55, Math.PI - 0.55);                                      // arc de la surface
    p.moveTo(36, KICK.y); p.lineTo(526, KICK.y);                                    // ligne médiane
    p.moveTo(KICK.x + 58, KICK.y); p.arc(KICK.x, KICK.y, 58, 0, TAU);              // rond central
  };
  g.lineCap = 'round';
  g.strokeStyle = rgba(LINE, 0.10); g.lineWidth = 7; lines(g); g.stroke();
  g.strokeStyle = rgba(LINE, 0.55); g.lineWidth = 1.8; lines(g); g.stroke();
  g.fillStyle = rgba(LINE, 0.7);
  g.beginPath(); g.arc(281, 298, 3, 0, TAU); g.fill();
  g.beginPath(); g.arc(KICK.x, KICK.y, 4, 0, TAU); g.fill();
  // drapeaux de coin
  for (const x of [40, 522]) {
    g.strokeStyle = '#cfd8ea'; g.lineWidth = 1.5;
    g.beginPath(); g.moveTo(x, GOAL_Y + 2); g.lineTo(x, GOAL_Y - 16); g.stroke();
    g.fillStyle = x < CX ? CYAN : RED;
    g.beginPath(); g.moveTo(x, GOAL_Y - 16); g.lineTo(x + (x < CX ? 10 : -10), GOAL_Y - 12); g.lineTo(x, GOAL_Y - 8); g.fill();
  }
  // logo au centre du terrain
  paint(g, 'CYBERBALL', CX, 625, 30, rgba(BLUE, 0.16), { outline: 'rgba(0,0,0,0)', spacing: 4 });
  paint(g, 'LUMEN  ◆  NULL', CX, 652, 11, rgba(LINE, 0.22), { outline: 'rgba(0,0,0,0)', spacing: 3 });
  // couloirs des défenseurs (pointillés)
  g.setLineDash([3, 7]); g.lineWidth = 1.2;
  for (const D of mg.defs) {
    g.strokeStyle = rgba(RED, D.sleeper ? 0.12 : 0.22);
    g.beginPath(); g.moveTo(D.x0 - D.amp - 16, D.y); g.lineTo(D.x0 + D.amp + 16, D.y); g.stroke();
  }
  g.setLineDash([]);
  // flèches de tir vers le but
  for (let k = 0; k < 3; k++) insertBase(g, 'chevron', CX, 520 - k * 26, 9, GOLD);
  g.restore();
  // rail du gardien
  const [lo, hi] = mg._keeperRange();
  const x0 = lo - mg.keeper.hl - 10, x1 = hi + mg.keeper.hl + 10;
  g.fillStyle = 'rgba(0,0,0,0.55)';
  g.fillRect(x0, KEEPER_Y - 3, x1 - x0, 6);
  g.strokeStyle = rgba(RED, 0.35); g.lineWidth = 1;
  g.beginPath(); g.moveTo(x0, KEEPER_Y); g.lineTo(x1, KEEPER_Y); g.stroke();
  // panneaux latéraux (cadres)
  for (const x of [21, 532]) {
    g.fillStyle = '#04050b'; g.fillRect(x, 410, 9, 84);
    g.strokeStyle = rgba(BLUE, 0.5); g.lineWidth = 1; g.strokeRect(x + 0.5, 410.5, 8, 83);
  }
}

function drawGoalBase(g) {
  // intérieur de la cage (le filet est animé)
  const grd = g.createLinearGradient(0, CEIL_Y, 0, GOAL_Y);
  grd.addColorStop(0, '#02030a'); grd.addColorStop(1, '#0a1230');
  g.fillStyle = grd;
  g.fillRect(POST_L, CEIL_Y + 2, POST_R - POST_L, GOAL_Y - CEIL_Y - 2);
  // plafond (muret de tribune) et cage chromés
  chrome(g, [[78, CEIL_Y], [522, CEIL_Y]], 8, { glow: BLUE });
  chrome(g, [[POST_L, GOAL_Y], [POST_L, CEIL_Y]], 7, { glow: '#ffffff' });
  chrome(g, [[POST_R, GOAL_Y], [POST_R, CEIL_Y]], 7, { glow: '#ffffff' });
  chrome(g, [[POST_L - WING.dx, GOAL_Y + WING.dy], [POST_L, GOAL_Y]], 7, { glow: BLUE });
  chrome(g, [[POST_R + WING.dx, GOAL_Y + WING.dy], [POST_R, GOAL_Y]], 7, { glow: BLUE });
  for (const x of [POST_L, POST_R]) post(g, x, GOAL_Y, POST_RAD - 2.5, true);
}

function drawCornersBase(g) {
  CORNERS.forEach((c, i) => {
    const side = i ? 1 : -1;
    const a = Math.atan2(GOAL_Y - c.y, CX - c.x);
    // socle contre le mur
    g.fillStyle = 'rgba(0,0,0,0.5)';
    g.beginPath(); g.arc(c.x + 3, c.y + 5, 25, 0, TAU); g.fill();
    g.fillStyle = '#0b0c16';
    g.beginPath(); g.arc(c.x, c.y, 25, 0, TAU); g.fill();
    hazard(g, ringPts(c.x, c.y, 25, 20), GOLD, 0.25, 6);
    g.fillStyle = '#0b0c16';
    g.beginPath(); g.arc(c.x, c.y, 19, 0, TAU); g.fill();
    g.strokeStyle = rgba(GOLD, 0.6); g.lineWidth = 1.2;
    g.beginPath(); g.arc(c.x, c.y, 25, 0, TAU); g.stroke();
    insertBase(g, 'arrow', c.x, c.y, 13, GOLD, a + Math.PI / 2);
    // zone de capture
    g.setLineDash([4, 6]); g.strokeStyle = rgba(GOLD, 0.25); g.lineWidth = 1;
    g.beginPath(); g.arc(c.x, c.y, CORNER_R, 0, TAU); g.stroke();
    g.setLineDash([]);
    paint(g, 'CORNER', c.x - side * 2, c.y - 46, 10, GOLD, { alpha: 0.75 });
  });
}

function ringPts(x, y, r, n) {
  const pts = [];
  for (let k = 0; k < n; k++) { const a = k * TAU / n; pts.push([x + Math.cos(a) * r, y + Math.sin(a) * r]); }
  return pts;
}

function lampX(i, n) { return CX + (i - (n - 1) / 2) * 34; }

function drawLampsBase(g, mg) {
  const n = mg.target;
  paint(g, 'BUTS', CX, LAMP_Y - 22, 10, LINE, { alpha: 0.6, spacing: 3 });
  for (let i = 0; i < n; i++) {
    const x = lampX(i, n);
    insertBase(g, 'circle', x, LAMP_Y, 11, i === n - 1 ? GOLD : BLUE);
    g.strokeStyle = 'rgba(255,255,255,0.18)'; g.lineWidth = 0.8;
    pentagon(g, x, LAMP_Y, 4); g.stroke();
  }
}

function pentagon(g, x, y, s) {
  g.beginPath();
  for (let k = 0; k < 5; k++) { const a = -Math.PI / 2 + k * TAU / 5; k ? g.lineTo(x + Math.cos(a) * s, y + Math.sin(a) * s) : g.moveTo(x + Math.cos(a) * s, y + Math.sin(a) * s); }
  g.closePath();
}

// ================================================================ rendu dynamique (sous la bille)
export function renderCyberball(ctx, r, mg) {
  const t = r.time;
  drawBeams(ctx, r, mg, t);
  drawCrowd(ctx, r, mg, t);
  drawJumbo(ctx, r, mg, t);
  drawAds(ctx, r, mg, t);
  drawNet(ctx, r, mg, t);
  drawGoalFx(ctx, r, mg, t);
  drawCorners(ctx, r, mg, t);
  drawLamps(ctx, r, mg, t);
  drawKickoff(ctx, r, mg, t);
  for (const d of mg.defs) drawDefender(ctx, r, mg, d, t);
  drawKeeper(ctx, r, mg, t);
  drawPowerAura(ctx, r, mg, t);
}

function drawBeams(ctx, r, mg, t) {
  const sp = beamSprite();
  const hot = mg.hype;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  TOWERS.forEach((T, i) => {
    // balayage lent ; sur un but, les faisceaux se croisent sur la cage
    const aim = mg.jumbo.kind === 'goal' && mg.jumbo.t < 2 ? Math.atan2(GOAL_Y - T.y, CX - T.x) - Math.PI / 2
      : Math.atan2(420 - T.y, CX + Math.sin(t * 0.4 + i * 2.1) * 170 - T.x) - Math.PI / 2;
    const strobe = hot > 0.8 ? (Math.sin(t * 22 + i * 3) > 0 ? 1 : 0.5) : 1;
    ctx.globalAlpha = (0.22 + 0.25 * hot) * strobe;
    ctx.save();
    ctx.translate(T.x, T.y);
    ctx.rotate(aim);
    ctx.drawImage(sp, -60, 0, 120, 620);
    ctx.restore();
  });
  ctx.restore();
  for (const T of TOWERS) {
    r.glow(T.x, T.y, 90, '#dfe9ff', 0.5 + 0.3 * mg.hype);
    r.glow(T.x, T.y, 34, '#ffffff', 0.8);
  }
}

function drawCrowd(ctx, r, mg, t) {
  const S = seats();
  const hot = mg.hype;
  const ola = 1 - hot;
  // silhouettes : corps puis têtes (un seul chemin chacun) ; la foule saute, ou fait la ola
  const bob = (s) => {
    const jump = hot * 4.5 * Math.max(0, Math.sin(t * 11 + s.ph));
    const wave = ola * 3.5 * Math.pow(Math.max(0, Math.sin(s.x * 0.025 - t * 3.2)), 6);
    return jump + wave;
  };
  ctx.fillStyle = '#030409';
  ctx.beginPath();
  for (const s of S) {
    const y = s.y - bob(s) + 6;
    ctx.moveTo(s.x + 5.4 * s.s, y);
    ctx.ellipse(s.x, y, 5.4 * s.s, 3.6 * s.s, 0, 0, TAU);
  }
  ctx.fill();
  ctx.fillStyle = '#070814';
  ctx.beginPath();
  for (const s of S) {
    const y = s.y - bob(s);
    ctx.moveTo(s.x + 3.1 * s.s, y);
    ctx.arc(s.x, y, 3.1 * s.s, 0, TAU);
  }
  ctx.fill();
  // liseré de lumière sur les têtes (contre-jour des projecteurs)
  ctx.strokeStyle = `rgba(150,180,255,${0.35 + 0.25 * hot})`; ctx.lineWidth = 0.9;
  ctx.beginPath();
  for (const s of S) {
    const y = s.y - bob(s);
    ctx.moveTo(s.x + 2.9 * s.s * Math.cos(3.6), y + 2.9 * s.s * Math.sin(3.6));
    ctx.arc(s.x, y, 2.9 * s.s, 3.6, 5.8);
  }
  ctx.stroke();
  // bâtons lumineux et téléphones (agités quand la foule s'enflamme)
  const cols = [CYAN, MAG, GOLD];
  ctx.globalCompositeOperation = 'lighter';
  for (let c = 0; c < 3; c++) {
    ctx.fillStyle = cols[c];
    ctx.globalAlpha = 0.55 + 0.4 * hot;
    ctx.beginPath();
    for (const s of S) {
      if (s.light !== c) continue;
      const wv = Math.sin(t * (4 + hot * 8) + s.ph) * (1.5 + hot * 4);
      ctx.rect(s.x + wv - 1.2, s.y - bob(s) - 7 - hot * 3, 2.4, 2.4 + hot * 2);
    }
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  // flashs d'appareils photo pendant la fête
  if (hot > 0.6) {
    for (let k = 0; k < 4; k++) {
      const s = S[(Math.floor(t * 17) * 7 + k * 31) % S.length];
      if (Math.sin(t * 40 + k) > 0.6) r.glow(s.x, s.y - 4, 22, '#ffffff', 0.9);
    }
  }
}

function drawJumbo(ctx, r, mg, t) {
  const J = JUMBO, cx = (J.x0 + J.x1) / 2, w = J.x1 - J.x0, h = J.y1 - J.y0;
  const jb = mg.jumbo;
  const K = mg.keeper;
  ctx.save();
  ctx.beginPath(); ctx.rect(J.x0, J.y0, w, h); ctx.clip();
  let bg = '#030616';
  if (jb.kind === 'goal' && jb.t < 2.2) bg = Math.floor(jb.t * 8) % 2 ? '#0a1a5a' : '#1a1040';
  else if (jb.kind === 'null' && jb.t < 2) bg = Math.floor(jb.t * 10) % 2 ? '#3a0614' : '#12030a';
  ctx.fillStyle = bg;
  ctx.fillRect(J.x0, J.y0, w, h);
  const my = J.y0 + 22, ly = J.y1 - 11;
  if (jb.kind === 'goal' && jb.t < 2.2) {
    const s = 1 + 0.25 * Math.max(0, 1 - jb.t * 3);
    glitchText(r, 'BUT !', cx, my + 2, Math.round(30 * s), Math.floor(t * 10) % 2 ? GOLD : '#ffffff', 1);
    r.text(`LUMEN ${mg.goals} – ${mg.nullGoals} NULL`, cx, ly, 11, LINE, 'center', 0.95, true);
  } else if (jb.kind === 'post' && jb.t < 1.3) {
    glitchText(r, 'POTEAU !', cx, my + 2, 24, GOLD, 1);
    r.text('SI PRÈS DU BUT…', cx, ly, 10, LINE, 'center', 0.9);
  } else if (jb.kind === 'ko' && jb.t < 1.6) {
    glitchText(r, 'K.O. !', cx, my + 2, 28, LIME, 1);
    r.text('BUT OUVERT — FRAPPEZ', cx, ly, 10, LIME, 'center', 0.9);
  } else if (jb.kind === 'corner' && jb.t < 1.1) {
    glitchText(r, 'CORNER', cx, my + 2, 24, GOLD, 1);
    r.text('CENTRE AU SECOND POTEAU', cx, ly, 10, LINE, 'center', 0.9);
  } else if (jb.kind === 'null' && jb.t < 2) {
    glitchText(r, 'BUT DE NULL', cx, my + 2, 20, RED, 1);
    r.text('BOUCLIER CONSOMMÉ', cx, ly, 10, '#ff9ab5', 'center', 0.9);
  } else if (jb.kind === 'close' && jb.t < 1) {
    glitchText(r, 'OH !', cx, my + 2, 28, '#ff9ab5', 1);
    r.text('PARADE DU GARDIEN', cx, ly, 10, LINE, 'center', 0.9);
  } else {
    // tableau d'affichage : LUMEN  3 – 0  NULL
    r.text('LUMEN', J.x0 + 30, my, 12, CYAN, 'center', 1, true);
    r.text('NULL', J.x1 - 28, my, 12, RED, 'center', 1, true);
    r.text(`${mg.goals}`, cx - 20, my + 1, 28, '#ffffff', 'center', 1, true);
    r.text('–', cx, my, 20, '#8fa3c8', 'center', 1, true);
    r.text(`${mg.nullGoals}`, cx + 20, my + 1, 28, '#ffffff', 'center', 1, true);
    // bandeau : chrono, objectif, conseils
    let msg;
    if (K.stun > 0) msg = `BUT OUVERT · ${K.stun.toFixed(1)} s`;
    else {
      const k = Math.floor(t / 2.6) % (TIPS.length + 1);
      msg = k === 0 ? `BUTS ${mg.goals}/${mg.target} · ${Math.ceil(Math.max(0, mg.timeLeft))} s` : TIPS[k - 1];
    }
    r.text(msg, cx, ly, 10, K.stun > 0 ? LIME : GOLD, 'center', 0.9);
  }
  // trame LED + reflet
  ctx.fillStyle = ledPattern(ctx);
  ctx.fillRect(J.x0, J.y0, w, h);
  ctx.fillStyle = 'rgba(255,255,255,0.05)';
  ctx.beginPath(); ctx.moveTo(J.x0, J.y0); ctx.lineTo(J.x0 + w * 0.45, J.y0); ctx.lineTo(J.x0 + w * 0.3, J.y1); ctx.lineTo(J.x0, J.y1); ctx.fill();
  ctx.restore();
  r.glow(cx, (J.y0 + J.y1) / 2, 300, jb.kind === 'null' && jb.t < 2 ? RED : BLUE, 0.12 + 0.2 * mg.hype);
}

function drawAds(ctx, r, mg, t) {
  const A = ADS;
  ctx.save();
  ctx.beginPath(); ctx.rect(A.x0, A.y0, A.x1 - A.x0, A.y1 - A.y0); ctx.clip();
  const hot = mg.jumbo.kind === 'goal' && mg.jumbo.t < 2.2;
  ctx.fillStyle = hot ? (Math.floor(t * 8) % 2 ? '#1a2a7a' : '#2a0a3a') : '#03040c';
  ctx.fillRect(A.x0, A.y0, A.x1 - A.x0, A.y1 - A.y0);
  ctx.font = `700 9px ${r.font}`;
  ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  const str = hot ? '  BUT ! BUT ! BUT ! BUT ! BUT ! BUT ! BUT ! BUT ! BUT ! BUT ! ' : ADS_TEXT;
  const tw = ctx.measureText(str).width;
  const off = -((t * (hot ? 160 : 45)) % tw);
  ctx.fillStyle = hot ? GOLD : '#9fd8ff';
  for (let x = A.x0 + off; x < A.x1; x += tw) ctx.fillText(str, x, (A.y0 + A.y1) / 2 + 0.5);
  ctx.fillStyle = ledPattern(ctx);
  ctx.fillRect(A.x0, A.y0, A.x1 - A.x0, A.y1 - A.y0);
  ctx.restore();
  // panneaux latéraux (texte vertical)
  for (const [x, rot] of [[25.5, -Math.PI / 2], [536.5, Math.PI / 2]]) {
    ctx.save();
    ctx.beginPath(); ctx.rect(x - 4, 411, 8, 82); ctx.clip();
    ctx.translate(x, 452);
    ctx.rotate(rot);
    ctx.font = `700 7px ${r.font}`;
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillStyle = Math.floor(t * 0.5) % 2 ? MAG : CYAN;
    const s = 'CYBERBALL ◆ LUMEN ◆ ';
    const sw = ctx.measureText(s).width;
    const o = -((t * 30) % sw);
    for (let k = -1; k < 3; k++) ctx.fillText(s, -41 + o + k * sw, 0);
    ctx.restore();
  }
}

// filet en losanges, déformé par la bille (bombement) puis qui ondule
function drawNet(ctx, r, mg, t) {
  const N = mg.net;
  const x0 = POST_L + 5, x1 = POST_R - 5, y0 = CEIL_Y + 5, y1 = GOAL_Y - 4;
  ctx.save();
  ctx.beginPath(); ctx.rect(x0, y0, x1 - x0, y1 - y0); ctx.clip();
  const k = N.k;
  ctx.strokeStyle = k > 0.05 ? rgba('#dfe9ff', 0.32 + 0.3 * k) : 'rgba(200,215,255,0.26)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  const step = 12;
  const H = y1 - y0;
  const disp = (x, y) => {
    const dx = x - N.x, dy = y - N.y, d2 = dx * dx + dy * dy;
    const f = k * 16 * Math.exp(-d2 / 1400) * (0.75 + 0.25 * Math.sin(t * 30));
    const d = Math.sqrt(d2) || 1;
    return [x + dx / d * f * 0.6, y - f + dy / d * f * 0.25];
  };
  for (let c = x0 - H; c < x1; c += step) {
    for (const dir of [1, -1]) {
      const sx = dir > 0 ? c : c + H;
      if (k <= 0.01) {
        ctx.moveTo(sx, y1); ctx.lineTo(sx + dir * H, y0);
      } else {
        for (let s = 0; s <= 8; s++) {
          const u = s / 8;
          const [px, py] = disp(sx + dir * H * u, y1 - H * u);
          if (s === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
        }
      }
    }
  }
  ctx.stroke();
  // reflet au fond de la cage (lueur au but)
  if (k > 0.05) r.glow(N.x, N.y, 140, mg.seq && mg.seq.lucarne ? GOLD : BLUE, k * 0.8);
  ctx.restore();
}

function drawGoalFx(ctx, r, mg, t) {
  const K = mg.keeper;
  const open = K.stun > 0;
  const near = mg.ball && mg.ball.state === 'free' && mg.ball.y < 380 ? 1 : 0;
  // ligne de but lumineuse entre les montants
  const col = open ? LIME : BLUE;
  ctx.globalCompositeOperation = 'lighter';
  ctx.strokeStyle = rgba(col, 0.25 + 0.25 * near + (open ? 0.3 * (0.5 + 0.5 * Math.sin(t * 10)) : 0));
  ctx.lineWidth = 6;
  ctx.beginPath(); ctx.moveTo(POST_L + 10, GOAL_Y); ctx.lineTo(POST_R - 10, GOAL_Y); ctx.stroke();
  ctx.strokeStyle = rgba('#ffffff', 0.5 + 0.3 * near);
  ctx.lineWidth = 1.5;
  ctx.setLineDash([10, 6]); ctx.lineDashOffset = -t * 30;
  ctx.beginPath(); ctx.moveTo(POST_L + 10, GOAL_Y); ctx.lineTo(POST_R - 10, GOAL_Y); ctx.stroke();
  ctx.setLineDash([]);
  ctx.globalCompositeOperation = 'source-over';
  // lucarnes : coins de la cage signalés
  for (const x of [POST_L + 20, POST_R - 20]) {
    const a = 0.25 + 0.2 * Math.sin(t * 4 + x);
    ctx.strokeStyle = rgba(GOLD, a); ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(x, GOAL_Y - 4, 7, Math.PI, TAU); ctx.stroke();
  }
  // montants : éclat sur un poteau
  for (const P of mg.posts) {
    r.glow(P.x, P.y, 50 + 70 * P.flash, P.flash > 0.1 ? GOLD : '#dfe9ff', 0.25 + 0.75 * P.flash);
  }
  if (open) {
    r.glow(CX, GOAL_Y - 30, 240, LIME, 0.25 + 0.15 * Math.sin(t * 10));
    r.text('BUT OUVERT', CX, CEIL_Y + 34, 15, LIME, 'center', 0.7 + 0.3 * Math.sin(t * 12), true);
    r.text(`${K.stun.toFixed(1)} s`, CX, CEIL_Y + 54, 11, '#d6ffe4', 'center', 0.85);
  }
}

function drawCorners(ctx, r, mg, t) {
  for (const C of mg.corners) {
    const a = Math.atan2(GOAL_Y - C.y, CX - C.x) + Math.PI / 2;
    if (C.lit) {
      const p = 0.6 + 0.4 * Math.sin(t * 7 + C.i * 2);
      insertLit(ctx, 'arrow', C.x, C.y, 13, GOLD, p, a);
      r.glow(C.x, C.y, 90, GOLD, 0.25 + 0.25 * p + C.flash * 0.5);
      ctx.strokeStyle = rgba(GOLD, 0.5 * p); ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(C.x, C.y, CORNER_R - 2 + 3 * Math.sin(t * 5), 0, TAU); ctx.stroke();
    } else if (mg.cross && mg.cross.C === C) {
      const u = C.charge;
      insertLit(ctx, 'arrow', C.x, C.y, 13, '#ffffff', 1, a);
      r.glow(C.x, C.y, 120, GOLD, 0.6 + 0.4 * u);
      ctx.strokeStyle = GOLD; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(C.x, C.y, 22, -Math.PI / 2, -Math.PI / 2 + TAU * u); ctx.stroke();
      // ligne de visée vers la cible
      ctx.setLineDash([5, 6]); ctx.strokeStyle = rgba(GOLD, 0.6 * u); ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(C.x, C.y); ctx.lineTo(mg.cross.tx, GOAL_Y); ctx.stroke();
      ctx.setLineDash([]);
    } else {
      // recharge
      const u = 1 - clamp(C.cd / mg.T.cornerCd, 0, 1);
      ctx.strokeStyle = rgba(GOLD, 0.45); ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(C.x, C.y, 22, -Math.PI / 2, -Math.PI / 2 + TAU * u); ctx.stroke();
    }
    if (C.flash > 0.05) r.glow(C.x, C.y, 160, '#ffffff', C.flash * 0.6);
  }
}

function drawLamps(ctx, r, mg, t) {
  const n = mg.target;
  for (let i = 0; i < n; i++) {
    const x = lampX(i, n);
    if (i < mg.goals) {
      const fresh = mg.jumbo.kind === 'goal' && mg.jumbo.t < 1.5 && i === mg.goals - 1;
      const col = i === n - 1 ? GOLD : BLUE;
      insertLit(ctx, 'circle', x, LAMP_Y, 11, fresh && Math.floor(t * 12) % 2 ? '#ffffff' : col, 1);
      r.glow(x, LAMP_Y, 50, col, fresh ? 0.9 : 0.4);
      ctx.strokeStyle = 'rgba(10,14,30,0.7)'; ctx.lineWidth = 1;
      pentagon(ctx, x, LAMP_Y, 4); ctx.stroke();
    } else if (i === mg.goals) {
      const p = 0.5 + 0.5 * Math.sin(t * 6);
      insertLit(ctx, 'circle', x, LAMP_Y, 11, i === n - 1 ? GOLD : BLUE, 0.25 + 0.35 * p);
    }
  }
}

function drawKickoff(ctx, r, mg, t) {
  const k = mg.kickBeam;
  if (k <= 0.01) {
    // point d'engagement discret
    r.glow(KICK.x, KICK.y, 40, BLUE, 0.25 + 0.1 * Math.sin(t * 3));
    return;
  }
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const grd = ctx.createLinearGradient(0, KICK.y - 260, 0, KICK.y);
  grd.addColorStop(0, rgba(CYAN, 0)); grd.addColorStop(1, rgba(CYAN, 0.45 * k));
  ctx.fillStyle = grd;
  ctx.fillRect(KICK.x - 22 * k, KICK.y - 260, 44 * k, 260);
  ctx.fillStyle = rgba('#ffffff', 0.7 * k);
  ctx.fillRect(KICK.x - 2, KICK.y - 260, 4, 260);
  ctx.restore();
  ctx.strokeStyle = rgba(CYAN, k); ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(KICK.x, KICK.y, 58 * (1.4 - 0.4 * k), 0, TAU); ctx.stroke();
  r.glow(KICK.x, KICK.y, 120, CYAN, k);
}

function drawDefender(ctx, r, mg, d, t) {
  const x = d.x, y = d.y, R = DEF_R;
  if (d.sleep) {
    // hologramme en veille
    const a = 0.25 + 0.1 * Math.sin(t * 3 + d.n);
    ctx.setLineDash([3, 4]);
    ctx.strokeStyle = rgba(RED, a); ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(x, y, R, 0, TAU); ctx.stroke();
    ctx.setLineDash([]);
    r.text(`${d.n}`, x, y, 10, RED, 'center', a + 0.1, true);
    r.text('VEILLE', x, y + R + 9, 7, RED, 'center', a);
    return;
  }
  const w = d.wake;
  if (w < 1) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = rgba(RED, 0.3 * (1 - w));
    ctx.fillRect(x - R, CEIL_Y, R * 2, y - CEIL_Y);
    ctx.restore();
  }
  ctx.save();
  ctx.globalAlpha = w < 1 ? w * (0.6 + 0.4 * Math.sin(t * 50)) : 1;
  // ombre
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  ctx.beginPath(); ctx.ellipse(x + 4, y + 7, R + 2, R * 0.9, 0, 0, TAU); ctx.fill();
  r.glow(x, y, R * 4, RED, (0.25 + d.flash * 0.6) * (w < 1 ? w : 1));
  ctx.translate(x, y);
  // épaules (perpendiculaires au regard)
  ctx.save();
  ctx.rotate(d.face + Math.PI / 2);
  ctx.fillStyle = '#2a1420';
  ctx.beginPath(); ctx.ellipse(-R + 1, 0, 6, 9, 0, 0, TAU); ctx.ellipse(R - 1, 0, 6, 9, 0, 0, TAU); ctx.fill();
  ctx.strokeStyle = rgba(RED, 0.8); ctx.lineWidth = 1; ctx.stroke();
  ctx.restore();
  // corps (maillot de NULL)
  const grd = ctx.createRadialGradient(-4, -5, 2, 0, 0, R);
  grd.addColorStop(0, '#5a2a3c'); grd.addColorStop(0.6, '#260c18'); grd.addColorStop(1, '#12040a');
  ctx.fillStyle = grd;
  ctx.beginPath(); ctx.arc(0, 0, R - 2, 0, TAU); ctx.fill();
  ctx.strokeStyle = d.flash > 0.3 ? '#ffffff' : RED; ctx.lineWidth = 2.5;
  ctx.stroke();
  // visière tournée vers la bille
  ctx.strokeStyle = d.flash > 0.3 ? '#ffffff' : '#ff9ab5'; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.arc(0, 0, R - 6, d.face - 0.6, d.face + 0.6); ctx.stroke();
  ctx.restore();
  r.text(`${d.n}`, x - Math.cos(d.face) * 3, y - Math.sin(d.face) * 3, 9, '#ffe0ea', 'center', 0.9 * (w < 1 ? w : 1), true);
}

function drawKeeper(ctx, r, mg, t) {
  const K = mg.keeper;
  const ko = K.stun > 0 || K.reboot > 0;
  const blink = K.reboot > 0 ? (Math.floor(t * 20) % 2 ? 0.35 : 1) : 1;
  const x = K.x + (K.stun > 0 ? Math.sin(t * 9) * 3 : 0);
  const y = KEEPER_Y - 14 * K.ko;
  const hl = K.hl;
  // marqueur d'anticipation (où le gardien veut aller)
  if (!ko && mg.state === 'play') {
    ctx.strokeStyle = rgba(RED, 0.35); ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(K.tgt - 6, KEEPER_Y + 13); ctx.lineTo(K.tgt, KEEPER_Y + 7); ctx.lineTo(K.tgt + 6, KEEPER_Y + 13); ctx.stroke();
  }
  // ombre et lueur de sustentation
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  ctx.beginPath(); ctx.ellipse(x + 5, KEEPER_Y + 9, hl + 14, 9, 0, 0, TAU); ctx.fill();
  r.glow(x, KEEPER_Y + 4, (hl + 20) * 3, K.stun > 0 ? '#8fa3c8' : RED, (ko ? 0.15 : 0.35) + K.flash * 0.5);
  ctx.save();
  ctx.globalAlpha = blink * (K.stun > 0 ? 0.75 : 1);
  ctx.translate(x, y);
  ctx.rotate(K.tilt + (K.stun > 0 ? Math.sin(t * 7) * 0.25 : 0));
  // traînée de mouvement
  if (Math.abs(K.vx) > 120 && !ko) {
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = rgba(RED, Math.min(0.35, Math.abs(K.vx) / 1500));
    const back = -Math.sign(K.vx);
    ctx.fillRect(back > 0 ? hl : -hl - 26, -5, 26, 10);
    ctx.globalCompositeOperation = 'source-over';
  }
  // bras (capsule physique)
  ctx.lineCap = 'round';
  ctx.strokeStyle = '#1a0d16'; ctx.lineWidth = KEEPER_R * 2 + 2;
  ctx.beginPath(); ctx.moveTo(-hl, 0); ctx.lineTo(hl, 0); ctx.stroke();
  ctx.strokeStyle = '#4a2a3a'; ctx.lineWidth = KEEPER_R * 2 - 4;
  ctx.beginPath(); ctx.moveTo(-hl, 0); ctx.lineTo(hl, 0); ctx.stroke();
  ctx.strokeStyle = K.flash > 0.3 ? '#ffffff' : K.stun > 0 ? '#8fa3c8' : RED; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(-hl, 0); ctx.lineTo(hl, 0); ctx.stroke();
  // gants
  for (const s of [-1, 1]) {
    const g2 = ctx.createRadialGradient(s * hl - 2, -3, 1, s * hl, 0, KEEPER_R + 2);
    g2.addColorStop(0, '#ffffff'); g2.addColorStop(0.5, K.save > 0.2 ? '#ffd0dc' : '#ff9ab5'); g2.addColorStop(1, '#5a1a2c');
    ctx.fillStyle = g2;
    ctx.beginPath(); ctx.arc(s * hl, 0, KEEPER_R + 1.5, 0, TAU); ctx.fill();
  }
  // corps et œil
  ctx.fillStyle = '#12060c';
  ctx.beginPath();
  ctx.moveTo(-13, -9); ctx.lineTo(13, -9); ctx.lineTo(16, 0); ctx.lineTo(11, 10); ctx.lineTo(-11, 10); ctx.lineTo(-16, 0); ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = K.stun > 0 ? '#8fa3c8' : RED; ctx.lineWidth = 1.5; ctx.stroke();
  if (K.stun > 0) {
    ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(-8, -4); ctx.lineTo(-3, 3); ctx.moveTo(-3, -4); ctx.lineTo(-8, 3); ctx.moveTo(3, -4); ctx.lineTo(8, 3); ctx.moveTo(8, -4); ctx.lineTo(3, 3); ctx.stroke();
  } else {
    const b = mg.ball;
    let px = 0, py = 0;
    if (b) { const dx = b.x - K.x, dy = b.y - KEEPER_Y, dd = Math.hypot(dx, dy) || 1; px = dx / dd * 3.5; py = dy / dd * 2.5; }
    ctx.fillStyle = RED;
    ctx.beginPath(); ctx.ellipse(0, 0, 8, 5.5, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.arc(px, py, 2.6, 0, TAU); ctx.fill();
  }
  ctx.restore();
  // K.O. : étoiles, étincelles, compte à rebours
  if (K.stun > 0) {
    for (let k = 0; k < 3; k++) {
      const a = t * 4 + k * TAU / 3;
      star(ctx, x + Math.cos(a) * (hl + 6), y - 14 + Math.sin(a) * 6, 4, GOLD);
    }
    if (Math.sin(t * 31) > 0.7) r.glow(x + Math.sin(t * 13) * hl, y, 26, '#ffffff', 0.8);
    const u = K.stun / mg.T.stunDur;
    ctx.strokeStyle = rgba(LIME, 0.8); ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(x, y, hl + 16, -Math.PI / 2, -Math.PI / 2 + TAU * u); ctx.stroke();
  }
  if (K.hold) r.glow(x, KEEPER_Y + 22, 70, '#ffd0dc', 0.6 + 0.3 * Math.sin(t * 20));
}

function star(ctx, x, y, s, col) {
  ctx.fillStyle = col;
  ctx.beginPath();
  for (let k = 0; k < 8; k++) {
    const a = k * Math.PI / 4, rr = k % 2 ? s * 0.4 : s;
    k ? ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr) : ctx.moveTo(x + rr, y);
  }
  ctx.closePath(); ctx.fill();
}

// tir puissant : la bille s'embrase (elle assommera le gardien)
function drawPowerAura(ctx, r, mg, t) {
  const b = mg.ball;
  if (!b || b.state !== 'free' || b.vy > -200 || b.y > 900) return;
  const sp = Math.hypot(b.vx, b.vy);
  const thr = mg.T.stunImpact;
  if (sp < thr * 0.95) return;
  const a = r.alpha ?? 1;
  const x = b.px + (b.x - b.px) * a, y = b.py + (b.y - b.py) * a;
  const k = Math.min(1, (sp - thr * 0.95) / 600);
  const nx = -b.vx / sp, ny = -b.vy / sp;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = 0.5 + 0.4 * k;
  ctx.drawImage(glowSprite('#ff7b1c', 64), x - 30 + nx * 14, y - 30 + ny * 14, 60, 60);
  ctx.drawImage(glowSprite('#ffd84a', 64), x - 20, y - 20, 40, 40);
  ctx.strokeStyle = 'rgba(255,200,120,0.5)'; ctx.lineWidth = 6; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + nx * 60, y + ny * 60); ctx.stroke();
  ctx.restore();
}

// ================================================================ rendu par-dessus la bille
export function renderCyberballTop(ctx, r, mg) {
  // fusées de feux d'artifice
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.lineCap = 'round';
  for (const R of mg.rockets) {
    if (R.t < 0) continue;
    ctx.strokeStyle = rgba(R.color, 0.6); ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.moveTo(R.x - R.vx * 0.06, R.y - R.vy * 0.06); ctx.lineTo(R.x, R.y); ctx.stroke();
    ctx.drawImage(glowSprite('#ffffff', 32), R.x - 8, R.y - 8, 16, 16);
  }
  ctx.restore();
  // confettis
  const cols = [BLUE, CYAN, GOLD, MAG, '#ffffff'];
  ctx.lineWidth = 2.6; ctx.lineCap = 'butt';
  for (const col of cols) {
    ctx.strokeStyle = col;
    ctx.beginPath();
    for (const c of mg.confetti) {
      if (c.c !== col) continue;
      const fade = c.t > c.life - 0.5 ? (c.life - c.t) / 0.5 : 1;
      if (fade <= 0) continue;
      const w = c.w * Math.abs(Math.cos(c.a * 0.7)) * fade + 0.5;
      ctx.moveTo(c.x - Math.cos(c.a) * w, c.y - Math.sin(c.a) * w);
      ctx.lineTo(c.x + Math.cos(c.a) * w, c.y + Math.sin(c.a) * w);
    }
    ctx.stroke();
  }
  // grande annonce
  const C = mg.callout;
  if (C) {
    const u = C.t / C.life;
    const a = u < 0.1 ? u / 0.1 : u > 0.75 ? Math.max(0, (1 - u) / 0.25) : 1;
    const s = 1 + 0.5 * Math.max(0, 1 - C.t * 6);
    glitchText(r, C.text, CX, C.y, Math.round(40 * s), C.color, a);
    if (C.sub) r.text(C.sub, CX, C.y + 34, 15, '#ffffff', 'center', a * 0.9, true);
  }
}

// texte à aberration chromatique (cyan / magenta)
function glitchText(r, str, x, y, size, color, a) {
  const ctx = r.ctx;
  const j = Math.sin(r.time * 37) > 0.6 ? 3 : 1.5;
  ctx.globalCompositeOperation = 'lighter';
  r.text(str, x - j, y, size, MAG, 'center', a * 0.55, true);
  r.text(str, x + j, y, size, CYAN, 'center', a * 0.55, true);
  ctx.globalCompositeOperation = 'source-over';
  r.text(str, x, y, size, color, 'center', a, true);
}
