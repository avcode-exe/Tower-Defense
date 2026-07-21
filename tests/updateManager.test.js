// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('UpdateManager', () => {
  let UpdateManager;

  beforeAll(async () => {
    const mod = await import('../src/updateManager.js');
    UpdateManager = mod.UpdateManager;
  });

  beforeEach(() => {
    vi.useFakeTimers();
    document.body.innerHTML = `
      <div id="update-progress" style="display:none">
        <span id="update-progress-pct"></span>
        <span id="update-progress-ver"></span>
        <span id="update-progress-fill"></span>
      </div>
    `;
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  function makeSettings(overrides = {}) {
    const { update: updateOverrides, collapsed: collapsedOverrides, ...topLevel } = overrides;
    return {
      ...topLevel,
      update: {
        channel: 'release',
        autoDownload: false,
        checkOnStartup: false,
        checkIntervalMinutes: 60,
        skippedVersions: [],
        showProgressBar: true,
        availableVersion: null,
        releaseType: null,
        ...(updateOverrides || {}),
      },
      collapsed: {
        hud: false,
        shop: false,
        preview: false,
        shieldShop: false,
        help: true,
        monsterInfo: true,
        settings: true,
        about: false,
        ...(collapsedOverrides || {}),
      },
    };
  }

  it('constructor sets default settings', () => {
    const um = new UpdateManager(makeSettings());
    expect(um.settings.update.channel).toBe('release');
    expect(um.settings.update.checkIntervalMinutes).toBe(60);
  });

  it('constructor ensures skippedVersions is array', () => {
    const um = new UpdateManager({ update: { skippedVersions: null } });
    expect(Array.isArray(um.settings.update.skippedVersions)).toBe(true);
  });

  it('init registers onUpdateStatus', () => {
    const onUpdate = vi.fn(() => () => {});
    vi.stubGlobal('window', { electron: { onUpdateStatus: onUpdate } });
    const um = new UpdateManager(makeSettings());
    um.init();
    expect(onUpdate).toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it('init checks on startup when enabled', () => {
    const check = vi.fn();
    vi.stubGlobal('window', { electron: { onUpdateStatus: vi.fn(() => () => {}), sendManualCheck: check } });
    const um = new UpdateManager(makeSettings({ update: { checkOnStartup: true } }));
    um.init();
    vi.advanceTimersByTime(3000);
    expect(check).toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it('check calls sendManualCheck', () => {
    const check = vi.fn();
    vi.stubGlobal('window', { electron: { sendManualCheck: check } });
    const um = new UpdateManager(makeSettings());
    um.check();
    expect(check).toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it('_isPrerelease detects beta/alpha/rc', () => {
    const um = new UpdateManager(makeSettings());
    expect(um._isPrerelease('1.0.0-beta.1')).toBe(true);
    expect(um._isPrerelease('1.0.0-alpha.1')).toBe(true);
    expect(um._isPrerelease('1.0.0-rc.1')).toBe(true);
    expect(um._isPrerelease('1.0.0')).toBe(false);
  });

  it('shouldSkip returns true when version in list', () => {
    const um = new UpdateManager(makeSettings({ update: { skippedVersions: ['1.0.0'] } }));
    expect(um.shouldSkip('1.0.0')).toBe(true);
    expect(um.shouldSkip('1.0.1')).toBe(false);
  });

  it('download calls electron method', () => {
    const dl = vi.fn();
    vi.stubGlobal('window', { electron: { downloadUpdate: dl } });
    const um = new UpdateManager(makeSettings());
    um.download();
    expect(dl).toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it('skip adds version to list and persists', () => {
    const save = vi.fn(async () => true);
    vi.stubGlobal('window', { electron: { saveSettings: save } });
    const um = new UpdateManager(makeSettings());
    um.skip('1.0.0');
    expect(um.settings.update.skippedVersions).toContain('1.0.0');
    expect(save).toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it('skip does not add duplicates', () => {
    const um = new UpdateManager(makeSettings({ update: { skippedVersions: ['1.0.0'] } }));
    um.skip('1.0.0');
    expect(um.settings.update.skippedVersions.filter((v) => v === '1.0.0').length).toBe(1);
  });

  it('setChannel updates and persists', () => {
    const save = vi.fn(async () => true);
    vi.stubGlobal('window', { electron: { saveSettings: save, sendManualCheck: vi.fn() } });
    const um = new UpdateManager(makeSettings());
    um.setChannel('pre-release');
    expect(um.settings.update.channel).toBe('pre-release');
    expect(save).toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it('setAutoDownload updates and persists', () => {
    const save = vi.fn(async () => true);
    vi.stubGlobal('window', { electron: { saveSettings: save } });
    const um = new UpdateManager(makeSettings());
    um.setAutoDownload(true);
    expect(um.settings.update.autoDownload).toBe(true);
    expect(save).toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it('normalizes check interval', () => {
    const save = vi.fn(async () => true);
    vi.stubGlobal('window', { electron: { saveSettings: save } });
    const um = new UpdateManager(makeSettings());
    um.setCheckInterval(0);
    expect(um.settings.update.checkIntervalMinutes).toBe(15);
    um.setCheckInterval(60);
    expect(um.settings.update.checkIntervalMinutes).toBe(60);
    vi.unstubAllGlobals();
  });

  it('getCollapsed returns collapsed state', () => {
    const um = new UpdateManager(makeSettings({ collapsed: { hud: true } }));
    expect(um.getCollapsed().hud).toBe(true);
  });

  it('setCollapsed updates key and persists', () => {
    const save = vi.fn(async () => true);
    vi.stubGlobal('window', { electron: { saveSettings: save } });
    const um = new UpdateManager(makeSettings());
    um.setCollapsed('hud', true);
    expect(um.settings.collapsed.hud).toBe(true);
    expect(save).toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it('getAnnouncedVersion returns null default', () => {
    const um = new UpdateManager(makeSettings());
    expect(um.getAnnouncedVersion()).toBeNull();
  });

  it('without window.electron does not crash', () => {
    vi.stubGlobal('window', {});
    const um = new UpdateManager(makeSettings());
    expect(() => um.init()).not.toThrow();
    expect(() => um.check()).not.toThrow();
    expect(() => um.download()).not.toThrow();
    expect(() => um.restart()).not.toThrow();
    vi.unstubAllGlobals();
  });

  it('passesFilter allows newer release on release channel', () => {
    const um = new UpdateManager(makeSettings({ version: '1.0.0', update: { channel: 'release' } }));
    expect(um.passesFilter({ version: '2.0.0' })).toBe(true);
  });

  it('passesFilter rejects prerelease on release channel', () => {
    const um = new UpdateManager(makeSettings({ version: '1.0.0', update: { channel: 'release' } }));
    expect(um.passesFilter({ version: '1.5.0-beta.1' })).toBe(false);
  });

  it('passesFilter allows prerelease on pre-release channel', () => {
    const um = new UpdateManager(makeSettings({ version: '1.0.0', update: { channel: 'pre-release' } }));
    expect(um.passesFilter({ version: '1.5.0-beta.1' })).toBe(true);
  });

  it('passesFilter rejects older version', () => {
    const um = new UpdateManager(makeSettings({ version: '2.0.0', update: { channel: 'release' } }));
    expect(um.passesFilter({ version: '1.0.0' })).toBe(false);
  });

  it('_onStatus handles progress phase', () => {
    const um = new UpdateManager(makeSettings());
    um._handleProgress = vi.fn();
    um._onStatus({ phase: 'progress', percent: 50, version: '2.0.0' });
    expect(um._handleProgress).toHaveBeenCalledWith({ phase: 'progress', percent: 50, version: '2.0.0' });
  });

  it('_onStatus handles downloaded phase', () => {
    const um = new UpdateManager(makeSettings());
    um._handleDownloaded = vi.fn();
    um._onStatus({ phase: 'downloaded', version: '2.0.0' });
    expect(um._handleDownloaded).toHaveBeenCalled();
  });

  it('_onStatus handles not-available phase', () => {
    const um = new UpdateManager(makeSettings());
    expect(() => um._onStatus({ phase: 'not-available' })).not.toThrow();
  });

  it('_onStatus handles error phase', () => {
    const um = new UpdateManager(makeSettings());
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    um._onStatus({ phase: 'error', message: 'test error' });
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it('_onStatus handles unknown phase', () => {
    const um = new UpdateManager(makeSettings());
    expect(() => um._onStatus({ phase: 'unknown' })).not.toThrow();
  });

  it('_handleProgress shows progress when showProgressBar not disabled', () => {
    const um = new UpdateManager(makeSettings());
    um._showProgress = vi.fn();
    um._handleProgress({ percent: 75, version: '2.0.0' });
    expect(um._showProgress).toHaveBeenCalledWith('2.0.0', 75);
  });

  it('_handleProgress skips when showProgressBar is false', () => {
    const um = new UpdateManager(makeSettings({ update: { showProgressBar: false } }));
    um._showProgress = vi.fn();
    um._handleProgress({ percent: 75 });
    expect(um._showProgress).not.toHaveBeenCalled();
  });

  it('_showProgress updates DOM elements', () => {
    const els = {
      progressWrap: { style: { display: '' } },
      progressPct: { textContent: '' },
      progressVer: { textContent: '' },
      progressFill: { style: { width: '' } },
    };
    const um = new UpdateManager(makeSettings());
    um.els = els;
    um._showProgress('2.0.0', 50);
    expect(els.progressWrap.style.display).toBe('block');
    expect(els.progressPct.textContent).toBe('50%');
    expect(els.progressVer.textContent).toBe('2.0.0');
    expect(els.progressFill.style.width).toBe('50%');
  });

  it('_showProgress is safe when DOM elements are missing', () => {
    const um = new UpdateManager(makeSettings());
    um.els = {};
    expect(() => um._showProgress('2.0.0', 50)).not.toThrow();
  });

  it('_handleDownloaded creates restart button', () => {
    const btnContainer = { appendChild: vi.fn(), removeChild: vi.fn() };
    const els = {
      progressWrap: {
        style: { display: '' },
        querySelector: vi.fn(() => null),
        appendChild: vi.fn(),
      },
      progressPct: { textContent: '' },
      progressVer: { textContent: '' },
      progressFill: { style: { width: '' } },
    };
    const um = new UpdateManager(makeSettings());
    um.els = els;
    um.restart = vi.fn();
    um._handleDownloaded({ version: '2.0.0' });
    expect(els.progressWrap.appendChild).toHaveBeenCalled();
  });

  it('_handleDownloaded removes existing restart button', () => {
    const existingBtn = { remove: vi.fn() };
    const els = {
      progressWrap: {
        style: { display: '' },
        querySelector: vi.fn(() => existingBtn),
        appendChild: vi.fn(),
      },
      progressPct: { textContent: '' },
      progressVer: { textContent: '' },
      progressFill: { style: { width: '' } },
    };
    const um = new UpdateManager(makeSettings());
    um.els = els;
    um.restart = vi.fn();
    um._handleDownloaded({ version: '2.0.0' });
    expect(existingBtn.remove).toHaveBeenCalled();
  });

  it('_persist calls saveSettings with deep copy', () => {
    const save = vi.fn();
    vi.stubGlobal('window', { electron: { saveSettings: save } });
    const um = new UpdateManager(makeSettings());
    um._persist();
    expect(save).toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it('_hideProgress sets display none on progressWrap', () => {
    const els = { progressWrap: { style: { display: '' } } };
    const um = new UpdateManager(makeSettings());
    um.els = els;
    um._hideProgress();
    expect(els.progressWrap.style.display).toBe('none');
  });

  it('_hideProgress is safe when progressWrap is missing', () => {
    const um = new UpdateManager(makeSettings());
    um.els = {};
    expect(() => um._hideProgress()).not.toThrow();
  });

  it('passesFilter handles missing channel gracefully', () => {
    const um = new UpdateManager(makeSettings({ version: '1.0.0', update: { channel: undefined } }));
    // Default channel is 'release'
    expect(um.passesFilter({ version: '2.0.0' })).toBe(true);
  });

  it('passesFilter handles missing version gracefully', () => {
    const um = new UpdateManager(makeSettings({ update: { channel: 'release' } }));
    expect(um.passesFilter({ version: '2.0.0' })).toBe(true);
  });

  it('restart calls electron requestRestartToUpdate', () => {
    const restartFn = vi.fn();
    vi.stubGlobal('window', { electron: { requestRestartToUpdate: restartFn } });
    const um = new UpdateManager(makeSettings());
    um.restart();
    expect(restartFn).toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it('_showProgress clamps pct to 100', async () => {
    const { UpdateManager } = await import('../src/updateManager.js');
    vi.stubGlobal('document', { getElementById: vi.fn(() => null) });
    const um = new UpdateManager(makeSettings());
    expect(() => um._showProgress('1.0.0', 150)).not.toThrow();
    vi.unstubAllGlobals();
  });

  it('setCheckInterval clamps to 15 min minimum', async () => {
    const { UpdateManager } = await import('../src/updateManager.js');
    vi.stubGlobal('document', { getElementById: vi.fn(() => null) });
    const um = new UpdateManager(makeSettings());
    um.setCheckInterval(5);
    expect(um.settings.update.checkIntervalMinutes).toBeGreaterThanOrEqual(15);
    vi.unstubAllGlobals();
  });

  it('setCheckInterval with non-finite value defaults to 15', async () => {
    const { UpdateManager } = await import('../src/updateManager.js');
    vi.stubGlobal('document', { getElementById: vi.fn(() => null) });
    const um = new UpdateManager(makeSettings());
    um.setCheckInterval(NaN);
    expect(um.settings.update.checkIntervalMinutes).toBe(15);
    vi.unstubAllGlobals();
  });

  it('_handleProgress delegates to _showProgress (line 98-103)', () => {
    const um = new UpdateManager(makeSettings());
    vi.spyOn(um, '_showProgress').mockImplementation(() => {});
    um._handleProgress({ version: '2.0.0', percent: 50 });
    expect(um._showProgress).toHaveBeenCalledWith('2.0.0', 50);
  });

  it('_handleProgress skips when showProgressBar is false', () => {
    const um = new UpdateManager(makeSettings({ update: { showProgressBar: false } }));
    vi.spyOn(um, '_showProgress').mockImplementation(() => {});
    um._handleProgress({ version: '2.0.0', percent: 50 });
    expect(um._showProgress).not.toHaveBeenCalled();
  });

  it('_showProgress updates DOM elements (line 102-106)', () => {
    const els = {
      progressWrap: { style: { display: 'none' } },
      progressPct: { textContent: '' },
      progressVer: { textContent: '' },
      progressFill: { style: { width: '' } },
    };
    const um = new UpdateManager(makeSettings());
    um.els = els;
    um._showProgress('2.0.0', 75);
    expect(els.progressWrap.style.display).toBe('block');
    expect(els.progressPct.textContent).toBe('75%');
    expect(els.progressVer.textContent).toBe('2.0.0');
    expect(els.progressFill.style.width).toBe('75%');
  });

  it('_handleDownloaded creates restart button (lines 112-125)', () => {
    const els = {
      progressWrap: {
        style: { display: 'none' },
        querySelector: vi.fn(() => null),
        appendChild: vi.fn(),
      },
      progressPct: { textContent: '' },
      progressVer: { textContent: '' },
      progressFill: { style: { width: '' } },
    };
    const um = new UpdateManager(makeSettings());
    um.els = els;
    um._handleDownloaded({ version: '2.0.0' });
    expect(els.progressWrap.querySelector).toHaveBeenCalledWith('.update-restart-btn');
    expect(els.progressWrap.appendChild).toHaveBeenCalled();
  });

  it('_handleProgress skips when showProgressBar is false (lines 98-103)', () => {
    const settings = makeSettings();
    settings.update.showProgressBar = false;
    const um = new UpdateManager(settings);
    const spy = vi.spyOn(um, '_showProgress').mockImplementation(() => {});
    um._handleProgress({ version: '2.0.0', percent: 50 });
    expect(spy).not.toHaveBeenCalled();
  });

  it('_showProgress returns early when DOM elements are null (line 112-115)', () => {
    const um = new UpdateManager(makeSettings());
    um.els = { progressWrap: null, progressPct: null, progressVer: null, progressFill: null };
    expect(() => um._showProgress('2.0.0', 50)).not.toThrow();
  });

  it('_showProgress clamps pct to 100 (line 112-115)', () => {
    const els = {
      progressWrap: { style: { display: 'none' } },
      progressPct: { textContent: '' },
      progressVer: { textContent: '' },
      progressFill: { style: { width: '' } },
    };
    const um = new UpdateManager(makeSettings());
    um.els = els;
    um._showProgress('2.0.0', 150);
    expect(els.progressPct.textContent).toBe('100%');
    expect(els.progressFill.style.width).toBe('100%');
  });
});
