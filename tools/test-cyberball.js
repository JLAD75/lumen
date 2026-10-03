// Tests headless du minijeu CYBERBALL (secteur ARÈNE).
// Géométrie, recensements (tirs aléatoires de batteurs : le but est atteignable ; billes lâchées
// partout, batteurs au repos : aucune bille coincée), mécaniques (but, lucarne, poteau, gardien
// assommé, engagement protégé, montée en puissance, bouclier, chute, progression conservée,
// récompenses), puis parties automatiques avec deux pilotes (réflexe simple et tireur qui vise).
// Usage : node tools/test-cyberball.js [parties par niveau et par pilote]
import { Game } from '../src/game/game.js';
import { CB } from '../src/minigames/cyberballArt.js';
import { cyberballTuning } from '../src/minigames/cyberball.js';

const DT = 1 / 120;
const RUNS = Math.max(1, parseInt(process.argv[2] || '30', 10));
const { CX, GOAL_Y, POST_L, POST_R, POST_RAD, KEEPER_Y, KEEPER_R, DEF_R, KICK, CEIL_Y } = CB;
let failures = 0, passes = 0;
const log = (...a) => console.log(...a);
function check(cond, msg) {
  if (cond) { passes++; log('  ✔', msg); } else { failures++; log('  ✘', msg); }
}

// ------------------------------------------------------------------ simulacres (comme test-defense.js)
class BotInput {
  constructor() { this.s = { left: false, right: false, launch: false }; this.p = { ...this.s }; }
  poll() {
    const s = this.s, p = this.p;
    const out = {
      left: s.left, right: s.right, launch: s.launch,
      leftPressed: s.left && !p.left, rightPressed: s.right && !p.right, launchPressed: s.launch && !p.launch,
      leftReleased: !s.left && p.left, rightReleased: !s.right && p.right, launchReleased: !s.launch && p.launch,
    };
    this.p = { ...s };
    return out;
  }
  swallow() { this.p = { ...this.s }; }
  releaseAll() { this.s = { left: false, right: false, launch: false }; }
}

const noop = () => {};
const fx = { spark: noop, burst: noop, ring: noop, text: noop, flash: noop, shake: noop, drain: noop, arc: noop, sweep: noop, update: noop, clear: noop };
const music = { setMode: noop, setIntensity: noop, setTension: noop, setFlag: noop, bump: noop, currentChord: () => [220, 261.6, 329.6] };
const sfxLog = new Map();
const audio = { music, sfx: (n) => sfxLog.set(n, (sfxLog.get(n) || 0) + 1), impact: noop, speak: noop, setPaused: noop, chargeLevel: noop, stopCharge: noop };
const dmdLog = [];
const ui = {
  banner: noop, lumen: noop, tally: noop, flashBalls: noop,
  onGameStart: noop, showPause: noop, showTitle: noop, showGameOver: noop,
  dmd: { show: (kind, data) => dmdLog.push(data && data.title) },
};

function makeGame() {
  const input = new BotInput();
  const settings = { reducedMotion: false, reducedFx: false };
  const g = new Game({ renderer: { fx, render: noop, alpha: 1 }, audio, input, ui, settings });
  g.scores = { best: 0, rank: () => -1, add: noop, list: [] };
  const said = [];
  const say = g.say.bind(g);
  g.say = (k, p) => { said.push(k); say(k, p); };
  g.said = said;
  return { g, input };
}

function run(g, seconds, each) {
  const n = Math.round(seconds / DT);
  for (let i = 0; i < n; i++) {
    if (each && each(i * DT) === false) return i * DT;
    g.tick(DT);
  }
  return seconds;
}

// démarre CYBERBALL avec la bille du plateau
function startArena(level = 1) {
  const { g, input } = makeGame();
  g.newGame();
  g.level = level; g.applyDifficulty();
  g.table.launch(0.5); run(g, 0.5);
  g.debug('start', 'arena');
  run(g, 3, () => g.scene === 'minigame' ? false : undefined);
  return { g, input, mg: g.minigame };
}

function restart(g) {
  g.debug('qualify', 'arena');
  g.debug('start', 'arena');
  run(g, 3, () => g.scene === 'minigame' ? false : undefined);
  return g.minigame;
}

// remet la bille en jeu (libre, visible) à une position donnée
function placeBall(mg, x, y, vx = 0, vy = 0) {
  const b = mg.ball || mg.world.balls[0];
  mg.seq = null;
  b.state = 'free'; b.scale = 1;
  b.setPos(x, y); b.vx = vx; b.vy = vy;
  return b;
}

// opposition coupée (gardien hors service, défenseurs endormis) / rétablie
function noOpposition(mg) { mg.keeper.stun = 1e9; for (const d of mg.defs) d.sleep = true; }

// pilote réflexe (identique à sim-tests.js) : frappe dès que la bille approche d'un batteur
function reflexBot(g, input, skill = 0.7) {
  let l = false, r = false;
  const balls = g.scene === 'minigame' ? g.minigame.world.balls : g.table.world.balls;
  for (const b of balls) {
    if (b.state !== 'free') continue;
    if (b.y > 870 && b.y < 1000 && b.vy > -200) {
      if (b.x < 281 && b.x > 150 && Math.random() < skill) l = true;
      if (b.x >= 281 && b.x < 420 && Math.random() < skill) r = true;
    }
  }
  input.s.left = l; input.s.right = r;
}

// Tireur qui vise (joueur appliqué) : bloque la bille sur le batteur, la relâche, puis
// frappe après un délai choisi pour viser le côté du but que le gardien ne couvre pas.
// Imprécision humaine : ±noise s sur le moment de la frappe. Sinon, réflexe simple.
function makeAimBot(noise = 0.03) {
  const st = { mode: 'free', side: 0, t: 0, delay: 0 };
  return (g, input) => {
    const mg = g.minigame;
    const b = mg && mg.world.balls[0];
    if (!b || b.state !== 'free') { st.mode = 'free'; input.s.left = input.s.right = false; return; }
    const sp = Math.hypot(b.vx, b.vy);
    if (st.mode === 'free') {
      // attrape la bille qui descend vers un batteur
      if (b.y > 800 && b.vy > 0 && b.x > 120 && b.x < 442) {
        st.side = b.x < CX ? -1 : 1; st.mode = 'catch'; st.t = 0;
      } else { reflexBot(g, input, 0.7); return; }
    }
    st.t += DT;
    const hold = (on) => { input.s.left = on && st.side < 0; input.s.right = on && st.side > 0; };
    if (st.mode === 'catch') {
      if (b.y < 915) st.side = b.x < CX ? -1 : 1;       // suit la bille jusqu'au batteur
      hold(true);
      if (b.y < 760 || st.t > 2.5) { st.mode = 'free'; hold(false); return; }
      if (st.t > 0.35 && sp < 40 && b.y > 900) {
        // cible : le coin opposé au gardien (assommé : le centre, frappe forte)
        const K = mg.keeper;
        const aimLeft = K.stun > 0 ? null : K.x > CX;
        // délais mesurés sur le batteur gauche ; le batteur droit est le miroir
        let d;
        if (aimLeft === null) d = 0.42;
        else {
          const wantLeftFromL = aimLeft;
          const leftSide = st.side < 0 ? wantLeftFromL : !wantLeftFromL;
          d = leftSide ? 0.345 : 0.405;
        }
        st.delay = d + (Math.random() * 2 - 1) * noise;
        st.mode = 'release'; st.t = 0;
      }
      return;
    }
    if (st.mode === 'release') {
      hold(st.t >= st.delay);
      if (st.t >= st.delay + 0.25) { st.mode = 'free'; hold(false); }
    }
  };
}

function segDist(px, py, p) {
  let t = ((px - p.ax) * p.dx + (py - p.ay) * p.dy) / p.len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (p.ax + p.dx * t), py - (p.ay + p.dy * t));
}

// ------------------------------------------------------------------ 1. géométrie
log('\n[1] Géométrie : stade, but, gardien, défenseurs');
{
  const { g, mg } = startArena(1);
  check(g.scene === 'minigame' && mg && mg.sector === 'arena', 'minijeu CYBERBALL démarré (secteur ARÈNE)');
  check(mg.world.flippers.length === 2 && mg.frame, 'arène à batteurs (moitié basse conservée)');
  check(GOAL_Y > CEIL_Y + 60 && GOAL_Y > 200, `ligne de but loin du sommet du dôme (y = ${GOAL_Y}, filet de ${GOAL_Y - CEIL_Y})`);
  const mouth = POST_R - POST_L - 2 * POST_RAD;
  check(mouth >= 26 * 5, `bouche du but large (${mouth} unités, bille Ø 26)`);
  // le gardien ne laisse jamais un interstice où la bille resterait coincée contre un montant
  const K = mg.keeper;
  const [lo, hi] = mg._keeperRange();
  let pinch = Infinity;
  for (const x of [lo, hi]) {
    for (const P of mg.posts) {
      const ex = x + (P.x < CX ? -K.hl : K.hl);
      pinch = Math.min(pinch, Math.hypot(ex - P.x, KEEPER_Y - P.y) - POST_RAD - KEEPER_R);
    }
  }
  check(pinch > 3 && pinch < 26, `gardien en butée : écart au montant ${pinch.toFixed(1)} (ni contact, ni passage de bille)`);
  check(KEEPER_Y - KEEPER_R - 13 < GOAL_Y, 'une bille posée sur le gardien a déjà franchi la ligne (rien ne repose devant le but)');
  // défenseurs : loin des murs (pas de pincement)
  let worst = Infinity;
  for (const d of mg.defs) {
    for (const x of [d.x0 - d.amp, d.x0 + d.amp]) {
      for (const p of mg.world.statics) {
        if (p.kind !== 'seg') continue;
        worst = Math.min(worst, segDist(x, d.y, p) - p.r - DEF_R);
      }
    }
  }
  check(worst > 30, `défenseurs à plus d'un diamètre de bille des murs (min ${worst.toFixed(0)})`);
  check(mg.defs.every(d => Math.abs(d.y - KICK.y) > 80), 'point d\'engagement hors des trajectoires des défenseurs');
  check(mg.perkT > 0 && mg.perk && /Gardien/.test(mg.perk.name), 'avantage d\'entrée : gardien en retard');
  check(mg.progressText().includes('0/5') && mg.progressText().includes('LUMEN 0 – 0 NULL'), `progression lisible : « ${mg.progressText()} »`);
  check(g.said.includes('enter_arena'), 'réplique d\'entrée de LUMEN');
}

// ------------------------------------------------------------------ 2. recensement : tirs aléatoires
log('\n[2] Recensement : tirs de batteurs aléatoires (bille lâchée au hasard, frappe au hasard)');
function shotCensus(level, opposition, n) {
  const { g, input, mg } = startArena(level);
  const out = { n, goal: 0, mouth: 0, keeper: 0, stun: 0, post: 0, lost: 0 };
  mg.perkT = 0;
  for (let i = 0; i < n; i++) {
    if (mg.state !== 'play' || g.minigame !== mg) break;
    mg.timeLeft = 60; mg.barrierT = 0; mg.barrier.enabled = false;
    if (!opposition) noOpposition(mg);
    const side = Math.random() < 0.5 ? -1 : 1;
    const b = placeBall(mg, CX + side * (40 + Math.random() * 110), 620 + Math.random() * 160, -side * Math.random() * 140, 0);
    const before = { goals: mg.goals, saves: mg.saves, stuns: mg.stuns, posts: mg.postHits };
    let pressAt = -1, t = 0, crossed = false;
    const delay = Math.random() * 0.22;
    for (let k = 0; k < 3 / DT; k++) {
      t += DT;
      if (pressAt < 0 && b.y > 850 && b.vy > 0) pressAt = t + delay;
      const press = pressAt > 0 && t >= pressAt && t < pressAt + 0.3;
      input.s.left = press && b.x < CX + 30; input.s.right = press && b.x >= CX - 30;
      const py = b.y;
      g.tick(DT);
      if (b.state === 'free' && py > GOAL_Y && b.y <= GOAL_Y + 2 && b.x > POST_L && b.x < POST_R) crossed = true;
      if (mg.goals > before.goals || mg.seq) { crossed = true; break; }
      if (b.y > 1000) break;
    }
    input.s.left = input.s.right = false;
    if (mg.goals > before.goals) out.goal++;
    if (crossed) out.mouth++;
    if (mg.stuns > before.stuns) out.stun++;
    if (mg.saves > before.saves) out.keeper++;
    if (mg.postHits > before.posts) out.post++;
    mg.seq = null; mg.goals = 0;
  }
  return out;
}
{
  const N = Math.max(200, RUNS * 10);
  const free = shotCensus(1, false, N);
  log(`  sans opposition : ${N} tirs · buts ${free.goal} (${(100 * free.goal / N).toFixed(1)} %) · poteaux ${free.post}`);
  check(free.goal / N >= 0.1, 'au moins 10 % des tirs aléatoires finissent au fond du but vide');
  for (const level of [1, 2, 3]) {
    const s = shotCensus(level, true, N);
    log(`  niv. ${level}, gardien et défenseurs : buts ${(100 * s.goal / N).toFixed(1)} % · arrêts ${(100 * s.keeper / N).toFixed(1)} % · gardien assommé ${(100 * s.stun / N).toFixed(1)} % · poteaux ${(100 * s.post / N).toFixed(1)} %`);
    if (level === 1) check(s.goal / N >= 0.04, 'niveau 1 : des tirs aléatoires battent encore le gardien (≥ 4 %)');
    if (level === 1) check(s.stun > 0 && s.keeper > 0, 'niveau 1 : arrêts et gardiens assommés observés');
  }
}

// tir visé : bille bloquée sur le batteur, relâchée, frappe après un délai
log('\n[3] Recensement : tirs visés (bille bloquée puis frappée) — fenêtre de tir vers le but');
{
  const { g, input, mg } = startArena(1);
  noOpposition(mg);
  const table = {};
  for (const side of [-1, 1]) {
    const hits = [];
    for (let d = 0.2; d <= 0.6; d += 0.01) {
      mg.timeLeft = 60; mg.barrierT = 0; mg.barrier.enabled = false;
      const b = placeBall(mg, CX + side * 50, 880);
      const hold = (on) => { input.s.left = on && side < 0; input.s.right = on && side > 0; };
      hold(true); run(g, 1.2); hold(false); run(g, d); hold(true);
      const g0 = mg.goals;
      run(g, 1.0, () => (mg.goals > g0 || b.y > 1000) ? false : undefined);
      hold(false);
      if (mg.goals > g0) hits.push(+d.toFixed(2));
      mg.seq = null; mg.goals = 0;
    }
    table[side] = hits;
    const span = hits.length ? `${hits[0]}–${hits[hits.length - 1]} s` : 'aucune';
    log(`  batteur ${side < 0 ? 'gauche' : 'droit'} : ${hits.length} délais sur 41 marquent (fenêtre ${span})`);
  }
  check(table[-1].length >= 6 && table[1].length >= 6, 'chaque batteur dispose d\'une fenêtre de tir d\'au moins 60 ms vers le but');
}

// ------------------------------------------------------------------ 4. recensement : blocages
log('\n[4] Recensement : billes lâchées partout, batteurs au repos (aucune immobilisation > 2 s)');
{
  const { g, mg } = startArena(1);
  mg.afterStep = () => {};                 // pas de déblocage automatique : on teste la géométrie seule
  mg.perkT = 0;
  const N = Math.max(300, RUNS * 12);
  let stuck = 0, notDrained = 0, worstStill = 0, goals = 0;
  const where = [];
  for (let i = 0; i < N; i++) {
    if (mg.state !== 'play' || g.minigame !== mg) break;
    mg.timeLeft = 60; mg.barrierT = 0; mg.barrier.enabled = false; mg.seq = null; mg.goals = 0;
    // position au hasard dans la moitié haute (zone transformée) et un peu plus bas
    let x, y;
    for (;;) {
      x = 32 + Math.random() * 500; y = CEIL_Y + 15 + Math.random() * 640;
      if (y < 300 && Math.hypot(x - 300, y - 300) > 262) continue;
      if (x > POST_L - 15 && x < POST_R + 15 && y < GOAL_Y + 20) continue;      // dans la cage
      if (x > 528) continue;
      if (y > 480 && y < 720 && (x < 70 || x > 492)) continue;                  // renflements
      if (mg.defs.some(d => !d.sleep && Math.hypot(x - d.x, y - d.y) < DEF_R + 16)) continue;
      if (Math.abs(y - KEEPER_Y) < 26 && Math.abs(x - mg.keeper.x) < mg.keeper.hl + 24) continue;
      break;
    }
    // positions variées pour le gardien, défenseurs réveillés une fois sur deux
    mg.keeper.x = 230 + Math.random() * 100;
    mg.defs[2].sleep = i % 2 === 0; mg.defs[2].wake = 1;
    const b = placeBall(mg, x, y, (Math.random() * 2 - 1) * 300, (Math.random() * 2 - 1) * 300);
    let sx = b.x, sy = b.y, still = 0, maxStill = 0, drained = false;
    for (let k = 0; k < 14 / DT; k++) {
      g.tick(DT);
      if (mg.seq) { goals++; drained = true; break; }
      if (b.y > 1000) { drained = true; break; }
      if (Math.abs(b.x - sx) < 5 && Math.abs(b.y - sy) < 5) still += DT; else { sx = b.x; sy = b.y; still = 0; }
      maxStill = Math.max(maxStill, still);
    }
    worstStill = Math.max(worstStill, maxStill);
    if (maxStill > 2) { stuck++; where.push(`${x.toFixed(0)},${y.toFixed(0)}→${b.x.toFixed(0)},${b.y.toFixed(0)}`); }
    if (!drained) notDrained++;
  }
  log(`  ${N} billes · immobilisation max ${worstStill.toFixed(2)} s · non sorties en 14 s : ${notDrained} · buts au passage : ${goals}`);
  check(stuck === 0, `aucune bille immobile plus de 2 s${stuck ? ' : ' + where.slice(0, 5).join(' ; ') : ''}`);
  check(notDrained === 0, 'toutes les billes redescendent jusqu\'aux batteurs (ou marquent)');
}

// ------------------------------------------------------------------ 5. mécaniques
log('\n[5] But, lucarne, engagement protégé, poteau, gardien assommé');
{
  const { g, mg } = startArena(1);
  noOpposition(mg);
  mg.keeper.stun = 0; mg.keeper.reboot = 0;       // gardien présent mais on vise à côté
  const b = mg.ball;
  // but au centre (gardien écarté)
  mg.keeper.x = mg._keeperRange()[1]; mg.perkT = 99;
  mg.keeper.stun = 50;
  placeBall(mg, CX - 10, GOAL_Y + 120, 0, -1500);
  const s0 = g.score;
  run(g, 0.3);
  check(mg.goals === 1 && mg.seq && b.state === 'captured', 'bille franchissant la ligne : BUT, bille dans le filet');
  check(g.score - s0 >= 25000, 'but : points crédités');
  check(sfxLog.get('cbGoal') >= 1 && sfxLog.get('cbCrowd') >= 1, 'but : sons du but et clameur de la foule');
  check(mg.rockets.length > 0 && mg.confetti.length > 0 && mg.callout, 'but : feux d\'artifice, confettis, annonce');
  check(g.said.includes('cbGoal'), 'but : réplique de LUMEN');
  const t0 = mg.timeLeft;
  run(g, 1.6, () => mg.seq ? undefined : false);
  check(!mg.seq && b.state === 'free' && Math.abs(b.x - KICK.x) < 40 && b.y < KICK.y + 60, 'engagement : la bille repart du rond central');
  check(Math.abs(mg.timeLeft - t0) < 0.05, 'chrono gelé pendant la célébration');
  check(mg.barrier.enabled && mg.barrierT > 3, 'engagement protégé par la barrière');
  run(g, 1.2);
  check(b.y > 850 && b.x > 120 && b.x < 440, `la bille d'engagement descend vers un batteur (x ${b.x.toFixed(0)})`);
  check(mg.kSpeed > cyberballTuning(1).kSpeed, 'après le 1er but, le gardien accélère');
  check(dmdLog.includes('LE GARDIEN ACCÉLÈRE'), 'annonce sur l\'afficheur : le gardien accélère');
  // lucarne : contre un montant
  const pts = g.score;
  placeBall(mg, POST_L + POST_RAD + 13 + 4, GOAL_Y + 100, 0, -1400);
  run(g, 0.3);
  check(mg.goals === 2 && mg.lucarnes === 1, 'but contre le montant : LUCARNE');
  check(g.score - pts >= 50000, 'lucarne : points ×2');
  run(g, 1.7, () => mg.seq ? undefined : false);
  check(mg.defs[2] && !mg.defs[2].sleep, 'après le 2e but, un défenseur supplémentaire se réveille');
  // poteau
  const P = mg.posts[1];
  placeBall(mg, P.x - 6, P.y + 90, 0, -1500);     // juste à gauche de l'axe : l'aile ne masque pas le montant
  const ph = mg.postHits;
  run(g, 0.2);
  check(mg.postHits === ph + 1 && sfxLog.get('cbPost') >= 1, 'POTEAU ! détecté (son métallique)');
  check(mg.goals === 2, 'le poteau renvoie la bille (pas de but)');
  // gardien : arrêt puis K.O. sur tir puissant
  mg.keeper.stun = 0; mg.keeper.reboot = 0; mg.perkT = 0;
  run(g, 0.1);
  const K = mg.keeper;
  const sv = mg.saves;
  placeBall(mg, K.x, KEEPER_Y + 60, 0, -700);
  run(g, 0.12);
  check(mg.saves === sv + 1 && K.stun <= 0, 'tir mou sur le gardien : ARRÊT');
  run(g, 0.4);
  placeBall(mg, mg.keeper.x, KEEPER_Y + 80, 0, -(cyberballTuning(1).stunImpact + 500));
  run(g, 0.12);
  check(K.stun > 0 && !K.p.enabled && mg.stuns === 1, 'tir puissant sur le gardien : GARDIEN K.O.');
  check(mg.progressText().includes('BUT OUVERT'), 'en-tête : BUT OUVERT');
  placeBall(mg, K.x, GOAL_Y + 140, 0, -1400);
  const gg = mg.goals;
  run(g, 0.3);
  check(mg.goals === gg + 1, 'gardien assommé : la bille traverse sa position et marque');
  run(g, 1.7, () => mg.seq ? undefined : false);
  run(g, cyberballTuning(1).stunDur + 1);
  check(K.stun <= 0 && K.reboot <= 0 && K.p.enabled, 'le gardien se relève après quelques secondes');
}

// ------------------------------------------------------------------ 6. IA du gardien
log('\n[6] IA du gardien : anticipation, temps de réaction, avantage d\'entrée');
{
  const { g, mg } = startArena(1);
  for (const d of mg.defs) d.sleep = true;
  mg.perkT = 0;
  const K = mg.keeper;
  const [lo, hi] = mg._keeperRange();
  // tir lent vers le coin droit : le gardien a le temps d'anticiper
  K.x = CX; K.vx = 0; K.err = 0;
  placeBall(mg, 220, 700, 205, -1400);           // franchit le rail du gardien vers x ≈ 335
  mg.lastVy = -1; K.err = 0;
  let reached = false;
  run(g, 0.9, () => { if (K.x > CX + 25) reached = true; if (mg.ball.y < KEEPER_Y + 30) return false; });
  check(reached, `le gardien se déplace vers le point d'impact prévu (x ${K.x.toFixed(0)})`);
  // temps de réaction : au début du tir, il ne bouge pas encore
  const bb = placeBall(mg, CX, 900);
  bb.state = 'captured';                          // bille hors jeu : le gardien se recentre
  run(g, 0.6);
  K.x = CX; K.vx = 0;
  placeBall(mg, 380, 900, -60, -2200);
  run(g, 0.08);
  check(Math.abs(K.x - CX) < 6, 'temps de réaction : immobile pendant les premiers instants');
  // butées
  check(K.x >= lo - 0.01 && K.x <= hi + 0.01, 'le gardien reste dans sa zone');
  // avantage d'entrée : réaction doublée
  const { mg: m2 } = startArena(1);
  check(m2.perkT > 9, 'avantage actif au début du minijeu');
  const T1 = cyberballTuning(1), T3 = cyberballTuning(3);
  check(T3.kSpeed > T1.kSpeed && T3.react < T1.react && T3.hl > T1.hl && T3.stunImpact > T1.stunImpact, 'niveaux suivants : gardien plus rapide, plus vif, plus large, plus solide');
  check(T3.goals >= T1.goals, `objectif niv. 3 : ${T3.goals} buts`);
}

// ------------------------------------------------------------------ 7. chute, bouclier, progression conservée, réussite
log('\n[7] Chute, bouclier (but de NULL), progression conservée, réussite et récompenses');
{
  // bouclier : NULL marque, même bille relancée
  const { g, mg } = startArena(1);
  const id = mg.world.balls[0].id;
  g.bonus.grant('shield');
  mg.barrierT = 0; mg.barrier.enabled = false;
  placeBall(mg, 300, 1200, 0, 100);
  run(g, 0.05);
  check(mg.state === 'relaunch' && mg.pendingBall && mg.pendingBall.id === id, 'bouclier : relance de la même bille');
  check(mg.nullGoals === 1 && mg.progressText().includes('0 – 1 NULL'), 'bouclier consommé : NULL marque au tableau');
  check(g.said.includes('cbNullGoal'), 'NULL commente son but');
  run(g, 12, () => mg.state === 'play' ? false : undefined);
  check(mg.state === 'play' && mg.world.balls[0].id === id, 'la bille est relancée dans l\'arène');
  // deux buts puis chute : retour au plateau, progression gardée
  const before = g.ballsLeft;
  noOpposition(mg);
  for (let k = 0; k < 2; k++) { placeBall(mg, CX, GOAL_Y + 120, 0, -1500); run(g, 2.2, () => mg.seq || mg.goals < k + 1 ? undefined : false); }
  check(mg.goals === 2, 'deux buts marqués');
  mg.barrierT = 0; mg.barrier.enabled = false;
  placeBall(mg, 300, 1200, 0, 100);
  run(g, 4, () => g.scene === 'table' && !g.transition ? false : undefined);
  check(g.scene === 'table' && g.table.world.balls[0] && g.table.world.balls[0].id === id, 'chute : la même bille revient sur le plateau');
  check(g.ballsLeft === before, 'aucune bille consommée');
  const kept = g.table.sectors.arena.kept;
  check(kept && kept.goals === 2, `progression mémorisée (${JSON.stringify(kept)})`);
  const mg2 = restart(g);
  check(mg2 && mg2.goals === 2 && mg2.progressText().includes('2/5'), 'nouvelle tentative : 2 buts déjà au tableau');
  check(mg2.kSpeed > cyberballTuning(1).kSpeed && !mg2.defs[2].sleep, 'la montée en puissance correspond aux buts conservés');
  // plafond de la progression gardée
  mg2.goals = 4;
  check(mg2.keepProgress().goals === 3, 'au plus 3 buts conservés');
  mg2.goals = 2;
  // réussite
  noOpposition(mg2);
  let guard = 0;
  while (g.minigame === mg2 && mg2.state !== 'ended' && guard++ < 20) {
    placeBall(mg2, CX, GOAL_Y + 120, 0, -1500);
    run(g, 2.5, () => mg2.state === 'ended' || (!mg2.seq && mg2.ball && mg2.ball.state === 'free' && mg2.ball.y > 500) ? false : undefined);
  }
  check(mg2.state === 'ended' && mg2.goals === 5, '5 buts : victoire');
  run(g, 5, () => g.scene === 'table' && !g.transition ? false : undefined);
  check(g.scene === 'table' && g.table.sectors.arena.done, 'secteur ARÈNE réactivé');
  check(g.bonus.multLevel >= 2 && g.bonus.magnetT > 0, 'récompenses : multiplicateur et aimant');
  check(!g.table.sectors.arena.kept, 'progression effacée après la réussite');
  check(g.ledgerErrors === 0, 'comptabilité des billes sans erreur');
  // chrono écoulé
  const { g: g3, mg: m3 } = startArena(1);
  let res = null;
  const fin = m3.finish.bind(m3);
  m3.finish = (s, reason, d) => { res = res || { s, reason }; fin(s, reason, d); };
  m3.timeLeft = 0.05;
  run(g3, 0.2);
  check(res && !res.s && res.reason === 'timeout', 'chrono écoulé : échec');
}

// ------------------------------------------------------------------ 8. parties automatiques
log(`\n[8] Parties automatiques : ${RUNS} parties par niveau, pilote et mode`);
// modes : règles réelles (chute = fin du minijeu) et boucliers illimités (seuls le chrono et
// l'opposition comptent : difficulté propre au minijeu, comme dans test-defense.js)
const PILOTS = [
  { name: 'réflexe simple', make: () => (g, input) => reflexBot(g, input, 0.7) },
  { name: 'tireur qui vise', make: () => makeAimBot(0.04) },
];
const MODES = [
  { name: 'règles réelles', shields: false },
  { name: 'boucliers illimités', shields: true },
];

function playSession(g, input, mg, pilot, mode = MODES[0]) {
  const out = { win: false, reason: 'none', t: 0, goals: 0, goalsNow: 0, saves: 0, stuns: 0, posts: 0, lucarnes: 0, crosses: 0, unstuck: 0,
    nan: false, error: null, maxAway: 0, ms: 0, ticks: 0, ledger: 0 };
  let res = null;
  const fin = mg.finish.bind(mg);
  mg.finish = (s, reason, drained) => { res = res || { s, reason, t: mg.time }; fin(s, reason, drained); };
  let launchHold = 0, away = 0;
  try {
    for (let i = 0; i < 140 / DT; i++) {
      if (g.minigame !== mg || mg.state === 'ended') break;
      if (mode.shields && g.bonus.shield === 0) g.bonus.grant('shield');
      pilot(g, input);
      if (mg.launchReady()) { launchHold += DT; input.s.launch = (launchHold % 1.2) < 0.75; } else { launchHold = 0; input.s.launch = false; }
      const b = mg.world.balls[0];
      if (b && b.state === 'free') {
        if (!Number.isFinite(b.x) || !Number.isFinite(b.y) || !Number.isFinite(b.vx)) out.nan = true;
        if (b.y > 850) away = 0; else { away += DT; out.maxAway = Math.max(out.maxAway, away); }
      } else away = 0;
      const t0 = performance.now();
      g.tick(DT);
      out.ms += performance.now() - t0; out.ticks++;
    }
  } catch (e) { out.error = e; }
  input.releaseAll();
  if (res) { out.win = res.s; out.reason = res.reason; out.t = res.t; }
  out.goals = mg.goals; out.goalsNow = mg.goalsNow; out.saves = mg.saves; out.stuns = mg.stuns; out.posts = mg.postHits;
  out.lucarnes = mg.lucarnes; out.crosses = mg.crosses; out.unstuck = mg.unstuck; out.ledger = g.ledgerErrors;
  return out;
}

const pct = (n, d) => `${Math.round(100 * n / Math.max(1, d))} %`;
const avg = (a, f) => a.reduce((s, x) => s + f(x), 0) / Math.max(1, a.length);
const summary = {};
for (const level of [1, 2, 3]) {
  for (const P of PILOTS) {
    for (const M of MODES) {
      if (level === 3 && !M.shields) continue;
      const rs = [];
      for (let i = 0; i < RUNS; i++) {
        const { g, input, mg } = startArena(level);
        rs.push(playSession(g, input, mg, P.make(), M));
      }
      const wins = rs.filter(r => r.win).length;
      const reasons = {};
      for (const r of rs) reasons[r.reason] = (reasons[r.reason] || 0) + 1;
      const key = `niv. ${level}, ${P.name}, ${M.name}`;
      summary[key] = { wins, rs };
      log(`  — ${key} : victoires ${wins}/${RUNS} (${pct(wins, RUNS)}) · issues ${JSON.stringify(reasons)}`);
      log(`    buts ${avg(rs, r => r.goals).toFixed(2)}/partie (lucarnes ${avg(rs, r => r.lucarnes).toFixed(2)}) · corners ${avg(rs, r => r.crosses).toFixed(1)} · arrêts ${avg(rs, r => r.saves).toFixed(1)} · K.O. ${avg(rs, r => r.stuns).toFixed(2)} · poteaux ${avg(rs, r => r.posts).toFixed(2)} · durée ${avg(rs, r => r.t).toFixed(1)} s (victoires ${avg(rs.filter(r => r.win), r => r.t).toFixed(1)} s)`);
      log(`    hors batteurs max ${Math.max(...rs.map(r => r.maxAway)).toFixed(1)} s · déblocages ${rs.reduce((s, r) => s + r.unstuck, 0)} · ${(avg(rs, r => r.ms / Math.max(1, r.ticks)) * 1000).toFixed(0)} µs/pas`);
      check(rs.every(r => !r.error), 'aucune exception' + (rs.find(r => r.error) ? ' : ' + rs.find(r => r.error).error.stack : ''));
      check(rs.every(r => !r.nan), 'aucune valeur NaN');
      check(rs.every(r => r.reason !== 'none'), 'chaque partie se termine (victoire, chute ou chrono)');
      check(rs.every(r => r.maxAway < 15), `la bille revient toujours vers les batteurs (max ${Math.max(...rs.map(r => r.maxAway)).toFixed(1)} s hors zone)`);
      check(rs.reduce((s, r) => s + r.unstuck, 0) <= Math.ceil(RUNS / 10), 'aucun blocage notable (déblocages automatiques rares)');
      check(rs.every(r => r.ledger === 0), 'comptabilité des billes sans erreur');
    }
  }
}

// campagne : tentatives successives avec buts conservés (pilote réflexe)
log('\n[9] Campagne : tentatives successives avec progression conservée (pilote réflexe)');
for (const level of [1, 2]) {
  const att = [];
  let errors = 0;
  for (let i = 0; i < RUNS; i++) {
    let { g, input, mg } = startArena(level);
    let n = 0, won = false;
    const pilot = (gg, inp) => reflexBot(gg, inp, 0.7);
    while (n < 6 && mg) {
      n++;
      const r = playSession(g, input, mg, pilot, MODES[0]);
      if (r.error) { errors++; break; }
      if (r.win) { won = true; break; }
      run(g, 5, () => g.scene === 'table' && !g.transition ? false : undefined);
      // la bille ressort du portail (brièvement retenue par l'aimant du barillet)
      run(g, 5, () => g.table.world.balls.some(b => b.state === 'free') ? false : undefined);
      if (g.scene !== 'table' || !g.table.world.balls.some(b => b.state === 'free')) break;
      mg = restart(g);
      if (!mg || g.scene !== 'minigame') break;
    }
    att.push(won ? n : 99);
  }
  const within = (k) => att.filter(a => a <= k).length;
  log(`  niv. ${level} : réussite en 1 tentative ${pct(within(1), RUNS)} · ≤ 2 : ${pct(within(2), RUNS)} · ≤ 3 : ${pct(within(3), RUNS)} · ≤ 6 : ${pct(within(6), RUNS)}`);
  check(errors === 0, 'campagne sans exception');
  if (level === 1 && RUNS >= 20) check(within(3) / RUNS >= 0.6, 'niveau 1 : au moins 60 % des campagnes réussies en 3 tentatives');
}

// taux de victoire : un joueur moyen (entre réflexe et visée) ≈ 2 fois sur 3 au niveau 1,
// mesuré sur la difficulté propre du minijeu (boucliers illimités, comme pour la DÉFENSE)
const W = (lvl, p, m) => summary[`niv. ${lvl}, ${p}, ${m}`].wins / RUNS;
const midOf = (lvl) => (W(lvl, 'réflexe simple', 'boucliers illimités') + W(lvl, 'tireur qui vise', 'boucliers illimités')) / 2;
const mid = midOf(1), mid2 = midOf(2), mid3 = midOf(3);
const real1 = (W(1, 'réflexe simple', 'règles réelles') + W(1, 'tireur qui vise', 'règles réelles')) / 2;
log(`\n  joueur « moyen » (moyenne des deux pilotes, boucliers illimités) : niv. 1 ${Math.round(100 * mid)} % · niv. 2 ${Math.round(100 * mid2)} % · niv. 3 ${Math.round(100 * mid3)} %`);
log(`  règles réelles niv. 1 (chutes de la moitié basse comprises) : ${Math.round(100 * real1)} %`);
if (RUNS >= 20) {
  check(mid >= 0.55 && mid <= 0.9, `niveau 1 : un joueur moyen réussit environ 2 fois sur 3 (${Math.round(100 * mid)} %)`);
  check(mid3 < mid2 && mid2 <= mid + 0.05, 'la difficulté monte avec le niveau');
} else log(`  (taux indicatifs sur ${RUNS} parties)`);

log(`\nSons demandés : ${[...sfxLog.keys()].filter(k => k.startsWith('cb')).sort().join(', ')}`);
log(`\nRésultat : ${passes} vérifications réussies, ${failures} échec(s).`);
process.exit(failures ? 1 : 0);
