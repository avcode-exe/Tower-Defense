// UI: HUD + shop + overlays. All drawing is done against the same canvas; we
// divide the screen into regions and render with fixed coordinates.

(function() {

const UI_LAYOUT = {
  HUD_HEIGHT: 56,
  SHOP_WIDTH: 240,
  PREVIEW_HEIGHT: 80,
  SHIELD_SHOP_WIDTH: CONFIG.SHIELD_SHOP_WIDTH,

  // Collapsible section states
  collapsed: {
    shop: false,
    hud: false,
    preview: false,
    help: false,
    monsterInfo: false,
    shieldShop: false,
  },

  // Effective dimensions accounting for collapsed state.
  // Collapsed panels still occupy 20px for their tab bar.
  get hudHeight() { return this.collapsed.hud ? 20 : this.HUD_HEIGHT; },
  get shopWidth() { return this.collapsed.shop ? 20 : this.SHOP_WIDTH; },
  get previewHeight() { return this.collapsed.preview ? 20 : this.PREVIEW_HEIGHT; },
  get shieldShopWidth() { return this.collapsed.shieldShop ? 20 : this.SHIELD_SHOP_WIDTH; },
};

// ── Shared helpers ──

const UI_COLORS = {
  panelBg:    '#0c1219',
  panelBorder:'rgba(255,255,255,0.06)',
  cardBg:     '#111a24',
  cardHover:  '#182230',
  cardSelect: '#1a3355',
  textDim:    'rgba(255,255,255,0.35)',
  textBody:   'rgba(255,255,255,0.78)',
  textBright: '#edf2f7',
  accent:     '#58a6ff',
  gold:       '#f1c40f',
  heart:      '#e74c3c',
  green:      '#2ea043',
  red:        '#da3633',
  orange:     '#d4761e',
};

function UIRoundRect(c, x, y, w, h, r) {
  c.beginPath();
  c.moveTo(x + r, y);
  c.lineTo(x + w - r, y);
  c.quadraticCurveTo(x + w, y, x + w, y + r);
  c.lineTo(x + w, y + h - r);
  c.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  c.lineTo(x + r, y + h);
  c.quadraticCurveTo(x, y + h, x, y + h - r);
  c.lineTo(x, y + r);
  c.quadraticCurveTo(x, y, x + r, y);
  c.closePath();
}

function drawToggleButton(c, rect, collapsed, expandDir) {
  c.fillStyle = 'rgba(255,255,255,0.08)';
  c.beginPath(); c.arc(rect.x + rect.w / 2, rect.y + rect.h / 2, 7, 0, Math.PI * 2); c.fill();
  c.fillStyle = 'rgba(255,255,255,0.4)';
  c.font = 'bold 10px system-ui, sans-serif';
  c.textAlign = 'center'; c.textBaseline = 'middle';
  const arrow = collapsed
    ? (expandDir === 'up' ? '▲' : expandDir === 'down' ? '▼' : expandDir === 'left' ? '◀' : '▶')
    : (expandDir === 'up' ? '▼' : expandDir === 'down' ? '▲' : expandDir === 'left' ? '▶' : '◀');
  c.fillText(arrow, rect.x + rect.w / 2, rect.y + rect.h / 2 + 0.5);
}

function hitToggleButton(px, py, rect) {
  if (!rect) return false;
  return px >= rect.x && px <= rect.x + rect.w && py >= rect.y && py <= rect.y + rect.h;
}

// ── UI object ──

const UI = {
  hoveredShopIndex: -1,
  hoveredTroopIndex: -1,
  shopScrollY: 0,
  _prevShopScrollY: 0,
  _cardAreaBottom: 0,

  _toggleShop: null,
  _toggleHud: null,
  _togglePreview: null,
  _ghostPos: {x:0, y:0},
  _tileScratch: {gx:0, gy:0},

  updateHover(px, py) {
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
  },

  shopCardRect(i) {
  const gap = LAYOUT.SHOP.CARD_GAP;
  const x = LAYOUT.SHOP.BTN_PAD;
  const cardH = LAYOUT.SHOP.CARD_H;
  const cardW = UI_LAYOUT.SHOP_WIDTH - 24;
  const baseY = UI_LAYOUT.hudHeight + 8 + i * (cardH + gap);
  return { x, y: baseY - this.shopScrollY, w: cardW, h: cardH };
  },

  // Zero-allocation variant for rendering loops.
  shopCardRectInto(i, out) {
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
},

  hitShop(px, py) {
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
  },

  handleToggleClick(px, py) {
    if (UI._toggleShieldShop && hitToggleButton(px, py, UI._toggleShieldShop)) {
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
  },

  drawHUD(game) {
    const c = RENDERER.ctx;
    const w = RENDERER.width;

    this._toggleHud = null;

    if (UI_LAYOUT.collapsed.hud) {
      c.fillStyle = UI_COLORS.panelBg;
      c.fillRect(0, 0, w, 20);
      c.fillStyle = UI_COLORS.panelBorder;
      c.fillRect(0, 20, w, 1);
      c.fillStyle = UI_COLORS.textDim;
      c.font = '8px system-ui, sans-serif';
      c.textAlign = 'left'; c.textBaseline = 'middle';
      c.fillText('HUD', 6, 10);
      const btnRect = { x: w - 22, y: 2, w: 16, h: 16 };
      this._toggleHud = btnRect;
      drawToggleButton(c, btnRect, true, 'down');
      c.textBaseline = 'alphabetic';
      return;
    }

    c.fillStyle = UI_COLORS.panelBg;
    c.fillRect(0, 0, w, UI_LAYOUT.HUD_HEIGHT);
    c.fillStyle = UI_COLORS.panelBorder;
    c.fillRect(0, UI_LAYOUT.HUD_HEIGHT, w, 1);

    const btnRect = { x: w - 22, y: 6, w: 16, h: 16 };
    this._toggleHud = btnRect;
    drawToggleButton(c, btnRect, false, 'up');

    // Set textBaseline once for the whole HUD.
    c.textBaseline = 'middle';

    // Gold.
    const goldX = 14;

    c.beginPath();
    c.fillStyle = UI_COLORS.gold;
    c.arc(goldX + 8, 28, 7, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = '#0c1219';
    c.font = 'bold 10px system-ui, sans-serif';
    c.textAlign = 'center';
    c.fillText('G', goldX + 8, 28);
    c.fillStyle = UI_COLORS.textBright;
    c.textAlign = 'left';
    c.font = '15px system-ui, sans-serif';
    c.fillText(game.devMode ? '\u221E' : String(game.gold), goldX + 20, 28);

    // Lives.
    const livesX = 120;
    c.fillStyle = UI_COLORS.heart;
    c.font = '16px system-ui, sans-serif';
    c.textAlign = 'left';
    c.fillText('\u2764', livesX, 28);
    c.fillStyle = UI_COLORS.textBright;
    c.font = '15px system-ui, sans-serif';
    c.fillText(String(game.lives), livesX + 18, 28);

    // Wave.
    const waveX = 200;
    c.fillStyle = UI_COLORS.textBright;
    c.font = 'bold 15px system-ui, sans-serif';
    c.textAlign = 'left';
    c.fillText('Wave ' + (game.wave.currentWave + 1), waveX, 28);


    // Reset button.
    const rstX = 310, rstW = 36;
    c.fillStyle = 'rgba(255,255,255,0.04)';
    UIRoundRect(c, rstX, 14, rstW, 28, 6);
    c.fill();
    c.strokeStyle = 'rgba(255,255,255,0.1)';
    c.lineWidth = 1;
    UIRoundRect(c, rstX, 14, rstW, 28, 6);
    c.stroke();
    c.fillStyle = UI_COLORS.textDim;
    c.font = 'bold 10px system-ui, sans-serif';
    c.textAlign = 'center';
    c.fillText('RST', rstX + rstW / 2, 28);

    // Speed.
    let sx = w - LAYOUT.HUD.SPEED_OFFSET;
    c.fillStyle = UI_COLORS.textDim;
    c.font = '11px system-ui, sans-serif';
    c.textAlign = 'left';
    c.fillText('Speed:', sx - 50, 28);
    for (let i = 0; i < CONFIG.GAME_SPEEDS.length; i++) {
      const rx = sx + i * 28;
      const active = game.speed === CONFIG.GAME_SPEEDS[i];
      c.fillStyle = active ? 'rgba(88,166,255,0.15)' : 'rgba(255,255,255,0.04)';
      UIRoundRect(c, rx, 14, 26, 28, 5);
      c.fill();
      if (active) {
        c.strokeStyle = 'rgba(88,166,255,0.4)';
        c.lineWidth = 1;
        UIRoundRect(c, rx, 14, 26, 28, 5);
        c.stroke();
      }
      c.fillStyle = active ? UI_COLORS.accent : UI_COLORS.textDim;
      c.font = '10px system-ui, sans-serif';
      c.textAlign = 'center';
      c.fillText(CONFIG.GAME_SPEEDS[i] + 'x', rx + 13, 28);
    }

    // Start / pause / resume.
    const ctrlBtn = { x: w - LAYOUT.HUD.CTRL_RIGHT, y: LAYOUT.HUD.CTRL_BTN.y, w: LAYOUT.HUD.CTRL_BTN.w, h: LAYOUT.HUD.CTRL_BTN.h };
    const label = game.state === 'PRE_WAVE' ? 'Start Wave'
      : game.state === 'WAVE_ACTIVE' ? 'Pause'
      : game.state === 'PAUSED' ? 'Resume'
      : '';
    if (label) {
      const isStart = game.state === 'PRE_WAVE' || game.state === 'PAUSED';
      c.fillStyle = isStart ? 'rgba(46,160,67,0.15)' : 'rgba(218,54,51,0.15)';
      UIRoundRect(c, ctrlBtn.x, ctrlBtn.y, ctrlBtn.w, ctrlBtn.h, 6);
      c.fill();
      c.strokeStyle = isStart ? 'rgba(46,160,67,0.3)' : 'rgba(218,54,51,0.3)';
      c.lineWidth = 1;
      UIRoundRect(c, ctrlBtn.x, ctrlBtn.y, ctrlBtn.w, ctrlBtn.h, 6);
      c.stroke();
      c.fillStyle = isStart ? UI_COLORS.green : UI_COLORS.red;
      c.font = 'bold 11px system-ui, sans-serif';
      c.textAlign = 'center';
      c.fillText(label, ctrlBtn.x + ctrlBtn.w / 2, ctrlBtn.y + ctrlBtn.h / 2 + 1);
    }

    // Monsters left count.
    if (game.state === 'WAVE_ACTIVE' || game.state === 'PAUSED') {
      c.fillStyle = UI_COLORS.textDim;
      c.font = '11px system-ui, sans-serif';
      c.textAlign = 'left';
      c.fillText((game.monsters.length + game.wave.monstersRemainingThisWave) + ' monsters', sx - 130, 28);
    }

    // Wave 10+ scaling indicator.
    if (game.wave.currentWave >= 10) {
      c.fillStyle = UI_COLORS.red;
      c.font = 'bold 11px system-ui, sans-serif';
      c.textAlign = 'left';
      c.fillText('x' + game.wave.currentMultiplier.toFixed(2), 375, 28);
    }

    c.textBaseline = 'alphabetic';
  },

  drawShop(game) {
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
      c.font = '8px system-ui, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
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

    const btnRect = { x: 221, y: UI_LAYOUT.hudHeight + 5, w: 16, h: 16 };
    this._toggleShop = btnRect;
    drawToggleButton(c, btnRect, false, 'left');

    // Shop header.
    c.fillStyle = UI_COLORS.textDim;
    c.font = '10px system-ui, sans-serif';
    c.textAlign = 'left'; c.textBaseline = 'middle';
    c.fillText('TROOPS', 12, UI_LAYOUT.hudHeight + 16);

    // Compute card area bounds and clamp scroll
    const CARD_H = LAYOUT.SHOP.CARD_H, CARD_GAP = LAYOUT.SHOP.CARD_GAP;
    const totalContentH = TROOP_SPECS.length * (CARD_H + CARD_GAP) - CARD_GAP;
    const areaTop = UI_LAYOUT.hudHeight + 8;
    // 6px margin between shop cards and the selected troop info panel below.
    const areaBottom = game.selectedTroopIndex >= 0 ? RENDERER.height - 210 : RENDERER.height - UI_LAYOUT.previewHeight;
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

      // Card background.
      c.fillStyle = isSelected ? UI_COLORS.cardSelect : (isHovered ? UI_COLORS.cardHover : UI_COLORS.cardBg);
      UIRoundRect(c, r.x, r.y, r.w, r.h, 8);
      c.fill();

      // Color dot.
      c.fillStyle = spec.color;
      c.beginPath(); c.arc(r.x + 16, r.y + 16, 5, 0, Math.PI * 2); c.fill();

      // Name + hotkey.
      c.fillStyle = affordable ? UI_COLORS.textBright : UI_COLORS.textDim;
      c.font = 'bold 12px system-ui, sans-serif';
      c.textAlign = 'left'; c.textBaseline = 'middle';
      c.fillText(spec.name, r.x + 26, r.y + 14);

      // Cost.
      c.fillStyle = affordable ? UI_COLORS.gold : UI_COLORS.textDim;
      c.font = '11px system-ui, sans-serif';
      c.fillText(spec.cost + 'g', r.x + 26, r.y + 32);

      // Hotkey badge.
      c.fillStyle = 'rgba(88,166,255,0.12)';
      UIRoundRect(c, r.x + r.w - 32, r.y + 5, 24, 20, 5);
      c.fill();
      c.fillStyle = UI_COLORS.accent;
      c.font = 'bold 11px system-ui, sans-serif';
      c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillText(spec.hotkey, r.x + r.w - 20, r.y + 15);

      // Spec stats below.
      c.fillStyle = UI_COLORS.textDim;
      c.font = '10px system-ui, sans-serif';
      c.textAlign = 'left'; c.textBaseline = 'middle';
      c.fillText(spec._statsStr, r.x + 14, r.y + 48);

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
        const panelY = RENDERER.height - 204;
        const panelH = 72;
        c.fillStyle = UI_COLORS.cardBg;
        UIRoundRect(c, 8, panelY, UI_LAYOUT.SHOP_WIDTH - 16, panelH, 8);
        c.fill();
        c.strokeStyle = UI_COLORS.panelBorder;
        c.lineWidth = 1;
        UIRoundRect(c, 8, panelY, UI_LAYOUT.SHOP_WIDTH - 16, panelH, 8);
        c.stroke();

        c.fillStyle = UI_COLORS.textBright;
        c.font = 'bold 12px system-ui, sans-serif';
        c.textAlign = 'left'; c.textBaseline = 'middle';
        c.fillText(t.spec.name, 18, panelY + 14);

        c.fillStyle = UI_COLORS.textDim;
        c.font = '10px system-ui, sans-serif';
        c.fillText('DMG ' + t.getDamage() + ' Lv.' + t.dmgLevel + '  SPD ' + t.getAttackSpeed() + 's Lv.' + t.speedLevel, 18, panelY + 26);
        c.fillText('RNG ' + t.getRange() + ' Lv.' + t.rangeLevel + (t.spec.chain ? '  CHN ' + t.getChain() + ' Lv.' + t.chainLevel : ''), 18, panelY + 38);
        if (t.spec.slowFactor) {
          c.fillText('SLW ' + (t.getSlowFactor() * 100).toFixed(0) + '% ' + t.getSlowDuration() + 's Lv.' + t.slowLevel, 18, panelY + 38);
        }
        // HP line.
        const hpColor = t.getHpRatio() > 0.6 ? '#44cc44' : t.getHpRatio() > 0.3 ? '#cccc44' : '#cc4444';
        c.fillStyle = hpColor;
        c.fillText('HP ' + Math.ceil(t.hp) + '/' + t.maxHp, 18, panelY + 50);
        c.fillStyle = UI_COLORS.textDim;

        const dps = (t.getDamage() / t.getAttackSpeed()).toFixed(1);
        c.fillStyle = UI_COLORS.accent;
        c.font = 'bold 10px system-ui, sans-serif';
        c.fillText('DPS ' + dps, 18, panelY + 64);

        // Upgrade buttons.
        const stats = ['dmg', 'range', 'speed', 'chain', 'slow', 'hp'];
        const statLabels = { dmg: 'DMG', range: 'RNG', speed: 'SPD', chain: 'CHN', slow: 'SLW', hp: 'HP' };
        const statColors = { dmg: '#e74c3c', range: '#2ea043', speed: '#58a6ff', chain: UI_COLORS.gold, slow: '#7fdbff', hp: '#44cc44' };
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
        const statBtnW = visibleCount > 0 ? Math.floor((UI_LAYOUT.SHOP_WIDTH - btnPad * 2 - btnGap * (visibleCount - 1)) / visibleCount) : 49;
        let visibleBtnIdx = 0;
        for (let i = 0; i < stats.length; i++) {
          const stat = stats[i];
          // Skip inapplicable stats entirely.
          if (!t.canUpgrade(stat)) continue;
          const cost = t.getUpgradeCost(stat);
          const affordable = game.devMode || game.gold >= cost;
          const btn = { x: btnPad + visibleBtnIdx * (statBtnW + btnGap), y: btnY, w: statBtnW, h: LAYOUT.SHOP.UPGRADE_BTN_H };
          visibleBtnIdx++;

          if (t.isMaxed(stat)) {
            c.fillStyle = 'rgba(255,255,255,0.04)';
            UIRoundRect(c, btn.x, btn.y, btn.w, btn.h, 6);
            c.fill();
            c.fillStyle = UI_COLORS.textDim;
            c.font = 'bold 8px system-ui, sans-serif';
            c.textAlign = 'center'; c.textBaseline = 'middle';
            c.fillText(statLabels[stat], btn.x + btn.w / 2, btn.y + 12);
            c.fillStyle = 'rgba(255,255,255,0.15)';
            c.font = '7px system-ui, sans-serif';
            c.fillText('MAX', btn.x + btn.w / 2, btn.y + 27);
          } else {
            c.fillStyle = affordable ? statColors[stat] : 'rgba(255,255,255,0.04)';
            UIRoundRect(c, btn.x, btn.y, btn.w, btn.h, 6);
            c.fill();
            if (!affordable) {
              c.strokeStyle = 'rgba(255,255,255,0.06)';
              c.lineWidth = 1;
              UIRoundRect(c, btn.x, btn.y, btn.w, btn.h, 6);
              c.stroke();
            }
            c.fillStyle = affordable ? '#fff' : UI_COLORS.textDim;
            c.font = 'bold 9px system-ui, sans-serif';
            c.textAlign = 'center'; c.textBaseline = 'middle';
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
          c.fillStyle = 'rgba(255,255,255,0.04)';
          UIRoundRect(c, LAYOUT.SHOP.BTN_PAD, healBtnY, healBtnW, LAYOUT.SHOP.HEAL_BTN_H, 6);
          c.fill();
          c.strokeStyle = 'rgba(255,255,255,0.06)';
          c.lineWidth = 1;
          UIRoundRect(c, LAYOUT.SHOP.BTN_PAD, healBtnY, healBtnW, LAYOUT.SHOP.HEAL_BTN_H, 6);
          c.stroke();
          c.fillStyle = UI_COLORS.textDim;
          c.font = 'bold 9px system-ui, sans-serif';
          c.textAlign = 'center'; c.textBaseline = 'middle';
          c.fillText('HEAL  MAX HP', LAYOUT.SHOP.BTN_PAD + healBtnW / 2, healBtnY + 14);
        } else {
          // Can heal — show cost and HP
          c.fillStyle = healAffordable ? '#2ea043' : 'rgba(255,255,255,0.04)';
          UIRoundRect(c, LAYOUT.SHOP.BTN_PAD, healBtnY, healBtnW, LAYOUT.SHOP.HEAL_BTN_H, 6);
          c.fill();
          if (!healAffordable) {
            c.strokeStyle = 'rgba(255,255,255,0.06)';
            c.lineWidth = 1;
            UIRoundRect(c, LAYOUT.SHOP.BTN_PAD, healBtnY, healBtnW, LAYOUT.SHOP.HEAL_BTN_H, 6);
            c.stroke();
          }
          c.fillStyle = healAffordable ? '#fff' : UI_COLORS.textDim;
          c.font = 'bold 10px system-ui, sans-serif';
          c.textAlign = 'center'; c.textBaseline = 'middle';
          c.fillText('HEAL  +' + Math.ceil(t.maxHp * 0.1) + ' HP', LAYOUT.SHOP.BTN_PAD + healBtnW / 2, healBtnY + 10);
          c.fillStyle = healAffordable ? 'rgba(255,255,255,0.7)' : UI_COLORS.textDim;
          c.font = '8px system-ui, sans-serif';
          c.fillText('(' + healCost + 'g)  ' + t.getHpPercent() + '% HP', LAYOUT.SHOP.BTN_PAD + healBtnW / 2, healBtnY + 22);
        }

        // Sell button with cooldown indicator.
        const sellBtn = { x: LAYOUT.SHOP.BTN_PAD, y: RENDERER.height - LAYOUT.SHOP.SELL_BTN_Y_OFFSET, w: UI_LAYOUT.SHOP_WIDTH - LAYOUT.SHOP.SEW, h: LAYOUT.SHOP.SELL_BTN_H };
        const isDevDelete = game.devMode;
        const cd = game.sellCooldownTimer || 0;
        const onCooldown = cd > 0 && !isDevDelete;

        if (isDevDelete) {
          c.fillStyle = 'rgba(218,54,51,0.15)';
        } else if (onCooldown) {
          c.fillStyle = 'rgba(128,128,128,0.12)';
        } else {
          c.fillStyle = 'rgba(212,118,30,0.12)';
        }
        UIRoundRect(c, sellBtn.x, sellBtn.y, sellBtn.w, sellBtn.h, 6);
        c.fill();
        if (isDevDelete) {
          c.strokeStyle = 'rgba(218,54,51,0.25)';
        } else if (onCooldown) {
          c.strokeStyle = 'rgba(128,128,128,0.2)';
        } else {
          c.strokeStyle = 'rgba(212,118,30,0.2)';
        }
        c.lineWidth = 1;
        UIRoundRect(c, sellBtn.x, sellBtn.y, sellBtn.w, sellBtn.h, 6);
        c.stroke();
        c.fillStyle = isDevDelete ? UI_COLORS.red : (onCooldown ? UI_COLORS.textDim : UI_COLORS.orange);
        c.font = 'bold 10px system-ui, sans-serif';
        c.textAlign = 'center'; c.textBaseline = 'middle';

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
  },

  drawShieldShop(game) {
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
      c.font = '8px system-ui, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
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
    c.textAlign = 'left'; c.textBaseline = 'middle';
    c.fillText('SHOP', panelX + 12, panelY + 16);

    // Buy card centered in the panel.
    const cardX = panelX + 10;
    const cardY = panelY + 32;
    const cardW = panelW - 20;
    const cardH = 58;
    c.fillStyle = UI_COLORS.cardBg;
    UIRoundRect(c, cardX, cardY, cardW, cardH, 8);
    c.fill();
    c.strokeStyle = 'rgba(93,173,226,0.25)';
    c.lineWidth = 1;
    UIRoundRect(c, cardX, cardY, cardW, cardH, 8);
    c.stroke();

    // Determine selected troop state for the strict 4-way button chain AND the
    // info line below — compute early so the info text is drawn before the button.
    const _selIdxEarly = game.selectedTroopIndex;
    const _tEarly = _selIdxEarly >= 0 ? game.troops[_selIdxEarly] : null;
    const _hasSelEarly = !!(_tEarly && _tEarly.alive);
    let _infoText;
    if (!_hasSelEarly) {
      _infoText = 'Select a troop to buy shield';
    } else if (_tEarly.shield > 0) {
      // Compute waves remaining until shield expires. Shields expire at the
      // start of wave 11, 21, 31, ... (boss waves + 1), so remaining = 10 - (currentWave % 10).
      const _cw = game.wave.currentWave;
      const _wavesLeft = CONFIG.SHIELD_EXPIRE_WAVES - (_cw % CONFIG.SHIELD_EXPIRE_WAVES);
      _infoText = 'Shield: +100% HP   Expires in: ' + _wavesLeft + ' waves';
    } else {
      const _cost = _tEarly.getShieldCost();
      _infoText = 'Shield: +100% HP   Cost: ' + _cost + 'g   Lasts: ' + CONFIG.SHIELD_EXPIRE_WAVES + ' waves';
    }
    c.fillStyle = UI_COLORS.textDim;
    c.font = '8px system-ui, sans-serif';
    c.textAlign = 'left'; c.textBaseline = 'middle';
    c.fillText(_infoText, cardX + 8, cardY + 10);

    // Buy button rect — STASH for game.js click handler.
    const buyBtnY = cardY + cardH - 32;
    const buyBtnH = 28;
    const buyBtnRect = { x: cardX, y: buyBtnY, w: cardW, h: buyBtnH };
    this._shieldBuyBtn = buyBtnRect;

    // Determine selected troop state for the strict 4-way button chain.
    const selIdx = game.selectedTroopIndex;
    const t = selIdx >= 0 ? game.troops[selIdx] : null;
    const hasSelection = !!(t && t.alive);
    let cost = 0;
    let canAfford = false;
    if (hasSelection) {
      cost = t.getShieldCost();
      canAfford = game.devMode || game.gold >= cost;
    }

    // Strict if/else if/else if/else chain for the four button states.
    if (!hasSelection) {
      // a) No troop selected or not alive — greyed out.
      c.fillStyle = 'rgba(255,255,255,0.04)';
      UIRoundRect(c, buyBtnRect.x, buyBtnRect.y, buyBtnRect.w, buyBtnRect.h, 6);
      c.fill();
      c.strokeStyle = 'rgba(255,255,255,0.06)';
      c.lineWidth = 1;
      UIRoundRect(c, buyBtnRect.x, buyBtnRect.y, buyBtnRect.w, buyBtnRect.h, 6);
      c.stroke();
      c.fillStyle = UI_COLORS.textDim;
      c.font = 'bold 10px system-ui, sans-serif';
      c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillText('SELECT A TROOP', buyBtnRect.x + buyBtnRect.w / 2, buyBtnRect.y + buyBtnRect.h / 2);
    } else if (t.shield > 0) {
      // b) Shield already active — cyan-tinted.
      c.fillStyle = 'rgba(93,173,226,0.18)';
      UIRoundRect(c, buyBtnRect.x, buyBtnRect.y, buyBtnRect.w, buyBtnRect.h, 6);
      c.fill();
      c.strokeStyle = 'rgba(93,173,226,0.45)';
      c.lineWidth = 1;
      UIRoundRect(c, buyBtnRect.x, buyBtnRect.y, buyBtnRect.w, buyBtnRect.h, 6);
      c.stroke();
      c.fillStyle = '#5dade2';
      c.font = 'bold 11px system-ui, sans-serif';
      c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillText('ACTIVE', buyBtnRect.x + buyBtnRect.w / 2, buyBtnRect.y + buyBtnRect.h / 2);
    } else if (!canAfford) {
      // c) Can't afford — greyed out with cost.
      c.fillStyle = 'rgba(255,255,255,0.04)';
      UIRoundRect(c, buyBtnRect.x, buyBtnRect.y, buyBtnRect.w, buyBtnRect.h, 6);
      c.fill();
      c.strokeStyle = 'rgba(255,255,255,0.06)';
      c.lineWidth = 1;
      UIRoundRect(c, buyBtnRect.x, buyBtnRect.y, buyBtnRect.w, buyBtnRect.h, 6);
      c.stroke();
      c.fillStyle = UI_COLORS.textDim;
      c.font = 'bold 10px system-ui, sans-serif';
      c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillText('BUY SHIELD (' + cost + 'g)', buyBtnRect.x + buyBtnRect.w / 2, buyBtnRect.y + buyBtnRect.h / 2);
    } else {
      // d) Can buy — bright cyan button.
      c.fillStyle = 'rgba(93,173,226,0.28)';
      UIRoundRect(c, buyBtnRect.x, buyBtnRect.y, buyBtnRect.w, buyBtnRect.h, 6);
      c.fill();
      c.strokeStyle = 'rgba(93,173,226,0.6)';
      c.lineWidth = 1;
      UIRoundRect(c, buyBtnRect.x, buyBtnRect.y, buyBtnRect.w, buyBtnRect.h, 6);
      c.stroke();
      c.fillStyle = '#5dade2';
      c.font = 'bold 11px system-ui, sans-serif';
      c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillText('BUY SHIELD', buyBtnRect.x + buyBtnRect.w / 2, buyBtnRect.y + buyBtnRect.h / 2);
    }

    // Status line below the card. Shield state is now shown in the info text
    // inside the card, so the status line is just the selected troop name.
    c.fillStyle = UI_COLORS.textDim;
    c.font = '9px system-ui, sans-serif';
    c.textAlign = 'center'; c.textBaseline = 'middle';
    const statusName = hasSelection ? t.spec.name : 'none';
    c.fillText('Selected: ' + statusName, cardX + cardW / 2, cardY + cardH + 14);

    c.textBaseline = 'alphabetic';
  },

  _drawShopTooltip(c, r, spec) {
  if (!spec.desc) return;
  c.save();
  c.font = '11px system-ui, sans-serif';
  const rawLines = this._wrapText(c, spec.desc, RENDERER.width - r.w - 60, 11, 'system-ui, sans-serif');
  const maxTextW = Math.max(...rawLines.map(l => c.measureText(l).width), 0);
  c.restore();
  const padX = 14, padTop = 10, padBot = 12, lineH = 14, gap = 6;
  const desired = maxTextW + padX * 2;
  const tipW = Math.min(Math.max(r.w + 40, desired), RENDERER.width - r.w - 60);
  const tipH = padTop + padBot + rawLines.length * lineH;
  const tipX = (r.x + r.w + gap*2 + tipW > RENDERER.width)
    ? r.x - tipW - gap*2
    : r.x + r.w + gap*2;
  const tipY = r.y;
  if (tipY + tipH > RENDERER.height - 10) {
    tipY = Math.max(0, RENDERER.height - 10 - tipH);
  }
  c.save();
  c.fillStyle = 'rgba(10,16,22,0.96)';
  UIRoundRect(c, tipX, tipY, tipW, tipH, 8); c.fill();
  c.strokeStyle = 'rgba(88,166,255,0.18)'; c.lineWidth = 1;
  UIRoundRect(c, tipX + 0.5, tipY + 0.5, tipW - 1, tipH - 1, 8); c.stroke();
  c.fillStyle = '#c9d1d9';
  c.font = '11px system-ui, sans-serif';
  c.textAlign = 'left'; c.textBaseline = 'middle';
  for (let j = 0; j < rawLines.length; j++) {
    c.fillText(rawLines[j], tipX + padX, tipY + padTop + 6 + j * lineH);
  }
  c.restore();
  },

  _wrapText(c, text, maxW, fontSize, font) {
    c.save();
    c.font = fontSize + 'px ' + font;
    const words = text.split(' ');
    const lines = [];
    let current = '';
    for (const word of words) {
      const test = current ? current + ' ' + word : word;
      const metrics = c.measureText(test);
      if (metrics.width > maxW) {
        if (current) {
          lines.push(current);
          current = word;
        } else {
          lines.push(word);
        }
      } else {
        current = test;
      }
    }
    if (current) lines.push(current);
    c.restore();
    return lines;
  },

  drawPreview(game) {
    const c = RENDERER.ctx;
    const w = RENDERER.width;

    this._togglePreview = null;

    if (UI_LAYOUT.collapsed.preview) {
      const y = RENDERER.height - 20;
      c.fillStyle = UI_COLORS.panelBg;
      c.fillRect(UI_LAYOUT.shopWidth, y, w - UI_LAYOUT.shopWidth, 20);
      c.fillStyle = UI_COLORS.panelBorder;
      c.fillRect(UI_LAYOUT.shopWidth, y, w - UI_LAYOUT.shopWidth, 1);
      c.fillStyle = UI_COLORS.textDim;
      c.font = '8px system-ui, sans-serif';
      c.textAlign = 'left'; c.textBaseline = 'middle';
      c.fillText('WAVE', UI_LAYOUT.shopWidth + 6, y + 10);
      const btnRect = { x: w - 22, y: y + 2, w: 16, h: 16 };
      this._togglePreview = btnRect;
      drawToggleButton(c, btnRect, true, 'up');
      c.textBaseline = 'alphabetic';
      return;
    }

    const y = RENDERER.height - UI_LAYOUT.PREVIEW_HEIGHT;
    c.fillStyle = UI_COLORS.panelBg;
    c.fillRect(UI_LAYOUT.shopWidth, y, w - UI_LAYOUT.shopWidth, UI_LAYOUT.PREVIEW_HEIGHT);
    c.fillStyle = UI_COLORS.panelBorder;
    c.fillRect(UI_LAYOUT.shopWidth, y, w - UI_LAYOUT.shopWidth, 1);

    const btnRect = { x: w - 22, y: y + 4, w: 16, h: 16 };
    this._togglePreview = btnRect;
    drawToggleButton(c, btnRect, false, 'down');

    c.fillStyle = UI_COLORS.textDim;
    c.font = '10px system-ui, sans-serif';
    c.textAlign = 'left'; c.textBaseline = 'middle';
    c.fillText('Next Wave', UI_LAYOUT.shopWidth + 12, y + 16);

    const preview = game.wave.getNextWavePreview();
    if (!preview) {
      c.fillStyle = UI_COLORS.textDim;
      c.font = '12px system-ui, sans-serif';
      c.fillText('Prepare...', UI_LAYOUT.shopWidth + 90, y + 18);
      return;
    }
    let cx = UI_LAYOUT.shopWidth + 90;
    const rightEdge = w - UI_LAYOUT.shieldShopWidth - 8; // leave room for shield shop panel
    for (const [level, count] of preview) {
      if (cx + 80 > rightEdge) break;
      const key = level === 'B' ? 'B' : level;
      const spec = MONSTER_SPECS[key];
      c.fillStyle = spec.color;
      c.beginPath(); c.arc(cx + 8, y + 18, 6, 0, Math.PI * 2); c.fill();
      c.fillStyle = UI_COLORS.textBody;
      c.font = '12px system-ui, sans-serif';
      c.textAlign = 'left'; c.textBaseline = 'middle';
      c.fillText('x' + count, cx + 18, y + 18);
      c.fillStyle = UI_COLORS.textDim;
      c.font = '9px system-ui, sans-serif';
      c.fillText(spec.name, cx + 18, y + 34);
      cx += 80;
    }
    c.textBaseline = 'alphabetic';
  },

  drawPlacementGhost(game) {
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
    c.translate(RENDERER.offsetX, RENDERER.offsetY);
    c.scale(RENDERER.scale, RENDERER.scale);

    c.fillStyle = valid ? CONFIG.COLORS.buildableHover : CONFIG.COLORS.invalid;
    c.fillRect(tile.gx * CONFIG.TILE_SIZE, tile.gy * CONFIG.TILE_SIZE,
      CONFIG.TILE_SIZE, CONFIG.TILE_SIZE);

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
  },

  drawSelectedTroopRange(game) {
    if (game.selectedTroopIndex < 0) return;
    const t = game.troops[game.selectedTroopIndex];
    if (!t || !t.alive) return;
    const c = RENDERER.ctx;
    c.save();
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
  },

  drawWaveTransition(game) {
    if (!game.waveCompleteAnim || !game.waveCompleteAnim.active) return;
    const a = game.waveCompleteAnim;
    const elapsed = (performance.now() - a.startMs) / 1000;
    const totalTime = 2.5;
    a.t = totalTime - elapsed;
    if (a.t <= 0) {
      a.active = false;
      return;
    }

    const c = RENDERER.ctx;
    const progress = 1 - a.t / totalTime;
    // Fade in 0.0-0.2, hold 0.2-0.8, fade out 0.8-1.0
    let alpha = 0;
    if (progress < 0.2) alpha = progress / 0.2;
    else if (progress < 0.8) alpha = 1;
    else alpha = (1 - progress) / 0.2;
    alpha = Math.max(0, Math.min(1, alpha));

    const cx = RENDERER.width / 2;
    const cy = RENDERER.height / 2;

    // Flash overlay
    c.save();
    c.globalAlpha = alpha * 0.25;
    c.fillStyle = UI_COLORS.accent;
    c.fillRect(0, 0, RENDERER.width, RENDERER.height);
    c.globalAlpha = alpha;

    // Text
    c.fillStyle = UI_COLORS.textBright;
    c.font = 'bold 32px system-ui, sans-serif';
    c.textAlign = 'center'; c.textBaseline = 'middle';
    c.shadowColor = 'rgba(0,0,0,0.5)';
    c.shadowBlur = 10;
    c.shadowOffsetX = 0;
    c.shadowOffsetY = 4;
    c.fillText('Wave ' + a.waveNum + ' Complete', cx, cy - 10);

    // Subtle "Ready" text
    c.font = '16px system-ui, sans-serif';
    c.fillStyle = UI_COLORS.textDim;
    c.shadowBlur = 0;
    c.fillText('Get ready for the next wave', cx, cy + 16);

    c.restore();
  },

  drawOverlay(game) {
    if (game.state !== 'DEFEAT') return;
    const c = RENDERER.ctx;
    c.fillStyle = 'rgba(0,0,0,0.7)';
    c.fillRect(0, 0, RENDERER.width, RENDERER.height);
    c.fillStyle = UI_COLORS.red;
    c.font = 'bold 52px system-ui, sans-serif';
    c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText('DEFEAT', RENDERER.width / 2, RENDERER.height / 2 - 14);
    c.fillStyle = UI_COLORS.textDim;
    c.font = '14px system-ui, sans-serif';
    c.fillText('Press R to restart', RENDERER.width / 2, RENDERER.height / 2 + 28);
    c.textBaseline = 'alphabetic';
  },

  drawDevConfirmDialog(game) {
    if (!game.devConfirmPending && !game.resetConfirmPending && !game.sellConfirmPending) return;
    const c = RENDERER.ctx;
    c.fillStyle = 'rgba(0,0,0,0.6)';
    c.fillRect(0, 0, RENDERER.width, RENDERER.height);

    const pw = 380, ph = 170;
    const px = (RENDERER.width - pw) / 2;
    const py = (RENDERER.height - ph) / 2;

    c.fillStyle = '#111a24';
    UIRoundRect(c, px, py, pw, ph, 12);
    c.fill();
    c.strokeStyle = 'rgba(88,166,255,0.2)';
    c.lineWidth = 1;
    UIRoundRect(c, px, py, pw, ph, 12);
    c.stroke();

    c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillStyle = UI_COLORS.textBright;
    c.font = 'bold 15px system-ui, sans-serif';
    if (game.sellConfirmPending) {
      c.fillText('Sell ' + (game.sellConfirmTroopIndex?.spec?.name || 'troop') + ' for ' + Math.round(CONFIG.SELL_REFUND_RATIO * 100) + '% refund?', RENDERER.width / 2, py + 45);
      c.fillStyle = UI_COLORS.textDim;
      c.font = '12px system-ui, sans-serif';
      c.fillText('Sold troops cannot be recovered.', RENDERER.width / 2, py + 70);
    } else if (game.resetConfirmPending) {
      c.fillText('Reset game?', RENDERER.width / 2, py + 45);
      c.fillStyle = UI_COLORS.textDim;
      c.font = '12px system-ui, sans-serif';
      c.fillText('All progress will be lost.', RENDERER.width / 2, py + 70);
    } else {
      c.fillText('Toggle DEV mode?', RENDERER.width / 2, py + 45);
      c.fillStyle = UI_COLORS.textDim;
      c.font = '12px system-ui, sans-serif';
      c.fillText('This will restart the game.', RENDERER.width / 2, py + 70);
    }

    const btnW = 80, btnH = 36, gap = 20, totalW = btnW * 2 + gap;
    const btnY = py + ph - 60;
    const yesX = (RENDERER.width - totalW) / 2;
    const noX = yesX + btnW + gap;
    const yesColor = game.resetConfirmPending ? '#da3633' : '#2ea043';

    c.fillStyle = yesColor;
    UIRoundRect(c, yesX, btnY, btnW, btnH, 8);
    c.fill();
    c.fillStyle = '#fff';
    c.font = 'bold 11px system-ui, sans-serif';
    c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText(game.resetConfirmPending ? 'Reset' : 'Yes', yesX + btnW / 2, btnY + btnH / 2);

    c.fillStyle = 'rgba(255,255,255,0.08)';
    UIRoundRect(c, noX, btnY, btnW, btnH, 8);
    c.fill();
    c.fillStyle = UI_COLORS.textDim;
    c.fillText('No', noX + btnW / 2, btnY + btnH / 2);

    this._devConfirmYes = { x: yesX, y: btnY, w: btnW, h: btnH };
    this._devConfirmNo = { x: noX, y: btnY, w: btnW, h: btnH };
    c.textBaseline = 'alphabetic';
  },

  drawDevRightPanel(game) {
    if (!game.devMode) return;
    if (game.state === 'WAVE_ACTIVE') return;
    const c = RENDERER.ctx;
    const pW = 220;
    const pH = 310;
    const pX = RENDERER.width - pW - 12 - UI_LAYOUT.shieldShopWidth;
    const pY = UI_LAYOUT.hudHeight + 50;

    this._devRightPanelRect = { x: pX, y: pY, w: pW, h: pH };

    c.fillStyle = '#111a24';
    UIRoundRect(c, pX, pY, pW, pH, 10);
    c.fill();
    c.strokeStyle = 'rgba(88,166,255,0.15)';
    c.lineWidth = 1;
    UIRoundRect(c, pX, pY, pW, pH, 10);
    c.stroke();

    c.fillStyle = UI_COLORS.textBright;
    c.font = 'bold 11px system-ui, sans-serif';
    c.textAlign = 'left'; c.textBaseline = 'middle';
    c.fillText('Spawn Monsters', pX + 12, pY + 18);

    const levels = [1, 2, 3, 4, 5, 'B', 'S'];
    const rowH = 28;
    const btnW = 22;
    this._devRightButtons = [];
    for (let i = 0; i < levels.length; i++) {
      const level = levels[i];
      const ry = pY + 34 + i * rowH;
      const spec = MONSTER_SPECS[level];
      c.fillStyle = spec.color;
      c.beginPath(); c.arc(pX + 16, ry + rowH / 2, 5, 0, Math.PI * 2); c.fill();
      c.fillStyle = UI_COLORS.textBody;
      c.font = '10px system-ui, sans-serif';
      c.textAlign = 'left'; c.textBaseline = 'middle';
      c.fillText(spec.name + ' x' + (game.devMonsterCounts[level] || 0), pX + 28, ry + rowH / 2);

      const row = { level };
      for (const [tag, dx] of [['m10', -80], ['m1', -58], ['p1', -36], ['p10', -14]]) {
        const bx = pX + pW - 12 + dx;
        const btn = { x: bx, y: ry + 2, w: btnW, h: rowH - 4 };
        c.fillStyle = 'rgba(255,255,255,0.06)';
        UIRoundRect(c, btn.x, btn.y, btn.w, btn.h, 4);
        c.fill();
        c.fillStyle = UI_COLORS.textDim;
        c.font = 'bold 9px system-ui, sans-serif';
        c.textAlign = 'center'; c.textBaseline = 'middle';
        c.fillText(tag.replace('m', '-').replace('p', '+'), btn.x + btn.w / 2, btn.y + btn.h / 2);
        row[tag] = btn;
      }
      this._devRightButtons.push(row);
    }

    const stX = pX + 12, stY = pY + pH - 40, stW = pW - 24, stH = 30;
    this._devRightStartBtn = { x: stX, y: stY, w: stW, h: stH };
    c.fillStyle = 'rgba(46,160,67,0.15)';
    UIRoundRect(c, stX, stY, stW, stH, 8);
    c.fill();
    c.strokeStyle = 'rgba(46,160,67,0.3)';
    c.lineWidth = 1;
    UIRoundRect(c, stX, stY, stW, stH, 8);
    c.stroke();
    c.fillStyle = UI_COLORS.green;
    c.font = 'bold 11px system-ui, sans-serif';
    c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText('Start Custom Wave', stX + stW / 2, stY + stH / 2);

    const rstX = pX + 12, rstY = stY - 32, rstW = pW - 24, rstH = 22;
    this._devRightResetBtn = { x: rstX, y: rstY, w: rstW, h: rstH };
    c.fillStyle = 'rgba(255,255,255,0.04)';
    UIRoundRect(c, rstX, rstY, rstW, rstH, 6);
    c.fill();
    c.fillStyle = UI_COLORS.textDim;
    c.font = '9px system-ui, sans-serif';
    c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText('Reset counts to defaults', rstX + rstW / 2, rstY + rstH / 2);
  },
};

window.UI_LAYOUT = UI_LAYOUT;
window.UI = UI;
window.UIRoundRect = UIRoundRect;
window.drawToggleButton = drawToggleButton;
window.hitToggleButton = hitToggleButton;

})();