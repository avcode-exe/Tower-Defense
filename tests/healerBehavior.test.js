import { describe, it, expect } from 'vitest';
import { TROOP_SPECS } from '../src/config.js';
import { Troop } from '../src/troop.js';

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
    expect(healer.getRange()).toBe(healerSpec.range);
  });

  it('getAttackSpeed returns heal cadence', () => {
    const healer = new Troop(healerSpec, 5, 5);
    expect(healer.getAttackSpeed()).toBe(healerSpec.attackSpeed);
  });

  it('getHealAmount returns cached damage as heal', () => {
    const healer = new Troop(healerSpec, 5, 5);
    expect(healer.getHealAmount()).toBe(healer.getDamage());
  });

  it('pickHealTarget locks onto first damaged ally in range', () => {
    const healer = new Troop(healerSpec, 5, 5);
    const ally1 = new Troop(swordsmanSpec, 5, 6);
    ally1.hp = 30;
    const ally2 = new Troop(swordsmanSpec, 6, 5);
    ally2.hp = 10;
    const ally3 = new Troop(swordsmanSpec, 5, 7);
    ally3.hp = 50;

    const target = healer.pickHealTarget([ally1, ally2, ally3]);
    expect(target).toBe(ally1);
  });

  it('pickHealTarget excludes self', () => {
    const healer = new Troop(healerSpec, 5, 5);
    healer.hp = 10;
    const ally = new Troop(swordsmanSpec, 6, 5);
    ally.hp = 30;

    const target = healer.pickHealTarget([healer, ally]);
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
});
