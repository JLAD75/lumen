import { hexToRgb } from '../util/math.js';

// Sprites lumineux pré-rendus (beaucoup plus rapides que shadowBlur sur mobile).
const cache = new Map();

export function glowSprite(color, size = 64, hardness = 0.12) {
  const key = color + '|' + size + '|' + hardness;
  let c = cache.get(key);
  if (c) return c;
  c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const [r, gg, b] = hexToRgb(color);
  const h = size / 2;
  const grd = g.createRadialGradient(h, h, 0, h, h, h);
  grd.addColorStop(0, `rgba(${r},${gg},${b},1)`);
  grd.addColorStop(hardness, `rgba(${r},${gg},${b},0.85)`);
  grd.addColorStop(0.45, `rgba(${r},${gg},${b},0.28)`);
  grd.addColorStop(0.75, `rgba(${r},${gg},${b},0.07)`);
  grd.addColorStop(1, `rgba(${r},${gg},${b},0)`);
  g.fillStyle = grd;
  g.fillRect(0, 0, size, size);
  cache.set(key, c);
  return c;
}

export function clearSprites() { cache.clear(); }
