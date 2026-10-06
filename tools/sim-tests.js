// Tests headless (Node) : physique, lanceur, comptabilité des billes, minijeux,
// transitions, cumul des bonus, multibille, pause.  Usage : node tools/sim-tests.js
import { Game } from '../src/game/game.js';
import { RULES, BONUS_RULES, SECTORS } from '../src/config.js';
import { L, T } from '../src/game/tableLayout.js';

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
const fx = { spark: noop, burst: noop, ring: noop, text: noop, flash: noop, shake: noop, drain: noop, arc: noop, sweep: noop, update: noop, clear: noop };
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
  let deckOk = true, weakOk = true;
  for (let p = 0.12; p <= 1.0001; p += 0.08) {
    const { g } = makeGame();
    g.newGame();
    const t = g.table;
    let first = null;
    const oLane = t.onLane.bind(t), oOrbit = t.onOrbit.bind(t), oDeck = t.onPlungeDeck.bind(t);
    t.onPlungeDeck = (b) => { if (!first) first = 'pont supérieur'; oDeck(b); };
    t.onLane = (i, b, d) => { if (!first) first = 'couloir ' + 'CPU'[i]; oLane(i, b, d); };
    t.onOrbit = (s, d, b) => { if (!first && d < 0) first = (s === 'L' ? 'orbite gauche' : 'orbite droite') + ' (descente)'; oOrbit(s, d, b); };
    t.launch(p);
    run(g, 3, () => { if (first) return false; if (t.shooterBall && t.time > 0.4 && !t.plunger.auto) { first = 'retombe au lanceur'; return false; } });
    rows.push(`${p.toFixed(2)} → ${first || 'plateau (bumpers)'}`);
    if (p >= 0.5) deckOk = deckOk && first === 'pont supérieur';
    if (p < 0.25) weakOk = weakOk && first === 'retombe au lanceur';
  }
  log('  ' + rows.join('\n  '));
  check(deckOk, 'un lancer franc (≥ 50 %) mène toujours au pont supérieur');
  check(weakOk, 'un lancer trop faible retombe au lanceur');
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
  // [x, y, dispersion, couche] : plateau, couloirs d'orbite, pont supérieur
  const starts = [[281, 230, 60], [150, 330, 30], [420, 330, 30], [281, 620, 120], [200, 760, 40], [360, 760, 40], [281, 520, 30], [41, 300, 8], [521, 300, 8], [281, 20, 100, 2], [150, 30, 30, 2], [420, 30, 30, 2]];
  for (let k = 0; k < 600; k++) {
    const s = starts[k % starts.length];
    const b = new Ball(s[0] + (Math.random() * 2 - 1) * s[2], s[1] + (Math.random() * 2 - 1) * 20);
    b.layer = s[3] || 0;
    const a = Math.random() * Math.PI * 2, sp = Math.random() * 3500;
    b.vx = Math.cos(a) * sp; b.vy = Math.sin(a) * sp;
    w.addBall(b);
    for (let i = 0; i < 1200; i++) {
      t.R.flipL.pressed = t.R.deck.flipL.pressed = Math.random() < 0.3;
      t.R.flipR.pressed = t.R.deck.flipR.pressed = Math.random() < 0.3;
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
  const oDeckRamp = t.onDeckRamp.bind(t);
  t.onDeckRamp = (b) => { stats.ramps++; oDeckRamp(b); };
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

// ------------------------------------------------------------------ 4. minijeux : chute, bouclier, réussite
log('\n[4] Minijeux : continuité de la bille, chute = retour au plateau sans perte');
for (const sector of (process.env.LN_SECTORS || 'hangar,reactor,tag,defense,vault,arena,core').split(',')) {
  log(`  — ${sector}`);
  const { g } = makeGame();
  g.newGame();
  const t = g.table;
  t.launch(0.5);
  run(g, 0.5);
  const ball = t.world.balls[0];
  const id = ball.id;
  g.debug('start', sector);
  run(g, 3, () => g.scene !== 'minigame' ? undefined : false);
  check(g.scene === 'minigame', 'transition vers le minijeu terminée');
  let mg = g.minigame;
  check(mg.world.balls.length === 1 && mg.world.balls[0].id === id, 'la même bille (id conservé) est entrée dans le minijeu');
  check(t.world.balls.length === 0, 'plus aucune bille sur le plateau');
  const before = g.ballsLeft;
  // 1) chute avec un bouclier : relance automatique de la même bille dans le minijeu
  g.bonus.grant('shield');
  mg.barrierT = 0; if (mg.barrier) mg.barrier.enabled = false;
  for (const b of mg.world.balls) { b.x = 300; b.y = 1200; b.vy = 100; }
  run(g, 0.05);
  check(g.ballsLeft === before && g.bonus.shield === 0, 'chute avec bouclier : bouclier consommé, réserve intacte');
  check(mg.state === 'relaunch' && mg.pendingBall && mg.pendingBall.id === id, 'relance automatique de la même bille');
  run(g, 2, () => mg.state === 'play' ? false : undefined);
  check(mg.state === 'play' && mg.world.balls.length === 1 && mg.world.balls[0].id === id, 'la bille est relancée dans le minijeu');
  // 2) chute sans bouclier : fin du minijeu, retour au plateau, aucune bille consommée
  mg.barrierT = 0; if (mg.barrier) mg.barrier.enabled = false;
  for (const b of mg.world.balls) { b.x = 300; b.y = 1200; b.vy = 100; }
  run(g, 4, () => g.scene === 'table' && !g.transition ? false : undefined);
  check(g.scene === 'table', 'chute sans bouclier : retour au plateau principal');
  check(g.ballsLeft === before, `aucune bille consommée (${before} → ${g.ballsLeft})`);
  const side = SECTORS[sector].barrel;
  if (side) {
    check(t.magnet && t.magnet.ball.id === id && !!t.barrels[side].anim, 'retour : le barillet pivote, l\'aimant de l\'œil retient la bille');
    run(g, 5, () => t.magnet ? undefined : false);
  }
  check(t.world.balls.length === 1 && t.world.balls[0].id === id && t.world.balls[0].state === 'free', 'la même bille revient en jeu sur le plateau');
  check(g.bonus.saveT > 0, 'courte protection au retour');
  check(!t.sectors[sector].done, 'secteur non réactivé après une chute');
  // 3) nouvelle tentative : réussite
  g.debug('qualify', sector);
  g.debug('start', sector);
  run(g, 3, () => g.scene !== 'minigame' ? undefined : false);
  mg = g.minigame;
  check(g.scene === 'minigame' && mg.world.balls[0].id === id, 'nouvelle tentative avec la même bille');
  mg.debugWin();
  run(g, 4, () => g.scene === 'table' && !g.transition ? false : undefined);
  check(g.scene === 'table', 'retour au plateau après réussite');
  check(t.world.balls.length === 1 && t.world.balls[0].id === id, 'la bille du minijeu revient sur le plateau (pas de doublon)');
  check(g.bonus.saveT > 0, 'courte protection active au retour');
  check(t.sectors[sector].done || sector === 'core', 'secteur réactivé');
  check(g.ledgerErrors === 0, 'comptabilité sans erreur');
}

log('\n[5] Minijeu : échec au chrono (bille en jeu, bille en attente) et progression conservée');
{
  const { g } = makeGame();
  g.newGame();
  g.table.launch(0.5); run(g, 0.5);
  g.debug('start', 'defense');
  run(g, 3, () => g.scene === 'minigame' ? false : undefined);
  const mg = g.minigame;
  const before = g.ballsLeft;
  mg.cleared = 1;
  mg.timeLeft = 0.02;
  run(g, 4, () => g.scene === 'table' ? false : undefined);
  run(g, 5, () => g.table.magnet ? undefined : false);
  check(g.scene === 'table' && g.table.world.balls.length === 1 && g.table.world.balls[0].state === 'free', 'échec au chrono : la bille revient en jeu sur le plateau');
  check(g.ballsLeft === before, 'aucune bille consommée');
  check(g.table.sectors.defense.kept && g.table.sectors.defense.kept.wave === 1, 'progression du secteur mémorisée');
  g.debug('qualify', 'defense');
  g.debug('start', 'defense');
  run(g, 3, () => g.scene === 'minigame' ? false : undefined);
  check(g.minigame && g.minigame.cleared === 1, 'la tentative suivante reprend la progression');

  // bille en attente de relance (bouclier) quand le chrono expire : elle va au lanceur
  const mg2 = g.minigame;
  const id2 = mg2.world.balls[0].id;
  g.bonus.grant('shield');
  mg2.barrierT = 0; if (mg2.barrier) mg2.barrier.enabled = false;
  for (const b of mg2.world.balls) b.y = 1200;
  run(g, 0.05);
  check(mg2.state === 'relaunch', 'bille en attente de relance');
  mg2.finish(false, 'timeout');
  run(g, 4, () => g.scene === 'table' ? false : undefined);
  check(g.table.shooterBall && g.table.world.balls.length === 1 && g.table.shooterBall.id === id2, 'bille en attente servie au lanceur du plateau (même identité)');
  check(g.ballsLeft === before, 'pas de consommation de bille');
}

log('\n[6] Dernière bille : une chute en minijeu ne termine pas la partie');
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
  run(g, 4, () => g.scene === 'table' ? false : undefined);
  check(g.state === 'play' && g.ballsLeft === 1 && g.table.world.balls.length === 1, 'partie poursuivie sur le plateau, réserve intacte');
  run(g, 5, () => g.table.magnet ? undefined : false);
  g.bonus.saveT = 0;
  g.debug('drain');
  run(g, 6, () => g.state === 'over' ? false : undefined);
  check(g.state === 'over', 'la perte de la dernière bille sur le plateau termine la partie');
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
  check(g.ballsLeft <= g.maxBalls, `réserve plafonnée (${g.ballsLeft} ≤ ${g.maxBalls})`);
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

log('\n[10] Pont supérieur, cibles tombantes, kickback, UPLINK');
{
  // bille posée sur le pont, sans jouer : elle redescend toujours par le centre
  let down = 0, n = 0;
  for (let k = 0; k < 30; k++) {
    const { g } = makeGame();
    g.newGame();
    const t = g.table;
    const b = t.shooterBall; t.shooterBall = null;
    b.state = 'free'; b.layer = 2; b.setPos(90 + k * 13, 10 + (k % 5) * 14); b.vx = (k % 2 ? 1 : -1) * 300; b.vy = 0;
    n++;
    run(g, 10, () => { if (b.layer === 0) { down++; return false; } });
  }
  check(down === n, `bille lâchée sur le pont : redescend au plateau (${down}/${n})`);
  // petits batteurs : un tir depuis le berceau touche une cellule ou l'UPLINK
  let hits = 0, tries = 0;
  for (const side of ['L', 'R']) {
    for (let d = 0.1; d <= 0.5; d += 0.05) {
      const { g, input } = makeGame();
      g.newGame();
      const t = g.table;
      const b = t.shooterBall; t.shooterBall = null;
      b.state = 'free'; b.layer = 2; b.setPos(side === 'L' ? 110 : 470, 50); b.vx = side === 'L' ? 120 : -120;
      g.bonus.saveT = 99;
      let hit = false;
      const oT = t.onDeckTarget.bind(t), oU = t.onUplink.bind(t);
      t.onDeckTarget = (...a) => { hit = true; oT(...a); };
      t.onUplink = (bb) => { hit = true; oU(bb); };
      const key = side === 'L' ? 'left' : 'right';
      input.s[key] = true; run(g, 2.5); input.s[key] = false;
      let time = 0;
      run(g, 3, () => { input.s[key] = time >= d && time < d + 0.4; time += DT; if (hit) return false; });
      tries++; if (hit) hits++;
    }
  }
  check(hits >= tries * 0.4, `les petits batteurs du pont atteignent cellules ou UPLINK (${hits}/${tries})`);
  // cellules du pont et UPLINK : un chevron sur chaque face présentée
  {
    const { g } = makeGame();
    g.newGame();
    const t = g.table;
    t.launch(0.8); run(g, 0.5);
    const b = t.world.balls[0];
    for (let i = 0; i < 4; i++) t.onDeckTarget(i, b, 500, false);
    check(t.chevrons.hangar === 1 && t.chevrons.defense === 1, '4 cellules : un chevron sur chaque barillet');
    b.layer = 2; b.setPos(285, -40); b.vx = 0; b.vy = -400;
    run(g, 2, () => t.uplink.ball ? false : undefined);
    check(t.chevrons.hangar === 2 && t.chevrons.defense === 2, 'UPLINK : un chevron sur chaque barillet');
  }
  // UPLINK sans mode : retient la bille puis la renvoie sur le pont
  {
    const { g } = makeGame();
    g.newGame();
    const t = g.table;
    const b = t.shooterBall; t.shooterBall = null;
    b.state = 'free'; b.layer = 2; b.setPos(285, -40); b.vx = 0; b.vy = -400;
    let captured = false;
    run(g, 4, () => { if (b.state === 'captured') captured = true; if (captured && b.state === 'free' && b.y > -40) return false; });
    check(captured && b.state === 'free' && b.layer === 2, 'UPLINK : bille retenue puis renvoyée sur le pont');
  }
  // cibles tombantes → chevron sur la face droite ; remontée automatique
  {
    const { g } = makeGame();
    g.newGame();
    const t = g.table;
    const b = t.world.balls[0];
    for (let i = 0; i < 3; i++) t.onDrop(i, b, 500, false);
    check(t.drops.every(Boolean) && t.R.drops.every(p => !p.enabled), '3 cibles tombantes abattues (désactivées)');
    check(t.chevrons.defense === 1, 'cibles tombantes : un chevron sur la face droite (DÉFENSE)');
    run(g, 1.6);
    check(t.R.drops.every(p => p.enabled), 'cibles relevées après la banque complète');
  }
  // accès au NOYAU annoncé quand il devient jouable, même s'il était en attente (multibille)
  {
    const { g } = makeGame();
    g.newGame();
    const t = g.table;
    t.launch(0.8); run(g, 0.3);
    events.length = 0;
    t.sectors.hangar.done = t.sectors.reactor.done = true;
    g.bonus.deferredMB = 1;            // multibille différée en attente (cas de la DÉFENSE gagnée en dernier)
    t.sectors.defense.done = true;
    run(g, 0.2);
    const early = events.filter(e => e.startsWith('banner:NOYAU ACCESSIBLE')).length;
    g.bonus.deferredMB = 0;
    run(g, 0.2);
    const late = events.filter(e => e.startsWith('banner:NOYAU ACCESSIBLE')).length;
    check(early === 0 && late === 1, `NOYAU : pas d'annonce pendant la multibille, une annonce à la fin (${early} puis ${late})`);
  }
  // couloir entre la rampe droite et l'orbite droite : la bille qui y tombe ressort seule
  {
    const { Ball } = await import('../src/physics/ball.js');
    const { g } = makeGame();
    g.newGame();
    const t = g.table, w = t.world;
    for (const b of [...w.balls]) w.removeBall(b);
    t.shooterBall = null;
    let stuck = 0;
    for (let k = 0; k < 60; k++) {
      const b = new Ball(448 + Math.random() * 44, 240 + Math.random() * 170);
      b.vx = (Math.random() - 0.5) * 600; b.vy = (Math.random() - 0.5) * 600;
      w.addBall(b);
      for (let i = 0; i < 600 && w.balls.includes(b); i++) {
        b.px = b.x; b.py = b.y; w.step(DT);
        if (b.stuckT === undefined) b.stuckT = 0;
        const before = b.stuckT; t._checkBalls(DT);
        if (before <= 0.7 && b.stuckT > 0.7) { stuck++; break; }
        if (b.y > 520) break;
      }
      if (w.balls.includes(b)) w.removeBall(b);
    }
    check(stuck === 0, `couloir rampe droite / orbite : aucune bille immobilisée (${stuck}/60)`);
  }
  // kickback : renvoie la bille une fois, puis s'éteint
  {
    const { g } = makeGame();
    g.newGame();
    const t = g.table;
    const b = t.shooterBall; t.shooterBall = null;
    b.state = 'free'; b.setPos(39, 760); b.vx = 0; b.vy = 600;
    g.bonus.saveT = 0;
    let up = false;
    run(g, 1.5, () => { if (b.state === 'free' && b.vy < -1000) up = true; });
    check(up && !t.kickback.lit, 'kickback : bille renvoyée, kickback consommé');
  }
}

log('\n[11] Barillets, aimant de l\'œil, vie au million, FURIE, surchauffe des batteurs');
{
  // trois passages sur la rampe gauche : HANGAR accessible ; le quatrième lance le minijeu
  {
    const { g } = makeGame();
    g.newGame();
    const t = g.table;
    t.launch(0.8); run(g, 0.5);
    const b = t.world.balls[0];
    events.length = 0;
    for (let i = 0; i < 3; i++) { b.layer = 1; t.onDeckRamp(b); t.combo.t = 0; }
    check(t.chevrons.hangar === 3 && t.sectorState('hangar') === 'ready', '3 passages : HANGAR accessible');
    check(events.some(e => e.startsWith('banner:HANGAR ACCESSIBLE')), 'accès annoncé');
    let started = null;
    g.startMinigame = (s) => { started = s; };
    b.layer = 1; t.onDeckRamp(b);
    run(g, 1, () => started ? false : undefined);
    check(started === 'hangar', '4e passage : la rampe gauche lance le HANGAR');
  }
  // face trop utilisée (accès en attente) : le barillet pivote, l'aimant retient la bille
  {
    const { g } = makeGame();
    g.newGame();
    const t = g.table;
    t.launch(0.8); run(g, 0.5);
    const b = t.world.balls[0];
    g.bonus.deferredMB = 1;                 // accès en attente
    for (let i = 0; i < 4; i++) { b.state = 'free'; t.onRampExit('R', -1, b); }
    check(!t.barrels.R.anim && t.barrels.R.uses === 4 && t.sectorState('defense') === 'hold', '4 passages en attente : pas encore de rotation');
    t.onRampExit('R', -1, b);
    check(!!t.barrels.R.anim && t.R.rampR.gate.enabled, '5e passage : rotation, volet de la rampe fermé');
    check(t.magnet && t.magnet.ball === b && b.state === 'captured', 'l\'aimant saisit la bille');
    run(g, 1);
    check(t.magnet && t.magnet.phase === 'hold' && Math.hypot(b.x - T.eye.x, b.y - T.eye.y) < 4, 'bille tenue au centre de l\'œil');
    run(g, 3, () => t.magnet ? undefined : false);
    check(!t.barrels.R.anim && t.face('R') === 'vault' && !t.R.rampR.gate.enabled, 'face suivante présentée (COFFRE), volet rouvert');
    check(!t.magnet && b.state === 'free' && b.vy > 0, 'bille relâchée vers les batteurs');
    check(t.sectorState('defense') === 'armed' && t.chevrons.defense === 3, 'DÉFENSE reste qualifiée (face non présentée)');
    g.bonus.deferredMB = 0;
  }
  // la bille relâchée par l'aimant tombe sur un batteur
  {
    let onFlipper = 0;
    const N = 24;
    for (let k = 0; k < N; k++) {
      const { g } = makeGame();
      g.newGame();
      const t = g.table;
      t.launch(0.8); run(g, 0.5);
      const b = t.world.balls[0];
      t.grabMagnet(b, 'L');
      t.magnet.phase = 'hold'; t.magnet.t = 1;
      t.releaseMagnet();
      let first = null;
      const oc = t.world.onContact;
      t.world.onContact = (bb, p, imp, x, y) => { if (!first && imp > 30) first = p; oc(bb, p, imp, x, y); };
      run(g, 1.2, () => first ? false : undefined);
      if (first && first.len && first.side !== undefined) onFlipper++;
    }
    check(onFlipper >= N * 0.9, `bille relâchée par l'aimant : premier contact sur un batteur (${onFlipper}/${N})`);
  }
  // un million = une vie ; réserve pleine = FURIE
  {
    const { g, input } = makeGame();
    g.newGame();
    const t = g.table;
    t.launch(0.8); run(g, 0.5);
    g.ballsLeft = 2;
    events.length = 0;
    g.score = RULES.lifeEvery - 10; g.addScore(100);
    run(g, 0.1);
    check(g.ballsLeft === 3 && events.some(e => e.startsWith('banner:VIE SUPPLÉMENTAIRE')), 'un million : une vie de plus');
    g.score = 2 * RULES.lifeEvery + 5;
    let added = 0;
    const addBall = t.world.addBall.bind(t.world);
    t.world.addBall = (bb) => { added++; return addBall(bb); };
    run(g, 0.1);
    check(g.ballsLeft === 3 && !!g.frenzy, 'réserve pleine : la FURIE démarre');
    const start = t.ballsInPlay();
    run(g, 2.4);
    t.world.addBall = addBall;
    check(start + added === RULES.frenzyBalls, `${RULES.frenzyBalls} billes lâchées au total (${start} + ${added})`);
    check(t.multiball && Object.values(t.jackpots).every(Boolean), 'jackpots allumés pendant la FURIE');
    check(!g.canStartMinigame() && t.minigamesOnHold(), 'minijeux en attente pendant la FURIE');
    // pas de sauvegarde pendant la FURIE
    g.bonus.saveT = 5;
    const before = t.ballsInPlay();
    const victim = t.world.balls.find(b => b.state === 'free');
    victim.setPos(281, T.drainY + 5); victim.vy = 300;
    run(g, 0.05);
    check(t.ballsInPlay() === before - 1 && t.launchQueue.length === 0, 'bille perdue pendant la FURIE : pas de réinjection');
    // surchauffe : batteur gauche tenu plus de 3 s (billes figées pour que la FURIE dure)
    for (const bb of t.world.balls) bb.state = 'captured';
    input.s.left = true;
    run(g, RULES.flipperHeat + 0.2);
    check(t.R.flipL.hot && !t.R.flipL.pressed && t.R.deck.flipL.hot, 'batteur tenu > 3 s : surchauffe, il retombe');
    run(g, 0.5);
    check(!t.R.flipL.pressed, 'batteur bloqué tant que la commande reste enfoncée');
    input.s.left = false; run(g, RULES.flipperCool + 0.1);
    input.s.left = true; run(g, 0.1);
    check(t.R.flipL.pressed && !t.R.flipL.hot, 'relâché puis refroidi : le batteur répond de nouveau');
    input.s.left = false;
    // réussite : au moins 6 billes à la fin du chrono
    const F = g.frenzy;
    check(!!F, 'FURIE toujours en cours');
    if (F) {
      for (const b of t.world.balls) { b.state = 'free'; b.setPos(150 + Math.random() * 260, 300 + Math.random() * 100); b.vx = 0; b.vy = 0; }
      F.t = 0.02;
      const max = g.maxBalls;
      run(g, 0.1);
      check(!g.frenzy && g.maxBalls === max + 1 && g.ballsLeft === max + 1, `FURIE maîtrisée : réserve portée à ${g.maxBalls}, ${g.ballsLeft} vies`);
      check(events.some(e => e.startsWith('banner:FURIE MAÎTRISÉE')), 'réussite annoncée');
    }
    check(t.multiball, 'la multibille continue après la FURIE');
  }
  // échec : moins de 6 billes
  {
    const { g } = makeGame();
    g.newGame();
    const t = g.table;
    t.launch(0.8); run(g, 0.5);
    g.score = RULES.lifeEvery + 1;
    run(g, 2.6);
    check(!!g.frenzy, 'FURIE lancée');
    const free = t.world.balls.filter(b => b.state === 'free');
    for (const b of free.slice(0, free.length - (RULES.frenzyKeep - 1))) t.world.removeBall(b);
    run(g, 0.1);
    check(!g.frenzy && g.maxBalls === RULES.startBalls && events.some(e => e.startsWith('banner:FURIE PERDUE')), 'moins de 6 billes : FURIE perdue, réserve inchangée');
    check(t.multiball && t.ballsInPlay() === RULES.frenzyKeep - 1, 'les billes restantes continuent en multibille');
  }
  // pas d'enchaînement : les points de la FURIE (et de sa multibille) ne comptent pas pour le million suivant
  {
    const { g } = makeGame();
    g.newGame();
    const t = g.table;
    t.launch(0.8); run(g, 0.5);
    g.score = RULES.lifeEvery + 1;
    run(g, 2.6);
    check(!!g.frenzy && g.frenzyLock, 'FURIE lancée, compteur du million gelé');
    const next = g.nextLifeAt;
    const gauge = g.lifeScore - (next - RULES.lifeEvery);
    events.length = 0;
    g.addScore(50 * RULES.lifeEvery);
    run(g, 0.1);
    check(g.pendingFrenzy === 0 && !events.some(e => e.startsWith('banner:MODE FURIE')), '50 millions pendant la FURIE : aucune FURIE en attente');
    check(g.lifeScore - (g.nextLifeAt - RULES.lifeEvery) === gauge, 'jauge du million figée pendant la FURIE');
    // fin de FURIE, la multibille continue : toujours gelé
    g.endFrenzy(false);
    run(g, 0.05);
    check(t.multiball && g.frenzyLock, 'multibille après la FURIE : compteur toujours gelé');
    g.addScore(5 * RULES.lifeEvery);
    run(g, 0.05);
    check(g.pendingFrenzy === 0 && !g.frenzy, 'points de la multibille de FURIE ignorés');
    // retour à une bille : le compteur repart d'où il s'était arrêté
    t.endMultiball();
    g._lives();
    check(!g.frenzyLock && g.lifeScore - (g.nextLifeAt - RULES.lifeEvery) === gauge, 'multibille terminée : la jauge reprend là où elle était');
    // plusieurs millions d'un coup réserve pleine : une seule FURIE
    g.addScore(5 * RULES.lifeEvery);
    g.scene = 'minigame';          // plateau indisponible : la FURIE doit attendre
    g._lives();
    check(g.pendingFrenzy === 1, `${5} millions d'un coup : une seule FURIE en attente`);
    g.scene = 'table';
  }
  // hors FURIE : pas de surchauffe
  {
    const { g, input } = makeGame();
    g.newGame();
    const t = g.table;
    t.launch(0.8); run(g, 0.5);
    input.s.left = true; run(g, 4);
    check(t.R.flipL.pressed && !t.R.flipL.hot, 'hors FURIE : un batteur peut rester levé');
    input.s.left = false;
  }
  // FURIE en jeu automatique : aucune bille bloquée ni dupliquée
  {
    const { g, input } = makeGame();
    g.newGame();
    const t = g.table;
    t.launch(0.8); run(g, 0.5);
    g.score = RULES.lifeEvery + 1;
    let nan = 0;
    run(g, 20, () => { bot(g, input, 0.85); for (const b of t.world.balls) if (!Number.isFinite(b.x)) nan++; });
    check(nan === 0 && g.ledgerErrors === 0, `FURIE automatique : comptabilité saine (${t.ballsInPlay()} billes en jeu après 20 s)`);
  }
}

log(`\nRésultat : ${passes} vérifications réussies, ${failures} échec(s).`);
process.exit(failures ? 1 : 0);
