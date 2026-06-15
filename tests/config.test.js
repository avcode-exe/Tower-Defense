import { describe, it, expect } from 'vitest';
import { CONFIG, MONSTER_SPECS, TROOP_SPECS, WAVES, PROJECTILE_STYLES, MONSTER_DEV_ORDER } from '../src/config.js';
const EXPECTED_MOVEMENT_SPEED_CATEGORIES = ['very slow', 'slow', 'medium', 'fast', 'very fast'];
const EXPECTED_MOVEMENT_SPEEDS = {
  'very slow': 0.6,
  slow: 0.8,
  medium: 1.0,
  fast: 2.0,
  'very fast': 3.0,
};
const EXPECTED_MONSTER_MOVEMENT_SPEEDS = {
  Grunt: 'medium',
  Runner: 'very fast',
  Brute: 'slow',
  Elite: 'medium',
  Champion: 'slow',
  Boss: 'very slow',
  Shielded: 'medium',
  Spear: 'fast',
  Necromancer: 'slow',
};

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

  it('has movement speed categories', () => {
    expect(CONFIG.MOVEMENT_SPEED_CATEGORIES).toEqual(EXPECTED_MOVEMENT_SPEED_CATEGORIES);
    expect(CONFIG.MOVEMENT_SPEEDS).toEqual(EXPECTED_MOVEMENT_SPEEDS);
  });
});

describe('MONSTER_SPECS', () => {
  const levels = MONSTER_DEV_ORDER;

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
      expect(spec).toHaveProperty('movementSpeed');
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

  it('each spec has a valid movement speed category', () => {
    for (const spec of Object.values(MONSTER_SPECS)) {
      expect(CONFIG.MOVEMENT_SPEED_CATEGORIES).toContain(spec.movementSpeed);
      expect(CONFIG.MOVEMENT_SPEEDS).toHaveProperty(spec.movementSpeed);
    }
  });

  it('monster movement speeds match category mapping', () => {
    for (const spec of Object.values(MONSTER_SPECS)) {
      expect(spec.movementSpeed).toBe(EXPECTED_MONSTER_MOVEMENT_SPEEDS[spec.name]);
      expect(spec.speed).toBe(CONFIG.MOVEMENT_SPEEDS[spec.movementSpeed]);
    }
  });

  it('monster movement speed category mapping is exact', () => {
    const actual = Object.fromEntries(Object.values(MONSTER_SPECS).map((spec) => [spec.name, spec.movementSpeed]));
    expect(actual).toEqual(EXPECTED_MONSTER_MOVEMENT_SPEEDS);
  });

  it('boss has higher HP than grunt', () => {
    expect(MONSTER_SPECS['B'].hp).toBeGreaterThan(MONSTER_SPECS[1].hp);
  });

  it('Runner does not split', () => {
    expect(MONSTER_SPECS[2].noSplit).toBe(true);
  });

  it('has necromancer with noSplit and revive fields', () => {
    const necro = MONSTER_SPECS.Y;
    expect(necro.name).toBe('Necromancer');
    expect(necro.noSplit).toBe(true);
    expect(necro.reviveRange).toBe(2.0);
    expect(necro.reviveHpRatio).toBe(0.5);
    expect(necro.reviveMaxTargets).toBe(4);
    expect(necro.reviveGlowDuration).toBe(1.5);
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
    expect(healer.monsterDamage).toBeGreaterThan(0);
    expect(healer.hp).toBeGreaterThan(0);
    expect(healer.cost).toBeGreaterThan(0);
  });

  it('has a flame troop with burn stats', () => {
    const flame = TROOP_SPECS.find((s) => s.id === 'flame');
    expect(flame).toBeDefined();
    expect(flame.type).toBe('melee');
    expect(flame.cost).toBe(160);
    expect(flame.hp).toBe(70);
    expect(flame.damage).toBe(14);
    expect(flame.range).toBe(1);
    expect(flame.attackSpeed).toBe(0.75);
    expect(flame.burnStacks).toBe(3);
    expect(flame.burnDuration).toBe(3);
    expect(flame.burnTickInterval).toBe(0.5);
    expect(flame.burnDamageRatio).toBe(0.25);
    expect(flame._statsStr).toContain('burn');
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
    const validKeys = new Set(MONSTER_DEV_ORDER.map(String));
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
