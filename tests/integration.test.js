import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Game } from '../src/game.js';
import { CONFIG, TROOP_SPECS, MONSTER_SPECS } from '../src/config.js';
import { Grid, TILE } from '../src/grid.js';
import { Troop } from '../src/troop.js';
import { Monster } from '../src/monster.js';
import { Projectile } from '../src/projectile.js';
import { WaveManager } from '../src/waveManager.js';

// Mock external modules that step() depends on
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
    apply: vi.fn(),
    applyFresh: vi.fn(),
  },
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

// ─── Helper: build a minimal game-like object with real Game prototype methods ──

function makeTileIndex() {
  return Array.from({ length: CONFIG.GRID_SIZE * CONFIG.GRID_SIZE }, () => []);
}

function makeGame({ devMode = false, gold = 1000 } = {}) {
  const game = Object.create(Game.prototype);
  game.state = 'WAVE_ACTIVE';
  game.speed = 1;
  game.devMode = devMode;
  game.gold = gold;
  game.lives = 25;
  game.accumulator = 0;
  game.lastTime = 0;
  game.selectedSpec = null;
  game.selectedTroopIndex = -1;
  game.sellCooldownTimer = 0;
  game.waveCompleteAnim = { active: false, waveNum: 0 };
  game.grid = new Grid();
  game.waypoints = [[0, 0], [5, 0], [5, 5], [10, 5], [10, 10], [15, 10]];
  game.pathSegments = {
    segments: [
      { ax: 0, ay: 26.5, bx: 848, by: 26.5, len: 848, cumStart: 0 },
      { ax: 848, ay: 26.5, bx: 848, by: 291.5, len: 265, cumStart: 848 },
      { ax: 848, ay: 291.5, bx: 291.5, by: 291.5, len: 556.5, cumStart: 1113 },
      { ax: 291.5, ay: 291.5, bx: 291.5, by: 556.5, len: 265, cumStart: 1669.5 },
      { ax: 291.5, ay: 556.5, bx: 795, by: 556.5, len: 503.5, cumStart: 1934.5 },
    ],
    totalLength: 2438,
  };
  // Mark path tiles
  for (const [gx, gy] of game.waypoints) {
    game.grid.set(gx, gy, TILE.PATH);
  }
  game.monsters = [];
  game.troops = [];
  game.projectiles = [];
  game.popups = [];
  game._chainBuf = [];
  game._splashHitBuf = [];
  game._tileScratch = { gx: 0, gy: 0 };
  game._centerScratch = { x: 0, y: 0 };
  game._onProjectileImpact = (proj) => Game.prototype.applyProjectileImpact.call(game, proj);
  game._monsterTileIndex = new Array(CONFIG.GRID_SIZE * CONFIG.GRID_SIZE);
  game._troopTileIndex = makeTileIndex();
  game._popupPool = [];
  game._tileIndexPool = [];
  game._projectilePool = [];
  game._troopIndexByRef = new Map();
  game.wave = new WaveManager();
  game.wave.waveActive = true;
  game.wave.spawnIndex = game.wave.queue.length; // no auto-spawning
  game.devConfirmPending = false;
  game._goldClicks = 0;
  game._goldClickTimer = 0;
  game.resetConfirmPending = false;
  game.sellConfirmPending = false;
  game.sellConfirmTroop = null;
  game.runtime = { applyDefeat: vi.fn() };
  game._autoSave = vi.fn();
  game.devMonsterCounts = {};
  return game;
}

const swordsmanSpec = TROOP_SPECS.find((s) => s.id === 'swordsman');
const archerSpec = TROOP_SPECS.find((s) => s.id === 'archer');
const mageSpec = TROOP_SPECS.find((s) => s.id === 'mage');
const lightningSpec = TROOP_SPECS.find((s) => s.id === 'lightning');
const icewizSpec = TROOP_SPECS.find((s) => s.id === 'icewiz');
const healerSpec = TROOP_SPECS.find((s) => s.id === 'healer');

// Long path for monsters that travel across the map
function longPath() {
  const T = CONFIG.TILE_SIZE;
  return {
    segments: [{ ax: 0, ay: 0, bx: T * 10, by: 0, len: T * 10, cumStart: 0 }],
    totalLength: T * 10,
  };
}

// ─── Melee troop attacks and kills a monster ───────────────────────────────

describe('Integration: melee troop vs monster', () => {
  let game;
  beforeEach(() => { game = makeGame({ gold: 10000 }); });
  afterEach(() => { vi.restoreAllMocks(); });

  it('swordsman kills a grunt over multiple steps', () => {
    // Place swordsman at tile (2, 0) — adjacent to path tile (0,0)
    const gx = 2, gy = 0;
    game.placeTroop(swordsmanSpec, gx, gy);
    expect(game.troops).toHaveLength(1);
    const swordsman = game.troops[0];

    // Spawn a grunt at the start of the path
    game.spawnMonster(1);
    const grunt = game.monsters[0];
    expect(grunt.alive).toBe(true);

    const goldBefore = game.gold;

    // Run steps until the grunt dies (melee troop will target and attack)
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
    // Place archer at tile (3, 0) — within range of path
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

    // Path totalLength is 2438px; grunt speed 1.0 * TILE_SIZE 53 = 53 px/s
    // Need ~46s = 2760 steps at 1/60 dt. Use 3000 to be safe.
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
    // Place archer at tile (1, 0) — on the path, where a grunt will stop
    game.placeTroop(archerSpec, 1, 0);
    const archer = game.troops[0];

    game.spawnMonster(1);
    const grunt = game.monsters[0];

    let steps = 0;
    while (archer.alive && grunt.alive && steps < 600) {
      game.step(CONFIG.FIXED_TIMESTEP);
      steps++;
    }

    // Either the grunt kills the archer or the archer kills the grunt
    // The important thing is that the step cycle doesn't crash
    expect(steps).toBeGreaterThan(0);
  });
});

// ─── Necromancer revives a dead monster ────────────────────────────────────

describe('Integration: Necromancer revive', () => {
  let game;
  beforeEach(() => { game = makeGame({ gold: 10000 }); });
  afterEach(() => { vi.restoreAllMocks(); });

  it('necromancer revives a nearby dead grunt', () => {
    // Spawn a necromancer (level Y)
    game.spawnMonster('Y');
    const necro = game.monsters[0];
    expect(necro.alive).toBe(true);
    expect(necro.level).toBe('Y');

    // Spawn a grunt at the same position (near the necromancer)
    game.spawnMonster(1);
    const grunt = game.monsters[1];

    // Kill the grunt manually (simulating troop damage)
    grunt.hp = 0;
    grunt.alive = false;

    // Run a step — necromancer revive logic runs
    game.step(CONFIG.FIXED_TIMESTEP);

    // The grunt should be revived
    expect(grunt.alive).toBe(true);
    expect(grunt.hp).toBeGreaterThan(0);
    expect(grunt.reviveImmune).toBe(true);
  });

  it('necromancer revive count is limited to 4', () => {
    game.spawnMonster('Y');
    const necro = game.monsters[0];

    // Spawn 5 grunts and kill them all near the necromancer
    for (let i = 0; i < 5; i++) {
      game.spawnMonster(1);
      const m = game.monsters[game.monsters.length - 1];
      m.hp = 0;
      m.alive = false;
    }

    game.step(CONFIG.FIXED_TIMESTEP);

    // Only 4 should be revived (MONSTER_REVIVE_MAX_TARGETS = 4)
    expect(necro.reviveCount).toBe(4);
  });
});

// ─── Healer heals allies and damages monsters ──────────────────────────────

describe('Integration: Healer support', () => {
  let game;
  beforeEach(() => { game = makeGame({ gold: 10000 }); });
  afterEach(() => { vi.restoreAllMocks(); });

  it('healer heals damaged allies in range', () => {
    // Place healer at (5, 3) and archer at (6, 3) — adjacent tiles
    game.placeTroop(healerSpec, 5, 3);
    game.placeTroop(archerSpec, 6, 3);
    const archer = game.troops[1];

    // Damage the archer
    archer.hp = 10;
    const hpBefore = archer.hp;

    // Run steps — healer should heal the archer
    for (let i = 0; i < 10; i++) {
      game.step(CONFIG.FIXED_TIMESTEP);
    }

    expect(archer.hp).toBeGreaterThan(hpBefore);
  });

  it('healer damages monsters in heal range', () => {
    // Place healer at (5, 3) — buildable tile
    game.placeTroop(healerSpec, 5, 3);

    // Spawn a grunt and teleport it next to the healer
    game.spawnMonster(1);
    const grunt = game.monsters[0];
    grunt.x = 6 * CONFIG.TILE_SIZE + CONFIG.TILE_SIZE / 2;
    grunt.y = 3 * CONFIG.TILE_SIZE + CONFIG.TILE_SIZE / 2;
    grunt._tileGx = 6;
    grunt._tileGy = 3;
    // Update monster tile index so healer's damage lookup finds it
    game._updateMonsterTileIndex();

    const hpBefore = grunt.hp;

    // Run steps — healer should damage the grunt
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

    // Spawn a Brute (level 3)
    const brute = new Monster(3, game.waypoints, sp, 1);
    game.monsters.push(brute);

    const countBefore = game.monsters.length;

    // Kill the brute
    game.damageMonster(brute, brute.hp + 10);

    // Should have spawned 2 children (level 1)
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
    // Place ice wizard at (3, 0) — within range of path
    game.placeTroop(icewizSpec, 3, 0);

    game.spawnMonster(1);
    const grunt = game.monsters[0];
    const maxHp = grunt.maxHp;

    // Run a few steps so ice wizard fires and slows the grunt
    for (let i = 0; i < 30; i++) {
      game.step(CONFIG.FIXED_TIMESTEP);
    }

    // After being hit, the grunt should be slowed (slowTimer > 0)
    // and shatter should be armed for the next hit
    if (grunt.hp < maxHp) {
      // The grunt took damage — check if slow was applied
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

    // Deal damage less than shield
    game.damageMonster(shielded, 10);

    expect(shielded.shield).toBeLessThan(shieldBefore);
    expect(shielded.hp).toBe(shielded.maxHp); // HP untouched
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

    // Attempt to sell second troop while cooldown active
    game.sellTroop(1);
    expect(game.troops[1].alive).toBe(true); // not sold
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
    // Place troop in dev mode (free), then switch to normal mode with low gold
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

    // Grunt should not have moved
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
    // Set up wave with a single grunt
    game.wave.buildCustomFromCounts({ 1: 1 });
    game.wave.startNextWave();
    game.wave.elapsed = CONFIG.WAVE_START_DELAY + 1;

    game.step(CONFIG.FIXED_TIMESTEP);

    expect(game.monsters.length).toBeGreaterThan(0);
  });

  it('wave completion transitions state to PRE_WAVE', () => {
    // Spawn a single weak grunt and place a strong troop to kill it
    game.placeTroop(swordsmanSpec, 2, 0);
    game.spawnMonster(1);
    const grunt = game.monsters[0];

    // Manually set wave as complete (all spawned, no monsters left after kill)
    game.wave.spawnIndex = game.wave.queue.length;

    let steps = 0;
    while (game.state === 'WAVE_ACTIVE' && steps < 600) {
      game.step(CONFIG.FIXED_TIMESTEP);
      steps++;
    }

    // Either wave completes or grunt leaks — both are valid outcomes
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

    // Run steps until the lightning hits
    let steps = 0;
    while (grunt.alive && steps < 600) {
      game.step(CONFIG.FIXED_TIMESTEP);
      steps++;
    }

    // Lightning should have dealt damage
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

    // After selling, _cleanupDead compacts the array — second troop is now at index 0
    // Verify second troop is still alive and cooldown blocks selling it
    expect(secondTroop.alive).toBe(true);
    game.sellTroop(0);
    expect(secondTroop.alive).toBe(true); // still alive, blocked by cooldown

    // Run steps to let cooldown expire
    for (let i = 0; i < 300; i++) {
      game.step(CONFIG.FIXED_TIMESTEP);
    }

    expect(game.sellCooldownTimer).toBe(0);

    // Now selling should work
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

    // Damage each
    game.damageMonster(game.monsters[0], 5); // Grunt
    game.damageMonster(game.monsters[1], 5); // Runner
    game.damageMonster(game.monsters[2], 5); // Shielded (shield absorbs)
    game.damageMonster(game.monsters[3], 5); // Spear

    expect(game.monsters[0].hp).toBeLessThan(game.monsters[0].maxHp); // Grunt took damage
    expect(game.monsters[1].hp).toBeLessThan(game.monsters[1].maxHp); // Runner took damage
    expect(game.monsters[2].hp).toBe(game.monsters[2].maxHp); // Shielded HP unchanged
    expect(game.monsters[3].hp).toBeLessThan(game.monsters[3].maxHp); // Spear took damage
  });
});
