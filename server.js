const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const os = require('os');
const QRCode = require('qrcode'); // Librairie ajoutée
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { demarrerQuiz } = require('./minijeux/quiz');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

// Récupère l'IP locale (ex: 192.168.1.42)
function getLocalIp() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return 'localhost';
}

const LOCAL_IP = getLocalIp();
const PORT = 3000;

const PLATEAU = [
  'depart', 'bleue', 'bleue', 'rouge', 'bleue', 'bleue',
  'bleue', 'bleue', 'rouge', 'bleue', 'bleue', 'rouge',
  'bleue', 'bleue', 'bleue', 'rouge', 'bleue', 'bleue',
  'bleue', 'bleue', 'rouge', 'bleue', 'rouge', 'bleue',
];

// Emplacements possibles pour l'étoile
const POSITIONS_ETOILE = [6, 12, 18];

function choisirPositionEtoile(partie) {
  const positionsDisponibles = POSITIONS_ETOILE.filter(position =>
    position !== partie.etoilePosition &&
    !partie.joueurs.some(joueur => joueur.position === position)
  );

  if (positionsDisponibles.length === 0) {
    const autresPositions = POSITIONS_ETOILE.filter(
      position => position !== partie.etoilePosition
    );

    return autresPositions[
      Math.floor(Math.random() * autresPositions.length)
    ];
  }

  return positionsDisponibles[
    Math.floor(Math.random() * positionsDisponibles.length)
  ];
}
function plateauAvecEtoile(partie) {
  return PLATEAU.map((type, index) =>
    index === partie.etoilePosition ? 'etoile' : type
  );
}
// Paramètres de partie
const NB_TOURS_DEFAUT = 15;
const NB_TOURS_MIN = 5;
const NB_TOURS_MAX = 50;
const DELAI_FIN_TOUR_JOUEUR = 2500; // ms, le temps de voir le pion avancer et l'effet de la case

// Reconnexion : un joueur déconnecté garde sa place pendant ce délai, puis il est retiré
const DELAI_RECONNEXION = 60000; // ms
// Si c'est à un joueur déconnecté de jouer, on passe son tour (sans le retirer) après ce délai
const DELAI_TOUR_ABSENT = 15000; // ms

// Règles de l'économie du jeu
const PIECES_DEPART = 5;
const GAIN_CASE_BLEUE = 3;
const PERTE_CASE_ROUGE = 3;
const PRIX_ETOILE = 10;

const parties = new Map();

// ─────────────────────────────────────────────
//  Images du quiz : tous les JPG / PNG / WebP du dossier public/images/quiz1
//  sont lus au démarrage du serveur (ajouter une image = la déposer dans le dossier)
// ─────────────────────────────────────────────

const DOSSIER_QUIZ1 = path.join('public', 'images', 'quiz1');

function listerImages(dossier) {
  try {
    return fs.readdirSync(dossier).filter((f) => /\.(jpe?g|png|webp|gif)$/i.test(f));
  } catch (err) {
    return []; // dossier absent : le quiz sera simplement sauté
  }
}

const IMAGES_QUIZ1 = listerImages(DOSSIER_QUIZ1);

function melanger(tableau) {
  const copie = [...tableau];
  for (let i = copie.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copie[i], copie[j]] = [copie[j], copie[i]];
  }
  return copie;
}

// Pioche comme dans un paquet de cartes : pas de doublon tant que le paquet n'est pas vide
function piocherImage(partie) {
  if (!partie.imagesRestantes || partie.imagesRestantes.length === 0) {
    partie.imagesRestantes = melanger(IMAGES_QUIZ1);
  }
  return partie.imagesRestantes.pop();
}

function genererCode() {
  const lettres = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  let code;
  do {
    code = '';
    for (let i = 0; i < 4; i++) {
      code += lettres[Math.floor(Math.random() * lettres.length)];
    }
  } while (parties.has(code));
  return code;
}

// ─────────────────────────────────────────────
//  Gestion des tours
//
//  Un "tour" = tous les joueurs jouent chacun une fois.
//  phase :
//    'salon'       → la partie n'a pas commencé
//    'attente-de'  → on attend que le joueur actif lance le dé
//    'deplacement' → le dé est lancé, on laisse le temps de voir le résultat
//    'fin'         → la partie est terminée
// ─────────────────────────────────────────────

function joueurActif(partie) {
  return partie.joueurs[partie.indexActif];
}

// ─────────────────────────────────────────────
//  Effets des cases
//
//  Appelée quand un joueur vient d'arriver sur une case.
//  Elle modifie le joueur (pièces / étoiles) et renvoie un objet
//  { type, message } que l'on envoie aux écrans pour l'afficher.
// ─────────────────────────────────────────────


function appliquerEffetCase(partie, joueur) {
  const type = joueur.position === partie.etoilePosition
    ? 'etoile'
    : PLATEAU[joueur.position];

  switch (type) {
    case 'bleue':
      joueur.pieces += GAIN_CASE_BLEUE;
      return {
        type,
        message: `${joueur.pseudo} gagne ${GAIN_CASE_BLEUE} pièces !`
      };

    case 'rouge': {
      const perte = Math.min(PERTE_CASE_ROUGE, joueur.pieces);
      joueur.pieces -= perte;

      return {
        type,
        message: `${joueur.pseudo} perd ${perte} pièces...`
      };
    }

    case 'etoile':
      if (joueur.pieces >= PRIX_ETOILE) {
        joueur.pieces -= PRIX_ETOILE;
        joueur.etoiles++;

        return {
          type,
          achatEtoile: true,
          message: `${joueur.pseudo} achète une étoile pour ${PRIX_ETOILE} pièces ! ⭐`
        };
      }

      return {
        type,
        achatEtoile: false,
        message: `${joueur.pseudo} n'a pas assez de pièces pour l'étoile (${PRIX_ETOILE} nécessaires)`
      };

    default:
      return {
        type,
        message: `${joueur.pseudo} est sur la case départ`
      };
  }
}

function deplacerPasAPas(code, pseudo, pasRestants) {
  const partie = parties.get(code);
  if (!partie || partie.phase !== 'deplacement') return;

  const joueur = joueurActif(partie);

  if (!joueur || joueur.pseudo !== pseudo) return;

  // Avancer d'une seule case
  joueur.position = (joueur.position + 1) % PLATEAU.length;

  // L'étoile interrompt le déplacement jusqu'au choix du joueur.
  if (joueur.position === partie.etoilePosition) {
    partie.phase = 'choix-etoile';
    partie.deplacementSuspendu = { pseudo, pasRestants };
    io.to(code).emit('positions', partie.joueurs);
    io.to(code).emit('demande-achat-etoile', {
      pseudo,
      pieces: joueur.pieces,
      prix: PRIX_ETOILE,
      pasRestants
    });
    return;
  }

  // L'effet s'applique uniquement sur la case d'arrivée, au dernier pas.
  if (pasRestants === 1) {
    const effet = appliquerEffetCase(partie, joueur);

    io.to(code).emit('effet-case', {
      pseudo: joueur.pseudo,
      ...effet
    });

    // Si une étoile est achetée, on la déplace immédiatement.
    if (effet.achatEtoile) {
      partie.etoilePosition = choisirPositionEtoile(partie);

      io.to(code).emit('plateau-mis-a-jour', {
        plateau: plateauAvecEtoile(partie)
      });
    }
  }

  // Actualiser les positions et les scores
  io.to(code).emit('positions', partie.joueurs);

  // Continuer tant qu'il reste des déplacements
  if (pasRestants > 1) {
    partie.timer = setTimeout(() => {
      deplacerPasAPas(code, pseudo, pasRestants - 1);
    }, 500);
  } else {
    // Fin du déplacement
    partie.timer = setTimeout(() => {
      joueurSuivant(code);
    }, DELAI_FIN_TOUR_JOUEUR);
  }
}

// Classement : plus d'étoiles d'abord, puis plus de pièces en cas d'égalité
function classement(partie) {
  return [...partie.joueurs].sort((a, b) => b.etoiles - a.etoiles || b.pieces - a.pieces);
}

// Les infos du tour en cours, envoyées à tout le monde (ou à un joueur qui se reconnecte).
// peutLancer = vrai tant que le joueur actif n'a pas encore lancé le dé.
function infosTour(partie) {
  return {
    tourActuel: partie.tourActuel,
    nbTours: partie.nbTours,
    joueurActif: joueurActif(partie).pseudo,
    peutLancer: partie.phase === 'attente-de',
  };
}

// Si le joueur dont c'est le tour est déconnecté, on ne bloque pas la partie :
// au bout de DELAI_TOUR_ABSENT son tour est sauté. S'il est (re)connecté, on annule ce minuteur.
function surveillerJoueurActif(code) {
  const partie = parties.get(code);
  if (!partie || partie.phase !== 'attente-de') return;

  clearTimeout(partie.timer);
  const joueur = joueurActif(partie);
  if (joueur && !joueur.connecte) {
    partie.timer = setTimeout(() => joueurSuivant(code), DELAI_TOUR_ABSENT);
  }
}

// Démarre le tour du joueur à partie.indexActif
function demarrerTourJoueur(code) {
  const partie = parties.get(code);
  if (!partie) return;

  partie.phase = 'attente-de';
  io.to(code).emit('tour', infosTour(partie));
  surveillerJoueurActif(code);
}

// Passe au joueur suivant (ou au tour suivant si tout le monde a joué)
function joueurSuivant(code) {
  const partie = parties.get(code);
  if (!partie) return;

  partie.indexActif++;
  if (partie.indexActif >= partie.joueurs.length) {
    finDeTour(code);
  } else {
    demarrerTourJoueur(code);
  }
}

// Tous les joueurs ont joué : c'est ici qu'on lancera le mini-jeu
function finDeTour(code) {
  const partie = parties.get(code);
  if (!partie) return;

  // Aucune image dans le dossier : on saute le mini-jeu plutôt que de bloquer la partie
  if (IMAGES_QUIZ1.length === 0) {
    console.warn(`Aucune image dans ${DOSSIER_QUIZ1} : mini-jeu ignoré`);
    tourSuivant(code);
    return;
  }

  partie.phase = 'minijeu';
  partie.miniJeu = demarrerQuiz({
    io,
    code,
    partie,
    image: piocherImage(partie),
    envoyerAuJoueur: (pseudo, evenement, donnees) => {
      const socketId = partie.sockets.get(pseudo);
      if (socketId) io.to(socketId).emit(evenement, donnees);
    },
    // Le quiz est fini : on libère le mini-jeu et on enchaîne sur le tour suivant
    onFin: () => {
      partie.miniJeu = null;
      tourSuivant(code);
    },
  });
}

function tourSuivant(code) {
  const partie = parties.get(code);
  if (!partie) return;

  partie.tourActuel++;
  partie.indexActif = 0;

  if (partie.tourActuel > partie.nbTours) {
    finDePartie(code);
  } else {
    demarrerTourJoueur(code);
  }
}

function finDePartie(code) {
  const partie = parties.get(code);
  if (!partie) return;

  partie.phase = 'fin';
  io.to(code).emit('fin-de-partie', { classement: classement(partie) });
}

// ─────────────────────────────────────────────
//  Retrait définitif d'un joueur
//
//  Appelée quand un joueur est resté déconnecté plus de DELAI_RECONNEXION
//  (ou quand l'hôte démarre la partie sans lui). C'est l'ancienne logique
//  de la déconnexion : on le sort de la liste et on garde les tours cohérents.
// ─────────────────────────────────────────────

function retirerJoueur(code, pseudo) {
  const partie = parties.get(code);
  if (!partie) return;

  clearTimeout(partie.abandons.get(pseudo));
  partie.abandons.delete(pseudo);
  partie.sockets.delete(pseudo);
  for (const [token, p] of partie.tokens) {
    if (p === pseudo) partie.tokens.delete(token);
  }

  const index = partie.joueurs.findIndex((j) => j.pseudo === pseudo);
  if (index === -1) return;

  partie.joueurs.splice(index, 1);
  io.to(code).emit('liste-joueurs', partie.joueurs);
  io.to(code).emit('positions', partie.joueurs);

  if (!partie.demarree || partie.phase === 'fin') return;

  // Plus aucun joueur : on termine la partie
  if (partie.joueurs.length === 0) {
    clearTimeout(partie.timer);
    if (partie.miniJeu) partie.miniJeu.arreter();
    finDePartie(code);
    return;
  }

  if (index < partie.indexActif) {
    // Un joueur déjà passé est parti : tout le monde est décalé d'un cran
    partie.indexActif--;
  } else if (index === partie.indexActif) {
    // Le joueur actif est parti : le suivant prend sa place dans le tableau,
    // donc on recule d'un cran avant de passer au suivant
    clearTimeout(partie.timer);
    partie.indexActif--;
    joueurSuivant(code);
  }

  // Si un mini-jeu est en cours, il ne doit plus attendre ce joueur
  if (partie.miniJeu) partie.miniJeu.retirerJoueur(pseudo);
}

io.on('connection', (socket) => {
  // L'écran principal crée une partie
  socket.on('creer-partie', async () => {
    const code = genererCode();
    parties.set(code, {
      joueurs: [],
      demarree: false,
      phase: 'salon',
      tourActuel: 0,
      nbTours: NB_TOURS_DEFAUT,
      indexActif: 0,
      etoilePosition: null,
      deplacementSuspendu: null,
      timer: null,
      miniJeu: null,          // le mini-jeu en cours (null s'il n'y en a pas)
      imagesRestantes: null,  // le "paquet" d'images du quiz
      sockets: new Map(),     // pseudo → id du socket, pour écrire à un seul joueur
      tokens: new Map(),      // token secret → pseudo (jamais envoyé aux autres écrans)
      abandons: new Map(),    // pseudo → minuteur avant retrait définitif
    });
    const partie = parties.get(code);
    partie.etoilePosition = choisirPositionEtoile(partie);
    
    socket.join(code);
    socket.data.codeHote = code;

    // URL absolue vers laquelle le joueur est redirigé
    const urlRejoindre = `http://${LOCAL_IP}:${PORT}/play/?code=${code}`;

    try {
      // Génère l'image PNG sous forme de chaîne base64 (data:image/png;base64,...)
      const qrDataUrl = await QRCode.toDataURL(urlRejoindre, { width: 220, margin: 2 });
      socket.emit('partie-creee', { code, qr: qrDataUrl, url: urlRejoindre });
    } catch (err) {
      console.error('Erreur génération QR code :', err);
      socket.emit('partie-creee', { code, qr: null, url: urlRejoindre });
    }
  });

  socket.on('rejoindre', ({ code, pseudo }) => {
    code = String(code).trim().toUpperCase();
    pseudo = String(pseudo).trim();

    const partie = parties.get(code);
    if (!partie) {
      socket.emit('erreur', 'Code introuvable');
      return;
    }
    if (partie.demarree) {
      socket.emit('erreur', 'La partie a déjà commencé');
      return;
    }
    if (pseudo === '') {
      socket.emit('erreur', 'Choisis un pseudo');
      return;
    }
    if (pseudo.length > 16) {
      socket.emit('erreur', 'Pseudo trop long (16 caractères max)');
      return;
    }
    if (partie.joueurs.some((j) => j.pseudo.toLowerCase() === pseudo.toLowerCase())) {
      socket.emit('erreur', 'Ce pseudo est déjà pris');
      return;
    }

    partie.joueurs.push({
      pseudo,
      numero: partie.joueurs.length + 1,
      position: 0,
      pieces: PIECES_DEPART,
      etoiles: 0,
      connecte: true
    });
    socket.join(code);
    socket.data.code = code;
    socket.data.pseudo = pseudo;
    partie.sockets.set(pseudo, socket.id);

    // Le token prouve que c'est bien ce joueur qui revient. Il n'est envoyé qu'à lui,
    // et n'est PAS stocké dans l'objet joueur (qui, lui, est diffusé à tous les écrans).
    const token = crypto.randomUUID();
    partie.tokens.set(token, pseudo);

    socket.emit('rejoint', { code, pseudo, token });
    io.to(code).emit('liste-joueurs', partie.joueurs);
  });

  // Un joueur dont le socket a été coupé (écran verrouillé, rechargement, réseau...) revient
  socket.on('reconnecter', ({ code, token } = {}) => {
    code = String(code ?? '').trim().toUpperCase();
    const partie = parties.get(code);
    const pseudo = partie && partie.tokens.get(String(token));
    const joueur = pseudo && partie.joueurs.find((j) => j.pseudo === pseudo);

    if (!joueur) {
      socket.emit('reconnexion-refusee');
      return;
    }

    // On enregistre le nouveau socket AVANT de fermer l'ancien : quand l'ancien enverra son
    // 'disconnect', le serveur verra que ce n'est plus le socket du joueur et l'ignorera.
    const ancienSocketId = partie.sockets.get(pseudo);
    partie.sockets.set(pseudo, socket.id);
    if (ancienSocketId && ancienSocketId !== socket.id) {
      io.sockets.sockets.get(ancienSocketId)?.disconnect(true);
    }

    clearTimeout(partie.abandons.get(pseudo));
    partie.abandons.delete(pseudo);
    joueur.connecte = true;

    socket.join(code);
    socket.data.code = code;
    socket.data.pseudo = pseudo;

    // Ce message arrive EN PREMIER : le téléphone y apprend son pseudo, dont il a besoin
    // pour interpréter les événements suivants (par exemple 'tour').
    socket.emit('reconnecte', { code, pseudo, demarree: partie.demarree, joueurs: partie.joueurs });

    // On remet ce téléphone dans l'état actuel de la partie
    if (partie.demarree) {
      if (partie.phase === 'fin') {
        socket.emit('fin-de-partie', { classement: classement(partie) });
      } else if (partie.phase === 'minijeu' && partie.miniJeu) {
        partie.miniJeu.renvoyerEtat(pseudo);
      } else {
        socket.emit('tour', infosTour(partie));
      }
    }

    io.to(code).emit('liste-joueurs', partie.joueurs);
    io.to(code).emit('positions', partie.joueurs);

    // Si c'était lui qu'on attendait, on arrête de compter le délai d'absence
    surveillerJoueurActif(code);
  });

  socket.on('demarrer', ({ nbTours } = {}) => {
    const code = socket.data.codeHote;
    const partie = parties.get(code);
    if (!partie || partie.demarree) return;

    // Les joueurs encore déconnectés dans le salon ne participent pas
    for (const joueur of [...partie.joueurs]) {
      if (!joueur.connecte) retirerJoueur(code, joueur.pseudo);
    }
    if (partie.joueurs.length === 0) return;

    const nbToursChoisi = Number(nbTours);
    partie.nbTours = Number.isInteger(nbToursChoisi) &&
      nbToursChoisi >= NB_TOURS_MIN && nbToursChoisi <= NB_TOURS_MAX
      ? nbToursChoisi
      : NB_TOURS_DEFAUT;

    partie.demarree = true;
    partie.tourActuel = 1;
    partie.indexActif = 0;

    io.to(code).emit('partie-demarree', {
  plateau: plateauAvecEtoile(partie),
  joueurs: partie.joueurs
  });

    // Le premier joueur peut lancer dès le démarrage.
    demarrerTourJoueur(code);
  });

  socket.on('lancer-de', () => {
    const code = socket.data.code;
    const partie = parties.get(code);
    if (!partie || !partie.demarree) return;

    // Seul le joueur actif peut lancer le dé, et une seule fois par tour
    if (partie.phase !== 'attente-de') return;
    const joueur = joueurActif(partie);
    if (!joueur || joueur.pseudo !== socket.data.pseudo) return;

    partie.phase = 'deplacement';

    const de = Math.floor(Math.random() * 6) + 1;
    socket.emit('resultat-de', de);

    // Le déplacement et les effets sont traités case par case.
    deplacerPasAPas(code, joueur.pseudo, de);
  });

  socket.on('choix-etoile', ({ acheter } = {}) => {
    const code = socket.data.code;
    const partie = parties.get(code);
    const suspendu = partie && partie.deplacementSuspendu;
    const joueur = partie && joueurActif(partie);

    if (!partie || partie.phase !== 'choix-etoile' || !suspendu ||
        !joueur || joueur.pseudo !== socket.data.pseudo || suspendu.pseudo !== socket.data.pseudo) return;

    const achatAccepte = acheter === true && joueur.pieces >= PRIX_ETOILE;
    if (achatAccepte) {
      joueur.pieces -= PRIX_ETOILE;
      joueur.etoiles++;
      partie.etoilePosition = choisirPositionEtoile(partie);

      io.to(code).emit('effet-case', {
        pseudo: joueur.pseudo,
        type: 'etoile',
        achatEtoile: true,
        message: `${joueur.pseudo} achète une étoile pour ${PRIX_ETOILE} pièces ! ⭐`
      });
      io.to(code).emit('plateau-mis-a-jour', {
        plateau: plateauAvecEtoile(partie)
      });
    } else {
      io.to(code).emit('effet-case', {
        pseudo: joueur.pseudo,
        type: 'etoile',
        achatEtoile: false,
        message: `${joueur.pseudo} renonce à l'étoile.`
      });
    }

    partie.deplacementSuspendu = null;
    partie.phase = 'deplacement';
    io.to(code).emit('positions', partie.joueurs);

    if (suspendu.pasRestants > 1) {
      partie.timer = setTimeout(() => {
        deplacerPasAPas(code, joueur.pseudo, suspendu.pasRestants - 1);
      }, 500);
    } else {
      partie.timer = setTimeout(() => {
        joueurSuivant(code);
      }, DELAI_FIN_TOUR_JOUEUR);
    }
  });

  // Messages du mini-jeu : server.js ne fait que les transmettre au quiz en cours
  socket.on('quiz-reponse', (texte) => {
    const partie = parties.get(socket.data.code);
    if (partie && partie.miniJeu) partie.miniJeu.repondre(socket.data.pseudo, texte);
  });

  socket.on('quiz-vote', (id) => {
    const partie = parties.get(socket.data.code);
    if (partie && partie.miniJeu) partie.miniJeu.voter(socket.data.pseudo, Number(id));
  });

  socket.on('disconnect', () => {
    if (socket.data.codeHote) {
      const partie = parties.get(socket.data.codeHote);
      if (partie) {
        clearTimeout(partie.timer);
        for (const minuteur of partie.abandons.values()) clearTimeout(minuteur);
        if (partie.miniJeu) partie.miniJeu.arreter();
      }
      parties.delete(socket.data.codeHote);
      return;
    }

    const code = socket.data.code;
    const partie = parties.get(code);
    if (!partie) return;

    const pseudo = socket.data.pseudo;

    // Ce socket a déjà été remplacé par une reconnexion du même joueur : rien à faire
    if (partie.sockets.get(pseudo) !== socket.id) return;

    const joueur = partie.joueurs.find((j) => j.pseudo === pseudo);
    if (!joueur) return;

    // Le joueur n'est PAS retiré : il est marqué déconnecté et garde sa place un moment
    joueur.connecte = false;
    partie.sockets.delete(pseudo);
    io.to(code).emit('liste-joueurs', partie.joueurs);
    io.to(code).emit('positions', partie.joueurs);

    // Une fois la partie terminée, on garde les joueurs pour qu'ils revoient le classement
    if (partie.phase !== 'fin') {
      partie.abandons.set(pseudo, setTimeout(() => retirerJoueur(code, pseudo), DELAI_RECONNEXION));
    }

    // Une fois la partie terminée, on garde les joueurs pour qu'ils revoient le classement
    if (partie.phase !== 'fin') {
      partie.abandons.set(
        pseudo,
        setTimeout(() => retirerJoueur(code, pseudo), DELAI_RECONNEXION)
      );
    }

    // Si c'était son tour, on ne bloque pas la partie trop longtemps
    if (
      partie.demarree &&
      partie.phase === 'attente-de' &&
      joueurActif(partie) === joueur
    ) {
      surveillerJoueurActif(code);
    }
  });
});


server.listen(PORT, () => {
  console.log(`Serveur prêt :`);
  console.log(`- Local : http://localhost:${PORT}`);
  console.log(`- Réseau Wi-Fi : http://${LOCAL_IP}:${PORT}`);
});

