import { describe, it, expect } from 'vitest';
import { CONFIG, MONSTER_SPECS, TROOP_SPECS, WAVES, PROJECTILE_STYLES } from '../src/config.js';

describe('CONFIG', () => {
  it('has valid GRID_SIZE', () => {
    expect(CONFIG.GRID_SIZE).toBeGreaterThan(0);
    expect(CONFIG.GRID_SIZE).toBe(16);
  });

  it('has valid TILE_SIZE', () => {
    expect(CONFIG.TILE_SIZE).toBeGreaterThan(0);
  });

  it('has valid economy values', () => {
    expect(CONFIG.STARTING_GOLD).toBeGreaterThan(0);
    expect(CONFIG.MAX_GOLD).toBeGreaterThan(CONFIG.STARTING_GOLD);
    expect(CONFIG.STARTING_LIVES).toBeGreaterThan(0);
  });

  it('has valid FIXED_TIMESTEP', () => {
    expect(CONFIG.FIXED_TIMESTEP).toBeGreaterThan(0);
    expect(CONFIG.FIXED_TIMESTEP).toBeLessThanOrEqual(1);
  });

  it('GAME_SPEEDS is sorted ascending', () => {
    for (let i = 1; i < CONFIG.GAME_SPEEDS.length; i++) {
      expect(CONFIG.GAME_SPEEDS[i]).toBeGreaterThan(CONFIG.GAME_SPEEDS[i - 1]);
    }
  });

  it('COLORS has required keys', () => {
    expect(CONFIG.COLORS).toHaveProperty('background');
    expect(CONFIG.COLORS).toHaveProperty('gold');
    expect(CONFIG.COLORS).toHaveProperty('heart');
    expect(CONFIG.COLORS).toHaveProperty('hpBarBg');
    expect(CONFIG.COLORS).toHaveProperty('hpBarFill');
  });
});

describe('MONSTER_SPECS', () => {
  const levels = [1, 2, 3, 4, 5, 'B', 'S', 'X'];

  it('has all required levels', () => {
    for (const level of levels) {
      expect(MONSTER_SPECS).toHaveProperty(String(level));
    }
  });

  it('each spec has required fields', () => {
    for (const level of levels) {
      const spec = MONSTER_SPECS[level];
      expect(spec).toHaveProperty('name');
      expect(spec).toHaveProperty('hp');
      expect(spec).toHaveProperty('speed');
      expect(spec).toHaveProperty('reward');
      expect(spec).toHaveProperty('leak');
      expect(spec).toHaveProperty('color');
      expect(spec).toHaveProperty('size');
      expect(spec).toHaveProperty('damage');
      expect(spec).toHaveProperty('attackSpeed');
      expect(spec).toHaveProperty('attackMode');
      expect(spec.hp).toBeGreaterThan(0);
      expect(spec.speed).toBeGreaterThan(0);
      expect(spec.reward).toBeGreaterThan(0);
    }
  });

  it('boss has higher HP than grunt', () => {
    expect(MONSTER_SPECS['B'].hp).toBeGreaterThan(MONSTER_SPECS[1].hp);
  });
});

describe('TROOP_SPECS', () => {
  it('is a non-empty array', () => {
    expect(Array.isArray(TROOP_SPECS)).toBe(true);
    expect(TROOP_SPECS.length).toBeGreaterThan(0);
  });

  it('each spec has required fields', () => {
    for (const spec of TROOP_SPECS) {
      expect(spec).toHaveProperty('id');
      expect(spec).toHaveProperty('name');
      expect(spec).toHaveProperty('cost');
      expect(spec).toHaveProperty('hp');
      expect(spec).toHaveProperty('damage');
      expect(spec).toHaveProperty('color');
      expect(spec.cost).toBeGreaterThan(0);
      expect(spec.hp).toBeGreaterThan(0);
    }
  });

  it('has unique ids', () => {
    const ids = TROOP_SPECS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('has a healer troop with support type', () => {
    const healer = TROOP_SPECS.find((s) => s.id === 'healer');
    expect(healer).toBeDefined();
    expect(healer.type).toBe('support');
    expect(healer.damage).toBeGreaterThan(0);
    expect(healer.range).toBeGreaterThan(0);
    expect(healer.attackSpeed).toBeGreaterThan(0);
    expect(healer.hp).toBeGreaterThan(0);
    expect(healer.cost).toBeGreaterThan(0);
  });

  it('healer has unique color', () => {
    const healer = TROOP_SPECS.find((s) => s.id === 'healer');
    const colors = TROOP_SPECS.map((s) => s.color);
    expect(colors.filter((c) => c === healer.color).length).toBe(1);
  });

  it('healer has a stats string', () => {
    const healer = TROOP_SPECS.find((s) => s.id === 'healer');
    expect(healer._statsStr).toBeDefined();
    expect(healer._statsStr).toContain('heal');
    expect(healer._statsStr).toContain('Support');
  });
});

describe('WAVES', () => {
  it('is a non-empty array', () => {
    expect(Array.isArray(WAVES)).toBe(true);
    expect(WAVES.length).toBeGreaterThan(0);
  });

  it('first wave has spawns', () => {
    expect(WAVES[0].length).toBeGreaterThan(0);
  });

  it('all wave entries reference valid monster keys', () => {
    const validKeys = new Set(['1', '2', '3', '4', '5', 'B', 'S', 'X']);
    for (const wave of WAVES) {
      for (const [key, count] of wave) {
        expect(validKeys.has(String(key))).toBe(true);
        expect(count).toBeGreaterThan(0);
      }
    }
  });
});

describe('PROJECTILE_STYLES', () => {
  it('is a non-empty object', () => {
    expect(typeof PROJECTILE_STYLES).toBe('object');
    expect(Object.keys(PROJECTILE_STYLES).length).toBeGreaterThan(0);
  });

  it('each style has required fields', () => {
    for (const [id, style] of Object.entries(PROJECTILE_STYLES)) {
      expect(style).toHaveProperty('color');
      expect(style).toHaveProperty('size');
      expect(style).toHaveProperty('speed');
      expect(style).toHaveProperty('kind');
    }
  });
});
