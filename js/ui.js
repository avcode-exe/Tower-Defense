// UI: HUD + shop + overlays. All drawing is done against the same canvas; we
// divide the screen into regions and render with fixed coordinates.

const UI_LAYOUT = {
  HUD_HEIGHT: 56,
  SHOP_WIDTH: 220,
  PREVIEW_HEIGHT: 80,
  // Map area is centered.
};

const UI = {
  hoveredShopIndex: -1,
  hoveredTroopIndex: -1,

  // Called from Game.render each frame to refresh shop card hover state.
  updateHover(px, py) {
    if (px == null || py == null) {
      this.hoveredShopIndex = -1;
      return;
    }
    this.hoveredShopIndex = this.hitShop(px, py);
  },

  // Returns the rect (in screen pixels) of the shop card at index i, or null.
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
    // Background bar.
    c.fillStyle = CONFIG.COLORS.hud;
    c.fillRect(0, 0, w, UI_LAYOUT.HUD_HEIGHT);

    // Gold.
    c.fillStyle = CONFIG.COLORS.gold;
    c.beginPath(); c.arc(20, 28, 8, 0, Math.PI * 2); c.fill();
    c.fillStyle = CONFIG.COLORS.hudText;
    c.font = '16px system-ui, sans-serif';
    c.textAlign = 'left'; c.textBaseline = 'middle';
    c.fillText(game.devMode ? '\u221E' : String(game.gold), 34, 28);

    // Lives (heart).
    c.fillStyle = CONFIG.COLORS.heart;
    c.font = '18px system-ui, sans-serif';
    c.fillText('♥', 110, 28);
    c.fillStyle = CONFIG.COLORS.hudText;
    c.fillText(String(game.lives), 128, 28);

    // Wave.
    c.fillStyle = CONFIG.COLORS.hudText;
    c.fillText('Wave ' + (game.wave.currentWave + 1), 180, 28);

    // DEV mode toggle.
    const devX = 260, devW = 44;
    c.fillStyle = game.devMode ? '#f1c40f' : '#333a44';
    c.fillRect(devX, 14, devW, 28);
    c.strokeStyle = game.devMode ? '#f1c40f' : '#7a8893';
    c.lineWidth = 1;
    c.strokeRect(devX, 14, devW, 28);
    c.fillStyle = game.devMode ? '#0e1418' : '#e6edf3';
    c.font = 'bold 10px system-ui, sans-serif';
    c.textAlign = 'center';
    c.fillText('DEV', devX + devW / 2, 28);
    this._devBtnRect = { x: devX, y: 14, w: devW, h: 28 };

    // Reset button.
    const rstX = 310, rstW = 36;
    c.fillStyle = '#444';
    c.fillRect(rstX, 14, rstW, 28);
    c.strokeStyle = '#7a8893';
    c.lineWidth = 1;
    c.strokeRect(rstX, 14, rstW, 28);
    c.fillStyle = '#e6edf3';
    c.font = 'bold 9px system-ui, sans-serif';
    c.textAlign = 'center';
    c.fillText('RST', rstX + rstW / 2, 28);
    this._rstBtnRect = { x: rstX, y: 14, w: rstW, h: 28 };

    // Speed.
    const speeds = [1, 2, 4, 8, 16, 32, 64, 128];
    const speedW = speeds.length * 28;
    let sx = w - 370;
    c.fillStyle = CONFIG.COLORS.hudText;
    c.fillText('Speed:', sx - 50, 28);
    for (let i = 0; i < speeds.length; i++) {
      const r = { x: sx + i * 28, y: 14, w: 26, h: 28 };
      c.fillStyle = game.speed === speeds[i] ? CONFIG.COLORS.hudAccent : '#222a33';
      c.fillRect(r.x, r.y, r.w, r.h);
      c.strokeStyle = CONFIG.COLORS.hudAccent;
      c.strokeRect(r.x, r.y, r.w, r.h);
      c.fillStyle = CONFIG.COLORS.hudText;
      c.font = '11px system-ui, sans-serif';
      c.textAlign = 'center';
      c.fillText(speeds[i] + 'x', r.x + r.w / 2, r.y + r.h / 2);
    }

    // Start wave / pause button.
    const btn = { x: w - 116, y: 14, w: 90, h: 28 };
    const label = game.state === 'PRE_WAVE' ? 'Start Wave'
      : game.state === 'WAVE_ACTIVE' ? 'Pause'
      : game.state === 'PAUSED' ? 'Resume'
      : '';
    if (label) {
      c.fillStyle = game.state === 'PRE_WAVE' || game.state === 'PAUSED' ? '#27ae60' : '#c0392b';
      c.fillRect(btn.x, btn.y, btn.w, btn.h);
      c.fillStyle = '#fff';
      c.font = '13px system-ui, sans-serif';
      c.textAlign = 'center';
      c.fillText(label, btn.x + btn.w / 2, btn.y + btn.h / 2);
    }

    // Top-right status text.
    if (game.state === 'WAVE_ACTIVE' || game.state === 'PAUSED') {
      c.fillStyle = CONFIG.COLORS.hudText;
      c.font = '12px system-ui, sans-serif';
      c.textAlign = 'right';
      c.fillText('Monsters left: ' + game.wave.monstersRemainingThisWave,
        w - 250, UI_LAYOUT.HUD_HEIGHT - 6);
    }
    c.textAlign = 'left';
  },

  drawShop(game) {
    const c = RENDERER.ctx;
    const h = RENDERER.height;
    // Background panel.
    c.fillStyle = '#0a0e12';
    c.fillRect(0, UI_LAYOUT.HUD_HEIGHT, UI_LAYOUT.SHOP_WIDTH, h - UI_LAYOUT.HUD_HEIGHT);

    c.fillStyle = CONFIG.COLORS.hudText;
    c.font = '13px system-ui, sans-serif';
    c.textAlign = 'left';
    c.fillText('SHOP', 10, UI_LAYOUT.HUD_HEIGHT + 18);

    for (let i = 0; i < TROOP_SPECS.length; i++) {
      const spec = TROOP_SPECS[i];
      const r = this.shopCardRect(i);
      const affordable = game.gold >= spec.cost;
      const isSelected = game.selectedSpec === spec;
      const isHovered = this.hoveredShopIndex === i;
      // Card background.
      c.fillStyle = isSelected ? '#1a3a5c' : (isHovered ? '#16202a' : '#11171d');
      c.fillRect(r.x, r.y, r.w, r.h);
      // Color stripe.
      c.fillStyle = spec.color;
      c.fillRect(r.x, r.y, 6, r.h);
      // Name + cost.
      c.fillStyle = affordable ? CONFIG.COLORS.hudText : '#7a8893';
      c.font = '13px system-ui, sans-serif';
      c.textAlign = 'left';
      c.fillText(spec.name, r.x + 14, r.y + 16);
      c.fillStyle = affordable ? CONFIG.COLORS.gold : '#7a8893';
      c.fillText(spec.cost + 'g', r.x + 14, r.y + 32);
      // Type + range.
      c.fillStyle = '#7a8893';
      c.font = '11px system-ui, sans-serif';
      c.fillText(spec.type + ' · rng ' + spec.range + ' · ' + spec.attackSpeed + 's · ' + spec.damage + 'dmg', r.x + 14, r.y + 48);
      c.font = '11px system-ui, sans-serif';
      // Hotkey.
      c.fillStyle = CONFIG.COLORS.hudAccent;
      c.font = 'bold 12px system-ui, sans-serif';
      c.textAlign = 'right';
      c.fillText('[' + spec.hotkey + ']', r.x + r.w - 8, r.y + 16);
      // Selected marker.
      if (isSelected) {
        c.strokeStyle = CONFIG.COLORS.selected;
        c.lineWidth = 2;
        c.strokeRect(r.x, r.y, r.w, r.h);
      }
    }
    c.textAlign = 'left';

    // Selected troop info panel + upgrade + sell.
    if (game.selectedTroopIndex >= 0) {
      const t = game.troops[game.selectedTroopIndex];
      if (t && t.alive) {
        // Stats panel.
        const panelY = RENDERER.height - 174;
        c.fillStyle = '#11171d';
        c.fillRect(8, panelY, 200, 68);
        c.strokeStyle = '#333';
        c.strokeRect(8, panelY, 200, 68);
        c.fillStyle = '#e6edf3';
        c.font = 'bold 12px system-ui, sans-serif';
        c.textAlign = 'left';
        c.fillText(t.spec.name, 14, panelY + 16);
        c.fillStyle = '#7a8893';
        c.font = '11px system-ui, sans-serif';
        c.fillText('Dmg: ' + t.getDamage() + ' Lv.' + t.dmgLevel + ' · Spd: ' + t.getAttackSpeed() + 's Lv.' + t.speedLevel, 14, panelY + 34);
        c.fillText('Range: ' + t.getRange() + ' Lv.' + t.rangeLevel + (t.spec.chain ? ' · Chn: ' + t.getChain() + ' Lv.' + t.chainLevel : ''), 14, panelY + 52);

        // Upgrade buttons — 4 stats (chain only shown for lightning).
        const stats = ['dmg', 'range', 'speed', 'chain'];
        const statLabels = { dmg: 'DMG', range: 'RNG', speed: 'SPD', chain: 'CHN' };
        const statColors = { dmg: '#e74c3c', range: '#2ecc71', speed: '#3498db', chain: '#f1c40f' };
        const statBtnW = 49;
        for (let i = 0; i < stats.length; i++) {
          const stat = stats[i];
          const cost = t.getUpgradeCost(stat);
          const affordable = game.devMode || game.gold >= cost;
          const btn = { x: 8 + i * (statBtnW + 2), y: RENDERER.height - 102, w: statBtnW, h: 36 };
          if (t.isMaxed(stat)) {
            c.fillStyle = '#333';
            c.fillRect(btn.x, btn.y, btn.w, btn.h);
            c.strokeStyle = '#555';
            c.strokeRect(btn.x, btn.y, btn.w, btn.h);
            c.fillStyle = '#666';
            c.font = 'bold 8px system-ui, sans-serif';
            c.textAlign = 'center';
            c.fillText(statLabels[stat] + ' MAX', btn.x + btn.w / 2, btn.y + btn.h / 2 + 3);
          } else {
            c.fillStyle = affordable ? statColors[stat] : '#444';
            c.fillRect(btn.x, btn.y, btn.w, btn.h);
            c.fillStyle = '#fff';
            c.font = 'bold 9px system-ui, sans-serif';
            c.textAlign = 'center';
            c.fillText(statLabels[stat], btn.x + btn.w / 2, btn.y + 13);
            c.font = '9px system-ui, sans-serif';
            c.fillText('(' + cost + 'g)', btn.x + btn.w / 2, btn.y + 27);
          }
        }

        // Sell/Delete button.
        const sellBtn = { x: 8, y: RENDERER.height - 60, w: 200, h: 36 };
        c.fillStyle = game.devMode ? '#c0392b' : CONFIG.COLORS.sell;
        c.fillRect(sellBtn.x, sellBtn.y, sellBtn.w, sellBtn.h);
        c.fillStyle = '#fff';
        c.font = '13px system-ui, sans-serif';
        c.textAlign = 'center';
        if (game.devMode) {
          c.fillText('Delete ' + t.spec.name, sellBtn.x + sellBtn.w / 2, sellBtn.y + sellBtn.h / 2);
        } else {
          const refund = Math.ceil(t.getTotalInvested() * CONFIG.SELL_REFUND_RATIO);
          c.fillText('Sell ' + t.spec.name + ' (+' + refund + 'g)',
            sellBtn.x + sellBtn.w / 2, sellBtn.y + sellBtn.h / 2);
        }
      }
    }
  },

  drawPreview(game) {
    const c = RENDERER.ctx;
    const w = RENDERER.width;
    const h = UI_LAYOUT.HUD_HEIGHT;
    const y = RENDERER.height - UI_LAYOUT.PREVIEW_HEIGHT;
    c.fillStyle = '#0a0e12';
    c.fillRect(UI_LAYOUT.SHOP_WIDTH, y, w - UI_LAYOUT.SHOP_WIDTH, UI_LAYOUT.PREVIEW_HEIGHT);
    c.fillStyle = CONFIG.COLORS.hudText;
    c.font = '12px system-ui, sans-serif';
    c.textAlign = 'left';
    c.fillText('Next wave:', UI_LAYOUT.SHOP_WIDTH + 10, y + 18);
    const preview = game.wave.getNextWavePreview();
    if (!preview) {
      c.fillText('Prepare for next wave...', UI_LAYOUT.SHOP_WIDTH + 90, y + 18);
      return;
    }
    let cx = UI_LAYOUT.SHOP_WIDTH + 90;
    for (const [level, count] of preview) {
      const key = level === 'B' ? 'B' : level;
      const spec = MONSTER_SPECS[key];
      c.fillStyle = spec.color;
      c.beginPath(); c.arc(cx + 8, y + 18, 8, 0, Math.PI * 2); c.fill();
      c.fillStyle = CONFIG.COLORS.hudText;
      c.font = '12px system-ui, sans-serif';
      c.fillText('x' + count, cx + 22, y + 18);
      cx += 80;
    }
  },

  drawPlacementGhost(game) {
    if (!game.selectedSpec) return;
    if (RENDERER.hoverPx == null) return;
    const w = RENDERER.toWorld(RENDERER.hoverPx, RENDERER.hoverPy);
    const tile = pixelToTile(w.x, w.y);
    if (!inBounds(tile.gx, tile.gy)) return;
    // Don't draw inside shop/HUD regions.
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
    c.strokeStyle = valid ? 'rgba(88,166,255,0.6)' : 'rgba(220,80,80,0.6)';
    c.lineWidth = 2;
    c.beginPath();
    c.arc(center.x, center.y, (game.selectedSpec.range + 0.5) * CONFIG.TILE_SIZE, 0, Math.PI * 2);
    c.stroke();
    // Troop ghost.
    c.globalAlpha = 0.6;
    c.fillStyle = game.selectedSpec.color;
    c.fillRect(center.x - CONFIG.TILE_SIZE / 2 + 6, center.y - CONFIG.TILE_SIZE / 2 + 6,
      CONFIG.TILE_SIZE - 12, CONFIG.TILE_SIZE - 12);
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
    c.strokeStyle = CONFIG.COLORS.selected;
    c.lineWidth = 2;
    c.beginPath();
    c.arc(t.x, t.y, (t.getRange() + 0.5) * CONFIG.TILE_SIZE, 0, Math.PI * 2);
    c.stroke();
    c.restore();
  },

  drawOverlay(game) {
    if (game.state !== 'VICTORY' && game.state !== 'DEFEAT') return;
    const c = RENDERER.ctx;
    c.fillStyle = 'rgba(0,0,0,0.65)';
    c.fillRect(0, 0, RENDERER.width, RENDERER.height);
    c.fillStyle = game.state === 'VICTORY' ? '#2ecc71' : '#e74c3c';
    c.font = 'bold 48px system-ui, sans-serif';
    c.textAlign = 'center';
    c.fillText(game.state === 'VICTORY' ? 'VICTORY' : 'DEFEAT',
      RENDERER.width / 2, RENDERER.height / 2 - 10);
    c.fillStyle = CONFIG.COLORS.hudText;
    c.font = '16px system-ui, sans-serif';
    c.fillText('Press R to play again', RENDERER.width / 2, RENDERER.height / 2 + 30);
    c.textAlign = 'left';
  },

  drawDevConfirmDialog(game) {
    if (!game.devConfirmPending && !game.resetConfirmPending && !game.sellConfirmPending) return;
    const c = RENDERER.ctx;
    c.fillStyle = 'rgba(0,0,0,0.55)';
    c.fillRect(0, 0, RENDERER.width, RENDERER.height);

    const pw = 300, ph = 130;
    const px = (RENDERER.width - pw) / 2;
    const py = (RENDERER.height - ph) / 2;

    c.fillStyle = '#0e1418';
    c.strokeStyle = '#58a6ff';
    c.lineWidth = 2;
    c.fillRect(px, py, pw, ph);
    c.strokeRect(px, py, pw, ph);

    c.textAlign = 'center';
    c.fillStyle = '#e6edf3';
    c.font = 'bold 16px system-ui, sans-serif';
    if (game.sellConfirmPending) {
      const t = game.troops[game.sellConfirmTroopIndex];
      c.fillText('Sell ' + (t ? t.spec.name : 'Troop') + '?', px + pw / 2, py + 34);
      c.fillStyle = '#e67e22';
      c.font = '12px system-ui, sans-serif';
      c.fillText('This cannot be undone.', px + pw / 2, py + 56);
    } else if (game.resetConfirmPending) {
      c.fillText('Reset Game?', px + pw / 2, py + 34);
      c.fillStyle = '#e74c3c';
      c.font = '12px system-ui, sans-serif';
      c.fillText('All progress will be lost.', px + pw / 2, py + 56);
    } else if (!game.sellConfirmPending) {
      c.fillText(game.devMode ? 'Disable Dev Mode?' : 'Enable Dev Mode?', px + pw / 2, py + 34);
      c.fillStyle = '#7a8893';
      c.font = '12px system-ui, sans-serif';
      c.fillText('Game will reset.', px + pw / 2, py + 56);
    }

    // Yes button.
    c.fillStyle = game.sellConfirmPending ? '#e67e22' : (game.devMode || game.resetConfirmPending ? '#e74c3c' : '#27ae60');
    c.fillRect(px + 40, py + 80, 90, 32);
    c.fillStyle = '#fff';
    c.font = 'bold 13px system-ui, sans-serif';
    c.fillText('Yes', px + 85, py + 100);
    this._devConfirmYes = { x: px + 40, y: py + 80, w: 90, h: 32 };

    // No button.
    c.fillStyle = '#7a8893';
    c.fillRect(px + 170, py + 80, 90, 32);
    c.fillStyle = '#fff';
    c.font = '13px system-ui, sans-serif';
    c.fillText('No', px + 215, py + 100);
    this._devConfirmNo = { x: px + 170, y: py + 80, w: 90, h: 32 };

    c.textAlign = 'left';
  },

  // Dev right panel: monster count editor (non-modal, shown during PRE_WAVE).
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
    c.fillStyle = '#0e1418';
    c.strokeStyle = '#58a6ff';
    c.lineWidth = 1;
    c.fillRect(px, py, panelW, panelH);
    c.strokeRect(px, py, panelW, panelH);

    // Header.
    c.fillStyle = '#f1c40f';
    c.font = 'bold 11px system-ui, sans-serif';
    c.textAlign = 'left';
    c.fillText('DEV — Wave ' + (game.wave.currentWave + 1), px + 8, py + 14);

    // Rows.
    const rows = [];
    const contentX = px + 8;
    for (let i = 0; i < order.length; i++) {
      const level = order[i];
      const ry = py + headerH + 4 + i * rowH;
      const count = game.devMonsterCounts[level] || 0;

      c.fillStyle = MONSTER_SPECS[level].color;
      c.beginPath(); c.arc(contentX + 6, ry + rowH / 2, 5, 0, Math.PI * 2); c.fill();

      c.fillStyle = '#e6edf3';
      c.font = '10px system-ui, sans-serif';
      c.textAlign = 'left';
      c.fillText(names[level], contentX + 15, ry + rowH / 2 + 3);

      c.fillStyle = '#f1c40f';
      c.font = 'bold 11px system-ui, sans-serif';
      c.textAlign = 'center';
      const countX = contentX + 70;
      c.fillText(count, countX, ry + rowH / 2 + 3);

      // Buttons.
      var btnDefs = [
        { tag:'m10', lbl:'-10', x: contentX + 84, w: 30 },
        { tag:'m1',  lbl:'-1',  x: contentX + 116, w: 22 },
        { tag:'p1',  lbl:'+1',  x: contentX + 140, w: 22 },
        { tag:'p10', lbl:'+10', x: contentX + 164, w: 30 },
      ];
      var row = { level: level };
      c.textAlign = 'center';
      for (const bd of btnDefs) {
        const br = { x: bd.x, y: ry + 3, w: bd.w, h: rowH - 6 };
        c.fillStyle = '#222a33';
        c.fillRect(br.x, br.y, br.w, br.h);
        c.strokeStyle = '#444';
        c.strokeRect(br.x, br.y, br.w, br.h);
        c.fillStyle = '#e6edf3';
        c.font = 'bold 9px system-ui, sans-serif';
        c.fillText(bd.lbl, br.x + br.w / 2, br.y + br.h / 2 + 3);
        row[bd.tag] = br;
      }
      rows.push(row);
    }
    this._devRightButtons = rows;
    this._devRightPanelRect = { x: px, y: py, w: panelW, h: panelH };

    // Start Wave button.
    const startY = py + headerH + 4 + order.length * rowH + 6;
    c.fillStyle = '#27ae60';
    c.fillRect(px + 10, startY, panelW - 20, btnH);
    c.fillStyle = '#fff';
    c.font = 'bold 12px system-ui, sans-serif';
    c.textAlign = 'center';
    c.fillText('Start Wave', px + panelW / 2, startY + btnH / 2 + 3);
    this._devRightStartBtn = { x: px + 10, y: startY, w: panelW - 20, h: btnH };

    c.textAlign = 'left';
  },
};
