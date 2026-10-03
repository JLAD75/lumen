import { TABLE_W, TABLE_H, COLORS } from '../config.js';
import { lerp, mulberry32, rgba, clamp, TAU } from '../util/math.js';
import { glowSprite } from './sprites.js';
import { FX } from './fx.js';
import { TableArt, drawPlate, drawStaticPrims, drawSling } from './tableArt.js';
import { PostFX } from './postfx.js';
import { Backdrop } from './backdrop.js';

export const FONT = '"Rajdhani", "Segoe UI", system-ui, sans-serif';
export const FONT_D = '"Orbitron", "Rajdhani", "Segoe UI", sans-serif';

const BALL_COLORS = ['#29e3ff', '#ff3df2', '#ffd84a', '#5dff8f'];

// Rendu Canvas 2D : caméra monde, calques statiques pré-rendus, scènes, effets.
export class Renderer {
  // canvas : plateau (transparent, éventuellement incliné en CSS) ; bgCanvas : fond plein écran
  // (mégapole animée) ; fxEl : calque écran HTML (balayage, vignette, lueurs de bord, flash).
  constructor(canvas, settings, bgCanvas = null, fxEl = null) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.bgCanvas = bgCanvas;
    this.bgCtx = bgCanvas ? bgCanvas.getContext('2d') : null;
    this.fxEl = fxEl;
    this.ov = fxEl ? { edge: fxEl.querySelector('.edge'), frame: fxEl.querySelector('.frame'), flash: fxEl.querySelector('.flash'), vig: fxEl.querySelector('.vig'), last: {} } : null;
    this.pulses = [];
    this.backdrop = bgCanvas ? new Backdrop(settings) : null;
    this.post = new PostFX(settings);       // contenu du plateau : bloom, glitch
    this.screenRect = null;
    this.mood = 'calm'; this.intensity = 0;
    this.settings = settings;
    this.fx = new FX(settings);
    this.dpr = 1; this.W = 1; this.H = 1;
    this.view = { x: 0, y: 0, w: 1, h: 1, scale: 1 };
    this.layers = new Map();
    this.bg = null;
    this.time = 0;
    this.alpha = 1;
    this.font = FONT;
    this.fontD = FONT_D;
    this.art = new TableArt(this);
    this.warpSeeds = [];
    const rnd = mulberry32(7);
    for (let i = 0; i < 70; i++) this.warpSeeds.push({ a: rnd() * TAU, s: 0.3 + rnd() * 0.7, o: rnd() });
    this.lastFrame = performance.now();
    this.fpsAvg = 60;
    this.dprCap = 2;
    // étendue du monde affiché (le plateau long commence au-dessus de y = 0)
    this.bounds = { x0: 0, y0: 0, w: TABLE_W, h: TABLE_H };
  }

  setBounds(b) {
    if (b.x0 === this.bounds.x0 && b.y0 === this.bounds.y0 && b.w === this.bounds.w && b.h === this.bounds.h) return;
    this.bounds = { ...b };
    this.layers.clear();
  }

  // view : rectangle (px CSS) où le plateau 600×1100 est affiché, échelle uniforme.
  resize(W, H, view) {
    const dpr = Math.min(window.devicePixelRatio || 1, this.dprCap);
    this.dpr = dpr; this.W = W; this.H = H;
    this.canvas.width = Math.round(W * dpr);
    this.canvas.height = Math.round(H * dpr);
    this.canvas.style.width = W + 'px';
    this.canvas.style.height = H + 'px';
    this.view = view;
    this.layers.clear();
    this.post.resize(W, H, dpr);
  }

  // Fond et calque écran plein écran (canevas séparés, jamais inclinés).
  resizeBackdrop(W, H, screenRect) {
    const dpr = Math.min(window.devicePixelRatio || 1, this.dprCap);
    this.SW = W; this.SH = H;
    if (screenRect) this.screenRect = screenRect;
    const c = this.bgCanvas;
    if (c) {
      c.width = Math.round(W * dpr); c.height = Math.round(H * dpr);
      c.style.width = W + 'px'; c.style.height = H + 'px';
    }
    if (this.backdrop) this.backdrop.resize(W, H, dpr);
    this.bg = null;
    // vignette centrée sur le plateau, cadre néon autour de lui
    const ov = this.ov, R = this.screenRect;
    if (ov && R) {
      const cx = R.x + R.w / 2, cy = R.y + R.h / 2;
      ov.vig.style.background = `radial-gradient(ellipse ${Math.max(R.w * 0.9, W * 0.55)}px ${Math.max(R.h * 0.75, H * 0.6)}px at ${cx}px ${cy}px, rgba(0,0,0,0) 55%, rgba(0,0,0,0.5) 100%)`;
      Object.assign(ov.frame.style, { left: (R.x - 6) + 'px', top: (R.y - 6) + 'px', width: (R.w + 12) + 'px', height: (R.h + 12) + 'px' });
    }
  }

  // Effets d'écran déclenchés par le jeu.
  glitch(k = 1, dur = 0.35) { this.post.glitch(k, dur); }
  pulse(color, k = 1) {
    this.post.pulse(color, k);
    this.pulses.push({ color, k, t: 0, life: 0.5 + 0.3 * Math.min(1, k) });
    if (this.pulses.length > 4) this.pulses.shift();
  }

  // calque statique en coordonnées monde (couvre l'étendue du monde), pré-rendu à la résolution d'affichage
  layer(key, drawFn) {
    let l = this.layers.get(key);
    if (l) return l;
    const s = this.view.scale * this.dpr * (this.layerBoost || 1), B = this.bounds;
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(B.w * s));
    c.height = Math.max(1, Math.round(B.h * s));
    const g = c.getContext('2d');
    g.setTransform(s, 0, 0, s, -B.x0 * s, -B.y0 * s);
    drawFn(g, this);
    l = c;
    this.layers.set(key, l);
    return l;
  }

  dropLayer(key) { this.layers.delete(key); }

  _background() {
    if (this.bg) return this.bg;
    const c = document.createElement('canvas');
    const src = this.bgCanvas || this.canvas;
    c.width = src.width; c.height = src.height;
    const g = c.getContext('2d');
    const W = c.width, H = c.height;
    const grd = g.createLinearGradient(0, 0, 0, H);
    grd.addColorStop(0, '#05030f'); grd.addColorStop(0.5, '#070a1a'); grd.addColorStop(1, '#02030a');
    g.fillStyle = grd; g.fillRect(0, 0, W, H);
    const rnd = mulberry32(42);
    // nébuleuses
    const neb = [['#3a1d6e', 0.22], ['#0d4a6e', 0.2], ['#6e1d4a', 0.12]];
    for (let i = 0; i < 6; i++) {
      const [col, a] = neb[i % 3];
      const x = rnd() * W, y = rnd() * H, r = (0.25 + rnd() * 0.45) * Math.max(W, H);
      const ng = g.createRadialGradient(x, y, 0, x, y, r);
      ng.addColorStop(0, rgba(col, a)); ng.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = ng; g.fillRect(0, 0, W, H);
    }
    // étoiles
    const n = Math.round(W * H / 2600);
    for (let i = 0; i < n; i++) {
      const x = rnd() * W, y = rnd() * H, s = rnd();
      g.globalAlpha = 0.25 + s * 0.75;
      g.fillStyle = s > 0.92 ? '#bfe3ff' : s > 0.85 ? '#ffd9b0' : '#ffffff';
      const r = (s > 0.96 ? 1.6 : s > 0.7 ? 1 : 0.6) * this.dpr;
      g.fillRect(x, y, r, r);
    }
    g.globalAlpha = 1;
    this.bg = c;
    return c;
  }

  // transformation monde -> écran pour une caméra donnée
  worldTransform(cam, shake = true) {
    const v = this.view, d = this.dpr;
    const s = v.scale * cam.zoom;
    let ox = v.x + v.w / 2 - cam.x * s;
    let oy = v.y + v.h / 2 - cam.y * s;
    if (shake) { ox += this.fx.shakeX * v.scale; oy += this.fx.shakeY * v.scale; }
    this.ctx.setTransform(s * d, 0, 0, s * d, ox * d, oy * d);
    this.camScale = s;
  }

  screenTransform() { this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0); }

  // dessine un calque statique à sa place dans le monde
  blitLayer(ctx, l) { const B = this.bounds; ctx.drawImage(l, B.x0, B.y0, B.w, B.h); }

  render(game) {
    if (game.table.bounds) this.setBounds(game.table.bounds);
    const now = performance.now();
    const dt = Math.min(0.1, (now - this.lastFrame) / 1000);
    this.lastFrame = now;
    this.time += dt;
    this.fpsAvg = this.fpsAvg * 0.95 + (1 / Math.max(dt, 0.001)) * 0.05;
    const ctx = this.ctx;
    this._mood(game);
    const info = { rect: this.screenRect, mood: this.mood, intensity: this.intensity, level: game.level };
    if (this.backdrop) this.backdrop.draw(this.bgCtx, this.time, info);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    if (this.bgCanvas) ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    else ctx.drawImage(this._background(), 0, 0);

    let sceneName = game.scene === 'minigame' ? 'minigame' : 'table';
    let cam = this._baseCam(game, dt);
    let tv = null;
    if (game.scene === 'transition' && game.transition) {
      tv = game.transition.view(cam);
      sceneName = tv.scene;
      cam = tv.cam;
    }
    const mg = game.minigame || (game.transition && game.transition.minigame);

    if (tv && tv.iris) {
      // phase 2 : tunnel de transfert puis ouverture circulaire de la nouvelle scène
      this._warp(tv, cam, game.transition.color, 1);
      this.worldTransform(cam);
      ctx.save();
      ctx.beginPath();
      ctx.arc(tv.iris.x, tv.iris.y, tv.iris.r, 0, TAU);
      ctx.clip();
      this._scene(game, sceneName, mg);
      ctx.restore();
      this.worldTransform(cam);
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = game.transition.color;
      ctx.lineWidth = 6;
      ctx.globalAlpha = 0.8 * (1 - tv.iris.r / 1400);
      ctx.beginPath(); ctx.arc(tv.iris.x, tv.iris.y, Math.max(1, tv.iris.r), 0, TAU); ctx.stroke();
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
      this._core(tv.core, game.transition.color);
    } else {
      this.worldTransform(cam);
      this._scene(game, sceneName, mg);
      if (tv) {
        this._core(tv.core, game.transition.color);
        this._warp(tv, cam, game.transition.color, tv.warp);
      }
    }

    // effets en coordonnées monde
    this.worldTransform(cam);
    this.fx.draw(ctx, this.font);

    if (game.state === 'play' && game.resumeT > 0) this._countdown(game.resumeT);
    // post-traitement du plateau (bloom, glitch)
    const fps = this.fpsAvg;
    this.post.setFps(fps);
    this.post.apply(ctx, this.canvas, dt, { ...info, part: 'content' });
    // calque écran (HTML) : flash, fondu, bords néon selon l'ambiance, cadre des impulsions
    if (this.ov) {
      this._overlay(dt, tv);
    } else {
      this.screenTransform();
      if (this.fx.flashA > 0.01) {
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = this.fx.flashA * 0.6;
        ctx.fillStyle = this.fx.flashColor;
        ctx.fillRect(0, 0, this.W, this.H);
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = 1;
      }
    }
  }

  _overlay(dt, tv) {
    const ov = this.ov, L = ov.last;
    const set = (el, key, prop, v) => { if (L[key] !== v) { L[key] = v; el.style[prop] = v; } };
    // flash (événements) ou fondu noir (transition en mouvements réduits)
    let fa = 0, fc = this.fx.flashColor;
    if (this.fx.flashA > 0.01) fa = Math.min(0.6, this.fx.flashA * 0.45);
    if (tv && tv.fade > 0) { fa = clamp(tv.fade, 0, 1) * 0.85; fc = '#000'; }
    set(ov.flash, 'fa', 'opacity', fa.toFixed(2));
    if (fa > 0) set(ov.flash, 'fc', 'background', fc);
    // bords : ambiance (effervescence / NULL) et impulsions
    for (let i = this.pulses.length - 1; i >= 0; i--) { const p = this.pulses[i]; p.t += dt; if (p.t >= p.life) this.pulses.splice(i, 1); }
    let ea = 0, ec = '#29e3ff', fr = 0, frc = '#29e3ff';
    const rfx = this.settings.reducedFx ? 0.5 : 1;
    if (this.mood === 'hot') { ea = (0.25 + 0.3 * this.intensity) * rfx; ec = Math.sin(this.time * 1.7) > 0 ? '#29e3ff' : '#ff3df2'; }
    if (this.mood === 'null') { ea = (0.4 + 0.2 * Math.sin(this.time * 3.1)) * rfx; ec = '#ff2050'; }
    for (const p of this.pulses) {
      const u = p.t / p.life, env = (p.t < 0.05 ? p.t / 0.05 : 1) * (1 - u) * (1 - u);
      const a = Math.min(1, p.k) * env * rfx;
      if (a > ea) { ea = a; ec = p.color; }
      if (a > fr) { fr = a; frc = p.color; }
    }
    set(ov.edge, 'ea', 'opacity', ea.toFixed(2));
    if (ea > 0) { if (L.ec !== ec) { L.ec = ec; ov.edge.style.setProperty('--ec', ec); } }
    set(ov.frame, 'fr', 'opacity', fr.toFixed(2));
    if (fr > 0) { if (L.frc !== frc) { L.frc = frc; ov.frame.style.setProperty('--fc', frc); } }
  }

  // Ambiance pour le décor et le post-traitement : NULL, effervescence ou calme.
  _mood(game) {
    const t = game.table, msg = game.lumen && game.lumen.current;
    let mood = 'calm';
    if ((msg && msg.persona === 'null') || (game.minigame && game.minigame.sector === 'core')) mood = 'null';
    else if (t.multiball || game.bonus.mult >= 3 || t.combo.count >= 4 || (game.minigame && game.minigame.timeLeft < 10)) mood = 'hot';
    this.mood = mood;
    const target = Math.min(1, t.combo.count / 8 + (game.bonus.mult - 1) * 0.15 + (t.multiball ? 0.4 : 0));
    this.intensity += (target - this.intensity) * 0.05;
  }

  // Caméra de base : plateau entier, ou suivi vertical de la bille la plus basse
  // (petits écrans en paysage). Les batteurs restent visibles quand la bille descend.
  _baseCam(game, dt) {
    const v = this.view, B = this.bounds;
    if (this.debugCam) return this.debugCam;   // inspection visuelle (outils de développement)
    const cx = B.x0 + B.w / 2, cy = B.y0 + B.h / 2;
    if (!v.follow) { this.camY = cy; return { x: cx, y: cy, zoom: 1 }; }
    const half = v.h / v.scale / 2;
    let target = B.y0 + B.h - half;
    const balls = game.scene === 'minigame' && game.minigame ? game.minigame.world.balls : game.table.world.balls;
    let lowest = -1;
    for (const b of balls) if (b.y > lowest) lowest = b.y;
    if (lowest >= 0 && game.state === 'play') target = lowest + half * 0.25;
    target = clamp(target, B.y0 + half, B.y0 + B.h - half);
    if (this.camY === undefined) this.camY = target;
    this.camY += (target - this.camY) * Math.min(1, dt * 5);
    return { x: cx, y: this.camY, zoom: 1 };
  }

  _scene(game, name, mg) {
    const ctx = this.ctx;
    if (name === 'table') {
      this.art.draw(ctx, game.table, game);
    } else if (mg) {
      this.blitLayer(ctx, this.layer('mg-' + mg.sector + '-' + mg.level, (g) => this._arenaStatic(g, mg)));
      mg.render(ctx, this, game);
      for (const f of mg.world.flippers) this.drawFlipper(f, mg.color);
      for (const b of mg.world.balls) this.drawBall(b, 0);
      if (mg.pendingBall && mg.state === 'relaunch' && !mg.world.balls.includes(mg.pendingBall)) this.drawBall(mg.pendingBall, 0);
      if (mg.renderTop) mg.renderTop(ctx, this, game);
      if (this.bounds.y0 < 0) this._arenaHeader(ctx, mg);
    }
  }

  _arenaStatic(g, mg) {
    if (this.bounds.y0 < 0) this._arenaHeaderStatic(g, mg);
    drawPlate(g, mg.sector);
    if (mg.drawStatic) mg.drawStatic(g, this);
    drawStaticPrims(g, mg.world, mg.color);
    if (mg.frame) { drawSling(g, mg.frame.slingL, mg.color, 0, true); drawSling(g, mg.frame.slingR, mg.color, 0, true); }
  }

  // Bandeau au-dessus de l'arène (le monde du plateau est plus haut que les arènes) :
  // écran intégré au plateau avec titre, progression et chrono du minijeu.
  _arenaHeaderStatic(g, mg) {
    const B = this.bounds, col = mg.color;
    const grd = g.createLinearGradient(0, B.y0, 0, 20);
    grd.addColorStop(0, '#0d0a18'); grd.addColorStop(1, '#05040a');
    g.fillStyle = grd; g.fillRect(0, B.y0, 600, 20 - B.y0);
    g.fillStyle = '#1b1e28'; g.fillRect(0, B.y0, 20, 20 - B.y0); g.fillRect(580, B.y0, 20, 20 - B.y0);
    // écran
    g.fillStyle = '#020306';
    g.beginPath(); g.roundRect ? g.roundRect(34, B.y0 + 16, 532, 118, 10) : g.rect(34, B.y0 + 16, 532, 118); g.fill();
    g.strokeStyle = rgba(col, 0.6); g.lineWidth = 2; g.stroke();
    g.strokeStyle = '#7d8aa3'; g.lineWidth = 1; g.strokeRect(28, B.y0 + 10, 544, 130);
    for (const [x, y] of [[40, B.y0 + 22], [560, B.y0 + 22], [40, B.y0 + 128], [560, B.y0 + 128]]) {
      g.fillStyle = '#8f9bb3'; g.beginPath(); g.arc(x, y, 2.2, 0, TAU); g.fill();
    }
    // trame de l'écran
    g.fillStyle = rgba(col, 0.05);
    for (let y = B.y0 + 20; y < B.y0 + 132; y += 3) g.fillRect(36, y, 528, 1);
  }

  _arenaHeader(ctx, mg) {
    const B = this.bounds, h = mg.hud(), col = h.color;
    const y0 = B.y0 + 16;
    const t = this.time;
    this.text(h.title, 300, y0 + 26, 22, col, 'center', 1, true);
    const prog = h.relaunch ? 'RELANCE…' : h.progress;
    this.text(prog, 300, y0 + 56, 16, '#e8f4ff', 'center', 0.95);
    // chrono
    const u = Math.max(0, h.timeLeft) / h.timeLimit;
    const hurry = h.timeLeft < 10;
    ctx.fillStyle = 'rgba(255,255,255,0.08)'; ctx.fillRect(60, y0 + 76, 480, 10);
    ctx.fillStyle = hurry ? (Math.sin(t * 14) > 0 ? '#ff4060' : '#ffb52e') : col;
    ctx.fillRect(60, y0 + 76, 480 * u, 10);
    this.glow(60 + 480 * u, y0 + 81, 40, ctx.fillStyle, 0.6);
    this.text(`${Math.ceil(Math.max(0, h.timeLeft))} s`, 64, y0 + 103, 15, hurry ? '#ff7088' : '#bfe9ff', 'left', 1, true);
    const note = h.perk ? 'AVANTAGE : ' + h.perk.name : h.objective;
    this.text(note, 536, y0 + 103, 12, h.perk ? col : '#9fb3d6', 'right', 0.9);
  }

  _core(core, color) {
    if (!core) return;
    const ctx = this.ctx;
    const s = core.scale;
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.9;
    ctx.drawImage(glowSprite(color, 64), core.x - 50 * s, core.y - 50 * s, 100 * s, 100 * s);
    ctx.drawImage(glowSprite('#ffffff', 64), core.x - 20 * s, core.y - 20 * s, 40 * s, 40 * s);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
  }

  _warp(tv, cam, color, k) {
    if (k <= 0.01) return;
    const ctx = this.ctx;
    this.screenTransform();
    const v = this.view;
    const cx = v.x + v.w / 2, cy = v.y + v.h / 2;
    const R = Math.hypot(this.W, this.H);
    ctx.globalCompositeOperation = 'lighter';
    const t = this.time;
    const n = this.settings.reducedFx ? 24 : this.warpSeeds.length;
    ctx.lineCap = 'round';
    for (let i = 0; i < n; i++) {
      const w = this.warpSeeds[i];
      const u = (w.o + t * (0.8 + w.s * 1.6)) % 1;
      const r0 = R * u * u * 0.9, r1 = r0 + R * 0.12 * w.s * (0.4 + u);
      ctx.globalAlpha = k * (0.25 + 0.6 * u) * w.s;
      ctx.strokeStyle = i % 3 === 0 ? '#ffffff' : color;
      ctx.lineWidth = 1 + 3 * u * w.s;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(w.a) * r0, cy + Math.sin(w.a) * r0);
      ctx.lineTo(cx + Math.cos(w.a) * r1, cy + Math.sin(w.a) * r1);
      ctx.stroke();
    }
    ctx.globalAlpha = k * 0.5;
    ctx.drawImage(glowSprite(color, 128), cx - 160, cy - 160, 320, 320);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
  }

  _countdown(t) {
    const ctx = this.ctx;
    const v = this.view;
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(0, 0, this.W, this.H);
    ctx.font = `700 ${Math.round(48 * Math.max(0.7, v.scale))}px ${this.fontD}`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = '#29e3ff';
    ctx.fillText('REPRISE', v.x + v.w / 2, v.y + v.h * 0.45);
  }

  // ------------------------------------------------------------ primitives communes
  glow(x, y, size, color, a = 1) {
    const ctx = this.ctx;
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = a;
    ctx.drawImage(glowSprite(color, 64), x - size / 2, y - size / 2, size, size);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
  }

  text(str, x, y, size, color, align = 'center', a = 1, display = false) {
    const ctx = this.ctx;
    ctx.globalAlpha = a;
    ctx.font = `700 ${size}px ${display ? this.fontD : this.font}`;
    ctx.textAlign = align; ctx.textBaseline = 'middle';
    ctx.fillStyle = color;
    ctx.fillText(str, x, y);
    ctx.globalAlpha = 1;
  }

  // Bille d'acier chromé : ombre portée, reflets de l'environnement, traînée néon.
  drawBall(b, colorIdx) {
    const ctx = this.ctx;
    const a = this.alpha;
    const x = b.state === 'free' ? lerp(b.px, b.x, a) : b.x;
    const y = b.state === 'free' ? lerp(b.py, b.y, a) : b.y;
    const raised = b.layer === 1 || b.layer === 2;
    const s = b.scale * (raised ? 1.12 : 1);
    if (s <= 0.02) return;
    const col = BALL_COLORS[Math.floor((b.hue || 0) / 70) % BALL_COLORS.length] || BALL_COLORS[colorIdx || 0];
    const tint = b.phase || b.pierce ? '#b07bff' : col;
    const r = b.r * s;
    // traînée
    const tr = b.trail;
    if (tr.length >= 6 && !this.settings.reducedFx) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.lineCap = 'round';
      const n = tr.length / 2;
      for (let i = 1; i < n; i++) {
        const u = i / n;
        ctx.globalAlpha = u * 0.45 * b.alpha;
        ctx.strokeStyle = tint;
        ctx.lineWidth = r * 1.3 * u;
        ctx.beginPath();
        ctx.moveTo(tr[(i - 1) * 2], tr[(i - 1) * 2 + 1]);
        ctx.lineTo(tr[i * 2], tr[i * 2 + 1]);
        ctx.stroke();
      }
      ctx.globalCompositeOperation = 'source-over';
    } else if (tr.length >= 4) {
      ctx.globalAlpha = 0.35; ctx.strokeStyle = tint; ctx.lineWidth = r;
      ctx.beginPath(); ctx.moveTo(tr[tr.length - 4], tr[tr.length - 3]); ctx.lineTo(x, y); ctx.stroke();
    }
    // ombre portée (plus décalée quand la bille est en hauteur)
    const sd = raised ? 2.4 : 1;
    ctx.globalAlpha = (raised ? 0.42 : 0.5) * b.alpha;
    ctx.fillStyle = '#000';
    ctx.beginPath(); ctx.ellipse(x + 3.5 * sd, y + 5 * sd, r * 1.02, r * 0.86, 0.4, 0, TAU); ctx.fill();
    // halo d'énergie discret
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.32 * b.alpha;
    const gs = r * 4.4;
    ctx.drawImage(glowSprite(tint, 64), x - gs / 2, y - gs / 2, gs, gs);
    ctx.globalCompositeOperation = 'source-over';
    // corps chromé
    ctx.globalAlpha = b.alpha;
    const grd = ctx.createRadialGradient(x - r * 0.32, y - r * 0.38, r * 0.05, x + r * 0.1, y + r * 0.12, r * 1.05);
    grd.addColorStop(0, '#ffffff');
    grd.addColorStop(0.22, '#eef2f9');
    grd.addColorStop(0.5, '#9aa4b8');
    grd.addColorStop(0.8, '#3a4154');
    grd.addColorStop(1, '#141824');
    ctx.fillStyle = grd;
    ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
    ctx.save();
    ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.clip();
    // horizon : reflet sombre du plateau, liseré néon en bas
    ctx.fillStyle = 'rgba(12,8,30,0.45)';
    ctx.beginPath(); ctx.ellipse(x, y + r * 0.42, r * 1.2, r * 0.52, 0, 0, TAU); ctx.fill();
    ctx.strokeStyle = tint; ctx.globalAlpha = 0.75 * b.alpha; ctx.lineWidth = r * 0.22;
    ctx.beginPath(); ctx.arc(x, y, r * 0.92, 0.35, Math.PI - 0.35); ctx.stroke();
    // reflet tournant (la rotation de la bille reste lisible)
    ctx.globalAlpha = 0.35 * b.alpha; ctx.strokeStyle = '#ffffff'; ctx.lineWidth = r * 0.1;
    ctx.beginPath(); ctx.arc(x, y, r * 0.66, b.spin, b.spin + 0.9); ctx.stroke();
    ctx.restore();
    // éclat spéculaire
    ctx.globalAlpha = 0.95 * b.alpha;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.ellipse(x - r * 0.36, y - r * 0.42, r * 0.26, r * 0.16, -0.6, 0, TAU); ctx.fill();
    if (b.phase || b.pierce) {
      ctx.strokeStyle = '#d6b8ff';
      ctx.lineWidth = 2;
      ctx.globalAlpha = 0.6 + 0.4 * Math.sin(this.time * 18);
      ctx.beginPath(); ctx.arc(x, y, r + 4, 0, TAU); ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  // Batteur : plastique blanc, caoutchouc néon, axe chromé, ombre portée.
  drawFlipper(f, color = COLORS.cyan) {
    const ctx = this.ctx;
    const a = lerp(f.prevAngle ?? f.angle, f.angle, this.alpha);
    const L = f.len, r0 = f.r0, r1 = f.r1;
    const path = new Path2D();
    path.arc(0, 0, r0, Math.PI / 2, -Math.PI / 2);
    path.lineTo(L, -r1);
    path.arc(L, 0, r1, -Math.PI / 2, Math.PI / 2);
    path.closePath();
    // ombre
    ctx.save();
    ctx.translate(f.px + 3, f.py + 5); ctx.rotate(a);
    ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.fill(path);
    ctx.restore();
    ctx.save();
    ctx.translate(f.px, f.py);
    ctx.rotate(a);
    const lift = f.lift;
    if (lift > 0.05) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.2 + 0.3 * lift;
      ctx.drawImage(glowSprite(color, 64), -20, -40, L + 40, 80);
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
    }
    const grd = ctx.createLinearGradient(0, -r0, 0, r0);
    grd.addColorStop(0, '#ffffff'); grd.addColorStop(0.45, '#e3e7ef'); grd.addColorStop(1, '#8d97ab');
    ctx.fillStyle = grd;
    ctx.fill(path);
    // caoutchouc coloré
    ctx.strokeStyle = color; ctx.lineWidth = 3.2; ctx.stroke(path);
    ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 0.8;
    ctx.save(); ctx.scale(0.86, 0.8); ctx.stroke(path); ctx.restore();
    // liseré décoratif et reflet
    ctx.fillStyle = color; ctx.globalAlpha = 0.85;
    ctx.beginPath(); ctx.moveTo(r0 * 0.8, -2); ctx.lineTo(L - r1 * 1.4, -1); ctx.lineTo(L - r1 * 1.4, 1); ctx.lineTo(r0 * 0.8, 2); ctx.closePath(); ctx.fill();
    ctx.globalAlpha = 1;
    ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(2, -r0 * 0.55); ctx.lineTo(L - 4, -r1 * 0.55); ctx.stroke();
    // axe chromé
    const ax = ctx.createRadialGradient(-1.5, -1.5, 0.5, 0, 0, r0 * 0.48);
    ax.addColorStop(0, '#ffffff'); ax.addColorStop(1, '#4a5368');
    ctx.fillStyle = ax; ctx.beginPath(); ctx.arc(0, 0, r0 * 0.46, 0, TAU); ctx.fill();
    ctx.strokeStyle = 'rgba(20,24,34,0.8)'; ctx.lineWidth = 0.8;
    ctx.beginPath(); ctx.moveTo(-r0 * 0.25, 0); ctx.lineTo(r0 * 0.25, 0); ctx.stroke();
    ctx.restore();
  }

  drawBarrier(seg, t) {
    const ctx = this.ctx;
    const blink = t < 1.2 ? (Math.sin(this.time * 30) > 0 ? 1 : 0.3) : 1;
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = '#7fd7ff';
    ctx.globalAlpha = 0.35 * blink;
    ctx.lineWidth = 14;
    ctx.beginPath(); ctx.moveTo(seg.ax, seg.ay); ctx.lineTo(seg.bx, seg.by); ctx.stroke();
    ctx.globalAlpha = 0.9 * blink;
    ctx.lineWidth = 3;
    ctx.beginPath();
    const n = 40;
    for (let i = 0; i <= n; i++) {
      const u = i / n;
      const x = lerp(seg.ax, seg.bx, u), y = lerp(seg.ay, seg.by, u) + Math.sin(u * 40 + this.time * 12) * 2;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
  }
}
