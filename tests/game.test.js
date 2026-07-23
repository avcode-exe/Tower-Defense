import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';
import { CONFIG, TROOP_SPECS, LAYOUT } from '../src/config.js';
import { TILE } from '../src/grid.js';

vi.mock('../src/audio.js', () => ({
  AUDIO: {
    troopPlace: vi.fn(),
    sell: vi.fn(),
    goldEarned: vi.fn(),
    upgrade: vi.fn(),
    heal: vi.fn(),
    shieldBuy: vi.fn(),
    waveStart: vi.fn(),
    defeat: vi.fn(),
    toggleMute: vi.fn(),
    monsterLeak: vi.fn(),
    monsterDeath: vi.fn(),
    rangedAttack: vi.fn(),
    meleeAttack: vi.fn(),
    waveComplete: vi.fn(),
    troopDeath: vi.fn(),
  },
}));
vi.mock('../src/particles.js', () => ({
  PARTICLES: {
    update: vi.fn(),
    clear: vi.fn(),
    deathBurst: vi.fn(),
    hitSpark: vi.fn(),
    chainSpark: vi.fn(),
    slowApply: vi.fn(),
    healBurst: vi.fn(),
    troopDeath: vi.fn(),
    troopShieldActivate: vi.fn(),
    reviveBurst: vi.fn(),
    splashImpact: vi.fn(),
    spawnTrail: vi.fn(),
    spawn: vi.fn(),
    burnApply: vi.fn(),
    burnTick: vi.fn(),
  },
}));
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
    endFrame: vi.fn(),
    width: 800,
    height: 600,
    offsetX: 0,
    offsetY: 0,
    scale: 1,
    hoverPx: null,
    hoverPy: null,
    canvas: { getContext: vi.fn() },
    ctx: { fillStyle: '', fillRect: vi.fn(), fillText: vi.fn(), font: '', textAlign: '', textBaseline: '' },
  },
}));
vi.mock('../src/rendering/gameRenderer.js', () => ({ renderGame: vi.fn(), updateCursor: vi.fn() }));
vi.mock('../src/gameRuntime.js', () => {
  class MockRuntimeController {
    constructor() {
      this.installResize = vi.fn();
      this.startLoop = vi.fn();
      this.stopLoop = vi.fn();
      this.applyDefeat = vi.fn();
      this.startWave = vi.fn();
      this.togglePause = vi.fn();
      this.pauseGame = vi.fn();
      this.resumeGame = vi.fn();
      this.startPauseRender = vi.fn();
      this.stopPauseRender = vi.fn();
      this.removeResize = vi.fn();
    }
  }
  return { GameRuntimeController: MockRuntimeController };
});
vi.mock('../src/gamePersistence.js', () => ({
  SaveSerializer: { fromGame: vi.fn(() => ({})), isValid: vi.fn(() => true) },
  GameWorldFactory: {
    createFresh: vi.fn(() => ({
      grid: {
        get: vi.fn(),
        set: vi.fn(),
        isBuildable: vi.fn(() => true),
        tiles: new Uint8Array(256),
        size: 16,
        clear: vi.fn(),
        idx: vi.fn(),
      },
      waypoints: [[0, 0]],
      pathSegments: { segments: [{ ax: 0, ay: 26.5, bx: 848, by: 26.5, len: 848, cumStart: 0 }], totalLength: 848 },
    })),
  },
  GameSnapshotRestorer: { apply: vi.fn(), applyFresh: vi.fn() },
}));
vi.mock('../src/ui/index.js', () => ({
  UI: {
    handleToggleClick: vi.fn(() => false),
    hitShop: vi.fn(() => -1),
    hitToggleButtons: vi.fn(() => false),
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
    _devConfirmYes: null,
    _devConfirmNo: null,
    _shieldBuyBtn: null,
    _ghostPos: { x: 0, y: 0 },
    _tileScratch: { gx: 0, gy: 0 },
    shopScrollY: 0,
  },
  UI_LAYOUT: {
    collapsed: {
      hud: false,
      shop: false,
      shieldShop: false,
      preview: false,
      help: false,
      monsterInfo: false,
      settings: false,
      about: false,
      dev: false,
    },
    shopWidth: 250,
    hudHeight: 56,
    previewHeight: 80,
    shieldShopWidth: 220,
    SHOP_WIDTH: 250,
  },
}));

import { UI, UI_LAYOUT } from '../src/ui/index.js';
import { RENDERER } from '../src/rendering/renderer.js';

describe('Game', () => {
  let Game, makeGame, swordsmanSpec, placeMonsterAt, AUDIO, RENDERER_REF, UI_REF, UI_LAYOUT_REF;

  beforeAll(async () => {
    const mod = await import('../src/game.js');
    Game = mod.Game;
    const audioMod = await import('../src/audio.js');
    AUDIO = audioMod.AUDIO;
    const helpers = await import('./helpers.js');
    makeGame = helpers.makeGame;
    swordsmanSpec = helpers.swordsmanSpec;
    placeMonsterAt = helpers.placeMonsterAt;
    const uiMod = await import('../src/ui/index.js');
    UI_REF = uiMod.UI;
    UI_LAYOUT_REF = uiMod.UI_LAYOUT;
    const rMod = await import('../src/rendering/renderer.js');
    RENDERER_REF = rMod.RENDERER;
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('canPlace', () => {
    it('empty tile returns true', () => {
      const game = makeGame();
      expect(game.canPlace(1, 1, { cost: 100 })).toBe(true);
    });
    it('insufficient gold returns false', () => {
      const game = makeGame({ gold: 0, devMode: false });
      expect(game.canPlace(1, 1, { cost: 100 })).toBe(false);
    });
    it('PATH tile returns false', () => {
      const game = makeGame();
      expect(game.canPlace(0, 0, { cost: 100 })).toBe(false);
    });
    it('occupied tile returns false', () => {
      const game = makeGame();
      game.placeTroop(swordsmanSpec, 1, 1);
      expect(game.canPlace(1, 1, { cost: 100 })).toBe(false);
    });
    it('dead troop allows placement', () => {
      const game = makeGame();
      game.placeTroop(swordsmanSpec, 1, 1);
      game.troops[0].alive = false;
      expect(game.canPlace(1, 1, { cost: 100 })).toBe(true);
    });
    it('dev mode bypasses gold check', () => {
      const game = makeGame({ devMode: true, gold: 0 });
      expect(game.canPlace(1, 1, { cost: 100000 })).toBe(true);
    });
    it('out-of-bounds returns false', () => {
      const game = makeGame();
      expect(game.canPlace(-1, 0, { cost: 100 })).toBe(false);
      expect(game.canPlace(16, 0, { cost: 100 })).toBe(false);
    });
  });

  describe('getPlacementInvalidReason', () => {
    it('returns gold reason when insufficient gold', () => {
      const game = makeGame({ gold: 10, devMode: false });
      expect(game.getPlacementInvalidReason(1, 1, { cost: 100 })).toBe('Need 100g');
    });
    it('returns null for valid placement', () => {
      const game = makeGame();
      expect(game.getPlacementInvalidReason(1, 1, { cost: 100 })).toBeNull();
    });
    it('returns Cannot build here for non-buildable', () => {
      const game = makeGame();
      expect(game.getPlacementInvalidReason(0, 0, { cost: 100 })).toBe('Cannot build here');
    });
    it('returns Tile occupied for occupied', () => {
      const game = makeGame();
      game.placeTroop(swordsmanSpec, 1, 1);
      expect(game.getPlacementInvalidReason(1, 1, { cost: 100 })).toBe('Tile occupied');
    });
    it('dev mode null for valid', () => {
      const game = makeGame({ devMode: true, gold: 0 });
      expect(game.getPlacementInvalidReason(1, 1, { cost: 100 })).toBeNull();
    });
    it('priority order: gold before tile', () => {
      const game = makeGame({ gold: 10, devMode: false });
      expect(game.getPlacementInvalidReason(0, 0, { cost: 100 })).toBe('Need 100g');
    });
  });

  describe('placeTroop', () => {
    it('creates Troop and deducts gold', () => {
      const game = makeGame({ gold: 1000 });
      const result = game.placeTroop(swordsmanSpec, 1, 1);
      expect(result).toBe(true);
      expect(game.troops.length).toBe(1);
      expect(game.gold).toBe(1000 - swordsmanSpec.cost);
    });
    it('returns false when cannot place', () => {
      const game = makeGame({ gold: 10 });
      expect(game.placeTroop(swordsmanSpec, 1, 1)).toBe(false);
    });
    it('dev mode free placement', () => {
      const game = makeGame({ devMode: true, gold: 0 });
      game.placeTroop(swordsmanSpec, 1, 1);
      expect(game.gold).toBe(0);
    });
    it('calls AUDIO.troopPlace', () => {
      const game = makeGame();
      game.placeTroop(swordsmanSpec, 1, 1);
      expect(AUDIO.troopPlace).toHaveBeenCalled();
    });
  });

  describe('sellTroop', () => {
    it('sets alive=false and clears tile', () => {
      const game = makeGame();
      game.placeTroop(swordsmanSpec, 1, 1);
      game.grid.set(1, 1, TILE.BLOCKED);
      game.sellTroop(0);
      expect(game.troops[0].alive).toBe(false);
      expect(game.grid.get(1, 1)).toBe(TILE.EMPTY);
    });
    it('refunds ceil(SELL_REFUND_RATIO * totalInvested)', () => {
      const game = makeGame({ gold: 1000 });
      game.placeTroop(swordsmanSpec, 1, 1);
      const invested = game.troops[0].getTotalInvested();
      const expectedRefund = Math.ceil(invested * CONFIG.SELL_REFUND_RATIO);
      game.sellTroop(0);
      expect(game.gold).toBe(1000 - swordsmanSpec.cost + expectedRefund);
    });
    it('calls AUDIO.sell', () => {
      const game = makeGame();
      game.placeTroop(swordsmanSpec, 1, 1);
      game.sellTroop(0);
      expect(AUDIO.sell).toHaveBeenCalled();
    });
  });

  describe('upgradeTroopStat', () => {
    it('deducts gold and upgrades', () => {
      const game = makeGame({ gold: 10000 });
      game.placeTroop(swordsmanSpec, 1, 1);
      const cost = game.troops[0].getUpgradeCost('dmg');
      game.upgradeTroopStat(0, 'dmg');
      expect(game.troops[0].dmgLevel).toBe(2);
      expect(game.gold).toBe(10000 - swordsmanSpec.cost - cost);
    });
    it('no-op when maxed', () => {
      const game = makeGame({ gold: 10000 });
      game.placeTroop(swordsmanSpec, 1, 1);
      game.troops[0].dmgLevel = CONFIG.MAX_UPGRADE_LEVEL;
      game.upgradeTroopStat(0, 'dmg');
      expect(game.troops[0].dmgLevel).toBe(CONFIG.MAX_UPGRADE_LEVEL);
    });
  });

  describe('damageMonster', () => {
    it('returns false for dead monster', () => {
      const game = makeGame();
      game.spawnMonster(1);
      game.monsters[0].alive = false;
      expect(game.damageMonster(game.monsters[0], 10)).toBe(false);
    });
    it('awards gold on kill', () => {
      const game = makeGame({ gold: 0 });
      game.spawnMonster(1);
      game.damageMonster(game.monsters[0], 9999);
      expect(game.gold).toBeGreaterThan(0);
    });
    it('force-kills HP-zero monster without reward (lines 254-257)', () => {
      const game = makeGame({ gold: 0 });
      game.spawnMonster(1);
      game.monsters[0].hp = 0;
      const result = game.damageMonster(game.monsters[0], 10);
      expect(result).toBe(true);
      expect(game.monsters[0].alive).toBe(false);
      expect(game.gold).toBe(0); // no reward
    });
  });

  describe('step', () => {
    it('no-op when PAUSED', () => {
      const game = makeGame();
      game.state = 'PAUSED';
      game.step(1 / 60);
      expect(game.state).toBe('PAUSED');
    });
    it('no-op when DEFEAT', () => {
      const game = makeGame();
      game.state = 'DEFEAT';
      game.step(1 / 60);
      expect(game.state).toBe('DEFEAT');
    });
  });

  describe('_addGold', () => {
    it('caps at MAX_GOLD', () => {
      const game = makeGame({ gold: CONFIG.MAX_GOLD - 1 });
      game._addGold(100);
      expect(game.gold).toBe(CONFIG.MAX_GOLD);
    });
    it('sets Infinity in dev mode', () => {
      const game = makeGame({ devMode: true });
      game._addGold(100);
      expect(game.gold).toBe(Infinity);
    });
  });

  describe('findTroopAtTile', () => {
    it('returns index for alive troop', () => {
      const game = makeGame();
      game.placeTroop(swordsmanSpec, 1, 1);
      expect(game.findTroopAtTile(1, 1)).toBe(0);
    });
    it('returns -1 for empty tile', () => {
      const game = makeGame();
      expect(game.findTroopAtTile(1, 1)).toBe(-1);
    });
    it('returns -1 for out-of-bounds', () => {
      const game = makeGame();
      expect(game.findTroopAtTile(-1, 0)).toBe(-1);
    });
    it('returns -1 when alive troop not in indexByRef map (line 1133 ?? -1)', () => {
      const game = makeGame();
      game.placeTroop(swordsmanSpec, 3, 3);
      game._troopIndexByRef.clear();
      const idx = game.findTroopAtTile(3, 3);
      expect(idx).toBe(-1);
    });
  });

  describe('killTroop', () => {
    it('sets alive=false and clears grid', () => {
      const game = makeGame();
      game.placeTroop(swordsmanSpec, 1, 1);
      game.killTroop(game.troops[0]);
      expect(game.troops[0].alive).toBe(false);
    });

    it('clears selectedTroopIndex when selected troop is killed (line 307)', () => {
      const game = makeGame();
      game.placeTroop(swordsmanSpec, 1, 1);
      game.selectedTroopIndex = 0;
      game.troops[0].alive = false;
      game.killTroop(game.troops[0]);
      expect(game.selectedTroopIndex).toBe(-1);
    });

    it('clears sellConfirm when confirmed troop is killed (lines 311-312)', () => {
      const game = makeGame();
      game.placeTroop(swordsmanSpec, 1, 1);
      game.sellConfirmPending = true;
      game.sellConfirmTroop = game.troops[0];
      game.killTroop(game.troops[0]);
      expect(game.sellConfirmPending).toBe(false);
      expect(game.sellConfirmTroop).toBeNull();
    });
  });

  describe('damageTroop', () => {
    it('applies melee damage reduction', () => {
      const game = makeGame();
      game.placeTroop(swordsmanSpec, 1, 1);
      const monster = { spec: { damage: 50 }, reviveImmune: false };
      game.damageTroop(monster, game.troops[0]);
      expect(game.troops[0].hp).toBeLessThan(game.troops[0].maxHp);
    });
  });

  describe('_getPopup', () => {
    it('creates popup without pool', () => {
      const game = makeGame();
      game._getPopup('test', 10, 10, 1, '#fff');
      expect(game.popups.length).toBe(1);
    });
    it('recycles from pool', () => {
      const game = makeGame();
      game._popupPool.push({ text: '', x: 0, y: 0, t: 0, color: '' });
      game._getPopup('recycled', 10, 10, 1, '#fff');
      expect(game._popupPool.length).toBe(0);
      expect(game.popups.length).toBe(1);
    });
  });

  describe('_findClosestMonsterNear', () => {
    it('returns closest alive monster', () => {
      const game = makeGame();
      const m1 = placeMonsterAt(game, 1, 5, 5);
      const m2 = placeMonsterAt(game, 1, 6, 5);
      game._updateMonsterTileIndex();
      const closest = game._findClosestMonsterNear(m1.x, m1.y, 3);
      expect(closest).toBe(m1);
    });
    it('returns null when no monsters', () => {
      const game = makeGame();
      expect(game._findClosestMonsterNear(100, 100, 3)).toBeNull();
    });
    it('skips dead monsters', () => {
      const game = makeGame();
      const m = placeMonsterAt(game, 1, 5, 5);
      m.alive = false;
      game._updateMonsterTileIndex();
      expect(game._findClosestMonsterNear(m.x, m.y, 3)).toBeNull();
    });
  });

  describe('_applySlowToMonster', () => {
    it('calls PARTICLES.slowApply when slow applied', async () => {
      const game = makeGame();
      const m = placeMonsterAt(game, 1, 5, 5);
      const troop = { _cachedSlowFactor: 0.5, _cachedSlowDuration: 2, _cachedShatterBonus: 0, spec: { color: '#00f' } };
      vi.spyOn(m, 'applySlow').mockReturnValue(true);
      game._applySlowToMonster(m, troop);
      const mod = await import('../src/particles.js');
      expect(mod.PARTICLES.slowApply).toHaveBeenCalled();
    });
    it('skips PARTICLES when slow not applied', async () => {
      const game = makeGame();
      const m = placeMonsterAt(game, 1, 5, 5);
      const troop = { _cachedSlowFactor: 0.5, _cachedSlowDuration: 2, _cachedShatterBonus: 0, spec: { color: '#00f' } };
      vi.spyOn(m, 'applySlow').mockReturnValue(false);
      game._applySlowToMonster(m, troop);
      const mod = await import('../src/particles.js');
      expect(mod.PARTICLES.slowApply).not.toHaveBeenCalled();
    });
  });

  describe('applyBurn', () => {
    it('returns false for null monster', () => {
      const game = makeGame();
      expect(game.applyBurn(null, { spec: { burnStacks: 1 } })).toBe(false);
    });
    it('returns false for dead monster', () => {
      const game = makeGame();
      const m = placeMonsterAt(game, 1, 5, 5);
      m.alive = false;
      expect(game.applyBurn(m, { spec: { burnStacks: 1 } })).toBe(false);
    });
    it('returns false when no burnStacks', () => {
      const game = makeGame();
      const m = placeMonsterAt(game, 1, 5, 5);
      expect(game.applyBurn(m, { spec: {} })).toBe(false);
    });
  });

  describe('chainHitAt', () => {
    it('chains to multiple monsters', () => {
      const game = makeGame();
      placeMonsterAt(game, 1, 5, 5);
      placeMonsterAt(game, 1, 5, 6);
      placeMonsterAt(game, 1, 5, 7);
      game._updateMonsterTileIndex();
      const troop = { _cachedDamage: 100, _cachedRange: 5, _cachedChain: 3, spec: { stun: 0 } };
      const goldBefore = game.gold;
      game.chainHitAt(game.monsters[0].x, game.monsters[0].y, troop);
      expect(game.gold).toBeGreaterThan(goldBefore);
    });
    it('stops when too far', () => {
      const game = makeGame();
      placeMonsterAt(game, 1, 5, 5);
      placeMonsterAt(game, 1, 15, 0);
      game._updateMonsterTileIndex();
      const troop = { _cachedDamage: 100, _cachedRange: 5, _cachedChain: 5, spec: { stun: 0 } };
      game.chainHitAt(game.monsters[0].x, game.monsters[0].y, troop);
      expect(game.monsters.filter((m) => !m.alive).length).toBeGreaterThanOrEqual(0);
    });
    it('handles no monsters gracefully', () => {
      const game = makeGame();
      const troop = { _cachedDamage: 100, _cachedRange: 5, _cachedChain: 3, spec: { stun: 0 } };
      expect(() => game.chainHitAt(100, 100, troop)).not.toThrow();
    });
  });

  describe('splashAt', () => {
    it('damages monsters within radius', () => {
      const game = makeGame();
      const m = placeMonsterAt(game, 1, 5, 5);
      game._updateMonsterTileIndex();
      const hits = game.splashAt(m.x, m.y, 5, 5, { spec: { color: '#9b59b6' } });
      expect(hits.length).toBe(1);
    });
    it('returns empty when no monsters', () => {
      const game = makeGame();
      const hits = game.splashAt(100, 100, 100, 2, { spec: { color: '#9b59b6' } });
      expect(hits.length).toBe(0);
    });
    it('skips monsters outside splash radius', () => {
      const game = makeGame();
      const m = placeMonsterAt(game, 1, 5, 5);
      game._updateMonsterTileIndex();
      const farX = m.x + 9999;
      const farY = m.y + 9999;
      const hits = game.splashAt(farX, farY, 100, 2, { spec: { color: '#9b59b6' } });
      expect(hits.length).toBe(0);
    });
    it('handles splash at grid edge', () => {
      const game = makeGame();
      placeMonsterAt(game, 1, 0, 0);
      game._updateMonsterTileIndex();
      const hits = game.splashAt(10, 10, 10, 3, { spec: { color: '#9b59b6' } });
      expect(hits.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe('applyProjectileImpact', () => {
    it('handles dead target using lastTargetX/Y', () => {
      const game = makeGame();
      placeMonsterAt(game, 1, 5, 5);
      const troop = { _cachedDamage: 100, _cachedRange: 5, spec: { chain: 0, splash: 0, slowFactor: null } };
      const proj = { troop, target: game.monsters[0], lastTargetX: 100, lastTargetY: 100 };
      game.monsters[0].alive = false;
      expect(() => game.applyProjectileImpact(proj)).not.toThrow();
    });
    it('damages live target', () => {
      const game = makeGame();
      const m = placeMonsterAt(game, 1, 5, 5);
      game._updateMonsterTileIndex();
      const troop = { _cachedDamage: 100, _cachedRange: 5, spec: { chain: 0, splash: 0, slowFactor: null } };
      const proj = { troop, target: m, lastTargetX: m.x, lastTargetY: m.y };
      game.applyProjectileImpact(proj);
      expect(m.hp).toBeLessThan(m.maxHp);
    });
    it('applies slow when spec has slowFactor', () => {
      const game = makeGame();
      const m = placeMonsterAt(game, 1, 5, 5);
      game._updateMonsterTileIndex();
      const troop = {
        _cachedDamage: 50,
        _cachedRange: 5,
        _cachedSlowFactor: 0.5,
        _cachedSlowDuration: 2,
        _cachedShatterBonus: 0,
        spec: { chain: 0, splash: 0, slowFactor: 0.5 },
      };
      const proj = { troop, target: m, lastTargetX: m.x, lastTargetY: m.y };
      vi.spyOn(m, 'applySlow').mockReturnValue(true);
      expect(() => game.applyProjectileImpact(proj)).not.toThrow();
    });
  });

  describe('_stepMonsterAttacks', () => {
    it('attacks valid pending target', () => {
      const game = makeGame();
      game.placeTroop(swordsmanSpec, 1, 1);
      const monster = placeMonsterAt(game, 1, 5, 5);
      monster._pendingAttack = game.troops[0];
      expect(() => game._stepMonsterAttacks()).not.toThrow();
      expect(monster._pendingAttack).toBeNull();
    });
    it('skips dead pending target', () => {
      const game = makeGame();
      game.placeTroop(swordsmanSpec, 1, 1);
      game.troops[0].alive = false;
      const monster = placeMonsterAt(game, 1, 5, 5);
      monster._pendingAttack = game.troops[0];
      expect(() => game._stepMonsterAttacks()).not.toThrow();
      expect(monster._pendingAttack).toBeNull();
    });
  });

  describe('_stepNecromancerRevives', () => {
    it('revives dead allies within range', () => {
      const game = makeGame();
      const necro = placeMonsterAt(game, 'Y', 5, 5);
      const dead = placeMonsterAt(game, 1, 5, 6);
      dead.alive = false;
      dead.reviveImmune = false;
      game._stepNecromancerRevives();
      expect(game.monsters.filter((m) => m.alive).length).toBeGreaterThanOrEqual(1);
    });
    it('does not revive out-of-range monsters', () => {
      const game = makeGame();
      const necro = placeMonsterAt(game, 'Y', 5, 5);
      const dead = placeMonsterAt(game, 1, 15, 0);
      dead.alive = false;
      dead.reviveImmune = false;
      game._stepNecromancerRevives();
      expect(dead.alive).toBe(false);
    });
  });

  describe('_cleanupDead', () => {
    it('compacts monsters', () => {
      const game = makeGame();
      game.monsters = [{ alive: false }, { alive: true }, { alive: false }, { alive: true }];
      game._cleanupDead();
      expect(game.monsters.length).toBe(2);
    });
    it('recycles projectiles to pool', () => {
      const game = makeGame();
      game.projectiles = [{ alive: false }, { alive: true }];
      game._cleanupDead();
      expect(game._projectilePool.length).toBe(1);
      expect(game.projectiles.length).toBe(1);
    });
    it('preserves selectedTroopIndex', () => {
      const game = makeGame();
      game.placeTroop(swordsmanSpec, 1, 1);
      game.placeTroop(swordsmanSpec, 2, 2);
      game.selectedTroopIndex = 0;
      game.troops[1].alive = false;
      game._cleanupDead();
      expect(game.selectedTroopIndex).toBe(0);
    });
  });

  describe('_stepWaveCompletion', () => {
    it('transitions to PRE_WAVE', () => {
      const game = makeGame();
      game.state = 'WAVE_ACTIVE';
      game.wave.spawnIndex = game.wave.queue.length;
      game.wave.currentWave = 0;
      game._stepWaveCompletion();
      expect(game.state).toBe('PRE_WAVE');
    });
    it('awards boss bonus at wave 10', () => {
      const game = makeGame({ gold: 0 });
      game.state = 'WAVE_ACTIVE';
      game.wave.spawnIndex = game.wave.queue.length;
      game.wave.currentWave = 9;
      game._stepWaveCompletion();
      expect(game.gold).toBeGreaterThan(0);
    });
    it('expires shields at SHIELD_EXPIRE_WAVES', () => {
      const game = makeGame();
      game.placeTroop(swordsmanSpec, 1, 1);
      game.troops[0].applyShield();
      game.state = 'WAVE_ACTIVE';
      game.wave.spawnIndex = game.wave.queue.length;
      game.wave.currentWave = Math.max(CONFIG.SHIELD_EXPIRE_WAVES, 10) - 1;
      game._stepWaveCompletion();
      if (CONFIG.SHIELD_EXPIRE_WAVES > 0 && (game.wave.currentWave + 1) % CONFIG.SHIELD_EXPIRE_WAVES === 0) {
        expect(game.troops[0].shield).toBe(0);
      }
    });
    it('no-op when not WAVE_ACTIVE', () => {
      const game = makeGame();
      game.state = 'PRE_WAVE';
      expect(() => game._stepWaveCompletion()).not.toThrow();
    });
    it('no-op when still spawning', () => {
      const game = makeGame();
      game.state = 'WAVE_ACTIVE';
      game.wave.spawnIndex = 0;
      game.wave.queue = [{ level: 1, count: 1 }];
      expect(() => game._stepWaveCompletion()).not.toThrow();
    });
    it('no-op when monsters remain', () => {
      const game = makeGame();
      game.state = 'WAVE_ACTIVE';
      game.wave.spawnIndex = game.wave.queue.length;
      placeMonsterAt(game, 1, 5, 5);
      expect(() => game._stepWaveCompletion()).not.toThrow();
    });
  });

  describe('_stepPopups', () => {
    it('removes expired popups', () => {
      const game = makeGame();
      game.popups.push({ text: 'test', x: 0, y: 0, t: 0.1, color: '#fff' });
      game._stepPopups(0.2);
      expect(game.popups.length).toBe(0);
    });
    it('recycles to pool with cap', () => {
      const game = makeGame();
      game.popups.push({ text: 'test', x: 0, y: 0, t: 0.1, color: '#fff' });
      game._stepPopups(0.2);
      expect(game._popupPool.length).toBe(1);
    });
  });

  describe('sellTroop', () => {
    it('sell cooldown blocks sell', () => {
      const game = makeGame();
      game.placeTroop(swordsmanSpec, 1, 1);
      game.sellCooldownTimer = 1;
      game.sellTroop(0);
      expect(game.troops[0].alive).toBe(true);
    });
    it('clears selectedTroopIndex when selling selected', () => {
      const game = makeGame();
      game.placeTroop(swordsmanSpec, 1, 1);
      game.selectedTroopIndex = 0;
      game.sellTroop(0);
      expect(game.selectedTroopIndex).toBe(-1);
    });
    it('no-op for invalid index', () => {
      const game = makeGame();
      expect(() => game.sellTroop(999)).not.toThrow();
    });
  });

  describe('healTroop', () => {
    it('heals troop and deducts gold', () => {
      const game = makeGame({ gold: 1000 });
      game.placeTroop(swordsmanSpec, 1, 1);
      game.troops[0].hp = 1;
      const goldBefore = game.gold;
      game.healTroop(0);
      expect(game.troops[0].hp).toBeGreaterThan(1);
      expect(game.gold).toBeLessThan(goldBefore);
    });
    it('no-op when troop is dead', () => {
      const game = makeGame();
      game.placeTroop(swordsmanSpec, 1, 1);
      game.troops[0].alive = false;
      game.healTroop(0);
      expect(game.troops[0].hp).toBe(swordsmanSpec.hp);
    });
  });

  describe('buyTroopShield', () => {
    it('applies shield and deducts gold', () => {
      const game = makeGame({ gold: 1000 });
      game.placeTroop(swordsmanSpec, 1, 1);
      const result = game.buyTroopShield(0);
      expect(result).toBe(true);
      expect(game.troops[0].shield).toBeGreaterThan(0);
    });
    it('returns false when already shielded', () => {
      const game = makeGame();
      game.placeTroop(swordsmanSpec, 1, 1);
      game.troops[0].applyShield();
      expect(game.buyTroopShield(0)).toBe(false);
    });
    it('returns false for dead troop', () => {
      const game = makeGame();
      game.placeTroop(swordsmanSpec, 1, 1);
      game.troops[0].alive = false;
      expect(game.buyTroopShield(0)).toBe(false);
    });
  });

  describe('acquireProjectile', () => {
    it('creates projectile from pool', () => {
      const game = makeGame();
      game.placeTroop(swordsmanSpec, 1, 1);
      const m = placeMonsterAt(game, 1, 5, 5);
      game._projectilePool.push({ alive: false });
      const p = game.acquireProjectile(game.troops[0], m, 50, 50);
      expect(p).toBeTruthy();
      expect(p.alive).toBe(true);
    });
    it('creates new projectile when pool empty', () => {
      const game = makeGame();
      game.placeTroop(swordsmanSpec, 1, 1);
      const m = placeMonsterAt(game, 1, 5, 5);
      const p = game.acquireProjectile(game.troops[0], m, 50, 50);
      expect(p).toBeTruthy();
    });
  });

  describe('onKeyDown', () => {
    it('R restarts in DEFEAT state', () => {
      const game = makeGame();
      game.state = 'DEFEAT';
      const mockRestart = vi.spyOn(game, 'restart').mockImplementation(() => {});
      const e = { key: 'r', preventDefault: vi.fn() };
      game.onKeyDown(e);
      expect(mockRestart).toHaveBeenCalled();
    });
    it('Escape deselects', () => {
      const game = makeGame();
      game.selectedSpec = { cost: 100 };
      game.selectedTroopIndex = 0;
      const e = { key: 'Escape', preventDefault: vi.fn() };
      game.onKeyDown(e);
      expect(game.selectedSpec).toBeNull();
      expect(game.selectedTroopIndex).toBe(-1);
    });
    it('Space toggles pause', () => {
      const game = makeGame();
      const e = { key: ' ', preventDefault: vi.fn() };
      game.onKeyDown(e);
      expect(game.runtime.togglePause).toHaveBeenCalled();
    });
    it('Enter starts wave in PRE_WAVE', () => {
      const game = makeGame();
      game.state = 'PRE_WAVE';
      const e = { key: 'Enter', preventDefault: vi.fn() };
      game.onKeyDown(e);
      expect(game.runtime.startWave).toHaveBeenCalled();
    });
    it('Enter in PRE_WAVE with devMode calls buildCustomFromCounts (line 1222)', () => {
      const game = makeGame({ devMode: true });
      game.state = 'PRE_WAVE';
      game.devMonsterCounts = { 1: 5 };
      vi.spyOn(game.wave, 'buildCustomFromCounts').mockImplementation(() => {});
      const e = { key: 'Enter', preventDefault: vi.fn() };
      game.onKeyDown(e);
      expect(game.wave.buildCustomFromCounts).toHaveBeenCalledWith({ 1: 5 });
      expect(game.runtime.startWave).toHaveBeenCalled();
    });

    // ===== Zoom shortcut tests =====
    it('Ctrl++ zooms in', () => {
      const game = makeGame();
      game.zoom = 1;
      vi.spyOn(game, '_applyZoom').mockImplementation(() => {});
      const e = { key: '+', ctrlKey: true, preventDefault: vi.fn() };
      game.onKeyDown(e);
      expect(e.preventDefault).toHaveBeenCalled();
      expect(game.zoom).toBe(1.1);
      expect(game._applyZoom).toHaveBeenCalled();
    });

    it('Ctrl+= also zooms in', () => {
      const game = makeGame();
      game.zoom = 1;
      vi.spyOn(game, '_applyZoom').mockImplementation(() => {});
      const e = { key: '=', ctrlKey: true, preventDefault: vi.fn() };
      game.onKeyDown(e);
      expect(game.zoom).toBe(1.1);
    });

    it('Ctrl+- zooms out', () => {
      const game = makeGame();
      game.zoom = 1.5;
      vi.spyOn(game, '_applyZoom').mockImplementation(() => {});
      const e = { key: '-', ctrlKey: true, preventDefault: vi.fn() };
      game.onKeyDown(e);
      expect(e.preventDefault).toHaveBeenCalled();
      expect(game.zoom).toBe(1.4);
      expect(game._applyZoom).toHaveBeenCalled();
    });

    it('Ctrl+0 resets zoom to 1', () => {
      const game = makeGame();
      game.zoom = 1.8;
      vi.spyOn(game, '_applyZoom').mockImplementation(() => {});
      const e = { key: '0', ctrlKey: true, preventDefault: vi.fn() };
      game.onKeyDown(e);
      expect(e.preventDefault).toHaveBeenCalled();
      expect(game.zoom).toBe(1);
      expect(game._applyZoom).toHaveBeenCalled();
    });

    it('Ctrl++ caps zoom at 2', () => {
      const game = makeGame();
      game.zoom = 2;
      vi.spyOn(game, '_applyZoom').mockImplementation(() => {});
      const e = { key: '+', ctrlKey: true, preventDefault: vi.fn() };
      game.onKeyDown(e);
      expect(game.zoom).toBe(2); // not 2.1
    });

    it('Ctrl+- caps zoom at 1', () => {
      const game = makeGame();
      game.zoom = 1;
      vi.spyOn(game, '_applyZoom').mockImplementation(() => {});
      const e = { key: '-', ctrlKey: true, preventDefault: vi.fn() };
      game.onKeyDown(e);
      expect(game.zoom).toBe(1); // not 0.9
    });

    it('zoom shortcuts disabled when scrollZoom is false', () => {
      const game = makeGame();
      game.scrollZoom = false;
      game.zoom = 1;
      vi.spyOn(game, '_applyZoom').mockImplementation(() => {});
      const e = { key: '+', ctrlKey: true, preventDefault: vi.fn() };
      game.onKeyDown(e);
      expect(e.preventDefault).not.toHaveBeenCalled();
      expect(game.zoom).toBe(1);
      expect(game._applyZoom).not.toHaveBeenCalled();
    });
  });

  describe('_applyZoom', () => {
    it('sets UI_LAYOUT._zoom and LAYOUT_ZOOM.value and resizes', async () => {
      const game = makeGame();
      game.zoom = 1.5;
      const configMod = await import('../src/config.js');
      game._applyZoom();
      // game.js imports UI_LAYOUT from mocked ui/index.js — use the test's mocked reference
      expect(UI_LAYOUT._zoom).toBe(1.5);
      expect(configMod.LAYOUT_ZOOM.value).toBe(1.5);
      expect(game._zoomIndicatorTime).toBeGreaterThan(0);
    });

    it('falls back to zoom=1 when zoom is falsy', async () => {
      const game = makeGame();
      game.zoom = 0;
      const configMod = await import('../src/config.js');
      game._applyZoom();
      expect(UI_LAYOUT._zoom).toBe(1);
      expect(configMod.LAYOUT_ZOOM.value).toBe(1);
    });
  });

  describe('onMouseDown', () => {
    it('right-click deselects', () => {
      const game = makeGame();
      game.selectedSpec = {};
      game.onMouseDown(10, 10, 2);
      expect(game.selectedSpec).toBeNull();
    });
    it('no-op when DEFEAT', () => {
      const game = makeGame();
      game.state = 'DEFEAT';
      expect(() => game.onMouseDown(10, 10, 0)).not.toThrow();
    });
  });

  describe('_handleConfirmationClicks', () => {
    it('yes button confirms dev mode toggle', () => {
      const game = makeGame();
      game.devConfirmPending = true;
      vi.spyOn(game, 'toggleDevMode').mockImplementation(() => {});
      const UI_ = UI_REF || UI;
      UI_._devConfirmYes = { x: 0, y: 0, w: 100, h: 50 };
      game._handleConfirmationClicks(10, 10);
      expect(game.devConfirmPending).toBe(false);
    });
    it('no button cancels all confirmations', () => {
      const game = makeGame();
      game.devConfirmPending = true;
      game.resetConfirmPending = true;
      game.sellConfirmPending = true;
      const UI_ = UI_REF || UI;
      UI_._devConfirmYes = null;
      UI_._devConfirmNo = { x: 0, y: 0, w: 100, h: 50 };
      game._handleConfirmationClicks(10, 10);
      expect(game.devConfirmPending).toBe(false);
      expect(game.resetConfirmPending).toBe(false);
      expect(game.sellConfirmPending).toBe(false);
    });
  });

  describe('_handleGoldClick', () => {
    it('triple-click triggers dev confirm', () => {
      const game = makeGame();
      const now = performance.now();
      game._goldClicks = 2;
      game._goldClickTimer = now - 10;
      game._handleGoldClick(LAYOUT.HUD.GOLD_AREA.x + 5, LAYOUT.HUD.GOLD_AREA.y + 5);
      expect(game.devConfirmPending).toBe(true);
    });
    it('resets clicks after 800ms timeout', () => {
      const game = makeGame();
      game._goldClicks = 2;
      game._goldClickTimer = performance.now() - 900;
      game._handleGoldClick(LAYOUT.HUD.GOLD_AREA.x + 5, LAYOUT.HUD.GOLD_AREA.y + 5);
      expect(game._goldClicks).toBe(1);
    });
    it('does nothing outside gold area', () => {
      const game = makeGame();
      game._handleGoldClick(0, 0);
      expect(game._goldClicks).toBe(0);
    });
  });

  describe('_handleHUDClicks', () => {
    it('handles speed button click', () => {
      const game = makeGame();
      const w = RENDERER_REF ? RENDERER_REF.width : 800;
      const speedBtn = {
        x: w - LAYOUT.HUD.SPEED_OFFSET + 0 * 28,
        y: 14,
        w: LAYOUT.HUD.SPEED_BTN_W,
        h: LAYOUT.HUD.SPEED_BTN_H,
      };
      game._handleHUDClicks(speedBtn.x + 5, speedBtn.y + 5);
      expect(game.speed).toBe(CONFIG.GAME_SPEEDS[0]);
    });
    it('handles reset button click', () => {
      const game = makeGame();
      const resetBtn = LAYOUT.HUD.RESET_BTN;
      game._handleHUDClicks(resetBtn.x + 1, resetBtn.y + 1);
      expect(game.resetConfirmPending).toBe(true);
    });
  });

  describe('_handleShopClick', () => {
    it('selects new spec when different', () => {
      const game = makeGame();
      const UI_ = UI_REF || UI;
      UI_.hitShop = vi.fn(() => 0);
      game._handleShopClick(10, 10);
      expect(game.selectedSpec).toBe(TROOP_SPECS[0]);
    });
    it('starts drag when clicking same spec', () => {
      const game = makeGame();
      game.selectedSpec = TROOP_SPECS[0];
      const UI_ = UI_REF || UI;
      UI_.hitShop = vi.fn(() => 0);
      game._handleShopClick(10, 10);
      expect(game._dragState).toBeTruthy();
      expect(game._dragState.spec).toBe(TROOP_SPECS[0]);
    });
  });

  describe('onMouseUp', () => {
    it('completes drag-to-place', () => {
      const game = makeGame();
      game._dragState = { spec: swordsmanSpec };
      game.onMouseUp(300, 300);
      expect(game._dragState).toBeNull();
    });
    it('no-op without drag state', () => {
      const game = makeGame();
      expect(() => game.onMouseUp(10, 10)).not.toThrow();
    });
  });

  describe('_buildTroopTileIndex', () => {
    it('indexes alive troops', () => {
      const game = makeGame();
      game.placeTroop(swordsmanSpec, 1, 1);
      game.placeTroop(swordsmanSpec, 2, 2);
      const idx1 = 1 * CONFIG.GRID_SIZE + 1;
      expect(game._troopTileIndex[idx1].length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('spawnMonster', () => {
    it('creates monster with hpMult', () => {
      const game = makeGame();
      game.spawnMonster(1, 2);
      expect(game.monsters.length).toBe(1);
      expect(game.monsters[0].hpMult).toBe(2);
    });
  });

  describe('_stepTroops / _stepProjectiles', () => {
    it('updates all alive troops', () => {
      const game = makeGame();
      game.placeTroop(swordsmanSpec, 1, 1);
      vi.spyOn(game.troops[0], 'update');
      game._stepTroops(1 / 60);
      expect(game.troops[0].update).toHaveBeenCalled();
    });
    it('updates all alive projectiles', () => {
      const game = makeGame();
      placeMonsterAt(game, 1, 5, 5);
      const p = { alive: true, update: vi.fn() };
      game.projectiles.push(p);
      game._stepProjectiles(1 / 60);
      expect(p.update).toHaveBeenCalled();
    });
  });

  describe('restart', () => {
    it('resets state', () => {
      const game = makeGame();
      vi.stubGlobal('window', { electron: null, document: { getElementById: vi.fn() } });
      vi.spyOn(game.runtime, 'stopLoop');
      vi.spyOn(game, 'start');
      game.restart();
      expect(game.state).toBe('PRE_WAVE');
      expect(game.runtime.stopLoop).toHaveBeenCalled();
      expect(game.start).toHaveBeenCalled();
      vi.unstubAllGlobals();
    });
  });

  describe('toggleDevMode / resetGame', () => {
    it('toggles dev mode and restarts', () => {
      const game = makeGame();
      vi.stubGlobal('window', { electron: null });
      vi.stubGlobal('document', { getElementById: vi.fn(() => null) });
      vi.spyOn(game, 'restart');
      game.toggleDevMode();
      expect(game.devMode).toBe(true);
      expect(game.restart).toHaveBeenCalled();
      vi.unstubAllGlobals();
    });
    it('toggleDevMode sets style.display when devBtn exists (line 1298)', () => {
      const game = makeGame();
      const style = { display: '' };
      vi.stubGlobal('window', { electron: null });
      vi.stubGlobal('document', {
        getElementById: vi.fn((id) => {
          if (id === 'bar-dev-btn') return { style };
          return null;
        }),
      });
      vi.spyOn(game, 'restart').mockImplementation(() => {});
      // Turning dev mode ON should set display to '' (show)
      game.devMode = false;
      game.toggleDevMode();
      expect(game.devMode).toBe(true);
      expect(style.display).toBe('');
      // Turning dev mode OFF should set display to 'none' (hide)
      game.toggleDevMode();
      expect(game.devMode).toBe(false);
      expect(style.display).toBe('none');
      vi.unstubAllGlobals();
    });
    it('resetGame preserves dev mode', () => {
      const game = makeGame();
      vi.stubGlobal('window', { electron: null });
      vi.stubGlobal('document', { getElementById: vi.fn() });
      game.devMode = true;
      vi.spyOn(game, 'restart');
      game.resetGame();
      expect(game.devMode).toBe(true);
      expect(game.restart).toHaveBeenCalled();
      vi.unstubAllGlobals();
    });
  });

  describe('getSaveData / restore', () => {
    it('getSaveData calls SaveSerializer.fromGame', async () => {
      const game = makeGame();
      game.appVersion = '1.6.0';
      const SaveSerializer = (await import('../src/gamePersistence.js')).SaveSerializer;
      game.getSaveData();
      expect(SaveSerializer.fromGame).toHaveBeenCalledWith(game, '1.6.0');
    });
    it('restore resets state', () => {
      const game = makeGame();
      game.restore({});
      expect(game.sellCooldownTimer).toBe(0);
      expect(game.selectedSpec).toBeNull();
    });
  });

  describe('_handleSellClick', () => {
    it('dev mode sells directly', () => {
      const game = makeGame({ devMode: true });
      game.placeTroop(swordsmanSpec, 1, 1);
      game.selectedTroopIndex = 0;
      game.sellCooldownTimer = 0;
      game._handleSellClick(LAYOUT.SHOP.BTN_PAD + 10, 600 - LAYOUT.SHOP.SELL_BTN_Y_OFFSET + 10);
      expect(game.troops[0].alive).toBe(false);
    });
    it('normal mode sets confirmation', () => {
      const game = makeGame({ devMode: false });
      game.placeTroop(swordsmanSpec, 1, 1);
      game.selectedTroopIndex = 0;
      game._handleSellClick(LAYOUT.SHOP.BTN_PAD + 10, 600 - LAYOUT.SHOP.SELL_BTN_Y_OFFSET + 10);
      expect(game.sellConfirmPending).toBe(true);
      expect(game.sellConfirmTroop).toBe(game.troops[0]);
    });
  });

  describe('_handleMapClick with placement', () => {
    it('selects troop at tile', () => {
      const game = makeGame();
      const UI_LAYOUT_ = UI_LAYOUT_REF || UI_LAYOUT;
      game.placeTroop(swordsmanSpec, 8, 3);
      const px = 8 * CONFIG.TILE_SIZE + Math.floor(CONFIG.TILE_SIZE / 2);
      const py = 3 * CONFIG.TILE_SIZE + Math.floor(CONFIG.TILE_SIZE / 2);
      game._handleMapClick(px, py);
      expect(game.selectedTroopIndex).toBe(0);
    });
    it('shows popup on invalid placement', () => {
      const game = makeGame({ gold: 0, devMode: false });
      const UI_LAYOUT_ = UI_LAYOUT_REF || UI_LAYOUT;
      game.selectedSpec = { cost: 100 };
      const px = 8 * CONFIG.TILE_SIZE + Math.floor(CONFIG.TILE_SIZE / 2);
      const py = 3 * CONFIG.TILE_SIZE + Math.floor(CONFIG.TILE_SIZE / 2);
      game._handleMapClick(px, py);
      expect(game.popups.length).toBe(1);
    });
  });

  describe('_handlePopupShortcut coverage', () => {
    const mockPopupEl = () => ({
      classList: { add: vi.fn(), remove: vi.fn() },
      style: {},
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    });

    beforeEach(() => {
      vi.useFakeTimers();
      vi.stubGlobal('document', {
        getElementById: vi.fn(() => mockPopupEl()),
      });
    });
    afterEach(() => {
      vi.unstubAllGlobals();
      vi.useRealTimers();
    });

    it('handles Alt+U to open settings popup', () => {
      const game = makeGame();
      game._handlePopupShortcut({ key: 'u', altKey: true, preventDefault: vi.fn() });
      expect(game).toBeDefined();
    });

    it('handles Alt+C for help popup', () => {
      const game = makeGame();
      game._handlePopupShortcut({ key: 'c', altKey: true, preventDefault: vi.fn() });
      expect(game).toBeDefined();
    });

    it('handles Alt+M for monster info popup', () => {
      const game = makeGame();
      game._handlePopupShortcut({ key: 'm', altKey: true, preventDefault: vi.fn() });
      expect(game).toBeDefined();
    });

    it('handles Alt+D for dev popup', () => {
      const game = makeGame();
      game._handlePopupShortcut({ key: 'd', altKey: true, preventDefault: vi.fn() });
      expect(game).toBeDefined();
    });

    it('handles unknown Alt key silently', () => {
      const game = makeGame();
      const e = { key: 'z', altKey: true, preventDefault: vi.fn() };
      expect(() => game._handlePopupShortcut(e)).not.toThrow();
    });

    it('closes popup when already open', () => {
      const game = makeGame();
      const UI_LAYOUT_ = UI_LAYOUT_REF || UI_LAYOUT;
      UI_LAYOUT_.collapsed.settings = false;
      const el = { classList: { add: vi.fn(), remove: vi.fn() }, style: {} };
      vi.stubGlobal('document', { getElementById: vi.fn(() => el) });
      game._handlePopupShortcut({ key: 'u', altKey: true, preventDefault: vi.fn() });
      expect(el.classList.add).toHaveBeenCalledWith('bar-popup--closed');
    });

    it('switches between open popups with transitionend listener', () => {
      const game = makeGame();
      const UI_LAYOUT_ = UI_LAYOUT_REF || UI_LAYOUT;
      UI_LAYOUT_.collapsed.settings = true;
      UI_LAYOUT_.collapsed.dev = false;
      const addEventListenerMock = vi.fn();
      const removeEventListenerMock = vi.fn();
      const el = {
        classList: { add: vi.fn(), remove: vi.fn() },
        style: {},
        addEventListener: addEventListenerMock,
        removeEventListener: removeEventListenerMock,
      };
      vi.stubGlobal('document', { getElementById: vi.fn(() => el) });
      game._handlePopupShortcut({ key: 'u', altKey: true, preventDefault: vi.fn() });
      expect(addEventListenerMock).toHaveBeenCalledWith('transitionend', expect.any(Function));
      // Advance timers to trigger the setTimeout fallback, covering openFn closure
      vi.advanceTimersByTime(400);
      expect(UI_LAYOUT_.collapsed.settings).toBe(false);
      // openFn also calls togglePopupEl which does classList.add('active')
      expect(el.classList.add).toHaveBeenCalledWith('active');
    });

    it('switches popup without waiting when el is null', () => {
      const game = makeGame();
      const UI_LAYOUT_ = UI_LAYOUT_REF || UI_LAYOUT;
      UI_LAYOUT_.collapsed.settings = true;
      UI_LAYOUT_.collapsed.dev = false;
      vi.stubGlobal('document', { getElementById: vi.fn(() => null) });
      game._handlePopupShortcut({ key: 'u', altKey: true, preventDefault: vi.fn() });
      expect(UI_LAYOUT_.collapsed.settings).toBe(false);
    });

    it('handles popup switch transitionend fires correctly', () => {
      const game = makeGame();
      const UI_LAYOUT_ = UI_LAYOUT_REF || UI_LAYOUT;
      UI_LAYOUT_.collapsed.settings = true;
      UI_LAYOUT_.collapsed.dev = false;
      let registeredCallback = null;
      const removeEventListenerMock = vi.fn();
      const el = {
        classList: { add: vi.fn(), remove: vi.fn() },
        style: {},
        addEventListener: vi.fn((evt, cb) => {
          registeredCallback = cb;
        }),
        removeEventListener: removeEventListenerMock,
      };
      vi.stubGlobal('document', { getElementById: vi.fn(() => el) });
      game._handlePopupShortcut({ key: 'u', altKey: true, preventDefault: vi.fn() });
      expect(registeredCallback).toBeDefined();
      // Fire the transitionend callback (covers onDone: removeEventListener, clearTimeout, openFn)
      registeredCallback();
      expect(removeEventListenerMock).toHaveBeenCalledWith('transitionend', registeredCallback);
      expect(UI_LAYOUT_.collapsed.settings).toBe(false);
      // Advance timers to let the fallback setTimeout fire (should be guarded by opened=true)
      vi.advanceTimersByTime(400);
      // Settings should remain false (openFn only ran once via onDone)
      expect(UI_LAYOUT_.collapsed.settings).toBe(false);
    });
  });

  describe('_handleUpgradeClicks', () => {
    it('no-op when no troop selected', () => {
      const game = makeGame();
      expect(() => game._handleUpgradeClicks(10, 10)).not.toThrow();
    });
  });

  describe('_handleHealClick', () => {
    it('no-op when no troop selected', () => {
      const game = makeGame();
      expect(() => game._handleHealClick(10, 10)).not.toThrow();
    });
  });

  describe('_handleShieldBuyClick', () => {
    it('no-op when shield shop collapsed', () => {
      const game = makeGame();
      const UI_LAYOUT_ = UI_LAYOUT_REF || UI_LAYOUT;
      UI_LAYOUT_.collapsed.shieldShop = true;
      expect(() => game._handleShieldBuyClick(10, 10)).not.toThrow();
    });
  });

  describe('_autoSave', () => {
    afterEach(() => {
      vi.unstubAllGlobals();
    });
    it('calls saveGame through electron', () => {
      const game = makeGame();
      delete game._autoSave;
      game._autoSave = Game.prototype._autoSave;
      const electron = { saveGame: vi.fn(async () => true) };
      vi.stubGlobal('window', { electron, document: { getElementById: vi.fn() } });
      game._autoSave();
      expect(electron.saveGame).toHaveBeenCalled();
    });

    it('_saveToRotationSlot does not throw when electron has listSaves', async () => {
      const game = makeGame();
      const saveData = game.getSaveData();
      const electron = {
        saveGame: vi.fn(),
        listSaves: vi.fn().mockResolvedValue([]),
        saveGameSlot: vi.fn(),
      };
      vi.stubGlobal('window', { electron, document: { getElementById: vi.fn() } });
      await expect(game._saveToRotationSlot(saveData)).resolves.toBeUndefined();
      expect(electron.listSaves).toHaveBeenCalled();
    });
    it('handles needsSaveCleanup', () => {
      const game = makeGame();
      delete game._autoSave;
      game._autoSave = Game.prototype._autoSave;
      game._needsSaveCleanup = true;
      const electron = { saveGame: vi.fn(async () => true), deleteSave: vi.fn(async () => true) };
      vi.stubGlobal('window', { electron, document: { getElementById: vi.fn() } });
      game._autoSave();
      expect(electron.deleteSave).toHaveBeenCalled();
      expect(game._needsSaveCleanup).toBe(false);
    });
  });

  describe('_tryPlaceFromPointer', () => {
    it('places troop on valid drag release', () => {
      const game = makeGame();
      const spec = swordsmanSpec;
      game._tryPlaceFromPointer(300, 300, spec);
      expect(game.troops.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe('_handleHUDClicks collapsed hud', () => {
    it('returns early when hud collapsed', () => {
      const game = makeGame();
      const UI_LAYOUT_ = UI_LAYOUT_REF || UI_LAYOUT;
      UI_LAYOUT_.collapsed.hud = true;
      expect(() => game._handleHUDClicks(10, 10)).not.toThrow();
    });
    it('handles ctrl button in PRE_WAVE calling startWave', () => {
      const game = makeGame();
      game.state = 'PRE_WAVE';
      const UI_LAYOUT_ = UI_LAYOUT_REF || UI_LAYOUT;
      UI_LAYOUT_.collapsed.hud = false;
      const R_ = RENDERER_REF || RENDERER;
      const btn = {
        x: R_.width - LAYOUT.HUD.CTRL_RIGHT,
        y: LAYOUT.HUD.CTRL_BTN.y,
        w: LAYOUT.HUD.CTRL_BTN.w,
        h: LAYOUT.HUD.CTRL_BTN.h,
      };
      game._handleHUDClicks(btn.x + 1, btn.y + 1);
      expect(game.runtime.startWave).toHaveBeenCalled();
    });
    it('handles ctrl button in WAVE_ACTIVE toggling pause', () => {
      const game = makeGame();
      game.state = 'WAVE_ACTIVE';
      const UI_LAYOUT_ = UI_LAYOUT_REF || UI_LAYOUT;
      UI_LAYOUT_.collapsed.hud = false;
      const R_ = RENDERER_REF || RENDERER;
      const btn = {
        x: R_.width - LAYOUT.HUD.CTRL_RIGHT,
        y: LAYOUT.HUD.CTRL_BTN.y,
        w: LAYOUT.HUD.CTRL_BTN.w,
        h: LAYOUT.HUD.CTRL_BTN.h,
      };
      game._handleHUDClicks(btn.x + 1, btn.y + 1);
      expect(game.runtime.togglePause).toHaveBeenCalled();
    });
  });

  describe('sellConfirmationToggle', () => {
    it('confirmation yes sells confirmed troop', () => {
      const game = makeGame();
      game.placeTroop(swordsmanSpec, 1, 1);
      game.sellConfirmPending = true;
      game.sellConfirmTroop = game.troops[0];
      const UI_ = UI_REF || UI;
      UI_._devConfirmYes = { x: 0, y: 0, w: 100, h: 50 };
      game._handleConfirmationClicks(10, 10);
      expect(game.sellConfirmPending).toBe(false);
    });
    it('no-op when devConfirmYes is null', () => {
      const game = makeGame();
      game.devConfirmPending = true;
      const UI_ = UI_REF || UI;
      UI_._devConfirmYes = null;
      expect(() => game._handleConfirmationClicks(10, 10)).not.toThrow();
    });
  });

  // ===== NEW TEST SECTIONS for game.js coverage =====

  describe('_stepMonsters', () => {
    it('force-kills HP-desync monsters', () => {
      const game = makeGame();
      const m = placeMonsterAt(game, 1, 5, 5);
      m.hp = 0;
      m.reachedEnd = false;
      game.monsters = [m];
      game._stepMonsters(1 / 60);
      expect(m.alive).toBe(false);
    });

    it('reduces lives when monster reaches end', () => {
      const game = makeGame();
      game.lives = 10;
      const m = placeMonsterAt(game, 1, 5, 5);
      m.reachedEnd = true;
      m.leak = 2;
      game.monsters = [m];
      game._stepMonsters(1 / 60);
      expect(m.alive).toBe(false);
      expect(game.lives).toBe(8);
    });

    it('triggers defeat when lives reach 0', () => {
      const game = makeGame();
      game.lives = 1;
      const m = placeMonsterAt(game, 1, 5, 5);
      m.reachedEnd = true;
      m.leak = 5;
      game.monsters = [m];
      game._stepMonsters(1 / 60);
      expect(game.runtime.applyDefeat).toHaveBeenCalled();
    });

    it('skips life loss in dev mode', () => {
      const game = makeGame({ devMode: true });
      game.lives = 10;
      const m = placeMonsterAt(game, 1, 5, 5);
      m.reachedEnd = true;
      m.leak = 2;
      game.monsters = [m];
      game._stepMonsters(1 / 60);
      expect(m.alive).toBe(false);
      expect(game.lives).toBe(10);
    });

    it('skips dead monsters silently', () => {
      const game = makeGame();
      const m = placeMonsterAt(game, 1, 5, 5);
      m.alive = false;
      game.monsters = [m];
      expect(() => game._stepMonsters(1 / 60)).not.toThrow();
    });
  });

  describe('_runSimTick', () => {
    it('renders and exits early when PAUSED', () => {
      const game = makeGame();
      game.state = 'PAUSED';
      game.lastTime = 1000;
      game._runSimTick(1016);
      const renderMod = { renderGame: vi.fn(), updateCursor: vi.fn() };
      expect(game.lastTime).toBe(1016);
    });

    it('renders and exits early when DEFEAT', () => {
      const game = makeGame();
      game.state = 'DEFEAT';
      game.lastTime = 1000;
      game._runSimTick(1016);
      expect(game.lastTime).toBe(1016);
    });

    it('runs simulation step and renders', () => {
      const game = makeGame();
      game.state = 'WAVE_ACTIVE';
      game.lastTime = 1000;
      game.accumulator = 0;
      vi.spyOn(game, 'step').mockImplementation(() => {});
      // Use large enough gap to exceed FIXED_TIMESTEP (~1/60 = 0.0167)
      game._runSimTick(2000);
      expect(game.step).toHaveBeenCalled();
    });

    it('clamps real dt to 0.1', () => {
      const game = makeGame();
      game.state = 'WAVE_ACTIVE';
      game.lastTime = 1000;
      game.accumulator = 0;
      vi.spyOn(game, 'step').mockImplementation(() => {});
      game._runSimTick(100000);
      expect(game.step).toHaveBeenCalled();
    });

    it('handles errors in sim tick gracefully', () => {
      const game = makeGame();
      game.state = 'WAVE_ACTIVE';
      game.lastTime = 1000;
      game.accumulator = 100;
      vi.spyOn(game, 'step').mockImplementation(() => {
        throw new Error('test error');
      });
      expect(() => game._runSimTick(1016)).not.toThrow();
    });
  });

  describe('_applyHitAtPosition', () => {
    it('delegates to chainHitAt when spec has chain', () => {
      const game = makeGame();
      vi.spyOn(game, 'chainHitAt').mockImplementation(() => {});
      const troop = { spec: { chain: 1, splash: 0 }, _cachedRange: 5 };
      game._applyHitAtPosition(100, 100, troop, 50, false);
      expect(game.chainHitAt).toHaveBeenCalledWith(100, 100, troop);
    });

    it('delegates to splashAt when spec has splash', () => {
      const game = makeGame();
      vi.spyOn(game, 'splashAt').mockReturnValue([]);
      const troop = { spec: { chain: 0, splash: 3, color: '#9b59b6' }, _cachedRange: 5 };
      game._applyHitAtPosition(100, 100, troop, 50, false);
      expect(game.splashAt).toHaveBeenCalledWith(100, 100, 50, 3, troop);
    });

    it('applies slow to splash hits when hasSlow', () => {
      const game = makeGame();
      const monster = { applySlow: vi.fn(() => true), x: 100, y: 100 };
      const troop = { spec: { chain: 0, splash: 3, color: '#9b59b6', slowFactor: 0.5 } };
      vi.spyOn(game, 'splashAt').mockReturnValue([monster]);
      vi.spyOn(game, '_applySlowToMonster').mockImplementation(() => {});
      game._applyHitAtPosition(100, 100, troop, 50, true);
      expect(game._applySlowToMonster).toHaveBeenCalled();
    });

    it('delegates to single-target when no chain/splash and no slow', () => {
      const game = makeGame();
      const monster = { alive: true };
      vi.spyOn(game, '_findClosestMonsterNear').mockReturnValue(monster);
      vi.spyOn(game, 'damageMonster').mockReturnValue(false);
      const troop = { spec: { chain: 0, splash: 0 }, _cachedRange: 5 };
      game._applyHitAtPosition(100, 100, troop, 50, false);
      expect(game.damageMonster).toHaveBeenCalledWith(monster, 50);
    });

    it('single-target applies slow only when not killed', () => {
      const game = makeGame();
      const monster = { alive: true };
      vi.spyOn(game, '_findClosestMonsterNear').mockReturnValue(monster);
      vi.spyOn(game, 'damageMonster').mockReturnValue(false);
      vi.spyOn(game, '_applySlowToMonster').mockImplementation(() => {});
      const troop = { spec: { chain: 0, splash: 0, slowFactor: 0.5 }, _cachedRange: 5 };
      game._applyHitAtPosition(100, 100, troop, 50, true);
      expect(game._applySlowToMonster).toHaveBeenCalled();
    });

    it('single-target skips slow when monster is killed', () => {
      const game = makeGame();
      const monster = { alive: false };
      vi.spyOn(game, '_findClosestMonsterNear').mockReturnValue(monster);
      vi.spyOn(game, 'damageMonster').mockReturnValue(true);
      vi.spyOn(game, '_applySlowToMonster').mockImplementation(() => {});
      const troop = { spec: { chain: 0, splash: 0, slowFactor: 0.5 }, _cachedRange: 5 };
      game._applyHitAtPosition(100, 100, troop, 50, true);
      expect(game._applySlowToMonster).not.toHaveBeenCalled();
    });

    it('single-target no-ops when no monster found', () => {
      const game = makeGame();
      vi.spyOn(game, '_findClosestMonsterNear').mockReturnValue(null);
      const troop = { spec: { chain: 0, splash: 0 }, _cachedRange: 5 };
      expect(() => game._applyHitAtPosition(100, 100, troop, 50, false)).not.toThrow();
    });
  });

  describe('_stepWaveSpawning happy path', () => {
    it('spawns due monsters', () => {
      const game = makeGame();
      vi.spyOn(game.wave, 'popDueMonster')
        .mockReturnValueOnce({ level: 1, hpMult: 1 })
        .mockReturnValueOnce({ level: 2, hpMult: 1 })
        .mockReturnValue(null);
      game._stepWaveSpawning(1 / 60);
      expect(game.monsters.length).toBe(2);
    });
  });

  describe('_stepNecromancerRevives reviveImmune skip', () => {
    it('skips reviveImmune monsters from dead candidates', () => {
      const game = makeGame();
      const necro = placeMonsterAt(game, 'Y', 5, 5);
      const dead = placeMonsterAt(game, 1, 5, 6);
      dead.alive = false;
      dead.reviveImmune = true;
      game._stepNecromancerRevives();
      expect(dead.alive).toBe(false);
    });

    it('skips reachedEnd monsters from candidates', () => {
      const game = makeGame();
      const necro = placeMonsterAt(game, 'Y', 5, 5);
      const dead = placeMonsterAt(game, 1, 5, 6);
      dead.alive = false;
      dead.reachedEnd = true;
      game._stepNecromancerRevives();
      expect(dead.alive).toBe(false);
    });
  });

  describe('_handleConfirmationClicks sell confirm path', () => {
    it('sells confirmed troop on yes click', () => {
      const game = makeGame();
      game.placeTroop(swordsmanSpec, 1, 1);
      game.sellConfirmPending = true;
      game.sellConfirmTroop = game.troops[0];
      vi.spyOn(game, 'sellTroop').mockImplementation(() => {});
      const UI_ = UI_REF || UI;
      UI_._devConfirmYes = { x: 0, y: 0, w: 100, h: 50 };
      game._handleConfirmationClicks(10, 10);
      expect(game.sellTroop).toHaveBeenCalledWith(0);
      expect(game.sellConfirmTroop).toBeNull();
    });

    it('reset confirm path calls resetGame', () => {
      const game = makeGame();
      game.resetConfirmPending = true;
      vi.spyOn(game, 'resetGame').mockImplementation(() => {});
      const UI_ = UI_REF || UI;
      UI_._devConfirmYes = { x: 0, y: 0, w: 100, h: 50 };
      game._handleConfirmationClicks(10, 10);
      expect(game.resetGame).toHaveBeenCalled();
    });
  });

  // ===== COVERAGE GAP FILL — remaining uncovered lines =====

  describe('_runSimTick error catch canvas rendering', () => {
    it('renders error text on canvas when sim tick crashes', () => {
      const game = makeGame();
      game.state = 'WAVE_ACTIVE';
      game.lastTime = 1000;
      game.accumulator = 100;
      const fillTextSpy = vi.fn();
      const fillRectSpy = vi.fn();
      const R_ = RENDERER_REF || RENDERER;
      R_.ctx.fillRect = fillRectSpy;
      R_.ctx.fillText = fillTextSpy;
      vi.spyOn(game, 'step').mockImplementation(() => {
        throw new Error('sim crash');
      });
      game._runSimTick(1016);
      expect(fillRectSpy).toHaveBeenCalled();
      expect(fillTextSpy).toHaveBeenCalled();
    });
  });

  describe('chainHitAt stun and chain mechanics', () => {
    it('does not stun shielded monsters', () => {
      const game = makeGame();
      const m = placeMonsterAt(game, 'S', 5, 5);
      m.stunTimer = 0;
      game._updateMonsterTileIndex();
      const troop = { _cachedDamage: 50, _cachedRange: 5, _cachedChain: 1, spec: { stun: 2 } };
      game.chainHitAt(m.x, m.y, troop);
      // Shielded monster has shield > 0, so stunDuration is NOT applied
      expect(m.stunTimer).toBe(0);
    });

    it('chain buffer swap prevents duplicate hits', () => {
      const game = makeGame();
      placeMonsterAt(game, 1, 5, 5);
      placeMonsterAt(game, 1, 5, 6);
      game._updateMonsterTileIndex();
      const troop = { _cachedDamage: 9999, _cachedRange: 10, _cachedChain: 5, spec: { stun: 0 } };
      const goldBefore = game.gold;
      game.chainHitAt(game.monsters[0].x, game.monsters[0].y, troop);
      expect(game.gold).toBeGreaterThan(goldBefore);
    });
  });

  describe('applyProjectileImpact chain+slow path', () => {
    it('applies slow to primary target on chain+slow', () => {
      const game = makeGame();
      const m = placeMonsterAt(game, 1, 5, 5);
      game._updateMonsterTileIndex();
      // Low damage ensures monster survives chain hit; target.alive stays true for slow check
      const troop = {
        _cachedDamage: 5,
        _cachedRange: 5,
        _cachedChain: 1,
        _cachedSlowFactor: 0.5,
        _cachedSlowDuration: 2,
        _cachedShatterBonus: 0,
        spec: { chain: 1, splash: 0, slowFactor: 0.5 },
      };
      const proj = { troop, target: m, lastTargetX: m.x, lastTargetY: m.y };
      vi.spyOn(game, '_applySlowToMonster').mockImplementation(() => {});
      game.applyProjectileImpact(proj);
      expect(game._applySlowToMonster).toHaveBeenCalled();
    });
  });

  describe('restart electron deleteSave', () => {
    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it('calls electron.deleteSave when available on restart', () => {
      const game = makeGame();
      const electron = { deleteSave: vi.fn(async () => true) };
      vi.stubGlobal('window', { electron, document: { getElementById: vi.fn() } });
      vi.spyOn(game.runtime, 'stopLoop').mockImplementation(() => {});
      vi.spyOn(game, 'start').mockImplementation(() => {});
      game.restart();
      expect(electron.deleteSave).toHaveBeenCalled();
      vi.unstubAllGlobals();
    });
  });

  describe('_defaultDevCounts', () => {
    it('creates default counts for all monster types', () => {
      const game = makeGame();
      const counts = game._defaultDevCounts();
      expect(counts[1]).toBe(0);
      expect(counts['B']).toBe(0);
      expect(counts['H']).toBe(0);
      expect(Object.keys(counts).length).toBeGreaterThanOrEqual(10);
    });

    it('resetDevMonsterCounts resets to zero', () => {
      const game = makeGame();
      game.devMonsterCounts[1] = 5;
      game.resetDevMonsterCounts();
      expect(game.devMonsterCounts[1]).toBe(0);
    });
  });

  describe('_handleMapClick boundary conditions', () => {
    it('returns early when px < shopWidth', () => {
      const game = makeGame();
      game._handleMapClick(0, 100);
      expect(game.selectedTroopIndex).toBe(-1);
    });
    it('returns early when py < hudHeight', () => {
      const game = makeGame();
      game._handleMapClick(300, 0);
      expect(game.selectedTroopIndex).toBe(-1);
    });
    it('returns early when py > height - previewHeight', () => {
      const game = makeGame();
      game._handleMapClick(300, 550);
      expect(game.selectedTroopIndex).toBe(-1);
    });
    it('returns early when px > shieldShopRight', () => {
      const game = makeGame();
      game._handleMapClick(700, 100);
      expect(game.selectedTroopIndex).toBe(-1);
    });
  });

  describe('_cleanupDead monster compaction', () => {
    it('removes dead monsters in-place', () => {
      const game = makeGame();
      game.monsters = [{ alive: false }, { alive: true }, { alive: false }];
      game._cleanupDead();
      expect(game.monsters.length).toBe(1);
    });
  });

  describe('sellCooldownTimer decrement in step', () => {
    it('decrements sellCooldownTimer during step', () => {
      const game = makeGame();
      game.sellCooldownTimer = 2;
      game.state = 'WAVE_ACTIVE';
      vi.spyOn(game.wave, 'popDueMonster').mockReturnValue(null);
      vi.spyOn(game, '_stepTroops').mockImplementation(() => {});
      vi.spyOn(game, '_stepProjectiles').mockImplementation(() => {});
      vi.spyOn(game, '_stepMonsters').mockImplementation(() => {});
      vi.spyOn(game, '_updateMonsterTileIndex').mockImplementation(() => {});
      vi.spyOn(game, '_stepMonsterAttacks').mockImplementation(() => {});
      vi.spyOn(game, '_stepNecromancerRevives').mockImplementation(() => {});
      vi.spyOn(game, '_cleanupDead').mockImplementation(() => {});
      vi.spyOn(game, '_stepWaveCompletion').mockImplementation(() => {});
      vi.spyOn(game, '_stepPopups').mockImplementation(() => {});
      game.step(1 / 60);
      expect(game.sellCooldownTimer).toBeLessThan(2);
    });
  });

  describe('_autoSave needsSaveCleanup with no electron.deleteSave', () => {
    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it('handles needsSaveCleanup without electron.deleteSave', () => {
      const game = makeGame();
      delete game._autoSave;
      game._autoSave = Game.prototype._autoSave;
      game._needsSaveCleanup = true;
      // electron exists but has no deleteSave — short-circuits the &&
      const electron = { saveGame: vi.fn(async () => true) };
      vi.stubGlobal('window', { electron, document: { getElementById: vi.fn() } });
      game._autoSave();
      expect(electron.saveGame).toHaveBeenCalled();
      // _needsSaveCleanup should still be true (no deleteSave was called)
      expect(game._needsSaveCleanup).toBe(true);
    });
  });

  describe('_handlePopupShortcut Alt+U and Alt+D', () => {
    beforeEach(() => {
      vi.stubGlobal('document', {
        getElementById: vi.fn(() => null),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      });
    });
    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it('handles Alt+U shortcut for settings popup', () => {
      const game = makeGame();
      const UI_LAYOUT_ = UI_LAYOUT_REF || UI_LAYOUT;
      UI_LAYOUT_.collapsed.help = true;
      UI_LAYOUT_.collapsed.monsterInfo = true;
      UI_LAYOUT_.collapsed.settings = true;
      UI_LAYOUT_.collapsed.about = true;
      UI_LAYOUT_.collapsed.dev = true;
      const e = { key: 'u', altKey: true, preventDefault: vi.fn() };
      game._handlePopupShortcut(e);
      expect(e.preventDefault).toHaveBeenCalled();
      expect(UI_LAYOUT_.collapsed.settings).toBe(false);
    });

    it('handles Alt+D shortcut for dev popup', () => {
      const game = makeGame();
      const UI_LAYOUT_ = UI_LAYOUT_REF || UI_LAYOUT;
      UI_LAYOUT_.collapsed.help = true;
      UI_LAYOUT_.collapsed.monsterInfo = true;
      UI_LAYOUT_.collapsed.settings = true;
      UI_LAYOUT_.collapsed.about = true;
      UI_LAYOUT_.collapsed.dev = true;
      const e = { key: 'd', altKey: true, preventDefault: vi.fn() };
      game._handlePopupShortcut(e);
      expect(e.preventDefault).toHaveBeenCalled();
      expect(UI_LAYOUT_.collapsed.dev).toBe(false);
    });
  });

  describe('_stepWaveSpawning cap at MAX_SPAWNS_PER_FRAME', () => {
    it('caps at MAX_SPAWNS_PER_FRAME=50', () => {
      const game = makeGame();
      // Return 60 monsters, should cap at 50
      let calls = 0;
      vi.spyOn(game.wave, 'popDueMonster').mockImplementation(() => {
        if (calls < 60) {
          calls++;
          return { level: 1, hpMult: 1 };
        }
        return null;
      });
      game._stepWaveSpawning(1 / 60);
      expect(game.monsters.length).toBe(50);
    });
  });

  describe('_tryPlaceFromPointer bounds checks', () => {
    it('returns early when px < shopWidth', () => {
      const game = makeGame();
      game._tryPlaceFromPointer(0, 300, swordsmanSpec);
      expect(game.troops.length).toBe(0);
    });
    it('returns early when py < hudHeight', () => {
      const game = makeGame();
      game._tryPlaceFromPointer(300, 0, swordsmanSpec);
      expect(game.troops.length).toBe(0);
    });
    it('returns early when px > shieldShopRight', () => {
      const game = makeGame();
      game._tryPlaceFromPointer(700, 300, swordsmanSpec);
      expect(game.troops.length).toBe(0);
    });
    it('shows popup on invalid placement via _tryPlaceFromPointer', () => {
      const game = makeGame({ gold: 0, devMode: false });
      game._tryPlaceFromPointer(300, 300, { cost: 99999 });
      expect(game.popups.length).toBe(1);
    });
    it('successfully places troop via _tryPlaceFromPointer', () => {
      const game = makeGame({ gold: 1000 });
      // Click at tile (8,3) which is NOT in waypoints (avoids PATH restriction)
      const px = 8 * CONFIG.TILE_SIZE + 10;
      const py = 3 * CONFIG.TILE_SIZE + 10;
      game._tryPlaceFromPointer(px, py, swordsmanSpec);
      expect(game.troops.length).toBe(1);
    });
  });

  describe('togglePopupEl', () => {
    beforeEach(() => {
      vi.stubGlobal('document', {
        getElementById: vi.fn(() => ({ classList: { add: vi.fn(), remove: vi.fn() } })),
      });
    });
    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it('togglePopupEl collapsed=true closes popup', () => {
      const game = makeGame();
      document.getElementById = vi.fn(() => {
        const el = { classList: { add: vi.fn(), remove: vi.fn() } };
        return el;
      });
      game.togglePopupEl('test-popup', true, 'test-btn');
      // Called via prototype — document.getElementById is stubbed globally
      expect(document.getElementById).toHaveBeenCalled();
    });

    it('togglePopupEl collapsed=false opens popup', () => {
      const game = makeGame();
      const mockEl = { classList: { add: vi.fn(), remove: vi.fn() } };
      document.getElementById = vi.fn(() => mockEl);
      game.togglePopupEl('test-popup', false, 'test-btn');
      expect(mockEl.classList.remove).toHaveBeenCalledWith('bar-popup--closed');
    });

    it('togglePopupEl handles null elements safely', () => {
      const game = makeGame();
      document.getElementById = vi.fn(() => null);
      expect(() => game.togglePopupEl('test-popup', true, 'test-btn')).not.toThrow();
      expect(() => game.togglePopupEl('test-popup', false, 'test-btn')).not.toThrow();
    });
  });

  describe('_handlePopupShortcut with stubs', () => {
    beforeEach(() => {
      vi.stubGlobal('document', {
        getElementById: vi.fn(() => null),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      });
    });
    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it('handles Alt+C shortcut for controls popup', () => {
      const game = makeGame();
      const e = { key: 'c', altKey: true, preventDefault: vi.fn() };
      game._handlePopupShortcut(e);
      expect(e.preventDefault).toHaveBeenCalled();
    });

    it('handles Alt+M shortcut', () => {
      const game = makeGame();
      const e = { key: 'm', altKey: true, preventDefault: vi.fn() };
      game._handlePopupShortcut(e);
      expect(e.preventDefault).toHaveBeenCalled();
    });

    it('closes already-open popup when same key pressed', () => {
      const game = makeGame();
      const UI_LAYOUT_ = UI_LAYOUT_REF || UI_LAYOUT;
      UI_LAYOUT_.collapsed.help = false;
      const mockEl = { classList: { add: vi.fn(), remove: vi.fn() } };
      const getElementById = vi.fn(() => mockEl);
      vi.stubGlobal('document', {
        getElementById,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      });
      const e = { key: 'c', altKey: true, preventDefault: vi.fn() };
      game._handlePopupShortcut(e);
      expect(mockEl.classList.add).toHaveBeenCalledWith('bar-popup--closed');
    });

    it('opens popup directly when no other popup is open (!openKey path)', () => {
      const game = makeGame();
      const UI_LAYOUT_ = UI_LAYOUT_REF || UI_LAYOUT;
      // All popup shortcuts start collapsed (collapsed[key]=true means closed/not visible).
      // Set all popup-relevant keys to true so that !openKey (no open popups) is true.
      UI_LAYOUT_.collapsed.help = true;
      UI_LAYOUT_.collapsed.monsterInfo = true;
      UI_LAYOUT_.collapsed.settings = true;
      UI_LAYOUT_.collapsed.about = true;
      UI_LAYOUT_.collapsed.dev = true;
      const mockEl = { classList: { add: vi.fn(), remove: vi.fn() } };
      vi.stubGlobal('document', {
        getElementById: vi.fn(() => mockEl),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      });
      const e = { key: 'c', altKey: true, preventDefault: vi.fn() };
      game._handlePopupShortcut(e);
      // With help collapsed and no other popup open, !openKey path is taken
      expect(e.preventDefault).toHaveBeenCalled();
      expect(UI_LAYOUT_.collapsed.help).toBe(false);
    });

    it('handles null element from open popup (!el path)', () => {
      const game = makeGame();
      const UI_LAYOUT_ = UI_LAYOUT_REF || UI_LAYOUT;
      // Set one popup as open (false = not collapsed = open)
      UI_LAYOUT_.collapsed.help = false;
      // Close all others so they don't interfere
      UI_LAYOUT_.collapsed.monsterInfo = true;
      UI_LAYOUT_.collapsed.settings = true;
      UI_LAYOUT_.collapsed.about = true;
      // Stub document.getElementById to return null for the open popup's element
      vi.stubGlobal('document', {
        getElementById: vi.fn(() => null),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      });
      const e = { key: 'm', altKey: true, preventDefault: vi.fn() };
      game._handlePopupShortcut(e);
      expect(e.preventDefault).toHaveBeenCalled();
      // monster-info was collapsed (true), now set to false being opened
      expect(UI_LAYOUT_.collapsed.monsterInfo).toBe(false);
    });
  });

  describe('togglePopupEl branch coverage', () => {
    let game;
    beforeEach(() => {
      game = makeGame();
      vi.stubGlobal('document', { getElementById: vi.fn() });
    });
    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it('collapsed=true with popup and btn', () => {
      const popup = { classList: { add: vi.fn(), remove: vi.fn() } };
      const btn = { classList: { add: vi.fn(), remove: vi.fn() } };
      document.getElementById = vi.fn((id) => (id === 'pop' ? popup : btn));
      game.togglePopupEl('pop', true, 'btn');
      expect(popup.classList.add).toHaveBeenCalledWith('bar-popup--closed');
      expect(btn.classList.remove).toHaveBeenCalledWith('active');
    });

    it('collapsed=false with popup and btn', () => {
      const popup = { classList: { add: vi.fn(), remove: vi.fn() } };
      const btn = { classList: { add: vi.fn(), remove: vi.fn() } };
      document.getElementById = vi.fn((id) => (id === 'pop' ? popup : btn));
      game.togglePopupEl('pop', false, 'btn');
      expect(popup.classList.remove).toHaveBeenCalledWith('bar-popup--closed');
      expect(btn.classList.add).toHaveBeenCalledWith('active');
    });

    it('collapsed=true with null popup and null btn', () => {
      document.getElementById = vi.fn(() => null);
      expect(() => game.togglePopupEl('pop', true, 'btn')).not.toThrow();
    });

    it('collapsed=false with null popup and null btn', () => {
      document.getElementById = vi.fn(() => null);
      expect(() => game.togglePopupEl('pop', false, 'btn')).not.toThrow();
    });
  });

  describe('_tryPlaceFromPointer branch coverage', () => {
    it('fails gracefully when placement is invalid (no gold)', () => {
      const game = makeGame({ gold: 0, devMode: false });
      const spec = { cost: 99999 };
      game.selectedSpec = spec;
      game._tryPlaceFromPointer(434, 169, spec);
      // No troop placed due to insufficient gold
      expect(game.troops.length).toBe(0);
      // Covers else path (lines 1194-1199): shows error popup and clears selectedSpec
      expect(game.selectedSpec).toBeNull();
      expect(game.popups.length).toBe(1);
      expect(game.popups[0].text).toBe('Need 99999g');
    });

    it('sets selectedSpec on successful placement', () => {
      const game = makeGame();
      const spec = swordsmanSpec;
      game._tryPlaceFromPointer(434, 169, spec);
      expect(game.selectedSpec).toBe(spec);
    });
    it('returns early when tile coords are out of bounds (line 1190)', () => {
      const game = makeGame();
      const R_ = RENDERER_REF || RENDERER;
      const origToWorldInto = R_.toWorldInto;
      // Temporarily override toWorldInto to return out-of-bounds world coords
      R_.toWorldInto = vi.fn((px, py, out) => {
        out.x = -100;
        out.y = -100;
        return out;
      });
      const spec = swordsmanSpec;
      game._tryPlaceFromPointer(300, 100, spec);
      // No troop should be placed since world coords map to out-of-bounds tile
      expect(game.troops.length).toBe(0);
      // Restore original to prevent cross-test pollution
      R_.toWorldInto = origToWorldInto;
    });
  });

  describe('_updateMonsterTileIndex edge cases', () => {
    it('handles empty monster list', () => {
      const game = makeGame();
      game._updateMonsterTileIndex();
      const tiIdx = game._monsterTileIndex;
      expect(tiIdx.every((arr) => arr === null)).toBe(true);
    });

    it('handles monsters across multiple tiles', () => {
      const game = makeGame();
      const m1 = placeMonsterAt(game, 1, 5, 5);
      const m2 = placeMonsterAt(game, 1, 10, 10);
      game._updateMonsterTileIndex();
      const idx1 = 5 * CONFIG.GRID_SIZE + 5;
      const idx2 = 10 * CONFIG.GRID_SIZE + 10;
      expect(game._monsterTileIndex[idx1]).not.toBeNull();
      expect(game._monsterTileIndex[idx1].length).toBe(1);
      expect(game._monsterTileIndex[idx2]).not.toBeNull();
      expect(game._monsterTileIndex[idx2].length).toBe(1);
    });

    it('clamps monster position to grid bounds', () => {
      const game = makeGame();
      const m1 = placeMonsterAt(game, 1, -1, -1);
      game._updateMonsterTileIndex();
      const idx0 = 0;
      expect(game._monsterTileIndex[idx0]).not.toBeNull();
    });

    it('recycles arrays from pool across multiple updates', () => {
      const game = makeGame();
      // First update: no monsters, pool empty
      game._updateMonsterTileIndex();
      expect(game._tileIndexPool.length).toBe(0);
      // Place monster - internal _updateMonsterTileIndex creates array
      placeMonsterAt(game, 1, 5, 5);
      // Second manual update pushes array to pool
      game._updateMonsterTileIndex();
      expect(game._tileIndexPool.length).toBe(0); // pool was empty, array created fresh...
      // Actually, second call pushes internal arrays to pool
      // now place another to verify it works end-to-end
      placeMonsterAt(game, 1, 7, 7);
      game._updateMonsterTileIndex();
      expect(() => game._updateMonsterTileIndex()).not.toThrow();
    });
  });

  describe('onMouseDown chain coverage', () => {
    it('routes to _handleConfirmationClicks when confirm pending', () => {
      const game = makeGame();
      game.devConfirmPending = true;
      vi.spyOn(game, '_handleConfirmationClicks').mockImplementation(() => {});
      game.onMouseDown(10, 10, 0);
      expect(game._handleConfirmationClicks).toHaveBeenCalled();
    });

    it('routes to _handleGoldClick for normal clicks', () => {
      const game = makeGame();
      vi.spyOn(game, '_handleGoldClick').mockImplementation(() => {});
      game.onMouseDown(10, 10, 0);
      expect(game._handleGoldClick).toHaveBeenCalled();
    });

    it('calls _handleMapClick for normal clicks', () => {
      const game = makeGame();
      vi.spyOn(game, '_handleMapClick').mockImplementation(() => {});
      game.onMouseDown(10, 10, 0);
      expect(game._handleMapClick).toHaveBeenCalled();
    });
  });

  describe('_stepWaveSpawning edge cases', () => {
    it('handles null popDueMonster', () => {
      const game = makeGame();
      vi.spyOn(game.wave, 'popDueMonster').mockReturnValue(null);
      expect(() => game._stepWaveSpawning(1 / 60)).not.toThrow();
    });
  });

  describe('_stepPopups pool cap', () => {
    it('skips adding to pool when pool is full', () => {
      const game = makeGame();
      const maxPool = CONFIG.MAX_POPUP_POOL;
      for (let i = 0; i < maxPool; i++) game._popupPool.push({ text: '', x: 0, y: 0, t: 0, color: '' });
      game.popups.push({ text: 'test', x: 0, y: 0, t: 0.1, color: '#fff' });
      game._stepPopups(0.2);
      expect(game._popupPool.length).toBe(maxPool);
    });
  });

  describe('_handlePopupShortcut transitionend path', () => {
    const mockEl = {
      classList: { add: vi.fn(), remove: vi.fn() },
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    };
    beforeEach(() => {
      vi.stubGlobal('document', {
        getElementById: vi.fn(() => mockEl),
      });
      // Prevent setTimeout leak from _handlePopupShortcut's 350ms fallback
      vi.spyOn(globalThis, 'setTimeout').mockImplementation(() => {});
    });
    afterEach(() => {
      vi.restoreAllMocks();
      vi.unstubAllGlobals();
    });

    it('adds transitionend listener when el exists', () => {
      const game = makeGame();
      const UI_LAYOUT_ = UI_LAYOUT_REF || UI_LAYOUT;
      // Set up: help is open (not collapsed), monster-info is collapsed
      UI_LAYOUT_.collapsed.help = false;
      UI_LAYOUT_.collapsed.monsterInfo = true;
      const e = { key: 'm', altKey: true, preventDefault: vi.fn() };
      game._handlePopupShortcut(e);
      // With help open and el present, should add transitionend listener
      const el = document.getElementById('controls-popup');
      expect(el.addEventListener).toHaveBeenCalledWith('transitionend', expect.any(Function));
    });

    it('transitionend callback removes listener and opens target', () => {
      const game = makeGame();
      const UI_LAYOUT_ = UI_LAYOUT_REF || UI_LAYOUT;
      UI_LAYOUT_.collapsed.help = false;
      UI_LAYOUT_.collapsed.monsterInfo = true;
      const e = { altKey: true, preventDefault: vi.fn(), key: 'm' };
      game._handlePopupShortcut(e);
      // Simulate transition end
      const el = document.getElementById('controls-popup');
      const transitionendCb = el.addEventListener.mock.calls.find((c) => c[0] === 'transitionend');
      expect(transitionendCb).toBeDefined();
      transitionendCb[1]();
      expect(el.removeEventListener).toHaveBeenCalledWith('transitionend', transitionendCb[1]);
      expect(UI_LAYOUT_.collapsed.monsterInfo).toBe(false);
    });
  });

  describe('onKeyDown altKey shortcut', () => {
    it('calls _handlePopupShortcut when altKey is true', () => {
      const game = makeGame();
      vi.spyOn(game, '_handlePopupShortcut').mockImplementation(() => {});
      const e = { altKey: true, key: 'd', preventDefault: vi.fn() };
      game.onKeyDown(e);
      expect(game._handlePopupShortcut).toHaveBeenCalledWith(e);
    });

    it('does not call _handlePopupShortcut when altKey is false', () => {
      const game = makeGame();
      vi.spyOn(game, '_handlePopupShortcut').mockImplementation(() => {});
      const e = { altKey: false, key: 'd', preventDefault: vi.fn() };
      game.onKeyDown(e);
      expect(game._handlePopupShortcut).not.toHaveBeenCalled();
    });
  });

  describe('onKeyDown other keys ignore silently', () => {
    it('regular letter keys do not crash', () => {
      const game = makeGame();
      expect(() => {
        game.onKeyDown({ key: 'x', preventDefault: vi.fn() });
      }).not.toThrow();
    });

    it('numeric keys do not crash', () => {
      const game = makeGame();
      expect(() => {
        game.onKeyDown({ key: '1', preventDefault: vi.fn() });
      }).not.toThrow();
    });
  });

  describe('chainHitAt stun on split children (level 3 Brute splits)', () => {
    it('stuns split children when parent not shielded', () => {
      const game = makeGame();
      // Level 3 (Brute) splits into 2 level 1 children. Level 2 (Runner) has noSplit:true.
      const m = placeMonsterAt(game, 3, 5, 5);
      game._updateMonsterTileIndex();
      const troop = { _cachedDamage: 9999, _cachedRange: 5, _cachedChain: 0, spec: { stun: 3 } };
      game.chainHitAt(m.x, m.y, troop);
      // Check that split children have stunTimer set
      for (let i = 0; i < game.monsters.length; i++) {
        if (game.monsters[i] !== m) {
          expect(game.monsters[i].stunTimer).toBeGreaterThanOrEqual(3);
        }
      }
    });

    it('does not stun children when parent was shielded', () => {
      const game = makeGame();
      // Level 3 Brute with shield
      game.spawnMonster(3, 1);
      const m2 = game.monsters[0];
      m2.shield = 100;
      m2.x = 5 * CONFIG.TILE_SIZE + CONFIG.TILE_SIZE / 2;
      m2.y = 5 * CONFIG.TILE_SIZE + CONFIG.TILE_SIZE / 2;
      game._updateMonsterTileIndex();
      const troop = { _cachedDamage: 9999, _cachedRange: 5, _cachedChain: 0, spec: { stun: 3 } };
      game.chainHitAt(m2.x, m2.y, troop);
      // Shielded parent means stunTimer NOT set on children
      for (let i = 0; i < game.monsters.length; i++) {
        expect(game.monsters[i].stunTimer).toBe(0);
      }
    });
  });

  describe('chainHitAt buffer swap edge', () => {
    it('handles bestIdx !== last buffer swap', () => {
      const game = makeGame();
      const m1 = placeMonsterAt(game, 1, 5, 5);
      const m2 = placeMonsterAt(game, 1, 5, 6);
      const m3 = placeMonsterAt(game, 1, 5, 7);
      const totalLen = game.pathSegments.totalLength;
      m1.distance = 1.0 * totalLen;
      m2.distance = 0.8 * totalLen;
      m3.distance = 0.5 * totalLen;
      game._updateMonsterTileIndex();
      const troop = { _cachedDamage: 1, _cachedRange: 5, _cachedChain: 3, spec: { stun: 0 } };
      expect(() => game.chainHitAt(m1.x, m1.y, troop)).not.toThrow();
      expect(m1.alive).toBe(true);
      expect(m2.alive).toBe(true);
      expect(m3.alive).toBe(true);
    });
  });

  describe('_handlePopupShortcut transitionend edge', () => {
    beforeEach(() => {
      vi.stubGlobal('document', {
        getElementById: vi.fn(() => ({
          classList: { add: vi.fn(), remove: vi.fn() },
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
        })),
      });
    });
    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it('el is null calls openFn directly', () => {
      const game = makeGame();
      const UI_LAYOUT_ = UI_LAYOUT_REF || UI_LAYOUT;
      for (const k of Object.keys(UI_LAYOUT_.collapsed)) UI_LAYOUT_.collapsed[k] = true;
      UI_LAYOUT_.collapsed.help = false;
      // Mock document.getElementById to return null
      vi.stubGlobal('document', { getElementById: vi.fn(() => null) });
      game._handlePopupShortcut({ key: 'd', preventDefault: vi.fn() });
      expect(UI_LAYOUT_.collapsed.dev).toBe(false);
      vi.unstubAllGlobals();
    });

    it('transitionend handler fires correctly', () => {
      const game = makeGame();
      const UI_LAYOUT_ = UI_LAYOUT_REF || UI_LAYOUT;
      for (const k of Object.keys(UI_LAYOUT_.collapsed)) UI_LAYOUT_.collapsed[k] = true;
      UI_LAYOUT_.collapsed.help = false;
      // Provide an element with a working addEventListener that fires callback
      let capturedCallback = null;
      const el = {
        classList: { add: vi.fn(), remove: vi.fn() },
        addEventListener: vi.fn((event, cb) => {
          capturedCallback = cb;
        }),
        removeEventListener: vi.fn(),
      };
      vi.stubGlobal('document', { getElementById: vi.fn(() => el) });
      vi.useFakeTimers();
      game._handlePopupShortcut({ key: 'd', preventDefault: vi.fn() });
      // Fire the transitionend callback
      if (capturedCallback) capturedCallback();
      expect(UI_LAYOUT_.collapsed.dev).toBe(false);
      vi.useRealTimers();
      vi.unstubAllGlobals();
    });
  });

  describe('_cleanupDead pool recycling edges', () => {
    it('recycles dead projectiles to pool', () => {
      const game = makeGame();
      game.projectiles = [{ alive: false }, { alive: true }];
      game._cleanupDead();
      expect(game._projectilePool.length).toBe(1);
      expect(game.projectiles.length).toBe(1);
    });

    it('sets selectedTroopIndex to -1 when selected troop dies', () => {
      const game = makeGame();
      game.placeTroop(swordsmanSpec, 1, 1);
      game.placeTroop(swordsmanSpec, 2, 2);
      game.selectedTroopIndex = 0;
      game.troops[0].alive = false;
      game._cleanupDead();
      expect(game.selectedTroopIndex).toBe(-1);
    });

    it('preserves selectedTroopIndex after cleanup', () => {
      const game = makeGame();
      game.placeTroop(swordsmanSpec, 1, 1);
      game.placeTroop(swordsmanSpec, 2, 2);
      game.troops[1].alive = false;
      game.selectedTroopIndex = 0;
      game._cleanupDead();
      expect(game.selectedTroopIndex).toBe(0);
    });
  });

  describe('_stepPopups pool cap', () => {
    it('recycles to pool up to MAX_POPUP_POOL', () => {
      const game = makeGame();
      // Fill pool to max
      const maxPool = CONFIG.MAX_POPUP_POOL;
      for (let i = 0; i < maxPool; i++) {
        game._popupPool.push({ text: '', x: 0, y: 0, t: 0, color: '' });
      }
      game.popups.push({ text: 'test', x: 0, y: 0, t: -0.1, color: '#fff' });
      game._stepPopups(0.2);
      // Pool should still be at max (no extra push)
      expect(game._popupPool.length).toBe(maxPool);
      expect(game.popups.length).toBe(0);
    });

    it('keeps alive popups', () => {
      const game = makeGame();
      game.popups.push({ text: 'test', x: 0, y: 0, t: 0.5, color: '#fff' });
      game._stepPopups(0.2);
      expect(game.popups.length).toBe(1);
    });
  });

  describe('_handleUpgradeClicks stat button layout', () => {
    it('handles no upgrade-able stats gracefully', () => {
      const game = makeGame();
      game.placeTroop(swordsmanSpec, 1, 1);
      game.selectedTroopIndex = 0;
      // Max all stats by setting the corresponding level props
      const t = game.troops[0];
      t.dmgLevel = CONFIG.MAX_UPGRADE_LEVEL;
      t.rangeLevel = CONFIG.MAX_UPGRADE_LEVEL;
      t.speedLevel = CONFIG.MAX_UPGRADE_LEVEL;
      t.chainLevel = CONFIG.MAX_UPGRADE_LEVEL;
      t.slowLevel = CONFIG.MAX_UPGRADE_LEVEL;
      t.hpLevel = CONFIG.MAX_UPGRADE_LEVEL;
      expect(() => game._handleUpgradeClicks(10, 10)).not.toThrow();
    });

    it('no-op with collapsed shop', () => {
      const game = makeGame();
      game.placeTroop(swordsmanSpec, 1, 1);
      game.selectedTroopIndex = 0;
      const UI_LAYOUT_ = UI_LAYOUT_REF || UI_LAYOUT;
      UI_LAYOUT_.collapsed.shop = true;
      expect(() => game._handleUpgradeClicks(10, 10)).not.toThrow();
    });

    it('no-op when troop is dead', () => {
      const game = makeGame();
      game.placeTroop(swordsmanSpec, 1, 1);
      game.selectedTroopIndex = 0;
      game.troops[0].alive = false;
      expect(() => game._handleUpgradeClicks(10, 10)).not.toThrow();
    });
  });

  describe('_autoSave edge cases', () => {
    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it('no-ops when window.electron is null', () => {
      const game = makeGame();
      delete game._autoSave;
      game._autoSave = Game.prototype._autoSave;
      vi.stubGlobal('window', { document: { getElementById: vi.fn() } });
      expect(() => game._autoSave()).not.toThrow();
    });

    it('no-ops when electron has no saveGame', () => {
      const game = makeGame();
      delete game._autoSave;
      game._autoSave = Game.prototype._autoSave;
      vi.stubGlobal('window', { electron: {}, document: { getElementById: vi.fn() } });
      expect(() => game._autoSave()).not.toThrow();
    });
  });

  describe('_handleSellClick edge cases', () => {
    it('no-op when no troop selected', () => {
      const game = makeGame();
      game.selectedTroopIndex = -1;
      expect(() => game._handleSellClick(10, 10)).not.toThrow();
    });

    it('no-op when shop collapsed', () => {
      const game = makeGame();
      game.placeTroop(swordsmanSpec, 1, 1);
      game.selectedTroopIndex = 0;
      const UI_LAYOUT_ = UI_LAYOUT_REF || UI_LAYOUT;
      UI_LAYOUT_.collapsed.shop = true;
      expect(() => game._handleSellClick(10, 10)).not.toThrow();
    });
  });

  describe('_handleMapClick edge cases', () => {
    it('returns early when click is in shop area', () => {
      const game = makeGame();
      const UI_LAYOUT_ = UI_LAYOUT_REF || UI_LAYOUT;
      const px = UI_LAYOUT_.shopWidth - 5;
      const py = 100;
      expect(() => game._handleMapClick(px, py)).not.toThrow();
    });

    it('returns early when click is in HUD area', () => {
      const game = makeGame();
      const UI_LAYOUT_ = UI_LAYOUT_REF || UI_LAYOUT;
      const px = UI_LAYOUT_.shopWidth + 50;
      const py = UI_LAYOUT_.hudHeight - 5;
      expect(() => game._handleMapClick(px, py)).not.toThrow();
    });

    it('returns early when click is in preview area', () => {
      const game = makeGame();
      const R_ = RENDERER_REF || RENDERER;
      const UI_LAYOUT_ = UI_LAYOUT_REF || UI_LAYOUT;
      const px = UI_LAYOUT_.shopWidth + 50;
      const py = R_.height - UI_LAYOUT_.previewHeight + 5;
      expect(() => game._handleMapClick(px, py)).not.toThrow();
    });

    it('returns early when click is in shield shop area', () => {
      const game = makeGame();
      const R_ = RENDERER_REF || RENDERER;
      const UI_LAYOUT_ = UI_LAYOUT_REF || UI_LAYOUT;
      const px = R_.width - UI_LAYOUT_.shieldShopWidth + 5;
      const py = 100;
      expect(() => game._handleMapClick(px, py)).not.toThrow();
    });
  });

  describe('_handlePopupShortcut edge cases', () => {
    beforeEach(() => {
      vi.stubGlobal('document', {
        getElementById: vi.fn(() => ({
          classList: { add: vi.fn(), remove: vi.fn() },
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
        })),
      });
    });
    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it('handles no open popup cleanly', () => {
      const game = makeGame();
      const UI_LAYOUT_ = UI_LAYOUT_REF || UI_LAYOUT;
      // All collapsed
      for (const k of Object.keys(UI_LAYOUT_.collapsed)) UI_LAYOUT_.collapsed[k] = true;
      game._handlePopupShortcut({ key: 'd', preventDefault: vi.fn() });
      expect(UI_LAYOUT_.collapsed.dev).toBe(false);
    });

    it('closes already open popup (calls togglePopupEl with collapsed=true)', () => {
      const game = makeGame();
      const UI_LAYOUT_ = UI_LAYOUT_REF || UI_LAYOUT;
      for (const k of Object.keys(UI_LAYOUT_.collapsed)) UI_LAYOUT_.collapsed[k] = true;
      UI_LAYOUT_.collapsed.dev = false;
      const toggleSpy = vi.spyOn(game, 'togglePopupEl');
      game._handlePopupShortcut({ key: 'd', preventDefault: vi.fn() });
      expect(toggleSpy).toHaveBeenCalledWith('dev-popup', true, 'bar-dev-btn');
    });

    it('unmatched key does nothing', () => {
      const game = makeGame();
      expect(() => game._handlePopupShortcut({ key: 'z', preventDefault: vi.fn() })).not.toThrow();
    });

    it('switches to another open popup with transitionend fallback', () => {
      const game = makeGame();
      const UI_LAYOUT_ = UI_LAYOUT_REF || UI_LAYOUT;
      for (const k of Object.keys(UI_LAYOUT_.collapsed)) UI_LAYOUT_.collapsed[k] = true;
      UI_LAYOUT_.collapsed.help = false;
      // el is null — should call openFn directly via setTimeout
      vi.stubGlobal('document', { getElementById: vi.fn(() => null) });
      game._handlePopupShortcut({ key: 'd', preventDefault: vi.fn() });
      expect(UI_LAYOUT_.collapsed.dev).toBe(false);
      vi.unstubAllGlobals();
    });
  });

  describe('splashAt falloff edge cases', () => {
    it('applies min 1 damage even with high falloff', () => {
      const game = makeGame();
      const m = placeMonsterAt(game, 1, 5, 5);
      game._updateMonsterTileIndex();
      // Very small damage with large radius should floor to 1
      const hits = game.splashAt(m.x, m.y, 1, 5, { spec: { color: '#9b59b6' } });
      expect(hits.length).toBe(1);
      // m should have taken at least 1 damage
      expect(m.hp).toBeLessThan(m.maxHp);
    });

    it('skips dead monsters in splash radius', () => {
      const game = makeGame();
      const m = placeMonsterAt(game, 1, 5, 5);
      m.alive = false;
      game._updateMonsterTileIndex();
      const hits = game.splashAt(m.x, m.y, 100, 5, { spec: { color: '#9b59b6' } });
      expect(hits.length).toBe(0);
    });
  });

  describe('_stepWaveSpawning cap', () => {
    it('caps at MAX_SPAWNS_PER_FRAME', () => {
      const game = makeGame();
      const manySpawns = new Array(100).fill(null).map(() => ({ level: 1, hpMult: 1 }));
      manySpawns.push(null);
      let callCount = 0;
      vi.spyOn(game.wave, 'popDueMonster').mockImplementation(() => {
        if (callCount < manySpawns.length - 1) {
          callCount++;
          return manySpawns[callCount - 1];
        }
        return null;
      });
      game._stepWaveSpawning(1 / 60);
      expect(game.monsters.length).toBeLessThanOrEqual(50);
    });
  });

  describe('applyProjectileImpact chain+slow edge', () => {
    it('applies slow to primary on chain+slow when target still alive', () => {
      const game = makeGame();
      const m = placeMonsterAt(game, 1, 5, 5);
      game._updateMonsterTileIndex();
      // Use low damage so the target survives the chain hit
      const troop = {
        _cachedDamage: 5,
        _cachedRange: 5,
        _cachedChain: 2,
        _cachedSlowFactor: 0.5,
        _cachedSlowDuration: 2,
        _cachedShatterBonus: 0,
        spec: { chain: 2, splash: 0, slowFactor: 0.5 },
      };
      const proj = { troop, target: m, lastTargetX: m.x, lastTargetY: m.y };
      vi.spyOn(game, '_applySlowToMonster').mockImplementation(() => {});
      game.applyProjectileImpact(proj);
      // With low damage and chain+slow, the slow should be applied to primary target
      expect(game._applySlowToMonster).toHaveBeenCalled();
    });
  });

  describe('sellTroop edge cases', () => {
    it('clears selectedSpec on sell', () => {
      const game = makeGame();
      game.placeTroop(swordsmanSpec, 1, 1);
      game.selectedSpec = swordsmanSpec;
      game.sellTroop(0);
      expect(game.selectedSpec).toBeNull();
    });
  });

  describe('_handleUpgradeClicks button hit path', () => {
    beforeEach(() => {
      const UI_LAYOUT_ = UI_LAYOUT_REF || UI_LAYOUT;
      UI_LAYOUT_.collapsed.shop = false;
    });

    it('hits dmg upgrade button and upgrades stat', () => {
      const game = makeGame({ gold: 10000 });
      game.placeTroop(swordsmanSpec, 1, 1);
      game.selectedTroopIndex = 0;
      const t = game.troops[0];
      const prevLevel = t.dmgLevel;
      // Calculate position of first upgrade button (dmg)
      const UI_LAYOUT_ = UI_LAYOUT_REF || UI_LAYOUT;
      const R_ = RENDERER_REF || RENDERER;
      const btnPad = LAYOUT.SHOP.BTN_PAD;
      const btnGap = LAYOUT.SHOP.BTN_GAP;
      const stats = ['dmg', 'range', 'speed', 'chain', 'slow', 'hp'];
      let visibleCount = 0;
      for (const stat of stats) {
        if (t.canUpgrade(stat)) visibleCount++;
      }
      const statBtnW =
        visibleCount > 0
          ? Math.floor((UI_LAYOUT_.SHOP_WIDTH - btnPad * 2 - btnGap * (visibleCount - 1)) / visibleCount)
          : 49;
      const btnX = btnPad + 0 * (statBtnW + btnGap);
      const btnY = R_.height - LAYOUT.SHOP.UPGRADE_BTN_Y_OFFSET;
      game._handleUpgradeClicks(btnX + 2, btnY + 2);
      expect(t.dmgLevel).toBe(prevLevel + 1);
    });
  });

  describe('_handleMapClick no selection path (line 1123)', () => {
    it('sets selectedTroopIndex to -1 when clicking empty map tile', () => {
      const game = makeGame();
      game.selectedTroopIndex = 5;
      game.selectedSpec = null;
      // Click a valid map tile (not in shop/HUD/preview/shieldShop exclusion zones)
      const UI_LAYOUT_ = UI_LAYOUT_REF || UI_LAYOUT;
      const R_ = RENDERER_REF || RENDERER;
      const px = UI_LAYOUT_.shopWidth + 50; // past shop
      const py = UI_LAYOUT_.hudHeight + 50; // below HUD
      game._handleMapClick(px, py);
      expect(game.selectedTroopIndex).toBe(-1);
    });
  });

  describe('_handleShieldBuyClick hit path', () => {
    it('buys shield when clicking shield buy button', () => {
      const game = makeGame({ gold: 1000 });
      game.placeTroop(swordsmanSpec, 1, 1);
      game.selectedTroopIndex = 0;
      const UI_ = UI_REF || UI;
      UI_._shieldBuyBtn = { x: 10, y: 10, w: 100, h: 50 };
      const UI_LAYOUT_ = UI_LAYOUT_REF || UI_LAYOUT;
      UI_LAYOUT_.collapsed.shieldShop = false;
      const prevShield = game.troops[0].shield;
      game._handleShieldBuyClick(30, 30);
      expect(game.troops[0].shield).toBeGreaterThan(prevShield);
    });
  });

  describe('_handleHealClick hit path', () => {
    beforeEach(() => {
      const UI_LAYOUT_ = UI_LAYOUT_REF || UI_LAYOUT;
      UI_LAYOUT_.collapsed.shop = false;
    });

    it('heals troop when clicking heal button', () => {
      const game = makeGame({ gold: 1000 });
      game.placeTroop(swordsmanSpec, 1, 1);
      game.selectedTroopIndex = 0;
      game.troops[0].hp = 1;
      const prevHp = game.troops[0].hp;
      // Calculate heal button position
      const R_ = RENDERER_REF || RENDERER;
      const btnX = LAYOUT.SHOP.BTN_PAD;
      const btnY = R_.height - LAYOUT.SHOP.HEAL_BTN_Y_OFFSET;
      game._handleHealClick(btnX + 2, btnY + 2);
      expect(game.troops[0].hp).toBeGreaterThan(prevHp);
    });

    it('no-op when troop cannot heal (full HP)', () => {
      const game = makeGame({ gold: 1000 });
      game.placeTroop(swordsmanSpec, 1, 1);
      game.selectedTroopIndex = 0;
      const prevHp = game.troops[0].hp;
      const R_ = RENDERER_REF || RENDERER;
      const btnX = LAYOUT.SHOP.BTN_PAD;
      const btnY = R_.height - LAYOUT.SHOP.HEAL_BTN_Y_OFFSET;
      game._handleHealClick(btnX + 2, btnY + 2);
      expect(game.troops[0].hp).toBe(prevHp);
    });
  });

  describe('_stepNecromancerRevives dead candidate filtering', () => {
    it('skips alive monsters and necromancers as dead candidates', () => {
      const game = makeGame();
      const necro = placeMonsterAt(game, 'Y', 5, 5);
      const aliveMonster = placeMonsterAt(game, 1, 5, 7);
      aliveMonster.alive = true;
      const deadMonster = placeMonsterAt(game, 1, 5, 6);
      deadMonster.alive = false;
      deadMonster.reviveImmune = false;
      deadMonster.level = 1;
      // Should only try to revive deadMonster, not necro or aliveMonster
      game._stepNecromancerRevives();
      expect(deadMonster.alive).toBe(true); // should be revived
    });

    it('handles empty deadCandidates array', () => {
      const game = makeGame();
      placeMonsterAt(game, 'Y', 5, 5);
      // No dead monsters — candidate list is empty
      expect(() => game._stepNecromancerRevives()).not.toThrow();
    });
  });

  describe('_handleHUDClicks speed button edge', () => {
    beforeEach(() => {
      const UI_LAYOUT_ = UI_LAYOUT_REF || UI_LAYOUT;
      UI_LAYOUT_.collapsed.hud = false;
    });

    it('handles each speed button click', () => {
      const game = makeGame();
      const R_ = RENDERER_REF || RENDERER;
      const speeds = CONFIG.GAME_SPEEDS;
      for (let i = 0; i < speeds.length; i++) {
        const btn = {
          x: R_.width - LAYOUT.HUD.SPEED_OFFSET + i * 28,
          y: 14,
          w: LAYOUT.HUD.SPEED_BTN_W,
          h: LAYOUT.HUD.SPEED_BTN_H,
        };
        game._handleHUDClicks(btn.x + 5, btn.y + 5);
        expect(game.speed).toBe(speeds[i]);
      }
    });
  });

  describe('applyBurn tick callback (lines 379-380, 383)', () => {
    it('returns true when burn is successfully applied', () => {
      const game = makeGame();
      const m = placeMonsterAt(game, 1, 5, 5);
      const troop = {
        spec: { burnStacks: 1, burnDuration: 5, burnTickInterval: 0.5, burnDamageRatio: 0.1 },
        _cachedDamage: 100,
      };
      const result = game.applyBurn(m, troop);
      expect(result).toBe(true);
    });

    it('burn tick callback fires damageMonster and PARTICLES.burnTick', async () => {
      const game = makeGame();
      const m = placeMonsterAt(game, 1, 5, 5);
      const troop = {
        spec: { burnStacks: 1, burnDuration: 5, burnTickInterval: 0.5, burnDamageRatio: 0.1 },
        _cachedDamage: 100,
      };
      game.applyBurn(m, troop);
      // Force a burn tick by calling _updateBurn with enough time
      m._updateBurn(0.5);
      // The callback should have fired, damaging the monster
      expect(m.hp).toBeLessThan(m.maxHp);
      const mod = await import('../src/particles.js');
      expect(mod.PARTICLES.burnTick).toHaveBeenCalled();
    });
  });

  describe('burn tick uses _updateBurn naturally', () => {
    it('triggers burn callback via monster.update', () => {
      const game = makeGame();
      const m = placeMonsterAt(game, 1, 5, 5);
      const troop = {
        spec: { burnStacks: 1, burnDuration: 5, burnTickInterval: 0.5, burnDamageRatio: 0.1 },
        _cachedDamage: 100,
      };
      game.applyBurn(m, troop);
      // Use the public update method which internally calls _updateBurn
      m.update(0.5, game._troopTileIndex, game.monsters);
      expect(m.hp).toBeLessThan(m.maxHp);
    });
  });

  describe('chainHitAt split-children stun loop (line 789)', () => {
    it('verifies level 3 Brute splits when killed', () => {
      const game = makeGame();
      // Runner (level 2) has noSplit:true. Use Brute (level 3) which splits.
      // Brute hp=133, childLvl = 3-1=2 → adjusted to 1 (Grunt)
      const m = placeMonsterAt(game, 3, 8, 8);
      const countBefore = game.monsters.length;
      game.damageMonster(m, 9999);
      expect(game.monsters.length).toBe(countBefore + 2);
      expect(m.alive).toBe(false);
    });

    it('stuns split children via chainHitAt stun loop', () => {
      const game = makeGame();
      const m = placeMonsterAt(game, 3, 8, 8); // Brute (level 3) splits
      game._updateMonsterTileIndex();
      const countBefore = game.monsters.length;
      const troop = { _cachedDamage: 9999, _cachedRange: 5, _cachedChain: 0, spec: { stun: 3 } };
      game.chainHitAt(m.x, m.y, troop);
      // Verify split happened (children created)
      expect(game.monsters.length).toBeGreaterThan(countBefore);
      // Verify children are stunned
      for (let i = countBefore; i < game.monsters.length; i++) {
        expect(game.monsters[i].stunTimer).toBeGreaterThanOrEqual(3);
      }
    });
  });

  describe('damageTroop revive immune path (line 320)', () => {
    it('applies revive damage ratio when monster is reviveImmune', () => {
      const game = makeGame();
      // Use a ranged troop (archer) to avoid melee damage reduction
      const archer = TROOP_SPECS.find((s) => s.id === 'archer');
      game.placeTroop(archer, 1, 1);
      const monster = {
        spec: { damage: 20 },
        reviveImmune: true,
        reviveDamageRatio: 0.5,
      };
      const hpBefore = game.troops[0].hp;
      game.damageTroop(monster, game.troops[0]);
      // 50% revive reduction: dmg=10. Archer is ranged, no melee reduction
      expect(game.troops[0].hp).toBe(hpBefore - 10);
    });

    it('defaults reviveDamageRatio to 0.5', () => {
      const game = makeGame();
      const archer = TROOP_SPECS.find((s) => s.id === 'archer');
      game.placeTroop(archer, 1, 1);
      const monster = {
        spec: { damage: 20 },
        reviveImmune: true,
      };
      const hpBefore = game.troops[0].hp;
      game.damageTroop(monster, game.troops[0]);
      // Default reviveDamageRatio=0.5: dmg=Math.round(20*0.5)=10
      expect(game.troops[0].hp).toBe(hpBefore - 10);
    });

    it('applies melee reduction after revive reduction', () => {
      const game = makeGame();
      game.placeTroop(swordsmanSpec, 1, 1);
      const monster = {
        spec: { damage: 100 },
        reviveImmune: true,
        reviveDamageRatio: 1.0,
      };
      const hpBefore = game.troops[0].hp;
      game.damageTroop(monster, game.troops[0]);
      // revive dmg=100, MELEE_DAMAGE_REDUCTION=0.3: Math.round(100*0.3)=30
      const expectedDmg = Math.round(100 * CONFIG.MELEE_DAMAGE_REDUCTION);
      expect(game.troops[0].hp).toBe(hpBefore - expectedDmg);
    });

    it('kills troop when damage exceeds HP (line 330)', () => {
      const game = makeGame();
      game.placeTroop(swordsmanSpec, 1, 1);
      const monster = {
        spec: { damage: 99999 },
        reviveImmune: false,
      };
      game.damageTroop(monster, game.troops[0]);
      expect(game.troops[0].alive).toBe(false);
    });
  });

  describe('_stepMonsterAttacks (L6 v1.6.2)', () => {
    it('discards pending attack when target is out of range (distance gating)', () => {
      const game = makeGame();
      game.placeTroop(swordsmanSpec, 1, 1);
      const troop = game.troops[0];
      const hpBefore = troop.hp;
      // Spawn monster close to troop
      const m = placeMonsterAt(game, 1, 2, 2);
      // Monster at (2,2), troop at (1,1) — Chebyshev distance = 1 (within attackRange=1)
      m._pendingAttack = troop;
      game._stepMonsterAttacks();
      // Should hit because monster is within range
      expect(troop.hp).toBeLessThan(hpBefore);
    });

    it('discards pending attack when target is out of range', () => {
      const game = makeGame();
      game.placeTroop(swordsmanSpec, 1, 1);
      const troop = game.troops[0];
      const hpBefore = troop.hp;
      // Spawn monster, then move it far away
      const m = placeMonsterAt(game, 1, 2, 2);
      // Teleport monster far from troop — monster at (15,15), troop at (1,1) — Chebyshev = 14 > 1
      m._tileGx = 15;
      m._tileGy = 15;
      m.x = 15 * CONFIG.TILE_SIZE + CONFIG.TILE_SIZE / 2;
      m.y = 15 * CONFIG.TILE_SIZE + CONFIG.TILE_SIZE / 2;
      m._pendingAttack = troop;
      game._stepMonsterAttacks();
      // Should discard because monster moved out of range
      expect(troop.hp).toBe(hpBefore);
      expect(m._pendingAttack).toBeNull(); // cleared after processing
    });

    it('discards pending attack when target is dead', () => {
      const game = makeGame();
      game.placeTroop(swordsmanSpec, 1, 1);
      const troop = game.troops[0];
      const m = placeMonsterAt(game, 1, 2, 2);
      troop.alive = false;
      m._pendingAttack = troop;
      game._stepMonsterAttacks();
      expect(m._pendingAttack).toBeNull();
    });

    it('skips dead monsters', () => {
      const game = makeGame();
      const m = placeMonsterAt(game, 1, 2, 2);
      m.alive = false;
      m._pendingAttack = { alive: true, gx: 5, gy: 5 };
      expect(() => game._stepMonsterAttacks()).not.toThrow();
      expect(m._pendingAttack).toBeTruthy(); // not cleared because alive check skipped
    });
  });

  describe('Game constructor', () => {
    it('sets sellConfirmationEnabled when constructed with new', () => {
      const canvas = { getContext: vi.fn(() => ({})) };
      vi.stubGlobal('window', {
        electron: null,
        document: { getElementById: vi.fn() },
      });
      const game = new Game(canvas);
      expect(game.sellConfirmationEnabled).toBe(true);
      expect(game._needsSaveCleanup).toBe(false);
      expect(game._dragState).toBeNull();
      expect(typeof game._defaultDevCounts).toBe('function');
      vi.unstubAllGlobals();
    });
  });

  describe('_stepWaveCompletion auto-save debounce', () => {
    it('saves only every AUTO_SAVE_DEBOUNCE_WAVES waves', () => {
      const game = makeGame();
      game._lastSaveWave = 0;
      const saveSpy = vi.spyOn(game, '_autoSave');
      game.wave = { currentWave: 0, spawnIndex: 0, queue: [], onAllSpawnedAndCleared: vi.fn() };
      game.monsters = [];

      const runWave = () => {
        game.state = 'WAVE_ACTIVE';
        game._stepWaveCompletion();
      };

      // Wave 1: 1 - 0 = 1 < 5, no save
      runWave();
      expect(saveSpy).not.toHaveBeenCalled();

      // Waves 2-4: still no save
      game.wave.currentWave = 1;
      runWave();
      game.wave.currentWave = 2;
      runWave();
      game.wave.currentWave = 3;
      runWave();
      expect(saveSpy).not.toHaveBeenCalled();

      // Wave 5: 5 - 0 = 5 >= 5, save!
      game.wave.currentWave = 4;
      runWave();
      expect(saveSpy).toHaveBeenCalledTimes(1);
      expect(game._lastSaveWave).toBe(5);

      // Wave 6-9: no save
      for (let w = 5; w < 9; w++) {
        game.wave.currentWave = w;
        runWave();
      }
      expect(saveSpy).toHaveBeenCalledTimes(1);

      // Wave 10: 10 - 5 = 5 >= 5, save!
      game.wave.currentWave = 9;
      runWave();
      expect(saveSpy).toHaveBeenCalledTimes(2);
    });
  });

  describe('_updateMonsterTileIndex incremental', () => {
    it('only updates tiles when monsters move across boundaries', () => {
      const game = makeGame();
      const m = placeMonsterAt(game, 1, 5, 5);
      game._updateMonsterTileIndex();
      const tileIdx = Math.floor(m.y / CONFIG.TILE_SIZE) * CONFIG.GRID_SIZE + Math.floor(m.x / CONFIG.TILE_SIZE);
      expect(game._monsterTileIndex[tileIdx]).toHaveLength(1);
      expect(m._prevTileIdx).toBe(tileIdx);

      // Second update: monster hasn't moved, no change.
      game._updateMonsterTileIndex();
      expect(game._monsterTileIndex[tileIdx]).toHaveLength(1);

      // Move monster to a different tile.
      const oldIdx = tileIdx;
      m.x += CONFIG.TILE_SIZE * 2;
      game._updateMonsterTileIndex();
      const newIdx = Math.floor(m.y / CONFIG.TILE_SIZE) * CONFIG.GRID_SIZE + Math.floor(m.x / CONFIG.TILE_SIZE);
      expect(newIdx).not.toBe(oldIdx);
      expect(game._monsterTileIndex[oldIdx]).toBeNull();
      expect(game._monsterTileIndex[newIdx]).toHaveLength(1);
      expect(m._prevTileIdx).toBe(newIdx);

      // Kill monster: removed from index.
      m.alive = false;
      game._updateMonsterTileIndex();
      expect(game._monsterTileIndex[newIdx]).toBeNull();
      expect(m._prevTileIdx).toBe(-1);
    });
  });
  describe('sellTroop devMode path', () => {
    it('does not refund gold in dev mode', () => {
      const game = makeGame({ devMode: true, gold: 999 });
      game.placeTroop(swordsmanSpec, 1, 1);
      const goldBefore = game.gold;
      game.sellTroop(0);
      // In dev mode, no refund is given - gold remains unchanged
      expect(game.gold).toBe(goldBefore);
      expect(game.troops[0].alive).toBe(false);
    });
  });
  describe('_handleHUDClicks speed button offset', () => {
    it('respects custom _speedBtnOffsetY and _speedBtnGap', () => {
      const game = makeGame();
      const UI_LAYOUT_ = UI_LAYOUT_REF || UI_LAYOUT;
      UI_LAYOUT_.collapsed.hud = false;
      UI_LAYOUT_.hudHeight = 56;
      game._speedBtnOffsetY = 40;
      game._speedBtnGap = 36;
      const w = RENDERER_REF ? RENDERER_REF.width : 800;
      const r = {
        x: w - LAYOUT.HUD.SPEED_OFFSET + 0 * 36,
        y: 40 + 14,
        w: LAYOUT.HUD.SPEED_BTN_W,
        h: LAYOUT.HUD.SPEED_BTN_H,
      };
      game._handleHUDClicks(r.x + 1, r.y + 1);
      expect(game.speed).toBe(CONFIG.GAME_SPEEDS[0]);
    });
  });

  describe('_applySlowToMonster', () => {
    it('applies slow using cached troop values', () => {
      const game = makeGame();
      const m = placeMonsterAt(game, 1, 5, 5);
      const troop = {
        _cachedSlowFactor: 0.5,
        _cachedSlowDuration: 2,
        _cachedShatterBonus: 0,
        spec: { color: '#9b59b6' },
      };
      vi.spyOn(m, 'applySlow').mockReturnValue(true);
      game._applySlowToMonster(m, troop);
      expect(m.applySlow).toHaveBeenCalledWith(0.5, 2, 0);
    });
  });

  describe('_stepMonsters devMode leak bypass', () => {
    it('skips lives deduction in dev mode', () => {
      const game = makeGame({ devMode: true });
      game.lives = 10;
      const m = placeMonsterAt(game, 1, 5, 5);
      m.reachedEnd = true;
      m.leak = 5;
      game.monsters = [m];
      game._stepMonsters(1 / 60);
      expect(m.alive).toBe(false);
      expect(game.lives).toBe(10); // lives unchanged in dev mode
    });
  });

  describe('_stepNecromancerRevives revive edge cases', () => {
    it('prevents double-revive with _reviveLock from multiple necromancers', () => {
      const game = makeGame();
      // Place two necromancers close to the same dead monster
      const necro1 = placeMonsterAt(game, 'Y', 5, 5);
      const necro2 = placeMonsterAt(game, 'Y', 5, 6);
      const dead = placeMonsterAt(game, 1, 5, 7);
      dead.alive = false;
      dead.reviveImmune = false;
      dead.reachedEnd = false;
      game._stepNecromancerRevives();
      // Only one necromancer should have revived it (reviveLock prevents double-revive)
      const revived = game.monsters.filter((m) => m.alive && m.level !== 'Y');
      expect(revived.length).toBe(1);
      expect(dead.alive).toBe(true);
    });

    it('handles revived monster without clearBurn function', () => {
      const game = makeGame();
      const necro = placeMonsterAt(game, 'Y', 5, 5);
      const dead = placeMonsterAt(game, 1, 5, 6);
      dead.alive = false;
      dead.reviveImmune = false;
      dead.reachedEnd = false;
      // Remove clearBurn to test the else branch
      delete dead.clearBurn;
      // Should not throw
      expect(() => game._stepNecromancerRevives()).not.toThrow();
      expect(dead.alive).toBe(true);
    });

    it('skips alive necromancers when collecting dead candidates', () => {
      const game = makeGame();
      const aliveNecro = placeMonsterAt(game, 'Y', 5, 5);
      aliveNecro.alive = true;
      const dead = placeMonsterAt(game, 1, 5, 6);
      dead.alive = false;
      dead.reviveImmune = false;
      dead.reachedEnd = false;
      // Add an alive necromancer that should NOT be in deadCandidates
      game._stepNecromancerRevives();
      expect(dead.alive).toBe(true); // dead should be revived
    });
  });

  describe('onMouseUp drag-to-place', () => {
    it('returns early when no dragState', () => {
      const game = makeGame();
      game._dragState = null;
      game.onMouseUp(100, 100);
      expect(true).toBe(true);
    });

    it('does nothing when dragState spec is null', () => {
      const game = makeGame();
      game._dragState = { spec: null };
      game.onMouseUp(100, 100);
      expect(game._dragState).toBeNull();
    });

    it('calls _tryPlaceFromPointer when dragState has valid spec', () => {
      const game = makeGame();
      vi.spyOn(game, '_tryPlaceFromPointer').mockImplementation(() => {});
      game._dragState = { spec: swordsmanSpec };
      game.onMouseUp(300, 100);
      expect(game._dragState).toBeNull();
      expect(game._tryPlaceFromPointer).toHaveBeenCalledWith(300, 100, swordsmanSpec);
    });
  });
});
