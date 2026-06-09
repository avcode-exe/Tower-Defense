// GameRuntimeController: owns worker lifecycle, pause render loop, resize
// subscription, and centralised state transitions.  Game delegates all
// phase-changing operations here so that duplicated transition branches
// collapse into single call sites.

class GameRuntimeController {
  constructor(game) {
    this.game = game;

    this._simWorker = null;
    this._running = false;
    this._rafVersion = 0;
    this._pauseRafId = null;
    this._resizeHandler = null;
    this._resizeRAF = null;
  }

  // ── Resize ──────────────────────────────────────────────────────────
  installResize(canvas) {
    this.removeResize();
    this._resizeHandler = () => {
      if (this._resizeRAF) cancelAnimationFrame(this._resizeRAF);
      this._resizeRAF = requestAnimationFrame(() => {
        this._resizeRAF = null;
        RENDERER.resize(canvas);
      });
    };
    window.addEventListener('resize', this._resizeHandler);
  }

  removeResize() {
    if (this._resizeHandler) {
      window.removeEventListener('resize', this._resizeHandler);
      this._resizeHandler = null;
    }
    if (this._resizeRAF) {
      cancelAnimationFrame(this._resizeRAF);
      this._resizeRAF = null;
    }
  }

  // ── Pause render loop ───────────────────────────────────────────────
  // Lightweight rAF loop that only renders — used when the sim worker is
  // stopped (PAUSED / DEFEAT) so the canvas stays interactive.
  startPauseRender() {
    if (this._pauseRafId != null) return; // already running
    const game = this.game;
    const loop = () => {
      this._pauseRafId = null;
      if (game.state !== 'PAUSED' && game.state !== 'DEFEAT') return;
      game.render();
      this._pauseRafId = requestAnimationFrame(loop);
    };
    this._pauseRafId = requestAnimationFrame(loop);
  }

  stopPauseRender() {
    if (this._pauseRafId != null) {
      cancelAnimationFrame(this._pauseRafId);
      this._pauseRafId = null;
    }
  }

  // ── Worker lifecycle ────────────────────────────────────────────────
  _spawnWorker(canvas) {
    const game = this.game;
    const rafVersion = this._rafVersion;

    try {
      this._simWorker = new Worker('js/simWorker.js');
      this._simWorker.onmessage = (e) => {
        if (e.data === 'tick') {
          if (!this._running) return;
          game._runSimTick(performance.now());
        }
      };
      this._simWorker.onerror = (e) => {
        console.error('Sim worker error, falling back to main thread:', e);
        this._simWorker = null;
        this._startFallbackLoop(rafVersion);
      };
      this._simWorker.postMessage('start');
    } catch (err) {
      console.warn('Web Worker unavailable, falling back to main-thread loop:', err);
      this._startFallbackLoop(rafVersion);
    }
  }

  _startFallbackLoop(rafVersion) {
    const game = this.game;
    this._running = true;
    game.lastTime = performance.now();
    const loop = () => {
      if (!this._running || this._rafVersion !== rafVersion) return;
      game._runSimTick(performance.now());
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  // ── Main loop start ─────────────────────────────────────────────────
  // Called by Game.start() / Game.restart() to kick off the background loop.
  startLoop(canvas) {
    this.installResize(canvas);
    this.game.lastTime = performance.now();
    this._running = true;
    this._rafVersion++;
    this._spawnWorker(canvas);
  }

  // ── State transition commands ───────────────────────────────────────
  // Each command centralises the duplicated transition logic that was
  // previously scattered across onMouseDown, onKeyDown, step, and restart.

  pauseGame() {
    const game = this.game;
    if (game.state !== 'WAVE_ACTIVE') return;
    game.state = 'PAUSED';
    if (this._simWorker) this._simWorker.postMessage('stop');
    this.startPauseRender();
  }

  resumeGame() {
    const game = this.game;
    if (game.state !== 'PAUSED') return;
    game.state = 'WAVE_ACTIVE';
    this.stopPauseRender();
    if (this._simWorker) this._simWorker.postMessage('start');
  }

  togglePause() {
    const game = this.game;
    if (game.state === 'WAVE_ACTIVE') {
      this.pauseGame();
    } else if (game.state === 'PAUSED') {
      this.resumeGame();
    }
  }

  startWave() {
    const game = this.game;
    if (game.state !== 'PRE_WAVE') return false;
    if (game.devMode) {
      if (window.showToast) window.showToast('Use the DEV window to start a custom wave', 'warning');
      return false;
    }
    if (game.wave.startNextWave()) {
      game.state = 'WAVE_ACTIVE';
      AUDIO.waveStart();
      return true;
    }
    return false;
  }

  applyDefeat() {
    const game = this.game;
    game.lives = 0;
    game.state = 'DEFEAT';
    AUDIO.defeat();
    if (this._simWorker) this._simWorker.postMessage('stop');
    this.startPauseRender();
    if (window.electron && window.electron.deleteSave) window.electron.deleteSave();
  }

  // Full loop stop: terminates worker, clears RAF, removes resize.
  stopLoop() {
    if (this._simWorker) {
      this._simWorker.terminate();
      this._simWorker = null;
    }
    this.stopPauseRender();
    this.removeResize();
    this._running = false;
  }
}
