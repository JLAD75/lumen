// Banc d'essai visuel de PostFX et Backdrop : faux plateau néon, déclencheurs, mesures.
import { PostFX } from '../../src/render/postfx.js';
import { Backdrop } from '../../src/render/backdrop.js';
import { glowSprite } from '../../src/render/sprites.js';

const FONT = '"Rajdhani", "Segoe UI", sans-serif';
const FONT_D = '"Orbitron", "Rajdhani", sans-serif';
const TW = 600, TH = 1100;
const qs = new URLSearchParams(location.search);

const canvas = document.getElementById('c');
const ctx = canvas.getContext('2d', { alpha: false });
const settings = { reducedFx: qs.get('rfx') === '1', reducedMotion: qs.get('rm') === '1' };
const post = new PostFX(settings);
const back = new Backdrop(settings);
const S = { mood: qs.get('mood') || 'calm', intensity: 0.3, level: 1, post: qs.get('post') !== '0', back: qs.get('back') !== '0', panels: qs.get('panels') === '1' };
let W = 1, H = 1, dpr = 1, rect = { x: 0, y: 0, w: 1, h: 1 }, table = null;
let time = 0, last = performance.now(), fps = 60;
const ema = { bg: 0, scene: 0, post: 0 };

// même logique que ui.layout() du jeu (version simplifiée)
function layout() {
  const ratio = TW / TH;
  let x, y, w, h;
  if (W / H > 0.82) {
    h = H - 16; w = h * ratio;
    if (w > W * 0.62) { w = W * 0.62; h = w / ratio; }
    x = (W - w) / 2; y = (H - h) / 2;
  } else {
    const top = 56, bot = 70;
    h = H - top - bot; w = h * ratio;
    if (w > W) { w = W; h = w / ratio; }
    x = (W - w) / 2; y = top + (H - top - bot - h) / 2;
  }
  return { x, y, w, h };
}

function resize() {
  W = window.innerWidth; H = window.innerHeight;
  dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
  canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
  rect = layout();
  post.resize(W, H, dpr);
  back.resize(W, H, dpr);
  table = null;
  placePanels();
}

function placePanels() {
  const pl = document.getElementById('pl'), pr = document.getElementById('pr');
  const side = rect.x - 14;
  if (!S.panels || side < 170) { pl.style.display = pr.style.display = 'none'; return; }
  const pw = Math.min(330, side - 6);
  pl.style.cssText = `display:block;left:${Math.max(8, rect.x - pw - 10)}px;width:${pw}px`;
  pr.style.cssText = `display:block;left:${rect.x + rect.w + 10}px;width:${Math.min(pw, W - rect.x - rect.w - 18)}px;top:64px`;
}

// ------------------------------------------------------------ faux plateau
function playfield(g) {
  g.beginPath();
  g.moveTo(40, 1100); g.lineTo(40, 260);
  g.arc(300, 260, 260, Math.PI, 0);
  g.lineTo(560, 1100); g.closePath();
}

function buildTable() {
  const s = rect.w / TW * dpr;
  const c = document.createElement('canvas');
  c.width = Math.round(TW * s); c.height = Math.round(TH * s);
  const g = c.getContext('2d');
  g.setTransform(s, 0, 0, s, 0, 0);
  g.fillStyle = '#070a14'; g.fillRect(0, 0, TW, TH);
  g.save(); playfield(g); g.clip();
  const gr = g.createLinearGradient(0, 0, 0, TH);
  gr.addColorStop(0, '#121a33'); gr.addColorStop(0.55, '#0d1328'); gr.addColorStop(1, '#070b18');
  g.fillStyle = gr; g.fillRect(0, 0, TW, TH);
  g.strokeStyle = 'rgba(41,227,255,0.05)'; g.lineWidth = 1;
  for (let r = 0; r < 30; r++) for (let q = 0; q < 14; q++) {
    const cx = q * 45 + (r % 2 ? 22 : 0), cy = r * 39;
    g.beginPath();
    for (let k = 0; k < 6; k++) { const a = Math.PI / 6 + k * Math.PI / 3; g[k ? 'lineTo' : 'moveTo'](cx + Math.cos(a) * 25, cy + Math.sin(a) * 25); }
    g.closePath(); g.stroke();
  }
  g.restore();
  // rails néon
  const neon = (col, w, path) => {
    g.save(); g.globalCompositeOperation = 'lighter';
    g.strokeStyle = col; g.globalAlpha = 0.25; g.lineWidth = w * 4; path(); g.stroke();
    g.globalAlpha = 1; g.lineWidth = w; path(); g.stroke(); g.restore();
  };
  neon('#29e3ff', 3, () => playfield(g));
  neon('#ff3df2', 3, () => { g.beginPath(); g.arc(300, 300, 190, Math.PI * 1.05, Math.PI * 1.6); });
  neon('#ffb52e', 3, () => { g.beginPath(); g.arc(300, 300, 190, Math.PI * 1.4, Math.PI * 1.95); });
  neon('#5dff8f', 2.5, () => { g.beginPath(); g.moveTo(110, 820); g.lineTo(110, 900); g.lineTo(200, 960); g.closePath(); });
  neon('#5dff8f', 2.5, () => { g.beginPath(); g.moveTo(490, 820); g.lineTo(490, 900); g.lineTo(400, 960); g.closePath(); });
  neon('#29e3ff', 2, () => { g.beginPath(); g.moveTo(70, 760); g.lineTo(70, 930); g.lineTo(215, 1010); });
  neon('#29e3ff', 2, () => { g.beginPath(); g.moveTo(530, 760); g.lineTo(530, 930); g.lineTo(385, 1010); });
  // couloirs du haut
  for (let i = 0; i < 4; i++) {
    const x = 210 + i * 60;
    g.strokeStyle = '#5d6f99'; g.lineWidth = 3;
    g.beginPath(); g.moveTo(x, 120); g.lineTo(x, 180); g.stroke();
  }
  // textes du plateau
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = `900 30px ${FONT_D}`; g.fillStyle = 'rgba(41,227,255,0.55)';
  g.fillText('LUMEN//NULL', 300, 600);
  g.font = `700 15px ${FONT}`; g.fillStyle = 'rgba(216,232,255,0.7)';
  g.fillText('RAMPE ORBITALE', 160, 210);
  g.fillText('SECTEUR HANGAR', 440, 210);
  g.font = `700 18px ${FONT_D}`; g.fillStyle = '#ffd84a';
  g.fillText('JACKPOT', 300, 700);
  g.font = `600 13px ${FONT}`; g.fillStyle = '#7f93b8';
  g.fillText('×2   ×3   ×5', 300, 730);
  g.fillText('CORTEX-9 · NIVEAU DE SÉCURITÉ 1', 300, 1060);
  return c;
}

function drawFlipper(g, x, y, ang, dir) {
  g.save(); g.translate(x, y); g.scale(dir, 1); g.rotate(ang);
  const L = 86;
  const p = new Path2D();
  p.arc(0, 0, 15, Math.PI / 2, -Math.PI / 2); p.lineTo(L, -8); p.arc(L, 0, 8, -Math.PI / 2, Math.PI / 2); p.closePath();
  const gr = g.createLinearGradient(0, -15, 0, 15);
  gr.addColorStop(0, '#d8e4f5'); gr.addColorStop(0.45, '#7c8db0'); gr.addColorStop(1, '#2a3550');
  g.fillStyle = gr; g.fill(p);
  g.strokeStyle = '#29e3ff'; g.lineWidth = 2.5; g.stroke(p);
  g.restore();
}

const bumpers = [{ x: 220, y: 360, c: '#29e3ff', f: 0 }, { x: 380, y: 360, c: '#ff3df2', f: 0 }, { x: 300, y: 480, c: '#ffd84a', f: 0 }];
const trail = [];
let popT = 0, popX = 0, popY = 0;

function drawScene() {
  if (!table) table = buildTable();
  const s = rect.w / TW;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.drawImage(table, rect.x * dpr, rect.y * dpr, rect.w * dpr, rect.h * dpr);
  ctx.setTransform(s * dpr, 0, 0, s * dpr, rect.x * dpr, rect.y * dpr);
  // bille (trajectoire de Lissajous)
  const bx = 300 + Math.sin(time * 1.3) * 200, by = 560 + Math.sin(time * 0.9 + 1) * 380;
  trail.push(bx, by); if (trail.length > 24) trail.splice(0, 2);
  for (const b of bumpers) {
    if (Math.hypot(bx - b.x, by - b.y) < 70 && b.f <= 0) { b.f = 1; popT = 1; popX = b.x; popY = b.y - 50; }
    b.f = Math.max(0, b.f - 1 / 30);
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.35 + 0.5 * b.f + 0.1 * Math.sin(time * 4 + b.x);
    ctx.drawImage(glowSprite(b.c, 64), b.x - 70, b.y - 70, 140, 140);
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
    ctx.fillStyle = '#0c1424'; ctx.beginPath(); ctx.arc(b.x, b.y, 32, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = b.c; ctx.lineWidth = 4; ctx.stroke();
    ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(b.x, b.y, 22, 0, Math.PI * 2); ctx.stroke();
    ctx.font = `700 15px ${FONT_D}`; ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('100', b.x, b.y + 1);
  }
  // cibles
  for (let i = 0; i < 4; i++) {
    const lit = Math.sin(time * 2 + i) > 0;
    ctx.fillStyle = lit ? '#ffb52e' : '#4a3510';
    ctx.fillRect(225 + i * 40, 600 - 80, 28, 10);
    if (lit) { ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.5; ctx.drawImage(glowSprite('#ffb52e', 64), 225 + i * 40 - 16, 505, 60, 40); ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1; }
  }
  // batteurs
  const up = Math.sin(time * 3) > 0.7;
  drawFlipper(ctx, 205, 1010, up ? -0.45 : 0.44, 1);
  drawFlipper(ctx, 395, 1010, up ? -0.45 : 0.44, -1);
  // traînée et bille chromée
  ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round';
  for (let i = 2; i < trail.length; i += 2) {
    ctx.globalAlpha = i / trail.length * 0.5; ctx.strokeStyle = '#29e3ff'; ctx.lineWidth = 18 * i / trail.length;
    ctx.beginPath(); ctx.moveTo(trail[i - 2], trail[i - 1]); ctx.lineTo(trail[i], trail[i + 1]); ctx.stroke();
  }
  ctx.globalAlpha = 0.6; ctx.drawImage(glowSprite('#29e3ff', 64), bx - 34, by - 34, 68, 68);
  ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
  const gr = ctx.createRadialGradient(bx - 4.5, by - 5, 1, bx, by, 13);
  gr.addColorStop(0, '#fff'); gr.addColorStop(0.35, '#e8fbff'); gr.addColorStop(0.75, '#29e3ff'); gr.addColorStop(1, '#0b2a40');
  ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(bx, by, 13, 0, Math.PI * 2); ctx.fill();
  // textes dynamiques (lisibilité)
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.font = `700 26px ${FONT_D}`; ctx.fillStyle = '#ffffff';
  ctx.fillText('1 234 560', 300, 70);
  ctx.font = `600 16px ${FONT}`; ctx.fillStyle = '#9fb4d8';
  ctx.fillText('Bille 2 / 3 · Multiplicateur ×2', 300, 100);
  if (popT > 0) {
    popT -= 1 / 60;
    ctx.globalAlpha = Math.min(1, popT * 2);
    ctx.font = `700 20px ${FONT}`; ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(0,0,0,0.75)';
    ctx.strokeText('+5 000', popX, popY - (1 - popT) * 30); ctx.fillStyle = '#ffd84a'; ctx.fillText('+5 000', popX, popY - (1 - popT) * 30);
    ctx.globalAlpha = 1;
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
}

function oldBackground() {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#05050f'; ctx.fillRect(0, 0, canvas.width, canvas.height);
}

function frame(dt) {
  const info = { rect, mood: S.mood, intensity: S.intensity, level: S.level };
  let t0 = performance.now();
  if (S.back) back.draw(ctx, time, info); else oldBackground();
  let t1 = performance.now();
  drawScene();
  let t2 = performance.now();
  if (S.post) post.apply(ctx, canvas, dt, info);
  let t3 = performance.now();
  ema.bg = ema.bg * 0.95 + (t1 - t0) * 0.05;
  ema.scene = ema.scene * 0.95 + (t2 - t1) * 0.05;
  ema.post = ema.post * 0.95 + (t3 - t2) * 0.05;
}

function loop(now) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  time += dt;
  fps = fps * 0.95 + (1 / Math.max(dt, 0.001)) * 0.05;
  post.setFps(fps);
  frame(dt);
  loop.n = (loop.n || 0) + 1;
  if (loop.n % 15 === 1) {
    document.getElementById('stats').textContent =
      `${W}×${H} @${dpr}  fps ${fps.toFixed(0)}  qualité ${post.quality}${post.auto ? ' (auto)' : ''}\n` +
      `CPU ms — backdrop ${ema.bg.toFixed(2)}  scène ${ema.scene.toFixed(2)}  postfx ${ema.post.toFixed(2)}`;
  }
  requestAnimationFrame(loop);
}

// ------------------------------------------------------------ mesure CPU+GPU
// N images enchaînées sans attendre l'écran, puis une lecture d'1 px qui force la fin du travail GPU
const probe = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
function sync() { probe.drawImage(canvas, 0, 0, 1, 1, 0, 0, 1, 1); probe.getImageData(0, 0, 1, 1); }
function run(n, cfg) {
  const save = { back: S.back, post: S.post, q: post.quality, auto: post.auto };
  S.back = cfg.back; S.post = cfg.post; post.auto = false; if (cfg.q !== undefined) post.quality = cfg.q;
  for (let i = 0; i < 8; i++) { if (cfg.glitch) post.glitch(1, 1); time += 1 / 60; frame(1 / 60); }
  // médiane de 5 essais (le GPU peut être partagé avec d'autres onglets)
  const res = [];
  for (let k = 0; k < 5; k++) {
    sync();
    const t0 = performance.now();
    for (let i = 0; i < n; i++) { if (cfg.glitch) post.glitch(1, 1); time += 1 / 60; frame(1 / 60); }
    sync();
    res.push((performance.now() - t0) / n);
  }
  const ms = res.sort((a, b) => a - b)[2];
  S.back = save.back; S.post = save.post; post.quality = save.q; post.auto = save.auto;
  return ms;
}
function bench() {
  const n = 40, out = [];
  const base = run(n, { back: false, post: false });
  const bg = run(n, { back: true, post: false });
  out.push(`scène seule ${base.toFixed(2)} ms/image`);
  out.push(`+ backdrop  ${(bg - base).toFixed(2)} ms`);
  for (const q of [2, 1, 0]) out.push(`+ postfx q${q} ${(run(n, { back: true, post: true, q }) - bg).toFixed(2)} ms`);
  out.push(`+ postfx q2 + glitch plein ${(run(n, { back: true, post: true, q: 2, glitch: true }) - bg).toFixed(2)} ms`);
  const txt = `Bench ${canvas.width}×${canvas.height} (CPU+GPU, médiane de 5 × ${n} images) :\n` + out.join('\n');
  document.getElementById('bench').textContent = txt;
  console.log(txt);
  return txt;
}

// ------------------------------------------------------------ commandes
function setMood(m) { S.mood = m; document.querySelectorAll('[data-m]').forEach(b => b.classList.toggle('on', b.dataset.m === m)); }
const actions = {
  glitch: () => post.glitch(0.6, 0.3),
  glitch2: () => post.glitch(1, 0.6),
  'pulse-c': () => post.pulse('#29e3ff', 1),
  'pulse-g': () => post.pulse('#ffd84a', 1),
  'pulse-m': () => post.pulse('#ff3df2', 1),
  bench: () => setTimeout(bench, 30),
  level: () => { S.level++; },
};
document.getElementById('ui').addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  if (b.id === 'toggle') { const ui = document.getElementById('ui'); ui.classList.toggle('min'); b.textContent = ui.classList.contains('min') ? '+' : '–'; return; }
  if (b.dataset.a) actions[b.dataset.a]();
  if (b.dataset.m) setMood(b.dataset.m);
  if (b.dataset.s) { settings[b.dataset.s] = !settings[b.dataset.s]; b.classList.toggle('on', settings[b.dataset.s]); }
  if (b.dataset.t) { S[b.dataset.t] = !S[b.dataset.t]; b.classList.toggle('on', S[b.dataset.t]); if (b.dataset.t === 'panels') placePanels(); }
  if (b.dataset.q) {
    document.querySelectorAll('[data-q]').forEach(x => x.classList.toggle('on', x === b));
    if (b.dataset.q === 'auto') post.auto = true; else { post.auto = false; post.quality = +b.dataset.q; }
  }
});
document.getElementById('inten').addEventListener('input', (e) => { S.intensity = +e.target.value; });
window.addEventListener('keydown', (e) => {
  const k = e.key.toLowerCase();
  if (k === 'g') actions.glitch(); else if (k === 'b') actions.glitch2(); else if (k === 'p') actions['pulse-g']();
  else if (k === '1') setMood('calm'); else if (k === '2') setMood('hot'); else if (k === '3') setMood('null');
});
window.addEventListener('resize', resize);

for (const [k, v] of Object.entries(settings)) document.querySelector(`[data-s="${k}"]`).classList.toggle('on', v);
document.querySelector('[data-t="post"]').classList.toggle('on', S.post);
document.querySelector('[data-t="back"]').classList.toggle('on', S.back);
document.querySelector('[data-t="panels"]').classList.toggle('on', S.panels);
setMood(S.mood);
if (qs.get('ui') === '0') document.getElementById('ui').classList.add('min');
resize();
// avance de n images à pas fixe (utile quand l'onglet est masqué et que rAF est ralenti)
function step(n = 1, dt = 1 / 60) { for (let i = 0; i < n; i++) { time += dt; frame(dt); } }
// accès console / automatisation
window.__fx = { post, back, S, settings, bench, setMood, frame, step, actions };
requestAnimationFrame(loop);
