import { TAU, rgba, hexToRgb, mulberry32, clamp } from '../util/math.js';
import { glowSprite } from '../render/sprites.js';

// Rendu du CASSE-BRIQUES ORBITAL : briques et capsules pré-rendues en sprites
// (aucun dégradé recalculé par brique à chaque image), sol du hangar dans le calque
// statique, plateforme chromée, tirs laser, éclats et halos en effets additifs.

export const BK = {
  L: 20, R: 580, CEIL: 40, CH: 30,      // murs, plafond plat, chanfreins des coins hauts
  COLS: 11, BW: 44, BH: 20, GX: 3, GY: 4, X0: 43,
  PY: 990,                              // ligne de la plateforme
  PAD: 9,                               // marge des sprites (halo, ombre portée)
};

// une couleur néon par rangée (du haut vers le bas)
export const ROW_COLORS = ['#ff2bd6', '#b43dff', '#6a5cff', '#2f7dff', '#19d0ff', '#19f5d0', '#3dff8a', '#a6ff2b', '#ffb21f', '#ff6a2b'];

export const CAPS = {
  large:   { label: 'LARGE',   color: '#29e3ff', name: 'Plateforme élargie' },
  laser:   { label: 'LASER',   color: '#ff3b5c', name: 'Canons laser' },
  aimant:  { label: 'AIMANT',  color: '#b26bff', name: 'Aimant' },
  ralenti: { label: 'RALENTI', color: '#4d8dff', name: 'Ralenti' },
  perfo:   { label: 'PERFO',   color: '#ff3df2', name: 'Perforation' },
  time:    { label: '+8 s',    color: '#5dff8f', name: 'Temps supplémentaire' },
  mult:    { label: '×2',      color: '#ffd84a', name: 'Multiplicateur ×2 (plateau)' },
  jack:    { label: 'JACK',    color: '#ffb52e', name: 'Jackpot de rampe renforcé' },
  echo:    { label: 'ÉCHO',    color: '#7dfff0', name: 'Échos holographiques' },
};

const GOLD = '#ffd84a', MAGENTA = '#ff3df2', HOLO = '#7dfff0';
const CW = 60, CHh = 20;                // capsule

// ---------------------------------------------------------------- utilitaires

function mix(a, b, k) {
  const A = hexToRgb(a), B = hexToRgb(b);
  return `rgb(${Math.round(A[0] + (B[0] - A[0]) * k)},${Math.round(A[1] + (B[1] - A[1]) * k)},${Math.round(A[2] + (B[2] - A[2]) * k)})`;
}

// rectangle à coins coupés (haut-gauche et bas-droit) : silhouette « tech »
function cut(g, x, y, w, h, c) {
  g.beginPath();
  g.moveTo(x + c, y); g.lineTo(x + w, y); g.lineTo(x + w, y + h - c);
  g.lineTo(x + w - c, y + h); g.lineTo(x, y + h); g.lineTo(x, y + c);
  g.closePath();
}

function pill(g, x, y, w, h) {
  const r = Math.min(h / 2, w / 2);
  g.beginPath();
  g.moveTo(x + r, y); g.lineTo(x + w - r, y); g.arc(x + w - r, y + r, r, -Math.PI / 2, Math.PI / 2);
  g.lineTo(x + r, y + h); g.arc(x + r, y + r, r, Math.PI / 2, Math.PI * 1.5);
  g.closePath();
}

// ---------------------------------------------------------------- cache de sprites

const SPR = new Map();
let sprScale = 0, sprFonts = null;

function scaleOf(r) { return Math.round(clamp(r.view.scale * r.dpr, 0.5, 4) * 100) / 100; }

function sprite(r, key, w, h, paint) {
  const s = scaleOf(r);
  const fonts = typeof document === 'undefined' || !document.fonts || document.fonts.status === 'loaded';
  if (s !== sprScale || fonts !== sprFonts) { SPR.clear(); sprScale = s; sprFonts = fonts; }
  let c = SPR.get(key);
  if (c) return c;
  c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w * s)); c.height = Math.max(1, Math.round(h * s));
  const g = c.getContext('2d');
  g.setTransform(c.width / w, 0, 0, c.height / h, 0, 0);
  paint(g, s);
  SPR.set(key, c);
  return c;
}

// ---------------------------------------------------------------- briques

// fissures déterministes (blindage, verrous endommagés)
function cracks(g, w, h, n, seed, dark, light) {
  const rnd = mulberry32(seed);
  for (let k = 0; k < n; k++) {
    const pts = [];
    let x = 8 + rnd() * (w - 16), y = 0;
    pts.push([x, y]);
    while (y < h) { y = Math.min(h, y + 3 + rnd() * 4); x += (rnd() - 0.5) * 10; pts.push([x, y]); }
    const line = (ox) => { g.beginPath(); g.moveTo(pts[0][0] + ox, pts[0][1]); for (const p of pts) g.lineTo(p[0] + ox, p[1]); };
    g.strokeStyle = light; g.lineWidth = 0.8; line(0.9); g.stroke();
    g.strokeStyle = dark; g.lineWidth = 1.5; line(0); g.stroke();
    // ramification
    const m = pts[Math.min(pts.length - 1, 2)];
    g.beginPath(); g.moveTo(m[0], m[1]); g.lineTo(m[0] + (rnd() - 0.5) * 16, m[1] + 4 + rnd() * 5); g.lineWidth = 1; g.stroke();
  }
}

function shadowAndGlow(g, s, glow, w, h, blur = 9) {
  g.save();
  g.shadowColor = 'rgba(0,0,0,0.8)'; g.shadowBlur = 5 * s; g.shadowOffsetX = 2 * s; g.shadowOffsetY = 4 * s;
  g.fillStyle = '#000'; cut(g, 0, 0, w, h, 5); g.fill();
  g.restore();
  g.save();
  g.shadowColor = glow; g.shadowBlur = blur * s;
  g.strokeStyle = glow; g.lineWidth = 1.6; cut(g, 0, 0, w, h, 5); g.stroke();
  g.restore();
}

function paintNormal(g, s, col, w, h) {
  shadowAndGlow(g, s, col, w, h);
  const grd = g.createLinearGradient(0, 0, 0, h);
  grd.addColorStop(0, mix(col, '#ffffff', 0.6)); grd.addColorStop(0.16, mix(col, '#ffffff', 0.18));
  grd.addColorStop(0.55, col); grd.addColorStop(1, mix(col, '#000000', 0.55));
  g.fillStyle = grd; cut(g, 0, 0, w, h, 5); g.fill();
  // panneau intérieur sombre (écran)
  g.globalAlpha = 0.5; g.fillStyle = mix(col, '#000000', 0.7);
  cut(g, 5, 6, w - 17, h - 11, 3); g.fill();
  g.globalAlpha = 1;
  // piste de circuit lumineuse
  g.strokeStyle = mix(col, '#ffffff', 0.55); g.lineWidth = 1;
  g.beginPath(); g.moveTo(8, h / 2 + 1.5); g.lineTo(15, h / 2 + 1.5); g.lineTo(18, h / 2 - 1.5); g.lineTo(w - 16, h / 2 - 1.5); g.stroke();
  // diodes
  g.fillStyle = '#ffffff'; g.fillRect(w - 9, 5.5, 3, 3);
  g.globalAlpha = 0.45; g.fillRect(w - 9, 11, 3, 3); g.globalAlpha = 1;
  // reflet supérieur et arête
  g.fillStyle = 'rgba(255,255,255,0.7)'; g.fillRect(6, 1, w - 8, 1.3);
  g.strokeStyle = mix(col, '#ffffff', 0.4); g.lineWidth = 1; cut(g, 0.5, 0.5, w - 1, h - 1, 4.6); g.stroke();
}

function paintArmor(g, s, w, h, dmg) {
  shadowAndGlow(g, s, '#8fb6ff', w, h, 6);
  const grd = g.createLinearGradient(0, 0, 0, h);
  grd.addColorStop(0, '#f2f6ff'); grd.addColorStop(0.2, '#aab6cc'); grd.addColorStop(0.55, '#5f6b85'); grd.addColorStop(1, '#262d3e');
  g.fillStyle = grd; cut(g, 0, 0, w, h, 5); g.fill();
  // brossage
  g.save(); cut(g, 0, 0, w, h, 5); g.clip();
  g.strokeStyle = 'rgba(255,255,255,0.08)'; g.lineWidth = 1;
  for (let x = -h; x < w; x += 4) { g.beginPath(); g.moveTo(x, h); g.lineTo(x + h, 0); g.stroke(); }
  g.restore();
  // plaque centrale à chevrons
  g.fillStyle = 'rgba(20,26,40,0.55)'; cut(g, 9, 5, w - 18, h - 10, 3); g.fill();
  g.strokeStyle = '#29d9ff'; g.globalAlpha = 0.75; g.lineWidth = 1.3;
  for (const dx of [-6, 0, 6]) { g.beginPath(); g.moveTo(w / 2 + dx - 3, h / 2 - 3); g.lineTo(w / 2 + dx, h / 2); g.lineTo(w / 2 + dx - 3, h / 2 + 3); g.stroke(); }
  g.globalAlpha = 1;
  // rivets
  for (const [rx, ry] of [[4.5, 4.5], [w - 4.5, 4.5], [4.5, h - 4.5], [w - 4.5, h - 4.5]]) {
    g.fillStyle = '#1a2030'; g.beginPath(); g.arc(rx, ry + 0.4, 1.9, 0, TAU); g.fill();
    g.fillStyle = '#e8eef8'; g.beginPath(); g.arc(rx - 0.3, ry - 0.3, 1.2, 0, TAU); g.fill();
  }
  g.fillStyle = 'rgba(255,255,255,0.85)'; g.fillRect(6, 1, w - 8, 1.2);
  g.strokeStyle = '#d6e4ff'; g.lineWidth = 1; cut(g, 0.5, 0.5, w - 1, h - 1, 4.6); g.stroke();
  if (dmg > 0) cracks(g, w, h, dmg, 17 + dmg * 31, 'rgba(8,10,18,0.95)', 'rgba(255,255,255,0.45)');
}

function paintChrome(g, s, w, h) {
  shadowAndGlow(g, s, '#cfe0ff', w, h, 5);
  const grd = g.createLinearGradient(0, 0, 0, h);
  grd.addColorStop(0, '#ffffff'); grd.addColorStop(0.18, '#c9d6ea'); grd.addColorStop(0.42, '#39445e');
  grd.addColorStop(0.55, '#9fb0cc'); grd.addColorStop(0.72, '#f1f6ff'); grd.addColorStop(1, '#4d5872');
  g.fillStyle = grd; cut(g, 0, 0, w, h, 5); g.fill();
  // encoches de signalisation aux extrémités
  g.save(); cut(g, 0, 0, w, h, 5); g.clip();
  g.fillStyle = 'rgba(10,12,20,0.75)';
  for (const x0 of [0, w - 9]) for (let k = -1; k < 3; k++) { g.beginPath(); g.moveTo(x0 + k * 6, h); g.lineTo(x0 + k * 6 + 3, h); g.lineTo(x0 + k * 6 + 3 + h * 0.5, 0); g.lineTo(x0 + k * 6 + h * 0.5, 0); g.closePath(); g.fill(); }
  g.restore();
  // fente centrale et boulon hexagonal
  g.fillStyle = '#0b0f1a'; cut(g, 12, h / 2 - 3, w - 24, 6, 2); g.fill();
  g.fillStyle = '#d9e3f5'; g.beginPath();
  for (let k = 0; k < 6; k++) { const a = k * Math.PI / 3; const x = w / 2 + Math.cos(a) * 4.2, y = h / 2 + Math.sin(a) * 4.2; if (k) g.lineTo(x, y); else g.moveTo(x, y); }
  g.closePath(); g.fill();
  g.fillStyle = '#5d6a86'; g.beginPath(); g.arc(w / 2, h / 2, 1.6, 0, TAU); g.fill();
  g.strokeStyle = 'rgba(255,255,255,0.95)'; g.lineWidth = 1; cut(g, 0.5, 0.5, w - 1, h - 1, 4.6); g.stroke();
}

function paintExplosive(g, s, w, h) {
  shadowAndGlow(g, s, '#ff4a2b', w, h, 11);
  const grd = g.createLinearGradient(0, 0, 0, h);
  grd.addColorStop(0, '#ff9a7a'); grd.addColorStop(0.2, '#d8261c'); grd.addColorStop(0.65, '#86101a'); grd.addColorStop(1, '#3e0610');
  g.fillStyle = grd; cut(g, 0, 0, w, h, 5); g.fill();
  // bandes de danger aux extrémités
  g.save(); cut(g, 0, 0, w, h, 5); g.clip();
  for (const x0 of [0, w - 11]) {
    g.fillStyle = '#ffc21f'; g.fillRect(x0, 0, 11, h);
    g.fillStyle = '#1a0a06';
    for (let k = -2; k < 4; k++) { g.beginPath(); g.moveTo(x0 + k * 7, h); g.lineTo(x0 + k * 7 + 3.5, h); g.lineTo(x0 + k * 7 + 3.5 + h * 0.6, 0); g.lineTo(x0 + k * 7 + h * 0.6, 0); g.closePath(); g.fill(); }
  }
  g.restore();
  // cœur incandescent + trèfle de danger
  const rg = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, 10);
  rg.addColorStop(0, '#fff2c0'); rg.addColorStop(0.45, '#ffb21f'); rg.addColorStop(1, 'rgba(255,90,40,0)');
  g.fillStyle = rg; g.fillRect(w / 2 - 11, 0, 22, h);
  g.fillStyle = '#2a0806';
  for (let k = 0; k < 3; k++) {
    const a = -Math.PI / 2 + k * TAU / 3;
    g.beginPath(); g.moveTo(w / 2, h / 2); g.arc(w / 2, h / 2, 7, a - 0.5, a + 0.5); g.closePath(); g.fill();
  }
  g.fillStyle = '#ffe9a8'; g.beginPath(); g.arc(w / 2, h / 2, 1.8, 0, TAU); g.fill();
  g.fillStyle = 'rgba(255,255,255,0.6)'; g.fillRect(12, 1, w - 24, 1.2);
  g.strokeStyle = '#ffb08f'; g.lineWidth = 1; cut(g, 0.5, 0.5, w - 1, h - 1, 4.6); g.stroke();
}

function paintPower(g, s, w, h) {
  shadowAndGlow(g, s, '#ffffff', w, h, 10);
  const grd = g.createLinearGradient(0, 0, w, h);
  grd.addColorStop(0, '#5ff7ff'); grd.addColorStop(0.35, '#e8fdff'); grd.addColorStop(0.65, '#ffd0fb'); grd.addColorStop(1, '#ff5fe8');
  g.fillStyle = grd; cut(g, 0, 0, w, h, 5); g.fill();
  const sh = g.createLinearGradient(0, 0, 0, h);
  sh.addColorStop(0, 'rgba(255,255,255,0.55)'); sh.addColorStop(0.4, 'rgba(255,255,255,0)'); sh.addColorStop(1, 'rgba(20,0,40,0.45)');
  g.fillStyle = sh; cut(g, 0, 0, w, h, 5); g.fill();
  // icône de capsule
  g.fillStyle = 'rgba(20,10,40,0.85)'; pill(g, w / 2 - 11, h / 2 - 4.5, 22, 9); g.fill();
  g.fillStyle = '#ffffff'; pill(g, w / 2 - 9, h / 2 - 2.5, 8, 5); g.fill();
  g.fillStyle = MAGENTA; pill(g, w / 2 + 1, h / 2 - 2.5, 8, 5); g.fill();
  // coins lumineux
  g.fillStyle = '#ffffff';
  g.fillRect(3, h - 4, 5, 1.5); g.fillRect(w - 8, 2.5, 5, 1.5);
  g.strokeStyle = 'rgba(255,255,255,0.95)'; g.lineWidth = 1; cut(g, 0.5, 0.5, w - 1, h - 1, 4.6); g.stroke();
}

function paintLock(g, s, w, h, dmg) {
  shadowAndGlow(g, s, GOLD, w, h, 12);
  const grd = g.createLinearGradient(0, 0, 0, h);
  grd.addColorStop(0, '#fffbe0'); grd.addColorStop(0.22, '#ffe066'); grd.addColorStop(0.6, '#d49a12'); grd.addColorStop(1, '#6e4700');
  g.fillStyle = grd; cut(g, 0, 0, w, h, 5); g.fill();
  // cadre chromé intérieur
  g.strokeStyle = 'rgba(255,255,255,0.75)'; g.lineWidth = 1.2; cut(g, 3, 3, w - 6, h - 6, 3); g.stroke();
  // rainures
  g.strokeStyle = 'rgba(90,55,0,0.55)'; g.lineWidth = 1;
  for (const x of [8, 12, w - 12, w - 8]) { g.beginPath(); g.moveTo(x, 5); g.lineTo(x, h - 5); g.stroke(); }
  // cadenas
  const cx = w / 2, cy = h / 2 + 1.5;
  g.strokeStyle = '#3a2600'; g.lineWidth = 2;
  g.beginPath(); g.arc(cx, cy - 4, 3.6, Math.PI, 0); g.stroke();
  g.fillStyle = '#3a2600'; g.fillRect(cx - 5.5, cy - 4, 11, 8);
  g.fillStyle = '#ffe58a'; g.beginPath(); g.arc(cx, cy - 1, 1.5, 0, TAU); g.fill(); g.fillRect(cx - 0.6, cy - 1, 1.2, 3.4);
  g.fillStyle = 'rgba(255,255,255,0.9)'; g.fillRect(6, 1, w - 8, 1.3);
  g.strokeStyle = '#fff4c2'; g.lineWidth = 1; cut(g, 0.5, 0.5, w - 1, h - 1, 4.6); g.stroke();
  if (dmg > 0) cracks(g, w, h, dmg, 91 + dmg * 7, 'rgba(60,30,0,0.95)', 'rgba(255,255,230,0.6)');
}

function brickSprite(r, br) {
  const { BW, BH, PAD } = BK;
  const dmg = br.maxHp > 1 ? Math.min(2, Math.ceil(2 * (br.maxHp - br.hp) / (br.maxHp - 1 || 1))) : 0;
  const key = br.kind + '|' + (br.kind === 'n' ? br.color : '') + '|' + dmg;
  return sprite(r, key, BW + PAD * 2, BH + PAD * 2, (g, s) => {
    g.translate(PAD, PAD);
    if (br.kind === 'a') paintArmor(g, s, BW, BH, dmg);
    else if (br.kind === 'c') paintChrome(g, s, BW, BH);
    else if (br.kind === 'x') paintExplosive(g, s, BW, BH);
    else if (br.kind === 'p') paintPower(g, s, BW, BH);
    else if (br.kind === 'L') paintLock(g, s, BW, BH, dmg);
    else paintNormal(g, s, br.color, BW, BH);
  });
}

export function drawBricks(ctx, r, bricks, t) {
  const { BW, BH, PAD } = BK;
  let fl = false;
  for (const br of bricks) {
    if (!br.alive) continue;
    let x = br.x, y = br.y + br.dy;
    if (br.shake > 0) x += Math.sin(t * 95 + br.i * 1.7) * 2.4 * br.shake;
    if (br.dy < -600) continue;
    ctx.drawImage(brickSprite(r, br), x - PAD, y - PAD, BW + PAD * 2, BH + PAD * 2);
    if (br.flash > 0.02) fl = true;
  }
  ctx.globalCompositeOperation = 'lighter';
  // halos animés : verrous, explosives, capsules
  for (const br of bricks) {
    if (!br.alive || br.dy < -600) continue;
    const cx = br.x + BW / 2, cy = br.y + br.dy + BH / 2;
    if (br.kind === 'L') {
      ctx.globalAlpha = 0.32 + 0.18 * Math.sin(t * 4 + br.i);
      ctx.drawImage(glowSprite(GOLD, 64), cx - 52, cy - 30, 104, 60);
    } else if (br.kind === 'x') {
      ctx.globalAlpha = 0.18 + 0.14 * Math.sin(t * 9 + br.i);
      ctx.drawImage(glowSprite('#ff4a2b', 64), cx - 40, cy - 24, 80, 48);
    } else if (br.kind === 'p') {
      const u = ((t * 0.7 + br.i * 0.37) % 1.6) / 1.6;
      if (u < 0.6) {
        const gx = br.x + 4 + (BW - 8) * (u / 0.6);
        ctx.globalAlpha = 0.7 * Math.sin(Math.PI * u / 0.6);
        ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(gx + 3, br.y + br.dy + 2); ctx.lineTo(gx - 3, br.y + br.dy + BH - 2); ctx.stroke();
      }
    }
  }
  // éclairs d'impact
  if (fl) {
    ctx.fillStyle = '#ffffff';
    for (const br of bricks) {
      if (!br.alive || br.flash <= 0.02) continue;
      ctx.globalAlpha = br.flash * 0.75;
      ctx.fillRect(br.x, br.y + br.dy, BW, BH);
    }
  }
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
}

// ---------------------------------------------------------------- capsules

function capsuleSprite(r, type) {
  const C = CAPS[type], P = BK.PAD;
  return sprite(r, 'cap|' + type, CW + P * 2, CHh + P * 2, (g, s) => {
    g.translate(P, P);
    const col = C.color;
    g.save(); g.shadowColor = col; g.shadowBlur = 10 * s;
    g.fillStyle = col; pill(g, 0, 0, CW, CHh); g.fill(); g.restore();
    const grd = g.createLinearGradient(0, 0, 0, CHh);
    grd.addColorStop(0, mix(col, '#ffffff', 0.7)); grd.addColorStop(0.3, col); grd.addColorStop(1, mix(col, '#000000', 0.6));
    g.fillStyle = grd; pill(g, 0, 0, CW, CHh); g.fill();
    // embouts chromés
    const ch = g.createLinearGradient(0, 0, 0, CHh);
    ch.addColorStop(0, '#ffffff'); ch.addColorStop(0.45, '#7d8aa6'); ch.addColorStop(1, '#232a3c');
    g.save(); pill(g, 0, 0, CW, CHh); g.clip();
    g.fillStyle = ch; g.fillRect(0, 0, 7, CHh); g.fillRect(CW - 7, 0, 7, CHh);
    // bandeau sombre de l'étiquette
    g.fillStyle = 'rgba(6,8,18,0.82)'; g.fillRect(9, 3, CW - 18, CHh - 6);
    g.restore();
    g.fillStyle = 'rgba(255,255,255,0.75)'; g.fillRect(8, 1.2, CW - 16, 1.2);
    g.font = `700 12.5px ${r.font}`; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = mix(col, '#ffffff', 0.45);
    g.fillText(C.label, CW / 2, CHh / 2 + 0.5);
  });
}

export function drawCapsules(ctx, r, caps) {
  const P = BK.PAD;
  for (const c of caps) {
    const C = CAPS[c.type];
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.45 + 0.15 * Math.sin(c.t * 8);
    ctx.drawImage(glowSprite(C.color, 64), c.x - 50, c.y - 28, 100, 56);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    // rotation simulée autour de l'axe horizontal
    const k = 0.6 + 0.4 * Math.abs(Math.cos(c.t * 4.5));
    const w = CW + P * 2, h = (CHh + P * 2) * k;
    ctx.drawImage(capsuleSprite(r, c.type), c.x - w / 2, c.y - h / 2, w, h);
  }
}

// ---------------------------------------------------------------- plateforme

let padGrad = null;
function paddleGrads(ctx, h) {
  if (padGrad && padGrad.ctx === ctx) return padGrad;
  const body = ctx.createLinearGradient(0, -h / 2, 0, h / 2);
  body.addColorStop(0, '#f8fbff'); body.addColorStop(0.2, '#c2cee2'); body.addColorStop(0.48, '#56647e');
  body.addColorStop(0.75, '#1a2234'); body.addColorStop(1, '#68789a');
  const end = ctx.createLinearGradient(0, -h / 2, 0, h / 2);
  end.addColorStop(0, '#ffd6fb'); end.addColorStop(0.3, '#ff3df2'); end.addColorStop(0.7, '#8a1080'); end.addColorStop(1, '#ff7af5');
  padGrad = { ctx, body, end };
  return padGrad;
}

// st : { x, color, laser, magnet, kick, t }
export function drawPaddle(ctx, P, st) {
  const x = st.x, y = P.y, w = P.w, h = P.h, hw = w / 2, t = st.t;
  const col = P.stun > 0 ? '#ff4060' : st.color;
  const G = paddleGrads(ctx, h);
  ctx.globalCompositeOperation = 'lighter';
  // halo et coussin antigravité
  ctx.globalAlpha = 0.28 + 0.5 * Math.max(0, P.hitFlash);
  ctx.drawImage(glowSprite(col, 64), x - hw - 36, y - 34, w + 72, 68);
  ctx.globalAlpha = 0.3 + 0.1 * Math.sin(t * 10);
  ctx.drawImage(glowSprite(col, 64), x - hw + 6, y + 4, w - 12, 26);
  // réacteurs latéraux : poussée opposée au déplacement
  const mv = clamp(P.vx / P.maxV, -1, 1);
  for (const sx of [-1, 1]) {
    const k = Math.max(0, -sx * mv);
    ctx.globalAlpha = 0.3 + 0.7 * k;
    const len = 14 + 26 * k;
    ctx.drawImage(glowSprite(MAGENTA, 32), sx < 0 ? x - hw - len + 2 : x + hw - 2, y - 7, len, 14);
  }
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
  ctx.save();
  ctx.translate(x, y);
  // canons laser
  if (st.laser) {
    for (const sx of [-1, 1]) {
      const cx = sx * (hw - 9);
      ctx.fillStyle = '#2a3148'; ctx.fillRect(cx - 3.5, -h / 2 - 8 + st.kick * 3, 7, 10);
      ctx.fillStyle = '#ff3b5c'; ctx.fillRect(cx - 2, -h / 2 - 9 + st.kick * 3, 4, 3);
    }
  }
  // coque chromée et embouts magenta
  pill(ctx, -hw, -h / 2, w, h);
  ctx.fillStyle = G.body;
  ctx.fill();
  ctx.save();
  ctx.clip();
  ctx.fillStyle = G.end;
  ctx.fillRect(-hw, -h / 2, 13, h); ctx.fillRect(hw - 13, -h / 2, 13, h);
  ctx.fillStyle = 'rgba(8,10,20,0.85)';
  ctx.fillRect(-hw + 13, -h / 2, 1.6, h); ctx.fillRect(hw - 14.6, -h / 2, 1.6, h);
  // jonctions des extensions (plateforme élargie)
  if (P.w > P.baseW + 4) { const e = P.baseW / 2; ctx.fillRect(-e - 0.8, -h / 2, 1.6, h); ctx.fillRect(e - 0.8, -h / 2, 1.6, h); }
  ctx.restore();
  ctx.strokeStyle = col; ctx.lineWidth = 1.6;
  pill(ctx, -hw, -h / 2, w, h); ctx.stroke();
  // visière centrale
  ctx.fillStyle = '#070b16';
  pill(ctx, -21, -4, 42, 8); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.fillRect(-hw + 10, -h / 2 + 1.4, w - 20, 1);
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = 0.75 + 0.25 * Math.sin(t * 6);
  ctx.fillStyle = col;
  ctx.fillRect(-17, -1.2, 34, 2.4);
  ctx.drawImage(glowSprite(col, 32), -26, -9, 52, 18);
  // repères de visée
  ctx.fillStyle = '#ffffff';
  for (const u of [-0.66, -0.33, 0.33, 0.66]) { ctx.globalAlpha = 0.5; ctx.fillRect(u * hw - 1, -h / 2 + 2.5, 2, 3); }
  // éclair d'impact
  if (P.hitFlash > 0.05) {
    ctx.globalAlpha = P.hitFlash * 0.55; ctx.fillStyle = col;
    pill(ctx, -hw, -h / 2, w, h); ctx.fill();
  }
  // émetteurs aux extrémités
  const ec = st.laser ? '#ff3b5c' : st.magnet ? '#b26bff' : MAGENTA;
  ctx.globalAlpha = 0.85 + 0.15 * Math.sin(t * 12);
  for (const sx of [-1, 1]) ctx.drawImage(glowSprite(ec, 32), sx * (hw - 7) - 9, -9, 18, 18);
  if (st.laser) {
    ctx.globalAlpha = 0.6 + 0.4 * st.kick;
    for (const sx of [-1, 1]) ctx.drawImage(glowSprite('#ff3b5c', 32), sx * (hw - 9) - 9, -h / 2 - 16, 18, 18);
  }
  // champ magnétique
  if (st.magnet) {
    ctx.strokeStyle = '#b26bff'; ctx.lineWidth = 1.5;
    for (let k = 0; k < 3; k++) {
      const u = (t * 1.6 + k / 3) % 1;
      ctx.globalAlpha = 0.6 * (1 - u);
      ctx.beginPath(); ctx.ellipse(0, -h / 2, hw * (0.5 + 0.5 * u), 6 + 22 * u, 0, Math.PI, TAU); ctx.stroke();
    }
  }
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
  ctx.restore();
}

// ---------------------------------------------------------------- tirs, éclats, halos

export function drawBolts(ctx, bolts) {
  if (!bolts.length) return;
  ctx.globalCompositeOperation = 'lighter';
  ctx.lineCap = 'round';
  ctx.strokeStyle = '#ff3b5c'; ctx.lineWidth = 7; ctx.globalAlpha = 0.35;
  ctx.beginPath();
  for (const b of bolts) { ctx.moveTo(b.x, b.y); ctx.lineTo(b.x, b.y + 22); }
  ctx.stroke();
  ctx.strokeStyle = '#ffe0e6'; ctx.lineWidth = 2.2; ctx.globalAlpha = 1;
  ctx.beginPath();
  for (const b of bolts) { ctx.moveTo(b.x, b.y); ctx.lineTo(b.x, b.y + 16); }
  ctx.stroke();
  ctx.globalCompositeOperation = 'source-over';
}

// éclats triangulaires avec gravité (fragments de briques) : un seul remplissage par
// série de même couleur, la disparition se fait en rétrécissant (pas d'alpha par éclat)
export function drawShards(ctx, shards) {
  const n = shards.length;
  if (!n) return;
  let col = null;
  ctx.globalAlpha = 1;
  for (let i = 0; i < n; i++) {
    const s = shards[i];
    if (s.c !== col) {
      if (col) ctx.fill();
      col = s.c; ctx.fillStyle = col; ctx.beginPath();
    }
    const u = 1 - s.t / s.life;
    const z = s.s * (u < 0.35 ? u / 0.35 : 1);
    const c = Math.cos(s.a) * z, sn = Math.sin(s.a) * z;
    ctx.moveTo(s.x + c, s.y + sn);
    ctx.lineTo(s.x - sn * 0.7 - c * 0.35, s.y + c * 0.7 - sn * 0.35);
    ctx.lineTo(s.x + sn * 0.45 - c * 0.8, s.y - c * 0.45 - sn * 0.8);
    ctx.closePath();
  }
  ctx.fill();
  // reflets additifs des éclats récents (un sur deux)
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < n; i += 2) {
    const s = shards[i];
    if (s.t > 0.18) continue;
    ctx.globalAlpha = 0.8 * (1 - s.t / 0.18);
    const z = s.s * 3.2;
    ctx.drawImage(glowSprite(s.c, 32), s.x - z / 2, s.y - z / 2, z, z);
  }
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
}

// halos brefs (destruction, prise de capsule) et souffles d'explosion
export function drawFlashes(ctx, flashes, blasts) {
  ctx.globalCompositeOperation = 'lighter';
  for (const f of flashes) {
    const u = f.t / f.life;
    ctx.globalAlpha = (1 - u) * (f.a || 0.9);
    const z = f.size * (0.6 + 0.6 * u);
    ctx.drawImage(glowSprite(f.color, 64), f.x - z / 2, f.y - z * f.k / 2, z, z * f.k);
  }
  for (const b of blasts) {
    const u = b.t / 0.4;
    const z = 60 + 200 * u;
    ctx.globalAlpha = 0.9 * (1 - u);
    ctx.drawImage(glowSprite('#ff6a2b', 64), b.x - z / 2, b.y - z / 2, z, z);
    ctx.globalAlpha = 0.9 * (1 - u) * (1 - u);
    ctx.drawImage(glowSprite('#fff2c0', 64), b.x - z / 4, b.y - z / 4, z / 2, z / 2);
  }
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
}

// échos holographiques : lignes de balayage et décalage chromatique
export function drawEchoFx(ctx, echoes, t) {
  if (!echoes.length) return;
  ctx.globalCompositeOperation = 'lighter';
  for (const e of echoes) {
    const a = e.alpha;
    const j = Math.sin(t * 53 + e.id) > 0.85 ? 4 : 0;
    ctx.globalAlpha = 0.5 * a;
    ctx.strokeStyle = HOLO; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.arc(e.x + j, e.y, e.r + 4, 0, TAU); ctx.stroke();
    ctx.strokeStyle = MAGENTA;
    ctx.beginPath(); ctx.arc(e.x - 2 - j, e.y + 1, e.r + 3, 0, TAU); ctx.stroke();
    ctx.fillStyle = HOLO; ctx.globalAlpha = 0.55 * a;
    const o = (t * 40) % 6;
    for (let k = -2; k <= 2; k++) ctx.fillRect(e.x - e.r + j, e.y + k * 6 + o - 3, e.r * 2, 1);
  }
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
}

// ---------------------------------------------------------------- décor

// Sol du hangar (calque statique) : grille néon, marquages, piste de la plateforme.
export function drawFloor(g, col, font) {
  const { L, R, CEIL, CH, PY } = BK;
  const B = 1100, W = R - L;
  g.save();
  g.beginPath();
  g.moveTo(L, B); g.lineTo(L, CEIL + CH); g.lineTo(L + CH, CEIL); g.lineTo(R - CH, CEIL); g.lineTo(R, CEIL + CH); g.lineTo(R, B);
  g.closePath();
  g.fillStyle = '#04060f'; g.fill();
  g.clip();
  let grd = g.createLinearGradient(0, CEIL, 0, B);
  grd.addColorStop(0, '#0d0f2e'); grd.addColorStop(0.3, '#080c22'); grd.addColorStop(0.7, '#060a18'); grd.addColorStop(1, '#03050c');
  g.fillStyle = grd; g.fillRect(L, CEIL, W, B - CEIL);
  // éclairages colorés du hangar
  const pool = (x, y, rad, c, a) => {
    const rg = g.createRadialGradient(x, y, 0, x, y, rad);
    rg.addColorStop(0, rgba(c, a)); rg.addColorStop(1, rgba(c, 0));
    g.fillStyle = rg; g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  };
  pool(300, 210, 360, '#ff2bd6', 0.1);
  pool(300, 640, 420, col, 0.07);
  pool(L, 1000, 260, '#6a5cff', 0.08);
  pool(R, 1000, 260, '#6a5cff', 0.08);
  // grille : fine tous les 24, majeure tous les 96
  g.lineWidth = 1;
  g.strokeStyle = rgba(col, 0.045);
  g.beginPath();
  for (let x = L + 12; x < R; x += 24) { g.moveTo(x, CEIL); g.lineTo(x, B); }
  for (let y = CEIL + 12; y < B; y += 24) { g.moveTo(L, y); g.lineTo(R, y); }
  g.stroke();
  g.strokeStyle = rgba(col, 0.13);
  g.beginPath();
  for (let x = L + 12 + 48; x < R; x += 96) { g.moveTo(x, CEIL); g.lineTo(x, B); }
  for (let y = CEIL + 12 + 72; y < B; y += 96) { g.moveTo(L, y); g.lineTo(R, y); }
  g.stroke();
  g.fillStyle = rgba(col, 0.4);
  for (let x = L + 12 + 48; x < R; x += 96) for (let y = CEIL + 12 + 72; y < B; y += 96) { g.fillRect(x - 2, y - 0.5, 4, 1); g.fillRect(x - 0.5, y - 2, 1, 4); }
  // sas supérieur : hachures magenta entre plafond et mur
  g.save();
  g.beginPath(); g.rect(L, CEIL, W, 100); g.clip();
  g.strokeStyle = rgba('#ff2bd6', 0.07); g.lineWidth = 6;
  g.beginPath();
  for (let x = L - 110; x < R + 110; x += 22) { g.moveTo(x, CEIL + 100); g.lineTo(x + 100, CEIL); }
  g.stroke();
  g.restore();
  g.strokeStyle = rgba('#ff2bd6', 0.35); g.lineWidth = 1;
  g.setLineDash([10, 6]);
  g.beginPath(); g.moveTo(L + 6, CEIL + 100); g.lineTo(R - 6, CEIL + 100); g.stroke();
  g.setLineDash([]);
  // aire d'appontage centrale
  const cx = 300, cy = 660;
  g.strokeStyle = rgba(col, 0.16); g.lineWidth = 2;
  g.beginPath(); g.arc(cx, cy, 128, 0, TAU); g.stroke();
  g.lineWidth = 1; g.setLineDash([4, 8]);
  g.beginPath(); g.arc(cx, cy, 104, 0, TAU); g.stroke();
  g.setLineDash([]);
  g.strokeStyle = rgba(col, 0.22); g.lineWidth = 2;
  for (let k = 0; k < 24; k++) {
    const a = k * TAU / 24, r0 = k % 6 === 0 ? 112 : 120;
    g.beginPath(); g.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0); g.lineTo(cx + Math.cos(a) * 128, cy + Math.sin(a) * 128); g.stroke();
  }
  g.strokeStyle = rgba(col, 0.08); g.lineWidth = 1;
  g.beginPath(); g.moveTo(cx - 150, cy); g.lineTo(cx + 150, cy); g.moveTo(cx, cy - 150); g.lineTo(cx, cy + 150); g.stroke();
  g.font = `900 92px ${font}`; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillStyle = rgba(col, 0.05); g.fillText('07', cx, cy + 4);
  g.font = `700 11px ${font}`; g.fillStyle = rgba(col, 0.32);
  g.fillText('AIRE D\'APPONTAGE · ZÉRO-G', cx, cy + 146);
  // piste de la plateforme
  g.strokeStyle = rgba(col, 0.22); g.lineWidth = 1;
  g.beginPath(); g.moveTo(L, PY - 16); g.lineTo(R, PY - 16); g.moveTo(L, PY + 16); g.lineTo(R, PY + 16); g.stroke();
  g.fillStyle = rgba(col, 0.05); g.fillRect(L, PY - 16, W, 32);
  g.fillStyle = rgba(col, 0.35);
  for (let x = L + 20; x < R; x += 40) { g.fillRect(x - 0.5, PY - 16, 1, 5); g.fillRect(x - 0.5, PY + 11, 1, 5); }
  // bande de danger sous la piste
  g.save();
  g.beginPath(); g.rect(L, PY + 22, W, 18); g.clip();
  g.fillStyle = rgba('#ffb21f', 0.16); g.fillRect(L, PY + 22, W, 18);
  g.fillStyle = 'rgba(0,0,0,0.6)';
  for (let x = L - 20; x < R + 20; x += 20) { g.beginPath(); g.moveTo(x, PY + 40); g.lineTo(x + 10, PY + 40); g.lineTo(x + 28, PY + 22); g.lineTo(x + 18, PY + 22); g.closePath(); g.fill(); }
  g.restore();
  // inscriptions latérales
  g.font = `700 10px ${font}`; g.fillStyle = rgba(col, 0.3);
  g.save(); g.translate(L + 12, 640); g.rotate(-Math.PI / 2); g.fillText('HANGAR-07 // GRAVITÉ COUPÉE', 0, 0); g.restore();
  g.save(); g.translate(R - 12, 640); g.rotate(Math.PI / 2); g.fillText('CORTEX-9 · BAIE DE MAINTENANCE', 0, 0); g.restore();
  // équerres d'angle de la zone de briques
  g.strokeStyle = rgba(col, 0.45); g.lineWidth = 2;
  for (const [x, y, sx, sy] of [[L + 8, CEIL + 112, 1, 1], [R - 8, CEIL + 112, -1, 1], [L + 8, 540, 1, -1], [R - 8, 540, -1, -1]]) {
    g.beginPath(); g.moveTo(x, y + sy * 18); g.lineTo(x, y); g.lineTo(x + sx * 18, y); g.stroke();
  }
  // vignettage
  const vg = g.createRadialGradient(300, 560, 200, 300, 560, 640);
  vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.5)');
  g.fillStyle = vg; g.fillRect(L, CEIL, W, B - CEIL);
  g.restore();
  // tube néon sous le plafond
  g.globalCompositeOperation = 'lighter';
  g.strokeStyle = rgba('#ff2bd6', 0.22); g.lineWidth = 8;
  g.beginPath(); g.moveTo(L + CH + 8, CEIL + 7); g.lineTo(R - CH - 8, CEIL + 7); g.stroke();
  g.strokeStyle = rgba('#ff9cf0', 0.8); g.lineWidth = 1.5;
  g.beginPath(); g.moveTo(L + CH + 8, CEIL + 7); g.lineTo(R - CH - 8, CEIL + 7); g.stroke();
  g.globalCompositeOperation = 'source-over';
}

// Animations du sol (chaque image) : balayage, guirlandes de diodes, ligne limite du mur.
export function drawFloorFx(ctx, t, col, limitY, warn, font) {
  const { L, R, CEIL } = BK;
  ctx.globalCompositeOperation = 'lighter';
  const y = CEIL + ((t * 160) % 1150) - 40;
  ctx.globalAlpha = 0.07;
  ctx.drawImage(glowSprite(col, 64), L, y - 34, R - L, 68);
  ctx.globalAlpha = 0.22;
  ctx.fillStyle = col; ctx.fillRect(L, y, R - L, 1);
  // diodes en chenillard le long des murs
  for (let i = 0; i < 13; i++) {
    const yy = 110 + i * 72;
    const p = Math.max(0, 1 - (((t * 2.2 - i * 0.18) % 2.4) + 2.4) % 2.4);
    ctx.globalAlpha = 0.18 + 0.7 * p;
    ctx.drawImage(glowSprite(i % 3 === 2 ? MAGENTA : col, 32), L + 1, yy - 7, 14, 14);
    ctx.drawImage(glowSprite(i % 3 === 2 ? MAGENTA : col, 32), R - 15, yy - 7, 14, 14);
  }
  // limite de descente du mur
  if (limitY > 0) {
    const a = warn ? 0.5 + 0.35 * Math.sin(t * 8) : 0.32;
    ctx.globalAlpha = a;
    ctx.strokeStyle = '#ff3b5c'; ctx.lineWidth = 2;
    ctx.setLineDash([12, 8]); ctx.lineDashOffset = -t * 30;
    ctx.beginPath(); ctx.moveTo(L + 6, limitY); ctx.lineTo(R - 6, limitY); ctx.stroke();
    ctx.setLineDash([]); ctx.lineDashOffset = 0;
    ctx.font = `700 10px ${font}`; ctx.textAlign = 'left'; ctx.textBaseline = 'bottom';
    ctx.fillStyle = '#ff3b5c'; ctx.fillText('LIMITE DE DESCENTE', L + 12, limitY - 4);
  }
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
}
