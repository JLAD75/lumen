import { choose } from '../util/math.js';

// Missions secondaires confiées par LUMEN. Une seule active à la fois, chronométrée.
const POOL = [
  { id: 'ramps',   text: 'Calibrer les rampes',        goal: 3,  event: 'ramp',   time: 60, shots: ['lramp', 'rramp'] },
  { id: 'bumpers', text: 'Purge thermique (bumpers)',  goal: 15, event: 'bumper', time: 45, area: 'bumpers' },
  { id: 'loops',   text: 'Inspection orbitale',        goal: 2,  event: 'loop',   time: 50, shots: ['lorbit', 'rorbit'] },
  { id: 'targets', text: 'Diagnostic des cibles',      goal: 5,  event: 'target', time: 50, area: 'banks' },
  { id: 'combo',   text: 'Synchronisation : combo ×3', goal: 1,  event: 'combo3', time: 60, shots: ['lorbit', 'lramp', 'portal', 'rramp', 'rorbit'] },
  { id: 'lanes',   text: 'Balayage C·P·U',             goal: 1,  event: 'lanes',  time: 60, area: 'lanes' },
  { id: 'portal',  text: 'Sonder le portail',          goal: 2,  event: 'portal', time: 50, shots: ['portal'] },
  { id: 'deck',    text: 'Patrouille du pont supérieur', goal: 2, event: 'deck',  time: 60, shots: ['lramp'] },
  { id: 'cells',   text: 'Recharger 4 cellules du pont', goal: 4, event: 'deckTarget', time: 70, area: 'deck' },
  { id: 'uplink',  text: 'Établir la liaison UPLINK',   goal: 1,  event: 'uplink', time: 70, area: 'deck' },
  { id: 'spin',    text: 'Spinners : 25 rotations',     goal: 25, event: 'spin',   time: 45, shots: ['lorbit', 'rorbit'] },
];

export class Missions {
  constructor(game) {
    this.game = game;
    this.reset();
  }

  reset() {
    this.current = null;
    this.progress = 0;
    this.timeLeft = 0;
    this.cooldown = 8;
    this.completed = 0;
    this.lastId = null;
    this.flash = 0;
  }

  update(dt) {
    if (this.flash > 0) this.flash -= dt;
    if (!this.current) {
      this.cooldown -= dt;
      if (this.cooldown <= 0) this.start();
      return;
    }
    this.timeLeft -= dt;
    if (this.timeLeft <= 0) {
      this.game.say('missionFail');
      this.game.sfx('missionFail');
      this.current = null;
      this.cooldown = 7;
    }
  }

  start() {
    const options = POOL.filter(m => m.id !== this.lastId);
    const m = choose(options);
    this.current = m;
    this.lastId = m.id;
    this.progress = 0;
    this.timeLeft = m.time;
    this.flash = 2;
    this.game.sfx('missionStart');
    this.game.dmd?.('mission', { text: m.text });
    this.game.say('missionStart', { text: m.text, goal: m.goal });
  }

  event(type, n = 1) {
    const m = this.current;
    if (!m || m.event !== type) return;
    this.progress += n;
    if (this.progress >= m.goal) this.complete();
    else this.game.sfx('missionTick', this.progress / m.goal);
  }

  complete() {
    const g = this.game;
    this.completed++;
    const pts = 20000 * g.level * Math.min(4, this.completed);
    g.addScore(pts, 281, 600, 'MISSION');
    g.sfx('missionComplete');
    let reward = null;
    if (this.completed % 3 === 0) {
      reward = g.awardExtraBall('Mission');
    } else {
      const b = g.bonus.grant(this.completed % 3 === 1 ? 'magnet' : 'mult');
      reward = b.title;
    }
    g.banner('MISSION ACCOMPLIE', `${this.current.text} — ${reward || ''}`, '#ffd84a', 2.2, 'missionDone', { text: reward || this.current.text });
    g.say('missionDone');
    this.current = null;
    this.cooldown = 6;
    this.flash = 1.5;
  }

  hud() {
    if (!this.current) return null;
    return {
      text: this.current.text,
      progress: this.progress,
      goal: this.current.goal,
      timeLeft: this.timeLeft,
      shots: this.current.shots || [],
      area: this.current.area || null,
    };
  }
}
