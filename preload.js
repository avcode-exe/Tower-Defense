const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electron', {
  getSettings: () => ipcRenderer.invoke('get-settings'),
  saveSettings: (s) => ipcRenderer.invoke('save-settings', s),
  sendManualCheck: () => ipcRenderer.send('check-updates'),
  downloadUpdate: () => ipcRenderer.send('download-update'),
  requestRestartToUpdate: () => ipcRenderer.send('restart-to-update'),
  skipUpdate: (v) => ipcRenderer.send('skip-update', v),
  onUpdateStatus: (cb) => {
    ipcRenderer.on('update-status', (_event, data) => cb(data));
  },
  setAutoDownload: (v) => ipcRenderer.send('set-auto-download', v),
});
