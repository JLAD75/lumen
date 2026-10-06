// Post-traitement plein écran du canvas principal, appliqué après la scène :
// bloom bon marché, finition CRT (balayage, grain, vignette), salves de glitch,
// impulsions néon. Uniquement drawImage, motifs, dégradés et modes de fusion :
// ni ctx.filter ni lecture de pixels par image (compatible Safari et iframe isolée).
// Coût maîtrisé : toutes les lectures du canvas précèdent la première écriture
// (une seule copie interne), une seule recomposition pleine résolution pour le bloom,
// vignette et lueurs de bord en dégradés (pas d'échantillonnage de texture).
// API : new PostFX(settings) · resize(W, H, dpr) · apply(ctx, canvas, dt, { rect, mood, intensity, part })
//       part : 'content' (bloom + glitch, lit le canvas) · 'overlay' (bords, CRT, vignette, sans lecture,
//       utilisable sur un calque transparent) · absent = les deux.
//       glitch(force, durée) · pulse(couleur, force) · quality (-1..2) · auto · setFps(fps)
//       quality -1 : dernier recours d'un appareil trop lent, sans bloom ni lecture du canvas
//       (glitch réduit à une teinte).

function mk(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h));
  return c;
}

function buf(w, h) { const c = mk(w, h); return { c, g: c.getContext('2d') }; }

function smooth(g, q) { g.imageSmoothingEnabled = true; if ('imageSmoothingQuality' in g) g.imageSmoothingQuality = q; }

function rgb(hex) {
  const v = parseInt(hex.slice(1), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}

function mix(a, b, t) { const x = rgb(a), y = rgb(b); return x.map((v, i) => Math.round(v + (y[i] - v) * t)); }

const GLITCH_COLS = ['#29e3ff', '#ff3df2', '#ff4060', '#a070ff', '#ffffff'];

export class PostFX {
  constructor(settings) {
    this.settings = settings || {};
    this.W = 1; this.H = 1; this.dpr = 1; this.cw = 1; this.ch = 1;
    const coarse = typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches;
    this.maxQuality = coarse ? 1 : 2;   // plafond matériel présumé
    this._q = this.maxQuality;
    this.auto = true;                   // ajustement automatique selon setFps()
    this.allowOff = false;              // le rendu autorise le cran -1 (sa résolution est au plancher)
    this.fps = 60; this.lowT = 0; this.highT = 0; this.raisedAt = -99; this.ceil = 2;
    this.t = 0;
    this.hot = 0; this.nul = 0;         // humeurs lissées
    this.gT = 0; this.gDur = 0.35; this.gK = 0; this.roll = 0; this.microT = 3; this.splitD = 3;
    this.slices = []; this.blocks = []; this.bars = [];
    this.boost = 0;
    this.pulses = [];
    this.grainT = 0; this.gx = 0; this.gy = 0;
    this.ms = 0;                        // coût CPU moyen d'apply (ms)
    this._reset();
  }

  get quality() { return this._q; }
  set quality(q) {
    q = Math.max(-1, Math.min(2, Math.round(q)));
    if (q !== this._q) { this._q = q; this.B = null; this.T = null; }
  }

  // fréquence d'images mesurée par l'appelant (moyenne lissée)
  setFps(fps) { this.fps = fps; }

  resize(W, H, dpr) {
    this.W = W; this.H = H; this.dpr = dpr;
    this.cw = Math.max(1, Math.round(W * dpr)); this.ch = Math.max(1, Math.round(H * dpr));
    this._reset();
  }

  _reset() {
    this.B = null; this.T = null; this.S = null; this.crt = null; this.pat = null;
    this.frm = null; this.frmKey = ''; this.frames = new Map(); this.noise = null;
  }

  glitch(strength = 1, dur = 0.35) {
    const cur = this.gT > 0 ? this.gK * this._env() : 0;
    this.gK = Math.max(cur, strength);
    this.gT = Math.max(this.gT, dur); this.gDur = this.gT;
    this.roll = 0;
  }

  pulse(color = '#29e3ff', strength = 1) {
    this.pulses.push({ color, k: strength, t: 0, life: 0.5 + 0.3 * Math.min(1, strength) });
    if (this.pulses.length > 4) this.pulses.shift();
    this.boost = Math.max(this.boost, 0.5 * strength);
  }

  // enveloppe du glitch : attaque franche, palier, extinction rapide
  _env() { const u = this.gT / this.gDur; return u > 0.6 ? 1 : u / 0.6; }

  // qualité effective (les très grands canvas plafonnent à 1)
  _eq() { return Math.min(this._q, this.cw * this.ch > 4.2e6 ? 1 : 2); }

  _auto(dt) {
    if (!this.auto || dt > 0.25) return;
    const f = this.fps;
    if (f < 47) { this.lowT += dt; this.highT = 0; } else if (f > 57) { this.highT += dt; this.lowT = 0; } else { this.lowT = 0; this.highT = 0; }
    if (this.lowT > 2.5 && this._q > (this.allowOff ? -1 : 0)) {
      if (this.t - this.raisedAt < 8) this.ceil = this._q - 1;   // la hausse précédente n'a pas tenu
      this.quality = this._q - 1; this.lowT = 0;
    } else if (this.highT > 15 && this._q < Math.min(this.ceil, this.maxQuality)) {
      this.quality = this._q + 1; this.highT = 0; this.raisedAt = this.t;
    }
  }

  apply(ctx, canvas, dt, info) {
    const t0 = performance.now();
    dt = Math.min(0.1, Math.max(0, dt || 0));
    if (canvas.width !== this.cw || canvas.height !== this.ch) this.resize(canvas.width / this.dpr, canvas.height / this.dpr, this.dpr);
    this.t += dt;
    if (!(info && info.noAuto)) this._auto(dt);
    const st = this.settings, rfx = !!st.reducedFx, rm = !!st.reducedMotion;
    const mood = (info && info.mood) || 'calm';
    const inten = Math.max(0, Math.min(1, (info && info.intensity) || 0));
    const rect = (info && info.rect) || null;
    const part = (info && info.part) || 'all';
    const doContent = part !== 'overlay', doOverlay = part !== 'content';
    const ease = Math.min(1, dt * 3);
    this.hot += ((mood === 'hot' ? 1 : 0) - this.hot) * ease;
    this.nul += ((mood === 'null' ? 1 : 0) - this.nul) * ease;
    this.gT = Math.max(0, this.gT - dt);
    this.boost = Math.max(0, this.boost - dt * 1.6);
    for (let i = this.pulses.length - 1; i >= 0; i--) { const p = this.pulses[i]; p.t += dt; if (p.t >= p.life) this.pulses.splice(i, 1); }
    // micro-glitchs quand NULL a pris la main
    if (this.nul > 0.5 && !rfx && !rm) {
      this.microT -= dt;
      if (this.microT <= 0) { this.microT = 1.8 + Math.random() * 4; if (this.gT <= 0) this.glitch(0.12 + Math.random() * 0.14, 0.06 + Math.random() * 0.1); }
    }
    const q = this._eq();
    const gk = this.gT > 0 ? this.gK * this._env() : 0;
    if (gk > 0.01 && !rfx) this._roll(dt, gk, rm);
    const lite = q < 0;              // aucune lecture du canvas
    const slices = gk > 0.01 && !rfx && !rm && !lite && this.slices.length > 0;
    const ck = rfx || lite ? 0 : gk;
    const bk = (rfx ? 0.45 : 1) * (1 + 0.35 * this.hot + 0.25 * inten + this.boost + 0.15 * this.nul);

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';

    if (doContent) {
      // écritures limitées à la zone du plateau (info.clip, px du canvas) : un canvas
      // transparent ne doit pas recevoir de voile hors du plateau
      const clip = info && info.clip;
      if (clip) { ctx.save(); ctx.beginPath(); ctx.rect(clip.x, clip.y, clip.w, clip.h); ctx.clip(); }
      // 1) lectures du canvas, toutes avant la première écriture
      const bq = rfx ? 0 : q;
      const bloom = lite ? null : this._bloomRead(canvas, bq);
      if (slices) this._scratchRead(canvas);
      if (ck > 0.02) this._splitRead(canvas, q);
      // 2) écritures
      if (slices) this._slices(ctx);
      if (bloom) this._bloomWrite(ctx, bloom, bq, bk);
      if (ck > 0.02) {
        const d = rm ? 2.5 * ck : this.splitD * (0.6 + ck);
        this._split(ctx, Math.max(1, Math.round(d * this.dpr)), Math.min(0.55, 0.2 + 0.4 * ck));
      }
      if (gk > 0.01) { if (rfx || rm || lite) this._tint(ctx, gk); else this._blocks(ctx, gk); }
      if (clip) ctx.restore();
    }
    if (doOverlay) {
      this._edgesFx(ctx, rect, inten, rfx);
      if (q > 0) this._crtFx(ctx, dt, rfx, rm, q);
      this._vignette(ctx, rect);
    }

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    smooth(ctx, 'low');
    this.ms = this.ms * 0.92 + (performance.now() - t0) * 0.08;
  }

  // ------------------------------------------------------------ bloom
  // tampons en px CSS (½, ¼, ⅛ de l'écran) : le rayon du halo ne dépend pas du dpr
  _bufs(q) {
    if (this.B && this.B.q === q) return this.B;
    const W = this.W, H = this.H, B = { q };
    // première réduction exacte 2×2 (px physiques → ½), sans mipmaps coûteuses
    B.h = buf(this.cw / 2, this.ch / 2);
    if (q >= 2) B.a = this.dpr > 1.2 ? buf(W / 2, H / 2) : B.h;   // au dpr 1, ½ physique = ½ écran
    B.b = buf(W / 4, H / 4); B.bt = buf(W / 4, H / 4);
    B.c = buf(W / 8, H / 8); B.ct = buf(W / 8, H / 8);
    this.B = B;
    return B;
  }

  // flou de Kawase : 4 échantillons diagonaux bilinéaires, somme pondérée (w = 0.25 → moyenne)
  _kawase(src, dst, o, w = 0.25) {
    const g = dst.g, cw = dst.c.width, ch = dst.c.height;
    g.globalCompositeOperation = 'source-over';
    g.globalAlpha = 1;
    g.clearRect(0, 0, cw, ch);
    g.globalCompositeOperation = 'lighter';
    g.globalAlpha = w;
    smooth(g, 'low');
    g.drawImage(src.c, -o, -o, cw, ch); g.drawImage(src.c, o, -o, cw, ch);
    g.drawImage(src.c, -o, o, cw, ch); g.drawImage(src.c, o, o, cw, ch);
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
    return dst;
  }

  _down(src, dst) {
    const g = dst.g;
    g.globalCompositeOperation = 'copy'; g.globalAlpha = 1;
    smooth(g, 'low');
    g.drawImage(src.c, 0, 0, dst.c.width, dst.c.height);
    g.globalCompositeOperation = 'source-over';
  }

  // réduction + seuil + flou ; renvoie le tampon unique à recomposer (halo serré + large)
  _bloomRead(canvas, q) {
    const B = this._bufs(q);
    // réductions successives par 2 (filtre boîte exact, pas de scintillement des traits fins)
    const hg = B.h.g;
    hg.globalCompositeOperation = 'copy'; hg.globalAlpha = 1;
    smooth(hg, 'low');
    hg.drawImage(canvas, 0, 0, B.h.c.width, B.h.c.height);
    // descente jusqu'au niveau du seuil : ½ écran en qualité 2, ¼ en 1, ⅛ en 0
    // (un niveau déjà atteint par la première réduction physique est sauté)
    const levels = [B.a, B.b, B.c].filter(Boolean);
    const target = q >= 2 ? B.a : q >= 1 ? B.b : B.c;
    let src = B.h, i = 0;
    while (i < levels.length) {
      const nx = levels[i++];
      if (src.c.width > nx.c.width * 1.2) { this._down(src, nx); src = nx; }
      if (nx === target) break;
    }
    const g = src.g, fw = src.c.width, fh = src.c.height;
    // seuil doux : color-burn par un gris s donne max(0, 1 - (1 - x) / s) → ne garde que le néon
    const s = Math.round(255 * Math.min(0.78, 0.6 + 0.08 * this.hot + 0.06 * this.boost));
    g.globalCompositeOperation = 'color-burn';
    g.fillStyle = `rgb(${s},${s},${s})`;
    g.fillRect(0, 0, fw, fh);
    g.globalCompositeOperation = 'source-over';
    while (i < levels.length) { const nx = levels[i++]; this._down(src, nx); src = nx; }
    // halo large : ⅛ flouté (2 passes en qualité 2)
    let wide = this._kawase(B.c, B.ct, 0.5);
    if (q >= 2) wide = this._kawase(B.ct, B.c, 1.5);
    if (q < 1) return wide;
    // halo serré (¼, poids 0,6) + halo large agrandi dans le même tampon
    const out = this._kawase(B.b, B.bt, 0.5, 0.15);
    out.g.globalCompositeOperation = 'lighter';
    smooth(out.g, 'low');
    out.g.drawImage(wide.c, 0, 0, out.c.width, out.c.height);
    out.g.globalCompositeOperation = 'source-over';
    return out;
  }

  // recomposition en « screen » : enrichit le néon sans délaver les zones claires
  _bloomWrite(ctx, b, q, k) {
    if (k <= 0.01) return;
    ctx.globalCompositeOperation = 'screen';
    ctx.globalAlpha = Math.min(1, (q >= 1 ? 0.72 : 0.85) * k);
    smooth(ctx, 'low');
    ctx.drawImage(b.c, 0, 0, this.cw, this.ch);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  // ------------------------------------------------------------ glitch
  _scratchRead(canvas) {
    if (!this.S || this.S.c.width !== this.cw || this.S.c.height !== this.ch) this.S = buf(this.cw, this.ch);
    this.S.g.globalCompositeOperation = 'copy';
    this.S.g.drawImage(canvas, 0, 0);
  }

  // nouveau tirage des bandes et blocs, ~25 fois par seconde (saccades irrégulières)
  _roll(dt, k, rm) {
    this.roll -= dt;
    if (this.roll > 0) return;
    this.roll = 0.03 + Math.random() * 0.05;
    const cw = this.cw, ch = this.ch, d = this.dpr, R = Math.random;
    this.splitD = 2 + R() * 9 * k;
    this.slices.length = 0; this.blocks.length = 0; this.bars.length = 0;
    if (rm) return;
    const ns = 1 + Math.round(R() * (2 + 7 * k));
    for (let i = 0; i < ns; i++) {
      const h = Math.max(2, Math.round((2 + R() * R() * 60 * (0.4 + k)) * d));
      const y = Math.round(R() * (ch - h));
      const dx = Math.round((R() * 2 - 1) * (6 + 70 * k * R()) * d);
      this.slices.push({ y, h, dx, smear: R() < 0.22 ? Math.round(R() * cw) : -1, sw: Math.round((40 + R() * 240) * d) });
    }
    const nb = Math.round(R() * 6 * k);
    for (let i = 0; i < nb; i++) {
      const w = Math.round((8 + R() * 140 * k) * d), h = Math.round((3 + R() * 24) * d);
      const r = R();
      this.blocks.push({ x: Math.round(R() * (cw - w)), y: Math.round(R() * (ch - h)), w, h, mode: r < 0.3 ? 'inv' : r < 0.65 ? 'noise' : 'neon', color: GLITCH_COLS[(R() * GLITCH_COLS.length) | 0] });
    }
    const nr = Math.round(R() * 3 * k);
    for (let i = 0; i < nr; i++) this.bars.push({ y: Math.round(R() * ch), h: Math.max(1, Math.round((1 + R() * 2.5) * d)), color: GLITCH_COLS[(R() * 3) | 0], a: 0.25 + R() * 0.45 });
  }

  // bandes horizontales décalées et traînées de pixels, copiées depuis l'instantané
  _slices(ctx) {
    const S = this.S, cw = this.cw;
    smooth(ctx, 'low');
    for (const s of this.slices) {
      if (s.smear >= 0) {
        const x = Math.min(cw - 1, s.smear);
        ctx.drawImage(S.c, x, s.y, 1, s.h, x, s.y, s.sw, s.h);
      } else {
        ctx.drawImage(S.c, 0, s.y, cw, s.h, s.dx, s.y, cw, s.h);
      }
    }
  }

  // séparation RVB : canal rouge et canaux cyan extraits à demi-résolution (multiply sur petit tampon)
  _splitRead(canvas, q) {
    const k = q >= 2 ? 0.5 : 0.35;
    const w = Math.round(this.cw * k), h = Math.round(this.ch * k);
    if (!this.T || this.T.r.c.width !== w || this.T.r.c.height !== h) this.T = { r: buf(w, h), c: buf(w, h) };
    for (const [b, col] of [[this.T.r, '#ff0000'], [this.T.c, '#00ffff']]) {
      b.g.globalCompositeOperation = 'copy';
      smooth(b.g, 'low');
      b.g.drawImage(canvas, 0, 0, w, h);
      b.g.globalCompositeOperation = 'multiply';
      b.g.fillStyle = col; b.g.fillRect(0, 0, w, h);
    }
  }

  // on assombrit l'image de a (noir en source-over), puis on rajoute les canaux décalés
  _split(ctx, d, a) {
    const T = this.T, cw = this.cw, ch = this.ch;
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = a;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, cw, ch);
    ctx.globalCompositeOperation = 'lighter';
    smooth(ctx, 'low');
    ctx.drawImage(T.r.c, -d, 0, cw, ch);
    ctx.drawImage(T.c.c, d, 0, cw, ch);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  _noiseTile() {
    if (this.noise) return this.noise;
    const c = mk(48, 12), g = c.getContext('2d');
    for (let y = 0; y < 12; y++) for (let x = 0; x < 48; x++) {
      const r = Math.random();
      g.fillStyle = r < 0.45 ? '#000' : r < 0.6 ? '#ff3df2' : r < 0.75 ? '#29e3ff' : r < 0.85 ? '#fff' : '#3a2a6e';
      g.fillRect(x, y, 1, 1);
    }
    this.noise = c;
    return c;
  }

  // blocs de bruit numérique, aplats néon, inversions, barres de balayage
  _blocks(ctx, k) {
    const cw = this.cw;
    ctx.imageSmoothingEnabled = false;
    for (const b of this.blocks) {
      if (b.mode === 'inv') {
        ctx.globalCompositeOperation = 'difference'; ctx.globalAlpha = 1;
        ctx.fillStyle = '#ffffff'; ctx.fillRect(b.x, b.y, b.w, b.h);
      } else if (b.mode === 'noise') {
        ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.55;
        ctx.drawImage(this._noiseTile(), (Math.random() * 30) | 0, 0, 18, 12, b.x, b.y, b.w, b.h);
      } else {
        ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.4;
        ctx.fillStyle = b.color; ctx.fillRect(b.x, b.y, b.w, b.h);
      }
    }
    ctx.globalCompositeOperation = 'lighter';
    for (const b of this.bars) { ctx.globalAlpha = b.a * Math.min(1, k * 1.5); ctx.fillStyle = b.color; ctx.fillRect(0, b.y, cw, b.h); }
    // voile magenta/rouge discret
    ctx.globalAlpha = 0.07 * k; ctx.fillStyle = '#ff2a6d'; ctx.fillRect(0, 0, cw, this.ch);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.imageSmoothingEnabled = true;
  }

  // mode réduit : une simple teinte brève, sans scintillement
  _tint(ctx, k) {
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 0.16 * k;
    ctx.fillStyle = '#ff2a6d';
    ctx.fillRect(0, 0, this.cw, this.ch);
    ctx.globalAlpha = 1;
  }

  // ------------------------------------------------------------ bords néon
  // lueur le long des quatre bords de l'écran : quatre dégradés linéaires (aucune texture)
  _edge(ctx, color, a) {
    if (a <= 0.004) return;
    const cw = this.cw, ch = this.ch, e = Math.max(10, Math.min(cw, ch) * 0.1);
    const [r, g, b] = Array.isArray(color) ? color : rgb(color);
    const c0 = `rgba(${r},${g},${b},0.95)`, c1 = `rgba(${r},${g},${b},0.35)`, c2 = `rgba(${r},${g},${b},0)`;
    ctx.globalAlpha = Math.min(1, a);
    const side = (x0, y0, x1, y1, rx, ry, rw, rh) => {
      const gr = ctx.createLinearGradient(x0, y0, x1, y1);
      gr.addColorStop(0, c0); gr.addColorStop(0.22, c1); gr.addColorStop(1, c2);
      ctx.fillStyle = gr; ctx.fillRect(rx, ry, rw, rh);
    };
    side(0, 0, e, 0, 0, 0, e, ch); side(cw, 0, cw - e, 0, cw - e, 0, e, ch);
    side(0, 0, 0, e, e, 0, cw - 2 * e, e); side(0, ch, 0, ch - e, e, ch - e, cw - 2 * e, e);
  }

  // cadre lumineux autour du plateau (½ résolution, limité à son voisinage), teinté par couleur
  _frame(color, rect) {
    const key = rect.x + ',' + rect.y + ',' + rect.w + ',' + rect.h;
    if (key !== this.frmKey) { this.frmKey = key; this.frm = null; this.frames.clear(); }
    let f = this.frames.get(color);
    if (f) return f;
    if (!this.frm) {
      const M = 34, k = 0.5;
      const c = mk((rect.w + 2 * M) * k, (rect.h + 2 * M) * k), g = c.getContext('2d');
      g.setTransform(k, 0, 0, k, M * k, M * k);
      g.globalCompositeOperation = 'lighter';
      g.strokeStyle = '#fff';
      for (let i = 6; i >= 0; i--) {
        g.globalAlpha = i === 0 ? 0.9 : 0.16 / Math.sqrt(i);
        g.lineWidth = i === 0 ? 2.2 : 3 + i * 7;
        g.beginPath();
        if (g.roundRect) g.roundRect(-2, -2, rect.w + 4, rect.h + 4, 14); else g.rect(-2, -2, rect.w + 4, rect.h + 4);
        g.stroke();
      }
      this.frm = { c, M };
    }
    const c = mk(this.frm.c.width, this.frm.c.height), g = c.getContext('2d');
    g.drawImage(this.frm.c, 0, 0);
    g.globalCompositeOperation = 'source-in';
    g.fillStyle = color; g.fillRect(0, 0, c.width, c.height);
    f = { c, M: this.frm.M };
    if (this.frames.size > 8) this.frames.clear();
    this.frames.set(color, f);
    return f;
  }

  _edgesFx(ctx, rect, inten, rfx) {
    if (!this.pulses.length && this.hot <= 0.02 && this.nul <= 0.02) return;
    const d = this.dpr;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = 'lighter';
    const r = rfx ? 0.5 : 1;
    // humeur : chaud = cyan/magenta alternés, NULL = rouge pulsé et instable
    if (this.hot > 0.02) {
      const w = 0.5 + 0.5 * Math.sin(this.t * 1.7);
      const a = this.hot * (0.07 + 0.12 * inten) * r;
      this._edge(ctx, mix('#29e3ff', '#ff3df2', w), a);
    }
    if (this.nul > 0.02) {
      const fl = rfx ? 1 : (Math.random() < 0.06 ? 0.3 : 1);
      this._edge(ctx, '#ff2050', this.nul * (0.13 + 0.08 * Math.sin(this.t * 3.1)) * fl * r);
    }
    for (const p of this.pulses) {
      const u = p.t / p.life;
      const env = (p.t < 0.05 ? p.t / 0.05 : 1) * (1 - u) * (1 - u);
      const a = Math.min(1, p.k) * env * r;
      this._edge(ctx, p.color, a * 0.75);
      if (rect) {
        smooth(ctx, 'low');
        const fx = (rect.x - 34) * d, fy = (rect.y - 34) * d, fw = (rect.w + 68) * d, fh = (rect.h + 68) * d;
        // éclair chromatique : franges rouge et cyan décalées autour du cadre, au début de l'impulsion
        if (!rfx && p.t < 0.3) {
          const o = (2 + 4 * Math.min(1, p.k)) * d * (1 - p.t / 0.3);
          ctx.globalAlpha = a * 0.7;
          ctx.drawImage(this._frame('#ff2050', rect).c, fx - o, fy, fw, fh);
          ctx.drawImage(this._frame('#20e8ff', rect).c, fx + o, fy, fw, fh);
        }
        ctx.globalAlpha = a;
        ctx.drawImage(this._frame(p.color, rect).c, fx, fy, fw, fh);
      }
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  // ------------------------------------------------------------ CRT
  // tuile en px physiques : lignes de balayage (fixes) + grain (décalé à chaque tirage)
  _crtTile(grain) {
    const key = grain ? 'g' : 'n';
    if (this.crt && this.crt.key === key) return this.crt;
    const d = this.dpr;
    const P = Math.max(3, Math.min(6, Math.round(2.5 * d)));      // période des lignes
    const cell = Math.max(1, Math.round(d * 0.75));                // taille d'un grain
    const step = P * cell;
    const tw = 128 * cell, th = step * Math.max(1, Math.round(120 / step));
    const c = mk(tw, th), g = c.getContext('2d');
    const img = g.createImageData(tw, th), px = img.data;
    const A = 0.15, G = grain ? 0.06 : 0;
    const rows = [];
    for (let y = 0; y < th; y++) { const v = 0.5 + 0.5 * Math.cos((y % P) / P * Math.PI * 2); rows.push(A * v * v); }
    const gv = new Float32Array((tw / cell) * (th / cell));
    for (let i = 0; i < gv.length; i++) { const r = Math.random() * 2 - 1; gv[i] = r * r * r * G; }
    for (let y = 0; y < th; y++) for (let x = 0; x < tw; x++) {
      const s = rows[y], n = gv[((y / cell) | 0) * (tw / cell) + ((x / cell) | 0)];
      // composition exacte « noir s » puis « blanc n » (ou noir) en un seul pixel
      let a, col;
      if (n > 0) { a = 1 - (1 - s) * (1 - n); col = a > 0 ? n / a : 0; } else { a = 1 - (1 - s) * (1 + n); col = 0; }
      const i = (y * tw + x) * 4;
      px[i] = px[i + 1] = px[i + 2] = Math.round(col * 255); px[i + 3] = Math.round(a * 255);
    }
    g.putImageData(img, 0, 0);
    this.crt = { key, c, cell, step, tw, th };
    this.pat = null;
    return this.crt;
  }

  _crtFx(ctx, dt, rfx, rm, q) {
    const T = this._crtTile(!rfx);
    if (!this.pat || this.patCtx !== ctx) { this.pat = ctx.createPattern(T.c, 'repeat'); this.patCtx = ctx; }
    if (!rfx && !rm) {
      this.grainT -= dt;
      if (this.grainT <= 0) {
        this.grainT = 1 / 24;
        this.gx = ((Math.random() * T.tw / T.cell) | 0) * T.cell;
        this.gy = ((Math.random() * T.th / T.step) | 0) * T.step;
      }
    }
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    ctx.imageSmoothingEnabled = false;
    ctx.setTransform(1, 0, 0, 1, this.gx, this.gy);
    ctx.fillStyle = this.pat;
    ctx.fillRect(-this.gx, -this.gy, this.cw, this.ch);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.globalAlpha = 1;
  }

  // vignette elliptique centrée sur le plateau, appliquée seulement hors de la zone de jeu
  _vignette(ctx, rect) {
    const d = this.dpr, cw = this.cw, ch = this.ch;
    const cx = (rect ? rect.x + rect.w / 2 : this.W / 2) * d, cy = (rect ? rect.y + rect.h / 2 : this.H / 2) * d;
    const rx = Math.max(cx, cw - cx) * 1.05, ry = Math.max(cy, ch - cy) * 1.15;
    if (!this.vg || this.vgCtx !== ctx || this.vgKey !== cx + ',' + cy + ',' + cw + ',' + ch) {
      const gr = ctx.createRadialGradient(0, 0, 0, 0, 0, 1.45);
      gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(0.42, 'rgba(0,0,0,0)');
      gr.addColorStop(0.7, 'rgba(0,0,0,0.28)'); gr.addColorStop(1, 'rgba(0,0,0,0.62)');
      this.vg = gr; this.vgCtx = ctx; this.vgKey = cx + ',' + cy + ',' + cw + ',' + ch;
    }
    // quatre zones autour du plateau (qui reste intact : lisibilité)
    const m = 6 * d;
    let boxes;
    if (rect) {
      const x0 = Math.max(0, rect.x * d + m), x1 = Math.min(cw, (rect.x + rect.w) * d - m);
      const y0 = Math.max(0, rect.y * d + m), y1 = Math.min(ch, (rect.y + rect.h) * d - m);
      boxes = [[0, 0, x0, ch], [x1, 0, cw - x1, ch], [x0, 0, x1 - x0, y0], [x0, y1, x1 - x0, ch - y1]];
    } else boxes = [[0, 0, cw, ch]];
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    ctx.fillStyle = this.vg;
    ctx.setTransform(rx, 0, 0, ry, cx, cy);
    for (const [x, y, w, h] of boxes) if (w > 0 && h > 0) ctx.fillRect((x - cx) / rx, (y - cy) / ry, w / rx, h / ry);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }
}
