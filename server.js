const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const os = require('os');
const QRCode = require('qrcode'); // Librairie ajoutée

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
  'depart', 'bleue', 'bleue', 'rouge', 'bleue', 'etoile',
  'bleue', 'rouge', 'rouge', 'bleue', 'bleue', 'etoile',
];

// Valeurs par défaut (plus tard : modifiables dans l'écran de paramètres)
const NB_TOURS_DEFAUT = 5;
const DELAI_FIN_TOUR_JOUEUR = 2500; // ms, le temps de voir le pion avancer et l'effet de la case

// Règles de l'économie du jeu
const PIECES_DEPART = 5;
const GAIN_CASE_BLEUE = 3;
const PERTE_CASE_ROUGE = 3;
const PRIX_ETOILE = 10;

const parties = new Map();

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

function appliquerEffetCase(joueur) {
  const type = PLATEAU[joueur.position];

  switch (type) {
    case 'bleue':
      joueur.pieces += GAIN_CASE_BLEUE;
      return { type, message: `${joueur.pseudo} gagne ${GAIN_CASE_BLEUE} pièces !` };

    case 'rouge': {
      // On ne descend jamais sous 0 pièce
      const perte = Math.min(PERTE_CASE_ROUGE, joueur.pieces);
      joueur.pieces -= perte;
      return { type, message: `${joueur.pseudo} perd ${perte} pièces...` };
    }

    case 'etoile':
      if (joueur.pieces >= PRIX_ETOILE) {
        joueur.pieces -= PRIX_ETOILE;
        joueur.etoiles++;
        return { type, message: `${joueur.pseudo} achète une étoile pour ${PRIX_ETOILE} pièces ! ⭐` };
      }
      return {
        type,
        message: `${joueur.pseudo} n'a pas assez de pièces pour l'étoile (${PRIX_ETOILE} nécessaires)`,
      };

    default:
      // 'depart' : aucun effet
      return { type, message: `${joueur.pseudo} est sur la case départ` };
  }
}

// Classement : plus d'étoiles d'abord, puis plus de pièces en cas d'égalité
function classement(partie) {
  return [...partie.joueurs].sort((a, b) => b.etoiles - a.etoiles || b.pieces - a.pieces);
}

// Démarre le tour du joueur à partie.indexActif
function demarrerTourJoueur(code) {
  const partie = parties.get(code);
  if (!partie) return;

  partie.phase = 'attente-de';
  io.to(code).emit('tour', {
    tourActuel: partie.tourActuel,
    nbTours: partie.nbTours,
    joueurActif: joueurActif(partie).pseudo,
  });
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

  // TODO : lancer un mini-jeu ici, puis appeler tourSuivant(code) quand il est fini
  tourSuivant(code);
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
      timer: null,
    });
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

    partie.joueurs.push({ pseudo, position: 0, pieces: PIECES_DEPART, etoiles: 0 });
    socket.join(code);
    socket.data.code = code;
    socket.data.pseudo = pseudo;

    socket.emit('rejoint', { code, pseudo });
    io.to(code).emit('liste-joueurs', partie.joueurs);
  });

  socket.on('demarrer', () => {
    const code = socket.data.codeHote;
    const partie = parties.get(code);
    if (!partie || partie.demarree || partie.joueurs.length === 0) return;

    partie.demarree = true;
    partie.tourActuel = 1;
    partie.indexActif = 0;

    io.to(code).emit('partie-demarree', { plateau: PLATEAU, joueurs: partie.joueurs });
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
    joueur.position = (joueur.position + de) % PLATEAU.length;

    socket.emit('resultat-de', de);

    // On applique l'effet de la case, puis on prévient tout le monde
    const effet = appliquerEffetCase(joueur);
    io.to(code).emit('effet-case', { pseudo: joueur.pseudo, ...effet });
    io.to(code).emit('positions', partie.joueurs);

    partie.timer = setTimeout(() => joueurSuivant(code), DELAI_FIN_TOUR_JOUEUR);
  });

  socket.on('disconnect', () => {
    if (socket.data.codeHote) {
      const partie = parties.get(socket.data.codeHote);
      if (partie) clearTimeout(partie.timer);
      parties.delete(socket.data.codeHote);
      return;
    }

    const code = socket.data.code;
    const partie = parties.get(code);
    if (!partie) return;

    const index = partie.joueurs.findIndex((j) => j.pseudo === socket.data.pseudo);
    if (index === -1) return;

    partie.joueurs.splice(index, 1);
    io.to(code).emit('liste-joueurs', partie.joueurs);
    io.to(code).emit('positions', partie.joueurs);

    if (!partie.demarree || partie.phase === 'fin') return;

    // Plus aucun joueur : on termine la partie
    if (partie.joueurs.length === 0) {
      clearTimeout(partie.timer);
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
  });
});

server.listen(PORT, () => {
  console.log(`Serveur prêt :`);
  console.log(`- Local : http://localhost:${PORT}`);
  console.log(`- Réseau Wi-Fi : http://${LOCAL_IP}:${PORT}`);
});