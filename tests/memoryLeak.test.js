import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import { CONFIG, TROOP_SPECS } from '../src/config.js';

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
    endFrame: vi.fn(),
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

describe('memory lifecycle', () => {
  let makeGame, swordsmanSpec, makeTroop;

  beforeAll(async () => {
    const helpers = await import('./helpers.js');
    makeGame = helpers.makeGame;
    swordsmanSpec = helpers.swordsmanSpec;
    makeTroop = helpers.makeTroop;
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('monster array lifecycle: push and cleanup', () => {
    const game = makeGame();
    for (let i = 0; i < 20; i++) game.spawnMonster(1);
    expect(game.monsters.length).toBe(20);
    for (const m of game.monsters) m.alive = false;
    game._cleanupDead();
    expect(game.monsters.length).toBe(0);
  });

  it('troop array lifecycle: push and cleanup', () => {
    const game = makeGame();
    for (let i = 0; i < 10; i++) {
      const t = makeTroop(swordsmanSpec);
      game.troops.push(t);
    }
    expect(game.troops.length).toBe(10);
    for (const t of game.troops) t.alive = false;
    game._cleanupDead();
    expect(game.troops.length).toBe(0);
  });

  it('projectile recycling works', () => {
    const game = makeGame();
    const troop = { spec: { id: 'archer' }, _cachedDamage: 10 };
    const p = game.acquireProjectile(troop, { x: 100, y: 100, alive: true }, 10, 10);
    expect(p).toBeDefined();
    game.projectiles.push(p);
    p.alive = false;
    game._cleanupDead();
    expect(game.projectiles.length).toBe(0);
    expect(game._projectilePool.length).toBe(1);
  });

  it('popup recycling works', () => {
    const game = makeGame();
    game._getPopup('test', 10, 10, 1, '#fff');
    expect(game.popups.length).toBe(1);
    game._stepPopups(2); // Expires the popup
    expect(game.popups.length).toBe(0);
  });

  it('tile index pooling', () => {
    const game = makeGame();
    game.spawnMonster(1);
    game._updateMonsterTileIndex();
    const usedIdx = game._monsterTileIndex.filter((a) => a !== null).length;
    expect(usedIdx).toBeGreaterThan(0);
    // All monsters die
    game.monsters[0].alive = false;
    game._updateMonsterTileIndex();
    // Pool should have the released array
    expect(game._tileIndexPool.length).toBeGreaterThanOrEqual(usedIdx);
  });
});
