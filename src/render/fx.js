import { rand } from '../util/math.js';
import { glowSprite } from './sprites.js';

// Effets visuels en coordonnées monde : étincelles, éclats, anneaux, textes, flash, secousses.
export class FX {
  constructor(settings) {
    this.settings = settings;
    this.parts = [];
    this.rings = [];
    this.texts = [];
    this.flashA = 0; this.flashColor = '#fff';
    this.shakeA = 0; this.shakeX = 0; this.shakeY = 0;
    this.drains = [];
    this.arcs = [];           // arcs électriques
    this.sweeps = [];         // balayages laser horizontaux
    this.max = 420;
  }

  get k() { return this.settings.reducedFx ? 0.3 : 1; }

  _add(p) {
    if (this.parts.length >= this.max) this.parts.shift();
    this.parts.push(p);
  }

  spark(x, y, impact) {
    const n = Math.round(Math.min(10, impact / 380) * this.k);
    for (let i = 0; i < n; i++) {
      const a = rand(0, Math.PI * 2), s = rand(120, 300 + impact * 0.12);
      this._add({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: rand(0.12, 0.32), t: 0, color: '#fff2c0', size: rand(1.2, 2.4), kind: 'spark' });
    }
  }

  burst(x, y, color, n = 10, speed = 260) {
    n = Math.max(1, Math.round(n * this.k));
    for (let i = 0; i < n; i++) {
      const a = rand(0, Math.PI * 2), s = rand(speed * 0.3, speed);
      this._add({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: rand(0.25, 0.6), t: 0, color, size: rand(2, 4), kind: 'dot' });
    }
  }

  ring(x, y, color, r = 50, life = 0.45) {
    if (this.rings.length > 30) this.rings.shift();
    this.rings.push({ x, y, color, r, life, t: 0 });
  }

  text(x, y, str, color = '#fff', scale = 1) {
    if (this.texts.length > 14) this.texts.shift();
    this.texts.push({ x, y, str, color, scale, t: 0, life: 1.1 });
  }

  flash(color, a = 0.3) {
    if (this.settings.reducedFx) a *= 0.35;
    this.flashColor = color; this.flashA = Math.max(this.flashA, a);
  }

  shake(a) {
    if (this.settings.reducedMotion) return;
    this.shakeA = Math.min(14, Math.max(this.shakeA, a));
  }

  drain(x) { this.drains.push({ x, t: 0 }); }

  // Arc électrique entre deux points (bumpers, tourelles…), redessiné en zigzag à chaque image.
  arc(x0, y0, x1, y1, color = '#9fe8ff', life = 0.18) {
    if (this.settings.reducedFx && this.arcs.length > 2) return;
    if (this.arcs.length > 12) this.arcs.shift();
    this.arcs.push({ x0, y0, x1, y1, color, life, t: 0 });
  }

  // Balayage laser qui remonte le plateau (grands événements).
  sweep(color = '#29e3ff', y0 = 1080, y1 = -140, dur = 0.7) {
    if (this.sweeps.length > 3) this.sweeps.shift();
    this.sweeps.push({ color, y0, y1, dur, t: 0 });
  }

  clear() { this.parts.length = 0; this.rings.length = 0; this.texts.length = 0; this.arcs.length = 0; this.sweeps.length = 0; this.flashA = 0; this.shakeA = 0; }

  update(dt) {
    for (let i = this.parts.length - 1; i >= 0; i--) {
      const p = this.parts[i];
      p.t += dt;
      if (p.t >= p.life) { this.parts.splice(i, 1); continue; }
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.vx *= 1 - 3 * dt; p.vy = p.vy * (1 - 3 * dt) + 300 * dt;
    }
    for (let i = this.rings.length - 1; i >= 0; i--) { const r = this.rings[i]; r.t += dt; if (r.t >= r.life) this.rings.splice(i, 1); }
    for (let i = this.texts.length - 1; i >= 0; i--) { const t = this.texts[i]; t.t += dt; t.y -= 40 * dt; if (t.t >= t.life) this.texts.splice(i, 1); }
    for (let i = this.drains.length - 1; i >= 0; i--) { const d = this.drains[i]; d.t += dt; if (d.t > 0.8) this.drains.splice(i, 1); }
    for (let i = this.arcs.length - 1; i >= 0; i--) { const a = this.arcs[i]; a.t += dt; if (a.t >= a.life) this.arcs.splice(i, 1); }
    for (let i = this.sweeps.length - 1; i >= 0; i--) { const w = this.sweeps[i]; w.t += dt; if (w.t >= w.dur) this.sweeps.splice(i, 1); }
    this.flashA = Math.max(0, this.flashA - dt * 1.6);
    if (this.shakeA > 0) {
      this.shakeA = Math.max(0, this.shakeA - dt * 30);
      this.shakeX = rand(-1, 1) * this.shakeA;
      this.shakeY = rand(-1, 1) * this.shakeA;
    } else { this.shakeX = this.shakeY = 0; }
  }

  // dessin en coordonnées monde (ctx déjà transformé)
  draw(ctx, font) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const p of this.parts) {
      const a = 1 - p.t / p.life;
      if (p.kind === 'spark') {
        ctx.strokeStyle = p.color;
        ctx.globalAlpha = a;
        ctx.lineWidth = p.size;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x - p.vx * 0.03, p.y - p.vy * 0.03);
        ctx.stroke();
      } else {
        const s = p.size * 5;
        ctx.globalAlpha = a;
        ctx.drawImage(glowSprite(p.color, 32), p.x - s / 2, p.y - s / 2, s, s);
      }
    }
    for (const r of this.rings) {
      const u = r.t / r.life;
      ctx.globalAlpha = (1 - u) * 0.9;
      ctx.strokeStyle = r.color;
      ctx.lineWidth = 3 * (1 - u) + 1;
      ctx.beginPath();
      ctx.arc(r.x, r.y, r.r * (0.3 + u * 0.9), 0, Math.PI * 2);
      ctx.stroke();
    }
    // arcs électriques : ligne brisée aléatoire, cœur blanc et halo coloré
    for (const a of this.arcs) {
      const k = 1 - a.t / a.life;
      const n = 7;
      const dx = a.x1 - a.x0, dy = a.y1 - a.y0;
      const len = Math.hypot(dx, dy) || 1;
      const nx = -dy / len, ny = dx / len;
      const pts = [[a.x0, a.y0]];
      for (let i = 1; i < n; i++) {
        const u = i / n, off = rand(-1, 1) * len * 0.12 * Math.sin(u * Math.PI);
        pts.push([a.x0 + dx * u + nx * off, a.y0 + dy * u + ny * off]);
      }
      pts.push([a.x1, a.y1]);
      for (const [w, col, al] of [[6, a.color, 0.35], [2, '#ffffff', 0.95]]) {
        ctx.globalAlpha = al * k; ctx.strokeStyle = col; ctx.lineWidth = w; ctx.lineJoin = 'round';
        ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
        for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
        ctx.stroke();
      }
    }
    // balayages laser
    for (const w of this.sweeps) {
      const u = w.t / w.dur;
      const y = w.y0 + (w.y1 - w.y0) * u;
      ctx.globalAlpha = 0.55 * (1 - u);
      ctx.drawImage(glowSprite(w.color, 64), -40, y - 40, 680, 80);
      ctx.globalAlpha = 0.9 * (1 - u);
      ctx.fillStyle = '#ffffff'; ctx.fillRect(20, y - 1, 560, 2);
    }
    for (const d of this.drains) {
      const u = d.t / 0.8;
      ctx.globalAlpha = (1 - u) * 0.6;
      ctx.drawImage(glowSprite('#ff3050', 64), d.x - 120, 1000 - 60 * u, 240, 160);
    }
    ctx.globalCompositeOperation = 'source-over';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const t of this.texts) {
      const u = t.t / t.life;
      const a = u < 0.15 ? u / 0.15 : 1 - Math.max(0, (u - 0.6) / 0.4);
      ctx.globalAlpha = a;
      ctx.font = `700 ${Math.round(17 * t.scale)}px ${font}`;
      ctx.lineWidth = 4;
      ctx.strokeStyle = 'rgba(0,0,0,0.75)';
      ctx.strokeText(t.str, t.x, t.y);
      ctx.fillStyle = t.color;
      ctx.fillText(t.str, t.x, t.y);
    }
    ctx.restore();
  }
}
