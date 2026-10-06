// Plans du LABYRINTHE GYROSCOPIQUE : grille de 7 × 13 cellules, générée de façon déterministe
// (une graine par niveau, choisie pour son parcours), puis meublée :
//   départ en bas au centre, sortie en haut au centre (accessible par le bas uniquement),
//   clés réparties loin les unes des autres, trappes dans les poches où l'élan pousse la bille
//   (hors du parcours), balises le long du parcours, flèches d'accélération dans ses longues
//   lignes droites, capsules +5 s dans les culs-de-sac, portes laser (niveau 2 et plus).
// Le parcours de référence (départ → clés → sortie) sert aussi au pilote automatique des tests.
import { mulberry32 } from '../util/math.js';

export const MZ = { COLS: 7, ROWS: 13, CS: 72, X0: 29, Y0: 70 };
const { COLS, ROWS } = MZ;
const DIRS = [[0, -1, 'n'], [1, 0, 'e'], [0, 1, 's'], [-1, 0, 'w']];
const OPP = { n: 's', s: 'n', e: 'w', w: 'e' };

export const cellCenter = (c, r) => [MZ.X0 + (c + 0.5) * MZ.CS, MZ.Y0 + (r + 0.5) * MZ.CS];
export const cellOf = (x, y) => [Math.floor((x - MZ.X0) / MZ.CS), Math.floor((y - MZ.Y0) / MZ.CS)];
const key = (c, r) => r * COLS + c;

// Réglages par niveau : graine, nombre de clés, de trappes, de portes, part de culs-de-sac
// supprimés (boucles) et de salles ouvertes.
// Graines retenues pour la longueur de leur parcours (39, 45 et 55 cellules).
export const PLANS = [
  { seed: 134, keys: 3, traps: 4, doors: 0, braid: 0.75, rooms: 3 },
  { seed: 94, keys: 4, traps: 6, doors: 2, braid: 0.65, rooms: 3 },
  { seed: 15, keys: 5, traps: 8, doors: 3, braid: 0.55, rooms: 2 },
];

// Au-delà du niveau 3, le plan du niveau 3 revient (seul le chrono raccourcit).
export function planFor(level) {
  return buildPlan(PLANS[Math.min(PLANS.length, Math.max(1, level)) - 1]);
}

export function buildPlan(P) {
  const R = mulberry32(P.seed);
  // murs : open[k] = ensemble des directions ouvertes de la cellule k
  const open = Array.from({ length: COLS * ROWS }, () => new Set());
  const inGrid = (c, r) => c >= 0 && c < COLS && r >= 0 && r < ROWS;
  const link = (c, r, d) => {
    const [dx, dy] = DIRS.find(x => x[2] === d);
    open[key(c, r)].add(d); open[key(c + dx, r + dy)].add(OPP[d]);
  };
  // 1. labyrinthe parfait (exploration en profondeur aléatoire)
  const seen = new Set([key(3, ROWS - 1)]);
  const stack = [[3, ROWS - 1]];
  while (stack.length) {
    const [c, r] = stack[stack.length - 1];
    const nb = DIRS.map(([dx, dy, d]) => [c + dx, r + dy, d]).filter(([x, y]) => inGrid(x, y) && !seen.has(key(x, y)));
    if (!nb.length) { stack.pop(); continue; }
    const [x, y, d] = nb[Math.floor(R() * nb.length)];
    link(c, r, d); seen.add(key(x, y)); stack.push([x, y]);
  }
  const deg = (c, r) => open[key(c, r)].size;
  // 2. boucles : une part des culs-de-sac s'ouvre vers un voisin
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    if (deg(c, r) !== 1 || R() > P.braid) continue;
    const nb = DIRS.filter(([dx, dy, d]) => inGrid(c + dx, r + dy) && !open[key(c, r)].has(d));
    if (nb.length) { const [, , d] = nb[Math.floor(R() * nb.length)]; link(c, r, d); }
  }
  // 3. salles ouvertes 2 × 2 (hors des rangées du départ et de la sortie)
  for (let k = 0; k < P.rooms; k++) {
    const c = Math.floor(R() * (COLS - 1)), r = 2 + Math.floor(R() * (ROWS - 5));
    link(c, r, 'e'); link(c, r + 1, 'e'); link(c, r, 's'); link(c + 1, r, 's');
  }
  // 4. sortie en haut au centre : accessible par le bas uniquement
  const EX = [3, 0], ST = [3, ROWS - 1];
  for (const d of ['e', 'w']) {
    if (open[key(3, 0)].has(d)) {
      const [dx] = DIRS.find(x => x[2] === d);
      open[key(3, 0)].delete(d); open[key(3 + dx, 0)].delete(OPP[d]);
    }
  }
  link(3, 0, 's');
  // les voisins de la sortie gardent un accès (sinon on rouvre vers le bas)
  for (const cx of [2, 4]) if (deg(cx, 0) === 0) link(cx, 0, 's');
  // distances (parcours en largeur sur le graphe des cellules)
  const bfs = (c0, r0) => {
    const dist = new Array(COLS * ROWS).fill(Infinity), prev = new Array(COLS * ROWS).fill(-1);
    dist[key(c0, r0)] = 0;
    const q = [[c0, r0]];
    while (q.length) {
      const [c, r] = q.shift();
      for (const d of open[key(c, r)]) {
        const [dx, dy] = DIRS.find(x => x[2] === d);
        const k2 = key(c + dx, r + dy);
        if (dist[k2] === Infinity) { dist[k2] = dist[key(c, r)] + 1; prev[k2] = key(c, r); q.push([c + dx, r + dy]); }
      }
    }
    return { dist, prev };
  };
  // réparation : toute cellule coupée du départ (côtés de la sortie refermés) est rattachée
  // à une voisine accessible, jamais par les côtés de la sortie
  for (let guard = 0; guard < COLS * ROWS; guard++) {
    const { dist } = bfs(ST[0], ST[1]);
    let fixed = false;
    for (let r = 0; r < ROWS && !fixed; r++) for (let c = 0; c < COLS && !fixed; c++) {
      if (dist[key(c, r)] !== Infinity) continue;
      for (const [dx, dy, d] of DIRS) {
        const x = c + dx, y = r + dy;
        if (!inGrid(x, y) || dist[key(x, y)] === Infinity) continue;
        if (x === EX[0] && y === EX[1]) continue;
        link(c, r, d); fixed = true; break;
      }
    }
    if (!fixed) break;
  }
  const pathTo = (from, to) => {
    const { prev } = bfs(from[0], from[1]);
    const out = [];
    for (let k = key(to[0], to[1]); k !== -1; k = prev[k]) out.unshift([k % COLS, Math.floor(k / COLS)]);
    return out;
  };
  // 5. clés : échantillonnage du point le plus éloigné (départ, sortie et clés déjà posées),
  //    en préférant les culs-de-sac et en évitant les deux rangées extrêmes
  const keys = [];
  const anchors = [ST, EX];
  for (let n = 0; n < P.keys; n++) {
    let best = null;
    const ds = anchors.map(([c, r]) => bfs(c, r).dist);
    for (let r = 1; r < ROWS - 1; r++) for (let c = 0; c < COLS; c++) {
      if (keys.some(([x, y]) => x === c && y === r)) continue;
      const m = Math.min(...ds.map(d => d[key(c, r)]));
      const s = m + (deg(c, r) === 1 ? 2 : 0) + R() * 0.5;
      if (!best || s > best.s) best = { s, c, r };
    }
    keys.push([best.c, best.r]);
    anchors.push([best.c, best.r]);
  }
  // 6. parcours de référence : départ → clé la plus proche → … → sortie
  const route = [ST];
  let cur = ST;
  const left = keys.slice();
  while (left.length) {
    const { dist } = bfs(cur[0], cur[1]);
    left.sort((a, b) => dist[key(a[0], a[1])] - dist[key(b[0], b[1])]);
    const k = left.shift();
    route.push(...pathTo(cur, k).slice(1));
    cur = k;
  }
  route.push(...pathTo(cur, EX).slice(1));
  const onRoute = new Set(route.map(([c, r]) => key(c, r)));
  const isItem = (c, r) => keys.some(([x, y]) => x === c && y === r) || (c === ST[0] && r === ST[1]) || (c === EX[0] && r === EX[1]);
  // 7. trappes : cellule hors parcours, dans le prolongement d'un virage du parcours
  //    (l'élan y emmène la bille si l'on tourne trop tard)
  const traps = [];
  for (let i = 1; i < route.length - 1 && traps.length < P.traps * 3; i++) {
    const [pc, pr] = route[i - 1], [c, r] = route[i], [nc, nr] = route[i + 1];
    const dx = c - pc, dy = r - pr;
    if (nc - c === dx && nr - r === dy) continue;                       // pas un virage
    const tc = c + dx, tr = r + dy;
    const d = DIRS.find(x => x[0] === dx && x[1] === dy)[2];
    if (!inGrid(tc, tr) || !open[key(c, r)].has(d) || onRoute.has(key(tc, tr)) || isItem(tc, tr)) continue;
    if (!traps.some(([x, y]) => x === tc && y === tr)) traps.push([tc, tr]);
  }
  // complément : autres poches hors parcours, reliées au parcours
  for (const [c, r] of route) {
    if (traps.length >= P.traps * 3) break;
    for (const d of open[key(c, r)]) {
      const [dx, dy] = DIRS.find(x => x[2] === d);
      const tc = c + dx, tr = r + dy;
      if (onRoute.has(key(tc, tr)) || isItem(tc, tr) || traps.some(([x, y]) => x === tc && y === tr)) continue;
      traps.push([tc, tr]);
    }
  }
  // garde les trappes les mieux réparties
  const chosen = [];
  while (chosen.length < P.traps && traps.length) {
    let bi = 0, bs = -1;
    traps.forEach(([c, r], i) => {
      const s = chosen.length ? Math.min(...chosen.map(([x, y]) => Math.abs(x - c) + Math.abs(y - r))) : R();
      if (s > bs) { bs = s; bi = i; }
    });
    chosen.push(traps.splice(bi, 1)[0]);
  }
  const trapSet = new Set(chosen.map(([c, r]) => key(c, r)));
  // 8. balises le long du parcours (environ toutes les 9 cellules, jamais sur une trappe)
  const checks = [];
  for (let i = 9; i < route.length - 4; i += 9) {
    const [c, r] = route[i];
    if (!isItem(c, r) && !checks.some(([x, y]) => x === c && y === r)) checks.push([c, r]);
  }
  // 9. flèches : début d'une ligne droite d'au moins 3 cellules du parcours, dans son sens
  const boosts = [];
  for (let i = 0; i + 3 < route.length && boosts.length < 3; i++) {
    const [c0, r0] = route[i], [c1, r1] = route[i + 1], [c2, r2] = route[i + 2], [c3, r3] = route[i + 3];
    const dx = c1 - c0, dy = r1 - r0;
    if (c2 - c1 !== dx || r2 - r1 !== dy || c3 - c2 !== dx || r3 - r2 !== dy) continue;
    if (isItem(c1, r1) || checks.some(([x, y]) => x === c1 && y === r1)) continue;
    if (boosts.some(b => Math.abs(b.c - c1) + Math.abs(b.r - r1) < 4)) continue;
    boosts.push({ c: c1, r: r1, dx, dy });
    i += 3;
  }
  // 10. capsules +5 s : culs-de-sac hors parcours
  const caps = [];
  for (let r = 0; r < ROWS && caps.length < 2; r++) for (let c = 0; c < COLS && caps.length < 2; c++) {
    if (deg(c, r) === 1 && !onRoute.has(key(c, r)) && !trapSet.has(key(c, r)) && !isItem(c, r)) caps.push([c, r]);
  }
  // 11. portes laser : passages du parcours, loin du départ et des clés
  const doors = [];
  for (let i = 6; i < route.length - 3 && doors.length < P.doors; i += Math.max(5, Math.floor(route.length / (P.doors + 1)))) {
    const [c, r] = route[i], [nc, nr] = route[i + 1];
    if (isItem(c, r) || isItem(nc, nr)) continue;
    doors.push({ c, r, d: DIRS.find(x => x[0] === nc - c && x[1] === nr - r)[2], ph: doors.length * 1.7 });
  }
  return { open, start: ST, exit: EX, keys, traps: chosen, checks, boosts, caps, doors, route, bfs, pathTo, key };
}

// Segments de murs fusionnés (lignes horizontales puis verticales), en coordonnées monde.
export function wallSegments(plan) {
  const { open } = plan, { CS, X0, Y0 } = MZ;
  const segs = [];
  // horizontaux : bord nord de chaque rangée (r = 0 … ROWS), fusion des cellules contiguës
  for (let r = 0; r <= ROWS; r++) {
    let run = null;
    for (let c = 0; c <= COLS; c++) {
      const wall = c < COLS && (r === 0 ? true : r === ROWS ? true : !open[key(c, r)].has('n'));
      if (wall && run === null) run = c;
      if (!wall && run !== null) { segs.push([X0 + run * CS, Y0 + r * CS, X0 + c * CS, Y0 + r * CS]); run = null; }
    }
  }
  for (let c = 0; c <= COLS; c++) {
    let run = null;
    for (let r = 0; r <= ROWS; r++) {
      const wall = r < ROWS && (c === 0 ? true : c === COLS ? true : !open[key(c, r)].has('w'));
      if (wall && run === null) run = r;
      if (!wall && run !== null) { segs.push([X0 + c * CS, Y0 + run * CS, X0 + c * CS, Y0 + r * CS]); run = null; }
    }
  }
  return segs;
}
