import { isPrerelease, parseVersion, isNewerThan } from '../versionUtils.js';

export const COLLAPSED_KEYS = ['shop', 'hud', 'preview', 'shieldShop', 'help', 'monsterInfo', 'settings'];

export function makeCollapsedDefaults(overrides = {}) {
  const defaults = {};
  for (const key of COLLAPSED_KEYS) {
    defaults[key] =
      overrides[key] !== undefined ? overrides[key] : key === 'help' || key === 'monsterInfo' || key === 'settings';
  }
  return defaults;
}

const DEFAULT_SETTINGS = {
  update: {
    channel: 'release',
    autoDownload: false,
    checkOnStartup: true,
    checkIntervalMinutes: 60,
    skippedVersions: [],
    showProgressBar: true,
    availableVersion: null,
    releaseType: null,
  },
  collapsed: makeCollapsedDefaults(),
};

export { DEFAULT_SETTINGS, isPrerelease, parseVersion, isNewerThan };
