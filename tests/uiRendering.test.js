// Canvas mock tests for all UI rendering components.
// Tests hud.js, shop.js, overlays.js, placement.js, preview.js, shieldShop.js

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CONFIG, TROOP_SPECS, LAYOUT } from '../src/config.js';

// ── Shared mock RENDERER ──
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
let _savedPerfNow;

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
vi.mock('../src/ui/toast.js', () => ({ showToast: vi.fn() }));

function makeGame(overrides = {}) {
  return {
    state: 'WAVE_ACTIVE',
    speed: 1,
    gold: 1000,
    lives: 25,
    devMode: false,
    selectedSpec: null,
    selectedTroopIndex: -1,
    sellCooldownTimer: 0,
    monsters: [],
    troops: [],
    wave: {
      currentWave: 3,
      monstersRemainingThisWave: 10,
      currentMultiplier: 1,
      getNextWavePreview: vi.fn(() => [
        [1, 5],
        [2, 3],
      ]),
      getNextWaveEstimate: vi.fn(() => ({
        totalGold: 20,
        gold: 20,
        totalLeak: 5,
        estimatedDuration: 30,
        clearDuration: 30,
        startsIn: 5,
        timeUntilStart: 5,
        hasNecromancer: false,
        reviveEstimate: null,
        necromancer: false,
      })),
    },
    waveCompleteAnim: { active: false, waveNum: 0 },
    pathSegments: { totalLength: 800 },
    canPlace: vi.fn(() => true),
    getPlacementInvalidReason: vi.fn(() => null),
    ...overrides,
  };
}

// ── HUD ──
describe('drawHUD', () => {
  let drawHUD, UI_LAYOUT;

  beforeEach(async () => {
    _sharedCtx = makeCtx();
    const mod = await import('../src/ui/hud.js');
    drawHUD = mod.drawHUD;
    const uiMod = await import('../src/ui/constants.js');
    UI_LAYOUT = uiMod.UI_LAYOUT;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('draws collapsed HUD when collapsed.hud is true', () => {
    UI_LAYOUT.collapsed.hud = true;
    const ctx = _sharedCtx;
    drawHUD.call({}, makeGame());
    expect(ctx.fillText).toHaveBeenCalledWith('HUD', 6, 10);
  });

  it('draws gold, lives, wave, and controls when expanded', () => {
    UI_LAYOUT.collapsed.hud = false;
    const ctx = _sharedCtx;
    drawHUD.call({}, makeGame());
    expect(ctx.fillText).toHaveBeenCalledWith(expect.stringContaining('1000'), expect.any(Number), 28);
    expect(ctx.fillText).toHaveBeenCalledWith(expect.stringContaining('25'), expect.any(Number), 28);
    // Wave position is dynamic — compressed when monsters count overlaps with left section
    expect(ctx.fillText).toHaveBeenCalledWith('Wave 4', expect.any(Number), 28);
  });

  it('shows dev mode badge when devMode is true', () => {
    const ctx = _sharedCtx;
    drawHUD.call({}, makeGame({ devMode: true }));
    expect(ctx.fillText).toHaveBeenCalledWith('DEV Mode', expect.any(Number), expect.any(Number));
  });

  it('shows monsters count in active state', () => {
    const ctx = _sharedCtx;
    drawHUD.call({}, makeGame({ state: 'WAVE_ACTIVE', monsters: [{}, {}] }));
    expect(ctx.fillText).toHaveBeenCalledWith(expect.stringContaining('monsters'), expect.any(Number), 28);
  });

  it('shows wave 10+ scaling indicator', () => {
    const game = makeGame();
    game.wave.currentWave = 10;
    game.wave.currentMultiplier = 1.5;
    const ctx = _sharedCtx;
    drawHUD.call({}, game);
    // Wave multiplier follows the compressed reset button position.
    expect(ctx.fillText).toHaveBeenCalledWith(expect.stringContaining('1.50'), expect.any(Number), 28);
  });

  it('shows Start Wave in PRE_WAVE state', () => {
    const ctx = _sharedCtx;
    drawHUD.call({}, makeGame({ state: 'PRE_WAVE' }));
    expect(ctx.fillText).toHaveBeenCalledWith('Start Wave', expect.any(Number), expect.any(Number));
  });

  it('shows Resume in PAUSED state', () => {
    const ctx = _sharedCtx;
    drawHUD.call({}, makeGame({ state: 'PAUSED' }));
    expect(ctx.fillText).toHaveBeenCalledWith('Resume', expect.any(Number), expect.any(Number));
  });

  it('shows disabled start wave in dev mode', () => {
    const ctx = _sharedCtx;
    drawHUD.call({}, makeGame({ state: 'PRE_WAVE', devMode: true }));
    expect(ctx.fillText).toHaveBeenCalledWith('(Button disabled)', expect.any(Number), expect.any(Number));
  });

  it('uses 2-line layout when zoom causes overlap', () => {
    UI_LAYOUT._zoom = 2;
    UI_LAYOUT._extraHudHeight = 0;
    const ctx = _sharedCtx;
    const uiObj = {};
    drawHUD.call(uiObj, makeGame({ state: 'WAVE_ACTIVE', monsters: [{}, {}, {}] }));
    // _extraHudHeight should be set by drawHUD if 2-line mode activated
    // and _hudTwoLines should be true
    expect(uiObj._hudTwoLines).toBe(true);
    expect(UI_LAYOUT._extraHudHeight).toBeGreaterThan(0);
    expect(uiObj._speedRowH).toBeGreaterThan(0);
  });

  it('stores compact speed button dimensions in 2-line mode', () => {
    UI_LAYOUT._zoom = 2;
    const uiObj = {};
    drawHUD.call(uiObj, makeGame({ state: 'WAVE_ACTIVE', monsters: [] }));
    if (uiObj._hudTwoLines) {
      expect(uiObj._speedBtnGap).toBeGreaterThan(0);
      expect(uiObj._speedBtnH).not.toBeNull();
      expect(typeof uiObj._speedBtnOffsetY).toBe('number');
      expect(typeof uiObj._speedRowH).toBe('number');
    }
  });

  it('does NOT use 2-line layout at normal zoom', () => {
    UI_LAYOUT._zoom = 1;
    const uiObj = {};
    drawHUD.call(uiObj, makeGame());
    expect(uiObj._hudTwoLines).toBe(false);
  });

  it('stores reset button rect for click handlers', () => {
    const uiObj = {};
    drawHUD.call(uiObj, makeGame());
    expect(uiObj._resetBtn).toBeDefined();
    expect(uiObj._resetBtn.x).toBeGreaterThanOrEqual(0);
    expect(uiObj._resetBtn.w).toBeGreaterThan(0);
    expect(uiObj._resetBtn.h).toBeGreaterThan(0);
  });

  it('stores toggle hud rect', () => {
    const uiObj = {};
    drawHUD.call(uiObj, makeGame());
    expect(uiObj._toggleHud).toBeDefined();
    expect(uiObj._toggleHud.w).toBeGreaterThan(0);
  });

  it('resets _extraHudHeight to 0 at start of drawHUD', () => {
    UI_LAYOUT._extraHudHeight = 100; // stale from previous frame
    drawHUD.call({}, makeGame());
    expect(UI_LAYOUT._extraHudHeight).toBe(0);
  });

  it('red indicator on wave 10+ scaling', () => {
    const game = makeGame();
    game.wave.currentWave = 12;
    game.wave.currentMultiplier = 2.0;
    const ctx = _sharedCtx;
    drawHUD.call({}, game);
    expect(ctx.fillText).toHaveBeenCalledWith(expect.stringContaining('2.00'), expect.any(Number), 28);
  });

  it('shows infinite gold symbol in dev mode', () => {
    const ctx = _sharedCtx;
    drawHUD.call({}, makeGame({ devMode: true, gold: 9999 }));
    expect(ctx.fillText).toHaveBeenCalledWith('\u221E', expect.any(Number), 28);
  });

  it('shows infinite lives symbol in dev mode', () => {
    const ctx = _sharedCtx;
    drawHUD.call({}, makeGame({ devMode: true, lives: 9999 }));
    expect(ctx.fillText).toHaveBeenCalledWith('\u221E', expect.any(Number), 28);
  });

  it('draws panel background in expanded HUD', () => {
    const ctx = _sharedCtx;
    drawHUD.call({}, makeGame());
    expect(ctx.fillRect).toHaveBeenCalledWith(0, 0, 800, 56);
  });

  it('draws panel border at bottom', () => {
    const ctx = _sharedCtx;
    drawHUD.call({}, makeGame());
    expect(ctx.fillRect).toHaveBeenCalledWith(0, 56, 800, 1);
  });
});

// ── Shop ──
describe('shop', () => {
  let shopCardRect, shopCardRectInto, hitShop, computeSelectedTroopPanelHeight;
  let _updateCardAreaBottom, updateHover, handleToggleClick, hitToggleButtons, drawShop;
  let UI_LAYOUT;

  beforeEach(async () => {
    _sharedCtx = makeCtx();
    const mod = await import('../src/ui/shop.js');
    shopCardRect = mod.shopCardRect;
    shopCardRectInto = mod.shopCardRectInto;
    hitShop = mod.hitShop;
    computeSelectedTroopPanelHeight = mod.computeSelectedTroopPanelHeight;
    _updateCardAreaBottom = mod._updateCardAreaBottom;
    updateHover = mod.updateHover;
    handleToggleClick = mod.handleToggleClick;
    hitToggleButtons = mod.hitToggleButtons;
    drawShop = mod.drawShop;
    const uiMod = await import('../src/ui/constants.js');
    UI_LAYOUT = uiMod.UI_LAYOUT;
    UI_LAYOUT.collapsed.shop = false;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('shopCardRect returns correct geometry', () => {
    const r = shopCardRect(0, 0);
    expect(r.x).toBeGreaterThan(0);
    expect(r.w).toBeGreaterThan(0);
    expect(r.h).toBeGreaterThan(0);
  });

  it('shopCardRectInto mutates output object', () => {
    const out = { x: 0, y: 0, w: 0, h: 0 };
    const r = shopCardRectInto(0, out, 0);
    expect(r).toBe(out);
    expect(out.w).toBeGreaterThan(0);
  });

  it('hitShop returns -1 when collapsed', () => {
    UI_LAYOUT.collapsed.shop = true;
    expect(hitShop.call({ shopScrollY: 0 }, 10, 10)).toBe(-1);
  });

  it('computeSelectedTroopPanelHeight returns positive height for melee', () => {
    const troop = {
      spec: { type: 'melee', chain: 0, slowFactor: null, burnStacks: null, attackSpeed: 1 },
      getDamage: () => 10,
      getAttackSpeed: () => 1,
      getRange: () => 3,
      dmgLevel: 1,
      speedLevel: 1,
      rangeLevel: 1,
      getHpRatio: () => 0.8,
      hp: 50,
      maxHp: 100,
      getDps: () => 10,
      getChain: () => 0,
    };
    expect(computeSelectedTroopPanelHeight(troop)).toBeGreaterThan(0);
  });

  it('computeSelectedTroopPanelHeight works for support', () => {
    const troop = {
      spec: { type: 'support', chain: 0, slowFactor: null, burnStacks: null },
      getDamage: () => 8,
      getAttackSpeed: () => 1.5,
      getRange: () => 3,
      dmgLevel: 1,
      speedLevel: 1,
      rangeLevel: 1,
      healTargetLevel: 1,
      getHealTargetCount: () => 1,
      getHpRatio: () => 0.5,
      hp: 50,
      maxHp: 100,
      getHps: () => 5,
    };
    expect(computeSelectedTroopPanelHeight(troop)).toBeGreaterThan(0);
  });

  it('_updateCardAreaBottom sets to height when no troop selected', () => {
    const obj = {};
    _updateCardAreaBottom.call(obj, makeGame());
    expect(obj._cardAreaBottom).toBe(600);
  });

  it('updateHover sets hoveredShopIndex to -1 for null coordinates', () => {
    const obj = { shopScrollY: 0, _prevShopScrollY: 0, hitShop: vi.fn(() => -1) };
    updateHover.call(obj, null, null);
    expect(obj.hoveredShopIndex).toBe(-1);
  });

  it('handleToggleClick returns false when no toggles hit', () => {
    expect(handleToggleClick.call({}, 0, 0)).toBe(false);
  });

  it('hitToggleButtons returns false when no toggles set', () => {
    expect(hitToggleButtons.call({}, 0, 0)).toBeFalsy();
  });

  it('drawShop draws collapsed shop', () => {
    UI_LAYOUT.collapsed.shop = true;
    const ctx = _sharedCtx;
    drawShop.call({ _updateCardAreaBottom: vi.fn(), shopScrollY: 0 }, makeGame());
    expect(ctx.fillText).toHaveBeenCalled();
  });

  it('drawShop draws expanded shop', () => {
    UI_LAYOUT.collapsed.shop = false;
    const ctx = _sharedCtx;
    const shopCtx = {
      _updateCardAreaBottom: () => {},
      shopScrollY: 0,
      hoveredShopIndex: -1,
      shopCardRectInto: shopCardRectInto,
    };
    drawShop.call(shopCtx, makeGame());
    expect(ctx.fillRect).toHaveBeenCalled();
  });
});

// ── Overlays ──
describe('overlays', () => {
  let drawWaveTransition, drawOverlay, drawDevConfirmDialog;
  let origPerf;

  beforeEach(async () => {
    _sharedCtx = makeCtx();
    origPerf = global.performance;
    global.performance = { now: vi.fn(() => 1000) };
    const mod = await import('../src/ui/overlays.js');
    drawWaveTransition = mod.drawWaveTransition;
    drawOverlay = mod.drawOverlay;
    drawDevConfirmDialog = mod.drawDevConfirmDialog;
  });

  afterEach(() => {
    global.performance = origPerf;
    vi.restoreAllMocks();
  });

  it('drawWaveTransition returns early when not active', () => {
    const game = { waveCompleteAnim: { active: false } };
    drawWaveTransition(game);
    expect(_sharedCtx.fillRect).not.toHaveBeenCalled();
  });

  it('drawWaveTransition renders when active', () => {
    drawWaveTransition({ waveCompleteAnim: { active: true, waveNum: 5, startMs: 0 } });
    expect(_sharedCtx.fillText).toHaveBeenCalledWith('Wave 5 Complete', expect.any(Number), expect.any(Number));
  });

  it('drawWaveTransition deactivates after animation completes', () => {
    const anim = { active: true, waveNum: 5, startMs: 0 };
    global.performance.now = vi.fn(() => 10000);
    drawWaveTransition({ waveCompleteAnim: anim });
    expect(anim.active).toBe(false);
  });

  it('drawOverlay renders DEFEAT text', () => {
    drawOverlay({ state: 'DEFEAT' });
    expect(_sharedCtx.fillText).toHaveBeenCalledWith('DEFEAT', expect.any(Number), expect.any(Number));
  });

  it('drawOverlay returns early when not DEFEAT', () => {
    drawOverlay({ state: 'WAVE_ACTIVE' });
    expect(_sharedCtx.fillText).not.toHaveBeenCalled();
  });

  it('drawDevConfirmDialog returns early when no pending confirmations', () => {
    drawDevConfirmDialog({ devConfirmPending: false, resetConfirmPending: false, sellConfirmPending: false });
    expect(_sharedCtx.fillText).not.toHaveBeenCalled();
  });

  it('drawDevConfirmDialog renders DEV mode confirmation', () => {
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
  });

  it('drawDevConfirmDialog renders reset confirmation', () => {
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
  });

  it('drawDevConfirmDialog renders sell confirmation', () => {
    drawDevConfirmDialog.call(
      {},
      {
        devConfirmPending: false,
        resetConfirmPending: false,
        sellConfirmPending: true,
        sellConfirmTroop: { spec: { name: 'Swordsman' } },
      }
    );
    expect(_sharedCtx.fillText).toHaveBeenCalledWith(
      expect.stringContaining('Swordsman'),
      expect.any(Number),
      expect.any(Number)
    );
  });
});

// ── Placement ──
describe('placement', () => {
  let drawPlacementGhost, drawSelectedTroopRange;
  let getDpsForPlacementPreview, getSupportHpsForPlacementPreview, getBurnDpsForPlacementPreview;
  let UI_LAYOUT;

  beforeEach(async () => {
    _sharedCtx = makeCtx();
    const mod = await import('../src/ui/placement.js');
    drawPlacementGhost = mod.drawPlacementGhost;
    drawSelectedTroopRange = mod.drawSelectedTroopRange;
    getDpsForPlacementPreview = mod.getDpsForPlacementPreview;
    getSupportHpsForPlacementPreview = mod.getSupportHpsForPlacementPreview;
    getBurnDpsForPlacementPreview = mod.getBurnDpsForPlacementPreview;
    const uiMod = await import('../src/ui/constants.js');
    UI_LAYOUT = uiMod.UI_LAYOUT;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('drawPlacementGhost returns early when no spec selected', () => {
    drawPlacementGhost.call(
      { _ghostPos: { x: 0, y: 0 }, _tileScratch: { gx: 0, gy: 0 } },
      makeGame({ selectedSpec: null })
    );
    expect(_sharedCtx.fillRect).not.toHaveBeenCalled();
  });

  it('drawPlacementGhost draws valid damage placement', () => {
    // hoverPx must be > shopWidth (250) to pass the in-shop-area check
    mockRENDERER.hoverPx = 300;
    const ctx = _sharedCtx;
    drawPlacementGhost.call(
      { _ghostPos: { x: 0, y: 0 }, _tileScratch: { gx: 5, gy: 5 } },
      makeGame({ selectedSpec: { color: '#f00', range: 2, type: 'damage' }, canPlace: () => true })
    );
    expect(ctx.fillRect).toHaveBeenCalled();
  });

  it('drawPlacementGhost draws invalid placement', () => {
    mockRENDERER.hoverPx = 300;
    const ctx = _sharedCtx;
    drawPlacementGhost.call(
      { _ghostPos: { x: 0, y: 0 }, _tileScratch: { gx: 5, gy: 5 } },
      makeGame({
        selectedSpec: { color: '#f00', range: 2, type: 'damage' },
        canPlace: () => false,
        getPlacementInvalidReason: () => 'Cannot build here',
      })
    );
    expect(ctx.fillRect).toHaveBeenCalled();
  });

  it('drawPlacementGhost draws valid support placement', () => {
    mockRENDERER.hoverPx = 300;
    const ctx = _sharedCtx;
    drawPlacementGhost.call(
      { _ghostPos: { x: 0, y: 0 }, _tileScratch: { gx: 5, gy: 5 } },
      makeGame({
        selectedSpec: { color: '#2ecc71', range: 2, type: 'support', damage: 10, attackSpeed: 1 },
        canPlace: () => true,
      })
    );
    expect(ctx.fillRect).toHaveBeenCalled();
  });

  it('drawSelectedTroopRange returns early for no troop selected', () => {
    drawSelectedTroopRange(makeGame({ selectedTroopIndex: -1 }));
    expect(_sharedCtx.stroke).not.toHaveBeenCalled();
  });

  it('drawSelectedTroopRange draws range circle', () => {
    drawSelectedTroopRange(
      makeGame({
        selectedTroopIndex: 0,
        troops: [{ alive: true, x: 100, y: 100, getRange: () => 3 }],
      })
    );
    expect(_sharedCtx.arc).toHaveBeenCalled();
  });

  it('getDpsForPlacementPreview returns 0 for null spec', () => {
    expect(getDpsForPlacementPreview(null)).toBe(0);
  });

  it('getDpsForPlacementPreview returns 0 for support spec', () => {
    expect(getDpsForPlacementPreview({ type: 'support', damage: 10, attackSpeed: 2 })).toBe(0);
  });

  it('getDpsForPlacementPreview calculates DPS for damage spec', () => {
    expect(getDpsForPlacementPreview({ type: 'melee', damage: 10, attackSpeed: 2 })).toBe(5);
  });

  it('getSupportHpsForPlacementPreview returns 0 for non-support', () => {
    expect(getSupportHpsForPlacementPreview({ type: 'melee' }, null)).toBe(0);
  });

  it('getBurnDpsForPlacementPreview returns 0 for null spec', () => {
    expect(getBurnDpsForPlacementPreview(null)).toBe(0);
  });
});

// ── Preview ──
describe('drawPreview', () => {
  let drawPreview, UI_LAYOUT;

  beforeEach(async () => {
    _sharedCtx = makeCtx();
    const mod = await import('../src/ui/preview.js');
    drawPreview = mod.drawPreview;
    const uiMod = await import('../src/ui/constants.js');
    UI_LAYOUT = uiMod.UI_LAYOUT;
    UI_LAYOUT.collapsed.preview = false;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('draws collapsed preview', () => {
    UI_LAYOUT.collapsed.preview = true;
    const ctx = _sharedCtx;
    drawPreview.call({}, makeGame());
    expect(ctx.fillText).toHaveBeenCalledWith('WAVE', expect.any(Number), expect.any(Number));
  });

  it('draws expanded preview with wave info', () => {
    UI_LAYOUT.collapsed.preview = false;
    const ctx = _sharedCtx;
    drawPreview.call({}, makeGame());
    expect(ctx.fillText).toHaveBeenCalledWith('Next Wave', expect.any(Number), expect.any(Number));
  });

  it('shows Prepare... when no preview available', () => {
    const game = makeGame();
    game.wave.getNextWavePreview = vi.fn(() => null);
    drawPreview.call({}, game);
    expect(_sharedCtx.fillText).toHaveBeenCalledWith('Prepare...', expect.any(Number), expect.any(Number));
  });
});

// ── Shield Shop ──
describe('drawShieldShop', () => {
  let drawShieldShop, UI_LAYOUT;

  beforeEach(async () => {
    _sharedCtx = makeCtx();
    const mod = await import('../src/ui/shieldShop.js');
    drawShieldShop = mod.drawShieldShop;
    const uiMod = await import('../src/ui/constants.js');
    UI_LAYOUT = uiMod.UI_LAYOUT;
    UI_LAYOUT.collapsed.shieldShop = false;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('draws collapsed shield shop', () => {
    UI_LAYOUT.collapsed.shieldShop = true;
    drawShieldShop.call({}, makeGame());
    expect(_sharedCtx.fillText).toHaveBeenCalledWith('SHIELD', expect.any(Number), expect.any(Number));
  });

  it('draws expanded shield shop', () => {
    UI_LAYOUT.collapsed.shieldShop = false;
    drawShieldShop.call({}, makeGame());
    expect(_sharedCtx.fillText).toHaveBeenCalledWith('SHOP', expect.any(Number), expect.any(Number));
  });
  describe('auto-save indicator badge', () => {
    let mockCtx;
    let game;
    let drawHUD;
    let RENDERER_REF;
    let UI_LAYOUT_REF;
    let savedCtx;
    let savedCollapsed;

    beforeAll(async () => {
      const hudMod = await import('../src/ui/hud.js');
      drawHUD = hudMod.drawHUD;
      const constantsMod = await import('../src/ui/constants.js');
      UI_LAYOUT_REF = constantsMod.UI_LAYOUT;
      const rendererMod = await import('../src/rendering/renderer.js');
      RENDERER_REF = rendererMod.RENDERER;
    });

    beforeEach(() => {
      savedCtx = RENDERER_REF.ctx;
      savedCollapsed = { ...UI_LAYOUT_REF.collapsed };
      mockCtx = {
        save: vi.fn(),
        restore: vi.fn(),
        fillStyle: '',
        strokeStyle: '',
        lineWidth: 1,
        font: '',
        textAlign: '',
        textBaseline: '',
        globalAlpha: 1,
        fillRect: vi.fn(),
        fillText: vi.fn(),
        measureText: vi.fn(() => ({ width: 50 })),
        beginPath: vi.fn(),
        arc: vi.fn(),
        quadraticCurveTo: vi.fn(),
        fill: vi.fn(),
        stroke: vi.fn(),
        moveTo: vi.fn(),
        lineTo: vi.fn(),
        closePath: vi.fn(),
        roundRect: vi.fn(),
      };
      game = {
        gold: 500,
        lives: 20,
        wave: { currentWave: 3, currentMultiplier: 1.0, monstersRemainingThisWave: 0 },
        monsters: [],
        devMode: false,
        speed: 1,
        state: 'PRE_WAVE',
        selectedTroopIndex: -1,
        selectedSpec: null,
        _autoSaveIndicatorTimer: 1.5,
        zoom: 1,
      };
      RENDERER_REF.ctx = mockCtx;
      RENDERER_REF.width = 800;
      UI_LAYOUT_REF._zoom = 1;
      UI_LAYOUT_REF._extraHudHeight = 0;
      UI_LAYOUT_REF.collapsed = { hud: false };
    });

    afterEach(() => {
      RENDERER_REF.ctx = savedCtx;
      UI_LAYOUT_REF.collapsed = savedCollapsed;
    });

    it('renders save badge when _autoSaveIndicatorTimer > 0', () => {
      drawHUD.call({}, game);
      // Verify badge text was rendered - the badge draws checkmark + "Saved"
      const textCalls = mockCtx.fillText.mock.calls;
      const hasBadgeText = textCalls.some((args) => args[0] === '✓ Saved');
      expect(hasBadgeText).toBe(true);
    });
  });
});
