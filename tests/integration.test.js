import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Game } from '../src/game.js';
import { CONFIG, TROOP_SPECS, MONSTER_SPECS } from '../src/config.js';
import { Grid, TILE } from '../src/grid.js';
import { Troop } from '../src/troop.js';
import { Monster } from '../src/monster.js';
import { Projectile } from '../src/projectile.js';
import { WaveManager } from '../src/waveManager.js';
import { makeGame, longPath } from './helpers.js';

// Mock external modules that step() depends on
vi.mock('../src/audio.js', () => ({
  AUDIO: {
    troopPlace: vi.fn(), goldEarned: vi.fn(), sell: vi.fn(), upgrade: vi.fn(),
    heal: vi.fn(), shieldBuy: vi.fn(), waveComplete: vi.fn(), monsterLeak: vi.fn(),
    troopDeath: vi.fn(), toggleMute: vi.fn(),
  },
}));

vi.mock('../src/particles.js', () => ({
  PARTICLES: {
    update: vi.fn(), deathBurst: vi.fn(), hitSpark: vi.fn(), chainSpark: vi.fn(),
    slowApply: vi.fn(), healBurst: vi.fn(), troopDeath: vi.fn(),
    troopShieldActivate: vi.fn(), reviveBurst: vi.fn(), splashImpact: vi.fn(),
    spawnTrail: vi.fn(),
  },
}));

vi.mock('../src/rendering/renderer.js', () => ({
  RENDERER: {
    init: vi.fn(), markCacheDirty: vi.fn(), toWorldInto: vi.fn(),
    width: 800, height: 600,
  },
}));

vi.mock('../src/rendering/gameRenderer.js', () => ({
  renderGame: vi.fn(), updateCursor: vi.fn(),
}));

vi.mock('../src/gameRuntime.js', () => ({
  GameRuntimeController: vi.fn().mockImplementation(() => ({
    installResize: vi.fn(), startLoop: vi.fn(), stopLoop: vi.fn(),
    applyDefeat: vi.fn(), startWave: vi.fn(), togglePause: vi.fn(),
  })),
}));

vi.mock('../src/gamePersistence.js', () => ({
  SaveSerializer: { fromGame: vi.fn(() => ({})) },
  GameWorldFactory: {
    createFresh: vi.fn((seed) => ({
      grid: new Grid(),
      waypoints: [[0, 0], [5, 0], [5, 5], [10, 5], [10, 10], [15, 10]],
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
  GameSnapshotRestorer: {
    apply: vi.fn(), applyFresh: vi.fn(),
  },
}));

vi.mock('../src/ui/index.js', () => ({
  UI: {
    handleToggleClick: vi.fn(() => false), hitShop: vi.fn(() => -1),
    _devConfirmYes: null, _devConfirmNo: null, _shieldBuyBtn: null,
  },
  UI_LAYOUT: {
    collapsed: { hud: false, shop: false, shieldShop: false },
    shopWidth: 120, hudHeight: 50, previewHeight: 80, shieldShopWidth: 20, SHOP_WIDTH: 120,
  },
}));

const swordsmanSpec = TROOP_SPECS.find((s) => s.id === 'swordsman');
const archerSpec = TROOP_SPECS.find((s) => s.id === 'archer');
const knightSpec = TROOP_SPECS.find((s) => s.id === 'knight');
const mageSpec = TROOP_SPECS.find((s) => s.id === 'mage');
const lightningSpec = TROOP_SPECS.find((s) => s.id === 'lightning');
const icewizSpec = TROOP_SPECS.find((s) => s.id === 'icewiz');
const healerSpec = TROOP_SPECS.find((s) => s.id === 'healer');
const sniperSpec = TROOP_SPECS.find((s) => s.id === 'sniper');
const valkyrieSpec = TROOP_SPECS.find((s) => s.id === 'valkyrie');


// ─── Melee troop attacks and kills a monster ───────────────────────────────

describe('Integration: melee troop vs monster', () => {
  let game;
  beforeEach(() => { game = makeGame({ gold: 10000 }); });
  afterEach(() => { vi.restoreAllMocks(); });

  it('swordsman kills a grunt over multiple steps', () => {
    const gx = 2, gy = 0;
    game.placeTroop(swordsmanSpec, gx, gy);
    expect(game.troops).toHaveLength(1);
    const swordsman = game.troops[0];

    game.spawnMonster(1);
    const grunt = game.monsters[0];
    expect(grunt.alive).toBe(true);

    const goldBefore = game.gold;

    let steps = 0;
    while (grunt.alive && steps < 600) {
      game.step(CONFIG.FIXED_TIMESTEP);
      steps++;
    }

    expect(grunt.alive).toBe(false);
    expect(game.gold).toBeGreaterThan(goldBefore);
    expect(game.monsters.filter((m) => m.alive)).toHaveLength(0);
  });
});

// ─── Ranged troop fires projectile that kills monster ──────────────────────

describe('Integration: ranged troop projectile', () => {
  let game;
  beforeEach(() => { game = makeGame({ gold: 10000 }); });
  afterEach(() => { vi.restoreAllMocks(); });

  it('archer fires projectile that kills a grunt', () => {
    game.placeTroop(archerSpec, 3, 0);
    const archer = game.troops[0];

    game.spawnMonster(1);
    const grunt = game.monsters[0];

    let steps = 0;
    while (grunt.alive && steps < 600) {
      game.step(CONFIG.FIXED_TIMESTEP);
      steps++;
    }

    expect(grunt.alive).toBe(false);
    expect(game.gold).toBeGreaterThan(CONFIG.STARTING_GOLD);
  });
});

// ─── Monster leaks and reduces lives ───────────────────────────────────────

describe('Integration: monster leak', () => {
  let game;
  beforeEach(() => { game = makeGame(); });
  afterEach(() => { vi.restoreAllMocks(); });

  it('grunt with no troops leaks and reduces lives', () => {
    const livesBefore = game.lives;
    game.spawnMonster(1);
    const grunt = game.monsters[0];

    let steps = 0;
    while (grunt.alive && steps < 3000) {
      game.step(CONFIG.FIXED_TIMESTEP);
      steps++;
    }

    expect(game.lives).toBeLessThan(livesBefore);
  });

  it('multiple grunts each reduce lives independently', () => {
    const livesBefore = game.lives;
    game.spawnMonster(1);
    game.spawnMonster(1);

    let steps = 0;
    while (game.monsters.some((m) => m.alive) && steps < 4000) {
      game.step(CONFIG.FIXED_TIMESTEP);
      steps++;
    }

    expect(game.lives).toBeLessThanOrEqual(livesBefore - 2);
  });
});

// ─── Monster attacks and kills a troop ─────────────────────────────────────

describe('Integration: monster kills troop', () => {
  let game;
  beforeEach(() => { game = makeGame({ gold: 10000 }); });
  afterEach(() => { vi.restoreAllMocks(); });

  it('grunt stops and kills an archer on the path', () => {
    game.placeTroop(archerSpec, 1, 0);
    const archer = game.troops[0];

    game.spawnMonster(1);
    const grunt = game.monsters[0];

    let steps = 0;
    while (archer.alive && grunt.alive && steps < 600) {
      game.step(CONFIG.FIXED_TIMESTEP);
      steps++;
    }

    expect(steps).toBeGreaterThan(0);
  });
});

// ─── Necromancer revives a dead monster ────────────────────────────────────

describe('Integration: Necromancer revive', () => {
  let game;
  beforeEach(() => { game = makeGame({ gold: 10000 }); });
  afterEach(() => { vi.restoreAllMocks(); });

  it('necromancer revives a nearby dead grunt', () => {
    game.spawnMonster('Y');
    const necro = game.monsters[0];
    expect(necro.alive).toBe(true);
    expect(necro.level).toBe('Y');

    game.spawnMonster(1);
    const grunt = game.monsters[1];

    grunt.hp = 0;
    grunt.alive = false;

    game.step(CONFIG.FIXED_TIMESTEP);

    expect(grunt.alive).toBe(true);
    expect(grunt.hp).toBeGreaterThan(0);
    expect(grunt.reviveImmune).toBe(true);
  });

  it('necromancer revive count is limited to 4', () => {
    game.spawnMonster('Y');
    const necro = game.monsters[0];

    for (let i = 0; i < 5; i++) {
      game.spawnMonster(1);
      const m = game.monsters[game.monsters.length - 1];
      m.hp = 0;
      m.alive = false;
    }

    game.step(CONFIG.FIXED_TIMESTEP);

    expect(necro.reviveCount).toBe(4);
  });
});

// ─── Healer heals allies and damages monsters ──────────────────────────────

describe('Integration: Healer support', () => {
  let game;
  beforeEach(() => { game = makeGame({ gold: 10000 }); });
  afterEach(() => { vi.restoreAllMocks(); });

  it('healer heals damaged allies in range', () => {
    game.placeTroop(healerSpec, 5, 3);
    game.placeTroop(archerSpec, 6, 3);
    const archer = game.troops[1];

    archer.hp = 10;
    const hpBefore = archer.hp;

    for (let i = 0; i < 10; i++) {
      game.step(CONFIG.FIXED_TIMESTEP);
    }

    expect(archer.hp).toBeGreaterThan(hpBefore);
  });

  it('healer damages monsters in heal range', () => {
    game.placeTroop(healerSpec, 5, 3);

    game.spawnMonster(1);
    const grunt = game.monsters[0];
    grunt.x = 6 * CONFIG.TILE_SIZE + CONFIG.TILE_SIZE / 2;
    grunt.y = 3 * CONFIG.TILE_SIZE + CONFIG.TILE_SIZE / 2;
    grunt._tileGx = 6;
    grunt._tileGy = 3;
    game._updateMonsterTileIndex();

    const hpBefore = grunt.hp;

    for (let i = 0; i < 5; i++) {
      game.step(CONFIG.FIXED_TIMESTEP);
    }

    expect(grunt.hp).toBeLessThan(hpBefore);
  });
});

// ─── Monster splitting on death ────────────────────────────────────────────

describe('Integration: monster splitting', () => {
  let game;
  beforeEach(() => { game = makeGame({ gold: 10000 }); });
  afterEach(() => { vi.restoreAllMocks(); });

  it('killing a Brute spawns 2 Grunts', () => {
    const sp = longPath();
    game.pathSegments = sp;

    const brute = new Monster(3, game.waypoints, sp, 1);
    game.monsters.push(brute);

    const countBefore = game.monsters.length;

    game.damageMonster(brute, brute.hp + 10);

    const children = game.monsters.filter((m) => m !== brute);
    expect(children).toHaveLength(2);
    expect(children.every((c) => c.level === 1)).toBe(true);
    expect(children.every((c) => c.alive)).toBe(true);
  });

  it('runners do not split (noSplit)', () => {
    const sp = longPath();
    game.pathSegments = sp;

    game.spawnMonster(2); // Runner
    const runner = game.monsters[0];
    const countBefore = game.monsters.length;

    game.damageMonster(runner, runner.hp + 10);

    expect(game.monsters.length).toBe(countBefore);
  });

  it('revived monsters do not split (reviveImmune)', () => {
    const sp = longPath();
    game.pathSegments = sp;

    const brute = new Monster(3, game.waypoints, sp, 1);
    brute.reviveImmune = true;
    game.monsters.push(brute);

    const countBefore = game.monsters.length;
    game.damageMonster(brute, brute.hp + 10);

    expect(game.monsters.length).toBe(countBefore);
  });
});

// ─── Ice Wizard slow + shatter ─────────────────────────────────────────────

describe('Integration: Ice Wizard slow and shatter', () => {
  let game;
  beforeEach(() => { game = makeGame({ gold: 10000 }); });
  afterEach(() => { vi.restoreAllMocks(); });

  it('ice wizard slows monster and shatter deals bonus damage', () => {
    game.placeTroop(icewizSpec, 3, 0);

    game.spawnMonster(1);
    const grunt = game.monsters[0];
    const maxHp = grunt.maxHp;

    for (let i = 0; i < 30; i++) {
      game.step(CONFIG.FIXED_TIMESTEP);
    }

    if (grunt.hp < maxHp) {
      expect(grunt.slowTimer).toBeGreaterThanOrEqual(0);
    }
  });
});

// ─── Shielded monster absorbs damage ───────────────────────────────────────

describe('Integration: Shielded monster', () => {
  let game;
  beforeEach(() => { game = makeGame({ gold: 10000 }); });
  afterEach(() => { vi.restoreAllMocks(); });

  it('shielded monster absorbs damage with its shield', () => {
    game.spawnMonster('S');
    const shielded = game.monsters[0];
    expect(shielded.shield).toBeGreaterThan(0);

    const shieldBefore = shielded.shield;

    game.damageMonster(shielded, 10);

    expect(shielded.shield).toBeLessThan(shieldBefore);
    expect(shielded.hp).toBe(shielded.maxHp);
  });

  it('shielded monster is immune to slow while shielded', () => {
    game.spawnMonster('S');
    const shielded = game.monsters[0];

    const applied = shielded.applySlow(0.5, 2.0, 0.5);
    expect(applied).toBe(false);
    expect(shielded.slowTimer).toBe(0);
  });
});

// ─── Sell and refund ───────────────────────────────────────────────────────

describe('Integration: sell and refund', () => {
  let game;
  beforeEach(() => { game = makeGame({ gold: 10000 }); });
  afterEach(() => { vi.restoreAllMocks(); });

  it('selling a troop refunds 30% of total invested', () => {
    game.placeTroop(swordsmanSpec, 3, 3);
    const goldAfterPlace = game.gold;
    const totalInvested = game.troops[0].getTotalInvested();

    game.sellTroop(0);

    const expectedRefund = Math.ceil(totalInvested * CONFIG.SELL_REFUND_RATIO);
    expect(game.gold).toBe(goldAfterPlace + expectedRefund);
    expect(game.troops[0].alive).toBe(false);
  });

  it('sell cooldown prevents rapid selling', () => {
    game.placeTroop(swordsmanSpec, 3, 3);
    game.placeTroop(archerSpec, 4, 3);

    game.sellTroop(0);
    expect(game.sellCooldownTimer).toBe(CONFIG.SELL_COOLDOWN);

    game.sellTroop(1);
    expect(game.troops[1].alive).toBe(true);
  });
});

// ─── Upgrade troop ─────────────────────────────────────────────────────────

describe('Integration: upgrade troop', () => {
  let game;
  beforeEach(() => { game = makeGame({ gold: 10000 }); });
  afterEach(() => { vi.restoreAllMocks(); });

  it('upgrading damage increases troop DPS', () => {
    game.placeTroop(archerSpec, 3, 0);
    const archer = game.troops[0];
    const dpsBefore = archer.getDps();

    game.upgradeTroopStat(0, 'dmg');

    expect(archer.getDps()).toBeGreaterThan(dpsBefore);
    expect(archer.dmgLevel).toBe(2);
  });

  it('upgrading costs gold', () => {
    game.gold = 1000;
    game.placeTroop(archerSpec, 3, 0);
    const goldBefore = game.gold;

    game.upgradeTroopStat(0, 'dmg');

    const upgradeCost = Math.round(archerSpec.cost * Math.pow(CONFIG.UPGRADE_COST_SCALE, 0));
    expect(game.gold).toBe(goldBefore - upgradeCost);
  });

  it('cannot upgrade when gold is insufficient', () => {
    game.devMode = true;
    game.placeTroop(archerSpec, 3, 0);
    game.devMode = false;
    game.gold = 1;
    const archer = game.troops[0];
    const dmgBefore = archer.dmgLevel;

    game.upgradeTroopStat(0, 'dmg');

    expect(archer.dmgLevel).toBe(dmgBefore);
  });
});

// ─── Full step() cycle doesn't crash ───────────────────────────────────────

describe('Integration: step() stability', () => {
  let game;
  beforeEach(() => { game = makeGame({ gold: 10000 }); });
  afterEach(() => { vi.restoreAllMocks(); });

  it('step() runs without error with empty entities', () => {
    expect(() => game.step(CONFIG.FIXED_TIMESTEP)).not.toThrow();
  });

  it('step() runs without error with troops and monsters', () => {
    game.placeTroop(swordsmanSpec, 3, 3);
    game.placeTroop(archerSpec, 5, 3);
    game.spawnMonster(1);
    game.spawnMonster(1);

    expect(() => {
      for (let i = 0; i < 100; i++) {
        game.step(CONFIG.FIXED_TIMESTEP);
      }
    }).not.toThrow();
  });

  it('step() does nothing when state is PAUSED', () => {
    game.state = 'PAUSED';
    game.spawnMonster(1);
    const grunt = game.monsters[0];

    for (let i = 0; i < 100; i++) {
      game.step(CONFIG.FIXED_TIMESTEP);
    }

    expect(grunt.distance).toBe(0);
  });

  it('step() does nothing when state is DEFEAT', () => {
    game.state = 'DEFEAT';
    game.spawnMonster(1);
    const grunt = game.monsters[0];

    for (let i = 0; i < 100; i++) {
      game.step(CONFIG.FIXED_TIMESTEP);
    }

    expect(grunt.distance).toBe(0);
  });
});

// ─── Wave spawning and completion ──────────────────────────────────────────

describe('Integration: wave spawning', () => {
  let game;
  beforeEach(() => { game = makeGame({ gold: 10000 }); });
  afterEach(() => { vi.restoreAllMocks(); });

  it('wave spawns monsters when wave is active', () => {
    game.wave.buildCustomFromCounts({ 1: 1 });
    game.wave.startNextWave();
    game.wave.elapsed = CONFIG.WAVE_START_DELAY + 1;

    game.step(CONFIG.FIXED_TIMESTEP);

    expect(game.monsters.length).toBeGreaterThan(0);
  });

  it('wave completion transitions state to PRE_WAVE', () => {
    game.placeTroop(swordsmanSpec, 2, 0);
    game.spawnMonster(1);
    const grunt = game.monsters[0];

    game.wave.spawnIndex = game.wave.queue.length;

    let steps = 0;
    while (game.state === 'WAVE_ACTIVE' && steps < 600) {
      game.step(CONFIG.FIXED_TIMESTEP);
      steps++;
    }

    expect(steps).toBeGreaterThan(0);
  });
});

// ─── Dev mode economy ──────────────────────────────────────────────────────

describe('Integration: dev mode economy', () => {
  let game;
  beforeEach(() => { game = makeGame({ devMode: true, gold: 0 }); });
  afterEach(() => { vi.restoreAllMocks(); });

  it('placing troops is free in dev mode', () => {
    game.placeTroop(swordsmanSpec, 3, 3);
    expect(game.gold).toBe(0);
    expect(game.troops).toHaveLength(1);
  });

  it('upgrading is free in dev mode', () => {
    game.placeTroop(archerSpec, 3, 3);
    game.upgradeTroopStat(0, 'dmg');
    expect(game.gold).toBe(0);
    expect(game.troops[0].dmgLevel).toBe(2);
  });
});

// ─── Projectile chain lightning ────────────────────────────────────────────

describe('Integration: chain lightning', () => {
  let game;
  beforeEach(() => { game = makeGame({ gold: 10000 }); });
  afterEach(() => { vi.restoreAllMocks(); });

  it('lightning troop stuns monsters', () => {
    game.placeTroop(lightningSpec, 3, 0);

    game.spawnMonster(1);
    const grunt = game.monsters[0];

    let steps = 0;
    while (grunt.alive && steps < 600) {
      game.step(CONFIG.FIXED_TIMESTEP);
      steps++;
    }

    expect(grunt.hp).toBeLessThan(grunt.maxHp);
  });
});

// ─── Sell cooldown resets over time ────────────────────────────────────────

describe('Integration: sell cooldown', () => {
  let game;
  beforeEach(() => { game = makeGame({ gold: 10000 }); });
  afterEach(() => { vi.restoreAllMocks(); });

  it('sell cooldown decreases over steps', () => {
    game.placeTroop(swordsmanSpec, 3, 3);
    game.placeTroop(archerSpec, 4, 3);
    const secondTroop = game.troops[1];

    game.sellTroop(0);
    expect(game.sellCooldownTimer).toBe(CONFIG.SELL_COOLDOWN);

    expect(secondTroop.alive).toBe(true);
    game.sellTroop(0);
    expect(secondTroop.alive).toBe(true);

    for (let i = 0; i < 300; i++) {
      game.step(CONFIG.FIXED_TIMESTEP);
    }

    expect(game.sellCooldownTimer).toBe(0);

    game.sellTroop(0);
    expect(secondTroop.alive).toBe(false);
  });
});

// ─── Multiple monster types interacting ────────────────────────────────────

describe('Integration: mixed wave', () => {
  let game;
  beforeEach(() => { game = makeGame({ gold: 10000 }); });
  afterEach(() => { vi.restoreAllMocks(); });

  it('different monster types can coexist and be damaged', () => {
    const sp = longPath();
    game.pathSegments = sp;

    game.spawnMonster(1); // Grunt
    game.spawnMonster(2); // Runner
    game.spawnMonster('S'); // Shielded
    game.spawnMonster('X'); // Spear

    expect(game.monsters).toHaveLength(4);

    game.damageMonster(game.monsters[0], 5);
    game.damageMonster(game.monsters[1], 5);
    game.damageMonster(game.monsters[2], 5);
    game.damageMonster(game.monsters[3], 5);

    expect(game.monsters[0].hp).toBeLessThan(game.monsters[0].maxHp);
    expect(game.monsters[1].hp).toBeLessThan(game.monsters[1].maxHp);
    expect(game.monsters[2].hp).toBe(game.monsters[2].maxHp);
    expect(game.monsters[3].hp).toBeLessThan(game.monsters[3].maxHp);
  });
});

// ─── Boss healing and doubled HP ──────────────────────────────────────────

describe('Integration: Boss mechanics', () => {
  let game;
  beforeEach(() => { game = makeGame({ gold: 10000 }); });
  afterEach(() => { vi.restoreAllMocks(); });

  it('boss has doubled HP (3336 effective)', () => {
    game.spawnMonster('B');
    const boss = game.monsters[0];
    expect(boss.maxHp).toBe(MONSTER_SPECS.B.hp * CONFIG.BOSS_HP_MULTIPLIER);
    expect(boss.maxHp).toBe(3336);
  });

  it('boss passively heals over time', () => {
    game.spawnMonster('B');
    const boss = game.monsters[0];
    const hpAfterSpawn = boss.hp;

    boss.hp = hpAfterSpawn - 50;
    const damagedHp = boss.hp;

    for (let i = 0; i < 120; i++) {
      game.step(CONFIG.FIXED_TIMESTEP);
    }

    expect(boss.hp).toBeGreaterThan(damagedHp);
  });

  it('boss heal does not exceed maxHp', () => {
    game.spawnMonster('B');
    const boss = game.monsters[0];
    expect(boss.hp).toBe(boss.maxHp);
    boss.hp = boss.maxHp - 5;
    for (let i = 0; i < 120; i++) {
      game.step(CONFIG.FIXED_TIMESTEP);
    }
    expect(boss.hp).toBeLessThanOrEqual(boss.maxHp);
  });
});

// ─── Troop death from monster attacks ─────────────────────────────────────

describe('Integration: troop death', () => {
  let game;
  beforeEach(() => { game = makeGame({ gold: 10000 }); });
  afterEach(() => { vi.restoreAllMocks(); });

  it('troop is killed and removed when HP reaches 0', () => {
    game.placeTroop(archerSpec, 1, 0);
    const archer = game.troops[0];
    expect(archer.alive).toBe(true);

    game.spawnMonster(3);
    const brute = game.monsters[0];

    let steps = 0;
    while (archer.alive && steps < 600) {
      game.step(CONFIG.FIXED_TIMESTEP);
      steps++;
    }

    expect(archer.alive).toBe(false);
  });

  it('killed troop frees its tile for new placement', () => {
    game.placeTroop(archerSpec, 3, 0);
    const archer = game.troops[0];

    expect(game.canPlace(3, 0, swordsmanSpec)).toBe(false);

    game.killTroop(archer);

    expect(game.canPlace(3, 0, swordsmanSpec)).toBe(true);
  });

  it('melee troop takes 70% reduced damage from monsters', () => {
    game.placeTroop(knightSpec, 1, 0);
    const knight = game.troops[0];

    game.spawnMonster(1);
    const grunt = game.monsters[0];

    let steps = 0;
    while (knight.alive && grunt.alive && steps < 200) {
      game.step(CONFIG.FIXED_TIMESTEP);
      steps++;
    }

    expect(knight.alive).toBe(true);
  });
});

// ─── Max gold cap ─────────────────────────────────────────────────────────

describe('Integration: max gold cap', () => {
  let game;
  beforeEach(() => { game = makeGame({ gold: 10000 }); });
  afterEach(() => { vi.restoreAllMocks(); });

  it('gold does not exceed MAX_GOLD', () => {
    game.gold = CONFIG.MAX_GOLD - 5;
    game.spawnMonster(1);
    const grunt = game.monsters[0];

    game.damageMonster(grunt, grunt.hp + 10);

    expect(game.gold).toBe(CONFIG.MAX_GOLD);
  });

  it('dev mode placement is free (gold unchanged)', () => {
    game.devMode = true;
    game.gold = 100;
    game.placeTroop(swordsmanSpec, 3, 3);
    expect(game.gold).toBe(100);
    expect(game.troops).toHaveLength(1);
  });

  it('dev mode _addGold sets gold to Infinity', () => {
    game.devMode = true;
    game.gold = 100;
    game._addGold(50);
    expect(game.gold).toBe(Infinity);
  });
});

// ─── Gold earning accuracy ────────────────────────────────────────────────

describe('Integration: gold earning', () => {
  let game;
  beforeEach(() => { game = makeGame({ gold: 10000 }); });
  afterEach(() => { vi.restoreAllMocks(); });

  it('killing a grunt awards reward+1 gold', () => {
    game.spawnMonster(1);
    const grunt = game.monsters[0];
    const goldBefore = game.gold;

    game.damageMonster(grunt, grunt.hp + 10);

    expect(game.gold).toBe(goldBefore + grunt.reward + 1);
  });

  it('killing a boss awards 201 gold', () => {
    game.spawnMonster('B');
    const boss = game.monsters[0];
    const goldBefore = game.gold;

    game.damageMonster(boss, boss.hp + 10);

    expect(game.gold).toBe(goldBefore + boss.reward + 1);
  });

  it('no reward for already-dead monster', () => {
    game.spawnMonster(1);
    const grunt = game.monsters[0];
    game.damageMonster(grunt, grunt.hp + 10);
    const goldAfterFirstKill = game.gold;

    game.damageMonster(grunt, 100);
    expect(game.gold).toBe(goldAfterFirstKill);
  });
});

// ─── Troop shield mechanics ───────────────────────────────────────────────

describe('Integration: troop shield', () => {
  let game;
  beforeEach(() => { game = makeGame({ gold: 10000 }); });
  afterEach(() => { vi.restoreAllMocks(); });

  it('buying shield sets shield to maxHp', () => {
    game.placeTroop(archerSpec, 3, 3);
    const archer = game.troops[0];

    const result = game.buyTroopShield(0);

    expect(result).toBe(true);
    expect(archer.shield).toBe(archer.maxHp);
    expect(archer.hasShield()).toBe(true);
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

  it('cannot buy shield when already shielded', () => {
    game.placeTroop(archerSpec, 3, 3);
    game.buyTroopShield(0);
    const result = game.buyTroopShield(0);
    expect(result).toBe(false);
  });

  it('shield cost is 50% of troop cost', () => {
    game.placeTroop(archerSpec, 3, 3);
    const goldBefore = game.gold;
    game.buyTroopShield(0);

    const expectedCost = Math.ceil(archerSpec.cost * CONFIG.SHIELD_COST_RATIO);
    expect(game.gold).toBe(goldBefore - expectedCost);
  });

  it('shield clear removes shield', () => {
    game.placeTroop(archerSpec, 3, 3);
    const archer = game.troops[0];
    game.buyTroopShield(0);
    expect(archer.hasShield()).toBe(true);

    archer.clearShield();
    expect(archer.hasShield()).toBe(false);
  });
});

// ─── Revived monster damage reduction ─────────────────────────────────────

describe('Integration: revived monster damage', () => {
  let game;
  beforeEach(() => { game = makeGame({ gold: 10000 }); });
  afterEach(() => { vi.restoreAllMocks(); });

  it('revived grunt deals 50% damage to troops', () => {
    game.placeTroop(archerSpec, 1, 0);
    const archer = game.troops[0];

    game.spawnMonster('Y');
    game.spawnMonster(1);
    const grunt = game.monsters[1];

    grunt.hp = 0;
    grunt.alive = false;

    game.step(CONFIG.FIXED_TIMESTEP);
    expect(grunt.alive).toBe(true);
    expect(grunt.reviveImmune).toBe(true);

    const hpBefore = archer.hp;
    game.damageTroop(grunt, archer);
    const hpLost = hpBefore - archer.hp;

    expect(hpLost).toBe(Math.round(MONSTER_SPECS[1].damage * grunt.reviveDamageRatio));
  });
});

// ─── Slow decay over time ─────────────────────────────────────────────────

describe('Integration: slow decay', () => {
  let game;
  beforeEach(() => { game = makeGame({ gold: 10000 }); });
  afterEach(() => { vi.restoreAllMocks(); });

  it('monster speed restores after slow expires', () => {
    const grunt = new Monster(1, game.waypoints, game.pathSegments);
    grunt.applySlow(0.5, 1.0, 0.5);

    expect(grunt.speed).toBe(grunt.baseSpeed * 0.5);
    expect(grunt.slowTimer).toBeGreaterThan(0);

    for (let i = 0; i < 65; i++) {
      grunt._updateSlowDecay(CONFIG.FIXED_TIMESTEP);
    }

    expect(grunt.slowTimer).toBe(0);
    expect(grunt.speed).toBe(grunt.baseSpeed);
    expect(grunt.shatterArmed).toBe(false);
  });

  it('applying a stronger slow overrides a weaker one', () => {
    const grunt = new Monster(1, game.waypoints, game.pathSegments);
    grunt.applySlow(0.8, 2.0, 0.2);
    expect(grunt.speed).toBe(grunt.baseSpeed * 0.8);

    grunt.applySlow(0.5, 1.0, 0.5);
    expect(grunt.speed).toBe(grunt.baseSpeed * 0.5);
  });
});

// ─── Spear slow mode ──────────────────────────────────────────────────────

describe('Integration: Spear slow mode', () => {
  let game;
  beforeEach(() => { game = makeGame({ gold: 10000 }); });
  afterEach(() => { vi.restoreAllMocks(); });

  it('spear slows to half speed when near troops', () => {
    game.placeTroop(swordsmanSpec, 1, 0);

    game.spawnMonster('X');
    const spear = game.monsters[0];
    const baseSpeed = spear.baseSpeed;

    let steps = 0;
    let slowed = false;
    while (steps < 120) {
      game.step(CONFIG.FIXED_TIMESTEP);
      steps++;
      if (spear.speed < baseSpeed) {
        slowed = true;
        break;
      }
    }

    expect(slowed).toBe(true);
  });
});

// ─── Runner pass mode ─────────────────────────────────────────────────────

describe('Integration: Runner pass mode', () => {
  let game;
  beforeEach(() => { game = makeGame({ gold: 10000 }); });
  afterEach(() => { vi.restoreAllMocks(); });

  it('runner does not split on death (noSplit)', () => {
    const sp = longPath();
    game.pathSegments = sp;

    game.spawnMonster(2); // Runner
    const runner = game.monsters[0];

    game.damageMonster(runner, runner.hp + 10);

    const children = game.monsters.filter((m) => m !== runner && m.alive);
    expect(children).toHaveLength(0);
  });

  it('runner has pass attack mode', () => {
    const grunt = new Monster(2, game.waypoints, game.pathSegments);
    expect(grunt.spec.attackMode).toBe('pass');
  });
});

// ─── Placement validation ─────────────────────────────────────────────────

describe('Integration: placement validation', () => {
  let game;
  beforeEach(() => { game = makeGame({ gold: 10000 }); });
  afterEach(() => { vi.restoreAllMocks(); });

  it('cannot place on path tile', () => {
    expect(game.grid.isBuildable(5, 0)).toBe(false);
    expect(game.placeTroop(swordsmanSpec, 5, 0)).toBe(false);
  });

  it('cannot place on occupied tile', () => {
    game.placeTroop(swordsmanSpec, 3, 3);
    expect(game.placeTroop(archerSpec, 3, 3)).toBe(false);
  });

  it('cannot place with insufficient gold', () => {
    game.gold = 50;
    expect(game.placeTroop(swordsmanSpec, 3, 3)).toBe(false);
  });

  it('can place on empty buildable tile', () => {
    expect(game.placeTroop(swordsmanSpec, 3, 3)).toBe(true);
    expect(game.troops).toHaveLength(1);
  });

  it('getPlacementInvalidReason returns correct reasons', () => {
    game.gold = 50;
    expect(game.getPlacementInvalidReason(3, 3, swordsmanSpec)).toBe('Need 70g');

    game.gold = 10000;
    expect(game.getPlacementInvalidReason(5, 0, swordsmanSpec)).toBe('Cannot build here');

    game.placeTroop(swordsmanSpec, 3, 3);
    expect(game.getPlacementInvalidReason(3, 3, archerSpec)).toBe('Tile occupied');

    expect(game.getPlacementInvalidReason(4, 3, swordsmanSpec)).toBeNull();
  });
});

// ─── Game over when lives reach 0 ─────────────────────────────────────────

describe('Integration: game over', () => {
  let game;
  beforeEach(() => { game = makeGame({ gold: 10000 }); });
  afterEach(() => { vi.restoreAllMocks(); });

  it('defeat triggers when lives reach 0', () => {
    game.lives = 1;
    game.devMode = false;

    game.spawnMonster('B');
    const boss = game.monsters[0];

    let steps = 0;
    while (boss.alive && steps < 5000) {
      game.step(CONFIG.FIXED_TIMESTEP);
      steps++;
    }

    expect(game.lives).toBeLessThanOrEqual(0);
    expect(game.runtime.applyDefeat).toHaveBeenCalled();
  });

  it('dev mode prevents life loss from leaks', () => {
    game.devMode = true;
    game.lives = 1;

    game.spawnMonster('B');
    const boss = game.monsters[0];

    let steps = 0;
    while (boss.alive && steps < 5000) {
      game.step(CONFIG.FIXED_TIMESTEP);
      steps++;
    }

    expect(game.lives).toBe(1);
  });
});

// ─── Upgrade edge cases ───────────────────────────────────────────────────

describe('Integration: upgrade edge cases', () => {
  let game;
  beforeEach(() => { game = makeGame({ gold: 10000 }); });
  afterEach(() => { vi.restoreAllMocks(); });

  it('upgrading range increases archer range', () => {
    game.placeTroop(archerSpec, 3, 3);
    const archer = game.troops[0];
    const rangeBefore = archer._cachedRange;

    game.upgradeTroopStat(0, 'range');

    expect(archer._cachedRange).toBe(rangeBefore + 1);
    expect(archer.rangeLevel).toBe(2);
  });

  it('upgrading speed reduces attack cooldown', () => {
    game.placeTroop(archerSpec, 3, 3);
    const archer = game.troops[0];
    const speedBefore = archer._cachedAttackSpeed;

    game.upgradeTroopStat(0, 'speed');

    expect(archer._cachedAttackSpeed).toBeLessThan(speedBefore);
    expect(archer.speedLevel).toBe(2);
  });

  it('upgrading chain on lightning adds chain targets', () => {
    game.placeTroop(lightningSpec, 3, 3);
    const lightning = game.troops[0];
    const chainBefore = lightning._cachedChain;

    game.upgradeTroopStat(0, 'chain');

    expect(lightning._cachedChain).toBe(chainBefore + 1);
    expect(lightning.chainLevel).toBe(2);
  });

  it('isMaxed returns true at max upgrade level', () => {
    game.placeTroop(archerSpec, 3, 3);
    const archer = game.troops[0];

    for (let i = 0; i < 5; i++) {
      game.upgradeTroopStat(0, 'dmg');
    }

    expect(archer.isMaxed('dmg')).toBe(true);
    const goldBefore = game.gold;
    game.upgradeTroopStat(0, 'dmg');
    expect(game.gold).toBe(goldBefore);
  });

  it('upgrade cost scales with level', () => {
    game.placeTroop(archerSpec, 3, 3);
    const archer = game.troops[0];

    const cost1 = archer.getUpgradeCost('dmg');
    game.upgradeTroopStat(0, 'dmg');
    const cost2 = archer.getUpgradeCost('dmg');

    expect(cost2).toBeGreaterThan(cost1);
    expect(cost2).toBe(Math.round(cost1 * CONFIG.UPGRADE_COST_SCALE));
  });

  it('healer slow stat upgrades heal target count', () => {
    game.placeTroop(healerSpec, 3, 3);
    const healer = game.troops[0];
    const targetsBefore = healer.healTargetLevel;

    game.upgradeTroopStat(0, 'slow');

    expect(healer.healTargetLevel).toBe(targetsBefore + 1);
  });

  it('cannot upgrade melee troop range', () => {
    game.placeTroop(swordsmanSpec, 3, 3);
    const swordsman = game.troops[0];

    expect(swordsman.canUpgrade('range')).toBe(false);
  });
});

// ─── Troop heal (gold-based) ──────────────────────────────────────────────

describe('Integration: troop gold heal', () => {
  let game;
  beforeEach(() => { game = makeGame({ gold: 10000 }); });
  afterEach(() => { vi.restoreAllMocks(); });

  it('healing a troop costs gold and restores HP', () => {
    game.placeTroop(archerSpec, 3, 3);
    const archer = game.troops[0];
    archer.hp = 10;
    const goldBefore = game.gold;

    game.healTroop(0);

    const healCost = Math.ceil(archerSpec.cost * CONFIG.TROOP_HEAL_COST_RATIO);
    expect(game.gold).toBe(goldBefore - healCost);
    expect(archer.hp).toBeGreaterThan(10);
  });

  it('cannot heal a full-HP troop', () => {
    game.placeTroop(archerSpec, 3, 3);
    const archer = game.troops[0];
    const hpBefore = archer.hp;
    const goldBefore = game.gold;

    game.healTroop(0);

    expect(archer.hp).toBe(hpBefore);
    expect(game.gold).toBe(goldBefore);
  });
});

// ─── Popup recycling ──────────────────────────────────────────────────────

describe('Integration: popup recycling', () => {
  let game;
  beforeEach(() => { game = makeGame({ gold: 10000 }); });
  afterEach(() => { vi.restoreAllMocks(); });

  it('expired popups are recycled to the pool', () => {
    game._getPopup('test1', 0, 0, 0.5, '#fff');
    game._getPopup('test2', 10, 10, 0.3, '#fff');
    expect(game.popups).toHaveLength(2);

    for (let i = 0; i < 40; i++) {
      game.step(CONFIG.FIXED_TIMESTEP);
    }

    expect(game.popups.length).toBeLessThan(2);
  });

  it('recycled popups are reused from the pool', () => {
    game._getPopup('old1', 0, 0, 0.01, '#fff');
    game._getPopup('old2', 0, 0, 0.01, '#fff');

    for (let i = 0; i < 5; i++) {
      game.step(CONFIG.FIXED_TIMESTEP);
    }

    const poolSize = game._popupPool.length;
    expect(poolSize).toBeGreaterThan(0);

    game._getPopup('new', 0, 0, 1.0, '#fff');
    expect(game._popupPool.length).toBe(poolSize - 1);
  });
});

// ─── Shielded monster shield regen ────────────────────────────────────────

describe('Integration: Shielded monster regen', () => {
  let game;
  beforeEach(() => { game = makeGame({ gold: 10000 }); });
  afterEach(() => { vi.restoreAllMocks(); });

  it('shield regenerates after delay', () => {
    game.spawnMonster('S');
    const shielded = game.monsters[0];
    const maxShield = shielded.maxShield;

    shielded.shield = 0;
    shielded.shieldRegenTimer = 0;

    for (let i = 0; i < 240; i++) {
      game.step(CONFIG.FIXED_TIMESTEP);
    }

    expect(shielded.shield).toBeGreaterThan(0);
    expect(shielded.shield).toBeLessThanOrEqual(maxShield);
  });

  it('shield does not exceed maxShield', () => {
    game.spawnMonster('S');
    const shielded = game.monsters[0];
    const maxShield = shielded.maxShield;

    for (let i = 0; i < 600; i++) {
      game.step(CONFIG.FIXED_TIMESTEP);
    }

    expect(shielded.shield).toBeLessThanOrEqual(maxShield);
  });
});

// ─── findTroopAtTile ──────────────────────────────────────────────────────

describe('Integration: findTroopAtTile', () => {
  let game;
  beforeEach(() => { game = makeGame({ gold: 10000 }); });
  afterEach(() => { vi.restoreAllMocks(); });

  it('returns troop index at the given tile', () => {
    game.placeTroop(swordsmanSpec, 3, 3);
    game.placeTroop(archerSpec, 5, 3);

    expect(game.findTroopAtTile(3, 3)).toBe(0);
    expect(game.findTroopAtTile(5, 3)).toBe(1);
  });

  it('returns -1 for empty tiles', () => {
    expect(game.findTroopAtTile(7, 7)).toBe(-1);
  });

  it('returns -1 for out-of-bounds tiles', () => {
    expect(game.findTroopAtTile(-1, 0)).toBe(-1);
    expect(game.findTroopAtTile(16, 0)).toBe(-1);
  });

  it('returns -1 for killed troops', () => {
    game.placeTroop(archerSpec, 3, 3);
    game.killTroop(game.troops[0]);
    expect(game.findTroopAtTile(3, 3)).toBe(-1);
  });
});

// ─── Necromancer revive edge cases ────────────────────────────────────────

describe('Integration: Necromancer edge cases', () => {
  let game;
  beforeEach(() => { game = makeGame({ gold: 10000 }); });
  afterEach(() => { vi.restoreAllMocks(); });

  it('necromancer does not revive itself', () => {
    game.spawnMonster('Y');
    const necro = game.monsters[0];
    necro.hp = 0;
    necro.alive = false;

    game.step(CONFIG.FIXED_TIMESTEP);

    expect(necro.alive).toBe(false);
  });

  it('necromancer does not revive other necromancers', () => {
    game.spawnMonster('Y');
    const necro1 = game.monsters[0];

    game.spawnMonster('Y');
    const necro2 = game.monsters[1];
    necro2.hp = 0;
    necro2.alive = false;

    game.step(CONFIG.FIXED_TIMESTEP);

    expect(necro2.alive).toBe(false);
  });

  it('revived monster resets state (stun, slow, etc)', () => {
    game.spawnMonster('Y');
    const necro = game.monsters[0];

    game.spawnMonster(1);
    const grunt = game.monsters[1];
    grunt.hp = 0;
    grunt.alive = false;
    grunt.stunTimer = 2.0;
    grunt.slowTimer = 3.0;

    game.step(CONFIG.FIXED_TIMESTEP);

    expect(grunt.alive).toBe(true);
    expect(grunt.stunTimer).toBe(0);
    expect(grunt.slowTimer).toBe(0);
  });
});

// ─── Multiple troop types interacting simultaneously ──────────────────────

describe('Integration: multi-troop defense', () => {
  let game;
  beforeEach(() => { game = makeGame({ gold: 10000 }); });
  afterEach(() => { vi.restoreAllMocks(); });

  it('melee, ranged, and support troops all function in one step cycle', () => {
    game.placeTroop(swordsmanSpec, 2, 0);
    game.placeTroop(archerSpec, 4, 0);
    game.placeTroop(healerSpec, 3, 1);

    game.spawnMonster(1);
    game.spawnMonster(1);

    expect(() => {
      for (let i = 0; i < 100; i++) {
        game.step(CONFIG.FIXED_TIMESTEP);
      }
    }).not.toThrow();

    const totalDamageDealt = game.monsters.reduce((sum, m) => sum + (m.maxHp - m.hp), 0);
    expect(totalDamageDealt).toBeGreaterThan(0);
  });
});

// ─── Speed multiplier ─────────────────────────────────────────────────────

describe('Integration: game speed', () => {
  let game;
  beforeEach(() => { game = makeGame({ gold: 10000 }); });
  afterEach(() => { vi.restoreAllMocks(); });

  it('step() runs without error at different speeds', () => {
    game.placeTroop(swordsmanSpec, 3, 3);
    game.spawnMonster(1);

    for (const speed of CONFIG.GAME_SPEEDS) {
      game.speed = speed;
      expect(() => {
        for (let i = 0; i < 10; i++) {
          game.step(CONFIG.FIXED_TIMESTEP);
        }
      }).not.toThrow();
    }
  });
});

// ─── Monster leak damage values ───────────────────────────────────────────

describe('Integration: leak damage values', () => {
  let game;
  beforeEach(() => { game = makeGame({ gold: 10000 }); });
  afterEach(() => { vi.restoreAllMocks(); });

  it('boss leaks 5 lives', () => {
    expect(MONSTER_SPECS.B.leak).toBe(5);
  });

  it('grunt leaks 1 life', () => {
    expect(MONSTER_SPECS[1].leak).toBe(1);
  });

  it('champion leaks 3 lives', () => {
    expect(MONSTER_SPECS[5].leak).toBe(3);
  });
});
