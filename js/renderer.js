// Renderer: low-level canvas drawing helpers. The renderer is stateless and
// only knows how to draw shapes. The Game class decides what to draw.

const RENDERER = {
  ctx: null,
  width: 0,
  height: 0,
  scale: 1,
  offsetX: 0,
  offsetY: 0,
  mapPixelSize: 0,

  init(canvas) {
    this.ctx = canvas.getContext('2d');
    this.resize(canvas);
  },

  resize(canvas) {
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = Math.floor(rect.width * dpr);
    canvas.height = Math.floor(rect.height * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.width = rect.width;
    this.height = rect.height;

    const mapSize = CONFIG.GRID_SIZE * CONFIG.TILE_SIZE;
    this.mapPixelSize = mapSize;
    this.hudHeight = UI_LAYOUT.hudHeight;
    this.shopWidth = UI_LAYOUT.shopWidth;
    const availW = this.width - this.shopWidth;
    const availH = this.height - this.hudHeight - UI_LAYOUT.previewHeight;
    const sX = availW / mapSize;
    const sY = availH / mapSize;
    this.scale = Math.min(sX, sY, 1);
    this.offsetX = (this.width - this.shopWidth - mapSize * this.scale) / 2 + this.shopWidth;
    this.offsetY = (this.height - this.hudHeight - mapSize * this.scale) / 2 + this.hudHeight;
  },

  // Convert a canvas-pixel coord to a world coord (in the play area).
  toWorld(px, py) {
    return {
      x: (px - this.offsetX) / this.scale,
      y: (py - this.offsetY) / this.scale,
    };
  },

  beginFrame() {
    const c = this.ctx;
    c.fillStyle = CONFIG.COLORS.background;
    c.fillRect(0, 0, this.width, this.height);
  },

  applyMapTransform() {
    const c = this.ctx;
    c.save();
    c.translate(this.offsetX, this.offsetY);
    c.scale(this.scale, this.scale);
  },

  restoreTransform() {
    this.ctx.restore();
  },

  fillRect(x, y, w, h, color) {
    this.ctx.fillStyle = color;
    this.ctx.fillRect(x, y, w, h);
  },

  strokeRect(x, y, w, h, color, lineWidth) {
    this.ctx.strokeStyle = color;
    this.ctx.lineWidth = lineWidth || 1;
    this.ctx.strokeRect(x, y, w, h);
  },

  fillCircle(x, y, r, color) {
    this.ctx.fillStyle = color;
    this.ctx.beginPath();
    this.ctx.arc(x, y, r, 0, Math.PI * 2);
    this.ctx.fill();
  },
};
