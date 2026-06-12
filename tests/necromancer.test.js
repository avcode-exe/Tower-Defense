import { afterEach, describe, expect, it, vi } from 'vitest';

import { AUDIO } from '../src/audio.js';
import { CONFIG, MONSTER_SPECS, WAVES } from '../src/config.js';
import { Game } from '../src/game.js';
import { Monster } from '../src/monster.js';
import { PARTICLES } from '../src/particles.js';
import { WaveManager } from '../src/waveManager.js';

function sharedPath() {
  return { segments: [], totalLength: 0 };
}

function makeMonsterAt(level, gx, gy) {
  return new Monster(level, [[gx, gy]], sharedPath(), 1);
}

function makeMonster(level, x = 0, y = 0) {
  return new Monster(level, [[0, 0]], sharedPath(), 1);
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

describe('Necromancer milestone 3 acceptance', () => {
  it('has Necromancer spec fields', () => {
    const necro = MONSTER_SPECS.Y;

    expect(necro.name).toBe('Necromancer');
    expect(necro.noSplit).toBe(true);
    expect(necro.reviveRange).toBe(2.0);
    expect(necro.reviveHpRatio).toBe(0.5);
    expect(necro.reviveMaxTargets).toBe(5);
    expect(necro.reviveGlowDuration).toBe(1.5);
  });

  it('includes Necromancer in normal waves', () => {
    expect(WAVES.some((wave) => wave.some(([level]) => level === 'Y'))).toBe(true);
  });

  it('queues a Necromancer from custom dev counts', () => {
    const wave = new WaveManager();

    wave.buildCustomFromCounts({ Y: 1 });

    expect(wave.queue).toEqual([{ level: 'Y', spawnAt: CONFIG.WAVE_START_DELAY, hpMult: 1 }]);
  });

  it('constructs Monster Y as Necromancer and does not split it when killed', () => {
    const necro = makeMonster('Y');
    const game = makeFakeGame([necro]);
    const goldSpy = vi.spyOn(AUDIO, 'goldEarned');
    const spawnSpy = vi.spyOn(PARTICLES, 'spawn');

    expect(necro.spec.name).toBe('Necromancer');
    expect(Game.prototype.damageMonster.call(game, necro, necro.hp)).toBe(true);

    expect(game.monsters).toHaveLength(1);
    expect(necro.alive).toBe(false);
    expect(game.gold).toBe(necro.reward + 1);
    expect(goldSpy).toHaveBeenCalledTimes(1);
    expect(spawnSpy).toHaveBeenCalledWith(necro.x, necro.y, expect.any(Object));
  });

  it.each([3, 4, 5])('revived level %s monsters do not split when killed', (level) => {
    const necro = fakeMonster('Y', 0, 0);
    const target = makeMonsterAt(level, 1, 0);
    const game = makeReviveGame([necro, target]);
    const goldSpy = vi.spyOn(AUDIO, 'goldEarned');
    const spawnSpy = vi.spyOn(PARTICLES, 'spawn');

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
    expect(target.reviveGlow).toBe(false);

    expect(goldSpy).toHaveBeenCalledTimes(1);
    expect(spawnSpy).toHaveBeenCalledWith(target.x, target.y, expect.any(Object));
  });

  it('keeps revive glow after update while a revived monster remains alive', () => {
    const necro = fakeMonster('Y', 0, 0);
    const target = makeMonsterAt(1, 1, 0);
    target.alive = false;
    const game = makeReviveGame([necro, target]);

    Game.prototype._stepNecromancerRevives.call(game);
    target.update(1, []);

    expect(target.alive).toBe(true);
    expect(target.reviveGlow).toBe(true);
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
        if (this.hp <= 0) {
          this.alive = false;
          return true;
        }
        return false;
      },
    };
    const game = {
      popups: [],
      killTroop: vi.fn(),
      _getPopup(text, x, y, t, color) {
        this.popups.push({ text, x, y, t, color });
      },
    };
    const takeDamageSpy = vi.spyOn(troop, 'takeDamage');

    Game.prototype.damageTroop.call(game, monster, troop);

    const expectedDamage = Math.max(1, Math.round(monster.spec.damage * 0.5));
    expect(takeDamageSpy).toHaveBeenCalledWith(expectedDamage);
    expect(troop.hp).toBe(100 - expectedDamage);
    expect(game.killTroop).not.toHaveBeenCalled();
  });

  it('revives the nearest dead monster in range to partial HP and marks Necromancer used', () => {
    const necro = fakeMonster('Y', 0, 0);
    const far = fakeMonster(1, CONFIG.TILE_SIZE * 4, 0, { alive: false });
    const near = fakeMonster(2, CONFIG.TILE_SIZE, 0, { alive: false, maxHp: 100 });
    const game = makeReviveGame([necro, far, near]);
    const spawnSpy = vi.spyOn(PARTICLES, 'spawn');

    Game.prototype._stepNecromancerRevives.call(game);

    expect(near.alive).toBe(true);
    expect(near.hp).toBe(Math.round(100 * MONSTER_SPECS.Y.reviveHpRatio));
    expect(near._reviveGlowTimer).toBe(MONSTER_SPECS.Y.reviveGlowDuration);
    expect(near.reviveGlow).toBe(true);

    expect(near.reachedEnd).toBe(false);
    expect(near.state).toBe('MOVING');
    expect(near._reviveLock).toBe(true);
    expect(near.reviveDamageRatio).toBe(0.5);
    expect(far.alive).toBe(false);
    expect(necro.reviveCount).toBe(1);
    expect(necro.reviveUsed).toBe(true);
    expect(game.popups).toEqual([{ text: 'Revived', x: near.x, y: near.y - 12, t: 0.9, color: CONFIG.COLORS.revive }]);
    expect(spawnSpy).toHaveBeenCalledWith(near.x, near.y, expect.objectContaining({ color: CONFIG.COLORS.revive }));
  });

  it('skips dead monsters outside revive range', () => {
    const necro = fakeMonster('Y', 0, 0);
    const dead = fakeMonster(1, CONFIG.TILE_SIZE * 4, 0, { alive: false });
    const game = makeReviveGame([necro, dead]);

    Game.prototype._stepNecromancerRevives.call(game);

    expect(dead.alive).toBe(false);
    expect(necro.reviveUsed).toBe(false);
    expect(necro.reviveCount).toBe(0);
    expect(game.popups).toHaveLength(0);
  });

  it('skips dead monsters that reached the end', () => {
    const necro = fakeMonster('Y', 0, 0);
    const dead = fakeMonster(1, CONFIG.TILE_SIZE, 0, { alive: false, reachedEnd: true });
    const game = makeReviveGame([necro, dead]);

    Game.prototype._stepNecromancerRevives.call(game);

    expect(dead.alive).toBe(false);
    expect(dead.reachedEnd).toBe(true);
    expect(necro.reviveUsed).toBe(false);
    expect(necro.reviveCount).toBe(0);
    expect(game.popups).toHaveLength(0);
  });

  it('revives up to five eligible monsters per Necromancer in the same step', () => {
    const necro = fakeMonster('Y', 0, 0);
    const targets = Array.from({ length: 5 }, (_, index) =>
      fakeMonster(index + 1, CONFIG.TILE_SIZE * (0.25 + index * 0.25), 0, { alive: false, maxHp: 100 })
    );
    const game = makeReviveGame([necro, ...targets]);
    const spawnSpy = vi.spyOn(PARTICLES, 'spawn');

    Game.prototype._stepNecromancerRevives.call(game);

    expect(targets.every((target) => target.alive)).toBe(true);
    expect(targets.every((target) => target.hp === 50)).toBe(true);
    expect(targets.every((target) => target._reviveLock)).toBe(true);
    expect(targets.every((target) => target.reviveGlow === true)).toBe(true);

    expect(targets.every((target) => target.reviveDamageRatio === 0.5)).toBe(true);
    expect(necro.reviveCount).toBe(5);
    expect(necro.reviveUsed).toBe(true);
    expect(game.popups).toHaveLength(5);
    expect(spawnSpy).toHaveBeenCalledTimes(5);
  });

  it('prevents another Necromancer from re-reviving the same monster in the same step', () => {
    const firstNecro = fakeMonster('Y', 0, 0);
    const secondNecro = fakeMonster('Y', CONFIG.TILE_SIZE * 2, 0);
    const dead = fakeMonster(1, CONFIG.TILE_SIZE, 0, { alive: false });
    const game = makeReviveGame([firstNecro, secondNecro, dead]);

    Game.prototype._stepNecromancerRevives.call(game);

    expect(dead.alive).toBe(true);
    expect(firstNecro.reviveCount).toBe(1);
    expect(firstNecro.reviveUsed).toBe(true);
    expect(secondNecro.reviveUsed).toBe(false);
    expect(game.popups).toHaveLength(1);
  });

  it('does not revive a monster that was already revived in a previous step', () => {
    const necro = fakeMonster('Y', 0, 0);
    necro.spec = { ...necro.spec, reviveMaxTargets: 1 };
    const previouslyRevived = fakeMonster(1, CONFIG.TILE_SIZE, 0, { alive: false, maxHp: 100 });
    const otherDead = fakeMonster(2, CONFIG.TILE_SIZE * 1.5, 0, { alive: false, maxHp: 100 });
    const game = makeReviveGame([necro, previouslyRevived, otherDead]);

    Game.prototype._stepNecromancerRevives.call(game);
    expect(previouslyRevived.alive).toBe(true);
    expect(previouslyRevived.reviveImmune).toBe(true);
    expect(otherDead.alive).toBe(false);

    previouslyRevived.alive = false;
    previouslyRevived.hp = 0;
    necro.spec = { ...necro.spec, reviveMaxTargets: CONFIG.MONSTER_REVIVE_MAX_TARGETS };
    Game.prototype._stepNecromancerRevives.call(game);

    expect(previouslyRevived.alive).toBe(false);
    expect(otherDead.alive).toBe(true);
    expect(otherDead.hp).toBe(50);
    expect(otherDead.reviveImmune).toBe(true);
    expect(otherDead.reviveDamageRatio).toBe(0.5);
    expect(necro.reviveCount).toBe(2);
    expect(game.popups).toHaveLength(2);
  });

  it('revives a dead monster exactly two tiles away', () => {
    const necro = fakeMonster('Y', 0, 0);
    const target = fakeMonster(1, CONFIG.TILE_SIZE * 2, 0, { alive: false, maxHp: 100 });
    const game = makeReviveGame([necro, target]);

    Game.prototype._stepNecromancerRevives.call(game);

    expect(target.alive).toBe(true);
    expect(target.hp).toBe(50);
    expect(target.reviveDamageRatio).toBe(0.5);
    expect(necro.reviveCount).toBe(1);
  });

  it('skips dead Necromancers as revive targets', () => {
    const necro = fakeMonster('Y', 0, 0);
    const deadNecro = fakeMonster('Y', CONFIG.TILE_SIZE, 0, { alive: false });
    const target = fakeMonster(1, CONFIG.TILE_SIZE * 1.5, 0, { alive: false, maxHp: 100 });
    const game = makeReviveGame([necro, deadNecro, target]);

    Game.prototype._stepNecromancerRevives.call(game);

    expect(deadNecro.alive).toBe(false);
    expect(target.alive).toBe(true);
    expect(target.hp).toBe(50);
    expect(target.reviveDamageRatio).toBe(0.5);
    expect(necro.reviveCount).toBe(1);
  });

  it('does not revive a sixth in-range target in the same pass', () => {
    const necro = fakeMonster('Y', 0, 0);
    const targets = Array.from({ length: 6 }, (_, index) =>
      fakeMonster(index + 1, CONFIG.TILE_SIZE * (0.25 + index * 0.25), 0, { alive: false, maxHp: 100 })
    );
    const game = makeReviveGame([necro, ...targets]);
    const spawnSpy = vi.spyOn(PARTICLES, 'spawn');

    Game.prototype._stepNecromancerRevives.call(game);

    expect(targets.slice(0, 5).every((target) => target.alive)).toBe(true);
    expect(targets[5].alive).toBe(false);
    expect(targets[5]._reviveLock).toBe(false);
    expect(necro.reviveCount).toBe(5);
    expect(necro.reviveUsed).toBe(true);
    expect(game.popups).toHaveLength(5);
    expect(spawnSpy).toHaveBeenCalledTimes(5);
  });

  it('default dev monster counts include Necromancer', () => {
    const counts = Game.prototype._defaultDevCounts.call({});

    expect(counts.Y).toBe(0);
    expect(Object.keys(counts)).toContain('Y');
  });
});
