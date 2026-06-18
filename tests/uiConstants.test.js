import { describe, expect, it, beforeEach } from 'vitest';
import { CONFIG } from '../src/config.js';
import { UI_LAYOUT, UI_COLORS } from '../src/ui/constants.js';

describe('UI_LAYOUT', () => {
  beforeEach(() => {
    UI_LAYOUT.collapsed.shop = false;
    UI_LAYOUT.collapsed.hud = false;
    UI_LAYOUT.collapsed.preview = false;
    UI_LAYOUT.collapsed.shieldShop = false;
  });

  it('uses expanded dimensions by default', () => {
    expect(UI_LAYOUT.hudHeight).toBe(56);
    expect(UI_LAYOUT.shopWidth).toBe(250);
    expect(UI_LAYOUT.previewHeight).toBe(80);
    expect(UI_LAYOUT.shieldShopWidth).toBe(CONFIG.SHIELD_SHOP_WIDTH);
  });

  it('uses collapsed dimensions when flags are set', () => {
    UI_LAYOUT.collapsed.hud = true;
    UI_LAYOUT.collapsed.shop = true;
    UI_LAYOUT.collapsed.preview = true;
    UI_LAYOUT.collapsed.shieldShop = true;

    expect(UI_LAYOUT.hudHeight).toBe(20);
    expect(UI_LAYOUT.shopWidth).toBe(20);
    expect(UI_LAYOUT.previewHeight).toBe(20);
    expect(UI_LAYOUT.shieldShopWidth).toBe(20);
  });

  it('collapses each panel independently', () => {
    UI_LAYOUT.collapsed.hud = true;
    expect(UI_LAYOUT.hudHeight).toBe(20);
    expect(UI_LAYOUT.shopWidth).toBe(250);

    UI_LAYOUT.collapsed.shop = true;
    expect(UI_LAYOUT.shopWidth).toBe(20);
    expect(UI_LAYOUT.previewHeight).toBe(80);

    UI_LAYOUT.collapsed.preview = true;
    expect(UI_LAYOUT.previewHeight).toBe(20);
    expect(UI_LAYOUT.shieldShopWidth).toBe(CONFIG.SHIELD_SHOP_WIDTH);
  });
});

describe('UI_COLORS', () => {
  it('contains expected UI color keys', () => {
    expect(UI_COLORS).toMatchObject({
      panelBg: '#0c1219',
      panelBorder: 'rgba(255,255,255,0.06)',
      cardBg: '#111a24',
      cardHover: '#182230',
      cardSelect: '#1a3355',
      textDim: 'rgba(255,255,255,0.35)',
      textBody: 'rgba(255,255,255,0.78)',
      textBright: '#edf2f7',
      accent: '#58a6ff',
      gold: '#f1c40f',
      heart: '#e74c3c',
      green: '#2ea043',
      red: '#da3633',
      orange: '#d4761e',
    });
  });
});
