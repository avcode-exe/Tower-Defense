import { CONFIG, LAYOUT } from '../config.js';
import { TILE } from '../grid.js';
import { UI_LAYOUT } from '../ui/constants.js';

// Renderer: low-level canvas drawing helpers. The renderer is stateless and
// only knows how to draw shapes. The Game class decides what to draw.

export const RENDERER = {
  ctx: null,
  width: 0,
  height: 0,
  scale: 1,
  zoom: 1,
  offsetX: 0,
  offsetY: 0,
  mapPixelSize: 0,

  // Auto-collapse sidebar tracking
  _autoCollapsed: false,
  _prevCollapseShop: false,
  _prevCollapseShield: false,
  // Cache guard for updateAutoCollapse — avoids re-computing layout math
  // every frame when nothing relevant has changed.
  _lastCheckWidth: 0,
  _lastCheckHeight: 0,
  _lastCheckZoom: 0,
  _lastCheckZoomUI: 0,
  _lastCheckCollapsedShop: false,
  _lastCheckCollapsedShield: false,

  // Cached offscreen canvases for static layers (grid, path)
  _bgCache: null, // ground + grid lines
  _pathCache: null, // path tiles only
  _cacheDirty: true, // set to true when grid changes
  _dpr: 1, // cached devicePixelRatio

  markCacheDirty() {
    this._cacheDirty = true;
  },

  init(canvas) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Failed to get 2D canvas context');
    this.ctx = ctx;
    this.canvas = canvas;
    this._bgCache = document.createElement('canvas');
    this._pathCache = document.createElement('canvas');
    this.resize();
  },

  resize() {
    const canvas = this.canvas;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    this._dpr = dpr;
    const rect = canvas.getBoundingClientRect();
    canvas.width = Math.floor(rect.width * dpr);
    canvas.height = Math.floor(rect.height * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.width = rect.width;
    this.height = rect.height;

    // Check auto-collapse BEFORE layout computation so the layout uses
    // the updated collapse state. Reset cache guard so updateAutoCollapse
    // always re-evaluates after a window resize or panel toggle.
    this._lastCheckWidth = 0;
    this._checkAutoCollapse();

    const MARGIN = 12;
    const mapSize = CONFIG.GRID_SIZE * CONFIG.TILE_SIZE;
    this.mapPixelSize = mapSize;
    const availW = this.width - UI_LAYOUT.shopWidth - UI_LAYOUT.shieldShopWidth - MARGIN * 2;
    const availH = this.height - UI_LAYOUT.hudHeight - UI_LAYOUT.previewHeight - MARGIN * 2;
    const sX = availW / mapSize;
    const sY = availH / mapSize;
    this.scale = Math.min(1, Math.max(0.25, Math.min(sX, sY)));
    this.offsetX = UI_LAYOUT.shopWidth + MARGIN + (availW - mapSize * this.scale) / 2;
    const maxRight = this.width - UI_LAYOUT.shieldShopWidth - MARGIN;
    if (this.offsetX + mapSize * this.scale > maxRight) {
      this.offsetX = maxRight - mapSize * this.scale;
    }
    const minLeft = UI_LAYOUT.shopWidth + MARGIN;
    if (this.offsetX < minLeft) {
      this.offsetX = minLeft;
    }
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

  /**
   * Check if sidebars should be auto-collapsed because the map is narrower
   * than either sidebar. Returns true if collapse state changed.
   * Non-recursive: only updates UI_LAYOUT.collapsed, does NOT call resize().
   * The caller (resize or renderGame) is responsible for re-layout if needed.
   *
   * The restore condition uses the "expanded map width" — what the rendered
   * map would be with full-size sidebars. This prevents flip-flop because
   * after auto-collapsing, the expanded map width is computed with full
   * sidebar sizes (which would be too narrow to allow restore).
   */
  _checkAutoCollapse() {
    const mapSize = CONFIG.GRID_SIZE * CONFIG.TILE_SIZE;
    const MARGIN = 12;
    const zoom = UI_LAYOUT._zoom || 1;

    // Sidebar widths at current zoom for the collapse comparison
    const shopW = UI_LAYOUT.collapsed.shop ? 20 * zoom : UI_LAYOUT.SHOP_WIDTH;
    const shieldW = UI_LAYOUT.collapsed.shieldShop ? 20 * zoom : UI_LAYOUT.SHIELD_SHOP_WIDTH;
    const maxSidebarW = Math.max(shopW, shieldW);

    // Current rendered map width (used for collapse check).
    // Use local `zoom` (from UI_LAYOUT._zoom) instead of `this.zoom` so the
    // check is consistent even when called outside the render loop (e.g.
    // from resize() when RENDERER.zoom may still hold a stale value).
    const availW = this.width - UI_LAYOUT.shopWidth - UI_LAYOUT.shieldShopWidth - MARGIN * 2;
    const sX = Math.max(0.25, availW / mapSize);
    const scale = Math.min(1, sX);
    const ez = scale >= 1 ? zoom : 1;
    const renderedMapW = mapSize * scale * ez;

    // Expanded map width: what the map would look like with full sidebars
    // (used for restore check to prevent flip-flop).
    const expandedShopW = UI_LAYOUT.SHOP_WIDTH; // always full width
    const expandedShieldW = UI_LAYOUT.SHIELD_SHOP_WIDTH; // always full width
    const expandedMaxW = Math.max(expandedShopW, expandedShieldW);
    const expandedAvailW = this.width - expandedShopW - expandedShieldW - MARGIN * 2;
    const expandedScale = Math.min(1, Math.max(0.25, expandedAvailW / mapSize));
    const expandedEz = expandedScale >= 1 ? zoom : 1;
    const expandedRenderedMapW = mapSize * expandedScale * expandedEz;

    // If the user manually toggled a sidebar while auto-collapsed, respect
    // their choice by giving up auto-control. The expected auto-collapse
    // state is always true (collapsed), so we compare against `true` rather
    // than _prevCollapseShop (which stores the pre-collapse expanded state
    // and would incorrectly match on every frame after auto-collapse).
    if (this._autoCollapsed) {
      if (UI_LAYOUT.collapsed.shop !== true || UI_LAYOUT.collapsed.shieldShop !== true) {
        this._autoCollapsed = false;
      }
    }

    let changed = false;

    if (renderedMapW < maxSidebarW && !this._autoCollapsed) {
      // Map is too narrow — auto-collapse both
      this._prevCollapseShop = UI_LAYOUT.collapsed.shop;
      this._prevCollapseShield = UI_LAYOUT.collapsed.shieldShop;
      UI_LAYOUT.collapsed.shop = true;
      UI_LAYOUT.collapsed.shieldShop = true;
      this._autoCollapsed = true;
      changed = true;
    } else if (expandedRenderedMapW > expandedMaxW && this._autoCollapsed) {
      // The map would be wide enough even with full-size sidebars — restore.
      // Uses expandedMapW (not current renderedMapW) so this check is the
      // same regardless of whether we're currently collapsed or not, which
      // naturally eliminates the flip-flop problem on zoom changes.
      UI_LAYOUT.collapsed.shop = this._prevCollapseShop;
      UI_LAYOUT.collapsed.shieldShop = this._prevCollapseShield;
      this._autoCollapsed = false;
      changed = true;
    }

    return changed;
  },

  /** Public wrapper for external callers (like renderGame). Returns true if
   *  collapse state changed, so callers can trigger a re-layout.
   *  Skips the check entirely when nothing relevant changed since the last
   *  call — avoids re-computing layout math every frame. */
  updateAutoCollapse() {
    if (
      this._lastCheckWidth === this.width &&
      this._lastCheckHeight === this.height &&
      this._lastCheckZoom === this.zoom &&
      this._lastCheckZoomUI === UI_LAYOUT._zoom &&
      this._lastCheckCollapsedShop === UI_LAYOUT.collapsed.shop &&
      this._lastCheckCollapsedShield === UI_LAYOUT.collapsed.shieldShop
    ) {
      return false;
    }

    const changed = this._checkAutoCollapse();

    this._lastCheckWidth = this.width;
    this._lastCheckHeight = this.height;
    this._lastCheckZoom = this.zoom;
    this._lastCheckZoomUI = UI_LAYOUT._zoom;
    this._lastCheckCollapsedShop = UI_LAYOUT.collapsed.shop;
    this._lastCheckCollapsedShield = UI_LAYOUT.collapsed.shieldShop;

    return changed;
  },

  // (cache guard reset is done inline in resize() by setting _lastCheckWidth = 0)

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
    // Grid lines — batch into single paths for fewer draw calls
    bgCtx.strokeStyle = CONFIG.COLORS.gridLine;
    bgCtx.lineWidth = 1;
    bgCtx.beginPath();
    for (let i = 0; i <= CONFIG.GRID_SIZE; i++) {
      bgCtx.moveTo(i * T, 0);
      bgCtx.lineTo(i * T, ms);
      bgCtx.moveTo(0, i * T);
      bgCtx.lineTo(ms, i * T);
    }
    bgCtx.stroke();

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
    const ez = this._getEffectiveZoom();
    out.x = (px - this.offsetX) / (this.scale * ez);
    out.y = (py - this.offsetY) / (this.scale * ez);
    if (!Number.isFinite(out.x)) out.x = 0;
    if (!Number.isFinite(out.y)) out.y = 0;
    return out;
  },

  beginFrame() {
    const c = this.ctx;
    c.save();
    c.fillStyle = CONFIG.COLORS.background;
    c.fillRect(0, 0, this.width, this.height);
  },

  // Compute the effective zoom for the map: when there's headroom (scale >= 1)
  // the map can zoom in and overflow into empty canvas space. But when panels
  // crowd the map (scale < 1), cap at 1 so the map shrinks to fit without
  // multiplying scale back up and overflowing into panel space.
  _getEffectiveZoom() {
    return this.scale >= 1 ? this.zoom : 1;
  },

  applyMapTransform() {
    const c = this.ctx;
    c.save();
    const ez = this._getEffectiveZoom();
    c.translate(this.offsetX, this.offsetY);
    c.scale(this.scale * ez, this.scale * ez);
  },

  restoreTransform() {
    this.ctx.restore();
  },

  endFrame() {
    this.ctx.restore();
  },

  // Draw cached static layers — caller must have map transform applied.
  drawStaticLayers(grid) {
    if (this._cacheDirty || !this._bgCache || !this._pathCache) {
      this._rebuildCache(grid);
    }
    const c = this.ctx;
    const ms = CONFIG.GRID_SIZE * CONFIG.TILE_SIZE;
    c.drawImage(this._bgCache, 0, 0, ms, ms);
    c.drawImage(this._pathCache, 0, 0, ms, ms);
  },
};
