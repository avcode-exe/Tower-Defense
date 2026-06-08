// Bootstrap: wire up the canvas and start the game
window.addEventListener('DOMContentLoaded', async () => {
  const canvas = document.getElementById('game');
  if (!canvas) return;
  const game = new Game(canvas);
  new Input(canvas, game);

  // ── Load progress dialog ─────────────────────────────────────────────────────
  const loadDialog = document.getElementById('load-progress-dialog');
  const loadYesBtn = document.getElementById('load-progress-yes');
  const loadNoBtn = document.getElementById('load-progress-no');

  function hideLoadDialog() {
    if (loadDialog) loadDialog.style.display = 'none';
  }

  function startGame(shouldRestore, saveData) {
    hideLoadDialog();
    if (shouldRestore && saveData) {
      game.restore(saveData);
    }
    game.start();
    RENDERER._rebuildCache(game.grid);
  }

  // Check for saved game
  let saveData = null;
  if (window.electron && window.electron.loadGame) {
    saveData = await window.electron.loadGame();
  }

  if (saveData && saveData.troops && saveData.troops.length > 0) {
    // Show load progress dialog
    if (loadDialog) loadDialog.style.display = 'block';

    // Handle button clicks
    if (loadYesBtn) {
      loadYesBtn.onclick = () => startGame(true, saveData);
    }
    if (loadNoBtn) {
      loadNoBtn.onclick = () => {
        // Delete the save data when starting new
        if (window.electron && window.electron.deleteSave) {
          window.electron.deleteSave();
        }
        startGame(false, null);
      };
    }
  } else {
    // No save data, start fresh
    startGame(false, null);
  }

  // ── persisted collapsed state ──────────────────────────────────────────────
  let persistedCollapsed = {};
  if (window.electron && window.electron.getSettings) {
    try {
      const settings = window.electron.getSettings();
      if (settings && settings.collapsed) persistedCollapsed = settings.collapsed;
    } catch (err) { /* non-Electron or first launch */ }
  }
  Object.assign(UI_LAYOUT.collapsed, persistedCollapsed);

  const barBtnFor = { help: 'bar-controls-btn', monsterInfo: 'bar-monster-btn', settings: 'bar-settings-btn' };
  const popupFor = { help: 'controls-popup', monsterInfo: 'monster-popup', settings: 'settings-popup' };

function showPopup(key) {
  const popup = document.getElementById(popupFor[key]);
  const btn = document.getElementById(barBtnFor[key]);
  if (!popup) return;
  Object.keys(popupFor).forEach((otherKey) => {
    if (otherKey !== key) hidePopup(otherKey);
  });
  popup.style.display = 'block';
  if (btn) btn.classList.add('active');
}
  function hidePopup(key) {
    const popup = document.getElementById(popupFor[key]);
    const btn = document.getElementById(barBtnFor[key]);
    if (popup) popup.style.display = 'none';
    if (btn) btn.classList.remove('active');
  }
  function togglePopup(key) {
    UI_LAYOUT.collapsed[key] = !UI_LAYOUT.collapsed[key];
    if (UI_LAYOUT.collapsed[key]) hidePopup(key); else showPopup(key);
    persistCollapsed();
  }

  Object.keys(barBtnFor).forEach((key) => {
    const btn = document.getElementById(barBtnFor[key]);
    if (btn) {
      btn.addEventListener('click', () => togglePopup(key));
    }
  });

  // Always start with bar popups hidden on launch
  Object.keys(barBtnFor).forEach((key) => hidePopup(key));

  // ── settings form inputs ────────────────────────────────────────────────────
  function loadSettings() {
    if (!window.electron || !window.electron.getSettings) return null;
    try { return window.electron.getSettings(); } catch { return null; }
  }
  function persistSettings(callback) {
    if (window.electron && window.electron.saveSettings) {
      const s = loadSettings() || {};
      const updated = callback(s) || s;
      window.electron.saveSettings(updated);
    }
  }

  // channel radio buttons
  document.querySelectorAll('input[name="settings-channel"]').forEach((radio) => {
    const s = loadSettings();
    if (s && s.update) radio.checked = (s.update.channel === radio.value);
    radio.addEventListener('change', () => {
      persistSettings((s) => { if (s && s.update) s.update.channel = radio.value; return s; });
    });
  });

  // auto-download checkbox
  const autoDl = document.getElementById('settings-auto-download');
  if (autoDl) {
    const s = loadSettings();
    if (s && s.update) autoDl.checked = s.update.autoDownload !== false;
    autoDl.addEventListener('change', () => {
      persistSettings((s) => { if (s && s.update) s.update.autoDownload = autoDl.checked; return s; });
      if (window.electron && window.electron.setAutoDownload) {
        window.electron.setAutoDownload(autoDl.checked);
      }
    });
  }

  // check interval
  const intervalInput = document.getElementById('settings-interval');
  if (intervalInput) {
    const s = loadSettings();
    if (s && s.update) intervalInput.value = s.update.checkIntervalMinutes || 60;
    intervalInput.addEventListener('change', () => {
      persistSettings((s) => { if (s && s.update) s.update.checkIntervalMinutes = parseInt(intervalInput.value, 10) || 60; return s; });
    });
  }

  // ── settings accordion ──────────────────────────────────────────────────────
  document.querySelectorAll('.settings-section-header').forEach((header) => {
    header.addEventListener('click', () => {
      const targetId = header.getAttribute('data-target');
      const target = document.getElementById(targetId);
      if (!target) return;
      const hidden = target.style.display === 'none';
      target.style.display = hidden ? 'block' : 'none';
      header.textContent = header.textContent.replace(/[▸▾]$/, '') + (hidden ? '▾' : '▸');
    });
  });

  // ── update dialog buttons ──────────────────────────────────────────────────
  const downloadBtn = document.getElementById('update-download-btn');
  if (downloadBtn) {
    downloadBtn.addEventListener('click', () => {
      if (window.updateManager) window.updateManager.download();
    });
  }
  const skipLink = document.getElementById('update-skip-link');
  if (skipLink) {
    skipLink.addEventListener('click', () => {
      const ver = (window.updateManager && window.updateManager.getAnnouncedVersion()) || null;
      if (!ver) return;
      if (window.electron && window.electron.skipUpdate) window.electron.skipUpdate(ver);
      if (window.updateManager) window.updateManager.skip(ver);
      skipLink.style.display = 'none';
    });
  }

  // ── UpdateManager ──────────────────────────────────────────────────────────
  if (typeof UpdateManager === 'function') {
    const settings = loadSettings() || {};
    window.updateManager = new UpdateManager(settings);
    window.updateManager.init();
  }

  // ── populate monster info (unchanged) ──────────────────────────────────────
  const monsterInfoContent = document.getElementById('monster-info-content');
  if (monsterInfoContent && typeof MONSTER_SPECS !== 'undefined') {
    const order = [1, 2, 3, 4, 5, 'B', 'S'];
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
      const _s = (t) => { const e = document.createElement('span'); e.textContent = t; return e; };
      stats.appendChild(_s('HP:' + spec.hp));
      stats.appendChild(_s('Spd:' + spec.speed));
      stats.appendChild(_s('+' + spec.reward + 'g'));
      stats.appendChild(_s('Dmg:' + spec.damage));
      stats.appendChild(_s('Leak:' + spec.leak));
      if (spec.shield) stats.appendChild(_s('Shield:' + spec.shield + ' (max ' + Math.ceil(spec.shield * 1.5) + ')'));
      row.appendChild(dot);
      row.appendChild(name);
      row.appendChild(stats);
      monsterInfoContent.appendChild(row);
    }
  }

  // ── hotkey list (unchanged) ────────────────────────────────────────────────
  const hotkeyList = document.getElementById('hotkey-list');
  if (hotkeyList && typeof TROOP_SPECS !== 'undefined') {
    TROOP_SPECS.forEach(spec => {
      const li = document.createElement('li');
      li.textContent = spec.hotkey + ' – ' + spec.name;
      hotkeyList.appendChild(li);
    });
  }
});
