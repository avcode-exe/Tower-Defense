import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import { CONFIG, MONSTER_SPECS } from '../src/config.js';
import { Grid, TILE } from '../src/grid.js';

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

describe('monster integration', () => {
  let makeGame, placeMonsterAt, swordsmanSpec;

  beforeAll(async () => {
    const helpers = await import('./helpers.js');
    makeGame = helpers.makeGame;
    placeMonsterAt = helpers.placeMonsterAt;
    swordsmanSpec = helpers.swordsmanSpec;
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('monster spawning creates entity', () => {
    const game = makeGame();
    game.spawnMonster(1);
    expect(game.monsters.length).toBe(1);
    expect(game.monsters[0].alive).toBe(true);
  });

  it('monster movement advances distance', () => {
    const game = makeGame();
    game.spawnMonster(1);
    const m = game.monsters[0];
    const initialDist = m.distance;
    m.update(1, game._troopTileIndex, []);
    expect(m.distance).toBeGreaterThan(initialDist);
  });

  it('monster reaches end when distance >= totalLength', () => {
    const game = makeGame();
    game.spawnMonster(1);
    const m = game.monsters[0];
    m.distance = m.totalLength + 100;
    m.update(0.1, game._troopTileIndex, []);
    expect(m.reachedEnd).toBe(true);
  });

  it('damage reduces HP', () => {
    const game = makeGame();
    game.spawnMonster(1);
    const m = game.monsters[0];
    const hpBefore = m.hp;
    game.damageMonster(m, 10);
    expect(m.hp).toBeLessThan(hpBefore);
  });

  it('monster death removes from game via step cleanup', () => {
    const game = makeGame();
    game.spawnMonster(1);
    game.monsters[0].hp = 0;
    game.monsters[0].alive = false;
    game._cleanupDead();
    expect(game.monsters.length).toBe(0);
  });

  it('boss has extra HP', () => {
    const game = makeGame();
    game.spawnMonster('B');
    const m = game.monsters[0];
    expect(m.maxHp).toBeGreaterThan(MONSTER_SPECS.B.hp);
  });

  it('shielded monster has initial shield', () => {
    const game = makeGame();
    game.spawnMonster('S');
    const m = game.monsters[0];
    expect(m.shield).toBeGreaterThan(0);
  });

  it('spear monster has slow attack mode', () => {
    const game = makeGame();
    game.spawnMonster('X');
    const m = game.monsters[0];
    expect(m.spec.attackMode).toBe('slow');
    expect(m.spec.attackRange).toBeGreaterThan(1);
  });
});
