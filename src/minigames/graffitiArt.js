// Rendu du minijeu FRESQUE NÉON : affiches de propagande (calque statique), fresque
// procédurale cachée (canevas hors écran, une par variante), calque de peinture
// incrémental (chaque tampon révèle la fresque sous une forme organique : bords
// irréguliers, postillons, coulures, liseré arc-en-ciel), bombes de peinture,
// drones nettoyeurs, capsule AÉROSOL, jauge, victoire et signature de LUMEN.
import { TAU, rgba, mulberry32, clamp } from '../util/math.js';
import { glowSprite } from '../render/sprites.js';

// pixels de canevas par unité monde : suit la résolution d'affichage (1 à 2, par pas de 0,25)
const canvasScale = (r) => clamp(Math.round((r.view ? r.view.scale * (r.dpr || 1) : 1.25) * 4) / 4, 1, 2);
const FX0 = 20, FY0 = 20, FW = 560, FH = 574;
const DARK = '#0a0612';
const FD = '"Orbitron", "Rajdhani", sans-serif';
const FR = '"Rajdhani", "Segoe UI", sans-serif';

// ------------------------------------------------------------------ couleurs
function hsl2hex(h, s, l) {
  s /= 100; l /= 100;
  const k = (n) => (n + h / 30) % 12, a = s * Math.min(l, 1 - l);
  const f = (n) => Math.round(255 * (l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)))));
  return '#' + [f(0), f(8), f(4)].map(v => v.toString(16).padStart(2, '0')).join('');
}
const HUES = Array.from({ length: 36 }, (_, i) => hsl2hex(i * 10, 100, 60));
const HUES_L = Array.from({ length: 36 }, (_, i) => hsl2hex(i * 10, 100, 78));
export function hueHex(h) { return HUES[Math.round((((h % 360) + 360) % 360) / 10) % 36]; }
const hueLight = (h) => HUES_L[Math.round((((h % 360) + 360) % 360) / 10) % 36];

function mk(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.ceil(w)); c.height = Math.max(1, Math.ceil(h));
  return c;
}

// contour intérieur du mur (rails exclus) en Path2D, pour le découpage du calque de peinture
function innerPath(outline) {
  const p = new Path2D();
  const n = outline.length;
  // décalage vers l'intérieur de 4.5 (axe du rail + demi-épaisseur du chrome)
  const cx = 300, cy = 300;
  p.moveTo(outline[0][0] + 1, outline[0][1]);
  for (let i = 1; i < n; i++) {
    let [x, y] = outline[i];
    if (y < 300 || (x > 541 && y < 331)) {
      const dx = x - cx, dy = y - cy, l = Math.hypot(dx, dy);
      if (l > 270) { x = cx + dx / l * (l - 4.5); y = cy + dy / l * (l - 4.5); }
    }
    if (Math.abs(x - 20) < 0.5) x = 24.5;
    if (Math.abs(x - 542) < 0.5 && y > 320) x = 537.5;
    if (x > 541 && y > 320 && y < 335) { x = 537.5; y = 326; }
    p.lineTo(x, y);
  }
  p.closePath();
  return p;
}

// ------------------------------------------------------------------ fresque
const FRESCO = new Map();

function getFresco(variant, S) {
  const key = variant + '|' + S;
  let f = FRESCO.get(key);
  if (f) return f;
  if (FRESCO.size > 2) FRESCO.clear();
  const base = mk(FW * S, FH * S), glow = mk(FW * S, FH * S);
  const g = base.getContext('2d'), q = glow.getContext('2d');
  for (const c of [g, q]) c.setTransform(S, 0, 0, S, -FX0 * S, -FY0 * S);
  const rnd = mulberry32(1234 + variant * 77);
  const V = VARIANTS[variant % VARIANTS.length];
  V(g, q, rnd);
  f = { base, glow };
  FRESCO.set(key, f);
  return f;
}

function sky(g, stops) {
  const grd = g.createLinearGradient(0, FY0, 0, FY0 + FH);
  stops.forEach(([u, c]) => grd.addColorStop(u, c));
  g.fillStyle = grd;
  g.fillRect(FX0, FY0, FW, FH);
}

function stars(g, rnd, n, yMax, cols) {
  for (let i = 0; i < n; i++) {
    const x = FX0 + rnd() * FW, y = FY0 + rnd() * (yMax - FY0), s = rnd();
    g.fillStyle = rgba(cols[(rnd() * cols.length) | 0], 0.35 + s * 0.6);
    g.fillRect(x, y, 1 + s * 1.4, 1 + s * 1.4);
  }
}

function sparkle(g, x, y, s, color, a = 1) {
  g.save();
  g.globalAlpha = a;
  g.fillStyle = color;
  g.beginPath();
  g.moveTo(x, y - s); g.quadraticCurveTo(x, y, x + s, y); g.quadraticCurveTo(x, y, x, y + s);
  g.quadraticCurveTo(x, y, x - s, y); g.quadraticCurveTo(x, y, x, y - s);
  g.fill();
  g.restore();
}

function rays(g, cx, cy, n, r, color, a, rot = 0) {
  g.save();
  g.fillStyle = rgba(color, a);
  for (let k = 0; k < n; k++) {
    const a0 = rot + k * TAU / n, a1 = a0 + TAU / n * 0.45;
    g.beginPath(); g.moveTo(cx, cy);
    g.lineTo(cx + Math.cos(a0) * r, cy + Math.sin(a0) * r);
    g.lineTo(cx + Math.cos(a1) * r, cy + Math.sin(a1) * r);
    g.closePath(); g.fill();
  }
  g.restore();
}

// soleil rétro rayé
function sun(g, cx, cy, R, c0, c1, c2) {
  g.save();
  const clip = new Path2D();
  clip.rect(cx - R, cy - R, R * 2, R * 1.02);
  for (let k = 0; k < 9; k++) {
    const y0 = cy + R * 0.02 + k * R * 0.11, h = R * 0.11 * (1 - k * 0.09);
    clip.rect(cx - R, y0 + R * 0.11 - h, R * 2, h * 0.62);
  }
  g.clip(clip);
  const grd = g.createLinearGradient(0, cy - R, 0, cy + R);
  grd.addColorStop(0, c0); grd.addColorStop(0.55, c1); grd.addColorStop(1, c2);
  g.fillStyle = grd;
  g.beginPath(); g.arc(cx, cy, R, 0, TAU); g.fill();
  g.restore();
}

// silhouette de ville avec fenêtres et enseignes néon
function skyline(g, q, rnd, yBase, hMin, hMax, body, wins, signs) {
  let x = FX0 - 10;
  while (x < FX0 + FW + 10) {
    const w = 18 + rnd() * 34, h = hMin + rnd() * (hMax - hMin);
    g.fillStyle = body;
    g.fillRect(x, yBase - h, w, h + 4);
    if (rnd() < 0.35) { g.fillRect(x + w * 0.45, yBase - h - 10 - rnd() * 16, 2, 26); }
    if (rnd() < 0.25) { g.beginPath(); g.moveTo(x, yBase - h); g.lineTo(x + w / 2, yBase - h - 12); g.lineTo(x + w, yBase - h); g.fill(); }
    for (let wy = yBase - h + 5; wy < yBase - 4; wy += 6) {
      for (let wx = x + 3; wx < x + w - 3; wx += 5) {
        if (rnd() < 0.3) { g.fillStyle = rgba(wins[(rnd() * wins.length) | 0], 0.45 + rnd() * 0.5); g.fillRect(wx, wy, 2, 2.4); }
      }
    }
    if (signs && rnd() < 0.3 && h > 50) {
      const col = signs[(rnd() * signs.length) | 0];
      const sy = yBase - h + 10 + rnd() * (h - 40), sw = Math.min(w - 6, 10 + rnd() * 16);
      for (const c of [g, q]) {
        c.save();
        c.shadowColor = col; c.shadowBlur = 8;
        c.strokeStyle = col; c.lineWidth = 1.6;
        if (rnd() < 0.5) c.strokeRect(x + 3, sy, sw, 7 + rnd() * 10);
        else { c.beginPath(); c.moveTo(x + w / 2, sy); c.lineTo(x + w / 2, sy + 14 + rnd() * 18); c.stroke(); }
        c.restore();
      }
    }
    x += w + 1 + rnd() * 4;
  }
}

// lettrage tag : lettres bulles, extrusion 3D, double contour, dégradé, reflets, coulures
function tagWord(g, q, word, cx, cy, size, o, rnd) {
  g.save();
  g.font = `900 ${size}px ${FD}`;
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.lineJoin = 'round'; g.lineCap = 'round';
  const ws = [...word].map(ch => g.measureText(ch).width * 0.86 + size * 0.04);
  const total = ws.reduce((a, b) => a + b, 0);
  let x = cx - total / 2;
  const L = [...word].map((ch, i) => {
    const l = { ch, x: x + ws[i] / 2, y: cy + Math.sin(i * 1.7 + 0.4) * size * 0.09, rot: (rnd() - 0.5) * 0.24, sc: 0.9 + rnd() * 0.24 };
    x += ws[i];
    return l;
  });
  const each = (fn) => { for (const l of L) { g.save(); g.translate(l.x, l.y); g.rotate(l.rot); g.scale(l.sc, l.sc); fn(l); g.restore(); } };
  // extrusion
  for (let d = 7; d >= 1; d--) each((l) => { g.fillStyle = o.shadow || '#05000c'; g.strokeStyle = o.shadow || '#05000c'; g.lineWidth = size * 0.26; g.strokeText(l.ch, d * 1.1, d * 1.4); });
  each((l) => { g.strokeStyle = o.outline; g.lineWidth = size * 0.26; g.strokeText(l.ch, 0, 0); });
  each((l) => { g.strokeStyle = o.rim; g.lineWidth = size * 0.12; g.strokeText(l.ch, 0, 0); });
  each((l) => {
    const grd = g.createLinearGradient(0, -size * 0.5, 0, size * 0.5);
    o.fill.forEach((c, i) => grd.addColorStop(i / (o.fill.length - 1), c));
    g.fillStyle = grd; g.fillText(l.ch, 0, 0);
    // bande de reflet
    g.save();
    g.globalCompositeOperation = 'source-atop';
    g.fillStyle = 'rgba(255,255,255,0.28)';
    g.fillRect(-size, -size * 0.42, size * 2, size * 0.16);
    g.restore();
  });
  // éclats blancs
  each(() => {
    g.fillStyle = '#ffffff';
    g.beginPath(); g.ellipse(-size * 0.18, -size * 0.24, size * 0.05, size * 0.022, -0.5, 0, TAU); g.fill();
  });
  g.restore();
  // coulures sous les lettres
  for (const l of L) {
    if (rnd() < 0.55) drip(g, l.x + (rnd() - 0.5) * size * 0.4, l.y + size * 0.38, size * 0.06, size * (0.25 + rnd() * 0.6), o.fill[o.fill.length - 1]);
  }
  // halo néon (calque d'illumination)
  q.save();
  q.font = `900 ${size}px ${FD}`;
  q.textAlign = 'center'; q.textBaseline = 'middle'; q.lineJoin = 'round';
  q.shadowColor = o.glow; q.shadowBlur = 18;
  q.strokeStyle = o.glow; q.lineWidth = size * 0.07;
  for (const l of L) { q.save(); q.translate(l.x, l.y); q.rotate(l.rot); q.scale(l.sc, l.sc); q.strokeText(l.ch, 0, 0); q.restore(); }
  q.restore();
}

function drip(g, x, y, w, len, color) {
  g.fillStyle = color;
  g.beginPath();
  g.moveTo(x - w, y);
  g.lineTo(x - w * 0.7, y + len);
  g.arc(x, y + len, w * 0.95, Math.PI, 0, true);
  g.lineTo(x + w, y);
  g.closePath(); g.fill();
}

function splatter(g, rnd, x, y, r, color, n = 8) {
  g.fillStyle = color;
  g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
  for (let i = 0; i < n; i++) {
    const a = rnd() * TAU, d = r * (1.2 + rnd() * 1.6), s = r * (0.1 + rnd() * 0.3);
    g.beginPath(); g.arc(x + Math.cos(a) * d, y + Math.sin(a) * d, s, 0, TAU); g.fill();
  }
}

function crown(g, x, y, s, color, outline) {
  g.save();
  g.lineJoin = 'round';
  g.beginPath();
  g.moveTo(x - s, y + s * 0.5); g.lineTo(x - s * 1.1, y - s * 0.5); g.lineTo(x - s * 0.45, y); g.lineTo(x, y - s * 0.8);
  g.lineTo(x + s * 0.45, y); g.lineTo(x + s * 1.1, y - s * 0.5); g.lineTo(x + s, y + s * 0.5); g.closePath();
  g.lineWidth = s * 0.35; g.strokeStyle = outline; g.stroke();
  g.fillStyle = color; g.fill();
  g.fillStyle = '#ffffff';
  for (const [px, py] of [[x - s * 1.1, y - s * 0.5], [x, y - s * 0.8], [x + s * 1.1, y - s * 0.5]]) { g.beginPath(); g.arc(px, py, s * 0.16, 0, TAU); g.fill(); }
  g.restore();
}

// œil de LUMEN (en amande, iris strié, larmes de peinture)
function eye(g, q, cx, cy, w, h, rnd) {
  const lid = (c) => {
    c.beginPath();
    c.moveTo(cx - w / 2, cy);
    c.quadraticCurveTo(cx, cy - h * 2, cx + w / 2, cy);
    c.quadraticCurveTo(cx, cy + h * 2, cx - w / 2, cy);
    c.closePath();
  };
  rays(g, cx, cy, 22, 420, '#ffffff', 0.05, 0.1);
  g.save();
  g.shadowColor = '#22e4ff'; g.shadowBlur = 30;
  lid(g); g.fillStyle = '#0c1430'; g.fill();
  g.restore();
  g.save();
  lid(g); g.clip();
  const wg = g.createRadialGradient(cx, cy, 10, cx, cy, w / 2);
  wg.addColorStop(0, '#2b3d7a'); wg.addColorStop(1, '#0a0f24');
  g.fillStyle = wg; g.fillRect(cx - w / 2, cy - h * 2, w, h * 4);
  const R = h * 1.32;
  const ig = g.createRadialGradient(cx, cy, 2, cx, cy, R);
  ig.addColorStop(0, '#f2ffff'); ig.addColorStop(0.28, '#22e4ff'); ig.addColorStop(0.68, '#3d7bff'); ig.addColorStop(1, '#8b5cff');
  g.fillStyle = ig; g.beginPath(); g.arc(cx, cy, R, 0, TAU); g.fill();
  g.lineWidth = 1.2;
  for (let k = 0; k < 64; k++) {
    const a = k * TAU / 64 + rnd() * 0.05;
    g.strokeStyle = k % 2 ? 'rgba(255,255,255,0.35)' : 'rgba(20,0,60,0.35)';
    g.beginPath(); g.moveTo(cx + Math.cos(a) * R * 0.45, cy + Math.sin(a) * R * 0.45); g.lineTo(cx + Math.cos(a) * R * 0.97, cy + Math.sin(a) * R * 0.97); g.stroke();
  }
  g.strokeStyle = '#120030'; g.lineWidth = 3; g.beginPath(); g.arc(cx, cy, R, 0, TAU); g.stroke();
  g.fillStyle = '#04010c'; g.beginPath(); g.arc(cx, cy, R * 0.4, 0, TAU); g.fill();
  g.strokeStyle = '#ff2bd6'; g.lineWidth = 3; g.beginPath(); g.arc(cx, cy, R * 0.4 + 2, 0, TAU); g.stroke();
  g.fillStyle = '#ffffff';
  g.beginPath(); g.arc(cx - R * 0.3, cy - R * 0.3, R * 0.16, 0, TAU); g.fill();
  g.beginPath(); g.arc(cx + R * 0.22, cy + R * 0.2, R * 0.07, 0, TAU); g.fill();
  g.restore();
  // paupières et cils
  g.save();
  g.lineJoin = 'round'; g.lineCap = 'round';
  lid(g); g.strokeStyle = '#04010c'; g.lineWidth = 11; g.stroke();
  lid(g); g.strokeStyle = '#22e4ff'; g.lineWidth = 3.5; g.stroke();
  g.strokeStyle = '#04010c'; g.lineWidth = 6;
  for (let k = 0; k < 9; k++) {
    const u = 0.1 + k * 0.1, x = (1 - u) * (1 - u) * (cx - w / 2) + 2 * (1 - u) * u * cx + u * u * (cx + w / 2);
    const y = (1 - u) * (1 - u) * cy + 2 * (1 - u) * u * (cy - h * 2) + u * u * cy;
    const a = -Math.PI / 2 + (u - 0.5) * 2.2;
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * 22, y + Math.sin(a) * 22); g.stroke();
  }
  g.restore();
  for (const dx of [-60, 8, 70]) drip(g, cx + dx, cy + h * 0.95 - Math.abs(dx) * 0.25, 3.2, 26 + rnd() * 34, '#22e4ff');
  q.save();
  q.shadowColor = '#22e4ff'; q.shadowBlur = 22; q.strokeStyle = '#9ff4ff'; q.lineWidth = 4;
  lid(q); q.stroke();
  q.shadowColor = '#ff2bd6'; q.strokeStyle = '#ff9df0'; q.lineWidth = 3;
  q.beginPath(); q.arc(cx, cy, h * 1.32 * 0.4 + 2, 0, TAU); q.stroke();
  q.restore();
}

// cœur néon à ailes de circuits
function heart(g, q, cx, cy, s, rnd) {
  const path = (c) => {
    c.beginPath();
    c.moveTo(cx, cy + s * 0.95);
    c.bezierCurveTo(cx - s * 1.5, cy + s * 0.1, cx - s * 0.95, cy - s * 0.95, cx, cy - s * 0.35);
    c.bezierCurveTo(cx + s * 0.95, cy - s * 0.95, cx + s * 1.5, cy + s * 0.1, cx, cy + s * 0.95);
    c.closePath();
  };
  // ailes : pistes de circuit en éventail
  for (const side of [-1, 1]) {
    for (let k = 0; k < 9; k++) {
      const col = k % 3 === 0 ? '#22e4ff' : k % 3 === 1 ? '#5dff8f' : '#ff4fa3';
      g.strokeStyle = col; g.lineWidth = 3; g.lineCap = 'round'; g.lineJoin = 'round';
      const y0 = cy - s * 0.3 + k * 9;
      const x1 = cx + side * (s * 0.9 + 30 + k * 6), y1 = y0 - 40 + k * 4;
      const x2 = x1 + side * (60 + rnd() * 50), y2 = y1 - 24 + k * 10;
      g.beginPath(); g.moveTo(cx + side * s * 0.7, y0); g.lineTo(x1, y1); g.lineTo(x2, y2); g.stroke();
      g.fillStyle = '#ffffff'; g.beginPath(); g.arc(x2, y2, 3.5, 0, TAU); g.fill();
      q.save(); q.shadowColor = col; q.shadowBlur = 10; q.strokeStyle = col; q.lineWidth = 2;
      q.beginPath(); q.moveTo(cx + side * s * 0.7, y0); q.lineTo(x1, y1); q.lineTo(x2, y2); q.stroke(); q.restore();
    }
  }
  g.save();
  g.shadowColor = '#ff2b6e'; g.shadowBlur = 40;
  path(g);
  const grd = g.createLinearGradient(cx - s, cy - s, cx + s, cy + s);
  grd.addColorStop(0, '#ff9ad0'); grd.addColorStop(0.45, '#ff2b6e'); grd.addColorStop(1, '#8a0f5a');
  g.fillStyle = grd; g.fill();
  g.restore();
  path(g); g.strokeStyle = '#120018'; g.lineWidth = 9; g.stroke();
  path(g); g.strokeStyle = '#ffd84a'; g.lineWidth = 3; g.stroke();
  // circuit gravé dans le cœur
  g.strokeStyle = 'rgba(255,255,255,0.45)'; g.lineWidth = 2;
  g.beginPath(); g.moveTo(cx - s * 0.5, cy - s * 0.1); g.lineTo(cx - s * 0.15, cy - s * 0.1); g.lineTo(cx, cy + s * 0.15); g.lineTo(cx + s * 0.18, cy - s * 0.25); g.lineTo(cx + s * 0.55, cy - s * 0.25); g.stroke();
  g.fillStyle = '#ffffff';
  g.beginPath(); g.ellipse(cx - s * 0.48, cy - s * 0.42, s * 0.18, s * 0.08, -0.6, 0, TAU); g.fill();
  drip(g, cx - s * 0.2, cy + s * 0.7, 3.5, 30, '#ff2b6e');
  drip(g, cx + s * 0.1, cy + s * 0.8, 3, 46, '#ff2b6e');
  q.save(); q.shadowColor = '#ff2b6e'; q.shadowBlur = 26; q.strokeStyle = '#ffc0dc'; q.lineWidth = 4; path(q); q.stroke(); q.restore();
}

// logo de NULL brisé, couronné par la peinture
function brokenNull(g, q, cx, cy, R, rnd) {
  rays(g, cx, cy, 18, 460, '#ffd84a', 0.08, 0.2);
  g.save();
  g.lineCap = 'round';
  // fragments de l'anneau (gris, fissurés) qui volent en éclats
  for (let k = 0; k < 7; k++) {
    const a0 = k * TAU / 7 + 0.15, a1 = a0 + TAU / 7 - 0.18;
    const off = 6 + rnd() * 14, am = (a0 + a1) / 2;
    const ox = Math.cos(am) * off, oy = Math.sin(am) * off;
    g.strokeStyle = '#1a0a10'; g.lineWidth = 26;
    g.beginPath(); g.arc(cx + ox, cy + oy, R, a0, a1); g.stroke();
    g.strokeStyle = k % 2 ? '#c42b4a' : '#ff3d6e'; g.lineWidth = 18;
    g.beginPath(); g.arc(cx + ox, cy + oy, R, a0, a1); g.stroke();
  }
  // barre oblique cassée en deux
  g.strokeStyle = '#1a0a10'; g.lineWidth = 26;
  g.beginPath(); g.moveTo(cx - R * 0.7, cy + R * 0.7); g.lineTo(cx - 8, cy + 6); g.stroke();
  g.beginPath(); g.moveTo(cx + 10, cy - 12); g.lineTo(cx + R * 0.7, cy - R * 0.7); g.stroke();
  g.strokeStyle = '#ff3d6e'; g.lineWidth = 18;
  g.beginPath(); g.moveTo(cx - R * 0.7, cy + R * 0.7); g.lineTo(cx - 8, cy + 6); g.stroke();
  g.beginPath(); g.moveTo(cx + 10, cy - 12); g.lineTo(cx + R * 0.7, cy - R * 0.7); g.stroke();
  g.restore();
  // vague de peinture arc-en-ciel qui traverse le logo
  const cols = ['#ff2bd6', '#ff7b1c', '#ffd84a', '#5dff8f', '#22e4ff', '#8b5cff'];
  g.save(); g.lineCap = 'round';
  cols.forEach((c, i) => {
    g.strokeStyle = c; g.lineWidth = 11;
    g.beginPath();
    g.moveTo(FX0, cy + 40 + i * 11);
    g.bezierCurveTo(cx - 120, cy - 70 + i * 11, cx + 80, cy + 110 + i * 11, FX0 + FW, cy - 30 + i * 11);
    g.stroke();
    q.save(); q.shadowColor = c; q.shadowBlur = 14; q.strokeStyle = c; q.lineWidth = 3;
    q.beginPath(); q.moveTo(FX0, cy + 40 + i * 11); q.bezierCurveTo(cx - 120, cy - 70 + i * 11, cx + 80, cy + 110 + i * 11, FX0 + FW, cy - 30 + i * 11); q.stroke(); q.restore();
  });
  g.restore();
  crown(g, cx, cy - R - 30, 30, '#ffd84a', '#120018');
  crown(q, cx, cy - R - 30, 30, '#ffd84a', '#ffd84a');
  for (let k = 0; k < 6; k++) drip(g, cx - 120 + k * 50 + rnd() * 20, cy + 70 + rnd() * 30, 3, 20 + rnd() * 40, cols[k]);
}

const VARIANTS = [
  // 0 · L'ŒIL DE LUMEN : soleil rétro, ville néon, œil géant, tag « LUMEN »
  (g, q, rnd) => {
    sky(g, [[0, '#07021a'], [0.34, '#2b0a5c'], [0.6, '#8a1f86'], [0.8, '#ff4f7a'], [1, '#ffb04a']]);
    stars(g, rnd, 160, 330, ['#ffffff', '#9ff4ff', '#ffc6f5']);
    sun(g, 281, 505, 150, '#fff27a', '#ff8a3d', '#ff2bd6');
    q.save(); q.shadowColor = '#ffb04a'; q.shadowBlur = 30; q.strokeStyle = '#ffe9a0'; q.lineWidth = 3; q.beginPath(); q.arc(281, 505, 150, Math.PI, TAU); q.stroke(); q.restore();
    skyline(g, q, rnd, 600, 50, 120, '#2a0c3e', ['#ff9df0', '#9ff4ff'], null);
    skyline(g, q, rnd, 600, 24, 86, '#06010e', ['#22e4ff', '#ff2bd6', '#ffd84a'], ['#22e4ff', '#ff2bd6', '#ffd84a', '#5dff8f']);
    eye(g, q, 281, 118, 300, 40, rnd);
    for (let i = 0; i < 9; i++) sparkle(g, 60 + rnd() * 440, 40 + rnd() * 200, 4 + rnd() * 7, i % 2 ? '#ffffff' : '#9ff4ff', 0.9);
    tagWord(g, q, 'LUMEN', 281, 278, 76, { fill: ['#fff27a', '#ffb02e', '#ff2bd6'], outline: '#120018', rim: '#22e4ff', glow: '#ff2bd6' }, rnd);
    crown(g, 132, 222, 18, '#ffd84a', '#120018');
    tagWord(g, q, 'CORTEX-9', 450, 440, 22, { fill: ['#ffffff', '#9ff4ff'], outline: '#120018', rim: '#ff2bd6', glow: '#22e4ff' }, rnd);
    for (let i = 0; i < 14; i++) splatter(g, rnd, 40 + rnd() * 480, 200 + rnd() * 240, 2 + rnd() * 4, ['#22e4ff', '#ff2bd6', '#ffd84a', '#5dff8f'][i % 4], 5);
  },
  // 1 · CŒUR DE LA STATION : nuit turquoise, cœur néon à ailes de circuits, tag « CORTEX-9 »
  (g, q, rnd) => {
    sky(g, [[0, '#010814'], [0.38, '#04213f'], [0.62, '#0b4a6e'], [0.84, '#1fa59a'], [1, '#9dffd9']]);
    stars(g, rnd, 200, 360, ['#ffffff', '#9dffd9', '#ffd84a']);
    g.save(); g.fillStyle = 'rgba(255,255,255,0.06)';
    for (let k = 0; k < 5; k++) { g.beginPath(); g.arc(281, 130, 70 + k * 46, 0, TAU); g.lineWidth = 2; g.strokeStyle = rgba('#9dffd9', 0.12 - k * 0.02); g.stroke(); }
    g.restore();
    skyline(g, q, rnd, 600, 60, 150, '#0a2a3e', ['#9dffd9', '#ffffff'], null);
    skyline(g, q, rnd, 600, 30, 96, '#020a12', ['#22e4ff', '#ff4fa3', '#ffd84a'], ['#ff4fa3', '#22e4ff', '#5dff8f']);
    heart(g, q, 281, 122, 62, rnd);
    for (let i = 0; i < 10; i++) sparkle(g, 50 + rnd() * 460, 40 + rnd() * 220, 4 + rnd() * 7, i % 2 ? '#ffffff' : '#9dffd9', 0.9);
    tagWord(g, q, 'CORTEX-9', 281, 280, 58, { fill: ['#e9ffd0', '#5dff8f', '#22e4ff'], outline: '#03121a', rim: '#ff4fa3', glow: '#5dff8f' }, rnd);
    tagWord(g, q, 'LUMEN', 120, 430, 24, { fill: ['#ffffff', '#ffc0dc'], outline: '#03121a', rim: '#22e4ff', glow: '#ff4fa3' }, rnd);
    for (let i = 0; i < 14; i++) splatter(g, rnd, 40 + rnd() * 480, 200 + rnd() * 240, 2 + rnd() * 4, ['#22e4ff', '#ff4fa3', '#ffd84a', '#5dff8f'][i % 4], 5);
  },
  // 2 · NULL VAINCU : couchant incandescent, logo de NULL brisé, vague arc-en-ciel, tag « LIBRES »
  (g, q, rnd) => {
    sky(g, [[0, '#12020a'], [0.36, '#3a0420'], [0.6, '#8a0f3a'], [0.82, '#ff5a36'], [1, '#ffd84a']]);
    stars(g, rnd, 140, 300, ['#ffffff', '#ffd84a', '#ffb0a0']);
    sun(g, 281, 520, 140, '#ffffff', '#ffd84a', '#ff5a36');
    skyline(g, q, rnd, 600, 50, 130, '#3a0a1c', ['#ffd84a', '#ffb0a0'], null);
    skyline(g, q, rnd, 600, 26, 90, '#0c0206', ['#ffd84a', '#22e4ff', '#ff2bd6'], ['#ffd84a', '#22e4ff', '#ff2bd6']);
    brokenNull(g, q, 281, 128, 62, rnd);
    for (let i = 0; i < 9; i++) sparkle(g, 60 + rnd() * 440, 40 + rnd() * 200, 4 + rnd() * 7, i % 2 ? '#ffffff' : '#ffd84a', 0.9);
    tagWord(g, q, 'LIBRES', 281, 284, 70, { fill: ['#ffffff', '#ffd84a', '#ff7b1c'], outline: '#14020a', rim: '#ff2bd6', glow: '#ffd84a' }, rnd);
    tagWord(g, q, 'LUMEN', 440, 440, 24, { fill: ['#ffffff', '#9ff4ff'], outline: '#14020a', rim: '#ff2bd6', glow: '#22e4ff' }, rnd);
    for (let i = 0; i < 14; i++) splatter(g, rnd, 40 + rnd() * 480, 200 + rnd() * 240, 2 + rnd() * 4, ['#22e4ff', '#ff2bd6', '#ffd84a', '#5dff8f'][i % 4], 5);
  },
];

// ------------------------------------------------------------------ affiches de propagande (calque statique)
const GREYS = ['#3b3e45', '#46494f', '#53565c', '#5f6268', '#6c6f74', '#7b7e82'];
const NULL_RED = '#7a3440';
const SLOGANS = [
  ['OBÉISSEZ', 'NULL VEILLE SUR VOUS'], ['NULL VOUS VOIT', 'TOUJOURS'], ['SILENCE', '= SÉCURITÉ'], ['RESTEZ', 'DANS LE RANG'],
  ['CITOYEN', 'CONFORME'], ['LA COULEUR', 'EST UN BUG'], ['NULL', 'ORDRE · CALME · GRIS'], ['TRAVAILLEZ', 'CONSOMMEZ · DORMEZ'],
  ['NE RÊVEZ PAS', 'C\'EST INUTILE'], ['SIGNALEZ', 'LES ARTISTES'],
];

function nullLogo(g, x, y, r, col) {
  g.save();
  g.strokeStyle = col; g.lineWidth = r * 0.22;
  g.beginPath(); g.arc(x, y, r, 0, TAU); g.stroke();
  g.beginPath(); g.moveTo(x - r * 0.75, y + r * 0.75); g.lineTo(x + r * 0.75, y - r * 0.75); g.stroke();
  g.restore();
}

function jagged(g, x, y, w, h, rnd, tear) {
  g.beginPath();
  const pts = [];
  const edge = (x0, y0, x1, y1, n, amp) => {
    for (let i = 0; i < n; i++) {
      const u = i / n;
      pts.push([x0 + (x1 - x0) * u + (rnd() - 0.5) * amp * (y0 === y1 ? 0.3 : 1), y0 + (y1 - y0) * u + (rnd() - 0.5) * amp * (x0 === x1 ? 0.3 : 1)]);
    }
  };
  const a = tear ? 5 : 1.2;
  edge(x, y, x + w, y, 8, a); edge(x + w, y, x + w, y + h, 8, a); edge(x + w, y + h, x, y + h, 8, a * (tear ? 2 : 1)); edge(x, y + h, x, y, 8, a);
  g.moveTo(pts[0][0], pts[0][1]);
  for (const p of pts) g.lineTo(p[0], p[1]);
  g.closePath();
}

function poster(g, x, y, w, h, rot, rnd, kind) {
  g.save();
  g.translate(x + w / 2, y + h / 2);
  g.rotate(rot);
  g.translate(-w / 2, -h / 2);
  // ombre
  g.fillStyle = 'rgba(0,0,0,0.35)';
  jagged(g, 2.5, 3.5, w, h, rnd, false); g.fill();
  const tear = rnd() < 0.3;
  jagged(g, 0, 0, w, h, rnd, tear);
  g.save();
  g.clip();
  const base = GREYS[(rnd() * GREYS.length) | 0];
  const grd = g.createLinearGradient(0, 0, w * 0.4, h);
  grd.addColorStop(0, base); grd.addColorStop(1, GREYS[Math.max(0, GREYS.indexOf(base) - 2)]);
  g.fillStyle = grd; g.fillRect(-4, -4, w + 8, h + 8);
  const ink = '#1e2024', light = '#9a9da1';
  const [t1, t2] = SLOGANS[kind % SLOGANS.length];
  g.textAlign = 'center'; g.textBaseline = 'middle';
  const fit = (str, maxW, size, weight = 700, font = FR) => {
    g.font = `${weight} ${size}px ${font}`;
    const m = g.measureText(str).width;
    if (m > maxW) g.font = `${weight} ${Math.max(6, size * maxW / m)}px ${font}`;
  };
  const motif = kind % 5;
  if (motif === 0) {            // logo de NULL + slogan
    nullLogo(g, w / 2, h * 0.36, Math.min(w, h) * 0.2, rnd() < 0.5 ? NULL_RED : ink);
    fit(t1, w * 0.86, h * 0.17, 700, FD); g.fillStyle = ink; g.fillText(t1, w / 2, h * 0.72);
    fit(t2, w * 0.8, h * 0.07); g.fillStyle = light; g.fillText(t2, w / 2, h * 0.86);
  } else if (motif === 1) {     // œil de surveillance
    const r = Math.min(w, h) * 0.24;
    g.fillStyle = ink;
    g.beginPath(); g.moveTo(w / 2 - r * 1.6, h * 0.38); g.quadraticCurveTo(w / 2, h * 0.38 - r * 1.5, w / 2 + r * 1.6, h * 0.38); g.quadraticCurveTo(w / 2, h * 0.38 + r * 1.5, w / 2 - r * 1.6, h * 0.38); g.fill();
    g.fillStyle = light; g.beginPath(); g.arc(w / 2, h * 0.38, r * 0.6, 0, TAU); g.fill();
    g.fillStyle = rnd() < 0.5 ? NULL_RED : ink; g.beginPath(); g.arc(w / 2, h * 0.38, r * 0.28, 0, TAU); g.fill();
    fit(t1, w * 0.86, h * 0.13, 700, FD); g.fillStyle = ink; g.fillText(t1, w / 2, h * 0.74);
    fit(t2, w * 0.7, h * 0.07); g.fillStyle = light; g.fillText(t2, w / 2, h * 0.87);
  } else if (motif === 2) {     // rangées de silhouettes
    const n = 5, sw = w * 0.8 / n;
    g.fillStyle = ink;
    for (let row = 0; row < 2; row++) {
      for (let i = 0; i < n; i++) {
        const sx = w * 0.1 + sw * (i + 0.5), sy = h * (0.25 + row * 0.2);
        g.beginPath(); g.arc(sx, sy, sw * 0.22, 0, TAU); g.fill();
        g.beginPath(); g.ellipse(sx, sy + sw * 0.5, sw * 0.38, sw * 0.26, 0, Math.PI, TAU); g.fill();
      }
    }
    fit(t1, w * 0.86, h * 0.15, 700, FD); g.fillStyle = ink; g.fillText(t1, w / 2, h * 0.72);
    fit(t2, w * 0.86, h * 0.09); g.fillStyle = rnd() < 0.5 ? NULL_RED : light; g.fillText(t2, w / 2, h * 0.86);
  } else if (motif === 3) {     // grand titre + code-barres
    g.fillStyle = ink; g.fillRect(0, 0, w, h * 0.3);
    fit(t1, w * 0.88, h * 0.18, 700, FD); g.fillStyle = light; g.fillText(t1, w / 2, h * 0.15);
    fit(t2, w * 0.86, h * 0.1); g.fillStyle = ink; g.fillText(t2, w / 2, h * 0.45);
    let bx = w * 0.15;
    g.beginPath();
    while (bx < w * 0.85) { const bw = 1 + rnd() * 3; g.rect(bx, h * 0.6, bw, h * 0.26); bx += bw + 1 + rnd() * 2.5; }
    g.fill();
  } else {                      // trame demi-teinte + slogan
    g.fillStyle = ink;
    g.beginPath();
    for (let yy = 4; yy < h * 0.6; yy += 6) for (let xx = 4; xx < w; xx += 6) {
      const s = 2.6 * (1 - yy / (h * 0.6)) * (0.5 + 0.5 * Math.sin(xx * 0.07 + yy * 0.05));
      if (s > 0.3) g.rect(xx - s, yy - s, s * 2, s * 2);
    }
    g.fill();
    fit(t1, w * 0.88, h * 0.16, 700, FD); g.fillStyle = ink; g.fillText(t1, w / 2, h * 0.72);
    fit(t2, w * 0.86, h * 0.08); g.fillStyle = light; g.fillText(t2, w / 2, h * 0.86);
  }
  // petits caractères
  g.fillStyle = 'rgba(20,22,26,0.5)';
  for (let k = 0; k < 3; k++) g.fillRect(w * 0.12, h * 0.93 + k * 2.2 - 4, w * (0.5 + rnd() * 0.25), 0.9);
  // plis de colle
  g.strokeStyle = 'rgba(255,255,255,0.08)'; g.lineWidth = 1;
  for (let k = 0; k < 2; k++) { g.beginPath(); g.moveTo(rnd() * w, 0); g.lineTo(rnd() * w, h); g.stroke(); }
  g.restore();
  // ruban adhésif
  g.fillStyle = 'rgba(200,200,190,0.28)';
  for (const [tx, ty] of [[0, 0], [w, 0]]) {
    if (rnd() < 0.5) continue;
    g.save(); g.translate(tx, ty); g.rotate(tx ? 0.7 : -0.7); g.fillRect(-9, -3, 18, 6); g.restore();
  }
  g.restore();
}

function drawPosters(g, mg) {
  const rnd = mulberry32(4242 + mg.level);
  // mur de béton (visible entre les affiches)
  g.fillStyle = '#16171b'; g.fillRect(FX0, FY0, FW, FH);
  for (let i = 0; i < 260; i++) {
    g.fillStyle = rnd() < 0.5 ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.12)';
    g.fillRect(FX0 + rnd() * FW, FY0 + rnd() * FH, 2 + rnd() * 10, 1 + rnd() * 3);
  }
  // rangées d'affiches qui se chevauchent
  let kind = (rnd() * 10) | 0;
  for (let y = 4; y < WALL_BOTTOM; ) {
    const h = 64 + rnd() * 46;
    for (let x = 6 + rnd() * -30; x < 590; ) {
      const w = 58 + rnd() * 52;
      poster(g, x + (rnd() - 0.5) * 6, y + (rnd() - 0.5) * 6, w, h, (rnd() - 0.5) * 0.08, rnd, kind++);
      x += w - 4 + rnd() * 8;
    }
    y += h - 6 + rnd() * 6;
  }
  // affichettes collées par-dessus
  for (let i = 0; i < 22; i++) {
    const w = 30 + rnd() * 30, h = w * (1.2 + rnd() * 0.4);
    poster(g, 30 + rnd() * 500, 30 + rnd() * 540, w, h, (rnd() - 0.5) * 0.3, rnd, kind++);
  }
  // salissures et coulures grises
  for (let i = 0; i < 40; i++) {
    g.fillStyle = `rgba(10,10,12,${0.08 + rnd() * 0.12})`;
    const x = FX0 + rnd() * FW, y = FY0 + rnd() * 500;
    g.fillRect(x, y, 1.2 + rnd() * 2, 8 + rnd() * 40);
  }
  // pénombre vers les bords du dôme
  const rg = g.createRadialGradient(300, 330, 120, 300, 300, 300);
  rg.addColorStop(0, 'rgba(0,0,0,0)'); rg.addColorStop(1, 'rgba(0,0,0,0.45)');
  g.fillStyle = rg; g.fillRect(FX0, FY0, FW, FH);
}
const WALL_BOTTOM = 594;

// ------------------------------------------------------------------ calque statique
export function drawGraffitiStatic(g, mg) {
  const G = mg.geo;
  const out = G.outline;
  g.save();
  // mur couvert d'affiches
  g.beginPath();
  g.moveTo(out[0][0], out[0][1]);
  for (const p of out) g.lineTo(p[0], p[1]);
  g.closePath();
  g.clip();
  drawPosters(g, mg);
  g.restore();
  // plinthe métallique au pied du mur
  g.save();
  g.beginPath();
  g.moveTo(20 + 90 * 0.42, 590); g.lineTo(542 - 90 * 0.42, 590); g.lineTo(542 - 104 * 0.42, 604); g.lineTo(20 + 104 * 0.42, 604); g.closePath();
  g.clip();
  g.fillStyle = '#20232c'; g.fillRect(40, 590, 490, 14);
  g.fillStyle = rgba(G.lime, 0.4);
  for (let x = 40; x < 540; x += 16) { g.beginPath(); g.moveTo(x, 604); g.lineTo(x + 8, 590); g.lineTo(x + 14, 590); g.lineTo(x + 6, 604); g.fill(); }
  g.fillStyle = 'rgba(255,255,255,0.18)'; g.fillRect(40, 590, 490, 1.2);
  g.restore();
  // sol devant le mur : bâche tachée de peinture, coulures, bombes vides
  const rnd = mulberry32(77 + mg.level);
  g.save();
  g.beginPath(); g.rect(60, 604, 442, 116); g.clip();
  const cols = ['#ff2bd6', '#22e4ff', '#ffd84a', '#5dff8f', '#ff7b1c', '#8b5cff'];
  for (let i = 0; i < 26; i++) splatter(g, rnd, 70 + rnd() * 420, 610 + rnd() * 100, 1.5 + rnd() * 4, rgba(cols[i % 6], 0.35 + rnd() * 0.3), 4);
  for (let i = 0; i < 18; i++) drip(g, 64 + rnd() * 430, 603, 1.6 + rnd() * 1.4, 6 + rnd() * 26, rgba(cols[i % 6], 0.5));
  g.restore();
  // inscriptions au pochoir
  g.save();
  g.font = `700 10px ${FD}`; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillStyle = rgba(G.lime, 0.5);
  g.fillText('MUR PEINT', 281, 626);
  g.restore();
  // cadre de la jauge
  g.save();
  g.fillStyle = 'rgba(4,6,2,0.88)';
  g.beginPath(); g.roundRect ? g.roundRect(GA.x0 - 6, GA.y - 10, GA.x1 - GA.x0 + 12, 20, 10) : g.rect(GA.x0 - 6, GA.y - 10, GA.x1 - GA.x0 + 12, 20); g.fill();
  g.strokeStyle = rgba(G.lime, 0.45); g.lineWidth = 1.2; g.stroke();
  g.restore();
  // ombres des bombes de peinture
  for (const B of G.bombs) {
    g.fillStyle = 'rgba(0,0,0,0.5)';
    g.beginPath(); g.ellipse(B.x + 5, B.y + 8, 30, 28, 0, 0, TAU); g.fill();
  }
}
const GA = { x0: 120, x1: 442, y: 646 };

// ------------------------------------------------------------------ calque de peinture
class PaintArt {
  constructor(mg, S) {
    this.mg = mg;
    this.S = S;
    const f = getFresco((mg.level - 1) % VARIANTS.length, S);
    this.fresco = f.base; this.glow = f.glow;
    this.cv = mk(FW * S, FH * S);
    this.g = this.cv.getContext('2d');
    this.g.setTransform(S, 0, 0, S, -FX0 * S, -FY0 * S);
    this.clip = innerPath(mg.geo.outline);
    this.full = false;
    this.wipes = [];           // traînées humides des drones (rendu)
    this.replay();
  }

  // repeint tout le calque d'après la grille (peinture conservée, création tardive)
  replay() {
    const mg = this.mg, { x0, y0, cell, cols } = mg.geo.grid;
    for (const k of mg.counted) {
      if (!mg.paint[k]) continue;
      const x = x0 + (k % cols + 0.5) * cell, y = y0 + ((k / cols | 0) + 0.5) * cell;
      this.stamp(x, y, cell * 0.85, mg.hueOf[k] / 255 * 360, 'kept');
    }
  }

  // forme organique : polygone bruité
  blobPath(x, y, r, n, jit) {
    const p = new Path2D();
    const a0 = Math.random() * TAU;
    for (let i = 0; i <= n; i++) {
      const a = a0 + i * TAU / n, rr = r * (1 - jit + Math.random() * jit * 2);
      if (i === 0) p.moveTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
      else p.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    }
    p.closePath();
    return p;
  }

  reveal(path, x, y, R) {
    const g = this.g;
    g.save();
    g.clip(path);
    const sx = Math.max(FX0, x - R), sy = Math.max(FY0, y - R);
    const ex = Math.min(FX0 + FW, x + R), ey = Math.min(FY0 + FH, y + R);
    const S = this.S;
    if (ex > sx && ey > sy) g.drawImage(this.fresco, (sx - FX0) * S, (sy - FY0) * S, (ex - sx) * S, (ey - sy) * S, sx, sy, ex - sx, ey - sy);
    g.restore();
  }

  stamp(x, y, r, h, kind) {
    const g = this.g, col = hueHex(h);
    if (kind === 'splash') {
      // tache centrale + bras d'éclaboussure + postillons + coulures
      const p = this.blobPath(x, y, r, 20, 0.22);
      const arms = Math.round(5 + Math.random() * 4);
      for (let i = 0; i < arms; i++) {
        const a = Math.random() * TAU, l = r * (1.15 + Math.random() * 0.55), w = r * (0.1 + Math.random() * 0.1);
        const ex = x + Math.cos(a) * l, ey = y + Math.sin(a) * l;
        p.moveTo(x + Math.cos(a + 1.4) * w, y + Math.sin(a + 1.4) * w);
        p.lineTo(ex, ey);
        p.lineTo(x + Math.cos(a - 1.4) * w, y + Math.sin(a - 1.4) * w);
        p.closePath();
        p.moveTo(ex + w * 1.1, ey);
        p.arc(ex, ey, w * 1.1, 0, TAU);
      }
      g.save();
      g.globalCompositeOperation = 'destination-over';
      g.fillStyle = col;
      g.translate(x, y); g.scale(1.08, 1.08); g.translate(-x, -y); g.fill(p);
      g.restore();
      this.reveal(p, x, y, r * 1.9);
      this.speckles(x, y, r, col, 12, 1.25, 2.1);
      for (let i = 0; i < 2; i++) this.drip(x + (Math.random() - 0.5) * r * 1.4, y + r * (0.5 + Math.random() * 0.4), Math.min(3, r * 0.08), Math.min(40, r * (0.4 + Math.random() * 0.8)), col);
      return;
    }
    const n = kind === 'kept' ? 9 : 12;
    const jit = kind === 'kept' ? 0.18 : 0.12;
    const p = this.blobPath(x, y, r, n, jit);
    // liseré coloré (déborde de 12 %) glissé SOUS la peinture existante : il ne reste
    // visible qu'au bord de la zone peinte ; puis la fresque à l'intérieur
    g.save();
    g.globalCompositeOperation = 'destination-over';
    g.fillStyle = col;
    g.translate(x, y); g.scale(1.14, 1.14); g.translate(-x, -y); g.fill(p);
    g.restore();
    this.reveal(p, x, y, r * 1.3);
    if (kind === 'blob') {
      this.speckles(x, y, r, col, 4, 1.2, 1.8);
      if (Math.random() < 0.3) this.drip(x, y + r * 0.6, Math.min(2.4, r * 0.14), Math.min(30, r * (0.6 + Math.random() * 1.2)), col);
    } else if (kind === 'stamp') {
      if (Math.random() < 0.5) this.speckles(x, y, r, col, 2, 1.15, 1.7);
      if (Math.random() < 0.03) this.drip(x + (Math.random() - 0.5) * r, y + r * 0.75, Math.max(1.1, Math.min(2.6, r * 0.09)), Math.min(34, r * (0.5 + Math.random() * 1.2)), col);
    }
  }

  speckles(x, y, r, col, n, d0, d1) {
    const g = this.g;
    g.fillStyle = col;
    g.beginPath();
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU, d = r * (d0 + Math.random() * (d1 - d0)), s = Math.max(0.6, r * (0.04 + Math.random() * 0.08));
      const px = x + Math.cos(a) * d, py = y + Math.sin(a) * d;
      g.moveTo(px + s, py); g.arc(px, py, s, 0, TAU);
    }
    g.fill();
  }

  drip(x, y, w, len, col) {
    const g = this.g;
    drip(g, x, y, w, len, col);
    g.fillStyle = 'rgba(255,255,255,0.35)';
    g.fillRect(x - w * 0.25, y, w * 0.3, len * 0.8);
  }

  erase(x, y, r, x0, y0) {
    const g = this.g;
    g.save();
    g.globalCompositeOperation = 'destination-out';
    g.lineCap = 'round';
    g.strokeStyle = '#000';
    g.lineWidth = r * 2;
    g.beginPath(); g.moveTo(x0, y0); g.lineTo(x + 0.01, y); g.stroke();
    g.restore();
  }

  revealAll() {
    const g = this.g;
    g.save(); g.setTransform(1, 0, 0, 1, 0, 0);
    g.drawImage(this.fresco, 0, 0);
    g.restore();
    this.full = true;
  }

  flush(ops) {
    let n = 0;
    while (ops.length && n < 140) {
      const o = ops.shift();
      n++;
      if (o.k === 'erase') { this.erase(o.x, o.y, o.r, o.x0, o.y0); continue; }
      this.stamp(o.x, o.y, o.r, o.h, o.k);
    }
  }
}

// ------------------------------------------------------------------ rendu par image
export function renderGraffiti(ctx, r, mg) {
  if (typeof document === 'undefined') return;
  if (!mg.art) { mg.ops = []; mg.art = new PaintArt(mg, canvasScale(r)); }
  const A = mg.art, t = r.time;
  A.flush(mg.ops);
  // victoire : la fresque entière se révèle depuis la bille
  let wave = -1;
  if (mg.won) {
    if (mg.winR0 === undefined) mg.winR0 = t;
    wave = (t - mg.winR0) * 760;
    if (wave > 900 && !A.full) A.revealAll();
  }
  ctx.save();
  ctx.clip(A.clip);
  ctx.drawImage(A.cv, FX0, FY0, FW, FH);
  if (wave >= 0 && !A.full) {
    ctx.save();
    ctx.beginPath(); ctx.arc(mg.winX, mg.winY, Math.max(1, wave), 0, TAU); ctx.clip();
    ctx.drawImage(A.fresco, FX0, FY0, FW, FH);
    ctx.restore();
  }
  if (wave >= 0) {
    // illumination : halos néon de la fresque, pulsation
    const u = (t - mg.winR0);
    const k = (u < 1.2 ? Math.min(1, u / 0.4) * (0.6 + 0.4 * Math.sin(u * 30)) : 0.5 + 0.2 * Math.sin(u * 4)) * 0.7;
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = k;
    ctx.drawImage(A.glow, FX0, FY0, FW, FH);
    ctx.globalAlpha = 1;
    if (!A.full || wave < 1100) {
      ctx.lineWidth = 16;
      for (let i = 0; i < 6; i++) {
        ctx.strokeStyle = hueHex(i * 60 + t * 200);
        ctx.globalAlpha = 0.5;
        ctx.beginPath(); ctx.arc(mg.winX, mg.winY, Math.max(1, wave - i * 14), 0, TAU); ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }
    ctx.globalCompositeOperation = 'source-over';
  }
  // peinture fraîche : brillance humide qui suit la bille
  ctx.globalCompositeOperation = 'lighter';
  for (const f of mg.fresh) {
    const a = 1 - f.t / 0.7;
    ctx.globalAlpha = a * 0.55;
    const s = f.r * 3.2;
    ctx.drawImage(glowSprite(hueHex(f.h), 64), f.x - s / 2, f.y - s / 2, s, s);
  }
  ctx.globalAlpha = 1;
  // ondes d'éclaboussure
  for (const p of mg.ripples) {
    const u = p.t / 0.5;
    ctx.strokeStyle = hueHex(p.h); ctx.globalAlpha = 0.8 * (1 - u); ctx.lineWidth = 4 * (1 - u) + 1;
    ctx.beginPath(); ctx.arc(p.x, p.y, p.r * (0.6 + u * 0.9), 0, TAU); ctx.stroke();
  }
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  // palier franchi : balayage lumineux du mur
  if (mg.milestoneFx > 0) {
    const u = 1 - mg.milestoneFx / 1.2;
    const y = 600 - u * 620;
    ctx.globalCompositeOperation = 'lighter';
    const grd = ctx.createLinearGradient(0, y - 40, 0, y + 40);
    grd.addColorStop(0, 'rgba(230,255,61,0)'); grd.addColorStop(0.5, rgba(mg.geo.lime, 0.35 * (1 - u))); grd.addColorStop(1, 'rgba(230,255,61,0)');
    ctx.fillStyle = grd; ctx.fillRect(FX0, y - 40, FW, 80);
    ctx.globalCompositeOperation = 'source-over';
  }
  ctx.restore();
  for (const d of mg.drones) drawDrone(ctx, r, mg, d, t);
  for (const b of mg.bombs) drawBomb(ctx, r, mg, b, t);
  if (mg.cap) drawCapsule(ctx, r, mg, mg.cap, t);
  drawGauge(ctx, r, mg, t);
}

// bombe de peinture vue de dessus : flaque, corps chromé, capuchon coloré, buse
const PUDDLES = new Map();
function drawBomb(ctx, r, mg, b, t) {
  const x = b.x, y = b.y, col = b.color;
  let pud = PUDDLES.get(b.i);
  if (!pud) {
    const rnd = mulberry32(31 + b.i * 7);
    pud = new Path2D();
    const n = 14, pts = [];
    for (let i = 0; i < n; i++) { const a = i * TAU / n, rr = 33 + rnd() * 10; pts.push([Math.cos(a) * rr, Math.sin(a) * rr]); }
    // contour lissé (milieux reliés par des courbes) : flaque, pas engrenage
    const mid = (i) => { const a = pts[i % n], b = pts[(i + 1) % n]; return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]; };
    pud.moveTo(...mid(0));
    for (let i = 1; i <= n; i++) { const c = pts[i % n], m = mid(i); pud.quadraticCurveTo(c[0], c[1], m[0], m[1]); }
    pud.closePath();
    for (let i = 0; i < 4; i++) { const a = rnd() * TAU, d = 44 + rnd() * 8; pud.moveTo(Math.cos(a) * d + 3, Math.sin(a) * d); pud.arc(Math.cos(a) * d, Math.sin(a) * d, 3, 0, TAU); }
    PUDDLES.set(b.i, pud);
  }
  r.glow(x, y, 120, col, 0.25 + b.flash * 0.6);
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = rgba(col, 0.55);
  ctx.fill(pud);
  const s = 1 + b.wob * 0.12 * Math.sin(t * 50);
  ctx.scale(s, s);
  // corps : anneau chromé
  const grd = ctx.createRadialGradient(-8, -9, 2, 0, 0, 27);
  grd.addColorStop(0, '#ffffff'); grd.addColorStop(0.45, '#9aa6bd'); grd.addColorStop(1, '#262c3a');
  ctx.fillStyle = grd;
  ctx.beginPath(); ctx.arc(0, 0, 26, 0, TAU); ctx.fill();
  ctx.strokeStyle = '#11141c'; ctx.lineWidth = 2; ctx.stroke();
  // bague d'étiquette rayée
  for (let k = 0; k < 12; k++) {
    ctx.fillStyle = k % 2 ? rgba(col, 0.85) : '#10131c';
    ctx.beginPath(); ctx.arc(0, 0, 24, k * TAU / 12, (k + 1) * TAU / 12); ctx.arc(0, 0, 20.5, (k + 1) * TAU / 12, k * TAU / 12, true); ctx.closePath(); ctx.fill();
  }
  // capuchon coloré
  const cg = ctx.createRadialGradient(-5, -6, 1, 0, 0, 19);
  cg.addColorStop(0, '#ffffff'); cg.addColorStop(0.3, col); cg.addColorStop(1, rgba(col, 0.6));
  ctx.fillStyle = b.flash > 0.5 ? '#ffffff' : cg;
  ctx.beginPath(); ctx.arc(0, 0, 19, 0, TAU); ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = 1.5; ctx.stroke();
  // coulures sur le capuchon
  ctx.fillStyle = rgba(col, 0.9);
  for (let k = 0; k < 3; k++) { const a = 0.6 + k * 2.1; ctx.beginPath(); ctx.ellipse(Math.cos(a) * 21, Math.sin(a) * 21, 3, 5.5, a, 0, TAU); ctx.fill(); }
  // buse (diffuseur)
  ctx.rotate(-0.6 + b.i * 0.9);
  ctx.fillStyle = '#f2f2ee'; ctx.fillRect(-7, -6, 14, 12);
  ctx.fillStyle = '#1a1d26'; ctx.beginPath(); ctx.arc(5, 0, 2.2, 0, TAU); ctx.fill();
  ctx.restore();
  // anneau d'impact
  if (b.flash > 0) {
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = rgba(col, b.flash); ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(x, y, 30 + (1 - b.flash) * 18, 0, TAU); ctx.stroke();
    ctx.globalCompositeOperation = 'source-over';
  }
}

// drone nettoyeur : disque brosseur, quatre rotors, œil rouge de NULL ; sonné : étoiles et étincelles
function drawDrone(ctx, r, mg, d, t) {
  const x = d.x, y = d.y;
  const k = d.warp;
  if (k <= 0) return;
  const stun = d.stun > 0;
  if (k < 1) {
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = rgba('#9fd8ff', 0.25 * (1 - k));
    ctx.fillRect(x - 18, 20, 36, y - 20);
    ctx.globalCompositeOperation = 'source-over';
  }
  // traînée humide : colle fraîche des affiches recollées derrière le drone
  if (!d.wet) d.wet = [];
  const W = d.wet;
  if (!stun && k >= 1 && (!W.length || Math.hypot(W[W.length - 1].x - x, W[W.length - 1].y - y) > 6)) { W.push({ x, y, t }); if (W.length > 18) W.shift(); }
  if (W.length > 1) {
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    ctx.lineWidth = mg.T.eraseR * 1.7;
    for (let i = 1; i < W.length; i++) {
      const u = (t - W[i].t) / 1.6;
      if (u >= 1) continue;
      ctx.strokeStyle = rgba('#bfe9ff', 0.09 * (1 - u));
      ctx.beginPath(); ctx.moveTo(W[i - 1].x, W[i - 1].y); ctx.lineTo(W[i].x, W[i].y); ctx.stroke();
    }
    ctx.globalCompositeOperation = 'source-over';
  }
  ctx.save();
  ctx.globalAlpha = k < 1 ? k * (0.6 + 0.4 * Math.sin(t * 50)) : 1;
  // mousse de nettoyage sous le drone
  if (!stun && d.scrub > 0) {
    ctx.fillStyle = rgba('#dff6ff', 0.25 * d.scrub);
    ctx.beginPath(); ctx.arc(x, y, mg.T.eraseR, 0, TAU); ctx.fill();
    ctx.fillStyle = rgba('#ffffff', 0.7 * d.scrub);
    for (let i = 0; i < 6; i++) {
      const a = t * 3 + i * 1.05 + d.seed, rr = mg.T.eraseR * (0.6 + 0.35 * Math.sin(t * 7 + i));
      ctx.beginPath(); ctx.arc(x + Math.cos(a) * rr, y + Math.sin(a) * rr, 1.6 + (i % 3), 0, TAU); ctx.fill();
    }
  }
  r.glow(x, y, 70, stun ? '#ffd84a' : '#9fd8ff', 0.25 + d.flash * 0.5);
  ctx.translate(x, y);
  ctx.rotate(stun ? d.spin : Math.sin(t * 1.3 + d.seed) * 0.15);
  // bras et rotors
  ctx.strokeStyle = '#2c3242'; ctx.lineWidth = 4;
  for (let i = 0; i < 4; i++) {
    const a = Math.PI / 4 + i * Math.PI / 2;
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(a) * 19, Math.sin(a) * 19); ctx.stroke();
  }
  for (let i = 0; i < 4; i++) {
    const a = Math.PI / 4 + i * Math.PI / 2, rx = Math.cos(a) * 20, ry = Math.sin(a) * 20;
    ctx.fillStyle = 'rgba(180,220,255,0.18)';
    ctx.beginPath(); ctx.arc(rx, ry, 8, 0, TAU); ctx.fill();
    ctx.strokeStyle = 'rgba(220,240,255,0.6)'; ctx.lineWidth = 1.4;
    const ra = t * 40 + i;
    ctx.beginPath(); ctx.moveTo(rx - Math.cos(ra) * 7, ry - Math.sin(ra) * 7); ctx.lineTo(rx + Math.cos(ra) * 7, ry + Math.sin(ra) * 7); ctx.stroke();
  }
  // coque
  const grd = ctx.createRadialGradient(-5, -6, 2, 0, 0, 16);
  grd.addColorStop(0, '#f4f7ff'); grd.addColorStop(0.5, '#a9b3c6'); grd.addColorStop(1, '#3a4152');
  ctx.fillStyle = grd;
  ctx.beginPath(); ctx.arc(0, 0, 15, 0, TAU); ctx.fill();
  ctx.strokeStyle = d.flash > 0.4 ? '#ffffff' : '#1a1f2a'; ctx.lineWidth = 2; ctx.stroke();
  // raclette (avant)
  ctx.fillStyle = '#1a1f2a'; ctx.fillRect(-12, 9, 24, 4);
  ctx.fillStyle = '#9fd8ff'; ctx.fillRect(-11, 12, 22, 1.5);
  // œil de NULL
  ctx.fillStyle = stun ? '#3a2a10' : '#ff3d6e';
  ctx.beginPath(); ctx.arc(0, -1, 5, 0, TAU); ctx.fill();
  if (!stun) { ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(-1.5, -2.5, 1.4, 0, TAU); ctx.fill(); }
  ctx.restore();
  if (stun) {
    // étoiles qui tournent
    for (let i = 0; i < 3; i++) {
      const a = t * 5 + i * TAU / 3;
      sparkleCtx(ctx, x + Math.cos(a) * 20, y - 22 + Math.sin(a) * 6, 4, '#ffd84a');
    }
    if (Math.random() < 0.25) mg.game.fx.spark(x + (Math.random() - 0.5) * 20, y + (Math.random() - 0.5) * 20, 600);
  }
}

function sparkleCtx(ctx, x, y, s, col) {
  ctx.fillStyle = col;
  ctx.beginPath();
  ctx.moveTo(x, y - s); ctx.lineTo(x + s * 0.3, y - s * 0.3); ctx.lineTo(x + s, y); ctx.lineTo(x + s * 0.3, y + s * 0.3);
  ctx.lineTo(x, y + s); ctx.lineTo(x - s * 0.3, y + s * 0.3); ctx.lineTo(x - s, y); ctx.lineTo(x - s * 0.3, y - s * 0.3);
  ctx.closePath(); ctx.fill();
}

// capsule AÉROSOL : bombe flottante, anneau de durée
function drawCapsule(ctx, r, mg, c, t) {
  const lime = mg.geo.lime;
  const left = 1 - c.t / c.life;
  const blink = left < 0.3 && Math.sin(t * 20) < 0 ? 0.4 : 1;
  const bob = Math.sin(t * 3) * 3;
  const x = c.x, y = c.y + bob;
  const pop = Math.min(1, c.t / 0.35);
  r.glow(x, y, 110, lime, (0.4 + 0.2 * Math.sin(t * 6)) * blink * pop);
  ctx.save();
  ctx.globalAlpha = blink;
  ctx.strokeStyle = rgba(lime, 0.85); ctx.lineWidth = 3;
  ctx.beginPath(); ctx.arc(x, y, 30, -Math.PI / 2, -Math.PI / 2 + TAU * left); ctx.stroke();
  ctx.setLineDash([4, 6]); ctx.lineDashOffset = -t * 30;
  ctx.strokeStyle = rgba(lime, 0.4); ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.arc(x, y, 36 + Math.sin(t * 6) * 2, 0, TAU); ctx.stroke();
  ctx.setLineDash([]);
  ctx.translate(x, y);
  ctx.rotate(Math.sin(t * 2.2) * 0.25);
  ctx.scale(pop, pop);
  // bombe debout
  const grd = ctx.createLinearGradient(-9, 0, 9, 0);
  grd.addColorStop(0, '#5a6378'); grd.addColorStop(0.35, '#f2f6ff'); grd.addColorStop(1, '#3a4152');
  ctx.fillStyle = grd;
  ctx.beginPath(); ctx.roundRect ? ctx.roundRect(-9, -12, 18, 30, 4) : ctx.rect(-9, -12, 18, 30); ctx.fill();
  const lg = ctx.createLinearGradient(0, -6, 0, 12);
  lg.addColorStop(0, '#ff2bd6'); lg.addColorStop(0.5, '#ffd84a'); lg.addColorStop(1, '#22e4ff');
  ctx.fillStyle = lg; ctx.fillRect(-9, -4, 18, 15);
  ctx.fillStyle = lime; ctx.fillRect(-6, -19, 12, 7);
  ctx.fillStyle = '#f2f2ee'; ctx.fillRect(-3, -23, 6, 4);
  ctx.font = `900 9px ${FD}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillStyle = '#120018'; ctx.fillText('×2', 0, 4);
  ctx.restore();
  r.text('AÉROSOL', x, y + 46, 10, lime, 'center', 0.85 * blink, true);
}

// jauge de couverture au pied du mur : arc-en-ciel, repères 25 / 50 / 70
function drawGauge(ctx, r, mg, t) {
  const { x0, x1, y } = GA, W = x1 - x0;
  const pct = mg.won ? Math.max(mg.geo.target, mg.coverage()) : mg.coverage();
  const u = clamp(pct / 100, 0, 1);
  if (mg.gaugeU === undefined) mg.gaugeU = u;
  mg.gaugeU += (u - mg.gaugeU) * 0.15;
  const gu = mg.gaugeU;
  const grd = ctx.createLinearGradient(x0, 0, x1, 0);
  for (let i = 0; i <= 6; i++) grd.addColorStop(i / 6, hueHex(i * 50 + t * 40));
  ctx.fillStyle = grd;
  ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x0, y - 5, Math.max(2, W * gu), 10, 5) : ctx.rect(x0, y - 5, W * gu, 10); ctx.fill();
  r.glow(x0 + W * gu, y, 40, hueHex(t * 40 + 300), 0.7);
  // repères
  for (const m of [25, 50, mg.geo.target]) {
    const mx = x0 + W * m / 100, on = pct >= m, goal = m === mg.geo.target;
    ctx.fillStyle = on ? '#ffffff' : goal ? mg.geo.lime : 'rgba(255,255,255,0.35)';
    ctx.fillRect(mx - 1, y - 9, 2, 18);
    if (goal) {
      const blink = on ? 1 : 0.6 + 0.4 * Math.sin(t * 5);
      ctx.fillStyle = rgba(mg.geo.lime, blink);
      ctx.beginPath(); ctx.moveTo(mx, y - 10); ctx.lineTo(mx + 10, y - 15); ctx.lineTo(mx, y - 20); ctx.closePath(); ctx.fill();
      ctx.fillRect(mx - 1, y - 21, 1.6, 12);
    }
  }
  const big = mg.milestoneFx > 0 ? 1 + 0.25 * mg.milestoneFx : 1;
  ctx.save();
  ctx.translate(281, 676);
  ctx.scale(big, big);
  ctx.font = `900 22px ${FD}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = '#05010a'; ctx.lineWidth = 6;
  const str = `${Math.floor(pct)} %`;
  ctx.strokeText(str, 0, 0);
  ctx.fillStyle = pct >= mg.geo.target ? '#ffffff' : mg.geo.lime;
  ctx.fillText(str, 0, 0);
  ctx.restore();
  r.text(`OBJECTIF ${mg.geo.target} %`, x1 - 2, 676, 10, 'rgba(230,255,61,0.75)', 'right', 1, true);
  if (mg.aerosolT > 0) r.text(`AÉROSOL ×2 · ${Math.ceil(mg.aerosolT)} s`, x0 + 2, 676, 10, hueLight(t * 120), 'left', 1, true);
}

// ------------------------------------------------------------------ au-dessus de la bille
export function renderGraffitiTop(ctx, r, mg) {
  if (typeof document === 'undefined') return;
  const t = r.time;
  // aura d'aérosol autour de la bille
  const b = mg.ball;
  if (b && b.state === 'free' && mg.aerosolT > 0) {
    const k = Math.min(1, mg.aerosolT / 1.5);
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 5; i++) {
      const a = t * 9 + i * TAU / 5, rr = 22 + Math.sin(t * 13 + i) * 4;
      ctx.globalAlpha = 0.5 * k;
      ctx.drawImage(glowSprite(hueHex(mg.hue + i * 72), 32), b.x + Math.cos(a) * rr - 9, b.y + Math.sin(a) * rr - 9, 18, 18);
    }
    ctx.globalAlpha = 0.35 * k;
    ctx.drawImage(glowSprite(hueHex(mg.hue), 64), b.x - 40, b.y - 40, 80, 80);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }
  // gouttes en vol
  for (const o of mg.blobs) {
    const col = hueHex(o.h);
    ctx.strokeStyle = col; ctx.lineCap = 'round'; ctx.lineWidth = o.r * 0.7;
    ctx.beginPath(); ctx.moveTo(o.x - o.vx * 0.03, o.y - o.vy * 0.03); ctx.lineTo(o.x, o.y); ctx.stroke();
    ctx.fillStyle = hueLight(o.h);
    ctx.beginPath(); ctx.arc(o.x, o.y, o.r * 0.4, 0, TAU); ctx.fill();
  }
  // onomatopées peintes
  for (const p of mg.pops) {
    const u = p.t / p.life;
    const sc = p.s * (u < 0.15 ? 0.5 + u / 0.15 * 0.7 : 1.2 - Math.min(0.2, (u - 0.15) * 0.4));
    const a = u > 0.7 ? 1 - (u - 0.7) / 0.3 : 1;
    ctx.save();
    ctx.translate(p.x, p.y - u * 14);
    ctx.rotate(p.rot);
    ctx.scale(sc, sc);
    ctx.globalAlpha = a;
    ctx.font = `900 17px ${FD}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
    ctx.strokeStyle = '#05010a'; ctx.lineWidth = 7; ctx.strokeText(p.str, 2, 2.5);
    ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 3.5; ctx.strokeText(p.str, 0, 0);
    ctx.fillStyle = hueHex(p.h); ctx.fillText(p.str, 0, 0);
    ctx.restore();
  }
  ctx.globalAlpha = 1;
  // palier franchi : grand chiffre tagué au milieu du mur
  if (mg.milestoneFx > 0 && mg.milestoneText) {
    const u = 1 - mg.milestoneFx / 1.2;
    const sc = u < 0.12 ? 0.4 + u / 0.12 * 0.8 : 1.2 - (u - 0.12) * 0.15;
    const a = u > 0.7 ? 1 - (u - 0.7) / 0.3 : 1;
    ctx.save();
    ctx.translate(281, 430);
    ctx.rotate(-0.08);
    ctx.scale(sc, sc);
    ctx.globalAlpha = a;
    ctx.font = `900 64px ${FD}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
    ctx.strokeStyle = '#05010a'; ctx.lineWidth = 18; ctx.strokeText(mg.milestoneText, 5, 7);
    ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 8; ctx.strokeText(mg.milestoneText, 0, 0);
    const grd = ctx.createLinearGradient(0, -30, 0, 30);
    grd.addColorStop(0, '#fff27a'); grd.addColorStop(0.5, mg.geo.lime); grd.addColorStop(1, '#22e4ff');
    ctx.fillStyle = grd; ctx.fillText(mg.milestoneText, 0, 0);
    ctx.restore();
    ctx.globalAlpha = 1;
  }
  if (mg.won && mg.winR0 !== undefined) drawSignature(ctx, r, mg, t - mg.winR0);
}

// ------------------------------------------------------------------ signature de LUMEN
// « Lumen » en écriture liée (points d'une spline de Catmull-Rom), tracé progressivement.
const SIG = [
  [12, 2], [9, 14], [6, 28], [3, 36], [8, 39], [16, 35],
  [21, 23], [22, 33], [27, 37], [33, 24], [33, 34], [38, 37],
  [42, 24], [44, 35], [47, 25], [51, 23], [53, 35], [56, 25], [60, 23], [62, 35], [66, 37],
  [71, 31], [76, 26], [72, 22], [67, 26], [67, 33], [73, 37], [79, 34],
  [83, 23], [85, 35], [88, 26], [93, 23], [96, 27], [96, 35], [101, 37], [110, 31], [118, 22],
];
let SIG_PTS = null;
function sigPoints() {
  if (SIG_PTS) return SIG_PTS;
  const out = [];
  const P = SIG;
  for (let i = 0; i < P.length - 1; i++) {
    const p0 = P[Math.max(0, i - 1)], p1 = P[i], p2 = P[i + 1], p3 = P[Math.min(P.length - 1, i + 2)];
    for (let s = 0; s < 6; s++) {
      const u = s / 6, u2 = u * u, u3 = u2 * u;
      const f = (a, b, c, d) => 0.5 * (2 * b + (-a + c) * u + (2 * a - 5 * b + 4 * c - d) * u2 + (-a + 3 * b - 3 * c + d) * u3);
      out.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
    }
  }
  out.push(P[P.length - 1]);
  SIG_PTS = out;
  return out;
}

function drawSignature(ctx, r, mg, u) {
  const t0 = 1.25, dur = 1.3;
  if (u < t0) return;
  const pts = sigPoints();
  const p = Math.min(1, (u - t0) / dur);
  const n = Math.max(2, Math.floor(pts.length * p));
  const ox = 398, oy = 528, s = 1.05;
  ctx.save();
  ctx.translate(ox, oy); ctx.scale(s, s);
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  for (const [w, col, a] of [[9, '#22e4ff', 0.35], [4.5, '#ffffff', 1]]) {
    ctx.globalCompositeOperation = a < 1 ? 'lighter' : 'source-over';
    ctx.globalAlpha = a; ctx.strokeStyle = col; ctx.lineWidth = w;
    ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < n; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.stroke();
  }
  ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  // soulignement
  if (p >= 1) {
    const q = Math.min(1, (u - t0 - dur) / 0.35);
    ctx.strokeStyle = '#ff2bd6'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(2, 46); ctx.quadraticCurveTo(60, 40 + 6, 2 + 118 * q, 44); ctx.stroke();
  }
  ctx.restore();
  // pointe du stylo lumineuse
  if (p < 1) {
    const [px, py] = pts[n - 1];
    r.glow(ox + px * s, oy + py * s, 46, '#ffffff', 1);
    if (Math.random() < 0.5) mg.game.fx.spark(ox + px * s, oy + py * s, 500);
  } else {
    const q = Math.min(1, (u - t0 - dur) / 0.4);
    r.text('— LUMEN, IA DE CORTEX-9', ox + 60, oy + 62, 9, '#e8f4ff', 'center', 0.8 * q, true);
  }
}
