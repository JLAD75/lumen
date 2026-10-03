import { FlipperArena } from './arena.js';
import { rand, clamp, TAU, rgba, wrapAngle } from '../util/math.js';

// DÉFENSE DE LA STATION — secteur DÉFENSE.
// Arène à batteurs : des formations de drones descendent vers la ligne de défense.
// Inutile de viser les drones : chaque impact sur l'une des 3 tourelles (grosses
// cibles au milieu du plateau) déclenche un rayon auto-guidé sur le drone le plus
// menaçant. 3 tourelles en quelques secondes = SALVE (onde de choc + tirs doubles).
// Le sommet du dôme déclenche le canon orbital (rayon perforant en colonne).
// Toucher un drone avec la bille reste possible : dégâts ×2.
const GREEN = '#5dff8f';
const RED = '#ff4060';
const AMBER = '#ffb52e';
const SHIELD = '#7fd7ff';
const CX = 281;                     // axe du terrain
const LINE_Y = 560;                 // ligne de défense : la franchir endommage la coque
const LINE_X0 = 46, LINE_X1 = 516;  // entre les renflements des murs
const TURRET_R = 26;
const TURRETS = [[150, 650], [281, 625], [412, 650]];
const LIT_TIME = 5;                 // fenêtre de la salve (s)
const APEX = { x: 300, y: 40, r: 34 }; // sommet du dôme : canon orbital
const MAX_DEBRIS = 90;

const TYPES = {
  scout:   { hp: 1, shield: 0, r: 15, speed: 24, amp: 24, freq: 1.2, pts: 2500, color: '#ff3df2' },
  lancer:  { hp: 2, shield: 0, r: 17, speed: 20, amp: 70, freq: 0.8, pts: 3500, color: '#ff8a3d' },
  tank:    { hp: 2, shield: 1, r: 21, speed: 15, amp: 10, freq: 0.6, pts: 5000, color: AMBER },
  carrier: { hp: 12, shield: 0, r: 46, speed: 8.5, amp: 100, freq: 0.32, pts: 30000, color: '#b07bff' },
};

// Formations : t = délai d'apparition (s), x/y = point de matérialisation.
// Chaque vague arrive en plusieurs groupes : la durée minimale d'une vague est fixée par les renforts.
const WAVES = [
  [ // vague 1 : V d'éclaireurs, puis deux lanciers escortés
    { t: 0, type: 'scout', x: 281, y: 200 },
    { t: 0.15, type: 'scout', x: 221, y: 178 }, { t: 0.15, type: 'scout', x: 341, y: 178 },
    { t: 0.3, type: 'scout', x: 161, y: 156 }, { t: 0.3, type: 'scout', x: 401, y: 156 },
    { t: 7, type: 'lancer', x: 181, y: 172 }, { t: 7, type: 'lancer', x: 381, y: 172 },
    { t: 7.2, type: 'scout', x: 241, y: 150 }, { t: 7.2, type: 'scout', x: 321, y: 150 },
  ],
  [ // vague 2 : blindés escortés, ligne d'éclaireurs, puis seconde paire de blindés
    { t: 0, type: 'tank', x: 211, y: 172 }, { t: 0, type: 'tank', x: 351, y: 172 },
    { t: 0.2, type: 'scout', x: 141, y: 196 }, { t: 0.2, type: 'scout', x: 421, y: 196 },
    { t: 8, type: 'lancer', x: 281, y: 160 },
    { t: 8.2, type: 'scout', x: 191, y: 166 }, { t: 8.2, type: 'scout', x: 371, y: 166 },
    { t: 15, type: 'tank', x: 181, y: 170 }, { t: 15, type: 'tank', x: 381, y: 170 },
  ],
  [ // vague 3 : porte-drones (point faible sous la coque) et son escorte
    { t: 0, type: 'carrier', x: 281, y: 178 },
    { t: 1.6, type: 'lancer', x: 171, y: 236 }, { t: 1.6, type: 'lancer', x: 391, y: 236 },
    { t: 12, type: 'tank', x: 161, y: 250 }, { t: 12, type: 'tank', x: 401, y: 250 },
  ],
];

export class DefenseGame extends FlipperArena {
  constructor(game, opts) {
    const lvl = opts.level || 1;
    super(game, opts, {
      gravity: 2000,
      time: 100,
      title: 'DÉFENSE DE LA STATION',
      objective: 'Touchez les tourelles : elles abattent les drones — batteurs ← →',
      music: 'defense',
      perk: { name: 'Tourelles surchargées', desc: 'Tirs des tourelles à double puissance pendant 12 s' },
    });
    this.speedK = Math.min(1.45, 1 + (lvl - 1) * 0.15);
    this.hull = lvl === 1 ? 5 : 4;
    this.hullMax = this.hull;
    // vagues repoussées lors d'une tentative précédente (jamais la dernière)
    this.cleared = clamp((this.kept && this.kept.wave) || 0, 0, 2);
    this.clearedNow = 0;
    this.wave = this.cleared;
    this.waveOn = false;
    this.waveDelay = 2.6;
    this.spawnQ = [];
    this.drones = [];
    this.pool = [];               // prims de drones réutilisés (jamais retirés du monde)
    this.beams = [];
    this.debris = [];
    this.blasts = [];
    this.timers = [];
    this.shock = null;            // onde de choc de la salve
    this.column = null;           // rayon du canon orbital
    this.overT = 0;               // tourelles surchargées
    this.pierceT = 0;
    this.orbCd = 0;
    this.hullFlash = 0;
    this.glitch = 0;
    this.salvoText = 0;
    this.salvos = 0;
    this.turretHits = 0;
    this.orbitals = 0;
    this.kills = 0;
    this.breaches = 0;
    this.unstuck = 0;
    this.stk = { x: 0, y: 0, t: 0, slow: 0 };
    this.sweep = 0;
    this.intensity = 0.75;
    this._build();
    this.world.build();
  }

  _build() {
    const w = this.world;
    // tourelles : grosses cibles rondes, faciles à atteindre depuis les batteurs
    this.turrets = TURRETS.map(([x, y], i) => {
      const p = w.circle(x, y, TURRET_R, { mat: 'post', kick: 240, kickMin: 70, kickCooldown: 0.12, style: 'turret' });
      const tu = { i, x, y, p, aim: -Math.PI / 2, lit: 0, flash: 0, recoil: 0, cd: 0 };
      p.onHit = (b, imp) => this.hitTurret(tu, b, imp);
      return tu;
    });
    // porte-drones (créé une fois) : toit en pointe (rien ne repose dessus), ventre blindé,
    // point faible circulaire sous la coque
    const armor = { mat: 'metal', kick: 160, kickMin: 60, dynamic: true, enabled: false, style: 'drone' };
    this.carrierArmor = [w.seg(0, -500, 1, -500, { ...armor, r: 5 }), w.seg(0, -500, 1, -500, { ...armor, r: 5 }), w.seg(0, -500, 1, -500, { ...armor, r: 7 })];
    this.carrierCore = w.circle(0, -500, 13, { mat: 'metal', kick: 220, kickMin: 50, dynamic: true, enabled: false, style: 'drone' });
    this.carrierCore.pierceable = true;
    // sommet du dôme : déclenche le canon orbital
    w.zone(APEX.x, APEX.y, APEX.r, { onEnter: (b) => this._orbital(b) });
  }

  entryPoint() { return { x: 281, y: 700 }; }

  placeEntry(ball) {
    super.placeEntry(ball);
    if (this.game.bonus.phaseT > 0) this.pierceT = Math.min(6, this.game.bonus.phaseT);
  }

  applyPerk() { this.overT = 12; this.perkT = 12; }

  // ------------------------------------------------------------ vagues
  _startWave(n) {
    this.wave = n;
    this.waveOn = true;
    this.spawnQ = WAVES[n - 1].map(s => ({ ...s }));
    const g = this.game;
    g.sfx('waveStart');
    if (n === 3) { g.say('defenseCarrier'); g.sfx('defCarrierAlarm'); }
    else g.say('defenseWave', { n });
    g.banner(`VAGUE ${n}/3`, n === 3 ? 'Porte-drones : point faible sous la coque' : 'Drones en approche — touchez les tourelles', GREEN, 1.6);
  }

  _updateWaves(dt) {
    if (!this.waveOn) {
      this.waveDelay -= dt;
      if (this.waveDelay <= 0) this._startWave(this.wave + 1);
      return;
    }
    // ciel dégagé : les renforts suivants arrivent sans attendre
    if (this.drones.length === 0 && this.spawnQ.length) {
      const next = Math.min(...this.spawnQ.map(s => s.t));
      if (next > 0.8) for (const s of this.spawnQ) s.t -= next - 0.8;
    }
    for (let i = this.spawnQ.length - 1; i >= 0; i--) {
      const s = this.spawnQ[i];
      s.t -= dt;
      if (s.t <= 0) { this.spawnQ.splice(i, 1); this._spawn(s.type, s.x, s.y); }
    }
    if (this.spawnQ.length === 0 && this.drones.length === 0) this._waveCleared();
  }

  _waveCleared() {
    const g = this.game;
    this.waveOn = false;
    this.cleared = this.wave;
    this.clearedNow++;
    g.addScore(15000 * this.wave * this.level, CX, 470, `VAGUE ${this.wave} REPOUSSÉE`);
    g.sfx('defWaveClear');
    if (this.wave >= 3) { this.finish(true, 'waves'); return; }
    this.waveDelay = 2;
  }

  _spawn(type, x, y, from) {
    const T = TYPES[type];
    const lvl = this.level;
    let hp = T.hp;
    if (type === 'tank' || type === 'lancer') hp += lvl >= 2 ? 1 : 0;
    if (type === 'carrier') hp = Math.min(16, T.hp + (lvl - 1));
    // phase 0 ou π : le balancement part du point d'apparition (pas de saut), même sens pour la formation
    const phase = from ? (Math.random() < 0.5 ? 0 : Math.PI) : (this.wave % 2 ? 0 : Math.PI);
    const d = {
      type, T, x, y, baseX: x, r: T.r, hp, maxHp: hp, shield: T.shield, maxShield: T.shield,
      vx: 0, vy: T.speed * this.speedK, t: 0, phase, amp: T.amp, freq: T.freq,
      warp: 0, flash: 0, shieldFlash: 0, hitCd: 0, ping: 0, warned: false, alive: true, seed: rand(0, TAU),
      spawnT: 3.5, from: from || null, parts: [],
    };
    if (type === 'carrier') {
      d.parts = [...this.carrierArmor, this.carrierCore];
      d.p = this.carrierCore;
      for (const p of this.carrierArmor) p.onHit = (b, imp) => this._ballHitArmor(d, b, imp);
      this.carrierCore.onHit = (b, imp, nx, ny, p, pierced) => this._ballHit(d, b, imp, pierced);
    } else {
      const p = this.pool.pop() || this.world.circle(0, -500, T.r, { mat: 'metal', dynamic: true, enabled: false, style: 'drone' });
      p.r = T.r; p.kick = 200; p.kickMin = 60; p.kickCooldown = 0.1; p.kickReady = 0; p._phaseT = 0;
      p.pierceable = true;
      p.onHit = (b, imp, nx, ny, pp, pierced) => this._ballHit(d, b, imp, pierced);
      d.p = p; d.parts = [p];
    }
    for (const p of d.parts) p.enabled = false;
    this._place(d, 0);
    this.drones.push(d);
    this.game.sfx('defWarp', (x - CX) / CX);
    return d;
  }

  // limites de vol : loin des murs et du dôme (l'orbite et les côtés restent libres)
  _clampX(x, y, r) {
    const bulge = clamp(y - 500, 0, 100) * 0.42;  // renflements des murs (y 500 → 600)
    let lo = Math.max(75 + r, 20 + bulge + (34 + r) * 1.09), hi = Math.min(487 - r, 542 - bulge - (34 + r) * 1.09);
    if (y < 300) {
      const R = 244 - r, dy = 300 - y;
      const dx = Math.sqrt(Math.max(0, R * R - dy * dy));
      lo = Math.max(lo, APEX.x - dx); hi = Math.min(hi, APEX.x + dx);
    }
    return lo > hi ? (lo + hi) / 2 : clamp(x, lo, hi);
  }

  _moveDrone(d, dt) {
    d.t += dt;
    const ox = d.x, oy = d.y;
    if (d.warp < 1) d.warp = Math.min(1, d.warp + dt / 0.7);
    const k = d.warp < 1 ? 0.3 : 1;            // lent pendant la matérialisation
    d.y += d.vy * k * dt;
    if (d.type === 'carrier') d.x = CX + Math.sin(d.t * d.freq + d.phase) * d.amp;
    else d.x = d.baseX + Math.sin(d.t * d.freq + d.phase) * d.amp;
    d.x = this._clampX(d.x, d.y, d.type === 'carrier' ? 64 : d.r);
    this._place(d, dt, ox, oy);
  }

  _place(d, dt, ox = d.x, oy = d.y) {
    const vx = dt > 0 ? (d.x - ox) / dt : 0, vy = dt > 0 ? (d.y - oy) / dt : 0;
    // activation physique seulement si la bille n'est pas dans la silhouette
    const b = this.ball;
    const solid = d.warp >= 0.6 && d.alive;
    if (d.type === 'carrier') {
      const [rL, rR, belly] = this.carrierArmor, C = this.carrierCore;
      const x = d.x, y = d.y;
      this.world.moveSeg(rL, x - 64, y - 4, x, y - 30);
      this.world.moveSeg(rR, x, y - 30, x + 64, y - 4);
      this.world.moveSeg(belly, x - 58, y + 8, x + 58, y + 8);
      for (const p of this.carrierArmor) { p.vx = vx; p.vy = vy; }
      C.x = x; C.y = y + 20; C.vx = vx; C.vy = vy;
      if (solid && !C.enabled && b && Math.abs(b.x - x) < 84 && Math.abs(b.y - y) < 56) return;
      for (const p of d.parts) p.enabled = solid;
    } else {
      const p = d.p;
      p.x = d.x; p.y = d.y; p.vx = vx; p.vy = vy;
      if (solid && !p.enabled && b && Math.hypot(b.x - d.x, b.y - d.y) < d.r + b.r + 2) return;
      p.enabled = solid;
    }
  }

  // bas de la silhouette (franchissement de la ligne)
  _bottom(d) { return d.type === 'carrier' ? d.y + 33 : d.y + d.r; }
  _aimPoint(d) { return d.type === 'carrier' ? { x: d.x, y: d.y + 20 } : { x: d.x, y: d.y }; }

  // ------------------------------------------------------------ boucle
  arenaStep(dt) {
    const play = this.state === 'play';
    if (this.overT > 0) this.overT -= dt;
    if (this.pierceT > 0) this.pierceT -= dt;
    if (this.orbCd > 0) this.orbCd -= dt;
    for (const b of this.world.balls) b.pierce = this.pierceT > 0;
    this.hullFlash = Math.max(0, this.hullFlash - dt);
    this.glitch = Math.max(0, this.glitch - dt);
    this.salvoText = Math.max(0, this.salvoText - dt);
    for (let i = this.timers.length - 1; i >= 0; i--) {
      const tm = this.timers[i];
      tm.t -= dt;
      if (tm.t <= 0) { this.timers.splice(i, 1); if (this.state !== 'ended') tm.fn(); }
    }
    if (play) this._updateWaves(dt);
    if (this.state === 'ended') return;
    // drones (figés pendant une relance)
    let threat = 0;
    for (const d of [...this.drones]) {
      d.flash = Math.max(0, d.flash - dt * 4);
      d.shieldFlash = Math.max(0, d.shieldFlash - dt * 3);
      d.ping = Math.max(0, d.ping - dt * 1.5);
      if (d.hitCd > 0) d.hitCd -= dt;
      if (!play) { this._place(d, dt); continue; }
      this._moveDrone(d, dt);
      if (d.type === 'carrier') this._carrierLaunch(d, dt);
      const gap = LINE_Y - this._bottom(d);
      if (gap < 110) {
        threat = Math.max(threat, 1 - gap / 110);
        if (!d.warned) { d.warned = true; this.game.sfx('defWarning', (d.x - CX) / CX); }
      }
      if (gap <= 0) this._breach(d);
      if (this.state === 'ended') return;
    }
    this._updateTurrets(dt, play);
    this._updateShock(dt);
    this._updateFx(dt);
    if (this.column) { this.column.t += dt; if (this.column.t >= this.column.life) this.column = null; }
    // balayage radar : ping des drones survolés
    this.sweep += dt;
    const sa = this._sweepAngle();
    for (const d of this.drones) {
      const a = Math.atan2(d.y - LINE_Y, d.x - CX);
      if (Math.abs(wrapAngle(a - sa)) < 0.06) d.ping = 1;
    }
    this.intensity = 0.72 + this.wave * 0.05 + threat * 0.15;
  }

  // anti-blocage : bille immobile (ou qui se traîne) hors des batteurs = petite poussée
  afterStep(dt) {
    const b = this.ball, S = this.stk;
    if (!b || b.state !== 'free' || this.state !== 'play') { S.t = 0; S.slow = 0; return; }
    const f = this.frame;
    const cradle = b.y > 860 && (f.flipL.pressed || f.flipR.pressed);
    if (!cradle && Math.abs(b.x - S.x) < 5 && Math.abs(b.y - S.y) < 5) S.t += dt;
    else { S.x = b.x; S.y = b.y; S.t = 0; }
    const sp = Math.hypot(b.vx, b.vy);
    if (b.y < 860 && sp < 100) S.slow += dt; else if (sp > 250 || b.y >= 860) S.slow = 0;
    if (S.t > 1.5 || S.slow > 2.5) {
      S.t = 0; S.slow = 0;
      this.unstuck++;
      b.vx = rand(-280, 280); b.vy = -420;
      this.game.say('stuck');
    }
  }

  _sweepAngle() { return Math.PI * 1.5 - Math.cos(this.sweep * 0.8) * Math.PI * 0.5; }

  _carrierLaunch(d, dt) {
    d.spawnT -= dt;
    if (d.spawnT > 0 || d.warp < 1 || d.y > 420) return;   // trop bas : plus de lancement
    d.spawnT = 6;
    const mine = this.drones.filter(o => o.from === d).length;
    if (mine >= 3) return;
    const side = (this.kills + mine) % 2 ? 1 : -1;
    const s = this._spawn('scout', d.x + side * 50, d.y + 40, d);
    s.warp = 0.5;
    this.game.sfx('laser');
  }

  _updateTurrets(dt, play) {
    const target = this._pickTarget(null, null);
    for (const tu of this.turrets) {
      tu.flash = Math.max(0, tu.flash - dt * 3);
      tu.recoil = Math.max(0, tu.recoil - dt * 5);
      if (tu.cd > 0) tu.cd -= dt;
      if (play && tu.lit > 0) tu.lit = Math.max(0, tu.lit - dt);
      // visée : suit la menace principale, balayage au repos
      let want = -Math.PI / 2 + Math.sin(this.time * 0.9 + tu.i * 2) * 0.7;
      if (target) { const a = this._aimPoint(target); want = Math.atan2(a.y - tu.y, a.x - tu.x); }
      want = clamp(want, -Math.PI + 0.12, -0.12);
      tu.aim += wrapAngle(want - tu.aim) * Math.min(1, dt * 7);
    }
  }

  // ------------------------------------------------------------ tourelles
  hitTurret(tu, b, imp) {
    if (this.state !== 'play' || imp < 90 || tu.cd > 0) return;
    const g = this.game;
    tu.cd = 0.3;
    tu.lit = LIT_TIME;
    this.turretHits++;
    const lit = this.turrets.filter(o => o.lit > 0).length;
    g.addScore(750, tu.x, tu.y - 44);
    g.sfx('defTurretHit', (tu.x - CX) / CX, lit);
    this._fire(tu, 1, null);
    if (lit >= 3) this._salvo();
  }

  // drone le plus menaçant (le plus bas), en évitant ceux déjà visés si possible
  _pickTarget(tu, used) {
    let best = null, bestFree = null;
    for (const d of this.drones) {
      if (!d.alive || d.warp < 0.3) continue;
      const k = this._bottom(d);
      if (!best || k > this._bottom(best)) best = d;
      if ((!used || !used.has(d)) && (!bestFree || k > this._bottom(bestFree))) bestFree = d;
    }
    return bestFree || best;
  }

  _fire(tu, mul, used) {
    const g = this.game;
    const d = this._pickTarget(tu, used);
    tu.flash = 1; tu.recoil = 1;
    const pan = (tu.x - CX) / CX;
    if (!d) { g.sfx('turret'); return null; }
    if (used) used.add(d);
    const a = this._aimPoint(d);
    tu.aim = clamp(Math.atan2(a.y - tu.y, a.x - tu.x), -Math.PI + 0.12, -0.12);
    const over = this.overT > 0;
    const dmg = (over ? 2 : 1) * mul;
    const c = Math.cos(tu.aim), s = Math.sin(tu.aim);
    this.beams.push({ x0: tu.x + c * 34, y0: tu.y + s * 34, x1: a.x, y1: a.y, t: 0, life: 0.3, w: dmg > 1 ? 1.5 : 1, color: over ? '#d6ffe4' : GREEN, seed: Math.random() * 100 });
    if (this.beams.length > 8) this.beams.shift();
    g.sfx('defTurretFire', pan, dmg);
    this.damage(d, dmg, 'beam');
    return d;
  }

  _salvo() {
    const g = this.game;
    this.salvos++;
    for (const tu of this.turrets) tu.lit = 0;
    this.shock = { r: 0, hit: new Set() };
    const used = new Set();
    this.turrets.forEach((tu, k) => this.timers.push({ t: 0.1 + k * 0.09, fn: () => this._fire(tu, 2, used) }));
    this.salvoText = 1.4;
    this.setBarrier(3);           // la salve arme aussi le bouclier de la station sous les batteurs
    g.addScore(10000 * this.level, CX, 520, 'SALVE');
    g.sfx('defSalvo');
    g.say('defenseSalvo');
    g.fx.flash(GREEN, 0.22);
    g.fx.shake(5);
  }

  // onde de choc de la salve : 1 dégât à chaque drone atteint par le front
  _updateShock(dt) {
    const S = this.shock;
    if (!S) return;
    S.r += 950 * dt;
    for (const d of [...this.drones]) {
      if (S.hit.has(d)) continue;
      const a = this._aimPoint(d);
      if (Math.hypot(a.x - CX, a.y - LINE_Y) <= S.r) { S.hit.add(d); this.damage(d, 1, 'shock'); }
    }
    if (S.r > 720) this.shock = null;
  }

  // canon orbital : la bille atteint le sommet du dôme → colonne perforante
  _orbital(b) {
    if (this.state !== 'play' || this.orbCd > 0) return;
    const g = this.game;
    this.orbCd = 2.5;
    this.orbitals++;
    const target = this._pickTarget(null, null);
    const col = target ? this._aimPoint(target).x : b.x;
    this.column = { x: col, t: 0, life: 0.5 };
    const dmg = this.overT > 0 ? 4 : 2;
    for (const d of [...this.drones]) {
      const w = d.type === 'carrier' ? 40 : d.r + 26;
      if (Math.abs(d.x - col) < w) this.damage(d, dmg, 'orbital');
    }
    g.addScore(5000, APEX.x, APEX.y + 60, 'CANON ORBITAL');
    g.sfx('defOrbital');
    g.say('defenseOrbital');
    g.fx.flash('#d6ffe4', 0.15);
    g.fx.shake(4);
  }

  // ------------------------------------------------------------ drones
  _ballHit(d, b, imp, pierced) {
    if (!d.alive || this.state !== 'play' || d.hitCd > 0) return;
    if (!pierced && imp < 70) return;
    d.hitCd = 0.2;
    const g = this.game;
    const label = d.type === 'carrier' ? 'POINT FAIBLE' : undefined;
    g.addScore(d.type === 'carrier' ? 3000 : 750, d.x, d.y - d.r - 16, label);
    if (d.type === 'carrier') g.sfx('defWeakPoint');
    this.damage(d, 2, 'ball');
  }

  _ballHitArmor(d, b, imp) {
    if (!d.alive || imp < 70 || d.hitCd > 0) return;
    d.hitCd = 0.15;
    this.game.sfx('bossShield');
    this.game.fx.burst(b.x, b.y - 10, '#d8c8ff', 4, 160);
  }

  damage(d, n, src) {
    if (!d.alive || this.state === 'ended') return;
    const g = this.game;
    if (d.shield > 0) {
      d.shield--;
      d.shieldFlash = 1;
      g.sfx('defShield', (d.x - CX) / CX);
      g.fx.ring(d.x, d.y, SHIELD, d.r * 2.4, 0.35);
      g.fx.burst(d.x, d.y, SHIELD, 6, 220);
      return;
    }
    d.hp -= n;
    d.flash = 1;
    if (d.hp <= 0) { this._kill(d, src); return; }
    g.sfx('droneHit');
    const a = this._aimPoint(d);
    g.fx.burst(a.x, a.y, '#ffe0f0', 5, 180);
  }

  _remove(d) {
    d.alive = false;
    for (const p of d.parts) { p.enabled = false; p.onHit = null; }
    if (d.type !== 'carrier') this.pool.push(d.p);
    const i = this.drones.indexOf(d);
    if (i >= 0) this.drones.splice(i, 1);
  }

  _kill(d, src) {
    if (!d.alive) return;
    const g = this.game;
    this._remove(d);
    this.kills++;
    const big = d.type === 'carrier';
    const pts = d.T.pts * (src === 'ball' ? 2 : 1);
    g.addScore(pts, d.x, d.y - 20, src === 'ball' ? 'IMPACT DIRECT' : undefined);
    g.sfx(big ? 'explosion' : 'droneExplode');
    this._explode(d.x, d.y, d.T.color, big ? 3 : d.type === 'tank' ? 1.5 : 1);
    if (big) {
      g.fx.shake(10);
      g.fx.flash('#b07bff', 0.3);
      // les drones lancés par le porte-drones s'éteignent avec lui
      for (const o of [...this.drones]) if (o.from === d) this._kill(o, 'chain');
    }
  }

  _breach(d) {
    const g = this.game;
    const dmg = d.type === 'carrier' ? 3 : 1;
    this._remove(d);
    this.breaches++;
    this.hull = Math.max(0, this.hull - dmg);
    this.hullFlash = 0.7;
    this.glitch = 0.45;
    g.sfx('hullHit');
    g.fx.shake(7);
    g.fx.flash(RED, 0.22);
    this._explode(d.x, LINE_Y - 6, RED, d.type === 'carrier' ? 3 : 1.2);
    if (this.hull <= 0) { this.finish(false, 'hull'); return; }
    g.say(this.hull === 1 ? 'defenseCritical' : 'defenseHull', { hull: `${this.hull}/${this.hullMax}` });
  }

  // explosion : éclats, anneaux, débris (plafonnés)
  _explode(x, y, color, size) {
    const fx = this.game.fx;
    fx.burst(x, y, color, Math.round(8 + size * 6), 200 + size * 110);
    fx.burst(x, y, '#ffffff', Math.round(3 + size * 2), 160);
    fx.ring(x, y, color, 30 + size * 28, 0.5);
    if (size >= 1.5) fx.ring(x, y, '#ffffff', 50 + size * 40, 0.7);
    this.blasts.push({ x, y, t: 0, life: 0.3 + size * 0.08, r: 18 + size * 20, color });
    if (this.blasts.length > 10) this.blasts.shift();
    const n = Math.round(5 + size * 4);
    for (let i = 0; i < n; i++) {
      if (this.debris.length >= MAX_DEBRIS) this.debris.shift();
      const a = rand(0, TAU), s = rand(80, 260 + size * 60);
      this.debris.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 60, a: rand(0, TAU), va: rand(-12, 12), len: rand(3, 6 + size * 2), t: 0, life: rand(0.5, 0.9), color: i % 3 ? color : '#ffffff' });
    }
  }

  _updateFx(dt) {
    for (let i = this.beams.length - 1; i >= 0; i--) { const bm = this.beams[i]; bm.t += dt; if (bm.t >= bm.life) this.beams.splice(i, 1); }
    for (let i = this.blasts.length - 1; i >= 0; i--) { const bl = this.blasts[i]; bl.t += dt; if (bl.t >= bl.life) this.blasts.splice(i, 1); }
    for (let i = this.debris.length - 1; i >= 0; i--) {
      const p = this.debris[i];
      p.t += dt;
      if (p.t >= p.life) { this.debris.splice(i, 1); continue; }
      p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 420 * dt; p.vx *= 1 - 1.5 * dt; p.a += p.va * dt;
    }
  }

  resetCombos() { this.pierceT = 0; }

  // vagues repoussées : la tentative suivante reprend à la vague suivante
  keepProgress() { return { wave: this.cleared }; }

  results(success) {
    const extra = this.hull >= Math.ceil(this.hullMax / 2) ? 2 : 1;
    return {
      rewards: success ? [{ type: 'deferredMB', count: extra }] : [],
      points: 15000 * this.clearedNow * this.level + (success ? Math.round(this.timeLeft) * 800 : 0),
    };
  }

  progressText() {
    const w = Math.max(1, Math.min(3, this.waveOn ? this.wave : this.cleared + 1));
    return `Vague ${w}/3 · drones ${this.drones.length} · coque ${this.hull}/${this.hullMax}`;
  }

  // ------------------------------------------------------------ rendu statique
  // contour de la zone aérienne (dôme + murs, au-dessus de la ligne)
  _airspace(p) {
    p.moveTo(20, LINE_Y); p.lineTo(20, 300);
    p.arc(300, 300, 277, Math.PI, TAU - Math.acos(242 / 277));
    p.lineTo(542, LINE_Y); p.closePath();
    return p;
  }

  drawStatic(g) {
    g.save();
    // zone aérienne : radar tactique holographique
    g.beginPath();
    this._airspace(g);
    g.clip();
    const rg = g.createRadialGradient(CX, LINE_Y, 20, CX, LINE_Y, 560);
    rg.addColorStop(0, rgba(GREEN, 0.10)); rg.addColorStop(0.6, rgba(GREEN, 0.03)); rg.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = rg; g.fillRect(20, 0, 522, LINE_Y);
    g.strokeStyle = rgba(GREEN, 0.05); g.lineWidth = 1;
    g.beginPath();
    for (let x = 41; x < 542; x += 40) { g.moveTo(x, 0); g.lineTo(x, LINE_Y); }
    for (let y = LINE_Y - 40; y > 0; y -= 40) { g.moveTo(20, y); g.lineTo(542, y); }
    g.stroke();
    for (let k = 1; k <= 5; k++) {
      const rr = k * 110;
      g.strokeStyle = rgba(GREEN, k % 2 ? 0.16 : 0.09); g.lineWidth = k % 2 ? 1.5 : 1;
      g.setLineDash(k % 2 ? [] : [4, 8]);
      g.beginPath(); g.arc(CX, LINE_Y, rr, Math.PI, TAU); g.stroke();
    }
    g.setLineDash([]);
    g.strokeStyle = rgba(GREEN, 0.07);
    g.beginPath();
    for (let k = 1; k < 12; k++) { const a = Math.PI + k * Math.PI / 12; g.moveTo(CX + Math.cos(a) * 60, LINE_Y + Math.sin(a) * 60); g.lineTo(CX + Math.cos(a) * 640, LINE_Y + Math.sin(a) * 640); }
    g.stroke();
    // graduations et distances
    g.font = '600 9px "Rajdhani", sans-serif';
    g.textAlign = 'left'; g.textBaseline = 'middle';
    g.fillStyle = rgba(GREEN, 0.3);
    for (let k = 1; k <= 4; k++) g.fillText(`${k * 250} m`, CX + 4, LINE_Y - k * 110 + 8);
    g.strokeStyle = rgba(GREEN, 0.2);
    g.beginPath();
    for (let k = 0; k <= 48; k++) {
      const a = Math.PI + k * Math.PI / 48, r0 = k % 4 ? 214 : 206;
      g.moveTo(CX + Math.cos(a) * r0, LINE_Y + Math.sin(a) * r0); g.lineTo(CX + Math.cos(a) * 222, LINE_Y + Math.sin(a) * 222);
    }
    g.stroke();
    // sommet du dôme : liaison du canon orbital
    g.strokeStyle = rgba(GREEN, 0.3); g.lineWidth = 1.5;
    g.setLineDash([3, 5]);
    g.beginPath(); g.arc(APEX.x, APEX.y, APEX.r, 0, TAU); g.stroke();
    g.setLineDash([]);
    g.fillStyle = rgba(GREEN, 0.35);
    for (const dx of [-14, 0, 14]) { g.beginPath(); g.moveTo(APEX.x + dx - 5, 96); g.lineTo(APEX.x + dx, 89); g.lineTo(APEX.x + dx + 5, 96); g.fill(); }
    g.font = '700 10px "Rajdhani", sans-serif';
    g.textAlign = 'center';
    g.fillText('CANON ORBITAL', APEX.x, 108);
    g.restore();

    // pont de la station sous la ligne : plaques de blindage
    g.save();
    g.beginPath(); g.rect(20, LINE_Y, 522, 170); g.clip();
    const dg = g.createLinearGradient(0, LINE_Y, 0, LINE_Y + 170);
    dg.addColorStop(0, 'rgba(4,14,9,0.75)'); dg.addColorStop(1, 'rgba(4,14,9,0)');
    g.fillStyle = dg; g.fillRect(20, LINE_Y, 522, 170);
    g.strokeStyle = 'rgba(0,0,0,0.45)'; g.lineWidth = 2;
    g.beginPath();
    for (let x = 20; x < 542; x += 64) { g.moveTo(x, LINE_Y + 14); g.lineTo(x, LINE_Y + 170); }
    for (let y = LINE_Y + 14; y < LINE_Y + 170; y += 46) { g.moveTo(20, y); g.lineTo(542, y); }
    g.stroke();
    g.fillStyle = 'rgba(160,255,200,0.05)';
    for (let x = 20; x < 542; x += 64) for (let y = LINE_Y + 14; y < LINE_Y + 170; y += 46) g.fillRect(x + 2, y + 2, 60, 1);
    // bande de danger le long de la ligne
    g.beginPath(); g.rect(20, LINE_Y + 3, 522, 8); g.clip();
    g.fillStyle = rgba(AMBER, 0.32);
    for (let x = 10; x < 560; x += 16) { g.beginPath(); g.moveTo(x, LINE_Y + 11); g.lineTo(x + 8, LINE_Y + 3); g.lineTo(x + 16, LINE_Y + 3); g.lineTo(x + 8, LINE_Y + 11); g.fill(); }
    g.restore();

    // conduits d'énergie entre tourelles
    g.lineCap = 'round';
    g.strokeStyle = '#0a1a10'; g.lineWidth = 9;
    g.beginPath(); g.moveTo(TURRETS[0][0], TURRETS[0][1]); g.lineTo(TURRETS[1][0], TURRETS[1][1]); g.lineTo(TURRETS[2][0], TURRETS[2][1]); g.stroke();
    g.strokeStyle = rgba(GREEN, 0.18); g.lineWidth = 2; g.stroke();
    // socles des tourelles : octogones boulonnés, anneau de danger
    for (const [x, y] of TURRETS) {
      g.fillStyle = '#08120c';
      g.beginPath();
      for (let k = 0; k < 8; k++) { const a = Math.PI / 8 + k * Math.PI / 4; g.lineTo(x + Math.cos(a) * 42, y + Math.sin(a) * 42); }
      g.closePath(); g.fill();
      g.strokeStyle = '#1f3a2a'; g.lineWidth = 3; g.stroke();
      g.strokeStyle = rgba(GREEN, 0.25); g.lineWidth = 1; g.stroke();
      g.strokeStyle = rgba(AMBER, 0.35); g.lineWidth = 4;
      g.setLineDash([6, 6]);
      g.beginPath(); g.arc(x, y, 35, 0, TAU); g.stroke();
      g.setLineDash([]);
      g.fillStyle = '#4d6a5a';
      for (let k = 0; k < 8; k++) { const a = k * Math.PI / 4; g.beginPath(); g.arc(x + Math.cos(a) * 39, y + Math.sin(a) * 39, 1.6, 0, TAU); g.fill(); }
    }
    // jauge de coque (cadre)
    g.font = '700 9px "Rajdhani", sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = rgba(GREEN, 0.45);
    g.fillText('INTÉGRITÉ DE LA COQUE', CX, 700);
    g.fillStyle = 'rgba(2,8,5,0.85)';
    g.fillRect(CX - 92, 707, 184, 16);
    g.strokeStyle = rgba(GREEN, 0.3); g.lineWidth = 1;
    g.strokeRect(CX - 92, 707, 184, 16);
    // pylônes émetteurs aux extrémités de la ligne
    for (const x of [LINE_X0, LINE_X1]) {
      g.fillStyle = '#0d1a14'; g.fillRect(x - 6, LINE_Y - 12, 12, 24);
      g.strokeStyle = rgba(GREEN, 0.5); g.lineWidth = 1; g.strokeRect(x - 6, LINE_Y - 12, 12, 24);
    }
  }

  // ------------------------------------------------------------ rendu dynamique
  renderArena(ctx, r) {
    const t = r.time;
    this._drawRadar(ctx, r);
    this._drawLine(ctx, r, t);
    this._drawLinks(ctx, r, t);
    for (const d of this.drones) this._drawDrone(ctx, r, d, t);
    for (const tu of this.turrets) this._drawTurret(ctx, r, tu, t);
    this._drawHull(ctx, r, t);
    this._drawApex(ctx, r, t);
    if (!this.waveOn && this.state === 'play' && this.cleared < 3) {
      const a = 0.55 + 0.45 * Math.sin(t * 6);
      this._glitchText(r, `VAGUE ${this.wave + 1}/3`, CX, 360, 26, GREEN, a);
      r.text('PRÉPAREZ LES TOURELLES', CX, 392, 12, GREEN, 'center', 0.6);
    }
  }

  renderTop(ctx, r) {
    const t = r.time;
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    // rayons des tourelles
    for (const bm of this.beams) {
      const a = 1 - bm.t / bm.life;
      const dx = bm.x1 - bm.x0, dy = bm.y1 - bm.y0, l = Math.hypot(dx, dy) || 1;
      const nx = -dy / l, ny = dx / l;
      ctx.strokeStyle = rgba(bm.color, 0.22 * a); ctx.lineWidth = 16 * bm.w;
      ctx.beginPath(); ctx.moveTo(bm.x0, bm.y0); ctx.lineTo(bm.x1, bm.y1); ctx.stroke();
      ctx.strokeStyle = rgba(bm.color, 0.75 * a); ctx.lineWidth = 4.5 * bm.w;
      ctx.beginPath(); ctx.moveTo(bm.x0, bm.y0);
      for (let k = 1; k < 6; k++) {
        const u = k / 6, j = Math.sin(bm.seed + k * 2.3 + t * 60) * 3 * a;
        ctx.lineTo(bm.x0 + dx * u + nx * j, bm.y0 + dy * u + ny * j);
      }
      ctx.lineTo(bm.x1, bm.y1); ctx.stroke();
      ctx.strokeStyle = rgba('#ffffff', 0.95 * a); ctx.lineWidth = 1.6 * bm.w;
      ctx.beginPath(); ctx.moveTo(bm.x0, bm.y0); ctx.lineTo(bm.x1, bm.y1); ctx.stroke();
      ctx.globalCompositeOperation = 'source-over';
      r.glow(bm.x0, bm.y0, 50 * bm.w, bm.color, a);
      r.glow(bm.x1, bm.y1, 80 * bm.w, '#ffffff', a * 0.8);
      ctx.globalCompositeOperation = 'lighter';
    }
    // canon orbital : colonne de lumière
    const C = this.column;
    if (C) {
      ctx.save();
      if (!this.airPath) this.airPath = this._airspace(new Path2D());
      ctx.clip(this.airPath);
      const a = 1 - C.t / C.life;
      const w = 34 * (0.6 + 0.4 * a);
      ctx.fillStyle = rgba(GREEN, 0.18 * a); ctx.fillRect(C.x - w, 20, w * 2, LINE_Y - 20);
      ctx.fillStyle = rgba('#d6ffe4', 0.45 * a); ctx.fillRect(C.x - w * 0.35, 20, w * 0.7, LINE_Y - 20);
      ctx.fillStyle = rgba('#ffffff', 0.9 * a); ctx.fillRect(C.x - 2, 20, 4, LINE_Y - 20);
      for (let y = 30; y < LINE_Y; y += 18) {
        ctx.fillStyle = rgba(GREEN, 0.35 * a * (0.5 + 0.5 * Math.sin(y * 0.3 + t * 40)));
        ctx.fillRect(C.x - w, y, w * 2, 2);
      }
      ctx.restore();
    }
    // onde de choc de la salve
    const S = this.shock;
    if (S) {
      ctx.save();
      if (!this.airPath) this.airPath = this._airspace(new Path2D());
      ctx.clip(this.airPath);
      const a = Math.max(0, 1 - S.r / 720);
      ctx.strokeStyle = rgba(GREEN, 0.8 * a); ctx.lineWidth = 6;
      ctx.beginPath(); ctx.arc(CX, LINE_Y, S.r, Math.PI, TAU); ctx.stroke();
      ctx.strokeStyle = rgba('#ffffff', 0.7 * a); ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(CX, LINE_Y, Math.max(1, S.r - 8), Math.PI, TAU); ctx.stroke();
      ctx.strokeStyle = rgba(GREEN, 0.25 * a); ctx.lineWidth = 22;
      ctx.beginPath(); ctx.arc(CX, LINE_Y, Math.max(1, S.r - 20), Math.PI, TAU); ctx.stroke();
      ctx.restore();
    }
    // souffles d'explosion
    for (const bl of this.blasts) {
      const u = bl.t / bl.life;
      ctx.fillStyle = rgba('#ffffff', 0.35 * (1 - u));
      ctx.beginPath(); ctx.arc(bl.x, bl.y, bl.r * (0.4 + u * 0.6), 0, TAU); ctx.fill();
      ctx.strokeStyle = rgba(bl.color, 0.9 * (1 - u)); ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(bl.x, bl.y, bl.r * (0.6 + u * 1.4), 0, TAU); ctx.stroke();
    }
    // débris
    ctx.lineWidth = 2;
    for (const p of this.debris) {
      const a = 1 - p.t / p.life;
      const c = Math.cos(p.a) * p.len, s = Math.sin(p.a) * p.len;
      ctx.strokeStyle = rgba(p.color, a);
      ctx.beginPath(); ctx.moveTo(p.x - c, p.y - s); ctx.lineTo(p.x + c, p.y + s); ctx.stroke();
    }
    ctx.globalCompositeOperation = 'source-over';
    // parasites d'affichage lors d'une brèche
    if (this.glitch > 0) {
      const k = this.glitch / 0.45;
      for (let i = 0; i < 5; i++) {
        const y = 40 + ((i * 197 + Math.floor(t * 30) * 89) % 980);
        ctx.fillStyle = i % 2 ? rgba('#ff3df2', 0.14 * k) : rgba('#29e3ff', 0.12 * k);
        ctx.fillRect(20 + (i * 37) % 60, y, 522 - (i * 53) % 120, 3 + (i % 3) * 4);
      }
    }
    if (this.salvoText > 0) {
      const a = Math.min(1, this.salvoText / 0.4);
      this._glitchText(r, 'SALVE !', CX, 470, 34, GREEN, a);
    }
  }

  // texte à aberration chromatique (cyan / magenta)
  _glitchText(r, str, x, y, size, color, a) {
    const j = Math.sin(r.time * 37) > 0.6 ? 3 : 1.5;
    const ctx = r.ctx;
    ctx.globalCompositeOperation = 'lighter';
    r.text(str, x - j, y, size, '#ff3df2', 'center', a * 0.55, true);
    r.text(str, x + j, y, size, '#29e3ff', 'center', a * 0.55, true);
    ctx.globalCompositeOperation = 'source-over';
    r.text(str, x, y, size, color, 'center', a, true);
  }

  _drawRadar(ctx) {
    const a = this._sweepAngle();
    const dir = Math.sin(this.sweep * 0.8) >= 0 ? 1 : -1;
    ctx.save();
    if (!this.airPath) this.airPath = this._airspace(new Path2D());
    ctx.clip(this.airPath);
    ctx.globalCompositeOperation = 'lighter';
    const R = 640;
    for (let k = 0; k < 7; k++) {
      const a0 = a - dir * k * 0.05, a1 = a - dir * (k + 1) * 0.05;
      ctx.fillStyle = rgba(GREEN, 0.075 * (1 - k / 7));
      ctx.beginPath(); ctx.moveTo(CX, LINE_Y);
      ctx.lineTo(CX + Math.cos(a0) * R, LINE_Y + Math.sin(a0) * R);
      ctx.lineTo(CX + Math.cos(a1) * R, LINE_Y + Math.sin(a1) * R);
      ctx.closePath(); ctx.fill();
    }
    ctx.strokeStyle = rgba(GREEN, 0.35); ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(CX, LINE_Y); ctx.lineTo(CX + Math.cos(a) * R, LINE_Y + Math.sin(a) * R); ctx.stroke();
    ctx.restore();
  }

  _drawLine(ctx, r, t) {
    let danger = 0;
    for (const d of this.drones) danger = Math.max(danger, 1 - (LINE_Y - this._bottom(d)) / 110);
    const hurt = this.hullFlash > 0;
    const col = hurt ? RED : danger > 0 ? (Math.sin(t * 14) > 0 ? RED : AMBER) : GREEN;
    // rideau d'énergie au-dessus de la ligne
    const grd = ctx.createLinearGradient(0, LINE_Y - 46, 0, LINE_Y);
    grd.addColorStop(0, rgba(col, 0)); grd.addColorStop(1, rgba(col, 0.14 + danger * 0.12 + (hurt ? 0.2 : 0)));
    ctx.fillStyle = grd;
    ctx.fillRect(LINE_X0, LINE_Y - 46, LINE_X1 - LINE_X0, 46);
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = rgba(col, 0.25); ctx.lineWidth = 9;
    ctx.beginPath(); ctx.moveTo(LINE_X0, LINE_Y); ctx.lineTo(LINE_X1, LINE_Y); ctx.stroke();
    ctx.setLineDash([14, 8]); ctx.lineDashOffset = -t * 40;
    ctx.strokeStyle = rgba(col, 0.9); ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.moveTo(LINE_X0, LINE_Y); ctx.lineTo(LINE_X1, LINE_Y); ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalCompositeOperation = 'source-over';
    for (const x of [LINE_X0, LINE_X1]) r.glow(x, LINE_Y, 40, col, 0.7 + 0.3 * Math.sin(t * 8));
    r.text('LIGNE DE DÉFENSE', 112, LINE_Y + 22, 10, col, 'center', 0.75, true);
    // marqueurs d'impact sous les drones menaçants
    for (const d of this.drones) {
      const gap = LINE_Y - this._bottom(d);
      if (gap > 110) continue;
      const blink = Math.sin(t * 16) > 0 ? 1 : 0.4;
      ctx.strokeStyle = rgba(RED, 0.6 * blink); ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 5]);
      ctx.beginPath(); ctx.moveTo(d.x, this._bottom(d) + 4); ctx.lineTo(d.x, LINE_Y - 4); ctx.stroke();
      ctx.setLineDash([]);
      r.glow(d.x, LINE_Y, 70, RED, 0.6 * blink);
      ctx.fillStyle = rgba(RED, blink);
      ctx.beginPath(); ctx.moveTo(d.x - 8, LINE_Y - 14); ctx.lineTo(d.x + 8, LINE_Y - 14); ctx.lineTo(d.x, LINE_Y - 4); ctx.fill();
    }
  }

  _drawLinks(ctx, r, t) {
    const T = this.turrets;
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    for (let i = 0; i < 2; i++) {
      const a = T[i], b = T[i + 1];
      if (!(a.lit > 0 && b.lit > 0)) continue;
      ctx.strokeStyle = rgba(GREEN, 0.3); ctx.lineWidth = 8;
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      ctx.setLineDash([6, 10]); ctx.lineDashOffset = -t * 80;
      ctx.strokeStyle = rgba('#d6ffe4', 0.9); ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      ctx.setLineDash([]);
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  _drawTurret(ctx, r, tu, t) {
    const x = tu.x, y = tu.y;
    const lit = tu.lit > 0;
    const over = this.overT > 0;
    r.glow(x, y, 140, GREEN, 0.12 + (lit ? 0.25 : 0) + tu.flash * 0.55 + (over ? 0.15 : 0));
    // anneau d'armement (fenêtre de salve)
    ctx.strokeStyle = rgba(GREEN, lit ? 0.95 : 0.22); ctx.lineWidth = 3;
    ctx.beginPath();
    if (lit) ctx.arc(x, y, 31, -Math.PI / 2, -Math.PI / 2 + TAU * (tu.lit / LIT_TIME));
    else ctx.arc(x, y, 31, 0, TAU);
    ctx.stroke();
    // dôme blindé
    const grd = ctx.createRadialGradient(x - 8, y - 9, 3, x, y, TURRET_R);
    grd.addColorStop(0, '#dfe9f5'); grd.addColorStop(0.35, '#7d8fae'); grd.addColorStop(1, '#151d2c');
    ctx.fillStyle = grd;
    ctx.beginPath(); ctx.arc(x, y, TURRET_R, 0, TAU); ctx.fill();
    ctx.strokeStyle = tu.flash > 0.3 ? '#ffffff' : lit ? GREEN : '#2f8f5a'; ctx.lineWidth = 2.5;
    ctx.stroke();
    // tête rotative et double canon
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(tu.aim);
    const rec = tu.recoil * 6;
    ctx.fillStyle = '#9fb3cf';
    ctx.fillRect(6 - rec, -7, 28, 4);
    ctx.fillRect(6 - rec, 3, 28, 4);
    ctx.fillStyle = lit || over ? GREEN : '#3b6b52';
    ctx.fillRect(30 - rec, -8, 5, 6);
    ctx.fillRect(30 - rec, 2, 5, 6);
    ctx.fillStyle = '#18222f';
    ctx.beginPath(); ctx.moveTo(-11, -12); ctx.lineTo(10, -10); ctx.lineTo(14, 0); ctx.lineTo(10, 10); ctx.lineTo(-11, 12); ctx.lineTo(-15, 0); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = lit ? GREEN : '#4d7a62'; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.restore();
    // voyant central
    ctx.fillStyle = tu.flash > 0.3 ? '#ffffff' : lit ? GREEN : '#244032';
    ctx.beginPath(); ctx.arc(x, y, 4.5, 0, TAU); ctx.fill();
    if (tu.recoil > 0.5) {
      const c = Math.cos(tu.aim), s = Math.sin(tu.aim);
      r.glow(x + c * 36, y + s * 36, 46, '#d6ffe4', tu.recoil);
    }
    // surcharge : arcs électriques
    if (over) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = rgba('#d6ffe4', 0.7); ctx.lineWidth = 1.2;
      for (let k = 0; k < 2; k++) {
        const a0 = t * 5 + k * Math.PI + tu.i;
        ctx.beginPath();
        for (let s = 0; s <= 5; s++) {
          const a = a0 + s * 0.22, rr = 30 + (Math.sin(t * 50 + s * 3 + k) * 4);
          if (s === 0) ctx.moveTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); else ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
        }
        ctx.stroke();
      }
      ctx.globalCompositeOperation = 'source-over';
    }
  }

  _drawHull(ctx, r, t) {
    const n = this.hullMax, w = 184, gap = 4;
    const sw = (w - 8 - gap * (n - 1)) / n;
    const ratio = this.hull / n;
    const col = ratio > 0.5 ? GREEN : ratio > 0.25 ? AMBER : RED;
    const blink = ratio <= 0.25 && Math.sin(t * 10) < 0 ? 0.45 : 1;
    for (let i = 0; i < n; i++) {
      const x = CX - w / 2 + 4 + i * (sw + gap), y = 711;
      ctx.beginPath(); ctx.moveTo(x + 4, y); ctx.lineTo(x + sw, y); ctx.lineTo(x + sw - 4, y + 8); ctx.lineTo(x, y + 8); ctx.closePath();
      if (i < this.hull) { ctx.fillStyle = rgba(col, 0.9 * blink); ctx.fill(); }
      else { ctx.strokeStyle = rgba(RED, 0.5); ctx.lineWidth = 1; ctx.stroke(); }
    }
    r.glow(CX, 715, 200, this.hullFlash > 0 ? RED : col, (this.hullFlash > 0 ? 0.5 : 0.12) * blink);
  }

  _drawApex(ctx, r, t) {
    const ready = this.orbCd <= 0;
    const a = ready ? 0.35 + 0.25 * Math.sin(t * 4) : 0.12;
    r.glow(APEX.x, APEX.y + 6, 90, GREEN, a);
    ctx.strokeStyle = rgba(GREEN, ready ? 0.8 : 0.3); ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(APEX.x, APEX.y + 10, 14, Math.PI * 0.15, Math.PI * 0.85); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(APEX.x, APEX.y + 24); ctx.lineTo(APEX.x, APEX.y + 8); ctx.stroke();
  }

  _drawDrone(ctx, r, d, t) {
    const x = d.x, y = d.y, R = d.r, col = d.T.color;
    const warp = d.warp;
    const gap = LINE_Y - this._bottom(d);
    const warn = gap < 110 && Math.sin(t * 16) > 0;
    const edge = d.flash > 0.4 ? '#ffffff' : warn ? RED : col;
    // matérialisation : colonne holographique
    if (warp < 1) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = rgba(col, 0.25 * (1 - warp));
      ctx.fillRect(x - R, 20, R * 2, y - 20);
      ctx.globalCompositeOperation = 'source-over';
    }
    r.glow(x, y, R * 4.2, warn ? RED : col, (0.28 + d.flash * 0.5) * warp);
    if (d.ping > 0) {
      ctx.strokeStyle = rgba(GREEN, 0.6 * d.ping); ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(x, y, R + 10 + (1 - d.ping) * 10, 0, TAU); ctx.stroke();
    }
    ctx.save();
    ctx.globalAlpha = warp < 1 ? warp * (0.6 + 0.4 * Math.sin(t * 50)) : 1;
    ctx.translate(x, y);
    const s = 0.5 + 0.5 * warp;
    ctx.scale(s, s);
    if (d.type === 'carrier') this._drawCarrier(ctx, r, d, t, edge);
    else {
      // propulseurs (au-dessus : les drones descendent)
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = rgba(col, 0.5 + 0.3 * Math.sin(t * 40 + d.seed));
      ctx.beginPath(); ctx.moveTo(-R * 0.3, -R * 0.6); ctx.lineTo(0, -R * (1.3 + 0.2 * Math.sin(t * 30))); ctx.lineTo(R * 0.3, -R * 0.6); ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
      if (d.type === 'scout') {
        ctx.rotate(Math.sin(t * 3 + d.seed) * 0.15);
        ctx.fillStyle = '#1a0a1e';
        ctx.beginPath(); ctx.moveTo(0, R); ctx.lineTo(-R, -R * 0.55); ctx.lineTo(-R * 0.35, -R * 0.2); ctx.lineTo(0, -R * 0.6); ctx.lineTo(R * 0.35, -R * 0.2); ctx.lineTo(R, -R * 0.55); ctx.closePath(); ctx.fill();
        ctx.strokeStyle = edge; ctx.lineWidth = 2; ctx.stroke();
        ctx.fillStyle = RED; ctx.beginPath(); ctx.arc(0, R * 0.15, 3.5, 0, TAU); ctx.fill();
      } else if (d.type === 'lancer') {
        ctx.fillStyle = '#200f08';
        ctx.beginPath(); ctx.moveTo(0, R); ctx.lineTo(-R * 0.7, 0); ctx.lineTo(0, -R); ctx.lineTo(R * 0.7, 0); ctx.closePath(); ctx.fill();
        ctx.strokeStyle = edge; ctx.lineWidth = 2; ctx.stroke();
        ctx.beginPath(); ctx.moveTo(-R * 0.7, 0); ctx.lineTo(-R * 1.35, -R * 0.45); ctx.moveTo(R * 0.7, 0); ctx.lineTo(R * 1.35, -R * 0.45); ctx.stroke();
        ctx.fillStyle = RED; ctx.fillRect(-4, -2, 8, 4);
      } else {
        ctx.fillStyle = '#1f1608';
        ctx.beginPath();
        for (let k = 0; k < 6; k++) { const a = Math.PI / 6 + k * TAU / 6; ctx.lineTo(Math.cos(a) * R, Math.sin(a) * R); }
        ctx.closePath(); ctx.fill();
        ctx.strokeStyle = edge; ctx.lineWidth = 2.5; ctx.stroke();
        ctx.strokeStyle = rgba(col, 0.4); ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(-R * 0.6, -R * 0.35); ctx.lineTo(R * 0.6, -R * 0.35); ctx.moveTo(-R * 0.6, R * 0.35); ctx.lineTo(R * 0.6, R * 0.35); ctx.stroke();
        ctx.fillStyle = RED; ctx.fillRect(-7, -2.5, 14, 5);
      }
      // bouclier hexagonal
      if (d.shield > 0 || d.shieldFlash > 0) {
        const sa = d.shield > 0 ? 0.55 + 0.25 * Math.sin(t * 9 + d.seed) : d.shieldFlash;
        ctx.fillStyle = rgba(SHIELD, 0.08 * sa + d.shieldFlash * 0.2);
        ctx.strokeStyle = rgba(SHIELD, sa);
        ctx.lineWidth = 1.5;
        const rr = R + 8 + d.shieldFlash * 8;
        ctx.beginPath();
        for (let k = 0; k < 6; k++) { const a = k * TAU / 6 + t * 0.6; ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); }
        ctx.closePath(); ctx.fill(); ctx.stroke();
      }
    }
    ctx.restore();
    // points de vie
    if (d.type !== 'carrier' && (d.maxHp > 1 || d.maxShield > 0) && warp >= 1) {
      const n = d.maxHp + d.maxShield;
      const x0 = x - n * 4.5, yy = y - R - 13;
      for (let i = 0; i < n; i++) {
        const isS = i < d.maxShield;
        const on = isS ? i < d.shield : (i - d.maxShield) < d.hp;
        ctx.fillStyle = on ? (isS ? SHIELD : col) : 'rgba(255,255,255,0.15)';
        ctx.fillRect(x0 + i * 9, yy, 7, 3);
      }
    }
  }

  _drawCarrier(ctx, r, d, t, edge) {
    const col = d.T.color;
    // coque en chevron (toit en pointe, ventre plat)
    ctx.fillStyle = '#140c22';
    ctx.beginPath();
    ctx.moveTo(0, -35); ctx.lineTo(69, -5); ctx.lineTo(64, 4); ctx.lineTo(58, 15); ctx.lineTo(-58, 15); ctx.lineTo(-64, 4); ctx.lineTo(-69, -5); ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = edge; ctx.lineWidth = 2.5; ctx.stroke();
    ctx.strokeStyle = rgba(col, 0.35); ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(-40, -10); ctx.lineTo(0, -27); ctx.lineTo(40, -10); ctx.moveTo(-58, 0); ctx.lineTo(58, 0); ctx.stroke();
    // antennes
    ctx.strokeStyle = edge; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(-30, -22); ctx.lineTo(-40, -40); ctx.moveTo(30, -22); ctx.lineTo(40, -40); ctx.stroke();
    ctx.fillStyle = Math.floor(t * 3) % 2 ? RED : '#4a0f20';
    ctx.beginPath(); ctx.arc(-40, -41, 3, 0, TAU); ctx.arc(40, -41, 3, 0, TAU); ctx.fill();
    // baie de lancement : feux séquentiels
    for (let k = 0; k < 6; k++) {
      const on = Math.floor(t * 8) % 6 === k;
      ctx.fillStyle = on ? '#ffd84a' : '#3a2a50';
      ctx.fillRect(-40 + k * 14, 4, 8, 4);
    }
    // point faible (dessous)
    const pulse = 0.5 + 0.5 * Math.sin(t * 7);
    const grd = ctx.createRadialGradient(0, 20, 2, 0, 20, 13);
    grd.addColorStop(0, '#ffffff'); grd.addColorStop(0.5, d.flash > 0.4 ? '#ffffff' : RED); grd.addColorStop(1, '#3a0010');
    ctx.fillStyle = grd;
    ctx.beginPath(); ctx.arc(0, 20, 13, 0, TAU); ctx.fill();
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = rgba('#ffffff', 0.5 + 0.5 * pulse); ctx.lineWidth = 2;
    for (let k = 0; k < 4; k++) {
      const a = k * Math.PI / 2 + t * 1.5;
      ctx.beginPath(); ctx.arc(0, 20, 20, a, a + 0.6); ctx.stroke();
    }
    ctx.globalCompositeOperation = 'source-over';
    // barre de vie
    const w = 120;
    ctx.fillStyle = 'rgba(255,255,255,0.12)'; ctx.fillRect(-w / 2, -54, w, 5);
    ctx.fillStyle = col; ctx.fillRect(-w / 2, -54, w * Math.max(0, d.hp / d.maxHp), 5);
    r.text('PORTE-DRONES', 0, -64, 10, col, 'center', 0.9, true);
    r.text('▲ POINT FAIBLE', 0, 44, 9, RED, 'center', 0.55 + 0.45 * pulse);
  }
}
