// Tests headless du minijeu BRAQUAGE DU COFFRE (arène à batteurs, anneaux blindés tournants).
// [1] géométrie (espacements, noyau, distances aux murs), [2] recensement des blocages
// (billes lâchées partout, batteurs au repos : immobilisation, enfermement, pincement,
// traversée), [3] recensement d'atteignabilité (lancers aléatoires depuis les batteurs),
// [4] mécanique (plaques, perçage, butin, alignement, jackpot, forçage, avantage),
// [5] issues (chute, progression conservée, réussite, bouclier), [6] parties automatiques.
// Usage : node tools/test-vault.js [parties par niveau et par mode] [billes du recensement]

// Node n'a pas de Path2D : simulacre neutre (certains modules de dessin en créent au chargement).
// Les modules du jeu sont donc importés dynamiquement, après sa mise en place.
if (typeof globalThis.Path2D === 'undefined') {
  globalThis.Path2D = class Path2D {
    constructor() { return new Proxy(this, { get: (o, k) => (k in o ? o[k] : () => {}) }); }
  };
}
const { Game } = await import('../src/game/game.js');
const { VC, CORE_R, PLATE_R, RING_GEO, VAULTS } = await import('../src/minigames/vaultArt.js');
const { coreField } = await import('../src/minigames/vault.js');

const DT = 1 / 120;
const RUNS = Math.max(1, parseInt(process.argv[2] || '30', 10));
const CENSUS = Math.max(20, parseInt(process.argv[3] || '600', 10));
const BALL_R = 13;
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
const said = new Map();
const banners = [];
const ui = {
  banner: (t) => banners.push(t), lumen: (m) => { if (m) said.set(m.text, (said.get(m.text) || 0) + 1); }, tally: noop, flashBalls: noop,
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

function startVault(level = 1) {
  const { g, input } = makeGame();
  g.newGame();
  g.level = level; g.applyDifficulty();
  g.table.launch(0.5); run(g, 0.5);
  g.debug('start', 'vault');
  run(g, 3, () => g.scene === 'minigame' ? false : undefined);
  return { g, input, mg: g.minigame };
}

function restart(g) {
  g.debug('qualify', 'vault');
  g.debug('start', 'vault');
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

function segDist(px, py, p) {
  let t = ((px - p.ax) * p.dx + (py - p.ay) * p.dy) / p.len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (p.ax + p.dx * t), py - (p.ay + p.dy * t));
}
const NEUTRAL = { left: false, right: false, launch: false, leftPressed: false, rightPressed: false, launchPressed: false, leftReleased: false, rightReleased: false, launchReleased: false };
const pct = (n, d) => `${Math.round(100 * n / Math.max(1, d))} %`;
const avg = (a, f) => a.reduce((s, x) => s + f(x), 0) / Math.max(1, a.length);

// coffre v armé tout de suite (bille hors de portée), plaques arrachées au hasard (fraction f)
function setupVault(mg, v, f = 0) {
  const b = mg.ball;
  if (b) { b.setPos(40, 1000); b.vx = b.vy = 0; }
  mg._buildVault(v, true);
  mg._arm();
  for (const ring of mg.rings) for (const pl of ring.plates) if (pl.alive && Math.random() < f) { pl.alive = false; mg._release(pl); }
  mg._placeRings(0);
}

// ------------------------------------------------------------------ 1. géométrie
log('\n[1] Géométrie : espacements des anneaux, noyau, distances aux murs');
{
  const { g, mg } = startVault(1);
  check(g.scene === 'minigame' && mg && mg.sector === 'vault', 'minijeu COFFRE démarré');
  check(mg.world.flippers.length === 2, 'arène à batteurs');
  // anneau intérieur : la bille ne peut pas se loger entre le noyau et l'anneau
  // (échantillonnage : aucune position de la bille ne tient entre le noyau et l'anneau complet)
  const G0 = RING_GEO[0];
  const corners = [];
  for (let i = 0; i < G0.n; i++) { const a = i * 2 * Math.PI / G0.n; corners.push([VC.x + Math.cos(a) * G0.R, VC.y + Math.sin(a) * G0.R]); }
  const segs = corners.map((c, i) => { const d = corners[(i + 1) % G0.n]; return { ax: c[0], ay: c[1], dx: d[0] - c[0], dy: d[1] - c[1], len2: (d[0] - c[0]) ** 2 + (d[1] - c[1]) ** 2 }; });
  let fits = 0, bestRoom = -Infinity;
  for (let r = CORE_R; r < G0.R; r += 0.5) for (let k = 0; k < 720; k++) {
    const a = k * Math.PI / 360, x = VC.x + Math.cos(a) * r, y = VC.y + Math.sin(a) * r;
    const room = Math.min(Math.hypot(x - VC.x, y - VC.y) - CORE_R, ...segs.map(s => segDist(x, y, s) - PLATE_R)) - BALL_R;
    bestRoom = Math.max(bestRoom, room);
    if (room > 0) fits++;
  }
  check(fits === 0, `noyau ↔ anneau intérieur : la bille n'y tient nulle part (marge ${(-bestRoom).toFixed(1)}) : toute bille qui franchit l'anneau intérieur atteint le champ du noyau`);
  // champ du noyau (perçage) : jamais atteint par une bille posée contre l'anneau intact,
  // atteint dans une brèche d'une seule plaque
  const field = coreField({ R: G0.R, n: G0.n });
  let viaPlate = false, viaGap = false;
  for (let r = CORE_R + BALL_R; r < G0.R + 40; r += 0.5) for (let k = 0; k < 720; k++) {
    const a = k * Math.PI / 360, x = VC.x + Math.cos(a) * r, y = VC.y + Math.sin(a) * r;
    if (r >= field) continue;
    const inside = segs.every(s => (s.dx * (y - s.ay) - s.dy * (x - s.ax)) > 0);
    if (!inside && segs.every(s => segDist(x, y, s) >= PLATE_R + BALL_R)) viaPlate = true;
    if (segs.slice(1).every(s => segDist(x, y, s) >= PLATE_R + BALL_R) && r >= CORE_R + BALL_R) viaGap = true;
  }
  check(!viaPlate && viaGap, `champ du noyau (rayon ${field.toFixed(1)}) : inaccessible contre une plaque intacte, atteint par une brèche d'une plaque`);
  // entre deux anneaux : canal plus large que la bille (jamais deux anneaux touchés à la fois)
  let minCh = Infinity;
  for (let k = 1; k < RING_GEO.length; k++) {
    const A = RING_GEO[k], B = RING_GEO[k - 1];
    minCh = Math.min(minCh, A.R * Math.cos(Math.PI / A.n) - PLATE_R - (B.R + PLATE_R));
  }
  check(minCh > 2 * BALL_R + 4, `canal entre anneaux ≥ ${minCh.toFixed(1)} (> Ø bille + 4 : aucun pincement possible)`);
  // brèche d'une seule plaque : la bille passe
  let minOpen = Infinity;
  for (const G of RING_GEO) minOpen = Math.min(minOpen, 2 * G.R * Math.sin(Math.PI / G.n) - 2 * PLATE_R);
  check(minOpen > 2 * BALL_R + 6, `brèche d'une plaque : ${minOpen.toFixed(1)} libres (> Ø bille + 6)`);
  // le plus grand coffre reste loin des rails (pas de couloir trop étroit entre coffre et murs)
  const Rmax = Math.max(...RING_GEO.map(G => G.R)) + PLATE_R;
  let wallGap = Infinity;
  for (const p of mg.world.statics) {
    if (p.kind !== 'seg') continue;
    wallGap = Math.min(wallGap, segDist(VC.x, VC.y, p) - p.r - Rmax);
  }
  check(wallGap > 2 * BALL_R * 2.5, `couloir libre entre le coffre et les rails : ${wallGap.toFixed(0)} (> 2,5 Ø bille)`);
  const top = VC.y - Rmax, bottom = VC.y + Rmax;
  check(top > 200 && bottom < 600, `coffre au centre de l'arène (y ${top.toFixed(0)} → ${bottom.toFixed(0)}), loin du sommet du dôme`);
  check(VAULTS.every(V => V.rings.every(r => r.open.length >= 1)), 'chaque anneau a au moins une brèche au départ');
  const maxSurf = Math.max(...VAULTS.flatMap(V => V.rings.map(r => Math.abs(r.w) * RING_GEO[r.k].R))) * 1.6;
  check(maxSurf < 260, `vitesse de surface max des anneaux (niveau élevé) : ${maxSurf.toFixed(0)} u/s (anti-traversée)`);
}

// ------------------------------------------------------------------ 2. recensement des blocages
log(`\n[2] Recensement des blocages : ${CENSUS} billes lâchées partout, batteurs au repos`);
function censusBlock(n) {
  const { mg } = startVault(1);
  mg.noUnstick = true;
  mg.timeLeft = 1e9;
  const ball = mg.ball;
  // le noyau touché ouvre le coffre (comme en jeu) : la bille est libérée
  let coreTouch = 0;
  const pierce = mg._pierce.bind(mg);
  mg._pierce = (b) => {
    if (mg.phase !== 'armed') return;
    coreTouch++; pierce(b);
    mg.cracked = 0; mg.won = false; mg.timers.length = 0; mg.loot.length = 0; mg.state = 'play';
  };
  const st = { encl: [], maxImm: 0, immWhere: null, maxEncl: 0, pinch: 0, deep: 0, tunnel: 0, forced: 0, trials: 0, inside: 0, nan: 0, maxImmLow: 0, ms: 0, steps: 0 };
  const statics = mg.world.statics;
  for (let i = 0; i < n; i++) {
    const v = i % 3;
    setupVault(mg, v, [0, 0.25, 0.5][Math.floor(i / 3) % 3]);
    // position de départ libre (y compris dans les canaux entre anneaux)
    let x, y, ok = false;
    for (let tries = 0; tries < 200 && !ok; tries++) {
      if (i % 3 === 2) { // un tiers des billes lâchées dans le coffre (canaux entre anneaux)
        const a = Math.random() * Math.PI * 2, d = CORE_R + Math.random() * (mg.outerR() - CORE_R);
        x = VC.x + Math.cos(a) * d; y = VC.y + Math.sin(a) * d;
      } else { x = 40 + Math.random() * 480; y = 50 + Math.random() * 650; }
      if (Math.hypot(x - 300, y - 300) > 262 && y < 300) continue;
      ok = true;
      for (const p of statics) {
        const d = p.kind === 'seg' ? segDist(x, y, p) - p.r : p.kind === 'circle' ? Math.hypot(x - p.x, y - p.y) - p.r : 99;
        if (d < BALL_R + 2) { ok = false; break; }
      }
      if (!ok) continue;
      for (const p of mg.world.dynamics) {
        if (!p.enabled) continue;
        const d = p.kind === 'seg' ? segDist(x, y, p) - p.r : p.kind === 'circle' ? Math.hypot(x - p.x, y - p.y) - p.r : 99;
        if (d < BALL_R + 2) { ok = false; break; }
      }
    }
    if (!ok) continue;
    st.trials++;
    const a = Math.random() * Math.PI * 2, s = Math.random() * 1400;
    ball.setPos(x, y); ball.vx = Math.cos(a) * s; ball.vy = Math.sin(a) * s;
    if (Math.hypot(x - VC.x, y - VC.y) < mg.outerR()) st.inside++;
    const f0 = mg.forced;
    let ax = x, ay = y, at = 0, encl = 0, t = 0, maxE = 0;
    const zone = [];
    for (let k = 0; k < 7 / DT; k++) {
      ball.px = ball.x; ball.py = ball.y;
      const t0 = performance.now();
      mg.step(DT, NEUTRAL);
      st.ms += performance.now() - t0; st.steps++;
      t += DT;
      if (!Number.isFinite(ball.x) || !Number.isFinite(ball.y)) { st.nan++; break; }
      if (ball.y > 900 || ball.x > 545 || mg.phase !== 'armed') break;
      // immobilisation (fenêtre de 5 unités)
      if (Math.abs(ball.x - ax) > 5 || Math.abs(ball.y - ay) > 5) { ax = ball.x; ay = ball.y; at = t; }
      const imm = t - at;
      if (imm > st.maxImm) { st.maxImm = imm; st.immWhere = [Math.round(ball.x), Math.round(ball.y)]; }
      // enfermement dans le coffre
      const d = Math.hypot(ball.x - VC.x, ball.y - VC.y);
      if (d < mg.outerR() - PLATE_R - 2) { encl += DT; maxE = Math.max(maxE, encl); st.maxEncl = Math.max(st.maxEncl, encl); } else encl = 0;
      // contacts simultanés avec deux anneaux (pincement) ou pénétration profonde
      let touch = 0, mask = 0;
      for (const ring of mg.rings) for (const pl of ring.plates) {
        if (!pl.p || !pl.p.enabled) continue;
        const dd = segDist(ball.x, ball.y, pl.p);
        if (dd < BALL_R + PLATE_R + 0.75) { mask |= 1 << ring.k; }
        if (dd < BALL_R + PLATE_R - 3) st.deep++;
      }
      for (let r = mask; r; r &= r - 1) touch++;
      if (touch >= 2) st.pinch++;
      // traversée d'un anneau à travers une plaque intacte : le centre de la bille franchit
      // la corde d'une plaque solide, loin de ses extrémités
      const ba = Math.atan2(ball.y - VC.y, ball.x - VC.x);
      mg.rings.forEach((ring, j) => {
        const pl = ring.plates[mg._plateAt(ring, ba)];
        const a0 = ring.ang + pl.i * ring.step, a1 = a0 + ring.step;
        const ax = VC.x + Math.cos(a0) * ring.R, ay = VC.y + Math.sin(a0) * ring.R;
        const bx = VC.x + Math.cos(a1) * ring.R, by = VC.y + Math.sin(a1) * ring.R;
        const side = (bx - ax) * (ball.y - ay) - (by - ay) * (ball.x - ax) > 0;   // vrai = côté noyau
        const tt = ((ball.x - ax) * (bx - ax) + (ball.y - ay) * (by - ay)) / ((bx - ax) ** 2 + (by - ay) ** 2);
        if (zone[j] !== undefined && zone[j].i === pl.i && zone[j].side !== side && pl.p && pl.p.enabled && tt > 0.12 && tt < 0.88) st.tunnel++;
        zone[j] = { i: pl.i, side };
      });
    }
    st.forced += mg.forced - f0;
    st.encl.push(maxE);
    if (st.maxImm > 2) break;
  }
  st.coreTouch = coreTouch;
  return st;
}
{
  const st = censusBlock(CENSUS);
  log(`  essais ${st.trials} (dont ${st.inside} lâchées dans le coffre) · forçages ${st.forced} · noyau touché ${st.coreTouch} fois`);
  const e = st.encl;
  log(`  séjours dans le coffre : > 0,5 s ${e.filter(x => x > 0.5).length} · > 1 s ${e.filter(x => x > 1).length} · > 1,5 s ${e.filter(x => x > 1.5).length}`);
  log(`  immobilisation max ${st.maxImm.toFixed(2)} s ${st.immWhere ? 'en ' + st.immWhere.join(',') : ''} · enfermement max ${st.maxEncl.toFixed(2)} s · ${(st.ms / Math.max(1, st.steps) * 1000).toFixed(0)} µs/pas`);
  check(st.trials >= CENSUS * 0.9, 'positions de départ trouvées');
  check(st.nan === 0, 'aucune valeur NaN');
  check(st.maxImm < 2, `aucune immobilisation > 2 s (max ${st.maxImm.toFixed(2)} s)`);
  check(st.maxEncl < 2, `aucune bille enfermée dans le coffre plus de 2 s (max ${st.maxEncl.toFixed(2)} s, forçage à 0,7 s)`);
  check(st.pinch === 0, `jamais en contact avec deux anneaux à la fois (${st.pinch})`);
  check(st.deep === 0, `aucune pénétration profonde dans une plaque (${st.deep})`);
  check(st.tunnel === 0, `aucune traversée d'une plaque intacte (${st.tunnel})`);
}

// ------------------------------------------------------------------ 3. recensement d'atteignabilité
// Lancers aléatoires : la bille tombe sur un batteur, le batteur frappe à un instant aléatoire
// (comme un joueur), on suit la trajectoire ~2 s : que touche-t-on ?
log('\n[3] Recensement d\'atteignabilité : lancers aléatoires depuis les batteurs');
function shotCensus(n, cfg) {
  const { mg } = startVault(1);
  mg.noUnstick = true; mg.timeLeft = 1e9;
  const ball = mg.ball;
  const out = { shots: 0, up: 0, vault: 0, core: 0, outerSect: new Array(12).fill(0), firstRing: {}, cells: new Map() };
  let coreHit = false;
  const pierce = mg._pierce.bind(mg);
  mg._pierce = (b) => {
    if (mg.phase !== 'armed') return;
    coreHit = true; pierce(b);
    mg.cracked = 0; mg.won = false; mg.timers.length = 0; mg.loot.length = 0; mg.state = 'play';
  };
  // impacts relevés pendant les sous-pas (le rebond est résolu avant la fin de l'image)
  const contacts = [];
  const ringOf = new Map();
  const onContact = mg.world.onContact;
  mg.world.onContact = (b, p, imp, x, y) => {
    const k = ringOf.get(p);
    if (k !== undefined) contacts.push({ k, a: Math.atan2(y - VC.y, x - VC.x) });
    onContact(b, p, imp, x, y);
  };
  for (let i = 0; i < n; i++) {
    setupVault(mg, cfg.v, 0);
    if (cfg.bare) for (const ring of mg.rings) for (const pl of ring.plates) if (pl.alive) { pl.alive = false; mg._release(pl); }
    mg._placeRings(0);
    ringOf.clear();
    for (const ring of mg.rings) for (const pl of ring.plates) if (pl.p) ringOf.set(pl.p, ring.k);
    contacts.length = 0;
    const left = Math.random() < 0.5;
    const x0 = left ? 140 + Math.random() * 105 : 317 + Math.random() * 105;
    ball.setPos(x0, 830); ball.vx = (Math.random() - 0.5) * 120; ball.vy = Math.random() * 120;
    const trig = 900 + Math.random() * 55, hold = 0.25 + Math.random() * 0.4;
    let pressT = -1, t = 0, up = false, touched = false, first = null;
    const seen = new Set();
    coreHit = false;
    for (let k = 0; k < 3.2 / DT; k++) {
      t += DT;
      const onSide = left ? ball.x < 281 : ball.x >= 281;
      if (pressT < 0 && onSide && ball.y > trig && ball.vy > -100) pressT = t;
      const pr = pressT >= 0 && t - pressT < hold;
      const inp = { ...NEUTRAL, left: pr && left, right: pr && !left };
      ball.px = ball.x; ball.py = ball.y;
      mg.step(DT, inp);
      if (pressT < 0 && t > 1.5) break;              // la bille n'a jamais atteint le batteur
      if (pressT >= 0 && t - pressT > 2.2) break;
      if (ball.y > 1000 || mg.phase !== 'armed') break;
      if (ball.y < 600) up = true;
      if (ball.y < 780) seen.add(Math.floor(ball.x / 40) + ',' + Math.floor(ball.y / 40));
      for (const c of contacts) {
        touched = true;
        if (first === null) {
          first = c.k;
          if (c.k === mg.rings[mg.rings.length - 1].k) out.outerSect[Math.floor((c.a + Math.PI * 2) / (Math.PI / 6)) % 12]++;
        }
      }
      contacts.length = 0;
      if (coreHit) { touched = true; break; }
    }
    if (pressT < 0) continue;
    out.shots++;
    if (up) out.up++;
    if (touched) out.vault++;
    if (coreHit) out.core++;
    if (first !== null) out.firstRing[first] = (out.firstRing[first] || 0) + 1;
    for (const c of seen) out.cells.set(c, (out.cells.get(c) || 0) + 1);
  }
  return out;
}
{
  const N = Math.max(60, Math.round(CENSUS / 2));
  const bare = shotCensus(N, { v: 0, bare: true });
  log(`  noyau à nu : ${bare.shots} lancers · montées ${pct(bare.up, bare.shots)} · noyau touché ${pct(bare.core, bare.shots)} des lancers`);
  check(bare.core / bare.shots > 0.12, `le noyau est atteignable par des tirs directs de batteurs (${pct(bare.core, bare.shots)})`);
  const names = ['E', 'ESE', 'SSE', 'S', 'SSO', 'OSO', 'O', 'ONO', 'NNO', 'N', 'NNE', 'ENE'];
  for (const v of [0, 2]) {
    const s = shotCensus(N, { v });
    const sect = s.outerSect;
    log(`  ${VAULTS[v].name} intact : ${s.shots} lancers · coffre touché ${pct(s.vault, s.shots)} · noyau ${pct(s.core, s.shots)} · anneau touché en premier ${JSON.stringify(s.firstRing)}`);
    log(`    premiers impacts sur l'anneau extérieur par secteur (vu du noyau) : ${sect.map((n, i) => names[i] + ' ' + n).join(' · ')}`);
    check(s.vault / s.shots > 0.35, `${VAULTS[v].name} : le coffre est touché par une bonne part des lancers (${pct(s.vault, s.shots)})`);
    // tout le bas de l'anneau est atteint ; les anneaux tournent : chaque plaque y passe
    check([1, 2, 3, 4].every(i => sect[i] > 0), `${VAULTS[v].name} : l'anneau extérieur est touché sur tout son arc inférieur (120°)`);
    check(VAULTS[v].rings.every(r => Math.abs(r.w) > 0.2), `${VAULTS[v].name} : tous les anneaux tournent (chaque plaque passe face aux batteurs)`);
    if (v === 0) {
      // couverture de la zone du butin (y 440 → 760) par les trajectoires
      let cells = 0, covered = 0;
      for (let cx = 1; cx < 13; cx++) for (let cy = 11; cy < 19; cy++) {
        cells++;
        if ((s.cells.get(cx + ',' + cy) || 0) / s.shots > 0.02) covered++;
      }
      log(`    zone du butin : ${covered}/${cells} cases de 40 × 40 traversées par plus de 2 % des lancers`);
      check(covered / cells > 0.8, 'le butin qui flotte au-dessus des batteurs est à portée de tir');
    }
  }
}

// ------------------------------------------------------------------ 4. mécanique
log('\n[4] Mécanique : plaques, perçage, butin, coffre suivant, alignement, jackpot, forçage, avantage');
{
  const { g, mg } = startVault(1);
  const ball = mg.ball;
  check(mg.perkT > 0 && mg.rings.every(r => r.plates.every(p => !p.alive || p.hp === 1)), 'avantage d\'entrée : blindage du premier coffre pré-fissuré');
  run(g, 1.6);
  check(mg.phase === 'armed', `le premier coffre s'assemble puis s'arme (${mg.phase})`);
  check(mg.rings.length === 2 && mg.core.enabled, 'COFFRE ALPHA : 2 anneaux, noyau actif');
  // dégâts : remise à neuf puis impact faible (fissure) et second impact (plaque arrachée)
  for (const r of mg.rings) for (const p of r.plates) { p.hp = p.hpMax; p.cracks = null; }
  const outer = mg.rings[1];
  const pl = outer.plates.find(p => p.alive);
  const sc0 = g.score;
  mg._hitPlate(pl, ball, 400);
  check(pl.alive && pl.hp === pl.hpMax - 1 && pl.cracks && pl.cracks.length > 0, 'impact faible : plaque fissurée');
  pl.hitCd = 0;
  mg._hitPlate(pl, ball, 400);
  check(!pl.alive && !pl.p && mg.breaks === 1, 'second impact : plaque arrachée (nouvelle brèche)');
  const pl2 = outer.plates.find(p => p.alive);
  mg._hitPlate(pl2, ball, 1600);
  check(!pl2.alive, 'impact lourd : plaque arrachée d\'un coup');
  check(g.score > sc0, 'points marqués');
  const pl3 = outer.plates.find(p => p.alive && p.hp === p.hpMax);
  mg._hitPlate(pl3, ball, 60);
  check(pl3.alive && pl3.hp === pl3.hpMax, 'simple contact : aucun dégât');
  // impact réel : bille lancée sur la plaque du bas de l'anneau extérieur
  for (const r of mg.rings) for (const p of r.plates) { p.hitCd = 0; if (p.alive) continue; p.alive = true; p.hp = p.hpMax; p.p = mg._prim(); p.p.onHit = (b, imp) => mg._hitPlate(p, b, imp); p.p.enabled = true; }
  mg._placeRings(0);
  const hits0 = mg.hits;
  ball.setPos(VC.x, VC.y + 200); ball.vx = 0; ball.vy = -1500;
  run(g, 0.2);
  check(mg.hits > hits0 || mg.phase === 'open', `tir vertical : impact sur l'anneau extérieur détecté [${mg.hits - hits0} ${mg.phase} ${Math.round(ball.y)} ${mg.rings.map(r => r.plates.map(p => p.alive ? (p.p && p.p.enabled ? 'E' : 'd') : '_').join('')).join('|')}]`);
  // alignement : brèches forcées face aux batteurs
  for (const r of mg.rings) for (const p of r.plates) if (p.alive) { const m = (r.ang + (p.i + 0.5) * r.step) % (2 * Math.PI); const d = Math.abs(((m - Math.PI / 2 + 3 * Math.PI) % (2 * Math.PI)) - Math.PI); if (d < 0.6 + r.step / 2) mg._breakPlate(p, 'test', true); }
  mg._updateAlign(0.01);
  check(!!mg.aligned && Math.abs(mg.aligned.a - Math.PI / 2) < 0.4, `alignement détecté face aux batteurs (axe ${mg.aligned ? (mg.aligned.a * 180 / Math.PI).toFixed(0) : '—'}°)`);
  // perçage dans l'axe : JACKPOT, butin, temps bonus
  const t0 = mg.timeLeft, jp = mg.jackpots;
  ball.setPos(VC.x, VC.y + 160); ball.vx = 0; ball.vy = -1800;
  run(g, 0.25, () => mg.phase === 'open' ? false : undefined);
  check(mg.phase === 'open' && mg.cracked === 1, 'tir dans l\'axe : le noyau est touché, COFFRE PERCÉ');
  check(mg.jackpots === jp + 1, 'perçage pendant l\'alignement : JACKPOT');
  check(mg.loot.length >= 10, `butin éjecté (${mg.loot.length} objets)`);
  check(mg.rings.every(r => r.plates.every(p => !p.alive && !p.p)), 'les anneaux sont soufflés (plus aucune plaque solide)');
  check(mg.timeLeft > t0, 'temps bonus accordé');
  // ramassage du butin
  const L = mg.loot[0];
  const picked0 = mg.lootPicked, tot0 = mg.lootTotal;
  ball.setPos(L.x + 3, L.y); ball.px = L.x - 30; ball.py = L.y; ball.vx = 0; ball.vy = 0;
  mg._updateLoot(0.001, ball);
  check(mg.lootPicked > picked0 && mg.lootTotal > tot0, 'butin ramassé au contact de la bille');
  // coffre suivant
  ball.setPos(470, 650); ball.vx = 0; ball.vy = 0;
  run(g, 1.75, () => mg.phase === 'build' ? false : undefined);
  check(mg.phase === 'build' && mg.vIdx === 1 && mg.rings.length === 2, 'COFFRE BÊTA en place');
  run(g, 1.4, () => mg.phase === 'armed' ? false : undefined);
  check(mg.phase === 'armed', 'COFFRE BÊTA armé');
  check(mg.rings.every(r => r.plates.every(p => !p.alive || p.hp === p.hpMax)), 'avantage limité au premier coffre');
  // la bille dans le coffre pendant l'assemblage : armement différé
  mg.phase = 'open'; mg.phaseT = 99;
  ball.setPos(VC.x + 75, VC.y + 10); ball.vx = 0; ball.vy = 0;
  mg.cracked = 2; mg.state = 'play';
  run(g, 0.05);
  check(mg.phase === 'build' && mg.vIdx === 2 && mg.rings.length === 3, 'COFFRE OMÉGA : 3 anneaux');
  let armedInside = false;
  run(g, 1.3, () => { ball.setPos(VC.x + 75, VC.y + 10); ball.vx = 0; ball.vy = 0; if (mg.phase === 'armed') armedInside = true; });
  check(!armedInside, 'coffre non armé tant que la bille est dans son périmètre');
  ball.setPos(470, 650);
  run(g, 0.3);
  check(mg.phase === 'armed', 'armement dès que la bille est sortie');
  // bille enfermée entre deux anneaux : forçage
  for (const r of mg.rings) for (const p of r.plates) if (!p.alive) continue;
  const f0 = mg.forced, b0 = mg.breaks;
  const mid = mg.rings[1];
  // canal entre l'anneau intermédiaire et l'extérieur, en bas
  let trapped = 0;
  run(g, 2.5, () => { if (mg.forced === f0) { ball.setPos(VC.x, VC.y + 122); ball.vx = 0; ball.vy = 0; trapped += DT; } });
  check(mg.forced > f0 && mg.breaks > b0, `bille maintenue dans le coffre : la plaque sous elle est forcée (après ${trapped.toFixed(2)} s)`);
  check(trapped < 1.0, 'forçage en moins d\'une seconde');
  void mid;
}

// ------------------------------------------------------------------ 5. issues
log('\n[5] Chute, progression conservée, réussite, récompenses, bouclier');
{
  const { g, mg } = startVault(1);
  const id = mg.world.balls[0].id;
  const before = g.ballsLeft;
  run(g, 1.5);
  mg._pierce(mg.ball);
  check(mg.cracked === 1, 'coffre 1 percé');
  mg.barrierT = 0; if (mg.barrier) mg.barrier.enabled = false;
  for (const b of mg.world.balls) { b.x = 300; b.y = 1200; b.vy = 100; }
  run(g, 4, () => g.scene === 'table' && !g.transition ? false : undefined);
  check(g.scene === 'table' && g.table.world.balls[0] && g.table.world.balls[0].id === id, 'chute : la même bille revient sur le plateau');
  check(g.ballsLeft === before, 'aucune bille consommée par la chute');
  const kept = g.table.sectors.vault.kept;
  check(kept && kept.vaults === 1, `progression mémorisée (${JSON.stringify(kept)})`);
  const mg2 = restart(g);
  check(mg2 && mg2.cracked === 1 && mg2.vIdx === 1, 'nouvelle tentative : reprise au COFFRE BÊTA');
  run(g, 1.5);
  mg2._pierce(mg2.ball);
  run(g, 3.5, () => mg2.phase === 'armed' ? false : undefined);
  check(mg2.vIdx === 2 && mg2.phase === 'armed', 'COFFRE OMÉGA armé');
  const sc = g.score;
  mg2._pierce(mg2.ball);
  check(mg2.won && mg2.state === 'play', 'dernier coffre percé : braquage réussi, butin à ramasser');
  check(mg2.barrier && mg2.barrier.enabled, 'bille protégée pendant le ramassage final');
  run(g, 10, () => g.scene === 'table' && !g.transition ? false : undefined);
  check(g.scene === 'table' && g.table.sectors.vault.done, 'secteur COFFRE réactivé');
  check(g.bonus.multT > 0, `récompense : multiplicateur (×${g.bonus.multLevel})`);
  check(!g.table.sectors.vault.kept, 'progression effacée après la réussite');
  check(g.score > sc, 'points de fin de braquage');
  check(g.ledgerErrors === 0, 'comptabilité des billes sans erreur');
  // dernier coffre déjà percé puis chute : réussite quand même
  const { g: g3, mg: m3 } = startVault(1);
  run(g3, 1.5);
  m3.cracked = 2; m3._pierce(m3.ball);
  m3.barrierT = 0; if (m3.barrier) m3.barrier.enabled = false;
  for (const b of m3.world.balls) { b.x = 300; b.y = 1200; b.vy = 100; }
  run(g3, 4, () => g3.scene === 'table' && !g3.transition ? false : undefined);
  check(g3.table.sectors.vault.done, 'chute pendant le ramassage final : le braquage reste réussi');
  // bouclier : relance de la même bille
  const { g: g4, mg: m4 } = startVault(1);
  const id4 = m4.world.balls[0].id;
  run(g4, 1);
  g4.bonus.grant('shield');
  m4.barrierT = 0; if (m4.barrier) m4.barrier.enabled = false;
  for (const b of m4.world.balls) { b.x = 300; b.y = 1200; b.vy = 100; }
  run(g4, 0.05);
  check(m4.state === 'relaunch' && m4.pendingBall && m4.pendingBall.id === id4, 'bouclier : relance automatique de la même bille');
  run(g4, 2, () => m4.state === 'play' ? false : undefined);
  check(m4.state === 'play' && m4.world.balls[0].id === id4, 'la bille est relancée dans l\'arène');
  const { g: g5 } = startVault(2);
  const m5 = g5.minigame;
  check(m5.speedK > 1 && m5.rings[m5.rings.length - 1].plates.some(p => p.hpMax === 3), 'niveau 2 : anneaux plus rapides, blindage extérieur renforcé');
  // chrono écoulé : échec
  const { g: g6, mg: m6 } = startVault(1);
  let res = null;
  const fin = m6.finish.bind(m6);
  m6.finish = (s, reason, d) => { res = res || { s, reason }; fin(s, reason, d); };
  m6.timeLeft = 0.05;
  run(g6, 0.2);
  check(res && !res.s && res.reason === 'timeout', 'chrono écoulé : échec');
}

// ------------------------------------------------------------------ 6. parties automatiques
log(`\n[6] Parties automatiques : pilote simple de sim-tests.js, ${RUNS} parties par niveau et par mode`);
// règles réelles (une chute = échec) ; un bouclier (une chute pardonnée : approximation d'un
// joueur moyen, qui garde la bille plus longtemps que ce pilote) ; boucliers illimités (seul le
// chrono compte : le temps imparti suffit-il ?)
const MODES = [
  { name: 'règles réelles', shields: 0 },
  { name: 'un bouclier', shields: 1 },
  { name: 'boucliers illimités', shields: Infinity },
];

function playSession(g, input, mg, mode = MODES[0]) {
  const out = { win: false, reason: 'none', t: 0, cracked: 0, startCracked: mg.cracked, breaks: 0, forced: 0, jackpots: 0, aligns: 0, hits: 0,
    loot: 0, lootPicked: 0, lootSpawned: 0, unstuck: 0, nan: false, error: null, maxAway: 0, maxInside: 0, shieldsUsed: 0, ms: 0, ticks: 0, vaultT: [] };
  let res = null;
  const fin = mg.finish.bind(mg);
  mg.finish = (s, reason, drained) => { res = res || { s, reason, t: mg.time }; fin(s, reason, drained); };
  let launchHold = 0, away = 0, inside = 0, lastCrack = mg.cracked, lastT = 0;
  try {
    for (let i = 0; i < 140 / DT; i++) {
      if (g.minigame !== mg || mg.state === 'ended') break;
      if (out.shieldsUsed < mode.shields && g.bonus.shield === 0) { g.bonus.grant('shield'); out.shieldsUsed++; }
      bot(g, input);
      if (mg.launchReady()) { launchHold += DT; input.s.launch = (launchHold % 1.2) < 0.75; } else { launchHold = 0; input.s.launch = false; }
      const b = mg.world.balls[0];
      if (b && b.state === 'free') {
        if (!Number.isFinite(b.x) || !Number.isFinite(b.y) || !Number.isFinite(b.vx)) out.nan = true;
        if (b.y > 850) away = 0; else { away += DT; out.maxAway = Math.max(out.maxAway, away); }
        if (mg.phase === 'armed' && Math.hypot(b.x - VC.x, b.y - VC.y) < mg.outerR() - PLATE_R - 2) { inside += DT; out.maxInside = Math.max(out.maxInside, inside); } else inside = 0;
      }
      const t0 = performance.now();
      g.tick(DT);
      out.ms += performance.now() - t0; out.ticks++;
      if (mg.cracked !== lastCrack) { out.vaultT.push(mg.time - lastT); lastT = mg.time; lastCrack = mg.cracked; }
    }
  } catch (e) { out.error = e; }
  if (res) { out.win = res.s; out.reason = res.reason; out.t = res.t; }
  out.cracked = mg.cracked; out.breaks = mg.breaks; out.forced = mg.forced; out.jackpots = mg.jackpots; out.aligns = mg.alignCount;
  out.hits = mg.hits; out.loot = mg.lootTotal; out.lootPicked = mg.lootPicked; out.lootSpawned = mg.lootSpawned; out.unstuck = mg.unstuck;
  out.ledger = g.ledgerErrors;
  return out;
}

const summary = {};
for (const level of [1, 2]) {
  for (const mode of MODES) {
    const rs = [];
    for (let i = 0; i < RUNS; i++) { const { g, input, mg } = startVault(level); rs.push(playSession(g, input, mg, mode)); }
    const wins = rs.filter(r => r.win).length;
    const reasons = {};
    for (const r of rs) reasons[r.reason] = (reasons[r.reason] || 0) + 1;
    const key = `niv. ${level} (${mode.name})`;
    summary[key] = { wins, rs };
    const vt = rs.flatMap(r => r.vaultT);
    log(`  — ${key} : victoires ${wins}/${RUNS} (${pct(wins, RUNS)}) · issues ${JSON.stringify(reasons)}`);
    log(`    coffres percés ${avg(rs, r => r.cracked).toFixed(2)} · durée par coffre ${avg(vt, x => x).toFixed(1)} s · plaques arrachées ${avg(rs, r => r.breaks).toFixed(1)} (dont forçages ${avg(rs, r => r.forced).toFixed(2)}) · impacts ${avg(rs, r => r.hits).toFixed(1)}`);
    log(`    alignements ${avg(rs, r => r.aligns).toFixed(1)} · jackpots ${avg(rs, r => r.jackpots).toFixed(2)} · butin ramassé ${avg(rs, r => r.lootPicked).toFixed(1)}/${avg(rs, r => r.lootSpawned).toFixed(1)} (${Math.round(avg(rs, r => r.loot) / 1000)} k)`);
    log(`    durée ${avg(rs, r => r.t).toFixed(1)} s (victoires : ${avg(rs.filter(r => r.win), r => r.t).toFixed(1)} s) · hors batteurs max ${Math.max(...rs.map(r => r.maxAway)).toFixed(1)} s · dans le coffre max ${Math.max(...rs.map(r => r.maxInside)).toFixed(2)} s · déblocages ${rs.reduce((s, r) => s + r.unstuck, 0)} · ${(avg(rs, r => r.ms / Math.max(1, r.ticks)) * 1000).toFixed(0)} µs/pas`);
    check(rs.every(r => !r.error), 'aucune exception' + (rs.find(r => r.error) ? ' : ' + rs.find(r => r.error).error.stack : ''));
    check(rs.every(r => !r.nan), 'aucune valeur NaN');
    check(rs.every(r => r.reason !== 'none'), 'chaque partie se termine (réussite, chute ou chrono)');
    check(rs.every(r => r.maxAway < 15), `la bille revient toujours vers les batteurs (max ${Math.max(...rs.map(r => r.maxAway)).toFixed(1)} s hors zone)`);
    check(rs.every(r => r.maxInside < 2.5), 'jamais enfermée dans le coffre');
    check(rs.reduce((s, r) => s + r.unstuck, 0) <= Math.ceil(RUNS / 10), 'aucun blocage notable (déblocages automatiques rares)');
    check(rs.every(r => r.ledger === 0), 'comptabilité des billes sans erreur');
  }
}

// campagne : tentatives successives (une bille par tentative), progression conservée
log('\n[7] Campagne : tentatives successives avec progression conservée (règles réelles)');
for (const level of [1, 2]) {
  const att = [];
  let errors = 0;
  for (let i = 0; i < RUNS; i++) {
    let { g, input, mg } = startVault(level);
    let n = 0, won = false;
    while (n < 6 && mg) {
      n++;
      const r = playSession(g, input, mg, MODES[0]);
      if (r.error) { errors++; break; }
      if (r.win) { won = true; break; }
      input.releaseAll();
      run(g, 5, () => g.scene === 'table' && !g.transition ? false : undefined);
      // la bille revient par le portail (capturée un instant) : on attend qu'elle soit libre
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
  if (level === 1 && RUNS >= 20) check(within(2) / RUNS >= 0.6, 'niveau 1 : la plupart des campagnes réussies en 2 tentatives');
}

const s1 = summary['niv. 1 (boucliers illimités)'], s0 = summary['niv. 1 (règles réelles)'], sm = summary['niv. 1 (un bouclier)'];
const s2 = summary['niv. 2 (boucliers illimités)'];
const t1 = avg(s1.rs, r => r.t), t2 = avg(s2.rs, r => r.t);
if (RUNS >= 20) {
  check(s1.wins / RUNS >= 0.85, `niveau 1 : le temps imparti suffit au pilote simple (${pct(s1.wins, RUNS)} sans chute possible, ${t1.toFixed(0)} s en moyenne)`);
  check(sm.wins / RUNS >= 0.35 && sm.wins / RUNS <= 0.9, `niveau 1, une chute pardonnée (approximation d'un joueur moyen) : réussite fréquente (${pct(sm.wins, RUNS)})`);
  check(s0.wins / RUNS >= 0.05, `niveau 1, règles réelles : le pilote simple (qui perd la bille en ~25 s) réussit parfois (${pct(s0.wins, RUNS)})`);
  check(t2 > t1 && s2.wins <= s1.wins, `niveau 2 plus difficile que le niveau 1 (${t2.toFixed(0)} s contre ${t1.toFixed(0)} s, ${pct(s2.wins, RUNS)} contre ${pct(s1.wins, RUNS)})`);
} else log(`  (taux de réussite indicatifs sur ${RUNS} parties : ${pct(s0.wins, RUNS)} / ${pct(sm.wins, RUNS)} avec un bouclier / ${pct(s1.wins, RUNS)} sans chute)`);

// ------------------------------------------------------------------ 8. sons (moteur simulé)
log('\n[8] Effets sonores : chaque son du coffre se construit sans erreur, gains raisonnables');
{
  const { SFX_VAULT } = await import('../src/audio/sfx-vault.js');
  const calls = [];
  const A = {
    now: 1, music: { currentChord: () => [220, 261.6, 329.6] },
    claim: () => true, throttle: () => true, out: () => ({}),
    tone: (o) => calls.push(o), noise: (o) => calls.push(o), bell: (o) => calls.push(o),
  };
  const args = { vaultAssemble: [3], vaultCrack: [0.4, 2], vaultBreak: [-0.3, 1], vaultDrill: [0.2], vaultGrind: [0.1],
    vaultPierce: [true], vaultCoin: [true, 7, 0.2] };
  let ok = true, maxGain = 0, n = 0;
  for (const [name, fn] of Object.entries(SFX_VAULT)) {
    calls.length = 0;
    try { fn(A, ...(args[name] || [])); } catch (e) { ok = false; log('   ', name, e.message); }
    if (!calls.length) { ok = false; log('    son vide :', name); }
    for (const c of calls) {
      const gn = c.gain ?? 0.2;
      if (!Number.isFinite(gn) || !Number.isFinite(c.f ?? 1) || (c.dur ?? 0.1) <= 0) ok = false;
      maxGain = Math.max(maxGain, gn);
    }
    n++;
  }
  const used = [...sfxLog.keys()].filter(k => k.startsWith('vault'));
  check(ok, `${n} sons construits sans erreur (gain max ${maxGain.toFixed(2)})`);
  check(maxGain <= 0.6, 'aucun gain excessif');
  check(used.every(k => SFX_VAULT[k]), `tous les sons demandés par le minijeu existent (${used.length})`);
}

log(`\nSons demandés : ${[...sfxLog.keys()].filter(k => k.startsWith('vault')).sort().join(', ')}`);
log(`\nRésultat : ${passes} vérifications réussies, ${failures} échec(s).`);
process.exit(failures ? 1 : 0);
