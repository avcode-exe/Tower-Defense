import { RENDERER } from '../rendering/renderer.js';
import { CONFIG, LAYOUT } from '../config.js';
import { AUDIO } from '../audio.js';
import { UI_LAYOUT, UI_COLORS, zp } from './constants.js';
import { UIRoundRect, drawToggleButton, fillStrokeRoundedRect , zoomFont } from './utils.js';

export function drawHUD(game) {
  const c = RENDERER.ctx;
  const w = RENDERER.width;

  this._toggleHud = null;

  if (UI_LAYOUT.collapsed.hud) {
    const z = UI_LAYOUT._zoom || 1;
    c.fillStyle = UI_COLORS.panelBg;
    c.fillRect(0, 0, w, 20 * z);
    c.fillStyle = UI_COLORS.panelBorder;
    c.fillRect(0, 20 * z, w, 1);
    c.fillStyle = UI_COLORS.textDim;
    zoomFont(c, 8);
    c.textAlign = 'left';
    c.textBaseline = 'middle';
    c.fillText('HUD', 6 * z, 10 * z);
    const btnRect = { x: w - zp(22), y: zp(2), w: zp(16), h: zp(16) };
    this._toggleHud = btnRect;
    drawToggleButton(c, btnRect, true, 'down');
    c.textBaseline = 'alphabetic';
    return;
  }

  // Set textBaseline once for the whole HUD.
  c.textBaseline = 'middle';
  // Reset any stale extra-HUD height from the previous frame
  UI_LAYOUT._extraHudHeight = 0;

  const zoom = UI_LAYOUT._zoom || 1;
  const hudY = UI_LAYOUT.HUD_HEIGHT / 2;

  // ── Pre-measure text widths for dynamic gap compression ──
  const goldStr = game.devMode ? '\u221E' : String(game.gold);
  const livesStr = game.devMode ? '\u221E' : String(game.lives);
  const waveStr = 'Wave ' + (game.wave.currentWave + 1);
  // Measure each with its actual font weight (non-bold for gold/lives, bold for wave)
  c.font = Math.round(15 * zoom) + 'px system-ui, sans-serif';
  const goldW = c.measureText(goldStr).width;
  const livesW = c.measureText(livesStr).width;
  c.font = 'bold ' + Math.round(15 * zoom) + 'px system-ui, sans-serif';
  const waveW = c.measureText(waveStr).width;  // Base positions (in zoom-scaled pixels)
  const goldX = zp(14);
  const livesDefX = zp(120);
  const waveDefX = zp(200);
  const rstDefX = zp(310);
  const rstW = zp(50);

  // Right-anchored reference
  const sx = w - LAYOUT.HUD.SPEED_OFFSET;

  // Gaps in display pixels between left-anchored sections (before text)
  const gap1 = livesDefX - (goldX + zp(20) + goldW);  // gold end → lives heart
  const gap2 = waveDefX - (livesDefX + zp(18) + livesW); // lives end → wave text
  const gap3 = rstDefX - (waveDefX + waveW);           // wave end → reset btn

  // Left-anchored section right edge
  const leftEnd = rstDefX + rstW;
  // Left edge of right-anchored section (monsters count extends furthest left during waves)
  const rightStart = game.state === 'WAVE_ACTIVE' || game.state === 'PAUSED' ? sx - zp(130) : sx - zp(50);

  const MIN_HUD_GAP = zp(6);
  let gapScale = 1;
  const overlap = (rightStart - MIN_HUD_GAP) - leftEnd;
  if (overlap < 0) {
    const totalGap = gap1 + gap2 + gap3;
    const shortfall = -overlap;
    if (totalGap > 0) gapScale = Math.max(0.1, 1 - shortfall / totalGap);
  }

  // ── Two-line fallback: if compression alone isn't enough, move only the ──
  // speed label and speed buttons to a compact row 2. The ctrl (Start/Pause)
  // button stays on row 1 so it's always accessible.
  const useTwoLines = gapScale <= 0.1 && overlap < 0;
  this._hudTwoLines = useTwoLines;

  // In 2-line mode, row 1 uses natural zoomed positions (no compression)
  // because the speed label + buttons moved to row 2, leaving enough room.
  if (useTwoLines) {
    gapScale = 1;
  }

  // Compressed positions (gaps shrink, element sizes stay)
  const goldEnd = goldX + zp(20) + goldW;
  const livesX = livesDefX - gap1 * (1 - gapScale);
  const livesEnd = livesX + zp(18) + livesW;
  const waveX = waveDefX - (gap1 + gap2) * (1 - gapScale);
  const waveEnd = waveX + waveW;
  const rstX = rstDefX - (gap1 + gap2 + gap3) * (1 - gapScale);

  // Compact speed row dimensions
  const SPEED_ROW_H = useTwoLines ? Math.round(30 * zoom) : 0;
  this._speedRowH = SPEED_ROW_H;
  const panelH = useTwoLines ? UI_LAYOUT.HUD_HEIGHT + SPEED_ROW_H : UI_LAYOUT.HUD_HEIGHT;

  if (useTwoLines) {
    UI_LAYOUT._extraHudHeight = SPEED_ROW_H;
  }

  // Speed row vertical center — uses hudHeight which includes _extraHudHeight
  const speedRowY = useTwoLines ? UI_LAYOUT.hudHeight - SPEED_ROW_H / 2 : hudY;
  // Speed button top (vertically centered in compact row)
  const speedBtnY = useTwoLines ? UI_LAYOUT.HUD_HEIGHT + Math.round((SPEED_ROW_H - 20 * zoom) / 2) : zp(14);
  // Compact speed button dimensions (slightly larger for better readability)
  const cmpBtnW = useTwoLines ? Math.round(20 * zoom) : zp(26);
  const cmpBtnH = useTwoLines ? Math.round(20 * zoom) : zp(28);
  const cmpGap = useTwoLines ? Math.round(20 * zoom) : zp(28);

  // Store offset and compact dimensions for click handlers
  this._speedBtnOffsetY = useTwoLines ? speedBtnY - 14 : 0;
  this._speedBtnGap = useTwoLines ? cmpGap : 28;
  this._speedBtnH = useTwoLines ? cmpBtnH : null;

  // ── Draw panel background ──
  c.fillStyle = UI_COLORS.panelBg;
  c.fillRect(0, 0, w, panelH);
  c.fillStyle = UI_COLORS.panelBorder;
  c.fillRect(0, panelH, w, 1);

  const btnRect = { x: w - zp(22), y: zp(6), w: zp(16), h: zp(16) };
  this._toggleHud = btnRect;
  drawToggleButton(c, btnRect, false, 'up');

  // ── Gold ──
  c.beginPath();
  c.fillStyle = UI_COLORS.gold;
  c.arc(goldX + zp(8), hudY, zp(7), 0, Math.PI * 2);
  c.fill();
  c.fillStyle = '#0c1219';
  zoomFont(c, 10, 'bold ');
  c.textAlign = 'center';
  c.fillText('G', goldX + zp(8), hudY);
  c.fillStyle = UI_COLORS.textBright;
  c.textAlign = 'left';
  zoomFont(c, 15);
  c.fillText(goldStr, goldX + zp(20), hudY);

  // ── Lives ──
  c.fillStyle = UI_COLORS.heart;
  zoomFont(c, 16);
  c.textAlign = 'left';
  c.fillText('\u2764', livesX, hudY);
  c.fillStyle = UI_COLORS.textBright;
  zoomFont(c, 15);
  c.fillText(livesStr, livesX + zp(18), hudY);

  // ── Wave ──
  c.fillStyle = UI_COLORS.textBright;
  zoomFont(c, 15, 'bold ');
  c.textAlign = 'left';
  c.fillText(waveStr, waveX, hudY);

  // Dev mode indicator — green badge at center of HUD
  if (game.devMode) {
    zoomFont(c, 10, 'bold ');
    const devText = 'DEV Mode';
    const devW = c.measureText(devText).width + zp(16);
    const devH = zp(18);
    const devX = (w - devW) / 2;
    const devY = (UI_LAYOUT.HUD_HEIGHT - devH) / 2;
    fillStrokeRoundedRect(c, devX, devY, devW, devH, zp(5), 'rgba(46,160,67,0.2)', 'rgba(46,160,67,0.5)');
    c.fillStyle = '#2ea043';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText(devText, w / 2, devY + devH / 2);
    c.textBaseline = 'middle';
  }

  // ── Reset button (stays on row 1) ──
  this._resetBtn = { x: rstX, y: zp(14), w: rstW, h: zp(28) };
  fillStrokeRoundedRect(c, rstX, zp(14), rstW, zp(28), zp(6), 'rgba(255,255,255,0.04)', 'rgba(255,255,255,0.1)');
  c.fillStyle = UI_COLORS.textDim;
  zoomFont(c, 10, 'bold ');
  c.textAlign = 'center';
  c.fillText('Reset', rstX + rstW / 2, hudY);

  // ── Speed (moves to compact row 2 if needed) ──
  c.fillStyle = UI_COLORS.textDim;
  zoomFont(c, useTwoLines ? 9 : 11);
  c.textAlign = 'left';
  c.fillText('Speed:', sx - (useTwoLines ? zp(40) : zp(50)), speedRowY);
  for (let i = 0; i < CONFIG.GAME_SPEEDS.length; i++) {
    const rx = sx + i * cmpGap;
    const active = game.speed === CONFIG.GAME_SPEEDS[i];
    c.fillStyle = active ? 'rgba(88,166,255,0.15)' : 'rgba(255,255,255,0.04)';
    UIRoundRect(c, rx, speedBtnY, cmpBtnW, cmpBtnH, zp(4));
    c.fill();
    if (active) {
      c.strokeStyle = 'rgba(88,166,255,0.4)';
      c.lineWidth = 1;
      UIRoundRect(c, rx, speedBtnY, cmpBtnW, cmpBtnH, zp(4));
      c.stroke();
    }
    c.fillStyle = active ? UI_COLORS.accent : UI_COLORS.textDim;
    zoomFont(c, useTwoLines ? 8 : 10);
    c.textAlign = 'center';
    c.fillText(CONFIG.GAME_SPEEDS[i] + 'x', rx + cmpBtnW / 2, speedRowY);
  }

  // ── Start / pause / resume (stays on row 1, always accessible) ──
  const ctrlBtn = {
    x: w - LAYOUT.HUD.CTRL_RIGHT,
    y: LAYOUT.HUD.CTRL_BTN.y,
    w: LAYOUT.HUD.CTRL_BTN.w,
    h: LAYOUT.HUD.CTRL_BTN.h,
  };
  let label =
    game.state === 'PRE_WAVE'
      ? 'Start Wave'
      : game.state === 'WAVE_ACTIVE'
        ? 'Pause'
        : game.state === 'PAUSED'
          ? 'Resume'
          : '';
  // Disable Start Wave in dev mode — greyed out with sub-label
  const isDevDisabled = label === 'Start Wave' && game.devMode;
  if (label) {
    const isStart = game.state === 'PRE_WAVE' || game.state === 'PAUSED';
    if (isDevDisabled) {
      fillStrokeRoundedRect(
        c,
        ctrlBtn.x,
        ctrlBtn.y,
        ctrlBtn.w,
        ctrlBtn.h,
        zp(6),
        'rgba(255,255,255,0.04)',
        'rgba(255,255,255,0.06)'
      );
      c.fillStyle = UI_COLORS.textDim;
      zoomFont(c, 11, 'bold ');
      c.textAlign = 'center';
      c.fillText(label, ctrlBtn.x + ctrlBtn.w / 2, ctrlBtn.y + ctrlBtn.h / 2 - zp(4));
      c.fillStyle = UI_COLORS.textDim;
      zoomFont(c, 7);
      c.fillText('(Button disabled)', ctrlBtn.x + ctrlBtn.w / 2, ctrlBtn.y + ctrlBtn.h / 2 + zp(9));
    } else {
      const ctrlBg = isStart ? 'rgba(46,160,67,0.15)' : 'rgba(218,54,51,0.15)';
      const ctrlBorder = isStart ? 'rgba(46,160,67,0.3)' : 'rgba(218,54,51,0.3)';
      fillStrokeRoundedRect(c, ctrlBtn.x, ctrlBtn.y, ctrlBtn.w, ctrlBtn.h, zp(6), ctrlBg, ctrlBorder);
      c.fillStyle = isStart ? UI_COLORS.green : UI_COLORS.red;
      zoomFont(c, 11, 'bold ');
      c.textAlign = 'center';
      c.fillText(label, ctrlBtn.x + ctrlBtn.w / 2, ctrlBtn.y + ctrlBtn.h / 2 + zp(1));
    }
  }

  // ── Monsters left count (stays on row 1) ──
  if (game.state === 'WAVE_ACTIVE' || game.state === 'PAUSED') {
    c.fillStyle = UI_COLORS.textDim;
    zoomFont(c, 11);
    c.textAlign = 'left';
    c.fillText(game.monsters.length + game.wave.monstersRemainingThisWave + ' monsters', sx - zp(130), hudY);
  }

  // ── Wave 10+ scaling indicator (stays on row 1) ──
  if (game.wave.currentWave >= 10) {
    const multX = rstX + rstW + zp(8);
    c.fillStyle = UI_COLORS.red;
    zoomFont(c, 11, 'bold ');
    c.textAlign = 'left';
    c.fillText('x' + game.wave.currentMultiplier.toFixed(2), multX, hudY);
  }

  c.textBaseline = 'alphabetic';
}
