// Tests headless (Node) : physique, lanceur, comptabilité des billes, minijeux,
// transitions, cumul des bonus, multibille, pause.  Usage : node tools/sim-tests.js
import { Game } from '../src/game/game.js';
import { RULES, BONUS_RULES } from '../src/config.js';
import { L } from '../src/game/tableLayout.js';

const DT = 1 / 120;
let failures = 0, passes = 0;
const log = (...a) => console.log(...a);
function check(cond, msg) {
  if (cond) { passes++; log('  ✔', msg); } else { failures++; log('  ✘', msg); }
}

// ------------------------------------------------------------------ simulacres
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
const fx = { spark: noop, burst: noop, ring: noop, text: noop, flash: noop, shake: noop, drain: noop, update: noop, clear: noop };
const music = { setMode: noop, setIntensity: noop, setTension: noop, setFlag: noop, bump: noop, currentChord: () => [220, 261.6, 329.6] };
const audio = { music, sfx: noop, impact: noop, speak: noop, setPaused: noop, chargeLevel: noop, stopCharge: noop };
const events = [];
const ui = {
  banner: (t, s) => events.push('banner:' + t + (s ? ' | ' + s : '')), lumen: noop, tally: noop, flashBalls: noop,
  onGameStart: noop, showPause: noop, showTitle: noop, showGameOver: () => events.push('gameover'),
};

function makeGame() {
  const input = new BotInput();
  const settings = { reducedMotion: false, reducedFx: false };
  const g = new Game({ renderer: { fx, render: noop, alpha: 1 }, audio, input, ui, settings });
  g.scores = { best: 0, rank: () => -1, add: noop, list: [] };
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

// pilote automatique simple : frappe quand une bille approche d'un batteur
function bot(g, input, skill = 0.7) {
  const t = g.table;
  let l = false, r = false;
  const balls = g.scene === 'minigame' ? g.minigame.world.balls : t.world.balls;
  for (const b of balls) {
    if (b.state !== 'free') continue;
    if (b.y > 870 && b.y < 1000 && b.vy > -200) {
      if (b.x < 281 && b.x > 150 && Math.random() < skill) l = true;
      if (b.x >= 281 && b.x < 420 && Math.random() < skill) r = true;
    }
  }
  input.s.left = l; input.s.right = r;
}

// ------------------------------------------------------------------ 1. lanceur
log('\n[1] Carte du lanceur (puissance → première destination)');
{
  const rows = [];
  for (let p = 0.12; p <= 1.0001; p += 0.08) {
    const { g } = makeGame();
    g.newGame();
    const t = g.table;
    let first = null;
    const oLane = t.onLane.bind(t), oOrbit = t.onOrbit.bind(t);
    t.onLane = (i, b, d) => { if (!first) first = 'couloir ' + 'CPU'[i]; oLane(i, b, d); };
    t.onOrbit = (s, d, b) => { if (!first && d < 0) first = (s === 'L' ? 'orbite gauche' : 'orbite droite') + ' (descente)'; oOrbit(s, d, b); };
    t.launch(p);
    run(g, 3, () => { if (first) return false; if (t.shooterBall && t.time > 0.4 && !t.plunger.auto) { first = 'retombe au lanceur'; return false; } });
    rows.push(`${p.toFixed(2)} → ${first || 'plateau (bumpers)'}`);
  }
  log('  ' + rows.join('\n  '));
}

// ------------------------------------------------------------------ 2. robustesse physique
log('\n[2] Robustesse : 600 billes depuis des zones ouvertes, vitesses aléatoires (10 s)');
{
  const { g } = makeGame();
  g.newGame();
  const t = g.table, w = t.world;
  for (const b of [...w.balls]) w.removeBall(b);
  t.shooterBall = null;
  let lost = 0, drained = 0, maxSub = 0;
  const origDrain = t.onDrain.bind(t);
  t.onDrain = () => { drained++; };
  const origQueue = t.queueLaunch.bind(t);
  t.queueLaunch = () => { lost++; };
  const { Ball } = await import('../src/physics/ball.js');
  const starts = [[281, 160, 120], [150, 250, 40], [420, 250, 40], [281, 620, 120], [200, 760, 40], [360, 760, 40], [281, 520, 30]];
  for (let k = 0; k < 600; k++) {
    const s = starts[k % starts.length];
    const b = new Ball(s[0] + (Math.random() * 2 - 1) * s[2], s[1] + (Math.random() * 2 - 1) * 20);
    const a = Math.random() * Math.PI * 2, sp = Math.random() * 3500;
    b.vx = Math.cos(a) * sp; b.vy = Math.sin(a) * sp;
    w.addBall(b);
    for (let i = 0; i < 1200; i++) {
      t.R.flipL.pressed = Math.random() < 0.3; t.R.flipR.pressed = Math.random() < 0.3;
      b.px = b.x; b.py = b.y;
      w.step(DT);
      maxSub = Math.max(maxSub, w.substepsLast);
      t._checkBalls(DT);
      if (!w.balls.includes(b)) break;
    }
    if (w.balls.includes(b)) w.removeBall(b);
  }
  t.onDrain = origDrain; t.queueLaunch = origQueue;
  log(`  évacuées normalement : ${drained}, hors limites ou bloquées (récupérées automatiquement) : ${lost}, sous-pas max : ${maxSub}`);
  check(lost <= 3, `au plus 0,5 % de billes récupérées automatiquement (${lost}/600)`);
}

// ------------------------------------------------------------------ 3. partie automatique
log('\n[3] Parties automatiques (pilote simple, 3 × 150 s)');
for (let seed = 0; seed < 3; seed++) {
  const { g, input } = makeGame();
  g.newGame();
  const stats = { ramps: 0, loops: 0, portal: 0, lanes: 0, minigames: 0 };
  const t = g.table;
  const o = { exit: t.onRampExit.bind(t), orbit: t.onOrbit.bind(t), shutter: t.onShutter.bind(t) };
  t.onRampExit = (s, d, b) => { if (d < 0) stats.ramps++; o.exit(s, d, b); };
  const startMg = g.startMinigame.bind(g);
  g.startMinigame = (...a) => { stats.minigames++; startMg(...a); };
  let launchHold = 0;
  run(g, 150, () => {
    if (g.state !== 'play') return false;
    bot(g, input);
    // lancement : charge ~0.6 s
    const needLaunch = (g.scene === 'table' && t.shooterBall && !t.plunger.auto) || (g.minigame && g.minigame.launchReady && g.minigame.launchReady());
    if (needLaunch) { launchHold += DT; input.s.launch = (launchHold % 1.2) < 0.75; } else { launchHold = 0; input.s.launch = false; }
    if (g.scene === 'minigame' && g.minigame.paddle) {
      const b = g.minigame.world.balls[0];
      if (b) { input.s.left = b.x < g.minigame.paddle.x - 10; input.s.right = b.x > g.minigame.paddle.x + 10; }
    }
  });
  log(`  partie ${seed + 1} : score ${g.score}, billes restantes ${g.ballsLeft}, état ${g.state}, rampes ${stats.ramps}, minijeux ${stats.minigames}, erreurs de comptabilité ${g.ledgerErrors}`);
  check(g.ledgerErrors === 0, 'aucune bille dupliquée');
}

// ------------------------------------------------------------------ 4. minijeux : perte, relance, réussite, échec
log('\n[4] Minijeux : continuité de la bille et réserve commune');
for (const sector of ['hangar', 'reactor', 'defense', 'core']) {
  log(`  — ${sector}`);
  const { g, input } = makeGame();
  g.newGame();
  const t = g.table;
  t.launch(0.5);
  run(g, 0.5);
  const ball = t.world.balls[0];
  const id = ball.id;
  g.debug('start', sector);
  run(g, 3, () => g.scene !== 'minigame' ? undefined : false);
  check(g.scene === 'minigame', 'transition vers le minijeu terminée');
  const mg = g.minigame;
  check(mg.world.balls.length === 1 && mg.world.balls[0].id === id, 'la même bille (id conservé) est entrée dans le minijeu');
  check(t.world.balls.length === 0, 'plus aucune bille sur le plateau');
  const before = g.ballsLeft;
  // perte physique de la bille
  mg.barrierT = 0; if (mg.barrier) mg.barrier.enabled = false;
  for (const b of mg.world.balls) { b.x = 300; b.y = 1200; b.vy = 100; }
  run(g, 0.05);
  check(g.ballsLeft === before - 1, `perte en minijeu : réserve ${before} → ${g.ballsLeft}`);
  check(mg.state === 'relaunch', 'en attente de relance');
  const progressBefore = mg.progressText();
  // relance via la commande de lancement
  let held = 0;
  run(g, 3, () => { held += DT; input.s.launch = held < 0.5; if (mg.state === 'play' && held > 0.6) return false; });
  input.s.launch = false;
  check(mg.state === 'play' && mg.world.balls.length === 1, 'relance avec la commande habituelle');
  check(mg.progressText() === progressBefore, `progression conservée (${progressBefore})`);
  // réussite
  const relaunchedId = mg.world.balls[0].id;
  mg.debugWin();
  run(g, 4, () => g.scene === 'table' && !g.transition ? false : undefined);
  check(g.scene === 'table', 'retour au plateau après réussite');
  check(t.world.balls.length === 1 && t.world.balls[0].id === relaunchedId, 'la bille du minijeu revient sur le plateau (pas de doublon)');
  check(g.bonus.saveT > 0, 'courte protection active au retour');
  check(t.sectors[sector].done || sector === 'core', 'secteur réactivé');
  check(g.ledgerErrors === 0, 'comptabilité sans erreur');
}

log('\n[5] Minijeu : échec par chrono (bille en jeu) et par chrono (bille en attente)');
{
  const { g } = makeGame();
  g.newGame();
  g.table.launch(0.5); run(g, 0.5);
  g.debug('start', 'hangar');
  run(g, 3, () => g.scene === 'minigame' ? false : undefined);
  const mg = g.minigame;
  const before = g.ballsLeft;
  mg.timeLeft = 0.02;
  run(g, 4, () => g.scene === 'table' ? false : undefined);
  check(g.scene === 'table' && g.table.world.balls.length === 1 && g.table.world.balls[0].state === 'free', 'échec au chrono : la bille revient en jeu sur le plateau');
  check(g.ballsLeft === before, 'aucune bille consommée');
  check(g.table.sectorState('hangar') === 'locked', 'secteur à requalifier après échec');

  // perte puis chrono écoulé pendant l'attente : la bille de remplacement va au lanceur
  g.debug('qualify', 'hangar');
  const b2 = g.table.world.balls[0];
  g.table.world.removeBall(b2);
  g.startMinigame('hangar', b2, 281, 430);
  run(g, 3, () => g.scene === 'minigame' ? false : undefined);
  const mg2 = g.minigame;
  mg2.barrierT = 0; if (mg2.barrier) mg2.barrier.enabled = false;
  for (const b of mg2.world.balls) b.y = 1200;
  run(g, 0.05);
  const left = g.ballsLeft;
  mg2.state = 'play'; mg2.timeLeft = 0.01; mg2.state = 'relaunch';
  mg2.finish(false, 'timeout');
  run(g, 4, () => g.scene === 'table' ? false : undefined);
  check(g.table.shooterBall && g.table.world.balls.length === 1, 'bille en attente servie au lanceur du plateau');
  check(g.ballsLeft === left, 'pas de consommation supplémentaire');
}

log('\n[6] Dernière bille perdue dans un minijeu → fin de partie');
{
  const { g } = makeGame();
  g.newGame();
  g.ballsLeft = 1;
  g.table.launch(0.5); run(g, 0.5);
  g.debug('start', 'defense');
  run(g, 3, () => g.scene === 'minigame' ? false : undefined);
  const mg = g.minigame;
  mg.barrierT = 0; if (mg.barrier) mg.barrier.enabled = false;
  for (const b of mg.world.balls) b.y = 1200;
  run(g, 0.1);
  check(g.state === 'over' && g.ballsLeft === 0, 'partie terminée quand la dernière bille est perdue');
}

log('\n[7] Multibille : accès mis en attente puis rétablis');
{
  const { g } = makeGame();
  g.newGame();
  const t = g.table;
  t.launch(0.6); run(g, 1);
  g.debug('qualify', 'hangar');
  check(t.sectorState('hangar') === 'ready', 'HANGAR accessible avant multibille');
  t.beginMultiball(2, 'replication');
  check(t.sectorState('hangar') === 'hold', 'HANGAR en attente pendant la multibille');
  check(!g.canStartMinigame(), 'aucun minijeu ne peut démarrer');
  run(g, 3);
  check(t.world.balls.length >= 2, `plusieurs billes en jeu (${t.world.balls.length})`);
  const keep = t.world.balls.find(b => b.state === 'free');
  for (const b of [...t.world.balls]) if (b !== keep) t.world.removeBall(b);
  t.launchQueue.length = 0;
  g.bonus.saveT = 0;
  run(g, 0.1);
  check(!t.multiball, 'fin de multibille à une seule bille');
  check(t.sectorState('hangar') === 'ready', 'accès HANGAR rétabli et conservé');
}

log('\n[8] Cumul et plafonds des bonus');
{
  const { g } = makeGame();
  g.newGame();
  const B = g.bonus;
  for (let i = 0; i < 6; i++) B.grant('mult');
  check(B.multLevel === BONUS_RULES.multMax, `multiplicateur plafonné à ×${BONUS_RULES.multMax}`);
  B.grant('shield'); B.grant('shield');
  check(B.shield === 1 && B.saveT >= BONUS_RULES.shieldOverflowSave - 0.01, 'bouclier : 1 charge max, surplus converti en sauvegarde');
  B.grant('phase'); g.tick(DT * 120); B.grant('phase');
  check(Math.abs(B.phaseT - BONUS_RULES.phaseDuration) < 0.05, 'noyau phasique : durée relancée sans cumul');
  for (let i = 0; i < 6; i++) B.grant('rampJackpot');
  check(B.rampJStacks <= BONUS_RULES.rampJackpotMaxStacks, `jackpot de rampe : ${B.rampJStacks} paliers (max ${BONUS_RULES.rampJackpotMaxStacks})`);
  for (let i = 0; i < 8; i++) B.grant('bumper');
  check(B.bumperLevel === BONUS_RULES.bumperLevelMax, 'bumpers plafonnés');
  for (let i = 0; i < 5; i++) B.grant('deferredMB', { count: 1 });
  check(B.deferredMB === BONUS_RULES.deferredMultiballMax, 'multibille différée plafonnée');
  B.grant('mult');
  const mt = B.multT;
  g.scene = 'minigame'; g.bonus.paused = true; B.update(5); g.scene = 'table'; B.paused = false;
  check(B.multT === mt, 'effets de plateau gelés pendant un minijeu');
  for (let i = 0; i < 6; i++) g.awardExtraBall('test');
  check(g.ballsLeft <= RULES.maxBalls, `réserve plafonnée (${g.ballsLeft} ≤ ${RULES.maxBalls})`);
}

log('\n[9] Pause / reprise');
{
  const { g, input } = makeGame();
  g.newGame();
  g.table.launch(0.8); run(g, 0.3);
  const b = g.table.world.balls[0];
  const y = b.y;
  input.s.left = true;
  g.pause();
  check(g.state === 'pause', 'état pause');
  g.frame(0.1); g.frame(0.1);
  check(b.y === y, 'simulation figée pendant la pause');
  g.resume();
  check(g.resumeT > 0, 'courte grâce à la reprise');
  g.frame(0.1);
  check(b.y === y, 'pas de mouvement pendant le décompte');
}

log(`\nRésultat : ${passes} vérifications réussies, ${failures} échec(s).`);
process.exit(failures ? 1 : 0);
