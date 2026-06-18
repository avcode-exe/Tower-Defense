import { describe, expect, it, beforeEach, vi } from 'vitest';

const rendererState = vi.hoisted(() => ({
  width: 800,
  height: 600,
  offsetX: 100,
  offsetY: 100,
  scale: 1,
  hoverPx: null,
  hoverPy: null,
  canvas: null,
  toWorldInto: vi.fn((px, py, out) => {
    out.x = px - rendererState.offsetX;
    out.y = py - rendererState.offsetY;
    return out;
  }),
}));

const uiState = vi.hoisted(() => ({
  hoveredShopIndex: -1,
  hoveredTroopIndex: -1,
  shopScrollY: 0,
  _prevShopScrollY: 0,
  _cardAreaBottom: 0,
  _toggleShop: null,
  _toggleHud: null,
  _togglePreview: null,
  _toggleShieldShop: null,
  _ghostPos: { x: 0, y: 0 },
  _tileScratch: { gx: 0, gy: 0 },
  _hitShopScratch: null,
  _shopScratch: null,
  _devConfirmYes: null,
  _devConfirmNo: null,
  _shieldBuyBtn: null,
  hitShop: vi.fn(() => -1),
  hitToggleButtons: vi.fn(() => false),
}));

const uiLayout = vi.hoisted(() => ({
  collapsed: {
    hud: false,
    shop: false,
    shieldShop: false,
  },
  SHOP_WIDTH: 250,
  shopWidth: 250,
  shieldShopWidth: 220,
  hudHeight: 56,
  previewHeight: 80,
}));

vi.mock('../src/rendering/renderer.js', () => ({
  RENDERER: rendererState,
}));

vi.mock('../src/ui/index.js', () => ({
  UI: uiState,
  UI_LAYOUT: uiLayout,
}));

import { updateCursor, hitTestCursor } from '../src/rendering/gameRenderer.js';
import { LAYOUT } from '../src/config.js';
import { UI_LAYOUT } from '../src/ui/index.js';

function makeGame(overrides = {}) {
  const troop = { alive: true, x: 200, y: 200 };
  return {
    devConfirmPending: false,
    resetConfirmPending: false,
    sellConfirmPending: false,
    selectedTroopIndex: -1,
    troops: [],
    selectedSpec: null,
    _troopTileIndex: Array.from({ length: 256 }, () => []),
    canPlace: vi.fn(() => false),
    ...overrides,
    troop,
  };
}

function resetState() {
  rendererState.width = 800;
  rendererState.height = 600;
  rendererState.offsetX = 100;
  rendererState.offsetY = 100;
  rendererState.scale = 1;
  rendererState.hoverPx = null;
  rendererState.hoverPy = null;
  rendererState.canvas = null;
  rendererState.toWorldInto.mockImplementation((px, py, out) => {
    out.x = px - rendererState.offsetX;
    out.y = py - rendererState.offsetY;
    return out;
  });

  Object.assign(uiLayout.collapsed, {
    hud: false,
    shop: false,
    shieldShop: false,
  });
  Object.assign(uiState, {
    hoveredShopIndex: -1,
    hoveredTroopIndex: -1,
    shopScrollY: 0,
    _prevShopScrollY: 0,
    _cardAreaBottom: 0,
    _toggleShop: null,
    _toggleHud: null,
    _togglePreview: null,
    _toggleShieldShop: null,
    _ghostPos: { x: 0, y: 0 },
    _tileScratch: { gx: 0, gy: 0 },
    _hitShopScratch: null,
    _shopScratch: null,
    _devConfirmYes: null,
    _devConfirmNo: null,
    _shieldBuyBtn: null,
  });
  uiState.hitShop.mockReturnValue(-1);
  uiState.hitToggleButtons.mockReturnValue(false);
}

describe('updateCursor', () => {
  beforeEach(() => {
    resetState();
  });

  it('sets the cursor to default when there is no canvas', () => {
    rendererState.hoverPx = 10;
    rendererState.hoverPy = 10;

    updateCursor(makeGame());

    expect(rendererState.canvas).toBeNull();
  });

  it('sets the cursor from hitTestCursor', () => {
    const canvas = { style: { cursor: 'default' } };
    rendererState.canvas = canvas;
    rendererState.hoverPx = 10;
    rendererState.hoverPy = 10;

    updateCursor(makeGame());

    expect(canvas.style.cursor).toBe('default');
  });

  it('does not update the DOM cursor when it is unchanged', () => {
    const canvas = { style: { cursor: 'default' } };
    rendererState.canvas = canvas;
    rendererState.hoverPx = 10;
    rendererState.hoverPy = 10;

    updateCursor(makeGame());
    updateCursor(makeGame());

    expect(canvas.style.cursor).toBe('default');
  });
});

describe('hitTestCursor', () => {
  beforeEach(() => {
    resetState();
  });

  it('returns default when no hover is present', () => {
    expect(hitTestCursor(makeGame(), 10, 10)).toBe('default');
  });

  it('gives confirmation dialogs priority and only allows yes/no buttons', () => {
    uiState._devConfirmYes = { x: 10, y: 10, w: 20, h: 20 };
    uiState._devConfirmNo = { x: 40, y: 10, w: 20, h: 20 };
    const game = makeGame({
      devConfirmPending: true,
    });

    expect(hitTestCursor(game, 15, 15)).toBe('pointer');
    expect(hitTestCursor(game, 45, 15)).toBe('pointer');
    expect(hitTestCursor(game, 25, 45)).toBe('default');
  });

  it('returns pointer for UI toggle buttons', () => {
    uiState.hitToggleButtons.mockReturnValue(true);

    expect(hitTestCursor(makeGame(), 10, 10)).toBe('pointer');
    expect(uiState.hitToggleButtons).toHaveBeenCalledWith(10, 10);
  });

  it('returns pointer for the gold dev-mode area', () => {
    const area = LAYOUT.HUD.GOLD_AREA;
    expect(hitTestCursor(makeGame(), area.x + 1, area.y + 1)).toBe('pointer');
  });

  it('returns pointer for HUD buttons when expanded', () => {
    const reset = LAYOUT.HUD.RESET_BTN;
    expect(hitTestCursor(makeGame(), reset.x + 1, reset.y + 1)).toBe('pointer');
  });

  it('returns pointer for shop cards', () => {
    uiState.hitShop.mockReturnValue(0);

    expect(hitTestCursor(makeGame(), 20, 100)).toBe('pointer');
  });

  it('returns pointer for the shield buy button', () => {
    uiState._shieldBuyBtn = { x: 600, y: 100, w: 20, h: 20 };

    expect(hitTestCursor(makeGame(), 610, 110)).toBe('pointer');
  });

  it('returns pointer for heal and sell buttons when a troop is selected', () => {
    const troop = { alive: true };
    const game = makeGame({ selectedTroopIndex: 0, troops: [troop], selectedSpec: null });
    uiState.hitShop.mockReturnValue(-1);
    uiState.hitToggleButtons.mockReturnValue(false);
    uiLayout.collapsed.shop = false;
    const healY = rendererState.height - LAYOUT.SHOP.HEAL_BTN_Y_OFFSET;
    const sellY = rendererState.height - LAYOUT.SHOP.SELL_BTN_Y_OFFSET;

    expect(hitTestCursor(game, 100, healY + 1)).toBe('pointer');
    expect(hitTestCursor(game, 100, sellY + 1)).toBe('pointer');
  });

  it('returns pointer for troops on the grid', () => {
    const game = makeGame();
    game._troopTileIndex[51] = [game.troop];

    expect(hitTestCursor(game, 300, 300)).toBe('pointer');
  });

  it('returns pointer for valid placement previews', () => {
    rendererState.hoverPx = 300;
    rendererState.hoverPy = 300;
    const game = makeGame({ selectedSpec: {}, canPlace: vi.fn(() => true) });

    expect(hitTestCursor(game, 300, 300)).toBe('pointer');
    expect(game.canPlace).toHaveBeenCalledWith(3, 3, game.selectedSpec);
  });

  it('returns default for invalid placement previews', () => {
    const game = makeGame({ selectedSpec: {}, canPlace: vi.fn(() => false) });

    expect(hitTestCursor(game, 300, 300)).toBe('default');
  });
});
