// Tests for Settings Panel Rework configuration (settingsDefaults.js)
// Covers: SETTINGS_SECTIONS, SETTINGS_FIELD_TYPES, PARTICLE_QUALITY_TIERS,
// DEFAULT_SETTINGS, COLLAPSED_KEYS, makeCollapsedDefaults

import { describe, it, expect, beforeAll } from 'vitest';

describe('settingsDefaults (Settings Panel Rework)', () => {
  let SETTINGS_SECTIONS, SETTINGS_FIELD_TYPES, PARTICLE_QUALITY_TIERS;
  let DEFAULT_SETTINGS, COLLAPSED_KEYS, makeCollapsedDefaults;

  beforeAll(async () => {
    const mod = await import('../src/config/settingsDefaults.js');
    SETTINGS_SECTIONS = mod.SETTINGS_SECTIONS;
    SETTINGS_FIELD_TYPES = mod.SETTINGS_FIELD_TYPES;
    PARTICLE_QUALITY_TIERS = mod.PARTICLE_QUALITY_TIERS;
    DEFAULT_SETTINGS = mod.DEFAULT_SETTINGS;
    COLLAPSED_KEYS = mod.COLLAPSED_KEYS;
    makeCollapsedDefaults = mod.makeCollapsedDefaults;
  });

  describe('SETTINGS_SECTIONS', () => {
    it('has 5 sections', () => {
      expect(SETTINGS_SECTIONS.length).toBe(5);
    });

    it('sections have correct ids', () => {
      const ids = SETTINGS_SECTIONS.map((s) => s.id);
      expect(ids).toEqual(['audio', 'graphics', 'controls', 'accessibility', 'update']);
    });

    it('each section has id, label, and icon', () => {
      for (const section of SETTINGS_SECTIONS) {
        expect(section).toHaveProperty('id');
        expect(section).toHaveProperty('label');
        expect(section).toHaveProperty('icon');
      }
    });
  });

  describe('SETTINGS_FIELD_TYPES', () => {
    it('has audio section with slider and toggle fields', () => {
      const audio = SETTINGS_FIELD_TYPES.audio;
      expect(audio.masterVolume.type).toBe('slider');
      expect(audio.masterVolume.min).toBe(0);
      expect(audio.masterVolume.max).toBe(1);
      expect(audio.masterVolume.step).toBe(0.01);
      expect(audio.masterMute.type).toBe('toggle');
      expect(audio.sfxVolume.type).toBe('slider');
      expect(audio.sfxMute.type).toBe('toggle');
      expect(audio.ambientVolume.type).toBe('slider');
      expect(audio.ambientMute.type).toBe('toggle');
      expect(audio.uiVolume.type).toBe('slider');
      expect(audio.uiMute.type).toBe('toggle');
    });

    it('has graphics section with select and slider fields', () => {
      const graphics = SETTINGS_FIELD_TYPES.graphics;
      expect(graphics.particleQuality.type).toBe('select');
      expect(graphics.particleQuality.options).toEqual(['Low', 'Medium', 'High', 'Ultra']);
      expect(graphics.resolutionScale.type).toBe('slider');
      expect(graphics.resolutionScale.min).toBe(0.5);
      expect(graphics.resolutionScale.max).toBe(2);
      expect(graphics.screenShake.type).toBe('slider');
    });

    it('has controls section with toggle and keybind fields', () => {
      const controls = SETTINGS_FIELD_TYPES.controls;
      expect(controls.scrollZoom.type).toBe('toggle');
      expect(controls.keyBindings.type).toBe('keybind');
    });

    it('has accessibility section with toggle fields', () => {
      const a11y = SETTINGS_FIELD_TYPES.accessibility;
      expect(a11y.colorblindMode.type).toBe('toggle');
      expect(a11y.reducedMotion.type).toBe('toggle');
    });

    it('has no update section in field types (handled separately)', () => {
      expect(SETTINGS_FIELD_TYPES.update).toBeUndefined();
    });
  });

  describe('PARTICLE_QUALITY_TIERS', () => {
    it('has 4 tiers: Low, Medium, High, Ultra', () => {
      expect(Object.keys(PARTICLE_QUALITY_TIERS)).toEqual(['Low', 'Medium', 'High', 'Ultra']);
    });

    it('Low tier has correct values', () => {
      expect(PARTICLE_QUALITY_TIERS.Low.pool).toBe(100);
      expect(PARTICLE_QUALITY_TIERS.Low.spawn).toBe(0.3);
      expect(PARTICLE_QUALITY_TIERS.Low.lifetime).toBe(0.5);
    });

    it('Medium tier has correct values', () => {
      expect(PARTICLE_QUALITY_TIERS.Medium.pool).toBe(300);
      expect(PARTICLE_QUALITY_TIERS.Medium.spawn).toBe(0.6);
      expect(PARTICLE_QUALITY_TIERS.Medium.lifetime).toBe(0.75);
    });

    it('High tier has correct values', () => {
      expect(PARTICLE_QUALITY_TIERS.High.pool).toBe(1000);
      expect(PARTICLE_QUALITY_TIERS.High.spawn).toBe(1.0);
      expect(PARTICLE_QUALITY_TIERS.High.lifetime).toBe(1.0);
    });

    it('Ultra tier has correct values', () => {
      expect(PARTICLE_QUALITY_TIERS.Ultra.pool).toBe(2000);
      expect(PARTICLE_QUALITY_TIERS.Ultra.spawn).toBe(1.5);
      expect(PARTICLE_QUALITY_TIERS.Ultra.lifetime).toBe(1.5);
    });

    it('pool sizes increase monotonically across tiers', () => {
      const tiers = ['Low', 'Medium', 'High', 'Ultra'];
      for (let i = 1; i < tiers.length; i++) {
        expect(PARTICLE_QUALITY_TIERS[tiers[i]].pool).toBeGreaterThan(PARTICLE_QUALITY_TIERS[tiers[i - 1]].pool);
      }
    });
  });

  describe('DEFAULT_SETTINGS', () => {
    it('has all expected top-level keys', () => {
      expect(DEFAULT_SETTINGS).toHaveProperty('update');
      expect(DEFAULT_SETTINGS).toHaveProperty('collapsed');
      expect(DEFAULT_SETTINGS).toHaveProperty('audio');
      expect(DEFAULT_SETTINGS).toHaveProperty('graphics');
      expect(DEFAULT_SETTINGS).toHaveProperty('controls');
      expect(DEFAULT_SETTINGS).toHaveProperty('accessibility');
    });

    it('default particle quality is Medium', () => {
      expect(DEFAULT_SETTINGS.graphics.particleQuality).toBe('Medium');
    });

    it('default master volume is 0.5', () => {
      expect(DEFAULT_SETTINGS.audio.masterVolume).toBe(0.5);
    });

    it('default update channel is release', () => {
      expect(DEFAULT_SETTINGS.update.channel).toBe('release');
    });

    it('default key bindings are Space/Enter/R/S/F', () => {
      expect(DEFAULT_SETTINGS.controls.keyBindings.pause).toBe('Space');
      expect(DEFAULT_SETTINGS.controls.keyBindings.startWave).toBe('Enter');
      expect(DEFAULT_SETTINGS.controls.keyBindings.restart).toBe('KeyR');
      expect(DEFAULT_SETTINGS.controls.keyBindings.sell).toBe('KeyS');
      expect(DEFAULT_SETTINGS.controls.keyBindings.speedUp).toBe('KeyF');
    });
  });

  describe('COLLAPSED_KEYS', () => {
    it('contains all expected keys', () => {
      expect(COLLAPSED_KEYS).toContain('shop');
      expect(COLLAPSED_KEYS).toContain('hud');
      expect(COLLAPSED_KEYS).toContain('preview');
      expect(COLLAPSED_KEYS).toContain('shieldShop');
      expect(COLLAPSED_KEYS).toContain('help');
      expect(COLLAPSED_KEYS).toContain('monsterInfo');
      expect(COLLAPSED_KEYS).toContain('settings');
      expect(COLLAPSED_KEYS).toContain('about');
    });

    it('has exactly 8 keys', () => {
      expect(COLLAPSED_KEYS.length).toBe(8);
    });
  });

  describe('makeCollapsedDefaults', () => {
    it('returns defaults for all COLLAPSED_KEYS', () => {
      const defaults = makeCollapsedDefaults();
      for (const key of COLLAPSED_KEYS) {
        expect(defaults).toHaveProperty(key);
      }
    });

    it('help, monsterInfo, settings default to true', () => {
      const defaults = makeCollapsedDefaults();
      expect(defaults.help).toBe(true);
      expect(defaults.monsterInfo).toBe(true);
      expect(defaults.settings).toBe(true);
    });

    it('shop, hud, preview, shieldShop, about default to false', () => {
      const defaults = makeCollapsedDefaults();
      expect(defaults.shop).toBe(false);
      expect(defaults.hud).toBe(false);
      expect(defaults.preview).toBe(false);
      expect(defaults.shieldShop).toBe(false);
      expect(defaults.about).toBe(false);
    });

    it('respects overrides', () => {
      const defaults = makeCollapsedDefaults({ shop: true, hud: true });
      expect(defaults.shop).toBe(true);
      expect(defaults.hud).toBe(true);
      expect(defaults.help).toBe(true); // unaffected
    });
  });
});
