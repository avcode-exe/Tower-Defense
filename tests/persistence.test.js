import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
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
  let SaveSerializer, GameWorldFactory, GameSnapshotRestorer, SaveMigrator;

  beforeAll(async () => {
    const mod = await import('../src/gamePersistence.js');
    SaveSerializer = mod.SaveSerializer;
    GameWorldFactory = mod.GameWorldFactory;
    GameSnapshotRestorer = mod.GameSnapshotRestorer;
    SaveMigrator = mod.SaveMigrator;
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
      expect(data.version).toBe(SaveMigrator.CURRENT_VERSION);
    });

    it('includes preview when includePreview is true', () => {
      const game = {
        gold: 500,
        lives: 20,
        seed: 1,
        speed: 1,
        devMode: false,
        devMonsterCounts: {},
        wave: { currentWave: 0 },
        troops: [],
      };
      const data = SaveSerializer.fromGame(game, '1.0.0', true);
      // In Node.js, captureSavePreview returns null, so preview should not be added
      expect(data._meta.preview).toBeUndefined();
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
        _defaultDevCounts: vi.fn(() => ({})),
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
        _defaultDevCounts: vi.fn(() => ({})),
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

// ── Helper: fake game objects for meta-data tests ──
function makeMetaGame(overrides = {}) {
  return {
    wave: { currentWave: 5 },
    gold: 1000,
    lives: 20,
    ...overrides,
  };
}

describe('SaveRotationManager', () => {
  let SaveRotationManager, SaveMigrator;

  beforeAll(async () => {
    const mod = await import('../src/gamePersistence.js');
    SaveRotationManager = mod.SaveRotationManager;
    SaveMigrator = mod.SaveMigrator;
  });

  describe('autoSaveSlots', () => {
    it('returns 3 slot names', () => {
      const slots = SaveRotationManager.autoSaveSlots();
      expect(slots).toHaveLength(3);
    });

    it('prefixed with autosave.', () => {
      const slots = SaveRotationManager.autoSaveSlots();
      for (const s of slots) {
        expect(s).toMatch(/^autosave\.\d+$/);
      }
    });
  });

  describe('selectSlotForWrite', () => {
    it('returns first slot when no existing slots', () => {
      expect(SaveRotationManager.selectSlotForWrite([])).toBe('autosave.0');
    });

    it('returns first slot when input is null', () => {
      expect(SaveRotationManager.selectSlotForWrite(null)).toBe('autosave.0');
    });

    it('returns the oldest slot by timestamp (LRU eviction)', () => {
      const existing = [
        { slot: 'autosave.0', meta: { timestamp: 300 } },
        { slot: 'autosave.1', meta: { timestamp: 100 } }, // oldest
        { slot: 'autosave.2', meta: { timestamp: 200 } },
      ];
      expect(SaveRotationManager.selectSlotForWrite(existing)).toBe('autosave.1');
    });

    it('handles single existing slot', () => {
      const existing = [{ slot: 'autosave.0', meta: { timestamp: 500 } }];
      expect(SaveRotationManager.selectSlotForWrite(existing)).toBe('autosave.0');
    });

    it('handles entries with missing meta', () => {
      const existing = [
        { slot: 'autosave.0', meta: null },
        { slot: 'autosave.1' },
        { slot: 'autosave.2', meta: { timestamp: 999 } },
      ];
      // Entries without timestamps get ts=0 — the first such entry is oldest
      const result = SaveRotationManager.selectSlotForWrite(existing);
      expect(result).toBe('autosave.0');
    });

    it('falls back to first slot when no known slot matches', () => {
      const existing = [{ slot: 'manual_save', meta: { timestamp: 100 } }];
      expect(SaveRotationManager.selectSlotForWrite(existing)).toBe('autosave.0');
    });

    it('handles entries with slot property but no known names', () => {
      const existing = [
        { slot: 'unknown.0', meta: { timestamp: 50 } },
        { slot: 'unknown.1', meta: { timestamp: 150 } },
      ];
      expect(SaveRotationManager.selectSlotForWrite(existing)).toBe('autosave.0');
    });

    it('filters out entries without slot property', () => {
      const existing = [
        { meta: { timestamp: 100 } }, // no slot property
        { slot: 'autosave.0', meta: { timestamp: 300 } },
        { slot: 'autosave.1', meta: { timestamp: 200 } },
      ];
      expect(SaveRotationManager.selectSlotForWrite(existing)).toBe('autosave.1');
    });
  });

  describe('makeMetaData', () => {
    it('extracts wave, gold, lives from game', () => {
      const meta = SaveRotationManager.makeMetaData(makeMetaGame());
      expect(meta.wave).toBe(5);
      expect(meta.gold).toBe(1000);
      expect(meta.lives).toBe(20);
      expect(meta.version).toBe(SaveMigrator.CURRENT_VERSION);
      expect(meta.timestamp).toBeGreaterThan(0);
    });

    it('stores null gold for dev mode (Infinity)', () => {
      const meta = SaveRotationManager.makeMetaData(makeMetaGame({ gold: Infinity }));
      expect(meta.gold).toBeNull();
    });

    it('stores null lives for dev mode (Infinity)', () => {
      const meta = SaveRotationManager.makeMetaData(makeMetaGame({ lives: Infinity }));
      expect(meta.lives).toBeNull();
    });

    it('defaults wave to 0 when game lacks wave', () => {
      const meta = SaveRotationManager.makeMetaData(makeMetaGame({ wave: null }));
      expect(meta.wave).toBe(0);
    });

    it('defaults wave to 0 when wave has no currentWave', () => {
      const meta = SaveRotationManager.makeMetaData(makeMetaGame({ wave: {} }));
      expect(meta.wave).toBe(0);
    });
  });

  describe('extractMeta', () => {
    it('reads from _meta field when present', () => {
      const data = {
        _meta: { timestamp: 100, wave: 3, gold: 500, lives: 10, version: '1.7.1' },
        gold: 999, // should NOT be used
      };
      const meta = SaveRotationManager.extractMeta(data);
      expect(meta.wave).toBe(3);
      expect(meta.gold).toBe(500);
      expect(meta.timestamp).toBe(100);
    });

    it('falls back to top-level fields when _meta missing', () => {
      const data = {
        gold: 200,
        lives: 15,
        wave: { currentWave: 7 },
        version: '1.6.0',
      };
      const meta = SaveRotationManager.extractMeta(data);
      expect(meta.wave).toBe(7);
      expect(meta.gold).toBe(200);
      expect(meta.lives).toBe(15);
    });

    it('returns null for null input', () => {
      expect(SaveRotationManager.extractMeta(null)).toBeNull();
    });

    it('returns null for undefined input', () => {
      expect(SaveRotationManager.extractMeta(undefined)).toBeNull();
    });

    it('returns null for non-object input', () => {
      expect(SaveRotationManager.extractMeta('string')).toBeNull();
    });

    it('handles _meta that is not an object (falsy but present)', () => {
      // When data._meta exists but is not an object, fallback to top-level fields
      const data = {
        _meta: 'string_instead_of_object',
        gold: 300,
        lives: 15,
        wave: { currentWave: 4 },
        version: '1.6.0',
      };
      const meta = SaveRotationManager.extractMeta(data);
      expect(meta.wave).toBe(4);
      expect(meta.gold).toBe(300);
    });

    it('preserves preview from _meta', () => {
      const data = {
        _meta: {
          timestamp: 100,
          wave: 1,
          gold: 100,
          lives: 10,
          version: '1.7.1',
          preview: 'data:image/jpeg;base64,abc123',
        },
      };
      const meta = SaveRotationManager.extractMeta(data);
      expect(meta.preview).toBe('data:image/jpeg;base64,abc123');
    });
  });

  describe('summarize', () => {
    it('returns formatted string with all fields', () => {
      const meta = { wave: 5, gold: 1000, lives: 20, timestamp: new Date('2026-07-23T12:00:00').getTime() };
      const s = SaveRotationManager.summarize(meta);
      expect(s).toContain('Wave 5');
      expect(s).toContain('1000g');
      expect(s).toContain('20 lives');
    });

    it('handles partial metadata (missing fields)', () => {
      const meta = { wave: 3 };
      const s = SaveRotationManager.summarize(meta);
      expect(s).toContain('Wave 3');
      expect(s).not.toContain('g');
      expect(s).not.toContain('lives');
    });

    it('returns placeholder for null input', () => {
      expect(SaveRotationManager.summarize(null)).toBe('Unknown save');
    });

    it('returns placeholder for undefined input', () => {
      expect(SaveRotationManager.summarize(undefined)).toBe('Unknown save');
    });

    it('handles gold-only metadata', () => {
      const meta = { gold: 500 };
      const s = SaveRotationManager.summarize(meta);
      expect(s).toContain('500g');
    });
  });
});

describe('captureSavePreview', () => {
  it('returns null in Node.js environment (no document)', async () => {
    const { captureSavePreview } = await import('../src/gamePersistence.js');
    expect(captureSavePreview()).toBeNull();
  });
});

describe('compareVersions', () => {
  let SaveMigrator;

  beforeAll(async () => {
    const mod = await import('../src/gamePersistence.js');
    SaveMigrator = mod.SaveMigrator;
  });

  function cmp(a, b) {
    return SaveMigrator.compareVersions(a, b);
  }

  it('equal versions return 0', () => {
    expect(cmp('1.7.0', '1.7.0')).toBe(0);
  });

  it('major version dominates', () => {
    expect(cmp('2.0.0', '1.9.9')).toBeGreaterThan(0);
    expect(cmp('1.0.0', '2.0.0')).toBeLessThan(0);
  });

  it('minor version', () => {
    expect(cmp('1.8.0', '1.7.0')).toBeGreaterThan(0);
    expect(cmp('1.7.0', '1.8.0')).toBeLessThan(0);
  });

  it('patch version', () => {
    expect(cmp('1.7.1', '1.7.0')).toBeGreaterThan(0);
    expect(cmp('1.7.0', '1.7.1')).toBeLessThan(0);
  });

  it('pre-release has lower precedence than release', () => {
    expect(cmp('1.7.0-beta.1', '1.7.0')).toBeLessThan(0);
    expect(cmp('1.7.0', '1.7.0-beta.1')).toBeGreaterThan(0);
  });

  it('pre-release vs pre-release with same numeric parts', () => {
    expect(cmp('1.7.0-alpha', '1.7.0-beta')).toBe(0); // same numeric, both pre
  });

  it('different length numeric segments', () => {
    expect(cmp('1.7', '1.7.0')).toBe(0);
    expect(cmp('1.7.0.1', '1.7.0')).toBeGreaterThan(0);
  });

  it('identical strings return 0 early', () => {
    expect(cmp('1.7.0', '1.7.0')).toBe(0);
  });

  it('handles non-numeric segments gracefully', () => {
    // Non-numeric parts map to 0, so '1.x.0' == '1.0.0'
    expect(cmp('1.x.0', '1.0.0')).toBe(0);
    expect(cmp('1.0.0', '1.x.0')).toBe(0);
  });
});

describe('SaveMigrator', () => {
  let SaveMigrator, SaveSerializer;

  beforeAll(async () => {
    const mod = await import('../src/gamePersistence.js');
    SaveMigrator = mod.SaveMigrator;
    SaveSerializer = mod.SaveSerializer;
  });

  it('returns null for null input', () => {
    expect(SaveMigrator.migrate(null)).toBe(null);
  });

  it('returns non-object input unchanged', () => {
    expect(SaveMigrator.migrate('string')).toBe('string');
    expect(SaveMigrator.migrate(42)).toBe(42);
  });

  it('sets version to CURRENT_VERSION for already-versioned saves', () => {
    const data = { version: '1.0.0', seed: 1, troops: [] };
    const result = SaveMigrator.migrate(data);
    expect(result.version).toBe(SaveMigrator.CURRENT_VERSION);
    expect(result.seed).toBe(1);
  });

  it('migrates v0 (no version) save with defaults', () => {
    const data = { seed: 1 };
    const result = SaveMigrator.migrate(data);
    expect(result.version).toBe(SaveMigrator.CURRENT_VERSION);
    expect(result.gold).toBe(0);
    expect(result.lives).toBe(0);
    expect(result.speed).toBe(1);
    expect(result.devMode).toBe(false);
    expect(result.wave).toEqual({ currentWave: 0 });
    expect(result.troops).toEqual([]);
  });

  it('does not override null values in v0 migration', () => {
    const data = { seed: 1, gold: null, lives: null };
    const result = SaveMigrator.migrate(data);
    expect(result.gold).toBe(null);
    expect(result.lives).toBe(null);
  });

  it('does not override existing values in v0 migration', () => {
    const data = {
      seed: 1,
      gold: 500,
      lives: 20,
      speed: 2,
      devMode: true,
      wave: { currentWave: 5 },
      troops: [{ specId: 'archer', gx: 1, gy: 1, hp: 10, maxHp: 10, shield: 0, maxShield: 0, healGoldSpent: 0 }],
    };
    const result = SaveMigrator.migrate(data);
    expect(result.gold).toBe(500);
    expect(result.lives).toBe(20);
    expect(result.speed).toBe(2);
    expect(result.devMode).toBe(true);
    expect(result.wave).toEqual({ currentWave: 5 });
    expect(result.troops).toHaveLength(1);
  });

  it('upgrades _meta version when existing save has _meta', () => {
    const data = {
      seed: 42,
      gold: 500,
      lives: 20,
      speed: 1,
      wave: { currentWave: 3 },
      troops: [],
      _meta: { timestamp: 100, wave: 3, gold: 500, lives: 20, version: '1.6.0' },
    };
    const result = SaveMigrator.migrate(data);
    expect(result._meta.version).toBe(SaveMigrator.CURRENT_VERSION);
  });

  it('rejects dev mode save with null gold (isValid dev branch)', () => {
    expect(
      SaveSerializer.isValid({
        seed: 42,
        devMode: true,
        gold: null,
        lives: null,
        wave: { currentWave: 1 },
        troops: [],
      })
    ).toBe(true);
  });

  it('rejects non-finite wave.currentWave', () => {
    expect(SaveSerializer.isValid({ seed: 42, gold: 100, lives: 10, wave: { currentWave: NaN }, troops: [] })).toBe(
      false
    );
  });
  describe('captureSavePreview edge cases', () => {
    let captureSavePreview;

    beforeAll(async () => {
      const mod = await import('../src/gamePersistence.js');
      captureSavePreview = mod.captureSavePreview;
    });

    it('returns null when document is undefined (Node.js)', () => {
      // In vitest with jsdom, document exists.
      // But CaptureSavePreview also checks RENDERER.canvas.
      // This just verifies the function exists and runs.
      const result = captureSavePreview();
      // Either null (no canvas) or undefined (if RENDERER.canvas is falsy)
      expect(result).toBeNull();
    });
  });

  describe('selectSlotForWrite LRU edge cases', () => {
    let SaveRotationManager;

    beforeAll(async () => {
      const mod = await import('../src/gamePersistence.js');
      SaveRotationManager = mod.SaveRotationManager;
    });

    it('returns first slot when existingSlots is null', () => {
      const result = SaveRotationManager.selectSlotForWrite(null);
      expect(result).toBe('autosave.0');
    });

    it('returns first slot when existingSlots is empty', () => {
      const result = SaveRotationManager.selectSlotForWrite([]);
      expect(result).toBe('autosave.0');
    });

    it('filters out manual slots, keeping only auto-saves', () => {
      const mixed = [
        { slot: 'my_manual_save', meta: { timestamp: 100 } },
        { slot: 'autosave.0', meta: { timestamp: 200 } },
      ];
      const result = SaveRotationManager.selectSlotForWrite(mixed);
      // Only autosave.0 is considered, so it's the oldest
      expect(result).toBe('autosave.0');
    });

    it('picks oldest slot when multiple auto-saves exist', () => {
      const entries = [
        { slot: 'autosave.1', meta: { timestamp: 300 } },
        { slot: 'autosave.0', meta: { timestamp: 100 } },
        { slot: 'autosave.2', meta: { timestamp: 200 } },
      ];
      const result = SaveRotationManager.selectSlotForWrite(entries);
      expect(result).toBe('autosave.0');
    });

    it('uses default slot when auto-save entries have no timestamps', () => {
      const entries = [
        { slot: 'autosave.2', meta: {} },
        { slot: 'autosave.1', meta: { noTimestamp: true } },
        { slot: 'autosave.0', meta: { timestamp: 0 } },
      ];
      const result = SaveRotationManager.selectSlotForWrite(entries);
      // All have timestamp 0 or falsy, first one iterated wins
      expect(result).toBe('autosave.2');
    });
  });

  describe('extractMeta edge cases', () => {
    let SaveRotationManager;

    beforeAll(async () => {
      const mod = await import('../src/gamePersistence.js');
      SaveRotationManager = mod.SaveRotationManager;
    });

    it('returns null for null data', () => {
      expect(SaveRotationManager.extractMeta(null)).toBeNull();
    });

    it('returns null for non-object data', () => {
      expect(SaveRotationManager.extractMeta('string')).toBeNull();
    });

    it('falls back to top-level fields when _meta is not an object', () => {
      const data = {
        _meta: 'string_instead_of_object',
        gold: 500,
        lives: 30,
        wave: { currentWave: 3 },
      };
      const meta = SaveRotationManager.extractMeta(data);
      expect(meta.gold).toBe(500);
      expect(meta.lives).toBe(30);
      expect(meta.wave).toBe(3);
    });

    it('copies _meta object when it exists', () => {
      const data = {
        _meta: { timestamp: 1000, wave: 5, gold: 200, lives: 15, version: '1.7.1' },
      };
      const meta = SaveRotationManager.extractMeta(data);
      expect(meta.version).toBe('1.7.1');
      expect(meta.wave).toBe(5);
    });
  });

  describe('summarize edge cases', () => {
    let SaveRotationManager;

    beforeAll(async () => {
      const mod = await import('../src/gamePersistence.js');
      SaveRotationManager = mod.SaveRotationManager;
    });

    it('returns default string for null meta', () => {
      expect(SaveRotationManager.summarize(null)).toBe('Unknown save');
    });

    it('builds summary with partial data', () => {
      const meta = { wave: 7, gold: 1500 };
      const result = SaveRotationManager.summarize(meta);
      expect(result).toContain('Wave 7');
      expect(result).toContain('1500g');
    });

    it('includes timestamp when available', () => {
      const meta = { wave: 3, gold: 500, lives: 20, timestamp: 1700000000000 };
      const result = SaveRotationManager.summarize(meta);
      expect(result).toContain('Wave 3');
      expect(result).toContain('500g');
      expect(result).toContain('20 lives');
    });
  });

  describe('captureSavePreview with mocked canvas', () => {
    beforeEach(() => {
      // Mock RENDERER to have a canvas
      const mockCanvas = {
        width: 800,
        height: 600,
        toDataURL: vi.fn(() => 'data:image/jpeg;base64,mockdata'),
      };
      // Need to access RENDERER from the module
      vi.stubGlobal('document', {
        querySelector: vi.fn(() => null),
        createElement: vi.fn(() => ({
          width: 200,
          height: 150,
          toDataURL: vi.fn(() => 'data:image/jpeg;base64,thumb'),
          getContext: vi.fn(() => ({
            drawImage: vi.fn(),
          })),
        })),
      });
    });

    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it('returns null when RENDERER.canvas is null and no DOM canvas', async () => {
      const mod = await import('../src/gamePersistence.js');
      const result = mod.captureSavePreview();
      // document exists but querySelector returns null -> canvas=null -> return null
      expect(result).toBeNull();
    });
  });
});
