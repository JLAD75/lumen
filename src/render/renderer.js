import { TABLE_W, TABLE_H, COLORS } from '../config.js';
import { lerp, mulberry32, rgba, clamp, TAU } from '../util/math.js';
import { glowSprite } from './sprites.js';
import { FX } from './fx.js';
import { TableArt, drawPlate, drawStaticPrims, drawSling } from './tableArt.js';

export const FONT = '"Rajdhani", "Segoe UI", system-ui, sans-serif';
export const FONT_D = '"Orbitron", "Rajdhani", "Segoe UI", sans-serif';

const BALL_COLORS = ['#29e3ff', '#ff3df2', '#ffd84a', '#5dff8f'];

// Rendu Canvas 2D : caméra monde, calques statiques pré-rendus, scènes, effets.
export class Renderer {
  constructor(canvas, settings) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
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
    this.bg = null;
  }

  // calque statique en coordonnées monde (couvre 600×1100), pré-rendu à la résolution d'affichage
  layer(key, drawFn) {
    let l = this.layers.get(key);
    if (l) return l;
    const s = this.view.scale * this.dpr;
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(TABLE_W * s));
    c.height = Math.max(1, Math.round(TABLE_H * s));
    const g = c.getContext('2d');
    g.setTransform(s, 0, 0, s, 0, 0);
    drawFn(g, this);
    l = c;
    this.layers.set(key, l);
    return l;
  }

  dropLayer(key) { this.layers.delete(key); }

  _background() {
    if (this.bg) return this.bg;
    const c = document.createElement('canvas');
    c.width = this.canvas.width; c.height = this.canvas.height;
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

  render(game) {
    const now = performance.now();
    const dt = Math.min(0.1, (now - this.lastFrame) / 1000);
    this.lastFrame = now;
    this.time += dt;
    this.fpsAvg = this.fpsAvg * 0.95 + (1 / Math.max(dt, 0.001)) * 0.05;
    const ctx = this.ctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.drawImage(this._background(), 0, 0);

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

    // flash plein écran
    this.screenTransform();
    if (this.fx.flashA > 0.01) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = this.fx.flashA * 0.6;
      ctx.fillStyle = this.fx.flashColor;
      ctx.fillRect(0, 0, this.W, this.H);
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
    }
    if (tv && tv.fade > 0) {
      ctx.globalAlpha = clamp(tv.fade, 0, 1) * 0.85;
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, this.W, this.H);
      ctx.globalAlpha = 1;
    }
    if (game.state === 'play' && game.resumeT > 0) this._countdown(game.resumeT);
  }

  // Caméra de base : plateau entier, ou suivi vertical de la bille la plus basse
  // (petits écrans en paysage). Les batteurs restent visibles quand la bille descend.
  _baseCam(game, dt) {
    const v = this.view;
    if (!v.follow) { this.camY = TABLE_H / 2; return { x: TABLE_W / 2, y: TABLE_H / 2, zoom: 1 }; }
    const half = v.h / v.scale / 2;
    let target = TABLE_H - half;
    const balls = game.scene === 'minigame' && game.minigame ? game.minigame.world.balls : game.table.world.balls;
    let lowest = -1;
    for (const b of balls) if (b.y > lowest) lowest = b.y;
    if (lowest >= 0 && game.state === 'play') target = lowest + half * 0.25;
    target = clamp(target, half, TABLE_H - half);
    if (this.camY === undefined) this.camY = target;
    this.camY += (target - this.camY) * Math.min(1, dt * 5);
    return { x: TABLE_W / 2, y: this.camY, zoom: 1 };
  }

  _scene(game, name, mg) {
    const ctx = this.ctx;
    if (name === 'table') {
      this.art.draw(ctx, game.table, game);
    } else if (mg) {
      ctx.drawImage(this.layer('mg-' + mg.sector + '-' + mg.level, (g) => this._arenaStatic(g, mg)), 0, 0, TABLE_W, TABLE_H);
      mg.render(ctx, this, game);
      for (const f of mg.world.flippers) this.drawFlipper(f, mg.color);
      for (const b of mg.world.balls) this.drawBall(b, 0);
      if (mg.pendingBall && mg.state === 'relaunch' && !mg.world.balls.includes(mg.pendingBall)) this.drawBall(mg.pendingBall, 0);
      if (mg.renderTop) mg.renderTop(ctx, this, game);
    }
  }

  _arenaStatic(g, mg) {
    drawPlate(g, mg.sector);
    if (mg.drawStatic) mg.drawStatic(g, this);
    drawStaticPrims(g, mg.world, mg.color);
    if (mg.frame) { drawSling(g, mg.frame.slingL, mg.color, 0, true); drawSling(g, mg.frame.slingR, mg.color, 0, true); }
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

  drawBall(b, colorIdx) {
    const ctx = this.ctx;
    const a = this.alpha;
    const x = b.state === 'free' ? lerp(b.px, b.x, a) : b.x;
    const y = b.state === 'free' ? lerp(b.py, b.y, a) : b.y;
    const s = b.scale * (b.layer === 1 ? 1.14 : 1);
    if (s <= 0.02) return;
    const col = BALL_COLORS[Math.floor((b.hue || 0) / 70) % BALL_COLORS.length] || BALL_COLORS[colorIdx || 0];
    const r = b.r * s;
    // traînée
    const tr = b.trail;
    if (tr.length >= 6 && !this.settings.reducedFx) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.lineCap = 'round';
      const n = tr.length / 2;
      for (let i = 1; i < n; i++) {
        const u = i / n;
        ctx.globalAlpha = u * 0.55 * b.alpha;
        ctx.strokeStyle = b.phase || b.pierce ? '#b07bff' : col;
        ctx.lineWidth = r * 1.5 * u;
        ctx.beginPath();
        ctx.moveTo(tr[(i - 1) * 2], tr[(i - 1) * 2 + 1]);
        ctx.lineTo(tr[i * 2], tr[i * 2 + 1]);
        ctx.stroke();
      }
      ctx.globalCompositeOperation = 'source-over';
    } else if (tr.length >= 4) {
      ctx.globalAlpha = 0.4; ctx.strokeStyle = col; ctx.lineWidth = r;
      ctx.beginPath(); ctx.moveTo(tr[tr.length - 4], tr[tr.length - 3]); ctx.lineTo(x, y); ctx.stroke();
    }
    // ombre (bille surélevée sur une rampe)
    if (b.layer === 1) {
      ctx.globalAlpha = 0.45 * b.alpha;
      ctx.fillStyle = '#000';
      ctx.beginPath(); ctx.ellipse(x + 7, y + 9, r, r * 0.8, 0, 0, TAU); ctx.fill();
    }
    // halo
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.65 * b.alpha;
    const gs = r * 5.2;
    ctx.drawImage(glowSprite(b.phase || b.pierce ? '#b07bff' : col, 64), x - gs / 2, y - gs / 2, gs, gs);
    ctx.globalCompositeOperation = 'source-over';
    // corps : sphère chromée à cœur d'énergie
    ctx.globalAlpha = b.alpha;
    const grd = ctx.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.1, x, y, r);
    grd.addColorStop(0, '#ffffff');
    grd.addColorStop(0.35, '#e8fbff');
    grd.addColorStop(0.75, col);
    grd.addColorStop(1, '#0b2a40');
    ctx.fillStyle = grd;
    ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
    // reflet tournant (rotation visible)
    ctx.strokeStyle = 'rgba(255,255,255,0.55)';
    ctx.lineWidth = r * 0.16;
    ctx.beginPath(); ctx.arc(x, y, r * 0.62, b.spin, b.spin + 1.1); ctx.stroke();
    if (b.phase || b.pierce) {
      ctx.strokeStyle = '#d6b8ff';
      ctx.lineWidth = 2;
      ctx.globalAlpha = 0.6 + 0.4 * Math.sin(this.time * 18);
      ctx.beginPath(); ctx.arc(x, y, r + 4, 0, TAU); ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  drawFlipper(f, color = COLORS.cyan) {
    const ctx = this.ctx;
    const a = lerp(f.prevAngle ?? f.angle, f.angle, this.alpha);
    ctx.save();
    ctx.translate(f.px, f.py);
    ctx.rotate(a);
    const L = f.len, r0 = f.r0, r1 = f.r1;
    const lift = f.lift;
    // halo de frappe
    if (lift > 0.05) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.25 + 0.35 * lift;
      ctx.drawImage(glowSprite(color, 64), -20, -40, L + 40, 80);
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
    }
    const path = new Path2D();
    path.arc(0, 0, r0, Math.PI / 2, -Math.PI / 2);
    path.lineTo(L, -r1);
    path.arc(L, 0, r1, -Math.PI / 2, Math.PI / 2);
    path.closePath();
    const grd = ctx.createLinearGradient(0, -r0, 0, r0);
    grd.addColorStop(0, '#d8e4f5'); grd.addColorStop(0.45, '#7c8db0'); grd.addColorStop(1, '#2a3550');
    ctx.fillStyle = grd;
    ctx.fill(path);
    // caoutchouc lumineux
    ctx.strokeStyle = color;
    ctx.lineWidth = 2.5;
    ctx.stroke(path);
    ctx.strokeStyle = 'rgba(255,255,255,0.6)';
    ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(4, -r0 * 0.45); ctx.lineTo(L - 6, -r1 * 0.45); ctx.stroke();
    // pivot
    ctx.fillStyle = '#10182c';
    ctx.beginPath(); ctx.arc(0, 0, 6, 0, TAU); ctx.fill();
    ctx.strokeStyle = color; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.restore();
  }

  drawPaddle(p, color) {
    const ctx = this.ctx;
    const x = lerp(p.px, p.x, this.alpha), y = p.y, w = p.w, h = p.h;
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.35 + 0.4 * Math.max(0, p.hitFlash);
    ctx.drawImage(glowSprite(p.stun > 0 ? '#ff4060' : color, 64), x - w / 2 - 30, y - 40, w + 60, 80);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    const path = new Path2D();
    path.roundRect ? path.roundRect(x - w / 2, y - h / 2, w, h, h / 2) : path.rect(x - w / 2, y - h / 2, w, h);
    const grd = ctx.createLinearGradient(0, y - h / 2, 0, y + h / 2);
    grd.addColorStop(0, '#e8f2ff'); grd.addColorStop(0.5, '#6f84ad'); grd.addColorStop(1, '#1d2740');
    ctx.fillStyle = grd; ctx.fill(path);
    ctx.strokeStyle = p.stun > 0 ? '#ff4060' : color; ctx.lineWidth = 2.5; ctx.stroke(path);
    // repères de visée
    ctx.fillStyle = color;
    for (const u of [-0.66, -0.33, 0, 0.33, 0.66]) {
      ctx.globalAlpha = u === 0 ? 0.9 : 0.5;
      ctx.fillRect(x + u * w / 2 - 1, y - h / 2 + 3, 2, h - 6);
    }
    ctx.globalAlpha = 1;
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

  drawArenaFrame() { /* le cadre est dans le calque statique de l'arène */ }

  drawBrick(br, w, h, t) {
    const ctx = this.ctx;
    const x = br.x, y = br.y;
    let fill, edge;
    switch (br.type) {
      case 'armor': fill = '#56637d'; edge = '#c8d6f0'; break;
      case 'explosive': fill = '#7a1d14'; edge = '#ff5a3d'; break;
      case 'mobile': fill = '#3c1f6e'; edge = '#b07bff'; break;
      case 'lock': fill = '#6b4f00'; edge = '#ffd84a'; break;
      default: {
        const hues = ['#1f6fa8', '#1b7f9e', '#1a8f8f', '#16797f', '#1c5f9a', '#235a8f', '#2a4f86'];
        fill = hues[br.hue % hues.length]; edge = '#29d9ff';
      }
    }
    if (br.type === 'lock' || br.type === 'explosive') {
      this.glow(x + w / 2, y + h / 2, w * 1.6, edge, 0.25 + 0.15 * Math.sin(t * 5 + x));
    }
    ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.roundRect ? ctx.roundRect(x, y, w, h, 4) : ctx.rect(x, y, w, h);
    ctx.fill();
    ctx.strokeStyle = edge; ctx.lineWidth = 1.6; ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.fillRect(x + 3, y + 2, w - 6, 4);
    ctx.font = `700 13px ${this.font}`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    if (br.type === 'armor') {
      ctx.fillStyle = '#c8d6f0';
      for (const [rx, ry] of [[5, 5], [w - 5, 5], [5, h - 5], [w - 5, h - 5]]) { ctx.beginPath(); ctx.arc(x + rx, y + ry, 1.6, 0, TAU); ctx.fill(); }
      const dmg = br.maxHp - br.hp;
      ctx.strokeStyle = 'rgba(10,10,20,0.85)'; ctx.lineWidth = 1.4;
      for (let i = 0; i < dmg; i++) {
        ctx.beginPath(); ctx.moveTo(x + 10 + i * 14, y + 3); ctx.lineTo(x + 16 + i * 14, y + h / 2); ctx.lineTo(x + 12 + i * 14, y + h - 3); ctx.stroke();
      }
    } else if (br.type === 'explosive') {
      ctx.fillStyle = '#ffd0c0'; ctx.fillText('✸', x + w / 2, y + h / 2 + 1);
    } else if (br.type === 'mobile') {
      ctx.fillStyle = '#e0ccff'; ctx.fillText('⇆', x + w / 2, y + h / 2 + 1);
    } else if (br.type === 'lock') {
      // cadenas
      const cx = x + w / 2, cy = y + h / 2 + 2;
      ctx.strokeStyle = '#fff3b0'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(cx, cy - 5, 4.5, Math.PI, 0); ctx.stroke();
      ctx.fillStyle = '#fff3b0'; ctx.fillRect(cx - 6.5, cy - 5, 13, 9);
      if (br.hp < br.maxHp) { ctx.strokeStyle = '#3a2a00'; ctx.beginPath(); ctx.moveTo(cx - 5, cy - 4); ctx.lineTo(cx + 3, cy + 3); ctx.stroke(); }
    }
    if (br.flash > 0) {
      ctx.globalAlpha = br.flash;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(x, y, w, h);
      ctx.globalAlpha = 1;
    }
  }

  drawCapsule(c, C) {
    const ctx = this.ctx;
    const w = 46, h = 20;
    this.glow(c.x, c.y, 80, C.color, 0.5);
    ctx.fillStyle = '#0c1424';
    ctx.beginPath();
    ctx.roundRect ? ctx.roundRect(c.x - w / 2, c.y - h / 2, w, h, h / 2) : ctx.rect(c.x - w / 2, c.y - h / 2, w, h);
    ctx.fill();
    ctx.strokeStyle = C.color; ctx.lineWidth = 2; ctx.stroke();
    this.text(C.label, c.x, c.y + 1, 13, C.color);
  }
}
