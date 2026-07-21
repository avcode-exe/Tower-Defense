import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CONFIG, LAYOUT } from '../src/config.js';

vi.mock('../src/rendering/renderer.js', () => ({
  RENDERER: {
    init: vi.fn(),
    resize: vi.fn(),
    markCacheDirty: vi.fn(),
    _rebuildCache: vi.fn(),
    beginFrame: vi.fn(),
    applyMapTransform: vi.fn(),
    drawStaticLayers: vi.fn(),
    restoreTransform: vi.fn(),
    toWorldInto: vi.fn((px, py, out) => {
      out.x = px;
      out.y = py;
      return out;
    }),
    width: 800,
    height: 600,
    hoverPx: null,
    hoverPy: null,
    canvas: null,
    ctx: null,
    offsetX: 0,
    offsetY: 0,
    scale: 1,
  },
}));

vi.mock('../src/particles.js', () => ({ PARTICLES: { draw: vi.fn() } }));
vi.mock('../src/audio.js', () => ({ AUDIO: {} }));

// Mock UI like other test files
vi.mock('../src/ui/index.js', () => ({
  UI: {
    hitToggleButtons: vi.fn(() => false),
    hitShop: vi.fn(() => -1),
    _devConfirmYes: null,
    _devConfirmNo: null,
    _ghostPos: { x: 0, y: 0 },
    _tileScratch: { gx: 0, gy: 0 },
    shopScrollY: 0,
    handleToggleClick: vi.fn(),
    updateHover: vi.fn(),
  },
  UI_LAYOUT: {
    collapsed: { shop: false, shieldShop: false, hud: false, preview: false },
    shopWidth: 250,
    hudHeight: 56,
    previewHeight: 80,
    shieldShopWidth: 220,
    SHOP_WIDTH: 250,
  },
}));

describe('game renderer cursor', () => {
  let updateCursor, hitTestCursor, UI;

  beforeEach(async () => {
    vi.resetModules();
    const mod = await import('../src/rendering/gameRenderer.js');
    updateCursor = mod.updateCursor;
    hitTestCursor = mod.hitTestCursor;
    const uiMod = await import('../src/ui/index.js');
    UI = uiMod.UI;
  });

  it('updateCursor handles null canvas', () => {
    const game = { devConfirmPending: false, resetConfirmPending: false, sellConfirmPending: false };
    updateCursor(game);
  });

  it('hitTestCursor returns default for empty state', () => {
    const game = {
      devConfirmPending: false,
      resetConfirmPending: false,
      sellConfirmPending: false,
      selectedTroopIndex: -1,
      selectedSpec: null,
      _troopTileIndex: [],
      state: 'PRE_WAVE',
    };
    const result = hitTestCursor(game, 500, 300);
    expect(result).toBe('default');
  });

  it('hitTestCursor returns pointer for confirmation dialogs yes button', () => {
    UI._devConfirmYes = { x: 100, y: 100, w: 80, h: 36 };
    UI._devConfirmNo = { x: 200, y: 100, w: 80, h: 36 };
    const game = { devConfirmPending: true, resetConfirmPending: false, sellConfirmPending: false };
    const result = hitTestCursor(game, 120, 118);
    expect(result).toBe('pointer');
  });

  it('hitTestCursor returns pointer for confirmation dialogs no button', () => {
    UI._devConfirmYes = { x: 100, y: 100, w: 80, h: 36 };
    UI._devConfirmNo = { x: 200, y: 100, w: 80, h: 36 };
    const game = { devConfirmPending: true, resetConfirmPending: false, sellConfirmPending: false };
    const result = hitTestCursor(game, 220, 118);
    expect(result).toBe('pointer');
  });

  it('hitTestCursor returns default outside confirmation', () => {
    UI._devConfirmYes = { x: 100, y: 100, w: 80, h: 36 };
    const game = { devConfirmPending: true, resetConfirmPending: false, sellConfirmPending: false };
    const result = hitTestCursor(game, 10, 10);
    expect(result).toBe('default');
  });
});
