// UI: HUD + shop + overlays. All drawing is done against the same canvas; we
// divide the screen into regions and render with fixed coordinates.

const UI_LAYOUT = {
  HUD_HEIGHT: 56,
  SHOP_WIDTH: 220,
  PREVIEW_HEIGHT: 80,

  // Collapsible section states
  collapsed: {
    shop: false,
    hud: false,
    preview: false,
    help: false,
  },

  // Effective dimensions accounting for collapsed state
  get hudHeight() { return this.collapsed.hud ? 0 : this.HUD_HEIGHT; },
  get shopWidth() { return this.collapsed.shop ? 0 : this.SHOP_WIDTH; },
  get previewHeight() { return this.collapsed.preview ? 0 : this.PREVIEW_HEIGHT; },
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

// ── Toggle button helper ──
function toggleBtnRect(side, panelRect) {
  const s = 16;
  if (side === 'left') return { x: panelRect.x, y: panelRect.y + 4, w: s, h: s };
  if (side === 'right') return { x: panelRect.x + panelRect.w - s, y: panelRect.y + 4, w: s, h: s };
  if (side === 'bottom') return { x: panelRect.x + panelRect.w - s - 4, y: panelRect.y + 4, w: s, h: s };
  return { x: panelRect.x + panelRect.w - s - 4, y: panelRect.y + 4, w: s, h: s };
}

function drawToggleButton(c, rect, collapsed, expandDir) {
  c.fillStyle = 'rgba(255,255,255,0.08)';
  c.beginPath(); c.arc(rect.x + rect.w / 2, rect.y + rect.h / 2, 7, 0, Math.PI * 2); c.fill();
  c.fillStyle = 'rgba(255,255,255,0.4)';
  c.font = 'bold 10px system-ui, sans-serif';
  c.textAlign = 'center'; c.textBaseline = 'middle';
  const arrow = collapsed ? '◀' : expandDir === 'up' ? '▼' : expandDir === 'down' ? '▲' : '▶';
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

  _toggleShop: null,
  _toggleHud: null,
  _togglePreview: null,
  _toggleHelp: null,

  updateHover(px, py) {
    if (px == null || py == null) {
      this.hoveredShopIndex = -1;
      return;
    }
    this.hoveredShopIndex = this.hitShop(px, py);
  },

  shopCardRect(i) {
    const cardW = 200, cardH = 58, gap = 4;
    const x = 8;
    const y = UI_LAYOUT.hudHeight + 8 + i * (cardH + gap);
    return { x, y, w: cardW, h: cardH };
  },

  hitShop(px, py) {
    if (UI_LAYOUT.collapsed.shop) return -1;
    for (let i = 0; i < TROOP_SPECS.length; i++) {
      const r = this.shopCardRect(i);
      if (px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h) return i;
    }
    return -1;
  },

  hitTroopOnMap(px, py, game) {
    for (let i = 0; i < game.troops.length; i++) {
      const t = game.troops[i];
      if (!t.alive) continue;
      const dx = px - t.x, dy = py - t.y;
      if (dx * dx + dy * dy <= (CONFIG.TILE_SIZE * 0.5) * (CONFIG.TILE_SIZE * 0.5)) return i;
    }
    return -1;
  },

  handleToggleClick(px, py) {
    if (this._toggleHud && hitToggleButton(px, py, this._toggleHud)) {
      UI_LAYOUT.collapsed.hud = !UI_LAYOUT.collapsed.hud;
      RENDERER.resize(document.getElementById('game'));
      return true;
    }
    if (this._toggleShop && hitToggleButton(px, py, this._toggleShop)) {
      UI_LAYOUT.collapsed.shop = !UI_LAYOUT.collapsed.shop;
      RENDERER.resize(document.getElementById('game'));
      return true;
    }
    if (this._toggleHelp && hitToggleButton(px, py, this._toggleHelp)) {
      UI_LAYOUT.collapsed.help = !UI_LAYOUT.collapsed.help;
      const helpEl = document.getElementById('help');
      if (helpEl) helpEl.style.display = UI_LAYOUT.collapsed.help ? 'none' : '';
      return true;
    }
    if (this._togglePreview && hitToggleButton(px, py, this._togglePreview)) {
      UI_LAYOUT.collapsed.preview = !UI_LAYOUT.collapsed.preview;
      RENDERER.resize(document.getElementById('game'));
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
      return;
    }

    c.fillStyle = UI_COLORS.panelBg;
    c.fillRect(0, 0, w, UI_LAYOUT.HUD_HEIGHT);
    c.fillStyle = UI_COLORS.panelBorder;
    c.fillRect(0, UI_LAYOUT.HUD_HEIGHT, w, 1);

    const btnRect = { x: w - 22, y: 6, w: 16, h: 16 };
    this._toggleHud = btnRect;
    drawToggleButton(c, btnRect, false, 'up');

    // Gold.
    const goldX = 14;
    c.fillStyle = UI_COLORS.gold;
    c.beginPath(); c.arc(goldX + 8, 28, 7, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#0c1219';
    c.font = 'bold 10px system-ui, sans-serif';
    c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText('G', goldX + 8, 28);
    c.fillStyle = UI_COLORS.textBright;
    c.textAlign = 'left';
    c.font = '15px system-ui, sans-serif';
    c.fillText(game.devMode ? '∞' : String(game.gold), goldX + 20, 28);

    // Lives.
    const livesX = 120;
    c.fillStyle = UI_COLORS.heart;
    c.font = '16px system-ui, sans-serif';
    c.textAlign = 'left';
    c.fillText('❤', livesX, 28);
    c.fillStyle = UI_COLORS.textBright;
    c.font = '15px system-ui, sans-serif';
    c.fillText(String(game.lives), livesX + 18, 28);

    // Wave.
    const waveX = 200;
    c.fillStyle = UI_COLORS.textBright;
    c.font = 'bold 15px system-ui, sans-serif';
    c.textAlign = 'left'; c.textBaseline = 'middle';
    c.fillText('Wave ' + (game.wave.currentWave + 1), waveX, 28);

    // DEV button.
    const devX = 260, devW = 44;
    const devActive = game.devMode;
    c.fillStyle = devActive ? 'rgba(241,196,15,0.15)' : 'rgba(255,255,255,0.04)';
    UIRoundRect(c, devX, 14, devW, 28, 6);
    c.fill();
    c.strokeStyle = devActive ? UI_COLORS.gold : 'rgba(255,255,255,0.1)';
    c.lineWidth = 1;
    UIRoundRect(c, devX, 14, devW, 28, 6);
    c.stroke();
    c.fillStyle = devActive ? UI_COLORS.gold : UI_COLORS.textDim;
    c.font = 'bold 10px system-ui, sans-serif';
    c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText('DEV', devX + devW / 2, 28);

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
    c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText('RST', rstX + rstW / 2, 28);

    // Speed.
    const speeds = [1, 2, 4, 8, 16, 32, 64, 128];
    let sx = w - 370;
    c.fillStyle = UI_COLORS.textDim;
    c.font = '11px system-ui, sans-serif';
    c.textAlign = 'left'; c.textBaseline = 'middle';
    c.fillText('Speed:', sx - 50, 28);
    for (let i = 0; i < speeds.length; i++) {
      const rx = sx + i * 28;
      const active = game.speed === speeds[i];
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
      c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillText(speeds[i] + 'x', rx + 13, 28);
    }

    // Start / pause / resume.
    const ctrlBtn = { x: w - 116, y: 12, w: 90, h: 32 };
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
      c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillText(label, ctrlBtn.x + ctrlBtn.w / 2, ctrlBtn.y + ctrlBtn.h / 2 + 1);
    }

    // Monsters left count.
    if (game.state === 'WAVE_ACTIVE' || game.state === 'PAUSED') {
      c.fillStyle = UI_COLORS.textDim;
      c.font = '11px system-ui, sans-serif';
      c.textAlign = 'left'; c.textBaseline = 'middle';
      c.fillText((game.monsters.length + game.wave.monstersRemainingThisWave) + ' monsters', sx - 130, 28);
    }

    // Wave 10+ scaling indicator.
    if (game.wave.currentWave >= 10) {
      c.fillStyle = UI_COLORS.red;
      c.font = 'bold 11px system-ui, sans-serif';
      c.textAlign = 'left'; c.textBaseline = 'middle';
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
      return;
    }

    // Background panel.
    c.fillStyle = UI_COLORS.panelBg;
    c.fillRect(0, UI_LAYOUT.hudHeight, UI_LAYOUT.SHOP_WIDTH, h - UI_LAYOUT.hudHeight);

    const btnRect = { x: 209, y: UI_LAYOUT.hudHeight + 7, w: 10, h: 10 };
    this._toggleShop = btnRect;
    drawToggleButton(c, btnRect, false, 'left');

    // Shop header.
    c.fillStyle = UI_COLORS.textDim;
    c.font = '10px system-ui, sans-serif';
    c.textAlign = 'left'; c.textBaseline = 'middle';
    c.fillText('TROOPS', 12, UI_LAYOUT.hudHeight + 16);

    for (let i = 0; i < TROOP_SPECS.length; i++) {
      const spec = TROOP_SPECS[i];
      const r = this.shopCardRect(i);
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
      const statsStr = spec.type.charAt(0).toUpperCase() + spec.type.slice(1) + ' \u00B7 ' + spec.damage + 'dmg \u00B7 ' + spec.range + 'rng \u00B7 ' + spec.attackSpeed + 's';
      c.fillText(statsStr, r.x + 14, r.y + 48);

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

    // ── Selected troop info panel ──
    if (game.selectedTroopIndex >= 0) {
      const t = game.troops[game.selectedTroopIndex];
      if (t && t.alive) {
        const panelY = RENDERER.height - 174;
        c.fillStyle = UI_COLORS.cardBg;
        UIRoundRect(c, 8, panelY, 200, 70, 8);
        c.fill();
        c.strokeStyle = UI_COLORS.panelBorder;
        c.lineWidth = 1;
        UIRoundRect(c, 8, panelY, 200, 70, 8);
        c.stroke();

        c.fillStyle = UI_COLORS.textBright;
        c.font = 'bold 12px system-ui, sans-serif';
        c.textAlign = 'left'; c.textBaseline = 'middle';
        c.fillText(t.spec.name, 18, panelY + 18);

        c.fillStyle = UI_COLORS.textDim;
        c.font = '10px system-ui, sans-serif';
        c.fillText('DMG ' + t.getDamage() + ' Lv.' + t.dmgLevel + '  SPD ' + t.getAttackSpeed() + 's Lv.' + t.speedLevel, 18, panelY + 36);
        c.fillText('RNG ' + t.getRange() + ' Lv.' + t.rangeLevel + (t.spec.chain ? '  CHN ' + t.getChain() + ' Lv.' + t.chainLevel : ''), 18, panelY + 52);

        // Upgrade buttons.
        const stats = ['dmg', 'range', 'speed', 'chain'];
        const statLabels = { dmg: 'DMG', range: 'RNG', speed: 'SPD', chain: 'CHN' };
        const statColors = { dmg: '#e74c3c', range: '#2ea043', speed: '#58a6ff', chain: UI_COLORS.gold };
        const btnY = RENDERER.height - 100;
        const btnPad = 8;
        const btnGap = 2;
        // Count visible buttons first to compute dynamic width.
        let visibleCount = 0;
        for (const stat of stats) {
          if (stat === 'range' && t.spec.type === 'melee') continue;
          if (stat === 'chain' && t.spec.id !== 'lightning') continue;
          visibleCount++;
        }
        const statBtnW = visibleCount > 0 ? Math.floor((UI_LAYOUT.SHOP_WIDTH - btnPad * 2 - btnGap * (visibleCount - 1)) / visibleCount) : 49;
        let visibleBtnIdx = 0;
        for (let i = 0; i < stats.length; i++) {
          const stat = stats[i];
          // Skip inapplicable stats entirely.
          if (stat === 'range' && t.spec.type === 'melee') continue;
          if (stat === 'chain' && t.spec.id !== 'lightning') continue;
          const cost = t.getUpgradeCost(stat);
          const affordable = game.devMode || game.gold >= cost;
          const btn = { x: btnPad + visibleBtnIdx * (statBtnW + btnGap), y: btnY, w: statBtnW, h: 36 };
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

        // Sell button with cooldown indicator.
        const sellBtn = { x: 8, y: RENDERER.height - 58, w: 200, h: 34 };
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

  _drawShopTooltip(c, r, spec) {
    if (!spec.desc) return;
    const lines = this._wrapText(c, spec.desc, r.w + 40, 11, 'system-ui, sans-serif');
    const lineH = 14;
    const tipW = r.w + 40;
    const tipH = 20 + lines.length * lineH;
    const tipX = r.x + r.w + 4;
    const tipY = r.y;

    c.save();
    // Semi-transparent tip background
    c.fillStyle = 'rgba(16, 26, 36, 0.95)';
    UIRoundRect(c, tipX, tipY, tipW, tipH, 8);
    c.fill();
    c.strokeStyle = 'rgba(88,166,255,0.2)';
    c.lineWidth = 1;
    UIRoundRect(c, tipX, tipY, tipW, tipH, 8);
    c.stroke();

    c.fillStyle = UI_COLORS.textBody;
    c.font = '11px system-ui, sans-serif';
    c.textAlign = 'left'; c.textBaseline = 'middle';
    for (let j = 0; j < lines.length; j++) {
      c.fillText(lines[j], tipX + 8, tipY + 12 + j * lineH);
    }
    c.restore();
  },

  _wrapText(c, text, maxW, fontSize, font) {
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
    for (const [level, count] of preview) {
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
  },

  drawPlacementGhost(game) {
    if (!game.selectedSpec) return;
    if (RENDERER.hoverPx == null) return;
    const w = RENDERER.toWorld(RENDERER.hoverPx, RENDERER.hoverPy);
    const tile = pixelToTile(w.x, w.y);
    if (!inBounds(tile.gx, tile.gy)) return;
    if (RENDERER.hoverPx < UI_LAYOUT.shopWidth) return;
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

    const center = tileCenter(tile.gx, tile.gy);
    c.strokeStyle = valid ? 'rgba(88,166,255,0.5)' : 'rgba(220,80,80,0.5)';
    c.lineWidth = 1.5;
    c.setLineDash([4, 4]);
    c.beginPath();
    c.arc(center.x, center.y, (game.selectedSpec.range + 0.5) * CONFIG.TILE_SIZE, 0, Math.PI * 2);
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
    c.strokeStyle = 'rgba(88,166,255,0.35)';
    c.lineWidth = 1.5;
    c.setLineDash([5, 5]);
    c.beginPath();
    c.arc(t.x, t.y, (t.getRange() + 0.5) * CONFIG.TILE_SIZE, 0, Math.PI * 2);
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
    if (game.state !== 'VICTORY' && game.state !== 'DEFEAT') return;
    const c = RENDERER.ctx;
    c.fillStyle = 'rgba(0,0,0,0.7)';
    c.fillRect(0, 0, RENDERER.width, RENDERER.height);
    c.fillStyle = game.state === 'VICTORY' ? UI_COLORS.green : UI_COLORS.red;
    c.font = 'bold 52px system-ui, sans-serif';
    c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText(game.state === 'VICTORY' ? 'VICTORY' : 'DEFEAT',
      RENDERER.width / 2, RENDERER.height / 2 - 14);
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

    const pw = 340, ph = 170;
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
      c.fillText('Sell ' + (game.troops[game.sellConfirmTroopIndex]?.spec?.name || 'troop') + ' for 50% refund?', RENDERER.width / 2, py + 45);
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
    const pW = 180;
    const pH = 240;
    const pX = RENDERER.width - pW - 12;
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

    const levels = [1, 2, 3, 4, 5, 'B'];
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
    c.fillStyle = 'rgba(255,255,255,0.04)';
    UIRoundRect(c, rstX, rstY, rstW, rstH, 6);
    c.fill();
    c.fillStyle = UI_COLORS.textDim;
    c.font = '9px system-ui, sans-serif';
    c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText('Reset counts to defaults', rstX + rstW / 2, rstY + rstH / 2);
  },
};