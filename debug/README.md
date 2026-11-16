# Debug des mini-jeux

Ouvrir la racine du projet dans VS Code, puis **Open with Live Server** sur
`debug/index.html` : `http://127.0.0.1:5500/debug/` (selon le port utilisé).

La page reprend l'accueil et le CSS du jeu. Deux boutons permettent de lancer
directement le titre drôle ou la culture générale. Les liens Hôte et Joueur
ouvrent le jeu normal sur le serveur Node `localhost:3000`.

- Par défaut : 3 joueurs, Joueur 1 manuel et les autres automatiques.
- **Réglages du test** : nombre de joueurs, image, questions, bots et durées courtes.
- Décocher les bots pour contrôler toutes les manettes sur la même page.
- **Retour au menu** arrête le jeu et ses minuteurs. Un nouveau test remet les pièces à 5.

Le debug fonctionne avec un serveur statique, sans serveur Node. `app.js` gère
les interactions et un Worker charge les modules originaux dans `minijeux/`.
`engine.worker.js` adapte `module.exports`, le chargement JSON et les événements
du jeu aux messages du navigateur. Les règles, les scores et les récompenses
restent dans les modules existants. Le debug ne teste pas la connexion réseau,
la reconnexion ou le plateau ; ceux-ci se vérifient dans une partie normale.

Vérifications :

```sh
node --test debug/engine.test.js
npm test
```

Manuellement : jouer aux deux mini-jeux, essayer sans bots, laisser expirer
un délai et revenir au menu pendant une partie avant de relancer un autre jeu.