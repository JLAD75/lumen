// Afficheur matriciel (DMD) 128×32 façon flipper : score, animations d'événements,
// messages de LUMEN (cyan) et de NULL (rouge, glitch). Polices bitmap intégrées, aucune ressource externe.
// Rendu : tampon d'intensité (16 niveaux) + index de couleur par point → ImageData 128×32,
// agrandie sans lissage puis masquée en points ronds, avec un halo additif léger.

const W = 128, H = 32, N = W * H;
const TAU = Math.PI * 2;
const OUT = 0.18, REVEAL = 0.22, MAX_PARTS = 220;

// Index de couleur par point (emplacements de palette)
const K_BASE = 0, K_LUMEN = 1, K_NULL = 2, K_EV = 3, K_HOT = 4, K_GOLD = 5, K_MAG = 6, K_MG = 7;
const PALETTE = ['#ff7b1c', '#29e3ff', '#ff3d6e', '#ff7b1c', '#fff0d0', '#ffd84a', '#ff3df2', '#29e3ff'];
const DOT_OFF = [46, 18, 7];   // point éteint : brun orangé à peine visible
const BG = '#060302';          // fond entre les points

// ------------------------------------------------------------ polices bitmap
// Bandes de glyphes séparés par « | » : « # » allumé, « + » demi-teinte, « . » éteint.
// Rangée 0 = haut des capitales ; au-delà de « cap » : jambages. Accents composés automatiquement.
// Format « map » : une liste de rangées par glyphe, « rangée*n » répète la rangée n fois.
const SMALL = {
  cap: 7, sp: 1, space: 3, accRows: 2,
  acc: { acute: ['..#', '.#.'], grave: ['#..', '.#.'], circ: ['.#.', '#.#'], diaer: ['...', '#.#'], ced: ['.#.', '#..'] },
  strips: [
    ['ABCDEFGHIJKLM', [
      '.###.|####.|.###.|####.|####|####|.###.|#...#|###|.###|#...#|#...|#...#',
      '#...#|#...#|#...#|#...#|#...|#...|#...#|#...#|.#.|...#|#..#.|#...|##.##',
      '#...#|#...#|#....|#...#|#...|#...|#....|#...#|.#.|...#|#.#..|#...|#.#.#',
      '#####|####.|#....|#...#|###.|###.|#.###|#####|.#.|...#|##...|#...|#.#.#',
      '#...#|#...#|#....|#...#|#...|#...|#...#|#...#|.#.|...#|#.#..|#...|#...#',
      '#...#|#...#|#...#|#...#|#...|#...|#...#|#...#|.#.|#..#|#..#.|#...|#...#',
      '#...#|####.|.###.|####.|####|#...|.####|#...#|###|.##.|#...#|####|#...#',
    ]],
    ['NOPQRSTUVWXYZ', [
      '#...#|.###.|####.|.###.|####.|.###.|#####|#...#|#...#|#...#|#...#|#...#|#####',
      '#...#|#...#|#...#|#...#|#...#|#...#|..#..|#...#|#...#|#...#|#...#|#...#|....#',
      '##..#|#...#|#...#|#...#|#...#|#....|..#..|#...#|#...#|#...#|.#.#.|.#.#.|...#.',
      '#.#.#|#...#|####.|#...#|####.|.###.|..#..|#...#|#...#|#.#.#|..#..|..#..|..#..',
      '#..##|#...#|#....|#.#.#|#.#..|....#|..#..|#...#|#...#|#.#.#|.#.#.|..#..|.#...',
      '#...#|#...#|#....|#..#.|#..#.|#...#|..#..|#...#|.#.#.|#.#.#|#...#|..#..|#....',
      '#...#|.###.|#....|.##.#|#...#|.###.|..#..|.###.|..#..|.#.#.|#...#|..#..|#####',
    ]],
    ['0123456789', [
      '.###.|..#..|.###.|#####|...#.|#####|..##.|#####|.###.|.###.',
      '#...#|.##..|#...#|...#.|..##.|#....|.#...|....#|#...#|#...#',
      '#..##|..#..|....#|..#..|.#.#.|####.|#....|...#.|#...#|#...#',
      '#.#.#|..#..|...#.|...#.|#..#.|....#|####.|..#..|.###.|.####',
      '##..#|..#..|..#..|....#|#####|....#|#...#|.#...|#...#|....#',
      '#...#|..#..|.#...|#...#|...#.|#...#|#...#|.#...|#...#|...#.',
      '.###.|.###.|#####|.###.|...#.|.###.|.###.|.#...|.###.|.##..',
    ]],
    ['.,:;!?\'"-+×%/()', [
      '.|..|.|..|#|.###.|#|#.#|....|.....|.....|##...|....#|..#|#..',
      '.|..|#|.#|#|#...#|#|#.#|....|..#..|#...#|##..#|....#|.#.|.#.',
      '.|..|.|..|#|....#|.|...|....|..#..|.#.#.|...#.|...#.|#..|..#',
      '.|..|.|..|#|...#.|.|...|####|#####|..#..|..#..|..#..|#..|..#',
      '.|..|.|..|#|..#..|.|...|....|..#..|.#.#.|.#...|.#...|#..|..#',
      '.|.#|#|.#|.|.....|.|...|....|..#..|#...#|#..##|#....|.#.|.#.',
      '#|.#|.|.#|#|..#..|.|...|....|.....|.....|...##|#....|..#|#..',
      '.|#.|.|#.|.|.....|.|...|....|.....|.....|.....|.....|...|...',
    ]],
    ['#*<>=_&[]·…—«»°', [
      '.#.#.|.....|...#|#...|....|.....|.##..|##|##|.|.....|......|.....|.....|.#.',
      '.#.#.|#.#.#|..#.|.#..|....|.....|#..#.|#.|.#|.|.....|......|..#.#|#.#..|#.#',
      '#####|.###.|.#..|..#.|####|.....|#.#..|#.|.#|.|.....|......|.#.#.|.#.#.|.#.',
      '.#.#.|#####|#...|...#|....|.....|.#...|#.|.#|#|.....|######|#.#..|..#.#|...',
      '#####|.###.|.#..|..#.|####|.....|#.#.#|#.|.#|.|.....|......|.#.#.|.#.#.|...',
      '.#.#.|#.#.#|..#.|.#..|....|.....|#..#.|#.|.#|.|.....|......|..#.#|#.#..|...',
      '.#.#.|.....|...#|#...|....|.....|.##.#|##|##|.|#.#.#|......|.....|.....|...',
      '.....|.....|....|....|....|#####|.....|..|..|.|.....|......|.....|.....|...',
    ]],
    ['ŒÆ◆●○►◄▲▼✓@', [
      '.#####|.#####|.....|.....|.....|#...|...#|.....|.....|.....|.###.',
      '#..#..|#..#..|..#..|.###.|.###.|##..|..##|.....|.....|....#|#...#',
      '#..#..|#..#..|.###.|#####|#...#|###.|.###|..#..|#####|...#.|#.###',
      '#..###|######|#####|#####|#...#|####|####|.###.|.###.|#.#..|#.#.#',
      '#..#..|#..#..|.###.|#####|#...#|###.|.###|#####|..#..|.#...|#.###',
      '#..#..|#..#..|..#..|.###.|.###.|##..|..##|.....|.....|.....|#....',
      '.#####|#..###|.....|.....|.....|#...|...#|.....|.....|.....|.###.',
    ]],
  ],
};

const MED = {
  cap: 11, sp: 1, space: 4, accRows: 3,
  acc: { acute: ['..##', '.##.'], grave: ['##..', '.##.'], circ: ['.##.', '#..#'], diaer: ['##.##', '##.##'], ced: ['.##.', '..##', '.##.'] },
  strips: [
    ['ABCDEFGHIJ', [
      '.#####.|######.|.######|######.|######|######|.######|##...##|##|....##',
      '#######|#######|#######|#######|######|######|#######|##...##|##|....##',
      '##...##|##...##|##.....|##...##|##....|##....|##.....|##...##|##|....##',
      '##...##|##...##|##.....|##...##|##....|##....|##.....|##...##|##|....##',
      '##...##|######.|##.....|##...##|#####.|#####.|##.....|##...##|##|....##',
      '#######|######.|##.....|##...##|#####.|#####.|##..###|#######|##|....##',
      '#######|##...##|##.....|##...##|##....|##....|##..###|#######|##|....##',
      '##...##|##...##|##.....|##...##|##....|##....|##...##|##...##|##|##..##',
      '##...##|##...##|##.....|##...##|##....|##....|##...##|##...##|##|##..##',
      '##...##|#######|#######|#######|######|##....|#######|##...##|##|######',
      '##...##|######.|.######|######.|######|##....|.######|##...##|##|.####.',
    ]],
    ['KLMNOPQRST', [
      '##...##|##....|##.....##|##....##|.#####.|######.|.#####.|######.|.######|######',
      '##..##.|##....|###...###|###...##|#######|#######|#######|#######|#######|######',
      '##.##..|##....|####.####|###...##|##...##|##...##|##...##|##...##|##.....|..##..',
      '####...|##....|##.###.##|####..##|##...##|##...##|##...##|##...##|##.....|..##..',
      '###....|##....|##..#..##|##.##.##|##...##|##...##|##...##|##...##|######.|..##..',
      '###....|##....|##.....##|##.##.##|##...##|#######|##...##|#######|.######|..##..',
      '####...|##....|##.....##|##..####|##...##|######.|##...##|######.|.....##|..##..',
      '##.##..|##....|##.....##|##...###|##...##|##.....|##...##|##.##..|.....##|..##..',
      '##..##.|##....|##.....##|##...###|##...##|##.....|##...##|##..##.|.....##|..##..',
      '##...##|######|##.....##|##....##|#######|##.....|#######|##...##|#######|..##..',
      '##...##|######|##.....##|##....##|.#####.|##.....|.######|##...##|######.|..##..',
      '.......|......|.........|........|.......|.......|.....##|.......|.......|......',
    ]],
    ['UVWXYZŒ', [
      '##...##|##....##|##.....##|##....##|##....##|#######|.#########',
      '##...##|##....##|##.....##|##....##|##....##|#######|##########',
      '##...##|##....##|##.....##|.##..##.|.##..##.|.....##|##...##...',
      '##...##|##....##|##.....##|.##..##.|.##..##.|....###|##...##...',
      '##...##|##....##|##.....##|..####..|..####..|...###.|##...####.',
      '##...##|.##..##.|##.....##|...##...|...##...|..###..|##...####.',
      '##...##|.##..##.|##..#..##|..####..|...##...|.###...|##...##...',
      '##...##|.##..##.|##.###.##|.##..##.|...##...|###....|##...##...',
      '##...##|..####..|####.####|.##..##.|...##...|##.....|##...##...',
      '#######|..####..|###...###|##....##|...##...|#######|##########',
      '.#####.|...##...|##.....##|##....##|...##...|#######|.#########',
    ]],
    ['0123456789', [
      '.#####.|...##..|.#####.|######.|....##.|#######|.######|#######|.#####.|.#####.',
      '#######|..###..|#######|#######|...###.|#######|#######|#######|#######|#######',
      '##...##|.####..|##...##|.....##|..####.|##.....|##.....|.....##|##...##|##...##',
      '##...##|...##..|.....##|.....##|.##.##.|##.....|##.....|....###|##...##|##...##',
      '##...##|...##..|....###|..####.|##..##.|######.|######.|...###.|.#####.|##...##',
      '##...##|...##..|..####.|..####.|##..##.|#######|#######|..###..|#######|#######',
      '##...##|...##..|.###...|.....##|#######|.....##|##...##|..##...|##...##|.######',
      '##...##|...##..|###....|.....##|#######|.....##|##...##|..##...|##...##|.....##',
      '##...##|...##..|##.....|.....##|....##.|##...##|##...##|..##...|##...##|.....##',
      '#######|.######|#######|#######|....##.|#######|#######|..##...|#######|#######',
      '.#####.|.######|#######|######.|....##.|.#####.|.#####.|..##...|.#####.|######.',
    ]],
    ['.,:;!?\'"-+×%/()=·<>', [
      '..|..|..|..|##|.#####.|##|##.##|.....|......|......|###...##|.....##|..##|##..|......|..|.....|.....',
      '..|..|..|..|##|#######|##|##.##|.....|......|......|###..##.|.....##|.##.|.##.|......|..|....#|#....',
      '..|..|##|##|##|##...##|.#|##.##|.....|......|......|###..##.|....##.|##..|..##|......|..|...##|##...',
      '..|..|##|##|##|.....##|#.|.....|.....|..##..|##..##|....##..|....##.|##..|..##|######|..|..##.|.##..',
      '..|..|..|..|##|....###|..|.....|.....|..##..|.####.|...##...|...##..|##..|..##|######|..|.##..|..##.',
      '..|..|..|..|##|..####.|..|.....|#####|######|..##..|...##...|...##..|##..|..##|......|##|##...|...##',
      '..|..|..|..|##|..##...|..|.....|#####|######|.####.|..##....|..##...|##..|..##|######|##|.##..|..##.',
      '..|..|##|##|##|..##...|..|.....|.....|..##..|##..##|.##..###|..##...|##..|..##|######|..|..##.|.##..',
      '..|..|##|##|..|.......|..|.....|.....|..##..|......|.##..###|.##....|##..|..##|......|..|...##|##...',
      '##|##|..|.#|##|..##...|..|.....|.....|......|......|##...###|.##....|.##.|.##.|......|..|....#|#....',
      '##|##|..|#.|##|..##...|..|.....|.....|......|......|##......|##.....|..##|##..|......|..|.....|.....',
      '..|.#|..|..|..|.......|..|.....|.....|......|......|........|.......|....|....|......|..|.....|.....',
      '..|#.|..|..|..|.......|..|.....|.....|......|......|........|.......|....|....|......|..|.....|.....',
    ]],
  ],
  map: { '…': ['........*9', '##.##.##*2'] },
};

// Chiffres du score : 11×20, traits de 3 points, coins adoucis par des demi-teintes
const BIG = {
  cap: 20, sp: 2, space: 5,
  map: {
    '0': ['..+#####+..', '.#########.', '+###+.+###+', '###.....###*14', '+###+.+###+', '.#########.', '..+#####+..'],
    '1': ['....+###...', '..+#####...', '.#######...', '.##+.###...', '.....###...*14', '...#######.*2'],
    '2': ['..+#####+..', '.#########.', '+###+.+###+', '###.....###', '........###*2', '.......+###', '......+###+', '.....+###+.', '....+###+..',
      '...+###+...', '..+###+....', '.+###+.....', '+###+......', '###+.......', '###........*2', '###########*3'],
    '3': ['..+#####+..', '.#########.', '+###+.+###+', '###.....###', '........###*3', '.......+###', '...+#####+.', '...######..', '...+#####+.',
      '.......+###', '........###*4', '###.....###', '+###+.+###+', '.#########.', '..+#####+..'],
    '4': ['###.....###*11', '###########*2', '+##########', '........###*6'],
    '5': ['###########*2', '###........*4', '#########+.', '##########.', '......+###+', '........###*7', '###.....###', '+###+.+###+', '.#########.', '..+#####+..'],
    '6': ['..+#####+..', '.#########.', '+###+.+###+', '###.....###', '###........*2', '###+####+..', '##########.', '####+.+###+', '###.....###*8',
      '+###+.+###+', '.#########.', '..+#####+..'],
    '7': ['###########*2', '........###*2', '.......+###', '.......###+', '......+###.', '......###+.', '.....+###..', '.....###+..', '....+###...',
      '....###+...', '....###....*8'],
    '8': ['..+#####+..', '.#########.', '+###+.+###+', '###.....###*4', '+###+.+###+', '.+#######+.', '.#########.', '+###+.+###+', '###.....###*6',
      '+###+.+###+', '.#########.', '..+#####+..'],
    '9': ['..+#####+..', '.#########.', '+###+.+###+', '###.....###*8', '+###+.+####', '.##########', '..+####+###', '........###*2', '###.....###',
      '+###+.+###+', '.#########.', '..+#####+..'],
    '.': ['...*17', '+#+', '###', '+#+'],
    '×': ['.........*5', '##.....##', '###...###', '.###.###.', '..#####..', '...###...', '..#####..', '.###.###.', '###...###', '##.....##'],
  },
};

// Majuscules accentuées : lettre de base + accent
const ACCENTED = {
  'À': ['A', 'grave'], 'Â': ['A', 'circ'], 'Ä': ['A', 'diaer'], 'Á': ['A', 'acute'],
  'É': ['E', 'acute'], 'È': ['E', 'grave'], 'Ê': ['E', 'circ'], 'Ë': ['E', 'diaer'],
  'Î': ['I', 'circ'], 'Ï': ['I', 'diaer'], 'Í': ['I', 'acute'],
  'Ô': ['O', 'circ'], 'Ö': ['O', 'diaer'], 'Ó': ['O', 'acute'],
  'Ù': ['U', 'grave'], 'Û': ['U', 'circ'], 'Ü': ['U', 'diaer'], 'Ú': ['U', 'acute'],
  'Ÿ': ['Y', 'diaer'], 'Ç': ['C', 'ced'],
};
// Équivalences typographiques (repli si la police n'a pas le glyphe)
const ALIAS = {
  '’': '\'', '‘': '\'', '´': '\'', '`': '\'', '“': '"', '”': '"', '„': '"', '«': '"', '»': '"',
  '–': '-', '—': '-', '‐': '-', '‑': '-', '−': '-', '_': '-', '•': '·', '⋅': '·', '∙': '·',
  '[': '(', ']': ')', '{': '(', '}': ')', '…': '.', '←': '<', '→': '>', '↑': '^', '↓': 'v', ' ': ' ', ' ': ' ', ' ': ' ', '\t': ' ',
};

function expand(rows) {
  const out = [];
  for (const r of rows) {
    const m = /^(.*)\*(\d+)$/.exec(r);
    if (m) for (let i = 0; i < +m[2]; i++) out.push(m[1]);
    else out.push(r);
  }
  return out;
}

function mkGlyph(rows) {
  rows = expand(rows);
  const w = rows.reduce((a, r) => Math.max(a, r.length), 0);
  let h = rows.length;
  while (h > 0 && !/[#+]/.test(rows[h - 1])) h--;
  const px = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const c = rows[y][x]; px[y * w + x] = c === '#' ? 2 : c === '+' ? 1 : 0; }
  return { w, h, ox: 0, oy: 0, adv: w, px };
}

// Superpose un accent (au-dessus, ou cédille au-dessous) à une lettre de base
function compose(base, acc, below, def) {
  const aw = acc[0].length, ah = acc.length;
  const ax = Math.round((base.w - 1) / 2 - (aw - 1) / 2), ay = below ? def.cap : -def.accRows;
  const x0 = Math.min(0, ax), y0 = Math.min(0, ay);
  const w = Math.max(base.w, ax + aw) - x0, h = Math.max(base.h, ay + ah) - y0;
  const px = new Uint8Array(w * h);
  for (let y = 0; y < base.h; y++) for (let x = 0; x < base.w; x++) px[(y - y0) * w + x - x0] = base.px[y * base.w + x];
  for (let y = 0; y < ah; y++) for (let x = 0; x < aw; x++) if (acc[y][x] === '#') px[(ay + y - y0) * w + ax + x - x0] = 2;
  return { w, h, ox: x0, oy: y0, adv: base.adv, px };
}

function parseFont(id, def) {
  const g = new Map();
  for (const [chars, rows] of def.strips || []) {
    const list = [...chars], cells = rows.map(r => r.split('|'));
    cells.forEach((c, y) => { if (c.length !== list.length) console.warn(`DMD : bande « ${chars} », rangée ${y} invalide`); });
    list.forEach((ch, i) => g.set(ch, mkGlyph(cells.map(c => c[i] || ''))));
  }
  for (const ch in def.map || {}) g.set(ch, mkGlyph(def.map[ch]));
  g.set(' ', { w: 0, h: 0, ox: 0, oy: 0, adv: def.space, px: new Uint8Array(0) });
  if (def.acc) {
    for (const ch in ACCENTED) {
      const [b, a] = ACCENTED[ch], base = g.get(b);
      if (base) g.set(ch, compose(base, def.acc[a], a === 'ced', def));
    }
  }
  return { id, cap: def.cap, sp: def.sp, g };
}

const F_S = parseFont('s', SMALL), F_M = parseFont('m', MED), F_B = parseFont('b', BIG);

function glyph(f, ch) {
  let g = f.g.get(ch);
  if (g) return g;
  const a = ALIAS[ch];
  g = (a && f.g.get(a)) || f.g.get(ch.normalize('NFD')[0]) || f.g.get('?') || f.g.get(' ');
  f.g.set(ch, g);
  return g;
}

const up = (s) => String(s == null ? '' : s).toUpperCase();

function measure(s, f) {
  let w = 0, n = 0;
  for (const ch of up(s)) { w += glyph(f, ch).adv; n++; }
  return n ? w + (n - 1) * f.sp : 0;
}

function wrap(s, f, maxW) {
  const lines = [];
  let cur = '';
  for (const word of up(s).split(/\s+/).filter(Boolean)) {
    const t = cur ? cur + ' ' + word : word;
    if (!cur || measure(t, f) <= maxW) cur = t;
    else { lines.push(cur); cur = word; }
  }
  if (cur) lines.push(cur);
  return lines;
}

// Choisit la plus grande police qui tient (moyenne, sinon petite, sinon petite sur plusieurs lignes)
function fit(s, maxW, maxLines = 3) {
  s = up(s).replace(/\s+/g, ' ').trim();
  if (measure(s, F_M) <= maxW) return { f: F_M, lines: [s] };
  if (measure(s, F_S) <= maxW || maxLines < 2) return { f: F_S, lines: [s] };
  return { f: F_S, lines: wrap(s, F_S, maxW).slice(0, maxLines) };
}

// ------------------------------------------------------------ outils
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const ph = (t, a, b) => clamp01((t - a) / (b - a));
const lerp = (a, b, p) => a + (b - a) * p;
const eOut = (p) => 1 - (1 - p) ** 3;
const eIn = (p) => p * p * p;
const eInOut = (p) => (p < 0.5 ? 4 * p * p * p : 1 - (-2 * p + 2) ** 3 / 2);
const eBack = (p) => 1 + 2.70158 * (p - 1) ** 3 + 1.70158 * (p - 1) ** 2;
function eBounce(p) {
  const n = 7.5625, d = 2.75;
  if (p < 1 / d) return n * p * p;
  if (p < 2 / d) return n * (p -= 1.5 / d) * p + 0.75;
  if (p < 2.5 / d) return n * (p -= 2.25 / d) * p + 0.9375;
  return n * (p -= 2.625 / d) * p + 0.984375;
}
function hash(n) {
  n = Math.imul((n | 0) ^ 0x9e3779b9, 0x85ebca6b); n ^= n >>> 13;
  n = Math.imul(n, 0xc2b2ae35); n ^= n >>> 16;
  return (n >>> 0) / 4294967296;
}
function hexRgb(hex) {
  const h = String(hex || '').replace('#', '');
  const v = parseInt(h.length === 3 ? h.split('').map(c => c + c).join('') : h, 16);
  return isNaN(v) ? hexRgb(PALETTE[0]) : [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}
// Score avec séparateur de milliers « . » : plus lisible qu'une espace sur la matrice
function fmt(n) {
  const s = String(Math.max(0, Math.floor(n || 0)));
  let out = '';
  for (let i = 0; i < s.length; i++) { if (i > 0 && (s.length - i) % 3 === 0) out += '.'; out += s[i]; }
  return out;
}
const at = (e, s) => e.pt < s && e.t >= s;
const mkCanvas = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };

// ------------------------------------------------------------ tampon 128×32 et primitives
class Frame {
  constructor() {
    this.b = new Uint8Array(N);   // intensité 0–15
    this.c = new Uint8Array(N);   // index de couleur
    this.rnd = new Uint8Array(N);
    for (let i = 0; i < N; i++) this.rnd[i] = (Math.random() * 256) | 0;
    this.row = new Uint8Array(W); this.rowC = new Uint8Array(W);
    this.cache = new Map();
    this.grad = 0;
    this.unclip();
  }

  clear() { this.b.fill(0); this.c.fill(0); }
  clip(x0, y0, x1, y1) { this.x0 = Math.max(0, Math.floor(x0)); this.y0 = Math.max(0, Math.floor(y0)); this.x1 = Math.min(W, Math.ceil(x1)); this.y1 = Math.min(H, Math.ceil(y1)); }
  unclip() { this.x0 = 0; this.y0 = 0; this.x1 = W; this.y1 = H; }

  put(x, y, l, k) {
    x = Math.floor(x); y = Math.floor(y);
    if (x < this.x0 || y < this.y0 || x >= this.x1 || y >= this.y1 || l <= 0) return;
    const i = y * W + x;
    if (l >= this.b[i]) { this.b[i] = l > 15 ? 15 : l; this.c[i] = k; }
  }
  fill(l, k) { l = Math.min(15, Math.round(l)); if (l <= 0) return; for (let i = 0; i < N; i++) if (l >= this.b[i]) { this.b[i] = l; this.c[i] = k; } }
  rect(x, y, w, h, l, k) { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.put(x + i, y + j, l, k); }
  box(x, y, w, h, l, k) { this.hline(x, x + w - 1, y, l, k); this.hline(x, x + w - 1, y + h - 1, l, k); this.vline(x, y + 1, y + h - 2, l, k); this.vline(x + w - 1, y + 1, y + h - 2, l, k); }
  hline(x0, x1, y, l, k, step = 1) { for (let x = Math.round(x0); x <= x1; x += step) this.put(x, y, l, k); }
  vline(x, y0, y1, l, k, step = 1) { for (let y = Math.round(y0); y <= y1; y += step) this.put(x, y, l, k); }
  // efface une zone (texte lisible sur un fond animé)
  knock(x, y, w, h) {
    const xa = Math.max(0, Math.floor(x)), xb = Math.min(W, Math.ceil(x + w)), ya = Math.max(0, Math.floor(y)), yb = Math.min(H, Math.ceil(y + h));
    for (let j = ya; j < yb; j++) this.b.fill(0, j * W + xa, j * W + Math.max(xa, xb));
  }
  line(x0, y0, x1, y1, l, k) {
    const n = Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0))) || 1;
    for (let i = 0; i <= n; i++) this.put(x0 + (x1 - x0) * i / n + 0.5, y0 + (y1 - y0) * i / n + 0.5, l, k);
  }
  ring(cx, cy, r, l, k, th = 1) {
    if (r < 0.5) return;
    const R = r + th, ya = Math.max(this.y0, Math.floor(cy - R)), yb = Math.min(this.y1 - 1, Math.ceil(cy + R));
    for (let y = ya; y <= yb; y++) {
      const dy = y + 0.5 - cy;
      for (let x = Math.max(this.x0, Math.floor(cx - R)); x <= Math.min(this.x1 - 1, Math.ceil(cx + R)); x++) {
        const dx = x + 0.5 - cx, d = Math.sqrt(dx * dx + dy * dy);
        if (Math.abs(d - r) < th * 0.5 + 0.2) this.put(x, y, l, k);
      }
    }
  }
  // bille ombrée (reflet en haut à gauche), avec liseré noir optionnel
  disc(cx, cy, r, l, k, outline = false) {
    if (outline) for (let y = Math.floor(cy - r - 1); y <= cy + r + 1; y++) for (let x = Math.floor(cx - r - 1); x <= cx + r + 1; x++) {
      const dx = x + 0.5 - cx, dy = y + 0.5 - cy;
      if (dx * dx + dy * dy <= (r + 1.2) ** 2 && x >= 0 && y >= 0 && x < W && y < H) this.b[y * W + x] = 0;
    }
    for (let y = Math.floor(cy - r); y <= cy + r; y++) for (let x = Math.floor(cx - r); x <= cx + r; x++) {
      const dx = x + 0.5 - cx, dy = y + 0.5 - cy, d2 = (dx * dx + dy * dy) / (r * r);
      if (d2 > 1.05) continue;
      const hl = (dx + r * 0.35) ** 2 + (dy + r * 0.35) ** 2 < r * r * 0.12;
      this.put(x, y, hl ? 15 : Math.round(l * (1 - 0.5 * d2)), hl ? K_HOT : k);
    }
  }

  glyph(g, x, y, l, k) {
    const gx0 = x + g.ox, gy0 = y + g.oy, gr = this.grad;
    for (let j = 0; j < g.h; j++) {
      const py = gy0 + j;
      if (py < this.y0 || py >= this.y1) continue;
      const lj = gr ? Math.max(1, l - Math.round(gr * (j + g.oy) / g.h)) : l, lh = Math.max(1, Math.round(lj * 0.4));
      for (let i = 0; i < g.w; i++) {
        const v = g.px[j * g.w + i];
        if (!v) continue;
        const px = gx0 + i;
        if (px < this.x0 || px >= this.x1) continue;
        const o = py * W + px, lv = v === 2 ? lj : lh;
        if (lv >= this.b[o]) { this.b[o] = lv; this.c[o] = k; }
      }
    }
  }
  // texte (y = haut des capitales) ; n = nombre de caractères visibles (frappe progressive)
  text(s, x, y, f, l = 15, k = K_BASE, n = 1e9) {
    x = Math.round(x); y = Math.round(y);
    let cx = x, i = 0;
    for (const ch of up(s)) {
      if (i++ >= n) break;
      const g = glyph(f, ch);
      if (g.w) this.glyph(g, cx, y, l, k);
      cx += g.adv + f.sp;
    }
    return cx - x - f.sp;
  }
  textC(s, y, f, l, k, n) { const w = measure(s, f); this.text(s, Math.floor((W - w) / 2), y, f, l, k, n); return w; }
  // positions des lettres (animations lettre par lettre)
  layout(s, f) {
    const key = f.id + '\u0001' + s;
    let r = this.cache.get(key);
    if (r) return r;
    const items = [];
    let x = 0;
    for (const ch of up(s)) { const g = glyph(f, ch); items.push([g, x]); x += g.adv + f.sp; }
    r = { items, w: Math.max(0, x - f.sp) };
    if (this.cache.size > 160) this.cache.clear();
    this.cache.set(key, r);
    return r;
  }
  raster(s, f) {
    const key = 'r' + f.id + '\u0001' + s;
    let r = this.cache.get(key);
    if (r) return r;
    const lay = this.layout(s, f);
    let top = 0, bot = f.cap;
    for (const [g] of lay.items) if (g.w) { top = Math.min(top, g.oy); bot = Math.max(bot, g.oy + g.h); }
    const w = Math.max(1, lay.w), h = bot - top, px = new Uint8Array(w * h);
    for (const [g, x] of lay.items) for (let j = 0; j < g.h; j++) for (let i = 0; i < g.w; i++) {
      const v = g.px[j * g.w + i], xx = x + g.ox + i;
      if (v && xx >= 0 && xx < w) px[(g.oy + j - top) * w + xx] = v;
    }
    r = { w, h, oy: top, px };
    this.cache.set(key, r);
    return r;
  }
  // texte agrandi (échantillonnage au plus proche), centré sur (cx, cy = milieu des capitales)
  textZ(s, cx, cy, f, sc, l, k) {
    if (sc < 0.08) return;
    const r = this.raster(s, f), lh = Math.max(1, Math.round(l * 0.4));
    const x0 = cx - r.w * sc / 2, y0 = cy - f.cap * sc / 2 + r.oy * sc;
    const xa = Math.max(this.x0, Math.floor(x0)), xb = Math.min(this.x1, Math.ceil(x0 + r.w * sc));
    const ya = Math.max(this.y0, Math.floor(y0)), yb = Math.min(this.y1, Math.ceil(y0 + r.h * sc));
    for (let y = ya; y < yb; y++) {
      const v = Math.floor((y + 0.5 - y0) / sc);
      if (v < 0 || v >= r.h) continue;
      for (let x = xa; x < xb; x++) {
        const u = Math.floor((x + 0.5 - x0) / sc);
        if (u < 0 || u >= r.w) continue;
        const p = r.px[v * r.w + u];
        if (!p) continue;
        const o = y * W + x, lv = p === 2 ? l : lh;
        if (lv >= this.b[o]) { this.b[o] = lv; this.c[o] = k; }
      }
    }
  }
  // texte défilant s'il dépasse la largeur w (pause au début et à la fin)
  marquee(s, x, y, w, f, l, k, t, speed = 34, align = 'c') {
    const tw = measure(s, f);
    if (tw <= w) { this.text(s, align === 'l' ? x : align === 'r' ? x + w - tw : x + Math.floor((w - tw) / 2), y, f, l, k); return; }
    const span = tw - w, hold = 1, period = hold * 2 + span / speed, tt = Math.max(0, t) % period;
    const off = Math.round(Math.min(span, Math.max(0, (tt - hold) * speed)));
    const sx0 = this.x0, sx1 = this.x1;
    this.x0 = Math.max(sx0, x); this.x1 = Math.min(sx1, x + w);
    this.text(s, x - off, y, f, l, k);
    this.x0 = sx0; this.x1 = sx1;
  }
  // lignes centrées sur (xc, yc = milieu du bloc de capitales)
  block(ft, xc, yc, l, k, n = 1e9) {
    const f = ft.f, pitch = f === F_M ? 14 : 10;
    let y = Math.round(yc - (f.cap + (ft.lines.length - 1) * pitch) / 2), left = n;
    for (const s of ft.lines) {
      this.text(s, Math.round(xc - measure(s, f) / 2), y, f, l, k, left);
      left -= [...s].length + 1; y += pitch;
    }
  }

  // ------- effets de composition
  chaser(t, k, l = 9) {
    const off = Math.floor(t * 24);
    for (let p = 0; p < 316; p++) {
      if ((p + off) & 3) continue;
      if (p < 128) this.put(p, 0, l, k);
      else if (p < 159) this.put(127, p - 127, l, k);
      else if (p < 286) this.put(127 - (p - 158), 31, l, k);
      else this.put(0, 31 - (p - 285), l, k);
    }
  }
  rays(cx, cy, n, a0, l, k) {
    for (let i = 0; i < n; i++) {
      const a = a0 + i * TAU / n;
      for (const da of [0, 0.045]) this.line(cx + Math.cos(a + da) * 6, cy + Math.sin(a + da) * 6, cx + Math.cos(a + da) * 90, cy + Math.sin(a + da) * 90, l, k);
    }
  }
  // reflet diagonal sur les points allumés
  shine(pos, w, k) {
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if (!this.b[i]) continue;
      const d = Math.abs(x + y * 0.7 - pos);
      if (d < w) { this.b[i] = 15; if (d < w * 0.6) this.c[i] = k; }
    }
  }
  // barre de balayage verticale : allume le texte, laisse une traînée pâle
  sweep(x, w, k) {
    for (let xx = Math.round(x - w); xx <= x + w; xx++) {
      if (xx < 0 || xx >= W) continue;
      for (let y = 0; y < H; y++) {
        const i = y * W + xx;
        if (this.b[i]) { this.b[i] = 15; this.c[i] = k; } else { this.b[i] = 2; this.c[i] = k; }
      }
    }
  }
  corners(l, k) {
    for (const [x, y, dx, dy] of [[0, 0, 1, 1], [127, 0, -1, 1], [0, 31, 1, -1], [127, 31, -1, -1]]) {
      for (let i = 0; i < 5; i++) { this.put(x + dx * i, y, l, k); this.put(x, y + dy * i, l, k); }
    }
  }
  noise(dens, lmax, k) { const n = dens * N; for (let i = 0; i < n; i++) { const o = (Math.random() * N) | 0; this.put(o % W, (o / W) | 0, 1 + ((Math.random() * lmax) | 0), k); } }
  tint(k) { for (let i = 0; i < N; i++) if (this.b[i]) this.c[i] = k; }
  dim(m) { for (let i = 0; i < N; i++) this.b[i] = (this.b[i] * m) | 0; }
  shiftRow(y, dx, x0 = 0, x1 = W) {
    if (y < 0 || y >= H || !dx) return;
    const o = y * W, b = this.b, c = this.c, rb = this.row, rc = this.rowC;
    for (let x = x0; x < x1; x++) { rb[x] = b[o + x]; rc[x] = c[o + x]; }
    for (let x = x0; x < x1; x++) { const s = x - dx; b[o + x] = s >= x0 && s < x1 ? rb[s] : 0; c[o + x] = s >= x0 && s < x1 ? rc[s] : 0; }
  }
  // chaque colonne glisse vers le bas à sa propre vitesse (texte qui « fond »)
  melt(amount) {
    for (let x = 0; x < W; x++) {
      const s = Math.floor(amount * (0.35 + this.rnd[x] / 255 * 0.9));
      if (s <= 0) continue;
      for (let y = H - 1; y >= 0; y--) { const i = y * W + x, j = (y - s) * W + x; this.b[i] = y - s >= 0 ? this.b[j] : 0; this.c[i] = y - s >= 0 ? this.c[j] : 0; }
    }
  }
  // transitions : p = part visible (0 → 1)
  wipe(p) { const xc = Math.round(p * W); if (xc < W) for (let y = 0; y < H; y++) this.b.fill(0, y * W + Math.max(0, xc), y * W + W); }
  blinds(p) { const v = Math.ceil(p * 4); for (let y = 0; y < H; y++) if ((y & 3) >= v) this.b.fill(0, y * W, y * W + W); }
  dissolve(p) { const th = p * 256; for (let i = 0; i < N; i++) if (this.rnd[i] >= th) this.b[i] = 0; }
}

// ------------------------------------------------------------ événements
// pri : priorité (une plus haute interrompt), dur : durée (s), col : teinte par défaut, out : transition de sortie
const EV = {
  jackpot:      { pri: 3, dur: 2.6, col: '#ffd84a', out: 'dissolve' },
  superJackpot: { pri: 4, dur: 3.3, col: '#ffd84a', out: 'dissolve' },
  multiball:    { pri: 3, dur: 2.8, col: '#ff3df2', out: 'blinds' },
  extraBall:    { pri: 3, dur: 2.8, col: '#ffd84a', out: 'wipe' },
  skillShot:    { pri: 2, dur: 2.2, col: '#29e3ff', out: 'dissolve' },
  combo:        { pri: 1, dur: 1.5, col: null, out: 'wipe', merge: true },
  sectorReady:  { pri: 2, dur: 2.6, col: '#29e3ff', out: 'blinds' },
  minigame:     { pri: 3, dur: 2.6, col: '#29e3ff', out: 'none' },
  minigameWin:  { pri: 3, dur: 3.0, col: '#5dff8f', out: 'dissolve' },
  minigameFail: { pri: 3, dur: 2.7, col: '#ff7a7a', out: 'none' },
  mission:      { pri: 1, dur: 2.6, col: '#ffd84a', out: 'blinds' },
  missionDone:  { pri: 2, dur: 2.5, col: '#ffd84a', out: 'dissolve' },
  ballSave:     { pri: 1, dur: 1.7, col: '#29e3ff', out: 'wipe' },
  shield:       { pri: 1, dur: 1.7, col: '#7fd7ff', out: 'wipe' },
  ballLost:     { pri: 2, dur: 2.8, col: '#ff5a3c', out: 'dissolve' },
  levelUp:      { pri: 3, dur: 3.0, col: '#ff3d6e', out: 'blinds' },
  pivot:        { pri: 2, dur: 2.6, col: '#ffb52e', out: 'wipe' },
  frenzy:       { pri: 4, dur: 3.4, col: '#ff3040', out: 'dissolve' },
  gameOver:     { pri: 5, dur: 4.0, col: null, out: 'none', hold: true },
  banner:       { pri: 2, dur: 2.3, col: null, out: 'blinds' },
  _null:        { pri: 2, dur: 2.6, col: '#ff3d6e', out: 'dissolve' },
};
const MAX_WAIT = [0, 2.5, 4, 7, 9, 99];   // attente maximale en file, par priorité

// Dessin de chaque événement : (frame, événement, temps écoulé, DMD)
const DRAW = {
  jackpot(f, e, t, d) {
    if (t < 0.32) {
      const fl = t < 0.06 ? 13 : Math.round(9 * (1 - ph(t, 0.06, 0.3)));
      f.fill(d.reduced ? Math.min(fl, 4) : fl, K_EV);
      f.ring(64, 16, t * 240, 15, K_HOT, 2); f.ring(64, 16, t * 170, 8, K_EV);
    }
    if (t < 1.25) {
      const sc = 2 + (1 - eBack(ph(t, 0.06, 0.55))) * 2.6;
      f.textZ('JACKPOT', 64, 16, F_M, sc, t < 0.5 && !d.reduced && Math.floor(t * 24) % 2 ? 8 : 15, K_EV);
      if (t > 0.6) f.shine((t - 0.6) * 240 - 20, 5, K_HOT);
    } else {
      const p = eInOut(ph(t, 1.25, 1.5));
      f.textZ('JACKPOT', 64, lerp(16, 7.5, p), F_M, lerp(2, 1, p), 15, K_EV);
      if (t > 1.45 && e.data.value != null) f.textC(fmt(e.data.value * eOut(ph(t, 1.45, 2.0))), 18, F_M, 15, K_BASE);
    }
    if (t > 0.3) f.chaser(t, K_EV);
  },

  superJackpot(f, e, t, d) {
    if (t < 0.45 && (d.reduced ? t < 0.08 : Math.floor(t / 0.075) % 2 === 0)) f.fill(d.reduced ? 5 : 13, Math.floor(t / 0.15) % 2 ? K_HOT : K_EV);
    if (t > 0.25) f.rays(64, 16, 12, t * 0.9, 3, K_EV);
    if (t < 1.65) {
      const sq = eIn(ph(t, 1.45, 1.65)), w1 = measure('SUPER', F_M), w2 = measure('JACKPOT', F_M);
      const x1 = Math.round(lerp(-w1, (W - w1) / 2, eOut(ph(t, 0.3, 0.7)))), x2 = Math.round(lerp(W, (W - w2) / 2, eOut(ph(t, 0.45, 0.85))));
      const alt = t > 0.9 && !d.reduced && Math.floor(t * 8) % 2;
      f.clip(0, lerp(0, 16, sq), W, lerp(H, 16, sq));
      f.knock(x1 - 2, 2, w1 + 4, 13); f.text('SUPER', x1, 3, F_M, 15, alt ? K_HOT : K_EV);
      f.knock(x2 - 2, 17, w2 + 4, 13); f.text('JACKPOT', x2, 18, F_M, 15, alt ? K_EV : K_HOT);
      f.unclip();
    } else {
      const s = fmt((e.data.value || 0) * eOut(ph(t, 1.65, 2.3))), big = measure(s, F_B) <= 124;
      f.knock(0, 0, W, 9); f.textC('SUPER JACKPOT', 1, F_S, 15, K_EV);
      const w = measure(s, big ? F_B : F_M);
      f.knock((W - w) / 2 - 2, 10, w + 4, 22);
      f.grad = big ? 3 : 0; f.textC(s, big ? 11 : 15, big ? F_B : F_M, 15, K_BASE); f.grad = 0;
    }
  },

  multiball(f, e, t, d) {
    const rx = 56, ry = 12, a0 = t * 3.4;
    for (let i = 0; i < 72; i++) { const a = i / 72 * TAU; f.put(64 + Math.cos(a) * rx, 16 + Math.sin(a) * ry, 2, K_EV); }
    const balls = (front) => {
      for (let b = 0; b < 3; b++) {
        const a = a0 + b * TAU / 3;
        if ((Math.sin(a) >= 0) !== front) continue;
        for (let j = 6; j >= 1; j--) f.put(64 + Math.cos(a - j * 0.09) * rx, 16 + Math.sin(a - j * 0.09) * ry, 11 - j * 1.5, K_EV);
        f.disc(64 + Math.cos(a) * rx, 16 + Math.sin(a) * ry, front ? 3 : 2.2, front ? 15 : 9, K_EV, front);
      }
    };
    balls(false);
    const lay = f.layout('MULTIBILLE', F_M), x0 = (W - lay.w) >> 1, shown = ph(t, 0.12, 0.8) * lay.items.length;
    const blink = t > 1.7 && !d.reduced && Math.floor(t / 0.12) % 2;
    lay.items.forEach(([g, x], i) => {
      if (i >= shown) return;
      const fresh = shown - i < 1 && t < 0.85;
      f.glyph(g, x0 + x, fresh ? 9 : 10, blink ? 7 : 15, fresh ? K_HOT : K_EV);
    });
    balls(true);
  },

  extraBall(f, e, t, d) {
    const p = ph(t, 0, 1.05), bx = lerp(-8, 138, p), by = 15.5 - Math.abs(Math.sin(p * Math.PI * 3)) * 3 * (1 - p);
    const lv = t > 1.1 ? Math.round(12.5 + 2.5 * Math.sin(t * 9)) : 15;
    f.clip(0, 0, Math.max(0, bx - 1), H);
    f.textC('BILLE', 2, F_M, lv, K_BASE);
    f.textC('SUPPLÉMENTAIRE', 19, F_M, lv, K_EV);
    f.unclip();
    if (p < 1) {
      for (let j = 1; j < 8; j++) f.hline(bx - 6 - j * 3, bx - 5 - j * 3, Math.round(by + ((j * 5) % 3) - 1), 9 - j, K_HOT);
      f.disc(bx, by, 4, 15, K_EV, true);
    }
  },

  skillShot(f, e, t, d) {
    if (t < 0.6) {
      const r = lerp(34, 4, eIn(ph(t, 0, 0.55))), g = r + 3;
      f.ring(64, 16, r, 12, K_EV); f.ring(64, 16, r * 0.5, 6, K_EV);
      f.hline(0, 64 - g, 16, 6, K_EV, 2); f.hline(64 + g, W - 1, 16, 6, K_EV, 2);
      f.vline(64, 0, 16 - g, 6, K_EV, 2); f.vline(64, 16 + g, H - 1, 6, K_EV, 2);
      if (t > 0.54) f.fill(d.reduced ? 5 : 13, K_EV);
      return;
    }
    for (const x of [10, 117]) {
      f.ring(x, 16, 5 + Math.sin(t * 9), 9, K_EV);
      f.hline(x - 8, x - 3, 16, 6, K_EV); f.hline(x + 3, x + 8, 16, 6, K_EV); f.put(x, 16, 15, K_HOT);
    }
    const q = eOut(ph(t, 0.6, 0.9));
    f.clip(64 - 64 * q, 0, 64 + 64 * q, H);
    f.textC('SKILL SHOT', e.data.value != null ? 2 : 10, F_M, 15, K_EV);
    if (e.data.value != null) f.textC(fmt(e.data.value * eOut(ph(t, 0.75, 1.2))), 18, F_M, 15, K_BASE);
    f.unclip();
  },

  combo(f, e, t, d) {
    for (let i = 0; i < 9; i++) {
      const y = (i * 11 + 3) % 30 + 1, len = 6 + (i * 7) % 14, x = W - ((t * 260 + i * 41) % (W + 40));
      f.hline(x, x + len, y, 4, K_EV);
    }
    const sh = d.reduced ? 0 : Math.round(Math.sin(t * 70) * 2 * (1 - ph(t, 0.25, 0.5)));
    const x = Math.round(lerp(W, 6, eOut(ph(t, 0, 0.28)))) + sh;
    f.knock(x - 2, 9, measure('COMBO', F_M) + 4, 13); f.text('COMBO', x, 10, F_M, 15, K_BASE);
    const s = String(e.data.n || 2), wB = measure(s, F_B), wX = measure('×', F_M);
    const xr = Math.round(lerp(W + 10, W - 4 - wB - wX - 3, eBack(ph(t, 0.1, 0.38))));
    const bump = e.bumpT != null ? 1 - ph(t, e.bumpT, e.bumpT + 0.22) : 0;
    f.knock(xr - 2, 4, wB + wX + 7, 24);
    f.text('×', xr, 10, F_M, 15, K_EV);
    if (bump > 0) f.textZ(s, xr + wX + 3 + wB / 2, 16, F_B, 1 + 0.35 * bump, 15, K_HOT);
    else { f.grad = 3; f.text(s, xr + wX + 3, 6, F_B, 15, K_EV); f.grad = 0; }
  },

  sectorReady(f, e, t, d) {
    const m = e.memo;
    if (!m.name) { m.name = up(e.data.name || 'SECTEUR'); m.big = measure(m.name, F_M) <= 104; m.sub = up(e.data.sub || 'ACCÈS OUVERT'); }
    const sweep = lerp(-4, W + 6, ph(t, 0, 0.6));
    f.clip(0, 0, Math.max(0, sweep), H);
    drawLock(f, 3, 9, eOut(ph(t, 0.7, 0.95)) * 3, t > 0.7 && t < 1 && !d.reduced && Math.floor(t * 20) % 2 ? K_HOT : K_EV);
    const blink = t > 0.75 && t < 1.25 && !d.reduced && Math.floor((t - 0.75) / 0.083) % 2;
    if (m.big) f.text(m.name, 21 + ((105 - measure(m.name, F_M)) >> 1), 4, F_M, blink ? 6 : 15, K_EV);
    else f.marquee(m.name, 21, 6, 105, F_S, blink ? 6 : 15, K_EV, t);
    f.marquee(m.sub, 21, 21, 105, F_S, 12, K_BASE, t - 0.6);
    f.unclip();
    if (t < 0.6) { f.vline(sweep, 0, H - 1, 15, K_HOT); f.vline(sweep - 1, 0, H - 1, 8, K_EV); f.vline(sweep - 2, 0, H - 1, 3, K_EV); }
  },

  minigame(f, e, t, d) {
    const m = e.memo;
    if (!m.stars) {
      m.stars = Array.from({ length: d.reduced ? 18 : 56 }, (_, i) => ({ a: hash(e.seed + i) * TAU, s: 0.5 + hash(e.seed + i * 7 + 3) * 0.9, o: hash(e.seed + i * 13 + 5) }));
      m.sub = up(e.data.sub || '');
      m.t = fit(e.data.title || 'MINIJEU', 124, m.sub ? 2 : 3);
    }
    for (const s of m.stars) {
      const q = (t * s.s * (0.6 + t * 0.5) + s.o) % 1, r1 = q * q * 96, r0 = r1 * 0.5, c = Math.cos(s.a), sn = Math.sin(s.a) * 0.42;
      f.line(64 + c * r0, 16 + sn * r0, 64 + c * r1, 16 + sn * r1, Math.round(2 + q * 6), K_EV);
      f.put(64 + c * r1 + 0.5, 16 + sn * r1 + 0.5, Math.round(6 + q * 9), q > 0.5 ? K_HOT : K_EV);
    }
    const yc = m.sub ? (m.t.f === F_M ? 9.5 : 6 + m.t.lines.length * 2) : 16, n = Math.floor((t - 0.2) * 24);
    const pitch = m.t.f === F_M ? 14 : 10, hh = m.t.f.cap + (m.t.lines.length - 1) * pitch + 4;
    f.knock(0, Math.round(yc - hh / 2) - 1, W, hh + 1);
    if (n > 0) f.block(m.t, 64, yc, 15, K_EV, n);
    if (m.sub && t > 0.9) { f.knock(0, 20, W, 10); f.marquee(m.sub, 0, 22, W, F_S, 12, K_BASE, t - 1.2); }
    // sortie façon tube cathodique : l'image s'écrase sur une ligne qui rétrécit
    if (t > 2.15) {
      const p = eIn(ph(t, 2.15, 2.45)), q = ph(t, 2.4, 2.6), hh = Math.round(16 * (1 - p));
      f.knock(0, 0, W, 16 - hh); f.knock(0, 16 + hh, W, 16);
      if (p >= 1) { const hw = Math.round(64 * (1 - q)); f.knock(0, 15, W, 2); f.hline(64 - hw, 63 + hw, 15, 15, K_HOT); f.hline(64 - hw, 63 + hw, 16, 15, K_HOT); }
    }
  },

  minigameWin(f, e, t, d) {
    const m = e.memo;
    if (!m.t) { m.sub = up(e.data.sub || ''); m.t = fit(e.data.title || 'SECTEUR RÉACTIVÉ', 102, 2); }
    drawCheck(f, 2, 7, ph(t, 0.1, 0.45), t < 0.6 ? K_HOT : K_EV);
    const lv = t > 1 ? Math.round(13 + 2 * Math.sin(t * 8)) : 15;
    f.block(m.t, 75, titleY(m), lv, K_EV, Math.floor((t - 0.15) * 30));
    if (m.sub && t > 0.6) f.marquee(m.sub, 22, 22, 105, F_S, 12, K_BASE, t - 1.1);
  },

  minigameFail(f, e, t, d) {
    const m = e.memo;
    if (!m.t) { m.sub = up(e.data.sub || ''); m.t = fit(e.data.title || 'ÉCHEC', 102, 2); }
    if (t < 0.35 && !d.reduced) f.noise(0.45 * (1 - t / 0.35), 9, K_EV);
    const vis = t > 0.25 && (t > 0.6 || d.reduced || hash(e.seed + Math.floor(t * 30)) > 0.4);
    if (vis) {
      for (let i = 0; i < 2; i++) { f.line(3 + i, 9, 15 + i, 21, 14, K_EV); f.line(15 + i, 9, 3 + i, 21, 14, K_EV); }
      f.block(m.t, 75, titleY(m), 15, K_EV);
      if (m.sub) f.marquee(m.sub, 22, 22, 105, F_S, 12, K_BASE, t - 0.9);
    }
    if (t > 1.8) { if (d.reduced) f.dim(1 - ph(t, 1.8, 2.7)); else f.melt((t - 1.8) * 45); }
  },

  mission(f, e, t, d) {
    const m = e.memo;
    if (!m.lines) m.lines = wrap(e.data.text || '', F_S, 124).slice(0, 2);
    const hy = Math.round(lerp(-9, 1, eOut(ph(t, 0, 0.25)))), w = measure('NOUVELLE MISSION', F_S), hx = (W - w) >> 1;
    f.text('NOUVELLE MISSION', hx, hy, F_S, 15, K_EV);
    if (Math.floor(t * 4) % 2 === 0) { f.text('◆', hx - 9, hy, F_S, 15, K_EV); f.text('◆', hx + w + 4, hy, F_S, 15, K_EV); }
    const half = 62 * eOut(ph(t, 0.15, 0.45));
    for (let x = Math.round(64 - half); x <= 64 + half; x += 2) f.put(x, 10, 4, K_EV);
    const n = Math.floor((t - 0.35) * 34);
    if (n > 0) f.block({ f: F_S, lines: m.lines }, 64, m.lines.length > 1 ? 22 : 21, 14, K_BASE, n);
  },

  missionDone(f, e, t, d) {
    f.textC('MISSION ACCOMPLIE', 1, F_S, 15, K_EV, Math.floor(t * 40));
    const p = eOut(ph(t, 0.2, 0.75)), done = p >= 1, flash = done && t < 1.05 && !d.reduced && Math.floor(t * 14) % 2;
    f.box(3, 11, 96, 8, flash ? 15 : 6, flash ? K_HOT : K_EV);
    const lit = Math.round(23 * p);
    for (let s = 0; s < lit; s++) f.rect(5 + s * 4, 13, 3, 4, s === lit - 1 && !done ? 15 : 12, K_EV);
    const pct = Math.round(p * 100) + '%';
    f.text(pct, 126 - measure(pct, F_S), 12, F_S, done ? 15 : 11, done ? K_HOT : K_BASE);
    if (t > 0.5 && e.data.text) f.marquee(e.data.text, 0, 23, W, F_S, 13, K_BASE, t - 1);
  },

  ballSave(f, e, t, d) {
    for (const x0 of [3, W - 14]) {
      for (let j = 0; j < 6; j++) {
        const y = ((j * 7 - t * 30) % 42 + 42) % 42 - 6;
        for (let i = 0; i < 6; i++) { f.put(x0 + 5 - i, y + i, 9 - (y < 4 ? 4 : 0), K_EV); f.put(x0 + 5 + i, y + i, 9 - (y < 4 ? 4 : 0), K_EV); }
      }
    }
    f.knock(20, 0, 88, H);
    f.clip(0, lerp(H, 0, eOut(ph(t, 0, 0.3))), W, H);
    f.textC('SAUVEGARDE', 4, F_M, 15, K_EV);
    f.unclip();
    f.textC(e.data.sub || 'NOYAU RÉINJECTÉ', 22, F_S, 12, K_BASE, Math.floor((t - 0.3) * 40));
  },

  shield(f, e, t, d) {
    for (let k = 0; k < (d.reduced ? 1 : 3); k++) { const r = (t * 40 + k * 11) % 33; f.ring(11, 15, r, Math.max(1, Math.round(6 - r / 6)), K_EV); }
    drawShield(f, 4, 4, t < 0.15 ? 15 : 13, t < 0.15 ? K_HOT : K_EV);
    f.knock(23, 0, 105, H);
    f.text('BOUCLIER', 24 + ((103 - measure('BOUCLIER', F_M)) >> 1), 4, F_M, 15, K_EV);
    f.marquee(e.data.sub || 'CHUTE ANNULÉE', 23, 22, 104, F_S, 12, K_BASE, t);
  },

  ballLost(f, e, t, d) {
    const lay = f.layout('NOYAU PERDU', F_M), x0 = (W - lay.w) >> 1, has = e.data.bonus != null;
    const yb = has ? 2 : 8;
    lay.items.forEach(([g, x], i) => {
      const p = ph(t, i * 0.05, i * 0.05 + 0.5);
      if (p > 0) f.glyph(g, x0 + x, Math.round(lerp(-14, yb, eBounce(p))), 15, K_EV);
    });
    if (t < 1) return;
    if (has) {
      f.text('BONUS', 4, 22, F_S, 12, K_BASE);
      const s = fmt(e.data.bonus * eOut(ph(t, 1, 1.7)));
      f.text(s, W - 3 - measure(s, F_M), 19, F_M, 15, K_BASE);
    } else f.textC('NOYAU SUIVANT…', 23, F_S, 11, K_BASE, Math.floor((t - 1) * 30));
  },

  levelUp(f, e, t, d) {
    const ramp = ph(t, 0, 0.5);
    for (let i = 0; i < 16; i++) { const h = 1 + Math.round((0.5 + 0.5 * Math.sin(t * 7 + i * 0.8)) * 9 * ramp); f.rect(i * 8 + 1, H - h, 6, h, 3, K_EV); }
    f.knock(0, 0, W, 10);
    f.textC('NIVEAU DE SÉCURITÉ', 2, F_S, 15, K_BASE, Math.floor(t * 34));
    const s = String(e.data.lvl ?? '?'), p = ph(t, 0.35, 0.8);
    if (p <= 0) return;
    const sc = 1 + (1 - eBack(p)) * 2.2, w = measure(s, F_B) * sc;
    f.knock(64 - w / 2 - 3, 10, w + 6, 22);
    f.textZ(s, 64, 20.5, F_B, sc, 15, K_EV);
    if (t > 0.9) {
      const b = Math.round(Math.abs(Math.sin(t * 5)) * 2), wb = measure(s, F_B);
      f.text('▲', 64 - wb / 2 - 11, 17 - b, F_S, 13, K_EV); f.text('▲', 64 + wb / 2 + 6, 17 - b, F_S, 13, K_EV);
    }
  },

  gameOver(f, e, t, d) {
    const lay = f.layout('FIN DE PARTIE', F_M), x0 = (W - lay.w) >> 1, yb = Math.round(lerp(10, 2, eInOut(ph(t, 1.5, 1.9))));
    const lv = t > e.dur ? (Math.floor(t * 1.25) % 2 ? 9 : 15) : 15;
    lay.items.forEach(([g, x], i) => {
      const p = ph(t, 0.1 + i * 0.07, 0.55 + i * 0.07);
      if (p > 0) f.glyph(g, x0 + x, p < 1 ? Math.round(lerp(-14, 10, eBounce(p))) : yb, lv, K_EV);
    });
    if (t > 1.9) {
      f.clip(0, 0, lerp(0, W, ph(t, 1.9, 2.3)), H);
      f.textC(fmt(e.data.score ?? d.score), 18, F_M, 15, K_BASE);
      f.unclip();
    }
  },

  // rotation d'un barillet : prisme vu en bout qui tourne en trois crans, puis « ANCIEN → NOUVEAU »
  pivot(f, e, t, d) {
    const m = e.memo;
    if (!m.to) { m.from = up(e.data.from || ''); m.to = up(e.data.to || ''); }
    const step = (u) => { let p = 0; for (let k = 0; k < 3; k++) { const v = clamp01((u - k * 0.37) / 0.26); p += eInOut(v) / 3; } return p; };
    const a = -Math.PI / 2 + step(ph(t, 0.3, 1.9)) * TAU / 3 * (e.data.side === 'L' ? -1 : 1);
    const cx = 13, cy = 16, r = 11;
    const P = [0, 1, 2].map(k => [cx + Math.cos(a + k * TAU / 3) * r, cy + Math.sin(a + k * TAU / 3) * r]);
    for (let k = 0; k < 3; k++) f.line(P[k][0], P[k][1], P[(k + 1) % 3][0], P[(k + 1) % 3][1], 15, K_EV);
    f.disc(cx, cy, 2, 12, K_HOT);
    if (t > 0.3 && t < 1.9 && !d.reduced) for (let k = 0; k < 3; k++) if (hash(e.seed + k + Math.floor(t * 20)) > 0.6) f.put(P[k][0] + 1, P[k][1] - 1, 15, K_HOT);
    f.clip(28, 0, W, H);
    f.marquee('ROTATION DU BARILLET', 28, 2, W - 28, F_S, 12, K_BASE, t);
    const p = eOut(ph(t, 1.6, 2.1));
    f.text(m.from, 30, 13, F_M, Math.round(15 - 9 * p), K_BASE);
    if (p > 0) {
      const w = measure(m.to, F_M), x = Math.round(lerp(W + 2, Math.max(30, W - 2 - w), p));
      f.knock(x - 3, 12, w + 6, 14);
      f.text(m.to, x, 13, F_M, 15, K_EV);
    }
    f.unclip();
  },

  // FURIE : alarme, « FURIE » qui tremble, pluie de billes
  frenzy(f, e, t, d) {
    if (t < 0.7) {
      const on = d.reduced ? t < 0.1 : Math.floor(t / 0.1) % 2 === 0;
      if (on) f.fill(d.reduced ? 5 : 12, K_EV);
      f.textC('ALERTE', 10, F_M, on ? 2 : 15, on ? K_BASE : K_EV);
      return;
    }
    for (let i = 0; i < 10; i++) {
      const x = 6 + (i * 37) % 118, sp = 34 + (i * 13) % 20, y = ((t - 0.7) * sp + i * 7) % 40 - 5;
      for (let j = 1; j < 4; j++) f.put(x, y - j * 2, 9 - j * 2, K_EV);
      f.disc(x, y, 2, 13, K_EV, true);
    }
    const sh = d.reduced ? 0 : Math.round(Math.sin(t * 60) * 1.5);
    const sc = lerp(2.4, 1, eBack(ph(t, 0.7, 1.1)));
    f.knock(30 + sh, 2, 68, 18);
    f.textZ('FURIE', 64 + sh, 11, F_M, sc, Math.floor(t * 8) % 2 && !d.reduced ? 12 : 15, K_EV);
    if (t > 1.4) {
      f.knock(0, 22, W, 10);
      f.marquee(up(e.data.sub || ''), 0, 23, W, F_S, 13, K_BASE, t - 1.4);
    }
  },

  banner(f, e, t, d) {
    const m = e.memo;
    if (!m.t) { m.sub = up(e.data.sub || ''); m.t = fit(e.data.title || '', 124, m.sub ? 1 : 3); }
    if (m.sub) {
      if (m.t.f === F_M) f.text(m.t.lines[0], (W - measure(m.t.lines[0], F_M)) >> 1, 3, F_M, 15, K_EV);
      else f.marquee(m.t.lines[0], 2, 5, 124, F_S, 15, K_EV, t);
      const half = 60 * eOut(ph(t, 0.1, 0.4));
      for (let x = Math.round(64 - half); x <= 64 + half; x += 2) f.put(x, 17, 4, K_EV);
      f.marquee(m.sub, 0, 21, W, F_S, 12, K_BASE, t - 0.4);
    } else f.block(m.t, 64, 16, 15, K_EV);
    if (t < 0.3) f.blinds(ph(t, 0, 0.3));
  },

  // NULL prend le contrôle de l'afficheur : corruption de l'image précédente, puis texte rouge instable
  _null(f, e, t, d) {
    const m = e.memo, R = d.reduced;
    if (!m.t) m.t = fit(e.data.text || '', 124, 3);
    if (t < 0.3 && !R && m.snap) {
      f.b.set(m.snap.b); f.c.set(m.snap.c);
      const k = Math.floor(t * 40);
      for (let y = 0; y < H; y++) if (hash(e.seed + y * 7 + k * 131) < 0.55) f.shiftRow(y, Math.round((hash(e.seed + y + k * 17) - 0.5) * 34));
      f.noise(0.22, 12, K_NULL); f.tint(K_NULL);
      return;
    }
    const g = R ? 0 : hash(e.seed + Math.floor(t * 12)), glitch = g > 0.8;
    let ft = m.t;
    if (glitch) {
      const chars = '#%/<>=*01?';
      ft = { f: ft.f, lines: ft.lines.map((s, li) => { const a = [...s], i = Math.floor(hash(e.seed + li + Math.floor(t * 12) * 3) * a.length); if (a[i] !== ' ') a[i] = chars[(g * 97 | 0) % chars.length]; return a.join(''); }) };
    }
    f.block(ft, 64, 16, R ? 15 : 13 + Math.round(hash(Math.floor(t * 30)) * 2), K_NULL);
    if (R) return;
    if (glitch) { for (let i = 0; i < 4; i++) { const y = Math.floor(hash(e.seed + i * 11 + Math.floor(t * 12)) * H); f.shiftRow(y, Math.round((hash(e.seed + i + y) - 0.5) * 10)); } f.noise(0.03, 8, K_NULL); }
    f.noise(0.006, 5, K_NULL);
    for (let y = 0; y < H; y++) { const r = hash(e.seed + y * 3 + Math.floor(t * 20) * 31); if (r > 0.72) { f.put(0, y, 8, K_NULL); f.put(W - 1, y, 8, K_NULL); } }
  },
};

// Centre vertical d'un titre au-dessus d'un sous-titre (accents compris)
const titleY = (m) => (!m.sub ? 16 : m.t.lines.length > 1 ? 10.5 : 8.5);

// Animations rythmées (gerbes, scintillements) : appelées par update()
const TICK = {
  jackpot(d, e, dt) {
    if (at(e, 0.03)) { d.burst(64, 16, 46, 120, K_HOT, 1.0, 25); d.burst(64, 16, 24, 60, K_EV, 1.4, 20); }
    if (e.t > 1.5 && e.t < 2.4) d.twinkle(dt * 22, K_GOLD);
  },
  superJackpot(d, e, dt) {
    if (at(e, 0.05)) d.burst(64, 16, 50, 140, K_HOT, 1.1, 20);
    if (at(e, 1.66)) d.burst(64, 20, 50, 110, K_EV, 1.2, 30);
    if (e.t > 1.7) d.twinkle(dt * 30, K_GOLD);
  },
  multiball(d, e, dt) { if (e.t > 0.9) d.twinkle(dt * 10, K_MAG); },
  extraBall(d, e, dt) { if (at(e, 1.05)) d.burst(126, 16, 30, 90, K_HOT, 0.9, 10); if (e.t > 1.1) d.twinkle(dt * 14, K_EV); },
  skillShot(d, e) { if (at(e, 0.56)) d.burst(64, 16, 34, 110, K_HOT, 0.9, 0); },
  combo(d, e) { if (at(e, 0.3)) d.burst(112, 16, 14, 60, K_EV, 0.6, 0); },
  sectorReady(d, e) { if (at(e, 0.72)) d.burst(8, 14, 16, 60, K_EV, 0.7, 0); },
  minigameWin(d, e) {
    [0.12, 0.5, 0.9, 1.35].forEach((s, i) => {
      if (at(e, s) && (i === 0 || !d.reduced)) d.burst(30 + hash(e.seed + i) * 90, 6 + hash(e.seed + i + 9) * 18, 34, 80, i % 2 ? K_HOT : K_EV, 1.1, 40);
    });
  },
  missionDone(d, e) { if (at(e, 0.76)) d.burst(52, 15, 22, 70, K_EV, 0.7, 0); },
  levelUp(d, e) { if (at(e, 0.78)) d.burst(64, 20, 36, 100, K_HOT, 1, 20); },
};

// Transitions de sortie (p = part visible)
const OUTS = {
  dissolve: (f, p) => f.dissolve(p),
  blinds: (f, p) => f.blinds(p),
  wipe: (f, p) => f.wipe(p),
  none: () => {},
};

// ------------------------------------------------------------ pictogrammes
function drawLock(f, x, y, open, k) {
  const sy = y - Math.round(open);
  f.rect(x, y + 7, 11, 9, 13, k);
  f.knock(x + 5, y + 10, 1, 3);
  f.hline(x + 3, x + 7, sy, 13, k); f.put(x + 2, sy + 1, 13, k); f.put(x + 8, sy + 1, 13, k);
  f.vline(x + 2, sy + 1, y + 6, 13, k); f.vline(x + 8, sy + 1, y + 6 - Math.round(open), 13, k);
}

function drawCheck(f, x, y, p, k) {
  const pts = [[x + 1, y + 9], [x + 6, y + 14], [x + 16, y + 2]];
  const l1 = Math.hypot(5, 5), l2 = Math.hypot(10, 12), d = p * (l1 + l2);
  const seg = (a, b, q) => { for (let i = 0; i < 2; i++) f.line(a[0], a[1] + i, lerp(a[0], b[0], q), lerp(a[1], b[1], q) + i, 15, k); };
  if (d > 0) seg(pts[0], pts[1], Math.min(1, d / l1));
  if (d > l1) seg(pts[1], pts[2], Math.min(1, (d - l1) / l2));
}

function drawShield(f, x, y, l, k) {
  for (let j = 0; j < 22; j++) {
    const hw = j < 12 ? 7 : Math.max(0, Math.round(7 * (1 - (j - 11) / 10)));
    const cx = x + 7;
    if (j === 0 || j === 1) { f.hline(cx - hw, cx + hw, y + j, l, k); continue; }
    f.put(cx - hw, y + j, l, k); f.put(cx + hw, y + j, l, k);
    if (hw > 1) { f.put(cx - hw + 1, y + j, l, k); f.put(cx + hw - 1, y + j, l, k); }
    for (let i = -hw + 2; i <= hw - 2; i++) f.put(cx + i, y + j, i === 0 && j > 3 && j < 17 ? l : 3, k);
  }
}

// œil de LUMEN (petit : 7×5) ; open = ouverture 0–1
function drawEye(f, x, y, k, open, l = 13) {
  if (open < 0.3) { f.hline(x, x + 6, y + 2, l, k); return; }
  f.hline(x + 2, x + 4, y, l, k); f.hline(x + 2, x + 4, y + 4, l, k);
  f.put(x + 1, y + 1, l, k); f.put(x + 5, y + 1, l, k); f.put(x + 1, y + 3, l, k); f.put(x + 5, y + 3, l, k);
  f.put(x, y + 2, l, k); f.put(x + 6, y + 2, l, k); f.put(x + 3, y + 2, 15, K_HOT);
}

// ------------------------------------------------------------ afficheur
export class DMD {
  constructor(canvas, settings = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.settings = settings;
    this.f = new Frame();
    this.pb = new Uint8Array(N); this.pc = new Uint8Array(N);
    this.v32 = [this.f.b, this.pb, this.f.c, this.pc].map(a => new Uint32Array(a.buffer));
    // petites toiles en mémoire CPU : putImageData sans synchronisation GPU (évite les pics)
    this.small = mkCanvas(W, H); this.sctx = this.small.getContext('2d', { willReadFrequently: true });
    this.img = this.sctx.createImageData(W, H);
    this.u32 = new Uint32Array(this.img.data.buffer);
    this.halo = mkCanvas(32, 8); this.hctx = this.halo.getContext('2d', { willReadFrequently: true });
    this.lut = new Uint32Array(16 * 16);
    this.pal = [];
    PALETTE.forEach((c, i) => this._ink(i, c));
    this.mode = 'attract'; this.t = 0;
    this.score = 0; this.disp = 0; this.pulse = 0; this.lastScore = 0;
    this.info = {}; this.infoKey = ''; this.infoStr = '';
    this.hiscores = [];
    this.ev = null; this.queue = [];
    this.talk = null; this.mg = null;
    this.parts = [];
    this.att = { i: 0, t: 0, pages: null };
    this.reveal = 0; this.glitchT = 0; this.dirty = true;
    this.resize(canvas.clientWidth || 320, canvas.clientHeight || 80, (typeof window !== 'undefined' && window.devicePixelRatio) || 1);
  }

  get reduced() { return !!(this.settings && this.settings.reducedFx); }

  // ------------------------------------------------------------ API
  resize(cssW, cssH, dpr = 1) {
    const cw = Math.max(1, Math.round(cssW * dpr)), ch = Math.max(1, Math.round(cssH * dpr));
    this.canvas.width = cw; this.canvas.height = ch;
    this.canvas.style.width = cssW + 'px'; this.canvas.style.height = cssH + 'px';
    // pas des points : grille 128×32 centrée (marge d'un demi-point), entier si possible pour la netteté
    let pitch = Math.min(cw / (W + 1), ch / (H + 1));
    const pr = Math.round(pitch);
    if (pr >= 2 && Math.abs(pitch - pr) < 0.12 && pr * W <= cw && pr * H <= ch) pitch = pr;
    // suréchantillonnage ×2 pour les petits pas : points ronds propres après réduction
    const P = Math.max(2, Math.min(16, Math.ceil(pitch < 4 ? pitch * 2 : pitch)));
    this.pitch = pitch; this.P = P;
    this.dw = W * pitch; this.dh = H * pitch;
    this.dx = Math.round((cw - this.dw) / 2); this.dy = Math.round((ch - this.dh) / 2);
    this.big = mkCanvas(W * P, H * P); this.gctx = this.big.getContext('2d');
    // masque d'un point : disque antialiasé, cœur un peu plus dense
    const tile = mkCanvas(P, P), tctx = tile.getContext('2d'), td = tctx.createImageData(P, P);
    const r = P * (P >= 5 ? 0.43 : 0.47), c = P / 2;
    for (let y = 0; y < P; y++) for (let x = 0; x < P; x++) {
      let cov = 0;
      for (let sy = 0; sy < 4; sy++) for (let sx = 0; sx < 4; sx++) {
        const dx = x + (sx + 0.5) / 4 - c, dy = y + (sy + 0.5) / 4 - c, d = Math.sqrt(dx * dx + dy * dy);
        if (d <= r) cov += 0.8 + 0.2 * (1 - d / r);
      }
      td.data[(y * P + x) * 4 + 3] = Math.round(255 * Math.min(1, cov / 16 * 1.08));
    }
    tctx.putImageData(td, 0, 0);
    this.dotPat = this.gctx.createPattern(tile, 'repeat');
    // fond : couleur sombre + points éteints
    this.base = mkCanvas(cw, ch);
    const bctx = this.base.getContext('2d');
    bctx.fillStyle = BG; bctx.fillRect(0, 0, cw, ch);
    const off = mkCanvas(W * P, H * P), octx = off.getContext('2d');
    octx.fillStyle = `rgb(${DOT_OFF.join(',')})`; octx.fillRect(0, 0, W * P, H * P);
    octx.globalCompositeOperation = 'destination-in'; octx.fillStyle = octx.createPattern(tile, 'repeat'); octx.fillRect(0, 0, W * P, H * P);
    bctx.imageSmoothingEnabled = true; bctx.imageSmoothingQuality = 'high';
    bctx.drawImage(off, this.dx, this.dy, this.dw, this.dh);
    this.ctx.imageSmoothingQuality = 'high';
    this.hctx.imageSmoothingQuality = 'high';
    this.dirty = true;
  }

  setMode(mode) {
    if (mode === this.mode && !(this.ev && this.ev.def.hold)) return;
    if (mode === 'attract' && this.score > 0 && this.mode === 'play') this.lastScore = this.score;
    this.mode = mode;
    this.ev = null; this.queue.length = 0; this.talk = null; this.mg = null; this.parts.length = 0;
    this.att = { i: 0, t: 0, pages: null };
    this.disp = this.score; this.reveal = REVEAL; this.dirty = true;
  }

  setScore(score) {
    score = Math.max(0, Math.floor(score || 0));
    if (score < this.score) this.disp = score;
    else if (score > this.score) this.pulse = 1;
    this.score = score;
  }

  setInfo(info) { Object.assign(this.info, info || {}); }

  setHiscores(list) {
    this.hiscores = (list || []).slice(0, 5).map(e => ({ name: up(e.name || '???').slice(0, 6), score: Math.max(0, Math.floor(e.score || 0)) }));
  }

  show(kind, data = {}) {
    data = data || {};
    let def = EV[kind];
    if (!def) { def = EV.banner; data = { title: data.title || String(kind).toUpperCase(), sub: data.sub, color: data.color }; kind = 'banner'; }
    const e = { kind, def, data, t: 0, pt: -1, dur: def.dur, pri: def.pri, wait: 0, col: data.color || def.col || PALETTE[0], seed: (Math.random() * 1e9) | 0, memo: {} };
    if (kind === '_null') e.dur = Math.min(4.6, Math.max(2.2, 1.6 + String(data.text || '').length * 0.045));
    // sous-titre long : laisser le temps de le faire défiler en entier
    if (data.sub) {
      const over = measure(String(data.sub).toUpperCase(), F_S) - W;
      if (over > 0) e.dur = Math.min(7, Math.max(e.dur, 2.4 + over / 34));
    }
    if (kind === 'gameOver') this.lastScore = Math.max(0, Math.floor(data.score ?? this.score));
    const cur = this.ev;
    if (cur && cur.kind === kind && def.merge) { cur.data = data; cur.t = Math.min(cur.t, 0.45); cur.bumpT = cur.t; return; }
    if (!cur || e.pri > cur.pri) { this._start(e); return; }
    let i = this.queue.findIndex(q => q.pri < e.pri);
    if (i < 0) i = this.queue.length;
    this.queue.splice(i, 0, e);
    if (this.queue.length > 5) this.queue.length = 5;
  }

  say(text, persona = 'lumen') {
    const s = up(text).replace(/\s+/g, ' ').trim();
    if (!s) { this.talk = null; return; }
    const isNull = persona === 'null';
    // NULL hors minijeu : prise de contrôle plein écran ; en minijeu, ligne glitchée (le chrono reste visible)
    if (isNull && !this.mg) { this.show('_null', { text: s }); return; }
    if (isNull && !this.reduced) this.glitchT = 0.25;
    const w = measure(s, F_S), room = 92, scroll = Math.max(0, w - room), sp = Math.max(42, scroll / 5);
    const dur = scroll ? 1 + scroll / sp + 1.4 : Math.min(5, Math.max(2.6, 1.2 + s.length * 0.06));
    this.talk = { s, w, t: 0, wait: 0, dur, sp, persona: isNull ? 'null' : 'lumen' };
  }

  setMinigame(info) {
    if (!!info !== !!this.mg) this.reveal = REVEAL;
    this.mg = info || null;
    if (info) this._ink(K_MG, info.color || PALETTE[K_MG]);
  }

  update(dt) {
    dt = Math.min(0.1, Math.max(0, dt || 0));
    this.t += dt;
    if (this.disp < this.score) { const d = this.score - this.disp; this.disp = Math.min(this.score, this.disp + Math.max(1, Math.ceil(d * Math.min(1, dt * 7)))); }
    else this.disp = this.score;
    this.pulse = Math.max(0, this.pulse - dt * 3);
    this.reveal = Math.max(0, this.reveal - dt);
    this.glitchT = Math.max(0, this.glitchT - dt);
    // événement en cours (accéléré si d'autres attendent)
    const e = this.ev;
    if (e) {
      e.pt = e.t; e.t += dt * (this.queue.length && !e.def.hold ? 1.5 : 1);
      if (TICK[e.kind]) TICK[e.kind](this, e, dt);
      if (e.t >= e.dur && !e.def.hold) this._next();
    } else if (this.queue.length) this._next();
    if (this.queue.length) {
      for (const q of this.queue) q.wait += dt;
      if (this.queue.some(q => q.wait > MAX_WAIT[q.pri])) this.queue = this.queue.filter(q => q.wait <= MAX_WAIT[q.pri]);
    }
    // message LUMEN/NULL : suspendu pendant les animations plein écran
    const tk = this.talk;
    if (tk) {
      if (this.ev) tk.wait += dt; else tk.t += dt;
      if (tk.t >= tk.dur || tk.wait > 8) this.talk = null;
    }
    // particules
    const ps = this.parts;
    for (let i = ps.length - 1; i >= 0; i--) {
      const p = ps[i];
      p.t += dt;
      if (p.t >= p.life) { ps[i] = ps[ps.length - 1]; ps.pop(); continue; }
      p.vy += p.g * dt; p.x += p.vx * dt; p.y += p.vy * dt;
    }
    // boucle d'attente
    if (this.mode === 'attract' && !this.ev) {
      const a = this.att;
      if (!a.pages) a.pages = this._pages();
      a.t += dt;
      const id = a.pages[a.i];
      if (id === 'press' || id === 'scores') this.twinkle(dt * 5, K_BASE);
      if (a.t >= this._pageDur(id)) { a.i = (a.i + 1) % a.pages.length; a.t = 0; if (a.i === 0) a.pages = this._pages(); }
    }
  }

  draw() {
    if (!this.canvas.width) return;
    const f = this.f;
    this._compose();
    const v = this.v32;
    if (!this.dirty && same(v[0], v[1]) && same(v[2], v[3])) return;
    this.dirty = false; this.pb.set(f.b); this.pc.set(f.c);
    const u = this.u32, lut = this.lut, b = f.b, c = f.c;
    for (let i = 0; i < N; i++) u[i] = lut[(c[i] << 4) | b[i]];
    this.sctx.putImageData(this.img, 0, 0);
    // points ronds : agrandissement sans lissage puis masque
    const g = this.gctx, bw = this.big.width, bh = this.big.height;
    g.globalCompositeOperation = 'copy'; g.imageSmoothingEnabled = false;
    g.drawImage(this.small, 0, 0, bw, bh);
    g.globalCompositeOperation = 'destination-in'; g.fillStyle = this.dotPat;
    g.fillRect(0, 0, bw, bh);
    const x = this.ctx;
    x.globalCompositeOperation = 'copy'; x.globalAlpha = 1;
    x.drawImage(this.base, 0, 0);
    x.globalCompositeOperation = 'source-over'; x.imageSmoothingEnabled = true;
    x.drawImage(this.big, this.dx, this.dy, this.dw, this.dh);
    // halo : image 128×32 lissée, puis version 32×8 plus diffuse
    x.globalCompositeOperation = 'lighter';
    x.globalAlpha = 0.3; x.drawImage(this.small, this.dx, this.dy, this.dw, this.dh);
    this.hctx.globalCompositeOperation = 'copy'; this.hctx.drawImage(this.small, 0, 0, 32, 8);
    x.globalAlpha = 0.2; x.drawImage(this.halo, this.dx, this.dy, this.dw, this.dh);
    x.globalAlpha = 1; x.globalCompositeOperation = 'source-over';
  }

  // ------------------------------------------------------------ interne
  _ink(slot, hex) {
    if (this.pal[slot] === hex) return;
    this.pal[slot] = hex;
    const [r, g, b] = hexRgb(hex), [or, og, ob] = DOT_OFF;
    for (let l = 0; l < 16; l++) {
      const k = Math.pow(l / 15, 1.35);
      const R = Math.round(or + (r - or) * k), G = Math.round(og + (g - og) * k), B = Math.round(ob + (b - ob) * k);
      this.lut[slot * 16 + l] = l ? ((255 << 24) | (B << 16) | (G << 8) | R) >>> 0 : 0;
    }
    this.dirty = true;
  }

  _start(e) {
    if (e.kind === '_null') e.memo.snap = { b: this.pb.slice(), c: this.pc.slice() };
    e.t = 0; e.pt = -1; this.ev = e; this.dirty = true;
  }

  _next() {
    const e = this.queue.shift();
    if (e) this._start(e);
    else { this.ev = null; this.reveal = REVEAL; }
  }

  burst(x, y, n, sp, k, life = 1, g = 0) {
    n = Math.round(n * (this.reduced ? 0.35 : 1));
    for (let i = 0; i < n && this.parts.length < MAX_PARTS; i++) {
      const a = Math.random() * TAU, s = sp * (0.3 + Math.random() * 0.7);
      this.parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s * 0.55, g, life: life * (0.5 + Math.random() * 0.5), t: 0, k, star: Math.random() < 0.25 });
    }
  }

  twinkle(rate, k) {
    rate *= this.reduced ? 0.35 : 1;
    let n = Math.floor(rate) + (Math.random() < rate % 1 ? 1 : 0);
    while (n-- > 0 && this.parts.length < MAX_PARTS) this.parts.push({ x: Math.random() * W, y: Math.random() * H, vx: 0, vy: 0, g: 0, life: 0.3 + Math.random() * 0.3, t: 0, k, star: true });
  }

  _compose() {
    const f = this.f, e = this.ev;
    f.clear(); f.unclip(); f.grad = 0;
    if (e) {
      this._ink(K_EV, e.col);
      DRAW[e.kind](f, e, e.def.hold ? e.t : Math.min(e.t, e.dur), this);
      f.unclip(); f.grad = 0;
      if (!e.def.hold && e.t > e.dur - OUT) OUTS[e.def.out || 'dissolve'](f, clamp01((e.dur - e.t) / OUT));
    } else {
      if (this.mode === 'attract') this._attract(f);
      else if (this.mg) this._minigame(f);
      else this._play(f);
      f.unclip(); f.grad = 0;
      if (this.reveal > 0) {
        const p = 1 - this.reveal / REVEAL;
        f.wipe(p); f.vline(Math.round(p * W), 0, H - 1, 9, K_HOT);
      }
    }
    // particules
    for (const p of this.parts) {
      const a = 1 - p.t / p.life, l = Math.round(15 * Math.sqrt(a));
      f.put(p.x, p.y, l, p.k);
      if (p.star && a > 0.45) { const s = l - 6; f.put(p.x - 1, p.y, s, p.k); f.put(p.x + 1, p.y, s, p.k); f.put(p.x, p.y - 1, s, p.k); f.put(p.x, p.y + 1, s, p.k); }
    }
    // micro-coupure NULL (en minijeu)
    if (this.glitchT > 0) {
      const k = Math.floor(this.t * 40);
      for (let y = 0; y < H; y++) if (hash(y * 7 + k * 131) < 0.3) f.shiftRow(y, Math.round((hash(y + k * 17) - 0.5) * 16));
      f.noise(0.05, 10, K_NULL);
    }
  }

  // ------- écran de jeu : score + ligne d'informations (ou message de LUMEN)
  _play(f) {
    const s = fmt(this.disp), lv = 13 + Math.round(2 * this.pulse);
    const w = measure(s, F_B);
    if (w <= 126) { f.grad = 3; f.text(s, (W - w) >> 1, 1, F_B, lv, K_BASE); f.grad = 0; }
    else f.textC(s, 6, F_M, lv, K_BASE);
    const gt = this.t % 7;
    if (gt < 0.8 && !this.reduced) f.shine(gt * 220 - 20, 3, K_HOT);
    if (this.talk) this._talk(f, 24, W);
    else this._info(f, 24);
  }

  _info(f, y) {
    const i = this.info, key = [i.ball, i.balls, i.level, i.mult, i.bonusX].join('|');
    if (key !== this.infoKey) {
      this.infoKey = key;
      const parts = (bx) => [
        i.ball != null ? `BILLE ${i.ball}` : i.balls != null ? `BILLES ${i.balls}` : null,
        i.level != null ? `NIV ${i.level}` : null,
        i.mult > 1 ? `×${i.mult}` : null,
        i.bonusX > 1 ? (bx ? `BONUS ×${i.bonusX}` : `B×${i.bonusX}`) : null,
      ].filter(Boolean);
      const tiers = [parts(true).join(' · '), parts(false).join(' · '), parts(false).join('  ')];
      this.infoStr = tiers.find(s => measure(s, F_S) <= W - 2) || tiers[2];
    }
    f.marquee(this.infoStr, 0, y, W, F_S, 10, K_BASE, this.t);
  }

  // message défilant : œil de LUMEN (cyan) ou bloc corrompu de NULL (rouge)
  _talk(f, y, w) {
    const tk = this.talk, isNull = tk.persona === 'null', k = isNull ? K_NULL : K_LUMEN, room = w - 9;
    if (isNull) { for (let j = 0; j < 5; j++) for (let i = 0; i < 6; i++) if (hash(i + j * 7 + Math.floor(this.t * 12) * 53) > 0.45) f.put(i, y + 1 + j, 12, k); }
    else drawEye(f, 0, y + 1, k, (this.t % 3.2) > 3.05 ? 0 : 1);
    const sx0 = f.x0, sx1 = f.x1;
    f.x0 = 9; f.x1 = Math.min(W, 9 + room);
    if (tk.w <= room) {
      const n = Math.floor(tk.t * 45), len = [...tk.s].length;
      const x1 = f.text(tk.s, 9, y, F_S, 14, k, n);
      if (n < len && Math.floor(this.t * 10) % 2) f.rect(9 + x1 + 2, y, 2, 7, 12, k);
    } else {
      const off = Math.round(Math.min(tk.w - room, Math.max(0, (tk.t - 1) * tk.sp)));
      f.text(tk.s, 9 - off, y, F_S, 14, k);
    }
    f.x0 = sx0; f.x1 = sx1;
    if (isNull && !this.reduced && hash(Math.floor(this.t * 12) + 5) > 0.84) for (let j = 0; j < 7; j++) if (hash(j + Math.floor(this.t * 30)) > 0.65) f.shiftRow(y + j, hash(j * 3 + Math.floor(this.t * 30)) > 0.5 ? 2 : -2, 9, w);
  }

  // ------- écran de minijeu : titre, chrono, progression, barre de temps
  _minigame(f) {
    const m = this.mg, k = K_MG, tl = Math.max(0, m.timeLeft || 0), lim = m.timeLimit || 0;
    const hurry = lim > 0 && tl < 10, blink = Math.floor(this.t * 4) % 2;
    f.marquee(m.title || '', 0, 2, W, F_S, 15, k, this.t, 30, 'l');
    let tw = 0;
    if (lim > 0) {
      const s = String(Math.ceil(tl));
      tw = measure(s, F_M) + 7;
      f.text(s, W - tw, 11, F_M, hurry && blink ? 8 : 15, hurry ? K_NULL : k);
      f.text('S', W - 5, 15, F_S, 9, K_BASE);
      f.box(0, 25, W, 6, 4, K_BASE);
      const lit = Math.ceil(31 * Math.min(1, tl / lim));
      for (let s2 = 0; s2 < lit; s2++) {
        const last = s2 === lit - 1, lv = hurry && blink ? 6 : last ? 10 + Math.round(5 * Math.abs(Math.sin(this.t * 6))) : 13;
        f.rect(2 + s2 * 4, 27, 3, 2, lv, hurry ? K_NULL : k);
      }
    }
    const room = W - tw - (tw ? 6 : 0);
    if (this.talk) this._talk(f, 13, room);
    else f.marquee(m.progress || '', 0, 13, room, F_S, 12, K_BASE, this.t, 30, 'l');
  }

  // ------- boucle d'attente (mode attract)
  _pages() {
    const p = ['logo', 'scores', 'press', 'lumen'];
    if (this.lastScore > 0) p.splice(3, 0, 'last');
    p.push('null');
    return p;
  }

  _pageDur(id) {
    if (id === 'scores') return 3.2 + Math.max(0, this.hiscores.length - 2) * 1.15;
    return { logo: 5, press: 3.6, last: 3.4, lumen: 3.6, null: 2.6 }[id] || 3;
  }

  _attract(f) {
    const a = this.att;
    if (!a.pages) a.pages = this._pages();
    const id = a.pages[a.i], t = a.t, R = this.reduced;
    if (id === 'logo') {
      const parts = [['LUMEN', K_LUMEN], ['//', K_BASE], ['NULL', K_NULL]];
      const ws = parts.map(([s]) => measure(s, F_M)), tw = ws.reduce((s, v) => s + v, 0) + 2 * (F_M.sp + 1);
      let x = (W - tw) >> 1, xn = 0;
      parts.forEach(([s, k], i) => { if (i === 2) xn = x; f.text(s, x, 3, F_M, 15, k); x += ws[i] + F_M.sp + 1; });
      if (!R && hash(Math.floor(t * 10) + 77) > 0.72) for (let y = 3; y < 14; y++) if (hash(y + Math.floor(t * 30)) > 0.5) f.shiftRow(y, Math.round((hash(y * 5 + Math.floor(t * 30)) - 0.5) * 6), xn - 2, W);
      f.textC('STATION CORTEX-9', 21, F_S, 12, K_BASE, Math.floor((t - 0.5) * 20));
      f.corners(5, K_BASE);
      const sx = ((t - 1) % 2.6) * 70 - 10;
      if (t > 1 && sx < W + 4) f.sweep(sx, 1, K_HOT);
    } else if (id === 'scores') {
      f.textC('MEILLEURS SCORES', 1, F_S, 15, K_GOLD);
      for (let x = 2; x < W - 2; x += 2) f.put(x, 10, 4, K_GOLD);
      const list = this.hiscores;
      if (!list.length) { f.textC('AUCUN RECORD', 14, F_S, 13, K_BASE); f.textC('À VOUS DE JOUER', 24, F_S, 12, K_LUMEN); }
      else {
        const scroll = Math.round(Math.min(Math.max(0, (t - 1.4) * 9), Math.max(0, (list.length - 2) * 10)));
        f.clip(0, 12, W, H);
        list.forEach((h, i) => {
          const y = 14 + i * 10 - scroll, k = i === 0 ? K_GOLD : K_BASE, s = fmt(h.score), x1 = f.text(`${i + 1}. ${h.name}`, 2, y, F_S, 14, k), xs = 126 - measure(s, F_S);
          for (let x = x1 + 5; x < xs - 3; x += 2) f.put(x, y + 6, 3, k);
          f.text(s, xs, y, F_S, 14, k);
        });
        f.unclip();
      }
    } else if (id === 'press') {
      f.textC('INSÉREZ UN NOYAU', 3, F_S, 12, K_BASE);
      const w = measure('JOUER', F_M), x = (W - w) >> 1, o = Math.round(Math.sin(t * 6) * 2);
      if (t % 0.9 < 0.65) f.text('JOUER', x, 16, F_M, 15, K_HOT);
      f.text('►', x - 12 + o, 18, F_S, 14, K_BASE); f.text('◄', x + w + 8 - o, 18, F_S, 14, K_BASE);
    } else if (id === 'last') {
      f.textC('DERNIÈRE PARTIE', 1, F_S, 12, K_BASE);
      const s = fmt(this.lastScore), big = measure(s, F_B) <= 126;
      f.grad = big ? 3 : 0; f.textC(s, big ? 11 : 15, big ? F_B : F_M, 15, K_BASE); f.grad = 0;
    } else if (id === 'lumen') {
      const open = (t % 2.4) > 2.25 ? 0.1 : 1, px = 16 + Math.sin(t * 1.7) * 5;
      for (let x = -13; x <= 13; x++) {
        const hh = 7 * (1 - (x / 13) ** 2) * open;
        f.put(16 + x, 16 - hh, 13, K_LUMEN); f.put(16 + x, 16 + hh, 13, K_LUMEN);
        for (let y = -Math.floor(hh) + 1; y < hh; y++) {
          const d = Math.hypot(16 + x - px, y);
          if (d < 4.6) f.put(16 + x, 16 + y, d < 1.8 ? 15 : d < 3.2 ? 6 : 10, d < 1.8 ? K_HOT : K_LUMEN);
        }
      }
      f.text('LUMEN', 38, 4, F_M, 15, K_LUMEN);
      const n = Math.floor((t - 0.4) * 18), x1 = f.text('IA DE BORD', 38, 21, F_S, 12, K_LUMEN, n);
      if (Math.floor(t * 3) % 2) f.rect(38 + x1 + 2, 27, 4, 1, 12, K_LUMEN);
    } else if (id === 'null') {
      if (R || t > 1.2) { f.textC('LA STATION', 3, F_S, 13, K_NULL); f.textC('M\'APPARTIENT', 16, F_M, 15, K_NULL); }
      else f.textZ('NULL', 64, 16, F_M, 2, 15, K_NULL);
      if (!R) {
        f.noise(0.02, 6, K_NULL);
        const k = Math.floor(t * 14);
        if (hash(k + 999) > 0.55) for (let y = 0; y < H; y++) if (hash(y + k * 37) > 0.7) f.shiftRow(y, Math.round((hash(y * 9 + k) - 0.5) * 12));
      }
    }
    // entrée de page
    if (t < 0.3) { const p = ph(t, 0, 0.3), v = a.i % 3; if (v === 0) f.wipe(p); else if (v === 1) f.blinds(p); else f.dissolve(p); }
  }
}

function same(a, b) {
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}
