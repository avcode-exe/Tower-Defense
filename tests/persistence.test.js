import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SaveSerializer, GameWorldFactory, GameSnapshotRestorer } from '../src/gamePersistence.js';
import { CONFIG } from '../src/config.js';
import { RENDERER } from '../src/rendering/renderer.js';

// ─── SaveSerializer.isValid ────────────────────────────────────────────────

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

  it('rejects negative speed', () => {
    expect(
      SaveSerializer.isValid({
        seed: 1,
        troops: [],
        gold: 100,
        lives: 25,
        devMode: false,
        speed: -1,
        wave: { currentWave: 1 },
      })
    ).toBe(false);
  });

  it('accepts positive speed', () => {
    expect(
      SaveSerializer.isValid({
        seed: 1,
        troops: [],
        gold: 100,
        lives: 25,
        devMode: false,
        speed: 2,
        wave: { currentWave: 1 },
      })
    ).toBe(true);
  });
});

// ─── SaveSerializer.fromGame roundtrip ───────────────────────────────────────

describe('SaveSerializer.fromGame roundtrip', () => {
  it('serializes and deserializes troop data correctly', () => {
    const game = {
      gold: 500,
      lives: 20,
      seed: 42,
      speed: 2,
      devMode: false,
      devMonsterCounts: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, Y: 0, B: 0, S: 0, X: 0 },
      wave: { currentWave: 5 },
      troops: [
        {
          alive: true,
          spec: { id: 'archer' },
          gx: 3,
          gy: 5,
          hp: 20,
          maxHp: 30,
          dmgLevel: 2,
          rangeLevel: 1,
          speedLevel: 3,
          chainLevel: 1,
          hpLevel: 1,
          slowLevel: 1,
          healTargetLevel: 1,
          shield: 10,
          maxShield: 30,
          healCount: 2,
          healGoldSpent: 15,
        },
      ],
    };
    const data = SaveSerializer.fromGame(game);
    expect(data.troops[0].specId).toBe('archer');
    expect(data.troops[0].dmgLevel).toBe(2);
    expect(data.troops[0].speedLevel).toBe(3);
    expect(data.troops[0].shield).toBe(10);
    expect(data.troops[0].maxShield).toBe(30);
    expect(data.troops[0].healGoldSpent).toBe(15);
  });

  it('preserves healTargetLevel for support troops', () => {
    const game = {
      gold: 100,
      lives: 25,
      seed: 1,
      speed: 1,
      devMode: false,
      devMonsterCounts: {},
      wave: { currentWave: 0 },
      troops: [
        {
          alive: true,
          spec: { id: 'healer' },
          gx: 0,
          gy: 0,
          hp: 40,
          maxHp: 40,
          dmgLevel: 1,
          rangeLevel: 1,
          speedLevel: 1,
          chainLevel: 1,
          hpLevel: 1,
          slowLevel: 1,
          healTargetLevel: 4,
          shield: 0,
          maxShield: 0,
          healCount: 0,
          healGoldSpent: 0,
        },
      ],
    };
    const data = SaveSerializer.fromGame(game);
    expect(data.troops[0].healTargetLevel).toBe(4);
  });

  it('filters out dead troops', () => {
    const game = {
      gold: 100,
      lives: 25,
      seed: 1,
      speed: 1,
      devMode: false,
      devMonsterCounts: {},
      wave: { currentWave: 0 },
      troops: [
        {
          alive: true,
          spec: { id: 'archer' },
          gx: 0,
          gy: 0,
          hp: 30,
          maxHp: 30,
          dmgLevel: 1,
          rangeLevel: 1,
          speedLevel: 1,
          chainLevel: 1,
          hpLevel: 1,
          slowLevel: 1,
          healTargetLevel: 1,
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
          maxHp: 120,
          dmgLevel: 1,
          rangeLevel: 1,
          speedLevel: 1,
          chainLevel: 1,
          hpLevel: 1,
          slowLevel: 1,
          healTargetLevel: 1,
          shield: 0,
          maxShield: 0,
          healCount: 0,
          healGoldSpent: 0,
        },
      ],
    };
    const data = SaveSerializer.fromGame(game);
    expect(data.troops).toHaveLength(1);
    expect(data.troops[0].specId).toBe('archer');
  });

  it('serializes devMode with null gold/lives', () => {
    const game = {
      gold: Infinity,
      lives: Infinity,
      seed: 1,
      speed: 1,
      devMode: true,
      devMonsterCounts: { 1: 5 },
      wave: { currentWave: 3 },
      troops: [],
    };
    const data = SaveSerializer.fromGame(game);
    expect(data.gold).toBeNull();
    expect(data.lives).toBeNull();
    expect(data.devMode).toBe(true);
    expect(data.devMonsterCounts[1]).toBe(5);
  });
});

// ─── SaveSerializer.fromGame ────────────────────────────────────────────────

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
    const data = SaveSerializer.fromGame(game, '1.6.0-beta.2');

    expect(data.version).toBe('1.6.0-beta.2');
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

  it('filters out dead troops from serialized data', () => {
    const makeTroop = (alive) => ({
      alive,
      spec: { id: 'archer' },
      gx: 0,
      gy: 0,
      hp: 50,
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
    });
    const game = {
      gold: 100,
      lives: 25,
      seed: 1,
      speed: 1,
      devMode: false,
      devMonsterCounts: {},
      wave: { currentWave: 1 },
      troops: [makeTroop(false), makeTroop(true), makeTroop(false), makeTroop(true)],
    };
    const data = SaveSerializer.fromGame(game);
    expect(data.troops).toHaveLength(2);
    expect(data.troops.every((t) => t.specId === 'archer')).toBe(true);
  });

  it('includes all six upgrade levels in serialized troop data', () => {
    const game = {
      gold: 100,
      lives: 25,
      seed: 1,
      speed: 1,
      devMode: false,
      devMonsterCounts: {},
      wave: { currentWave: 1 },
      troops: [
        {
          alive: true,
          spec: { id: 'knight' },
          gx: 2,
          gy: 3,
          hp: 100,
          maxHp: 100,
          dmgLevel: 3,
          rangeLevel: 2,
          speedLevel: 4,
          chainLevel: 1,
          hpLevel: 5,
          slowLevel: 2,
          shield: 0,
          maxShield: 0,
          healCount: 0,
          healGoldSpent: 0,
        },
      ],
    };
    const data = SaveSerializer.fromGame(game);
    const serialized = data.troops[0];
    expect(serialized.dmgLevel).toBe(3);
    expect(serialized.rangeLevel).toBe(2);
    expect(serialized.speedLevel).toBe(4);
    expect(serialized.chainLevel).toBe(1);
    expect(serialized.hpLevel).toBe(5);
    expect(serialized.slowLevel).toBe(2);
  });

  it('serializes devMonsterCounts correctly', () => {
    const counts = { 1: 5, 2: 3, 3: 1, 4: 0, 5: 0, B: 2, S: 1, X: 0 };
    const game = {
      gold: 100,
      lives: 25,
      seed: 1,
      speed: 1,
      devMode: true,
      devMonsterCounts: counts,
      wave: { currentWave: 1 },
      troops: [],
    };
    const data = SaveSerializer.fromGame(game);
    expect(data.devMonsterCounts).toEqual(counts);
    // Ensure it's a shallow copy, not a reference
    counts[1] = 999;
    expect(data.devMonsterCounts[1]).toBe(5);
  });
});

// ─── SaveSerializer.isValid edge cases ──────────────────────────────────────

describe('SaveSerializer.isValid edge cases', () => {
  it('rejects troop with negative healGoldSpent', () => {
    const base = { seed: 1, gold: 100, lives: 25, devMode: false, wave: { currentWave: 1 } };
    const troop = { specId: 'archer', gx: 0, gy: 0, hp: 30, maxHp: 30, shield: 0, maxShield: 0, healGoldSpent: -5 };
    expect(SaveSerializer.isValid({ ...base, troops: [troop] })).toBe(false);
  });

  it('rejects troop with healTargetLevel=0', () => {
    const base = { seed: 1, gold: 100, lives: 25, devMode: false, wave: { currentWave: 1 } };
    const troop = {
      specId: 'healer',
      gx: 0,
      gy: 0,
      hp: 40,
      maxHp: 40,
      shield: 0,
      maxShield: 0,
      healGoldSpent: 0,
      healTargetLevel: 0,
    };
    expect(SaveSerializer.isValid({ ...base, troops: [troop] })).toBe(false);
  });

  it('accepts healTargetLevel=1 (minimum valid)', () => {
    const base = { seed: 1, gold: 100, lives: 25, devMode: false, wave: { currentWave: 1 } };
    const troop = {
      specId: 'healer',
      gx: 0,
      gy: 0,
      hp: 40,
      maxHp: 40,
      shield: 0,
      maxShield: 0,
      healGoldSpent: 0,
      healTargetLevel: 1,
    };
    expect(SaveSerializer.isValid({ ...base, troops: [troop] })).toBe(true);
  });

  it('accepts healTargetLevel=MAX_UPGRADE_LEVEL', () => {
    const base = { seed: 1, gold: 100, lives: 25, devMode: false, wave: { currentWave: 1 } };
    const troop = {
      specId: 'healer',
      gx: 0,
      gy: 0,
      hp: 40,
      maxHp: 40,
      shield: 0,
      maxShield: 0,
      healGoldSpent: 0,
      healTargetLevel: CONFIG.MAX_UPGRADE_LEVEL,
    };
    expect(SaveSerializer.isValid({ ...base, troops: [troop] })).toBe(true);
  });

  it('rejects troop with shield > maxShield', () => {
    const base = { seed: 1, gold: 100, lives: 25, devMode: false, wave: { currentWave: 1 } };
    const troop = { specId: 'archer', gx: 0, gy: 0, hp: 30, maxHp: 30, shield: 50, maxShield: 30, healGoldSpent: 0 };
    expect(SaveSerializer.isValid({ ...base, troops: [troop] })).toBe(false);
  });

  it('accepts troop with shield=0, maxShield=0', () => {
    const base = { seed: 1, gold: 100, lives: 25, devMode: false, wave: { currentWave: 1 } };
    const troop = { specId: 'archer', gx: 0, gy: 0, hp: 30, maxHp: 30, shield: 0, maxShield: 0, healGoldSpent: 0 };
    expect(SaveSerializer.isValid({ ...base, troops: [troop] })).toBe(true);
  });

  it('rejects troop with invalid specId type', () => {
    const base = { seed: 1, gold: 100, lives: 25, devMode: false, wave: { currentWave: 1 } };
    const troop = { specId: 123, gx: 0, gy: 0, hp: 30, maxHp: 30, shield: 0, maxShield: 0, healGoldSpent: 0 };
    expect(SaveSerializer.isValid({ ...base, troops: [troop] })).toBe(false);
  });

  it('rejects troop with gx = GRID_SIZE (out of bounds)', () => {
    const base = { seed: 1, gold: 100, lives: 25, devMode: false, wave: { currentWave: 1 } };
    const troop = {
      specId: 'archer',
      gx: CONFIG.GRID_SIZE,
      gy: 0,
      hp: 30,
      maxHp: 30,
      shield: 0,
      maxShield: 0,
      healGoldSpent: 0,
    };
    expect(SaveSerializer.isValid({ ...base, troops: [troop] })).toBe(false);
  });

  it('accepts troop at gx=GRID_SIZE-1 (max valid)', () => {
    const base = { seed: 1, gold: 100, lives: 25, devMode: false, wave: { currentWave: 1 } };
    const troop = {
      specId: 'archer',
      gx: CONFIG.GRID_SIZE - 1,
      gy: CONFIG.GRID_SIZE - 1,
      hp: 30,
      maxHp: 30,
      shield: 0,
      maxShield: 0,
      healGoldSpent: 0,
    };
    expect(SaveSerializer.isValid({ ...base, troops: [troop] })).toBe(true);
  });

  it('rejects speed=0', () => {
    const base = { seed: 1, gold: 100, lives: 25, devMode: false, wave: { currentWave: 1 }, speed: 0 };
    expect(SaveSerializer.isValid({ ...base, troops: [] })).toBe(false);
  });

  it('accepts speed=1', () => {
    const base = { seed: 1, gold: 100, lives: 25, devMode: false, wave: { currentWave: 1 }, speed: 1 };
    expect(SaveSerializer.isValid({ ...base, troops: [] })).toBe(true);
  });
});

// ─── GameSnapshotRestorer.apply ──────────────────────────────────────────────

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

// ─── GameSnapshotRestorer.apply (extended) ──────────────────────────────────

describe('GameSnapshotRestorer.apply (extended)', () => {
  let mockGame;
  beforeEach(() => {
    RENDERER.markCacheDirty = () => {};
    RENDERER._rebuildCache = () => {};

    mockGame = {
      grid: null,
      waypoints: null,
      pathSegments: null,
      monsters: [{ alive: true }],
      troops: [],
      projectiles: [],
      popups: [],
      _popupPool: [],
      _monsterTileIndex: ['stale'],
      _troopTileIndex: [],
      _troopIndexByRef: new Map(),
      _projectilePool: [],
      _chainBuf: [],
      _splashHitBuf: [],
      _tileIndexPool: [],
      wave: null,
      waveCompleteAnim: { active: true, waveNum: 5 },
      _defaultDevCounts: () => ({ 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, Y: 0, B: 0, S: 0, X: 0 }),
      _buildTroopTileIndex: () => {},
      _needsSaveCleanup: false,
      state: 'WAVE_ACTIVE',
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('restores troop with upgrades', () => {
    GameSnapshotRestorer.apply(mockGame, {
      seed: 42,
      gold: 500,
      lives: 20,
      speed: 2,
      devMode: false,
      devMonsterCounts: {},
      wave: { currentWave: 5 },
      troops: [
        {
          specId: 'archer',
          gx: 3,
          gy: 5,
          hp: 20,
          maxHp: 30,
          dmgLevel: 3,
          rangeLevel: 2,
          speedLevel: 4,
          chainLevel: 1,
          hpLevel: 1,
          slowLevel: 1,
          healTargetLevel: 1,
          shield: 10,
          maxShield: 30,
          healCount: 2,
          healGoldSpent: 25,
        },
      ],
    });

    expect(mockGame.troops).toHaveLength(1);
    const t = mockGame.troops[0];
    expect(t.spec.id).toBe('archer');
    expect(t.dmgLevel).toBe(3);
    expect(t.rangeLevel).toBe(2);
    expect(t.speedLevel).toBe(4);
    expect(t.shield).toBe(10);
    expect(t.maxShield).toBe(30);
    expect(t.healGoldSpent).toBe(25);
  });

  it('restores healer with healTargetLevel', () => {
    GameSnapshotRestorer.apply(mockGame, {
      seed: 42,
      gold: 100,
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
          maxHp: 40,
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
      ],
    });

    expect(mockGame.troops[0].healTargetLevel).toBe(3);
  });

  it('clamps healTargetLevel to MAX_UPGRADE_LEVEL', () => {
    GameSnapshotRestorer.apply(mockGame, {
      seed: 42,
      gold: 100,
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
          maxHp: 40,
          healTargetLevel: 999,
          shield: 0,
          maxShield: 0,
          healCount: 0,
          healGoldSpent: 0,
        },
      ],
    });

    expect(mockGame.troops[0].healTargetLevel).toBe(CONFIG.MAX_UPGRADE_LEVEL);
  });

  it('restores devMode with null gold/lives', () => {
    GameSnapshotRestorer.apply(mockGame, {
      seed: 42,
      gold: null,
      lives: null,
      speed: 1,
      devMode: true,
      devMonsterCounts: { 1: 5 },
      wave: { currentWave: 3 },
      troops: [],
    });

    expect(mockGame.devMode).toBe(true);
    expect(mockGame.gold).toBe(Infinity);
    expect(mockGame.lives).toBe(Infinity);
    expect(mockGame.devMonsterCounts[1]).toBe(5);
  });

  it('sets state to PRE_WAVE', () => {
    mockGame.state = 'WAVE_ACTIVE';
    GameSnapshotRestorer.apply(mockGame, {
      seed: 42,
      gold: 100,
      lives: 25,
      speed: 1,
      devMode: false,
      devMonsterCounts: {},
      wave: { currentWave: 0 },
      troops: [],
    });
    expect(mockGame.state).toBe('PRE_WAVE');
  });

  it('sets _needsSaveCleanup', () => {
    mockGame._needsSaveCleanup = false;
    GameSnapshotRestorer.apply(mockGame, {
      seed: 42,
      gold: 100,
      lives: 25,
      speed: 1,
      devMode: false,
      devMonsterCounts: {},
      wave: { currentWave: 0 },
      troops: [],
    });
    expect(mockGame._needsSaveCleanup).toBe(true);
  });
});

// ─── GameSnapshotRestorer.applyFresh ─────────────────────────────────────────

describe('GameSnapshotRestorer.applyFresh', () => {
  let mockGame;
  beforeEach(() => {
    const originalMarkCacheDirty = RENDERER.markCacheDirty;
    const originalRebuildCache = RENDERER._rebuildCache;
    RENDERER.markCacheDirty = () => {};
    RENDERER._rebuildCache = () => {};

    mockGame = {
      grid: null,
      waypoints: null,
      pathSegments: null,
      monsters: [{ alive: true }],
      troops: [{ alive: true }],
      projectiles: [{ alive: true }],
      popups: [{ text: 'test' }],
      _popupPool: [{ text: 'old' }],
      _monsterTileIndex: ['stale'],
      _troopTileIndex: [{ alive: true }],
      _troopIndexByRef: new Map(),
      _projectilePool: [{ alive: true }],
      _chainBuf: [1],
      _splashHitBuf: [1],
      _tileIndexPool: [1],
      waveCompleteAnim: { active: true, waveNum: 5 },
      shopScrollY: 100,
      _defaultDevCounts: () => ({ 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, Y: 0, B: 0, S: 0, X: 0 }),
      _buildTroopTileIndex: () => {},
      _needsSaveCleanup: true,
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('resets monsters, troops, projectiles, popups', () => {
    GameSnapshotRestorer.applyFresh(mockGame, 42);
    expect(mockGame.monsters).toEqual([]);
    expect(mockGame.troops).toEqual([]);
    expect(mockGame.projectiles).toEqual([]);
    expect(mockGame.popups).toEqual([]);
  });

  it('resets _popupPool', () => {
    GameSnapshotRestorer.applyFresh(mockGame, 42);
    expect(mockGame._popupPool).toEqual([]);
  });

  it('creates new _monsterTileIndex array', () => {
    GameSnapshotRestorer.applyFresh(mockGame, 42);
    expect(mockGame._monsterTileIndex).toHaveLength(CONFIG.GRID_SIZE * CONFIG.GRID_SIZE);
  });

  it('creates new _troopTileIndex', () => {
    GameSnapshotRestorer.applyFresh(mockGame, 42);
    expect(mockGame._troopTileIndex).toHaveLength(CONFIG.GRID_SIZE * CONFIG.GRID_SIZE);
  });

  it('creates new _troopIndexByRef map', () => {
    GameSnapshotRestorer.applyFresh(mockGame, 42);
    expect(mockGame._troopIndexByRef).toBeInstanceOf(Map);
    expect(mockGame._troopIndexByRef.size).toBe(0);
  });

  it('clears transient buffers', () => {
    GameSnapshotRestorer.applyFresh(mockGame, 42);
    expect(mockGame._projectilePool).toEqual([]);
    expect(mockGame._chainBuf).toEqual([]);
    expect(mockGame._splashHitBuf).toEqual([]);
    expect(mockGame._tileIndexPool).toEqual([]);
  });

  it('resets wave manager', () => {
    GameSnapshotRestorer.applyFresh(mockGame, 42);
    expect(mockGame.wave).toBeDefined();
    expect(mockGame.wave.currentWave).toBe(0);
  });

  it('resets waveCompleteAnim', () => {
    mockGame.waveCompleteAnim = { active: true, waveNum: 5 };
    GameSnapshotRestorer.applyFresh(mockGame, 42);
    expect(mockGame.waveCompleteAnim).toEqual({ active: false, waveNum: 0 });
  });

  it('marks path tiles on grid', () => {
    GameSnapshotRestorer.applyFresh(mockGame, 42);
    expect(mockGame.waypoints).toBeDefined();
    expect(mockGame.waypoints.length).toBeGreaterThan(0);
    for (const [gx, gy] of mockGame.waypoints) {
      expect(mockGame.grid.get(gx, gy)).toBe(1);
    }
  });
});

// ─── GameWorldFactory.createFresh ────────────────────────────────────────────

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

// ─── GameWorldFactory.createFresh (extended) ────────────────────────────────

describe('GameWorldFactory.createFresh (extended)', () => {
  it('same seed produces same waypoints', () => {
    const w1 = GameWorldFactory.createFresh(42);
    const w2 = GameWorldFactory.createFresh(42);
    expect(w1.waypoints).toEqual(w2.waypoints);
  });

  it('different seeds produce different waypoints', () => {
    const w1 = GameWorldFactory.createFresh(1);
    const w2 = GameWorldFactory.createFresh(99999);
    expect(w1.waypoints).not.toEqual(w2.waypoints);
  });

  it('path segments have positive lengths', () => {
    const world = GameWorldFactory.createFresh(42);
    for (const seg of world.pathSegments.segments) {
      expect(seg.len).toBeGreaterThan(0);
    }
  });

  it('cumStart values are monotonically increasing', () => {
    const world = GameWorldFactory.createFresh(42);
    for (let i = 1; i < world.pathSegments.segments.length; i++) {
      expect(world.pathSegments.segments[i].cumStart).toBeGreaterThan(world.pathSegments.segments[i - 1].cumStart);
    }
  });

  it('grid starts empty', () => {
    const world = GameWorldFactory.createFresh(42);
    for (let y = 0; y < CONFIG.GRID_SIZE; y++) {
      for (let x = 0; x < CONFIG.GRID_SIZE; x++) {
        expect(world.grid.get(x, y)).toBe(0);
      }
    }
  });
});
