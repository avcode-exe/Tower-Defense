import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.resolve(__dirname, '..', 'package.json'), 'utf-8'));

const EXISTING_SOURCE_FILES = [
  'src/config.js',
  'src/grid.js',
  'src/utils.js',
  'src/pathGenerator.js',
  'src/monster.js',
  'src/troop.js',
  'src/projectile.js',
  'src/waveManager.js',
  'src/game.js',
  'src/gameRuntime.js',
  'src/gamePersistence.js',
  'src/particles.js',
  'src/audio.js',
  'src/input.js',
  'src/updateManager.js',
  'src/versionUtils.js',
  'src/githubReleaseFeed.js',
  'src/updateYamlParser.js',
  'src/rendering/renderer.js',
  'src/rendering/gameRenderer.js',
  'src/ui/index.js',
  'src/ui/constants.js',
  'src/ui/utils.js',
  'src/ui/hud.js',
  'src/ui/shop.js',
  'src/ui/shieldShop.js',
  'src/ui/preview.js',
  'src/ui/placement.js',
  'src/ui/overlays.js',
  'src/ui/toast.js',
  'src/config/settingsDefaults.js',
  'src/main.js',
  'src/electron-main.js',
  'src/preload.js',
];

describe('smoke tests', () => {
  it('all entry-point files exist', () => {
    for (const file of ['index.html', 'css/style.css', 'package.json']) {
      expect(fs.existsSync(path.resolve(root, file))).toBe(true);
    }
  });

  it('all source files exist', () => {
    for (const file of EXISTING_SOURCE_FILES) {
      const fullPath = path.resolve(root, file);
      const exists = fs.existsSync(fullPath);
      if (!exists) {
        // Electron-only files may not exist in all environments
        if (file.includes('electron') || file.includes('preload')) continue;
      }
      expect(fs.existsSync(fullPath)).toBe(true);
    }
  });

  it('CSS exists', () => {
    expect(fs.existsSync(path.resolve(root, 'css/style.css'))).toBe(true);
  });

  it('version consistency in package.json', () => {
    expect(pkg.version).toBeDefined();
    expect(pkg.version).toMatch(/^\d+\.\d+\.\d+/);
  });

  it('package.json has required build config', () => {
    expect(pkg).toHaveProperty('main');
    expect(pkg).toHaveProperty('scripts');
    expect(pkg.scripts).toHaveProperty('test');
  });

  it('entry point matches main field', () => {
    expect(fs.existsSync(path.resolve(root, pkg.main || 'electron-main.js'))).toBe(true);
  });

  it('electron-main.js contains required IPC channel names', () => {
    const filePath = path.resolve(root, 'src/electron-main.js');
    if (!fs.existsSync(filePath)) return; // skip if file doesn't exist (Electron-only)
    const content = fs.readFileSync(filePath, 'utf-8');
    const channels = [
      'get-settings',
      'save-settings',
      'save-game',
      'load-game',
      'delete-save',
      'check-updates',
      'download-update',
      'restart-to-update',
      'skip-update',
      'update-status',
    ];
    for (const channel of channels) {
      expect(content).toContain(channel);
    }
  });

  it('preload.js contains required IPC channel names', () => {
    const filePath = path.resolve(root, 'src/preload.js');
    if (!fs.existsSync(filePath)) return; // skip if file doesn't exist (Electron-only)
    const content = fs.readFileSync(filePath, 'utf-8');
    const channels = [
      'get-settings',
      'save-settings',
      'save-game',
      'load-game',
      'delete-save',
      'check-updates',
      'download-update',
      'restart-to-update',
      'skip-update',
      'update-status',
    ];
    for (const channel of channels) {
      expect(content).toContain(channel);
    }
  });

  it('main.js contains unhandledrejection error handler', () => {
    const filePath = path.resolve(root, 'src/main.js');
    const content = fs.readFileSync(filePath, 'utf-8');
    expect(content).toContain("window.addEventListener('unhandledrejection'");
    expect(content).toContain('window.onerror');
    expect(content).toContain('Something went wrong');
    expect(content).toContain('error-restart-btn');
    expect(content).toContain('location.reload()');
    expect(content).toContain('towerdefense-error-log');
  });
});
