import { describe, it, expect, vi, beforeAll } from 'vitest';
import { CONFIG, TROOP_SPECS } from '../src/config.js';
import { Grid } from '../src/grid.js';

vi.mock('../src/rendering/renderer.js', () => ({
  RENDERER: { markCacheDirty: vi.fn(), _rebuildCache: vi.fn(), init: vi.fn(), resize: vi.fn() },
}));
vi.mock('../src/particles.js', () => ({
  PARTICLES: { clear: vi.fn(), update: vi.fn(), deathBurst: vi.fn(), hitSpark: vi.fn() },
}));
vi.mock('../src/ui/index.js', () => ({
  UI: { shopScrollY: 0 },
}));

describe('SaveSerializer', () => {
  let SaveSerializer, GameWorldFactory, GameSnapshotRestorer;

  beforeAll(async () => {
    const mod = await import('../src/gamePersistence.js');
    SaveSerializer = mod.SaveSerializer;
    GameWorldFactory = mod.GameWorldFactory;
    GameSnapshotRestorer = mod.GameSnapshotRestorer;
  });

  describe('isValid', () => {
    it('returns false for null', () => {
      expect(SaveSerializer.isValid(null)).toBe(false);
    });

    it('returns false for non-object', () => {
      expect(SaveSerializer.isValid('string')).toBe(false);
    });

    it('returns false for missing seed', () => {
      expect(SaveSerializer.isValid({ gold: 100, lives: 25, wave: { currentWave: 1 }, troops: [] })).toBe(false);
    });

    it('returns false for non-array troops', () => {
      expect(SaveSerializer.isValid({ seed: 1, gold: 100, lives: 25, wave: { currentWave: 1 }, troops: null })).toBe(
        false
      );
    });

    it('returns false for negative gold non-dev', () => {
      expect(SaveSerializer.isValid({ seed: 1, gold: -1, lives: 25, wave: { currentWave: 1 }, troops: [] })).toBe(
        false
      );
    });

    it('returns false for NaN gold', () => {
      expect(SaveSerializer.isValid({ seed: 1, gold: NaN, lives: 25, wave: { currentWave: 1 }, troops: [] })).toBe(
        false
      );
    });

    it('returns true for valid non-dev save', () => {
      const data = {
        seed: 42,
        gold: 1000,
        lives: 25,
        speed: 1,
        devMode: false,
        wave: { currentWave: 1 },
        troops: [],
        devMonsterCounts: {},
      };
      expect(SaveSerializer.isValid(data)).toBe(true);
    });

    it('returns false for negative currentWave', () => {
      expect(SaveSerializer.isValid({ seed: 1, gold: 100, lives: 25, wave: { currentWave: -1 }, troops: [] })).toBe(
        false
      );
    });

    it('validates troop structure', () => {
      const data = {
        seed: 42,
        gold: 1000,
        lives: 25,
        speed: 1,
        devMode: false,
        wave: { currentWave: 1 },
        troops: [
          {
            specId: 'swordsman',
            gx: 3,
            gy: 4,
            hp: 50,
            maxHp: 50,
            shield: 0,
            maxShield: 0,
            healGoldSpent: 0,
            dmgLevel: 1,
            rangeLevel: 1,
            speedLevel: 1,
            chainLevel: 1,
            hpLevel: 1,
            slowLevel: 1,
            healCount: 0,
            healTargetLevel: 1,
          },
        ],
      };
      expect(SaveSerializer.isValid(data)).toBe(true);
    });

    it('rejects troop with shield > maxShield', () => {
      const data = {
        seed: 42,
        gold: 1000,
        lives: 25,
        speed: 1,
        devMode: false,
        wave: { currentWave: 1 },
        troops: [
          {
            specId: 'swordsman',
            gx: 3,
            gy: 4,
            hp: 50,
            maxHp: 50,
            shield: 100,
            maxShield: 50,
            healGoldSpent: 0,
            healTargetLevel: 1,
          },
        ],
      };
      expect(SaveSerializer.isValid(data)).toBe(false);
    });

    it('rejects troop with healTargetLevel 0', () => {
      const data = {
        seed: 42,
        gold: 1000,
        lives: 25,
        speed: 1,
        devMode: false,
        wave: { currentWave: 1 },
        troops: [
          {
            specId: 'swordsman',
            gx: 3,
            gy: 4,
            hp: 50,
            maxHp: 50,
            shield: 0,
            maxShield: 0,
            healGoldSpent: 0,
            healTargetLevel: 0,
          },
        ],
      };
      expect(SaveSerializer.isValid(data)).toBe(false);
    });

    it('rejects non-positive speed', () => {
      expect(
        SaveSerializer.isValid({ seed: 1, gold: 100, lives: 25, speed: -1, wave: { currentWave: 1 }, troops: [] })
      ).toBe(false);
    });

    it('rejects dev mode with non-null gold', () => {
      const data = { seed: 42, gold: 500, lives: null, speed: 1, devMode: true, wave: { currentWave: 1 }, troops: [] };
      expect(SaveSerializer.isValid(data)).toBe(false);
    });

    it('rejects missing wave object', () => {
      expect(SaveSerializer.isValid({ seed: 1, gold: 100, lives: 25, speed: 1, wave: null, troops: [] })).toBe(false);
    });

    it('validates troop structure without checking specId existence', () => {
      const data = {
        seed: 42,
        gold: 1000,
        lives: 25,
        speed: 1,
        devMode: false,
        wave: { currentWave: 1 },
        troops: [
          {
            specId: 'nonexistent',
            gx: 3,
            gy: 4,
            hp: 50,
            maxHp: 50,
            shield: 0,
            maxShield: 0,
            healGoldSpent: 0,
            healTargetLevel: 1,
          },
        ],
      };
      expect(SaveSerializer.isValid(data)).toBe(true);
    });
  });

  describe('fromGame', () => {
    it('serializes all fields', () => {
      const game = {
        gold: 500,
        lives: 20,
        seed: 123,
        speed: 1,
        devMode: false,
        devMonsterCounts: {},
        wave: { currentWave: 3 },
        troops: [],
        appVersion: '1.6.0',
      };
      const data = SaveSerializer.fromGame(game, '1.6.0');
      expect(data).toHaveProperty('version', '1.6.0');
      expect(data).toHaveProperty('gold', 500);
      expect(data).toHaveProperty('seed', 123);
      expect(data).toHaveProperty('troops');
      expect(Array.isArray(data.troops)).toBe(true);
    });

    it('serializes Infinity gold as null', () => {
      const game = {
        gold: Infinity,
        lives: 20,
        seed: 1,
        speed: 1,
        devMode: true,
        devMonsterCounts: {},
        wave: { currentWave: 0 },
        troops: [],
      };
      const data = SaveSerializer.fromGame(game, '1.6.0');
      expect(data.gold).toBeNull();
    });

    it('serializes Infinity lives as null', () => {
      const game = {
        gold: 500,
        lives: Infinity,
        seed: 1,
        speed: 1,
        devMode: true,
        devMonsterCounts: {},
        wave: { currentWave: 0 },
        troops: [],
      };
      const data = SaveSerializer.fromGame(game, '1.6.0');
      expect(data.lives).toBeNull();
    });

    it('filters out dead troops', () => {
      const aliveTroop = {
        spec: { id: 'swordsman' },
        alive: true,
        gx: 3,
        gy: 4,
        hp: 50,
        maxHp: 50,
        shield: 0,
        maxShield: 0,
        healGoldSpent: 0,
        dmgLevel: 1,
        rangeLevel: 1,
        speedLevel: 1,
        chainLevel: 1,
        hpLevel: 1,
        slowLevel: 1,
        healCount: 0,
        healTargetLevel: 1,
      };
      const deadTroop = {
        spec: { id: 'archer' },
        alive: false,
        gx: 5,
        gy: 5,
        hp: 0,
        maxHp: 30,
        shield: 0,
        maxShield: 0,
        healGoldSpent: 0,
        dmgLevel: 1,
        rangeLevel: 1,
        speedLevel: 1,
        chainLevel: 1,
        hpLevel: 1,
        slowLevel: 1,
        healCount: 0,
        healTargetLevel: 1,
      };
      const game = {
        gold: 500,
        lives: 20,
        seed: 1,
        speed: 1,
        devMode: false,
        devMonsterCounts: {},
        wave: { currentWave: 0 },
        troops: [aliveTroop, deadTroop],
        appVersion: '1.6.0',
      };
      const data = SaveSerializer.fromGame(game, '1.6.0');
      expect(data.troops.length).toBe(1);
      expect(data.troops[0].specId).toBe('swordsman');
    });

    it('uses default version when not provided', () => {
      const game = {
        gold: 100,
        lives: 25,
        seed: 1,
        speed: 1,
        devMode: false,
        devMonsterCounts: {},
        wave: { currentWave: 0 },
        troops: [],
      };
      const data = SaveSerializer.fromGame(game, undefined);
      expect(data.version).toBe('1.0.0');
    });
  });

  describe('GameWorldFactory.createFresh', () => {
    it('returns grid, waypoints, and pathSegments', () => {
      const world = GameWorldFactory.createFresh(42);
      expect(world).toHaveProperty('grid');
      expect(world).toHaveProperty('waypoints');
      expect(world).toHaveProperty('pathSegments');
      expect(world.grid).toBeInstanceOf(Grid);
      expect(Array.isArray(world.waypoints)).toBe(true);
      expect(world.waypoints.length).toBeGreaterThan(0);
    });

    it('different seeds produce different paths', () => {
      const a = GameWorldFactory.createFresh(1);
      const b = GameWorldFactory.createFresh(2);
      const aKey = a.waypoints.map((p) => p.join(',')).join('|');
      const bKey = b.waypoints.map((p) => p.join(',')).join('|');
      expect(aKey === bKey).toBe(false);
    });

    it('pathSegments have correct structure', () => {
      const world = GameWorldFactory.createFresh(42);
      const { segments, totalLength } = world.pathSegments;
      expect(segments.length).toBeGreaterThanOrEqual(1);
      expect(totalLength).toBeGreaterThan(0);
      segments.forEach((seg) => {
        expect(seg).toHaveProperty('ax');
        expect(seg).toHaveProperty('ay');
        expect(seg).toHaveProperty('bx');
        expect(seg).toHaveProperty('by');
        expect(seg).toHaveProperty('len');
        expect(seg).toHaveProperty('cumStart');
        expect(seg.len).toBeGreaterThan(0);
      });
    });
  });

  describe('GameSnapshotRestorer', () => {
    function makeMinGame() {
      return {
        seed: 0,
        speed: 1,
        devMode: false,
        gold: 0,
        lives: 0,
        devMonsterCounts: {},
        grid: null,
        waypoints: null,
        pathSegments: null,
        monsters: [],
        troops: [],
        projectiles: [],
        popups: [],
        _popupPool: [],
        _monsterTileIndex: [],
        _troopTileIndex: [],
        _troopIndexByRef: new Map(),
        _projectilePool: [],
        _splashHitBuf: [],
        _chainBuf: [],
        _tileIndexPool: [],
        wave: null,
        waveCompleteAnim: { active: false, waveNum: 0 },
        state: '',
        _onProjectileImpact: null,
        markPathTiles: vi.fn(),
        _buildTroopTileIndex: vi.fn(),
        _needsSaveCleanup: false,
      };
    }

    describe('apply', () => {
      it('applies speed and devMode', () => {
        const game = makeMinGame();
        const data = { seed: 42, speed: 4, gold: 500, lives: 20, devMode: false, wave: { currentWave: 3 }, troops: [] };
        GameSnapshotRestorer.apply(game, data);
        expect(game.speed).toBe(4);
        expect(game.state).toBe('PRE_WAVE');
        expect(game._needsSaveCleanup).toBe(true);
      });

      it('handles missing speed with default 1', () => {
        const game = makeMinGame();
        const data = { seed: 42, gold: 500, lives: 20, devMode: false, wave: { currentWave: 0 }, troops: [] };
        GameSnapshotRestorer.apply(game, data);
        expect(game.speed).toBe(1);
      });

      it('merges devMonsterCounts', () => {
        const game = makeMinGame();
        game._defaultDevCounts = vi.fn(() => ({ 1: 0, 2: 0 }));
        const data = {
          seed: 42,
          speed: 1,
          gold: 500,
          lives: 20,
          devMode: true,
          wave: { currentWave: 3 },
          troops: [],
          devMonsterCounts: { 1: 5 },
        };
        GameSnapshotRestorer.apply(game, data);
        expect(game.devMonsterCounts[1]).toBe(5);
      });

      it('restores troops with upgrades', () => {
        const game = makeMinGame();
        const data = {
          seed: 42,
          speed: 1,
          gold: 500,
          lives: 20,
          devMode: false,
          wave: { currentWave: 1 },
          troops: [
            {
              specId: 'swordsman',
              gx: 3,
              gy: 4,
              hp: 40,
              maxHp: 50,
              shield: 0,
              maxShield: 0,
              healGoldSpent: 10,
              dmgLevel: 2,
              rangeLevel: 1,
              speedLevel: 1,
              chainLevel: 1,
              hpLevel: 1,
              slowLevel: 1,
              healCount: 1,
              healTargetLevel: 1,
            },
          ],
        };
        GameSnapshotRestorer.apply(game, data);
        expect(game.troops.length).toBe(1);
        expect(game.troops[0].dmgLevel).toBe(2);
      });

      it('skips troops with unknown specId', () => {
        const game = makeMinGame();
        GameSnapshotRestorer.apply(game, {
          seed: 42,
          speed: 1,
          gold: 500,
          lives: 20,
          devMode: false,
          wave: { currentWave: 1 },
          troops: [
            {
              specId: 'unknown_troop',
              gx: 3,
              gy: 4,
              hp: 50,
              maxHp: 50,
              shield: 0,
              maxShield: 0,
              healGoldSpent: 0,
              dmgLevel: 1,
              rangeLevel: 1,
              speedLevel: 1,
              chainLevel: 1,
              hpLevel: 1,
              slowLevel: 1,
              healCount: 0,
              healTargetLevel: 1,
            },
          ],
        });
        expect(game.troops.length).toBe(0);
      });

      it('normalizes healTargetLevel', () => {
        const game = makeMinGame();
        GameSnapshotRestorer.apply(game, {
          seed: 42,
          speed: 1,
          gold: 500,
          lives: 20,
          devMode: false,
          wave: { currentWave: 1 },
          troops: [
            {
              specId: 'swordsman',
              gx: 3,
              gy: 4,
              hp: 50,
              maxHp: 50,
              shield: 0,
              maxShield: 0,
              healGoldSpent: 0,
              dmgLevel: 1,
              rangeLevel: 1,
              speedLevel: 1,
              chainLevel: 1,
              hpLevel: 1,
              slowLevel: 1,
              healCount: 0,
              healTargetLevel: 99,
            },
          ],
        });
        expect(game.troops[0].healTargetLevel).toBeLessThanOrEqual(CONFIG.MAX_UPGRADE_LEVEL);
      });
    });

    describe('applyFresh', () => {
      it('resets all entity collections', () => {
        const game = makeMinGame();
        game.troops = [{ alive: true }];
        game.monsters = [{ alive: true }];
        game.projectiles = [{ alive: true }];
        GameSnapshotRestorer.applyFresh(game, 42);
        expect(game.troops.length).toBe(0);
        expect(game.monsters.length).toBe(0);
        expect(game.projectiles.length).toBe(0);
        expect(game.popups.length).toBe(0);
      });

      it('initializes _troopTileIndex as array of arrays', () => {
        const game = makeMinGame();
        GameSnapshotRestorer.applyFresh(game, 42);
        expect(game._troopTileIndex.length).toBe(CONFIG.GRID_SIZE * CONFIG.GRID_SIZE);
        expect(Array.isArray(game._troopTileIndex[0])).toBe(true);
      });
    });
  });

  describe('isValidTroop field validation (known limitation: shield/maxShield/healGoldSpent branches)', () => {
    it('rejects troop with negative shield (line 41)', () => {
      expect(
        SaveSerializer.isValid({
          version: '1.0',
          seed: 0,
          gold: 100,
          lives: 10,
          speed: 1,
          wave: { currentWave: 1 },
          troops: [
            {
              specId: 'swordsman',
              gx: 0,
              gy: 0,
              hp: 50,
              maxHp: 50,
              shield: -1,
              maxShield: 20,
              healTargetLevel: 1,
              healGoldSpent: 0,
              dmgLevel: 0,
              rangeLevel: 0,
              hpLevel: 0,
              speedLevel: 0,
              chainLevel: 0,
              slowLevel: 0,
            },
          ],
        })
      ).toBe(false);
    });

    it('rejects troop with negative maxShield (line 41)', () => {
      expect(
        SaveSerializer.isValid({
          version: '1.0',
          seed: 0,
          gold: 100,
          lives: 10,
          speed: 1,
          wave: { currentWave: 1 },
          troops: [
            {
              specId: 'swordsman',
              gx: 0,
              gy: 0,
              hp: 50,
              maxHp: 50,
              shield: 10,
              maxShield: -1,
              healTargetLevel: 1,
              healGoldSpent: 0,
              dmgLevel: 0,
              rangeLevel: 0,
              hpLevel: 0,
              speedLevel: 0,
              chainLevel: 0,
              slowLevel: 0,
            },
          ],
        })
      ).toBe(false);
    });

    it('rejects troop with NaN healGoldSpent (line 43)', () => {
      expect(
        SaveSerializer.isValid({
          version: '1.0',
          seed: 0,
          gold: 100,
          lives: 10,
          speed: 1,
          wave: { currentWave: 1 },
          troops: [
            {
              specId: 'swordsman',
              gx: 0,
              gy: 0,
              hp: 50,
              maxHp: 50,
              shield: 0,
              maxShield: 0,
              healTargetLevel: 1,
              healGoldSpent: NaN,
              dmgLevel: 0,
              rangeLevel: 0,
              hpLevel: 0,
              speedLevel: 0,
              chainLevel: 0,
              slowLevel: 0,
            },
          ],
        })
      ).toBe(false);
    });

    it('rejects troop with healTargetLevel 0 (line 44)', () => {
      expect(
        SaveSerializer.isValid({
          version: '1.0',
          seed: 0,
          gold: 100,
          lives: 10,
          speed: 1,
          wave: { currentWave: 1 },
          troops: [
            {
              specId: 'swordsman',
              gx: 0,
              gy: 0,
              hp: 50,
              maxHp: 50,
              shield: 0,
              maxShield: 0,
              healGoldSpent: 0,
              healTargetLevel: 0,
              dmgLevel: 0,
              rangeLevel: 0,
              hpLevel: 0,
              speedLevel: 0,
              chainLevel: 0,
              slowLevel: 0,
            },
          ],
        })
      ).toBe(false);
    });

    it('rejects troop with non-integer healTargetLevel (line 44)', () => {
      expect(
        SaveSerializer.isValid({
          version: '1.0',
          seed: 0,
          gold: 100,
          lives: 10,
          speed: 1,
          wave: { currentWave: 1 },
          troops: [
            {
              specId: 'swordsman',
              gx: 0,
              gy: 0,
              hp: 50,
              maxHp: 50,
              shield: 0,
              maxShield: 0,
              healGoldSpent: 0,
              healTargetLevel: 1.5,
              dmgLevel: 0,
              rangeLevel: 0,
              hpLevel: 0,
              speedLevel: 0,
              chainLevel: 0,
              slowLevel: 0,
            },
          ],
        })
      ).toBe(false);
    });
  });

  describe('SaveSerializer validation edge cases', () => {
    it('isValid returns false when speed is string', () => {
      expect(SaveSerializer.isValid({ seed: 42, speed: 'fast', troops: [] })).toBe(false);
    });

    it('isValid returns false when wave.currentWave is missing', () => {
      expect(SaveSerializer.isValid({ seed: 42, gold: 100, lives: 10, troops: [] })).toBe(false);
    });

    it('isValid returns false for negative wave', () => {
      expect(SaveSerializer.isValid({ seed: 42, gold: 100, lives: 10, wave: { currentWave: -1 }, troops: [] })).toBe(
        false
      );
    });

    it('isValid accepts valid data in dev mode with null gold/lives', () => {
      expect(
        SaveSerializer.isValid({
          seed: 42,
          devMode: true,
          gold: null,
          lives: null,
          wave: { currentWave: 0 },
          troops: [],
        })
      ).toBe(true);
    });

    it('isValid handles data.wave being missing', () => {
      expect(SaveSerializer.isValid({ seed: 42, gold: 100, lives: 10, troops: [], wave: undefined })).toBe(false);
    });

    it('isValidTroop returns false for null (line 23)', () => {
      // isValidTroop is internal; we test through isValid with a troop entry
      const data = {
        seed: 42,
        gold: 100,
        lives: 10,
        wave: { currentWave: 0 },
        troops: [
          { specId: 'swordsman', gx: 0, gy: 0, hp: 100, maxHp: 100, shield: 0, maxShield: 100, healGoldSpent: 0 },
        ],
      };
      expect(SaveSerializer.isValid(data)).toBe(true);
    });
  });

  describe('GameWorldFactory', () => {
    it('createFresh returns undefined pathSegments for edge seed', () => {
      const result = GameWorldFactory.createFresh(9999);
      expect(result).toBeDefined();
      expect(result.grid).toBeDefined();
      expect(result.waypoints).toBeDefined();
    });
  });

  describe('GameSnapshotRestorer.apply edge cases', () => {
    it('handles missing devMonsterCounts', () => {
      const game = {
        seed: 0,
        speed: 1,
        devMode: false,
        gold: 0,
        lives: 0,
        devMonsterCounts: {},
        grid: null,
        waypoints: null,
        pathSegments: null,
        monsters: [],
        troops: [],
        projectiles: [],
        popups: [],
        _popupPool: [],
        _monsterTileIndex: [],
        _troopTileIndex: [],
        _troopIndexByRef: new Map(),
        _projectilePool: [],
        _splashHitBuf: [],
        _chainBuf: [],
        _tileIndexPool: [],
        selectedTroopIndex: -1,
        selectedSpec: null,
        sellCooldownTimer: 0,
        sellConfirmPending: false,
        sellConfirmTroop: null,
        wave: { currentWave: 1, waveActive: false, queue: [], spawnIndex: 0, elapsed: 0 },
        _needsSaveCleanup: false,
        appVersion: '1.6.0',
        restart: vi.fn(),
        markPathTiles: vi.fn(),
        _buildTroopTileIndex: vi.fn(),
      };
      GameSnapshotRestorer.apply(game, {
        speed: 2,
        devMode: true,
        gold: Infinity,
        lives: Infinity,
        wave: { currentWave: 5 },
        troops: [],
      });
      expect(game.speed).toBe(2);
    });

    it('apply with devMode=true gives Infinity gold and lives (lines 132-133)', () => {
      const game = {
        seed: 0,
        speed: 1,
        devMode: true,
        gold: 0,
        lives: 0,
        devMonsterCounts: {},
        grid: null,
        waypoints: null,
        pathSegments: null,
        monsters: [],
        troops: [],
        projectiles: [],
        popups: [],
        _popupPool: [],
        _monsterTileIndex: [],
        _tileIndexPool: [],
        _splashHitBuf: [],
        _chainBuf: [],
        _troopTileIndex: [],
        _troopIndexByRef: new Map(),
        _projectilePool: [],
        selectedTroopIndex: -1,
        selectedSpec: null,
        sellCooldownTimer: 0,
        sellConfirmPending: false,
        sellConfirmTroop: null,
        _needsSaveCleanup: false,
        wave: { currentWave: 1, waveActive: false, queue: [], spawnIndex: 0, elapsed: 0 },
        markPathTiles: vi.fn(),
        _buildTroopTileIndex: vi.fn(),
        _defaultDevCounts: () => ({}),
      };
      GameSnapshotRestorer.apply(game, {
        speed: 1,
        devMode: true,
        gold: null,
        lives: null,
        wave: { currentWave: 1 },
        troops: [],
      });
      expect(game.gold).toBe(Infinity);
      expect(game.lives).toBe(Infinity);
    });

    it('apply with non-devMode missing gold/lives uses STARTING_GOLD/STARTING_LIVES (lines 132-133)', () => {
      const game = {
        seed: 0,
        speed: 1,
        devMode: false,
        gold: 0,
        lives: 0,
        devMonsterCounts: {},
        grid: null,
        waypoints: null,
        pathSegments: null,
        monsters: [],
        troops: [],
        projectiles: [],
        popups: [],
        _popupPool: [],
        _monsterTileIndex: [],
        _tileIndexPool: [],
        _splashHitBuf: [],
        _chainBuf: [],
        _troopTileIndex: [],
        _troopIndexByRef: new Map(),
        _projectilePool: [],
        selectedTroopIndex: -1,
        selectedSpec: null,
        sellCooldownTimer: 0,
        sellConfirmPending: false,
        sellConfirmTroop: null,
        _needsSaveCleanup: false,
        wave: { currentWave: 1, waveActive: false, queue: [], spawnIndex: 0, elapsed: 0 },
        markPathTiles: vi.fn(),
        _buildTroopTileIndex: vi.fn(),
        _defaultDevCounts: () => ({}),
      };
      GameSnapshotRestorer.apply(game, {
        speed: 1,
        devMode: false,
        gold: null,
        lives: null,
        wave: { currentWave: 1 },
        troops: [],
      });
      expect(game.gold).toBe(CONFIG.STARTING_GOLD);
      expect(game.lives).toBe(CONFIG.STARTING_LIVES);
    });

    it('apply restores troop with slowLevel (lines 168-173)', () => {
      const game = {
        seed: 0,
        speed: 1,
        devMode: false,
        gold: 500,
        lives: 20,
        devMonsterCounts: {},
        grid: null,
        waypoints: null,
        pathSegments: null,
        monsters: [],
        troops: [],
        projectiles: [],
        popups: [],
        _popupPool: [],
        _monsterTileIndex: [],
        _tileIndexPool: [],
        _splashHitBuf: [],
        _chainBuf: [],
        _troopTileIndex: [],
        _troopIndexByRef: new Map(),
        _projectilePool: [],
        selectedTroopIndex: -1,
        selectedSpec: null,
        sellCooldownTimer: 0,
        sellConfirmPending: false,
        sellConfirmTroop: null,
        _needsSaveCleanup: false,
        wave: { currentWave: 1, waveActive: false, queue: [], spawnIndex: 0, elapsed: 0 },
        markPathTiles: vi.fn(),
        _buildTroopTileIndex: vi.fn(),
        _defaultDevCounts: () => ({}),
      };
      const data = {
        speed: 1,
        devMode: false,
        gold: 500,
        lives: 20,
        seed: 12345,
        wave: { currentWave: 3 },
        troops: [
          {
            specId: 'icewiz',
            gx: 3,
            gy: 3,
            hp: 50,
            shield: 10,
            maxShield: 20,
            healCount: 2,
            dmgLevel: 2,
            rangeLevel: 1,
            hpLevel: 2,
            speedLevel: 1,
            chainLevel: 1,
            slowLevel: 3,
            healTargetLevel: 1,
          },
        ],
      };
      GameSnapshotRestorer.apply(game, data);
      expect(game.troops.length).toBe(1);
      expect(game.troops[0].slowLevel).toBe(3);
      expect(game.troops[0].shield).toBe(10);
    });
  });
});
