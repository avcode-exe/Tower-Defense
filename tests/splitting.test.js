import { afterEach, describe, expect, it, vi } from 'vitest';

import { AUDIO } from '../src/audio.js';
import { CONFIG, MONSTER_SPECS } from '../src/config.js';
import { Game } from '../src/game.js';
import { Monster } from '../src/monster.js';
import { PARTICLES } from '../src/particles.js';

function sharedPath() {
  return { segments: [], totalLength: 0 };
}

function makeMonster(level) {
  return new Monster(level, [[0, 0]], sharedPath(), 1);
}

function makeGame(monsters) {
  return {
    monsters,
    popups: [],
    waypoints: [[0, 0]],
    pathSegments: sharedPath(),
    gold: 0,
    _addGold(amount) {
      this.gold += amount;
    },
    _getPopup(text, x, y, t, color) {
      this.popups.push({ text, x, y, t, color });
    },
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('Monster splitting', () => {
  it.each([
    { parentLevel: 3, parentName: 'Brute', expectedLevel: 1, expectedName: 'Grunt' },
    { parentLevel: 4, parentName: 'Elite', expectedLevel: 3, expectedName: 'Brute' },
    { parentLevel: 5, parentName: 'Champion', expectedLevel: 4, expectedName: 'Elite' },
  ])(
    '$parentName splits into two $expectedName monsters and never Runners',
    ({ parentLevel, expectedLevel, expectedName }) => {
      const parent = makeMonster(parentLevel);
      const game = makeGame([parent]);
      const goldSpy = vi.spyOn(AUDIO, 'goldEarned');
      const particlesSpy = vi.spyOn(PARTICLES, 'spawn');

      expect(Game.prototype.damageMonster.call(game, parent, parent.hp)).toBe(true);

      const children = game.monsters.filter((monster) => monster !== parent);
      expect(children).toHaveLength(2);
      expect(children.every((monster) => monster.level === expectedLevel)).toBe(true);
      expect(children.every((monster) => monster.spec.name === expectedName)).toBe(true);
      expect(children.some((monster) => monster.spec.name === 'Runner')).toBe(false);
      expect(parent.alive).toBe(false);
      expect(game.gold).toBe(parent.reward + 1);
      expect(goldSpy).toHaveBeenCalledTimes(1);
      expect(particlesSpy).toHaveBeenCalledWith(parent.x, parent.y, expect.any(Object));
    }
  );

  it('Runner does not split because it has noSplit and pass-mode behavior', () => {
    const runner = makeMonster(2);
    const game = makeGame([runner]);
    const goldSpy = vi.spyOn(AUDIO, 'goldEarned');
    const particlesSpy = vi.spyOn(PARTICLES, 'spawn');

    expect(MONSTER_SPECS[2].noSplit).toBe(true);
    expect(MONSTER_SPECS[2].attackMode).toBe('pass');
    expect(Game.prototype.damageMonster.call(game, runner, runner.hp)).toBe(true);

    expect(game.monsters).toEqual([runner]);
    expect(runner.alive).toBe(false);
    expect(game.gold).toBe(runner.reward + 1);
    expect(goldSpy).toHaveBeenCalledTimes(1);
    expect(particlesSpy).toHaveBeenCalledWith(runner.x, runner.y, expect.any(Object));
  });
});
