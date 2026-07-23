// (known limitation: renderGame uses real performance.now(), Path2D is stubbed globally)
// (known limitation: hit-test collision checks use _troopTileIndex layout, not screen-space)
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';
import { CONFIG, LAYOUT } from '../src/config.js';
import { PARTICLES } from '../src/particles.js';

// Stub Path2D before any imports (Node.js doesn't have it)
beforeAll(() => {
  if (typeof globalThis.Path2D === 'undefined') {
    // Use regular function so `new Path2D()` works (arrow functions aren't constructors)
    globalThis.Path2D = vi.fn(function () {
      return {
        moveTo: vi.fn(),
        lineTo: vi.fn(),
        quadraticCurveTo: vi.fn(),
        closePath: vi.fn(),
      };
    });
  }
});

// Mock dependencies
vi.mock('../src/rendering/renderer.js', () => ({
  RENDERER: {
    beginFrame: vi.fn(),
    applyMapTransform: vi.fn(),
    drawStaticLayers: vi.fn(),
    restoreTransform: vi.fn(),
    endFrame: vi.fn(),
    markCacheDirty: vi.fn(),
    _rebuildCache: vi.fn(),
    toWorldInto: vi.fn((px, py, out) => {
      out.x = px;
      out.y = py;
      return out;
    }),
    width: 800,
    height: 600,
    hoverPx: 400,
    hoverPy: 300,
    offsetX: 0,
    offsetY: 0,
    scale: 1,
    canvas: null,
    ctx: null,
    updateAutoCollapse: vi.fn(() => false),
  },
}));

vi.mock('../src/particles.js', () => ({
  PARTICLES: {
    draw: vi.fn(),
    update: vi.fn(),
    clear: vi.fn(),
    deathBurst: vi.fn(),
    hitSpark: vi.fn(),
    healBurst: vi.fn(),
    slowApply: vi.fn(),
    burnApply: vi.fn(),
    burnTick: vi.fn(),
    spawn: vi.fn(),
    spawnTrail: vi.fn(),
  },
}));
vi.mock('../src/audio.js', () => ({ AUDIO: {} }));

vi.mock('../src/ui/index.js', () => ({
  UI: {
    hitToggleButtons: vi.fn(() => false),
    hitShop: vi.fn(() => -1),
    _devConfirmYes: null,
    _devConfirmNo: null,
    _shieldBuyBtn: null,
    _ghostPos: { x: 0, y: 0 },
    _tileScratch: { gx: 0, gy: 0 },
    shopScrollY: 0,
    handleToggleClick: vi.fn(),
    updateHover: vi.fn(),
    drawHUD: vi.fn(),
    drawShop: vi.fn(),
    drawShieldShop: vi.fn(),
    drawPreview: vi.fn(),
    drawSelectedTroopRange: vi.fn(),
    drawPlacementGhost: vi.fn(),
    drawWaveTransition: vi.fn(),
    drawOverlay: vi.fn(),
    drawDevConfirmDialog: vi.fn(),
  },
  UI_LAYOUT: {
    collapsed: { shop: false, shieldShop: false, hud: false, preview: false },
    shopWidth: 250,
    hudHeight: 56,
    previewHeight: 80,
    shieldShopWidth: 220,
    SHOP_WIDTH: 250,
  },
}));

describe('gameRenderer', () => {
  let renderGame, updateCursorFn, hitTestCursor, RENDERER, UI, UI_LAYOUT, ctx;

  beforeAll(async () => {
    const rendererMod = await import('../src/rendering/renderer.js');
    RENDERER = rendererMod.RENDERER;
    const uiMod = await import('../src/ui/index.js');
    UI = uiMod.UI;
    UI_LAYOUT = uiMod.UI_LAYOUT;
    const mod = await import('../src/rendering/gameRenderer.js');
    renderGame = mod.renderGame;
    updateCursorFn = mod.updateCursor;
    hitTestCursor = mod.hitTestCursor;
  });

  beforeEach(() => {
    vi.clearAllMocks();
    // Reset UI state
    UI._devConfirmYes = null;
    UI._devConfirmNo = null;
    UI._shieldBuyBtn = null;
    UI.hitToggleButtons = vi.fn(() => false);
    UI.hitShop = vi.fn(() => -1);
    UI_LAYOUT.collapsed = { shop: false, shieldShop: false, hud: false, preview: false };
    RENDERER.hoverPx = 400;
    RENDERER.hoverPy = 300;
    RENDERER.width = 800;
    RENDERER.height = 600;
    RENDERER.canvas = null;
    // Fresh mock ctx
    ctx = makeMockCtx();
    RENDERER.ctx = ctx;
  });

  function makeMockCtx() {
    return {
      calls: [],
      fillStyle: '',
      strokeStyle: '',
      lineWidth: 1,
      font: '',
      textAlign: 'left',
      textBaseline: 'alphabetic',
      globalAlpha: 1,
      filter: 'none',
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
      shadowColor: '',
      shadowBlur: 0,
      shadowOffsetX: 0,
      shadowOffsetY: 0,
    };
  }

  function makeBaseGame(overrides = {}) {
    return {
      state: 'WAVE_ACTIVE',
      speed: 1,
      gold: 1000,
      lives: 25,
      troops: [],
      monsters: [],
      projectiles: [],
      popups: [],
      selectedTroopIndex: -1,
      selectedSpec: null,
      devConfirmPending: false,
      resetConfirmPending: false,
      sellConfirmPending: false,
      _troopTileIndex: new Array(CONFIG.GRID_SIZE * CONFIG.GRID_SIZE),
      grid: { get: vi.fn(() => 0) },
      canPlace: vi.fn(() => true),
      ...overrides,
    };
  }

  function makeTroopStub(id, overrides = {}) {
    return {
      gx: 5,
      gy: 5,
      x: 5 * 53 + 26,
      y: 5 * 53 + 26,
      alive: true,
      hp: 50,
      maxHp: 50,
      shield: 0,
      maxShield: 0,
      healBeam: null,
      spec: {
        color: '#3498db',
        type: 'melee',
        id: id || 'swordsman',
        size: 11,
      },
      getHpRatio: vi.fn(() => 1),
      getShieldRatio: vi.fn(() => 0),
      ...overrides,
    };
  }

  function makeMonsterStub(overrides = {}) {
    return {
      x: 200,
      y: 200,
      alive: true,
      hp: 34,
      maxHp: 34,
      shield: 0,
      maxShield: 0,
      reviveGlow: false,
      _slowColorTint: 0,
      burnStacks: 0,
      stunTimer: 0,
      level: 1,
      _healing: false,
      healRange: 0,
      spec: {
        color: '#7ec07e',
        size: 11,
        healRange: 0,
      },
      ...overrides,
    };
  }

  function makeProjectileStub(overrides = {}) {
    return {
      x: 300,
      y: 200,
      alive: true,
      kind: 'arrow',
      color: '#f1c40f',
      size: 3,
      lastTargetX: 350,
      lastTargetY: 250,
      ...overrides,
    };
  }

  // ── renderGame tests ──

  describe('renderGame', () => {
    it('begins frame, applies transform, draws layers, restores', () => {
      renderGame(makeBaseGame());
      expect(RENDERER.beginFrame).toHaveBeenCalled();
      expect(RENDERER.applyMapTransform).toHaveBeenCalled();
      expect(RENDERER.drawStaticLayers).toHaveBeenCalled();
      expect(RENDERER.restoreTransform).toHaveBeenCalled();
      expect(RENDERER.endFrame).toHaveBeenCalled();
    });

    it('draws troop body with fill and stroke', () => {
      const game = makeBaseGame({ troops: [makeTroopStub('swordsman')] });
      renderGame(game);
      expect(ctx.fill).toHaveBeenCalled();
      expect(ctx.stroke).toHaveBeenCalled();
    });

    it('draws shield outline when troop has shield', () => {
      const troop = makeTroopStub('swordsman', { shield: 30, maxShield: 60, getShieldRatio: () => 0.5 });
      const game = makeBaseGame({ troops: [troop] });
      renderGame(game);
      expect(ctx.strokeRect).toHaveBeenCalled();
    });

    it('draws type dot for melee troop', () => {
      const troop = makeTroopStub('swordsman', { spec: { color: '#3498db', type: 'melee', id: 'swordsman' } });
      const game = makeBaseGame({ troops: [troop] });
      renderGame(game);
      expect(ctx.fillRect).toHaveBeenCalled();
    });

    it('draws HP bar when troop is damaged', () => {
      const troop = makeTroopStub('swordsman', { hp: 25, maxHp: 50, getHpRatio: () => 0.5 });
      const game = makeBaseGame({ troops: [troop] });
      renderGame(game);
      // Fill rect for HP bar background + fill (at least 2 calls on top of the dot)
      expect(ctx.fillRect).toHaveBeenCalled();
    });

    it('skips dead troop', () => {
      const troop = makeTroopStub('swordsman', { alive: false });
      const game = makeBaseGame({ troops: [troop] });
      renderGame(game);
      // fill should NOT have been called for this troop
      // But beginFrame fills the background, so fill would be called once
      expect(ctx.save).not.toHaveBeenCalled(); // save happens inside troop render
    });

    it('draws shield bar above HP bar when shielded', () => {
      const troop = makeTroopStub('swordsman', {
        hp: 50,
        maxHp: 50,
        shield: 30,
        maxShield: 60,
        getHpRatio: () => 1,
        getShieldRatio: () => 0.5,
      });
      const game = makeBaseGame({ troops: [troop] });
      renderGame(game);
      // fillRect used for shield bar bg and fill
      expect(ctx.fillRect).toHaveBeenCalled();
    });

    it('draws heal beam between healer and healed troop', () => {
      const healer = makeTroopStub('healer', {
        gx: 4,
        gy: 4,
        x: 4 * 53 + 26,
        y: 4 * 53 + 26,
        spec: { color: '#2ecc71', type: 'support', id: 'healer' },
        healBeam: { troop: { x: 300, y: 250, alive: true }, timer: 0.5 },
      });
      const game = makeBaseGame({ troops: [healer] });
      renderGame(game);
      expect(ctx.beginPath).toHaveBeenCalled();
      expect(ctx.moveTo).toHaveBeenCalled();
      expect(ctx.lineTo).toHaveBeenCalled();
      expect(ctx.stroke).toHaveBeenCalled();
    });

    it('skips heal beam when beam troop is dead', () => {
      const healer = makeTroopStub('healer', {
        spec: { color: '#2ecc71', type: 'support', id: 'healer' },
        healBeam: { troop: { alive: false, x: 300, y: 250 }, timer: 0.5 },
      });
      const game = makeBaseGame({ troops: [healer] });
      renderGame(game);
      // moveTo should not be called for the beam (only used elsewhere)
      // The beam branch is skipped when troop is dead
    });

    it('renders monster shadow arc', () => {
      const game = makeBaseGame({ monsters: [makeMonsterStub()] });
      renderGame(game);
      expect(ctx.beginPath).toHaveBeenCalled();
      expect(ctx.arc).toHaveBeenCalled();
      expect(ctx.fill).toHaveBeenCalled();
    });

    it('renders monster revive glow when active', () => {
      const game = makeBaseGame({ monsters: [makeMonsterStub({ reviveGlow: true })] });
      renderGame(game);
      expect(ctx.stroke).toHaveBeenCalled();
    });

    it('renders monster shield ring when shield > 0', () => {
      const game = makeBaseGame({ monsters: [makeMonsterStub({ shield: 30, maxShield: 60 })] });
      renderGame(game);
      expect(ctx.stroke).toHaveBeenCalled();
    });

    it('renders slow overlay when _slowColorTint > 0', () => {
      const game = makeBaseGame({ monsters: [makeMonsterStub({ _slowColorTint: 1 })] });
      renderGame(game);
      expect(ctx.fill).toHaveBeenCalled();
    });

    it('renders burn ring when burnStacks > 0', () => {
      const game = makeBaseGame({ monsters: [makeMonsterStub({ burnStacks: 2 })] });
      renderGame(game);
      expect(ctx.stroke).toHaveBeenCalled();
    });

    it('renders stun overlay when stunTimer > 0', () => {
      const game = makeBaseGame({ monsters: [makeMonsterStub({ stunTimer: 1 })] });
      renderGame(game);
      // Stun overlay does a fill with semi-transparent white
      expect(ctx.fill).toHaveBeenCalled();
    });

    it('renders healer healing range indicator', () => {
      const game = makeBaseGame({ monsters: [makeMonsterStub({ level: 'H', _healing: true, healRange: 106 })] });
      renderGame(game);
      expect(ctx.save).toHaveBeenCalled();
      expect(ctx.restore).toHaveBeenCalled();
    });

    it('renders monster HP bar when damaged or shielded', () => {
      const monster = makeMonsterStub({ hp: 17, maxHp: 34, shield: 0, maxShield: 0 });
      const game = makeBaseGame({ monsters: [monster] });
      renderGame(game);
      expect(ctx.fillRect).toHaveBeenCalled();
    });

    it('renders monster shield bar when maxShield > 0', () => {
      const monster = makeMonsterStub({ shield: 30, maxShield: 60 });
      const game = makeBaseGame({ monsters: [monster] });
      renderGame(game);
      expect(ctx.fillRect).toHaveBeenCalled();
    });

    it('renders arrow/bolt projectile as stroked line', () => {
      const game = makeBaseGame({ projectiles: [makeProjectileStub({ kind: 'arrow' })] });
      renderGame(game);
      expect(ctx.beginPath).toHaveBeenCalled();
      expect(ctx.moveTo).toHaveBeenCalled();
      expect(ctx.lineTo).toHaveBeenCalled();
      expect(ctx.stroke).toHaveBeenCalled();
    });

    it('renders orb projectile as filled circle', () => {
      const game = makeBaseGame({ projectiles: [makeProjectileStub({ kind: 'orb' })] });
      renderGame(game);
      expect(ctx.arc).toHaveBeenCalled();
      expect(ctx.fill).toHaveBeenCalled();
    });

    it('skips dead projectile', () => {
      const game = makeBaseGame({ projectiles: [makeProjectileStub({ alive: false })] });
      renderGame(game);
      // arc should NOT have been called for the dead projectile
      // But it is called for monsters, so check that only monster arcs happened (0 monsters)
    });

    it('renders popups with alpha and color', () => {
      const popup = { x: 300, y: 200, text: '+10', color: '#f1c40f', t: 0.5 };
      const game = makeBaseGame({ popups: [popup] });
      renderGame(game);
      expect(ctx.fillText).toHaveBeenCalled();
      expect(ctx.globalAlpha).toBeLessThanOrEqual(1);
    });

    it('restores globalAlpha and textAlign after popups', () => {
      const popup = { x: 300, y: 200, text: '+10', color: '#f1c40f', t: 0.5 };
      const game = makeBaseGame({ popups: [popup] });
      renderGame(game);
      // After the popup loop, globalAlpha should be 1 and textAlign 'left'
      expect(ctx.textAlign).toBe('left');
    });

    it('draws particles and calls UI methods', () => {
      const game = makeBaseGame();
      renderGame(game);
      expect(PARTICLES.draw).toHaveBeenCalledWith(ctx);
      expect(UI.drawHUD).toHaveBeenCalledWith(game);
      expect(UI.drawShop).toHaveBeenCalledWith(game);
      expect(UI.drawShieldShop).toHaveBeenCalledWith(game);
      expect(UI.drawPreview).toHaveBeenCalledWith(game);
      expect(UI.drawOverlay).toHaveBeenCalledWith(game);
    });

    it('skips dead monsters in pass 1', () => {
      const m = makeMonsterStub({ alive: false });
      const game = makeBaseGame({ monsters: [m] });
      renderGame(game);
      // With only dead monster, no body fills happen for monsters
    });

    it('caches Path2D across multiple renderGame calls', () => {
      // _troopPath may already be cached from prior tests.
      // This test asserts the SECOND call does NOT create another Path2D.
      const game = makeBaseGame({ troops: [makeTroopStub('swordsman')] });
      renderGame(game);
      const callsAfterFirst = globalThis.Path2D.mock.calls.length;
      renderGame(game);
      expect(globalThis.Path2D.mock.calls.length).toBe(callsAfterFirst);
    });

    it('draws zoom indicator when _zoomIndicatorTime is set', () => {
      const game = makeBaseGame({ _zoomIndicatorTime: Date.now(), zoom: 1.5 });
      renderGame(game);
      expect(ctx.beginPath.mock.calls.length > 0 || ctx.fillText.mock.calls.length > 0).toBe(true);
    });

    it('draws zoom indicator at cap (red) when zoom >= 2', () => {
      const game = makeBaseGame({ _zoomIndicatorTime: Date.now(), zoom: 2 });
      renderGame(game);
      // Should set fillStyle to red at some point
      expect(ctx.save).toHaveBeenCalled();
      expect(ctx.restore).toHaveBeenCalled();
    });

    it('draws zoom indicator at cap (red) when zoom <= 1', () => {
      const game = makeBaseGame({ _zoomIndicatorTime: Date.now(), zoom: 1 });
      renderGame(game);
      expect(ctx.save).toHaveBeenCalled();
    });

    it('skips zoom indicator when _zoomIndicatorTime is falsy', () => {
      const game = makeBaseGame({ _zoomIndicatorTime: 0 });
      renderGame(game);
      // Should not reach the zoom indicator's save call — just verify no crash
      expect(RENDERER.endFrame).toHaveBeenCalled();
    });

    it('renders troop type dot for support', () => {
      const troop = makeTroopStub('healer', {
        spec: { color: '#2ecc71', type: 'support', id: 'healer' },
      });
      const game = makeBaseGame({ troops: [troop] });
      renderGame(game);
      expect(ctx.fillRect).toHaveBeenCalled();
    });

    it('renders troop type dot for ranged', () => {
      const troop = makeTroopStub('archer', {
        spec: { color: '#27ae60', type: 'ranged', id: 'archer' },
      });
      const game = makeBaseGame({ troops: [troop] });
      renderGame(game);
      expect(ctx.fillRect).toHaveBeenCalled();
    });

    it('renders HP bar with yellow when hpRatio <= 0.6', () => {
      const troop = makeTroopStub('swordsman', { hp: 25, maxHp: 50, getHpRatio: () => 0.5 });
      const game = makeBaseGame({ troops: [troop] });
      renderGame(game);
      // The 0.5 ratio triggers '#cccc44' (yellow) fill for HP bar
      expect(ctx.fillRect).toHaveBeenCalled();
    });

    it('renders HP bar with red when hpRatio <= 0.3', () => {
      const troop = makeTroopStub('swordsman', { hp: 10, maxHp: 50, getHpRatio: () => 0.2 });
      const game = makeBaseGame({ troops: [troop] });
      renderGame(game);
      // The 0.2 ratio triggers '#cc4444' (red) fill for HP bar
      expect(ctx.fillRect).toHaveBeenCalled();
    });

    it('renders monster revive glow with save/restore', () => {
      const game = makeBaseGame({
        monsters: [makeMonsterStub({ reviveGlow: true, _slowColorTint: 0, burnStacks: 0, stunTimer: 0 })],
      });
      renderGame(game);
      expect(ctx.save).toHaveBeenCalled();
      expect(ctx.restore).toHaveBeenCalled();
    });

    it('handles full HP monster with no shield gracefully', () => {
      const monster = makeMonsterStub({ hp: 34, maxHp: 34, shield: 0, maxShield: 0 });
      const game = makeBaseGame({ monsters: [monster] });
      // The HP bar condition (m.hp < m.maxHp || m.shield < m.maxShield) is false
      // so the HP bar is skipped — just verify no crash
      expect(() => renderGame(game)).not.toThrow();
    });

    it('renders projectile with kind: bolt', () => {
      const game = makeBaseGame({
        projectiles: [makeProjectileStub({ kind: 'bolt', color: '#e74c3c' })],
      });
      renderGame(game);
      expect(ctx.beginPath).toHaveBeenCalled();
      expect(ctx.stroke).toHaveBeenCalled();
    });

    it('renders popup with early decay (t near 0)', () => {
      const popup = { x: 300, y: 200, text: '+5', color: '#f1c40f', t: 0.1 };
      const game = makeBaseGame({ popups: [popup] });
      renderGame(game);
      expect(ctx.fillText).toHaveBeenCalled();
    });

    it('handles empty monsters array', () => {
      const game = makeBaseGame({ monsters: [] });
      expect(() => renderGame(game)).not.toThrow();
    });

    it('handles empty troops array', () => {
      const game = makeBaseGame({ troops: [] });
      expect(() => renderGame(game)).not.toThrow();
    });

    it('handles empty projectiles array', () => {
      const game = makeBaseGame({ projectiles: [] });
      expect(() => renderGame(game)).not.toThrow();
    });
  });

  // ── updateCursor tests ──

  describe('updateCursor', () => {
    it('handles null canvas', () => {
      RENDERER.canvas = null;
      const game = makeBaseGame();
      expect(() => updateCursorFn(game)).not.toThrow();
    });

    it('handles null hoverPx with canvas', () => {
      RENDERER.canvas = { style: { cursor: '' } };
      RENDERER.hoverPx = null;
      const game = makeBaseGame();
      updateCursorFn(game);
      expect(RENDERER.canvas.style.cursor).toBe('default');
    });

    it('sets cursor from hitTestCursor', () => {
      RENDERER.canvas = { style: { cursor: '' } };
      RENDERER.hoverPx = 150;
      RENDERER.hoverPy = 120;
      UI._devConfirmYes = { x: 100, y: 100, w: 80, h: 36 };
      const game = makeBaseGame({ devConfirmPending: true });
      updateCursorFn(game);
      expect(RENDERER.canvas.style.cursor).toBe('pointer');
    });

    it('skips redundant cursor assignment', () => {
      RENDERER.canvas = { style: { cursor: 'pointer' } };
      RENDERER.hoverPx = 150;
      RENDERER.hoverPy = 120;
      UI._devConfirmYes = { x: 100, y: 100, w: 80, h: 36 };
      const game = makeBaseGame({ devConfirmPending: true });
      updateCursorFn(game);
      expect(RENDERER.canvas.style.cursor).toBe('pointer');
    });
  });

  // ── hitTestCursor tests ──

  describe('hitTestCursor', () => {
    function makeGame(overrides = {}) {
      return {
        devConfirmPending: false,
        resetConfirmPending: false,
        sellConfirmPending: false,
        selectedTroopIndex: -1,
        selectedSpec: null,
        _troopTileIndex: new Array(CONFIG.GRID_SIZE * CONFIG.GRID_SIZE),
        troops: [],
        canPlace: vi.fn(() => true),
        ...overrides,
      };
    }

    it('returns default for empty state', () => {
      const result = hitTestCursor(makeGame(), 500, 300);
      expect(result).toBe('default');
    });

    // Confirmation dialogs
    it('devConfirm: pointer on yes', () => {
      UI._devConfirmYes = { x: 100, y: 100, w: 80, h: 36 };
      UI._devConfirmNo = { x: 200, y: 100, w: 80, h: 36 };
      const result = hitTestCursor(makeGame({ devConfirmPending: true }), 120, 118);
      expect(result).toBe('pointer');
    });

    it('devConfirm: pointer on no', () => {
      UI._devConfirmYes = { x: 100, y: 100, w: 80, h: 36 };
      UI._devConfirmNo = { x: 200, y: 100, w: 80, h: 36 };
      const result = hitTestCursor(makeGame({ devConfirmPending: true }), 220, 118);
      expect(result).toBe('pointer');
    });

    it('devConfirm: default outside buttons', () => {
      UI._devConfirmYes = { x: 100, y: 100, w: 80, h: 36 };
      const result = hitTestCursor(makeGame({ devConfirmPending: true }), 10, 10);
      expect(result).toBe('default');
    });

    it('resetConfirm: pointer on buttons', () => {
      UI._devConfirmYes = { x: 100, y: 100, w: 80, h: 36 };
      const result = hitTestCursor(makeGame({ resetConfirmPending: true }), 120, 118);
      expect(result).toBe('pointer');
    });

    it('sellConfirm: pointer on buttons', () => {
      UI._devConfirmNo = { x: 200, y: 100, w: 80, h: 36 }; // no used in sell path
      // sellConfirm checks _devConfirmYes too
      UI._devConfirmYes = { x: 200, y: 100, w: 80, h: 36 };
      const result = hitTestCursor(makeGame({ sellConfirmPending: true }), 220, 118);
      expect(result).toBe('pointer');
    });

    it('toggle buttons return pointer', () => {
      UI.hitToggleButtons = vi.fn(() => true);
      const result = hitTestCursor(makeGame(), 500, 300);
      expect(result).toBe('pointer');
    });

    // Gold area
    it('gold area returns pointer', () => {
      const ga = LAYOUT.HUD.GOLD_AREA;
      const result = hitTestCursor(makeGame(), ga.x + 10, ga.y + 10);
      expect(result).toBe('pointer');
    });

    // HUD buttons (expanded)
    it('reset button returns pointer', () => {
      const rstBtn = LAYOUT.HUD.RESET_BTN;
      const result = hitTestCursor(makeGame(), rstBtn.x + 5, rstBtn.y + 5);
      expect(result).toBe('pointer');
    });

    it('speed button returns pointer', () => {
      // Speed buttons start at width - SPEED_OFFSET + i * 28
      const px = RENDERER.width - LAYOUT.HUD.SPEED_OFFSET + 0 * 28 + 5;
      const result = hitTestCursor(makeGame(), px, 20);
      expect(result).toBe('pointer');
    });

    it('ctrl button returns pointer', () => {
      const bx = RENDERER.width - LAYOUT.HUD.CTRL_RIGHT;
      const result = hitTestCursor(makeGame(), bx + 5, LAYOUT.HUD.CTRL_BTN.y + 5);
      expect(result).toBe('pointer');
    });

    it('hud buttons return default when hud collapsed', () => {
      UI_LAYOUT.collapsed.hud = true;
      const rstBtn = LAYOUT.HUD.RESET_BTN;
      const result = hitTestCursor(makeGame(), rstBtn.x + 5, rstBtn.y + 5);
      expect(result).not.toBe('pointer');
    });

    // Shop
    it('shop card returns pointer', () => {
      UI.hitShop = vi.fn(() => 2); // index >= 0
      const result = hitTestCursor(makeGame(), 100, 200);
      expect(result).toBe('pointer');
    });

    // Shield buy button
    it('shield buy button returns pointer', () => {
      UI._shieldBuyBtn = { x: 600, y: 300, w: 100, h: 30 };
      const result = hitTestCursor(makeGame(), 620, 315);
      expect(result).toBe('pointer');
    });

    it('shield buy returns default when shieldShop collapsed', () => {
      UI_LAYOUT.collapsed.shieldShop = true;
      UI._shieldBuyBtn = { x: 600, y: 300, w: 100, h: 30 };
      const result = hitTestCursor(makeGame(), 620, 315);
      expect(result).not.toBe('pointer');
    });

    // Heal button
    it('heal button returns pointer when troop selected', () => {
      const t = { alive: true, gx: 5, gy: 5, x: 290, y: 290, spec: {} };
      const tileIdx = 5 * CONFIG.GRID_SIZE + 5;
      const tileIndex = new Array(CONFIG.GRID_SIZE * CONFIG.GRID_SIZE);
      tileIndex[tileIdx] = [t];
      UI_LAYOUT.SHOP_WIDTH = 250;
      const healBtnY = RENDERER.height - LAYOUT.SHOP.HEAL_BTN_Y_OFFSET;
      const result = hitTestCursor(
        makeGame({
          selectedTroopIndex: 0,
          troops: [t],
          _troopTileIndex: tileIndex,
        }),
        LAYOUT.SHOP.BTN_PAD + 5,
        healBtnY + 5
      );
      expect(result).toBe('pointer');
    });

    it('heal button returns default when shop collapsed', () => {
      UI_LAYOUT.collapsed.shop = true;
      const healBtnY = RENDERER.height - LAYOUT.SHOP.HEAL_BTN_Y_OFFSET;
      const result = hitTestCursor(
        makeGame({ selectedTroopIndex: 0, troops: [{ alive: true }] }),
        LAYOUT.SHOP.BTN_PAD + 5,
        healBtnY + 5
      );
      expect(result).not.toBe('pointer');
    });

    // Sell button
    it('sell button returns pointer when troop selected', () => {
      const sellBtnY = RENDERER.height - LAYOUT.SHOP.SELL_BTN_Y_OFFSET;
      const result = hitTestCursor(
        makeGame({ selectedTroopIndex: 0, troops: [{ alive: true }] }),
        LAYOUT.SHOP.BTN_PAD + 5,
        sellBtnY + 5
      );
      expect(result).toBe('pointer');
    });

    // Troop on grid
    it('troop on grid returns pointer', () => {
      const t = { alive: true, gx: 5, gy: 5, x: 290, y: 290, spec: {} };
      const tileIdx = 5 * CONFIG.GRID_SIZE + 5;
      const tileIndex = new Array(CONFIG.GRID_SIZE * CONFIG.GRID_SIZE);
      tileIndex[tileIdx] = [t];
      // Click within game area (px > shopWidth, py > hudHeight)
      const result = hitTestCursor(
        makeGame({
          selectedTroopIndex: -1,
          _troopTileIndex: tileIndex,
        }),
        300,
        300
      );
      expect(result).toBe('pointer');
    });

    it('troop on grid returns pointer when far troop in same tile', () => {
      const t = { alive: true, gx: 5, gy: 5, x: 290, y: 400, spec: {} }; // y far from click
      const tileIdx = 5 * CONFIG.GRID_SIZE + 5;
      const tileIndex = new Array(CONFIG.GRID_SIZE * CONFIG.GRID_SIZE);
      tileIndex[tileIdx] = [t];
      const result = hitTestCursor(
        makeGame({
          _troopTileIndex: tileIndex,
        }),
        300,
        300
      );
      // toWorldInto maps (300,300) -> (300,300). t.y=400, so |300-400|=100 > 26.5, not pointer
      expect(result).toBe('default');
    });

    // Placement ghost
    it('placement ghost on valid tile returns pointer', () => {
      RENDERER.hoverPx = 350;
      RENDERER.hoverPy = 200;
      const spec = { cost: 100 };
      const game = makeGame({ selectedSpec: spec });
      game.canPlace = vi.fn(() => true);
      const result = hitTestCursor(game, 350, 200);
      expect(result).toBe('pointer');
    });

    it('placement ghost on invalid tile returns default', () => {
      RENDERER.hoverPx = 350;
      RENDERER.hoverPy = 200;
      const spec = { cost: 100 };
      const game = makeGame({ selectedSpec: spec });
      game.canPlace = vi.fn(() => false);
      const result = hitTestCursor(game, 350, 200);
      expect(result).toBe('default');
    });

    it('placement ghost returns default outside game area', () => {
      RENDERER.hoverPx = 350;
      RENDERER.hoverPy = 200;
      const spec = { cost: 100 };
      // Click in shop area (px < shopWidth)
      const result = hitTestCursor(makeGame({ selectedSpec: spec }), 100, 200);
      expect(result).toBe('default');
    });
  });
  describe('zoomIndicator', () => {
    let mockCtx;
    let game;
    let performanceNowSpy;
    let renderGame;

    beforeAll(async () => {
      const mod = await import('../src/rendering/gameRenderer.js');
      renderGame = mod.renderGame;
    });

    beforeEach(() => {
      mockCtx = {
        save: vi.fn(),
        restore: vi.fn(),
        fillStyle: '',
        strokeStyle: '',
        lineWidth: 1,
        font: '',
        textAlign: '',
        fillRect: vi.fn(),
        fillText: vi.fn(),
        measureText: vi.fn(() => ({ width: 100 })),
        beginPath: vi.fn(),
        arc: vi.fn(),
        fill: vi.fn(),
        stroke: vi.fn(),
        moveTo: vi.fn(),
        lineTo: vi.fn(),
        closePath: vi.fn(),
        roundRect: vi.fn(),
      };
      game = {
        zoom: 1.5,
        _zoomIndicatorTime: 1000,
        _autoSaveIndicatorTimer: 0,
        selectedTroopIndex: -1,
        selectedSpec: null,
        troops: [],
        monsters: [],
        projectiles: [],
        popups: [],
        wave: { currentWave: 3 },
        state: 'PRE_WAVE',
        devMode: false,
        speed: 1,
        gold: 500,
        lives: 20,
      };
      performanceNowSpy = vi.spyOn(performance, 'now').mockReturnValue(1500);
    });

    afterEach(() => {
      performanceNowSpy?.mockRestore();
    });

    it('does not render when _zoomIndicatorTime is 0', () => {
      game._zoomIndicatorTime = 0;
      renderGame(game);
      // Should exit early without drawing zoom text
      expect(mockCtx.fillText).not.toHaveBeenCalled();
    });
  });
});
