import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electron', {
  getSettings: () => ipcRenderer.invoke('get-settings'),
  saveSettings: (s) => ipcRenderer.invoke('save-settings', s),
  getVersion: () => ipcRenderer.invoke('get-version'),
  sendManualCheck: () => ipcRenderer.send('check-updates'),
  downloadUpdate: () => ipcRenderer.send('download-update'),
  requestRestartToUpdate: () => ipcRenderer.send('restart-to-update'),
  skipUpdate: (v) => ipcRenderer.send('skip-update', v),
  onUpdateStatus: (cb) => {
    const handler = (_event, data) => cb(data);
    ipcRenderer.on('update-status', handler);
    return () => ipcRenderer.removeListener('update-status', handler);
  },
  setAutoDownload: (v) => ipcRenderer.send('set-auto-download', v),
  setUpdateChannel: (ch) => ipcRenderer.send('set-update-channel', ch),
  cancelUpdate: () => ipcRenderer.send('cancel-update'),
  saveGame: (data) => ipcRenderer.invoke('save-game', data),
  loadGame: () => ipcRenderer.invoke('load-game'),
  deleteSave: () => ipcRenderer.invoke('delete-save'),
});
