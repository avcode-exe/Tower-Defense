import { describe, expect, it } from 'vitest';
import { shuffleNecromancersInWave, WaveManager } from '../src/waveManager.js';

describe('WaveManager.buildQueue', () => {
  it('matches the scaled preview when queuing spawns', () => {
    const wave = new WaveManager();
    wave.currentWave = 10;
    wave.buildQueue();

    const firstEntry = wave.currentPreview[0];
    expect(wave.queue.filter((entry) => entry.level === firstEntry[0])).toHaveLength(firstEntry[1]);
  });
});

describe('shuffleNecromancersInWave', () => {
  it('preserves non-Necromancer order', () => {
    const result = shuffleNecromancersInWave([1, 2, 'Y', 3, 'Y', 4], () => 0.5);

    expect(result.filter((level) => level !== 'Y')).toEqual([1, 2, 3, 4]);
  });

  it('keeps Necromancer count', () => {
    const result = shuffleNecromancersInWave([1, 'Y', 2, 'Y', 'Y', 3], () => 0.25);

    expect(result.filter((level) => level === 'Y')).toHaveLength(3);
    expect(result).toHaveLength(6);
  });

  it('can move Necromancer before the first non-Necromancer with deterministic random', () => {
    const result = shuffleNecromancersInWave([1, 2, 3, 'Y'], () => 0);

    expect(result).toEqual(['Y', 1, 2, 3]);
  });
});

describe('WaveManager.buildQueue', () => {
  it('queues Necromancers while preserving other monster order', () => {
    const wave = new WaveManager();
    wave.currentWave = 8;
    wave.buildQueue();

    const queueLevels = wave.queue.map((entry) => entry.level);
    expect(queueLevels.filter((level) => level === 'Y')).toHaveLength(1);
    expect(queueLevels.filter((level) => level !== 'Y')).toEqual([4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 5, 5, 5, 5, 3, 3]);
  });
});

describe('WaveManager.buildCustomFromCounts', () => {
  it('queues Necromancers and preserves non-Necromancer order', () => {
    const wave = new WaveManager();

    wave.buildCustomFromCounts({ 1: 2, 2: 1, 3: 2, Y: 1 });

    const queueLevels = wave.queue.map((entry) => entry.level);
    expect(queueLevels.filter((level) => level === 'Y')).toHaveLength(1);
    expect(queueLevels.filter((level) => level !== 'Y')).toEqual([1, 1, 2, 3, 3]);
  });
});

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

describe('WaveManager.startNextWave', () => {
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

describe('WaveManager.popDueMonster', () => {
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
});

describe('WaveManager.update(dt)', () => {
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

describe('WaveManager.onAllSpawnedAndCleared', () => {
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
});

describe('WaveManager._getScaling', () => {
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
});

describe('WaveManager.currentMultiplier', () => {
  it('returns correct count multiplier for current wave', () => {
    const wave = new WaveManager();
    wave.currentWave = 0;

    expect(wave.currentMultiplier).toBe(1);
  });
});

describe('WaveManager.monstersRemainingThisWave', () => {
  it('returns queue.length - spawnIndex', () => {
    const wave = new WaveManager();
    wave.buildCustomFromCounts({ 1: 3, 2: 1 });
    wave.startNextWave();
    wave.elapsed = 100;

    wave.popDueMonster();

    expect(wave.monstersRemainingThisWave).toBe(3);
  });
});
