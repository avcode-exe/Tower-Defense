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

describe('killTroop', () => {
  let game;
  beforeEach(() => {
    game = makeGame();
    vi.spyOn(RENDERER, 'markCacheDirty').mockImplementation(() => {});
    vi.spyOn(PARTICLES, 'troopDeath').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('sets troop alive=false', () => {
    const troop = new Troop(archerSpec, 2, 2);
    game.troops.push(troop);
    game._buildTroopTileIndex();
    game.grid.set(2, 2, TILE.BLOCKED);

    game.killTroop(troop);

    expect(troop.alive).toBe(false);
  });

  it('clears grid tile to EMPTY', () => {
    const troop = new Troop(archerSpec, 3, 3);
    game.troops.push(troop);
    game._buildTroopTileIndex();
    game.grid.set(3, 3, TILE.BLOCKED);

    game.killTroop(troop);

    expect(game.grid.get(3, 3)).toBe(TILE.EMPTY);
  });

  it('calls RENDERER.markCacheDirty()', () => {
    const troop = new Troop(archerSpec, 0, 0);
    game.troops.push(troop);
    game._buildTroopTileIndex();

    game.killTroop(troop);

    expect(RENDERER.markCacheDirty).toHaveBeenCalled();
  });

  it('calls PARTICLES.troopDeath()', () => {
    const troop = new Troop(archerSpec, 0, 0);
    game.troops.push(troop);
    game._buildTroopTileIndex();

    game.killTroop(troop);

    expect(PARTICLES.troopDeath).toHaveBeenCalledWith(troop.x, troop.y, troop.spec.color);
  });

  it('clears selectedTroopIndex if the killed troop was selected', () => {
    const troop = new Troop(archerSpec, 0, 0);
    game.troops.push(troop);
    game._buildTroopTileIndex();
    game.selectedTroopIndex = 0;

    game.killTroop(troop);

    expect(game.selectedTroopIndex).toBe(-1);
  });

  it('preserves selectedTroopIndex if a different troop was selected', () => {
    const troop1 = new Troop(archerSpec, 0, 0);
    const troop2 = new Troop(archerSpec, 1, 1);
    game.troops.push(troop1, troop2);
    game._buildTroopTileIndex();
    game.selectedTroopIndex = 1;

    game.killTroop(troop1);

    expect(game.selectedTroopIndex).toBe(1);
  });

  it('clears sellConfirmPending/sellConfirmTroop when the confirmed troop is killed', () => {
    const troop = new Troop(archerSpec, 0, 0);
    game.troops.push(troop);
    game._buildTroopTileIndex();
    game.sellConfirmPending = true;
    game.sellConfirmTroop = troop;

    game.killTroop(troop);

    expect(game.sellConfirmPending).toBe(false);
    expect(game.sellConfirmTroop).toBeNull();
  });

  it('does not clear sellConfirmPending for a different troop', () => {
    const troop1 = new Troop(archerSpec, 0, 0);
    const troop2 = new Troop(archerSpec, 1, 1);
    game.troops.push(troop1, troop2);
    game._buildTroopTileIndex();
    game.sellConfirmPending = true;
    game.sellConfirmTroop = troop2;

    game.killTroop(troop1);

    expect(game.sellConfirmPending).toBe(true);
    expect(game.sellConfirmTroop).toBe(troop2);
  });
});

describe('spawnMonster', () => {
  let game;
  beforeEach(() => {
    game = makeGame();
    game.waypoints = [
      [0, 0],
      [5, 0],
      [5, 5],
    ];
    game.pathSegments = {
      segments: [{ ax: 0, ay: 0, bx: 5 * CONFIG.TILE_SIZE, by: 0, len: 5 * CONFIG.TILE_SIZE, cumStart: 0 }],
      totalLength: 5 * CONFIG.TILE_SIZE,
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('adds a monster to the monsters array', () => {
    game.spawnMonster(1);
    expect(game.monsters).toHaveLength(1);
  });

  it('creates an alive monster at index 0', () => {
    game.spawnMonster(1);
    expect(game.monsters[0]).toBeDefined();
    expect(game.monsters[0].alive).toBe(true);
    expect(game.monsters[0].level).toBe(1);
  });

  it('creates a monster with correct hpMult', () => {
    game.spawnMonster(1, 2);
    expect(game.monsters[0].hpMult).toBe(2);
    expect(game.monsters[0].maxHp).toBeGreaterThanOrEqual(1);
  });

  it('defaults hpMult to 1', () => {
    game.spawnMonster(1);
    expect(game.monsters[0].hpMult).toBe(1);
  });

  it('supports spawning multiple monsters', () => {
    game.spawnMonster(1);
    game.spawnMonster(2);
    game.spawnMonster(3);
    expect(game.monsters).toHaveLength(3);
  });
});

describe('markPathTiles', () => {
  let game;
  beforeEach(() => {
    game = makeGame();
  });

  it('marks waypoint tiles as PATH on the grid', () => {
    game.waypoints = [
      [2, 3],
      [4, 5],
      [7, 8],
    ];
    game.grid.set(2, 3, TILE.EMPTY);
    game.grid.set(4, 5, TILE.EMPTY);
    game.grid.set(7, 8, TILE.EMPTY);

    game.markPathTiles();

    expect(game.grid.get(2, 3)).toBe(TILE.PATH);
    expect(game.grid.get(4, 5)).toBe(TILE.PATH);
    expect(game.grid.get(7, 8)).toBe(TILE.PATH);
  });

  it('does not change non-waypoint tiles', () => {
    game.waypoints = [[0, 0]];
    game.grid.set(5, 5, TILE.EMPTY);

    game.markPathTiles();

    expect(game.grid.get(5, 5)).toBe(TILE.EMPTY);
  });

  it('works with empty waypoints', () => {
    game.waypoints = [];
    expect(() => game.markPathTiles()).not.toThrow();
  });
});

describe('chainHitAt', () => {
  let game;
  let lightningSpec;
  beforeEach(() => {
    game = makeGame();
    game.waypoints = [
      [0, 0],
      [5, 0],
      [5, 5],
    ];
    game.pathSegments = {
      segments: [{ ax: 0, ay: 0, bx: 5 * CONFIG.TILE_SIZE, by: 0, len: 5 * CONFIG.TILE_SIZE, cumStart: 0 }],
      totalLength: 5 * CONFIG.TILE_SIZE,
    };
    game._chainBuf = [];
    game._tileIndexPool = [];
    lightningSpec = TROOP_SPECS.find((s) => s.id === 'lightning');
    vi.spyOn(PARTICLES, 'chainSpark').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function addMonsterAt(gx, gy, hp = 100) {
    game.spawnMonster(1);
    const m = game.monsters[game.monsters.length - 1];
    const T = CONFIG.TILE_SIZE;
    m.x = gx * T + T / 2;
    m.y = gy * T + T / 2;
    m.hp = hp;
    m.maxHp = hp;
    m.alive = true;
    return m;
  }

  function buildMonsterTileIndex() {
    game._updateMonsterTileIndex();
  }

  it('damages the closest monster', () => {
    const m1 = addMonsterAt(3, 3, 100);
    buildMonsterTileIndex();

    const troop = new Troop(lightningSpec, 2, 2);
    const T = CONFIG.TILE_SIZE;
    game.chainHitAt(2 * T + T / 2, 2 * T + T / 2, troop);

    expect(m1.hp).toBeLessThan(100);
  });

  it('chains to nearby monsters with lower progress', () => {
    // Place two monsters close together
    const m1 = addMonsterAt(3, 3, 100);
    const m2 = addMonsterAt(4, 3, 100);
    // progress is a getter: distance / totalLength
    // Set m1 to higher progress (closer to end), m2 to lower (further from end)
    m1.distance = m1.totalLength * 0.5;
    m2.distance = m2.totalLength * 0.3;
    buildMonsterTileIndex();

    const troop = new Troop(lightningSpec, 2, 2);
    const T = CONFIG.TILE_SIZE;
    game.chainHitAt(2 * T + T / 2, 2 * T + T / 2, troop);

    // Both should have taken damage
    expect(m1.hp).toBeLessThan(100);
    expect(m2.hp).toBeLessThan(100);
  });

  it('does nothing when no monsters are near', () => {
    buildMonsterTileIndex();

    const troop = new Troop(lightningSpec, 0, 0);
    const T = CONFIG.TILE_SIZE;
    game.chainHitAt(T / 2, T / 2, troop);

    // No monsters, no error
    expect(game.monsters).toHaveLength(0);
  });

  it('applies stun to hit monsters', () => {
    const m1 = addMonsterAt(3, 3, 100);
    buildMonsterTileIndex();

    const troop = new Troop(lightningSpec, 2, 2);
    const T = CONFIG.TILE_SIZE;
    game.chainHitAt(2 * T + T / 2, 2 * T + T / 2, troop);

    expect(m1.stunTimer).toBeGreaterThan(0);
  });
});

describe('splashAt', () => {
  let game;
  let mortarSpec;
  beforeEach(() => {
    game = makeGame();
    game.waypoints = [
      [0, 0],
      [5, 0],
      [5, 5],
    ];
    game.pathSegments = {
      segments: [{ ax: 0, ay: 0, bx: 5 * CONFIG.TILE_SIZE, by: 0, len: 5 * CONFIG.TILE_SIZE, cumStart: 0 }],
      totalLength: 5 * CONFIG.TILE_SIZE,
    };
    game._splashHitBuf = [];
    game._tileIndexPool = [];
    mortarSpec = TROOP_SPECS.find((s) => s.id === 'mortar');
    vi.spyOn(PARTICLES, 'splashImpact').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function addMonsterAt(gx, gy, hp = 100) {
    game.spawnMonster(1);
    const m = game.monsters[game.monsters.length - 1];
    const T = CONFIG.TILE_SIZE;
    m.x = gx * T + T / 2;
    m.y = gy * T + T / 2;
    m.hp = hp;
    m.maxHp = hp;
    m.alive = true;
    return m;
  }

  it('damages monsters within radius', () => {
    const m1 = addMonsterAt(3, 3, 100);
    game._updateMonsterTileIndex();

    const troop = new Troop(mortarSpec, 2, 2);
    const T = CONFIG.TILE_SIZE;
    const hit = game.splashAt(3 * T + T / 2, 3 * T + T / 2, 50, 2, troop);

    expect(m1.hp).toBeLessThan(100);
    expect(hit.length).toBeGreaterThanOrEqual(1);
  });

  it('returns hit monsters that are still alive', () => {
    const m1 = addMonsterAt(3, 3, 1000);
    game._updateMonsterTileIndex();

    const troop = new Troop(mortarSpec, 2, 2);
    const T = CONFIG.TILE_SIZE;
    const hit = game.splashAt(3 * T + T / 2, 3 * T + T / 2, 10, 2, troop);

    expect(hit).toContain(m1);
  });

  it('returns empty array when no monsters are in range', () => {
    game._updateMonsterTileIndex();

    const troop = new Troop(mortarSpec, 0, 0);
    const T = CONFIG.TILE_SIZE;
    const hit = game.splashAt(T / 2, T / 2, 50, 1, troop);

    expect(hit).toHaveLength(0);
  });

  it('damages multiple monsters in radius', () => {
    const m1 = addMonsterAt(3, 3, 1000);
    const m2 = addMonsterAt(3, 4, 1000);
    game._updateMonsterTileIndex();

    const troop = new Troop(mortarSpec, 3, 3);
    const T = CONFIG.TILE_SIZE;
    const hit = game.splashAt(3 * T + T / 2, 3 * T + T / 2, 20, 2, troop);

    expect(m1.hp).toBeLessThan(1000);
    expect(m2.hp).toBeLessThan(1000);
  });

  it('applies distance falloff to damage', () => {
    const m1 = addMonsterAt(3, 3, 1000);
    const m2 = addMonsterAt(5, 5, 1000);
    game._updateMonsterTileIndex();

    const troop = new Troop(mortarSpec, 3, 3);
    const T = CONFIG.TILE_SIZE;
    game.splashAt(3 * T + T / 2, 3 * T + T / 2, 50, 3, troop);

    // m1 is at center, m2 is further away, so m2 should take less damage
    const dmgM1 = 1000 - m1.hp;
    const dmgM2 = 1000 - m2.hp;
    expect(dmgM1).toBeGreaterThanOrEqual(dmgM2);
  });
});

describe('restart', () => {
  let game;
  beforeEach(() => {
    globalThis.window = { electron: undefined };
    game = makeGame({ devMode: false, gold: 500 });
    game.runtime = {
      stopLoop: vi.fn(),
      startLoop: vi.fn(),
      installResize: vi.fn(),
      applyDefeat: vi.fn(),
      togglePause: vi.fn(),
      startWave: vi.fn(),
    };
    game.waypoints = [
      [0, 0],
      [5, 5],
    ];
    game.pathSegments = { segments: [], totalLength: 100 };
    game.wave = { currentWave: 0, spawnIndex: 0, queue: [], onAllSpawnedAndCleared: vi.fn() };
    vi.spyOn(RENDERER, 'markCacheDirty').mockImplementation(() => {});
    vi.spyOn(RENDERER, '_rebuildCache').mockImplementation(() => {});
    vi.spyOn(PARTICLES, 'clear').mockImplementation(() => {});
    // Mock GameSnapshotRestorer.applyFresh to avoid complex world setup
    const persistence = require('../src/gamePersistence.js');
    vi.spyOn(persistence.GameSnapshotRestorer, 'applyFresh').mockImplementation((g, seed) => {
      // Minimal reset so we can verify restart behavior
      g.troops = [];
      g.monsters = [];
      g.projectiles = [];
      g.popups = [];
      g.grid = new Grid();
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('resets state to PRE_WAVE', () => {
    game.state = 'DEFEAT';
    game.restart();
    expect(game.state).toBe('PRE_WAVE');
  });

  it('resets speed to 1', () => {
    game.speed = 3;
    game.restart();
    expect(game.speed).toBe(1);
  });

  it('resets gold to STARTING_GOLD when not in dev mode', () => {
    game.gold = 500;
    game.restart();
    expect(game.gold).toBe(CONFIG.STARTING_GOLD);
  });

  it('sets gold to Infinity in dev mode', () => {
    game.devMode = true;
    game.gold = 500;
    game.restart();
    expect(game.gold).toBe(Infinity);
  });

  it('resets lives to STARTING_LIVES when not in dev mode', () => {
    game.lives = 10;
    game.restart();
    expect(game.lives).toBe(CONFIG.STARTING_LIVES);
  });

  it('sets lives to Infinity in dev mode', () => {
    game.devMode = true;
    game.lives = 10;
    game.restart();
    expect(game.lives).toBe(Infinity);
  });

  it('clears selectedSpec and selectedTroopIndex', () => {
    game.selectedSpec = archerSpec;
    game.selectedTroopIndex = 2;
    game.restart();
    expect(game.selectedSpec).toBeNull();
    expect(game.selectedTroopIndex).toBe(-1);
  });

  it('resets sellCooldownTimer to 0', () => {
    game.sellCooldownTimer = 5;
    game.restart();
    expect(game.sellCooldownTimer).toBe(0);
  });

  it('clears confirmation flags', () => {
    game.devConfirmPending = true;
    game.resetConfirmPending = true;
    game.sellConfirmPending = true;
    game.sellConfirmTroop = {};
    game.restart();
    expect(game.devConfirmPending).toBe(false);
    expect(game.resetConfirmPending).toBe(false);
    expect(game.sellConfirmPending).toBe(false);
    expect(game.sellConfirmTroop).toBeNull();
  });

  it('calls runtime.stopLoop()', () => {
    game.restart();
    expect(game.runtime.stopLoop).toHaveBeenCalled();
  });

  it('calls runtime.startLoop() via this.start()', () => {
    game.start = vi.fn();
    game.restart();
    expect(game.start).toHaveBeenCalled();
  });
});

describe('resetGame', () => {
  let game;
  beforeEach(() => {
    globalThis.window = { electron: undefined };
    game = makeGame({ devMode: false, gold: 500 });
    game.runtime = {
      stopLoop: vi.fn(),
      startLoop: vi.fn(),
      installResize: vi.fn(),
      applyDefeat: vi.fn(),
      togglePause: vi.fn(),
      startWave: vi.fn(),
    };
    game.waypoints = [
      [0, 0],
      [5, 5],
    ];
    game.pathSegments = { segments: [], totalLength: 100 };
    game.wave = { currentWave: 0, spawnIndex: 0, queue: [], onAllSpawnedAndCleared: vi.fn() };
    vi.spyOn(RENDERER, 'markCacheDirty').mockImplementation(() => {});
    vi.spyOn(RENDERER, '_rebuildCache').mockImplementation(() => {});
    vi.spyOn(PARTICLES, 'clear').mockImplementation(() => {});
    const persistence = require('../src/gamePersistence.js');
    vi.spyOn(persistence.GameSnapshotRestorer, 'applyFresh').mockImplementation((g, seed) => {
      g.troops = [];
      g.monsters = [];
      g.projectiles = [];
      g.popups = [];
      g.grid = new Grid();
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('preserves devMode', () => {
    game.devMode = true;
    game.resetGame();
    expect(game.devMode).toBe(true);
  });

  it('clears devConfirmPending', () => {
    game.devConfirmPending = true;
    game.resetGame();
    expect(game.devConfirmPending).toBe(false);
  });

  it('calls restart() internally (resets state)', () => {
    game.state = 'DEFEAT';
    game.resetGame();
    expect(game.state).toBe('PRE_WAVE');
  });

  it('resets gold to starting value', () => {
    game.gold = 999;
    game.resetGame();
    expect(game.gold).toBe(CONFIG.STARTING_GOLD);
  });
});

describe('toggleDevMode', () => {
  let game;
  beforeEach(() => {
    globalThis.window = { electron: undefined };
    globalThis.document = { getElementById: vi.fn() };
    game = makeGame({ devMode: false, gold: 500 });
    game.runtime = {
      stopLoop: vi.fn(),
      startLoop: vi.fn(),
      installResize: vi.fn(),
      applyDefeat: vi.fn(),
      togglePause: vi.fn(),
      startWave: vi.fn(),
    };
    game.waypoints = [
      [0, 0],
      [5, 5],
    ];
    game.pathSegments = { segments: [], totalLength: 100 };
    game.wave = { currentWave: 0, spawnIndex: 0, queue: [], onAllSpawnedAndCleared: vi.fn() };
    vi.spyOn(RENDERER, 'markCacheDirty').mockImplementation(() => {});
    vi.spyOn(RENDERER, '_rebuildCache').mockImplementation(() => {});
    vi.spyOn(PARTICLES, 'clear').mockImplementation(() => {});
    const persistence = require('../src/gamePersistence.js');
    vi.spyOn(persistence.GameSnapshotRestorer, 'applyFresh').mockImplementation((g, seed) => {
      g.troops = [];
      g.monsters = [];
      g.projectiles = [];
      g.popups = [];
      g.grid = new Grid();
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('toggles devMode from false to true', () => {
    game.devMode = false;
    game.toggleDevMode();
    expect(game.devMode).toBe(true);
  });

  it('toggles devMode from true to false', () => {
    game.devMode = true;
    game.toggleDevMode();
    expect(game.devMode).toBe(false);
  });

  it('calls restart() after toggling', () => {
    game.start = vi.fn();
    game.toggleDevMode();
    expect(game.state).toBe('PRE_WAVE');
    expect(game.start).toHaveBeenCalled();
  });

  it('sets gold to Infinity when enabling dev mode', () => {
    game.devMode = false;
    game.gold = 100;
    game.toggleDevMode();
    expect(game.gold).toBe(Infinity);
  });

  it('sets lives to Infinity when enabling dev mode', () => {
    game.devMode = false;
    game.lives = 10;
    game.toggleDevMode();
    expect(game.lives).toBe(Infinity);
  });
});

describe('resetDevMonsterCounts', () => {
  let game;
  beforeEach(() => {
    game = makeGame({ devMode: true });
  });

  it('resets all counts to zero', () => {
    game.devMonsterCounts = { 1: 5, 2: 3, 3: 1, 4: 0, 5: 0, Y: 2, B: 1, S: 0, X: 0 };

    game.resetDevMonsterCounts();

    for (const key of Object.keys(game.devMonsterCounts)) {
      expect(game.devMonsterCounts[key]).toBe(0);
    }
  });

  it('includes all MONSTER_DEV_ORDER keys', () => {
    game.resetDevMonsterCounts();
    const { MONSTER_DEV_ORDER } = require('../src/config.js');
    for (const key of MONSTER_DEV_ORDER) {
      expect(game.devMonsterCounts).toHaveProperty(String(key));
    }
  });
});
