import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { RENDERER } from '../src/rendering/renderer.js';
import { TILE } from '../src/grid.js';

function makeCtx() {
  return {
    calls: [],
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    setTransform: vi.fn(function (...args) {
      this.calls.push(['setTransform', ...args]);
    }),
    fillRect: vi.fn(function (...args) {
      this.calls.push(['fillRect', ...args]);
    }),
    beginPath: vi.fn(function () {
      this.calls.push('beginPath');
    }),
    moveTo: vi.fn(function (x, y) {
      this.calls.push(['moveTo', x, y]);
    }),
    lineTo: vi.fn(function (x, y) {
      this.calls.push(['lineTo', x, y]);
    }),
    stroke: vi.fn(function () {
      this.calls.push('stroke');
    }),
    save: vi.fn(function () {
      this.calls.push('save');
    }),
    restore: vi.fn(function () {
      this.calls.push('restore');
    }),
    translate: vi.fn(function (...args) {
      this.calls.push(['translate', ...args]);
    }),
    scale: vi.fn(function (...args) {
      this.calls.push(['scale', ...args]);
    }),
    drawImage: vi.fn(function (...args) {
      this.calls.push(['drawImage', ...args]);
    }),
  };
}

function makeCanvas(ctx) {
  return {
    ctx,
    width: 0,
    height: 0,
    getBoundingClientRect: vi.fn(() => ({ width: 600, height: 500 })),
    getContext: vi.fn(() => ctx),
  };
}

function resetRenderer() {
  RENDERER.ctx = null;
  RENDERER.canvas = undefined;
  RENDERER.width = 0;
  RENDERER.height = 0;
  RENDERER.scale = 1;
  RENDERER.offsetX = 0;
  RENDERER.offsetY = 0;
  RENDERER.mapPixelSize = 0;
  RENDERER._bgCache = null;
  RENDERER._pathCache = null;
  RENDERER._cacheDirty = true;
  RENDERER._dpr = 1;
}

describe('RENDERER', () => {
  beforeEach(() => {
    resetRenderer();
    vi.stubGlobal('window', { devicePixelRatio: 2 });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('marks the static layer cache dirty', () => {
    RENDERER._cacheDirty = false;

    RENDERER.markCacheDirty();

    expect(RENDERER._cacheDirty).toBe(true);
  });

  it('converts screen coordinates into world coordinates', () => {
    RENDERER.offsetX = 100;
    RENDERER.offsetY = 50;
    RENDERER.scale = 2;
    const out = { x: 0, y: 0 };

    RENDERER.toWorldInto(250, 170, out);

    expect(out).toEqual({ x: 75, y: 60 });
  });

  it('fills the full renderer size at frame start', () => {
    const ctx = makeCtx();
    RENDERER.ctx = ctx;
    RENDERER.width = 640;
    RENDERER.height = 480;

    RENDERER.beginFrame();

    expect(ctx.fillStyle).toBe('#0e1418');
    expect(ctx.fillRect).toHaveBeenCalledWith(0, 0, 640, 480);
  });

  it('applies and restores the map transform', () => {
    const ctx = makeCtx();
    RENDERER.ctx = ctx;
    RENDERER.offsetX = 10;
    RENDERER.offsetY = 20;
    RENDERER.scale = 1.5;

    RENDERER.applyMapTransform();
    RENDERER.restoreTransform();

    expect(ctx.save).toHaveBeenCalledOnce();
    expect(ctx.translate).toHaveBeenCalledWith(10, 20);
    expect(ctx.scale).toHaveBeenCalledWith(1.5, 1.5);
    expect(ctx.restore).toHaveBeenCalledOnce();
  });

  it('initializes canvas context and offscreen caches', () => {
    const ctx = makeCtx();
    const canvas = makeCanvas(ctx);
    const bg = makeCanvas(makeCtx());
    const path = makeCanvas(makeCtx());

    let createdCount = 0;
    vi.stubGlobal('document', {
      createElement: vi.fn(() => {
        createdCount++;
        return createdCount === 1 ? bg : path;
      }),
    });

    RENDERER.init(canvas);

    expect(RENDERER.ctx).toBe(ctx);
    expect(RENDERER.canvas).toBe(canvas);
    expect(RENDERER._bgCache).toBe(bg);
    expect(RENDERER._pathCache).toBe(path);
    expect(canvas.getContext).toHaveBeenCalledWith('2d');
    expect(canvas.getBoundingClientRect).toHaveBeenCalled();
    expect(ctx.setTransform).toHaveBeenCalledWith(2, 0, 0, 2, 0, 0);
  });

  it('throws when the canvas context is unavailable', () => {
    const canvas = { getContext: vi.fn(() => null) };

    expect(() => RENDERER.init(canvas)).toThrow('Failed to get 2D canvas context');
  });

  it('resizes the canvas and computes map transform', () => {
    const ctx = makeCtx();
    const canvas = makeCanvas(ctx);
    RENDERER.ctx = ctx;
    RENDERER.canvas = canvas;

    RENDERER.resize();

    expect(canvas.width).toBe(1200);
    expect(canvas.height).toBe(1000);
    expect(RENDERER._dpr).toBe(2);
    expect(RENDERER.width).toBe(600);
    expect(RENDERER.height).toBe(500);
    expect(RENDERER.mapPixelSize).toBe(848);
    expect(RENDERER.scale).toBe(0.25);
    expect(RENDERER.offsetX).toBe(262);
    expect(RENDERER.offsetY).toBe(132);
    expect(RENDERER._cacheDirty).toBe(true);
  });

  it('does not resize without a canvas', () => {
    RENDERER.resize();

    expect(RENDERER.width).toBe(0);
    expect(RENDERER.height).toBe(0);
  });

  it('rebuilds and draws static layers when dirty', () => {
    const ctx = makeCtx();
    const bgCtx = makeCtx();
    const pathCtx = makeCtx();
    const bg = makeCanvas(bgCtx);
    const path = makeCanvas(pathCtx);
    const grid = {
      get: vi.fn((x, y) => (x === 0 && y === 0 ? TILE.PATH : TILE.EMPTY)),
    };
    RENDERER.ctx = ctx;
    RENDERER._bgCache = bg;
    RENDERER._pathCache = path;
    RENDERER._dpr = 1;
    RENDERER._cacheDirty = true;

    RENDERER.drawStaticLayers(grid);

    expect(bg.width).toBe(848);
    expect(bg.height).toBe(848);
    expect(path.width).toBe(848);
    expect(path.height).toBe(848);
    expect(bgCtx.fillRect).toHaveBeenCalledWith(0, 0, 848, 848);
    expect(pathCtx.fillRect).toHaveBeenCalledWith(0, 0, 53, 53);
    expect(bgCtx.stroke).toHaveBeenCalledOnce();
    expect(RENDERER._cacheDirty).toBe(false);
    expect(ctx.drawImage).toHaveBeenCalledWith(bg, 0, 0, 848, 848);
    expect(ctx.drawImage).toHaveBeenCalledWith(path, 0, 0, 848, 848);
  });

  it('draws cached static layers without rebuilding when clean', () => {
    const ctx = makeCtx();
    const bgCtx = makeCtx();
    const pathCtx = makeCtx();
    const bg = makeCanvas(bgCtx);
    const path = makeCanvas(pathCtx);
    RENDERER.ctx = ctx;
    RENDERER._bgCache = bg;
    RENDERER._pathCache = path;
    RENDERER._dpr = 1;
    RENDERER._cacheDirty = false;

    RENDERER.drawStaticLayers(null);

    expect(bgCtx.fillRect).not.toHaveBeenCalled();
    expect(pathCtx.fillRect).not.toHaveBeenCalled();
    expect(ctx.drawImage).toHaveBeenCalledTimes(2);
  });
});
