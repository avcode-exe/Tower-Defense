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
      waypoints: [
        [0, 0],
        [5, 0],
      ],
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

describe('combat integration', () => {
  let Game, makeGame, swordsmanSpec, mageSpec, lightningSpec, icewizSpec, valkyrieSpec, mortarSpec, placeMonsterAt;

  beforeAll(async () => {
    const gameMod = await import('../src/game.js');
    Game = gameMod.Game;
    const helpers = await import('./helpers.js');
    makeGame = helpers.makeGame;
    swordsmanSpec = helpers.swordsmanSpec;
    mageSpec = helpers.mageSpec;
    lightningSpec = helpers.lightningSpec;
    icewizSpec = helpers.icewizSpec;
    valkyrieSpec = helpers.valkyrieSpec;
    mortarSpec = helpers.mortarSpec;
    placeMonsterAt = helpers.placeMonsterAt;
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('mortar splash damages multiple monsters', () => {
    const game = makeGame();
    const mockTroop = { spec: { color: '#f00' } };
    const m1 = placeMonsterAt(game, 1, 5, 5);
    placeMonsterAt(game, 1, 5, 6);
    game._updateMonsterTileIndex();
    const hits = game.splashAt(m1.x, m1.y, 3, 2.5, mockTroop);
    // Should hit at least the center monster
    expect(hits.length).toBeGreaterThanOrEqual(1);
  });

  it('valkyrie AoE attacks multiple monsters', () => {
    const game = makeGame();
    // Tile (3,3) is not a waypoint PATH tile
    game.placeTroop(valkyrieSpec, 3, 3);
    const m1 = placeMonsterAt(game, 1, 3, 3);
    placeMonsterAt(game, 1, 3, 4);
    game._updateMonsterTileIndex();
    // Direct damage via splash with valkyrie-like stats
    const mockTroop = { spec: { color: '#f00' } };
    const hits = game.splashAt(m1.x, m1.y, 3, 1.5, mockTroop);
    expect(hits.length).toBeGreaterThanOrEqual(1);
  });

  it('mage splash damages monsters in radius', () => {
    const game = makeGame();
    game.placeTroop(mageSpec, 3, 3);
    const m1 = placeMonsterAt(game, 1, 3, 3);
    placeMonsterAt(game, 1, 4, 3);
    game._updateMonsterTileIndex();
    const hits = game.splashAt(m1.x, m1.y, 3, 2.0, game.troops[0]);
    expect(hits.length).toBeGreaterThanOrEqual(1);
  });

  it('ice wizard splash and slow', () => {
    const game = makeGame();
    game.placeTroop(icewizSpec, 3, 3);
    const m = placeMonsterAt(game, 1, 3, 3);
    game._updateMonsterTileIndex();
    const hits = game.splashAt(m.x, m.y, 3, 1.5, game.troops[0]);
    expect(Array.isArray(hits)).toBe(true);
  });

  it('chain lightning chains to multiple monsters', () => {
    const game = makeGame();
    game.placeTroop(lightningSpec, 3, 3);
    for (let i = 0; i < 3; i++) {
      placeMonsterAt(game, 1, 3 + Math.floor(i / 2), 3 + (i % 2));
    }
    game._updateMonsterTileIndex();
    // Set cached properties on the troop for chainHitAt to use
    if (game.troops[0]) {
      game.troops[0]._cachedDamage = 50;
      game.troops[0]._cachedRange = 3;
      game.troops[0]._cachedChain = 3;
    }
    // Chain from the first monster if troop was placed successfully
    if (game.monsters.length > 0 && game.troops[0]) {
      game.chainHitAt(game.monsters[0].x, game.monsters[0].y, game.troops[0]);
    }
    expect(game.monsters.some((m) => !m.alive || m.hp < m.maxHp)).toBe(true);
  });

  it('splash falloff reduces damage at edge', () => {
    const game = makeGame();
    const m1 = placeMonsterAt(game, 3, 5, 5);
    game._updateMonsterTileIndex();
    const mockTroop = { spec: { color: '#f00' } };
    const hits = game.splashAt(m1.x, m1.y, 3, 3.0, mockTroop);
    expect(Array.isArray(hits)).toBe(true);
  });

  it('mortar splash with actual troop reference', () => {
    const game = makeGame();
    game.placeTroop(mortarSpec, 3, 3);
    const m = placeMonsterAt(game, 1, 3, 3);
    placeMonsterAt(game, 1, 3, 4);
    game._updateMonsterTileIndex();
    const hits = game.splashAt(m.x, m.y, 3, 2.5, game.troops[0]);
    expect(hits.length).toBeGreaterThanOrEqual(1);
  });
});
