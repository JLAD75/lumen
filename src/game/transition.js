import { TABLE_W, TABLE_H } from '../config.js';
import { easeInCubic, easeOutCubic, lerp } from '../util/math.js';
import { L } from './tableLayout.js';

// Transition continue entre le plateau et un minijeu : la bille entre dans un
// portail, la caméra plonge dedans, puis l'arène s'ouvre autour de la même bille.
export class Transition {
  constructor(game, kind, opts) {
    this.game = game;
    this.kind = kind;                 // 'enter' | 'exit'
    this.ball = opts.ball || null;
    this.pending = !!opts.pending;
    this.minigame = opts.minigame;
    this.result = opts.result || null;
    this.sector = opts.sector || this.minigame.sector;
    const rm = game.settings.reducedMotion;
    this.dur1 = rm ? 0.3 : 0.65;
    this.dur2 = rm ? 0.35 : 0.75;
    this.t = 0;
    this.phase = 1;
    if (kind === 'enter') {
      this.from = opts.from;
      this.to = this.minigame.entryPoint();
      game.sfx('warpIn');
    } else {
      const b = this.ball;
      const drained = !!(this.result && this.result.drained);
      this.from = b && !this.pending && !drained ? { x: b.x, y: b.y } : this.minigame.exitPoint();
      this.to = { x: L.portal.x, y: L.portal.y + 10 };
      if (b) { b.state = 'captured'; this.minigame.world.removeBall(b); }
      game.sfx('warpOut');
    }
    this.color = this.minigame.color;
  }

  update(dt) {
    this.t += dt;
    if (this.phase === 1 && this.t >= this.dur1) { this.phase = 2; this.t = 0; }
    else if (this.phase === 2 && this.t >= this.dur2) {
      if (this.kind === 'enter') this.game._beginMinigame(this.minigame, this.ball);
      else this.game._endMinigame(this.result, this.ball, this.pending);
    }
  }

  // Informations de rendu : scène, caméra, iris, intensité du tunnel.
  view(base = { x: TABLE_W / 2, y: TABLE_H / 2 }) {
    const rm = this.game.settings.reducedMotion;
    const zoomMax = rm ? 1 : 3.4;
    if (this.phase === 1) {
      const u = Math.min(1, this.t / this.dur1);
      const e = easeInCubic(u);
      return {
        scene: this.kind === 'enter' ? 'table' : 'minigame',
        cam: { x: lerp(base.x, this.from.x, e), y: lerp(base.y, this.from.y, e), zoom: lerp(1, zoomMax, e) },
        warp: u, iris: null, fade: rm ? u : 0,
        core: { x: this.from.x, y: this.from.y, scale: 1 - 0.7 * u },
      };
    }
    const u = Math.min(1, this.t / this.dur2);
    const e = easeOutCubic(u);
    return {
      scene: this.kind === 'enter' ? 'minigame' : 'table',
      cam: { x: lerp(this.to.x, base.x, e), y: lerp(this.to.y, base.y, e), zoom: lerp(zoomMax, 1, e) },
      warp: 1 - u,
      iris: { x: this.to.x, y: this.to.y, r: e * 1400 },
      fade: rm ? 1 - u : 0,
      core: { x: this.to.x, y: this.to.y, scale: 0.3 + 0.7 * e },
    };
  }
}
