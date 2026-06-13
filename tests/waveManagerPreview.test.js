import { describe, expect, it, beforeEach } from 'vitest';
import { WaveManager } from '../src/waveManager.js';
import { WAVES, CONFIG } from '../src/config.js';

describe('WaveManager.getNextWavePreview()', () => {
  let wave;

  beforeEach(() => {
    wave = new WaveManager();
  });

  it('returns a non-null preview after construction (wave 1)', () => {
    const preview = wave.getNextWavePreview();
    expect(preview).not.toBeNull();
    expect(Array.isArray(preview)).toBe(true);
  });

  it('returns array of [level, count] tuples', () => {
    const preview = wave.getNextWavePreview();

    for (const entry of preview) {
      expect(Array.isArray(entry)).toBe(true);
      expect(entry).toHaveLength(2);
      expect(typeof entry[0] === 'string' || typeof entry[0] === 'number').toBe(true); // level can be number or string ('Y', 'B', etc.)
      expect(typeof entry[1]).toBe('number');
      expect(entry[1]).toBeGreaterThanOrEqual(1);
    }
  });

  it('matches WAVES[0] for wave 1 (currentWave=0)', () => {
    wave.currentWave = 0;
    wave.buildQueue();
    const preview = wave.getNextWavePreview();

    // WAVES[0] = [[1, 8]] — wave 1 has 8 Grunts
    expect(preview).toEqual([[1, 8]]);
  });

  it('returns wave 2 preview after incrementing currentWave to 1', () => {
    wave.currentWave = 1;
    wave.buildQueue();
    const preview = wave.getNextWavePreview();

    // WAVES[1] = [[1, 12]] — wave 2 has 12 Grunts
    expect(preview).toEqual([[1, 12]]);
  });

  it('returns wave 3 preview with mixed monster types', () => {
    wave.currentWave = 2;
    wave.buildQueue();
    const preview = wave.getNextWavePreview();

    // WAVES[2] = [[1, 6], [2, 6]] — wave 3 has 6 Grunts + 6 Runners
    expect(preview).toEqual([[1, 6], [2, 6]]);
  });
});

describe('WaveManager._previewForWave()', () => {
  let wave;

  beforeEach(() => {
    wave = new WaveManager();
  });

  it('returns correct structure for wave 0 (first wave)', () => {
    const result = wave._previewForWave(0);

    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBe(WAVES[0].length);

    for (const entry of result) {
      expect(entry).toHaveLength(2);
      expect(typeof entry[0] === 'string' || typeof entry[0] === 'number').toBe(true);
      expect(typeof entry[1]).toBe('number');
    }
  });

  it('returns the base wave data for cycle 0 (no scaling)', () => {
    const result = wave._previewForWave(0);
    const expected = WAVES[0];

    expect(result).toEqual(expected.map(([level, count]) => [level, count]));
  });

  it('includes correct monster types from WAVES config for wave 9', () => {
    const result = wave._previewForWave(8); // wave 9 = index 8
    const expected = WAVES[8];

    const resultLevels = result.map(([level]) => level);
    const expectedLevels = expected.map(([level]) => level);

    expect(resultLevels).toEqual(expectedLevels);
  });

  it('wraps around using modulo for waves beyond the base list', () => {
    const waveCount = WAVES.length;
    const result = wave._previewForWave(waveCount); // should wrap to WAVES[0]
    const base = WAVES[0];

    // Same monster types as wave 1 but with scaling applied (cycle=1)
    const resultLevels = result.map(([level]) => level);
    const baseLevels = base.map(([level]) => level);

    expect(resultLevels).toEqual(baseLevels);
  });

  it('applies count scaling for higher cycles', () => {
    const cycle1Result = wave._previewForWave(WAVES.length); // cycle=1
    const base = WAVES[0]; // wave 1 = [[1, 8]]

    // With cycle=1: countMult = 1 + 1 * 0.35 = 1.35
    // For wave 1 base count 8: (8 + 1*2) * 1.35 = 10 * 1.35 = 13.5 -> round -> 14
    const expectedCount = Math.round((8 + 1 * 2) * (1 + 1 * CONFIG.WAVE_SCALE_COUNT));
    const clampedCount = Math.min(CONFIG.MAX_SPAWNS_PER_TYPE, expectedCount);

    expect(cycle1Result[0][1]).toBe(clampedCount);
  });

  it('applies cycle=2 scaling for waves beyond 2x wave count', () => {
    const cycle2Result = wave._previewForWave(WAVES.length * 2); // cycle=2
    const base = WAVES[0]; // wave 1 = [[1, 8]]

    // With cycle=2: countMult = 1 + 2 * 0.35 = 1.7
    // For wave 1 base count 8: (8 + 2*2) * 1.7 = 12 * 1.7 = 20.4 -> round -> 20
    const expectedCount = Math.round((8 + 2 * 2) * (1 + 2 * CONFIG.WAVE_SCALE_COUNT));
    const clampedCount = Math.min(CONFIG.MAX_SPAWNS_PER_TYPE, expectedCount);

    expect(cycle2Result[0][1]).toBe(clampedCount);
  });

  it('respects MAX_SPAWNS_PER_TYPE cap', () => {
    // Force a very high cycle to trigger the cap
    const veryHighCycleWave = WAVES.length * 100;
    const result = wave._previewForWave(veryHighCycleWave);

    for (const [, count] of result) {
      expect(count).toBeLessThanOrEqual(CONFIG.MAX_SPAWNS_PER_TYPE);
    }
  });

  it('minimum count is always at least 1', () => {
    // Even if scaling produces 0, count should be >= 1
    const result = wave._previewForWave(0);

    for (const [, count] of result) {
      expect(count).toBeGreaterThanOrEqual(1);
    }
  });
});

describe('WaveManager preview through wave lifecycle', () => {
  it('preview updates after advancing to the next wave', () => {
    const wave = new WaveManager();

    const preview1 = wave.getNextWavePreview();
    expect(preview1).toEqual([[1, 8]]); // wave 1

    wave.startNextWave();
    wave.onAllSpawnedAndCleared();

    const preview2 = wave.getNextWavePreview();
    expect(preview2).toEqual([[1, 12]]); // wave 2
  });

  it('preview continues through multiple wave advances', () => {
    const wave = new WaveManager();

    // Advance through waves 1-3
    for (let i = 0; i < 3; i++) {
      wave.startNextWave();
      wave.onAllSpawnedAndCleared();
    }

    // Now at wave 4 (index 3): WAVES[3] = [[3, 3], [2, 6]]
    const preview = wave.getNextWavePreview();
    const levels = preview.map(([level]) => level);
    expect(levels).toContain(3); // Brute
    expect(levels).toContain(2); // Runner
  });

  it('preview cycles and scales for waves beyond the base list', () => {
    const wave = new WaveManager();

    // Advance to wave 11 (index 10, cycle=1 since 10/10=1)
    wave.currentWave = 10;
    wave.buildQueue();

    const preview = wave.getNextWavePreview();
    // WAVES[0] = [[1, 8]] wrapped with cycle=1 scaling
    // Monster type should be '1' (Grunts)
    expect(preview[0][0]).toBe(1);
    // Count should be > 8 due to scaling
    expect(preview[0][1]).toBeGreaterThan(8);
  });
});
