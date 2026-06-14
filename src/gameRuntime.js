import { CONFIG } from './config.js';
import { RENDERER } from './rendering/renderer.js';
import { AUDIO } from './audio.js';
import { renderGame, updateCursor } from './rendering/gameRenderer.js';
import { showToast } from './ui/toast.js';

// GameRuntimeController: owns the main loop (rAF + fixed timestep),
// pause render loop, resize subscription, and centralised state transitions.

export class GameRuntimeController {
  constructor(game) {
    this.game = game;

    this._running = false;
    this._rafVersion = 0;
    this._rafId = null;
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
  // Lightweight rAF loop that only renders — used when the sim is
  // stopped (PAUSED / DEFEAT) so the canvas stays interactive.
  startPauseRender() {
    if (this._pauseRafId != null) return;
    const game = this.game;
    const loop = () => {
      this._pauseRafId = null;
      if (game.state !== 'PAUSED' && game.state !== 'DEFEAT') return;
      renderGame(game);
      updateCursor(game);
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

  // ── Main loop (rAF + fixed timestep) ────────────────────────────────
  // Called by Game.start() / Game.restart() to kick off the background loop.
  startLoop(canvas) {
    this.installResize(canvas);
    this._running = true;
    this._rafVersion++;
    this._startRafLoop();
  }

  _startRafLoop() {
    this.game.lastTime = performance.now();
    const rafVersion = this._rafVersion;
    const game = this.game;

    const loop = () => {
      if (!this._running || this._rafVersion !== rafVersion) return;
      game._runSimTick(performance.now());
      this._rafId = requestAnimationFrame(loop);
    };
    this._rafId = requestAnimationFrame(loop);
  }

  // ── State transition commands ───────────────────────────────────────

  pauseGame() {
    const game = this.game;
    if (game.state !== 'WAVE_ACTIVE') return;
    game.state = 'PAUSED';
    this._cancelRaf();
    this.startPauseRender();
  }

  resumeGame() {
    const game = this.game;
    if (game.state !== 'PAUSED') return;
    game.state = 'WAVE_ACTIVE';
    this.stopPauseRender();
    this._startRafLoop();
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
      showToast('Use the DEV window to start a custom wave', 'warning');
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
    this._cancelRaf();
    this.startPauseRender();
    if (window.electron && window.electron.deleteSave) window.electron.deleteSave();
  }

  // Full loop stop: cancels rAF, removes resize.
  stopLoop() {
    this._cancelRaf();
    this.stopPauseRender();
    this.removeResize();
    this._running = false;
  }

  _cancelRaf() {
    if (this._rafId != null) {
      cancelAnimationFrame(this._rafId);
      this._rafId = null;
    }
  }
}
