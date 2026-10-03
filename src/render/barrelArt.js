// Rampes à barillet : chaque rampe montante est un prisme triangulaire rotatif (comme les
// panneaux publicitaires « trivision »). Chaque face est une rampe différente, avec sa matière,
// et mène à un minijeu différent (gauche : HANGAR, RÉACTEUR, GRAFFITI ; droite : DÉFENSE,
// COFFRE, ARÈNE). La géométrie physique ne change pas : le barillet n'est qu'un habillage.
// Par image : projection du prisme vu de dessus (faces visibles, largeur projetée, ombrage par
// face, arêtes chromées), verrous et vérins, carter à engrenage, gyrophare, vapeur, étincelles
// aux crans, volet d'entrée, chevrons de la face et jauge d'usure.
// Les faces sont des sprites pré-rendus (un par face), simplement étirés à l'affichage.
import { SECTORS } from '../config.js';
import { T } from '../game/tableLayout.js';
import { pivotEase, PIVOT } from '../game/table.js';
import { rgba, TAU, clamp01, mulberry32 } from '../util/math.js';
import { glowSprite } from './sprites.js';
import { NEON, SHADOW, chrome, paint, screw, hazard, insertBase, insertLit, wireRamp, polyPath, grain } from './artKit.js';
import { icon } from './dialArt.js';

const C = NEON;
const DISPLAY = '"Orbitron", "Rajdhani", sans-serif';
const RAD = Math.PI / 180;
const W = 46;                        // largeur d'une face = largeur du couloir de rampe
const PR = W / Math.sqrt(3);         // rayon du prisme (section en triangle équilatéral)
const LIGHT = -35;                   // lumière du haut à gauche (angle de normale de face)
const LIT0 = Math.cos(-LIGHT * RAD); // éclairement de la face présentée (référence)

// spin : sens de rotation à l'écran (la face suivante arrive du côté du carter)
export const BARREL_GEO = {
  L: { side: 'L', x0: T.rampL.x0, x1: T.rampL.x1, y0: T.rampL.deckY - 6, y1: T.rampL.mouthY, spin: -1, hx: 112.5, out: -1, flareIn: T.rampL.flareOut, flareOut: T.rampL.flare, clamps: [170, 300, 440] },
  R: { side: 'R', x0: T.rampR.upX0, x1: T.rampR.upX1, y0: T.rampR.topY + 2, y1: T.rampR.mouthY, spin: 1, hx: 449.5, out: 1, flareIn: T.rampR.flare, flareOut: T.rampR.flareOut, clamps: [300, 440] },
};
// carter (dans la poche entre orbite et rampe) : gyrophare, engrenage, voyants des 3 faces
const HOUSE = { y0: 337, y1: 423, w: 19, gyro: 346, gear: 363, lamps: [382, 395, 408] };
const CHEV_Y = [441, 423, 405];      // chevrons de progression (le premier en bas)
const WEAR_Y = 459;                  // jauge d'usure (passages avant rotation)

const easeOut = (u) => 1 - Math.pow(1 - u, 3);
const smooth = (u) => u * u * (3 - 2 * u);
// verrous : 1 = écartés → 0 = engagés, claquent puis rebondissent légèrement
function lockCurve(k) {
  if (k < 0.3) { const u = k / 0.3; return 1 - u * u; }
  const u = (k - 0.3) / 0.7;
  return -0.2 * Math.sin(u * Math.PI * 3) * Math.exp(-4 * u);
}

// engrenage du carter (Path2D créé au premier dessin : module importable sous Node)
let GEAR = null;
function gear() {
  if (GEAR) return GEAR;
  const p = new Path2D(), n = 10;
  for (let k = 0; k <= n * 4; k++) {
    const a = k / (n * 4) * TAU, rr = k % 4 < 2 ? 7 : 5.3;
    k ? p.lineTo(Math.cos(a) * rr, Math.sin(a) * rr) : p.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
  }
  p.closePath();
  p.moveTo(2, 0); p.arc(0, 0, 2, 0, TAU);
  for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2 + 0.4; p.moveTo(Math.cos(a) * 4.2 + 1, Math.sin(a) * 4.2); p.arc(Math.cos(a) * 4.2, Math.sin(a) * 4.2, 1, 0, TAU); }
  GEAR = p;
  return p;
}

function chevPath(g, cx, y) {
  g.beginPath(); g.moveTo(cx - 13, y + 4.5); g.lineTo(cx, y - 4.5); g.lineTo(cx + 13, y + 4.5);
}

function rrect(g, x, y, w, h, r) {
  g.beginPath();
  if (g.roundRect) g.roundRect(x, y, w, h, r); else g.rect(x, y, w, h);
}

// nom de face, vertical (se lit de bas en haut)
const vname = (g, s, cx, cy, size, col, opts = {}) => paint(g, s, cx, cy, size, col, { font: DISPLAY, rot: -Math.PI / 2, ...opts });

// ---------------------------------------------------------------- faces (une matière par rampe)
const FACE_ART = {
  // plastique transparent teinté, nervures, parois épaisses, autocollant
  hangar(g, x0, y0, x1, y1, col) {
    const cx = (x0 + x1) / 2, w = x1 - x0;
    const fl = g.createLinearGradient(0, y1, 0, y0);
    fl.addColorStop(0, rgba(col, 0.16)); fl.addColorStop(1, rgba(col, 0.34));
    g.fillStyle = fl; g.fillRect(x0, y0, w, y1 - y0);
    g.strokeStyle = 'rgba(255,255,255,0.1)'; g.lineWidth = 1;
    g.beginPath();
    for (let y = y0 + 18; y < y1 - 6; y += 22) { g.moveTo(x0 + 8, y); g.lineTo(x1 - 8, y); }
    g.stroke();
    for (const [x, dir] of [[x0, 1], [x1, -1]]) {
      const wg = g.createLinearGradient(x, 0, x + 8 * dir, 0);
      wg.addColorStop(0, 'rgba(255,255,255,0.6)'); wg.addColorStop(0.35, rgba(col, 0.4)); wg.addColorStop(1, 'rgba(255,255,255,0.03)');
      g.fillStyle = wg; g.fillRect(Math.min(x, x + 8 * dir), y0, 8, y1 - y0);
      g.strokeStyle = rgba(col, 0.95); g.lineWidth = 1.2;
      g.beginPath(); g.moveTo(x + dir * 0.6, y1); g.lineTo(x + dir * 0.6, y0); g.stroke();
    }
    // autocollant : vaisseau-cargo et nom
    rrect(g, cx - 13, 146, 26, 190, 6); g.fillStyle = 'rgba(6,10,24,0.82)'; g.fill();
    g.strokeStyle = rgba(col, 0.85); g.lineWidth = 1; g.stroke();
    icon(g, 'brick', cx, 170, 8, col, 0, 1.3);
    vname(g, 'HANGAR', cx, 255, 9.5, '#e8fbff');
    g.fillStyle = col;
    g.beginPath(); g.moveTo(cx, 300); g.lineTo(cx + 7, 312); g.lineTo(cx - 7, 312); g.closePath(); g.fill();
    g.beginPath(); g.moveTo(cx, 314); g.lineTo(cx + 7, 326); g.lineTo(cx - 7, 326); g.closePath(); g.fill();
    paint(g, 'BAIE 07', cx, 100, 5.2, rgba(col, 0.9), { font: DISPLAY, rot: -Math.PI / 2 });
    g.strokeStyle = 'rgba(255,255,255,0.18)'; g.lineWidth = 2.5;
    g.beginPath(); g.moveTo(x0 + 10, y1 - 20); g.lineTo(x0 + 10, y0 + 20); g.stroke();
  },

  // tôle perforée, bandes de danger, cœur orange qui rougeoie sous les trous
  reactor(g, x0, y0, x1, y1, col) {
    const cx = (x0 + x1) / 2, w = x1 - x0;
    const base = g.createLinearGradient(x0, 0, x1, 0);
    base.addColorStop(0, '#1d1814'); base.addColorStop(0.45, '#4a4036'); base.addColorStop(0.6, '#3a3229'); base.addColorStop(1, '#16120e');
    g.fillStyle = base; g.fillRect(x0, y0, w, y1 - y0);
    const holes = new Path2D(), glow = new Path2D();
    let row = 0;
    for (let y = y0 + 5; y < y1 - 3; y += 6, row++) {
      for (let x = x0 + 11 + (row % 2) * 3; x < x1 - 10; x += 6) {
        holes.moveTo(x + 1.35, y); holes.arc(x, y, 1.35, 0, TAU);
        if (Math.abs(x - cx) < 9) { glow.moveTo(x + 0.8, y + 0.2); glow.arc(x, y + 0.2, 0.8, 0, TAU); }
      }
    }
    g.fillStyle = '#0b0705'; g.fill(holes);
    g.fillStyle = 'rgba(255,150,40,0.55)'; g.fill(glow);
    hazard(g, [[x0, y0], [x0 + 7, y0], [x0 + 7, y1], [x0, y1]], col, 0.85, 5);
    hazard(g, [[x1 - 7, y0], [x1, y0], [x1, y1], [x1 - 7, y1]], col, 0.85, 5);
    for (let y = y0 + 20; y < y1 - 10; y += 36) { screw(g, x0 + 10, y, 1.3); screw(g, x1 - 10, y, 1.3); }
    g.fillStyle = '#140d06'; g.beginPath(); g.arc(cx, 172, 13, 0, TAU); g.fill();
    g.strokeStyle = col; g.lineWidth = 1.6; g.stroke();
    icon(g, 'atom', cx, 172, 8.5, col, 0, 1.2);
    rrect(g, cx - 9.5, 205, 19, 110, 4); g.fillStyle = '#120c07'; g.fill();
    g.strokeStyle = rgba(col, 0.7); g.lineWidth = 1; g.stroke();
    vname(g, 'RÉACTEUR', cx, 260, 8.2, col);
    g.strokeStyle = col; g.lineWidth = 1.4; g.lineJoin = 'round';
    g.beginPath(); g.moveTo(cx, 340); g.lineTo(cx + 9, 356); g.lineTo(cx - 9, 356); g.closePath(); g.fillStyle = '#140d06'; g.fill(); g.stroke();
    paint(g, '!', cx, 351, 8, col, { font: DISPLAY });
    paint(g, 'RAD-9', cx, 100, 5, rgba(col, 0.9), { font: DISPLAY, rot: -Math.PI / 2 });
  },

  // béton tagué : coulures, bombes de couleur, lettrage de travers
  tag(g, x0, y0, x1, y1, col) {
    const cx = (x0 + x1) / 2, w = x1 - x0, h = y1 - y0;
    g.fillStyle = '#17180f'; g.fillRect(x0, y0, w, h);
    grain(g, x0, y0, x1, y1, 900, 13, 0.07);
    const rnd = mulberry32(91);
    const cols = [col, C.magenta, C.cyan, C.orange, '#ffffff'];
    g.save();
    g.beginPath(); g.rect(x0, y0, w, h); g.clip();
    g.lineCap = 'round'; g.lineJoin = 'round';
    for (let i = 0; i < 24; i++) {
      const sx = x0 + rnd() * w, sy = y0 + rnd() * h;
      g.strokeStyle = rgba(cols[i % 5], 0.3 + rnd() * 0.35); g.lineWidth = 1.2 + rnd() * 2.6;
      g.beginPath(); g.moveTo(sx, sy);
      g.bezierCurveTo(sx + (rnd() - 0.5) * 60, sy + (rnd() - 0.5) * 50, sx + (rnd() - 0.5) * 60, sy + (rnd() - 0.5) * 50, sx + (rnd() - 0.5) * 40, sy + (rnd() - 0.5) * 60);
      g.stroke();
    }
    for (let i = 0; i < 12; i++) {
      const dx = x0 + 4 + rnd() * (w - 8), dy = y0 + rnd() * (h - 30), l = 8 + rnd() * 22;
      g.strokeStyle = rgba(cols[i % 4], 0.6); g.lineWidth = 1.3;
      g.beginPath(); g.moveTo(dx, dy); g.lineTo(dx, dy + l); g.stroke();
      g.fillStyle = rgba(cols[i % 4], 0.7); g.beginPath(); g.arc(dx, dy + l, 1.4, 0, TAU); g.fill();
    }
    g.restore();
    // ruban adhésif sur les bords
    g.setLineDash([7, 4]); g.strokeStyle = rgba(col, 0.7); g.lineWidth = 2.4;
    g.beginPath(); g.moveTo(x0 + 2.5, y0); g.lineTo(x0 + 2.5, y1); g.moveTo(x1 - 2.5, y0); g.lineTo(x1 - 2.5, y1); g.stroke();
    g.setLineDash([]);
    icon(g, 'spray', cx - 2, 168, 8.5, col, 0.25, 1.2);
    // lettrage « GRAFFITI »
    const word = 'GRAFFITI', n = word.length, sp = 11.5;
    g.font = `900 13px ${DISPLAY}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineJoin = 'round';
    for (let i = 0; i < n; i++) {
      const yy = 262 + ((n - 1) / 2 - i) * sp;
      g.save(); g.translate(cx + (rnd() - 0.5) * 3, yy); g.rotate(-Math.PI / 2 + (rnd() - 0.5) * 0.35);
      g.strokeStyle = C.magenta; g.lineWidth = 4.2; g.strokeText(word[i], 0, 0);
      g.fillStyle = col; g.fillText(word[i], 0, 0);
      g.strokeStyle = 'rgba(10,6,2,0.9)'; g.lineWidth = 0.7; g.strokeText(word[i], 0, 0);
      g.restore();
    }
    // couronne griffonnée
    g.strokeStyle = C.cyan; g.lineWidth = 1.6;
    g.beginPath(); g.moveTo(cx - 10, 362); g.lineTo(cx - 10, 348); g.lineTo(cx - 4, 356); g.lineTo(cx, 344); g.lineTo(cx + 4, 356); g.lineTo(cx + 10, 348); g.lineTo(cx + 10, 362); g.closePath(); g.stroke();
  },

  // tôle de blindage larmée, rails rivetés, pochoirs militaires
  defense(g, x0, y0, x1, y1, col) {
    const cx = (x0 + x1) / 2, w = x1 - x0;
    const base = g.createLinearGradient(x0, 0, x1, 0);
    base.addColorStop(0, '#0b1f13'); base.addColorStop(0.5, '#1c4029'); base.addColorStop(1, '#0b1f13');
    g.fillStyle = base; g.fillRect(x0, y0, w, y1 - y0);
    const ridge = new Path2D();
    let row = 0;
    for (let y = y0 + 5; y < y1 - 2; y += 7, row++) {
      for (let x = x0 + 9 + (row % 2) * 3.5, c = 0; x < x1 - 8; x += 7, c++) {
        const d = (c + row) % 2 ? 1 : -1;
        ridge.moveTo(x - 2, y + 1.6 * d); ridge.lineTo(x + 2, y - 1.6 * d);
      }
    }
    g.lineCap = 'round';
    g.save(); g.translate(0.6, 0.8); g.strokeStyle = 'rgba(0,0,0,0.45)'; g.lineWidth = 1.4; g.stroke(ridge); g.restore();
    g.strokeStyle = 'rgba(170,255,200,0.2)'; g.lineWidth = 1.2; g.stroke(ridge);
    for (const [x, dir] of [[x0, 1], [x1, -1]]) {
      g.fillStyle = '#06120a'; g.fillRect(Math.min(x, x + 6 * dir), y0, 6, y1 - y0);
      g.fillStyle = rgba(col, 0.85); g.fillRect(x + 5.5 * dir - 0.6, y0, 1.2, y1 - y0);
      for (let y = y0 + 10; y < y1 - 4; y += 18) screw(g, x + 2.8 * dir, y, 1.1);
    }
    rrect(g, cx - 13, 241, 26, 28, 5); g.fillStyle = '#06140b'; g.fill();
    g.strokeStyle = col; g.lineWidth = 1.4; g.stroke();
    icon(g, 'shield', cx, 255, 8.5, col, 0, 1.3);
    rrect(g, cx - 9.5, 284, 19, 96, 4); g.fillStyle = '#06140b'; g.fill();
    g.strokeStyle = rgba(col, 0.7); g.lineWidth = 1; g.stroke();
    vname(g, 'DÉFENSE', cx, 332, 8.4, col);
    paint(g, 'ZONE 03', cx, 230, 4.6, rgba(col, 0.85), { font: DISPLAY });
  },

  // rampe en fil chromé sur caisson violet éclairé
  vault(g, x0, y0, x1, y1, col) {
    const cx = (x0 + x1) / 2, w = x1 - x0;
    g.fillStyle = '#0e0719'; g.fillRect(x0, y0, w, y1 - y0);
    const band = g.createLinearGradient(x0, 0, x1, 0);
    band.addColorStop(0, rgba(col, 0)); band.addColorStop(0.5, rgba(col, 0.32)); band.addColorStop(1, rgba(col, 0));
    g.fillStyle = band; g.fillRect(x0, y0, w, y1 - y0);
    for (let y = y0 + 14; y < y1 - 6; y += 24) chrome(g, [[x0 + 4, y], [x1 - 4, y]], 1.6, { shadow: false, mid: '#6a5d88' });
    chrome(g, [[x0 + 14, y0], [x0 + 14, y1]], 2.4, { shadow: false, glow: col });
    chrome(g, [[x1 - 14, y0], [x1 - 14, y1]], 2.4, { shadow: false, glow: col });
    chrome(g, [[x0 + 3, y0], [x0 + 3, y1]], 3.2, { shadow: false });
    chrome(g, [[x1 - 3, y0], [x1 - 3, y1]], 3.2, { shadow: false });
    g.fillStyle = '#140a26'; g.beginPath(); g.arc(cx, 255, 13, 0, TAU); g.fill();
    g.strokeStyle = col; g.lineWidth = 1.6; g.stroke();
    icon(g, 'vault', cx, 255, 8.5, col, 0, 1.1);
    rrect(g, cx - 9.5, 290, 19, 84, 4); g.fillStyle = '#140a26'; g.fill();
    g.strokeStyle = rgba(col, 0.75); g.lineWidth = 1; g.stroke();
    vname(g, 'COFFRE', cx, 332, 8.6, '#efe4ff');
  },

  // grille lumineuse façon stade : lignes bleues, nœuds, barres latérales
  arena(g, x0, y0, x1, y1, col) {
    const cx = (x0 + x1) / 2, w = x1 - x0;
    g.fillStyle = '#040820'; g.fillRect(x0, y0, w, y1 - y0);
    const grid = new Path2D(), bright = new Path2D();
    for (let k = 0; k < 5; k++) { const x = x0 + 5 + k * 9; grid.moveTo(x, y0); grid.lineTo(x, y1); }
    let row = 0;
    for (let y = y0 + 4; y < y1; y += 9, row++) { (row % 3 ? grid : bright).moveTo(x0, y); (row % 3 ? grid : bright).lineTo(x1, y); }
    g.strokeStyle = rgba(col, 0.42); g.lineWidth = 0.8; g.stroke(grid);
    g.strokeStyle = 'rgba(127,215,255,0.6)'; g.lineWidth = 1; g.stroke(bright);
    g.fillStyle = 'rgba(200,235,255,0.8)';
    row = 0;
    for (let y = y0 + 4; y < y1; y += 9, row++) if (row % 3 === 0) for (let k = 0; k < 5; k++) g.fillRect(x0 + 5 + k * 9 - 0.9, y - 0.9, 1.8, 1.8);
    for (const [x, dir] of [[x0, 1], [x1, -1]]) {
      const lb = g.createLinearGradient(x, 0, x + 5 * dir, 0);
      lb.addColorStop(0, '#bfe6ff'); lb.addColorStop(0.4, col); lb.addColorStop(1, rgba(col, 0));
      g.fillStyle = lb; g.fillRect(Math.min(x, x + 5 * dir), y0, 5, y1 - y0);
    }
    g.setLineDash([5, 5]); g.strokeStyle = 'rgba(255,255,255,0.3)'; g.lineWidth = 1;
    g.beginPath(); g.moveTo(cx, y0); g.lineTo(cx, y1); g.stroke(); g.setLineDash([]);
    rrect(g, cx - 14, 243, 28, 25, 10); g.fillStyle = '#06103a'; g.fill();
    g.strokeStyle = col; g.lineWidth = 1.4; g.stroke();
    icon(g, 'goal', cx, 254, 8, col, 0, 1.3);
    rrect(g, cx - 9.5, 296, 19, 74, 4); g.fillStyle = '#06103a'; g.fill();
    g.strokeStyle = rgba(col, 0.75); g.lineWidth = 1; g.stroke();
    vname(g, 'ARÈNE', cx, 333, 9, '#dfe8ff');
  },
};

export class BarrelArt {
  constructor(r) {
    this.r = r;
    this.st = { L: { step: 0, locked: false }, R: { step: 0, locked: false } };
  }

  // sprite d'une face (dessinée à sa place quand elle est présentée)
  _face(id, G) {
    return this.r.sprite('barrel-face-' + id, G.x0, G.y0, W, G.y1 - G.y0, (g) => {
      const col = SECTORS[id].color, cx = (G.x0 + G.x1) / 2;
      FACE_ART[id](g, G.x0, G.y0, G.x1, G.y1, col);
      // emplacements des chevrons
      g.lineCap = 'round'; g.lineJoin = 'round';
      for (const y of CHEV_Y) {
        chevPath(g, cx, y);
        g.strokeStyle = 'rgba(0,0,0,0.8)'; g.lineWidth = 6; g.stroke();
        g.strokeStyle = rgba(col, 0.35); g.lineWidth = 3.4; g.stroke();
      }
      g.fillStyle = 'rgba(0,0,0,0.6)'; g.fillRect(cx - 19, WEAR_Y - 3.5, 38, 7);
    });
  }

  // volet d'entrée (bande de danger « VERROUILLÉ »)
  _flap(side, G) {
    return this.r.sprite('barrel-flap-' + side, G.x0, G.y1 - 5, W, 13, (g) => {
      hazard(g, [[G.x0, G.y1 - 5], [G.x1, G.y1 - 5], [G.x1, G.y1 + 8], [G.x0, G.y1 + 8]], C.amber, 0.95, 4);
      g.fillStyle = 'rgba(8,6,4,0.92)'; g.fillRect(G.x0 + 3, G.y1 - 2.2, W - 6, 7.4);
      paint(g, 'VERROUILLÉ', (G.x0 + G.x1) / 2, G.y1 + 1.6, 5, '#ffd27a', { font: DISPLAY });
      g.strokeStyle = '#d9e4f5'; g.lineWidth = 1; g.strokeRect(G.x0 + 0.5, G.y1 - 4.5, W - 1, 12);
    });
  }

  // ============================================================ partie fixe (calque des rampes)
  staticLayer(g, table) {
    for (const side of ['L', 'R']) {
      const G = BARREL_GEO[side];
      const h = G.y1 - G.y0;
      // ombre du prisme
      g.fillStyle = 'rgba(0,0,0,0.36)'; g.fillRect(G.x0 + SHADOW.dx * 2, G.y0 + SHADOW.dy * 2, W, h);
      // plaque d'entrée et lèvres de la bouche
      const fl = [[G.x0 - G.flareIn, G.y1 + 16], [G.x0, G.y1], [G.x1, G.y1], [G.x1 + G.flareOut, G.y1 + 16]];
      const mg = g.createLinearGradient(0, G.y1, 0, G.y1 + 16);
      mg.addColorStop(0, '#2a3042'); mg.addColorStop(1, '#10131c');
      g.fillStyle = mg; polyPath(g, fl, true); g.fill();
      chrome(g, [fl[0], fl[1]], 2.5, {});
      chrome(g, [fl[3], fl[2]], 2.5, {});
      chrome(g, [[G.x0, G.y1 + 12], [G.x1, G.y1 + 12]], 4, {});
      // corps des vérins des verrous
      for (const y of G.clamps) {
        for (const s of [-1, 1]) {
          const e = s < 0 ? G.x0 : G.x1, xa = e + s * 12, xb = e + s * 21;
          g.fillStyle = 'rgba(0,0,0,0.45)'; g.fillRect(Math.min(xa, xb) + 2, y - 2.5, 9, 7);
          const cg = g.createLinearGradient(0, y - 3.5, 0, y + 3.5);
          cg.addColorStop(0, '#9aa6bd'); cg.addColorStop(0.4, '#e6edf8'); cg.addColorStop(1, '#3a4256');
          g.fillStyle = cg; g.fillRect(Math.min(xa, xb), y - 3.5, 9, 7);
          g.fillStyle = '#1a1d28'; g.fillRect(xb - (s > 0 ? 2 : 0), y - 4.5, 2, 9);
        }
      }
      this._house(g, G, table.barrels[side].faces);
    }
    // rampe droite : virage en U et descente en fil, communs aux trois faces
    const g2 = T.rampR;
    const up = new Path2D();
    up.moveTo(g2.upX0, g2.topY + 2); up.arc(g2.turnCx, g2.topY, g2.turnR1, Math.PI, 0);
    up.lineTo(g2.downX1, g2.topY + 30); up.lineTo(g2.downX0, g2.topY + 30);
    up.arc(g2.turnCx, g2.topY, g2.turnR0, 0, Math.PI, true);
    up.lineTo(g2.upX1, g2.topY + 2); up.closePath();
    g.save(); g.translate(SHADOW.dx * 1.5, SHADOW.dy * 1.5); g.fillStyle = 'rgba(0,0,0,0.35)'; g.fill(up); g.restore();
    g.fillStyle = 'rgba(201,184,255,0.16)'; g.fill(up);
    g.strokeStyle = 'rgba(240,235,255,0.65)'; g.lineWidth = 2.5; g.stroke(up);
    g.strokeStyle = rgba(C.violet, 0.85); g.lineWidth = 1; g.stroke(up);
    for (let k = 0; k < 3; k++) {
      const a = Math.PI + (k + 1) * Math.PI / 4, rr = (g2.turnR0 + g2.turnR1) / 2;
      const px = g2.turnCx + Math.cos(a) * rr, py = g2.topY + Math.sin(a) * rr;
      g.save(); g.translate(px, py); g.rotate(a + Math.PI);
      g.strokeStyle = rgba(C.violet, 0.8); g.lineWidth = 2;
      g.beginPath(); g.moveTo(-5, -6); g.lineTo(2, 0); g.lineTo(-5, 6); g.stroke();
      g.restore();
    }
    const mid = (g2.downX0 + g2.downX1) / 2;
    wireRamp(g, [[mid, g2.topY + 24], [mid, g2.exitY - 10], [mid - 4, g2.exitY + 20]], g2.downX1 - g2.downX0, { glow: C.violet });
  }

  // carter du barillet : tôle sombre, vis, ouïes, logement d'engrenage, voyants, gyrophare
  _house(g, G, faces) {
    const x = G.hx - HOUSE.w / 2, y = HOUSE.y0, w = HOUSE.w, h = HOUSE.y1 - HOUSE.y0;
    g.fillStyle = 'rgba(0,0,0,0.5)'; rrect(g, x + 3, y + 5, w, h, 4); g.fill();
    const bg = g.createLinearGradient(x, 0, x + w, 0);
    bg.addColorStop(0, '#2a3042'); bg.addColorStop(0.5, '#3a4258'); bg.addColorStop(1, '#161a26');
    rrect(g, x, y, w, h, 4); g.fillStyle = bg; g.fill();
    g.strokeStyle = '#9aa6bd'; g.lineWidth = 1; g.stroke();
    for (const [sx, sy] of [[x + 3, y + 3], [x + w - 3, y + 3], [x + 3, y + h - 3], [x + w - 3, y + h - 3]]) screw(g, sx, sy, 1.2);
    g.strokeStyle = 'rgba(0,0,0,0.7)'; g.lineWidth = 1;
    g.beginPath();
    for (let k = 0; k < 3; k++) { g.moveTo(x + 5, y + h - 9 + k * 2.4); g.lineTo(x + w - 5, y + h - 9 + k * 2.4); }
    g.stroke();
    g.fillStyle = '#07080d'; g.beginPath(); g.arc(G.hx, HOUSE.gear, 8.4, 0, TAU); g.fill();
    g.strokeStyle = 'rgba(255,176,46,0.35)'; g.lineWidth = 0.8; g.stroke();
    HOUSE.lamps.forEach((ly, i) => insertBase(g, 'circle', G.hx, ly, 3.6, SECTORS[faces[i]].color));
    g.fillStyle = '#1a1d28'; g.beginPath(); g.arc(G.hx, HOUSE.gyro, 5.6, 0, TAU); g.fill();
    insertBase(g, 'circle', G.hx, HOUSE.gyro, 4.2, C.amber);
  }

  // ============================================================ par image
  draw(ctx, table, game, t) {
    for (const side of ['L', 'R']) this._side(ctx, table, side, t);
  }

  // Barillet au repos : prisme, arêtes, verrous engagés et engrenage pré-rendus (un sprite par face).
  // Comprend aussi les cases vides de la jauge d'usure et le voyant de la face présentée.
  _idle(G, faces, idx, limit) {
    const x0 = Math.min(G.x0 - 24, G.hx - 11), x1 = Math.max(G.x1 + 24, G.hx + 11);
    return this.r.sprite(`barrel-idle-${G.side}-${faces[idx]}-${limit}`, x0, G.y0 - 4, x1 - x0, G.y1 - G.y0 + 8, (g) => {
      this._prism(g, G, faces, idx, 0, 0, null);
      const cx = (G.x0 + G.x1) / 2, gap = 2, pw = (34 - gap * (limit - 1)) / limit;
      g.strokeStyle = 'rgba(255,255,255,0.3)'; g.lineWidth = 0.6;
      for (let k = 0; k < limit; k++) g.strokeRect(cx - 17 + k * (pw + gap), WEAR_Y - 2, pw, 4);
      const ly = HOUSE.lamps[idx], col = SECTORS[faces[idx]].color;
      g.globalCompositeOperation = 'lighter'; g.globalAlpha = 0.4;
      g.drawImage(glowSprite(col, 64), G.hx - 10, ly - 10, 20, 20);
      g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;
      insertLit(g, 'circle', G.hx, ly, 3.6, col, 1);
      g.strokeStyle = 'rgba(255,255,255,0.9)'; g.lineWidth = 0.9; g.beginPath(); g.arc(G.hx, ly, 5.2, 0, TAU); g.stroke();
    });
  }

  _side(ctx, table, side, t) {
    const r = this.r, G = BARREL_GEO[side], v = table.barrelView(side), S = this.st[side];
    const rfx = r.settings.reducedFx, still = rfx || r.settings.reducedMotion;
    if (v.phase === 'idle') {
      r.drawSprite(ctx, this._idle(G, v.faces, v.idx, v.limit), 1);
      this._overlay(ctx, v, v.idx, v.faces[v.idx], G, t);
    } else {
      const open = v.phase === 'unlock' ? easeOut(clamp01(v.k * 1.4)) : v.phase === 'turn' ? 1 : lockCurve(v.k);
      let jx = 0;
      if (!still && ((v.phase === 'unlock' && v.k > 0.7) || (v.phase === 'lock' && v.k < 0.25))) jx = (Math.random() - 0.5) * 1.2;
      this._prism(ctx, G, v.faces, v.rot, open, jx, (i, id) => this._overlay(ctx, v, i, id, G, t));
    }
    this._mechanics(ctx, table, v, G, S, t, rfx, still);
  }

  // Projection du prisme vu de dessus : faces visibles (largeur projetée, ombrage par face),
  // arêtes chromées, paliers, mâchoires des verrous (open : 0 engagées → 1 écartées), engrenage.
  _prism(ctx, G, faces, rot, open, jx, overlay) {
    const cx = (G.x0 + G.x1) / 2, h = G.y1 - G.y0;
    const vis = [];
    for (let i = 0; i < 3; i++) {
      let ph = G.spin * (i - rot) * 120;
      ph = ((ph + 180) % 360 + 360) % 360 - 180;
      if (Math.cos(ph * RAD) < 0.02) continue;
      vis.push({ i, ph, xa: cx + jx + PR * Math.sin((ph - 60) * RAD), xb: cx + jx + PR * Math.sin((ph + 60) * RAD) });
    }
    for (const f of vis) {
      const id = faces[f.i], sp = this._face(id, G), w = f.xb - f.xa;
      if (w < 0.3) continue;
      ctx.drawImage(sp.c, f.xa, sp.y, w, sp.h);
      // ombrage par face : lumière du haut à gauche
      const lit = Math.cos((f.ph - LIGHT) * RAD);
      const dark = Math.max(0, LIT0 - lit) * 0.95, hi = Math.max(0, lit - LIT0);
      if (dark > 0.01) { ctx.fillStyle = `rgba(4,2,10,${Math.min(0.92, dark)})`; ctx.fillRect(f.xa, G.y0, w, h); }
      if (hi > 0.01) { ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = `rgba(255,255,255,${hi * 0.3})`; ctx.fillRect(f.xa, G.y0, w, h); ctx.globalCompositeOperation = 'source-over'; }
      if (overlay) {
        ctx.save();
        ctx.translate(f.xa, 0); ctx.scale(w / W, 1); ctx.translate(-G.x0, 0);
        overlay(f.i, id);
        ctx.restore();
      }
    }
    // arêtes chromées et paliers d'extrémité
    let lo = 1e9, hiX = -1e9;
    for (const f of vis) {
      lo = Math.min(lo, f.xa); hiX = Math.max(hiX, f.xb);
      for (const ex of [f.xa, f.xb]) {
        ctx.fillStyle = '#1a1d28'; ctx.fillRect(ex - 1.3, G.y0, 2.6, h);
        ctx.fillStyle = '#c9d4ea'; ctx.fillRect(ex - 0.55, G.y0, 1.1, h);
      }
    }
    for (const yy of [G.y0, G.y1]) {
      ctx.fillStyle = '#1a1d28'; ctx.fillRect(lo - 2.5, yy - 2.2, hiX - lo + 5, 4.4);
      ctx.fillStyle = '#aab6cc'; ctx.fillRect(lo - 2, yy - 1.6, hiX - lo + 4, 2);
    }
    // verrous : mâchoires sur les arêtes et tiges des vérins
    for (const y of G.clamps) {
      for (const s of [-1, 1]) {
        const e = s < 0 ? G.x0 : G.x1, hx = e + s * open * 8, rod = e + s * 12;
        ctx.fillStyle = '#d9e4f5'; ctx.fillRect(Math.min(hx, rod), y - 1.1, Math.abs(rod - hx), 2.2);
        ctx.fillStyle = '#1a1d28'; ctx.fillRect(hx - 4.6, y - 5.6, 9.2, 11.2);
        ctx.fillStyle = '#8e9ab4'; ctx.fillRect(hx - 3.9, y - 4.9, 7.8, 9.8);
        ctx.fillStyle = '#eef3fb'; ctx.fillRect(hx - 3.9, y - 4.9, 7.8, 2.2);
        ctx.fillStyle = open > 0.05 ? C.amber : '#4a5368'; ctx.fillRect(s < 0 ? hx + 1.6 : hx - 3.9, y - 2, 2.3, 4);
      }
    }
    // engrenage du carter, entraîné par le barillet (rapport 3)
    ctx.save();
    ctx.translate(G.hx, HOUSE.gear); ctx.rotate(G.spin * rot * TAU);
    ctx.fillStyle = '#9aa6bd'; ctx.fill(gear(), 'evenodd');
    ctx.strokeStyle = '#2a3042'; ctx.lineWidth = 0.6; ctx.stroke(gear());
    ctx.restore();
  }

  // Chevrons, usure, état : dessinés dans le repère de la face (étirés avec elle).
  _overlay(ctx, v, i, id, G, t) {
    const col = SECTORS[id].color, cx = (G.x0 + G.x1) / 2;
    const st = v.states[i], n = Math.min(v.max, v.chevrons[i] || 0);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (let k = 0; k < 3; k++) {
      let kk = k < n ? 1 : 0;
      if (i === v.idx && k === n - 1 && v.chevFlash > 0) kk = Math.sin(t * 26) > 0 ? 1 : 0.3;
      if (st === 'ready') kk = Math.sin(t * 10 - k * 1.4) > 0 ? 1 : 0.35;
      if (kk <= 0) continue;
      chevPath(ctx, cx, CHEV_Y[k]);
      ctx.globalAlpha = kk;
      ctx.strokeStyle = col; ctx.lineWidth = 4.4; ctx.stroke();
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.4; ctx.stroke();
      ctx.globalAlpha = 1;
    }
    if (i === v.idx && v.phase === 'idle') {
      const L = v.limit, gap = 2, pw = (34 - gap * (L - 1)) / L;
      for (let k = 0; k < L; k++) {
        const x = cx - 17 + k * (pw + gap);
        if (k < v.uses) { ctx.fillStyle = k >= L - 1 ? '#ff3a3a' : k >= L - 2 ? C.amber : C.green; ctx.fillRect(x, WEAR_Y - 2, pw, 4); }
      }
    }
    if (st === 'done') {
      ctx.fillStyle = 'rgba(4,8,6,0.85)'; ctx.fillRect(cx - 21, 384, 42, 10);
      this.r.text('SÉCURISÉ', cx, 389.5, 5.4, col, 'center', 1, true);
    }
    if (st === 'ready' || (i === v.idx && v.flash > 0)) {
      const a = st === 'ready' ? 0.1 + 0.08 * Math.sin(t * 8) : 0.35 * Math.min(1, v.flash);
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = rgba(col, a); ctx.fillRect(G.x0, G.y0, W, G.y1 - G.y0);
      ctx.globalCompositeOperation = 'source-over';
    }
  }

  // Carter : engrenage, gyrophare, voyants des faces ; volet, vapeur et étincelles.
  _mechanics(ctx, table, v, G, S, t, rfx, still) {
    const r = this.r, active = v.phase !== 'idle';
    // voyants : face présentée (cerclée de blanc), face qui arrive (clignote)
    HOUSE.lamps.forEach((ly, i) => {
      const col = SECTORS[v.faces[i]].color, st = v.states[i];
      let k = 0;
      if (active) k = i === (v.idx + 1) % 3 ? (Math.sin(t * 16) > 0 ? 1 : 0.2) : i === v.idx ? 0.35 : 0;
      else if (i === v.idx) return;          // voyant de la face présentée : dans le sprite au repos
      else if (st === 'armed' || st === 'ready') k = Math.sin(t * 5) > 0 ? 0.8 : 0.2;
      else if (st === 'done') k = 0.3;
      if (k > 0.01) { insertLit(ctx, 'circle', G.hx, ly, 3.6, col, k); r.glow(G.hx, ly, 20, col, 0.4 * k); }
    });
    // gyrophare ambre pendant la rotation
    if (active) {
      const k = still ? (Math.sin(t * 6) > 0 ? 1 : 0.4) : 1;
      insertLit(ctx, 'circle', G.hx, HOUSE.gyro, 4.2, C.amber, k);
      r.glow(G.hx, HOUSE.gyro, 44, C.amber, 0.6 * k);
      if (!still) {
        ctx.save();
        ctx.translate(G.hx, HOUSE.gyro); ctx.rotate(t * 9);
        ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.4;
        const spr = glowSprite(C.amber, 64);
        ctx.drawImage(spr, 2, -10, 110, 20); ctx.drawImage(spr, -112, -10, 110, 20);
        ctx.restore();
      }
      // lueur rouge du verrouillage à la bouche
      r.glow((G.x0 + G.x1) / 2, G.y1 + 2, 70, '#ff3a3a', 0.35 + 0.2 * Math.sin(t * 12));
    }
    // volet d'entrée : glisse depuis le carter, fermé pendant toute la rotation
    if (v.closed) {
      const c = v.phase === 'unlock' ? easeOut(clamp01(v.k * 2.5)) : v.phase === 'lock' ? 1 - smooth(clamp01((v.k - 0.55) / 0.45)) : 1;
      if (c > 0.01) {
        const sp = this._flap(G.side, G);
        ctx.save();
        ctx.beginPath(); ctx.rect(G.x0, G.y1 - 6, W, 16); ctx.clip();
        ctx.drawImage(sp.c, sp.x + G.out * W * (1 - c), sp.y, sp.w, sp.h);
        ctx.restore();
      }
    }
    // jets de vapeur des vérins (déverrouillage, verrouillage)
    const t2 = PIVOT.unlock + PIVOT.turn;
    const ev = v.phase === 'unlock' ? v.t : v.phase === 'lock' ? v.t - t2 : -1;
    if (ev >= 0) {
      const np = rfx ? 1 : 3;
      for (const y of G.clamps) {
        for (const s of [-1, 1]) {
          const e = s < 0 ? G.x0 : G.x1;
          for (let p = 0; p < np; p++) {
            const age = ev - p * 0.07;
            if (age < 0 || age > 0.75) continue;
            const u = age / 0.75;
            ctx.fillStyle = `rgba(226,232,245,${0.42 * (1 - u)})`;
            ctx.beginPath(); ctx.arc(e + s * (18 + u * 24), y - u * 14 + p * 2, 2.5 + u * 11, 0, TAU); ctx.fill();
          }
        }
      }
    }
    // étincelles à chaque cran, puis au verrouillage
    let step = 0;
    if (v.phase === 'turn') step = Math.min(3, Math.floor(pivotEase(v.k) * 3 + 0.02));
    else if (v.phase === 'lock') step = 3;
    if (!active) { S.step = 0; S.locked = false; }
    if (step > S.step) {
      S.step = step;
      for (let k = 0; k < 2; k++) {
        r.fx.spark(G.x0, G.y0 + Math.random() * (G.y1 - G.y0), 1500);
        r.fx.spark(G.x1, G.y0 + Math.random() * (G.y1 - G.y0), 1500);
      }
      r.fx.burst(G.hx, HOUSE.gear, C.amber, 4, 160);
    }
    if (v.phase === 'lock' && !S.locked) {
      S.locked = true;
      for (const y of G.clamps) { r.fx.spark(G.x0, y, 1900); r.fx.spark(G.x1, y, 1900); }
    }
  }
}
