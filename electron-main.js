const { app, BrowserWindow, Menu } = require('electron');
const path = require('path');

// Remove the menu bar entirely for a cleaner look
Menu.setApplicationMenu(null);

function createWindow() {
  const win = new BrowserWindow({
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

  win.loadFile('index.html');

  // Prevent title from being overridden by the HTML title tag
  win.on('page-title-updated', (event) => {
    event.preventDefault();
  });
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});