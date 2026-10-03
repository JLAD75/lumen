import { PHYS, BALL_R } from '../config.js';
import { segIntersectT, smoothstep } from '../util/math.js';

// Matériaux : restitution (e), frottement de Coulomb (mu), chute de restitution
// avec la vitesse d'impact (eFall), et famille de son.
export const MAT = {
  metal:   { e: 0.42, mu: 0.07, eFall: 0.2,  sound: 'metal' },
  rail:    { e: 0.30, mu: 0.04, eFall: 0.1,  sound: 'metal' },
  rubber:  { e: 0.80, mu: 0.22, eFall: 0.35, sound: 'rubber' },
  post:    { e: 0.72, mu: 0.20, eFall: 0.3,  sound: 'rubber' },
  plastic: { e: 0.50, mu: 0.10, eFall: 0.2,  sound: 'plastic' },
  target:  { e: 0.38, mu: 0.10, eFall: 0.2,  sound: 'target' },
  bumper:  { e: 0.45, mu: 0.05, eFall: 0.0,  sound: 'bumper' },
  glass:   { e: 0.35, mu: 0.03, eFall: 0.1,  sound: 'glass' },
  brick:   { e: 1.00, mu: 0.00, eFall: 0.0,  sound: 'brick' },
  energy:  { e: 0.90, mu: 0.00, eFall: 0.0,  sound: 'energy' },
  boss:    { e: 0.70, mu: 0.05, eFall: 0.1,  sound: 'boss' },
};

let PRIM_ID = 1;
const CELL = 48;

function makePrim(kind, o) {
  const mat = MAT[o.mat || 'metal'];
  return {
    id: PRIM_ID++, kind,
    e: o.e ?? mat.e, mu: o.mu ?? mat.mu, eFall: o.eFall ?? mat.eFall, sound: o.sound ?? mat.sound,
    mat: o.mat || 'metal',
    mask: o.mask ?? 1,           // couches concernées (bit 0 = plateau, bit 1 = rampe)
    enabled: o.enabled ?? true,
    kick: o.kick || 0, kickMin: o.kickMin ?? 30, kickCooldown: o.kickCooldown ?? 0.08, kickReady: 0,
    phaseable: !!o.phaseable,
    onHit: o.onHit || null,
    tag: o.tag || null,
    data: o.data || null,
    vx: 0, vy: 0, omega: 0, ocx: 0, ocy: 0, // mouvement (vitesse de surface)
    flash: 0,
    draw: o.draw ?? true,
    style: o.style || null,
  };
}

export class PhysicsWorld {
  constructor(opts = {}) {
    this.gx = 0;
    this.gy = opts.gravity ?? PHYS.gravity;
    this.statics = [];
    this.dynamics = [];
    this.flippers = [];
    this.sensors = [];
    this.zones = [];
    this.balls = [];
    this.time = 0;
    this.speedCap = opts.speedCap ?? PHYS.maxSpeed;
    this.damping = opts.damping ?? PHYS.damping;
    this.ballHook = null;        // (ball, h) => void, appelé à chaque sous-pas
    this.onContact = null;       // (ball, prim, impact, x, y) => void
    this.grid = null;
    this.gx0 = -200; this.gy0 = -200; this.gcols = 0; this.grows = 0;
    this.substepsLast = 0;
  }

  // ---------- construction ----------
  seg(ax, ay, bx, by, o = {}) {
    const p = makePrim('seg', o);
    p.ax = ax; p.ay = ay; p.bx = bx; p.by = by; p.r = o.r || 0;
    this._segCache(p);
    if (o.oneWay) { // normale du côté solide
      const l = Math.hypot(o.oneWay[0], o.oneWay[1]);
      p.onx = o.oneWay[0] / l; p.ony = o.oneWay[1] / l;
    }
    (o.dynamic ? this.dynamics : this.statics).push(p);
    return p;
  }

  _segCache(p) {
    p.dx = p.bx - p.ax; p.dy = p.by - p.ay;
    p.len2 = p.dx * p.dx + p.dy * p.dy || 1e-9;
  }

  moveSeg(p, ax, ay, bx, by) {
    p.ax = ax; p.ay = ay; p.bx = bx; p.by = by; this._segCache(p);
  }

  poly(points, o = {}) {
    const out = [];
    const n = points.length;
    const last = o.closed ? n : n - 1;
    for (let i = 0; i < last; i++) {
      const a = points[i], b = points[(i + 1) % n];
      out.push(this.seg(a[0], a[1], b[0], b[1], o));
    }
    return out;
  }

  arcPoints(cx, cy, r, a0, a1, segLen = 14) {
    const n = Math.max(2, Math.ceil(Math.abs(a1 - a0) * r / segLen));
    const pts = [];
    for (let i = 0; i <= n; i++) {
      const a = a0 + (a1 - a0) * (i / n);
      pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
    }
    return pts;
  }

  arc(cx, cy, r, a0, a1, o = {}) {
    return this.poly(this.arcPoints(cx, cy, r, a0, a1, o.segLen || 14), o);
  }

  circle(x, y, r, o = {}) {
    const p = makePrim('circle', o);
    p.x = x; p.y = y; p.r = r;
    (o.dynamic ? this.dynamics : this.statics).push(p);
    return p;
  }

  rect(x, y, w, h, o = {}) {
    const p = makePrim('rect', o);
    p.x0 = x; p.y0 = y; p.x1 = x + w; p.y1 = y + h;
    (o.static ? this.statics : this.dynamics).push(p);
    return p;
  }

  sensor(ax, ay, bx, by, o = {}) {
    const l = Math.hypot(bx - ax, by - ay) || 1;
    const s = {
      id: PRIM_ID++, ax, ay, bx, by,
      nx: (by - ay) / l, ny: -(bx - ax) / l, // côté gauche en marchant de a vers b (écran, y vers le bas)
      mask: o.mask ?? 1, enabled: o.enabled ?? true,
      onCross: o.onCross || null, tag: o.tag || null, data: o.data || null,
    };
    this.sensors.push(s);
    return s;
  }

  zone(x, y, r, o = {}) {
    const z = {
      id: PRIM_ID++, x, y, r, mask: o.mask ?? 1, enabled: o.enabled ?? true,
      inside: new Set(), onEnter: o.onEnter || null, onExit: o.onExit || null, onInside: o.onInside || null,
      tag: o.tag || null, data: o.data || null,
    };
    this.zones.push(z);
    return z;
  }

  addFlipper(f) { this.flippers.push(f); return f; }

  remove(p) {
    let i = this.dynamics.indexOf(p);
    if (i >= 0) { this.dynamics.splice(i, 1); return; }
    i = this.statics.indexOf(p);
    if (i >= 0) { this.statics.splice(i, 1); this.grid = null; }
  }

  addBall(b) { if (!this.balls.includes(b)) this.balls.push(b); return b; }
  removeBall(b) {
    const i = this.balls.indexOf(b);
    if (i >= 0) this.balls.splice(i, 1);
    for (const z of this.zones) z.inside.delete(b.id);
  }

  // Grille de partition spatiale pour les éléments statiques.
  build() {
    const x0 = -200, y0 = -200, x1 = 800, y1 = 1400;
    this.gx0 = x0; this.gy0 = y0;
    this.gcols = Math.ceil((x1 - x0) / CELL);
    this.grows = Math.ceil((y1 - y0) / CELL);
    const grid = new Array(this.gcols * this.grows);
    for (let i = 0; i < grid.length; i++) grid[i] = [];
    const pad = BALL_R + 10;
    for (const p of this.statics) {
      let ax, ay, bx, by;
      if (p.kind === 'seg') {
        ax = Math.min(p.ax, p.bx) - p.r; ay = Math.min(p.ay, p.by) - p.r;
        bx = Math.max(p.ax, p.bx) + p.r; by = Math.max(p.ay, p.by) + p.r;
      } else if (p.kind === 'circle') {
        ax = p.x - p.r; ay = p.y - p.r; bx = p.x + p.r; by = p.y + p.r;
      } else { ax = p.x0; ay = p.y0; bx = p.x1; by = p.y1; }
      const c0 = Math.max(0, Math.floor((ax - pad - x0) / CELL));
      const c1 = Math.min(this.gcols - 1, Math.floor((bx + pad - x0) / CELL));
      const r0 = Math.max(0, Math.floor((ay - pad - y0) / CELL));
      const r1 = Math.min(this.grows - 1, Math.floor((by + pad - y0) / CELL));
      for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) grid[r * this.gcols + c].push(p);
    }
    this.grid = grid;
  }

  _cell(x, y) {
    const c = Math.floor((x - this.gx0) / CELL), r = Math.floor((y - this.gy0) / CELL);
    if (c < 0 || r < 0 || c >= this.gcols || r >= this.grows) return null;
    return this.grid[r * this.gcols + c];
  }

  // ---------- simulation ----------
  step(dt) {
    if (!this.grid) this.build();
    let maxMove = 0;
    for (const b of this.balls) {
      if (b.state !== 'free') continue;
      const s = Math.sqrt(b.vx * b.vx + b.vy * b.vy);
      if (s * dt > maxMove) maxMove = s * dt;
    }
    for (const f of this.flippers) {
      const target = f.pressed && f.enabled ? f.up : f.rest;
      if (Math.abs(target - f.angle) > 1e-4) maxMove = Math.max(maxMove, 30 * f.len * dt * 0.7);
    }
    for (const p of this.dynamics) {
      if (p.omega) maxMove = Math.max(maxMove, Math.abs(p.omega) * 160 * dt);
    }
    let n = Math.ceil(maxMove / PHYS.maxSubstepMove);
    n = Math.max(PHYS.minSubsteps, Math.min(PHYS.maxSubsteps, n));
    this.substepsLast = n;
    const h = dt / n;
    for (let i = 0; i < n; i++) this._substep(h);
  }

  _substep(h) {
    this.time += h;
    this.h = h;
    for (const f of this.flippers) f.step(h);
    const balls = this.balls;
    for (let i = 0; i < balls.length; i++) {
      const b = balls[i];
      if (b.state !== 'free') continue;
      b.vx += this.gx * b.gScale * h;
      b.vy += this.gy * b.gScale * h;
      const sp2 = b.vx * b.vx + b.vy * b.vy;
      const sp = Math.sqrt(sp2);
      const damp = 1 - (this.damping + PHYS.airDrag * sp) * h;
      b.vx *= damp; b.vy *= damp;
      let cap = this.speedCap;
      if (b.maxSpeed > 0 && b.maxSpeed < cap) cap = b.maxSpeed;
      if (sp > cap) { const k = cap / sp; b.vx *= k; b.vy *= k; }
      b.ox = b.x; b.oy = b.y;
      b.x += b.vx * h; b.y += b.vy * h;
      b.spin += sp * h / b.r;
      this._collideBall(b, h);
      if (b.state !== 'free') continue;
      this._sensors(b);
      if (b.state !== 'free') continue;
      if (this.ballHook) this.ballHook(b, h);
    }
    // collisions bille/bille (multibille)
    for (let i = 0; i < balls.length; i++) {
      const a = balls[i];
      if (a.state !== 'free') continue;
      for (let j = i + 1; j < balls.length; j++) {
        const b = balls[j];
        if (b.state !== 'free' || a.layer !== b.layer) continue;
        const dx = b.x - a.x, dy = b.y - a.y;
        const R = a.r + b.r;
        const d2 = dx * dx + dy * dy;
        if (d2 >= R * R || d2 < 1e-9) continue;
        const d = Math.sqrt(d2);
        const nx = dx / d, ny = dy / d;
        const pen = (R - d) * 0.5;
        a.x -= nx * pen; a.y -= ny * pen; b.x += nx * pen; b.y += ny * pen;
        const vn = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
        if (vn < 0) {
          const j2 = -(1 + 0.9) * vn * 0.5;
          a.vx -= j2 * nx; a.vy -= j2 * ny; b.vx += j2 * nx; b.vy += j2 * ny;
          if (this.onContact && -vn > 60) this.onContact(a, null, -vn, (a.x + b.x) / 2, (a.y + b.y) / 2);
        }
      }
    }
  }

  _collideBall(b, h) {
    const bit = 1 << b.layer;
    const cell = this._cell(b.x, b.y);
    if (cell) {
      for (let i = 0; i < cell.length; i++) {
        const p = cell[i];
        if (!p.enabled || !(p.mask & bit)) continue;
        this._collidePrim(b, p);
        if (b.state !== 'free') return;
      }
    }
    const dyn = this.dynamics;
    for (let i = 0; i < dyn.length; i++) {
      const p = dyn[i];
      if (!p.enabled || !(p.mask & bit)) continue;
      this._collidePrim(b, p);
      if (b.state !== 'free') return;
    }
    for (let i = 0; i < this.flippers.length; i++) {
      const f = this.flippers[i];
      if (!(f.mask & bit)) continue;
      const imp = f.collide(b);
      if (imp > 0) {
        b.lastFlipper = f.side;
        if (this.onContact) this.onContact(b, f, imp, b.x, b.y);
      }
    }
  }

  _collidePrim(b, p) {
    let nx, ny, pen;
    if (p.kind === 'seg') {
      let t = ((b.x - p.ax) * p.dx + (b.y - p.ay) * p.dy) / p.len2;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const qx = p.ax + p.dx * t, qy = p.ay + p.dy * t;
      const dx = b.x - qx, dy = b.y - qy;
      const R = b.r + p.r;
      const d2 = dx * dx + dy * dy;
      if (d2 >= R * R) return;
      if (p.onx !== undefined) {
        const side = (b.x - p.ax) * p.onx + (b.y - p.ay) * p.ony;
        if (side < 0) return;
      }
      const d = Math.sqrt(d2);
      if (d < 1e-6) {
        const l = Math.sqrt(p.len2); nx = -p.dy / l; ny = p.dx / l;
      } else { nx = dx / d; ny = dy / d; }
      pen = R - d;
      if (p.onx !== undefined && (b.vx - p.vx) * nx + (b.vy - p.vy) * ny > 0) return;
    } else if (p.kind === 'circle') {
      const dx = b.x - p.x, dy = b.y - p.y;
      const R = b.r + p.r;
      const d2 = dx * dx + dy * dy;
      if (d2 >= R * R) return;
      const d = Math.sqrt(d2);
      if (d < 1e-6) { nx = 0; ny = -1; } else { nx = dx / d; ny = dy / d; }
      pen = R - d;
    } else { // rect
      const qx = b.x < p.x0 ? p.x0 : b.x > p.x1 ? p.x1 : b.x;
      const qy = b.y < p.y0 ? p.y0 : b.y > p.y1 ? p.y1 : b.y;
      const dx = b.x - qx, dy = b.y - qy;
      const d2 = dx * dx + dy * dy;
      if (d2 >= b.r * b.r) return;
      if (d2 > 1e-9) {
        const d = Math.sqrt(d2); nx = dx / d; ny = dy / d; pen = b.r - d;
      } else {
        // centre à l'intérieur : sortie par l'axe le plus proche
        const l = b.x - p.x0, r = p.x1 - b.x, t = b.y - p.y0, bo = p.y1 - b.y;
        const m = Math.min(l, r, t, bo);
        if (m === l) { nx = -1; ny = 0; pen = l + b.r; }
        else if (m === r) { nx = 1; ny = 0; pen = r + b.r; }
        else if (m === t) { nx = 0; ny = -1; pen = t + b.r; }
        else { nx = 0; ny = 1; pen = bo + b.r; }
      }
    }

    // Traversée « phasique » ou perforante : on déclenche l'impact sans rebond.
    if ((p.phaseable && b.phase) || (p.pierceable && b.pierce)) {
      const now = this.time;
      if (!p._phaseT || now - p._phaseT > 0.25) {
        p._phaseT = now;
        if (p.onHit) p.onHit(b, 400, nx, ny, p, true);
      }
      return;
    }

    // vitesse de surface (éléments mobiles / rotatifs)
    let svx = p.vx, svy = p.vy;
    if (p.omega) {
      const cx = b.x - nx * b.r, cy = b.y - ny * b.r;
      svx += -p.omega * (cy - p.ocy);
      svy += p.omega * (cx - p.ocx);
    }
    b.x += nx * pen; b.y += ny * pen;
    const rvx = b.vx - svx, rvy = b.vy - svy;
    const vn = rvx * nx + rvy * ny;
    if (vn >= 0) return;
    const impact = -vn;
    let e = p.e;
    if (p.eFall) e *= 1 - p.eFall * smoothstep(300, 2800, impact);
    if (impact < 35) e = 0;
    let tx = rvx - vn * nx, ty = rvy - vn * ny;
    if (p.mu > 0) {
      const vt = Math.sqrt(tx * tx + ty * ty);
      if (vt > 1e-6) {
        const dvt = Math.min(vt, p.mu * (1 + e) * impact);
        const k = (vt - dvt) / vt; tx *= k; ty *= k;
      }
    }
    b.vx = tx - e * vn * nx + svx;
    b.vy = ty - e * vn * ny + svy;
    if (p.kick && impact > p.kickMin && this.time >= p.kickReady) {
      p.kickReady = this.time + p.kickCooldown;
      b.vx += nx * p.kick; b.vy += ny * p.kick;
      p.flash = 1;
    }
    if (impact > 25) {
      if (p.onHit) p.onHit(b, impact, nx, ny, p, false);
      if (this.onContact) this.onContact(b, p, impact, b.x - nx * b.r, b.y - ny * b.r);
    }
  }

  _sensors(b) {
    const bit = 1 << b.layer;
    const ss = this.sensors;
    for (let i = 0; i < ss.length; i++) {
      const s = ss[i];
      if (!s.enabled || !(s.mask & bit)) continue;
      const t = segIntersectT(b.ox, b.oy, b.x, b.y, s.ax, s.ay, s.bx, s.by);
      if (t < 0) continue;
      const dir = ((b.x - b.ox) * s.nx + (b.y - b.oy) * s.ny) >= 0 ? 1 : -1;
      if (s.onCross) s.onCross(b, dir, s);
      if (b.state !== 'free') return; // capturée par un capteur
    }
    const zs = this.zones;
    for (let i = 0; i < zs.length; i++) {
      const z = zs[i];
      if (!z.enabled || !(z.mask & bit)) { z.inside.delete(b.id); continue; }
      const dx = b.x - z.x, dy = b.y - z.y;
      const inside = dx * dx + dy * dy < z.r * z.r;
      const was = z.inside.has(b.id);
      if (inside && !was) { z.inside.add(b.id); if (z.onEnter) z.onEnter(b, z); }
      else if (!inside && was) { z.inside.delete(b.id); if (z.onExit) z.onExit(b, z); }
      if (inside && z.onInside) z.onInside(b, z);
      if (b.state !== 'free') return;
    }
  }
}
