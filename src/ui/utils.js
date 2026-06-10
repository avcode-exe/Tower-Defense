import { RENDERER } from '../rendering/renderer.js';
import { UI_COLORS } from './constants.js';
import { CONFIG } from '../config.js';

export function UIRoundRect(c, x, y, w, h, r) {
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

export function drawToggleButton(c, rect, collapsed, expandDir) {
  c.fillStyle = 'rgba(255,255,255,0.08)';
  c.beginPath();
  c.arc(rect.x + rect.w / 2, rect.y + rect.h / 2, 7, 0, Math.PI * 2);
  c.fill();
  c.fillStyle = 'rgba(255,255,255,0.4)';
  c.font = 'bold 10px system-ui, sans-serif';
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  const arrow = collapsed
    ? expandDir === 'up'
      ? '\u25B2'
      : expandDir === 'down'
        ? '\u25BC'
        : expandDir === 'left'
          ? '\u25C0'
          : '\u25B6'
    : expandDir === 'up'
      ? '\u25BC'
      : expandDir === 'down'
        ? '\u25B2'
        : expandDir === 'left'
          ? '\u25B6'
          : '\u25C0';
  c.fillText(arrow, rect.x + rect.w / 2, rect.y + rect.h / 2 + 0.5);
}

export function hitToggleButton(px, py, rect) {
  if (!rect) return false;
  return px >= rect.x && px <= rect.x + rect.w && py >= rect.y && py <= rect.y + rect.h;
}

export function _wrapText(c, text, maxW, fontSize, font) {
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
}

export function _drawShopTooltip(c, r, spec) {
  if (!spec.desc) return;
  c.save();
  c.font = '11px system-ui, sans-serif';
  const rawLines = _wrapText(c, spec.desc, RENDERER.width - r.w - 60, 11, 'system-ui, sans-serif');
  const maxTextW = Math.max(...rawLines.map((l) => c.measureText(l).width), 0);
  c.restore();
  const padX = 14,
    padTop = 10,
    padBot = 12,
    lineH = 14,
    gap = 6;
  const desired = maxTextW + padX * 2;
  const tipW = Math.min(Math.max(r.w + 40, desired), RENDERER.width - r.w - 60);
  const tipH = padTop + padBot + rawLines.length * lineH;
  const tipX = r.x + r.w + gap * 2 + tipW > RENDERER.width ? r.x - tipW - gap * 2 : r.x + r.w + gap * 2;
  let tipY = r.y;
  if (tipY + tipH > RENDERER.height - 10) {
    tipY = Math.max(0, RENDERER.height - 10 - tipH);
  }
  c.save();
  c.fillStyle = 'rgba(10,16,22,0.96)';
  UIRoundRect(c, tipX, tipY, tipW, tipH, 8);
  c.fill();
  c.strokeStyle = 'rgba(88,166,255,0.18)';
  c.lineWidth = 1;
  UIRoundRect(c, tipX + 0.5, tipY + 0.5, tipW - 1, tipH - 1, 8);
  c.stroke();
  c.fillStyle = '#c9d1d9';
  c.font = '11px system-ui, sans-serif';
  c.textAlign = 'left';
  c.textBaseline = 'middle';
  for (let j = 0; j < rawLines.length; j++) {
    c.fillText(rawLines[j], tipX + padX, tipY + padTop + 6 + j * lineH);
  }
  c.restore();
}
