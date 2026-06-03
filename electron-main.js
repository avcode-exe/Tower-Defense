const { app, BrowserWindow, Menu, dialog } = require('electron');
const path = require('path');
const { autoUpdater } = require('electron-updater');

// Remove the menu bar entirely for a cleaner look
Menu.setApplicationMenu(null);

// ── Auto-update configuration ──

// Only check/install in production (built .exe), not during `npm start`
if (!app.isPackaged) {
  // In dev, just log what would happen
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = false;
} else {
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
}

// Log level — helpful for debugging on the installed app
autoUpdater.logger = {
  info: (msg) => console.log('[auto-updater]', msg),
  warn: (msg) => console.warn('[auto-updater]', msg),
  error: (msg) => console.error('[auto-updater]', msg),
};

let mainWindow = null;

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
      contextIsolation: true
    }
  });

  mainWindow.loadFile('index.html');

  // Prevent title from being overridden by the HTML title tag
  mainWindow.on('page-title-updated', (event) => {
    event.preventDefault();
  });

  // Wait for window to fully load before checking for updates
  mainWindow.webContents.on('did-finish-load', () => {
    checkForUpdates();
  });
}

// ── Update check ──

function checkForUpdates() {
  if (!app.isPackaged) {
    console.log('[auto-updater] Skipping update check in dev mode');
    return;
  }

  // Listen for update events before calling checkForUpdates
  autoUpdater.on('checking-for-update', () => {
    console.log('[auto-updater] Checking for updates...');
  });

  autoUpdater.on('update-available', (info) => {
    console.log('[auto-updater] Update available:', info.version);
    if (mainWindow) {
      dialog.showMessageBox(mainWindow, {
        type: 'info',
        title: 'Update Available',
        message: `Version ${info.version} is available.`,
        detail: 'Downloading in the background. You will be prompted to install when ready.',
        buttons: ['OK']
      });
    }
  });

  autoUpdater.on('update-not-available', (info) => {
    console.log('[auto-updater] No update available (current: ' + app.getVersion() + ')');
  });

  autoUpdater.on('download-progress', (progress) => {
    const pct = Math.round(progress.percent);
    console.log(`[auto-updater] Downloading... ${pct}%`);
  });

  autoUpdater.on('update-downloaded', (info) => {
    console.log('[auto-updater] Update downloaded:', info.version);
    if (mainWindow) {
      dialog.showMessageBox(mainWindow, {
        type: 'question',
        title: 'Update Ready',
        message: `Version ${info.version} has been downloaded.`,
        detail: 'Restart the app to install the update.',
        buttons: ['Restart Now', 'Later']
      }).then(({ response }) => {
        if (response === 0) {
          autoUpdater.quitAndInstall();
        }
      });
    }
  });

  autoUpdater.on('error', (err) => {
    console.error('[auto-updater] Error:', err.message);
  });

  // Check now (and every 60 minutes after)
  autoUpdater.checkForUpdates();
  setInterval(() => {
    autoUpdater.checkForUpdates();
  }, 60 * 60 * 1000);
}

// ── App lifecycle ──

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});