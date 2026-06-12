import { describe, it, expect } from 'vitest';
import { SaveSerializer, GameWorldFactory, GameSnapshotRestorer } from '../src/gamePersistence.js';
import { CONFIG } from '../src/config.js';
import { RENDERER } from '../src/rendering/renderer.js';

describe('SaveSerializer.isValid', () => {
  it('returns false for null', () => {
    expect(SaveSerializer.isValid(null)).toBe(false);
  });

  it('returns false for non-object', () => {
    expect(SaveSerializer.isValid('string')).toBe(false);
    expect(SaveSerializer.isValid(42)).toBe(false);
  });

  it('returns false when seed is missing', () => {
    expect(SaveSerializer.isValid({ troops: [], gold: 100, lives: 25, wave: { currentWave: 1 } })).toBe(false);
  });

  it('returns false when troops is not an array', () => {
    expect(SaveSerializer.isValid({ seed: 1, troops: 'bad', gold: 100, lives: 25, wave: { currentWave: 1 } })).toBe(
      false
    );
  });

  it('returns false when wave is missing', () => {
    expect(SaveSerializer.isValid({ seed: 1, troops: [], gold: 100, lives: 25 })).toBe(false);
  });

  it('returns false when non-dev mode has null gold', () => {
    expect(
      SaveSerializer.isValid({ seed: 1, troops: [], gold: null, lives: 25, devMode: false, wave: { currentWave: 1 } })
    ).toBe(false);
  });

  it('returns false when non-dev mode has non-finite gold or lives', () => {
    expect(
      SaveSerializer.isValid({ seed: 1, troops: [], gold: -1, lives: 25, devMode: false, wave: { currentWave: 1 } })
    ).toBe(false);
    expect(
      SaveSerializer.isValid({
        seed: 1,
        troops: [],
        gold: 100,
        lives: Infinity,
        devMode: false,
        wave: { currentWave: 1 },
      })
    ).toBe(false);
  });

  it('returns false when wave currentWave is not finite or non-negative', () => {
    expect(
      SaveSerializer.isValid({
        seed: 1,
        troops: [],
        gold: 100,
        lives: 25,
        devMode: false,
        wave: { currentWave: Infinity },
      })
    ).toBe(false);
    expect(
      SaveSerializer.isValid({ seed: 1, troops: [], gold: 100, lives: 25, devMode: false, wave: { currentWave: -1 } })
    ).toBe(false);
  });

  it('returns true for valid non-dev save', () => {
    expect(
      SaveSerializer.isValid({
        seed: 42,
        troops: [],
        gold: 500,
        lives: 20,
        devMode: false,
        wave: { currentWave: 3 },
      })
    ).toBe(true);
  });

  it('returns true for valid dev save with null gold/lives', () => {
    expect(
      SaveSerializer.isValid({
        seed: 42,
        troops: [],
        gold: null,
        lives: null,
        devMode: true,
        wave: { currentWave: 1 },
      })
    ).toBe(true);
  });

  it('validates troop entries', () => {
    const base = { seed: 42, gold: 100, lives: 25, devMode: false, wave: { currentWave: 1 } };
    const troop = (overrides = {}) => ({
      specId: 'archer',
      gx: 0,
      gy: 0,
      hp: 100,
      maxHp: 100,
      shield: 0,
      maxShield: 0,
      healGoldSpent: 0,
      ...overrides,
    });
    // Valid troop
    expect(SaveSerializer.isValid({ ...base, troops: [troop()] })).toBe(true);
    // Out-of-bounds gx/gy
    expect(SaveSerializer.isValid({ ...base, troops: [troop({ gx: CONFIG.GRID_SIZE })] })).toBe(false);
    expect(SaveSerializer.isValid({ ...base, troops: [troop({ gy: -1 })] })).toBe(false);
    // Non-finite HP
    expect(SaveSerializer.isValid({ ...base, troops: [troop({ hp: Infinity })] })).toBe(false);
    expect(SaveSerializer.isValid({ ...base, troops: [troop({ maxHp: -1 })] })).toBe(false);
    // Invalid shield state
    expect(SaveSerializer.isValid({ ...base, troops: [troop({ shield: Infinity })] })).toBe(false);
    expect(SaveSerializer.isValid({ ...base, troops: [troop({ maxShield: -1 })] })).toBe(false);
    expect(SaveSerializer.isValid({ ...base, troops: [troop({ shield: 10, maxShield: 5 })] })).toBe(false);
    // Invalid heal spend
    expect(SaveSerializer.isValid({ ...base, troops: [troop({ healGoldSpent: -1 })] })).toBe(false);
    // Missing specId
    expect(SaveSerializer.isValid({ ...base, troops: [troop({ specId: undefined })] })).toBe(false);
    // Missing gx
    expect(SaveSerializer.isValid({ ...base, troops: [troop({ gx: undefined })] })).toBe(false);
  });

  it('rejects invalid healer target levels', () => {
    const base = { seed: 42, gold: 100, lives: 25, devMode: false, wave: { currentWave: 1 } };
    const troop = { specId: 'healer', gx: 0, gy: 0, hp: 40, maxHp: 40, shield: 0, maxShield: 0, healGoldSpent: 0 };
    expect(SaveSerializer.isValid({ ...base, troops: [{ ...troop, healTargetLevel: 0 }] })).toBe(false);
    expect(SaveSerializer.isValid({ ...base, troops: [{ ...troop, healTargetLevel: 1.5 }] })).toBe(false);
    expect(SaveSerializer.isValid({ ...base, troops: [{ ...troop, healTargetLevel: 6 }] })).toBe(false);
  });
});

describe('SaveSerializer.fromGame', () => {
  it('serializes game state correctly', () => {
    const game = {
      gold: 500,
      lives: 20,
      seed: 42,
      speed: 2,
      devMode: false,
      devMonsterCounts: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, B: 0, S: 0, X: 0 },
      wave: { currentWave: 5 },
      troops: [
        {
          alive: true,
          spec: { id: 'healer' },
          gx: 3,
          gy: 5,
          hp: 80,
          maxHp: 100,
          dmgLevel: 1,
          rangeLevel: 1,
          speedLevel: 1,
          chainLevel: 1,
          hpLevel: 1,
          slowLevel: 1,
          healTargetLevel: 3,
          shield: 0,
          maxShield: 0,
          healCount: 0,
          healGoldSpent: 0,
        },
        {
          alive: false,
          spec: { id: 'knight' },
          gx: 1,
          gy: 1,
          hp: 0,
          maxHp: 50,
          dmgLevel: 1,
          rangeLevel: 1,
          speedLevel: 1,
          chainLevel: 1,
          hpLevel: 1,
          slowLevel: 1,
          shield: 0,
          maxShield: 0,
          healCount: 0,
          healGoldSpent: 0,
        },
      ],
    };
    const data = SaveSerializer.fromGame(game);

    expect(data.version).toBe('1.5.1-beta.2');
    expect(data.gold).toBe(500);
    expect(data.lives).toBe(20);
    expect(data.seed).toBe(42);
    expect(data.speed).toBe(2);
    expect(data.wave.currentWave).toBe(5);
    expect(data.troops).toHaveLength(1);
    expect(data.troops[0].specId).toBe('healer');
    expect(data.troops[0].gx).toBe(3);
    expect(data.troops[0].healTargetLevel).toBe(3);
  });

  it('converts Infinity gold to null', () => {
    const game = {
      gold: Infinity,
      lives: Infinity,
      seed: 1,
      speed: 1,
      devMode: true,
      devMonsterCounts: {},
      wave: { currentWave: 0 },
      troops: [],
    };
    const data = SaveSerializer.fromGame(game);
    expect(data.gold).toBeNull();
    expect(data.lives).toBeNull();
  });
});

describe('GameSnapshotRestorer.apply', () => {
  it('clamps restored healer target count', () => {
    const originalMarkCacheDirty = RENDERER.markCacheDirty;
    const originalRebuildCache = RENDERER._rebuildCache;
    RENDERER.markCacheDirty = () => {};
    RENDERER._rebuildCache = () => {};

    try {
      const oldMonsterIndex = new Array(CONFIG.GRID_SIZE * CONFIG.GRID_SIZE);
      oldMonsterIndex[0] = ['stale'];
      let troopIndexBuilt = false;
      const game = {
        _defaultDevCounts: () => ({ 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, B: 0, S: 0, X: 0 }),
        _buildTroopTileIndex: () => {
          troopIndexBuilt = true;
        },
        _monsterTileIndex: oldMonsterIndex,
      };

      GameSnapshotRestorer.apply(game, {
        seed: 42,
        gold: 1000,
        lives: 25,
        speed: 1,
        devMode: false,
        devMonsterCounts: {},
        wave: { currentWave: 0 },
        troops: [
          {
            specId: 'healer',
            gx: 5,
            gy: 5,
            hp: 40,
            healTargetLevel: 99,
            shield: 0,
            maxShield: 0,
            healCount: 0,
            healGoldSpent: 0,
          },
        ],
      });

      expect(game.troops[0].healTargetLevel).toBe(CONFIG.MAX_UPGRADE_LEVEL);
      expect(game._monsterTileIndex).not.toBe(oldMonsterIndex);
      expect(game._monsterTileIndex).toHaveLength(CONFIG.GRID_SIZE * CONFIG.GRID_SIZE);
      expect(game._monsterTileIndex.every((entry) => entry === undefined)).toBe(true);
      expect(troopIndexBuilt).toBe(true);
    } finally {
      RENDERER.markCacheDirty = originalMarkCacheDirty;
      RENDERER._rebuildCache = originalRebuildCache;
    }
  });
});

describe('GameWorldFactory.createFresh', () => {
  it('returns grid, waypoints, and pathSegments', () => {
    const world = GameWorldFactory.createFresh(42);
    expect(world.grid).toBeDefined();
    expect(world.waypoints).toBeDefined();
    expect(world.pathSegments).toBeDefined();
  });

  it('grid has correct size', () => {
    const world = GameWorldFactory.createFresh(42);
    expect(world.grid.size).toBe(CONFIG.GRID_SIZE);
  });

  it('waypoints form valid path', () => {
    const world = GameWorldFactory.createFresh(42);
    const wp = world.waypoints;
    expect(wp.length).toBeGreaterThan(0);
    expect(wp[0][0]).toBe(0);
    expect(wp[wp.length - 1][0]).toBe(CONFIG.GRID_SIZE - 1);
  });

  it('pathSegments has correct totalLength', () => {
    const world = GameWorldFactory.createFresh(42);
    expect(world.pathSegments.totalLength).toBeGreaterThan(0);
    expect(world.pathSegments.segments.length).toBeGreaterThan(0);
  });

  it('waypoints are valid grid coordinates', () => {
    const world = GameWorldFactory.createFresh(42);
    const N = CONFIG.GRID_SIZE;
    for (const [gx, gy] of world.waypoints) {
      expect(gx).toBeGreaterThanOrEqual(0);
      expect(gx).toBeLessThan(N);
      expect(gy).toBeGreaterThanOrEqual(0);
      expect(gy).toBeLessThan(N);
    }
  });
});
