// ─────────────────────────────────────────────
//  Test du mini-jeu culture G, SANS serveur ni téléphone
//  Lancer depuis le dossier boardgame :   node test-culture.js
//
//  On simule 3 joueurs qui répondent au hasard, avec des durées
//  raccourcies pour que la partie dure quelques secondes.
// ─────────────────────────────────────────────

const { demarrerCulture } = require('./minijeux/culture-g');

const partie = {
  joueurs: [
    { pseudo: 'Till', pieces: 0 },
    { pseudo: 'Elie', pieces: 0 },
    { pseudo: 'Guillaume', pieces: 0 },
  ],
};

// Faux "io" : au lieu d'envoyer aux téléphones, on affiche dans la console
const io = {
  to: () => ({
    emit: (evenement, donnees) => recevoir(evenement, donnees),
  }),
};

// Faux "envoyerAuJoueur" : affiche le résultat perso de chaque joueur
function envoyerAuJoueur(pseudo, evenement, donnees) {
  if (evenement === 'culture-mon-resultat') {
    const etat = !donnees.repondu ? 'pas répondu' : donnees.correct ? 'CORRECT' : 'faux';
    console.log(`   📱 ${pseudo.padEnd(10)} ${etat.padEnd(12)} +${donnees.points} pts (total ${donnees.score}, ${donnees.rang}e)`);
  }
}

let jeu;

function recevoir(evenement, d) {
  if (evenement === 'culture-lecture') {
    console.log(`\n── Question ${d.numero}/${d.total} [${d.categorie}] ──`);
    console.log(`   ${d.question}`);
  }

  if (evenement === 'culture-question') {
    d.reponses.forEach((r) => console.log(`   ${r.id}. (${r.couleur}) ${r.texte}`));
    if ('bonne' in d) console.log('   ⚠️ PROBLÈME : la bonne réponse est envoyée aux téléphones !');

    // Chaque faux joueur répond au hasard après un petit délai
    for (const joueur of partie.joueurs) {
      const delai = 200 + Math.random() * 1500;
      const choix = Math.floor(Math.random() * 4);
      setTimeout(() => jeu.repondre(joueur.pseudo, choix), delai);
    }
  }

  if (evenement === 'culture-correction') {
    console.log(`   ✅ Bonne réponse : ${d.bonne}. ${d.texteBonne}   (votes par bouton : ${d.repartition.join(' / ')})`);
  }

  if (evenement === 'culture-classement') {
    console.log('\n══ CLASSEMENT FINAL ══');
    for (const l of d.classement) {
      console.log(`   ${l.rang}. ${l.pseudo.padEnd(10)} ${String(l.score).padStart(5)} pts   +${l.pieces} pièces`);
    }
  }
}

jeu = demarrerCulture({
  io,
  code: 'TEST',
  partie,
  envoyerAuJoueur,
  nbQuestions: 3,
  durees: { lecture: 1, question: 3, correction: 2, classement: 1 },
  onFin: () => {
    console.log('\n🏁 onFin appelée : le serveur passerait au tour suivant.');
    console.log('   Pièces des joueurs :', partie.joueurs.map((j) => `${j.pseudo}=${j.pieces}`).join(', '));
  },
});
