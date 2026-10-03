// Boîte à outils graphique « matières de flipper » : chrome, caoutchouc, plastiques,
// inserts lumineux, peinture du plateau. Tout est dessiné en coordonnées monde.
import { rgba, TAU, mulberry32 } from '../util/math.js';

export const NEON = {
  cyan: '#22e4ff', magenta: '#ff2bd6', violet: '#8b5cff', amber: '#ffb02e', lime: '#9dff3c',
  red: '#ff3d6e', gold: '#ffd84a', blue: '#3d7bff', white: '#ffffff', green: '#5dff8f', orange: '#ff7b1c',
};

// Lumière principale venant du haut à gauche : les ombres partent vers le bas à droite.
export const SHADOW = { dx: 5, dy: 8 };

export function polyPath(g, pts, closed = false) {
  g.beginPath();
  g.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]);
  if (closed) g.closePath();
}

// Rail / guide chromé le long d'une polyligne (contour sombre, corps, reflets).
export function chrome(g, pts, w = 6, opts = {}) {
  g.lineCap = 'round'; g.lineJoin = 'round';
  if (opts.shadow !== false) {
    g.save(); g.translate(SHADOW.dx * 0.5, SHADOW.dy * 0.5);
    g.strokeStyle = 'rgba(0,0,0,0.45)'; g.lineWidth = w + 2; polyPath(g, pts); g.stroke();
    g.restore();
  }
  g.strokeStyle = opts.dark || '#1a1d28'; g.lineWidth = w + 1.6; polyPath(g, pts); g.stroke();
  g.strokeStyle = opts.mid || '#7d8aa3'; g.lineWidth = w; polyPath(g, pts); g.stroke();
  g.strokeStyle = opts.light || '#d9e4f5'; g.lineWidth = Math.max(0.8, w * 0.32);
  g.save(); g.translate(-w * 0.18, -w * 0.22); polyPath(g, pts); g.stroke(); g.restore();
  if (opts.glow) {
    g.globalCompositeOperation = 'lighter';
    g.strokeStyle = rgba(opts.glow, 0.35); g.lineWidth = 1; polyPath(g, pts); g.stroke();
    g.globalCompositeOperation = 'source-over';
  }
}

// Fil de rampe métallique : deux ou trois fils parallèles et traverses.
export function wireRamp(g, pts, width = 40, opts = {}) {
  const n = pts.length;
  const offs = (k) => pts.map((p, i) => {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)];
    let dx = b[0] - a[0], dy = b[1] - a[1];
    const l = Math.hypot(dx, dy) || 1; dx /= l; dy /= l;
    return [p[0] - dy * k, p[1] + dx * k];
  });
  const L = offs(-width / 2), R = offs(width / 2), B = offs(0);
  // ombre portée (la rampe est haute)
  g.save(); g.translate(SHADOW.dx * 1.8, SHADOW.dy * 1.8);
  g.strokeStyle = 'rgba(0,0,0,0.32)'; g.lineWidth = 4;
  polyPath(g, L); g.stroke(); polyPath(g, R); g.stroke();
  g.restore();
  // traverses
  let acc = 0;
  for (let i = 1; i < n; i++) {
    const seg = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    acc += seg;
    if (acc > (opts.tieGap || 34)) {
      acc = 0;
      chrome(g, [L[i], R[i]], 2.2, { shadow: false });
    }
  }
  for (const side of [L, R]) chrome(g, side, 3.2, { shadow: false, glow: opts.glow });
  if (opts.bottomWire !== false) chrome(g, B, 2.4, { shadow: false, mid: '#5d6a83' });
}

// Poteau métallique entouré d'un anneau de caoutchouc blanc.
export function post(g, x, y, r = 5, rubber = true) {
  g.fillStyle = 'rgba(0,0,0,0.45)';
  g.beginPath(); g.arc(x + SHADOW.dx * 0.5, y + SHADOW.dy * 0.5, r + 3, 0, TAU); g.fill();
  if (rubber) {
    g.fillStyle = '#f2f2ee';
    g.beginPath(); g.arc(x, y, r + 3, 0, TAU); g.fill();
    g.strokeStyle = '#9a9a96'; g.lineWidth = 1; g.stroke();
  }
  const grd = g.createRadialGradient(x - r * 0.4, y - r * 0.4, 0.5, x, y, r);
  grd.addColorStop(0, '#ffffff'); grd.addColorStop(0.5, '#a9b4c8'); grd.addColorStop(1, '#3b4458');
  g.fillStyle = grd;
  g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
}

// Vis à tête cruciforme (plastiques).
export function screw(g, x, y, r = 2.6) {
  const grd = g.createRadialGradient(x - 1, y - 1, 0.3, x, y, r);
  grd.addColorStop(0, '#f4f7ff'); grd.addColorStop(1, '#556178');
  g.fillStyle = grd; g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
  g.strokeStyle = 'rgba(20,24,34,0.8)'; g.lineWidth = 0.7;
  g.beginPath(); g.moveTo(x - r * 0.6, y); g.lineTo(x + r * 0.6, y); g.moveTo(x, y - r * 0.6); g.lineTo(x, y + r * 0.6); g.stroke();
}

// Plaque de plastique sérigraphié (forme libre) avec bord biseauté et vis.
export function plastic(g, pts, color, opts = {}) {
  g.save();
  g.translate(SHADOW.dx, SHADOW.dy);
  g.fillStyle = 'rgba(0,0,0,0.42)'; polyPath(g, pts, true); g.fill();
  g.restore();
  const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
  const x0 = Math.min(...xs), y0 = Math.min(...ys), x1 = Math.max(...xs), y1 = Math.max(...ys);
  const grd = g.createLinearGradient(x0, y0, x1, y1);
  grd.addColorStop(0, rgba(color, opts.alpha ?? 0.92));
  grd.addColorStop(1, rgba(opts.color2 || '#120a2a', opts.alpha ?? 0.92));
  g.fillStyle = grd; polyPath(g, pts, true); g.fill();
  if (opts.art) { g.save(); polyPath(g, pts, true); g.clip(); opts.art(g, x0, y0, x1, y1); g.restore(); }
  g.strokeStyle = 'rgba(255,255,255,0.55)'; g.lineWidth = 1.2; polyPath(g, pts, true); g.stroke();
  g.strokeStyle = rgba(color, 0.9); g.lineWidth = 0.8;
  g.save(); g.translate(1, 1); polyPath(g, pts, true); g.stroke(); g.restore();
  for (const s of opts.screws || []) screw(g, s[0], s[1]);
}

// Texte peint sur le plateau (contour sombre, légère sous-couche).
export function paint(g, str, x, y, size, color, opts = {}) {
  g.save();
  g.translate(x, y);
  if (opts.rot) g.rotate(opts.rot);
  g.font = `${opts.weight || 800} ${size}px ${opts.font || '"Orbitron", "Rajdhani", sans-serif'}`;
  g.textAlign = opts.align || 'center'; g.textBaseline = 'middle';
  if (opts.spacing && 'letterSpacing' in g) g.letterSpacing = opts.spacing + 'px';
  g.lineJoin = 'round';
  g.strokeStyle = opts.outline || 'rgba(4,2,12,0.9)'; g.lineWidth = Math.max(2, size * 0.22);
  g.strokeText(str, 0, 0);
  g.fillStyle = color; g.globalAlpha = opts.alpha ?? 1;
  g.fillText(str, 0, 0);
  g.restore();
}

// ---------------------------------------------------------------- inserts
// Formes d'inserts (centrées sur 0,0, orientées vers le haut).
export function insertPath(g, shape, s) {
  g.beginPath();
  switch (shape) {
    case 'arrow':
      g.moveTo(0, -s); g.lineTo(s * 0.72, s * 0.08); g.lineTo(s * 0.28, s * 0.02); g.lineTo(s * 0.28, s * 0.78);
      g.lineTo(-s * 0.28, s * 0.78); g.lineTo(-s * 0.28, s * 0.02); g.lineTo(-s * 0.72, s * 0.08); g.closePath(); break;
    case 'chevron':
      g.moveTo(0, -s * 0.55); g.lineTo(s * 0.8, s * 0.25); g.lineTo(s * 0.8, s * 0.6); g.lineTo(0, -s * 0.18);
      g.lineTo(-s * 0.8, s * 0.6); g.lineTo(-s * 0.8, s * 0.25); g.closePath(); break;
    case 'triangle':
      g.moveTo(0, -s); g.lineTo(s * 0.87, s * 0.5); g.lineTo(-s * 0.87, s * 0.5); g.closePath(); break;
    case 'hex':
      for (let k = 0; k < 6; k++) { const a = k * Math.PI / 3 + Math.PI / 6; k ? g.lineTo(Math.cos(a) * s, Math.sin(a) * s) : g.moveTo(Math.cos(a) * s, Math.sin(a) * s); }
      g.closePath(); break;
    case 'rect':
      g.rect(-s, -s * 0.55, s * 2, s * 1.1); break;
    case 'diamond':
      g.moveTo(0, -s); g.lineTo(s * 0.7, 0); g.lineTo(0, s); g.lineTo(-s * 0.7, 0); g.closePath(); break;
    default:
      g.arc(0, 0, s, 0, TAU);
  }
}

// Insert éteint (lentille de plastique coloré enchâssée dans le plateau).
export function insertBase(g, shape, x, y, s, color, rot = 0) {
  g.save(); g.translate(x, y); g.rotate(rot);
  insertPath(g, shape, s + 1.6); g.fillStyle = 'rgba(0,0,0,0.75)'; g.fill();
  insertPath(g, shape, s);
  const grd = g.createRadialGradient(-s * 0.3, -s * 0.35, 0, 0, 0, s * 1.2);
  grd.addColorStop(0, rgba(color, 0.42)); grd.addColorStop(0.6, rgba(color, 0.2)); grd.addColorStop(1, rgba(color, 0.1));
  g.fillStyle = grd; g.fill();
  g.strokeStyle = rgba(color, 0.55); g.lineWidth = 0.9; g.stroke();
  // reflet du vernis
  g.save(); insertPath(g, shape, s); g.clip();
  g.fillStyle = 'rgba(255,255,255,0.13)';
  g.beginPath(); g.ellipse(-s * 0.25, -s * 0.45, s * 0.7, s * 0.3, -0.4, 0, TAU); g.fill();
  g.restore();
  g.restore();
}

// Insert allumé (dessiné par-dessus la base, chaque image).
export function insertLit(g, shape, x, y, s, color, k = 1, rot = 0) {
  if (k <= 0.01) return;
  g.save(); g.translate(x, y); g.rotate(rot);
  g.globalAlpha = Math.min(1, k);
  insertPath(g, shape, s);
  const grd = g.createRadialGradient(0, 0, 0, 0, 0, s * 1.15);
  grd.addColorStop(0, '#ffffff'); grd.addColorStop(0.35, color); grd.addColorStop(1, rgba(color, 0.75));
  g.fillStyle = grd; g.fill();
  g.globalAlpha = 1;
  g.restore();
}

// ---------------------------------------------------------------- peinture
// Grille « synthwave » en perspective (fuyante vers le haut).
export function synthGrid(g, x0, x1, yTop, yBot, color, alpha = 0.25) {
  const cx = (x0 + x1) / 2;
  g.save();
  g.lineWidth = 1;
  for (let k = 0; k <= 14; k++) {
    const u = k / 14;
    const xb = x0 + (x1 - x0) * u;
    const xt = cx + (xb - cx) * 0.18;
    g.strokeStyle = rgba(color, alpha * (0.4 + 0.6 * (1 - Math.abs(u - 0.5) * 2)));
    g.beginPath(); g.moveTo(xt, yTop); g.lineTo(xb, yBot); g.stroke();
  }
  for (let k = 0; k <= 10; k++) {
    const u = Math.pow(k / 10, 1.8);
    const y = yTop + (yBot - yTop) * u;
    g.strokeStyle = rgba(color, alpha * (0.25 + 0.75 * u));
    g.beginPath(); g.moveTo(x0, y); g.lineTo(x1, y); g.stroke();
  }
  g.restore();
}

// Silhouette de mégapole avec fenêtres allumées.
export function skyline(g, x0, x1, yBase, hMax, seed, cols) {
  const rnd = mulberry32(seed);
  let x = x0;
  while (x < x1) {
    const w = 10 + rnd() * 26, h = hMax * (0.3 + rnd() * 0.7);
    g.fillStyle = '#07040f';
    g.fillRect(x, yBase - h, w, h);
    if (rnd() < 0.3) { g.fillRect(x + w * 0.4, yBase - h - 8 - rnd() * 14, 2, 14); }
    for (let wy = yBase - h + 4; wy < yBase - 3; wy += 5) {
      for (let wx = x + 2; wx < x + w - 2; wx += 4) {
        if (rnd() < 0.24) { g.fillStyle = rgba(cols[Math.floor(rnd() * cols.length)], 0.35 + rnd() * 0.5); g.fillRect(wx, wy, 1.6, 2); }
      }
    }
    x += w + 1 + rnd() * 3;
  }
}

// Pistes de circuit imprimé (peintes).
export function circuits(g, x0, y0, x1, y1, n, color, seed, alpha = 0.12) {
  const rnd = mulberry32(seed);
  g.save();
  g.lineWidth = 1.3; g.lineCap = 'round'; g.lineJoin = 'round';
  for (let i = 0; i < n; i++) {
    let x = x0 + rnd() * (x1 - x0), y = y0 + rnd() * (y1 - y0);
    g.strokeStyle = rgba(color, alpha * (0.6 + rnd() * 0.8));
    g.beginPath(); g.moveTo(x, y);
    let dir = Math.floor(rnd() * 8);
    const steps = 2 + Math.floor(rnd() * 4);
    for (let s = 0; s < steps; s++) {
      const len = 12 + rnd() * 50;
      const a = dir * Math.PI / 4;
      x += Math.cos(a) * len; y += Math.sin(a) * len;
      g.lineTo(x, y);
      dir = (dir + (rnd() < 0.5 ? 1 : 7)) % 8;
    }
    g.stroke();
    g.fillStyle = rgba(color, alpha * 2);
    g.beginPath(); g.arc(x, y, 2, 0, TAU); g.fill();
  }
  g.restore();
}

// Bandes de danger jaunes et noires dans un polygone.
export function hazard(g, pts, color = '#ffb02e', alpha = 0.55, step = 12) {
  g.save();
  polyPath(g, pts, true); g.clip();
  const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
  const x0 = Math.min(...xs) - 40, x1 = Math.max(...xs) + 40, y0 = Math.min(...ys), y1 = Math.max(...ys);
  g.fillStyle = 'rgba(10,8,4,0.8)'; g.fillRect(x0, y0, x1 - x0, y1 - y0);
  g.fillStyle = rgba(color, alpha);
  for (let x = x0; x < x1; x += step * 2) {
    g.beginPath(); g.moveTo(x, y1); g.lineTo(x + step, y1); g.lineTo(x + step + (y1 - y0), y0); g.lineTo(x + (y1 - y0), y0); g.closePath(); g.fill();
  }
  g.restore();
}

// Grain d'impression (petits points aléatoires).
export function grain(g, x0, y0, x1, y1, n, seed, alpha = 0.05) {
  const rnd = mulberry32(seed);
  for (let i = 0; i < n; i++) {
    g.fillStyle = rnd() < 0.5 ? `rgba(255,255,255,${alpha})` : `rgba(0,0,0,${alpha * 2})`;
    g.fillRect(x0 + rnd() * (x1 - x0), y0 + rnd() * (y1 - y0), 1.2, 1.2);
  }
}
