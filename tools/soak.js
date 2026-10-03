// Test d'endurance : longues parties automatiques. Les secteurs sont régulièrement
// qualifiés de force pour parcourir tous les minijeux, le duel et les montées de niveau.
// Vérifie : aucune exception, aucune bille dupliquée, aucune position invalide.
// Usage : node tools/soak.js [parties] [secondes]
import { Game } from '../src/game/game.js';

const GAMES = Number(process.argv[2] || 6);
const SECONDS = Number(process.argv[3] || 600);
const DT = 1 / 120;
const noop = () => {};
const fx = { spark: noop, burst: noop, ring: noop, text: noop, flash: noop, shake: noop, drain: noop, arc: noop, sweep: noop, update: noop };
const music = { setMode: noop, setIntensity: noop, setTension: noop, setFlag: noop, bump: noop, currentChord: () => [220, 262, 330] };
const audio = { music, sfx: noop, impact: noop, speak: noop, setPaused: noop, chargeLevel: noop, stopCharge: noop };
const ui = { banner: noop, lumen: noop, tally: noop, flashBalls: noop, onGameStart: noop, showPause: noop, showTitle: noop, showGameOver: noop };

const totals = { exceptions: 0, ledger: 0, nan: 0, mg: {}, wins: {}, bossWins: 0, maxLevel: 1, multiballs: 0, ticks: 0 };

for (let gi = 0; gi < GAMES; gi++) {
  const input = { s: { left: false, right: false, launch: false }, p: {}, poll() { const s = this.s, p = this.p; const o = { ...s, leftPressed: s.left && !p.left, rightPressed: s.right && !p.right, launchPressed: s.launch && !p.launch, leftReleased: !s.left && p.left, rightReleased: !s.right && p.right, launchReleased: !s.launch && p.launch }; this.p = { ...s }; return o; }, swallow() { this.p = { ...this.s }; }, releaseAll() { this.s = { left: false, right: false, launch: false }; } };
  const g = new Game({ renderer: { fx, render: noop }, audio, input, ui, settings: {} });
  g.scores = { best: 0, rank: () => -1 };
  g.newGame();
  g.ballsLeft = 5; // parties plus longues
  const origStart = g.startMinigame.bind(g);
  g.startMinigame = (s, ...a) => { totals.mg[s] = (totals.mg[s] || 0) + 1; origStart(s, ...a); };
  const origFinish = g.finishMinigame.bind(g);
  g.finishMinigame = (res) => { if (res.success) totals.wins[g.minigame.sector] = (totals.wins[g.minigame.sector] || 0) + 1; origFinish(res); };
  const origMB = g.table.beginMultiball.bind(g.table);
  g.table.beginMultiball = (...a) => { totals.multiballs++; origMB(...a); };
  let launchHold = 0, qualifyT = 0;
  for (let i = 0; i < SECONDS / DT; i++) {
    if (g.state !== 'play') break;
    const t = g.table;
    // pilote : batteurs + plateforme + lancement
    let l = false, r = false;
    const balls = g.scene === 'minigame' ? g.minigame.world.balls : t.world.balls;
    for (const b of balls) {
      if (b.state !== 'free') continue;
      if (b.y > 860 && b.y < 1000 && b.vy > -200) { if (b.x < 281 && Math.random() < 0.8) l = true; if (b.x >= 281 && Math.random() < 0.8) r = true; }
    }
    if (g.scene === 'minigame' && g.minigame.paddle) {
      const b = balls.find(x => x.state === 'free') || balls[0];
      if (b) { l = b.x < g.minigame.paddle.x - 12; r = b.x > g.minigame.paddle.x + 12; }
    }
    input.s.left = l; input.s.right = r;
    const needLaunch = (g.scene === 'table' && t.shooterBall && !t.plunger.auto) || (g.minigame && ((g.minigame.launchReady && g.minigame.launchReady()) || g.minigame.state === 'relaunch'));
    if (needLaunch) { launchHold += DT; input.s.launch = (launchHold % 1.2) < (0.4 + Math.random() * 0.5); } else { launchHold = 0; input.s.launch = false; }
    // qualification forcée périodique pour parcourir tous les modes
    qualifyT += DT;
    if (qualifyT > 25 && g.scene === 'table') {
      qualifyT = 0;
      const order = ['hangar', 'reactor', 'tag', 'defense', 'vault', 'arena', 'core'];
      const s = order.find(x => !t.sectors[x].done && t.sectorState(x) !== 'ready');
      if (s) g.debug('qualify', s);
      if (Math.random() < 0.15) t.multiballLit = true;
    }
    // minijeux : réussite forcée de temps en temps (sinon le pilote échoue presque toujours)
    if (g.scene === 'minigame' && g.minigame.state === 'play' && g.minigame.time > 20 && Math.random() < 0.002) g.minigame.debugWin();
    try { g.tick(DT); } catch (e) { totals.exceptions++; console.error('Exception :', e.stack); break; }
    totals.ticks++;
    for (const b of g.activeBalls()) if (!Number.isFinite(b.x) || !Number.isFinite(b.y)) { totals.nan++; }
  }
  totals.ledger += g.ledgerErrors;
  totals.bossWins += g.stats.bossWins;
  totals.maxLevel = Math.max(totals.maxLevel, g.level);
  console.log(`Partie ${gi + 1} : score ${g.score}, niveau ${g.level}, état ${g.state}, billes ${g.ballsLeft}, minijeux joués ${g.stats.minigamesPlayed}, gagnés ${g.stats.minigamesWon}`);
}
console.log('\nBilan :', JSON.stringify(totals));
const ok = totals.exceptions === 0 && totals.ledger === 0 && totals.nan === 0;
console.log(ok ? 'ENDURANCE OK' : 'ENDURANCE EN ÉCHEC');
process.exit(ok ? 0 : 1);
