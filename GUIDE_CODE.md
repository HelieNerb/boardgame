# Guide du code de Mayo Party

Ce guide décrit le cheminement d’une partie et le rôle des fonctions principales. Le serveur fait foi pour les règles et les scores : les pages web affichent son état et lui transmettent les actions des joueurs.

## Vue d’ensemble

1. `server.js` sert les fichiers de `public/` et gère les connexions Socket.IO.
2. L’écran **Hôte** demande au serveur de créer une partie. Le serveur génère un code, choisit la case étoile et produit un QR code contenant l’adresse de la page joueur.
3. Chaque téléphone rejoint la partie avec le code et un pseudo. Le serveur garde les joueurs, leurs scores, leurs positions, leurs sockets et un jeton privé permettant la reconnexion.
4. L’hôte démarre la partie. À chaque tour, les joueurs lancent le dé à tour de rôle, avancent sur le plateau et appliquent l’effet de la case d’arrivée. S’ils rencontrent une étoile, le déplacement attend leur choix.
5. Quand tout le monde a joué, le serveur choisit un mini-jeu. À sa fin, le tour suivant commence. La partie s’arrête après le nombre de tours choisi et le serveur envoie le classement.

Les événements `socket.emit(...)` envoient une action au serveur ou une réponse à un client. `io.to(code).emit(...)` diffuse un événement à toute la partie; `socket.emit(...)` répond uniquement au socket concerné.

## `server.js` — partie, règles et réseau

### Données principales

- `PLATEAU` décrit le type des 24 cases; les positions des joueurs sont des index de 0 à 23.
- `POSITIONS_ETOILE` contient les cases où l’étoile peut apparaître.
- `parties` est une `Map` de codes de partie vers leur état complet. Cet état contient entre autres les joueurs, le tour courant, la phase, les minuteurs, les mini-jeux et les informations de reconnexion.
- `AVATAR_OPTIONS`, les constantes `PIECES_*`, `PRIX_ETOILE` et `NB_TOURS_*` définissent les valeurs permises et l’économie du jeu.

### Fonctions de préparation et règles

| Fonction | Rôle |
| --- | --- |
| `getLocalIp()` | Trouve l’adresse IPv4 du réseau local pour que les téléphones puissent joindre le serveur; renvoie `localhost` si aucune adresse n’est trouvée. |
| `choisirPositionEtoile(partie)` | Choisit une case étoile libre, différente de la position actuelle. Si les joueurs occupent toutes les cases possibles, choisit parmi les autres positions d’étoile. |
| `plateauAvecEtoile(partie)` | Construit la version du plateau envoyée aux écrans, en remplaçant le type de la case étoile par `etoile` sans modifier `PLATEAU`. |
| `normaliserAvatar(avatar)` | Vérifie couleur, yeux et bouche reçus du téléphone; remplace les valeurs inconnues par les options par défaut. |
| `listerImages(dossier)` | Liste les fichiers image du dossier du quiz titre; retourne une liste vide si le dossier n’est pas accessible. Cette liste est lue au démarrage du serveur. |
| `melanger(tableau)` | Retourne une copie mélangée du tableau (algorithme Fisher–Yates), sans changer l’original. |
| `piocherImage(partie)` | Tire une image du paquet de la partie; remélange toutes les images quand le paquet est épuisé, ce qui évite les répétitions avant la fin du paquet. |
| `genererCode()` | Produit un code de quatre lettres sans caractères ambigus et recommence si ce code est déjà utilisé. |
| `joueurActif(partie)` | Renvoie le joueur à l’index `indexActif`. |
| `appliquerEffetCase(partie, joueur)` | Applique le gain d’une case bleue, la perte limitée aux pièces disponibles d’une case rouge, ou l’achat de l’étoile si le joueur peut la payer. Renvoie le type et le message à afficher. |
| `deplacerPasAPas(code, pseudo, pasRestants)` | Avance le joueur actif d’une case par appel. Suspend le déplacement à l’étoile; sinon applique l’effet à l’arrivée, diffuse positions et scores, puis programme le prochain pas ou le prochain joueur. |
| `classement(partie)` | Trie une copie de la liste des joueurs par nombre d’étoiles décroissant, puis par pièces décroissantes. |
| `infosTour(partie)` | Prépare les informations de tour envoyées aux clients : numéro de tour, joueur actif et possibilité de lancer le dé. |

### Tours, mini-jeux et départs

| Fonction | Rôle |
| --- | --- |
| `surveillerJoueurActif(code)` | Annule l’ancien minuteur du tour; si le joueur actif est déconnecté, programme le passage automatique à son successeur. |
| `demarrerTourJoueur(code)` | Place la partie en phase `attente-de`, informe les clients du joueur actif et vérifie sa connexion. |
| `joueurSuivant(code)` | Avance l’index actif; quand tous les joueurs ont joué, appelle `finDeTour`, sinon démarre le tour du prochain joueur. |
| `miniJeuxDisponibles()` | Retourne les mini-jeux jouables. Le quiz titre n’est ajouté que si des images sont disponibles. |
| `piocherMiniJeu(partie)` | Tire un mini-jeu d’un paquet mélangé; recharge le paquet vide avant un nouveau tirage. |
| `finDeTour(code)` | Prépare les fonctions communes aux mini-jeux, en tire un, avertit les clients et démarre `demarrerQuiz` ou `demarrerCulture`. Le rappel `onFin` nettoie l’état du mini-jeu puis passe au prochain tour. |
| `tourSuivant(code)` | Incrémente le tour, remet l’index au premier joueur, puis démarre le tour ou termine la partie si la limite est dépassée. |
| `finDePartie(code)` | Place la partie en phase `fin` et diffuse le classement final. |
| `retirerJoueur(code, pseudo)` | Enlève un joueur absent depuis trop longtemps, nettoie son socket, ses jetons et minuteurs, corrige l’index actif et prévient le mini-jeu qu’il ne faut plus attendre ce joueur. |

### Événements Socket.IO

Le bloc `io.on('connection', ...)` enregistre les actions disponibles pour chaque socket.

| Événement reçu | Traitement |
| --- | --- |
| `creer-partie` | Crée l’état initial de la partie, choisit l’étoile, met l’hôte dans la salle Socket.IO et lui envoie le code et le QR code. |
| `rejoindre` | Valide code et pseudo, normalise l’avatar, ajoute le joueur avec ses pièces de départ et lui remet un jeton secret de reconnexion. |
| `reconnecter` | Valide le jeton, remplace l’ancien socket, restaure l’écran correspondant à la phase en cours et annule le délai d’abandon. |
| `demarrer` | Retire les joueurs déjà déconnectés, exige au moins trois joueurs connectés, valide le nombre de tours et lance le premier tour. |
| `lancer-de` | Vérifie que l’émetteur est le joueur actif en attente, tire un résultat de 1 à 6 et commence son déplacement. |
| `choix-etoile` | Vérifie que le joueur actif répond à la demande en cours; achète ou refuse l’étoile puis reprend le déplacement suspendu. |
| `quiz-reponse`, `quiz-vote`, `culture-reponse` | Transmettent les actions au mini-jeu du bon type. La fonction imbriquée `miniJeuEnCours(type)` évite d’appeler une méthode qui n’existe pas sur l’autre mini-jeu. |
| `disconnect` | Supprime une partie si son hôte part; pour un joueur, le marque temporairement absent et programme son retrait définitif. Ignore la déconnexion d’un ancien socket remplacé lors d’une reconnexion. |

## `minijeux/quiz.js` — écrire puis voter pour un titre

`demarrerQuiz(options)` crée l’état privé du mini-jeu : réponses, propositions, votes, phase et minuteur. Il diffuse d’abord l’image. Les durées peuvent être remplacées avec `options.durees` (utile aux tests). Les fonctions retournées sont appelées par `server.js`.

| Fonction | Rôle |
| --- | --- |
| `melanger(tableau)` | Mélange une copie, notamment pour cacher l’ordre des auteurs. |
| `emettre(evenement, donnees)` | Diffuse une mise à jour du mini-jeu à toute la salle. |
| `programmer(secondes, fonction)` | Remplace le minuteur courant et mémorise l’heure de fin de phase. |
| `resteSecondes()` | Calcule le temps restant pour une personne qui revient en cours de phase. |
| `estJoueur(pseudo)` | Vérifie que le pseudo appartient encore à la partie. |
| `emettreProgression()` | Diffuse le nombre de titres écrits ou de votes reçus selon la phase. |
| `demarrerEcriture()` | Diffuse l’image et ouvre la phase d’écriture. |
| `repondre(pseudo, texte)` | Refuse les non-joueurs, doublons et textes vides; nettoie et limite le titre à 100 caractères. Démarre le vote dès que tous ont répondu. |
| `demarrerVote()` | Mélange les titres, attribue des identifiants, envoie à chaque joueur l’identifiant de son propre titre et publie des propositions anonymes. S’il y a moins de deux titres, passe directement aux résultats. |
| `voter(pseudo, id)` | Accepte un seul vote valide par joueur et interdit de voter pour sa propre proposition. Affiche les résultats dès que tous ont voté. |
| `afficherResultats()` | Compte les votes, attribue cinq pièces à chaque proposition à égalité en tête si elle a reçu au moins un vote, puis diffuse les résultats. |
| `terminer()` | Termine le mini-jeu, coupe son minuteur et appelle `onFin`. |
| `retirerJoueur(pseudo)` | Enlève la réponse ou le vote du joueur retiré et vérifie si la phase peut se terminer plus tôt. |
| `renvoyerEtat(pseudo)` | Réexpédie au joueur reconnecté l’écran de sa phase, avec l’information indiquant s’il a déjà répondu ou voté. |
| `arreter()` | Met fin au mini-jeu sans rappel de fin et coupe le minuteur, notamment quand la partie est détruite. |

## `minijeux/culture-g.js` — questions à choix multiples

`demarrerCulture(options)` tire jusqu’à cinq questions sans doublon et garde les scores en mémoire. Chaque question passe par `lecture` → `question` → `correction`; la série se termine par `classement`. Les durées, la banque de questions et le nombre de questions peuvent être remplacés dans `options`, ce qui facilite les tests.

| Fonction | Rôle |
| --- | --- |
| `melanger(tableau)` | Mélange une copie pour varier l’ordre des questions et des réponses. |
| `preparerQuestion(q)` | Assemble la bonne et les mauvaises réponses, les mélange et mémorise l’index correct côté serveur. |
| `emettre(evenement, donnees)` | Diffuse un événement à toute la salle. |
| `programmer(secondes, fonction)` | Programme une transition de phase et mémorise son échéance. |
| `resteSecondes()` | Calcule le temps restant à communiquer lors d’une reconnexion. |
| `estJoueur(pseudo)` | Vérifie que le joueur fait encore partie de la partie. |
| `scoreDe(pseudo)` | Renvoie le score cumulatif ou zéro si le joueur n’a pas encore marqué. |
| `questionCourante()` | Renvoie l’objet préparé pour la question courante. |
| `questionPublique()` | Construit le contenu envoyé aux écrans, avec réponses, couleurs et formes, mais sans l’index de la bonne réponse. |
| `calculerClassement()` | Trie les joueurs par score et donne le même rang aux ex æquo (les rangs suivants sautent en conséquence). |
| `emettreProgression()` | Diffuse le nombre de réponses reçues pour la question. |
| `demarrerLecture()` | Réinitialise les réponses et affiche brièvement l’énoncé sans les choix. |
| `demarrerQuestion()` | Ouvre les choix, démarre la mesure du temps serveur et lance le minuteur de réponse. |
| `repondre(pseudo, index)` | Valide phase, joueur, unicité et index du choix; enregistre le temps serveur et déclenche la correction quand tous ont répondu. |
| `calculerPoints(temps)` | Donne entre 1000 et 500 points selon le temps de réponse, plafonné à la durée prévue. |
| `afficherCorrection()` | Compare les réponses, met à jour les scores, calcule la répartition, diffuse la correction et envoie le résultat personnel à chacun. |
| `resultatPerso(pseudo)` | Prépare pour un joueur son statut, ses points gagnés, son score total et son rang. |
| `questionSuivante()` | Passe à la question suivante ou au classement quand la série est terminée. |
| `afficherClassement()` | Attribue au podium 5, 3 et 1 pièces (les joueurs à zéro point n’en reçoivent pas), puis diffuse le classement final. |
| `terminer()` | Coupe le minuteur et signale à `server.js` que le mini-jeu est fini. |
| `retirerJoueur(pseudo)` | Retire sa réponse en cours et peut lancer la correction si les joueurs restants ont répondu. |
| `renvoyerEtat(pseudo)` | Renvoie l’écran correspondant à la phase en cours, en préservant le choix déjà donné et le temps restant. |
| `arreter()` | Arrête le mini-jeu et son minuteur sans enchaîner un nouveau tour. |

## Côté navigateur

Les deux pages HTML contiennent leur JavaScript directement dans une balise `<script>`. Elles ne calculent pas les scores : elles affichent les événements du serveur et lui envoient les actions.

### `public/host/index.html` — écran hôte

| Fonction | Rôle |
| --- | --- |
| `afficherEstimationDuree()` | Vérifie le nombre de tours et affiche une estimation indicative de durée. |
| `demarrerPartie()` | Vérifie le champ du nombre de tours et envoie `demarrer`. |
| `lancerChrono(secondes, idElement)` | Affiche un compte à rebours; l’identifiant permet de réutiliser le chrono pour les deux mini-jeux. |
| `afficherCulture()` | Cache le plateau et les autres mini-jeux, puis montre l’écran culture générale. |
| `viderCulture()` | Efface le contenu de l’étape précédente du quiz de culture générale. |
| `creerCarteReponse(r)` | Crée une carte de réponse avec sa couleur, sa forme, son texte et un compteur. |
| `afficherListeClassement(classement, avecPieces)` | Affiche un classement; ajoute les pièces quand on montre le classement final. |
| `afficherScores()` | Reconstruit les cartes de scores et distingue le joueur actif et les joueurs déconnectés. |
| `positionsBoucle(n)` | Calcule les coordonnées grille des cases pour disposer le plateau en boucle rectangulaire. |
| `afficherPlateau()` | Redessine les scores, les cases, leurs types et les pions à partir de l’état reçu du serveur. |

Les écouteurs `socket.on(...)` mettent à jour l’écran salon, le QR code, le plateau et les scores. Ceux de `quiz-*` affichent l’image, la progression, les propositions et le résultat du quiz titre. Ceux de `culture-*` affichent lecture, réponses, correction et classement. `fin-de-partie` remplace l’écran par le classement final.

### `public/play/index.html` — téléphone joueur

| Fonction | Rôle |
| --- | --- |
| `lireAvatar()` | Charge le choix d’avatar mémorisé sur le téléphone; renvoie une valeur par défaut si la donnée n’est pas lisible. |
| `enregistrerAvatar()` | Sauvegarde l’avatar courant dans `localStorage`. |
| `afficherAvatar()` | Met à jour l’aperçu, les libellés des yeux et de la bouche, et les boutons de couleur. |
| `defilerAvatar(groupe, sens)` | Passe à l’option d’yeux ou de bouche suivante/précédente, en revenant au début ou à la fin de la liste. |
| `avatarAleatoire()` | Tire un avatar aléatoire, le mémorise et rafraîchit l’aperçu. |
| `lireSession()` | Lit la session `{ code, pseudo, token }` de reconnexion dans `localStorage`. |
| `sauverSession(session)` | Enregistre la session après une première connexion. |
| `effacerSession()` | Supprime une session invalide ou terminée. |
| `rejoindre()` | Envoie au serveur le code, le pseudo et l’avatar choisi. |
| `lancerDe()` | Désactive immédiatement le bouton puis envoie `lancer-de`. |
| `choisirEtoile(acheter)` | Ferme le dialogue étoile et envoie la décision au serveur. |
| `afficherStats(joueurs)` | Retrouve le joueur local dans la liste et affiche ses pièces et ses étoiles. |
| `afficherQuiz(partie)` | Montre l’écriture, le vote ou masque le mini-jeu titre pour revenir au plateau. |
| `envoyerTitre()` | Refuse un texte vide, envoie le titre et verrouille le champ en attendant la confirmation serveur. |
| `afficherCulture(visible)` | Montre ou masque le quiz de culture; en l’affichant, masque les autres écrans. |
| `viderCulture()` | Réinitialise les consignes, choix, résultat et message du quiz culture. |
| `texteEntete(numero, total, categorie)` | Formate l’en-tête d’une question. |
| `texteRang(rang)` | Formate un rang français (`1er`, `2e`, etc.). |
| `choisirReponse(index)` | Envoie le choix au serveur et verrouille les boutons immédiatement. |
| `marquerChoix(index)` | Désactive les choix et met visuellement en évidence celui déjà sélectionné. |

Les événements `connect`, `reconnecte` et `reconnexion-refusee` restaurent ou nettoient la session du joueur. Les événements `tour`, `resultat-de`, `demande-achat-etoile`, `positions` et `effet-case` pilotent l’écran de jeu. Les écouteurs `quiz-*` et `culture-*` affichent les étapes des mini-jeux; le calcul et la validation restent côté serveur.

### `public/avatar.js`

Le code est enveloppé dans une fonction anonyme pour ne pas ajouter de variables globales au navigateur; il expose seulement `window.MayoAvatar`.

| Fonction | Rôle |
| --- | --- |
| `normaliser(avatar)` | Remplace les identifiants d’options invalides par les choix par défaut. |
| `optionLabel(groupe, id)` | Renvoie le libellé lisible d’une option de couleur, d’yeux ou de bouche. |
| `creer(avatar, className)` | Construit un SVG accessible du personnage avec des formes vectorielles pixelisées et les options choisies. |
| `pixels(x, y, width, height, fill)` | Ajoute un rectangle SVG, utilisé pour dessiner les pixels du visage. |
| `path(d, fill)` | Ajoute un tracé SVG, utilisé pour la silhouette et certaines expressions. |
| `aleatoire()` | Tire au hasard une couleur, des yeux et une bouche valides. |
| `choisir(groupe)` | Fonction locale à `aleatoire`; tire une valeur pour un groupe d’options. |

### Données, styles et tests

- `minijeux/questions/culture.json` est une banque de données, pas du code : chaque objet contient une catégorie, une question, la réponse correcte et trois mauvaises réponses.
- `public/style.css` définit l’apparence et la mise en page des pages hôte et joueur; les classes ajoutées par le JavaScript déterminent les états visuels (actif, gagnant, bonne réponse, etc.).
- `test/regles.test.js` vérifie les règles pures du plateau, des avatars, du classement et de l’économie.
- `test/minijeux.test.js` utilise un faux canal Socket.IO pour vérifier les comportements des deux mini-jeux sans lancer de vrai serveur. `creerBancEssai()` collecte les événements; `attendreEvenement()` attend un événement asynchrone avec une limite de temps.

