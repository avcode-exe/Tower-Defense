const { contextBridge, ipcRenderer } = require('electron');

function isPlainObject(value) {
  return Object.prototype.toString.call(value) === '[object Object]';
}

contextBridge.exposeInMainWorld('electron', {
  getSettings: () => ipcRenderer.invoke('get-settings'),
  saveSettings: (s) => {
    if (!isPlainObject(s)) {
      throw new TypeError('saveSettings expects a plain object');
    }
    return ipcRenderer.invoke('save-settings', s);
  },
  getVersion: () => ipcRenderer.invoke('get-version'),
  sendManualCheck: () => ipcRenderer.send('check-updates'),
  downloadUpdate: () => ipcRenderer.send('download-update'),
  requestRestartToUpdate: () => ipcRenderer.send('restart-to-update'),
  onUpdateStatus: (cb) => {
    if (typeof cb !== 'function') {
      throw new TypeError('onUpdateStatus expects a function');
    }
    const handler = (_event, data) => cb(data);
    ipcRenderer.on('update-status', handler);
    return () => ipcRenderer.removeListener('update-status', handler);
  },
  setAutoDownload: (v) => {
    if (typeof v !== 'boolean') {
      throw new TypeError('setAutoDownload expects a boolean');
    }
    ipcRenderer.send('set-auto-download', v);
  },
  setUpdateChannel: (ch) => {
    if (typeof ch !== 'string') {
      throw new TypeError('setUpdateChannel expects a string');
    }
    ipcRenderer.send('set-update-channel', ch);
  },
  cancelUpdate: () => ipcRenderer.send('cancel-update'),
  saveGame: (data) => {
    if (!isPlainObject(data)) {
      throw new TypeError('saveGame expects a plain object');
    }
    return ipcRenderer.invoke('save-game', data);
  },
  loadGame: () => ipcRenderer.invoke('load-game'),
  deleteSave: () => ipcRenderer.invoke('delete-save'),

  // Save rotation: named slots
  listSaves: () => ipcRenderer.invoke('list-saves'),
  saveGameSlot: (slot, data) => {
    if (typeof slot !== 'string' || !slot) {
      throw new TypeError('saveGameSlot expects a non-empty slot name');
    }
    if (!isPlainObject(data)) {
      throw new TypeError('saveGameSlot expects a plain object');
    }
    return ipcRenderer.invoke('save-game-slot', slot, data);
  },
  loadGameSlot: (slot) => {
    if (typeof slot !== 'string' || !slot) {
      throw new TypeError('loadGameSlot expects a non-empty slot name');
    }
    return ipcRenderer.invoke('load-game-slot', slot);
  },
  deleteSaveSlot: (slot) => {
    if (typeof slot !== 'string' || !slot) {
      throw new TypeError('deleteSaveSlot expects a non-empty slot name');
    }
    return ipcRenderer.invoke('delete-save-slot', slot);
  },
});
