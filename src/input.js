// Input: maps raw mouse / keyboard events to Game-level events. Canvas
// listener is attached by Game.
import { RENDERER } from './rendering/renderer.js';
import { UI_LAYOUT, UI } from './ui/index.js';

export class Input {
  constructor(canvas, game) {
    this.canvas = canvas;
    this.game = game;
    this.hoverPx = null;
    this.hoverPy = null;
    this._listenerOptions = { passive: true };
    this._wheelOptions = { passive: false };

    this._onMouseMove = (e) => {
      const r = this.canvas.getBoundingClientRect();
      this.hoverPx = e.clientX - r.left;
      this.hoverPy = e.clientY - r.top;
      RENDERER.hoverPx = this.hoverPx;
      RENDERER.hoverPy = this.hoverPy;
    };
    this._onMouseLeave = () => {
      this.hoverPx = null;
      this.hoverPy = null;
      RENDERER.hoverPx = null;
      RENDERER.hoverPy = null;
    };
    this._onMouseDown = (e) => {
      // Recalc rect on mousedown for accuracy after window resize.
      const r = this.canvas.getBoundingClientRect();
      const px = e.clientX - r.left;
      const py = e.clientY - r.top;
      this.game.onMouseDown(px, py, e.button);
    };
    this._onContextMenu = (e) => e.preventDefault();

    this._onWheel = (e) => {
      e.preventDefault();
      const r = this.canvas.getBoundingClientRect();
      const px = e.clientX - r.left;
      const py = e.clientY - r.top;
      if (
        !UI_LAYOUT.collapsed.shieldShop &&
        px > RENDERER.width - UI_LAYOUT.shieldShopWidth &&
        py > UI_LAYOUT.hudHeight
      ) {
        return; // consume; no scrollable content in shield panel v1
      }
      if (!UI_LAYOUT.collapsed.shop && px < UI_LAYOUT.shopWidth && py > UI_LAYOUT.hudHeight) {
        UI.shopScrollY += e.deltaY * 0.5;
      }
    };

    this._onKeyDown = (e) => {
      this.game.onKeyDown(e);
    };

    canvas.addEventListener('mousemove', this._onMouseMove, this._listenerOptions);
    canvas.addEventListener('mouseleave', this._onMouseLeave, this._listenerOptions);
    canvas.addEventListener('mousedown', this._onMouseDown, this._listenerOptions);
    canvas.addEventListener('contextmenu', this._onContextMenu);
    canvas.addEventListener('wheel', this._onWheel, this._wheelOptions);
    window.addEventListener('keydown', this._onKeyDown);
  }

  destroy() {
    const canvas = this.canvas;
    canvas.removeEventListener('mousemove', this._onMouseMove, this._listenerOptions);
    canvas.removeEventListener('mouseleave', this._onMouseLeave, this._listenerOptions);
    canvas.removeEventListener('mousedown', this._onMouseDown, this._listenerOptions);
    canvas.removeEventListener('contextmenu', this._onContextMenu);
    canvas.removeEventListener('wheel', this._onWheel, this._wheelOptions);
    window.removeEventListener('keydown', this._onKeyDown);
  }
}
