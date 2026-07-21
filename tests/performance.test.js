import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CONFIG, TROOP_SPECS } from '../src/config.js';
import { makeGame, swordsmanSpec } from './helpers.js';

vi.mock('../src/audio.js', () => ({
  AUDIO: {
    troopPlace: vi.fn(),
    sell: vi.fn(),
    goldEarned: vi.fn(),
    upgrade: vi.fn(),
    heal: vi.fn(),
    shieldBuy: vi.fn(),
    waveStart: vi.fn(),
    defeat: vi.fn(),
    toggleMute: vi.fn(),
    monsterLeak: vi.fn(),
    monsterDeath: vi.fn(),
    rangedAttack: vi.fn(),
    meleeAttack: vi.fn(),
    waveComplete: vi.fn(),
    troopDeath: vi.fn(),
  },
}));
vi.mock('../src/particles.js', () => ({
  PARTICLES: {
    update: vi.fn(),
    clear: vi.fn(),
    deathBurst: vi.fn(),
    hitSpark: vi.fn(),
    chainSpark: vi.fn(),
    slowApply: vi.fn(),
    healBurst: vi.fn(),
    troopDeath: vi.fn(),
    troopShieldActivate: vi.fn(),
    reviveBurst: vi.fn(),
    splashImpact: vi.fn(),
    spawnTrail: vi.fn(),
    spawn: vi.fn(),
    burnApply: vi.fn(),
    burnTick: vi.fn(),
  },
}));
vi.mock('../src/rendering/renderer.js', () => ({
  RENDERER: {
    init: vi.fn(),
    resize: vi.fn(),
    markCacheDirty: vi.fn(),
    _rebuildCache: vi.fn(),
    toWorldInto: vi.fn((px, py, out) => {
      out.x = px;
      out.y = py;
      return out;
    }),
    beginFrame: vi.fn(),
    applyMapTransform: vi.fn(),
    drawStaticLayers: vi.fn(),
    restoreTransform: vi.fn(),
    width: 800,
    height: 600,
    offsetX: 0,
    offsetY: 0,
    scale: 1,
    hoverPx: null,
    hoverPy: null,
    canvas: null,
    ctx: null,
  },
}));
vi.mock('../src/rendering/gameRenderer.js', () => ({ renderGame: vi.fn(), updateCursor: vi.fn() }));
vi.mock('../src/gameRuntime.js', () => ({
  GameRuntimeController: vi.fn().mockImplementation(() => ({
    installResize: vi.fn(),
    startLoop: vi.fn(),
    stopLoop: vi.fn(),
    applyDefeat: vi.fn(),
    startWave: vi.fn(),
    togglePause: vi.fn(),
    pauseGame: vi.fn(),
    resumeGame: vi.fn(),
    startPauseRender: vi.fn(),
    stopPauseRender: vi.fn(),
    removeResize: vi.fn(),
  })),
}));
vi.mock('../src/gamePersistence.js', () => ({
  SaveSerializer: { fromGame: vi.fn(() => ({})), isValid: vi.fn(() => true) },
  GameWorldFactory: {
    createFresh: vi.fn(() => ({
      grid: {
        get: vi.fn(),
        set: vi.fn(),
        isBuildable: vi.fn(() => true),
        size: 16,
        clear: vi.fn(),
        tiles: new Uint8Array(256),
      },
      waypoints: [[0, 0]],
      pathSegments: { segments: [{ ax: 0, ay: 26.5, bx: 848, by: 26.5, len: 848, cumStart: 0 }], totalLength: 848 },
    })),
  },
  GameSnapshotRestorer: { apply: vi.fn(), applyFresh: vi.fn() },
}));
vi.mock('../src/ui/index.js', () => ({
  UI: {
    handleToggleClick: vi.fn(() => false),
    hitShop: vi.fn(() => -1),
    hitToggleButtons: vi.fn(() => false),
    updateHover: vi.fn(),
    drawHUD: vi.fn(),
    drawShop: vi.fn(),
    drawShieldShop: vi.fn(),
    drawPreview: vi.fn(),
    drawSelectedTroopRange: vi.fn(),
    drawPlacementGhost: vi.fn(),
    drawWaveTransition: vi.fn(),
    drawOverlay: vi.fn(),
    drawDevConfirmDialog: vi.fn(),
    _devConfirmYes: null,
    _devConfirmNo: null,
    _shieldBuyBtn: null,
    _ghostPos: { x: 0, y: 0 },
    _tileScratch: { gx: 0, gy: 0 },
    shopScrollY: 0,
  },
  UI_LAYOUT: {
    collapsed: { hud: false, shop: false, shieldShop: false, preview: false },
    shopWidth: 250,
    hudHeight: 56,
    previewHeight: 80,
    shieldShopWidth: 220,
    SHOP_WIDTH: 250,
  },
}));

describe('performance', () => {
  it('empty step completes quickly', () => {
    const game = makeGame();
    const start = performance.now();
    for (let i = 0; i < 100; i++) game.step(1 / 60);
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(5000);
  });

  it('troop placement creates entity', () => {
    const game = makeGame();
    game.placeTroop(swordsmanSpec, 1, 1);
    expect(game.troops.length).toBeGreaterThan(0);
  });

  it('monster spawning creates entity', () => {
    const game = makeGame();
    game.spawnMonster(1);
    expect(game.monsters.length).toBe(1);
  });

  it('step with entity load', () => {
    const game = makeGame();
    for (let i = 0; i < 10; i++) game.spawnMonster(1);
    for (let i = 0; i < 5; i++) game.placeTroop(swordsmanSpec, 2 + i, 2);
    const start = performance.now();
    game.step(1 / 60);
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(1000);
  });

  it('cleanup compacts dead entities', () => {
    const game = makeGame();
    const n = 10;
    for (let i = 0; i < n; i++) {
      game.spawnMonster(1);
      game.monsters[i].alive = false;
    }
    game._cleanupDead();
    expect(game.monsters.length).toBe(0);
  });
  it('splash at scale', () => {
    const game = makeGame();
    for (let i = 0; i < 50; i++) {
      game.spawnMonster(1);
      const m = game.monsters[i];
      m.x = 100 + (i % 10) * 20;
      m.y = 100 + Math.floor(i / 10) * 20;
      m._tileGx = Math.floor(m.x / CONFIG.TILE_SIZE);
      m._tileGy = Math.floor(m.y / CONFIG.TILE_SIZE);
    }
    game._updateMonsterTileIndex();
    // Use a mock troop with spec.color
    const mockTroop = { spec: { color: '#f00' } };
    const hits = game.splashAt(200, 200, 50, 3, mockTroop);
    expect(Array.isArray(hits)).toBe(true);
  });

  it('projectile management', () => {
    const game = makeGame();
    const p = game.acquireProjectile({ spec: { id: 'archer' }, _cachedDamage: 10 }, { x: 100, y: 100 }, 10, 10);
    game.projectiles.push(p);
    expect(game.projectiles.length).toBe(1);
  });
});
