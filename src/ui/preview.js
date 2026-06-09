import { RENDERER } from '../rendering/renderer.js';
import { CONFIG, MONSTER_SPECS } from '../config.js';
import { UI_LAYOUT, UI_COLORS } from './constants.js';
import { drawToggleButton } from './utils.js';

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
    c.fillText('Next Wave', UI_LAYOUT.shopWidth + 12, y + 16);

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
        c.arc(cx + 8, y + 18, 6, 0, Math.PI * 2);
        c.fill();
        c.fillStyle = UI_COLORS.textBody;
        c.font = '12px system-ui, sans-serif';
        c.textAlign = 'left';
        c.textBaseline = 'middle';
        c.fillText('x' + count, cx + 18, y + 18);
        c.fillStyle = UI_COLORS.textDim;
        c.font = '9px system-ui, sans-serif';
        c.fillText(spec.name, cx + 18, y + 34);
        cx += 80;
    }
    c.textBaseline = 'alphabetic';
}
