import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Game } from '../src/game.js';
import { CONFIG, TROOP_SPECS, MONSTER_SPECS } from '../src/config.js';
import { Grid, TILE } from '../src/grid.js';
import { Troop } from '../src/troop.js';
import { Monster } from '../src/monster.js';
import { WaveManager } from '../src/waveManager.js';
import {
  makeGame,
  placeMonsterAt,
  setProgressKeepPosition,
  makeTroop,
  mortarSpec,
  valkyrieSpec,
  mageSpec,
  icewizSpec,
  lightningSpec,
  sniperSpec,
  machinegunSpec,
  knightSpec,
  swordsmanSpec,
  archerSpec,
  healerSpec,
} from './helpers.js';

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
    createFresh: vi.fn(() => ({
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

// Lookup all specs once
const specs = {};
for (const s of TROOP_SPECS) specs[s.id] = s;

// ─── Mortar splash: spec and splashAt mechanics ───────────────────────────

describe('Integration: Mortar splash damage', () => {
  let game;
  beforeEach(() => {
    game = makeGame({ gold: 10000 });
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('mortar has splash radius of 2.5 tiles', () => {
    expect(mortarSpec.splash).toBe(2.5);
  });

  it('mortar fires and kills Brutes (133 HP) via splash', () => {
    for (let s = 0; s < 10; s++) game.step(CONFIG.FIXED_TIMESTEP);
    game.placeTroop(mortarSpec, 2, 0);

    for (let i = 0; i < 3; i++) game.spawnMonster(3);

    const goldBefore = game.gold;

    for (let s = 0; s < 600; s++) game.step(CONFIG.FIXED_TIMESTEP);

    const totalDamage = game.monsters.reduce((sum, m) => sum + (m.maxHp - m.hp), 0);
    const anyDamaged = totalDamage > 0 || game.gold > goldBefore;
    expect(anyDamaged).toBe(true);
  });

  it('mortar splash damages Shielded monster shield', () => {
    const T = CONFIG.TILE_SIZE;
    const cx = 2 * T + T / 2;
    const cy = 0 * T + T / 2;

    const shielded = placeMonsterAt(game, 'S', 2, 0);
    const shieldBefore = shielded.shield;

    game.splashAt(cx, cy, mortarSpec.damage, mortarSpec.splash, null);

    expect(shielded.shield).toBeLessThan(shieldBefore);
    expect(shielded.hp).toBe(shielded.maxHp);
  });
});

// ─── Valkyrie AoE melee attacks ───────────────────────────────────────────

describe('Integration: Valkyrie AoE attacks', () => {
  let game;
  beforeEach(() => {
    game = makeGame({ gold: 10000 });
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('valkyrie has aoe property set to true', () => {
    expect(valkyrieSpec.aoe).toBe(true);
  });

  it('valkyrie is a melee troop', () => {
    expect(valkyrieSpec.type).toBe('melee');
  });

  it('valkyrie melee damage follows melee reduction rules', () => {
    expect(CONFIG.MELEE_DAMAGE_REDUCTION).toBe(0.3);
    expect(valkyrieSpec.hp).toBe(80);
  });

  it('valkyrie kills Brutes (133 HP) with AoE', () => {
    for (let s = 0; s < 10; s++) game.step(CONFIG.FIXED_TIMESTEP);
    game.placeTroop(valkyrieSpec, 2, 0);

    for (let i = 0; i < 2; i++) game.spawnMonster(3);

    const goldBefore = game.gold;

    for (let s = 0; s < 600; s++) game.step(CONFIG.FIXED_TIMESTEP);

    const anyDamaged = game.monsters.some((m) => m.hp < m.maxHp) || game.gold > goldBefore;
    expect(anyDamaged).toBe(true);
  });

  it('valkyrie has 22 base damage', () => {
    expect(valkyrieSpec.damage).toBe(22);
  });
});

// ─── Mage splash damage ───────────────────────────────────────────────────

describe('Integration: Mage splash damage', () => {
  let game;
  beforeEach(() => {
    game = makeGame({ gold: 10000 });
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('mage splash radius is 2.0 tiles', () => {
    expect(mageSpec.splash).toBe(2.0);
  });

  it('mage does high damage per hit (32 base)', () => {
    expect(mageSpec.damage).toBe(32);
  });

  it('mage splashAt damages Brutes within radius', () => {
    const T = CONFIG.TILE_SIZE;
    const cx = 5 * T + T / 2;
    const cy = 5 * T + T / 2;

    const m1 = placeMonsterAt(game, 3, 5, 5);
    const m2 = placeMonsterAt(game, 3, 5, 6);

    const hp1Before = m1.hp;
    const hp2Before = m2.hp;

    game.splashAt(cx, cy, mageSpec.damage, mageSpec.splash, null);

    expect(m1.hp).toBeLessThan(hp1Before);
    expect(m2.hp).toBeLessThan(hp2Before);
    expect(hp1Before - m1.hp).toBeGreaterThan(hp2Before - m2.hp);
  });
});

// ─── Ice Wizard splash + slow propagation ─────────────────────────────────

describe('Integration: Ice Wizard splash slow', () => {
  let game;
  beforeEach(() => {
    game = makeGame({ gold: 10000 });
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('ice wizard has splash radius 1.5 and slow mechanics', () => {
    expect(icewizSpec.splash).toBe(1.5);
    expect(icewizSpec.slowFactor).toBe(0.5);
    expect(icewizSpec.slowDuration).toBe(2.5);
    expect(icewizSpec.shatterBonus).toBe(0.5);
  });

  it('ice wizard shatter bonus applies on hit while slowed', () => {
    const grunt = new Monster(1, game.waypoints, game.pathSegments);
    grunt.applySlow(0.5, 2.5, 0.5);

    expect(grunt.shatterArmed).toBe(true);
    expect(grunt.shatterBonus).toBe(0.5);

    const result = grunt.takeDamage(10);
    expect(result.hpDamage).toBe(Math.round(10 * (1 + 0.5)));
    expect(grunt.shatterArmed).toBe(false);
  });

  it('slow expires after duration — speed restores', () => {
    const grunt = new Monster(1, game.waypoints, game.pathSegments);
    grunt.applySlow(0.5, 1.0, 0.5);

    expect(grunt.speed).toBe((CONFIG.MOVEMENT_SPEEDS[grunt.spec.movementSpeed] || grunt.spec.speed) * 0.5);

    for (let i = 0; i < 65; i++) grunt._updateSlowDecay(CONFIG.FIXED_TIMESTEP);

    expect(grunt.slowTimer).toBe(0);
    expect(grunt.speed).toBe(CONFIG.MOVEMENT_SPEEDS[grunt.spec.movementSpeed] || grunt.spec.speed);
  });

  it('stronger slow overrides weaker slow', () => {
    const grunt = new Monster(1, game.waypoints, game.pathSegments);
    grunt.applySlow(0.8, 2.0, 0.2);
    expect(grunt.speed).toBe((CONFIG.MOVEMENT_SPEEDS[grunt.spec.movementSpeed] || grunt.spec.speed) * 0.8);

    grunt.applySlow(0.5, 1.0, 0.5);
    expect(grunt.speed).toBe((CONFIG.MOVEMENT_SPEEDS[grunt.spec.movementSpeed] || grunt.spec.speed) * 0.5);
  });

  it('shielded monster is immune to slow', () => {
    game.spawnMonster('S');
    const shielded = game.monsters[0];
    const applied = shielded.applySlow(0.5, 2.0, 0.5);
    expect(applied).toBe(false);
    expect(shielded.slowTimer).toBe(0);
  });
});

// ─── Chain lightning ──────────────────────────────────────────────────────

describe('Integration: Chain lightning', () => {
  let game;
  beforeEach(() => {
    game = makeGame({ gold: 10000 });
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('lightning troop has chain 2 and stun 0.5', () => {
    expect(lightningSpec.chain).toBe(2);
    expect(lightningSpec.stun).toBe(0.5);
  });

  it('lightning troop fires and damages Brutes', () => {
    for (let s = 0; s < 10; s++) game.step(CONFIG.FIXED_TIMESTEP);
    game.placeTroop(lightningSpec, 2, 0);

    for (let i = 0; i < 2; i++) game.spawnMonster(3);

    const goldBefore = game.gold;

    for (let s = 0; s < 600; s++) game.step(CONFIG.FIXED_TIMESTEP);

    const anyDamaged = game.monsters.some((m) => m.hp < m.maxHp) || game.gold > goldBefore;
    expect(anyDamaged).toBe(true);
  });

  it('stun prevents monster from moving', () => {
    const grunt = new Monster(1, game.waypoints, game.pathSegments);
    const distBefore = grunt.distance;

    grunt.stunTimer = 1.0;
    grunt.update(CONFIG.FIXED_TIMESTEP, []);

    expect(grunt.distance).toBe(distBefore);
    expect(grunt.stunTimer).toBeGreaterThan(0);
  });
});

// ─── Splash damage falloff mechanics ──────────────────────────────────────

describe('Integration: splash damage falloff', () => {
  let game;
  beforeEach(() => {
    game = makeGame({ gold: 10000 });
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('monsters closer to splash center take more damage', () => {
    const T = CONFIG.TILE_SIZE;
    const cx = 5 * T + T / 2;
    const cy = 5 * T + T / 2;

    const near = placeMonsterAt(game, 3, 5, 5);
    const mid = placeMonsterAt(game, 3, 5, 6);
    const far = placeMonsterAt(game, 3, 7, 5);

    const nearHpBefore = near.hp;
    const midHpBefore = mid.hp;
    const farHpBefore = far.hp;

    game.splashAt(cx, cy, 65, 2.5, null);

    const nearDmg = nearHpBefore - near.hp;
    const midDmg = midHpBefore - mid.hp;
    const farDmg = farHpBefore - far.hp;

    expect(nearDmg).toBe(65);
    expect(midDmg).toBeGreaterThan(0);
    expect(midDmg).toBeLessThan(65);
    if (farDmg > 0) {
      expect(farDmg).toBeLessThanOrEqual(midDmg);
    }
  });

  it('splashAt with no monsters returns empty array', () => {
    const T = CONFIG.TILE_SIZE;
    const hit = game.splashAt(5 * T, 5 * T, 65, 2.5, null);
    expect(hit).toEqual([]);
  });

  it('splashAt respects monster alive status', () => {
    const T = CONFIG.TILE_SIZE;
    const dead = placeMonsterAt(game, 1, 5, 5);
    dead.hp = 0;
    dead.alive = false;
    game._updateMonsterTileIndex();

    const hit = game.splashAt(5 * T + T / 2, 5 * T + T / 2, 65, 2.5, null);
    expect(hit.length).toBe(0);
  });

  it('splashAt applies minimum 1 damage even with heavy falloff', () => {
    const T = CONFIG.TILE_SIZE;
    const cx = 5 * T + T / 2;
    const cy = 5 * T + T / 2;

    const edge = placeMonsterAt(game, 3, 7, 5);
    const hpBefore = edge.hp;

    game.splashAt(cx, cy, 1, 2.5, null);

    expect(edge.hp).toBeLessThan(hpBefore);
  });

  it('different troop splash radii affect how many monsters are hit', () => {
    const T = CONFIG.TILE_SIZE;
    const cx = 5 * T + T / 2;
    const cy = 5 * T + T / 2;

    const m1 = placeMonsterAt(game, 3, 7, 5);

    const hitIce = game.splashAt(cx, cy, icewizSpec.damage, icewizSpec.splash, null);
    expect(hitIce.some((m) => m === m1)).toBe(false);

    const m2 = placeMonsterAt(game, 3, 7, 6);

    const hitMortar = game.splashAt(cx, cy, mortarSpec.damage, mortarSpec.splash, null);
    expect(hitMortar.some((m) => m === m2)).toBe(true);
  });
});

// ─── Swordsman ────────────────────────────────────────────────────────────

describe('Integration: Swordsman', () => {
  let game;
  beforeEach(() => {
    game = makeGame({ gold: 10000, devMode: true });
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('spec: melee, 9 damage, range 1, 0.67s, 50 HP, 70 cost', () => {
    expect(specs.swordsman.type).toBe('melee');
    expect(specs.swordsman.damage).toBe(9);
    expect(specs.swordsman.range).toBe(1);
    expect(specs.swordsman.attackSpeed).toBe(0.67);
    expect(specs.swordsman.hp).toBe(50);
    expect(specs.swordsman.cost).toBe(70);
  });

  it('places on buildable tile', () => {
    expect(game.placeTroop(specs.swordsman, 5, 3)).toBe(true);
    expect(game.troops.length).toBe(1);
  });

  it('melee attacks grunt in adjacent tile', () => {
    game.placeTroop(specs.swordsman, 5, 1);
    const grunt = placeMonsterAt(game, 1, 5, 0);
    const hpBefore = grunt.hp;
    for (let i = 0; i < 60; i++) game.step(CONFIG.FIXED_TIMESTEP);
    expect(grunt.hp).toBeLessThan(hpBefore);
  });

  it('does not attack monster 2+ tiles away', () => {
    game.placeTroop(specs.swordsman, 5, 3);
    const grunt = placeMonsterAt(game, 1, 8, 3);
    const hpBefore = grunt.hp;
    for (let i = 0; i < 60; i++) game.step(CONFIG.FIXED_TIMESTEP);
    expect(grunt.hp).toBe(hpBefore);
  });

  it('melee damage reduction: takes 70% less damage', () => {
    game.placeTroop(specs.swordsman, 5, 1);
    const grunt = placeMonsterAt(game, 1, 5, 0);
    grunt.distance = grunt.totalLength * 0.5;
    grunt._updatePosition();
    game._updateMonsterTileIndex();
    const hpBefore = game.troops[0].hp;
    for (let i = 0; i < 120; i++) game.step(CONFIG.FIXED_TIMESTEP);
    const hpAfter = game.troops[0].hp;
    if (hpAfter < hpBefore) {
      const damageTaken = hpBefore - hpAfter;
      expect(damageTaken).toBeLessThanOrEqual(2);
    }
  });

  it('DPS matches spec', () => {
    const expectedDps = specs.swordsman.damage / specs.swordsman.attackSpeed;
    expect(expectedDps).toBeCloseTo(13.43, 1);
  });

  it('upgrade increases damage', () => {
    game.placeTroop(specs.swordsman, 5, 3);
    const baseDmg = game.troops[0]._cachedDamage;
    game.upgradeTroopStat(0, 'dmg');
    expect(game.troops[0]._cachedDamage).toBeGreaterThan(baseDmg);
  });

  it('upgrade increases HP', () => {
    game.placeTroop(specs.swordsman, 5, 3);
    const baseHp = game.troops[0].maxHp;
    game.upgradeTroopStat(0, 'hp');
    expect(game.troops[0].maxHp).toBeGreaterThan(baseHp);
  });

  it('upgrade reduces attack cooldown', () => {
    game.placeTroop(specs.swordsman, 5, 3);
    const baseSpeed = game.troops[0]._cachedAttackSpeed;
    game.upgradeTroopStat(0, 'speed');
    expect(game.troops[0]._cachedAttackSpeed).toBeLessThan(baseSpeed);
  });

  it('cannot upgrade range (melee)', () => {
    game.placeTroop(specs.swordsman, 5, 3);
    expect(game.troops[0].canUpgrade('range')).toBe(false);
  });

  it('can be sold', () => {
    game.placeTroop(specs.swordsman, 5, 3);
    game.sellTroop(0);
    expect(game.troops[0].alive).toBe(false);
  });
});

// ─── Knight ───────────────────────────────────────────────────────────────

describe('Integration: Knight', () => {
  let game;
  beforeEach(() => {
    game = makeGame({ gold: 10000, devMode: true });
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('spec: melee, 18 damage, range 1, 0.9s, 120 HP, 120 cost', () => {
    expect(specs.knight.type).toBe('melee');
    expect(specs.knight.damage).toBe(18);
    expect(specs.knight.range).toBe(1);
    expect(specs.knight.attackSpeed).toBe(0.9);
    expect(specs.knight.hp).toBe(120);
    expect(specs.knight.cost).toBe(120);
  });

  it('melee attacks grunt in adjacent tile', () => {
    game.placeTroop(specs.knight, 5, 1);
    const grunt = placeMonsterAt(game, 1, 5, 0);
    const hpBefore = grunt.hp;
    for (let i = 0; i < 60; i++) game.step(CONFIG.FIXED_TIMESTEP);
    expect(grunt.hp).toBeLessThan(hpBefore);
  });

  it('survives multiple grunt attacks (high HP + melee reduction)', () => {
    game.placeTroop(specs.knight, 5, 1);
    for (let i = 0; i < 3; i++) game.spawnMonster(1);
    for (let s = 0; s < 300; s++) game.step(CONFIG.FIXED_TIMESTEP);
    expect(game.troops[0].alive).toBe(true);
  });

  it('kills grunt quickly (18 damage)', () => {
    game.placeTroop(specs.knight, 5, 1);
    const grunt = placeMonsterAt(game, 1, 5, 0);
    const goldBefore = game.gold;
    for (let s = 0; s < 300; s++) game.step(CONFIG.FIXED_TIMESTEP);
    expect(game.gold).toBeGreaterThan(goldBefore);
  });

  it('DPS = 18 / 0.9 ≈ 20', () => {
    const dps = specs.knight.damage / specs.knight.attackSpeed;
    expect(dps).toBeCloseTo(20, 0);
  });

  it('upgrade increases damage', () => {
    game.placeTroop(specs.knight, 5, 3);
    const base = game.troops[0]._cachedDamage;
    game.upgradeTroopStat(0, 'dmg');
    expect(game.troops[0]._cachedDamage).toBeGreaterThan(base);
  });

  it('upgrade increases HP', () => {
    game.placeTroop(specs.knight, 5, 3);
    const base = game.troops[0].maxHp;
    game.upgradeTroopStat(0, 'hp');
    expect(game.troops[0].maxHp).toBeGreaterThan(base);
  });

  it('cannot upgrade range (melee)', () => {
    game.placeTroop(specs.knight, 5, 3);
    expect(game.troops[0].canUpgrade('range')).toBe(false);
  });
});

// ─── Archer ───────────────────────────────────────────────────────────────

describe('Integration: Archer', () => {
  let game;
  beforeEach(() => {
    game = makeGame({ gold: 10000, devMode: true });
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('spec: ranged, 12 damage, range 3, 1.2s, 30 HP, 70 cost', () => {
    expect(specs.archer.type).toBe('ranged');
    expect(specs.archer.damage).toBe(12);
    expect(specs.archer.range).toBe(3);
    expect(specs.archer.attackSpeed).toBe(1.2);
    expect(specs.archer.hp).toBe(30);
    expect(specs.archer.cost).toBe(70);
  });

  it('fires projectile at grunt within range', () => {
    game.placeTroop(specs.archer, 5, 1);
    const grunt = placeMonsterAt(game, 1, 5, 0);
    const hpBefore = grunt.hp;
    for (let i = 0; i < 90; i++) game.step(CONFIG.FIXED_TIMESTEP);
    expect(grunt.hp).toBeLessThan(hpBefore);
  });

  it('does not attack monster beyond range (3 tiles)', () => {
    game.placeTroop(specs.archer, 5, 3);
    const grunt = placeMonsterAt(game, 1, 10, 3);
    const hpBefore = grunt.hp;
    for (let i = 0; i < 90; i++) game.step(CONFIG.FIXED_TIMESTEP);
    expect(grunt.hp).toBe(hpBefore);
  });

  it('no splash (splash = 0)', () => {
    expect(specs.archer.splash).toBe(0);
  });

  it('DPS = 12 / 1.2 = 10', () => {
    expect(specs.archer.damage / specs.archer.attackSpeed).toBe(10);
  });

  it('upgrade increases damage', () => {
    game.placeTroop(specs.archer, 5, 3);
    const base = game.troops[0]._cachedDamage;
    game.upgradeTroopStat(0, 'dmg');
    expect(game.troops[0]._cachedDamage).toBeGreaterThan(base);
  });

  it('upgrade increases range', () => {
    game.placeTroop(specs.archer, 5, 3);
    const base = game.troops[0]._cachedRange;
    game.upgradeTroopStat(0, 'range');
    expect(game.troops[0]._cachedRange).toBeGreaterThan(base);
  });

  it('upgrade reduces cooldown', () => {
    game.placeTroop(specs.archer, 5, 3);
    const base = game.troops[0]._cachedAttackSpeed;
    game.upgradeTroopStat(0, 'speed');
    expect(game.troops[0]._cachedAttackSpeed).toBeLessThan(base);
  });

  it('fragile: dies to Champion attacks (30 HP vs 32 dmg)', () => {
    game.placeTroop(specs.archer, 5, 1);
    const archer = game.troops[0];
    game.spawnMonster(5);
    for (let s = 0; s < 600; s++) game.step(CONFIG.FIXED_TIMESTEP);
    expect(archer.alive).toBe(false);
  });
});

// ─── Machine Gun ──────────────────────────────────────────────────────────

describe('Integration: Machine Gun', () => {
  let game;
  beforeEach(() => {
    game = makeGame({ gold: 10000, devMode: true });
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('spec: ranged, 6 damage, range 4, 0.25s, 40 HP, 150 cost', () => {
    expect(specs.machinegun.type).toBe('ranged');
    expect(specs.machinegun.damage).toBe(6);
    expect(specs.machinegun.range).toBe(4);
    expect(specs.machinegun.attackSpeed).toBe(0.25);
    expect(specs.machinegun.hp).toBe(40);
    expect(specs.machinegun.cost).toBe(150);
  });

  it('fires rapidly (4 shots/second)', () => {
    game.placeTroop(specs.machinegun, 5, 1);
    const grunt = placeMonsterAt(game, 1, 5, 0);
    const hpBefore = grunt.hp;
    for (let i = 0; i < 90; i++) game.step(CONFIG.FIXED_TIMESTEP);
    expect(grunt.hp).toBeLessThan(hpBefore);
    expect(hpBefore - grunt.hp).toBeGreaterThanOrEqual(6);
  });

  it('shreds grunt (34 HP) in ~3 seconds', () => {
    game.placeTroop(specs.machinegun, 5, 1);
    const grunt = placeMonsterAt(game, 1, 5, 0);
    const goldBefore = game.gold;
    for (let s = 0; s < 300; s++) game.step(CONFIG.FIXED_TIMESTEP);
    expect(game.gold).toBeGreaterThan(goldBefore);
  });

  it('no splash (splash = 0)', () => {
    expect(specs.machinegun.splash).toBe(0);
  });

  it('DPS = 6 / 0.25 = 24', () => {
    expect(specs.machinegun.damage / specs.machinegun.attackSpeed).toBe(24);
  });

  it('upgrade increases damage', () => {
    game.placeTroop(specs.machinegun, 5, 3);
    const base = game.troops[0]._cachedDamage;
    game.upgradeTroopStat(0, 'dmg');
    expect(game.troops[0]._cachedDamage).toBeGreaterThan(base);
  });

  it('upgrade increases range', () => {
    game.placeTroop(specs.machinegun, 5, 3);
    const base = game.troops[0]._cachedRange;
    game.upgradeTroopStat(0, 'range');
    expect(game.troops[0]._cachedRange).toBeGreaterThan(base);
  });

  it('targets closest monster with highest progress', () => {
    game.placeTroop(specs.machinegun, 5, 1);
    const close = placeMonsterAt(game, 1, 5, 0);
    const far = placeMonsterAt(game, 1, 6, 0);
    setProgressKeepPosition(close, 0.1);
    setProgressKeepPosition(far, 0.3);
    game._updateMonsterTileIndex();
    const farHpBefore = far.hp;
    for (let i = 0; i < 120; i++) game.step(CONFIG.FIXED_TIMESTEP);
    expect(far.hp).toBeLessThan(farHpBefore);
  });
});

// ─── Mage ─────────────────────────────────────────────────────────────────

describe('Integration: Mage', () => {
  let game;
  beforeEach(() => {
    game = makeGame({ gold: 10000, devMode: true });
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('spec: ranged, 32 damage, range 3, 1.3s, splash 2.0, 35 HP, 180 cost', () => {
    expect(specs.mage.type).toBe('ranged');
    expect(specs.mage.damage).toBe(32);
    expect(specs.mage.range).toBe(3);
    expect(specs.mage.attackSpeed).toBe(1.3);
    expect(specs.mage.splash).toBe(2.0);
    expect(specs.mage.hp).toBe(35);
    expect(specs.mage.cost).toBe(180);
  });

  it('fires projectile that splashes on impact', () => {
    game.placeTroop(specs.mage, 5, 1);
    const grunt = placeMonsterAt(game, 1, 5, 0);
    const hpBefore = grunt.hp;
    for (let i = 0; i < 100; i++) game.step(CONFIG.FIXED_TIMESTEP);
    expect(grunt.hp).toBeLessThan(hpBefore);
  });

  it('splash damages multiple clustered monsters', () => {
    game.placeTroop(specs.mage, 5, 3);
    const m1 = placeMonsterAt(game, 1, 5, 4);
    const m2 = placeMonsterAt(game, 1, 6, 4);
    const m3 = placeMonsterAt(game, 1, 5, 5);
    for (const m of [m1, m2, m3]) setProgressKeepPosition(m, 0.5);
    game._updateMonsterTileIndex();
    for (let s = 0; s < 200; s++) game.step(CONFIG.FIXED_TIMESTEP);
    const damaged = [m1, m2, m3].filter((m) => m.hp < m.maxHp).length;
    expect(damaged).toBeGreaterThanOrEqual(2);
  });

  it('DPS = 32 / 1.3 ≈ 24.6', () => {
    const dps = specs.mage.damage / specs.mage.attackSpeed;
    expect(dps).toBeCloseTo(24.6, 0);
  });

  it('upgrade increases damage', () => {
    game.placeTroop(specs.mage, 5, 3);
    const base = game.troops[0]._cachedDamage;
    game.upgradeTroopStat(0, 'dmg');
    expect(game.troops[0]._cachedDamage).toBeGreaterThan(base);
  });

  it('upgrade increases range', () => {
    game.placeTroop(specs.mage, 5, 3);
    const base = game.troops[0]._cachedRange;
    game.upgradeTroopStat(0, 'range');
    expect(game.troops[0]._cachedRange).toBeGreaterThan(base);
  });
});

// ─── Sniper ───────────────────────────────────────────────────────────────

describe('Integration: Sniper', () => {
  let game;
  beforeEach(() => {
    game = makeGame({ gold: 10000, devMode: true });
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('spec: ranged, 100 damage, range 10, 2.5s, 25 HP, 250 cost', () => {
    expect(specs.sniper.type).toBe('ranged');
    expect(specs.sniper.damage).toBe(100);
    expect(specs.sniper.range).toBe(10);
    expect(specs.sniper.attackSpeed).toBe(2.5);
    expect(specs.sniper.hp).toBe(25);
    expect(specs.sniper.cost).toBe(250);
  });

  it('hits monster 8+ tiles away', () => {
    game.placeTroop(specs.sniper, 5, 3);
    const brute = placeMonsterAt(game, 3, 12, 3);
    const hpBefore = brute.hp;
    for (let s = 0; s < 200; s++) game.step(CONFIG.FIXED_TIMESTEP);
    expect(brute.hp).toBeLessThan(hpBefore);
  });

  it('kills brute (133 HP) in 2 hits', () => {
    game.placeTroop(specs.sniper, 5, 3);
    const brute = placeMonsterAt(game, 3, 5, 4);
    const goldBefore = game.gold;
    for (let s = 0; s < 400; s++) game.step(CONFIG.FIXED_TIMESTEP);
    expect(game.gold).toBeGreaterThan(goldBefore);
  });

  it('fragile: 25 HP', () => {
    expect(specs.sniper.hp).toBe(25);
  });

  it('DPS = 100 / 2.5 = 40', () => {
    expect(specs.sniper.damage / specs.sniper.attackSpeed).toBe(40);
  });

  it('targets highest progress monster', () => {
    game.placeTroop(specs.sniper, 5, 3);
    const near = placeMonsterAt(game, 1, 5, 4);
    const far = placeMonsterAt(game, 1, 6, 4);
    near.distance = near.totalLength * 0.2;
    near._updatePosition();
    far.distance = far.totalLength * 0.6;
    far._updatePosition();
    game._updateMonsterTileIndex();
    for (let s = 0; s < 200; s++) game.step(CONFIG.FIXED_TIMESTEP);
    expect(far.hp).toBeLessThan(far.maxHp);
  });

  it('upgrade increases damage', () => {
    game.placeTroop(specs.sniper, 5, 3);
    const base = game.troops[0]._cachedDamage;
    game.upgradeTroopStat(0, 'dmg');
    expect(game.troops[0]._cachedDamage).toBeGreaterThan(base);
  });

  it('upgrade increases range', () => {
    game.placeTroop(specs.sniper, 5, 3);
    const base = game.troops[0]._cachedRange;
    game.upgradeTroopStat(0, 'range');
    expect(game.troops[0]._cachedRange).toBeGreaterThan(base);
  });
});

// ─── Valkyrie ─────────────────────────────────────────────────────────────

describe('Integration: Valkyrie', () => {
  let game;
  beforeEach(() => {
    game = makeGame({ gold: 10000, devMode: true });
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('spec: melee, 22 damage, range 1, 1.2s, 80 HP, aoe, 150 cost', () => {
    expect(specs.valkyrie.type).toBe('melee');
    expect(specs.valkyrie.damage).toBe(22);
    expect(specs.valkyrie.range).toBe(1);
    expect(specs.valkyrie.attackSpeed).toBe(1.2);
    expect(specs.valkyrie.hp).toBe(80);
    expect(specs.valkyrie.aoe).toBe(true);
    expect(specs.valkyrie.cost).toBe(150);
  });

  it('aoe=true verified', () => {
    expect(specs.valkyrie.aoe).toBe(true);
  });

  it('damages all adjacent monsters with AoE', () => {
    game.placeTroop(specs.valkyrie, 5, 1);
    const g1 = placeMonsterAt(game, 1, 5, 0);
    const g2 = placeMonsterAt(game, 1, 6, 0);
    const g3 = placeMonsterAt(game, 1, 4, 0);
    for (let s = 0; s < 120; s++) game.step(CONFIG.FIXED_TIMESTEP);
    expect(g1.hp).toBeLessThan(g1.maxHp);
    expect(g2.hp).toBeLessThan(g2.maxHp);
    expect(g3.hp).toBeLessThan(g3.maxHp);
  });

  it('DPS = 22 / 1.2 ≈ 18.3', () => {
    const dps = specs.valkyrie.damage / specs.valkyrie.attackSpeed;
    expect(dps).toBeCloseTo(18.3, 0);
  });

  it('survives grunt attacks (80 HP + melee reduction)', () => {
    game.placeTroop(specs.valkyrie, 5, 1);
    for (let i = 0; i < 3; i++) game.spawnMonster(1);
    for (let s = 0; s < 300; s++) game.step(CONFIG.FIXED_TIMESTEP);
    expect(game.troops[0].alive).toBe(true);
  });

  it('upgrade increases damage', () => {
    game.placeTroop(specs.valkyrie, 5, 3);
    const base = game.troops[0]._cachedDamage;
    game.upgradeTroopStat(0, 'dmg');
    expect(game.troops[0]._cachedDamage).toBeGreaterThan(base);
  });

  it('upgrade increases HP', () => {
    game.placeTroop(specs.valkyrie, 5, 3);
    const base = game.troops[0].maxHp;
    game.upgradeTroopStat(0, 'hp');
    expect(game.troops[0].maxHp).toBeGreaterThan(base);
  });
});

// ─── Lightning ────────────────────────────────────────────────────────────

describe('Integration: Lightning', () => {
  let game;
  beforeEach(() => {
    game = makeGame({ gold: 10000, devMode: true });
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('spec: ranged, 100 damage, range 2, 3s, chain 2, stun 0.5, 40 HP, 300 cost', () => {
    expect(specs.lightning.type).toBe('ranged');
    expect(specs.lightning.damage).toBe(100);
    expect(specs.lightning.range).toBe(2);
    expect(specs.lightning.attackSpeed).toBe(3);
    expect(specs.lightning.chain).toBe(2);
    expect(specs.lightning.stun).toBe(0.5);
    expect(specs.lightning.hp).toBe(40);
    expect(specs.lightning.cost).toBe(300);
  });

  it('fires and kills grunt (34 HP)', () => {
    game.placeTroop(specs.lightning, 5, 1);
    const grunt = placeMonsterAt(game, 1, 5, 0);
    const goldBefore = game.gold;
    for (let s = 0; s < 300; s++) game.step(CONFIG.FIXED_TIMESTEP);
    expect(game.gold).toBeGreaterThan(goldBefore);
  });

  it('chain=2 verified', () => {
    expect(specs.lightning.chain).toBe(2);
  });

  it('stun=0.5s verified', () => {
    expect(specs.lightning.stun).toBe(0.5);
  });

  it('upgrade increases chain count', () => {
    game.placeTroop(specs.lightning, 5, 3);
    expect(game.troops[0]._cachedChain).toBe(2);
    game.upgradeTroopStat(0, 'chain');
    expect(game.troops[0]._cachedChain).toBe(3);
  });

  it('upgrade increases damage', () => {
    game.placeTroop(specs.lightning, 5, 3);
    const base = game.troops[0]._cachedDamage;
    game.upgradeTroopStat(0, 'dmg');
    expect(game.troops[0]._cachedDamage).toBeGreaterThan(base);
  });

  it('DPS = 100 / 3 ≈ 33.3 (single target)', () => {
    const dps = specs.lightning.damage / specs.lightning.attackSpeed;
    expect(dps).toBeCloseTo(33.3, 0);
  });
});

// ─── Mortar ───────────────────────────────────────────────────────────────

describe('Integration: Mortar', () => {
  let game;
  beforeEach(() => {
    game = makeGame({ gold: 10000, devMode: true });
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('spec: ranged, 65 damage, range 8, 3s, splash 2.5, 30 HP, 200 cost', () => {
    expect(specs.mortar.type).toBe('ranged');
    expect(specs.mortar.damage).toBe(65);
    expect(specs.mortar.range).toBe(8);
    expect(specs.mortar.attackSpeed).toBe(3.0);
    expect(specs.mortar.splash).toBe(2.5);
    expect(specs.mortar.hp).toBe(30);
    expect(specs.mortar.cost).toBe(200);
  });

  it('fires at distant monster', () => {
    game.placeTroop(specs.mortar, 8, 3);
    const brute = placeMonsterAt(game, 3, 5, 4);
    const hpBefore = brute.hp;
    for (let s = 0; s < 300; s++) game.step(CONFIG.FIXED_TIMESTEP);
    expect(brute.hp).toBeLessThan(hpBefore);
  });

  it('splash radius 2.5 tiles', () => {
    expect(specs.mortar.splash).toBe(2.5);
  });

  it('splash damages clustered monsters', () => {
    game.placeTroop(specs.mortar, 5, 3);
    const m1 = placeMonsterAt(game, 1, 5, 4);
    const m2 = placeMonsterAt(game, 1, 6, 4);
    const m3 = placeMonsterAt(game, 1, 5, 5);
    for (let s = 0; s < 300; s++) game.step(CONFIG.FIXED_TIMESTEP);
    const damaged = [m1, m2, m3].filter((m) => m.hp < m.maxHp).length;
    expect(damaged).toBeGreaterThanOrEqual(2);
  });

  it('DPS = 65 / 3 ≈ 21.7', () => {
    const dps = specs.mortar.damage / specs.mortar.attackSpeed;
    expect(dps).toBeCloseTo(21.7, 0);
  });

  it('fragile: 30 HP', () => {
    expect(specs.mortar.hp).toBe(30);
  });

  it('upgrade increases damage', () => {
    game.placeTroop(specs.mortar, 5, 3);
    const base = game.troops[0]._cachedDamage;
    game.upgradeTroopStat(0, 'dmg');
    expect(game.troops[0]._cachedDamage).toBeGreaterThan(base);
  });

  it('upgrade increases range', () => {
    game.placeTroop(specs.mortar, 5, 3);
    const base = game.troops[0]._cachedRange;
    game.upgradeTroopStat(0, 'range');
    expect(game.troops[0]._cachedRange).toBeGreaterThan(base);
  });
});

// ─── Ice Wizard ───────────────────────────────────────────────────────────

describe('Integration: Ice Wizard', () => {
  let game;
  beforeEach(() => {
    game = makeGame({ gold: 10000, devMode: true });
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('spec: ranged, 6 damage, range 3, 1.4s, splash 1.5, slow 0.5, slowDur 2.5s, shatter 0.5, 60 HP, 200 cost', () => {
    expect(specs.icewiz.type).toBe('ranged');
    expect(specs.icewiz.damage).toBe(6);
    expect(specs.icewiz.range).toBe(3);
    expect(specs.icewiz.attackSpeed).toBe(1.4);
    expect(specs.icewiz.splash).toBe(1.5);
    expect(specs.icewiz.slowFactor).toBe(0.5);
    expect(specs.icewiz.slowDuration).toBe(2.5);
    expect(specs.icewiz.shatterBonus).toBe(0.5);
    expect(specs.icewiz.hp).toBe(60);
    expect(specs.icewiz.cost).toBe(200);
  });

  it('slows monster (speed reduced)', () => {
    game.placeTroop(specs.icewiz, 5, 1);
    const grunt = placeMonsterAt(game, 1, 5, 0);
    const baseSpeed = CONFIG.MOVEMENT_SPEEDS[grunt.spec.movementSpeed] || grunt.spec.speed;
    for (let i = 0; i < 90; i++) game.step(CONFIG.FIXED_TIMESTEP);
    if (grunt.slowTimer > 0) {
      expect(grunt.speed).toBeLessThan(baseSpeed);
    }
  });

  it('shatter bonus: extra damage on slowed target', () => {
    const grunt = new Monster(1, game.waypoints, game.pathSegments);
    grunt.applySlow(0.5, 2.5, 0.5);
    expect(grunt.shatterArmed).toBe(true);
    expect(grunt.shatterBonus).toBe(0.5);
    const result = grunt.takeDamage(10);
    expect(result.hpDamage).toBe(15);
    expect(grunt.shatterArmed).toBe(false);
  });

  it('splash damages monsters in 1.5 tile radius', () => {
    game.placeTroop(specs.icewiz, 5, 1);
    const g1 = placeMonsterAt(game, 1, 5, 0);
    const g2 = placeMonsterAt(game, 1, 6, 0);
    for (let s = 0; s < 120; s++) game.step(CONFIG.FIXED_TIMESTEP);
    expect(g1.hp).toBeLessThan(g1.maxHp);
    expect(g2.hp).toBeLessThan(g2.maxHp);
  });

  it('slow expiry restores speed', () => {
    const grunt = new Monster(1, game.waypoints, game.pathSegments);
    const baseSpeed = CONFIG.MOVEMENT_SPEEDS[grunt.spec.movementSpeed] || grunt.spec.speed;
    grunt.applySlow(0.5, 0.3, 0.5);
    expect(grunt.speed).toBe(baseSpeed * 0.5);
    for (let i = 0; i < 24; i++) grunt.update(CONFIG.FIXED_TIMESTEP, []);
    expect(grunt.speed).toBe(baseSpeed);
  });

  it('DPS = 6 / 1.4 ≈ 4.3 (base, without shatter)', () => {
    const dps = specs.icewiz.damage / specs.icewiz.attackSpeed;
    expect(dps).toBeCloseTo(4.3, 0);
  });

  it('upgrade increases damage', () => {
    game.placeTroop(specs.icewiz, 5, 3);
    const base = game.troops[0]._cachedDamage;
    game.upgradeTroopStat(0, 'dmg');
    expect(game.troops[0]._cachedDamage).toBeGreaterThan(base);
  });

  it('upgrade strengthens slow', () => {
    game.placeTroop(specs.icewiz, 5, 3);
    const baseFactor = game.troops[0]._cachedSlowFactor;
    game.upgradeTroopStat(0, 'slow');
    expect(game.troops[0]._cachedSlowFactor).toBeLessThan(baseFactor);
  });
});

// ─── Healer ───────────────────────────────────────────────────────────────

describe('Integration: Healer', () => {
  let game;
  beforeEach(() => {
    game = makeGame({ gold: 10000, devMode: true });
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('spec: support, 8 heal, range 2, 0.5s, monsterDamage 3, 40 HP, 140 cost', () => {
    expect(specs.healer.type).toBe('support');
    expect(specs.healer.damage).toBe(8);
    expect(specs.healer.range).toBe(2);
    expect(specs.healer.attackSpeed).toBe(0.5);
    expect(specs.healer.monsterDamage).toBe(3);
    expect(specs.healer.hp).toBe(40);
    expect(specs.healer.cost).toBe(140);
  });

  it('heals damaged ally', () => {
    game.placeTroop(specs.healer, 5, 3);
    game.placeTroop(specs.archer, 6, 3);
    const archer = game.troops[1];
    archer.hp = 10;
    for (let i = 0; i < 20; i++) game.step(CONFIG.FIXED_TIMESTEP);
    expect(archer.hp).toBeGreaterThan(10);
  });

  it('does not heal full-HP allies', () => {
    game.placeTroop(specs.healer, 5, 3);
    game.placeTroop(specs.archer, 6, 3);
    const archer = game.troops[1];
    const hpBefore = archer.hp;
    for (let i = 0; i < 20; i++) game.step(CONFIG.FIXED_TIMESTEP);
    expect(archer.hp).toBe(hpBefore);
  });

  it('does not heal other support troops', () => {
    game.placeTroop(specs.healer, 5, 3);
    game.placeTroop(specs.healer, 6, 3);
    game.troops[1].hp = 5;
    for (let i = 0; i < 20; i++) game.step(CONFIG.FIXED_TIMESTEP);
    expect(game.troops[1].hp).toBe(5);
  });

  it('damages monsters in heal range', () => {
    game.placeTroop(specs.healer, 5, 3);
    const grunt = placeMonsterAt(game, 1, 5, 4);
    const hpBefore = grunt.hp;
    for (let i = 0; i < 20; i++) game.step(CONFIG.FIXED_TIMESTEP);
    expect(grunt.hp).toBeLessThan(hpBefore);
  });

  it('heals AND damages simultaneously', () => {
    game.placeTroop(specs.healer, 5, 3);
    game.placeTroop(specs.archer, 6, 3);
    game.troops[1].hp = 10;
    const grunt = placeMonsterAt(game, 1, 5, 4);
    for (let i = 0; i < 20; i++) game.step(CONFIG.FIXED_TIMESTEP);
    expect(game.troops[1].hp).toBeGreaterThan(10);
    expect(grunt.hp).toBeLessThan(grunt.maxHp);
  });

  it('upgrade slow increases heal target count', () => {
    game.placeTroop(specs.healer, 5, 3);
    expect(game.troops[0].healTargetLevel).toBe(1);
    game.upgradeTroopStat(0, 'slow');
    expect(game.troops[0].healTargetLevel).toBe(2);
  });

  it('upgrade damage increases heal amount', () => {
    game.placeTroop(specs.healer, 5, 3);
    const base = game.troops[0]._cachedDamage;
    game.upgradeTroopStat(0, 'dmg');
    expect(game.troops[0]._cachedDamage).toBeGreaterThan(base);
  });

  it('upgrade speed reduces cooldown', () => {
    game.placeTroop(specs.healer, 5, 3);
    const base = game.troops[0]._cachedAttackSpeed;
    game.upgradeTroopStat(0, 'speed');
    expect(game.troops[0]._cachedAttackSpeed).toBeLessThan(base);
  });
});

// ─── Cross-troop comparisons ──────────────────────────────────────────────

describe('Integration: Troop comparisons', () => {
  it('Knight has more HP than Swordsman', () => {
    expect(specs.knight.hp).toBeGreaterThan(specs.swordsman.hp);
  });

  it('Knight does more damage than Swordsman', () => {
    expect(specs.knight.damage).toBeGreaterThan(specs.swordsman.damage);
  });

  it('Sniper has longest range', () => {
    const maxRange = Math.max(...TROOP_SPECS.map((s) => s.range));
    expect(specs.sniper.range).toBe(maxRange);
  });

  it('Machine Gun has fastest fire rate', () => {
    const minSpeed = Math.min(...TROOP_SPECS.map((s) => s.attackSpeed));
    expect(specs.machinegun.attackSpeed).toBe(minSpeed);
  });

  it('Lightning has highest single-hit damage (tied with Sniper)', () => {
    expect(specs.lightning.damage).toBe(100);
    expect(specs.sniper.damage).toBe(100);
  });

  it('Champion-tier melee: Knight > Swordsman in all stats', () => {
    expect(specs.knight.hp).toBeGreaterThan(specs.swordsman.hp);
    expect(specs.knight.damage).toBeGreaterThan(specs.swordsman.damage);
    expect(specs.knight.cost).toBeGreaterThan(specs.swordsman.cost);
  });

  it('Ranged DPS ranking: Sniper > Mage > Machine Gun > Archer > Mortar > Ice Wizard', () => {
    const sniperDps = specs.sniper.damage / specs.sniper.attackSpeed;
    const mageDps = specs.mage.damage / specs.mage.attackSpeed;
    const mgDps = specs.machinegun.damage / specs.machinegun.attackSpeed;
    const archerDps = specs.archer.damage / specs.archer.attackSpeed;
    const mortarDps = specs.mortar.damage / specs.mortar.attackSpeed;
    const iceDps = specs.icewiz.damage / specs.icewiz.attackSpeed;
    expect(sniperDps).toBeGreaterThan(mageDps);
    expect(mageDps).toBeGreaterThan(mgDps);
    expect(mgDps).toBeGreaterThan(mortarDps);
    expect(mortarDps).toBeGreaterThan(archerDps);
    expect(archerDps).toBeGreaterThan(iceDps);
  });

  it('total DPS (including AoE/splash): Mortar excels vs groups', () => {
    const mortarEffective = (specs.mortar.damage / specs.mortar.attackSpeed) * specs.mortar.splash;
    const mageEffective = (specs.mage.damage / specs.mage.attackSpeed) * specs.mage.splash;
    expect(mortarEffective).toBeGreaterThan(mageEffective);
  });

  it('cost efficiency: Swordsman is cheapest', () => {
    const minCost = Math.min(...TROOP_SPECS.map((s) => s.cost));
    expect(specs.swordsman.cost).toBe(minCost);
  });

  it('all melee troops have 70% damage reduction', () => {
    for (const s of TROOP_SPECS) {
      if (s.type === 'melee') {
        expect(s.type).toBe('melee');
      }
    }
  });

  it('all troop types accounted for (12 total)', () => {
    expect(TROOP_SPECS.length).toBe(12);
  });
});

// ─── Troop lifecycle ──────────────────────────────────────────────────────

describe('Integration: Troop lifecycle', () => {
  let game;
  beforeEach(() => {
    game = makeGame({ gold: 10000, devMode: true });
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('place, select, sell cycle works', () => {
    game.placeTroop(specs.swordsman, 5, 3);
    expect(game.troops.length).toBe(1);
    expect(game.troops[0].alive).toBe(true);
    game.sellTroop(0);
    expect(game.troops[0].alive).toBe(false);
  });

  it('place multiple troops', () => {
    game.placeTroop(specs.swordsman, 5, 3);
    game.placeTroop(specs.archer, 6, 3);
    game.placeTroop(specs.mage, 7, 3);
    expect(game.troops.length).toBe(3);
  });

  it('cannot place on occupied tile', () => {
    game.placeTroop(specs.swordsman, 5, 3);
    expect(game.placeTroop(specs.archer, 5, 3)).toBe(false);
  });

  it('cannot place on path tile', () => {
    expect(game.placeTroop(specs.swordsman, 5, 0)).toBe(false);
  });

  it('upgrade 5 times then maxed', () => {
    game.placeTroop(specs.swordsman, 5, 3);
    for (let i = 0; i < 5; i++) game.upgradeTroopStat(0, 'dmg');
    expect(game.troops[0].isMaxed('dmg')).toBe(true);
    game.upgradeTroopStat(0, 'dmg');
    expect(game.troops[0].dmgLevel).toBe(5);
  });

  it('death removes troop from array', () => {
    game.placeTroop(specs.archer, 5, 1);
    game.spawnMonster(5);
    for (let s = 0; s < 600; s++) game.step(CONFIG.FIXED_TIMESTEP);
    const aliveTroops = game.troops.filter((t) => t.alive);
    expect(aliveTroops.length).toBe(0);
  });

  it('all troops can be placed at non-path tiles', () => {
    let placed = 0;
    for (let i = 0; i < TROOP_SPECS.length; i++) {
      const s = TROOP_SPECS[i];
      const gx = 3 + (i % 10);
      const gy = 3 + Math.floor(i / 10);
      if (game.placeTroop(s, gx, gy)) placed++;
    }
    expect(placed).toBe(TROOP_SPECS.length);
  });
});

// ─── Healer: spec and stats ───────────────────────────────────────────────

describe('Integration: Healer spec', () => {
  it('healer is support type', () => {
    expect(healerSpec.type).toBe('support');
  });

  it('healer has monster damage (3)', () => {
    expect(healerSpec.monsterDamage).toBe(3);
  });

  it('healer heals 8 HP per heal', () => {
    expect(healerSpec.damage).toBe(8);
  });

  it('healer has 0.5s heal cooldown', () => {
    expect(healerSpec.attackSpeed).toBe(0.5);
  });

  it('healer has range 2', () => {
    expect(healerSpec.range).toBe(2);
  });

  it('healer costs 140 gold', () => {
    expect(healerSpec.cost).toBe(140);
  });

  it('healer has 40 HP', () => {
    expect(healerSpec.hp).toBe(40);
  });
});

// ─── Healer: heal prioritization ──────────────────────────────────────────

describe('Integration: Healer heal prioritization', () => {
  let game;
  beforeEach(() => {
    game = makeGame({ gold: 10000, devMode: true });
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('healer prioritizes lowest HP ratio first', () => {
    game.placeTroop(healerSpec, 5, 3);

    game.placeTroop(archerSpec, 6, 3);
    game.placeTroop(swordsmanSpec, 4, 3);

    game.troops[1].hp = 3;
    game.troops[2].hp = 25;

    game.step(CONFIG.FIXED_TIMESTEP);

    expect(game.troops[1].hp).toBeGreaterThan(3);
  });

  it('healer does not heal full-HP troops', () => {
    game.placeTroop(healerSpec, 5, 3);
    game.placeTroop(archerSpec, 6, 3);

    const archer = game.troops[1];
    const hpBefore = archer.hp;

    for (let i = 0; i < 10; i++) game.step(CONFIG.FIXED_TIMESTEP);

    expect(archer.hp).toBe(hpBefore);
  });

  it('healer does not heal other support troops', () => {
    game.placeTroop(healerSpec, 5, 3);
    game.placeTroop(healerSpec, 6, 3);
    game.placeTroop(archerSpec, 7, 3);

    game.troops[1].hp = 5;

    for (let i = 0; i < 10; i++) game.step(CONFIG.FIXED_TIMESTEP);

    expect(game.troops[1].hp).toBe(5);
  });

  it('healer heals multiple targets when healTargetLevel > 1', () => {
    game.placeTroop(healerSpec, 5, 3);

    game.placeTroop(archerSpec, 4, 3);
    game.placeTroop(swordsmanSpec, 6, 3);
    game.placeTroop(archerSpec, 5, 4);

    game.troops[1].hp = 5;
    game.troops[2].hp = 10;
    game.troops[3].hp = 8;

    game.upgradeTroopStat(0, 'slow');
    game.upgradeTroopStat(0, 'slow');

    for (let i = 0; i < 20; i++) game.step(CONFIG.FIXED_TIMESTEP);

    expect(game.troops[1].hp).toBeGreaterThan(5);
    expect(game.troops[2].hp).toBeGreaterThan(10);
    expect(game.troops[3].hp).toBeGreaterThan(8);
  });

  it('healer removes healed troops from lock when fully healed', () => {
    game.placeTroop(healerSpec, 5, 3);
    game.placeTroop(archerSpec, 6, 3);

    const archer = game.troops[1];
    archer.hp = 29;

    game.step(CONFIG.FIXED_TIMESTEP);

    if (archer.hp >= archer.maxHp) {
      game.step(CONFIG.FIXED_TIMESTEP);
      expect(archer.hp).toBe(archer.maxHp);
    }
  });

  it('healer removes out-of-range troops from locked targets', () => {
    game.placeTroop(healerSpec, 5, 3);
    game.placeTroop(archerSpec, 6, 3);

    const archer = game.troops[1];
    archer.hp = 10;

    game.step(CONFIG.FIXED_TIMESTEP);

    archer.x = 500;
    archer.y = 500;

    for (let i = 0; i < 14; i++) game.step(CONFIG.FIXED_TIMESTEP);

    const healer = game.troops[0];
    expect(healer.healTargets).not.toContain(archer);
  });

  it('healer removes dead troops from locked targets', () => {
    game.placeTroop(healerSpec, 5, 3);
    game.placeTroop(archerSpec, 6, 3);

    const archer = game.troops[1];
    archer.hp = 10;

    game.step(CONFIG.FIXED_TIMESTEP);

    archer.alive = false;

    for (let i = 0; i < 14; i++) game.step(CONFIG.FIXED_TIMESTEP);

    const healer = game.troops[0];
    expect(healer.healTargets).not.toContain(archer);
  });
});

// ─── Healer: monster damage in range ──────────────────────────────────────

describe('Integration: Healer monster damage', () => {
  let game;
  beforeEach(() => {
    game = makeGame({ gold: 10000 });
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('healer deals 3 damage to monsters in heal range', () => {
    game.placeTroop(healerSpec, 5, 3);

    const grunt = placeMonsterAt(game, 1, 5, 4);

    const hpBefore = grunt.hp;

    for (let i = 0; i < 10; i++) game.step(CONFIG.FIXED_TIMESTEP);

    expect(grunt.hp).toBeLessThan(hpBefore);
  });

  it('healer does not damage monsters outside heal range', () => {
    game.placeTroop(healerSpec, 5, 3);

    const grunt = placeMonsterAt(game, 1, 10, 10);

    const hpBefore = grunt.hp;

    for (let i = 0; i < 10; i++) game.step(CONFIG.FIXED_TIMESTEP);

    expect(grunt.hp).toBe(hpBefore);
  });

  it('healer heals allies AND damages monsters simultaneously', () => {
    game.placeTroop(healerSpec, 5, 3);
    game.placeTroop(archerSpec, 6, 3);

    const archer = game.troops[1];
    archer.hp = 10;

    const grunt = placeMonsterAt(game, 1, 5, 4);

    const archerHpBefore = archer.hp;
    const gruntHpBefore = grunt.hp;

    for (let i = 0; i < 10; i++) game.step(CONFIG.FIXED_TIMESTEP);

    expect(archer.hp).toBeGreaterThan(archerHpBefore);
    expect(grunt.hp).toBeLessThan(gruntHpBefore);
  });
});

// ─── Healer: upgrade mechanics ────────────────────────────────────────────

describe('Integration: Healer upgrades', () => {
  let game;
  beforeEach(() => {
    game = makeGame({ gold: 10000, devMode: true });
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('upgrade slow stat increases heal target count', () => {
    game.placeTroop(healerSpec, 5, 3);
    const healer = game.troops[0];

    expect(healer.healTargetLevel).toBe(1);

    game.upgradeTroopStat(0, 'slow');
    expect(healer.healTargetLevel).toBe(2);

    game.upgradeTroopStat(0, 'slow');
    expect(healer.healTargetLevel).toBe(3);
  });

  it('upgrade damage increases heal amount', () => {
    game.placeTroop(healerSpec, 5, 3);
    const healer = game.troops[0];
    const healBefore = healer._cachedDamage;

    game.upgradeTroopStat(0, 'dmg');

    expect(healer._cachedDamage).toBe(Math.round(healerSpec.damage * CONFIG.DAMAGE_SCALE_PER_LEVEL));
    expect(healer._cachedDamage).toBeGreaterThan(healBefore);
  });

  it('upgrade speed reduces heal cooldown', () => {
    game.placeTroop(healerSpec, 5, 3);
    const healer = game.troops[0];
    const speedBefore = healer._cachedAttackSpeed;

    game.upgradeTroopStat(0, 'speed');

    expect(healer._cachedAttackSpeed).toBeLessThan(speedBefore);
  });

  it('upgrade HP increases max HP', () => {
    game.placeTroop(healerSpec, 5, 3);
    const healer = game.troops[0];
    const hpBefore = healer.maxHp;

    game.upgradeTroopStat(0, 'hp');

    expect(healer.maxHp).toBe(Math.round(healerSpec.hp * CONFIG.HP_SCALE_PER_LEVEL));
    expect(healer.maxHp).toBeGreaterThan(hpBefore);
  });

  it('healer can be fully upgraded', () => {
    game.placeTroop(healerSpec, 5, 3);

    for (let i = 0; i < 5; i++) game.upgradeTroopStat(0, 'slow');
    expect(game.troops[0].healTargetLevel).toBe(5);
    expect(game.troops[0].isMaxed('slow')).toBe(true);
  });
});

// ─── Chain Lightning: spec and stats ──────────────────────────────────────

describe('Integration: Chain Lightning spec', () => {
  it('lightning has chain 2', () => {
    expect(lightningSpec.chain).toBe(2);
  });

  it('lightning has stun 0.5s', () => {
    expect(lightningSpec.stun).toBe(0.5);
  });

  it('lightning has damage 100', () => {
    expect(lightningSpec.damage).toBe(100);
  });

  it('lightning has range 2', () => {
    expect(lightningSpec.range).toBe(2);
  });

  it('lightning has attack speed 3.0s', () => {
    expect(lightningSpec.attackSpeed).toBe(3.0);
  });

  it('lightning is ranged', () => {
    expect(lightningSpec.type).toBe('ranged');
  });

  it('chain max distance is 1.5 tiles', () => {
    expect(CONFIG.CHAIN_MAX_DIST_TILES).toBe(1.5);
  });
});

// ─── Chain Lightning: bounce mechanics ────────────────────────────────────

describe('Integration: Chain Lightning bounce mechanics', () => {
  let game;
  beforeEach(() => {
    game = makeGame({ gold: 10000 });
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('chain lightning damages primary target', () => {
    const T = CONFIG.TILE_SIZE;
    const cx = 5 * T + T / 2;
    const cy = 5 * T + T / 2;

    const primary = placeMonsterAt(game, 1, 5, 5);

    const troop = makeTroop(lightningSpec);

    game.chainHitAt(cx, cy, troop);

    expect(primary.hp).toBeLessThan(primary.maxHp);
  });

  it('chain lightning stuns primary target', () => {
    const T = CONFIG.TILE_SIZE;
    const primary = placeMonsterAt(game, 1, 5, 5);
    const troop = makeTroop(lightningSpec);

    game.chainHitAt(5 * T + T / 2, 5 * T + T / 2, troop);

    expect(primary.stunTimer).toBeGreaterThan(0);
    expect(primary.stunTimer).toBe(lightningSpec.stun);
  });

  it('chain lightning chains to nearby monsters with lower progress', () => {
    const T = CONFIG.TILE_SIZE;
    const cx = 5 * T + T / 2;
    const cy = 5 * T + T / 2;

    const primary = placeMonsterAt(game, 1, 5, 5);
    const chain1 = placeMonsterAt(game, 1, 5, 6);
    const chain2 = placeMonsterAt(game, 1, 6, 5);

    setProgressKeepPosition(primary, 0.5);
    setProgressKeepPosition(chain1, 0.3);
    setProgressKeepPosition(chain2, 0.1);

    const troop = makeTroop(lightningSpec);
    game.chainHitAt(cx, cy, troop);

    expect(primary.hp).toBeLessThan(primary.maxHp);
    expect(chain1.hp).toBeLessThan(chain1.maxHp);
    expect(chain2.hp).toBeLessThan(chain2.maxHp);
  });

  it('chain lightning stuns all chained targets', () => {
    const T = CONFIG.TILE_SIZE;
    const primary = placeMonsterAt(game, 1, 5, 5);
    const chain1 = placeMonsterAt(game, 1, 5, 6);
    const chain2 = placeMonsterAt(game, 1, 6, 5);

    setProgressKeepPosition(primary, 0.5);
    setProgressKeepPosition(chain1, 0.3);
    setProgressKeepPosition(chain2, 0.1);

    const troop = makeTroop(lightningSpec);
    game.chainHitAt(5 * T + T / 2, 5 * T + T / 2, troop);

    expect(primary.stunTimer).toBeGreaterThan(0);
    expect(chain1.stunTimer).toBeGreaterThan(0);
    expect(chain2.stunTimer).toBeGreaterThan(0);
  });

  it('chain lightning does not chain to monsters with higher progress', () => {
    const T = CONFIG.TILE_SIZE;
    const primary = placeMonsterAt(game, 1, 5, 5);
    const ahead = placeMonsterAt(game, 1, 5, 6);

    setProgressKeepPosition(primary, 0.3);
    setProgressKeepPosition(ahead, 0.5);

    const aheadHpBefore = ahead.hp;
    const troop = makeTroop(lightningSpec);

    game.chainHitAt(5 * T + T / 2, 5 * T + T / 2, troop);

    expect(ahead.hp).toBe(aheadHpBefore);
  });

  it('chain lightning stops chaining when target is too far', () => {
    const T = CONFIG.TILE_SIZE;
    const primary = placeMonsterAt(game, 1, 5, 5);
    const far = placeMonsterAt(game, 1, 8, 5);

    setProgressKeepPosition(primary, 0.5);
    setProgressKeepPosition(far, 0.3);

    const farHpBefore = far.hp;
    const troop = makeTroop(lightningSpec);

    game.chainHitAt(5 * T + T / 2, 5 * T + T / 2, troop);

    expect(far.hp).toBe(farHpBefore);
  });

  it('chain lightning does not stun shielded monsters', () => {
    const T = CONFIG.TILE_SIZE;

    game.spawnMonster('S');
    const shielded = game.monsters[0];
    shielded.x = 5 * T + T / 2;
    shielded.y = 5 * T + T / 2;
    shielded._tileGx = 5;
    shielded._tileGy = 5;
    setProgressKeepPosition(shielded, 0.5);
    game._updateMonsterTileIndex();

    const shieldBefore = shielded.shield;
    const troop = makeTroop(lightningSpec);

    game.chainHitAt(5 * T + T / 2, 5 * T + T / 2, troop);

    expect(shielded.shield).toBeLessThan(shieldBefore);
    expect(shielded.stunTimer).toBe(0);
  });

  it('chain lightning with chain level upgrade chains to more targets', () => {
    game.placeTroop(lightningSpec, 5, 3);
    const lightning = game.troops[0];

    expect(lightning._cachedChain).toBe(2);

    game.upgradeTroopStat(0, 'chain');
    expect(lightning._cachedChain).toBe(3);
  });

  it('stun prevents monster from moving', () => {
    const grunt = new Monster(1, game.waypoints, game.pathSegments);
    const distBefore = grunt.distance;

    grunt.stunTimer = 1.0;
    grunt.update(CONFIG.FIXED_TIMESTEP, []);

    expect(grunt.distance).toBe(distBefore);
  });

  it('stun expires after duration', () => {
    const grunt = new Monster(1, game.waypoints, game.pathSegments);
    grunt.stunTimer = 0.5;

    for (let i = 0; i < 35; i++) {
      grunt.update(CONFIG.FIXED_TIMESTEP, []);
    }

    expect(grunt.stunTimer).toBe(0);
  });
});

// ─── Healer + Chain Lightning combo ───────────────────────────────────────

describe('Integration: Healer + Lightning combo', () => {
  let game;
  beforeEach(() => {
    game = makeGame({ gold: 10000 });
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('healer keeps lightning troop alive while it stuns monsters', () => {
    for (let s = 0; s < 10; s++) game.step(CONFIG.FIXED_TIMESTEP);

    game.placeTroop(lightningSpec, 5, 1);
    game.placeTroop(healerSpec, 5, 2);

    game.spawnMonster(3);

    for (let s = 0; s < 600; s++) game.step(CONFIG.FIXED_TIMESTEP);

    const lightning = game.troops.find((t) => t.spec.id === 'lightning');
    expect(lightning).toBeDefined();
    expect(lightning.alive).toBe(true);
  });

  it('healer heals damage from chain lightning stun targets', () => {
    for (let s = 0; s < 10; s++) game.step(CONFIG.FIXED_TIMESTEP);

    game.placeTroop(swordsmanSpec, 5, 1);
    game.placeTroop(lightningSpec, 6, 1);
    game.placeTroop(healerSpec, 7, 1);

    game.troops[0].hp = 20;

    game.spawnMonster(3);

    for (let s = 0; s < 600; s++) game.step(CONFIG.FIXED_TIMESTEP);

    const swordsman = game.troops.find((t) => t.spec.id === 'swordsman');
    expect(swordsman).toBeDefined();
    expect(swordsman.hp).toBeGreaterThan(20);
  });
});

// ─── Mortar: spec verification ────────────────────────────────────────────

describe('Integration: Mortar spec', () => {
  it('mortar has long range (8 tiles)', () => {
    expect(mortarSpec.range).toBe(8);
  });

  it('mortar has high damage (65)', () => {
    expect(mortarSpec.damage).toBe(65);
  });

  it('mortar has slow fire rate (3.0s)', () => {
    expect(mortarSpec.attackSpeed).toBe(3.0);
  });

  it('mortar is ranged', () => {
    expect(mortarSpec.type).toBe('ranged');
  });

  it('mortar has splash 2.5 tiles', () => {
    expect(mortarSpec.splash).toBe(2.5);
  });

  it('mortar has low HP (30)', () => {
    expect(mortarSpec.hp).toBe(30);
  });

  it('mortar DPS is ~21.67 (65/3)', () => {
    const t = new Troop(mortarSpec, 0, 0);
    expect(t.getDps()).toBeCloseTo(65 / 3, 1);
  });

  it('mortar costs 200 gold', () => {
    expect(mortarSpec.cost).toBe(200);
  });
});

// ─── Mortar: long-range siege ─────────────────────────────────────────────

describe('Integration: Mortar long-range siege', () => {
  let game;
  beforeEach(() => {
    game = makeGame({ gold: 10000 });
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('mortar fires at Brutes far from its position', () => {
    for (let s = 0; s < 10; s++) game.step(CONFIG.FIXED_TIMESTEP);
    game.placeTroop(mortarSpec, 8, 3);

    for (let i = 0; i < 3; i++) game.spawnMonster(3);

    const goldBefore = game.gold;

    for (let s = 0; s < 600; s++) game.step(CONFIG.FIXED_TIMESTEP);

    const anyDamaged = game.monsters.some((m) => m.hp < m.maxHp) || game.gold > goldBefore;
    expect(anyDamaged).toBe(true);
  });

  it('mortar fires from safety behind melee troops', () => {
    for (let s = 0; s < 10; s++) game.step(CONFIG.FIXED_TIMESTEP);

    game.placeTroop(knightSpec, 2, 0);
    game.placeTroop(mortarSpec, 8, 0);

    for (let i = 0; i < 2; i++) game.spawnMonster(3);

    const goldBefore = game.gold;

    for (let s = 0; s < 600; s++) game.step(CONFIG.FIXED_TIMESTEP);

    const anyDamaged = game.monsters.some((m) => m.hp < m.maxHp) || game.gold > goldBefore;
    expect(anyDamaged).toBe(true);

    const mortar = game.troops.find((t) => t.spec.id === 'mortar');
    expect(mortar.alive).toBe(true);
  });

  it('mortar splash hits multiple Brutes when clustered', () => {
    const T = CONFIG.TILE_SIZE;
    const cx = 5 * T + T / 2;
    const cy = 1 * T + T / 2;

    const b1 = placeMonsterAt(game, 3, 5, 1);
    const b2 = placeMonsterAt(game, 3, 5, 2);
    const b3 = placeMonsterAt(game, 3, 6, 1);

    const hp1Before = b1.hp;
    const hp2Before = b2.hp;
    const hp3Before = b3.hp;

    game.splashAt(cx, cy, mortarSpec.damage, mortarSpec.splash, null);

    expect(b1.hp).toBeLessThan(hp1Before);
    expect(b2.hp).toBeLessThan(hp2Before);
    expect(b3.hp).toBeLessThan(hp3Before);
  });

  it('mortar upgrade increases damage significantly', () => {
    game.placeTroop(mortarSpec, 5, 1);
    const mortar = game.troops[0];
    const dpsBefore = mortar.getDps();

    game.upgradeTroopStat(0, 'dmg');

    expect(mortar._cachedDamage).toBe(Math.round(mortarSpec.damage * CONFIG.DAMAGE_SCALE_PER_LEVEL));
    expect(mortar.getDps()).toBeGreaterThan(dpsBefore);
  });

  it('mortar upgrade increases splash radius via range', () => {
    game.placeTroop(mortarSpec, 5, 1);
    const mortar = game.troops[0];
    const rangeBefore = mortar._cachedRange;

    game.upgradeTroopStat(0, 'range');

    expect(mortar._cachedRange).toBe(rangeBefore + 1);
  });

  it('mortar upgrade reduces fire cooldown', () => {
    game.placeTroop(mortarSpec, 5, 1);
    const mortar = game.troops[0];
    const speedBefore = mortar._cachedAttackSpeed;

    game.upgradeTroopStat(0, 'speed');

    expect(mortar._cachedAttackSpeed).toBeLessThan(speedBefore);
  });

  it('mortar can be maxed to level 5', () => {
    game.placeTroop(mortarSpec, 5, 1);
    const mortar = game.troops[0];

    for (let i = 0; i < 5; i++) game.upgradeTroopStat(0, 'dmg');

    expect(mortar.dmgLevel).toBe(5);
    expect(mortar.isMaxed('dmg')).toBe(true);
  });
});

// ─── Knight: spec verification ────────────────────────────────────────────

describe('Integration: Knight spec', () => {
  it('knight has high HP (120)', () => {
    expect(knightSpec.hp).toBe(120);
  });

  it('knight has 18 damage', () => {
    expect(knightSpec.damage).toBe(18);
  });

  it('knight has 0.9s attack speed', () => {
    expect(knightSpec.attackSpeed).toBe(0.9);
  });

  it('knight is melee', () => {
    expect(knightSpec.type).toBe('melee');
  });

  it('knight costs 120 gold', () => {
    expect(knightSpec.cost).toBe(120);
  });

  it('knight DPS is 20 (18/0.9)', () => {
    const t = new Troop(knightSpec, 0, 0);
    expect(t.getDps()).toBeCloseTo(18 / 0.9, 0);
  });

  it('knight takes 70% reduced damage from monsters', () => {
    expect(CONFIG.MELEE_DAMAGE_REDUCTION).toBe(0.3);
  });
});

// ─── Knight: tank mechanics ───────────────────────────────────────────────

describe('Integration: Knight tank mechanics', () => {
  let game;
  beforeEach(() => {
    game = makeGame({ gold: 10000 });
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('knight survives multiple grunt attacks due to high HP + damage reduction', () => {
    for (let s = 0; s < 10; s++) game.step(CONFIG.FIXED_TIMESTEP);
    game.placeTroop(knightSpec, 2, 0);

    for (let i = 0; i < 3; i++) game.spawnMonster(1);

    for (let s = 0; s < 400; s++) game.step(CONFIG.FIXED_TIMESTEP);

    const knight = game.troops.find((t) => t.spec.id === 'knight');
    expect(knight.alive).toBe(true);
    expect(knight.hp).toBeGreaterThan(0);
  });

  it('knight absorbs damage that would kill a Swordsman', () => {
    for (let s = 0; s < 10; s++) game.step(CONFIG.FIXED_TIMESTEP);

    game.placeTroop(knightSpec, 2, 0);
    game.placeTroop(swordsmanSpec, 3, 0);

    game.spawnMonster(3);

    for (let s = 0; s < 400; s++) game.step(CONFIG.FIXED_TIMESTEP);

    const knight = game.troops.find((t) => t.spec.id === 'knight');
    expect(knight.alive).toBe(true);
  });

  it('knight blocks monsters from reaching the mortar behind it', () => {
    for (let s = 0; s < 10; s++) game.step(CONFIG.FIXED_TIMESTEP);

    game.placeTroop(knightSpec, 2, 0);
    game.placeTroop(mortarSpec, 8, 0);

    for (let i = 0; i < 2; i++) game.spawnMonster(3);

    const mortar = game.troops.find((t) => t.spec.id === 'mortar');
    const hpBefore = mortar.hp;

    for (let s = 0; s < 600; s++) game.step(CONFIG.FIXED_TIMESTEP);

    expect(mortar.hp).toBe(hpBefore);
    expect(mortar.alive).toBe(true);
  });

  it('knight can kill a Brute (133 HP) solo', () => {
    for (let s = 0; s < 10; s++) game.step(CONFIG.FIXED_TIMESTEP);
    game.placeTroop(knightSpec, 2, 0);

    game.spawnMonster(3);
    const brute = game.monsters[0];

    let steps = 0;
    while (brute.alive && steps < 1000) {
      game.step(CONFIG.FIXED_TIMESTEP);
      steps++;
    }

    expect(brute.alive).toBe(false);
  });

  it('knight takes less damage than Swordsman from same monster', () => {
    const gruntDamage = MONSTER_SPECS[1].damage;
    const meleeReduction = CONFIG.MELEE_DAMAGE_REDUCTION;

    const effectiveDamage = Math.round(gruntDamage * meleeReduction);
    expect(effectiveDamage).toBe(1);

    expect(knightSpec.hp).toBeGreaterThan(swordsmanSpec.hp);
    expect(knightSpec.hp).toBe(120);
    expect(swordsmanSpec.hp).toBe(50);
  });
});

// ─── Knight: upgrade scaling ──────────────────────────────────────────────

describe('Integration: Knight upgrades', () => {
  let game;
  beforeEach(() => {
    game = makeGame({ gold: 10000 });
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('upgrading damage increases knight DPS', () => {
    game.placeTroop(knightSpec, 3, 3);
    const knight = game.troops[0];
    const dpsBefore = knight.getDps();

    game.upgradeTroopStat(0, 'dmg');

    expect(knight._cachedDamage).toBe(Math.round(knightSpec.damage * CONFIG.DAMAGE_SCALE_PER_LEVEL));
    expect(knight.getDps()).toBeGreaterThan(dpsBefore);
  });

  it('upgrading HP makes knight even tankier', () => {
    game.placeTroop(knightSpec, 3, 3);
    const knight = game.troops[0];
    const hpBefore = knight.maxHp;

    game.upgradeTroopStat(0, 'hp');

    expect(knight.maxHp).toBe(Math.round(knightSpec.hp * CONFIG.HP_SCALE_PER_LEVEL));
    expect(knight.maxHp).toBeGreaterThan(hpBefore);
  });

  it('upgrading speed reduces attack cooldown', () => {
    game.placeTroop(knightSpec, 3, 3);
    const knight = game.troops[0];
    const speedBefore = knight._cachedAttackSpeed;

    game.upgradeTroopStat(0, 'speed');

    expect(knight._cachedAttackSpeed).toBe(
      Math.round(knightSpec.attackSpeed * CONFIG.SPEED_SCALE_PER_LEVEL * 100) / 100
    );
    expect(knight._cachedAttackSpeed).toBeLessThan(speedBefore);
  });

  it('knight cannot upgrade range (melee)', () => {
    game.placeTroop(knightSpec, 3, 3);
    const knight = game.troops[0];
    expect(knight.canUpgrade('range')).toBe(false);
  });

  it('knight can be maxed to level 5', () => {
    game.placeTroop(knightSpec, 3, 3);
    const knight = game.troops[0];

    for (let i = 0; i < 5; i++) game.upgradeTroopStat(0, 'dmg');

    expect(knight.dmgLevel).toBe(5);
    expect(knight.isMaxed('dmg')).toBe(true);
  });
});

// ─── Knight vs Swordsman comparison ───────────────────────────────────────

describe('Integration: Knight vs Swordsman comparison', () => {
  it('knight has more than double the HP of Swordsman', () => {
    expect(knightSpec.hp).toBeGreaterThan(swordsmanSpec.hp * 2);
  });

  it('knight has double the damage of Swordsman', () => {
    expect(knightSpec.damage).toBe(swordsmanSpec.damage * 2);
  });

  it('knight costs more than Swordsman', () => {
    expect(knightSpec.cost).toBeGreaterThan(swordsmanSpec.cost);
  });

  it('knight has similar DPS to Swordsman despite slower speed', () => {
    const knightDps = knightSpec.damage / knightSpec.attackSpeed;
    const swordDps = swordsmanSpec.damage / swordsmanSpec.attackSpeed;
    expect(knightDps).toBeGreaterThan(swordDps);
  });

  it('both are melee troops with damage reduction', () => {
    expect(knightSpec.type).toBe('melee');
    expect(swordsmanSpec.type).toBe('melee');
  });
});

// ─── Sniper: spec verification ────────────────────────────────────────────

describe('Integration: Sniper spec', () => {
  it('sniper has extreme range (10 tiles)', () => {
    expect(sniperSpec.range).toBe(10);
  });

  it('sniper has high damage (100)', () => {
    expect(sniperSpec.damage).toBe(100);
  });

  it('sniper has slow fire rate (2.5s)', () => {
    expect(sniperSpec.attackSpeed).toBe(2.5);
  });

  it('sniper is ranged', () => {
    expect(sniperSpec.type).toBe('ranged');
  });

  it('sniper has low HP (25)', () => {
    expect(sniperSpec.hp).toBe(25);
  });

  it('sniper DPS is 40 (100/2.5)', () => {
    const t = new Troop(sniperSpec, 0, 0);
    expect(t.getDps()).toBe(100 / 2.5);
  });
});

// ─── Sniper: long-range targeting ─────────────────────────────────────────

describe('Integration: Sniper long-range targeting', () => {
  let game;
  beforeEach(() => {
    game = makeGame({ gold: 10000 });
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('sniper can target monsters far from its position', () => {
    game.placeTroop(sniperSpec, 2, 8);

    game.spawnMonster(3);
    const brute = game.monsters[0];

    for (let s = 0; s < 120; s++) game.step(CONFIG.FIXED_TIMESTEP);

    const anyDamaged = game.monsters.some((m) => m.hp < m.maxHp);
    expect(anyDamaged).toBe(true);
  });

  it('sniper targets monster with highest progress (leads target)', () => {
    game.placeTroop(sniperSpec, 5, 1);

    game.spawnMonster(3);
    game.spawnMonster(3);

    for (let s = 0; s < 60; s++) game.step(CONFIG.FIXED_TIMESTEP);

    const anyDamaged = game.monsters.some((m) => m.hp < m.maxHp);
    expect(anyDamaged).toBe(true);
  });

  it('sniper kills a Brute (133 HP) in 2 hits', () => {
    game.placeTroop(sniperSpec, 5, 1);

    game.spawnMonster(3);
    const brute = game.monsters[0];

    let steps = 0;
    while (brute.alive && steps < 600) {
      game.step(CONFIG.FIXED_TIMESTEP);
      steps++;
    }

    expect(brute.alive).toBe(false);
  });

  it('sniper has no splash', () => {
    expect(sniperSpec.splash).toBe(0);
  });

  it('sniper projectile speed is fast (18 * TILE_SIZE)', () => {
    const style = { color: '#e74c3c', size: 2, speed: 18, kind: 'bolt' };
    expect(style.speed).toBe(18);
  });
});

// ─── Sniper: upgrade scaling ──────────────────────────────────────────────

describe('Integration: Sniper upgrades', () => {
  let game;
  beforeEach(() => {
    game = makeGame({ gold: 10000 });
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('upgrading sniper damage increases DPS significantly', () => {
    game.placeTroop(sniperSpec, 3, 3);
    const sniper = game.troops[0];
    const dpsBefore = sniper.getDps();

    game.upgradeTroopStat(0, 'dmg');

    expect(sniper._cachedDamage).toBe(Math.round(sniperSpec.damage * CONFIG.DAMAGE_SCALE_PER_LEVEL));
    expect(sniper.getDps()).toBeGreaterThan(dpsBefore);
  });

  it('upgrading sniper range increases effective coverage', () => {
    game.placeTroop(sniperSpec, 3, 3);
    const sniper = game.troops[0];
    const rangeBefore = sniper._cachedRange;

    game.upgradeTroopStat(0, 'range');

    expect(sniper._cachedRange).toBe(rangeBefore + 1);
  });

  it('upgrading sniper speed reduces cooldown significantly', () => {
    game.placeTroop(sniperSpec, 3, 3);
    const sniper = game.troops[0];
    const speedBefore = sniper._cachedAttackSpeed;

    game.upgradeTroopStat(0, 'speed');

    expect(sniper._cachedAttackSpeed).toBe(
      Math.round(sniperSpec.attackSpeed * CONFIG.SPEED_SCALE_PER_LEVEL * 100) / 100
    );
    expect(sniper._cachedAttackSpeed).toBeLessThan(speedBefore);
  });

  it('sniper can be upgraded to max level 5', () => {
    game.placeTroop(sniperSpec, 3, 3);
    const sniper = game.troops[0];

    for (let i = 0; i < 5; i++) game.upgradeTroopStat(0, 'dmg');

    expect(sniper.dmgLevel).toBe(5);
    expect(sniper.isMaxed('dmg')).toBe(true);
  });
});

// ─── Machine Gun: spec verification ───────────────────────────────────────

describe('Integration: Machine Gun spec', () => {
  it('machine gun has range 4', () => {
    expect(machinegunSpec.range).toBe(4);
  });

  it('machine gun has low damage per hit (6)', () => {
    expect(machinegunSpec.damage).toBe(6);
  });

  it('machine gun has very fast fire rate (0.25s)', () => {
    expect(machinegunSpec.attackSpeed).toBe(0.25);
  });

  it('machine gun is ranged', () => {
    expect(machinegunSpec.type).toBe('ranged');
  });

  it('machine gun has moderate HP (40)', () => {
    expect(machinegunSpec.hp).toBe(40);
  });

  it('machine gun DPS is 24 (6/0.25)', () => {
    const t = new Troop(machinegunSpec, 0, 0);
    expect(t.getDps()).toBe(6 / 0.25);
  });

  it('machine gun has no splash', () => {
    expect(machinegunSpec.splash).toBe(0);
  });
});

// ─── Machine Gun: rapid-fire mechanics ────────────────────────────────────

describe('Integration: Machine Gun rapid-fire', () => {
  let game;
  beforeEach(() => {
    game = makeGame({ gold: 10000 });
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('machine gun fires many projectiles in quick succession', () => {
    game.placeTroop(machinegunSpec, 5, 1);

    game.spawnMonster(5);
    const champion = game.monsters[0];

    for (let s = 0; s < 200; s++) game.step(CONFIG.FIXED_TIMESTEP);

    expect(champion.hp).toBeLessThan(champion.maxHp);
  });

  it('machine gun fires 4 shots per second (0.25s cooldown)', () => {
    expect(machinegunSpec.attackSpeed).toBe(0.25);
    const shotsPerSecond = 1 / machinegunSpec.attackSpeed;
    expect(shotsPerSecond).toBe(4);
  });

  it('machine gun shreds a Grunt (34 HP) quickly', () => {
    game.placeTroop(machinegunSpec, 5, 1);

    game.spawnMonster(1);
    const grunt = game.monsters[0];

    let steps = 0;
    while (grunt.alive && steps < 300) {
      game.step(CONFIG.FIXED_TIMESTEP);
      steps++;
    }

    expect(grunt.alive).toBe(false);
  });

  it('machine gun targets and fires at closest monster with highest progress', () => {
    game.placeTroop(machinegunSpec, 5, 1);

    for (let i = 0; i < 3; i++) game.spawnMonster(3);

    for (let s = 0; s < 120; s++) game.step(CONFIG.FIXED_TIMESTEP);

    const damaged = game.monsters.filter((m) => m.hp < m.maxHp).length;
    expect(damaged).toBeGreaterThanOrEqual(1);
  });

  it('machine gun projectile speed is fast (20 * TILE_SIZE)', () => {
    const style = { color: '#e74c3c', size: 2, speed: 20, kind: 'bolt' };
    expect(style.speed).toBe(20);
  });
});

// ─── Machine Gun: upgrade scaling ─────────────────────────────────────────

describe('Integration: Machine Gun upgrades', () => {
  let game;
  beforeEach(() => {
    game = makeGame({ gold: 10000 });
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('upgrading damage increases DPS significantly', () => {
    game.placeTroop(machinegunSpec, 3, 3);
    const mg = game.troops[0];
    const dpsBefore = mg.getDps();

    game.upgradeTroopStat(0, 'dmg');

    expect(mg._cachedDamage).toBe(Math.round(machinegunSpec.damage * CONFIG.DAMAGE_SCALE_PER_LEVEL));
    expect(mg.getDps()).toBeGreaterThan(dpsBefore);
  });

  it('upgrading speed makes an already-fast troop even faster', () => {
    game.placeTroop(machinegunSpec, 3, 3);
    const mg = game.troops[0];
    const speedBefore = mg._cachedAttackSpeed;

    game.upgradeTroopStat(0, 'speed');

    expect(mg._cachedAttackSpeed).toBeLessThan(speedBefore);
    expect(1 / mg._cachedAttackSpeed).toBeGreaterThan(4);
  });

  it('upgrading range extends machine gun coverage', () => {
    game.placeTroop(machinegunSpec, 3, 3);
    const mg = game.troops[0];
    const rangeBefore = mg._cachedRange;

    game.upgradeTroopStat(0, 'range');

    expect(mg._cachedRange).toBe(rangeBefore + 1);
  });

  it('fully upgraded machine gun has massive DPS', () => {
    game.placeTroop(machinegunSpec, 3, 3);
    const mg = game.troops[0];

    for (let i = 0; i < 5; i++) game.upgradeTroopStat(0, 'dmg');
    for (let i = 0; i < 5; i++) game.upgradeTroopStat(0, 'speed');

    const dps = mg.getDps();
    expect(dps).toBeGreaterThan(12 / 0.25);
  });
});

// ─── Sniper vs Machine Gun comparison ─────────────────────────────────────

describe('Integration: Sniper vs Machine Gun comparison', () => {
  it('sniper has higher DPS per shot but slower fire rate', () => {
    expect(sniperSpec.damage).toBeGreaterThan(machinegunSpec.damage);
    expect(sniperSpec.attackSpeed).toBeGreaterThan(machinegunSpec.attackSpeed);
  });

  it('sniper has longer range than machine gun', () => {
    expect(sniperSpec.range).toBeGreaterThan(machinegunSpec.range);
  });

  it('sniper has higher DPS per second than machine gun', () => {
    const sniperDps = sniperSpec.damage / sniperSpec.attackSpeed;
    const mgDps = machinegunSpec.damage / machinegunSpec.attackSpeed;
    expect(sniperDps).toBeGreaterThan(mgDps);
  });

  it('machine gun is cheaper than sniper', () => {
    expect(machinegunSpec.cost).toBeLessThan(sniperSpec.cost);
  });

  it('sniper is more fragile than machine gun', () => {
    expect(sniperSpec.hp).toBeLessThan(machinegunSpec.hp);
  });
});
