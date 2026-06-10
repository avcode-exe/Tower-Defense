import { RENDERER } from '../rendering/renderer.js';
import { CONFIG } from '../config.js';
import { UI_LAYOUT } from './constants.js';
import { pixelToTile, tileCenterInto, inBounds } from '../utils.js';
import { UIRoundRect } from './utils.js';

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

  // Clip to the gameplay area bounded by sidebars.
  const shopW = UI_LAYOUT.collapsed.shop ? 0 : UI_LAYOUT.shopWidth;
  const shieldW = UI_LAYOUT.collapsed.shieldShop ? 0 : UI_LAYOUT.shieldShopWidth;
  c.beginPath();
  c.rect(
    shopW,
    UI_LAYOUT.hudHeight,
    RENDERER.width - shopW - shieldW,
    RENDERER.height - UI_LAYOUT.hudHeight - UI_LAYOUT.previewHeight,
  );
  c.clip();

  c.translate(RENDERER.offsetX, RENDERER.offsetY);
  c.scale(RENDERER.scale, RENDERER.scale);

  c.fillStyle = valid ? CONFIG.COLORS.buildableHover : CONFIG.COLORS.invalid;
  c.fillRect(tile.gx * CONFIG.TILE_SIZE, tile.gy * CONFIG.TILE_SIZE, CONFIG.TILE_SIZE, CONFIG.TILE_SIZE);

  tileCenterInto(tile.gx, tile.gy, this._ghostPos);
  const center = this._ghostPos;
  c.strokeStyle = valid ? 'rgba(88,166,255,0.5)' : 'rgba(220,80,80,0.5)';
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
}

export function drawSelectedTroopRange(game) {
  if (game.selectedTroopIndex < 0) return;
  const t = game.troops[game.selectedTroopIndex];
  if (!t || !t.alive) return;
  const c = RENDERER.ctx;
  c.save();

  // Clip to the gameplay area bounded by sidebars.
  const shopW = UI_LAYOUT.collapsed.shop ? 0 : UI_LAYOUT.shopWidth;
  const shieldW = UI_LAYOUT.collapsed.shieldShop ? 0 : UI_LAYOUT.shieldShopWidth;
  c.beginPath();
  c.rect(
    shopW,
    UI_LAYOUT.hudHeight,
    RENDERER.width - shopW - shieldW,
    RENDERER.height - UI_LAYOUT.hudHeight - UI_LAYOUT.previewHeight,
  );
  c.clip();

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
