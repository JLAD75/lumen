// Carte des tirs depuis le berceau : la bille est tenue sur un batteur levé,
// on relâche, puis on frappe après un délai variable. On note le premier
// événement de jeu atteint (rampe, boucle, portail, cibles, couloirs…).
// Usage : node tools/shot-map.js
import { Game } from '../src/game/game.js';
import { L } from '../src/game/tableLayout.js';

const noop = () => {};
const fx = { spark: noop, burst: noop, ring: noop, text: noop, flash: noop, shake: noop, drain: noop, update: noop };
const music = { setMode: noop, setIntensity: noop, setTension: noop, setFlag: noop, bump: noop, currentChord: () => [220, 262, 330] };
const audio = { music, sfx: noop, impact: noop, speak: noop, setPaused: noop, chargeLevel: noop, stopCharge: noop };
const ui = { banner: noop, lumen: noop, tally: noop, flashBalls: noop, onGameStart: noop, showPause: noop, showTitle: noop, showGameOver: noop };
const DT = 1 / 120;

function trial(side, delay, mode = 'cradle', param = 0) {
  const input = { s: { left: false, right: false, launch: false }, p: {}, poll() { const s = this.s, p = this.p; const o = { ...s, leftPressed: s.left && !p.left, rightPressed: s.right && !p.right, leftReleased: !s.left && p.left, rightReleased: !s.right && p.right, launchPressed: false }; this.p = { ...s }; return o; }, swallow() {}, releaseAll() {} };
  const g = new Game({ renderer: { fx, render: noop }, audio, input, ui, settings: {} });
  g.scores = { best: 0, rank: () => -1 };
  g.newGame();
  const t = g.table;
  const b = t.shooterBall; t.shooterBall = null;
  b.state = 'free';
  b.setPos(side === 'L' ? 80 : 482, 740); b.vy = 150;
  g.bonus.saveT = 99;
  let ev = null;
  const hook = (name, fn) => { const o = t[name].bind(t); t[name] = (...a) => { const r = fn(...a); if (!ev && r) ev = r; return o(...a); }; };
  hook('onRampExit', (s, d) => d < 0 && `RAMPE ${s}`);
  hook('onOrbitTop', (s) => t.orbitIn && t.orbitIn.side === s && !t.orbitIn.made && `BOUCLE ${s}`);
  hook('onShutter', (b2, imp) => imp >= 250 && 'PORTAIL');
  hook('onTarget', (s) => `CIBLE ${s}`);
  hook('onLane', (i) => `COULOIR ${'CPU'[i]}`);
  hook('onBumper', () => 'BUMPER');
  const key = side === 'L' ? 'left' : 'right';
  if (mode === 'cradle') {
    // berceau
    input.s[key] = true;
    for (let i = 0; i < 240; i++) g.tick(DT);
    input.s[key] = false;
  } else if (mode === 'drop') {
    // bille qui retombe du centre vers le batteur (rebond typique)
    const sx = side === 'L' ? 1 : -1;
    b.setPos(281 - sx * param, 640); b.vx = -sx * 60; b.vy = 380;
  }
  let time = 0;
  while (time < 3 && !ev) {
    input.s[key] = time >= delay && time < delay + 0.4;
    g.tick(DT); time += DT;
    if (b.y > L.drainY) { ev = 'perdue'; break; }
  }
  return ev || '—';
}

const verbose = process.argv.includes('-v');
for (const side of ['L', 'R']) {
  const res = [];
  const counts = {};
  for (let d = 0.16; d <= 0.64; d += 0.015) {
    const e = trial(side, d);
    res.push(`${d.toFixed(3)}:${e}`);
    counts[e] = (counts[e] || 0) + 1;
  }
  if (verbose) console.log(`\nBatteur ${side === 'L' ? 'gauche' : 'droit'} (berceau) :\n  ` + res.join('\n  '));
  console.log(`Berceau, batteur ${side} :`, JSON.stringify(counts));
}
// billes en mouvement : couloir de retour (sans berceau) et rebonds depuis le centre
for (const [mode, params] of [['inlane', [0]], ['drop', [20, 50, 80, 110]]]) {
  const counts = {};
  for (const side of ['L', 'R']) {
    for (const p of params) {
      for (let d = 0.0; d <= 0.9; d += 0.01) {
        const e = trial(side, d, mode, p);
        counts[e] = (counts[e] || 0) + 1;
      }
    }
  }
  console.log(`Billes en mouvement (${mode}) :`, JSON.stringify(counts));
}
