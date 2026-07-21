import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CONFIG, TROOP_SPECS } from '../src/config.js';
import { TILE } from '../src/grid.js';

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

describe('gold economy', () => {
  let Game, makeGame, swordsmanSpec;

  beforeAll(async () => {
    const mod = await import('../src/game.js');
    Game = mod.Game;
    const helpers = await import('./helpers.js');
    makeGame = helpers.makeGame;
    swordsmanSpec = helpers.swordsmanSpec;
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('CONFIG constants are correct', () => {
    expect(CONFIG.STARTING_GOLD).toBe(1000);
    expect(CONFIG.SELL_REFUND_RATIO).toBe(0.3);
    expect(CONFIG.MAX_GOLD).toBe(1000000);
  });

  it('placing costs gold (non-dev)', () => {
    const game = makeGame({ devMode: false, gold: 1000 });
    const cost = swordsmanSpec.cost;
    game.placeTroop(swordsmanSpec, 1, 1);
    expect(game.gold).toBe(1000 - cost);
  });

  it('selling refunds ratio of total invested', () => {
    const game = makeGame({ devMode: false, gold: 10000 });
    game.placeTroop(swordsmanSpec, 1, 1);
    const invested = game.troops[0].getTotalInvested();
    const expectedRefund = Math.ceil(invested * CONFIG.SELL_REFUND_RATIO);
    game.sellTroop(0);
    expect(game.gold).toBe(10000 - swordsmanSpec.cost + expectedRefund);
  });

  it('upgrade costs gold', () => {
    const game = makeGame({ devMode: false, gold: 10000 });
    game.placeTroop(swordsmanSpec, 1, 1);
    const cost = game.troops[0].getUpgradeCost('dmg');
    game.upgradeTroopStat(0, 'dmg');
    expect(game.gold).toBe(10000 - swordsmanSpec.cost - cost);
  });

  it('shield purchase costs gold', () => {
    const game = makeGame({ devMode: false, gold: 10000 });
    game.placeTroop(swordsmanSpec, 1, 1);
    game.buyTroopShield(0);
    expect(game.gold).toBeLessThan(10000 - swordsmanSpec.cost);
  });

  it('heal costs gold', () => {
    const game = makeGame({ devMode: false, gold: 10000 });
    game.placeTroop(swordsmanSpec, 1, 1);
    game.troops[0].hp = 1;
    game.healTroop(0);
    expect(game.gold).toBeLessThan(10000 - swordsmanSpec.cost);
  });

  it('monster kill rewards gold', () => {
    const game = makeGame({ devMode: false, gold: 100 });
    game.spawnMonster(1);
    const m = game.monsters[0];
    game.damageMonster(m, 9999);
    expect(game.gold).toBeGreaterThan(100);
  });
});
