import { Game } from './game.js';
import { RENDERER } from './rendering/renderer.js';
import { Input } from './input.js';
import { UpdateManager } from './updateManager.js';
import { UI_LAYOUT } from './ui/index.js';
import { MONSTER_SPECS, MONSTER_DEV_ORDER } from './config.js';
import { AUDIO } from './audio.js';
import { SaveSerializer } from './gamePersistence.js';
import { showToast } from './ui/toast.js';

let game = null;

// Bootstrap: wire up the canvas and start the game
document.addEventListener('DOMContentLoaded', async () => {
  const canvas = document.getElementById('game');
  if (!canvas) return;
  game = new Game(canvas);
  window.game = game;
  const input = new Input(canvas, game);
  window.input = input;
  let updateDevSpawnCounts = () => {};

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
      if (saveData && !SaveSerializer.isValid(saveData)) {
        console.warn('[main] Ignoring invalid save data');
        saveData = null;
      }
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
      loadNoBtn.onclick = async () => {
        // Delete the save data when starting new
        if (window.electron && window.electron.deleteSave) {
          await window.electron.deleteSave();
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
    } catch (err) {
      /* non-Electron or first launch */
    }
  }
  Object.assign(UI_LAYOUT.collapsed, persistedCollapsed);

  const barBtnFor = {
    help: 'bar-controls-btn',
    monsterInfo: 'bar-monster-btn',
    settings: 'bar-settings-btn',
    about: 'bar-about-btn',
    dev: 'bar-dev-btn',
  };
  const popupFor = {
    help: 'controls-popup',
    monsterInfo: 'monster-popup',
    settings: 'settings-popup',
    about: 'about-popup',
    dev: 'dev-popup',
  };

  // Close animation duration (must match CSS .bar-popup transition)
  const POPUP_ANIM_MS = 300;

  function showPopup(key) {
    const popup = document.getElementById(popupFor[key]);
    const btn = document.getElementById(barBtnFor[key]);
    if (!popup) return;
    // Find any currently-open popup (not this one) and close it first.
    const openKey = Object.keys(popupFor).find((k) => k !== key && !UI_LAYOUT.collapsed[k]);
    if (openKey) {
      hidePopup(openKey);
      // After the close animation finishes, open the target.
      const openPopup = document.getElementById(popupFor[openKey]);
      if (!openPopup) {
        openTarget();
        return;
      }
      let fallbackTimer = null;
      const onDone = () => {
        openPopup.removeEventListener('transitionend', onDone);
        clearTimeout(fallbackTimer);
        openTarget();
      };
      openPopup.addEventListener('transitionend', onDone);
      // Fallback if transitionend never fires (e.g. element hidden).
      fallbackTimer = setTimeout(openTarget, POPUP_ANIM_MS + 50);
      return;
    }
    openTarget();

    function openTarget() {
      popup.classList.remove('bar-popup--closed');
      if (btn) btn.classList.add('active');
      UI_LAYOUT.collapsed[key] = false;
    }
  }
  function hidePopup(key) {
    const popup = document.getElementById(popupFor[key]);
    const btn = document.getElementById(barBtnFor[key]);
    if (popup) popup.classList.add('bar-popup--closed');
    if (btn) btn.classList.remove('active');
    UI_LAYOUT.collapsed[key] = true;
  }

  async function persistCollapsed() {
    if (window.electron && window.electron.saveSettings) {
      try {
        const settings = (await window.electron.getSettings()) || {};
        if (!settings.collapsed) settings.collapsed = {};
        Object.assign(settings.collapsed, UI_LAYOUT.collapsed);
        window.electron.saveSettings(settings);
      } catch (err) {
        /* ignore */
      }
    }
  }

  function togglePopup(key) {
    UI_LAYOUT.collapsed[key] = !UI_LAYOUT.collapsed[key];
    if (UI_LAYOUT.collapsed[key]) hidePopup(key);
    else showPopup(key);
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
    try {
      return await window.electron.getSettings();
    } catch {
      return null;
    }
  }

  // DRY: Sync settings draft to main process (called from 3 places).
  async function syncSettingsToMainProcess() {
    if (window.electron && window.electron.saveSettings) {
      await window.electron.saveSettings(JSON.parse(JSON.stringify(settingsDraft)));
    }
    if (window.electron && window.electron.setAutoDownload) {
      window.electron.setAutoDownload(settingsDraft.update.autoDownload !== false);
    }
    if (window.electron && window.electron.setUpdateChannel) {
      window.electron.setUpdateChannel(settingsDraft.update.channel || 'release');
    }
  }

  // ── settings form (draft-based, saves only on Save click) ──────────────
  let settingsDraft = {};

  async function loadSettingsToForm() {
    const saved = (await loadSettings()) || {};
    settingsDraft = JSON.parse(JSON.stringify(saved));
    if (!settingsDraft.update) settingsDraft.update = {};
    // Apply defaults to draft
    settingsDraft.update.channel = settingsDraft.update.channel || 'release';
    settingsDraft.update.autoDownload = settingsDraft.update.autoDownload !== false;
    settingsDraft.update.checkIntervalMinutes = settingsDraft.update.checkIntervalMinutes || 60;
    // Update form elements
    document.querySelectorAll('input[name="settings-channel"]').forEach((radio) => {
      radio.checked = settingsDraft.update.channel === radio.value;
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
      await syncSettingsToMainProcess().catch((err) => {
        console.warn('[settings] failed to save settings', err);
      });
      // Visual feedback: flash "✓ Saved" text
      if (saveStatus) {
        saveStatus.style.opacity = '1';
        setTimeout(() => {
          saveStatus.style.opacity = '0';
        }, 1500);
      }
      // Brief button flash
      saveBtn.style.background = '#3fb950';
      setTimeout(() => {
        saveBtn.style.background = '#238636';
      }, 400);
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
      await syncSettingsToMainProcess().catch((err) => {
        console.warn('[settings] failed to sync settings before update check', err);
      });
      // Small delay to let main process apply the settings
      setTimeout(() => {
        if (window.electron && window.electron.sendManualCheck) {
          window.electron.sendManualCheck();
        }
      }, 100);
    });
  }

  // Sync update channel on startup
  syncSettingsToMainProcess().catch((err) => {
    console.warn('[settings] failed to sync settings to main process', err);
  });

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
  let appVersion = '1.5.2-beta.2'; // fallback
  if (window.electron && window.electron.getVersion) {
    try {
      appVersion = await window.electron.getVersion();
    } catch (_) {}
  }
  if (typeof UpdateManager === 'function') {
    const settings = (await loadSettings()) || {};
    // Always use the real app version, never the saved one
    settings.version = appVersion;
    window.updateManager = new UpdateManager(settings);
    window.updateManager.init();
  }

  // ── About version display ───────────────────────────────────────────────
  const aboutVersionEl = document.getElementById('about-version');
  if (aboutVersionEl) {
    const ver = appVersion;
    const typeMatch = ver.match(/-(beta|alpha|rc)\./i);
    const releaseType = typeMatch
      ? typeMatch[1].toUpperCase() === 'RC'
        ? 'RC'
        : typeMatch[1].charAt(0).toUpperCase() + typeMatch[1].slice(1)
      : 'Public release';
    aboutVersionEl.textContent = 'v' + ver + ' (' + releaseType + ')';
  }

  // ── Notification system ───────────────────────────────────────────────────
  const notifications = [];
  const notifyList = document.getElementById('notify-list');
  const notifyEmpty = document.getElementById('notify-empty');
  const notifyClearAll = document.getElementById('notify-clear-all');
  const notifyPanel = document.getElementById('notify-panel');
  const notifyBtn = document.getElementById('bar-notify-btn');

  function timeAgo() {
    return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  // ── Notification list management ────────────────────────────────────────
  // opts: { group, actions, silent, version }
  function addNotification(text, type, group, opts = {}) {
    const matchKey = group || text;
    const existing = notifications.find((n) => (n.group || n.text) === matchKey);
    if (existing) {
      existing.text = text;
      existing.type = type;
      existing.time = timeAgo();
      existing.read = false;
      if (opts.actions) existing.actions = opts.actions;
      if (opts.version) existing.version = opts.version;
    } else {
      const n = {
        id: Date.now(),
        text,
        type: type || 'info',
        time: timeAgo(),
        read: false,
        group: group || null,
        actions: opts.actions || null,
        version: opts.version || null,
      };
      notifications.unshift(n);
      // Cap at 50 entries to prevent unbounded growth.
      while (notifications.length > 50) {
        notifications.pop();
      }
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
      const dotClass =
        n.type === 'success' ? 'success' : n.type === 'error' ? 'error' : n.type === 'warning' ? 'warning' : '';

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
    const barRect = bar
      ? bar.getBoundingClientRect()
      : { left: 0, right: window.innerWidth, top: window.innerHeight - 44 };
    notifyPanel.style.position = 'fixed';
    notifyPanel.style.bottom = window.innerHeight - barRect.top + 6 + 'px';
    notifyPanel.style.left = '50%';
    notifyPanel.style.transform = 'translateX(-50%)';
    notifyPanel.style.right = 'auto';
  }

  // Toggle notification panel
  if (notifyBtn) {
    notifyBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      // Close other popups
      Object.keys(popupFor).forEach((k) => hidePopup(k));
      if (notifyPanel) {
        const visible = notifyPanel.style.display === 'block';
        if (!visible) positionNotifyPanel();
        notifyPanel.style.display = visible ? 'none' : 'block';
      }
    });
  }

  // Close notification panel on outside click
  document.addEventListener('click', (e) => {
    if (
      notifyPanel &&
      notifyPanel.style.display === 'block' &&
      !notifyPanel.contains(e.target) &&
      e.target !== notifyBtn &&
      !notifyBtn.contains(e.target)
    ) {
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
          addNotification("You're up to date.", 'success');
          break;
        case 'progress': {
          const ver = (window.updateManager && window.updateManager.getAnnouncedVersion()) || '';
          addNotification(
            'Downloading' + (ver ? ' v' + ver : '') + ' — ' + Math.round(data.percent || 0) + '%',
            'info',
            'update-progress'
          );
          break;
        }
        case 'downloaded': {
          // Remove the progress notification
          const idx = notifications.findIndex((n) => n.group === 'update-progress');
          if (idx >= 0) notifications.splice(idx, 1);
          // Add ready notification with Restart action
          addNotification('v' + data.version + ' ready to install.', 'success', 'update-ready', {
            version: data.version,
            actions: [
              {
                label: 'Restart & Install',
                handler: () => {
                  if (window.updateManager) window.updateManager.restart();
                },
              },
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
  if (monsterInfoContent) {
    const order = MONSTER_DEV_ORDER;
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
      const statSpan = (t) => {
        const e = document.createElement('span');
        e.textContent = t;
        return e;
      };
      stats.appendChild(statSpan('HP: ' + spec.hp));
      stats.appendChild(statSpan('Spd: ' + spec.speed));
      stats.appendChild(statSpan('+' + spec.reward + 'g'));
      stats.appendChild(statSpan('Dmg: ' + spec.damage));
      stats.appendChild(statSpan('Leak: ' + spec.leak));
      if (spec.shield)
        stats.appendChild(statSpan('Shield: ' + spec.shield + ' (max ' + Math.ceil(spec.shield * 1.5) + ')'));
      const mode = spec.attackMode || 'stop';
      if (mode === 'slow') {
        stats.appendChild(statSpan('Slow: slows near troops, attacks closest'));
      } else if (mode === 'pass') {
        stats.appendChild(statSpan('Pass: penetration, hits each troop once'));
      }
      row.appendChild(dot);
      row.appendChild(name);
      row.appendChild(stats);
      monsterInfoContent.appendChild(row);
    }
  }

  // ── populate DEV popup spawn content ─────────────────────────────────────
  const devSpawnContent = document.getElementById('dev-spawn-content');
  if (devSpawnContent) {
    const order = MONSTER_DEV_ORDER;
    const devRows = [];
    for (const key of order) {
      const spec = MONSTER_SPECS[key];
      if (!spec) continue;
      const row = document.createElement('div');
      row.style.cssText = 'display:flex; align-items:center; gap:6px; padding:2px 0; font-size:10px;';
      const dot = document.createElement('span');
      dot.style.cssText = `width:8px; height:8px; border-radius:50%; background:${spec.color}; flex-shrink:0;`;
      const label = document.createElement('span');
      label.style.cssText = 'flex:1; color:rgba(255,255,255,0.78); min-width:60px;';
      label.textContent = spec.name;
      const countSpan = document.createElement('span');
      countSpan.style.cssText = 'width:24px; text-align:center; color:rgba(255,255,255,0.6);';
      countSpan.textContent = 'x0';
      const btns = document.createElement('div');
      btns.style.cssText = 'display:flex; gap:2px;';
      for (const tag of ['-10', '-1', '+1', '+10']) {
        const btn = document.createElement('button');
        btn.style.cssText =
          'width:22px; height:18px; background:rgba(255,255,255,0.06); color:rgba(255,255,255,0.5); border:1px solid rgba(255,255,255,0.08); border-radius:3px; cursor:pointer; font-size:8px; font-family:inherit; padding:0;';
        btn.textContent = tag;
        btn.addEventListener('click', () => {
          if (game !== null) {
            const delta = parseInt(tag);
            game.devMonsterCounts[key] = Math.max(0, (game.devMonsterCounts[key] || 0) + delta);
            countSpan.textContent = 'x' + (game.devMonsterCounts[key] || 0);
          }
        });
        btns.appendChild(btn);
      }
      row.appendChild(dot);
      row.appendChild(label);
      row.appendChild(countSpan);
      row.appendChild(btns);
      devSpawnContent.appendChild(row);
      devRows.push({ key, countSpan });
    }
    // Update counts display when dev mode changes (reassigns outer variable)
    updateDevSpawnCounts = () => {
      if (game !== null) {
        for (const r of devRows) {
          r.countSpan.textContent = 'x' + (game.devMonsterCounts[r.key] || 0);
        }
      }
    };
  }

  // DEV popup buttons
  const devResetBtn = document.getElementById('dev-reset-btn');
  if (devResetBtn) {
    devResetBtn.addEventListener('click', () => {
      if (game !== null) {
        game.resetDevMonsterCounts();
        updateDevSpawnCounts();
      }
    });
  }
  const devStartBtn = document.getElementById('dev-start-btn');
  if (devStartBtn) {
    devStartBtn.addEventListener('click', () => {
      if (game !== null) {
        game.wave.buildCustomFromCounts(game.devMonsterCounts);
        if (game.state === 'PRE_WAVE' && game.wave.startNextWave()) {
          game.state = 'WAVE_ACTIVE';
          AUDIO.waveStart();
        }
      }
    });
  }
});
