import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { UpdateManager } from '../src/updateManager.js';

// ─── Minimal DOM polyfill (needed when jsdom pragma is not applied) ────────
// Runs before every test to guarantee window/document exist even if
// a previous afterEach deleted them.

const _elStore = {};
const _makeEl = (tag) => {
  const el = {
    tagName: tag,
    id: '',
    className: '',
    textContent: '',
    innerHTML: '',
    style: { display: '', width: '', cssText: '' },
    children: [],
    _parent: null,
    addEventListener() {},
    remove() {
      if (el._parent) {
        el._parent.children = el._parent.children.filter((c) => c !== el);
        el._parent = null;
      }
    },
    appendChild(child) {
      el.children.push(child);
      child._parent = el;
    },
    querySelector(sel) {
      const cls = sel.replace('.', '');
      return el.children.find((c) => c.className === cls) || null;
    },
    querySelectorAll(sel) {
      const cls = sel.replace('.', '');
      return el.children.filter((c) => c.className === cls);
    },
    setAttribute() {},
  };
  return el;
};

function _ensureDOM() {
  if (typeof globalThis.document === 'undefined') {
    globalThis.document = {
      getElementById(id) {
        if (!_elStore[id]) {
          const el = _makeEl('div');
          el.id = id;
          _elStore[id] = el;
        }
        return _elStore[id];
      },
      createElement: _makeEl,
      body: { innerHTML: '' },
    };
  }
  if (typeof globalThis.window === 'undefined') {
    globalThis.window = { electron: null };
  }
}

beforeEach(() => _ensureDOM());

// ─── Helpers ────────────────────────────────────────────────────────────────

function mockElectron(overrides = {}) {
  const calls = { saveSettings: [], sendManualCheck: 0, downloadUpdate: 0, skipUpdate: [], requestRestartToUpdate: 0 };
  window.electron = {
    saveSettings: vi.fn((s) => {
      calls.saveSettings.push(s);
    }),
    sendManualCheck: vi.fn(() => {
      calls.sendManualCheck++;
    }),
    downloadUpdate: vi.fn(() => {
      calls.downloadUpdate++;
    }),
    requestRestartToUpdate: vi.fn(() => {
      calls.requestRestartToUpdate++;
    }),
    skipUpdate: vi.fn((v) => {
      calls.skipUpdate.push(v);
    }),
    onUpdateStatus: vi.fn(),
    ...overrides,
  };
  return calls;
}

function makeManager(settings = {}) {
  document.body.innerHTML = `
    <div id="update-progress" style="display:none"></div>
    <span id="update-progress-pct"></span>
    <span id="update-progress-ver"></span>
    <div id="update-progress-fill"></div>
  `;
  return new UpdateManager(settings);
}

function manager(version, channel) {
  return Object.assign(Object.create(UpdateManager.prototype), {
    settings: {
      version,
      update: {
        channel,
        skippedVersions: [],
      },
    },
  });
}

function managerWithState(version, channel, overrides = {}) {
  return Object.assign(Object.create(UpdateManager.prototype), {
    settings: {
      version,
      update: {
        channel,
        skippedVersions: [],
        availableVersion: null,
        ...overrides.update,
      },
      collapsed: {
        hud: false,
        shop: false,
        preview: false,
        shieldShop: false,
        help: true,
        monsterInfo: true,
        settings: true,
        ...overrides.collapsed,
      },
    },
  });
}

// ─── passesFilter (base) ────────────────────────────────────────────────────

describe('UpdateManager.passesFilter (base)', () => {
  it('rejects prereleases on the release channel', () => {
    expect(manager('1.5.0-beta.1', 'release').passesFilter({ version: '1.5.1-beta.1' })).toBe(false);
  });

  it('rejects the current stable version', () => {
    expect(manager('1.5.0', 'release').passesFilter({ version: '1.5.0' })).toBe(false);
  });

  it('accepts newer stable versions on the release channel', () => {
    expect(manager('1.5.0', 'release').passesFilter({ version: '1.5.1' })).toBe(true);
  });

  it('rejects the current prerelease version on the pre-release channel', () => {
    expect(manager('1.5.0-beta.1', 'pre-release').passesFilter({ version: '1.5.0-beta.1' })).toBe(false);
  });

  it('accepts newer prerelease versions on the pre-release channel', () => {
    expect(manager('1.5.0-beta.1', 'pre-release').passesFilter({ version: '1.5.0-beta.2' })).toBe(true);
  });
});

// ─── shouldSkip (base) ─────────────────────────────────────────────────────

describe('UpdateManager.shouldSkip (base)', () => {
  it('returns true when version is in skippedVersions', () => {
    const m = managerWithState('1.5.0', 'release', { update: { skippedVersions: ['1.4.0', '1.5.0'] } });
    expect(m.shouldSkip('1.5.0')).toBe(true);
  });

  it('returns false when version is not in skippedVersions', () => {
    const m = managerWithState('1.5.0', 'release');
    expect(m.shouldSkip('1.6.0')).toBe(false);
  });
});

// ─── _isPrerelease (base) ──────────────────────────────────────────────────

describe('UpdateManager._isPrerelease (base)', () => {
  it('returns true for versions with prerelease tags', () => {
    const m = managerWithState('1.5.0', 'release');
    expect(m._isPrerelease('1.5.0-beta.1')).toBe(true);
  });

  it('returns false for stable versions', () => {
    const m = managerWithState('1.5.0', 'release');
    expect(m._isPrerelease('1.5.0')).toBe(false);
  });
});

// ─── getCollapsed / setCollapsed (base) ────────────────────────────────────

describe('UpdateManager getCollapsed / setCollapsed (base)', () => {
  afterEach(() => {
    delete globalThis.window;
  });

  it('getCollapsed returns the collapsed state object', () => {
    const m = managerWithState('1.5.0', 'release', { collapsed: { hud: true, settings: false } });
    const collapsed = m.getCollapsed();
    expect(collapsed.hud).toBe(true);
    expect(collapsed.settings).toBe(false);
  });

  it('setCollapsed updates the collapsed state', () => {
    globalThis.window = {};
    const m = managerWithState('1.5.0', 'release');
    m.setCollapsed('shop', true);
    expect(m.settings.collapsed.shop).toBe(true);
  });
});

// ─── getAnnouncedVersion (base) ────────────────────────────────────────────

describe('UpdateManager.getAnnouncedVersion (base)', () => {
  it('returns the availableVersion when set', () => {
    const m = managerWithState('1.5.0', 'release', { update: { availableVersion: '2.0.0' } });
    expect(m.getAnnouncedVersion()).toBe('2.0.0');
  });
});

// ─── channel and settings (base) ──────────────────────────────────────────

describe('UpdateManager channel and settings (base)', () => {
  afterEach(() => {
    delete globalThis.window;
  });

  it('setChannel updates the channel', () => {
    globalThis.window = {};
    const m = managerWithState('1.5.0', 'release');
    m.setChannel('pre-release');
    expect(m.settings.update.channel).toBe('pre-release');
  });

  it('setAutoDownload updates the autoDownload flag', () => {
    globalThis.window = {};
    const m = managerWithState('1.5.0', 'release');
    m.setAutoDownload(true);
    expect(m.settings.update.autoDownload).toBe(true);
  });
});

// ─── Constructor ───────────────────────────────────────────────────────────

describe('UpdateManager constructor', () => {
  beforeEach(() => {
    mockElectron();
  });
  afterEach(() => {
    delete window.electron;
  });

  it('applies default settings when none provided', () => {
    const m = new UpdateManager();
    expect(m.settings.update.channel).toBe('release');
    expect(m.settings.update.autoDownload).toBe(false);
    expect(m.settings.update.checkOnStartup).toBe(true);
    expect(m.settings.update.checkIntervalMinutes).toBe(60);
    expect(m.settings.update.skippedVersions).toEqual([]);
    expect(m.settings.collapsed.help).toBe(true);
  });

  it('merges provided settings with defaults', () => {
    const m = new UpdateManager({
      update: { channel: 'pre-release', autoDownload: true },
      collapsed: { help: false },
    });
    expect(m.settings.update.channel).toBe('pre-release');
    expect(m.settings.update.autoDownload).toBe(true);
    expect(m.settings.update.checkOnStartup).toBe(true);
    expect(m.settings.collapsed.help).toBe(false);
  });

  it('ensures skippedVersions is always an array', () => {
    const m = new UpdateManager({ update: { skippedVersions: null } });
    expect(Array.isArray(m.settings.update.skippedVersions)).toBe(true);
  });

  it('ensures collapsed has all required keys', () => {
    const m = new UpdateManager({ collapsed: {} });
    expect(m.settings.collapsed.hud).toBe(false);
    expect(m.settings.collapsed.shop).toBe(false);
    expect(m.settings.collapsed.help).toBe(true);
    expect(m.settings.collapsed.monsterInfo).toBe(true);
    expect(m.settings.collapsed.settings).toBe(true);
  });
});

// ─── _isPrerelease (extended) ──────────────────────────────────────────────

describe('UpdateManager._isPrerelease (extended)', () => {
  let m;
  beforeEach(() => {
    mockElectron();
    m = makeManager();
  });
  afterEach(() => {
    delete window.electron;
  });

  it('detects beta versions', () => {
    expect(m._isPrerelease('1.5.0-beta.1')).toBe(true);
    expect(m._isPrerelease('2.0.0-beta.10')).toBe(true);
  });

  it('detects alpha versions', () => {
    expect(m._isPrerelease('1.0.0-alpha.1')).toBe(true);
  });

  it('detects rc versions', () => {
    expect(m._isPrerelease('1.0.0-rc.1')).toBe(true);
  });

  it('does not flag stable versions as prerelease', () => {
    expect(m._isPrerelease('1.5.0')).toBe(false);
    expect(m._isPrerelease('2.0.0')).toBe(false);
  });

  it('handles null/undefined/empty', () => {
    expect(m._isPrerelease(null)).toBe(false);
    expect(m._isPrerelease(undefined)).toBe(false);
    expect(m._isPrerelease('')).toBe(false);
  });
});

// ─── passesFilter (extended) ───────────────────────────────────────────────

describe('UpdateManager.passesFilter (extended)', () => {
  let m;
  beforeEach(() => {
    mockElectron();
  });
  afterEach(() => {
    delete window.electron;
  });

  describe('release channel', () => {
    it('accepts newer stable version', () => {
      m = makeManager({ version: '1.5.0', update: { channel: 'release' } });
      expect(m.passesFilter({ version: '1.5.1' })).toBe(true);
    });

    it('accepts newer major version', () => {
      m = makeManager({ version: '1.5.0', update: { channel: 'release' } });
      expect(m.passesFilter({ version: '2.0.0' })).toBe(true);
    });

    it('rejects same version', () => {
      m = makeManager({ version: '1.5.0', update: { channel: 'release' } });
      expect(m.passesFilter({ version: '1.5.0' })).toBe(false);
    });

    it('rejects older version', () => {
      m = makeManager({ version: '1.5.0', update: { channel: 'release' } });
      expect(m.passesFilter({ version: '1.4.0' })).toBe(false);
    });

    it('rejects prerelease version', () => {
      m = makeManager({ version: '1.5.0', update: { channel: 'release' } });
      expect(m.passesFilter({ version: '1.6.0-beta.2' })).toBe(false);
    });

    it('rejects prerelease even if newer', () => {
      m = makeManager({ version: '1.5.0', update: { channel: 'release' } });
      expect(m.passesFilter({ version: '2.0.0-alpha.1' })).toBe(false);
    });
  });

  describe('pre-release channel', () => {
    it('accepts newer stable version', () => {
      m = makeManager({ version: '1.5.0', update: { channel: 'pre-release' } });
      expect(m.passesFilter({ version: '1.5.1' })).toBe(true);
    });

    it('accepts newer prerelease version', () => {
      m = makeManager({ version: '1.5.0-beta.1', update: { channel: 'pre-release' } });
      expect(m.passesFilter({ version: '1.5.0-beta.2' })).toBe(true);
    });

    it('accepts stable version when current is prerelease', () => {
      m = makeManager({ version: '1.5.0-beta.1', update: { channel: 'pre-release' } });
      expect(m.passesFilter({ version: '1.5.0' })).toBe(true);
    });

    it('rejects same prerelease version', () => {
      m = makeManager({ version: '1.5.0-beta.1', update: { channel: 'pre-release' } });
      expect(m.passesFilter({ version: '1.5.0-beta.1' })).toBe(false);
    });

    it('rejects older prerelease version', () => {
      m = makeManager({ version: '1.5.0-beta.2', update: { channel: 'pre-release' } });
      expect(m.passesFilter({ version: '1.5.0-beta.1' })).toBe(false);
    });

    it('rejects same stable version', () => {
      m = makeManager({ version: '1.5.0', update: { channel: 'pre-release' } });
      expect(m.passesFilter({ version: '1.5.0' })).toBe(false);
    });

    it('rejects older stable version', () => {
      m = makeManager({ version: '1.5.0', update: { channel: 'pre-release' } });
      expect(m.passesFilter({ version: '1.4.0' })).toBe(false);
    });
  });

  describe('version edge cases', () => {
    it('handles major version bump', () => {
      m = makeManager({ version: '1.9.9', update: { channel: 'release' } });
      expect(m.passesFilter({ version: '2.0.0' })).toBe(true);
    });

    it('handles minor version bump', () => {
      m = makeManager({ version: '1.5.9', update: { channel: 'release' } });
      expect(m.passesFilter({ version: '1.6.0' })).toBe(true);
    });

    it('handles patch version bump', () => {
      m = makeManager({ version: '1.5.0', update: { channel: 'release' } });
      expect(m.passesFilter({ version: '1.5.1' })).toBe(true);
    });

    it('handles prerelease to stable promotion', () => {
      m = makeManager({ version: '1.5.0-beta.1', update: { channel: 'release' } });
      expect(m.passesFilter({ version: '1.5.0' })).toBe(true);
    });

    it('handles beta.1 vs beta.2', () => {
      m = makeManager({ version: '1.5.0-beta.1', update: { channel: 'pre-release' } });
      expect(m.passesFilter({ version: '1.5.0-beta.2' })).toBe(true);
    });

    it('handles beta.10 vs beta.9', () => {
      m = makeManager({ version: '1.5.0-beta.9', update: { channel: 'pre-release' } });
      expect(m.passesFilter({ version: '1.5.0-beta.10' })).toBe(true);
    });

    it('handles alpha vs beta', () => {
      m = makeManager({ version: '1.5.0-alpha.1', update: { channel: 'pre-release' } });
      expect(m.passesFilter({ version: '1.5.0-beta.1' })).toBe(true);
    });

    it('handles rc vs beta', () => {
      m = makeManager({ version: '1.5.0-rc.1', update: { channel: 'pre-release' } });
      expect(m.passesFilter({ version: '1.5.0-beta.1' })).toBe(false);
    });
  });
});

// ─── shouldSkip (extended) ─────────────────────────────────────────────────

describe('UpdateManager.shouldSkip (extended)', () => {
  let m;
  beforeEach(() => {
    mockElectron();
    m = makeManager();
  });
  afterEach(() => {
    delete window.electron;
  });

  it('returns false when no versions are skipped', () => {
    expect(m.shouldSkip('1.5.0')).toBe(false);
  });

  it('returns true for a skipped version', () => {
    m.settings.update.skippedVersions = ['1.5.0'];
    expect(m.shouldSkip('1.5.0')).toBe(true);
  });

  it('returns false for a non-skipped version', () => {
    m.settings.update.skippedVersions = ['1.5.0'];
    expect(m.shouldSkip('1.5.1')).toBe(false);
  });

  it('handles multiple skipped versions', () => {
    m.settings.update.skippedVersions = ['1.5.0', '1.5.1', '1.5.2'];
    expect(m.shouldSkip('1.5.0')).toBe(true);
    expect(m.shouldSkip('1.5.1')).toBe(true);
    expect(m.shouldSkip('1.5.2')).toBe(true);
    expect(m.shouldSkip('1.5.3')).toBe(false);
  });
});

// ─── settings management (extended) ────────────────────────────────────────

describe('UpdateManager settings management (extended)', () => {
  let m, calls;
  beforeEach(() => {
    calls = mockElectron();
    m = makeManager();
  });
  afterEach(() => {
    delete window.electron;
  });

  it('setChannel updates channel and persists', () => {
    m.setChannel('pre-release');
    expect(m.settings.update.channel).toBe('pre-release');
    expect(calls.saveSettings).toHaveLength(1);
    expect(calls.saveSettings[0].update.channel).toBe('pre-release');
  });

  it('setChannel accepts any string', () => {
    m.setChannel('invalid');
    expect(m.settings.update.channel).toBe('invalid');
    expect(calls.saveSettings).toHaveLength(1);
  });

  it('setChannel triggers a check', () => {
    m.setChannel('pre-release');
    expect(calls.sendManualCheck).toBe(1);
  });

  it('setAutoDownload updates flag and persists', () => {
    m.setAutoDownload(true);
    expect(m.settings.update.autoDownload).toBe(true);
    expect(calls.saveSettings).toHaveLength(1);
  });

  it('setCheckInterval normalizes value', () => {
    m.setCheckInterval(5);
    expect(m.settings.update.checkIntervalMinutes).toBe(15);
  });

  it('setCheckInterval accepts valid value', () => {
    m.setCheckInterval(30);
    expect(m.settings.update.checkIntervalMinutes).toBe(30);
  });

  it('setCheckInterval handles NaN', () => {
    m.setCheckInterval('not a number');
    expect(m.settings.update.checkIntervalMinutes).toBe(15);
  });

  it('setCheckInterval handles negative', () => {
    m.setCheckInterval(-10);
    expect(m.settings.update.checkIntervalMinutes).toBe(15);
  });

  it('setCheckInterval handles zero', () => {
    m.setCheckInterval(0);
    expect(m.settings.update.checkIntervalMinutes).toBe(15);
  });

  it('getCollapsed returns collapsed state', () => {
    const collapsed = m.getCollapsed();
    expect(collapsed.help).toBe(true);
    expect(collapsed.shop).toBe(false);
  });

  it('setCollapsed updates and persists', () => {
    m.setCollapsed('help', false);
    expect(m.settings.collapsed.help).toBe(false);
    expect(calls.saveSettings).toHaveLength(1);
  });
});

// ─── skip ──────────────────────────────────────────────────────────────────

describe('UpdateManager.skip', () => {
  let m, calls;
  beforeEach(() => {
    calls = mockElectron();
    m = makeManager();
  });
  afterEach(() => {
    delete window.electron;
  });

  it('adds version to skipped list and persists', () => {
    m.skip('1.5.0');
    expect(m.settings.update.skippedVersions).toContain('1.5.0');
    expect(calls.saveSettings).toHaveLength(1);
  });

  it('does not duplicate skipped versions', () => {
    m.skip('1.5.0');
    m.skip('1.5.0');
    expect(m.settings.update.skippedVersions.filter((v) => v === '1.5.0')).toHaveLength(1);
  });

  it('handles multiple skips', () => {
    m.skip('1.5.0');
    m.skip('1.5.1');
    expect(m.settings.update.skippedVersions).toEqual(['1.5.0', '1.5.1']);
  });
});

// ─── _onStatus ─────────────────────────────────────────────────────────────

describe('UpdateManager._onStatus', () => {
  let m;
  beforeEach(() => {
    mockElectron();
    m = makeManager();
  });
  afterEach(() => {
    delete window.electron;
  });

  it('handles progress phase without crashing', () => {
    expect(() => m._onStatus({ phase: 'progress', percent: 50 })).not.toThrow();
  });

  it('handles downloaded phase without crashing', () => {
    expect(() => m._onStatus({ phase: 'downloaded', version: '1.5.0' })).not.toThrow();
  });

  it('handles not-available phase without crashing', () => {
    expect(() => m._onStatus({ phase: 'not-available' })).not.toThrow();
  });

  it('handles error phase without crashing', () => {
    expect(() => m._onStatus({ phase: 'error', message: 'Network error' })).not.toThrow();
  });

  it('handles unknown phase without crashing', () => {
    expect(() => m._onStatus({ phase: 'unknown' })).not.toThrow();
  });
});

// ─── _handleDownloaded ─────────────────────────────────────────────────────

describe('UpdateManager._handleDownloaded', () => {
  let m;
  beforeEach(() => {
    mockElectron();
    m = makeManager();
  });
  afterEach(() => {
    delete window.electron;
  });

  it('shows progress and creates restart button', () => {
    m._handleDownloaded({ version: '1.5.0' });
    expect(m.settings.update.availableVersion).toBe('1.5.0');
    const progressWrap = document.getElementById('update-progress');
    expect(progressWrap.style.display).toBe('block');
    const btn = progressWrap.querySelector('.update-restart-btn');
    expect(btn).not.toBeNull();
    expect(btn.textContent).toBe('Restart & Install');
  });

  it('removes existing restart button before creating new one', () => {
    m._handleDownloaded({ version: '1.5.0' });
    m._handleDownloaded({ version: '1.5.1' });
    const progressWrap = document.getElementById('update-progress');
    const btns = progressWrap.querySelectorAll('.update-restart-btn');
    expect(btns).toHaveLength(1);
  });

  it('handles null version gracefully', () => {
    m._handleDownloaded({});
    expect(m.getAnnouncedVersion()).toBeFalsy();
  });
});

// ─── download and restart ─────────────────────────────────────────────────

describe('UpdateManager download and restart', () => {
  let m, calls;
  beforeEach(() => {
    calls = mockElectron();
    m = makeManager();
  });
  afterEach(() => {
    delete window.electron;
  });

  it('download calls electron.downloadUpdate', () => {
    m.download();
    expect(calls.downloadUpdate).toBe(1);
  });

  it('restart calls electron.requestRestartToUpdate', () => {
    m.restart();
    expect(calls.requestRestartToUpdate).toBe(1);
  });
});

// ─── without window.electron ──────────────────────────────────────────────

describe('UpdateManager without window.electron', () => {
  let m;
  beforeEach(() => {
    delete window.electron;
    m = makeManager();
  });

  it('init does not crash without electron', () => {
    expect(() => m.init()).not.toThrow();
  });

  it('passesFilter still works without electron', () => {
    expect(m.passesFilter({ version: '2.0.0' })).toBe(true);
    expect(m.passesFilter({ version: '0.5.0' })).toBe(false);
  });

  it('check does not crash without electron', () => {
    expect(() => m.check()).not.toThrow();
  });

  it('download does not crash without electron', () => {
    expect(() => m.download()).not.toThrow();
  });

  it('restart does not crash without electron', () => {
    expect(() => m.restart()).not.toThrow();
  });
});

// ─── getAnnouncedVersion (extended) ────────────────────────────────────────

describe('UpdateManager.getAnnouncedVersion (extended)', () => {
  let m;
  beforeEach(() => {
    mockElectron();
    m = makeManager();
  });
  afterEach(() => {
    delete window.electron;
  });

  it('returns null by default', () => {
    expect(m.getAnnouncedVersion()).toBeNull();
  });

  it('returns version after downloaded status', () => {
    m._handleDownloaded({ version: '1.5.0' });
    expect(m.getAnnouncedVersion()).toBe('1.5.0');
  });
});

// ─── progress bar ─────────────────────────────────────────────────────────

describe('UpdateManager progress bar', () => {
  let m;
  beforeEach(() => {
    mockElectron();
    m = makeManager();
  });
  afterEach(() => {
    delete window.electron;
  });

  it('shows progress bar on progress status', () => {
    m._onStatus({ phase: 'progress', percent: 42, version: '1.5.0' });
    const progressWrap = document.getElementById('update-progress');
    expect(progressWrap.style.display).toBe('block');
    expect(document.getElementById('update-progress-pct').textContent).toBe('42%');
    expect(document.getElementById('update-progress-ver').textContent).toBe('1.5.0');
  });

  it('hides progress when showProgressBar is false', () => {
    m.settings.update.showProgressBar = false;
    m._onStatus({ phase: 'progress', percent: 50, version: '1.5.0' });
    const progressWrap = document.getElementById('update-progress');
    expect(progressWrap.style.display).toBe('none');
  });

  it('rounds percent to integer', () => {
    m._onStatus({ phase: 'progress', percent: 33.7 });
    expect(document.getElementById('update-progress-pct').textContent).toBe('34%');
  });

  it('handles 0% progress', () => {
    m._onStatus({ phase: 'progress', percent: 0 });
    expect(document.getElementById('update-progress-pct').textContent).toBe('0%');
  });

  it('handles 100% progress', () => {
    m._onStatus({ phase: 'progress', percent: 100 });
    expect(document.getElementById('update-progress-pct').textContent).toBe('100%');
  });
});

// ─── settings persistence ─────────────────────────────────────────────────

describe('UpdateManager settings persistence', () => {
  let m, calls;
  beforeEach(() => {
    calls = mockElectron();
    m = makeManager();
  });
  afterEach(() => {
    delete window.electron;
  });

  it('persists a deep copy, not a reference', () => {
    m.setAutoDownload(true);
    const saved = calls.saveSettings[0];
    saved.update.autoDownload = false;
    expect(m.settings.update.autoDownload).toBe(true);
  });

  it('setChannel persists the full settings object', () => {
    m.setChannel('pre-release');
    const saved = calls.saveSettings[0];
    expect(saved).toHaveProperty('update');
    expect(saved).toHaveProperty('collapsed');
    expect(saved.update.channel).toBe('pre-release');
  });
});
