import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { Game } from '../src/game.js';
import { CONFIG, TROOP_SPECS } from '../src/config.js';
import { Grid } from '../src/grid.js';
import { Troop } from '../src/troop.js';
import { AUDIO } from '../src/audio.js';
import { PARTICLES } from '../src/particles.js';

const archerSpec = TROOP_SPECS.find((spec) => spec.id === 'archer');

function makeTileIndex() {
  return Array.from({ length: CONFIG.GRID_SIZE * CONFIG.GRID_SIZE }, () => []);
}

function makeGame({ devMode = false, gold = 0 } = {}) {
  const game = Object.create(Game.prototype);
  game.devMode = devMode;
  game.gold = gold;
  game.grid = new Grid();
  game.troops = [];
  game._troopTileIndex = makeTileIndex();
  game._troopIndexByRef = new Map();
  game._getPopup = vi.fn();
  return game;
}

describe('dev mode economy', () => {
  beforeEach(() => {
    vi.spyOn(AUDIO, 'troopPlace').mockImplementation(() => {});
    vi.spyOn(AUDIO, 'upgrade').mockImplementation(() => {});
    vi.spyOn(AUDIO, 'heal').mockImplementation(() => {});
    vi.spyOn(AUDIO, 'shieldBuy').mockImplementation(() => {});
    vi.spyOn(PARTICLES, 'spawn').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('places troops on empty tiles without spending gold', () => {
    const game = makeGame({ devMode: true, gold: 0 });

    expect(game.canPlace(0, 0, archerSpec)).toBe(true);
    expect(game.placeTroop(archerSpec, 0, 0)).toBe(true);

    expect(game.gold).toBe(0);
    expect(game.troops).toHaveLength(1);
    expect(game.troops[0]).toBeInstanceOf(Troop);
    expect(game.troops[0].gx).toBe(0);
    expect(game.troops[0].gy).toBe(0);
  });

  it('blocks placement in normal mode when gold is below troop cost', () => {
    const game = makeGame({ devMode: false, gold: 0 });

    expect(archerSpec.cost).toBeGreaterThan(0);
    expect(game.canPlace(0, 0, archerSpec)).toBe(false);
  });

  it('upgrades troops without spending gold', () => {
    const game = makeGame({ devMode: true, gold: 0 });
    const troop = new Troop(archerSpec, 0, 0);
    game.troops.push(troop);

    const damageBefore = troop.getDamage();
    game.upgradeTroopStat(0, 'dmg');

    expect(troop.getDamage()).toBeGreaterThan(damageBefore);
    expect(game.gold).toBe(0);
  });

  it('heals damaged troops without spending gold', () => {
    const game = makeGame({ devMode: true, gold: 0 });
    const troop = new Troop(archerSpec, 0, 0);
    troop.hp = Math.floor(troop.maxHp / 2);
    game.troops.push(troop);

    const hpBefore = troop.hp;
    game.healTroop(0);

    expect(troop.hp).toBeGreaterThan(hpBefore);
    expect(troop.hp).toBeLessThanOrEqual(troop.maxHp);
    expect(game.gold).toBe(0);
  });

  it('applies shields without spending gold', () => {
    const game = makeGame({ devMode: true, gold: 0 });
    const troop = new Troop(archerSpec, 0, 0);
    game.troops.push(troop);

    expect(game.buyTroopShield(0)).toBe(true);

    expect(troop.shield).toBe(troop.maxShield);
    expect(troop.shield).toBeGreaterThan(0);
    expect(game.gold).toBe(0);
  });

  it('sets gold to Infinity in dev mode and caps normal mode gold', () => {
    const devGame = makeGame({ devMode: true, gold: 0 });
    const normalGame = makeGame({ devMode: false, gold: CONFIG.MAX_GOLD - 10 });

    devGame._addGold(1);
    normalGame._addGold(100);

    expect(devGame.gold).toBe(Infinity);
    expect(normalGame.gold).toBe(CONFIG.MAX_GOLD);
  });
});