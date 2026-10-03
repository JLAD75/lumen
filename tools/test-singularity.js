// Tests headless du minijeu SINGULARITÉ (secteur RÉACTEUR, arène à batteurs).
// Géométrie, champ gravitationnel (plafond, atténuation, aucune orbite éternelle), récolte,
// paliers, bille happée puis recrachée, fronde, stabilisation, chute, progression conservée,
// recensements automatiques (atteignabilité des orbites par des tirs de batteurs, billes
// lâchées partout batteurs au repos), puis parties automatiques (pilote simple).
// Usage : node tools/test-singularity.js [parties par niveau et par mode]
// Certains modules de rendu construisent des Path2D au chargement : simulacre minimal sous Node.
if (typeof globalThis.Path2D === 'undefined') {
  globalThis.Path2D = class { constructor() {} };
  for (const k of ['moveTo', 'lineTo', 'arc', 'arcTo', 'ellipse', 'rect', 'roundRect', 'closePath', 'bezierCurveTo', 'quadraticCurveTo', 'addPath']) globalThis.Path2D.prototype[k] = () => {};
}
const { Game } = await import('../src/game/game.js');
const { SG, ORBITS } = await import('../src/minigames/singularity.js');

const DT = 1 / 120;
const RUNS = Math.max(1, parseInt(process.argv[2] || '30', 10));
const STATS = RUNS >= 20;               // statistiques vérifiées seulement sur un échantillon suffisant
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
const said = new Map();
const banners = [];
const ui = {
  banner: (t, s) => banners.push(t + (s ? ' | ' + s : '')), lumen: (m) => { if (m) said.set(m.text, (said.get(m.text) || 0) + 1); }, tally: noop, flashBalls: noop,
  onGameStart: noop, showPause: noop, showTitle: noop, showGameOver: noop,
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

// démarre le minijeu SINGULARITÉ avec la bille du plateau
function startSg(level = 1) {
  const { g, input } = makeGame();
  g.newGame();
  g.level = level; g.applyDifficulty();
  g.table.launch(0.5); run(g, 0.5);
  g.debug('start', 'reactor');
  run(g, 3, () => g.scene === 'minigame' ? false : undefined);
  return { g, input, mg: g.minigame };
}

function restart(g) {
  g.debug('qualify', 'reactor');
  g.debug('start', 'reactor');
  run(g, 3, () => g.scene === 'minigame' ? false : undefined);
  return g.minigame;
}

// pilote automatique simple (identique à sim-tests.js / test-defense.js) : frappe quand la bille approche d'un batteur
function bot(g, input, skill = 0.7) {
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

function segDist(px, py, p) {
  let t = ((px - p.ax) * p.dx + (py - p.ay) * p.dy) / p.len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (p.ax + p.dx * t), py - (p.ay + p.dy * t));
}
function primDist(x, y, p) {
  if (p.kind === 'seg') return segDist(x, y, p) - p.r;
  if (p.kind === 'circle') return Math.hypot(x - p.x, y - p.y) - p.r;
  return Infinity;
}
// point à l'intérieur du terrain jouable (murs, renflements, dôme), marge m
function insideField(x, y, m) {
  let lo = 20, hi = 542;
  if (y > 500 && y <= 600) { lo = 20 + 42 * (y - 500) / 100; hi = 542 - 42 * (y - 500) / 100; }
  else if (y > 600 && y <= 700) { lo = 62 - 42 * (y - 600) / 100; hi = 500 + 42 * (y - 600) / 100; }
  if (y < 300 && Math.hypot(x - 300, y - 300) > 280 - m) return false;
  return x - m > lo && x + m < hi;
}
// arène « figée » pour les recensements : chrono infini, barrière coupée, pas de fin de minijeu
function freeze(mg) {
  if (mg.state !== 'ended') mg.state = 'play';
  mg.timeLeft = mg.timeLimit = 1e9;
  mg.confineT = 0; mg.perkT = 0;
  mg.barrierT = 0; if (mg.barrier) mg.barrier.enabled = false;
}
const pct = (n, d) => `${Math.round(100 * n / Math.max(1, d))} %`;
const avg = (a, f) => a.reduce((s, x) => s + f(x), 0) / Math.max(1, a.length);

// ------------------------------------------------------------------ 1. géométrie
log('\n[1] Géométrie : singularité dans la moitié haute, orbites loin des murs, lanceur hors du champ');
{
  const { g, mg } = startSg(1);
  check(g.scene === 'minigame' && mg && mg.sector === 'reactor' && mg.title === 'SINGULARITÉ', 'minijeu SINGULARITÉ démarré');
  check(mg.world.flippers.length === 2 && !mg.paddle, 'arène à batteurs');
  check(SG.cx === 281 && SG.cy >= 330 && SG.cy <= 380, `singularité centrée (${SG.cx}, ${SG.cy})`);
  // aucune pièce solide dans le champ : rien à quoi la bille pourrait s'accrocher
  const solidsInField = mg.world.statics.concat(mg.world.dynamics).filter(p => p.enabled && primDist(SG.cx, SG.cy, p) < SG.RF);
  check(solidsInField.length === 0, `aucune pièce solide dans le champ (${solidsInField.length})`);
  // chaque point de chaque orbite reste loin des murs et du dôme (pas de recoin)
  let worst = Infinity;
  for (const o of ORBITS) {
    for (let k = 0; k < 360; k += 3) {
      const a = k * Math.PI / 180, x = SG.cx + Math.cos(a) * o.r, y = SG.cy + Math.sin(a) * o.r;
      for (const p of mg.world.statics) worst = Math.min(worst, primDist(x, y, p));
    }
  }
  check(worst > 26 * 2.2, `orbites à plus de 2 diamètres de bille de toute paroi (min ${worst.toFixed(0)})`);
  const top = SG.cy - ORBITS[ORBITS.length - 1].r;
  check(top > 140, `point le plus haut des orbites à y = ${top.toFixed(0)} (dôme à y = 20)`);
  check(Math.hypot(561 - SG.cx, 300 - SG.cy) > SG.RF + 20 && Math.hypot(561 - SG.cx, 1000 - SG.cy) > SG.RF, 'le couloir de lancement est hors du champ');
  const e = mg.entryPoint();
  check(Math.hypot(e.x - SG.cx, e.y - SG.cy) > SG.RF0, 'point d\'entrée hors du cœur du champ');
  check(mg.cells.length === ORBITS.reduce((s, o) => s + o.n, 0) && mg.need === 21, `cellules en orbite : ${mg.cells.length}, objectif ${mg.need}`);
}

// ------------------------------------------------------------------ 2. champ
log('\n[2] Champ gravitationnel : plafond, atténuation, aucune orbite éternelle');
{
  const { mg } = startSg(1);
  freeze(mg);
  // accélération sur une bille témoin immobile (un sous-pas de 1 ms)
  const b = mg.ball;
  const accAt = (r, k = 1) => {
    mg.fieldK = k; mg.immuneT = 0;
    b.state = 'free'; b.x = SG.cx + r; b.y = SG.cy; b.vx = 0; b.vy = 0;
    mg.phase = 'stabilize'; mg.ringR = 0;      // aucune capture pendant la mesure
    mg._field(b, 0.001);
    mg.phase = 'harvest';
    return -b.vx / 0.001;
  };
  let amax = 0;
  for (let r = 1; r < 300; r += 1) amax = Math.max(amax, accAt(r, 1.3));
  const a140 = accAt(140), a40 = accAt(40), aEdge = accAt(SG.RF - 1), aOut = accAt(SG.RF + 5);
  log(`    accélération : 40 → ${a40.toFixed(0)}, 140 → ${a140.toFixed(0)}, bord → ${aEdge.toFixed(0)}, hors champ → ${aOut.toFixed(0)} u/s² (max ×1,3 : ${amax.toFixed(0)})`);
  check(amax < 25000, 'attraction plafonnée (profil adouci au cœur)');
  check(a140 > 2000, 'attraction supérieure à la gravité à mi-champ (les boucles sont possibles)');
  check(aEdge < 60 && aOut === 0, 'attraction nulle au bord du champ (aucune discontinuité)');
  // orbites circulaires parfaites lancées à plusieurs rayons et vitesses : la bille finit toujours par sortir
  let worstT = 0, n = 0, escaped = 0;
  const g = mg.game;
  for (const r of [70, 100, 130, 160]) {
    for (const kv of [0.8, 1, 1.2]) {
      for (const dir of [1, -1]) {
        freeze(mg); mg.capture = null; mg.satT = 0; mg.fieldT = 0; mg.upT = 0; mg.phase = 'harvest';
        for (const c of mg.cells) { c.on = false; c.respawnT = 1e9; }
        const a = accAt(r) + 0;
        mg._sweepReset();
        b.state = 'free'; b.scale = 1; b.setPos(SG.cx, SG.cy - r);
        const v = Math.sqrt(Math.max(1, a) * r) * kv;
        b.vx = v * dir; b.vy = 0;
        let t = 0;
        while (t < 15) {
          g.tick(DT); t += DT;
          if (mg.capture || b.state !== 'free') break;
          if (Math.hypot(b.x - SG.cx, b.y - SG.cy) > SG.RF || b.y > 760) break;
        }
        n++;
        if (t < 15) escaped++;
        worstT = Math.max(worstT, t);
      }
    }
  }
  check(escaped === n, `orbites lancées : ${escaped}/${n} quittent le champ ou sont happées (pire cas ${worstT.toFixed(1)} s)`);
  check(worstT < 6, 'aucune orbite ne dure plus de 6 s');
}

// ------------------------------------------------------------------ 3. récolte, paliers, bille happée
log('\n[3] Récolte, paliers sécurisés, bille happée puis recrachée');
{
  const { g, mg } = startSg(1);
  freeze(mg);
  const b = mg.ball;
  const outer = mg.cells.find(c => c.oi === 2 && c.on), inner = mg.cells.find(c => c.oi === 0 && c.on);
  const h0 = mg.harvest;
  mg._collect(outer, 'ball');
  check(mg.harvest === h0 + 1 && !outer.on, 'cellule extérieure : +1');
  mg._collect(inner, 'ball');
  check(mg.harvest === h0 + 3 && mg.combo === 2, 'cellule intérieure : +2, chaîne ×2');
  // récolte par la bille elle-même : passage à travers une cellule
  const mid = mg.cells.find(c => c.oi === 1 && c.on);
  const others = mg.cells.filter(c => c !== mid && c.on);
  for (const c of others) c.on = false;      // seule la cellule visée est présente
  mg.immuneT = 1;
  b.setPos(mid.x - 40, mid.y); b.vx = 2400; b.vy = 0; b.px = b.x; b.py = b.y;
  run(g, 0.05);
  check(!mid.on && mg.harvest === h0 + 4, 'la bille récolte une cellule en passant dessus (sans rebond)');
  for (const c of others) { c.on = true; c.spawn = 1; }
  check(Math.abs(b.vx) > 1500, 'la récolte ne freine pas la bille');
  // palier 1
  mg.harvest = mg.stage - 1;
  const c4 = mg.cells.find(c => c.on && c.o.value === 1);
  mg._collect(c4, 'ball');
  check(mg.round === 1 && mg.alert > 0 && mg.barrier.enabled, 'palier 1 : la singularité grossit, progression sécurisée, barrière');
  // capture : pénalité bornée par le palier
  run(g, 1);
  mg.immuneT = 0; mg.confineT = 0;
  mg.harvest = mg.stage + 2;
  b.setPos(SG.cx + 60, SG.cy); b.vx = -900; b.vy = 0;
  run(g, 0.2, () => mg.capture ? false : undefined);
  check(!!mg.capture && b.state === 'held' && mg.harvest === mg.stage + 1, 'horizon franchi : bille happée, 1 cellule dispersée');
  run(g, 1.2, () => !mg.capture ? false : undefined);
  check(!mg.capture && b.state === 'free' && b.vy > 0 && mg.barrier.enabled, 'bille recrachée vers les batteurs, barrière active');
  mg.harvest = mg.stage;
  b.setPos(SG.cx + 50, SG.cy); b.vx = -900; b.vy = 0; mg.immuneT = 0;
  run(g, 0.2, () => mg.capture ? false : undefined);
  check(!!mg.capture && mg.harvest === mg.stage, 'happée au palier : aucune cellule perdue sous le palier sécurisé');
  run(g, 1.2, () => !mg.capture ? false : undefined);
  // avantage d'entrée : l'horizon repousse la bille
  mg.confineT = 5; mg.immuneT = 0;
  b.setPos(SG.cx + 50, SG.cy); b.vx = -900; b.vy = 0;
  const caps = mg.captures;
  run(g, 0.3);
  check(mg.captures === caps && mg.confines > 0, 'champ de confinement : rebond sur l\'horizon, pas de capture');
  // où retombe la bille recrachée ? (batteurs au repos, barrière coupée) : jamais droit entre les batteurs
  const lands = [];
  for (let i = 0; i < 40; i++) {
    mg.confineT = 0; mg.capture = null; freeze(mg);
    b.state = 'held';
    mg._spit(b, i % 2 ? 1 : -1);
    mg.barrierT = 0; mg.barrier.enabled = false;
    let x = null;
    run(g, 1.5, () => { if (b.y > 900) { x = b.x; return false; } });
    lands.push(x);
  }
  const center = lands.filter(x => x !== null && x > 252 && x < 310).length;
  log(`    bille recrachée : abscisse à y = 900 entre ${Math.min(...lands).toFixed(0)} et ${Math.max(...lands).toFixed(0)}`);
  check(lands.every(x => x !== null) && center === 0, 'la bille recrachée retombe sur un batteur, jamais dans l\'axe entre les deux');
}

// ------------------------------------------------------------------ 4. fronde
log('\n[4] Fronde gravitationnelle : tour complet sans contact');
{
  const { g, mg } = startSg(1);
  freeze(mg);
  const b = mg.ball;
  // la fronde récolte toute l'orbite balayée
  const h0 = mg.harvest;
  const midOn = mg.cells.filter(c => c.oi === 1 && c.on).length;
  mg._fronde(b, ORBITS[1].r);
  run(g, 0.6);
  check(mg.frondes === 1 && mg.harvest === h0 + midOn && mg.cells.filter(c => c.oi === 1 && c.on).length === 0, `fronde : orbite médiane entière récoltée (+${midOn})`);
  // un contact interrompt le balayage
  mg._sweepReset();
  b.state = 'free'; b.setPos(SG.cx + 100, SG.cy); b.vx = 0; b.vy = -800;
  mg._sweepTrack(b, 100);
  b.x = SG.cx; b.y = SG.cy - 100; mg._sweepTrack(b, 100);
  check(mg.sweepOn && Math.abs(mg.sweep) > 1.4, 'balayage angulaire suivi autour du centre');
  mg.world.onContact(b, mg.frame.flipL, 300, b.x, b.y);
  check(!mg.sweepOn && mg.sweep === 0, 'un contact (batteur, mur…) annule la fronde en cours');
  // trajectoires réelles : recherche de lancers qui bouclent autour de la singularité
  // tirs « doux » qui montent à côté de la singularité (le geste de la fronde)
  let found = 0, tried = 0;
  mg._stabilize = noop;
  for (let i = 0; i < 400; i++) {
    freeze(mg); mg.capture = null; mg.phase = 'harvest'; mg.satT = 0; mg.fieldT = 0; mg.upT = 0; mg.harvest = 0;
    const f0 = mg.frondes;
    const x = 230 + Math.random() * 120, y = 570 + Math.random() * 40;
    b.state = 'free'; b.scale = 1; b.setPos(x, y);
    const a = -Math.PI / 2 + (Math.random() - 0.5) * 1.0, s = 900 + Math.random() * 500;
    b.vx = Math.cos(a) * s; b.vy = Math.sin(a) * s;
    mg._sweepReset();
    tried++;
    run(g, 2.5, () => (mg.frondes > f0 || mg.capture || b.y > 760) ? false : undefined);
    if (mg.frondes > f0) found++;
  }
  log(`    tirs doux (900–1400 u/s) montant à côté de la singularité : ${found}/${tried} frondes (${pct(found, tried)})`);
  check(found / tried >= 0.04, 'la fronde se provoque avec un tir doux à côté du trou noir (geste reproductible)');
}

// ------------------------------------------------------------------ 5. stabilisation et victoire
log('\n[5] Stabilisation : frapper la singularité referme le trou noir');
for (const level of [1, 2]) {
  const { g, mg } = startSg(level);
  freeze(mg);
  mg.timeLeft = 30; mg.timeLimit = 80;
  const b = mg.ball;
  mg.harvest = mg.need - 1;
  mg.round = 2;
  const c = mg.cells.find(x => x.on && x.o.value === 1);
  mg._collect(c, 'ball');
  check(mg.phase === 'stabilize' && mg.timeLeft >= 38 && mg.cells.every(x => !x.on), `niv. ${level} : récolte complète → STABILISATION (+8 s, cellules aspirées)`);
  check(mg.progressText().startsWith('STABILISATION'), `en-tête : « ${mg.progressText()} »`);
  let res = null;
  const fin = mg.finish.bind(mg);
  mg.finish = (s, reason, d) => { res = res || { s, reason }; fin(s, reason, d); };
  for (let hit = 0; hit < mg.hitsNeed && !res; hit++) {
    run(g, 1.6, () => (b.state === 'free' && mg.immuneT <= 0 && mg.ringR >= SG.RING) ? false : undefined);
    mg.immuneT = 0;
    b.state = 'free'; b.setPos(SG.cx + 120, SG.cy - 20); b.vx = -1400; b.vy = 0;
    run(g, 2.4, () => res ? false : undefined);
  }
  check(res && res.s && res.reason === 'stabilized', `niv. ${level} : ${mg.hitsNeed} frappe(s) → implosion, victoire`);
  run(g, 5, () => g.scene === 'table' && !g.transition ? false : undefined);
  check(g.scene === 'table' && g.table.sectors.reactor.done, `niv. ${level} : secteur RÉACTEUR réactivé`);
  check(g.bonus.shield === 1 && g.bonus.bumperLevel >= 2, `niv. ${level} : récompenses (bouclier, bumpers +1)`);
  check(g.ledgerErrors === 0, `niv. ${level} : comptabilité des billes sans erreur`);
}

// ------------------------------------------------------------------ 6. chute, progression conservée
log('\n[6] Chute sans bouclier, progression conservée (paliers), bouclier');
{
  const { g, mg } = startSg(1);
  const id = mg.world.balls[0].id;
  const before = g.ballsLeft;
  mg.harvest = 9; mg.round = 1;
  mg.barrierT = 0; if (mg.barrier) mg.barrier.enabled = false;
  for (const b of mg.world.balls) { b.x = 300; b.y = 1200; b.vy = 100; }
  run(g, 4, () => g.scene === 'table' && !g.transition ? false : undefined);
  check(g.scene === 'table' && g.table.world.balls[0] && g.table.world.balls[0].id === id, 'chute : la même bille revient sur le plateau');
  check(g.ballsLeft === before, 'aucune bille consommée');
  const kept = g.table.sectors.reactor.kept;
  check(kept && kept.round === 1 && kept.cells === mg.stage, `palier sécurisé mémorisé (${JSON.stringify(kept)})`);
  const mg2 = restart(g);
  check(mg2 && mg2.round === 1 && mg2.harvest === mg.stage && mg2.progressText().includes(`${mg.stage}/`), `nouvelle tentative : « ${mg2.progressText()} »`);
  // bouclier : relance de la même bille au lanceur
  g.bonus.grant('shield');
  mg2.barrierT = 0; if (mg2.barrier) mg2.barrier.enabled = false;
  for (const b of mg2.world.balls) { b.x = 300; b.y = 1200; b.vy = 100; }
  run(g, 0.05);
  check(mg2.state === 'relaunch' && mg2.pendingBall && mg2.pendingBall.id === id, 'bouclier : relance automatique de la même bille');
  run(g, 2, () => mg2.state === 'play' ? false : undefined);
  check(mg2.state === 'play' && mg2.world.balls[0].id === id, 'la bille est relancée dans l\'arène');
  // la bille lancée traverse le couloir sans être attirée
  const b = mg2.world.balls[0];
  let inLaneField = false;
  run(g, 0.6, () => { if (b.x > 545 && Math.hypot(b.x - SG.cx, b.y - SG.cy) < SG.RF) inLaneField = true; });
  check(!inLaneField, 'le couloir de lancement n\'est jamais dans le champ');
  // échec au chrono pendant que la bille est happée
  const { g: g3, mg: m3 } = startSg(1);
  freeze(m3);
  m3.ball.setPos(SG.cx + 40, SG.cy); m3.ball.vx = -600; m3.ball.vy = 0;
  run(g3, 0.2, () => m3.capture ? false : undefined);
  m3.timeLeft = 0.01;
  run(g3, 4, () => g3.scene === 'table' && !g3.transition ? false : undefined);
  run(g3, 3);                         // l'aimant du barillet retient un instant la bille revenue
  const tb = g3.table.world.balls[0];
  check(g3.scene === 'table' && tb && tb.state === 'free' && tb.scale === 1, 'chrono écoulé pendant une capture : la bille revient normalement');
  check(g3.ledgerErrors === 0 && g.ledgerErrors === 0, 'comptabilité des billes sans erreur');
}

// ------------------------------------------------------------------ 7. recensement : atteignabilité des orbites
log('\n[7] Recensement : tirs de batteurs aléatoires, cases d\'orbite atteintes (12 secteurs de 30° par orbite)');
{
  const SHOTS = Math.max(300, RUNS * 30);
  for (const growth of [0, 1]) {
    const { g, input, mg } = startSg(1);
    freeze(mg);
    mg._stabilize = noop;               // croissance figée : la récolte (fronde) ne termine pas le recensement
    const b = mg.ball;
    const hits = ORBITS.map(() => new Array(12).fill(0));
    let reachedField = 0, frondes = 0, captures = 0, shotsUp = 0;
    for (let s = 0; s < SHOTS; s++) {
      freeze(mg);
      mg.phase = 'harvest'; mg.capture = null; mg.satT = 0; mg.fieldT = 0; mg.upT = 0;
      mg.harvest = growth ? mg.need - 1 : 0; mg.gVis = mg.harvest / mg.need;
      for (const c of mg.cells) { c.on = false; c.respawnT = 1e9; }
      // bille qui tombe sur un batteur ; frappe quand elle arrive au point choisi (u) le long du batteur
      const left = Math.random() < 0.5;
      const f = left ? mg.frame.flipL : mg.frame.flipR;
      const u = 0.1 + Math.random() * 0.85;
      const ex = Math.cos(f.rest) * f.len, ey = Math.sin(f.rest) * f.len;
      const s0 = Math.random();
      b.state = 'free'; b.scale = 1; b.setPos(f.px + ex * s0 + (left ? -1 : 1) * Math.random() * 30, f.py + ey * s0 - 90 - Math.random() * 60);
      b.vx = (Math.random() - 0.5) * 300; b.vy = 100 + Math.random() * 400;
      const seen = ORBITS.map(() => new Set());
      let t = 0, up = false, inField = false, flipT = -1;
      input.s.left = input.s.right = false;
      mg._sweepReset();
      const f0 = mg.frondes, c0 = mg.captures;
      while (t < 4) {
        if (flipT < 0) {
          const tt = ((b.x - f.px) * ex + (b.y - f.py) * ey) / (f.len * f.len);
          const tc = Math.max(0, Math.min(1, tt));
          const d = Math.hypot(b.x - (f.px + ex * tc), b.y - (f.py + ey * tc));
          if (d < 13 + 15 + 8 && tt > -0.1 && (tt >= u || tt > 0.92)) flipT = t;
        }
        const on = flipT >= 0 && t - flipT < 0.35;
        input.s.left = left && on; input.s.right = !left && on;
        g.tick(DT); t += DT;
        if (b.state !== 'free') break;
        if (b.y < 700) up = true;
        if ((up && b.y > 880) || b.y > 1000) break;
        const d = Math.hypot(b.x - SG.cx, b.y - SG.cy);
        if (d < SG.RF0) inField = true;
        const a = Math.atan2(b.y - SG.cy, b.x - SG.cx);
        ORBITS.forEach((o, oi) => {
          if (Math.abs(d - o.r) < SG.PICK) seen[oi].add(Math.floor((a + Math.PI) / (2 * Math.PI) * 12) % 12);
        });
      }
      if (up) shotsUp++;
      input.s.left = input.s.right = false;
      if (inField) reachedField++;
      if (mg.frondes > f0) frondes++;
      if (mg.captures > c0) captures++;
      seen.forEach((set, oi) => { for (const k of set) hits[oi][k]++; });
    }
    log(`  — croissance ${growth ? 'maximale' : 'initiale'} : ${SHOTS} tirs (${pct(shotsUp, SHOTS)} montent dans la chambre), ${pct(reachedField, SHOTS)} entrent dans le champ, frondes ${pct(frondes, SHOTS)}, happées ${pct(captures, SHOTS)}`);
    let minAll = Infinity;
    ORBITS.forEach((o, oi) => {
      const p = hits[oi].map(n => 100 * n / SHOTS);
      minAll = Math.min(minAll, ...p);
      log(`    orbite ${o.name.toLowerCase().padEnd(10)} (r ${o.r}) : ${p.map(x => x.toFixed(0).padStart(3)).join(' ')}  % des tirs par secteur (min ${Math.min(...p).toFixed(1)} %)`);
    });
    check(minAll >= 1.5, `croissance ${growth ? 'max' : 'initiale'} : chaque secteur de chaque orbite est atteint par au moins 1,5 % des tirs (min ${minAll.toFixed(1)} %)`);
  }
}

// ------------------------------------------------------------------ 8. recensement : billes lâchées partout, batteurs au repos
log('\n[8] Recensement des blocages : billes lâchées partout, batteurs au repos, sans barrière');
{
  const DROPS = Math.max(400, RUNS * 20);
  const { g, mg } = startSg(1);
  freeze(mg);
  mg._stabilize = noop;
  mg._antiStuck = noop;               // comportement naturel : sans le filet de sécurité (poussée à 1,5 s)
  const b = mg.ball;
  let maxStill = 0, maxUp = 0, maxField = 0, maxHeld = 0, still2 = 0, longUp = 0, sat = 0, lane = 0, trials = 0, escaped = 0;
  const stillAt = [];
  for (let i = 0; i < DROPS; i++) {
    freeze(mg);
    mg.phase = 'harvest'; mg.capture = null; mg.satT = 0; mg.fieldT = 0; mg.upT = 0;
    mg.harvest = Math.floor(Math.random() * mg.need); mg.gVis = mg.harvest / mg.need;
    for (const c of mg.cells) { c.on = false; c.respawnT = 1e9; }
    // position libre aléatoire dans le terrain (hors pièces solides et hors couloir de lancement)
    let x, y, ok = false;
    for (let k = 0; k < 200 && !ok; k++) {
      x = 25 + Math.random() * 512; y = 25 + Math.random() * 900;
      if (y < 300 && Math.hypot(x - 300, y - 300) > 280 - 16) continue;
      if (!insideField(x, y, b.r + 3)) continue;
      ok = mg.world.statics.every(p => primDist(x, y, p) > b.r + 1) && mg.world.flippers.every(f => Math.hypot(x - f.px, y - f.py) > 110 || y < f.py - 60);
    }
    if (!ok) continue;
    trials++;
    b.state = 'free'; b.scale = 1; b.setPos(x, y);
    const a = Math.random() * Math.PI * 2, s = Math.random() * 600;
    b.vx = Math.cos(a) * s; b.vy = Math.sin(a) * s;
    mg._sweepReset();
    let t = 0, still = 0, trialStill = 0, stillPos = null, up = 0, inF = 0, held = 0, wx = b.x, wy = b.y, wt = 0, s0 = mg.saturations;
    while (t < 25) {
      g.tick(DT); t += DT;
      if (mg.state === 'ended') { escaped++; break; }
      if (mg.state === 'relaunch') { lane++; mg.state = 'play'; mg.shooterBall = null; mg.pendingBall = null; break; }
      if (b.state === 'held') { held += DT; maxHeld = Math.max(maxHeld, held); continue; }
      held = 0;
      if (b.y > 990) break;            // vers l'évacuation : fin de l'essai
      wt += DT;
      if (wt >= 0.25) {
        if (Math.hypot(b.x - wx, b.y - wy) < 3) still += wt; else still = 0;
        wx = b.x; wy = b.y; wt = 0;
        if (still > trialStill) { trialStill = still; stillPos = `(${b.x.toFixed(0)}, ${b.y.toFixed(0)}) v ${Math.hypot(b.vx, b.vy).toFixed(0)}`; }
        if (still > maxStill) maxStill = still;
      }
      if (b.y < 740) up += DT; else up = 0;
      maxUp = Math.max(maxUp, up);
      if (Math.hypot(b.x - SG.cx, b.y - SG.cy) < SG.RF0) { inF += DT; maxField = Math.max(maxField, inF); } else inF = 0;
    }
    if (trialStill >= 2) { still2++; stillAt.push(`lâchée en (${x.toFixed(0)}, ${y.toFixed(0)}), immobile en ${stillPos}`); }
    if (t >= 25) longUp++;
    sat += mg.saturations - s0;
  }
  log(`    ${trials} billes : immobilité max ${maxStill.toFixed(2)} s, séjour max dans la moitié haute ${maxUp.toFixed(1)} s, dans le cœur du champ ${maxField.toFixed(1)} s, capture max ${maxHeld.toFixed(2)} s`);
  log(`    saturations du champ déclenchées : ${sat} · secousses de vibration : ${mg.nudges || 0} · billes revenues au lanceur : ${lane}`);
  if (stillAt.length) log('    immobilisations : ' + stillAt.slice(0, 5).join(' ; '));
  check(escaped === 0, `aucune bille ne sort de l'arène (${escaped})`);
  check(still2 === 0, `aucune bille immobile plus de 2 s (${still2})`);
  check(longUp === 0, 'toutes les billes finissent par redescendre vers les batteurs');
  check(maxField < 4.5, `aucune bille ne tourne indéfiniment autour de la singularité (max ${maxField.toFixed(1)} s dans le cœur du champ)`);
  check(maxUp < 10, `séjour borné dans la moitié haute (max ${maxUp.toFixed(1)} s)`);
  check(maxHeld < 1.2, 'capture toujours brève (bille recrachée en moins de 1,2 s)');
  // équilibres instables : billes posées pile au sommet des poteaux des couloirs, vitesse nulle
  const posts = mg.world.statics.filter(p => p.kind === 'circle' && p.style === 'post');
  let worstPost = 0;
  for (const p of posts) {
    for (let k = 0; k < 60; k++) {
      freeze(mg); mg.capture = null;
      b.state = 'free'; b.scale = 1; b.setPos(p.x + (Math.random() - 0.5) * 1.5, p.y - p.r - b.r - 0.5); b.vx = 0; b.vy = 0;
      let t = 0;
      while (t < 5 && Math.hypot(b.x - p.x, b.y - (p.y - p.r - b.r)) < 6) { g.tick(DT); t += DT; }
      worstPost = Math.max(worstPost, t);
    }
  }
  log(`    billes posées au sommet des ${posts.length} poteaux : elles en tombent en ${worstPost.toFixed(2)} s au plus`);
  check(worstPost < 1.2, 'aucun équilibre instable durable (micro-vibration du réacteur)');
}

// ------------------------------------------------------------------ 9. parties automatiques
log(`\n[9] Parties automatiques : pilote simple de sim-tests.js, ${RUNS} parties par niveau et par mode`);
const MODES = [
  { name: 'règles réelles', shields: false },
  { name: 'boucliers illimités', shields: true },
];

function playSession(g, input, mg, mode = MODES[0]) {
  const out = { win: false, reason: 'none', t: 0, harvest: 0, frondes: 0, captures: 0, unstuck: 0, sat: 0,
    nan: false, error: null, maxAway: 0, ms: 0, ticks: 0, shieldsUsed: 0 };
  let res = null;
  const fin = mg.finish.bind(mg);
  mg.finish = (s, reason, drained) => { res = res || { s, reason, t: mg.time }; fin(s, reason, drained); };
  let launchHold = 0, away = 0;
  try {
    for (let i = 0; i < 140 / DT; i++) {
      if (g.minigame !== mg || mg.state === 'ended') break;
      if (mode.shields && g.bonus.shield === 0) { g.bonus.grant('shield'); out.shieldsUsed++; }
      bot(g, input);
      if (mg.launchReady()) { launchHold += DT; input.s.launch = (launchHold % 1.2) < 0.75; } else { launchHold = 0; input.s.launch = false; }
      const b = mg.world.balls[0];
      if (b && b.state === 'free') {
        if (!Number.isFinite(b.x) || !Number.isFinite(b.y) || !Number.isFinite(b.vx)) out.nan = true;
        if (b.y > 850) away = 0; else { away += DT; out.maxAway = Math.max(out.maxAway, away); }
      }
      const t0 = performance.now();
      g.tick(DT);
      out.ms += performance.now() - t0; out.ticks++;
    }
  } catch (e) { out.error = e; }
  if (res) { out.win = res.s; out.reason = res.reason; out.t = res.t; }
  out.harvest = mg.harvest; out.frondes = mg.frondes; out.captures = mg.captures; out.unstuck = mg.unstuck; out.sat = mg.saturations; out.nudges = mg.nudges || 0;
  out.ledger = g.ledgerErrors;
  return out;
}

const summary = {};
for (const level of [1, 2, 3]) {
  for (const mode of MODES) {
    const rs = [];
    for (let i = 0; i < RUNS; i++) { const { g, input, mg } = startSg(level); rs.push(playSession(g, input, mg, mode)); }
    const wins = rs.filter(r => r.win).length;
    const reasons = {};
    for (const r of rs) reasons[r.reason] = (reasons[r.reason] || 0) + 1;
    const key = `niv. ${level} (${mode.name})`;
    summary[key] = { wins, rs };
    const W = rs.filter(r => r.win);
    log(`  — ${key} : victoires ${wins}/${RUNS} (${pct(wins, RUNS)}) · issues ${JSON.stringify(reasons)}`);
    log(`    durée des victoires ${avg(W, r => r.t).toFixed(1)} s · frondes ${avg(rs, r => r.frondes).toFixed(2)}/partie · happées ${avg(rs, r => r.captures).toFixed(2)} · saturations ${avg(rs, r => r.sat).toFixed(2)} · cellules à la fin ${avg(rs, r => r.harvest).toFixed(1)}`);
    log(`    hors batteurs max ${Math.max(...rs.map(r => r.maxAway)).toFixed(1)} s · secousses ${rs.reduce((s, r) => s + r.nudges, 0)} · déblocages ${rs.reduce((s, r) => s + r.unstuck, 0)} · ${(avg(rs, r => r.ms / Math.max(1, r.ticks)) * 1000).toFixed(0)} µs/pas`);
    check(rs.every(r => !r.error), 'aucune exception' + (rs.find(r => r.error) ? ' : ' + rs.find(r => r.error).error.stack : ''));
    check(rs.every(r => !r.nan), 'aucune valeur NaN');
    check(rs.every(r => r.reason !== 'none'), 'chaque partie se termine (réussite, chute ou chrono)');
    check(rs.every(r => r.maxAway < 12), `la bille revient toujours vers les batteurs (max ${Math.max(...rs.map(r => r.maxAway)).toFixed(1)} s hors zone)`);
    check(rs.reduce((s, r) => s + r.unstuck, 0) <= Math.ceil(RUNS / 10), 'aucun blocage notable (déblocages automatiques rares)');
    check(rs.every(r => r.ledger === 0), 'comptabilité des billes sans erreur');
    check(avg(rs, r => r.ms / Math.max(1, r.ticks)) < 0.5, 'logique bien en deçà du budget (< 0,5 ms par pas)');
  }
}

// campagne : tentatives successives (une bille par tentative), paliers conservés entre elles
log('\n[10] Campagne : tentatives successives avec paliers conservés (règles réelles)');
for (const level of [1, 2]) {
  const att = [];
  let errors = 0;
  for (let i = 0; i < RUNS; i++) {
    let { g, input, mg } = startSg(level);
    let n = 0, won = false;
    while (n < 6 && mg) {
      n++;
      const r = playSession(g, input, mg, MODES[0]);
      if (r.error) { errors++; break; }
      if (r.win) { won = true; break; }
      input.releaseAll();
      run(g, 5, () => g.scene === 'table' && !g.transition ? false : undefined);
      // l'aimant du barillet retient un instant la bille revenue sur le plateau
      run(g, 4, () => g.table.world.balls.some(b => b.state === 'free') ? false : undefined);
      if (g.scene !== 'table' || !g.table.world.balls.some(b => b.state === 'free')) break;
      mg = restart(g);
      if (!mg || g.scene !== 'minigame') break;
    }
    att.push(won ? n : 99);
  }
  const within = (k) => att.filter(a => a <= k).length;
  log(`  niv. ${level} : réussite en 1 tentative ${pct(within(1), RUNS)} · ≤ 2 : ${pct(within(2), RUNS)} · ≤ 3 : ${pct(within(3), RUNS)} · ≤ 6 : ${pct(within(6), RUNS)}`);
  check(errors === 0, 'campagne sans exception');
  // référence (1000 campagnes) : ≈ 73 % en 2 tentatives ; seuil à 3 écarts-types de l'échantillon
  if (level === 1 && STATS) check(within(2) / RUNS >= 0.73 - 3 * Math.sqrt(0.73 * 0.27 / RUNS), `niveau 1 : la plupart des campagnes réussissent en 2 tentatives (${pct(within(2), RUNS)})`);
}

const s1 = summary['niv. 1 (règles réelles)'], s3 = summary['niv. 3 (règles réelles)'];
const sh1 = summary['niv. 1 (boucliers illimités)'], sh3 = summary['niv. 3 (boucliers illimités)'];
const tw = (s) => avg(s.rs.filter(r => r.win), r => r.t);
if (STATS) {
  // référence (pilote simple, 300 parties) : ≈ 42 % ; tolérance de 3 écarts-types de l'échantillon
  const tol = 3 * Math.sqrt(0.42 * 0.58 / RUNS);
  check(Math.abs(s1.wins / RUNS - 0.42) <= tol, `niveau 1, règles réelles : le pilote simple (moins adroit qu'un joueur) gagne ${pct(s1.wins, RUNS)} des parties (réf. 42 % ± ${Math.round(tol * 100)})`);
  check(sh1.wins / RUNS >= 0.9, 'niveau 1, boucliers illimités : objectif atteignable dans le temps imparti');
  check(tw(sh3) > tw(sh1), `la difficulté monte avec le niveau (durée ${tw(sh1).toFixed(0)} s → ${tw(sh3).toFixed(0)} s)`);
  check(avg(sh1.rs, r => r.frondes) > 0.2, 'des frondes surviennent en jeu ordinaire');
} else log(`  (indicatif sur ${RUNS} parties : niv. 1 ${pct(s1.wins, RUNS)}, niv. 3 ${pct(s3.wins, RUNS)})`);

const used = [...sfxLog.keys()].filter(k => k.startsWith('sg')).sort();
log(`\nSons demandés : ${used.join(', ')}`);
check(['sgCell', 'sgCapture', 'sgSpit', 'sgGrow', 'sgFronde', 'sgStabilize', 'sgImplode'].every(k => sfxLog.has(k)), 'sons principaux déclenchés');
log(`Répliques de LUMEN entendues : ${said.size}`);
log(`\nRésultat : ${passes} vérifications réussies, ${failures} échec(s).`);
process.exit(failures ? 1 : 0);
