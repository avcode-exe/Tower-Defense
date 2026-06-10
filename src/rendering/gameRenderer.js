import { RENDERER } from './renderer.js';
import { CONFIG, LAYOUT } from '../config.js';
import { PARTICLES } from '../particles.js';
import { UI, UI_LAYOUT } from '../ui/index.js';
import { AUDIO } from '../audio.js';
import { pixelToTile, tileCenterInto, clamp, inBounds } from '../utils.js';

let _troopPath = null;

export function renderGame(game) {
  RENDERER.beginFrame();
  RENDERER.drawStaticLayers(game.grid);
  RENDERER.applyMapTransform();

  const T = CONFIG.TILE_SIZE;
  const ctx = RENDERER.ctx;

  const now = performance.now();

  // Troops (index loop) — cached Path2D, no per-troop path construction.
  if (!_troopPath) {
    const s = T - 12,
      rr = 4;
    const path = new Path2D();
    path.moveTo(rr, 0);
    path.lineTo(s - rr, 0);
    path.quadraticCurveTo(s, 0, s, rr);
    path.lineTo(s, s - rr);
    path.quadraticCurveTo(s, s, s - rr, s);
    path.lineTo(rr, s);
    path.quadraticCurveTo(0, s, 0, s - rr);
    path.lineTo(0, rr);
    path.quadraticCurveTo(0, 0, rr, 0);
    path.closePath();
    _troopPath = path;
  }
  for (let i = 0; i < game.troops.length; i++) {
    const t = game.troops[i];
    if (!t.alive) continue;
    // Shield square outline — replaces the old circular arc. Troop body shrinks
    // to 80% so the overall footprint (body + outline) matches an unshielded troop.
    if (t.shield > 0 && t.alive && t.maxShield > 0) {
      const sqSize = T - 12; // 48px, same as normal troop body
      const sqX = t.gx * T + 6;
      const sqY = t.gy * T + 6;
      ctx.strokeStyle = CONFIG.COLORS.shieldBarFill; // #5dade2
      // Subtle sine-wave pulse between ~0.45 and ~0.75, period ~1.5s.
      const pulse = 0.6 + 0.15 * Math.sin(now * 0.004);
      ctx.globalAlpha = pulse;
      ctx.lineWidth = 2;
      ctx.strokeRect(sqX, sqY, sqSize, sqSize);
      ctx.globalAlpha = 1;
    }
    const x = t.gx * T + 6,
      y = t.gy * T + 6;
    const isShielded = t.shield > 0 && t.maxShield > 0;
    if (isShielded) {
      ctx.save();
      ctx.translate(x, y);
      // Shrink to 80% to fit inside the shield square outline.
      const s = T - 12;
      ctx.translate(s * 0.5, s * 0.5);
      ctx.scale(0.8, 0.8);
      ctx.translate(-s * 0.5, -s * 0.5);
      ctx.fillStyle = t.spec.color;
      ctx.fill(_troopPath);
      ctx.strokeStyle = 'rgba(255,255,255,0.12)';
      ctx.lineWidth = 1.5;
      ctx.stroke(_troopPath);
      ctx.restore();
    } else {
      ctx.save();
      ctx.translate(x, y);
      ctx.fillStyle = t.spec.color;
      ctx.fill(_troopPath);
      ctx.strokeStyle = 'rgba(255,255,255,0.12)';
      ctx.lineWidth = 1.5;
      ctx.stroke(_troopPath);
      ctx.restore();
    }
    const dotColor = t.spec.type === 'melee' ? '#f1c40f' : '#bdc3c7';
    ctx.fillStyle = dotColor;
    ctx.fillRect(t.x - 2.5, t.y - 5.5, 5, 5);
    // HP bar (only when damaged).
    if (t.hp < t.maxHp) {
      const barW = T * 0.7;
      const barH = 3;
      const barX = t.x - barW / 2;
      const barY2 = t.y - T * 0.45;
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(barX, barY2, barW, barH);
      const hpR = t.getHpRatio();
      ctx.fillStyle = hpR > 0.6 ? '#44cc44' : hpR > 0.3 ? '#cccc44' : '#cc4444';
      ctx.fillRect(barX, barY2, barW * hpR, barH);
    }
    // Shield bar above HP bar (always drawn when shielded, even if HP is full).
    if (t.shield > 0 && t.maxShield > 0) {
      const barW = T * 0.7;
      const barH = 2;
      const barX = t.x - barW / 2;
      const barY = t.y - T * 0.45 - 4; // 4px above HP bar
      ctx.fillStyle = CONFIG.COLORS.shieldBarBg; // #223
      ctx.fillRect(barX, barY, barW, barH);
      ctx.fillStyle = CONFIG.COLORS.shieldBarFill; // #5dade2
      ctx.fillRect(barX, barY, barW * t.getShieldRatio(), barH);
    }
  }

  // PASS 1: Monster bodies (shadows, shield rings, body arcs, stun overlays).
  for (let i = 0; i < game.monsters.length; i++) {
    const m = game.monsters[i];
    if (!m.alive) continue;
    // Outer shadow (rect for performance — indistinguishable from arc at small size).
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    const shadowR = m.spec.size * 0.5 + 3;
    ctx.fillRect(m.x - shadowR, m.y - shadowR, shadowR * 2, shadowR * 2);
    // Shield ring.
    if (m.shield > 0) {
      const shieldRatio = m.shield / m.maxShield;
      ctx.strokeStyle = '#5dade2';
      ctx.globalAlpha = 0.3 + 0.5 * shieldRatio;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(m.x, m.y, m.spec.size * 0.5 + 2, 0, Math.PI * 2 * shieldRatio);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    // Body (icy tint when slowed).
    const isSlowed = m._slowColorTint > 0;
    ctx.fillStyle = m.spec.color;
    ctx.beginPath();
    ctx.arc(m.x, m.y, m.spec.size * 0.5, 0, Math.PI * 2);
    ctx.fill();
    if (isSlowed) {
      // Icy blue overlay
      ctx.fillStyle = 'rgba(127, 219, 255, 0.5)';
      ctx.beginPath();
      ctx.arc(m.x, m.y, m.spec.size * 0.5, 0, Math.PI * 2);
      ctx.fill();
    }
    // Stun overlay.
    if (m.stunTimer > 0) {
      ctx.fillStyle = 'rgba(255,255,255,0.4)';
      ctx.beginPath();
      ctx.arc(m.x, m.y, m.spec.size * 0.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // PASS 2: HP bars + Shield bars (merged into 1 loop — was 2 separate loops).
  ctx.fillStyle = CONFIG.COLORS.hpBarBg;
  for (let i = 0; i < game.monsters.length; i++) {
    const m = game.monsters[i];
    if (!m.alive) continue;
    const w = m.spec.size + 6;
    const barY = m.y - m.spec.size * 0.5 - 10;
    // HP bar
    if (m.hp < m.maxHp || m.shield < m.maxShield) {
      ctx.fillStyle = CONFIG.COLORS.hpBarBg;
      ctx.fillRect(m.x - w * 0.5, barY, w, 3);
      ctx.fillStyle = CONFIG.COLORS.hpBarFill;
      ctx.fillRect(m.x - w * 0.5, barY, w * (m.hp / m.maxHp), 3);
    }
    // Shield bar
    if (m.maxShield > 0) {
      ctx.fillStyle = CONFIG.COLORS.shieldBarBg;
      ctx.fillRect(m.x - w * 0.5, barY - 4, w, 2);
      ctx.fillStyle = CONFIG.COLORS.shieldBarFill;
      ctx.fillRect(m.x - w * 0.5, barY - 4, w * Math.min(1, m.shield / m.maxShield), 2);
    }
  }

  // Projectiles (world space) — index loop, no trig for arrows when possible.
  for (let i = 0; i < game.projectiles.length; i++) {
    const p = game.projectiles[i];
    if (!p.alive) continue;
    if (p.kind === 'arrow' || p.kind === 'bolt') {
      const tdx = p.lastTargetX - p.x;
      const tdy = p.lastTargetY - p.y;
      const d = Math.sqrt(tdx * tdx + tdy * tdy) || 1;
      const nx = tdx / d,
        ny = tdy / d;
      ctx.strokeStyle = p.color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(p.x - nx * 6, p.y - ny * 6);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
    } else {
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * 0.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Popups (world space) — set font/textAlign once.
  if (game.popups.length > 0) {
    ctx.font = 'bold 12px system-ui, sans-serif';
    ctx.textAlign = 'center';
    for (let i = 0; i < game.popups.length; i++) {
      const p = game.popups[i];
      const a = clamp(p.t * 1.667, 0, 1); // 1/0.6
      ctx.globalAlpha = a;
      ctx.fillStyle = p.color;
      ctx.fillText(p.text, p.x, p.y - (1.2 - p.t) * 14);
    }
    ctx.globalAlpha = 1;
    ctx.textAlign = 'left';
  }

  // Particles (world space).
  PARTICLES.draw(ctx);

  RENDERER.restoreTransform();

  // UI overlay (screen space).
  UI.updateHover(RENDERER.hoverPx, RENDERER.hoverPy);
  UI.drawHUD(game);
  UI.drawShop(game);
  UI.drawShieldShop(game);
  UI.drawPreview(game);
  UI.drawSelectedTroopRange(game);
  UI.drawPlacementGhost(game);
  UI.drawWaveTransition(game);
  UI.drawOverlay(game);
  UI.drawDevConfirmDialog(game);
  updateCursor(game);
}

export function updateCursor(game) {
  const canvas = RENDERER.canvas;
  if (!canvas || RENDERER.hoverPx == null) {
    canvas.style.cursor = 'default';
    return;
  }
  const px = RENDERER.hoverPx;
  const py = RENDERER.hoverPy;
  const cursor = hitTestCursor(game, px, py);
  if (canvas.style.cursor !== cursor) canvas.style.cursor = cursor;
}

export function hitTestCursor(game, px, py) {
  // Confirmation dialogs take priority.
  if (game.devConfirmPending || game.resetConfirmPending || game.sellConfirmPending) {
    if (
      UI._devConfirmYes &&
      px >= UI._devConfirmYes.x &&
      px <= UI._devConfirmYes.x + UI._devConfirmYes.w &&
      py >= UI._devConfirmYes.y &&
      py <= UI._devConfirmYes.y + UI._devConfirmYes.h
    )
      return 'pointer';
    if (
      UI._devConfirmNo &&
      px >= UI._devConfirmNo.x &&
      px <= UI._devConfirmNo.x + UI._devConfirmNo.w &&
      py >= UI._devConfirmNo.y &&
      py <= UI._devConfirmNo.y + UI._devConfirmNo.h
    )
      return 'pointer';
    return 'default';
  }
  // Panel toggle buttons (shop/hud/preview/shield toggles).
  if (UI.hitToggleButtons(px, py)) return 'pointer';
  // Gold area (triple-click dev mode).
  if (
    px >= LAYOUT.HUD.GOLD_AREA.x &&
    px <= LAYOUT.HUD.GOLD_AREA.x + LAYOUT.HUD.GOLD_AREA.w &&
    py >= LAYOUT.HUD.GOLD_AREA.y &&
    py <= LAYOUT.HUD.GOLD_AREA.y + LAYOUT.HUD.GOLD_AREA.h
  )
    return 'pointer';
  // HUD buttons when expanded.
  if (!UI_LAYOUT.collapsed.hud) {
    const rstBtn = LAYOUT.HUD.RESET_BTN;
    if (px >= rstBtn.x && px <= rstBtn.x + rstBtn.w && py >= rstBtn.y && py <= rstBtn.y + rstBtn.h) return 'pointer';
    // Mute button.
    const muteBtn = LAYOUT.HUD.MUTE_BTN;
    if (px >= muteBtn.x && px <= muteBtn.x + muteBtn.w && py >= muteBtn.y && py <= muteBtn.y + muteBtn.h)
      return 'pointer';
    const w = RENDERER.width;
    for (let i = 0; i < CONFIG.GAME_SPEEDS.length; i++) {
      const r = {
        x: w - LAYOUT.HUD.SPEED_OFFSET + i * 28,
        y: 14,
        w: LAYOUT.HUD.SPEED_BTN_W,
        h: LAYOUT.HUD.SPEED_BTN_H,
      };
      if (px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h) return 'pointer';
    }
    const btn = {
      x: w - LAYOUT.HUD.CTRL_RIGHT,
      y: LAYOUT.HUD.CTRL_BTN.y,
      w: LAYOUT.HUD.CTRL_BTN.w,
      h: LAYOUT.HUD.CTRL_BTN.h,
    };
    if (px >= btn.x && px <= btn.x + btn.w && py >= btn.y && py <= btn.y + btn.h) return 'pointer';
  }
  // Shop cards.
  if (UI.hitShop(px, py) >= 0) return 'pointer';
  // Shield buy button.
  if (!UI_LAYOUT.collapsed.shieldShop && UI._shieldBuyBtn) {
    const sb = UI._shieldBuyBtn;
    if (px >= sb.x && px <= sb.x + sb.w && py >= sb.y && py <= sb.y + sb.h) return 'pointer';
  }
  // Heal / Sell buttons when a troop is selected.
  if (game.selectedTroopIndex >= 0 && !UI_LAYOUT.collapsed.shop) {
    const t = game.troops[game.selectedTroopIndex];
    if (t && t.alive) {
      const healBtnY = RENDERER.height - LAYOUT.SHOP.HEAL_BTN_Y_OFFSET;
      const healBtnW = UI_LAYOUT.SHOP_WIDTH - LAYOUT.SHOP.SEW;
      if (
        px >= LAYOUT.SHOP.BTN_PAD &&
        px <= LAYOUT.SHOP.BTN_PAD + healBtnW &&
        py >= healBtnY &&
        py <= healBtnY + LAYOUT.SHOP.HEAL_BTN_H
      )
        return 'pointer';
      // Sell button (below heal).
      const sellBtnY = healBtnY - LAYOUT.SHOP.HEAL_BTN_H - 4;
      if (
        px >= LAYOUT.SHOP.BTN_PAD &&
        px <= LAYOUT.SHOP.BTN_PAD + healBtnW &&
        py >= sellBtnY &&
        py <= sellBtnY + LAYOUT.SHOP.HEAL_BTN_H
      )
        return 'pointer';
    }
  }
  // Troop on grid (clickable to select).
  if (
    px > UI_LAYOUT.shopWidth &&
    px < RENDERER.width - (UI_LAYOUT.collapsed.shieldShop ? 0 : UI_LAYOUT.shieldShopWidth)
  ) {
    const w = RENDERER.toWorldInto(px, py, UI._ghostPos);
    if (inBounds(Math.floor(w.x / CONFIG.TILE_SIZE), Math.floor(w.y / CONFIG.TILE_SIZE))) {
      const tileKey = Math.floor(w.y / CONFIG.TILE_SIZE) * CONFIG.GRID_SIZE + Math.floor(w.x / CONFIG.TILE_SIZE);
      const tileTroops = game._troopTileIndex[tileKey];
      if (tileTroops) {
        for (let i = 0; i < tileTroops.length; i++) {
          const t = tileTroops[i];
          if (t.alive && Math.abs(px - t.x) < CONFIG.TILE_SIZE / 2 && Math.abs(py - t.y) < CONFIG.TILE_SIZE / 2)
            return 'pointer';
        }
      }
    }
  }
  // Placement ghost (valid tile).
  if (game.selectedSpec && RENDERER.hoverPx != null) {
    const w = RENDERER.toWorldInto(RENDERER.hoverPx, RENDERER.hoverPy, UI._ghostPos);
    const tgx = Math.floor(w.x / CONFIG.TILE_SIZE);
    const tgy = Math.floor(w.y / CONFIG.TILE_SIZE);
    if (
      inBounds(tgx, tgy) &&
      px > UI_LAYOUT.shopWidth &&
      px < RENDERER.width &&
      py > UI_LAYOUT.hudHeight &&
      py < RENDERER.height - UI_LAYOUT.previewHeight
    ) {
      return game.canPlace(tgx, tgy, game.selectedSpec) ? 'pointer' : 'default';
    }
  }
  return 'default';
}
