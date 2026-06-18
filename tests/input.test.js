import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';

const rendererState = vi.hoisted(() => ({
  width: 800,
  height: 600,
  hoverPx: null,
  hoverPy: null,
}));

const uiState = vi.hoisted(() => ({
  shopScrollY: 0,
}));

const uiLayout = vi.hoisted(() => ({
  collapsed: {
    shieldShop: false,
    shop: false,
  },
  shieldShopWidth: 220,
  shopWidth: 250,
  hudHeight: 56,
}));

vi.mock('../src/rendering/renderer.js', () => ({
  RENDERER: rendererState,
}));

vi.mock('../src/ui/index.js', () => ({
  UI_LAYOUT: uiLayout,
  UI: uiState,
}));

import { Input } from '../src/input.js';

function makeCanvas() {
  const listeners = {};
  return {
    listeners,
    getBoundingClientRect: vi.fn(() => ({ left: 10, top: 20 })),
    addEventListener: vi.fn((name, handler) => {
      listeners[name] = handler;
    }),
    removeEventListener: vi.fn(),
  };
}

function makeWindow() {
  return {
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  };
}

function makeGame() {
  return {
    onMouseDown: vi.fn(),
    onKeyDown: vi.fn(),
  };
}

describe('Input', () => {
  let canvas;
  let fakeWindow;
  let game;

  beforeEach(() => {
    rendererState.width = 800;
    rendererState.height = 600;
    rendererState.hoverPx = null;
    rendererState.hoverPy = null;
    uiState.shopScrollY = 0;
    uiLayout.collapsed.shieldShop = false;
    uiLayout.collapsed.shop = false;
    canvas = makeCanvas();
    fakeWindow = makeWindow();
    game = makeGame();
    vi.stubGlobal('window', fakeWindow);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('stores canvas and game references and registers listeners', () => {
    const input = new Input(canvas, game);

    expect(input.canvas).toBe(canvas);
    expect(input.game).toBe(game);
    expect(input.hoverPx).toBeNull();
    expect(input.hoverPy).toBeNull();
    expect(canvas.addEventListener).toHaveBeenCalledWith('mousemove', expect.any(Function), { passive: true });
    expect(canvas.addEventListener).toHaveBeenCalledWith('mouseleave', expect.any(Function), { passive: true });
    expect(canvas.addEventListener).toHaveBeenCalledWith('mousedown', expect.any(Function), { passive: true });
    expect(canvas.addEventListener).toHaveBeenCalledWith('contextmenu', expect.any(Function));
    expect(canvas.addEventListener).toHaveBeenCalledWith('wheel', expect.any(Function), { passive: false });
    expect(fakeWindow.addEventListener).toHaveBeenCalledWith('keydown', expect.any(Function));
  });

  it('updates hover coordinates from mousemove', () => {
    const input = new Input(canvas, game);

    canvas.listeners.mousemove({ clientX: 110, clientY: 220 });

    expect(inputHover(input)).toEqual({ px: 100, py: 200 });
    expect(rendererState.hoverPx).toBe(100);
    expect(rendererState.hoverPy).toBe(200);
  });

  it('clears hover coordinates from mouseleave', () => {
    const input = new Input(canvas, game);
    input.hoverPx = 100;
    input.hoverPy = 200;
    rendererState.hoverPx = 100;
    rendererState.hoverPy = 200;

    canvas.listeners.mouseleave();

    expect(input.hoverPx).toBeNull();
    expect(input.hoverPy).toBeNull();
    expect(rendererState.hoverPx).toBeNull();
    expect(rendererState.hoverPy).toBeNull();
  });

  it('passes recalculated canvas coordinates and button to mouse down', () => {
    new Input(canvas, game);

    canvas.listeners.mousedown({ clientX: 110, clientY: 220, button: 2 });

    expect(game.onMouseDown).toHaveBeenCalledWith(100, 200, 2);
  });

  it('prevents context menu', () => {
    const preventDefault = vi.fn();
    new Input(canvas, game);

    canvas.listeners.contextmenu({ preventDefault });

    expect(preventDefault).toHaveBeenCalledOnce();
  });

  it('scrolls the shop on wheel events outside the shield shop', () => {
    new Input(canvas, game);

    canvas.listeners.wheel({ clientX: 100, clientY: 100, deltaY: 40, preventDefault: vi.fn() });

    expect(uiState.shopScrollY).toBe(20);
  });

  it('consumes wheel events inside the shield shop without scrolling', () => {
    const preventDefault = vi.fn();
    new Input(canvas, game);

    canvas.listeners.wheel({
      clientX: 700,
      clientY: 100,
      deltaY: 40,
      preventDefault,
    });

    expect(preventDefault).toHaveBeenCalledOnce();
    expect(uiState.shopScrollY).toBe(0);
  });

  it('skips shop scrolling when the shop is collapsed', () => {
    uiLayout.collapsed.shop = true;
    new Input(canvas, game);

    canvas.listeners.wheel({ clientX: 100, clientY: 100, deltaY: 40, preventDefault: vi.fn() });

    expect(uiState.shopScrollY).toBe(0);
  });

  it('forwards keydown events to the game', () => {
    const event = { key: 'Escape' };
    new Input(canvas, game);

    fakeWindow.addEventListener.mock.calls[0][1](event);

    expect(game.onKeyDown).toHaveBeenCalledWith(event);
  });

  it('removes all listeners on destroy', () => {
    const input = new Input(canvas, game);

    input.destroy();

    expect(canvas.removeEventListener).toHaveBeenCalledWith('mousemove', expect.any(Function), { passive: true });
    expect(canvas.removeEventListener).toHaveBeenCalledWith('mouseleave', expect.any(Function), { passive: true });
    expect(canvas.removeEventListener).toHaveBeenCalledWith('mousedown', expect.any(Function), { passive: true });
    expect(canvas.removeEventListener).toHaveBeenCalledWith('contextmenu', expect.any(Function));
    expect(canvas.removeEventListener).toHaveBeenCalledWith('wheel', expect.any(Function), { passive: false });
    expect(fakeWindow.removeEventListener).toHaveBeenCalledWith('keydown', expect.any(Function));
  });
});

function inputHover(input) {
  return { px: input.hoverPx, py: input.hoverPy };
}
