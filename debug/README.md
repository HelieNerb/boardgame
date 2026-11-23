# Debug local

Depuis la racine du projet :

```sh
node debug/server.js
```

Ouvrir **http://127.0.0.1:3001/debug/**. L'entrée `debug/index.html` fonctionne
également avec Live Server, à condition que ce serveur Node soit lancé.

1. Attendre le code du salon sur l'écran principal.
2. Cliquer **Ouvrir 3 téléphones**. Si le navigateur bloque des fenêtres,
   ouvrir les boutons **Joueur 1**, **Joueur 2**, **Joueur 3** séparément.
3. Attendre **3/3 téléphones connectés**.
4. Choisir **Plateau + les 3 mini-jeux** pour parcourir trois tours et voir
   chacun des mini-jeux dans le tirage normal, ou choisir un mini-jeu pour le
   lancer directement. Jouer uniquement depuis les téléphones.

L'écran principal charge `public/host/index.html` et les téléphones chargent
`public/play/index.html`. Les images, CSS, gestionnaires d'événements et
connexions Socket.IO sont ceux du jeu normal. Le debug réutilise le véritable
`server.js` et ne dessine aucun écran de jeu. Il prépare le salon et les trois
identités ; le mode plateau lance le parcours officiel puis trois mini-jeux
successifs tirés comme en partie.

Les fenêtres ont des clés de session distinctes. Les rouvrir ne redémarre pas
la partie et ne recharge pas les fenêtres déjà ouvertes. Une fenêtre rafraîchie
utilise la reconnexion normale du jeu. Aucun bot ni bouton de joueur n'est
présent sur l'écran principal. Le serveur refuse de démarrer sans les trois joueurs.

**Arrêter** termine le test. Chaque nouveau test remet les pièces à 5 et les
étoiles à 0. Par défaut les durées sont celles du jeu ; **Durées courtes** est
une option. En fin de mini-jeu, les résultats puis la fin de partie sont affichés
comme dans le jeu normal.

Dans **Réglages du debug**, tu peux fixer les pièces d'un joueur, lui donner un
objet (deux emplacements maximum) ou vider son inventaire. Tu peux aussi imposer
le prochain dé, déplacer un joueur vers une case quand il attend son lancer, ou
passer le mini-jeu en cours pour continuer le parcours.

Le sélecteur d'images utilise les fichiers présents dans `public/images/quiz1/`,
lus au démarrage du serveur : il suit la banque d'images du jeu sans liste copiée.

Pour **Course de chevaux**, choisir ce mini-jeu puis **Tester** et cliquer sur
**Clique !** dans les trois téléphones. Par défaut : préparation 3 s, course
20 s, arrivée à 60 clics ; en durées courtes : 2 s, 10 s, 30 clics. Les pistes
et les scores en direct sont ceux de l'écran Hôte officiel.

`DEBUG_PORT` permet de changer le port 3001. Dans ce cas, ouvrir l'entrée avec
`?server=http://127.0.0.1:PORT`. Aucune dépendance supplémentaire n'est ajoutée.
