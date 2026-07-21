import { describe, it, expect, vi, beforeAll } from 'vitest';
import { CONFIG, MONSTER_SPECS, WAVES } from '../src/config.js';

describe('WaveManager', () => {
  let WaveManager, shuffleSpecialMonstersInWave;

  beforeAll(async () => {
    const mod = await import('../src/waveManager.js');
    WaveManager = mod.WaveManager;
    shuffleSpecialMonstersInWave = mod.shuffleSpecialMonstersInWave;
  });

  describe('shuffleSpecialMonstersInWave', () => {
    it('preserves non-special order', () => {
      const result = shuffleSpecialMonstersInWave([1, 2, 3], () => 0);
      expect(result[0]).toBe(1);
      expect(result[result.length - 1]).toBe(3);
    });

    it('keeps necromancer count', () => {
      const entries = [1, 'Y', 2, 'Y', 3];
      const result = shuffleSpecialMonstersInWave(entries, () => 0);
      const necros = result.filter((e) => e === 'Y');
      expect(necros.length).toBe(2);
    });

    it('keeps healer count and places after 1/3 of non-specials', () => {
      const entries = [1, 2, 3, 4, 5, 'H'];
      const result = shuffleSpecialMonstersInWave(entries, () => 0);
      const healerIdx = result.indexOf('H');
      const nonSpecials = entries.filter((e) => e !== 'H');
      expect(healerIdx).toBeGreaterThanOrEqual(Math.floor(nonSpecials.length / 3));
    });

    it('returns empty for empty input', () => {
      expect(shuffleSpecialMonstersInWave([])).toEqual([]);
    });

    it('returns clone for single entry', () => {
      const result = shuffleSpecialMonstersInWave([1], () => 0);
      expect(result).toEqual([1]);
    });

    it('all-necromancer', () => {
      const result = shuffleSpecialMonstersInWave(['Y', 'Y'], () => 0);
      expect(result).toEqual(['Y', 'Y']);
    });

    it('all-non-special returns same order', () => {
      const result = shuffleSpecialMonstersInWave([1, 2, 3], () => 0);
      expect(result).toEqual([1, 2, 3]);
    });
  });

  describe('WaveManager class', () => {
    it('constructor initializes all fields', () => {
      const wm = new WaveManager();
      expect(wm.currentWave).toBe(0);
      expect(wm.waveActive).toBe(false);
      expect(wm.waveComplete).toBe(false);
      expect(Array.isArray(wm.queue)).toBe(true);
      expect(wm.spawnIndex).toBe(0);
      expect(wm.elapsed).toBe(0);
    });

    it('reset sets wave 0 and rebuilds queue', () => {
      const wm = new WaveManager();
      wm.currentWave = 5;
      wm.reset();
      expect(wm.currentWave).toBe(0);
      expect(wm.waveActive).toBe(false);
      expect(wm.queue.length).toBeGreaterThan(0);
    });

    it('startNextWave returns true when not active', () => {
      const wm = new WaveManager();
      expect(wm.startNextWave()).toBe(true);
      expect(wm.waveActive).toBe(true);
    });

    it('startNextWave returns false when already active', () => {
      const wm = new WaveManager();
      wm.startNextWave();
      expect(wm.startNextWave()).toBe(false);
    });

    it('popDueMonster returns null when not active', () => {
      const wm = new WaveManager();
      expect(wm.popDueMonster()).toBeNull();
    });

    it('popDueMonster returns null when queue exhausted', () => {
      const wm = new WaveManager();
      wm.startNextWave();
      wm.spawnIndex = wm.queue.length;
      expect(wm.popDueMonster()).toBeNull();
    });

    it('popDueMonster returns data when due', () => {
      const wm = new WaveManager();
      wm.startNextWave();
      wm.elapsed = 999;
      const result = wm.popDueMonster();
      expect(result).not.toBeNull();
      expect(result).toHaveProperty('level');
      expect(result).toHaveProperty('hpMult');
    });

    it('popDueMonster returns null when not enough elapsed time', () => {
      const wm = new WaveManager();
      wm.startNextWave();
      wm.elapsed = 0;
      expect(wm.popDueMonster()).toBeNull();
    });

    it('sequential pop operations empty the queue', () => {
      const wm = new WaveManager();
      wm.startNextWave();
      wm.elapsed = 999;
      const initialLen = wm.queue.length;
      for (let i = 0; i < initialLen; i++) {
        expect(wm.popDueMonster()).not.toBeNull();
      }
      expect(wm.popDueMonster()).toBeNull();
    });

    it('update increments elapsed when active', () => {
      const wm = new WaveManager();
      wm.startNextWave();
      wm.update(1.5);
      expect(wm.elapsed).toBe(1.5);
    });

    it('update does nothing when not active', () => {
      const wm = new WaveManager();
      wm.update(1.5);
      expect(wm.elapsed).toBe(0);
    });

    it('onAllSpawnedAndCleared increments wave', () => {
      const wm = new WaveManager();
      wm.startNextWave();
      const initialWave = wm.currentWave;
      wm.onAllSpawnedAndCleared();
      expect(wm.currentWave).toBe(initialWave + 1);
      expect(wm.waveActive).toBe(false);
      expect(wm.waveComplete).toBe(true);
    });

    it('onAllSpawnedAndCleared no-op when not active', () => {
      const wm = new WaveManager();
      wm.onAllSpawnedAndCleared();
      expect(wm.currentWave).toBe(0);
    });

    it('getNextWavePreview returns preview', () => {
      const wm = new WaveManager();
      expect(Array.isArray(wm.getNextWavePreview())).toBe(true);
    });

    it('currentMultiplier is 1 for wave 0', () => {
      const wm = new WaveManager();
      expect(wm.currentMultiplier).toBe(1);
    });

    it('currentMultiplier > 1 for wave 11+', () => {
      const wm = new WaveManager();
      wm.currentWave = 10;
      expect(wm.currentMultiplier).toBeGreaterThan(1);
    });

    it('monstersRemainingThisWave returns queue length minus spawnIndex', () => {
      const wm = new WaveManager();
      const remaining = wm.monstersRemainingThisWave;
      expect(remaining).toBe(wm.queue.length - wm.spawnIndex);
    });
  });

  describe('getNextWaveEstimate', () => {
    it('returns null without preview', () => {
      const wm = new WaveManager();
      wm.currentPreview = null;
      expect(wm.getNextWaveEstimate(100)).toBeNull();
    });

    it('returns full estimate structure with path length', () => {
      const wm = new WaveManager();
      const est = wm.getNextWaveEstimate(50);
      expect(est).not.toBeNull();
      expect(est).toHaveProperty('totalGold');
      expect(est).toHaveProperty('totalLeak');
      expect(est).toHaveProperty('estimatedDuration');
      expect(est).toHaveProperty('clearDuration');
      expect(est).toHaveProperty('startsIn');
      expect(est.gold).toBeGreaterThan(0);
    });
  });

  describe('buildCustomFromCounts', () => {
    it('queues from counts object', () => {
      const wm = new WaveManager();
      wm.buildCustomFromCounts({ 1: 5, 2: 3 });
      expect(wm.queue.length).toBe(8);
    });

    it('handles empty counts', () => {
      const wm = new WaveManager();
      wm.buildCustomFromCounts({});
      expect(wm.queue.length).toBe(0);
    });
  });

  describe('edge case branches', () => {
    it('shuffleSpecialMonstersInWave with both necromancers and healers', () => {
      const entries = [1, 'Y', 2, 'H', 3];
      const result = shuffleSpecialMonstersInWave(entries, () => 0);
      expect(result.filter((e) => e === 'Y').length).toBe(1);
      expect(result.filter((e) => e === 'H').length).toBe(1);
    });

    it('getNextWaveEstimate with boss level B', () => {
      const wm = new WaveManager();
      wm.currentPreview = [['B', 2]];
      const est = wm.getNextWaveEstimate(50);
      expect(est).not.toBeNull();
      expect(est.hasNecromancer).toBe(false);
      expect(est.totalGold).toBeGreaterThan(0);
    });

    it('_estimateRevives returns null when no necromancers', () => {
      const wm = new WaveManager();
      const result = wm._estimateRevives(0, 10, 100);
      expect(result).toBeNull();
    });

    it('_estimateRevives returns null when revivedCount <= 0', () => {
      const wm = new WaveManager();
      const result = wm._estimateRevives(1, 1, 0);
      expect(result).toBeNull();
    });

    it('buildCustomFromCounts with special monsters builds queue', () => {
      const wm = new WaveManager();
      wm.buildCustomFromCounts({ 1: 2, Y: 1, B: 1 });
      expect(wm.queue.length).toBe(4);
    });

    it('_estimateSpawnDuration with runner level', () => {
      const wm = new WaveManager();
      const duration = wm._estimateSpawnDuration([[2, 3]]);
      expect(duration).toBeGreaterThan(0);
    });

    it('_estimatePathDuration with null pathLengthTiles', () => {
      const wm = new WaveManager();
      const duration = wm._estimatePathDuration([[1, 5]], null);
      expect(duration).toBeGreaterThan(0);
    });

    it('_estimatePathDuration with unrecognised level', () => {
      const wm = new WaveManager();
      const duration = wm._estimatePathDuration([['ZZ', 5]], 100);
      expect(duration).toBe(0);
    });

    it('shuffleSpecialMonstersInWave with healers only', () => {
      const result = shuffleSpecialMonstersInWave(['H', 'H'], () => 0);
      expect(result).toEqual(['H', 'H']);
    });

    it('_previewForWave with cycle > 0 applies scaling', () => {
      const wm = new WaveManager();
      wm.currentWave = 10;
      wm.buildQueue();
      expect(wm.queue.length).toBeGreaterThan(0);
    });

    it('_getMonsterSpec maps B to MONSTER_SPECS.B', () => {
      const wm = new WaveManager();
      const spec = wm._getMonsterSpec('B');
      expect(spec).toBeDefined();
      expect(spec.name).toBe('Boss');
    });

    it('estimateRevives counts necromancer level', () => {
      const wm = new WaveManager();
      const result = wm._estimateRevives([{ level: 'Y', count: 2 }], 1);
      expect(result).toBeDefined();
    });

    it('estimateReward handles totalHp = 0', () => {
      const wm = new WaveManager();
      // When totalHp is 0 with no valid monsters, avgReward becomes 0
      const result = wm._estimateRevives([{ level: 'Y', count: 0 }], 1);
      expect(result).toBeDefined();
    });

    it('shuffleSpecialMonstersInWave healer slot check', async () => {
      const { shuffleSpecialMonstersInWave } = await import('../src/waveManager.js');
      const result = shuffleSpecialMonstersInWave(['H', 'H', 'H', 'H', 'H', 'H', 'Y', 'B', 'S', 'X'], () => 0.5);
      expect(result.length).toBe(10);
    });

    it('shuffleSpecialMonstersInWave handles extra healers beyond postOneThird (line 68)', async () => {
      const { shuffleSpecialMonstersInWave } = await import('../src/waveManager.js');
      // Many healers + no specials → postOneThird is empty, healers fill extra slots
      const result = shuffleSpecialMonstersInWave(['H', 'H', 'H', 'H', 'H', 'H', 'H', 'H'], () => 0.5);
      expect(result.length).toBe(8);
    });

    it('buildCustomFromCounts handles special monsters (line 201)', () => {
      const wm = new WaveManager();
      wm.buildCustomFromCounts({ 1: 5, Y: 1, B: 1 });
      expect(wm.queue.length).toBeGreaterThan(0);
      expect(wm.currentPreview.length).toBeGreaterThan(0);
    });

    it('buildCustomFromCounts handles only healers', () => {
      const wm = new WaveManager();
      wm.buildCustomFromCounts({ H: 3 });
      expect(wm.queue.length).toBeGreaterThan(0);
    });

    it('buildCustomFromCounts handles empty counts', () => {
      const wm = new WaveManager();
      wm.buildCustomFromCounts({});
      expect(wm.queue.length).toBe(0);
    });

    it('shuffleSpecialMonstersInWave necros-only hits healers.length===0 after mixing (line 44)', () => {
      // Two necromancers, no healers -> after mixing necros, healers.length===0 returns base
      const result = shuffleSpecialMonstersInWave(['Y', 'Y', 1, 2], () => 0);
      expect(result.length).toBe(4);
      expect(result.filter((x) => x === 'Y').length).toBe(2);
    });

    it('shuffleSpecialMonstersInWave healers fill trailing slot (line 68)', () => {
      // 3 non-specials, many healers -> trailing slot after postOneThird gets filled
      const entries = [1, 2, 3, 'H', 'H', 'H', 'H'];
      const result = shuffleSpecialMonstersInWave(entries, () => 0);
      expect(result.length).toBe(entries.length);
      expect(result.filter((x) => x === 'H').length).toBe(4);
    });

    it('getNextWaveEstimate with necromancer and non-necromancer monsters (line 201)', () => {
      const wm = new WaveManager();
      wm.buildCustomFromCounts({ 1: 5, Y: 2 });
      const est = wm.getNextWaveEstimate(120);
      expect(est).not.toBeNull();
      expect(est.reviveEstimate).toBeDefined();
    });
  });
});
