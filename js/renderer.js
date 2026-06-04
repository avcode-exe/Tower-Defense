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

  // Cached offscreen canvases for static layers (grid, path)
  _bgCache: null,     // ground + grid lines
  _pathCache: null,   // path tiles only
  _cacheDirty: true,  // set to true when grid changes

  markCacheDirty() { this._cacheDirty = true; },

  init(canvas) {
    this.ctx = canvas.getContext('2d');
    this._bgCache = document.createElement('canvas');
    this._pathCache = document.createElement('canvas');
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

    const MARGIN = 12;
    const mapSize = CONFIG.GRID_SIZE * CONFIG.TILE_SIZE;
    this.mapPixelSize = mapSize;
    this.hudHeight = UI_LAYOUT.hudHeight;
    this.shopWidth = UI_LAYOUT.shopWidth;
    const availW = this.width - this.shopWidth - MARGIN * 2;
    const availH = this.height - this.hudHeight - UI_LAYOUT.previewHeight - MARGIN * 2;
    const sX = availW / mapSize;
    const sY = availH / mapSize;
    this.scale = Math.min(1, Math.max(0.25, Math.min(sX, sY)));
    this.offsetX = this.shopWidth + MARGIN + (availW - mapSize * this.scale) / 2;
    this.offsetY = this.hudHeight + MARGIN + (availH - mapSize * this.scale) / 2;
    const renderedBottom = this.offsetY + mapSize * this.scale;
    const maxBottom = this.height - UI_LAYOUT.previewHeight - MARGIN;
    if (renderedBottom > maxBottom) {
      this.offsetY = maxBottom;
    }
    const minTop = this.hudHeight + MARGIN;
    if (this.offsetY < minTop) {
      this.offsetY = minTop;
    }

    // Invalidate caches on resize
    this._cacheDirty = true;
  },

  // (Re)build static background + path caches at tile-scale resolution
  _rebuildCache(grid) {
    if (!this._bgCache || !this._pathCache) return;
    const T = CONFIG.TILE_SIZE;
    const ms = CONFIG.GRID_SIZE * T;

    // Ground + grid lines — 1× CSS pixel resolution
    this._bgCache.width = Math.floor(ms);
    this._bgCache.height = Math.floor(ms);
    const bgCtx = this._bgCache.getContext('2d');
    bgCtx.setTransform(1, 0, 0, 1, 0, 0);
    bgCtx.fillStyle = '#1c2a22';
    bgCtx.fillRect(0, 0, ms, ms);
    // Buildable overlay (very faint)
    if (grid) {
      for (let y = 0; y < CONFIG.GRID_SIZE; y++) {
        for (let x = 0; x < CONFIG.GRID_SIZE; x++) {
          if (grid.get(x, y) === TILE.EMPTY) {
            bgCtx.fillStyle = 'rgba(120,200,120,0.04)';
            bgCtx.fillRect(x * T, y * T, T, T);
          }
        }
      }
    }
    // Grid lines
    bgCtx.strokeStyle = CONFIG.COLORS.gridLine;
    bgCtx.lineWidth = 1;
    for (let i = 0; i <= CONFIG.GRID_SIZE; i++) {
      bgCtx.beginPath();
      bgCtx.moveTo(i * T, 0);
      bgCtx.lineTo(i * T, ms);
      bgCtx.stroke();
      bgCtx.beginPath();
      bgCtx.moveTo(0, i * T);
      bgCtx.lineTo(ms, i * T);
      bgCtx.stroke();
    }

    // Path tiles (drawn on transparent background)
    this._pathCache.width = Math.floor(ms);
    this._pathCache.height = Math.floor(ms);
    const pCtx = this._pathCache.getContext('2d');
    pCtx.setTransform(1, 0, 0, 1, 0, 0);
    if (grid) {
      pCtx.fillStyle = CONFIG.COLORS.path;
      for (let y = 0; y < CONFIG.GRID_SIZE; y++) {
        for (let x = 0; x < CONFIG.GRID_SIZE; x++) {
          if (grid.get(x, y) === TILE.PATH) {
            pCtx.fillRect(x * T, y * T, T, T);
          }
        }
      }
    }

    this._cacheDirty = false;
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

  // Draw cached static layers — called instead of per-frame tile loops
  drawStaticLayers(grid) {
    if (this._cacheDirty || !this._bgCache || !this._pathCache) {
      this._rebuildCache(grid);
    }
    const c = this.ctx;
    c.save();
    c.translate(this.offsetX, this.offsetY);
    c.scale(this.scale, this.scale);
    c.drawImage(this._bgCache, 0, 0);
    c.drawImage(this._pathCache, 0, 0);
    c.restore();
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
