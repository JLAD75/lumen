import { BALL_R } from '../config.js';

let NEXT_ID = 1;

// La bille : un « noyau d'énergie ». Le même objet voyage du plateau aux minijeux
// (son identifiant et ses effets visuels sont conservés).
export class Ball {
  constructor(x = 0, y = 0) {
    this.id = NEXT_ID++;
    this.x = x; this.y = y;
    this.px = x; this.py = y;       // position du tick précédent (interpolation de rendu)
    this.ox = x; this.oy = y;       // position du sous-pas précédent (capteurs)
    this.vx = 0; this.vy = 0;
    this.r = BALL_R;
    this.layer = 0;                 // 0 = plateau, 1 = rampe surélevée
    this.state = 'free';            // free | held | captured
    this.gScale = 1;                // gravité locale (montée de rampe)
    this.maxSpeed = 0;              // plafond local (0 = aucun)
    this.spin = 0;                  // rotation visuelle
    this.trail = [];
    this.stuckT = 0;
    this.stuckX = x; this.stuckY = y;
    this.age = 0;
    this.scale = 1;                 // échelle visuelle (transitions, rampes)
    this.alpha = 1;
    this.phase = false;             // traverse les cibles « phasables »
    this.pierce = false;            // perforation (minijeux)
    this.tag = 'main';
    this.hue = 0;                   // décalage de teinte pour distinguer les billes en multibille
    this.lastFlipper = -1;
  }

  get speed() { return Math.sqrt(this.vx * this.vx + this.vy * this.vy); }

  setPos(x, y) {
    this.x = this.px = this.ox = x;
    this.y = this.py = this.oy = y;
    this.trail.length = 0;
    this.stuckT = 0; this.stuckX = x; this.stuckY = y;
  }
}
