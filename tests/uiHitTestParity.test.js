/* tripwire inventory:
 *  - (known limitation: no TypeScript) — hit-test parity is runtime only
 */

import { describe, it, expect, vi, beforeAll } from 'vitest';
import { CONFIG, LAYOUT, TROOP_SPECS } from '../src/config.js';

vi.mock('../src/rendering/renderer.js', () => ({
  RENDERER: {
    width: 800,
    height: 600,
    hoverPx: null,
    hoverPy: null,
    markCacheDirty: vi.fn(),
    toWorldInto: vi.fn((px, py, out) => {
      out.x = px;
      out.y = py;
      return out;
    }),
    resize: vi.fn(),
    canvas: null,
    ctx: null,
    offsetX: 0,
    offsetY: 0,
    scale: 1,
    init: vi.fn(),
    beginFrame: vi.fn(),
    applyMapTransform: vi.fn(),
    drawStaticLayers: vi.fn(),
    restoreTransform: vi.fn(),
    _rebuildCache: vi.fn(),
  },
}));
vi.mock('../src/particles.js', () => ({ PARTICLES: { draw: vi.fn(), update: vi.fn() } }));
vi.mock('../src/audio.js', () => ({ AUDIO: {} }));

describe('hit test parity', () => {
  let UI, UI_LAYOUT, shopCardRectInto, drawShop, hitShop;

  beforeAll(async () => {
    const uiMod = await import('../src/ui/index.js');
    UI = uiMod.UI;
    UI_LAYOUT = uiMod.UI_LAYOUT;
    const shop = await import('../src/ui/shop.js');
    shopCardRectInto = shop.shopCardRectInto;
    drawShop = shop.drawShop;
    hitShop = shop.hitShop;
  });

  it('shopCardRectInto returns correct geometry for card 0', () => {
    const gap = LAYOUT.SHOP.CARD_GAP;
    const cardH = LAYOUT.SHOP.CARD_H;
    const cardW = UI_LAYOUT.SHOP_WIDTH - 24;
    const baseY = UI_LAYOUT.hudHeight + 8;
    const out = { x: 0, y: 0, w: 0, h: 0 };
    shopCardRectInto(0, out, 0);
    expect(out.x).toBe(LAYOUT.SHOP.BTN_PAD);
    expect(out.w).toBe(cardW);
    expect(out.h).toBe(cardH);
    expect(out.y).toBe(baseY);
  });

  it('shopCardRectInto returns correct geometry for card 5', () => {
    const gap = LAYOUT.SHOP.CARD_GAP;
    const cardH = LAYOUT.SHOP.CARD_H;
    const cardW = UI_LAYOUT.SHOP_WIDTH - 24;
    const baseY = UI_LAYOUT.hudHeight + 8 + 5 * (cardH + gap);
    const out = { x: 0, y: 0, w: 0, h: 0 };
    shopCardRectInto(5, out, 0);
    expect(out.y).toBe(baseY);
  });

  it('shopCardRectInto applies scroll offset', () => {
    const gap = LAYOUT.SHOP.CARD_GAP;
    const cardH = LAYOUT.SHOP.CARD_H;
    const baseY = UI_LAYOUT.hudHeight + 8;
    const out = { x: 0, y: 0, w: 0, h: 0 };
    shopCardRectInto(0, out, 50);
    expect(out.y).toBe(baseY - 50);
  });

  it('hitShop returns -1 for collapsed shop', () => {
    UI_LAYOUT.collapsed.shop = true;
    expect(hitShop(50, 100)).toBe(-1);
    UI_LAYOUT.collapsed.shop = false;
  });

  it('hitShop returns -1 for click outside card area', () => {
    // hitShop needs this._cardAreaBottom to exist
    // Use the UI object which has shopCardRectInto and hitShop bound to it
    const result = hitShop.call({ ...UI, _cardAreaBottom: 600, shopScrollY: 0 }, 0, 0);
    expect(result).toBe(-1);
  });

  it('hitTestCursor returns default for empty state', async () => {
    const { hitTestCursor } = await import('../src/rendering/gameRenderer.js');
    const game = {
      devConfirmPending: false,
      resetConfirmPending: false,
      sellConfirmPending: false,
      selectedTroopIndex: -1,
      selectedSpec: null,
      _troopTileIndex: [],
      state: 'PRE_WAVE',
      gold: 1000,
      lives: 25,
    };
    const result = hitTestCursor(game, 500, 300);
    expect(result).toBe('default');
  });
});
