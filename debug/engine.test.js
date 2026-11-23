const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Exécute le même adaptateur et les mêmes modules que la page, sans navigateur.
function creerBanc({ fetchOk = true, questions } = {}) {
  const messages = [];
  const timers = new Map();
  let time = 0;
  let nextTimer = 0;
  const origin = 'http://localhost:5500';
  const root = path.resolve(__dirname, '..');
  function lire(url) {
    return fs.readFileSync(path.join(root, new URL(url).pathname), 'utf8');
  }
  const contexte = vm.createContext({
    URL,
    Date: { now: () => time },
    location: { href: origin + '/debug/engine.worker.js' },
    postMessage: (message) => messages.push(structuredClone(message)),
    setTimeout: (callback, ms) => { timers.set(++nextTimer, { callback, at: time + ms }); return nextTimer; },
    clearTimeout: (id) => timers.delete(id),
    fetch: async (url) => ({ ok: fetchOk, json: async () => questions ?? JSON.parse(lire(url)) }),
  });
  contexte.self = contexte;
  contexte.importScripts = (url) => vm.runInContext(lire(url), contexte, { filename: new URL(url).pathname });
  vm.runInContext(fs.readFileSync(path.join(__dirname, 'engine.worker.js'), 'utf8'), contexte);
  return {
    messages,
    dernier: (name, target) => messages.filter((m) => m.name === name && (!target || m.target === target)).at(-1)?.data,
    start: (type, options = {}) => contexte.onmessage({ data: { kind: 'start', config: { type, players: 3, questions: 1, image: 'cheval.jpg', fast: true, ...options } } }),
    action: (pseudo, name, value) => contexte.onmessage({ data: { kind: 'action', pseudo, name, value } }),
    avancer(ms) {
      const end = time + ms;
      while (true) {
        const next = [...timers.entries()].filter(([, timer]) => timer.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
        if (!next) break;
        timers.delete(next[0]);
        time = next[1].at;
        next[1].callback();
      }
      time = end;
    },
  };
}

test('debug : le vrai quiz conserve les votes privés, récompense et termine la session', async () => {
  const banc = creerBanc();
  await banc.start('quiz');
  assert.equal(banc.dernier('quiz-ecriture').image, '/images/quiz1/cheval.jpg');
  for (let i = 1; i <= 3; i++) await banc.action('Joueur ' + i, 'quiz-reponse', 'Titre ' + i);
  const propositions = banc.dernier('quiz-vote').propositions;
  assert.ok(propositions.every((p) => !Object.hasOwn(p, 'auteur')));
  const ownIds = [1, 2, 3].map((i) => banc.dernier('quiz-mon-id', 'Joueur ' + i).id);
  await banc.action('Joueur 1', 'quiz-vote', ownIds[0]);
  assert.equal(banc.dernier('quiz-vote-ok', 'Joueur 1'), undefined);
  for (let i = 0; i < 3; i++) await banc.action('Joueur ' + (i + 1), 'quiz-vote', ownIds[(i + 1) % 3]);
  assert.equal(banc.dernier('quiz-resultats').gagnants.length, 3);
  assert.ok(banc.dernier('positions').every((p) => p.pieces === 10));
  banc.avancer(3000);
  assert.equal(banc.messages.at(-1).kind, 'finished');
});

test('debug : la vraie culture charge sa banque JSON, calcule les scores et les pièces', async () => {
  const banc = creerBanc();
  await banc.start('culture');
  assert.equal(banc.dernier('culture-lecture').total, 1);
  banc.avancer(1000);
  const question = banc.dernier('culture-question');
  const banque = JSON.parse(fs.readFileSync(path.join(__dirname, '../minijeux/questions/culture.json'), 'utf8'));
  const original = banque.find((q) => q.question === question.question);
  const bonne = question.reponses.find((r) => r.texte === original.bonne).id;
  await banc.action('Joueur 1', 'culture-reponse', bonne);
  await banc.action('Joueur 2', 'culture-reponse', (bonne + 1) % 4);
  await banc.action('Joueur 3', 'culture-reponse', (bonne + 2) % 4);
  assert.equal(banc.dernier('culture-mon-resultat', 'Joueur 1').points, 1000);
  assert.equal(banc.dernier('culture-mon-resultat', 'Joueur 2').points, 0);
  banc.avancer(2000);
  assert.equal(banc.dernier('culture-classement').classement[0].pieces, 5);
  assert.equal(banc.dernier('positions')[0].pieces, 10);
  banc.avancer(3000);
  assert.equal(banc.messages.at(-1).kind, 'finished');
});

test('debug : sans réponse, les délais font avancer et terminer les deux mini-jeux', async () => {
  const quiz = creerBanc();
  await quiz.start('quiz');
  quiz.avancer(23000);
  assert.equal(quiz.dernier('quiz-resultats').assezDeReponses, false);
  assert.equal(quiz.messages.at(-1).kind, 'finished');
  const culture = creerBanc();
  await culture.start('culture');
  culture.avancer(18000);
  assert.equal(culture.messages.at(-1).kind, 'finished');
  assert.ok(culture.dernier('positions').every((p) => p.pieces === 5));
});

test('debug : sans mode rapide, les durées du module original sont conservées', async () => {
  const quiz = creerBanc();
  await quiz.start('quiz', { fast: false });
  assert.equal(quiz.dernier('quiz-ecriture').duree, 60);
  const culture = creerBanc();
  await culture.start('culture', { fast: false });
  assert.equal(culture.dernier('culture-lecture').duree, 3);
});

test('debug : une configuration invalide remonte une erreur exploitable', async () => {
  for (const options of [{ players: 1 }, { questions: 0 }, { image: '../secret.jpg' }]) {
    const banc = creerBanc();
    await banc.start('quiz', options);
    assert.equal(banc.messages.at(-1).kind, 'error');
    assert.ok(banc.messages.at(-1).message.length);
  }
  const banc = creerBanc();
  await banc.start('inconnu');
  assert.equal(banc.messages.at(-1).kind, 'error');
});

test('debug : une banque JSON inaccessible indique comment ouvrir Live Server', async () => {
  const banc = creerBanc({ fetchOk: false });
  await banc.start('culture');
  assert.equal(banc.messages.at(-1).kind, 'error');
  assert.match(banc.messages.at(-1).message, /Live Server/);
});

test('debug : une banque vide termine proprement via setImmediate', async () => {
  const banc = creerBanc({ questions: [] });
  await banc.start('culture');
  banc.avancer(0);
  assert.equal(banc.messages.at(-1).kind, 'finished');
});
