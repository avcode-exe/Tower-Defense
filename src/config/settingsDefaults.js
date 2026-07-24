import { isPrerelease, parseVersion, isNewerThan } from '../versionUtils.js';

export const COLLAPSED_KEYS = ['shop', 'hud', 'preview', 'shieldShop', 'help', 'monsterInfo', 'settings', 'about'];

export function makeCollapsedDefaults(overrides = {}) {
  const DEFAULTS = { help: true, monsterInfo: true, settings: true };
  const defaults = {};
  for (const key of COLLAPSED_KEYS) {
    defaults[key] = overrides[key] !== undefined ? overrides[key] : (DEFAULTS[key] ?? false);
  }
  return defaults;
}

const DEFAULT_SETTINGS = {
  update: {
    channel: 'release',
    autoDownload: false,
    checkOnStartup: true,
    checkIntervalMinutes: 60,
    showProgressBar: true,
    availableVersion: null,
    releaseType: null,
  },
  collapsed: makeCollapsedDefaults(),
  audio: {
    masterVolume: 0.5,
    sfxVolume: 0.5,
    ambientVolume: 0.5,
    uiVolume: 0.5,
    masterMute: false,
    sfxMute: false,
    ambientMute: false,
    uiMute: false,
  },
  graphics: {
    particleQuality: 'Medium',
    resolutionScale: 1,
    screenShake: 1,
  },
  controls: {
    scrollZoom: true,
    keyBindings: {
      pause: 'Space',
      startWave: 'Enter',
      restart: 'KeyR',
      sell: 'KeyS',
      speedUp: 'KeyF',
    },
  },
  accessibility: {
    colorblindMode: false,
    reducedMotion: false,
  },
};

export const SETTINGS_SECTIONS = [
  { id: 'audio', label: 'Audio', icon: '🔊' },
  { id: 'graphics', label: 'Graphics', icon: '🎨' },
  { id: 'controls', label: 'Controls', icon: '⌨️' },
  { id: 'accessibility', label: 'Accessibility', icon: '♿' },
  { id: 'update', label: 'Update', icon: '🔄' },
];

export const PARTICLE_QUALITY_TIERS = {
  Low: { pool: 100, spawn: 0.3, lifetime: 0.5 },
  Medium: { pool: 300, spawn: 0.6, lifetime: 0.75 },
  High: { pool: 1000, spawn: 1.0, lifetime: 1.0 },
  Ultra: { pool: 2000, spawn: 1.5, lifetime: 1.5 },
};

export const SETTINGS_FIELD_TYPES = {
  audio: {
    masterVolume: { type: 'slider', label: 'Master', min: 0, max: 1, step: 0.01 },
    sfxVolume: { type: 'slider', label: 'SFX', min: 0, max: 1, step: 0.01 },
    ambientVolume: { type: 'slider', label: 'Ambient', min: 0, max: 1, step: 0.01 },
    uiVolume: { type: 'slider', label: 'UI', min: 0, max: 1, step: 0.01 },
    masterMute: { type: 'toggle', label: 'Mute Master' },
    sfxMute: { type: 'toggle', label: 'Mute SFX' },
    ambientMute: { type: 'toggle', label: 'Mute Ambient' },
    uiMute: { type: 'toggle', label: 'Mute UI' },
  },
  graphics: {
    particleQuality: { type: 'select', label: 'Particle Quality', options: ['Low', 'Medium', 'High', 'Ultra'] },
    resolutionScale: { type: 'slider', label: 'Resolution Scale', min: 0.5, max: 2, step: 0.1 },
    screenShake: { type: 'slider', label: 'Screen Shake', min: 0, max: 1, step: 0.1 },
  },
  controls: {
    scrollZoom: { type: 'toggle', label: 'Keyboard Zoom (Ctrl +/-)' },
    keyBindings: { type: 'keybind', label: 'Key Bindings' },
  },
  accessibility: {
    colorblindMode: { type: 'toggle', label: 'Colorblind Mode (High Contrast)' },
    reducedMotion: { type: 'toggle', label: 'Reduced Motion' },
  },
};

export { DEFAULT_SETTINGS, isPrerelease, parseVersion, isNewerThan };
