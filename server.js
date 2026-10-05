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

io.on('connection', (socket) => {
  // L'écran principal crée une partie
  socket.on('creer-partie', async () => {
    const code = genererCode();
    parties.set(code, { joueurs: [], demarree: false });
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

    partie.joueurs.push({ pseudo, position: 0 });
    socket.join(code);
    socket.data.code = code;
    socket.data.pseudo = pseudo;

    socket.emit('rejoint', { code, pseudo });
    io.to(code).emit('liste-joueurs', partie.joueurs);
  });

  socket.on('demarrer', () => {
    const code = socket.data.codeHote;
    const partie = parties.get(code);
    if (!partie || partie.joueurs.length === 0) return;

    partie.demarree = true;
    io.to(code).emit('partie-demarree', { plateau: PLATEAU, joueurs: partie.joueurs });
  });

  socket.on('lancer-de', () => {
    const partie = parties.get(socket.data.code);
    if (!partie || !partie.demarree) return;

    const joueur = partie.joueurs.find((j) => j.pseudo === socket.data.pseudo);
    if (!joueur) return;

    const de = Math.floor(Math.random() * 6) + 1;
    joueur.position = (joueur.position + de) % PLATEAU.length;

    socket.emit('resultat-de', de);
    io.to(socket.data.code).emit('positions', partie.joueurs);
  });

  socket.on('disconnect', () => {
    if (socket.data.codeHote) {
      parties.delete(socket.data.codeHote);
      return;
    }
    const partie = parties.get(socket.data.code);
    if (partie) {
      partie.joueurs = partie.joueurs.filter((j) => j.pseudo !== socket.data.pseudo);
      io.to(socket.data.code).emit('liste-joueurs', partie.joueurs);
      io.to(socket.data.code).emit('positions', partie.joueurs);
    }
  });
});

server.listen(PORT, () => {
  console.log(`Serveur prêt :`);
  console.log(`- Local : http://localhost:${PORT}`);
  console.log(`- Réseau Wi-Fi : http://${LOCAL_IP}:${PORT}`);
});