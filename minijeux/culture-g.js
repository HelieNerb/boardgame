// ─────────────────────────────────────────────
//  Mini-jeu 2 : le quiz de culture générale (façon Kahoot)
//
//  Déroulement (répété pour chaque question) :
//    1. 'lecture'    → la question s'affiche seule sur l'écran hôte (3 s),
//                      les téléphones affichent « Regarde l'écran ! »
//    2. 'question'   → les 4 réponses apparaissent (couleur + forme),
//                      chaque joueur appuie sur un bouton de son téléphone (20 s)
//    3. 'correction' → on montre la bonne réponse, combien ont choisi chaque
//                      bouton, et chaque joueur voit ses points sur son téléphone
//  Puis, après la dernière question :
//    4. 'classement' → classement final, le podium reçoit des pièces
//    5. 'fini'       → on prévient server.js (onFin) qui passe au tour suivant
//
//  Points : bonne réponse = entre 1000 (réponse immédiate) et 500 (dernière
//  seconde), comme dans Kahoot. Mauvaise réponse ou pas de réponse = 0.
// ─────────────────────────────────────────────

const BANQUE = require('./questions/culture.json');

const NB_QUESTIONS = 5;
const DUREE_LECTURE = 3;     // secondes où la question est affichée seule
const DUREE_QUESTION = 20;   // secondes pour répondre
const DUREE_CORRECTION = 6;  // secondes d'affichage de la bonne réponse
const DUREE_CLASSEMENT = 8;  // secondes d'affichage du classement final
const POINTS_MAX = 1000;
const POINTS_MIN = 500;
const PIECES_PODIUM = [5, 3, 1]; // pièces pour le 1er, le 2e, le 3e

// Le téléphone affiche le bouton n°i avec COULEURS[i] et FORMES[i]
const COULEURS = ['rouge', 'bleu', 'jaune', 'vert'];
const FORMES = ['triangle', 'losange', 'rond', 'carre'];

function melanger(tableau) {
    const copie = [...tableau];
    for (let i = copie.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [copie[i], copie[j]] = [copie[j], copie[i]];
    }
    return copie;
}

// Transforme une question du fichier JSON en question prête à jouer :
// les réponses sont mélangées et on retient où se trouve la bonne.
//   { bonne: 'Canberra', fausses: ['Sydney', ...] }
//   → { reponses: ['Sydney', 'Canberra', ...], indexBonne: 1 }
function preparerQuestion(q) {
    const reponses = melanger([q.bonne, ...q.fausses]);
    return {
        categorie: q.categorie || 'Culture générale',
        question: q.question,
        reponses,
        indexBonne: reponses.indexOf(q.bonne),
    };
}

// Lance le quiz et renvoie les fonctions que server.js peut appeler ensuite.
//   io, code, partie  : pour envoyer des messages et lire les joueurs
//   envoyerAuJoueur   : (pseudo, evenement, donnees) → message à un seul joueur
//   onFin             : appelée quand le mini-jeu est terminé
//   questions         : (optionnel) autre banque de questions que culture.json
//   nbQuestions       : (optionnel) nombre de questions tirées au hasard
//   durees            : permet de remplacer les durées (utile pour tester)
function demarrerCulture({
    io, code, partie, envoyerAuJoueur, onFin,
    questions = BANQUE, nbQuestions = NB_QUESTIONS, durees = {},
}) {
    const d = {
        lecture: DUREE_LECTURE,
        question: DUREE_QUESTION,
        correction: DUREE_CORRECTION,
        classement: DUREE_CLASSEMENT,
        ...durees,
    };

    // On tire les questions au hasard, sans doublon
    const serie = melanger(questions).slice(0, nbQuestions).map(preparerQuestion);

    let phase = 'lecture';
    let numero = 0;              // index de la question en cours dans serie
    let timer = null;
    let finPhase = 0;            // heure (ms) à laquelle la phase en cours se termine
    let debutQuestion = 0;       // heure (ms) où les réponses sont apparues
    let derniereCorrection = null; // gardée pour un joueur qui se reconnecte
    let dernierClassement = null;
    const scores = new Map();    // pseudo → score total
    let choix = new Map();       // pseudo → { index, temps } pour la question en cours

    function emettre(evenement, donnees) {
        io.to(code).emit(evenement, donnees);
    }

    // Un seul minuteur à la fois : on annule l'ancien avant d'en programmer un nouveau
    function programmer(secondes, fonction) {
        clearTimeout(timer);
        finPhase = Date.now() + secondes * 1000;
        timer = setTimeout(fonction, secondes * 1000);
    }

    function resteSecondes() {
        return Math.max(1, Math.ceil((finPhase - Date.now()) / 1000));
    }

    function estJoueur(pseudo) {
        return partie.joueurs.some((j) => j.pseudo === pseudo);
    }

    function scoreDe(pseudo) {
        return scores.get(pseudo) || 0;
    }

    function questionCourante() {
        return serie[numero];
    }

    // Ce que les clients ont le droit de voir : SANS la bonne réponse
    function questionPublique() {
        const q = questionCourante();
        return {
            numero: numero + 1,
            total: serie.length,
            categorie: q.categorie,
            question: q.question,
            reponses: q.reponses.map((texte, id) => ({
                id, texte, couleur: COULEURS[id], forme: FORMES[id],
            })),
        };
    }

    // Classement trié par score. Les ex æquo ont le même rang
    // (ex. scores 1800, 1800, 900 → rangs 1, 1, 3).
    function calculerClassement() {
        const liste = partie.joueurs
            .map((j) => ({ pseudo: j.pseudo, score: scoreDe(j.pseudo) }))
            .sort((a, b) => b.score - a.score);
        return liste.map((ligne) => ({
            ...ligne,
            rang: 1 + liste.filter((autre) => autre.score > ligne.score).length,
        }));
    }

    function emettreProgression() {
        emettre('culture-progression', {
            fait: choix.size,
            total: partie.joueurs.length,
        });
    }

    // ── Phase 1 : lecture de la question ────────

    function demarrerLecture() {
        phase = 'lecture';
        choix = new Map();
        const { numero: n, total, categorie, question } = questionPublique();
        emettre('culture-lecture', { numero: n, total, categorie, question, duree: d.lecture });
        programmer(d.lecture, demarrerQuestion);
    }

    // ── Phase 2 : les joueurs répondent ─────────

    function demarrerQuestion() {
        if (phase !== 'lecture') return;
        phase = 'question';
        debutQuestion = Date.now();
        emettre('culture-question', { ...questionPublique(), duree: d.question });
        emettreProgression();
        programmer(d.question, afficherCorrection);
    }

    function repondre(pseudo, index) {
        if (phase !== 'question' || !estJoueur(pseudo) || choix.has(pseudo)) return;

        // On n'accepte qu'un numéro de bouton valide (0 à 3), même si le téléphone est modifié
        index = Number(index);
        if (!Number.isInteger(index) || index < 0 || index >= questionCourante().reponses.length) return;

        // Le temps est mesuré par le SERVEUR : un joueur ne peut pas tricher sur sa vitesse
        choix.set(pseudo, { index, temps: Date.now() - debutQuestion });
        envoyerAuJoueur(pseudo, 'culture-reponse-ok', { index });
        emettreProgression();

        // Tout le monde a répondu : inutile d'attendre la fin du chrono
        if (choix.size >= partie.joueurs.length) afficherCorrection();
    }

    // Plus on répond vite, plus on gagne : 1000 points à 0 s, 500 points à la fin
    function calculerPoints(temps) {
        const fraction = Math.min(1, temps / (d.question * 1000)); // 0 → 1
        return Math.round(POINTS_MAX - (POINTS_MAX - POINTS_MIN) * fraction);
    }

    // ── Phase 3 : correction ────────────────────

    function afficherCorrection() {
        if (phase !== 'question') return;
        phase = 'correction';

        const q = questionCourante();
        const repartition = q.reponses.map(() => 0); // nb de joueurs par bouton
        const detail = [];

        for (const joueur of partie.joueurs) {
            const c = choix.get(joueur.pseudo);
            const correct = c ? c.index === q.indexBonne : false;
            const points = correct ? calculerPoints(c.temps) : 0;

            if (c) repartition[c.index]++;
            scores.set(joueur.pseudo, scoreDe(joueur.pseudo) + points);
            detail.push({ pseudo: joueur.pseudo, choix: c ? c.index : null, correct, points });
        }

        const classement = calculerClassement();
        derniereCorrection = {
            numero: numero + 1,
            total: serie.length,
            bonne: q.indexBonne,
            texteBonne: q.reponses[q.indexBonne],
            repartition,
            detail,
            classement,
            derniere: numero === serie.length - 1,
        };
        emettre('culture-correction', derniereCorrection);

        // Chaque téléphone reçoit SON résultat (« Correct ! +874 », « 2e place »…)
        for (const ligne of detail) envoyerAuJoueur(ligne.pseudo, 'culture-mon-resultat', resultatPerso(ligne.pseudo));

        programmer(d.correction, questionSuivante);
    }

    function resultatPerso(pseudo) {
        const ligne = derniereCorrection.detail.find((l) => l.pseudo === pseudo);
        const place = derniereCorrection.classement.find((l) => l.pseudo === pseudo);
        return {
            repondu: ligne ? ligne.choix !== null : false,
            correct: ligne ? ligne.correct : false,
            points: ligne ? ligne.points : 0,
            score: scoreDe(pseudo),
            rang: place ? place.rang : null,
        };
    }

    function questionSuivante() {
        numero++;
        if (numero < serie.length) demarrerLecture();
        else afficherClassement();
    }

    // ── Phase 4 : classement final ──────────────

    function afficherClassement() {
        if (phase === 'classement' || phase === 'fini') return;
        phase = 'classement';

        // Les ex æquo reçoivent les mêmes pièces ; personne ne gagne avec 0 point
        const classement = calculerClassement().map((ligne) => ({
            ...ligne,
            pieces: ligne.score > 0 ? (PIECES_PODIUM[ligne.rang - 1] || 0) : 0,
        }));

        for (const ligne of classement) {
            const joueur = partie.joueurs.find((j) => j.pseudo === ligne.pseudo);
            if (joueur) joueur.pieces += ligne.pieces;
        }

        dernierClassement = { classement };
        emettre('culture-classement', dernierClassement);
        emettre('positions', partie.joueurs);

        programmer(d.classement, terminer);
    }

    // ── Phase 5 : fin ───────────────────────────

    function terminer() {
        phase = 'fini';
        clearTimeout(timer);
        onFin();
    }

    // ── Appelées par server.js ──────────────────

    // Un joueur s'est déconnecté (il est déjà retiré de partie.joueurs) :
    // on ne doit plus l'attendre
    function retirerJoueur(pseudo) {
        if (phase === 'question') {
            choix.delete(pseudo);
            emettreProgression();
            if (choix.size >= partie.joueurs.length) afficherCorrection();
        }
    }

    // Un joueur se reconnecte : on lui renvoie ce qu'il doit voir MAINTENANT,
    // avec le temps restant et en sachant s'il a déjà répondu.
    function renvoyerEtat(pseudo) {
        if (!estJoueur(pseudo)) return;

        if (phase === 'lecture') {
            const { numero: n, total, categorie, question } = questionPublique();
            envoyerAuJoueur(pseudo, 'culture-lecture', { numero: n, total, categorie, question, duree: resteSecondes() });
        } else if (phase === 'question') {
            const c = choix.get(pseudo);
            envoyerAuJoueur(pseudo, 'culture-question', {
                ...questionPublique(),
                duree: resteSecondes(),
                dejaRepondu: c ? c.index : null,
            });
        } else if (phase === 'correction' && derniereCorrection) {
            envoyerAuJoueur(pseudo, 'culture-correction', derniereCorrection);
            envoyerAuJoueur(pseudo, 'culture-mon-resultat', resultatPerso(pseudo));
        } else if (phase === 'classement' && dernierClassement) {
            envoyerAuJoueur(pseudo, 'culture-classement', dernierClassement);
        }
    }

    // La partie est détruite : on coupe les minuteurs
    function arreter() {
        phase = 'fini';
        clearTimeout(timer);
    }

    if (serie.length === 0) {
        // Pas de question disponible : on ne bloque pas la partie
        setImmediate(onFin);
        phase = 'fini';
    } else {
        demarrerLecture();
    }

    return { repondre, retirerJoueur, renvoyerEtat, arreter };
}

module.exports = { demarrerCulture };
