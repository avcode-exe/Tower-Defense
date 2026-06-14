import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SaveSerializer, GameWorldFactory, GameSnapshotRestorer } from '../src/gamePersistence.js';
import { CONFIG, TROOP_SPECS } from '../src/config.js';
import { RENDERER } from '../src/rendering/renderer.js';
import { PARTICLES } from '../src/particles.js';
import { Troop } from '../src/troop.js';

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
        { alive: true, spec: { id: 'archer' }, gx: 0, gy: 0, hp: 30, maxHp: 30, dmgLevel: 1, rangeLevel: 1, speedLevel: 1, chainLevel: 1, hpLevel: 1, slowLevel: 1, healTargetLevel: 1, shield: 0, maxShield: 0, healCount: 0, healGoldSpent: 0 },
        { alive: false, spec: { id: 'knight' }, gx: 1, gy: 1, hp: 0, maxHp: 120, dmgLevel: 1, rangeLevel: 1, speedLevel: 1, chainLevel: 1, hpLevel: 1, slowLevel: 1, healTargetLevel: 1, shield: 0, maxShield: 0, healCount: 0, healGoldSpent: 0 },
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

// ─── SaveSerializer.isValid edge cases ──────────────────────────────────────

describe('SaveSerializer.isValid edge cases', () => {
  it('rejects troop with negative healGoldSpent', () => {
    const base = { seed: 1, gold: 100, lives: 25, devMode: false, wave: { currentWave: 1 } };
    const troop = { specId: 'archer', gx: 0, gy: 0, hp: 30, maxHp: 30, shield: 0, maxShield: 0, healGoldSpent: -5 };
    expect(SaveSerializer.isValid({ ...base, troops: [troop] })).toBe(false);
  });

  it('rejects troop with healTargetLevel=0', () => {
    const base = { seed: 1, gold: 100, lives: 25, devMode: false, wave: { currentWave: 1 } };
    const troop = { specId: 'healer', gx: 0, gy: 0, hp: 40, maxHp: 40, shield: 0, maxShield: 0, healGoldSpent: 0, healTargetLevel: 0 };
    expect(SaveSerializer.isValid({ ...base, troops: [troop] })).toBe(false);
  });

  it('accepts healTargetLevel=1 (minimum valid)', () => {
    const base = { seed: 1, gold: 100, lives: 25, devMode: false, wave: { currentWave: 1 } };
    const troop = { specId: 'healer', gx: 0, gy: 0, hp: 40, maxHp: 40, shield: 0, maxShield: 0, healGoldSpent: 0, healTargetLevel: 1 };
    expect(SaveSerializer.isValid({ ...base, troops: [troop] })).toBe(true);
  });

  it('accepts healTargetLevel=MAX_UPGRADE_LEVEL', () => {
    const base = { seed: 1, gold: 100, lives: 25, devMode: false, wave: { currentWave: 1 } };
    const troop = { specId: 'healer', gx: 0, gy: 0, hp: 40, maxHp: 40, shield: 0, maxShield: 0, healGoldSpent: 0, healTargetLevel: CONFIG.MAX_UPGRADE_LEVEL };
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
    const troop = { specId: 'archer', gx: CONFIG.GRID_SIZE, gy: 0, hp: 30, maxHp: 30, shield: 0, maxShield: 0, healGoldSpent: 0 };
    expect(SaveSerializer.isValid({ ...base, troops: [troop] })).toBe(false);
  });

  it('accepts troop at gx=GRID_SIZE-1 (max valid)', () => {
    const base = { seed: 1, gold: 100, lives: 25, devMode: false, wave: { currentWave: 1 } };
    const troop = { specId: 'archer', gx: CONFIG.GRID_SIZE - 1, gy: CONFIG.GRID_SIZE - 1, hp: 30, maxHp: 30, shield: 0, maxShield: 0, healGoldSpent: 0 };
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

// ─── GameWorldFactory.createFresh ────────────────────────────────────────────

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
      expect(world.pathSegments.segments[i].cumStart).toBeGreaterThan(
        world.pathSegments.segments[i - 1].cumStart
      );
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

// ─── GameSnapshotRestorer.apply ──────────────────────────────────────────────

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
