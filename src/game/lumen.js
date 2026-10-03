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
  sectorReady_hangar: { pri: 3, cd: 0, v: ['Hangar déverrouillé. Rampe du pont, à gauche, s\'il vous plaît.'] },
  sectorReady_reactor: { pri: 3, cd: 0, v: ['Singularité confinable. Rampe gauche, et tenez bon.'] },
  sectorReady_tag: { pri: 3, cd: 0, v: ['Les murs de NULL vous attendent. Rampe gauche, bombes prêtes.'] },
  sectorReady_defense: { pri: 3, cd: 0, v: ['Défense armée. Rampe droite pour engager les drones.'] },
  sectorReady_vault: { pri: 3, cd: 0, v: ['Le coffre de NULL est à portée. Rampe droite. Je n\'ai rien dit.'] },
  sectorReady_arena: { pri: 3, cd: 0, v: ['Arène ouverte. Rampe droite, le gardien s\'échauffe.'] },
  sectorReady_core: { pri: 4, cd: 0, v: ['Trois secteurs en ligne. NULL est exposé. Portail central.'] },
  pivot: { pri: 3, cd: 2, v: ['Rampe surmenée : le barillet pivote. Je garde la bille au chaud.', 'Rotation du barillet. Prochaine rampe : {to}.'] },
  pivotPlayed: { pri: 3, cd: 2, v: ['Face utilisée. Le barillet tourne vers {to}.', 'Changement de rampe : {to} en approche.'] },
  extraLife: { pri: 4, cd: 0, v: ['Un million. Une vie de plus. Les comptables pleurent.', 'Cap du million franchi : vie supplémentaire.'] },
  frenzyStart: { pri: 5, cd: 0, v: ['Réserve pleine. La station s\'énerve : {n} noyaux ! Gardez-en {k}.', 'Furie ! {n} noyaux lâchés. En garder {k}, et pas de batteur collé.'] },
  frenzyWin: { pri: 5, cd: 0, v: ['Furie maîtrisée. Réserve étendue à {n} noyaux.', 'Impressionnant. Votre réserve passe à {n}.'] },
  frenzyFail: { pri: 4, cd: 0, v: ['Moins de six. La furie retombe. Profitez des jackpots.'] },
  flipperHot: { pri: 3, cd: 4, v: ['Batteur en surchauffe. Relâchez !', 'Trois secondes levé, c\'est trop. Il refroidit.'] },
  targetProgress: { pri: 1, cd: 7, v: ['Cible {sector} {n}/{max}.', '{sector} : {n} sur {max}.'] },
  kickback: { pri: 2, cd: 3, v: ['Kickback ! Je vous la renvoie.', 'Kickback. Couloir gauche sécurisé… une fois.'] },
  deckFirst: { pri: 3, cd: 0, v: ['Bienvenue sur le pont supérieur. Les petits batteurs obéissent aux mêmes commandes.'] },
  uplink: { pri: 1, cd: 8, v: ['Liaison UPLINK établie.', 'Données transmises. Merci pour le colis.'] },
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

  enter_hangar: { pri: 4, cd: 0, v: ['Hangar orbital. Gravité coupée. Deux murs, six verrous dorés : faites sauter les veines d\'explosifs.'] },
  enter_defense: { pri: 4, cd: 0, v: ['Drones en approche. Touchez les tourelles, elles s\'occupent du reste.'] },
  enter_core: { pri: 4, cd: 0, v: ['Accès au noyau. NULL vous attend. Moi aussi, d\'ailleurs.'] },
  mgSuccess: { pri: 4, cd: 0, v: ['Secteur réactivé. Station à {pct} %.', 'Procédure réussie. Station à {pct} %.'] },
  mgFail: { pri: 3, cd: 0, v: ['Échec de la procédure. Secteur à requalifier.', 'Abandon de la procédure. On y retournera.'] },
  mgDrained: { pri: 3, cd: 0, v: ['Le noyau est retombé. Retour au plateau : la progression du secteur est gardée.', 'Chute du noyau. Je vous rapatrie. Ce qui est fait reste fait.'] },
  mgHurry: { pri: 2, cd: 6, v: ['Dix secondes. Je dis ça, je ne dis rien.', 'Le temps file. Comme les noyaux.'] },
  brickLock: { pri: 2, cd: 2, v: ['Verrou brisé. Plus que {n}.', 'Verrou détruit. {n} restant(s).'] },
  brickCapsule: { pri: 1, cd: 4, v: ['Capsule récupérée : {name}.'] },
  brickWall: { pri: 3, cd: 0, v: ['Mur effondré. Le mur {n} descend : suivez les veines d\'explosifs.', 'Premier rideau tombé. Le second descend vers vous.'] },
  defenseWave: { pri: 3, cd: 0, v: ['Vague {n} en approche.', 'Contact radar : vague {n}.'] },
  defenseHull: { pri: 2, cd: 3, v: ['Coque touchée. Intégrité {hull}.', 'Impact sur la coque !'] },
  defenseCarrier: { pri: 3, cd: 0, v: ['Porte-drones détecté. Point faible sous la coque.'] },
  defenseSalvo: { pri: 3, cd: 4, v: ['Salve complète. Toutes les tourelles, feu !', 'Salve ! J\'adore quand tout le monde tire en même temps.'] },
  defenseOrbital: { pri: 2, cd: 6, v: ['Canon orbital en ligne. Colonne nettoyée.', 'Frappe orbitale confirmée.'] },
  defenseCritical: { pri: 3, cd: 3, v: ['Coque critique : {hull}. Plus rien ne doit passer !'] },

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

// Répliques propres à un module (minijeux) : ajoutées au chargement du module.
export function addLines(defs) { Object.assign(LINES, defs); }

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
