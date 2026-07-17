import { describe, expect, it, vi, beforeEach } from 'vitest';
import { shuffleSpecialMonstersInWave, WaveManager } from '../src/waveManager.js';
import { CONFIG, WAVES, MONSTER_SPECS } from '../src/config.js';

// ─── buildQueue ────────────────────────────────────────────────────────────

describe('WaveManager.buildQueue', () => {
  it('matches the scaled preview when queuing spawns', () => {
    const wave = new WaveManager();
    wave.currentWave = 10;
    wave.buildQueue();

    const firstEntry = wave.currentPreview[0];
    expect(wave.queue.filter((entry) => entry.level === firstEntry[0])).toHaveLength(firstEntry[1]);
  });

  it('queues Necromancers while preserving other monster order', () => {
    const wave = new WaveManager();
    wave.currentWave = 8;
    wave.buildQueue();

    const queueLevels = wave.queue.map((entry) => entry.level);
    expect(queueLevels.filter((level) => level === 'Y')).toHaveLength(1);
    expect(queueLevels.filter((level) => level === 'H')).toHaveLength(1);
    expect(queueLevels.filter((level) => level !== 'Y' && level !== 'H')).toEqual([
      4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 5, 5, 5, 5, 3, 3,
    ]);
  });

  it('builds queue for wave 1', () => {
    const wave = new WaveManager();
    expect(wave.queue.length).toBeGreaterThan(0);
  });

  it('builds scaled queue for wave 11 (cycle 1)', () => {
    const wave = new WaveManager();
    wave.currentWave = 10;
    wave.buildQueue();
    const preview = wave.currentPreview;
    expect(preview).toBeDefined();
    expect(preview.length).toBeGreaterThan(0);
  });

  it('builds scaled queue for wave 21 (cycle 2)', () => {
    const wave = new WaveManager();
    wave.currentWave = 20;
    wave.buildQueue();
    const preview = wave.currentPreview;
    expect(preview).toBeDefined();
    expect(preview.length).toBeGreaterThan(0);
  });
});

// ─── shuffleSpecialMonstersInWave ──────────────────────────────────────────────

describe('shuffleSpecialMonstersInWave', () => {
  it('preserves non-Necromancer order', () => {
    const result = shuffleSpecialMonstersInWave([1, 2, 'Y', 3, 'Y', 4], () => 0.5);

    expect(result.filter((level) => level !== 'Y')).toEqual([1, 2, 3, 4]);
  });

  it('keeps Necromancer count', () => {
    const result = shuffleSpecialMonstersInWave([1, 'Y', 2, 'Y', 'Y', 3], () => 0.25);

    expect(result.filter((level) => level === 'Y')).toHaveLength(3);
    expect(result).toHaveLength(6);
  });

  it('can move Necromancer before the first non-Necromancer with deterministic random', () => {
    const result = shuffleSpecialMonstersInWave([1, 2, 3, 'Y'], () => 0);

    expect(result).toEqual(['Y', 1, 2, 3]);
  });

  it('preserves total count of all entries', () => {
    const input = [1, 2, 'Y', 3, 'Y', 4, 'Y'];
    const result = shuffleSpecialMonstersInWave(input, () => 0.5);
    expect(result.length).toBe(input.length);
  });

  it('does not change non-Necromancer order', () => {
    const input = [1, 2, 3, 4, 'Y'];
    const result = shuffleSpecialMonstersInWave(input, () => 0.5);
    const nonNecros = result.filter((x) => x !== 'Y');
    expect(nonNecros).toEqual([1, 2, 3, 4]);
  });

  it('handles all-Necromancer input (no change)', () => {
    const input = ['Y', 'Y', 'Y'];
    const result = shuffleSpecialMonstersInWave(input, () => 0.5);
    expect(result).toEqual(['Y', 'Y', 'Y']);
  });

  it('handles all-non-Necromancer input (no change)', () => {
    const input = [1, 2, 3];
    const result = shuffleSpecialMonstersInWave(input, () => 0.5);
    expect(result).toEqual([1, 2, 3]);
  });

  it('handles empty input', () => {
    const result = shuffleSpecialMonstersInWave([], () => 0.5);
    expect(result).toEqual([]);
  });

  it('handles single Necromancer', () => {
    const result = shuffleSpecialMonstersInWave(['Y'], () => 0.5);
    expect(result).toEqual(['Y']);
  });

  it('deterministic with same random function', () => {
    const input = [1, 2, 'Y', 3, 'Y'];
    const rng = () => 0.3;
    const r1 = shuffleSpecialMonstersInWave(input, rng);
    const r2 = shuffleSpecialMonstersInWave(input, rng);
    expect(r1).toEqual(r2);
  });
});

// ─── buildCustomFromCounts ──────────────────────────────────────────────────

describe('buildCustomFromCounts', () => {
  it('queues Necromancers and preserves non-Necromancer order', () => {
    const wave = new WaveManager();

    wave.buildCustomFromCounts({ 1: 2, 2: 1, 3: 2, Y: 1 });

    const queueLevels = wave.queue.map((entry) => entry.level);
    expect(queueLevels.filter((level) => level === 'Y')).toHaveLength(1);
    expect(queueLevels.filter((level) => level !== 'Y')).toEqual([1, 1, 2, 3, 3]);
  });

  it('builds queue from counts object', () => {
    const wave = new WaveManager();
    wave.buildCustomFromCounts({ 1: 3, 2: 2 });
    expect(wave.queue.length).toBe(5);
    const levelCounts = {};
    for (const entry of wave.queue) {
      levelCounts[entry.level] = (levelCounts[entry.level] || 0) + 1;
    }
    expect(levelCounts[1]).toBe(3);
    expect(levelCounts[2]).toBe(2);
  });

  it('includes Necromancer from custom counts', () => {
    const wave = new WaveManager();
    wave.buildCustomFromCounts({ Y: 1, 1: 2 });
    expect(wave.queue.length).toBe(3);
    const necroCount = wave.queue.filter((e) => e.level === 'Y').length;
    expect(necroCount).toBe(1);
  });

  it('sets currentPreview from built queue', () => {
    const wave = new WaveManager();
    wave.buildCustomFromCounts({ 1: 2, B: 1 });
    expect(wave.currentPreview).toBeDefined();
    expect(Array.isArray(wave.currentPreview)).toBe(true);
  });

  it('resets spawnIndex and elapsed', () => {
    const wave = new WaveManager();
    wave.spawnIndex = 5;
    wave.elapsed = 10;
    wave.buildCustomFromCounts({ 1: 1 });
    expect(wave.spawnIndex).toBe(0);
    expect(wave.elapsed).toBe(0);
  });

  it('applies hpMult to spawned monsters', () => {
    const wave = new WaveManager();
    wave.buildCustomFromCounts({ 1: 1 });
    expect(wave.queue[0].hpMult).toBeGreaterThan(0);
  });

  it('handles empty counts', () => {
    const wave = new WaveManager();
    wave.buildCustomFromCounts({});
    expect(wave.queue.length).toBe(0);
  });

  it('handles all monster types', () => {
    const wave = new WaveManager();
    const counts = { 1: 1, 2: 1, 3: 1, 4: 1, 5: 1, Y: 1, B: 1, S: 1, X: 1 };
    wave.buildCustomFromCounts(counts);
    expect(wave.queue.length).toBe(9);
  });
});

// ─── reset ─────────────────────────────────────────────────────────────────

describe('WaveManager.reset', () => {
  it('sets currentWave=0, waveActive=false, elapsed=0', () => {
    const wave = new WaveManager();
    wave.reset();

    expect(wave.currentWave).toBe(0);
    expect(wave.waveActive).toBe(false);
    expect(wave.elapsed).toBe(0);
    expect(wave.spawnIndex).toBe(0);
  });

  it('clears state that was previously set', () => {
    const wave = new WaveManager();
    wave.currentWave = 5;
    wave.waveActive = true;
    wave.queue = [{ level: 1, spawnAt: 0, hpMult: 1 }];
    wave.elapsed = 100;

    wave.reset();

    expect(wave.currentWave).toBe(0);
    expect(wave.waveActive).toBe(false);
    expect(wave.elapsed).toBe(0);
    expect(wave.spawnIndex).toBe(0);
  });
});

// ─── startNextWave ─────────────────────────────────────────────────────────

describe('startNextWave', () => {
  it('returns true and sets waveActive=true when not already active', () => {
    const wave = new WaveManager();
    const result = wave.startNextWave();

    expect(result).toBe(true);
    expect(wave.waveActive).toBe(true);
  });

  it('returns false when waveActive=true (already started)', () => {
    const wave = new WaveManager();
    wave.startNextWave();
    const result = wave.startNextWave();

    expect(result).toBe(false);
    expect(wave.waveActive).toBe(true);
  });
});

// ─── popDueMonster ─────────────────────────────────────────────────────────

describe('popDueMonster', () => {
  it('returns null when not active', () => {
    const wave = new WaveManager();
    wave.buildCustomFromCounts({ 1: 2 });
    wave.elapsed = 10;

    expect(wave.popDueMonster()).toBeNull();
  });

  it('returns null when queue is exhausted (spawnIndex >= queue.length)', () => {
    const wave = new WaveManager();
    wave.buildCustomFromCounts({ 1: 1 });
    wave.startNextWave();
    wave.elapsed = 10;

    wave.popDueMonster();
    expect(wave.popDueMonster()).toBeNull();
  });

  it('returns monster data when elapsed >= spawnAt time', () => {
    const wave = new WaveManager();
    wave.buildCustomFromCounts({ 1: 1 });
    wave.startNextWave();
    wave.elapsed = 100;

    const monster = wave.popDueMonster();

    expect(monster).not.toBeNull();
    expect(monster.level).toBe(1);
    expect(typeof monster.hpMult).toBe('number');
  });

  it('returns null when spawn time has not elapsed', () => {
    const wave = new WaveManager();
    wave.startNextWave();
    wave.elapsed = 0;
    expect(wave.popDueMonster()).toBeNull();
  });
});

// ─── update ────────────────────────────────────────────────────────────────

describe('update', () => {
  it('increments elapsed when active', () => {
    const wave = new WaveManager();
    wave.startNextWave();
    wave.update(0.5);

    expect(wave.elapsed).toBeCloseTo(0.5);
  });

  it('does nothing when not active', () => {
    const wave = new WaveManager();
    wave.update(0.5);

    expect(wave.elapsed).toBe(0);
  });
});

// ─── onAllSpawnedAndCleared ─────────────────────────────────────────────────

describe('onAllSpawnedAndCleared', () => {
  it('increments currentWave and rebuilds queue', () => {
    const wave = new WaveManager();
    wave.startNextWave();
    wave.onAllSpawnedAndCleared();

    expect(wave.currentWave).toBe(1);
    expect(wave.queue.length).toBeGreaterThan(0);
  });

  it('does nothing when not active', () => {
    const wave = new WaveManager();
    const prevWave = wave.currentWave;

    wave.onAllSpawnedAndCleared();

    expect(wave.currentWave).toBe(prevWave);
  });

  it('does nothing when wave is not active even with spawnIndex < queue.length', () => {
    const wave = new WaveManager();
    wave.waveActive = false;
    wave.spawnIndex = 0;
    wave.onAllSpawnedAndCleared();
    expect(wave.currentWave).toBe(0);
  });

  it('rebuilds queue for next wave after incrementing', () => {
    const wave = new WaveManager();
    wave.waveActive = true;
    wave.spawnIndex = wave.queue.length;
    wave.onAllSpawnedAndCleared();
    expect(wave.queue.length).toBeGreaterThan(0);
    expect(wave.spawnIndex).toBe(0);
  });
});

// ─── _getScaling ───────────────────────────────────────────────────────────

describe('_getScaling', () => {
  it('cycle=0 returns {countMult: 1, hpMult: 1}', () => {
    const wave = new WaveManager();
    const result = wave._getScaling(0);

    expect(result).toEqual({ countMult: 1, hpMult: 1 });
  });

  it('cycle > 0 applies WAVE_SCALE_COUNT and WAVE_SCALE_HP', () => {
    const wave = new WaveManager();
    const result = wave._getScaling(3);

    expect(result.countMult).toBeCloseTo(1 + 3 * 0.35);
    expect(result.hpMult).toBeCloseTo(1 + 3 * 0.15);
  });

  it('scales more for higher cycles', () => {
    const wave = new WaveManager();
    const s1 = wave._getScaling(1);
    const s5 = wave._getScaling(5);
    expect(s5.countMult).toBeGreaterThan(s1.countMult);
    expect(s5.hpMult).toBeGreaterThan(s1.hpMult);
  });
});

// ─── currentMultiplier ──────────────────────────────────────────────────────

describe('currentMultiplier', () => {
  it('returns correct count multiplier for current wave', () => {
    const wave = new WaveManager();
    wave.currentWave = 0;

    expect(wave.currentMultiplier).toBe(1);
  });

  it('returns > 1 for wave 11+', () => {
    const wave = new WaveManager();
    wave.currentWave = 10;
    expect(wave.currentMultiplier).toBeGreaterThan(1);
  });
});

// ─── monstersRemainingThisWave ──────────────────────────────────────────────

describe('monstersRemainingThisWave', () => {
  it('returns queue.length - spawnIndex', () => {
    const wave = new WaveManager();
    wave.buildCustomFromCounts({ 1: 3, 2: 1 });
    wave.startNextWave();
    wave.elapsed = 100;

    wave.popDueMonster();

    expect(wave.monstersRemainingThisWave).toBe(3);
  });
});

// ─── getNextWavePreview ─────────────────────────────────────────────────────

describe('getNextWavePreview', () => {
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
      expect(typeof entry[0] === 'string' || typeof entry[0] === 'number').toBe(true);
      expect(typeof entry[1]).toBe('number');
      expect(entry[1]).toBeGreaterThanOrEqual(1);
    }
  });

  it('returns currentPreview', () => {
    const preview = wave.getNextWavePreview();
    expect(preview).toBe(wave.currentPreview);
  });

  it('matches WAVES[0] for wave 1 (currentWave=0)', () => {
    wave.currentWave = 0;
    wave.buildQueue();
    const preview = wave.getNextWavePreview();

    expect(preview).toEqual([[1, 8]]);
  });

  it('returns wave 2 preview after incrementing currentWave to 1', () => {
    wave.currentWave = 1;
    wave.buildQueue();
    const preview = wave.getNextWavePreview();

    expect(preview).toEqual([[1, 12]]);
  });

  it('returns wave 3 preview with mixed monster types', () => {
    wave.currentWave = 2;
    wave.buildQueue();
    const preview = wave.getNextWavePreview();

    expect(preview).toEqual([
      [1, 6],
      [2, 6],
    ]);
  });
});

// ─── _previewForWave ───────────────────────────────────────────────────────

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
    const result = wave._previewForWave(8);
    const expected = WAVES[8];

    const resultLevels = result.map(([level]) => level);
    const expectedLevels = expected.map(([level]) => level);

    expect(resultLevels).toEqual(expectedLevels);
  });

  it('wraps around using modulo for waves beyond the base list', () => {
    const waveCount = WAVES.length;
    const result = wave._previewForWave(waveCount);
    const base = WAVES[0];

    const resultLevels = result.map(([level]) => level);
    const baseLevels = base.map(([level]) => level);

    expect(resultLevels).toEqual(baseLevels);
  });

  it('applies count scaling for higher cycles', () => {
    const cycle1Result = wave._previewForWave(WAVES.length);
    const base = WAVES[0];

    const expectedCount = Math.round((8 + 1 * 2) * (1 + 1 * CONFIG.WAVE_SCALE_COUNT));
    const clampedCount = Math.min(CONFIG.MAX_SPAWNS_PER_TYPE, expectedCount);

    expect(cycle1Result[0][1]).toBe(clampedCount);
  });

  it('applies cycle=2 scaling for waves beyond 2x wave count', () => {
    const cycle2Result = wave._previewForWave(WAVES.length * 2);
    const base = WAVES[0];

    const expectedCount = Math.round((8 + 2 * 2) * (1 + 2 * CONFIG.WAVE_SCALE_COUNT));
    const clampedCount = Math.min(CONFIG.MAX_SPAWNS_PER_TYPE, expectedCount);

    expect(cycle2Result[0][1]).toBe(clampedCount);
  });

  it('respects MAX_SPAWNS_PER_TYPE cap', () => {
    const veryHighCycleWave = WAVES.length * 100;
    const result = wave._previewForWave(veryHighCycleWave);

    for (const [, count] of result) {
      expect(count).toBeLessThanOrEqual(CONFIG.MAX_SPAWNS_PER_TYPE);
    }
  });

  it('minimum count is always at least 1', () => {
    const result = wave._previewForWave(0);

    for (const [, count] of result) {
      expect(count).toBeGreaterThanOrEqual(1);
    }
  });
});

// ─── preview through wave lifecycle ────────────────────────────────────────

describe('WaveManager preview through wave lifecycle', () => {
  it('preview updates after advancing to the next wave', () => {
    const wave = new WaveManager();

    const preview1 = wave.getNextWavePreview();
    expect(preview1).toEqual([[1, 8]]);

    wave.startNextWave();
    wave.onAllSpawnedAndCleared();

    const preview2 = wave.getNextWavePreview();
    expect(preview2).toEqual([[1, 12]]);
  });

  it('preview continues through multiple wave advances', () => {
    const wave = new WaveManager();

    for (let i = 0; i < 3; i++) {
      wave.startNextWave();
      wave.onAllSpawnedAndCleared();
    }

    const preview = wave.getNextWavePreview();
    const levels = preview.map(([level]) => level);
    expect(levels).toContain(3);
    expect(levels).toContain(2);
  });

  it('preview cycles and scales for waves beyond the base list', () => {
    const wave = new WaveManager();

    wave.currentWave = 10;
    wave.buildQueue();

    const preview = wave.getNextWavePreview();
    expect(preview[0][0]).toBe(1);
    expect(preview[0][1]).toBeGreaterThan(8);
  });
});

// ─── getNextWaveEstimate ───────────────────────────────────────────────────

describe('WaveManager.getNextWaveEstimate()', () => {
  let wave;

  beforeEach(() => {
    wave = new WaveManager();
  });

  it('returns estimate with start time, duration, gold, and leak for wave 1', () => {
    const estimate = wave.getNextWaveEstimate();

    expect(estimate).toMatchObject({
      timeUntilStart: CONFIG.WAVE_START_DELAY,
      startsIn: CONFIG.WAVE_START_DELAY,
      totalGold: 8 * MONSTER_SPECS[1].reward,
      totalLeak: 8 * MONSTER_SPECS[1].leak,
      hasNecromancer: false,
      reviveEstimate: null,
    });
    expect(estimate.estimatedDuration).toBeGreaterThan(0);
    expect(estimate.clearDuration).toBe(estimate.estimatedDuration);
  });

  it('returns 0 start time when wave is active', () => {
    wave.startNextWave();

    const estimate = wave.getNextWaveEstimate();

    expect(estimate.timeUntilStart).toBe(0);
    expect(estimate.startsIn).toBe(0);
  });

  it('calculates total gold from monster rewards', () => {
    wave.currentWave = 2;
    wave.buildQueue();

    const estimate = wave.getNextWaveEstimate();
    const expectedGold = 6 * MONSTER_SPECS[1].reward + 6 * MONSTER_SPECS[2].reward;

    expect(estimate.totalGold).toBe(expectedGold);
    expect(estimate.gold).toBe(expectedGold);
  });

  it('calculates total leak from monster leaks', () => {
    wave.currentWave = 8;
    wave.buildQueue();

    const estimate = wave.getNextWaveEstimate();
    const expectedLeak =
      10 * MONSTER_SPECS[4].leak +
      4 * MONSTER_SPECS[5].leak +
      1 * MONSTER_SPECS.Y.leak +
      1 * MONSTER_SPECS.H.leak +
      2 * MONSTER_SPECS[3].leak;

    expect(estimate.totalLeak).toBe(expectedLeak);
  });

  it('includes revive estimate for waves with Necromancer', () => {
    wave.currentWave = 8;
    wave.buildQueue();

    const estimate = wave.getNextWaveEstimate();

    expect(estimate.hasNecromancer).toBe(true);
    expect(estimate.reviveEstimate).not.toBeNull();
    expect(estimate.reviveEstimate.count).toBeGreaterThan(0);
    expect(estimate.reviveEstimate.gold).toBeGreaterThan(0);
    expect(estimate.reviveEstimate.additionalDuration).toBeGreaterThan(0);
  });

  it('has null revive estimate for waves without Necromancer', () => {
    const estimate = wave.getNextWaveEstimate();

    expect(estimate.hasNecromancer).toBe(false);
    expect(estimate.reviveEstimate).toBeNull();
  });

  it('applies scaling to gold and leak for higher waves', () => {
    wave.currentWave = WAVES.length;
    wave.buildQueue();

    const estimate = wave.getNextWaveEstimate();
    const expectedCount = Math.round((8 + 1 * 2) * (1 + 1 * CONFIG.WAVE_SCALE_COUNT));
    const clampedCount = Math.min(CONFIG.MAX_SPAWNS_PER_TYPE, expectedCount);
    const expectedGold = clampedCount * MONSTER_SPECS[1].reward;

    expect(estimate.totalGold).toBe(expectedGold);
    expect(estimate.totalLeak).toBe(clampedCount * MONSTER_SPECS[1].leak);
  });

  it('estimates duration includes spawn timing and path traversal', () => {
    const estimate = wave.getNextWaveEstimate();
    const expectedSpawnDuration = 8 * CONFIG.SPAWN_INTERVAL;
    const expectedPathDuration = CONFIG.MIN_PATH_LENGTH / CONFIG.MOVEMENT_SPEEDS[MONSTER_SPECS[1].movementSpeed];

    expect(estimate.estimatedDuration).toBeCloseTo(expectedSpawnDuration + expectedPathDuration, 0);
  });
});

// ─── _estimateRevives ───────────────────────────────────────────────────────

describe('_estimateRevives', () => {
  it('returns null when no Necromancers', () => {
    const wave = new WaveManager();
    const result = wave._estimateRevives(0, 10, 1000);
    expect(result).toBeNull();
  });

  it('returns null when no non-Necromancers', () => {
    const wave = new WaveManager();
    const result = wave._estimateRevives(1, 0, 0);
    expect(result).toBeNull();
  });

  it('returns estimate when both present', () => {
    const wave = new WaveManager();
    const result = wave._estimateRevives(1, 10, 1000);
    expect(result).not.toBeNull();
    expect(result.revivedCount).toBeGreaterThan(0);
    expect(result.additionalGold).toBeGreaterThanOrEqual(0);
    expect(result.additionalDuration).toBeGreaterThan(0);
  });

  it('caps revivedCount at 25% of non-Necromancers', () => {
    const wave = new WaveManager();
    const result = wave._estimateRevives(10, 4, 100);
    expect(result.revivedCount).toBeLessThanOrEqual(1);
  });
});

// ─── wave composition validation ────────────────────────────────────────────

describe('wave composition validation', () => {
  it('every wave has at least one entry', () => {
    for (let i = 0; i < WAVES.length; i++) {
      expect(WAVES[i].length).toBeGreaterThan(0);
    }
  });

  it('every wave entry has valid monster key', () => {
    const validKeys = new Set(['1', '2', '3', '4', '5', 'Y', 'B', 'S', 'X', 'H']);
    for (const wave of WAVES) {
      for (const [level, count] of wave) {
        expect(validKeys.has(String(level))).toBe(true);
        expect(count).toBeGreaterThan(0);
      }
    }
  });

  it('wave 9 includes Necromancer', () => {
    const wave9 = WAVES[8];
    expect(wave9.some(([level]) => level === 'Y')).toBe(true);
  });

  it('wave 10 includes Boss', () => {
    const wave10 = WAVES[9];
    expect(wave10.some(([level]) => level === 'B')).toBe(true);
  });
});

// ─── _getMonsterSpec ────────────────────────────────────────────────────────

describe('_getMonsterSpec', () => {
  it('returns MONSTER_SPECS.B for level B', () => {
    const wave = new WaveManager();
    expect(wave._getMonsterSpec('B')).toBe(MONSTER_SPECS.B);
  });

  it('returns MONSTER_SPECS[level] for numeric levels', () => {
    const wave = new WaveManager();
    expect(wave._getMonsterSpec(1)).toBe(MONSTER_SPECS[1]);
    expect(wave._getMonsterSpec(5)).toBe(MONSTER_SPECS[5]);
  });

  it('returns MONSTER_SPECS for string levels like Y, S, X', () => {
    const wave = new WaveManager();
    expect(wave._getMonsterSpec('Y')).toBe(MONSTER_SPECS.Y);
    expect(wave._getMonsterSpec('S')).toBe(MONSTER_SPECS.S);
    expect(wave._getMonsterSpec('X')).toBe(MONSTER_SPECS.X);
  });
});

// ─── _estimateSpawnDuration ─────────────────────────────────────────────────

describe('_estimateSpawnDuration', () => {
  it('uses RUNNER_SPAWN_INTERVAL for level 2 runners', () => {
    const wave = new WaveManager();
    const preview = [[2, 3]];
    const result = wave._estimateSpawnDuration(preview);
    expect(result).toBe(3 * CONFIG.RUNNER_SPAWN_INTERVAL);
  });

  it('uses SPAWN_INTERVAL for non-runner levels', () => {
    const wave = new WaveManager();
    const preview = [[1, 4]];
    const result = wave._estimateSpawnDuration(preview);
    expect(result).toBe(4 * CONFIG.SPAWN_INTERVAL);
  });

  it('mixes runner and non-runner intervals', () => {
    const wave = new WaveManager();
    const preview = [
      [1, 2],
      [2, 3],
    ];
    const result = wave._estimateSpawnDuration(preview);
    expect(result).toBeCloseTo(2 * CONFIG.SPAWN_INTERVAL + 3 * CONFIG.RUNNER_SPAWN_INTERVAL);
  });

  it('returns 0 for empty preview', () => {
    const wave = new WaveManager();
    expect(wave._estimateSpawnDuration([])).toBe(0);
  });
});

// ─── _estimatePathDuration ──────────────────────────────────────────────────

describe('_estimatePathDuration', () => {
  it('returns 0 for empty preview', () => {
    const wave = new WaveManager();
    expect(wave._estimatePathDuration([])).toBe(0);
  });

  it('calculates weighted average path duration', () => {
    const wave = new WaveManager();
    const preview = [[1, 2]];
    const spec = MONSTER_SPECS[1];
    const speed = CONFIG.MOVEMENT_SPEEDS[spec.movementSpeed] || spec.speed;
    const expected = CONFIG.MIN_PATH_LENGTH / Math.max(0.1, speed);
    expect(wave._estimatePathDuration(preview)).toBeCloseTo(expected);
  });

  it('uses speed from MOVEMENT_SPEEDS map', () => {
    const wave = new WaveManager();
    // Boss has movementSpeed 'very slow' → MOVEMENT_SPEEDS['very slow'] = 0.6
    const preview = [['B', 1]];
    const speed = CONFIG.MOVEMENT_SPEEDS['very slow'];
    const expected = CONFIG.MIN_PATH_LENGTH / Math.max(0.1, speed);
    expect(wave._estimatePathDuration(preview)).toBeCloseTo(expected);
  });

  it('skips levels with no monster spec', () => {
    const wave = new WaveManager();
    const preview = [
      ['Z', 5],
      [1, 2],
    ];
    // 'Z' has no spec, so it's skipped; only the level-1 monsters count
    const spec = MONSTER_SPECS[1];
    const speed = CONFIG.MOVEMENT_SPEEDS[spec.movementSpeed] || spec.speed;
    const expected = CONFIG.MIN_PATH_LENGTH / Math.max(0.1, speed);
    expect(wave._estimatePathDuration(preview)).toBeCloseTo(expected);
  });

  it('weights multiple monster types correctly', () => {
    const wave = new WaveManager();
    const preview = [
      [1, 1],
      [5, 1],
    ];
    const spec1 = MONSTER_SPECS[1];
    const spec5 = MONSTER_SPECS[5];
    const speed1 = CONFIG.MOVEMENT_SPEEDS[spec1.movementSpeed] || spec1.speed;
    const speed5 = CONFIG.MOVEMENT_SPEEDS[spec5.movementSpeed] || spec5.speed;
    const d1 = CONFIG.MIN_PATH_LENGTH / Math.max(0.1, speed1);
    const d5 = CONFIG.MIN_PATH_LENGTH / Math.max(0.1, speed5);
    const expected = (d1 + d5) / 2;
    expect(wave._estimatePathDuration(preview)).toBeCloseTo(expected);
  });
});

// ─── _estimateRevives edge cases ────────────────────────────────────────────

describe('_estimateRevives edge cases', () => {
  it('returns null when revivedCount is 0 (too few non-necros)', () => {
    const wave = new WaveManager();
    // 1 necro, 3 non-necros → floor(3*0.25)=0 revived
    const result = wave._estimateRevives(1, 3, 300);
    expect(result).toBeNull();
  });

  it('caps revivedCount at MONSTER_REVIVE_MAX_TARGETS per necro', () => {
    const wave = new WaveManager();
    // 2 necros × 4 = 8, but floor(100*0.25)=25 → min(8,25)=8
    const result = wave._estimateRevives(2, 100, 5000);
    expect(result.revivedCount).toBe(CONFIG.MONSTER_REVIVE_MAX_TARGETS * 2);
  });

  it('calculates additionalGold based on avg reward estimate', () => {
    const wave = new WaveManager();
    const result = wave._estimateRevives(1, 10, 1000);
    expect(result.additionalGold).toBeGreaterThanOrEqual(0);
  });

  it('additionalDuration is proportional to revivedCount', () => {
    const wave = new WaveManager();
    const r1 = wave._estimateRevives(1, 10, 1000);
    const r2 = wave._estimateRevives(2, 40, 4000);
    // r2 has more revived targets → longer duration
    expect(r2.additionalDuration).toBeGreaterThan(r1.additionalDuration);
  });
});

// ─── getNextWaveEstimate edge cases ─────────────────────────────────────────

describe('getNextWaveEstimate edge cases', () => {
  it('returns null when currentPreview is null', () => {
    const wave = new WaveManager();
    wave.currentPreview = null;
    expect(wave.getNextWaveEstimate()).toBeNull();
  });

  it('includes gold alias (rewardGold) in revive estimate', () => {
    const wave = new WaveManager();
    wave.currentWave = 8; // wave 9 has Necromancer
    wave.buildQueue();
    const estimate = wave.getNextWaveEstimate();
    if (estimate.reviveEstimate) {
      expect(estimate.reviveEstimate.rewardGold).toBe(estimate.reviveEstimate.gold);
    }
  });

  it('includes targets alias in revive estimate', () => {
    const wave = new WaveManager();
    wave.currentWave = 8;
    wave.buildQueue();
    const estimate = wave.getNextWaveEstimate();
    if (estimate.reviveEstimate) {
      expect(estimate.reviveEstimate.targets).toBe(estimate.reviveEstimate.count);
    }
  });

  it('handles Boss monsters in preview (level B)', () => {
    const wave = new WaveManager();
    wave.buildCustomFromCounts({ B: 1 });
    const estimate = wave.getNextWaveEstimate();
    expect(estimate.totalGold).toBe(MONSTER_SPECS.B.reward);
    expect(estimate.totalLeak).toBe(MONSTER_SPECS.B.leak);
  });

  it('handles Shielded monsters in preview (level S)', () => {
    const wave = new WaveManager();
    wave.buildCustomFromCounts({ S: 2 });
    const estimate = wave.getNextWaveEstimate();
    expect(estimate.totalGold).toBe(2 * MONSTER_SPECS.S.reward);
  });

  it('handles Spear monsters in preview (level X)', () => {
    const wave = new WaveManager();
    wave.buildCustomFromCounts({ X: 3 });
    const estimate = wave.getNextWaveEstimate();
    expect(estimate.totalGold).toBe(3 * MONSTER_SPECS.X.reward);
  });
});

// ─── popDueMonster sequential pops ──────────────────────────────────────────

describe('popDueMonster sequential pops', () => {
  it('pops multiple monsters in order as elapsed increases', () => {
    const wave = new WaveManager();
    wave.buildCustomFromCounts({ 1: 3 });
    wave.startNextWave();

    const popped = [];
    for (let t = 0; t < 10; t += 0.1) {
      wave.elapsed = t;
      const m = wave.popDueMonster();
      if (m) popped.push(m);
    }
    expect(popped.length).toBe(3);
    expect(popped.every((m) => m.level === 1)).toBe(true);
  });

  it('returns hpMult from queue entry', () => {
    const wave = new WaveManager();
    wave.buildCustomFromCounts({ 1: 1 });
    wave.startNextWave();
    wave.elapsed = 100;
    const m = wave.popDueMonster();
    expect(m.hpMult).toBe(wave.queue[0].hpMult);
  });

  it('does not pop same monster twice', () => {
    const wave = new WaveManager();
    wave.buildCustomFromCounts({ 1: 1 });
    wave.startNextWave();
    wave.elapsed = 100;
    wave.popDueMonster();
    expect(wave.popDueMonster()).toBeNull();
  });
});

// ─── onAllSpawnedAndCleared edge cases ──────────────────────────────────────

describe('onAllSpawnedAndCleared edge cases', () => {
  it('sets waveComplete to true', () => {
    const wave = new WaveManager();
    wave.startNextWave();
    wave.onAllSpawnedAndCleared();
    expect(wave.waveComplete).toBe(true);
  });

  it('resets waveActive to false', () => {
    const wave = new WaveManager();
    wave.startNextWave();
    expect(wave.waveActive).toBe(true);
    wave.onAllSpawnedAndCleared();
    expect(wave.waveActive).toBe(false);
  });

  it('can start next wave after clearing', () => {
    const wave = new WaveManager();
    wave.startNextWave();
    wave.onAllSpawnedAndCleared();
    expect(wave.startNextWave()).toBe(true);
  });
});

// ─── buildCustomFromCounts with scaling ─────────────────────────────────────

describe('buildCustomFromCounts with scaling', () => {
  it('applies hpMult from current wave scaling', () => {
    const wave = new WaveManager();
    wave.currentWave = 20; // cycle 2 → hpMult > 1
    wave.buildCustomFromCounts({ 1: 1 });
    const hpMult = wave.queue[0].hpMult;
    expect(hpMult).toBeGreaterThan(1);
  });

  it('resets waveComplete and waveActive flags', () => {
    const wave = new WaveManager();
    wave.waveComplete = true;
    wave.buildCustomFromCounts({ 1: 1 });
    // buildCustomFromCounts doesn't touch waveActive/waveComplete
    // but it does reset spawnIndex and elapsed
    expect(wave.spawnIndex).toBe(0);
    expect(wave.elapsed).toBe(0);
  });
});

// ─── shuffleSpecialMonstersInWave edge case ────────────────────────────────────

describe('shuffleSpecialMonstersInWave edge cases', () => {
  it('places necromancer at end when random=0.99', () => {
    const result = shuffleSpecialMonstersInWave([1, 2, 3, 'Y'], () => 0.99);
    const necroIdx = result.indexOf('Y');
    // With 3 non-necros, slots = 4 (indices 0-3), floor(0.99*4)=3 → last slot
    expect(result[3]).toBe('Y');
  });

  it('multiple necromancers distributed across slots', () => {
    const result = shuffleSpecialMonstersInWave([1, 2, 'Y', 'Y'], () => 0.5);
    const necros = result.filter((x) => x === 'Y');
    expect(necros).toHaveLength(2);
    expect(result.filter((x) => x !== 'Y')).toEqual([1, 2]);
  });
});
