// UI: HUD + shop + overlays. All drawing is done against the same canvas; we
// divide the screen into regions and render with fixed coordinates.

const UI_LAYOUT = {
  HUD_HEIGHT: 56,
  SHOP_WIDTH: 220,
  PREVIEW_HEIGHT: 80,
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

// ── UI object ──

const UI = {
  hoveredShopIndex: -1,
  hoveredTroopIndex: -1,

  updateHover(px, py) {
    if (px == null || py == null) {
      this.hoveredShopIndex = -1;
      return;
    }
    this.hoveredShopIndex = this.hitShop(px, py);
  },

  shopCardRect(i) {
    const cardW = 200, cardH = 52, gap = 4;
    const x = 8;
    const y = UI_LAYOUT.HUD_HEIGHT + 8 + i * (cardH + gap);
    return { x, y, w: cardW, h: cardH };
  },

  hitShop(px, py) {
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

  drawHUD(game) {
    const c = RENDERER.ctx;
    const w = RENDERER.width;

    // Bottom edge border for visual separation.
    c.fillStyle = UI_COLORS.panelBg;
    c.fillRect(0, 0, w, UI_LAYOUT.HUD_HEIGHT);
    c.fillStyle = UI_COLORS.panelBorder;
    c.fillRect(0, UI_LAYOUT.HUD_HEIGHT, w, 1);

    // Gold icon + amount.
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
    c.fillStyle = UI_COLORS.textDim;
    c.font = '11px system-ui, sans-serif';
    c.textAlign = 'left';
    c.fillText('WAVE', waveX, 18);
    c.fillStyle = UI_COLORS.textBright;
    c.font = 'bold 18px system-ui, sans-serif';
    c.fillText(game.wave.currentWave + 1, waveX, 42);

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
    const btn = { x: w - 116, y: 12, w: 90, h: 32 };
    const label = game.state === 'PRE_WAVE' ? 'Start Wave'
      : game.state === 'WAVE_ACTIVE' ? 'Pause'
      : game.state === 'PAUSED' ? 'Resume'
      : '';
    if (label) {
      const isStart = game.state === 'PRE_WAVE' || game.state === 'PAUSED';
      c.fillStyle = isStart ? 'rgba(46,160,67,0.15)' : 'rgba(218,54,51,0.15)';
      UIRoundRect(c, btn.x, btn.y, btn.w, btn.h, 6);
      c.fill();
      c.strokeStyle = isStart ? 'rgba(46,160,67,0.3)' : 'rgba(218,54,51,0.3)';
      c.lineWidth = 1;
      UIRoundRect(c, btn.x, btn.y, btn.w, btn.h, 6);
      c.stroke();
      c.fillStyle = isStart ? UI_COLORS.green : UI_COLORS.red;
      c.font = 'bold 11px system-ui, sans-serif';
      c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillText(label, btn.x + btn.w / 2, btn.y + btn.h / 2 + 1);
    }

    // Monsters left — during active wave.
    if (game.state === 'WAVE_ACTIVE' || game.state === 'PAUSED') {
      c.fillStyle = UI_COLORS.textDim;
      c.font = '11px system-ui, sans-serif';
      c.textAlign = 'right'; c.textBaseline = 'bottom';
      c.fillText(game.wave.monstersRemainingThisWave + ' monsters',
        w - 210, UI_LAYOUT.HUD_HEIGHT - 5);
    }
    c.textBaseline = 'alphabetic';
  },

  drawShop(game) {
    const c = RENDERER.ctx;
    const h = RENDERER.height;

    // Background panel.
    c.fillStyle = UI_COLORS.panelBg;
    c.fillRect(0, UI_LAYOUT.HUD_HEIGHT, UI_LAYOUT.SHOP_WIDTH, h - UI_LAYOUT.HUD_HEIGHT);

    // Shop header.
    c.fillStyle = UI_COLORS.textDim;
    c.font = '10px system-ui, sans-serif';
    c.textAlign = 'left'; c.textBaseline = 'middle';
    c.fillText('TROOPS', 12, UI_LAYOUT.HUD_HEIGHT + 16);

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
    }

    // ── Selected troop info panel ──
    if (game.selectedTroopIndex >= 0) {
      const t = game.troops[game.selectedTroopIndex];
      if (t && t.alive) {
        const panelY = RENDERER.height - 174;
        // Panel bg.
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
        const statBtnW = 49;
        const btnY = RENDERER.height - 100;
        for (let i = 0; i < stats.length; i++) {
          const stat = stats[i];
          const cost = t.getUpgradeCost(stat);
          const affordable = game.devMode || game.gold >= cost;
          const btn = { x: 8 + i * (statBtnW + 2), y: btnY, w: statBtnW, h: 36 };

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

        // Sell button.
        const sellBtn = { x: 8, y: RENDERER.height - 58, w: 200, h: 34 };
        const isDevDelete = game.devMode;
        c.fillStyle = isDevDelete ? 'rgba(218,54,51,0.15)' : 'rgba(212,118,30,0.12)';
        UIRoundRect(c, sellBtn.x, sellBtn.y, sellBtn.w, sellBtn.h, 6);
        c.fill();
        c.strokeStyle = isDevDelete ? 'rgba(218,54,51,0.25)' : 'rgba(212,118,30,0.2)';
        c.lineWidth = 1;
        UIRoundRect(c, sellBtn.x, sellBtn.y, sellBtn.w, sellBtn.h, 6);
        c.stroke();
        c.fillStyle = isDevDelete ? UI_COLORS.red : UI_COLORS.orange;
        c.font = 'bold 10px system-ui, sans-serif';
        c.textAlign = 'center'; c.textBaseline = 'middle';
        if (isDevDelete) {
          c.fillText('Delete ' + t.spec.name, sellBtn.x + sellBtn.w / 2, sellBtn.y + sellBtn.h / 2);
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

  drawPreview(game) {
    const c = RENDERER.ctx;
    const w = RENDERER.width;
    const y = RENDERER.height - UI_LAYOUT.PREVIEW_HEIGHT;
    c.fillStyle = UI_COLORS.panelBg;
    c.fillRect(UI_LAYOUT.SHOP_WIDTH, y, w - UI_LAYOUT.SHOP_WIDTH, UI_LAYOUT.PREVIEW_HEIGHT);
    c.fillStyle = UI_COLORS.panelBorder;
    c.fillRect(UI_LAYOUT.SHOP_WIDTH, y, w - UI_LAYOUT.SHOP_WIDTH, 1);

    c.fillStyle = UI_COLORS.textDim;
    c.font = '10px system-ui, sans-serif';
    c.textAlign = 'left'; c.textBaseline = 'middle';
    c.fillText('Next Wave', UI_LAYOUT.SHOP_WIDTH + 12, y + 16);

    const preview = game.wave.getNextWavePreview();
    if (!preview) {
      c.fillStyle = UI_COLORS.textDim;
      c.font = '12px system-ui, sans-serif';
      c.fillText('Prepare...', UI_LAYOUT.SHOP_WIDTH + 90, y + 18);
      return;
    }
    let cx = UI_LAYOUT.SHOP_WIDTH + 90;
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
    if (RENDERER.hoverPx < UI_LAYOUT.SHOP_WIDTH) return;
    if (RENDERER.hoverPy < UI_LAYOUT.HUD_HEIGHT) return;
    if (RENDERER.hoverPy > RENDERER.height - UI_LAYOUT.PREVIEW_HEIGHT) return;

    const c = RENDERER.ctx;
    const valid = game.canPlace(tile.gx, tile.gy, game.selectedSpec);
    c.save();
    c.translate(RENDERER.offsetX, RENDERER.offsetY);
    c.scale(RENDERER.scale, RENDERER.scale);

    // Tile highlight.
    c.fillStyle = valid ? CONFIG.COLORS.buildableHover : CONFIG.COLORS.invalid;
    c.fillRect(tile.gx * CONFIG.TILE_SIZE, tile.gy * CONFIG.TILE_SIZE,
      CONFIG.TILE_SIZE, CONFIG.TILE_SIZE);

    // Range circle.
    const center = tileCenter(tile.gx, tile.gy);
    c.strokeStyle = valid ? 'rgba(88,166,255,0.5)' : 'rgba(220,80,80,0.5)';
    c.lineWidth = 1.5;
    c.setLineDash([4, 4]);
    c.beginPath();
    c.arc(center.x, center.y, (game.selectedSpec.range + 0.5) * CONFIG.TILE_SIZE, 0, Math.PI * 2);
    c.stroke();
    c.setLineDash([]);

    // Troop ghost.
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

    const pw = 300, ph = 130;
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
      const t = game.troops[game.sellConfirmTroopIndex];
      c.fillText('Sell ' + (t ? t.spec.name : 'Troop') + '?', px + pw / 2, py + 34);
      c.fillStyle = UI_COLORS.orange;
      c.font = '12px system-ui, sans-serif';
      c.fillText('This cannot be undone.', px + pw / 2, py + 56);
    } else if (game.resetConfirmPending) {
      c.fillText('Reset Game?', px + pw / 2, py + 34);
      c.fillStyle = UI_COLORS.red;
      c.font = '12px system-ui, sans-serif';
      c.fillText('All progress will be lost.', px + pw / 2, py + 56);
    } else {
      c.fillText(game.devMode ? 'Disable Dev Mode?' : 'Enable Dev Mode?', px + pw / 2, py + 34);
      c.fillStyle = UI_COLORS.textDim;
      c.font = '12px system-ui, sans-serif';
      c.fillText('Game will reset.', px + pw / 2, py + 56);
    }

    // Yes button.
    const yesColor = game.sellConfirmPending ? UI_COLORS.orange : (game.devMode || game.resetConfirmPending ? UI_COLORS.red : UI_COLORS.green);
    c.fillStyle = yesColor;
    UIRoundRect(c, px + 40, py + 80, 90, 32, 6);
    c.fill();
    c.fillStyle = '#fff';
    c.font = 'bold 12px system-ui, sans-serif';
    c.fillText('Yes', px + 85, py + 96);
    this._devConfirmYes = { x: px + 40, y: py + 80, w: 90, h: 32 };

    // No button.
    c.fillStyle = 'rgba(255,255,255,0.06)';
    UIRoundRect(c, px + 170, py + 80, 90, 32, 6);
    c.fill();
    c.fillStyle = UI_COLORS.textBody;
    c.font = '12px system-ui, sans-serif';
    c.fillText('No', px + 215, py + 96);
    this._devConfirmNo = { x: px + 170, y: py + 80, w: 90, h: 32 };

    c.textAlign = 'left'; c.textBaseline = 'alphabetic';
  },

  drawDevRightPanel(game) {
    if (!game.devMode || game.state !== 'PRE_WAVE') return;
    const c = RENDERER.ctx;
    const order = [1, 2, 3, 4, 5, 'B'];
    const names = {1:'Grunt',2:'Runner',3:'Brute',4:'Elite',5:'Champ','B':'Boss'};
    const panelW = 220;
    const rowH = 26;
    const headerH = 20;
    const btnH = 34;
    const panelH = 6 + headerH + order.length * rowH + 6 + btnH + 6;
    const px = RENDERER.width - panelW - 6;
    const py = UI_LAYOUT.HUD_HEIGHT + 6;

    // Panel bg.
    c.fillStyle = UI_COLORS.cardBg;
    UIRoundRect(c, px, py, panelW, panelH, 8);
    c.fill();
    c.strokeStyle = 'rgba(88,166,255,0.2)';
    c.lineWidth = 1;
    UIRoundRect(c, px, py, panelW, panelH, 8);
    c.stroke();

    // Header.
    c.fillStyle = UI_COLORS.gold;
    c.font = 'bold 11px system-ui, sans-serif';
    c.textAlign = 'left'; c.textBaseline = 'middle';
    c.fillText('DEV \u2014 Wave ' + (game.wave.currentWave + 1), px + 10, py + 10);

    // Rows.
    const rows = [];
    const contentX = px + 10;
    for (let i = 0; i < order.length; i++) {
      const level = order[i];
      const ry = py + headerH + 4 + i * rowH;
      const count = game.devMonsterCounts[level] || 0;

      c.fillStyle = MONSTER_SPECS[level].color;
      c.beginPath(); c.arc(contentX + 5, ry + rowH / 2, 4, 0, Math.PI * 2); c.fill();

      c.fillStyle = UI_COLORS.textBody;
      c.font = '10px system-ui, sans-serif';
      c.textAlign = 'left'; c.textBaseline = 'middle';
      c.fillText(names[level], contentX + 13, ry + rowH / 2);

      c.fillStyle = UI_COLORS.gold;
      c.font = 'bold 11px system-ui, sans-serif';
      c.textAlign = 'center';
      c.fillText(count, contentX + 70, ry + rowH / 2);

      // Buttons.
      var btnDefs = [
        { tag:'m10', lbl:'-10', x: contentX + 84, w: 30 },
        { tag:'m1',  lbl:'-1',  x: contentX + 116, w: 22 },
        { tag:'p1',  lbl:'+1',  x: contentX + 140, w: 22 },
        { tag:'p10', lbl:'+10', x: contentX + 164, w: 30 },
      ];
      var row = { level: level };
      for (const bd of btnDefs) {
        const br = { x: bd.x, y: ry + 3, w: bd.w, h: rowH - 6 };
        c.fillStyle = 'rgba(255,255,255,0.04)';
        UIRoundRect(c, br.x, br.y, br.w, br.h, 4);
        c.fill();
        c.fillStyle = UI_COLORS.textDim;
        c.font = '9px system-ui, sans-serif';
        c.textAlign = 'center'; c.textBaseline = 'middle';
        c.fillText(bd.lbl, br.x + br.w / 2, br.y + br.h / 2);
        row[bd.tag] = br;
      }
      rows.push(row);
    }
    this._devRightButtons = rows;
    this._devRightPanelRect = { x: px, y: py, w: panelW, h: panelH };

    // Start Wave button.
    const startY = py + headerH + 4 + order.length * rowH + 6;
    c.fillStyle = UI_COLORS.green;
    UIRoundRect(c, px + 10, startY, panelW - 20, btnH, 6);
    c.fill();
    c.fillStyle = '#fff';
    c.font = 'bold 11px system-ui, sans-serif';
    c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText('Start Wave', px + panelW / 2, startY + btnH / 2);
    this._devRightStartBtn = { x: px + 10, y: startY, w: panelW - 20, h: btnH };

    c.textAlign = 'left'; c.textBaseline = 'alphabetic';
  },
};