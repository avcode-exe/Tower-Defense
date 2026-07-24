/* tripwire inventory:
 *  - (known limitation: particle cap) — _maxPool=300 hardcoded
 *  - (known limitation: no TypeScript) — particle tests lock down pool cap
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CONFIG } from '../src/config.js';

// Particle class tests use vi.importActual to get the real module
describe('Particle', () => {
  let Particle;

  beforeEach(async () => {
    const mod = await vi.importActual('../src/particles.js');
    Particle = mod.Particle;
  });

  it('constructor sets all default values', () => {
    const p = new Particle();
    expect(p.x).toBe(0);
    expect(p.y).toBe(0);
    expect(p.vx).toBe(0);
    expect(p.vy).toBe(0);
    expect(p.life).toBe(0);
    expect(p.maxLife).toBe(1);
    expect(p.color).toBe('#fff');
    expect(p.size).toBe(2);
    expect(p.gravity).toBe(false);
    expect(p.alive).toBe(false);
  });

  it('reset sets all properties', () => {
    const p = new Particle();
    p.reset(10, 20, 1, 2, 3, '#ff0', 5, true);
    expect(p.x).toBe(10);
    expect(p.y).toBe(20);
    expect(p.vx).toBe(1);
    expect(p.vy).toBe(2);
    expect(p.life).toBe(3);
    expect(p.maxLife).toBe(3);
    expect(p.color).toBe('#ff0');
    expect(p.size).toBe(5);
    expect(p.gravity).toBe(true);
    expect(p.alive).toBe(true);
  });

  it('update moves by velocity * dt', () => {
    const p = new Particle();
    p.reset(0, 0, 10, 20, 10, '#fff', 2, false);
    p.update(0.5);
    expect(p.x).toBe(5);
    expect(p.y).toBe(10);
  });

  it('update applies gravity when enabled', () => {
    const p = new Particle();
    p.reset(0, 0, 0, 0, 10, '#fff', 2, true);
    p.update(1);
    expect(p.vy).toBeGreaterThan(0);
  });

  it('update does not apply gravity when disabled', () => {
    const p = new Particle();
    p.reset(0, 0, 0, 10, 10, '#fff', 2, false);
    p.update(1);
    expect(p.vy).toBe(10);
  });

  it('update decrements life and sets alive=false when life<=0', () => {
    const p = new Particle();
    p.reset(0, 0, 0, 0, 0.5, '#fff', 2, false);
    p.update(1);
    expect(p.alive).toBe(false);
  });
});

// PARTICLES tests use the real PARTICLES object
describe('PARTICLES', () => {
  let PARTICLES;

  beforeEach(async () => {
    const mod = await vi.importActual('../src/particles.js');
    PARTICLES = mod.PARTICLES;
    PARTICLES.clear();
  });

  describe('spawn', () => {
    it('creates correct number of particles', () => {
      PARTICLES.spawn(10, 10, {
        count: 5,
        color: '#fff',
        minSize: 1,
        maxSize: 2,
        minSpeed: 10,
        maxSpeed: 20,
        minLife: 0.5,
        maxLife: 1,
        gravity: false,
      });
      expect(PARTICLES._activeCount).toBe(5);
    });

    it('uses explicit config values', () => {
      PARTICLES.spawn(0, 0, { count: 3 });
      expect(PARTICLES._activeCount).toBe(3);
    });

    it('uses default values when config fields are omitted', () => {
      // The || fallback: config.count is undefined → default 5
      PARTICLES.spawn(0, 0, {});
      expect(PARTICLES._activeCount).toBe(5);
      // Verify defaults were applied to the last spawned particle
      const p = PARTICLES._pool[0];
      expect(p.color).toBe('#fff');
      expect(p.size).toBeGreaterThanOrEqual(1);
      expect(p.size).toBeLessThanOrEqual(3);
      // Verify gravity defaults to true (config.gravity !== false when omitted)
      expect(p.gravity).toBe(true);
    });

    it('uses defaults when config fields are falsy (0)', () => {
      // 0 is falsy in JS, so 0 || 1 evaluates to 1
      // But for minLife/maxLife, 0 could be a legit value
      PARTICLES.spawn(0, 0, { count: 3, minSize: 0, maxSize: 0 });
      expect(PARTICLES._activeCount).toBe(3);
      // minSize: 0 is falsy → defaults to 1
      const p = PARTICLES._pool[0];
      expect(p.size).toBeGreaterThanOrEqual(1);
    });

    it('respects _maxPool cap', () => {
      PARTICLES.spawn(0, 0, {
        count: 500,
        minSize: 1,
        maxSize: 2,
        minSpeed: 10,
        maxSpeed: 20,
        minLife: 0.5,
        maxLife: 1,
        gravity: false,
      });
      expect(PARTICLES._activeCount).toBeLessThanOrEqual(300);
    });
  });

  describe('spawnTrail', () => {
    it('adds single particle', () => {
      PARTICLES.spawnTrail(10, 20, '#ff0');
      expect(PARTICLES._activeCount).toBe(1);
    });

    it('particle has no gravity and short life', () => {
      PARTICLES.spawnTrail(10, 20, '#ff0');
      expect(PARTICLES._pool[0].gravity).toBe(false);
      expect(PARTICLES._pool[0].life).toBeLessThanOrEqual(0.25);
    });
  });

  describe('clear', () => {
    it('resets active count, buckets, colors', () => {
      PARTICLES.spawn(0, 0, { count: 10 });
      PARTICLES.clear();
      expect(PARTICLES._activeCount).toBe(0);
      expect(PARTICLES._buckets).toEqual([]);
      expect(PARTICLES._bucketKeys).toEqual([]);
      expect(PARTICLES._colorToIndex).toEqual({});
    });
  });

  describe('update', () => {
    it('dt=0 does not change particles', () => {
      PARTICLES.spawn(0, 0, { count: 5, minLife: 1, maxLife: 1 });
      PARTICLES.update(0);
      expect(PARTICLES._activeCount).toBe(5);
    });

    it('removes dead particles', () => {
      PARTICLES.spawn(0, 0, { count: 3, minLife: 0.1, maxLife: 0.1 });
      PARTICLES.update(1);
      expect(PARTICLES._activeCount).toBe(0);
    });

    it('keeps alive particles', () => {
      PARTICLES.spawn(0, 0, { count: 3, minLife: 5, maxLife: 5 });
      PARTICLES.update(0.1);
      expect(PARTICLES._activeCount).toBe(3);
    });
  });

  describe('draw', () => {
    it('renders particles with correct buckets', () => {
      const ctx = { globalAlpha: 1, fillStyle: '', fillRect: vi.fn() };
      PARTICLES.spawn(10, 10, { count: 5, color: '#ff0', minLife: 5, maxLife: 5 });
      PARTICLES.draw(ctx);
      expect(ctx.fillRect).toHaveBeenCalled();
      expect(ctx.globalAlpha).toBe(1);
    });
  });

  describe('effect methods', () => {
    it('hitSpark spawns 4 particles', () => {
      PARTICLES.hitSpark(10, 10);
      expect(PARTICLES._activeCount).toBe(4);
    });

    it('hitSpark with custom color', () => {
      PARTICLES.hitSpark(10, 10, '#ff0000');
      expect(PARTICLES._activeCount).toBe(4);
    });

    it('deathBurst spawns 10 particles', () => {
      PARTICLES.deathBurst(10, 10);
      expect(PARTICLES._activeCount).toBe(10);
    });

    it('troopDeath spawns 15 particles', () => {
      PARTICLES.troopDeath(10, 10);
      expect(PARTICLES._activeCount).toBe(15);
    });

    it('splashImpact spawns 12 particles', () => {
      PARTICLES.splashImpact(10, 10);
      expect(PARTICLES._activeCount).toBe(12);
    });

    it('chainSpark spawns 3 particles', () => {
      PARTICLES.chainSpark(10, 10);
      expect(PARTICLES._activeCount).toBe(3);
    });

    it('troopShieldActivate spawns 12 particles', () => {
      PARTICLES.troopShieldActivate(10, 10);
      expect(PARTICLES._activeCount).toBe(12);
    });

    it('slowApply spawns 8 particles', () => {
      PARTICLES.slowApply(10, 10);
      expect(PARTICLES._activeCount).toBe(8);
    });

    it('burnApply spawns 8 particles', () => {
      PARTICLES.burnApply(10, 10);
      expect(PARTICLES._activeCount).toBe(8);
    });

    it('burnTick spawns 4 particles', () => {
      PARTICLES.burnTick(10, 10);
      expect(PARTICLES._activeCount).toBe(4);
    });

    it('healBurst spawns 6 particles', () => {
      PARTICLES.healBurst(10, 10);
      expect(PARTICLES._activeCount).toBe(6);
    });

    it('reviveBurst spawns 8 particles', () => {
      PARTICLES.reviveBurst(10, 10);
      expect(PARTICLES._activeCount).toBe(8);
    });
  });

  it('_getColorIndex caches colors', () => {
    const idx1 = PARTICLES._getColorIndex('#ff0');
    const idx2 = PARTICLES._getColorIndex('#ff0');
    expect(idx1).toBe(idx2);
  });

  it('_getColorIndex increments for new colors', () => {
    const idx1 = PARTICLES._getColorIndex('#f00');
    const idx2 = PARTICLES._getColorIndex('#0f0');
    const idx3 = PARTICLES._getColorIndex('#00f');
    expect(idx1).not.toBe(idx2);
    expect(idx3).not.toBe(idx1);
    expect(idx3).not.toBe(idx2);
  });

  it('draw with mixed colors renders correct number of fillRect calls', () => {
    const ctx = { globalAlpha: 1, fillStyle: '', fillRect: vi.fn() };
    PARTICLES.spawn(10, 10, { count: 4, color: '#ff0', minLife: 5, maxLife: 5 });
    PARTICLES.spawn(20, 20, { count: 3, color: '#f00', minLife: 5, maxLife: 5 });
    PARTICLES.draw(ctx);
    expect(ctx.fillRect).toHaveBeenCalledTimes(7);
    expect(ctx.globalAlpha).toBe(1);
  });

  it('draw resets buckets after render', () => {
    const ctx = { globalAlpha: 1, fillStyle: '', fillRect: vi.fn() };
    PARTICLES.spawn(0, 0, { count: 3, color: '#ff0', minLife: 5, maxLife: 5 });
    PARTICLES.draw(ctx);
    expect(PARTICLES._buckets.every((b) => b.length === 0)).toBe(true);
  });

  it('draw handles particle with maxLife=0', () => {
    const ctx = { globalAlpha: 1, fillStyle: '', fillRect: vi.fn() };
    PARTICLES.spawn(0, 0, { count: 2, color: '#ff0', minLife: 0, maxLife: 0 });
    PARTICLES.draw(ctx);
    expect(ctx.fillRect).toHaveBeenCalled();
    expect(ctx.globalAlpha).toBe(1);
  });

  it('draw with multiple colors exercises full bucket pipeline', () => {
    const ctx = { globalAlpha: 1, fillStyle: '', fillRect: vi.fn() };
    PARTICLES.spawn(0, 0, { count: 3, color: '#abc', minLife: 2, maxLife: 2 });
    PARTICLES.spawn(10, 10, { count: 2, color: '#def', minLife: 2, maxLife: 2 });
    PARTICLES.spawn(20, 20, { count: 1, color: '#fff', minLife: 2, maxLife: 2 });
    PARTICLES.draw(ctx);
    // Total fillRect calls should equal total active particles
    expect(ctx.fillRect).toHaveBeenCalledTimes(6);
  });

  describe('pool cap (known limitation: hardcoded _maxPool=300)', () => {
    it('particle pool cap is at most CONFIG.PARTICLE_POOL_SIZE with dynamic scaling', () => {
      expect(PARTICLES._maxPool).toBeLessThanOrEqual(CONFIG.PARTICLE_POOL_SIZE);
      expect(PARTICLES._maxPool).toBeGreaterThanOrEqual(100);
    });

    it('over-cap spawn silently drops overflow', () => {
      PARTICLES.spawn(0, 0, { count: 500 });
      expect(PARTICLES._activeCount).toBeLessThanOrEqual(PARTICLES._maxPool);
    });

    it('worst-case frame saturates but never exceeds cap', () => {
      for (let i = 0; i < 3; i++) PARTICLES.splashImpact(i, i);
      for (let i = 0; i < 2; i++) PARTICLES.chainSpark(i, i);
      for (let i = 0; i < 2; i++) PARTICLES.deathBurst(i, i);
      PARTICLES.troopDeath(0, 0);
      for (let i = 0; i < 5; i++) PARTICLES.hitSpark(i, i);
      expect(PARTICLES._activeCount).toBeLessThanOrEqual(PARTICLES._maxPool);
    });

    it('recycling under saturation works', () => {
      PARTICLES.spawn(0, 0, { count: 300, minLife: 0.01, maxLife: 0.01 });
      PARTICLES.update(1);
      expect(PARTICLES._activeCount).toBe(0);
      PARTICLES.spawn(0, 0, { count: 10 });
      expect(PARTICLES._activeCount).toBe(10);
    });
  });

  describe('edge case branches', () => {
    it('update handles dead particles already in pool', () => {
      PARTICLES.spawn(0, 0, { count: 3, minLife: 5, maxLife: 5 });
      // Manually kill one particle
      PARTICLES._pool[0].alive = false;
      PARTICLES.update(1);
      // Dead particle removed, 2 remaining alive
      expect(PARTICLES._activeCount).toBe(2);
    });

    it('spawnTrail returns early when pool is full', () => {
      PARTICLES._activeCount = PARTICLES._maxPool;
      PARTICLES.spawnTrail(0, 0, '#fff');
      expect(PARTICLES._activeCount).toBe(PARTICLES._maxPool);
    });

    it('draw with maxLife=0 uses alpha 0 for bucket', () => {
      const ctx = { globalAlpha: 1, fillStyle: '', fillRect: vi.fn() };
      PARTICLES._getParticle();
      const p = PARTICLES._pool[0];
      p.reset(0, 0, 0, 0, 0, '#fff', 2, false);
      p.maxLife = 0;
      PARTICLES._activeCount = 1;
      PARTICLES.draw(ctx);
      expect(ctx.fillRect).toHaveBeenCalled();
    });

    it('_getColorIndex returns cached index for existing color', () => {
      const idx1 = PARTICLES._getColorIndex('#abc');
      const idx2 = PARTICLES._getColorIndex('#abc');
      expect(idx1).toBe(idx2);
      expect(PARTICLES._nextColorIndex).toBe(1);
    });

    it('_getColorIndex fills _colorByIndex sequentially for multiple colors', () => {
      const idx1 = PARTICLES._getColorIndex('#111');
      const idx2 = PARTICLES._getColorIndex('#222');
      const idx3 = PARTICLES._getColorIndex('#333');
      expect(idx1).toBe(0);
      expect(idx2).toBe(1);
      expect(idx3).toBe(2);
      expect(PARTICLES._colorByIndex[0]).toBe('#111');
      expect(PARTICLES._colorByIndex[1]).toBe('#222');
      expect(PARTICLES._colorByIndex[2]).toBe('#333');
      expect(PARTICLES._nextColorIndex).toBe(3);
    });
  });

  describe('effect method custom color overrides', () => {
    beforeEach(() => {
      PARTICLES.clear();
    });

    it('deathBurst with custom color', () => {
      PARTICLES.deathBurst(10, 10, '#aabbcc');
      expect(PARTICLES._activeCount).toBe(10);
      expect(PARTICLES._pool[0].color).toBe('#aabbcc');
    });

    it('troopDeath with custom color', () => {
      PARTICLES.troopDeath(10, 10, '#bbccdd');
      expect(PARTICLES._activeCount).toBe(15);
      expect(PARTICLES._pool[0].color).toBe('#bbccdd');
    });

    it('splashImpact with custom color', () => {
      PARTICLES.splashImpact(10, 10, '#ccddee');
      expect(PARTICLES._activeCount).toBe(12);
      expect(PARTICLES._pool[0].color).toBe('#ccddee');
    });

    it('troopShieldActivate with custom color', () => {
      PARTICLES.troopShieldActivate(10, 10, '#ddeeff');
      expect(PARTICLES._activeCount).toBe(12);
      expect(PARTICLES._pool[0].color).toBe('#ddeeff');
    });

    it('slowApply with custom color', () => {
      PARTICLES.slowApply(10, 10, '#eeffaa');
      expect(PARTICLES._activeCount).toBe(8);
      expect(PARTICLES._pool[0].color).toBe('#eeffaa');
    });

    it('burnApply with custom color', () => {
      PARTICLES.burnApply(10, 10, '#ffaabb');
      expect(PARTICLES._activeCount).toBe(8);
      expect(PARTICLES._pool[0].color).toBe('#ffaabb');
    });

    it('burnTick with custom color', () => {
      PARTICLES.burnTick(10, 10, '#ffbbcc');
      expect(PARTICLES._activeCount).toBe(4);
      expect(PARTICLES._pool[0].color).toBe('#ffbbcc');
    });

    it('reviveBurst with custom color', () => {
      PARTICLES.reviveBurst(10, 10, '#ccbbaa');
      expect(PARTICLES._activeCount).toBe(8);
      expect(PARTICLES._pool[0].color).toBe('#ccbbaa');
    });
  });

  describe('draw bucketing edge cases', () => {
    beforeEach(() => {
      PARTICLES.clear();
    });

    it('draw with zero active particles renders nothing', () => {
      const ctx = { globalAlpha: 1, fillStyle: '', fillRect: vi.fn() };
      expect(() => PARTICLES.draw(ctx)).not.toThrow();
      expect(ctx.fillRect).not.toHaveBeenCalled();
      expect(ctx.globalAlpha).toBe(1);
    });

    it('draw with single particle renders one fillRect', () => {
      const ctx = { globalAlpha: 1, fillStyle: '', fillRect: vi.fn() };
      PARTICLES.spawn(0, 0, { count: 1, color: '#f00', minLife: 5, maxLife: 5 });
      PARTICLES.draw(ctx);
      expect(ctx.fillRect).toHaveBeenCalledTimes(1);
      expect(ctx.globalAlpha).toBe(1);
    });

    it('draw with same color and same alpha', () => {
      const ctx = { globalAlpha: 1, fillStyle: '', fillRect: vi.fn() };
      PARTICLES.spawn(0, 0, { count: 4, color: '#f00', minLife: 5, maxLife: 5 });
      PARTICLES.draw(ctx);
      // All 4 particles render (buckets are reset after draw, so keys.length=0)
      expect(ctx.fillRect).toHaveBeenCalledTimes(4);
    });

    it('draw with different colors uses separate buckets', () => {
      const ctx = { globalAlpha: 1, fillStyle: '', fillRect: vi.fn() };
      PARTICLES.spawn(0, 0, { count: 2, color: '#f00', minLife: 5, maxLife: 5 });
      PARTICLES.spawn(0, 0, { count: 2, color: '#0f0', minLife: 5, maxLife: 5 });
      PARTICLES.draw(ctx);
      expect(ctx.fillRect).toHaveBeenCalledTimes(4);
    });

    it('draw resets bucket arrays after render', () => {
      const ctx = { globalAlpha: 1, fillStyle: '', fillRect: vi.fn() };
      PARTICLES.spawn(0, 0, { count: 3, color: '#f00', minLife: 5, maxLife: 5 });
      PARTICLES.draw(ctx);
      // After draw, all batch arrays are reset to length 0 (cleared by draw)
      expect(ctx.fillRect).toHaveBeenCalledTimes(3);
      // Verify bucket content arrays are empty after render
      for (const key of Object.keys(PARTICLES._buckets)) {
        expect(PARTICLES._buckets[key].length).toBe(0);
      }
    });

    it('draw restores globalAlpha to 1 after rendering', () => {
      const ctx = { globalAlpha: 0.5, fillStyle: '', fillRect: vi.fn() };
      PARTICLES.spawn(0, 0, { count: 2, color: '#f00', minLife: 5, maxLife: 5 });
      PARTICLES.draw(ctx);
      expect(ctx.globalAlpha).toBe(1);
    });
  });

  describe('quality tier system (setQuality / _applyTier)', () => {
    beforeEach(() => {
      PARTICLES.clear();
      PARTICLES.setQuality('Medium');
    });

    it('setQuality sets _userTier and calls _applyTier', () => {
      PARTICLES.setQuality('Low');
      expect(PARTICLES._userTier).toBe('Low');
      expect(PARTICLES._activeTier).toBe('Low');
    });

    it('Low tier caps pool at 100', () => {
      PARTICLES.setQuality('Low');
      expect(PARTICLES._maxPool).toBe(100);
      expect(PARTICLES._spawnMultiplier).toBe(0.3);
      expect(PARTICLES._lifetimeMultiplier).toBe(0.5);
    });

    it('Medium tier caps pool at 300', () => {
      PARTICLES.setQuality('Medium');
      expect(PARTICLES._maxPool).toBe(300);
      expect(PARTICLES._spawnMultiplier).toBe(0.6);
      expect(PARTICLES._lifetimeMultiplier).toBe(0.75);
    });

    it('High tier caps pool at 1000', () => {
      PARTICLES.setQuality('High');
      expect(PARTICLES._maxPool).toBe(1000);
      expect(PARTICLES._spawnMultiplier).toBe(1.0);
      expect(PARTICLES._lifetimeMultiplier).toBe(1.0);
    });

    it('Ultra tier caps pool at 2000 with 1.5x spawn/lifetime', () => {
      PARTICLES.setQuality('Ultra');
      expect(PARTICLES._maxPool).toBe(2000);
      expect(PARTICLES._spawnMultiplier).toBe(1.5);
      expect(PARTICLES._lifetimeMultiplier).toBe(1.5);
    });

    it('invalid tier string does nothing', () => {
      const prev = PARTICLES._activeTier;
      PARTICLES._applyTier('Invalid');
      expect(PARTICLES._activeTier).toBe(prev);
    });

    it('_applyTier trims pool when shrinking', () => {
      PARTICLES.setQuality('Ultra');
      PARTICLES.spawn(0, 0, { count: 500 });
      // Ultra has spawn multiplier 1.5: Math.round(500 * 1.5) = 750
      expect(PARTICLES._activeCount).toBe(750);
      PARTICLES.setQuality('Low');
      expect(PARTICLES._maxPool).toBe(100);
      expect(PARTICLES._pool.length).toBe(100);
      expect(PARTICLES._activeCount).toBeLessThanOrEqual(100);
    });

    it('spawn respects quality tier multiplier (Low: 0.3x)', () => {
      PARTICLES.setQuality('Low');
      PARTICLES.spawn(0, 0, { count: 10 });
      // Low spawn multiplier 0.3: Math.max(1, Math.round(10 * 0.3)) = 3
      expect(PARTICLES._activeCount).toBe(3);
    });

    it('spawn respects quality tier multiplier (Ultra: 1.5x)', () => {
      PARTICLES.setQuality('Ultra');
      PARTICLES.spawn(0, 0, { count: 10 });
      // Ultra spawn multiplier 1.5: Math.max(1, Math.round(10 * 1.5)) = 15
      expect(PARTICLES._activeCount).toBe(15);
    });

    it('spawnTrail applies lifetimeMultiplier', () => {
      PARTICLES.setQuality('Low');
      PARTICLES.spawnTrail(0, 0, '#fff');
      const maxLowLife = 0.25 * PARTICLES._lifetimeMultiplier; // 0.25 * 0.5 = 0.125
      expect(PARTICLES._pool[0].life).toBeLessThanOrEqual(maxLowLife + 0.01);
    });

    it('setQuality does not affect existing auto-throttle _autoTier', () => {
      PARTICLES._autoTier = 'Low';
      PARTICLES.setQuality('Ultra');
      expect(PARTICLES._userTier).toBe('Ultra');
      expect(PARTICLES._autoTier).toBe('Low');
      // setQuality calls _applyTier which sets _activeTier to the applied tier
      expect(PARTICLES._activeTier).toBe('Ultra');
    });
  });

  describe('auto-throttle (_checkFrameBudget)', () => {
    beforeEach(() => {
      PARTICLES.clear();
      PARTICLES.setQuality('Ultra');
      PARTICLES._autoTier = null;
      PARTICLES._slowFrames = 0;
      PARTICLES._fastFrames = 0;
    });

    it('3 slow frames (>33ms) downgrades one tier', () => {
      PARTICLES._checkFrameBudget(34);
      PARTICLES._checkFrameBudget(34);
      PARTICLES._checkFrameBudget(34);
      expect(PARTICLES._autoTier).toBe('High');
      expect(PARTICLES._activeTier).toBe('High');
    });

    it('does not downgrade below Low', () => {
      PARTICLES.setQuality('Low');
      PARTICLES._checkFrameBudget(34);
      PARTICLES._checkFrameBudget(34);
      PARTICLES._checkFrameBudget(34);
      expect(PARTICLES._autoTier).toBeNull();
      expect(PARTICLES._activeTier).toBe('Low');
    });

    it('60 fast frames (<16ms) upgrades one tier toward _userTier', () => {
      PARTICLES._autoTier = 'High';
      PARTICLES._applyTier('High');
      for (let i = 0; i < 60; i++) PARTICLES._checkFrameBudget(15);
      expect(PARTICLES._autoTier).toBe('Ultra');
      expect(PARTICLES._activeTier).toBe('Ultra');
    });

    it('upgrade stops and clears _autoTier when reaching _userTier', () => {
      PARTICLES._autoTier = 'High';
      PARTICLES._applyTier('High');
      PARTICLES.setQuality('High');
      for (let i = 0; i < 60; i++) PARTICLES._checkFrameBudget(15);
      expect(PARTICLES._autoTier).toBeNull();
      expect(PARTICLES._activeTier).toBe('High');
    });

    it('only upgrades when _autoTier is set', () => {
      PARTICLES._autoTier = null;
      for (let i = 0; i < 60; i++) PARTICLES._checkFrameBudget(15);
      expect(PARTICLES._autoTier).toBeNull();
      // _fastFrames is reset to 0 inside the >=60 block before _autoTier check
      expect(PARTICLES._fastFrames).toBe(0);
    });

    it('reset counters on 16-33ms frames (normal range)', () => {
      PARTICLES._slowFrames = 2;
      PARTICLES._fastFrames = 59;
      PARTICLES._checkFrameBudget(20);
      expect(PARTICLES._slowFrames).toBe(0);
      expect(PARTICLES._fastFrames).toBe(0);
    });

    it('counter resets on switching between slow and fast', () => {
      PARTICLES._slowFrames = 2;
      PARTICLES._checkFrameBudget(15);
      expect(PARTICLES._slowFrames).toBe(0);
      expect(PARTICLES._fastFrames).toBe(1);
    });

    it('counter resets on switching between fast and slow', () => {
      PARTICLES._fastFrames = 59;
      PARTICLES._checkFrameBudget(34);
      expect(PARTICLES._fastFrames).toBe(0);
      expect(PARTICLES._slowFrames).toBe(1);
    });
  });

  describe('_applyCfg', () => {
    beforeEach(() => {
      PARTICLES.clear();
    });

    it('returns a config object with overridden color', () => {
      const src = {
        count: 5,
        color: '#fff',
        minSize: 1,
        maxSize: 3,
        minSpeed: 30,
        maxSpeed: 100,
        minLife: 0.2,
        maxLife: 0.5,
        gravity: false,
      };
      const cfg = PARTICLES._applyCfg(src, '#ff0000');
      expect(cfg.color).toBe('#ff0000');
      expect(cfg.count).toBe(5);
      expect(cfg.gravity).toBe(false);
    });

    it('reuses the same _tmpCfg object across calls', () => {
      const src1 = {
        count: 3,
        color: '#fff',
        minSize: 1,
        maxSize: 2,
        minSpeed: 10,
        maxSpeed: 20,
        minLife: 0.1,
        maxLife: 0.2,
        gravity: true,
      };
      const src2 = {
        count: 7,
        color: '#000',
        minSize: 2,
        maxSize: 4,
        minSpeed: 40,
        maxSpeed: 80,
        minLife: 0.3,
        maxLife: 0.6,
        gravity: false,
      };
      const cfg1 = PARTICLES._applyCfg(src1, '#f00');
      const cfg2 = PARTICLES._applyCfg(src2, '#0f0');
      expect(cfg2).toBe(cfg1);
      expect(cfg2.color).toBe('#0f0');
      expect(cfg2.count).toBe(7);
      expect(cfg2.gravity).toBe(false);
    });
  });

  describe('_spawnEffect', () => {
    beforeEach(() => {
      PARTICLES.clear();
      PARTICLES.setQuality('High');
    });

    it('spawns chainSpark with correct count', () => {
      PARTICLES._spawnEffect('chainSpark', 10, 10);
      expect(PARTICLES._activeCount).toBe(3);
    });

    it('spawns with overridden color', () => {
      PARTICLES._spawnEffect('hitSpark', 10, 10, { color: '#ff0000' });
      expect(PARTICLES._activeCount).toBe(4);
      expect(PARTICLES._pool[0].color).toBe('#ff0000');
    });

    it('spawns with default color when no overrides', () => {
      PARTICLES._spawnEffect('hitSpark', 10, 10);
      expect(PARTICLES._pool[0].color).toBe('#fff');
    });
  });
});
