// ─────────────────────────────────────────────
//  Mini-jeu 1 : le quiz du titre drôle
//
//  Déroulement :
//    1. 'ecriture'  → une image est affichée sur l'écran hôte, chaque joueur
//                     écrit un titre sur son téléphone (60 s)
//    2. 'vote'      → les titres sont affichés anonymement et mélangés,
//                     chacun vote pour le plus drôle (sauf pour le sien)
//    3. 'resultat'  → on révèle les auteurs, le(s) gagnant(s) reçoivent des pièces
//    4. 'fini'      → on prévient server.js (onFin) qui passe au tour suivant
// ─────────────────────────────────────────────

const DUREE_ECRITURE = 60;  // secondes
const DUREE_VOTE = 30;      // secondes
const DUREE_RESULTATS = 8;  // secondes d'affichage des résultats
const PIECES_GAGNANT = 5;
const LONGUEUR_MAX = 100;   // caractères max pour un titre

function melanger(tableau) {
  const copie = [...tableau];
  for (let i = copie.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copie[i], copie[j]] = [copie[j], copie[i]];
  }
  return copie;
}

// Lance un quiz et renvoie les fonctions que server.js peut appeler ensuite.
//   io, code, partie  : pour envoyer des messages et lire les joueurs
//   image             : nom du fichier choisi dans images/quiz1
//   envoyerAuJoueur   : (pseudo, evenement, donnees) → message à un seul joueur
//   onFin             : appelée quand le mini-jeu est terminé
//   durees            : permet de remplacer les durées (utile pour tester)
function demarrerQuiz({ io, code, partie, image, envoyerAuJoueur, onFin, durees = {} }) {
  const d = {
    ecriture: DUREE_ECRITURE,
    vote: DUREE_VOTE,
    resultats: DUREE_RESULTATS,
    ...durees,
  };

  let phase = 'ecriture';
  let timer = null;
  let finPhase = 0;            // heure (ms) à laquelle la phase en cours se termine
  let dernierResultat = null;  // gardé pour le renvoyer à un joueur qui se reconnecte
  const urlImage = '/images/quiz1/' + encodeURIComponent(image);
  const reponses = new Map(); // pseudo de l'auteur → texte
  const votes = new Map();    // pseudo du votant → id de la proposition choisie
  let propositions = [];      // [{ id, texte, auteur }]

  function emettre(evenement, donnees) {
    io.to(code).emit(evenement, donnees);
  }

  // Un seul minuteur à la fois : on annule l'ancien avant d'en programmer un nouveau
  function programmer(secondes, fonction) {
    clearTimeout(timer);
    finPhase = Date.now() + secondes * 1000;
    timer = setTimeout(fonction, secondes * 1000);
  }

  // Temps restant dans la phase en cours (pour un joueur qui revient en cours de route)
  function resteSecondes() {
    return Math.max(1, Math.ceil((finPhase - Date.now()) / 1000));
  }

  function estJoueur(pseudo) {
    return partie.joueurs.some((j) => j.pseudo === pseudo);
  }

  function emettreProgression() {
    emettre('quiz-progression', {
      etape: phase,
      fait: phase === 'ecriture' ? reponses.size : votes.size,
      total: partie.joueurs.length,
    });
  }

  // ── Phase 1 : écriture ──────────────────────

  function demarrerEcriture() {
    emettre('quiz-ecriture', { image: urlImage, duree: d.ecriture });
    emettreProgression();
    programmer(d.ecriture, demarrerVote);
  }

  function repondre(pseudo, texte) {
    if (phase !== 'ecriture' || !estJoueur(pseudo) || reponses.has(pseudo)) return;

    texte = String(texte ?? '').trim().slice(0, LONGUEUR_MAX);
    if (texte === '') return;

    reponses.set(pseudo, texte);
    envoyerAuJoueur(pseudo, 'quiz-reponse-ok', {});
    emettreProgression();

    // Tout le monde a répondu : inutile d'attendre la fin des 60 s
    if (reponses.size >= partie.joueurs.length) demarrerVote();
  }

  // ── Phase 2 : vote ──────────────────────────

  function demarrerVote() {
    if (phase !== 'ecriture') return;

    // On mélange pour que l'ordre d'affichage ne révèle pas qui a écrit quoi
    propositions = melanger([...reponses].map(([auteur, texte]) => ({ auteur, texte })))
      .map((proposition, i) => ({ id: i, ...proposition }));

    // Il faut au moins 2 titres pour qu'un vote ait un sens
    if (propositions.length < 2) {
      afficherResultats();
      return;
    }

    phase = 'vote';

    // Chaque joueur apprend l'id de SON titre (pour ne pas le proposer à son vote)
    for (const joueur of partie.joueurs) {
      const mienne = propositions.find((p) => p.auteur === joueur.pseudo);
      envoyerAuJoueur(joueur.pseudo, 'quiz-mon-id', { id: mienne ? mienne.id : null });
    }

    // Les auteurs ne sont PAS envoyés : seulement id et texte
    emettre('quiz-vote', {
      propositions: propositions.map(({ id, texte }) => ({ id, texte })),
      duree: d.vote,
    });
    emettreProgression();
    programmer(d.vote, afficherResultats);
  }

  function voter(pseudo, id) {
    if (phase !== 'vote' || !estJoueur(pseudo) || votes.has(pseudo)) return;

    const proposition = propositions.find((p) => p.id === id);
    if (!proposition) return;
    // Le serveur refuse le vote pour sa propre réponse (même si le téléphone est modifié)
    if (proposition.auteur === pseudo) return;

    votes.set(pseudo, id);
    envoyerAuJoueur(pseudo, 'quiz-vote-ok', {});
    emettreProgression();

    if (votes.size >= partie.joueurs.length) afficherResultats();
  }

  // ── Phase 3 : résultats ─────────────────────

  function afficherResultats() {
    if (phase === 'resultat' || phase === 'fini') return;
    phase = 'resultat';

    const decomptes = propositions.map((p) => ({
      ...p,
      votes: [...votes.values()].filter((id) => id === p.id).length,
    }));

    const max = Math.max(0, ...decomptes.map((p) => p.votes));
    const gagnants = max > 0 ? decomptes.filter((p) => p.votes === max) : [];

    for (const gagnant of gagnants) {
      const joueur = partie.joueurs.find((j) => j.pseudo === gagnant.auteur);
      if (joueur) joueur.pieces += PIECES_GAGNANT;
    }

    dernierResultat = {
      resultats: decomptes.sort((a, b) => b.votes - a.votes),
      gagnants: gagnants.map((g) => g.auteur),
      pieces: PIECES_GAGNANT,
      assezDeReponses: propositions.length >= 2,
    };
    emettre('quiz-resultats', dernierResultat);
    emettre('positions', partie.joueurs);

    programmer(d.resultats, terminer);
  }

  // ── Phase 4 : fin ───────────────────────────

  function terminer() {
    phase = 'fini';
    clearTimeout(timer);
    onFin();
  }

  // ── Appelées par server.js ──────────────────

  // Un joueur s'est déconnecté (il est déjà retiré de partie.joueurs) :
  // on ne doit plus l'attendre
  function retirerJoueur(pseudo) {
    if (phase === 'ecriture') {
      reponses.delete(pseudo);
      emettreProgression();
      if (reponses.size >= partie.joueurs.length) demarrerVote();
    } else if (phase === 'vote') {
      votes.delete(pseudo);
      emettreProgression();
      if (votes.size >= partie.joueurs.length) afficherResultats();
    }
  }

  // Un joueur se reconnecte : on lui renvoie ce qu'il doit voir MAINTENANT,
  // avec le temps restant (pas la durée complète) et en sachant s'il a déjà joué.
  function renvoyerEtat(pseudo) {
    if (!estJoueur(pseudo)) return;

    if (phase === 'ecriture') {
      envoyerAuJoueur(pseudo, 'quiz-ecriture', {
        image: urlImage,
        duree: resteSecondes(),
        dejaRepondu: reponses.has(pseudo),
      });
    } else if (phase === 'vote') {
      const mienne = propositions.find((p) => p.auteur === pseudo);
      envoyerAuJoueur(pseudo, 'quiz-mon-id', { id: mienne ? mienne.id : null });
      envoyerAuJoueur(pseudo, 'quiz-vote', {
        propositions: propositions.map(({ id, texte }) => ({ id, texte })),
        duree: resteSecondes(),
        dejaVote: votes.has(pseudo),
      });
    } else if (phase === 'resultat' && dernierResultat) {
      envoyerAuJoueur(pseudo, 'quiz-resultats', dernierResultat);
    }
  }

  // La partie est détruite : on coupe les minuteurs
  function arreter() {
    phase = 'fini';
    clearTimeout(timer);
  }

  demarrerEcriture();

  return { repondre, voter, retirerJoueur, renvoyerEtat, arreter };
}

module.exports = { demarrerQuiz };