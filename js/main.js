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
    try {
      saveData = await window.electron.loadGame();
    } catch (err) {
      console.error('[main] loadGame failed:', err);
      saveData = null;
    }
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
      const settings = await window.electron.getSettings();
      if (settings && settings.collapsed) persistedCollapsed = settings.collapsed;
    } catch (err) { /* non-Electron or first launch */ }
  }
  if (typeof UI_LAYOUT !== 'undefined') {
    Object.assign(UI_LAYOUT.collapsed, persistedCollapsed);
  }

  const barBtnFor = { help: 'bar-controls-btn', monsterInfo: 'bar-monster-btn', settings: 'bar-settings-btn', about: 'bar-about-btn' };
  const popupFor = { help: 'controls-popup', monsterInfo: 'monster-popup', settings: 'settings-popup', about: 'about-popup' };

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

  async function persistCollapsed() {
    if (window.electron && window.electron.saveSettings) {
      try {
        const settings = await window.electron.getSettings() || {};
        if (!settings.collapsed) settings.collapsed = {};
        Object.assign(settings.collapsed, UI_LAYOUT.collapsed);
        window.electron.saveSettings(settings);
      } catch (err) { /* ignore */ }
    }
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

  // ── settings helpers ─────────────────────────────────────────────────────
  async function loadSettings() {
    if (!window.electron || !window.electron.getSettings) return null;
    try { return await window.electron.getSettings(); } catch { return null; }
  }

  // ── settings form (draft-based, saves only on Save click) ──────────────
  let settingsDraft = {};

  async function loadSettingsToForm() {
    const saved = await loadSettings() || {};
    settingsDraft = JSON.parse(JSON.stringify(saved));
    if (!settingsDraft.update) settingsDraft.update = {};
    // Apply defaults to draft
    settingsDraft.update.channel = settingsDraft.update.channel || 'release';
    settingsDraft.update.autoDownload = settingsDraft.update.autoDownload !== false;
    settingsDraft.update.checkIntervalMinutes = settingsDraft.update.checkIntervalMinutes || 60;
    // Update form elements
    document.querySelectorAll('input[name="settings-channel"]').forEach((radio) => {
      radio.checked = (settingsDraft.update.channel === radio.value);
    });
    const autoDl = document.getElementById('settings-auto-download');
    if (autoDl) autoDl.checked = settingsDraft.update.autoDownload;
    const intervalInput = document.getElementById('settings-interval');
    if (intervalInput) intervalInput.value = settingsDraft.update.checkIntervalMinutes;
  }

  // Load initial values
  await loadSettingsToForm();

  // Wire up input listeners (update draft only)
  document.querySelectorAll('input[name="settings-channel"]').forEach((radio) => {
    radio.addEventListener('change', () => {
      settingsDraft.update.channel = radio.value;
    });
  });

  const autoDl = document.getElementById('settings-auto-download');
  if (autoDl) {
    autoDl.addEventListener('change', () => {
      settingsDraft.update.autoDownload = autoDl.checked;
    });
  }

  const intervalInput = document.getElementById('settings-interval');
  if (intervalInput) {
    intervalInput.addEventListener('change', () => {
      settingsDraft.update.checkIntervalMinutes = parseInt(intervalInput.value, 10) || 60;
    });
  }

  // Save button
  const saveBtn = document.getElementById('settings-save-btn');
  const saveStatus = document.getElementById('settings-save-status');
  if (saveBtn) {
    saveBtn.addEventListener('click', async () => {
      if (window.electron && window.electron.saveSettings) {
        await window.electron.saveSettings(JSON.parse(JSON.stringify(settingsDraft)));
      }
      if (window.electron && window.electron.setAutoDownload) {
        window.electron.setAutoDownload(settingsDraft.update.autoDownload !== false);
      }
      if (window.electron && window.electron.setUpdateChannel) {
        window.electron.setUpdateChannel(settingsDraft.update.channel || 'release');
      }
      // Visual feedback: flash "✓ Saved" text
      if (saveStatus) {
        saveStatus.style.opacity = '1';
        setTimeout(() => { saveStatus.style.opacity = '0'; }, 1500);
      }
      // Brief button flash
      saveBtn.style.background = '#3fb950';
      setTimeout(() => { saveBtn.style.background = '#238636'; }, 400);
    });
  }

  // Cancel button
  const cancelBtn = document.getElementById('settings-cancel-btn');
  if (cancelBtn) {
    cancelBtn.addEventListener('click', () => {
      loadSettingsToForm();
    });
  }

  // Check Now button — syncs channel first, then triggers check
  const checkNowBtn = document.getElementById('settings-check-now-btn');
  if (checkNowBtn) {
    checkNowBtn.addEventListener('click', async () => {
      // Sync the current draft settings to main process before checking
      if (window.electron && window.electron.saveSettings) {
        await window.electron.saveSettings(JSON.parse(JSON.stringify(settingsDraft)));
      }
      if (window.electron && window.electron.setUpdateChannel) {
        window.electron.setUpdateChannel(settingsDraft.update.channel || 'release');
      }
      if (window.electron && window.electron.setAutoDownload) {
        window.electron.setAutoDownload(settingsDraft.update.autoDownload !== false);
      }
      // Small delay to let main process apply the settings
      setTimeout(() => {
        if (window.electron && window.electron.sendManualCheck) {
          window.electron.sendManualCheck();
        }
      }, 100);
    });
  }

  // Sync update channel on startup
  if (window.electron && window.electron.setUpdateChannel) {
    window.electron.setUpdateChannel(settingsDraft.update.channel || 'release');
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

  // ── UpdateManager ──────────────────────────────────────────────────────────
  if (typeof UpdateManager === 'function') {
    const settings = await loadSettings() || {};
    window.updateManager = new UpdateManager(settings);
    window.updateManager.init();
  }

  // ── About version display ───────────────────────────────────────────────
  const aboutVersionEl = document.getElementById('about-version');
  if (aboutVersionEl) {
    const ver = (window.updateManager && window.updateManager.settings && window.updateManager.settings.version) || '1.2.0';
    const typeMatch = ver.match(/-(beta|alpha|rc)\./i);
    const releaseType = typeMatch ? (typeMatch[1].toUpperCase() === 'RC' ? 'RC' : typeMatch[1].charAt(0).toUpperCase() + typeMatch[1].slice(1)) : 'Public release';
    aboutVersionEl.textContent = 'v' + ver + ' (' + releaseType + ')';
  }

  // ── Notification system ───────────────────────────────────────────────────
  const notifications = [];
  const notifyList = document.getElementById('notify-list');
  const notifyEmpty = document.getElementById('notify-empty');
  const notifyClearAll = document.getElementById('notify-clear-all');
  const notifyPanel = document.getElementById('notify-panel');
  const notifyBtn = document.getElementById('bar-notify-btn');
  const toastContainer = document.getElementById('toast-container');

  function timeAgo() {
    return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  // ── Toast popups (bottom-right, newest top, old bottom) ──────────────────
  function showToast(text, type, duration) {
    if (!toastContainer) return;
    const toast = document.createElement('div');
    toast.className = 'toast';
    const dotClass = type === 'success' ? 'success' : type === 'error' ? 'error' : type === 'warning' ? 'warning' : 'info';
    toast.innerHTML = '<span class="toast-dot ' + dotClass + '"></span>' + text;
    toast.addEventListener('click', () => {
      removeToast(toast);
    });
    toastContainer.appendChild(toast);
    // Auto-fade after duration (default 4s)
    setTimeout(() => removeToast(toast), duration || 4000);
  }

  function removeToast(toast) {
    if (!toast || !toast.parentNode) return;
    toast.classList.add('toast-out');
    setTimeout(() => { if (toast.parentNode) toast.parentNode.removeChild(toast); }, 400);
  }

  // ── Notification list management ────────────────────────────────────────
  // opts: { group, actions, silent, version }
  function addNotification(text, type, group, opts) {
    opts = opts || {};
    const matchKey = group || text;
    const existing = notifications.find(n => (n.group || n.text) === matchKey);
    if (existing) {
      existing.text = text;
      existing.type = type;
      existing.time = timeAgo();
      existing.read = false;
      if (opts.actions) existing.actions = opts.actions;
      if (opts.version) existing.version = opts.version;
    } else {
      const n = { id: Date.now(), text, type: type || 'info', time: timeAgo(), read: false, group: group || null, actions: opts.actions || null, version: opts.version || null };
      notifications.unshift(n);
    }
    renderNotifications();
    // Show toast for important notifications (not progress ticks, not silent)
    if (group !== 'update-progress' && !opts.silent) {
      showToast(text, type);
    }
  }

  function replayNotification(notif) {
    showToast(notif.text, notif.type, 5000);
  }

  function renderNotifications() {
    if (!notifyList || !notifyEmpty) return;
    notifyEmpty.style.display = notifications.length === 0 ? 'block' : 'none';
    notifyList.innerHTML = '';
    for (const n of notifications) {
      const div = document.createElement('div');
      div.className = 'notify-item' + (n.read ? '' : ' unread');
      const dotClass = n.type === 'success' ? 'success' : n.type === 'error' ? 'error' : n.type === 'warning' ? 'warning' : '';

      // Build inner HTML: dot + text block + time
      const textDiv = document.createElement('div');
      textDiv.className = 'notify-text';
      textDiv.textContent = n.text;

      const timeDiv = document.createElement('div');
      timeDiv.className = 'notify-time';
      timeDiv.textContent = n.time;

      const dotDiv = document.createElement('div');
      dotDiv.className = 'notify-dot ' + dotClass;

      const contentRow = document.createElement('div');
      contentRow.style.cssText = 'display:flex; align-items:flex-start; gap:8px; flex:1;';
      contentRow.appendChild(dotDiv);
      contentRow.appendChild(textDiv);
      contentRow.appendChild(timeDiv);

      div.appendChild(contentRow);

      // Render action buttons if present
      if (n.actions && n.actions.length > 0) {
        const actionBar = document.createElement('div');
        actionBar.className = 'notify-action-bar';
        for (const action of n.actions) {
          const btn = document.createElement('button');
          btn.className = 'notify-action-btn' + (action.secondary ? ' secondary' : '');
          btn.textContent = action.label;
          btn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (action.handler) action.handler(n);
          });
          actionBar.appendChild(btn);
        }
        div.appendChild(actionBar);
      }

      // Click on the notification text area to replay toast (not on buttons)
      div.addEventListener('click', () => {
        n.read = true;
        renderNotifications();
        replayNotification(n);
      });
      notifyList.appendChild(div);
    }
  }

  // ── Actions for update-available notification ──────────────────────────
  function handleUpdateDownload(notif) {
    // Start the download
    if (window.updateManager) window.updateManager.download();
    // Update the notification text and remove action buttons
    notif.text = 'Downloading v' + (notif.version || '') + '…';
    notif.actions = null;
    notif.read = true;
    renderNotifications();
  }

  function handleUpdateSkip(notif) {
    const ver = notif.version || null;
    if (ver && window.electron && window.electron.skipUpdate) window.electron.skipUpdate(ver);
    if (window.updateManager) window.updateManager.skip(ver);
    if (window.electron && window.electron.cancelUpdate) window.electron.cancelUpdate();
    // Remove this notification
    const idx = notifications.indexOf(notif);
    if (idx >= 0) notifications.splice(idx, 1);
    renderNotifications();
  }

  if (notifyClearAll) {
    notifyClearAll.addEventListener('click', () => {
      notifications.length = 0;
      renderNotifications();
    });
  }

  // ── Position notification panel above bar (centered) ─────────────────────
  function positionNotifyPanel() {
    if (!notifyPanel || !notifyBtn) return;
    const bar = document.getElementById('panel-bar');
    const barRect = bar ? bar.getBoundingClientRect() : { left: 0, right: window.innerWidth, top: window.innerHeight - 44 };
    notifyPanel.style.position = 'fixed';
    notifyPanel.style.bottom = (window.innerHeight - barRect.top + 6) + 'px';
    notifyPanel.style.left = '50%';
    notifyPanel.style.transform = 'translateX(-50%)';
    notifyPanel.style.right = 'auto';
  }

  // Toggle notification panel
  if (notifyBtn) {
    notifyBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      // Close other popups
      Object.keys(popupFor).forEach(k => hidePopup(k));
      if (notifyPanel) {
        const visible = notifyPanel.style.display === 'block';
        if (!visible) positionNotifyPanel();
        notifyPanel.style.display = visible ? 'none' : 'block';
      }
    });
  }

  // Close notification panel on outside click
  document.addEventListener('click', (e) => {
    if (notifyPanel && notifyPanel.style.display === 'block'
        && !notifyPanel.contains(e.target) && e.target !== notifyBtn && !notifyBtn.contains(e.target)) {
      notifyPanel.style.display = 'none';
    }
  });

  // Hook into update manager status events for notifications
  if (window.electron && window.electron.onUpdateStatus) {
    window.electron.onUpdateStatus((data) => {
      switch (data.phase) {
        case 'checking':
          addNotification('Checking for updates…', 'info');
          break;
        case 'available': {
          const label = 'v' + data.version + (data.type === 'pre-release' ? ' (pre-release)' : ' (release)');
          // Add notification with Update + Skip action buttons (silent — no toast)
          addNotification('Update available: ' + label, 'info', 'update-available', {
            version: data.version,
            actions: [
              { label: 'Update', handler: (n) => handleUpdateDownload(n) },
              { label: 'Skip', secondary: true, handler: (n) => handleUpdateSkip(n) },
            ],
            silent: true,
          });
          // Also show a brief toast to draw attention
          showToast('Update available: ' + label, 'info', 5000);
          break;
        }
        case 'not-available':
          addNotification('You\'re up to date.', 'success');
          break;
        case 'progress': {
          const ver = (window.updateManager && window.updateManager.getAnnouncedVersion()) || '';
          addNotification('Downloading' + (ver ? ' v' + ver : '') + ' — ' + Math.round(data.percent || 0) + '%', 'info', 'update-progress');
          break;
        }
        case 'downloaded': {
          // Remove the progress notification
          const idx = notifications.findIndex(n => n.group === 'update-progress');
          if (idx >= 0) notifications.splice(idx, 1);
          // Add ready notification with Restart action
          addNotification('v' + data.version + ' ready to install.', 'success', 'update-ready', {
            version: data.version,
            actions: [
              { label: 'Restart & Install', handler: () => { if (window.updateManager) window.updateManager.restart(); } },
            ],
          });
          break;
        }
        case 'error':
          addNotification('Update error: ' + (data.message || 'Unknown'), 'error');
          break;
      }
    });
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

});
