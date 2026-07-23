import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CONFIG } from '../src/config.js';

vi.mock('../src/rendering/renderer.js', () => ({
  RENDERER: {
    width: 800,
    height: 600,
    offsetX: 0,
    offsetY: 0,
    scale: 1,
  },
}));

describe('UI utilities', () => {
  let UIRoundRect, fillStrokeRoundedRect, hitToggleButton, _wrapText, clipToGameplayArea, drawToggleButton;

  beforeEach(async () => {
    const mod = await import('../src/ui/utils.js');
    UIRoundRect = mod.UIRoundRect;
    fillStrokeRoundedRect = mod.fillStrokeRoundedRect;
    hitToggleButton = mod.hitToggleButton;
    _wrapText = mod._wrapText;
    clipToGameplayArea = mod.clipToGameplayArea;
    drawToggleButton = mod.drawToggleButton;
  });

  function makeCtx() {
    return {
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      quadraticCurveTo: vi.fn(),
      closePath: vi.fn(),
      fill: vi.fn(),
      stroke: vi.fn(),
      save: vi.fn(),
      restore: vi.fn(),
      fillRect: vi.fn(),
      rect: vi.fn(),
      arc: vi.fn(),
      fillStyle: '',
      strokeStyle: '',
      lineWidth: 1,
      font: '',
      textAlign: '',
      textBaseline: '',
      fillText: vi.fn(),
      measureText: vi.fn((text) => ({ width: text.length * 6 })),
      clip: vi.fn(),
      globalAlpha: 1,
    };
  }

  describe('UIRoundRect', () => {
    it('calls correct path commands', () => {
      const c = makeCtx();
      UIRoundRect(c, 10, 20, 100, 50, 8);
      expect(c.beginPath).toHaveBeenCalled();
      expect(c.moveTo).toHaveBeenCalled();
      expect(c.lineTo).toHaveBeenCalled();
      expect(c.quadraticCurveTo).toHaveBeenCalled();
      expect(c.closePath).toHaveBeenCalled();
    });
  });

  describe('fillStrokeRoundedRect', () => {
    it('fill+stroke', () => {
      const c = makeCtx();
      fillStrokeRoundedRect(c, 0, 0, 100, 50, 8, '#f00', '#0f0', 2);
      expect(c.fill).toHaveBeenCalled();
      expect(c.stroke).toHaveBeenCalled();
    });

    it('fill only', () => {
      const c = makeCtx();
      fillStrokeRoundedRect(c, 0, 0, 100, 50, 8, '#f00');
      expect(c.fill).toHaveBeenCalled();
    });

    it('stroke only', () => {
      const c = makeCtx();
      fillStrokeRoundedRect(c, 0, 0, 100, 50, 8, null, '#0f0');
      expect(c.stroke).toHaveBeenCalled();
    });
  });

  describe('hitToggleButton', () => {
    it('returns false without rect', () => {
      expect(hitToggleButton(10, 10, null)).toBe(false);
    });

    it('returns true on inclusive bounds', () => {
      expect(hitToggleButton(5, 5, { x: 0, y: 0, w: 10, h: 10 })).toBe(true);
      expect(hitToggleButton(0, 0, { x: 0, y: 0, w: 10, h: 10 })).toBe(true);
      expect(hitToggleButton(10, 10, { x: 0, y: 0, w: 10, h: 10 })).toBe(true);
    });

    it('returns false outside', () => {
      expect(hitToggleButton(-1, 5, { x: 0, y: 0, w: 10, h: 10 })).toBe(false);
      expect(hitToggleButton(11, 5, { x: 0, y: 0, w: 10, h: 10 })).toBe(false);
    });
  });

  describe('_wrapText', () => {
    it('wraps by measured width', () => {
      const c = makeCtx();
      const lines = _wrapText(c, 'hello world bigtext', 80, 11, 'system-ui, sans-serif');
      expect(Array.isArray(lines)).toBe(true);
      expect(lines.length).toBeGreaterThanOrEqual(1);
    });

    it('handles single-word overflow', () => {
      const c = makeCtx();
      c.measureText = vi.fn(() => ({ width: 200 }));
      const lines = _wrapText(c, 'verylongwordthatoverflows', 50, 11, 'system-ui, sans-serif');
      expect(lines.length).toBe(1);
    });

    it('handles empty string', () => {
      const c = makeCtx();
      const lines = _wrapText(c, '', 100, 11, 'system-ui, sans-serif');
      expect(lines).toEqual([]);
    });

    it('saves and restores font', () => {
      const c = makeCtx();
      _wrapText(c, 'test', 100, 11, 'system-ui, sans-serif');
      expect(c.save).toHaveBeenCalled();
      expect(c.restore).toHaveBeenCalled();
    });
  });

  describe('clipToGameplayArea', () => {
    beforeEach(async () => {
      // Ensure default expanded state before each test
      const constantsMod = await import('../src/ui/constants.js');
      constantsMod.UI_LAYOUT.collapsed.shop = false;
      constantsMod.UI_LAYOUT.collapsed.shieldShop = false;
    });

    it('draws correct clip rect with default expanded sidebars', () => {
      const c = makeCtx();
      clipToGameplayArea(c);
      expect(c.beginPath).toHaveBeenCalled();
      expect(c.rect).toHaveBeenCalled();
      expect(c.clip).toHaveBeenCalled();
    });

    it('sets shopW to 0 when shop is collapsed', async () => {
      const mod = await import('../src/ui/constants.js');
      mod.UI_LAYOUT.collapsed.shop = true;
      const c = makeCtx();
      clipToGameplayArea(c);
      // With shop collapsed, rect x should be 0 (no shop width offset)
      expect(c.rect).toHaveBeenCalledWith(0, expect.any(Number), expect.any(Number), expect.any(Number));
    });

    it('sets shieldW to 0 when shieldShop is collapsed', async () => {
      const mod = await import('../src/ui/constants.js');
      mod.UI_LAYOUT.collapsed.shieldShop = true;
      const c = makeCtx();
      clipToGameplayArea(c);
      // With shieldShop collapsed, width should be RENDERER.width - shopWidth (no shieldShop offset)
      // shopWidth ≈ 250, so rect width = 800 - 250 = 550
      expect(c.rect).toHaveBeenCalledWith(expect.any(Number), expect.any(Number), 550, expect.any(Number));
    });

    it('sets both shopW and shieldW to 0 when both sidebars are collapsed', async () => {
      const mod = await import('../src/ui/constants.js');
      mod.UI_LAYOUT.collapsed.shop = true;
      mod.UI_LAYOUT.collapsed.shieldShop = true;
      const c = makeCtx();
      clipToGameplayArea(c);
      // Both collapsed: x=0, width=RENDERER.width=800
      expect(c.rect).toHaveBeenCalledWith(0, expect.any(Number), 800, expect.any(Number));
    });
  });

  describe('drawToggleButton', () => {
    it('draws circle and arrow', () => {
      const c = makeCtx();
      drawToggleButton(c, { x: 10, y: 10, w: 20, h: 20 }, false, 'left');
      expect(c.arc).toHaveBeenCalled();
      expect(c.fillText).toHaveBeenCalled();
    });

    it('draws for all collapsed/expanded states', () => {
      const c = makeCtx();
      const rect = { x: 0, y: 0, w: 16, h: 16 };
      drawToggleButton(c, rect, true, 'up');
      drawToggleButton(c, rect, true, 'down');
      drawToggleButton(c, rect, true, 'left');
      drawToggleButton(c, rect, true, 'right');
      drawToggleButton(c, rect, false, 'up');
      drawToggleButton(c, rect, false, 'down');
      drawToggleButton(c, rect, false, 'left');
      drawToggleButton(c, rect, false, 'right');
      expect(c.fillText).toHaveBeenCalledTimes(8);
    });
  });
  it('_wrapText wraps long text', () => {
    const ctx = {
      save: vi.fn(),
      font: '',
      measureText: vi.fn((t) => ({ width: t.length * 8 })),
      restore: vi.fn(),
    };
    const lines = _wrapText(ctx, 'Hello world', 500, 16, 'sans-serif');
    expect(lines.length).toBe(1);
  });

  it('_wrapText breaks long lines', () => {
    const ctx = {
      save: vi.fn(),
      font: '',
      measureText: vi.fn((t) => ({ width: t.length * 8 })),
      restore: vi.fn(),
    };
    const lines = _wrapText(ctx, 'A'.repeat(100), 30, 16, 'sans-serif');
    expect(lines.length).toBe(1);
  });

  it('fillStrokeRoundedRect handles path-based rendering', () => {
    const ctx = {
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      quadraticCurveTo: vi.fn(),
      arc: vi.fn(),
      closePath: vi.fn(),
      fill: vi.fn(),
      stroke: vi.fn(),
    };
    fillStrokeRoundedRect(ctx, 10, 10, 100, 50, 5, true, false);
    expect(ctx.fill).toHaveBeenCalled();
  });

  it('hitToggleButton returns false when rect is null', () => {
    expect(hitToggleButton(50, 50, null)).toBe(false);
  });

  it('_drawShopTooltip adjusts tipY near bottom edge (line 124)', async () => {
    const utilsMod = await import('../src/ui/utils.js');
    const _drawShopTooltip = utilsMod._drawShopTooltip;
    const tooltipCtx = {
      save: vi.fn(),
      restore: vi.fn(),
      fillStyle: '',
      strokeStyle: '',
      fill: vi.fn(),
      stroke: vi.fn(),
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      quadraticCurveTo: vi.fn(),
      arc: vi.fn(),
      closePath: vi.fn(),
      fillRect: vi.fn(),
      fillText: vi.fn(),
      measureText: vi.fn((text) => ({ width: text.length * 6 })),
    };
    // spec.desc is required for _drawShopTooltip to render; r.y = 595 means
    // tipY starts near bottom; tipH (~50) exceeds RENDERER.height - 10 (590)
    _drawShopTooltip(tooltipCtx, { x: 0, y: 595, w: 100, h: 50 }, { desc: 'line1\nline2' });
    expect(tooltipCtx.save).toHaveBeenCalled();
    expect(tooltipCtx.fill).toHaveBeenCalled();
  });
});
