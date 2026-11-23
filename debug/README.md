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
4. Choisir le mini-jeu, puis **Tester**. Jouer uniquement depuis les téléphones.

L'écran principal charge `public/host/index.html` et les téléphones chargent
`public/play/index.html`. Les images, CSS, gestionnaires d'événements et
connexions Socket.IO sont ceux du jeu normal. Le debug réutilise le véritable
`server.js` et ne dessine aucun écran de jeu. Il prépare seulement le salon,
les trois identités et le lancement direct du mini-jeu, sans passage sur le plateau.

Les fenêtres ont des clés de session distinctes. Les rouvrir ne redémarre pas
la partie et ne recharge pas les fenêtres déjà ouvertes. Une fenêtre rafraîchie
utilise la reconnexion normale du jeu. Aucun bot ni bouton de joueur n'est
présent sur l'écran principal. Le serveur refuse de démarrer sans les trois joueurs.

**Arrêter** termine le test. Chaque nouveau test remet les pièces à 5 et les
étoiles à 0. Par défaut les durées sont celles du jeu ; **Durées courtes** est
une option. En fin de mini-jeu, les résultats puis la fin de partie sont affichés
comme dans le jeu normal.

Le sélecteur d'images utilise les fichiers présents dans `public/images/quiz1/`,
lus au démarrage du serveur : il suit la banque d'images du jeu sans liste copiée.

Pour **Course de chevaux**, choisir ce mini-jeu puis **Tester** et cliquer sur
**Clique !** dans les trois téléphones. Par défaut : préparation 3 s, course
20 s, arrivée à 60 clics ; en durées courtes : 2 s, 10 s, 30 clics. Les pistes
et les scores en direct sont ceux de l'écran Hôte officiel.

`DEBUG_PORT` permet de changer le port 3001. Dans ce cas, ouvrir l'entrée avec
`?server=http://127.0.0.1:PORT`. Aucune dépendance supplémentaire n'est ajoutée.
