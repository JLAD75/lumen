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

Le son démarre à la première interaction (contrainte des navigateurs). Les musiques sont dans `assets/music/` (MP3 ; la version `dist/` les charge depuis `../assets/music/`). Un morceau absent est remplacé par la musique procédurale.

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

- **3 billes pour toute la partie**, et **une vie de plus à chaque million de points** (les missions peuvent aussi en donner une). La réserve est plafonnée à 3 vies.
- **Réserve pleine au passage d'un million : le MODE FURIE.** La machine s'énerve : l'éclairage passe au rouge et des billes tombent par les couloirs C·P·U jusqu'à **10 billes en jeu**. Il faut en garder **au moins 6 pendant 30 s** : la réserve s'agrandit alors d'une vie (4 vies, puis 5 à la FURIE suivante, etc.), et la vie est donnée tout de suite. Sinon, la FURIE s'arrête dès qu'il reste moins de 6 billes, et celles qui restent continuent en multibille. Pendant la FURIE, il n'y a pas de sauvegarde de bille, les jackpots sont allumés, et **un batteur tenu levé plus de 3 s surchauffe** : il rougit, retombe et reste bloqué une seconde, jusqu'à ce que la commande soit relâchée. L'afficheur montre le chrono et le nombre de billes.
- **Une bille qui tombe dans un minijeu ne coûte rien** : le minijeu s'arrête (échec), la *même* bille revient sur le plateau principal par le portail, avec 4 s de protection. La progression du secteur est gardée pour la tentative suivante (briques détruites, vagues repoussées, séquences stabilisées, phase du duel).
- **Bouclier** : s'il est chargé, il est consommé et la bille est relancée sur place dans le minijeu.
- **Échec à l'objectif** (chrono écoulé, surcharge, coque détruite) : même retour au plateau.
- **Réussite** : la bille revient par le portail central, avec 4 s de protection.
- **Fin de partie** : quand la dernière bille est perdue sur le plateau principal.

### Fin de partie

Une séquence d'une vingtaine de secondes, que l'on peut passer avec Espace, Entrée ou un toucher, accompagne la musique de fin :
- « SIGNAL PERDU », puis le plateau s'éteint par une vague de bas en haut ; l'œil de LUMEN se ferme et NULL prend le contrôle (ville et lumières au rouge) ;
- le titre « FIN DE SESSION » se reconstitue en glitch, le score défile et le rapport de session s'écrit ligne par ligne (niveau, secteurs, minijeux, victoires sur NULL, jackpots, multibilles, meilleur combo, skill shots, missions, durée) ;
- le rang est révélé (« NOUVEAU RECORD ! » avec feux d'artifice, classement, ou points manquants) ;
- saisie des initiales façon borne d'arcade avec les mêmes commandes (← → choisissent la lettre, Espace ou Entrée valide ; on peut aussi taper les lettres) ;
- puis le tableau des 10 meilleurs scores s'anime (lignes qui arrivent une à une, nouvelle entrée mise en avant, or, argent, bronze), en boucle jusqu'à la partie suivante.

### Le plateau : trois niveaux

Le plateau a les proportions d'un vrai flipper (600 × 1 250 unités) et se joue sur trois couches physiques :

1. **Le plateau** : deux batteurs, slingshots, couloirs de retour et extérieurs (kickback à gauche), orbites gauche et droite avec spinners, portail central, banque de 3 cibles debout à gauche, 3 cibles tombantes à droite, 3 pop bumpers sous les couloirs C·P·U, et au centre le **cadran** autour de l'œil de LUMEN (avec son aimant).
2. **Les rampes à barillet** : la rampe gauche monte jusqu'au deuxième niveau ; la rampe droite fait un virage en U et redescend par une rampe en fil métallique jusqu'au couloir de retour droit. Chacune est un **barillet à trois faces** qui pivote pour présenter une autre rampe. Les orbites passent *sous* le pont.
3. **Le pont supérieur** (deuxième niveau, en haut) : deux petits batteurs commandés par les mêmes touches, 4 **cellules** à toucher et l'éjecteur **UPLINK**. On y arrive par le lanceur ou par la rampe gauche ; la bille qui passe entre les petits batteurs retombe dans les couloirs C·P·U.

### Accès aux secteurs : les rampes à barillet

Chaque rampe est un prisme à trois faces, comme les panneaux publicitaires rotatifs. La face présentée est une rampe différente (matière, couleur, décor), et elle mène à son propre minijeu :

| Rampe | Faces, dans l'ordre de rotation |
|---|---|
| Gauche (vers le pont) | HANGAR (cyan) : Casse‑briques orbital → RÉACTEUR (orange) : Singularité → GRAFFITI (jaune acide) : Fresque néon |
| Droite (virage en U) | DÉFENSE (vert) : Défense de la station → COFFRE (violet) : Braquage du coffre → ARÈNE (bleu) : Cyberball |

- **Chevrons** : chaque passage sur une rampe allume un chevron de la face présentée. La banque de 3 cibles gauches en ajoute un à gauche, les 3 cibles tombantes un à droite, les 4 cellules du pont et l'éjecteur UPLINK un de chaque côté. Avec **3 chevrons**, le minijeu est accessible (la flèche de la rampe clignote à la couleur du secteur) et le passage suivant l'emporte.
- **Rotation** : une face trop utilisée (5 passages, 2 si son secteur est déjà réactivé) ou dont le minijeu vient d'être joué fait **pivoter le barillet** vers la face suivante. Le mouvement est celui d'une machine : déverrouillage des vérins, rotation en trois crans, verrouillage. Pendant ce temps, le volet de la rampe est fermé et **l'aimant de l'œil** attire la bille, la retient au centre du cadran puis la relâche vers un batteur avec 3 s de protection. Une face qui s'en va garde ses chevrons : elle reste « qualifiée » jusqu'à son retour.
- **NOYAU (rouge)** : 3 secteurs réactivés, puis le portail central → Duel contre NULL.

Le **cadran** autour de l'œil de LUMEN, les flèches lumineuses devant chaque tir, l'encart « Prochain objectif » et les panneaux latéraux affichent l'état de chaque secteur : éteint, en préparation, qualifié (face non présentée), accessible (clignote), **en attente** (ambre) pendant une multibille ou une FURIE, ou réactivé (allumé fixe). Le cadran montre aussi la jauge du prochain million.

**Pendant une multibille ou une FURIE**, les accès aux minijeux sont mis en attente jusqu'au retour à une seule bille. Ils restent débloqués.

### Règles du plateau

- **Batteurs** : on vise en choisissant le moment de la frappe. Depuis le berceau, une frappe en milieu de batteur part vers le portail, une frappe près de la pointe vers la rampe opposée, une frappe tardive vers les cibles opposées.
- **Couloirs C·P·U** sous le pont : chaque série complète augmente le bonus de fin de bille. Deux séries allument la **multibille « Réplication du noyau »** au portail. Les batteurs décalent les lumières des couloirs.
- **Skill shot** : avant le lancer, les batteurs choisissent la cellule clignotante du pont ; touchez‑la avec les petits batteurs peu après le lancer.
- **Combos** : des tirs majeurs différents (orbites, rampes, portail, UPLINK) enchaînés en moins de 4 s. Les chevrons blancs indiquent les tirs qui prolongent le combo.
- **Kickback** : allumé en début de partie ; il renvoie une fois la bille du couloir extérieur gauche. Les 4 cellules du pont le rallument (et ajoutent un chevron à chaque barillet).
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

### Les sept minijeux

Tous se jouent avec la bille du flipper : c'est la même bille (même identifiant) qui traverse le portail. Les effets compatibles la suivent (bouclier, multiplicateur, noyau phasique). Chaque minijeu commence par un avantage d'entrée annoncé et par une barrière de protection de quelques secondes. Un écran intégré au‑dessus de l'arène affiche le titre, la progression et le chrono.

1. **Casse‑briques orbital** (90 s, sans gravité, plafond plat)
   - ← → déplacent la plateforme ; l'angle de sortie dépend du point d'impact. **LANCER** tire au laser quand la capsule LASER est active, ou libère la bille aimantée.
   - Deux murs de briques néon (« Rideau néon », puis « Herse descendante » qui descend lentement) : briques normales, blindées, explosives (en chaîne), chromées indestructibles, briques à capsule. Objectif : les **6 verrous dorés** (3 par mur), auxquels mènent des veines d'explosifs.
   - Capsules : LARGE, LASER, AIMANT, RALENTI, PERFO, +8 s, ×2, JACK, ÉCHO (deux billes holographiques temporaires, jamais comptées comme la vraie bille).
   - Récompense : jackpot de rampe, noyau phasique, multiplicateur ×2 si la capsule ×2 a été attrapée.
2. **Singularité** (secteur RÉACTEUR, 80 s, batteurs)
   - Le cœur du réacteur s'est effondré en micro‑trou noir, au centre de l'arène : son attraction courbe la trajectoire de la bille. 9 cellules d'énergie gravitent sur 3 orbites en sens alternés ; l'orbite intérieure, qui frôle l'horizon, vaut double. On récolte une cellule en la touchant ; elle se recharge en 3 s. Il en faut 21 (24, puis 27 aux niveaux suivants).
   - À chaque tiers récolté, la singularité grossit (attraction plus forte) et le palier est acquis. Une bille happée par l'horizon est recrachée sur un batteur, protégée par une barrière, contre une cellule perdue.
   - **Fronde gravitationnelle** : un tour de plus de 300° autour du trou sans rien toucher récolte toute l'orbite balayée (une jauge montre le tour en cours).
   - **Stabilisation** : la récolte faite, les cellules alimentent l'anneau de confinement ; frapper la singularité la fait imploser.
   - Récompense : bouclier, bumpers +1 niveau, et un multiplicateur après une fronde réussie.
3. **Fresque néon** (secteur GRAFFITI, 70 s, batteurs)
   - NULL a couvert le mur de la station d'affiches grises (« OBÉISSEZ », « NULL VOUS VOIT »…). La bille y laisse une traînée de peinture néon arc‑en‑ciel, plus large à grande vitesse, qui révèle une grande fresque cachée (différente à chaque niveau). Objectif : peindre **70 % du mur**.
   - Les 3 bumpers sont des bombes de peinture (grosses éclaboussures). Des drones nettoyeurs effacent la peinture ; les percuter les étourdit. Capsule AÉROSOL : trait doublé 6 s. Paliers à 25, 50 et 70 %.
   - Victoire : la fresque s'illumine et LUMEN la signe. Récompense : multiplicateur, bumpers +1, aimant si la victoire est rapide.
4. **Défense de la station** (100 s, batteurs)
   - Les drones descendent vers la ligne de défense. Pas besoin de les viser : touchez les **3 tourelles**, elles tirent seules sur le drone le plus dangereux. Les 3 tourelles en 5 s déclenchent une **salve** ; la bille au sommet du dôme déclenche le **canon orbital**. Toucher un drone avec la bille reste possible (dégâts doublés).
   - 3 vagues, dont un porte‑drones à point faible. Un drone qui franchit la ligne endommage la coque.
   - Récompense : multibille différée et une prime par vague repoussée.
5. **Braquage du coffre** (secteur COFFRE, 90 s, batteurs)
   - Le coffre‑fort de NULL : un noyau doré entouré d'anneaux blindés qui tournent en sens alternés. Un impact fissure une plaque, le second l'arrache ; un tir puissant l'arrache d'un coup. Passer toutes les brèches jusqu'au noyau = **COFFRE PERCÉ** : lingots et pièces à ramasser, +5 s.
   - Trois coffres de plus en plus blindés et rapides (ALPHA, BÊTA, OMÉGA). **Alignement** : quand toutes les brèches s'alignent face aux batteurs, un laser de visée s'allume ; percer dans l'axe vaut un JACKPOT.
   - Récompense : multiplicateur, et un jackpot de rampe après un JACKPOT.
6. **Cyberball** (secteur ARÈNE, 75 s, batteurs)
   - Un stade néon : marquez **5 buts** contre le drone gardien de NULL, qui anticipe la trajectoire avec un temps de réaction. Deux défenseurs patrouillent au milieu.
   - Un tir puissant assomme le gardien (but ouvert). POTEAU, LUCARNE (but contre un montant, points ×2), corners qui renvoient la bille en centre devant le but. Chaque but : ralenti, feux d'artifice, clameur ; NULL se renforce ensuite (gardien plus vif, défenseur supplémentaire, pressing).
   - Récompense : multiplicateur et aimant.
7. **Duel contre NULL** (120 s, batteurs)
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
                           singularity.js + singularityArt.js, graffiti.js + graffitiArt.js,
                           defense.js, vault.js + vaultArt.js, cyberball.js + cyberballArt.js, duel.js
src/render/                renderer.js (caméra, scènes, calques, écran des minijeux)
                           tableArt.js (habillage du plateau), dialArt.js (cadran central),
                           barrelArt.js (rampes à barillet), artKit.js (chrome, plastiques, inserts)
                           postfx.js (bloom, glitch), backdrop.js (mégapole animée)
                           fx.js (particules, arcs, balayages), sprites.js
src/audio/                 engine.js (bus, polyphonie, aiguillage musical), soundtrack.js (morceaux MP3),
                           sfx.js (+ un fichier sfx-*.js par minijeu), music.js, voice.js, ambience.js
assets/music/              bande-son (MP3)
src/input/input.js         clavier + multitouch + annulations
src/ui/hud.js              HUD DOM adaptatif portrait/paysage, vue inclinée, panneaux
src/ui/dmd.js              afficheur à points (score, animations, messages)
src/ui/gameover.js         séquence de fin de partie, initiales, tableau des scores
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
- **Bande‑son enregistrée** (`assets/music/*.mp3`) : un morceau par moment du jeu (accueil, plateau, multibille, chaque minijeu, fin de partie), lu en flux sur deux platines qui alternent pour des fondus enchaînés. Le morceau du plateau reprend où il s'était arrêté, les volumes sont égalisés, et l'ambiance de la station se tait pendant ces morceaux.
- **Musique électronique adaptative** (repli si un morceau manque) : 10 modes avec chacun son tempo et sa tonalité. Des couches s'activent selon l'intensité (combos, multibille), la tension (dernière bille, chrono) ajoute des éléments, et le tempo augmente avec le niveau.
- **Signatures de droïde** à chaque réplique, tirées de son texte (la même réplique sonne toujours pareil), sur le principe de l'échantillonneur-bloqueur des synthés des années 70-80 (R2-D2) : hauteurs aléatoires tenues, « brrip » de modulation à chaque saut, glissés, trilles et bips. LUMEN dans l'aigu ; NULL grave, carré et modulé en anneau, finit par une mise hors tension. Une seule voix par réplique (4 à 6 nœuds), rien si la voix est coupée.
- **Réglages** : volumes séparés et mode muet, sauvegardés localement.

---

## Ce qui a été testé

### Tests automatisés (Node, sans navigateur)

```bash
node tools/sim-tests.js          # plateau, barillets, aimant, FURIE, les 7 minijeux
node tools/test-breakout.js      # casse-briques + parties de robots
node tools/test-singularity.js   # singularité
node tools/test-graffiti.js      # fresque néon
node tools/test-defense.js       # défense
node tools/test-vault.js         # braquage du coffre
node tools/test-cyberball.js     # cyberball
node tools/table-geometry.js     # lancer, tirs depuis le berceau, pont, robustesse, blocages
node tools/shot-map.js           # carte des tirs depuis le berceau et en mouvement
node tools/soak.js 6 600         # endurance : 6 parties de 10 min
```

- **Minijeux** :
  - une chute ne consomme aucune bille et ramène la *même* bille sur le plateau, avec protection ;
  - avec un bouclier, la même bille est relancée dans le minijeu ;
  - la progression est mémorisée puis reprise à la tentative suivante ;
  - une chute avec une seule bille en réserve ne termine pas la partie ;
  - ces points sont vérifiés sur les 7 minijeux ; au retour, le barillet joué pivote pendant que l'aimant retient la bille.
- **Continuité de la bille** : même identifiant à l'entrée et à la sortie, aucun doublon, la bille en attente de relance est servie au lanceur si le chrono expire.
- **Plateau à trois niveaux** :
  - un lancer franc mène toujours au pont supérieur ;
  - une bille lâchée sur le pont redescend toujours (30/30) ;
  - les petits batteurs atteignent cellules et UPLINK ;
  - les 4 cellules et l'UPLINK ajoutent un chevron sur chaque barillet ;
  - l'UPLINK retient puis renvoie la bille ;
  - les cibles tombantes s'abattent et se relèvent ;
  - le kickback renvoie la bille une fois.
- **Physique** : 600 billes lancées sur le plateau, les orbites et le pont à des vitesses aléatoires : aucune n'a traversé un mur ni ne s'est bloquée. Recensement des immobilisations : 1 500 billes lâchées dans toutes les zones accessibles, batteurs au repos : aucune micro‑vibration ni secousse nécessaire. Depuis le berceau, rampes, portail, cibles et bumpers sont atteignables comme sur l'ancien plateau.
- **Multibille, bonus, pause** : accès mis en attente puis rétablis, plafonds et cumuls des bonus, simulation figée en pause.
- **Barillets et aimant** : 3 passages ouvrent le minijeu de la face, le 4e le lance ; 5 passages en attente font pivoter le barillet (volet fermé, face suivante, chevrons gardés) ; la bille relâchée par l'aimant tombe sur un batteur dans 24 cas sur 24.
- **Vie au million et FURIE** : une vie au million ; réserve pleine → 10 billes ; pas de réinjection pendant la FURIE ; surchauffe d'un batteur tenu plus de 3 s puis retour à la normale ; réussite (réserve portée à 4) et échec (multibille qui continue) ; 20 s de FURIE automatique sans erreur de comptabilité.
- **Robots des minijeux** :
  - Casse‑briques : des robots de niveaux variés gagnent environ la moitié des parties, sans bille coincée ni sortie de l'arène. Le temps passé près des murs est passé de 38 % à 22 %.
  - Défense : un robot simple gagne 100 % des parties avec une bille infinie. Avec les vraies règles, il réussit en 3 tentatives dans 60 à 77 % des cas (progression gardée).
  - Singularité, Fresque néon, Coffre, Cyberball : chaque banc vérifie que tous les objectifs sont atteignables par des tirs de batteurs (recensement de milliers de tirs) et qu'aucune bille ne reste immobile ou enfermée (de 360 à 3 000 billes lâchées partout, batteurs au repos). Avec les vraies règles, un robot qui frappe au hasard gagne au niveau 1 entre 20 et 70 % des parties selon le minijeu, et en 3 tentatives au plus (progression gardée) entre 70 et 97 %.
- **Endurance** : environ 390 000 pas de simulation, jusqu'au niveau 6 et 21 victoires contre NULL, sans exception, sans bille dupliquée, sans valeur invalide.
- **Revue croisée** : 5 relecteurs et 5 vérificateurs indépendants ont relu la refonte ; les défauts confirmés (exports perdus dans la version fichier unique, passage sous les petits batteurs du pont, porte du lanceur, annonces de secteur, messages d'échec, affichage) ont été corrigés et, pour la plupart, couverts par un test.

### Vérifié dans le navigateur (Chromium, panneau intégré)

- Rendu du nouveau plateau en vue inclinée :
  - grand écran 1024×768 avec panneaux et afficheur à points ;
  - smartphone en portrait 375×812, avec l'afficheur dans le bandeau supérieur ;
  - paysage 844×390, en vue à plat avec caméra de suivi.
- Les 7 arènes avec leur écran intégré, en bureau et en portrait 375×812 ; le cadran, la rotation des barillets avec l'aimant, et la FURIE sur le plateau. Le casse‑briques à plafond plat et la défense aux batteurs sont vérifiés à l'écran.
- Ambiances : multibille (bords magenta, cadre néon, balayage), Duel (mégapole et bords rouges, glitchs).
- **Musiques** : les 8 morceaux se chargent ; plateau → multibille → casse‑briques → plateau vérifié (fondus, reprise de position, musique procédurale et ambiance coupées pendant les morceaux).
- **Fin de partie** : séquence complète, saisie des initiales et tableau des scores vérifiés à 1280×800, 375×812, 844×390, 667×375 et 360×640.
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
- `__LN.debug('start', 'hangar' | 'reactor' | 'tag' | 'defense' | 'vault' | 'arena' | 'core')`
- `__LN.game.table.pivot('L', 'overuse', bille)` (rotation d'un barillet), `__LN.game.startFrenzy()` (FURIE)
- `__LN.debug('qualify', 'hangar')`
- `__LN.debug('multiball')`
- `__LN.debug('win')`

Démonstrations isolées : `tools/dev/dmd-demo.html` (afficheur à points) et `tools/dev/fx-demo.html` (fond et effets), à ouvrir via le serveur.
