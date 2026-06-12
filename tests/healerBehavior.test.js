import { describe, it, expect, vi } from 'vitest';
import { CONFIG, TROOP_SPECS } from '../src/config.js';
import { Monster } from '../src/monster.js';
import { Troop } from '../src/troop.js';
import { PARTICLES } from '../src/particles.js';

describe('Healer Troop Behavior', () => {
  const healerSpec = TROOP_SPECS.find((s) => s.id === 'healer');
  const swordsmanSpec = TROOP_SPECS.find((s) => s.id === 'swordsman');

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

  it('getDps returns cached damage over attack speed', () => {
    const healer = new Troop(healerSpec, 5, 5);
    expect(healer.getDps()).toBe(healerSpec.damage / healerSpec.attackSpeed);
  });

  it('getHps returns cached heal amount over attack speed', () => {
    const healer = new Troop(healerSpec, 5, 5);
    expect(healer.getHps()).toBe(healerSpec.damage / healerSpec.attackSpeed);
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

  it('pickHealTarget selects the lowest-HP ally in range', () => {
    const healer = new Troop(healerSpec, 5, 5);
    const ally1 = new Troop(swordsmanSpec, 5, 6);
    ally1.hp = 30;
    const ally2 = new Troop(swordsmanSpec, 6, 5);
    ally2.hp = 10;
    const ally3 = new Troop(swordsmanSpec, 5, 7);
    ally3.hp = 50;

    const target = healer.pickHealTarget([ally1, ally2, ally3]);
    expect(target).toBe(ally2);
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

  it('pickHealTarget evicts locked support heal targets', () => {
    const healer = new Troop(healerSpec, 5, 5);
    const allyHealer = new Troop(healerSpec, 5, 6);
    allyHealer.hp = 10;
    const ally = new Troop(swordsmanSpec, 6, 5);
    ally.hp = 30;
    healer.hp = 10;
    healer.healTargets.push(healer, allyHealer);

    const target = healer.pickHealTarget([allyHealer, ally]);
    expect(target).toBe(ally);
    expect(healer.healTargets).toEqual([ally]);
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

  it('healer does not have chain upgrade', () => {
    const healer = new Troop(healerSpec, 5, 5);
    expect(healer.canUpgrade('chain')).toBe(false);
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
