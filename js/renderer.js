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
  _dpr: 1,            // cached devicePixelRatio

  markCacheDirty() { this._cacheDirty = true; },

  init(canvas) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Failed to get 2D canvas context');
    this.ctx = ctx;
    this._bgCache = document.createElement('canvas');
    this._pathCache = document.createElement('canvas');
    this.resize(canvas);
  },

  resize(canvas) {
    const dpr = window.devicePixelRatio || 1;
    this._dpr = dpr;
    const rect = canvas.getBoundingClientRect();
    canvas.width = Math.floor(rect.width * dpr);
    canvas.height = Math.floor(rect.height * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.width = rect.width;
    this.height = rect.height;

    const MARGIN = 12;
    const mapSize = CONFIG.GRID_SIZE * CONFIG.TILE_SIZE;
    this.mapPixelSize = mapSize;
    const availW = this.width - UI_LAYOUT.shopWidth - MARGIN * 2;
    const availH = this.height - UI_LAYOUT.hudHeight - UI_LAYOUT.previewHeight - MARGIN * 2;
    const sX = availW / mapSize;
    const sY = availH / mapSize;
    this.scale = Math.min(1, Math.max(0.25, Math.min(sX, sY)));
    this.offsetX = UI_LAYOUT.shopWidth + MARGIN + (availW - mapSize * this.scale) / 2;
    this.offsetY = UI_LAYOUT.hudHeight + MARGIN + (availH - mapSize * this.scale) / 2;
    const renderedBottom = this.offsetY + mapSize * this.scale;
    const maxBottom = this.height - UI_LAYOUT.previewHeight - MARGIN;
    if (renderedBottom > maxBottom) {
      this.offsetY = maxBottom;
    }
    const minTop = UI_LAYOUT.hudHeight + MARGIN;
    if (this.offsetY < minTop) {
      this.offsetY = minTop;
    }

    // Invalidate caches on resize
    this._cacheDirty = true;
  },

  // (Re)build static background + path caches at device-pixel resolution for
  // sharp rendering on HiDPI displays.
  _rebuildCache(grid) {
    if (!this._bgCache || !this._pathCache) return;
    const T = CONFIG.TILE_SIZE;
    const ms = CONFIG.GRID_SIZE * T;
    const dpr = this._dpr;
    const cacheW = Math.floor(ms * dpr);
    const cacheH = Math.floor(ms * dpr);

    // Ground + grid lines — device-pixel resolution
    this._bgCache.width = cacheW;
    this._bgCache.height = cacheH;
    const bgCtx = this._bgCache.getContext('2d');
    bgCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
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
    this._pathCache.width = cacheW;
    this._pathCache.height = cacheH;
    const pCtx = this._pathCache.getContext('2d');
    pCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
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

  // Zero-allocation variant: writes into an existing {x,y} object.
  toWorldInto(px, py, out) {
    out.x = (px - this.offsetX) / this.scale;
    out.y = (py - this.offsetY) / this.scale;
    return out;
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
    // Cache is DPR-scaled internally; draw at CSS-pixel size so the
    // main canvas DPR transform maps it to device-pixel sharpness.
    const ms = CONFIG.GRID_SIZE * CONFIG.TILE_SIZE;
    c.drawImage(this._bgCache, 0, 0, ms, ms);
    c.drawImage(this._pathCache, 0, 0, ms, ms);
    c.restore();
  },

};
