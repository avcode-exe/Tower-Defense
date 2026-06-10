import { RENDERER } from '../rendering/renderer.js';
import { CONFIG } from '../config.js';
import { UI_COLORS } from './constants.js';
import { UIRoundRect } from './utils.js';

export function drawWaveTransition(game) {
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
  let alpha = 0;
  if (progress < 0.2) alpha = progress / 0.2;
  else if (progress < 0.8) alpha = 1;
  else alpha = (1 - progress) / 0.2;
  alpha = Math.max(0, Math.min(1, alpha));

  const cx = RENDERER.width / 2;
  const cy = RENDERER.height / 2;

  c.save();
  c.globalAlpha = alpha * 0.25;
  c.fillStyle = UI_COLORS.accent;
  c.fillRect(0, 0, RENDERER.width, RENDERER.height);
  c.globalAlpha = alpha;

  c.fillStyle = UI_COLORS.textBright;
  c.font = 'bold 32px system-ui, sans-serif';
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.shadowColor = 'rgba(0,0,0,0.5)';
  c.shadowBlur = 10;
  c.shadowOffsetX = 0;
  c.shadowOffsetY = 4;
  c.fillText('Wave ' + a.waveNum + ' Complete', cx, cy - 10);

  c.font = '16px system-ui, sans-serif';
  c.fillStyle = UI_COLORS.textDim;
  c.shadowBlur = 0;
  c.fillText('Get ready for the next wave', cx, cy + 16);

  c.restore();
}

export function drawOverlay(game) {
  if (game.state !== 'DEFEAT') return;
  const c = RENDERER.ctx;
  c.fillStyle = 'rgba(0,0,0,0.7)';
  c.fillRect(0, 0, RENDERER.width, RENDERER.height);
  c.fillStyle = UI_COLORS.red;
  c.font = 'bold 52px system-ui, sans-serif';
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.fillText('DEFEAT', RENDERER.width / 2, RENDERER.height / 2 - 14);
  c.fillStyle = UI_COLORS.textDim;
  c.font = '14px system-ui, sans-serif';
  c.fillText('Press R to restart', RENDERER.width / 2, RENDERER.height / 2 + 28);
  c.textBaseline = 'alphabetic';
}

export function drawDevConfirmDialog(game) {
  if (!game.devConfirmPending && !game.resetConfirmPending && !game.sellConfirmPending) return;
  const c = RENDERER.ctx;
  c.fillStyle = 'rgba(0,0,0,0.6)';
  c.fillRect(0, 0, RENDERER.width, RENDERER.height);

  const pw = 380,
    ph = 170;
  const px = (RENDERER.width - pw) / 2;
  const py = (RENDERER.height - ph) / 2;

  c.fillStyle = '#111a24';
  UIRoundRect(c, px, py, pw, ph, 12);
  c.fill();
  c.strokeStyle = 'rgba(88,166,255,0.2)';
  c.lineWidth = 1;
  UIRoundRect(c, px, py, pw, ph, 12);
  c.stroke();

  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.fillStyle = UI_COLORS.textBright;
  c.font = 'bold 15px system-ui, sans-serif';
  if (game.sellConfirmPending) {
    c.fillText(
      'Sell ' +
        (game.sellConfirmTroopIndex?.spec?.name || 'troop') +
        ' for ' +
        Math.round(CONFIG.SELL_REFUND_RATIO * 100) +
        '% refund?',
      RENDERER.width / 2,
      py + 45
    );
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

  const btnW = 80,
    btnH = 36,
    gap = 20,
    totalW = btnW * 2 + gap;
  const btnY = py + ph - 60;
  const yesX = (RENDERER.width - totalW) / 2;
  const noX = yesX + btnW + gap;
  const yesColor = game.resetConfirmPending ? '#da3633' : '#2ea043';

  c.fillStyle = yesColor;
  UIRoundRect(c, yesX, btnY, btnW, btnH, 8);
  c.fill();
  c.fillStyle = '#fff';
  c.font = 'bold 11px system-ui, sans-serif';
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.fillText(game.resetConfirmPending ? 'Reset' : 'Yes', yesX + btnW / 2, btnY + btnH / 2);

  c.fillStyle = 'rgba(255,255,255,0.08)';
  UIRoundRect(c, noX, btnY, btnW, btnH, 8);
  c.fill();
  c.fillStyle = UI_COLORS.textDim;
  c.fillText('No', noX + btnW / 2, btnY + btnH / 2);

  this._devConfirmYes = { x: yesX, y: btnY, w: btnW, h: btnH };
  this._devConfirmNo = { x: noX, y: btnY, w: btnW, h: btnH };
  c.textBaseline = 'alphabetic';
}
