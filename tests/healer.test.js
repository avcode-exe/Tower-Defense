import { describe, it, expect } from 'vitest';
import { TROOP_SPECS } from '../src/config.js';

describe('Healer Troop', () => {
  const healerSpec = TROOP_SPECS.find((s) => s.id === 'healer');

  it('exists in TROOP_SPECS', () => {
    expect(healerSpec).toBeDefined();
  });

  it('has type support', () => {
    expect(healerSpec.type).toBe('support');
  });

  it('has positive damage (used as heal amount)', () => {
    expect(healerSpec.damage).toBeGreaterThan(0);
  });

  it('has positive range', () => {
    expect(healerSpec.range).toBeGreaterThan(0);
  });

  it('has positive attack speed', () => {
    expect(healerSpec.attackSpeed).toBeGreaterThan(0);
  });

  it('has positive HP', () => {
    expect(healerSpec.hp).toBeGreaterThan(0);
  });

  it('has a description', () => {
    expect(healerSpec.desc).toBeDefined();
    expect(healerSpec.desc.length).toBeGreaterThan(0);
  });

  it('does not have splash damage', () => {
    expect(healerSpec.splash || 0).toBe(0);
  });

  it('does not have chain', () => {
    expect(healerSpec.chain || 0).toBe(0);
  });

  it('does not have slow', () => {
    expect(healerSpec.slowFactor || 0).toBe(0);
  });

  it('cost is between archer and sniper', () => {
    const archer = TROOP_SPECS.find((s) => s.id === 'archer');
    const sniper = TROOP_SPECS.find((s) => s.id === 'sniper');
    expect(healerSpec.cost).toBeGreaterThanOrEqual(archer.cost);
    expect(healerSpec.cost).toBeLessThanOrEqual(sniper.cost);
  });

  it('cost is 140', () => {
    expect(healerSpec.cost).toBe(140);
  });

  it('has a stats string with heal info', () => {
    expect(healerSpec._statsStr).toContain('heal');
    expect(healerSpec._statsStr).toContain('Support');
    expect(healerSpec._statsStr).toContain(String(healerSpec.damage));
    expect(healerSpec._statsStr).toContain(String(healerSpec.range));
  });
});
