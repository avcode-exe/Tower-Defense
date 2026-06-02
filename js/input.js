// Input: maps raw mouse / keyboard events to Game-level events. Canvas
// listener is attached by Game.

class Input {
  constructor(canvas, game) {
    this.canvas = canvas;
    this.game = game;
    this.hoverPx = null;
    this.hoverPy = null;

    canvas.addEventListener('mousemove', (e) => {
      const rect = canvas.getBoundingClientRect();
      this.hoverPx = e.clientX - rect.left;
      this.hoverPy = e.clientY - rect.top;
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
      const rect = canvas.getBoundingClientRect();
      const px = e.clientX - rect.left;
      const py = e.clientY - rect.top;
      this.game.onMouseDown(px, py, e.button);
    });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());

    window.addEventListener('keydown', (e) => {
      this.game.onKeyDown(e);
    });
  }
}
