// Wave manager: tracks current wave, the queue of monsters to spawn, and the
// elapsed time since the last spawn. Waves continue infinitely until loss.

class WaveManager {
  constructor() {
    this.reset();
  }

  reset() {
    this.currentWave = 0;       // 0-based index; 0 means wave 1 not yet started
    this.waves = WAVES;
    this.queue = [];            // [{level, spawnAt, hpMult}, ...]
    this.elapsed = 0;
    this.spawnIndex = 0;
    this.waveActive = false;
    this.waveComplete = false;
    this.currentPreview = this._previewForWave(this.currentWave);
    this.buildQueue();           // pre-build queue for wave 1
  }

  // Build the spawn queue for a given 1-based wave number.
  buildQueue() {
    this.queue = [];
    this.spawnIndex = 0;
    this.elapsed = 0;
    this.currentPreview = this._previewForWave(this.currentWave);
    const spec = this.currentPreview;
    const cycle = Math.floor(this.currentWave / this.waves.length);
    const scaling = this._getScaling(cycle);
    const hpMult = scaling.hpMult;
    let t = CONFIG.WAVE_START_DELAY;
    for (const [level, count] of spec) {
      for (let i = 0; i < count; i++) {
        const interval = (level === 2) ? CONFIG.RUNNER_SPAWN_INTERVAL : CONFIG.SPAWN_INTERVAL;
        this.queue.push({ level, spawnAt: t, hpMult });
        t += interval;
      }
    }
  }

  // Build a custom queue from a counts object {1:N, 2:N, 3:N, 4:N, 5:N, B:N, S:N}.
  buildCustomFromCounts(counts) {
    this.queue = [];
    this.spawnIndex = 0;
    this.elapsed = 0;
    const cycle = Math.floor(this.currentWave / this.waves.length);
    const scaling = this._getScaling(cycle);
    const hpMult = scaling.hpMult;
    const order = [1, 2, 3, 4, 5, 'B', 'S'];
    let t = CONFIG.WAVE_START_DELAY;
    for (const level of order) {
      const count = counts[level] || 0;
      for (let i = 0; i < count; i++) {
        const interval = (level === 2) ? CONFIG.RUNNER_SPAWN_INTERVAL : CONFIG.SPAWN_INTERVAL;
        this.queue.push({ level, spawnAt: t, hpMult });
        t += interval;
      }
    }
    // Update preview so UI shows accurate wave composition after custom build.
    this.currentPreview = this._previewForWave(this.currentWave);
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

  _getScaling(cycle) {
    if (cycle <= 0) return { countMult: 1, hpMult: 1 };
    return {
      countMult: 1 + cycle * CONFIG.WAVE_SCALE_COUNT,
      hpMult: 1 + cycle * CONFIG.WAVE_SCALE_HP
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
