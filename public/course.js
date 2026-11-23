// Même affichage simple des pistes pour le grand écran et le debug.
window.MayoCourse = {
  afficher(pistes, { joueurs, objectif }) {
    const lignes = Array.from(pistes.children);
    if (lignes.length !== joueurs.length || joueurs.some((j, i) => lignes[i]?.dataset.pseudo !== j.pseudo)) {
      pistes.replaceChildren();
      for (const joueur of joueurs) {
        const ligne = document.createElement('div');
        ligne.className = 'course-ligne';
        ligne.dataset.pseudo = joueur.pseudo;
        const score = document.createElement('p');
        const piste = document.createElement('div');
        piste.className = 'course-piste';
        const cheval = document.createElement('span');
        cheval.className = 'course-cheval';
        cheval.textContent = '🏇';
        cheval.setAttribute('aria-hidden', 'true');
        const arrivee = document.createElement('span');
        arrivee.className = 'course-arrivee';
        arrivee.textContent = '🏁';
        piste.append(cheval, arrivee);
        ligne.append(score, piste);
        pistes.append(ligne);
      }
    }
    joueurs.forEach((joueur, index) => {
      const ligne = pistes.children[index];
      ligne.firstElementChild.textContent = joueur.pseudo + ' — ' + joueur.score + ' / ' + objectif + ' clics';
      ligne.querySelector('.course-cheval').style.left = Math.min(100, joueur.score / objectif * 100) + '%';
    });
  },
};
