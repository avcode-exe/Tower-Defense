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
