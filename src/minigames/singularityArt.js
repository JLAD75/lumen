// Rendu du minijeu SINGULARITÉ : chambre du réacteur effondré, grille de l'espace-temps
// déformée, disque d'accrétion incliné (lentille gravitationnelle), cellules en orbite,
// éclairs, étirement de la bille près de l'horizon, anneau de confinement, implosion.
// Tout ce qui est statique est dessiné une fois (drawStatic, mis en cache par le renderer) ;
// la grille déformée et les sprites du disque sont mis en cache par palier de croissance.
import { TAU, rgba, lerp, clamp, mulberry32 } from '../util/math.js';
import { chrome, paint, insertBase, insertLit, hazard, screw, circuits } from '../render/artKit.js';

const AMBER = '#ffae2a';
const HOT = '#ff6a2a';
const VIOLET = '#8b5cff';
const MAG = '#ff3df2';
const WHITE = '#ffffff';
const RED = '#ff3b3b';
const ICE = '#7fd7ff';
const N_INS = 12;                      // inserts de fronde autour du champ
const R_INS = 222;
const TILT = -0.2;                     // inclinaison du disque d'accrétion
// Géométrie partagée avec la logique (centre, rayons, orbites) : fournie par singularity.js
// au chargement, sans import circulaire (l'assemblage en un seul fichier ne les gère pas).
let SG = null, ORBITS = null;
export function bindGeometry(sg, orbits) { SG = sg; ORBITS = orbits; }

// projecteurs de confinement (calculés à la demande)
let EMIT = null;
function emitters() {
  if (!EMIT) EMIT = [-150, -90, -30, 30, 90, 150].map(d => {
    const a = d * Math.PI / 180;
    return { a, x: SG.cx + Math.cos(a) * 252, y: SG.cy + Math.sin(a) * 252 };
  });
  return EMIT;
}

// contour de la chambre (moitié haute jouable : dôme, murs, renflements)
function chamberPath(p) {
  p.moveTo(20, 712); p.lineTo(20, 700); p.lineTo(62, 600); p.lineTo(20, 500); p.lineTo(20, 300);
  p.arc(300, 300, 280, Math.PI, TAU - Math.acos(242 / 280));
  p.lineTo(542, 500); p.lineTo(500, 600); p.lineTo(542, 700); p.lineTo(542, 712); p.closePath();
  return p;
}

// sprite du disque d'accrétion : traînées incandescentes, chaudes au centre
function diskSprite(seed, hot) {
  const S = 256, c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  const rnd = mulberry32(seed);
  g.translate(S / 2, S / 2);
  g.globalCompositeOperation = 'lighter';
  g.lineCap = 'round';
  const cols = hot ? ['#fff4d0', '#ffd27a', AMBER, HOT] : [AMBER, HOT, '#ff3d6e', MAG, VIOLET];
  for (let i = 0; i < 150; i++) {
    const u = Math.pow(rnd(), hot ? 1.6 : 0.8);
    const r = (0.28 + 0.7 * u) * S / 2;
    const a0 = rnd() * TAU, span = 0.3 + rnd() * 1.4;
    const ci = Math.min(cols.length - 1, Math.floor(u * cols.length + rnd() * 0.8));
    g.strokeStyle = rgba(cols[ci], (0.05 + 0.2 * (1 - u)) * (hot ? 1.3 : 1));
    g.lineWidth = 1 + rnd() * (hot ? 3 : 5) * (1 - u * 0.5);
    g.beginPath(); g.arc(0, 0, r, a0, a0 + span); g.stroke();
  }
  const grd = g.createRadialGradient(0, 0, S * 0.12, 0, 0, S / 2);
  grd.addColorStop(0, rgba('#fff0c8', hot ? 0.5 : 0.25)); grd.addColorStop(0.35, rgba(AMBER, 0.18));
  grd.addColorStop(0.7, rgba('#ff3d6e', 0.07)); grd.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grd; g.beginPath(); g.arc(0, 0, S / 2, 0, TAU); g.fill();
  return c;
}

export class SingularityArt {
  constructor(mg) {
    this.mg = mg;
    this.t = 0;
    this.dust = [];
    this.zaps = [];
    this.pops = [];            // éclats de cellules récoltées (anneaux, étincelles orientées)
    this.ghosts = [];          // cellules dispersées qui rejaillissent du centre
    this.gulp = 0;             // le trou « avale » (pulsation)
    this.frondeT = 0;
    this.ringFlash = 0;
    this.grids = new Map();
    this.sprites = null;
    this.chamber = null;
    this.spin = 0;
  }

  // ------------------------------------------------------------ événements (appelés par la logique)
  collect(c) {
    this.pops.push({ x: c.x, y: c.y, color: c.o.color, t: 0, life: 0.45, big: c.o.value > 1 });
    if (this.pops.length > 12) this.pops.shift();
  }
  zap(a, c) {
    this.zaps.push({ x0: a.x, y0: a.y, x1: c.x, y1: c.y, color: c.o.color, t: 0, life: 0.35, seed: Math.random() * 100 });
    if (this.zaps.length > 10) this.zaps.shift();
  }
  disperse(c) {
    const a = Math.random() * TAU;
    this.ghosts.push({ t: 0, life: 0.6, a, tx: c ? c.x : SG.cx + Math.cos(a) * 150, ty: c ? c.y : SG.cy + Math.sin(a) * 150, cell: c });
    this.gulp = 1;
  }
  fronde() { this.frondeT = 1.4; }
  ringHit() { this.ringFlash = 1; this.gulp = 1; }
  implode() { this.gulp = 1; }

  update(dt) {
    const mg = this.mg;
    this.t += dt;
    this.spin += dt * (1.2 + 1.6 * mg.gVis + (mg.phase === 'outro' ? 10 * Math.min(1, mg.outroT) : 0));
    if (mg.capture) this.gulp = Math.max(this.gulp, 0.6);
    this.gulp = Math.max(0, this.gulp - dt * 1.6);
    this.frondeT = Math.max(0, this.frondeT - dt);
    this.ringFlash = Math.max(0, this.ringFlash - dt * 2);
    for (let i = this.zaps.length - 1; i >= 0; i--) { const z = this.zaps[i]; z.t += dt; if (z.t >= z.life) this.zaps.splice(i, 1); }
    for (let i = this.pops.length - 1; i >= 0; i--) { const p = this.pops[i]; p.t += dt; if (p.t >= p.life) this.pops.splice(i, 1); }
    for (let i = this.ghosts.length - 1; i >= 0; i--) { const p = this.ghosts[i]; p.t += dt; if (p.t >= p.life) this.ghosts.splice(i, 1); }
    for (const s of mg.shock) s.t += dt;
    for (let i = mg.shock.length - 1; i >= 0; i--) if (mg.shock[i].t >= mg.shock[i].life) mg.shock.splice(i, 1);
    // poussière d'accrétion : spirale vers l'horizon (vitesse képlérienne)
    const out = mg.phase === 'outro';
    const reduced = mg.game.settings && mg.game.settings.reducedFx;
    const max = (out ? 90 : 60) * (reduced ? 0.4 : 1);
    const rate = out ? 160 : 30 + 30 * mg.gVis;
    this.dustAcc = (this.dustAcc || 0) + dt * rate;
    while (this.dustAcc > 1) {
      this.dustAcc--;
      if (this.dust.length >= max) break;
      const a = Math.random() * TAU;
      this.dust.push({ a, r: 120 + Math.random() * 130, pa: a, pr: 0, hot: Math.random() < 0.3 });
    }
    const hr = mg.rH;
    for (let i = this.dust.length - 1; i >= 0; i--) {
      const d = this.dust[i];
      d.pa = d.a; d.pr = d.r;
      const w = 2200 / Math.pow(d.r, 1.25) * (out ? 2.5 : 1);
      d.a += w * dt * 0.12;
      d.r -= (14 + 2600 / d.r) * dt * (out ? 4 : 1);
      if (d.r < hr * 0.9) this.dust.splice(i, 1);
    }
  }

  // ------------------------------------------------------------ calque statique
  drawStatic(g) {
    const cx = SG.cx, cy = SG.cy;
    g.save();
    g.beginPath(); chamberPath(g); g.clip();
    // le vide : fond spatial sombre, nébuleuses chaudes autour de la singularité
    const vg = g.createRadialGradient(cx, cy, 10, cx, cy, 420);
    vg.addColorStop(0, '#000000'); vg.addColorStop(0.25, '#07030c'); vg.addColorStop(0.6, '#0d0710'); vg.addColorStop(1, 'rgba(26,16,8,0.0)');
    g.fillStyle = vg; g.fillRect(0, 0, 600, 720);
    const rnd = mulberry32(911);
    for (const [col, a, x, y, r] of [[VIOLET, 0.24, 140, 200, 220], [MAG, 0.16, 440, 220, 200], [HOT, 0.14, 300, 560, 240], ['#29e3ff', 0.08, 90, 520, 170], [MAG, 0.08, 200, 460, 150], [VIOLET, 0.12, 470, 520, 160]]) {
      const ng = g.createRadialGradient(x, y, 0, x, y, r);
      ng.addColorStop(0, rgba(col, a)); ng.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = ng; g.fillRect(x - r, y - r, r * 2, r * 2);
    }
    // étoiles (celles proches du centre seront « lentillées » dynamiquement)
    for (let i = 0; i < 260; i++) {
      const x = 20 + rnd() * 522, y = 20 + rnd() * 690, s = rnd();
      const d = Math.hypot(x - cx, y - cy);
      if (d < 70) continue;
      g.globalAlpha = (0.2 + 0.7 * s) * clamp((d - 70) / 120, 0.2, 1);
      g.fillStyle = s > 0.93 ? '#ffd9b0' : s > 0.85 ? '#bfe3ff' : '#ffffff';
      const rr = s > 0.97 ? 1.6 : s > 0.75 ? 1.1 : 0.7;
      g.fillRect(x, y, rr, rr);
    }
    g.globalAlpha = 1;
    // limite du champ : rapporteur gradué (le balayage angulaire est la clé de la fronde)
    g.strokeStyle = rgba(AMBER, 0.16); g.lineWidth = 1;
    g.setLineDash([2, 6]);
    g.beginPath(); g.arc(cx, cy, SG.RF, 0, TAU); g.stroke();
    g.setLineDash([]);
    g.strokeStyle = rgba(AMBER, 0.28);
    g.beginPath();
    for (let k = 0; k < 72; k++) {
      const a = k * TAU / 72, r0 = k % 6 ? R_INS + 6 : R_INS + 2, r1 = R_INS + 11;
      g.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0); g.lineTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1);
    }
    g.stroke();
    // inserts de fronde (lentilles éteintes)
    for (let k = 0; k < N_INS; k++) {
      const a = k * TAU / N_INS;
      insertBase(g, 'diamond', cx + Math.cos(a) * R_INS, cy + Math.sin(a) * R_INS, 6.5, AMBER, a);
    }
    // rails des orbites (sillons gravés)
    for (const o of ORBITS) {
      g.strokeStyle = 'rgba(0,0,0,0.55)'; g.lineWidth = 5;
      g.beginPath(); g.arc(cx, cy, o.r, 0, TAU); g.stroke();
      g.strokeStyle = rgba(o.color, 0.16); g.lineWidth = 1.2;
      g.setLineDash([10, 7]);
      g.beginPath(); g.arc(cx, cy, o.r, 0, TAU); g.stroke();
      g.setLineDash([]);
    }
    g.font = '700 10px "Rajdhani", sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = rgba(ORBITS[0].color, 0.6);
    g.fillText('×2', cx + Math.cos(-0.78) * (ORBITS[0].r + 14), cy + Math.sin(-0.78) * (ORBITS[0].r + 14));
    for (const [txt, a] of [['0°', 0], ['90°', Math.PI / 2], ['180°', Math.PI], ['270°', -Math.PI / 2]]) {
      g.fillStyle = rgba(AMBER, 0.35);
      g.fillText(txt, cx + Math.cos(a) * (R_INS - 16), cy + Math.sin(a) * (R_INS - 16));
    }
    // inscription courbe au sommet du champ
    g.save();
    g.font = '700 9px "Rajdhani", sans-serif';
    g.fillStyle = rgba(AMBER, 0.42);
    const msg = '◆ HORIZON INSTABLE ◆ NE PAS FRANCHIR ◆ ATTRACTION GRAVITATIONNELLE ◆';
    const R0 = SG.RF + 9, a0 = -Math.PI / 2 - (msg.length * 5.6 / R0) / 2;
    let acc = 0;
    for (const ch of msg) {
      const w = g.measureText(ch).width + 1.4;
      const a = a0 + (acc + w / 2) / R0;
      g.save(); g.translate(cx + Math.cos(a) * R0, cy + Math.sin(a) * R0); g.rotate(a + Math.PI / 2);
      g.fillText(ch, 0, 0); g.restore();
      acc += w;
    }
    g.restore();
    // carénage de la cuve (bas de la chambre) : plaques rivetées et évents
    for (let i = 0; i < 9; i++) {
      const a0 = (38 + i * 11.6) * Math.PI / 180, a1 = a0 + 10.4 * Math.PI / 180;
      g.beginPath();
      g.arc(cx, cy, 300, a0, a1); g.arc(cx, cy, 262, a1, a0, true); g.closePath();
      g.fillStyle = i % 2 ? '#140d0a' : '#1a110b'; g.fill();
      g.strokeStyle = 'rgba(255,174,42,0.18)'; g.lineWidth = 1; g.stroke();
      const am = (a0 + a1) / 2;
      screw(g, cx + Math.cos(a0 + 0.03) * 292, cy + Math.sin(a0 + 0.03) * 292, 1.5);
      screw(g, cx + Math.cos(a1 - 0.03) * 292, cy + Math.sin(a1 - 0.03) * 292, 1.5);
      g.save(); g.translate(cx + Math.cos(am) * 281, cy + Math.sin(am) * 281); g.rotate(am + Math.PI / 2);
      g.fillStyle = '#050304'; g.fillRect(-12, -4, 24, 8);
      g.strokeStyle = 'rgba(0,0,0,0.6)'; g.strokeRect(-12, -4, 24, 8);
      g.restore();
    }
    // projecteurs de confinement (socles)
    for (const e of emitters()) {
      g.save();
      g.translate(e.x, e.y); g.rotate(e.a + Math.PI);
      g.fillStyle = 'rgba(0,0,0,0.5)'; g.fillRect(-9, -13, 26, 26);
      g.fillStyle = '#161219'; g.fillRect(-12, -11, 24, 22);
      g.strokeStyle = '#5b4a3a'; g.lineWidth = 1.5; g.strokeRect(-12, -11, 24, 22);
      g.fillStyle = '#2a2230'; g.fillRect(6, -6, 9, 12);
      g.strokeStyle = rgba(AMBER, 0.5); g.lineWidth = 1; g.strokeRect(6, -6, 9, 12);
      screw(g, -8, -7, 1.6); screw(g, -8, 7, 1.6);
      g.restore();
    }
    g.restore();

    // lèvre basse de la chambre : bande de danger et inscriptions
    hazard(g, [[64, 698], [498, 698], [490, 708], [72, 708]], AMBER, 0.42, 9);
    paint(g, 'CONFINEMENT ROMPU', SG.cx, 684, 13, rgba(AMBER, 0.7), { spacing: 3 });
    // pont inférieur : emblème atomique du secteur et circuits
    g.save();
    circuits(g, 160, 730, 400, 880, 10, AMBER, 77, 0.1);
    g.translate(SG.cx, 812);
    g.strokeStyle = rgba(AMBER, 0.14); g.lineWidth = 3;
    for (let k = 0; k < 3; k++) { g.save(); g.rotate(k * Math.PI / 3); g.beginPath(); g.ellipse(0, 0, 54, 18, 0, 0, TAU); g.stroke(); g.restore(); }
    g.fillStyle = rgba(AMBER, 0.16); g.beginPath(); g.arc(0, 0, 8, 0, TAU); g.fill();
    g.restore();
    paint(g, 'RÉACTEUR · SECTEUR 2', SG.cx, 868, 10, rgba(AMBER, 0.45), { spacing: 2 });
    // rails de garde chromés le long de la lèvre
    chrome(g, [[64, 712], [140, 712]], 3, { glow: AMBER });
    chrome(g, [[422, 712], [498, 712]], 3, { glow: AMBER });
  }

  // ------------------------------------------------------------ caches
  _sprites() {
    if (!this.sprites) this.sprites = { a: diskSprite(17, false), b: diskSprite(41, true) };
    return this.sprites;
  }

  // grille de l'espace-temps déformée (mise en cache par palier de croissance)
  _grid(k) {
    const key = k < 0 ? -1 : Math.round(k * 12);
    let G = this.grids.get(key);
    if (G) return G;
    const depth = key < 0 ? 0 : 0.32 + 0.3 * key / 12;
    const L = 58;
    const warp = (x, y) => {
      const dx = x - SG.cx, dy = y - SG.cy, r = Math.hypot(dx, dy) || 1;
      const s = 1 - depth * L / (r + L) * (1 - 0.15 * Math.min(1, r / 400));
      return [SG.cx + dx * s, SG.cy + dy * s];
    };
    const p = new Path2D();
    const line = (x0, y0, x1, y1) => {
      const n = Math.ceil(Math.hypot(x1 - x0, y1 - y0) / 9);
      for (let i = 0; i <= n; i++) {
        const [x, y] = warp(lerp(x0, x1, i / n), lerp(y0, y1, i / n));
        if (i) p.lineTo(x, y); else p.moveTo(x, y);
      }
    };
    for (let x = SG.cx - 26 * 10; x <= SG.cx + 26 * 10; x += 26) line(x, -20, x, 740);
    for (let y = SG.cy - 26 * 15; y <= 740; y += 26) line(0, y, 600, y);
    G = { p };
    this.grids.set(key, G);
    return G;
  }

  // ------------------------------------------------------------ rendu sous la bille
  renderArena(ctx, r) {
    const mg = this.mg, t = r.time;
    const reduced = r.settings && r.settings.reducedFx;
    if (!this.chamber) this.chamber = chamberPath(new Path2D());
    ctx.save();
    ctx.clip(this.chamber);
    this._drawGrid(ctx, t);
    this._drawLensedStars(ctx, t);
    this._drawVents(ctx, r, t);
    this._drawEmitters(ctx, r, t);
    this._drawInserts(ctx, r, t);
    this._drawOrbits(ctx, r, t);
    this._drawDust(ctx);
    this._drawHole(ctx, r, t);
    this._drawLightning(ctx, r, t, reduced);
    this._drawCells(ctx, r, t);
    if (mg.phase === 'stabilize') this._drawRing(ctx, r, t);
    ctx.restore();
  }

  _drawGrid(ctx, t) {
    const mg = this.mg;
    // après l'implosion, l'espace-temps se détend : grille plane
    const flat = mg.phase === 'outro' && mg.outroT > 1.25;
    const G = this._grid(flat ? -1 : mg.gVis);
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineWidth = 1;
    const pulse = 0.5 + 0.5 * Math.sin(t * 2.2);
    ctx.strokeStyle = rgba(VIOLET, 0.1 + 0.03 * pulse + 0.12 * mg.alert / 2);
    ctx.stroke(G.p);
    // halo chaud au fond du puits
    ctx.globalCompositeOperation = 'source-over';
  }

  _drawLensedStars(ctx, t) {
    const mg = this.mg;
    const R = mg.rH * 2.6;
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    for (let i = 0; i < 9; i++) {
      const a = i * 2.39 + t * 0.07 * (i % 2 ? 1 : -1);
      const rr = R + (i % 3) * 7;
      ctx.strokeStyle = rgba(i % 4 ? '#dfe8ff' : '#ffd9b0', 0.35 + 0.2 * Math.sin(t * 3 + i));
      ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.arc(SG.cx, SG.cy, rr, a, a + 0.18 + (i % 3) * 0.05); ctx.stroke();
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  _drawEmitters(ctx, r, t) {
    const mg = this.mg;
    const stab = mg.phase === 'stabilize';
    const k = stab ? 1 : 0.25 + 0.5 * mg.alert / 2;
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    emitters().forEach((e, i) => {
      const fl = 0.6 + 0.4 * Math.sin(t * 13 + i * 2.1);
      const lx = e.x - Math.cos(e.a) * 14, ly = e.y - Math.sin(e.a) * 14;
      const tr = stab ? Math.max(mg.ringR, 8) : mg.rH * 3.2;
      const tx = SG.cx + Math.cos(e.a) * tr, ty = SG.cy + Math.sin(e.a) * tr;
      // faisceau de confinement
      if (stab || (Math.sin(t * 1.7 + i * 1.3) > 0.2)) {
        ctx.strokeStyle = rgba(stab ? '#ffe2a8' : AMBER, 0.08 * k * fl + (stab ? 0.12 : 0));
        ctx.lineWidth = stab ? 9 : 5;
        ctx.beginPath(); ctx.moveTo(lx, ly); ctx.lineTo(tx, ty); ctx.stroke();
        ctx.strokeStyle = rgba(WHITE, (stab ? 0.5 : 0.12) * fl * k);
        ctx.lineWidth = stab ? 1.6 : 1;
        ctx.beginPath(); ctx.moveTo(lx, ly); ctx.lineTo(tx, ty); ctx.stroke();
      }
      ctx.globalCompositeOperation = 'source-over';
      r.glow(lx, ly, stab ? 40 : 26, AMBER, (0.35 + 0.4 * k) * fl);
      ctx.globalCompositeOperation = 'lighter';
    });
    ctx.globalCompositeOperation = 'source-over';
  }

  // évents de la cuve : la chaleur monte avec la masse de la singularité
  _drawVents(ctx, r, t) {
    const mg = this.mg;
    const k = 0.35 + 0.5 * mg.gVis + (mg.alert > 0 ? 0.4 : 0);
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 9; i++) {
      const am = (38 + i * 11.6 + 5.2) * Math.PI / 180;
      const fl = 0.55 + 0.45 * Math.sin(t * 3.1 + i * 1.7);
      const x = SG.cx + Math.cos(am) * 281, y = SG.cy + Math.sin(am) * 281;
      ctx.save(); ctx.translate(x, y); ctx.rotate(am + Math.PI / 2);
      ctx.fillStyle = rgba(i % 3 ? AMBER : HOT, 0.5 * k * fl);
      for (let j = 0; j < 4; j++) ctx.fillRect(-10 + j * 6, -2.5, 3.5, 5);
      ctx.restore();
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  // jets relativistes perpendiculaires au disque
  _drawJets(ctx, r, t, hr) {
    const mg = this.mg;
    const L = 70 + 120 * mg.gVis + (mg.phase === 'stabilize' ? 60 : 0);
    ctx.save();
    ctx.translate(SG.cx, SG.cy);
    ctx.rotate(TILT);
    ctx.globalCompositeOperation = 'lighter';
    for (const sgn of [-1, 1]) {
      const fl = 0.75 + 0.25 * Math.sin(t * 17 + sgn * 2);
      const grd = ctx.createLinearGradient(0, 0, 0, sgn * L);
      grd.addColorStop(0, rgba('#fff0d0', 0.55 * fl)); grd.addColorStop(0.3, rgba(AMBER, 0.3 * fl)); grd.addColorStop(1, 'rgba(255,61,242,0)');
      ctx.fillStyle = grd;
      ctx.beginPath(); ctx.moveTo(-hr * 0.45, 0); ctx.lineTo(-hr * 0.12 - 5, sgn * L); ctx.lineTo(hr * 0.12 + 5, sgn * L); ctx.lineTo(hr * 0.45, 0); ctx.closePath(); ctx.fill();
      // nœuds de plasma qui filent le long du jet
      for (let k = 0; k < 3; k++) {
        const u = (t * 1.6 + k / 3) % 1;
        ctx.fillStyle = rgba('#ffe9c4', 0.6 * (1 - u));
        ctx.beginPath(); ctx.arc(0, sgn * (hr + u * (L - hr)), 3 * (1 - u) + 1, 0, TAU); ctx.fill();
      }
    }
    ctx.restore();
  }

  // inserts de fronde : s'allument à mesure que la bille tourne autour du centre
  _drawInserts(ctx, r, t) {
    const mg = this.mg;
    const s = mg.sweepOn ? Math.abs(mg.sweep) : 0;
    const dir = mg.sweep >= 0 ? 1 : -1;
    const fr = this.frondeT;
    for (let k = 0; k < N_INS; k++) {
      const a = k * TAU / N_INS;
      let lit = 0;
      if (fr > 0) lit = (Math.floor(t * 18) + k) % 3 === 0 ? 1 : 0.35;
      else if (s > 0.6) {
        let d = (a - mg.sweepA0) * dir;
        d = ((d % TAU) + TAU) % TAU;
        if (d <= s) lit = 0.45 + 0.55 * clamp(s / SG.FRONDE, 0, 1);
      } else if (mg.phase === 'stabilize') lit = (Math.floor(t * 6) + k) % 4 === 0 ? 0.7 : 0;
      if (lit <= 0) continue;
      const x = SG.cx + Math.cos(a) * R_INS, y = SG.cy + Math.sin(a) * R_INS;
      const col = s > SG.FRONDE * 0.8 || fr > 0 ? WHITE : AMBER;
      insertLit(ctx, 'diamond', x, y, 6.5, col === WHITE ? '#ffe6b8' : AMBER, lit, a);
      r.glow(x, y, 34, AMBER, 0.5 * lit);
    }
    // arc de balayage : la boucle en cours, objectif 300°
    if (s > 2.6 && mg.phase === 'harvest' && fr <= 0) {
      const u = clamp(s / SG.FRONDE, 0, 1);
      const R = R_INS - 12;
      const a0 = mg.sweepA0, a1 = a0 + dir * s;
      ctx.globalCompositeOperation = 'lighter';
      ctx.lineCap = 'round';
      ctx.strokeStyle = rgba(u > 0.85 ? '#ffe6b8' : AMBER, 0.18 + 0.4 * u);
      ctx.lineWidth = 3 + 4 * u;
      ctx.beginPath(); ctx.arc(SG.cx, SG.cy, R, Math.min(a0, a1), Math.max(a0, a1)); ctx.stroke();
      // repère de l'objectif
      const ag = a0 + dir * SG.FRONDE;
      ctx.strokeStyle = rgba(WHITE, 0.5 + 0.5 * Math.sin(t * 16));
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(SG.cx + Math.cos(ag) * (R - 10), SG.cy + Math.sin(ag) * (R - 10)); ctx.lineTo(SG.cx + Math.cos(ag) * (R + 10), SG.cy + Math.sin(ag) * (R + 10)); ctx.stroke();
      ctx.globalCompositeOperation = 'source-over';
      if (u > 0.55) r.text(`FRONDE ${Math.round(u * 100)} %`, SG.cx, SG.cy - R_INS + 22, 12, '#ffe6b8', 'center', 0.6 + 0.4 * u, true);
    }
  }

  _drawOrbits(ctx, r, t) {
    const mg = this.mg;
    if (mg.phase !== 'harvest') return;
    ctx.globalCompositeOperation = 'lighter';
    ORBITS.forEach((o, i) => {
      ctx.strokeStyle = rgba(o.color, 0.07 + 0.04 * Math.sin(t * 2 + i));
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(SG.cx, SG.cy, o.r, 0, TAU); ctx.stroke();
    });
    ctx.globalCompositeOperation = 'source-over';
  }

  _drawDust(ctx) {
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    ctx.lineWidth = 1.3;
    for (const d of this.dust) {
      const x0 = SG.cx + Math.cos(d.pa) * d.pr, y0 = SG.cy + Math.sin(d.pa) * d.pr;
      const x1 = SG.cx + Math.cos(d.a) * d.r, y1 = SG.cy + Math.sin(d.a) * d.r;
      const k = clamp(1 - d.r / 250, 0.15, 1);
      ctx.strokeStyle = rgba(d.hot ? '#ffe2a8' : AMBER, 0.25 + 0.55 * k);
      ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1 + (x1 - x0) * 2, y1 + (y1 - y0) * 2); ctx.stroke();
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  // la singularité : disque d'accrétion incliné, lentille, ombre, anneau de photons
  _drawHole(ctx, r, t) {
    const mg = this.mg;
    let hr = mg.rH * (1 + 0.12 * this.gulp);
    let k = 1;
    if (mg.phase === 'outro') {
      const u = mg.outroT;
      k = u < 1.25 ? Math.max(0.02, 1 - Math.pow(u / 1.25, 2.2)) : 0;
      hr *= k;
      if (u >= 1.25) { this._drawRemnant(ctx, r, u - 1.25); return; }
    }
    const S = this._sprites();
    const cx = SG.cx, cy = SG.cy;
    const D = hr * 3.9 + 30;
    const alert = mg.alert > 0 ? 0.5 + 0.5 * Math.sin(t * 18) : 0;
    if (k > 0.05) this._drawJets(ctx, r, t, hr);
    // halo
    r.glow(cx, cy, D * 4.2, HOT, 0.22 + 0.15 * mg.gVis + 0.2 * alert);
    r.glow(cx, cy, D * 2.4, AMBER, 0.3 + 0.2 * this.gulp);
    ctx.save();
    ctx.translate(cx, cy);
    ctx.globalCompositeOperation = 'lighter';
    // lumière lentillée : l'arrière du disque s'enroule autour de l'ombre
    ctx.save();
    ctx.rotate(this.spin * 0.6);
    const lr = hr * 2.25;
    ctx.globalAlpha = 0.75;
    ctx.drawImage(S.b, -lr, -lr, lr * 2, lr * 2);
    ctx.restore();
    // disque incliné : moitié arrière
    ctx.rotate(TILT);
    ctx.save();
    ctx.beginPath(); ctx.rect(-D * 1.2, -D * 1.2, D * 2.4, D * 1.2); ctx.clip();
    this._disk(ctx, S, D);
    ctx.restore();
    // ombre (horizon)
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    const sh = ctx.createRadialGradient(0, 0, hr * 0.9, 0, 0, hr * 1.55);
    sh.addColorStop(0, '#000000'); sh.addColorStop(0.7, 'rgba(0,0,0,0.85)'); sh.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = sh;
    ctx.beginPath(); ctx.arc(0, 0, hr * 1.55, 0, TAU); ctx.fill();
    // anneau de photons
    ctx.globalCompositeOperation = 'lighter';
    const flick = 0.75 + 0.25 * Math.sin(t * 23) * Math.sin(t * 7.1);
    ctx.strokeStyle = rgba('#ffe9c4', 0.85 * flick);
    ctx.lineWidth = 2.2 + 1.5 * this.gulp;
    ctx.beginPath(); ctx.arc(0, 0, hr * 1.18, 0, TAU); ctx.stroke();
    ctx.strokeStyle = rgba(AMBER, 0.4);
    ctx.lineWidth = 6;
    ctx.beginPath(); ctx.arc(0, 0, hr * 1.25, 0, TAU); ctx.stroke();
    // disque incliné : moitié avant (passe devant l'ombre)
    ctx.save();
    ctx.beginPath(); ctx.rect(-D * 1.2, 0, D * 2.4, D * 1.2); ctx.clip();
    this._disk(ctx, S, D);
    ctx.restore();
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#000';
    ctx.beginPath(); ctx.arc(0, 0, hr * 0.92, 0, TAU); ctx.fill();
    ctx.restore();
    // alerte d'horizon : la bille s'approche dangereusement
    const close = mg.lastMinR !== undefined ? mg.lastMinR : 999;
    if (mg.phase === 'harvest' && close < mg.rH + 70 && mg.confineT <= 0) {
      const u = clamp(1 - (close - mg.rH) / 70, 0, 1);
      ctx.strokeStyle = rgba(RED, u * (0.4 + 0.4 * Math.sin(t * 30)));
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 5]); ctx.lineDashOffset = t * 30;
      ctx.beginPath(); ctx.arc(cx, cy, mg.rH + 13, 0, TAU); ctx.stroke();
      ctx.setLineDash([]);
    }
    // champ de confinement (avantage d'entrée)
    if (mg.confineT > 0 && mg.phase === 'harvest') {
      const fade = mg.confineT < 2 ? (Math.sin(t * 20) > 0 ? 1 : 0.3) : 1;
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = rgba(ICE, 0.6 * fade);
      ctx.lineWidth = 2;
      for (let i = 0; i < 6; i++) {
        const a = t * 1.5 + i * TAU / 6;
        ctx.beginPath(); ctx.arc(cx, cy, mg.rH + 6, a, a + 0.7); ctx.stroke();
      }
      ctx.globalCompositeOperation = 'source-over';
      r.glow(cx, cy, mg.rH * 5, ICE, 0.18 * fade);
    }
  }

  _disk(ctx, S, D) {
    ctx.save();
    ctx.scale(1, 0.34);
    ctx.save(); ctx.rotate(this.spin); ctx.globalAlpha = 0.95; ctx.drawImage(S.a, -D, -D, D * 2, D * 2); ctx.restore();
    ctx.save(); ctx.rotate(this.spin * 1.7 + 1); ctx.globalAlpha = 0.9; ctx.drawImage(S.b, -D * 0.72, -D * 0.72, D * 1.44, D * 1.44); ctx.restore();
    ctx.restore();
  }

  // après l'implosion : une étoile naine qui refroidit
  _drawRemnant(ctx, r, u) {
    const a = clamp(1 - u / 2.5, 0, 1);
    r.glow(SG.cx, SG.cy, 260 * (1 + u), '#ffe9c4', 0.5 * a);
    r.glow(SG.cx, SG.cy, 60, WHITE, 0.9 * a + 0.1);
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = rgba(AMBER, 0.6 * a);
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(SG.cx, SG.cy, 40 + u * 400, 0, TAU); ctx.stroke();
    ctx.globalCompositeOperation = 'source-over';
  }

  _jag(ctx, x0, y0, x1, y1, amp, seed) {
    const n = 6, dx = x1 - x0, dy = y1 - y0, l = Math.hypot(dx, dy) || 1;
    const nx = -dy / l, ny = dx / l;
    ctx.beginPath(); ctx.moveTo(x0, y0);
    for (let i = 1; i < n; i++) {
      const u = i / n, o = Math.sin(seed * 12.9 + i * 78.2) * amp * Math.sin(u * Math.PI);
      ctx.lineTo(x0 + dx * u + nx * o, y0 + dy * u + ny * o);
    }
    ctx.lineTo(x1, y1);
    ctx.stroke();
  }

  // éclair le long d'un arc d'orbite (bruit radial)
  _jagArc(ctx, R, a0, a1, seed) {
    const n = Math.max(4, Math.ceil((a1 - a0) * R / 14));
    ctx.beginPath();
    for (let i = 0; i <= n; i++) {
      const u = i / n, a = a0 + (a1 - a0) * u;
      const o = i === 0 || i === n ? 0 : Math.sin(seed * 12.9 + i * 78.2) * 9 * Math.sin(u * Math.PI);
      const x = SG.cx + Math.cos(a) * (R + o), y = SG.cy + Math.sin(a) * (R + o);
      if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
    }
    ctx.stroke();
  }

  _drawLightning(ctx, r, t, reduced) {
    const mg = this.mg;
    if (mg.phase !== 'harvest') return;
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineJoin = 'round';
    const frame = Math.floor(t * 14);
    let drawn = 0;
    const max = reduced ? 1 : 4;
    // éclairs qui courent le long de l'orbite entre deux cellules voisines
    for (let oi = 0; oi < ORBITS.length && drawn < max; oi++) {
      const live = mg.cells.filter(c => c.oi === oi && c.on && c.spawn >= 1);
      if (live.length < 2) continue;
      live.sort((p, q) => p.a - q.a);
      for (let i = 0; i < live.length && drawn < max; i++) {
        const a = live[i], b = live[(i + 1) % live.length];
        if (a === b) continue;
        const on = Math.sin(frame * 1.7 + a.seed * 3 + oi) > 0.55;
        if (!on) continue;
        let span = b.a - a.a;
        span = ((span % TAU) + TAU) % TAU;
        if (span > 2.4) continue;
        const seed = frame + a.seed;
        ctx.strokeStyle = rgba(a.o.color, 0.32); ctx.lineWidth = 4;
        this._jagArc(ctx, a.o.r, a.a, a.a + span, seed);
        ctx.strokeStyle = rgba(WHITE, 0.65); ctx.lineWidth = 1.2;
        this._jagArc(ctx, a.o.r, a.a, a.a + span, seed);
        drawn++;
      }
    }
    // décharges de la singularité vers les cellules (alerte de croissance)
    if (mg.alert > 0) {
      for (const c of mg.cells) {
        if (!c.on || Math.sin(frame * 2.3 + c.seed) < 0.3) continue;
        const a = Math.atan2(c.y - SG.cy, c.x - SG.cx);
        const x0 = SG.cx + Math.cos(a) * mg.rH * 1.3, y0 = SG.cy + Math.sin(a) * mg.rH * 1.3;
        ctx.strokeStyle = rgba(HOT, 0.45); ctx.lineWidth = 4;
        this._jag(ctx, x0, y0, c.x, c.y, 18, frame + c.seed);
        ctx.strokeStyle = rgba('#fff0d0', 0.8); ctx.lineWidth = 1.3;
        this._jag(ctx, x0, y0, c.x, c.y, 18, frame + c.seed);
      }
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  _drawCells(ctx, r, t) {
    const mg = this.mg;
    const cx = SG.cx, cy = SG.cy;
    for (const c of mg.cells) {
      const o = c.o, big = o.value > 1;
      if (c.collapse > 0) {
        // stabilisation : les cellules sont aspirées par la singularité
        const u = 1 - c.collapse;
        const rr = o.r * (1 - u * u), a = c.a + u * 4;
        const x = cx + Math.cos(a) * rr, y = cy + Math.sin(a) * rr;
        r.glow(x, y, 40 * (1 - u), o.color, 0.9);
        continue;
      }
      if (!c.on) {
        if (mg.phase !== 'harvest') continue;
        // emplacement en recharge : coquille vide et jauge
        const u = clamp(1 - c.respawnT / mg.respawn, 0, 1);
        ctx.strokeStyle = rgba(o.color, 0.18);
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(c.x, c.y, 8, 0, TAU); ctx.stroke();
        ctx.strokeStyle = rgba(o.color, 0.5);
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(c.x, c.y, 8, -Math.PI / 2, -Math.PI / 2 + TAU * u); ctx.stroke();
        continue;
      }
      const s = c.spawn < 1 ? 0.3 + 0.7 * c.spawn : 1;
      const R = (big ? 13 : 10.5) * s;
      // traînée le long de l'orbite
      const dir = Math.sign(o.w) || 1;
      ctx.globalCompositeOperation = 'lighter';
      ctx.lineCap = 'round';
      for (let k = 0; k < 4; k++) {
        const a0 = c.a - dir * (0.05 + k * 0.08), a1 = c.a - dir * (0.05 + (k + 1) * 0.08);
        ctx.strokeStyle = rgba(o.color, 0.45 * (1 - k / 4) * s);
        ctx.lineWidth = R * (1.1 - k * 0.22);
        ctx.beginPath(); ctx.arc(cx, cy, o.r, Math.min(a0, a1), Math.max(a0, a1)); ctx.stroke();
      }
      ctx.globalCompositeOperation = 'source-over';
      const pulse = 0.75 + 0.25 * Math.sin(t * 6 + c.seed);
      r.glow(c.x, c.y, R * 5, o.color, (0.5 + c.flash * 0.5) * pulse * s);
      // cristal d'énergie (losange tournant, cœur blanc)
      ctx.save();
      ctx.translate(c.x, c.y);
      ctx.rotate(t * (big ? 2.4 : 1.6) + c.seed);
      ctx.fillStyle = rgba(o.color, 0.9);
      ctx.beginPath(); ctx.moveTo(0, -R); ctx.lineTo(R * 0.7, 0); ctx.lineTo(0, R); ctx.lineTo(-R * 0.7, 0); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = WHITE; ctx.lineWidth = 1.4; ctx.stroke();
      if (big) {
        ctx.rotate(Math.PI / 2);
        ctx.strokeStyle = rgba(WHITE, 0.8);
        ctx.beginPath(); ctx.moveTo(0, -R * 1.25); ctx.lineTo(R * 0.85, 0); ctx.lineTo(0, R * 1.25); ctx.lineTo(-R * 0.85, 0); ctx.closePath(); ctx.stroke();
      }
      ctx.fillStyle = '#fffaf0';
      ctx.beginPath(); ctx.arc(0, 0, R * 0.32, 0, TAU); ctx.fill();
      ctx.restore();
      if (c.spawn < 1) {
        ctx.strokeStyle = rgba(o.color, 1 - c.spawn);
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(c.x, c.y, 10 + 26 * c.spawn, 0, TAU); ctx.stroke();
      }
    }
    // cellules dispersées : elles rejaillissent du centre vers leur emplacement
    for (const p of this.ghosts) {
      const u = p.t / p.life;
      const tx = p.cell ? p.cell.x : p.tx, ty = p.cell ? p.cell.y : p.ty;
      const x = lerp(cx, tx, u), y = lerp(cy, ty, u) - Math.sin(u * Math.PI) * 30;
      r.glow(x, y, 36, p.cell ? p.cell.o.color : AMBER, 1 - u * 0.5);
    }
  }

  // anneau de confinement (stabilisation) : la cible finale
  _drawRing(ctx, r, t) {
    const mg = this.mg;
    const R = mg.ringR;
    if (R < 2) return;
    const cx = SG.cx, cy = SG.cy;
    const pulse = 0.5 + 0.5 * Math.sin(t * 9);
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    const segs = 8;
    for (let i = 0; i < segs; i++) {
      const a = t * 1.3 + i * TAU / segs;
      ctx.strokeStyle = rgba(this.ringFlash > 0 ? WHITE : AMBER, 0.55 + 0.35 * pulse);
      ctx.lineWidth = 5;
      ctx.beginPath(); ctx.arc(cx, cy, R, a, a + TAU / segs * 0.62); ctx.stroke();
    }
    ctx.strokeStyle = rgba(WHITE, 0.35 + 0.3 * pulse);
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(cx, cy, R + 9, 0, TAU); ctx.stroke();
    // flèches convergentes : visez ici
    for (let i = 0; i < 4; i++) {
      const a = Math.PI / 4 + i * Math.PI / 2;
      const d = R + 40 - ((t * 60) % 26);
      const x = cx + Math.cos(a) * d, y = cy + Math.sin(a) * d;
      ctx.save(); ctx.translate(x, y); ctx.rotate(a + Math.PI);
      ctx.fillStyle = rgba(AMBER, 0.85);
      ctx.beginPath(); ctx.moveTo(10, 0); ctx.lineTo(-4, -7); ctx.lineTo(-4, 7); ctx.closePath(); ctx.fill();
      ctx.restore();
    }
    ctx.globalCompositeOperation = 'source-over';
    // verrous de confinement (frappes nécessaires)
    if (mg.hitsNeed > 1) {
      for (let i = 0; i < mg.hitsNeed; i++) {
        const x = cx + (i - (mg.hitsNeed - 1) / 2) * 22, y = cy - R - 30;
        const on = i < mg.hits;
        ctx.save(); ctx.translate(x, y); ctx.rotate(Math.PI / 4);
        ctx.fillStyle = on ? AMBER : 'rgba(255,174,42,0.15)';
        ctx.strokeStyle = on ? WHITE : rgba(AMBER, 0.6); ctx.lineWidth = 1.5;
        ctx.fillRect(-6, -6, 12, 12); ctx.strokeRect(-6, -6, 12, 12);
        ctx.restore();
      }
    }
    r.text('FRAPPEZ LA SINGULARITÉ', cx, cy + R + 44, 13, '#ffe6b8', 'center', 0.55 + 0.45 * pulse, true);
  }

  // ------------------------------------------------------------ rendu au-dessus de la bille
  renderTop(ctx, r) {
    const mg = this.mg, t = r.time;
    this._drawStretch(ctx, r);
    // ondes de choc
    ctx.globalCompositeOperation = 'lighter';
    for (const s of mg.shock) {
      if (s.t < 0) continue;
      const u = s.t / s.life;
      const R = lerp(s.r0, s.r1, 1 - Math.pow(1 - u, 2));
      ctx.strokeStyle = rgba(s.color, 0.7 * (1 - u));
      ctx.lineWidth = 2 + 8 * (1 - u);
      ctx.beginPath(); ctx.arc(SG.cx, SG.cy, Math.max(1, R), 0, TAU); ctx.stroke();
    }
    // éclats de récolte
    for (const p of this.pops) {
      const u = p.t / p.life;
      ctx.strokeStyle = rgba(p.color, 1 - u);
      ctx.lineWidth = 3 * (1 - u) + 1;
      ctx.beginPath(); ctx.arc(p.x, p.y, (p.big ? 16 : 12) + u * 30, 0, TAU); ctx.stroke();
      for (let k = 0; k < 6; k++) {
        const a = k * TAU / 6 + p.x;
        const r0 = 8 + u * 30, r1 = r0 + 10 * (1 - u);
        ctx.beginPath(); ctx.moveTo(p.x + Math.cos(a) * r0, p.y + Math.sin(a) * r0); ctx.lineTo(p.x + Math.cos(a) * r1, p.y + Math.sin(a) * r1); ctx.stroke();
      }
    }
    // éclairs de la fronde (récolte en chaîne)
    ctx.lineJoin = 'round';
    for (const z of this.zaps) {
      const k = 1 - z.t / z.life;
      const seed = Math.floor(t * 30) + z.seed;
      ctx.strokeStyle = rgba(z.color, 0.5 * k); ctx.lineWidth = 7;
      this._jag(ctx, z.x0, z.y0, z.x1, z.y1, 16, seed);
      ctx.strokeStyle = rgba(WHITE, 0.95 * k); ctx.lineWidth = 2;
      this._jag(ctx, z.x0, z.y0, z.x1, z.y1, 16, seed);
    }
    ctx.globalCompositeOperation = 'source-over';
    for (const z of this.zaps) r.glow(z.x1, z.y1, 70, z.color, 1 - z.t / z.life);
    // implosion : tout converge vers le centre
    if (mg.phase === 'outro' && mg.outroT < 1.25) {
      const u = mg.outroT / 1.25;
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 4; i++) {
        const R = (1 - ((u * 2 + i * 0.25) % 1)) * 320;
        ctx.strokeStyle = rgba(i % 2 ? WHITE : AMBER, 0.15 + 0.5 * u);
        ctx.lineWidth = 2 + 4 * u;
        ctx.beginPath(); ctx.arc(SG.cx, SG.cy, Math.max(1, R), 0, TAU); ctx.stroke();
      }
      ctx.globalCompositeOperation = 'source-over';
      r.glow(SG.cx, SG.cy, 80 + 300 * u, WHITE, 0.2 + 0.6 * u * u);
    }
    if (mg.phase === 'outro' && mg.outroT >= 1.25) {
      const u = mg.outroT - 1.25;
      const a = clamp(1 - u / 2.2, 0, 1);
      this._glitchText(r, 'SINGULARITÉ REFERMÉE', SG.cx, SG.cy - 130, 26, AMBER, a);
    } else if (this.frondeT > 0) {
      const a = Math.min(1, this.frondeT / 0.4);
      this._glitchText(r, 'FRONDE !', SG.cx, SG.cy - 150, 34, '#ffe6b8', a);
    } else if (mg.alert > 0 && mg.phase === 'harvest') {
      const a = (Math.sin(t * 14) > 0 ? 1 : 0.4) * Math.min(1, mg.alert);
      r.text('⚠ MASSE EN HAUSSE', SG.cx, SG.cy - 150, 15, '#ff8a5a', 'center', a, true);
    }
  }

  // étirement de la bille (spaghettification) près de l'horizon
  _drawStretch(ctx, r) {
    const mg = this.mg, b = mg.ball;
    if (!b || b.state !== 'free' || mg.phase === 'outro') return;
    const x = lerp(b.px, b.x, r.alpha), y = lerp(b.py, b.y, r.alpha);
    const dx = SG.cx - x, dy = SG.cy - y, d = Math.hypot(dx, dy) || 1;
    if (d > 120) return;
    const k = Math.pow(1 - d / 120, 1.4);
    const a = Math.atan2(dy, dx);
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(a);
    ctx.globalCompositeOperation = 'lighter';
    const L = b.r * (1 + 2.6 * k), W = b.r * (1 - 0.4 * k);
    const grd = ctx.createLinearGradient(-L, 0, L * 1.6, 0);
    grd.addColorStop(0, 'rgba(255,255,255,0)');
    grd.addColorStop(0.35, rgba('#ffe9c4', 0.55 * k));
    grd.addColorStop(0.7, rgba(AMBER, 0.45 * k));
    grd.addColorStop(1, 'rgba(255,106,42,0)');
    ctx.fillStyle = grd;
    ctx.beginPath(); ctx.ellipse(L * 0.3, 0, L * 1.3, W, 0, 0, TAU); ctx.fill();
    // filaments de marée
    ctx.strokeStyle = rgba('#ffe9c4', 0.5 * k);
    ctx.lineWidth = 1.2;
    for (const o of [-0.5, 0.5]) {
      ctx.beginPath(); ctx.moveTo(0, o * W); ctx.quadraticCurveTo(L, o * W * 0.6, L * 2.2 * k + b.r, 0); ctx.stroke();
    }
    ctx.restore();
  }

  _glitchText(r, str, x, y, size, color, a) {
    const j = Math.sin(r.time * 37) > 0.6 ? 3 : 1.5;
    const ctx = r.ctx;
    ctx.globalCompositeOperation = 'lighter';
    r.text(str, x - j, y, size, '#ff3df2', 'center', a * 0.55, true);
    r.text(str, x + j, y, size, '#29e3ff', 'center', a * 0.55, true);
    ctx.globalCompositeOperation = 'source-over';
    r.text(str, x, y, size, color, 'center', a, true);
  }
}
