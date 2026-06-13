import { CONFIG, WAVES, MONSTER_DEV_ORDER, MONSTER_SPECS } from './config.js';
import { Monster } from './monster.js';

const NECROMANCER_LEVEL = 'Y';

export function shuffleNecromancersInWave(entries, random = Math.random) {
  const nonNecromancers = [];
  const necromancers = [];

  for (const level of entries) {
    if (level === NECROMANCER_LEVEL) {
      necromancers.push(level);
    } else {
      nonNecromancers.push(level);
    }
  }

  if (necromancers.length === 0 || nonNecromancers.length === 0) {
    return entries.slice();
  }

  const slots = Array.from({ length: nonNecromancers.length + 1 }, () => []);
  for (const necromancer of necromancers) {
    slots[Math.floor(random() * slots.length)].push(necromancer);
  }

  const shuffled = [];
  for (let i = 0; i < nonNecromancers.length; i += 1) {
    if (slots[i].length > 0) {
      shuffled.push(...slots[i]);
    }
    shuffled.push(nonNecromancers[i]);
  }
  if (slots[nonNecromancers.length].length > 0) {
    shuffled.push(...slots[nonNecromancers.length]);
  }

  return shuffled;
}

// Wave manager: tracks current wave, the queue of monsters to spawn, and the
// elapsed time since the last spawn. Waves continue infinitely until loss.

export class WaveManager {
  constructor() {
    this.reset();
  }

  reset() {
    this.currentWave = 0; // 0-based index; 0 means wave 1 not yet started
    this.waves = WAVES;
    this.queue = []; // [{level, spawnAt, hpMult}, ...]
    this.elapsed = 0;
    this.spawnIndex = 0;
    this.waveActive = false;
    this.waveComplete = false;
    this.buildQueue(); // pre-build queue for wave 1 (also sets currentPreview)
  }

  // Build the spawn queue for a given 1-based wave number.
  buildQueue() {
    this.currentPreview = this._previewForWave(this.currentWave);
    const spec = this.currentPreview;
    const levels = [];
    for (const [level, count] of spec) {
      for (let i = 0; i < count; i += 1) {
        levels.push(level);
      }
    }
    this._buildSpawnQueue(levels);
  }

  // Build a custom queue from a counts object {1:N, 2:N, 3:N, 4:N, 5:N, Y:N, B:N, S:N, X:N}.
  buildCustomFromCounts(counts) {
    const order = MONSTER_DEV_ORDER;
    const levels = [];
    for (const level of order) {
      const count = counts[level] || 0;
      for (let i = 0; i < count; i += 1) {
        levels.push(level);
      }
    }
    this._buildSpawnQueue(levels);
    const previewMap = {};
    for (const entry of this.queue) {
      previewMap[entry.level] = (previewMap[entry.level] || 0) + 1;
    }
    this.currentPreview = [];
    for (const [level, count] of Object.entries(previewMap)) {
      this.currentPreview.push([level, Number(count)]);
    }
  }

  _buildSpawnQueue(levels) {
    this.queue = [];
    this.spawnIndex = 0;
    this.elapsed = 0;
    const cycle = Math.floor(this.currentWave / this.waves.length);
    const hpMult = this._getScaling(cycle).hpMult;
    let t = CONFIG.WAVE_START_DELAY;
    for (const level of shuffleNecromancersInWave(levels)) {
      const interval = level === 2 ? CONFIG.RUNNER_SPAWN_INTERVAL : CONFIG.SPAWN_INTERVAL;
      this.queue.push({ level, spawnAt: t, hpMult });
      t += interval;
    }
  }

  startNextWave() {
    if (this.waveActive) return false;
    this.waveActive = true;
    this.waveComplete = false;
    return true;
  }

  // Returns the next monster to spawn, or null if nothing due yet / nothing
  // left in the queue.
  popDueMonster() {
    if (!this.waveActive) return null;
    if (this.spawnIndex >= this.queue.length) return null;
    const next = this.queue[this.spawnIndex];
    if (this.elapsed >= next.spawnAt) {
      this.spawnIndex++;
      return { level: next.level, hpMult: next.hpMult };
    }
    return null;
  }

  // Update is called from Game.update with the simulation dt.
  update(dt) {
    if (!this.waveActive) return;
    this.elapsed += dt;
  }

  // Called by Game when no monsters remain and the queue is empty.
  onAllSpawnedAndCleared() {
    if (!this.waveActive) return;
    this.waveActive = false;
    this.waveComplete = true;
    this.currentWave++;
    this.buildQueue();
  }

  // For UI: counts of each monster type in the upcoming wave.
  getNextWavePreview() {
    return this.currentPreview;
  }

  // For UI: estimates for the upcoming wave.
  getNextWaveEstimate() {
    if (!this.currentPreview) return null;

    let totalGold = 0;
    let totalLeak = 0;
    let totalHp = 0;
    let necromancerCount = 0;
    let nonNecromancerCount = 0;

    for (const [level, count] of this.currentPreview) {
      const spec = this._getMonsterSpec(level);
      if (!spec) continue;
      totalGold += spec.reward * count;
      totalLeak += spec.leak * count;
      totalHp += spec.hp * count;
      if (level === NECROMANCER_LEVEL) {
        necromancerCount += count;
      } else {
        nonNecromancerCount += count;
      }
    }

    const spawnDuration = this._estimateSpawnDuration(this.currentPreview);
    const pathDuration = this._estimatePathDuration(this.currentPreview);
    const baseDuration = spawnDuration + pathDuration;
    const reviveEstimate = this._estimateRevives(necromancerCount, nonNecromancerCount, totalHp);

    return {
      timeUntilStart: this.waveActive ? 0 : CONFIG.WAVE_START_DELAY,
      startsIn: this.waveActive ? 0 : CONFIG.WAVE_START_DELAY,
      estimatedDuration: baseDuration + (reviveEstimate ? reviveEstimate.additionalDuration : 0),
      clearDuration: baseDuration + (reviveEstimate ? reviveEstimate.additionalDuration : 0),
      totalGold,
      gold: totalGold,
      totalLeak,
      hasNecromancer: necromancerCount > 0,
      reviveEstimate: reviveEstimate
        ? {
            count: reviveEstimate.revivedCount,
            targets: reviveEstimate.revivedCount,
            gold: reviveEstimate.additionalGold,
            rewardGold: reviveEstimate.additionalGold,
            additionalDuration: reviveEstimate.additionalDuration,
          }
        : null,
    };
  }

  _getMonsterSpec(level) {
    return level === 'B' ? MONSTER_SPECS.B : MONSTER_SPECS[level];
  }

  _estimateSpawnDuration(preview) {
    let t = CONFIG.WAVE_START_DELAY;
    for (const [level, count] of preview) {
      const interval = level === 2 ? CONFIG.RUNNER_SPAWN_INTERVAL : CONFIG.SPAWN_INTERVAL;
      t += interval * count;
    }
    return t - CONFIG.WAVE_START_DELAY;
  }

  _estimatePathDuration(preview) {
    let weightedDuration = 0;
    let totalCount = 0;
    for (const [level, count] of preview) {
      const spec = this._getMonsterSpec(level);
      if (!spec) continue;
      const speed = CONFIG.MOVEMENT_SPEEDS[spec.movementSpeed] || spec.speed;
      const pathTiles = CONFIG.MIN_PATH_LENGTH;
      const duration = pathTiles / Math.max(0.1, speed);
      weightedDuration += duration * count;
      totalCount += count;
    }
    return totalCount > 0 ? weightedDuration / totalCount : 0;
  }

  _estimateRevives(necromancerCount, nonNecromancerCount, totalHp) {
    if (necromancerCount <= 0 || nonNecromancerCount <= 0) return null;

    const revivedCount = Math.min(
      necromancerCount * CONFIG.MONSTER_REVIVE_MAX_TARGETS,
      Math.floor(nonNecromancerCount * 0.25)
    );
    if (revivedCount <= 0) return null;

    const avgReward = totalHp > 0 ? totalHp / Math.max(1, nonNecromancerCount) * 0.08 : 0;
    const additionalGold = Math.round(revivedCount * avgReward);
    const additionalDuration = revivedCount * CONFIG.SPAWN_INTERVAL * 0.5;

    return {
      revivedCount,
      additionalGold,
      additionalDuration,
    };
  }

  _getScaling(cycle) {
    if (cycle <= 0) return { countMult: 1, hpMult: 1 };
    return {
      countMult: 1 + cycle * CONFIG.WAVE_SCALE_COUNT,
      hpMult: 1 + cycle * CONFIG.WAVE_SCALE_HP,
    };
  }

  _previewForWave(number) {
    // Use the base wave list cyclically and scale counts and level caps for higher waves.
    const base = this.waves[number % this.waves.length];
    const cycle = Math.floor(number / this.waves.length);
    const scale = this._getScaling(cycle);
    const cap = CONFIG.MAX_SPAWNS_PER_TYPE;
    const out = base.map(([level, count]) => [
      level,
      Math.max(1, Math.min(cap, Math.round((count + cycle * 2) * scale.countMult))),
    ]);
    return out;
  }

  // Returns the current scaling multiplier for infinite waves (wave 10+).
  get currentMultiplier() {
    const cycle = Math.floor(this.currentWave / this.waves.length);
    return this._getScaling(cycle).countMult;
  }

  get monstersRemainingThisWave() {
    return this.queue.length - this.spawnIndex;
  }
}
