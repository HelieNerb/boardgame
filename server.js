const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

// code de la partie -> liste des pseudos
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
  socket.on('creer-partie', () => {
    const code = genererCode();
    parties.set(code, []);
    socket.join(code);
    socket.data.codeHote = code;
    socket.emit('partie-creee', code);
  });

  // Un joueur essaie de rejoindre
  socket.on('rejoindre', ({ code, pseudo }) => {
    code = String(code).trim().toUpperCase();
    pseudo = String(pseudo).trim();

    const joueurs = parties.get(code);
    if (!joueurs) {
      socket.emit('erreur', 'Code introuvable');
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
    if (joueurs.some((p) => p.toLowerCase() === pseudo.toLowerCase())) {
      socket.emit('erreur', 'Ce pseudo est déjà pris');
      return;
    }

    joueurs.push(pseudo);
    socket.join(code);
    socket.data.code = code;      // on retient où est ce joueur
    socket.data.pseudo = pseudo;

    socket.emit('rejoint', { code, pseudo });
    io.to(code).emit('liste-joueurs', joueurs);
  });

  socket.on('disconnect', () => {
    // Si l'hôte part, la partie n'existe plus
    if (socket.data.codeHote) {
      parties.delete(socket.data.codeHote);
      return;
    }
    // Si un joueur part, on le retire de la liste
    const joueurs = parties.get(socket.data.code);
    if (joueurs) {
      const index = joueurs.indexOf(socket.data.pseudo);
      if (index !== -1) joueurs.splice(index, 1);
      io.to(socket.data.code).emit('liste-joueurs', joueurs);
    }
  });
});

server.listen(3000, () => console.log('Serveur sur http://localhost:3000'));