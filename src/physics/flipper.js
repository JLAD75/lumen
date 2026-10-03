import { FLIPPER } from '../config.js';
import { DEG, approach, clamp01, smoothstep } from '../util/math.js';

// Batteur : capsule effilée qui pivote autour de sa base.
// side = 1 pour le batteur gauche (pointe vers la droite), -1 pour le droit.
export class Flipper {
  constructor(px, py, side, opts = {}) {
    this.px = px; this.py = py; this.side = side;
    this.len = opts.length ?? FLIPPER.length;
    this.r0 = opts.baseR ?? FLIPPER.baseR;
    this.r1 = opts.tipR ?? FLIPPER.tipR;
    const restDeg = opts.restDeg ?? FLIPPER.restDeg;
    const upDeg = opts.upDeg ?? FLIPPER.upDeg;
    this.rest = side === 1 ? restDeg * DEG : Math.PI - restDeg * DEG;
    this.up = side === 1 ? upDeg * DEG : Math.PI - upDeg * DEG;
    this.angle = this.rest;
    this.prevAngle = this.rest;
    this.omega = 0;
    this.pressed = false;
    this.enabled = true;
    this.power = 1;               // amélioration durable possible
    this.e = opts.restitution ?? FLIPPER.restitution;
    this.mask = opts.mask ?? 1;
    this.id = 'flipper' + (side === 1 ? 'L' : 'R') + (opts.idSuffix || '');
    this.tx = 0; this.ty = 0;
    this.hitFlash = 0;
    this.updateTip();
  }

  updateTip() {
    this.cos = Math.cos(this.angle);
    this.sin = Math.sin(this.angle);
    this.tx = this.px + this.cos * this.len;
    this.ty = this.py + this.sin * this.len;
  }

  // 0 = repos, 1 = levé
  get lift() {
    return clamp01((this.angle - this.rest) / (this.up - this.rest));
  }

  step(h) {
    const pressed = this.pressed && this.enabled;
    const target = pressed ? this.up : this.rest;
    const speed = pressed ? FLIPPER.upSpeed * this.power : FLIPPER.downSpeed;
    const prev = this.angle;
    this.angle = approach(this.angle, target, speed * h);
    this.omega = (this.angle - prev) / h;
    this.updateTip();
  }

  // Résout le contact avec la bille ; renvoie la vitesse d'impact (0 si aucun choc).
  collide(ball) {
    const abx = this.tx - this.px, aby = this.ty - this.py;
    let t = ((ball.x - this.px) * abx + (ball.y - this.py) * aby) / (this.len * this.len);
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const qx = this.px + abx * t, qy = this.py + aby * t;
    const rr = this.r0 + (this.r1 - this.r0) * t;
    let dx = ball.x - qx, dy = ball.y - qy;
    const d2 = dx * dx + dy * dy;
    const R = rr + ball.r;
    if (d2 >= R * R) return -1;
    let d = Math.sqrt(d2);
    let nx, ny;
    if (d < 1e-6) {
      // centre exactement sur l'axe : normale perpendiculaire au batteur, côté « dessus »
      nx = this.sin * this.side; ny = -this.cos * this.side; d = 0;
    } else { nx = dx / d; ny = dy / d; }
    const pen = R - d;
    ball.x += nx * pen; ball.y += ny * pen;

    // vitesse de surface au point de contact (rotation autour du pivot)
    const cx = ball.x - nx * ball.r, cy = ball.y - ny * ball.r;
    const svx = -this.omega * (cy - this.py);
    const svy = this.omega * (cx - this.px);
    const rvx = ball.vx - svx, rvy = ball.vy - svy;
    const vn = rvx * nx + rvy * ny;
    if (vn >= 0) return 0;
    const impact = -vn;
    // Caoutchouc : à faible vitesse relative la bille est « portée » par le batteur
    // (restitution basse), ce qui rend la visée progressive selon le moment de frappe.
    let e = (FLIPPER.eLow + (this.e - FLIPPER.eLow) * smoothstep(FLIPPER.carryV0, FLIPPER.carryV1, impact))
      * (1 - 0.3 * smoothstep(1500, 3600, impact));
    if (impact < 40) e = 0;
    let tx = rvx - vn * nx, ty = rvy - vn * ny;
    const vt = Math.sqrt(tx * tx + ty * ty);
    if (vt > 1e-6) {
      const dvt = Math.min(vt, FLIPPER.mu * (1 + e) * impact);
      const k = (vt - dvt) / vt; tx *= k; ty *= k;
    }
    ball.vx = tx - e * vn * nx + svx;
    ball.vy = ty - e * vn * ny + svy;
    if (impact > 120) this.hitFlash = 1;
    return impact;
  }
}
