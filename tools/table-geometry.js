// Vérifications de géométrie du nouveau plateau (headless).
// Usage : node tools/table-geometry.js [lancer|berceau|pont|robuste|tout]
import { Game } from '../src/game/game.js';
import { Table } from '../src/game/table.js';
import { T } from '../src/game/tableLayout.js';
import { Ball } from '../src/physics/ball.js';

const DT = 1 / 120;
const noop = () => {};
const fx = { spark: noop, burst: noop, ring: noop, text: noop, flash: noop, shake: noop, drain: noop, arc: noop, sweep: noop, update: noop, clear: noop };
const music = { setMode: noop, setIntensity: noop, setTension: noop, setFlag: noop, bump: noop, setLevel: noop, currentChord: () => [220, 262, 330] };

export function makeGame() {
  const events = [];
  const audio = { music, sfx: (n) => events.push(n), impact: noop, speak: noop, setPaused: noop, chargeLevel: noop, stopCharge: noop };
  const ui = { banner: (t) => events.push('banner:' + t), lumen: noop, tally: noop, flashBalls: noop, onGameStart: noop, showPause: noop, showTitle: noop, showGameOver: noop };
  const input = { s: { left: false, right: false, launch: false }, p: {}, poll() { const s = this.s, p = this.p; const o = { ...s, leftPressed: s.left && !p.left, rightPressed: s.right && !p.right, leftReleased: !s.left && p.left, rightReleased: !s.right && p.right, launchPressed: s.launch && !p.launch }; this.p = { ...s }; return o; }, swallow() { this.p = { ...this.s }; }, releaseAll() {} };
  const g = new Game({ renderer: { fx, render: noop }, audio, input, ui, settings: {} });
  g.scores = { best: 0, rank: () => -1, add: noop, list: [] };
  g.table = new Table(g);
  g.newGame();
  g.table.plungerLock = false;
  g.startMinigame = () => events.push('MINIJEU');
  return { g, input, events, t: g.table };
}

const arg = process.argv[2] || 'tout';

// 1. Lancer : puissance → première destination
if (arg === 'lancer' || arg === 'tout') {
  console.log('\n[lancer] puissance → résultat (3 s)');
  for (let p = 0.12; p <= 1.001; p += 0.08) {
    const { g, t, events } = makeGame();
    const b = t.shooterBall;
    t.launch(p);
    let deck = false, maxUp = 9999, drop = null;
    for (let i = 0; i < 360; i++) {
      g.tick(DT);
      if (b.layer === 2) deck = true;
      maxUp = Math.min(maxUp, b.y);
      if (deck && b.layer === 0 && !drop) drop = `retombe (${b.x.toFixed(0)}, ${b.y.toFixed(0)})`;
    }
    const where = t.shooterBall === b ? 'retour au lanceur' : deck ? 'PONT' : `plateau (${b.x.toFixed(0)}, ${b.y.toFixed(0)})`;
    console.log(`  ${p.toFixed(2)} → ${where}, sommet y=${maxUp.toFixed(0)}${drop ? ', ' + drop : ''}  [${[...new Set(events.filter(e => !/flipper|plunger/.test(e)))].join(' ')}]`);
  }
}

// 2. Berceau : la bille tenue sur un batteur, frappe après un délai variable
function cradle(side, delay) {
  const { g, input, t, events } = makeGame();
  const b = t.shooterBall; t.shooterBall = null;
  b.state = 'free'; b.setPos(side === 'L' ? 80 : 482, 740); b.vy = 150;
  g.bonus.saveT = 99;
  const key = side === 'L' ? 'left' : 'right';
  input.s[key] = true;
  for (let i = 0; i < 240; i++) g.tick(DT);
  input.s[key] = false;
  let ev = null, time = 0;
  const hook = (name, fn) => { const o = t[name].bind(t); t[name] = (...a) => { const r = fn(...a); if (!ev && r) ev = r; return o(...a); }; };
  hook('onDeckRamp', () => 'PONT (rampe G)');
  hook('onRampExit', (s, d) => d < 0 && 'RAMPE D');
  hook('onOrbitTop', (s) => t.orbitIn && t.orbitIn.side === s && !t.orbitIn.made && `BOUCLE ${s}`);
  hook('onShutter', (b2, imp) => imp >= 250 && 'PORTAIL');
  hook('onTarget', () => 'CIBLE G');
  hook('onDrop', () => 'TOMBANTE D');
  hook('onLane', (i) => `COULOIR ${'CPU'[i]}`);
  hook('onBumper', () => 'BUMPER');
  while (time < 3 && !ev) {
    input.s[key] = time >= delay && time < delay + 0.4;
    g.tick(DT); time += DT;
    if (b.y > T.drainY) { ev = 'perdue'; break; }
  }
  return ev || '—';
}
if (arg === 'berceau' || arg === 'tout') {
  console.log('\n[berceau] premier événement selon le moment de frappe');
  for (const side of ['L', 'R']) {
    const counts = {};
    const seq = [];
    for (let d = 0.16; d <= 0.64; d += 0.015) { const e = cradle(side, d); counts[e] = (counts[e] || 0) + 1; seq.push(e); }
    console.log(`  batteur ${side} :`, JSON.stringify(counts));
    if (process.argv.includes('-v')) console.log('   ', seq.join(' | '));
  }
}

// 3. Pont : bille posée sur un guide du pont, tir des petits batteurs
function deckShot(side, delay) {
  const { g, input, t } = makeGame();
  const b = t.shooterBall; t.shooterBall = null;
  const [x0, y0] = side === 'L' ? [110, 50] : [470, 50];
  b.state = 'free'; b.layer = 2; b.setPos(x0, y0); b.vx = side === 'L' ? 120 : -120; b.vy = 0;
  g.bonus.saveT = 99;
  const key = side === 'L' ? 'left' : 'right';
  let ev = null, time = 0;
  const hook = (name, fn) => { const o = t[name].bind(t); t[name] = (...a) => { const r = fn(...a); if (!ev && r) ev = r; return o(...a); }; };
  hook('onDeckTarget', (i) => `CELLULE ${i + 1}`);
  hook('onUplink', () => 'UPLINK');
  hook('onDeckDrain', () => 'chute du pont');
  input.s[key] = true;
  for (let i = 0; i < 300; i++) g.tick(DT);
  input.s[key] = false;
  while (time < 3 && !ev) {
    input.s[key] = time >= delay && time < delay + 0.4;
    g.tick(DT); time += DT;
  }
  return ev || `— (${b.x.toFixed(0)}, ${b.y.toFixed(0)}, couche ${b.layer})`;
}
if (arg === 'pont' || arg === 'tout') {
  console.log('\n[pont] tir depuis le berceau des petits batteurs');
  for (const side of ['L', 'R']) {
    const counts = {};
    for (let d = 0.1; d <= 0.6; d += 0.02) { const e = deckShot(side, d); const k = e.startsWith('—') ? '—' : e; counts[k] = (counts[k] || 0) + 1; }
    console.log(`  petit batteur ${side} :`, JSON.stringify(counts));
  }
  // la bille posée sur le pont finit-elle toujours par redescendre ?
  let ok = 0, n = 0;
  for (let k = 0; k < 60; k++) {
    const { g, t } = makeGame();
    const b = t.shooterBall; t.shooterBall = null;
    b.state = 'free'; b.layer = 2; b.setPos(60 + Math.random() * 480, -60 + Math.random() * 100);
    if (Math.hypot(b.x - 300, b.y - 150) > 262) continue;
    b.vx = (Math.random() - 0.5) * 1200; b.vy = (Math.random() - 0.5) * 1200;
    n++;
    for (let i = 0; i < 120 * 12; i++) { g.tick(DT); if (b.layer === 0) { ok++; break; } }
  }
  console.log(`  billes lâchées sur le pont sans jouer : ${ok}/${n} redescendues en 12 s`);
}

// 4. Robustesse : billes aléatoires sur chaque couche
if (arg === 'robuste' || arg === 'tout') {
  console.log('\n[robuste] 400 billes aléatoires (8 s)');
  const { g, t } = makeGame();
  const w = t.world;
  for (const b of [...w.balls]) w.removeBall(b);
  t.shooterBall = null;
  let lost = 0, drained = 0;
  t.onDrain = () => { drained++; };
  t.queueLaunch = () => { lost++; };
  const starts = [[281, 200, 60, 0], [281, 600, 120, 0], [200, 760, 40, 0], [360, 760, 40, 0], [281, 20, 120, 2], [150, 30, 40, 2], [420, 30, 40, 2], [41, 300, 10, 0], [521, 300, 10, 0]];
  const stuck = [];
  for (let k = 0; k < 400; k++) {
    const s = starts[k % starts.length];
    const b = new Ball(s[0] + (Math.random() * 2 - 1) * s[2], s[1] + (Math.random() * 2 - 1) * 15);
    b.layer = s[3];
    const a = Math.random() * Math.PI * 2, sp = Math.random() * 3000;
    b.vx = Math.cos(a) * sp; b.vy = Math.sin(a) * sp;
    w.addBall(b);
    for (let i = 0; i < 960; i++) {
      t.R.flipL.pressed = t.R.deck.flipL.pressed = Math.random() < 0.3;
      t.R.flipR.pressed = t.R.deck.flipR.pressed = Math.random() < 0.3;
      b.px = b.x; b.py = b.y;
      w.step(DT);
      t._updateAnims(DT); t._updateUplink(DT);
      const before = lost;
      t._checkBalls(DT);
      if (lost > before) stuck.push(`(${b.x.toFixed(0)}, ${b.y.toFixed(0)}) couche ${b.layer} départ ${s.join('/')}`);
      if (!w.balls.includes(b)) break;
    }
    if (w.balls.includes(b)) w.removeBall(b);
  }
  console.log(`  évacuées : ${drained}, bloquées/perdues (récupérées) : ${lost}`);
  for (const s of stuck.slice(0, 12)) console.log('   ', s);
}
