import { FlipperArena } from './arena.js';
import { addLines } from '../game/lumen.js';
import { rand, clamp, TAU, wrapAngle, fmt } from '../util/math.js';
import { VC, CORE_R, PLATE_R, RING_GEO, VAULTS, drawVaultStatic, renderVault, renderVaultTop } from './vaultArt.js';

// BRAQUAGE DU COFFRE — secteur COFFRE.
// Arène à batteurs : le coffre-fort crypto de NULL trône au centre de l'arène. Un NOYAU
// entouré de 2 ou 3 anneaux blindés qui tournent en sens alternés, percés de brèches.
// Chaque impact fissure une plaque, le second l'arrache (un tir puissant l'arrache d'un coup) ;
// une plaque arrachée fissure ses voisines (éclats). Franchir l'anneau intérieur (carré) =
// entrer dans le champ du noyau = COFFRE PERCÉ : le coffre explose et crache lingots et
// crédits à ramasser avec la bille (filet anti-chute pendant la pluie de butin, +5 s), puis
// le coffre suivant se met en place (ALPHA, BÊTA, OMÉGA à 3 anneaux). 3 coffres à percer.
// ALIGNEMENT : quand les brèches de tous les anneaux s'alignent face aux batteurs, un laser
// de visée s'allume ; percer le noyau par cet axe = JACKPOT (butin doublé).
// Avantage d'entrée : perceuse thermique (blindage du premier coffre pré-fissuré).
// Niveaux suivants : anneaux plus rapides, blindage extérieur renforcé, une brèche de moins.
//
// Sûreté physique : entre deux anneaux, l'espace libre dépasse le diamètre de la bille
// (elle ne touche jamais deux anneaux à la fois : aucun pincement entre pièces mobiles) ;
// entre le noyau et l'anneau intérieur, il est plus petit que la bille (la bille ne peut
// pas s'y loger : toute bille qui franchit l'anneau intérieur perce le coffre). Une bille
// qui reste dans le coffre plus de TRAP_T secondes force le blindage sous elle (sortie
// garantie). Vitesse de surface des anneaux < 120 u/s (aucune plaque ne traverse la bille).

const GOLD = '#ffd84a';
const BALL_R = 13;
const HEAVY = 1000;           // impact « lourd » : 2 dégâts (plaque arrachée d'un coup)
const MIN_IMPACT = 110;       // en dessous : simple contact, sans dégât
const CONE = 0.28;            // demi-angle du cône d'alignement (axe noyau → batteurs)
const ALIGN_GRACE = 0.3;      // tolérance après la fin d'un alignement (s)
const JACK_SPREAD = 0.45;     // la bille doit arriver par l'axe du laser (écart angulaire max, rad)
const TRAP_T = 0.7;           // bille enfermée : forçage de la plaque (s)
const BUILD_T = 1.15;         // assemblage d'un coffre (s)
const OPEN_T = 1.7;           // coffre ouvert avant l'arrivée du suivant (s)
const FINAL_T = 4.2;          // ramassage du butin après le dernier coffre (s)
const TIME_BONUS = 5;         // secondes rendues à chaque coffre percé
const LOOT_NET = 5;           // filet anti-chute après un perçage (s)
const LOOT_LIFE = 8.5;
const MAX_DEBRIS = 70;

addLines({
  enter_vault: { pri: 4, cd: 0, v: [
    'Coffre-fort de NULL. Visez les brèches, touchez le noyau. Trois coffres à vider.',
    'Salle des coffres. Le blindage tourne, les brèches aussi. Percez trois noyaux.',
  ] },
  vaultBreak: { pri: 1, cd: 6, v: ['Plaque arrachée. Le blindage cède.', 'Nouvelle brèche. Continuez à cogner.', 'Le blindage se fissure. J\'adore ce bruit.'] },
  vaultPierce: { pri: 3, cd: 0, v: ['Coffre percé ! Ramassez le butin.', 'Noyau fracturé. Ça brille : prenez tout.', 'Coffre ouvert. NULL vient de perdre ses économies.'] },
  vaultNext: { pri: 2, cd: 0, v: ['{name} en place. Le blindage tourne plus vite.', 'Coffre suivant : {name}. Même méthode, plus de blindage.'] },
  vaultLast: { pri: 3, cd: 0, v: ['Dernier coffre : {name}. Trois anneaux. Le gros lot est derrière.'] },
  vaultAlign: { pri: 1, cd: 12, v: ['Brèches alignées : tirez dans l\'axe !', 'Alignement ! C\'est le moment de viser le noyau.'] },
  vaultJackpot: { pri: 4, cd: 0, v: ['Jackpot ! Tir dans l\'axe, butin doublé.', 'JACKPOT. Je n\'ai rien vu. Rien entendu.'] },
  vaultForce: { pri: 1, cd: 9, v: ['Le noyau force le blindage. La persévérance paie.', 'Coincé dans le coffre ? Je perce une sortie.'] },
  vaultLoot: { pri: 1, cd: 9, v: ['Butin : {loot} crédits. NULL va devoir déclarer ça.', '{loot} crédits empochés. Je tiens les comptes.'] },
  vaultWin: { pri: 4, cd: 0, v: ['Trois coffres vidés. NULL est ruiné. Moi, je jubile.', 'Braquage parfait. Je réinvestis tout dans votre multiplicateur.'] },
  vaultExposed: { pri: 2, cd: 8, v: ['Anneau intérieur arraché : le noyau est à nu !', 'Plus rien autour du noyau. Un tir et c\'est plié.'] },
});

// rayon du champ du noyau (centre de la bille) pour un anneau intérieur donné
export function coreField(ring) {
  if (!ring) return CORE_R + BALL_R + 1.5;
  return ring.R * Math.cos(Math.PI / ring.n) + PLATE_R + BALL_R - 3;
}

export class VaultGame extends FlipperArena {
  constructor(game, opts) {
    const lvl = opts.level || 1;
    super(game, opts, {
      gravity: 2000,
      time: lvl >= 3 ? 85 : 90,
      title: 'BRAQUAGE DU COFFRE',
      objective: 'Visez les brèches, touchez le noyau — 3 coffres',
      music: 'vault',
      perk: { name: 'Perceuse thermique', desc: 'Blindage du premier coffre pré-fissuré : un impact suffit' },
    });
    this.speedK = Math.min(1.6, 1 + (lvl - 1) * 0.15);
    // coffres percés lors d'une tentative précédente (jamais le dernier)
    this.cracked = clamp((this.kept && this.kept.vaults) || 0, 0, VAULTS.length - 1);
    this.startCracked = this.cracked;
    this.rings = [];
    this.pool = [];               // segments de plaques réutilisés (jamais retirés du monde)
    this.loot = [];
    this.debris = [];
    this.timers = [];
    this.lootTotal = 0;           // butin ramassé (points)
    this.lootShown = 0;           // compteur affiché (défilement)
    this.lootChain = 0; this.lootChainT = 0;
    this.phase = 'build';         // build | armed | open
    this.phaseT = 0;
    this.vIdx = 0; this.vdef = null;
    this.aligned = null;          // { a, w } : axe de visée libre (angle, largeur)
    this.alignT = 0;
    this.alignK = 0;              // fondu du laser
    this.alignCount = 0;
    this.alignA = Math.PI / 2;   // dernier axe aligné (jackpot pendant la tolérance)
    this.trapT = 0;
    this.grindT = 0;
    this.coreFlash = 0;
    this.pierceFx = 0;            // éclair du perçage (rendu)
    this.alarmT = 0;              // gyrophares (assemblage d'un coffre)
    this.won = false;
    this.jackpotFx = 0;
    // statistiques (tests, résultats)
    this.breaks = 0; this.hits = 0; this.forced = 0; this.jackpots = 0; this.pierces = 0;
    this.lootPicked = 0; this.lootSpawned = 0; this.unstuck = 0; this.coreHits = 0;
    this.stk = { x: 0, y: 0, t: 0, slow: 0 };
    this.noUnstick = false;       // tests : désactive la poussée anti-blocage générique
    this.shrapnel = true;         // éclats : une plaque arrachée fissure ses voisines
    this.intensity = 0.74;
    // noyau (le cœur du coffre)
    this.core = this.world.circle(VC.x, VC.y, CORE_R, { mat: 'energy', e: 0.75, kick: 240, kickMin: 40, kickCooldown: 0.1, dynamic: true, enabled: false, style: 'vaultCore' });
    this.core.onHit = (b) => this._hitCore(b);
    // poteaux en tête des couloirs de retour (cadre commun) : sans frottement dans cette arène,
    // une bille tombée pile dessus en glisse au lieu d'y rester posée (recensement des blocages)
    for (const p of this.world.statics) if (p.kind === 'circle' && p.style === 'post' && p.y > 700) p.mu = 0;
    this._buildVault(this.cracked, true);
    this.world.build();
  }

  entryPoint() { return { x: 281, y: 700 }; }

  begin(ball) {
    super.begin(ball);
    this.game.sfx('vaultAssemble', this.rings.length);
  }

  // Perceuse thermique : toutes les plaques du premier coffre sont déjà fissurées.
  applyPerk() {
    this.perkT = 10;
    for (const ring of this.rings) for (const pl of ring.plates) if (pl.alive) { pl.hp = 1; this._crack(pl, 2); }
    this.drillFx = 1.2;
  }

  // ------------------------------------------------------------ coffres
  outerR() { const r = this.rings[this.rings.length - 1]; return r ? r.R : 0; }

  _prim() {
    const p = this.pool.pop() || this.world.seg(0, -600, 1, -600, {
      dynamic: true, mat: 'metal', r: PLATE_R, e: 0.55, mu: 0.06, eFall: 0.15, enabled: false, style: 'vaultPlate',
    });
    p.enabled = false; p.kickReady = 0; p.onHit = null; p.omega = 0;
    return p;
  }

  _release(pl) {
    if (!pl.p) return;
    pl.p.enabled = false; pl.p.onHit = null; pl.p.omega = 0;
    this.world.moveSeg(pl.p, 0, -600, 1, -600);
    this.pool.push(pl.p);
    pl.p = null;
  }

  _buildVault(idx, first = false) {
    for (const ring of this.rings) for (const pl of ring.plates) this._release(pl);
    const V = VAULTS[idx];
    const lvl = this.level;
    this.vIdx = idx; this.vdef = V;
    this.rings = V.rings.map((rd, j) => {
      const G = RING_GEO[rd.k];
      const outer = j === V.rings.length - 1;
      // blindage : points de vie de base de l'anneau, +1 à l'extérieur au niveau 2, +1 partout ensuite
      const hp = (rd.hp || 2) + (lvl >= 3 ? 1 : lvl === 2 && outer ? 1 : 0);
      // niveaux supérieurs : une brèche de moins sur l'anneau extérieur (jamais aucune)
      let open = rd.open;
      if (lvl >= 2 && outer && open.length > 1) open = open.slice(0, open.length - 1);
      const ring = { k: rd.k, R: G.R, n: G.n, step: TAU / G.n, ang: rand(0, TAU), w: rd.w * this.speedK, flash: 0, plates: [] };
      for (let i = 0; i < G.n; i++) {
        const alive = !open.includes(i);
        const pl = { i, ring, alive, hp, hpMax: hp, p: null, flash: 0, hitCd: 0, cracks: null, heat: 0, pending: false, delay: rand(0, 0.2) + j * 0.1 };
        if (alive) { pl.p = this._prim(); pl.p.onHit = (b, imp) => this._hitPlate(pl, b, imp); }
        ring.plates.push(pl);
      }
      return ring;
    });
    this.phase = 'build';
    this.phaseT = 0;
    this.core.enabled = false;
    this.aligned = null; this.alignT = 0;
    this.trapT = 0;
    this.alarmT = BUILD_T + 0.8;
    this._placeRings(0);
    if (first) return;
    const g = this.game;
    g.sfx('vaultAssemble', V.rings.length);
    const last = idx === VAULTS.length - 1;
    g.banner(`COFFRE ${idx + 1}/${VAULTS.length}`, `${V.name} — ${V.rings.length} anneaux blindés`, V.color, 1.6);
    g.say(last ? 'vaultLast' : 'vaultNext', { name: V.name });
  }

  // Le coffre assemblé devient solide (la bille doit être sortie de son périmètre).
  _arm() {
    this.phase = 'armed';
    this.phaseT = 0;
    const b = this.ball;
    for (const ring of this.rings) for (const pl of ring.plates) {
      if (!pl.alive || !pl.p) continue;
      if (b && b.state === 'free' && this._segDist(b, pl.p) < BALL_R + PLATE_R + 2) pl.pending = true;
      else pl.p.enabled = true;
    }
    this.core.enabled = !(b && b.state === 'free' && Math.hypot(b.x - VC.x, b.y - VC.y) < CORE_R + BALL_R + 2);
    this.game.sfx('vaultArmed');
    this.game.fx.ring(VC.x, VC.y, this.vdef.color, this.outerR() + 30, 0.5);
  }

  _segDist(b, p) {
    let t = ((b.x - p.ax) * p.dx + (b.y - p.ay) * p.dy) / p.len2;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    return Math.hypot(b.x - (p.ax + p.dx * t), b.y - (p.ay + p.dy * t));
  }

  _placeRings(dt) {
    const w = this.world;
    const spin = this.phase !== 'open';
    for (const ring of this.rings) {
      if (spin) ring.ang = (ring.ang + ring.w * dt) % TAU;
      const R = ring.R;
      for (const pl of ring.plates) {
        if (!pl.p) continue;
        const a0 = ring.ang + pl.i * ring.step, a1 = a0 + ring.step;
        w.moveSeg(pl.p, VC.x + Math.cos(a0) * R, VC.y + Math.sin(a0) * R, VC.x + Math.cos(a1) * R, VC.y + Math.sin(a1) * R);
        pl.p.omega = spin ? ring.w : 0; pl.p.ocx = VC.x; pl.p.ocy = VC.y;
      }
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
    this._placeRings(dt);
    this.phaseT += dt;
    const b = this.ball;
    if (this.phase === 'build') {
      if (this.phaseT >= BUILD_T) {
        const clear = !b || b.state !== 'free' || Math.hypot(b.x - VC.x, b.y - VC.y) > this.outerR() + PLATE_R + BALL_R + 8;
        if (clear || this.phaseT > BUILD_T + 2.5) this._arm();
      }
    } else if (this.phase === 'armed') {
      // plaques en attente (la bille les chevauchait lors de l'armement)
      for (const ring of this.rings) for (const pl of ring.plates) {
        if (pl.pending && pl.p && !(b && b.state === 'free' && this._segDist(b, pl.p) < BALL_R + PLATE_R + 2)) { pl.pending = false; pl.p.enabled = true; }
      }
      if (!this.core.enabled && !(b && b.state === 'free' && Math.hypot(b.x - VC.x, b.y - VC.y) < CORE_R + BALL_R + 2)) this.core.enabled = true;
      this._updateAlign(dt);
    } else if (this.phase === 'open') {
      if (!this.won && this.phaseT >= OPEN_T) this._buildVault(this.cracked);
    }
    // effets
    for (const ring of this.rings) {
      ring.flash = Math.max(0, ring.flash - dt * 3);
      for (const pl of ring.plates) {
        pl.flash = Math.max(0, pl.flash - dt * 4);
        pl.heat = Math.max(0, pl.heat - dt * 1.5);
        if (pl.hitCd > 0) pl.hitCd -= dt;
      }
    }
    this.coreFlash = Math.max(0, this.coreFlash - dt * 3);
    this.pierceFx = Math.max(0, this.pierceFx - dt);
    this.jackpotFx = Math.max(0, this.jackpotFx - dt);
    this.alarmT = Math.max(0, this.alarmT - dt);
    if (this.drillFx > 0) this.drillFx -= dt;
    this.alignK += ((this.aligned ? 1 : 0) - this.alignK) * Math.min(1, dt * 14);
    this._updateDebris(dt);
    this.intensity = 0.72 + this.vIdx * 0.06 + (this.aligned ? 0.06 : 0) + (this.timeLeft < 15 ? 0.06 : 0);
  }

  afterStep(dt) {
    const b = this.ball;
    if (b && b.state === 'free' && this.state === 'play') {
      if (this.phase === 'armed') {
        this._checkCore(b);
        this._trapGuard(b, dt);
        this._grind(b, dt);
      }
      this._unstick(b, dt);
    } else { this.trapT = 0; this.stk.t = 0; this.stk.slow = 0; }
    this._updateLoot(dt, b);
  }

  // Champ du noyau : l'intérieur de l'anneau intérieur. Contre une plaque intacte, le centre
  // de la bille reste au-delà de R·cos(π/n) + 18 ; en deçà, elle est forcément dans une brèche :
  // le coffre est percé, même sans toucher la sphère du noyau.
  _checkCore(b) {
    if (Math.hypot(b.x - VC.x, b.y - VC.y) < coreField(this.rings[0])) this._pierce(b);
  }

  // Bille enfermée entre deux anneaux : elle force le blindage là où elle va retomber
  // (trajectoire balistique prolongée jusqu'à l'anneau qui l'enferme) : sortie garantie.
  _trapGuard(b, dt) {
    const d = Math.hypot(b.x - VC.x, b.y - VC.y);
    const out = this.outerR();
    if (d < out - PLATE_R - 2) this.trapT += dt; else { this.trapT = 0; return; }
    if (this.trapT < TRAP_T) return;
    this.trapT = TRAP_T - 0.35;     // nouveau délai (court) si elle reste malgré tout à l'intérieur
    // anneaux qui enferment la bille, du plus proche au plus éloigné : la parabole de chute
    // est prolongée à travers chacun d'eux et deux plaques sont forcées à chaque passage
    // (couloir de sortie direct, même si l'anneau tourne pendant la chute)
    const rings = this.rings.filter(r => r.R > d).sort((p, q) => p.R - q.R);
    if (!rings.length) return;
    const gy = this.world.gy, h = 1 / 120;
    let x = b.x, y = b.y, vx = b.vx, vy = b.vy, t = 0, n = 0;
    for (const ring of rings) {
      const lim = ring.R - PLATE_R - BALL_R;
      for (let k = 0; k < 120 && Math.hypot(x - VC.x, y - VC.y) < lim; k++) { vy += gy * h; x += vx * h; y += vy * h; t += h; }
      const land = Math.atan2(y - VC.y, x - VC.x) - ring.w * t;   // repère de l'anneau à l'impact
      const i0 = this._plateAt(ring, land);
      const u = (((land - ring.ang) / ring.step) % 1 + 1) % 1;
      const i1 = (i0 + (u < 0.5 ? ring.n - 1 : 1)) % ring.n;      // plaque voisine la plus proche
      // premier anneau (la bille y repose) : brèche de trois plaques, l'arête qui tourne ne la
      // rattrape pas ; anneaux suivants : deux plaques
      const ids = ring === rings[0] && ring.n > 4 ? [i0, (i0 + 1) % ring.n, (i0 + ring.n - 1) % ring.n] : [i0, i1];
      for (const i of ids) { const pl = ring.plates[i]; if (pl.alive) { this._breakPlate(pl, 'force', n > 0); n++; } }
      // la suite de la chute traverse l'anneau
      for (let k = 0; k < 30 && Math.hypot(x - VC.x, y - VC.y) < ring.R + PLATE_R + BALL_R; k++) { vy += gy * h; x += vx * h; y += vy * h; t += h; }
    }
    if (!n) return;
    this.forced++;
    this.game.say('vaultForce');
  }

  // Bille qui frotte contre un anneau en rotation : gerbes d'étincelles.
  _grind(b, dt) {
    this.grindT -= dt;
    if (this.grindT > 0) return;
    const d = Math.hypot(b.x - VC.x, b.y - VC.y);
    const sp = Math.hypot(b.vx, b.vy);
    for (const ring of this.rings) {
      if (Math.abs(d - ring.R) > BALL_R + PLATE_R + 4) continue;
      const ba = Math.atan2(b.y - VC.y, b.x - VC.x);
      const pl = ring.plates[this._plateAt(ring, ba)];
      if (!pl.alive) continue;
      // vitesse tangentielle relative bille / surface
      const vt = -b.vx * Math.sin(ba) + b.vy * Math.cos(ba);
      const rel = Math.abs(vt - ring.w * d);
      if (rel < 40 || sp > 700) continue;
      this.grindT = 0.07;
      const cx = VC.x + Math.cos(ba) * (ring.R + (d > ring.R ? PLATE_R : -PLATE_R));
      const cy = VC.y + Math.sin(ba) * (ring.R + (d > ring.R ? PLATE_R : -PLATE_R));
      this.game.fx.spark(cx, cy, 500);
      pl.heat = Math.min(1, pl.heat + 0.25);
      this.game.sfx('vaultGrind', (cx - 281) / 281);
      return;
    }
  }

  _plateAt(ring, a) {
    let u = (a - ring.ang) / ring.step;
    u = ((Math.floor(u) % ring.n) + ring.n) % ring.n;
    return u;
  }

  // anti-blocage générique : bille immobile (ou qui se traîne) hors des batteurs
  _unstick(b, dt) {
    const S = this.stk;
    if (this.noUnstick) return;
    const f = this.frame;
    const cradle = b.y > 860 && (f.flipL.pressed || f.flipR.pressed);
    if (!cradle && Math.abs(b.x - S.x) < 5 && Math.abs(b.y - S.y) < 5) S.t += dt;
    else { S.x = b.x; S.y = b.y; S.t = 0; }
    const sp = Math.hypot(b.vx, b.vy);
    if (b.y < 860 && sp < 90) S.slow += dt; else if (sp > 250 || b.y >= 860) S.slow = 0;
    if (S.t > 1.5 || S.slow > 2.5) {
      S.t = 0; S.slow = 0;
      this.unstuck++;
      b.vx = rand(-280, 280); b.vy = -420;
      this.game.say('stuck');
    }
  }

  // ------------------------------------------------------------ alignement des brèches
  // Intervalle d'angles (vu du noyau) libre à travers tous les anneaux, dans le cône
  // dirigé vers les batteurs ; une bille passe si elle reste à distance des bords.
  _alignWindow() {
    let iv = [[Math.PI / 2 - CONE, Math.PI / 2 + CONE]];
    for (const ring of this.rings) {
      const n = ring.n, P = ring.plates;
      let s = -1;
      for (let i = 0; i < n; i++) if (P[i].alive) { s = i; break; }
      if (s < 0) continue;                         // anneau entièrement ouvert
      const m = 2 * Math.asin((BALL_R + PLATE_R + 1) / (2 * ring.R));
      const open = [];
      let run = -1;
      for (let k = 1; k <= n; k++) {
        const i = s + k;                           // indices déroulés (s + 1 … s + n)
        const alive = P[i % n].alive;
        if (!alive && run < 0) run = i;
        if (alive && run >= 0) {
          let A = ring.ang + run * ring.step + m, B = ring.ang + i * ring.step - m;
          if (B > A) {
            const mid = (A + B) / 2, sh = Math.PI / 2 + wrapAngle(mid - Math.PI / 2) - mid;
            open.push([A + sh, B + sh]);
          }
          run = -1;
        }
      }
      const next = [];
      for (const [a0, a1] of iv) for (const [b0, b1] of open) {
        const lo = Math.max(a0, b0), hi = Math.min(a1, b1);
        if (hi > lo) next.push([lo, hi]);
      }
      iv = next;
      if (!iv.length) return null;
    }
    let best = null;
    for (const [lo, hi] of iv) if (!best || hi - lo > best.w) best = { a: (lo + hi) / 2, w: hi - lo };
    return best;
  }

  _updateAlign(dt) {
    const prev = this.aligned;
    this.aligned = this._alignWindow();
    if (this.aligned) {
      this.alignT = ALIGN_GRACE;
      this.alignA = this.aligned.a;
      if (!prev) {
        this.alignCount++;
        this.game.sfx('vaultAlign');
        if (this.alignCount === 1 || Math.random() < 0.35) this.game.say('vaultAlign');
      }
    } else if (this.alignT > 0) this.alignT -= dt;
  }

  // ------------------------------------------------------------ impacts
  _hitPlate(pl, b, imp) {
    if (this.phase !== 'armed' || this.state !== 'play' || !pl.alive || pl.hitCd > 0 || imp < MIN_IMPACT) return;
    const g = this.game;
    pl.hitCd = 0.12;
    pl.flash = 1;
    pl.ring.flash = 0.6;
    this.hits++;
    const dmg = imp > HEAVY ? 2 : 1;
    pl.hp -= dmg;
    const pan = (b.x - 281) / 281;
    if (pl.hp <= 0) { this._breakPlate(pl, imp > HEAVY ? 'heavy' : 'hit'); return; }
    this._crack(pl, 3);
    pl.heat = 1;
    g.addScore(500, b.x, b.y - 24);
    g.sfx('vaultCrack', pan, pl.ring.k);
    g.fx.burst(b.x, b.y, '#ffb36b', 6, 200);
  }

  // fissures : lignes brisées dans le repère de la plaque (u le long, v en travers)
  _crack(pl, n) {
    if (!pl.cracks) pl.cracks = [];
    for (let c = 0; c < n; c++) {
      let u = rand(0.15, 0.85), v = rand(-1, 1) > 0 ? 1 : -1;
      const pts = [[u, v]];
      const steps = 2 + Math.floor(rand(0, 3));
      for (let s = 0; s < steps; s++) {
        u = clamp(u + rand(-0.14, 0.14), 0.04, 0.96);
        v -= Math.sign(v || 1) * rand(0.35, 0.8);
        pts.push([u, clamp(v, -1, 1)]);
      }
      pl.cracks.push(pts);
    }
    if (pl.cracks.length > 9) pl.cracks.splice(0, pl.cracks.length - 9);
  }

  _plateMid(pl) {
    const ring = pl.ring, a = ring.ang + (pl.i + 0.5) * ring.step;
    return { a, x: VC.x + Math.cos(a) * ring.R, y: VC.y + Math.sin(a) * ring.R };
  }

  _breakPlate(pl, cause, quiet = false) {
    if (!pl.alive) return;
    const g = this.game;
    const ring = pl.ring;
    const a0 = ring.ang + pl.i * ring.step;
    pl.alive = false;
    pl.pending = false;
    this._release(pl);
    this.breaks++;
    const m = this._plateMid(pl);
    // débris : la plaque arrachée s'envole en tournoyant (vers l'extérieur)
    const out = cause === 'force' ? 160 : 260;
    this._debris(a0, a0 + ring.step, ring.R, Math.cos(m.a) * out + rand(-60, 60), Math.sin(m.a) * out - 120, this.vdef.color);
    g.fx.burst(m.x, m.y, '#ffd0a0', 10, 300);
    g.fx.burst(m.x, m.y, this.vdef.color, 6, 220);
    if (quiet) return;
    g.fx.ring(m.x, m.y, '#ffb36b', 40, 0.35);
    g.fx.shake(cause === 'heavy' ? 4 : 2.5);
    g.addScore(1500 * this.level, m.x, m.y - 26, cause === 'heavy' ? 'IMPACT LOURD' : cause === 'force' ? 'FORÇAGE' : undefined);
    g.sfx(cause === 'force' ? 'vaultDrill' : 'vaultBreak', (m.x - 281) / 281, ring.k);
    if (cause !== 'force' && this.breaks % 3 === 1) g.say('vaultBreak');
    // éclats : l'arrachement fissure les plaques voisines (sans réaction en chaîne)
    if (this.shrapnel && (cause === 'hit' || cause === 'heavy')) {
      for (const d of [-1, 1]) {
        const nb = ring.plates[(pl.i + d + ring.n) % ring.n];
        if (!nb.alive) continue;
        nb.hp -= 1; nb.flash = 0.7; this._crack(nb, 2);
        if (nb.hp <= 0) this._breakPlate(nb, 'shrapnel', true);
      }
    }
    // anneau entièrement arraché : onde de choc ; anneau intérieur : le noyau est à nu
    if (ring.plates.every(p => !p.alive)) {
      g.fx.ring(VC.x, VC.y, this.vdef.color, ring.R * 1.6, 0.5);
      if (ring === this.rings[0] && this.phase === 'armed') { g.say('vaultExposed'); g.fx.text(VC.x, VC.y - 40, 'NOYAU À NU', '#ffd84a', 1.1); }
    }
  }

  _hitCore(b) {
    if (this.phase !== 'armed' || this.state !== 'play') return;
    this._pierce(b);
  }

  // COFFRE PERCÉ : explosion, butin, coffre suivant.
  _pierce(b) {
    if (this.phase !== 'armed' || this.state !== 'play') return;
    const g = this.game;
    const V = this.vdef;
    // JACKPOT : perçage pendant l'alignement, la bille arrivant par l'axe du laser (tir direct)
    const ba = b ? Math.atan2(b.y - VC.y, b.x - VC.x) : 0;
    const jackpot = this.alignT > 0 && !!b && Math.abs(wrapAngle(ba - this.alignA)) < JACK_SPREAD;
    this.coreHits++;
    this.phase = 'open';
    this.phaseT = 0;
    this.cracked++;
    this.pierces++;
    this.core.enabled = false;
    this.coreFlash = 1;
    this.pierceFx = 1;
    this.aligned = null; this.alignT = 0;
    this.trapT = 0;
    // toutes les plaques restantes sont soufflées
    for (const ring of this.rings) {
      for (const pl of ring.plates) {
        if (!pl.alive) continue;
        const a0 = ring.ang + pl.i * ring.step, mid = a0 + ring.step / 2;
        pl.alive = false; pl.pending = false;
        this._release(pl);
        const s = rand(320, 520) * (1.25 - ring.k * 0.15);
        this._debris(a0, a0 + ring.step, ring.R, Math.cos(mid) * s, Math.sin(mid) * s - 80, V.color);
      }
    }
    // la bille est repoussée hors du noyau
    if (b) {
      const dx = b.x - VC.x, dy = b.y - VC.y, d = Math.hypot(dx, dy) || 1;
      const s = Math.max(650, Math.hypot(b.vx, b.vy));
      b.vx = dx / d * s; b.vy = dy / d * s;
    }
    const n = this.cracked;
    const pts = 25000 * n * this.level + (jackpot ? 75000 * this.level : 0);
    g.addScore(pts, VC.x, VC.y - 70, jackpot ? 'JACKPOT' : 'COFFRE PERCÉ');
    this._spawnLoot(n, jackpot);
    g.fx.flash(jackpot ? GOLD : V.color, jackpot ? 0.45 : 0.32);
    g.fx.shake(jackpot ? 12 : 9);
    g.fx.burst(VC.x, VC.y, '#ffffff', 18, 520);
    g.fx.burst(VC.x, VC.y, GOLD, 26, 460);
    g.fx.burst(VC.x, VC.y, V.color, 20, 380);
    g.fx.ring(VC.x, VC.y, GOLD, 120, 0.6);
    g.fx.ring(VC.x, VC.y, '#ffffff', 220, 0.8);
    g.fx.sweep(jackpot ? GOLD : V.color, 1000, -140, 0.6);
    for (let k = 0; k < 5; k++) { const a = rand(0, TAU); g.fx.arc(VC.x, VC.y, VC.x + Math.cos(a) * 160, VC.y + Math.sin(a) * 160, '#fff2b0', 0.3); }
    g.sfx('vaultPierce', jackpot);
    if (jackpot) {
      this.jackpots++;
      this.jackpotFx = 2.2;
      g.dmd('jackpot', { value: pts });
      g.sfx('vaultJackpot');
      g.say('vaultJackpot');
    }
    if (this.cracked >= VAULTS.length) {
      // braquage réussi : le butin reste à ramasser quelques secondes (bille protégée)
      this.won = true;
      this.setBarrier(FINAL_T + 1);
      g.banner('BRAQUAGE RÉUSSI', 'Ramassez le butin !', GOLD, 2.2);
      if (!jackpot) g.say('vaultWin');
      this.timers.push({ t: FINAL_T, fn: () => this.finish(true, 'vaults') });
      return;
    }
    this.timeLeft = Math.min(this.timeLimit, this.timeLeft + TIME_BONUS);
    this.setBarrier(LOOT_NET);      // filet anti-chute pendant la pluie de butin
    g.fx.text(VC.x, VC.y + 40, `+${TIME_BONUS} s`, '#bfe9ff', 1.1);
    if (!jackpot) {
      g.banner('COFFRE PERCÉ', `${V.name} · butin en vrac : ramassez-le !`, GOLD, 1.8);
      g.say('vaultPierce');
    }
  }

  // ------------------------------------------------------------ butin
  _spawnLoot(n, jackpot) {
    const bars = 2 + n + (jackpot ? 4 : 0);
    const coins = 4 + n * 2 + (jackpot ? 4 : 0);
    const k = jackpot ? 2 : 1;
    const add = (kind) => {
      const a = rand(0, TAU), s = rand(260, 520);
      this.loot.push({
        kind, x: VC.x + Math.cos(a) * 20, y: VC.y + Math.sin(a) * 20, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 120,
        t: 0, life: LOOT_LIFE + rand(-0.6, 0.6), value: (kind === 'bar' ? 8000 : 2000) * this.level * k,
        spin: rand(0, TAU), vs: rand(-6, 6), seed: rand(0, 100),
      });
      this.lootSpawned++;
    };
    for (let i = 0; i < bars; i++) add('bar');
    for (let i = 0; i < coins; i++) add('coin');
    if (this.loot.length > 60) this.loot.splice(0, this.loot.length - 60);
  }

  _updateLoot(dt, b) {
    if (this.lootChainT > 0) { this.lootChainT -= dt; if (this.lootChainT <= 0) this.lootChain = 0; }
    this.lootShown += (this.lootTotal - this.lootShown) * Math.min(1, dt * 5);
    if (Math.abs(this.lootTotal - this.lootShown) < 30) this.lootShown = this.lootTotal;
    const free = b && b.state === 'free' && this.state === 'play';
    for (let i = this.loot.length - 1; i >= 0; i--) {
      const L = this.loot[i];
      L.t += dt;
      if (L.t >= L.life) { this.loot.splice(i, 1); continue; }
      // dérive : éjection freinée puis lente descente vers les batteurs
      const drag = 1 - Math.min(1, dt * 2.4);
      L.vx *= drag; L.vy *= drag;
      L.vy += 55 * dt;
      L.spin += L.vs * dt;
      // aimantation par la bille (généreux)
      if (free) {
        const dx = b.x - L.x, dy = b.y - L.y, d = Math.hypot(dx, dy);
        if (d < 85 && d > 1) { const k = 2600 * (1 - d / 85) * dt; L.vx += dx / d * k; L.vy += dy / d * k; }
      }
      L.x += L.vx * dt; L.y += L.vy * dt;
      // reste dans l'arène (murs, dôme), flotte au-dessus des slingshots
      if (L.x < 36) { L.x = 36; L.vx = Math.abs(L.vx) * 0.5; }
      if (L.x > 526) { L.x = 526; L.vx = -Math.abs(L.vx) * 0.5; }
      const ddx = L.x - 300, ddy = L.y - 300;
      if (L.y < 300 && ddx * ddx + ddy * ddy > 258 * 258) { const d = Math.hypot(ddx, ddy); L.x = 300 + ddx / d * 258; L.y = 300 + ddy / d * 258; L.vy = Math.abs(L.vy) * 0.4; }
      if (L.y > 770) { L.y = 770; L.vy = Math.min(0, L.vy) - 20; }
      if (free && this._sweptHit(b, L.x, L.y, BALL_R + 14)) { this._pick(L); this.loot.splice(i, 1); }
    }
  }

  // distance du segment parcouru par la bille pendant l'image au butin
  _sweptHit(b, x, y, R) {
    const ax = b.px, ay = b.py, dx = b.x - ax, dy = b.y - ay;
    const l2 = dx * dx + dy * dy;
    let t = l2 > 1e-6 ? ((x - ax) * dx + (y - ay) * dy) / l2 : 1;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const qx = ax + dx * t - x, qy = ay + dy * t - y;
    return qx * qx + qy * qy < R * R;
  }

  _pick(L) {
    const g = this.game;
    this.lootChain = Math.min(12, this.lootChain + 1);
    this.lootChainT = 0.9;
    this.lootPicked++;
    const v = g.addScore(L.value, L.x, L.y - 18);
    this.lootTotal += v;
    g.fx.burst(L.x, L.y, GOLD, L.kind === 'bar' ? 9 : 5, 220);
    g.fx.ring(L.x, L.y, GOLD, L.kind === 'bar' ? 34 : 22, 0.3);
    g.sfx('vaultCoin', L.kind === 'bar', this.lootChain, (L.x - 281) / 281);
    if (this.lootChain === 6) g.say('vaultLoot', { loot: fmt(this.lootTotal) });
  }

  // ------------------------------------------------------------ débris (rendu)
  _debris(a0, a1, R, vx, vy, color) {
    if (this.debris.length >= MAX_DEBRIS) this.debris.shift();
    const am = (a0 + a1) / 2;
    this.debris.push({
      x: VC.x + Math.cos(am) * R, y: VC.y + Math.sin(am) * R, a: am + Math.PI / 2,
      half: Math.sin((a1 - a0) / 2) * R, vx, vy, va: rand(-9, 9), t: 0, life: rand(0.8, 1.2), color,
    });
  }

  _updateDebris(dt) {
    for (let i = this.debris.length - 1; i >= 0; i--) {
      const d = this.debris[i];
      d.t += dt;
      if (d.t >= d.life) { this.debris.splice(i, 1); continue; }
      d.x += d.vx * dt; d.y += d.vy * dt; d.vy += 900 * dt; d.a += d.va * dt;
    }
  }

  // ------------------------------------------------------------ issue
  onBallLost(ball) {
    if (this.won) { if (this.state === 'play') this.finish(true, 'vaults'); return; }
    super.onBallLost(ball);
  }

  onTimeout() { this.finish(this.won, this.won ? 'vaults' : 'timeout'); }

  resetCombos() { this.lootChain = 0; }

  // coffres percés : la tentative suivante reprend au coffre suivant
  keepProgress() { return { vaults: Math.min(VAULTS.length - 1, this.cracked) }; }

  results(success) {
    const rewards = [];
    if (success) {
      rewards.push({ type: 'mult' });
      if (this.jackpots > 0) rewards.push({ type: 'rampJackpot', extra: this.jackpots * 25000 });
    }
    return {
      rewards,
      partialRewards: [],
      points: success ? Math.round(this.timeLeft) * 1500 * this.level : (this.cracked - this.startCracked) * 10000 * this.level,
    };
  }

  progressText() {
    if (this.won) return `Braquage réussi · butin ${fmt(this.lootTotal)} ₵`;
    const n = Math.min(VAULTS.length, this.cracked + 1);
    const tag = this.phase === 'open' ? ' · PERCÉ !' : this.aligned ? ' · ALIGNEMENT !' : '';
    return `Coffre ${n}/${VAULTS.length}${tag} · butin ${fmt(this.lootTotal)} ₵`;
  }

  debugWin() { this.finish(true, 'debug'); }

  // ------------------------------------------------------------ rendu
  drawStatic(g, r) { drawVaultStatic(g, r, this); }
  renderArena(ctx, r) { renderVault(ctx, r, this); }
  renderTop(ctx, r) { renderVaultTop(ctx, r, this); }
}
