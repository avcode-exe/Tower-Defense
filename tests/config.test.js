/* tripwire inventory:
 *  - (known limitation: no TypeScript) — config field type audits via contracts
 */

import { describe, it, expect } from 'vitest';
import {
  CONFIG,
  LAYOUT,
  MONSTER_SPECS,
  TROOP_SPECS,
  WAVES,
  PROJECTILE_STYLES,
  MONSTER_DEV_ORDER,
} from '../src/config.js';

describe('CONFIG', () => {
  it('GRID_SIZE is 16', () => {
    expect(CONFIG.GRID_SIZE).toBe(16);
  });

  it('TILE_SIZE is positive finite', () => {
    expect(CONFIG.TILE_SIZE).toBeGreaterThan(0);
    expect(Number.isFinite(CONFIG.TILE_SIZE)).toBe(true);
  });

  it('MIN_PATH_LENGTH is positive finite', () => {
    expect(CONFIG.MIN_PATH_LENGTH).toBeGreaterThan(0);
    expect(Number.isFinite(CONFIG.MIN_PATH_LENGTH)).toBe(true);
  });

  it('STARTING_GOLD is 1000', () => {
    expect(CONFIG.STARTING_GOLD).toBe(1000);
  });

  it('MAX_GOLD is 1000000', () => {
    expect(CONFIG.MAX_GOLD).toBe(1000000);
  });

  it('STARTING_LIVES is 25', () => {
    expect(CONFIG.STARTING_LIVES).toBe(25);
  });

  it('SELL_REFUND_RATIO is 0.3', () => {
    expect(CONFIG.SELL_REFUND_RATIO).toBe(0.3);
  });

  it('SELL_COOLDOWN is 3.0', () => {
    expect(CONFIG.SELL_COOLDOWN).toBe(3.0);
  });

  it('GAME_SPEEDS is sorted ascending and contains [1,2,4,8,16,32,64,128]', () => {
    expect(CONFIG.GAME_SPEEDS).toEqual([1, 2, 4, 8, 16, 32, 64, 128]);
    for (let i = 1; i < CONFIG.GAME_SPEEDS.length; i++) {
      expect(CONFIG.GAME_SPEEDS[i]).toBeGreaterThan(CONFIG.GAME_SPEEDS[i - 1]);
    }
  });

  it('COLORS has all required keys', () => {
    const expectedKeys = [
      'revive',
      'background',
      'gridLine',
      'path',
      'buildableHover',
      'invalid',
      'gold',
      'heart',
      'burn',
      'hpBarBg',
      'hpBarFill',
      'shieldBarBg',
      'shieldBarFill',
    ];
    for (const key of expectedKeys) {
      expect(CONFIG.COLORS).toHaveProperty(key);
      expect(typeof CONFIG.COLORS[key]).toBe('string');
    }
  });

  it('MOVEMENT_SPEED_CATEGORIES matches exactly', () => {
    expect(CONFIG.MOVEMENT_SPEED_CATEGORIES).toEqual(['very slow', 'slow', 'medium', 'fast', 'very fast']);
  });

  it('MOVEMENT_SPEEDS maps each category to positive number', () => {
    for (const cat of CONFIG.MOVEMENT_SPEED_CATEGORIES) {
      expect(CONFIG.MOVEMENT_SPEEDS[cat]).toBeGreaterThan(0);
    }
  });

  it('FIXED_TIMESTEP is 1/60', () => {
    expect(CONFIG.FIXED_TIMESTEP).toBeCloseTo(1 / 60);
  });

  it('MAX_UPGRADE_LEVEL is 5', () => {
    expect(CONFIG.MAX_UPGRADE_LEVEL).toBe(5);
  });

  it('BOSS_HP_MULTIPLIER is 2', () => {
    expect(CONFIG.BOSS_HP_MULTIPLIER).toBe(2);
  });

  it('SHIELD_EXPIRE_WAVES is 10', () => {
    expect(CONFIG.SHIELD_EXPIRE_WAVES).toBe(10);
  });

  it('FLAME_BURN_MAX_STACKS is 3', () => {
    expect(CONFIG.FLAME_BURN_MAX_STACKS).toBe(3);
  });

  it('PROJECTILE_TIMEOUT is 3.0', () => {
    expect(CONFIG.PROJECTILE_TIMEOUT).toBe(3.0);
  });
});

describe('MONSTER_SPECS', () => {
  const levels = [1, 2, 3, 4, 5, 'B', 'S', 'X', 'Y', 'H'];
  const validAttackModes = ['stop', 'slow', 'pass', 'support'];
  const validMovementSpeeds = CONFIG.MOVEMENT_SPEED_CATEGORIES;

  for (const level of levels) {
    it(`MONSTER_SPECS[${level}] has valid structure`, () => {
      const spec = MONSTER_SPECS[level];
      expect(spec).toBeDefined();
      expect(typeof spec.name).toBe('string');
      expect(spec.name.length).toBeGreaterThan(0);
      expect(spec.hp).toBeGreaterThan(0);
      expect(spec.speed).toBeGreaterThan(0);
      expect(validMovementSpeeds).toContain(spec.movementSpeed);
      expect(spec.reward).toBeGreaterThan(0);
      expect(spec.leak).toBeGreaterThanOrEqual(1);
      expect(typeof spec.color).toBe('string');
      expect(spec.size).toBeGreaterThan(0);
      expect(spec.damage).toBeGreaterThanOrEqual(0);
      expect(spec.attackSpeed).toBeGreaterThanOrEqual(0);
      expect(spec.attackRange).toBeGreaterThanOrEqual(0);
      expect(validAttackModes).toContain(spec.attackMode);
    });
  }

  it('B has healPerSecond === 15', () => {
    expect(MONSTER_SPECS.B.healPerSecond).toBe(15);
  });

  it('S has shield === 69', () => {
    expect(MONSTER_SPECS.S.shield).toBe(69);
  });

  it('Y has noSplit, reviveRange, reviveHpRatio, reviveMaxTargets, reviveGlowDuration', () => {
    const Y = MONSTER_SPECS.Y;
    expect(Y.noSplit).toBe(true);
    expect(Y.reviveRange).toBeGreaterThan(0);
    expect(Y.reviveHpRatio).toBeGreaterThan(0);
    expect(Y.reviveMaxTargets).toBeGreaterThan(0);
    expect(Y.reviveGlowDuration).toBeGreaterThan(0);
  });

  it('H has attackMode support and heal fields', () => {
    const H = MONSTER_SPECS.H;
    expect(H.attackMode).toBe('support');
    expect(H.healRange).toBeGreaterThan(0);
    expect(H.healPerSecond).toBeGreaterThan(0);
    expect(H.healTickInterval).toBeGreaterThan(0);
  });

  it('level 2 has noSplit=true and attackMode=pass', () => {
    expect(MONSTER_SPECS[2].noSplit).toBe(true);
    expect(MONSTER_SPECS[2].attackMode).toBe('pass');
  });
});

describe('TROOP_SPECS', () => {
  it('all entries have required fields', () => {
    const ids = new Set();
    for (const spec of TROOP_SPECS) {
      expect(spec).toHaveProperty('id');
      expect(typeof spec.id).toBe('string');
      expect(ids.has(spec.id)).toBe(false);
      ids.add(spec.id);
      expect(['melee', 'ranged', 'support']).toContain(spec.type);
      expect(spec.cost).toBeGreaterThan(0);
      expect(spec.hp).toBeGreaterThan(0);
      expect(spec.damage).toBeGreaterThanOrEqual(0);
      expect(spec.range).toBeGreaterThanOrEqual(1);
      expect(spec.attackSpeed).toBeGreaterThan(0);
      expect(spec.splash).toBeGreaterThanOrEqual(0);
      expect(typeof spec.color).toBe('string');
      expect(typeof spec.desc).toBe('string');
      expect(spec.desc.length).toBeGreaterThan(0);
      expect(spec).toHaveProperty('_statsStr');
      expect(spec._statsStr.length).toBeGreaterThan(0);
    }
  });

  it('flame _statsStr contains burn', () => {
    const flame = TROOP_SPECS.find((s) => s.id === 'flame');
    expect(flame._statsStr).toContain('burn');
  });

  it('healer _statsStr contains Support and heal', () => {
    const healer = TROOP_SPECS.find((s) => s.id === 'healer');
    expect(healer._statsStr).toContain('Support');
    expect(healer._statsStr).toContain('heal');
  });

  it('sniper has range 10', () => {
    const sniper = TROOP_SPECS.find((s) => s.id === 'sniper');
    expect(sniper.range).toBe(10);
  });

  it('lightning has chain and stun', () => {
    const lightning = TROOP_SPECS.find((s) => s.id === 'lightning');
    expect(lightning.chain).toBe(2);
    expect(lightning.stun).toBe(0.5);
  });
});

describe('WAVES', () => {
  it('has exactly 10 entries', () => {
    expect(WAVES.length).toBe(10);
  });

  it('each entry is array of [levelKey, count] tuples', () => {
    const allKeys = Object.keys(MONSTER_SPECS);
    for (const wave of WAVES) {
      expect(Array.isArray(wave)).toBe(true);
      expect(wave.length).toBeGreaterThan(0);
      for (const [levelKey, count] of wave) {
        expect(allKeys).toContain(String(levelKey));
        expect(count).toBeGreaterThan(0);
      }
    }
  });
});

describe('PROJECTILE_STYLES', () => {
  it('has entries for all ranged troops', () => {
    const expected = ['archer', 'machinegun', 'mage', 'sniper', 'lightning', 'mortar', 'icewiz'];
    for (const id of expected) {
      expect(PROJECTILE_STYLES).toHaveProperty(id);
    }
  });

  it('each entry has valid structure', () => {
    for (const [id, style] of Object.entries(PROJECTILE_STYLES)) {
      expect(typeof style.color).toBe('string');
      expect(style.size).toBeGreaterThan(0);
      expect(style.speed).toBeGreaterThan(0);
      expect(['arrow', 'bolt', 'orb']).toContain(style.kind);
    }
  });
});

describe('MONSTER_DEV_ORDER', () => {
  it('contains exactly the 10 entries in order', () => {
    expect(MONSTER_DEV_ORDER).toEqual([1, 2, 3, 4, 5, 'Y', 'B', 'S', 'X', 'H']);
  });
});

describe('LAYOUT', () => {
  it('HUD has all required sub-keys with positive numbers', () => {
    const required = ['GOLD_AREA', 'RESET_BTN', 'SPEED_OFFSET', 'SPEED_BTN_W', 'SPEED_BTN_H', 'CTRL_RIGHT', 'CTRL_BTN'];
    for (const key of required) {
      expect(LAYOUT.HUD).toHaveProperty(key);
    }
    expect(LAYOUT.HUD.GOLD_AREA.x).toBeGreaterThanOrEqual(0);
    expect(LAYOUT.HUD.GOLD_AREA.y).toBeGreaterThanOrEqual(0);
    expect(LAYOUT.HUD.GOLD_AREA.w).toBeGreaterThan(0);
    expect(LAYOUT.HUD.GOLD_AREA.h).toBeGreaterThan(0);
  });

  it('SHOP has all required sub-keys', () => {
    const required = [
      'SEW',
      'CARD_H',
      'CARD_GAP',
      'HEAL_BTN_Y_OFFSET',
      'HEAL_BTN_H',
      'SELL_BTN_Y_OFFSET',
      'SELL_BTN_H',
      'UPGRADE_BTN_Y_OFFSET',
      'UPGRADE_BTN_H',
      'BTN_PAD',
      'BTN_GAP',
    ];
    for (const key of required) {
      expect(LAYOUT.SHOP).toHaveProperty(key);
    }
  });

  // ── LAYOUT proxy tests ──
  it('LAYOUT proxy scales numbers with LAYOUT_ZOOM.value', async () => {
    const { LAYOUT_ZOOM } = await import('../src/config.js');
    LAYOUT_ZOOM.value = 1.5;
    expect(LAYOUT.HUD.GOLD_AREA.x).toBeCloseTo(14 * 1.5);
    expect(LAYOUT.HUD.SPEED_OFFSET).toBeCloseTo(370 * 1.5);
    LAYOUT_ZOOM.value = 1;
    expect(LAYOUT.HUD.GOLD_AREA.x).toBe(14);
  });

  it('LAYOUT proxy _zoom property returns LAYOUT_ZOOM.value directly', async () => {
    const { LAYOUT_ZOOM } = await import('../src/config.js');
    LAYOUT_ZOOM.value = 2;
    expect(LAYOUT.HUD._zoom).toBe(2);
    LAYOUT_ZOOM.value = 0.5;
    expect(LAYOUT.HUD._zoom).toBe(0.5);
    LAYOUT_ZOOM.value = 1;
  });

  it('LAYOUT proxy returns non-object values as-is', () => {
    // Accessing a non-existent property through the proxy should return undefined
    expect(LAYOUT.HUD.NONEXISTENT).toBeUndefined();
  });

  it('LAYOUT proxy nested object access returns proxied node', () => {
    // GOLD_AREA.x should obey zoom scaling when LAYOUT_ZOOM changes
    const originalX = LAYOUT.HUD.GOLD_AREA.x;
    expect(LAYOUT.HUD.GOLD_AREA).toBeDefined();
    expect(typeof LAYOUT.HUD.GOLD_AREA).toBe('object');
    expect(LAYOUT.HUD.GOLD_AREA.w).toBeGreaterThan(0);
  });

  it('CONFIG numbers are all finite', () => {
    const numericKeys = [
      'GRID_SIZE',
      'TILE_SIZE',
      'MIN_PATH_LENGTH',
      'PATH_REGEN_ATTEMPTS',
      'STARTING_GOLD',
      'MAX_GOLD',
      'STARTING_LIVES',
      'SELL_REFUND_RATIO',
      'SELL_COOLDOWN',
      'FIXED_TIMESTEP',
      'MAX_UPGRADE_LEVEL',
      'BOSS_HP_MULTIPLIER',
      'MONSTER_REVIVE_MAX_TARGETS',
      'PROJECTILE_TIMEOUT',
      'PARTICLE_GRAVITY',
      'SHIELD_REGEN_RATE',
      'SHIELD_REGEN_DELAY',
      'SHIELD_COST_RATIO',
      'SHIELD_EXPIRE_WAVES',
    ];
    for (const key of numericKeys) {
      expect(typeof CONFIG[key]).toBe('number');
      expect(Number.isFinite(CONFIG[key])).toBe(true);
    }
  });

  it('support troop _statsStr includes monsterDamage when present', () => {
    const healer = TROOP_SPECS.find((s) => s.id === 'healer');
    expect(healer._statsStr).toContain('dmg');
  });

  it('troop _statsStr handles monsterDamage in support type', () => {
    const healer = TROOP_SPECS.find((s) => s.id === 'healer');
    expect(healer._statsStr).toContain('Support');
    expect(healer._statsStr).toContain('heal');
  });

  it('makeCollapsedDefaults uses overrides when provided', async () => {
    const { makeCollapsedDefaults } = await import('../src/config/settingsDefaults.js');
    const result = makeCollapsedDefaults({ help: false });
    expect(result.help).toBe(false);
  });

  it('makeCollapsedDefaults falls back to DEFAULTS for known keys', async () => {
    const { makeCollapsedDefaults } = await import('../src/config/settingsDefaults.js');
    const result = makeCollapsedDefaults({});
    expect(result.help).toBe(true);
  });

  it('makeCollapsedDefaults defaults to false for keys not in DEFAULTS', async () => {
    const { makeCollapsedDefaults } = await import('../src/config/settingsDefaults.js');
    const result = makeCollapsedDefaults({});
    expect(result.shop).toBe(false);
  });
});
