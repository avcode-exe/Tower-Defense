import { describe, it, expect, vi, beforeAll } from 'vitest';
import { CONFIG, TROOP_SPECS } from '../src/config.js';

vi.mock('../src/audio.js', () => ({ AUDIO: { troopPlace: vi.fn() } }));
vi.mock('../src/particles.js', () => ({
  PARTICLES: {
    update: vi.fn(),
    clear: vi.fn(),
    healBurst: vi.fn(),
    deathBurst: vi.fn(),
    hitSpark: vi.fn(),
    slowApply: vi.fn(),
    burnApply: vi.fn(),
    burnTick: vi.fn(),
    chainSpark: vi.fn(),
    splashImpact: vi.fn(),
    reviveBurst: vi.fn(),
    troopDeath: vi.fn(),
    troopShieldActivate: vi.fn(),
    spawnTrail: vi.fn(),
    spawn: vi.fn(),
  },
}));

describe('Troop', () => {
  let Troop, swordsmanSpec, archerSpec, healerSpec, lightningSpec, flameSpec, icewizSpec;

  beforeAll(async () => {
    const mod = await import('../src/troop.js');
    Troop = mod.Troop;
    const helpers = await import('./helpers.js');
    swordsmanSpec = helpers.swordsmanSpec;
    archerSpec = helpers.archerSpec;
    healerSpec = helpers.healerSpec;
    lightningSpec = helpers.lightningSpec;
    flameSpec = helpers.flameSpec;
    icewizSpec = helpers.icewizSpec;
  });

  describe('constructor', () => {
    it('caches spec stats and positions from gx/gy', () => {
      const t = new Troop(swordsmanSpec, 3, 4);
      expect(t.spec).toBe(swordsmanSpec);
      expect(t.gx).toBe(3);
      expect(t.gy).toBe(4);
      expect(t.x).toBe(3 * CONFIG.TILE_SIZE + CONFIG.TILE_SIZE / 2);
      expect(t.y).toBe(4 * CONFIG.TILE_SIZE + CONFIG.TILE_SIZE / 2);
      expect(t.alive).toBe(true);
      expect(t.hp).toBe(swordsmanSpec.hp);
      expect(t.maxHp).toBe(swordsmanSpec.hp);
    });

    it('healer has healTargetLevel=1', () => {
      const t = new Troop(healerSpec, 0, 0);
      expect(t.healTargetLevel).toBe(1);
    });
  });

  describe('_recomputeStats', () => {
    it('damage scales with dmgLevel', () => {
      const t = new Troop(swordsmanSpec, 0, 0);
      const baseDmg = swordsmanSpec.damage;
      expect(t._cachedDamage).toBe(baseDmg);
      t.dmgLevel = 2;
      t._recomputeStats();
      expect(t._cachedDamage).toBeGreaterThan(baseDmg);
    });

    it('ranged range increases with level', () => {
      const t = new Troop(archerSpec, 0, 0);
      const baseRange = archerSpec.range;
      expect(t._cachedRange).toBe(baseRange);
      t.rangeLevel = 3;
      t._recomputeStats();
      expect(t._cachedRange).toBe(baseRange + 2);
    });
  });

  describe('getUpgradeCost', () => {
    it('returns exponential cost', () => {
      const t = new Troop(swordsmanSpec, 0, 0);
      const cost = t.getUpgradeCost('dmg');
      expect(cost).toBeGreaterThan(0);
      expect(cost).toBe(Math.round(swordsmanSpec.cost * Math.pow(CONFIG.UPGRADE_COST_SCALE, 0)));
    });

    it('returns Infinity for invalid stat', () => {
      const t = new Troop(swordsmanSpec, 0, 0);
      expect(t.getUpgradeCost('invalid')).toBe(Infinity);
    });

    it('caches results', () => {
      const t = new Troop(swordsmanSpec, 0, 0);
      const cost1 = t.getUpgradeCost('dmg');
      const cost2 = t.getUpgradeCost('dmg');
      expect(cost1).toBe(cost2);
    });
  });

  describe('canUpgrade', () => {
    it('range false for melee', () => {
      const t = new Troop(swordsmanSpec, 0, 0);
      expect(t.canUpgrade('range')).toBe(false);
    });

    it('chain false for non-lightning', () => {
      const t = new Troop(swordsmanSpec, 0, 0);
      expect(t.canUpgrade('chain')).toBe(false);
    });

    it('chain true for lightning', () => {
      const t = new Troop(lightningSpec, 0, 0);
      expect(t.canUpgrade('chain')).toBe(true);
    });

    it('hp always true', () => {
      const t = new Troop(swordsmanSpec, 0, 0);
      expect(t.canUpgrade('hp')).toBe(true);
    });
  });

  describe('upgradeStat', () => {
    it('increments level and recomputes', () => {
      const t = new Troop(swordsmanSpec, 0, 0);
      const oldDmg = t._cachedDamage;
      t.upgradeStat('dmg');
      expect(t.dmgLevel).toBe(2);
      expect(t._cachedDamage).toBeGreaterThan(oldDmg);
    });

    it('returns false when maxed', () => {
      const t = new Troop(swordsmanSpec, 0, 0);
      t.dmgLevel = t.maxUpgradeLevel;
      expect(t.upgradeStat('dmg')).toBe(false);
    });

    it('returns false for invalid stat', () => {
      const t = new Troop(swordsmanSpec, 0, 0);
      expect(t.upgradeStat('invalid')).toBe(false);
    });

    it('HP upgrade heals delta', () => {
      const t = new Troop(swordsmanSpec, 0, 0);
      t.hp = 1;
      t.upgradeStat('hp');
      expect(t.hp).toBeGreaterThan(1);
    });
  });

  describe('isMaxed', () => {
    it('true at max level', () => {
      const t = new Troop(swordsmanSpec, 0, 0);
      t.dmgLevel = t.maxUpgradeLevel;
      expect(t.isMaxed('dmg')).toBe(true);
    });

    it('false below max', () => {
      const t = new Troop(swordsmanSpec, 0, 0);
      expect(t.isMaxed('dmg')).toBe(false);
    });

    it('returns true for inapplicable stats', () => {
      const t = new Troop(swordsmanSpec, 0, 0);
      expect(t.isMaxed('range')).toBe(true);
    });
  });

  describe('getHealCost / canHeal / heal', () => {
    it('heal cost uses ratio', () => {
      const t = new Troop(swordsmanSpec, 0, 0);
      const expected = Math.ceil(swordsmanSpec.cost * CONFIG.TROOP_HEAL_COST_RATIO);
      expect(t.getHealCost()).toBe(expected);
    });

    it('canHeal returns false at full HP', () => {
      const t = new Troop(swordsmanSpec, 0, 0);
      expect(t.canHeal()).toBe(false);
    });

    it('heal restores HP', () => {
      const t = new Troop(swordsmanSpec, 0, 0);
      t.hp = 1;
      expect(t.canHeal()).toBe(true);
      t.heal();
      expect(t.hp).toBeGreaterThan(1);
    });

    it('heal returns false at full HP', () => {
      const t = new Troop(swordsmanSpec, 0, 0);
      expect(t.heal()).toBe(false);
    });
  });

  describe('shield methods', () => {
    it('getShieldCost uses ratio', () => {
      const t = new Troop(swordsmanSpec, 0, 0);
      const expected = Math.ceil(swordsmanSpec.cost * CONFIG.SHIELD_COST_RATIO);
      expect(t.getShieldCost()).toBe(expected);
    });

    it('applyShield sets shield to maxHp', () => {
      const t = new Troop(swordsmanSpec, 0, 0);
      t.applyShield();
      expect(t.shield).toBe(t.maxHp);
      expect(t.maxShield).toBe(t.maxHp);
    });

    it('canAddShield returns false when shielded', () => {
      const t = new Troop(swordsmanSpec, 0, 0);
      expect(t.canAddShield()).toBe(true);
      t.applyShield();
      expect(t.canAddShield()).toBe(false);
    });

    it('clearShield resets', () => {
      const t = new Troop(swordsmanSpec, 0, 0);
      t.applyShield();
      t.clearShield();
      expect(t.shield).toBe(0);
      expect(t.maxShield).toBe(0);
    });

    it('canAddShield returns false when dead', () => {
      const t = new Troop(swordsmanSpec, 0, 0);
      t.alive = false;
      expect(t.canAddShield()).toBe(false);
    });
  });

  describe('getTotalInvested', () => {
    it('returns base cost when no upgrades', () => {
      const t = new Troop(swordsmanSpec, 0, 0);
      expect(t.getTotalInvested()).toBe(swordsmanSpec.cost);
    });

    it('includes upgrade costs', () => {
      const t = new Troop(swordsmanSpec, 0, 0);
      t.dmgLevel = 3;
      const cost = t.getUpgradeCost('dmg');
      expect(t.getTotalInvested()).toBeGreaterThan(swordsmanSpec.cost);
    });
  });

  describe('getDps / getHps', () => {
    it('getDps returns damage / attackSpeed', () => {
      const t = new Troop(swordsmanSpec, 0, 0);
      expect(t.getDps()).toBe(t._cachedDamage / t._cachedAttackSpeed);
    });

    it('getHps returns 0 for non-support', () => {
      const t = new Troop(swordsmanSpec, 0, 0);
      expect(t.getHps()).toBe(0);
    });

    it('getHps returns correct for support', () => {
      const t = new Troop(healerSpec, 0, 0);
      expect(t.getHps()).toBeGreaterThan(0);
    });
  });

  describe('takeDamage', () => {
    it('reduces HP without shield', () => {
      const t = new Troop(swordsmanSpec, 0, 0);
      const result = t.takeDamage(10);
      expect(t.hp).toBe(t.maxHp - 10);
    });

    it('kills when HP reaches 0', () => {
      const t = new Troop(swordsmanSpec, 0, 0);
      t.takeDamage(9999);
      expect(t.alive).toBe(false);
    });

    it('shield absorbs damage', () => {
      const t = new Troop(swordsmanSpec, 0, 0);
      t.applyShield();
      t.takeDamage(10);
      expect(t.shield).toBeLessThan(t.maxShield);
    });

    it('handles invalid input', () => {
      const t = new Troop(swordsmanSpec, 0, 0);
      // takeDamage does not throw on NaN, it silently returns
      const result = t.takeDamage(NaN);
      expect(result).toBeDefined();
    });
  });

  describe('getHpPercent / getHpRatio / getShieldRatio / hasShield', () => {
    it('getHpPercent at full health', () => {
      const t = new Troop(swordsmanSpec, 0, 0);
      expect(t.getHpPercent()).toBe(100);
    });

    it('hasShield reflects shield state', () => {
      const t = new Troop(swordsmanSpec, 0, 0);
      expect(t.hasShield()).toBe(false);
      t.applyShield();
      expect(t.hasShield()).toBe(true);
    });

    it('getShieldRatio returns correct ratio', () => {
      const t = new Troop(swordsmanSpec, 0, 0);
      expect(t.getShieldRatio()).toBe(0);
      t.applyShield();
      t.shield = Math.floor(t.maxHp / 2);
      const ratio = t.getShieldRatio();
      expect(ratio).toBeCloseTo(0.5, 1);
    });

    it('getHpRatio returns 0 when maxHp is 0', () => {
      const t = new Troop(swordsmanSpec, 0, 0);
      t.maxHp = 0;
      expect(t.getHpRatio()).toBe(0);
    });

    it('getHpPercent returns 0 when maxHp is 0', () => {
      const t = new Troop(swordsmanSpec, 0, 0);
      t.maxHp = 0;
      expect(t.getHpPercent()).toBe(0);
      t.hp = 0;
    });
  });

  describe('pickTarget melee mode', () => {
    it('returns nearest alive monster with tileIndex', () => {
      const t = new Troop(swordsmanSpec, 5, 5);
      // Create a monster that's at tile (5,5)
      const monster = { alive: true, tileDistanceTo: vi.fn(() => 0.5), x: t.x, y: t.y, progress: 0.8 };
      const monsters = [monster];
      const tileIndex = new Array(CONFIG.GRID_SIZE * CONFIG.GRID_SIZE);
      tileIndex[5 * CONFIG.GRID_SIZE + 5] = monsters;
      const result = t.pickTarget(monsters, tileIndex);
      expect(result).toBe(monster);
    });

    it('returns null when no monsters in range with tileIndex', () => {
      const t = new Troop(swordsmanSpec, 5, 5);
      const monsters = [];
      const tileIndex = new Array(CONFIG.GRID_SIZE * CONFIG.GRID_SIZE);
      const result = t.pickTarget(monsters, tileIndex);
      expect(result).toBeNull();
    });

    it('returns nearest alive monster without tileIndex (linear scan)', () => {
      const t = new Troop(swordsmanSpec, 5, 5);
      const monster = { alive: true, tileDistanceTo: vi.fn(() => 0.5), x: t.x, y: t.y, progress: 0.8 };
      const monsters = [monster];
      const result = t.pickTarget(monsters, null);
      expect(result).toBe(monster);
    });

    it('skips dead monsters in linear scan', () => {
      const t = new Troop(swordsmanSpec, 5, 5);
      const monster = { alive: false, tileDistanceTo: vi.fn(() => 0.5) };
      const result = t.pickTarget([monster], null);
      expect(result).toBeNull();
    });
  });

  describe('pickTarget ranged mode', () => {
    it('returns farthest-progress monster with tileIndex', () => {
      const t = new Troop(archerSpec, 5, 5);
      const centerX = t.x;
      const centerY = t.y;
      const closeMonster = { alive: true, x: centerX, y: centerY, progress: 0.3 };
      const farMonster = { alive: true, x: centerX, y: centerY, progress: 0.9 };
      const monsters = [closeMonster, farMonster];
      const tileIndex = new Array(CONFIG.GRID_SIZE * CONFIG.GRID_SIZE);
      const rangeTiles = Math.ceil(t._cachedRange + CONFIG.TILE_BUFFER);
      tileIndex[5 * CONFIG.GRID_SIZE + 5] = monsters;
      // Both are at the center of tile (5,5), within range
      const result = t.pickTarget(monsters, tileIndex);
      expect(result).toBe(farMonster);
    });

    it('returns null when no monsters in range', () => {
      const t = new Troop(archerSpec, 0, 0);
      const monster = { alive: true, x: 9999, y: 9999, progress: 0.5 };
      const tileIndex = new Array(CONFIG.GRID_SIZE * CONFIG.GRID_SIZE);
      const result = t.pickTarget([monster], tileIndex);
      expect(result).toBeNull();
    });

    it('ranged fallback linear scan with tileIndex null', () => {
      const t = new Troop(archerSpec, 5, 5);
      const monster = { alive: true, x: t.x, y: t.y, progress: 0.5 };
      const result = t.pickTarget([monster], null);
      expect(result).toBe(monster);
    });
  });

  describe('getHealRangePxSq / getMonsterDamage / getHealAmount', () => {
    it('getHealRangePxSq returns positive number', () => {
      const t = new Troop(healerSpec, 0, 0);
      expect(t.getHealRangePxSq()).toBeGreaterThan(0);
    });

    it('getMonsterDamage returns 0 for non-healer', () => {
      const t = new Troop(swordsmanSpec, 0, 0);
      expect(t.getMonsterDamage()).toBe(0);
    });

    it('getHealAmount returns cachedDamage', () => {
      const t = new Troop(healerSpec, 0, 0);
      expect(t.getHealAmount()).toBe(t._cachedDamage);
    });
  });

  describe('getChain / getSlowFactor / getSlowDuration', () => {
    it('getChain returns cached chain', () => {
      const t = new Troop(lightningSpec, 0, 0);
      expect(t.getChain()).toBe(t._cachedChain);
    });

    it('getSlowFactor returns 1 for troops without slow', () => {
      const t = new Troop(swordsmanSpec, 0, 0);
      expect(t.getSlowFactor()).toBe(1);
    });

    it('getSlowDuration returns 0 for troops without slow', () => {
      const t = new Troop(swordsmanSpec, 0, 0);
      expect(t.getSlowDuration()).toBe(0);
    });
  });

  describe('canUpgrade/isMaxed/upgradeStat for support', () => {
    it('canUpgrade slow for support returns true', () => {
      const t = new Troop(healerSpec, 0, 0);
      expect(t.canUpgrade('slow')).toBe(true);
    });

    it('upgradeStat slow for support increases healTargetLevel', () => {
      const t = new Troop(healerSpec, 0, 0);
      const result = t.upgradeStat('slow');
      expect(result).toBe(true);
      expect(t.healTargetLevel).toBe(2);
    });

    it('isMaxed slow for support uses healTargetLevel', () => {
      const t = new Troop(healerSpec, 0, 0);
      t.healTargetLevel = t.maxUpgradeLevel;
      expect(t.isMaxed('slow')).toBe(true);
    });

    it('upgradeStat slow no-op when maxed for support', () => {
      const t = new Troop(healerSpec, 0, 0);
      t.healTargetLevel = t.maxUpgradeLevel;
      expect(t.upgradeStat('slow')).toBe(false);
    });
  });

  describe('takeDamage edge cases', () => {
    it('shield absorbs excess damage', () => {
      const t = new Troop(swordsmanSpec, 0, 0);
      t.applyShield();
      const shieldBefore = t.shield;
      // Hit for more than shield
      const result = t.takeDamage(shieldBefore + 10);
      expect(t.shield).toBe(0);
      expect(t.hp).toBe(t.maxHp - 10);
    });

    it('zero damage does nothing', () => {
      const t = new Troop(swordsmanSpec, 0, 0);
      const hpBefore = t.hp;
      const result = t.takeDamage(0);
      // takeDamage returns false for amount <= 0
      expect(result).toBe(false);
      expect(t.hp).toBe(hpBefore);
    });

    it('non-finite amount returns false', () => {
      const t = new Troop(swordsmanSpec, 0, 0);
      expect(t.takeDamage(NaN)).toBe(false);
    });
  });

  describe('getTotalInvested with heals', () => {
    it('includes healGoldSpent', () => {
      const t = new Troop(swordsmanSpec, 0, 0);
      t.healGoldSpent = 50;
      expect(t.getTotalInvested()).toBe(swordsmanSpec.cost + 50);
    });
  });

  describe('getShieldCost', () => {
    it('returns correct cost', () => {
      const t = new Troop(swordsmanSpec, 0, 0);
      const expected = Math.ceil(swordsmanSpec.cost * CONFIG.SHIELD_COST_RATIO);
      expect(t.getShieldCost()).toBe(expected);
    });
  });

  describe('_recomputeStats slow factor/duration/shatter', () => {
    it('_cachedSlowFactor scales with slowLevel for icewiz', () => {
      const t = new Troop(icewizSpec, 0, 0);
      const baseFactor = t._cachedSlowFactor;
      t.slowLevel = 3;
      t._recomputeStats();
      expect(t._cachedSlowFactor).toBeLessThan(baseFactor);
    });

    it('_cachedSlowDuration scales with slowLevel', () => {
      const t = new Troop(icewizSpec, 0, 0);
      const baseDuration = t._cachedSlowDuration;
      t.slowLevel = 3;
      t._recomputeStats();
      expect(t._cachedSlowDuration).toBeGreaterThan(baseDuration);
    });

    it('_cachedShatterBonus scales with slowLevel', () => {
      const t = new Troop(icewizSpec, 0, 0);
      t.slowLevel = 3;
      t._recomputeStats();
      expect(t._cachedShatterBonus).toBeGreaterThan(0);
    });

    it('null slow defaults to 1/0/0', () => {
      const t = new Troop(swordsmanSpec, 0, 0);
      t.slowLevel = 3;
      t._recomputeStats();
      expect(t._cachedSlowFactor).toBe(1);
      expect(t._cachedSlowDuration).toBe(0);
      expect(t._cachedShatterBonus).toBe(0);
    });
  });

  describe('update support mode', () => {
    it('heals targets and damages monsters in range', () => {
      const t = new Troop(healerSpec, 0, 0);
      t.cooldown = 0;
      t.targetRefresh = -1;
      const game = {
        troops: [],
        monsters: [{ alive: true, x: t.x, y: t.y }],
        _monsterTileIndex: null,
        _troopIndexByRef: null,
        damageMonster: vi.fn(),
        _getPopup: vi.fn(),
      };
      t.update(1 / 60, [], [], game);
      expect(t.cooldown).toBe(t._cachedAttackSpeed);
    });

    it('returns early when cooldown > 0', () => {
      const t = new Troop(healerSpec, 0, 0);
      t.cooldown = 1;
      const game = { troops: [], _troopIndexByRef: null };
      t.update(1 / 60, [], [], game);
      expect(t.cooldown).toBe(1 - 1 / 60);
    });

    it('returns early when game is null', () => {
      const t = new Troop(healerSpec, 0, 0);
      t.cooldown = 0;
      t.update(1 / 60, [], [], null);
      expect(t.cooldown).toBe(0);
    });
  });

  describe('update melee mode', () => {
    it('attacks target when off cooldown', () => {
      const t = new Troop(swordsmanSpec, 5, 5);
      t.cooldown = 0;
      t.targetRefresh = -1;
      const monster = {
        alive: true,
        tileDistanceTo: vi.fn(() => 0.5),
        x: t.x,
        y: t.y,
        progress: 0.5,
        takeDamage: vi.fn(() => ({ killed: false, hpDamage: t._cachedDamage, reward: 0 })),
      };
      const game = {
        damageMonster: vi.fn(() => false),
        _monsterTileIndex: null,
        _troopIndexByRef: new Map(),
        monsters: [monster],
        gold: 0,
        _getPopup: vi.fn(),
      };
      t.update(1 / 60, [monster], [], game);
      // melee target should be found by linear scan (tileIndex null)
      expect(game.damageMonster).toHaveBeenCalled();
    });

    it('returns early when cooldown > 0', () => {
      const t = new Troop(swordsmanSpec, 5, 5);
      t.cooldown = 1;
      t.target = { alive: true };
      t.update(1 / 60, [], [], null);
      expect(t.cooldown).toBe(1 - 1 / 60);
    });
  });

  describe('update ranged mode', () => {
    it('creates projectile when off cooldown', () => {
      const t = new Troop(archerSpec, 5, 5);
      t.cooldown = 0;
      t.targetRefresh = -1;
      const monster = { alive: true, x: t.x, y: t.y, progress: 0.5 };
      const game = {
        acquireProjectile: vi.fn(() => ({})),
        _monsterTileIndex: null,
        _troopIndexByRef: new Map(),
        monsters: [monster],
        gold: 0,
        _getPopup: vi.fn(),
      };
      const projectiles = [];
      t.update(1 / 60, [monster], projectiles, game);
      expect(game.acquireProjectile).toHaveBeenCalled();
    });
  });

  describe('applyShield / clearShield edge cases', () => {
    it('applyShield returns false when already shielded', () => {
      const t = new Troop(swordsmanSpec, 0, 0);
      t.applyShield();
      expect(t.applyShield()).toBe(false);
    });

    it('clearShield resets both shield and maxShield', () => {
      const t = new Troop(swordsmanSpec, 0, 0);
      t.applyShield();
      t.clearShield();
      expect(t.shield).toBe(0);
      expect(t.maxShield).toBe(0);
    });
  });

  describe('healBeam', () => {
    it('update decrements healBeam timer', () => {
      const t = new Troop(swordsmanSpec, 5, 5);
      t.healBeam = { troop: { spec: {} }, timer: 0.5 };
      t.cooldown = 1;
      t.update(1 / 60, [], [], null);
      expect(t.healBeam.timer).toBeCloseTo(0.5 - 1 / 60, 3);
    });

    it('healBeam becomes null when timer expires', () => {
      const t = new Troop(swordsmanSpec, 5, 5);
      t.healBeam = { troop: { spec: {} }, timer: 0.01 };
      t.cooldown = 0;
      t.update(1 / 60, [], [], null);
      expect(t.healBeam).toBeNull();
    });
  });

  describe('pickHealTarget', () => {
    it('returns null when spec type is not support', () => {
      const t = new Troop(swordsmanSpec, 5, 5);
      expect(t.pickHealTarget([], new Map())).toBeNull();
    });

    it('removes out-of-range targets and picks new ones', () => {
      const t = new Troop(healerSpec, 5, 5);
      // Add an out-of-range target initially (far away)
      const outOfRangeTroop = {
        alive: true,
        x: 9999,
        y: 9999,
        hp: 10,
        maxHp: 100,
        spec: { type: 'melee' },
        getHpRatio: () => 0.1,
      };
      t.healTargets = [outOfRangeTroop];
      // Add an in-range target
      const inRangeTroop = {
        alive: true,
        x: t.x,
        y: t.y,
        hp: 10,
        maxHp: 100,
        spec: { type: 'melee' },
        getHpRatio: () => 0.1,
      };
      const result = t.pickHealTarget(
        [outOfRangeTroop, inRangeTroop],
        new Map([
          [outOfRangeTroop, 0],
          [inRangeTroop, 1],
        ])
      );
      // outOfRangeTroop should be removed; inRangeTroop should be picked
      expect(result).toBe(inRangeTroop);
      expect(t.healTargets).toContain(inRangeTroop);
      expect(t.healTargets).not.toContain(outOfRangeTroop);
    });

    it('removes dead targets from healTargets', () => {
      const t = new Troop(healerSpec, 5, 5);
      const deadTroop = {
        alive: false,
        x: t.x,
        y: t.y,
        hp: 0,
        maxHp: 100,
        spec: { type: 'melee' },
        getHpRatio: () => 0,
      };
      t.healTargets = [deadTroop];
      const result = t.pickHealTarget([], new Map());
      expect(t.healTargets.length).toBe(0);
      expect(result).toBeNull();
    });

    it('removes full-HP targets from healTargets', () => {
      const t = new Troop(healerSpec, 5, 5);
      const fullHpTroop = {
        alive: true,
        x: t.x,
        y: t.y,
        hp: 100,
        maxHp: 100,
        spec: { type: 'melee' },
        getHpRatio: () => 1,
      };
      t.healTargets = [fullHpTroop];
      const result = t.pickHealTarget([], new Map());
      expect(t.healTargets.length).toBe(0);
      expect(result).toBeNull();
    });

    it('does not pick support-type targets', () => {
      const t = new Troop(healerSpec, 5, 5);
      const supportTroop = {
        alive: true,
        x: t.x,
        y: t.y,
        hp: 10,
        maxHp: 100,
        spec: { type: 'support' },
        getHpRatio: () => 0.1,
      };
      const result = t.pickHealTarget([supportTroop], new Map([[supportTroop, 0]]));
      expect(result).toBeNull();
    });

    it('returns null when no healable targets in range', () => {
      const t = new Troop(healerSpec, 5, 5);
      const farTroop = {
        alive: true,
        x: 9999,
        y: 9999,
        hp: 10,
        maxHp: 100,
        spec: { type: 'melee' },
        getHpRatio: () => 0.1,
      };
      const result = t.pickHealTarget([farTroop], new Map([[farTroop, 0]]));
      expect(result).toBeNull();
    });

    it('sorts candidates by hpRatio then hp then distSq then index', () => {
      const t = new Troop(healerSpec, 5, 5);
      const worst = { alive: true, x: t.x, y: t.y, hp: 80, maxHp: 100, spec: { type: 'melee' }, getHpRatio: () => 0.8 };
      const best = { alive: true, x: t.x, y: t.y, hp: 10, maxHp: 100, spec: { type: 'melee' }, getHpRatio: () => 0.1 };
      const result = t.pickHealTarget(
        [worst, best],
        new Map([
          [worst, 0],
          [best, 1],
        ])
      );
      expect(result).toBe(best);
    });
  });

  describe('damageMonstersInHealRange', () => {
    it('no-op when game is null', () => {
      const t = new Troop(healerSpec, 5, 5);
      expect(() => t.damageMonstersInHealRange(null)).not.toThrow();
    });

    it('no-op when game has no monsters', () => {
      const t = new Troop(healerSpec, 5, 5);
      expect(() => t.damageMonstersInHealRange({ monsters: [] })).not.toThrow();
    });

    it('no-op when monsterDamage is 0', () => {
      const t = new Troop(swordsmanSpec, 5, 5);
      expect(() => t.damageMonstersInHealRange({ monsters: [{ alive: true }] })).not.toThrow();
    });

    it('damages monsters in range using tileIndex path', () => {
      const t = new Troop(healerSpec, 5, 5);
      const monster = { alive: true, x: t.x, y: t.y };
      const damageMonster = vi.fn();
      const tileIndex = new Array(CONFIG.GRID_SIZE * CONFIG.GRID_SIZE);
      const rangeTiles = Math.ceil(t._cachedRange + CONFIG.TILE_BUFFER);
      tileIndex[5 * CONFIG.GRID_SIZE + 5] = [monster];
      t.damageMonstersInHealRange({
        monsters: [monster],
        _monsterTileIndex: tileIndex,
        damageMonster,
      });
      expect(damageMonster).toHaveBeenCalled();
    });

    it('damages monsters in range using fallback path', () => {
      const t = new Troop(healerSpec, 5, 5);
      const monster = { alive: true, x: t.x, y: t.y };
      const damageMonster = vi.fn();
      t.damageMonstersInHealRange({
        monsters: [monster],
        _monsterTileIndex: null,
        damageMonster,
      });
      expect(damageMonster).toHaveBeenCalled();
    });

    it('skips out-of-range monsters in fallback path', () => {
      const t = new Troop(healerSpec, 5, 5);
      const farMonster = { alive: true, x: 9999, y: 9999 };
      const damageMonster = vi.fn();
      t.damageMonstersInHealRange({
        monsters: [farMonster],
        _monsterTileIndex: null,
        damageMonster,
      });
      expect(damageMonster).not.toHaveBeenCalled();
    });
  });

  describe('update AOE melee mode', () => {
    it('damages all monsters in range with tileIndex', () => {
      const spec = { ...swordsmanSpec, aoe: true };
      const t = new Troop(spec, 5, 5);
      t.cooldown = 0;
      t.targetRefresh = -1;
      const monster = { alive: true, tileDistanceTo: vi.fn(() => 0.5), x: t.x, y: t.y };
      const damageMonster = vi.fn();
      const tileIndex = new Array(CONFIG.GRID_SIZE * CONFIG.GRID_SIZE);
      tileIndex[5 * CONFIG.GRID_SIZE + 5] = [monster];
      t.update(1 / 60, [monster], [], {
        damageMonster,
        _monsterTileIndex: tileIndex,
        _troopIndexByRef: new Map(),
        monsters: [monster],
        gold: 0,
        _getPopup: vi.fn(),
      });
      expect(damageMonster).toHaveBeenCalled();
      expect(t.cooldown).toBe(t._cachedAttackSpeed);
    });

    it('damages all monsters in range without tileIndex (fallback)', () => {
      const spec = { ...swordsmanSpec, aoe: true };
      const t = new Troop(spec, 5, 5);
      t.cooldown = 0;
      t.targetRefresh = -1;
      const monster = { alive: true, tileDistanceTo: vi.fn(() => 0.5), x: t.x, y: t.y };
      const damageMonster = vi.fn();
      t.update(1 / 60, [monster], [], {
        damageMonster,
        _monsterTileIndex: null,
        _troopIndexByRef: new Map(),
        monsters: [monster],
        gold: 0,
        _getPopup: vi.fn(),
      });
      expect(damageMonster).toHaveBeenCalled();
    });
  });

  describe('canUpgrade edge cases', () => {
    it('slow returns false for non-slow, non-support troop', () => {
      const t = new Troop(swordsmanSpec, 0, 0);
      expect(t.canUpgrade('slow')).toBe(false);
    });

    it('dmg always returns true', () => {
      const t = new Troop(swordsmanSpec, 0, 0);
      expect(t.canUpgrade('dmg')).toBe(true);
    });
  });

  describe('getUpgradeCost for support slow', () => {
    it('uses healTargetLevel for slow stat', () => {
      const t = new Troop(healerSpec, 0, 0);
      t.healTargetLevel = 2;
      const cost = t.getUpgradeCost('slow');
      expect(cost).toBeGreaterThan(0);
      expect(cost).toBe(Math.round(healerSpec.cost * Math.pow(CONFIG.UPGRADE_COST_SCALE, 1)));
    });
  });

  describe('isMaxed edge cases', () => {
    it('returns false for unknown stat', () => {
      const t = new Troop(swordsmanSpec, 0, 0);
      expect(t.isMaxed('unknown_stat')).toBe(false);
    });
  });

  describe('update support mode: heal target removal paths', () => {
    it('removes self-referencing heal target during healing loop (line 505-506)', () => {
      // pickHealTarget does NOT check t === this, but the healing loop does.
      // So a healer can pick itself as a heal target, then the healing loop removes it.
      const t = new Troop(healerSpec, 5, 5);
      t.cooldown = 0;
      t.targetRefresh = -1;
      // Add self as heal target — pickHealTarget won't filter it out (no t === this check)
      // But the healing loop WILL filter it out (t === this check at line 504)
      t.healTargets = [t];
      t.update(1 / 60, [], [], {
        troops: [],
        monsters: [],
        _monsterTileIndex: null,
        _troopIndexByRef: new Map(),
        damageMonster: vi.fn(),
        _getPopup: vi.fn(),
      });
      // self-target should be removed by the healing loop's t === this check
      expect(t.healTargets.length).toBe(0);
    });

    it('heals existing heal targets and shows popup', () => {
      const t = new Troop(healerSpec, 5, 5);
      t.cooldown = 0;
      t.targetRefresh = -1;
      const healTarget = {
        alive: true,
        x: t.x,
        y: t.y,
        hp: 10,
        maxHp: 100,
        spec: { type: 'melee' },
        healBeam: null,
        getHpRatio: () => 0.1,
      };
      t.healTargets = [healTarget];
      const _getPopup = vi.fn();
      t.update(1 / 60, [], [], {
        troops: [healTarget],
        monsters: [{ alive: true, x: t.x, y: t.y }],
        _monsterTileIndex: null,
        _troopIndexByRef: new Map(),
        damageMonster: vi.fn(),
        _getPopup,
      });
      // HP should have increased
      expect(healTarget.hp).toBeGreaterThan(10);
      expect(_getPopup).toHaveBeenCalled();
    });
  });

  describe('update melee with burn stacks', () => {
    it('applies burn when target survives', () => {
      const t = new Troop(flameSpec, 5, 5);
      t.cooldown = 0;
      t.targetRefresh = -1;
      const monster = { alive: true, tileDistanceTo: vi.fn(() => 0.5), x: t.x, y: t.y, progress: 0.5 };
      const damageMonster = vi.fn(() => false); // false = not killed
      t.update(1 / 60, [monster], [], {
        damageMonster,
        applyBurn: vi.fn(),
        _monsterTileIndex: null,
        _troopIndexByRef: new Map(),
        monsters: [monster],
        gold: 0,
        _getPopup: vi.fn(),
      });
      expect(damageMonster).toHaveBeenCalled();
    });
  });

  describe('update returns early when target dead', () => {
    it('no-ops when target is dead', () => {
      const t = new Troop(swordsmanSpec, 5, 5);
      t.cooldown = 0;
      t.targetRefresh = -1;
      t.target = { alive: false };
      const game = {
        damageMonster: vi.fn(),
        _monsterTileIndex: null,
        _troopIndexByRef: new Map(),
      };
      t.update(1 / 60, [], [], game);
      expect(game.damageMonster).not.toHaveBeenCalled();
    });
  });

  describe('update no-ops when game is null after finding target', () => {
    it('does not attack when game is null', () => {
      const t = new Troop(swordsmanSpec, 5, 5);
      t.cooldown = 0;
      t.targetRefresh = -1;
      const monster = { alive: true, tileDistanceTo: vi.fn(() => 0.5), x: t.x, y: t.y };
      t.update(1 / 60, [monster], [], null);
      expect(t.cooldown).toBe(0);
    });
  });

  describe('_recomputeStats melee range stays constant', () => {
    it('melee range does not increase with rangeLevel', () => {
      const t = new Troop(swordsmanSpec, 0, 0);
      const baseRange = t._cachedRange;
      t.rangeLevel = 5;
      t._recomputeStats();
      expect(t._cachedRange).toBe(baseRange);
    });
  });

  describe('getUpgradeCost caches results', () => {
    it('caches upgrade cost per stat+level', () => {
      const t = new Troop(swordsmanSpec, 0, 0);
      const cost1 = t.getUpgradeCost('hp');
      const cost2 = t.getUpgradeCost('hp');
      expect(cost1).toBe(cost2);
      expect(t._upgradeCostCache).toHaveProperty('hp_1');
    });

    it('returns different cost for different levels', () => {
      const t = new Troop(swordsmanSpec, 0, 0);
      const costL1 = t.getUpgradeCost('dmg');
      t.dmgLevel = 3;
      const costL3 = t.getUpgradeCost('dmg');
      expect(costL3).toBeGreaterThan(costL1);
    });
  });

  describe('getTotalInvested with slow upgrades for support', () => {
    it('includes support healTargetLevel in cost', () => {
      const t = new Troop(healerSpec, 0, 0);
      t.healTargetLevel = 3;
      const total = t.getTotalInvested();
      expect(total).toBeGreaterThan(healerSpec.cost);
    });
  });

  describe('update healer refreshes targetRefresh', () => {
    it('refreshes heal targets on targetRefresh <= 0', () => {
      const t = new Troop(healerSpec, 5, 5);
      t.cooldown = 1; // above cooldown so we exit early after healTarget refresh
      t.targetRefresh = -1;
      const healTarget = {
        alive: true,
        x: t.x,
        y: t.y,
        hp: 10,
        maxHp: 100,
        spec: { type: 'melee' },
        getHpRatio: () => 0.1,
      };
      const game = {
        troops: [healTarget],
        _troopIndexByRef: new Map([[healTarget, 0]]),
        monsters: [],
        _monsterTileIndex: null,
        damageMonster: vi.fn(),
        _getPopup: vi.fn(),
      };
      t.update(1 / 60, [], [], game);
      // targetRefresh is set to TARGET_REFRESH_INTERVAL, then update returns early due to cooldown
      expect(t.targetRefresh).toBe(CONFIG.TARGET_REFRESH_INTERVAL);
    });
  });

  describe('pickHealTarget with null troopIndexMap', () => {
    it('works with null troopIndexMap by creating one', () => {
      const t = new Troop(healerSpec, 5, 5);
      const healTarget = {
        alive: true,
        x: t.x,
        y: t.y,
        hp: 10,
        maxHp: 100,
        spec: { type: 'melee' },
        getHpRatio: () => 0.1,
      };
      const result = t.pickHealTarget([healTarget], null);
      expect(result).toBe(healTarget);
    });
  });

  describe('getter branches', () => {
    it('getAttackSpeed returns cached attack speed', () => {
      const t = new Troop(swordsmanSpec, 0, 0);
      expect(t.getAttackSpeed()).toBe(t._cachedAttackSpeed);
    });

    it('getHealTargetCount returns healTargetLevel', () => {
      const t = new Troop(healerSpec, 0, 0);
      expect(t.getHealTargetCount()).toBe(1);
      t.healTargetLevel = 3;
      expect(t.getHealTargetCount()).toBe(3);
    });

    it('update support mode skips self in heal loop', () => {
      const t = new Troop(healerSpec, 5, 5);
      t.cooldown = 0;
      t.targetRefresh = -1;
      // Set self as heal target (should be skipped by t === this check)
      t.healTargets = [t];
      const game = {
        troops: [],
        monsters: [],
        _monsterTileIndex: null,
        _troopIndexByRef: new Map(),
        damageMonster: vi.fn(),
        _getPopup: vi.fn(),
      };
      t.update(1 / 60, [], [], game);
      // Should not crash, self should be filtered out
      expect(t.healTargets.length).toBe(0);
    });

    it('update support heals valid targets and shows popup', () => {
      const t = new Troop(healerSpec, 5, 5);
      t.cooldown = 0;
      t.targetRefresh = -1;
      const healTarget = {
        alive: true,
        x: t.x,
        y: t.y,
        hp: 50,
        maxHp: 100,
        spec: { type: 'melee' },
        healBeam: null,
        getHpRatio: () => 0.5,
      };
      t.healTargets = [healTarget];
      const game = {
        troops: [healTarget],
        monsters: [{ alive: true, x: 0, y: 0, hp: 100, maxHp: 100, distance: 1 }],
        _monsterTileIndex: [null, [{ alive: true, x: 0, y: 0, hp: 100, maxHp: 100, distance: 1 }]],
        _troopIndexByRef: new Map([[healTarget, 0]]),
        damageMonster: vi.fn(),
        _getPopup: vi.fn(),
      };
      t.update(1 / 60, [], [], game);
      expect(t.healTargets.length).toBe(1);
      expect(game._getPopup).toHaveBeenCalled();
    });

    it('getTotalInvested for support includes healTargetLevel', () => {
      const t = new Troop(healerSpec, 0, 0);
      t.healTargetLevel = 3;
      t.dmgLevel = 2;
      const invested = t.getTotalInvested();
      expect(invested).toBeGreaterThan(t.spec.cost);
    });

    it('getTotalInvested includes slow upgrades', () => {
      const t = new Troop(healerSpec, 0, 0);
      t.healTargetLevel = 2;
      const invested = t.getTotalInvested();
      expect(invested).toBeGreaterThan(0);
    });

    it('getDps returns cached damage / attack speed', () => {
      const t = new Troop(swordsmanSpec, 0, 0);
      expect(t.getDps()).toBe(t._cachedDamage / t._cachedAttackSpeed);
    });

    it('getHps returns 0 for non-support troops', () => {
      const t = new Troop(swordsmanSpec, 0, 0);
      expect(t.getHps()).toBe(0);
    });

    it('getHps returns damage/speed for support troops', () => {
      const t = new Troop(healerSpec, 0, 0);
      expect(t.getHps()).toBe(t._cachedDamage / t._cachedAttackSpeed);
    });

    it('getTotalInvested handles support with healTargetLevel 1', () => {
      const t = new Troop(healerSpec, 0, 0);
      expect(t.getTotalInvested()).toBeGreaterThan(0);
    });

    it('compareHealPriority tiebreaker: returns index when ratio/hp/dist are equal', () => {
      const t = new Troop(healerSpec, 5, 5);
      // Create 2 candidates with identical hpRatio, hp, and distSq
      const target1 = {
        alive: true,
        x: t.x,
        y: t.y,
        hp: 50,
        maxHp: 100,
        spec: { type: 'melee' },
        getHpRatio: () => 0.5,
      };
      const target2 = {
        alive: true,
        x: t.x,
        y: t.y,
        hp: 50,
        maxHp: 100,
        spec: { type: 'melee' },
        getHpRatio: () => 0.5,
      };
      const result = t.pickHealTarget(
        [target1, target2],
        new Map([
          [target1, 0],
          [target2, 1],
        ])
      );
      // Both are identical on all criteria, first by index (0) should win
      expect(result).toBe(target1);
    });

    it('compareHealPriority tiebreaker: hp delta used when ratio equal, then distSq, then index', () => {
      const t = new Troop(healerSpec, 5, 5);
      const candidates = [
        { alive: true, x: t.x, y: t.y, hp: 50, maxHp: 100, spec: { type: 'melee' }, getHpRatio: () => 0.5 },
        { alive: true, x: t.x, y: t.y, hp: 30, maxHp: 100, spec: { type: 'melee' }, getHpRatio: () => 0.5 },
      ];
      const result = t.pickHealTarget(
        candidates,
        new Map([
          [candidates[0], 0],
          [candidates[1], 1],
        ])
      );
      // Both have same ratio (0.5), so hp differs: candidate[1] has lower hp (30 < 50)
      expect(result).toBe(candidates[1]);
    });

    it('getDamage returns cached value (line 89)', () => {
      const t = new Troop(swordsmanSpec, 0, 0);
      t._cachedDamage = 42;
      expect(t.getDamage()).toBe(42);
    });

    it('getRange returns cached value (line 91)', () => {
      const t = new Troop(archerSpec, 0, 0);
      t._cachedRange = 5;
      expect(t.getRange()).toBe(5);
    });

    it('getHealRangePxSq returns (rangePx)^2 (line 92)', () => {
      const t = new Troop(healerSpec, 0, 0);
      const rangePx = (t._cachedRange + CONFIG.TILE_BUFFER) * CONFIG.TILE_SIZE;
      expect(t.getHealRangePxSq()).toBe(rangePx * rangePx);
    });

    it('getAttackSpeed returns cached value (line 93)', () => {
      const t = new Troop(archerSpec, 0, 0);
      expect(t.getAttackSpeed()).toBe(t._cachedAttackSpeed);
    });
  });
});
