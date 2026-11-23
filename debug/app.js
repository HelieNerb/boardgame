const $ = (id) => document.getElementById(id);
const backend = new URL(new URLSearchParams(location.search).get('server') || 'http://127.0.0.1:3001');
const phones = new Map();
let id = null;
let state = null;
let timer = null;
let disposed = false;
let busy = false;
let boardOptionsReady = false;

function config() {
  return { type: $('type').value, image: $('image').value, questions: Number($('questions').value), fast: $('fast').checked };
}
function error(message) { $('error').textContent = message; $('error').hidden = !message; }
async function request(route, data) {
  const response = await fetch(new URL('/debug/api/' + route, backend), {
    method: data === undefined ? 'GET' : 'POST',
    headers: data === undefined ? {} : { 'Content-Type': 'application/json' },
    body: data === undefined ? undefined : JSON.stringify(data),
    signal: AbortSignal.timeout(5000),
  });
  const result = await response.json();
  if (!response.ok) throw Object.assign(new Error(result.error || 'Erreur du debug.'), { status: response.status });
  return result;
}
function controls() {
  const connected = state?.players.filter((p) => p.connected).length || 0;
  $('open-phones').disabled = !state?.code;
  $('start').disabled = busy || !state?.code || connected !== 3 || state?.running;
  $('stop').disabled = busy || !state?.running;
  $('skip-minigame').disabled = busy || !state?.running || state?.phase !== 'minijeu';
  $('status').textContent = state?.code ? 'Code ' + state.code + ' — ' + connected + '/3 téléphones connectés' : 'Connexion de l’écran principal…';
  renderTools();
}
function renderTools() {
  if (!state) {
    for (const id of ['set-coins', 'give-item', 'clear-items', 'set-die', 'teleport', 'skip-minigame']) $(id).disabled = true;
    return;
  }
  if (!boardOptionsReady && state.board) {
    $('position').replaceChildren(...state.board.map((type, index) => new Option(index + ' — ' + type, index)));
    boardOptionsReady = true;
  }
  const target = state.players.find((player) => player.pseudo === $('target-player').value);
  $('target-info').textContent = target?.connected
    ? target.pieces + ' pièces · ' + target.inventaire.length + '/2 objets · case ' + target.position
    : 'Joueur non connecté.';
  $('die-status').textContent = state.nextDie ? 'Prochain lancer : ' + state.nextDie : 'Prochain lancer : aléatoire.';
  const inGame = !!state.running;
  $('set-coins').disabled = busy || !inGame || !target?.connected;
  $('give-item').disabled = busy || !inGame || !target?.connected || target.inventaire.length >= 2;
  $('clear-items').disabled = busy || !inGame || !target?.connected || target.inventaire.length === 0;
  $('set-die').disabled = busy || !inGame;
  $('teleport').disabled = busy || !inGame || state.phase !== 'attente-de' || !target?.connected;
}
async function refresh() {
  try {
    if (!id) {
      const created = await request('session', {});
      id = created.id;
      if (disposed) return;
      const selected = $('image').value;
      $('image').replaceChildren(...created.images.map((name) => new Option(name, name)));
      if (created.images.includes(selected)) $('image').value = selected;
      $('host').src = new URL('/debug/host?id=' + encodeURIComponent(id), backend).href;
      await request(id + '/settings', config());
    }
    const next = await request(id);
    if (disposed) return;
    state = next;
    controls();
  } catch (cause) {
    state = null;
    controls();
    if (cause.status === 404) id = null;
    $('status').textContent = 'Serveur indisponible : lancez node debug/server.js';
  } finally {
    if (!disposed) timer = setTimeout(refresh, 1000);
  }
}
function openPhone(player) {
  if (!id || !state?.code) return;
  const url = new URL('/debug/player', backend);
  url.search = new URLSearchParams({ id, player, code: state.code });
  const existing = phones.get(player);
  // Réouvrir ne doit ni naviguer une fenêtre valide, ni arrêter le mini-jeu.
  try {
    if (existing && !existing.window.closed && existing.url === url.href) { existing.window.focus(); return; }
    const popup = window.open(url.href, 'mayo-debug-' + id + '-' + player, 'popup,width=390,height=760,left=' + (20 + (player - 1) * 400) + ',top=60');
    if (popup) phones.set(player, { window: popup, url: url.href });
    else error('Fenêtre bloquée : utilisez les boutons Joueur 1, 2 et 3, ou autorisez les fenêtres contextuelles.');
  } catch (cause) { error('Impossible d’ouvrir le téléphone : ' + cause.message); }
}
$('open-phones').addEventListener('click', () => {
  error('');
  $('phone-links').hidden = false;
  for (let player = 1; player <= 3; player++) openPhone(player);
});
for (const button of document.querySelectorAll('[data-player]')) button.addEventListener('click', () => openPhone(Number(button.dataset.player)));
for (const input of [$('type'), $('image'), $('questions'), $('fast')]) input.addEventListener('change', () => {
  if (id) request(id + '/settings', config()).catch((cause) => error(cause.message));
});
async function tool(action, payload = {}) {
  if (!id || busy) return;
  busy = true; error(''); controls();
  try {
    await request(id + '/tools', { action, ...payload });
    state = await request(id);
    $('tool-status').textContent = 'Réglage appliqué.';
  } catch (cause) {
    $('tool-status').textContent = cause.message;
  } finally {
    busy = false; controls();
  }
}
async function command(name) {
  if (!id || busy) return;
  busy = true; error(''); controls();
  try { await request(id + '/' + name, name === 'start' ? config() : {}); state = await request(id); $('tool-status').textContent = ''; }
  catch (cause) { error(cause.message); }
  finally { busy = false; controls(); }
}
$('start').addEventListener('click', () => command('start'));
$('stop').addEventListener('click', () => command('stop'));
$('target-player').addEventListener('change', renderTools);
$('set-coins').addEventListener('click', () => tool('pieces', { pseudo: $('target-player').value, pieces: Number($('coins').value) }));
$('give-item').addEventListener('click', () => tool('item', { pseudo: $('target-player').value, itemId: $('item').value }));
$('clear-items').addEventListener('click', () => tool('clear-items', { pseudo: $('target-player').value }));
$('set-die').addEventListener('click', () => tool('die', { value: $('die').value === 'random' ? 'random' : Number($('die').value) }));
$('teleport').addEventListener('click', () => tool('position', { pseudo: $('target-player').value, position: Number($('position').value) }));
$('skip-minigame').addEventListener('click', () => tool('skip-minigame'));
window.addEventListener('pagehide', () => { disposed = true; clearTimeout(timer); });
refresh();
