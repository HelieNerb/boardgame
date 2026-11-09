(function () {
  const NS = 'http://www.w3.org/2000/svg';
  const options = {
    color: [
      { id: 'orange', label: 'Orange', hex: '#ff8b22' },
      { id: 'corail', label: 'Corail', hex: '#ff5d68' },
      { id: 'jaune', label: 'Jaune', hex: '#ffd447' },
      { id: 'vert', label: 'Vert', hex: '#55c878' },
      { id: 'turquoise', label: 'Turquoise', hex: '#36c9c3' },
      { id: 'bleu', label: 'Bleu', hex: '#4f9cff' },
      { id: 'violet', label: 'Violet', hex: '#a879f6' },
      { id: 'rose', label: 'Rose', hex: '#f47ac0' },
    ],
    eyes: [
      { id: 'ronds', label: 'Ronds' },
      { id: 'malicieux', label: 'Clin d’œil' },
      { id: 'plisses', label: 'Plissés' },
      { id: 'surpris', label: 'Surpris' },
    ],
    mouth: [
      { id: 'sourire', label: 'Sourire' },
      { id: 'grand', label: 'Grand sourire' },
      { id: 'o', label: 'Étonnée' },
      { id: 'langue', label: 'Langue tirée' },
    ],
  };

  function normaliser(avatar) {
    const choix = avatar && typeof avatar === 'object' ? avatar : {};
    return {
      color: options.color.some((x) => x.id === choix.color) ? choix.color : 'orange',
      eyes: options.eyes.some((x) => x.id === choix.eyes) ? choix.eyes : 'ronds',
      mouth: options.mouth.some((x) => x.id === choix.mouth) ? choix.mouth : 'sourire',
    };
  }

  function optionLabel(groupe, id) {
    const option = options[groupe].find((x) => x.id === id);
    return option ? option.label : '';
  }

  function creer(avatar, className) {
    const choix = normaliser(avatar);
    const couleur = options.color.find((x) => x.id === choix.color).hex;
    const encre = '#17264d';
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', '0 0 32 40');
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', 'Personnage ' + optionLabel('color', choix.color)
      + ', yeux ' + optionLabel('eyes', choix.eyes)
      + ', bouche ' + optionLabel('mouth', choix.mouth));
    svg.setAttribute('shape-rendering', 'crispEdges');
    svg.classList.add('avatar-sprite');
    if (className) className.split(/\s+/).filter(Boolean).forEach((name) => svg.classList.add(name));

    function pixels(x, y, width, height, fill) {
      const rect = document.createElementNS(NS, 'rect');
      rect.setAttribute('x', x);
      rect.setAttribute('y', y);
      rect.setAttribute('width', width);
      rect.setAttribute('height', height);
      rect.setAttribute('fill', fill);
      svg.appendChild(rect);
    }

    function path(d, fill) {
      const shape = document.createElementNS(NS, 'path');
      shape.setAttribute('d', d);
      shape.setAttribute('fill', fill);
      svg.appendChild(shape);
    }

    // Silhouette en marches de pixels : tête ronde et petit corps trapu.
    path('M10 2h12v2h4v4h2v10h-2v4h-4v2H10v-2H6v-4H4V8h2V4h4z', encre);
    path('M10 4h12v2h2v2h2v8h-2v4h-2v2H10v-2H8v-2H6v-8h2V6h2z', couleur);
    path('M8 24h16v2h4v2h2v9H2v-9h2v-2h4z', encre);
    path('M8 26h16v2h4v7H4v-7h4z', couleur);

    const blanc = '#fffdf4';
    if (choix.eyes === 'plisses') {
      pixels(8, 11, 5, 2, encre);
      pixels(19, 11, 5, 2, encre);
    } else {
      const hauteur = choix.eyes === 'surpris' ? 6 : 5;
      pixels(8, 9, 5, hauteur, blanc);
      pixels(19, 9, 5, hauteur, blanc);
      if (choix.eyes === 'malicieux') {
        pixels(8, 11, 5, 2, encre);
        pixels(20, 11, 2, 3, encre);
      } else {
        pixels(10, 11, 2, 3, encre);
        pixels(20, 11, 2, 3, encre);
      }
    }

    if (choix.mouth === 'sourire') {
      path('M12 17h2v2h4v-2h2v3h-2v2h-4v-2h-2z', encre);
    } else if (choix.mouth === 'grand') {
      pixels(11, 17, 10, 5, encre);
      pixels(13, 18, 6, 1, blanc);
    } else if (choix.mouth === 'o') {
      pixels(14, 17, 4, 5, encre);
      pixels(15, 18, 2, 3, '#7d3340');
    } else {
      pixels(11, 17, 10, 5, encre);
      pixels(13, 18, 6, 1, blanc);
      pixels(15, 20, 4, 3, '#ff647c');
    }

    return svg;
  }

  function aleatoire() {
    function choisir(groupe) {
      const liste = options[groupe];
      return liste[Math.floor(Math.random() * liste.length)].id;
    }
    return { color: choisir('color'), eyes: choisir('eyes'), mouth: choisir('mouth') };
  }

  window.MayoAvatar = { options, normaliser, optionLabel, creer, aleatoire };
})();
