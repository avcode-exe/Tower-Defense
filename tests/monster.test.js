import { describe, expect, it, vi, afterEach } from 'vitest';
import { Monster } from '../src/monster.js';
import { CONFIG, MONSTER_SPECS } from '../src/config.js';
import { Game } from '../src/game.js';
import { AUDIO } from '../src/audio.js';
import { PARTICLES } from '../src/particles.js';

// ─── Shared helpers ────────────────────────────────────────────────────────

function sharedPath() {
  return { segments: [], totalLength: 0 };
}

function makeMonster(level, arg2, arg3) {
  // Support both makeMonster(level, hpMult) and makeMonster(level, waypoints, path)
  if (Array.isArray(arg2)) {
    return new Monster(level, arg2, arg3 || sharedPath());
  }
  return new Monster(level, [[0, 0]], sharedPath(), arg2);
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

function makeMonsterAt(level, gx, gy) {
  return new Monster(level, [[gx, gy]], sharedPath(), 1);
}

function makeFakeGame(monsters = []) {
  return {
    monsters,
    popups: [],
    gold: 0,
    _getPopup(text, x, y, t, color) {
      this.popups.push({ text, x, y, t, color });
    },
    _addGold(amount) {
      this.gold += amount;
    },
  };
}

function makeReviveGame(monsters) {
  return {
    monsters,
    popups: [],
    _getPopup(text, x, y, t, color) {
      this.popups.push({ text, x, y, t, color });
    },
    _addGold(amount) {
      this.gold += amount;
    },
    _resetRevivedMonster: Game.prototype._resetRevivedMonster,
  };
}

function fakeMonster(level, x, y, overrides = {}) {
  const spec = MONSTER_SPECS[level] || MONSTER_SPECS[1];
  const maxHp = overrides.maxHp ?? spec.hp;
  const hp = overrides.hp ?? (overrides.alive === false ? 0 : maxHp);
  return {
    level,
    x,
    y,
    spec,
    maxHp,
    hp,
    alive: overrides.alive ?? true,
    reachedEnd: overrides.reachedEnd ?? false,
    reviveUsed: false,
    reviveCount: 0,
    _reviveLock: false,
    reviveImmune: false,
    reviveDamageRatio: 1,
    reviveGlow: false,
    _reviveGlowTimer: 0,
    baseSpeed: spec.speed,
    speed: spec.speed,
    stunTimer: 0,
    slowTimer: 0,
    shatterArmed: false,
    shatterBonus: 0,
    _slowColorTint: 0,
    state: 'ATTACKING',
    attackTarget: {},
    attackTimer: 99,
    _pendingAttack: {},
    _lastPassTile: 0,
    _hitTroops: new Set(),
    ...overrides,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

// ─── Constructor ────────────────────────────────────────────────────────────

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

// ─── takeDamage ─────────────────────────────────────────────────────────────

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

// ─── Shatter mechanic ──────────────────────────────────────────────────────

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

// ─── Shield immunity ────────────────────────────────────────────────────────

describe('Shield immunity', () => {
  it('applySlow returns false when shield > 0', () => {
    const m = makeMonster('S');
    expect(m.shield).toBeGreaterThan(0);
    const ok = m.applySlow(0.5, 2.5);
    expect(ok).toBe(false);
    expect(m.speed).toBe(m.baseSpeed);
  });
});

// ─── _updateRegen ───────────────────────────────────────────────────────────

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

// ─── _updateSlowDecay ───────────────────────────────────────────────────────

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

// ─── findTarget ─────────────────────────────────────────────────────────────

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

// ─── Position / update ──────────────────────────────────────────────────────

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

// ─── update - stop mode ─────────────────────────────────────────────────────

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

// ─── update - pass mode ─────────────────────────────────────────────────────

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

// ─── update - slow mode (Spear) ────────────────────────────────────────────

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

// ─── Boss heal per second ──────────────────────────────────────────────────

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

// ─── Revive mechanics ──────────────────────────────────────────────────────

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
    expect(m.tileDistanceTo(7, 5)).toBe(4);
    expect(m.tileDistanceTo(5, 8)).toBe(3);
    expect(m.tileDistanceTo(7, 8)).toBe(4);
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

// ─── Monster splitting ──────────────────────────────────────────────────────

describe('Monster splitting', () => {
  it.each([
    { parentLevel: 3, parentName: 'Brute', expectedLevel: 1, expectedName: 'Grunt' },
    { parentLevel: 4, parentName: 'Elite', expectedLevel: 3, expectedName: 'Brute' },
    { parentLevel: 5, parentName: 'Champion', expectedLevel: 4, expectedName: 'Elite' },
  ])(
    '$parentName splits into two $expectedName monsters and never Runners',
    ({ parentLevel, expectedLevel, expectedName }) => {
      const parent = makeMonster(parentLevel);
      const game = { monsters: [parent], popups: [], waypoints: [[0, 0]], pathSegments: sharedPath(), gold: 0, _addGold(amount) { this.gold += amount; }, _getPopup(text, x, y, t, color) { this.popups.push({ text, x, y, t, color }); } };
      vi.spyOn(AUDIO, 'goldEarned');
      vi.spyOn(PARTICLES, 'spawn');

      expect(Game.prototype.damageMonster.call(game, parent, parent.hp)).toBe(true);

      const children = game.monsters.filter((monster) => monster !== parent);
      expect(children).toHaveLength(2);
      expect(children.every((monster) => monster.level === expectedLevel)).toBe(true);
      expect(children.every((monster) => monster.spec.name === expectedName)).toBe(true);
      expect(children.some((monster) => monster.spec.name === 'Runner')).toBe(false);
      expect(parent.alive).toBe(false);
      expect(game.gold).toBe(parent.reward + 1);
    }
  );

  it('Runner does not split because it has noSplit and pass-mode behavior', () => {
    const runner = makeMonster(2);
    const game = { monsters: [runner], popups: [], waypoints: [[0, 0]], pathSegments: sharedPath(), gold: 0, _addGold(amount) { this.gold += amount; }, _getPopup(text, x, y, t, color) { this.popups.push({ text, x, y, t, color }); } };
    vi.spyOn(AUDIO, 'goldEarned');
    vi.spyOn(PARTICLES, 'spawn');

    expect(MONSTER_SPECS[2].noSplit).toBe(true);
    expect(MONSTER_SPECS[2].attackMode).toBe('pass');
    expect(Game.prototype.damageMonster.call(game, runner, runner.hp)).toBe(true);

    expect(game.monsters).toEqual([runner]);
    expect(runner.alive).toBe(false);
    expect(game.gold).toBe(runner.reward + 1);
  });
});

// ─── takeDamage edge cases ──────────────────────────────────────────────────

describe('takeDamage edge cases', () => {
  it('shield break killing blow: excess damage kills monster', () => {
    const m = makeMonster('S');
    m.hp = 5; // very low HP
    const shieldAmt = m.shield;
    const result = m.takeDamage(shieldAmt + 10);
    expect(result.killed).toBe(true);
    expect(m.shield).toBe(0);
    expect(m.hp).toBe(0);
    expect(m.alive).toBe(false);
  });

  it('damage exactly equal to shield: shield drops to 0, no HP damage', () => {
    const m = makeMonster('S');
    const shieldAmt = m.shield;
    const prevHp = m.hp;
    const result = m.takeDamage(shieldAmt);
    expect(m.shield).toBe(0);
    expect(m.hp).toBe(prevHp);
    expect(result.hpDamage).toBe(0);
    expect(result.killed).toBe(false);
  });

  it('string input returns killed:false', () => {
    const m = makeMonster(1);
    const result = m.takeDamage('10');
    expect(result.killed).toBe(false);
  });

  it('shatter bonus applies extra damage then disarms', () => {
    const m = makeMonster(1);
    m.applySlow(0.5, 2.0, 1.0); // 100% bonus
    const prevHp = m.hp;
    m.takeDamage(10);
    expect(prevHp - m.hp).toBe(20); // 10 * (1+1.0)
    expect(m.shatterArmed).toBe(false);
  });

  it('shatter bonus does not apply when slowTimer is 0', () => {
    const m = makeMonster(1);
    m.shatterArmed = true;
    m.slowTimer = 0;
    const prevHp = m.hp;
    m.takeDamage(10);
    expect(prevHp - m.hp).toBe(10); // no bonus
  });

  it('shield break resets shieldRegenTimer', () => {
    const m = makeMonster('S');
    m.shieldRegenTimer = 999;
    m.takeDamage(m.shield + 1); // break shield
    expect(m.shieldRegenTimer).toBe(0);
  });
});

// ─── applySlow edge cases ─────────────────────────────────────────────────

describe('applySlow edge cases', () => {
  it('uses max of current and new slow duration', () => {
    const m = makeMonster(1);
    m.applySlow(0.5, 3.0, 0.2);
    expect(m.slowTimer).toBe(3.0);
    m.applySlow(0.5, 5.0, 0.2);
    expect(m.slowTimer).toBe(5.0); // 5 > 3, so max wins
  });

  it('new shorter slow does not reduce existing slowTimer', () => {
    const m = makeMonster(1);
    m.applySlow(0.5, 5.0, 0.2);
    m.applySlow(0.5, 1.0, 0.2);
    expect(m.slowTimer).toBe(5.0); // existing longer
  });

  it('sets _slowColorTint to 1', () => {
    const m = makeMonster(1);
    m.applySlow(0.5, 1.0, 0);
    expect(m._slowColorTint).toBe(1);
  });

  it('shielded monster with 0 shield can be slowed', () => {
    const m = makeMonster('S');
    m.shield = 0;
    expect(m.applySlow(0.5, 1.0)).toBe(true);
    expect(m.speed).toBeLessThan(m.baseSpeed);
  });
});

// ─── findTarget edge cases ─────────────────────────────────────────────────

describe('findTarget edge cases', () => {
  it('picks closest troop by pixel distance when multiple on different tiles', () => {
    const m = makeMonster(1);
    const near = makeTroop(0, 0);
    const far = makeTroop(1, 0);
    const idx = buildTileIndex([near, far]);
    const target = m.findTarget(idx);
    expect(target).toBe(near);
  });

  it('handles troop at exact boundary of tileRange', () => {
    const m = makeMonster('X'); // Spear has attackRange 2.5
    const troop = makeTroop(2, 0);
    const idx = buildTileIndex([troop]);
    const target = m.findTarget(idx);
    expect(target).toBe(troop);
  });

  it('skips troops outside tileRange', () => {
    const m = makeMonster(1); // Grunt attackRange=1
    const troop = makeTroop(3, 0); // 3 tiles away
    const idx = buildTileIndex([troop]);
    const target = m.findTarget(idx);
    expect(target).toBeNull();
  });

  it('handles negative tile coordinates without crash', () => {
    const m = makeMonster(1);
    m._tileGx = 0;
    m._tileGy = 0;
    const idx = buildTileIndex([]);
    // Should not crash even though dx/dy would go negative
    const target = m.findTarget(idx);
    expect(target).toBeNull();
  });

  it('handles troops at grid edges', () => {
    const m = makeMonster(1);
    m._tileGx = CONFIG.GRID_SIZE - 1;
    m._tileGy = CONFIG.GRID_SIZE - 1;
    const troop = makeTroop(CONFIG.GRID_SIZE - 1, CONFIG.GRID_SIZE - 1);
    const idx = buildTileIndex([troop]);
    const target = m.findTarget(idx);
    expect(target).toBe(troop);
  });
});

// ─── _updateRegen edge cases ───────────────────────────────────────────────

describe('_updateRegen edge cases', () => {
  it('shield does not regen when already at maxShield', () => {
    const m = makeMonster('S', [[0, 0]], { segments: [], totalLength: 0 });
    m.shield = m.maxShield;
    m._updateRegen(CONFIG.SHIELD_REGEN_DELAY + 10);
    expect(m.shield).toBe(m.maxShield);
  });

  it('shield regen timer accumulates across multiple frames', () => {
    const m = makeMonster('S', [[0, 0]], { segments: [], totalLength: 0 });
    m.shield = 0;
    const halfDelay = CONFIG.SHIELD_REGEN_DELAY / 2;
    m._updateRegen(halfDelay);
    expect(m.shield).toBe(0); // not yet
    m._updateRegen(halfDelay);
    expect(m.shield).toBeGreaterThan(0); // now past delay
  });

  it('boss heal caps at maxHp', () => {
    const m = makeMonster('B', [[0, 0]], { segments: [], totalLength: 0 });
    m.hp = m.maxHp - 1;
    m._updateRegen(100); // huge dt
    expect(m.hp).toBe(m.maxHp);
  });

  it('shield regen uses CONFIG.SHIELD_REGEN_RATE per dt', () => {
    const m = makeMonster('S', [[0, 0]], { segments: [], totalLength: 0 });
    m.shield = 0;
    // Advance past the delay threshold first
    m._updateRegen(CONFIG.SHIELD_REGEN_DELAY + 0.01);
    const beforeShield = m.shield;
    // Now check regen for exactly 1.0s
    m._updateRegen(1.0);
    expect(m.shield).toBeCloseTo(beforeShield + CONFIG.SHIELD_REGEN_RATE * 1.0);
  });
});

// ─── _updateStopMode edge cases ────────────────────────────────────────────

describe('_updateStopMode edge cases', () => {
  function longPath() {
    const T = CONFIG.TILE_SIZE;
    return { segments: [{ ax: 0, ay: 0, bx: T * 10, by: 0, len: T * 10, cumStart: 0 }], totalLength: T * 10 };
  }

  it('ATTACKING + target dies → transitions to MOVING', () => {
    const m = makeMonster(1, [[0, 0]], longPath());
    m.state = 'ATTACKING';
    const troop = makeTroop(1, 0);
    troop.alive = false;
    m.attackTarget = troop;
    m._updateStopMode(0.1, buildTileIndex([]));
    expect(m.state).toBe('MOVING');
    expect(m.attackTarget).toBeNull();
  });

  it('ATTACKING + target out of range → transitions to MOVING', () => {
    const m = makeMonster(1, [[0, 0]], longPath());
    m.state = 'ATTACKING';
    const troop = makeTroop(10, 10); // far away
    m.attackTarget = troop;
    m._updateStopMode(0.1, buildTileIndex([troop]));
    expect(m.state).toBe('MOVING');
    expect(m.attackTarget).toBeNull();
  });

  it('ATTACKING + in range + timer fires → sets _pendingAttack', () => {
    const m = makeMonster(1, [[0, 0]], longPath());
    m.state = 'ATTACKING';
    const troop = makeTroop(0, 0);
    m.attackTarget = troop;
    m.attackTimer = 0; // timer expired
    m._updateStopMode(0.1, buildTileIndex([troop]));
    expect(m._pendingAttack).toBe(troop);
  });

  it('ATTACKING + in range + timer not fired → decrements timer', () => {
    const m = makeMonster(1, [[0, 0]], longPath());
    m.state = 'ATTACKING';
    const troop = makeTroop(0, 0);
    m.attackTarget = troop;
    m.attackTimer = 0.5; // set to a value > dt so it won't fire
    m._updateStopMode(0.1, buildTileIndex([troop]));
    expect(m.attackTimer).toBeCloseTo(0.4);
  });

  it('MOVING + no tile index → stays MOVING', () => {
    const m = makeMonster(1, [[0, 0]], longPath());
    m.state = 'MOVING';
    m._updateStopMode(0.1, null);
    expect(m.state).toBe('MOVING');
  });
});

// ─── _updateSlowMode edge cases ────────────────────────────────────────────

describe('_updateSlowMode edge cases', () => {
  function longPath() {
    const T = CONFIG.TILE_SIZE;
    return { segments: [{ ax: 0, ay: 0, bx: T * 10, by: 0, len: T * 10, cumStart: 0 }], totalLength: T * 10 };
  }

  it('no near target + slowTimer > 0: speed stays low', () => {
    const m = makeMonster('X', [[0, 0]], longPath()); // Spear has slow mode
    m.state = 'MOVING';
    m.slowTimer = 2.0; // currently slowed
    m.speed = m.baseSpeed * 0.5;
    const emptyIdx = buildTileIndex([]);
    m._updateSlowMode(0.1, emptyIdx);
    expect(m.speed).toBeLessThan(m.baseSpeed);
  });

  it('no near target + slowTimer <= 0: speed restores', () => {
    const m = makeMonster('X', [[0, 0]], longPath());
    m.state = 'MOVING';
    m.slowTimer = 0;
    m.speed = m.baseSpeed * 0.5;
    m._updateSlowMode(0.1, buildTileIndex([]));
    expect(m.speed).toBe(m.baseSpeed);
  });

  it('near target + timer fires → sets _pendingAttack', () => {
    const m = makeMonster('X', [[0, 0]], longPath());
    m.state = 'MOVING';
    const troop = makeTroop(2, 0);
    m.attackTimer = 0;
    m._updateSlowMode(0.1, buildTileIndex([troop]));
    expect(m._pendingAttack).toBe(troop);
  });

  it('near target + speed capped at baseSpeed * 0.5', () => {
    const m = makeMonster('X', [[0, 0]], longPath());
    m.state = 'MOVING';
    m.speed = m.baseSpeed;
    const troop = makeTroop(2, 0);
    m._updateSlowMode(0.1, buildTileIndex([troop]));
    expect(m.speed).toBeLessThanOrEqual(m.baseSpeed * 0.5);
  });
});

// ─── _updatePassMode edge cases ────────────────────────────────────────────

describe('_updatePassMode edge cases', () => {
  function longPath() {
    const T = CONFIG.TILE_SIZE;
    return { segments: [{ ax: 0, ay: 0, bx: T * 10, by: 0, len: T * 10, cumStart: 0 }], totalLength: T * 10 };
  }

  it('no troops on tile → _pendingAttack stays null', () => {
    const m = makeMonster(2, [[0, 0]], longPath());
    m._lastPassTile = -1;
    m._updatePassMode(buildTileIndex([]));
    expect(m._pendingAttack).toBeNull();
  });

  it('same tile visited twice → only first visit triggers attack', () => {
    const m = makeMonster(2, [[0, 0]], longPath());
    const troop = makeTroop(0, 0);
    m._lastPassTile = -1;
    m._updatePassMode(buildTileIndex([troop]));
    expect(m._pendingAttack).toBe(troop);
    m._pendingAttack = null;
    // tileIdx same as _lastPassTile → no re-attack
    m._updatePassMode(buildTileIndex([troop]));
    expect(m._pendingAttack).toBeNull();
  });

  it('dead troops in _hitTroops are pruned when size > 16', () => {
    const m = makeMonster(2, [[0, 0]], longPath());
    m._hitTroops = new Set();
    // Add 17 dead troops
    for (let i = 0; i < 17; i++) {
      m._hitTroops.add({ alive: false });
    }
    // Trigger pruning path
    m._lastPassTile = -1;
    m._updatePassMode(buildTileIndex([]));
    expect(m._hitTroops.size).toBe(0);
  });

  it('alive troops in _hitTroops survive pruning', () => {
    const m = makeMonster(2, [[0, 0]], longPath());
    const aliveTroop = { alive: true, x: 0, y: 0 };
    m._hitTroops = new Set();
    for (let i = 0; i < 17; i++) {
      m._hitTroops.add({ alive: false });
    }
    m._hitTroops.add(aliveTroop);
    m._lastPassTile = -1;
    m._updatePassMode(buildTileIndex([]));
    expect(m._hitTroops.size).toBe(1);
    expect(m._hitTroops.has(aliveTroop)).toBe(true);
  });

  it('skips already-hit troops in adjacent tiles', () => {
    const m = makeMonster(2, [[0, 0]], longPath());
    m._hitTroops = new Set(); // must initialize before use
    const troop1 = makeTroop(0, 0);
    const troop2 = makeTroop(1, 0);
    m._hitTroops.add(troop1);
    m._lastPassTile = -1;
    m._updatePassMode(buildTileIndex([troop1, troop2]));
    expect(m._pendingAttack).toBe(troop2);
    expect(m._hitTroops.has(troop2)).toBe(true);
  });

  it('handles out-of-bounds tile coordinates', () => {
    const m = makeMonster(2, [[0, 0]], longPath());
    m._tileGx = 0;
    m._tileGy = 0;
    m._lastPassTile = -1;
    // dx=-1, dy=-1 would be (-1,-1) → out of bounds, should skip
    m._updatePassMode(buildTileIndex([]));
    expect(m._pendingAttack).toBeNull();
  });
});

// ─── update() integration ─────────────────────────────────────────────────

describe('update() integration', () => {
  function longPath() {
    const T = CONFIG.TILE_SIZE;
    return { segments: [{ ax: 0, ay: 0, bx: T * 10, by: 0, len: T * 10, cumStart: 0 }], totalLength: T * 10 };
  }

  it('dead monster returns early without updating', () => {
    const m = makeMonster(1, [[0, 0]], longPath());
    m.alive = false;
    const prevDist = m.distance;
    m.update(0.1, buildTileIndex([]));
    expect(m.distance).toBe(prevDist);
  });

  it('stunned monster skips movement but still updates regen/slowDecay/reviveGlow', () => {
    const m = makeMonster(1, [[0, 0]], longPath());
    m.stunTimer = 1.0;
    m.applySlow(0.5, 2.0, 0.5);
    m._reviveGlowTimer = 1.0;
    m.reviveGlow = true;
    const prevDist = m.distance;
    m.update(0.1, buildTileIndex([]));
    // Stun prevents movement
    expect(m.distance).toBe(prevDist);
    // But regen/decay still run
    expect(m.slowTimer).toBeCloseTo(1.9); // decremented by 0.1
    expect(m._reviveGlowTimer).toBeCloseTo(0.9);
  });

  it('stunTimer decrements to 0 and monster resumes', () => {
    const m = makeMonster(1, [[0, 0]], longPath());
    m.stunTimer = 0.05;
    m.update(0.1, buildTileIndex([]));
    expect(m.stunTimer).toBe(0);
    // Next update should move
    const prevDist = m.distance;
    m.update(0.1, buildTileIndex([]));
    expect(m.distance).toBeGreaterThan(prevDist);
  });

  it('monster reaches end of path → reachedEnd=true and returns', () => {
    const m = makeMonster(1, [[0, 0]], longPath());
    m.distance = m.totalLength - 0.1; // just before end
    m.update(1.0, buildTileIndex([])); // big dt pushes past end
    expect(m.reachedEnd).toBe(true);
    expect(m.distance).toBe(m.totalLength);
  });

  it('stop mode: MOVING finds troop and transitions to ATTACKING', () => {
    const m = makeMonster(1, [[0, 0]], longPath());
    m.state = 'MOVING';
    const troop = makeTroop(0, 0);
    m.update(0.1, buildTileIndex([troop]));
    expect(m.state).toBe('ATTACKING');
    expect(m.attackTarget).toBe(troop);
  });

  it('stop mode: ATTACKING target dies mid-attack → transitions to MOVING', () => {
    const m = makeMonster(1, [[0, 0]], longPath());
    m.state = 'ATTACKING';
    const troop = makeTroop(0, 0);
    troop.alive = false;
    m.attackTarget = troop;
    m.update(0.1, buildTileIndex([]));
    expect(m.state).toBe('MOVING');
  });

  it('pass mode monster: attacks troops while moving', () => {
    const m = makeMonster(2, [[0, 0]], longPath()); // Runner = pass mode
    m.state = 'MOVING';
    m._lastPassTile = -1;
    const troop = makeTroop(0, 0);
    m.update(0.1, buildTileIndex([troop]));
    expect(m._pendingAttack).toBe(troop);
  });

  it('slow mode monster: slows speed when near troop', () => {
    const m = makeMonster('X', [[0, 0]], longPath()); // Spear = slow mode
    m.state = 'MOVING';
    const troop = makeTroop(2, 0);
    m.update(0.1, buildTileIndex([troop]));
    expect(m.speed).toBeLessThan(m.baseSpeed);
  });

  it('ATTACKING state at start of update → _updateStopMode runs', () => {
    const m = makeMonster(1, [[0, 0]], longPath());
    m.state = 'ATTACKING';
    const troop = makeTroop(0, 0);
    m.attackTarget = troop;
    m.attackTimer = 99; // won't fire
    m.update(0.1, buildTileIndex([troop]));
    // Still attacking, target still alive and in range
    expect(m.state).toBe('ATTACKING');
  });

  it('MOVING without tileIndex stays MOVING (no crash)', () => {
    const m = makeMonster(1, [[0, 0]], longPath());
    m.state = 'MOVING';
    m.update(0.1, null);
    expect(m.state).toBe('MOVING');
    expect(m.reachedEnd).toBe(false);
  });

  it('MOVING + pass mode without tileIndex: no crash', () => {
    const m = makeMonster(2, [[0, 0]], longPath());
    m.state = 'MOVING';
    m.update(0.1, null);
    expect(m.state).toBe('MOVING');
  });

  it('MOVING + slow mode without tileIndex: no crash', () => {
    const m = makeMonster('X', [[0, 0]], longPath());
    m.state = 'MOVING';
    m.update(0.1, null);
    expect(m.state).toBe('MOVING');
  });

  it('update calls _updateRegen even when not moving', () => {
    const m = makeMonster('S', [[0, 0]], longPath());
    m.shield = 0;
    m.state = 'ATTACKING';
    m.attackTarget = null; // will transition to MOVING
    m.state = 'MOVING';
    m.update(CONFIG.SHIELD_REGEN_DELAY, buildTileIndex([]));
    expect(m.shield).toBeGreaterThan(0);
  });

  it('update calls _updateSlowDecay even when not moving', () => {
    const m = makeMonster(1, [[0, 0]], longPath());
    m.applySlow(0.5, 0.5, 0);
    m.state = 'ATTACKING';
    m.attackTarget = null;
    m.update(1.0, buildTileIndex([]));
    expect(m.slowTimer).toBe(0);
    expect(m.speed).toBe(m.baseSpeed);
  });

  it('hpMult=undefined defaults to 1 via || 1 fallback', () => {
    const m = new Monster(1, [[0, 0]], sharedPath(), undefined);
    expect(m.hpMult).toBe(1);
    expect(m.maxHp).toBe(MONSTER_SPECS[1].hp);
  });

  it('hpMult=0 produces maxHp=0 (raw param used for calculation)', () => {
    const m = new Monster(1, [[0, 0]], sharedPath(), 0);
    expect(m.maxHp).toBe(0);
  });
});

// ─── Necromancer milestone 3 acceptance ─────────────────────────────────────

describe('Necromancer milestone 3 acceptance', () => {
  it('has Necromancer spec fields', () => {
    const necro = MONSTER_SPECS.Y;
    expect(necro.name).toBe('Necromancer');
    expect(necro.noSplit).toBe(true);
    expect(necro.reviveRange).toBe(2.0);
    expect(necro.reviveHpRatio).toBe(0.5);
    expect(necro.reviveMaxTargets).toBe(4);
    expect(necro.reviveGlowDuration).toBe(1.5);
  });

  it('constructs Monster Y as Necromancer and does not split it when killed', () => {
    const necro = makeMonster('Y');
    const game = makeFakeGame([necro]);
    vi.spyOn(AUDIO, 'goldEarned');
    vi.spyOn(PARTICLES, 'spawn');

    expect(necro.spec.name).toBe('Necromancer');
    expect(Game.prototype.damageMonster.call(game, necro, necro.hp)).toBe(true);

    expect(game.monsters).toHaveLength(1);
    expect(necro.alive).toBe(false);
    expect(game.gold).toBe(necro.reward + 1);
  });

  it.each([3, 4, 5])('revived level %s monsters do not split when killed', (level) => {
    const necro = fakeMonster('Y', 0, 0);
    const target = makeMonsterAt(level, 1, 0);
    const game = makeReviveGame([necro, target]);

    target.alive = false;
    target.hp = 0;
    target.reachedEnd = false;

    Game.prototype._stepNecromancerRevives.call(game);
    expect(target.reviveImmune).toBe(true);
    expect(target.reviveDamageRatio).toBe(0.5);
    expect(target.reviveGlow).toBe(true);

    expect(Game.prototype.damageMonster.call(game, target, target.hp)).toBe(true);
    expect(game.monsters.filter((monster) => monster !== necro && monster !== target)).toHaveLength(0);
    expect(target.alive).toBe(false);
  });

  it('revived monsters deal 50% damage to defense troops', () => {
    const monster = makeMonster(3);
    monster.reviveImmune = true;
    monster.reviveDamageRatio = 0.5;
    const troop = {
      spec: { type: 'ranged' },
      hp: 100,
      maxHp: 100,
      alive: true,
      x: 0,
      y: 0,
      takeDamage(damage) {
        this.hp -= damage;
        if (this.hp <= 0) { this.alive = false; return true; }
        return false;
      },
    };
    const game = { popups: [], killTroop: vi.fn(), _getPopup(text, x, y, t, color) { this.popups.push({ text, x, y, t, color }); } };

    Game.prototype.damageTroop.call(game, monster, troop);

    const expectedDamage = Math.max(1, Math.round(monster.spec.damage * 0.5));
    expect(troop.hp).toBe(100 - expectedDamage);
  });

  it('revives the nearest dead monster in range to partial HP', () => {
    const necro = fakeMonster('Y', 0, 0);
    const far = fakeMonster(1, CONFIG.TILE_SIZE * 4, 0, { alive: false });
    const near = fakeMonster(2, CONFIG.TILE_SIZE, 0, { alive: false, maxHp: 100 });
    const game = makeReviveGame([necro, far, near]);

    Game.prototype._stepNecromancerRevives.call(game);

    expect(near.alive).toBe(true);
    expect(near.hp).toBe(Math.round(100 * MONSTER_SPECS.Y.reviveHpRatio));
    expect(near.reviveGlow).toBe(true);
    expect(near.reachedEnd).toBe(false);
    expect(near.state).toBe('MOVING');
    expect(near._reviveLock).toBe(true);
    expect(near.reviveDamageRatio).toBe(0.5);
    expect(far.alive).toBe(false);
    expect(necro.reviveCount).toBe(1);
    expect(necro.reviveUsed).toBe(true);
  });

  it('revives up to four eligible monsters per Necromancer', () => {
    const necro = fakeMonster('Y', 0, 0);
    const targets = Array.from({ length: 4 }, (_, index) =>
      fakeMonster(index + 1, CONFIG.TILE_SIZE * (0.25 + index * 0.25), 0, { alive: false, maxHp: 100 })
    );
    const game = makeReviveGame([necro, ...targets]);

    Game.prototype._stepNecromancerRevives.call(game);

    expect(targets.every((target) => target.alive)).toBe(true);
    expect(targets.every((target) => target.hp === 50)).toBe(true);
    expect(necro.reviveCount).toBe(4);
  });

  it('does not revive a fifth in-range target', () => {
    const necro = fakeMonster('Y', 0, 0);
    const targets = Array.from({ length: 5 }, (_, index) =>
      fakeMonster(index + 1, CONFIG.TILE_SIZE * (0.25 + index * 0.25), 0, { alive: false, maxHp: 100 })
    );
    const game = makeReviveGame([necro, ...targets]);

    Game.prototype._stepNecromancerRevives.call(game);

    expect(targets.slice(0, 4).every((target) => target.alive)).toBe(true);
    expect(targets[4].alive).toBe(false);
    expect(necro.reviveCount).toBe(4);
  });

  it('skips dead Necromancers as revive targets', () => {
    const necro = fakeMonster('Y', 0, 0);
    const deadNecro = fakeMonster('Y', CONFIG.TILE_SIZE, 0, { alive: false });
    const target = fakeMonster(1, CONFIG.TILE_SIZE * 1.5, 0, { alive: false, maxHp: 100 });
    const game = makeReviveGame([necro, deadNecro, target]);

    Game.prototype._stepNecromancerRevives.call(game);

    expect(deadNecro.alive).toBe(false);
    expect(target.alive).toBe(true);
    expect(necro.reviveCount).toBe(1);
  });

  it('skips dead monsters that reached the end', () => {
    const necro = fakeMonster('Y', 0, 0);
    const dead = fakeMonster(1, CONFIG.TILE_SIZE, 0, { alive: false, reachedEnd: true });
    const game = makeReviveGame([necro, dead]);

    Game.prototype._stepNecromancerRevives.call(game);

    expect(dead.alive).toBe(false);
    expect(necro.reviveCount).toBe(0);
  });

  it('revives a dead monster exactly two tiles away', () => {
    const necro = fakeMonster('Y', 0, 0);
    const target = fakeMonster(1, CONFIG.TILE_SIZE * 2, 0, { alive: false, maxHp: 100 });
    const game = makeReviveGame([necro, target]);

    Game.prototype._stepNecromancerRevives.call(game);

    expect(target.alive).toBe(true);
    expect(target.hp).toBe(50);
    expect(necro.reviveCount).toBe(1);
  });

  it('default dev monster counts include Necromancer', () => {
    const counts = Game.prototype._defaultDevCounts.call({});
    expect(counts.Y).toBe(0);
    expect(Object.keys(counts)).toContain('Y');
  });
});
