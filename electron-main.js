import { app, BrowserWindow, Menu, ipcMain } from 'electron';
import path from 'path';
import fs from 'fs';
import os from 'os';
import http from 'http';
import https from 'https';
import { URL, fileURLToPath } from 'url';
import electronUpdater from 'electron-updater';
import {
  selectNewestNewerPrereleaseTag,
  selectNewestNewerRelease,
  resolveDownloadTag,
} from './src/githubReleaseFeed.js';
import { parseUpdateInfo } from './src/updateYamlParser.js';
import { DEFAULT_SETTINGS as RENDERER_DEFAULTS } from './src/config/settingsDefaults.js';

const { autoUpdater } = electronUpdater;
const __dirname = path.dirname(fileURLToPath(import.meta?.url || ''));

Menu.setApplicationMenu(null);

const GITHUB_OWNER = 'avcode-exe';
const GITHUB_REPO = 'Tower-Defense';
const GITHUB_RELEASES_ATOM_URL = `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/releases.atom`;

// Persistent settings path survives uninstall/reinstall (stored in user home dir)
const PERSISTENT_DIR = path.join(os.homedir(), '.tower-defense');
const PERSISTENT_SETTINGS_PATH = path.join(PERSISTENT_DIR, 'settings.json');
// App-specific paths (userData) for save data that's OK to lose on uninstall
const SETTINGS_PATH = path.join(app.getPath('userData'), 'settings.json');
const SAVE_PATH = path.join(app.getPath('userData'), 'game-save.json');
const DEFAULT_SETTINGS = {
  // Canonical source of truth for field shapes: src/config/settingsDefaults.js (renderer side).
  version: app.getVersion(),
  update: { ...RENDERER_DEFAULTS.update },
  collapsed: { ...RENDERER_DEFAULTS.collapsed },
  game: { ...RENDERER_DEFAULTS.game },
  audio: { ...RENDERER_DEFAULTS.audio },
  graphics: { ...RENDERER_DEFAULTS.graphics },
  controls: {
    scrollZoom: RENDERER_DEFAULTS.controls.scrollZoom,
    keyBindings: { ...RENDERER_DEFAULTS.controls.keyBindings },
  },
  accessibility: { ...RENDERER_DEFAULTS.accessibility },
};

const MIN_CHECK_INTERVAL_MINUTES = 15;
const FETCH_TIMEOUT_MS = 30000;
const MAX_FETCH_REDIRECTS = 5;

function normalizeCheckIntervalMinutes(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed)
    ? Math.max(MIN_CHECK_INTERVAL_MINUTES, Math.floor(parsed))
    : MIN_CHECK_INTERVAL_MINUTES;
}

function sanitizeSettings(settings) {
  if (!settings || typeof settings !== 'object' || Array.isArray(settings)) return null;

  const ALLOWED_TOP_KEYS = ['update', 'collapsed', 'game', 'audio', 'graphics', 'controls', 'accessibility'];
  const sanitized = {
    update: { ...DEFAULT_SETTINGS.update },
    collapsed: { ...DEFAULT_SETTINGS.collapsed },
    game: { ...DEFAULT_SETTINGS.game },
    audio: { ...DEFAULT_SETTINGS.audio },
    graphics: { ...DEFAULT_SETTINGS.graphics },
    controls: {
      scrollZoom: DEFAULT_SETTINGS.controls.scrollZoom,
      keyBindings: { ...DEFAULT_SETTINGS.controls.keyBindings },
    },
    accessibility: { ...DEFAULT_SETTINGS.accessibility },
  };

  function validateUpdate(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    return true;
  }

  function validateCollapsed(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    return true;
  }

  function validateGame(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    return true;
  }

  function validateAudio(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    return true;
  }

  function validateGraphics(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    return true;
  }

  function validateControls(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    return true;
  }

  function validateAccessibility(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    return true;
  }

  for (const key of Object.keys(settings)) {
    if (!ALLOWED_TOP_KEYS.includes(key)) continue;
    // Sections are initialized with defaults above; individual field
    // validation below overwrites only valid fields, preserving defaults
    // for missing/invalid entries.
  }

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
    if (Array.isArray(settings.update.skippedVersions)) {
      sanitized.update.skippedVersions = settings.update.skippedVersions.filter(
        (v) => typeof v === 'string' && v.length <= 50 && /^[a-zA-Z0-9._-]+$/.test(v)
      );
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

  if (settings.game && typeof settings.game === 'object' && !Array.isArray(settings.game)) {
    if (typeof settings.game.startingGold === 'number') {
      sanitized.game.startingGold = Math.max(0, Math.min(5000, settings.game.startingGold));
    }
    if (typeof settings.game.startingLives === 'number') {
      sanitized.game.startingLives = Math.max(1, Math.min(100, settings.game.startingLives));
    }
    if (typeof settings.game.maxWave === 'number') {
      sanitized.game.maxWave = Math.max(1, Math.min(20, settings.game.maxWave));
    }
    if (typeof settings.game.speedDefault === 'number') {
      sanitized.game.speedDefault = Math.max(1, Math.min(10, settings.game.speedDefault));
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
    if (typeof settings.accessibility.fontSizeScale === 'number') {
      sanitized.accessibility.fontSizeScale = Math.max(0.5, Math.min(2, settings.accessibility.fontSizeScale));
    }
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
    game: { ...DEFAULT_SETTINGS.game },
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
    if (loaded.game && typeof loaded.game === 'object') {
      Object.assign(defaults.game, loaded.game);
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

// Use same pre-release detection as renderer
let isPrerelease;
let parseVersion;
let isNewerThan;
(async () => {
  try {
    const mod = await import('./src/versionUtils.js');
    isPrerelease = mod.isPrerelease;
    parseVersion = mod.parseVersion;
    isNewerThan = mod.isNewerThan;
  } catch (err) {
    console.error('[versionUtils] failed to load:', err);
  }
})();

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
  try {
    const result = autoUpdater.checkForUpdates();
    if (result && typeof result.catch === 'function') {
      result.catch(handleUpdaterError);
    }
  } catch (err) {
    handleUpdaterError(err);
  }
}

function downloadUpdateSafely() {
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
  const update = settings.update || {};
  if ((update.skippedVersions || []).includes(info.version)) return false;
  const channel = update.channel || 'release';
  const currentVersion = settings.version || app.getVersion();
  const isPre = isPrerelease(info.version);
  const newer = isNewerThan(info.version, currentVersion);
  if (channel === 'release' && isPre) return false;
  if (!isPre && channel === 'pre-release' && !newer) return false;
  return newer;
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function requestText(url, redirects = 0) {
  return new Promise((resolve, reject) => {
    let parsedUrl;
    try {
      parsedUrl = new URL(url);
    } catch (err) {
      reject(err);
      return;
    }

    if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
      reject(new Error(`Unsupported protocol: ${parsedUrl.protocol}`));
      return;
    }

    const client = parsedUrl.protocol === 'https:' ? https : http;
    const req = client.get(
      parsedUrl,
      {
        headers: {
          'User-Agent': 'Tower-Defense-Updater',
          Accept: 'application/atom+xml, application/xml, text/xml',
        },
      },
      (res) => {
        if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
          res.resume();
          if (redirects >= MAX_FETCH_REDIRECTS) {
            reject(new Error(`Too many redirects for ${url}`));
            return;
          }
          let redirectUrl;
          try {
            redirectUrl = new URL(res.headers.location, parsedUrl);
          } catch (err) {
            reject(err);
            return;
          }
          requestText(redirectUrl, redirects + 1)
            .then(resolve)
            .catch(reject);
          return;
        }

        if (!res.statusCode || res.statusCode < 200 || res.statusCode >= 300) {
          res.resume();
          reject(new Error(`Request failed for ${url}: ${res.statusCode} ${res.statusMessage || ''}`.trim()));
          return;
        }

        const chunks = [];
        let totalSize = 0;
        res.on('data', (chunk) => {
          totalSize += Buffer.byteLength(chunk);
          if (totalSize > 1024 * 2048) {
            res.destroy(new Error(`Response body too large for ${url}`));
            return;
          }
          chunks.push(chunk);
        });
        res.on('end', () => resolve(chunks.join('')));
      }
    );
    req.on('error', reject);
    req.setTimeout(FETCH_TIMEOUT_MS, () => req.destroy(new Error(`Request timed out for ${url}`)));
  });
}

async function fetchText(url) {
  return requestText(url);
}

function createReleaseAssetProvider(tag) {
  const downloadBaseUrl = new URL(
    `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/releases/download/${encodeURIComponent(tag)}/`
  );

  return {
    isUseMultipleRangeRequest: false,
    getBlockMapFiles(newInstallerUrl, oldVersion, newVersion) {
      const newBlockMapUrl = new URL(`${newInstallerUrl.pathname}.blockmap`, newInstallerUrl.origin);
      const oldBlockMapUrl = new URL(
        `${newInstallerUrl.pathname.replace(new RegExp(escapeRegExp(newVersion), 'g'), oldVersion)}.blockmap`,
        newInstallerUrl.origin
      );
      return [oldBlockMapUrl, newBlockMapUrl];
    },
    resolveFiles(updateInfo) {
      return (updateInfo.files || []).map((fileInfo) => {
        if (fileInfo.sha2 == null && fileInfo.sha512 == null) {
          throw new Error(`Update info doesn't contain checksum: ${JSON.stringify(fileInfo)}`);
        }
        return {
          url: new URL(encodeURI(fileInfo.url), downloadBaseUrl),
          info: fileInfo,
        };
      });
    },
  };
}

async function getSelectedReleaseUpdateInfo(selectedRelease, tagOverride) {
  const downloadTag = tagOverride || selectedRelease.tag;
  const channelFileUrl = `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/releases/download/${encodeURIComponent(
    downloadTag
  )}/latest.yml`;
  const rawData = await fetchText(channelFileUrl);
  const updateInfo = parseUpdateInfo(rawData, 'latest.yml', channelFileUrl);
  updateInfo.tag = downloadTag;
  updateInfo.releaseName = selectedRelease.title || updateInfo.releaseName;
  return {
    info: updateInfo,
    provider: createReleaseAssetProvider(downloadTag),
  };
}

function patchGitHubPrereleaseDiscovery() {
  if (typeof autoUpdater.getUpdateInfoAndProvider !== 'function') {
    return;
  }

  const originalGetUpdateInfoAndProvider = autoUpdater.getUpdateInfoAndProvider.bind(autoUpdater);

  autoUpdater.getUpdateInfoAndProvider = async function getUpdateInfoAndProviderWithPrereleaseScan() {
    const settings = readSettings();
    if ((settings.update || {}).channel !== 'pre-release') {
      return originalGetUpdateInfoAndProvider();
    }

    try {
      const feedXml = await fetchText(GITHUB_RELEASES_ATOM_URL);
      const currentVersion = app.getVersion();
      const selectedPrerelease = selectNewestNewerPrereleaseTag(feedXml, currentVersion);
      if (selectedPrerelease) {
        const resolved = await resolveDownloadTag(GITHUB_OWNER, GITHUB_REPO, selectedPrerelease.tag);
        return getSelectedReleaseUpdateInfo(selectedPrerelease, resolved.tag);
      }

      const selectedStable = selectNewestNewerRelease(feedXml, currentVersion);
      if (selectedStable) {
        const resolved = await resolveDownloadTag(GITHUB_OWNER, GITHUB_REPO, selectedStable.tag);
        return getSelectedReleaseUpdateInfo(selectedStable, resolved.tag);
      }

      return originalGetUpdateInfoAndProvider();
    } catch (err) {
      console.warn(
        '[auto-updater] prerelease feed scan failed; falling back to electron-updater:',
        err?.message || err
      );
      return originalGetUpdateInfoAndProvider();
    }
  };
}

patchGitHubPrereleaseDiscovery();

autoUpdater.logger = {
  info: (msg) => console.log('[auto-updater]', msg),
  warn: (msg) => console.warn('[auto-updater]', msg),
  error: (msg) => console.error('[auto-updater]', msg),
};

autoUpdater.on('checking-for-update', () => {
  sendStatus('checking');
});

autoUpdater.on('update-available', (info) => {
  const settings = readSettings();
  const channel = isPrerelease(info.version) ? 'pre-release' : 'release';
  info.type = channel;
  if (shouldAnnounceToUser(info, settings)) {
    sendStatus('available', { version: info.version, type: channel });
  } else {
    console.warn('[auto-updater] filtered (channel/skipped):', info.version, channel);
  }
});

autoUpdater.on('update-not-available', () => {
  sendStatus('not-available');
});

autoUpdater.on('download-progress', (progress) => {
  sendStatus('progress', { percent: progress.percent, transferred: progress.transferred, total: progress.total });
});

autoUpdater.on('update-downloaded', (info) => {
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

ipcMain.on('skip-update', (_event, version) => {
  try {
    if (typeof version !== 'string' || version.length > 50 || !/^[a-zA-Z0-9._-]+$/.test(version)) return;
    const settings = readSettings();
    if (!settings.update) settings.update = {};
    settings.update.skippedVersions = settings.update.skippedVersions || [];
    if (!settings.update.skippedVersions.includes(version)) {
      settings.update.skippedVersions.push(version);
    }
    writeSettings(settings);
  } catch (err) {
    console.error('[update] skip failed:', formatUpdaterError(err));
  }
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

ipcMain.handle('save-game', (_event, data) => {
  try {
    if (!data || typeof data !== 'object') return false;
    const compact = JSON.stringify(data);
    if (compact.length > 1024 * 1024) return false; // 1MB limit
    const json = JSON.stringify(data, null, 2);
    fs.mkdirSync(path.dirname(SAVE_PATH), { recursive: true });
    fs.writeFileSync(SAVE_PATH, json, 'utf-8');
    return true;
  } catch (err) {
    console.error('[save] failed:', err);
    return false;
  }
});

ipcMain.handle('load-game', () => {
  try {
    if (fs.existsSync(SAVE_PATH)) {
      const stat = fs.statSync(SAVE_PATH);
      if (stat.size > 1024 * 1024) return null; // 1MB limit
      return JSON.parse(fs.readFileSync(SAVE_PATH, 'utf-8'));
    }
  } catch (err) {
    console.error('[save] load failed:', err);
  }
  return null;
});

ipcMain.handle('delete-save', () => {
  try {
    if (fs.existsSync(SAVE_PATH)) fs.unlinkSync(SAVE_PATH);
    return true;
  } catch (err) {
    console.error('[save] delete failed:', err);
    return false;
  }
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
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  mainWindow.loadFile('index.html');

  mainWindow.on('page-title-updated', (event) => event.preventDefault());

  mainWindow.webContents.on('did-finish-load', () => {
    applyAutoUpdaterSettings();
    const settings = readSettings();
    if ((settings.update || {}).checkOnStartup !== false) {
      checkForUpdates();
    }
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
