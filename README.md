Mayo Party 🌭

Jeu de société multijoueur pas du tout inspiré de Mario Party. Un écran principal affiche le plateau, et chaque joueur participe avec son téléphone en scannant un QR code.

Les joueurs lancent le dé chacun leur tour et avancent sur un plateau en boucle, en gagnant des pièces et des étoiles selon les cases. À la fin de chaque tour, un mini-jeu leur permet de gagner des pièces. Celui qui a le plus d'étoiles à la fin de la partie gagne.
 
## Lancer le jeu
 
```bash
npm install
node server.js
```
 
## Pour effectuer des tests unitaires : 
```bash 
npm test
```

Ouvrir `http://localhost:3000` sur l'écran principal et choisir **Hôte**. Les joueurs scannent le QR code, sur le même réseau.

## Comprendre le code

Le [guide du code](GUIDE_CODE.md) explique l’organisation du projet, le déroulement d’une partie et le rôle des fonctions du serveur, des mini-jeux et des écrans web.
