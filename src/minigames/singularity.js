import { FlipperArena } from './arena.js';
import { rand, clamp, lerp, TAU, wrapAngle } from '../util/math.js';
import { addLines } from '../game/lumen.js';
import { SingularityArt, bindGeometry } from './singularityArt.js';

// SINGULARITÉ — secteur RÉACTEUR.
// Le cœur du réacteur s'est effondré en micro-singularité, suspendue au milieu de l'arène.
// Son champ courbe la trajectoire de la bille ; des cellules d'énergie gravitent sur
// 3 orbites (l'intérieure vaut double). Le joueur les récolte en passant dessus.
//  - Paliers : chaque tiers de la récolte fait grossir la singularité (attraction plus forte)
//    et SÉCURISE la progression (rendue à la tentative suivante, jamais perdue).
//  - Bille happée (horizon franchi) : jamais perdue, recrachée vers un batteur sous
//    barrière ; pénalité = cellules dispersées (sans descendre sous le palier sécurisé).
//  - FRONDE : un tour presque complet autour du centre (> 300°) sans rien toucher
//    récolte toute une orbite et relance la bille.
//  - STABILISATION : récolte complète → frapper la singularité (anneau de confinement)
//    la referme : implosion, victoire. Niveau 2 : 2 frappes, niveau 3+ : 3 frappes.
// Garde-fous : force plafonnée et atténuée au bord du champ, frottement d'accrétion,
// « saturation » du champ si la bille y séjourne trop (aucune orbite éternelle), vibration
// du réacteur (aucun équilibre instable) ; physique appliquée à chaque sous-pas (ballHook).

export const SG = {
  cx: 281, cy: 362,      // centre de la singularité
  RF: 236, RF0: 172,     // rayon du champ, début de l'atténuation
  EPS: 90,               // adoucissement du cœur (profil de Plummer) : puits large, cœur plafonné
  M: 1.3e8,              // « masse » de base (u³/s²) : ≈ 4000 u/s² à 140 du centre, 6200 au plus fort
  RD: 150, DRAG: 0.35,   // frottement d'accrétion (par seconde, au centre)
  rH0: 16, rH1: 25,      // horizon des événements : au départ → récolte complète
  RING: 64,              // anneau de confinement (cible de la stabilisation)
  FRONDE: 300 * Math.PI / 180,
  PICK: 22,              // distance de récolte (centre bille ↔ centre cellule) : il faut toucher la cellule
};

// Orbites des cellules : rayon, nombre de cellules, valeur, vitesse angulaire (rad/s, signe = sens).
export const ORBITS = [
  { r: 88, n: 2, value: 2, w: 0.9, color: '#ff4fd8', pts: 3000, name: 'INTÉRIEURE' },
  { r: 140, n: 3, value: 1, w: -0.55, color: '#ffd84a', pts: 1500, name: 'MÉDIANE' },
  { r: 194, n: 4, value: 1, w: 0.36, color: '#29e3ff', pts: 1000, name: 'EXTÉRIEURE' },
];

bindGeometry(SG, ORBITS);

const AMBER = '#ffae2a';
const HOT = '#ff6a2a';
const PALIERS = 3;

addLines({
  enter_reactor: { pri: 4, cd: 0, v: [
    'Le cœur du réacteur s\'est effondré en singularité. Récoltez les cellules en orbite, puis refermez-la.',
    'Singularité au centre. Les cellules gravitent, la bille aussi. Récoltez, puis frappez le cœur.',
  ] },
  sgFirst: { pri: 2, cd: 0, v: ['Première cellule. La singularité vous a remarqué.', 'Cellule récoltée. Continuez, elle tourne.'] },
  sgGrow: { pri: 3, cd: 2, v: ['Elle grossit. Palier {n}/3 sécurisé.', 'Masse en hausse. Palier {n}/3 : ce qui est récolté reste acquis.'] },
  sgCapture: { pri: 3, cd: 3, v: ['Avalée… puis recrachée. Elle n\'aime pas votre goût.', 'Horizon franchi. J\'ai récupéré le noyau, pas les cellules.', 'Happée ! Je vous la rends. Moins quelques cellules.'] },
  sgCaptureSafe: { pri: 2, cd: 3, v: ['Happée, mais le palier tient. Rien de perdu.'] },
  sgFronde: { pri: 4, cd: 2, v: ['Fronde gravitationnelle ! Orbite entière récoltée.', 'Un tour complet sans rien toucher. Même moi, je suis impressionnée.', 'Fronde ! Newton applaudit. Einstein aussi.'] },
  sgFrondeHint: { pri: 1, cd: 25, v: ['Faites-lui faire le tour du trou noir : la fronde récolte une orbite entière.'] },
  sgAlmost: { pri: 2, cd: 6, v: ['Plus que {n}. La singularité commence à s\'inquiéter.', 'Encore {n}. Elle sent la fin venir.'] },
  sgStabilize: { pri: 4, cd: 0, v: ['Récolte complète. Maintenant, frappez-la en plein cœur !', 'Assez d\'énergie. Visez la singularité : on la referme.'] },
  sgRingHit: { pri: 3, cd: 1, v: ['Confinement {n}/{m}. Encore !', 'Ça tient. Confinement {n} sur {m}.'] },
  sgImplode: { pri: 5, cd: 0, v: ['Singularité refermée. Le réacteur respire à nouveau.', 'Implosion contrôlée. Je n\'ai jamais douté. Presque.'] },
  sgSaturate: { pri: 1, cd: 10, v: ['Champ saturé : elle vous relâche.', 'Saturation du champ. Le noyau retombe.'] },
  sgConfine: { pri: 2, cd: 8, v: ['Champ de confinement : l\'horizon vous repousse. Profitez-en.'] },
  sgKept: { pri: 3, cd: 0, v: ['Progression conservée : {n} cellules déjà stockées.'] },
});

export class SingularityGame extends FlipperArena {
  constructor(game, opts) {
    const lvl = opts.level || 1;
    super(game, opts, {
      gravity: 2000,
      time: 80,
      title: 'SINGULARITÉ',
      objective: 'Récoltez les cellules en orbite, puis frappez la singularité',
      music: 'reactor',
      perk: { name: 'Champ de confinement', desc: 'L\'horizon repousse la bille et l\'attraction est réduite pendant 12 s' },
    });
    this.lvl = lvl;
    this.need = Math.min(27, 21 + 3 * (lvl - 1));
    this.stage = this.need / PALIERS;
    this.massK = Math.min(1.3, 1 + 0.08 * (lvl - 1));
    this.orbitK = Math.min(1.6, 1 + 0.15 * (lvl - 1));
    this.penalty = lvl >= 2 ? 2 : 1;
    this.respawn = Math.min(4, 3 + 0.4 * (lvl - 1));
    this.hitsNeed = Math.min(3, lvl);
    // progression conservée d'une tentative précédente : paliers sécurisés
    const k = this.kept || {};
    this.round = clamp(k.round | 0, 0, PALIERS - 1);
    this.harvest = clamp(k.cells ?? this.round * this.stage, 0, this.need - 1);
    this.keptStart = this.harvest;
    this.phase = 'harvest';       // harvest | stabilize | outro
    this.hits = 0;
    this.gVis = this.harvest / this.need;
    this.rH = lerp(SG.rH0, SG.rH1, this.gVis);
    this.ringR = 0;               // anneau de confinement (apparaît à la stabilisation)
    this.fieldK = 1;
    this.confineT = 0;
    this.immuneT = 0;
    this.satT = 0;                // saturation : champ relâché
    this.fieldT = 0;              // séjour continu dans le champ
    this.upT = 0;                 // temps depuis le dernier passage près des batteurs
    this.capture = null;          // bille happée : { t, r0, a0, spin, side, done }
    this.popT = 0;                // bille recrachée : réapparition
    this.outroT = -1;
    this.combo = 0; this.comboT = 0;
    this.sweep = 0; this.sweepOn = false; this.sweepA = 0; this.sweepA0 = 0; this.sweepRS = 0; this.sweepN = 0;
    this.sweepTick = 0;
    this.minR = 999;              // distance minimale au centre (dernière seconde) : alerte d'horizon
    this.minRT = 0;
    this.timers = [];
    this.alert = 0;               // alerte de croissance (rendu)
    this.shock = [];              // ondes de choc (rendu)
    this.frondes = 0; this.captures = 0; this.cellsTaken = 0; this.saturations = 0; this.confines = 0;
    this.unstuck = 0;
    this.stk = { x: 0, y: 0, t: 0, slow: 0 };
    this.intensity = 0.72;
    this._buildCells();
    // la force de champ s'applique à chaque sous-pas (précision des passages rasants)
    this.world.ballHook = (b, h) => this._field(b, h);
    // tout contact (batteurs, murs, slingshots) interrompt la fronde en cours
    const oc = this.world.onContact;
    this.world.onContact = (b, p, imp, x, y) => { if (b === this.ball) this._sweepReset(); oc(b, p, imp, x, y); };
    this.art = new SingularityArt(this);
    this.world.build();
  }

  // ------------------------------------------------------------ cellules
  _buildCells() {
    this.cells = [];
    ORBITS.forEach((o, oi) => {
      const a0 = rand(0, TAU);
      for (let k = 0; k < o.n; k++) {
        this.cells.push({
          oi, o, k, a: a0 + k * TAU / o.n, x: 0, y: 0,
          on: true, spawn: 1, respawnT: 0, flash: 0, seed: rand(0, 100), collapse: 0,
        });
      }
    });
    this._placeCells(0);
  }

  _placeCells(dt) {
    for (const c of this.cells) {
      c.a += c.o.w * this.orbitK * dt;
      c.x = SG.cx + Math.cos(c.a) * c.o.r;
      c.y = SG.cy + Math.sin(c.a) * c.o.r;
    }
  }

  entryPoint() { return { x: 281, y: 660 }; }

  applyPerk() {
    this.confineT = 12; this.perkT = 12;
    if (this.keptStart > 0) this.game.later(3.6, () => { if (this.state === 'play') this.game.say('sgKept', { n: this.keptStart }); });
  }

  // ------------------------------------------------------------ champ gravitationnel
  // Appelé à chaque sous-pas de la physique pour la bille libre.
  _field(b, h) {
    if (b !== this.ball || this.phase === 'outro') return;
    const dx = SG.cx - b.x, dy = SG.cy - b.y;
    const r2 = dx * dx + dy * dy;
    if (r2 >= SG.RF * SG.RF) { if (this.sweepOn) this._sweepReset(); return; }
    const r = Math.sqrt(r2) + 1e-6;
    const ux = dx / r, uy = dy / r;
    if (r < this.minR) this.minR = r;
    this._sweepTrack(b, r);
    if (this.immuneT > 0) return;
    // attraction (profil adouci, plafonné au cœur), atténuée au bord du champ
    let a = SG.M * r / Math.pow(r2 + SG.EPS * SG.EPS, 1.5) * this.fieldK;
    if (r > SG.RF0) { const u = (r - SG.RF0) / (SG.RF - SG.RF0); a *= 1 - u * u * (3 - 2 * u); }
    b.vx += ux * a * h; b.vy += uy * a * h;
    // frottement d'accrétion : les orbites s'amortissent, la bille finit toujours par sortir ou tomber
    if (r < SG.RD) { const k = 1 - SG.DRAG * (1 - r / SG.RD) * h; b.vx *= k; b.vy *= k; }
    // horizon / anneau
    if (this.phase === 'stabilize') { if (r < this.ringR + b.r * 0.4 && this.ringR > SG.RING * 0.8) this._ringHit(b, ux, uy); }
    else if (r < this.rH) this._horizon(b, r, ux, uy);
  }

  _sweepTrack(b, r) {
    const a = Math.atan2(b.y - SG.cy, b.x - SG.cx);
    if (!this.sweepOn) { this.sweepOn = true; this.sweepA = this.sweepA0 = a; this.sweep = 0; this.sweepRS = 0; this.sweepN = 0; this.sweepTick = 0; return; }
    this.sweep += wrapAngle(a - this.sweepA);
    this.sweepA = a;
    this.sweepRS += r; this.sweepN++;
    const s = Math.abs(this.sweep);
    // repères sonores de la fronde en préparation (195°, 240°, 275°)
    const tick = s > 4.8 ? 3 : s > 4.19 ? 2 : s > 3.4 ? 1 : 0;
    if (tick > this.sweepTick) { this.sweepTick = tick; if (this.phase === 'harvest' && this.state === 'play') this.game.sfx('sgCharge', tick); }
    if (s >= SG.FRONDE && this.phase === 'harvest' && this.state === 'play' && !this.capture) this._fronde(b, this.sweepRS / Math.max(1, this.sweepN));
  }

  _sweepReset() { this.sweepOn = false; this.sweep = 0; this.sweepTick = 0; }

  // franchissement de l'horizon pendant la récolte
  _horizon(b, r, ux, uy) {
    if (this.state !== 'play') return;
    if (this.confineT > 0) {
      // champ de confinement : rebond énergétique sur l'horizon
      const ox = -ux, oy = -uy;
      const vo = b.vx * ox + b.vy * oy;
      if (vo < 0) { b.vx -= 2 * vo * ox; b.vy -= 2 * vo * oy; }
      b.vx += ox * 380; b.vy += oy * 380;
      b.x = SG.cx + ox * (this.rH + 1); b.y = SG.cy + oy * (this.rH + 1);
      this.immuneT = 0.25;
      this.confines++;
      this._sweepReset();
      const g = this.game;
      g.sfx('sgConfine', this._pan(b.x));
      g.fx.ring(SG.cx, SG.cy, '#7fd7ff', this.rH * 3, 0.4);
      g.fx.burst(b.x, b.y, '#7fd7ff', 8, 220);
      if (this.confines === 1) g.say('sgConfine');
      return;
    }
    this._capture(b, r);
  }

  // ------------------------------------------------------------ bille happée
  _capture(b, r) {
    const g = this.game;
    const a = Math.atan2(b.y - SG.cy, b.x - SG.cx);
    // sens de rotation de la chute : celui du moment angulaire de la bille
    const lz = (b.x - SG.cx) * b.vy - (b.y - SG.cy) * b.vx;
    this.capture = { t: 0, r0: Math.max(r, 6), a0: a, spin: lz >= 0 ? 1 : -1, side: b.x < SG.cx ? -1 : 1, done: false };
    b.state = 'held'; b.vx = b.vy = 0;
    this.captures++;
    this._sweepReset();
    this.combo = 0;
    // pénalité : cellules dispersées, jamais sous le palier sécurisé
    const floor = this.round * this.stage;
    const lost = Math.max(0, Math.min(this.penalty, this.harvest - floor));
    this.harvest -= lost;
    g.sfx('sgCapture');
    g.fx.shake(6);
    g.fx.flash('#ff2a10', 0.18);
    g.fx.ring(SG.cx, SG.cy, HOT, 120, 0.6);
    this.shock.push({ t: 0, life: 0.7, r0: this.rH, r1: 170, color: HOT });
    if (lost > 0) {
      g.say('sgCapture');
      g.banner('HAPPÉE PAR LA SINGULARITÉ', `${lost} cellule${lost > 1 ? 's' : ''} dispersée${lost > 1 ? 's' : ''} — recrachée vers les batteurs`, HOT, 1.6);
      g.fx.text(SG.cx, SG.cy - 60, `−${lost} CELLULE${lost > 1 ? 'S' : ''}`, '#ff7a5a', 1.2);
      this.timers.push({ t: 0.5, fn: () => this._disperse(lost) });
    } else {
      g.say('sgCaptureSafe');
      g.banner('HAPPÉE PAR LA SINGULARITÉ', 'Palier sécurisé : aucune cellule perdue', HOT, 1.4);
    }
  }

  // cellules dispersées : elles rejaillissent du centre et se remettent en orbite
  _disperse(n) {
    const g = this.game;
    g.sfx('sgDisperse');
    const empty = this.cells.filter(c => !c.on);
    for (let i = 0; i < n; i++) {
      const c = empty[i];
      if (c) { c.on = true; c.spawn = 0; c.respawnT = 0; c.flash = 1; }
      this.art.disperse(c ? c : null);
    }
  }

  _updateCapture(dt) {
    const C = this.capture, b = this.ball;
    if (!C || !b) return;
    C.t += dt;
    const FALL = 0.42, HOLD = 0.95;
    if (C.t < FALL) {
      const u = C.t / FALL;
      const rr = C.r0 * (1 - u) * (1 - u);
      const a = C.a0 + C.spin * u * u * 7;
      b.x = SG.cx + Math.cos(a) * rr; b.y = SG.cy + Math.sin(a) * rr;
      b.scale = 1 - 0.8 * u; b.alpha = 1 - 0.6 * u;
    } else if (C.t < HOLD) {
      b.x = SG.cx; b.y = SG.cy; b.scale = 0.2; b.alpha = 0.4;
    } else {
      this._spit(b, C.side);
      this.capture = null;
    }
  }

  // recrache la bille vers un batteur (jamais droit entre les deux), sous barrière
  _spit(b, side) {
    const g = this.game;
    b.state = 'free';
    b.setPos(SG.cx + side * 6, SG.cy + this.rH + 6);
    b.vx = side * rand(95, 140);
    b.vy = rand(150, 230);
    b.scale = 0.4; b.alpha = 1;
    this.popT = 0.22;
    this.immuneT = 0.6;
    this.setBarrier(2.6);
    this._sweepReset();
    g.sfx('sgSpit', side * 0.3);
    g.fx.burst(b.x, b.y, AMBER, 14, 320);
    g.fx.ring(SG.cx, SG.cy, '#ffffff', 70, 0.35);
  }

  // ------------------------------------------------------------ récolte
  _collect(c, via) {
    if (!c.on || this.phase !== 'harvest') return;
    const g = this.game;
    c.on = false; c.respawnT = this.respawn; c.spawn = 0;
    const o = c.o;
    this.combo = this.comboT > 0 ? this.combo + 1 : 1;
    this.comboT = 1.6;
    this.cellsTaken++;
    const before = this.harvest;
    this.harvest = Math.min(this.need, this.harvest + o.value);
    const pts = o.pts * this.lvl * Math.min(5, this.combo);
    g.addScore(pts, c.x, c.y - 26);
    if (o.value > 1) g.fx.text(c.x, c.y + 24, '+2 CELLULES', o.color, 1);
    g.sfx('sgCell', this._pan(c.x), c.oi, this.combo);
    g.fx.burst(c.x, c.y, o.color, 12, 300);
    g.fx.burst(c.x, c.y, '#ffffff', 4, 180);
    g.fx.ring(c.x, c.y, o.color, 46, 0.4);
    this.art.collect(c);
    if (this.combo >= 3 && via !== 'fronde') g.fx.text(c.x, c.y + (o.value > 1 ? 46 : 24), `CHAÎNE ×${this.combo}`, '#ffffff', 0.9);
    if (before === this.keptStart && this.cellsTaken === 1) g.say('sgFirst');
    // paliers : la singularité grossit, la progression est sécurisée
    const stage = Math.min(PALIERS, Math.floor(this.harvest / this.stage + 1e-6));
    if (stage > this.round) {
      this.round = stage;
      if (stage < PALIERS) this._grow(stage);
    }
    if (this.harvest >= this.need) { this._stabilize(); return; }
    const left = this.need - this.harvest;
    if (left <= 2 && this.need - before > 2) g.say('sgAlmost', { n: left });
  }

  _grow(stage) {
    const g = this.game;
    this.alert = 1.6;
    this.setBarrier(3);
    g.sfx('sgGrow', stage);
    g.say('sgGrow', { n: stage });
    g.banner(`LA SINGULARITÉ GROSSIT`, `Palier ${stage}/${PALIERS} sécurisé — attraction renforcée`, HOT, 1.8);
    g.fx.shake(5);
    g.fx.flash(HOT, 0.16);
    this.shock.push({ t: 0, life: 0.9, r0: 30, r1: 260, color: HOT });
    this.shock.push({ t: -0.12, life: 0.9, r0: 20, r1: 200, color: '#ffffff' });
    if (stage === 1) g.later(2.4, () => { if (this.phase === 'harvest' && this.state === 'play' && this.frondes === 0) g.say('sgFrondeHint'); });
  }

  // ------------------------------------------------------------ fronde gravitationnelle
  _fronde(b, rMean) {
    const g = this.game;
    this.frondes++;
    this._sweepReset();
    // orbite balayée : la plus proche du rayon moyen de la boucle, parmi celles qui ont des cellules
    let best = null, bestD = Infinity;
    ORBITS.forEach((o, oi) => {
      const n = this.cells.filter(c => c.oi === oi && c.on).length;
      if (!n) return;
      const d = Math.abs(o.r - rMean);
      if (d < bestD) { bestD = d; best = oi; }
    });
    let gained = 0;
    if (best !== null) {
      const list = this.cells.filter(c => c.oi === best && c.on);
      const ab = Math.atan2(b.y - SG.cy, b.x - SG.cx);
      list.sort((p, q) => Math.abs(wrapAngle(p.a - ab)) - Math.abs(wrapAngle(q.a - ab)));
      list.forEach((c, i) => {
        gained += c.o.value;
        this.timers.push({ t: 0.08 + i * 0.09, fn: () => { this.art.zap(i === 0 ? { x: b.x, y: b.y } : list[i - 1], c); this._collect(c, 'fronde'); } });
      });
    } else {
      gained = 2;
      this.timers.push({ t: 0.1, fn: () => { if (this.phase === 'harvest') { this.harvest = Math.min(this.need, this.harvest + 2); if (this.harvest >= this.need) this._stabilize(); } } });
    }
    // la fronde relance la bille : vitesse accrue, champ coupé un instant (elle s'échappe)
    const s = Math.hypot(b.vx, b.vy) || 1;
    const ns = Math.min(3300, s * 1.12 + 220);
    b.vx *= ns / s; b.vy *= ns / s;
    this.immuneT = 0.45;
    g.addScore(20000 * this.lvl, SG.cx, SG.cy - 110, 'FRONDE');
    g.sfx('sgFronde');
    g.say('sgFronde');
    const name = best !== null ? ORBITS[best].name.toLowerCase() : null;
    g.banner('FRONDE GRAVITATIONNELLE', name ? `Orbite ${name} récoltée : +${gained} cellule${gained > 1 ? 's' : ''}` : `+${gained} cellules`, '#ffffff', 2, 'banner', { color: AMBER });
    g.fx.flash('#ffe2b0', 0.22);
    g.fx.shake(6);
    this.shock.push({ t: 0, life: 0.7, r0: 40, r1: 300, color: '#ffffff' });
    this.art.fronde(b);
  }

  // ------------------------------------------------------------ stabilisation
  _stabilize() {
    if (this.phase !== 'harvest') return;
    const g = this.game;
    this.phase = 'stabilize';
    this.round = PALIERS;
    this.alert = 2;
    for (const c of this.cells) if (c.on) { c.on = false; c.collapse = 1; }
    this.timeLeft = Math.max(this.timeLeft + 8, 18);
    this.timeLimit = Math.max(this.timeLimit, this.timeLeft);
    this.hurried = this.timeLeft < 10;
    this.setBarrier(3);
    g.sfx('sgStabilize');
    g.say('sgStabilize');
    const sub = this.hitsNeed > 1 ? `Frappez la singularité ${this.hitsNeed} fois : refermez-la ! (+8 s)` : 'Frappez la singularité : refermez-la ! (+8 s)';
    g.banner('STABILISATION', sub, AMBER, 2.4, 'minigame');
    g.fx.flash(AMBER, 0.25);
    g.fx.shake(7);
    this.shock.push({ t: 0, life: 1, r0: 300, r1: 20, color: AMBER });
  }

  _ringHit(b, ux, uy) {
    if (this.state !== 'play' || this.phase !== 'stabilize') return;
    const g = this.game;
    this.hits++;
    this._sweepReset();
    this.art.ringHit(b);
    if (this.hits >= this.hitsNeed) { this._implode(b); return; }
    // frappe intermédiaire : onde de choc, la bille est renvoyée vers les batteurs
    g.addScore(25000 * this.lvl, SG.cx, SG.cy - 90, 'CONFINEMENT');
    g.sfx('sgRing', this.hits);
    g.say('sgRingHit', { n: this.hits, m: this.hitsNeed });
    g.fx.shake(6);
    g.fx.flash('#ffffff', 0.2);
    this.shock.push({ t: 0, life: 0.6, r0: SG.RING, r1: 240, color: '#ffffff' });
    const side = b.x < SG.cx ? -1 : 1;
    b.state = 'held';
    this.capture = { t: 0.42, r0: 0, a0: 0, spin: 1, side, done: false, safe: true };
    b.x = SG.cx; b.y = SG.cy; b.scale = 0.2; b.alpha = 0.4;
  }

  _implode(b) {
    const g = this.game;
    this.phase = 'outro';
    this.state = 'outro';
    this.outroT = 0;
    b.state = 'held'; b.vx = b.vy = 0;
    this.capture = null;
    this.outroFrom = { x: b.x, y: b.y };
    g.addScore(50000 * this.lvl, SG.cx, SG.cy - 120, 'SINGULARITÉ REFERMÉE');
    g.sfx('sgImplode');
    g.say('sgImplode');
    g.fx.shake(10);
    this.art.implode();
  }

  _updateOutro(dt) {
    const b = this.ball;
    this.outroT += dt;
    const u = Math.min(1, this.outroT / 0.35);
    if (b) {
      // la bille est aspirée au centre, puis rejaillit, brûlante, quand le trou se referme
      if (this.outroT < 0.35) {
        b.x = lerp(this.outroFrom.x, SG.cx, u); b.y = lerp(this.outroFrom.y, SG.cy, u);
        b.scale = 1 - 0.7 * u;
      } else if (this.outroT < 1.25) { b.x = SG.cx; b.y = SG.cy; b.scale = 0.3; }
      else { b.scale = Math.min(1, 0.3 + (this.outroT - 1.25) * 4); }
    }
    if (this.outroT >= 1.25 && !this.outroFlash) {
      this.outroFlash = true;
      const g = this.game;
      g.fx.flash('#ffffff', 0.55);
      g.fx.shake(12);
      for (let i = 0; i < 4; i++) g.fx.ring(SG.cx, SG.cy, i % 2 ? '#ffffff' : AMBER, 90 + i * 70, 0.9);
      g.fx.burst(SG.cx, SG.cy, AMBER, 40, 520);
      g.fx.burst(SG.cx, SG.cy, '#ffffff', 16, 380);
    }
    if (this.outroT >= 1.5) {
      if (b) { b.scale = 1; b.alpha = 1; }
      this.state = 'play';
      this.finish(true, 'stabilized');
    }
  }

  // ------------------------------------------------------------ boucle
  arenaStep(dt) {
    for (let i = this.timers.length - 1; i >= 0; i--) {
      const tm = this.timers[i];
      tm.t -= dt;
      if (tm.t <= 0) { this.timers.splice(i, 1); if (this.state !== 'ended') tm.fn(); }
    }
    if (this.state === 'ended') return;
    if (this.confineT > 0) this.confineT -= dt;
    if (this.immuneT > 0) this.immuneT -= dt;
    if (this.comboT > 0) { this.comboT -= dt; if (this.comboT <= 0) this.combo = 0; }
    this.alert = Math.max(0, this.alert - dt);
    // croissance (lissée) : horizon et attraction
    const target = this.phase === 'harvest' ? this.harvest / this.need : 1;
    this.gVis += (target - this.gVis) * Math.min(1, dt * 2.5);
    this.rH = lerp(SG.rH0, SG.rH1, this.gVis);
    if (this.phase === 'stabilize') this.ringR = Math.min(SG.RING, this.ringR + dt * 120);
    let k = this.massK * (0.82 + 0.3 * this.gVis);
    if (this.confineT > 0) k *= 0.55;
    if (this.satT > 0) { this.satT -= dt; k *= 0.12; }
    this.fieldK = k;
    this._placeCells(this.state === 'relaunch' ? dt * 0.3 : dt);
    for (const c of this.cells) {
      if (c.flash > 0) c.flash = Math.max(0, c.flash - dt * 3);
      if (c.collapse > 0) c.collapse = Math.max(0, c.collapse - dt * 1.4);
      if (c.on) { if (c.spawn < 1) c.spawn = Math.min(1, c.spawn + dt * 2.2); }
      else if (this.phase === 'harvest' && c.respawnT > 0) {
        c.respawnT -= dt;
        if (c.respawnT <= 0) { c.on = true; c.spawn = 0; this.game.sfx('sgSpawn', this._pan(c.x)); }
      }
    }
    if (this.capture) this._updateCapture(dt);
    if (this.phase === 'outro') this._updateOutro(dt);
    if (this.state === 'ended') return;
    // bille recrachée : réapparition
    const b = this.ball;
    if (b && this.popT > 0 && b.state === 'free') { this.popT -= dt; b.scale = Math.min(1, 1 - this.popT / 0.22 * 0.6); if (this.popT <= 0) b.scale = 1; }
    this._antiOrbit(dt);
    this.minRT += dt;
    if (this.minRT > 0.25) { this.lastMinR = this.minR; this.minR = 999; this.minRT = 0; }
    this.art.update(dt);
    // musique : plus intense à mesure que la singularité grossit
    this.intensity = this.phase === 'harvest' ? 0.7 + 0.2 * this.gVis : 0.95;
  }

  // garde-fous : la bille ne reste jamais indéfiniment dans le champ
  _antiOrbit(dt) {
    const b = this.ball;
    if (!b || b.state !== 'free' || this.state !== 'play') { this.fieldT = 0; this.upT = 0; return; }
    const r = Math.hypot(b.x - SG.cx, b.y - SG.cy);
    if (r < SG.RF0) this.fieldT += dt; else this.fieldT = Math.max(0, this.fieldT - dt * 2);
    if (b.y > 740) this.upT = 0; else this.upT += dt;
    if (this.satT <= 0 && (this.fieldT > 3.2 || this.upT > 7)) {
      this.satT = 1.4;
      this.fieldT = 0; this.upT = 0;
      this.saturations++;
      this._sweepReset();
      this.game.sfx('sgSaturate');
      this.game.say('sgSaturate');
    }
  }

  afterStep(dt) {
    const b = this.ball;
    // récolte : segment parcouru pendant le pas contre chaque cellule (aucun passage manqué)
    if (b && b.state === 'free' && this.phase === 'harvest' && this.state === 'play') {
      const x0 = b.px, y0 = b.py, ex = b.x - x0, ey = b.y - y0, l2 = ex * ex + ey * ey || 1e-9;
      const R2 = SG.PICK * SG.PICK;
      for (const c of this.cells) {
        if (!c.on || c.spawn < 0.35) continue;
        let t = ((c.x - x0) * ex + (c.y - y0) * ey) / l2;
        t = t < 0 ? 0 : t > 1 ? 1 : t;
        const qx = x0 + ex * t - c.x, qy = y0 + ey * t - c.y;
        if (qx * qx + qy * qy < R2) this._collect(c, 'ball');
        if (this.phase !== 'harvest') break;
      }
    }
    this._vibrate(dt);
    this._antiStuck(dt);
  }

  // vibration du réacteur : une bille presque arrêtée hors des batteurs (en équilibre pile sur le
  // sommet d'un poteau, par exemple) reçoit une petite secousse vers le centre au bout de 0,35 s
  _vibrate(dt) {
    const b = this.ball;
    if (!b || b.state !== 'free' || this.state !== 'play') { this.slowT = 0; return; }
    const f = this.frame;
    const held = b.y > 860 && (f.flipL.pressed || f.flipR.pressed);   // bille tenue sur un batteur
    if (held || b.vx * b.vx + b.vy * b.vy > 25 * 25) { this.slowT = 0; return; }
    this.slowT = (this.slowT || 0) + dt;
    if (this.slowT > 0.35) {
      this.slowT = 0;
      this.nudges = (this.nudges || 0) + 1;
      b.vx += (b.x < SG.cx ? 1 : -1) * 150; b.vy -= 80;
    }
  }

  // anti-blocage (filet de sécurité) : bille immobile, ou qui se traîne, hors des batteurs = petite poussée
  _antiStuck(dt) {
    const b = this.ball, S = this.stk;
    if (!b || b.state !== 'free' || this.state !== 'play') { S.t = 0; S.slow = 0; return; }
    const f = this.frame;
    const cradle = b.y > 860 && (f.flipL.pressed || f.flipR.pressed);
    if (!cradle && Math.abs(b.x - S.x) < 5 && Math.abs(b.y - S.y) < 5) S.t += dt;
    else { S.x = b.x; S.y = b.y; S.t = 0; }
    const sp = Math.hypot(b.vx, b.vy);
    if (b.y < 860 && sp < 100) S.slow += dt; else if (sp > 250 || b.y >= 860) S.slow = 0;
    if (S.t > 1.5 || S.slow > 2.5) {
      S.t = 0; S.slow = 0;
      this.unstuck++;
      b.vx = rand(-280, 280); b.vy = -420;
      this.game.say('stuck');
    }
  }

  _pan(x) { return clamp((x - SG.cx) / SG.cx, -1, 1); }

  // ------------------------------------------------------------ cycle de vie
  resetCombos() { this.combo = 0; this.comboT = 0; this._sweepReset(); }

  prepareRelaunch(ball) {
    super.prepareRelaunch(ball);
    ball.scale = 1; ball.alpha = 1;
    this.capture = null;
    this._sweepReset();
  }

  // paliers sécurisés : rendus à la tentative suivante
  keepProgress() {
    const r = Math.min(this.round, PALIERS - 1);
    return r > 0 ? { round: r, cells: Math.round(r * this.stage) } : null;
  }

  results(success) {
    const rewards = [{ type: 'shield' }, { type: 'bumper' }];
    if (this.frondes > 0) rewards.push({ type: 'mult' });
    return {
      rewards: success ? rewards : [],
      points: success ? 30000 * this.lvl + Math.round(this.timeLeft) * 800 + this.frondes * 10000 * this.lvl : 0,
    };
  }

  progressText() {
    if (this.phase === 'harvest') {
      const f = this.frondes ? ` · fronde ×${this.frondes}` : '';
      return `Cellules ${Math.floor(this.harvest)}/${this.need}${f}`;
    }
    if (this.hitsNeed > 1) return `STABILISATION · confinement ${Math.min(this.hits, this.hitsNeed)}/${this.hitsNeed}`;
    return 'STABILISATION · frappez la singularité';
  }

  // ------------------------------------------------------------ rendu
  drawStatic(g, r) { this.art.drawStatic(g, r); }
  renderArena(ctx, r) { this.art.renderArena(ctx, r); }
  renderTop(ctx, r) { this.art.renderTop(ctx, r); }
}
