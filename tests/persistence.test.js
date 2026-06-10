import { describe, it, expect } from 'vitest';
import { SaveSerializer, GameWorldFactory } from '../src/gamePersistence.js';
import { CONFIG } from '../src/config.js';

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
    // Valid troop
    expect(SaveSerializer.isValid({ ...base, troops: [{ specId: 'archer', gx: 0, gy: 0, hp: 100 }] })).toBe(true);
    // Missing specId
    expect(SaveSerializer.isValid({ ...base, troops: [{ gx: 0, gy: 0 }] })).toBe(false);
    // Missing gx
    expect(SaveSerializer.isValid({ ...base, troops: [{ specId: 'archer', gy: 0 }] })).toBe(false);
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
        { alive: true, spec: { id: 'archer' }, gx: 3, gy: 5, hp: 80, maxHp: 100, dmgLevel: 1, rangeLevel: 1, speedLevel: 1, chainLevel: 1, hpLevel: 1, slowLevel: 1, shield: 0, maxShield: 0, healCount: 0, healGoldSpent: 0 },
        { alive: false, spec: { id: 'knight' }, gx: 1, gy: 1, hp: 0, maxHp: 50, dmgLevel: 1, rangeLevel: 1, speedLevel: 1, chainLevel: 1, hpLevel: 1, slowLevel: 1, shield: 0, maxShield: 0, healCount: 0, healGoldSpent: 0 },
      ],
    };
    const data = SaveSerializer.fromGame(game);

    expect(data.version).toBe('1.5.0-beta.1');
    expect(data.gold).toBe(500);
    expect(data.lives).toBe(20);
    expect(data.seed).toBe(42);
    expect(data.speed).toBe(2);
    expect(data.wave.currentWave).toBe(5);
    expect(data.troops).toHaveLength(1);
    expect(data.troops[0].specId).toBe('archer');
    expect(data.troops[0].gx).toBe(3);
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
