import { DMD } from '../../src/ui/dmd.js';

// Banc d'essai du DMD : plusieurs tailles, boutons pour chaque animation, mesure de draw().
const settings = { reducedFx: new URLSearchParams(location.search).get('rfx') === '1' };
// ?solo=LxH : un seul afficheur à cette taille (inspection détaillée)
// ?sheet=jackpot&times=0.2,0.6,1.2 : planche d'images figées (play, attract, mg, mgsay, mgnull, say0…say5, chars, ou un type d'événement)
const Q = new URLSearchParams(location.search);
const solo = Q.get('solo'), sheet = Q.get('sheet');
const sheetTimes = (Q.get('times') || '0.1,0.3,0.6,1,1.5,2,2.5,3').split(',').map(Number);
const cell = (Q.get('cell') || '384x96').split('x').map(Number);
const SIZES = sheet ? sheet.split(';').flatMap(k => sheetTimes.map(t => [cell[0], cell[1], k + ' @ ' + t + ' s'])) : solo ? [[...solo.split('x').map(Number), 'Solo · ' + solo]] : [
  [190, 48, 'Téléphone portrait · 190×48', true],
  [256, 64, '256×64'],
  [320, 80, 'Panneau paysage · 320×80'],
  [384, 96, '384×96'],
  [768, 192, 'Loupe · 768×192'],
];
const dpr = Math.min(3, window.devicePixelRatio || 1);
const screens = document.getElementById('screens');
const dmds = SIZES.map(([w, h, label, phone]) => {
  const fig = document.createElement('figure');
  const cv = document.createElement('canvas');
  cv.className = 'dmd';
  if (phone) {
    const ph = document.createElement('div');
    ph.className = 'phone';
    ph.appendChild(cv);
    const tb = document.createElement('div');
    tb.className = 'table';
    ph.appendChild(tb);
    fig.appendChild(ph);
  } else fig.appendChild(cv);
  const cap = document.createElement('figcaption');
  cap.textContent = label;
  fig.appendChild(cap);
  screens.appendChild(fig);
  const d = new DMD(cv, settings);
  d.resize(w, h, dpr);
  return { d, label, times: [] };
});
const all = (fn) => dmds.forEach(o => fn(o.d));

// ------------------------------------------------------------ état simulé
const S = { score: 0, tick: false, mg: null, paused: false, ball: 1, level: 1, mult: 1, bonusX: 1 };
const HISCORES = [
  { name: 'NOVA', score: 18452300 }, { name: 'ZED', score: 9120450 }, { name: 'IRIS', score: 4400120 },
  { name: 'K9', score: 1250000 }, { name: 'OPR', score: 310500 },
];
all(d => { d.setHiscores(HISCORES); d.setMode('attract'); });
const pushInfo = () => all(d => d.setInfo({ ball: S.ball, balls: 3, level: S.level, mult: S.mult, bonusX: S.bonusX }));
pushInfo();

const EVENTS = [
  ['jackpot', { value: 75000 }],
  ['superJackpot', { value: 300000 }],
  ['multiball', {}],
  ['extraBall', {}],
  ['skillShot', { value: 30000 }],
  ['combo', { n: 3 }],
  ['sectorReady', { name: 'RÉACTEUR', sub: 'DEUX BOUCLES PUIS LE PORTAIL', color: '#ffae2a' }],
  ['minigame', { title: 'CASSE-BRIQUES ORBITAL', sub: 'BRISEZ LES 3 VERROUS', color: '#29d9ff' }],
  ['minigameWin', { title: 'HANGAR RÉACTIVÉ', sub: 'BILLE SUPPLÉMENTAIRE · AIMANT ACTIVÉ', color: '#29d9ff' }],
  ['minigameFail', { title: 'DÉFENSE : ÉCHEC', sub: 'TEMPS ÉCOULÉ · PROGRESSION CONSERVÉE', color: '#5dff8f' }],
  ['mission', { text: 'Touchez 5 fois les bumpers en 20 s' }],
  ['missionDone', { text: '+25.000 · ×2 pendant 15 s' }],
  ['ballSave', {}],
  ['shield', {}],
  ['ballLost', { bonus: 48200 }],
  ['levelUp', { lvl: 2 }],
  ['gameOver', { score: 4512870 }],
  ['banner', { title: 'RÉPLICATION PRÊTE', sub: 'Multibille au portail central', color: '#ff3df2' }],
];
const evBox = document.getElementById('ev');
const btn = (parent, label, fn) => { const b = document.createElement('button'); b.textContent = label; b.addEventListener('click', fn); parent.appendChild(b); return b; };
let combo = 2;
for (const [kind, data] of EVENTS) {
  btn(evBox, kind, () => {
    if (kind === 'combo') data.n = combo = combo >= 9 ? 2 : combo + 1;
    if (kind === 'jackpot' || kind === 'superJackpot') bump(data.value);
    all(d => d.show(kind, { ...data }));
  });
}
btn(evBox, 'banner sans sous-titre', () => all(d => d.show('banner', { title: 'Niveau de sécurité 3 — les secteurs se reverrouillent' })));
btn(evBox, 'test des caractères', () => all(d => d.show('banner', { title: 'ÉÈÊËÀÂÄÇÔÖÎÏÙÛÜŸŒ', sub: 'àéèêëîïôöùûüÿçœæ « citation » … — ’ 0123456789 ×2 % / ( ) # * < > = ? !' })));
btn(evBox, 'rafale (file d\'attente)', () => all(d => { d.show('combo', { n: 2 }); d.show('mission', { text: 'Rampes ×3' }); d.show('jackpot', { value: 50000 }); d.show('ballSave'); d.show('superJackpot', { value: 400000 }); }));
btn(evBox, 'tout enchaîner', () => {
  EVENTS.filter(([k]) => k !== 'gameOver').forEach(([k, data], i) => setTimeout(() => all(d => d.show(k, { ...data })), i * 3200));
});

const talkBox = document.getElementById('talk');
const LINES = [
  ['LUMEN court', 'Jackpot. J\'adore ce mot.', 'lumen'],
  ['LUMEN long', 'NULL a pris trois secteurs. Moi, j\'ai gardé le sens de l\'humour.', 'lumen'],
  ['LUMEN accents', 'Réacteur prêt à stabiliser. Visez le portail central — nœuds à 12 %.', 'lumen'],
  ['NULL court', 'ACCÈS REFUSÉ.', 'null'],
  ['NULL long', 'VOUS N\'ÊTES QU\'UN PROCESSUS PARMI D\'AUTRES.', 'null'],
  ['NULL minuscules', 'ce n\'est… qu\'une… mise à jour…', 'null'],
];
for (const [label, text, who] of LINES) btn(talkBox, label, () => all(d => d.say(text, who)));

// ------------------------------------------------------------ état
const stBox = document.getElementById('state');
btn(stBox, 'mode attract', () => all(d => d.setMode('attract')));
btn(stBox, 'mode jeu', () => { all(d => d.setMode('play')); });
const tickB = btn(stBox, 'score qui défile', () => { S.tick = !S.tick; tickB.classList.toggle('on', S.tick); });
btn(stBox, '+25 000', () => bump(25000));
btn(stBox, '+1 234 567', () => bump(1234567));
btn(stBox, 'score 9 chiffres', () => { S.score = 987654321; all(d => d.setScore(S.score)); });
btn(stBox, 'score à 0', () => { S.score = 0; all(d => d.setScore(0)); });
btn(stBox, 'infos suivantes', () => { S.ball = S.ball % 3 + 1; S.level++; S.mult = S.mult >= 4 ? 1 : S.mult + 1; S.bonusX = S.bonusX >= 5 ? 1 : S.bonusX + 2; pushInfo(); });
const mgB = btn(stBox, 'minijeu', () => {
  S.mg = S.mg ? null : { title: 'DÉFENSE DE LA STATION', timeLeft: 25, timeLimit: 25, progress: 'Vague 2/3 · coque 4/5', color: '#5dff8f' };
  mgB.classList.toggle('on', !!S.mg);
  if (!S.mg) all(d => d.setMinigame(null));
});
const fxB = btn(stBox, 'reducedFx', () => { settings.reducedFx = !settings.reducedFx; fxB.classList.toggle('on', settings.reducedFx); });
const pB = btn(stBox, 'pause', () => { S.paused = !S.paused; pB.classList.toggle('on', S.paused); });
btn(stBox, 'pas +1/20 s', () => { all(d => d.update(0.05)); });
btn(stBox, 'records vides', () => all(d => d.setHiscores([])));
btn(stBox, 'records', () => all(d => d.setHiscores(HISCORES)));

function bump(v) { S.score += v; all(d => d.setScore(S.score)); }

// ------------------------------------------------------------ boucle
const perfBox = document.getElementById('perf');
let last = performance.now(), perfT = 0;
function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (!S.paused) {
    if (S.tick) { S.score += Math.round(10 + Math.random() * 1500); all(d => d.setScore(S.score)); }
    if (S.mg) {
      S.mg.timeLeft -= dt;
      if (S.mg.timeLeft <= 0) S.mg.timeLeft = S.mg.timeLimit;
      all(d => d.setMinigame(S.mg));
    }
    all(d => d.update(dt));
  }
  for (const o of dmds) {
    const t0 = performance.now();
    o.d.draw();
    o.times.push(performance.now() - t0);
    if (o.times.length > 240) o.times.shift();
  }
  perfT -= dt;
  if (perfT <= 0) {
    perfT = 0.5;
    perfBox.textContent = `dpr ${dpr}\n` + dmds.map(o => {
      const a = o.times, avg = a.reduce((s, v) => s + v, 0) / a.length, max = Math.max(...a);
      return `${o.label.padEnd(30)} moyenne ${avg.toFixed(3)} ms · max ${max.toFixed(3)} ms`;
    }).join('\n');
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// Fige un événement à l'instant t (captures d'écran) : demo.freeze('jackpot', { value: 1000 }, 1.6)
function freeze(kind, data, t, mode = 'play') {
  S.paused = true; pB.classList.add('on');
  all(d => { d.setMode(mode === 'play' ? 'attract' : 'play'); d.setMode(mode); d.update(0.3); if (kind) d.show(kind, data || {}); step(d, t); });
}

// ------------------------------------------------------------ planche d'images figées
const MG = { title: 'DÉFENSE DE LA STATION', timeLeft: 7.4, timeLimit: 25, progress: 'Vague 2/3 · coque 4/5', color: '#5dff8f' };
function step(d, t) { for (let x = 0; x < t - 1e-9; x += 1 / 60) d.update(Math.min(1 / 60, t - x)); }
function scenario(d, kind, t) {
  d.setHiscores(HISCORES); d.setScore(1234567); d.setInfo({ ball: 2, balls: 3, level: 1, mult: 2, bonusX: 3 });
  if (kind === 'attract') { d.setMode('play'); d.setMode('attract'); step(d, t); return; }
  d.setMode('play'); step(d, 0.3);
  if (kind === 'play') { step(d, t); return; }
  if (kind.startsWith('mg')) {
    d.setMinigame({ ...MG, timeLeft: MG.timeLeft - t });
    if (kind === 'mgsay') d.say(LINES[1][1], 'lumen');
    if (kind === 'mgnull') d.say(LINES[4][1], 'null');
    step(d, t); return;
  }
  if (kind.startsWith('say')) { const L = LINES[+kind.slice(3)]; d.say(L[1], L[2]); step(d, t); return; }
  if (kind === 'chars') { d.show('banner', { title: 'ÉÈÊËÀÂÄÇÔÖÎÏÙÛÜŸŒ', sub: 'àéèêëîïôöùûüÿçœæ « citation » … — ’ 0123456789 ×2 % / ( ) # * < > = ? !' }); step(d, t); return; }
  const ev = EVENTS.find(([k]) => k === kind);
  d.show(kind, ev ? { ...ev[1] } : {}); step(d, t);
}
if (sheet) {
  S.paused = true;
  document.querySelectorAll('fieldset:not(:last-of-type), h1, p.note').forEach(el => { el.style.display = 'none'; });
  screens.style.gap = '6px 10px';
  dmds.forEach((o) => { const [k, t] = o.label.split(' @ '); scenario(o.d, k, parseFloat(t)); });
}

window.demo = { dmds: dmds.map(o => o.d), all, S, settings, freeze, bump };
