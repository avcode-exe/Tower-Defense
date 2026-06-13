import { describe, expect, it } from 'vitest';
import { Monster } from '../src/monster.js';
import { CONFIG, MONSTER_SPECS } from '../src/config.js';

function sharedPath() {
  return { segments: [], totalLength: 0 };
}

function makeMonster(level, hpMult) {
  return new Monster(level, [[0, 0]], sharedPath(), hpMult);
}

function makeTroop(gx, gy) {
  return {
    x: gx * CONFIG.TILE_SIZE + CONFIG.TILE_SIZE / 2,
    y: gy * CONFIG.TILE_SIZE + CONFIG.TILE_SIZE / 2,
    alive: true,
  };
}

function buildTileIndex(troops, gs) {
  const idx = {};
  for (const t of troops) {
    const gx = (t.x / CONFIG.TILE_SIZE) | 0;
    const gy = (t.y / CONFIG.TILE_SIZE) | 0;
    const key = gy * gs + gx;
    if (!idx[key]) idx[key] = [];
    idx[key].push(t);
  }
  return idx;
}

// ─── Constructor ─────────────────────────────────────────────────────────────

describe('Constructor', () => {
  it('Level 1 Grunt matches MONSTER_SPECS[1]', () => {
    const m = makeMonster(1);
    const spec = MONSTER_SPECS[1];
    expect(m.maxHp).toBe(spec.hp);
    expect(m.hp).toBe(spec.hp);
    expect(m.speed).toBe(spec.speed);
    expect(m.reward).toBe(spec.reward);
    expect(m.alive).toBe(true);
    expect(m.reachedEnd).toBe(false);
  });

  it('Level B Boss has maxHp doubled by BOSS_HP_MULTIPLIER', () => {
    const m = makeMonster('B');
    const spec = MONSTER_SPECS['B'];
    expect(m.maxHp).toBe(spec.hp * CONFIG.BOSS_HP_MULTIPLIER);
    expect(m.hp).toBe(m.maxHp);
  });

  it('Unknown level falls back to MONSTER_SPECS[1]', () => {
    const m = makeMonster(99);
    expect(m.maxHp).toBe(MONSTER_SPECS[1].hp);
    expect(m.reward).toBe(MONSTER_SPECS[1].reward);
  });

  it('hpMult=2 doubles maxHp', () => {
    const base = MONSTER_SPECS[1].hp;
    const m = makeMonster(1, 2);
    expect(m.maxHp).toBe(Math.round(base * 2));
  });

  it('Shielded monster has shield > 0 and maxShield > 0', () => {
    const m = makeMonster('S');
    expect(m.shield).toBeGreaterThan(0);
    expect(m.maxShield).toBeGreaterThan(0);
    expect(m.shield).toBe(Math.round(MONSTER_SPECS['S'].shield));
  });
});

// ─── takeDamage ──────────────────────────────────────────────────────────────

describe('takeDamage', () => {
  it('No shield: damage goes directly to HP', () => {
    const m = makeMonster(1);
    const prevHp = m.hp;
    const result = m.takeDamage(5);
    expect(m.hp).toBe(prevHp - 5);
    expect(result.killed).toBe(false);
    expect(result.hpDamage).toBe(5);
  });

  it('Shield absorbs partial damage (no HP loss)', () => {
    const m = makeMonster('S');
    const prevHp = m.hp;
    const result = m.takeDamage(10);
    expect(result.hpDamage).toBe(0);
    expect(m.hp).toBe(prevHp);
    expect(m.shield).toBeLessThan(MONSTER_SPECS['S'].shield);
  });

  it('Shield fully absorbs damage when amount < shield', () => {
    const m = makeMonster('S');
    const prevShield = m.shield;
    m.takeDamage(1);
    expect(m.shield).toBe(prevShield - 1);
    expect(m.hp).toBe(m.maxHp);
  });

  it('Shield break: excess damage goes to HP', () => {
    const m = makeMonster('S');
    const prevHp = m.hp;
    const shieldAmt = m.shield;
    m.takeDamage(shieldAmt + 5);
    expect(m.shield).toBe(0);
    expect(m.hp).toBe(prevHp - 5);
  });

  it('Killing blow returns {killed:true, reward} and alive=false', () => {
    const m = makeMonster(1);
    const result = m.takeDamage(m.hp + 10);
    expect(result.killed).toBe(true);
    expect(result.reward).toBe(MONSTER_SPECS[1].reward);
    expect(m.alive).toBe(false);
  });

  it('Invalid input returns {killed:false}', () => {
    const m = makeMonster(1);
    expect(m.takeDamage(NaN).killed).toBe(false);
    expect(m.takeDamage(-5).killed).toBe(false);
    expect(m.takeDamage(0).killed).toBe(false);
  });
});

// ─── Shatter mechanic ────────────────────────────────────────────────────────

describe('Shatter mechanic', () => {
  it('applySlow sets speed, shatterArmed=true, slowTimer > 0', () => {
    const m = makeMonster(1);
    const ok = m.applySlow(0.5, 2.5, 0.5);
    expect(ok).toBe(true);
    expect(m.speed).toBe(m.baseSpeed * 0.5);
    expect(m.shatterArmed).toBe(true);
    expect(m.slowTimer).toBeGreaterThan(0);
  });

  it('takeDamage with shatterArmed + slowTimer > 0 applies bonus and resets shatterArmed', () => {
    const m = makeMonster(1);
    m.applySlow(0.5, 2.5, 0.5);
    const prevHp = m.hp;
    m.takeDamage(10);
    const expectedDmg = Math.round(10 * (1 + 0.5));
    expect(prevHp - m.hp).toBe(expectedDmg);
    expect(m.shatterArmed).toBe(false);
  });
});

// ─── Shield immunity ─────────────────────────────────────────────────────────

describe('Shield immunity', () => {
  it('applySlow returns false when shield > 0', () => {
    const m = makeMonster('S');
    expect(m.shield).toBeGreaterThan(0);
    const ok = m.applySlow(0.5, 2.5);
    expect(ok).toBe(false);
    expect(m.speed).toBe(m.baseSpeed);
  });
});

// ─── _updateRegen ────────────────────────────────────────────────────────────

describe('_updateRegen', () => {
  it('Shield regens after shieldRegenDelay', () => {
    const m = makeMonster('S');
    m.shield = 0;
    m._updateRegen(0.1);
    expect(m.shield).toBe(0);

    m._updateRegen(CONFIG.SHIELD_REGEN_DELAY);
    expect(m.shield).toBeGreaterThan(0);
  });

  it('Boss passive heal when hp < maxHp', () => {
    const m = makeMonster('B');
    m.hp = m.maxHp - 20;
    const spec = MONSTER_SPECS['B'];
    m._updateRegen(1);
    expect(m.hp).toBeGreaterThan(m.maxHp - 20);
    expect(m.hp).toBeLessThanOrEqual(m.maxHp);
  });
});

// ─── _updateSlowDecay ────────────────────────────────────────────────────────

describe('_updateSlowDecay', () => {
  it('Slow expires: speed resets, shatterArmed=false', () => {
    const m = makeMonster(1);
    m.applySlow(0.5, 1.0, 0.5);
    m._updateSlowDecay(1.5);
    expect(m.speed).toBe(m.baseSpeed);
    expect(m.shatterArmed).toBe(false);
    expect(m.slowTimer).toBe(0);
  });

  it('Slow timer decrements by dt', () => {
    const m = makeMonster(1);
    m.applySlow(0.5, 3.0, 0);
    m._updateSlowDecay(1.0);
    expect(m.slowTimer).toBe(2.0);
  });
});

// ─── findTarget ──────────────────────────────────────────────────────────────

describe('findTarget', () => {
  it('Returns nearest alive troop in attack range', () => {
    const m = makeMonster(1);
    const gs = CONFIG.GRID_SIZE;
    const near = makeTroop(1, 0);
    const far = makeTroop(10, 10);
    const idx = buildTileIndex([near, far], gs);
    const target = m.findTarget(idx);
    expect(target).toBe(near);
  });

  it('Returns null when no troops in range', () => {
    const m = makeMonster(1);
    const gs = CONFIG.GRID_SIZE;
    const far = makeTroop(14, 14);
    const idx = buildTileIndex([far], gs);
    const target = m.findTarget(idx);
    expect(target).toBeNull();
  });

  it('Skips dead troops', () => {
    const m = makeMonster(1);
    const gs = CONFIG.GRID_SIZE;
    const dead = makeTroop(1, 0);
    dead.alive = false;
    const alive = makeTroop(1, 1);
    const idx = buildTileIndex([dead, alive], gs);
    const target = m.findTarget(idx);
    expect(target).toBe(alive);
  });
});

// ─── Position / update ───────────────────────────────────────────────────────

describe('Position / update', () => {
  it('Single-cell path: stays at tile center', () => {
    const m = new Monster(1, [[3, 5]], sharedPath(), 1);
    expect(m.x).toBe(3 * CONFIG.TILE_SIZE + CONFIG.TILE_SIZE / 2);
    expect(m.y).toBe(5 * CONFIG.TILE_SIZE + CONFIG.TILE_SIZE / 2);
  });

  it('Distance beyond totalLength: reachedEnd=true', () => {
    const segs = [{ ax: 0, ay: 0, bx: 53, by: 0, len: 53, cumStart: 0 }];
    const sp = { segments: segs, totalLength: 53 };
    const m = new Monster(1, [[0, 0]], sp, 1);
    m.distance = 200;
    m._updatePosition();
    expect(m.reachedEnd).toBe(true);
  });

  it('isSlowed() returns true when slowTimer > 0', () => {
    const m = makeMonster(1);
    expect(m.isSlowed()).toBe(false);
    m.applySlow(0.5, 1.0);
    expect(m.isSlowed()).toBe(true);
  });
});
