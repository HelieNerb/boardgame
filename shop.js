// Boutique : objets, tirage de l'offre, achat et effets.
// Règles pures (pas de socket) : server.js appelle ces fonctions.

const RARETE = { commun: 10, rare: 4, tresRare: 1 };
const MAX_ITEMS = 2;

const SHOP_ITEMS = [
  { id: 'boost5',    nom: 'Petit boost',   prix: 3,  cible: false, poids: RARETE.commun   },
  { id: 'boost10',   nom: 'Gros boost',    prix: 10, cible: false, poids: RARETE.commun   },
  { id: 'malus',     nom: 'Malus',         prix: 6,  cible: true,  poids: RARETE.commun   },
  { id: 'coffre',    nom: 'Coffre',        prix: 8,  cible: true,  poids: RARETE.rare     },
  { id: 'pirate',    nom: 'Bateau pirate', prix: 10, cible: false, poids: RARETE.rare     },
  { id: 'voletoile', nom: "Vol d'étoile",  prix: 15, cible: true,  poids: RARETE.tresRare },
];

function melanger(tableau) {
  const t = [...tableau];
  for (let i = t.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [t[i], t[j]] = [t[j], t[i]];
  }
  return t;
}

// Tire 3 objets différents, avec une chance proportionnelle à leur poids
function genererOffre() {
  const restants = [...SHOP_ITEMS];
  const offre = [];
  while (offre.length < 3) {
    const total = restants.reduce((s, i) => s + i.poids, 0);
    let r = Math.random() * total;
    const idx = restants.findIndex(i => (r -= i.poids) < 0);
    offre.push(restants.splice(idx, 1)[0]);
  }
  return offre;
}

// Renvoie null si l'achat réussit, sinon un message d'erreur
function acheter(joueur, itemId, offre) {
  const item = offre.find(i => i.id === itemId);
  if (!item) return "Cet objet n'est pas dans la boutique";
  if (joueur.pieces < item.prix) return 'Pas assez de pièces';
  if (joueur.inventaire.length >= MAX_ITEMS) return 'Inventaire plein (2 objets max)';
  joueur.pieces -= item.prix;
  joueur.inventaire.push(item.id);
  return null;
}

// Applique l'objet. Renvoie { ok, message } pour l'afficher sur les écrans.
function utiliserItem(joueurs, joueur, itemId, pseudoCible) {
  const item = SHOP_ITEMS.find(i => i.id === itemId);
  const idx = joueur.inventaire.indexOf(itemId);
  if (!item || idx === -1) return { ok: false, message: "Tu n'as pas cet objet" };

  const cible = joueurs.find(j => j.pseudo === pseudoCible);
  if (item.cible && (!cible || cible === joueur)) {
    return { ok: false, message: 'Cible invalide' };
  }
  if (itemId === 'voletoile' && cible.etoiles === 0) {
    return { ok: false, message: `${cible.pseudo} n'a pas d'étoile` };
  }

  joueur.inventaire.splice(idx, 1);

  switch (itemId) {
    case 'boost5':
      joueur.bonusDeplacement += 5;
      return { ok: true, message: `${joueur.pseudo} utilise un Petit boost (+5 cases)` };
    case 'boost10':
      joueur.bonusDeplacement += 10;
      return { ok: true, message: `${joueur.pseudo} utilise un Gros boost (+10 cases)` };
    case 'malus':
      cible.bloqueProchainTour = true;
      return { ok: true, message: `${cible.pseudo} ne pourra pas avancer à son prochain tour` };
    case 'coffre': {
      const vol = Math.min(10, cible.pieces);
      cible.pieces -= vol;
      joueur.pieces += vol;
      return { ok: true, message: `${joueur.pseudo} vole ${vol} pièces à ${cible.pseudo}` };
    }
    case 'pirate': {
      const montants = melanger(joueurs.map(j => j.pieces));
      joueurs.forEach((j, k) => { j.pieces = montants[k]; });
      return { ok: true, message: 'Le bateau pirate mélange les pièces de tout le monde !' };
    }
    case 'voletoile':
      cible.etoiles -= 1;
      joueur.etoiles += 1;
      return { ok: true, message: `${joueur.pseudo} vole une étoile à ${cible.pseudo} !` };
  }
}

module.exports = { SHOP_ITEMS, MAX_ITEMS, genererOffre, acheter, utiliserItem };