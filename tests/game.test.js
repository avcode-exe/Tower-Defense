import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { Game } from '../src/game.js';
import { CONFIG, TROOP_SPECS } from '../src/config.js';
import { Grid } from '../src/grid.js';
import { TILE } from '../src/grid.js';
import { Troop } from '../src/troop.js';
import { AUDIO } from '../src/audio.js';
import { PARTICLES } from '../src/particles.js';
import { RENDERER } from '../src/rendering/renderer.js';

function makeTileIndex() {
  return Array.from({ length: CONFIG.GRID_SIZE * CONFIG.GRID_SIZE }, () => []);
}

function makeGame({ devMode = false, gold = 1000 } = {}) {
  const game = Object.create(Game.prototype);
  game.devMode = devMode;
  game.gold = gold;
  game.lives = 25;
  game.grid = new Grid();
  game.troops = [];
  game.monsters = [];
  game.projectiles = [];
  game.popups = [];
  game._troopTileIndex = makeTileIndex();
  game._troopIndexByRef = new Map();
  game._monsterTileIndex = new Array(CONFIG.GRID_SIZE * CONFIG.GRID_SIZE);
  game._popupPool = [];
  game._getPopup = vi.fn();
  game.sellCooldownTimer = 0;
  game.selectedTroopIndex = -1;
  game.selectedSpec = null;
  game.sellConfirmPending = false;
  game.sellConfirmTroop = null;
  return game;
}

const archerSpec = TROOP_SPECS.find((s) => s.id === 'archer');
const swordsmanSpec = TROOP_SPECS.find((s) => s.id === 'swordsman');
const knightSpec = TROOP_SPECS.find((s) => s.id === 'knight');

describe('canPlace', () => {
  let game;
  beforeEach(() => {
    game = makeGame({ devMode: false, gold: 1000 });
  });

  it('returns true on empty tile with enough gold', () => {
    expect(game.canPlace(0, 0, archerSpec)).toBe(true);
  });

  it('returns false when gold < cost', () => {
    game.gold = 10;
    expect(game.canPlace(0, 0, knightSpec)).toBe(false);
  });

  it('returns false on PATH tile', () => {
    game.grid.set(5, 5, TILE.PATH);
    expect(game.canPlace(5, 5, archerSpec)).toBe(false);
  });

  it('returns false on occupied tile with alive troop', () => {
    const troop = new Troop(archerSpec, 3, 3);
    game.troops.push(troop);
    game._buildTroopTileIndex();
    expect(game.canPlace(3, 3, archerSpec)).toBe(false);
  });

  it('returns true on occupied tile with only dead troops', () => {
    const troop = new Troop(archerSpec, 3, 3);
    troop.alive = false;
    game.troops.push(troop);
    game._buildTroopTileIndex();
    expect(game.canPlace(3, 3, archerSpec)).toBe(true);
  });
});

describe('placeTroop', () => {
  let game;
  beforeEach(() => {
    game = makeGame({ devMode: false, gold: 1000 });
    vi.spyOn(AUDIO, 'troopPlace').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('creates Troop, deducts gold, and returns true', () => {
    const goldBefore = game.gold;
    const result = game.placeTroop(archerSpec, 0, 0);
    expect(result).toBe(true);
    expect(game.troops).toHaveLength(1);
    expect(game.troops[0]).toBeInstanceOf(Troop);
    expect(game.troops[0].gx).toBe(0);
    expect(game.troops[0].gy).toBe(0);
    expect(game.gold).toBe(goldBefore - archerSpec.cost);
  });

  it('returns false when cannot place (not enough gold)', () => {
    game.gold = 5;
    const result = game.placeTroop(knightSpec, 0, 0);
    expect(result).toBe(false);
    expect(game.troops).toHaveLength(0);
  });

  it('does not deduct gold in dev mode', () => {
    game.devMode = true;
    game.gold = 0;
    const result = game.placeTroop(archerSpec, 0, 0);
    expect(result).toBe(true);
    expect(game.gold).toBe(0);
  });
});

describe('sellTroop', () => {
  let game;
  beforeEach(() => {
    game = makeGame({ devMode: false, gold: 100 });
    vi.spyOn(AUDIO, 'sell').mockImplementation(() => {});
    vi.spyOn(RENDERER, 'markCacheDirty').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('sets troop alive=false and clears tile', () => {
    const troop = new Troop(archerSpec, 2, 2);
    game.troops.push(troop);
    game._buildTroopTileIndex();
    game.grid.set(2, 2, TILE.BLOCKED);

    game.sellTroop(0);

    expect(troop.alive).toBe(false);
    expect(game.grid.get(2, 2)).toBe(TILE.EMPTY);
  });

  it('refund = ceil(totalInvested * SELL_REFUND_RATIO)', () => {
    const troop = new Troop(archerSpec, 2, 2);
    game.troops.push(troop);
    game._buildTroopTileIndex();
    game.grid.set(2, 2, TILE.BLOCKED);

    const invested = troop.getTotalInvested();
    const expectedRefund = Math.ceil(invested * CONFIG.SELL_REFUND_RATIO);
    const goldBefore = game.gold;

    game.sellTroop(0);

    expect(game.gold).toBe(goldBefore + expectedRefund);
  });

  it('no refund in dev mode', () => {
    game.devMode = true;
    const troop = new Troop(archerSpec, 2, 2);
    game.troops.push(troop);
    game._buildTroopTileIndex();
    game.grid.set(2, 2, TILE.BLOCKED);

    game.sellTroop(0);

    expect(game.gold).toBe(100);
  });

  it('sets sellCooldownTimer', () => {
    const troop = new Troop(archerSpec, 2, 2);
    game.troops.push(troop);
    game._buildTroopTileIndex();
    game.grid.set(2, 2, TILE.BLOCKED);

    game.sellTroop(0);

    expect(game.sellCooldownTimer).toBe(CONFIG.SELL_COOLDOWN);
  });
});

describe('_addGold', () => {
  it('caps at MAX_GOLD', () => {
    const game = makeGame({ devMode: false, gold: CONFIG.MAX_GOLD - 50 });
    game._addGold(100);
    expect(game.gold).toBe(CONFIG.MAX_GOLD);
  });

  it('sets Infinity in dev mode', () => {
    const game = makeGame({ devMode: true, gold: 0 });
    game._addGold(100);
    expect(game.gold).toBe(Infinity);
  });
});

describe('upgradeTroopStat', () => {
  let game;
  beforeEach(() => {
    game = makeGame({ devMode: false, gold: 10000 });
    vi.spyOn(AUDIO, 'upgrade').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('deducts gold and upgrades stat', () => {
    const troop = new Troop(archerSpec, 0, 0);
    game.troops.push(troop);

    const dmgBefore = troop.getDamage();
    const upgradeCost = troop.getUpgradeCost('dmg');
    const goldBefore = game.gold;

    game.upgradeTroopStat(0, 'dmg');

    expect(troop.getDamage()).toBeGreaterThan(dmgBefore);
    expect(game.gold).toBe(goldBefore - upgradeCost);
  });

  it('does not deduct gold in dev mode', () => {
    game.devMode = true;
    game.gold = Infinity;
    const troop = new Troop(archerSpec, 0, 0);
    game.troops.push(troop);

    game.upgradeTroopStat(0, 'dmg');

    expect(game.gold).toBe(Infinity);
  });

  it('does nothing when stat is maxed', () => {
    const troop = new Troop(archerSpec, 0, 0);
    game.troops.push(troop);

    // Max out the stat
    for (let i = 0; i < CONFIG.MAX_UPGRADE_LEVEL - 1; i++) {
      troop.upgradeStat('dmg');
    }
    const dmgBefore = troop.getDamage();
    const goldBefore = game.gold;

    game.upgradeTroopStat(0, 'dmg');

    expect(troop.getDamage()).toBe(dmgBefore);
    expect(game.gold).toBe(goldBefore);
  });
});

describe('healTroop', () => {
  let game;
  beforeEach(() => {
    game = makeGame({ devMode: false, gold: 10000 });
    vi.spyOn(AUDIO, 'heal').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('heals troop and deducts gold', () => {
    const troop = new Troop(archerSpec, 0, 0);
    troop.hp = 10;
    game.troops.push(troop);

    const hpBefore = troop.hp;
    const healCost = troop.getHealCost();
    const goldBefore = game.gold;

    game.healTroop(0);

    expect(troop.hp).toBeGreaterThan(hpBefore);
    expect(game.gold).toBe(goldBefore - healCost);
  });

  it('does not deduct gold in dev mode', () => {
    game.devMode = true;
    game.gold = 0;
    const troop = new Troop(archerSpec, 0, 0);
    troop.hp = 10;
    game.troops.push(troop);

    game.healTroop(0);

    expect(troop.hp).toBeGreaterThan(10);
    expect(game.gold).toBe(0);
  });
});

describe('buyTroopShield', () => {
  let game;
  beforeEach(() => {
    game = makeGame({ devMode: false, gold: 10000 });
    vi.spyOn(AUDIO, 'shieldBuy').mockImplementation(() => {});
    vi.spyOn(PARTICLES, 'troopShieldActivate').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('applies shield and deducts gold', () => {
    const troop = new Troop(archerSpec, 0, 0);
    game.troops.push(troop);

    const cost = Math.ceil(troop.spec.cost * CONFIG.SHIELD_COST_RATIO);
    const goldBefore = game.gold;

    const result = game.buyTroopShield(0);

    expect(result).toBe(true);
    expect(troop.shield).toBe(troop.maxShield);
    expect(troop.shield).toBeGreaterThan(0);
    expect(game.gold).toBe(goldBefore - cost);
  });

  it('returns false when troop already has shield', () => {
    const troop = new Troop(archerSpec, 0, 0);
    troop.shield = 10;
    troop.maxShield = 10;
    game.troops.push(troop);

    const result = game.buyTroopShield(0);

    expect(result).toBe(false);
    expect(troop.shield).toBe(10);
  });
});

describe('findTroopAtTile', () => {
  let game;
  beforeEach(() => {
    game = makeGame();
  });

  it('returns index for alive troop', () => {
    const troop = new Troop(archerSpec, 4, 4);
    game.troops.push(troop);
    game._buildTroopTileIndex();

    const idx = game.findTroopAtTile(4, 4);
    expect(idx).toBe(0);
  });

  it('returns -1 when no troop at tile', () => {
    const troop = new Troop(archerSpec, 4, 4);
    game.troops.push(troop);
    game._buildTroopTileIndex();

    expect(game.findTroopAtTile(0, 0)).toBe(-1);
  });
});

describe('_cleanupDead', () => {
  let game;
  beforeEach(() => {
    game = makeGame();
  });

  it('compacts monster and troop arrays', () => {
    const alive1 = new Troop(archerSpec, 0, 0);
    const dead = new Troop(archerSpec, 1, 1);
    const alive2 = new Troop(archerSpec, 2, 2);
    dead.alive = false;

    game.troops = [alive1, dead, alive2];
    game._buildTroopTileIndex();

    game._cleanupDead();

    expect(game.troops).toHaveLength(2);
    expect(game.troops[0]).toBe(alive1);
    expect(game.troops[1]).toBe(alive2);
  });

  it('preserves selectedTroopIndex for alive troops', () => {
    const alive1 = new Troop(archerSpec, 0, 0);
    const dead = new Troop(archerSpec, 1, 1);
    const alive2 = new Troop(archerSpec, 2, 2);
    dead.alive = false;

    game.troops = [alive1, dead, alive2];
    game.selectedTroopIndex = 2;
    game._buildTroopTileIndex();

    game._cleanupDead();

    expect(game.selectedTroopIndex).toBe(1);
    expect(game.troops[game.selectedTroopIndex]).toBe(alive2);
  });
});
