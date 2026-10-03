import { FlipperArena } from './arena.js';
import { rand, clamp, TAU, smoothstep } from '../util/math.js';
import { addLines } from '../game/lumen.js';
import { drawGraffitiStatic, renderGraffiti, renderGraffitiTop } from './graffitiArt.js';

// FRESQUE NÉON — secteur GRAFFITI.
// NULL a recouvert les murs de la station d'affiches de propagande grises. Le noyau
// devient une bombe de peinture : tout le haut de l'arène est un grand mur découpé en
// cellules, chaque cellule traversée se peint (rayon plus large à grande vitesse) et
// révèle, morceau par morceau, une grande fresque néon cachée sous les affiches.
// Objectif : couvrir 70 % du mur — calculé uniquement sur les cellules que la bille
// peut réellement atteindre — avant la fin du chrono.
//  · 3 bombes de peinture (bumpers) : grosse éclaboussure + gouttes projetées.
//  · Drones nettoyeurs de NULL : ils effacent la peinture sur leur passage ;
//    les percuter les étourdit (et les fait exploser en peinture).
//  · Capsule AÉROSOL : apparaît dans la zone la moins peinte, rayon ×2 pendant 6 s.
//  · Paliers 25 % (aérosol offert) et 50 % (filet de sécurité) ; 70 % : la fresque
//    s'illumine en entier et LUMEN signe l'œuvre.
export const LIME = '#e6ff3d';
export const TARGET = 70;                 // % du mur à couvrir
const MILESTONES = [25, 50];

// Grille du mur : de x 20 à 580 (la poche au-dessus de la porte du lanceur en fait partie),
// de y 20 à 594 ; le bas du mur est à y = 590.
export const GRID = { x0: 20, y0: 20, cell: 14, cols: 40, rows: 41 };
export const WALL_Y1 = 590;
const RAIL = 3;                           // demi-épaisseur des rails du cadre
// Une cellule n'est comptée que si la bille peut la peindre au pinceau le plus fin : son
// centre est à plus de RAIL + EDGE de l'axe d'un rail (la bille, de rayon 13, s'en approche
// à 16 et peint jusqu'à 10 de son centre) et hors de la flaque des bombes de peinture.
const EDGE = 5;
const BOMB_EDGE = 8;

// Bombes de peinture (bumpers) : triangle au cœur du mur.
export const BUMP_R = 26;
export const BOMBS = [
  { x: 281, y: 205, color: '#ff2bd6' },
  { x: 168, y: 340, color: '#22e4ff' },
  { x: 394, y: 340, color: '#ffd84a' },
];

const DRONE_R = 16;
const BALL_D = 26;
// zone de vol des drones : jamais à moins d'un diamètre de bille (+ marge) d'un mur ou d'une bombe
const DRONE_WALL = DRONE_R + BALL_D + 14;          // 56
const DRONE_BOMB = BUMP_R + DRONE_R + BALL_D + 12; // 80
const DRONE_SEP = DRONE_R * 2 + BALL_D + 14;       // 72

// Pinceau : rayon de base, bonus de vitesse
const BRUSH = 10, BRUSH_FAST = 5;

// Difficulté selon le niveau de sécurité (cycles suivants)
function tuning(level) {
  const k = Math.min(3, Math.max(0, level - 1));
  return {
    time: 70 - k * 5,
    drones: Math.min(4, 2 + k),
    droneSpeed: 38 + k * 9,
    eraseR: 22 + k * 2.5,
    stun: Math.max(2.4, 4.2 - k * 0.8),
    droneDelay: Math.max(1.5, 3.5 - k),
    net: Math.max(5, 8 - k),            // filet de sécurité offert au palier 50 % (s)
  };
}

addLines({
  enter_tag: { pri: 4, cd: 0, v: [
    'NULL a tapissé la station de propagande grise. Votre noyau est une bombe de peinture : couvrez 70 % du mur.',
    'Fresque néon. Repeignez ce mur gris à grands coups de noyau. Avec style, si possible.',
  ] },
  tagStart: { pri: 1, cd: 0, v: ['Les bombes de peinture éclaboussent large. Servez-vous.', 'Plus le noyau va vite, plus le trait est large.'] },
  tagKept: { pri: 3, cd: 0, v: ['Votre fresque tient encore : {pct} % du mur déjà peint.', 'Une partie de la peinture a survécu : {pct} %. On reprend.'] },
  tagDrones: { pri: 3, cd: 0, v: ['Drones nettoyeurs en approche. Ils effacent tout : percutez-les.', 'NULL envoie ses nettoyeurs. Un coup de noyau et ils voient des étoiles.'] },
  tagStun: { pri: 2, cd: 5, v: ['Nettoyeur sonné. Ça lui apprendra le respect de l\'art.', 'Drone repeint. Il ne s\'en remettra pas tout de suite.', 'Critique d\'art neutralisée.'] },
  tagErase: { pri: 2, cd: 14, v: ['Ils effacent votre fresque ! Visez les drones.', 'Un nettoyeur ronge la peinture. Intervenez.'] },
  tagAerosol: { pri: 2, cd: 4, v: ['Aérosol surpuissant : rayon doublé !', 'Pression maximale. Arrosez tout.'] },
  tagCapsule: { pri: 1, cd: 12, v: ['Capsule AÉROSOL dans le coin le plus gris. Allez la chercher.'] },
  tag25: { pri: 3, cd: 0, v: ['25 %. NULL déteste déjà la couleur.', 'Un quart du mur. Je vois des formes apparaître…'] },
  tag50: { pri: 3, cd: 0, v: ['La moitié ! Filet de sécurité activé, profitez-en.', '50 %. Je reconnais quelque chose… continuez.'] },
  tagAlmost: { pri: 3, cd: 0, v: ['Plus que quelques touches !', 'Presque. Les coins, pensez aux coins.'] },
  tagWin: { pri: 4, cd: 0, v: ['Chef-d\'œuvre. Je signe en bas à droite.', 'Fresque achevée. Je la signe, vous l\'avez peinte.'] },
});

const POPS = ['SPLASH !', 'PSCHIT !', 'SPLAT !', 'FLOP !'];
const hash = (n) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };

// Contour du mur (axes des rails) : bas gauche → mur gauche → dôme → porte du lanceur → mur droit.
export function wallOutline() {
  const pts = [[20 + 90 * 0.42, WALL_Y1], [20, 500], [20, 300]];
  const a1 = Math.atan2(282 - 300, 580 - 300);
  const n = 72;
  for (let k = 1; k <= n; k++) {
    const a = -Math.PI + (a1 + Math.PI) * k / n;
    pts.push([300 + Math.cos(a) * 280, 300 + Math.sin(a) * 280]);
  }
  pts.push([542, 330], [542, 500], [542 - 90 * 0.42, WALL_Y1]);
  return pts;
}

function inPoly(pts, x, y) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i], [xj, yj] = pts[j];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function segDist(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const l2 = dx * dx + dy * dy || 1e-9;
  let t = ((px - ax) * dx + (py - ay) * dy) / l2;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  return Math.hypot(px - (ax + dx * t), py - (ay + dy * t));
}

function polyDist(pts, x, y, closedBottom = false) {
  let m = Infinity;
  const n = pts.length;
  for (let i = 0; i < n - 1; i++) m = Math.min(m, segDist(x, y, pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1]));
  if (closedBottom) m = Math.min(m, segDist(x, y, pts[n - 1][0], pts[n - 1][1], pts[0][0], pts[0][1]));
  return m;
}

// Masque des cellules (calculé une fois) : 1 = cellule du mur comptée, 0 = hors mur ou cachée.
let MASK = null, COUNTED = null, DRONE_OK = null, CAP_OK = null, OUTLINE = null;
function buildMasks() {
  if (MASK) return;
  const { x0, y0, cell, cols, rows } = GRID;
  const out = OUTLINE = wallOutline();
  MASK = new Uint8Array(cols * rows);
  DRONE_OK = new Uint8Array(cols * rows);
  CAP_OK = new Uint8Array(cols * rows);
  const counted = [];
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const cx = x0 + (i + 0.5) * cell, cy = y0 + (j + 0.5) * cell;
      const k = j * cols + i;
      if (cy > WALL_Y1 || !inPoly(out, cx, cy)) continue;
      const dw = polyDist(out, cx, cy);         // le bas du mur (y = 590) n'est pas un rail
      let db = Infinity;
      for (const b of BOMBS) db = Math.min(db, Math.hypot(cx - b.x, cy - b.y));
      if (dw >= RAIL + EDGE && db >= BUMP_R + BOMB_EDGE) { MASK[k] = 1; counted.push(k); }
      if (dw >= DRONE_WALL && db >= DRONE_BOMB && cx < 542 - DRONE_WALL && cy < 480) DRONE_OK[k] = 1;
      if (dw >= 44 && db >= BUMP_R + 46 && cx < 530 && cy > 60 && cy < 560) CAP_OK[k] = 1;
    }
  }
  COUNTED = Int32Array.from(counted);
}

export class GraffitiGame extends FlipperArena {
  constructor(game, opts) {
    const lvl = opts.level || 1;
    const T = tuning(lvl);
    super(game, opts, {
      gravity: 2000,
      time: T.time,
      title: 'FRESQUE NÉON',
      objective: `Peignez ${TARGET} % du mur avec le noyau — batteurs ← →`,
      music: 'tag',
      perk: { name: 'Pistolet à peinture', desc: 'Rayon de peinture ×2 pendant 8 s' },
    });
    buildMasks();
    this.T = T;
    this.geo = { outline: OUTLINE, grid: GRID, bombs: BOMBS, lime: LIME, target: TARGET };
    this.mask = MASK;
    this.counted = COUNTED;
    this.droneOk = DRONE_OK;
    this.capOk = CAP_OK;
    const n = GRID.cols * GRID.rows;
    this.paint = new Uint8Array(n);       // 1 = peint
    this.hueOf = new Uint8Array(n);       // teinte au moment de la peinture (0..255)
    this.painted = 0;                     // cellules comptées peintes
    this.total = COUNTED.length;
    this.newPainted = 0;                  // cellules peintes pendant cette tentative
    this.erased = 0;
    this.keptPct = 0;
    this.best = 0;
    this.nextMs = 0;
    this.hue = 0;
    this.aerosolT = 0;
    this.drones = [];
    this.droneT = T.droneDelay;
    this.dronesIn = false;
    this.cap = null;
    this.capT = 7;
    this.blobs = [];
    this.pops = [];                       // onomatopées peintes (« PSCHIT ! »)
    this.ripples = [];
    this.fresh = [];                      // traînée fraîche (rendu)
    this.ops = null;                      // opérations de peinture pour le rendu (créé par le rendu)
    this.art = null;
    this.trail = { x: 0, y: 0, on: false };
    this.sprayT = 0;
    this.sprayN = 0;
    this.eraseNote = 0;
    this.stunned = 0;
    this.capsules = 0;
    this.splashes = 0;
    this.unstuck = 0;
    this.unstick = true;
    this.stk = { x: 0, y: 0, t: 0, slow: 0 };
    this.winT = -1;
    this.won = false;
    this.milestoneFx = 0;
    this.almost = false;
    this.intensity = 0.72;
    this._build();
    this.world.build();
    if (this.kept && this.kept.cells) this._restore(this.kept.cells);
  }

  _build() {
    const w = this.world;
    this.bombs = BOMBS.map((B, i) => {
      const p = w.circle(B.x, B.y, BUMP_R, { mat: 'bumper', kick: 980, kickMin: 25, kickCooldown: 0.06, style: 'paintBomb' });
      const bomb = { i, x: B.x, y: B.y, color: B.color, p, flash: 0, cd: 0, hits: 0, wob: 0 };
      p.onHit = (b, imp, nx, ny) => this._hitBomb(bomb, b, imp, nx, ny);
      return bomb;
    });
    this.posts = w.statics.filter(p => p.kind === 'circle' && p.style === 'post');
    // drones : prims réutilisés (jamais retirés du monde)
    this.dronePool = [];
    for (let i = 0; i < 4; i++) {
      this.dronePool.push(w.circle(0, -500, DRONE_R, { mat: 'metal', kick: 240, kickMin: 60, kickCooldown: 0.1, dynamic: true, enabled: false, style: 'drone' }));
    }
  }

  entryPoint() { return { x: 281, y: 680 }; }
  applyPerk() { this.aerosolT = Math.max(this.aerosolT, 8); this.perkT = 8; }

  begin(ball) {
    super.begin(ball);
    const g = this.game;
    if (this.keptPct > 0) g.later(3.2, () => g.say('tagKept', { pct: this.keptPct }));
    // conseil si le mur reste gris (le premier tir couvre d'ordinaire un bon quart du mur)
    g.later(9, () => { if (this.state === 'play' && this.coverage() < 30) g.say('tagStart'); });
  }

  // ------------------------------------------------------------ grille
  coverage() { return this.total ? 100 * this.painted / this.total : 0; }
  pct() { return Math.floor(this.coverage()); }

  // Peint toutes les cellules comptées à moins de r du segment (x0,y0)-(x1,y1). Renvoie le nombre de nouvelles cellules.
  _paintSeg(x0, y0, x1, y1, r, hue) {
    const { x0: gx, y0: gy, cell, cols, rows } = GRID;
    const i0 = Math.max(0, Math.floor((Math.min(x0, x1) - r - gx) / cell));
    const i1 = Math.min(cols - 1, Math.floor((Math.max(x0, x1) + r - gx) / cell));
    const j0 = Math.max(0, Math.floor((Math.min(y0, y1) - r - gy) / cell));
    const j1 = Math.min(rows - 1, Math.floor((Math.max(y0, y1) + r - gy) / cell));
    if (i0 > i1 || j0 > j1) return 0;
    const dx = x1 - x0, dy = y1 - y0, l2 = dx * dx + dy * dy, r2 = r * r;
    const h8 = Math.round(hue / 360 * 255) & 255;
    let n = 0;
    for (let j = j0; j <= j1; j++) {
      const cy = gy + (j + 0.5) * cell;
      for (let i = i0; i <= i1; i++) {
        const k = j * cols + i;
        if (!this.mask[k] || this.paint[k]) continue;
        const cx = gx + (i + 0.5) * cell;
        let t = l2 > 0 ? ((cx - x0) * dx + (cy - y0) * dy) / l2 : 0;
        t = t < 0 ? 0 : t > 1 ? 1 : t;
        const ex = cx - x0 - dx * t, ey = cy - y0 - dy * t;
        if (ex * ex + ey * ey > r2) continue;
        this.paint[k] = 1; this.hueOf[k] = h8; n++;
      }
    }
    if (n) { this.painted += n; this.newPainted += n; }
    return n;
  }

  _eraseCircle(x, y, r) {
    const { x0: gx, y0: gy, cell, cols, rows } = GRID;
    const i0 = Math.max(0, Math.floor((x - r - gx) / cell)), i1 = Math.min(cols - 1, Math.floor((x + r - gx) / cell));
    const j0 = Math.max(0, Math.floor((y - r - gy) / cell)), j1 = Math.min(rows - 1, Math.floor((y + r - gy) / cell));
    const r2 = r * r;
    let n = 0;
    for (let j = j0; j <= j1; j++) {
      const ey = gy + (j + 0.5) * cell - y;
      for (let i = i0; i <= i1; i++) {
        const k = j * cols + i;
        if (!this.paint[k]) continue;
        const ex = gx + (i + 0.5) * cell - x;
        if (ex * ex + ey * ey > r2) continue;
        this.paint[k] = 0; n++;
      }
    }
    if (n) { this.painted -= n; this.erased += n; }
    return n;
  }

  // opérations de dessin (consommées par le rendu, seulement s'il existe)
  _op(o) { if (this.ops) { this.ops.push(o); if (this.ops.length > 600) this.ops.splice(0, 200); } }

  // éclaboussure : gros disque + gouttes projetées qui peignent en retombant
  _splash(x, y, R, hue, n, nx = 0, ny = 0, speed = 420) {
    this._paintSeg(x, y, x, y, R, hue);
    this._op({ k: 'splash', x, y, r: R, h: hue });
    for (let i = 0; i < n; i++) {
      let a = rand(0, TAU);
      if (nx || ny) a = Math.atan2(ny, nx) + rand(-1.25, 1.25);
      const s = rand(speed * 0.45, speed);
      if (this.blobs.length > 40) this.blobs.shift();
      this.blobs.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, t: 0, life: rand(0.16, 0.36), r: rand(9, 15), h: (hue + rand(-30, 30) + 360) % 360 });
    }
    this.ripples.push({ x, y, r: R, t: 0, h: hue });
    if (this.ripples.length > 8) this.ripples.shift();
  }

  _pop(x, y, str, hue, size = 1) {
    if (this.pops.length > 6) this.pops.shift();
    this.pops.push({ x, y, str, h: hue, t: 0, life: 0.9, s: size, rot: rand(-0.25, 0.25) });
  }

  // ------------------------------------------------------------ boucle
  arenaStep(dt) {
    const play = this.state === 'play';
    const g = this.game;
    this.hue = (this.time * 72) % 360;
    if (this.aerosolT > 0) this.aerosolT -= dt;
    if (this.milestoneFx > 0) this.milestoneFx -= dt;
    if (this.eraseNote > 0) this.eraseNote -= dt;
    for (const b of this.bombs) { b.flash = Math.max(0, b.flash - dt * 4); b.wob = Math.max(0, b.wob - dt * 3); if (b.cd > 0) b.cd -= dt; }
    // gouttes en vol
    for (let i = this.blobs.length - 1; i >= 0; i--) {
      const o = this.blobs[i];
      o.t += dt;
      o.x += o.vx * dt; o.y += o.vy * dt;
      o.vx *= 1 - 2.2 * dt; o.vy = o.vy * (1 - 2.2 * dt) + 260 * dt;
      if (o.t >= o.life) {
        this.blobs.splice(i, 1);
        this._paintSeg(o.x, o.y, o.x, o.y, o.r, o.h);
        this._op({ k: 'blob', x: o.x, y: o.y, r: o.r, h: o.h });
      }
    }
    for (let i = this.pops.length - 1; i >= 0; i--) { const p = this.pops[i]; p.t += dt; if (p.t >= p.life) this.pops.splice(i, 1); }
    for (let i = this.ripples.length - 1; i >= 0; i--) { const p = this.ripples[i]; p.t += dt; if (p.t >= 0.5) this.ripples.splice(i, 1); }
    for (let i = this.fresh.length - 1; i >= 0; i--) { const f = this.fresh[i]; f.t += dt; if (f.t > 0.7) this.fresh.splice(i, 1); }
    if (this.state === 'victory') { this._victoryStep(dt); return; }
    // drones (figés pendant une relance)
    if (play && !this.dronesIn) {
      this.droneT -= dt;
      if (this.droneT <= 0) this._spawnDrones();
    }
    for (const d of this.drones) this._updateDrone(d, dt, play);
    // capsule AÉROSOL
    if (play) this._updateCapsule(dt);
    if (this.sprayT > 0) this.sprayT -= dt;
    this.intensity = 0.7 + Math.min(0.25, this.coverage() / TARGET * 0.25);
  }

  afterStep(dt) {
    const b = this.ball;
    if (b && b.state === 'free' && (this.state === 'play' || this.state === 'victory')) this._paintBall(b, dt);
    if (this.state === 'play') this._checkProgress();
    if (b && b.state === 'free') this._unperch(b);
    this._unstick(dt);
  }

  // Équilibre parfait d'une bille tombée pile à la verticale d'un poteau (cas limite du
  // cadre commun) : imperceptible déséquilibre vers le couloir intérieur.
  _unperch(b) {
    for (const p of this.posts) {
      const dx = b.x - p.x;
      if (Math.abs(dx) < 1.5 && b.y < p.y && b.y > p.y - p.r - b.r - 4 && Math.abs(b.vx) < 15) b.vx += (p.x < 281 ? 1 : -1) * 30;
    }
  }

  _brush(b) {
    const sp = Math.hypot(b.vx, b.vy);
    let r = BRUSH + BRUSH_FAST * smoothstep(1200, 3000, sp);
    if (this.aerosolT > 0) r *= 2;
    return r;
  }

  _paintBall(b, dt) {
    if (b.y > WALL_Y1 + 30 && b.py > WALL_Y1 + 30) { this.trail.on = false; return; }
    const r = this._brush(b);
    const n = this._paintSeg(b.px, b.py, b.x, b.y, r, this.hue);
    // tracé visuel : tampons espacés le long du trajet
    const T = this.trail;
    const step = Math.max(6, r * 0.55);
    if (!T.on) { T.x = b.px; T.y = b.py; T.on = true; this._stamp(T.x, T.y, r); }
    let dx = b.x - T.x, dy = b.y - T.y, d = Math.hypot(dx, dy), guard = 0;
    while (d >= step && guard++ < 24) {
      T.x += dx / d * step; T.y += dy / d * step;
      this._stamp(T.x, T.y, r);
      dx = b.x - T.x; dy = b.y - T.y; d = Math.hypot(dx, dy);
    }
    // son de pulvérisation : proportionnel à la peinture fraîche
    this.sprayN += n;
    if (this.sprayT <= 0 && this.sprayN > 0) {
      this.game.sfx('tagSpray', (b.x - 281) / 281, Math.min(1, this.sprayN / 10), this.aerosolT > 0);
      if (this.sprayN >= 3) this.game.addScore(this.sprayN * 20 * this.level);
      this.sprayN = 0;
      this.sprayT = 0.11;
    }
  }

  _stamp(x, y, r) {
    if (y > WALL_Y1 + r) return;
    this._op({ k: 'stamp', x, y, r, h: this.hue });
    if (this.ops) {
      this.fresh.push({ x, y, r, h: this.hue, t: 0 });
      if (this.fresh.length > 36) this.fresh.shift();
    }
  }

  _checkProgress() {
    const pct = this.coverage();
    this.best = Math.max(this.best, pct);
    const g = this.game;
    while (this.nextMs < MILESTONES.length && pct >= MILESTONES[this.nextMs]) {
      const m = MILESTONES[this.nextMs++];
      this.milestoneFx = 1.2;
      this.milestoneText = `${m} %`;
      g.addScore(10000 * this.level * (m === 25 ? 1 : 2), 281, 300, `MUR ${m} %`);
      g.sfx('tagMilestone', m === 25 ? 1 : 2);
      g.fx.flash(LIME, 0.12);
      g.fx.sweep(LIME, 600, 0, 0.6);
      if (m === 25) {
        // aérosol offert (s'ajoute à celui en cours)
        this.aerosolT = Math.min(14, Math.max(0, this.aerosolT) + 5);
        g.banner('PALIER 25 %', 'Aérosol : +5 s de rayon ×2', LIME, 1.8);
        g.say('tag25');
      } else {
        this.setBarrier(this.T.net);
        g.banner('PALIER 50 %', `Filet de sécurité : ${this.T.net} s sous les batteurs`, LIME, 1.8);
        g.say('tag50');
      }
    }
    if (pct >= TARGET - 6 && !this.almost && pct < TARGET) { this.almost = true; g.say('tagAlmost'); }
    if (pct >= TARGET) this._victory();
  }

  // ------------------------------------------------------------ bombes de peinture
  _hitBomb(bomb, b, imp, nx, ny) {
    if (this.state === 'ended' || bomb.cd > 0) return;
    bomb.cd = 0.1;
    bomb.flash = 1; bomb.wob = 1; bomb.hits++;
    this.splashes++;
    const g = this.game;
    const cx = bomb.x + nx * BUMP_R, cy = bomb.y + ny * BUMP_R;
    const hue = (this.hue + bomb.i * 120) % 360;
    const R = 38 * (this.aerosolT > 0 ? 1.5 : 1);
    this._splash(cx + nx * 14, cy + ny * 14, R, hue, 6, nx, ny, 480);
    g.addScore(400 * this.level, bomb.x, bomb.y - 40);
    g.sfx('tagSplash', (bomb.x - 281) / 281, bomb.i);
    g.fx.burst(cx, cy, bomb.color, 8, 300);
    if (bomb.hits % 3 === 1) this._pop(bomb.x, bomb.y - 46, POPS[this.splashes % POPS.length], hue);
  }

  // ------------------------------------------------------------ drones nettoyeurs
  _spawnDrones() {
    this.dronesIn = true;
    const n = this.T.drones;
    const starts = [[150, 130], [412, 130], [281, 470], [281, 110]];
    for (let i = 0; i < n; i++) {
      const [x, y] = starts[i];
      const p = this.dronePool[i];
      const d = { i, x, y, vx: 0, vy: 0, tx: x, ty: y, p, warp: 0, stun: 0, flash: 0, hitCd: 0, retarget: 0, seed: rand(0, TAU), spin: 0, erased: 0, lx: x, ly: y, scrub: 0 };
      p.onHit = (b, imp) => this._hitDrone(d, b, imp);
      p.x = x; p.y = y; p.enabled = false;
      this.drones.push(d);
    }
    this.game.sfx('tagDroneWarp');
    this.game.say('tagDrones');
    this.game.banner('DRONES NETTOYEURS', 'Ils effacent la peinture — percutez-les', '#9fd8ff', 1.8);
  }

  _pickTarget(d) {
    const cols = GRID.cols;
    let best = -1, bestS = -Infinity;
    const C = this.counted;
    for (let s = 0; s < 18; s++) {
      const k = C[(Math.random() * C.length) | 0];
      if (!this.droneOk[k]) continue;
      const i = k % cols, j = (k / cols) | 0;
      let dens = 0;
      for (let jj = j - 2; jj <= j + 2; jj++) for (let ii = i - 2; ii <= i + 2; ii++) {
        if (ii < 0 || jj < 0 || ii >= cols || jj >= GRID.rows) continue;
        dens += this.paint[jj * cols + ii];
      }
      const cx = GRID.x0 + (i + 0.5) * GRID.cell, cy = GRID.y0 + (j + 0.5) * GRID.cell;
      let sc = dens - Math.hypot(cx - d.x, cy - d.y) / 70 + Math.random() * 2;
      for (const o of this.drones) if (o !== d) sc -= Math.max(0, 6 - Math.hypot(o.tx - cx, o.ty - cy) / 20);
      if (sc > bestS) { bestS = sc; best = k; }
    }
    if (best >= 0) {
      d.tx = GRID.x0 + (best % cols + 0.5) * GRID.cell;
      d.ty = GRID.y0 + ((best / cols | 0) + 0.5) * GRID.cell;
    }
    d.retarget = rand(3, 5);
  }

  // limites de vol : loin des murs, du dôme et des bombes (aucune poche où coincer la bille)
  _clampDrone(d) {
    const R = 277 - DRONE_WALL + RAIL;
    for (let pass = 0; pass < 2; pass++) {
      d.x = clamp(d.x, 20 + DRONE_WALL, 542 - DRONE_WALL);
      d.y = clamp(d.y, 60, 480);
      if (d.y < 300) {
        const dx = d.x - 300, dy = d.y - 300, l = Math.hypot(dx, dy);
        if (l > R) { d.x = 300 + dx / l * R; d.y = 300 + dy / l * R; }
      }
      for (const B of BOMBS) {
        const dx = d.x - B.x, dy = d.y - B.y, l = Math.hypot(dx, dy) || 1;
        if (l < DRONE_BOMB) { d.x = B.x + dx / l * DRONE_BOMB; d.y = B.y + dy / l * DRONE_BOMB; }
      }
    }
  }

  _updateDrone(d, dt, play) {
    d.flash = Math.max(0, d.flash - dt * 4);
    if (d.hitCd > 0) d.hitCd -= dt;
    const ox = d.x, oy = d.y;
    if (play) {
      if (d.warp < 1) d.warp = Math.min(1, d.warp + dt / 0.8);
      if (d.stun > 0) {
        d.stun -= dt;
        d.spin += dt * (6 + d.stun * 3);
        d.vx *= 1 - 3 * dt; d.vy *= 1 - 3 * dt;
        if (d.stun <= 0) { d.retarget = 0; this.game.sfx('tagDroneWake', (d.x - 281) / 281); }
      } else {
        d.retarget -= dt;
        if (d.retarget <= 0 || Math.hypot(d.tx - d.x, d.ty - d.y) < 10) this._pickTarget(d);
        const sp = this.T.droneSpeed * (d.warp < 1 ? 0.3 : 1);
        let ax = d.tx - d.x, ay = d.ty - d.y;
        const l = Math.hypot(ax, ay) || 1;
        // évitement des bombes et des autres drones
        let rx = 0, ry = 0;
        for (const B of BOMBS) {
          const ex = d.x - B.x, ey = d.y - B.y, el = Math.hypot(ex, ey) || 1;
          if (el < DRONE_BOMB + 30) { rx += ex / el * (DRONE_BOMB + 30 - el) / 30; ry += ey / el * (DRONE_BOMB + 30 - el) / 30; }
        }
        for (const o of this.drones) {
          if (o === d) continue;
          const ex = d.x - o.x, ey = d.y - o.y, el = Math.hypot(ex, ey) || 1;
          if (el < DRONE_SEP) { rx += ex / el * 1.5; ry += ey / el * 1.5; }
        }
        const wx = ax / l + rx, wy = ay / l + ry, wl = Math.hypot(wx, wy) || 1;
        d.vx += (wx / wl * sp - d.vx) * Math.min(1, dt * 2.5);
        d.vy += (wy / wl * sp - d.vy) * Math.min(1, dt * 2.5);
        d.spin += dt * 2;
      }
      d.x += d.vx * dt; d.y += d.vy * dt;
      this._clampDrone(d);
      // nettoyage : efface la peinture sous le drone
      if (d.stun <= 0 && d.warp >= 1) {
        const n = this._eraseCircle(d.x, d.y, this.T.eraseR);
        d.erased += n;
        if (n) d.scrub = 1; else d.scrub = Math.max(0, d.scrub - dt * 2);
        if (Math.hypot(d.x - d.lx, d.y - d.ly) > 4 || n) {
          this._op({ k: 'erase', x: d.x, y: d.y, r: this.T.eraseR, x0: d.lx, y0: d.ly });
          d.lx = d.x; d.ly = d.y;
        }
        if (n) {
          this.game.sfx('tagScrub', (d.x - 281) / 281);
          if (d.erased > 40 && this.eraseNote <= 0) { this.eraseNote = 12; this.game.say('tagErase'); }
        }
      }
    }
    this._placeDrone(d, dt, ox, oy);
  }

  _placeDrone(d, dt, ox, oy) {
    const p = d.p;
    p.x = d.x; p.y = d.y;
    p.vx = dt > 0 ? (d.x - ox) / dt : 0; p.vy = dt > 0 ? (d.y - oy) / dt : 0;
    const solid = d.warp >= 0.6;
    const b = this.ball;
    if (solid && !p.enabled && b && Math.hypot(b.x - d.x, b.y - d.y) < DRONE_R + b.r + 2) return;
    p.enabled = solid;
  }

  _hitDrone(d, b, imp) {
    if (this.state === 'ended' || d.hitCd > 0 || imp < 60) return;
    d.hitCd = 0.35;
    const g = this.game;
    const fresh = d.stun <= 0;
    d.stun = Math.max(d.stun, this.T.stun);
    d.flash = 1;
    d.vx += (d.x - b.x) * 3; d.vy += (d.y - b.y) * 3;
    this.stunned++;
    const hue = (this.hue + 180) % 360;
    this._splash(d.x, d.y, (fresh ? 30 : 20) * (this.aerosolT > 0 ? 1.4 : 1), hue, fresh ? 4 : 2, 0, 0, 460);
    g.addScore((fresh ? 2500 : 800) * this.level, d.x, d.y - 34, fresh ? 'DRONE SONNÉ' : undefined);
    g.sfx('tagDroneStun', (d.x - 281) / 281);
    g.fx.burst(d.x, d.y, '#bfe9ff', 10, 320);
    g.fx.ring(d.x, d.y, '#ffffff', 60, 0.4);
    g.fx.shake(3);
    this._pop(d.x, d.y - 30, fresh ? 'BAM !' : 'CLONK !', hue, fresh ? 1.15 : 0.9);
    if (fresh) g.say('tagStun');
  }

  // ------------------------------------------------------------ capsule AÉROSOL
  _updateCapsule(dt) {
    const g = this.game;
    if (!this.cap) {
      this.capT -= dt;
      if (this.capT <= 0) this._spawnCapsule();
      return;
    }
    const c = this.cap;
    c.t += dt;
    const b = this.ball;
    if (b && b.state === 'free' && c.t > 0.4 && Math.hypot(b.x - c.x, b.y - c.y) < 32 + b.r * 0.5) {
      this.cap = null;
      this.capT = 11;
      this.capsules++;
      this.aerosolT = Math.max(this.aerosolT, 6);
      this._splash(c.x, c.y, 50, this.hue, 10, 0, 0, 560);
      g.addScore(3000 * this.level, c.x, c.y - 36, 'AÉROSOL ×2');
      g.sfx('tagAerosol');
      g.say('tagAerosol');
      g.banner('AÉROSOL ×2', 'Rayon de peinture doublé pendant 6 s', LIME, 1.4);
      g.fx.flash(LIME, 0.12);
      g.fx.ring(c.x, c.y, LIME, 90, 0.5);
      this._pop(c.x, c.y - 40, 'PSCHHHT !', this.hue, 1.2);
      return;
    }
    if (c.t >= c.life) { this.cap = null; this.capT = 5; }
  }

  // apparaît dans la zone la moins peinte (attire le joueur vers le gris)
  _spawnCapsule() {
    const cols = GRID.cols;
    let best = -1, bestS = -Infinity;
    for (let s = 0; s < 40; s++) {
      const k = this.counted[(Math.random() * this.counted.length) | 0];
      if (!this.capOk[k]) continue;
      const i = k % cols, j = (k / cols) | 0;
      let bare = 0;
      for (let jj = j - 3; jj <= j + 3; jj++) for (let ii = i - 3; ii <= i + 3; ii++) {
        if (ii < 0 || jj < 0 || ii >= cols || jj >= GRID.rows) continue;
        const kk = jj * cols + ii;
        if (this.mask[kk] && !this.paint[kk]) bare++;
      }
      const sc = bare + Math.random() * 3;
      if (sc > bestS) { bestS = sc; best = k; }
    }
    if (best < 0) { this.capT = 3; return; }
    const x = GRID.x0 + (best % cols + 0.5) * GRID.cell, y = GRID.y0 + ((best / cols | 0) + 0.5) * GRID.cell;
    this.cap = { x, y, t: 0, life: 10 };
    this.game.sfx('tagCapsule', (x - 281) / 281);
    if (this.capsules === 0) this.game.say('tagCapsule');
  }

  // ------------------------------------------------------------ victoire
  _victory() {
    if (this.won) return;
    this.won = true;
    const g = this.game;
    this.state = 'victory';
    this.winT = 0;
    this.setBarrier(6);
    this.cap = null;
    for (const d of this.drones) { d.stun = 99; d.flash = 1; }
    g.addScore(30000 * this.level, 281, 300, 'FRESQUE ACHEVÉE');
    g.sfx('tagWin');
    g.say('tagWin');
    g.banner('FRESQUE ACHEVÉE', `${TARGET} % du mur repeint — la station retrouve ses couleurs`, LIME, 2.6);
    g.fx.flash('#ffffff', 0.35);
    g.fx.shake(6);
    g.fx.sweep(LIME, 600, -20, 0.9);
    const b = this.ball;
    this.winX = b ? b.x : 281; this.winY = b ? Math.min(b.y, WALL_Y1) : 300;
    this.game.later(1.25, () => g.sfx('tagSign'));
  }

  _victoryStep(dt) {
    this.winT += dt;
    // la fresque se révèle en entier (onde depuis la bille)
    const R = this.winT * 900;
    for (const d of this.drones) { d.stun = 99; d.spin += dt * 10; d.y += 60 * dt; d.p.enabled = false; }
    if (this.winT > 0.1 && this.winT < 1.2) {
      const fx = this.game.fx;
      if (Math.random() < 0.5) {
        const a = rand(0, TAU), rr = Math.min(R, 400) * rand(0.3, 1);
        fx.burst(this.winX + Math.cos(a) * rr, clamp(this.winY + Math.sin(a) * rr, 40, 580), ['#ff2bd6', '#22e4ff', '#ffd84a', LIME][(Math.random() * 4) | 0], 4, 200);
      }
    }
    if (this.winT >= 3.1 && this.state === 'victory') {
      // toutes les cellules sont peintes (la fresque est entière)
      this.finish(true, 'fresco');
    }
  }

  // ------------------------------------------------------------ anti-blocage
  // Filet de sécurité (le recensement des blocages le vérifie désactivé) : une bille
  // immobile 1 s hors des batteurs (par exemple en équilibre parfait sur un poteau de
  // couloir) reçoit une pichenette vers le centre ; une bille qui se traîne 3 s dans
  // le haut de l'arène est relancée.
  _unstick(dt) {
    const b = this.ball, S = this.stk;
    if (!this.unstick || !b || b.state !== 'free' || (this.state !== 'play' && this.state !== 'victory')) { S.t = 0; S.slow = 0; return; }
    const f = this.frame;
    const cradle = b.y > 860 && (f.flipL.pressed || f.flipR.pressed);
    if (!cradle && Math.abs(b.x - S.x) < 4 && Math.abs(b.y - S.y) < 4) S.t += dt;
    else { S.x = b.x; S.y = b.y; S.t = 0; }
    const sp = Math.hypot(b.vx, b.vy);
    if (b.y < 860 && sp < 90) S.slow += dt; else if (sp > 250 || b.y >= 860) S.slow = 0;
    if (S.t > 1) {
      S.t = 0; S.slow = 0;
      this.unstuck++;
      b.vx = (b.x < 281 ? 1 : -1) * rand(120, 220); b.vy = -rand(150, 300);
      this.game.say('stuck');
    } else if (S.slow > 3) {
      S.t = 0; S.slow = 0;
      this.unstuck++;
      b.vx = rand(-280, 280); b.vy = -420;
      this.game.say('stuck');
    }
  }

  // ------------------------------------------------------------ progression conservée
  // La moitié de la peinture posée est rendue à la tentative suivante, par plaques
  // (motif basse fréquence) plutôt qu'en confettis.
  keepProgress() {
    const cols = GRID.cols;
    const seed = Math.random() * 100;
    const list = [];
    for (const k of this.counted) {
      if (!this.paint[k]) continue;
      const i = k % cols, j = (k / cols) | 0;
      const v = Math.sin(i * 0.31 + seed) + Math.sin(j * 0.27 - seed * 1.3) + 0.6 * Math.sin((i + j) * 0.17 + seed * 0.7);
      list.push([k, v]);
    }
    list.sort((a, b) => b[1] - a[1]);
    const keep = list.slice(0, Math.floor(list.length / 2)).map(e => e[0]);
    return { cells: keep };
  }

  _restore(cells) {
    let n = 0;
    for (const k of cells) {
      if (k < 0 || k >= this.paint.length || !this.mask[k] || this.paint[k]) continue;
      this.paint[k] = 1;
      this.hueOf[k] = Math.floor(hash(k) * 255);
      n++;
    }
    this.painted += n;
    this.keptPct = Math.floor(this.coverage());
    this.best = this.coverage();
    while (this.nextMs < MILESTONES.length && this.coverage() >= MILESTONES[this.nextMs]) this.nextMs++;
  }

  resetCombos() { this.aerosolT = 0; }

  results(success) {
    const rewards = [];
    if (success) {
      rewards.push({ type: 'mult' }, { type: 'bumper' });
      if (this.timeLeft >= 25) rewards.push({ type: 'magnet' });
    }
    return {
      rewards,
      partialRewards: !success && this.best >= 50 ? [{ type: 'bumper' }] : [],
      points: success ? Math.round(this.timeLeft) * 1500 * this.level + 20000 * this.level : this.newPainted * 25 * this.level,
    };
  }

  progressText() {
    const pct = Math.min(this.won ? 100 : 99, this.pct());
    let s = `Mur peint ${this.won ? Math.max(TARGET, pct) : pct} % / ${TARGET} %`;
    if (this.aerosolT > 0) s += ` · AÉROSOL ×2 ${Math.ceil(this.aerosolT)} s`;
    else if (this.dronesIn) {
      const act = this.drones.filter(d => d.stun <= 0).length;
      s += ` · nettoyeurs ${act}/${this.drones.length}`;
    }
    return s;
  }

  // fin immédiate (console de débogage) ; debugFresco() joue la séquence de victoire complète
  debugWin() { this.finish(true, 'debug'); }
  debugFresco() {
    if (this.state !== 'play') return;
    for (const k of this.counted) if (!this.paint[k]) { this.paint[k] = 1; this.painted++; if (this.coverage() >= TARGET) break; }
    this._victory();
  }

  // ------------------------------------------------------------ rendu
  drawStatic(g, r) { drawGraffitiStatic(g, this, r); }
  renderArena(ctx, r) { renderGraffiti(ctx, r, this); }
  renderTop(ctx, r) { renderGraffitiTop(ctx, r, this); }
}
