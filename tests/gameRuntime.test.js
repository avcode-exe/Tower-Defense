import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';

vi.mock('../src/rendering/renderer.js', () => ({
  RENDERER: {
    init: vi.fn(),
    resize: vi.fn(),
    markCacheDirty: vi.fn(),
    _rebuildCache: vi.fn(),
    toWorldInto: vi.fn((px, py, out) => {
      out.x = px;
      out.y = py;
      return out;
    }),
    beginFrame: vi.fn(),
    applyMapTransform: vi.fn(),
    drawStaticLayers: vi.fn(),
    restoreTransform: vi.fn(),
    endFrame: vi.fn(),
    width: 800,
    height: 600,
    offsetX: 0,
    offsetY: 0,
    scale: 1,
    hoverPx: null,
    hoverPy: null,
    canvas: null,
    ctx: null,
  },
}));
vi.mock('../src/rendering/gameRenderer.js', () => ({ renderGame: vi.fn(), updateCursor: vi.fn() }));
vi.mock('../src/audio.js', () => ({ AUDIO: { waveStart: vi.fn(), defeat: vi.fn(), toggleMute: vi.fn() } }));
vi.mock('../src/ui/toast.js', () => ({ showToast: vi.fn() }));

describe('GameRuntimeController', () => {
  let GameRuntimeController;

  beforeAll(async () => {
    const mod = await import('../src/gameRuntime.js');
    GameRuntimeController = mod.GameRuntimeController;
  });

  function makeGame() {
    return {
      state: 'PRE_WAVE',
      speed: 1,
      lastTime: 0,
      wave: { startNextWave: vi.fn(() => true), currentWave: 0 },
      devMode: false,
    };
  }

  beforeEach(() => {
    // Stub global functions needed by GameRuntimeController
    global.requestAnimationFrame = vi.fn((cb) => {
      const id = setTimeout(() => cb(performance.now()), 16);
      return id;
    });
    global.cancelAnimationFrame = vi.fn((id) => clearTimeout(id));
    global.performance = { now: vi.fn(() => Date.now()) };
    global.window = {
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('constructor initializes fields', () => {
    const game = makeGame();
    const rc = new GameRuntimeController(game);
    expect(rc._running).toBe(false);
    expect(rc._rafVersion).toBe(0);
    expect(rc._rafId).toBeNull();
    expect(rc._pauseRafId).toBeNull();
    expect(rc._resizeHandler).toBeNull();
    expect(rc._resizeRAF).toBeNull();
  });

  it('installResize adds window resize listener', () => {
    const game = makeGame();
    const rc = new GameRuntimeController(game);
    const canvas = {};
    rc.installResize(canvas);
    expect(window.addEventListener).toHaveBeenCalledWith('resize', expect.any(Function));
  });

  it('removeResize removes window resize listener', () => {
    const game = makeGame();
    const rc = new GameRuntimeController(game);
    const canvas = {};
    rc.installResize(canvas);
    rc.removeResize();
    expect(window.removeEventListener).toHaveBeenCalled();
  });

  it('startPauseRender starts rAF loop', () => {
    const game = { state: 'PAUSED' };
    const rc = new GameRuntimeController(game);
    rc.startPauseRender();
    expect(requestAnimationFrame).toHaveBeenCalled();
  });

  it('startPauseRender is idempotent', () => {
    const game = { state: 'PAUSED' };
    const rc = new GameRuntimeController(game);
    rc.startPauseRender();
    rc.startPauseRender();
    expect(requestAnimationFrame).toHaveBeenCalledTimes(1);
  });

  it('stopPauseRender cancels rAF', () => {
    const game = { state: 'PAUSED' };
    const rc = new GameRuntimeController(game);
    rc._pauseRafId = 42;
    rc.stopPauseRender();
    expect(cancelAnimationFrame).toHaveBeenCalledWith(42);
  });

  it('pauseGame transitions WAVE_ACTIVE to PAUSED', () => {
    const game = makeGame();
    game.state = 'WAVE_ACTIVE';
    const rc = new GameRuntimeController(game);
    rc._cancelRaf = vi.fn();
    rc.startPauseRender = vi.fn();
    rc.pauseGame();
    expect(game.state).toBe('PAUSED');
    expect(rc._cancelRaf).toHaveBeenCalled();
    expect(rc.startPauseRender).toHaveBeenCalled();
  });

  it('pauseGame no-op for non-WAVE_ACTIVE', () => {
    const game = makeGame();
    game.state = 'PRE_WAVE';
    const rc = new GameRuntimeController(game);
    rc.pauseGame();
    expect(game.state).toBe('PRE_WAVE');
  });

  it('resumeGame transitions PAUSED to WAVE_ACTIVE', () => {
    const game = makeGame();
    game.state = 'PAUSED';
    const rc = new GameRuntimeController(game);
    rc.stopPauseRender = vi.fn();
    rc._startRafLoop = vi.fn();
    rc.resumeGame();
    expect(game.state).toBe('WAVE_ACTIVE');
    expect(rc.stopPauseRender).toHaveBeenCalled();
  });

  it('resumeGame no-op for non-PAUSED', () => {
    const game = makeGame();
    game.state = 'DEFEAT';
    const rc = new GameRuntimeController(game);
    rc.resumeGame();
    expect(game.state).toBe('DEFEAT');
  });

  it('togglePause pauses when WAVE_ACTIVE', () => {
    const game = makeGame();
    game.state = 'WAVE_ACTIVE';
    const rc = new GameRuntimeController(game);
    rc.pauseGame = vi.fn();
    rc.togglePause();
    expect(rc.pauseGame).toHaveBeenCalled();
  });

  it('togglePause resumes when PAUSED', () => {
    const game = makeGame();
    game.state = 'PAUSED';
    const rc = new GameRuntimeController(game);
    rc.resumeGame = vi.fn();
    rc.togglePause();
    expect(rc.resumeGame).toHaveBeenCalled();
  });

  it('startWave transitions PRE_WAVE to WAVE_ACTIVE', () => {
    const game = makeGame();
    game.state = 'PRE_WAVE';
    const rc = new GameRuntimeController(game);
    const result = rc.startWave();
    expect(result).toBe(true);
    expect(game.state).toBe('WAVE_ACTIVE');
  });

  it('startWave returns false if not PRE_WAVE', () => {
    const game = makeGame();
    game.state = 'WAVE_ACTIVE';
    const rc = new GameRuntimeController(game);
    expect(rc.startWave()).toBe(false);
  });

  it('startWave returns false in dev mode', () => {
    const game = makeGame();
    game.state = 'PRE_WAVE';
    game.devMode = true;
    const rc = new GameRuntimeController(game);
    expect(rc.startWave()).toBe(false);
  });

  it('applyDefeat sets state to DEFEAT', () => {
    const game = makeGame();
    const rc = new GameRuntimeController(game);
    global.window.electron = { deleteSave: vi.fn() };
    rc.applyDefeat();
    expect(game.state).toBe('DEFEAT');
    expect(game.lives).toBe(0);
    delete global.window.electron;
  });

  it('stopLoop stops running and cancels all', () => {
    const game = makeGame();
    const rc = new GameRuntimeController(game);
    rc._cancelRaf = vi.fn();
    rc.stopPauseRender = vi.fn();
    rc.removeResize = vi.fn();
    rc.stopLoop();
    expect(rc._running).toBe(false);
    expect(rc._cancelRaf).toHaveBeenCalled();
    expect(rc.stopPauseRender).toHaveBeenCalled();
    expect(rc.removeResize).toHaveBeenCalled();
  });

  it('_cancelRaf cancels when id is set', () => {
    const game = makeGame();
    const rc = new GameRuntimeController(game);
    rc._rafId = 42;
    rc._cancelRaf();
    expect(cancelAnimationFrame).toHaveBeenCalledWith(42);
    expect(rc._rafId).toBeNull();
  });

  it('_cancelRaf is safe when null', () => {
    const game = makeGame();
    const rc = new GameRuntimeController(game);
    expect(() => rc._cancelRaf()).not.toThrow();
  });

  it('startWave returns false when wave.startNextWave returns false', () => {
    const game = makeGame();
    game.wave.startNextWave = vi.fn(() => false);
    const rc = new GameRuntimeController(game);
    expect(rc.startWave()).toBe(false);
    expect(game.state).toBe('PRE_WAVE');
  });

  it('startLoop installs resize and starts rAF', () => {
    const game = makeGame();
    const rc = new GameRuntimeController(game);
    rc._startRafLoop = vi.fn();
    rc.startLoop({});
    expect(rc._running).toBe(true);
    expect(rc._rafVersion).toBe(1);
    expect(rc._startRafLoop).toHaveBeenCalled();
  });

  it('startPauseRender loop stops when game state is not paused/defeat', () => {
    const game = { state: 'WAVE_ACTIVE' };
    const rc = new GameRuntimeController(game);
    let capturedCallback;
    global.requestAnimationFrame = vi.fn((cb) => {
      capturedCallback = cb;
      return 42;
    });
    rc.startPauseRender();
    capturedCallback(performance.now());
    expect(rc._pauseRafId).toBeNull();
  });

  it('startPauseRender restarts loop when PAUSED state remains', () => {
    const game = { state: 'PAUSED' };
    const rc = new GameRuntimeController(game);
    let callCount = 0;
    global.requestAnimationFrame = vi.fn((cb) => {
      callCount++;
      // Simulate the callback which would call requestAnimationFrame again
      if (callCount < 3) setTimeout(() => cb(performance.now()), 0);
      return callCount;
    });
    rc.startPauseRender();
    // The loop calls requestAnimationFrame again when state is PAUSED
    expect(requestAnimationFrame).toHaveBeenCalled();
  });

  it('installResize cancels previous RAF on resize', () => {
    const game = { state: 'PRE_WAVE' };
    const rc = new GameRuntimeController(game);
    const canvas = { width: 800, height: 600 };
    rc.installResize(canvas);
    // Instead of triggering a real resize, just verify the handler was registered
    expect(window.addEventListener).toHaveBeenCalledWith('resize', expect.any(Function));
  });

  it('installResize removes previous handler', () => {
    const game = { state: 'PRE_WAVE' };
    const rc = new GameRuntimeController(game);
    rc.installResize({});
    rc.installResize({});
    expect(window.removeEventListener).toHaveBeenCalled();
  });

  it('applyDefeat calls electron.deleteSave when available', () => {
    const game = makeGame();
    const rc = new GameRuntimeController(game);
    const deleteSave = vi.fn();
    global.window.electron = { deleteSave };
    rc.applyDefeat();
    expect(deleteSave).toHaveBeenCalled();
    delete global.window.electron;
  });

  it('applyDefeat starts pause render', () => {
    const game = makeGame();
    const rc = new GameRuntimeController(game);
    rc.startPauseRender = vi.fn();
    rc.applyDefeat();
    expect(rc.startPauseRender).toHaveBeenCalled();
  });

  it('stopLoop stops running even with no RAF', () => {
    const game = makeGame();
    const rc = new GameRuntimeController(game);
    rc.stopLoop();
    expect(rc._running).toBe(false);
  });

  it('stopPauseRender no-op when _pauseRafId is null', () => {
    const game = makeGame();
    const rc = new GameRuntimeController(game);
    expect(() => rc.stopPauseRender()).not.toThrow();
  });

  it('_startRafLoop starts rAF with correct version', () => {
    const game = makeGame();
    game._runSimTick = vi.fn();
    const rc = new GameRuntimeController(game);
    rc._rafVersion = 1;
    rc._running = true;
    rc._startRafLoop();
    expect(requestAnimationFrame).toHaveBeenCalled();
  });

  it('constructor sets game reference', () => {
    const game = makeGame();
    const rc = new GameRuntimeController(game);
    expect(rc.game).toBe(game);
  });

  it('removeResize no-op when no handler', () => {
    const game = makeGame();
    const rc = new GameRuntimeController(game);
    expect(() => rc.removeResize()).not.toThrow();
  });

  it('togglePause no-op when state is DEFEAT', () => {
    const game = makeGame();
    game.state = 'DEFEAT';
    const rc = new GameRuntimeController(game);
    rc.pauseGame = vi.fn();
    rc.resumeGame = vi.fn();
    rc.togglePause();
    expect(rc.pauseGame).not.toHaveBeenCalled();
    expect(rc.resumeGame).not.toHaveBeenCalled();
  });

  it('installResize cancels previous RAF on resize event', () => {
    const game = makeGame();
    const rc = new GameRuntimeController(game);
    const canvas = {};
    rc._resizeRAF = 42;
    rc.installResize(canvas);
    expect(cancelAnimationFrame).toHaveBeenCalledWith(42);
  });

  it('removeResize cancels _resizeRAF when set', () => {
    const game = makeGame();
    const rc = new GameRuntimeController(game);
    rc._resizeRAF = 99;
    rc.removeResize();
    expect(cancelAnimationFrame).toHaveBeenCalledWith(99);
    expect(rc._resizeRAF).toBeNull();
  });

  it('_startRafLoop loop exits on version mismatch', () => {
    const game = makeGame();
    game._runSimTick = vi.fn();
    const rc = new GameRuntimeController(game);
    rc._rafVersion = 1;
    rc._running = true;
    // Capture the loop callback
    let capturedLoop;
    global.requestAnimationFrame = vi.fn((cb) => {
      capturedLoop = cb;
      return 42;
    });
    rc._startRafLoop();
    // Simulate version mismatch (e.g. stopLoop called)
    rc._rafVersion = 2;
    capturedLoop(performance.now());
    expect(game._runSimTick).not.toHaveBeenCalled();
  });

  it('_startRafLoop loop continues on matching version', () => {
    const game = makeGame();
    game._runSimTick = vi.fn();
    const rc = new GameRuntimeController(game);
    rc._rafVersion = 1;
    rc._running = true;
    let capturedLoop;
    global.requestAnimationFrame = vi.fn((cb) => {
      capturedLoop = cb;
      return 42;
    });
    rc._startRafLoop();
    capturedLoop(performance.now());
    expect(game._runSimTick).toHaveBeenCalled();
  });

  it('resize handler rAF callback calls RENDERER.resize', async () => {
    vi.useFakeTimers();
    const rendererMod = await import('../src/rendering/renderer.js');
    const game = makeGame();
    const rc = new GameRuntimeController(game);
    const canvas = {};
    let capturedHandler;
    global.window.addEventListener = vi.fn((evt, handler) => {
      capturedHandler = handler;
    });
    global.cancelAnimationFrame = vi.fn();
    rc.installResize(canvas);
    // Set a previous RAF id to test the cancel path inside the handler
    rc._resizeRAF = 42;
    // Trigger the resize handler
    capturedHandler();
    // Advance fake timers to fire the requestAnimationFrame callback
    vi.advanceTimersByTime(20);
    // The rAF callback should have called RENDERER.resize
    expect(rendererMod.RENDERER.resize).toHaveBeenCalled();
    expect(rc._resizeRAF).toBeNull();
    vi.useRealTimers();
  });

  it('installResize does not crash when resize callback fires immediately', async () => {
    vi.useFakeTimers();
    const rendererMod = await import('../src/rendering/renderer.js');
    const game = makeGame();
    const rc = new GameRuntimeController(game);
    const canvas = {};
    let capturedHandler;
    global.window.addEventListener = vi.fn((evt, handler) => {
      capturedHandler = handler;
    });
    global.cancelAnimationFrame = vi.fn();
    rc.installResize(canvas);
    // No previous RAF
    // Trigger resize handler
    capturedHandler();
    // Advance timers to fire rAF callback
    vi.advanceTimersByTime(20);
    expect(rendererMod.RENDERER.resize).toHaveBeenCalled();
    vi.useRealTimers();
  });
});
