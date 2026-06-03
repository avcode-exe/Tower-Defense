// Bootstrap: wire up the canvas and start the game once all scripts have
// loaded. (We rely on <script> tag order in index.html so that classes /
// globals are defined when this runs.)

window.addEventListener('DOMContentLoaded', () => {
  const canvas = document.getElementById('game');
  if (!canvas) return;
  const game = new Game(canvas);
  new Input(canvas, game);
  game.start();

  // Pre-build the offscreen cache before game starts for startup performance.
  RENDERER._rebuildCache(game.grid);

  // Wire up the help toggle button
  const helpToggle = document.getElementById('help-toggle');
  const helpEl = document.getElementById('help');
  if (helpToggle && helpEl) {
    helpToggle.addEventListener('click', () => {
      const collapsed = UI_LAYOUT.collapsed.help;
      UI_LAYOUT.collapsed.help = !collapsed;
      helpEl.style.display = collapsed ? '' : 'none';
    });
  }

  // Populate hotkey list in the help panel.
  const hotkeyList = document.getElementById('hotkey-list');
  if (hotkeyList && typeof TROOP_SPECS !== 'undefined') {
    TROOP_SPECS.forEach(spec => {
      const li = document.createElement('li');
      li.textContent = spec.hotkey + ' – ' + spec.name;
      hotkeyList.appendChild(li);
    });
  }
});
