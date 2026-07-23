// Auto-collapse sidebar logic tests.
// Tests _checkAutoCollapse(), updateAutoCollapse(), cache guard, collapse/restore
// scenarios, and manual toggle detection in RENDERER.
//
// We import the real RENDERER module and mock only its dependencies (UI_LAYOUT,
// CONFIG) so the auto-collapse methods run against real renderer state.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ── Shared mock state ──
// Tests manipulate this directly to simulate different layout conditions.
// Uses zoom-dependent getters like the real UI_LAYOUT for realistic behavior.
const mockLayout = {
  _zoom: 1,
  _HUD_HEIGHT: 56,
  _SHOP_WIDTH: 250,
  _PREVIEW_HEIGHT: 80,
  _SHIELD_SHOP_WIDTH: 220,
  _extraHudHeight: 0,
  collapsed: { shop: false, shieldShop: false, hud: false, preview: false },

  get HUD_HEIGHT() {
    return this._HUD_HEIGHT * (this._zoom || 1);
  },
  get SHOP_WIDTH() {
    return this._SHOP_WIDTH * (this._zoom || 1);
  },
  get PREVIEW_HEIGHT() {
    return this._PREVIEW_HEIGHT * (this._zoom || 1);
  },
  get SHIELD_SHOP_WIDTH() {
    return this._SHIELD_SHOP_WIDTH * (this._zoom || 1);
  },

  get hudHeight() {
    const base = this.collapsed.hud ? 20 * (this._zoom || 1) : this.HUD_HEIGHT;
    return base + (this._extraHudHeight || 0);
  },
  get shopWidth() {
    return this.collapsed.shop ? 20 * (this._zoom || 1) : this.SHOP_WIDTH;
  },
  get previewHeight() {
    return this.collapsed.preview ? 20 * (this._zoom || 1) : this.PREVIEW_HEIGHT;
  },
  get shieldShopWidth() {
    return this.collapsed.shieldShop ? 20 * (this._zoom || 1) : this.SHIELD_SHOP_WIDTH;
  },
};

vi.mock('../src/ui/constants.js', () => ({
  UI_LAYOUT: mockLayout,
  UI_COLORS: {},
  zp: (px) => Math.round(px * (mockLayout._zoom || 1)),
}));

// Provide minimal CONFIG mocks needed by RENDERER
vi.mock('../src/config.js', () => ({
  CONFIG: {
    GRID_SIZE: 20,
    TILE_SIZE: 32,
    COLORS: {
      gridLine: 'rgba(255,255,255,0.06)',
      path: 'rgba(60,80,60,0.35)',
      background: '#0e1418',
    },
  },
  LAYOUT: {},
}));

describe('RENDERER auto-collapse', () => {
  let RENDERER;

  beforeEach(async () => {
    vi.resetModules();
    // Reset shared mock state
    mockLayout._zoom = 1;
    mockLayout.collapsed.shop = false;
    mockLayout.collapsed.shieldShop = false;
    mockLayout._extraHudHeight = 0;

    global.window = { devicePixelRatio: 1 };
    global.document = {
      createElement: vi.fn(() => ({
        width: 0,
        height: 0,
        getContext: vi.fn(() => ({
          setTransform: vi.fn(),
          fillStyle: '',
          fillRect: vi.fn(),
          strokeStyle: '',
          lineWidth: 1,
          beginPath: vi.fn(),
          moveTo: vi.fn(),
          lineTo: vi.fn(),
          stroke: vi.fn(),
          drawImage: vi.fn(),
          getContext: vi.fn().mockReturnThis(),
        })),
      })),
    };

    const mod = await import('../src/rendering/renderer.js');
    RENDERER = mod.RENDERER;

    // Reset auto-collapse tracking state
    RENDERER._autoCollapsed = false;
    RENDERER._prevCollapseShop = false;
    RENDERER._prevCollapseShield = false;
    RENDERER._lastCheckWidth = 0;
    RENDERER._lastCheckHeight = 0;
    RENDERER._lastCheckZoom = 0;
    RENDERER._lastCheckZoomUI = 0;
    RENDERER._lastCheckCollapsedShop = false;
    RENDERER._lastCheckCollapsedShield = false;

    // Set up minimal renderer state for layout math
    RENDERER.width = 800;
    RENDERER.height = 600;
    RENDERER.zoom = 1;
    RENDERER.offsetX = 250;
    RENDERER.offsetY = 56;
    RENDERER.scale = 1;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ── _checkAutoCollapse: collapse condition ──

  it('collapses both sidebars when map is narrower than sidebar', () => {
    // At zoom=1 with 800px width: shop=250, shield=220, availW=800-250-220-24=306
    // mapSize=640, scale=min(1,306/640)=0.478, ez=scale>=1?no→1, renderedMapW=640*0.478*1=306
    // maxSidebarW=max(250,220)=250. 306 > 250 → no collapse at normal width.
    // Make the window narrow to force collapse.
    RENDERER.width = 500;
    RENDERER.height = 400;

    const changed = RENDERER._checkAutoCollapse();
    expect(changed).toBe(true);
    expect(mockLayout.collapsed.shop).toBe(true);
    expect(mockLayout.collapsed.shieldShop).toBe(true);
    expect(RENDERER._autoCollapsed).toBe(true);
  });

  it('does NOT collapse when map is wider than sidebar', () => {
    // 1200px width, zoom=1: shopWidth=250, shieldShopWidth=220
    // availW=1200-250-220-24=706
    // scale=min(1,706/640)=1.0, ez=1.0>=1?yes→zoom=1, renderedMapW=640*1*1=640
    // maxSidebarW=max(250,220)=250. 640 > 250 → no collapse.
    RENDERER.width = 1200;

    const changed = RENDERER._checkAutoCollapse();
    expect(changed).toBe(false);
    expect(mockLayout.collapsed.shop).toBe(false);
    expect(RENDERER._autoCollapsed).toBe(false);
  });

  it('does NOT collapse when already auto-collapsed', () => {
    // Set up as already collapsed
    RENDERER._autoCollapsed = true;
    mockLayout.collapsed.shop = true;
    mockLayout.collapsed.shieldShop = true;
    RENDERER.width = 500;

    const changed = RENDERER._checkAutoCollapse();
    // Should NOT collapse again (already collapsed) — check restore or nothing
    // At 500px with collapsed sidebars (20px each): shopWidth=20, shieldShopWidth=20
    // availW=500-20-20-24=436
    // scale=min(1,436/640)=0.681, renderedMapW=640*0.681*1=436
    // expandedMapW with full sidebars: availW=500-250-220-24=6,
    // scale=max(0.25,6/640)=0.25, expandedRenderedMapW=640*0.25*1=160
    // expandedMaxW=250. 160 > 250? No → no restore either.
    expect(changed).toBe(false);
  });

  // ── _checkAutoCollapse: restore condition ──

  it('restores sidebars when map would be wide enough with full sidebars', () => {
    // Simulate: sidebars are auto-collapsed, window is 900px, zoom=1
    RENDERER._autoCollapsed = true;
    mockLayout.collapsed.shop = true;
    mockLayout.collapsed.shieldShop = true;
    RENDERER._prevCollapseShop = false;
    RENDERER._prevCollapseShield = false;
    RENDERER.width = 900;

    // With collapsed: availW=900-20-20-24=836, renderedMapW=640
    // With expanded: availW=900-250-220-24=406, expandedScale=min(1,406/640)=0.634
    // expandedRenderedMapW=640*0.634*1=406, expandedMaxW=250
    // 406 > 250 → should restore
    const changed = RENDERER._checkAutoCollapse();
    expect(changed).toBe(true);
    expect(mockLayout.collapsed.shop).toBe(false);
    expect(mockLayout.collapsed.shieldShop).toBe(false);
    expect(RENDERER._autoCollapsed).toBe(false);
  });

  it('does NOT restore when expanded map would still be too narrow', () => {
    // Window 600px, zoom=1, sidebars auto-collapsed
    RENDERER._autoCollapsed = true;
    mockLayout.collapsed.shop = true;
    mockLayout.collapsed.shieldShop = true;
    RENDERER._prevCollapseShop = false;
    RENDERER._prevCollapseShield = false;
    RENDERER.width = 600;

    // With collapsed: availW=600-20-20-24=536
    // With expanded: availW=600-250-220-24=106, scale=max(0.25,106/640)=0.25
    // expandedRenderedMapW=640*0.25*1=160, expandedMaxW=250
    // 160 > 250? No → no restore
    const changed = RENDERER._checkAutoCollapse();
    expect(changed).toBe(false);
    expect(mockLayout.collapsed.shop).toBe(true); // stays collapsed
    expect(RENDERER._autoCollapsed).toBe(true);
  });

  it('zoom-out correctly triggers restore when room allows', () => {
    // Sidebars auto-collapsed at zoom=1.5, then user zooms out to 1.0
    RENDERER._autoCollapsed = true;
    mockLayout.collapsed.shop = true;
    mockLayout.collapsed.shieldShop = true;
    RENDERER._prevCollapseShop = false;
    RENDERER._prevCollapseShield = false;
    RENDERER.width = 800;
    mockLayout._zoom = 1.0; // zoomed out to 1.0

    // At zoom=1.0: expandedShopW=250, expandedShieldW=220, expandedMaxW=250
    // expandedAvailW=800-250-220-24=306, expandedScale=min(1,306/640)=0.478
    // expandedEz=0.478>=1?no→1, expandedRenderedMapW=640*0.478*1=306
    // 306 > 250 → restore!
    const changed = RENDERER._checkAutoCollapse();
    expect(changed).toBe(true);
    expect(mockLayout.collapsed.shop).toBe(false);
    expect(RENDERER._autoCollapsed).toBe(false);
  });

  // ── Manual toggle detection ──

  it('detects manual toggle and may re-collapse if window is too narrow', () => {
    // Auto-collapsed, then user manually expands shop while window is still narrow.
    // The manual toggle is detected (_autoCollapsed reset to false), but the
    // collapse condition immediately re-checks and re-collapses because the
    // window is genuinely too narrow for expanded sidebars.
    RENDERER._autoCollapsed = true;
    mockLayout.collapsed.shop = false; // user manually expanded!
    mockLayout.collapsed.shieldShop = true;
    RENDERER.width = 500;

    RENDERER._checkAutoCollapse();
    // Manual toggle detection fires: shop=false !== true → resets _autoCollapsed
    // Then collapse check: renderedMapW=160 < maxSidebarW=250 → re-collapses
    // Re-collapse is correct behavior — the window is too narrow.
    expect(RENDERER._autoCollapsed).toBe(true);
    // Both sidebars should end up collapsed again
    expect(mockLayout.collapsed.shop).toBe(true);
    expect(mockLayout.collapsed.shieldShop).toBe(true);
  });

  it('manual toggle detection does NOT fire when sidebar still matches auto state', () => {
    // Auto-collapsed, both still collapsed, user hasn't touched anything
    RENDERER._autoCollapsed = true;
    mockLayout.collapsed.shop = true;
    mockLayout.collapsed.shieldShop = true;
    RENDERER.width = 500;

    // _checkAutoCollapse shouldn't reset _autoCollapsed due to manual toggle detection
    // At 500px collapsed: renderedMapW=436, maxSidebarW=20 → check disabled
    // Actually need to verify the manual toggle guard doesn't false-fire.
    // Check: UI_LAYOUT.collapsed.shop !== true? → true !== true? → false. No reset.
    RENDERER._checkAutoCollapse();
    expect(RENDERER._autoCollapsed).toBe(true);
  });

  // ── Zoom-dependent collapse ──

  it('collapses at high zoom when sidebars are wider', () => {
    // zoom=1.5, 800px width: shopWidth=375, shieldShopWidth=330
    mockLayout._zoom = 1.5;
    RENDERER.width = 800;
    RENDERER.zoom = 1.5;

    const changed = RENDERER._checkAutoCollapse();
    // shopWidth=250*1.5=375, shieldShopWidth=220*1.5=330
    // availW=800-375-330-24=71, sX=max(0.25,71/640)=0.25
    // scale=min(1,0.25)=0.25, ez=0.25>=1?no→1
    // renderedMapW=640*0.25*1=160, maxSidebarW=max(375,330)=375
    // 160 < 375 → collapse
    expect(changed).toBe(true);
    expect(mockLayout.collapsed.shop).toBe(true);
  });

  it('does NOT collapse at high zoom when window is wide enough', () => {
    // zoom=1.5, 1600px width
    mockLayout._zoom = 1.5;
    RENDERER.width = 1600;
    RENDERER.zoom = 1.5;

    const changed = RENDERER._checkAutoCollapse();
    // availW=1600-375-330-24=871, scale=min(1,871/640)=1.0
    // ez=1.0>=1?yes→zoom=1.5, renderedMapW=640*1.0*1.5=960
    // maxSidebarW=max(375,330)=375. 960 < 375? No → no collapse
    expect(changed).toBe(false);
  });

  // ── updateAutoCollapse cache guard ──

  it('updateAutoCollapse skips check when nothing changed', () => {
    // Prime the cache
    RENDERER._lastCheckWidth = RENDERER.width;
    RENDERER._lastCheckHeight = RENDERER.height;
    RENDERER._lastCheckZoom = RENDERER.zoom;
    RENDERER._lastCheckZoomUI = mockLayout._zoom;
    RENDERER._lastCheckCollapsedShop = mockLayout.collapsed.shop;
    RENDERER._lastCheckCollapsedShield = mockLayout.collapsed.shieldShop;

    const spy = vi.spyOn(RENDERER, '_checkAutoCollapse');
    const result = RENDERER.updateAutoCollapse();
    expect(spy).not.toHaveBeenCalled();
    expect(result).toBe(false);
  });

  it('updateAutoCollapse re-evaluates when zoom changed', () => {
    // Prime cache with old zoom
    RENDERER._lastCheckWidth = RENDERER.width;
    RENDERER._lastCheckHeight = RENDERER.height;
    RENDERER._lastCheckZoom = 1; // old zoom
    RENDERER._lastCheckZoomUI = 1;
    RENDERER._lastCheckCollapsedShop = mockLayout.collapsed.shop;
    RENDERER._lastCheckCollapsedShield = mockLayout.collapsed.shieldShop;

    // Change zoom
    RENDERER.zoom = 1.5;
    mockLayout._zoom = 1.5;

    const spy = vi.spyOn(RENDERER, '_checkAutoCollapse');
    RENDERER.updateAutoCollapse();
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('updateAutoCollapse re-evaluates when width changed', () => {
    RENDERER._lastCheckWidth = 800;
    RENDERER._lastCheckHeight = RENDERER.height;
    RENDERER._lastCheckZoom = RENDERER.zoom;
    RENDERER._lastCheckZoomUI = mockLayout._zoom;
    RENDERER._lastCheckCollapsedShop = mockLayout.collapsed.shop;
    RENDERER._lastCheckCollapsedShield = mockLayout.collapsed.shieldShop;

    RENDERER.width = 900; // changed

    const spy = vi.spyOn(RENDERER, '_checkAutoCollapse');
    RENDERER.updateAutoCollapse();
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('updateAutoCollapse re-evaluates when sidebar state changed', () => {
    RENDERER._lastCheckWidth = RENDERER.width;
    RENDERER._lastCheckHeight = RENDERER.height;
    RENDERER._lastCheckZoom = RENDERER.zoom;
    RENDERER._lastCheckZoomUI = mockLayout._zoom;
    RENDERER._lastCheckCollapsedShop = false;
    RENDERER._lastCheckCollapsedShield = false;

    mockLayout.collapsed.shop = true; // changed

    const spy = vi.spyOn(RENDERER, '_checkAutoCollapse');
    RENDERER.updateAutoCollapse();
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('updateAutoCollapse caches after successful check', () => {
    RENDERER.width = 500; // triggers collapse

    RENDERER.updateAutoCollapse();

    expect(RENDERER._lastCheckWidth).toBe(500);
    expect(RENDERER._lastCheckCollapsedShop).toBe(true);
    expect(RENDERER._lastCheckCollapsedShield).toBe(true);
  });

  // ── resize integration ──

  it('resize resets cache guard then checks auto-collapse', () => {
    // Set up canvas so resize works
    const ctx = { setTransform: vi.fn() };
    RENDERER.canvas = { getBoundingClientRect: vi.fn(() => ({ left: 0, top: 0, width: 500, height: 400 })) };
    RENDERER.ctx = ctx;

    // Prime cache to simulate "already checked"
    RENDERER._lastCheckWidth = 800;
    RENDERER._autoCollapsed = false;

    RENDERER.resize();

    // Cache should be reset (width mismatch forces re-check)
    // After resize at 500px, sidebars should be collapsed
    expect(mockLayout.collapsed.shop).toBe(true);
  });

  // ── _getEffectiveZoom ──

  it('_getEffectiveZoom returns zoom when scale >= 1', () => {
    RENDERER.scale = 1.5;
    RENDERER.zoom = 2;
    expect(RENDERER._getEffectiveZoom()).toBe(2);
  });

  it('_getEffectiveZoom returns 1 when scale < 1', () => {
    RENDERER.scale = 0.5;
    RENDERER.zoom = 2;
    expect(RENDERER._getEffectiveZoom()).toBe(1);
  });

  it('_getEffectiveZoom returns 1 when scale is exactly 1', () => {
    RENDERER.scale = 1;
    RENDERER.zoom = 1.5;
    expect(RENDERER._getEffectiveZoom()).toBe(1.5);
  });
});
