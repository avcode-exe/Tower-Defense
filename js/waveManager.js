// Wave manager: tracks current wave, the queue of monsters to spawn, and the
// elapsed time since the last spawn. Waves continue infinitely until loss.

class WaveManager {
  constructor() {
    this.reset();
  }

  reset() {
    this.currentWave = 0;       // 0-based index; 0 means wave 1 not yet started
    this.waves = WAVES;
    this.queue = [];            // [{level, spawnAt}, ...]
    this.elapsed = 0;
    this.spawnIndex = 0;
    this.waveActive = false;
    this.waveComplete = false;
    this.gameWon = false;
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
    let t = 0.2; // small delay after Start
    for (const [level, count] of spec) {
      for (let i = 0; i < count; i++) {
        const interval = (level === 2) ? CONFIG.RUNNER_SPAWN_INTERVAL : CONFIG.SPAWN_INTERVAL;
        this.queue.push({ level, spawnAt: t });
        t += interval;
      }
    }
  }

  // Build a custom queue from a counts object {1:N, 2:N, 3:N, 4:N, 5:N, B:N, S:N}.
  buildCustomFromCounts(counts) {
    this.queue = [];
    this.spawnIndex = 0;
    this.elapsed = 0;
    const order = [1, 2, 3, 4, 5, 'B', 'S'];
    let t = 0.2;
    for (const level of order) {
      const count = counts[level] || 0;
      for (let i = 0; i < count; i++) {
        const interval = (level === 2) ? CONFIG.RUNNER_SPAWN_INTERVAL : CONFIG.SPAWN_INTERVAL;
        this.queue.push({ level, spawnAt: t });
        t += interval;
      }
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
      return next.level;
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
    if (cycle <= 0) return 1;
    if (cycle <= 2) return Math.pow(1.35, cycle);
    // After cycle 2 (wave 20+), switch to linear growth to avoid runaway scaling.
    const base = Math.pow(1.35, 2);
    const linear = base + (cycle - 2) * 0.3;
    return Math.min(linear, CONFIG.MAX_WAVE_SCALE);
  }

  _previewForWave(number) {
    // Use the base wave list cyclically and scale counts and level caps for higher waves.
    const base = this.waves[number % this.waves.length];
    const cycle = Math.floor(number / this.waves.length);
    const scale = this._getScaling(cycle);
    const cap = CONFIG.MAX_SPAWNS_PER_TYPE;
    const out = base.map(([level, count]) => [
      level,
      Math.max(1, Math.min(cap, Math.round((count + cycle * 2) * scale))),
    ]);
    return out;
  }

  // Returns the current scaling multiplier for infinite waves (wave 10+).
  get currentMultiplier() {
    const cycle = Math.floor(this.currentWave / this.waves.length);
    return this._getScaling(cycle);
  }

  get monstersRemainingThisWave() {
    return this.queue.length - this.spawnIndex;
  }
}
