import { CONFIG } from '../config.js';
import { COLLAPSED_KEYS, makeCollapsedDefaults } from '../config/settingsDefaults.js';

export const UI_LAYOUT = {
  _HUD_HEIGHT: 56,
  _SHOP_WIDTH: 250,
  _PREVIEW_HEIGHT: 80,
  _SHIELD_SHOP_WIDTH: CONFIG.SHIELD_SHOP_WIDTH,
  _zoom: 1,
  /** Extra pixels added to hudHeight when the HUD uses 2-line fallback.
   *  Set by drawHUD() so sidebars (shop, shield shop) know the actual
   *  HUD bottom and don't overlap the compact speed row. */
  _extraHudHeight: 0,

  collapsed: makeCollapsedDefaults(),

  get HUD_HEIGHT() {
    return this._HUD_HEIGHT * this._zoom;
  },
  get SHOP_WIDTH() {
    return this._SHOP_WIDTH * this._zoom;
  },
  get PREVIEW_HEIGHT() {
    return this._PREVIEW_HEIGHT * this._zoom;
  },
  get SHIELD_SHOP_WIDTH() {
    return this._SHIELD_SHOP_WIDTH * this._zoom;
  },

  get hudHeight() {
    const base = this.collapsed.hud ? 20 * this._zoom : this.HUD_HEIGHT;
    return base + (this._extraHudHeight || 0);
  },
  get shopWidth() {
    return this.collapsed.shop ? 20 * this._zoom : this.SHOP_WIDTH;
  },
  get previewHeight() {
    return this.collapsed.preview ? 20 * this._zoom : this.PREVIEW_HEIGHT;
  },
  get shieldShopWidth() {
    return this.collapsed.shieldShop ? 20 * this._zoom : this.SHIELD_SHOP_WIDTH;
  },
};

/** Scale a pixel value by the current UI zoom factor. All hardcoded pixel
 *  values in drawing code should use this to scale with zoom. */
export function zp(px) {
  return Math.round(px * (UI_LAYOUT._zoom || 1));
}

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
