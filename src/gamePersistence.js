import { CONFIG, TROOP_SPECS } from './config.js';
import { Grid, TILE } from './grid.js';
import { generatePath } from './pathGenerator.js';
import { dist } from './utils.js';
import { WaveManager } from './waveManager.js';
import { Troop } from './troop.js';
import { RENDERER } from './rendering/renderer.js';
import { PARTICLES } from './particles.js';
import { UI } from './ui/index.js';

const TRANSIENT_ARRAY_KEYS = ['_projectilePool', '_splashHitBuf', '_chainBuf', '_tileIndexPool'];

function resetTransientBuffers(game) {
  for (const key of TRANSIENT_ARRAY_KEYS) {
    game[key] = [];
  }
}

function normalizeHealTargetLevel(value) {
  const level = Number.isInteger(value) ? value : 1;
  return Math.max(1, Math.min(CONFIG.MAX_UPGRADE_LEVEL, level));
}

function isFiniteNonNegative(value) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function isValidGridPosition(value) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value < CONFIG.GRID_SIZE;
}

function isValidHealTargetLevel(value) {
  return value == null || (Number.isInteger(value) && value >= 1 && value <= CONFIG.MAX_UPGRADE_LEVEL);
}

function isValidTroop(t) {
  if (!t || typeof t !== 'object') return false;
  if (typeof t.specId !== 'string') return false;
  if (!isValidGridPosition(t.gx) || !isValidGridPosition(t.gy)) return false;
  if (!isFiniteNonNegative(t.hp) || !isFiniteNonNegative(t.maxHp)) return false;
  if (!isFiniteNonNegative(t.shield) || !isFiniteNonNegative(t.maxShield)) return false;
  if (t.shield > t.maxShield) return false;
  if (!isFiniteNonNegative(t.healGoldSpent)) return false;
  return isValidHealTargetLevel(t.healTargetLevel);
}

// Persistence helpers: serialise save data, rebuild world geometry from a
// seed, and restore game state from a save.  Extracted from Game so that
// adding new persistent fields requires only one touch-point per operation.

export const SaveSerializer = {
  fromGame(game) {
    return {
      version: '1.6.0-beta.2',
      gold: game.gold === Infinity ? null : game.gold,
      lives: game.lives === Infinity ? null : game.lives,
      seed: game.seed,
      speed: game.speed,
      devMode: game.devMode,
      devMonsterCounts: { ...game.devMonsterCounts },
      wave: { currentWave: game.wave.currentWave },
      troops: game.troops
        .filter((t) => t.alive)
        .map((t) => ({
          specId: t.spec.id,
          gx: t.gx,
          gy: t.gy,
          hp: t.hp,
          maxHp: t.maxHp,
          dmgLevel: t.dmgLevel,
          rangeLevel: t.rangeLevel,
          speedLevel: t.speedLevel,
          chainLevel: t.chainLevel,
          hpLevel: t.hpLevel,
          slowLevel: t.slowLevel,
          shield: t.shield,
          maxShield: t.maxShield,
          healCount: t.healCount,
          healTargetLevel: t.healTargetLevel,
          healGoldSpent: t.healGoldSpent || 0,
        })),
    };
  },

  isValid(data) {
    if (!data || typeof data !== 'object') return false;
    if (typeof data.seed !== 'number') return false;
    if (data.speed != null && (typeof data.speed !== 'number' || data.speed <= 0)) return false;
    if (!Array.isArray(data.troops)) return false;
    const isDev = data.devMode === true;
    if (isDev && (data.gold !== null || data.lives !== null)) return false;
    if (!isDev && (!isFiniteNonNegative(data.gold) || !isFiniteNonNegative(data.lives))) return false;
    if (!data.wave || typeof data.wave.currentWave !== 'number') return false;
    if (!Number.isFinite(data.wave.currentWave) || data.wave.currentWave < 0) return false;
    return data.troops.every(isValidTroop);
  },
};

export const GameWorldFactory = {
  // Build grid + path geometry from a seed.  Returns an object ready to
  // be spread into game properties.
  createFresh(seed) {
    const grid = new Grid();
    const waypoints = generatePath(seed);
    const segments = [];
    let total = 0;
    const T = CONFIG.TILE_SIZE;
    for (let i = 1; i < waypoints.length; i++) {
      const [ax, ay] = waypoints[i - 1];
      const [bx, by] = waypoints[i];
      const axp = ax * T + T / 2,
        ayp = ay * T + T / 2;
      const bxp = bx * T + T / 2,
        byp = by * T + T / 2;
      const len = dist(axp, ayp, bxp, byp);
      total += len;
      segments.push({ ax: axp, ay: ayp, bx: bxp, by: byp, len, cumStart: total - len });
    }
    const pathSegments = { segments, totalLength: total };
    return { grid, waypoints, pathSegments };
  },
};

export const GameSnapshotRestorer = {
  // Apply a save onto an existing Game instance.  Rebuilds world geometry
  // and restores all persistent fields.
  apply(game, data) {
    const world = GameWorldFactory.createFresh(data.seed);

    game.speed = data.speed || 1;
    game.devMode = data.devMode || false;
    game.gold = data.gold == null ? (game.devMode ? Infinity : CONFIG.STARTING_GOLD) : data.gold;
    game.lives = data.lives == null ? (game.devMode ? Infinity : CONFIG.STARTING_LIVES) : data.lives;
    if (data.devMonsterCounts) {
      game.devMonsterCounts = { ...game._defaultDevCounts(), ...data.devMonsterCounts };
    }
    game.seed = data.seed;
    game.grid = world.grid;
    game.waypoints = world.waypoints;
    game.pathSegments = world.pathSegments;

    // Mark path tiles on grid and rebuild renderer cache.
    for (const [gx, gy] of game.waypoints) {
      game.grid.set(gx, gy, TILE.PATH);
    }
    RENDERER.markCacheDirty();
    RENDERER._rebuildCache(game.grid);

    // Reset entity collections and transient buffers.
    game.monsters = [];
    game.projectiles = [];
    game.popups = [];
    game._popupPool = [];
    resetTransientBuffers(game);
    game._monsterTileIndex = new Array(CONFIG.GRID_SIZE * CONFIG.GRID_SIZE);

    // Wave manager.
    game.wave = new WaveManager();
    game.wave.currentWave = data.wave.currentWave;
    game.wave.buildQueue();

    // Rebuild troops from save data.
    game.troops = [];
    for (const tData of data.troops) {
      const spec = TROOP_SPECS.find((s) => s.id === tData.specId);
      if (!spec) continue;
      const t = new Troop(spec, tData.gx, tData.gy);
      t.hpLevel = tData.hpLevel ?? 1;
      t.dmgLevel = tData.dmgLevel ?? 1;
      t.rangeLevel = tData.rangeLevel ?? 1;
      t.speedLevel = tData.speedLevel ?? 1;
      t.chainLevel = tData.chainLevel ?? 1;
      t.slowLevel = tData.slowLevel ?? 1;
      t.healTargetLevel = normalizeHealTargetLevel(tData.healTargetLevel);
      t._recomputeStats();
      t.maxHp = t._cachedMaxHp;
      t.hp = Math.min(tData.hp, t.maxHp);
      t.shield = tData.shield || 0;
      t.maxShield = tData.maxShield || 0;
      t.healCount = tData.healCount || 0;
      t.healGoldSpent = tData.healGoldSpent || 0;
      game.troops.push(t);
    }
    game._buildTroopTileIndex();
    game.state = 'PRE_WAVE';
    game._needsSaveCleanup = true;
  },

  // Reset a game to a fresh state (used by restart / reset).
  applyFresh(game, seed) {
    const world = GameWorldFactory.createFresh(seed);

    game.grid = world.grid;
    game.waypoints = world.waypoints;
    game.pathSegments = world.pathSegments;

    // Mark path tiles and rebuild cache.
    for (const [gx, gy] of game.waypoints) {
      game.grid.set(gx, gy, TILE.PATH);
    }
    RENDERER.markCacheDirty();
    RENDERER._rebuildCache(game.grid);

    // Reset all entity collections.
    game.monsters = [];
    game.troops = [];
    game.projectiles = [];
    game.popups = [];
    game._popupPool = [];
    game._monsterTileIndex = new Array(CONFIG.GRID_SIZE * CONFIG.GRID_SIZE);
    game._troopTileIndex = [];
    game._troopIndexByRef = new Map();
    for (let i = 0; i < CONFIG.GRID_SIZE * CONFIG.GRID_SIZE; i++) {
      game._troopTileIndex.push([]);
    }
    resetTransientBuffers(game);

    // Wave manager.
    game.wave = new WaveManager();
    game.waveCompleteAnim = { active: false, waveNum: 0 };

    PARTICLES.clear();
    UI.shopScrollY = 0;
  },
};
