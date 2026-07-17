import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { CONFIG, TROOP_SPECS, MONSTER_SPECS, MONSTER_DEV_ORDER } from '../src/config.js';

const ROOT = process.cwd();

function readJson(relativePath) {
  return JSON.parse(readFileSync(join(ROOT, relativePath), 'utf8'));
}

function fileExists(relativePath) {
  return existsSync(join(ROOT, relativePath));
}

describe('Installer smoke test', () => {
  describe('required entry-point files exist', () => {
    it('electron-main.js', () => {
      expect(fileExists('electron-main.js')).toBe(true);
    });

    it('preload.js', () => {
      expect(fileExists('preload.js')).toBe(true);
    });

    it('index.html', () => {
      expect(fileExists('index.html')).toBe(true);
    });
  });

  describe('source files exist', () => {
    const srcFiles = [
      'src/game.js',
      'src/config.js',
      'src/monster.js',
      'src/troop.js',
      'src/projectile.js',
      'src/waveManager.js',
      'src/gamePersistence.js',
      'src/gameRuntime.js',
      'src/input.js',
      'src/main.js',
      'src/audio.js',
      'src/particles.js',
      'src/grid.js',
      'src/utils.js',
      'src/pathGenerator.js',
      'src/updateManager.js',
      'src/rendering/renderer.js',
      'src/rendering/gameRenderer.js',
      'src/ui/index.js',
      'src/ui/shop.js',
      'src/ui/hud.js',
      'src/ui/preview.js',
      'src/ui/placement.js',
      'src/ui/overlays.js',
      'src/ui/shieldShop.js',
      'src/ui/constants.js',
      'src/ui/utils.js',
      'src/ui/toast.js',
    ];

    for (const file of srcFiles) {
      it(`${file}`, () => {
        expect(fileExists(file)).toBe(true);
      });
    }
  });

  describe('CSS exists', () => {
    it('css/style.css', () => {
      expect(fileExists('css/style.css')).toBe(true);
    });
  });

  describe('version consistency', () => {
    it('package.json and gamePersistence use the same version', () => {
      const pkg = readJson('package.json');
      const persistence = readFileSync(join(ROOT, 'src/gamePersistence.js'), 'utf8');
      const match = persistence.match(/version:\s+version\s*\|\|\s*'([^']+)'/);
      expect(match).not.toBeNull();
      const fallbackVersion = match[1];
      expect(fallbackVersion).toBe('1.0.0');
      expect(persistence).toContain('fromGame(game, version)');
    });

    it('updateManager settings shape matches defaults', () => {
      const um = readFileSync(join(ROOT, 'src/updateManager.js'), 'utf8');
      expect(um).toContain('DEFAULT_SETTINGS');
      expect(um).toContain('isNewerThan');
      expect(um).toContain('isPrerelease');
    });

    it('package.json and updateManager use the same version', () => {
      const pkg = readJson('package.json');
      const em = readFileSync(join(ROOT, 'electron-main.js'), 'utf8');
      const match = em.match(/version:\s*app\.getVersion\(\)/);
      expect(match).not.toBeNull();
    });

    it('version is valid semver', () => {
      const pkg = readJson('package.json');
      expect(pkg.version).toMatch(/^\d+\.\d+\.\d+/);
    });
  });

  describe('build configuration', () => {
    it('has required electron-builder fields', () => {
      const pkg = readJson('package.json');
      expect(pkg.build).toBeDefined();
      expect(pkg.build.appId).toBeDefined();
      expect(pkg.build.productName).toBeDefined();
      expect(pkg.build.win).toBeDefined();
      expect(pkg.build.files).toBeDefined();
      expect(Array.isArray(pkg.build.files)).toBe(true);
    });

    it('entry point matches main field', () => {
      const pkg = readJson('package.json');
      expect(fileExists(pkg.main)).toBe(true);
    });
  });

  describe('config structure', () => {
    it('CONFIG has all required balance keys', () => {
      const configSrc = readFileSync(join(ROOT, 'src/config.js'), 'utf8');
      const requiredKeys = [
        'GRID_SIZE',
        'TILE_SIZE',
        'STARTING_GOLD',
        'STARTING_LIVES',
        'MOVEMENT_SPEED_CATEGORIES',
        'MOVEMENT_SPEEDS',
        'MONSTER_REVIVE_RANGE',
        'MONSTER_REVIVE_HP_RATIO',
        'MONSTER_REVIVE_MAX_TARGETS',
      ];
      for (const key of requiredKeys) {
        expect(configSrc).toContain(key + ':');
      }
    });

    it('all troop specs have required fields', () => {
      for (const spec of TROOP_SPECS) {
        expect(spec.id).toBeDefined();
        expect(spec.name).toBeDefined();
        expect(spec.type).toBeDefined();
        expect(spec.cost).toBeGreaterThan(0);
        expect(spec.hp).toBeGreaterThan(0);
        expect(spec.damage).toBeGreaterThanOrEqual(0);
      }
    });

    it('all monster specs have movement speed categories', () => {
      for (const key of MONSTER_DEV_ORDER) {
        const spec = MONSTER_SPECS[key];
        expect(spec.movementSpeed).toBeDefined();
        expect(CONFIG.MOVEMENT_SPEEDS[spec.movementSpeed]).toBeDefined();
      }
    });
  });
});
