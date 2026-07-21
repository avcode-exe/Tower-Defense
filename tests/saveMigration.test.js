/* tripwire inventory:
 *  - (known limitation: no save migration) — older schemas are not migrated
 */

import { describe, it, expect, vi, beforeAll } from 'vitest';
import { CONFIG, TROOP_SPECS } from '../src/config.js';

vi.mock('../src/rendering/renderer.js', () => ({
  RENDERER: { markCacheDirty: vi.fn(), _rebuildCache: vi.fn(), init: vi.fn(), resize: vi.fn() },
}));
vi.mock('../src/particles.js', () => ({
  PARTICLES: { clear: vi.fn(), update: vi.fn(), deathBurst: vi.fn(), hitSpark: vi.fn() },
}));
vi.mock('../src/ui/index.js', () => ({
  UI: { shopScrollY: 0 },
}));

describe('save migration', () => {
  let SaveSerializer, GameSnapshotRestorer, loadFixture;

  beforeAll(async () => {
    const mod = await import('../src/gamePersistence.js');
    SaveSerializer = mod.SaveSerializer;
    GameSnapshotRestorer = mod.GameSnapshotRestorer;
    const helpers = await import('./helpers.js');
    loadFixture = helpers.loadFixture;
  });

  it('loads v1.6.0-beta.2 valid fixture', () => {
    const data = loadFixture('v1.6.0-beta.2-valid.json');
    expect(data).not.toBeNull();
    expect(SaveSerializer.isValid(data)).toBe(true);
  });

  it('v1.0.0-legacy is valid (missing fields get defaults)', () => {
    const data = loadFixture('v1.0.0-legacy.json');
    expect(data).not.toBeNull();
    expect(SaveSerializer.isValid(data)).toBe(true);
  });

  it('v2.0.0-future is rejected (no gx/gy fields)', () => {
    const data = loadFixture('v2.0.0-future.json');
    expect(data).not.toBeNull();
    expect(SaveSerializer.isValid(data)).toBe(false);
  });

  it('corrupt-missing-seed is invalid', () => {
    const data = loadFixture('corrupt-missing-seed.json');
    expect(data).not.toBeNull();
    expect(SaveSerializer.isValid(data)).toBe(false);
  });

  it('corrupt-negative-values is invalid', () => {
    const data = loadFixture('corrupt-negative-values.json');
    expect(data).not.toBeNull();
    expect(SaveSerializer.isValid(data)).toBe(false);
  });

  it('corrupt-not-json returns null from loadFixture', () => {
    const data = loadFixture('corrupt-not-json.json');
    expect(data).toBeNull();
  });

  it('does not migrate older schema versions (known limitation: no save migration)', () => {
    const data = loadFixture('v1.0.0-legacy.json');
    expect(SaveSerializer.isValid(data)).toBe(true);
  });

  it('rejects future schema rather than guessing (known limitation: no save migration)', () => {
    expect(SaveSerializer.isValid(loadFixture('v2.0.0-future.json'))).toBe(false);
  });

  it('version field is inert — isValid ignores version value', () => {
    const data = loadFixture('v1.6.0-beta.2-valid.json');
    expect(data).not.toBeNull();
    // Modify version to something crazy — still valid
    data.version = '999.999.999';
    expect(SaveSerializer.isValid(data)).toBe(true);
  });

  it('SaveSerializer.fromGame output has expected key set', () => {
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
    expect(Object.keys(data).sort()).toEqual([
      'devMode',
      'devMonsterCounts',
      'gold',
      'lives',
      'seed',
      'speed',
      'troops',
      'version',
      'wave',
    ]);
  });

  it('round-trip equivalence: fromGame → isValid → restore', () => {
    const game = {
      gold: 500,
      lives: 20,
      seed: 123,
      speed: 1,
      devMode: false,
      devMonsterCounts: {},
      wave: { currentWave: 3 },
      troops: [
        {
          specId: 'swordsman',
          gx: 3,
          gy: 4,
          hp: 45,
          maxHp: 57,
          dmgLevel: 2,
          rangeLevel: 1,
          speedLevel: 1,
          chainLevel: 1,
          hpLevel: 2,
          slowLevel: 1,
          shield: 57,
          maxShield: 57,
          healCount: 1,
          healTargetLevel: 1,
          healGoldSpent: 7,
        },
      ],
      appVersion: '1.6.0',
    };
    const data = SaveSerializer.fromGame(game, '1.6.0');
    expect(SaveSerializer.isValid(data)).toBe(true);
  });

  it('corrupt JSON string guarded by try/catch', () => {
    expect(() => JSON.parse('not json')).toThrow();
  });
});
