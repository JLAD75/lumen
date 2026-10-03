import { COLORS } from '../config.js';
import { mulberry32, rgba, hexToRgb } from '../util/math.js';
import { glowSprite } from './sprites.js';

// Décor de fond animé : l'intérieur de la station orbitale Cortex-9, mégapole cyberpunk.
// Calques statiques pré-rendus au redimensionnement (ciel, planète, piliers, trois strates
// de tours dont la plus lointaine est figée dans le ciel) ; à chaque image : dérive lente
// des deux strates proches, enseignes holographiques, navettes, voies de circulation,
// projecteurs, pluie de données et teinte d'humeur ('calm' | 'hot' | 'null').
// Tous les éléments animés viennent d'un seul atlas : le GPU les regroupe en peu d'appels.
// Le ciel est posé en « copy » et rien n'est dessiné sous le plateau (opaque, dessiné après).
// API : new Backdrop(settings) · resize(W, H, dpr) · draw(ctx, t, { rect, mood, intensity, level })

const FD = '"Orbitron", "Rajdhani", "Segoe UI", sans-serif';
const FJ = '"Yu Gothic UI", "Yu Gothic", "Hiragino Sans", "Meiryo", "Noto Sans JP", "Noto Sans CJK JP", sans-serif';
const FM = '"MS Gothic", "Osaka-Mono", "Noto Sans Mono CJK JP", "Noto Sans JP", monospace';
const GLYPHS = 'ｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿﾀﾁﾂﾃﾄﾅﾆﾇﾈﾉﾊﾋﾌﾍﾎﾏﾐﾑﾒﾓﾔﾕﾖﾗﾘﾙﾚﾛﾜﾝ0123456789:=+<>';
const RAIN_VARS = 8;
const WIN_COLS = ['#ffcf7a', '#ffb35c', '#7fe8ff', '#ff8ad8', '#e8f0ff', '#b9a4ff'];
const RAIN_COLS = [COLORS.cyan, COLORS.magenta, COLORS.red];
const TRAIL_COLS = ['#ffffff', COLORS.cyan, '#ff5a7a', COLORS.amber, COLORS.magenta];
const BEAM_COLS = [COLORS.cyan, COLORS.violet, COLORS.magenta, COLORS.amber];
const NULL_COL = '#ff3050';
const STAR_COL = '#cfe8ff';

// enseignes : texte normal, variante quand NULL prend la main, couleur, vertical, strate
const SIGNS = [
  { t: 'CORTEX-9', n: 'NULL', c: COLORS.cyan, L: 2, big: true },
  { t: 'NÉON', n: 'NÉANT', c: COLORS.magenta, L: 2 },
  { t: 'ARCADE', n: '0xDEAD', c: COLORS.amber, L: 2 },
  { t: 'ネオン', n: 'ヌル', c: COLORS.magenta, L: 2, v: true },
  { t: '電脳', n: '虚無', c: COLORS.violet, L: 2, v: true },
  { t: 'LUMEN', n: 'ERREUR', c: '#7ff0ff', L: 1, big: true },
  { t: 'NULL', n: 'NULL', c: COLORS.red, L: 1, bad: true },
  { t: 'RAMEN', n: 'VIDE', c: '#ff9a3d', L: 1 },
  { t: 'サイバー', n: 'ヌル', c: COLORS.cyan, L: 1, v: true },
  { t: 'ルーメン', n: 'ヌル', c: COLORS.lime, L: 2, v: true },
];

// voies de circulation lointaines (rectilignes) : y gauche, y droite (fraction de H), couleur, sens
const LANES = [[0.53, 0.47, '#ffb45a', 1], [0.555, 0.505, '#e8f4ff', -1], [0.6, 0.645, '#ff5a7a', 1], [0.44, 0.415, '#7fe8ff', -1]];

// strates de tours, du lointain au proche : dérive (px CSS/s), plage des sommets (fraction de H)
const STRATA = [
  { v: 0, y0: 0.4, y1: 0.64, spire: 0.27, w0: 14, w1: 44, step: 0.7, fill: ['#21164a', '#130c2c'], rim: '#8f72ff', rimA: 0.28,
    win: [1.3, 1.6, 3.2, 3.8], lit: 0.2, winA: 0.5, neon: 0.06, ant: 0.25, haze: [58, 26, 110], hazeA: 0.62 },
  { v: 4.5, y0: 0.47, y1: 0.76, spire: 0.36, w0: 24, w1: 72, step: 0.75, fill: ['#150d30', '#0a0718'], rim: '#29e3ff', rimA: 0.32,
    win: [1.9, 2.3, 4.6, 5.4], lit: 0.26, winA: 0.75, neon: 0.22, ant: 0.35, haze: [44, 14, 76], hazeA: 0.5 },
  { v: 8, y0: 0.58, y1: 0.88, spire: 0.45, w0: 46, w1: 124, step: 0.82, fill: ['#0b0818', '#040309'], rim: '#ff3df2', rimA: 0.4,
    win: [5.5, 1.7, 9, 7.5], lit: 0.13, winA: 0.85, neon: 0.34, ant: 0.3, haze: [26, 6, 40], hazeA: 0.45 },
];

function mk(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h));
  return c;
}

function tint(src, color) {
  const c = mk(src.width, src.height), g = c.getContext('2d');
  g.drawImage(src, 0, 0);
  g.globalCompositeOperation = 'source-in';
  g.fillStyle = color; g.fillRect(0, 0, c.width, c.height);
  return c;
}

// mélange vers le blanc (cœur des tubes néon)
function light(hex, k) {
  const [r, g, b] = hexToRgb(hex);
  return `rgb(${Math.round(r + (255 - r) * k)},${Math.round(g + (255 - g) * k)},${Math.round(b + (255 - b) * k)})`;
}

// rangement en étagères de petites images dans un atlas unique (marge anti-bavure de 2 px)
function pack(list) {
  const pad = 2, maxW = 2048;
  const items = list.slice().sort((a, b) => b.c.height - a.c.height);
  let x = pad, y = pad, rowH = 0, W = 0;
  for (const it of items) {
    if (x + it.c.width + pad > maxW && x > pad) { x = pad; y += rowH + pad; rowH = 0; }
    it.x = x; it.y = y;
    x += it.c.width + pad; rowH = Math.max(rowH, it.c.height); W = Math.max(W, x);
  }
  const c = mk(W, y + rowH + pad), g = c.getContext('2d');
  const map = new Map();
  for (const it of items) { g.drawImage(it.c, it.x, it.y); map.set(it.key, { x: it.x, y: it.y, w: it.c.width, h: it.c.height }); }
  return { c, map };
}

export class Backdrop {
  constructor(settings) {
    this.settings = settings || {};
    this.W = 1; this.H = 1; this.dpr = 1;
    this.L = null;            // calques pré-rendus (géométrie en px CSS de la taille de rendu)
    this.dirty = true; this.resizedAt = 0;
    this.art = null;          // atlas des éléments animés (dépend des polices)
    this.hot = 0; this.nul = 0;
    this.lastT = null;
    this.off = [0, 0, 0];
    this.trails = []; this.streams = [];
    this.flat = null; this.flatKey = '';
    this.shade = null; this.shadeKey = '';
    this.ms = 0;              // coût CPU moyen de draw (ms)
    const f = typeof document !== 'undefined' && document.fonts;
    if (f && f.load) {
      Promise.all([f.load('900 24px Orbitron'), f.load('700 24px Rajdhani')])
        .then(() => { this.art = null; }).catch(() => {});
    }
  }

  resize(W, H, dpr) {
    if (W === this.W && H === this.H && dpr === this.dpr) return;
    this.W = W; this.H = H; this.dpr = dpr;
    this.dirty = true; this.resizedAt = performance.now();
  }

  // ------------------------------------------------------------ pré-rendu
  _build() {
    const W = this.W, H = this.H;
    let s = Math.min(this.dpr, 1.5);
    if (W * H * s * s > 3.2e6) s = Math.sqrt(3.2e6 / (W * H));
    const u = Math.max(0.55, Math.min(1.8, H / 900));
    const L = { W, H, s, u, Ws: Math.max(W, 700), strata: [], signs: [], beacons: [] };
    this.L = L;
    L.sky = this._sky(L, mulberry32(9));
    for (let i = 0; i < 3; i++) L.strata.push(this._stratum(L, i, mulberry32(101 + i * 37)));
    // la strate lointaine dérive à peine : on la fige dans le ciel (une passe plein écran de moins)
    const far = L.strata[0], sg = L.sky.getContext('2d');
    sg.setTransform(L.s, 0, 0, L.s, 0, 0);
    sg.drawImage(far.c, 0, far.yTop, L.Ws, H - far.yTop);
    far.c = null;
    this._placeSigns(L, mulberry32(5));
    this.dirty = false;
    this.art = null; this.flat = null; this.flatKey = ''; this.shade = null; this.shadeKey = '';
    this.trails.length = 0; this.streams.length = 0;
  }

  _sky(L, rnd) {
    const { W, H, s } = L;
    const c = mk(W * s, H * s), g = c.getContext('2d');
    g.setTransform(s, 0, 0, s, 0, 0);
    // dégradé : espace profond → lueur violette de la ville → sol sombre
    const gr = g.createLinearGradient(0, 0, 0, H);
    gr.addColorStop(0, '#030212'); gr.addColorStop(0.3, '#070520'); gr.addColorStop(0.58, '#1b0b36');
    gr.addColorStop(0.72, '#24103e'); gr.addColorStop(0.86, '#120822'); gr.addColorStop(1, '#05030c');
    g.fillStyle = gr; g.fillRect(0, 0, W, H);
    // nébuleuses, surtout sur les côtés
    g.globalCompositeOperation = 'lighter';
    const neb = [['#4a1d8a', 0.2], ['#0d5a7a', 0.16], ['#8a1d6e', 0.13], ['#2a1d8a', 0.18]];
    for (let i = 0; i < 7; i++) {
      const [col, a] = neb[i % 4];
      const side = i % 2 ? 0.72 + rnd() * 0.3 : rnd() * 0.3;
      const x = side * W, y = (0.12 + rnd() * 0.42) * H, r = (0.18 + rnd() * 0.28) * Math.max(W, H);
      const ng = g.createRadialGradient(x, y, 0, x, y, r);
      ng.addColorStop(0, rgba(col, a)); ng.addColorStop(0.5, rgba(col, a * 0.35)); ng.addColorStop(1, rgba(col, 0));
      g.fillStyle = ng; g.fillRect(x - r, y - r, 2 * r, 2 * r);
    }
    g.globalCompositeOperation = 'source-over';
    // étoiles, plus denses en haut
    const n = Math.round(W * H / 1500);
    L.stars = [];
    for (let i = 0; i < n; i++) {
      const x = rnd() * W, y = Math.pow(rnd(), 1.35) * H * 0.72, m = rnd();
      g.globalAlpha = (0.2 + m * 0.8) * (1 - y / H * 0.9);
      g.fillStyle = m > 0.93 ? '#bfe3ff' : m > 0.86 ? '#ffd9c0' : m > 0.8 ? '#d9c8ff' : '#ffffff';
      const r = m > 0.97 ? 1.7 : m > 0.75 ? 1.1 : 0.7;
      g.fillRect(x, y, r, r);
      if (m > 0.985 && L.stars.length < 28) L.stars.push({ x, y, ph: rnd() * 6.3, sp: 0.6 + rnd() * 1.8 });
    }
    g.globalAlpha = 1;
    this._planet(g, L, rnd);
    this._pillars(g, L, rnd);
    // lueur de la ville à l'horizon
    g.globalCompositeOperation = 'lighter';
    const hz = g.createLinearGradient(0, H * 0.4, 0, H * 0.85);
    hz.addColorStop(0, 'rgba(160,60,200,0)'); hz.addColorStop(0.55, 'rgba(170,50,190,0.16)'); hz.addColorStop(1, 'rgba(60,20,90,0)');
    g.fillStyle = hz; g.fillRect(0, H * 0.4, W, H * 0.45);
    for (const [x, col] of [[0.1, '#29e3ff'], [0.9, '#ff3df2'], [0.3, '#a070ff'], [0.7, '#29e3ff']]) {
      const cx = x * W, cy = H * 0.68, r = 0.32 * Math.max(W, H * 1.4);
      const rg = g.createRadialGradient(cx, cy, 0, cx, cy, r);
      rg.addColorStop(0, rgba(col, 0.12)); rg.addColorStop(1, rgba(col, 0));
      g.fillStyle = rg; g.fillRect(cx - r, cy - r, 2 * r, 2 * r);
    }
    g.globalCompositeOperation = 'source-over';
    return c;
  }

  // planète géante dont le limbe forme un arc en haut de l'écran, lever de soleil à gauche
  _planet(g, L, rnd) {
    const { W, H, u } = L;
    const R = Math.max(W, H) * 2.1, pcx = W * 0.58, pcy = H * 0.16 - R;
    g.save();
    g.beginPath(); g.arc(pcx, pcy, R, 0, Math.PI * 2); g.closePath();
    const body = g.createRadialGradient(pcx, pcy, R - 320 * u, pcx, pcy, R);
    body.addColorStop(0, '#020310'); body.addColorStop(0.55, '#050a22'); body.addColorStop(0.85, '#0b1d44');
    body.addColorStop(0.96, '#14467a'); body.addColorStop(1, '#3ab0e0');
    g.fillStyle = body; g.fill();
    g.clip();
    // bandes nuageuses
    g.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 9; i++) {
      g.strokeStyle = rgba(i % 3 ? '#3a78c0' : '#7a5cff', 0.035 + rnd() * 0.04);
      g.lineWidth = (4 + rnd() * 18) * u;
      g.beginPath(); g.arc(pcx, pcy, R - (14 + rnd() * 200) * u, 0, Math.PI * 2); g.stroke();
    }
    // lumières des villes côté nuit
    const a0 = Math.asin(Math.max(-1, (0 - pcx) / R)), a1 = Math.asin(Math.min(1, (W - pcx) / R));
    const nc = Math.round(W / 2.2);
    for (let i = 0; i < nc; i++) {
      const a = a0 + rnd() * (a1 - a0);
      if (Math.sin(a * 140) + Math.sin(a * 57 + 1) < 0.3) continue;   // grappes
      const dd = (10 + Math.pow(rnd(), 1.6) * 230) * u;
      const x = pcx + Math.sin(a) * (R - dd), y = pcy + Math.cos(a) * (R - dd);
      g.fillStyle = rnd() < 0.8 ? 'rgba(255,190,110,0.5)' : 'rgba(120,230,255,0.5)';
      g.globalAlpha = 0.3 + rnd() * 0.6;
      g.fillRect(x, y, 1.1 * u, 1.1 * u);
    }
    g.globalAlpha = 1;
    g.restore();
    // atmosphère : halo au-delà du limbe, plus vif côté soleil (gauche)
    g.globalCompositeOperation = 'lighter';
    const at = g.createRadialGradient(pcx, pcy, R - 4 * u, pcx, pcy, R + 110 * u);
    at.addColorStop(0, 'rgba(90,220,255,0.5)'); at.addColorStop(0.12, 'rgba(70,170,255,0.24)');
    at.addColorStop(0.4, 'rgba(120,80,255,0.08)'); at.addColorStop(1, 'rgba(80,40,200,0)');
    g.fillStyle = at;
    g.beginPath(); g.arc(pcx, pcy, R + 110 * u, 0, Math.PI * 2); g.arc(pcx, pcy, R - 4 * u, 0, Math.PI * 2, true); g.fill();
    const lg = g.createLinearGradient(0, 0, W, 0);
    lg.addColorStop(0, 'rgba(210,250,255,0.95)'); lg.addColorStop(0.35, 'rgba(110,220,255,0.6)');
    lg.addColorStop(0.7, 'rgba(150,110,255,0.45)'); lg.addColorStop(1, 'rgba(255,80,220,0.35)');
    g.strokeStyle = lg; g.lineWidth = 1.6 * u;
    g.beginPath(); g.arc(pcx, pcy, R, 0, Math.PI * 2); g.stroke();
    // soleil qui se lève derrière le limbe
    const sx = W * 0.07, sy = pcy + Math.sqrt(Math.max(0, R * R - (sx - pcx) * (sx - pcx)));
    g.drawImage(glowSprite('#7fdcff', 128, 0.05), sx - 210 * u, sy - 210 * u, 420 * u, 420 * u);
    g.drawImage(glowSprite('#ffffff', 64, 0.2), sx - 46 * u, sy - 46 * u, 92 * u, 92 * u);
    const fl = g.createLinearGradient(sx - 520 * u, 0, sx + 520 * u, 0);
    fl.addColorStop(0, 'rgba(120,220,255,0)'); fl.addColorStop(0.5, 'rgba(220,250,255,0.75)'); fl.addColorStop(1, 'rgba(120,220,255,0)');
    g.fillStyle = fl; g.fillRect(sx - 520 * u, sy - 1.2 * u, 1040 * u, 2.4 * u);
    g.globalCompositeOperation = 'source-over';
  }

  // piliers porteurs de la station aux deux bords (cadrent la vue « de l'intérieur »)
  _pillars(g, L, rnd) {
    const { W, H, u } = L;
    L.pillars = [];
    const pw = 30 * u;
    for (const fx of [0.045, 0.955]) {
      const x = fx * W - pw / 2;
      const gr = g.createLinearGradient(x, 0, x + pw, 0);
      gr.addColorStop(0, '#191d36'); gr.addColorStop(0.18, '#0c0f20'); gr.addColorStop(0.8, '#080a16'); gr.addColorStop(1, '#151a32');
      g.fillStyle = gr; g.fillRect(x, 0, pw, H);
      g.fillStyle = 'rgba(41,227,255,0.22)';
      g.fillRect(x, 0, 1, H); g.fillRect(x + pw - 1, 0, 1, H);
      // segments et feux de position
      for (let y = 30 * u; y < H; y += 64 * u) {
        g.fillStyle = 'rgba(0,0,0,0.55)'; g.fillRect(x, y, pw, 3 * u);
        g.fillStyle = 'rgba(140,200,255,0.25)'; g.fillRect(x, y + 3 * u, pw, 1);
        g.fillStyle = rnd() < 0.5 ? 'rgba(127,240,255,0.8)' : 'rgba(255,120,220,0.7)';
        g.fillRect(x + pw * 0.2, y + 10 * u, 2 * u, 2 * u); g.fillRect(x + pw * 0.8 - 2 * u, y + 10 * u, 2 * u, 2 * u);
      }
      // rail lumineux central (ascenseur)
      g.globalCompositeOperation = 'lighter';
      g.fillStyle = 'rgba(160,112,255,0.22)'; g.fillRect(x + pw / 2 - 3 * u, 0, 6 * u, H);
      g.fillStyle = 'rgba(200,170,255,0.6)'; g.fillRect(x + pw / 2 - 0.6 * u, 0, 1.2 * u, H);
      g.globalCompositeOperation = 'source-over';
      L.pillars.push({ x: x + pw / 2, ph: rnd() * 10, sp: 0.04 + rnd() * 0.03 });
    }
  }

  // une strate de tours, pavable horizontalement (largeur Ws) pour la dérive
  _stratum(L, i, rnd) {
    const st = STRATA[i], { H, s, u, Ws } = L;
    const yTop = Math.max(0, H * st.spire - 60 * u);
    const c = mk(Ws * s, (H - yTop) * s), g = c.getContext('2d');
    g.setTransform(s, 0, 0, s, 0, -yTop * s);
    const towers = [];
    let x = -rnd() * 30 * u;
    while (x < Ws) {
      const w = (st.w0 + rnd() * (st.w1 - st.w0)) * u;
      let top = H * (st.y0 + rnd() * (st.y1 - st.y0));
      if (rnd() < 0.09) top = H * (st.spire + rnd() * 0.06);          // tour géante
      towers.push({ x, w, top, seed: (rnd() * 1e9) | 0 });
      x += w * (st.step + rnd() * 0.5);
    }
    for (const t of towers) {
      this._tower(g, L, st, t, t.x, true, i);
      if (t.x + t.w > Ws) this._tower(g, L, st, t, t.x - Ws, false, i);
      if (t.x < 0) this._tower(g, L, st, t, t.x + Ws, false, i);
    }
    // brume atmosphérique (perspective) puis lueur de rue au pied
    g.globalCompositeOperation = 'source-atop';
    const [hr, hg, hb] = st.haze;
    const hz = g.createLinearGradient(0, yTop, 0, H);
    hz.addColorStop(0, `rgba(${hr},${hg},${hb},${st.hazeA * 0.35})`);
    hz.addColorStop(0.6, `rgba(${hr},${hg},${hb},${st.hazeA * 0.6})`);
    hz.addColorStop(1, `rgba(${hr},${hg},${hb},${st.hazeA})`);
    g.fillStyle = hz; g.fillRect(0, yTop, Ws, H - yTop);
    if (i === 2) {
      const sg = g.createLinearGradient(0, H * 0.84, 0, H);
      sg.addColorStop(0, 'rgba(255,61,242,0)'); sg.addColorStop(1, 'rgba(255,61,242,0.22)');
      g.fillStyle = sg; g.fillRect(0, H * 0.84, Ws, H * 0.16);
    }
    g.globalCompositeOperation = 'source-over';
    return { c, yTop, st, towers };
  }

  _tower(g, L, st, t, x, record, li) {
    const { H, u } = L;
    const r = mulberry32(t.seed), w = t.w, top = t.top;
    const kind = r();
    let wy0 = top;
    g.beginPath();
    if (kind < 0.42) {
      g.rect(x, top, w, H - top);
    } else if (kind < 0.68) {             // gradins
      const s1 = w * (0.14 + r() * 0.14), h1 = (12 + r() * 40) * u;
      g.moveTo(x, H); g.lineTo(x, top + h1); g.lineTo(x + s1, top + h1); g.lineTo(x + s1, top);
      g.lineTo(x + w - s1, top); g.lineTo(x + w - s1, top + h1); g.lineTo(x + w, top + h1); g.lineTo(x + w, H);
      wy0 = top + h1;
    } else if (kind < 0.84) {             // toit biseauté
      const d = w * (0.2 + r() * 0.3);
      if (r() < 0.5) { g.moveTo(x, H); g.lineTo(x, top + d); g.lineTo(x + w, top); g.lineTo(x + w, H); }
      else { g.moveTo(x, H); g.lineTo(x, top); g.lineTo(x + w, top + d); g.lineTo(x + w, H); }
      wy0 = top + d;
    } else {                              // flèche
      const sh = (30 + r() * 70) * u;
      g.moveTo(x, H); g.lineTo(x, top); g.lineTo(x + w * 0.38, top); g.lineTo(x + w * 0.5, top - sh);
      g.lineTo(x + w * 0.62, top); g.lineTo(x + w, top); g.lineTo(x + w, H);
    }
    g.closePath();
    const gr = g.createLinearGradient(0, top, 0, H);
    gr.addColorStop(0, st.fill[0]); gr.addColorStop(1, st.fill[1]);
    g.fillStyle = gr; g.fill();
    // liseré éclairé par la ville
    g.globalAlpha = st.rimA * (0.5 + r() * 0.5);
    g.fillStyle = r() < 0.5 ? st.rim : '#c9b8ff';
    g.fillRect(r() < 0.5 ? x : x + w - 1, wy0, 1, H - wy0);
    g.fillRect(x, top, w, 1);
    g.globalAlpha = 1;
    // fenêtres : étages plus ou moins occupés, couleur dominante par tour
    const [ww, wh, sx, sy] = st.win;
    const m = Math.max(2, w * 0.1);
    const cols = Math.floor((w - 2 * m) / (sx * u)), rows = Math.floor((H - wy0 - 6 * u) / (sy * u));
    const dom = WIN_COLS[(r() * WIN_COLS.length) | 0];
    const base = st.lit * (0.4 + r() * 1.2);
    const paths = new Map();
    for (let ry = 0; ry < rows; ry++) {
      const p = base * (r() < 0.2 ? 2.4 : 0.2 + r());
      if (p < 0.03) continue;
      const y = wy0 + 5 * u + ry * sy * u;
      for (let cx = 0; cx < cols; cx++) {
        if (r() > p) continue;
        const col = r() < 0.7 ? dom : WIN_COLS[(r() * WIN_COLS.length) | 0];
        let pa = paths.get(col);
        if (!pa) { pa = new Path2D(); paths.set(col, pa); }
        pa.rect(x + m + cx * sx * u, y, ww * u, wh * u);
      }
    }
    for (const [col, pa] of paths) { g.globalAlpha = st.winA * (0.55 + r() * 0.45); g.fillStyle = col; g.fill(pa); }
    g.globalAlpha = 1;
    // tube néon vertical sur une arête, couronne lumineuse
    if (r() < st.neon) {
      const col = [COLORS.cyan, COLORS.magenta, COLORS.violet, '#ff6fb5'][(r() * 4) | 0];
      const nx = r() < 0.5 ? x + 2 * u : x + w - 2 * u, len = (H - wy0) * (0.25 + r() * 0.5);
      g.globalCompositeOperation = 'lighter';
      g.fillStyle = rgba(col, 0.18); g.fillRect(nx - 3 * u, wy0 + 4 * u, 6 * u, len);
      g.fillStyle = rgba(col, 0.9); g.fillRect(nx - 0.7 * u, wy0 + 4 * u, 1.4 * u, len);
      g.globalCompositeOperation = 'source-over';
    }
    if (r() < st.neon * 0.8) {
      const col = [COLORS.cyan, COLORS.magenta, COLORS.amber][(r() * 3) | 0];
      g.globalCompositeOperation = 'lighter';
      g.fillStyle = rgba(col, 0.2); g.fillRect(x, wy0 + 1 * u, w, 5 * u);
      g.fillStyle = rgba(col, 0.85); g.fillRect(x + 1, wy0 + 2.6 * u, w - 2, 1.4 * u);
      g.globalCompositeOperation = 'source-over';
    }
    // antenne et balise clignotante
    if (r() < st.ant) {
      const ax = x + w * (0.2 + r() * 0.6), ah = (10 + r() * 34) * u * (li + 1) / 2;
      g.strokeStyle = 'rgba(120,110,170,0.5)'; g.lineWidth = Math.max(0.8, 0.9 * u);
      g.beginPath(); g.moveTo(ax, top); g.lineTo(ax, top - ah); g.stroke();
      if (record) L.beacons.push({ L: li, x: ((ax % L.Ws) + L.Ws) % L.Ws, y: top - ah, ph: r() * 6, sp: 1 + r() * 1.5, red: r() < 0.75 });
    }
  }

  // enseignes accrochées aux tours (positions en coordonnées de strate)
  _placeSigns(L, rnd) {
    const { u, Ws, H } = L;
    // un seul espacement régulier pour toutes les enseignes, strates alternées : pas de chevauchement au départ
    const order = [0, 5, 1, 8, 2, 6, 3, 7, 4, 9].map(i => SIGNS[i]);
    for (let li = 1; li <= 2; li++) {
      const towers = L.strata[li].towers.filter(t => t.x >= 0 && t.x + t.w <= Ws && t.top < H * 0.84);
      order.forEach((d, k) => {
        if (d.L !== li) return;
        const target = ((k + 0.5) / order.length + (rnd() - 0.5) * 0.03) * Ws;
        let best = null, bd = 1e9;
        for (const t of towers) {
          if (!d.v && t.w < 40 * u) continue;
          const dd = Math.abs(t.x + t.w / 2 - target);
          if (dd < bd && !L.signs.some(s => s.tw === t)) { bd = dd; best = t; }
        }
        if (!best) return;
        const cx = d.v ? (rnd() < 0.5 ? best.x - 2 * u : best.x + best.w + 2 * u) : best.x + best.w / 2;
        const ty = Math.min(H * 0.86, best.top + (d.v ? 14 : 10 + rnd() * 30) * u);
        L.signs.push({ d, i: SIGNS.indexOf(d), L: li, tw: best, cx, ty, next: 2 + rnd() * 10, fl: 0, inf: 0, sw: 0 });
      });
    }
  }

  // halos d'humeur : dégradés radiaux remplis hors plateau (calcul pur, aucune texture)
  _moodGlow(ctx, key, spots, boxes) {
    const L = this.L, { W, H } = L;
    const cache = L.grads || (L.grads = {});
    if (cache.ctx !== ctx) { L.grads = { ctx }; return this._moodGlow(ctx, key, spots, boxes); }
    let gs = cache[key];
    if (!gs) {
      gs = cache[key] = spots.map(([fx, col, a]) => {
        const cx = fx * W, cy = H * 0.66, r = Math.max(W * 0.35, H * 0.5);
        const rg = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
        rg.addColorStop(0, rgba(col, a)); rg.addColorStop(0.5, rgba(col, a * 0.3)); rg.addColorStop(1, rgba(col, 0));
        return { rg, x0: cx - r, x1: cx + r };
      });
    }
    for (const g of gs) {
      ctx.fillStyle = g.rg;
      for (const [x, y, w, h] of boxes) { const x0 = Math.max(x, g.x0), x1 = Math.min(x + w, g.x1); if (x1 > x0) ctx.fillRect(x0, y, x1 - x0, h); }
    }
  }

  // ------------------------------------------------------------ atlas des éléments animés
  _buildArt() {
    const L = this.L, { u, s } = L;
    const list = [], meta = new Map();
    const add = (key, c) => list.push({ key, c });
    // enseignes : versions normale et NULL
    for (const sg of L.signs) {
      if (meta.has('s' + sg.i)) continue;
      const d = sg.d, a = this._sign(d, d.t, d.c, u, s), b = this._sign(d, d.n, NULL_COL, u, s);
      meta.set('s' + sg.i, [a, b]);
      add('s' + sg.i + ':0', a.c); add('s' + sg.i + ':1', b.c);
    }
    // halos ronds
    const glows = new Set([STAR_COL, '#ffffff', '#ff4060', '#c9b8ff', NULL_COL].concat(TRAIL_COLS, SIGNS.map(d => d.c)));
    for (const col of glows) add('g' + col, glowSprite(col, 64, 0.2));
    // colonnes de glyphes pour la pluie de données : traîne qui s'efface, tête claire en bas
    const gs = 12 * u, n = 18, cw = gs * 1.25, lh = gs * 1.08, chh = n * lh + gs * 0.3;
    const rnd = mulberry32(77);
    RAIN_COLS.forEach((col, ci) => {
      for (let v = 0; v < RAIN_VARS; v++) {
        const c = mk(cw * s, chh * s), g = c.getContext('2d');
        g.setTransform(s, 0, 0, s, 0, 0);
        g.font = `${Math.round(gs)}px ${FM}`; g.textAlign = 'center'; g.textBaseline = 'top';
        g.fillStyle = col;
        for (let i = 0; i < n - 1; i++) {
          g.globalAlpha = Math.pow((i + 1) / n, 1.7) * 0.85;
          g.fillText(GLYPHS[(rnd() * GLYPHS.length) | 0], cw / 2, i * lh);
        }
        g.globalAlpha = 1; g.shadowColor = col; g.shadowBlur = 6 * u * s;
        g.fillStyle = '#eaffff';
        g.fillText(GLYPHS[(rnd() * GLYPHS.length) | 0], cw / 2, (n - 1) * lh);
        add('r' + ci + ':' + v, c);
      }
    });
    // traînée de navette : dégradé horizontal, une teinte par couleur
    const tc = mk(128, 8), tg = tc.getContext('2d');
    const tgr = tg.createLinearGradient(0, 0, 128, 0);
    tgr.addColorStop(0, 'rgba(255,255,255,0)'); tgr.addColorStop(0.85, 'rgba(255,255,255,0.55)'); tgr.addColorStop(1, 'rgba(255,255,255,1)');
    tg.fillStyle = tgr; tg.fillRect(0, 2, 128, 4);
    tg.globalAlpha = 0.35; tg.fillRect(0, 0, 128, 8);
    for (const col of TRAIL_COLS.concat([NULL_COL])) add('t' + col, tint(tc, col));
    // faisceau de projecteur : cône vertical doux
    const bc = mk(48, 256), bg = bc.getContext('2d');
    for (let k = 0; k < 3; k++) {
      const hw = 4 + k * 8;
      const bgr = bg.createLinearGradient(0, 256, 0, 0);
      bgr.addColorStop(0, 'rgba(255,255,255,0.35)'); bgr.addColorStop(1, 'rgba(255,255,255,0)');
      bg.fillStyle = bgr;
      bg.beginPath(); bg.moveTo(24 - 1 - k, 256); bg.lineTo(24 - hw, 0); bg.lineTo(24 + hw, 0); bg.lineTo(24 + 1 + k, 256); bg.closePath(); bg.fill();
    }
    for (const col of BEAM_COLS.concat([NULL_COL])) add('b' + col, tint(bc, col));
    const atlas = pack(list);
    // voies de circulation : motifs pointillés (pelotons irréguliers de feux)
    const lanes = new Map();
    for (const col of LANES.map(l => l[2]).concat([NULL_COL])) {
      const pc = mk(240, 4), pg = pc.getContext('2d');
      const r2 = mulberry32(col.length * 31 + col.charCodeAt(2));
      pg.fillStyle = col;
      for (let x = 2; x < 236;) { pg.globalAlpha = 0.5 + r2() * 0.5; pg.fillRect(x, 1, 3, 2); x += 6 + (r2() < 0.25 ? 18 + r2() * 30 : r2() * 8); }
      lanes.set(col, pc);
    }
    this.art = {
      c: atlas.c, map: atlas.map, meta, lanes, pats: null, patCtx: null,
      rain: RAIN_COLS.map((_, ci) => Array.from({ length: RAIN_VARS }, (_, v) => atlas.map.get('r' + ci + ':' + v))),
      rainW: cw, rainH: chh, gs,
    };
  }

  _sign(d, text, color, u, s) {
    const v = !!d.v;
    const fs = (v ? 17 : d.big ? 27 : 20) * u * (d.L === 1 ? 0.78 : 1);   // strate lointaine : plus petite
    const font = v ? `700 ${Math.round(fs)}px ${FJ}` : `900 ${Math.round(fs)}px ${FD}`;
    const m = 18 * u;
    const meas = mk(1, 1).getContext('2d');
    meas.font = font;
    const chars = Array.from(text);
    const sp = fs * 0.14;
    let w, h;
    const cws = chars.map(ch => meas.measureText(ch).width);
    if (v) { w = fs * 1.6; h = chars.length * fs * 1.12 + fs * 0.8; } else { w = cws.reduce((a, b) => a + b, 0) + sp * (chars.length - 1) + fs * 1.2; h = fs * 1.65; }
    const c = mk((w + 2 * m) * s, (h + 2 * m) * s), g = c.getContext('2d');
    g.setTransform(s, 0, 0, s, m * s, m * s);
    // panneau holographique translucide
    const pg = g.createLinearGradient(0, 0, 0, h);
    pg.addColorStop(0, rgba(color, 0.2)); pg.addColorStop(1, rgba(color, 0.06));
    g.fillStyle = pg; g.fillRect(0, 0, w, h);
    g.shadowColor = color; g.shadowBlur = 12 * u * s;
    g.strokeStyle = color; g.lineWidth = 1.5 * u;
    g.strokeRect(0, 0, w, h);
    // coins renforcés
    g.lineWidth = 2.4 * u;
    const k = 6 * u;
    g.beginPath();
    g.moveTo(0, k); g.lineTo(0, 0); g.lineTo(k, 0); g.moveTo(w - k, 0); g.lineTo(w, 0); g.lineTo(w, k);
    g.moveTo(w, h - k); g.lineTo(w, h); g.lineTo(w - k, h); g.moveTo(k, h); g.lineTo(0, h); g.lineTo(0, h - k);
    g.stroke();
    // texte : halo coloré puis cœur presque blanc (tube néon)
    g.font = font; g.textBaseline = 'middle'; g.textAlign = 'center';
    const put = () => {
      if (v) chars.forEach((ch, i) => g.fillText(ch, w / 2, fs * 0.4 + fs * 0.56 + i * fs * 1.12));
      else { let xx = fs * 0.6; chars.forEach((ch, i) => { g.fillText(ch, xx + cws[i] / 2, h / 2 + fs * 0.04); xx += cws[i] + sp; }); }
    };
    g.fillStyle = color; g.shadowBlur = 18 * u * s; put(); put();
    g.shadowBlur = 4 * u * s; g.fillStyle = light(color, 0.6); put();
    g.shadowBlur = 0;
    // lignes de balayage holographiques
    g.globalCompositeOperation = 'destination-out';
    g.fillStyle = 'rgba(0,0,0,0.32)';
    for (let y = 0; y < h; y += 3 * u) g.fillRect(-m, y, w + 2 * m, Math.max(0.6, 1 * u));
    return { c, w: w + 2 * m, h: h + 2 * m, m, pw: w, ph: h };
  }

  // dessine une entrée de l'atlas
  _spr(ctx, key, x, y, w, h) {
    const r = this.art.map.get(key);
    if (r) ctx.drawImage(this.art.c, r.x, r.y, r.w, r.h, x, y, w, h);
  }

  // ------------------------------------------------------------ animation
  _spawnTrail(L, init, R) {
    const { W, H, u } = L;
    const dir = R() < 0.5 ? 1 : -1, z = R();
    const col = this.nul > 0.5 ? (R() < 0.7 ? NULL_COL : '#ffffff') : TRAIL_COLS[(R() * TRAIL_COLS.length) | 0];
    return {
      x: init ? R() * W : dir > 0 ? -40 * u : W + 40 * u, y: H * (0.3 + R() * 0.48), dir,
      v: (35 + 150 * z) * u, len: (50 + 220 * z * z) * u, sz: (0.8 + 2.2 * z) * u, col, z, blink: R() < 0.4, ph: R() * 6,
    };
  }

  _spawnStream(L, zones, init, R) {
    const A = this.art, { H, u } = L;
    let tot = 0;
    for (const z of zones) tot += z[1] - z[0];
    let p = R() * tot, x = 0;
    for (const z of zones) { const w = z[1] - z[0]; if (p <= w) { x = z[0] + p; break; } p -= w; }
    const sc = 0.65 + R() * 0.55;
    return { x, y: init ? R() * (H + A.rainH) : -R() * H * 0.3, v: (40 + R() * 110) * u * sc, sc, a: 0.2 + R() * 0.4, k: (R() * RAIN_VARS) | 0 };
  }

  draw(ctx, t, info) {
    const t0 = performance.now();
    const st = this.settings, rfx = !!st.reducedFx, rm = !!st.reducedMotion;
    if (this.dirty && (!this.L || t0 - this.resizedAt > 160)) this._build();
    const L = this.L;
    if (!this.art) this._buildArt();
    const A = this.art;
    const dt = this.lastT === null ? 0 : Math.max(0, Math.min(0.1, t - this.lastT));
    this.lastT = t;
    const mood = (info && info.mood) || 'calm';
    const inten = Math.max(0, Math.min(1, (info && info.intensity) || 0));
    const level = Math.max(1, (info && info.level) || 1);
    const ease = Math.min(1, dt * 2.5);
    this.hot += ((mood === 'hot' ? 1 : 0) - this.hot) * ease;
    this.nul += ((mood === 'null' ? 1 : 0) - this.nul) * ease;
    const hot = this.hot, nul = this.nul;
    const { W, H, u, Ws } = L;
    // pendant un redimensionnement : anciens calques étirés jusqu'au nouveau rendu
    const kx = this.W / W, ky = this.H / H, d = this.dpr, sx = d * kx, sy = d * ky;
    let rect = info && info.rect;
    if (rect && (kx !== 1 || ky !== 1)) rect = { x: rect.x / kx, y: rect.y / ky, w: rect.w / kx, h: rect.h / ky };
    const R = Math.random;
    // part visible du décor : en dessous de 30 % (téléphone), on fige tout dans un composite
    let vis = 1;
    if (rect) {
      const ix = Math.max(0, Math.min(W, rect.x + rect.w) - Math.max(0, rect.x));
      const iy = Math.max(0, Math.min(H, rect.y + rect.h) - Math.max(0, rect.y));
      vis = 1 - (ix * iy) / (W * H);
    }
    const lite = rm || vis < 0.3;
    // bandes verticales hors plateau (le plateau, opaque, est dessiné par-dessus)
    const mg = 16 * u;
    const segs = rect && rect.h > H * 0.6 && rect.w > 4 * mg ? [[0, rect.x + mg], [rect.x + rect.w - mg, W]].filter(z => z[1] > z[0]) : [[0, W]];
    // les quatre zones autour du plateau (voiles et halos d'humeur)
    let boxes = [[0, 0, W, H]];
    if (rect && rect.w > 4 * mg && rect.h > 4 * mg) {
      const x0 = Math.max(0, rect.x + mg), x1 = Math.min(W, rect.x + rect.w - mg), y0 = Math.max(0, rect.y + mg), y1 = Math.min(H, rect.y + rect.h - mg);
      boxes = [[0, 0, x0, H], [x1, 0, W - x1, H], [x0, 0, x1 - x0, y0], [x0, y1, x1 - x0, H - y1]].filter(b => b[2] > 0.5 && b[3] > 0.5);
    }
    const drift = lite ? 0 : 1 + 0.6 * hot + 0.4 * inten;
    for (let i = 0; i < 3; i++) this.off[i] = lite ? 0 : (this.off[i] + dt * STRATA[i].v * u * drift) % Ws;
    const inR = (x, y, w, h) => rect && x >= rect.x && y >= rect.y && x + w <= rect.x + rect.w && y + h <= rect.y + rect.h;
    ctx.setTransform(sx, 0, 0, sy, 0, 0);
    ctx.globalAlpha = 1;
    ctx.imageSmoothingEnabled = true;

    // fond statique, posé en « copy » (pas de mélange : nettement plus rapide)
    ctx.globalCompositeOperation = 'copy';
    if (lite) {
      const key = rect ? [rect.x, rect.y, rect.w, rect.h].map(Math.round).join(',') : '-';
      if (!this.flat || this.flatKey !== key) { this.flat = this._flatten(L, rect); this.flatKey = key; }
      ctx.drawImage(this.flat, 0, 0, W, H);
    } else {
      this.flat = null;
      ctx.drawImage(L.sky, 0, 0, W, H);
    }
    const img = A.c, map = A.map;
    ctx.globalCompositeOperation = 'lighter';
    // étoiles scintillantes
    if (!rfx) {
      const g = map.get('g' + STAR_COL), z = 9 * u;
      for (const s of L.stars) {
        if (inR(s.x - 4, s.y - 4, 8, 8)) continue;
        const a = Math.pow(0.5 + 0.5 * Math.sin(t * s.sp + s.ph), 3);
        if (a < 0.08) continue;
        ctx.globalAlpha = a * 0.8;
        ctx.drawImage(img, g.x, g.y, g.w, g.h, s.x - z / 2, s.y - z / 2, z, z);
      }
    }
    // ascenseurs des piliers (moitié haute, au-dessus des tours)
    for (const p of L.pillars) {
      const ph = (t * p.sp + p.ph) % 2, y = (0.04 + 0.46 * (ph < 1 ? ph : 2 - ph)) * H;
      ctx.globalAlpha = 0.85;
      this._spr(ctx, 'g' + (nul > 0.5 ? '#ff4060' : '#c9b8ff'), p.x - 9 * u, y - 14 * u, 18 * u, 28 * u);
    }
    // projecteurs balayant le ciel
    if (!rfx) {
      for (let i = 0; i < 4; i++) {
        const bx = [0.08, 0.2, 0.8, 0.92][i] * W, by = H * (0.72 + 0.04 * (i % 2));
        if (rect && bx > rect.x && bx < rect.x + rect.w) continue;
        const ang = (i < 2 ? -0.32 : 0.32) + (rm ? 0 : Math.sin(t * (0.13 + i * 0.03) + i * 2) * 0.32);
        const col = nul > 0.5 ? NULL_COL : BEAM_COLS[(i + level - 1) % 4];
        const bl = H * 0.85, bw = bl * 0.16;
        const c = Math.cos(ang), sn = Math.sin(ang);
        ctx.setTransform(c * sx, sn * sy, -sn * sx, c * sy, bx * sx, by * sy);
        ctx.globalAlpha = (0.16 + 0.14 * hot) * (nul > 0.5 && R() < 0.1 ? 0.3 : 1);
        this._spr(ctx, 'b' + col, -bw / 2, -bl, bw, bl);
      }
      ctx.setTransform(sx, 0, 0, sy, 0, 0);
    }

    // strates dérivantes et ce qui s'y accroche
    for (let i = 0; i < 3; i++) {
      const S = L.strata[i], off = this.off[i];
      if (!lite && S.c) {
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = 1;
        this._strip(ctx, S, -off, segs);
        if (Ws - off < W) this._strip(ctx, S, Ws - off, segs);
      }
      ctx.globalCompositeOperation = 'lighter';
      if (i === 0) this._lanes(ctx, L, t, rm, hot, nul);
      if (i === 1) this._trails(ctx, L, dt, rm, rfx, hot, nul, inten, level, rect, R);
      this._beacons(ctx, L, i, off, t, nul, inR);
      this._signs(ctx, L, i, off, t, dt, rm, rfx, hot, nul, R, inR);
    }
    // pluie de données
    if (!rfx && !rm) this._rain(ctx, L, dt, rect, hot, nul, R);

    // ombre portée autour du plateau
    if (!lite && rect) {
      const key = [rect.x, rect.y, rect.w, rect.h].map(Math.round).join(',');
      if (!this.shade || this.shadeKey !== key) { this.shade = this._shade(L, rect); this.shadeKey = key; }
      ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
      const M = 110 * u, sh = this.shade, k = sh.width / W;
      for (const [a, b] of [[rect.x - M, rect.x + mg], [rect.x + rect.w - mg, rect.x + rect.w + M]]) {
        const x0 = Math.max(0, a), x1 = Math.min(W, b);
        if (x1 > x0) ctx.drawImage(sh, x0 * k, 0, (x1 - x0) * k, sh.height, x0, 0, x1 - x0, H);
      }
    }
    // humeurs (hors plateau)
    if (hot > 0.01) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = hot * (0.32 + 0.25 * inten) * (rfx ? 0.6 : 1) * (0.85 + 0.15 * Math.sin(t * 2.2));
      this._moodGlow(ctx, 'hot', [[0.12, '#ff3df2', 0.5], [0.88, '#29e3ff', 0.5], [0.5, '#a070ff', 0.35]], boxes);
    }
    if (nul > 0.01) this._nullFx(ctx, L, t, rm, rfx, nul, R, boxes);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    this.ms = this.ms * 0.92 + (performance.now() - t0) * 0.08;
  }

  // une copie de strate posée en x0, limitée aux bandes visibles
  _strip(ctx, S, x0, segs) {
    const L = this.L, k = S.c.width / L.Ws, hh = L.H - S.yTop;
    for (const [a, b] of segs) {
      const ix0 = Math.max(a, x0), ix1 = Math.min(b, x0 + L.Ws);
      if (ix1 - ix0 < 0.5) continue;
      ctx.drawImage(S.c, (ix0 - x0) * k, 0, (ix1 - ix0) * k, S.c.height, ix0, S.yTop, ix1 - ix0, hh);
    }
  }

  // composite figé (mode léger : téléphone ou mouvements réduits)
  _flatten(L, rect) {
    const { W, H, s } = L;
    const c = mk(W * s, H * s), g = c.getContext('2d');
    g.drawImage(L.sky, 0, 0);
    g.setTransform(s, 0, 0, s, 0, 0);
    for (const S of L.strata) if (S.c) g.drawImage(S.c, 0, S.yTop, L.Ws, H - S.yTop);
    g.setTransform(1, 0, 0, 1, 0, 0);
    if (rect) g.drawImage(this._shade(L, rect), 0, 0, c.width, c.height);
    return c;
  }

  _shade(L, rect) {
    const { W, H, u } = L, k = 0.25;
    const c = mk(W * k, H * k), g = c.getContext('2d');
    g.scale(k, k);
    g.shadowColor = 'rgba(0,0,0,0.85)'; g.shadowBlur = 70 * u * k;
    g.fillStyle = 'rgba(2,2,8,0.9)';
    g.fillRect(rect.x - 4, rect.y - 4, rect.w + 8, rect.h + 8);
    g.shadowBlur = 26 * u * k;
    g.fillRect(rect.x - 4, rect.y - 4, rect.w + 8, rect.h + 8);
    return c;
  }

  // voies de circulation lointaines : motifs pointillés qui défilent le long de droites
  _lanes(ctx, L, t, rm, hot, nul) {
    const A = this.art, { W, H, u } = L, d = this.dpr, kx = this.W / W, ky = this.H / H;
    if (!A.pats || A.patCtx !== ctx) { A.pats = new Map(); for (const [k, c] of A.lanes) A.pats.set(k, ctx.createPattern(c, 'repeat')); A.patCtx = ctx; }
    for (let i = 0; i < LANES.length; i++) {
      const [y0, y1, col, dir] = LANES[i];
      const xa = -20, ya = H * y0, dx = W + 40, dy = H * (y1 - y0);
      const len = Math.hypot(dx, dy), c = dx / len, sn = dy / len;
      const sc = 0.55 * u;                                   // échelle du motif
      const off = rm ? 0 : ((dir * t * (26 + i * 9) * u * (1 + hot)) / sc) % 240;
      ctx.setTransform(c * sc * d * kx, sn * sc * d * ky, -sn * sc * d * kx, c * sc * d * ky, xa * d * kx, ya * d * ky);
      ctx.fillStyle = A.pats.get(nul > 0.5 && i % 2 === 0 ? NULL_COL : col);
      ctx.globalAlpha = 0.55 + 0.25 * hot;
      ctx.translate(off, 0);
      ctx.fillRect(-off, -2, len / sc, 4);
    }
    ctx.setTransform(d * kx, 0, 0, d * ky, 0, 0);
    ctx.globalAlpha = 1;
  }

  _trails(ctx, L, dt, rm, rfx, hot, nul, inten, level, rect, R) {
    if (rm) return;
    const { W, u } = L, d = this.dpr, kx = this.W / L.W, ky = this.H / L.H, A = this.art;
    const want = Math.min(12, Math.round((W / 200 + level) * (rfx ? 0.5 : 1) * (1 + 0.5 * hot)));
    while (this.trails.length < want) this.trails.push(this._spawnTrail(L, true, R));
    const sp = 1 + 0.8 * hot + 0.4 * inten;
    for (let i = this.trails.length - 1; i >= 0; i--) {
      const p = this.trails[i];
      p.x += p.dir * p.v * sp * dt;
      if ((p.dir > 0 && p.x - p.len > W + 20) || (p.dir < 0 && p.x + p.len < -20)) {
        if (this.trails.length > want) this.trails.splice(i, 1); else this.trails[i] = this._spawnTrail(L, false, R);
        continue;
      }
      const x0 = p.dir > 0 ? p.x - p.len : p.x, hh = 6 * p.sz;
      if (rect && x0 > rect.x && x0 + p.len < rect.x + rect.w && p.y > rect.y && p.y < rect.y + rect.h) continue;
      ctx.setTransform(p.dir * d * kx, 0, 0, d * ky, p.x * d * kx, p.y * d * ky);
      ctx.globalAlpha = 0.35 + 0.55 * p.z;
      const tr = A.map.get('t' + p.col) || A.map.get('t#ffffff');
      ctx.drawImage(A.c, tr.x, tr.y, tr.w, tr.h, -p.len, -hh / 2, p.len, hh);
      if (p.z < 0.35) continue;
      const gsz = 10 * p.sz * (p.blink && Math.sin(this.lastT * 9 + p.ph) > 0.6 ? 1.8 : 1);
      this._spr(ctx, 'g' + p.col, -gsz / 2, -gsz / 2, gsz, gsz);
    }
    ctx.setTransform(d * kx, 0, 0, d * ky, 0, 0);
    ctx.globalAlpha = 1;
  }

  _beacons(ctx, L, li, off, t, nul, inR) {
    const { W, u, Ws } = L, A = this.art;
    const gr = A.map.get('g#ff4060'), gw = A.map.get('g#ffffff');
    for (const b of L.beacons) {
      if (b.L !== li) continue;
      let x = b.x - off;
      if (x < -10) x += Ws;
      if (x > W + 10 || inR(x - 3, b.y - 3, 6, 6)) continue;
      const k = Math.sin(t * b.sp * 3 + b.ph);
      if (k < 0.2) continue;
      const g = nul > 0.5 || b.red ? gr : gw, z = (6 + li * 3) * u;
      ctx.globalAlpha = Math.min(1, k * 1.2);
      ctx.drawImage(A.c, g.x, g.y, g.w, g.h, x - z / 2, b.y - z / 2, z, z);
    }
    ctx.globalAlpha = 1;
  }

  // enseignes holographiques : scintillement occasionnel, contamination par NULL
  _signs(ctx, L, li, off, t, dt, rm, rfx, hot, nul, R, inR) {
    const { W, Ws } = L, A = this.art;
    for (const sg of L.signs) {
      if (sg.L !== li) continue;
      const pair = A.meta.get('s' + sg.i);
      if (!pair) continue;
      // contamination progressive : chaque enseigne bascule à son tour, avec un raté
      const want = nul > 0.5 ? 1 : 0;
      if (sg.inf !== want && sg.sw <= 0 && R() < (rm ? 1 : 0.04)) sg.sw = rm ? 0.001 : 0.35;
      if (sg.sw > 0) { sg.sw -= dt; if (sg.sw <= 0) sg.inf = want; }
      sg.next -= dt;
      if (sg.next <= 0) { sg.fl = 0.15 + R() * 0.45; sg.next = (sg.d.bad || nul > 0.5 ? 1.5 : 5) + R() * 10; }
      if (sg.fl > 0) sg.fl -= dt;
      const art = pair[sg.inf ? 1 : 0];
      let x = sg.cx - off;
      if (x < -art.w) x += Ws;
      const left = x - (sg.d.v ? (sg.cx < sg.tw.x ? art.w - art.m : art.m) : art.w / 2);
      const y = sg.ty - art.m;
      if (left > W || left + art.w < 0 || inR(left, y, art.w, art.h)) continue;
      let a = (li === 1 ? 0.62 : 0.85) + 0.1 * hot;
      if (!rm && !rfx) {
        if (sg.fl > 0 || sg.sw > 0) a *= R() < 0.5 ? 0.12 : 1;
        a *= 0.94 + 0.06 * Math.sin(t * 7 + sg.cx);
      }
      ctx.globalAlpha = a;
      this._spr(ctx, 's' + sg.i + ':' + sg.inf, left, y, art.w, art.h);
      // halo diffus autour de l'enseigne quand l'ambiance s'échauffe
      if (hot > 0.05) {
        ctx.globalAlpha = a * 0.3 * hot;
        const gw = art.pw * 1.6;
        this._spr(ctx, 'g' + (sg.inf ? NULL_COL : sg.d.c), left + art.w / 2 - gw / 2, y + art.h / 2 - gw * 0.4, gw, gw * 0.8);
      }
    }
    ctx.globalAlpha = 1;
  }

  _rain(ctx, L, dt, rect, hot, nul, R) {
    const { W, H, u } = L, A = this.art;
    const pad = 10 * u;
    const zones = rect ? [[0, rect.x - pad], [rect.x + rect.w + pad, W]].filter(z => z[1] - z[0] > 20 * u) : [[0, W]];
    let zw = 0;
    for (const z of zones) zw += z[1] - z[0];
    const want = Math.min(30, Math.round(zw / (40 * u) * (1 + 0.4 * hot)));
    while (this.streams.length < want) this.streams.push(this._spawnStream(L, zones, true, R));
    if (this.streams.length > want) this.streams.length = want;
    if (!want) return;
    const ci = nul > 0.5 ? 2 : 0;
    const sp = 1 + 0.5 * hot + 0.7 * nul;
    const cw = A.rainW, chh = A.rainH;
    for (let i = 0; i < this.streams.length; i++) {
      const p = this.streams[i];
      p.y += p.v * sp * dt;
      if (p.y - chh * p.sc > H) { this.streams[i] = this._spawnStream(L, zones, false, R); continue; }
      const w = cw * p.sc, h = chh * p.sc;
      const r = A.rain[hot > 0.5 && i % 3 === 0 && ci === 0 ? 1 : ci][p.k];
      ctx.globalAlpha = p.a;
      ctx.drawImage(A.c, r.x, r.y, r.w, r.h, p.x - w / 2, p.y - h, w, h);
    }
    ctx.globalAlpha = 1;
  }

  // prise de contrôle par NULL : palette rouge/magenta, déchirures, coupures de signal
  _nullFx(ctx, L, t, rm, rfx, nul, R, boxes) {
    const { W, H, u } = L;
    // voile sombre bordeaux (source-over : bien moins coûteux qu'un multiply plein écran)
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 0.5 * nul;
    ctx.fillStyle = '#2a0010';
    for (const [x, y, w, h] of boxes) ctx.fillRect(x, y, w, h);
    ctx.globalCompositeOperation = 'lighter';
    const fl = rm || rfx ? 1 : (R() < 0.05 ? 0.35 : 1);
    ctx.globalAlpha = nul * (0.42 + 0.12 * Math.sin(t * 2.7)) * fl;
    this._moodGlow(ctx, 'null', [[0.15, '#ff2040', 0.55], [0.85, '#ff2a6d', 0.55], [0.5, '#ff1030', 0.4]], boxes);
    if (!rm && !rfx) {
      // déchirures horizontales et lignes de signal
      const n = R() < 0.12 * nul ? 1 + ((R() * 3) | 0) : 0;
      for (let i = 0; i < n; i++) {
        const y = H * (0.15 + R() * 0.8), h = (2 + R() * 16) * u;
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = 0.55;
        ctx.fillStyle = '#05000a'; ctx.fillRect(0, y, W, h);
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = 0.6;
        ctx.fillStyle = R() < 0.6 ? NULL_COL : '#29e3ff';
        ctx.fillRect(0, y + (R() < 0.5 ? 0 : h), W, Math.max(1, u));
      }
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }
}
