import { describe, it, expect, vi } from 'vitest';
import { Troop } from '../src/troop.js';
import { CONFIG, TROOP_SPECS } from '../src/config.js';

const archerSpec = TROOP_SPECS.find((s) => s.id === 'archer');
const swordsmanSpec = TROOP_SPECS.find((s) => s.id === 'swordsman');
const healerSpec = TROOP_SPECS.find((s) => s.id === 'healer');
const knightSpec = TROOP_SPECS.find((s) => s.id === 'knight');
const icewizSpec = TROOP_SPECS.find((s) => s.id === 'icewiz');

function makeMockMonster(gx, gy, alive = true) {
  return {
    alive,
    x: gx * CONFIG.TILE_SIZE + CONFIG.TILE_SIZE / 2,
    y: gy * CONFIG.TILE_SIZE + CONFIG.TILE_SIZE / 2,
    hp: 50,
    maxHp: 50,
  };
}

function makeMockGame(monsters = [], tileIndex = null) {
  const damaged = [];
  const createdProjectiles = [];
  return {
    monsters,
    _monsterTileIndex: tileIndex,
    troops: [],
    damageMonster(m, dmg) {
      damaged.push({ monster: m, dmg });
    },
    acquireProjectile(troop, target, x, y) {
      const proj = { troop, target, x, y };
      createdProjectiles.push(proj);
      return proj;
    },
    _damaged: damaged,
    _projectiles: createdProjectiles,
    _getPopup() {},
  };
}

function buildTileIndex(monsters) {
  const gs = CONFIG.GRID_SIZE;
  const idx = new Array(gs * gs).fill(null);
  for (const m of monsters) {
    const gx = (m.x / CONFIG.TILE_SIZE) | 0;
    const gy = (m.y / CONFIG.TILE_SIZE) | 0;
    const key = gy * gs + gx;
    if (!idx[key]) idx[key] = [];
    idx[key].push(m);
  }
  return idx;
}

// ─── damageMonstersInHealRange ──────────────────────────────────────────────

describe('damageMonstersInHealRange', () => {
  it('damages monsters within heal range', () => {
    const t = new Troop(healerSpec, 5, 5);
    const m = makeMockMonster(6, 5);
    const game = makeMockGame([m]);
    game._monsterTileIndex = buildTileIndex([m]);
    t.damageMonstersInHealRange(game);
    expect(game._damaged.length).toBe(1);
    expect(game._damaged[0].monster).toBe(m);
    expect(game._damaged[0].dmg).toBe(healerSpec.monsterDamage);
  });

  it('does not damage monsters outside heal range', () => {
    const t = new Troop(healerSpec, 5, 5);
    const m = makeMockMonster(10, 10);
    const game = makeMockGame([m]);
    game._monsterTileIndex = buildTileIndex([m]);
    t.damageMonstersInHealRange(game);
    expect(game._damaged.length).toBe(0);
  });

  it('does not damage dead monsters', () => {
    const t = new Troop(healerSpec, 5, 5);
    const m = makeMockMonster(6, 5, false);
    const game = makeMockGame([m]);
    game._monsterTileIndex = buildTileIndex([m]);
    t.damageMonstersInHealRange(game);
    expect(game._damaged.length).toBe(0);
  });

  it('does nothing when game is null', () => {
    const t = new Troop(healerSpec, 5, 5);
    expect(() => t.damageMonstersInHealRange(null)).not.toThrow();
  });

  it('does nothing when no monsters exist', () => {
    const t = new Troop(healerSpec, 5, 5);
    const game = makeMockGame([]);
    game._monsterTileIndex = buildTileIndex([]);
    t.damageMonstersInHealRange(game);
    expect(game._damaged.length).toBe(0);
  });

  it('returns early when monsterDamage is 0', () => {
    const spec = { ...healerSpec, monsterDamage: 0 };
    const t = new Troop(spec, 5, 5);
    const game = makeMockGame([]);
    t.damageMonstersInHealRange(game);
    expect(game._damaged.length).toBe(0);
  });

  it('damages multiple monsters in range', () => {
    const t = new Troop(healerSpec, 5, 5);
    const m1 = makeMockMonster(6, 5);
    const m2 = makeMockMonster(5, 6);
    const game = makeMockGame([m1, m2]);
    game._monsterTileIndex = buildTileIndex([m1, m2]);
    t.damageMonstersInHealRange(game);
    expect(game._damaged.length).toBe(2);
  });

  it('uses tile index path when available', () => {
    const t = new Troop(healerSpec, 5, 5);
    const m = makeMockMonster(6, 5);
    const game = makeMockGame([m]);
    game._monsterTileIndex = buildTileIndex([m]);
    t.damageMonstersInHealRange(game);
    expect(game._damaged.length).toBe(1);
  });

  it('falls back to linear scan when tile index is not an array', () => {
    const t = new Troop(healerSpec, 5, 5);
    const m = makeMockMonster(6, 5);
    const game = makeMockGame([m]);
    game._monsterTileIndex = null;
    t.damageMonstersInHealRange(game);
    expect(game._damaged.length).toBe(1);
  });
});

// ─── getMonsterDamage ───────────────────────────────────────────────────────

describe('getMonsterDamage', () => {
  it('returns monsterDamage for healer', () => {
    const t = new Troop(healerSpec, 0, 0);
    expect(t.getMonsterDamage()).toBe(healerSpec.monsterDamage);
  });

  it('returns 0 for non-support troops', () => {
    const t = new Troop(archerSpec, 0, 0);
    expect(t.getMonsterDamage()).toBe(0);
  });

  it('returns 0 for swordsman', () => {
    const t = new Troop(swordsmanSpec, 0, 0);
    expect(t.getMonsterDamage()).toBe(0);
  });
});

// ─── Support update edge cases ──────────────────────────────────────────────

describe('Support update edge cases', () => {
  it('heals damaged allies in range', () => {
    const t = new Troop(healerSpec, 5, 5);
    const ally = new Troop(archerSpec, 6, 5);
    ally.hp = 10;
    const game = { troops: [t, ally], monsters: [], _getPopup: vi.fn() };
    t.targetRefresh = 0;
    t.cooldown = 0;
    t.update(0, [], [], game);
    expect(ally.hp).toBeGreaterThan(10);
  });

  it('does not heal full-HP allies', () => {
    const t = new Troop(healerSpec, 5, 5);
    const ally = new Troop(archerSpec, 6, 5);
    ally.hp = ally.maxHp;
    const game = { troops: [t, ally], monsters: [], _getPopup: vi.fn() };
    t.targetRefresh = 0;
    t.cooldown = 0;
    t.update(0, [], [], game);
    expect(ally.hp).toBe(ally.maxHp);
  });

  it('does not heal self', () => {
    const t = new Troop(healerSpec, 5, 5);
    t.hp = 10;
    const game = { troops: [t], monsters: [], _getPopup: vi.fn() };
    t.targetRefresh = 0;
    t.cooldown = 0;
    t.update(0, [], [], game);
    expect(t.hp).toBe(10);
  });

  it('does not heal dead allies', () => {
    const t = new Troop(healerSpec, 5, 5);
    const ally = new Troop(archerSpec, 6, 5);
    ally.hp = 10;
    ally.alive = false;
    const game = { troops: [t, ally], monsters: [], _getPopup: vi.fn() };
    t.targetRefresh = 0;
    t.cooldown = 0;
    t.update(0, [], [], game);
    expect(ally.hp).toBe(10);
  });

  it('does not heal other support troops', () => {
    const t = new Troop(healerSpec, 5, 5);
    const otherHealer = new Troop(healerSpec, 6, 5);
    otherHealer.hp = 10;
    const game = { troops: [t, otherHealer], monsters: [], _getPopup: vi.fn() };
    t.targetRefresh = 0;
    t.cooldown = 0;
    t.update(0, [], [], game);
    expect(otherHealer.hp).toBe(10);
  });

  it('calls damageMonstersInHealRange during update', () => {
    const t = new Troop(healerSpec, 5, 5);
    const m = makeMockMonster(6, 5);
    const game = makeMockGame([m]);
    game._monsterTileIndex = buildTileIndex([m]);
    const spy = vi.spyOn(t, 'damageMonstersInHealRange');
    t.targetRefresh = 0;
    t.cooldown = 0;
    t.update(0, [], [], game);
    expect(spy).toHaveBeenCalledWith(game);
    spy.mockRestore();
  });
});

// ─── getDps / getHps ────────────────────────────────────────────────────────

describe('getDps / getHps', () => {
  it('getDps returns damage / attackSpeed for damaging troops', () => {
    const t = new Troop(archerSpec, 0, 0);
    expect(t.getDps()).toBeCloseTo(archerSpec.damage / archerSpec.attackSpeed);
  });

  it('getHps returns damage / attackSpeed for support troops', () => {
    const t = new Troop(healerSpec, 0, 0);
    expect(t.getHps()).toBeCloseTo(healerSpec.damage / healerSpec.attackSpeed);
  });

  it('getHps returns 0 for non-support troops', () => {
    const t = new Troop(archerSpec, 0, 0);
    expect(t.getHps()).toBe(0);
  });

  it('DPS changes after upgrade', () => {
    const t = new Troop(archerSpec, 0, 0);
    const dpsBefore = t.getDps();
    t.upgradeStat('dmg');
    expect(t.getDps()).toBeGreaterThan(dpsBefore);
  });
});

// ─── isMaxed edge cases ─────────────────────────────────────────────────────

describe('isMaxed edge cases', () => {
  it('isMaxed returns true for inapplicable stats', () => {
    const t = new Troop(swordsmanSpec, 0, 0);
    expect(t.isMaxed('range')).toBe(true);
  });

  it('isMaxed returns true for chain on non-lightning troops', () => {
    const t = new Troop(archerSpec, 0, 0);
    expect(t.isMaxed('chain')).toBe(true);
  });

  it('isMaxed returns true for slow on non-support/non-icewiz troops', () => {
    const t = new Troop(archerSpec, 0, 0);
    expect(t.isMaxed('slow')).toBe(true);
  });

  it('isMaxed returns false for support slow (healTargetLevel)', () => {
    const t = new Troop(healerSpec, 0, 0);
    expect(t.isMaxed('slow')).toBe(false);
  });

  it('isMaxed returns true for support slow at max level', () => {
    const t = new Troop(healerSpec, 0, 0);
    t.healTargetLevel = CONFIG.MAX_UPGRADE_LEVEL;
    expect(t.isMaxed('slow')).toBe(true);
  });
});

// ─── canUpgrade edge cases ──────────────────────────────────────────────────

describe('canUpgrade edge cases', () => {
  it('canUpgrade("slow") returns true for support troops', () => {
    const t = new Troop(healerSpec, 0, 0);
    expect(t.canUpgrade('slow')).toBe(true);
  });

  it('canUpgrade("slow") returns true for icewiz', () => {
    const t = new Troop(icewizSpec, 0, 0);
    expect(t.canUpgrade('slow')).toBe(true);
  });

  it('canUpgrade("slow") returns false for non-slow troops', () => {
    const t = new Troop(archerSpec, 0, 0);
    expect(t.canUpgrade('slow')).toBe(false);
  });

  it('canUpgrade("hp") returns true for all troops', () => {
    expect(new Troop(archerSpec, 0, 0).canUpgrade('hp')).toBe(true);
    expect(new Troop(healerSpec, 0, 0).canUpgrade('hp')).toBe(true);
    expect(new Troop(swordsmanSpec, 0, 0).canUpgrade('hp')).toBe(true);
  });
});

// ─── getTotalInvested with healGoldSpent ─────────────────────────────────────

describe('getTotalInvested with healGoldSpent', () => {
  it('includes healGoldSpent in total', () => {
    const t = new Troop(archerSpec, 0, 0);
    t.healGoldSpent = 50;
    expect(t.getTotalInvested()).toBe(archerSpec.cost + 50);
  });

  it('includes upgrade costs and healGoldSpent', () => {
    const t = new Troop(archerSpec, 0, 0);
    t.upgradeStat('dmg');
    t.healGoldSpent = 30;
    const upgradeCost = Math.round(archerSpec.cost * Math.pow(CONFIG.UPGRADE_COST_SCALE, 0));
    expect(t.getTotalInvested()).toBe(archerSpec.cost + upgradeCost + 30);
  });
});

// ─── _recomputeStats edge cases ─────────────────────────────────────────────

describe('_recomputeStats edge cases', () => {
  it('slow factor scales with slowLevel', () => {
    const t = new Troop(icewizSpec, 0, 0);
    const baseFactor = t.getSlowFactor();
    t.slowLevel = 3;
    t._recomputeStats();
    const expected = Math.round(
      icewizSpec.slowFactor * Math.pow(CONFIG.SLOW_FACTOR_SCALE_PER_LEVEL, 2) * 1000
    ) / 1000;
    expect(t.getSlowFactor()).toBe(expected);
  });

  it('slow duration scales with slowLevel', () => {
    const t = new Troop(icewizSpec, 0, 0);
    t.slowLevel = 3;
    t._recomputeStats();
    const expected = Math.round(
      icewizSpec.slowDuration * Math.pow(CONFIG.SLOW_DURATION_SCALE_PER_LEVEL, 2) * 10
    ) / 10;
    expect(t.getSlowDuration()).toBe(expected);
  });

  it('shatter bonus scales with slowLevel', () => {
    const t = new Troop(icewizSpec, 0, 0);
    t.slowLevel = 3;
    t._recomputeStats();
    const expected = Math.round(
      icewizSpec.shatterBonus * Math.pow(CONFIG.SHATTER_BONUS_SCALE_PER_LEVEL, 2) * 1000
    ) / 1000;
    expect(t._cachedShatterBonus).toBe(expected);
  });

  it('melee range stays constant regardless of rangeLevel', () => {
    const t = new Troop(swordsmanSpec, 0, 0);
    t.rangeLevel = 5;
    t._recomputeStats();
    expect(t._cachedRange).toBe(swordsmanSpec.range);
  });
});
