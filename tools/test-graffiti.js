// Tests headless du minijeu FRESQUE NÉON (secteur GRAFFITI, arène à batteurs).
// Géométrie, peinture (pinceau, vitesse, aérosol, éclaboussures, gouttes), drones
// nettoyeurs, capsule AÉROSOL, paliers, victoire et récompenses, chute, progression
// conservée, bouclier ; puis deux recensements automatiques :
//  · atteignabilité : des centaines de tirs de batteurs isolés (sans lanceur, sans drones)
//    — chaque cellule comptée dans le pourcentage doit être peinte par des tirs normaux ;
//  · blocages : des billes lâchées partout, batteurs au repos, drones actifs, sans
//    déblocage automatique — aucune immobilisation de plus de 2 s ;
// enfin des parties automatiques (pilote simple de sim-tests.js) et une campagne.
// Usage : node tools/test-graffiti.js [parties par niveau et par mode]
// Simulacre minimal de Path2D : certains modules de rendu partagés en construisent au
// chargement ; rien n'est dessiné hors navigateur.
if (typeof globalThis.Path2D === 'undefined') {
  globalThis.Path2D = class { constructor() {} moveTo() {} lineTo() {} arc() {} arcTo() {} rect() {} closePath() {} ellipse() {} quadraticCurveTo() {} bezierCurveTo() {} addPath() {} roundRect() {} };
}
const { Game } = await import('../src/game/game.js');
const { GraffitiGame, GRID, BOMBS, BUMP_R, TARGET, WALL_Y1 } = await import('../src/minigames/graffiti.js');
const { renderGraffiti, renderGraffitiTop } = await import('../src/minigames/graffitiArt.js');
const { SFX } = await import('../src/audio/sfx.js');
const { SFX_GRAFFITI } = await import('../src/audio/sfx-graffiti.js');

const DT = 1 / 120;
const RUNS = Math.max(1, parseInt(process.argv[2] || '30', 10));
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
const music = { setMode: noop, setIntensity: noop, setTension: noop, setFlag: noop, bump: noop, setLevel: noop, currentChord: () => [220, 261.6, 329.6] };
const sfxLog = new Map();
const audio = { music, sfx: (n) => sfxLog.set(n, (sfxLog.get(n) || 0) + 1), impact: noop, speak: noop, setPaused: noop, chargeLevel: noop, stopCharge: noop };
const said = new Map();
const ui = {
  banner: noop, lumen: noop, tally: noop, flashBalls: noop,
  onGameStart: noop, showPause: noop, showTitle: noop, showGameOver: noop,
};

function makeGame() {
  const input = new BotInput();
  const settings = { reducedMotion: false, reducedFx: false };
  const g = new Game({ renderer: { fx, render: noop, alpha: 1 }, audio, input, ui, settings });
  g.scores = { best: 0, rank: () => -1, add: noop, list: [] };
  const say = g.say.bind(g);
  g.say = (key, params) => { said.set(key, (said.get(key) || 0) + 1); say(key, params); };
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

function startTag(level = 1) {
  const { g, input } = makeGame();
  g.newGame();
  g.level = level; g.applyDifficulty();
  g.table.launch(0.5); run(g, 0.5);
  g.debug('start', 'tag');
  run(g, 3, () => g.scene === 'minigame' ? false : undefined);
  return { g, input, mg: g.minigame };
}

function restart(g) {
  g.debug('qualify', 'tag');
  g.debug('start', 'tag');
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
const cellXY = (k) => [GRID.x0 + (k % GRID.cols + 0.5) * GRID.cell, GRID.y0 + ((k / GRID.cols | 0) + 0.5) * GRID.cell];

// ------------------------------------------------------------------ 1. géométrie
log('\n[1] Géométrie : mur, bombes de peinture, couloirs de vol des drones');
{
  const { g, mg } = startTag(1);
  check(g.scene === 'minigame' && mg && mg.sector === 'tag' && mg instanceof GraffitiGame, 'minijeu FRESQUE NÉON démarré');
  check(mg.world.flippers.length === 2 && !mg.paddle, 'arène à batteurs');
  check(mg.total > 1000, `mur découpé en ${mg.total} cellules comptées (${GRID.cols}×${GRID.rows}, cellule ${GRID.cell})`);
  // aucune cellule comptée sous une bombe, ni hors du cadre
  let bad = 0;
  for (const k of mg.counted) {
    const [x, y] = cellXY(k);
    if (y > WALL_Y1 || BOMBS.some(B => Math.hypot(x - B.x, y - B.y) < BUMP_R + 6)) bad++;
  }
  check(bad === 0, 'aucune cellule comptée sous une bombe ou sous le bas du mur');
  // bombes : jamais d'interstice où la bille (Ø 26) pourrait se coincer
  const rails = mg.world.statics.filter(p => p.kind === 'seg' && p.style === 'rail');
  let minGap = Infinity;
  for (const B of BOMBS) {
    for (const p of rails) minGap = Math.min(minGap, segDist(B.x, B.y, p) - p.r - BUMP_R);
    for (const C of BOMBS) if (C !== B) minGap = Math.min(minGap, Math.hypot(C.x - B.x, C.y - B.y) - 2 * BUMP_R);
  }
  check(minGap > 26 * 2.5, `espace libre autour des bombes : ${minGap.toFixed(0)} (bille Ø 26)`);
  // couloir de vol des drones (bornage) : toujours à plus d'un diamètre de bille des murs et des bombes
  let worst = Infinity;
  const d = { x: 0, y: 0 };
  for (let y = 0; y <= 620; y += 8) {
    for (let x = 0; x <= 600; x += 8) {
      d.x = x; d.y = y; mg._clampDrone(d);
      for (const p of rails) worst = Math.min(worst, segDist(d.x, d.y, p) - p.r - 16);
      for (const B of BOMBS) worst = Math.min(worst, Math.hypot(d.x - B.x, d.y - B.y) - BUMP_R - 16);
    }
  }
  check(worst > 26 + 4, `drones toujours à plus d'un diamètre de bille d'un mur ou d'une bombe (min ${worst.toFixed(0)})`);
  check(mg.dronePool.every(p => !p.enabled), 'drones absents au départ (le joueur peint d\'abord)');
}

// ------------------------------------------------------------------ 2. peinture
log('\n[2] Peinture : pinceau, vitesse, aérosol, éclaboussures, gouttes');
{
  const { g, mg } = startTag(1);
  mg.droneT = 1e9; mg.capT = 1e9;
  mg.setBarrier(1e4);
  const b = mg.world.balls[0];
  check(mg.aerosolT > 0 && mg.perkT > 0, 'avantage d\'entrée : pistolet à peinture (rayon ×2)');
  mg.aerosolT = 0;
  // pinceau lent / rapide / aérosol
  b.vx = 300; b.vy = 0; const rSlow = mg._brush(b);
  b.vx = 3200; const rFast = mg._brush(b);
  mg.aerosolT = 3; const rAero = mg._brush(b); mg.aerosolT = 0;
  check(rFast > rSlow && rAero >= rFast * 1.9, `rayon du pinceau : ${rSlow.toFixed(0)} lent, ${rFast.toFixed(0)} rapide, ${rAero.toFixed(0)} avec l'aérosol`);
  // trajet horizontal dans le mur
  mg.paint.fill(0); mg.painted = 0;
  const n = mg._paintSeg(120, 470, 440, 470, 13, 0);
  const expect = Math.round(320 / GRID.cell * 2);
  check(n >= expect && mg.painted === n, `un trait de 320 unités peint ${n} cellules`);
  check(mg._paintSeg(120, 470, 440, 470, 13, 0) === 0, 'repasser au même endroit ne compte pas deux fois');
  check(mg._paintSeg(100, 800, 400, 800, 20, 0) === 0, 'rien n\'est peint sous le mur (moitié basse)');
  // la bille peint en vol
  mg.paint.fill(0); mg.painted = 0;
  b.setPos(150, 520); b.vx = 900; b.vy = -900;
  run(g, 0.2);
  check(mg.painted > 20, `la bille peint son passage (${mg.painted} cellules en 0,2 s)`);
  // bombe de peinture : éclaboussure + gouttes
  mg.paint.fill(0); mg.painted = 0;
  const B = mg.bombs[2];
  b.setPos(B.x + 4, B.y - 70); b.vx = 0; b.vy = 900;
  run(g, 0.08);
  const atHit = mg.painted;
  check(B.hits === 1 && mg.splashes === 1, 'bombe de peinture percutée');
  check(mg.blobs.length > 0 || atHit > 30, 'éclaboussure et gouttes projetées');
  const blobs = mg.blobs.map(o => o);
  run(g, 0.5);
  check(blobs.every(o => !mg.blobs.includes(o)) && mg.painted > atHit, `les gouttes retombent et peignent (${atHit} → ${mg.painted} cellules)`);
}

// ------------------------------------------------------------------ 3. drones, capsule
log('\n[3] Drones nettoyeurs et capsule AÉROSOL');
{
  const { g, mg } = startTag(1);
  mg.capT = 1e9;
  mg.droneT = 0;
  mg._checkProgress = noop;          // pas de victoire : on remplit le mur à la main
  mg.setBarrier(1e4);                // la bille reste dans l'arène pendant ces vérifications
  run(g, 1.2);
  check(mg.dronesIn && mg.drones.length === mg.T.drones && mg.drones.every(d => d.warp >= 1 && d.p.enabled), `${mg.drones.length} drones matérialisés`);
  // un drone efface la peinture sous lui
  const d = mg.drones[0];
  for (const k of mg.counted) { mg.paint[k] = 1; }
  mg.painted = mg.total;
  mg.world.balls[0].setPos(281, 900);
  const before = mg.painted;
  run(g, 1);
  check(mg.painted < before && d.erased > 0, `les drones effacent la peinture (${before - mg.painted} cellules en 1 s)`);
  // percuter un drone : étourdi, n'efface plus, éclaboussure
  const b = mg.world.balls[0];
  b.setPos(d.x, d.y + 40); b.vx = 0; b.vy = -1400;
  run(g, 0.1);
  check(d.stun > 0 && mg.stunned >= 1, `drone percuté : étourdi ${d.stun.toFixed(1)} s`);
  const e0 = d.erased;
  run(g, Math.min(1, d.stun - 0.2));
  check(d.erased === e0, 'un drone étourdi n\'efface plus rien');
  run(g, mg.T.stun + 0.5);
  check(d.stun <= 0, 'le drone reprend son service après l\'étourdissement');
  // capsule AÉROSOL : apparaît dans la zone la moins peinte, ramassée au passage
  mg.paint.fill(0); mg.painted = 0;
  for (const k of mg.counted) { const [x] = cellXY(k); if (x < 300) { mg.paint[k] = 1; mg.painted++; } }
  mg.capT = 0; mg.aerosolT = 0;
  run(g, 0.05);
  check(mg.cap && mg.cap.x > 250, `capsule apparue du côté encore gris (x ${mg.cap && mg.cap.x.toFixed(0)})`);
  const c = mg.cap;
  run(g, 0.5);
  b.setPos(c.x, c.y + 30); b.vx = 0; b.vy = -600;
  run(g, 0.1);
  check(!mg.cap && mg.aerosolT > 4 && mg.capsules === 1, 'capsule ramassée : rayon ×2 pendant 6 s');
}

// ------------------------------------------------------------------ 4. paliers, victoire, récompenses
log('\n[4] Paliers 25 / 50 %, victoire à 70 %, fresque illuminée, récompenses');
{
  const { g, mg } = startTag(1);
  mg.droneT = 1e9; mg.capT = 1e9;
  const id = mg.world.balls[0].id;
  const fill = (pct) => { for (const k of mg.counted) { if (mg.coverage() >= pct) break; if (!mg.paint[k]) { mg.paint[k] = 1; mg.painted++; } } };
  mg.aerosolT = 0;
  fill(25.5); run(g, DT * 2);
  check(mg.nextMs === 1 && mg.aerosolT > 4, 'palier 25 % : aérosol offert');
  fill(50.5); run(g, DT * 2);
  check(mg.nextMs === 2 && mg.barrier.enabled && mg.barrierT > mg.T.net - 1, `palier 50 % : filet de sécurité sous les batteurs (${mg.T.net} s)`);
  let res = null;
  const fin = mg.finish.bind(mg);
  mg.finish = (s, reason, drained) => { res = res || { s, reason, t: mg.winT }; fin(s, reason, drained); };
  fill(TARGET + 0.2); run(g, DT * 2);
  check(mg.state === 'victory' && mg.won, `${TARGET} % : séquence de victoire (fresque illuminée, signature)`);
  const tl = mg.timeLeft;
  run(g, 1);
  check(mg.timeLeft === tl, 'chrono gelé pendant l\'illumination');
  run(g, 3, () => res ? false : undefined);
  check(res && res.s && res.reason === 'fresco', `réussite après ${res && res.t.toFixed(1)} s d'animation`);
  run(g, 4, () => g.scene === 'table' && !g.transition ? false : undefined);
  check(g.scene === 'table' && g.table.world.balls.length === 1 && g.table.world.balls[0].id === id, 'la même bille revient sur le plateau');
  check(g.table.sectors.tag.done, 'secteur GRAFFITI réactivé');
  check(g.bonus.mult > 1 && g.bonus.bumperLevel > 1, `récompenses : multiplicateur ×${g.bonus.mult}, bumpers niveau ${g.bonus.bumperLevel}`);
  check(!g.table.sectors.tag.kept, 'progression effacée après la réussite');
  check(g.ledgerErrors === 0, 'comptabilité des billes sans erreur');
}

// ------------------------------------------------------------------ 5. chute, progression conservée, bouclier
log('\n[5] Chute (sans bouclier), moitié de la peinture conservée, bouclier');
{
  const { g, mg } = startTag(1);
  mg.droneT = 1e9; mg.capT = 1e9;
  const id = mg.world.balls[0].id;
  const before = g.ballsLeft;
  for (const k of mg.counted) { if (mg.coverage() >= 60) break; mg.paint[k] = 1; mg.painted++; }
  mg.nextMs = 2;
  const painted = mg.painted;
  mg.barrierT = 0; if (mg.barrier) mg.barrier.enabled = false;
  for (const b of mg.world.balls) { b.x = 300; b.y = 1200; b.vy = 100; }
  run(g, 4, () => g.scene === 'table' && !g.transition ? false : undefined);
  check(g.scene === 'table' && g.table.world.balls[0] && g.table.world.balls[0].id === id, 'chute : la même bille revient sur le plateau');
  check(g.ballsLeft === before, 'aucune bille consommée par la chute');
  const kept = g.table.sectors.tag.kept;
  check(kept && kept.cells && Math.abs(kept.cells.length - painted / 2) <= 1, `moitié de la peinture mémorisée (${kept && kept.cells.length}/${painted} cellules)`);
  // par plaques : la plupart des cellules conservées ont des voisines conservées
  if (kept) {
    const set = new Set(kept.cells);
    let nb = 0;
    for (const k of kept.cells) if (set.has(k + 1) || set.has(k - 1) || set.has(k + GRID.cols) || set.has(k - GRID.cols)) nb++;
    check(nb / kept.cells.length > 0.9, `peinture conservée par plaques, pas en confettis (${Math.round(100 * nb / kept.cells.length)} % de cellules groupées)`);
  }
  check(g.bonus.bumperLevel > 1, 'récompense partielle (≥ 50 %) : bumpers +1');
  const mg2 = restart(g);
  check(mg2 && mg2.painted === kept.cells.length && mg2.keptPct > 0, `nouvelle tentative : ${mg2.keptPct} % du mur déjà peint`);
  check(mg2.nextMs === 1, 'les paliers déjà dépassés ne sont pas rejoués');
  // bouclier : relance de la même bille, drones figés
  mg2.droneT = 0; run(g, 1.5);
  g.bonus.grant('shield');
  mg2.barrierT = 0; if (mg2.barrier) mg2.barrier.enabled = false;
  for (const b of mg2.world.balls) { b.x = 300; b.y = 1200; b.vy = 100; }
  run(g, 0.05);
  check(mg2.state === 'relaunch' && mg2.pendingBall && mg2.pendingBall.id === id, 'bouclier : relance automatique de la même bille');
  const ps = mg2.drones.map(d => d.x + ',' + d.y), pt = mg2.painted;
  run(g, 0.3);
  check(mg2.drones.every((d, i) => d.x + ',' + d.y === ps[i]) && mg2.painted === pt, 'drones figés (et rien d\'effacé) pendant la relance');
  run(g, 2, () => mg2.state === 'play' ? false : undefined);
  check(mg2.state === 'play' && mg2.world.balls[0].id === id, 'la bille est relancée dans l\'arène');
}

// ------------------------------------------------------------------ 6. recensement : atteignabilité des cellules
// Tirs isolés : la bille posée au hasard sur un batteur (ou lâchée au-dessus), le batteur
// frappe à un instant aléatoire ; on suit le tir jusqu'au retour vers les batteurs.
// Ni lanceur, ni drones, ni capsule : seules la bille et les bombes peignent.
const SHOTS = Math.max(900, RUNS * 30);
log(`\n[6] Recensement d'atteignabilité : ${SHOTS} tirs de batteurs isolés`);
{
  const { g, mg } = startTag(1);
  mg.droneT = 1e9; mg.capT = 1e9;
  mg._checkProgress = noop;          // pas de victoire pendant le recensement
  const hits = new Uint32Array(mg.paint.length), trailHits = new Uint32Array(mg.paint.length);
  const f = mg.frame;
  const b = mg.world.balls[0];
  let flights = 0;
  const runShot = (trailOnly) => {
    mg.paint.fill(0); mg.painted = 0; mg.blobs.length = 0;
    const left = Math.random() < 0.5;
    const F = left ? f.flipL : f.flipR;
    // bille qui roule sur le batteur (au repos), ou qui tombe dessus
    const u = 0.25 + Math.random() * 0.7;
    const x = F.px + Math.cos(F.rest) * F.len * u, y = F.py + Math.sin(F.rest) * F.len * u - 28 - Math.random() * 90;
    b.setPos(x, y); b.vx = (Math.random() - 0.5) * 200; b.vy = Math.random() * 300;
    b.state = 'free';
    const tFire = Math.random() * 0.45;
    let t = 0, up = false;
    while (t < 7) {
      const press = t >= tFire && t < tFire + 0.25;
      f.flipL.pressed = left && press; f.flipR.pressed = !left && press;
      for (const bb of mg.world.balls) { bb.px = bb.x; bb.py = bb.y; }
      mg.hue = 0;
      if (trailOnly) mg._splash = noop;
      mg.world.step(DT);
      mg.time += DT;
      if (!trailOnly) mg.arenaStep(DT);
      mg._paintBall(b, DT);
      t += DT;
      if (b.y < 600) up = true;
      if (up && b.y > 860) break;
      if (b.y > 1080) break;
    }
    if (up) flights++;
    for (const k of mg.counted) if (mg.paint[k]) (trailOnly ? trailHits : hits)[k]++;
  };
  const splash = mg._splash.bind(mg);
  for (let s = 0; s < SHOTS; s++) runShot(false);
  mg._splash = noop;
  for (let s = 0; s < SHOTS; s++) runShot(true);
  mg._splash = splash;
  const stat = (H) => {
    let zero = 0, low = 0; const ps = [];
    for (const k of mg.counted) { if (H[k] === 0) zero++; if (H[k] / SHOTS < 0.01) low++; ps.push(H[k] / SHOTS); }
    ps.sort((a, b) => a - b);
    return { zero, low, min: ps[0], p05: ps[Math.floor(ps.length * 0.05)], med: ps[ps.length >> 1] };
  };
  const all = stat(hits), tr = stat(trailHits);
  log(`  tirs montés dans le mur : ${flights}/${SHOTS * 2}`);
  log(`  toutes sources : cellules jamais peintes ${all.zero}/${mg.total} · < 1 % des tirs ${all.low} · min ${(all.min * 100).toFixed(1)} % · 5e centile ${(all.p05 * 100).toFixed(1)} % · médiane ${(all.med * 100).toFixed(1)} %`);
  log(`  bille seule   : cellules jamais peintes ${tr.zero}/${mg.total} · < 1 % des tirs ${tr.low} · min ${(tr.min * 100).toFixed(1)} % · 5e centile ${(tr.p05 * 100).toFixed(1)} % · médiane ${(tr.med * 100).toFixed(1)} %`);
  const zeros = (H) => Array.from(mg.counted).filter(k => H[k] === 0).map(k => `(${cellXY(k).map(v => v.toFixed(0)).join(',')})`).slice(0, 8).join(' ');
  check(all.zero === 0, 'chaque cellule comptée est peinte par des tirs normaux de batteurs' + (all.zero ? ' — jamais : ' + zeros(hits) : ''));
  check(tr.zero === 0, 'chaque cellule comptée est atteinte par la bille elle-même (sans éclaboussures)' + (tr.zero ? ' — jamais : ' + zeros(trailHits) : ''));
  check(all.low <= mg.total * 0.02, `pas de recoin rare : ${all.low} cellule(s) peinte(s) dans moins de 1 % des tirs`);
  // carte des probabilités (une lettre par cellule)
  if (process.env.MAP) {
    let rows = '';
    for (let j = 0; j < GRID.rows; j++) {
      let line = '';
      for (let i = 0; i < GRID.cols; i++) {
        const k = j * GRID.cols + i;
        if (!mg.mask[k]) { line += ' '; continue; }
        const p = hits[k] / SHOTS;
        line += p >= 0.3 ? '#' : p >= 0.15 ? '8' : p >= 0.07 ? 'o' : p >= 0.03 ? '+' : p >= 0.01 ? '.' : '_';
      }
      rows += '    ' + line + '\n';
    }
    log(rows);
  }
}

// ------------------------------------------------------------------ 7. recensement : blocages
const DROPS = Math.max(300, RUNS * 15);
log(`\n[7] Recensement des blocages : ${DROPS} billes lâchées partout (dont pièges classiques), batteurs au repos, drones actifs, sans déblocage automatique`);
{
  const { g, mg } = startTag(3);
  mg.capT = 1e9; mg._checkProgress = noop; mg.unstick = false;
  mg.barrierT = 0; mg.barrier.enabled = false;
  mg.droneT = 0;
  for (let i = 0; i < 240; i++) { mg.arenaStep(DT); }
  const b = mg.world.balls[0];
  const solid = (x, y) => {
    for (const p of mg.world.statics.concat(mg.world.dynamics)) {
      if (!p.enabled) continue;
      if (p.kind === 'seg' && segDist(x, y, p) < p.r + 14) return true;
      if (p.kind === 'circle' && Math.hypot(x - p.x, y - p.y) < p.r + 14) return true;
    }
    for (const F of mg.world.flippers) if (Math.hypot(x - F.px, y - F.py) < 110 && y > 900) return true;
    return false;
  };
  let stuck = 0, maxStill = 0, drained = 0, totalT = 0;
  const where = [], late = [];
  // pièges classiques testés exprès : pile au-dessus des poteaux et des bombes, poche de la
  // porte du lanceur, sommet du dôme, coins des renflements, dessus des slingshots
  const traps = [[58, 690], [504, 690], ...BOMBS.map(B => [B.x, B.y - 60]), [560, 250], [300, 40], [40, 490], [522, 490], [104, 740], [458, 740], [281, 700]];
  for (let s = 0; s < DROPS; s++) {
    let x, y, tries = 0;
    const trap = s < traps.length * 3 ? traps[s % traps.length] : null;
    if (trap) [x, y] = trap;
    else {
      do { x = 28 + Math.random() * 508; y = 28 + Math.random() * 980; tries++; }
      while ((solid(x, y) || (y < 300 && Math.hypot(x - 300, y - 300) > 262)) && tries < 200);
    }
    b.setPos(x, y); b.state = 'free';
    if (trap && s < traps.length) { b.vx = 0; b.vy = 0; } else { b.vx = (Math.random() - 0.5) * 300; b.vy = (Math.random() - 0.5) * 300; }
    let t = 0, still = 0, ax = x, ay = y;
    while (t < 8) {
      mg.frame.flipL.pressed = mg.frame.flipR.pressed = false;
      for (const bb of mg.world.balls) { bb.px = bb.x; bb.py = bb.y; }
      mg.arenaStep(DT);
      mg.world.step(DT);
      mg._unperch(b);
      t += DT;
      if (b.y > 1060 || (b.x > 542 && b.y > 985)) { drained++; break; }
      if (Math.hypot(b.x - ax, b.y - ay) < 4) still += DT; else { ax = b.x; ay = b.y; still = 0; }
      maxStill = Math.max(maxStill, still);
      if (still > 2) { stuck++; where.push(`(${b.x.toFixed(0)}, ${b.y.toFixed(0)})`); break; }
    }
    if (t >= 8) late.push(`(${x.toFixed(0)}, ${y.toFixed(0)}) → (${b.x.toFixed(0)}, ${b.y.toFixed(0)})`);
    totalT += t;
  }
  log(`  billes évacuées vers le bas : ${drained}/${DROPS} · durée moyenne ${(totalT / DROPS).toFixed(1)} s · immobilité max ${maxStill.toFixed(2)} s`);
  check(stuck === 0, 'aucune bille immobilisée plus de 2 s' + (where.length ? ' : ' + where.slice(0, 6).join(' ') : ''));
  check(drained >= DROPS * 0.98, `les billes redescendent en moins de 8 s (${drained}/${DROPS})` + (late.length ? ' — encore en jeu (rebonds) : ' + late.slice(0, 4).join(' ') : ''));
}

// ------------------------------------------------------------------ 8. parties automatiques
log(`\n[8] Parties automatiques : pilote simple de sim-tests.js, ${RUNS} parties par niveau et par mode`);
const MODES = [
  { name: 'règles réelles', shields: false },
  { name: 'boucliers illimités', shields: true },
];

function playSession(g, input, mg, mode = MODES[0]) {
  const out = { win: false, reason: 'none', t: 0, cov: 0, best: 0, nan: false, error: null, maxAway: 0, stuns: 0, caps: 0, erased: 0, splashes: 0, unstuck: 0, ms: 0, ticks: 0, kept: 0 };
  let res = null;
  const fin = mg.finish.bind(mg);
  mg.finish = (s, reason, drained) => { res = res || { s, reason, t: mg.time, cov: mg.coverage() }; fin(s, reason, drained); };
  out.kept = mg.keptPct;
  let launchHold = 0, away = 0;
  try {
    for (let i = 0; i < 140 / DT; i++) {
      if (g.minigame !== mg || mg.state === 'ended') break;
      if (mode.shields && g.bonus.shield === 0) g.bonus.grant('shield');
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
  if (res) { out.win = res.s; out.reason = res.reason; out.t = res.t; out.cov = res.cov; }
  out.best = mg.best; out.stuns = mg.stunned; out.caps = mg.capsules; out.erased = mg.erased; out.splashes = mg.splashes; out.unstuck = mg.unstuck;
  out.ledger = g.ledgerErrors;
  return out;
}

const pct = (n, d) => `${Math.round(100 * n / Math.max(1, d))} %`;
const avg = (a, f) => a.reduce((s, x) => s + f(x), 0) / Math.max(1, a.length);
const med = (a) => { const b = [...a].sort((x, y) => x - y); return b.length ? b[b.length >> 1] : 0; };
const summary = {};
for (const level of [1, 2, 3]) {
  for (const mode of MODES) {
    // échantillon élargi pour la statistique de référence (niveau 1, règles réelles)
    const N = level === 1 && !mode.shields && RUNS >= 20 ? Math.max(RUNS, 90) : RUNS;
    const rs = [];
    for (let i = 0; i < N; i++) { const { g, input, mg } = startTag(level); rs.push(playSession(g, input, mg, mode)); }
    const wins = rs.filter(r => r.win).length;
    const reasons = {};
    for (const r of rs) reasons[r.reason] = (reasons[r.reason] || 0) + 1;
    const key = `${level}-${mode.shields ? 's' : 'r'}`;
    summary[key] = { wins, rs, n: N };
    log(`  — niv. ${level} (${mode.name}) : victoires ${wins}/${N} (${pct(wins, N)}) · issues ${JSON.stringify(reasons)}`);
    log(`    durée des victoires : médiane ${med(rs.filter(r => r.win).map(r => r.t)).toFixed(1)} s · meilleure couverture des échecs ${avg(rs.filter(r => !r.win), r => r.best).toFixed(0)} %`);
    log(`    bombes ${avg(rs, r => r.splashes).toFixed(1)}/partie · drones sonnés ${avg(rs, r => r.stuns).toFixed(1)} · cellules effacées ${avg(rs, r => r.erased).toFixed(0)} · capsules ${avg(rs, r => r.caps).toFixed(2)}`);
    log(`    hors batteurs max ${Math.max(...rs.map(r => r.maxAway)).toFixed(1)} s · déblocages ${rs.reduce((s, r) => s + r.unstuck, 0)} · ${(avg(rs, r => r.ms / Math.max(1, r.ticks)) * 1000).toFixed(0)} µs/pas (logique)`);
    check(rs.every(r => !r.error), 'aucune exception' + (rs.find(r => r.error) ? ' : ' + rs.find(r => r.error).error.stack : ''));
    check(rs.every(r => !r.nan), 'aucune valeur NaN');
    check(rs.every(r => r.reason !== 'none'), 'chaque partie se termine (fresque, chute ou chrono)');
    check(rs.every(r => r.maxAway < 15), `la bille revient toujours vers les batteurs (max ${Math.max(...rs.map(r => r.maxAway)).toFixed(1)} s hors zone)`);
    check(rs.reduce((s, r) => s + r.unstuck, 0) <= Math.ceil(RUNS / 10), 'aucun blocage notable (déblocages automatiques rares)');
    check(rs.every(r => r.ledger === 0), 'comptabilité des billes sans erreur');
    check(avg(rs, r => r.ms / Math.max(1, r.ticks)) < 0.25, 'logique du minijeu bien sous le budget (< 0,25 ms par pas)');
  }
}
if (RUNS >= 20) {
  const S = (k) => summary[k].wins / summary[k].n;
  const r1 = S('1-r'), s1 = S('1-s'), r3 = S('3-r');
  check(r1 >= 0.5 && r1 <= 0.85, `niveau 1, règles réelles : environ 2 parties sur 3 réussies (${pct(summary['1-r'].wins, summary['1-r'].n)} sur ${summary['1-r'].n} parties)`);
  check(s1 >= 0.85, `niveau 1 sans chute : l'objectif est atteint dans le temps imparti (${pct(summary['1-s'].wins, RUNS)})`);
  check(r3 <= r1 + 0.1, `la difficulté monte avec le niveau (niv. 1 ${Math.round(r1 * 100)} % → niv. 2 ${Math.round(S('2-r') * 100)} % → niv. 3 ${Math.round(r3 * 100)} %)`);
} else log(`  (statistiques indicatives sur ${RUNS} parties : niv. 1 ${pct(summary['1-r'].wins, summary['1-r'].n)} en règles réelles)`);

// ------------------------------------------------------------------ 9. campagne
log('\n[9] Campagne : tentatives successives avec la moitié de la peinture conservée (règles réelles)');
for (const level of [1, 2]) {
  const att = [];
  let errors = 0, keptSum = 0, keptN = 0;
  for (let i = 0; i < RUNS; i++) {
    let { g, input, mg } = startTag(level);
    let n = 0, won = false;
    while (n < 5 && mg) {
      n++;
      const r = playSession(g, input, mg, MODES[0]);
      if (n > 1) { keptSum += r.kept; keptN++; }
      if (r.error) { errors++; break; }
      if (r.win) { won = true; break; }
      input.releaseAll();
      run(g, 5, () => g.scene === 'table' && !g.transition ? false : undefined);
      if (g.scene !== 'table' || !g.table.world.balls.length) break;
      mg = restart(g);
      if (!mg || g.scene !== 'minigame') break;
    }
    att.push(won ? n : 99);
  }
  const within = (k) => att.filter(a => a <= k).length;
  log(`  niv. ${level} : réussite en 1 tentative ${pct(within(1), RUNS)} · ≤ 2 : ${pct(within(2), RUNS)} · ≤ 3 : ${pct(within(3), RUNS)} · peinture rendue en moyenne ${(keptSum / Math.max(1, keptN)).toFixed(0)} %`);
  check(errors === 0, 'campagne sans exception');
  if (level === 1 && RUNS >= 20) check(within(2) / RUNS >= 0.7, 'niveau 1 : au moins 70 % des campagnes réussies en 2 tentatives');
}

// ------------------------------------------------------------------ 10. sons et rendu
log('\n[10] Sons et rendu');
{
  // moteur audio factice : mêmes primitives que AudioEngine
  const calls = { tone: 0, noise: 0, bell: 0 };
  const node = { connect: noop };
  const A = {
    now: 0, ctx: { currentTime: 0 }, music: { currentChord: () => [220, 261.6, 329.6] },
    claim: () => true, throttle: () => true, pan: (x) => (x / 600) * 2 - 1,
    out: () => node,
    // mêmes contraintes que Web Audio : instants de départ finis et jamais négatifs
    tone: (o) => { calls.tone++; if (!(o.f > 0) || !(o.gain >= 0) || !(o.dur > 0) || (o.t !== undefined && !(o.t >= 0))) throw new Error('tone invalide'); },
    noise: (o) => { calls.noise++; if (!(o.f > 0) || !(o.gain >= 0) || !(o.dur > 0) || (o.t !== undefined && !(o.t >= 0))) throw new Error('noise invalide'); },
    bell: (o) => { calls.bell++; if (!(o.f > 0) || (o.t !== undefined && !(o.t >= 0))) throw new Error('bell invalide'); },
  };
  let err = null;
  for (const [name, fn] of Object.entries(SFX_GRAFFITI)) {
    try { fn(A, 0.3, 1, true); fn(A); } catch (e) { err = `${name} : ${e.message}`; }
  }
  check(!err, `les ${Object.keys(SFX_GRAFFITI).length} effets sonores se construisent sans erreur (${calls.tone + calls.noise + calls.bell} voix)` + (err ? ' — ' + err : ''));
  const used = [...sfxLog.keys()].filter(k => k.startsWith('tag'));
  const missing = used.filter(k => !SFX[k]);
  check(missing.length === 0, `sons demandés par le minijeu tous définis : ${used.sort().join(', ')}` + (missing.length ? ' — manquants : ' + missing.join(', ') : ''));
  check(used.length >= 9, 'retour sonore varié (pulvérisation, éclaboussures, drones, capsule, paliers, victoire)');
  // rendu sans navigateur : aucune exception, aucune file d'opérations qui grossit
  const { mg } = startTag(1);
  let rerr = null;
  try { renderGraffiti({}, { time: 0 }, mg); renderGraffitiTop({}, { time: 0 }, mg); } catch (e) { rerr = e; }
  check(!rerr && mg.ops === null, 'rendu inactif hors navigateur (aucune file de peinture accumulée)');
  const keys = [...said.keys()].filter(k => k.startsWith('tag') || k === 'enter_tag');
  const need = ['enter_tag', 'tagDrones', 'tagStun', 'tag25', 'tag50', 'tagWin', 'tagAerosol'];
  check(need.every(k => said.has(k)), `LUMEN commente le minijeu : ${keys.sort().join(', ')}`);
}

log(`\nRésultat : ${passes} vérifications réussies, ${failures} échec(s).`);
process.exit(failures ? 1 : 0);
