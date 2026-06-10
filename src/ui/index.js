import { UI_LAYOUT } from './constants.js';
import { UIRoundRect, drawToggleButton, hitToggleButton, _wrapText, _drawShopTooltip } from './utils.js';
import { drawPlacementGhost, drawSelectedTroopRange } from './placement.js';
import { drawWaveTransition, drawOverlay, drawDevConfirmDialog } from './overlays.js';
import { drawPreview } from './preview.js';
import { drawHUD } from './hud.js';
import { drawShieldShop } from './shieldShop.js';
import {
  drawShop,
  shopCardRect,
  shopCardRectInto,
  hitShop,
  _updateCardAreaBottom,
  updateHover,
  handleToggleClick,
  hitToggleButtons,
} from './shop.js';

const UI = {
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

  _wrapText,
  _drawShopTooltip,

  updateHover,
  shopCardRect,
  shopCardRectInto,
  hitShop,
  _updateCardAreaBottom,
  handleToggleClick,
  hitToggleButtons,
  drawHUD,
  drawShop,
  drawShieldShop,
  drawPreview,
  drawPlacementGhost,
  drawSelectedTroopRange,
  drawWaveTransition,
  drawOverlay,
  drawDevConfirmDialog,
};

export { UI, UI_LAYOUT, UIRoundRect, drawToggleButton, hitToggleButton, _wrapText, _drawShopTooltip };
