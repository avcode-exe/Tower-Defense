import { describe, it, expect } from 'vitest';
import { Troop } from '../src/troop.js';
import { CONFIG, TROOP_SPECS } from '../src/config.js';

const archerSpec = TROOP_SPECS.find(s => s.id === 'archer');
const swordsmanSpec = TROOP_SPECS.find(s => s.id === 'swordsman');
const lightningSpec = TROOP_SPECS.find(s => s.id === 'lightning');
const healerSpec = TROOP_SPECS.find(s => s.id === 'healer');
const knightSpec = TROOP_SPECS.find(s => s.id === 'knight');
const icewizSpec = TROOP_SPECS.find(s => s.id === 'icewiz');

// ---------- 1. Constructor ----------
describe('Constructor', () => {
  it('caches spec stats at level 1 (damage, range, attackSpeed)', () => {
    const t = new Troop(archerSpec, 2, 3);
    expect(t._cachedDamage).toBe(archerSpec.damage);
    expect(t._cachedRange).toBe(archerSpec.range);
    expect(t._cachedAttackSpeed).toBe(archerSpec.attackSpeed);
  });

  it('computes position from gx, gy and TILE_SIZE', () => {
    const gx = 5, gy = 7;
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
