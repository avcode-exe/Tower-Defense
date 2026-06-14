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

import { makeGame, longPath } from './helpers.js';

const swordsmanSpec = TROOP_SPECS.find((s) => s.id === 'swordsman');
const archerSpec = TROOP_SPECS.find((s) => s.id === 'archer');
const knightSpec = TROOP_SPECS.find((s) => s.id === 'knight');
const mageSpec = TROOP_SPECS.find((s) => s.id === 'mage');



// ─── Empty step throughput ─────────────────────────────────────────────────

describe('Performance: empty step', () => {
  let game;
  beforeEach(() => { game = makeGame(); });
  afterEach(() => { vi.restoreAllMocks(); });

  it('step() with no entities runs within budget (5ms per step)', () => {
    const start = performance.now();
    const STEPS = 1000;
    for (let i = 0; i < STEPS; i++) game.step(CONFIG.FIXED_TIMESTEP);
    const elapsed = performance.now() - start;
    const avgPerStep = elapsed / STEPS;
    expect(avgPerStep).toBeLessThan(5);
  });

  it('10000 empty steps complete in under 5 seconds', () => {
    const start = performance.now();
    for (let i = 0; i < 10000; i++) game.step(CONFIG.FIXED_TIMESTEP);
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(5000);
  });
});

// ─── Troop placement throughput ────────────────────────────────────────────

describe('Performance: troop placement', () => {
  let game;
  beforeEach(() => { game = makeGame({ devMode: true }); });
  afterEach(() => { vi.restoreAllMocks(); });

  it('placing 50 troops completes within 100ms', () => {
    const start = performance.now();
    let placed = 0;
    for (let i = 0; i < 50; i++) {
      const gx = 3 + (i % 10);
      const gy = 3 + Math.floor(i / 10);
      if (game.placeTroop(swordsmanSpec, gx, gy)) placed++;
    }
    const elapsed = performance.now() - start;
    expect(placed).toBeGreaterThan(20);
    expect(elapsed).toBeLessThan(100);
  });

  it('tile index rebuild after placement completes within 5ms', () => {
    for (let i = 0; i < 20; i++) {
      game.placeTroop(swordsmanSpec, 3 + (i % 10), 3);
    }
    const start = performance.now();
    game._buildTroopTileIndex();
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(5);
  });
});

// ─── Monster spawn throughput ──────────────────────────────────────────────

describe('Performance: monster spawning', () => {
  let game;
  beforeEach(() => { game = makeGame(); });
  afterEach(() => { vi.restoreAllMocks(); });

  it('spawning 100 monsters completes within 50ms', () => {
    const start = performance.now();
    for (let i = 0; i < 100; i++) game.spawnMonster(1);
    const elapsed = performance.now() - start;
    expect(game.monsters).toHaveLength(100);
    expect(elapsed).toBeLessThan(50);
  });

  it('tile index update for 100 monsters completes within 5ms', () => {
    for (let i = 0; i < 100; i++) game.spawnMonster(1);
    for (let s = 0; s < 5; s++) game.step(CONFIG.FIXED_TIMESTEP);
    const start = performance.now();
    game._updateMonsterTileIndex();
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(5);
  });
});

// ─── Step with entity load ─────────────────────────────────────────────────

describe('Performance: step with entities', () => {
  let game;
  beforeEach(() => { game = makeGame({ devMode: true }); });
  afterEach(() => { vi.restoreAllMocks(); });

  it('step with 20 troops + 20 monsters runs within budget (10ms per step)', () => {
    for (let i = 0; i < 20; i++) {
      game.placeTroop(swordsmanSpec, 3 + (i % 10), 3 + Math.floor(i / 10));
    }
    for (let i = 0; i < 20; i++) game.spawnMonster(1);

    const start = performance.now();
    const STEPS = 100;
    for (let i = 0; i < STEPS; i++) game.step(CONFIG.FIXED_TIMESTEP);
    const elapsed = performance.now() - start;
    const avgPerStep = elapsed / STEPS;
    expect(avgPerStep).toBeLessThan(10);
  });

  it('step with 50 troops + 50 monsters runs within budget (20ms per step)', () => {
    for (let i = 0; i < 50; i++) {
      const gx = 3 + (i % 10);
      const gy = 3 + Math.floor(i / 10);
      game.placeTroop(i % 2 === 0 ? swordsmanSpec : archerSpec, gx, gy);
    }
    for (let i = 0; i < 50; i++) game.spawnMonster(1);

    const start = performance.now();
    const STEPS = 100;
    for (let i = 0; i < STEPS; i++) game.step(CONFIG.FIXED_TIMESTEP);
    const elapsed = performance.now() - start;
    const avgPerStep = elapsed / STEPS;
    expect(avgPerStep).toBeLessThan(20);
  });
});

// ─── Cleanup throughput ────────────────────────────────────────────────────

describe('Performance: cleanup', () => {
  let game;
  beforeEach(() => { game = makeGame(); });
  afterEach(() => { vi.restoreAllMocks(); });

  it('cleanupDead with 200 monsters (most dead) completes within 5ms', () => {
    for (let i = 0; i < 200; i++) game.spawnMonster(1);
    for (const m of game.monsters) { m.alive = false; }

    const start = performance.now();
    game._cleanupDead();
    const elapsed = performance.now() - start;
    expect(game.monsters).toHaveLength(0);
    expect(elapsed).toBeLessThan(5);
  });

  it('cleanupDead with 200 troops (most dead) completes within 5ms', () => {
    for (let i = 0; i < 200; i++) {
      const gx = 3 + (i % 10);
      const gy = 3 + Math.floor(i / 10);
      game.placeTroop(swordsmanSpec, gx, gy);
    }
    for (const t of game.troops) t.alive = false;

    const start = performance.now();
    game._cleanupDead();
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(5);
  });
});

// ─── Splash/chain at scale ─────────────────────────────────────────────────

describe('Performance: splash and chain at scale', () => {
  let game;
  beforeEach(() => { game = makeGame({ devMode: true }); });
  afterEach(() => { vi.restoreAllMocks(); });

  it('splashAt with 50 monsters nearby completes within 5ms', () => {
    const T = CONFIG.TILE_SIZE;
    for (let i = 0; i < 50; i++) {
      const m = game.spawnMonster(1);
    }
    for (let s = 0; s < 3; s++) game.step(CONFIG.FIXED_TIMESTEP);

    const start = performance.now();
    for (let i = 0; i < 10; i++) {
      game.splashAt(8 * T, 8 * T, 65, 2.5, null);
    }
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(50);
  });
});

// ─── Projectiles at scale ──────────────────────────────────────────────────

describe('Performance: projectile management', () => {
  let game;
  beforeEach(() => { game = makeGame({ devMode: true }); });
  afterEach(() => { vi.restoreAllMocks(); });

  it('projectile pool does not grow unbounded under heavy fire', () => {
    game.placeTroop(archerSpec, 5, 1);
    for (let i = 0; i < 30; i++) game.spawnMonster(1);

    for (let s = 0; s < 300; s++) game.step(CONFIG.FIXED_TIMESTEP);

    expect(game.projectiles.length).toBeLessThanOrEqual(30);
    expect(game._projectilePool.length).toBeLessThanOrEqual(50);
  });
});

// ─── Scaling behavior ──────────────────────────────────────────────────────

describe('Performance: scaling', () => {
  let game;
  beforeEach(() => { game = makeGame({ devMode: true }); });
  afterEach(() => { vi.restoreAllMocks(); });

  it('step time scales roughly linearly with entity count', () => {
    const measureSteps = (troopCount, monsterCount) => {
      const g = makeGame({ devMode: true });
      for (let i = 0; i < troopCount; i++) {
        const gx = 3 + (i % 10);
        const gy = 3 + Math.floor(i / 10);
        g.placeTroop(i % 2 === 0 ? swordsmanSpec : archerSpec, gx, gy);
      }
      for (let i = 0; i < monsterCount; i++) g.spawnMonster(1);
      const start = performance.now();
      for (let s = 0; s < 50; s++) g.step(CONFIG.FIXED_TIMESTEP);
      return performance.now() - start;
    };

    const timeLow = measureSteps(5, 5);
    const timeHigh = measureSteps(20, 20);

    // 4x entities should not take more than 20x time (rough linearity check)
    expect(timeHigh).toBeLessThan(timeLow * 20 + 50);
  });
});

// ─── Memory stability ──────────────────────────────────────────────────────

describe('Performance: memory stability', () => {
  let game;
  beforeEach(() => { game = makeGame(); });
  afterEach(() => { vi.restoreAllMocks(); });

  it('monster array does not grow after 30 wave cycles', () => {
    for (let wave = 0; wave < 30; wave++) {
      for (let i = 0; i < 10; i++) game.spawnMonster(1);
      for (const m of [...game.monsters]) game.damageMonster(m, m.hp + 100);
      game.step(CONFIG.FIXED_TIMESTEP);
    }
    expect(game.monsters.length).toBe(0);
  });

  it('projectile array stays bounded after 50 shoot cycles', () => {
    game.placeTroop(archerSpec, 4, 0);
    for (let cycle = 0; cycle < 50; cycle++) {
      game.spawnMonster(1);
      for (let s = 0; s < 30; s++) game.step(CONFIG.FIXED_TIMESTEP);
      for (const m of [...game.monsters]) game.damageMonster(m, m.hp + 100);
      game.step(CONFIG.FIXED_TIMESTEP);
    }
    expect(game.projectiles.length).toBeLessThanOrEqual(5);
    expect(game._projectilePool.length).toBeLessThanOrEqual(60);
  });

  it('popup array stays bounded after 100 kill cycles', () => {
    for (let cycle = 0; cycle < 100; cycle++) {
      game.spawnMonster(1);
      game.damageMonster(game.monsters[0], 1000);
      for (let s = 0; s < 150; s++) game.step(CONFIG.FIXED_TIMESTEP);
    }
    expect(game.popups.length).toBe(0);
    expect(game._popupPool.length).toBeLessThanOrEqual(100);
  });
});
