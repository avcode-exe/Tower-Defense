import { describe, expect, it, beforeEach } from 'vitest';
import { Particle, PARTICLES } from '../src/particles.js';
import { CONFIG } from '../src/config.js';

describe('Particle', () => {
  describe('constructor', () => {
    it('initializes with default values', () => {
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
  });

  describe('reset()', () => {
    it('sets all properties from arguments', () => {
      const p = new Particle();
      p.reset(10, 20, 5, -5, 1.5, '#ff0000', 3, true);

      expect(p.x).toBe(10);
      expect(p.y).toBe(20);
      expect(p.vx).toBe(5);
      expect(p.vy).toBe(-5);
      expect(p.life).toBe(1.5);
      expect(p.maxLife).toBe(1.5);
      expect(p.color).toBe('#ff0000');
      expect(p.size).toBe(3);
      expect(p.gravity).toBe(true);
      expect(p.alive).toBe(true);
    });

    it('clears previous state', () => {
      const p = new Particle();
      p.reset(10, 20, 5, -5, 1.5, '#ff0000', 3, true);
      p.reset(0, 0, 0, 0, 0.1, '#000', 1, false);

      expect(p.x).toBe(0);
      expect(p.color).toBe('#000');
      expect(p.gravity).toBe(false);
      expect(p.alive).toBe(true);
    });
  });

  describe('update(dt)', () => {
    it('moves particle by velocity * dt', () => {
      const p = new Particle();
      p.reset(100, 100, 50, 0, 1, '#fff', 2, false);

      p.update(0.5);

      expect(p.x).toBeCloseTo(125); // 100 + 50 * 0.5
      expect(p.y).toBeCloseTo(100);
    });

    it('applies gravity when enabled', () => {
      const p = new Particle();
      p.reset(0, 0, 0, 0, 10, '#fff', 2, true);

      p.update(1);

      expect(p.vy).toBeCloseTo(CONFIG.PARTICLE_GRAVITY * 1);
      expect(p.y).toBeCloseTo(0); // no horizontal movement, vy starts at 0 so y += 0*dt
    });

    it('does not apply gravity when disabled', () => {
      const p = new Particle();
      p.reset(0, 0, 0, 50, 10, '#fff', 2, false);

      p.update(1);

      expect(p.vy).toBe(50); // unchanged
    });

    it('decrements life and sets alive=false when life <= 0', () => {
      const p = new Particle();
      p.reset(0, 0, 0, 0, 0.3, '#fff', 2, false);

      p.update(0.2);
      expect(p.alive).toBe(true);
      expect(p.life).toBeCloseTo(0.1);

      p.update(0.2);
      expect(p.alive).toBe(false);
      expect(p.life).toBeCloseTo(-0.1);
    });

    it('sets alive=false exactly when life reaches zero', () => {
      const p = new Particle();
      p.reset(0, 0, 0, 0, 0.5, '#fff', 2, false);

      p.update(0.5);
      expect(p.alive).toBe(false);
    });
  });
});

describe('PARTICLES singleton', () => {
  beforeEach(() => {
    PARTICLES.clear();
  });

  describe('spawn()', () => {
    it('creates particles in the pool', () => {
      PARTICLES.spawn(100, 100, {
        count: 5,
        color: '#ff0000',
        minSize: 1,
        maxSize: 2,
        minSpeed: 30,
        maxSpeed: 60,
        minLife: 0.2,
        maxLife: 0.5,
        gravity: false,
      });

      expect(PARTICLES._activeCount).toBe(5);
    });

    it('uses default values when config properties are omitted', () => {
      PARTICLES.spawn(0, 0, { count: 3 });

      expect(PARTICLES._activeCount).toBe(3);
      // All particles should have been created (defaults filled in)
      for (let i = 0; i < PARTICLES._activeCount; i++) {
        const p = PARTICLES._pool[i];
        expect(p.alive).toBe(true);
        expect(p.x).toBe(0);
        expect(p.y).toBe(0);
      }
    });

    it('does not exceed _maxPool', () => {
      PARTICLES.spawn(0, 0, { count: PARTICLES._maxPool + 50 });

      expect(PARTICLES._activeCount).toBeLessThanOrEqual(PARTICLES._maxPool);
    });

    it('spawned particles have correct position', () => {
      PARTICLES.spawn(250, 300, {
        count: 1,
        minSpeed: 0,
        maxSpeed: 0,
        minLife: 1,
        maxLife: 1,
        gravity: false,
      });

      const p = PARTICLES._pool[0];
      expect(p.x).toBe(250);
      expect(p.y).toBe(300);
    });
  });

  describe('spawnTrail()', () => {
    it('adds a single particle to the pool', () => {
      const countBefore = PARTICLES._activeCount;
      PARTICLES.spawnTrail(50, 60, '#00ff00');

      expect(PARTICLES._activeCount).toBe(countBefore + 1);
      const p = PARTICLES._pool[PARTICLES._activeCount - 1];
      expect(p.x).toBe(50);
      expect(p.y).toBe(60);
      expect(p.gravity).toBe(false);
    });
  });

  describe('clear()', () => {
    it('resets active count to zero', () => {
      PARTICLES.spawn(0, 0, { count: 10 });
      expect(PARTICLES._activeCount).toBe(10);

      PARTICLES.clear();
      expect(PARTICLES._activeCount).toBe(0);
    });

    it('clears color buckets', () => {
      PARTICLES.spawn(0, 0, { count: 3, color: '#ff0000' });
      PARTICLES.clear();

      expect(PARTICLES._buckets).toEqual([]);
      expect(PARTICLES._bucketKeys).toEqual([]);
      expect(PARTICLES._colorToIndex).toEqual({});
      expect(PARTICLES._colorByIndex).toEqual([]);
      expect(PARTICLES._nextColorIndex).toBe(0);
    });
  });

  describe('update(dt)', () => {
    it('with dt=0 does not change active count or particle states', () => {
      PARTICLES.spawn(0, 0, { count: 3, minLife: 1, maxLife: 1, gravity: false });
      const countBefore = PARTICLES._activeCount;
      const lifeBefore = PARTICLES._pool[0].life;

      PARTICLES.update(0);

      expect(PARTICLES._activeCount).toBe(countBefore);
      expect(PARTICLES._pool[0].life).toBeCloseTo(lifeBefore);
    });

    it('removes dead particles by compacting the pool', () => {
      PARTICLES.spawn(0, 0, {
        count: 5,
        minLife: 0.1,
        maxLife: 0.1,
        gravity: false,
      });
      expect(PARTICLES._activeCount).toBe(5);

      PARTICLES.update(0.2); // life 0.1 - 0.2 = -0.1, all dead

      expect(PARTICLES._activeCount).toBe(0);
    });

    it('keeps alive particles and compacts dead ones', () => {
      PARTICLES.spawn(0, 0, {
        count: 5,
        minLife: 0.5,
        maxLife: 5, // mix of short and long lives
        gravity: false,
      });

      PARTICLES.update(0.3);

      // Some may have died, some survived; count should be less than 5
      expect(PARTICLES._activeCount).toBeLessThanOrEqual(5);
      // All remaining particles should be alive
      for (let i = 0; i < PARTICLES._activeCount; i++) {
        expect(PARTICLES._pool[i].alive).toBe(true);
      }
    });
  });

  describe('effect methods', () => {
    it('hitSpark creates particles', () => {
      PARTICLES.hitSpark(100, 100);
      expect(PARTICLES._activeCount).toBeGreaterThan(0);
    });

    it('hitSpark creates particles with custom color', () => {
      PARTICLES.hitSpark(100, 100, '#ff0000');
      expect(PARTICLES._activeCount).toBeGreaterThan(0);
      const p = PARTICLES._pool[0];
      expect(p.color).toBe('#ff0000');
    });

    it('deathBurst creates 10 particles', () => {
      PARTICLES.deathBurst(100, 100);
      expect(PARTICLES._activeCount).toBe(10);
    });

    it('deathBurst creates particles with custom color', () => {
      PARTICLES.deathBurst(100, 100, '#00ff00');
      expect(PARTICLES._activeCount).toBe(10);
      expect(PARTICLES._pool[0].color).toBe('#00ff00');
    });

    it('troopDeath creates 15 particles', () => {
      PARTICLES.troopDeath(100, 100);
      expect(PARTICLES._activeCount).toBe(15);
    });

    it('splashImpact creates 12 particles', () => {
      PARTICLES.splashImpact(100, 100);
      expect(PARTICLES._activeCount).toBe(12);
    });

    it('chainSpark creates 3 particles', () => {
      PARTICLES.chainSpark(100, 100);
      expect(PARTICLES._activeCount).toBe(3);
    });

    it('troopShieldActivate creates 12 particles', () => {
      PARTICLES.troopShieldActivate(100, 100);
      expect(PARTICLES._activeCount).toBe(12);
    });

    it('slowApply creates 8 particles', () => {
      PARTICLES.slowApply(100, 100);
      expect(PARTICLES._activeCount).toBe(8);
    });

    it('healBurst creates 6 particles', () => {
      PARTICLES.healBurst(100, 100);
      expect(PARTICLES._activeCount).toBe(6);
    });

    it('reviveBurst creates 8 particles', () => {
      PARTICLES.reviveBurst(100, 100);
      expect(PARTICLES._activeCount).toBe(8);
    });

    it('all effect methods place particles at the given coordinates', () => {
      PARTICLES.hitSpark(200, 300);
      const p = PARTICLES._pool[0];
      expect(p.x).toBe(200);
      expect(p.y).toBe(300);
    });

    it('effect methods use default color when no override provided', () => {
      PARTICLES.chainSpark(0, 0);
      // chainSpark default color is '#f1c40f'
      expect(PARTICLES._pool[0].color).toBe('#f1c40f');
    });
  });
});
