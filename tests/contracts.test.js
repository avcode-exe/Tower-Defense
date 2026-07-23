/* tripwire inventory:
 *  - (known limitation: no TypeScript) — all type audits are runtime contracts
 */

import { describe, it, expect } from 'vitest';

describe('export shape contracts', () => {
  it('game.js exports exactly { Game }', async () => {
    const mod = await import('../src/game.js');
    expect(Object.keys(mod).sort()).toEqual(['Game']);
    expect(typeof mod.Game).toBe('function');
  });

  it('grid.js exports exactly { Grid, TILE }', async () => {
    const mod = await import('../src/grid.js');
    expect(Object.keys(mod).sort()).toEqual(['Grid', 'TILE']);
  });

  it('monster.js exports exactly { Monster }', async () => {
    const mod = await import('../src/monster.js');
    expect(Object.keys(mod).sort()).toEqual(['Monster']);
  });

  it('troop.js exports exactly { Troop }', async () => {
    const mod = await import('../src/troop.js');
    expect(Object.keys(mod).sort()).toEqual(['Troop']);
  });

  it('projectile.js exports exactly { Projectile }', async () => {
    const mod = await import('../src/projectile.js');
    expect(Object.keys(mod).sort()).toEqual(['Projectile']);
  });

  it('config.js exports CONFIG, LAYOUT, LAYOUT_ZOOM, MONSTER_SPECS, TROOP_SPECS, WAVES, PROJECTILE_STYLES, MONSTER_DEV_ORDER', async () => {
    const mod = await import('../src/config.js');
    expect(Object.keys(mod).sort()).toEqual([
      'CONFIG',
      'LAYOUT',
      'LAYOUT_ZOOM',
      'MONSTER_DEV_ORDER',
      'MONSTER_SPECS',
      'PROJECTILE_STYLES',
      'TROOP_SPECS',
      'WAVES',
    ]);
  });

  it('utils.js exports functions', async () => {
    const mod = await import('../src/utils.js');
    expect(mod).toHaveProperty('clamp');
    expect(mod).toHaveProperty('lerp');
    expect(mod).toHaveProperty('dist');
    expect(mod).toHaveProperty('makeRNG');
    expect(mod).toHaveProperty('shuffleInPlace');
    expect(mod).toHaveProperty('pixelToTile');
    expect(mod).toHaveProperty('tileCenterInto');
    expect(mod).toHaveProperty('inBounds');
  });
});

describe('wrong-type input contract', () => {
  it('clamp handles null gracefully', async () => {
    const { clamp } = await import('../src/utils.js');
    expect(() => clamp(null, 0, 10)).not.toThrow();
  });

  it('lerp handles NaN', async () => {
    const { lerp } = await import('../src/utils.js');
    const result = lerp(NaN, 10, 0.5);
    expect(Number.isNaN(result)).toBe(true);
  });

  it('dist handles negative values', async () => {
    const { dist } = await import('../src/utils.js');
    expect(dist(-1, -1, 2, 3)).toBe(5);
  });

  it('inBounds handles non-integer', async () => {
    const { inBounds } = await import('../src/utils.js');
    expect(inBounds(1.5, 2.5)).toBe(true);
    expect(inBounds(-0.5, 0)).toBe(false);
  });
});

describe('config type audit (contract)', () => {
  it('every PROJECTILE_STYLES.kind is in [arrow, bolt, orb]', async () => {
    const { PROJECTILE_STYLES } = await import('../src/config.js');
    for (const style of Object.values(PROJECTILE_STYLES)) {
      expect(['arrow', 'bolt', 'orb']).toContain(style.kind);
    }
  });

  it('every attackMode is valid', async () => {
    const { MONSTER_SPECS } = await import('../src/config.js');
    for (const spec of Object.values(MONSTER_SPECS)) {
      expect(['stop', 'slow', 'pass', 'support']).toContain(spec.attackMode);
    }
  });

  it('every movementSpeed is a key of MOVEMENT_SPEEDS', async () => {
    const { MONSTER_SPECS, CONFIG } = await import('../src/config.js');
    for (const spec of Object.values(MONSTER_SPECS)) {
      expect(CONFIG.MOVEMENT_SPEEDS).toHaveProperty(spec.movementSpeed);
    }
  });
});

describe('save serializer key set contract', () => {
  it('SaveSerializer.fromGame output has frozen key set', async () => {
    const { SaveSerializer } = await import('../src/gamePersistence.js');
    const game = {
      gold: 100,
      lives: 20,
      seed: 1,
      speed: 1,
      devMode: false,
      devMonsterCounts: {},
      wave: { currentWave: 0 },
      troops: [],
      appVersion: '1.6.0',
    };
    const data = SaveSerializer.fromGame(game, '1.6.0');
    expect(Object.keys(data).sort()).toEqual([
      'devMode',
      'devMonsterCounts',
      'gold',
      'lives',
      'seed',
      'speed',
      'troops',
      'version',
      'wave',
    ]);
  });
});
