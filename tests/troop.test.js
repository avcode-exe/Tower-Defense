import { describe, it, expect, vi } from 'vitest';
import { Troop } from '../src/troop.js';
import { Monster } from '../src/monster.js';
import { CONFIG, TROOP_SPECS } from '../src/config.js';
import { PARTICLES } from '../src/particles.js';

const archerSpec = TROOP_SPECS.find((s) => s.id === 'archer');
const swordsmanSpec = TROOP_SPECS.find((s) => s.id === 'swordsman');
const flameSpec = TROOP_SPECS.find((s) => s.id === 'flame');
const healerSpec = TROOP_SPECS.find((s) => s.id === 'healer');
const knightSpec = TROOP_SPECS.find((s) => s.id === 'knight');
const icewizSpec = TROOP_SPECS.find((s) => s.id === 'icewiz');
const lightningSpec = TROOP_SPECS.find((s) => s.id === 'lightning');

// ─── Shared helpers ────────────────────────────────────────────────────────

function sharedPath() {
  return { segments: [], totalLength: 0 };
}

function makeMonsterAt(level, gx, gy) {
  const monster = new Monster(level, [[gx, gy]], sharedPath());
  monster.hp = 100;
  monster.maxHp = 100;
  return monster;
}

function makeGame(troops, monsters = []) {
  return {
    troops,
    monsters,
    damageCalls: [],
    damageMonster(m, amount) {
      this.damageCalls.push({ monster: m, amount });
      m.hp -= amount;
      if (m.hp <= 0) m.alive = false;
    },
    gold: 123,
    popups: [],
    _getPopup(text, x, y, t, color) {
      this.popups.push({ text, x, y, t, color });
    },
  };
}

function makeMockMonster(gx, gy, alive = true) {
  return {
    alive,
    gx,
    gy,
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

function buildTileIndex(troops) {
  const gs = CONFIG.GRID_SIZE;
  const idx = new Array(gs * gs).fill(null);
  for (const t of troops) {
    const key = t.gy * gs + t.gx;
    if (!idx[key]) idx[key] = [];
    idx[key].push(t);
  }
  return idx;
}

function makeMockTarget(gx, gy, progress, alive = true) {
  return {
    alive,
    x: gx * CONFIG.TILE_SIZE + CONFIG.TILE_SIZE / 2,
    y: gy * CONFIG.TILE_SIZE + CONFIG.TILE_SIZE / 2,
    hp: 50,
    maxHp: 50,
    progress,
    _tileGx: gx,
    _tileGy: gy,
    tileDistanceTo(tx, ty) {
      return Math.max(Math.abs(this._tileGx - tx), Math.abs(this._tileGy - ty));
    },
  };
}

function buildTargetIndex(monsters, gridSize = CONFIG.GRID_SIZE) {
  const index = new Array(gridSize * gridSize).fill(null);
  for (const m of monsters) {
    const key = m._tileGy * gridSize + m._tileGx;
    if (!index[key]) index[key] = [];
    index[key].push(m);
  }
  return index;
}

// ─── Constructor ────────────────────────────────────────────────────────────

describe('Constructor', () => {
  it('caches spec stats at level 1 (damage, range, attackSpeed)', () => {
    const t = new Troop(archerSpec, 2, 3);
    expect(t._cachedDamage).toBe(archerSpec.damage);
    expect(t._cachedRange).toBe(archerSpec.range);
    expect(t._cachedAttackSpeed).toBe(archerSpec.attackSpeed);
  });

  it('computes position from gx, gy and TILE_SIZE', () => {
    const gx = 5,
      gy = 7;
    const t = new Troop(archerSpec, gx, gy);
    expect(t.x).toBe(gx * CONFIG.TILE_SIZE + CONFIG.TILE_SIZE / 2);
    expect(t.y).toBe(gy * CONFIG.TILE_SIZE + CONFIG.TILE_SIZE / 2);
    expect(t.gx).toBe(gx);
    expect(t.gy).toBe(gy);
  });

  it('starts alive with hp equal to spec hp', () => {
    const t = new Troop(archerSpec, 0, 0);
    expect(t.alive).toBe(true);
    expect(t.hp).toBe(archerSpec.hp);
    expect(t.maxHp).toBe(archerSpec.hp);
  });

  it('healer has healTargetLevel=1', () => {
    const t = new Troop(healerSpec, 0, 0);
    expect(t.healTargetLevel).toBe(1);
  });
});

// ─── Stat scaling (_recomputeStats) ────────────────────────────────────────

describe('Stat scaling (_recomputeStats)', () => {
  it('damage scales by DAMAGE_SCALE_PER_LEVEL per level', () => {
    const t = new Troop(archerSpec, 0, 0);
    t.dmgLevel = 3;
    t._recomputeStats();
    const expected = Math.round(archerSpec.damage * Math.pow(CONFIG.DAMAGE_SCALE_PER_LEVEL, 2));
    expect(t._cachedDamage).toBe(expected);
  });

  it('ranged range increases by 1 per level; melee stays at 1', () => {
    const ranged = new Troop(archerSpec, 0, 0);
    ranged.rangeLevel = 4;
    ranged._recomputeStats();
    expect(ranged._cachedRange).toBe(archerSpec.range + 3);

    const melee = new Troop(swordsmanSpec, 0, 0);
    melee.rangeLevel = 4;
    melee._recomputeStats();
    expect(melee._cachedRange).toBe(swordsmanSpec.range);
  });

  it('attack speed scales by SPEED_SCALE_PER_LEVEL per level', () => {
    const t = new Troop(archerSpec, 0, 0);
    t.speedLevel = 3;
    t._recomputeStats();
    const expected = Math.round(archerSpec.attackSpeed * Math.pow(CONFIG.SPEED_SCALE_PER_LEVEL, 2) * 100) / 100;
    expect(t._cachedAttackSpeed).toBe(expected);
  });

  it('chain count increases by 1 per level (Lightning)', () => {
    const t = new Troop(lightningSpec, 0, 0);
    expect(t._cachedChain).toBe(lightningSpec.chain);
    t.chainLevel = 4;
    t._recomputeStats();
    expect(t._cachedChain).toBe(lightningSpec.chain + 3);
  });

  it('HP scales by HP_SCALE_PER_LEVEL per level', () => {
    const t = new Troop(archerSpec, 0, 0);
    t.hpLevel = 2;
    t._recomputeStats();
    const expected = Math.round(archerSpec.hp * Math.pow(CONFIG.HP_SCALE_PER_LEVEL, 1));
    expect(t._cachedMaxHp).toBe(expected);
  });
});

// ─── Upgrade costs ──────────────────────────────────────────────────────────

describe('Upgrade costs', () => {
  it('getUpgradeCost("dmg") returns correct exponential cost', () => {
    const t = new Troop(archerSpec, 0, 0);
    expect(t.getUpgradeCost('dmg')).toBe(Math.round(archerSpec.cost * Math.pow(CONFIG.UPGRADE_COST_SCALE, 0)));
    t.dmgLevel = 3;
    expect(t.getUpgradeCost('dmg')).toBe(Math.round(archerSpec.cost * Math.pow(CONFIG.UPGRADE_COST_SCALE, 2)));
  });

  it('canUpgrade("range") false for melee, true for ranged', () => {
    expect(new Troop(swordsmanSpec, 0, 0).canUpgrade('range')).toBe(false);
    expect(new Troop(archerSpec, 0, 0).canUpgrade('range')).toBe(true);
  });

  it('canUpgrade("chain") false for non-lightning troops', () => {
    expect(new Troop(archerSpec, 0, 0).canUpgrade('chain')).toBe(false);
    expect(new Troop(swordsmanSpec, 0, 0).canUpgrade('chain')).toBe(false);
    expect(new Troop(lightningSpec, 0, 0).canUpgrade('chain')).toBe(true);
  });
});

// ─── upgradeStat ────────────────────────────────────────────────────────────

describe('upgradeStat', () => {
  it('increments dmgLevel and recomputes cached damage', () => {
    const t = new Troop(archerSpec, 0, 0);
    const result = t.upgradeStat('dmg');
    expect(result).toBe(true);
    expect(t.dmgLevel).toBe(2);
    const expected = Math.round(archerSpec.damage * Math.pow(CONFIG.DAMAGE_SCALE_PER_LEVEL, 1));
    expect(t._cachedDamage).toBe(expected);
  });

  it('HP upgrade increases maxHp and heals by the HP delta', () => {
    const t = new Troop(archerSpec, 0, 0);
    t.hp = 10;
    t.upgradeStat('hp');
    const expectedMax = Math.round(archerSpec.hp * Math.pow(CONFIG.HP_SCALE_PER_LEVEL, 1));
    expect(t.maxHp).toBe(expectedMax);
    expect(t.hp).toBe(10 + (expectedMax - archerSpec.hp));
  });

  it('support "slow" upgrade increments healTargetLevel', () => {
    const t = new Troop(healerSpec, 0, 0);
    expect(t.healTargetLevel).toBe(1);
    t.upgradeStat('slow');
    expect(t.healTargetLevel).toBe(2);
  });

  it('returns false when already maxed', () => {
    const t = new Troop(archerSpec, 0, 0);
    t.dmgLevel = CONFIG.MAX_UPGRADE_LEVEL;
    expect(t.upgradeStat('dmg')).toBe(false);
  });
});

// ─── isMaxed ────────────────────────────────────────────────────────────────

describe('isMaxed', () => {
  it('returns true when at maxUpgradeLevel', () => {
    const t = new Troop(archerSpec, 0, 0);
    t.dmgLevel = CONFIG.MAX_UPGRADE_LEVEL;
    expect(t.isMaxed('dmg')).toBe(true);
  });

  it('returns false when below maxUpgradeLevel', () => {
    const t = new Troop(archerSpec, 0, 0);
    expect(t.isMaxed('dmg')).toBe(false);
  });
});

// ─── Healing ────────────────────────────────────────────────────────────────

describe('Healing', () => {
  it('getHealCost returns ceil(cost * TROOP_HEAL_COST_RATIO)', () => {
    const t = new Troop(archerSpec, 0, 0);
    expect(t.getHealCost()).toBe(Math.ceil(archerSpec.cost * CONFIG.TROOP_HEAL_COST_RATIO));
  });

  it('canHeal() true when hp < maxHp, false when at maxHp', () => {
    const t = new Troop(archerSpec, 0, 0);
    expect(t.canHeal()).toBe(false);
    t.hp = 1;
    expect(t.canHeal()).toBe(true);
  });

  it('heal() increases hp by TROOP_HEAL_HP_RATIO of maxHp, capped at maxHp', () => {
    const t = new Troop(archerSpec, 0, 0);
    const maxHp = t.maxHp;
    t.hp = 1;
    t.heal();
    const healAmount = Math.ceil(maxHp * CONFIG.TROOP_HEAL_HP_RATIO);
    expect(t.hp).toBe(Math.min(1 + healAmount, maxHp));
  });
});

// ─── Shield ─────────────────────────────────────────────────────────────────

describe('Shield', () => {
  it('canAddShield() true when no shield, false when has shield', () => {
    const t = new Troop(archerSpec, 0, 0);
    expect(t.canAddShield()).toBe(true);
    t.applyShield();
    expect(t.canAddShield()).toBe(false);
  });

  it('applyShield() sets shield = maxShield = maxHp', () => {
    const t = new Troop(archerSpec, 0, 0);
    t.applyShield();
    expect(t.shield).toBe(t.maxHp);
    expect(t.maxShield).toBe(t.maxHp);
  });

  it('clearShield() resets shield and maxShield to 0', () => {
    const t = new Troop(archerSpec, 0, 0);
    t.applyShield();
    t.clearShield();
    expect(t.shield).toBe(0);
    expect(t.maxShield).toBe(0);
  });
});

// ─── takeDamage ─────────────────────────────────────────────────────────────

describe('takeDamage', () => {
  it('no shield: HP reduced directly', () => {
    const t = new Troop(archerSpec, 0, 0);
    const hpBefore = t.hp;
    t.takeDamage(5);
    expect(t.hp).toBe(hpBefore - 5);
  });

  it('shield absorbs partial damage', () => {
    const t = new Troop(archerSpec, 0, 0);
    t.applyShield();
    const shieldBefore = t.shield;
    t.takeDamage(5);
    expect(t.shield).toBe(shieldBefore - 5);
    expect(t.hp).toBe(archerSpec.hp);
  });

  it('kill: returns true and sets alive=false', () => {
    const t = new Troop(archerSpec, 0, 0);
    const result = t.takeDamage(t.hp + 100);
    expect(result).toBe(true);
    expect(t.alive).toBe(false);
    expect(t.hp).toBe(0);
  });
});

// ─── getTotalInvested ──────────────────────────────────────────────────────

describe('getTotalInvested', () => {
  it('base cost only at level 1', () => {
    const t = new Troop(archerSpec, 0, 0);
    expect(t.getTotalInvested()).toBe(archerSpec.cost);
  });

  it('includes upgrade costs after upgrading', () => {
    const t = new Troop(archerSpec, 0, 0);
    t.upgradeStat('dmg');
    const upgradeCost = Math.round(archerSpec.cost * Math.pow(CONFIG.UPGRADE_COST_SCALE, 0));
    expect(t.getTotalInvested()).toBe(archerSpec.cost + upgradeCost);
  });
});

// ─── pickTarget ─────────────────────────────────────────────────────────────

describe('pickTarget', () => {
  describe('melee troops', () => {
    it('picks nearest alive monster within range (no tileIndex)', () => {
      const t = new Troop(swordsmanSpec, 5, 5);
      const near = makeMockTarget(6, 5, 0.5);
      const far = makeMockTarget(8, 5, 0.6);
      const result = t.pickTarget([near, far], null);
      expect(result).toBe(near);
    });

    it('returns null when no monster is in range', () => {
      const t = new Troop(swordsmanSpec, 5, 5);
      const far = makeMockTarget(10, 10, 0.5);
      const result = t.pickTarget([far], null);
      expect(result).toBeNull();
    });

    it('skips dead monsters', () => {
      const t = new Troop(swordsmanSpec, 5, 5);
      const dead = makeMockTarget(6, 5, 0.5, false);
      const alive = makeMockTarget(5, 6, 0.5);
      const result = t.pickTarget([dead, alive], null);
      expect(result).toBe(alive);
    });

    it('uses tileIndex path when provided', () => {
      const t = new Troop(swordsmanSpec, 5, 5);
      const near = makeMockTarget(6, 5, 0.5);
      const far = makeMockTarget(8, 5, 0.6);
      const tileIndex = buildTargetIndex([near, far]);
      const result = t.pickTarget([near, far], tileIndex);
      expect(result).toBe(near);
    });
  });

  describe('ranged troops', () => {
    it('picks furthest-along-path monster in pixel range (no tileIndex)', () => {
      const t = new Troop(archerSpec, 5, 5);
      const early = makeMockTarget(6, 5, 0.2);
      const late = makeMockTarget(7, 5, 0.8);
      const result = t.pickTarget([early, late], null);
      expect(result).toBe(late);
    });

    it('returns null when no monster is in pixel range', () => {
      const t = new Troop(archerSpec, 5, 5);
      const far = makeMockTarget(15, 15, 0.9);
      const result = t.pickTarget([far], null);
      expect(result).toBeNull();
    });

    it('skips dead monsters', () => {
      const t = new Troop(archerSpec, 5, 5);
      const dead = makeMockTarget(6, 5, 0.8, false);
      const alive = makeMockTarget(6, 5, 0.3);
      const result = t.pickTarget([dead, alive], null);
      expect(result).toBe(alive);
    });

    it('uses tileIndex path when provided', () => {
      const t = new Troop(archerSpec, 5, 5);
      const early = makeMockTarget(6, 5, 0.2);
      const late = makeMockTarget(7, 5, 0.8);
      const tileIndex = buildTargetIndex([early, late]);
      const result = t.pickTarget([early, late], tileIndex);
      expect(result).toBe(late);
    });

    it('picks monster with highest progress', () => {
      const t = new Troop(archerSpec, 5, 5);
      const m1 = makeMockTarget(6, 6, 0.1);
      const m2 = makeMockTarget(7, 5, 0.9);
      const m3 = makeMockTarget(6, 4, 0.5);
      const result = t.pickTarget([m1, m2, m3], null);
      expect(result).toBe(m2);
    });
  });
});

// ─── getHealRangePxSq ──────────────────────────────────────────────────────

describe('getHealRangePxSq', () => {
  it('returns (range + TILE_BUFFER)^2 * TILE_SIZE^2 for a troop', () => {
    const t = new Troop(archerSpec, 0, 0);
    const rangePx = (archerSpec.range + CONFIG.TILE_BUFFER) * CONFIG.TILE_SIZE;
    expect(t.getHealRangePxSq()).toBe(rangePx * rangePx);
  });

  it('returns correct value for healer (support)', () => {
    const t = new Troop(healerSpec, 0, 0);
    const rangePx = (healerSpec.range + CONFIG.TILE_BUFFER) * CONFIG.TILE_SIZE;
    expect(t.getHealRangePxSq()).toBe(rangePx * rangePx);
  });

  it('returns correct value for swordsman (melee)', () => {
    const t = new Troop(swordsmanSpec, 0, 0);
    const rangePx = (swordsmanSpec.range + CONFIG.TILE_BUFFER) * CONFIG.TILE_SIZE;
    expect(t.getHealRangePxSq()).toBe(rangePx * rangePx);
  });
});

// ─── getChain ───────────────────────────────────────────────────────────────

describe('getChain', () => {
  it('returns chain count for lightning troop', () => {
    const t = new Troop(lightningSpec, 0, 0);
    expect(t.getChain()).toBe(lightningSpec.chain);
  });

  it('returns 0 for non-chain troops (archer)', () => {
    const t = new Troop(archerSpec, 0, 0);
    expect(t.getChain()).toBe(0);
  });

  it('returns 0 for swordsman', () => {
    const t = new Troop(swordsmanSpec, 0, 0);
    expect(t.getChain()).toBe(0);
  });

  it('chain increases after upgrade', () => {
    const t = new Troop(lightningSpec, 0, 0);
    const before = t.getChain();
    t.chainLevel = 3;
    t._recomputeStats();
    expect(t.getChain()).toBe(before + 2);
  });
});

// ─── getSlowFactor ──────────────────────────────────────────────────────────

describe('getSlowFactor', () => {
  it('returns spec slowFactor for icewiz', () => {
    const t = new Troop(icewizSpec, 0, 0);
    expect(t.getSlowFactor()).toBe(icewizSpec.slowFactor);
  });

  it('returns 1 for troops without slowFactor', () => {
    const t = new Troop(archerSpec, 0, 0);
    expect(t.getSlowFactor()).toBe(1);
  });

  it('returns 1 for swordsman', () => {
    const t = new Troop(swordsmanSpec, 0, 0);
    expect(t.getSlowFactor()).toBe(1);
  });
});

// ─── getSlowDuration ───────────────────────────────────────────────────────

describe('getSlowDuration', () => {
  it('returns spec slowDuration for icewiz', () => {
    const t = new Troop(icewizSpec, 0, 0);
    expect(t.getSlowDuration()).toBe(icewizSpec.slowDuration);
  });

  it('returns 0 for troops without slowDuration', () => {
    const t = new Troop(archerSpec, 0, 0);
    expect(t.getSlowDuration()).toBe(0);
  });

  it('returns 0 for swordsman', () => {
    const t = new Troop(swordsmanSpec, 0, 0);
    expect(t.getSlowDuration()).toBe(0);
  });
});

// ─── getShieldCost ──────────────────────────────────────────────────────────

describe('getShieldCost', () => {
  it('returns ceil(spec.cost * SHIELD_COST_RATIO)', () => {
    const t = new Troop(archerSpec, 0, 0);
    expect(t.getShieldCost()).toBe(Math.ceil(archerSpec.cost * CONFIG.SHIELD_COST_RATIO));
  });

  it('returns correct value for knight', () => {
    const t = new Troop(knightSpec, 0, 0);
    expect(t.getShieldCost()).toBe(Math.ceil(knightSpec.cost * CONFIG.SHIELD_COST_RATIO));
  });
});

// ─── getShieldRatio ─────────────────────────────────────────────────────────

describe('getShieldRatio', () => {
  it('returns 0 when no shield', () => {
    const t = new Troop(archerSpec, 0, 0);
    expect(t.getShieldRatio()).toBe(0);
  });

  it('returns 1 when shield is full', () => {
    const t = new Troop(archerSpec, 0, 0);
    t.applyShield();
    expect(t.getShieldRatio()).toBe(1);
  });

  it('returns partial ratio when shield is partially depleted', () => {
    const t = new Troop(archerSpec, 0, 0);
    t.applyShield();
    t.shield = t.maxShield * 0.5;
    expect(t.getShieldRatio()).toBeCloseTo(0.5);
  });

  it('returns 0 after shield is cleared', () => {
    const t = new Troop(archerSpec, 0, 0);
    t.applyShield();
    t.clearShield();
    expect(t.getShieldRatio()).toBe(0);
  });
});

// ─── hasShield ──────────────────────────────────────────────────────────────

describe('hasShield', () => {
  it('returns false when no shield', () => {
    const t = new Troop(archerSpec, 0, 0);
    expect(t.hasShield()).toBe(false);
  });

  it('returns true when shield is applied', () => {
    const t = new Troop(archerSpec, 0, 0);
    t.applyShield();
    expect(t.hasShield()).toBe(true);
  });

  it('returns false after shield is fully absorbed by damage', () => {
    const t = new Troop(archerSpec, 0, 0);
    t.applyShield();
    t.takeDamage(t.shield + 1);
    expect(t.hasShield()).toBe(false);
  });
});

// ─── getHpPercent ───────────────────────────────────────────────────────────

describe('getHpPercent', () => {
  it('returns 100 at full health', () => {
    const t = new Troop(archerSpec, 0, 0);
    expect(t.getHpPercent()).toBe(100);
  });

  it('returns 0 at 0 hp', () => {
    const t = new Troop(archerSpec, 0, 0);
    t.hp = 0;
    expect(t.getHpPercent()).toBe(0);
  });

  it('returns correct percentage at partial health', () => {
    const t = new Troop(archerSpec, 0, 0);
    t.hp = 15;
    expect(t.getHpPercent()).toBe(50);
  });
});

// ─── getHpRatio ─────────────────────────────────────────────────────────────

describe('getHpRatio', () => {
  it('returns 1 at full health', () => {
    const t = new Troop(archerSpec, 0, 0);
    expect(t.getHpRatio()).toBe(1);
  });

  it('returns 0 at 0 hp', () => {
    const t = new Troop(archerSpec, 0, 0);
    t.hp = 0;
    expect(t.getHpRatio()).toBe(0);
  });

  it('returns correct ratio at half health', () => {
    const t = new Troop(archerSpec, 0, 0);
    t.hp = Math.round(t.maxHp * 0.5);
    expect(t.getHpRatio()).toBeCloseTo(0.5);
  });
});

// ─── update (melee / ranged branch) ────────────────────────────────────────

describe('update', () => {
  describe('melee troops', () => {
    it('acquires target and attacks when cooldown is 0', () => {
      const t = new Troop(swordsmanSpec, 5, 5);
      const monster = makeMockTarget(6, 5, 0.5);
      const game = makeMockGame([monster]);
      t.targetRefresh = 0;

      t.update(0, [monster], [], game);

      expect(t.target).toBe(monster);
      expect(game._damaged.length).toBe(1);
      expect(game._damaged[0].monster).toBe(monster);
      expect(game._damaged[0].dmg).toBe(t._cachedDamage);
    });

    it('does not attack during cooldown', () => {
      const t = new Troop(swordsmanSpec, 5, 5);
      t.cooldown = 1.0;
      const monster = makeMockTarget(6, 5, 0.5);
      const game = makeMockGame([monster]);
      t.target = monster;

      t.update(0.1, [monster], [], game);

      expect(game._damaged.length).toBe(0);
    });

    it('does nothing when dead', () => {
      const t = new Troop(swordsmanSpec, 5, 5);
      t.alive = false;
      const game = makeMockGame([]);
      t.update(0, [], [], game);
      expect(game._damaged.length).toBe(0);
    });

    it('resets cooldown after attacking', () => {
      const t = new Troop(swordsmanSpec, 5, 5);
      const monster = makeMockTarget(6, 5, 0.5);
      const game = makeMockGame([monster]);
      t.targetRefresh = 0;

      t.update(0, [monster], [], game);

      expect(t.cooldown).toBe(t._cachedAttackSpeed);
    });

    it('applies burn after a successful flame melee hit', () => {
      const t = new Troop(flameSpec, 5, 5);
      const monster = makeMonsterAt(1, 6, 5);
      monster.hp = 100;
      monster.maxHp = 100;
      const game = {
        monsters: [monster],
        _monsterTileIndex: buildTargetIndex([monster]),
        troops: [],
        damageMonster(m, dmg) {
          m.hp -= dmg;
          return false;
        },
        applyBurn(m, troop) {
          this.appliedBurn = { monster: m, troop, stacks: m.burnStacks };
          m.applyBurn(
            1,
            troop.spec.burnDuration,
            troop.spec.burnTickInterval,
            Math.max(1, Math.round(7 * troop.spec.burnDamageRatio))
          );
        },
        _getPopup() {},
      };
      t.targetRefresh = 0;

      t.update(0, [monster], [], game);

      expect(game.appliedBurn.monster).toBe(monster);
      expect(game.appliedBurn.troop).toBe(t);
      expect(monster.burnStacks).toBe(1);
      expect(monster.isBurning()).toBe(true);
    });

    it('does not apply burn when flame melee hit kills the monster', () => {
      const t = new Troop(flameSpec, 5, 5);
      const monster = makeMonsterAt(1, 6, 5);
      monster.hp = 1;
      monster.maxHp = 100;
      const game = {
        monsters: [monster],
        _monsterTileIndex: buildTargetIndex([monster]),
        troops: [],
        damageMonster() {
          monster.alive = false;
          return true;
        },
        applyBurn: vi.fn(),
        _getPopup() {},
      };
      t.targetRefresh = 0;

      t.update(0, [monster], [], game);

      expect(game.applyBurn).not.toHaveBeenCalled();
    });

    it('caps flame burn stacks at the configured max', () => {
      const t = new Troop(flameSpec, 5, 5);
      const monster = makeMonsterAt(1, 6, 5);
      const game = {
        monsters: [monster],
        _monsterTileIndex: buildTargetIndex([monster]),
        troops: [],
        damageMonster() {
          return false;
        },
        applyBurn(m) {
          m.applyBurn(
            1,
            t.spec.burnDuration,
            t.spec.burnTickInterval,
            Math.max(1, Math.round(7 * t.spec.burnDamageRatio))
          );
        },
        _getPopup() {},
      };
      t.targetRefresh = 0;

      for (let i = 0; i < flameSpec.burnStacks + 2; i++) {
        t.cooldown = 0;
        t.update(0, [monster], [], game);
      }

      expect(monster.burnStacks).toBe(flameSpec.burnStacks);
    });

    it('scales flame burn damage with troop damage upgrades', () => {
      const t = new Troop(flameSpec, 5, 5);
      t.upgradeStat('dmg');
      t.upgradeStat('dmg');
      const burnDps =
        (Math.max(1, Math.round(t.getDamage() * flameSpec.burnDamageRatio)) * flameSpec.burnStacks) /
        flameSpec.burnTickInterval;
      expect(burnDps).toBeGreaterThan(
        (Math.max(1, Math.round(flameSpec.damage * flameSpec.burnDamageRatio)) * flameSpec.burnStacks) /
          flameSpec.burnTickInterval
      );
    });

    it('decrements cooldown over time', () => {
      const t = new Troop(swordsmanSpec, 5, 5);
      t.cooldown = 1.0;
      t.update(0.3, [], [], null);
      expect(t.cooldown).toBeCloseTo(0.7);
    });
  });

  describe('ranged troops', () => {
    it('acquires target and creates projectile when cooldown is 0', () => {
      const t = new Troop(archerSpec, 5, 5);
      const monster = makeMockTarget(7, 5, 0.5);
      const game = makeMockGame([monster]);
      t.targetRefresh = 0;

      t.update(0, [monster], [], game);

      expect(t.target).toBe(monster);
      expect(game._projectiles.length).toBe(1);
      expect(game._projectiles[0].target).toBe(monster);
    });

    it('does not create projectile during cooldown', () => {
      const t = new Troop(archerSpec, 5, 5);
      t.cooldown = 1.0;
      const monster = makeMockTarget(7, 5, 0.5);
      const game = makeMockGame([monster]);
      t.target = monster;

      t.update(0.1, [monster], [], game);

      expect(game._projectiles.length).toBe(0);
    });

    it('resets cooldown after firing', () => {
      const t = new Troop(archerSpec, 5, 5);
      const monster = makeMockTarget(7, 5, 0.5);
      const game = makeMockGame([monster]);
      t.targetRefresh = 0;

      t.update(0, [monster], [], game);

      expect(t.cooldown).toBe(t._cachedAttackSpeed);
    });
  });
});

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

// ─── getMonsterDamage ──────────────────────────────────────────────────────

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

// ─── getDps / getHps ───────────────────────────────────────────────────────

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

// ─── getTotalInvested with healGoldSpent ────────────────────────────────────

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
    const expected = Math.round(icewizSpec.slowFactor * Math.pow(CONFIG.SLOW_FACTOR_SCALE_PER_LEVEL, 2) * 1000) / 1000;
    expect(t.getSlowFactor()).toBe(expected);
  });

  it('slow duration scales with slowLevel', () => {
    const t = new Troop(icewizSpec, 0, 0);
    t.slowLevel = 3;
    t._recomputeStats();
    const expected = Math.round(icewizSpec.slowDuration * Math.pow(CONFIG.SLOW_DURATION_SCALE_PER_LEVEL, 2) * 10) / 10;
    expect(t.getSlowDuration()).toBe(expected);
  });

  it('shatter bonus scales with slowLevel', () => {
    const t = new Troop(icewizSpec, 0, 0);
    t.slowLevel = 3;
    t._recomputeStats();
    const expected =
      Math.round(icewizSpec.shatterBonus * Math.pow(CONFIG.SHATTER_BONUS_SCALE_PER_LEVEL, 2) * 1000) / 1000;
    expect(t._cachedShatterBonus).toBe(expected);
  });

  it('melee range stays constant regardless of rangeLevel', () => {
    const t = new Troop(swordsmanSpec, 0, 0);
    t.rangeLevel = 5;
    t._recomputeStats();
    expect(t._cachedRange).toBe(swordsmanSpec.range);
  });
});

// ─── Flame Troop (spec) ───────────────────────────────────────────────────

describe('Flame Troop (spec)', () => {
  it('exists in TROOP_SPECS', () => {
    expect(flameSpec).toBeDefined();
  });

  it('has melee type', () => {
    expect(flameSpec.type).toBe('melee');
  });

  it('has configured burn stats', () => {
    expect(flameSpec.cost).toBe(160);
    expect(flameSpec.hp).toBe(70);
    expect(flameSpec.damage).toBe(14);
    expect(flameSpec.range).toBe(1);
    expect(flameSpec.attackSpeed).toBe(0.75);
    expect(flameSpec.burnStacks).toBe(3);
    expect(flameSpec.burnDuration).toBe(3);
    expect(flameSpec.burnTickInterval).toBe(0.5);
    expect(flameSpec.burnDamageRatio).toBe(0.25);
  });

  it('has a burn stats string', () => {
    expect(flameSpec._statsStr).toContain('burn');
  });
});

// ─── Healer Troop (spec) ────────────────────────────────────────────────────

describe('Healer Troop (spec)', () => {
  it('exists in TROOP_SPECS', () => {
    expect(healerSpec).toBeDefined();
  });

  it('has type support', () => {
    expect(healerSpec.type).toBe('support');
  });

  it('has positive damage (used as heal amount)', () => {
    expect(healerSpec.damage).toBeGreaterThan(0);
  });

  it('has range 2', () => {
    expect(healerSpec.range).toBe(2);
  });

  it('has attack speed 0.5', () => {
    expect(healerSpec.attackSpeed).toBe(0.5);
  });

  it('has monster damage 3', () => {
    expect(healerSpec.monsterDamage).toBe(3);
  });

  it('has positive HP', () => {
    expect(healerSpec.hp).toBeGreaterThan(0);
  });

  it('cost is 140', () => {
    expect(healerSpec.cost).toBe(140);
  });
});

// ─── Healer Troop Behavior ──────────────────────────────────────────────────

describe('Healer Troop Behavior', () => {
  it('can be constructed', () => {
    const healer = new Troop(healerSpec, 5, 5);
    expect(healer).toBeDefined();
    expect(healer.alive).toBe(true);
    expect(healer.spec.id).toBe('healer');
  });

  it('getDamage returns heal amount', () => {
    const healer = new Troop(healerSpec, 5, 5);
    expect(healer.getDamage()).toBe(healerSpec.damage);
  });

  it('getRange returns heal range', () => {
    const healer = new Troop(healerSpec, 5, 5);
    expect(healer.getRange()).toBe(2);
  });

  it('getAttackSpeed returns heal cadence', () => {
    const healer = new Troop(healerSpec, 5, 5);
    expect(healer.getAttackSpeed()).toBe(0.5);
  });

  it('getHealAmount returns cached damage as heal', () => {
    const healer = new Troop(healerSpec, 5, 5);
    expect(healer.getHealAmount()).toBe(healer.getDamage());
  });

  it('pickHealTarget selects the lowest-HP ally over a closer ally', () => {
    const healer = new Troop(healerSpec, 5, 5);
    const closerAlly = new Troop(swordsmanSpec, 6, 5);
    closerAlly.hp = 30;
    const fartherAlly = new Troop(swordsmanSpec, 5, 6);
    fartherAlly.hp = 10;

    const target = healer.pickHealTarget([closerAlly, fartherAlly]);
    expect(target).toBe(fartherAlly);
  });

  it('pickHealTarget selects the lowest HP ratio when absolute HP differs', () => {
    const healer = new Troop(healerSpec, 5, 5);
    const highMaxAlly = new Troop(swordsmanSpec, 6, 5);
    highMaxAlly.maxHp = 200;
    highMaxAlly.hp = 100;
    const lowMaxAlly = new Troop(swordsmanSpec, 5, 6);
    lowMaxAlly.maxHp = 100;
    lowMaxAlly.hp = 50;

    const target = healer.pickHealTarget([highMaxAlly, lowMaxAlly]);
    expect(target).toBe(lowMaxAlly);
  });

  it('pickHealTarget selects multiple lowest-HP allies', () => {
    const healer = new Troop(healerSpec, 5, 5);
    healer.healTargetLevel = 2;
    const closestAlly = new Troop(swordsmanSpec, 6, 5);
    closestAlly.hp = 40;
    const lowestAlly = new Troop(swordsmanSpec, 5, 6);
    lowestAlly.hp = 10;
    const secondLowestAlly = new Troop(swordsmanSpec, 7, 5);
    secondLowestAlly.hp = 30;
    const highestAlly = new Troop(swordsmanSpec, 5, 7);
    highestAlly.hp = 45;

    const target = healer.pickHealTarget([closestAlly, lowestAlly, secondLowestAlly, highestAlly]);

    expect(target).toBe(lowestAlly);
    expect(healer.healTargets).toEqual([lowestAlly, secondLowestAlly]);
  });

  it('pickHealTarget excludes self', () => {
    const healer = new Troop(healerSpec, 5, 5);
    healer.hp = 10;
    const ally = new Troop(swordsmanSpec, 6, 5);
    ally.hp = 30;

    const target = healer.pickHealTarget([healer, ally]);
    expect(target).toBe(ally);
  });

  it('pickHealTarget skips other support troops', () => {
    const healer = new Troop(healerSpec, 5, 5);
    const allyHealer = new Troop(healerSpec, 5, 6);
    allyHealer.hp = 10;
    const ally = new Troop(swordsmanSpec, 6, 5);
    ally.hp = 30;

    const target = healer.pickHealTarget([allyHealer, ally]);
    expect(target).toBe(ally);
  });

  it('pickHealTarget returns null for non-support type', () => {
    const swordsman = new Troop(swordsmanSpec, 5, 5);
    const ally = new Troop(swordsmanSpec, 6, 5);
    ally.hp = 10;

    const target = swordsman.pickHealTarget([ally]);
    expect(target).toBeNull();
  });

  it('pickHealTarget returns null when no allies in range', () => {
    const healer = new Troop(healerSpec, 0, 0);
    const farAlly = new Troop(swordsmanSpec, 15, 15);
    farAlly.hp = 10;

    const target = healer.pickHealTarget([farAlly]);
    expect(target).toBeNull();
  });

  it('pickHealTarget skips dead allies', () => {
    const healer = new Troop(healerSpec, 5, 5);
    const deadAlly = new Troop(swordsmanSpec, 5, 6);
    deadAlly.alive = false;
    deadAlly.hp = 0;
    const aliveAlly = new Troop(swordsmanSpec, 6, 5);
    aliveAlly.hp = 30;

    const target = healer.pickHealTarget([deadAlly, aliveAlly]);
    expect(target).toBe(aliveAlly);
  });

  it('support healing through update heals without spending gold and spawns particles', () => {
    const healer = new Troop(healerSpec, 5, 5);
    const ally = new Troop(swordsmanSpec, 5, 6);
    ally.hp = 10;
    const game = makeGame([healer, ally]);
    const spawnSpy = vi.spyOn(PARTICLES, 'spawn');

    healer.targetRefresh = 0;
    healer.cooldown = 0;
    healer.update(0.1, [], [], game);

    expect(ally.hp).toBeGreaterThan(10);
    expect(game.gold).toBe(123);
    expect(game.popups[0]).toMatchObject({ text: '+8', color: '#44cc44' });
    expect(ally.healBeam).toEqual({ troop: healer, timer: 0.6 });
    expect(spawnSpy).toHaveBeenCalledWith(ally.x, ally.y, expect.any(Object));
    spawnSpy.mockRestore();
  });

  it('support update damages monsters in heal range on 0.5s cooldown', () => {
    const healer = new Troop(healerSpec, 0, 0);
    const near1 = makeMonsterAt(1, 1, 0);
    const near2 = makeMonsterAt(1, 0, 1);
    const far = makeMonsterAt(1, 3, 0);
    const game = makeGame([healer], [near1, near2, far]);

    healer.targetRefresh = 0;
    healer.cooldown = 0;
    healer.update(0.016, [], [], game);

    expect(game.damageCalls.filter((call) => call.monster === near1)).toHaveLength(1);
    expect(game.damageCalls.filter((call) => call.monster === near2)).toHaveLength(1);
    expect(game.damageCalls.filter((call) => call.monster === far)).toHaveLength(0);
    expect(game.damageCalls.every((call) => call.amount === healer.getMonsterDamage())).toBe(true);
    expect(healer.cooldown).toBe(0.5);

    const callsAfterFirstUpdate = game.damageCalls.length;
    healer.update(0.49, [], [], game);
    expect(game.damageCalls).toHaveLength(callsAfterFirstUpdate);

    healer.update(0.011, [], [], game);
    expect(game.damageCalls).toHaveLength(callsAfterFirstUpdate + 2);
  });

  it('support update skips self and other support heal targets without spending gold', () => {
    const healer = new Troop(healerSpec, 5, 5);
    const allyHealer = new Troop(healerSpec, 5, 6);
    allyHealer.hp = 10;
    const game = makeGame([healer, allyHealer]);

    healer.hp = 10;
    healer.healTargets.push(healer, allyHealer);
    healer.targetRefresh = 0;
    healer.cooldown = 0;
    healer.update(0.1, [], [], game);

    expect(healer.hp).toBe(10);
    expect(allyHealer.hp).toBe(10);
    expect(game.gold).toBe(123);
    expect(game.popups).toHaveLength(0);
  });

  it('healer can be manually healed', () => {
    const healer = new Troop(healerSpec, 5, 5);
    const maxHp = healer.maxHp;
    const cost = healer.getHealCost();
    healer.hp = 10;

    expect(healer.canHeal()).toBe(true);
    expect(cost).toBe(Math.ceil(healerSpec.cost * CONFIG.TROOP_HEAL_COST_RATIO));
    expect(healer.heal()).toBe(true);
    expect(healer.hp).toBeGreaterThan(10);
    expect(healer.hp).toBeLessThanOrEqual(maxHp);
  });

  it('healer can be upgraded for damage (heal amount)', () => {
    const healer = new Troop(healerSpec, 5, 5);
    const baseHeal = healer.getDamage();
    healer.upgradeStat('dmg');
    expect(healer.getDamage()).toBeGreaterThan(baseHeal);
  });

  it('healer can be upgraded for range', () => {
    const healer = new Troop(healerSpec, 5, 5);
    const baseRange = healer.getRange();
    healer.upgradeStat('range');
    expect(healer.getRange()).toBeGreaterThan(baseRange);
  });

  it('healer can be upgraded for speed', () => {
    const healer = new Troop(healerSpec, 5, 5);
    const baseSpeed = healer.getAttackSpeed();
    healer.upgradeStat('speed');
    expect(healer.getAttackSpeed()).toBeLessThan(baseSpeed);
  });

  it('healer has target count upgrade (repurposed slow)', () => {
    const healer = new Troop(healerSpec, 5, 5);
    expect(healer.canUpgrade('slow')).toBe(true);
    expect(healer.getHealTargetCount()).toBe(1);
    healer.upgradeStat('slow');
    expect(healer.getHealTargetCount()).toBe(2);
  });

  it('healer target upgrades use the same cost curve', () => {
    const healer = new Troop(healerSpec, 5, 5);
    expect(healer.getUpgradeCost('slow')).toBe(Math.round(healerSpec.cost));
    healer.upgradeStat('slow');
    expect(healer.getUpgradeCost('slow')).toBe(Math.round(healerSpec.cost * 1.35));
  });

  it('includes healer target upgrades in total invested value', () => {
    const healer = new Troop(healerSpec, 5, 5);
    const before = healer.getTotalInvested();
    healer.upgradeStat('slow');
    expect(healer.getTotalInvested()).toBe(before + healerSpec.cost);
  });
});
