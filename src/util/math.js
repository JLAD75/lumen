// Petites fonctions mathématiques partagées.

export const TAU = Math.PI * 2;
export const DEG = Math.PI / 180;

export function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
export function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
export function lerp(a, b, t) { return a + (b - a) * t; }
export function invLerp(a, b, v) { return clamp01((v - a) / (b - a)); }
export function smoothstep(a, b, v) { const t = invLerp(a, b, v); return t * t * (3 - 2 * t); }
export function rand(a = 0, b = 1) { return a + Math.random() * (b - a); }
export function randInt(a, b) { return Math.floor(a + Math.random() * (b - a + 1)); }
export function choose(arr) { return arr[(Math.random() * arr.length) | 0]; }
export function sign(v) { return v < 0 ? -1 : 1; }
export function len(x, y) { return Math.sqrt(x * x + y * y); }
export function dist(ax, ay, bx, by) { const dx = bx - ax, dy = by - ay; return Math.sqrt(dx * dx + dy * dy); }
export function dist2(ax, ay, bx, by) { const dx = bx - ax, dy = by - ay; return dx * dx + dy * dy; }
export function wrapAngle(a) { while (a > Math.PI) a -= TAU; while (a < -Math.PI) a += TAU; return a; }
export function approach(v, target, step) { return v < target ? Math.min(v + step, target) : Math.max(v - step, target); }
export function easeOutCubic(t) { return 1 - Math.pow(1 - t, 3); }
export function easeInCubic(t) { return t * t * t; }
export function easeInOutCubic(t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }
export function easeOutBack(t) { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); }

// Intersection de deux segments [p0,p1] et [q0,q1]. Renvoie t sur p ou -1.
export function segIntersectT(p0x, p0y, p1x, p1y, q0x, q0y, q1x, q1y) {
  const rx = p1x - p0x, ry = p1y - p0y;
  const sx = q1x - q0x, sy = q1y - q0y;
  const den = rx * sy - ry * sx;
  if (Math.abs(den) < 1e-9) return -1;
  const qpx = q0x - p0x, qpy = q0y - p0y;
  const t = (qpx * sy - qpy * sx) / den;
  const u = (qpx * ry - qpy * rx) / den;
  if (t >= 0 && t <= 1 && u >= 0 && u <= 1) return t;
  return -1;
}

// Formatage du score avec espaces fines (style français).
export function fmt(n) {
  n = Math.floor(n);
  const s = String(Math.abs(n));
  let out = '';
  for (let i = 0; i < s.length; i++) {
    if (i > 0 && (s.length - i) % 3 === 0) out += ' ';
    out += s[i];
  }
  return (n < 0 ? '-' : '') + out;
}

export function hexToRgb(hex) {
  const h = hex.replace('#', '');
  const v = parseInt(h.length === 3 ? h.split('').map(c => c + c).join('') : h, 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}

export function rgba(hex, a) {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r},${g},${b},${a})`;
}

// Générateur pseudo-aléatoire déterministe (décors, étoiles).
export function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
