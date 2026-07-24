import { app, BrowserWindow, Menu, ipcMain } from 'electron';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { fileURLToPath } from 'url';
import electronUpdater from 'electron-updater';
import { DEFAULT_SETTINGS as RENDERER_DEFAULTS, isPrerelease, isNewerThan } from './src/config/settingsDefaults.js';
import { selectNewestNewerRelease } from './src/githubReleaseFeed.js';
import { parseUpdateInfo } from './src/updateYamlParser.js';

const { autoUpdater } = electronUpdater;
const __dirname = path.dirname(fileURLToPath(import.meta?.url || ''));

Menu.setApplicationMenu(null);

// Persistent settings path survives uninstall/reinstall (stored in user home dir)
const PERSISTENT_DIR = path.join(os.homedir(), '.tower-defense');
const PERSISTENT_SETTINGS_PATH = path.join(PERSISTENT_DIR, 'settings.json');
// App-specific paths (userData) for save data that's OK to lose on uninstall
const SETTINGS_PATH = path.join(app.getPath('userData'), 'settings.json');
const SAVE_PATH = path.join(app.getPath('userData'), 'game-save.json');
const SAVE_DIR = path.join(app.getPath('userData'), 'saves');
const DEFAULT_SETTINGS = {
  // Canonical source of truth for field shapes: src/config/settingsDefaults.js (renderer side).
  version: app.getVersion(),
  update: { ...RENDERER_DEFAULTS.update },
  collapsed: { ...RENDERER_DEFAULTS.collapsed },
  audio: { ...RENDERER_DEFAULTS.audio },
  graphics: { ...RENDERER_DEFAULTS.graphics },
  controls: {
    scrollZoom: RENDERER_DEFAULTS.controls.scrollZoom,
    keyBindings: { ...RENDERER_DEFAULTS.controls.keyBindings },
  },
  accessibility: { ...RENDERER_DEFAULTS.accessibility },
};

const MIN_CHECK_INTERVAL_MINUTES = 15;

function normalizeCheckIntervalMinutes(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed)
    ? Math.max(MIN_CHECK_INTERVAL_MINUTES, Math.floor(parsed))
    : MIN_CHECK_INTERVAL_MINUTES;
}

function sanitizeSettings(settings) {
  if (!settings || typeof settings !== 'object' || Array.isArray(settings)) return null;

  const sanitized = {
    update: { ...DEFAULT_SETTINGS.update },
    collapsed: { ...DEFAULT_SETTINGS.collapsed },
    audio: { ...DEFAULT_SETTINGS.audio },
    graphics: { ...DEFAULT_SETTINGS.graphics },
    controls: {
      scrollZoom: DEFAULT_SETTINGS.controls.scrollZoom,
      keyBindings: { ...DEFAULT_SETTINGS.controls.keyBindings },
    },
    accessibility: { ...DEFAULT_SETTINGS.accessibility },
  };

  if (settings.update && typeof settings.update === 'object' && !Array.isArray(settings.update)) {
    if (typeof settings.update.channel === 'string' && ['release', 'pre-release'].includes(settings.update.channel)) {
      sanitized.update.channel = settings.update.channel;
    }
    if (typeof settings.update.autoDownload === 'boolean') sanitized.update.autoDownload = settings.update.autoDownload;
    if (typeof settings.update.checkOnStartup === 'boolean') {
      sanitized.update.checkOnStartup = settings.update.checkOnStartup;
    }
    if (typeof settings.update.checkIntervalMinutes === 'number') {
      sanitized.update.checkIntervalMinutes = normalizeCheckIntervalMinutes(settings.update.checkIntervalMinutes);
    }

    if (typeof settings.update.showProgressBar === 'boolean') {
      sanitized.update.showProgressBar = settings.update.showProgressBar;
    }
    if (
      typeof settings.update.availableVersion === 'string' &&
      settings.update.availableVersion.length <= 50 &&
      /^[a-zA-Z0-9._-]+$/.test(settings.update.availableVersion)
    ) {
      sanitized.update.availableVersion = settings.update.availableVersion;
    }
    if (
      typeof settings.update.releaseType === 'string' &&
      settings.update.releaseType.length <= 50 &&
      /^[a-zA-Z0-9._-]+$/.test(settings.update.releaseType)
    ) {
      sanitized.update.releaseType = settings.update.releaseType;
    }
  }

  if (settings.collapsed && typeof settings.collapsed === 'object' && !Array.isArray(settings.collapsed)) {
    for (const key of Object.keys(DEFAULT_SETTINGS.collapsed)) {
      if (typeof settings.collapsed[key] === 'boolean') sanitized.collapsed[key] = settings.collapsed[key];
    }
  }

  if (settings.audio && typeof settings.audio === 'object' && !Array.isArray(settings.audio)) {
    const volumeKeys = ['masterVolume', 'sfxVolume', 'ambientVolume', 'uiVolume'];
    for (const vk of volumeKeys) {
      if (typeof settings.audio[vk] === 'number') {
        sanitized.audio[vk] = Math.max(0, Math.min(1, settings.audio[vk]));
      }
    }
    const muteKeys = ['masterMute', 'sfxMute', 'ambientMute', 'uiMute'];
    for (const mk of muteKeys) {
      if (typeof settings.audio[mk] === 'boolean') sanitized.audio[mk] = settings.audio[mk];
    }
  }

  if (settings.graphics && typeof settings.graphics === 'object' && !Array.isArray(settings.graphics)) {
    if (
      typeof settings.graphics.particleQuality === 'string' &&
      ['Low', 'Medium', 'High', 'Ultra'].includes(settings.graphics.particleQuality)
    ) {
      sanitized.graphics.particleQuality = settings.graphics.particleQuality;
    }
    if (typeof settings.graphics.resolutionScale === 'number') {
      sanitized.graphics.resolutionScale = Math.max(0.5, Math.min(2, settings.graphics.resolutionScale));
    }
    if (typeof settings.graphics.screenShake === 'number') {
      sanitized.graphics.screenShake = Math.max(0, Math.min(1, settings.graphics.screenShake));
    }
  }

  if (settings.controls && typeof settings.controls === 'object' && !Array.isArray(settings.controls)) {
    if (typeof settings.controls.scrollZoom === 'boolean') sanitized.controls.scrollZoom = settings.controls.scrollZoom;
    if (
      settings.controls.keyBindings &&
      typeof settings.controls.keyBindings === 'object' &&
      !Array.isArray(settings.controls.keyBindings)
    ) {
      for (const key of Object.keys(DEFAULT_SETTINGS.controls.keyBindings)) {
        if (
          typeof settings.controls.keyBindings[key] === 'string' &&
          settings.controls.keyBindings[key].length > 0 &&
          settings.controls.keyBindings[key].length <= 20
        ) {
          sanitized.controls.keyBindings[key] = settings.controls.keyBindings[key];
        }
      }
    }
  }

  if (settings.accessibility && typeof settings.accessibility === 'object' && !Array.isArray(settings.accessibility)) {
    if (typeof settings.accessibility.colorblindMode === 'boolean')
      sanitized.accessibility.colorblindMode = settings.accessibility.colorblindMode;
    if (typeof settings.accessibility.reducedMotion === 'boolean')
      sanitized.accessibility.reducedMotion = settings.accessibility.reducedMotion;
  }

  return sanitized;
}

function formatUpdaterError(err) {
  return err ? err.message || String(err) : 'Unknown error';
}

let mainWindow = null;
let updateCheckInterval = null;

function readSettings() {
  const defaults = {
    version: DEFAULT_SETTINGS.version,
    update: { ...DEFAULT_SETTINGS.update },
    collapsed: { ...DEFAULT_SETTINGS.collapsed },
    audio: { ...DEFAULT_SETTINGS.audio },
    graphics: { ...DEFAULT_SETTINGS.graphics },
    controls: {
      scrollZoom: DEFAULT_SETTINGS.controls.scrollZoom,
      keyBindings: { ...DEFAULT_SETTINGS.controls.keyBindings },
    },
    accessibility: { ...DEFAULT_SETTINGS.accessibility },
  };
  let loaded = null;
  // Try persistent path first (survives uninstall/reinstall)
  try {
    if (fs.existsSync(PERSISTENT_SETTINGS_PATH)) {
      const raw = fs.readFileSync(PERSISTENT_SETTINGS_PATH, 'utf-8');
      loaded = JSON.parse(raw);
    }
  } catch (err) {
    console.error('[settings] persistent read failed:', err);
  }
  // Fallback to userData (for backward compatibility)
  if (!loaded) {
    try {
      if (fs.existsSync(SETTINGS_PATH)) {
        const raw = fs.readFileSync(SETTINGS_PATH, 'utf-8');
        loaded = JSON.parse(raw);
      }
    } catch (err) {
      console.error('[settings] userData read failed:', err);
    }
  }
  if (loaded) {
    // Deep-merge loaded settings on top of defaults so every key exists
    if (loaded.update && typeof loaded.update === 'object') {
      Object.assign(defaults.update, loaded.update);
    }
    if (loaded.collapsed && typeof loaded.collapsed === 'object') {
      Object.assign(defaults.collapsed, loaded.collapsed);
    }
    if (loaded.audio && typeof loaded.audio === 'object') {
      Object.assign(defaults.audio, loaded.audio);
    }
    if (loaded.graphics && typeof loaded.graphics === 'object') {
      Object.assign(defaults.graphics, loaded.graphics);
    }
    if (loaded.controls && typeof loaded.controls === 'object') {
      if (typeof loaded.controls.scrollZoom === 'boolean') defaults.controls.scrollZoom = loaded.controls.scrollZoom;
      if (loaded.controls.keyBindings && typeof loaded.controls.keyBindings === 'object') {
        Object.assign(defaults.controls.keyBindings, loaded.controls.keyBindings);
      }
    }
    if (loaded.accessibility && typeof loaded.accessibility === 'object') {
      Object.assign(defaults.accessibility, loaded.accessibility);
    }
    // Top-level keys (e.g. version)
    if (loaded.version !== undefined) defaults.version = loaded.version;
  }
  return defaults;
}

function writeSettings(settings) {
  // Always write to persistent location (survives uninstall/reinstall)
  try {
    fs.mkdirSync(PERSISTENT_DIR, { recursive: true });
    fs.writeFileSync(PERSISTENT_SETTINGS_PATH, JSON.stringify(settings, null, 2), 'utf-8');
  } catch (err) {
    console.error('[settings] persistent write failed:', err);
    return false;
  }
  // Also write to userData for backward compatibility
  try {
    fs.mkdirSync(path.dirname(SETTINGS_PATH), { recursive: true });
    fs.writeFileSync(SETTINGS_PATH, JSON.stringify(settings, null, 2), 'utf-8');
  } catch (err) {
    console.error('[settings] userData write failed:', err);
  }
  return true;
}

const GITHUB_OWNER = 'avcode-exe';
const GITHUB_REPO = 'Tower-Defense';
const GITHUB_RELEASES_ATOM_URL = `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/releases.atom`;
const FEED_FETCH_TIMEOUT_MS = 15000;

// Store the latest update candidate so the download handler can configure autoUpdater.
let _pendingCandidate = null;

/**
 * Standalone update check that bypasses autoUpdater.checkForUpdates() entirely.
 * Uses the GitHub Atom feed (always reliable) to discover releases, then fetches
 * latest.yml from the specific release assets. The autoUpdater is only used for
 * the actual download/install (not for checking).
 */
async function checkForUpdatesDirect() {
  sendStatus('checking');

  try {
    // 1. Fetch the Atom feed directly with a timeout
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FEED_FETCH_TIMEOUT_MS);

    let feedXml;
    try {
      const response = await fetch(GITHUB_RELEASES_ATOM_URL, { signal: controller.signal });
      feedXml = await response.text();
    } finally {
      clearTimeout(timeout);
    }

    // 2. Find the latest version newer than our current version
    const settings = readSettings();
    const currentVersion = app.getVersion();

    const candidate = selectNewestNewerRelease(feedXml, currentVersion);

    if (!candidate) {
      _pendingCandidate = null;
      sendStatus('not-available');
      return;
    }

    // 3. Fetch latest.yml from the specific release assets
    const tag = candidate.tag;
    const latestYmlUrl = `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/releases/download/${encodeURIComponent(tag)}/latest.yml`;

    let ymlText;
    let usedUrl;
    try {
      const ymlResponse = await fetch(latestYmlUrl, {
        signal: AbortSignal.timeout(10000),
        redirect: 'follow',
      });
      if (!ymlResponse.ok) throw new Error(`HTTP ${ymlResponse.status}`);
      ymlText = await ymlResponse.text();
      usedUrl = latestYmlUrl;
    } catch (_) {
      // Try with flipped "v" prefix (e.g. "1.7.0" if tag was "v1.7.0", or vice versa)
      const altTag = tag.startsWith('v') ? tag.slice(1) : 'v' + tag;
      const altUrl = `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/releases/download/${encodeURIComponent(altTag)}/latest.yml`;
      const altResponse = await fetch(altUrl, {
        signal: AbortSignal.timeout(10000),
        redirect: 'follow',
      });
      if (!altResponse.ok) throw new Error(`HTTP ${altResponse.status}`);
      ymlText = await altResponse.text();
      usedUrl = altUrl;
    }

    const info = parseUpdateInfo(ymlText, 'latest.yml', usedUrl);
    const channel = isPrerelease(info.version) ? 'pre-release' : 'release';
    info.type = channel;

    if (!shouldAnnounceToUser(info, settings)) {
      _pendingCandidate = null;
      sendStatus('not-available');
      return;
    }

    // 5. Store the candidate for the download handler
    _pendingCandidate = { tag, info };

    // 6. Notify the renderer
    sendStatus('available', { version: info.version, type: channel });
  } catch (err) {
    _pendingCandidate = null;
    sendStatus('error', { message: formatUpdaterError(err) });
  }
}

// Apply autoUpdater settings from persisted settings
function applyAutoUpdaterSettings() {
  const settings = readSettings();
  const update = settings.update || {};
  autoUpdater.autoDownload = update.autoDownload !== false;
  // autoUpdater.autoInstallOnAppQuit is NOT set automatically;
  // user clicks "Restart & Install" manually after download completes.
  // Enable pre-release detection when channel is set to pre-release
  autoUpdater.allowPrerelease = update.channel === 'pre-release';
}

function sendStatus(phase, extra = {}) {
  if (!mainWindow) return;
  try {
    mainWindow.webContents.send('update-status', { phase, ...extra });
  } catch (err) {
    console.warn('[update] status send failed:', formatUpdaterError(err));
  }
}

function handleUpdaterError(err) {
  sendStatus('error', { message: formatUpdaterError(err) });
}

function checkForUpdatesSafely() {
  checkForUpdatesDirect();
}

function downloadUpdateSafely() {
  // If we have a pending candidate, configure autoUpdater to download from
  // that specific release (using the generic provider with a direct URL to
  // the release assets). This bypasses the broken /releases/latest endpoint.
  if (_pendingCandidate) {
    const { tag } = _pendingCandidate;
    const feedUrl = `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/releases/download/${encodeURIComponent(tag)}/`;
    autoUpdater.setFeedURL({
      provider: 'generic',
      url: feedUrl,
    });
  }
  try {
    const result = autoUpdater.downloadUpdate();
    if (result && typeof result.catch === 'function') {
      result.catch(handleUpdaterError);
    }
  } catch (err) {
    handleUpdaterError(err);
  }
}

function shouldAnnounceToUser(info, settings) {
  const channel = (settings.update || {}).channel || 'release';
  const currentVersion = app.getVersion();
  const isPre = isPrerelease(info.version);
  const newer = isNewerThan(info.version, currentVersion);
  if (channel === 'release' && isPre) return false;
  if (!isPre && channel === 'pre-release' && !newer) return false;
  return newer;
}

autoUpdater.logger = {
  info: (msg) => console.log('[auto-updater]', msg),
  warn: (msg) => console.warn('[auto-updater]', msg),
  error: (msg) => console.error('[auto-updater]', msg),
};

// NOTE: We no longer use autoUpdater.checkForUpdates(), so we don't listen
// for 'checking-for-update', 'update-available', or 'update-not-available'
// events. Update discovery is handled by checkForUpdatesDirect() above.
// We only use autoUpdater for downloading and installing.

autoUpdater.on('download-progress', (progress) => {
  sendStatus('progress', { percent: progress.percent, transferred: progress.transferred, total: progress.total });
});

autoUpdater.on('update-downloaded', (info) => {
  _pendingCandidate = null;
  sendStatus('downloaded', { version: info.version });
});

autoUpdater.on('error', (err) => {
  const errMsg = err ? err.message || err.toString() : 'Unknown error';
  sendStatus('error', { message: errMsg });
});

ipcMain.handle('get-settings', () => {
  return readSettings();
});

ipcMain.handle('save-settings', (_event, settings) => {
  const sanitized = sanitizeSettings(settings);
  if (!sanitized) return false;
  if (JSON.stringify(sanitized).length > 1024 * 100) return false; // 100KB limit
  return writeSettings(sanitized);
});

ipcMain.handle('get-version', () => {
  return app.getVersion();
});

ipcMain.on('check-updates', () => {
  checkForUpdatesSafely();
});

ipcMain.on('download-update', () => {
  downloadUpdateSafely();
});

ipcMain.on('restart-to-update', () => {
  try {
    autoUpdater.quitAndInstall();
  } catch (err) {
    handleUpdaterError(err);
  }
});

ipcMain.on('set-auto-download', (_event, enabled) => {
  try {
    const val = !!enabled;
    autoUpdater.autoDownload = val;
    autoUpdater.autoInstallOnAppQuit = val;
  } catch (err) {
    console.warn('[auto-updater] set auto download failed:', formatUpdaterError(err));
  }
});

ipcMain.on('set-update-channel', (_event, channel) => {
  try {
    if (typeof channel !== 'string') return;
    const allowed = ['release', 'pre-release'];
    if (!allowed.includes(channel)) return;
    autoUpdater.allowPrerelease = channel === 'pre-release';
  } catch (err) {
    console.warn('[auto-updater] set update channel failed:', formatUpdaterError(err));
  }
});

ipcMain.on('cancel-update', () => {
  try {
    if (typeof autoUpdater.cancelDownload === 'function') {
      autoUpdater.cancelDownload();
    }
  } catch (err) {
    console.warn('[auto-updater] cancel download failed:', formatUpdaterError(err));
  }
  autoUpdater.autoDownload = false;
});

// ── Save helpers ──

/** Return the file path for a save slot name (e.g. "autosave.0" → saves/autosave.0.json) */
function saveSlotPath(slot) {
  const safeName = String(slot).replace(/[^a-zA-Z0-9._-]/g, '_');
  return path.join(SAVE_DIR, safeName + '.json');
}

/** Scan the save directory and return a list of { slot, meta } entries. */
function listSaveSlots() {
  try {
    if (!fs.existsSync(SAVE_DIR)) return [];
    const entries = fs.readdirSync(SAVE_DIR, { withFileTypes: true });
    const results = [];
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith('.json')) continue;
      const slot = entry.name.slice(0, -5); // strip .json
      const fp = path.join(SAVE_DIR, entry.name);
      try {
        const stat = fs.statSync(fp);
        if (stat.size > 1024 * 1024) continue; // too large
        const raw = fs.readFileSync(fp, 'utf-8');
        const data = JSON.parse(raw);
        results.push({
          slot,
          meta: {
            timestamp: (data._meta && data._meta.timestamp) || stat.mtimeMs,
            wave: data._meta ? data._meta.wave : (data.wave && data.wave.currentWave) || 0,
            gold: data._meta ? data._meta.gold : data.gold,
            lives: data._meta ? data._meta.lives : data.lives,
            version: data._meta ? data._meta.version : data.version || '0.0.0',
            preview: (data._meta && data._meta.preview) || null,
          },
        });
      } catch (_) {
        // Skip corrupt files
        continue;
      }
    }
    return results;
  } catch (_) {
    return [];
  }
}

function readSaveSlot(slot) {
  try {
    const fp = saveSlotPath(slot);
    if (!fs.existsSync(fp)) return null;
    const stat = fs.statSync(fp);
    if (stat.size > 1024 * 1024) return null;
    return JSON.parse(fs.readFileSync(fp, 'utf-8'));
  } catch (_) {
    return null;
  }
}

function writeSaveSlot(slot, data) {
  try {
    if (!data || typeof data !== 'object') return false;
    const compact = JSON.stringify(data);
    if (compact.length > 1024 * 1024) return false;
    const json = JSON.stringify(data, null, 2);
    fs.mkdirSync(SAVE_DIR, { recursive: true });
    fs.writeFileSync(saveSlotPath(slot), json, 'utf-8');
    return true;
  } catch (_) {
    return false;
  }
}

function deleteSaveSlot(slot) {
  try {
    const fp = saveSlotPath(slot);
    if (fs.existsSync(fp)) fs.unlinkSync(fp);
    return true;
  } catch (_) {
    return false;
  }
}

// ── Legacy single-save handlers (backward compat) ──

const LEGACY_SLOT = 'autosave.0';

ipcMain.handle('save-game', (_event, data) => {
  return writeSaveSlot(LEGACY_SLOT, data);
});

ipcMain.handle('load-game', () => {
  return readSaveSlot(LEGACY_SLOT);
});

ipcMain.handle('delete-save', () => {
  return deleteSaveSlot(LEGACY_SLOT);
});

// ── Save rotation IPC handlers ──

/** List all save slots with metadata. Returns { slot, meta }[]. */
ipcMain.handle('list-saves', () => {
  return listSaveSlots();
});

/** Save data to a named slot. Returns boolean. */
ipcMain.handle('save-game-slot', (_event, slot, data) => {
  if (typeof slot !== 'string' || !slot) return false;
  return writeSaveSlot(slot, data);
});

/** Load data from a named slot. Returns parsed object or null. */
ipcMain.handle('load-game-slot', (_event, slot) => {
  if (typeof slot !== 'string' || !slot) return false;
  return readSaveSlot(slot);
});

/** Delete a named save slot. Returns boolean. */
ipcMain.handle('delete-save-slot', (_event, slot) => {
  if (typeof slot !== 'string' || !slot) return false;
  return deleteSaveSlot(slot);
});

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    title: 'Tower Defense',
    icon: path.join(__dirname, 'icon.png'),
    backgroundColor: '#000000',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.cjs'),
    },
  });

  // Enable dev tools via F12 or Ctrl+Shift+I for debugging
  mainWindow.webContents.on('before-input-event', (_event, input) => {
    if (input.key === 'F12' || (input.control && input.shift && input.key.toLowerCase() === 'i')) {
      mainWindow.webContents.toggleDevTools();
    }
  });

  mainWindow.loadFile('index.html');

  mainWindow.on('page-title-updated', (event) => event.preventDefault());

  mainWindow.webContents.on('did-finish-load', () => {
    applyAutoUpdaterSettings();
    // Startup check is handled by the renderer's updateManager (3s delay).
    // We only set up the periodic interval check from the main process.
    startPeriodicUpdateCheck();
  });
}

function checkForUpdates() {
  checkForUpdatesSafely();
}

function startPeriodicUpdateCheck() {
  if (updateCheckInterval) return;
  const settings = readSettings();
  const intervalMs = normalizeCheckIntervalMinutes((settings.update || {}).checkIntervalMinutes) * 60 * 1000;
  updateCheckInterval = setInterval(() => {
    checkForUpdatesSafely();
  }, intervalMs);
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => app.quit());

app.on('before-quit', () => {
  if (updateCheckInterval) {
    clearInterval(updateCheckInterval);
    updateCheckInterval = null;
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
