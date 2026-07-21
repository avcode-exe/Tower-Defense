import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CONFIG, PROJECTILE_STYLES } from '../src/config.js';

vi.mock('../src/particles.js', () => ({
  PARTICLES: { spawnTrail: vi.fn(), update: vi.fn(), clear: vi.fn() },
}));

describe('Projectile', () => {
  let Projectile;

  beforeAll(async () => {
    const mod = await import('../src/projectile.js');
    Projectile = mod.Projectile;
  });

  function makeTroop(specId) {
    return {
      spec: { id: specId },
      _cachedDamage: 10,
    };
  }

  function makeMonster(x, y, alive = true) {
    return { x, y, alive };
  }

  it('constructor sets correct properties from PROJECTILE_STYLES', () => {
    const style = PROJECTILE_STYLES.archer;
    const troop = makeTroop('archer');
    const monster = makeMonster(100, 200);
    const p = new Projectile(troop, monster, 10, 20);
    expect(p.color).toBe(style.color);
    expect(p.size).toBe(style.size);
    expect(p.speed).toBe(style.speed * CONFIG.TILE_SIZE);
    expect(p.kind).toBe(style.kind);
    expect(p.x).toBe(10);
    expect(p.y).toBe(20);
    expect(p.target).toBe(monster);
    expect(p.lastTargetX).toBe(100);
    expect(p.lastTargetY).toBe(200);
    expect(p.alive).toBe(true);
    expect(p.age).toBe(0);
  });

  it('constructor handles null monster', () => {
    const troop = makeTroop('archer');
    const p = new Projectile(troop, null, 10, 20);
    expect(p.target).toBeNull();
    expect(p.lastTargetX).toBe(10);
    expect(p.lastTargetY).toBe(20);
  });

  it('constructor falls back to default style for unknown troop id', () => {
    const troop = { spec: { id: 'unknown' } };
    const p = new Projectile(troop, null, 0, 0);
    expect(p.color).toBe('#fff');
    expect(p.size).toBe(4);
    expect(p.speed).toBe(10 * CONFIG.TILE_SIZE);
    expect(p.kind).toBe('orb');
  });

  it('update moves toward target and calls onImpact when close enough', () => {
    const troop = makeTroop('archer');
    const monster = makeMonster(20, 0);
    const p = new Projectile(troop, monster, 0, 0);
    const onImpact = vi.fn();
    p.update(1, [], onImpact);
    expect(p.alive).toBe(false);
    expect(onImpact).toHaveBeenCalledWith(p);
  });

  it('update continues flying when target dies mid-flight', () => {
    const troop = makeTroop('archer');
    const monster = makeMonster(100, 100, true);
    const p = new Projectile(troop, monster, 10, 10);
    p.age = 0;
    const onImpact = vi.fn();
    // Target dies
    monster.alive = false;
    p.update(0.01, [], onImpact);
    expect(p.target).toBeNull();
    expect(p.alive).toBe(true);
  });

  it('expires after PROJECTILE_TIMEOUT when no target', () => {
    const troop = makeTroop('archer');
    const p = new Projectile(troop, null, 10, 10);
    p.age = CONFIG.PROJECTILE_TIMEOUT;
    const onImpact = vi.fn();
    p.update(0.1, [], onImpact);
    expect(p.alive).toBe(false);
    expect(onImpact).not.toHaveBeenCalled();
  });

  it('updates lastTargetX/Y from live target', () => {
    const troop = makeTroop('archer');
    const monster = makeMonster(50, 75);
    const p = new Projectile(troop, monster, 0, 0);
    monster.x = 60;
    monster.y = 85;
    const onImpact = vi.fn();
    p.update(0.001, [], onImpact);
    expect(p.lastTargetX).toBe(60);
    expect(p.lastTargetY).toBe(85);
  });

  it('impact callback error does not crash', () => {
    const troop = makeTroop('archer');
    const monster = makeMonster(20, 0);
    const p = new Projectile(troop, monster, 0, 0);
    const onImpact = vi.fn(() => {
      throw new Error('test error');
    });
    expect(() => p.update(1, [], onImpact)).not.toThrow();
    expect(p.alive).toBe(false);
  });

  it('different projectile kinds work', () => {
    for (const kind of ['arrow', 'bolt', 'orb']) {
      // Find or create a style with this kind
      const styleEntry = Object.entries(PROJECTILE_STYLES).find(([, s]) => s.kind === kind);
      const troop = makeTroop(styleEntry[0]);
      const p = new Projectile(troop, null, 0, 0);
      expect(p.kind).toBe(kind);
    }
  });

  it('speed is style.speed * CONFIG.TILE_SIZE', () => {
    const style = PROJECTILE_STYLES.archer;
    const troop = makeTroop('archer');
    const p = new Projectile(troop, null, 0, 0);
    expect(p.speed).toBe(style.speed * CONFIG.TILE_SIZE);
  });

  it('age increments each update', () => {
    const troop = makeTroop('archer');
    const monster = makeMonster(1000, 1000);
    const p = new Projectile(troop, monster, 0, 0);
    const onImpact = vi.fn();
    const ageBefore = p.age;
    p.update(0.016, [], onImpact);
    expect(p.age).toBeGreaterThan(ageBefore);
  });

  it('trail particles spawned (throttled every 3rd frame)', async () => {
    const { PARTICLES } = await import('../src/particles.js');
    PARTICLES.spawnTrail = vi.fn(PARTICLES.spawnTrail);
    const troop = makeTroop('archer');
    const monster = makeMonster(1000, 1000);
    const p = new Projectile(troop, monster, 0, 0);
    const onImpact = vi.fn();
    // First frame (frame 1, not 3rd)
    PARTICLES.spawnTrail.mockClear();
    p.update(0.016, [], onImpact);
    expect(PARTICLES.spawnTrail).not.toHaveBeenCalled();
    // Second frame
    p.update(0.016, [], onImpact);
    expect(PARTICLES.spawnTrail).not.toHaveBeenCalled();
    // Third frame
    p.update(0.016, [], onImpact);
    expect(PARTICLES.spawnTrail).toHaveBeenCalled();
  });
});
