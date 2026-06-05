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
      UI_LAYOUT.collapsed.help = !UI_LAYOUT.collapsed.help;
      helpEl.classList.toggle('collapsed', UI_LAYOUT.collapsed.help);
      helpToggle.textContent = UI_LAYOUT.collapsed.help ? 'Controls ▸' : 'Controls ▾';
    });
  }

  // Wire up the monster info toggle button
  const monsterInfoToggle = document.getElementById('monster-info-toggle');
  const monsterInfoEl = document.getElementById('monster-info');
  if (monsterInfoToggle && monsterInfoEl) {
    monsterInfoToggle.addEventListener('click', () => {
      UI_LAYOUT.collapsed.monsterInfo = !UI_LAYOUT.collapsed.monsterInfo;
      monsterInfoEl.classList.toggle('collapsed', UI_LAYOUT.collapsed.monsterInfo);
      monsterInfoToggle.textContent = UI_LAYOUT.collapsed.monsterInfo ? 'Monsters ▸' : 'Monsters ▾';
    });
  }

  // Populate monster info table from MONSTER_SPECS
  const monsterInfoContent = document.getElementById('monster-info-content');
  if (monsterInfoContent && typeof MONSTER_SPECS !== 'undefined') {
    const order = [1, 2, 'S', 3, 4, 5, 'B'];
    for (const key of order) {
      const spec = MONSTER_SPECS[key];
      if (!spec) continue;
      const row = document.createElement('div');
      row.className = 'monster-row';
      const dot = document.createElement('span');
      dot.className = 'monster-dot';
      dot.style.background = spec.color;
      const name = document.createElement('span');
      name.className = 'monster-name';
      name.textContent = spec.name;
      const stats = document.createElement('span');
      stats.className = 'monster-stats';
      const _span = t => { const e = document.createElement('span'); e.textContent = t; return e; };
      stats.appendChild(_span('HP:' + spec.hp));
      stats.appendChild(_span('Spd:' + spec.speed));
      stats.appendChild(_span('+' + spec.reward + 'g'));
      stats.appendChild(_span('Leak:' + spec.leak));
      if (spec.shield) stats.appendChild(_span('Shield:' + spec.shield));
      row.appendChild(dot);
      row.appendChild(name);
      row.appendChild(stats);
      monsterInfoContent.appendChild(row);
    }
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
