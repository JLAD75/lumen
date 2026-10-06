// Tests headless du minijeu LABYRINTHE GYROSCOPIQUE (secteur CONDUITS).
// Plans (connexité, sortie accessible par le bas seulement, clés, trappes hors parcours,
// portes sur le parcours), mécaniques (rotation continue de la gravité, frein, clés, sortie,
// chute et reprise à la balise, trappes scellées, flèches, capsules, portes laser jamais
// refermées sur la bille, chrono, progression conservée), puis parties automatiques avec un
// pilote qui ne commande que ← et → (et le frein), comme un joueur : précis ou approximatif.
// Usage : node tools/test-maze.js [parties par niveau et par pilote]
import { Game } from '../src/game/game.js';
import { MZ, planFor, cellCenter, cellOf } from '../src/minigames/mazeGen.js';
import { mazeTuning } from '../src/minigames/maze.js';

const DT = 1 / 120;
const RUNS = Math.max(1, parseInt(process.argv[2] || '20', 10));
const { COLS, ROWS, CS } = MZ;
let failures = 0, passes = 0;
const log = (...a) => console.log(...a);
function check(cond, msg) {
  if (cond) { passes++; log('  ✔', msg); } else { failures++; log('  ✘', msg); }
}

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
const ui = { banner: noop, lumen: noop, tally: noop, flashBalls: noop, onGameStart: noop, showPause: noop, showTitle: noop, showGameOver: noop, dmd: { show: noop } };

function makeGame() {
  const input = new BotInput();
  const g = new Game({ renderer: { fx, render: noop, alpha: 1 }, audio, input, ui, settings: { reducedMotion: false, reducedFx: false } });
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
function startMaze(level = 1) {
  const { g, input } = makeGame();
  g.newGame();
  g.level = level; g.applyDifficulty();
  g.table.launch(0.5); run(g, 0.5);
  g.debug('start', 'maze');
  run(g, 3, () => g.scene === 'minigame' ? false : undefined);
  return { g, input, mg: g.minigame };
}
function restart(g) {
  g.debug('qualify', 'maze');
  g.debug('start', 'maze');
  run(g, 3, () => g.scene === 'minigame' ? false : undefined);
  return g.minigame;
}
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

// Pilote : vise la clé restante la plus proche (en distance de parcours), puis la sortie.
// Il ne fait que tourner la gravité (←/→, vitesse limitée comme un joueur) et freiner.
// skill.noise : erreur d'estimation (rad) · skill.react : délai entre deux décisions (s)
// · skill.dead : tolérance avant de corriger (rad).
function makePilot(skill) {
  const st = { t: 0, want: 0, brake: false };
  return (g, input) => {
    const mg = g.minigame, b = mg && mg.ball;
    if (!b || b.state !== 'free') { input.s.left = input.s.right = input.s.launch = false; return; }
    st.t -= DT;
    if (st.t <= 0) {
      st.t = skill.react;
      const P = mg.plan;
      const [c, r] = cellOf(b.x, b.y);
      const here = [Math.max(0, Math.min(COLS - 1, c)), Math.max(0, Math.min(ROWS - 1, r))];
      const { dist } = P.bfs(here[0], here[1]);
      const targets = mg.keys.filter(k => !k.got).map(k => cellOf(k.x, k.y));
      let tgt = mg.plan.exit;
      if (targets.length) targets.sort((a, z) => dist[P.key(a[0], a[1])] - dist[P.key(z[0], z[1])]), tgt = targets[0];
      const path = P.pathTo(here, tgt);
      // point de visée : centre de la cellule suivante (ou de celle d'après si on y est presque)
      let wp = path.length > 1 ? cellCenter(...path[1]) : cellCenter(...tgt);
      if (path.length > 2 && Math.hypot(b.x - wp[0], b.y - wp[1]) < 22) wp = cellCenter(...path[2]);
      // trappe voisine : on vise le centre exact du couloir et on ralentit
      const ax = 7 * (wp[0] - b.x) - 2.6 * b.vx, ay = 7 * (wp[1] - b.y) - 2.6 * b.vy;
      st.want = Math.atan2(ax, ay) + (Math.random() * 2 - 1) * skill.noise;
      const sp = Math.hypot(b.vx, b.vy);
      const err = Math.abs(wrap(st.want - mg.phi));
      // trappe droit devant, à moins d'une cellule et demie : on freine, comme un joueur
      const trapAhead = sp > 150 && mg.traps.some(T => { const dx = T.x - b.x, dy = T.y - b.y, d = Math.hypot(dx, dy); return d < CS * 1.5 && (dx * b.vx + dy * b.vy) / (d * sp + 1e-6) > 0.8; });
      st.brake = trapAhead || (sp > 330 && err > 1.4) || (sp > 480 && err > 0.7);
    }
    const d = wrap(st.want - mg.phi);
    input.s.launch = st.brake;
    input.s.right = !st.brake && d > skill.dead;
    input.s.left = !st.brake && d < -skill.dead;
  };
}
export { makePilot, startMaze };
const SKILLS = [
  { name: 'précis', noise: 0.08, react: 0.05, dead: 0.1 },
  { name: 'approximatif', noise: 0.3, react: 0.14, dead: 0.22 },
];

// ------------------------------------------------------------------ 1. plans
log('\n[1] Plans des niveaux 1 à 5');
for (let level = 1; level <= 5; level++) {
  const P = planFor(level);
  const { dist } = P.bfs(P.start[0], P.start[1]);
  const all = dist.every(d => d < Infinity);
  const exitOpen = P.open[P.key(P.exit[0], P.exit[1])];
  let routeOk = true;
  for (let i = 1; i < P.route.length; i++) {
    const [a, b] = [P.route[i - 1], P.route[i]];
    if (Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) !== 1) routeOk = false;
  }
  const onRoute = new Set(P.route.map(([c, r]) => P.key(c, r)));
  const trapsOff = P.traps.every(([c, r]) => !onRoute.has(P.key(c, r)));
  const keysOk = P.keys.every(([c, r]) => onRoute.has(P.key(c, r)));
  log(`  niveau ${level} : parcours ${P.route.length} cellules · ${P.keys.length} clés · ${P.traps.length} trappes · ${P.checks.length} balises · ${P.boosts.length} flèches · ${P.caps.length} capsules · ${P.doors.length} portes`);
  check(all, `niveau ${level} : toutes les cellules sont accessibles depuis le départ`);
  check(exitOpen.size === 1 && exitOpen.has('s'), `niveau ${level} : la sortie ne s'ouvre que vers le bas`);
  check(routeOk && keysOk, `niveau ${level} : le parcours de référence passe par toutes les clés`);
  check(trapsOff, `niveau ${level} : aucune trappe sur le parcours de référence`);
  check(P.keys.length === [3, 4, 5][Math.min(2, level - 1)], `niveau ${level} : ${P.keys.length} clés`);
}

// ------------------------------------------------------------------ 2. mécaniques
log('\n[2] Mécaniques');
{
  const { g, input, mg } = startMaze(1);
  check(g.scene === 'minigame' && mg && mg.sector === 'maze', 'minijeu LABYRINTHE démarré (secteur CONDUITS)');
  check(mg.world.flippers.length === 0, 'pas de batteurs');
  check(mg.perkT > 0 && mg.sealT > 0 && /Trappes/.test(mg.perk.name), 'avantage d\'entrée : trappes scellées');
  check(mg.progressText().includes('0/3'), `progression lisible : « ${mg.progressText()} »`);
  const b = mg.ball;
  check(Math.hypot(b.x - mg.startPos.x, b.y - mg.startPos.y) < 40, 'la bille entre par la case de départ');
  // rotation continue : → maintenu fait tourner la gravité, sans retour au relâchement
  input.s.right = true; run(g, 0.5); input.s.right = false;
  const phi1 = mg.phi;
  run(g, 0.5);
  check(phi1 > 0.8 && Math.abs(mg.phi - phi1) < 1e-9, `→ maintenu 0,5 s : gravité tournée de ${Math.round(phi1 * 57.3)}°, sans retour automatique`);
  check(Math.abs(mg.world.gx - Math.sin(mg.phi) * mazeTuning(1).G) < 1, 'la gravité du monde suit la rotation');
  input.s.left = true; run(g, 0.5); input.s.left = false;
  check(mg.phi < phi1 - 0.8, '← la fait tourner dans l\'autre sens');
  // frein : la bille ralentit fortement
  b.vx = 500; b.vy = 0;
  input.s.left = input.s.right = true; run(g, 0.4);
  check(mg.braking && Math.hypot(b.vx, b.vy) < 250, `← + → ensemble : frein magnétique (vitesse ${Math.hypot(b.vx, b.vy).toFixed(0)})`);
  input.s.left = input.s.right = false; run(g, 0.05);
  check(!mg.braking, 'frein relâché avec les commandes');
  // clé ramassée
  const K = mg.keys[0];
  b.setPos(K.x, K.y); b.vx = b.vy = 0;
  run(g, 0.05);
  check(K.got && mg.keysGot === 1, 'une clé se ramasse en passant dessus');
  // chute : trappes scellées pendant l'avantage, puis chute et reprise à la balise
  const T = mg.traps[0];
  b.setPos(T.x, T.y); b.vx = b.vy = 0;
  run(g, 0.05);
  check(!mg.fall, 'trappes scellées : la bille passe dessus sans tomber');
  mg.sealT = 0;
  const C = mg.checks[0];
  b.setPos(C.x, C.y); b.vx = b.vy = 0; run(g, 0.05);
  check(C.on && mg.respawn.x === C.x, 'balise franchie : point de reprise enregistré');
  const tl = mg.timeLeft;
  b.setPos(T.x, T.y); b.vx = b.vy = 0; run(g, 0.05);
  check(!!mg.fall && mg.falls === 1, 'trappe ouverte : la bille tombe');
  check(Math.abs(mg.timeLeft - (tl - 3)) < 0.2, 'chute : −3 s au chrono');
  run(g, 2, () => mg.fall ? undefined : false);
  check(!mg.fall && b.state === 'free' && Math.hypot(b.x - C.x, b.y - C.y) < 10, 'la bille repart de la dernière balise');
  // flèche
  if (mg.boosts.length) {
    const B = mg.boosts[0];
    b.setPos(B.x, B.y); b.vx = b.vy = 0; run(g, 0.02);
    check(b.vx * B.dx + b.vy * B.dy > 400, 'flèche : la bille est lancée dans son sens');
  }
  // capsule
  if (mg.caps.length) {
    const Cp = mg.caps[0], t0 = mg.timeLeft;
    b.setPos(Cp.x, Cp.y); b.vx = b.vy = 0; run(g, 0.02);
    check(Cp.got && mg.timeLeft > t0 + 4.5, 'capsule : +5 s');
  }
  // toutes les clés : la sortie s'ouvre ; l'atteindre gagne (récompenses)
  for (const k of mg.keys) { b.setPos(k.x, k.y); b.vx = b.vy = 0; run(g, 0.03); }
  check(mg.exit.open, 'toutes les clés : la sortie s\'ouvre');
  let res = null;
  const fin = g.finishMinigame.bind(g);
  g.finishMinigame = (x) => { res = x; fin(x); };
  b.setPos(mg.exit.x, mg.exit.y + 10); b.vx = b.vy = 0;
  run(g, 3);
  check(res && res.success && res.reason === 'exit', 'sortie atteinte : victoire');
  check(res && res.rewards.some(r => r.type === 'shield') && res.rewards.some(r => r.type === 'magnet') && !res.rewards.some(r => r.type === 'rampJackpot'), 'récompense : bouclier + aimant (une chute : pas de jackpot de rampe)');
}
{
  const { g, mg } = startMaze(1);
  const r = mg.results(true);
  check(r.rewards.some(x => x.type === 'rampJackpot'), 'parcours sans chute : jackpot de rampe en plus');
  // chrono écoulé : échec, clés conservées, rendues à la tentative suivante
  const b = mg.ball;
  for (const k of mg.keys.slice(0, 2)) { b.setPos(k.x, k.y); b.vx = b.vy = 0; run(g, 0.03); }
  let res = null;
  const fin = g.finishMinigame.bind(g);
  g.finishMinigame = (x) => { res = x; fin(x); };
  mg.timeLeft = 0.05;
  run(g, 1.5);
  check(res && !res.success && res.reason === 'timeout' && res.kept.keys.length === 2, 'chrono écoulé : échec, 2 clés conservées');
  run(g, 6, () => g.scene === 'table' && !g.transition ? false : undefined);
  run(g, 5, () => g.table.world.balls.some(x => x.state === 'free') ? false : undefined);
  const mg2 = restart(g);
  check(mg2 && mg2.keysGot === 2, `tentative suivante : ${mg2 && mg2.keysGot} clés déjà en poche`);
}
{
  // portes laser (niveau 2) : cycle ouvert / fermé, jamais refermées sur la bille
  const { g, mg } = startMaze(2);
  check(mg.doors.length >= 2, `niveau 2 : ${mg.doors.length} portes laser`);
  const D = mg.doors[0], b = mg.ball;
  let states = new Set();
  run(g, 5, () => { states.add(D.closed); });
  check(states.has(true) && states.has(false), 'une porte s\'ouvre et se ferme en rythme');
  // bille posée dans l'embrasure au moment de la fermeture
  const [ax, ay, bx, by] = D.s;
  let pinched = false;
  for (let k = 0; k < 600; k++) {
    b.setPos((ax + bx) / 2, (ay + by) / 2); b.vx = b.vy = 0;
    g.tick(DT);
    if (D.closed) pinched = true;
  }
  check(!pinched, 'une porte ne se referme jamais sur la bille');
}

// ------------------------------------------------------------------ 3. parties automatiques
log(`\n[3] Parties automatiques : ${RUNS} parties par niveau et par pilote`);
const summary = {};
for (const level of [1, 2, 3]) {
  for (const S of SKILLS) {
    const rs = [];
    for (let i = 0; i < RUNS; i++) {
      const { g, input, mg } = startMaze(level);
      const pilot = makePilot(S);
      let res = null, err = null, nan = false;
      const fin = mg.finish.bind(mg);
      mg.finish = (s, reason, d) => { res = res || { s, reason, t: mg.time }; fin(s, reason, d); };
      try {
        for (let k = 0; k < 160 / DT; k++) {
          if (g.minigame !== mg || mg.state === 'ended') break;
          pilot(g, input);
          g.tick(DT);
          const b = mg.ball;
          if (b && (!Number.isFinite(b.x) || !Number.isFinite(b.vx))) nan = true;
        }
      } catch (e) { err = e; }
      input.releaseAll();
      rs.push({ win: !!(res && res.s), reason: res ? res.reason : 'none', t: res ? res.t : 0, keys: mg.keysGot, falls: mg.falls, left: mg.timeLeft, err, nan });
    }
    const wins = rs.filter(r => r.win).length;
    const avg = (f, a = rs) => a.reduce((s, x) => s + f(x), 0) / Math.max(1, a.length);
    summary[`${level}-${S.name}`] = wins / RUNS;
    log(`  — niv. ${level}, pilote ${S.name} : victoires ${wins}/${RUNS} · clés ${avg(r => r.keys).toFixed(1)}/${[3, 4, 5][level - 1]} · chutes ${avg(r => r.falls).toFixed(1)} · durée des victoires ${avg(r => r.t, rs.filter(r => r.win)).toFixed(1)} s (chrono ${mazeTuning(level).time} s) · temps restant ${avg(r => r.left, rs.filter(r => r.win)).toFixed(1)} s`);
    check(rs.every(r => !r.err), 'aucune exception' + (rs.find(r => r.err) ? ' : ' + rs.find(r => r.err).err.stack : ''));
    check(rs.every(r => !r.nan), 'aucune valeur NaN');
    check(rs.every(r => r.reason !== 'none'), 'chaque partie se termine (sortie ou chrono)');
  }
}
if (RUNS >= 10) {
  check(summary['1-précis'] >= 0.9, `niveau 1 : un joueur précis termine presque toujours (${Math.round(100 * summary['1-précis'])} %)`);
  check(summary['1-approximatif'] >= 0.5, `niveau 1 : un joueur approximatif termine au moins une fois sur deux (${Math.round(100 * summary['1-approximatif'])} %)`);
  check(summary['3-précis'] >= 0.6, `niveau 3 : faisable par un joueur précis (${Math.round(100 * summary['3-précis'])} %)`);
}

log(`\nSons demandés : ${[...sfxLog.keys()].filter(k => k.startsWith('maze')).sort().join(', ')}`);
log(`\nRésultat : ${passes} vérifications réussies, ${failures} échec(s).`);
process.exit(failures ? 1 : 0);
