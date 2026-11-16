const test = require('node:test');
const assert = require('node:assert/strict');
const {
  PLATEAU,
  POSITIONS_ETOILE,
  choisirPositionEtoile,
  plateauAvecEtoile,
  normaliserAvatar,
  melanger,
  classement,
  appliquerEffetCase,
} = require('../server');

test('le plateau contient 24 cases et commence au départ', () => {
  assert.equal(PLATEAU.length, 24);
  assert.equal(PLATEAU[0], 'depart');
  assert.ok(PLATEAU.every((type) => ['depart', 'bleue', 'rouge', 'shop'].includes(type)));
});

test('la position de l’étoile évite sa position actuelle et les joueurs', () => {
  const partie = {
    etoilePosition: 6,
    joueurs: [{ position: 12 }, { position: 2 }],
  };
  const originalRandom = Math.random;
  Math.random = () => 0;
  try {
    assert.equal(choisirPositionEtoile(partie), 18);
  } finally {
    Math.random = originalRandom;
  }
});

test('si toutes les cases étoile sont occupées, une autre position est choisie', () => {
  const partie = {
    etoilePosition: 6,
    joueurs: POSITIONS_ETOILE.map((position) => ({ position })),
  };
  const originalRandom = Math.random;
  Math.random = () => 0;
  try {
    assert.equal(choisirPositionEtoile(partie), 12);
  } finally {
    Math.random = originalRandom;
  }
});

test('le plateau affiché remplace la case courante par une étoile sans muter le modèle', () => {
  const partie = { etoilePosition: 6 };
  const resultat = plateauAvecEtoile(partie);
  assert.equal(resultat[6], 'etoile');
  assert.equal(PLATEAU[6], 'bleue');
  assert.equal(resultat.length, PLATEAU.length);
});

test('les avatars inconnus reprennent les valeurs par défaut', () => {
  assert.deepEqual(normaliserAvatar({ color: 'inconnu', eyes: 'ronds' }), {
    color: 'orange', eyes: 'ronds', mouth: 'sourire',
  });
  assert.deepEqual(normaliserAvatar(null), {
    color: 'orange', eyes: 'ronds', mouth: 'sourire',
  });
});

test('le mélange conserve les éléments sans modifier le tableau source', () => {
  const source = [1, 2, 3, 4];
  const originalRandom = Math.random;
  Math.random = () => 0;
  try {
    const resultat = melanger(source);
    assert.deepEqual([...resultat].sort(), source);
    assert.notEqual(resultat, source);
    assert.deepEqual(source, [1, 2, 3, 4]);
  } finally {
    Math.random = originalRandom;
  }
});

test('le classement trie d’abord les étoiles, puis les pièces', () => {
  const joueurs = [
    { pseudo: 'A', etoiles: 1, pieces: 20 },
    { pseudo: 'B', etoiles: 2, pieces: 0 },
    { pseudo: 'C', etoiles: 1, pieces: 30 },
  ];
  assert.deepEqual(classement({ joueurs }).map((j) => j.pseudo), ['B', 'C', 'A']);
  assert.deepEqual(joueurs.map((j) => j.pseudo), ['A', 'B', 'C']);
});

test('une case bleue donne 3 pièces', () => {
  const joueur = { pseudo: 'Lou', position: 1, pieces: 4, etoiles: 0 };
  assert.equal(appliquerEffetCase({}, joueur).type, 'bleue');
  assert.equal(joueur.pieces, 7);
});

test('une case rouge ne fait pas passer les pièces sous zéro', () => {
  const joueur = { pseudo: 'Lou', position: 3, pieces: 2, etoiles: 0 };
  assert.match(appliquerEffetCase({}, joueur).message, /perd 2 pièces/);
  assert.equal(joueur.pieces, 0);
});

test('une étoile coûte 10 pièces et augmente le compteur', () => {
  const partie = { etoilePosition: 6 };
  const joueur = { pseudo: 'Lou', position: 6, pieces: 12, etoiles: 0 };
  const effet = appliquerEffetCase(partie, joueur);
  assert.equal(effet.achatEtoile, true);
  assert.equal(joueur.pieces, 2);
  assert.equal(joueur.etoiles, 1);
});

test('un joueur sans assez de pièces ne reçoit pas d’étoile', () => {
  const partie = { etoilePosition: 6 };
  const joueur = { pseudo: 'Lou', position: 6, pieces: 9, etoiles: 0 };
  const effet = appliquerEffetCase(partie, joueur);
  assert.equal(effet.achatEtoile, false);
  assert.equal(joueur.pieces, 9);
  assert.equal(joueur.etoiles, 0);
});
