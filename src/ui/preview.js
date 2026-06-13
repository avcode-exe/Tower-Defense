import { RENDERER } from '../rendering/renderer.js';
import { CONFIG, MONSTER_SPECS } from '../config.js';
import { UI_LAYOUT, UI_COLORS } from './constants.js';
import { drawToggleButton } from './utils.js';

const ESTIMATE_FONT = '8px system-ui, sans-serif';
const ESTIMATE_GAP = 8;

function readNumber(source, keys) {
  if (!source) return null;
  for (const key of keys) {
    const value = source[key];
    if (value == null || value === '') continue;
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function formatSeconds(value) {
  if (value == null || value === '') return null;
  const seconds = Number(value);
  if (!Number.isFinite(seconds) || seconds < 0) return null;

  const rounded = Math.ceil(seconds);
  const minutes = Math.floor(rounded / 60);
  const restSeconds = rounded % 60;
  return minutes > 0 ? `${minutes}m${restSeconds}s` : `${restSeconds}s`;
}

function getWaveEstimate(wave) {
  if (!wave || typeof wave.getNextWaveEstimate !== 'function') return null;
  try {
    return wave.getNextWaveEstimate();
  } catch {
    return null;
  }
}

function getReviveEstimate(estimate) {
  const revive = estimate?.reviveEstimate ?? estimate?.revive ?? null;
  const count =
    readNumber(revive, ['count', 'targets', 'revives']) ?? readNumber(estimate, ['reviveCount', 'reviveTargets']);
  const gold =
    readNumber(revive, ['gold', 'rewardGold', 'totalGold']) ?? readNumber(estimate, ['reviveGold', 'reviveRewardGold']);

  if (count == null && gold == null) return null;
  return {
    count: count == null ? null : Math.max(0, Math.floor(count)),
    gold: gold == null ? null : Math.max(0, Math.floor(gold)),
  };
}

function previewHasNecromancer(preview) {
  return preview?.some((entry) => {
    const level = Array.isArray(entry) ? entry[0] : entry?.level;
    const key = level === 'B' ? 'B' : level;
    return MONSTER_SPECS[key]?.name === 'Necromancer';
  });
}

function drawEstimateLine(c, x, y, rightEdge, parts) {
  if (!parts.length) return;

  c.font = ESTIMATE_FONT;
  c.textAlign = 'left';
  c.textBaseline = 'middle';

  let cursor = x;
  for (const part of parts) {
    const labelWidth = c.measureText(part.label).width;
    const valueWidth = c.measureText(part.value).width;
    if (cursor + labelWidth + valueWidth > rightEdge && cursor > x) break;

    c.fillStyle = UI_COLORS.textDim;
    c.fillText(part.label, cursor, y);
    cursor += labelWidth;

    c.fillStyle = UI_COLORS.textBody;
    c.fillText(part.value, cursor, y);
    cursor += valueWidth + ESTIMATE_GAP;
  }
}

export function drawPreview(game) {
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
    c.textAlign = 'left';
    c.textBaseline = 'middle';
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
  c.textAlign = 'left';
  c.textBaseline = 'middle';
  c.fillText('Next Wave', UI_LAYOUT.shopWidth + 12, y + 12);

  const preview = game.wave.getNextWavePreview();
  if (!preview) {
    c.fillStyle = UI_COLORS.textDim;
    c.font = '12px system-ui, sans-serif';
    c.fillText('Prepare...', UI_LAYOUT.shopWidth + 90, y + 18);
    return;
  }
  let cx = UI_LAYOUT.shopWidth + 90;
  const rightEdge = w - UI_LAYOUT.shieldShopWidth - 8;
  for (const [level, count] of preview) {
    if (cx + 80 > rightEdge) break;
    const key = level === 'B' ? 'B' : level;
    const spec = MONSTER_SPECS[key];
    c.fillStyle = spec.color;
    c.beginPath();
    c.arc(cx + 8, y + 26, 6, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = UI_COLORS.textBody;
    c.font = '12px system-ui, sans-serif';
    c.textAlign = 'left';
    c.textBaseline = 'middle';
    c.fillText('x' + count, cx + 18, y + 26);
    c.fillStyle = UI_COLORS.textDim;
    c.font = '9px system-ui, sans-serif';
    c.fillText(spec.name, cx + 18, y + 42);
    cx += 80;
  }
  const estimate = getWaveEstimate(game?.wave);
  if (estimate) {
    const start = formatSeconds(
      readNumber(estimate, ['startTime', 'startDelay', 'secondsUntilStart', 'timeUntilStart', 'startsIn'])
    );
    const clear = formatSeconds(
      readNumber(estimate, ['clearDuration', 'estimatedClearDuration', 'duration', 'clearTime'])
    );
    const gold = readNumber(estimate, ['gold', 'totalGold', 'rewardGold', 'goldReward']);
    const revive = getReviveEstimate(estimate);
    const estimateNecromancer = estimate?.necromancer ?? estimate?.hasNecromancer;
    const hasNecromancer =
      typeof estimateNecromancer === 'boolean' ? estimateNecromancer : previewHasNecromancer(preview);

    const firstLine = [];
    if (start != null) firstLine.push({ label: 'Start: ', value: start });
    if (clear != null) firstLine.push({ label: 'Clear: ', value: clear });
    if (gold != null) firstLine.push({ label: 'Gold: ', value: String(gold) });

    const reviveText =
      hasNecromancer && revive
        ? {
            label: 'Revive: ',
            value: `+${revive.count ?? 0}${revive.gold != null ? ' / +' + revive.gold + 'g' : ''}`,
          }
        : null;

    drawEstimateLine(
      c,
      UI_LAYOUT.shopWidth + 12,
      y + 62,
      rightEdge,
      firstLine.length ? firstLine : reviveText ? [reviveText] : []
    );
    if (reviveText && firstLine.length) {
      drawEstimateLine(c, UI_LAYOUT.shopWidth + 12, y + 66, rightEdge, [reviveText]);
    }
  }

  c.textBaseline = 'alphabetic';
}
