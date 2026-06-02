// Bootstrap: wire up the canvas and start the game once all scripts have
// loaded. (We rely on <script> tag order in index.html so that classes /
// globals are defined when this runs.)

window.addEventListener('DOMContentLoaded', () => {
  const canvas = document.getElementById('game');
  if (!canvas) return;
  const game = new Game(canvas);
  new Input(canvas, game);
  game.start();
});
