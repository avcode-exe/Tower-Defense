import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { Game } from '../src/game.js';
import { CONFIG, TROOP_SPECS } from '../src/config.js';
import { Grid, TILE } from '../src/grid.js';
import { Troop } from '../src/troop.js';
import { AUDIO } from '../src/audio.js';
import { PARTICLES } from '../src/particles.js';
import { RENDERER } from '../src/rendering/renderer.js';

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
    vi.spyOn(AUDIO, 'sell').mockImplementation(() => {});
    vi.spyOn(PARTICLES, 'spawn').mockImplementation(() => {});
    vi.spyOn(RENDERER, 'markCacheDirty').mockImplementation(() => {});
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

  describe('sellTroop', () => {
    it('normal mode: sets troop alive=false and clears tile', () => {
      const game = makeGame({ devMode: false, gold: 500 });
      const troop = new Troop(archerSpec, 2, 3);
      game.troops.push(troop);
      game._buildTroopTileIndex();

      game.sellTroop(0);

      expect(troop.alive).toBe(false);
      expect(game.grid.get(2, 3)).toBe(TILE.EMPTY);
    });

    it('normal mode: refunds ceil(totalInvested * SELL_REFUND_RATIO) gold', () => {
      const game = makeGame({ devMode: false, gold: 500 });
      const troop = new Troop(archerSpec, 1, 1);
      game.troops.push(troop);
      game._buildTroopTileIndex();

      const invested = troop.getTotalInvested();
      const expectedRefund = Math.ceil(invested * CONFIG.SELL_REFUND_RATIO);
      const goldBefore = game.gold;

      game.sellTroop(0);

      expect(game.gold).toBe(goldBefore + expectedRefund);
    });

    it('dev mode: no gold change (refund is 0)', () => {
      const game = makeGame({ devMode: true, gold: 0 });
      const troop = new Troop(archerSpec, 1, 1);
      game.troops.push(troop);
      game._buildTroopTileIndex();

      game.sellTroop(0);

      expect(game.gold).toBe(0);
    });

    it('sets sellCooldownTimer to CONFIG.SELL_COOLDOWN', () => {
      const game = makeGame({ devMode: false, gold: 500 });
      const troop = new Troop(archerSpec, 0, 0);
      game.troops.push(troop);
      game._buildTroopTileIndex();
      game.sellCooldownTimer = 0;

      game.sellTroop(0);

      expect(game.sellCooldownTimer).toBe(CONFIG.SELL_COOLDOWN);
    });
  });

  describe('canPlace occupied tile', () => {
    it('returns false when an alive troop is already on the tile', () => {
      const game = makeGame({ devMode: true, gold: 0 });
      const troop = new Troop(archerSpec, 3, 4);
      game.troops.push(troop);
      game._buildTroopTileIndex();

      expect(game.canPlace(3, 4, archerSpec)).toBe(false);
    });

    it('returns true when only dead troops are on the tile', () => {
      const game = makeGame({ devMode: true, gold: 0 });
      const troop = new Troop(archerSpec, 3, 4);
      troop.alive = false;
      game.troops.push(troop);
      game._buildTroopTileIndex();

      expect(game.canPlace(3, 4, archerSpec)).toBe(true);
    });
  });

  describe('sellCooldownTimer', () => {
    it('cannot sell again while cooldown > 0', () => {
      const game = makeGame({ devMode: false, gold: 500 });
      const t1 = new Troop(archerSpec, 0, 0);
      const t2 = new Troop(archerSpec, 1, 0);
      game.troops.push(t1, t2);
      game._buildTroopTileIndex();

      game.sellTroop(0);
      expect(t1.alive).toBe(false);
      expect(game.sellCooldownTimer).toBeGreaterThan(0);

      game.sellTroop(1);
      expect(t2.alive).toBe(true);
    });
  });
});