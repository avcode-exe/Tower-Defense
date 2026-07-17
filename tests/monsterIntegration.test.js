import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Game } from '../src/game.js';
import { CONFIG, TROOP_SPECS, MONSTER_SPECS } from '../src/config.js';
import { Grid, TILE } from '../src/grid.js';
import { Troop } from '../src/troop.js';
import { Monster } from '../src/monster.js';
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

import { makeGame, longPath } from './helpers.js';

const swordsmanSpec = TROOP_SPECS.find((s) => s.id === 'swordsman');
const archerSpec = TROOP_SPECS.find((s) => s.id === 'archer');
const knightSpec = TROOP_SPECS.find((s) => s.id === 'knight');
const mageSpec = TROOP_SPECS.find((s) => s.id === 'mage');
const flameSpec = TROOP_SPECS.find((s) => s.id === 'flame');
const healerSpec = TROOP_SPECS.find((s) => s.id === 'healer');

// ─── Monster specs verification ────────────────────────────────────────────

describe('Monster: spec verification', () => {
  it('all monster levels have required properties', () => {
    const required = [
      'name',
      'hp',
      'speed',
      'reward',
      'leak',
      'color',
      'size',
      'damage',
      'attackSpeed',
      'attackRange',
      'attackMode',
    ];
    for (const key of Object.keys(MONSTER_SPECS)) {
      const spec = MONSTER_SPECS[key];
      for (const prop of required) {
        expect(spec).toHaveProperty(prop);
      }
    }
  });

  it('Grunt: 34 HP, medium speed, 4 reward, 4 damage', () => {
    const g = MONSTER_SPECS[1];
    expect(g.hp).toBe(34);
    expect(g.speed).toBe(1.0);
    expect(g.reward).toBe(4);
    expect(g.damage).toBe(4);
    expect(g.leak).toBe(1);
  });

  it('Runner: 27 HP, very fast, 6 reward, pass mode', () => {
    const r = MONSTER_SPECS[2];
    expect(r.hp).toBe(27);
    expect(r.speed).toBe(3.0);
    expect(r.reward).toBe(6);
    expect(r.attackMode).toBe('pass');
    expect(r.noSplit).toBe(true);
  });

  it('Brute: 133 HP, slow, 11 reward, stop mode', () => {
    const b = MONSTER_SPECS[3];
    expect(b.hp).toBe(133);
    expect(b.speed).toBe(0.8);
    expect(b.reward).toBe(11);
    expect(b.damage).toBe(14);
  });

  it('Elite: 245 HP, medium, 17 reward, leaks 2', () => {
    const e = MONSTER_SPECS[4];
    expect(e.hp).toBe(245);
    expect(e.reward).toBe(17);
    expect(e.leak).toBe(2);
  });

  it('Champion: 667 HP, slow, 36 reward, leaks 3', () => {
    const c = MONSTER_SPECS[5];
    expect(c.hp).toBe(667);
    expect(c.reward).toBe(36);
    expect(c.leak).toBe(3);
  });

  it('Boss: 1668 HP, very slow, 200 reward, leaks 5, has healPerSecond', () => {
    const b = MONSTER_SPECS.B;
    expect(b.hp).toBe(1668);
    expect(b.reward).toBe(200);
    expect(b.leak).toBe(5);
    expect(b.healPerSecond).toBe(15);
  });

  it('Shielded: 173 HP, medium, 15 reward, has shield', () => {
    const s = MONSTER_SPECS.S;
    expect(s.hp).toBe(173);
    expect(s.shield).toBe(69);
  });

  it('Spear: 50 HP, fast, 5 reward, range 2.5', () => {
    const x = MONSTER_SPECS.X;
    expect(x.hp).toBe(50);
    expect(x.attackRange).toBe(2.5);
    expect(x.attackMode).toBe('slow');
  });

  it('Necromancer: 220 HP, slow, 18 reward, has revive', () => {
    const y = MONSTER_SPECS.Y;
    expect(y.hp).toBe(220);
    expect(y.noSplit).toBe(true);
    expect(y.reviveRange).toBe(CONFIG.MONSTER_REVIVE_RANGE);
  });
});

// ─── Monster spawning ──────────────────────────────────────────────────────

describe('Monster: spawning', () => {
  let game;
  beforeEach(() => {
    game = makeGame();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('spawnMonster creates a monster with correct level', () => {
    game.spawnMonster(1);
    expect(game.monsters).toHaveLength(1);
    expect(game.monsters[0].level).toBe(1);
  });

  it('spawnMonster creates monsters with different levels', () => {
    game.spawnMonster(1);
    game.spawnMonster(3);
    game.spawnMonster('B');
    expect(game.monsters).toHaveLength(3);
    expect(game.monsters[0].level).toBe(1);
    expect(game.monsters[1].level).toBe(3);
    expect(game.monsters[2].level).toBe('B');
  });

  it('spawned monster starts at the beginning of the path', () => {
    game.spawnMonster(1);
    const m = game.monsters[0];
    expect(m.distance).toBe(0);
    expect(m.alive).toBe(true);
  });

  it('spawned boss has doubled HP', () => {
    game.spawnMonster('B');
    const boss = game.monsters[0];
    expect(boss.maxHp).toBe(MONSTER_SPECS.B.hp * CONFIG.BOSS_HP_MULTIPLIER);
  });

  it('spawned monster with hpMult scales HP', () => {
    game.spawnMonster(1, 2);
    const m = game.monsters[0];
    expect(m.maxHp).toBe(MONSTER_SPECS[1].hp * 2);
  });
});

// ─── Monster movement ──────────────────────────────────────────────────────

describe('Monster: movement', () => {
  let game;
  beforeEach(() => {
    game = makeGame();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('monster moves along path after step()', () => {
    game.spawnMonster(1);
    const m = game.monsters[0];
    const distBefore = m.distance;
    for (let s = 0; s < 60; s++) game.step(CONFIG.FIXED_TIMESTEP);
    expect(m.distance).toBeGreaterThan(distBefore);
  });

  it('faster monsters move more distance per step', () => {
    game.spawnMonster(1); // medium speed
    game.spawnMonster(2); // very fast
    const grunt = game.monsters[0];
    const runner = game.monsters[1];
    for (let s = 0; s < 30; s++) game.step(CONFIG.FIXED_TIMESTEP);
    expect(runner.distance).toBeGreaterThan(grunt.distance);
  });

  it('monster position updates as it moves', () => {
    game.spawnMonster(1);
    const m = game.monsters[0];
    const xBefore = m.x;
    for (let s = 0; s < 60; s++) game.step(CONFIG.FIXED_TIMESTEP);
    expect(m.x).not.toBe(xBefore);
  });

  it('monster reaches end of path and leaks', () => {
    const sp = longPath();
    game.pathSegments = sp;
    game.spawnMonster(1);
    const m = game.monsters[0];
    const livesBefore = game.lives;
    for (let s = 0; s < 3000; s++) game.step(CONFIG.FIXED_TIMESTEP);
    expect(game.lives).toBeLessThan(livesBefore);
  });

  it('monster tile index updates as monsters move', () => {
    game.spawnMonster(1);
    game._updateMonsterTileIndex();
    const initialIdx = game.monsters[0]._tileGy * CONFIG.GRID_SIZE + game.monsters[0]._tileGx;
    for (let s = 0; s < 120; s++) game.step(CONFIG.FIXED_TIMESTEP);
    expect(game._monsterTileIndex.some((arr) => arr && arr.length > 0)).toBe(true);
  });
});

// ─── Monster combat ────────────────────────────────────────────────────────

describe('Monster: combat', () => {
  let game;
  beforeEach(() => {
    game = makeGame({ devMode: true });
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('damageMonster reduces monster HP', () => {
    game.spawnMonster(1);
    const m = game.monsters[0];
    const hpBefore = m.hp;
    game.damageMonster(m, 10);
    expect(m.hp).toBeLessThan(hpBefore);
  });

  it('damageMonster returns true when monster is killed', () => {
    game.spawnMonster(1);
    const m = game.monsters[0];
    const killed = game.damageMonster(m, m.hp + 10);
    expect(killed).toBe(true);
    expect(m.alive).toBe(false);
  });

  it('killing a monster awards gold', () => {
    game.spawnMonster(1);
    const m = game.monsters[0];
    game.devMode = false;
    game.gold = 10000;
    const goldBefore = game.gold;
    game.damageMonster(m, m.hp + 10);
    expect(game.gold).toBe(goldBefore + m.reward + 1);
  });

  it('already-dead monster does not award gold', () => {
    game.spawnMonster(1);
    const m = game.monsters[0];
    game.damageMonster(m, m.hp + 10);
    const goldAfterFirst = game.gold;
    game.damageMonster(m, 100);
    expect(game.gold).toBe(goldAfterFirst);
  });

  it('shielded monster absorbs damage with shield first', () => {
    game.spawnMonster('S');
    const s = game.monsters[0];
    const shieldBefore = s.shield;
    game.damageMonster(s, 10);
    expect(s.shield).toBeLessThan(shieldBefore);
    expect(s.hp).toBe(s.maxHp);
  });

  it('shielded monster immune to slow', () => {
    game.spawnMonster('S');
    const s = game.monsters[0];
    const applied = s.applySlow(0.5, 2.0, 0.5);
    expect(applied).toBe(false);
    expect(s.slowTimer).toBe(0);
  });

  it('stunned monster cannot move', () => {
    game.spawnMonster(1);
    const m = game.monsters[0];
    m.stunTimer = 1.0;
    const distBefore = m.distance;
    m.update(CONFIG.FIXED_TIMESTEP, []);
    expect(m.distance).toBe(distBefore);
  });

  it('stun expires after duration', () => {
    game.spawnMonster(1);
    const m = game.monsters[0];
    m.stunTimer = 0.5;
    for (let i = 0; i < 35; i++) m.update(CONFIG.FIXED_TIMESTEP, []);
    expect(m.stunTimer).toBe(0);
  });

  it('slow reduces monster speed', () => {
    game.spawnMonster(1);
    const m = game.monsters[0];
    const baseSpeed = CONFIG.MOVEMENT_SPEEDS[m.spec.movementSpeed] || m.spec.speed;
    m.applySlow(0.5, 2.0, 0.5);
    expect(m.speed).toBe(baseSpeed * 0.5);
  });

  it('slow expires and speed restores', () => {
    game.spawnMonster(1);
    const m = game.monsters[0];
    const baseSpeed = CONFIG.MOVEMENT_SPEEDS[m.spec.movementSpeed] || m.spec.speed;
    m.applySlow(0.5, 0.3, 0.5);
    for (let i = 0; i < 30; i++) m.update(CONFIG.FIXED_TIMESTEP, []);
    expect(m.speed).toBe(baseSpeed);
  });

  it('burn kills grant normal monster rewards', () => {
    game.devMode = false;
    game.gold = 0;
    game.spawnMonster(1);
    const m = game.monsters[0];
    m.hp = 1;
    const flame = new Troop(flameSpec, 5, 5);

    game.applyBurn(m, flame);
    for (let i = 0; i < 40; i++) m.update(CONFIG.FIXED_TIMESTEP, game._troopTileIndex);

    expect(m.alive).toBe(false);
    expect(game.gold).toBe(m.reward + 1);
  });

  it('burn kills do not double-count rewards', () => {
    game.devMode = false;
    game.gold = 0;
    game.spawnMonster(1);
    const m = game.monsters[0];
    m.hp = 1;
    const flame = new Troop(flameSpec, 5, 5);

    game.applyBurn(m, flame);
    for (let i = 0; i < 80; i++) m.update(CONFIG.FIXED_TIMESTEP, game._troopTileIndex);

    expect(game.gold).toBe(m.reward + 1);
  });

  it('burn ticks against shield before monster HP', () => {
    game.spawnMonster('S');
    const s = game.monsters[0];
    const shieldBefore = s.shield;
    const flame = new Troop(flameSpec, 5, 5);

    game.applyBurn(s, flame);
    for (let i = 0; i < 35; i++) s.update(CONFIG.FIXED_TIMESTEP, game._troopTileIndex);

    expect(s.shield).toBeLessThan(shieldBefore);
    expect(s.hp).toBe(s.maxHp);
  });
});

// ─── Monster splitting ─────────────────────────────────────────────────────

describe('Monster: splitting', () => {
  let game;
  beforeEach(() => {
    game = makeGame({ devMode: true });
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('killing a Brute spawns 2 Grunts', () => {
    const sp = longPath();
    game.pathSegments = sp;
    const brute = new Monster(3, game.waypoints, game.pathSegments, 1);
    game.monsters.push(brute);
    const countBefore = game.monsters.length;
    game.damageMonster(brute, brute.hp + 10);
    const children = game.monsters.filter((m) => m !== brute);
    expect(children).toHaveLength(2);
    expect(children.every((c) => c.level === 1)).toBe(true);
  });

  it('killing an Elite spawns 2 Brutes (childLvl=3)', () => {
    const sp = longPath();
    game.pathSegments = sp;
    const elite = new Monster(4, game.waypoints, game.pathSegments, 1);
    game.monsters.push(elite);
    game.damageMonster(elite, elite.hp + 10);
    const children = game.monsters.filter((m) => m !== elite);
    expect(children).toHaveLength(2);
    expect(children.every((c) => c.level === 3)).toBe(true);
  });

  it('killing a Champion spawns 2 Elites (childLvl=4)', () => {
    const sp = longPath();
    game.pathSegments = sp;
    const champ = new Monster(5, game.waypoints, game.pathSegments, 1);
    game.monsters.push(champ);
    game.damageMonster(champ, champ.hp + 10);
    const children = game.monsters.filter((m) => m !== champ);
    expect(children).toHaveLength(2);
    expect(children.every((c) => c.level === 4)).toBe(true);
  });

  it('Runner does not split (noSplit)', () => {
    const sp = longPath();
    game.pathSegments = sp;
    game.spawnMonster(2);
    const runner = game.monsters[0];
    const countBefore = game.monsters.length;
    game.damageMonster(runner, runner.hp + 10);
    expect(game.monsters.length).toBe(countBefore);
  });

  it('revived monsters do not split (reviveImmune)', () => {
    const sp = longPath();
    game.pathSegments = sp;
    const brute = new Monster(3, game.waypoints, game.pathSegments, 1);
    brute.reviveImmune = true;
    game.monsters.push(brute);
    const countBefore = game.monsters.length;
    game.damageMonster(brute, brute.hp + 10);
    expect(game.monsters.length).toBe(countBefore);
  });

  it('split children inherit position from parent', () => {
    const sp = longPath();
    game.pathSegments = sp;
    const brute = new Monster(3, game.waypoints, game.pathSegments, 1);
    brute.distance = 500;
    brute.segIdx = 0;
    brute._updatePosition();
    game.monsters.push(brute);
    game.damageMonster(brute, brute.hp + 10);
    const children = game.monsters.filter((m) => m !== brute);
    for (const child of children) {
      expect(child.distance).toBeCloseTo(500, 0);
    }
  });
});

// ─── Monster revive ────────────────────────────────────────────────────────

describe('Monster: necromancer revive', () => {
  let game;
  beforeEach(() => {
    game = makeGame({ devMode: true });
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('necromancer revives a nearby dead grunt', () => {
    game.spawnMonster('Y');
    game.spawnMonster(1);
    const grunt = game.monsters[1];
    grunt.hp = 0;
    grunt.alive = false;
    game.step(CONFIG.FIXED_TIMESTEP);
    expect(grunt.alive).toBe(true);
    expect(grunt.hp).toBeGreaterThan(0);
    expect(grunt.reviveImmune).toBe(true);
  });

  it('revive count limited to 4', () => {
    game.spawnMonster('Y');
    for (let i = 0; i < 5; i++) {
      game.spawnMonster(1);
      const m = game.monsters[game.monsters.length - 1];
      m.hp = 0;
      m.alive = false;
    }
    game.step(CONFIG.FIXED_TIMESTEP);
    expect(game.monsters[0].reviveCount).toBe(4);
  });

  it('necromancer does not revive itself', () => {
    game.spawnMonster('Y');
    const necro = game.monsters[0];
    necro.hp = 0;
    necro.alive = false;
    game.step(CONFIG.FIXED_TIMESTEP);
    expect(necro.alive).toBe(false);
  });

  it('revived monster resets stun and slow', () => {
    game.spawnMonster('Y');
    game.spawnMonster(1);
    const grunt = game.monsters[1];
    grunt.hp = 0;
    grunt.alive = false;
    grunt.stunTimer = 2.0;
    grunt.slowTimer = 3.0;
    game.step(CONFIG.FIXED_TIMESTEP);
    expect(grunt.stunTimer).toBe(0);
    expect(grunt.slowTimer).toBe(0);
  });

  it('revived monster deals 50% damage', () => {
    game.placeTroop(archerSpec, 1, 0);
    game.spawnMonster('Y');
    game.spawnMonster(1);
    const grunt = game.monsters[1];
    grunt.hp = 0;
    grunt.alive = false;
    game.step(CONFIG.FIXED_TIMESTEP);
    expect(grunt.alive).toBe(true);
    const archer = game.troops[0];
    const hpBefore = archer.hp;
    game.damageTroop(grunt, archer);
    const hpLost = hpBefore - archer.hp;
    expect(hpLost).toBe(Math.round(MONSTER_SPECS[1].damage * grunt.reviveDamageRatio));
  });
});

// ─── Boss mechanics ────────────────────────────────────────────────────────

describe('Monster: boss mechanics', () => {
  let game;
  beforeEach(() => {
    game = makeGame({ devMode: true });
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('boss has doubled HP', () => {
    game.spawnMonster('B');
    expect(game.monsters[0].maxHp).toBe(MONSTER_SPECS.B.hp * CONFIG.BOSS_HP_MULTIPLIER);
  });

  it('boss passively heals over time', () => {
    game.spawnMonster('B');
    const boss = game.monsters[0];
    boss.hp = boss.maxHp - 50;
    const damagedHp = boss.hp;
    for (let i = 0; i < 120; i++) game.step(CONFIG.FIXED_TIMESTEP);
    expect(boss.hp).toBeGreaterThan(damagedHp);
  });

  it('boss heal does not exceed maxHp', () => {
    game.spawnMonster('B');
    const boss = game.monsters[0];
    boss.hp = boss.maxHp - 5;
    for (let i = 0; i < 120; i++) game.step(CONFIG.FIXED_TIMESTEP);
    expect(boss.hp).toBeLessThanOrEqual(boss.maxHp);
  });
});

// ─── Shielded monster mechanics ────────────────────────────────────────────

describe('Monster: shielded mechanics', () => {
  let game;
  beforeEach(() => {
    game = makeGame({ devMode: true });
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('shielded monster has initial shield', () => {
    game.spawnMonster('S');
    expect(game.monsters[0].shield).toBe(MONSTER_SPECS.S.shield);
  });

  it('shield regenerates after delay', () => {
    game.spawnMonster('S');
    const s = game.monsters[0];
    s.shield = 0;
    s.shieldRegenTimer = 0;
    for (let i = 0; i < 240; i++) game.step(CONFIG.FIXED_TIMESTEP);
    expect(s.shield).toBeGreaterThan(0);
  });

  it('shield does not exceed max', () => {
    game.spawnMonster('S');
    const s = game.monsters[0];
    for (let i = 0; i < 600; i++) game.step(CONFIG.FIXED_TIMESTEP);
    expect(s.shield).toBeLessThanOrEqual(s.maxShield);
  });
});

// ─── Spear mechanics ───────────────────────────────────────────────────────

describe('Monster: spear mechanics', () => {
  let game;
  beforeEach(() => {
    game = makeGame({ devMode: true });
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('spear has ranged attack (2.5 tiles)', () => {
    game.spawnMonster('X');
    expect(game.monsters[0].spec.attackRange).toBe(2.5);
  });

  it('spear slows when near troops', () => {
    game.placeTroop(swordsmanSpec, 1, 0);
    game.spawnMonster('X');
    const spear = game.monsters[0];
    const baseSpeed = CONFIG.MOVEMENT_SPEEDS[spear.spec.movementSpeed] || spear.spec.speed;
    let slowed = false;
    for (let s = 0; s < 120; s++) {
      game.step(CONFIG.FIXED_TIMESTEP);
      if (spear.speed < CONFIG.MOVEMENT_SPEEDS[spear.spec.movementSpeed] || spear.spec.speed) {
        slowed = true;
        break;
      }
    }
    expect(slowed).toBe(true);
  });
});

// ─── Mixed monster interactions ────────────────────────────────────────────

describe('Monster: mixed interactions', () => {
  let game;
  beforeEach(() => {
    game = makeGame({ devMode: true });
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('different monster types coexist', () => {
    const sp = longPath();
    game.pathSegments = sp;
    game.spawnMonster(1);
    game.spawnMonster(2);
    game.spawnMonster('S');
    game.spawnMonster('X');
    expect(game.monsters).toHaveLength(4);
    for (const m of game.monsters) expect(m.alive).toBe(true);
  });

  it('boss and grunt coexist on the same path', () => {
    game.spawnMonster('B');
    game.spawnMonster(1);
    expect(game.monsters).toHaveLength(2);
    for (let s = 0; s < 60; s++) game.step(CONFIG.FIXED_TIMESTEP);
    expect(game.monsters.every((m) => m.alive)).toBe(true);
  });

  it('multiple grunts can be killed independently', () => {
    game.spawnMonster(1);
    game.spawnMonster(1);
    game.spawnMonster(1);
    game.damageMonster(game.monsters[1], game.monsters[1].hp + 10);
    expect(game.monsters[1].alive).toBe(false);
    expect(game.monsters[0].alive).toBe(true);
    expect(game.monsters[2].alive).toBe(true);
  });

  it('monster attack mode determines behavior', () => {
    expect(MONSTER_SPECS[1].attackMode).toBe('stop');
    expect(MONSTER_SPECS[2].attackMode).toBe('pass');
    expect(MONSTER_SPECS.X.attackMode).toBe('slow');
  });
});

// ─── Monster leak damage ───────────────────────────────────────────────────

describe('Monster: leak damage', () => {
  it('grunt leaks 1 life', () => {
    expect(MONSTER_SPECS[1].leak).toBe(1);
  });

  it('elite leaks 2 lives', () => {
    expect(MONSTER_SPECS[4].leak).toBe(2);
  });

  it('champion leaks 3 lives', () => {
    expect(MONSTER_SPECS[5].leak).toBe(3);
  });

  it('boss leaks 5 lives', () => {
    expect(MONSTER_SPECS.B.leak).toBe(5);
  });

  it('runner leaks 1 life', () => {
    expect(MONSTER_SPECS[2].leak).toBe(1);
  });

  it('shielded leaks 1 life', () => {
    expect(MONSTER_SPECS.S.leak).toBe(1);
  });
});

// ─── Monster cleanup and lifecycle ─────────────────────────────────────────

describe('Monster: lifecycle', () => {
  let game;
  beforeEach(() => {
    game = makeGame();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('dead monsters are cleaned up by step()', () => {
    for (let i = 0; i < 10; i++) game.spawnMonster(1);
    for (const m of game.monsters) game.damageMonster(m, m.hp + 100);
    game.step(CONFIG.FIXED_TIMESTEP);
    expect(game.monsters.length).toBe(0);
  });

  it('monster count returns to 0 after kill cycles', () => {
    for (let cycle = 0; cycle < 20; cycle++) {
      for (let i = 0; i < 10; i++) game.spawnMonster(1);
      for (const m of [...game.monsters]) game.damageMonster(m, m.hp + 100);
      game.step(CONFIG.FIXED_TIMESTEP);
      expect(game.monsters.length).toBe(0);
    }
  });

  it('monster count returns to 0 after leak cycles', () => {
    const sp = longPath();
    game.pathSegments = sp;
    for (let cycle = 0; cycle < 5; cycle++) {
      for (let i = 0; i < 3; i++) game.spawnMonster(1);
      let steps = 0;
      while (game.monsters.length > 0 && steps < 3000) {
        game.step(CONFIG.FIXED_TIMESTEP);
        steps++;
      }
      expect(game.monsters.length).toBe(0);
    }
  });
});

// ─── Healer monster (level H) ───────────────────────────────────────────────

describe('Monster: Healer', () => {
  let game;
  beforeEach(() => {
    game = makeGame({ devMode: true });
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('heals nearby damaged monsters', () => {
    game.spawnMonster('H');
    const healer = game.monsters[0];
    game.spawnMonster(3);
    const m = game.monsters[game.monsters.length - 1];
    m.hp = m.maxHp - 50;
    m.x = healer.x;
    m.y = healer.y;
    const hpBefore = m.hp;
    for (let s = 0; s < 120; s++) game.step(CONFIG.FIXED_TIMESTEP);
    expect(m.hp).toBeGreaterThan(hpBefore);
  });

  it('does not heal monsters outside range', () => {
    const sp = longPath();
    game.pathSegments = sp;
    game.spawnMonster('H');
    const healer = game.monsters[0];
    healer.x = CONFIG.TILE_SIZE * 0.5;
    healer.y = CONFIG.TILE_SIZE * 0.5;
    healer.distance = 0;
    healer._updatePosition();
    const farAlly = game.spawnMonster(1);
    const m = game.monsters[game.monsters.length - 1];
    m.x = CONFIG.TILE_SIZE * 8;
    m.y = CONFIG.TILE_SIZE * 0.5;
    m.distance = CONFIG.TILE_SIZE * 8;
    m._updatePosition();
    m.hp = m.maxHp - 50;
    const hpBefore = m.hp;
    for (let s = 0; s < 120; s++) game.step(CONFIG.FIXED_TIMESTEP);
    expect(m.hp).toBeCloseTo(hpBefore);
  });

  it('does not create infinite sustain', () => {
    game.spawnMonster('H');
    const healer = game.monsters[0];
    const ally = game.spawnMonster(1);
    const m = game.monsters[game.monsters.length - 1];
    m.hp = m.maxHp - 50;
    const steps = 600;
    for (let s = 0; s < steps; s++) game.step(CONFIG.FIXED_TIMESTEP);
    expect(game.monsters.length).toBeGreaterThan(0);
    expect(healer.hp).toBeLessThanOrEqual(healer.maxHp);
  });

  it('slows to slow category while healing', () => {
    game.spawnMonster('H');
    const healer = game.monsters[0];
    const ally = game.spawnMonster(1);
    const m = game.monsters[game.monsters.length - 1];
    m.hp = m.maxHp - 50;
    const baseSpeed = CONFIG.MOVEMENT_SPEEDS['fast'];
    let wasSlow = false;
    for (let s = 0; s < 120; s++) {
      game.step(CONFIG.FIXED_TIMESTEP);
      if (healer.speed === CONFIG.MOVEMENT_SPEEDS['slow']) {
        wasSlow = true;
        break;
      }
    }
    expect(wasSlow).toBe(true);
  });

  it('resumes fast speed after healing stops', () => {
    game.spawnMonster('H');
    const healer = game.monsters[0];
    const ally = game.spawnMonster(1);
    const m = game.monsters[game.monsters.length - 1];
    m.hp = m.maxHp - 10;
    for (let s = 0; s < 60; s++) game.step(CONFIG.FIXED_TIMESTEP);
    expect(healer.speed).toBeCloseTo(CONFIG.MOVEMENT_SPEEDS['slow']);
    m.hp = m.maxHp;
    for (let s = 0; s < 60; s++) game.step(CONFIG.FIXED_TIMESTEP);
    expect(healer.speed).toBeCloseTo(CONFIG.MOVEMENT_SPEEDS['fast']);
  });

  it('wave with Healer is completable', () => {
    const sp = longPath();
    game.pathSegments = sp;
    game.placeTroop(archerSpec, 1, 0);
    game.placeTroop(archerSpec, 2, 0);
    game.spawnMonster('H');
    const healer = game.monsters[0];
    healer.hp = healer.maxHp - 50;
    const helper = game.spawnMonster(1);
    const helperM = game.monsters[game.monsters.length - 1];
    helperM.hp = helperM.maxHp - 30;
    for (let s = 0; s < 3000; s++) game.step(CONFIG.FIXED_TIMESTEP);
    expect(game.monsters.every((m) => !m.alive)).toBe(true);
  });

  it('killing Healer awards correct gold and leak', () => {
    game.spawnMonster('H');
    const healer = game.monsters[0];
    game.devMode = false;
    game.gold = 0;
    const goldBefore = game.gold;
    game.damageMonster(healer, healer.hp + 10);
    expect(healer.alive).toBe(false);
    expect(game.gold).toBe(goldBefore + healer.reward + 1);
    expect(healer.leak).toBe(1);
  });
});
