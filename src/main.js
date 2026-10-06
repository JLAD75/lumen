import { loadSettings, load, save } from './util/storage.js';
import { Input } from './input/input.js';
import { Renderer } from './render/renderer.js';
import { AudioEngine } from './audio/engine.js';
import { UI } from './ui/hud.js';
import { Game } from './game/game.js';

// Point d'entrée : assemble entrées, rendu, audio, interface et logique de jeu.
const settings = loadSettings();
// ?mute : session silencieuse (tests automatisés), sans toucher aux réglages enregistrés
if (/[?&]mute/.test(location.search)) settings.muted = true;
const canvas = document.getElementById('game');
const renderer = new Renderer(canvas, settings, document.getElementById('bg'), document.getElementById('fx'));
document.getElementById('app').classList.toggle('rfx', !!settings.reducedFx);
const audio = new AudioEngine(settings);
const input = new Input();
input.haptics = settings.haptics;

let game = null;
let afterHelp = null;

function startGame() {
  audio.unlock();
  if (!load('helpSeen', false)) {
    save('helpSeen', true);
    afterHelp = () => game.newGame();
    ui.open('help');
    return;
  }
  game.newGame();
}

const ui = new UI(settings, {
  play: startGame,
  resume: () => game.resume(),
  pause: () => { if (game.state === 'play') game.pause(); },
  quit: () => game.quitToTitle(),
  fullscreen: toggleFullscreen,
  settingsChanged: (k) => {
    audio.applyVolumes();
    input.haptics = settings.haptics;
    if (k === 'reducedFx') { renderer.layers.clear(); document.getElementById('app').classList.toggle('rfx', !!settings.reducedFx); }
    if (k === 'reducedMotion' || k === 'tilt') onResize();   // caméra de suivi et vue inclinée
  },
  saveScore: (name) => { game.scores.add(name, game.score, game.level); save('lastName', name); ui.renderHiscores(); },
  scores: () => game.scores,
  sfx: (n) => audio.sfx(n),
  menuOpen: (open) => { input.enabled = !open; if (open) input.releaseAll(); },
});

// « Compris » sur l'aide affichée avant la première partie lance la partie.
const origBack = ui.back.bind(ui);
ui.back = () => {
  origBack();
  if (afterHelp && !ui.topScreen()) { const f = afterHelp; afterHelp = null; f(); }
  else if (afterHelp && ui.topScreen() === 'title') { const f = afterHelp; afterHelp = null; f(); }
};

game = new Game({ renderer, audio, input, ui, settings });
ui.bounds = { ...game.table.bounds };   // plateau long : le monde commence au-dessus de y = 0

input.attach(document.getElementById('touch-layer'), document.getElementById('btn-launch'));
input.onAnyInput = () => audio.unlock();
input.onCommand = (cmd) => {
  const top = ui.topScreen();
  const focusedBtn = document.activeElement && (document.activeElement.tagName === 'BUTTON' || document.activeElement.tagName === 'INPUT');
  // fin de partie : la séquence décide (passer la cinématique, valider une initiale, rejouer)
  if (game.state === 'over' && top === 'over') { ui.over.command(cmd, focusedBtn); return; }
  if (cmd === 'pause') {
    if (game.state === 'play') game.pause();
    else if (game.state === 'pause') { if (top === 'pause') game.resume(); else ui.back(); }
    else if (top && top !== 'title' && top !== 'over') ui.back();
  } else if ((cmd === 'confirm' || cmd === 'launchKey') && !focusedBtn) {
    if (game.state === 'title' && top === 'title') startGame();
  }
};

function toggleFullscreen() {
  const d = document;
  try {
    if (!d.fullscreenElement) d.documentElement.requestFullscreen && d.documentElement.requestFullscreen({ navigationUI: 'hide' }).catch(() => {});
    else d.exitFullscreen && d.exitFullscreen();
  } catch (_) { /* non pris en charge */ }
}
if (!document.documentElement.requestFullscreen) document.getElementById('btn-fs').classList.add('hidden');

// Pause automatique : perte de focus, application en arrière-plan.
window.addEventListener('blur', () => { if (game.state === 'play') game.pause(); });
document.addEventListener('visibilitychange', () => { if (document.hidden && game.state === 'play') game.pause(); });

// Mise en page adaptative (sans déformer la physique : échelle uniforme).
function onResize() {
  const view = ui.layout();
  const cv = ui.canvasRect;
  canvas.style.left = cv.left + 'px';
  canvas.style.top = cv.top + 'px';
  canvas.style.transform = cv.transform;
  canvas.style.transformOrigin = cv.origin;
  renderer.resize(cv.width, cv.height, view);
  renderer.resizeBackdrop(window.innerWidth, window.innerHeight, ui.screenRect, cv);
}
window.addEventListener('resize', onResize);
window.addEventListener('orientationchange', () => setTimeout(onResize, 150));
if (window.visualViewport) window.visualViewport.addEventListener('resize', onResize);
onResize();
if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => renderer.layers.clear());

// Boucle principale : simulation à pas fixe (dans Game) + rendu interpolé.
let last = performance.now();
const debug = /[?&]debug/.test(location.search);
let fpsEl = null;
if (debug) {
  fpsEl = document.createElement('div');
  fpsEl.style.cssText = 'position:fixed;left:4px;bottom:4px;z-index:50;font:12px monospace;color:#0f0;background:rgba(0,0,0,0.6);padding:2px 5px;pointer-events:none';
  document.body.appendChild(fpsEl);
}
function loop(now) {
  const dt = Math.max(0, (now - last) / 1000);
  last = now;
  if (!window.__LN || !window.__LN.hold) game.frame(dt);   // __LN.hold : pilotage manuel (tests)
  game.render();
  ui.update(game, Math.min(dt, 0.1));
  if (fpsEl) {
    const w = game.scene === 'minigame' && game.minigame ? game.minigame.world : game.table.world;
    fpsEl.textContent = `${Math.round(renderer.fpsAvg)} fps · dpr ${renderer.dpr.toFixed(2)} · post q${renderer.post.quality} · sous-pas ${w.substepsLast} · billes ${game.activeBalls().length} · erreurs ${game.ledgerErrors}`;
  }
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

ui.showTitle();
game.music.setMode('title');

// Accès de test / débogage (console) : __LN.game, __LN.debug('start', 'hangar')…
window.__LN = { game, ui, audio, renderer, input, debug: (c, a) => game.debug(c, a) };
