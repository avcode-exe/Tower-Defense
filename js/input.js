// Input: maps raw mouse / keyboard events to Game-level events. Canvas
// listener is attached by Game.

class Input {
  constructor(canvas, game) {
    this.canvas = canvas;
    this.game = game;
    this.hoverPx = null;
    this.hoverPy = null;
    this._rect = canvas.getBoundingClientRect();

    canvas.addEventListener('mousemove', (e) => {
      // Only recalc layout on resize; mousemove should not force layout.
      const r = this._rect;
      this.hoverPx = e.clientX - r.left;
      this.hoverPy = e.clientY - r.top;
      RENDERER.hoverPx = this.hoverPx;
      RENDERER.hoverPy = this.hoverPy;
    });
    canvas.addEventListener('mouseleave', () => {
      this.hoverPx = null;
      this.hoverPy = null;
      RENDERER.hoverPx = null;
      RENDERER.hoverPy = null;
    });
    canvas.addEventListener('mousedown', (e) => {
      // Recalc rect on mousedown for accuracy after window resize.
      const r = this.canvas.getBoundingClientRect();
      const px = e.clientX - r.left;
      const py = e.clientY - r.top;
      this.game.onMouseDown(px, py, e.button);
    });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());

    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      const r = this._rect;
      const px = e.clientX - r.left;
      const py = e.clientY - r.top;
      if (!UI_LAYOUT.collapsed.shop && px < UI_LAYOUT.shopWidth && py > UI_LAYOUT.hudHeight) {
        UI.shopScrollY += e.deltaY * 0.5;
      }
    }, { passive: false });

    window.addEventListener('keydown', (e) => {
      this.game.onKeyDown(e);
    });

    // Recalc cached rect on window resize.
    this._resizeListener = () => { this._rect = this.canvas.getBoundingClientRect(); };
    window.addEventListener('resize', this._resizeListener);
  }

  destroy() {
    window.removeEventListener('resize', this._resizeListener);
  }
}
