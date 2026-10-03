// Tests headless du minijeu DÉFENSE DE LA STATION (arène à batteurs, tourelles).
// Géométrie, tourelles → rayons, salve, canon orbital, brèches de coque, chute,
// progression conservée, puis parties automatiques (taux de victoire du pilote simple).
// Usage : node tools/test-defense.js [parties par niveau et par mode]
import { Game } from '../src/game/game.js';

const DT = 1 / 120;
const RUNS = Math.max(1, parseInt(process.argv[2] || '30', 10));
const LINE_Y = 560;
let failures = 0, passes = 0;
const log = (...a) => console.log(...a);
function check(cond, msg) {
  if (cond) { passes++; log('  ✔', msg); } else { failures++; log('  ✘', msg); }
}

// ------------------------------------------------------------------ simulacres (comme sim-tests.js)
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
const ui = {
  banner: noop, lumen: noop, tally: noop, flashBalls: noop,
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

// démarre le minijeu DÉFENSE avec la bille du plateau
function startDefense(level = 1) {
  const { g, input } = makeGame();
  g.newGame();
  g.level = level; g.applyDifficulty();
  g.table.launch(0.5); run(g, 0.5);
  g.debug('start', 'defense');
  run(g, 3, () => g.scene === 'minigame' ? false : undefined);
  return { g, input, mg: g.minigame };
}

function restart(g) {
  g.debug('qualify', 'defense');
  g.debug('start', 'defense');
  run(g, 3, () => g.scene === 'minigame' ? false : undefined);
  return g.minigame;
}

// pilote automatique simple (identique à sim-tests.js) : frappe quand la bille approche d'un batteur
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

// distance point → segment
function segDist(px, py, p) {
  let t = ((px - p.ax) * p.dx + (py - p.ay) * p.dy) / p.len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (p.ax + p.dx * t), py - (p.ay + p.dy * t));
}

// ------------------------------------------------------------------ 1. géométrie
log('\n[1] Géométrie : passages libres autour des tourelles et des drones');
{
  const { g, mg } = startDefense(1);
  check(g.scene === 'minigame' && mg && mg.sector === 'defense', 'minijeu DÉFENSE démarré');
  check(!mg.paddle && mg.world.flippers.length === 2, 'arène à batteurs (pas de plateforme)');
  let minGap = Infinity;
  for (const tu of mg.turrets) {
    for (const p of mg.world.statics) {
      if (p === tu.p) continue;
      let gap;
      if (p.kind === 'seg') gap = segDist(tu.x, tu.y, p) - p.r - tu.p.r;
      else if (p.kind === 'circle') gap = Math.hypot(p.x - tu.x, p.y - tu.y) - p.r - tu.p.r;
      else continue;
      minGap = Math.min(minGap, gap);
    }
  }
  check(minGap > 26 * 1.8, `espace libre autour des tourelles : ${minGap.toFixed(0)} (bille Ø 26)`);
  // couloir de vol des drones : jamais à moins d'un diamètre de bille + marge des murs et du dôme
  let worst = Infinity;
  for (let y = 150; y <= LINE_Y; y += 10) {
    for (const r of [15, 21, 64]) {
      for (const x of [0, 600]) {
        const cx = mg._clampX(x, y, r);
        for (const p of mg.world.statics) {
          if (p.kind !== 'seg' || p.style !== 'rail') continue;
          worst = Math.min(worst, segDist(cx, y, p) - p.r - r);
        }
      }
    }
  }
  check(worst > 30, `drones à plus de 30 unités des murs et du dôme (min ${worst.toFixed(0)})`);
  check(LINE_Y + 30 < Math.min(...mg.turrets.map(t => t.y - t.p.r)), 'ligne de défense au-dessus des tourelles (aucune poche entre drones et tourelles)');
}

// ------------------------------------------------------------------ 2. tourelles, salve, orbital
log('\n[2] Tourelles : rayon auto-guidé, surcharge, salve, canon orbital');
{
  const { g, mg } = startDefense(1);
  mg.waveDelay = 999;
  check(mg.overT > 0 && mg.perkT > 0, 'avantage d\'entrée : tourelles surchargées');
  mg.overT = 0;
  const ball = mg.world.balls[0];
  const low = mg._spawn('scout', 300, 420); low.warp = 1;
  const high = mg._spawn('tank', 220, 250); high.warp = 1;
  // la bille tombe sur la tourelle gauche
  const tu = mg.turrets[0];
  ball.setPos(tu.x + 3, tu.y - 60); ball.vx = 0; ball.vy = 900;
  run(g, 0.15);
  check(mg.turretHits === 1, 'impact sur la tourelle détecté');
  check(!low.alive && high.alive, 'le rayon abat le drone le plus bas en premier');
  check(mg.beams.length > 0 || mg.kills === 1, 'rayon tiré');
  // bouclier du blindé : absorbe un tir
  mg.overT = 12;
  tu.cd = 0;
  mg.hitTurret(tu, ball, 500);
  check(high.shield === 0 && high.hp === high.maxHp, 'le bouclier absorbe le premier tir');
  mg.turrets[1].cd = 0;
  mg.hitTurret(mg.turrets[1], ball, 500);
  check(!high.alive, 'tir surchargé : 2 dégâts (blindé abattu)');
  // salve : 3 tourelles dans la fenêtre
  const ds = [mg._spawn('scout', 200, 300), mg._spawn('lancer', 360, 300), mg._spawn('scout', 281, 220)];
  for (const d of ds) d.warp = 1;
  mg.overT = 0;
  for (const t of mg.turrets) { t.lit = 0; t.cd = 0; }
  const before = mg.salvos;
  mg.hitTurret(mg.turrets[0], ball, 500); mg.turrets[0].cd = 0;
  mg.hitTurret(mg.turrets[1], ball, 500);
  check(mg.salvos === before, 'pas de salve avec 2 tourelles');
  mg.hitTurret(mg.turrets[2], ball, 500);
  check(mg.salvos === before + 1, 'SALVE déclenchée par les 3 tourelles');
  run(g, 1.2);
  check(ds.every(d => !d.alive), 'salve : onde de choc + tirs doubles abattent la formation');
  check(mg.turrets.every(t => t.lit === 0), 'tourelles réarmées après la salve');
  // canon orbital au sommet du dôme
  const col = mg._spawn('lancer', 300, 300); col.warp = 1;
  const off = mg._spawn('scout', 160, 320); off.warp = 1;
  ball.setPos(300, 110); ball.vx = 0; ball.vy = -1400;
  const orb = mg.orbitals;
  run(g, 0.1);
  check(mg.orbitals === orb + 1, 'canon orbital déclenché au sommet du dôme');
  check(!col.alive || !off.alive, 'colonne perforante : le drone visé est détruit');
}

// ------------------------------------------------------------------ 3. coque et brèches
log('\n[3] Ligne de défense : brèches, coque, échec et retour au plateau');
{
  const { g, mg } = startDefense(1);
  mg.waveDelay = 999;
  const id = mg.world.balls[0].id;
  const before = g.ballsLeft;
  check(mg.hull === 5 && mg.hullMax === 5, 'coque 5 au niveau 1');
  const d = mg._spawn('scout', 281, LINE_Y - 18); d.warp = 1;
  run(g, 0.3);
  check(!d.alive && mg.hull === 4 && mg.breaches === 1, 'drone sur la ligne : coque −1, drone retiré');
  const c = mg._spawn('carrier', 281, LINE_Y - 30); c.warp = 1;
  run(g, 0.4);
  check(mg.hull === 1, `porte-drones sur la ligne : coque −3 (${mg.hull})`);
  let res = null;
  const fin = mg.finish.bind(mg);
  mg.finish = (s, reason, drained) => { res = res || { s, reason }; fin(s, reason, drained); };
  const d2 = mg._spawn('scout', 200, LINE_Y - 18); d2.warp = 1;
  run(g, 0.3);
  check(res && !res.s && res.reason === 'hull', 'coque à 0 : échec du minijeu');
  run(g, 4, () => g.scene === 'table' && !g.transition ? false : undefined);
  check(g.scene === 'table' && g.table.world.balls.length === 1 && g.table.world.balls[0].id === id, 'la même bille revient sur le plateau');
  check(g.ballsLeft === before, 'aucune bille consommée');
  const { g: g2 } = startDefense(2);
  check(g2.minigame.hull === 4, 'coque 4 au niveau 2');
}

// ------------------------------------------------------------------ 4. chute, progression conservée, réussite
log('\n[4] Chute (sans bouclier), progression conservée, réussite et récompense');
{
  const { g, mg } = startDefense(1);
  const id = mg.world.balls[0].id;
  const before = g.ballsLeft;
  mg.waveDelay = 0;
  run(g, 1.2);
  check(mg.wave === 1 && mg.waveOn, 'vague 1 lancée');
  run(g, 12, () => {
    if (mg.cleared >= 1) return false;
    for (const d of [...mg.drones]) if (d.warp >= 0.3) mg.damage(d, 99, 'test');
    for (const s of mg.spawnQ) s.t = 0;
  });
  check(mg.cleared === 1 && !mg.waveOn, 'vague 1 repoussée');
  // chute sans bouclier : fin du minijeu, retour de la même bille
  mg.barrierT = 0; if (mg.barrier) mg.barrier.enabled = false;
  for (const b of mg.world.balls) { b.x = 300; b.y = 1200; b.vy = 100; }
  run(g, 4, () => g.scene === 'table' && !g.transition ? false : undefined);
  check(g.scene === 'table' && g.table.world.balls[0] && g.table.world.balls[0].id === id, 'chute : la même bille revient sur le plateau');
  check(g.ballsLeft === before, 'aucune bille consommée par la chute');
  const kept = g.table.sectors.defense.kept;
  check(kept && kept.wave === 1, `progression mémorisée (${JSON.stringify(kept)})`);
  const mg2 = restart(g);
  check(mg2 && mg2.cleared === 1, 'nouvelle tentative : vague 1 déjà repoussée');
  mg2.waveDelay = 0;
  run(g, 0.2);
  check(mg2.wave === 2, 'la tentative reprend à la vague 2');
  // réussite : on termine les vagues 2 et 3
  let guard = 0;
  while (g.minigame === mg2 && mg2.state !== 'ended' && guard++ < 4000) {
    for (const d of [...mg2.drones]) if (d.warp >= 0.3) mg2.damage(d, 99, 'test');
    if (!mg2.waveOn) mg2.waveDelay = 0;
    for (const s of mg2.spawnQ) s.t = 0;
    g.tick(DT);
  }
  check(mg2.state === 'ended' && mg2.cleared === 3, 'les 3 vagues repoussées : réussite');
  run(g, 4, () => g.scene === 'table' && !g.transition ? false : undefined);
  check(g.scene === 'table' && g.table.sectors.defense.done, 'secteur DÉFENSE réactivé');
  check(g.bonus.deferredMB >= 1, `récompense : multibille différée (${g.bonus.deferredMB})`);
  check(!g.table.sectors.defense.kept, 'progression effacée après la réussite');
  check(g.ledgerErrors === 0, 'comptabilité des billes sans erreur');
}

// ------------------------------------------------------------------ 5. bouclier : relance de la même bille
log('\n[5] Chute avec bouclier : relance au lanceur, drones figés');
{
  const { g, mg } = startDefense(1);
  const id = mg.world.balls[0].id;
  mg.waveDelay = 0; run(g, 2);
  g.bonus.grant('shield');
  mg.barrierT = 0; if (mg.barrier) mg.barrier.enabled = false;
  for (const b of mg.world.balls) { b.x = 300; b.y = 1200; b.vy = 100; }
  run(g, 0.05);
  check(mg.state === 'relaunch' && mg.pendingBall && mg.pendingBall.id === id, 'relance automatique de la même bille');
  const ys = mg.drones.map(d => d.y);
  run(g, 0.3);
  check(mg.drones.every((d, i) => d.y === ys[i]), 'drones figés pendant la relance');
  run(g, 2, () => mg.state === 'play' ? false : undefined);
  check(mg.state === 'play' && mg.world.balls[0].id === id, 'la bille est relancée dans l\'arène');
}

// ------------------------------------------------------------------ 6. parties automatiques
log(`\n[6] Parties automatiques : pilote simple de sim-tests.js, ${RUNS} parties par niveau et par mode`);
// modes : règles réelles (chute = échec), boucliers illimités (seul le chrono et la coque comptent),
// et joueur moins précis (un impact de tourelle sur deux ignoré) pour estimer la pression des drones
const MODES = [
  { name: 'règles réelles', shields: false, acc: 1 },
  { name: 'boucliers illimités', shields: true, acc: 1 },
  { name: 'boucliers illimités, 1 impact de tourelle sur 2', shields: true, acc: 0.5 },
];

function playOne(level, mode) {
  const { g, input, mg } = startDefense(level);
  return playSession(g, input, mg, mode);
}

function playSession(g, input, mg, mode = MODES[0]) {
  const shields = mode.shields;
  if (mode.acc < 1) { const hit = mg.hitTurret.bind(mg); mg.hitTurret = (tu, b, imp) => { if (Math.random() < mode.acc) hit(tu, b, imp); }; }
  const out = { win: false, reason: 'none', t: 0, hull: 0, cleared: 0, hits: 0, salvos: 0, orbitals: 0, kills: 0, breaches: 0, unstuck: 0,
    nan: false, error: null, maxAway: 0, droneBelow: false, shieldsUsed: 0, ms: 0, ticks: 0 };
  let res = null;
  const fin = mg.finish.bind(mg);
  mg.finish = (s, reason, drained) => { res = res || { s, reason, t: mg.time, hull: mg.hull, cleared: mg.cleared }; fin(s, reason, drained); };
  let launchHold = 0, away = 0;
  try {
    for (let i = 0; i < 140 / DT; i++) {
      if (g.minigame !== mg || mg.state === 'ended') break;
      if (shields && g.bonus.shield === 0) { g.bonus.grant('shield'); out.shieldsUsed++; }
      bot(g, input);
      if (mg.launchReady()) { launchHold += DT; input.s.launch = (launchHold % 1.2) < 0.75; } else { launchHold = 0; input.s.launch = false; }
      const b = mg.world.balls[0];
      if (b && b.state === 'free') {
        if (!Number.isFinite(b.x) || !Number.isFinite(b.y) || !Number.isFinite(b.vx)) out.nan = true;
        if (b.y > 850) away = 0; else { away += DT; out.maxAway = Math.max(out.maxAway, away); }
      }
      for (const d of mg.drones) if (mg._bottom(d) > LINE_Y + 8) out.droneBelow = true;
      const t0 = performance.now();
      g.tick(DT);
      out.ms += performance.now() - t0; out.ticks++;
    }
  } catch (e) { out.error = e; }
  if (res) { out.win = res.s; out.reason = res.reason; out.t = res.t; out.hull = res.hull; out.cleared = res.cleared; }
  out.hits = mg.turretHits; out.salvos = mg.salvos; out.orbitals = mg.orbitals; out.kills = mg.kills;
  out.breaches = mg.breaches; out.unstuck = mg.unstuck;
  out.ledger = g.ledgerErrors;
  return out;
}

const pct = (n, d) => `${Math.round(100 * n / Math.max(1, d))} %`;
const avg = (a, f) => a.reduce((s, x) => s + f(x), 0) / Math.max(1, a.length);
const summary = {};
for (const level of [1, 2]) {
  for (const mode of MODES) {
    const rs = [];
    for (let i = 0; i < RUNS; i++) rs.push(playOne(level, mode));
    const wins = rs.filter(r => r.win).length;
    const reasons = {};
    for (const r of rs) reasons[r.reason] = (reasons[r.reason] || 0) + 1;
    const key = `niv. ${level} (${mode.name})`;
    summary[key] = { wins, rs };
    log(`  — ${key} : victoires ${wins}/${RUNS} (${pct(wins, RUNS)}) · issues ${JSON.stringify(reasons)}`);
    log(`    tourelles touchées ${avg(rs, r => r.hits).toFixed(1)}/partie · salves ${avg(rs, r => r.salvos).toFixed(2)} · canon orbital ${avg(rs, r => r.orbitals).toFixed(2)} · drones abattus ${avg(rs, r => r.kills).toFixed(1)} · brèches ${avg(rs, r => r.breaches).toFixed(1)}`);
    log(`    vagues repoussées ${avg(rs, r => r.cleared).toFixed(2)} · durée ${avg(rs, r => r.t).toFixed(1)} s (victoires : ${avg(rs.filter(r => r.win), r => r.t).toFixed(1)} s) · coque restante (victoires) ${avg(rs.filter(r => r.win), r => r.hull).toFixed(1)}`);
    log(`    hors batteurs max ${Math.max(...rs.map(r => r.maxAway)).toFixed(1)} s · déblocages ${rs.reduce((s, r) => s + r.unstuck, 0)} · ${(avg(rs, r => r.ms / Math.max(1, r.ticks)) * 1000).toFixed(0)} µs/pas`);
    check(rs.every(r => !r.error), 'aucune exception' + (rs.find(r => r.error) ? ' : ' + rs.find(r => r.error).error.stack : ''));
    check(rs.every(r => !r.nan), 'aucune valeur NaN');
    check(rs.every(r => r.reason !== 'none'), 'chaque partie se termine (réussite, chute, coque ou chrono)');
    check(rs.every(r => r.maxAway < 15), `la bille revient toujours vers les batteurs (max ${Math.max(...rs.map(r => r.maxAway)).toFixed(1)} s hors zone)`);
    check(rs.reduce((s, r) => s + r.unstuck, 0) <= Math.ceil(RUNS / 10), 'aucun blocage notable (déblocages automatiques rares)');
    check(rs.every(r => !r.droneBelow), 'aucun drone sous la ligne de défense');
    check(avg(rs, r => r.hits) >= 8, 'le pilote touche régulièrement les tourelles');
    check(rs.every(r => r.ledger === 0), 'comptabilité des billes sans erreur');
  }
}
// campagne : tentatives successives (une bille par tentative), progression conservée entre elles
log('\n[7] Campagne : tentatives successives avec progression conservée (règles réelles)');
for (const level of [1, 2]) {
  const att = [];
  let errors = 0;
  for (let i = 0; i < RUNS; i++) {
    let { g, input, mg } = startDefense(level);
    let n = 0, won = false;
    while (n < 6 && mg) {
      n++;
      const r = playSession(g, input, mg, MODES[0]);
      if (r.error) { errors++; break; }
      if (r.win) { won = true; break; }
      input.releaseAll();
      run(g, 5, () => g.scene === 'table' && !g.transition ? false : undefined);
      if (g.scene !== 'table' || !g.table.world.balls.some(b => b.state === 'free')) break;
      mg = restart(g);
      if (!mg || g.scene !== 'minigame') break;
    }
    att.push(won ? n : 99);
  }
  const within = (k) => att.filter(a => a <= k).length;
  log(`  niv. ${level} : réussite en 1 tentative ${pct(within(1), RUNS)} · ≤ 2 : ${pct(within(2), RUNS)} · ≤ 3 : ${pct(within(3), RUNS)} · ≤ 6 : ${pct(within(6), RUNS)}`);
  check(errors === 0, 'campagne sans exception');
  if (level === 1) check(within(3) / RUNS >= 0.5, 'niveau 1 : au moins la moitié des campagnes réussies en 3 tentatives');
}

const s1 = summary['niv. 1 (boucliers illimités)'];
check(s1.wins / RUNS >= 0.35, `niveau 1 : le pilote simple gagne une bonne part des parties dans le temps imparti (${pct(s1.wins, RUNS)})`);

log(`\nSons demandés : ${[...sfxLog.keys()].filter(k => k.startsWith('def')).sort().join(', ')}`);
log(`\nRésultat : ${passes} vérifications réussies, ${failures} échec(s).`);
process.exit(failures ? 1 : 0);
