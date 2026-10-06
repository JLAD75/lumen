import { FlipperArena } from './arena.js';
import { addLines } from '../game/lumen.js';
import { rand, clamp } from '../util/math.js';
import { BG, drawBugsStatic, renderBugs, renderBugsTop } from './bugsArt.js';

// CHASSE AUX BUGS — secteur SERVEURS.
// La salle des serveurs de NULL : 9 trappes en quinconce (2, 3, puis 4 par rangée) dans le
// haut de l'arène. Des bugs surgissent d'une trappe (qui clignote d'abord une demi-seconde),
// restent visibles un court instant puis repartent : on les écrase avec la bille.
// - Bug normal : un coup. Blindé : deux coups (la carapace se fissure). Doré : rare, rapide,
//   compte pour trois. Ver : écrasé, il se divise en deux petits bugs dans les trappes voisines.
// - Combo : un bug écrasé moins de 3 s après le précédent fait monter le multiplicateur de
//   points (×2… ×5).
// - Paliers : tous les 5 bugs, la progression est acquise (rendue à la tentative suivante).
// - Victoire : la purge (les bugs encore visibles explosent), puis retour au plateau.
const { TRAPS, TRAP_R } = BG;
const PINK = '#ff6ab4', GOLD = '#ffd84a', LIME = '#7dff4f', RED = '#ff3d6e';
const COMBO_WINDOW = 3;
const STEP = 5;                       // taille d'un palier
// rayon physique et facteur d'exposition de chaque espèce
const KINDS = {
  normal: { r: 20, life: 1, pts: 1 },
  armor: { r: 21, life: 1.15, pts: 1.5 },
  gold: { r: 17, life: 0.6, pts: 5 },
  worm: { r: 20, life: 1, pts: 1.5 },
  mini: { r: 14, life: 0.75, pts: 0.6 },
};

// Réglages par niveau (cycle)
export function bugsTuning(lvl) {
  const k = Math.max(0, lvl - 1);
  return {
    target: Math.min(21, 13 + 2 * k),
    time: 75,
    expo: Math.max(1.7, [2.8, 2.5, 2.25][Math.min(2, k)] - 0.15 * Math.max(0, k - 2)),   // s
    armor: Math.min(0.35, 0.12 + 0.08 * k),
    conc0: 2,                           // bugs simultanés au départ
  };
}

addLines({
  enter_bugs: { pri: 4, cd: 0, v: [
    'Salle des serveurs. NULL y élève des bugs. Écrasez-les avant qu\'ils ne replongent.',
    'Infestation détectée. Les trappes clignotent avant chaque sortie : soyez prêt.',
  ] },
  bugKept: { pri: 3, cd: 0, v: ['Palier conservé : {n} bugs déjà écrasés.'] },
  bugPalier: { pri: 2, cd: 0, v: ['Palier acquis : {n} bugs.', 'Encore un palier. Les serveurs respirent.'] },
  bugCombo: { pri: 3, cd: 4, v: ['Combo ×5 ! Vous écrasez plus vite qu\'ils ne compilent.', 'Combo maximal. NULL recompile en panique.'] },
  bugGold: { pri: 3, cd: 3, v: ['Bug doré ! Il en vaut trois.', 'Doré, écrasé. Mes compteurs applaudissent.'] },
  bugWorm: { pri: 2, cd: 6, v: ['Un ver ! Il s\'est dupliqué, attention.', 'Le ver se divise. Deux de plus.'] },
  bugArmor: { pri: 1, cd: 8, v: ['Carapace fissurée. Encore un coup.', 'Blindé. Frappez-le une seconde fois.'] },
  bugLast: { pri: 3, cd: 0, v: ['Plus qu\'un bug. Un seul !', 'Dernier bug. Finissons-en.'] },
  bugWin: { pri: 4, cd: 0, v: ['Purge terminée. Système nettoyé.', 'Serveurs propres. NULL va devoir réécrire tout son code.'] },
  bugEscape: { persona: 'null', pri: 2, cd: 9, v: ['TROP LENT. MES BUGS SONT ÉTERNELS.', 'RATÉ. LA CORRUPTION SE PROPAGE.'] },
});

export class BugsGame extends FlipperArena {
  constructor(game, opts) {
    const lvl = opts.level || 1;
    const T = bugsTuning(lvl);
    super(game, opts, {
      gravity: 2000,
      time: T.time,
      title: 'CHASSE AUX BUGS',
      objective: `Écrasez ${T.target} bugs avant qu'ils ne replongent`,
      music: 'bugs',
      perk: { name: 'Ralenti', desc: 'Les bugs restent deux fois plus longtemps pendant 10 s' },
    });
    this.T = T;
    this.target = T.target;
    this.count = 0;               // bugs comptés (conservés compris)
    this.squashed = 0;            // bugs écrasés pendant cette tentative
    this.escaped = 0;
    this.golds = 0; this.worms = 0; this.armorHits = 0;
    this.combo = 0; this.comboT = 0; this.comboMax = 0; this.bestCombo = 0;
    this.spawnCd = 0.8;
    this.purge = null;
    this.callout = null;
    this.splats = [];
    this.stk = { x: 0, y: 0, t: 0, slow: 0 };
    this._build();
    const kept = clamp((this.kept && this.kept.count) || 0, 0, this.target - 1);
    this.count = kept;
    this.keptStart = kept;
    this.palier = Math.floor(kept / STEP);
    this.world.build();
  }

  _build() {
    this.traps = TRAPS.map(([x, y], i) => {
      const P = { i, x, y, state: 'idle', t: 0, cool: rand(0, 0.5), bug: null, hitCd: 0, flash: 0 };
      P.p = this.world.circle(x, y, KINDS.normal.r, { mat: 'rubber', e: 0.7, kick: 120, kickMin: 60, kickCooldown: 0.1, dynamic: true, enabled: false, style: 'none' });
      P.p.pierceable = true;          // le noyau phasique traverse et écrase
      P.p.onHit = (b, imp) => this._hit(P, b, imp);
      return P;
    });
  }

  begin(ball) {
    super.begin(ball);
    if (this.keptStart > 0) this.game.later(3.6, () => { if (this.state === 'play') this.game.say('bugKept', { n: this.keptStart }); });
  }

  applyPerk() { this.perkT = 10; }

  // ------------------------------------------------------------ boucle
  arenaStep(dt) {
    if (this.purge) {
      this._updatePurge(dt);
      if (this.state === 'play') this.timeLeft = Math.min(this.timeLimit, this.timeLeft + dt);   // chrono gelé
    }
    if (this.state === 'ended') return;
    if (this.comboT > 0) { this.comboT -= dt; if (this.comboT <= 0) this.combo = 0; }
    this._updateTraps(dt);
    if (!this.purge) this._spawn(dt);
    for (let i = this.splats.length - 1; i >= 0; i--) { this.splats[i].t += dt; if (this.splats[i].t > 0.9) this.splats.splice(i, 1); }
    if (this.callout) { this.callout.t += dt; if (this.callout.t >= this.callout.life) this.callout = null; }
    this.intensity = 0.72 + 0.2 * (this.count / this.target) + (this.combo >= 3 ? 0.06 : 0);
  }

  // anti-blocage (comme les autres arènes) : bille immobile hors des batteurs = petite poussée
  afterStep(dt) {
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
      b.vx = rand(-280, 280); b.vy = -420;
      this.game.say('stuck');
    }
  }

  // nombre de bugs visibles visé : monte avec le temps et le score
  _conc() {
    const el = this.time, n = this.squashed;
    let c = this.T.conc0;
    if (el > 10 || n >= 4) c++;
    if (el > 30 || n >= 9) c++;
    return Math.min(4, c);
  }

  _active() { return this.traps.filter(P => P.state === 'warn' || P.state === 'up').length; }

  _spawn(dt) {
    this.spawnCd -= dt;
    if (this.spawnCd > 0 || this._active() >= this._conc()) return;
    const b = this.ball;
    // trappes libres, en évitant celle que la bille touche presque (sortie injouable)
    const free = this.traps.filter(P => P.state === 'idle' && P.cool <= 0 && !(b && Math.hypot(b.x - P.x, b.y - P.y) < TRAP_R + 30));
    if (!free.length) return;
    const P = free[Math.floor(Math.random() * free.length)];
    this._warn(P, this._pickKind(), 0.5);
    this.spawnCd = rand(0.55, 1.05);
  }

  _pickKind() {
    const left = this.target - this.count;
    const gold = this.traps.some(P => P.bug && P.bug.kind === 'gold');
    const r = Math.random();
    if (!gold && this.squashed >= 3 && r < 0.07) return 'gold';
    if (left >= 3 && r < 0.19) return 'worm';
    if (r < 0.19 + this.T.armor) return 'armor';
    return 'normal';
  }

  _warn(P, kind, dur) {
    P.state = 'warn'; P.t = 0; P.dur = dur;
    P.bug = { kind, hp: kind === 'armor' ? 2 : 1, life: 0, age: 0, crack: 0, seed: Math.random() * 100 };
    this.game.sfx('bugWarn', (P.x - BG.CX) / BG.CX);
  }

  _life(kind) {
    return this.T.expo * KINDS[kind].life * (this.perkT > 0 ? 2 : 1);
  }

  _updateTraps(dt) {
    const g = this.game;
    for (const P of this.traps) {
      P.t += dt;
      P.flash = Math.max(0, P.flash - dt * 3);
      if (P.hitCd > 0) P.hitCd -= dt;
      if (P.state === 'idle') { if (P.cool > 0) P.cool -= dt; continue; }
      if (P.state === 'warn' && P.t >= P.dur) {
        // sortie : le bug devient une cible solide (sauf si la bille est dessus)
        const b = this.ball;
        if (b && b.state === 'free' && Math.hypot(b.x - P.x, b.y - P.y) < KINDS[P.bug.kind].r + b.r + 2) { P.t = P.dur - 0.1; continue; }
        P.state = 'up'; P.t = 0;
        P.bug.life = this._life(P.bug.kind);
        P.p.r = KINDS[P.bug.kind].r;
        P.p.enabled = true;
        g.sfx('bugUp', (P.x - BG.CX) / BG.CX, P.bug.kind);
      } else if (P.state === 'up') {
        P.bug.age += dt;
        if (P.t >= P.bug.life) {
          // il replonge
          P.state = 'down'; P.t = 0; P.p.enabled = false;
          if (!this.purge) {
            this.escaped++;
            g.sfx('bugEscape', (P.x - BG.CX) / BG.CX);
            if (this.escaped % 3 === 0) g.say('bugEscape');
          }
        }
      } else if (P.state === 'down' && P.t >= 0.2) {
        P.state = 'idle'; P.bug = null; P.cool = 0.6;
      } else if (P.state === 'squash' && P.t >= 0.35) {
        P.state = 'idle'; P.bug = null; P.cool = 0.8;
      }
    }
  }

  // ------------------------------------------------------------ coups
  _hit(P, b, imp) {
    if (this.state !== 'play' || this.purge || P.state !== 'up' || P.hitCd > 0 || imp < 40) return;
    P.hitCd = 0.15;
    const g = this.game, bug = P.bug;
    if (bug.kind === 'armor' && bug.hp > 1) {
      bug.hp--; bug.crack = 1;
      bug.life = Math.max(bug.life, P.t + 0.6);      // le temps de reprendre la visée
      P.flash = 1;
      this.armorHits++;
      g.sfx('bugArmor', (P.x - BG.CX) / BG.CX);
      g.fx.burst(P.x, P.y, '#cfd8ea', 8, 260);
      g.fx.text(P.x, P.y - 34, 'FISSURÉ', '#cfd8ea', 0.8);
      g.addScore(1000 * this.level, P.x, P.y + 40);
      g.say('bugArmor');
      return;
    }
    this._squash(P, b);
  }

  _squash(P, b) {
    const g = this.game, bug = P.bug, kind = bug.kind;
    P.state = 'squash'; P.t = 0; P.p.enabled = false; P.flash = 1;
    const worth = kind === 'gold' ? 3 : 1;
    this.count = Math.min(this.target, this.count + worth);
    this.squashed++;
    // combo
    this.combo = this.comboT > 0 ? this.combo + 1 : 1;
    this.comboT = COMBO_WINDOW;
    const mult = Math.min(5, this.combo);
    this.bestCombo = Math.max(this.bestCombo, mult);
    if (mult >= 5 && !this.comboMax) { this.comboMax = 1; g.say('bugCombo'); g.dmd('banner', { title: 'COMBO ×5', sub: 'Multiplicateur gagné', color: PINK }); }
    const pts = Math.round(3000 * KINDS[kind].pts) * this.level * mult;
    g.addScore(pts, P.x, P.y + 44, mult > 1 ? `COMBO ×${mult}` : null);
    const col = kind === 'gold' ? GOLD : kind === 'armor' ? '#cfd8ea' : kind === 'worm' ? '#c77dff' : LIME;
    this.splats.push({ x: P.x, y: P.y, t: 0, col, r: KINDS[kind].r * 1.5, seed: Math.random() * 100 });
    g.fx.burst(P.x, P.y, col, kind === 'gold' ? 22 : 12, 300);
    g.fx.burst(P.x, P.y, '#ffffff', 5, 200);
    g.fx.ring(P.x, P.y, col, 44, 0.35);
    g.fx.shake(kind === 'gold' ? 4 : 2);
    g.sfx('bugSquash', (P.x - BG.CX) / BG.CX, mult);
    if (mult >= 2) g.sfx('bugCombo', mult);
    if (kind === 'gold') {
      this.golds++;
      g.sfx('bugGold');
      g.fx.text(P.x, P.y - 34, 'DORÉ ×3', GOLD, 1.1);
      g.say('bugGold');
    } else if (mult >= 2) g.fx.text(P.x, P.y - 34, `×${mult}`, PINK, 0.8 + 0.08 * mult);
    if (kind === 'worm') this._split(P);
    // paliers et victoire
    const pal = Math.floor(this.count / STEP);
    if (this.count >= this.target) { this._startPurge(); return; }
    if (pal > this.palier) {
      this.palier = pal;
      g.sfx('bugPalier');
      g.banner('PALIER ACQUIS', `${this.count} / ${this.target} bugs — progression conservée`, PINK, 1.4);
      g.say('bugPalier', { n: this.count });
      this.callout = { text: 'PALIER', sub: `${this.count} / ${this.target}`, color: PINK, t: 0, life: 1.1 };
    } else if (this.target - this.count === 1) g.say('bugLast');
  }

  // le ver se divise : deux petits bugs dans les trappes libres les plus proches
  _split(P) {
    this.worms++;
    const near = this.traps.filter(Q => Q !== P && Q.state === 'idle')
      .sort((a, c) => Math.hypot(a.x - P.x, a.y - P.y) - Math.hypot(c.x - P.x, c.y - P.y)).slice(0, 2);
    for (const Q of near) { Q.cool = 0; this._warn(Q, 'mini', 0.3); }
    if (near.length) { this.game.sfx('bugSplit'); this.game.say('bugWorm'); }
  }

  // ------------------------------------------------------------ purge (victoire)
  _startPurge() {
    const g = this.game;
    this.purge = { t: 0, next: 0.12, done: false, pops: this.traps.filter(P => P.state === 'up' || P.state === 'warn') };
    g.sfx('bugPurge');
    g.slowT = Math.max(g.slowT, 0.6);
    g.fx.flash(PINK, 0.3);
    g.say('bugWin');
    g.banner('PURGE !', 'Système nettoyé', PINK, 1.6);
    this.callout = { text: 'PURGE !', sub: 'SYSTÈME NETTOYÉ', color: PINK, t: 0, life: 1.8 };
    if (g.renderer && g.renderer.pulse) g.renderer.pulse(PINK, 1.3);
  }

  _updatePurge(dt) {
    const U = this.purge, g = this.game;
    U.t += dt;
    // les bugs restants explosent un par un
    while (U.pops.length && U.t >= U.next) {
      U.next += 0.15;
      const P = U.pops.shift();
      if (P.state === 'up' || P.state === 'warn') {
        P.state = 'squash'; P.t = 0; P.p.enabled = false;
        g.fx.burst(P.x, P.y, PINK, 14, 320);
        g.fx.ring(P.x, P.y, '#ffffff', 50, 0.4);
        g.addScore(2000 * this.level, P.x, P.y + 40);
        g.sfx('bugSquash', (P.x - BG.CX) / BG.CX, 1);
      }
    }
    if (U.t >= 1.4 && !U.done) { U.done = true; this.finish(true, 'purge'); }
  }

  onTimeout() {
    if (this.purge) { this.timeLeft = 0.02; return; }
    super.onTimeout();
  }

  // ------------------------------------------------------------ fin et progression
  keepProgress() { return { count: Math.min(this.target - 1, Math.floor(this.count / STEP) * STEP) }; }

  results(success) {
    const rewards = [{ type: 'phase' }];
    if (this.comboMax) rewards.push({ type: 'mult' });
    return {
      rewards: success ? rewards : [],
      points: success ? (30000 + Math.round(this.timeLeft) * 1200) * this.level : 0,
    };
  }

  progressText() {
    const c = this.combo >= 2 && this.comboT > 0 ? ` · COMBO ×${Math.min(5, this.combo)}` : '';
    return `Bugs ${this.count}/${this.target}${c}`;
  }

  debugWin() { this.count = this.target; this._startPurge(); }

  // ------------------------------------------------------------ rendu
  drawStatic(g, r) { drawBugsStatic(g, r, this); }
  renderArena(ctx, r) { renderBugs(ctx, r, this); }
  renderTop(ctx, r) { renderBugsTop(ctx, r, this); }
}
