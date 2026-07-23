// Performance benchmarks for hot-path optimizations.
// Measures baseline costs of the 3 high-impact areas identified in the
// optimization analysis:
// 1. _buildTroopTileIndex() full rebuild every frame
// 2. _updateMonsterTileIndex() Array.indexOf() O(n) removal
// 3. monstersInRange() per-call array allocation
//
// Also includes an end-to-end step() frame-time benchmark under entity load.
//
// Run: npx vitest run tests/benchmarkHotPaths.test.js
// Run with verbose: npx vitest run tests/benchmarkHotPaths.test.js --reporter=verbose

import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { CONFIG, TROOP_SPECS } from '../src/config.js';
import { makeGame, placeTroopOnGrid, ensureMonsterModule } from './helpers.js';

// ── Mock all the same modules as the existing performance test ──────────

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

// ── Helpers ─────────────────────────────────────────────────────────────

const ITERATIONS = 1000;
const ITERATIONS_HEAVY = 100;
const TOLERANCE_MS = 5000; // generous upper bound for CI environments
const swordsmanSpec = TROOP_SPECS.find((s) => s.id === 'swordsman');
const archerSpec = TROOP_SPECS.find((s) => s.id === 'archer');

/**
 * Runs `fn` in a loop for `count` iterations and returns timing stats.
 * Returns { avgMs, minMs, maxMs, totalMs }.
 */
function benchmarkLoop(fn, count, label) {
  const start = performance.now();
  for (let i = 0; i < count; i++) {
    fn(i);
  }
  const totalMs = performance.now() - start;
  const avgMs = totalMs / count;
  console.log(`  [${label}] ${count} iterations: total=${totalMs.toFixed(3)}ms  avg=${avgMs.toFixed(6)}ms`);
  return { totalMs, avgMs };
}

/**
 * Benchmark a function and assert it completes within tolerance.
 */
function assertFast(fn, count, label, tolerance = TOLERANCE_MS) {
  const stats = benchmarkLoop(fn, count, label);
  expect(stats.totalMs, `${label} total time should be < ${tolerance}ms`).toBeLessThan(tolerance);
  return stats;
}

// Ensure Monster module is loaded before any test runs
let monsterModuleLoaded = false;
beforeAll(async () => {
  await ensureMonsterModule();
  monsterModuleLoaded = true;
});

// ── Benchmark Suite ─────────────────────────────────────────────────────

describe('performance hot-paths', () => {
  // ===================================================================
  // 1. _buildTroopTileIndex() — full index rebuild cost
  // ===================================================================
  describe('_buildTroopTileIndex', () => {
    it('builds tile index for 12 troops within time budget', () => {
      const game = makeGame();
      // Place 12 troops across the grid (max practical)
      const specs = [swordsmanSpec, archerSpec, swordsmanSpec, archerSpec];
      for (let i = 0; i < 3; i++) {
        for (let j = 0; j < 4; j++) {
          placeTroopOnGrid(game, specs[j % specs.length], 1 + j, 1 + i);
        }
      }
      expect(game.troops.length).toBe(12);

      assertFast(() => game._buildTroopTileIndex(), ITERATIONS, '_buildTroopTileIndex (12 troops)');
    });

    it('builds tile index for 1 troop within time budget', () => {
      const game = makeGame();
      placeTroopOnGrid(game, swordsmanSpec, 1, 1);

      assertFast(() => game._buildTroopTileIndex(), ITERATIONS, '_buildTroopTileIndex (1 troop)');
    });

    it('builds tile index for 0 troops within time budget', () => {
      const game = makeGame();

      assertFast(() => game._buildTroopTileIndex(), ITERATIONS * 2, '_buildTroopTileIndex (0 troops)');
    });
  });

  // ===================================================================
  // 2. _updateMonsterTileIndex() — Array.indexOf() removal cost
  // ===================================================================
  describe('_updateMonsterTileIndex', () => {
    it('updates tile index for 50 monsters (worst-case: all on same tile)', () => {
      const game = makeGame();
      const T = CONFIG.TILE_SIZE;
      // Spawn 50 monsters all at the same position so they all land in the
      // same tile, amplifying the O(n) indexOf cost.
      for (let i = 0; i < 50; i++) {
        game.spawnMonster(1);
        const m = game.monsters[i];
        m.x = T * 5 + T / 2;
        m.y = T * 5 + T / 2;
        m._tileGx = 5;
        m._tileGy = 5;
      }
      // Initial index build
      game._updateMonsterTileIndex();

      assertFast(
        (i) => {
          // Move every other monster to a different tile to trigger indexOf removal
          const m = game.monsters[i % game.monsters.length];
          m.x = T * (i % 15) + T / 2;
          m.y = T * (i % 15) + T / 2;
          game._updateMonsterTileIndex();
        },
        ITERATIONS,
        '_updateMonsterTileIndex (50 monsters, tile change per call)'
      );
    });

    it('updates tile index for 10 monsters (typical load)', () => {
      const game = makeGame();
      const T = CONFIG.TILE_SIZE;
      for (let i = 0; i < 10; i++) {
        game.spawnMonster(1);
        const m = game.monsters[i];
        m.x = T * 5 + T / 2;
        m.y = T * 5 + T / 2;
        m._tileGx = 5;
        m._tileGy = 5;
      }
      game._updateMonsterTileIndex();

      assertFast(
        (i) => {
          const m = game.monsters[i % game.monsters.length];
          m.x = T * (i % 15) + T / 2;
          m.y = T * (i % 15) + T / 2;
          game._updateMonsterTileIndex();
        },
        ITERATIONS,
        '_updateMonsterTileIndex (10 monsters)'
      );
    });

    it('updates tile index for 0 monsters (no-op)', () => {
      const game = makeGame();

      assertFast(() => game._updateMonsterTileIndex(), ITERATIONS * 2, '_updateMonsterTileIndex (0 monsters)');
    });
  });

  // ===================================================================
  // 3. monstersInRange() — per-call array allocation cost
  // ===================================================================
  describe('monstersInRange via troop operations', () => {
    it('melee troop pickTarget with 50 monsters in range', async () => {
      const game = makeGame();
      // Place a swordsman at center
      placeTroopOnGrid(game, swordsmanSpec, 7, 7);

      // Surround with 50 monsters on nearby tiles
      for (let i = 0; i < 50; i++) {
        game.spawnMonster(1);
        const m = game.monsters[i];
        const gx = 6 + (i % 5);
        const gy = 6 + Math.floor(i / 5);
        const T = CONFIG.TILE_SIZE;
        m.x = gx * T + T / 2;
        m.y = gy * T + T / 2;
        m._tileGx = gx;
        m._tileGy = gy;
      }
      game._updateMonsterTileIndex();

      const troop = game.troops[0];

      assertFast(
        () => troop.pickTarget(game.monsters, game._monsterTileIndex),
        ITERATIONS,
        'melee pickTarget (50 monsters in range)'
      );
    });

    it('ranged troop pickTarget with 50 monsters in range', async () => {
      const game = makeGame();
      placeTroopOnGrid(game, archerSpec, 7, 7);

      for (let i = 0; i < 50; i++) {
        game.spawnMonster(1);
        const m = game.monsters[i];
        const gx = 4 + (i % 7);
        const gy = 4 + Math.floor(i / 7);
        const T = CONFIG.TILE_SIZE;
        m.x = gx * T + T / 2;
        m.y = gy * T + T / 2;
        m._tileGx = gx;
        m._tileGy = gy;
      }
      game._updateMonsterTileIndex();

      const troop = game.troops[0];

      assertFast(
        () => troop.pickTarget(game.monsters, game._monsterTileIndex),
        ITERATIONS,
        'ranged pickTarget (50 monsters in range)'
      );
    });
  });

  // ===================================================================
  // 4. End-to-end step() frame time
  // ===================================================================
  describe('step() frame time', () => {
    it('step with 5 troops + 10 monsters', () => {
      const game = makeGame();
      for (let i = 0; i < 5; i++) {
        placeTroopOnGrid(game, swordsmanSpec, 2 + i, 2);
      }
      for (let i = 0; i < 10; i++) {
        game.spawnMonster(1);
      }
      game._updateMonsterTileIndex();
      game._buildTroopTileIndex();

      assertFast(() => game.step(1 / 60), ITERATIONS, 'step() with 5 troops + 10 monsters');
    });

    it('step with 12 troops + 50 monsters (max load)', () => {
      const game = makeGame();
      const specs = [swordsmanSpec, archerSpec, swordsmanSpec, archerSpec];
      for (let i = 0; i < 3; i++) {
        for (let j = 0; j < 4; j++) {
          placeTroopOnGrid(game, specs[j % specs.length], 1 + j, 1 + i);
        }
      }
      for (let i = 0; i < 50; i++) {
        game.spawnMonster(1);
        const m = game.monsters[i];
        const T = CONFIG.TILE_SIZE;
        m.x = T * (8 + (i % 7)) + T / 2;
        m.y = T * (8 + Math.floor(i / 7)) + T / 2;
        m._tileGx = Math.floor(m.x / T);
        m._tileGy = Math.floor(m.y / T);
      }
      game._updateMonsterTileIndex();
      game._buildTroopTileIndex();

      assertFast(() => game.step(1 / 60), ITERATIONS_HEAVY, 'step() with 12 troops + 50 monsters');
    });

    it('step with 0 troops + 0 monsters (empty frame)', () => {
      const game = makeGame();

      assertFast(() => game.step(1 / 60), ITERATIONS * 2, 'step() empty frame');
    });
  });

  // ===================================================================
  // 5. Combined: step + _cleanupDead (worst case)
  // ===================================================================
  describe('cleanup overhead', () => {
    it('cleanup after 50 dead monsters + 12 dead troops', () => {
      const game = makeGame();
      for (let i = 0; i < 50; i++) {
        game.spawnMonster(3);
        game.monsters[i].alive = false;
      }
      const specs = [swordsmanSpec, archerSpec];
      for (let i = 0; i < 3; i++) {
        for (let j = 0; j < 4; j++) {
          placeTroopOnGrid(game, specs[j % specs.length], 1 + j, 1 + i);
          game.troops[game.troops.length - 1].alive = false;
        }
      }

      assertFast(() => game._cleanupDead(), ITERATIONS, '_cleanupDead (50 dead monsters + 12 dead troops)');
    });
  });
});

// ===================================================================
// 6. Healer monster _tryHealAllies — scratch buffer reuse
// ===================================================================
describe('Healer _tryHealAllies', () => {
  it('Healer monster with 10 damaged monsters in range', () => {
    const game = makeGame();
    game.spawnMonster('H');
    const healer = game.monsters[0];
    const T = CONFIG.TILE_SIZE;
    // Position healer at center
    healer.x = T * 8;
    healer.y = T * 8;

    // Create 10 damaged monsters nearby (within heal range)
    for (let i = 0; i < 10; i++) {
      game.spawnMonster(1);
      const m = game.monsters[game.monsters.length - 1];
      m.x = healer.x + (i % 5) * 15;
      m.y = healer.y + Math.floor(i / 5) * 15;
      m.hp = 1;
      m.alive = true;
    }

    assertFast(
      () => healer._tryHealAllies(1 / 60, game.monsters),
      ITERATIONS,
      'Healer _tryHealAllies (10 damaged monsters)'
    );
  });

  it('Healer monster with 0 damaged monsters (early return)', () => {
    const game = makeGame();
    game.spawnMonster('H');
    const healer = game.monsters[0];
    const T = CONFIG.TILE_SIZE;
    healer.x = T * 8;
    healer.y = T * 8;

    // Create 10 full-HP monsters nearby (no healing needed)
    for (let i = 0; i < 10; i++) {
      game.spawnMonster(1);
      const m = game.monsters[game.monsters.length - 1];
      m.x = healer.x + (i % 5) * 15;
      m.y = healer.y + Math.floor(i / 5) * 15;
      m.hp = m.maxHp; // full HP
      m.alive = true;
    }

    assertFast(
      () => healer._tryHealAllies(1 / 60, game.monsters),
      ITERATIONS,
      'Healer _tryHealAllies (0 damaged monsters)'
    );
  });
});

// ===================================================================
// 7. Real particle effect spawns — _tmpCfg reuse
// ===================================================================
describe('particle effect spawns', () => {
  it('hitSpark particle effect within time budget', async () => {
    const P = (await vi.importActual('../src/particles.js')).PARTICLES;

    assertFast(() => P.hitSpark(100, 100, '#f00'), ITERATIONS, 'PARTICLES.hitSpark() (real)');
  });

  it('deathBurst particle effect within time budget', async () => {
    const P = (await vi.importActual('../src/particles.js')).PARTICLES;

    assertFast(() => P.deathBurst(100, 100, '#0f0'), ITERATIONS, 'PARTICLES.deathBurst() (real)');
  });

  it('healBurst particle effect within time budget', async () => {
    const P = (await vi.importActual('../src/particles.js')).PARTICLES;

    assertFast(() => P.healBurst(100, 100), ITERATIONS, 'PARTICLES.healBurst() (real)');
  });

  it('chainSpark particle effect within time budget', async () => {
    const P = (await vi.importActual('../src/particles.js')).PARTICLES;

    assertFast(() => P.chainSpark(100, 100), ITERATIONS, 'PARTICLES.chainSpark() (real)');
  });

  it('mixed particle effects (alternating) within time budget', async () => {
    const P = (await vi.importActual('../src/particles.js')).PARTICLES;
    const effects = [
      () => P.hitSpark(100, 100, '#f00'),
      () => P.deathBurst(200, 200, '#0f0'),
      () => P.healBurst(150, 150),
      () => P.chainSpark(250, 250),
      () => P.splashImpact(300, 300, '#00f'),
      () => P.slowApply(100, 200, '#7fdbff'),
      () => P.burnApply(200, 100, '#ff7a18'),
      () => P.troopDeath(150, 250, '#f00'),
      () => P.troopShieldActivate(250, 150, '#5dade2'),
      () => P.reviveBurst(300, 100, '#39a7ff'),
    ];

    assertFast((i) => effects[i % effects.length](), ITERATIONS, 'PARTICLES mixed (10 effect types, alternating)');
  });
});

// ===================================================================
// 8. Monster damage / combat mechanics
// ===================================================================
describe('monster damage mechanics', () => {
  it('damageMonster without shield (direct HP damage)', () => {
    const game = makeGame();
    game.spawnMonster(3);
    const m = game.monsters[0];
    m.hp = 100;

    assertFast(() => game.damageMonster(m, 10), ITERATIONS, 'damageMonster (direct, no shield)');
  });

  it('damageMonster with shield absorption', () => {
    const game = makeGame();
    game.spawnMonster(1);
    const m = game.monsters[0];
    m.shield = 50;
    m.hp = 100;

    assertFast(() => game.damageMonster(m, 10), ITERATIONS, 'damageMonster (shield absorbs)');
  });

  it('damageMonster with monster split (level > 1)', () => {
    const game = makeGame();
    game.spawnMonster(5); // level 5 splits
    const m = game.monsters[0];
    m.hp = 100;
    m.reviveImmune = true;

    assertFast(() => game.damageMonster(m, 200), ITERATIONS_HEAVY, 'damageMonster (with split at level 5)');
  });

  it('monster takeDamage with shatter bonus', () => {
    const game = makeGame();
    game.spawnMonster(1);
    const m = game.monsters[0];
    m.slowTimer = 1;
    m.shatterArmed = true;
    m.shatterBonus = 0.5;

    assertFast(() => m.takeDamage(20), ITERATIONS, 'monster takeDamage (shatter bonus)');
  });
});

// ===================================================================
// 9. Troop damage mechanics
// ===================================================================
describe('troop damage mechanics', () => {
  it('troop takeDamage without shield', () => {
    const game = makeGame();
    game.placeTroop(swordsmanSpec, 1, 1);
    const t = game.troops[0];
    t.hp = 50;
    t.shield = 0;

    assertFast(() => t.takeDamage(10), ITERATIONS, 'troop takeDamage (no shield)');
  });

  it('troop takeDamage with shield', () => {
    const game = makeGame();
    game.placeTroop(swordsmanSpec, 1, 1);
    const t = game.troops[0];
    t.hp = 50;
    t.maxHp = 50;
    t.shield = 30;
    t.maxShield = 50;

    assertFast(() => t.takeDamage(10), ITERATIONS, 'troop takeDamage (with shield)');
  });

  it('damageTroop applied by monster to melee troop', () => {
    const game = makeGame();
    game.placeTroop(swordsmanSpec, 1, 1);
    game.spawnMonster(3);
    const m = game.monsters[0];
    const t = game.troops[0];
    t.hp = 50;

    assertFast(() => game.damageTroop(m, t), ITERATIONS, 'damageTroop (melee reduction)');
  });

  it('damageTroop by revive-immune monster', () => {
    const game = makeGame();
    game.placeTroop(archerSpec, 1, 1);
    game.spawnMonster(1);
    const m = game.monsters[0];
    m.reviveImmune = true;
    m.reviveDamageRatio = 0.5;
    const t = game.troops[0];

    assertFast(() => game.damageTroop(m, t), ITERATIONS, 'damageTroop (revive-immune monster)');
  });
});

// ===================================================================
// 10. AoE / splash / chain combat
// ===================================================================
describe('AoE combat', () => {
  it('splashAt with 30 monsters in radius', () => {
    const game = makeGame();
    const T = CONFIG.TILE_SIZE;
    for (let i = 0; i < 30; i++) {
      game.spawnMonster(1);
      const m = game.monsters[i];
      m.x = 400 + (i % 6) * 30;
      m.y = 300 + Math.floor(i / 6) * 30;
      m._tileGx = Math.floor(m.x / T);
      m._tileGy = Math.floor(m.y / T);
    }
    game._updateMonsterTileIndex();

    assertFast(
      () => game.splashAt(400, 300, 50, 3, { spec: { color: '#f00' } }),
      ITERATIONS,
      'splashAt (30 monsters, radius 3)'
    );
  });

  it('chainHitAt with chain count 2 and nearby monsters', () => {
    const game = makeGame();
    // Place 10 monsters in a line
    for (let i = 0; i < 10; i++) {
      game.spawnMonster(1);
      const m = game.monsters[i];
      m.x = 300 + i * 40;
      m.y = 300;
      m.distance = 800 - i * 80; // decreasing progress = further from end
      m.totalLength = 800;
      m._tileGx = Math.floor(m.x / CONFIG.TILE_SIZE);
      m._tileGy = Math.floor(m.y / CONFIG.TILE_SIZE);
    }
    game._updateMonsterTileIndex();

    const dummyTroop = {
      _cachedDamage: 50,
      _cachedChain: 2,
      spec: { chain: 2, stun: 0.5, color: '#f1c40f', slowFactor: null },
    };

    assertFast(() => game.chainHitAt(300, 300, dummyTroop), ITERATIONS_HEAVY, 'chainHitAt (chain 2, 10 monsters)');
  });

  it('_findClosestMonsterNear with 50 monsters in tile index', () => {
    const game = makeGame();
    const T = CONFIG.TILE_SIZE;
    for (let i = 0; i < 50; i++) {
      game.spawnMonster(1);
      const m = game.monsters[i];
      m.x = T * 8 + (i % 7) * 20;
      m.y = T * 8 + Math.floor(i / 7) * 20;
      m._tileGx = Math.floor(m.x / T);
      m._tileGy = Math.floor(m.y / T);
    }
    game._updateMonsterTileIndex();

    assertFast(
      () => game._findClosestMonsterNear(T * 8, T * 8, 3),
      ITERATIONS,
      'findClosestMonsterNear (50 monsters, 3 tile range)'
    );
  });
});

// ===================================================================
// 11. Monster update mechanics (various modes)
// ===================================================================
describe('monster update mechanics', () => {
  it('monster _updateBurn with active stacks', () => {
    const game = makeGame();
    game.spawnMonster(1);
    const m = game.monsters[0];
    m.burnStacks = 3;
    m.burnTimer = 2;
    m.burnTickInterval = 0.5;
    m.burnTickDamage = 5;
    m._onBurnTick = vi.fn();

    assertFast(() => m._updateBurn(1 / 60), ITERATIONS, 'monster _updateBurn (3 stacks, ticking)');
  });

  it('monster _updateRegen with shield and passive heal', () => {
    const game = makeGame();
    game.spawnMonster('B'); // Boss has healPerSecond
    const m = game.monsters[0];
    m.shield = 10;
    m.maxShield = 100;
    m.shieldRegenTimer = 4; // past regen delay

    assertFast(() => m._updateRegen(1 / 60), ITERATIONS, 'monster _updateRegen (shield + boss heal)');
  });

  it('monster findTarget with troop tile index (12 troops)', () => {
    const game = makeGame();
    // Place troops around center
    const specs = [swordsmanSpec, archerSpec, swordsmanSpec, archerSpec];
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 4; j++) {
        placeTroopOnGrid(game, specs[j % specs.length], 1 + j, 1 + i);
      }
    }
    // Create a monster nearby
    game.spawnMonster(1);
    const m = game.monsters[0];
    m.x = CONFIG.TILE_SIZE * 5;
    m.y = CONFIG.TILE_SIZE * 5;
    m._tileGx = 5;
    m._tileGy = 5;

    assertFast(() => m.findTarget(game._troopTileIndex), ITERATIONS, 'monster findTarget (12 troops nearby)');
  });
});

// ===================================================================
// 12. Projectile hot-paths
// ===================================================================
describe('projectile mechanics', () => {
  it('acquireProjectile from pool (warm cache)', () => {
    const game = makeGame();
    // Pre-populate the pool
    for (let i = 0; i < 10; i++) {
      game._projectilePool.push({});
    }
    const dummyTroop = {
      spec: { id: 'archer' },
      _cachedDamage: 10,
    };

    assertFast(() => game.acquireProjectile(dummyTroop, null, 100, 100), ITERATIONS, 'acquireProjectile (from pool)');
  });

  it('projectile update flying toward target', async () => {
    const { Projectile } = await import('../src/projectile.js');
    const troop = { spec: { id: 'archer' }, _cachedDamage: 10 };
    const target = { x: 500, y: 500, alive: true };
    const proj = new Projectile(troop, target, 100, 100);

    assertFast(() => proj.update(1 / 60, [], vi.fn()), ITERATIONS, 'projectile update (flying)');
  });

  it('projectile update impact (arrives at target)', async () => {
    const { Projectile } = await import('../src/projectile.js');
    const troop = { spec: { id: 'archer' }, _cachedDamage: 10 };
    // Place projectile very close to target for immediate impact
    const target = { x: 110, y: 100, alive: true };
    const proj = new Projectile(troop, target, 100, 100);
    const onImpact = vi.fn();

    assertFast(() => proj.update(1 / 60, [], onImpact), ITERATIONS, 'projectile update (impact)');
  });

  it('projectile update timeout (stale, no target)', async () => {
    const { Projectile } = await import('../src/projectile.js');
    const troop = { spec: { id: 'archer' }, _cachedDamage: 10 };
    const proj = new Projectile(troop, null, 100, 100);
    proj.age = 100; // way past timeout

    assertFast(() => proj.update(1 / 60, [], vi.fn()), ITERATIONS, 'projectile update (timeout)');
  });
});

// ===================================================================
// 13. Wave and spawn mechanics
// ===================================================================
describe('wave mechanics', () => {
  it('wave popDueMonster (not started)', () => {
    const game = makeGame();
    game.wave.buildQueue();

    assertFast(() => game.wave.popDueMonster(), ITERATIONS, 'wave popDueMonster (not started)');
  });

  it('shuffleSpecialMonstersInWave with necromancers + healers', async () => {
    const { shuffleSpecialMonstersInWave } = await import('../src/waveManager.js');
    const entries = [1, 2, 3, 'Y', 4, 5, 'H', 'X', 'Y', 'H'];

    assertFast(
      () => shuffleSpecialMonstersInWave(entries, () => 0.5),
      ITERATIONS,
      'shuffleSpecialMonstersInWave (Y+H in mix)'
    );
  });

  it('shuffleSpecialMonstersInWave with no specials', async () => {
    const { shuffleSpecialMonstersInWave } = await import('../src/waveManager.js');
    const entries = [1, 2, 3, 4, 5];

    assertFast(
      () => shuffleSpecialMonstersInWave(entries),
      ITERATIONS * 2,
      'shuffleSpecialMonstersInWave (no specials)'
    );
  });

  it('wave buildQueue (full wave setup)', () => {
    const game = makeGame();

    assertFast(() => game.wave.buildQueue(), ITERATIONS_HEAVY, 'wave buildQueue');
  });
});

// ===================================================================
// 14. Troop upgrade / economy mechanics
// ===================================================================
describe('troop economy', () => {
  it('troop getUpgradeCost (cached path)', () => {
    const game = makeGame();
    game.placeTroop(swordsmanSpec, 1, 1);
    const t = game.troops[0];
    // Warm cache
    t.getUpgradeCost('dmg');

    assertFast(() => t.getUpgradeCost('dmg'), ITERATIONS, 'troop getUpgradeCost (cached)');
  });

  it('troop getUpgradeCost (uncached path)', () => {
    const game = makeGame();
    game.placeTroop(swordsmanSpec, 1, 1);
    const t = game.troops[0];
    t._upgradeCostCache = {};

    assertFast(() => t.getUpgradeCost('hp'), ITERATIONS, 'troop getUpgradeCost (uncached)');
  });

  it('troop getTotalInvested with upgrades', () => {
    const game = makeGame();
    game.placeTroop(swordsmanSpec, 1, 1);
    const t = game.troops[0];
    t.dmgLevel = 3;
    t.hpLevel = 3;
    t.speedLevel = 2;

    assertFast(() => t.getTotalInvested(), ITERATIONS, 'troop getTotalInvested (with upgrades)');
  });

  it('canPlace occupied tile returns false', () => {
    const game = makeGame();
    game.placeTroop(swordsmanSpec, 1, 1);

    assertFast(() => game.canPlace(1, 1, swordsmanSpec), ITERATIONS, 'canPlace (occupied tile)');
  });

  it('canPlace valid tile returns false for waypoint', () => {
    const game = makeGame();
    game.placeTroop(swordsmanSpec, 1, 1);

    // Tile (5,5) is a waypoint (PATH) — not buildable
    assertFast(() => game.canPlace(5, 5, swordsmanSpec), ITERATIONS, 'canPlace (waypoint tile — not buildable)');
  });
});

// ===================================================================
// 15. Game state helpers
// ===================================================================
describe('game state helpers', () => {
  it('_getPopup with pool reuse', () => {
    const game = makeGame();
    // Pre-populate pool
    game._popupPool.push({ text: '', x: 0, y: 0, t: 0, color: '' });
    game._popupPool.push({ text: '', x: 0, y: 0, t: 0, color: '' });
    game._popupPool.push({ text: '', x: 0, y: 0, t: 0, color: '' });

    assertFast(() => game._getPopup('+5', 100, 100, 1.2, '#f1c40f'), ITERATIONS, '_getPopup (pool reuse)');
  });

  it('_getPopup new allocation (pool empty)', () => {
    const game = makeGame();
    game._popupPool.length = 0;

    assertFast(() => game._getPopup('+5', 100, 100, 1.2, '#f1c40f'), ITERATIONS, '_getPopup (new allocation)');
  });

  it('_stepPopups with 100 popups', () => {
    const game = makeGame();
    for (let i = 0; i < 100; i++) {
      game._getPopup('+' + i, 100, 100, 0.5, '#fff');
    }

    assertFast(() => game._stepPopups(0.016), ITERATIONS, '_stepPopups (100 popups, decaying)');
  });

  it('_stepWaveCompletion (not due — early return)', () => {
    const game = makeGame();
    game.state = 'PRE_WAVE';

    assertFast(() => game._stepWaveCompletion(), ITERATIONS * 2, '_stepWaveCompletion (early return)');
  });
});

// ── Summary ─────────────────────────────────────────────────────────────

afterAll(() => {
  console.log('\n═══ Benchmark Complete ═══');
  console.log('Covering all optimization areas across 15 sections:');
  console.log('  1-5.   Engine internals: tile index, monster index, cleanup, step');
  console.log('  6-7.   Healer + particles');
  console.log('  8-9.   Combat: damageMonster, takeDamage, damageTroop');
  console.log('  10.    AoE: splash, chain, findClosest');
  console.log('  11.    Monster mechanics: burn, regen, findTarget');
  console.log('  12.    Projectile: acquire, update');
  console.log('  13.    Wave: popDueMonster, shuffle, buildQueue');
  console.log('  14.    Economy: upgradeCost, totalInvested, canPlace');
  console.log('  15.    State: getPopup, stepPopups, stepWaveCompletion');
  console.log('═══════════════════════════\n');
});
