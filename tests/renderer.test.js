import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CONFIG } from '../src/config.js';
import { TILE } from '../src/grid.js';

vi.mock('../src/ui/constants.js', () => ({
  UI_LAYOUT: {
    collapsed: { shop: false, shieldShop: false },
    shopWidth: 250,
    hudHeight: 56,
    previewHeight: 80,
    shieldShopWidth: 220,
    SHOP_WIDTH: 250,
  },
}));

describe('RENDERER', () => {
  let RENDERER;

  beforeEach(async () => {
    vi.resetModules();
    // Create a mock canvas for renderer
    global.document = {
      createElement: vi.fn(() => ({
        width: 0,
        height: 0,
        getContext: vi.fn((type) => ({
          setTransform: vi.fn(),
          fillStyle: '',
          fillRect: vi.fn(),
          strokeStyle: '',
          lineWidth: 1,
          beginPath: vi.fn(),
          moveTo: vi.fn(),
          lineTo: vi.fn(),
          stroke: vi.fn(),
          drawImage: vi.fn(),
          getContext: vi.fn().mockReturnThis(),
        })),
      })),
    };
    global.window = {
      devicePixelRatio: 1,
    };

    const mod = await import('../src/rendering/renderer.js');
    RENDERER = mod.RENDERER;

    // Reset state
    RENDERER._cacheDirty = true;
    RENDERER._bgCache = {
      width: 0,
      height: 0,
      getContext: vi.fn(() => ({
        setTransform: vi.fn(),
        fillStyle: '',
        fillRect: vi.fn(),
        strokeStyle: '',
        lineWidth: 1,
        beginPath: vi.fn(),
        moveTo: vi.fn(),
        lineTo: vi.fn(),
        stroke: vi.fn(),
      })),
    };
    RENDERER._pathCache = {
      width: 0,
      height: 0,
      getContext: vi.fn(() => ({
        setTransform: vi.fn(),
        fillStyle: '',
        fillRect: vi.fn(),
        strokeStyle: '',
        lineWidth: 1,
        beginPath: vi.fn(),
        moveTo: vi.fn(),
        lineTo: vi.fn(),
        stroke: vi.fn(),
      })),
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('markCacheDirty sets flag', () => {
    RENDERER._cacheDirty = false;
    RENDERER.markCacheDirty();
    expect(RENDERER._cacheDirty).toBe(true);
  });

  it('toWorldInto transforms correctly', () => {
    RENDERER.offsetX = 100;
    RENDERER.offsetY = 50;
    RENDERER.scale = 2;
    const out = { x: 0, y: 0 };
    RENDERER.toWorldInto(300, 150, out);
    expect(out.x).toBe(100);
    expect(out.y).toBe(50);
  });

  it('toWorldInto accounts for zoom', () => {
    RENDERER.offsetX = 100;
    RENDERER.offsetY = 50;
    RENDERER.scale = 2;
    RENDERER.width = 800;
    RENDERER.height = 600;
    RENDERER.zoom = 1.5;
    const out = { x: 0, y: 0 };
    // With the new layout-relative transform:
    //   screen = world * scale * zoom + offset
    //   world (100, 50) -> screen: (100*2*1.5+100, 50*2*1.5+50) = (400, 200)
    // Verify the inverse: screen (400, 200) -> world (100, 50).
    RENDERER.toWorldInto(400, 200, out);
    expect(out.x).toBeCloseTo(100);
    expect(out.y).toBeCloseTo(50);
  });

  it('toWorldInto handles non-finite values', () => {
    RENDERER.offsetX = 0;
    RENDERER.offsetY = 0;
    RENDERER.scale = 1;
    const out = { x: 0, y: 0 };
    RENDERER.toWorldInto(NaN, 100, out);
    expect(out.x).toBe(0);
  });

  it('beginFrame fills background and applies zoom', () => {
    const ctx = { save: vi.fn(), translate: vi.fn(), scale: vi.fn(), fillStyle: '', fillRect: vi.fn() };
    RENDERER.ctx = ctx;
    RENDERER.width = 800;
    RENDERER.height = 600;
    RENDERER.zoom = 1;
    RENDERER.beginFrame();
    expect(ctx.save).toHaveBeenCalled();
    expect(ctx.fillRect).toHaveBeenCalledWith(0, 0, 800, 600);
  });

  it('beginFrame does not apply zoom (zoom is now in map transform)', () => {
    const ctx = { save: vi.fn(), translate: vi.fn(), scale: vi.fn(), fillStyle: '', fillRect: vi.fn() };
    RENDERER.ctx = ctx;
    RENDERER.width = 800;
    RENDERER.height = 600;
    RENDERER.zoom = 1.5;
    RENDERER.beginFrame();
    // beginFrame no longer applies zoom — zoom has been moved to applyMapTransform.
    expect(ctx.save).toHaveBeenCalled();
    expect(ctx.fillRect).toHaveBeenCalledWith(0, 0, 800, 600);
    // No translate/scale calls except from save/fillRect.
    expect(ctx.translate).not.toHaveBeenCalled();
    expect(ctx.scale).not.toHaveBeenCalled();
  });

  it('applyMapTransform saves, translates, and scales with zoom', () => {
    const ctx = { save: vi.fn(), translate: vi.fn(), scale: vi.fn() };
    RENDERER.ctx = ctx;
    RENDERER.offsetX = 50;
    RENDERER.offsetY = 30;
    RENDERER.scale = 1.5;
    RENDERER.zoom = 2;
    RENDERER.applyMapTransform();
    expect(ctx.save).toHaveBeenCalled();
    expect(ctx.translate).toHaveBeenCalledWith(50, 30);
    // scale now includes zoom factor: 1.5 * 2 = 3
    expect(ctx.scale).toHaveBeenCalledWith(3, 3);
  });

  it('restoreTransform calls ctx.restore', () => {
    const ctx = { restore: vi.fn() };
    RENDERER.ctx = ctx;
    RENDERER.restoreTransform();
    expect(ctx.restore).toHaveBeenCalled();
  });

  it('endFrame calls ctx.restore', () => {
    const ctx = { restore: vi.fn() };
    RENDERER.ctx = ctx;
    RENDERER.endFrame();
    expect(ctx.restore).toHaveBeenCalled();
  });

  it('init creates context and calls resize', () => {
    const canvas = {
      getContext: vi.fn(() => ({ setTransform: vi.fn() })),
      getBoundingClientRect: vi.fn(() => ({ left: 0, top: 0, width: 800, height: 600 })),
    };
    RENDERER.init(canvas);
    expect(canvas.getContext).toHaveBeenCalledWith('2d');
    expect(RENDERER.canvas).toBe(canvas);
  });

  it('init throws on null context', () => {
    const canvas = { getContext: vi.fn(() => null) };
    expect(() => RENDERER.init(canvas)).toThrow();
  });

  it('resize no-op without canvas', () => {
    RENDERER.canvas = null;
    expect(() => RENDERER.resize()).not.toThrow();
  });

  it('drawStaticLayers calls _rebuildCache when dirty', () => {
    const ctx = { drawImage: vi.fn() };
    RENDERER.ctx = ctx;
    RENDERER._cacheDirty = true;
    RENDERER._rebuildCache = vi.fn();
    const grid = { get: vi.fn(() => TILE.EMPTY) };
    RENDERER.drawStaticLayers(grid);
    expect(RENDERER._rebuildCache).toHaveBeenCalledWith(grid);
  });

  it('resize calculates scale and offsets correctly for large canvas', () => {
    const ctx = { setTransform: vi.fn() };
    const canvas = {
      getContext: vi.fn(() => ctx),
      getBoundingClientRect: vi.fn(() => ({ left: 0, top: 0, width: 1920, height: 1080 })),
    };
    RENDERER.canvas = canvas;
    RENDERER.ctx = ctx;
    RENDERER.width = 0;
    RENDERER.height = 0;
    RENDERER.resize();
    expect(RENDERER.width).toBe(1920);
    expect(RENDERER.height).toBe(1080);
    expect(RENDERER.scale).toBeGreaterThan(0);
  });

  it('resize clamps offset when too far right', () => {
    const ctx = { setTransform: vi.fn() };
    const canvas = {
      getContext: vi.fn(() => ctx),
      getBoundingClientRect: vi.fn(() => ({ left: 0, top: 0, width: 400, height: 400 })),
    };
    RENDERER.canvas = canvas;
    RENDERER.ctx = ctx;
    RENDERER.width = 0;
    RENDERER.height = 0;
    RENDERER.resize();
    expect(RENDERER.offsetX).toBeGreaterThanOrEqual(250 + 12);
  });

  it('_rebuildCache fills bg cache with grid lines and buildable tiles', () => {
    const bgCtx = {
      setTransform: vi.fn(),
      fillStyle: '',
      fillRect: vi.fn(),
      strokeStyle: '',
      lineWidth: 1,
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      stroke: vi.fn(),
    };
    const pCtx = { setTransform: vi.fn(), fillStyle: '', fillRect: vi.fn() };
    const grid = {
      get: vi.fn((x, y) => {
        if (x === 5 && y === 5) return TILE.PATH;
        if (x === 3 && y === 3) return TILE.EMPTY;
        return TILE.BLOCKED;
      }),
    };
    RENDERER._bgCache = { width: 0, height: 0, getContext: vi.fn(() => bgCtx) };
    RENDERER._pathCache = { width: 0, height: 0, getContext: vi.fn(() => pCtx) };
    RENDERER._dpr = 1;
    RENDERER._rebuildCache(grid);
    expect(bgCtx.fillRect).toHaveBeenCalled();
    expect(bgCtx.stroke).toHaveBeenCalled();
    expect(pCtx.fillRect).toHaveBeenCalled();
    expect(RENDERER._cacheDirty).toBe(false);
  });

  it('_rebuildCache handles null grid', () => {
    const bgCtx = {
      setTransform: vi.fn(),
      fillStyle: '',
      fillRect: vi.fn(),
      strokeStyle: '',
      lineWidth: 1,
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      stroke: vi.fn(),
    };
    const pCtx = { setTransform: vi.fn(), fillStyle: '', fillRect: vi.fn() };
    RENDERER._bgCache = { width: 0, height: 0, getContext: vi.fn(() => bgCtx) };
    RENDERER._pathCache = { width: 0, height: 0, getContext: vi.fn(() => pCtx) };
    RENDERER._dpr = 1;
    expect(() => RENDERER._rebuildCache(null)).not.toThrow();
  });

  it('drawStaticLayers skips rebuild when cache is fresh', () => {
    const ctx = { drawImage: vi.fn() };
    RENDERER.ctx = ctx;
    RENDERER._cacheDirty = false;
    const rebuildSpy = vi.fn();
    RENDERER._rebuildCache = rebuildSpy;
    RENDERER.drawStaticLayers({ get: vi.fn() });
    expect(rebuildSpy).not.toHaveBeenCalled();
    expect(ctx.drawImage).toHaveBeenCalledTimes(2);
  });

  it('resize clamps offsetY when rendered bottom exceeds max', () => {
    const ctx = { setTransform: vi.fn() };
    const canvas = {
      getContext: vi.fn(() => ctx),
      getBoundingClientRect: vi.fn(() => ({ left: 0, top: 0, width: 300, height: 300 })),
    };
    RENDERER.canvas = canvas;
    RENDERER.ctx = ctx;
    RENDERER.width = 0;
    RENDERER.height = 0;
    RENDERER.resize();
    expect(RENDERER.offsetY).toBeGreaterThanOrEqual(0);
  });

  it('resize marks cache dirty', () => {
    const ctx = { setTransform: vi.fn() };
    const canvas = {
      getContext: vi.fn(() => ctx),
      getBoundingClientRect: vi.fn(() => ({ left: 0, top: 0, width: 800, height: 600 })),
    };
    RENDERER.canvas = canvas;
    RENDERER.ctx = ctx;
    RENDERER._cacheDirty = false;
    RENDERER.resize();
    expect(RENDERER._cacheDirty).toBe(true);
  });

  it('_rebuildCache is no-op when caches are null', () => {
    RENDERER._bgCache = null;
    RENDERER._pathCache = null;
    expect(() => RENDERER._rebuildCache({ get: vi.fn() })).not.toThrow();
  });
});
