import { RENDERER } from '../rendering/renderer.js';
import { CONFIG } from '../config.js';
import { UI_LAYOUT, UI_COLORS } from './constants.js';
import { UIRoundRect, drawToggleButton, fillStrokeRoundedRect } from './utils.js';

export function drawShieldShop(game) {
  const c = RENDERER.ctx;
  const w = RENDERER.width;
  const h = RENDERER.height;
  const panelW = UI_LAYOUT.shieldShopWidth;
  const panelH = h - UI_LAYOUT.hudHeight - UI_LAYOUT.previewHeight;
  const panelX = w - panelW;
  const panelY = UI_LAYOUT.hudHeight;

  this._toggleShieldShop = null;
  this._shieldBuyBtn = null;

  // Collapsed branch: 20px wide bar on the right edge with rotated label.
  if (UI_LAYOUT.collapsed.shieldShop) {
    c.fillStyle = UI_COLORS.panelBg;
    c.fillRect(panelX, panelY, 20, panelH);
    c.fillStyle = UI_COLORS.panelBorder;
    c.fillRect(panelX - 1, panelY, 1, panelH);
    c.save();
    c.translate(panelX + 10, panelY + panelH / 2);
    c.rotate(-Math.PI / 2);
    c.fillStyle = UI_COLORS.textDim;
    c.font = '8px system-ui, sans-serif';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText('SHIELD', 0, 0);
    c.restore();
    const btnRect = { x: panelX + 2, y: panelY + 4, w: 16, h: 16 };
    this._toggleShieldShop = btnRect;
    drawToggleButton(c, btnRect, true, 'left');
    c.textBaseline = 'alphabetic';
    return;
  }

  // Background panel.
  c.fillStyle = UI_COLORS.panelBg;
  c.fillRect(panelX, panelY, panelW, panelH);
  c.fillStyle = UI_COLORS.panelBorder;
  c.fillRect(panelX, panelY, panelW, 1);

  // Toggle button in top-right of the panel.
  const btnRect = { x: panelX + panelW - 19, y: panelY + 5, w: 16, h: 16 };
  this._toggleShieldShop = btnRect;
  drawToggleButton(c, btnRect, false, 'right');

  // Header.
  c.fillStyle = UI_COLORS.textDim;
  c.font = '10px system-ui, sans-serif';
  c.textAlign = 'left';
  c.textBaseline = 'middle';
  c.fillText('SHOP', panelX + 12, panelY + 16);

  // Buy card with gradient background.
  const cardX = panelX + 10;
  const cardY = panelY + 32;
  const cardW = panelW - 20;
  const cardH = 64;

  // Card bg (solid fill, same style as troop cards).
  c.fillStyle = '#131d28';
  UIRoundRect(c, cardX, cardY, cardW, cardH, 8);
  c.fill();

  // Left accent bar (shield blue).
  c.fillStyle = '#5dade2';
  UIRoundRect(c, cardX, cardY + 6, 3, cardH - 12, 1.5);
  c.fill();

  // Determine selected troop state — used for info text, button state, and status label.
  const selIdx = game.selectedTroopIndex;
  const t = selIdx >= 0 ? game.troops[selIdx] : null;
  const hasSelection = !!(t && t.alive);

  // Shield icon — emoji.
  const iconX = cardX + 14;
  const iconY = cardY + 14;
  c.font = '12px system-ui, sans-serif';
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.fillText('🛡️', iconX, iconY);

  // Shield label next to icon.
  c.fillStyle = hasSelection ? '#5dade2' : UI_COLORS.textDim;
  c.font = 'bold 10px system-ui, sans-serif';
  c.textAlign = 'left';
  c.textBaseline = 'middle';
  c.fillText('SHIELD', iconX + 9, iconY);

  // Info text (below icon row).
  let _infoText;
  let _infoColor = UI_COLORS.textDim;
  if (!hasSelection) {
    _infoText = 'Select a troop to buy shield';
  } else if (t.shield > 0) {
    const _cw = game.wave.currentWave;
    const _wavesLeft = CONFIG.SHIELD_EXPIRE_WAVES - (_cw % CONFIG.SHIELD_EXPIRE_WAVES);
    _infoText = '+100% HP · Expires in ' + _wavesLeft + ' waves';
    _infoColor = '#5dade2';
  } else {
    const _cost = t.getShieldCost();
    _infoText = '+' + Math.round(t.spec.hp) + ' HP · ' + _cost + 'g · ' + CONFIG.SHIELD_EXPIRE_WAVES + ' waves';
  }
  c.fillStyle = _infoColor;
  c.font = '8px system-ui, sans-serif';
  c.fillText(_infoText, cardX + 10, cardY + 30);

  // Buy button rect — STASH for game.js click handler.
  const buyBtnY = cardY + cardH - 26;
  const buyBtnH = 22;
  const buyBtnRect = { x: cardX + 4, y: buyBtnY, w: cardW - 8, h: buyBtnH };
  this._shieldBuyBtn = buyBtnRect;

  let cost = 0;
  let canAfford = false;
  if (hasSelection) {
    cost = t.getShieldCost();
    canAfford = game.devMode || game.gold >= cost;
  }

  // Strict if/else if/else if/else chain for the four button states.
  if (!hasSelection) {
    // a) No troop selected or not alive — greyed out.
    fillStrokeRoundedRect(
      c,
      buyBtnRect.x,
      buyBtnRect.y,
      buyBtnRect.w,
      buyBtnRect.h,
      5,
      'rgba(255,255,255,0.04)',
      'rgba(255,255,255,0.06)'
    );
    c.fillStyle = UI_COLORS.textDim;
    c.font = '9px system-ui, sans-serif';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText('SELECT A TROOP', buyBtnRect.x + buyBtnRect.w / 2, buyBtnRect.y + buyBtnRect.h / 2);
  } else if (t.shield > 0) {
    // b) Shield already active — cyan-tinted.
    fillStrokeRoundedRect(
      c,
      buyBtnRect.x,
      buyBtnRect.y,
      buyBtnRect.w,
      buyBtnRect.h,
      5,
      'rgba(93,173,226,0.18)',
      'rgba(93,173,226,0.45)'
    );
    c.fillStyle = '#5dade2';
    c.font = 'bold 10px system-ui, sans-serif';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText('ACTIVE', buyBtnRect.x + buyBtnRect.w / 2, buyBtnRect.y + buyBtnRect.h / 2);
  } else if (!canAfford) {
    // c) Can't afford — greyed out with cost.
    fillStrokeRoundedRect(
      c,
      buyBtnRect.x,
      buyBtnRect.y,
      buyBtnRect.w,
      buyBtnRect.h,
      5,
      'rgba(255,255,255,0.04)',
      'rgba(255,255,255,0.06)'
    );
    c.fillStyle = UI_COLORS.textDim;
    c.font = '9px system-ui, sans-serif';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText('BUY (' + cost + 'g)', buyBtnRect.x + buyBtnRect.w / 2, buyBtnRect.y + buyBtnRect.h / 2);
  } else {
    // d) Can buy — bright cyan button.
    fillStrokeRoundedRect(
      c,
      buyBtnRect.x,
      buyBtnRect.y,
      buyBtnRect.w,
      buyBtnRect.h,
      5,
      'rgba(93,173,226,0.28)',
      'rgba(93,173,226,0.6)'
    );
    c.fillStyle = '#5dade2';
    c.font = 'bold 10px system-ui, sans-serif';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText('BUY SHIELD (' + cost + 'g)', buyBtnRect.x + buyBtnRect.w / 2, buyBtnRect.y + buyBtnRect.h / 2);
  }

  // Selected troop name below the card.
  c.fillStyle = UI_COLORS.textDim;
  c.font = '8px system-ui, sans-serif';
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  const statusName = hasSelection ? t.spec.name : 'none';
  c.fillText('Selected: ' + statusName, cardX + cardW / 2, cardY + cardH + 10);

  c.textBaseline = 'alphabetic';
}
