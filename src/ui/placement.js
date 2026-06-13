import { RENDERER } from '../rendering/renderer.js';
import { CONFIG } from '../config.js';
import { UI_LAYOUT } from './constants.js';
import { pixelToTile, tileCenterInto, inBounds } from '../utils.js';
import { UIRoundRect, clipToGameplayArea } from './utils.js';

const VALID_SUPPORT_RANGE = 'rgba(46,204,113,0.5)';
const VALID_DAMAGE_RANGE = 'rgba(88,166,255,0.5)';
const INVALID_RANGE = 'rgba(220,80,80,0.5)';
const SUPPORT_TEXT = '#2ecc71';
const DAMAGE_TEXT = '#f39c12';
const INVALID_TEXT = '#e74c3c';

export function getSupportHpsForPlacementPreview(selectedSpec, troop) {
  if (!selectedSpec || selectedSpec.type !== 'support') return 0;
  return troop && typeof troop.getHps === 'function' ? troop.getHps() : selectedSpec.damage / selectedSpec.attackSpeed;
}

function drawSupportPlacementPreviewText(hps) {
  const c = RENDERER.ctx;
  const lineH = 12;
  const panelW = 72;
  const x = Math.min(RENDERER.hoverPx + 10, RENDERER.width - panelW);
  const y = Math.min(RENDERER.hoverPy + 10, RENDERER.height - lineH);

  c.save();
  c.font = '10px system-ui, sans-serif';
  c.textAlign = 'left';
  c.textBaseline = 'middle';
  c.fillStyle = SUPPORT_TEXT;
  c.fillText('HPS ' + hps.toFixed(1), x, y);
  c.restore();
}

export function getDpsForPlacementPreview(selectedSpec) {
  if (!selectedSpec || selectedSpec.type === 'support') return 0;
  return selectedSpec.damage / selectedSpec.attackSpeed;
}

function drawDamagePlacementPreviewText(dps) {
  const c = RENDERER.ctx;
  const lineH = 12;
  const panelW = 72;
  const x = Math.min(RENDERER.hoverPx + 10, RENDERER.width - panelW);
  const y = Math.min(RENDERER.hoverPy + 10, RENDERER.height - lineH);

  c.save();
  c.font = '10px system-ui, sans-serif';
  c.textAlign = 'left';
  c.textBaseline = 'middle';
  c.fillStyle = DAMAGE_TEXT;
  c.fillText('DPS ' + dps.toFixed(1), x, y);
  c.restore();
}

function drawPlacementInvalidReason(game, gx, gy) {
  const reason = game.getPlacementInvalidReason(gx, gy, game.selectedSpec);
  if (!reason) return;
  const c = RENDERER.ctx;
  const lineH = 12;
  const panelW = 120;
  const x = Math.min(RENDERER.hoverPx + 10, RENDERER.width - panelW);
  const y = Math.min(RENDERER.hoverPy + 22, RENDERER.height - lineH);

  c.save();
  c.font = '10px system-ui, sans-serif';
  c.textAlign = 'left';
  c.textBaseline = 'middle';
  c.fillStyle = INVALID_TEXT;
  c.fillText(reason, x, y);
  c.restore();
}

export function drawPlacementGhost(game) {
  if (!game.selectedSpec) return;
  if (RENDERER.hoverPx == null) return;
  const w = RENDERER.toWorldInto(RENDERER.hoverPx, RENDERER.hoverPy, this._ghostPos);
  pixelToTile(w.x, w.y, this._tileScratch);
  const tile = this._tileScratch;
  if (!inBounds(tile.gx, tile.gy)) return;
  if (RENDERER.hoverPx < UI_LAYOUT.shopWidth) return;
  if (!UI_LAYOUT.collapsed.shieldShop && RENDERER.hoverPx > RENDERER.width - UI_LAYOUT.shieldShopWidth) return;
  if (RENDERER.hoverPy < UI_LAYOUT.hudHeight) return;
  if (RENDERER.hoverPy > RENDERER.height - UI_LAYOUT.previewHeight) return;

  const c = RENDERER.ctx;
  const valid = game.canPlace(tile.gx, tile.gy, game.selectedSpec);
  c.save();

  clipToGameplayArea(c);

  c.translate(RENDERER.offsetX, RENDERER.offsetY);
  c.scale(RENDERER.scale, RENDERER.scale);

  c.fillStyle = valid ? CONFIG.COLORS.buildableHover : CONFIG.COLORS.invalid;
  c.fillRect(tile.gx * CONFIG.TILE_SIZE, tile.gy * CONFIG.TILE_SIZE, CONFIG.TILE_SIZE, CONFIG.TILE_SIZE);

  tileCenterInto(tile.gx, tile.gy, this._ghostPos);
  const center = this._ghostPos;
  const rangeColor =
    game.selectedSpec.type === 'support'
      ? valid
        ? VALID_SUPPORT_RANGE
        : INVALID_RANGE
      : valid
        ? VALID_DAMAGE_RANGE
        : INVALID_RANGE;
  c.strokeStyle = rangeColor;
  c.lineWidth = 1.5;
  c.setLineDash([4, 4]);
  c.beginPath();
  c.arc(center.x, center.y, (game.selectedSpec.range + CONFIG.TILE_BUFFER) * CONFIG.TILE_SIZE, 0, Math.PI * 2);
  c.stroke();
  c.setLineDash([]);

  c.globalAlpha = 0.5;
  c.fillStyle = game.selectedSpec.color;
  const s = CONFIG.TILE_SIZE - 8;
  UIRoundRect(c, center.x - s / 2, center.y - s / 2, s, s, 4);
  c.fill();
  c.restore();

  if (!valid) {
    drawPlacementInvalidReason(game, tile.gx, tile.gy);
  } else if (game.selectedSpec.type === 'support') {
    const hps = getSupportHpsForPlacementPreview(game.selectedSpec, game.troops[game.selectedTroopIndex]);
    drawSupportPlacementPreviewText(hps);
  } else {
    const dps = getDpsForPlacementPreview(game.selectedSpec);
    drawDamagePlacementPreviewText(dps);
  }
}

export function drawSelectedTroopRange(game) {
  if (game.selectedTroopIndex < 0) return;
  const t = game.troops[game.selectedTroopIndex];
  if (!t || !t.alive) return;
  const c = RENDERER.ctx;
  c.save();

  clipToGameplayArea(c);

  c.translate(RENDERER.offsetX, RENDERER.offsetY);
  c.scale(RENDERER.scale, RENDERER.scale);
  c.strokeStyle = 'rgba(88,166,255,0.5)';
  c.lineWidth = 1.5;
  c.setLineDash([5, 5]);
  c.beginPath();
  c.arc(t.x, t.y, (t.getRange() + CONFIG.TILE_BUFFER) * CONFIG.TILE_SIZE, 0, Math.PI * 2);
  c.fillStyle = 'rgba(88,166,255,0.08)';
  c.fill();
  c.stroke();
  c.setLineDash([]);
  c.restore();
}
