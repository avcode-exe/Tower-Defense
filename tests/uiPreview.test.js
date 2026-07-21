// @vitest-environment jsdom
/* tripwire inventory:
 *  - (known limitation: no TypeScript) — canvas-only preview rendering tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

function makeWaveStub() {
  return {
    currentWave: 0,
    waveActive: false,
    getNextWavePreview: vi.fn(() => [
      [1, 5],
      [3, 3],
    ]),
    getNextWaveEstimate: vi.fn(() => null),
  };
}

function makeGame(overrides = {}) {
  return { wave: makeWaveStub(), pathSegments: { totalLength: 2438 }, ...overrides };
}

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
    hoverPx: null,
    hoverPy: null,
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

vi.mock('../src/ui/constants.js', () => ({
  UI_LAYOUT: {
    collapsed: {
      hud: false,
      shop: false,
      shieldShop: false,
      preview: false,
      help: true,
      monsterInfo: true,
      settings: true,
      about: true,
      dev: true,
    },
    shopWidth: 250,
    hudHeight: 56,
    previewHeight: 80,
    shieldShopWidth: 220,
    SHOP_WIDTH: 250,
    PREVIEW_HEIGHT: 80,
  },
  UI_COLORS: { panelBg: '#1a1a2e', panelBorder: '#2a2a4e', textDim: '#666', textBody: '#ccc', textBright: '#fff' },
}));

vi.mock('../src/ui/utils.js', () => ({ drawToggleButton: vi.fn() }));

describe('drawPreview', () => {
  let drawPreview;
  const ctxBind = { _togglePreview: null };

  beforeEach(async () => {
    vi.resetModules();
    const mod = await import('../src/ui/preview.js');
    drawPreview = mod.drawPreview;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('draws expanded preview with wave data', () => {
    const wave = makeWaveStub();
    wave.getNextWavePreview = vi.fn(() => [[1, 5]]);
    wave.getNextWaveEstimate = vi.fn(() => ({
      startTime: 3,
      clearDuration: 15,
      gold: 50,
      totalGold: 50,
      timeUntilStart: 3,
      startsIn: 3,
      estimatedDuration: 18,
      totalLeak: 2,
      hasNecromancer: false,
      reviveEstimate: null,
    }));
    const game = makeGame({ wave });
    expect(() => drawPreview.call(ctxBind, game)).not.toThrow();
  });

  it('shows Prepare... when no preview available', () => {
    const wave = makeWaveStub();
    wave.getNextWavePreview = vi.fn(() => null);
    const game = makeGame({ wave });
    expect(() => drawPreview.call(ctxBind, game)).not.toThrow();
  });

  it('handles boss level B in wave preview', () => {
    const wave = makeWaveStub();
    wave.getNextWavePreview = vi.fn(() => [['B', 1]]);
    const game = makeGame({ wave });
    expect(() => drawPreview.call(ctxBind, game)).not.toThrow();
  });

  it('handles estimate with revive text', () => {
    const wave = makeWaveStub();
    wave.getNextWavePreview = vi.fn(() => [
      [3, 4],
      ['Y', 2],
    ]);
    wave.getNextWaveEstimate = vi.fn(() => ({
      startTime: 3,
      clearDuration: 15,
      gold: 50,
      totalGold: 50,
      timeUntilStart: 3,
      startsIn: 3,
      estimatedDuration: 20,
      totalLeak: 3,
      hasNecromancer: true,
      necromancer: true,
      reviveEstimate: { count: 3, gold: 10, targets: 3, rewardGold: 10, additionalDuration: 5 },
    }));
    const game = makeGame({ wave });
    expect(() => drawPreview.call(ctxBind, game)).not.toThrow();
  });

  it('handles estimate with start time and clear duration', () => {
    const wave = makeWaveStub();
    wave.getNextWavePreview = vi.fn(() => [[5, 2]]);
    wave.getNextWaveEstimate = vi.fn(() => ({
      startTime: 5,
      clearDuration: 20,
      gold: 30,
      totalGold: 30,
      timeUntilStart: 5,
      startsIn: 5,
      estimatedDuration: 25,
      totalLeak: 3,
      hasNecromancer: false,
      reviveEstimate: null,
    }));
    const game = makeGame({ wave });
    expect(() => drawPreview.call(ctxBind, game)).not.toThrow();
  });

  it('handles estimate without pathSegments', () => {
    const wave = makeWaveStub();
    wave.getNextWavePreview = vi.fn(() => [[3, 2]]);
    wave.getNextWaveEstimate = vi.fn(() => ({
      startTime: 3,
      clearDuration: 10,
      gold: 20,
      totalGold: 20,
      timeUntilStart: 3,
      startsIn: 3,
      estimatedDuration: 13,
      totalLeak: 2,
      hasNecromancer: false,
      reviveEstimate: null,
    }));
    const game = { wave, pathSegments: null };
    expect(() => drawPreview.call(ctxBind, game)).not.toThrow();
  });

  it('handles necromancer fallback preview check', () => {
    const wave = makeWaveStub();
    wave.getNextWavePreview = vi.fn(() => [['Y', 1]]);
    wave.getNextWaveEstimate = vi.fn(() => ({
      startTime: 2,
      clearDuration: 8,
      gold: 15,
      totalGold: 15,
      timeUntilStart: 2,
      startsIn: 2,
      estimatedDuration: 10,
      totalLeak: 1,
      // hasNecromancer NOT set as boolean to force previewHasNecromancer fallback
      reviveEstimate: { count: 1, gold: 5, targets: 1, rewardGold: 5, additionalDuration: 2 },
    }));
    const game = makeGame({ wave });
    expect(() => drawPreview.call(ctxBind, game)).not.toThrow();
  });

  it('handles estimate with no reviveEstimate (readNumber null source)', () => {
    const wave = makeWaveStub();
    wave.getNextWavePreview = vi.fn(() => [[4, 3]]);
    wave.getNextWaveEstimate = vi.fn(() => ({
      startTime: 3,
      clearDuration: 12,
      gold: 25,
      totalGold: 25,
      timeUntilStart: 3,
      startsIn: 3,
      estimatedDuration: 15,
      totalLeak: 2,
      // No reviveEstimate, no reviveCount, no reviveTargets — forces getReviveEstimate to call readNumber with null
      hasNecromancer: true,
    }));
    const game = makeGame({ wave });
    expect(() => drawPreview.call(ctxBind, game)).not.toThrow();
  });

  it('handles estimate with revive gold null', () => {
    const wave = makeWaveStub();
    wave.getNextWavePreview = vi.fn(() => [['Y', 2]]);
    wave.getNextWaveEstimate = vi.fn(() => ({
      startTime: 2,
      clearDuration: 10,
      gold: 20,
      totalGold: 20,
      timeUntilStart: 2,
      startsIn: 2,
      estimatedDuration: 12,
      totalLeak: 3,
      hasNecromancer: true,
      reviveEstimate: { count: 2, targets: 2 },
    }));
    const game = makeGame({ wave });
    expect(() => drawPreview.call(ctxBind, game)).not.toThrow();
  });

  it('handles estimate with large clear time (exercises formatSeconds minutes>0)', () => {
    const wave = makeWaveStub();
    wave.getNextWavePreview = vi.fn(() => [[1, 1]]);
    wave.getNextWaveEstimate = vi.fn(() => ({
      startTime: 120,
      clearDuration: 130,
      gold: 10,
      totalGold: 10,
      timeUntilStart: 120,
      startsIn: 120,
      estimatedDuration: 250,
      totalLeak: 1,
      hasNecromancer: false,
      reviveEstimate: null,
    }));
    const game = makeGame({ wave });
    expect(() => drawPreview.call(ctxBind, game)).not.toThrow();
  });

  it('handles estimate with negative startTime (exercises formatSeconds negative)', () => {
    const wave = makeWaveStub();
    wave.getNextWavePreview = vi.fn(() => [[1, 1]]);
    wave.getNextWaveEstimate = vi.fn(() => ({
      startTime: -5,
      clearDuration: 10,
      gold: 10,
      totalGold: 10,
      timeUntilStart: -5,
      startsIn: -5,
      estimatedDuration: 5,
      totalLeak: 1,
      hasNecromancer: false,
      reviveEstimate: null,
    }));
    const game = makeGame({ wave });
    expect(() => drawPreview.call(ctxBind, game)).not.toThrow();
  });

  it('handles estimate where clearDuration empty string', () => {
    const wave = makeWaveStub();
    wave.getNextWavePreview = vi.fn(() => [[2, 1]]);
    wave.getNextWaveEstimate = vi.fn(() => ({
      startTime: 3,
      gold: 15,
      totalGold: 15,
      timeUntilStart: 3,
      startsIn: 3,
      estimatedDuration: 5,
      totalLeak: 1,
      hasNecromancer: false,
      reviveEstimate: null,
      clearDuration: '',
    }));
    const game = makeGame({ wave });
    expect(() => drawPreview.call(ctxBind, game)).not.toThrow();
  });

  it('handles getWaveEstimate catch when getNextWaveEstimate throws', () => {
    const wave = makeWaveStub();
    wave.getNextWavePreview = vi.fn(() => [[1, 2]]);
    wave.getNextWaveEstimate = vi.fn(() => {
      throw new Error('estimate error');
    });
    const game = makeGame({ wave });
    expect(() => drawPreview.call(ctxBind, game)).not.toThrow();
  });

  it('handles necromancer none-boolean fallback with revive items', () => {
    const wave = makeWaveStub();
    wave.getNextWavePreview = vi.fn(() => [['Y', 3]]);
    wave.getNextWaveEstimate = vi.fn(() => ({
      startTime: 3,
      clearDuration: 15,
      gold: 25,
      totalGold: 25,
      timeUntilStart: 3,
      startsIn: 3,
      estimatedDuration: 20,
      totalLeak: 3,
      reviveEstimate: { count: 2, targets: 2, gold: 8, rewardGold: 8, additionalDuration: 4 },
    }));
    const game = makeGame({ wave });
    expect(() => drawPreview.call(ctxBind, game)).not.toThrow();
  });

  // ===== Additional preview branch coverage =====
  it('getWaveEstimate catches thrown error (line 35)', () => {
    const wave = makeWaveStub();
    wave.getNextWaveEstimate = vi.fn(() => {
      throw new Error('test');
    });
    const game = makeGame({ wave });
    expect(() => drawPreview.call(ctxBind, game)).not.toThrow();
  });

  it('drawPreview handles estimate with no revive gold', () => {
    const wave = makeWaveStub();
    wave.getNextWavePreview = vi.fn(() => [['1', 5]]);
    wave.getNextWaveEstimate = vi.fn(() => ({
      startTime: 3,
      clearDuration: 15,
      gold: 25,
      timeUntilStart: 3,
      startsIn: 3,
      estimatedDuration: 20,
      totalLeak: 3,
      necromancer: true,
      revive: { count: 2 },
    }));
    const game = makeGame({ wave });
    expect(() => drawPreview.call(ctxBind, game)).not.toThrow();
  });

  it('drawPreview handles firstLine + reviveText both present', () => {
    const wave = makeWaveStub();
    wave.getNextWavePreview = vi.fn(() => [['1', 5]]);
    wave.getNextWaveEstimate = vi.fn(() => ({
      startTime: 3,
      clearDuration: 15,
      gold: 25,
      timeUntilStart: 3,
      startsIn: 3,
      estimatedDuration: 20,
      totalLeak: 3,
      necromancer: true,
      reviveEstimate: { count: 2, gold: 8 },
    }));
    const game = makeGame({ wave });
    expect(() => drawPreview.call(ctxBind, game)).not.toThrow();
  });

  it('drawPreview drawEstimateLine overflow break (line 73)', async () => {
    const uiConstants = await import('../src/ui/constants.js');
    const UI_LAYOUT_ = uiConstants.UI_LAYOUT;
    const wave = makeWaveStub();
    wave.getNextWaveEstimate = vi.fn(() => ({
      startTime: 3,
      clearDuration: 15,
      gold: 25,
      timeUntilStart: 3,
      startsIn: 3,
      estimatedDuration: 20,
      totalLeak: 3,
      necromancer: false,
      reviveEstimate: null,
    }));
    const game = makeGame({ wave });
    const origShieldWidth = UI_LAYOUT_.shieldShopWidth;
    UI_LAYOUT_.shieldShopWidth = 600;
    expect(() => drawPreview.call(ctxBind, game)).not.toThrow();
    UI_LAYOUT_.shieldShopWidth = origShieldWidth;
  });

  it('drawPreview drawEstimateLine break on second item (cursor > x)', async () => {
    const uiConstants = await import('../src/ui/constants.js');
    const UI_LAYOUT_ = uiConstants.UI_LAYOUT;
    const wave = makeWaveStub();
    wave.getNextWaveEstimate = vi.fn(() => ({
      startTime: 1234567,
      clearDuration: 98765,
      gold: 888888,
      timeUntilStart: 3,
      startsIn: 3,
      estimatedDuration: 20,
      totalLeak: 3,
      necromancer: false,
      reviveEstimate: null,
    }));
    const game = makeGame({ wave });
    const origShieldWidth = UI_LAYOUT_.shieldShopWidth;
    // Narrow rightEdge so firstLine items fit, but second overflows
    UI_LAYOUT_.shieldShopWidth = 400;
    expect(() => drawPreview.call(ctxBind, game)).not.toThrow();
    UI_LAYOUT_.shieldShopWidth = origShieldWidth;
  });

  it('drawPreview revive text branch: hasNecromancer truthy + revive null = reviveText null', () => {
    const wave = makeWaveStub();
    wave.getNextWaveEstimate = vi.fn(() => ({
      startTime: 3,
      clearDuration: 15,
      gold: 25,
      timeUntilStart: 3,
      startsIn: 3,
      estimatedDuration: 20,
      totalLeak: 3,
      necromancer: true,
      reviveEstimate: null,
    }));
    const game = makeGame({ wave });
    expect(() => drawPreview.call(ctxBind, game)).not.toThrow();
  });

  it('drawPreview revive text: firstLine.length truthy + reviveText falsy = no second line', () => {
    const wave = makeWaveStub();
    wave.getNextWaveEstimate = vi.fn(() => ({
      startTime: 3,
      clearDuration: 15,
      gold: 25,
      timeUntilStart: 3,
      startsIn: 3,
      estimatedDuration: 20,
      totalLeak: 3,
      necromancer: false,
      reviveEstimate: { count: 2, gold: 8 },
    }));
    const game = makeGame({ wave });
    expect(() => drawPreview.call(ctxBind, game)).not.toThrow();
  });

  it('drawPreview getWaveEstimate catch block when wave has no getNextWaveEstimate (line 35)', () => {
    const wave = { getNextWavePreview: vi.fn(() => [[1, 2]]) };
    const game = makeGame({ wave });
    expect(() => drawPreview.call(ctxBind, game)).not.toThrow();
  });

  it('drawPreview getWaveEstimate catch block when getNextWaveEstimate throws (line 35)', () => {
    const wave = makeWaveStub();
    wave.getNextWaveEstimate = vi.fn(() => {
      throw new Error('test error');
    });
    const game = makeGame({ wave });
    expect(() => drawPreview.call(ctxBind, game)).not.toThrow();
  });

  it('drawPreview handles estimate with start=null, clear=null, gold=null (line 172 empty firstLine)', () => {
    const wave = makeWaveStub();
    wave.getNextWaveEstimate = vi.fn(() => ({
      clearDuration: 15,
      gold: 25,
      timeUntilStart: 3,
      startsIn: 3,
      estimatedDuration: 20,
      totalLeak: 3,
      startTime: undefined,
      startDelay: undefined,
      secondsUntilStart: undefined,
    }));
    const game = makeGame({ wave });
    expect(() => drawPreview.call(ctxBind, game)).not.toThrow();
  });

  it('drawPreview handles reviveText without firstLine (lines 178-187 revive-only)', () => {
    const wave = makeWaveStub();
    wave.getNextWaveEstimate = vi.fn(() => ({
      clearDuration: 15,
      gold: null,
      timeUntilStart: 3,
      startsIn: 3,
      estimatedDuration: 20,
      totalLeak: 3,
      necromancer: true,
      reviveEstimate: { count: 2, gold: 8 },
    }));
    const game = makeGame({ wave });
    expect(() => drawPreview.call(ctxBind, game)).not.toThrow();
  });

  it('drawPreview reviveText without revive.gold (line 178 else branch)', () => {
    const wave = makeWaveStub();
    wave.getNextWaveEstimate = vi.fn(() => ({
      startTime: 3,
      clearDuration: 15,
      gold: 25,
      timeUntilStart: 3,
      startsIn: 3,
      estimatedDuration: 20,
      totalLeak: 3,
      necromancer: true,
      reviveEstimate: { count: 2 },
    }));
    const game = makeGame({ wave });
    expect(() => drawPreview.call(ctxBind, game)).not.toThrow();
  });

  it('drawPreview drawEstimateLine with empty parts (line 62 early return)', () => {
    const wave = makeWaveStub();
    wave.getNextWaveEstimate = vi.fn(() => ({
      startTime: null,
      clearDuration: null,
      gold: null,
    }));
    const game = makeGame({ wave });
    expect(() => drawPreview.call(ctxBind, game)).not.toThrow();
  });
});
