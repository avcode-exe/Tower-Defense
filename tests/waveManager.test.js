import { describe, expect, it } from 'vitest';
import { WaveManager } from '../src/waveManager.js';

describe('WaveManager.buildQueue', () => {
  it('matches the scaled preview when queuing spawns', () => {
    const wave = new WaveManager();
    wave.currentWave = 10;
    wave.buildQueue();

    const firstEntry = wave.currentPreview[0];
    expect(wave.queue.filter((entry) => entry.level === firstEntry[0])).toHaveLength(firstEntry[1]);
  });
});
