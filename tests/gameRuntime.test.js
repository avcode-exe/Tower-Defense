import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { GameRuntimeController } from '../src/gameRuntime.js';
import { RENDERER } from '../src/rendering/renderer.js';
import { AUDIO } from '../src/audio.js';
import { renderGame, updateCursor } from '../src/rendering/gameRenderer.js';
import { showToast } from '../src/ui/toast.js';

// ─── Mocks ──────────────────────────────────────────────────────────────────

let rafId = 0;
const rafCallbacks = new Map();

vi.mock('../src/rendering/renderer.js', () => ({
  RENDERER: { resize: vi.fn() },
}));

vi.mock('../src/rendering/gameRenderer.js', () => ({
  renderGame: vi.fn(),
  updateCursor: vi.fn(),
}));

vi.mock('../src/audio.js', () => ({
  AUDIO: {
    waveStart: vi.fn(),
    defeat: vi.fn(),
  },
}));

vi.mock('../src/ui/toast.js', () => ({
  showToast: vi.fn(),
}));

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeCanvas() {
  return { tagName: 'canvas', width: 800, height: 600 };
}

function makeGame(overrides = {}) {
  return {
    state: 'PRE_WAVE',
    devMode: false,
    lives: 25,
    lastTime: 0,
    _runSimTick: vi.fn(),
    wave: {
      startNextWave: vi.fn(() => true),
    },
    ...overrides,
  };
}

function flushRaf() {
  const callbacks = [...rafCallbacks.values()];
  rafCallbacks.clear();
  for (const cb of callbacks) cb();
}

beforeEach(() => {
  // Reset rAF state
  rafCallbacks.clear();
  rafId = 0;
  vi.stubGlobal('requestAnimationFrame', (cb) => {
    rafId++;
    rafCallbacks.set(rafId, cb);
    return rafId;
  });
  vi.stubGlobal('cancelAnimationFrame', (id) => {
    rafCallbacks.delete(id);
  });
  vi.stubGlobal('performance', { now: () => Date.now() });

  // Minimal window polyfill for Node test environment
  globalThis.window = {
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  };
});

afterEach(() => {
  rafCallbacks.clear();
  rafId = 0;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

// ─── Constructor ────────────────────────────────────────────────────────────

describe('Constructor', () => {
  it('initializes with game reference and default state', () => {
    const game = makeGame();
    const ctrl = new GameRuntimeController(game);
    expect(ctrl.game).toBe(game);
    expect(ctrl._running).toBe(false);
    expect(ctrl._rafVersion).toBe(0);
    expect(ctrl._rafId).toBeNull();
    expect(ctrl._pauseRafId).toBeNull();
    expect(ctrl._resizeHandler).toBeNull();
    expect(ctrl._resizeRAF).toBeNull();
  });
});

// ─── installResize / removeResize ───────────────────────────────────────────

describe('installResize / removeResize', () => {
  it('installResize adds window resize listener', () => {
    const ctrl = new GameRuntimeController(makeGame());
    const canvas = makeCanvas();
    ctrl.installResize(canvas);
    expect(window.addEventListener).toHaveBeenCalledWith('resize', expect.any(Function));
    expect(ctrl._resizeHandler).toBeTypeOf('function');
  });

  it('installResize removes previous handler before installing new one', () => {
    const ctrl = new GameRuntimeController(makeGame());
    const canvas = makeCanvas();
    ctrl.installResize(canvas);
    const firstHandler = ctrl._resizeHandler;
    ctrl.installResize(canvas);
    expect(ctrl._resizeHandler).not.toBe(firstHandler);
    ctrl.removeResize();
  });

  it('removeResize removes window resize listener', () => {
    const ctrl = new GameRuntimeController(makeGame());
    const canvas = makeCanvas();
    ctrl.installResize(canvas);
    ctrl.removeResize();
    expect(window.removeEventListener).toHaveBeenCalledWith('resize', expect.any(Function));
    expect(ctrl._resizeHandler).toBeNull();
    expect(ctrl._resizeRAF).toBeNull();
  });

  it('removeResize is safe to call without install', () => {
    const ctrl = new GameRuntimeController(makeGame());
    expect(() => ctrl.removeResize()).not.toThrow();
  });

  it('resize handler debounces via requestAnimationFrame', () => {
    const ctrl = new GameRuntimeController(makeGame());
    const canvas = makeCanvas();
    ctrl.installResize(canvas);
    ctrl._resizeHandler();
    expect(ctrl._resizeRAF).not.toBeNull();
    flushRaf();
    expect(ctrl._resizeRAF).toBeNull();
    expect(RENDERER.resize).toHaveBeenCalledWith(canvas);
    ctrl.removeResize();
  });

  it('resize handler cancels previous pending rAF', () => {
    const ctrl = new GameRuntimeController(makeGame());
    const canvas = makeCanvas();
    ctrl.installResize(canvas);
    ctrl._resizeHandler();
    const firstRaf = ctrl._resizeRAF;
    ctrl._resizeHandler();
    expect(ctrl._resizeRAF).not.toBe(firstRaf);
    ctrl.removeResize();
  });
});

// ─── startPauseRender / stopPauseRender ─────────────────────────────────────

describe('startPauseRender / stopPauseRender', () => {
  it('startPauseRender starts a rAF loop', () => {
    const game = makeGame({ state: 'PAUSED' });
    const ctrl = new GameRuntimeController(game);
    ctrl.startPauseRender();
    expect(ctrl._pauseRafId).not.toBeNull();
  });

  it('startPauseRender is idempotent (no double start)', () => {
    const game = makeGame({ state: 'PAUSED' });
    const ctrl = new GameRuntimeController(game);
    ctrl.startPauseRender();
    const firstId = ctrl._pauseRafId;
    ctrl.startPauseRender();
    expect(ctrl._pauseRafId).toBe(firstId);
  });

  it('pause render loop calls renderGame and updateCursor when PAUSED', () => {
    const game = makeGame({ state: 'PAUSED' });
    const ctrl = new GameRuntimeController(game);
    ctrl.startPauseRender();
    flushRaf();
    expect(renderGame).toHaveBeenCalledWith(game);
    expect(updateCursor).toHaveBeenCalledWith(game);
  });

  it('pause render loop calls renderGame when DEFEAT', () => {
    const game = makeGame({ state: 'DEFEAT' });
    const ctrl = new GameRuntimeController(game);
    ctrl.startPauseRender();
    flushRaf();
    expect(renderGame).toHaveBeenCalledWith(game);
  });

  it('pause render loop stops when state is no longer PAUSED/DEFEAT', () => {
    const game = makeGame({ state: 'PAUSED' });
    const ctrl = new GameRuntimeController(game);
    ctrl.startPauseRender();
    flushRaf(); // first frame renders
    game.state = 'WAVE_ACTIVE';
    flushRaf(); // second frame sees non-PAUSED/DEFEAT, returns without scheduling
    expect(ctrl._pauseRafId).toBeNull();
  });

  it('stopPauseRender cancels the pause loop', () => {
    const game = makeGame({ state: 'PAUSED' });
    const ctrl = new GameRuntimeController(game);
    ctrl.startPauseRender();
    ctrl.stopPauseRender();
    expect(ctrl._pauseRafId).toBeNull();
  });

  it('stopPauseRender is safe when not running', () => {
    const ctrl = new GameRuntimeController(makeGame());
    expect(() => ctrl.stopPauseRender()).not.toThrow();
  });
});

// ─── startLoop / _startRafLoop ──────────────────────────────────────────────

describe('startLoop / _startRafLoop', () => {
  it('startLoop sets _running and installs resize', () => {
    const game = makeGame();
    const ctrl = new GameRuntimeController(game);
    const canvas = makeCanvas();
    ctrl.startLoop(canvas);
    expect(ctrl._running).toBe(true);
    expect(ctrl._resizeHandler).not.toBeNull();
    ctrl.stopLoop();
  });

  it('startLoop increments _rafVersion', () => {
    const game = makeGame();
    const ctrl = new GameRuntimeController(game);
    const canvas = makeCanvas();
    ctrl.startLoop(canvas);
    expect(ctrl._rafVersion).toBe(1);
    ctrl.stopLoop();
    ctrl.startLoop(canvas);
    expect(ctrl._rafVersion).toBe(2);
    ctrl.stopLoop();
  });

  it('main loop calls game._runSimTick', () => {
    const game = makeGame();
    const ctrl = new GameRuntimeController(game);
    const canvas = makeCanvas();
    ctrl.startLoop(canvas);
    flushRaf();
    expect(game._runSimTick).toHaveBeenCalled();
    ctrl.stopLoop();
  });

  it('main loop stops when _running is false', () => {
    const game = makeGame();
    const ctrl = new GameRuntimeController(game);
    const canvas = makeCanvas();
    ctrl.startLoop(canvas);
    ctrl._running = false;
    flushRaf();
    expect(game._runSimTick).not.toHaveBeenCalled();
    ctrl.stopLoop();
  });

  it('main loop stops when _rafVersion changes (stale version)', () => {
    const game = makeGame();
    const ctrl = new GameRuntimeController(game);
    const canvas = makeCanvas();
    ctrl.startLoop(canvas);
    ctrl._rafVersion = 999; // simulate stale
    flushRaf();
    expect(game._runSimTick).not.toHaveBeenCalled();
    ctrl.stopLoop();
  });

  it('startLoop sets game.lastTime', () => {
    const game = makeGame({ lastTime: 0 });
    const ctrl = new GameRuntimeController(game);
    const canvas = makeCanvas();
    ctrl.startLoop(canvas);
    expect(game.lastTime).toBeGreaterThan(0);
    ctrl.stopLoop();
  });
});

// ─── pauseGame / resumeGame / togglePause ────────────────────────────────────

describe('pauseGame', () => {
  it('pauses from WAVE_ACTIVE', () => {
    const game = makeGame({ state: 'WAVE_ACTIVE' });
    const ctrl = new GameRuntimeController(game);
    ctrl.pauseGame();
    expect(game.state).toBe('PAUSED');
  });

  it('does nothing if not WAVE_ACTIVE', () => {
    const game = makeGame({ state: 'PRE_WAVE' });
    const ctrl = new GameRuntimeController(game);
    ctrl.pauseGame();
    expect(game.state).toBe('PRE_WAVE');
  });

  it('cancels main rAF and starts pause render', () => {
    const game = makeGame({ state: 'WAVE_ACTIVE' });
    const ctrl = new GameRuntimeController(game);
    ctrl.pauseGame();
    expect(ctrl._rafId).toBeNull();
    expect(ctrl._pauseRafId).not.toBeNull();
  });
});

describe('resumeGame', () => {
  it('resumes from PAUSED to WAVE_ACTIVE', () => {
    const game = makeGame({ state: 'PAUSED' });
    const ctrl = new GameRuntimeController(game);
    ctrl.resumeGame();
    expect(game.state).toBe('WAVE_ACTIVE');
  });

  it('does nothing if not PAUSED', () => {
    const game = makeGame({ state: 'PRE_WAVE' });
    const ctrl = new GameRuntimeController(game);
    ctrl.resumeGame();
    expect(game.state).toBe('PRE_WAVE');
  });

  it('stops pause render and starts rAF loop', () => {
    const game = makeGame({ state: 'PAUSED' });
    const ctrl = new GameRuntimeController(game);
    ctrl.resumeGame();
    expect(ctrl._pauseRafId).toBeNull();
    expect(ctrl._rafId).not.toBeNull();
    ctrl.stopLoop();
  });
});

describe('togglePause', () => {
  it('pauses when WAVE_ACTIVE', () => {
    const game = makeGame({ state: 'WAVE_ACTIVE' });
    const ctrl = new GameRuntimeController(game);
    ctrl.togglePause();
    expect(game.state).toBe('PAUSED');
  });

  it('resumes when PAUSED', () => {
    const game = makeGame({ state: 'PAUSED' });
    const ctrl = new GameRuntimeController(game);
    ctrl.togglePause();
    expect(game.state).toBe('WAVE_ACTIVE');
    ctrl.stopLoop();
  });

  it('does nothing for other states', () => {
    const game = makeGame({ state: 'PRE_WAVE' });
    const ctrl = new GameRuntimeController(game);
    ctrl.togglePause();
    expect(game.state).toBe('PRE_WAVE');
  });
});

// ─── startWave ──────────────────────────────────────────────────────────────

describe('startWave', () => {
  it('starts wave from PRE_WAVE and returns true', () => {
    const game = makeGame({ state: 'PRE_WAVE' });
    const ctrl = new GameRuntimeController(game);
    const result = ctrl.startWave();
    expect(result).toBe(true);
    expect(game.state).toBe('WAVE_ACTIVE');
    expect(game.wave.startNextWave).toHaveBeenCalled();
    expect(AUDIO.waveStart).toHaveBeenCalled();
  });

  it('returns false if not PRE_WAVE', () => {
    const game = makeGame({ state: 'WAVE_ACTIVE' });
    const ctrl = new GameRuntimeController(game);
    const result = ctrl.startWave();
    expect(result).toBe(false);
  });

  it('returns false in dev mode with toast', () => {
    const game = makeGame({ state: 'PRE_WAVE', devMode: true });
    const ctrl = new GameRuntimeController(game);
    const result = ctrl.startWave();
    expect(result).toBe(false);
    expect(showToast).toHaveBeenCalledWith('Use the DEV window to start a custom wave', 'warning');
  });

  it('returns false if wave.startNextWave returns false', () => {
    const game = makeGame({ state: 'PRE_WAVE' });
    game.wave.startNextWave = vi.fn(() => false);
    const ctrl = new GameRuntimeController(game);
    const result = ctrl.startWave();
    expect(result).toBe(false);
    expect(game.state).toBe('PRE_WAVE');
  });
});

// ─── applyDefeat ────────────────────────────────────────────────────────────

describe('applyDefeat', () => {
  it('sets lives=0 and state=DEFEAT', () => {
    const game = makeGame({ lives: 25 });
    const ctrl = new GameRuntimeController(game);
    ctrl.applyDefeat();
    expect(game.lives).toBe(0);
    expect(game.state).toBe('DEFEAT');
  });

  it('plays defeat sound', () => {
    const ctrl = new GameRuntimeController(makeGame());
    ctrl.applyDefeat();
    expect(AUDIO.defeat).toHaveBeenCalled();
  });

  it('cancels main rAF and starts pause render', () => {
    const ctrl = new GameRuntimeController(makeGame());
    ctrl.applyDefeat();
    expect(ctrl._rafId).toBeNull();
    expect(ctrl._pauseRafId).not.toBeNull();
  });

  it('calls electron.deleteSave when available', () => {
    globalThis.window.electron = { deleteSave: vi.fn() };
    const ctrl = new GameRuntimeController(makeGame());
    ctrl.applyDefeat();
    expect(window.electron.deleteSave).toHaveBeenCalled();
  });

  it('does not crash when electron is not available', () => {
    const ctrl = new GameRuntimeController(makeGame());
    expect(() => ctrl.applyDefeat()).not.toThrow();
  });
});

// ─── stopLoop ───────────────────────────────────────────────────────────────

describe('stopLoop', () => {
  it('stops running, cancels rAF, removes resize', () => {
    const game = makeGame();
    const ctrl = new GameRuntimeController(game);
    const canvas = makeCanvas();
    ctrl.startLoop(canvas);
    ctrl.stopLoop();
    expect(ctrl._running).toBe(false);
    expect(ctrl._rafId).toBeNull();
    expect(ctrl._resizeHandler).toBeNull();
  });

  it('also stops pause render', () => {
    const game = makeGame({ state: 'PAUSED' });
    const ctrl = new GameRuntimeController(game);
    ctrl.startPauseRender();
    ctrl.stopLoop();
    expect(ctrl._pauseRafId).toBeNull();
  });
});

// ─── _cancelRaf ─────────────────────────────────────────────────────────────

describe('_cancelRaf', () => {
  it('cancels active rAF', () => {
    const ctrl = new GameRuntimeController(makeGame());
    ctrl._rafId = 42;
    ctrl._cancelRaf();
    expect(ctrl._rafId).toBeNull();
  });

  it('is safe when no active rAF', () => {
    const ctrl = new GameRuntimeController(makeGame());
    expect(() => ctrl._cancelRaf()).not.toThrow();
  });
});
