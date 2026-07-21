// @vitest-environment jsdom
/* tripwire inventory:
 *  - (known limitation: no TypeScript) — placement preview hit-tests are canvas-only
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

function makeGame(overrides = {}) {
  return {
    selectedSpec: overrides.selectedSpec || {
      cost: 50,
      range: 3,
      type: 'ranged',
      damage: 10,
      attackSpeed: 1,
      burnStacks: 0,
      color: '#e74c3c',
    },
    selectedTroopIndex: -1,
    troops: [],
    canPlace: vi.fn(() => true),
    getPlacementInvalidReason: vi.fn(() => null),
    grid: { isBuildable: vi.fn(() => true) },
    devMode: false,
    gold: 1000,
    state: 'WAVE_ACTIVE',
    ...overrides,
  };
}

const ctxBind = { _ghostPos: { x: 0, y: 0 }, _tileScratch: { gx: 0, gy: 0 } };

vi.mock('../src/rendering/renderer.js', () => ({
  RENDERER: {
    init: vi.fn(),
    resize: vi.fn(),
    markCacheDirty: vi.fn(),
    _rebuildCache: vi.fn(),
    toWorldInto: vi.fn((px, py, out) => {
      out.x = px;
      out.y = py;
      return out;
    }),
    beginFrame: vi.fn(),
    applyMapTransform: vi.fn(),
    drawStaticLayers: vi.fn(),
    restoreTransform: vi.fn(),
    width: 800,
    height: 600,
    offsetX: 0,
    offsetY: 0,
    scale: 1,
    hoverPx: 350,
    hoverPy: 200,
    canvas: null,
    ctx: {
      fillStyle: '',
      strokeStyle: '',
      lineWidth: 1,
      font: '',
      textAlign: '',
      textBaseline: '',
      globalAlpha: 1,
      setTransform: vi.fn(),
      fillRect: vi.fn(),
      strokeRect: vi.fn(),
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      quadraticCurveTo: vi.fn(),
      arc: vi.fn(),
      closePath: vi.fn(),
      fill: vi.fn(),
      stroke: vi.fn(),
      save: vi.fn(),
      restore: vi.fn(),
      translate: vi.fn(),
      scale: vi.fn(),
      rotate: vi.fn(),
      drawImage: vi.fn(),
      clip: vi.fn(),
      rect: vi.fn(),
      setLineDash: vi.fn(),
      clearRect: vi.fn(),
      measureText: vi.fn((text) => ({ width: text.length * 6 })),
      fillText: vi.fn(),
      strokeText: vi.fn(),
      createLinearGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
    },
  },
}));

describe('drawPlacementGhost', () => {
  let placement;

  beforeEach(async () => {
    vi.resetModules();
    const mod = await import('../src/ui/placement.js');
    placement = mod;
    // Reset RENDERER properties to defaults to prevent cross-test pollution
    const R = (await import('../src/rendering/renderer.js')).RENDERER;
    R.hoverPx = 350;
    R.hoverPy = 200;
    R.toWorldInto = vi.fn((px, py, out) => {
      out.x = px;
      out.y = py;
      return out;
    });
    R.offsetX = 0;
    R.offsetY = 0;
    R.scale = 1;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns early when no selectedSpec', () => {
    const game = makeGame({ selectedSpec: null });
    expect(() => placement.drawPlacementGhost.call(ctxBind, game)).not.toThrow();
  });

  it('draws ghost for valid buildable tile', () => {
    const game = makeGame();
    expect(() => placement.drawPlacementGhost.call(ctxBind, game)).not.toThrow();
  });

  it('draws invalid reason text when tile is not buildable', () => {
    const game = makeGame({
      canPlace: vi.fn(() => false),
      getPlacementInvalidReason: vi.fn(() => 'Cannot build here'),
    });
    expect(() => placement.drawPlacementGhost.call(ctxBind, game)).not.toThrow();
  });

  it('draws support range for support troops', () => {
    const game = makeGame({
      selectedSpec: { cost: 80, range: 3, type: 'support', damage: 8, attackSpeed: 1, color: '#2ecc71' },
    });
    expect(() => placement.drawPlacementGhost.call(ctxBind, game)).not.toThrow();
  });

  it('draws burn DPS for flame troops', () => {
    const game = makeGame({
      selectedSpec: {
        cost: 60,
        range: 2,
        type: 'ranged',
        damage: 5,
        attackSpeed: 1,
        burnStacks: 3,
        burnDuration: 3,
        burnTickInterval: 0.5,
        burnDamageRatio: 0.4,
        color: '#ff7a18',
      },
    });
    expect(() => placement.drawPlacementGhost.call(ctxBind, game)).not.toThrow();
  });
});

describe('drawSelectedTroopRange', () => {
  let placement;

  beforeEach(async () => {
    vi.resetModules();
    const mod = await import('../src/ui/placement.js');
    placement = mod;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns early when selectedTroopIndex < 0', () => {
    const game = makeGame({ selectedTroopIndex: -1 });
    expect(() => placement.drawSelectedTroopRange(game)).not.toThrow();
  });

  it('draws range circle for alive troop', () => {
    const game = makeGame({ selectedTroopIndex: 0, troops: [{ alive: true, x: 200, y: 200, getRange: () => 3 }] });
    expect(() => placement.drawSelectedTroopRange(game)).not.toThrow();
  });

  it('no-ops when no troop selected', () => {
    const game = makeGame({ selectedTroopIndex: -1 });
    expect(() => placement.drawSelectedTroopRange(game)).not.toThrow();
  });

  // ===== Additional branch coverage =====
  it('drawPlacementGhost early return when hoverPx is null (line 85)', async () => {
    const RENDERER = (await import('../src/rendering/renderer.js')).RENDERER;
    RENDERER.hoverPx = null;
    const game = makeGame();
    expect(() => placement.drawPlacementGhost.call(ctxBind, game)).not.toThrow();
  });

  it('drawPlacementGhost early return when tile out of bounds (line 88)', async () => {
    const RENDERER = (await import('../src/rendering/renderer.js')).RENDERER;
    RENDERER.hoverPx = 350;
    RENDERER.hoverPy = 200;
    RENDERER.toWorldInto = vi.fn((px, py, out) => {
      out.x = -100;
      out.y = -100;
      return out;
    });
    const game = makeGame();
    expect(() => placement.drawPlacementGhost.call(ctxBind, game)).not.toThrow();
  });

  it('drawPlacementGhost early return when hoverPx < shopWidth (line 89)', async () => {
    const RENDERER = (await import('../src/rendering/renderer.js')).RENDERER;
    RENDERER.hoverPx = 100;
    RENDERER.hoverPy = 200;
    RENDERER.toWorldInto = vi.fn((px, py, out) => {
      out.x = px;
      out.y = py;
      return out;
    });
    const game = makeGame();
    expect(() => placement.drawPlacementGhost.call(ctxBind, game)).not.toThrow();
  });

  it('drawPlacementGhost early return when hoverPy < hudHeight (line 91)', async () => {
    const RENDERER = (await import('../src/rendering/renderer.js')).RENDERER;
    RENDERER.hoverPx = 350;
    RENDERER.hoverPy = 10;
    RENDERER.toWorldInto = vi.fn((px, py, out) => {
      out.x = px;
      out.y = py;
      return out;
    });
    const game = makeGame();
    expect(() => placement.drawPlacementGhost.call(ctxBind, game)).not.toThrow();
  });

  it('drawPlacementGhost early return when hoverPy > previewHeight (line 92)', async () => {
    const RENDERER = (await import('../src/rendering/renderer.js')).RENDERER;
    RENDERER.hoverPx = 350;
    RENDERER.hoverPy = 550;
    RENDERER.toWorldInto = vi.fn((px, py, out) => {
      out.x = px;
      out.y = py;
      return out;
    });
    const game = makeGame();
    expect(() => placement.drawPlacementGhost.call(ctxBind, game)).not.toThrow();
  });

  it('drawPlacementGhost support troop with invalid placement uses INVALID_RANGE (line 111)', async () => {
    const RENDERER = (await import('../src/rendering/renderer.js')).RENDERER;
    RENDERER.hoverPx = 350;
    RENDERER.hoverPy = 200;
    RENDERER.toWorldInto = vi.fn((px, py, out) => {
      out.x = px;
      out.y = py;
      return out;
    });
    const game = makeGame({
      canPlace: vi.fn(() => false),
      getPlacementInvalidReason: vi.fn(() => 'Cannot build here'),
      selectedSpec: { cost: 80, range: 3, type: 'support', damage: 8, attackSpeed: 1, color: '#2ecc71' },
    });
    expect(() => placement.drawPlacementGhost.call(ctxBind, game)).not.toThrow();
  });

  it('drawSelectedTroopRange renders at correct position (line 147)', async () => {
    const RENDERER = (await import('../src/rendering/renderer.js')).RENDERER;
    RENDERER.offsetX = 0;
    RENDERER.offsetY = 0;
    RENDERER.scale = 1;
    const game = makeGame({ selectedTroopIndex: 0, troops: [{ alive: true, x: 200, y: 200, getRange: () => 3 }] });
    expect(() => placement.drawSelectedTroopRange(game)).not.toThrow();
  });
});
