// Tests headless du minijeu CHASSE AUX BUGS (secteur SERVEURS).
// Géométrie (trappes dans le terrain, passages entre elles), atteignabilité (chaque trappe est
// touchée par des tirs de batteurs), mécaniques (alerte puis sortie, écrasement, blindé, doré,
// ver, combo, paliers, fuite, purge, récompenses, progression conservée, chute, avantage),
// puis parties automatiques avec deux pilotes (réflexe simple et frappe au hasard depuis le berceau).
// Usage : node tools/test-bugs.js [parties par niveau et par pilote]
import { Game } from '../src/game/game.js';
import { BG } from '../src/minigames/bugsArt.js';
import { bugsTuning } from '../src/minigames/bugs.js';

const DT = 1 / 120;
const RUNS = Math.max(1, parseInt(process.argv[2] || '30', 10));
const { CX, TRAPS, TRAP_R } = BG;
let failures = 0, passes = 0;
const log = (...a) => console.log(...a);
function check(cond, msg) {
  if (cond) { passes++; log('  ✔', msg); } else { failures++; log('  ✘', msg); }
}

// ------------------------------------------------------------------ simulacres (comme test-cyberball.js)
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
  dmd: { show: noop },
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

function startBugs(level = 1) {
  const { g, input } = makeGame();
  g.newGame();
  g.level = level; g.applyDifficulty();
  g.table.launch(0.5); run(g, 0.5);
  g.debug('start', 'bugs');
  run(g, 3, () => g.scene === 'minigame' ? false : undefined);
  return { g, input, mg: g.minigame };
}

function restart(g) {
  g.debug('qualify', 'bugs');
  g.debug('start', 'bugs');
  run(g, 3, () => g.scene === 'minigame' ? false : undefined);
  return g.minigame;
}

// force un bug d'une espèce donnée hors de la trappe i (sorti, longue vie)
function popBug(mg, i, kind = 'normal', life = 99) {
  const P = mg.traps[i];
  mg._warn(P, kind, 0);
  P.state = 'up'; P.t = 0; P.bug.life = life; P.p.enabled = true;
  return P;
}

// pilote réflexe (identique aux autres bancs) : frappe dès que la bille approche d'un batteur
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

// Frappe au hasard depuis le berceau : bloque la bille sur un batteur, la relâche, puis frappe
// après un délai tiré au sort (balaie tous les angles de tir). Sinon, réflexe simple.
function makeCradleBot() {
  const st = { mode: 'free', side: 0, t: 0, delay: 0 };
  return (g, input) => {
    const mg = g.minigame;
    const b = mg && mg.world.balls[0];
    if (!b || b.state !== 'free') { st.mode = 'free'; input.s.left = input.s.right = false; return; }
    const sp = Math.hypot(b.vx, b.vy);
    if (st.mode === 'free') {
      if (b.y > 800 && b.vy > 0 && b.x > 120 && b.x < 442) { st.side = b.x < CX ? -1 : 1; st.mode = 'catch'; st.t = 0; }
      else { reflexBot(g, input, 0.7); return; }
    }
    st.t += DT;
    const hold = (on) => { input.s.left = on && st.side < 0; input.s.right = on && st.side > 0; };
    if (st.mode === 'catch') {
      if (b.y < 915) st.side = b.x < CX ? -1 : 1;
      hold(true);
      if (b.y < 760 || st.t > 2.5) { st.mode = 'free'; hold(false); return; }
      if (st.t > 0.35 && sp < 40 && b.y > 900) { st.delay = 0.3 + Math.random() * 0.16; st.mode = 'release'; st.t = 0; }
      return;
    }
    if (st.mode === 'release') {
      hold(st.t >= st.delay);
      if (st.t >= st.delay + 0.25) { st.mode = 'free'; hold(false); }
    }
  };
}

// ------------------------------------------------------------------ 1. géométrie
log('\n[1] Géométrie : salle des serveurs, trappes');
{
  const { g, mg } = startBugs(1);
  check(g.scene === 'minigame' && mg && mg.sector === 'bugs', 'minijeu CHASSE AUX BUGS démarré (secteur SERVEURS)');
  check(mg.world.flippers.length === 2 && mg.frame, 'arène à batteurs (moitié basse conservée)');
  check(TRAPS.length === 9 && mg.traps.length === 9, '9 trappes');
  check(TRAPS.every(([x, y]) => x === CX || TRAPS.some(([x2, y2]) => Math.abs(x2 - (2 * CX - x)) < 0.01 && y2 === y)), 'trappes symétriques autour de l\'axe');
  const inside = TRAPS.every(([x, y]) => Math.hypot(x - 300, y - 300) < 280 - TRAP_R - 26 && x - TRAP_R > 20 + 26 && x + TRAP_R < 542 - 26);
  check(inside, 'chaque trappe laisse passer la bille entre elle et les murs');
  let gap = Infinity;
  for (let i = 0; i < TRAPS.length; i++) for (let j = i + 1; j < TRAPS.length; j++) gap = Math.min(gap, Math.hypot(TRAPS[i][0] - TRAPS[j][0], TRAPS[i][1] - TRAPS[j][1]) - 2 * 21);
  check(gap > 2 * 13 + 8, `passage entre deux bugs sortis plus large que la bille (${gap.toFixed(0)} unités, bille Ø 26)`);
  check(mg.traps.every(P => !P.p.enabled), 'au départ, aucune trappe n\'est solide');
  check(mg.traps.every(P => P.p.pierceable), 'les bugs se laissent perforer (noyau phasique)');
  check(mg.perkT > 0 && mg.perk && /Ralenti/.test(mg.perk.name), 'avantage d\'entrée : ralenti');
  check(mg.progressText().includes('0/13'), `progression lisible : « ${mg.progressText()} »`);
  const T1 = bugsTuning(1), T2 = bugsTuning(2), T3 = bugsTuning(3);
  check(T1.target === 13 && T2.target === 15 && T3.target === 17, `objectif 13 / 15 / 17 (${T1.target} / ${T2.target} / ${T3.target})`);
  check(T1.expo === 2.8 && T2.expo === 2.5 && T3.expo === 2.25, `exposition 2,8 / 2,5 / 2,25 s (${T1.expo} / ${T2.expo} / ${T3.expo})`);
}

// ------------------------------------------------------------------ 2. atteignabilité
// Table de tirs : depuis le berceau de chaque batteur, la bille est relâchée puis frappée après
// un délai donné ; on relève les trappes que sa trajectoire traverse (aucun bug sorti).
log('\n[2] Atteignabilité : table de tirs depuis les berceaux');
const SHOTS = [];          // { side, delay, traps: [i…], t: [temps d'arrivée] }
{
  for (const side of [-1, 1]) {
    for (let delay = 0.27; delay <= 0.5; delay += 0.004) {
      const { g, input, mg } = startBugs(1);
      mg.spawnCd = 1e9; mg.timeLeft = 1e9;
      mg.setBarrier(0); mg.barrierT = 0; if (mg.barrier) mg.barrier.enabled = false;
      const b = mg.ball;
      b.state = 'free'; b.setPos(side < 0 ? 205 : 357, 880); b.vx = 0; b.vy = 0;
      const hold = (on) => { input.s.left = on && side < 0; input.s.right = on && side > 0; };
      hold(true); run(g, 1.0); hold(false);
      let t = 0, hitT = -1;
      const near = new Map();
      run(g, delay + 1.4, () => {
        t += DT;
        hold(t >= delay && t < delay + 0.25);
        if (hitT < 0 && t >= delay && b.vy < -300) hitT = t;
        if (hitT >= 0) TRAPS.forEach(([x, y], i) => { if (!near.has(i) && Math.hypot(b.x - x, b.y - y) < 20 + 13) near.set(i, t - hitT); });
        if (b.vy > 0 && b.y > 500 && hitT >= 0) return false;
      });
      input.releaseAll();
      SHOTS.push({ side, delay, traps: [...near.keys()], t: [...near.values()] });
    }
  }
  const reach = TRAPS.map((_, i) => SHOTS.filter(S => S.traps.includes(i)).length);
  log(`    tirs qui traversent chaque trappe (sur ${SHOTS.length}) : ${reach.join(' · ')}`);
  check(reach.every(n => n >= 2), 'chaque trappe est sur la trajectoire de plusieurs tirs de batteurs');
}

// Chasseur (joueur appliqué) : bille au berceau, il choisit un bug visible (ou annoncé) que la
// table de tirs atteint depuis ce batteur, puis frappe au délai correspondant, à ±noise près.
function makeHunterBot(noise = 0.006) {
  const st = { mode: 'free', side: 0, t: 0, delay: 0 };
  return (g, input) => {
    const mg = g.minigame;
    const b = mg && mg.world.balls[0];
    if (!b || b.state !== 'free') { st.mode = 'free'; input.s.left = input.s.right = false; return; }
    const sp = Math.hypot(b.vx, b.vy);
    if (st.mode === 'free') {
      if (b.y > 800 && b.vy > 0 && b.x > 120 && b.x < 442) { st.side = b.x < CX ? -1 : 1; st.mode = 'catch'; st.t = 0; }
      else { reflexBot(g, input, 0.7); return; }
    }
    st.t += DT;
    const hold = (on) => { input.s.left = on && st.side < 0; input.s.right = on && st.side > 0; };
    if (st.mode === 'catch') {
      if (b.y < 915) st.side = b.x < CX ? -1 : 1;
      hold(true);
      if (b.y < 760 || st.t > 2.5) { st.mode = 'free'; hold(false); return; }
      if (st.t > 0.35 && sp < 40 && b.y > 900) {
        // cibles : bugs sortis qui seront encore là à l'arrivée, sinon trappes qui clignotent
        const cands = [];
        for (const P of mg.traps) {
          if (P.state === 'up') cands.push({ i: P.i, left: P.bug.life - P.t, w: P.bug.kind === 'gold' ? 3 : 1 });
          else if (P.state === 'warn') cands.push({ i: P.i, left: (P.dur - P.t) + mg._life(P.bug.kind), w: 0.6 });
        }
        let best = null;
        for (const S of SHOTS) {
          if (S.side !== st.side) continue;
          for (const c of cands) {
            const k = S.traps.indexOf(c.i);
            if (k < 0) continue;
            const arrive = S.delay + S.t[k];
            if (arrive > c.left) continue;
            // préfère le premier obstacle de la trajectoire et les bugs qui vont partir
            const score = c.w * (k === 0 ? 2 : 1) / (1 + c.left);
            if (!best || score > best.score) best = { score, delay: S.delay };
          }
        }
        if (best) {
          st.delay = best.delay + (Math.random() * 2 - 1) * noise;
          st.mode = 'release'; st.t = 0;
        } else if (st.t > 1.6) {
          st.delay = 0.3 + Math.random() * 0.16; st.mode = 'release'; st.t = 0;       // rien à viser : frappe
        }
      }
      return;
    }
    if (st.mode === 'release') {
      hold(st.t >= st.delay);
      if (st.t >= st.delay + 0.25) { st.mode = 'free'; hold(false); }
    }
  };
}

// une trappe à la fois : un bug sorti en permanence, le chasseur le vise
log('\n    une trappe à la fois : impacts en 45 s, en visant');
{
  const hits = new Array(9).fill(0);
  for (let i = 0; i < 9; i++) {
    const { g, input, mg } = startBugs(1);
    mg.timeLeft = 1e9; mg.target = 1e9; mg.spawnCd = 1e9;
    const P = popBug(mg, i, 'armor', 1e9);
    const h = P.p.onHit;
    P.p.onHit = (b, imp, nx, ny, p, pierced) => { hits[i]++; P.bug.hp = 99; P.t = 0; h(b, imp, nx, ny, p, pierced); };
    const pilot = makeHunterBot(0.006);
    run(g, 45, () => {
      if (g.minigame !== mg || mg.state === 'ended') return false;
      if (g.bonus.shield === 0) g.bonus.grant('shield');
      pilot(g, input);
      if (mg.launchReady()) input.s.launch = !input.s.launch;
    });
    input.releaseAll();
  }
  log(`    impacts par trappe : ${hits.join(' · ')}`);
  check(hits.every(n => n >= 1), 'en visant, chaque trappe est touchée');
}

// ------------------------------------------------------------------ 3. mécaniques
log('\n[3] Mécaniques');
{
  const { g, mg } = startBugs(1);
  mg.spawnCd = 1e9;                             // pas d'apparition automatique pendant les vérifications
  const b = mg.ball;
  // alerte puis sortie
  const P = mg.traps[3];
  mg._warn(P, 'normal', 0.5);
  check(P.state === 'warn' && !P.p.enabled, 'la trappe clignote d\'abord (bug pas encore solide)');
  b.setPos(281, 700); b.vx = 0; b.vy = 0; b.state = 'captured';
  run(g, 0.55);
  check(P.state === 'up' && P.p.enabled, 'après 0,5 s, le bug sort et devient une cible');
  const life = P.bug.life;
  check(Math.abs(life - 2.8 * 2) < 0.01, `exposition doublée par l'avantage d'entrée (${life.toFixed(2)} s)`);
  // écrasement
  const c0 = mg.count;
  mg._hit(P, b, 500);
  check(mg.count === c0 + 1 && P.state === 'squash' && !P.p.enabled, 'un coup écrase un bug normal (+1)');
  // blindé : deux coups
  run(g, 1);
  const A = popBug(mg, 0, 'armor');
  mg._hit(A, b, 500);
  check(A.state === 'up' && A.bug.hp === 1 && mg.count === c0 + 1, 'premier coup sur un blindé : carapace fissurée, pas encore écrasé');
  run(g, 0.2);
  mg._hit(A, b, 500);
  check(A.state === 'squash' && mg.count === c0 + 2, 'second coup : blindé écrasé');
  // doré : compte pour trois
  run(g, 1);
  const G = popBug(mg, 1, 'gold');
  mg._hit(G, b, 500);
  check(mg.count === c0 + 5 && mg.golds === 1, 'bug doré : +3 bugs');
  // combo (3 écrasements à moins de 2 s d'intervalle)
  check(mg.combo === 3, `combo ×${mg.combo} après trois écrasements rapprochés`);
  run(g, 3.1);
  check(mg.combo === 0, 'combo perdu après 3 s sans écraser');
  // ver : deux petits bugs dans les trappes voisines
  const W = popBug(mg, 4, 'worm');
  mg._hit(W, b, 500);
  const minis = mg.traps.filter(Q => Q.bug && Q.bug.kind === 'mini');
  check(minis.length === 2 && minis.every(Q => Q.state === 'warn'), 'le ver écrasé se divise en deux petits bugs');
  check(minis.every(Q => Math.hypot(Q.x - W.x, Q.y - W.y) < 160), 'les petits bugs sortent des trappes voisines');
  // fuite
  run(g, 1);
  const e0 = mg.escaped;
  const E = popBug(mg, 8, 'normal', 0.3);
  run(g, 0.5);
  check(E.state !== 'up' && mg.escaped === e0 + 1, 'un bug non écrasé replonge (fuite comptée)');
  // paliers : progression conservée par multiples de 5
  check(mg.palier === Math.floor(mg.count / 5), `palier ${mg.palier} pour ${mg.count} bugs`);
  check(mg.keepProgress().count === Math.floor(mg.count / 5) * 5, `progression conservée : ${mg.keepProgress().count} bugs`);
  // le bug ne sort pas sur la bille
  run(g, 1);
  const Q = mg.traps[2];
  b.state = 'free'; b.setPos(Q.x, Q.y); b.vx = 0; b.vy = 0;
  mg._warn(Q, 'normal', 0.2);
  for (let i = 0; i < 30; i++) { b.setPos(Q.x, Q.y); b.vx = 0; b.vy = 0; g.tick(DT); }
  check(Q.state === 'warn', 'un bug attend que la bille quitte sa trappe pour sortir');
  b.setPos(281, 700); b.state = 'captured';
  run(g, 0.4);
  check(Q.state === 'up', 'puis il sort');
}
{
  // victoire : purge, récompenses (combo ×5 = multiplicateur)
  const { g, mg } = startBugs(1);
  mg.spawnCd = 1e9;
  const b = mg.ball;
  b.state = 'captured'; b.setPos(281, 700);
  mg.count = mg.target - 5;
  for (let i = 0; i < 5; i++) { const P = popBug(mg, i); mg._hit(P, b, 500); run(g, 0.05); }
  check(mg.comboMax === 1, 'combo ×5 atteint');
  check(!!mg.purge, 'objectif atteint : purge');
  let res = null;
  const fin = g.finishMinigame.bind(g);
  g.finishMinigame = (r) => { res = r; fin(r); };
  run(g, 3);
  check(res && res.success && res.reason === 'purge', 'la purge termine le minijeu en victoire');
  check(res && res.rewards.some(r => r.type === 'phase') && res.rewards.some(r => r.type === 'mult'), 'récompense : noyau phasique + multiplicateur (combo ×5)');
}
{
  // victoire sans combo ×5 : pas de multiplicateur
  const { g, mg } = startBugs(1);
  const r = mg.results(true);
  check(r.rewards.length === 1 && r.rewards[0].type === 'phase', 'sans combo ×5 : noyau phasique seul');
  // chrono écoulé : échec, palier conservé, progression rendue à la tentative suivante
  mg.spawnCd = 1e9;
  mg.count = 11;
  let res = null;
  const fin = g.finishMinigame.bind(g);
  g.finishMinigame = (x) => { res = x; fin(x); };
  mg.timeLeft = 0.05;
  run(g, 1.5);
  check(res && !res.success && res.reason === 'timeout' && res.kept.count === 10, `chrono écoulé : échec, 10 bugs conservés (${res && res.kept && res.kept.count})`);
  run(g, 6, () => g.scene === 'table' && !g.transition ? false : undefined);
  run(g, 5, () => g.table.world.balls.some(x => x.state === 'free') ? false : undefined);
  const mg2 = restart(g);
  check(mg2 && mg2.count === 10 && mg2.palier === 2, `tentative suivante : reprise à ${mg2 && mg2.count} bugs`);
}
{
  // chute sans bouclier : fin du minijeu
  const { g, mg } = startBugs(1);
  let res = null;
  const fin = g.finishMinigame.bind(g);
  g.finishMinigame = (x) => { res = x; fin(x); };
  g.bonus.shield = 0;
  mg.setBarrier(0); mg.barrierT = 0; if (mg.barrier) mg.barrier.enabled = false;
  const b = mg.ball; b.state = 'free'; b.setPos(281, 1060); b.vx = 0; b.vy = 600;
  run(g, 2);
  check(res && !res.success && res.drained, 'bille tombée : fin du minijeu (échec)');
}

// ------------------------------------------------------------------ 4. parties automatiques
log(`\n[4] Parties automatiques : ${RUNS} parties par niveau, pilote et mode`);
const PILOTS = [
  { name: 'réflexe simple', make: () => (g, input) => reflexBot(g, input, 0.7) },
  { name: 'chasseur qui vise', make: () => makeHunterBot(0.006) },
];
const MODES = [
  { name: 'règles réelles', shields: false },
  { name: 'boucliers illimités', shields: true },
];

function playSession(g, input, mg, pilot, mode) {
  const out = { win: false, reason: 'none', t: 0, count: 0, squashed: 0, escaped: 0, comboMax: 0, golds: 0, worms: 0, nan: false, error: null, maxAway: 0, ms: 0, ticks: 0, ledger: 0 };
  let res = null;
  const fin = mg.finish.bind(mg);
  mg.finish = (s, reason, drained) => { res = res || { s, reason, t: mg.time }; fin(s, reason, drained); };
  let launchHold = 0, away = 0;
  try {
    for (let i = 0; i < 120 / DT; i++) {
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
  Object.assign(out, { count: mg.count, squashed: mg.squashed, escaped: mg.escaped, comboMax: mg.comboMax, golds: mg.golds, worms: mg.worms, ledger: g.ledgerErrors });
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
        const { g, input, mg } = startBugs(level);
        rs.push(playSession(g, input, mg, P.make(), M));
      }
      const wins = rs.filter(r => r.win).length;
      const reasons = {};
      for (const r of rs) reasons[r.reason] = (reasons[r.reason] || 0) + 1;
      const key = `niv. ${level}, ${P.name}, ${M.name}`;
      summary[key] = { wins, rs };
      log(`  — ${key} : victoires ${wins}/${RUNS} (${pct(wins, RUNS)}) · issues ${JSON.stringify(reasons)}`);
      log(`    bugs ${avg(rs, r => r.count).toFixed(1)}/${bugsTuning(level).target} · écrasés ${avg(rs, r => r.squashed).toFixed(1)} · fuites ${avg(rs, r => r.escaped).toFixed(1)} · combo ×5 ${pct(rs.filter(r => r.comboMax).length, RUNS)} · dorés ${avg(rs, r => r.golds).toFixed(2)} · vers ${avg(rs, r => r.worms).toFixed(2)} · durée ${avg(rs, r => r.t).toFixed(1)} s · ${(avg(rs, r => r.ms / Math.max(1, r.ticks)) * 1000).toFixed(0)} µs/pas`);
      check(rs.every(r => !r.error), 'aucune exception' + (rs.find(r => r.error) ? ' : ' + rs.find(r => r.error).error.stack : ''));
      check(rs.every(r => !r.nan), 'aucune valeur NaN');
      check(rs.every(r => r.reason !== 'none'), 'chaque partie se termine (victoire, chute ou chrono)');
      check(rs.every(r => r.maxAway < 15), `la bille revient toujours vers les batteurs (max ${Math.max(...rs.map(r => r.maxAway)).toFixed(1)} s hors zone)`);
      check(rs.every(r => r.ledger === 0), 'comptabilité des billes sans erreur');
    }
  }
}

const W = (lvl, p, m) => summary[`niv. ${lvl}, ${p}, ${m}`].wins / RUNS;
const midOf = (lvl) => (W(lvl, 'réflexe simple', 'boucliers illimités') + W(lvl, 'chasseur qui vise', 'boucliers illimités')) / 2;
const mid = midOf(1), mid2 = midOf(2), mid3 = midOf(3);
log(`\n  joueur « moyen » (moyenne des deux pilotes, boucliers illimités) : niv. 1 ${Math.round(100 * mid)} % · niv. 2 ${Math.round(100 * mid2)} % · niv. 3 ${Math.round(100 * mid3)} %`);
if (RUNS >= 20) {
  check(mid >= 0.5 && mid <= 0.9, `niveau 1 : faisable sans être trivial (${Math.round(100 * mid)} %)`);
  check(mid3 <= mid2 + 0.05 && mid2 <= mid + 0.05, 'la difficulté monte avec le niveau');
} else log(`  (taux indicatifs sur ${RUNS} parties)`);

log(`\nSons demandés : ${[...sfxLog.keys()].filter(k => k.startsWith('bug')).sort().join(', ')}`);
log(`\nRésultat : ${passes} vérifications réussies, ${failures} échec(s).`);
process.exit(failures ? 1 : 0);
