const { app, BrowserWindow, Menu, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const http = require('http');
const https = require('https');
const { URL } = require('url');
const { parseUpdateInfo } = require('electron-updater/out/providers/Provider');
const { autoUpdater } = require('electron-updater');
const {
  selectNewestNewerPrereleaseTag,
  selectNewestNewerRelease,
  resolveDownloadTag,
} = require('./src/githubReleaseFeed');

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
  update: {
    channel: 'release',
    autoDownload: false,
    checkOnStartup: true,
    checkIntervalMinutes: 60,
    skippedVersions: [],
    showProgressBar: true,
    availableVersion: null,
    releaseType: null,
  },
  collapsed: {
    hud: false,
    shop: false,
    preview: false,
    shieldShop: false,
    help: true,
    monsterInfo: true,
    settings: true,
  },
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

  const sanitized = {
    update: { ...DEFAULT_SETTINGS.update },
    collapsed: { ...DEFAULT_SETTINGS.collapsed },
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
const PRERELEASE_RE = /-(?:beta|alpha|rc)\./i;

function isPrerelease(version) {
  return PRERELEASE_RE.test(version || '');
}

// Parse semver into { major, minor, patch, prerelease } for comparison.
// Handles formats like "1.5.0", "1.5.0-beta.1", "1.5.0-rc.2".
function parseVersion(v) {
  if (!v) return { major: 0, minor: 0, patch: 0, prerelease: [] };
  const match = v.match(/^(\d+)\.(\d+)\.(\d+)(?:-(.+))?$/);
  if (!match) return { major: 0, minor: 0, patch: 0, prerelease: [] };
  const prerelease = match[4] ? match[4].split('.').map((p) => (/^\d+$/.test(p) ? parseInt(p, 10) : p)) : [];
  return { major: parseInt(match[1], 10), minor: parseInt(match[2], 10), patch: parseInt(match[3], 10), prerelease };
}

// Returns true if `version` is strictly newer than `current`.
function isNewerThan(version, current) {
  const a = parseVersion(version);
  const b = parseVersion(current);
  if (a.major !== b.major) return a.major > b.major;
  if (a.minor !== b.minor) return a.minor > b.minor;
  if (a.patch !== b.patch) return a.patch > b.patch;
  // Same major.minor.patch: stable releases are newer than prereleases.
  if (a.prerelease.length === 0 && b.prerelease.length > 0) return true;
  if (a.prerelease.length > 0 && b.prerelease.length === 0) return false;
  // Both prerelease: compare lexicographically.
  const len = Math.min(a.prerelease.length, b.prerelease.length);
  for (let i = 0; i < len; i++) {
    const ap = a.prerelease[i],
      bp = b.prerelease[i];
    if (ap === bp) continue;
    if (typeof ap === 'number' && typeof bp === 'number') return ap > bp;
    return String(ap) > String(bp);
  }
  return a.prerelease.length > b.prerelease.length;
}

// Apply autoUpdater settings from persisted settings
function applyAutoUpdaterSettings() {
  const settings = readSettings();
  const update = settings.update || {};
  autoUpdater.autoDownload = update.autoDownload !== false;
  autoUpdater.autoInstallOnAppQuit = update.autoDownload !== false;
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
          if (totalSize > 1024 * 512) {
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
  if (JSON.stringify(sanitized, null, 2).length > 1024 * 100) return false; // 100KB limit
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
    const json = JSON.stringify(data, null, 2);
    if (json.length > 1024 * 1024) return false; // 1MB limit
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
