// Rendu du minijeu LABYRINTHE GYROSCOPIQUE (secteur CONDUITS) : conduits vus de dessus
// (plaques de sol rivetées, murs en tuyaux chromés), trappes, balises, flèches d'accélération,
// clés de données, capsules, portes laser, sortie, et indicateur de gravité autour de la bille
// (flèche, lueur sur le bord du labyrinthe dans la direction de la chute, anneau du frein).
// Géométrie partagée avec la logique (maze.js, mazeGen.js).
import { rgba, TAU, mulberry32 } from '../util/math.js';
import { glowSprite } from '../render/sprites.js';
import { chrome, paint, hazard } from '../render/artKit.js';
import { MZ, wallSegments, cellCenter } from './mazeGen.js';

const { COLS, ROWS, CS, X0, Y0 } = MZ;
const X1 = X0 + COLS * CS, Y1 = Y0 + ROWS * CS;
const SILVER = '#cfe0ff', GOLD = '#ffd84a', LIME = '#5dff8f', RED = '#ff3d6e', CYAN = '#29e3ff', MAG = '#ff3df2';
const DISPLAY = '"Orbitron", "Rajdhani", sans-serif';

export function drawMazeStatic(g, r, mg) {
  // machinerie autour du labyrinthe
  g.fillStyle = '#070a12'; g.fillRect(0, 20, 600, 1090);
  const rnd = mulberry32(73);
  for (let k = 0; k < 40; k++) {
    const x = rnd() < 0.5 ? rnd() * X0 : X1 + rnd() * (580 - X1), y = 30 + rnd() * 1040;
    g.fillStyle = rgba(SILVER, 0.05 + rnd() * 0.06); g.fillRect(x, y, 3 + rnd() * 10, 1.5);
  }
  // plaques de sol : une par cellule, rivets aux coins, rainure centrale
  for (let rr = 0; rr < ROWS; rr++) for (let c = 0; c < COLS; c++) {
    const x = X0 + c * CS, y = Y0 + rr * CS;
    const pg = g.createLinearGradient(x, y, x + CS, y + CS);
    pg.addColorStop(0, '#1a2233'); pg.addColorStop(1, '#10151f');
    g.fillStyle = pg; g.fillRect(x + 1, y + 1, CS - 2, CS - 2);
    g.strokeStyle = 'rgba(207,224,255,0.07)'; g.lineWidth = 1;
    g.strokeRect(x + 6.5, y + 6.5, CS - 13, CS - 13);
    for (const [px, py] of [[x + 10, y + 10], [x + CS - 10, y + 10], [x + 10, y + CS - 10], [x + CS - 10, y + CS - 10]]) {
      g.fillStyle = 'rgba(0,0,0,0.5)'; g.beginPath(); g.arc(px + 0.6, py + 0.8, 1.6, 0, TAU); g.fill();
      g.fillStyle = 'rgba(207,224,255,0.25)'; g.beginPath(); g.arc(px, py, 1.3, 0, TAU); g.fill();
    }
  }
  // départ : plot cerclé
  const [sx, sy] = cellCenter(...mg.plan.start);
  g.strokeStyle = rgba(SILVER, 0.5); g.lineWidth = 2; g.beginPath(); g.arc(sx, sy, 22, 0, TAU); g.stroke();
  paint(g, 'DÉPART', sx, sy + 30, 6, rgba(SILVER, 0.6), { font: DISPLAY });
  // sortie : cadre du sas
  const [ex, ey] = cellCenter(...mg.plan.exit);
  g.fillStyle = '#05070c'; g.beginPath(); g.arc(ex, ey, 27, 0, TAU); g.fill();
  chrome(g, Array.from({ length: 33 }, (_, k) => [ex + Math.cos(k * TAU / 32) * 27, ey + Math.sin(k * TAU / 32) * 27]), 4, { glow: SILVER });
  paint(g, 'SORTIE', ex, ey + 4, 7, rgba(SILVER, 0.75), { font: DISPLAY });
  // trappes : puits sombre, liseré de danger
  for (const T of mg.traps) {
    g.fillStyle = 'rgba(255,61,110,0.18)'; g.beginPath(); g.arc(T.x, T.y, 22, 0, TAU); g.fill();
    hazard(g, Array.from({ length: 24 }, (_, k) => [T.x + Math.cos(k * TAU / 24) * 21, T.y + Math.sin(k * TAU / 24) * 21]), '#ffb52e', 0.6, 5);
    const hg = g.createRadialGradient(T.x, T.y, 2, T.x, T.y, 17);
    hg.addColorStop(0, '#000000'); hg.addColorStop(0.75, '#04020a'); hg.addColorStop(1, '#2a1018');
    g.fillStyle = hg; g.beginPath(); g.arc(T.x, T.y, 17, 0, TAU); g.fill();
  }
  // flèches d'accélération peintes au sol
  for (const B of mg.boosts) {
    g.save(); g.translate(B.x, B.y); g.rotate(Math.atan2(B.dy, B.dx));
    g.strokeStyle = rgba(CYAN, 0.35); g.lineWidth = 4; g.lineCap = 'round'; g.lineJoin = 'round';
    for (const o of [-14, 0, 14]) { g.beginPath(); g.moveTo(o - 6, -10); g.lineTo(o + 4, 0); g.lineTo(o - 6, 10); g.stroke(); }
    g.restore();
  }
  // balises (éteintes)
  for (const C of mg.checks) {
    g.strokeStyle = rgba(LIME, 0.3); g.lineWidth = 2;
    g.beginPath(); g.arc(C.x, C.y, 18, 0, TAU); g.stroke();
    g.beginPath(); g.arc(C.x, C.y, 9, 0, TAU); g.stroke();
  }
  // murs : tuyaux chromés
  for (const [ax, ay, bx, by] of wallSegments(mg.plan)) chrome(g, [[ax, ay], [bx, by]], 8, { glow: SILVER });
  // émetteurs des portes laser
  for (const D of mg.doors) {
    const [ax, ay, bx, by] = D.s;
    for (const [x, y] of [[ax, ay], [bx, by]]) { g.fillStyle = '#2a0a12'; g.beginPath(); g.arc(x, y, 5, 0, TAU); g.fill(); g.strokeStyle = RED; g.lineWidth = 1.2; g.stroke(); }
  }
  // inscription sur le bandeau du bas
  paint(g, 'CONDUITS · GAINE 12', 281, Y1 + 30, 9, rgba(SILVER, 0.45), { font: DISPLAY });
}

export function renderMaze(ctx, r, mg) {
  const t = r.time;
  // trappes scellées : grille posée par-dessus (clignote avant de s'ouvrir)
  if (mg.sealT > 0) {
    const a = mg.sealT < 2 ? (Math.sin(t * 16) > 0 ? 0.9 : 0.3) : 0.9;
    for (const T of mg.traps) {
      ctx.fillStyle = rgba('#3a4458', a); ctx.beginPath(); ctx.arc(T.x, T.y, 18, 0, TAU); ctx.fill();
      ctx.strokeStyle = rgba(SILVER, a * 0.8); ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (const o of [-9, 0, 9]) { ctx.moveTo(T.x + o, T.y - 15); ctx.lineTo(T.x + o, T.y + 15); ctx.moveTo(T.x - 15, T.y + o); ctx.lineTo(T.x + 15, T.y + o); }
      ctx.stroke();
    }
  }
  // balises allumées
  for (const C of mg.checks) {
    if (!C.on && C.flash <= 0) continue;
    r.glow(C.x, C.y, 70, LIME, 0.35 + 0.4 * C.flash);
    ctx.strokeStyle = LIME; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.arc(C.x, C.y, 18, 0, TAU); ctx.stroke();
    ctx.fillStyle = rgba(LIME, 0.6); ctx.beginPath(); ctx.arc(C.x, C.y, 7, 0, TAU); ctx.fill();
  }
  // flèches : lueur au passage, chevrons qui défilent
  for (const B of mg.boosts) {
    const k = 0.3 + 0.7 * B.flash;
    ctx.save(); ctx.translate(B.x, B.y); ctx.rotate(Math.atan2(B.dy, B.dx));
    const off = (t * 40) % 14;
    ctx.strokeStyle = rgba(CYAN, 0.35 + 0.5 * k); ctx.lineWidth = 3; ctx.lineCap = 'round';
    for (const o of [-14, 0, 14]) { const x = o + off - 7; if (x > 18) continue; ctx.beginPath(); ctx.moveTo(x - 6, -9); ctx.lineTo(x + 4, 0); ctx.lineTo(x - 6, 9); ctx.stroke(); }
    ctx.restore();
  }
  // capsules +5 s
  for (const Cp of mg.caps) {
    if (Cp.got) continue;
    const y = Cp.y + Math.sin(t * 3 + Cp.x) * 2;
    r.glow(Cp.x, y, 50, CYAN, 0.4);
    ctx.fillStyle = '#0a2a36'; ctx.strokeStyle = CYAN; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.roundRect ? ctx.roundRect(Cp.x - 14, y - 8, 28, 16, 8) : ctx.rect(Cp.x - 14, y - 8, 28, 16); ctx.fill(); ctx.stroke();
    r.text('+5 s', Cp.x, y + 0.5, 9, '#e6fbff', 'center', 1, true);
  }
  // clés de données : losange doré qui tourne et flotte
  for (const K of mg.keys) {
    if (K.got) continue;
    const y = K.y + Math.sin(K.t * 3 + K.i) * 3, s = Math.abs(Math.cos(K.t * 2 + K.i));
    r.glow(K.x, y, 70, GOLD, 0.5);
    ctx.save(); ctx.translate(K.x, y); ctx.scale(0.35 + 0.65 * s, 1);
    ctx.fillStyle = GOLD; ctx.strokeStyle = '#fff6c8'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(0, -14); ctx.lineTo(10, 0); ctx.lineTo(0, 14); ctx.lineTo(-10, 0); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#7a5200'; ctx.fillRect(-3, -3, 6, 6);
    ctx.restore();
  }
  // portes laser
  for (const D of mg.doors) {
    const [ax, ay, bx, by] = D.s;
    if (D.closed || D.warn) {
      const a = D.closed ? 0.85 + 0.15 * Math.sin(t * 40) : (Math.sin(t * 30) > 0 ? 0.5 : 0.1);
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = rgba(RED, a); ctx.lineWidth = D.closed ? 5 : 2;
      ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
      if (D.closed) { ctx.strokeStyle = rgba('#ffffff', 0.7); ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke(); }
      ctx.restore();
      if (D.closed) r.glow((ax + bx) / 2, (ay + by) / 2, 60, RED, 0.35);
    }
  }
  // sortie : grille rouge fermée, puis sas ouvert qui pulse
  const E = mg.exit;
  if (!E.open) {
    ctx.strokeStyle = rgba(RED, 0.75); ctx.lineWidth = 2;
    ctx.beginPath();
    for (const o of [-12, 0, 12]) { ctx.moveTo(E.x + o, E.y - 20); ctx.lineTo(E.x + o, E.y + 20); }
    ctx.stroke();
    r.text(`${mg.keysGot}/${mg.keys.length}`, E.x, E.y + 1, 10, RED, 'center', 0.9, true);
  } else {
    const p = 0.5 + 0.5 * Math.sin(E.t * 5);
    r.glow(E.x, E.y, 110, SILVER, 0.45 + 0.3 * p);
    ctx.strokeStyle = rgba('#ffffff', 0.6 + 0.4 * p); ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(E.x, E.y, 18 + 4 * p, 0, TAU); ctx.stroke();
    ctx.strokeStyle = rgba(CYAN, 0.7); ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(E.x, E.y, 10 + 8 * ((E.t * 1.5) % 1), 0, TAU); ctx.stroke();
  }
}

export function renderMazeTop(ctx, r, mg) {
  const t = r.time, b = mg.ball;
  // indicateur de gravité : flèche autour de la bille et lueur sur le bord du labyrinthe
  if (b && b.state === 'free' && !mg.winSeq) {
    const gx = Math.sin(mg.phi), gy = Math.cos(mg.phi);
    const col = mg.braking ? CYAN : SILVER;
    ctx.save();
    ctx.translate(b.x, b.y); ctx.rotate(Math.atan2(gy, gx));
    ctx.fillStyle = rgba(col, 0.85);
    ctx.beginPath(); ctx.moveTo(34, 0); ctx.lineTo(24, -7); ctx.lineTo(24, 7); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = rgba(col, 0.35); ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(0, 0, 21, -0.6, 0.6); ctx.stroke();
    ctx.restore();
    if (mg.braking) {
      ctx.strokeStyle = rgba(CYAN, 0.6 + 0.3 * Math.sin(t * 20)); ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.arc(b.x, b.y, 18, 0, TAU); ctx.stroke();
    }
    // point du bord du labyrinthe touché par la droite bille → direction de chute
    const tx = gx > 0 ? (X1 - b.x) / gx : gx < 0 ? (X0 - b.x) / gx : Infinity;
    const ty = gy > 0 ? (Y1 - b.y) / gy : gy < 0 ? (Y0 - b.y) / gy : Infinity;
    const k = Math.min(tx, ty), px = b.x + gx * k, py = b.y + gy * k;
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.5;
    ctx.drawImage(glowSprite(SILVER, 64), px - 60, py - 60, 120, 120);
    ctx.restore();
  }
  // grande annonce
  const C = mg.callout;
  if (C) {
    const u = C.t / C.life;
    const a = u < 0.1 ? u / 0.1 : u > 0.75 ? Math.max(0, (1 - u) / 0.25) : 1;
    const s = 1 + 0.4 * Math.max(0, 1 - C.t * 6), size = Math.round(34 * s), y = 540;
    const j = Math.sin(t * 37) > 0.6 ? 3 : 1.5;
    ctx.globalCompositeOperation = 'lighter';
    r.text(C.text, 281 - j, y, size, MAG, 'center', a * 0.5, true);
    r.text(C.text, 281 + j, y, size, CYAN, 'center', a * 0.5, true);
    ctx.globalCompositeOperation = 'source-over';
    r.text(C.text, 281, y, size, C.color, 'center', a, true);
  }
}
