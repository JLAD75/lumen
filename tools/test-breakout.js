// Tests headless du CASSE-BRIQUES ORBITAL (secteur HANGAR) : parties complètes jouées par
// un pilote automatique (niveaux 1 et 2), invariants physiques, taux de réussite,
// chute = retour au plateau, bouclier, progression conservée, échos, aimant, laser,
// changement de mur, récompenses, noms de sons.  Usage : node tools/test-breakout.js [parties]
import { Game } from '../src/game/game.js';
import { BK } from '../src/minigames/breakoutArt.js';
import { SFX } from '../src/audio/sfx.js';
import { SFX_BREAKOUT } from '../src/audio/sfx-breakout.js';
import { mulberry32 } from '../src/util/math.js';

const RUNS = Number(process.argv[2] || 40);
const RANDOM = Math.random;
const DT = 1 / 120;
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
const fx = { spark: noop, burst: noop, ring: noop, text: noop, flash: noop, shake: noop, drain: noop, update: noop, clear: noop };
const music = { setMode: noop, setIntensity: noop, setTension: noop, setFlag: noop, bump: noop, currentChord: () => [220, 261.6, 329.6] };
const sfxUsed = new Set(), sayUsed = new Set();
const audio = { music, sfx: (n) => sfxUsed.add(n), impact: noop, speak: noop, setPaused: noop, chargeLevel: noop, stopCharge: noop };
const ui = { banner: noop, lumen: noop, tally: noop, flashBalls: noop, onGameStart: noop, showPause: noop, showTitle: noop, showGameOver: noop };

function makeGame() {
  const input = new BotInput();
  const g = new Game({ renderer: { fx, render: noop, alpha: 1 }, audio, input, ui, settings: { reducedMotion: false, reducedFx: false } });
  g.scores = { best: 0, rank: () => -1, add: noop, list: [] };
  const say = g.say.bind(g);
  g.say = (k, p) => { sayUsed.add(k); say(k, p); };
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

// Démarre le minijeu du HANGAR avec la bille en jeu (niveau donné).
function enterHangar(g, level) {
  if (g.state !== 'play') g.newGame();
  g.level = level;
  if (!g.table.world.balls.some(b => b.state === 'free')) { g.table.launch(0.5); run(g, 0.5); }
  const ball = g.table.world.balls.find(b => b.state === 'free') || g.table.world.balls[0];
  g.debug('start', 'hangar');
  run(g, 3, () => g.scene === 'minigame' ? false : undefined);
  return { mg: g.minigame, id: ball.id };
}

// retour au plateau, puis fin de la rotation du barillet (l'aimant de l'œil relâche la bille)
const backToTable = (g) => { run(g, 5, () => g.scene === 'table' && !g.transition ? false : undefined); run(g, 5, () => g.table.magnet ? undefined : false); };

// ------------------------------------------------------------------ pilote automatique
// Prédit le point d'arrivée de la bille (rebonds sur les murs) et vise le verrou restant
// le plus proche ; réaction, imprécision et rares erreurs selon son profil.
function predictX(mg, b) {
  const P = mg.paddle, y1 = P.y - P.h / 2 - b.r;
  if (b.vy <= 1) return b.x;
  const lo = BK.L + 3 + b.r, hi = BK.R - 3 - b.r;
  let x = b.x, y = b.y, vx = b.vx, vy = b.vy;
  const s = Math.hypot(vx, vy), h = 1 / 240;
  for (let i = 0; i < 2000 && y < y1; i++) {
    x += vx * h; y += vy * h;
    if ((x < lo && vx < 0) || (x > hi && vx > 0)) {
      // même légère verticalisation que les murs du jeu
      x = x < lo ? 2 * lo - x : 2 * hi - x; vx = -vx;
      if (Math.abs(vy) < 0.42 * s) { vy += 0.07 * s; const k = s / Math.hypot(vx, vy); vx *= k; vy *= k; }
    }
  }
  return x;
}

function makeBot(rnd, profile) {
  return { t: 0, target: 300, aimU: 0, react: profile.react, err: profile.err, blunder: profile.blunder, k: 0, rnd, lastVy: 0, oops: 0 };
}

function drive(g, input, bot) {
  const mg = g.minigame;
  if (!mg || g.scene !== 'minigame') { input.releaseAll(); return; }
  const P = mg.paddle, rnd = bot.rnd;
  bot.k++;
  bot.t -= DT;
  const b = mg.ball && mg.ball.state === 'free' ? mg.ball : null;
  if (b && b.vy > 0 && bot.lastVy <= 0) {
    // nouvelle descente : nouvelle visée, parfois une erreur grossière
    bot.oops = rnd() < bot.blunder ? (rnd() < 0.5 ? -1 : 1) * (P.w * 0.75 + 40 * rnd()) : 0;
    const locks = mg.bricks.filter(br => br.alive && br.kind === 'L' && !br.doomed);
    const lx = predictX(mg, b);
    if (locks.length) {
      locks.sort((p, q) => Math.abs(p.x - lx) - Math.abs(q.x - lx));
      const tg = locks[0];
      const ang = Math.atan2(tg.x + BK.BW / 2 - lx, P.y - tg.y);
      bot.aimU = Math.max(-0.7, Math.min(0.7, ang / P.maxAngle));
    } else bot.aimU = (rnd() - 0.5) * 0.6;
    bot.aimU = Math.max(-0.8, Math.min(0.8, bot.aimU + (rnd() - 0.5) * bot.err));
  }
  if (b) bot.lastVy = b.vy;
  if (bot.t <= 0) {
    bot.t = bot.react;
    if (b && b.vy > 0) bot.target = predictX(mg, b) - bot.aimU * (P.w / 2) + bot.oops;
    else {
      // bille qui monte : rattraper une capsule si possible, sinon se recentrer sous la bille
      const cap = mg.capsules.filter(c => c.y < P.y).sort((p, q) => q.y - p.y)[0];
      bot.target = cap && (!b || b.y < 500) ? cap.x : b ? (b.x + 300) / 2 : P.x;
    }
  }
  // commande avec anticipation de la distance de freinage (relâcher freine le plus fort)
  const brake = P.vx * Math.abs(P.vx) / (2 * P.acc * 1.4);
  const want = bot.target - P.x - brake;
  input.s.left = want < -5; input.s.right = want > 5;
  const wantLaunch = mg.laserT > 0 || (mg.hold && mg.hold.ready) || mg.state === 'relaunch';
  input.s.launch = wantLaunch && bot.k % 10 < 6;
}

// ------------------------------------------------------------------ 1. structure
log('\n[1] Arène et murs');
{
  const { g } = makeGame();
  g.newGame();
  const { mg } = enterHangar(g, 1);
  check(g.scene === 'minigame' && mg && mg.sector === 'hangar', 'le minijeu HANGAR démarre');
  const segs = mg.world.statics.filter(p => p.kind === 'seg');
  const ceil = segs.find(p => p.ay === BK.CEIL && p.by === BK.CEIL);
  check(!!ceil && Math.abs(ceil.bx - ceil.ax) >= 480, `plafond plat à y = ${BK.CEIL} (${ceil ? Math.abs(ceil.bx - ceil.ax) : 0} px)`);
  check(segs.length === 5 && !mg.world.statics.some(p => p.kind === 'seg' && p.ay < BK.CEIL - 1), 'murs droits + 2 chanfreins, aucun dôme');
  check(segs.every(p => p.e === 1 && p.mu === 0), 'murs parfaitement élastiques (aucune perte d\'énergie)');
  const b0 = mg.bricks.filter(b => b.kind !== 'c');
  const cols = new Set(mg.bricks.map(b => b.col)).size, rows = new Set(mg.bricks.map(b => b.row)).size;
  check(cols === 11 && rows >= 8 && b0.length >= 80, `mur 1 : ${cols} colonnes × ${rows} rangées, ${b0.length} briques destructibles`);
  check(mg.locksTotal === 3 && mg.bricks.some(b => b.kind === 'c') && mg.bricks.some(b => b.kind === 'x') && mg.bricks.some(b => b.kind === 'p') && mg.bricks.some(b => b.kind === 'a'), 'verrous, chrome, explosives, capsules et blindées présents');
  check(mg.bricks.every(b => b.x >= BK.L + 3 && b.x + BK.BW <= BK.R - 3), 'briques dans l\'arène');
  check(mg.world.balls.length === 1 && mg.world.balls[0].vy > 0 && Math.abs(mg.world.balls[0].x - 300) < 80, 'entrée : bille au centre, vers la plateforme');
  check(!!mg.perk && mg.paddle.wideT > 0, 'avantage d\'entrée : plateforme élargie');
  check(/^Mur 1\/2 · Verrous 0\/3$/.test(mg.progressText()), `progression : « ${mg.progressText()} »`);
}

// ------------------------------------------------------------------ 2. parties automatiques
const PROFILES = [
  { name: 'expert', react: 0.05, err: 0.25, blunder: 0.005 },
  { name: 'bon', react: 0.09, err: 0.5, blunder: 0.012 },
  { name: 'moyen', react: 0.14, err: 0.9, blunder: 0.03 },
];
const allStats = {};
for (const level of [1, 2]) {
  log(`\n[2.${level}] Parties automatiques complètes, niveau ${level} (${RUNS} parties)`);
  const st = { runs: 0, wins: 0, reasons: {}, exc: 0, nan: 0, out: 0, speedBad: 0, stuck: 0, destroyed: 0, winTime: [], stage2: 0, ledger: 0, caps: 0, hug: 0, mid: 0, flat: 0, samples: 0, byProfile: {}, ticks: 0, ms: 0, maxShards: 0 };
  for (let r = 0; r < RUNS; r++) {
    const prof = PROFILES[r % PROFILES.length];
    const seed = 1000 * level + r;
    const origRandom = Math.random;
    Math.random = mulberry32(seed);
    const { g, input } = makeGame();
    let res = null;
    try {
      g.newGame();
      const { mg, id } = enterHangar(g, level);
      const bot = makeBot(mulberry32(seed * 7 + 1), prof);
      const finish = mg.finish.bind(mg);
      mg.finish = (s, reason, d) => { if (!res) res = { s, reason, t: mg.time, stage: mg.stageIdx, locks: mg.locksTotal - mg.locksLeft }; finish(s, reason, d); };
      let still = { x: 0, y: 0, t: 0 };
      const t0 = process.hrtime.bigint();
      let ticks = 0;
      while (g.scene === 'minigame' && mg.state !== 'ended' && ticks < 140 / DT) {
        drive(g, input, bot);
        g.tick(DT);
        ticks++;
        for (const b of mg.world.balls) {
          if (![b.x, b.y, b.vx, b.vy].every(Number.isFinite)) st.nan++;
          if (b.state !== 'free') continue;
          if (b.x < BK.L || b.x > BK.R || b.y < BK.CEIL || b.y > 1100) st.out++;
          const s = Math.hypot(b.vx, b.vy);
          // anomalie durable seulement (un choc bille/bille est corrigé au sous-pas suivant)
          b.badT = mg.time > 1.5 && (s < 300 || s > 1700) ? (b.badT || 0) + 1 : 0;
          if (b.badT === 4) { st.speedBad++; if (process.env.DBG) log('  vitesse', s.toFixed(0), b.echo ? 'écho' : 'bille', b.x.toFixed(0), b.y.toFixed(0), 't', mg.time.toFixed(2)); }
          if (b === mg.ball) {
            st.samples++;
            if (b.x < 100 || b.x > 500) st.hug++;
            if (b.y < 560) st.mid++;
            if (Math.abs(b.vy) < 0.3 * s) st.flat++;
            if (Math.hypot(b.x - still.x, b.y - still.y) > 40) still = { x: b.x, y: b.y, t: mg.time };
            else if (mg.time - still.t > 4) { st.stuck++; still.t = mg.time; }
          }
        }
        st.maxShards = Math.max(st.maxShards, mg.shards.length);
      }
      st.ms += Number(process.hrtime.bigint() - t0) / 1e6;
      st.ticks += ticks;
      st.destroyed += mg.destroyed;
      st.caps += mg.collected.caps;
      if (mg.stageIdx >= 1) st.stage2++;
      // retour au plateau avec la même bille
      backToTable(g);
      const back = g.table.world.balls.find(b => b.id === id);
      if (!back) st.reasons['bille non rendue'] = (st.reasons['bille non rendue'] || 0) + 1;
      st.ledger += g.ledgerErrors;
    } catch (e) {
      st.exc++;
      log('  exception :', e && e.stack);
    }
    Math.random = origRandom;
    st.runs++;
    const P = st.byProfile[prof.name] = st.byProfile[prof.name] || { n: 0, w: 0 };
    P.n++;
    if (res) {
      st.reasons[res.reason] = (st.reasons[res.reason] || 0) + 1;
      if (res.s) { st.wins++; P.w++; st.winTime.push(res.t); }
    }
  }
  allStats[level] = st;
  const avg = (a) => a.length ? (a.reduce((x, y) => x + y, 0) / a.length).toFixed(1) : '—';
  log(`  réussites ${st.wins}/${st.runs} (${Math.round(100 * st.wins / st.runs)} %) · fins : ${JSON.stringify(st.reasons)}`);
  log(`  par profil : ${Object.entries(st.byProfile).map(([k, v]) => `${k} ${v.w}/${v.n}`).join(' · ')}`);
  log(`  durée moyenne d'une réussite : ${avg(st.winTime)} s (min ${st.winTime.length ? Math.min(...st.winTime).toFixed(1) : '—'}) · mur 2 atteint : ${st.stage2}/${st.runs}`);
  log(`  briques détruites en moyenne : ${(st.destroyed / st.runs).toFixed(0)} · capsules attrapées en moyenne : ${(st.caps / st.runs).toFixed(1)}`);
  log(`  bille : ${(100 * st.hug / st.samples).toFixed(1)} % du temps près des murs (x<100 ou x>500), ${(100 * st.mid / st.samples).toFixed(1)} % dans la moitié haute, ${(100 * st.flat / st.samples).toFixed(1)} % en trajectoire plate`);
  log(`  coût : ${(st.ms / st.ticks * 1000).toFixed(1)} µs par pas de 1/120 s · éclats max ${st.maxShards}`);
  check(st.exc === 0, 'aucune exception');
  check(st.nan === 0, 'aucune valeur NaN');
  check(st.out === 0, 'la bille reste dans l\'arène');
  check(st.speedBad === 0, 'vitesse de la bille toujours raisonnable');
  check(st.stuck === 0, 'jamais de bille bloquée');
  check(st.ledger === 0, 'comptabilité des billes sans erreur');
  check(st.destroyed / st.runs > 30, 'des briques sont détruites');
  check(!st.reasons['bille non rendue'], 'la même bille revient toujours sur le plateau');
  check(st.wins > 0 && st.wins < st.runs, 'le pilote gagne souvent mais pas toujours');
  check(st.hug / st.samples < 0.45, 'la bille ne longe pas les murs');
}

// ------------------------------------------------------------------ 3. chute sans bouclier
log('\n[3] Chute sans bouclier : fin du minijeu, même bille sur le plateau, progression gardée');
{
  Math.random = mulberry32(5);
  const { g, input } = makeGame();
  g.newGame();
  const { mg, id } = enterHangar(g, 1);
  const bot = makeBot(mulberry32(9), PROFILES[0]);
  run(g, 20, () => { drive(g, input, bot); return mg.state === 'ended' ? false : undefined; });
  input.releaseAll();
  const before = g.ballsLeft;
  const gone = mg.bricks.filter(b => !b.alive && b.kind !== 'c').length;
  mg.barrierT = 0; mg.barrier.enabled = false;
  if (mg.hold) mg.releaseHold();
  mg.ball.x = 300; mg.ball.y = 1200; mg.ball.vy = 300;
  run(g, 0.05);
  check(mg.state === 'ended', 'la chute termine le minijeu');
  backToTable(g);
  check(g.scene === 'table' && g.ballsLeft === before, `retour au plateau sans perte de bille (${before} → ${g.ballsLeft})`);
  check(g.table.world.balls.length === 1 && g.table.world.balls[0].id === id && g.table.world.balls[0].state === 'free', 'la même bille revient en jeu');
  const kept = g.table.sectors.hangar.kept;
  check(kept && kept.stage === mg.stageIdx && Array.isArray(kept.gone) && kept.gone.length === (mg.stageIdx === 0 ? gone : kept.gone.length), `progression mémorisée (mur ${kept && kept.stage + 1}, ${kept && kept.gone.length} briques)`);
  check(JSON.parse(JSON.stringify(kept)).gone.length === kept.gone.length, 'progression = objet simple sérialisable');
  // nouvelle tentative : reprise
  g.debug('qualify', 'hangar');
  g.debug('start', 'hangar');
  run(g, 3, () => g.scene === 'minigame' ? false : undefined);
  const mg2 = g.minigame;
  const dead = mg2.bricks.filter(b => !b.alive).map(b => b.i);
  check(mg2 !== mg && mg2.stageIdx === kept.stage && dead.length === kept.gone.length && kept.gone.every(i => dead.includes(i)), 'la tentative suivante reprend les mêmes briques détruites');
  check(mg2.locksLeft === mg2.bricks.filter(b => b.alive && b.kind === 'L').length, 'verrous restants cohérents');
  check(mg2.world.balls.length === 1 && mg2.world.balls[0].id === id, 'même bille dans la nouvelle tentative');
  Math.random = RANDOM;
}

// ------------------------------------------------------------------ 4. bouclier
log('\n[4] Bouclier : relance automatique de la même bille depuis la plateforme');
{
  const { g } = makeGame();
  g.newGame();
  const { mg, id } = enterHangar(g, 1);
  g.bonus.grant('shield');
  const before = g.ballsLeft;
  mg.barrierT = 0; mg.barrier.enabled = false;
  mg.ball.y = 1200; mg.ball.vy = 300;
  run(g, 0.05);
  check(mg.state === 'relaunch' && g.bonus.shield === 0 && g.ballsLeft === before, 'bouclier consommé, réserve intacte, relance en attente');
  const pb = mg.pendingBall;
  check(pb && pb.id === id && pb.state === 'held' && Math.abs(pb.y - (mg.paddle.y - mg.paddle.h / 2 - pb.r - 1)) < 1, 'la bille attend posée sur la plateforme');
  check(mg.launchReady(), 'commande LANCER disponible');
  run(g, 1.2, () => mg.state === 'play' ? false : undefined);
  check(mg.state === 'play' && mg.ball.id === id && mg.ball.state === 'free' && mg.ball.vy < 0, 'relance automatique vers le haut');
}

// ------------------------------------------------------------------ 5. échos holographiques
log('\n[5] Échos : billes temporaires, leur chute n\'est jamais une perte');
{
  const { g } = makeGame();
  g.newGame();
  const { mg } = enterHangar(g, 1);
  g.bonus.grant('shield');
  mg.collect({ type: 'echo', x: mg.paddle.x, y: mg.paddle.y });
  check(mg.echoes.length === 2 && mg.world.balls.length === 3 && mg.allowMulti, '2 échos projetés, multibille autorisée');
  run(g, 0.5);
  check(g.ledgerErrors === 0, 'aucune erreur de comptabilité avec les échos');
  const e = mg.echoes[0];
  e.y = 1060; e.vy = 400;
  run(g, 0.05);
  check(!mg.world.balls.includes(e) && mg.state === 'play' && g.bonus.shield === 1, 'un écho qui tombe disparaît sans consommer le bouclier');
  mg.echoes[0].x = -100;
  run(g, 0.05);
  check(mg.state === 'play' && g.bonus.shield === 1 && mg.echoes.length === 0 && !mg.allowMulti, 'écho hors limites : ignoré, multibille désactivée');
  mg.collect({ type: 'echo', x: 300, y: 990 });
  const id = mg.ball.id;
  mg.barrierT = 0; mg.barrier.enabled = false;
  g.bonus.useShield();
  mg.ball.y = 1200;
  run(g, 0.05);
  check(mg.state === 'ended' && mg.echoes.length === 0, 'chute de la vraie bille pendant les échos : fin du minijeu, échos dissipés');
  backToTable(g);
  check(g.table.world.balls.length === 1 && g.table.world.balls[0].id === id && g.ledgerErrors === 0, 'seule la vraie bille revient sur le plateau');
}

// ------------------------------------------------------------------ 6. aimant, laser, ralenti, temps
log('\n[6] Capsules : aimant, laser, ralenti, temps, ×2, JACK');
{
  const { g, input } = makeGame();
  g.newGame();
  const { mg } = enterHangar(g, 1);
  const P = mg.paddle, b = mg.ball;
  mg.collect({ type: 'aimant', x: P.x, y: P.y });
  b.setPos(P.x + 10, P.y - 60); b.vx = 0; b.vy = 700;
  run(g, 0.3, () => mg.hold ? false : undefined);
  check(mg.hold && mg.hold.kind === 'magnet' && b.state === 'held', 'aimant : la bille reste collée à la plateforme');
  input.s.right = true; run(g, 0.2); input.s.right = false;
  check(Math.abs(b.x - (P.x + mg.hold.off)) < 1, 'la bille suit la plateforme');
  input.s.launch = true; run(g, 2 * DT); input.s.launch = false; run(g, DT);
  check(!mg.hold && b.state === 'free' && b.vy < 0, 'LANCER libère la bille vers le haut');
  b.setPos(P.x, P.y - 60); b.vx = 0; b.vy = 700;
  run(g, 0.3, () => mg.hold ? false : undefined);
  run(g, 2.3);
  check(!mg.hold && b.state === 'free', 'libération automatique après ~2 s');
  mg.magnetT = 0;
  // laser
  mg.collect({ type: 'laser', x: P.x, y: P.y });
  b.setPos(560, 700); b.vx = 0; b.vy = -800;
  const aliveBefore = mg.bricks.filter(x => x.alive).length;
  const hpBefore = mg.bricks.reduce((s, x) => s + (x.alive && x.kind !== 'c' ? x.hp : 0), 0);
  input.s.launch = true; run(g, DT * 2);
  check(mg.bolts.length === 2, 'LANCER : deux tirs laser jumelés');
  run(g, 1.2); input.s.launch = false;
  const hpAfter = mg.bricks.reduce((s, x) => s + (x.alive && x.kind !== 'c' ? x.hp : 0), 0);
  check(hpAfter < hpBefore && mg.bricks.filter(x => x.alive).length < aliveBefore, `les tirs cassent des briques (${aliveBefore - mg.bricks.filter(x => x.alive).length} détruites)`);
  // ralenti
  const s0 = mg.currentSpeed();
  mg.collect({ type: 'ralenti', x: P.x, y: P.y });
  check(mg.currentSpeed() < s0 * 0.75, 'ralenti : vitesse cible réduite');
  // temps, ×2 et JACK
  const tl = mg.timeLeft;
  mg.collect({ type: 'time', x: P.x, y: P.y });
  check(mg.timeLeft > tl + 7.9, '+8 s');
  mg.capsules.push({ x: 100, y: 300, type: 'mult', vy: 160, t: 0 });
  mg.collect({ type: 'mult', x: P.x, y: P.y });
  for (let i = 0; i < 30; i++) mg.spawnCapsule(300, 300);
  check(!mg.capsules.some(c => c.type === 'mult'), '×2 : une seule fois par tentative');
  mg.collect({ type: 'jack', x: P.x, y: P.y }); mg.collect({ type: 'jack', x: P.x, y: P.y });
  const r = mg.results(true);
  check(r.rewards.some(x => x.type === 'rampJackpot' && x.extra === 40000) && r.rewards.some(x => x.type === 'phase') && r.rewards.some(x => x.type === 'mult'), 'récompenses : jackpot de rampe (+20 000 par JACK), phase, ×2');
  const rf = mg.results(false);
  check(rf.partialRewards.length === 1 && rf.partialRewards[0].type === 'mult' && rf.rewards.length === 0, 'échec : ×2 conservé en récompense partielle');
  // capsule attrapée par la plateforme
  mg.capsules.length = 0;
  mg.capsules.push({ x: P.x, y: P.y - 60, type: 'large', vy: 160, t: 0 });
  const c0 = mg.collected.caps;
  run(g, 0.6);
  check(mg.collected.caps === c0 + 1 && P.wideT > 11, 'capsule rattrapée : plateforme élargie');
}

// ------------------------------------------------------------------ 7. changement de mur et victoire
log('\n[7] Mur 1 effondré → mur 2 descendant → victoire');
{
  const { g, input } = makeGame();
  g.newGame();
  const { mg, id } = enterHangar(g, 1);
  const bot = makeBot(mulberry32(3), { react: 0.05, err: 0.2, blunder: 0 });
  const play = (t, stop) => run(g, t, () => { drive(g, input, bot); return stop ? stop() : undefined; });
  play(1);
  for (const br of mg.bricks.filter(x => x.kind === 'L')) mg.damage(br, 9);
  const tl = mg.timeLeft;
  play(DT * 2);
  check(!!mg.trans && mg.hold && mg.hold.kind === 'stage', 'mur 1 effondré : la bille est rappelée sur la plateforme');
  input.releaseAll();
  run(g, 1.6);
  check(mg.stageIdx === 1 && mg.locksTotal === 3 && mg.wall.speed > 0, 'mur 2 construit (3 verrous, descente lente)');
  check(Math.abs(mg.timeLeft - tl) < 0.05, `chrono gelé pendant le changement de mur (${tl.toFixed(2)} → ${mg.timeLeft.toFixed(2)})`);
  play(3, () => mg.hold ? undefined : false);
  check(!mg.trans && !mg.hold && mg.ball.state === 'free' && mg.bricks.every(b => b.p.enabled || !b.alive), 'mur 2 en place, bille relancée automatiquement');
  check(/^Mur 2\/2 · Verrous 0\/3$/.test(mg.progressText()), `progression : « ${mg.progressText()} »`);
  const y0 = mg.bricks[0].y;
  play(4);
  check(mg.bricks[0].y > y0 + 5, `le mur 2 descend (${(mg.bricks[0].y - y0).toFixed(1)} px en 4 s)`);
  const k = mg.keepProgress();
  check(k.stage === 1, 'progression conservée : mur 2');
  for (const br of mg.bricks.filter(x => x.kind === 'L' && x.alive)) mg.damage(br, 9);
  play(0.1);
  check(mg.state === 'ended', 'les 3 verrous du mur 2 : victoire');
  backToTable(g);
  check(g.scene === 'table' && g.table.sectors.hangar.done && g.table.world.balls[0].id === id, 'secteur réactivé, même bille sur le plateau');
  check(g.table.sectors.hangar.kept === null, 'progression effacée après la réussite');
  input.releaseAll();
}

// ------------------------------------------------------------------ 8. sons et répliques
log('\n[8] Sons et répliques utilisés');
{
  const missing = [...sfxUsed].filter(n => !SFX[n] && !SFX_BREAKOUT[n]);
  check(missing.length === 0, `tous les sons existent (SFX ou SFX_BREAKOUT)${missing.length ? ' — manquants : ' + missing.join(', ') : ''}`);
  // SFX_BREAKOUT est fusionné dans SFX : chaque nom doit y pointer vers sa propre fonction
  const dup = Object.keys(SFX_BREAKOUT).filter(n => SFX[n] && SFX[n] !== SFX_BREAKOUT[n]);
  check(dup.length === 0, 'aucun conflit de nom avec SFX');
  const bk = [...sfxUsed].filter(n => SFX_BREAKOUT[n]);
  log(`  sons propres déclenchés : ${bk.length}/${Object.keys(SFX_BREAKOUT).length} (${bk.join(', ')})`);
  log(`  répliques demandées : ${[...sayUsed].join(', ')}`);
}

log(`\nRésultat : ${passes} vérifications réussies, ${failures} échec(s).`);
process.exit(failures ? 1 : 0);
