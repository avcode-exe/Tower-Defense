import { RENDERER } from '../rendering/renderer.js';
import { CONFIG, LAYOUT } from '../config.js';
import { UI_LAYOUT, UI_COLORS } from './constants.js';
import { AUDIO } from '../audio.js';
import { UIRoundRect, drawToggleButton } from './utils.js';

export function drawHUD(game) {
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
    c.textAlign = 'left';
    c.textBaseline = 'middle';
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
  c.fillText(game.devMode ? '\u221E' : String(game.lives), livesX + 18, 28);

  // Wave.
  const waveX = 200;
  c.fillStyle = UI_COLORS.textBright;
  c.font = 'bold 15px system-ui, sans-serif';
  c.textAlign = 'left';
  c.fillText('Wave ' + (game.wave.currentWave + 1), waveX, 28);
  // Dev mode indicator — green badge at center of HUD
  if (game.devMode) {
    c.font = 'bold 10px system-ui, sans-serif';
    const devText = 'DEV Mode';
    const devW = c.measureText(devText).width + 16;
    const devH = 18;
    const devX = (w - devW) / 2;
    const devY = (UI_LAYOUT.HUD_HEIGHT - devH) / 2;
    c.fillStyle = 'rgba(46,160,67,0.2)';
    UIRoundRect(c, devX, devY, devW, devH, 5);
    c.fill();
    c.strokeStyle = 'rgba(46,160,67,0.5)';
    c.lineWidth = 1;
    UIRoundRect(c, devX, devY, devW, devH, 5);
    c.stroke();
    c.fillStyle = '#2ea043';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText(devText, w / 2, devY + devH / 2);
    c.textBaseline = 'middle';
  }

  // Reset button.
  const rstX = 310,
    rstW = 50;
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
  c.fillText('Reset', rstX + rstW / 2, 28);

  // Mute button.
  const muteBtn = LAYOUT.HUD.MUTE_BTN;
  c.fillStyle = 'rgba(255,255,255,0.04)';
  UIRoundRect(c, muteBtn.x, muteBtn.y, muteBtn.w, muteBtn.h, 6);
  c.fill();
  c.strokeStyle = 'rgba(255,255,255,0.1)';
  c.lineWidth = 1;
  UIRoundRect(c, muteBtn.x, muteBtn.y, muteBtn.w, muteBtn.h, 6);
  c.stroke();
  c.fillStyle = AUDIO.muted ? '#e74c3c' : UI_COLORS.textDim;
  c.font = 'bold 11px system-ui, sans-serif';
  c.textAlign = 'center';
  c.fillText(AUDIO.muted ? '\u2716' : '\u266A', muteBtn.x + muteBtn.w / 2, 29);

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
      // Greyed-out disabled state
      c.fillStyle = 'rgba(255,255,255,0.04)';
      UIRoundRect(c, ctrlBtn.x, ctrlBtn.y, ctrlBtn.w, ctrlBtn.h, 6);
      c.fill();
      c.strokeStyle = 'rgba(255,255,255,0.06)';
      c.lineWidth = 1;
      UIRoundRect(c, ctrlBtn.x, ctrlBtn.y, ctrlBtn.w, ctrlBtn.h, 6);
      c.stroke();
      c.fillStyle = UI_COLORS.textDim;
      c.font = 'bold 11px system-ui, sans-serif';
      c.textAlign = 'center';
      c.fillText(label, ctrlBtn.x + ctrlBtn.w / 2, ctrlBtn.y + ctrlBtn.h / 2 - 4);
      c.fillStyle = UI_COLORS.textDim;
      c.font = '7px system-ui, sans-serif';
      c.fillText('(Button disabled)', ctrlBtn.x + ctrlBtn.w / 2, ctrlBtn.y + ctrlBtn.h / 2 + 9);
    } else {
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
  }

  // Monsters left count.
  if (game.state === 'WAVE_ACTIVE' || game.state === 'PAUSED') {
    c.fillStyle = UI_COLORS.textDim;
    c.font = '11px system-ui, sans-serif';
    c.textAlign = 'left';
    c.fillText(game.monsters.length + game.wave.monstersRemainingThisWave + ' monsters', sx - 130, 28);
  }

  // Wave 10+ scaling indicator.
  if (game.wave.currentWave >= 10) {
    c.fillStyle = UI_COLORS.red;
    c.font = 'bold 11px system-ui, sans-serif';
    c.textAlign = 'left';
    c.fillText('x' + game.wave.currentMultiplier.toFixed(2), 375, 28);
  }

  c.textBaseline = 'alphabetic';
}
