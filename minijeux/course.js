// Course de chevaux : un clic = un pas, le premier à l'arrivée gagne.
function demarrerCourse({ io, code, partie, envoyerAuJoueur, onFin, objectif = 60, durees = {} }) {
  const d = { preparation: 3, course: 20, resultats: 5, ...durees };
  const scores = new Map(partie.joueurs.map((j) => [j.pseudo, 0]));
  let phase = 'preparation';
  let timer = null;
  let finPhase = 0;
  let resultat = null;

  function etat() {
    return {
      objectif,
      duree: Math.max(0, Math.ceil((finPhase - Date.now()) / 1000)),
      joueurs: partie.joueurs.map((j) => ({ pseudo: j.pseudo, score: scores.get(j.pseudo) || 0 })),
    };
  }

  function emettre(nom, donnees) {
    io.to(code).emit(nom, donnees);
  }

  function programmer(secondes, callback) {
    clearTimeout(timer);
    finPhase = Date.now() + secondes * 1000;
    timer = setTimeout(callback, secondes * 1000);
  }

  function terminer() {
    if (phase !== 'resultats') return;
    phase = 'fini';
    clearTimeout(timer);
    onFin();
  }

  function afficherResultats(raison) {
    if (phase !== 'course') return;
    phase = 'resultats';
    const liste = etat().joueurs.sort((a, b) => b.score - a.score);
    const meilleur = liste[0]?.score || 0;
    const gagnants = liste.filter((j) => meilleur > 0 && j.score === meilleur).map((j) => j.pseudo);
    const classement = liste.map((j) => ({
      ...j,
      rang: 1 + liste.filter((autre) => autre.score > j.score).length,
      pieces: gagnants.includes(j.pseudo) ? 5 : 0,
    }));
    for (const joueur of partie.joueurs) {
      joueur.pieces += classement.find((j) => j.pseudo === joueur.pseudo).pieces;
    }
    resultat = { objectif, raison, classement, gagnants };
    programmer(d.resultats, terminer);
    emettre('course-resultats', resultat);
    emettre('positions', partie.joueurs);
  }

  function demarrer() {
    if (phase !== 'preparation') return;
    phase = 'course';
    programmer(d.course, () => afficherResultats('temps'));
    emettre('course-depart', etat());
  }

  function cliquer(pseudo) {
    if (phase !== 'course' || !partie.joueurs.some((j) => j.pseudo === pseudo)) return;
    if (Date.now() >= finPhase) {
      afficherResultats('temps');
      return;
    }
    scores.set(pseudo, (scores.get(pseudo) || 0) + 1);
    emettre('course-positions', etat());
    if (scores.get(pseudo) >= objectif) afficherResultats('arrivee');
  }

  function retirerJoueur(pseudo) {
    scores.delete(pseudo);
    if (phase === 'course') {
      emettre('course-positions', etat());
      if (partie.joueurs.length === 0) afficherResultats('abandon');
    }
  }

  function renvoyerEtat(pseudo) {
    if (!partie.joueurs.some((j) => j.pseudo === pseudo)) return;
    if (phase === 'preparation') envoyerAuJoueur(pseudo, 'course-preparation', etat());
    if (phase === 'course') envoyerAuJoueur(pseudo, 'course-depart', etat());
    if (phase === 'resultats') envoyerAuJoueur(pseudo, 'course-resultats', resultat);
  }

  function arreter() {
    phase = 'fini';
    clearTimeout(timer);
  }

  programmer(d.preparation, demarrer);
  emettre('course-preparation', etat());
  return { cliquer, retirerJoueur, renvoyerEtat, arreter };
}

module.exports = { demarrerCourse };
