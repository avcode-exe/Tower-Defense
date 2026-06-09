import { CONFIG } from '../config.js';

export const UI_LAYOUT = {
  HUD_HEIGHT: 56,
  SHOP_WIDTH: 250,
  PREVIEW_HEIGHT: 80,
  SHIELD_SHOP_WIDTH: CONFIG.SHIELD_SHOP_WIDTH,

  collapsed: {
    shop: false,
    hud: false,
    preview: false,
    help: false,
    monsterInfo: false,
    shieldShop: false,
    settings: false,
    dev: false,
  },

  get hudHeight() {
    return this.collapsed.hud ? 20 : this.HUD_HEIGHT;
  },
  get shopWidth() {
    return this.collapsed.shop ? 20 : this.SHOP_WIDTH;
  },
  get previewHeight() {
    return this.collapsed.preview ? 20 : this.PREVIEW_HEIGHT;
  },
  get shieldShopWidth() {
    return this.collapsed.shieldShop ? 20 : this.SHIELD_SHOP_WIDTH;
  },
};

export const UI_COLORS = {
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
};
