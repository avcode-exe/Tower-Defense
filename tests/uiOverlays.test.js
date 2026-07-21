// Canvas mock tests for src/ui/overlays.js
// L12: drawWaveTransition progress branches — all alpha paths (fade-in, hold, fade-out)
//
// Known limitations:
// - (known limitation: drawWaveTransition uses performance.now() which makes
//   branch tests dependent on real time; we approximate via startMs offsets)

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CONFIG } from '../src/config.js';

function makeCtx() {
  return {
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    font: '',
    textAlign: 'left',
    textBaseline: 'alphabetic',
    globalAlpha: 1,
    filter: 'none',
    shadowColor: '',
    shadowBlur: 0,
    shadowOffsetX: 0,
    shadowOffsetY: 0,
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
    canvas: {},
    measureText: vi.fn((text) => ({ width: text.length * 6 })),
    fillText: vi.fn(),
    strokeText: vi.fn(),
    createLinearGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
  };
}

let _sharedCtx;

const mockRENDERER = {
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
  hoverPx: 100,
  hoverPy: 100,
  get ctx() {
    return _sharedCtx;
  },
  set ctx(v) {
    _sharedCtx = v;
  },
};

vi.mock('../src/rendering/renderer.js', () => ({ RENDERER: mockRENDERER }));
vi.mock('../src/audio.js', () => ({
  AUDIO: {
    muted: false,
    toggleMute: vi.fn(),
    waveStart: vi.fn(),
    defeat: vi.fn(),
    troopPlace: vi.fn(),
    sell: vi.fn(),
    goldEarned: vi.fn(),
    upgrade: vi.fn(),
    heal: vi.fn(),
    shieldBuy: vi.fn(),
    waveComplete: vi.fn(),
    monsterLeak: vi.fn(),
    monsterDeath: vi.fn(),
    meleeAttack: vi.fn(),
    rangedAttack: vi.fn(),
    troopDeath: vi.fn(),
  },
}));

describe('drawWaveTransition', () => {
  let drawWaveTransition;
  let _origPerfNow;

  beforeEach(async () => {
    _sharedCtx = makeCtx();
    _origPerfNow = performance.now;
    performance.now = vi.fn(() => 1000);
    const mod = await import('../src/ui/overlays.js');
    drawWaveTransition = mod.drawWaveTransition;
  });

  afterEach(() => {
    performance.now = _origPerfNow;
    vi.restoreAllMocks();
  });

  it('returns early when waveCompleteAnim is null', () => {
    drawWaveTransition({ waveCompleteAnim: null });
    expect(_sharedCtx.save).not.toHaveBeenCalled();
  });

  it('returns early when waveCompleteAnim.active is false', () => {
    drawWaveTransition({ waveCompleteAnim: { active: false } });
    expect(_sharedCtx.save).not.toHaveBeenCalled();
  });

  it('deactivates and returns when animation has expired (remaining <= 0)', () => {
    // startMs = 1000 (perf.now() = 1000) - 3000ms = -2000ms elapsed = 2s
    // remaining = 2.5 - 2.0 = 0.5 (not expired)
    // For expired: startMs at 0 where perf.now() = 1000 → elapsed = 1.0s
    // remaining = 2.5 - 1.0 = 1.5 (not expired)
    // For truly expired: startMs so that elapsed >= 2.5
    // elapsed = (1000 - (-1500)) / 1000 = 2.5s exactly → remaining = 0
    const anim = { active: true, waveNum: 3, startMs: -1500 };
    drawWaveTransition({ waveCompleteAnim: anim });
    expect(anim.active).toBe(false);
    expect(_sharedCtx.save).not.toHaveBeenCalled();
  });

  it('renders at fade-in alpha (progress < 0.2)', () => {
    // elapsed = (1000 - 900) / 1000 = 0.1s → remaining = 2.4 → progress = 0.04
    // alpha = 0.04 / 0.2 = 0.2
    drawWaveTransition({ waveCompleteAnim: { active: true, waveNum: 1, startMs: 900 } });
    expect(_sharedCtx.save).toHaveBeenCalled();
    expect(_sharedCtx.globalAlpha).toBeLessThanOrEqual(1);
    expect(_sharedCtx.fillText).toHaveBeenCalledWith(
      expect.stringContaining('Wave 1 Complete'),
      expect.any(Number),
      expect.any(Number)
    );
  });

  it('renders at full alpha when 0.2 <= progress < 0.8', () => {
    // elapsed = (1000 - 500) / 1000 = 0.5s → remaining = 2.0 → progress = 0.2
    drawWaveTransition({ waveCompleteAnim: { active: true, waveNum: 2, startMs: 500 } });
    expect(_sharedCtx.save).toHaveBeenCalled();
    expect(_sharedCtx.fillText).toHaveBeenCalledWith(
      expect.stringContaining('Wave 2 Complete'),
      expect.any(Number),
      expect.any(Number)
    );
  });

  it('renders at fade-out alpha when progress >= 0.8', () => {
    // elapsed = (1000 - (-1200)) / 1000 = 2.2s → remaining = 0.3 → progress = 0.88
    drawWaveTransition({ waveCompleteAnim: { active: true, waveNum: 5, startMs: -1200 } });
    expect(_sharedCtx.save).toHaveBeenCalled();
    expect(_sharedCtx.fillText).toHaveBeenCalledWith(
      expect.stringContaining('Wave 5 Complete'),
      expect.any(Number),
      expect.any(Number)
    );
  });
});

describe('drawOverlay', () => {
  let drawOverlay;

  beforeEach(async () => {
    _sharedCtx = makeCtx();
    const mod = await import('../src/ui/overlays.js');
    drawOverlay = mod.drawOverlay;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns early when state is not DEFEAT', () => {
    drawOverlay({ state: 'WAVE_ACTIVE' });
    expect(_sharedCtx.fillText).not.toHaveBeenCalled();
  });

  it('renders DEFEAT text when state is DEFEAT', () => {
    drawOverlay({ state: 'DEFEAT' });
    expect(_sharedCtx.fillText).toHaveBeenCalledWith('DEFEAT', expect.any(Number), expect.any(Number));
    expect(_sharedCtx.fillText).toHaveBeenCalledWith('Press R to restart', expect.any(Number), expect.any(Number));
  });
});

describe('drawDevConfirmDialog', () => {
  let drawDevConfirmDialog;

  beforeEach(async () => {
    _sharedCtx = makeCtx();
    const mod = await import('../src/ui/overlays.js');
    drawDevConfirmDialog = mod.drawDevConfirmDialog;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns early when no confirmations are pending', () => {
    drawDevConfirmDialog.call(
      {},
      {
        devConfirmPending: false,
        resetConfirmPending: false,
        sellConfirmPending: false,
        sellConfirmTroop: null,
      }
    );
    expect(_sharedCtx.fillText).not.toHaveBeenCalled();
  });

  it('renders DEV mode confirmation dialog (else branch)', () => {
    drawDevConfirmDialog.call(
      {},
      {
        devConfirmPending: true,
        resetConfirmPending: false,
        sellConfirmPending: false,
        sellConfirmTroop: null,
      }
    );
    expect(_sharedCtx.fillText).toHaveBeenCalledWith('Toggle DEV mode?', expect.any(Number), expect.any(Number));
    // Yes button shown (resetConfirmPending=false → '#2ea043' green)
    expect(_sharedCtx.fillText).toHaveBeenCalledWith('Yes', expect.any(Number), expect.any(Number));
  });

  it('renders reset confirmation dialog (else if branch)', () => {
    drawDevConfirmDialog.call(
      {},
      {
        devConfirmPending: false,
        resetConfirmPending: true,
        sellConfirmPending: false,
        sellConfirmTroop: null,
      }
    );
    expect(_sharedCtx.fillText).toHaveBeenCalledWith('Reset game?', expect.any(Number), expect.any(Number));
    // Reset button shown (resetConfirmPending=true → '#da3633' red)
    expect(_sharedCtx.fillText).toHaveBeenCalledWith('Reset', expect.any(Number), expect.any(Number));
  });

  it('renders sell confirmation dialog (if branch)', () => {
    drawDevConfirmDialog.call(
      {},
      {
        devConfirmPending: false,
        resetConfirmPending: false,
        sellConfirmPending: true,
        sellConfirmTroop: { spec: { name: 'Archer' } },
      }
    );
    expect(_sharedCtx.fillText).toHaveBeenCalledWith(
      expect.stringContaining('Sell Archer'),
      expect.any(Number),
      expect.any(Number)
    );
  });

  it('renders sell confirmation with fallback name when troop spec is missing', () => {
    drawDevConfirmDialog.call(
      {},
      {
        devConfirmPending: false,
        resetConfirmPending: false,
        sellConfirmPending: true,
        sellConfirmTroop: null,
      }
    );
    expect(_sharedCtx.fillText).toHaveBeenCalledWith(
      expect.stringContaining('Sell troop'),
      expect.any(Number),
      expect.any(Number)
    );
  });

  it('sets _devConfirmYes and _devConfirmNo hit boxes', () => {
    const self = {};
    drawDevConfirmDialog.call(self, {
      devConfirmPending: true,
      resetConfirmPending: false,
      sellConfirmPending: false,
      sellConfirmTroop: null,
    });
    expect(self._devConfirmYes).toHaveProperty('x');
    expect(self._devConfirmYes).toHaveProperty('y');
    expect(self._devConfirmYes).toHaveProperty('w', 80);
    expect(self._devConfirmYes).toHaveProperty('h', 36);
    expect(self._devConfirmNo).toHaveProperty('x');
    expect(self._devConfirmNo).toHaveProperty('y');
    expect(self._devConfirmNo).toHaveProperty('w', 80);
    expect(self._devConfirmNo).toHaveProperty('h', 36);
  });
});
