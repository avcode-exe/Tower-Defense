import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Game } from '../src/game.js';
import { CONFIG, TROOP_SPECS, MONSTER_SPECS } from '../src/config.js';
import { Grid, TILE } from '../src/grid.js';
import { Troop } from '../src/troop.js';
import { Monster } from '../src/monster.js';
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
  game._tileIndexPool = [];
  game._getPopup = vi.fn();
  game.sellCooldownTimer = 0;
  game.selectedTroopIndex = -1;
  game.selectedSpec = null;
  game.sellConfirmPending = false;
  game.sellConfirmTroop = null;
  game._addGold = Game.prototype._addGold;
  game._findClosestMonsterNear = Game.prototype._findClosestMonsterNear;
  return game;
}

const archerSpec = TROOP_SPECS.find((s) => s.id === 'archer');
const swordsmanSpec = TROOP_SPECS.find((s) => s.id === 'swordsman');
const knightSpec = TROOP_SPECS.find((s) => s.id === 'knight');
const lightningSpec = TROOP_SPECS.find((s) => s.id === 'lightning');
const icewizSpec = TROOP_SPECS.find((s) => s.id === 'icewiz');

function sharedPath() {
  return { segments: [], totalLength: 0 };
}

function makeMonster(level, hpMult = 1) {
  return new Monster(level, [[0, 0]], sharedPath(), hpMult);
}

// ─── damageMonster ──────────────────────────────────────────────────────────

describe('damageMonster', () => {
  let game;
  beforeEach(() => {
    game = makeGame();
    vi.spyOn(AUDIO, 'goldEarned').mockImplementation(() => {});
    vi.spyOn(PARTICLES, 'deathBurst').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns false for dead monster', () => {
    const m = makeMonster(1);
    m.alive = false;
    expect(game.damageMonster(m, 10)).toBe(false);
  });

  it('force-kills monster with hp <= 0 without reward', () => {
    const m = makeMonster(1);
    m.hp = 0;
    const goldBefore = game.gold;
    game.damageMonster(m, 10);
    expect(m.alive).toBe(false);
    expect(game.gold).toBe(goldBefore);
  });

  it('awards reward + 1 gold on kill', () => {
    game.gold = 0;
    const m = makeMonster(1);
    const reward = m.reward;
    game.damageMonster(m, m.hp + 10);
    expect(game.gold).toBe(reward + 1);
  });

  it('shows shield popup when shield absorbs all damage', () => {
    const m = makeMonster('S');
    const shieldBefore = m.shield;
    game.damageMonster(m, 1);
    expect(m.shield).toBe(shieldBefore - 1);
    expect(game._getPopup).toHaveBeenCalled();
  });

  it('reviveImmune flag is checked in split logic, not damage', () => {
    const m = makeMonster(1);
    m.reviveImmune = true;
    m.reviveDamageRatio = 0.5;
    const prevHp = m.hp;
    game.damageMonster(m, 10);
    // damageMonster does NOT apply reviveDamageRatio — full damage goes through
    expect(m.hp).toBe(prevHp - 10);
  });

  it('does not split reviveImmune monsters', () => {
    const m = makeMonster(3);
    m.reviveImmune = true;
    const countBefore = game.monsters.length;
    game.damageMonster(m, m.hp + 10);
    expect(game.monsters.length).toBe(countBefore);
  });

  it('does not split noSplit monsters (Runner)', () => {
    const m = makeMonster(2);
    const countBefore = game.monsters.length;
    game.damageMonster(m, m.hp + 10);
    expect(game.monsters.length).toBe(countBefore);
  });

  it('splits level 3 Brute into two Grunts', () => {
    const sp = { segments: [{ ax: 0, ay: 0, bx: 530, by: 0, len: 530, cumStart: 0 }], totalLength: 530 };
    const m = new Monster(3, [[0, 0]], sp, 1);
    game.monsters = [m];
    game.waypoints = [[0, 0]];
    game.pathSegments = sp;
    game.damageMonster(m, m.hp + 10);
    const children = game.monsters.filter((mon) => mon !== m);
    expect(children).toHaveLength(2);
    expect(children.every((c) => c.level === 1)).toBe(true);
  });

  it('child monsters inherit hpMult', () => {
    const sp = { segments: [{ ax: 0, ay: 0, bx: 530, by: 0, len: 530, cumStart: 0 }], totalLength: 530 };
    const m = new Monster(3, [[0, 0]], sp, 2);
    game.monsters = [m];
    game.waypoints = [[0, 0]];
    game.pathSegments = sp;
    game.damageMonster(m, m.hp + 10);
    const children = game.monsters.filter((mon) => mon !== m);
    expect(children.every((c) => c.hpMult === 2)).toBe(true);
  });

  it('child monsters inherit stunTimer', () => {
    const sp = { segments: [{ ax: 0, ay: 0, bx: 530, by: 0, len: 530, cumStart: 0 }], totalLength: 530 };
    const m = new Monster(3, [[0, 0]], sp, 1);
    m.stunTimer = 0.5;
    game.monsters = [m];
    game.waypoints = [[0, 0]];
    game.pathSegments = sp;
    game.damageMonster(m, m.hp + 10);
    const children = game.monsters.filter((mon) => mon !== m);
    expect(children.every((c) => c.stunTimer === 0.5)).toBe(true);
  });
});

// ─── _stepPopups ────────────────────────────────────────────────────────────

describe('_stepPopups', () => {
  let game;
  beforeEach(() => {
    game = makeGame();
  });

  it('removes popups with t <= 0 and recycles to pool', () => {
    game.popups = [
      { text: 'a', x: 0, y: 0, t: 1.0, color: '#fff' },
      { text: 'b', x: 0, y: 0, t: 0.3, color: '#fff' },
    ];
    game._stepPopups(0.5);
    expect(game.popups).toHaveLength(1);
    expect(game.popups[0].text).toBe('a');
    expect(game.popups[0].t).toBeCloseTo(0.5);
    expect(game._popupPool.length).toBe(1);
    expect(game._popupPool[0].text).toBe('b');
  });

  it('keeps popups with t > 0', () => {
    game.popups = [{ text: 'a', x: 0, y: 0, t: 1.0, color: '#fff' }];
    game._stepPopups(0.5);
    expect(game.popups).toHaveLength(1);
    expect(game.popups[0].t).toBeCloseTo(0.5);
  });

  it('recycles to pool only up to 100 entries', () => {
    game._popupPool = Array.from({ length: 100 }, () => ({ text: 'x' }));
    game.popups = [{ text: 'a', x: 0, y: 0, t: -0.1, color: '#fff' }];
    game._stepPopups(0.2);
    expect(game._popupPool.length).toBe(100);
  });

  it('handles empty popups array', () => {
    game.popups = [];
    expect(() => game._stepPopups(0.1)).not.toThrow();
  });
});

// ─── _buildTroopTileIndex ───────────────────────────────────────────────────

describe('_buildTroopTileIndex', () => {
  let game;
  beforeEach(() => {
    game = makeGame();
  });

  it('indexes alive troops by tile', () => {
    const t1 = new Troop(archerSpec, 2, 3);
    const t2 = new Troop(archerSpec, 5, 5);
    game.troops = [t1, t2];
    game._buildTroopTileIndex();
    expect(game._troopTileIndex[3 * CONFIG.GRID_SIZE + 2]).toContain(t1);
    expect(game._troopTileIndex[5 * CONFIG.GRID_SIZE + 5]).toContain(t2);
  });

  it('skips dead troops', () => {
    const alive = new Troop(archerSpec, 2, 3);
    const dead = new Troop(archerSpec, 4, 5);
    dead.alive = false;
    game.troops = [alive, dead];
    game._buildTroopTileIndex();
    expect(game._troopTileIndex[5 * CONFIG.GRID_SIZE + 4]).toHaveLength(0);
  });

  it('clears previous index before rebuilding', () => {
    const t1 = new Troop(archerSpec, 2, 3);
    game.troops = [t1];
    game._buildTroopTileIndex();
    expect(game._troopTileIndex[3 * CONFIG.GRID_SIZE + 2]).toContain(t1);

    game.troops = [];
    game._buildTroopTileIndex();
    expect(game._troopTileIndex[3 * CONFIG.GRID_SIZE + 2]).toHaveLength(0);
  });

  it('populates _troopIndexByRef', () => {
    const t1 = new Troop(archerSpec, 2, 3);
    game.troops = [t1];
    game._buildTroopTileIndex();
    expect(game._troopIndexByRef.get(t1)).toBe(0);
  });
});

// ─── _updateMonsterTileIndex ────────────────────────────────────────────────

describe('_updateMonsterTileIndex', () => {
  let game;
  beforeEach(() => {
    game = makeGame();
  });

  it('indexes alive monsters by tile position', () => {
    const m = makeMonster(1);
    m.x = 3 * CONFIG.TILE_SIZE + CONFIG.TILE_SIZE / 2;
    m.y = 5 * CONFIG.TILE_SIZE + CONFIG.TILE_SIZE / 2;
    game.monsters = [m];
    game._updateMonsterTileIndex();
    const key = 5 * CONFIG.GRID_SIZE + 3;
    expect(game._monsterTileIndex[key]).toBeDefined();
    expect(game._monsterTileIndex[key]).toContain(m);
  });

  it('skips dead monsters', () => {
    const m = makeMonster(1);
    m.x = 3 * CONFIG.TILE_SIZE + CONFIG.TILE_SIZE / 2;
    m.y = 5 * CONFIG.TILE_SIZE + CONFIG.TILE_SIZE / 2;
    m.alive = false;
    game.monsters = [m];
    game._updateMonsterTileIndex();
    const key = 5 * CONFIG.GRID_SIZE + 3;
    expect(game._monsterTileIndex[key]).toBeUndefined();
  });

  it('clamps monster position to grid bounds', () => {
    const m = makeMonster(1);
    m.x = -100;
    m.y = -100;
    game.monsters = [m];
    game._updateMonsterTileIndex();
    expect(game._monsterTileIndex[0]).toBeDefined();
    expect(game._monsterTileIndex[0]).toContain(m);
  });
});

// ─── buyTroopShield edge cases ──────────────────────────────────────────────

describe('buyTroopShield edge cases', () => {
  let game;
  beforeEach(() => {
    game = makeGame({ devMode: false, gold: 10000 });
    vi.spyOn(AUDIO, 'shieldBuy').mockImplementation(() => {});
    vi.spyOn(PARTICLES, 'troopShieldActivate').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns false when gold is insufficient', () => {
    game.gold = 1;
    const troop = new Troop(archerSpec, 0, 0);
    game.troops.push(troop);
    expect(game.buyTroopShield(0)).toBe(false);
    expect(troop.shield).toBe(0);
  });

  it('returns false for dead troop', () => {
    const troop = new Troop(archerSpec, 0, 0);
    troop.alive = false;
    game.troops.push(troop);
    expect(game.buyTroopShield(0)).toBe(false);
  });

  it('returns false for invalid index', () => {
    expect(game.buyTroopShield(99)).toBe(false);
  });

  it('does not deduct gold in dev mode', () => {
    game.devMode = true;
    game.gold = 0;
    const troop = new Troop(archerSpec, 0, 0);
    game.troops.push(troop);
    expect(game.buyTroopShield(0)).toBe(true);
    expect(game.gold).toBe(0);
  });
});

// ─── getPlacementInvalidReason edge cases ────────────────────────────────────

describe('getPlacementInvalidReason edge cases', () => {
  let game;
  beforeEach(() => {
    game = makeGame({ devMode: false, gold: 1000 });
  });

  it('returns specific gold reason with cost amount', () => {
    game.gold = 5;
    const reason = game.getPlacementInvalidReason(0, 0, archerSpec);
    expect(reason).toContain(String(archerSpec.cost));
    expect(reason).toContain('g');
  });

  it('returns null for valid placement', () => {
    expect(game.getPlacementInvalidReason(0, 0, archerSpec)).toBeNull();
  });

  it('returns Tile occupied for occupied tile', () => {
    const troop = new Troop(archerSpec, 3, 3);
    game.troops.push(troop);
    game._buildTroopTileIndex();
    expect(game.getPlacementInvalidReason(3, 3, archerSpec)).toBe('Tile occupied');
  });

  it('returns null in dev mode regardless of gold', () => {
    game.devMode = true;
    game.gold = 0;
    expect(game.getPlacementInvalidReason(0, 0, archerSpec)).toBeNull();
  });

  it('checks gold before tile occupancy', () => {
    game.gold = 0;
    const troop = new Troop(archerSpec, 0, 0);
    game.troops.push(troop);
    game._buildTroopTileIndex();
    const reason = game.getPlacementInvalidReason(0, 0, archerSpec);
    expect(reason).toContain('g');
  });
});

// ─── _findClosestMonsterNear ────────────────────────────────────────────────

describe('_findClosestMonsterNear', () => {
  let game;
  beforeEach(() => {
    game = makeGame();
  });

  it('returns closest alive monster', () => {
    const T = CONFIG.TILE_SIZE;
    const m1 = makeMonster(1);
    m1.x = 2 * T;
    m1.y = 0;
    m1.alive = true;
    const m2 = makeMonster(1);
    m2.x = 5 * T;
    m2.y = 0;
    m2.alive = true;
    game.monsters = [m1, m2];
    game._updateMonsterTileIndex();
    const closest = game._findClosestMonsterNear(T, 0);
    expect(closest).toBe(m1);
  });

  it('returns null when no monsters nearby', () => {
    game.monsters = [];
    game._updateMonsterTileIndex();
    expect(game._findClosestMonsterNear(0, 0)).toBeNull();
  });

  it('skips dead monsters', () => {
    const T = CONFIG.TILE_SIZE;
    const m1 = makeMonster(1);
    m1.x = T;
    m1.y = 0;
    m1.alive = false;
    game.monsters = [m1];
    game._updateMonsterTileIndex();
    expect(game._findClosestMonsterNear(T / 2, 0)).toBeNull();
  });
});
