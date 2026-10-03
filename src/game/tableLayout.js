// Géométrie de la station Cortex-9.
// Le terrain de jeu est symétrique autour de x = 281 (miroir x' = 562 - x) ;
// le couloir de lancement occupe la droite (x 542 → 580).
// Première partie : cadre commun (moitié basse) partagé par le plateau et les arènes.
// Seconde partie : le plateau principal long, à trois niveaux.

import { Flipper } from '../physics/flipper.js';

export const MIRROR = 562;
export const mx = (x) => MIRROR - x;

export const L = {
  wallL: 20, wallR: 542, shooterR: 580,
  arc: { cx: 300, cy: 300, r: 280 },
  flipL: [178, 960], flipR: [384, 960],
  plungerRest: [561, 1040],
  drainY: 1075,
  portal: { x: 281, y: 427, r: 34, mouthY: 462, x0: 247, x1: 315 },
  bumpers: [[232, 230], [330, 230], [281, 312]],
  bumperR: 26,
  laneGuidesX: [201, 255, 309, 363],
  laneY0: 92, laneY1: 150, laneSensorY: 124,
  // rampe gauche (la droite est en miroir)
  // canaux de même largeur (46) pour un virage en U concentrique
  ramp: {
    upX0: 124, upX1: 170, downX0: 56, downX1: 102,
    mouthY: 470, entryY: 455, topY: 200, exitY: 712, turnCx: 113, turnR0: 11, turnR1: 57, flare: 16, flareOut: 3,
  },
  orbitSensorY: 400,
};

// Cadre commun aux arènes à batteurs (Réacteur, Défense, Duel) :
// dôme, murs, couloir de lancement, slingshots, couloirs de retour, batteurs.
// Les arènes « transforment » seulement la moitié haute du plateau.
export function buildFrame(world, opts = {}) {
  const R = {};
  const rail = { mat: 'metal', r: 3, style: 'rail' };
  const { cx, cy, r } = L.arc;
  world.arc(cx, cy, r, -Math.PI, 0, { ...rail, segLen: 12 });
  // mur gauche + renflement (cibles HANGAR sur la face inférieure)
  world.poly([[20, 300], [20, 500], [62, 600]], rail);
  world.seg(20, 700, 20, 1110, rail);
  if (opts.banks) R.bankL = buildBank(world, 62, 600, 20, 700, 'L');
  else world.seg(62, 600, 20, 700, rail);
  // mur droit du terrain = paroi intérieure du couloir de lancement
  world.poly([[542, 1110], [542, 700]], rail);
  if (opts.banks) R.bankR = buildBank(world, 500, 600, 542, 700, 'R');
  else world.seg(500, 600, 542, 700, rail);
  world.poly([[500, 600], [542, 500], [542, 330]], rail);
  // couloir de lancement
  world.seg(580, 300, 580, 1110, rail);
  // porte anti-retour (laisse sortir la bille lancée, bloque le retour)
  R.gate = world.seg(542, 330, 580, 282, { mat: 'metal', r: 2, oneWay: [-0.78, -0.62], style: 'gate' });
  // pointe du lanceur (arrête une bille qui retombe)
  R.plungerStop = world.seg(544, 1054, 578, 1054, { mat: 'metal', r: 2, style: 'none' });
  R.slingL = buildSling(world, false);
  R.slingR = buildSling(world, true);
  buildLanes(world, false);
  buildLanes(world, true);
  R.flipL = world.addFlipper(new Flipper(L.flipL[0], L.flipL[1], 1, { idSuffix: opts.idSuffix }));
  R.flipR = world.addFlipper(new Flipper(L.flipR[0], L.flipR[1], -1, { idSuffix: opts.idSuffix }));
  return R;
}

// Banque de 3 cibles debout sur une face inclinée (a → b), métal entre les cibles.
export function buildBank(world, ax, ay, bx, by, side) {
  const cuts = [0, 0.08, 0.32, 0.38, 0.62, 0.68, 0.92, 1];
  const P = (t) => [ax + (bx - ax) * t, ay + (by - ay) * t];
  const targets = [];
  for (let i = 0; i < cuts.length - 1; i++) {
    const [x0, y0] = P(cuts[i]), [x1, y1] = P(cuts[i + 1]);
    if (i % 2 === 1) {
      targets.push(world.seg(x0, y0, x1, y1, {
        mat: 'target', r: 3, style: 'target', tag: 'target', phaseable: true, data: { side, i: (i - 1) / 2 },
      }));
    } else {
      world.seg(x0, y0, x1, y1, { mat: 'metal', r: 3, style: 'rail' });
    }
  }
  return targets;
}

export function buildSling(world, right) {
  const m = right ? mx : (x) => x;
  const A = [m(104), 762], B = [m(104), 852], C = [m(150), 886];
  const R = {};
  R.face = world.seg(A[0], A[1], C[0], C[1], {
    mat: 'rubber', r: 3, kick: 820, kickMin: 150, kickCooldown: 0.12, style: 'slingFace', tag: 'sling', data: { right },
  });
  world.seg(A[0], A[1], B[0], B[1], { mat: 'rubber', r: 3, style: 'slingSide' });
  world.seg(B[0], B[1], C[0], C[1], { mat: 'plastic', r: 3, style: 'slingSide' });
  R.A = A; R.B = B; R.C = C;
  return R;
}

export function buildLanes(world, right) {
  const m = right ? mx : (x) => x;
  // Le guide est tangent au-dessus de la base du batteur : transition sans marche.
  world.circle(m(58), 730, 5, { mat: 'post', style: 'post' });
  world.poly([[m(58), 730], [m(58), 880], [m(170), 941.3]], { mat: 'metal', r: 2.5, style: 'guide' });
}

// ======================================================================
// Plateau principal (version longue, proportions d'un vrai flipper) :
// le monde va de y = -150 à y = 1100. Trois niveaux physiques (couches) :
//   couche 0 = plateau, couche 1 = rampes, couche 2 = pont supérieur (deuxième niveau).
// La moitié basse (batteurs, slingshots, couloirs, lanceur) est celle des arènes.

export const WORLD = { x0: 0, y0: -150, w: 600, h: 1250 };

// masques de couches (bit n = couche n)
export const M_PF = 1;
export const M_RAMP = 2;
export const M_DECK = 4;

export const T = {
  ...L,
  dome: { cx: 300, cy: 150, r: 280 },
  gate: [542, 180, 580, 132],
  // couloir d'orbite (passe sous le pont) : mur intérieur = arc centré (281, 150)
  orbitInner: { cx: 281, cy: 150, r: 219 },
  ceilY: 120,                     // bord avant du pont = plafond du plateau central
  // pont supérieur
  deck: {
    flipL: [204, 98], flipR: [358, 98], flipLen: 56, baseR: 11, tipR: 6,
    guideAngL: -160, guideAngR: -20,    // départ des guides sur le dôme (degrés)
    drainY: 140, drainX0: 248, drainX1: 314,
    uplink: { x: 285, y: -84, r: 15 },
    targets: [[150, -4], [222, -50], [348, -50], [420, -4]],
    targetLen: 34,
    plungeSensorAng: -30,
  },
  lanesX: [201, 255, 309, 363], laneY0: 134, laneY1: 180, laneSensorY: 157,
  bumpers: [[232, 246], [330, 246], [281, 324]], bumperR: 26,
  // rampe gauche : monte jusqu'au pont
  rampL: { x0: 124, x1: 170, mouthY: 470, entryY: 455, deckY: 44, flare: 16, flareOut: 3 },
  // rampe droite : virage en U, retour vers le couloir droit
  rampR: { upX0: 392, upX1: 438, downX0: 460, downX1: 506, mouthY: 470, entryY: 455, topY: 220, exitY: 712, turnCx: 449, turnR0: 11, turnR1: 57, flare: 16, flareOut: 3 },
  spinnerY: 340,
  orbitTopY: 160,
  kickback: { x: 39, y: 862 },
};

// Inserts lumineux (flèches de tir) — positions et angles.
export const SHOTS = {
  lorbit: { x: 92,  y: 512, a: -2.05, label: 'ORBITE' },
  lramp:  { x: 147, y: 512, a: -Math.PI / 2, label: 'PONT' },
  portal: { x: 281, y: 500, a: -Math.PI / 2, label: 'PORTAIL' },
  rramp:  { x: mx(147), y: 512, a: -Math.PI / 2, label: 'RAMPE' },
  rorbit: { x: mx(92),  y: 512, a: -Math.PI + 2.05, label: 'ORBITE' },
};

const rad = (d) => d * Math.PI / 180;
export function domePoint(angDeg, r = T.dome.r) {
  return [T.dome.cx + Math.cos(rad(angDeg)) * r, T.dome.cy + Math.sin(rad(angDeg)) * r];
}

// Point d'arrivée d'un guide tangent au-dessus de la base d'un batteur (raccord sans marche).
function guideEnd(ax, ay, px, py, r0, guideR) {
  let dx = px - ax, dy = py - ay;
  const l = Math.hypot(dx, dy);
  dx /= l; dy /= l;
  // normale « au-dessus » de la ligne
  let nx = dy, ny = -dx;
  if (ny > 0) { nx = -nx; ny = -ny; }
  const k = r0 - guideR;
  return [px + nx * k, py + ny * k];
}

export function buildCortexTable(world) {
  const R = {};
  const rail = { mat: 'metal', r: 3, style: 'rail' };
  const railBoth = { ...rail, mask: M_PF | M_DECK };
  const guide = { mat: 'metal', r: 2.5, style: 'guide' };
  const { cx, cy, r } = T.dome;

  // --- Cadre -------------------------------------------------------------
  // dôme : paroi commune au plateau (orbite) et au pont
  world.arc(cx, cy, r, -Math.PI, 0, { ...railBoth, segLen: 12 });
  world.poly([[20, 150], [20, 500], [62, 600]], rail);
  world.seg(20, 700, 20, 1110, rail);
  R.bankL = buildBank(world, 62, 600, 20, 700, 'L');
  world.poly([[542, 1110], [542, 700]], rail);
  // renflement droit : cibles tombantes devant une paroi métallique
  world.seg(500, 600, 542, 700, rail);
  R.drops = buildDrops(world, 500, 600, 542, 700);
  world.poly([[500, 600], [542, 500], [542, 180]], { ...rail, mask: M_PF });
  // couloir de lancement (la bille ne passe sur le pont qu'au-dessus de la porte)
  world.seg(580, 150, 580, 1110, rail);
  R.gate = world.seg(...T.gate, { mat: 'metal', r: 2, oneWay: [-0.78, -0.62], style: 'gate' });
  R.plungerStop = world.seg(544, 1054, 578, 1054, { mat: 'metal', r: 2, style: 'none' });
  R.slingL = buildSling(world, false);
  R.slingR = buildSling(world, true);
  buildLanes(world, false);
  buildLanes(world, true);
  R.flipL = world.addFlipper(new Flipper(T.flipL[0], T.flipL[1], 1));
  R.flipR = world.addFlipper(new Flipper(T.flipR[0], T.flipR[1], -1));

  // --- Orbites (sous le pont) --------------------------------------------
  const O = T.orbitInner;
  // À gauche, la rampe du pont monte jusqu'au plafond : la poche entre orbite et rampe est
  // fermée par un séparateur. À droite, la rampe s'arrête plus bas : la poche reste ouverte
  // en haut, c'est donc un couloir de passage (le fermer en bas créait un coin piège).
  world.poly([[121, 486], [90, 446], [62, 282], [62, 150]], guide);
  world.arc(O.cx, O.cy, O.r, -Math.PI, 0, { ...guide, segLen: 12, style: 'orbitInner' });
  world.poly([[500, 150], [500, 282], [472, 446]], guide);
  R.dividers = [[90, 446], [472, 446]].map(([x, y]) => world.circle(x, y, 5, { mat: 'post', style: 'post' }));
  // plafond du plateau central (bord avant du pont)
  const cw = Math.sqrt(O.r * O.r - (O.cy - T.ceilY) ** 2);
  world.seg(O.cx - cw, T.ceilY, O.cx + cw, T.ceilY, { mat: 'metal', r: 3, style: 'deckFront' });

  // --- Couloirs du haut (C · P · U) --------------------------------------
  for (const x of T.lanesX) world.seg(x, T.laneY0, x, T.laneY1, { mat: 'metal', r: 4, style: 'laneGuide' });

  // --- Bumpers ------------------------------------------------------------
  R.bumpers = T.bumpers.map(([x, y], i) => world.circle(x, y, T.bumperR, {
    mat: 'bumper', kick: 1050, kickMin: 25, kickCooldown: 0.06, style: 'bumper', tag: 'bumper', data: { i },
  }));

  // --- Portail central ----------------------------------------------------
  const P = T.portal;
  world.arc(P.x, P.y, P.r, -Math.PI, 0, { ...guide, style: 'portal', segLen: 10 });
  world.seg(P.x0, P.y, P.x0, P.mouthY, { ...guide, style: 'portal' });
  world.seg(P.x1, P.y, P.x1, P.mouthY, { ...guide, style: 'portal' });
  R.shutter = world.seg(P.x0 + 2, P.mouthY, P.x1 - 2, P.mouthY, { mat: 'target', r: 3, style: 'shutter', tag: 'shutter' });

  // --- Rampes -------------------------------------------------------------
  R.rampL = buildDeckRamp(world);
  R.rampR = buildReturnRamp(world);

  // --- Pont supérieur (couche 2) ------------------------------------------
  R.deck = buildDeck(world);
  return R;
}

// Cibles tombantes : légèrement en avant de la paroi ; abattues = désactivées.
function buildDrops(world, ax, ay, bx, by) {
  const cuts = [[0.08, 0.32], [0.38, 0.62], [0.68, 0.92]];
  const dx = bx - ax, dy = by - ay;
  const l = Math.hypot(dx, dy);
  const nx = -dy / l * 6, ny = dx / l * 6;       // décalage de 6 vers le terrain
  return cuts.map(([u0, u1], i) => world.seg(
    ax + dx * u0 + nx, ay + dy * u0 + ny, ax + dx * u1 + nx, ay + dy * u1 + ny,
    { mat: 'target', r: 3.5, style: 'drop', tag: 'drop', phaseable: true, data: { i } }));
}

// Rampe gauche : entonnoir, longue montée, puis la bille est déposée sur le pont.
function buildDeckRamp(world) {
  const g = T.rampL;
  const both = { mat: 'glass', r: 2.5, mask: M_PF | M_RAMP, style: 'rampWall' };
  const up = { mat: 'glass', r: 2.5, mask: M_RAMP, style: 'rampWall' };
  world.poly([[g.x0 - g.flareOut, g.mouthY + 16], [g.x0, g.mouthY], [g.x0, T.ceilY]], both);
  world.poly([[g.x1 + g.flare, g.mouthY + 16], [g.x1, g.mouthY], [g.x1, T.ceilY]], both);
  world.seg(g.x0, T.ceilY, g.x0, g.deckY - 6, up);
  world.seg(g.x1, T.ceilY, g.x1, g.deckY - 6, up);
  return { side: 'L', portalX: (g.x0 + g.x1) / 2, portalY: g.deckY + 10 };
}

// Rampe droite : montée, virage en U, descente vers le couloir de retour droit.
function buildReturnRamp(world) {
  const g = T.rampR;
  const both = { mat: 'glass', r: 2.5, mask: M_PF | M_RAMP, style: 'rampWall' };
  const up = { mat: 'glass', r: 2.5, mask: M_RAMP, style: 'rampWall' };
  world.poly([[g.upX1 + g.flareOut, g.mouthY + 16], [g.upX1, g.mouthY], [g.upX1, g.topY]], both);
  world.poly([[g.upX0 - g.flare, g.mouthY + 16], [g.upX0, g.mouthY], [g.upX0, g.topY]], both);
  world.poly([[g.upX0, g.topY], [(g.upX0 + g.upX1) / 2, g.topY - 16], [g.upX1, g.topY]], { mat: 'metal', r: 2.5, mask: M_PF, style: 'none' });
  world.arc(g.turnCx, g.topY, g.turnR1, -Math.PI, 0, { ...up, segLen: 10 });
  world.arc(g.turnCx, g.topY, g.turnR0, -Math.PI, 0, { ...up, segLen: 6 });
  world.seg(g.downX0, g.topY, g.downX0, g.exitY + 4, up);
  world.seg(g.downX1, g.topY, g.downX1, g.exitY + 4, up);
  return { side: 'R', portalX: g.turnCx, portalY: g.topY - (g.turnR0 + g.turnR1) / 2 };
}

// Pont supérieur : guides inclinés vers deux petits batteurs, 4 cibles, éjecteur UPLINK.
function buildDeck(world) {
  const D = T.deck;
  const R = {};
  const deckGuide = { mat: 'metal', r: 2.5, mask: M_DECK, style: 'deckGuide' };
  const [lx, ly] = domePoint(D.guideAngL);
  const [rx, ry] = domePoint(D.guideAngR);
  const eL = guideEnd(lx, ly, D.flipL[0], D.flipL[1], D.baseR, 2.5);
  const eR = guideEnd(rx, ry, D.flipR[0], D.flipR[1], D.baseR, 2.5);
  R.guideL = [[lx, ly], eL];
  R.guideR = [[rx, ry], eR];
  world.seg(lx, ly, eL[0], eL[1], deckGuide);
  world.seg(rx, ry, eR[0], eR[1], deckGuide);
  // tabliers sous les petits batteurs : guident la chute vers l'ouverture centrale
  world.seg(D.flipL[0] - 5, D.flipL[1] + 10, D.drainX0 + 2, D.drainY + 2, { mat: 'metal', r: 2.5, mask: M_DECK, style: 'none' });
  world.seg(D.flipR[0] + 5, D.flipR[1] + 10, D.drainX1 - 2, D.drainY + 2, { mat: 'metal', r: 2.5, mask: M_DECK, style: 'none' });
  const fo = { length: D.flipLen, baseR: D.baseR, tipR: D.tipR, mask: M_DECK, idSuffix: 'deck' };
  R.flipL = world.addFlipper(new Flipper(D.flipL[0], D.flipL[1], 1, fo));
  R.flipR = world.addFlipper(new Flipper(D.flipR[0], D.flipR[1], -1, fo));
  // cibles (face tournée vers les batteurs du pont)
  const fx = (D.flipL[0] + D.flipR[0]) / 2, fy = D.flipL[1];
  R.targets = D.targets.map(([x, y], i) => {
    let ax = fx - x, ay = fy - y;
    const l = Math.hypot(ax, ay); ax /= l; ay /= l;
    const tx = -ay, ty = ax, h = D.targetLen / 2;
    const p = world.seg(x - tx * h, y - ty * h, x + tx * h, y + ty * h, {
      mat: 'target', r: 4, mask: M_DECK, style: 'deckTarget', tag: 'deckTarget', phaseable: true, data: { i, nx: ax, ny: ay },
    });
    return p;
  });
  // petits plots caoutchouc de part et d'autre de l'éjecteur
  const U = D.uplink;
  R.posts = [[U.x - 34, U.y + 22], [U.x + 34, U.y + 22]].map(([x, y]) => world.circle(x, y, 6, { mat: 'post', mask: M_DECK, style: 'deckPost' }));
  return R;
}
