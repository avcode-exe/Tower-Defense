import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Game } from '../src/game.js';
import { CONFIG, TROOP_SPECS, MONSTER_SPECS } from '../src/config.js';
import { Grid, TILE } from '../src/grid.js';
import { Troop } from '../src/troop.js';
import { WaveManager } from '../src/waveManager.js';

// Mock external modules
vi.mock('../src/audio.js', () => ({
  AUDIO: {
    troopPlace: vi.fn(),
    goldEarned: vi.fn(),
    sell: vi.fn(),
    upgrade: vi.fn(),
    heal: vi.fn(),
    shieldBuy: vi.fn(),
    waveComplete: vi.fn(),
    monsterLeak: vi.fn(),
    troopDeath: vi.fn(),
    toggleMute: vi.fn(),
  },
}));

vi.mock('../src/particles.js', () => ({
  PARTICLES: {
    update: vi.fn(),
    deathBurst: vi.fn(),
    hitSpark: vi.fn(),
    chainSpark: vi.fn(),
    slowApply: vi.fn(),
    healBurst: vi.fn(),
    troopDeath: vi.fn(),
    troopShieldActivate: vi.fn(),
    reviveBurst: vi.fn(),
    splashImpact: vi.fn(),
    spawnTrail: vi.fn(),
  },
}));

vi.mock('../src/rendering/renderer.js', () => ({
  RENDERER: {
    init: vi.fn(),
    markCacheDirty: vi.fn(),
    toWorldInto: vi.fn(),
    width: 800,
    height: 600,
  },
}));

vi.mock('../src/rendering/gameRenderer.js', () => ({
  renderGame: vi.fn(),
  updateCursor: vi.fn(),
}));

vi.mock('../src/gameRuntime.js', () => ({
  GameRuntimeController: vi.fn().mockImplementation(() => ({
    installResize: vi.fn(),
    startLoop: vi.fn(),
    stopLoop: vi.fn(),
    applyDefeat: vi.fn(),
    startWave: vi.fn(),
    togglePause: vi.fn(),
  })),
}));

vi.mock('../src/gamePersistence.js', () => ({
  SaveSerializer: { fromGame: vi.fn(() => ({})) },
  GameWorldFactory: {
    createFresh: vi.fn((seed) => ({
      grid: new Grid(),
      waypoints: [
        [0, 0],
        [5, 0],
        [5, 5],
        [10, 5],
        [10, 10],
        [15, 10],
      ],
      pathSegments: {
        segments: [
          { ax: 0, ay: 26.5, bx: 848, by: 26.5, len: 848, cumStart: 0 },
          { ax: 848, ay: 26.5, bx: 848, by: 291.5, len: 265, cumStart: 848 },
          { ax: 848, ay: 291.5, bx: 291.5, by: 291.5, len: 556.5, cumStart: 1113 },
          { ax: 291.5, ay: 291.5, bx: 291.5, by: 556.5, len: 265, cumStart: 1669.5 },
          { ax: 291.5, ay: 556.5, bx: 795, by: 556.5, len: 503.5, cumStart: 1934.5 },
        ],
        totalLength: 2438,
      },
    })),
  },
  GameSnapshotRestorer: { apply: vi.fn(), applyFresh: vi.fn() },
}));

vi.mock('../src/ui/index.js', () => ({
  UI: {
    handleToggleClick: vi.fn(() => false),
    hitShop: vi.fn(() => -1),
    _devConfirmYes: null,
    _devConfirmNo: null,
    _shieldBuyBtn: null,
  },
  UI_LAYOUT: {
    collapsed: { hud: false, shop: false, shieldShop: false },
    shopWidth: 120,
    hudHeight: 50,
    previewHeight: 80,
    shieldShopWidth: 20,
    SHOP_WIDTH: 120,
  },
}));

import { makeGame } from './helpers.js';

const swordsmanSpec = TROOP_SPECS.find((s) => s.id === 'swordsman');
const archerSpec = TROOP_SPECS.find((s) => s.id === 'archer');
const knightSpec = TROOP_SPECS.find((s) => s.id === 'knight');
const mageSpec = TROOP_SPECS.find((s) => s.id === 'mage');
const sniperSpec = TROOP_SPECS.find((s) => s.id === 'sniper');
const lightningSpec = TROOP_SPECS.find((s) => s.id === 'lightning');

// ─── Config constants ──────────────────────────────────────────────────────

describe('Gold Economy: config constants', () => {
  it('STARTING_GOLD is 1000', () => {
    expect(CONFIG.STARTING_GOLD).toBe(1000);
  });

  it('MAX_GOLD is 1000000', () => {
    expect(CONFIG.MAX_GOLD).toBe(1000000);
  });

  it('SELL_REFUND_RATIO is 0.3 (30%)', () => {
    expect(CONFIG.SELL_REFUND_RATIO).toBe(0.3);
  });

  it('SELL_COOLDOWN is 3.0 seconds', () => {
    expect(CONFIG.SELL_COOLDOWN).toBe(3.0);
  });

  it('UPGRADE_COST_SCALE is 1.35', () => {
    expect(CONFIG.UPGRADE_COST_SCALE).toBe(1.35);
  });

  it('SHIELD_COST_RATIO is 0.5 (50%)', () => {
    expect(CONFIG.SHIELD_COST_RATIO).toBe(0.5);
  });

  it('TROOP_HEAL_COST_RATIO is 0.1 (10%)', () => {
    expect(CONFIG.TROOP_HEAL_COST_RATIO).toBe(0.1);
  });

  it('TROOP_HEAL_HP_RATIO is 0.1 (10% max HP)', () => {
    expect(CONFIG.TROOP_HEAL_HP_RATIO).toBe(0.1);
  });

  it('MELEE_DAMAGE_REDUCTION is 0.3 (30% effective)', () => {
    expect(CONFIG.MELEE_DAMAGE_REDUCTION).toBe(0.3);
  });
});

// ─── Placing troops costs gold ─────────────────────────────────────────────

describe('Gold Economy: placing troops', () => {
  let game;
  beforeEach(() => {
    game = makeGame({ gold: 10000 });
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('placing a swordsman costs 70 gold', () => {
    game.placeTroop(swordsmanSpec, 3, 3);
    expect(game.gold).toBe(10000 - 70);
  });

  it('placing an archer costs 70 gold', () => {
    game.placeTroop(archerSpec, 3, 3);
    expect(game.gold).toBe(10000 - 70);
  });

  it('placing a knight costs 120 gold', () => {
    game.placeTroop(knightSpec, 3, 3);
    expect(game.gold).toBe(10000 - 120);
  });

  it('placing a mage costs 180 gold', () => {
    game.placeTroop(mageSpec, 3, 3);
    expect(game.gold).toBe(10000 - 180);
  });

  it('placing a sniper costs 250 gold', () => {
    game.placeTroop(sniperSpec, 3, 3);
    expect(game.gold).toBe(10000 - 250);
  });

  it('placing a lightning costs 300 gold', () => {
    game.placeTroop(lightningSpec, 3, 3);
    expect(game.gold).toBe(10000 - 300);
  });

  it('cannot place with insufficient gold', () => {
    game.gold = 50;
    expect(game.placeTroop(swordsmanSpec, 3, 3)).toBe(false);
    expect(game.gold).toBe(50);
  });

  it('dev mode placement is free', () => {
    game.devMode = true;
    game.placeTroop(swordsmanSpec, 3, 3);
    expect(game.gold).toBe(10000);
  });

  it('all troop costs match their spec', () => {
    for (const spec of TROOP_SPECS) {
      const g = makeGame({ gold: 100000 });
      g.placeTroop(spec, 3, 3);
      expect(g.gold).toBe(100000 - spec.cost);
    }
  });
});

// ─── Selling refunds ───────────────────────────────────────────────────────

describe('Gold Economy: selling refunds', () => {
  let game;
  beforeEach(() => {
    game = makeGame({ gold: 10000 });
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('selling refunds 30% of base cost', () => {
    game.placeTroop(swordsmanSpec, 3, 3);
    const goldAfterPlace = game.gold;
    game.sellTroop(0);
    const expectedRefund = Math.ceil(swordsmanSpec.cost * CONFIG.SELL_REFUND_RATIO);
    expect(game.gold).toBe(goldAfterPlace + expectedRefund);
  });

  it('sell cooldown prevents rapid selling', () => {
    game.placeTroop(swordsmanSpec, 3, 3);
    game.placeTroop(archerSpec, 4, 3);
    game.sellTroop(0);
    expect(game.sellCooldownTimer).toBe(CONFIG.SELL_COOLDOWN);
    game.sellTroop(1);
    expect(game.troops[1].alive).toBe(true);
  });

  it('sell cooldown resets over time', () => {
    game.placeTroop(swordsmanSpec, 3, 3);
    game.placeTroop(archerSpec, 4, 3);
    game.sellTroop(0);
    for (let i = 0; i < 300; i++) game.step(CONFIG.FIXED_TIMESTEP);
    expect(game.sellCooldownTimer).toBe(0);
    game.sellTroop(0);
    expect(game.troops[0].alive).toBe(false);
  });

  it('dev mode sell does not give refund', () => {
    game.devMode = true;
    game.placeTroop(swordsmanSpec, 3, 3);
    // devMode must remain true during sell to skip refund
    const goldBefore = game.gold;
    game.sellTroop(0);
    // No refund awarded in dev mode; gold unchanged from free placement
    expect(game.gold).toBe(goldBefore);
  });

  it('selling upgrades refund includes invested gold', () => {
    game.placeTroop(archerSpec, 3, 3);
    game.upgradeTroopStat(0, 'dmg');
    const totalInvested = game.troops[0].getTotalInvested();
    const goldBefore = game.gold;
    game.sellTroop(0);
    const expectedRefund = Math.ceil(totalInvested * CONFIG.SELL_REFUND_RATIO);
    expect(game.gold).toBe(goldBefore + expectedRefund);
  });

  it('sell refund includes heal gold spent', () => {
    game.placeTroop(archerSpec, 3, 3);
    game.troops[0].hp = 5;
    game.healTroop(0);
    const totalInvested = game.troops[0].getTotalInvested();
    expect(totalInvested).toBe(archerSpec.cost + game.troops[0].healGoldSpent);
  });

  it('cannot sell dead troop', () => {
    game.placeTroop(archerSpec, 3, 3);
    game.killTroop(game.troops[0]);
    const goldBefore = game.gold;
    game.sellTroop(0);
    expect(game.gold).toBe(goldBefore);
  });
});

// ─── Upgrade costs ─────────────────────────────────────────────────────────

describe('Gold Economy: upgrade costs', () => {
  let game;
  beforeEach(() => {
    game = makeGame({ gold: 10000 });
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('first upgrade costs base cost', () => {
    game.placeTroop(archerSpec, 3, 3);
    const goldBefore = game.gold;
    game.upgradeTroopStat(0, 'dmg');
    const expectedCost = Math.round(archerSpec.cost * Math.pow(CONFIG.UPGRADE_COST_SCALE, 0));
    expect(game.gold).toBe(goldBefore - expectedCost);
  });

  it('second upgrade costs 1.35x first', () => {
    game.placeTroop(archerSpec, 3, 3);
    game.upgradeTroopStat(0, 'dmg');
    const goldBefore = game.gold;
    game.upgradeTroopStat(0, 'dmg');
    const expectedCost = Math.round(archerSpec.cost * CONFIG.UPGRADE_COST_SCALE);
    expect(game.gold).toBe(goldBefore - expectedCost);
  });

  it('upgrade cost scales exponentially', () => {
    game.placeTroop(archerSpec, 3, 3);
    const costs = [];
    for (let i = 0; i < 5; i++) {
      const cost = game.troops[0].getUpgradeCost('dmg');
      costs.push(cost);
      game.upgradeTroopStat(0, 'dmg');
    }
    for (let i = 1; i < costs.length; i++) {
      expect(costs[i]).toBeGreaterThan(costs[i - 1]);
    }
  });

  it('cannot upgrade when gold is insufficient', () => {
    game.devMode = true;
    game.placeTroop(archerSpec, 3, 3);
    game.devMode = false;
    game.gold = 10;
    const dmgBefore = game.troops[0].dmgLevel;
    game.upgradeTroopStat(0, 'dmg');
    expect(game.troops[0].dmgLevel).toBe(dmgBefore);
    expect(game.gold).toBe(10);
  });

  it('dev mode upgrade is free', () => {
    game.devMode = true;
    game.placeTroop(archerSpec, 3, 3);
    const goldBefore = game.gold;
    game.upgradeTroopStat(0, 'dmg');
    expect(game.gold).toBe(goldBefore);
    expect(game.troops[0].dmgLevel).toBe(2);
  });

  it('upgrade stat comparison: dmg costs same as speed', () => {
    game.placeTroop(archerSpec, 3, 3);
    const dmgCost = game.troops[0].getUpgradeCost('dmg');
    const speedCost = game.troops[0].getUpgradeCost('speed');
    expect(dmgCost).toBe(speedCost);
  });

  it('upgrade cost formula: round(baseCost * UPGRADE_COST_SCALE^currentLevel)', () => {
    game.placeTroop(archerSpec, 3, 3);
    const baseCost = archerSpec.cost;
    for (let lvl = 0; lvl < 5; lvl++) {
      const expected = Math.round(baseCost * Math.pow(CONFIG.UPGRADE_COST_SCALE, lvl));
      const actual = game.troops[0].getUpgradeCost('dmg');
      expect(actual).toBe(expected);
      game.upgradeTroopStat(0, 'dmg');
    }
  });

  it('total invested tracks cumulative spending', () => {
    game.placeTroop(archerSpec, 3, 3);
    const t = game.troops[0];
    expect(t.getTotalInvested()).toBe(archerSpec.cost);
    game.upgradeTroopStat(0, 'dmg');
    const cost1 = Math.round(archerSpec.cost * Math.pow(CONFIG.UPGRADE_COST_SCALE, 0));
    expect(t.getTotalInvested()).toBe(archerSpec.cost + cost1);
  });
});

// ─── Shield purchasing ─────────────────────────────────────────────────────

describe('Gold Economy: shield purchasing', () => {
  let game;
  beforeEach(() => {
    game = makeGame({ gold: 10000 });
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('shield cost is 50% of troop cost', () => {
    game.placeTroop(archerSpec, 3, 3);
    const goldBefore = game.gold;
    game.buyTroopShield(0);
    const expectedCost = Math.ceil(archerSpec.cost * CONFIG.SHIELD_COST_RATIO);
    expect(game.gold).toBe(goldBefore - expectedCost);
  });

  it('shield is set to troop maxHp', () => {
    game.placeTroop(archerSpec, 3, 3);
    const archer = game.troops[0];
    game.buyTroopShield(0);
    expect(archer.shield).toBe(archer.maxHp);
  });

  it('cannot buy shield when already shielded', () => {
    game.placeTroop(archerSpec, 3, 3);
    game.buyTroopShield(0);
    const goldBefore = game.gold;
    const result = game.buyTroopShield(0);
    expect(result).toBe(false);
    expect(game.gold).toBe(goldBefore);
  });

  it('cannot buy shield with insufficient gold', () => {
    game.placeTroop(archerSpec, 3, 3);
    game.gold = 1;
    const result = game.buyTroopShield(0);
    expect(result).toBe(false);
  });

  it('dev mode shield is free', () => {
    game.devMode = true;
    game.placeTroop(archerSpec, 3, 3);
    const goldBefore = game.gold;
    game.buyTroopShield(0);
    expect(game.gold).toBe(goldBefore);
    expect(game.troops[0].hasShield()).toBe(true);
  });

  it('knight shield costs 60 gold (50% of 120)', () => {
    game.placeTroop(knightSpec, 3, 3);
    const goldBefore = game.gold;
    game.buyTroopShield(0);
    expect(game.gold).toBe(goldBefore - 60);
  });

  it('sniper shield costs 125 gold (50% of 250)', () => {
    game.placeTroop(sniperSpec, 3, 3);
    const goldBefore = game.gold;
    game.buyTroopShield(0);
    expect(game.gold).toBe(goldBefore - 125);
  });

  it('shield absorbs damage before HP', () => {
    game.placeTroop(archerSpec, 3, 3);
    const archer = game.troops[0];
    game.buyTroopShield(0);
    const shieldBefore = archer.shield;
    archer.takeDamage(10);
    expect(archer.shield).toBe(shieldBefore - 10);
    expect(archer.hp).toBe(archer.maxHp);
  });

  it('shield clear does not refund gold', () => {
    game.placeTroop(archerSpec, 3, 3);
    game.buyTroopShield(0);
    const goldBefore = game.gold;
    game.troops[0].clearShield();
    expect(game.gold).toBe(goldBefore);
  });

  it('shield does not expire immediately', () => {
    game.placeTroop(archerSpec, 3, 3);
    game.buyTroopShield(0);
    expect(game.troops[0].hasShield()).toBe(true);
    for (let i = 0; i < 60; i++) game.step(CONFIG.FIXED_TIMESTEP);
    expect(game.troops[0].hasShield()).toBe(true);
  });
});

// ─── Heal costs ────────────────────────────────────────────────────────────

describe('Gold Economy: heal costs', () => {
  let game;
  beforeEach(() => {
    game = makeGame({ gold: 10000 });
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('heal cost is 10% of base troop price', () => {
    game.placeTroop(archerSpec, 3, 3);
    game.troops[0].hp = 5;
    const goldBefore = game.gold;
    game.healTroop(0);
    const expectedCost = Math.ceil(archerSpec.cost * CONFIG.TROOP_HEAL_COST_RATIO);
    expect(game.gold).toBe(goldBefore - expectedCost);
  });

  it('heal restores 10% of max HP', () => {
    game.placeTroop(archerSpec, 3, 3);
    const archer = game.troops[0];
    const prevHp = 10;
    archer.hp = prevHp;
    game.healTroop(0);
    const expectedHeal = Math.ceil(archer.maxHp * CONFIG.TROOP_HEAL_HP_RATIO);
    expect(archer.hp).toBe(Math.min(prevHp + expectedHeal, archer.maxHp));
  });

  it('cannot heal full-HP troop', () => {
    game.placeTroop(archerSpec, 3, 3);
    const goldBefore = game.gold;
    game.healTroop(0);
    expect(game.gold).toBe(goldBefore);
  });

  it('cannot heal with insufficient gold', () => {
    game.placeTroop(archerSpec, 3, 3);
    game.troops[0].hp = 5;
    game.gold = 1;
    const hpBefore = game.troops[0].hp;
    game.healTroop(0);
    expect(game.troops[0].hp).toBe(hpBefore);
  });

  it('dev mode heal is free', () => {
    game.devMode = true;
    game.placeTroop(archerSpec, 3, 3);
    game.troops[0].hp = 5;
    const goldBefore = game.gold;
    game.healTroop(0);
    expect(game.gold).toBe(goldBefore);
    expect(game.troops[0].hp).toBeGreaterThan(5);
  });

  it('healGoldSpent tracks cumulative heal spending', () => {
    game.placeTroop(archerSpec, 3, 3);
    const archer = game.troops[0];
    const healCost = Math.ceil(archerSpec.cost * CONFIG.TROOP_HEAL_COST_RATIO);
    archer.hp = 5;
    game.healTroop(0);
    expect(archer.healGoldSpent).toBe(healCost);
    archer.hp = 5;
    game.healTroop(0);
    expect(archer.healGoldSpent).toBe(healCost * 2);
  });

  it('sell refund includes heal gold spent', () => {
    game.placeTroop(archerSpec, 3, 3);
    game.troops[0].hp = 5;
    game.healTroop(0);
    const totalInvested = game.troops[0].getTotalInvested();
    expect(totalInvested).toBe(archerSpec.cost + game.troops[0].healGoldSpent);
  });
});

// ─── Monster kill rewards ──────────────────────────────────────────────────

describe('Gold Economy: monster kill rewards', () => {
  let game;
  beforeEach(() => {
    game = makeGame({ gold: 10000 });
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('killing a grunt awards reward+1 gold', () => {
    game.spawnMonster(1);
    const m = game.monsters[0];
    const goldBefore = game.gold;
    game.damageMonster(m, m.hp + 10);
    expect(game.gold).toBe(goldBefore + m.reward + 1);
  });

  it('killing a boss awards 201 gold', () => {
    game.spawnMonster('B');
    const boss = game.monsters[0];
    const goldBefore = game.gold;
    game.damageMonster(boss, boss.hp + 10);
    expect(game.gold).toBe(goldBefore + 200 + 1);
  });

  it('different monsters have different rewards', () => {
    expect(MONSTER_SPECS[1].reward).toBe(4);
    expect(MONSTER_SPECS[2].reward).toBe(6);
    expect(MONSTER_SPECS[3].reward).toBe(11);
    expect(MONSTER_SPECS[4].reward).toBe(17);
    expect(MONSTER_SPECS[5].reward).toBe(36);
    expect(MONSTER_SPECS.B.reward).toBe(200);
  });

  it('gold does not exceed MAX_GOLD', () => {
    game.gold = CONFIG.MAX_GOLD - 5;
    game.spawnMonster(1);
    game.damageMonster(game.monsters[0], game.monsters[0].hp + 10);
    expect(game.gold).toBe(CONFIG.MAX_GOLD);
  });

  it('dev mode _addGold sets gold to Infinity', () => {
    game.devMode = true;
    game.gold = 100;
    game._addGold(50);
    expect(game.gold).toBe(Infinity);
  });

  it('no reward for already-dead monster', () => {
    game.spawnMonster(1);
    const m = game.monsters[0];
    game.damageMonster(m, m.hp + 10);
    const goldAfterFirst = game.gold;
    game.damageMonster(m, 100);
    expect(game.gold).toBe(goldAfterFirst);
  });

  it('multiple kills accumulate gold correctly', () => {
    const goldBefore = game.gold;
    for (let i = 0; i < 5; i++) {
      game.spawnMonster(1);
      const m = game.monsters[game.monsters.length - 1];
      game.damageMonster(m, m.hp + 10);
    }
    const expectedGold = goldBefore + 5 * (MONSTER_SPECS[1].reward + 1);
    expect(game.gold).toBe(expectedGold);
  });
});

// ─── Full economy cycle ────────────────────────────────────────────────────

describe('Gold Economy: full cycle simulation', () => {
  let game;
  beforeEach(() => {
    game = makeGame({ gold: 1000 });
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('earn gold from kills, spend on upgrades, recover via sell', () => {
    game.placeTroop(archerSpec, 3, 3);
    const goldAfterPlace = game.gold;
    expect(goldAfterPlace).toBe(1000 - 70);

    game.spawnMonster(1);
    const m = game.monsters[0];
    game.damageMonster(m, m.hp + 10);
    const goldAfterKill = game.gold;
    expect(goldAfterKill).toBeGreaterThan(goldAfterPlace);

    game.upgradeTroopStat(0, 'dmg');
    const goldAfterUpgrade = game.gold;
    expect(goldAfterUpgrade).toBeLessThan(goldAfterKill);

    const totalInvested = game.troops[0].getTotalInvested();
    game.sellTroop(0);
    const refund = Math.ceil(totalInvested * CONFIG.SELL_REFUND_RATIO);
    expect(game.gold).toBe(goldAfterUpgrade + refund);
  });

  it('shield + heal spending exceeds base cost', () => {
    game.placeTroop(archerSpec, 3, 3);
    game.troops[0].hp = 10;
    game.healTroop(0);
    game.buyTroopShield(0);
    const totalInvested = game.troops[0].getTotalInvested();
    expect(totalInvested).toBeGreaterThan(archerSpec.cost);
  });

  it('budget constraint: cannot buy shield after placing expensive troop', () => {
    game.gold = 300;
    game.placeTroop(sniperSpec, 3, 3);
    expect(game.gold).toBe(50);
    expect(game.buyTroopShield(0)).toBe(false);
  });

  it('earning enough gold to afford upgrades over time', () => {
    game.placeTroop(archerSpec, 3, 3);
    for (let i = 0; i < 5; i++) {
      game.spawnMonster(1);
      const m = game.monsters[game.monsters.length - 1];
      game.damageMonster(m, m.hp + 10);
    }
    const gold = game.gold;
    expect(gold).toBeGreaterThan(archerSpec.cost);
    game.upgradeTroopStat(0, 'dmg');
    expect(game.troops[0].dmgLevel).toBe(2);
  });
});
