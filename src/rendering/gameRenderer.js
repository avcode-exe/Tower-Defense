import { RENDERER } from './renderer.js';
import { CONFIG, LAYOUT, LAYOUT_ZOOM } from '../config.js';
import { PARTICLES } from '../particles.js';
import { AUDIO } from '../audio.js';
import { pixelToTile, tileCenterInto, clamp, inBounds } from '../utils.js';
import { UI, UI_LAYOUT } from '../ui/index.js';

let _troopPath = null;

export function renderGame(game) {
  const zoom = game.zoom || 1;
  RENDERER.zoom = zoom;
  UI_LAYOUT._zoom = zoom;
  LAYOUT_ZOOM.value = zoom;
  // Check auto-collapse on zoom changes. If state changed, re-layout.
  // The restore condition internally uses expanded-map-width to prevent
  // flip-flop, so no allowRestore flag is needed.
  if (RENDERER.updateAutoCollapse()) {
    RENDERER.resize();
  }
  RENDERER.beginFrame();
  RENDERER.applyMapTransform();
  RENDERER.drawStaticLayers(game.grid);

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
    if (t.shield > 0 && t.maxShield > 0) {
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
    ctx.save();
    ctx.translate(x, y);
    if (isShielded) {
      const s = T - 12;
      ctx.translate(s * 0.5, s * 0.5);
      ctx.scale(0.8, 0.8);
      ctx.translate(-s * 0.5, -s * 0.5);
    }
    ctx.fillStyle = t.spec.color;
    ctx.fill(_troopPath);
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.lineWidth = 1.5;
    ctx.stroke(_troopPath);
    ctx.restore();
    const dotColor = t.spec.type === 'melee' ? '#f1c40f' : t.spec.type === 'support' ? '#fff' : '#bdc3c7';
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

  // Heal beams — faint green lines from healers to recently-healed allies.
  for (let i = 0; i < game.troops.length; i++) {
    const t = game.troops[i];
    if (!t.alive || !t.healBeam || !t.healBeam.troop.alive) continue;
    const src = t.healBeam.troop;
    const alpha = Math.min(1, t.healBeam.timer / 0.3) * 0.35;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = '#44cc44';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(src.x, src.y);
    ctx.lineTo(t.x, t.y);
    ctx.stroke();
    ctx.restore();
  }

  // PASS 1: Monster bodies — shadows, shield rings, body arcs, stun overlays.
  // Batched under ONE ctx.save/restore per monster (instead of per-effect) to
  // reduce expensive canvas state-stack operations on the hot rendering path.
  for (let i = 0; i < game.monsters.length; i++) {
    const m = game.monsters[i];
    if (!m.alive) continue;
    ctx.save();
    // Shadow.
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    const shadowR = m.spec.size * 0.5 + 3;
    ctx.beginPath();
    ctx.arc(m.x, m.y + 2, shadowR, 0, Math.PI * 2);
    ctx.fill();
    if (m.reviveGlow === true) {
      const pulse = 0.5 + 0.5 * Math.sin(now * 0.006);
      const glowAlpha = 0.45 + pulse * 0.45;
      const glowRadius = m.spec.size * 0.72 + pulse * 6;
      ctx.globalAlpha = glowAlpha;
      ctx.strokeStyle = CONFIG.COLORS.revive;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(m.x, m.y, glowRadius, 0, Math.PI * 2);
      ctx.stroke();
    }
    // Shield ring.
    if (m.shield > 0) {
      const shieldRatio = m.shield / m.maxShield;
      ctx.strokeStyle = '#5dade2';
      ctx.globalAlpha = 0.3 + 0.5 * shieldRatio;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(m.x, m.y, m.spec.size * 0.5 + 2, 0, Math.PI * 2 * shieldRatio);
      ctx.stroke();
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
    if (m.burnStacks > 0) {
      const pulse = 0.5 + 0.5 * Math.sin(now * 0.012);
      ctx.globalAlpha = 0.35 + pulse * 0.25;
      ctx.strokeStyle = CONFIG.COLORS.burn;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(m.x, m.y, m.spec.size * 0.5 + 3, 0, Math.PI * 2);
      ctx.stroke();
    }
    // Stun overlay.
    if (m.stunTimer > 0) {
      ctx.fillStyle = 'rgba(255,255,255,0.4)';
      ctx.beginPath();
      ctx.arc(m.x, m.y, m.spec.size * 0.5, 0, Math.PI * 2);
      ctx.fill();
    }
    // Healer healing range indicator.
    if (m.level === 'H' && m._healing) {
      const radius = m.healRange || (m.spec.healRange || 1) * CONFIG.TILE_SIZE;
      ctx.filter = 'blur(8px)';
      ctx.fillStyle = m.spec.color;
      ctx.globalAlpha = 0.05;
      ctx.beginPath();
      ctx.arc(m.x, m.y, radius, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
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
  RENDERER.endFrame();
  UI.drawPlacementGhost(game);
  UI.drawWaveTransition(game);
  UI.drawOverlay(game);
  UI.drawDevConfirmDialog(game);
  drawZoomIndicator(game);
  updateCursor(game);
}

// ── Zoom indicator ───────────────────────────────────────────────────
// Shows the current zoom percentage in the bottom-right corner with
// a quick fade-in, brief hold, then fade-out animation.
const ZOOM_INDICATOR_FADE_IN = 0.2;
const ZOOM_INDICATOR_HOLD = 1.0;
const ZOOM_INDICATOR_FADE_OUT = 0.6;
const ZOOM_INDICATOR_DURATION = ZOOM_INDICATOR_FADE_IN + ZOOM_INDICATOR_HOLD + ZOOM_INDICATOR_FADE_OUT;

function drawZoomIndicator(game) {
  const t0 = game._zoomIndicatorTime || 0;
  if (!t0) return;
  const elapsed = (performance.now() - t0) / 1000;
  if (elapsed >= ZOOM_INDICATOR_DURATION) return;

  const zoom = game.zoom || 1;
  const pct = Math.round(zoom * 100);

  // Compute alpha with fade-in, hold, fade-out.
  let alpha;
  if (elapsed < ZOOM_INDICATOR_FADE_IN) {
    alpha = elapsed / ZOOM_INDICATOR_FADE_IN;
  } else if (elapsed < ZOOM_INDICATOR_FADE_IN + ZOOM_INDICATOR_HOLD) {
    alpha = 1;
  } else {
    const fadeElapsed = elapsed - ZOOM_INDICATOR_FADE_IN - ZOOM_INDICATOR_HOLD;
    alpha = 1 - fadeElapsed / ZOOM_INDICATOR_FADE_OUT;
  }
  alpha = Math.max(0, Math.min(1, alpha));

  const c = RENDERER.ctx;
  const baseFontSize = 13;
  const fontSize = Math.round(baseFontSize * zoom);
  const padX = 10 * zoom;
  const padY = 6 * zoom;
  const borderRadius = 6 * zoom;

  c.save();
  c.globalAlpha = alpha;

  // Measure text.
  c.font = `bold ${fontSize}px system-ui, sans-serif`;
  c.textAlign = 'left';
  c.textBaseline = 'middle';
  const textW = c.measureText(pct + '%').width;

  // Position: bottom-right, with margin.
  const margin = 10 * zoom;
  const pillW = textW + padX * 2;
  const pillH = fontSize + padY * 2;
  const pillX = RENDERER.width - pillW - margin;
  const pillY = RENDERER.height - pillH - margin;

  // Pill background.
  c.fillStyle = 'rgba(7, 11, 18, 0.75)';
  c.beginPath();
  c.moveTo(pillX + borderRadius, pillY);
  c.lineTo(pillX + pillW - borderRadius, pillY);
  c.quadraticCurveTo(pillX + pillW, pillY, pillX + pillW, pillY + borderRadius);
  c.lineTo(pillX + pillW, pillY + pillH - borderRadius);
  c.quadraticCurveTo(pillX + pillW, pillY + pillH, pillX + pillW - borderRadius, pillY + pillH);
  c.lineTo(pillX + borderRadius, pillY + pillH);
  c.quadraticCurveTo(pillX, pillY + pillH, pillX, pillY + pillH - borderRadius);
  c.lineTo(pillX, pillY + borderRadius);
  c.quadraticCurveTo(pillX, pillY, pillX + borderRadius, pillY);
  c.closePath();
  c.fill();

  // At cap (min=100% or max=200%), switch to red and pulse for extra visibility.
  const atCap = zoom <= 1 || zoom >= 2;

  // Sine-wave pulse (~0.10 to 1.0, period ~1.05s) for the cap indicator.
  let capPulse = 1;
  if (atCap) {
    capPulse = 0.55 + 0.45 * Math.sin(performance.now() * 0.006);
  }

  // Border glow — lineWidth scales with zoom for visual consistency.
  c.strokeStyle = atCap ? `rgba(218, 54, 51, ${(0.45 * capPulse).toFixed(2)})` : 'rgba(88, 166, 255, 0.35)';
  c.lineWidth = 1.5 * zoom;
  c.stroke();

  // Text — pulse opacity when at cap.
  c.globalAlpha = atCap ? alpha * capPulse : alpha;
  c.fillStyle = atCap ? '#da3633' : '#58a6ff';
  c.textAlign = 'center';
  c.fillText(pct + '%', pillX + pillW / 2, pillY + pillH / 2 + 1);

  // Restore alpha after pulsing the text.
  if (atCap) c.globalAlpha = alpha;

  c.restore();
}

export function updateCursor(game) {
  const canvas = RENDERER.canvas;
  if (!canvas || RENDERER.hoverPx == null) {
    if (canvas) canvas.style.cursor = 'default';
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
    const sOff = UI._speedBtnOffsetY || 0;
    const rstBtn = UI._resetBtn || LAYOUT.HUD.RESET_BTN;
    if (px >= rstBtn.x && px <= rstBtn.x + rstBtn.w && py >= rstBtn.y && py <= rstBtn.y + rstBtn.h) return 'pointer';
    const w = RENDERER.width;
    const sGap = UI._speedBtnGap || 28;
    for (let i = 0; i < CONFIG.GAME_SPEEDS.length; i++) {
      const rx = w - LAYOUT.HUD.SPEED_OFFSET + i * sGap;
      const ry = sOff + 14;
      const rw = LAYOUT.HUD.SPEED_BTN_W;
      const rh = UI._speedBtnH || LAYOUT.HUD.SPEED_BTN_H;
      if (px >= rx && px <= rx + rw && py >= ry && py <= ry + rh) return 'pointer';
    }
    const bx = w - LAYOUT.HUD.CTRL_RIGHT;
    const by = LAYOUT.HUD.CTRL_BTN.y;
    const bw = LAYOUT.HUD.CTRL_BTN.w;
    const bh = LAYOUT.HUD.CTRL_BTN.h;
    if (px >= bx && px <= bx + bw && py >= by && py <= by + bh) return 'pointer';
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
      // Sell button.
      const sellBtnY = RENDERER.height - LAYOUT.SHOP.SELL_BTN_Y_OFFSET;
      const sellBtnW = UI_LAYOUT.SHOP_WIDTH - LAYOUT.SHOP.SEW;
      if (
        px >= LAYOUT.SHOP.BTN_PAD &&
        px <= LAYOUT.SHOP.BTN_PAD + sellBtnW &&
        py >= sellBtnY &&
        py <= sellBtnY + LAYOUT.SHOP.SELL_BTN_H
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
          if (t.alive && Math.abs(w.x - t.x) < CONFIG.TILE_SIZE / 2 && Math.abs(w.y - t.y) < CONFIG.TILE_SIZE / 2)
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
      px < RENDERER.width - (UI_LAYOUT.collapsed.shieldShop ? 0 : UI_LAYOUT.shieldShopWidth) &&
      py > UI_LAYOUT.hudHeight &&
      py < RENDERER.height - UI_LAYOUT.previewHeight
    ) {
      return game.canPlace(tgx, tgy, game.selectedSpec) ? 'pointer' : 'default';
    }
  }
  return 'default';
}
