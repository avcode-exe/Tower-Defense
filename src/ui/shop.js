import { RENDERER } from '../rendering/renderer.js';
import { CONFIG, LAYOUT, TROOP_SPECS } from '../config.js';
import { UI_LAYOUT, UI_COLORS } from './constants.js';
import { AUDIO } from '../audio.js';
import { clamp } from '../utils.js';
import { UIRoundRect, drawToggleButton, hitToggleButton, _wrapText, _drawShopTooltip, fillStrokeRoundedRect } from './utils.js';

export function shopCardRect(i) {
  const gap = LAYOUT.SHOP.CARD_GAP;
  const x = LAYOUT.SHOP.BTN_PAD;
  const cardH = LAYOUT.SHOP.CARD_H;
  const cardW = UI_LAYOUT.SHOP_WIDTH - 24;
  const baseY = UI_LAYOUT.hudHeight + 8 + i * (cardH + gap);
  return { x, y: baseY - this.shopScrollY, w: cardW, h: cardH };
}

// Zero-allocation variant for rendering loops.
export function shopCardRectInto(i, out) {
  const gap = LAYOUT.SHOP.CARD_GAP;
  const x = LAYOUT.SHOP.BTN_PAD;
  const cardH = LAYOUT.SHOP.CARD_H;
  const cardW = UI_LAYOUT.SHOP_WIDTH - 24;
  const baseY = UI_LAYOUT.hudHeight + 8 + i * (cardH + gap);
  out.x = x;
  out.y = baseY - this.shopScrollY;
  out.w = cardW;
  out.h = cardH;
  return out;
}

export function hitShop(px, py) {
  if (UI_LAYOUT.collapsed.shop) return -1;
  const areaTop = UI_LAYOUT.hudHeight + 8;
  const areaBottom = this._cardAreaBottom || RENDERER.height;
  const r = this._hitShopScratch || (this._hitShopScratch = { x: 0, y: 0, w: 0, h: 0 });
  for (let i = 0; i < TROOP_SPECS.length; i++) {
    this.shopCardRectInto(i, r);
    if (r.y + r.h < areaTop || r.y > areaBottom) continue;
    if (px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h) return i;
  }
  return -1;
}

export function _updateCardAreaBottom(game) {
  if (game.selectedTroopIndex >= 0) {
    const t = game.troops[game.selectedTroopIndex];
    if (t && t.alive) {
      // Build stat lines to calculate panel height (same logic as draw)
      let lineCount = 2; // DMG/SPD + RNG/CHN
      if (t.spec.slowFactor) lineCount++; // SLW line
      lineCount += 2; // HP + DPS
      const lineH = 14;
      const panelH = 14 + lineCount * lineH + 8;
      const upgradeBtnY = RENDERER.height - LAYOUT.SHOP.UPGRADE_BTN_Y_OFFSET;
      const panelY = upgradeBtnY - panelH - 4;
      this._cardAreaBottom = panelY - 4; // 4px gap above panel
      return;
    }
  }
  this._cardAreaBottom = RENDERER.height;
}

export function updateHover(px, py) {
  // Skip hover updates while the shop is scrolling — prevents the hover
  // highlight from flickering as cards pass under a stationary mouse.
  if (this.shopScrollY !== this._prevShopScrollY) {
    this._prevShopScrollY = this.shopScrollY;
    return;
  }
  if (px == null || py == null) {
    this.hoveredShopIndex = -1;
    return;
  }
  this.hoveredShopIndex = this.hitShop(px, py);
}

export function handleToggleClick(px, py) {
  if (this._toggleShieldShop && hitToggleButton(px, py, this._toggleShieldShop)) {
    UI_LAYOUT.collapsed.shieldShop = !UI_LAYOUT.collapsed.shieldShop;
    RENDERER.resize(RENDERER.ctx.canvas);
    return true;
  }
  if (this._toggleHud && hitToggleButton(px, py, this._toggleHud)) {
    UI_LAYOUT.collapsed.hud = !UI_LAYOUT.collapsed.hud;
    RENDERER.resize(RENDERER.ctx.canvas);
    return true;
  }
  if (this._toggleShop && hitToggleButton(px, py, this._toggleShop)) {
    UI_LAYOUT.collapsed.shop = !UI_LAYOUT.collapsed.shop;
    RENDERER.resize(RENDERER.ctx.canvas);
    return true;
  }
  if (this._togglePreview && hitToggleButton(px, py, this._togglePreview)) {
    UI_LAYOUT.collapsed.preview = !UI_LAYOUT.collapsed.preview;
    RENDERER.resize(RENDERER.ctx.canvas);
    return true;
  }
  return false;
}

// Non-mutating hit test for toggle buttons (for cursor).
export function hitToggleButtons(px, py) {
  return (
    (this._toggleShieldShop && hitToggleButton(px, py, this._toggleShieldShop)) ||
    (this._toggleHud && hitToggleButton(px, py, this._toggleHud)) ||
    (this._toggleShop && hitToggleButton(px, py, this._toggleShop)) ||
    (this._togglePreview && hitToggleButton(px, py, this._togglePreview))
  );
}

export function drawShop(game) {
  const c = RENDERER.ctx;
  const h = RENDERER.height;

  this._toggleShop = null;

  if (UI_LAYOUT.collapsed.shop) {
    c.fillStyle = UI_COLORS.panelBg;
    c.fillRect(0, UI_LAYOUT.hudHeight, 20, h - UI_LAYOUT.hudHeight - UI_LAYOUT.previewHeight);
    c.fillStyle = UI_COLORS.panelBorder;
    c.fillRect(20, UI_LAYOUT.hudHeight, 1, h - UI_LAYOUT.hudHeight - UI_LAYOUT.previewHeight);
    c.save();
    c.translate(10, (h - UI_LAYOUT.hudHeight - UI_LAYOUT.previewHeight) / 2 + UI_LAYOUT.hudHeight);
    c.rotate(-Math.PI / 2);
    c.fillStyle = UI_COLORS.textDim;
    c.font = '8px system-ui, sans-serif';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText('TROOPS', 0, 0);
    c.restore();
    const btnRect = { x: 2, y: UI_LAYOUT.hudHeight + 4, w: 16, h: 16 };
    this._toggleShop = btnRect;
    drawToggleButton(c, btnRect, true, 'right');
    c.textBaseline = 'alphabetic';
    return;
  }

  // Background panel.
  c.fillStyle = UI_COLORS.panelBg;
  c.fillRect(0, UI_LAYOUT.hudHeight, UI_LAYOUT.SHOP_WIDTH, h - UI_LAYOUT.hudHeight);

  const btnRect = { x: UI_LAYOUT.SHOP_WIDTH - 19, y: UI_LAYOUT.hudHeight + 5, w: 16, h: 16 };
  this._toggleShop = btnRect;
  drawToggleButton(c, btnRect, false, 'left');

  // Shop header.
  c.fillStyle = UI_COLORS.textDim;
  c.font = '10px system-ui, sans-serif';
  c.textAlign = 'left';
  c.textBaseline = 'middle';
  c.fillText('TROOPS', 12, UI_LAYOUT.hudHeight + 16);

  // Compute card area bounds and clamp scroll
  const CARD_H = LAYOUT.SHOP.CARD_H,
    CARD_GAP = LAYOUT.SHOP.CARD_GAP;
  const totalContentH = TROOP_SPECS.length * (CARD_H + CARD_GAP) - CARD_GAP;
  const areaTop = UI_LAYOUT.hudHeight + 8;
  // Dynamic bottom based on selected troop's panel (calculated in _updateCardAreaBottom)
  // If no troop selected, use preview height as bottom.
  this._updateCardAreaBottom(game);
  const areaBottom = this._cardAreaBottom ?? RENDERER.height - UI_LAYOUT.previewHeight;
  this._cardAreaBottom = areaBottom;
  const visibleH = Math.max(0, areaBottom - areaTop);
  const maxScroll = Math.max(0, totalContentH - visibleH);
  this.shopScrollY = clamp(this.shopScrollY, 0, maxScroll);

  // Clip to card area (extended for tooltips)
  c.save();
  c.beginPath();
  c.rect(0, areaTop, RENDERER.width, visibleH + 100);
  c.clip();

  const _shopScratch = this._shopScratch || (this._shopScratch = { x: 0, y: 0, w: 0, h: 0 });
  for (let i = 0; i < TROOP_SPECS.length; i++) {
    const spec = TROOP_SPECS[i];
    const r = this.shopCardRectInto(i, _shopScratch);
    const affordable = game.gold >= spec.cost;
    const isSelected = game.selectedSpec === spec;
    const isHovered = this.hoveredShopIndex === i;

    // Card background — solid fill (gradient over 58px is imperceptible).
    if (isSelected) {
      c.fillStyle = '#1a3355';
    } else if (isHovered) {
      c.fillStyle = '#1a2838';
    } else {
      c.fillStyle = '#131d28';
    }
    UIRoundRect(c, r.x, r.y, r.w, r.h, 8);
    c.fill();

    // Left accent bar.
    c.fillStyle = spec.color;
    UIRoundRect(c, r.x, r.y + 6, 3, r.h - 12, 1.5);
    c.fill();

    // Hover glow border.
    if (isHovered && !isSelected) {
      c.strokeStyle = spec.color + '40';
      c.lineWidth = 1;
      UIRoundRect(c, r.x, r.y, r.w, r.h, 8);
      c.stroke();
    }

    // ── Row 1: Color dot + Name ──
    const leftPad = r.x + 10;
    c.fillStyle = spec.color;
    c.beginPath();
    c.arc(leftPad + 4, r.y + 13, 4, 0, Math.PI * 2);
    c.fill();

    c.fillStyle = affordable ? UI_COLORS.textBright : UI_COLORS.textDim;
    c.font = 'bold 11px system-ui, sans-serif';
    c.textAlign = 'left';
    c.textBaseline = 'middle';
    c.fillText(spec.name, leftPad + 14, r.y + 13);

    // Type badge (right-aligned).
    const typeLabel = spec.type === 'melee' ? 'MELEE' : 'RANGE';
    c.font = '7px system-ui, sans-serif';
    const typeW = c.measureText(typeLabel).width + 6;
    const badgeX = r.x + r.w - typeW - 6;
    c.fillStyle = spec.type === 'melee' ? 'rgba(231,76,60,0.25)' : 'rgba(39,174,96,0.25)';
    UIRoundRect(c, badgeX, r.y + 6, typeW, 13, 3);
    c.fill();
    c.fillStyle = spec.type === 'melee' ? '#e74c3c' : '#27ae60';
    c.textAlign = 'center';
    c.fillText(typeLabel, badgeX + typeW / 2, r.y + 12);

    // ── Row 2: Cost + HP ──
    c.textAlign = 'left';
    c.fillStyle = affordable ? UI_COLORS.gold : UI_COLORS.textDim;
    c.font = '10px system-ui, sans-serif';
    c.fillText(spec.cost + 'g', leftPad, r.y + 30);

    c.fillStyle = 'rgba(231,76,60,0.7)';
    c.font = '9px system-ui, sans-serif';
    c.fillText('♥' + spec.hp, leftPad + 40, r.y + 30);

    // ── Row 3: Stats (clipped) ──
    c.fillStyle = UI_COLORS.textDim;
    c.font = '9px system-ui, sans-serif';
    c.save();
    c.beginPath();
    c.rect(r.x, r.y, r.w, r.h);
    c.clip();
    c.fillText(spec._statsStr, leftPad, r.y + 44);
    c.restore();

    // Selected outline.
    if (isSelected) {
      c.strokeStyle = 'rgba(88,166,255,0.5)';
      c.lineWidth = 1.5;
      UIRoundRect(c, r.x, r.y, r.w, r.h, 8);
      c.stroke();
    }

    // ── Hover tooltip for description ──
    if (isHovered && spec.desc) {
      this._drawShopTooltip(c, r, spec);
    }
  }

  c.restore();

  // Mask: cover any card overflow below the scroll area so cards don't
  // bleed into the stats/upgrade panel below.
  c.fillStyle = UI_COLORS.panelBg;
  c.fillRect(0, areaBottom, UI_LAYOUT.SHOP_WIDTH, RENDERER.height - areaBottom);

  // Scroll indicator
  if (maxScroll > 0) {
    const barH = Math.max(20, visibleH * (visibleH / totalContentH));
    const barY = areaTop + (visibleH - barH) * (this.shopScrollY / maxScroll);
    c.fillStyle = 'rgba(255,255,255,0.3)';
    UIRoundRect(c, UI_LAYOUT.SHOP_WIDTH - 5, barY, 5, barH, 1.5);
    c.fill();
  }

  // ── Selected troop info panel ──
  if (game.selectedTroopIndex >= 0) {
    const t = game.troops[game.selectedTroopIndex];
    if (t && t.alive) {
      // Build stat lines dynamically
      const statLines = [];
      statLines.push(
        'DMG ' + t.getDamage() + ' Lv.' + t.dmgLevel + '  SPD ' + t.getAttackSpeed() + 's Lv.' + t.speedLevel
      );
      statLines.push(
        'RNG ' +
          t.getRange() +
          ' Lv.' +
          t.rangeLevel +
          (t.spec.chain ? '  CHN ' + t.getChain() + ' Lv.' + t.chainLevel : '')
      );
      if (t.spec.slowFactor) {
        statLines.push(
          'SLW ' + (t.getSlowFactor() * 100).toFixed(0) + '% ' + t.getSlowDuration() + 's Lv.' + t.slowLevel
        );
      }
      // HP + DPS lines
      const hpColor = t.getHpRatio() > 0.6 ? '#44cc44' : t.getHpRatio() > 0.3 ? '#cccc44' : '#cc4444';
      statLines.push({ text: 'HP ' + Math.ceil(t.hp) + '/' + t.maxHp, color: hpColor });
      statLines.push({
        text: 'DPS ' + (t.getDamage() / t.getAttackSpeed()).toFixed(1),
        color: UI_COLORS.accent,
        bold: true,
      });

      const lineH = 14;
      const startY = 26;
      const panelH = 14 + statLines.length * lineH + 8; // name(14) + lines + padding
      // Position panel just above upgrade buttons with 4px gap
      const upgradeBtnY = RENDERER.height - LAYOUT.SHOP.UPGRADE_BTN_Y_OFFSET;
      const panelY = upgradeBtnY - panelH - 4;

      fillStrokeRoundedRect(c, 8, panelY, UI_LAYOUT.SHOP_WIDTH - 16, panelH, 8, UI_COLORS.cardBg, UI_COLORS.panelBorder);

      c.fillStyle = UI_COLORS.textBright;
      c.font = 'bold 12px system-ui, sans-serif';
      c.textAlign = 'left';
      c.textBaseline = 'middle';
      c.fillText(t.spec.name, 18, panelY + 14);

      c.font = '10px system-ui, sans-serif';
      c.textBaseline = 'middle';
      for (let i = 0; i < statLines.length; i++) {
        const line = statLines[i];
        const y = panelY + startY + i * lineH;
        if (typeof line === 'string') {
          c.fillStyle = UI_COLORS.textDim;
          c.font = '10px system-ui, sans-serif';
          c.fillText(line, 18, y);
        } else {
          c.fillStyle = line.color || UI_COLORS.textDim;
          c.font = (line.bold ? 'bold ' : '') + '10px system-ui, sans-serif';
          c.fillText(line.text, 18, y);
        }
      }

      // Upgrade buttons.
      const stats = ['dmg', 'range', 'speed', 'chain', 'slow', 'hp'];
      const statLabels = { dmg: 'DMG', range: 'RNG', speed: 'SPD', chain: 'CHN', slow: 'SLW', hp: 'HP' };
      const statColors = {
        dmg: '#e74c3c',
        range: '#2ea043',
        speed: '#58a6ff',
        chain: UI_COLORS.gold,
        slow: '#7fdbff',
        hp: '#44cc44',
      };
      const btnY = RENDERER.height - LAYOUT.SHOP.UPGRADE_BTN_Y_OFFSET;
      const btnPad = LAYOUT.SHOP.BTN_PAD;
      const btnGap = LAYOUT.SHOP.BTN_GAP;
      // IMPORTANT: This layout calculation must match game.js upgrade button hit-test exactly.
      // Count visible buttons first to compute dynamic width.
      let visibleCount = 0;
      for (const stat of stats) {
        if (!t.canUpgrade(stat)) continue;
        visibleCount++;
      }
      const statBtnW =
        visibleCount > 0
          ? Math.floor((UI_LAYOUT.SHOP_WIDTH - btnPad * 2 - btnGap * (visibleCount - 1)) / visibleCount)
          : 49;
      let visibleBtnIdx = 0;
      for (let i = 0; i < stats.length; i++) {
        const stat = stats[i];
        // Skip inapplicable stats entirely.
        if (!t.canUpgrade(stat)) continue;
        const cost = t.getUpgradeCost(stat);
        const affordable = game.devMode || game.gold >= cost;
        const btn = {
          x: btnPad + visibleBtnIdx * (statBtnW + btnGap),
          y: btnY,
          w: statBtnW,
          h: LAYOUT.SHOP.UPGRADE_BTN_H,
        };
        visibleBtnIdx++;

        if (t.isMaxed(stat)) {
          fillStrokeRoundedRect(c, btn.x, btn.y, btn.w, btn.h, 6, 'rgba(255,255,255,0.08)', 'rgba(255,255,255,0.1)');
          c.fillStyle = UI_COLORS.textDim;
          c.font = 'bold 8px system-ui, sans-serif';
          c.textAlign = 'center';
          c.textBaseline = 'middle';
          c.fillText(statLabels[stat], btn.x + btn.w / 2, btn.y + 12);
          c.fillStyle = 'rgba(255,255,255,0.15)';
          c.font = '7px system-ui, sans-serif';
          c.fillText('MAX', btn.x + btn.w / 2, btn.y + 27);
        } else {
          const btnBg = affordable ? statColors[stat] : 'rgba(255,255,255,0.04)';
          const btnBorder = affordable ? null : 'rgba(255,255,255,0.06)';
          fillStrokeRoundedRect(c, btn.x, btn.y, btn.w, btn.h, 6, btnBg, btnBorder);
          c.fillStyle = affordable ? '#fff' : UI_COLORS.textDim;
          c.font = 'bold 9px system-ui, sans-serif';
          c.textAlign = 'center';
          c.textBaseline = 'middle';
          c.fillText(statLabels[stat], btn.x + btn.w / 2, btn.y + 14);
          c.fillStyle = affordable ? 'rgba(255,255,255,0.7)' : UI_COLORS.textDim;
          c.font = '8px system-ui, sans-serif';
          c.fillText('(' + cost + 'g)', btn.x + btn.w / 2, btn.y + 28);
        }
      }

      // Heal button — always visible when a troop is selected.
      const healBtnY = RENDERER.height - LAYOUT.SHOP.HEAL_BTN_Y_OFFSET;
      const healBtnW = UI_LAYOUT.SHOP_WIDTH - LAYOUT.SHOP.SEW;
      const canHeal = t.canHeal();
      const isMaxHp = t.hp >= t.maxHp;
      const healCost = canHeal ? t.getHealCost() : 0;
      const healAffordable = canHeal && (game.devMode || game.gold >= healCost);

      if (isMaxHp) {
        // Max HP — greyed out
        fillStrokeRoundedRect(c, LAYOUT.SHOP.BTN_PAD, healBtnY, healBtnW, LAYOUT.SHOP.HEAL_BTN_H, 6, 'rgba(255,255,255,0.04)', 'rgba(255,255,255,0.06)');
        c.fillStyle = UI_COLORS.textDim;
        c.font = 'bold 9px system-ui, sans-serif';
        c.textAlign = 'center';
        c.textBaseline = 'middle';
        c.fillText('HEAL  MAX HP', LAYOUT.SHOP.BTN_PAD + healBtnW / 2, healBtnY + 14);
      } else {
        // Can heal — show cost and HP
        const healBg = healAffordable ? '#2ea043' : 'rgba(255,255,255,0.04)';
        const healBorder = healAffordable ? null : 'rgba(255,255,255,0.06)';
        fillStrokeRoundedRect(c, LAYOUT.SHOP.BTN_PAD, healBtnY, healBtnW, LAYOUT.SHOP.HEAL_BTN_H, 6, healBg, healBorder);
        c.fillStyle = healAffordable ? '#fff' : UI_COLORS.textDim;
        c.font = 'bold 10px system-ui, sans-serif';
        c.textAlign = 'center';
        c.textBaseline = 'middle';
        c.fillText(
          'HEAL  +' + Math.ceil(t.maxHp * CONFIG.TROOP_HEAL_HP_RATIO) + ' HP',
          LAYOUT.SHOP.BTN_PAD + healBtnW / 2,
          healBtnY + 10
        );
        c.fillStyle = healAffordable ? 'rgba(255,255,255,0.7)' : UI_COLORS.textDim;
        c.font = '8px system-ui, sans-serif';
        c.fillText(
          '(' + healCost + 'g)  ' + t.getHpPercent() + '% HP',
          LAYOUT.SHOP.BTN_PAD + healBtnW / 2,
          healBtnY + 22
        );
      }

      // Sell button with cooldown indicator.
      const sellBtn = {
        x: LAYOUT.SHOP.BTN_PAD,
        y: RENDERER.height - LAYOUT.SHOP.SELL_BTN_Y_OFFSET,
        w: UI_LAYOUT.SHOP_WIDTH - LAYOUT.SHOP.SEW,
        h: LAYOUT.SHOP.SELL_BTN_H,
      };
      const isDevDelete = game.devMode;
      const cd = game.sellCooldownTimer || 0;
      const onCooldown = cd > 0 && !isDevDelete;

      if (isDevDelete) {
        fillStrokeRoundedRect(c, sellBtn.x, sellBtn.y, sellBtn.w, sellBtn.h, 6, 'rgba(218,54,51,0.15)', 'rgba(218,54,51,0.25)');
      } else if (onCooldown) {
        fillStrokeRoundedRect(c, sellBtn.x, sellBtn.y, sellBtn.w, sellBtn.h, 6, 'rgba(128,128,128,0.12)', 'rgba(128,128,128,0.2)');
      } else {
        fillStrokeRoundedRect(c, sellBtn.x, sellBtn.y, sellBtn.w, sellBtn.h, 6, 'rgba(212,118,30,0.12)', 'rgba(212,118,30,0.2)');
      }
      c.fillStyle = isDevDelete ? UI_COLORS.red : onCooldown ? UI_COLORS.textDim : UI_COLORS.orange;
      c.font = 'bold 10px system-ui, sans-serif';
      c.textAlign = 'center';
      c.textBaseline = 'middle';

      if (isDevDelete) {
        c.fillText('Delete ' + t.spec.name, sellBtn.x + sellBtn.w / 2, sellBtn.y + sellBtn.h / 2);
      } else if (onCooldown) {
        c.fillText('Cooldown: ' + Math.ceil(cd) + 's', sellBtn.x + sellBtn.w / 2, sellBtn.y + sellBtn.h / 2 - 1);
        c.fillStyle = UI_COLORS.textDim;
        c.font = '8px system-ui, sans-serif';
        c.fillText(t.spec.name, sellBtn.x + sellBtn.w / 2, sellBtn.y + sellBtn.h / 2 + 11);
      } else {
        const refund = Math.ceil(t.getTotalInvested() * CONFIG.SELL_REFUND_RATIO);
        c.fillText('Sell +' + refund + 'g', sellBtn.x + sellBtn.w / 2, sellBtn.y + sellBtn.h / 2 - 1);
        c.fillStyle = UI_COLORS.textDim;
        c.font = '8px system-ui, sans-serif';
        c.fillText(t.spec.name, sellBtn.x + sellBtn.w / 2, sellBtn.y + sellBtn.h / 2 + 11);
      }
    }
  }
  c.textBaseline = 'alphabetic';
}
