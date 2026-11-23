const $ = (id) => document.getElementById(id);
const cards = new Map();
const botTimers = new Set();
let engine = null;
let clock = null;
let useBots = false;
let question = null;

function node(tag, text, className) {
  const result = document.createElement(tag);
  if (text !== undefined) result.textContent = text;
  if (className) result.className = className;
  return result;
}

function table(headers, rows) {
  const result = node('table');
  const head = node('thead');
  const header = node('tr');
  for (const label of headers) {
    const cell = node('th', label);
    cell.scope = 'col';
    header.append(cell);
  }
  head.append(header);
  result.append(head);
  const body = node('tbody');
  for (const row of rows) {
    const line = node('tr');
    for (const value of row) line.append(node('td', String(value)));
    body.append(line);
  }
  result.append(body);
  return result;
}

function clearBotTimers() {
  for (const timer of botTimers) clearTimeout(timer);
  botTimers.clear();
}

function countdown(seconds) {
  clearInterval(clock);
  $('countdown').textContent = '';
  if (!seconds) return;
  const end = Date.now() + seconds * 1000;
  const update = () => {
    const remaining = Math.max(0, Math.ceil((end - Date.now()) / 1000));
    $('countdown').textContent = remaining + ' s';
    if (!remaining) clearInterval(clock);
  };
  update();
  clock = setInterval(update, 250);
}

function stopEngine() {
  engine?.terminate();
  engine = null;
  clearBotTimers();
  countdown(null);
  $('stop').disabled = true;
  for (const card of cards.values()) {
    for (const control of card.body.querySelectorAll('input, button')) control.disabled = true;
  }
}

function showError(message) {
  stopEngine();
  $('stop').disabled = false;
  $('error').textContent = message;
  $('error').hidden = false;
  $('status').textContent = 'Erreur';
}

function updateScores(players) {
  for (const player of players) {
    const card = cards.get(player.pseudo);
    if (card) card.meta.textContent = player.pieces + ' pièces · ' + (card.bot ? 'Automatique' : 'À vous');
  }
}

function send(pseudo, name, value) {
  engine?.postMessage({ kind: 'action', pseudo, name, value });
}

function scheduleBot(card, name, value) {
  if (!card.bot) return;
  const timer = setTimeout(() => {
    botTimers.delete(timer);
    send(card.pseudo, name, value);
  }, 500 + Math.random() * 700);
  botTimers.add(timer);
}

function createCards(count) {
  cards.clear();
  $('player-cards').replaceChildren();
  for (let i = 0; i < count; i++) {
    const pseudo = 'Joueur ' + (i + 1);
    const card = node('div', undefined, 'debug-player');
    card.dataset.player = pseudo;
    const heading = node('div', undefined, 'player-heading');
    const identity = node('div');
    const meta = node('span', '', 'player-meta');
    identity.append(node('h3', pseudo), meta);
    heading.append(identity);
    const body = node('div', undefined, 'player-body');
    body.append(node('p', 'Préparation du mini-jeu…'));
    card.append(heading, body);
    $('player-cards').append(card);
    cards.set(pseudo, { pseudo, body, meta, ownId: null, bot: useBots && i > 0 });
  }
}

function setStage(label, title, message, seconds) {
  clearBotTimers();
  countdown(seconds);
  $('phase').textContent = label;
  $('host-title').textContent = title;
  $('host-message').textContent = message;
  $('host-content').replaceChildren();
  $('progress').textContent = '';
}

function renderHost(name, data) {
  switch (name) {
    case 'quiz-ecriture': {
      setStage('Écriture', 'Trouve un titre drôle !', "Regardez l'image, puis proposez un titre.", data.duree);
      const image = node('img', undefined, 'quiz-image');
      image.src = new URL('../public' + data.image, import.meta.url).href;
      image.alt = 'Image à légender';
      image.addEventListener('error', () => {
        if (image.isConnected) showError("Image introuvable. Vérifiez public/images/quiz1/ et ouvrez Live Server à la racine du projet.");
      });
      $('host-content').append(image);
      break;
    }
    case 'quiz-vote':
      setStage('Vote', 'Vote pour le plus drôle !', 'Vous ne pouvez pas voter pour votre propre titre.', data.duree);
      $('host-content').append(table(['Proposition', 'Titre'], data.propositions.map((p) => [p.id + 1, p.texte])));
      break;
    case 'quiz-resultats':
      setStage('Résultats', data.gagnants.length ? 'Les titres gagnants !' : 'Pas de gagnant cette fois.', data.assezDeReponses ? 'Chaque gagnant reçoit ' + data.pieces + ' pièces.' : 'Il faut au moins deux titres pour organiser un vote.');
      $('host-content').append(table(['Joueur', 'Titre', 'Votes'], data.resultats.map((p) => [p.auteur, p.texte, p.votes])));
      break;
    case 'culture-lecture':
      setStage('Question ' + data.numero + '/' + data.total + ' · ' + data.categorie, data.question, "Lisez la question. Les réponses arrivent…", data.duree);
      break;
    case 'culture-question': {
      question = data;
      setStage('Question ' + data.numero + '/' + data.total + ' · ' + data.categorie, data.question, 'Choisissez une réponse sur votre manette.', data.duree);
      const answers = node('div', undefined, 'culture-grille');
      for (const answer of data.reponses) answers.append(node('div', answer.texte, 'culture-bouton culture-' + answer.couleur));
      $('host-content').append(answers);
      break;
    }
    case 'culture-correction':
      setStage('Correction', 'Bonne réponse : ' + data.texteBonne, 'Les points dépendent de la justesse et de la rapidité de la réponse.');
      $('host-content').append(table(['Joueur', 'Réponse', 'Points'], data.detail.map((row) => [row.pseudo, row.choix === null ? 'Sans réponse' : question.reponses[row.choix].texte, '+' + row.points])));
      break;
    case 'culture-classement':
      setStage('Résultats', 'Le classement final.', 'Le podium reçoit des pièces. Les ex æquo partagent le même rang.');
      $('host-content').append(table(['Rang', 'Joueur', 'Score', 'Pièces'], data.classement.map((row) => [row.rang, row.pseudo, row.score, '+' + row.pieces])));
      break;
    case 'quiz-progression':
    case 'culture-progression':
      $('progress').textContent = data.fait + '/' + data.total + (data.etape === 'vote' ? ' votes reçus' : ' réponses reçues');
      break;
  }
}

function renderPlayer(card, name, data) {
  const body = card.body;
  const disable = () => {
    for (const control of body.querySelectorAll('input, button')) control.disabled = true;
  };
  switch (name) {
    case 'quiz-ecriture': {
      card.ownId = null;
      const form = node('form');
      const label = node('label', 'Votre titre');
      const input = node('input');
      input.type = 'text';
      input.maxLength = 100;
      input.required = true;
      input.autocomplete = 'off';
      input.placeholder = 'Un titre pour cette image…';
      label.append(input);
      const button = node('button', 'Envoyer le titre', 'primary');
      button.type = 'submit';
      form.append(label, button);
      form.addEventListener('submit', (event) => {
        event.preventDefault();
        if (!input.value.trim()) return;
        send(card.pseudo, 'quiz-reponse', input.value);
        disable();
      });
      body.replaceChildren(form);
      if (card.bot) {
        disable();
        scheduleBot(card, 'quiz-reponse', ['Quand le lundi arrive trop vite', 'Moi après une victoire', 'Une journée parfaitement normale', 'Le dernier biscuit', 'La réunion aurait pu être un mail'][Number(card.pseudo.slice(-1)) - 2]);
      }
      break;
    }
    case 'quiz-reponse-ok':
      disable();
      body.append(node('p', 'Titre envoyé. En attente des autres…'));
      break;
    case 'quiz-mon-id':
      card.ownId = data.id;
      break;
    case 'quiz-vote': {
      body.replaceChildren(node('p', 'Quel est votre titre préféré ?'));
      const choices = data.propositions.filter((p) => p.id !== card.ownId);
      for (const choice of choices) {
        const button = node('button', choice.texte, 'secondary');
        button.dataset.action = 'quiz-vote';
        button.addEventListener('click', () => { send(card.pseudo, 'quiz-vote', choice.id); disable(); });
        body.append(button);
      }
      if (!choices.length) body.append(node('p', "Aucun autre titre à choisir."));
      if (card.bot) {
        disable();
        if (choices.length) scheduleBot(card, 'quiz-vote', choices[Math.floor(Math.random() * choices.length)].id);
      }
      break;
    }
    case 'quiz-vote-ok':
      disable();
      body.append(node('p', 'Vote enregistré.'));
      break;
    case 'quiz-resultats':
      body.replaceChildren(node('p', data.gagnants.includes(card.pseudo) ? 'Votre titre gagne ! +' + data.pieces + ' pièces.' : "Regardez les résultats sur l'écran principal."));
      break;
    case 'culture-lecture':
      body.replaceChildren(node('p', "Lisez la question sur l'écran principal."));
      break;
    case 'culture-question':
      body.replaceChildren(node('p', 'Votre réponse :'));
      for (const answer of data.reponses) {
        const button = node('button', answer.texte, 'culture-bouton culture-' + answer.couleur);
        button.dataset.action = 'culture-reponse';
        button.addEventListener('click', () => { send(card.pseudo, 'culture-reponse', answer.id); disable(); button.classList.add('selected'); });
        body.append(button);
      }
      if (card.bot) {
        disable();
        scheduleBot(card, 'culture-reponse', data.reponses[Math.floor(Math.random() * data.reponses.length)].id);
      }
      break;
    case 'culture-reponse-ok':
      disable();
      body.append(node('p', 'Réponse enregistrée.'));
      break;
    case 'culture-mon-resultat':
      body.replaceChildren(node('p', data.correct ? 'Correct ! +' + data.points + ' points' : data.repondu ? 'Raté… +0 point' : 'Trop tard ! +0 point'), node('p', 'Total : ' + data.score + ' points · Rang ' + data.rang));
      break;
    case 'culture-classement': {
      const result = data.classement.find((row) => row.pseudo === card.pseudo);
      if (result) body.replaceChildren(node('p', 'Rang ' + result.rang + ' · ' + result.score + ' points'), node('p', '+' + result.pieces + ' pièces'));
      break;
    }
  }
}

function startGame(type) {
  stopEngine();
  $('error').hidden = true;
  $('menu').hidden = true;
  $('game').hidden = false;
  question = null;
  useBots = $('bots').checked;
  const settings = new FormData($('settings'));
  const config = { type, players: Number(settings.get('players')), image: settings.get('image'), questions: Number(settings.get('questions')), fast: $('fast').checked };
  createCards(config.players);
  setStage('Chargement', 'Préparation du mini-jeu…', '');
  $('status').textContent = 'En cours';
  $('stop').disabled = false;
  try {
    const session = new Worker(new URL('./engine.worker.js', import.meta.url));
    engine = session;
    session.addEventListener('error', () => {
      if (engine === session) showError('Impossible de lancer le mini-jeu. Vérifiez la console et ouvrez Live Server à la racine du projet.');
    });
    session.addEventListener('message', ({ data }) => {
      if (engine !== session) return;
      if (data.kind === 'error') return showError(data.message);
      if (data.kind === 'finished') {
        updateScores(data.players);
        stopEngine();
        $('stop').disabled = false;
        $('status').textContent = 'Terminé';
        $('phase').textContent = 'Session terminée';
        return;
      }
      if (data.kind !== 'event') return;
      if (data.name === 'positions') return updateScores(data.data);
      if (data.target === 'tous') {
        renderHost(data.name, data.data);
        for (const card of cards.values()) renderPlayer(card, data.name, data.data);
      } else {
        const card = cards.get(data.target);
        if (card) renderPlayer(card, data.name, data.data);
      }
    });
    session.postMessage({ kind: 'start', config });
  } catch (error) {
    showError(error.message);
  }
}

for (const button of document.querySelectorAll('[data-game]')) {
  button.addEventListener('click', () => startGame(button.dataset.game));
}
$('settings').addEventListener('submit', (event) => event.preventDefault());

$('stop').addEventListener('click', () => {
  stopEngine();
  $('game').hidden = true;
  $('menu').hidden = false;
  $('error').hidden = true;
});
window.addEventListener('pagehide', stopEngine);

if (!['http:', 'https:'].includes(location.protocol)) {
  showError('Ouvrez debug/index.html avec Live Server depuis la racine du projet. Le double-clic sur le fichier HTML ne suffit pas.');
} else if (!('Worker' in window)) {
  showError('Ce navigateur ne prend pas en charge les Web Workers.');
} else {
  $('status').textContent = 'Prêt';
  for (const button of document.querySelectorAll('[data-game]')) button.disabled = false;
}
