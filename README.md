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

- **Sur smartphone** : connectez le téléphone au même réseau Wi‑Fi. Le serveur affiche au démarrage une adresse du type `http://192.168.x.x:8080/` ; ouvrez‑la sur le téléphone. Le portrait est conseillé (vue 3D inclinée) ; le paysage est pris en charge avec une caméra de suivi.
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
| Batteurs gauches (plateau et pont) / déplacement à gauche | `←` ou `A` (ou `Q`) | Moitié gauche de l'écran |
| Batteurs droits (plateau et pont) / déplacement à droite | `→` ou `D` | Moitié droite de l'écran |
| Lanceur (et laser du casse‑briques) | `Espace` : maintenir pour charger, relâcher pour lancer | Bouton **LANCER** en bas à droite, même principe |
| Pause | `Échap` (ou `P`) | Bouton ❚❚ |

- Les deux zones tactiles fonctionnent simultanément (multitouch). Un doigt qui glisse garde la zone où il a été posé.
- Les commandes sont relâchées automatiquement si le navigateur annule le toucher, si la fenêtre perd le focus ou si l'application passe en arrière‑plan. Dans les deux derniers cas, la partie se met en pause, et la reprise commence par un court décompte.
- Défilement, zoom et double‑tap sont bloqués pendant la partie.

---

## Règles essentielles

### Réserve de billes

- **3 billes pour toute la partie** (une bille supplémentaire peut être gagnée par les missions, réserve de 5 au maximum).
- **Une bille qui tombe dans un minijeu ne coûte rien** : le minijeu s'arrête (échec), la *même* bille revient sur le plateau principal par le portail, avec 4 s de protection. La progression du secteur est gardée pour la tentative suivante (briques détruites, vagues repoussées, séquences stabilisées, phase du duel).
- **Bouclier** : s'il est chargé, il est consommé et la bille est relancée sur place dans le minijeu.
- **Échec à l'objectif** (chrono écoulé, surcharge, coque détruite) : même retour au plateau.
- **Réussite** : la bille revient par le portail central, avec 4 s de protection.
- **Fin de partie** : quand la dernière bille est perdue sur le plateau principal.

### Le plateau : trois niveaux

Le plateau a les proportions d'un vrai flipper (600 × 1 250 unités) et se joue sur trois couches physiques :

1. **Le plateau** : deux batteurs, slingshots, couloirs de retour et extérieurs (kickback à gauche), orbites gauche et droite avec spinners, portail central, cibles debout HANGAR à gauche, cibles tombantes DÉFENSE à droite, 3 pop bumpers sous les couloirs C·P·U.
2. **Les rampes** : la rampe du **pont** (gauche, en plastique) monte jusqu'au deuxième niveau ; la rampe droite fait un virage en U et redescend par une rampe en fil métallique jusqu'au couloir de retour droit. Les orbites passent *sous* le pont.
3. **Le pont supérieur** (deuxième niveau, en haut) : deux petits batteurs commandés par les mêmes touches, 4 **cellules** à toucher et l'éjecteur **UPLINK**. On y arrive par le lanceur ou par la rampe gauche ; la bille qui passe entre les petits batteurs retombe dans les couloirs C·P·U.

### Accès aux secteurs (minijeux)

| Secteur | Qualification | Déclenchement | Minijeu |
|---|---|---|---|
| HANGAR (cyan) | 3 cibles debout gauches | Rampe du pont (gauche) | Casse‑briques orbital |
| RÉACTEUR (orange) | 4 cellules du pont | Éjecteur UPLINK, sur le pont | Réacteur instable |
| DÉFENSE (vert) | 3 cibles tombantes droites | Rampe droite | Défense de la station |
| NOYAU (rouge) | 3 secteurs réactivés | Portail central | Duel contre NULL |

L'**anneau d'inserts** autour de l'œil de LUMEN (comme l'anneau de missions des vrais flippers), les flèches lumineuses devant chaque tir, l'encart « Prochain objectif » et les panneaux latéraux affichent l'état de chaque secteur : éteint, en préparation, accessible (clignote), **en attente** (ambre) pendant une multibille, ou réactivé (allumé fixe).

**Pendant une multibille**, les accès aux minijeux sont mis en attente jusqu'au retour à une seule bille. Ils restent débloqués.

### Règles du plateau

- **Batteurs** : on vise en choisissant le moment de la frappe. Depuis le berceau, une frappe en milieu de batteur part vers le portail, une frappe près de la pointe vers la rampe opposée, une frappe tardive vers les cibles opposées.
- **Couloirs C·P·U** sous le pont : chaque série complète augmente le bonus de fin de bille. Deux séries allument la **multibille « Réplication du noyau »** au portail. Les batteurs décalent les lumières des couloirs.
- **Skill shot** : avant le lancer, les batteurs choisissent la cellule clignotante du pont ; touchez‑la avec les petits batteurs peu après le lancer.
- **Combos** : des tirs majeurs différents (orbites, rampes, portail, UPLINK) enchaînés en moins de 4 s. Les chevrons blancs indiquent les tirs qui prolongent le combo.
- **Kickback** : allumé en début de partie ; il renvoie une fois la bille du couloir extérieur gauche. Les 4 cellules du pont le rallument.
- **Missions de LUMEN** : objectifs chronométrés (rampes, bumpers, boucles, cibles, pont, UPLINK, spinners…). Elles rapportent des points, un aimant, un multiplicateur, et une bille supplémentaire toutes les 3 missions.
- **Jackpots** : pendant la multibille, rampes et orbites sont allumées ; les 4 jackpots débloquent le **super jackpot** au portail.
- **Sauvegarde de bille** : quelques secondes après chaque lancement (8 s, puis 6 et 5 s aux niveaux suivants) ; l'insert SAUVEGARDE s'allume.
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

Tous se jouent avec la bille du flipper : c'est la même bille (même identifiant) qui traverse le portail. Les effets compatibles la suivent (bouclier, multiplicateur, noyau phasique). Chaque minijeu commence par un avantage d'entrée annoncé et par une barrière de protection de quelques secondes. Un écran intégré au‑dessus de l'arène affiche le titre, la progression et le chrono.

1. **Casse‑briques orbital** (90 s, sans gravité, plafond plat)
   - ← → déplacent la plateforme ; l'angle de sortie dépend du point d'impact. **LANCER** tire au laser quand la capsule LASER est active, ou libère la bille aimantée.
   - Deux murs de briques néon (« Rideau néon », puis « Herse descendante » qui descend lentement) : briques normales, blindées, explosives (en chaîne), chromées indestructibles, briques à capsule. Objectif : les **6 verrous dorés** (3 par mur), auxquels mènent des veines d'explosifs.
   - Capsules : LARGE, LASER, AIMANT, RALENTI, PERFO, +8 s, ×2, JACK, ÉCHO (deux billes holographiques temporaires, jamais comptées comme la vraie bille).
   - Récompense : jackpot de rampe, noyau phasique, multiplicateur ×2 si la capsule ×2 a été attrapée.
2. **Réacteur instable** (90 s, batteurs)
   - Touchez les nœuds dans l'ordre affiché (1 → 2 → 3…) sur 3 séquences de plus en plus longues.
   - Rotors tournants et drones stabilisateurs gênent les tirs. Un mauvais nœud fait monter l'instabilité ; à 100 %, c'est l'échec.
   - Récompense : bouclier et bumpers +1 niveau.
3. **Défense de la station** (100 s, batteurs)
   - Les drones descendent vers la ligne de défense. Pas besoin de les viser : touchez les **3 tourelles**, elles tirent seules sur le drone le plus dangereux. Les 3 tourelles en 5 s déclenchent une **salve** ; la bille au sommet du dôme déclenche le **canon orbital**. Toucher un drone avec la bille reste possible (dégâts doublés).
   - 3 vagues, dont un porte‑drones à point faible. Un drone qui franchit la ligne endommage la coque.
   - Récompense : multibille différée et une prime par vague repoussée.
4. **Duel contre NULL** (120 s, batteurs)
   - Phase 1 : détruire les 2 générateurs. Phase 2 : frapper le noyau à travers les brèches d'un anneau tournant. Phase 3 : NULL se déplace, protégé par deux plaques.
   - Les attaques sont toujours annoncées (pointillés clignotants, flèches) : pare‑feu temporaires, sentinelles en orbite, distorsion de gravité.
   - Récompense : jackpot majeur, une amélioration durable, puis **niveau de sécurité +1**. Les secteurs se reverrouillent et la partie continue plus difficile : gravité +3 %, sauvegarde plus courte, minijeux plus rapides et plus résistants.

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
  - **couches physiques** (plateau, rampes, pont supérieur) avec masques par élément, capteurs de passage orientés et zones.
- **Rendu « vrai flipper »** :
  - plateau peint pré‑rendu une fois par taille d'écran (dégradés, grille synthwave, mégapole, emblème, portraits, circuits), rails chromés, poteaux caoutchoutés, plastiques vissés, rampes transparentes et en fil, pont en acrylique fumé, ombres portées cohérentes ;
  - inserts lumineux dessinés comme des lentilles (éteints / allumés), bille d'acier chromé, batteurs blancs à caoutchouc néon ;
  - **vue 3D inclinée** : le plateau est dessiné à plat sur son propre canevas puis basculé en CSS (perspective) autour de son bord inférieur. Le coût est nul côté JavaScript ; l'angle s'adapte au format (24° en paysage, moins en portrait pour remplir la hauteur). Désactivable dans les réglages ;
  - **effets cyberpunk** : bloom bon marché et glitchs sur le plateau, mégapole animée en fond (néons, hologrammes, navettes, pluie de données ; virage au rouge quand NULL prend la main), balayage CRT, vignette, lueurs de bord et cadre néon en HTML/CSS (un canevas superposé aplatirait la vue inclinée), arcs électriques entre bumpers, balayages laser ;
  - **afficheur à points** (128 × 32, polices bitmap avec accents) pour le score, les animations d'événements et les messages des IA.
- **Web Audio procédural** : tous les sons sont synthétisés, aucun fichier audio.

### Organisation du code

```
index.html, style.css      page, HUD, écrans (accueil, aide, réglages, pause, fin)
server.js                  serveur statique sans dépendance (accès réseau local)
src/main.js                assemblage, boucle principale, mise en page
src/config.js              constantes de physique et de règles, plafonds des bonus
src/physics/               world.js (simulation), flipper.js, ball.js
src/game/                  game.js (états, scènes, réserve de billes, score, annonces)
                           table.js (règles du plateau à trois niveaux)
                           tableLayout.js (géométrie : cadre commun des arènes + plateau long)
                           bonus.js (cumul/plafonds), missions.js, lumen.js (IA)
                           transition.js (portail ↔ minijeu)
src/minigames/             base.js (cycle de vie, chute = retour au plateau, progression gardée)
                           arena.js (arènes à batteurs), breakout.js + breakoutArt.js,
                           reactor.js, defense.js, duel.js
src/render/                renderer.js (caméra, scènes, calques, écran des minijeux)
                           tableArt.js (habillage du plateau), artKit.js (chrome, plastiques, inserts)
                           postfx.js (bloom, glitch), backdrop.js (mégapole animée)
                           fx.js (particules, arcs, balayages), sprites.js
src/audio/                 engine.js (bus, polyphonie), sfx.js (+ sfx-breakout.js, sfx-defense.js),
                           music.js, voice.js, ambience.js
src/input/input.js         clavier + multitouch + annulations
src/ui/hud.js              HUD DOM adaptatif portrait/paysage, vue inclinée, panneaux
src/ui/dmd.js              afficheur à points (score, animations, messages)
tools/                     tests headless, carte des tirs, géométrie, endurance, build fichier unique
tools/dev/                 démonstrations isolées de l'afficheur et des effets (fx-demo, dmd-demo)
```

### Son

- **Bus séparés** musique / effets / voix / ambiance, compresseur puis limiteur sur la sortie, réverbération générée.
- **Polyphonie** limitée par catégorie avec priorités, plus un anti‑répétition par matériau.
- **Impacts** selon le matériau (métal, caoutchouc, plastique, verre des rampes, cibles, bille contre bille) et la force du choc.
- **Batteurs et lanceur** : solénoïdes, cliquetis du lanceur qui monte avec la charge.
- **Éléments du plateau** : bumpers musicaux joués dans l'accord en cours, spinners dont le cliquetis suit la vitesse de rotation, cibles tombantes et leur remontée, kickback, entrée et chute du pont, éjecteur UPLINK.
- **Montées sonores** pour les combos, signatures distinctes pour les portails, bonus, jackpots et pertes de bille ; sons dédiés du casse‑briques (laser, éclats, murs) et de la défense (tourelles, salve, canon orbital).
- **Musique électronique adaptative** : 7 modes avec chacun son tempo et sa tonalité. Des couches s'activent selon l'intensité (combos, multibille), la tension (dernière bille, chrono) ajoute des éléments, et le tempo augmente avec le niveau.
- **Voix robotique de LUMEN** (formants modulés) et **voix saturée de NULL**. La musique baisse pendant qu'elles parlent.
- **Réglages** : volumes séparés et mode muet, sauvegardés localement.

---

## Ce qui a été testé

### Tests automatisés (Node, sans navigateur)

```bash
node tools/sim-tests.js          # 110 vérifications, toutes réussies
node tools/test-breakout.js      # casse-briques : 72 vérifications + parties de robots
node tools/test-defense.js       # défense : 91 vérifications + parties de robots
node tools/table-geometry.js     # lancer, tirs depuis le berceau, pont, robustesse
node tools/shot-map.js           # carte des tirs depuis le berceau et en mouvement
node tools/soak.js 6 600         # endurance : 6 parties de 10 min
```

- **Minijeux** :
  - une chute ne consomme aucune bille et ramène la *même* bille sur le plateau, avec protection ;
  - avec un bouclier, la même bille est relancée dans le minijeu ;
  - la progression est mémorisée puis reprise à la tentative suivante ;
  - une chute avec une seule bille en réserve ne termine pas la partie ;
  - ces points sont vérifiés sur les 4 minijeux.
- **Continuité de la bille** : même identifiant à l'entrée et à la sortie, aucun doublon, la bille en attente de relance est servie au lanceur si le chrono expire.
- **Plateau à trois niveaux** :
  - un lancer franc mène toujours au pont supérieur ;
  - une bille lâchée sur le pont redescend toujours (30/30) ;
  - les petits batteurs atteignent cellules et UPLINK ;
  - les 4 cellules ouvrent le Réacteur à l'UPLINK ;
  - l'UPLINK retient puis renvoie la bille ;
  - les cibles tombantes s'abattent et se relèvent ;
  - le kickback renvoie la bille une fois.
- **Physique** : 600 billes lancées sur le plateau, les orbites et le pont à des vitesses aléatoires : aucune n'a traversé un mur ni ne s'est bloquée. Depuis le berceau, rampes, portail, cibles et bumpers sont atteignables comme sur l'ancien plateau.
- **Multibille, bonus, pause** : accès mis en attente puis rétablis, plafonds et cumuls des bonus, simulation figée en pause.
- **Robots des minijeux** :
  - Casse‑briques : des robots de niveaux variés gagnent environ la moitié des parties, sans bille coincée ni sortie de l'arène. Le temps passé près des murs est passé de 38 % à 22 %.
  - Défense : un robot simple gagne 100 % des parties avec une bille infinie. Avec les vraies règles, il réussit en 3 tentatives dans 60 à 77 % des cas (progression gardée).
- **Endurance** : 367 000 pas de simulation, jusqu'au niveau 6 et 19 victoires contre NULL, sans exception, sans bille dupliquée, sans valeur invalide.

### Vérifié dans le navigateur (Chromium, panneau intégré)

- Rendu du nouveau plateau en vue inclinée :
  - grand écran 1024×768 avec panneaux et afficheur à points ;
  - smartphone en portrait 375×812, avec l'afficheur dans le bandeau supérieur ;
  - paysage 844×390, en vue à plat avec caméra de suivi.
- Les 4 arènes avec leur écran intégré. Le casse‑briques à plafond plat et la défense aux batteurs sont vérifiés à l'écran.
- Ambiances : multibille (bords magenta, cadre néon, balayage), Duel (mégapole et bords rouges, glitchs).
- **Audio** : les 104 effets s'exécutent sans erreur. Sous un test de charge (60 événements en 3 s, impacts en continu), le pic de sortie est à 0,85, sans aucun échantillon saturé.
- **Coût d'une image** : 2,2 ms de JavaScript, simulation, rendu, HUD et effets compris, avec 3 billes, sur ordinateur à DPR 1. Le post‑traitement prend environ 0,5 ms et le fond animé 0,3 ms.

## Limites connues

- **Pas d'écoute ni d'appareil réel** : le son n'a pas été écouté, seulement mesuré. La fluidité n'a pas été mesurée sur de vrais téléphones ; les effets baissent automatiquement de qualité si la fréquence d'images chute, et l'option « Réduire les effets visuels » les allège.
- **Vue inclinée** : elle est désactivée sur téléphone en paysage, où la caméra de suivi la remplace. Le haut du plateau est un peu plus petit qu'en vue à plat ; l'option « Vue 3D inclinée » permet de revenir à la vue de dessus.
- **Équilibrage** : les durées, valeurs et difficultés des minijeux ont été réglées avec des robots ; des sessions de jeu réelles permettront de les ajuster (tout est centralisé dans `src/config.js`, `src/game/bonus.js` et les en‑têtes des minijeux).
- **Vibrations** : non disponibles sur iOS Safari (limitation du navigateur).
- **Plein écran** : indisponible sur iPhone ; le bouton est alors masqué.
- **Polices** : Orbitron et Rajdhani sont chargées depuis Google Fonts. Hors ligne, des polices système les remplacent. Les quelques caractères japonais des enseignes du fond dépendent des polices du système.

## Débogage

Ajoutez `?debug` à l'adresse pour afficher le nombre d'images par seconde, les sous‑pas physiques, le nombre de billes et les erreurs de comptabilité. La console expose `__LN`, par exemple :
- `__LN.debug('start', 'hangar' | 'reactor' | 'defense' | 'core')`
- `__LN.debug('qualify', 'hangar')`
- `__LN.debug('multiball')`
- `__LN.debug('win')`

Démonstrations isolées : `tools/dev/dmd-demo.html` (afficheur à points) et `tools/dev/fx-demo.html` (fond et effets), à ouvrir via le serveur.
