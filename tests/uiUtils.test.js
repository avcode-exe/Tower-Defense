import { describe, expect, it, vi, beforeEach } from 'vitest';

const rendererState = vi.hoisted(() => ({
  width: 400,
  height: 300,
}));

vi.mock('../src/rendering/renderer.js', () => ({
  RENDERER: rendererState,
}));

import { UIRoundRect, fillStrokeRoundedRect, hitToggleButton, _wrapText, _drawShopTooltip } from '../src/ui/utils.js';

function makeCtx() {
  return {
    calls: [],
    font: '',
    textAlign: '',
    textBaseline: '',
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    beginPath: vi.fn(function () {
      this.calls.push('beginPath');
    }),
    moveTo: vi.fn(function (x, y) {
      this.calls.push(['moveTo', x, y]);
    }),
    lineTo: vi.fn(function (x, y) {
      this.calls.push(['lineTo', x, y]);
    }),
    quadraticCurveTo: vi.fn(function (cpx, cpy, x, y) {
      this.calls.push(['quadraticCurveTo', cpx, cpy, x, y]);
    }),
    closePath: vi.fn(function () {
      this.calls.push('closePath');
    }),
    fill: vi.fn(function () {
      this.calls.push('fill');
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
    measureText: vi.fn(function (text) {
      return { width: text.length * 6 };
    }),
    fillText: vi.fn(function (text, x, y) {
      this.calls.push(['fillText', text, x, y]);
    }),
  };
}

describe('UIRoundRect', () => {
  it('builds a rounded rectangle path', () => {
    const ctx = makeCtx();

    UIRoundRect(ctx, 10, 20, 100, 50, 8);

    expect(ctx.beginPath).toHaveBeenCalledOnce();
    expect(ctx.moveTo).toHaveBeenCalledWith(18, 20);
    expect(ctx.lineTo).toHaveBeenCalledWith(102, 20);
    expect(ctx.quadraticCurveTo).toHaveBeenNthCalledWith(1, 110, 20, 110, 28);
    expect(ctx.lineTo).toHaveBeenNthCalledWith(3, 18, 70);
    expect(ctx.quadraticCurveTo).toHaveBeenNthCalledWith(3, 10, 70, 10, 62);
    expect(ctx.closePath).toHaveBeenCalledOnce();
  });
});

describe('fillStrokeRoundedRect', () => {
  it('fills and strokes when both colors are provided', () => {
    const ctx = makeCtx();

    fillStrokeRoundedRect(ctx, 0, 0, 40, 20, 4, '#111', '#222', 2);

    expect(ctx.fillStyle).toBe('#111');
    expect(ctx.strokeStyle).toBe('#222');
    expect(ctx.lineWidth).toBe(2);
    expect(ctx.fill).toHaveBeenCalledOnce();
    expect(ctx.stroke).toHaveBeenCalledOnce();
  });

  it('fills without stroking when stroke color is omitted', () => {
    const ctx = makeCtx();

    fillStrokeRoundedRect(ctx, 0, 0, 40, 20, 4, '#111');

    expect(ctx.fill).toHaveBeenCalledOnce();
    expect(ctx.stroke).not.toHaveBeenCalled();
  });

  it('strokes without filling when fill color is omitted', () => {
    const ctx = makeCtx();

    fillStrokeRoundedRect(ctx, 0, 0, 40, 20, 4, null, '#222');

    expect(ctx.fill).not.toHaveBeenCalled();
    expect(ctx.stroke).toHaveBeenCalledOnce();
    expect(ctx.lineWidth).toBe(1);
  });
});

describe('hitToggleButton', () => {
  const rect = { x: 10, y: 20, w: 30, h: 15 };

  it('returns false without a rect', () => {
    expect(hitToggleButton(10, 20, null)).toBe(false);
  });

  it('returns true on inclusive bounds', () => {
    expect(hitToggleButton(10, 20, rect)).toBe(true);
    expect(hitToggleButton(40, 35, rect)).toBe(true);
  });

  it('returns false outside bounds', () => {
    expect(hitToggleButton(9, 20, rect)).toBe(false);
    expect(hitToggleButton(25, 19, rect)).toBe(false);
  });
});

describe('_wrapText', () => {
  it('wraps text using measured widths', () => {
    const ctx = makeCtx();
    ctx.measureText.mockImplementation((text) => ({ width: text.length * 7 }));

    const lines = _wrapText(ctx, 'alpha beta gamma', 42, 12, 'system-ui, sans-serif');

    expect(lines).toEqual(['alpha', 'beta', 'gamma']);
    expect(ctx.font).toBe('12px system-ui, sans-serif');
    expect(ctx.save).toHaveBeenCalledOnce();
    expect(ctx.restore).toHaveBeenCalledOnce();
  });

  it('handles single-word overflow', () => {
    const ctx = makeCtx();
    ctx.measureText.mockImplementation((text) => ({ width: text.length * 10 }));

    const lines = _wrapText(ctx, 'extraordinary', 40, 12, 'system-ui, sans-serif');

    expect(lines).toEqual(['extraordinary']);
  });

  it('returns an empty array for an empty string', () => {
    const ctx = makeCtx();

    expect(_wrapText(ctx, '', 40, 12, 'system-ui, sans-serif')).toEqual([]);
  });
});

describe('_drawShopTooltip', () => {
  beforeEach(() => {
    rendererState.width = 400;
    rendererState.height = 300;
  });

  it('does nothing when the spec has no description', () => {
    const ctx = makeCtx();

    _drawShopTooltip(ctx, { x: 10, y: 20, w: 50, h: 30 }, {});

    expect(ctx.save).not.toHaveBeenCalled();
    expect(ctx.fillText).not.toHaveBeenCalled();
  });

  it('places the tooltip to the right when it fits', () => {
    const ctx = makeCtx();

    _drawShopTooltip(ctx, { x: 10, y: 20, w: 50, h: 30 }, { desc: 'short desc' });

    expect(ctx.fillText).toHaveBeenCalledWith('short desc', 86, 36);
  });

  it('places the tooltip to the left when it would overflow on the right', () => {
    const ctx = makeCtx();

    _drawShopTooltip(ctx, { x: 320, y: 20, w: 50, h: 30 }, { desc: 'short desc' });

    expect(ctx.fillText).toHaveBeenCalledWith('short desc', 232, 36);
  });

  it('clamps the tooltip vertically', () => {
    const ctx = makeCtx();
    rendererState.height = 120;

    _drawShopTooltip(ctx, { x: 10, y: 220, w: 50, h: 30 }, { desc: 'short desc' });

    expect(ctx.fillText).toHaveBeenCalledWith('short desc', 86, 90);
  });
});
