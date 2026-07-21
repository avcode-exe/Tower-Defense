import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import { CONFIG, TROOP_SPECS } from '../src/config.js';
import { TILE } from '../src/grid.js';

vi.mock('../src/audio.js', () => ({
  AUDIO: {
    troopPlace: vi.fn(),
    sell: vi.fn(),
    upgrade: vi.fn(),
    heal: vi.fn(),
    shieldBuy: vi.fn(),
    goldEarned: vi.fn(),
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

describe('dev mode', () => {
  let makeGame, swordsmanSpec;

  beforeAll(async () => {
    const helpers = await import('./helpers.js');
    makeGame = helpers.makeGame;
    swordsmanSpec = helpers.swordsmanSpec;
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('free placement in dev mode', () => {
    const game = makeGame({ devMode: true, gold: 0 });
    const spec = { cost: 1000 };
    expect(game.canPlace(1, 1, spec)).toBe(true);
    expect(game.placeTroop(spec, 1, 1)).toBe(true);
    expect(game.gold).toBe(0);
  });

  it('free upgrade in dev mode', () => {
    const game = makeGame({ devMode: true, gold: 0 });
    game.placeTroop(swordsmanSpec, 1, 1);
    game.upgradeTroopStat(0, 'dmg');
    expect(game.troops[0].dmgLevel).toBe(2);
    expect(game.gold).toBe(0);
  });

  it('free heal in dev mode', () => {
    const game = makeGame({ devMode: true, gold: 0 });
    game.placeTroop(swordsmanSpec, 1, 1);
    game.troops[0].hp = 1;
    game.healTroop(0);
    expect(game.troops[0].hp).toBeGreaterThan(1);
    expect(game.gold).toBe(0);
  });

  it('free shield in dev mode', () => {
    const game = makeGame({ devMode: true, gold: 0 });
    game.placeTroop(swordsmanSpec, 1, 1);
    game.buyTroopShield(0);
    expect(game.troops[0].shield).toBeGreaterThan(0);
    expect(game.gold).toBe(0);
  });

  it('gold is Infinity in dev mode', () => {
    const game = makeGame({ devMode: true });
    game._addGold(100);
    expect(game.gold).toBe(Infinity);
  });

  it('canPlace occupied tile returns false while troop alive in dev mode', () => {
    const game = makeGame({ devMode: true });
    const spec = { cost: 1000 };
    game.placeTroop(spec, 1, 1);
    expect(game.canPlace(1, 1, spec)).toBe(false);
    game.troops[0].alive = false;
    expect(game.canPlace(1, 1, spec)).toBe(true);
  });

  it('sell in dev mode sets alive=false', () => {
    const game = makeGame({ devMode: true });
    game.placeTroop(swordsmanSpec, 1, 1);
    game.sellTroop(0);
    expect(game.troops[0].alive).toBe(false);
  });
});
