// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CONFIG } from '../src/config.js';

vi.mock('../src/rendering/renderer.js', () => ({
  RENDERER: {
    hoverPx: null,
    hoverPy: null,
    width: 800,
    height: 600,
  },
}));

vi.mock('../src/ui/index.js', () => ({
  UI: {
    shopScrollY: 0,
    handleToggleClick: vi.fn(() => false),
    hitShop: vi.fn(() => -1),
  },
  UI_LAYOUT: {
    collapsed: { shop: false, shieldShop: false, hud: false },
    shopWidth: 250,
    hudHeight: 56,
    shieldShopWidth: 220,
    SHOP_WIDTH: 250,
  },
}));

describe('Input', () => {
  let Input;

  beforeAll(async () => {
    const mod = await import('../src/input.js');
    Input = mod.Input;
  });

  function makeInput() {
    const canvas = {
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      getBoundingClientRect: vi.fn(() => ({ left: 0, top: 0, width: 800, height: 600 })),
    };
    const game = {
      onMouseDown: vi.fn(),
      onMouseUp: vi.fn(),
      onKeyDown: vi.fn(),
    };
    const input = new Input(canvas, game);
    return { input, canvas, game };
  }

  it('constructor stores references and registers all listeners', () => {
    const { input, canvas } = makeInput();
    expect(canvas.addEventListener).toHaveBeenCalledTimes(6);
  });

  it('mousemove updates hoverPx/hoverPy', () => {
    const { input } = makeInput();
    const event = { clientX: 100, clientY: 200 };
    input._onMouseMove(event);
    expect(input.hoverPx).toBe(100);
    expect(input.hoverPy).toBe(200);
  });

  it('mouseleave clears hover coordinates', () => {
    const { input } = makeInput();
    input.hoverPx = 100;
    input.hoverPy = 200;
    input._onMouseLeave();
    expect(input.hoverPx).toBeNull();
    expect(input.hoverPy).toBeNull();
  });

  it('mousedown recalculates rect and passes to game', () => {
    const { input, game } = makeInput();
    const event = { clientX: 50, clientY: 60, button: 0 };
    input._onMouseDown(event);
    expect(game.onMouseDown).toHaveBeenCalledWith(50, 60, 0);
  });

  it('mouseup calls game.onMouseUp', () => {
    const { input, game } = makeInput();
    const event = { clientX: 100, clientY: 200 };
    input._onMouseUp(event);
    expect(game.onMouseUp).toHaveBeenCalledWith(100, 200);
  });

  it('contextmenu prevents default', () => {
    const { input } = makeInput();
    const event = { preventDefault: vi.fn() };
    input._onContextMenu(event);
    expect(event.preventDefault).toHaveBeenCalled();
  });

  it('wheel scrolls shop when in shop area', () => {
    const { input } = makeInput();
    const event = { clientX: 50, clientY: 100, deltaY: 100, preventDefault: vi.fn() };
    input._onWheel(event);
    expect(event.preventDefault).toHaveBeenCalled();
  });

  it('wheel skips scroll when shop collapsed', async () => {
    // Temporarily set collapsed for this test
    const { UI_LAYOUT } = await import('../src/ui/index.js');
    UI_LAYOUT.collapsed.shop = true;
    const { input } = makeInput();
    const event = { clientX: 50, clientY: 100, deltaY: 100, preventDefault: vi.fn() };
    input._onWheel(event);
    expect(event.preventDefault).toHaveBeenCalled();
  });

  it('wheel consumes event in shield shop area', () => {
    const { input } = makeInput();
    const event = { clientX: 700, clientY: 100, deltaY: 100, preventDefault: vi.fn() };
    input._onWheel(event);
    expect(event.preventDefault).toHaveBeenCalled();
  });

  it('keydown forwards to game', () => {
    const { input, game } = makeInput();
    const event = { key: 'Escape', preventDefault: vi.fn() };
    input._onKeyDown(event);
    expect(game.onKeyDown).toHaveBeenCalledWith(event);
  });

  it('destroy removes all listeners', () => {
    const { input, canvas } = makeInput();
    input.destroy();
    expect(canvas.removeEventListener).toHaveBeenCalledTimes(6);
  });

  it('onMouseUp calls game.onMouseUp when function exists', () => {
    const { input, canvas, game } = makeInput();
    game.onMouseUp = vi.fn();
    const rect = { left: 0, top: 0, right: 800, bottom: 600 };
    canvas.getBoundingClientRect.mockReturnValue(rect);
    input._onMouseUp({ clientX: 100, clientY: 100 });
    expect(game.onMouseUp).toHaveBeenCalledWith(100, 100);
  });

  it('onMouseUp does not crash when game.onMouseUp is undefined', () => {
    const { input, canvas, game } = makeInput();
    delete game.onMouseUp;
    expect(() => input._onMouseUp({ clientX: 100, clientY: 100 })).not.toThrow();
  });
});
