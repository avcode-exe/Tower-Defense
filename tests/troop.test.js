import { describe, it, expect } from 'vitest';
import { Troop } from '../src/troop.js';
import { CONFIG, TROOP_SPECS } from '../src/config.js';

const archerSpec = TROOP_SPECS.find((s) => s.id === 'archer');
const swordsmanSpec = TROOP_SPECS.find((s) => s.id === 'swordsman');
const lightningSpec = TROOP_SPECS.find((s) => s.id === 'lightning');
const healerSpec = TROOP_SPECS.find((s) => s.id === 'healer');
const knightSpec = TROOP_SPECS.find((s) => s.id === 'knight');
const icewizSpec = TROOP_SPECS.find((s) => s.id === 'icewiz');

// ---------- 1. Constructor ----------
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

// ---------- 2. Stat scaling (_recomputeStats) ----------
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

// ---------- 3. Upgrade costs ----------
describe('Upgrade costs', () => {
  it('getUpgradeCost("dmg") returns correct exponential cost', () => {
    const t = new Troop(archerSpec, 0, 0);
    // level 1 → base cost
    expect(t.getUpgradeCost('dmg')).toBe(Math.round(archerSpec.cost * Math.pow(CONFIG.UPGRADE_COST_SCALE, 0)));
    t.dmgLevel = 3;
    // level 3 → cost * 1.35^2
    expect(t.getUpgradeCost('dmg')).toBe(Math.round(archerSpec.cost * Math.pow(CONFIG.UPGRADE_COST_SCALE, 2)));
  });

  it('getUpgradeCost("range") returns base cost for melee troops (canUpgrade gates visibility)', () => {
    const t = new Troop(swordsmanSpec, 0, 0);
    expect(t.getUpgradeCost('range')).toBe(swordsmanSpec.cost);
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

// ---------- 4. upgradeStat ----------
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

// ---------- 5. isMaxed ----------
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

// ---------- 6. Healing ----------
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

// ---------- 7. Shield ----------
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

// ---------- 8. takeDamage ----------
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

// ---------- 9. getTotalInvested ----------
describe('getTotalInvested', () => {
  it('base cost only at level 1', () => {
    const t = new Troop(archerSpec, 0, 0);
    expect(t.getTotalInvested()).toBe(archerSpec.cost);
  });

  it('includes upgrade costs after upgrading', () => {
    const t = new Troop(archerSpec, 0, 0);
    t.upgradeStat('dmg');
    // total = base + cost for level 1 → 2
    const upgradeCost = Math.round(archerSpec.cost * Math.pow(CONFIG.UPGRADE_COST_SCALE, 0));
    expect(t.getTotalInvested()).toBe(archerSpec.cost + upgradeCost);
  });
});

// ---------- Helper: mock monster for pickTarget tests ----------
function makeMockMonster(gx, gy, progress, alive = true) {
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

function buildTileIndex(monsters, gridSize = CONFIG.GRID_SIZE) {
  const index = new Array(gridSize * gridSize).fill(null);
  for (const m of monsters) {
    const key = m._tileGy * gridSize + m._tileGx;
    if (!index[key]) index[key] = [];
    index[key].push(m);
  }
  return index;
}

// ---------- 10. pickTarget ----------
describe('pickTarget', () => {
  describe('melee troops', () => {
    it('picks nearest alive monster within range (no tileIndex)', () => {
      const t = new Troop(swordsmanSpec, 5, 5); // range=1
      const near = makeMockMonster(6, 5, 0.5); // tileDist=1
      const far = makeMockMonster(8, 5, 0.6); // tileDist=3, out of range
      const result = t.pickTarget([near, far], null);
      expect(result).toBe(near);
    });

    it('returns null when no monster is in range', () => {
      const t = new Troop(swordsmanSpec, 5, 5);
      const far = makeMockMonster(10, 10, 0.5);
      const result = t.pickTarget([far], null);
      expect(result).toBeNull();
    });

    it('skips dead monsters', () => {
      const t = new Troop(swordsmanSpec, 5, 5);
      const dead = makeMockMonster(6, 5, 0.5, false);
      const alive = makeMockMonster(5, 6, 0.5);
      const result = t.pickTarget([dead, alive], null);
      expect(result).toBe(alive);
    });

    it('picks the closest when multiple are in range', () => {
      const t = new Troop(swordsmanSpec, 5, 5);
      const m1 = makeMockMonster(6, 5, 0.5); // dist=1
      const m2 = makeMockMonster(5, 6, 0.5); // dist=1
      const m3 = makeMockMonster(4, 5, 0.5); // dist=1
      const result = t.pickTarget([m1, m2, m3], null);
      // All are distance 1; picks first found with dist < bestDist (starts at range+buf+1=2.5)
      expect(result).not.toBeNull();
      expect(result.tileDistanceTo(5, 5)).toBeLessThanOrEqual(1);
    });

    it('uses tileIndex path when provided', () => {
      const t = new Troop(swordsmanSpec, 5, 5);
      const near = makeMockMonster(6, 5, 0.5);
      const far = makeMockMonster(8, 5, 0.6);
      const tileIndex = buildTileIndex([near, far]);
      const result = t.pickTarget([near, far], tileIndex);
      expect(result).toBe(near);
    });

    it('returns null via tileIndex when no monster in range', () => {
      const t = new Troop(swordsmanSpec, 5, 5);
      const far = makeMockMonster(10, 10, 0.5);
      const tileIndex = buildTileIndex([far]);
      const result = t.pickTarget([far], tileIndex);
      expect(result).toBeNull();
    });
  });

  describe('ranged troops', () => {
    it('picks furthest-along-path monster in pixel range (no tileIndex)', () => {
      const t = new Troop(archerSpec, 5, 5); // range=3, tileBuf=0.5, rangePxSq = (3.5*53)^2
      const early = makeMockMonster(6, 5, 0.2);
      const late = makeMockMonster(7, 5, 0.8); // further along path, still in range
      const result = t.pickTarget([early, late], null);
      expect(result).toBe(late);
    });

    it('returns null when no monster is in pixel range', () => {
      const t = new Troop(archerSpec, 5, 5);
      const far = makeMockMonster(15, 15, 0.9);
      const result = t.pickTarget([far], null);
      expect(result).toBeNull();
    });

    it('skips dead monsters', () => {
      const t = new Troop(archerSpec, 5, 5);
      const dead = makeMockMonster(6, 5, 0.8, false);
      const alive = makeMockMonster(6, 5, 0.3);
      const result = t.pickTarget([dead, alive], null);
      expect(result).toBe(alive);
    });

    it('uses tileIndex path when provided', () => {
      const t = new Troop(archerSpec, 5, 5);
      const early = makeMockMonster(6, 5, 0.2);
      const late = makeMockMonster(7, 5, 0.8);
      const tileIndex = buildTileIndex([early, late]);
      const result = t.pickTarget([early, late], tileIndex);
      expect(result).toBe(late);
    });

    it('picks monster with highest progress', () => {
      const t = new Troop(archerSpec, 5, 5);
      const m1 = makeMockMonster(6, 6, 0.1);
      const m2 = makeMockMonster(7, 5, 0.9);
      const m3 = makeMockMonster(6, 4, 0.5);
      const result = t.pickTarget([m1, m2, m3], null);
      expect(result).toBe(m2);
    });
  });
});

// ---------- 11. getHealRangePxSq ----------
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

// ---------- 12. getChain ----------
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

// ---------- 13. getSlowFactor ----------
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

// ---------- 14. getSlowDuration ----------
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

// ---------- 15. getShieldCost ----------
describe('getShieldCost', () => {
  it('returns ceil(spec.cost * SHIELD_COST_RATIO)', () => {
    const t = new Troop(archerSpec, 0, 0);
    expect(t.getShieldCost()).toBe(Math.ceil(archerSpec.cost * CONFIG.SHIELD_COST_RATIO));
  });

  it('returns correct value for knight', () => {
    const t = new Troop(knightSpec, 0, 0);
    expect(t.getShieldCost()).toBe(Math.ceil(knightSpec.cost * CONFIG.SHIELD_COST_RATIO));
  });

  it('returns correct value for swordsman', () => {
    const t = new Troop(swordsmanSpec, 0, 0);
    expect(t.getShieldCost()).toBe(Math.ceil(swordsmanSpec.cost * CONFIG.SHIELD_COST_RATIO));
  });
});

// ---------- 16. getShieldRatio ----------
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

// ---------- 17. hasShield ----------
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

// ---------- 18. getHpPercent ----------
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
    // Use exact fraction: 15/30 = 50%
    t.hp = 15;
    expect(t.getHpPercent()).toBe(50);
  });

  it('returns 0 when maxHp is 0 (edge case)', () => {
    const t = new Troop(archerSpec, 0, 0);
    t.maxHp = 0;
    t.hp = 0;
    expect(t.getHpPercent()).toBe(0);
  });
});

// ---------- 19. getHpRatio ----------
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

  it('returns 0 when maxHp is 0 (edge case)', () => {
    const t = new Troop(archerSpec, 0, 0);
    t.maxHp = 0;
    t.hp = 0;
    expect(t.getHpRatio()).toBe(0);
  });
});

// ---------- 20. update (melee / ranged branch) ----------
describe('update', () => {
  function makeMockGame(monsters = [], tileIndex = null) {
    const damaged = [];
    const createdProjectiles = [];
    return {
      monsters,
      _monsterTileIndex: tileIndex,
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

  describe('melee troops', () => {
    it('acquires target and attacks when cooldown is 0', () => {
      const t = new Troop(swordsmanSpec, 5, 5);
      const monster = makeMockMonster(6, 5, 0.5);
      const game = makeMockGame([monster]);
      t.targetRefresh = 0; // force target refresh

      t.update(0, [monster], [], game);

      expect(t.target).toBe(monster);
      expect(game._damaged.length).toBe(1);
      expect(game._damaged[0].monster).toBe(monster);
      expect(game._damaged[0].dmg).toBe(t._cachedDamage);
    });

    it('does not attack during cooldown', () => {
      const t = new Troop(swordsmanSpec, 5, 5);
      t.cooldown = 1.0; // on cooldown
      const monster = makeMockMonster(6, 5, 0.5);
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
      // Should not throw; just return early
      expect(game._damaged.length).toBe(0);
    });

    it('resets cooldown after attacking', () => {
      const t = new Troop(swordsmanSpec, 5, 5);
      const monster = makeMockMonster(6, 5, 0.5);
      const game = makeMockGame([monster]);
      t.targetRefresh = 0;

      t.update(0, [monster], [], game);

      expect(t.cooldown).toBe(t._cachedAttackSpeed);
    });

    it('decrements cooldown over time', () => {
      const t = new Troop(swordsmanSpec, 5, 5);
      t.cooldown = 1.0;
      t.update(0.3, [], [], null);
      expect(t.cooldown).toBeCloseTo(0.7);
    });

    it('picks new target when targetRefresh expires', () => {
      const t = new Troop(swordsmanSpec, 5, 5);
      const m1 = makeMockMonster(6, 5, 0.3);
      const m2 = makeMockMonster(5, 6, 0.7);
      const game = makeMockGame([m1, m2]);
      t.targetRefresh = 0;

      t.update(0, [m1, m2], [], game);

      expect(t.target).not.toBeNull();
    });

    it('does not attack when target is null', () => {
      const t = new Troop(swordsmanSpec, 5, 5);
      const far = makeMockMonster(15, 15, 0.5);
      const game = makeMockGame([far]);
      t.targetRefresh = 0;

      t.update(0, [far], [], game);

      expect(game._damaged.length).toBe(0);
    });

    it('does not attack when target is dead', () => {
      const t = new Troop(swordsmanSpec, 5, 5);
      const dead = makeMockMonster(6, 5, 0.5, false);
      const game = makeMockGame([]);
      t.target = dead;

      t.update(0, [], [], game);

      expect(game._damaged.length).toBe(0);
    });
  });

  describe('ranged troops', () => {
    it('acquires target and creates projectile when cooldown is 0', () => {
      const t = new Troop(archerSpec, 5, 5);
      const monster = makeMockMonster(7, 5, 0.5);
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
      const monster = makeMockMonster(7, 5, 0.5);
      const game = makeMockGame([monster]);
      t.target = monster;

      t.update(0.1, [monster], [], game);

      expect(game._projectiles.length).toBe(0);
    });

    it('resets cooldown after firing', () => {
      const t = new Troop(archerSpec, 5, 5);
      const monster = makeMockMonster(7, 5, 0.5);
      const game = makeMockGame([monster]);
      t.targetRefresh = 0;

      t.update(0, [monster], [], game);

      expect(t.cooldown).toBe(t._cachedAttackSpeed);
    });

    it('pushes projectile to projectiles array', () => {
      const t = new Troop(archerSpec, 5, 5);
      const monster = makeMockMonster(7, 5, 0.5);
      const game = makeMockGame([monster]);
      const projectiles = [];
      t.targetRefresh = 0;

      t.update(0, [monster], projectiles, game);

      expect(projectiles.length).toBe(1);
    });
  });
});
