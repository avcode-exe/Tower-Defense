import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { UI_LAYOUT, UI_COLORS } from '../src/ui/constants.js';
import { CONFIG } from '../src/config.js';

describe('UI_LAYOUT', () => {
  beforeEach(() => {
    // Reset collapsed state
    UI_LAYOUT.collapsed.hud = false;
    UI_LAYOUT.collapsed.shop = false;
    UI_LAYOUT.collapsed.preview = false;
    UI_LAYOUT.collapsed.shieldShop = false;
  });

  it('expanded dimensions match constants', () => {
    expect(UI_LAYOUT.HUD_HEIGHT).toBe(56);
    expect(UI_LAYOUT.SHOP_WIDTH).toBe(250);
    expect(UI_LAYOUT.PREVIEW_HEIGHT).toBe(80);
  });

  it('SHIELD_SHOP_WIDTH matches CONFIG.SHIELD_SHOP_WIDTH', () => {
    expect(UI_LAYOUT.SHIELD_SHOP_WIDTH).toBe(CONFIG.SHIELD_SHOP_WIDTH);
  });

  it('hudHeight returns HUD_HEIGHT when expanded', () => {
    expect(UI_LAYOUT.hudHeight).toBe(56);
  });

  it('hudHeight returns 20 when collapsed', () => {
    UI_LAYOUT.collapsed.hud = true;
    expect(UI_LAYOUT.hudHeight).toBe(20);
  });

  it('shopWidth returns SHOP_WIDTH when expanded', () => {
    expect(UI_LAYOUT.shopWidth).toBe(250);
  });

  it('shopWidth returns 20 when collapsed', () => {
    UI_LAYOUT.collapsed.shop = true;
    expect(UI_LAYOUT.shopWidth).toBe(20);
  });

  it('previewHeight returns PREVIEW_HEIGHT when expanded', () => {
    expect(UI_LAYOUT.previewHeight).toBe(80);
  });

  it('previewHeight returns 20 when collapsed', () => {
    UI_LAYOUT.collapsed.preview = true;
    expect(UI_LAYOUT.previewHeight).toBe(20);
  });

  it('shieldShopWidth returns SHIELD_SHOP_WIDTH when expanded', () => {
    expect(UI_LAYOUT.shieldShopWidth).toBe(CONFIG.SHIELD_SHOP_WIDTH);
  });

  it('shieldShopWidth returns 20 when collapsed', () => {
    UI_LAYOUT.collapsed.shieldShop = true;
    expect(UI_LAYOUT.shieldShopWidth).toBe(20);
  });

  it('independent collapse — each panel collapses independently', () => {
    UI_LAYOUT.collapsed.shop = true;
    UI_LAYOUT.collapsed.hud = false;
    expect(UI_LAYOUT.shopWidth).toBe(20);
    expect(UI_LAYOUT.hudHeight).toBe(56);
  });
});

describe('UI_COLORS', () => {
  it('has all expected keys', () => {
    const expectedKeys = [
      'panelBg',
      'panelBorder',
      'cardBg',
      'cardHover',
      'cardSelect',
      'textDim',
      'textBody',
      'textBright',
      'accent',
      'gold',
      'heart',
      'green',
      'red',
      'orange',
    ];
    for (const key of expectedKeys) {
      expect(UI_COLORS).toHaveProperty(key);
      expect(typeof UI_COLORS[key]).toBe('string');
    }
  });

  it('colors start with valid CSS values', () => {
    expect(UI_COLORS.panelBg).toMatch(/^#/);
    expect(UI_COLORS.accent).toMatch(/^#/);
    expect(UI_COLORS.gold).toBe('#f1c40f');
    expect(UI_COLORS.heart).toBe('#e74c3c');
    expect(UI_COLORS.green).toBe('#2ea043');
    expect(UI_COLORS.red).toBe('#da3633');
  });
});
