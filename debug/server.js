// Le même serveur, les mêmes sockets et les mêmes pages que le jeu normal.
const express = require('express');
const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');
process.chdir(path.join(__dirname, '..'));
process.env.PORT = process.env.DEBUG_PORT || '3001';
const { app, server, io, parties, finDeTour, finDePartie, plateauAvecEtoile } = require('../server');
const sessions = new Map();
const router = express.Router();
const noms = ['Joueur 1', 'Joueur 2', 'Joueur 3'];
const images = fs.readdirSync('public/images/quiz1').filter((name) => /\.(jpe?g|png|webp|gif)$/i.test(name)).sort();

router.use((req, res, next) => {
  const origin = req.get('Origin');
  if (origin) {
    let hostname;
    try { hostname = new URL(origin).hostname; } catch { return res.sendStatus(403); }
    if (!['localhost', '127.0.0.1', '[::1]'].includes(hostname) && origin !== req.protocol + '://' + req.get('host')) return res.sendStatus(403);
    res.set('Access-Control-Allow-Origin', origin).set('Vary', 'Origin');
  }
  res.set('Access-Control-Allow-Headers', 'Content-Type');
  res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});
router.use(express.json({ limit: '4kb' }));

function settings(body = {}) {
  const config = { type: body.type || 'quiz', fast: body.fast === true, questions: Number(body.questions ?? 5), image: body.image || images[0] };
  if (!['quiz', 'culture'].includes(config.type) || !Number.isInteger(config.questions) || config.questions < 1 || config.questions > 5) throw new Error('Réglages invalides.');
  if (!images.includes(config.image)) throw new Error('Image introuvable.');
  return config;
}

function start(session, config) {
  const code = session.code;
  const partie = parties.get(code);
  if (!partie || !session.host || !io.sockets.sockets.has(session.host)) throw new Error('Écran principal déconnecté. Rechargez le debug.');
  if (partie.phase === 'minijeu') throw new Error('Un mini-jeu est déjà en cours.');
  if (partie.joueurs.length !== 3 || !noms.every((pseudo) => partie.joueurs.some((j) => j.pseudo === pseudo && j.connecte))) throw new Error('Ouvrez les 3 téléphones et attendez leur connexion.');
  session.settings = config;
  clearTimeout(partie.timer);
  partie.miniJeu?.arreter();
  Object.assign(partie, { demarree: true, tourActuel: 1, nbTours: 1, indexActif: 0 });
  for (const joueur of partie.joueurs) Object.assign(joueur, { position: 0, pieces: 5, etoiles: 0 });
  io.to(code).emit('partie-demarree', { plateau: plateauAvecEtoile(partie), joueurs: partie.joueurs });
  io.to(code).emit('tour', { tourActuel: 1, nbTours: 1, joueurActif: partie.joueurs[0].pseudo, peutLancer: false });
  const durees = config.fast ? {
    quiz: { ecriture: 20, vote: 15, resultats: 3 },
    culture: { lecture: 1, question: 12, correction: 2, classement: 3 },
  }[config.type] : undefined;
  try { finDeTour(code, {
    type: config.type, image: config.image, nbQuestions: config.questions, durees,
    onFin: () => {
      if (parties.get(code) !== partie) return;
      partie.miniJeu = null; partie.typeMiniJeu = null; partie.demarree = false; finDePartie(code);
    },
  }); } catch (error) {
    partie.miniJeu?.arreter(); partie.miniJeu = null; partie.typeMiniJeu = null; partie.demarree = false;
    finDePartie(code);
    throw error;
  }
}

router.post('/api/session', (req, res) => {
  const id = randomUUID();
  sessions.set(id, { code: null, host: null, settings: settings() });
  res.json({ id, images });
});
router.use('/api/:id', (req, res, next) => {
  req.debugSession = sessions.get(req.params.id);
  if (!req.debugSession) return res.status(404).json({ error: 'Session expirée. Rechargez le debug.' });
  next();
});
router.get('/api/:id', (req, res) => {
  const session = req.debugSession;
  const partie = parties.get(session.code);
  res.json({ code: partie ? session.code : null, phase: partie?.phase || 'salon', players: noms.map((pseudo) => ({ pseudo, connected: partie?.joueurs.some((j) => j.pseudo === pseudo && j.connecte) || false })) });
});
router.post('/api/:id/settings', (req, res) => { req.debugSession.settings = settings(req.body); res.json({ ok: true }); });
router.post('/api/:id/start', (req, res) => { start(req.debugSession, settings(req.body)); res.json({ ok: true }); });
router.post('/api/:id/stop', (req, res) => {
  const session = req.debugSession;
  const partie = parties.get(session.code);
  if (partie?.phase === 'minijeu') {
    partie.miniJeu?.arreter(); partie.miniJeu = null; partie.typeMiniJeu = null; partie.demarree = false;
    clearTimeout(partie.timer); finDePartie(session.code);
  }
  res.json({ ok: true });
});

function page(role) {
  return (req, res) => {
    const session = sessions.get(req.query.id);
    const player = Number(req.query.player);
    if (!session || (role === 'player' && (!session.code || !Number.isInteger(player) || player < 1 || player > 3))) return res.status(400).send('Session indisponible. Ouvrez cette fenêtre depuis le debug.');
    let html = fs.readFileSync(path.join('public', role === 'host' ? 'host' : 'play', 'index.html'), 'utf8');
    const config = { id: req.query.id, role, player, code: session.code, key: 'mayo-debug-' + req.query.id + '-' + session.code + '-' + player };
    if (role === 'player') {
      const marker = "const CLE_SESSION = 'mayo-party-session';";
      if (!html.includes(marker)) throw new Error('Clé de session mobile introuvable.');
      html = html.replace(marker, 'const CLE_SESSION = ' + JSON.stringify(config.key) + ';');
    }
    const socketScript = '<script src="/socket.io/socket.io.js"></script>';
    if (!html.includes(socketScript)) throw new Error('Script Socket.IO introuvable.');
    res.set('Cache-Control', 'no-store').type('html').send(html.replace(socketScript, socketScript + '<script src="/debug/client.js" data-config="' + encodeURIComponent(JSON.stringify(config)) + '"></script>'));
  };
}
router.get('/host', page('host'));
router.get('/player', page('player'));
router.use(express.static(__dirname));
router.use((error, req, res, next) => res.status(400).json({ error: error.message || 'Erreur du debug.' }));
app.use('/public', express.static(path.join(__dirname, '..', 'public')));
app.use('/debug', router);

io.on('connection', (socket) => {
  const session = sessions.get(socket.handshake.auth.debugId);
  if (!session || socket.handshake.auth.debugRole !== 'host') return;
  socket.on('creer-partie', () => { session.host = socket.id; session.code = socket.data.codeHote; });
  socket.on('debug-demarrer', () => {
    try {
      if (session.host !== socket.id) return;
      start(session, session.settings);
    } catch (error) { socket.emit('erreur-demarrage', error.message); }
  });
  socket.on('disconnect', () => { if (session.host === socket.id) session.host = null; });
});
server.on('error', (error) => { console.error('Debug : ' + error.message); process.exitCode = 1; });
server.listen(Number(process.env.PORT), () => console.log('Debug : http://localhost:' + process.env.PORT + '/debug/'));
