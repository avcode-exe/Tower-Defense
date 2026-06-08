const { app, BrowserWindow, Menu, dialog, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const { autoUpdater } = require('electron-updater');

Menu.setApplicationMenu(null);

const SETTINGS_PATH = path.join(app.getPath('userData'), 'settings.json');
const SAVE_PATH = path.join(app.getPath('userData'), 'game-save.json');
const DEFAULT_SETTINGS = {
  version: app.getVersion(),
  update: {
    channel: 'release',
    autoDownload: true,
    checkOnStartup: true,
    checkIntervalMinutes: 60,
    skippedVersions: [],
    showProgressBar: true,
    availableVersion: null,
    releaseType: null,
  },
  collapsed: { hud: false, shop: false, preview: false, shieldShop: false, help: true, monsterInfo: true, settings: true },
};

let mainWindow = null;
let updateCheckInterval = null;
let skippedVersions = [];

function readSettings() {
  try {
    if (fs.existsSync(SETTINGS_PATH)) {
      const raw = fs.readFileSync(SETTINGS_PATH, 'utf-8');
      return JSON.parse(raw);
    }
  } catch (err) {
    console.error('[settings] read failed:', err);
  }
  return JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
}

function writeSettings(settings) {
  try {
    fs.mkdirSync(path.dirname(SETTINGS_PATH), { recursive: true });
    fs.writeFileSync(SETTINGS_PATH, JSON.stringify(settings, null, 2), 'utf-8');
    return true;
  } catch (err) {
    console.error('[settings] write failed:', err);
    return false;
  }
}

function getChannelFromVersion(version) {
  const v = (version || '').toLowerCase();
  if (/-beta\./.test(v) || /-alpha\./.test(v) || /-rc\./.test(v)) return 'pre-release';
  return 'release';
}

function sendStatus(phase, extra = {}) {
  if (!mainWindow) return;
  mainWindow.webContents.send('update-status', { phase, ...extra });
}

function shouldAnnounceToUser(info, settings) {
  const channel = getChannelFromVersion(info.version);
  if (settings.update.channel === 'release' && channel === 'pre-release') return false;
  if ((settings.update.skippedVersions || []).includes(info.version)) return false;
  return true;
}

autoUpdater.logger = {
  info: (msg) => console.log('[auto-updater]', msg),
  warn: (msg) => console.warn('[auto-updater]', msg),
  error: (msg) => console.error('[auto-updater]', msg),
};

autoUpdater.autoDownload = false;
autoUpdater.autoInstallOnAppQuit = false;

autoUpdater.on('checking-for-update', () => {
  sendStatus('checking');
});

autoUpdater.on('update-available', (info) => {
  const settings = readSettings();
  const channel = getChannelFromVersion(info.version);
  info.type = channel;
  if (shouldAnnounceToUser(info, settings)) {
    sendStatus('available', { version: info.version, type: channel });
  } else {
    console.log('[auto-updater] filtered (channel/skipped):', info.version, channel);
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
  const errMsg = err ? (err.message || err.toString()) : 'Unknown error';
  sendStatus('error', { message: errMsg });
});

ipcMain.handle('get-settings', () => {
  return readSettings();
});

ipcMain.handle('save-settings', (_event, settings) => {
  return writeSettings(settings);
});

ipcMain.on('check-updates', () => {
  if (!app.isPackaged) return;
  autoUpdater.checkForUpdates().catch((err) => {
    sendStatus('error', { message: err?.message || String(err) });
  });
});

ipcMain.on('download-update', () => {
  if (!app.isPackaged) return;
  autoUpdater.downloadUpdate().catch((err) => {
    sendStatus('error', { message: err?.message || String(err) });
  });
});

ipcMain.on('skip-update', (_event, version) => {
  skippedVersions = skippedVersions || [];
  if (!skippedVersions.includes(version)) skippedVersions.push(version);
});

ipcMain.on('restart-to-update', () => {
  autoUpdater.quitAndInstall();
});

ipcMain.on('set-auto-download', (_event, enabled) => {
  autoUpdater.autoDownload = !!enabled;
  autoUpdater.autoInstallOnAppQuit = !!enabled;
});

ipcMain.handle('save-game', (_event, data) => {
  try {
    fs.mkdirSync(path.dirname(SAVE_PATH), { recursive: true });
    fs.writeFileSync(SAVE_PATH, JSON.stringify(data, null, 2), 'utf-8');
    return true;
  } catch (err) {
    console.error('[save] failed:', err);
    return false;
  }
});

ipcMain.handle('load-game', () => {
  try {
    if (fs.existsSync(SAVE_PATH)) {
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
  } catch (err) {
    console.error('[save] delete failed:', err);
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
    checkForUpdates();
  });
}

function checkForUpdates() {
  if (!app.isPackaged) return;
  autoUpdater.checkForUpdates().catch((err) => {
    const errMsg = err ? (err.message || String(err)) : 'Unknown error';
    sendStatus('error', { message: errMsg });
  });
  if (!updateCheckInterval) {
    updateCheckInterval = setInterval(() => {
      autoUpdater.checkForUpdates().catch((err) => {
        sendStatus('error', { message: err?.message || String(err) });
      });
    }, 60 * 60 * 1000);
  }
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => app.quit());

app.on('before-quit', () => {
  if (updateCheckInterval) { clearInterval(updateCheckInterval); updateCheckInterval = null; }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
