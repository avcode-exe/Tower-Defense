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

/**
 * Save rotation manager.
 *
 * Manages auto-save slot rotation (3 slots with LRU eviction) and manual
 * named save slots.  Slot selection and metadata generation are platform-
 * agnostic; file I/O is handled by the Electron layer.
 */
export const SaveRotationManager = {
  AUTO_SAVE_COUNT: 3,
  AUTO_SAVE_PREFIX: 'autosave.',
  PREVIEW_WIDTH: 200,
  PREVIEW_HEIGHT: 150,

  /** Return auto-save slot identifiers ['autosave.0', 'autosave.1', 'autosave.2'] */
  autoSaveSlots() {
    return Array.from({ length: this.AUTO_SAVE_COUNT }, (_, i) => `${this.AUTO_SAVE_PREFIX}${i}`);
  },

  /**
   * Select which auto-save slot to write to, using LRU eviction.
   * Given an array of { slot, meta } objects for existing auto-saves,
   * returns the slot name of the oldest (least recently saved) slot,
   * or the first slot name if none exist yet.
   */
  selectSlotForWrite(existingSlots) {
    const slots = this.autoSaveSlots();
    if (!existingSlots || existingSlots.length === 0) return slots[0];
    // Only consider auto-save slots for LRU eviction; ignore manual/named slots
    const autoSaveEntries = existingSlots.filter((e) => e && e.slot && slots.includes(e.slot));
    if (autoSaveEntries.length === 0) return slots[0];
    // Pick the oldest auto-save slot based on timestamp
    let oldest = null;
    let oldestName = slots[0];
    for (const entry of autoSaveEntries) {
      const ts = entry.meta && entry.meta.timestamp ? entry.meta.timestamp : 0;
      if (oldest == null || ts < oldest) {
        oldest = ts;
        oldestName = entry.slot;
      }
    }
    return oldestName;
  },

  /**
   * Generate metadata from game state for a save entry.
   * Returns { timestamp, wave, gold, lives, version }.
   */
  makeMetaData(game) {
    return {
      timestamp: Date.now(),
      wave: game.wave ? game.wave.currentWave || 0 : 0,
      gold: game.gold === Infinity ? null : game.gold,
      lives: game.lives === Infinity ? null : game.lives,
      version: SaveMigrator.CURRENT_VERSION,
    };
  },

  /**
   * Extract metadata from a loaded save data object.
   * Reads the _meta field if present, falling back to top-level fields.
   */
  extractMeta(data) {
    if (!data || typeof data !== 'object') return null;
    if (data._meta && typeof data._meta === 'object') {
      return { ...data._meta };
    }
    return {
      timestamp: Date.now(), // best guess
      wave: data.wave ? data.wave.currentWave : 0,
      gold: data.gold,
      lives: data.lives,
      version: data.version || '0.0.0',
    };
  },

  /**
   * Build a display summary string from save metadata.
   * e.g., "Wave 5 — 1000g, 20 lives"
   */
  summarize(meta) {
    if (!meta) return 'Unknown save';
    const parts = [];
    if (meta.wave != null) parts.push(`Wave ${meta.wave}`);
    if (meta.gold != null) parts.push(`${meta.gold}g`);
    if (meta.lives != null) parts.push(`${meta.lives} lives`);
    if (meta.timestamp) {
      const d = new Date(meta.timestamp);
      parts.push(d.toLocaleString());
    }
    return parts.join(' — ');
  },
};

/**
 * Capture a canvas preview thumbnail (200x150 data URL) for save metadata.
 * Uses the main RENDERER canvas if available.  Returns null when running
 * in a non-browser environment (e.g. Node.js tests).
 */
export function captureSavePreview() {
  if (typeof document === 'undefined') return null;
  const canvas = RENDERER.canvas || (typeof document !== 'undefined' ? document.querySelector('canvas') : null);
  if (!canvas) return null;
  try {
    // Try to read from the actual canvas first
    let dataUrl;
    try {
      dataUrl = canvas.toDataURL('image/jpeg', 0.6);
    } catch (_) {
      // Canvas may be tainted from cross-origin images — fallback silently
      return null;
    }
    // Resize using an offscreen canvas
    const offscreen = document.createElement('canvas');
    offscreen.width = SaveRotationManager.PREVIEW_WIDTH;
    offscreen.height = SaveRotationManager.PREVIEW_HEIGHT;
    const ctx = offscreen.getContext('2d');
    if (!ctx) return null;
    // Draw the game canvas scaled down into the offscreen canvas
    ctx.drawImage(
      canvas,
      0,
      0,
      canvas.width,
      canvas.height,
      0,
      0,
      SaveRotationManager.PREVIEW_WIDTH,
      SaveRotationManager.PREVIEW_HEIGHT
    );
    return offscreen.toDataURL('image/jpeg', 0.5);
  } catch (_) {
    return null;
  }
}

/**
 * Save migration pipeline.
 *
 * Each migrator is a function that takes raw save data and returns updated
 * data.  Migrators are applied in order from oldest to newest.  A save with
 * no version field is treated as v0 (legacy).
 */
export const SaveMigrator = {
  CURRENT_VERSION: '1.7.1',

  migrate(data) {
    if (!data || typeof data !== 'object') return data;
    const version = data.version || '0.0.0';

    if (version === '0.0.0') {
      data = this._migrateV0(data);
    }
    // Migration chain: apply each version migrator in order
    if (compareVersions(version, '1.7.0') < 0) {
      data = this._migrateV1toV170(data);
    }
    // Future migrations keep the pattern:
    // if (compareVersions(version, '1.8.0') < 0) data = this._migrateV2toV180(data);

    // Always upgrade saved metadata to current format
    if (data._meta && typeof data._meta === 'object') {
      data._meta.version = this.CURRENT_VERSION;
    }

    data.version = this.CURRENT_VERSION;
    return data;
  },

  /**
   * Simple dotted-version comparator. Returns negative if a < b, positive if
   * a > b, 0 if equal.  Handles numeric segments and pre-release suffixes
   * (e.g. "1.7.0-beta.1" < "1.7.0").
   */
  compareVersions: compareVersions,

  // Legacy saves (pre-versioning): ensure all expected fields exist with
  // sensible defaults so the restorer can proceed safely.
  _migrateV0(data) {
    if (data.gold === undefined) data.gold = 0;
    if (data.lives === undefined) data.lives = 0;
    if (!data.wave) data.wave = { currentWave: 0 };
    if (!Array.isArray(data.troops)) data.troops = [];
    if (data.speed === undefined) data.speed = 1;
    if (data.devMode === undefined) data.devMode = false;
    return data;
  },

  // Migrate from any version < 1.7.0 to 1.7.0 format.
  // Adds the _meta metadata block, normalises troop structure.
  _migrateV1toV170(data) {
    // Add _meta metadata block if missing
    if (!data._meta) {
      data._meta = {
        timestamp: Date.now(),
        wave: data.wave ? data.wave.currentWave : 0,
        gold: data.gold,
        lives: data.lives,
        version: this.CURRENT_VERSION,
      };
    }
    // Ensure speed default
    if (data.speed === undefined || data.speed === null) data.speed = 1;
    // Ensure devMonsterCounts
    if (!data.devMonsterCounts) data.devMonsterCounts = {};
    // Ensure every troop has healTargetLevel
    if (Array.isArray(data.troops)) {
      for (const t of data.troops) {
        if (t.healTargetLevel == null) t.healTargetLevel = 1;
        if (t.healGoldSpent == null) t.healGoldSpent = 0;
        if (t.dmgLevel == null) t.dmgLevel = 1;
        if (t.rangeLevel == null) t.rangeLevel = 1;
        if (t.speedLevel == null) t.speedLevel = 1;
        if (t.chainLevel == null) t.chainLevel = 1;
        if (t.hpLevel == null) t.hpLevel = 1;
        if (t.slowLevel == null) t.slowLevel = 1;
        if (t.healCount == null) t.healCount = 0;
        if (t.shield == null) t.shield = 0;
        if (t.maxShield == null) t.maxShield = 0;
      }
    }
    return data;
  },
};

/**
 * Compare dotted version strings with optional pre-release suffixes.
 * Returns negative if a < b, positive if a > b, 0 if equal.
 * Pre-release versions have lower precedence than release (e.g. 1.7.0-beta < 1.7.0).
 */
function compareVersions(a, b) {
  if (a === b) return 0;

  const parseParts = (v) => {
    // Split off pre-release suffix (everything after first '-')
    const hyphenIdx = v.indexOf('-');
    const main = hyphenIdx >= 0 ? v.substring(0, hyphenIdx) : v;
    const pre = hyphenIdx >= 0 ? v.substring(hyphenIdx + 1) : null;
    return {
      nums: main.split('.').map((s) => {
        const n = parseInt(s, 10);
        return Number.isFinite(n) ? n : 0;
      }),
      isPre: pre !== null,
    };
  };

  const pa = parseParts(a);
  const pb = parseParts(b);

  // Compare numeric segments
  const maxLen = Math.max(pa.nums.length, pb.nums.length);
  for (let i = 0; i < maxLen; i++) {
    const na = i < pa.nums.length ? pa.nums[i] : 0;
    const nb = i < pb.nums.length ? pb.nums[i] : 0;
    if (na !== nb) return na - nb;
  }

  // Numeric parts equal — pre-release version has lower precedence
  if (pa.isPre && !pb.isPre) return -1;
  if (!pa.isPre && pb.isPre) return 1;
  return 0;
}

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
  fromGame(game, version, includePreview = false) {
    const data = {
      version: version || SaveMigrator.CURRENT_VERSION,
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
    // Attach metadata block
    data._meta = SaveRotationManager.makeMetaData(game);
    // Attach preview thumbnail if requested (skipped in tests/node)
    if (includePreview) {
      const preview = captureSavePreview();
      if (preview) data._meta.preview = preview;
    }
    return data;
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
    // Run migration pipeline to bring legacy saves up to current format.
    data = SaveMigrator.migrate(data);
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
    game.waveCompleteAnim = { active: false, waveNum: 0, duration: CONFIG.WAVE_TRANSITION_DURATION };

    game._onProjectileImpact = (proj) => game.applyProjectileImpact(proj);

    PARTICLES.clear();
    UI.shopScrollY = 0;
  },
};
