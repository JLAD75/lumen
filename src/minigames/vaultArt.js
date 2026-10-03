// Dessin du minijeu BRAQUAGE DU COFFRE : salle des coffres (calque statique), coffre-fort
// à anneaux blindés, noyau crypto, butin, laser d'alignement, débris, gyrophares.
// Géométrie partagée avec la logique (vault.js) : centre, rayons, coffres.
import { TAU, rgba, fmt } from '../util/math.js';
import { glowSprite } from '../render/sprites.js';
import { insertBase, insertLit, paint, circuits, screw } from '../render/artKit.js';

export const VC = { x: 281, y: 430 };           // centre du coffre
export const CORE_R = 30;                        // sphère du noyau
export const PLATE_R = 5;                        // demi-épaisseur physique des plaques
// anneaux possibles (rayon, nombre de plaques) : intérieur carré, puis 12 et 16 plaques
export const RING_GEO = [{ R: 62, n: 4 }, { R: 108, n: 12 }, { R: 153, n: 16 }];
// Coffres successifs : anneaux (k = géométrie), brèches de départ (indices de plaques
// absentes), vitesse angulaire (rad/s, signe = sens), points de vie de base (hp, 2 par défaut).
export const VAULTS = [
  { name: 'COFFRE ALPHA', color: '#b07bff', rings: [{ k: 0, open: [0, 2], w: -0.9 }, { k: 1, open: [0, 6], w: 0.45 }] },
  { name: 'COFFRE BÊTA', color: '#3de0ff', rings: [{ k: 0, open: [0, 2], w: 1.2 }, { k: 1, open: [0, 4, 8], w: -0.6 }] },
  { name: 'COFFRE OMÉGA', color: '#ff5fa2', rings: [{ k: 0, open: [0, 2], w: -1.1 }, { k: 1, open: [0, 4, 8], w: 0.6 }, { k: 2, open: [0, 4, 8, 12], w: -0.32, hp: 1 }] },
];

const GOLD = '#ffd84a';
const AMBER = '#ffb52e';
const RED = '#ff4060';
const VIOLET = '#b07bff';
const T = 5.6;                                   // demi-épaisseur dessinée des plaques
const COUNTER = { x: 281, y: 206, w: 214, h: 46 };
const LOCKS = [[231, 150], [281, 140], [331, 150]];
const ARROWS = [[188, 700], [374, 700]];
const CHEVRONS = [674, 699, 724];
const BEACONS = [[44, 246], [518, 246]];
const RACKS = [[24, 318, 30, 150], [508, 318, 30, 150]];

// ------------------------------------------------------------------ calque statique
// (mis en cache par secteur et niveau : indépendant du coffre en cours)
export function drawVaultStatic(g, r) {
  const font = (r && r.fontD) || '"Orbitron", sans-serif';
  g.save();
  // salle des coffres : halo violet autour du coffre, sol en tôle larmée
  g.beginPath(); g.moveTo(20, 740); g.lineTo(20, 300); g.arc(300, 300, 280, Math.PI, TAU); g.lineTo(542, 740); g.closePath();
  g.clip();
  const rg = g.createRadialGradient(VC.x, VC.y, 30, VC.x, VC.y, 430);
  rg.addColorStop(0, 'rgba(120,70,220,0.22)'); rg.addColorStop(0.45, 'rgba(70,30,140,0.10)'); rg.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = rg; g.fillRect(20, 0, 522, 740);
  treadPlate(g, 20, 20, 542, 740);
  circuits(g, 30, 40, 530, 720, 26, VIOLET, 911, 0.10);
  // porte du coffre : couronne d'acier, pênes radiaux, bande de danger
  const ring = (r0, r1, fill) => { g.beginPath(); g.arc(VC.x, VC.y, r1, 0, TAU); g.arc(VC.x, VC.y, r0, 0, TAU, true); g.fillStyle = fill; g.fill(); };
  ring(166, 196, 'rgba(14,9,28,0.55)');
  g.strokeStyle = 'rgba(80,64,130,0.35)'; g.lineWidth = 1.5;
  g.beginPath(); g.arc(VC.x, VC.y, 196, 0, TAU); g.stroke();
  g.beginPath(); g.arc(VC.x, VC.y, 166, 0, TAU); g.stroke();
  for (let k = 0; k < 24; k++) {
    const a = k * TAU / 24;
    g.save(); g.translate(VC.x + Math.cos(a) * 181, VC.y + Math.sin(a) * 181); g.rotate(a);
    g.fillStyle = 'rgba(52,42,90,0.32)'; g.fillRect(-11, -5, 22, 10);
    g.fillStyle = 'rgba(200,190,255,0.08)'; g.fillRect(-11, -5, 22, 2);
    g.restore();
  }
  // bande de danger (secteurs alternés)
  for (let k = 0; k < 64; k++) {
    const a0 = k * TAU / 64, a1 = a0 + TAU / 64;
    g.beginPath(); g.arc(VC.x, VC.y, 206, a0, a1); g.arc(VC.x, VC.y, 199, a1, a0, true); g.closePath();
    g.fillStyle = k % 2 ? 'rgba(10,8,4,0.45)' : rgba(AMBER, 0.2); g.fill();
  }
  // graduations du cadran (combinaison)
  g.strokeStyle = rgba(VIOLET, 0.35); g.lineWidth = 1;
  g.beginPath();
  for (let k = 0; k < 72; k++) {
    const a = k * TAU / 72, r0 = k % 6 ? 160 : 152;
    g.moveTo(VC.x + Math.cos(a) * r0, VC.y + Math.sin(a) * r0); g.lineTo(VC.x + Math.cos(a) * 164, VC.y + Math.sin(a) * 164);
  }
  g.stroke();
  // inscription gravée le long de la porte
  arcText(g, 'NULL//BANK · CRYPTO-COFFRE Nº 9 · ACCÈS INTERDIT', VC.x, VC.y, 214, -Math.PI / 2, 9, rgba(VIOLET, 0.55), font);
  // couloirs de tir vers le coffre (flèches et chevrons)
  for (const [x, y] of ARROWS) insertBase(g, 'arrow', x, y, 15, GOLD, Math.atan2(VC.y - y, VC.x - x) + Math.PI / 2);
  for (const y of CHEVRONS) insertBase(g, 'chevron', VC.x, y, 13, RED, 0);
  // voyants de progression (3 coffres)
  for (const [x, y] of LOCKS) insertBase(g, 'hex', x, y, 13, GOLD, 0);
  // compteur de butin
  g.fillStyle = 'rgba(6,4,12,0.88)';
  roundRect(g, COUNTER.x - COUNTER.w / 2, COUNTER.y - COUNTER.h / 2, COUNTER.w, COUNTER.h, 9); g.fill();
  g.strokeStyle = rgba(GOLD, 0.55); g.lineWidth = 2; g.stroke();
  g.strokeStyle = 'rgba(255,255,255,0.12)'; g.lineWidth = 1;
  roundRect(g, COUNTER.x - COUNTER.w / 2 + 4, COUNTER.y - COUNTER.h / 2 + 4, COUNTER.w - 8, COUNTER.h - 8, 6); g.stroke();
  for (const [dx, dy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) screw(g, COUNTER.x + dx * (COUNTER.w / 2 - 8), COUNTER.y + dy * (COUNTER.h / 2 - 8), 2);
  paint(g, 'BUTIN', COUNTER.x, COUNTER.y - COUNTER.h / 2 - 9, 10, GOLD, { spacing: 3, alpha: 0.85 });
  // baies de serveurs le long des murs
  for (const [x, y, w, h] of RACKS) {
    g.fillStyle = '#0b0816'; g.fillRect(x, y, w, h);
    g.strokeStyle = '#2c2445'; g.lineWidth = 1.5; g.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
    for (let yy = y + 8; yy < y + h - 4; yy += 14) {
      g.fillStyle = '#16112a'; g.fillRect(x + 4, yy, w - 8, 9);
      g.fillStyle = 'rgba(176,123,255,0.18)'; g.fillRect(x + 4, yy, w - 8, 1);
    }
  }
  // lingots peints (piles de butin) au-dessus des slingshots
  for (const [x, y, s] of [[98, 700, 1], [464, 700, -1]]) goldStack(g, x, y, s);
  // supports des gyrophares
  for (const [x, y] of BEACONS) {
    g.fillStyle = '#1a1428'; g.beginPath(); g.arc(x, y, 12, 0, TAU); g.fill();
    g.strokeStyle = '#4a3f6e'; g.lineWidth = 2; g.stroke();
  }
  paint(g, 'PERCEZ LE NOYAU', VC.x, 652, 11, rgba(GOLD, 0.9), { spacing: 2, alpha: 0.6 });
  g.restore();
}

function roundRect(g, x, y, w, h, rr) {
  g.beginPath();
  if (g.roundRect) { g.roundRect(x, y, w, h, rr); return; }
  g.rect(x, y, w, h);
}

// tôle larmée : petits losanges en relief, très discrets
function treadPlate(g, x0, y0, x1, y1) {
  g.fillStyle = 'rgba(255,255,255,0.025)';
  for (let y = y0; y < y1; y += 18) {
    for (let x = x0 + ((y / 18) % 2 ? 9 : 0); x < x1; x += 18) {
      g.save(); g.translate(x, y); g.rotate(((x + y) / 18) % 2 ? 0.7 : -0.7);
      g.fillRect(-5, -1.2, 10, 2.4);
      g.restore();
    }
  }
}

// texte gravé le long d'un arc (centré sur l'angle a)
function arcText(g, str, cx, cy, R, a, size, color, font) {
  g.save();
  g.font = `700 ${size}px ${font}`;
  g.fillStyle = color; g.textAlign = 'center'; g.textBaseline = 'middle';
  const chars = [...str];
  const widths = chars.map(c => g.measureText(c).width + 1.2);
  const total = widths.reduce((s, w) => s + w, 0);
  let ang = a - total / R / 2;
  for (let i = 0; i < chars.length; i++) {
    const w = widths[i], am = ang + w / R / 2;
    g.save(); g.translate(cx + Math.cos(am) * R, cy + Math.sin(am) * R); g.rotate(am + Math.PI / 2);
    g.fillText(chars[i], 0, 0);
    g.restore();
    ang += w / R;
  }
  g.restore();
}

function goldStack(g, x, y, s) {
  const rows = [[0, 0], [-14, 0], [14, 0], [-7, -9], [7, -9], [0, -18]];
  for (const [dx, dy] of rows) bar(g, x + dx * s, y + dy, 0, 0.55);
}

// lingot d'or (coordonnées locales centrées), alpha global a
function bar(g, x, y, rot, a = 1) {
  g.save(); g.translate(x, y); if (rot) g.rotate(rot);
  g.globalAlpha *= a;
  g.fillStyle = '#7a5410';
  g.beginPath(); g.moveTo(-12, 5); g.lineTo(12, 5); g.lineTo(9, -5); g.lineTo(-9, -5); g.closePath(); g.fill();
  g.fillStyle = '#ffd84a';
  g.beginPath(); g.moveTo(-9, -5); g.lineTo(9, -5); g.lineTo(7, -1); g.lineTo(-7, -1); g.closePath(); g.fill();
  g.fillStyle = '#e8a91c'; g.fillRect(-11, -1, 22, 5);
  g.fillStyle = 'rgba(255,255,255,0.75)'; g.fillRect(-6, -4.2, 6, 1.4);
  g.restore();
}

// ------------------------------------------------------------------ rendu dynamique (sous la bille)
export function renderVault(ctx, r, mg) {
  const t = r.time;
  drawRoomLights(ctx, r, mg, t);
  drawVaultBody(ctx, r, mg, t);
  drawLoot(ctx, r, mg, t);
  drawCounter(ctx, r, mg, t);
}

function drawRoomLights(ctx, r, mg, t) {
  // voyants de progression
  LOCKS.forEach(([x, y], i) => {
    const done = i < mg.cracked, cur = i === mg.cracked && !mg.won;
    const k = done ? 1 : cur ? 0.35 + 0.35 * Math.sin(t * 6) : 0;
    insertLit(ctx, 'hex', x, y, 13, done ? GOLD : VAULTS[i].color, k);
    if (done) r.glow(x, y, 54, GOLD, 0.5);
    r.text(done ? '✓' : String(i + 1), x, y + 1, 12, done ? '#2a1a00' : '#e8e0ff', 'center', done ? 1 : 0.75, true);
  });
  // baies de serveurs : diodes qui clignotent
  for (const [x, y, w, h] of RACKS) {
    for (let yy = y + 8, row = 0; yy < y + h - 4; yy += 14, row++) {
      for (let c = 0; c < 3; c++) {
        const on = Math.sin(t * (3 + c * 1.7) + row * 2.1 + x) > 0.2;
        ctx.fillStyle = on ? (row % 3 === 0 ? '#5dff8f' : c === 2 ? AMBER : VIOLET) : '#221a3a';
        ctx.fillRect(x + 7 + c * 6, yy + 3, 3, 3);
      }
    }
  }
  // couloirs de tir : flèches dorées, chevrons rouges en séquence pendant l'alignement
  const al = mg.alignK;
  for (const [x, y] of ARROWS) insertLit(ctx, 'arrow', x, y, 15, GOLD, 0.25 + 0.2 * Math.sin(t * 3 + x) + al * 0.5, Math.atan2(VC.y - y, VC.x - x) + Math.PI / 2);
  CHEVRONS.forEach((y, i) => {
    const seq = (Math.floor(t * 9) % 3) === 2 - i;
    insertLit(ctx, 'chevron', VC.x, y, 13, RED, al > 0.1 ? (seq ? 1 : 0.35) * al : 0.12);
  });
  // gyrophares (assemblage d'un coffre, fin du chrono)
  const alarm = mg.alarmT > 0 || (mg.timeLeft < 10 && mg.state === 'play');
  for (const [x, y] of BEACONS) {
    const a = t * 7 + x;
    ctx.fillStyle = alarm ? (Math.sin(t * 14) > 0 ? '#ff7088' : RED) : '#3a1020';
    ctx.beginPath(); ctx.arc(x, y, 7, 0, TAU); ctx.fill();
    if (!alarm) continue;
    r.glow(x, y, 70, RED, 0.7);
    ctx.globalCompositeOperation = 'lighter';
    for (const s of [0, Math.PI]) {
      const g = ctx.createRadialGradient(x, y, 4, x, y, 150);
      g.addColorStop(0, rgba(RED, 0.35)); g.addColorStop(1, rgba(RED, 0));
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.arc(x, y, 150, a + s - 0.28, a + s + 0.28); ctx.closePath(); ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';
  }
}

// plaque : quadrilatère entre les rayons R - T et R + T (colle à la capsule physique)
function plateQuad(ctx, a0, a1, R, cx = VC.x, cy = VC.y) {
  const c0 = Math.cos(a0), s0 = Math.sin(a0), c1 = Math.cos(a1), s1 = Math.sin(a1);
  ctx.moveTo(cx + c0 * (R + T), cy + s0 * (R + T));
  ctx.lineTo(cx + c1 * (R + T), cy + s1 * (R + T));
  ctx.lineTo(cx + c1 * (R - T), cy + s1 * (R - T));
  ctx.lineTo(cx + c0 * (R - T), cy + s0 * (R - T));
  ctx.closePath();
}

function ringGrad(ctx, mg, R, color) {
  if (!mg._grads) mg._grads = new Map();
  const key = R + color;
  let g = mg._grads.get(key);
  if (!g) {
    g = ctx.createRadialGradient(VC.x, VC.y, R - T, VC.x, VC.y, R + T);
    g.addColorStop(0, '#1a1230'); g.addColorStop(0.25, '#5d5290'); g.addColorStop(0.5, '#c8c0f0');
    g.addColorStop(0.62, '#7d72b4'); g.addColorStop(1, '#171028');
    mg._grads.set(key, g);
  }
  return g;
}

function drawVaultBody(ctx, r, mg, t) {
  const V = mg.vdef, col = V.color;
  const phase = mg.phase;
  const outer = mg.outerR();
  const build = phase === 'build' ? Math.min(1, mg.phaseT / 1.15) : 1;
  // fond du coffre : disque sombre, rails des anneaux
  if (phase !== 'open') {
    ctx.fillStyle = 'rgba(5,3,12,0.72)';
    ctx.beginPath(); ctx.arc(VC.x, VC.y, (outer + 14) * (0.6 + 0.4 * build), 0, TAU); ctx.fill();
    ctx.strokeStyle = rgba(col, 0.28); ctx.lineWidth = 1;
    ctx.setLineDash([3, 6]);
    for (const ring of mg.rings) { ctx.beginPath(); ctx.arc(VC.x, VC.y, ring.R, 0, TAU); ctx.stroke(); }
    ctx.setLineDash([]);
  }
  // halo du noyau
  const pulse = 0.5 + 0.5 * Math.sin(t * 4);
  const open = phase === 'open';
  r.glow(VC.x, VC.y, open ? 200 : 170 + pulse * 30, open ? GOLD : col, open ? 0.25 + mg.coreFlash * 0.6 : 0.32 + mg.coreFlash * 0.6);
  // champ du noyau (zone de perçage)
  if (phase === 'armed') {
    const fr = mg.rings[0] ? mg.rings[0].R * Math.cos(Math.PI / mg.rings[0].n) - T : 40;
    ctx.strokeStyle = rgba(GOLD, 0.25 + 0.2 * pulse); ctx.lineWidth = 1.5;
    ctx.setLineDash([2, 5]); ctx.lineDashOffset = -t * 20;
    ctx.beginPath(); ctx.arc(VC.x, VC.y, fr, 0, TAU); ctx.stroke();
    ctx.setLineDash([]);
  }
  drawCore(ctx, r, mg, t, col);
  // anneaux
  for (const ring of mg.rings) drawRing(ctx, r, mg, ring, t, col, build);
  // étiquette du coffre
  const ly = VC.y + outer + 22;
  if (phase === 'build') r.text('VERROUILLAGE…', VC.x, ly, 12, col, 'center', 0.5 + 0.5 * Math.sin(t * 12), true);
  else if (phase === 'armed') r.text(`${V.name} · ${mg.vIdx + 1}/${VAULTS.length}`, VC.x, ly, 11, col, 'center', 0.75, true);
  else if (!mg.won) r.text('COFFRE PERCÉ', VC.x, VC.y + 4, 16, GOLD, 'center', 0.6 + 0.4 * Math.sin(t * 10), true);
}

function drawCore(ctx, r, mg, t, col) {
  const open = mg.phase === 'open';
  const x = VC.x, y = VC.y;
  if (open) {
    // noyau éventré : cratère lumineux qui s'éteint
    const k = Math.max(0, 1 - mg.phaseT / 1.7);
    r.glow(x, y, 120, '#ffffff', k * 0.8);
    ctx.strokeStyle = rgba(GOLD, 0.5 * k + 0.15); ctx.lineWidth = 2;
    for (let i = 0; i < 6; i++) {
      const a = i * TAU / 6 + 0.3;
      ctx.beginPath(); ctx.moveTo(x + Math.cos(a) * 8, y + Math.sin(a) * 8); ctx.lineTo(x + Math.cos(a + 0.2) * (CORE_R + 6), y + Math.sin(a + 0.2) * (CORE_R + 6)); ctx.stroke();
    }
    ctx.fillStyle = 'rgba(8,4,14,0.8)';
    ctx.beginPath(); ctx.arc(x, y, 10, 0, TAU); ctx.fill();
    return;
  }
  const build = mg.phase === 'build' ? Math.min(1, mg.phaseT / 1.15) : 1;
  const R = CORE_R * (0.4 + 0.6 * build);
  const g = ctx.createRadialGradient(x - R * 0.3, y - R * 0.35, 2, x, y, R);
  g.addColorStop(0, '#ffffff'); g.addColorStop(0.3, '#fff2b8'); g.addColorStop(0.62, GOLD); g.addColorStop(0.85, col); g.addColorStop(1, '#2a1240');
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(x, y, R, 0, TAU); ctx.fill();
  // facettes cristallines en rotation
  ctx.strokeStyle = 'rgba(60,20,90,0.55)'; ctx.lineWidth = 1.2;
  ctx.beginPath();
  for (let k = 0; k < 6; k++) {
    const a = t * 0.8 + k * TAU / 6, a2 = a + TAU / 6;
    ctx.moveTo(x + Math.cos(a) * R * 0.92, y + Math.sin(a) * R * 0.92);
    ctx.lineTo(x + Math.cos(a2) * R * 0.92, y + Math.sin(a2) * R * 0.92);
    ctx.moveTo(x + Math.cos(a) * R * 0.92, y + Math.sin(a) * R * 0.92);
    ctx.lineTo(x + Math.cos(a + TAU / 12) * R * 0.45, y + Math.sin(a + TAU / 12) * R * 0.45);
  }
  ctx.stroke();
  r.text('₵', x, y + 1, Math.round(R * 0.9), 'rgba(70,30,0,0.75)', 'center', 1, true);
  // anneau de glyphes en orbite
  ctx.globalCompositeOperation = 'lighter';
  ctx.strokeStyle = rgba(col, 0.75); ctx.lineWidth = 2;
  for (let k = 0; k < 3; k++) {
    const a = -t * 2.2 + k * TAU / 3;
    ctx.beginPath(); ctx.arc(x, y, R + 6, a, a + 0.9); ctx.stroke();
  }
  ctx.globalCompositeOperation = 'source-over';
  if (mg.coreFlash > 0) r.glow(x, y, 140, '#ffffff', mg.coreFlash);
}

function drawRing(ctx, r, mg, ring, t, col, build) {
  const R = ring.R, P = ring.plates, n = ring.n;
  const building = mg.phase === 'build';
  const drill = mg.drillFx > 0;
  // corps des plaques
  for (const pl of P) {
    if (!pl.alive) continue;
    let a0 = ring.ang + pl.i * ring.step, a1 = a0 + ring.step;
    let RR = R, alpha = pl.pending ? 0.35 : 1;
    if (building) {
      // assemblage : les plaques arrivent en spirale de l'extérieur
      const u = Math.max(0, Math.min(1, (mg.phaseT - pl.delay) / 0.7));
      const e = 1 - Math.pow(1 - u, 3);
      RR = R + (1 - e) * 240;
      const sp = (1 - e) * 1.6 * Math.sign(ring.w || 1);
      a0 -= sp; a1 -= sp;
      alpha = u;
      if (u <= 0) continue;
    }
    ctx.globalAlpha = alpha;
    ctx.beginPath(); plateQuad(ctx, a0, a1, RR);
    ctx.fillStyle = building ? '#4a3f72' : ringGrad(ctx, mg, R, col);
    ctx.fill();
    // échauffement (frottement, fissures) et éclair d'impact
    const hot = Math.max(pl.heat, pl.hp < pl.hpMax ? 0.35 : 0);
    if (hot > 0.02 || pl.flash > 0.02) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = pl.flash > 0.02 ? rgba('#ffffff', 0.7 * pl.flash) : rgba('#ff7a2e', 0.35 * hot);
      ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
    }
    ctx.strokeStyle = 'rgba(0,0,0,0.65)'; ctx.lineWidth = 1.2; ctx.stroke();
    // liseré néon de l'arête extérieure
    const c0 = Math.cos(a0), s0 = Math.sin(a0), c1 = Math.cos(a1), s1 = Math.sin(a1);
    ctx.strokeStyle = rgba(col, 0.9); ctx.lineWidth = 1.8;
    ctx.beginPath(); ctx.moveTo(VC.x + c0 * (RR + T - 1), VC.y + s0 * (RR + T - 1)); ctx.lineTo(VC.x + c1 * (RR + T - 1), VC.y + s1 * (RR + T - 1)); ctx.stroke();
    ctx.strokeStyle = rgba(col, 0.35); ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(VC.x + c0 * (RR - T + 1), VC.y + s0 * (RR - T + 1)); ctx.lineTo(VC.x + c1 * (RR - T + 1), VC.y + s1 * (RR - T + 1)); ctx.stroke();
    // rivets
    ctx.fillStyle = 'rgba(220,210,255,0.55)';
    for (const u of [0.22, 0.78]) {
      const a = a0 + (a1 - a0) * u, ru = RR * Math.cos((a1 - a0) / 2) / Math.cos((a1 - a0) * (u - 0.5));
      ctx.beginPath(); ctx.arc(VC.x + Math.cos(a) * ru, VC.y + Math.sin(a) * ru, 1.3, 0, TAU); ctx.fill();
    }
    // fissures
    if (pl.cracks && !building) drawCracks(ctx, pl, a0, a1, RR, t);
    ctx.globalAlpha = 1;
  }
  if (building) return;
  // arêtes des brèches : lumière vive du côté ouvert (lisibilité des ouvertures)
  ctx.globalCompositeOperation = 'lighter';
  for (const pl of P) {
    if (!pl.alive) continue;
    for (const side of [-1, 1]) {
      const nb = P[(pl.i + side + n) % n];
      if (nb.alive) continue;
      const a = ring.ang + (side < 0 ? pl.i : pl.i + 1) * ring.step;
      const c = Math.cos(a), s = Math.sin(a);
      ctx.strokeStyle = rgba(col, 0.95); ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.moveTo(VC.x + c * (R - T - 1), VC.y + s * (R - T - 1)); ctx.lineTo(VC.x + c * (R + T + 1), VC.y + s * (R + T + 1)); ctx.stroke();
      ctx.drawImage(glowSprite(col, 32), VC.x + c * R - 12, VC.y + s * R - 12, 24, 24);
    }
  }
  if (drill) {
    // perceuse thermique : étincelles orange sur tout le blindage au départ
    ctx.strokeStyle = rgba('#ff9a3d', 0.8 * Math.min(1, mg.drillFx)); ctx.lineWidth = 2;
    for (let k = 0; k < 6; k++) {
      const a = t * 9 + k * TAU / 6 + ring.k;
      ctx.beginPath(); ctx.arc(VC.x, VC.y, R, a, a + 0.18); ctx.stroke();
    }
  }
  ctx.globalCompositeOperation = 'source-over';
}

// fissures : u le long de la plaque, v en travers (−1 intérieur → +1 extérieur)
function drawCracks(ctx, pl, a0, a1, R, t) {
  const c0 = Math.cos(a0), s0 = Math.sin(a0), c1 = Math.cos(a1), s1 = Math.sin(a1);
  const ax = VC.x + c0 * R, ay = VC.y + s0 * R, bx = VC.x + c1 * R, by = VC.y + s1 * R;
  const am = (a0 + a1) / 2, nx = Math.cos(am), ny = Math.sin(am);
  const P = (u, v) => [ax + (bx - ax) * u + nx * v * T, ay + (by - ay) * u + ny * v * T];
  const glow = 0.55 + 0.45 * Math.sin(t * 9 + pl.i);
  for (const [w, colr] of [[2.2, 'rgba(10,4,0,0.9)'], [1, rgba('#ff9a3d', glow)]]) {
    ctx.strokeStyle = colr; ctx.lineWidth = w;
    ctx.beginPath();
    for (const pts of pl.cracks) {
      const p0 = P(pts[0][0], pts[0][1]);
      ctx.moveTo(p0[0], p0[1]);
      for (let i = 1; i < pts.length; i++) { const p = P(pts[i][0], pts[i][1]); ctx.lineTo(p[0], p[1]); }
    }
    ctx.stroke();
  }
}

function drawLoot(ctx, r, mg, t) {
  for (const L of mg.loot) {
    const left = L.life - L.t;
    const a = left < 1.6 ? (Math.sin(t * 22) > 0 ? 1 : 0.35) : Math.min(1, L.t * 6);
    const big = L.kind === 'bar';
    r.glow(L.x, L.y, big ? 52 : 36, GOLD, 0.55 * a);
    ctx.globalAlpha = a;
    if (big) bar(ctx, L.x, L.y, Math.sin(L.spin) * 0.35);
    else {
      const w = Math.abs(Math.cos(L.spin)) * 8 + 1.5;
      ctx.fillStyle = '#b8860b';
      ctx.beginPath(); ctx.ellipse(L.x, L.y, w, 8, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = GOLD;
      ctx.beginPath(); ctx.ellipse(L.x, L.y, Math.max(0.5, w - 1.6), 6.4, 0, 0, TAU); ctx.fill();
      if (w > 6) r.text('₵', L.x, L.y + 0.5, 9, '#7a5410', 'center', a, true);
    }
    ctx.globalAlpha = 1;
  }
}

function drawCounter(ctx, r, mg, t) {
  const v = Math.round(mg.lootShown);
  const rolling = mg.lootShown < mg.lootTotal - 1;
  const s = '₵ ' + fmt(v);
  r.text(s, COUNTER.x, COUNTER.y + 1, 22, rolling ? '#fff6c8' : GOLD, 'center', 1, true);
  if (rolling) r.glow(COUNTER.x, COUNTER.y, 220, GOLD, 0.35);
  if (mg.lootChain >= 2) r.text(`RAFLE ×${mg.lootChain}`, COUNTER.x + COUNTER.w / 2 - 4, COUNTER.y + COUNTER.h / 2 + 10, 10, GOLD, 'right', 0.6 + 0.4 * Math.sin(t * 14), true);
}

// ------------------------------------------------------------------ par-dessus la bille
export function renderVaultTop(ctx, r, mg) {
  const t = r.time;
  if (mg.alignK > 0.02 && mg.aligned) drawLaser(ctx, r, mg, t);
  // débris de plaques
  for (const d of mg.debris) {
    const k = 1 - d.t / d.life;
    ctx.save();
    ctx.translate(d.x, d.y); ctx.rotate(d.a);
    ctx.globalAlpha = Math.min(1, k * 1.5);
    ctx.fillStyle = '#5a4f86';
    ctx.fillRect(-d.half, -T, d.half * 2, T * 2);
    ctx.strokeStyle = rgba(d.color, 0.9); ctx.lineWidth = 1.2;
    ctx.strokeRect(-d.half, -T, d.half * 2, T * 2);
    ctx.strokeStyle = 'rgba(255,170,80,0.9)';
    ctx.beginPath(); ctx.moveTo(-d.half * 0.3, -T); ctx.lineTo(d.half * 0.1, T); ctx.stroke();
    ctx.restore();
  }
  // onde de choc du perçage
  if (mg.pierceFx > 0) {
    const u = 1 - mg.pierceFx;
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = rgba(GOLD, 0.9 * (1 - u)); ctx.lineWidth = 10 * (1 - u) + 2;
    ctx.beginPath(); ctx.arc(VC.x, VC.y, 30 + u * 320, 0, TAU); ctx.stroke();
    ctx.strokeStyle = rgba('#ffffff', 0.8 * (1 - u)); ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(VC.x, VC.y, 20 + u * 220, 0, TAU); ctx.stroke();
    ctx.globalCompositeOperation = 'source-over';
  }
  if (mg.jackpotFx > 0) {
    const a = Math.min(1, mg.jackpotFx / 0.5);
    const j = Math.sin(t * 37) > 0.5 ? 3 : 1.5;
    ctx.globalCompositeOperation = 'lighter';
    r.text('JACKPOT', VC.x - j, VC.y - 2, 40, '#ff3df2', 'center', a * 0.55, true);
    r.text('JACKPOT', VC.x + j, VC.y - 2, 40, '#29e3ff', 'center', a * 0.55, true);
    ctx.globalCompositeOperation = 'source-over';
    r.text('JACKPOT', VC.x, VC.y - 2, 40, GOLD, 'center', a, true);
    r.text('BUTIN DOUBLÉ', VC.x, VC.y + 30, 13, '#fff6c8', 'center', a * 0.9, true);
  }
}

// laser de visée : du noyau vers les batteurs, à travers les brèches alignées
function drawLaser(ctx, r, mg, t) {
  const A = mg.aligned.a, k = mg.alignK;
  const c = Math.cos(A), s = Math.sin(A);
  const L = (905 - VC.y) / Math.max(0.3, s);
  const x1 = VC.x + c * L, y1 = VC.y + s * L;
  const fl = 0.75 + 0.25 * Math.sin(t * 60);
  ctx.globalCompositeOperation = 'lighter';
  ctx.lineCap = 'round';
  ctx.strokeStyle = rgba(RED, 0.18 * k); ctx.lineWidth = 18;
  ctx.beginPath(); ctx.moveTo(VC.x, VC.y); ctx.lineTo(x1, y1); ctx.stroke();
  ctx.strokeStyle = rgba('#ff5a7a', 0.65 * k * fl); ctx.lineWidth = 4;
  ctx.beginPath(); ctx.moveTo(VC.x, VC.y); ctx.lineTo(x1, y1); ctx.stroke();
  ctx.strokeStyle = rgba('#ffffff', 0.9 * k * fl); ctx.lineWidth = 1.3;
  ctx.beginPath(); ctx.moveTo(VC.x, VC.y); ctx.lineTo(x1, y1); ctx.stroke();
  // impulsions qui descendent le faisceau
  for (let i = 0; i < 4; i++) {
    const u = ((t * 1.6 + i / 4) % 1);
    ctx.drawImage(glowSprite(RED, 32), VC.x + c * L * u - 9, VC.y + s * L * u - 9, 18, 18);
  }
  ctx.globalCompositeOperation = 'source-over';
  // réticule au pied du faisceau
  const rr = 16 + 3 * Math.sin(t * 8);
  ctx.strokeStyle = rgba(RED, 0.85 * k); ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(x1, y1 - 30, rr, 0, TAU); ctx.stroke();
  ctx.beginPath();
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { ctx.moveTo(x1 + dx * (rr - 6), y1 - 30 + dy * (rr - 6)); ctx.lineTo(x1 + dx * (rr + 6), y1 - 30 + dy * (rr + 6)); }
  ctx.stroke();
  r.glow(VC.x, VC.y, 90, RED, 0.5 * k);
  r.text('ALIGNEMENT — TIREZ DANS L\'AXE !', VC.x, 740, 13, '#ff8aa0', 'center', k * (0.65 + 0.35 * Math.sin(t * 12)), true);
}
