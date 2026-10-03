// Géométrie du plateau principal : la station Cortex-9.
// Le terrain de jeu est symétrique autour de x = 281 (miroir x' = 562 - x) ;
// le couloir de lancement occupe la droite (x 542 → 580).

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

// Inserts lumineux (flèches de tir) — positions et angles.
export const SHOTS = {
  lorbit: { x: 92,  y: 512, a: -2.05, label: 'ORBITE' },
  lramp:  { x: 147, y: 512, a: -Math.PI / 2, label: 'RAMPE' },
  portal: { x: 281, y: 500, a: -Math.PI / 2, label: 'PORTAIL' },
  rramp:  { x: mx(147), y: 512, a: -Math.PI / 2, label: 'RAMPE' },
  rorbit: { x: mx(92),  y: 512, a: -Math.PI + 2.05, label: 'ORBITE' },
};

// Cadre commun au plateau et aux arènes à batteurs (Réacteur, Duel) :
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

export function buildTableGeometry(world) {
  const R = buildFrame(world, { banks: true });
  const guide = { mat: 'metal', r: 2.5, style: 'guide' };

  // --- Orbites ----------------------------------------------------------
  // mur intérieur des orbites, évasé vers le bas (embouchure plus accueillante)
  world.seg(62, 282, 90, 446, guide);
  world.seg(mx(62), 282, mx(90), 446, guide);

  // --- Couloirs du haut (C · P · U) --------------------------------------
  for (const x of L.laneGuidesX) world.seg(x, L.laneY0, x, L.laneY1, { mat: 'metal', r: 4, style: 'laneGuide' });

  // --- Bumpers (réacteurs auxiliaires) ------------------------------------
  R.bumpers = L.bumpers.map(([x, y], i) => world.circle(x, y, L.bumperR, {
    mat: 'bumper', kick: 1050, kickMin: 25, kickCooldown: 0.06, style: 'bumper', tag: 'bumper', data: { i },
  }));

  // --- Portail central (zone spéciale) -----------------------------------
  const P = L.portal;
  world.arc(P.x, P.y, P.r, -Math.PI, 0, { ...guide, style: 'portal', segLen: 10 });
  world.seg(P.x0, P.y, P.x0, P.mouthY, { ...guide, style: 'portal' });
  world.seg(P.x1, P.y, P.x1, P.mouthY, { ...guide, style: 'portal' });
  R.shutter = world.seg(P.x0 + 2, P.mouthY, P.x1 - 2, P.mouthY, { mat: 'target', r: 3, style: 'shutter', tag: 'shutter' });

  // --- Rampes ------------------------------------------------------------
  R.rampL = buildRamp(world, false);
  R.rampR = buildRamp(world, true);
  return R;
}

// Banque de 3 cibles debout sur une face inclinée (a → b), métal entre les cibles.
function buildBank(world, ax, ay, bx, by, side) {
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

function buildRamp(world, right) {
  const m = right ? mx : (x) => x;
  const g = L.ramp;
  const both = { mat: 'glass', r: 2.5, mask: 3, style: 'rampWall' };
  const up = { mat: 'glass', r: 2.5, mask: 2, style: 'rampWall' };
  const R = {};
  // embouchure évasée + montée (présente sur les deux couches)
  // entonnoir dissymétrique : large côté centre, discret côté orbite (ne gêne pas les tirs d'orbite)
  world.poly([[m(g.upX0 - g.flareOut), g.mouthY + 16], [m(g.upX0), g.mouthY], [m(g.upX0), g.topY]], both);
  world.poly([[m(g.upX1 + g.flare), g.mouthY + 16], [m(g.upX1), g.mouthY], [m(g.upX1), g.topY]], both);
  // toit de la montée pour la couche plateau (en pointe pour ne rien retenir)
  world.poly([[m(g.upX0), g.topY], [m((g.upX0 + g.upX1) / 2), g.topY - 16], [m(g.upX1), g.topY]],
    { mat: 'metal', r: 2.5, mask: 1, style: 'none' });
  // virage en U (couche rampe)
  const tcx = m(g.turnCx);
  world.arc(tcx, g.topY, g.turnR1, -Math.PI, 0, { ...up, segLen: 10 });
  world.arc(tcx, g.topY, g.turnR0, -Math.PI, 0, { ...up, segLen: 6 });
  // descente
  world.seg(m(g.downX0), g.topY, m(g.downX0), g.exitY + 4, up);
  world.seg(m(g.downX1), g.topY, m(g.downX1), g.exitY + 4, up);
  R.side = right ? 'R' : 'L';
  R.portalX = tcx; R.portalY = g.topY - (g.turnR0 + g.turnR1) / 2;
  return R;
}

function buildSling(world, right) {
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

function buildLanes(world, right) {
  const m = right ? mx : (x) => x;
  // Le guide est tangent au-dessus de la base du batteur : transition sans marche.
  world.circle(m(58), 730, 5, { mat: 'post', style: 'post' });
  world.poly([[m(58), 730], [m(58), 880], [m(170), 941.3]], { mat: 'metal', r: 2.5, style: 'guide' });
}
