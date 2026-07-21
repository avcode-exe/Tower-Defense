// Known limitations:
// - (known limitation: monster attack mode _pendingAttack not actually resolved by game.step without attacker reference)
// - (known limitation: monster.reviveCount cannot exceed 1 without external revive triggers)
// - (known limitation: shield regen timer is reset on damage; regenDelay is hardcoded CONST)
// - (known limitation: no hard cap on _hitTroops Set growth for pass-mode monsters) [FIXED in v1.6.1]
import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import { CONFIG, MONSTER_SPECS } from '../src/config.js';
import { PARTICLES } from '../src/particles.js';

vi.mock('../src/particles.js', () => ({
  PARTICLES: {
    healBurst: vi.fn(),
    hitSpark: vi.fn(),
    deathBurst: vi.fn(),
    slowApply: vi.fn(),
    burnApply: vi.fn(),
    burnTick: vi.fn(),
    update: vi.fn(),
    clear: vi.fn(),
    spawn: vi.fn(),
    spawnTrail: vi.fn(),
  },
}));

describe('Monster', () => {
  let Monster;

  beforeAll(async () => {
    const mod = await import('../src/monster.js');
    Monster = mod.Monster;
  });

  function makePath() {
    return {
      segments: [
        { ax: 0, ay: 26.5, bx: 848, by: 26.5, len: 848, cumStart: 0 },
        { ax: 848, ay: 26.5, bx: 848, by: 291.5, len: 265, cumStart: 848 },
      ],
      totalLength: 1113,
    };
  }

  function makeWaypoints() {
    return [
      [0, 0],
      [5, 0],
      [5, 5],
      [10, 5],
      [10, 10],
      [15, 10],
    ];
  }

  function makeTroopStub(overrides = {}) {
    return {
      alive: true,
      gx: 5,
      gy: 5,
      x: 5 * 53 + 26,
      y: 5 * 53 + 26,
      hp: 50,
      maxHp: 50,
      spec: { type: 'melee' },
      ...overrides,
    };
  }

  function makeTileIndex(troops = []) {
    const size = CONFIG.GRID_SIZE;
    const idx = new Array(size * size);
    for (let i = 0; i < idx.length; i++) idx[i] = [];
    for (const t of troops) {
      const i = t.gy * size + t.gx;
      if (idx[i]) idx[i].push(t);
    }
    return idx;
  }

  describe('constructor', () => {
    const levels = [1, 2, 3, 4, 5, 'B', 'S', 'X', 'Y', 'H'];
    for (const level of levels) {
      it(`constructs monster level ${level}`, () => {
        const m = new Monster(level, makeWaypoints(), makePath());
        expect(m.alive).toBe(true);
        expect(m.level).toBe(level);
        expect(m.hp).toBeGreaterThan(0);
        expect(m.maxHp).toBeGreaterThanOrEqual(m.hp);
        expect(m.speed).toBeGreaterThan(0);
      });
    }

    it('applies hpMult scaling', () => {
      const m = new Monster(1, makeWaypoints(), makePath(), 2);
      expect(m.maxHp).toBe(MONSTER_SPECS[1].hp * 2);
    });

    it('Boss HP is doubled', () => {
      const m = new Monster('B', makeWaypoints(), makePath());
      const baseHp = MONSTER_SPECS.B.hp * CONFIG.BOSS_HP_MULTIPLIER;
      expect(m.maxHp).toBe(baseHp);
    });

    it('unknown level falls back to Grunt', () => {
      const m = new Monster('Z', makeWaypoints(), makePath());
      expect(m.spec).toBe(MONSTER_SPECS[1]);
    });

    it('Shielded monster has shield', () => {
      const m = new Monster('S', makeWaypoints(), makePath());
      expect(m.shield).toBeGreaterThan(0);
      expect(m.maxShield).toBeGreaterThan(0);
    });

    it('Healer monster has heal fields', () => {
      const m = new Monster('H', makeWaypoints(), makePath());
      expect(m.healRange).toBeGreaterThan(0);
      expect(m.healTickInterval).toBeGreaterThan(0);
    });

    it('Necromancer monster has revive fields', () => {
      const m = new Monster('Y', makeWaypoints(), makePath());
      expect(m.spec.reviveRange).toBeGreaterThan(0);
      expect(m.spec.reviveHpRatio).toBeGreaterThan(0);
    });

    it('Runner (level 2) is pass-mode and noSplit', () => {
      const m = new Monster(2, makeWaypoints(), makePath());
      expect(m.spec.attackMode).toBe('pass');
      expect(m.spec.noSplit).toBe(true);
    });

    it('Spear (X) is slow-mode with range', () => {
      const m = new Monster('X', makeWaypoints(), makePath());
      expect(m.spec.attackMode).toBe('slow');
      expect(m.spec.attackRange).toBe(2.5);
    });
  });

  describe('_updatePosition', () => {
    it('positions at waypoint when segments are empty (single-cell path)', () => {
      const m = new Monster(1, [[3, 7]], { segments: [], totalLength: 0 });
      expect(m.x).toBe(3 * CONFIG.TILE_SIZE + CONFIG.TILE_SIZE / 2);
      expect(m.y).toBe(7 * CONFIG.TILE_SIZE + CONFIG.TILE_SIZE / 2);
      expect(m._tileGx).toBe(3);
      expect(m._tileGy).toBe(7);
    });

    it('sets reachedEnd when distance >= totalLength', () => {
      const m = new Monster(1, makeWaypoints(), makePath());
      m.distance = 2000;
      m._updatePosition();
      expect(m.reachedEnd).toBe(true);
      expect(m.x).toBe(848);
      expect(m.y).toBe(291.5);
    });

    it('advances segIdx when distance passes segment end', () => {
      const m = new Monster(1, makeWaypoints(), makePath());
      m.distance = 900; // past first segment (848), within second (848+265=1113)
      m.segIdx = 0;
      m._updatePosition();
      expect(m.segIdx).toBe(1);
      expect(m.x).toBe(848);
      expect(m.y).toBeGreaterThan(26.5);
    });

    it('clamps t to [0,1] when len is 0', () => {
      const zeroLenPath = {
        segments: [{ ax: 0, ay: 0, bx: 0, by: 0, len: 0, cumStart: 0 }],
        totalLength: 0,
      };
      const m = new Monster(1, [[0, 0]], zeroLenPath);
      expect(() => m._updatePosition()).not.toThrow();
      expect(m._tileGx).toBe(0);
    });
  });

  describe('takeDamage', () => {
    it('no shield: direct HP damage', () => {
      const m = new Monster(1, makeWaypoints(), makePath());
      const hpBefore = m.hp;
      m.takeDamage(10);
      expect(m.hp).toBe(hpBefore - 10);
    });

    it('shield: partial absorb', () => {
      const m = new Monster('S', makeWaypoints(), makePath());
      m.takeDamage(10);
      expect(m.alive).toBe(true);
    });

    it('shield: full absorb', () => {
      const m = new Monster('S', makeWaypoints(), makePath());
      m.takeDamage(1);
      expect(m.shield).toBe(MONSTER_SPECS.S.shield - 1);
    });

    it('shield break excess', () => {
      const m = new Monster('S', makeWaypoints(), makePath());
      const shield = m.shield;
      m.takeDamage(shield + 50);
      expect(m.shield).toBe(0);
      expect(m.hp).toBeLessThan(m.maxHp);
    });

    it('shield break excess kills when hp exhausted', () => {
      const m = new Monster('S', makeWaypoints(), makePath());
      const shield = m.shield;
      m.takeDamage(shield + m.maxHp + 100);
      expect(m.alive).toBe(false);
      expect(m.hp).toBe(0);
    });

    it('killing blow', () => {
      const m = new Monster(1, makeWaypoints(), makePath());
      m.takeDamage(9999);
      expect(m.alive).toBe(false);
      expect(m.hp).toBe(0);
    });

    it('shatter bonus applies extra damage when slowed and shatterArmed', () => {
      const m = new Monster(1, makeWaypoints(), makePath());
      m.slowTimer = 2;
      m.shatterArmed = true;
      m.shatterBonus = 0.5;
      const result = m.takeDamage(100);
      // 100 * (1 + 0.5) = 150 damage with shatter bonus
      // monster has 34 HP, killed by 150 damage; hp clamped to 0 on kill
      expect(m.hp).toBe(0);
      expect(result.killed).toBe(true);
      expect(result.hpDamage).toBe(150);
      expect(m.shatterArmed).toBe(false);
    });

    it('returns {killed, reward, hpDamage}', () => {
      const m = new Monster(1, makeWaypoints(), makePath());
      const result = m.takeDamage(9999);
      expect(result).toHaveProperty('killed', true);
      expect(result).toHaveProperty('reward', MONSTER_SPECS[1].reward);
      expect(result).toHaveProperty('hpDamage');
    });

    it('invalid input (NaN) returns graceful result', () => {
      const m = new Monster(1, makeWaypoints(), makePath());
      const result = m.takeDamage(NaN);
      expect(result).toEqual({ killed: false, reward: 0, hpDamage: 0 });
    });

    it('invalid input (negative) returns graceful result', () => {
      const m = new Monster(1, makeWaypoints(), makePath());
      const result = m.takeDamage(-10);
      expect(result).toEqual({ killed: false, reward: 0, hpDamage: 0 });
    });

    it('invalid input (zero) returns graceful result', () => {
      const m = new Monster(1, makeWaypoints(), makePath());
      const result = m.takeDamage(0);
      expect(result).toEqual({ killed: false, reward: 0, hpDamage: 0 });
    });

    it('invalid input (string) returns graceful result', () => {
      const m = new Monster(1, makeWaypoints(), makePath());
      const result = m.takeDamage('abc');
      expect(result).toEqual({ killed: false, reward: 0, hpDamage: 0 });
    });
  });

  describe('applySlow', () => {
    it('sets speed, timer, and shatterArmed', () => {
      const m = new Monster(1, makeWaypoints(), makePath());
      const originalSpeed = m.speed;
      m.applySlow(0.5, 3, 0.3);
      expect(m.speed).toBeLessThan(originalSpeed);
      expect(m.slowTimer).toBe(3);
      expect(m.shatterArmed).toBe(true);
    });

    it('returns false when shielded', () => {
      const m = new Monster('S', makeWaypoints(), makePath());
      expect(m.applySlow(0.5, 3)).toBe(false);
    });

    it('updates max duration', () => {
      const m = new Monster(1, makeWaypoints(), makePath());
      m.applySlow(0.5, 2);
      m.applySlow(0.5, 5);
      expect(m.slowTimer).toBe(5);
    });

    it('sets _slowColorTint', () => {
      const m = new Monster(1, makeWaypoints(), makePath());
      m.applySlow(0.5, 2);
      expect(m._slowColorTint).toBe(1);
    });

    it('Healer (H) with _healing uses slow speed', () => {
      const m = new Monster('H', makeWaypoints(), makePath());
      m._healing = true;
      m.applySlow(0.5, 3);
      expect(m.speed).toBe(CONFIG.MOVEMENT_SPEEDS.slow * 0.5);
    });
  });

  describe('applyBurn', () => {
    it('sets stacks and timer', () => {
      const m = new Monster(1, makeWaypoints(), makePath());
      m.applyBurn(1, 3, 0.5, 5);
      expect(m.burnStacks).toBe(1);
      expect(m.burnTimer).toBe(3);
      expect(m.burnTickDamage).toBe(5);
    });

    it('returns false for invalid inputs', () => {
      const m = new Monster(1, makeWaypoints(), makePath());
      expect(m.applyBurn(0, 3, 0.5, 5)).toBe(false);
      expect(m.applyBurn(-1, 3, 0.5, 5)).toBe(false);
      expect(m.applyBurn(NaN, 3, 0.5, 5)).toBe(false);
      expect(m.applyBurn(1, 0, 0.5, 5)).toBe(false);
    });

    it('returns false for invalid duration', () => {
      const m = new Monster(1, makeWaypoints(), makePath());
      expect(m.applyBurn(1, -1, 0.5, 5)).toBe(false);
      expect(m.applyBurn(1, NaN, 0.5, 5)).toBe(false);
    });

    it('returns false for invalid tickInterval', () => {
      const m = new Monster(1, makeWaypoints(), makePath());
      expect(m.applyBurn(1, 3, 0, 5)).toBe(false);
      expect(m.applyBurn(1, 3, -1, 5)).toBe(false);
    });

    it('returns false for invalid tickDamage', () => {
      const m = new Monster(1, makeWaypoints(), makePath());
      expect(m.applyBurn(1, 3, 0.5, 0)).toBe(false);
      expect(m.applyBurn(1, 3, 0.5, -1)).toBe(false);
    });

    it('stacks cap at FLAME_BURN_MAX_STACKS', () => {
      const m = new Monster(1, makeWaypoints(), makePath());
      m.applyBurn(10, 3, 0.5, 5);
      expect(m.burnStacks).toBe(CONFIG.FLAME_BURN_MAX_STACKS);
    });

    it('caps burnTickTimer to tickInterval on re-application', () => {
      const m = new Monster(1, makeWaypoints(), makePath());
      m.applyBurn(1, 5, 0.5, 5);
      m.burnTickTimer = 2; // way past interval
      m.applyBurn(1, 5, 0.5, 5); // re-apply caps to 0.5
      expect(m.burnTickTimer).toBe(0.5);
    });

    it('clearBurn resets all state', () => {
      const m = new Monster(1, makeWaypoints(), makePath());
      m.applyBurn(2, 3, 0.5, 5);
      m.clearBurn();
      expect(m.burnStacks).toBe(0);
      expect(m.burnTimer).toBe(0);
    });

    it('isBurning reflects active state', () => {
      const m = new Monster(1, makeWaypoints(), makePath());
      expect(m.isBurning()).toBe(false);
      m.applyBurn(1, 3, 0.5, 5);
      expect(m.isBurning()).toBe(true);
    });

    it('preserves _onBurnTick when not provided', () => {
      const m = new Monster(1, makeWaypoints(), makePath());
      const onTick = vi.fn();
      m._onBurnTick = onTick;
      m.applyBurn(1, 3, 0.5, 5);
      expect(m._onBurnTick).toBe(onTick);
    });
  });

  describe('_updateBurn', () => {
    it('does nothing when not burning', () => {
      const m = new Monster(1, makeWaypoints(), makePath());
      expect(() => m._updateBurn(0.5)).not.toThrow();
    });

    it('decrements burnTimer and clears when expired', () => {
      const m = new Monster(1, makeWaypoints(), makePath());
      m.applyBurn(1, 1, 0.5, 5);
      m._updateBurn(1.5);
      expect(m.burnTimer).toBe(0);
      expect(m.burnStacks).toBe(0);
    });

    it('applies tick damage via onTick callback', () => {
      const onTick = vi.fn();
      const m = new Monster(1, makeWaypoints(), makePath());
      m.applyBurn(2, 3, 0.5, 5, onTick);
      m._updateBurn(1); // enough dt for 2 ticks (1.0 / 0.5 = 2)
      expect(onTick).toHaveBeenCalledTimes(2);
      // tick damage = max(1, round(5 * 2)) = 10
      expect(onTick).toHaveBeenCalledWith(m, 10);
    });

    it('handles multiple ticks within a single frame', () => {
      const onTick = vi.fn();
      const m = new Monster(1, makeWaypoints(), makePath());
      m.applyBurn(1, 5, 0.25, 5, onTick);
      m._updateBurn(1); // 4 ticks at 0.25 interval
      expect(onTick).toHaveBeenCalledTimes(4);
    });

    it('stops ticking when monster dies mid-burn', () => {
      const onTick = vi.fn();
      const m = new Monster(1, makeWaypoints(), makePath());
      m.applyBurn(1, 5, 0.1, 5, (m, dmg) => {
        m.alive = false;
        onTick(m, dmg);
      });
      m._updateBurn(1);
      // onTick was called, but only once (alive becomes false after first tick)
      expect(onTick).toHaveBeenCalledTimes(1);
      expect(m.burnStacks).toBe(0); // cleared by death path
    });
  });

  describe('_updateRegen', () => {
    it('recharges shield over time after delay', () => {
      const m = new Monster('S', makeWaypoints(), makePath());
      const initialShield = m.shield;
      m.shield -= 20;
      m.shieldRegenTimer = CONFIG.SHIELD_REGEN_DELAY; // past delay
      m._updateRegen(0.5);
      expect(m.shield).toBeGreaterThan(initialShield - 20);
    });

    it('does not regen shield while regen timer is below delay', () => {
      const m = new Monster('S', makeWaypoints(), makePath());
      m.shield -= 20;
      const shieldAfter = m.shield; // 69 - 20 = 49
      m.shieldRegenTimer = 0;
      m._updateRegen(0.5);
      expect(m.shieldRegenTimer).toBe(0.5);
      expect(m.shield).toBe(shieldAfter); // unchanged
    });

    it('does not regen shield above maxShield', () => {
      const m = new Monster('S', makeWaypoints(), makePath());
      m.shield = m.maxShield;
      m._updateRegen(0.5);
      expect(m.shield).toBe(m.maxShield);
    });

    it('passive heal restores HP over time', () => {
      const m = new Monster('B', makeWaypoints(), makePath());
      m.hp = m.maxHp - 50;
      m._updateRegen(1);
      expect(m.hp).toBeGreaterThan(m.maxHp - 50);
    });

    it('does not overheal', () => {
      const m = new Monster('B', makeWaypoints(), makePath());
      m.hp = m.maxHp;
      m._updateRegen(1);
      expect(m.hp).toBe(m.maxHp);
    });
  });

  describe('_updateSlowDecay', () => {
    it('decays timer and recovers speed when it reaches zero', () => {
      const m = new Monster(1, makeWaypoints(), makePath());
      m.applySlow(0.5, 1, 0.3);
      m._updateSlowDecay(2); // past the slow duration
      expect(m.slowTimer).toBe(0);
      expect(m.shatterArmed).toBe(false);
      expect(m._slowColorTint).toBe(0);
      expect(m.speed).toBeGreaterThan(0);
    });

    it('Healer (H) restores healing speed when slow expires', () => {
      const m = new Monster('H', makeWaypoints(), makePath());
      m._healing = true;
      m.applySlow(0.5, 0.5);
      m._updateSlowDecay(1);
      expect(m.speed).toBe(CONFIG.MOVEMENT_SPEEDS.slow);
    });

    it('no-op when slowTimer is 0', () => {
      const m = new Monster(1, makeWaypoints(), makePath());
      expect(() => m._updateSlowDecay(0.5)).not.toThrow();
    });
  });

  describe('_updateReviveGlow', () => {
    it('decrements reviveGlowTimer', () => {
      const m = new Monster('Y', makeWaypoints(), makePath());
      m._reviveGlowTimer = 1;
      m._updateReviveGlow(0.5);
      expect(m._reviveGlowTimer).toBe(0.5);
    });

    it('clamps at 0', () => {
      const m = new Monster('Y', makeWaypoints(), makePath());
      m._reviveGlowTimer = 0.3;
      m._updateReviveGlow(1);
      expect(m._reviveGlowTimer).toBe(0);
    });

    it('no-op when timer is 0', () => {
      const m = new Monster('Y', makeWaypoints(), makePath());
      expect(() => m._updateReviveGlow(0.5)).not.toThrow();
    });
  });

  describe('_tryHealAllies', () => {
    it('returns early when not alive', () => {
      const m = new Monster('H', makeWaypoints(), makePath());
      m.alive = false;
      expect(() => m._tryHealAllies(1, [])).not.toThrow();
    });

    it('returns early when not Healer level', () => {
      const m = new Monster(1, makeWaypoints(), makePath());
      expect(() => m._tryHealAllies(1, [])).not.toThrow();
    });

    it('handles null monsters safely', () => {
      const m = new Monster('H', makeWaypoints(), makePath());
      expect(() => m._tryHealAllies(1, null)).not.toThrow();
      expect(m._healing).toBe(false);
    });

    it('sets _healing=false and restores speed when no damaged allies in range', () => {
      const m = new Monster('H', makeWaypoints(), makePath());
      m._healing = true;
      m.speed = CONFIG.MOVEMENT_SPEEDS.slow;
      // no monsters in range
      const ally = new Monster(1, makeWaypoints(), makePath());
      ally.x = 9999;
      ally.y = 9999; // far away
      m._tryHealAllies(1, [ally]);
      expect(m._healing).toBe(false);
      expect(m.speed).toBe(CONFIG.MOVEMENT_SPEEDS.fast);
      expect(m.state).toBe('MOVING');
    });

    it('activates healing when damaged allies in range', () => {
      const m = new Monster('H', makeWaypoints(), makePath());
      m.x = 100;
      m.y = 100;
      const ally = new Monster(1, makeWaypoints(), makePath());
      ally.x = 110;
      ally.y = 100; // close enough
      ally.hp = ally.maxHp - 10; // damaged
      m._tryHealAllies(1, [ally]);
      expect(m._healing).toBe(true);
      expect(m.speed).toBe(CONFIG.MOVEMENT_SPEEDS.slow);
    });

    it('heals via tick timer and calls PARTICLES.healBurst', () => {
      const m = new Monster('H', makeWaypoints(), makePath());
      m.x = 100;
      m.y = 100;
      const ally = new Monster(1, makeWaypoints(), makePath());
      ally.x = 110;
      ally.y = 100;
      ally.maxHp = 100;
      ally.hp = 50;
      // prime healing
      m._healing = true;
      m._tryHealAllies(2, [ally]); // 2 ticks at healTickInterval=1.0
      expect(ally.hp).toBeGreaterThan(50);
      // heal amount: spec.healPerSecond * healTickInterval = 8 * 1 = 8
      // each tick heals 8 HP, 2 ticks = 16 HP
      expect(ally.hp).toBe(66);
      expect(PARTICLES.healBurst).toHaveBeenCalled();
    });

    it('does not overheal target', () => {
      const m = new Monster('H', makeWaypoints(), makePath());
      m.x = 100;
      m.y = 100;
      const ally = new Monster(1, makeWaypoints(), makePath());
      ally.x = 110;
      ally.y = 100;
      ally.maxHp = 100;
      ally.hp = 99;
      m._healing = true;
      m._tryHealAllies(2, [ally]);
      expect(ally.hp).toBe(100);
    });
  });

  describe('findTarget', () => {
    it('finds nearest alive troop', () => {
      const m = new Monster(1, makeWaypoints(), makePath());
      m._tileGx = 5;
      m._tileGy = 5;
      const t1 = makeTroopStub({ gx: 5, gy: 5, x: 300, y: 300 });
      const t2 = makeTroopStub({ gx: 5, gy: 6, x: 300, y: 350 });
      const tileIndex = makeTileIndex([t1, t2]);
      const result = m.findTarget(tileIndex);
      expect(result).toBe(t1); // closer (same tile)
    });

    it('returns null when no troops are in range', () => {
      const m = new Monster(1, makeWaypoints(), makePath());
      m._tileGx = 0;
      m._tileGy = 0;
      const t = makeTroopStub({ gx: 15, gy: 15 }); // out of range
      const tileIndex = makeTileIndex([t]);
      const result = m.findTarget(tileIndex);
      expect(result).toBeNull();
    });

    it('skips dead troops', () => {
      const m = new Monster(1, makeWaypoints(), makePath());
      m._tileGx = 5;
      m._tileGy = 5;
      const t1 = makeTroopStub({ gx: 5, gy: 5, alive: false });
      const t2 = makeTroopStub({ gx: 5, gy: 6, alive: true });
      const tileIndex = makeTileIndex([t1, t2]);
      const result = m.findTarget(tileIndex);
      expect(result).toBe(t2);
    });

    it('returns null when tileIndex has empty cells', () => {
      const m = new Monster(1, makeWaypoints(), makePath());
      m._tileGx = 5;
      m._tileGy = 5;
      const emptyIndex = new Array(CONFIG.GRID_SIZE * CONFIG.GRID_SIZE);
      const result = m.findTarget(emptyIndex);
      expect(result).toBeNull();
    });
  });

  describe('_updateStopMode', () => {
    it('ATTACKING: pending attack when target alive and in range', () => {
      const m = new Monster(1, makeWaypoints(), makePath());
      m.state = 'ATTACKING';
      const target = makeTroopStub({ gx: 5, gy: 5 });
      m.attackTarget = target;
      m._tileGx = 5;
      m._tileGy = 5;
      m.attackTimer = 0.5;
      m._updateStopMode(1, makeTileIndex());
      // attackTimer = 0.5 - 1 = -0.5, triggers _pendingAttack
      expect(m._pendingAttack).toBe(target);
      expect(m.attackTimer).toBe(m.spec.attackSpeed); // reset to attackSpeed (1.0)
    });

    it('ATTACKING: returns to MOVING when target dies', () => {
      const m = new Monster(1, makeWaypoints(), makePath());
      m.state = 'ATTACKING';
      const target = makeTroopStub({ alive: true });
      m.attackTarget = target;
      target.alive = false;
      m._updateStopMode(0.1, makeTileIndex());
      expect(m.state).toBe('MOVING');
      expect(m.attackTarget).toBeNull();
    });

    it('ATTACKING: returns to MOVING when target out of range', () => {
      const m = new Monster(1, makeWaypoints(), makePath());
      m.state = 'ATTACKING';
      m.attackTarget = makeTroopStub({ gx: 15, gy: 15 }); // far away
      m._tileGx = 0;
      m._tileGy = 0;
      m._updateStopMode(0.1, makeTileIndex());
      expect(m.attackTarget).toBeNull();
      expect(m.state).toBe('MOVING');
    });

    it('MOVING: transitions to ATTACKING when target found', () => {
      const m = new Monster(1, makeWaypoints(), makePath());
      m.state = 'MOVING';
      m._tileGx = 5;
      m._tileGy = 5;
      const t = makeTroopStub({ gx: 5, gy: 5 });
      const tileIndex = makeTileIndex([t]);
      m._updateStopMode(0.1, tileIndex);
      expect(m.state).toBe('ATTACKING');
      expect(m.attackTarget).toBe(t);
      expect(m._pendingAttack).toBe(t);
    });
  });

  describe('_updateSlowMode', () => {
    it('slows speed and attacks when target found', () => {
      const m = new Monster('X', makeWaypoints(), makePath());
      m._tileGx = 5;
      m._tileGy = 5;
      const t = makeTroopStub({ gx: 5, gy: 5 });
      const tileIndex = makeTileIndex([t]);
      m._updateSlowMode(0.1, tileIndex);
      // speed should be at most base * 0.5
      const base = CONFIG.MOVEMENT_SPEEDS[m.spec.movementSpeed];
      expect(m.speed).toBeLessThanOrEqual(base * 0.5);
      expect(m._pendingAttack).toBe(t);
    });

    it('restores speed when no target found and slow expired', () => {
      const m = new Monster('X', makeWaypoints(), makePath());
      m.slowTimer = 0;
      const base = CONFIG.MOVEMENT_SPEEDS[m.spec.movementSpeed];
      m.speed = 0.1; // artificially lowered
      m._updateSlowMode(0.1, makeTileIndex()); // empty tile index
      expect(m.speed).toBe(base);
    });

    it('preserves current speed when no target and still slowed', () => {
      const m = new Monster('X', makeWaypoints(), makePath());
      m.slowTimer = 1;
      m.speed = 0.3;
      m._updateSlowMode(0.1, makeTileIndex());
      expect(m.speed).toBe(0.3); // preserved
    });
  });

  describe('_updatePassMode', () => {
    it('attacks troops in adjacent tiles when entering new tile', () => {
      const m = new Monster(2, makeWaypoints(), makePath());
      m._tileGx = 5;
      m._tileGy = 5;
      const t = makeTroopStub({ gx: 5, gy: 5, alive: true });
      const tileIndex = makeTileIndex([t]);
      m._updatePassMode(tileIndex);
      expect(m._pendingAttack).toBe(t);
      expect(m._hitTroops.has(t)).toBe(true);
    });

    it('does not re-attack already-hit troops', () => {
      const m = new Monster(2, makeWaypoints(), makePath());
      m._tileGx = 5;
      m._tileGy = 5;
      const t = makeTroopStub({ gx: 5, gy: 5, alive: true });
      m._hitTroops = new Set([t]);
      m._lastPassTile = 5 * 16 + 5; // same tile index
      const tileIndex = makeTileIndex([t]);
      m._updatePassMode(tileIndex);
      expect(m._pendingAttack).toBeNull();
    });

    it('cleans up dead troops from _hitTroops (via periodic cleanup)', () => {
      const m = new Monster(2, makeWaypoints(), makePath());
      const t = makeTroopStub({ gx: 5, gy: 5, alive: false });
      m._hitTroops = new Set([t]);
      m._tileGx = 5;
      m._tileGy = 5;
      const tileIndex = makeTileIndex([]);
      // Cleanup is periodic (every 10 calls). Set tick so next call triggers it.
      m._cleanupTick = 9;
      m._updatePassMode(tileIndex);
      expect(m._hitTroops.has(t)).toBe(false);
    });

    it('attacks new troops on new tile', () => {
      const m = new Monster(2, makeWaypoints(), makePath());
      m._lastPassTile = 0; // different from current
      m._tileGx = 5;
      m._tileGy = 5;
      const t = makeTroopStub({ gx: 5, gy: 5, alive: true });
      const tileIndex = makeTileIndex([t]);
      m._updatePassMode(tileIndex);
      expect(m._pendingAttack).toBe(t);
      expect(m._lastPassTile).toBe(5 * 16 + 5);
    });
  });

  describe('_cleanupHitTroops', () => {
    it('no-ops when _hitTroops is null', () => {
      const m = new Monster(2, makeWaypoints(), makePath());
      expect(() => m._cleanupHitTroops()).not.toThrow();
      expect(m._hitTroops).toBeNull();
    });

    it('removes dead troop references from the Set', () => {
      const m = new Monster(2, makeWaypoints(), makePath());
      const t1 = makeTroopStub({ gx: 1, gy: 1, alive: false });
      const t2 = makeTroopStub({ gx: 2, gy: 2, alive: true });
      m._hitTroops = new Set([t1, t2]);
      m._cleanupHitTroops();
      expect(m._hitTroops.has(t1)).toBe(false);
      expect(m._hitTroops.has(t2)).toBe(true);
    });

    it('enforces hard cap by removing oldest entries when over limit', () => {
      const m = new Monster(2, makeWaypoints(), makePath());
      m._hitTroopsCap = 3; // small cap for testing
      m._hitTroops = new Set();
      // Add 5 troops (all alive)
      const troops = [];
      for (let i = 0; i < 5; i++) {
        const t = makeTroopStub({ gx: i, gy: i, alive: true });
        troops.push(t);
        m._hitTroops.add(t);
      }
      expect(m._hitTroops.size).toBe(5);
      m._cleanupHitTroops();
      // Should have removed oldest 2, keeping 3
      expect(m._hitTroops.size).toBe(3);
      // Oldest 2 should be gone (insertion order: first added = first iterated)
      expect(m._hitTroops.has(troops[0])).toBe(false);
      expect(m._hitTroops.has(troops[1])).toBe(false);
      // Newest 3 should remain
      expect(m._hitTroops.has(troops[2])).toBe(true);
      expect(m._hitTroops.has(troops[3])).toBe(true);
      expect(m._hitTroops.has(troops[4])).toBe(true);
    });

    it('does not remove entries when under cap', () => {
      const m = new Monster(2, makeWaypoints(), makePath());
      m._hitTroopsCap = 10;
      m._hitTroops = new Set();
      const troops = [];
      for (let i = 0; i < 5; i++) {
        const t = makeTroopStub({ gx: i, gy: i, alive: true });
        troops.push(t);
        m._hitTroops.add(t);
      }
      m._cleanupHitTroops();
      expect(m._hitTroops.size).toBe(5);
    });
  });

  describe('_updatePassMode with cap', () => {
    it('respects _hitTroopsCap and stops adding when full', () => {
      const m = new Monster(2, makeWaypoints(), makePath());
      m._hitTroopsCap = 1; // very small cap
      m._tileGx = 5;
      m._tileGy = 5;
      const t1 = makeTroopStub({ gx: 5, gy: 5, alive: true });
      const t2 = makeTroopStub({ gx: 5, gy: 6, alive: true });
      const tileIndex = makeTileIndex([t1, t2]);
      // First pass: adds t1 (size goes to 1, at cap)
      m._lastPassTile = -1;
      m._updatePassMode(tileIndex);
      expect(m._hitTroops.size).toBeLessThanOrEqual(1);
      // Move to next tile
      m._tileGx = 6;
      m._tileGy = 6;
      m._lastPassTile = -1;
      // The cap check prevents adding more
      // Since size is already at cap, t2 won't be added
      m._updatePassMode(tileIndex);
      expect(m._hitTroops.size).toBeLessThanOrEqual(1);
    });
  });

  describe('isSlowed', () => {
    it('returns true when slowTimer > 0', () => {
      const m = new Monster(1, makeWaypoints(), makePath());
      m.slowTimer = 1;
      expect(m.isSlowed()).toBe(true);
    });

    it('returns false when slowTimer is 0', () => {
      const m = new Monster(1, makeWaypoints(), makePath());
      expect(m.isSlowed()).toBe(false);
    });
  });

  describe('update', () => {
    it('dead monster returns early', () => {
      const m = new Monster(1, makeWaypoints(), makePath());
      m.alive = false;
      const initialX = m.x;
      m.update(0.1, [], []);
      expect(m.x).toBe(initialX);
    });

    it('stunned monster skips movement', () => {
      const m = new Monster(1, makeWaypoints(), makePath());
      m.stunTimer = 2;
      const initialDist = m.distance;
      m.update(0.1, [], []);
      expect(m.distance).toBe(initialDist);
      expect(m.stunTimer).toBe(1.9);
    });

    it('reached end marks reachedEnd', () => {
      const m = new Monster(1, makeWaypoints(), makePath());
      m.distance = 99999;
      m.update(1, [], []);
      expect(m.reachedEnd).toBe(true);
    });

    it('reached end returns early after setting flag', () => {
      const m = new Monster(1, makeWaypoints(), makePath());
      m.distance = 99999;
      m.update(0.1, [], []);
      expect(m.reachedEnd).toBe(true);
    });

    it('progress returns 0 at start', () => {
      const m = new Monster(1, makeWaypoints(), makePath());
      expect(m.progress).toBe(0);
    });

    it('progress returns 1 at end', () => {
      const m = new Monster(1, makeWaypoints(), makePath());
      m.distance = m.totalLength;
      expect(m.progress).toBe(1);
    });

    it('progress returns 1 when totalLength=0', () => {
      const m = new Monster(1, [[0, 0]], { segments: [], totalLength: 0 });
      expect(m.progress).toBe(1);
    });

    it('runs regen and slowDecay', () => {
      const m = new Monster(1, makeWaypoints(), makePath());
      m.applySlow(0.5, 1);
      m.update(0.5, [], []);
      expect(m.slowTimer).toBeLessThan(1);
    });

    it('stop mode deploys findTarget with troopTileIndex in MOVING state', () => {
      const m = new Monster(1, makeWaypoints(), makePath());
      m.state = 'MOVING';
      // Monster starts at tile (0,0) — place troop there
      const t = makeTroopStub({ gx: 0, gy: 0 });
      const tileIndex = makeTileIndex([t]);
      m.update(0.1, tileIndex, []);
      expect(m.state).toBe('ATTACKING');
    });

    it('slow mode attacks and slows speed in MOVING state', () => {
      const m = new Monster('X', makeWaypoints(), makePath());
      m.state = 'MOVING';
      // Monster starts at tile (0,0) — place troop there
      const t = makeTroopStub({ gx: 0, gy: 0 });
      const tileIndex = makeTileIndex([t]);
      const initialSpeed = m.speed;
      m.update(0.1, tileIndex, []);
      expect(m.speed).toBeLessThanOrEqual(initialSpeed);
    });

    it('pass mode attacks in MOVING state', () => {
      const m = new Monster(2, makeWaypoints(), makePath());
      m.state = 'MOVING';
      // Monster starts at tile (0,0) — place troop there
      const t = makeTroopStub({ gx: 0, gy: 0 });
      const tileIndex = makeTileIndex([t]);
      m.update(0.1, tileIndex, []);
      expect(m._pendingAttack).toBe(t);
    });

    it('Healer (H) detects nearby damaged allies and starts healing', () => {
      const m = new Monster('H', makeWaypoints(), makePath());
      const ally = new Monster(1, makeWaypoints(), makePath());
      // Both start at same position; _updatePosition keeps them at tile (0,0)
      const T = CONFIG.TILE_SIZE;
      // Set monster distance so it doesn't recalc position away from ally
      m.distance = 0;
      ally.distance = 0;
      m._updatePosition();
      ally._updatePosition();
      ally.hp = ally.maxHp - 10;
      m.update(0.1, [], [ally]);
      expect(m._healing).toBe(true);
    });

    it('Healer (H) turns off healing when no damaged allies', () => {
      const m = new Monster('H', makeWaypoints(), makePath());
      const ally = new Monster(1, makeWaypoints(), makePath());
      ally.hp = ally.maxHp; // full HP, not damaged
      m.update(0.15, [], [ally]);
      expect(m._healing).toBe(false);
    });

    it('Healer (H) sets speed to base when not healing', () => {
      const m = new Monster('H', makeWaypoints(), makePath());
      m.speed = 0.1; // artificially low
      // Empty monsters array => no damaged allies detected => _healing stays false
      m.update(0.1, [], []);
      expect(m.speed).toBe(CONFIG.MOVEMENT_SPEEDS.fast);
    });

    it('updates distance in MOVING state', () => {
      const m = new Monster(1, makeWaypoints(), makePath());
      m.state = 'MOVING';
      const initialDist = m.distance;
      m.update(1, [], []);
      expect(m.distance).toBeGreaterThan(initialDist);
    });

    it('does not call _updatePosition when stunned', () => {
      const m = new Monster(1, makeWaypoints(), makePath());
      const initialDist = m.distance;
      m.stunTimer = 1;
      m.update(0.5, [], []);
      expect(m.distance).toBe(initialDist);
    });

    it('no-ops when troopTileIndex is null in MOVING state', () => {
      const m = new Monster(1, makeWaypoints(), makePath());
      m.state = 'MOVING';
      expect(() => m.update(0.1, null, [])).not.toThrow();
      expect(m.distance).toBeGreaterThan(0); // still moves
    });
  });

  describe('tileDistanceTo', () => {
    it('returns Chebyshev distance', () => {
      const m = new Monster(1, makeWaypoints(), makePath());
      m._tileGx = 5;
      m._tileGy = 5;
      expect(m.tileDistanceTo(7, 5)).toBe(2);
      expect(m.tileDistanceTo(5, 7)).toBe(2);
      expect(m.tileDistanceTo(7, 7)).toBe(2);
    });
  });

  describe('monster update ATTACKING state', () => {
    it('processes ATTACKING state in update', () => {
      const m = new Monster(1, makeWaypoints(), makePath());
      m.state = 'ATTACKING';
      expect(() => m.update(0.1, 'mockTileIndex', [])).not.toThrow();
    });
  });
});
