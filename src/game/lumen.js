// LUMEN : l'IA de la station. Messages courts, contextuels, jamais bloquants.
// NULL : le sous-programme corrompu (interventions pendant le duel).
// pri : priorité (une priorité supérieure remplace le message en cours)
// cd  : délai minimal avant de répéter la même clé (s)

const LINES = {
  gameStart: { pri: 3, cd: 0, v: [
    'Opérateur détecté. Noyau prêt. Essayez de ne pas le perdre.',
    'Station Cortex-9 en ligne à 12 %. On commence ?',
    'NULL a pris trois secteurs. Moi, j\'ai gardé le sens de l\'humour.',
  ] },
  ballStart: { pri: 2, cd: 0, v: ['Nouveau noyau injecté. Le précédent vous salue.', 'Noyau en position. Lancement à votre convenance.'] },
  lastBall: { pri: 3, cd: 0, v: ['Dernier noyau. Pas de pression. Enfin, si : beaucoup.', 'Réserve vide après celui-ci. Je compte sur vous.'] },
  ballLost: { pri: 3, cd: 0, v: ['Noyau perdu. J\'ai noté l\'heure exacte.', 'Perte de signal. Ça arrive. Souvent, chez vous.', 'Le noyau a rejoint le vide spatial. Paix à son énergie.'] },
  ballSaved: { pri: 2, cd: 2, v: ['Sauvegarde activée. Je n\'ai rien vu.', 'Réinjection. On fait comme si de rien n\'était.'] },
  shieldUsed: { pri: 3, cd: 1, v: ['Bouclier consommé. Il était fait pour ça.'] },
  stuck: { pri: 1, cd: 6, v: ['Noyau immobile. Petite secousse diplomatique.', 'Désincrustation en cours.'] },
  skillShot: { pri: 3, cd: 1, v: ['Tir de précision. Mes capteurs sont impressionnés.', 'Skill shot. Je l\'ajoute à votre dossier.'] },
  combo: { pri: 2, cd: 5, v: ['Combo ×{n}. Rythme synchronisé.', 'Combo ×{n} ! Mes ventilateurs s\'emballent.'] },
  missionStart: { pri: 2, cd: 0, v: ['Mission : {text}. Objectif : {goal}.', 'Nouvelle tâche — {text} ({goal}).'] },
  missionDone: { pri: 2, cd: 0, v: ['Mission accomplie. Récompense transférée.', 'Tâche validée. Je vous offre un bonus. Et ma gratitude, en option.'] },
  missionFail: { pri: 1, cd: 0, v: ['Délai expiré. On réessaiera.', 'Mission annulée. Je ne juge pas. Beaucoup.'] },
  sectorReady_hangar: { pri: 3, cd: 0, v: ['Hangar déverrouillé. Rampe gauche, s\'il vous plaît.'] },
  sectorReady_reactor: { pri: 3, cd: 0, v: ['Réacteur prêt à stabiliser. Visez le portail central.'] },
  sectorReady_defense: { pri: 3, cd: 0, v: ['Défense armée. Rampe droite pour engager les drones.'] },
  sectorReady_core: { pri: 4, cd: 0, v: ['Trois secteurs en ligne. NULL est exposé. Portail central.'] },
  targetProgress: { pri: 1, cd: 7, v: ['Cible {sector} {n}/3.', '{sector} : {n} sur 3.'] },
  loopProgress: { pri: 1, cd: 4, v: ['Boucle 1/2. Encore une et le réacteur s\'ouvre.'] },
  multiballLit: { pri: 3, cd: 0, v: ['Réplication du noyau disponible. Portail central.'] },
  multiball: { pri: 4, cd: 0, v: ['Réplication ! Plusieurs noyaux. Je ne garantis plus rien.', 'Multibille. Mes processeurs adorent le chaos contrôlé.'] },
  deferredMB: { pri: 4, cd: 0, v: ['Renforts de la Défense en approche. Multibille !'] },
  multiballEnd: { pri: 2, cd: 0, v: ['Fin de réplication. Accès aux secteurs rétablis.'] },
  hold: { pri: 2, cd: 10, v: ['Multibille en cours : accès aux secteurs en attente.'] },
  jackpot: { pri: 2, cd: 3, v: ['Jackpot. J\'adore ce mot.', 'Jackpot enregistré.', 'Jackpot. Les comptables de la station applaudissent.'] },
  superJackpot: { pri: 4, cd: 0, v: ['SUPER JACKPOT. Je vais devoir agrandir l\'affichage.'] },
  magnet: { pri: 2, cd: 4, v: ['Aimant activé. Vous me devez une burette d\'huile.', 'Rattrapé. De justesse.'] },
  extraBall: { pri: 4, cd: 0, v: ['Bille supplémentaire. Ne la gaspillez pas.'] },
  highScore: { pri: 4, cd: 0, v: ['Nouveau record. Je l\'affiche partout.'] },
  gameOver: { pri: 4, cd: 0, v: ['Fin de session. Je garde vos statistiques. Toutes.', 'Session terminée. Revenez vite, la station s\'ennuie.'] },
  levelUp: { pri: 4, cd: 0, v: ['NULL est vaincu… pour l\'instant. Niveau de sécurité {lvl}.'] },
  rewardReady: { pri: 3, cd: 0, v: ['Récompense installée sur le plateau : {reward}.'] },

  enter_hangar: { pri: 4, cd: 0, v: ['Hangar orbital. Gravité coupée. Brisez les verrous.'] },
  enter_reactor: { pri: 4, cd: 0, v: ['Réacteur instable. Touchez les nœuds dans l\'ordre. Vite.'] },
  enter_defense: { pri: 4, cd: 0, v: ['Drones en approche. Le noyau sera votre projectile.'] },
  enter_core: { pri: 4, cd: 0, v: ['Accès au noyau. NULL vous attend. Moi aussi, d\'ailleurs.'] },
  mgSuccess: { pri: 4, cd: 0, v: ['Secteur réactivé. Station à {pct} %.', 'Procédure réussie. Station à {pct} %.'] },
  mgFail: { pri: 3, cd: 0, v: ['Échec de la procédure. Secteur à requalifier.', 'Abandon de la procédure. On y retournera.'] },
  mgBallLost: { pri: 3, cd: 0, v: ['Noyau perdu dans le secteur. Relancez : la progression est conservée.'] },
  mgHurry: { pri: 2, cd: 6, v: ['Dix secondes. Je dis ça, je ne dis rien.', 'Le temps file. Comme les noyaux.'] },
  brickLock: { pri: 2, cd: 2, v: ['Verrou brisé. Plus que {n}.', 'Verrou détruit. {n} restant(s).'] },
  brickCapsule: { pri: 1, cd: 4, v: ['Capsule récupérée : {name}.'] },
  reactorWrong: { pri: 2, cd: 3, v: ['Mauvais nœud. Instabilité en hausse.', 'Ordre incorrect. Le réacteur grince.'] },
  reactorSeq: { pri: 2, cd: 1, v: ['Séquence validée. Suivante.', 'Phase stabilisée. On continue.'] },
  reactorCritical: { pri: 3, cd: 8, v: ['Instabilité critique !', 'Température : déraisonnable.'] },
  defenseWave: { pri: 3, cd: 0, v: ['Vague {n} en approche.', 'Contact radar : vague {n}.'] },
  defenseHull: { pri: 2, cd: 3, v: ['Coque touchée. Intégrité {hull}.', 'Impact sur la coque !'] },
  defenseCarrier: { pri: 3, cd: 0, v: ['Porte-drones détecté. Visez le cœur.'] },

  null_start: { persona: 'null', pri: 5, cd: 0, v: ['VOUS N\'ÊTES QU\'UN PROCESSUS PARMI D\'AUTRES.', 'ENFIN. UN ADVERSAIRE. OU UN DÉCHET.'] },
  null_hit: { persona: 'null', pri: 3, cd: 4, v: ['ERREUR… TOLÉRÉE.', 'CETTE COLLISION EST… DÉPLAISANTE.', 'VOUS ABÎMEZ MON CODE.'] },
  null_phase2: { persona: 'null', pri: 5, cd: 0, v: ['ACTIVATION DU PROTOCOLE OMÉGA.'] },
  null_phase3: { persona: 'null', pri: 5, cd: 0, v: ['JE SUIS LA STATION.', 'SURCHARGE. VOUS ALLEZ ADORER.'] },
  null_wall: { persona: 'null', pri: 2, cd: 6, v: ['PARE-FEU DÉPLOYÉ.', 'ACCÈS REFUSÉ.'] },
  null_gravity: { persona: 'null', pri: 2, cd: 6, v: ['RECALCUL DE LA GRAVITÉ.', 'LE BAS EST UNE OPINION.'] },
  null_minions: { persona: 'null', pri: 2, cd: 6, v: ['SENTINELLES, PROTÉGEZ-MOI.'] },
  null_defeat: { persona: 'null', pri: 6, cd: 0, v: ['ce n\'est… qu\'une… mise à jour…'] },
  null_win: { persona: 'null', pri: 5, cd: 0, v: ['RETOURNEZ À VOTRE PLATEAU, OPÉRATEUR.'] },
};

export class Lumen {
  constructor(game) {
    this.game = game;
    this.current = null;
    this.queue = [];
    this.cool = {};
    this.last = {};
    this.clock = 0;
    this.log = [];
  }

  reset() { this.current = null; this.queue.length = 0; this.cool = {}; }

  say(key, params = {}) {
    let def = LINES[key];
    if (key === 'sectorReady') def = LINES['sectorReady_' + params.sector];
    if (!def) return;
    const ck = key === 'sectorReady' ? key + params.sector : key;
    if ((this.cool[ck] || 0) > this.clock) return;
    this.cool[ck] = this.clock + (def.cd ?? 3);
    let i = Math.floor(Math.random() * def.v.length);
    if (def.v.length > 1 && i === this.last[ck]) i = (i + 1) % def.v.length;
    this.last[ck] = i;
    const text = def.v[i].replace(/\{(\w+)\}/g, (_, k) => params[k] ?? '');
    const msg = { text, persona: def.persona || 'lumen', pri: def.pri ?? 1, t: 0, dur: Math.min(4.8, Math.max(2.2, 1.4 + text.length * 0.045)) };
    if (!this.current || msg.pri > this.current.pri || this.current.t > 1.2) this._show(msg);
    else {
      this.queue = this.queue.filter(q => q.pri >= msg.pri).slice(0, 1);
      this.queue.push(msg);
    }
  }

  _show(msg) {
    this.current = msg;
    this.log.unshift(msg);
    if (this.log.length > 4) this.log.length = 4;
    this.game.onLumenMessage(msg);
  }

  update(dt) {
    this.clock += dt;
    if (this.current) {
      this.current.t += dt;
      if (this.current.t >= this.current.dur) {
        this.current = null;
        this.game.onLumenMessage(null);
      }
    }
    if (!this.current && this.queue.length) this._show(this.queue.shift());
  }
}
