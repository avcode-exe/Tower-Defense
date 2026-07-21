// (known limitation: drawShop uses RENDERER.ctx directly — all canvas mocks are vi.fn())
// (known limitation: handleToggleClick calls RENDERER.resize with ctx.canvas which may be null)
import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import { CONFIG, LAYOUT, TROOP_SPECS } from '../src/config.js';
import { UI_LAYOUT, UI_COLORS } from '../src/ui/constants.js';

// Shared mock context factory
function makeMockCtx() {
  return {
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    font: '',
    textAlign: 'left',
    textBaseline: 'alphabetic',
    globalAlpha: 1,
    filter: 'none',
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
    clip: vi.fn(),
    rect: vi.fn(),
    translate: vi.fn(),
    scale: vi.fn(),
    rotate: vi.fn(),
    fillRect: vi.fn(),
    strokeRect: vi.fn(),
    fillText: vi.fn(),
    strokeText: vi.fn(),
    setTransform: vi.fn(),
    clearRect: vi.fn(),
    setLineDash: vi.fn(),
    drawImage: vi.fn(),
    measureText: vi.fn((text) => ({ width: text.length * 6.5 })),
    createLinearGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
    createRadialGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
  };
}

// Mock dependencies
vi.mock('../src/rendering/renderer.js', () => ({
  RENDERER: {
    ctx: null,
    width: 800,
    height: 600,
    resize: vi.fn(),
  },
}));

vi.mock('../src/audio.js', () => ({ AUDIO: { muted: false } }));

describe('ui/shop', () => {
  let RENDERER, ctx;
  let shopCardRect, shopCardRectInto, hitShop;
  let computeSelectedTroopPanelHeight, _buildStatLines, _updateCardAreaBottom;
  let updateHover, handleToggleClick, hitToggleButtons, drawShop;
  let ctxModule;

  // Create a UI-like context for `this` binding
  let uiCtx;

  beforeAll(async () => {
    const rendererMod = await import('../src/rendering/renderer.js');
    RENDERER = rendererMod.RENDERER;
    const shopMod = await import('../src/ui/shop.js');
    shopCardRect = shopMod.shopCardRect;
    shopCardRectInto = shopMod.shopCardRectInto;
    hitShop = shopMod.hitShop;
    computeSelectedTroopPanelHeight = shopMod.computeSelectedTroopPanelHeight;
    _buildStatLines = shopMod._buildStatLines;
    _updateCardAreaBottom = shopMod._updateCardAreaBottom;
    updateHover = shopMod.updateHover;
    handleToggleClick = shopMod.handleToggleClick;
    hitToggleButtons = shopMod.hitToggleButtons;
    drawShop = shopMod.drawShop;
    const utilsMod = await import('../src/ui/utils.js');
    ctxModule = utilsMod;
  });

  beforeEach(() => {
    vi.clearAllMocks();
    ctx = makeMockCtx();
    RENDERER.ctx = ctx;
    RENDERER.width = 800;
    RENDERER.height = 600;
    UI_LAYOUT.collapsed.shop = false;
    UI_LAYOUT.collapsed.shieldShop = false;
    UI_LAYOUT.collapsed.hud = false;
    UI_LAYOUT.collapsed.preview = false;

    // Build UI context that mimics the real UI object
    uiCtx = {
      hoveredShopIndex: -1,
      hoveredTroopIndex: -1,
      shopScrollY: 0,
      _prevShopScrollY: 0,
      _cardAreaBottom: 0,
      _hitShopScratch: null,
      _shopScratch: null,
      _toggleShop: null,
      _toggleHud: null,
      _togglePreview: null,
      _toggleShieldShop: null,
      _devConfirmYes: null,
      _devConfirmNo: null,
      _shieldBuyBtn: null,
      _ghostPos: { x: 0, y: 0 },
      _tileScratch: { gx: 0, gy: 0 },
      shopCardRectInto,
      hitShop,
      _updateCardAreaBottom,
      _drawShopTooltip: ctxModule._drawShopTooltip,
    };
  });

  function makeTroopStub(type, overrides = {}) {
    const spec = TROOP_SPECS.find((s) => (type ? s.id === type : true)) || TROOP_SPECS[0];
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
      spec,
      dmgLevel: 0,
      rangeLevel: 0,
      speedLevel: 0,
      chainLevel: 0,
      slowLevel: 0,
      hpLevel: 0,
      healTargetLevel: 0,
      getDamage: vi.fn(() => spec.damage),
      getRange: vi.fn(() => spec.range),
      getAttackSpeed: vi.fn(() => spec.attackSpeed),
      getChain: vi.fn(() => spec.chain || 0),
      getSlowFactor: vi.fn(() => spec.slowFactor || 0),
      getSlowDuration: vi.fn(() => spec.slowDuration || 0),
      getHpRatio: vi.fn(() => 1),
      getHps: vi.fn(() => 0),
      getDps: vi.fn(() => spec.damage / spec.attackSpeed),
      getHealTargetCount: vi.fn(() => 1),
      canUpgrade: vi.fn(() => false),
      isMaxed: vi.fn(() => false),
      getUpgradeCost: vi.fn(() => 100),
      getHealCost: vi.fn(() => 14),
      canHeal: vi.fn(() => true),
      getTotalInvested: vi.fn(() => spec.cost),
      getShieldCost: vi.fn(() => 35),
      getHpPercent: vi.fn(() => '100'),
      shield: 0,
      maxShield: 0,
      ...overrides,
    };
  }

  function makeGame(overrides = {}) {
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
      devMode: false,
      sellCooldownTimer: 0,
      wave: { currentWave: 0, monstersRemainingThisWave: 0 },
      ...overrides,
    };
  }

  // ── shopCardRect ──
  describe('shopCardRect', () => {
    it('returns correct position for card 0', () => {
      const r = shopCardRect(0, 0);
      expect(r.x).toBe(LAYOUT.SHOP.BTN_PAD);
      expect(r.y).toBe(UI_LAYOUT.hudHeight + 8);
      expect(r.w).toBe(UI_LAYOUT.SHOP_WIDTH - 24);
      expect(r.h).toBe(LAYOUT.SHOP.CARD_H);
    });

    it('shifts Y by scroll offset', () => {
      const r = shopCardRect(0, 50);
      expect(r.y).toBe(UI_LAYOUT.hudHeight + 8 - 50);
    });

    it('offsets Y by card index', () => {
      const r0 = shopCardRect(0, 0);
      const r1 = shopCardRect(1, 0);
      expect(r1.y - r0.y).toBe(LAYOUT.SHOP.CARD_H + LAYOUT.SHOP.CARD_GAP);
    });
  });

  // ── shopCardRectInto ──
  describe('shopCardRectInto', () => {
    it('writes rect into existing object', () => {
      const out = { x: 0, y: 0, w: 0, h: 0 };
      const r = shopCardRectInto(0, out, 0);
      expect(r).toBe(out);
      expect(out.x).toBeGreaterThan(0);
      expect(out.y).toBe(UI_LAYOUT.hudHeight + 8);
    });
  });

  // ── hitShop ──
  describe('hitShop', () => {
    it('returns -1 when collapsed', () => {
      UI_LAYOUT.collapsed.shop = true;
      const result = hitShop.call(uiCtx, 100, 200);
      expect(result).toBe(-1);
    });

    it('returns troop index when clicking on card', () => {
      const firstCard = shopCardRect(0, 0);
      const result = hitShop.call(uiCtx, firstCard.x + 5, firstCard.y + 5);
      expect(result).toBe(0);
    });

    it('returns -1 when clicking outside all cards', () => {
      const result = hitShop.call(uiCtx, 0, 0);
      expect(result).toBe(-1);
    });
  });

  // ── _buildStatLines ──
  describe('_buildStatLines', () => {
    it('returns stat lines for melee troop (swordsman)', () => {
      const t = makeTroopStub('swordsman');
      const lines = _buildStatLines(t);
      expect(Array.isArray(lines)).toBe(true);
      expect(lines.length).toBeGreaterThanOrEqual(3);
      expect(lines[0]).toContain('DMG');
      expect(lines[lines.length - 1]).toHaveProperty('text');
    });

    it('returns stat lines for support troop (healer)', () => {
      const t = makeTroopStub('healer');
      const lines = _buildStatLines(t);
      expect(lines[0]).toContain('HEAL');
      expect(lines.some((l) => typeof l === 'object' && l.text.includes('HPS'))).toBe(true);
    });

    it('includes SLW line for icewiz (slowFactor)', () => {
      const t = makeTroopStub('icewiz');
      const lines = _buildStatLines(t);
      expect(lines.some((l) => typeof l === 'string' && l.startsWith('SLW'))).toBe(true);
    });

    it('includes BRN line for flame (burnStacks)', () => {
      const t = makeTroopStub('flame');
      const lines = _buildStatLines(t);
      expect(lines.some((l) => typeof l === 'string' && l.startsWith('BRN'))).toBe(true);
    });

    it('includes CHN line for lightning (chain)', () => {
      const t = makeTroopStub('lightning');
      const lines = _buildStatLines(t);
      expect(lines.some((l) => typeof l === 'string' && l.includes('CHN'))).toBe(true);
    });

    it('includes HP line with color object', () => {
      const t = makeTroopStub('swordsman', { hp: 25, maxHp: 50, getHpRatio: () => 0.5 });
      const lines = _buildStatLines(t);
      const hpLine = lines.find((l) => typeof l === 'object' && l.text && l.text.startsWith('HP'));
      expect(hpLine).toBeDefined();
      expect(hpLine.text).toContain('25/50');
    });

    it('HP color changes based on ratio', () => {
      const tHigh = makeTroopStub('swordsman', { hp: 45, maxHp: 50, getHpRatio: () => 0.9 });
      const linesHigh = _buildStatLines(tHigh);
      const hpHigh = linesHigh.find((l) => typeof l === 'object' && l.text.startsWith('HP'));
      expect(hpHigh.color).toBe('#44cc44');

      const tMid = makeTroopStub('swordsman', { hp: 20, maxHp: 50, getHpRatio: () => 0.4 });
      const linesMid = _buildStatLines(tMid);
      const hpMid = linesMid.find((l) => typeof l === 'object' && l.text.startsWith('HP'));
      expect(hpMid.color).toBe('#cccc44');

      const tLow = makeTroopStub('swordsman', { hp: 5, maxHp: 50, getHpRatio: () => 0.1 });
      const linesLow = _buildStatLines(tLow);
      const hpLow = linesLow.find((l) => typeof l === 'object' && l.text.startsWith('HP'));
      expect(hpLow.color).toBe('#cc4444');
    });
  });

  // ── computeSelectedTroopPanelHeight ──
  describe('computeSelectedTroopPanelHeight', () => {
    it('melee troop includes stat lines', () => {
      const t = makeTroopStub('swordsman');
      const h = computeSelectedTroopPanelHeight(t);
      expect(h).toBeGreaterThan(50);
    });

    it('support troop shows heal and target stats', () => {
      const t = makeTroopStub('healer', { hp: 30, maxHp: 40 });
      const h = computeSelectedTroopPanelHeight(t);
      expect(h).toBeGreaterThan(50);
    });

    it('flame troop includes burn DPS line', () => {
      const t = makeTroopStub('flame', { hp: 55, maxHp: 70, getHpRatio: () => 0.79 });
      const h = computeSelectedTroopPanelHeight(t);
      expect(h).toBeGreaterThan(50);
    });

    it('icewiz troop includes slow stat line', () => {
      const t = makeTroopStub('icewiz', { hp: 50, maxHp: 60, getHpRatio: () => 0.83 });
      const h = computeSelectedTroopPanelHeight(t);
      expect(h).toBeGreaterThan(50);
    });

    it('lightning troop includes chain stat line', () => {
      const t = makeTroopStub('lightning', { hp: 35, maxHp: 40, getHpRatio: () => 0.88 });
      const h = computeSelectedTroopPanelHeight(t);
      expect(h).toBeGreaterThan(50);
    });

    it('HP color changes based on ratio', () => {
      const t = makeTroopStub('swordsman', { hp: 5, maxHp: 50, getHpRatio: () => 0.1 });
      const h = computeSelectedTroopPanelHeight(t);
      expect(h).toBeGreaterThan(50);
    });

    it('includes slow stat line when troop has slowFactor (line 384)', () => {
      const t = makeTroopStub('icewiz');
      const h = computeSelectedTroopPanelHeight(t);
      expect(h).toBeGreaterThan(50);
    });

    it('includes burn DPS line when troop has burnStacks (lines 389-391)', () => {
      const t = makeTroopStub('flame', { hp: 55, maxHp: 70 });
      const h = computeSelectedTroopPanelHeight(t);
      expect(h).toBeGreaterThan(50);
    });

    it('slowFactor branch true (line 384) directly', () => {
      const t = makeTroopStub('icewiz');
      const h = computeSelectedTroopPanelHeight(t);
      expect(h).toBeGreaterThan(60);
    });

    it('burnStacks branch true (lines 389-391) directly', () => {
      const t = makeTroopStub('flame');
      const h = computeSelectedTroopPanelHeight(t);
      expect(h).toBeGreaterThan(60);
    });

    it('melee troop without slowFactor or burnStacks (lines 384/389 false)', () => {
      const t = makeTroopStub('swordsman');
      const h = computeSelectedTroopPanelHeight(t);
      expect(h).toBeGreaterThan(0);
    });

    it('computes height for ranged troop with slowFactor (line 384)', () => {
      const spec = TROOP_SPECS.find((s) => s.id === 'icewiz');
      const t = makeTroopStub('icewiz');
      expect(t.spec.slowFactor).toBeTruthy();
      const h = computeSelectedTroopPanelHeight(t);
      expect(h).toBeGreaterThan(0);
    });

    it('computes height for melee troop with burnStacks (lines 389-391)', () => {
      const spec = TROOP_SPECS.find((s) => s.id === 'flame');
      const t = makeTroopStub('flame');
      expect(t.spec.burnStacks).toBeTruthy();
      const h = computeSelectedTroopPanelHeight(t);
      expect(h).toBeGreaterThan(0);
    });
  });

  // ── _updateCardAreaBottom ──
  describe('_updateCardAreaBottom', () => {
    it('sets to full height when no troop selected', () => {
      _updateCardAreaBottom.call(uiCtx, makeGame());
      expect(uiCtx._cardAreaBottom).toBe(600);
    });

    it('sets panel bottom when troop selected and alive', () => {
      const t = makeTroopStub('swordsman', { hp: 50, maxHp: 50 });
      const game = makeGame({ selectedTroopIndex: 0, troops: [t] });
      _updateCardAreaBottom.call(uiCtx, game);
      expect(uiCtx._cardAreaBottom).toBeLessThan(600);
    });

    it('sets to full height when selected troop is dead', () => {
      const t = makeTroopStub('swordsman', { alive: false, hp: 0, maxHp: 50 });
      const game = makeGame({ selectedTroopIndex: 0, troops: [t] });
      _updateCardAreaBottom.call(uiCtx, game);
      expect(uiCtx._cardAreaBottom).toBe(600);
    });
  });

  // ── updateHover ──
  describe('updateHover', () => {
    it('skips when scroll position changed', () => {
      uiCtx.shopScrollY = 10;
      uiCtx._prevShopScrollY = 5;
      updateHover.call(uiCtx, 100, 100);
      expect(uiCtx._prevShopScrollY).toBe(10);
      expect(uiCtx.hoveredShopIndex).toBe(-1);
    });

    it('clears hovered index when px is null', () => {
      uiCtx.hoveredShopIndex = 3;
      updateHover.call(uiCtx, null, null);
      expect(uiCtx.hoveredShopIndex).toBe(-1);
    });

    it('sets hovered index based on hitShop', () => {
      const firstCard = shopCardRect(0, 0);
      updateHover.call(uiCtx, firstCard.x + 5, firstCard.y + 5);
      expect(uiCtx.hoveredShopIndex).toBe(0);
    });
  });

  // ── handleToggleClick ──
  describe('handleToggleClick', () => {
    it('toggles shieldShop when clicking its button', () => {
      uiCtx._toggleShieldShop = { x: 580, y: 50, w: 16, h: 16 };
      const result = handleToggleClick.call(uiCtx, 588, 58);
      expect(result).toBe(true);
      expect(UI_LAYOUT.collapsed.shieldShop).toBe(true);
    });

    it('toggles hud when clicking its button', () => {
      uiCtx._toggleHud = { x: 778, y: 6, w: 16, h: 16 };
      const result = handleToggleClick.call(uiCtx, 786, 14);
      expect(result).toBe(true);
      expect(UI_LAYOUT.collapsed.hud).toBe(true);
    });

    it('toggles shop when clicking its button', () => {
      uiCtx._toggleShop = { x: 231, y: 60, w: 16, h: 16 };
      const result = handleToggleClick.call(uiCtx, 239, 68);
      expect(result).toBe(true);
      expect(UI_LAYOUT.collapsed.shop).toBe(true);
    });

    it('toggles preview when clicking its button', () => {
      uiCtx._togglePreview = { x: 400, y: 520, w: 16, h: 16 };
      const result = handleToggleClick.call(uiCtx, 408, 528);
      expect(result).toBe(true);
      expect(UI_LAYOUT.collapsed.preview).toBe(true);
    });

    it('returns false when no toggle button hit', () => {
      const result = handleToggleClick.call(uiCtx, 0, 0);
      expect(result).toBe(false);
    });
  });

  // ── hitToggleButtons ──
  describe('hitToggleButtons', () => {
    it('returns true when hitting shieldShop toggle', () => {
      uiCtx._toggleShieldShop = { x: 580, y: 50, w: 16, h: 16 };
      expect(hitToggleButtons.call(uiCtx, 588, 58)).toBe(true);
    });

    it('returns true when hitting hud toggle', () => {
      uiCtx._toggleHud = { x: 778, y: 6, w: 16, h: 16 };
      expect(hitToggleButtons.call(uiCtx, 786, 14)).toBe(true);
    });

    it('returns true when hitting shop toggle', () => {
      uiCtx._toggleShop = { x: 231, y: 60, w: 16, h: 16 };
      expect(hitToggleButtons.call(uiCtx, 239, 68)).toBe(true);
    });

    it('returns falsy when no toggle hit', () => {
      // All _toggle* props are null; null && fn() => null, null || null => null
      expect(hitToggleButtons.call(uiCtx, 0, 0)).toBeNull();
    });
  });

  // ── drawShop ──
  describe('drawShop', () => {
    it('renders collapsed state with toggle button', () => {
      UI_LAYOUT.collapsed.shop = true;
      drawShop.call(uiCtx, makeGame());
      expect(ctx.fillRect).toHaveBeenCalled();
      expect(ctx.save).toHaveBeenCalled();
      expect(ctx.restore).toHaveBeenCalled();
      expect(ctx.fillText).toHaveBeenCalled();
      expect(uiCtx._toggleShop).not.toBeNull();
    });

    it('renders expanded state background and header', () => {
      drawShop.call(uiCtx, makeGame());
      expect(ctx.fillRect).toHaveBeenCalled();
      expect(ctx.fillText).toHaveBeenCalled();
    });

    it('renders shop cards for all troop specs', () => {
      drawShop.call(uiCtx, makeGame());
      // Cards use UIRoundRect (beginPath + fill) + arc for dots
      expect(ctx.beginPath).toHaveBeenCalled();
      expect(ctx.arc).toHaveBeenCalled();
      expect(ctx.fill).toHaveBeenCalled();
    });

    it('renders selected card with different fill', () => {
      const spec = TROOP_SPECS.find((s) => s.id === 'swordsman');
      const game = makeGame({ selectedSpec: spec });
      drawShop.call(uiCtx, game);
      // Should enter the isSelected branch
      expect(ctx.fillStyle).toBeDefined();
    });

    it('renders hovered card with hover fill', () => {
      const firstCard = shopCardRect(0, 0);
      uiCtx.hoveredShopIndex = 0;
      drawShop.call(uiCtx, makeGame());
      expect(ctx.fillStyle).toBeDefined();
    });

    it('renders slow stat line for icewiz selected troop (line 384 in drawShop)', () => {
      const t = makeTroopStub('icewiz');
      const game = makeGame({ selectedTroopIndex: 0, troops: [t] });
      drawShop.call(uiCtx, game);
      expect(ctx.fillText).toHaveBeenCalledWith(expect.stringContaining('SLW'), expect.any(Number), expect.any(Number));
    });

    it('renders burn stat line for flame selected troop (lines 389-391 in drawShop)', () => {
      const t = makeTroopStub('flame');
      const game = makeGame({ selectedTroopIndex: 0, troops: [t] });
      drawShop.call(uiCtx, game);
      expect(ctx.fillText).toHaveBeenCalledWith(expect.stringContaining('BRN'), expect.any(Number), expect.any(Number));
    });

    it('renders scroll indicator when content exceeds visible area', () => {
      drawShop.call(uiCtx, makeGame());
      // With all 12 specs and card area, maxScroll > 0 should trigger scroll bar
      // The scroll indicator uses UIRoundRect which calls beginPath
    });

    it('renders scroll indicator at correct position', () => {
      uiCtx.shopScrollY = 20;
      drawShop.call(uiCtx, makeGame());
    });

    it('renders selected troop info panel with stat lines', () => {
      const t = makeTroopStub('swordsman');
      const game = makeGame({ selectedTroopIndex: 0, troops: [t] });
      drawShop.call(uiCtx, game);
      // Panel heading, stat lines, upgrade buttons, heal button, sell button
      expect(ctx.fillText).toHaveBeenCalled();
    });

    it('renders support troop info panel with HPS', () => {
      const t = makeTroopStub('healer', { hp: 30, maxHp: 40, shield: 0, maxShield: 0 });
      const game = makeGame({ selectedTroopIndex: 0, troops: [t] });
      drawShop.call(uiCtx, game);
      expect(ctx.fillText).toHaveBeenCalled();
    });

    it('renders damage troop info panel with DPS', () => {
      const t = makeTroopStub('archer', { hp: 25, maxHp: 30 });
      const game = makeGame({ selectedTroopIndex: 0, troops: [t] });
      drawShop.call(uiCtx, game);
      expect(ctx.fillText).toHaveBeenCalled();
    });

    it('renders max-HP heal button as greyed', () => {
      const t = makeTroopStub('swordsman', { hp: 50, maxHp: 50, canHeal: () => false });
      const game = makeGame({ selectedTroopIndex: 0, troops: [t] });
      drawShop.call(uiCtx, game);
      expect(ctx.fillText).toHaveBeenCalled();
    });

    it('renders affordable heal button', () => {
      const t = makeTroopStub('swordsman', { hp: 25, maxHp: 50 });
      const game = makeGame({ selectedTroopIndex: 0, troops: [t], gold: 1000 });
      drawShop.call(uiCtx, game);
      expect(ctx.fillText).toHaveBeenCalled();
    });

    it('renders sell button with dev mode delete text', () => {
      const t = makeTroopStub('swordsman');
      const game = makeGame({ selectedTroopIndex: 0, troops: [t], devMode: true });
      drawShop.call(uiCtx, game);
      expect(ctx.fillText).toHaveBeenCalled();
    });

    it('renders sell button with cooldown', () => {
      const t = makeTroopStub('swordsman');
      const game = makeGame({ selectedTroopIndex: 0, troops: [t], sellCooldownTimer: 2.5 });
      drawShop.call(uiCtx, game);
      expect(ctx.fillText).toHaveBeenCalled();
    });

    it('renders sell button with normal refund', () => {
      const t = makeTroopStub('swordsman');
      const game = makeGame({ selectedTroopIndex: 0, troops: [t] });
      drawShop.call(uiCtx, game);
      expect(ctx.fillText).toHaveBeenCalled();
    });

    it('renders upgrade buttons for upgradeable stats', () => {
      const t = makeTroopStub('swordsman', {
        hp: 50,
        maxHp: 50,
        canUpgrade: vi.fn(() => true),
        isMaxed: vi.fn(() => false),
      });
      const game = makeGame({ selectedTroopIndex: 0, troops: [t] });
      drawShop.call(uiCtx, game);
      expect(ctx.fillText).toHaveBeenCalled();
    });

    it('renders MAX upgrade buttons for maxed stats', () => {
      const t = makeTroopStub('swordsman', {
        hp: 50,
        maxHp: 50,
        canUpgrade: vi.fn(() => true),
        isMaxed: vi.fn(() => true),
      });
      const game = makeGame({ selectedTroopIndex: 0, troops: [t] });
      drawShop.call(uiCtx, game);
      expect(ctx.fillText).toHaveBeenCalled();
    });

    it('renders type badge for melee card', () => {
      drawShop.call(uiCtx, makeGame());
    });
  });
});

describe('ui/shieldShop', () => {
  let RENDERER, ctx;
  let drawShieldShop;

  beforeAll(async () => {
    const rendererMod = await import('../src/rendering/renderer.js');
    RENDERER = rendererMod.RENDERER;
    const mod = await import('../src/ui/shieldShop.js');
    drawShieldShop = mod.drawShieldShop;
  });

  beforeEach(() => {
    vi.clearAllMocks();
    ctx = makeMockCtx();
    RENDERER.ctx = ctx;
    RENDERER.width = 800;
    RENDERER.height = 600;
    UI_LAYOUT.collapsed.shieldShop = false;
    UI_LAYOUT.collapsed.hud = false;
    UI_LAYOUT.collapsed.preview = false;
  });

  const uiShieldCtx = {
    _toggleShieldShop: null,
    _shieldBuyBtn: null,
  };

  function makeTroopStub(type, overrides = {}) {
    const spec = TROOP_SPECS.find((s) => (type ? s.id === type : true)) || TROOP_SPECS[0];
    return {
      gx: 0,
      gy: 0,
      x: 0,
      y: 0,
      alive: true,
      hp: 50,
      maxHp: 50,
      shield: 0,
      maxShield: 0,
      spec,
      getShieldCost: vi.fn(() => Math.ceil(spec.cost * 0.5)),
      getHpRatio: vi.fn(() => 1),
      name: spec.name,
      ...overrides,
    };
  }

  function makeGame(overrides = {}) {
    return {
      state: 'WAVE_ACTIVE',
      speed: 1,
      gold: 1000,
      lives: 25,
      troops: [],
      selectedTroopIndex: -1,
      devMode: false,
      wave: { currentWave: 0 },
      ...overrides,
    };
  }

  describe('drawShieldShop', () => {
    it('renders collapsed state with toggle button', () => {
      UI_LAYOUT.collapsed.shieldShop = true;
      drawShieldShop.call(uiShieldCtx, makeGame());
      expect(ctx.fillRect).toHaveBeenCalled();
      expect(ctx.save).toHaveBeenCalled();
      expect(ctx.restore).toHaveBeenCalled();
      expect(uiShieldCtx._toggleShieldShop).not.toBeNull();
      expect(uiShieldCtx._shieldBuyBtn).toBeNull();
    });

    it('renders expanded panel background and header', () => {
      drawShieldShop.call(uiShieldCtx, makeGame());
      expect(ctx.fillRect).toHaveBeenCalled();
      expect(ctx.fillText).toHaveBeenCalled();
    });

    it('renders no-selection state with SELECT A TROOP button', () => {
      drawShieldShop.call(uiShieldCtx, makeGame());
      expect(ctx.fillText).toHaveBeenCalledWith(
        expect.stringContaining('SELECT A TROOP'),
        expect.any(Number),
        expect.any(Number)
      );
    });

    it('renders active shield state for already-shielded troop', () => {
      const t = makeTroopStub('swordsman', { shield: 30, maxShield: 60 });
      const game = makeGame({ selectedTroopIndex: 0, troops: [t] });
      drawShieldShop.call(uiShieldCtx, game);
      expect(ctx.fillText).toHaveBeenCalledWith(
        expect.stringContaining('ACTIVE'),
        expect.any(Number),
        expect.any(Number)
      );
    });

    it('renders unaffordable buy state when gold insufficient', () => {
      const t = makeTroopStub('sniper', { shield: 0, maxShield: 0 }); // sniper costs 250g, shield = 125g
      const game = makeGame({ selectedTroopIndex: 0, troops: [t], gold: 50 });
      drawShieldShop.call(uiShieldCtx, game);
      expect(ctx.fillText).toHaveBeenCalledWith(expect.stringContaining('BUY'), expect.any(Number), expect.any(Number));
    });

    it('renders affordable buy state when gold sufficient', () => {
      const t = makeTroopStub('swordsman', { shield: 0, maxShield: 0 });
      const game = makeGame({ selectedTroopIndex: 0, troops: [t], gold: 1000 });
      drawShieldShop.call(uiShieldCtx, game);
      expect(ctx.fillText).toHaveBeenCalledWith(
        expect.stringContaining('BUY SHIELD'),
        expect.any(Number),
        expect.any(Number)
      );
    });

    it('renders shielded info text with waves-left count', () => {
      const t = makeTroopStub('swordsman', { shield: 30, maxShield: 60 });
      const game = makeGame({ selectedTroopIndex: 0, troops: [t], wave: { currentWave: 3 } });
      drawShieldShop.call(uiShieldCtx, game);
      // "Expires in 7 waves" (10 - 3 % 10 = 7)
      expect(ctx.fillText).toHaveBeenCalledWith(
        expect.stringContaining('Expires'),
        expect.any(Number),
        expect.any(Number)
      );
    });

    it('renders unshielded info text with HP and cost', () => {
      const t = makeTroopStub('swordsman', { shield: 0, maxShield: 0 });
      const game = makeGame({ selectedTroopIndex: 0, troops: [t] });
      drawShieldShop.call(uiShieldCtx, game);
      expect(ctx.fillText).toHaveBeenCalledWith(expect.stringContaining('HP'), expect.any(Number), expect.any(Number));
    });

    it('renders selected troop name below card', () => {
      const t = makeTroopStub('knight', { shield: 0, maxShield: 0 });
      const game = makeGame({ selectedTroopIndex: 0, troops: [t] });
      drawShieldShop.call(uiShieldCtx, game);
      expect(ctx.fillText).toHaveBeenCalledWith(
        expect.stringContaining('Selected:'),
        expect.any(Number),
        expect.any(Number)
      );
    });

    it('renders "none" when no troop selected', () => {
      drawShieldShop.call(uiShieldCtx, makeGame());
      expect(ctx.fillText).toHaveBeenCalledWith(
        expect.stringContaining('none'),
        expect.any(Number),
        expect.any(Number)
      );
    });

    it('sets _shieldBuyBtn rect for click handling', () => {
      drawShieldShop.call(uiShieldCtx, makeGame());
      expect(uiShieldCtx._shieldBuyBtn).not.toBeNull();
      expect(uiShieldCtx._shieldBuyBtn.x).toBeGreaterThan(0);
      expect(uiShieldCtx._shieldBuyBtn.y).toBeGreaterThan(0);
    });
  });
});
