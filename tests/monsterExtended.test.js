import { describe, it, expect } from 'vitest';
import { Monster } from '../src/monster.js';
import { CONFIG, MONSTER_SPECS } from '../src/config.js';

function makeMonster(level, waypoints, pathSegments, hpMult = 1) {
  return new Monster(level, waypoints, pathSegments, hpMult);
}

function makeTroop(gx, gy) {
  return {
    x: gx * CONFIG.TILE_SIZE + CONFIG.TILE_SIZE / 2,
    y: gy * CONFIG.TILE_SIZE + CONFIG.TILE_SIZE / 2,
    alive: true,
    gx,
    gy,
  };
}

function buildTileIndex(troops) {
  const gs = CONFIG.GRID_SIZE;
  const idx = new Array(gs * gs).fill(null);
  for (const t of troops) {
    const key = t.gy * gs + t.gx;
    if (!idx[key]) idx[key] = [];
    idx[key].push(t);
  }
  return idx;
}

// ─── _updatePosition multi-segment paths ────────────────────────────────────

describe('_updatePosition', () => {
  it('traverses multiple segments correctly', () => {
    const T = CONFIG.TILE_SIZE;
    const segments = [
      { ax: 0, ay: 0, bx: T, by: 0, len: T, cumStart: 0 },
      { ax: T, ay: 0, bx: T, by: T, len: T, cumStart: T },
    ];
    const sp = { segments, totalLength: 2 * T };
    const m = new Monster(1, [[0, 0]], sp, 1);
    m.distance = T * 0.5;
    m._updatePosition();
    expect(m.x).toBeCloseTo(T * 0.5);
    expect(m.y).toBe(0);
  });

  it('handles segment boundary crossing', () => {
    const T = CONFIG.TILE_SIZE;
    const segments = [
      { ax: 0, ay: 0, bx: T, by: 0, len: T, cumStart: 0 },
      { ax: T, ay: 0, bx: T, by: T, len: T, cumStart: T },
    ];
    const sp = { segments, totalLength: 2 * T };
    const m = new Monster(1, [[0, 0]], sp, 1);
    m.distance = T * 1.5;
    m._updatePosition();
    expect(m.x).toBeCloseTo(T);
    expect(m.y).toBeCloseTo(T * 0.5);
  });

  it('caches tile coordinates', () => {
    const T = CONFIG.TILE_SIZE;
    const segments = [
      { ax: 0, ay: 0, bx: 3 * T, by: 0, len: 3 * T, cumStart: 0 },
    ];
    const sp = { segments, totalLength: 3 * T };
    const m = new Monster(1, [[0, 0]], sp, 1);
    m.distance = T;
    m._updatePosition();
    expect(m._tileGx).toBe(1);
    expect(m._tileGy).toBe(0);
  });
});

// ─── progress getter ────────────────────────────────────────────────────────

describe('progress', () => {
  it('returns 0 at start', () => {
    const T = CONFIG.TILE_SIZE;
    const segments = [{ ax: 0, ay: 0, bx: T, by: 0, len: T, cumStart: 0 }];
    const sp = { segments, totalLength: T };
    const m = new Monster(1, [[0, 0]], sp, 1);
    expect(m.progress).toBe(0);
  });

  it('returns 0.5 at halfway', () => {
    const T = CONFIG.TILE_SIZE;
    const segments = [{ ax: 0, ay: 0, bx: 2 * T, by: 0, len: 2 * T, cumStart: 0 }];
    const sp = { segments, totalLength: 2 * T };
    const m = new Monster(1, [[0, 0]], sp, 1);
    m.distance = T;
    expect(m.progress).toBeCloseTo(0.5);
  });

  it('returns 1 at end', () => {
    const T = CONFIG.TILE_SIZE;
    const segments = [{ ax: 0, ay: 0, bx: T, by: 0, len: T, cumStart: 0 }];
    const sp = { segments, totalLength: T };
    const m = new Monster(1, [[0, 0]], sp, 1);
    m.distance = T;
    expect(m.progress).toBe(1);
  });

  it('returns 1 when totalLength is 0', () => {
    const m = new Monster(1, [[0, 0]], { segments: [], totalLength: 0 }, 1);
    expect(m.progress).toBe(1);
  });
});

// ─── update with different attack modes ─────────────────────────────────────

describe('update - stop mode', () => {
  function longPath() {
    const T = CONFIG.TILE_SIZE;
    return { segments: [{ ax: 0, ay: 0, bx: T * 10, by: 0, len: T * 10, cumStart: 0 }], totalLength: T * 10 };
  }

  it('transitions to ATTACKING when troop is in range', () => {
    const m = makeMonster(1, [[0, 0]], longPath());
    m.state = 'MOVING';
    const troop = makeTroop(1, 0);
    const tileIndex = buildTileIndex([troop]);
    m.update(0.1, tileIndex);
    expect(m.state).toBe('ATTACKING');
    expect(m.attackTarget).toBe(troop);
  });

  it('stays MOVING when no troop is in range', () => {
    const m = makeMonster(1, [[0, 0]], longPath());
    m.state = 'MOVING';
    const troop = makeTroop(14, 14);
    const tileIndex = buildTileIndex([troop]);
    m.update(0.1, tileIndex);
    expect(m.state).toBe('MOVING');
  });

  it('queues _pendingAttack when attack timer fires', () => {
    const m = makeMonster(1, [[0, 0]], longPath());
    m.state = 'ATTACKING';
    const troop = makeTroop(1, 0);
    m.attackTarget = troop;
    m.attackTimer = 0;
    m.update(0.1, buildTileIndex([troop]));
    expect(m._pendingAttack).toBe(troop);
  });
});

describe('update - pass mode', () => {
  function longPath() {
    const T = CONFIG.TILE_SIZE;
    return { segments: [{ ax: 0, ay: 0, bx: T * 10, by: 0, len: T * 10, cumStart: 0 }], totalLength: T * 10 };
  }

  it('attacks troops while moving through tiles', () => {
    const m = makeMonster(2, [[0, 0]], longPath());
    m.state = 'MOVING';
    m._lastPassTile = -1;
    const troop = makeTroop(0, 0);
    const tileIndex = buildTileIndex([troop]);
    m.update(0.1, tileIndex);
    expect(m._pendingAttack).toBe(troop);
  });

  it('does not attack the same troop twice on same tile', () => {
    const m = makeMonster(2, [[0, 0]], longPath());
    m.state = 'MOVING';
    m._lastPassTile = -1;
    const troop = makeTroop(0, 0);
    const tileIndex = buildTileIndex([troop]);
    m.update(0.1, tileIndex);
    m._pendingAttack = null;
    m.update(0.1, tileIndex);
    expect(m._pendingAttack).toBeNull();
  });
});

describe('update - slow mode (Spear)', () => {
  function longPath() {
    const T = CONFIG.TILE_SIZE;
    return { segments: [{ ax: 0, ay: 0, bx: T * 10, by: 0, len: T * 10, cumStart: 0 }], totalLength: T * 10 };
  }

  it('slows down when near a troop', () => {
    const m = makeMonster('X', [[0, 0]], longPath());
    m.state = 'MOVING';
    const troop = makeTroop(2, 0);
    const tileIndex = buildTileIndex([troop]);
    m.update(0.1, tileIndex);
    expect(m.speed).toBeLessThan(m.baseSpeed);
  });

  it('restores speed when no troop is near', () => {
    const m = makeMonster('X', [[0, 0]], longPath());
    m.state = 'MOVING';
    m.speed = m.baseSpeed * 0.5;
    const tileIndex = buildTileIndex([]);
    m.update(0.1, tileIndex);
    expect(m.speed).toBe(m.baseSpeed);
  });
});

// ─── Boss heal per second ───────────────────────────────────────────────────

describe('Boss heal per second', () => {
  it('heals when hp < maxHp', () => {
    const m = makeMonster('B', [[0, 0]], { segments: [], totalLength: 0 });
    m.hp = m.maxHp - 100;
    const prevHp = m.hp;
    m._updateRegen(1);
    expect(m.hp).toBeGreaterThan(prevHp);
    expect(m.hp).toBeLessThanOrEqual(m.maxHp);
  });

  it('does not heal when at maxHp', () => {
    const m = makeMonster('B', [[0, 0]], { segments: [], totalLength: 0 });
    m.hp = m.maxHp;
    m._updateRegen(1);
    expect(m.hp).toBe(m.maxHp);
  });

  it('heals exactly healPerSecond * dt', () => {
    const m = makeMonster('B', [[0, 0]], { segments: [], totalLength: 0 });
    const healAmount = 50;
    m.hp = m.maxHp - healAmount;
    const spec = MONSTER_SPECS['B'];
    m._updateRegen(2);
    expect(m.hp).toBeCloseTo(m.maxHp - healAmount + spec.healPerSecond * 2);
  });
});

// ─── Shield regen ───────────────────────────────────────────────────────────

describe('Shield regen', () => {
  it('does not regen during shieldRegenDelay', () => {
    const m = makeMonster('S', [[0, 0]], { segments: [], totalLength: 0 });
    m.shield = 0;
    m._updateRegen(0.1);
    expect(m.shield).toBe(0);
  });

  it('starts regen after shieldRegenDelay', () => {
    const m = makeMonster('S', [[0, 0]], { segments: [], totalLength: 0 });
    m.shield = 0;
    m._updateRegen(CONFIG.SHIELD_REGEN_DELAY);
    expect(m.shield).toBeGreaterThan(0);
  });

  it('caps shield at maxShield', () => {
    const m = makeMonster('S', [[0, 0]], { segments: [], totalLength: 0 });
    m.shield = m.maxShield - 1;
    m._updateRegen(CONFIG.SHIELD_REGEN_DELAY + 10);
    expect(m.shield).toBeLessThanOrEqual(m.maxShield);
  });

  it('takeDamage resets shieldRegenTimer', () => {
    const m = makeMonster('S', [[0, 0]], { segments: [], totalLength: 0 });
    m.shieldRegenTimer = CONFIG.SHIELD_REGEN_DELAY;
    m.takeDamage(1);
    expect(m.shieldRegenTimer).toBe(0);
  });
});

// ─── Revive mechanics ───────────────────────────────────────────────────────

describe('Revive mechanics', () => {
  it('revived monster has reviveImmune=true', () => {
    const m = makeMonster(1, [[0, 0]], { segments: [], totalLength: 0 });
    m.reviveImmune = true;
    m.reviveDamageRatio = 0.5;
    expect(m.reviveImmune).toBe(true);
  });

  it('reviveDamageRatio is applied in damageTroop, not takeDamage', () => {
    const m = makeMonster(1, [[0, 0]], { segments: [], totalLength: 0 });
    m.reviveImmune = true;
    m.reviveDamageRatio = 0.5;
    const prevHp = m.hp;
    m.takeDamage(10);
    // takeDamage does NOT apply reviveDamageRatio — full damage goes through
    expect(m.hp).toBe(prevHp - 10);
  });

  it('reviveGlow timer decrements', () => {
    const m = makeMonster(1, [[0, 0]], { segments: [], totalLength: 0 });
    m.reviveGlow = true;
    m._reviveGlowTimer = 1.5;
    m._updateReviveGlow(0.5);
    expect(m._reviveGlowTimer).toBe(1.0);
  });

  it('reviveGlow timer clamps to 0', () => {
    const m = makeMonster(1, [[0, 0]], { segments: [], totalLength: 0 });
    m.reviveGlow = true;
    m._reviveGlowTimer = 0.1;
    m._updateReviveGlow(1.0);
    expect(m._reviveGlowTimer).toBe(0);
  });
});

// ─── tileDistanceTo ─────────────────────────────────────────────────────────

describe('tileDistanceTo', () => {
  it('returns 0 for same tile', () => {
    const m = makeMonster(1, [[0, 0]], { segments: [], totalLength: 0 });
    m._tileGx = 5;
    m._tileGy = 5;
    expect(m.tileDistanceTo(5, 5)).toBe(0);
  });

  it('returns correct Chebyshev distance', () => {
    const m = makeMonster(1, [[0, 0]], { segments: [], totalLength: 0 });
    m._tileGx = 3;
    m._tileGy = 5;
    // Chebyshev = max(|dx|, |dy|)
    expect(m.tileDistanceTo(7, 5)).toBe(4);  // max(4, 0) = 4
    expect(m.tileDistanceTo(5, 8)).toBe(3);  // max(2, 3) = 3
    expect(m.tileDistanceTo(7, 8)).toBe(4);  // max(4, 3) = 4
  });
});

// ─── _updateSlowDecay edge cases ────────────────────────────────────────────

describe('_updateSlowDecay edge cases', () => {
  it('does nothing when slowTimer is 0', () => {
    const m = makeMonster(1, [[0, 0]], { segments: [], totalLength: 0 });
    m.slowTimer = 0;
    m._updateSlowDecay(1);
    expect(m.speed).toBe(m.baseSpeed);
  });

  it('resets _slowColorTint when slow expires', () => {
    const m = makeMonster(1, [[0, 0]], { segments: [], totalLength: 0 });
    m.applySlow(0.5, 0.5, 0);
    m._slowColorTint = 1;
    m._updateSlowDecay(1.0);
    expect(m._slowColorTint).toBe(0);
  });
});

// ─── Monster constructor edge cases ─────────────────────────────────────────

describe('Monster constructor edge cases', () => {
  it('Necromancer has noSplit=true', () => {
    const m = makeMonster('Y', [[0, 0]], { segments: [], totalLength: 0 });
    expect(m.spec.noSplit).toBe(true);
  });

  it('Runner has noSplit=true', () => {
    const m = makeMonster(2, [[0, 0]], { segments: [], totalLength: 0 });
    expect(m.spec.noSplit).toBe(true);
  });

  it('Boss has healPerSecond', () => {
    const m = makeMonster('B', [[0, 0]], { segments: [], totalLength: 0 });
    expect(m.healPerSecond).toBeGreaterThan(0);
  });

  it('non-Boss has healPerSecond=0', () => {
    const m = makeMonster(1, [[0, 0]], { segments: [], totalLength: 0 });
    expect(m.healPerSecond).toBe(0);
  });

  it('Shielded monster has shield > 0', () => {
    const m = makeMonster('S', [[0, 0]], { segments: [], totalLength: 0 });
    expect(m.shield).toBeGreaterThan(0);
  });

  it('non-Shielded monster has shield=0', () => {
    const m = makeMonster(1, [[0, 0]], { segments: [], totalLength: 0 });
    expect(m.shield).toBe(0);
  });
});
