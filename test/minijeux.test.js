const test = require('node:test');
const assert = require('node:assert/strict');
const { demarrerQuiz } = require('../minijeux/quiz');
const { demarrerCulture } = require('../minijeux/culture-g');

function creerBancEssai() {
  const evenements = [];
  const messagesJoueurs = [];
  const io = { to: () => ({ emit: (nom, donnees) => evenements.push({ nom, donnees }) }) };
  return {
    io,
    evenements,
    messagesJoueurs,
    envoyerAuJoueur: (pseudo, nom, donnees) => messagesJoueurs.push({ pseudo, nom, donnees }),
    dernier: (nom) => evenements.filter((e) => e.nom === nom).at(-1)?.donnees,
  };
}

function attendreEvenement(banc, nom) {
  if (banc.dernier(nom)) return Promise.resolve(banc.dernier(nom));
  return new Promise((resolve, reject) => {
    const limite = Date.now() + 1000;
    const verifier = () => {
      const evenement = banc.dernier(nom);
      if (evenement) resolve(evenement);
      else if (Date.now() >= limite) reject(new Error(`Événement ${nom} non reçu`));
      else setTimeout(verifier, 1);
    };
    verifier();
  });
}

test('quiz : les titres sont nettoyés, limités et les doublons refusés', (t) => {
  const banc = creerBancEssai();
  const partie = { joueurs: [{ pseudo: 'A', pieces: 0 }, { pseudo: 'B', pieces: 0 }] };
  const jeu = demarrerQuiz({
    ...banc, code: 'TEST', partie, image: 'photo.jpg', onFin() {},
    durees: { ecriture: 60, vote: 60, resultats: 60 },
  });
  t.after(() => jeu.arreter());

  jeu.repondre('inconnu', 'non');
  jeu.repondre('A', '   ');
  jeu.repondre('A', `  ${'x'.repeat(120)}  `);
  jeu.repondre('A', 'second titre');

  const progression = banc.dernier('quiz-progression');
  assert.deepEqual(progression, { etape: 'ecriture', fait: 1, total: 2 });
  assert.equal(banc.messagesJoueurs.filter((m) => m.nom === 'quiz-reponse-ok').length, 1);
  assert.equal(banc.dernier('quiz-ecriture').image, '/images/quiz1/photo.jpg');
});

test('quiz : refuse le vote pour son propre titre et récompense le gagnant', (t) => {
  const banc = creerBancEssai();
  const partie = { joueurs: [{ pseudo: 'A', pieces: 0 }, { pseudo: 'B', pieces: 0 }] };
  const jeu = demarrerQuiz({
    ...banc, code: 'TEST', partie, image: 'photo.jpg', onFin() {},
    durees: { ecriture: 60, vote: 60, resultats: 60 },
  });
  t.after(() => jeu.arreter());

  jeu.repondre('A', 'Titre A');
  jeu.repondre('B', 'Titre B');
  const ids = banc.messagesJoueurs.filter((m) => m.nom === 'quiz-mon-id');
  const idA = ids.find((m) => m.pseudo === 'A').donnees.id;
  const idB = ids.find((m) => m.pseudo === 'B').donnees.id;
  jeu.voter('A', idA);
  assert.equal(banc.messagesJoueurs.filter((m) => m.nom === 'quiz-vote-ok').length, 0);
  jeu.voter('A', idB);
  jeu.voter('B', idA);

  assert.deepEqual(banc.dernier('quiz-resultats').gagnants.sort(), ['A', 'B']);
  assert.equal(partie.joueurs[0].pieces, 5);
  assert.equal(partie.joueurs[1].pieces, 5);
});

test('culture : valide les réponses et attribue des points à la bonne réponse', async (t) => {
  const banc = creerBancEssai();
  const partie = { joueurs: [{ pseudo: 'A', pieces: 0 }, { pseudo: 'B', pieces: 0 }] };
  const jeu = demarrerCulture({
    ...banc, code: 'TEST', partie, onFin() {}, nbQuestions: 1,
    questions: [{ categorie: 'Test', question: 'Capitale ?', bonne: 'Lima', fausses: ['Rome', 'Oslo', 'Riga'] }],
    durees: { lecture: 0, question: 60, correction: 60, classement: 60 },
  });
  t.after(() => jeu.arreter());

  const question = await attendreEvenement(banc, 'culture-question');
  const bonIndex = question.reponses.findIndex((r) => r.texte === 'Lima');
  assert.ok(bonIndex >= 0);
  assert.equal(Object.hasOwn(question, 'indexBonne'), false);

  jeu.repondre('inconnu', bonIndex);
  jeu.repondre('A', 99);
  jeu.repondre('A', bonIndex);
  jeu.repondre('A', bonIndex);
  jeu.repondre('B', (bonIndex + 1) % 4);

  const correction = banc.dernier('culture-correction');
  assert.equal(correction.detail.find((d) => d.pseudo === 'A').correct, true);
  assert.equal(correction.detail.find((d) => d.pseudo === 'A').points, 1000);
  assert.equal(correction.detail.find((d) => d.pseudo === 'B').points, 0);
  assert.equal(banc.messagesJoueurs.filter((m) => m.nom === 'culture-reponse-ok').length, 2);
});

test('culture : une réponse incorrecte ne rapporte aucun point', async (t) => {
  const banc = creerBancEssai();
  const partie = { joueurs: [{ pseudo: 'A', pieces: 0 }] };
  const jeu = demarrerCulture({
    ...banc, code: 'TEST', partie, onFin() {}, nbQuestions: 1,
    questions: [{ question: 'Capitale ?', bonne: 'Lima', fausses: ['Rome', 'Oslo', 'Riga'] }],
    durees: { lecture: 0, question: 60, correction: 60, classement: 60 },
  });
  t.after(() => jeu.arreter());

  const question = await attendreEvenement(banc, 'culture-question');
  const mauvaisIndex = question.reponses.findIndex((r) => r.texte !== 'Lima');
  jeu.repondre('A', mauvaisIndex);
  assert.equal(banc.dernier('culture-correction').detail[0].points, 0);
  assert.equal(banc.messagesJoueurs.find((m) => m.nom === 'culture-mon-resultat').donnees.correct, false);
});
