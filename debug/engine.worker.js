// Adaptateur navigateur : un Worker neuf et un seul module CommonJS par session.
// Les règles restent dans minijeux/. Seul le transport Socket.IO est simulé ici.
let debugGame = null;
let debugType = null;
let debugStarted = false;

function debugEvent(target, name, data) {
  self.postMessage({ kind: 'event', target, name, data });
}

async function debugStart(config) {
  if (debugStarted) throw new Error('Créez un nouveau Worker pour relancer une session.');
  debugStarted = true;
  if (!['quiz', 'culture'].includes(config.type)) throw new Error('Mini-jeu inconnu.');
  if (!Number.isInteger(config.players) || config.players < 2 || config.players > 6) {
    throw new Error('Choisissez entre 2 et 6 joueurs.');
  }
  if (!Number.isInteger(config.questions) || config.questions < 1 || config.questions > 5) {
    throw new Error('Choisissez entre 1 et 5 questions.');
  }
  if (!/^[a-z0-9_-]+\.(jpe?g|png|webp|gif)$/i.test(config.image)) {
    throw new Error("Nom d'image invalide.");
  }

  let debugQuestions;
  if (config.type === 'culture') {
    const response = await fetch(new URL('../minijeux/questions/culture.json', self.location.href));
    if (!response.ok) throw new Error('Impossible de charger la banque de questions. Ouvrez Live Server à la racine du projet.');
    debugQuestions = await response.json();
  }

  // Les modules existants n'utilisent que module.exports et ce require JSON.
  // importScripts exécute leur source originale, sans copie ni transformation.
  self.module = { exports: {} };
  self.require = (specifier) => {
    if (specifier === './questions/culture.json' && debugQuestions) return debugQuestions;
    throw new Error('Dépendance non prise en charge dans le debug : ' + specifier);
  };
  self.setImmediate = (callback) => setTimeout(callback, 0);
  const filename = config.type === 'quiz' ? 'quiz.js' : 'culture-g.js';
  importScripts(new URL('../minijeux/' + filename, self.location.href).href);

  const partie = {
    joueurs: Array.from({ length: config.players }, (_, index) => ({
      pseudo: 'Joueur ' + (index + 1), position: 0, pieces: 5, etoiles: 0, connecte: true,
    })),
  };
  const options = {
    code: 'DEBUG',
    partie,
    io: { to: () => ({ emit: (name, data) => debugEvent('tous', name, data) }) },
    envoyerAuJoueur: (pseudo, name, data) => debugEvent(pseudo, name, data),
    onFin: () => self.postMessage({ kind: 'finished', players: partie.joueurs }),
  };
  debugType = config.type;
  debugEvent('tous', 'positions', partie.joueurs);
  if (config.type === 'quiz') {
    if (config.fast) options.durees = { ecriture: 20, vote: 15, resultats: 3 };
    debugGame = self.module.exports.demarrerQuiz({ ...options, image: config.image });
  } else {
    if (config.fast) options.durees = { lecture: 1, question: 12, correction: 2, classement: 3 };
    debugGame = self.module.exports.demarrerCulture({ ...options, nbQuestions: config.questions });
  }
}

self.onmessage = async ({ data }) => {
  try {
    if (data.kind === 'start') {
      await debugStart(data.config);
    } else if (data.kind === 'action' && debugGame) {
      if (data.name === 'quiz-reponse' && debugType === 'quiz') debugGame.repondre(data.pseudo, data.value);
      if (data.name === 'quiz-vote' && debugType === 'quiz') debugGame.voter(data.pseudo, data.value);
      if (data.name === 'culture-reponse' && debugType === 'culture') debugGame.repondre(data.pseudo, data.value);
    }
  } catch (error) {
    debugGame?.arreter();
    self.postMessage({ kind: 'error', message: error.message });
  }
};
