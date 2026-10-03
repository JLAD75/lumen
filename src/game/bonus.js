import { BONUS_RULES as BR, RULES } from '../config.js';

// Améliorations durables (une par victoire contre NULL, dans cet ordre).
export const DURABLE = [
  { id: 'flippers', name: 'Batteurs renforcés', desc: 'Puissance des batteurs +8 %' },
  { id: 'longSave', name: 'Sauvegarde étendue', desc: '+4 s de sauvegarde à chaque lancement' },
  { id: 'startMagnet', name: 'Aimant de lancement', desc: 'Aimant de récupération 15 s à chaque nouvelle bille' },
];

// Gestion centralisée des bonus : durées, plafonds et règles de cumul explicites.
export class BonusManager {
  constructor(game) {
    this.game = game;
    this.reset();
  }

  reset() {
    this.shield = 0;           // charges de bouclier (max 1)
    this.saveT = 0;            // sauvegarde de bille active (s)
    this.saveMax = 1;
    this.saveKind = '';
    this.phaseT = 0;           // noyau phasique
    this.multLevel = 1;        // multiplicateur de plateau ×2..×4
    this.multT = 0;
    this.rampJT = 0;           // jackpot de rampe
    this.rampJValue = 0;
    this.rampJStacks = 0;
    this.magnetT = 0;          // aimant de récupération (couloirs extérieurs)
    this.bumperLevel = 1;      // valeur des bumpers (permanent pour la partie)
    this.deferredMB = 0;       // billes de multibille différée en attente
    this.durable = [];         // améliorations durables obtenues
    this.flipperPower = 1;
    this.extraSave = 0;
    this.startMagnet = 0;
    this.paused = false;       // les effets de plateau sont gelés pendant les minijeux
  }

  get mult() { return this.multT > 0 ? this.multLevel : 1; }

  startSave(seconds, kind) {
    if (seconds > this.saveT) { this.saveT = seconds; this.saveMax = seconds; this.saveKind = kind; }
  }

  // Applique un bonus et renvoie le texte d'annonce { title, desc }.
  grant(type, opt = {}) {
    const lvl = this.game.level;
    switch (type) {
      case 'shield':
        if (this.shield >= BR.shieldMax) {
          this.startSave(Math.max(this.saveT, 0) + BR.shieldOverflowSave, 'shield');
          return { title: 'BOUCLIER', desc: `Déjà chargé : +${BR.shieldOverflowSave} s de sauvegarde` };
        }
        this.shield = BR.shieldMax;
        return { title: 'BOUCLIER', desc: 'Protège contre la prochaine perte de bille' };
      case 'phase':
        this.phaseT = BR.phaseDuration;
        return { title: 'NOYAU PHASIQUE', desc: `Traverse les cibles ${BR.phaseDuration} s` };
      case 'mult': {
        const before = this.mult;
        this.multLevel = this.multT > 0 ? Math.min(BR.multMax, this.multLevel + 1) : 2;
        this.multT = BR.multDuration;
        const capped = before >= BR.multMax;
        return { title: `MULTIPLICATEUR ×${this.multLevel}`, desc: capped ? `Plafond ×${BR.multMax} : durée relancée` : `Tous les points ×${this.multLevel} pendant ${BR.multDuration} s` };
      }
      case 'rampJackpot': {
        const base = 40000 * lvl + (opt.extra || 0);
        if (this.rampJT > 0 && this.rampJStacks < BR.rampJackpotMaxStacks) {
          this.rampJStacks++; this.rampJValue = Math.round(this.rampJValue * 1.5);
        } else if (this.rampJT <= 0) {
          this.rampJStacks = 1; this.rampJValue = base;
        }
        this.rampJT = BR.rampJackpotDuration;
        return { title: 'JACKPOT DE RAMPE', desc: `Rampes : ${Math.round(this.rampJValue / 1000)} k pendant ${BR.rampJackpotDuration} s` };
      }
      case 'magnet':
        this.magnetT = Math.max(this.magnetT, opt.duration || BR.magnetDuration);
        return { title: 'AIMANT DE RÉCUPÉRATION', desc: `Rattrape la bille dans les couloirs extérieurs (${Math.round(this.magnetT)} s)` };
      case 'bumper':
        if (this.bumperLevel >= BR.bumperLevelMax) return { title: 'BUMPERS AU MAXIMUM', desc: `Niveau ${BR.bumperLevelMax} déjà atteint` };
        this.bumperLevel++;
        return { title: `BUMPERS NIVEAU ${this.bumperLevel}`, desc: `Valeur des bumpers ×${this.bumperLevel}` };
      case 'deferredMB': {
        const n = Math.min(BR.deferredMultiballMax, this.deferredMB + (opt.count || 1));
        this.deferredMB = n;
        return { title: 'MULTIBILLE DIFFÉRÉE', desc: `${n + 1} billes au retour sur le plateau` };
      }
      case 'durable': {
        const next = DURABLE.find(d => !this.durable.includes(d.id));
        if (!next) {
          const pts = this.game.addScore(100000 * lvl);
          return { title: 'SYSTÈMES OPTIMAUX', desc: `Améliorations complètes : +${pts.toLocaleString('fr-FR')} points` };
        }
        this.durable.push(next.id);
        if (next.id === 'flippers') this.flipperPower = 1.08;
        if (next.id === 'longSave') this.extraSave = 4;
        if (next.id === 'startMagnet') this.startMagnet = 15;
        return { title: next.name.toUpperCase(), desc: next.desc };
      }
    }
    return { title: type, desc: '' };
  }

  useShield() {
    if (this.shield > 0) { this.shield--; return true; }
    return false;
  }

  launchSaveSeconds() {
    const lvl = this.game.level;
    const base = RULES.ballSaveByLevel[Math.min(lvl - 1, RULES.ballSaveByLevel.length - 1)];
    return base + this.extraSave;
  }

  update(dt) {
    if (this.saveT > 0) this.saveT = Math.max(0, this.saveT - dt);
    if (this.paused) return;
    if (this.phaseT > 0) this.phaseT = Math.max(0, this.phaseT - dt);
    if (this.multT > 0) { this.multT = Math.max(0, this.multT - dt); if (this.multT === 0) this.multLevel = 1; }
    if (this.rampJT > 0) { this.rampJT = Math.max(0, this.rampJT - dt); if (this.rampJT === 0) this.rampJStacks = 0; }
    if (this.magnetT > 0) this.magnetT = Math.max(0, this.magnetT - dt);
  }

  // Liste pour l'interface.
  active() {
    const out = [];
    if (this.saveT > 0) out.push({ id: 'save', label: 'Sauvegarde', t: this.saveT, max: this.saveMax, color: '#29e3ff' });
    if (this.shield > 0) out.push({ id: 'shield', label: 'Bouclier', t: -1, color: '#7fd7ff' });
    if (this.phaseT > 0) out.push({ id: 'phase', label: 'Noyau phasique', t: this.phaseT, max: BR.phaseDuration, color: '#b07bff' });
    if (this.multT > 0) out.push({ id: 'mult', label: `Multiplicateur ×${this.multLevel}`, t: this.multT, max: BR.multDuration, color: '#ffd84a' });
    if (this.rampJT > 0) out.push({ id: 'rampJ', label: `Jackpot rampe ${Math.round(this.rampJValue / 1000)}k`, t: this.rampJT, max: BR.rampJackpotDuration, color: '#ffb52e' });
    if (this.magnetT > 0) out.push({ id: 'magnet', label: 'Aimant', t: this.magnetT, max: BR.magnetDuration, color: '#5dff8f' });
    if (this.deferredMB > 0) out.push({ id: 'dmb', label: `Multibille différée +${this.deferredMB}`, t: -1, color: '#5dff8f' });
    if (this.bumperLevel > 1) out.push({ id: 'bump', label: `Bumpers niv. ${this.bumperLevel}`, t: -1, color: '#ff8a3d' });
    for (const id of this.durable) {
      const d = DURABLE.find(x => x.id === id);
      out.push({ id: 'dur-' + id, label: d.name, t: -1, color: '#ff3d6e', durable: true });
    }
    return out;
  }
}
