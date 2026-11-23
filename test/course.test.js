const test = require('node:test');
const assert = require('node:assert/strict');
const { demarrerCourse } = require('../minijeux/course');

function creerBanc(t, options = {}) {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  const evenements = [];
  const partie = { joueurs: ['A', 'B', 'C'].map((pseudo) => ({ pseudo, pieces: 5 })) };
  let fins = 0;
  const jeu = demarrerCourse({
    io: { to: () => ({ emit: (nom, donnees) => evenements.push({ nom, donnees: structuredClone(donnees) }) }) },
    code: 'TEST', partie,
    envoyerAuJoueur: (pseudo, nom, donnees) => evenements.push({ pseudo, nom, donnees: structuredClone(donnees) }),
    onFin: () => { fins++; },
    objectif: 3,
    ...options,
  });
  t.after(() => jeu.arreter());
  return { jeu, partie, evenements, fins: () => fins, dernier: (nom) => evenements.filter((e) => e.nom === nom).at(-1)?.donnees };
}

test('course : seuls les joueurs peuvent cliquer après le départ, le score est diffusé en direct', (t) => {
  const banc = creerBanc(t);
  banc.jeu.cliquer('A');
  assert.equal(banc.dernier('course-positions'), undefined);
  t.mock.timers.tick(3000);
  banc.jeu.cliquer('inconnu');
  assert.equal(banc.dernier('course-positions'), undefined);
  banc.jeu.cliquer('A');
  assert.equal(banc.dernier('course-positions').joueurs[0].score, 1);
});

test('course : le premier à l’arrivée gagne une seule récompense et la session se termine', (t) => {
  const banc = creerBanc(t);
  t.mock.timers.tick(3000);
  banc.jeu.cliquer('B');
  for (let i = 0; i < 5; i++) banc.jeu.cliquer('A');
  const resultats = banc.dernier('course-resultats');
  assert.equal(resultats.raison, 'arrivee');
  assert.deepEqual(resultats.gagnants, ['A']);
  assert.equal(resultats.classement[0].score, 3);
  assert.deepEqual(banc.partie.joueurs.map((j) => j.pieces), [10, 5, 5]);
  t.mock.timers.tick(5000);
  assert.equal(banc.fins(), 1);
  t.mock.timers.tick(30000);
  assert.equal(banc.fins(), 1);
});

test('course : à la limite du temps, les premiers ex æquo gagnent, pas les clics tardifs', (t) => {
  const banc = creerBanc(t);
  t.mock.timers.tick(3000);
  banc.jeu.cliquer('A');
  banc.jeu.cliquer('B');
  t.mock.timers.tick(20000);
  banc.jeu.cliquer('C');
  const resultats = banc.dernier('course-resultats');
  assert.equal(resultats.raison, 'temps');
  assert.deepEqual(resultats.gagnants, ['A', 'B']);
  assert.deepEqual(resultats.classement.map((j) => j.rang), [1, 1, 3]);
  assert.deepEqual(banc.partie.joueurs.map((j) => j.pieces), [10, 10, 5]);
});

test('course : une course sans clic ne distribue aucune pièce', (t) => {
  const banc = creerBanc(t);
  t.mock.timers.tick(3000);
  t.mock.timers.tick(20000);
  assert.deepEqual(banc.dernier('course-resultats').gagnants, []);
  assert.ok(banc.partie.joueurs.every((j) => j.pieces === 5));
});

test('course : une reconnexion retrouve la préparation, le score et le résultat', (t) => {
  const banc = creerBanc(t);
  banc.jeu.renvoyerEtat('A');
  assert.equal(banc.evenements.at(-1).nom, 'course-preparation');
  t.mock.timers.tick(3000);
  banc.jeu.cliquer('A');
  banc.jeu.renvoyerEtat('A');
  assert.equal(banc.evenements.at(-1).nom, 'course-depart');
  assert.equal(banc.evenements.at(-1).donnees.joueurs[0].score, 1);
  banc.jeu.cliquer('A');
  banc.jeu.cliquer('A');
  banc.jeu.renvoyerEtat('A');
  assert.equal(banc.evenements.at(-1).nom, 'course-resultats');
  assert.equal(banc.partie.joueurs[0].pieces, 10);
});

test('course : le retrait et l’arrêt annulent la participation et les minuteurs', (t) => {
  const banc = creerBanc(t);
  t.mock.timers.tick(3000);
  banc.partie.joueurs.splice(0, 1);
  banc.jeu.retirerJoueur('A');
  banc.jeu.cliquer('A');
  assert.equal(banc.dernier('course-positions').joueurs.length, 2);
  banc.jeu.arreter();
  t.mock.timers.tick(60000);
  assert.equal(banc.dernier('course-resultats'), undefined);
  assert.equal(banc.fins(), 0);
});
