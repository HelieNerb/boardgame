// Conserver Socket.IO et tous les gestionnaires officiels. Seuls l'entrée
// directe dans le mini-jeu et les identités des fenêtres sont préparés ici.
(() => {
  const config = JSON.parse(decodeURIComponent(document.currentScript.dataset.config));
  const originalIo = window.io;
  window.io = () => {
    const socket = originalIo({ auth: { debugId: config.id, debugRole: config.role } });
    if (config.role === 'host') {
      const emit = socket.emit.bind(socket);
      socket.emit = (name, ...args) => emit(name === 'demarrer' ? 'debug-demarrer' : name, ...args);
    } else {
      const join = () => socket.emit('rejoindre', { code: config.code, pseudo: 'Joueur ' + config.player });
      socket.on('connect', () => {
        let saved = null;
        try { saved = JSON.parse(localStorage.getItem(config.key)); } catch {}
        if (!saved?.token) join();
      });
      socket.on('reconnexion-refusee', join);
    }
    return socket;
  };
})();
