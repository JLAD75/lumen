// Constantes globales et réglages de gameplay de LUMEN//NULL.
// Toutes les distances sont en unités monde (le plateau fait 600 × 1100),
// indépendantes de la taille de l'écran : la physique ne dépend jamais du format.

export const TABLE_W = 600;
export const TABLE_H = 1100;
export const BALL_R = 13;

export const PHYS = {
  tick: 1 / 120,          // pas de logique fixe
  gravity: 2000,          // unités/s² (inclinaison simulée du plateau)
  maxSpeed: 3900,         // plafond de vitesse de la bille
  maxSubstepMove: 4.5,    // déplacement max par sous-pas (anti-tunnel)
  minSubsteps: 3,
  maxSubsteps: 20,
  damping: 0.04,          // frottement de roulement (par seconde)
  airDrag: 0.00004,       // traînée quadratique légère
};

export const FLIPPER = {
  length: 86,
  baseR: 15,
  tipR: 8,
  restDeg: 25,            // sous l'horizontale
  upDeg: -26,             // au-dessus de l'horizontale
  upSpeed: 36,            // rad/s
  downSpeed: 19,
  restitution: 0.58,
  eLow: 0.1,              // restitution à faible vitesse : la bille est « portée »
  carryV0: 800,
  carryV1: 3000,
  mu: 0.12,
};

export const COLORS = {
  bg: '#04050c',
  plate0: '#0b1020',
  plate1: '#141b31',
  rail: '#2a3550',
  railHi: '#5d6f99',
  cyan: '#29e3ff',
  magenta: '#ff3df2',
  amber: '#ffb52e',
  lime: '#5dff8f',
  red: '#ff4060',
  violet: '#a070ff',
  gold: '#ffd84a',
  white: '#ffffff',
  steel: '#8fa3c8',
};

// Les quatre secteurs de la station. Chacun correspond à un minijeu.
export const SECTORS = {
  hangar:  { id: 'hangar',  name: 'HANGAR',   game: 'Casse-briques orbital', color: '#29d9ff', icon: 'brick' },
  reactor: { id: 'reactor', name: 'RÉACTEUR', game: 'Réacteur instable',     color: '#ffae2a', icon: 'atom' },
  defense: { id: 'defense', name: 'DÉFENSE',  game: 'Défense de la station', color: '#5dff8f', icon: 'shield' },
  core:    { id: 'core',    name: 'NOYAU',    game: 'Duel contre NULL',      color: '#ff3d6e', icon: 'skull' },
};

export const RULES = {
  startBalls: 3,
  maxBalls: 5,              // plafond de la réserve (billes supplémentaires)
  maxActiveBalls: 4,        // plafond de billes simultanées sur le plateau
  ballSaveByLevel: [8, 6, 5],
  returnProtection: 4,      // protection après retour de minijeu (s)
  comboWindow: 4.0,
  loopWindow: 2.6,
  skillShotWindow: 5,
  bonusXMax: 5,
  minigameRelaunchAuto: 10, // auto-lancement si le joueur attend trop (s)
};

// Règles de cumul des bonus : affichées dans l'aide et appliquées par BonusManager.
export const BONUS_RULES = {
  shieldMax: 1,             // charges de bouclier
  shieldOverflowSave: 20,   // si déjà plein : +20 s de sauvegarde
  phaseDuration: 25,        // noyau phasique (non cumulable, réinitialise)
  multDuration: 30,         // multiplicateur de plateau
  multMax: 4,               // ×4 maximum
  rampJackpotDuration: 40,
  rampJackpotMaxStacks: 3,
  magnetDuration: 30,
  bumperLevelMax: 5,
  deferredMultiballMax: 2,
};
