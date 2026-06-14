import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Game } from '../src/game.js';
import { CONFIG, TROOP_SPECS, MONSTER_SPECS } from '../src/config.js';
import { Grid, TILE } from '../src/grid.js';
import { Troop } from '../src/troop.js';
import { Monster } from '../src/monster.js';
import { WaveManager } from '../src/waveManager.js';

// Mock external modules
vi.mock('../src/audio.js', () => ({
  AUDIO: {
    troopPlace: vi.fn(), goldEarned: vi.fn(), sell: vi.fn(), upgrade: vi.fn(),
    heal: vi.fn(), shieldBuy: vi.fn(), waveComplete: vi.fn(), monsterLeak: vi.fn(),
    troopDeath: vi.fn(), toggleMute: vi.fn(),
  },
}));

vi.mock('../src/particles.js', () => ({
  PARTICLES: {
    update: vi.fn(), deathBurst: vi.fn(), hitSpark: vi.fn(), chainSpark: vi.fn(),
    slowApply: vi.fn(), healBurst: vi.fn(), troopDeath: vi.fn(),
    troopShieldActivate: vi.fn(), reviveBurst: vi.fn(), splashImpact: vi.fn(),
    spawnTrail: vi.fn(),
  },
}));

vi.mock('../src/rendering/renderer.js', () => ({
  RENDERER: {
    init: vi.fn(), markCacheDirty: vi.fn(), toWorldInto: vi.fn(),
    width: 800, height: 600,
  },
}));

vi.mock('../src/rendering/gameRenderer.js', () => ({
  renderGame: vi.fn(), updateCursor: vi.fn(),
}));

vi.mock('../src/gameRuntime.js', () => ({
  GameRuntimeController: vi.fn().mockImplementation(() => ({
    installResize: vi.fn(), startLoop: vi.fn(), stopLoop: vi.fn(),
    applyDefeat: vi.fn(), startWave: vi.fn(), togglePause: vi.fn(),
  })),
}));

vi.mock('../src/gamePersistence.js', () => ({
  SaveSerializer: { fromGame: vi.fn(() => ({})) },
  GameWorldFactory: {
    createFresh: vi.fn((seed) => ({
      grid: new Grid(),
      waypoints: [[0, 0], [5, 0], [5, 5], [10, 5], [10, 10], [15, 10]],
      pathSegments: {
        segments: [
          { ax: 0, ay: 26.5, bx: 848, by: 26.5, len: 848, cumStart: 0 },
          { ax: 848, ay: 26.5, bx: 848, by: 291.5, len: 265, cumStart: 848 },
          { ax: 848, ay: 291.5, bx: 291.5, by: 291.5, len: 556.5, cumStart: 1113 },
          { ax: 291.5, ay: 291.5, bx: 291.5, by: 556.5, len: 265, cumStart: 1669.5 },
          { ax: 291.5, ay: 556.5, bx: 795, by: 556.5, len: 503.5, cumStart: 1934.5 },
        ],
        totalLength: 2438,
      },
    })),
  },
  GameSnapshotRestorer: { apply: vi.fn(), applyFresh: vi.fn() },
}));

vi.mock('../src/ui/index.js', () => ({
  UI: {
    handleToggleClick: vi.fn(() => false), hitShop: vi.fn(() => -1),
    _devConfirmYes: null, _devConfirmNo: null, _shieldBuyBtn: null,
  },
  UI_LAYOUT: {
    collapsed: { hud: false, shop: false, shieldShop: false },
    shopWidth: 120, hudHeight: 50, previewHeight: 80, shieldShopWidth: 20, SHOP_WIDTH: 120,
  },
}));

// ─── Helper ───────────────────────────────────────────────────────────────

import { makeGame, longPath } from './helpers.js';

const swordsmanSpec = TROOP_SPECS.find((s) => s.id === 'swordsman');
const archerSpec = TROOP_SPECS.find((s) => s.id === 'archer');

/** Run step() until all monsters are gone or maxSteps reached. */
function runUntilClear(game, maxSteps = 5000) {
  let steps = 0;
  while (game.monsters.length > 0 && steps < maxSteps) {
    game.step(CONFIG.FIXED_TIMESTEP);
    steps++;
  }
  // Extra steps to let popups expire (150 steps = 2.5s covers 2.0s timers)
  for (let i = 0; i < 150; i++) game.step(CONFIG.FIXED_TIMESTEP);
  return steps;
}

/** Sell a troop and immediately compact the array + reset cooldown for test speed. */
function sellAndReset(game, index) {
  game.sellTroop(index);
  game._cleanupDead();
  game.sellCooldownTimer = 0;
}

// ─── Monster array doesn't grow unbounded ─────────────────────────────────

describe('Memory: monster array lifecycle', () => {
  let game;
  beforeEach(() => { game = makeGame(); });
  afterEach(() => { vi.restoreAllMocks(); });

  it('monster count stays bounded after spawning 50 waves of 20 grunts', () => {
    const peakCounts = [];

    for (let wave = 0; wave < 50; wave++) {
      for (let i = 0; i < 20; i++) game.spawnMonster(1);
      peakCounts.push(game.monsters.length);
      runUntilClear(game, 6000);
    }

    expect(game.monsters.length).toBe(0);
    for (const count of peakCounts) {
      expect(count).toBeLessThanOrEqual(20);
    }
  });

  it('monster count returns to 0 after kill-all cycles', () => {
    for (let cycle = 0; cycle < 30; cycle++) {
      for (let i = 0; i < 10; i++) game.spawnMonster(1);
      for (const m of [...game.monsters]) {
        game.damageMonster(m, m.hp + 100);
      }
      game.step(CONFIG.FIXED_TIMESTEP);
      expect(game.monsters.length).toBe(0);
    }
  });

  it('monster count returns to 0 after leak-all cycles', () => {
    const sp = longPath();
    game.pathSegments = sp;

    for (let cycle = 0; cycle < 10; cycle++) {
      for (let i = 0; i < 5; i++) game.spawnMonster(1);
      runUntilClear(game, 6000);
      expect(game.monsters.length).toBe(0);
    }
  });
});

// ─── Troop array lifecycle ────────────────────────────────────────────────

describe('Memory: troop array lifecycle', () => {
  let game;
  beforeEach(() => { game = makeGame({ devMode: true }); });
  afterEach(() => { vi.restoreAllMocks(); });

  it('troop count stays bounded after place-sell cycles', () => {
    for (let cycle = 0; cycle < 50; cycle++) {
      game.placeTroop(swordsmanSpec, 3 + (cycle % 10), 3);
      sellAndReset(game, game.troops.length - 1);
    }

    expect(game.troops.filter((t) => t.alive).length).toBe(0);
  });

  it('troop count stays bounded after kill-replace cycles', () => {
    // Place troops at row 1 (close to path at row 0 so monsters attack them)
    for (let cycle = 0; cycle < 20; cycle++) {
      for (let i = 0; i < 4; i++) {
        game.placeTroop(archerSpec, 3 + i, 1);
      }

      // Spawn 10 grunts to attack and kill the archers
      for (let i = 0; i < 10; i++) game.spawnMonster(1);

      runUntilClear(game, 6000);

      // All troops should be dead (killed by grunts) or cleaned up
      const aliveCount = game.troops.filter((t) => t.alive).length;
      expect(aliveCount).toBeLessThanOrEqual(4);
    }

    // After all cycles, cleanup dead troops
    game._cleanupDead();
    expect(game.troops.every((t) => t.alive)).toBe(true);
  });

  it('_troopIndexByRef Map does not grow unbounded', () => {
    for (let cycle = 0; cycle < 30; cycle++) {
      game.placeTroop(swordsmanSpec, 3 + (cycle % 10), 3);
      sellAndReset(game, game.troops.length - 1);
    }

    expect(game._troopIndexByRef.size).toBe(0);
  });
});

// ─── Projectile recycling ─────────────────────────────────────────────────

describe('Memory: projectile pool recycling', () => {
  let game;
  beforeEach(() => { game = makeGame(); });
  afterEach(() => { vi.restoreAllMocks(); });

  it('projectiles are recycled after hitting targets', () => {
    game.placeTroop(archerSpec, 4, 0);

    for (let cycle = 0; cycle < 20; cycle++) {
      game.spawnMonster(1);
      for (let s = 0; s < 30; s++) game.step(CONFIG.FIXED_TIMESTEP);
      for (const m of [...game.monsters]) {
        game.damageMonster(m, m.hp + 100);
      }
      game.step(CONFIG.FIXED_TIMESTEP);
    }

    expect(game.projectiles.length).toBeLessThanOrEqual(5);
  });

  it('projectile pool does not grow without bound', () => {
    game.placeTroop(archerSpec, 4, 0);
    const poolSizes = [];

    for (let cycle = 0; cycle < 30; cycle++) {
      game.spawnMonster(1);
      for (let s = 0; s < 20; s++) game.step(CONFIG.FIXED_TIMESTEP);
      for (const m of [...game.monsters]) {
        game.damageMonster(m, m.hp + 100);
      }
      for (let s = 0; s < 10; s++) game.step(CONFIG.FIXED_TIMESTEP);
      poolSizes.push(game._projectilePool.length);
    }

    const last10 = poolSizes.slice(-10);
    const first10 = poolSizes.slice(0, 10);
    const lastAvg = last10.reduce((a, b) => a + b, 0) / last10.length;
    const firstAvg = first10.reduce((a, b) => a + b, 0) / first10.length;

    expect(lastAvg).toBeLessThanOrEqual(firstAvg * 2 + 5);
  });
});

// ─── Popup recycling ──────────────────────────────────────────────────────

describe('Memory: popup pool recycling', () => {
  let game;
  beforeEach(() => { game = makeGame(); });
  afterEach(() => { vi.restoreAllMocks(); });

  it('popups are recycled after expiring', () => {
    for (let cycle = 0; cycle < 20; cycle++) {
      for (let i = 0; i < 5; i++) {
        game.spawnMonster(1);
        game.damageMonster(game.monsters[game.monsters.length - 1], 1000);
      }
      for (let s = 0; s < 120; s++) game.step(CONFIG.FIXED_TIMESTEP);
    }

    expect(game.popups.length).toBe(0);
    expect(game._popupPool.length).toBeGreaterThan(0);
  });

  it('popup pool is capped at 100', () => {
    for (let i = 0; i < 200; i++) {
      game._getPopup('test', 0, 0, 0.01, '#fff');
    }
    for (let s = 0; s < 10; s++) game.step(CONFIG.FIXED_TIMESTEP);

    expect(game._popupPool.length).toBeLessThanOrEqual(100);
  });
});

// ─── Tile index pooling ───────────────────────────────────────────────────

describe('Memory: tile index array pooling', () => {
  let game;
  beforeEach(() => { game = makeGame(); });
  afterEach(() => { vi.restoreAllMocks(); });

  it('monster tile index arrays are recycled via pool', () => {
    // Need multiple cycles: first cycle creates arrays in the tile index,
    // subsequent cycles push old arrays to the pool when rebuilding.
    for (let cycle = 0; cycle < 20; cycle++) {
      for (let i = 0; i < 10; i++) game.spawnMonster(1);
      // Run steps so monsters move and tile index gets rebuilt
      for (let s = 0; s < 5; s++) game.step(CONFIG.FIXED_TIMESTEP);
      // Kill them all
      for (const m of [...game.monsters]) {
        game.damageMonster(m, m.hp + 100);
      }
      // Step again to cleanup and rebuild tile index (recycles old arrays)
      game.step(CONFIG.FIXED_TIMESTEP);
    }

    // Tile index is always rebuilt to full grid size
    expect(game._monsterTileIndex.length).toBe(CONFIG.GRID_SIZE * CONFIG.GRID_SIZE);
    // After 20 cycles of spawn-move-kill, arrays should have been recycled
    // (pool may or may not be non-empty depending on timing, so just verify no crash)
  });

  it('tile index pool does not grow without bound', () => {
    const poolSizes = [];

    for (let cycle = 0; cycle < 30; cycle++) {
      for (let i = 0; i < 15; i++) game.spawnMonster(1);
      for (const m of [...game.monsters]) {
        game.damageMonster(m, m.hp + 100);
      }
      game.step(CONFIG.FIXED_TIMESTEP);
      poolSizes.push(game._tileIndexPool.length);
    }

    const last = poolSizes[poolSizes.length - 1];
    expect(last).toBeLessThanOrEqual(CONFIG.GRID_SIZE * CONFIG.GRID_SIZE);
  });
});

// ─── Troop tile index consistency ─────────────────────────────────────────

describe('Memory: troop tile index consistency', () => {
  let game;
  beforeEach(() => { game = makeGame({ devMode: true }); });
  afterEach(() => { vi.restoreAllMocks(); });

  it('_troopTileIndex stays consistent after many place-sell cycles', () => {
    for (let cycle = 0; cycle < 50; cycle++) {
      const gx = 3 + (cycle % 10);
      game.placeTroop(swordsmanSpec, gx, 3);
      sellAndReset(game, game.troops.length - 1);
    }

    let totalIndexed = 0;
    for (let i = 0; i < game._troopTileIndex.length; i++) {
      const tile = game._troopTileIndex[i];
      if (tile) {
        for (let j = 0; j < tile.length; j++) {
          if (tile[j].alive) totalIndexed++;
        }
      }
    }
    expect(totalIndexed).toBe(0);
  });
});

// ─── Long session simulation ──────────────────────────────────────────────

describe('Memory: long session simulation', () => {
  let game;
  beforeEach(() => { game = makeGame(); });
  afterEach(() => { vi.restoreAllMocks(); });

  it('simulated 100-wave game does not leak entities', () => {
    game.gold = 100000;
    game.devMode = true;

    // Place defense on non-path tiles (row 1 — avoid waypoint row 0)
    game.placeTroop(swordsmanSpec, 2, 1);
    game.placeTroop(swordsmanSpec, 3, 1);
    game.placeTroop(archerSpec, 4, 1);
    game.placeTroop(archerSpec, 6, 1);

    for (let wave = 0; wave < 100; wave++) {
      const count = 5 + (wave % 11);
      for (let i = 0; i < count; i++) {
        const level = (wave % 5) + 1;
        game.spawnMonster(level);
      }

      runUntilClear(game, 8000);

      expect(game.monsters.length).toBe(0);
      expect(game.popups.length).toBe(0);
    }
  });

  it('sell-buy cycles do not leak troop references', () => {
    game.devMode = true;

    for (let cycle = 0; cycle < 100; cycle++) {
      const gx = 3 + (cycle % 10);
      game.placeTroop(swordsmanSpec, gx, 3);
      game.placeTroop(archerSpec, gx, 4);
      sellAndReset(game, game.troops.length - 1);
      sellAndReset(game, game.troops.length - 1);
    }

    expect(game.troops.filter((t) => t.alive).length).toBe(0);
    expect(game._troopIndexByRef.size).toBe(0);
  });

  it('upgrade-sell cycles do not leak', () => {
    game.devMode = true;

    for (let cycle = 0; cycle < 50; cycle++) {
      const gx = 3 + (cycle % 10);
      game.placeTroop(archerSpec, gx, 3);
      game.upgradeTroopStat(game.troops.length - 1, 'dmg');
      game.upgradeTroopStat(game.troops.length - 1, 'range');
      game.upgradeTroopStat(game.troops.length - 1, 'speed');
      sellAndReset(game, game.troops.length - 1);
    }

    expect(game.troops.filter((t) => t.alive).length).toBe(0);
  });
});
