# LUMEN//NULL — flipper orbital

Un flipper complet, jouable dans le navigateur, sur smartphone comme sur grand écran.

La station orbitale **Cortex‑9** est pilotée par **LUMEN**, une IA précise, pince‑sans‑rire et un peu mélancolique. Un sous‑programme corrompu, **NULL**, a pris le contrôle de trois secteurs. La bille est un *noyau d'énergie* : en parcourant le plateau, elle réactive les circuits, plonge dans les secteurs par des portails et finit par affronter NULL.

---

## Lancer le jeu

Prérequis : **Node.js 18 ou plus**. Aucune dépendance à installer, aucun service payant, aucune clé d'API.

```bash
node server.js
```

Ouvrez ensuite **http://localhost:8080/** dans le navigateur.

- **Sur smartphone** : connectez le téléphone au même réseau Wi‑Fi. Le serveur affiche au démarrage une adresse du type `http://192.168.x.x:8080/` ; ouvrez‑la sur le téléphone. Le portrait est conseillé ; le paysage est pris en charge avec une caméra de suivi.
- **Sans serveur** : ouvrez directement `dist/lumen-null.html` (double‑clic). C'est la même version, réunie en un seul fichier. Pour la régénérer après une modification :

```bash
node tools/build-single.js
```

- **Autre port** : `node server.js 3000`. Tout autre serveur statique convient aussi (par exemple `python -m http.server 8080`).

Le son démarre à la première interaction (contrainte des navigateurs mobiles).

---

## Commandes

| Action | Ordinateur | Smartphone |
|---|---|---|
| Batteur gauche / déplacement à gauche | `←` ou `A` (ou `Q`) | Moitié gauche de l'écran |
| Batteur droit / déplacement à droite | `→` ou `D` | Moitié droite de l'écran |
| Lanceur | `Espace` : maintenir pour charger, relâcher pour lancer | Bouton **LANCER** en bas à droite, même principe |
| Pause | `Échap` (ou `P`) | Bouton ❚❚ |

- Les deux zones tactiles fonctionnent simultanément (multitouch). Un doigt qui glisse garde la zone où il a été posé.
- Les commandes sont relâchées automatiquement si le navigateur annule le toucher, si la fenêtre perd le focus ou si l'application passe en arrière‑plan. Dans les deux derniers cas, la partie se met en pause, et la reprise commence par un court décompte.
- Défilement, zoom et double‑tap sont bloqués pendant la partie.

---

## Règles essentielles

### Réserve de billes commune

- **3 billes pour toute la partie**, minijeux compris (une bille supplémentaire peut être gagnée par les missions, réserve de 5 au maximum).
- **Perte dans un minijeu** :
  - une bille est retirée de la réserve ;
  - la commande de lancement habituelle envoie une nouvelle bille directement dans le minijeu ;
  - la progression du minijeu est conservée, les combos temporaires sont remis à zéro ;
  - si le joueur attend plus de 10 s, la bille part automatiquement ;
  - le chrono est suspendu pendant l'attente.
- **Échec à l'objectif sans perte de bille** (chrono écoulé, surcharge, coque détruite) : la bille revient sur le plateau.
- **Réussite** : la bille revient sur le plateau par le portail central, avec 4 s de protection.
- **Fin de partie** : quand la dernière bille disponible est perdue, sur le plateau comme dans un minijeu.

### Accès aux secteurs (minijeux)

| Secteur | Qualification | Déclenchement | Minijeu |
|---|---|---|---|
| HANGAR (cyan) | 3 cibles gauches | Rampe gauche | Casse‑briques orbital |
| RÉACTEUR (orange) | 2 boucles (orbites) | Portail central | Réacteur instable |
| DÉFENSE (vert) | 3 cibles droites | Rampe droite | Défense de la station |
| NOYAU (rouge) | 3 secteurs réactivés | Portail central | Duel contre NULL |

Les hexagones sous le portail, les flèches de tir et les panneaux latéraux affichent l'état de chaque secteur : verrouillé, en préparation (barre de progression), accessible (clignote), **en attente** ⧗ pendant une multibille, ou réactivé ✓.

**Pendant une multibille**, les accès aux minijeux sont mis en attente jusqu'au retour à une seule bille. Ils restent débloqués.

### Le plateau

- **Batteurs** : on vise en choisissant le moment de la frappe. Depuis le berceau (batteur tenu levé), une frappe en milieu de batteur part vers le portail, une frappe près de la pointe vers la rampe opposée, une frappe tardive vers les cibles opposées.
- **Couloirs C·P·U** en haut : chaque série complète augmente le bonus de fin de bille. Deux séries allument la **multibille « Réplication du noyau »** au portail. Les batteurs décalent les lumières des couloirs.
- **Skill shot** : un lancement dosé qui tombe dans le couloir allumé au départ.
- **Combos** : des tirs majeurs différents (orbites, rampes, portail) enchaînés en moins de 4 s. Les chevrons blancs animés indiquent les tirs qui prolongent le combo.
- **Missions de LUMEN** : objectifs chronométrés (rampes, bumpers, boucles, cibles…). Elles rapportent des points, un aimant, un multiplicateur, et une bille supplémentaire toutes les 3 missions.
- **Jackpots** : pendant la multibille, rampes et orbites sont allumées ; les 4 jackpots débloquent le **super jackpot** au portail.
- **Sauvegarde de bille** : quelques secondes après chaque lancement (8 s, puis 6 et 5 s aux niveaux suivants).
- **Anti‑blocage** : une micro‑vibration, puis une secousse ; une bille vraiment coincée est relancée sans pénalité.

### Bonus : durées, plafonds, cumul

| Bonus | Effet | Règle de cumul |
|---|---|---|
| Bouclier | Annule la prochaine perte (plateau ou minijeu) | 1 charge au maximum ; un bouclier en plus donne 20 s de sauvegarde |
| Noyau phasique | La bille traverse les cibles en les validant (25 s) ; en minijeu, elle perfore | Durée relancée, sans cumul |
| Multiplicateur | Tous les points ×2 → ×3 → ×4 (30 s) | +1 palier par gain, ×4 au maximum, durée relancée |
| Jackpot de rampe | Chaque rampe rapporte un jackpot (40 s) | +50 % par gain, 3 paliers au maximum |
| Aimant de récupération | Rattrape la bille dans les couloirs extérieurs (30 s) | Durée relancée |
| Bumpers | Valeur des bumpers ×niveau | Niveau 5 au maximum (pour toute la partie) |
| Multibille différée | Billes ajoutées 3 s après le retour sur le plateau | 2 billes en plus au maximum ; 4 billes simultanées au maximum |
| Améliorations durables | Une par victoire sur NULL : batteurs renforcés, sauvegarde étendue, aimant au lancement | Liste finie, puis conversion en points |

Garde‑fous contre le gain infini :
- La récompense complète d'un secteur n'est accordée **qu'une fois par cycle**.
- Après un échec, il faut requalifier le secteur.
- Les effets du plateau sont gelés pendant les minijeux.

### Les quatre minijeux

Tous se jouent avec la bille du flipper : c'est la même bille (même identifiant) qui traverse le portail. Les effets compatibles la suivent (bouclier, multiplicateur, noyau phasique). Chaque minijeu commence par un avantage d'entrée annoncé et par une barrière de protection de quelques secondes.

1. **Casse‑briques orbital** (75 s, sans gravité)
   - ← → déplacent la plateforme ; l'angle de sortie dépend du point d'impact.
   - Briques normales, blindées (fissures), explosives (en chaîne) et mobiles. Les 3 **verrous dorés** sont l'objectif.
   - Capsules à attraper avec la plateforme : LARGE, PERFO, +8 s, ×2, JACK.
   - Récompense : jackpot de rampe, noyau phasique, multiplicateur ×2 si la capsule ×2 a été attrapée.
2. **Réacteur instable** (90 s, batteurs)
   - Touchez les nœuds dans l'ordre affiché (1 → 2 → 3…) sur 3 séquences de plus en plus longues.
   - Rotors tournants et drones stabilisateurs mobiles gênent les tirs. Un mauvais nœud fait monter l'instabilité ; à 100 %, c'est l'échec.
   - Récompense : bouclier et bumpers +1 niveau.
3. **Défense de la station** (100 s, sans gravité)
   - La bille sert de projectile réutilisable contre 3 vagues : éclaireurs, blindés, tireurs (leurs tirs ralentissent la plateforme) et un porte‑drones.
   - Un drone qui franchit la ligne de défense endommage la coque.
   - Récompense : multibille différée et une prime par vague détruite, même en cas d'échec.
4. **Duel contre NULL** (120 s, batteurs)
   - Phase 1 : détruire les 2 générateurs. Phase 2 : frapper le noyau à travers les brèches d'un anneau tournant. Phase 3 : NULL se déplace, protégé par deux plaques.
   - Les attaques sont toujours annoncées (pointillés clignotants, flèches) : pare‑feu temporaires, sentinelles en orbite, distorsion de gravité.
   - Récompense : jackpot majeur, une amélioration durable, puis **niveau de sécurité +1**. Les secteurs se reverrouillent et la partie continue plus difficile : gravité +3 %, sauvegarde plus courte, minijeux plus rapides et plus résistants.
   - En cas d'échec, la phase atteinte est conservée pour la tentative suivante.

---

## Réalisation technique

### Choix de la stack

**JavaScript (modules ES) + Canvas 2D + Web Audio**, sans aucune dépendance ni outil de build.

- **Moteur physique dédié plutôt qu'un moteur générique.** Les moteurs généricistes gèrent mal les batteurs, la restitution des caoutchoucs et les tirs rapides (bille qui traverse les murs). Ici :
  - le pas de logique est fixe (1/120 s) ;
  - il est découpé en 3 à 20 sous‑pas selon la vitesse de la bille et des batteurs, sans jamais dépasser 4,5 unités de déplacement par sous‑pas ;
  - collisions capsule/segment, cercle et boîte ; frottement de Coulomb ; restitution qui dépend de la vitesse d'impact ;
  - batteurs en capsule effilée qui transmettent la vitesse de leur surface à la bille ;
  - éléments mobiles (rotors, drones, anneau du boss) ;
  - couches séparées pour les rampes, capteurs de passage orientés et zones.
- **Canvas 2D** : décor statique pré‑rendu une fois par taille d'écran, halos en sprites additifs (pas de `shadowBlur`, coûteux sur mobile), rendu interpolé entre deux pas de simulation.
- **Web Audio procédural** : tous les sons sont synthétisés, aucun fichier audio.

### Organisation du code

```
index.html, style.css      page, HUD, écrans (accueil, aide, réglages, pause, fin)
server.js                  serveur statique sans dépendance (accès réseau local)
src/main.js                assemblage, boucle principale, mise en page
src/config.js              constantes de physique et de règles, plafonds des bonus
src/physics/               world.js (simulation), flipper.js, ball.js
src/game/                  game.js (états, scènes, réserve de billes, score)
                           table.js (règles du plateau), tableLayout.js (géométrie)
                           bonus.js (cumul/plafonds), missions.js, lumen.js (IA)
                           transition.js (portail ↔ minijeu)
src/minigames/             base.js (cycle de vie commun), arena.js (arènes à batteurs)
                           breakout.js, reactor.js, defense.js, duel.js
src/render/                renderer.js (caméra, scènes), tableArt.js, fx.js, sprites.js
src/audio/                 engine.js (bus, polyphonie), sfx.js, music.js, voice.js, ambience.js
src/input/input.js         clavier + multitouch + annulations
src/ui/hud.js              HUD DOM adaptatif portrait/paysage, panneaux, bannières
tools/                     tests headless, carte des tirs, endurance, build fichier unique
```

### Son

- **Bus séparés** musique / effets / voix / ambiance, compresseur puis limiteur sur la sortie, réverbération générée.
- **Polyphonie** limitée par catégorie avec priorités, plus un anti‑répétition par matériau.
- **Impacts** selon le matériau (métal, caoutchouc, plastique, verre des rampes, cibles, bille contre bille) et la force du choc.
- **Batteurs et lanceur** : solénoïdes, cliquetis du lanceur qui monte avec la charge.
- **Bumpers musicaux** joués dans l'accord en cours de la musique, avec des variations.
- **Montées sonores** pour les combos, signatures distinctes pour les portails, bonus, jackpots et pertes de bille.
- **Musique électronique adaptative** : 7 modes avec chacun son tempo et sa tonalité. Des couches s'activent selon l'intensité (combos, multibille), la tension (dernière bille, chrono) ajoute des éléments, et le tempo augmente avec le niveau.
- **Voix robotique de LUMEN** (formants modulés) et **voix saturée de NULL**. La musique baisse pendant qu'elles parlent.
- **Réglages** : volumes séparés et mode muet, sauvegardés localement.

---

## Ce qui a été testé

### Tests automatisés (Node, sans navigateur)

```bash
node tools/sim-tests.js       # 76 vérifications, toutes réussies
node tools/shot-map.js        # carte des tirs depuis le berceau et en mouvement
node tools/soak.js 6 600      # endurance : 6 parties de 10 min
```

- **Réserve de billes** : une perte en minijeu retire exactement une bille, sur les 4 minijeux. La dernière bille perdue en minijeu termine la partie. La réserve est plafonnée.
- **Continuité de la bille** : c'est la même bille (même id) qui entre dans le minijeu et en ressort. Plus aucune bille sur le plateau pendant le minijeu, aucun doublon au retour. Après une perte suivie d'un chrono écoulé pendant l'attente, la bille de remplacement est servie au lanceur du plateau sans consommation supplémentaire.
- **Relance** avec la commande de lancement, progression conservée, protection active au retour, secteur à requalifier après un échec.
- **Multibille** : accès mis en attente puis rétablis et conservés.
- **Bonus** : plafonds et cumuls (multiplicateur ×4, bouclier, phasique, jackpot de rampe, bumpers, multibille différée), gel des effets pendant les minijeux.
- **Pause** : simulation figée, courte grâce à la reprise.
- **Physique** :
  - 600 billes lancées depuis des zones ouvertes à des vitesses aléatoires (jusqu'à 3 500 unités/s) : aucune n'a traversé un mur ni ne s'est bloquée ;
  - carte du lanceur : rebond au lanceur si trop faible, puis orbite droite, couloirs du haut (skill shot), puis orbite complète ;
  - carte des tirs : portail, rampes, cibles, boucles et bumpers sont atteignables.
- **Endurance** : environ 254 000 pas de simulation, jusqu'au niveau 7 et 16 victoires contre NULL, sans exception, sans bille dupliquée, sans position invalide.

### Vérifié dans le navigateur (Chromium, panneau intégré)

- Rendu sur grand écran (1024×768, avec panneaux latéraux), sur smartphone en portrait (375×812) et en paysage (844×390, caméra de suivi).
- Transitions par portail (zoom, tunnel, ouverture circulaire) et rendu des 4 arènes, des phases 2 et 3 du duel et de ses attaques.
- **Multitouch simulé** : deux zones simultanées, doigt qui glisse, relâchement indépendant, `pointercancel`, perte de focus (pause automatique), bouton LANCER combiné à un batteur.
- Écrans : accueil, aide au premier lancement, pause (Échap), réglages enregistrés, fin de partie, saisie des initiales et meilleurs scores.
- **Audio** : les 69 effets, les 7 musiques et les 2 voix s'exécutent sans erreur. Sous un test de charge (61 événements en 3 s, musique à pleine intensité), le pic de sortie est à 0,85, sans aucun échantillon saturé.
- Version fichier unique `dist/lumen-null.html` : chargement et partie vérifiés.

## Limites connues

- **Pas d'écoute ni d'appareil réel** : le son n'a pas été écouté, seulement mesuré (niveaux, saturation, absence d'erreur). La fluidité n'a pas été mesurée sur de vrais téléphones. Elle a été vérifiée en émulation, et le rendu d'une image coûte environ 0,3 ms de JavaScript sur ordinateur.
- **Vibrations** : non disponibles sur iOS Safari (limitation du navigateur).
- **Plein écran** : indisponible sur iPhone ; le bouton est alors masqué.
- **Paysage sur téléphone** : la caméra suit la bille verticalement. Elle est désactivée avec l'option « Réduire les mouvements » ; le plateau entier est alors plus petit.
- **Équilibrage** : les boucles sont volontairement plus difficiles que les rampes. Les valeurs de score et les durées pourront être ajustées après des sessions de jeu réelles (tout est centralisé dans `src/config.js`, `src/game/bonus.js` et les en‑têtes des minijeux).
- **Polices** : Orbitron et Rajdhani sont chargées depuis Google Fonts. Hors ligne, des polices système les remplacent.

## Débogage

Ajoutez `?debug` à l'adresse pour afficher le nombre d'images par seconde, les sous‑pas physiques, le nombre de billes et les erreurs de comptabilité. La console expose `__LN`, par exemple :
- `__LN.debug('start', 'hangar' | 'reactor' | 'defense' | 'core')`
- `__LN.debug('qualify', 'hangar')`
- `__LN.debug('multiball')`
- `__LN.debug('win')`
