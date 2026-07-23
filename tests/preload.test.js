// Known limitations:
// - (known limitation: preload.js tests rely on vi.mock('electron') with captured
//   exposedApi reference; type-guard branches tested via invalid argument calls)

import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';

// ── Mocks ──────────────────────────────────────────────────────────────────

const mockInvoke = vi.fn();
const mockSend = vi.fn();
const mockOn = vi.fn();
const mockRemoveListener = vi.fn();
let capturedApi = null;

vi.mock('electron', () => {
  const mockIpcRenderer = {
    invoke: mockInvoke,
    send: mockSend,
    on: mockOn,
    removeListener: mockRemoveListener,
  };

  // contextBridge.exposeInMainWorld should call the passed callback with the api
  // We capture the api object so tests can invoke methods on it
  const mockContextBridge = {
    exposeInMainWorld: vi.fn((_key, api) => {
      capturedApi = api;
    }),
  };

  return {
    contextBridge: mockContextBridge,
    ipcRenderer: mockIpcRenderer,
  };
});

// ── Tests ──────────────────────────────────────────────────────────────────

describe('preload.js (L13 phase 2, >=80% coverage)', () => {
  beforeAll(async () => {
    // Import triggers contextBridge.exposeInMainWorld which sets capturedApi
    await import('../preload.js');
  });

  afterAll(() => {
    vi.restoreAllMocks();
  });

  describe('contextBridge.exposeInMainWorld', () => {
    it('exposes electron API on the window', async () => {
      const electronMod = await import('electron');
      expect(electronMod.contextBridge.exposeInMainWorld).toHaveBeenCalledWith('electron', expect.any(Object));
    });

    it('exposes all expected methods', () => {
      expect(capturedApi).toHaveProperty('getSettings');
      expect(capturedApi).toHaveProperty('saveSettings');
      expect(capturedApi).toHaveProperty('getVersion');
      expect(capturedApi).toHaveProperty('sendManualCheck');
      expect(capturedApi).toHaveProperty('downloadUpdate');
      expect(capturedApi).toHaveProperty('requestRestartToUpdate');
      expect(capturedApi).toHaveProperty('skipUpdate');
      expect(capturedApi).toHaveProperty('onUpdateStatus');
      expect(capturedApi).toHaveProperty('setAutoDownload');
      expect(capturedApi).toHaveProperty('setUpdateChannel');
      expect(capturedApi).toHaveProperty('cancelUpdate');
      expect(capturedApi).toHaveProperty('saveGame');
      expect(capturedApi).toHaveProperty('loadGame');
      expect(capturedApi).toHaveProperty('deleteSave');
    });
  });

  describe('getSettings', () => {
    it('calls ipcRenderer.invoke with get-settings', async () => {
      mockInvoke.mockResolvedValueOnce({ theme: 'dark' });
      const result = await capturedApi.getSettings();
      expect(mockInvoke).toHaveBeenCalledWith('get-settings');
      expect(result).toEqual({ theme: 'dark' });
    });
  });

  describe('saveSettings', () => {
    it('calls ipcRenderer.invoke with save-settings and plain object', async () => {
      mockInvoke.mockResolvedValueOnce(true);
      const settings = { update: { channel: 'release' } };
      const result = await capturedApi.saveSettings(settings);
      expect(mockInvoke).toHaveBeenCalledWith('save-settings', settings);
      expect(result).toBe(true);
    });

    it('throws TypeError when argument is not a plain object (null)', async () => {
      expect(() => capturedApi.saveSettings(null)).toThrow(TypeError);
    });

    it('throws TypeError when argument is not a plain object (array)', async () => {
      expect(() => capturedApi.saveSettings([])).toThrow(TypeError);
    });

    it('throws TypeError when argument is not a plain object (string)', async () => {
      expect(() => capturedApi.saveSettings('not-an-object')).toThrow(TypeError);
    });

    it('throws TypeError when argument is not a plain object (number)', async () => {
      expect(() => capturedApi.saveSettings(42)).toThrow(TypeError);
    });
  });

  describe('getVersion', () => {
    it('calls ipcRenderer.invoke with get-version', async () => {
      mockInvoke.mockResolvedValueOnce('1.7.0');
      const result = await capturedApi.getVersion();
      expect(mockInvoke).toHaveBeenCalledWith('get-version');
      expect(result).toBe('1.7.0');
    });
  });

  describe('sendManualCheck', () => {
    it('calls ipcRenderer.send with check-updates', () => {
      capturedApi.sendManualCheck();
      expect(mockSend).toHaveBeenCalledWith('check-updates');
    });
  });

  describe('downloadUpdate', () => {
    it('calls ipcRenderer.send with download-update', () => {
      capturedApi.downloadUpdate();
      expect(mockSend).toHaveBeenCalledWith('download-update');
    });
  });

  describe('requestRestartToUpdate', () => {
    it('calls ipcRenderer.send with restart-to-update', () => {
      capturedApi.requestRestartToUpdate();
      expect(mockSend).toHaveBeenCalledWith('restart-to-update');
    });
  });

  describe('skipUpdate', () => {
    it('calls ipcRenderer.send with skip-update and version string', () => {
      capturedApi.skipUpdate('v1.5.0');
      expect(mockSend).toHaveBeenCalledWith('skip-update', 'v1.5.0');
    });

    it('throws TypeError when version is not a string', () => {
      expect(() => capturedApi.skipUpdate(123)).toThrow(TypeError);
    });

    it('throws TypeError when version is null', () => {
      expect(() => capturedApi.skipUpdate(null)).toThrow(TypeError);
    });
  });

  describe('onUpdateStatus', () => {
    it('calls ipcRenderer.on with update-status and returns unsubscribe', () => {
      const handler = vi.fn();
      const unsubscribe = capturedApi.onUpdateStatus(handler);

      expect(mockOn).toHaveBeenCalledWith('update-status', expect.any(Function));

      // Simulate IPC callback — the handler should unwrap _event and pass data
      const registeredHandler = mockOn.mock.calls.find((c) => c[0] === 'update-status')?.[1];
      expect(registeredHandler).toBeDefined();
      registeredHandler({}, { status: 'checking' });
      expect(handler).toHaveBeenCalledWith({ status: 'checking' });

      // Unsubscribe removes the listener
      expect(typeof unsubscribe).toBe('function');
      unsubscribe();
      expect(mockRemoveListener).toHaveBeenCalledWith('update-status', registeredHandler);
    });

    it('throws TypeError when callback is not a function', () => {
      expect(() => capturedApi.onUpdateStatus('not-a-function')).toThrow(TypeError);
    });

    it('throws TypeError when callback is null', () => {
      expect(() => capturedApi.onUpdateStatus(null)).toThrow(TypeError);
    });
  });

  describe('setAutoDownload', () => {
    it('calls ipcRenderer.send with set-auto-download and true', () => {
      capturedApi.setAutoDownload(true);
      expect(mockSend).toHaveBeenCalledWith('set-auto-download', true);
    });

    it('calls ipcRenderer.send with set-auto-download and false', () => {
      capturedApi.setAutoDownload(false);
      expect(mockSend).toHaveBeenCalledWith('set-auto-download', false);
    });

    it('throws TypeError when argument is not a boolean', () => {
      expect(() => capturedApi.setAutoDownload('yes')).toThrow(TypeError);
    });
  });

  describe('setUpdateChannel', () => {
    it('calls ipcRenderer.send with set-update-channel and channel string', () => {
      capturedApi.setUpdateChannel('pre-release');
      expect(mockSend).toHaveBeenCalledWith('set-update-channel', 'pre-release');
    });

    it('throws TypeError when argument is not a string', () => {
      expect(() => capturedApi.setUpdateChannel(123)).toThrow(TypeError);
    });
  });

  describe('cancelUpdate', () => {
    it('calls ipcRenderer.send with cancel-update', () => {
      capturedApi.cancelUpdate();
      expect(mockSend).toHaveBeenCalledWith('cancel-update');
    });
  });

  describe('saveGame', () => {
    it('calls ipcRenderer.invoke with save-game and plain object', async () => {
      mockInvoke.mockResolvedValueOnce(true);
      const data = { gold: 1000, wave: 5 };
      const result = await capturedApi.saveGame(data);
      expect(mockInvoke).toHaveBeenCalledWith('save-game', data);
      expect(result).toBe(true);
    });

    it('throws TypeError when data is not a plain object', () => {
      expect(() => capturedApi.saveGame('string-data')).toThrow(TypeError);
    });

    it('throws TypeError when data is null', () => {
      expect(() => capturedApi.saveGame(null)).toThrow(TypeError);
    });

    it('throws TypeError when data is an array', () => {
      expect(() => capturedApi.saveGame([1, 2, 3])).toThrow(TypeError);
    });
  });

  describe('loadGame', () => {
    it('calls ipcRenderer.invoke with load-game', async () => {
      mockInvoke.mockResolvedValueOnce({ gold: 1000, wave: 5 });
      const result = await capturedApi.loadGame();
      expect(mockInvoke).toHaveBeenCalledWith('load-game');
      expect(result).toEqual({ gold: 1000, wave: 5 });
    });
  });

  describe('deleteSave', () => {
    it('calls ipcRenderer.invoke with delete-save', async () => {
      mockInvoke.mockResolvedValueOnce(true);
      const result = await capturedApi.deleteSave();
      expect(mockInvoke).toHaveBeenCalledWith('delete-save');
      expect(result).toBe(true);
    });
  });
  describe('type validation branches', () => {
    it('saveGame throws for non-plain-object', () => {
      expect(() => capturedApi.saveGame(123)).toThrow(TypeError);
      expect(() => capturedApi.saveGame('string')).toThrow(TypeError);
      expect(() => capturedApi.saveGame(null)).toThrow(TypeError);
    });

    it('saveGameSlot validates slot name', () => {
      expect(() => capturedApi.saveGameSlot(123, {})).toThrow(TypeError);
      expect(() => capturedApi.saveGameSlot('', {})).toThrow(TypeError);
    });

    it('saveGameSlot validates data is plain object', () => {
      expect(() => capturedApi.saveGameSlot('mysave', 123)).toThrow(TypeError);
      expect(() => capturedApi.saveGameSlot('mysave', null)).toThrow(TypeError);
    });

    it('loadGameSlot validates slot name', () => {
      expect(() => capturedApi.loadGameSlot(123)).toThrow(TypeError);
      expect(() => capturedApi.loadGameSlot('')).toThrow(TypeError);
    });

    it('deleteSaveSlot validates slot name', () => {
      expect(() => capturedApi.deleteSaveSlot(123)).toThrow(TypeError);
      expect(() => capturedApi.deleteSaveSlot('')).toThrow(TypeError);
    });
  });

  describe('valid input paths (branch coverage)', () => {
    it('saveGame with valid plain object calls mockInvoke', () => {
      capturedApi.saveGame({ key: 'value' });
      expect(mockInvoke).toHaveBeenCalledWith('save-game', { key: 'value' });
    });

    it('saveGameSlot with valid slot and data calls mockInvoke', () => {
      capturedApi.saveGameSlot('mysave', { gold: 100 });
      expect(mockInvoke).toHaveBeenCalledWith('save-game-slot', 'mysave', { gold: 100 });
    });

    it('loadGameSlot with valid slot calls mockInvoke', () => {
      capturedApi.loadGameSlot('mysave');
      expect(mockInvoke).toHaveBeenCalledWith('load-game-slot', 'mysave');
    });

    it('deleteSaveSlot with valid slot calls mockInvoke', () => {
      capturedApi.deleteSaveSlot('mysave');
      expect(mockInvoke).toHaveBeenCalledWith('delete-save-slot', 'mysave');
    });
  });
});
