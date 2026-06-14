import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WaveManager, shuffleNecromancersInWave } from '../src/waveManager.js';
import { CONFIG, WAVES, MONSTER_SPECS } from '../src/config.js';

// ─── onAllSpawnedAndCleared ─────────────────────────────────────────────────

describe('onAllSpawnedAndCleared', () => {
  it('increments currentWave and rebuilds queue', () => {
    const wave = new WaveManager();
    wave.waveActive = true;
    wave.spawnIndex = wave.queue.length;
    wave.onAllSpawnedAndCleared();
    expect(wave.currentWave).toBe(1);
    expect(wave.waveActive).toBe(false);
    expect(wave.waveComplete).toBe(true);
  });

  it('does nothing when wave is not active', () => {
    const wave = new WaveManager();
    wave.waveActive = false;
    wave.onAllSpawnedAndCleared();
    expect(wave.currentWave).toBe(0);
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

// ─── buildCustomFromCounts ──────────────────────────────────────────────────

describe('buildCustomFromCounts', () => {
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
    wave.buildCustomFromCounts({ 1: 2, 'B': 1 });
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

// ─── buildQueue ─────────────────────────────────────────────────────────────

describe('buildQueue', () => {
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

// ─── getNextWavePreview ─────────────────────────────────────────────────────

describe('getNextWavePreview', () => {
  it('returns currentPreview', () => {
    const wave = new WaveManager();
    const preview = wave.getNextWavePreview();
    expect(preview).toBe(wave.currentPreview);
  });

  it('returns array of [level, count] tuples', () => {
    const wave = new WaveManager();
    const preview = wave.getNextWavePreview();
    expect(Array.isArray(preview)).toBe(true);
    for (const [level, count] of preview) {
      expect(level).toBeDefined();
      expect(count).toBeGreaterThan(0);
    }
  });
});

// ─── startNextWave / popDueMonster ──────────────────────────────────────────

describe('startNextWave', () => {
  it('sets waveActive to true', () => {
    const wave = new WaveManager();
    wave.startNextWave();
    expect(wave.waveActive).toBe(true);
  });

  it('returns true when wave starts', () => {
    const wave = new WaveManager();
    expect(wave.startNextWave()).toBe(true);
  });

  it('returns false when already active', () => {
    const wave = new WaveManager();
    wave.startNextWave();
    expect(wave.startNextWave()).toBe(false);
  });
});

describe('popDueMonster', () => {
  it('returns null when wave is not active', () => {
    const wave = new WaveManager();
    expect(wave.popDueMonster()).toBeNull();
  });

  it('returns null when no monsters left', () => {
    const wave = new WaveManager();
    wave.startNextWave();
    wave.spawnIndex = wave.queue.length;
    expect(wave.popDueMonster()).toBeNull();
  });

  it('returns monster when spawn time has elapsed', () => {
    const wave = new WaveManager();
    wave.startNextWave();
    wave.elapsed = CONFIG.WAVE_START_DELAY + 10;
    const monster = wave.popDueMonster();
    expect(monster).not.toBeNull();
    expect(monster.level).toBeDefined();
    expect(wave.spawnIndex).toBe(1);
  });

  it('returns null when spawn time has not elapsed', () => {
    const wave = new WaveManager();
    wave.startNextWave();
    wave.elapsed = 0;
    expect(wave.popDueMonster()).toBeNull();
  });
});

// ─── update ─────────────────────────────────────────────────────────────────

describe('update', () => {
  it('increments elapsed time when wave is active', () => {
    const wave = new WaveManager();
    wave.startNextWave();
    wave.update(0.5);
    expect(wave.elapsed).toBeCloseTo(0.5);
  });

  it('does nothing when wave is not active', () => {
    const wave = new WaveManager();
    wave.update(0.5);
    expect(wave.elapsed).toBe(0);
  });
});

// ─── getScaling ─────────────────────────────────────────────────────────────

describe('getScaling', () => {
  it('returns 1x for cycle 0', () => {
    const wave = new WaveManager();
    const scale = wave._getScaling(0);
    expect(scale.countMult).toBe(1);
    expect(scale.hpMult).toBe(1);
  });

  it('scales count and hp for cycle 1', () => {
    const wave = new WaveManager();
    const scale = wave._getScaling(1);
    expect(scale.countMult).toBeGreaterThan(1);
    expect(scale.hpMult).toBeGreaterThan(1);
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
  it('returns 1 for wave 1', () => {
    const wave = new WaveManager();
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
  it('returns queue length minus spawnIndex', () => {
    const wave = new WaveManager();
    wave.startNextWave();
    expect(wave.monstersRemainingThisWave).toBe(wave.queue.length);
  });

  it('decreases as monsters are popped', () => {
    const wave = new WaveManager();
    wave.startNextWave();
    wave.elapsed = CONFIG.WAVE_START_DELAY + 10;
    wave.popDueMonster();
    expect(wave.monstersRemainingThisWave).toBe(wave.queue.length - 1);
  });
});

// ─── shuffleNecromancersInWave ──────────────────────────────────────────────

describe('shuffleNecromancersInWave (extended)', () => {
  it('preserves total count of all entries', () => {
    const input = [1, 2, 'Y', 3, 'Y', 4, 'Y'];
    const result = shuffleNecromancersInWave(input, () => 0.5);
    expect(result.length).toBe(input.length);
  });

  it('does not change non-Necromancer order', () => {
    const input = [1, 2, 3, 4, 'Y'];
    const result = shuffleNecromancersInWave(input, () => 0.5);
    const nonNecros = result.filter((x) => x !== 'Y');
    expect(nonNecros).toEqual([1, 2, 3, 4]);
  });

  it('handles all-Necromancer input (no change)', () => {
    const input = ['Y', 'Y', 'Y'];
    const result = shuffleNecromancersInWave(input, () => 0.5);
    expect(result).toEqual(['Y', 'Y', 'Y']);
  });

  it('handles all-non-Necromancer input (no change)', () => {
    const input = [1, 2, 3];
    const result = shuffleNecromancersInWave(input, () => 0.5);
    expect(result).toEqual([1, 2, 3]);
  });

  it('handles empty input', () => {
    const result = shuffleNecromancersInWave([], () => 0.5);
    expect(result).toEqual([]);
  });

  it('handles single Necromancer', () => {
    const result = shuffleNecromancersInWave(['Y'], () => 0.5);
    expect(result).toEqual(['Y']);
  });

  it('deterministic with same random function', () => {
    const input = [1, 2, 'Y', 3, 'Y'];
    const rng = () => 0.3;
    const r1 = shuffleNecromancersInWave(input, rng);
    const r2 = shuffleNecromancersInWave(input, rng);
    expect(r1).toEqual(r2);
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
    const validKeys = new Set(['1', '2', '3', '4', '5', 'Y', 'B', 'S', 'X']);
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
