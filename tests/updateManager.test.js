import { describe, expect, it, vi, afterEach } from 'vitest';
import { UpdateManager } from '../src/updateManager.js';

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

describe('UpdateManager.passesFilter', () => {
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

describe('UpdateManager.shouldSkip', () => {
  it('returns true when version is in skippedVersions', () => {
    const m = managerWithState('1.5.0', 'release', { update: { skippedVersions: ['1.4.0', '1.5.0'] } });
    expect(m.shouldSkip('1.5.0')).toBe(true);
  });

  it('returns false when version is not in skippedVersions', () => {
    const m = managerWithState('1.5.0', 'release');
    expect(m.shouldSkip('1.6.0')).toBe(false);
  });
});

describe('UpdateManager._isPrerelease', () => {
  it('returns true for versions with prerelease tags', () => {
    const m = managerWithState('1.5.0', 'release');
    expect(m._isPrerelease('1.5.0-beta.1')).toBe(true);
  });

  it('returns false for stable versions', () => {
    const m = managerWithState('1.5.0', 'release');
    expect(m._isPrerelease('1.5.0')).toBe(false);
  });
});

describe('UpdateManager getCollapsed / setCollapsed', () => {
  afterEach(() => { delete globalThis.window; });

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

describe('UpdateManager.getAnnouncedVersion', () => {
  it('returns the availableVersion when set', () => {
    const m = managerWithState('1.5.0', 'release', { update: { availableVersion: '2.0.0' } });
    expect(m.getAnnouncedVersion()).toBe('2.0.0');
  });
});

describe('UpdateManager channel and settings', () => {
  afterEach(() => { delete globalThis.window; });

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
