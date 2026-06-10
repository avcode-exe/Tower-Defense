import { describe, it, expect, vi } from 'vitest';

vi.mock('../src/particles.js', () => ({
  PARTICLES: {
    spawnTrail: vi.fn(),
    spawn: vi.fn(),
  },
}));

import { Projectile } from '../src/projectile.js';

function makeTroop(specId = 'archer') {
  return { spec: { id: specId }, x: 0, y: 0 };
}

function makeMonster(x, y, alive = true) {
  return { x, y, alive };
}

describe('Projectile', () => {
  it('initializes with correct properties', () => {
    const troop = makeTroop();
    const monster = makeMonster(100, 200);
    const p = new Projectile(troop, monster, 10, 20);

    expect(p.troop).toBe(troop);
    expect(p.x).toBe(10);
    expect(p.y).toBe(20);
    expect(p.target).toBe(monster);
    expect(p.lastTargetX).toBe(100);
    expect(p.lastTargetY).toBe(200);
    expect(p.alive).toBe(true);
    expect(p.age).toBe(0);
    expect(p.speed).toBeGreaterThan(0);
  });

  it('handles null monster target', () => {
    const troop = makeTroop();
    const p = new Projectile(troop, null, 10, 20);

    expect(p.target).toBeNull();
    expect(p.lastTargetX).toBe(10);
    expect(p.lastTargetY).toBe(20);
  });

  it('moves toward target on update', () => {
    const troop = makeTroop();
    const monster = makeMonster(100, 0);
    const p = new Projectile(troop, monster, 0, 0);

    p.update(0.1, [], () => {});

    expect(p.x).toBeGreaterThan(0);
    expect(p.alive).toBe(true);
  });

  it('impacts when close enough to target', () => {
    const troop = makeTroop();
    const monster = makeMonster(5, 0);
    const p = new Projectile(troop, monster, 0, 0);
    const onImpact = vi.fn();

    p.update(1.0, [], onImpact);

    expect(onImpact).toHaveBeenCalledWith(p);
    expect(p.alive).toBe(false);
  });

  it('continues flying when target dies mid-flight', () => {
    const troop = makeTroop();
    const monster = makeMonster(200, 0, false);
    const p = new Projectile(troop, monster, 0, 0);
    const onImpact = vi.fn();

    p.update(0.01, [], onImpact);

    expect(p.target).toBeNull();
    expect(p.alive).toBe(true);
    expect(onImpact).not.toHaveBeenCalled();
  });

  it('expires after PROJECTILE_TIMEOUT when target is dead', () => {
    const troop = makeTroop();
    const monster = makeMonster(50000, 0, false); // very far away, can never reach
    const p = new Projectile(troop, monster, 0, 0);
    const onImpact = vi.fn();

    // Age exceeds PROJECTILE_TIMEOUT (3.0s) after enough updates
    p.update(1.5, [], onImpact);
    expect(p.alive).toBe(true); // age=1.5, not yet expired
    p.update(2.0, [], onImpact);

    expect(p.alive).toBe(false);
    expect(onImpact).not.toHaveBeenCalled();
  });

  it('tracks lastTargetX/Y from live target', () => {
    const troop = makeTroop();
    const monster = makeMonster(50, 60);
    const p = new Projectile(troop, monster, 0, 0);

    monster.x = 70;
    monster.y = 80;
    p.update(0.01, [], () => {});

    expect(p.lastTargetX).toBe(70);
    expect(p.lastTargetY).toBe(80);
  });
});
