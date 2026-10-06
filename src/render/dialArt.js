// LE CADRAN : roue d'inserts au centre du plateau (d'après « The Machine: Bride of Pin·Bot »),
// en version néon. Du centre vers l'extérieur :
//   œil de LUMEN (moyeu) · anneau DANGER HAUTE TENSION · bobines d'aimant et inserts de fonctions ·
//   six coins de secteurs (un par minijeu) et leurs 3 chevrons · jauge du million · lunette chromée.
// Au-dessus, la colonne du NOYAU (inserts de taille décroissante) mène au portail central.
// Tout ce qui est fixe est peint dans le calque du plateau ; par image, on pose des sprites
// pré-rendus (lentilles allumées, jauge découpée) : pas de gros dégradé recalculé.
import { SECTORS, RULES } from '../config.js';
import { T } from '../game/tableLayout.js';
import { rgba, TAU, clamp01, hexToRgb } from '../util/math.js';
import { glowSprite } from './sprites.js';
import { NEON, chrome, paint, screw, insertBase, insertLit } from './artKit.js';

const C = NEON;
const DISPLAY = '"Orbitron", "Rajdhani", sans-serif';
const TEXT = '"Rajdhani", "Segoe UI", sans-serif';
const RAD = Math.PI / 180;
const CORE = SECTORS.core.color;

// Rayons du cadran (centre = œil de LUMEN, T.eye)
export const DIAL = {
  x: T.eye.x, y: T.eye.y,
  eye: 31,                  // logement chromé de l'œil
  hv0: 32, hv1: 41,         // anneau DANGER HAUTE TENSION
  fn0: 44, fn1: 71,         // inserts de fonctions (entre les bobines)
  sc0: 76, sc1: 100,        // coins de secteurs
  cv0: 102.5, cv1: 109.5,   // chevrons de progression
  ml0: 113, ml1: 119,       // jauge du million
  bez: 123.5,               // lunette chromée
};

// Coins de secteurs : moitié gauche = barillet gauche, moitié droite = barillet droit.
const SECT = [
  { id: 'hangar', ang: -120 }, { id: 'reactor', ang: 180 }, { id: 'tag', ang: 120 },
  { id: 'defense', ang: -60 }, { id: 'vault', ang: 0 }, { id: 'arena', ang: 60 },
];
const SEC_HALF = 28.2;
const FUNCS = [
  { id: 'multiball', ang: -120, col: C.magenta, label: 'MULTIBILLE', icon: 'balls' },
  { id: 'super', ang: -60, col: C.gold, label: 'SUPER JACKPOT', icon: 'star' },
  { id: 'kickback', ang: 180, col: C.lime, label: 'KICKBACK', icon: 'kick' },
  { id: 'mission', ang: 0, col: C.amber, label: 'MISSION', icon: 'target' },
  { id: 'bonus', ang: 120, col: C.cyan, label: 'BONUS', icon: null },
  { id: 'save', ang: 60, col: C.red, label: 'SAUVEGARDE', icon: 'save' },
];
const FN_HALF = 21.5;
const COILS = [-90, -30, 30, 90, 150, 210];
// jauge : créneau en haut (lampe « +1 »), segments dans le sens horaire
const MIL_N = 36, MIL_GAP = 12, MIL_A0 = -90 + MIL_GAP, MIL_SPAN = (360 - 2 * MIL_GAP) / MIL_N;
// colonne du noyau (du cadran vers le portail) et flèche du portail
const COLUMN = [{ y: 532, s: 11 }, { y: 511, s: 9 }, { y: 494, s: 7.5 }];
export const PORTAL_INS = { x: 281, y: 478, s: 8, combo: [263, 480], mission: [299, 480] };

const pol = (r, a) => [DIAL.x + Math.cos(a * RAD) * r, DIAL.y + Math.sin(a * RAD) * r];
// texte et icônes tangents, toujours lisibles (retournés dans la moitié basse)
const upright = (a) => (Math.sin(a * RAD) > 0.2 ? a - 90 : a + 90) * RAD;

function wedge(p, r0, r1, a0, a1) {
  const [sx, sy] = pol(r1, a0);
  p.moveTo(sx, sy);
  p.arc(DIAL.x, DIAL.y, r1, a0 * RAD, a1 * RAD);
  p.arc(DIAL.x, DIAL.y, r0, a1 * RAD, a0 * RAD, true);
  p.closePath();
  return p;
}

function boxOf(r0, r1, a0, a1, pad = 3) {
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (let i = 0; i <= 16; i++) {
    const a = a0 + (a1 - a0) * i / 16;
    for (const r of [r0, r1]) { const [x, y] = pol(r, a); x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  }
  return [x0 - pad, y0 - pad, x1 - x0 + 2 * pad, y1 - y0 + 2 * pad];
}

function mixHex(a, b, t) {
  const x = hexToRgb(a), y = hexToRgb(b);
  const h = (v) => Math.round(v).toString(16).padStart(2, '0');
  return '#' + h(x[0] + (y[0] - x[0]) * t) + h(x[1] + (y[1] - x[1]) * t) + h(x[2] + (y[2] - x[2]) * t);
}

// Géométrie précalculée des lentilles
function makeItem(def, r0, r1, half, col, ir, lr) {
  const p = wedge(new Path2D(), r0, r1, def.ang - half, def.ang + half);
  const [cx, cy] = pol((r0 + r1) / 2, def.ang);
  const chord = 2 * lr * Math.sin(half * RAD);
  return {
    ...def, col, r0, r1, half, path: p, box: boxOf(r0, r1, def.ang - half, def.ang + half),
    cx, cy, rad: Math.max(r1 - r0, chord * 0.7) * 0.7, rot: upright(def.ang),
    ip: pol(ir, def.ang), lp: pol(lr, def.ang), lw: chord - 10,
  };
}
// Lentilles et segments (Path2D) : créés au premier dessin (les modules de rendu doivent
// rester importables sous Node, sans DOM ni canvas).
let GEO = null;
function geo() {
  if (GEO) return GEO;
  const SITEMS = SECT.map(s => makeItem({ ...s, label: SECTORS[s.id].name, icon: SECTORS[s.id].icon }, DIAL.sc0, DIAL.sc1, SEC_HALF, SECTORS[s.id].color, 92.5, 81));
  const FITEMS = FUNCS.map(f => makeItem(f, DIAL.fn0, DIAL.fn1, FN_HALF, f.col, 52.5, 64));
  // chevrons : 3 segments par coin, dans le sens horaire
  const CHEV = {};
  for (const s of SECT) {
    const w = (2 * SEC_HALF - 2 * 2.2) / 3;
    CHEV[s.id] = [0, 1, 2].map(i => {
      const a0 = s.ang - SEC_HALF + i * (w + 2.2), a1 = a0 + w;
      return wedge(new Path2D(), DIAL.cv0, DIAL.cv1, a0, a1);
    });
  }
  GEO = { SITEMS, FITEMS, CHEV };
  return GEO;
}
const BONUS_PIPS = [-12, -4, 4, 12].map(d => pol(52.5, 120 + d));
const MIL_LAMP = pol((DIAL.ml0 + DIAL.ml1) / 2, -90);

// ---------------------------------------------------------------- icônes vectorielles
export function icon(g, kind, x, y, s, col, rot = 0, lw = 1.2) {
  g.save();
  g.translate(x, y); g.rotate(rot);
  g.strokeStyle = col; g.fillStyle = col; g.lineWidth = lw; g.lineJoin = 'round'; g.lineCap = 'round';
  g.beginPath();
  switch (kind) {
    case 'brick': {
      const w = s * 0.6, h = s * 0.3;
      for (const [bx, by] of [[-0.68, -0.62], [0, -0.62], [0.68, -0.62], [-0.34, -0.22], [0.34, -0.22]]) g.rect(bx * s - w / 2, by * s - h / 2, w, h);
      g.fill();
      g.beginPath(); g.arc(s * 0.32, s * 0.38, s * 0.17, 0, TAU); g.fill();
      g.beginPath(); g.moveTo(-s * 0.55, s * 0.82); g.lineTo(s * 0.2, s * 0.82); g.stroke();
      break;
    }
    case 'atom':
      for (let k = 0; k < 3; k++) { g.beginPath(); g.ellipse(0, 0, s, s * 0.36, k * Math.PI / 3, 0, TAU); g.stroke(); }
      g.beginPath(); g.arc(0, 0, s * 0.2, 0, TAU); g.fill();
      break;
    case 'spray':
      g.rect(-s * 0.32, -s * 0.15, s * 0.64, s * 1.1); g.rect(-s * 0.18, -s * 0.4, s * 0.36, s * 0.22); g.fill();
      for (const [dx, dy] of [[0.55, -0.55], [0.8, -0.75], [0.75, -0.35], [1, -0.55], [0.95, -0.95]]) { g.beginPath(); g.arc(dx * s, dy * s, s * 0.08, 0, TAU); g.fill(); }
      break;
    case 'shield':
      g.moveTo(0, -s); g.quadraticCurveTo(s * 0.45, -s * 0.72, s * 0.85, -s * 0.75); g.lineTo(s * 0.8, 0);
      g.quadraticCurveTo(s * 0.7, s * 0.62, 0, s); g.quadraticCurveTo(-s * 0.7, s * 0.62, -s * 0.8, 0);
      g.lineTo(-s * 0.85, -s * 0.75); g.quadraticCurveTo(-s * 0.45, -s * 0.72, 0, -s); g.closePath(); g.stroke();
      g.beginPath(); g.moveTo(0, -s * 0.6); g.lineTo(0, s * 0.6); g.moveTo(-s * 0.45, -s * 0.1); g.lineTo(s * 0.45, -s * 0.1); g.stroke();
      break;
    case 'vault':
      g.arc(0, 0, s, 0, TAU); g.stroke();
      g.beginPath(); g.arc(0, 0, s * 0.5, 0, TAU); g.stroke();
      for (let k = 0; k < 8; k++) { const a = k * Math.PI / 4; g.beginPath(); g.moveTo(Math.cos(a) * s * 0.66, Math.sin(a) * s * 0.66); g.lineTo(Math.cos(a) * s * 0.86, Math.sin(a) * s * 0.86); g.stroke(); }
      for (let k = 0; k < 3; k++) { const a = k * TAU / 3 - 0.4; g.beginPath(); g.moveTo(0, 0); g.lineTo(Math.cos(a) * s * 0.45, Math.sin(a) * s * 0.45); g.stroke(); }
      break;
    case 'goal':
      g.moveTo(-s, s * 0.55); g.lineTo(-s, -s * 0.55); g.lineTo(s, -s * 0.55); g.lineTo(s, s * 0.55); g.stroke();
      g.lineWidth = lw * 0.5; g.beginPath();
      for (let k = 1; k < 4; k++) { g.moveTo(-s + k * s / 2, -s * 0.55); g.lineTo(-s + k * s / 2, s * 0.1); }
      g.moveTo(-s, -s * 0.2); g.lineTo(s, -s * 0.2); g.stroke();
      g.beginPath(); g.arc(0, s * 0.62, s * 0.26, 0, TAU); g.fill();
      break;
    case 'balls':
      for (const [bx, by] of [[-0.5, 0.32], [0.5, 0.32], [0, -0.48]]) { g.beginPath(); g.arc(bx * s, by * s, s * 0.38, 0, TAU); g.fill(); }
      break;
    case 'star':
      for (let k = 0; k < 10; k++) { const a = -Math.PI / 2 + k * Math.PI / 5, rr = k % 2 ? s * 0.42 : s; k ? g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr) : g.moveTo(Math.cos(a) * rr, Math.sin(a) * rr); }
      g.closePath(); g.fill();
      break;
    case 'kick':
      g.moveTo(0, -s); g.lineTo(s * 0.6, -s * 0.3); g.lineTo(s * 0.2, -s * 0.3); g.lineTo(s * 0.2, s * 0.1); g.lineTo(-s * 0.2, s * 0.1);
      g.lineTo(-s * 0.2, -s * 0.3); g.lineTo(-s * 0.6, -s * 0.3); g.closePath(); g.fill();
      g.beginPath(); g.moveTo(0, s * 0.22);
      for (let k = 0; k < 4; k++) g.lineTo((k % 2 ? -1 : 1) * s * 0.4, s * (0.36 + k * 0.17));
      g.stroke();
      break;
    case 'target':
      g.arc(0, 0, s, 0, TAU); g.stroke();
      g.beginPath(); g.arc(0, 0, s * 0.5, 0, TAU); g.stroke();
      g.beginPath(); g.arc(0, 0, s * 0.15, 0, TAU); g.fill();
      g.beginPath(); g.moveTo(-s * 1.2, 0); g.lineTo(-s * 0.7, 0); g.moveTo(s * 0.7, 0); g.lineTo(s * 1.2, 0); g.moveTo(0, -s * 1.2); g.lineTo(0, -s * 0.7); g.moveTo(0, s * 0.7); g.lineTo(0, s * 1.2); g.stroke();
      break;
    case 'save':
      g.arc(0, 0, s * 0.82, -0.2 * Math.PI, 1.35 * Math.PI); g.stroke();
      g.beginPath(); g.moveTo(s * 0.82 * Math.cos(-0.2 * Math.PI) + s * 0.3, s * 0.82 * Math.sin(-0.2 * Math.PI) - s * 0.05);
      g.lineTo(s * 0.82 * Math.cos(-0.2 * Math.PI) - s * 0.05, s * 0.82 * Math.sin(-0.2 * Math.PI) + s * 0.35);
      g.lineTo(s * 0.82 * Math.cos(-0.2 * Math.PI) - s * 0.25, s * 0.82 * Math.sin(-0.2 * Math.PI) - s * 0.2); g.closePath(); g.fill();
      g.beginPath(); g.arc(0, 0, s * 0.3, 0, TAU); g.fill();
      break;
    case 'bolt':
      g.moveTo(s * 0.25, -s); g.lineTo(-s * 0.45, s * 0.12); g.lineTo(0, s * 0.12); g.lineTo(-s * 0.25, s); g.lineTo(s * 0.45, -s * 0.15); g.lineTo(0, -s * 0.15); g.closePath(); g.fill();
      break;
    case 'null':
      g.arc(0, 0, s * 0.62, 0, TAU); g.stroke();
      g.beginPath(); g.moveTo(-s * 0.85, s * 0.85); g.lineTo(s * 0.85, -s * 0.85); g.stroke();
      break;
    case 'skull':
      g.arc(0, -s * 0.15, s * 0.72, 0, TAU); g.fill();
      g.fillRect(-s * 0.42, s * 0.3, s * 0.84, s * 0.55);
      break;
  }
  g.restore();
}

// Texte posé le long d'un arc (haut : sens horaire ; bas : lisible de gauche à droite).
function arcText(g, str, r, ang, size, col, top = true, font = DISPLAY, spacing = 0.15) {
  g.save();
  g.font = `800 ${size}px ${font}`; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.lineJoin = 'round';
  const ws = [...str].map(ch => g.measureText(ch).width + size * spacing);
  const total = ws.reduce((a, b) => a + b, 0);
  const sg = top ? 1 : -1;
  let a = ang * RAD - sg * total / r / 2;
  [...str].forEach((ch, i) => {
    const ac = a + sg * ws[i] / r / 2;
    g.save();
    g.translate(DIAL.x + Math.cos(ac) * r, DIAL.y + Math.sin(ac) * r);
    g.rotate(top ? ac + Math.PI / 2 : ac - Math.PI / 2);
    g.strokeStyle = 'rgba(4,2,12,0.9)'; g.lineWidth = Math.max(1.6, size * 0.24); g.strokeText(ch, 0, 0);
    g.fillStyle = col; g.fillText(ch, 0, 0);
    g.restore();
    a += sg * ws[i] / r;
  });
  g.restore();
}

// Lentille éteinte (plastique coloré enchâssé) et lentille allumée (pour les sprites).
function lensBase(g, p, cx, cy, rad, col) {
  g.lineJoin = 'round';
  g.strokeStyle = 'rgba(0,0,0,0.85)'; g.lineWidth = 3.4; g.stroke(p);
  const grd = g.createRadialGradient(cx - rad * 0.3, cy - rad * 0.35, 0, cx, cy, rad * 1.25);
  grd.addColorStop(0, rgba(col, 0.4)); grd.addColorStop(0.6, rgba(col, 0.2)); grd.addColorStop(1, rgba(col, 0.09));
  g.fillStyle = grd; g.fill(p);
  g.strokeStyle = rgba(col, 0.6); g.lineWidth = 0.9; g.stroke(p);
  g.save(); g.clip(p);
  g.fillStyle = 'rgba(255,255,255,0.09)';
  g.beginPath(); g.ellipse(cx - rad * 0.2, cy - rad * 0.45, rad * 0.9, rad * 0.32, -0.3, 0, TAU); g.fill();
  g.restore();
}

function lensLit(g, p, cx, cy, rad, col) {
  const grd = g.createRadialGradient(cx, cy, 0, cx, cy, rad * 1.25);
  grd.addColorStop(0, '#ffffff'); grd.addColorStop(0.36, col); grd.addColorStop(1, rgba(col, 0.82));
  g.fillStyle = grd; g.fill(p);
}

// Impression d'une lentille (icône + nom) : couleur de l'insert sur la lentille éteinte,
// encre sombre sur la lentille allumée.
function printItem(g, it, ink, outline, func) {
  const fsz = func ? 7 : 6.6, font = func ? TEXT : DISPLAY;
  g.font = `800 ${fsz}px ${font}`;
  const w = g.measureText(it.label).width;
  const size = w > it.lw ? fsz * it.lw / w : fsz;
  paint(g, it.label, it.lp[0], it.lp[1], size, ink, { font, rot: it.rot, outline: outline || 'rgba(0,0,0,0)' });
  if (it.icon) icon(g, it.icon, it.ip[0], it.ip[1], func ? 5 : 5.6, ink, it.rot, func ? 1.1 : 1.3);
}

export class DialArt {
  constructor(r) {
    this.r = r;
    this.eyeSt = { x: 0, y: 0, blink: 0, nextBlink: 3 };
    this.lifeTick = 0; this.lifeFlash = 0; this.lastT = 0;
  }

  // ============================================================ statique : peinture
  drawPaint(g) {
    const { x, y } = DIAL;
    const halo = g.createRadialGradient(x, y, 70, x, y, 190);
    halo.addColorStop(0, 'rgba(80,34,150,0.55)'); halo.addColorStop(1, 'rgba(10,5,25,0)');
    g.fillStyle = halo; g.beginPath(); g.arc(x, y, 190, 0, TAU); g.fill();
    // soleil Art déco : rayons alternés, plus longs dans les axes
    for (let k = 0; k < 48; k++) {
      const a = k * 7.5 - 90;
      const big = k % 2 === 0, axis = k % 6 === 0;
      const r1 = axis ? 186 : big ? 166 : 146, hw = big ? 1.3 : 0.8;
      const [ax, ay] = pol(126, a - hw), [bx, by] = pol(126, a + hw), [tx, ty] = pol(r1, a);
      g.fillStyle = rgba(k % 4 === 0 ? C.gold : C.violet, axis ? 0.2 : big ? 0.13 : 0.09);
      g.beginPath(); g.moveTo(ax, ay); g.lineTo(tx, ty); g.lineTo(bx, by); g.closePath(); g.fill();
    }
    // gradins autour de la lunette
    for (const [rr, a, w] of [[130, 0.42, 2], [136.5, 0.24, 1.2], [143, 0.14, 1]]) {
      g.strokeStyle = rgba('#c9b8ff', a); g.lineWidth = w;
      g.beginPath(); g.arc(x, y, rr, 0, TAU); g.stroke();
    }
    // graduations Art déco sur le premier gradin
    for (let k = 0; k < 72; k++) {
      const a = k * 5;
      const [ax, ay] = pol(126.5, a), [bx, by] = pol(k % 3 === 0 ? 133 : 129.5, a);
      g.strokeStyle = rgba(k % 9 === 0 ? C.gold : '#c9b8ff', k % 3 === 0 ? 0.55 : 0.25); g.lineWidth = k % 3 === 0 ? 1.3 : 0.8;
      g.beginPath(); g.moveTo(ax, ay); g.lineTo(bx, by); g.stroke();
    }
    // plateau du cadran
    const pl = g.createRadialGradient(x - 30, y - 40, 10, x, y, DIAL.bez);
    pl.addColorStop(0, '#1a1030'); pl.addColorStop(0.7, '#0c0718'); pl.addColorStop(1, '#05030b');
    g.fillStyle = pl; g.beginPath(); g.arc(x, y, DIAL.bez, 0, TAU); g.fill();
    // légende de la jauge (sous la lunette)
    arcText(g, '1 000 000 PTS = +1 VIE', 137, 90, 6.4, rgba(C.gold, 0.95), false);
  }

  // ============================================================ statique : matériel
  drawHardware(g) {
    const { x, y } = DIAL;
    const { SITEMS, FITEMS, CHEV } = geo();
    // gorges entre les anneaux
    g.strokeStyle = 'rgba(0,0,0,0.7)'; g.lineWidth = 2;
    for (const rr of [DIAL.fn1 + 2.5, DIAL.sc1 + 1.2, DIAL.cv1 + 1.8]) { g.beginPath(); g.arc(x, y, rr, 0, TAU); g.stroke(); }
    // inserts de fonctions et coins de secteurs (éteints, imprimés)
    for (const it of FITEMS) {
      lensBase(g, it.path, it.cx, it.cy, it.rad, it.col);
      printItem(g, it, rgba(it.col, 0.85), 'rgba(4,2,12,0.85)', true);
    }
    for (const [px, py] of BONUS_PIPS) insertBase(g, 'triangle', px, py, 3.6, C.cyan, upright(120));
    for (const it of SITEMS) {
      lensBase(g, it.path, it.cx, it.cy, it.rad, it.col);
      printItem(g, it, rgba(it.col, 0.9), 'rgba(4,2,12,0.85)', false);
      for (const p of CHEV[it.id]) {
        g.strokeStyle = 'rgba(0,0,0,0.85)'; g.lineWidth = 2.4; g.stroke(p);
        g.fillStyle = rgba(it.col, 0.13); g.fill(p);
        g.strokeStyle = rgba(it.col, 0.45); g.lineWidth = 0.7; g.stroke(p);
      }
    }
    // jauge du million
    const mp = this._milPath();
    g.strokeStyle = 'rgba(0,0,0,0.85)'; g.lineWidth = 2; g.stroke(mp);
    g.fillStyle = 'rgba(255,216,74,0.08)'; g.fill(mp);
    g.strokeStyle = 'rgba(255,216,74,0.3)'; g.lineWidth = 0.6; g.stroke(mp);
    insertBase(g, 'circle', MIL_LAMP[0], MIL_LAMP[1], 5.2, C.gold);
    // anneau DANGER HAUTE TENSION
    g.fillStyle = '#0d0a05';
    g.beginPath(); g.arc(x, y, DIAL.hv1, 0, TAU); g.arc(x, y, DIAL.hv0, 0, TAU, true); g.fill();
    for (let k = 0; k < 60; k++) {
      const a0 = k * 6, p = wedge(new Path2D(), DIAL.hv1 - 1.6, DIAL.hv1, a0, a0 + 3);
      g.fillStyle = k % 2 ? 'rgba(255,176,46,0.85)' : 'rgba(20,14,4,0.9)'; g.fill(p);
    }
    this._hvText(g, rgba(C.amber, 0.9));
    // bobines d'aimant
    for (const a of COILS) this._coil(g, a);
    // logement de l'œil
    g.fillStyle = '#05030b';
    g.beginPath(); g.arc(x, y, 30, 0, TAU); g.fill();
    const ring = (rr) => Array.from({ length: 49 }, (_, i) => [x + Math.cos(i * TAU / 48) * rr, y + Math.sin(i * TAU / 48) * rr]);
    chrome(g, ring(31), 3, { shadow: false });
    chrome(g, ring(DIAL.hv1 + 1.2), 1.4, { shadow: false, mid: '#5d6a83' });
    chrome(g, ring(DIAL.fn1 + 3), 2.2, { shadow: false, glow: C.violet });
    chrome(g, ring(DIAL.cv1 + 2), 1.4, { shadow: false, mid: '#5d6a83' });
    // lunette chromée et rivets
    chrome(g, ring(DIAL.bez), 4.2, { glow: C.violet });
    for (let k = 0; k < 24; k++) {
      if (k === 18) continue;            // place de la colonne
      const [sx, sy] = pol(DIAL.bez, k * 15 + 7.5);
      screw(g, sx, sy, k % 2 ? 1.5 : 2);
    }
    this._column(g);
  }

  _milPath() {
    if (this.mp) return this.mp;
    const p = new Path2D();
    this.segs = [];
    for (let i = 0; i < MIL_N; i++) {
      const a0 = MIL_A0 + i * MIL_SPAN + 0.7;
      wedge(p, DIAL.ml0, DIAL.ml1, a0, a0 + MIL_SPAN - 1.4);
      this.segs.push(wedge(new Path2D(), DIAL.ml0, DIAL.ml1, a0, a0 + MIL_SPAN - 1.4));
    }
    this.mp = p;
    return p;
  }

  _hvText(g, col) {
    arcText(g, 'DANGER', 36.6, -90, 6.4, col, true);
    arcText(g, 'HAUTE TENSION', 36.6, 90, 5.1, col, false, DISPLAY, 0.08);
    const [lx, ly] = pol(36.6, 180), [rx, ry] = pol(36.6, 0);
    icon(g, 'bolt', lx, ly, 3.6, col);
    icon(g, 'bolt', rx, ry, 3.6, col);
  }

  // Bobine radiale : noyau de fer, spires de cuivre, flasques chromées.
  _coil(g, a, lit = false) {
    const r0 = DIAL.fn0 + 0.5, r1 = DIAL.fn1, w = 4.4;
    g.save();
    g.translate(DIAL.x, DIAL.y); g.rotate(a * RAD);
    if (!lit) {
      g.fillStyle = 'rgba(0,0,0,0.6)'; g.fillRect(r0 + 1.5, -w + 1.8, r1 - r0, w * 2);
      const cu = g.createLinearGradient(0, -w, 0, w);
      cu.addColorStop(0, '#4a200a'); cu.addColorStop(0.32, '#e8945a'); cu.addColorStop(0.55, '#b4652e'); cu.addColorStop(1, '#341405');
      g.fillStyle = cu; g.fillRect(r0 + 2.5, -w, r1 - r0 - 5, w * 2);
      g.strokeStyle = 'rgba(40,12,2,0.75)'; g.lineWidth = 0.55;
      g.beginPath();
      for (let u = r0 + 3.2; u < r1 - 2.8; u += 1.5) { g.moveTo(u, -w); g.lineTo(u + 0.7, w); }
      g.stroke();
      const fe = g.createLinearGradient(0, -w - 1.4, 0, w + 1.4);
      fe.addColorStop(0, '#dfe7f6'); fe.addColorStop(0.5, '#7d8aa3'); fe.addColorStop(1, '#2a3040');
      g.fillStyle = fe;
      g.fillRect(r0, -w - 1.4, 2.6, w * 2 + 2.8); g.fillRect(r1 - 2.6, -w - 1.4, 2.6, w * 2 + 2.8);
    } else {
      // spires chauffées à blanc, arc bleuté
      g.fillStyle = 'rgba(60,170,255,0.32)'; g.fillRect(r0 + 2.5, -w, r1 - r0 - 5, w * 2);
      g.strokeStyle = 'rgba(190,245,255,0.8)'; g.lineWidth = 0.55;
      g.beginPath();
      for (let u = r0 + 3.2; u < r1 - 2.8; u += 1.5) { g.moveTo(u, -w); g.lineTo(u + 0.7, w); }
      g.stroke();
    }
    g.restore();
  }

  // Colonne du noyau : cadre chromé à gradins, cellules hexagonales, flèche du portail.
  _column(g) {
    const L = [[264, 547], [264, 526], [267.5, 505], [271, 488], [273, 471]];
    const Rr = L.map(([px, py]) => [562 - px, py]);
    g.fillStyle = '#0a0512';
    g.beginPath(); L.forEach(([px, py], i) => (i ? g.lineTo(px, py) : g.moveTo(px, py))); for (let i = Rr.length - 1; i >= 0; i--) g.lineTo(Rr[i][0], Rr[i][1]); g.closePath(); g.fill();
    g.strokeStyle = rgba(CORE, 0.12); g.lineWidth = 1;
    for (let yy = 476; yy < 546; yy += 4) { g.beginPath(); g.moveTo(266, yy); g.lineTo(296, yy); g.stroke(); }
    chrome(g, L, 2.2, { glow: CORE });
    chrome(g, Rr, 2.2, { glow: CORE });
    COLUMN.forEach((c, i) => {
      insertBase(g, 'hex', 281, c.y, c.s, CORE);
      icon(g, 'null', 281, c.y, c.s * 0.62, rgba(CORE, 0.75), 0, 1);
      if (i === 0) paint(g, 'NOYAU', 281 + 24, c.y + 3, 5.6, rgba(CORE, 0.9), { font: DISPLAY, rot: -Math.PI / 2 });
    });
    const P = PORTAL_INS;
    insertBase(g, 'arrow', P.x, P.y, P.s, C.violet);
    insertBase(g, 'chevron', P.combo[0], P.combo[1], 5.5, C.white, 0);
    insertBase(g, 'circle', P.mission[0], P.mission[1], 3.4, C.gold, 0);
  }

  // ============================================================ sprites (lentilles allumées)
  _litSprite(it, col, func) {
    const [bx, by, bw, bh] = it.box;
    return this.r.sprite(`dial-${it.id}-${col}`, bx, by, bw, bh, (g) => {
      lensLit(g, it.path, it.cx, it.cy, it.rad, col);
      printItem(g, it, 'rgba(14,4,26,0.78)', null, func);
      g.strokeStyle = 'rgba(255,255,255,0.55)'; g.lineWidth = 0.8; g.stroke(it.path);
    });
  }

  // anneau complet de la jauge, allumé (palette : life | fury | chrono)
  _milSprite(kind) {
    const R = DIAL.ml1 + 3;
    return this.r.sprite('dial-mil-' + kind, DIAL.x - R, DIAL.y - R, 2 * R, 2 * R, (g) => {
      for (let i = 0; i < MIL_N; i++) {
        const u = i / (MIL_N - 1);
        const col = kind === 'life' ? (u < 0.5 ? mixHex(C.cyan, C.green, u * 2) : mixHex(C.green, C.gold, u * 2 - 1))
          : kind === 'fury' ? mixHex(C.amber, '#ff2a3a', u) : (i % 2 ? '#ff2a3a' : '#ff5a4a');
        const a0 = MIL_A0 + i * MIL_SPAN + 0.7;
        const p = wedge(new Path2D(), DIAL.ml0, DIAL.ml1, a0, a0 + MIL_SPAN - 1.4);
        g.fillStyle = col; g.fill(p);
        g.strokeStyle = 'rgba(255,255,255,0.7)'; g.lineWidth = 0.6;
        const [ax, ay] = pol(DIAL.ml1 - 1.4, a0 + 0.6), [bx2, by2] = pol(DIAL.ml1 - 1.4, a0 + MIL_SPAN - 2);
        g.beginPath(); g.moveTo(ax, ay); g.lineTo(bx2, by2); g.stroke();
      }
    });
  }

  // bobines et anneau DANGER allumés (posés en mode additif)
  _magnetSprite() {
    const R = DIAL.fn1 + 4;
    return this.r.sprite('dial-magnet', DIAL.x - R, DIAL.y - R, 2 * R, 2 * R, (g) => {
      for (const a of COILS) this._coil(g, a, true);
      this._hvText(g, '#fff3c0');
    });
  }

  // ============================================================ par image
  draw(ctx, table, game, lamps, t) {
    const r = this.r, rfx = r.settings.reducedFx;
    const { SITEMS, FITEMS, CHEV } = geo();
    const dt = Math.max(0, Math.min(0.1, t - this.lastT)); this.lastT = t;
    const F = game.frenzy;
    const blink = (f, lo = 0.2) => (Math.sin(t * f) > -0.2 ? 1 : lo);
    // ---- inserts de fonctions
    const m = game.missions.hud(), B = game.bonus;
    const fk = {
      multiball: table.multiball ? 1 : table.multiballLit ? blink(8) : 0,
      super: table.superLit ? (Math.sin(t * 10) > 0 ? 1 : 0.2) : 0,
      kickback: Math.max(table.kickback.lit ? 1 : 0, table.kickback.flash > 0 ? (Math.sin(t * 30) > 0 ? 1 : 0) : 0),
      mission: m ? (m.timeLeft < 10 ? (Math.sin(t * 10) > 0 ? 1 : 0.3) : 0.85) : 0,
      bonus: table.bonusX > 1 ? 0.45 + 0.14 * (table.bonusX - 2) : 0,
      save: B.saveT > 0 ? (B.saveT < 2 ? (Math.sin(t * 20) > 0 ? 1 : 0.2) : 1) : 0,
    };
    if (!F) {
      for (const it of FITEMS) {
        const k = fk[it.id];
        if (k <= 0.01) continue;
        r.glow(it.cx, it.cy, 58, it.col, 0.42 * k);
        r.drawSprite(ctx, this._litSprite(it, it.col, true), k);
      }
      BONUS_PIPS.forEach(([px, py], i) => { if (table.bonusX >= i + 2) insertLit(ctx, 'triangle', px, py, 3.6, '#e8fdff', 1, upright(120)); });
    }
    // ---- bobines : allumées pendant l'aimant
    const M = table.magnet;
    let mk = 0;
    if (M) mk = M.phase === 'pull' ? clamp01(M.t / 0.5) : 0.75 + 0.25 * Math.sin(t * 31);
    if (mk > 0.01) {
      ctx.globalCompositeOperation = 'lighter';
      r.drawSprite(ctx, this._magnetSprite(), mk);
      ctx.globalCompositeOperation = 'source-over';
      for (const a of COILS) { const [gx, gy] = pol(58, a); r.glow(gx, gy, 46, '#7fefff', 0.4 * mk); }
    }
    // ---- coins de secteurs
    const faceL = table.face('L'), faceR = table.face('R');
    const animL = table.barrels.L.anim, animR = table.barrels.R.anim;
    SITEMS.forEach((it, idx) => {
      const id = it.id, st = table.sectorState(id);
      let k = 0, col = it.col;
      switch (st) {
        case 'done': k = 1; break;
        case 'ready': k = blink(8); break;
        case 'armed': k = 0.42 + 0.18 * Math.sin(t * 3); break;
        case 'hold': k = 0.35 + 0.25 * Math.sin(t * 3); col = C.amber; break;
        case 'prep': k = 0.16 + 0.07 * Math.sin(t * 2 + idx); break;
      }
      if (table.sectors[id].flash > 0) k = Math.max(k, Math.sin(t * 20) > 0 ? 1 : 0);
      if (F) {
        // FURIE : chenillard rouge qui tourne autour du cadran
        const ph = ((t * (rfx ? 1.2 : 3.2) - (it.ang + 120) / 60) % 6 + 6) % 6;
        k = Math.max(0.22, ph < 1 ? 1 - ph * 0.6 : 0.22); col = '#ff2a3a';
      }
      if (k > 0.01) {
        r.glow(it.cx, it.cy, 74, col, 0.4 * k);
        r.drawSprite(ctx, this._litSprite(it, col, false), k);
      }
      // chevrons de progression
      const n = st === 'done' ? 3 : Math.min(3, table.chevrons[id] || 0);
      const side = SECTORS[id].barrel, B2 = table.barrels[side];
      const presented = (side === 'L' ? faceL : faceR) === id;
      for (let i = 0; i < 3; i++) {
        const p = CHEV[id][i];
        let kk = i < n ? 1 : 0;
        if (presented && i === n - 1 && B2.chevFlash > 0) kk = Math.sin(t * 26) > 0 ? 1 : 0.3;
        if (kk <= 0) continue;
        ctx.globalAlpha = kk;
        ctx.fillStyle = st === 'done' ? '#ffffff' : it.col; ctx.fill(p);
        ctx.strokeStyle = 'rgba(255,255,255,0.75)'; ctx.lineWidth = 0.7; ctx.stroke(p);
        ctx.globalAlpha = 1;
      }
      if (n > 0 && !F) { const [gx, gy] = pol(DIAL.cv1 - 3, it.ang); r.glow(gx, gy, 40, it.col, 0.18 + 0.08 * n); }
      // face présentée sur la rampe : liseré blanc ; face suivante pendant la rotation : ambre
      const anim = side === 'L' ? animL : animR;
      if (presented && !anim) {
        ctx.strokeStyle = rgba('#ffffff', 0.55 + 0.25 * Math.sin(t * 4)); ctx.lineWidth = 1.4; ctx.stroke(it.path);
      } else if (anim && B2.faces[anim.to] === id) {
        ctx.strokeStyle = rgba(C.amber, Math.sin(t * 14) > 0 ? 0.95 : 0.3); ctx.lineWidth = 1.6; ctx.stroke(it.path);
      }
    });
    // ---- jauge du million (ou chrono de la FURIE)
    this._gauge(ctx, game, t, dt, F);
    // ---- colonne du noyau
    const done = table.sectorsDone(), cst = table.sectorState('core');
    COLUMN.forEach((c, i) => {
      let k = done > i ? 1 : 0, col = CORE;
      if (cst === 'ready') k = Math.sin(t * 10 - i * 1.3) > 0 ? 1 : 0.25;
      else if (cst === 'hold') { k = 0.35 + 0.25 * Math.sin(t * 3); col = C.amber; }
      if (table.sectors.core.flash > 0) k = Math.max(k, Math.sin(t * 20) > 0 ? 1 : 0);
      if (k <= 0.01) return;
      r.glow(281, c.y, 26 + c.s * 3.5, col, 0.45 * k);
      insertLit(ctx, 'hex', 281, c.y, c.s, col, k);
      ctx.globalAlpha = k;
      icon(ctx, 'null', 281, c.y, c.s * 0.62, 'rgba(30,0,10,0.75)', 0, 1);
      ctx.globalAlpha = 1;
    });
    if (F) this._fury(ctx, F, t, rfx);
  }

  _gauge(ctx, game, t, dt, F) {
    const r = this.r;
    const { x, y } = DIAL;
    const every = RULES.lifeEvery;
    // une vie vient d'être gagnée : éclair de la lampe « +1 »
    if (game.lifeTick > this.lifeTick) this.lifeFlash = 2;
    this.lifeTick = game.lifeTick;
    this.lifeFlash = Math.max(0, this.lifeFlash - dt);
    let u, kind;
    if (F) {
      kind = 'chrono';
      u = F.intro > 0 ? (Math.sin(t * 16) > 0 ? 1 : 0) : clamp01(F.t / F.dur);
    } else {
      kind = game.ballsLeft >= game.maxBalls ? 'fury' : 'life';
      u = clamp01((game.score - (game.nextLifeAt - every)) / every);
    }
    const n = Math.floor(u * MIL_N + 1e-6);
    if (n > 0) {
      ctx.save();
      ctx.beginPath(); ctx.moveTo(x, y);
      ctx.arc(x, y, DIAL.ml1 + 3, MIL_A0 * RAD, (MIL_A0 + n * MIL_SPAN) * RAD);
      ctx.closePath(); ctx.clip();
      r.drawSprite(ctx, this._milSprite(kind), 1);
      ctx.restore();
      const [gx, gy] = pol((DIAL.ml0 + DIAL.ml1) / 2, MIL_A0 + (n - 0.5) * MIL_SPAN);
      r.glow(gx, gy, 46, kind === 'life' ? (u > 0.5 ? C.gold : C.green) : '#ff3a3a', 0.5);
    }
    // segment suivant : se remplit (clignote près du but)
    if (n < MIL_N && !(F && F.intro > 0)) {
      const frac = u * MIL_N - n;
      const near = !F && u > 0.9;
      ctx.save();
      this._milPath();
      ctx.globalAlpha = F ? 0.35 : near ? (Math.sin(t * 12) > 0 ? 0.9 : 0.25) : 0.2 + 0.5 * frac;
      ctx.fillStyle = kind === 'life' ? C.gold : '#ff3a3a';
      ctx.fill(this.segs[n]);
      ctx.restore();
    }
    // lampe « +1 » (ou « ! » : réserve pleine, le prochain million déclenche la FURIE)
    const [lx, ly] = MIL_LAMP;
    let lk = this.lifeFlash > 0 ? (Math.sin(t * 22) > 0 ? 1 : 0.3) : !F && u > 0.9 ? (Math.sin(t * 8) > 0 ? 1 : 0.3) : 0.35;
    if (F) lk = Math.sin(t * 14) > 0 ? 1 : 0.4;
    const lc = F || kind === 'fury' ? '#ff3a3a' : C.gold;
    r.glow(lx, ly, 40, lc, 0.5 * lk);
    insertLit(ctx, 'circle', lx, ly, 5.2, lc, lk);
    r.text(F || kind === 'fury' ? '!' : '+1', lx, ly + 0.4, 5.6, '#1a0a00', 'center', 0.85, true);
  }

  // FURIE : disque d'alerte, compteur de billes et chrono lisibles même en portrait.
  _fury(ctx, F, t, rfx) {
    const r = this.r, { x, y } = DIAL;
    ctx.fillStyle = 'rgba(18,0,5,0.92)';
    ctx.beginPath(); ctx.arc(x, y, DIAL.fn1 + 1.5, 0, TAU); ctx.fill();
    const pulse = rfx ? 0.75 : 0.6 + 0.4 * Math.sin(t * 9);
    ctx.strokeStyle = rgba('#ff2a3a', pulse); ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(x, y, DIAL.fn1, 0, TAU); ctx.stroke();
    r.glow(x, y - 48, 90, '#ff2030', 0.35 * pulse);
    if (F.intro > 0) {
      r.text('FURIE', x, y - 50, 13, Math.sin(t * 18) > 0 ? '#ffffff' : '#ff3040', 'center', 1, true);
      r.text(String(F.kept), x, y + 50, 14, '#ffd0d6', 'center', 1, true);
      return;
    }
    const kept = F.kept, need = F.need;
    const col = kept <= need ? (Math.sin(t * 16) > 0 ? '#ffffff' : '#ff3040') : kept === need + 1 ? C.amber : '#ffe6ea';
    const s = String(kept);
    r.text(s, x - (s.length > 1 ? 13 : 8), y - 47, 27, col, 'center', 1, true);
    r.text('/' + need, x + (s.length > 1 ? 9 : 5), y - 53, 12, '#ff8a96', 'left', 1, true);
    r.text('MIN.', x + (s.length > 1 ? 10 : 6), y - 40, 6.5, '#ff8a96', 'left', 0.9, true);
    const sec = Math.max(0, Math.ceil(F.t));
    r.text(String(sec), x - 2, y + 50, 15, sec <= 5 ? (Math.sin(t * 16) > 0 ? '#ffffff' : '#ff3040') : '#ffd0d6', 'center', 1, true);
    r.text('S', x + (sec >= 10 ? 13 : 8), y + 53, 6.5, '#ff8a96', 'left', 0.9, true);
  }

  // ============================================================ aimant de l'œil
  // pull : rayon tracteur et arcs électriques de l'œil vers la bille (sous la bille en vol).
  beam(ctx, table, t) {
    const M = table.magnet;
    if (!M || M.phase !== 'pull') return;
    const r = this.r, b = M.ball, { x, y } = DIAL;
    const dx = b.x - x, dy = b.y - y, d = Math.hypot(dx, dy) || 1, nx = -dy / d, ny = dx / d;
    const w0 = 20, w1 = b.r * b.scale * 1.4;
    ctx.globalCompositeOperation = 'lighter';
    for (const [k, a] of [[1, 0.13], [0.45, 0.22]]) {
      ctx.fillStyle = `rgba(80,230,255,${a})`;
      ctx.beginPath();
      ctx.moveTo(x + nx * w0 * k, y + ny * w0 * k); ctx.lineTo(b.x + nx * w1 * k, b.y + ny * w1 * k);
      ctx.lineTo(b.x - nx * w1 * k, b.y - ny * w1 * k); ctx.lineTo(x - nx * w0 * k, y - ny * w0 * k);
      ctx.closePath(); ctx.fill();
    }
    // anneaux qui remontent le rayon vers l'œil
    for (let i = 0; i < 4; i++) {
      const u = 1 - ((t * 2.2 + i / 4) % 1), px = x + dx * u, py = y + dy * u, w = w0 + (w1 - w0) * u;
      ctx.strokeStyle = `rgba(160,245,255,${0.5 * (1 - u) + 0.15})`; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(px + nx * w, py + ny * w); ctx.lineTo(px - nx * w, py - ny * w); ctx.stroke();
    }
    this._arcs(ctx, x, y, b.x, b.y, r.settings.reducedFx ? 1 : 3, 9);
    ctx.globalCompositeOperation = 'source-over';
    r.glow(b.x, b.y, 60, '#7fefff', 0.5);
  }

  // hold : la bille lévite au centre de l'œil ; champ, halo et arcs autour (par-dessus la bille).
  field(ctx, table, t) {
    const M = table.magnet;
    if (!M || M.phase !== 'hold') return;
    const r = this.r, { x, y } = DIAL, b = M.ball;
    r.glow(x, y, 150, '#29e3ff', 0.32 + 0.08 * Math.sin(t * 9));
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 3; i++) {
      const u = (t * 1.4 + i / 3) % 1;
      ctx.strokeStyle = `rgba(120,240,255,${0.55 * (1 - u)})`; ctx.lineWidth = 1.6 - u;
      ctx.beginPath(); ctx.arc(x, y, 15 + u * 30, 0, TAU); ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(200,250,255,0.5)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(x, y, b.r * b.scale + 3 + Math.sin(t * 20), 0, TAU); ctx.stroke();
    if (!r.settings.reducedFx) {
      for (let i = 0; i < 2; i++) {
        const a = COILS[(Math.floor(t * 9) + i * 3) % 6] * RAD;
        this._arcs(ctx, x + Math.cos(a) * 46, y + Math.sin(a) * 46, b.x + Math.cos(a) * 10, b.y + Math.sin(a) * 10, 1, 4);
      }
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  _arcs(ctx, x0, y0, x1, y1, n, amp) {
    const dx = x1 - x0, dy = y1 - y0, d = Math.hypot(dx, dy) || 1, nx = -dy / d, ny = dx / d;
    const seg = Math.max(4, Math.round(d / 14));
    ctx.lineJoin = 'round';
    for (let k = 0; k < n; k++) {
      ctx.beginPath(); ctx.moveTo(x0, y0);
      for (let i = 1; i < seg; i++) {
        const u = i / seg, o = (Math.random() - 0.5) * 2 * amp * Math.sin(u * Math.PI);
        ctx.lineTo(x0 + dx * u + nx * o, y0 + dy * u + ny * o);
      }
      ctx.lineTo(x1, y1);
      ctx.strokeStyle = 'rgba(90,220,255,0.7)'; ctx.lineWidth = 2.2; ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 0.8; ctx.stroke();
    }
  }

  // ============================================================ œil de LUMEN (moyeu)
  // Suit la bille, rougit quand NULL parle, s'énerve pendant la FURIE, fixe la bille retenue
  // par l'aimant. S (extinction de fin de partie) : LUMEN ferme l'œil, puis NULL ouvre le sien.
  eye(ctx, table, game, S = null) {
    const r = this.r, E = this.eyeSt, { x, y } = DIAL;
    const M = table.magnet;
    const ball = M ? M.ball : (table.world.balls.find(b => b.state === 'free') || table.world.balls[0]);
    const fury = !!game.frenzy && !S;
    let tx = 0, ty = 0;
    if (ball) { const dx = ball.x - x, dy = ball.y - y, d = Math.hypot(dx, dy) || 1; const k = Math.min(1, d / 30); tx = dx / d * 9 * k; ty = dy / d * 7 * k; }
    const follow = fury ? 0.32 : 0.15;
    E.x += (tx - E.x) * follow; E.y += (ty - E.y) * follow;
    E.nextBlink -= 1 / 60;
    if (E.nextBlink <= 0) { E.blink = M ? 0 : 1; E.nextBlink = 2.5 + Math.random() * 4; }
    E.blink = Math.max(0, E.blink - 0.12);
    const msg = game.lumen.current;
    const nullMode = msg && msg.persona === 'null';
    let col = nullMode || fury ? C.red : C.cyan;
    let talk = msg ? 0.5 + 0.5 * Math.sin(r.time * 22) : 0;
    let open = 1 - E.blink * 0.92, ex = E.x, ey = E.y, slit = fury, gk = 1, angry = fury;
    if (M) { col = '#bff8ff'; gk = 1.5; open = 1; }
    if (fury) {
      talk = 0.5 + 0.5 * Math.sin(r.time * 13);
      gk = 1.3 + 0.3 * Math.sin(r.time * 7);
      if (!r.settings.reducedFx && Math.random() < 0.25) { ex += (Math.random() - 0.5) * 3; ey += (Math.random() - 0.5) * 2; }
    }
    if (S) {
      if (S.red > 0) {
        col = C.red; open = S.red; slit = true; gk = 1.4 * S.red;
        talk = 0.5 + 0.5 * Math.sin(r.time * 2.4);
        ex = Math.sin(r.time * 0.6) * 7; ey = 0;
        if (Math.random() < 0.05 && !r.settings.reducedFx) ex += (Math.random() - 0.5) * 10;
      } else { col = C.cyan; open = Math.min(open, 1 - S.close); talk = 0; gk = open; }
    }
    r.glow(x, y, slit ? 110 + (S ? 170 * S.red : 60) : 110, col, (0.3 + 0.25 * talk) * gk);
    if (open < 0.04) {
      ctx.strokeStyle = rgba(col, 0.35); ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(x - 24, y); ctx.lineTo(x + 24, y); ctx.stroke();
      return;
    }
    const iris = ctx.createRadialGradient(x + ex, y + ey, 1, x + ex, y + ey, 22);
    iris.addColorStop(0, slit ? '#ffd0d8' : '#ffffff'); iris.addColorStop(0.25, col); iris.addColorStop(1, rgba(col, 0.05));
    ctx.save();
    ctx.beginPath(); ctx.ellipse(x, y, 27, 27 * open, 0, 0, TAU); ctx.clip();
    ctx.fillStyle = '#04060c'; ctx.fillRect(x - 30, y - 30, 60, 60);
    ctx.fillStyle = iris; ctx.beginPath(); ctx.arc(x + ex, y + ey, 18 + talk * 3, 0, TAU); ctx.fill();
    ctx.fillStyle = '#02030a'; ctx.beginPath();
    if (slit) ctx.ellipse(x + ex * 1.1, y + ey * 1.1, fury ? 2 + talk : 2.6, 15, 0, 0, TAU); else ctx.arc(x + ex * 1.1, y + ey * 1.1, M ? 3.5 : 5.5, 0, TAU);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.8)'; ctx.beginPath(); ctx.arc(x + ex - 6, y + ey - 7, 2.6, 0, TAU); ctx.fill();
    if (angry) {
      // paupières en V : regard furieux
      const v = 4 + 3 * Math.sin(r.time * 5);
      ctx.fillStyle = '#12020a';
      ctx.beginPath(); ctx.moveTo(x - 30, y - 30); ctx.lineTo(x + 30, y - 30); ctx.lineTo(x + 30, y - 17); ctx.lineTo(x, y - 6 + v * 0.3); ctx.lineTo(x - 30, y - 17); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.moveTo(x - 30, y + 30); ctx.lineTo(x + 30, y + 30); ctx.lineTo(x + 30, y + 19); ctx.lineTo(x - 30, y + 19); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = '#ff4060'; ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.moveTo(x - 30, y - 17); ctx.lineTo(x, y - 6 + v * 0.3); ctx.lineTo(x + 30, y - 17); ctx.stroke();
    }
    ctx.restore();
  }
}
