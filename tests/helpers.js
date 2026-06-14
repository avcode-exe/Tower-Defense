import { vi } from 'vitest';
import { Game } from '../src/game.js';
import { CONFIG, TROOP_SPECS } from '../src/config.js';
import { Grid, TILE } from '../src/grid.js';
import { Troop } from '../src/troop.js';
import { WaveManager } from '../src/waveManager.js';

// ─── Path data (shared across all integration tests) ──────────────────────

export const TEST_WAYPOINTS = [[0, 0], [5, 0], [5, 5], [10, 5], [10, 10], [15, 10]];

export const TEST_PATH_SEGMENTS = {
  segments: [
    { ax: 0, ay: 26.5, bx: 848, by: 26.5, len: 848, cumStart: 0 },
    { ax: 848, ay: 26.5, bx: 848, by: 291.5, len: 265, cumStart: 848 },
    { ax: 848, ay: 291.5, bx: 291.5, by: 291.5, len: 556.5, cumStart: 1113 },
    { ax: 291.5, ay: 291.5, bx: 291.5, by: 556.5, len: 265, cumStart: 1669.5 },
    { ax: 291.5, ay: 556.5, bx: 795, by: 556.5, len: 503.5, cumStart: 1934.5 },
  ],
  totalLength: 2438,
};

// ─── Helper: makeTileIndex ────────────────────────────────────────────────

export function makeTileIndex() {
  return Array.from({ length: CONFIG.GRID_SIZE * CONFIG.GRID_SIZE }, () => []);
}

// ─── Helper: makeGame ─────────────────────────────────────────────────────

/**
 * Create a minimal Game instance for integration tests.
 * Uses Object.create(Game.prototype) to avoid the real constructor.
 * Mocks (vi.mock) must be set up in each test file before calling this.
 */
export function makeGame({ devMode = false, gold = 100000 } = {}) {
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
  game.waypoints = TEST_WAYPOINTS;
  game.pathSegments = TEST_PATH_SEGMENTS;
  for (const [gx, gy] of game.waypoints) game.grid.set(gx, gy, TILE.PATH);
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
  game.wave.spawnIndex = game.wave.queue.length;
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

// ─── Helper: placeMonsterAt ───────────────────────────────────────────────

/**
 * Spawn a monster and position it at a specific tile with correct path distance.
 * Projects the position onto the closest path segment to compute the distance,
 * preventing the monster from teleporting back to distance=0 on the next step.
 */
export function placeMonsterAt(game, level, gx, gy) {
  game.spawnMonster(level);
  const m = game.monsters[game.monsters.length - 1];
  const T = CONFIG.TILE_SIZE;
  const px = gx * T + T / 2;
  const py = gy * T + T / 2;
  m.x = px;
  m.y = py;
  m._tileGx = gx;
  m._tileGy = gy;
  // Compute distance along path by projecting position onto closest segment
  let bestDist = Infinity;
  let bestDistance = 0;
  const segs = game.pathSegments.segments;
  for (let i = 0; i < segs.length; i++) {
    const seg = segs[i];
    const dx = seg.bx - seg.ax;
    const dy = seg.by - seg.ay;
    const lenSq = dx * dx + dy * dy;
    if (lenSq === 0) continue;
    const t = Math.max(0, Math.min(1, ((px - seg.ax) * dx + (py - seg.ay) * dy) / lenSq));
    const projX = seg.ax + t * dx;
    const projY = seg.ay + t * dy;
    const dSq = (px - projX) * (px - projX) + (py - projY) * (py - projY);
    if (dSq < bestDist) {
      bestDist = dSq;
      bestDistance = seg.cumStart + t * seg.len;
    }
  }
  m.distance = bestDistance;
  game._updateMonsterTileIndex();
  return m;
}

// ─── Helper: setProgressKeepPosition ──────────────────────────────────────

/**
 * Set monster progress (0..1) via distance, preserving x/y/tile position.
 * Useful for chain lightning tests where you need specific progress ordering
 * but monsters must stay at their placed positions for distance checks.
 */
export function setProgressKeepPosition(m, progress) {
  const x = m.x, y = m.y, gx = m._tileGx, gy = m._tileGy;
  m.distance = progress * m.totalLength;
  m.x = x; m.y = y; m._tileGx = gx; m._tileGy = gy;
}

// ─── Helper: makeTroop ────────────────────────────────────────────────────

/**
 * Create a Troop instance from a spec for direct use with chainHitAt/splashAt.
 */
export function makeTroop(spec) {
  return new Troop(spec, 0, 0);
}

// ─── Helper: longPath ───────────────────────────────────────────────────

/**
 * Long straight path for tests where monsters need to travel across the map.
 * Uses a single horizontal segment of 12 tiles.
 */
export function longPath() {
  const T = CONFIG.TILE_SIZE;
  return {
    segments: [{ ax: 0, ay: 0, bx: T * 12, by: 0, len: T * 12, cumStart: 0 }],
    totalLength: T * 12,
  };
}

// ─── Common spec lookups ──────────────────────────────────────────────────

export const healerSpec = TROOP_SPECS.find((s) => s.id === 'healer');
export const lightningSpec = TROOP_SPECS.find((s) => s.id === 'lightning');
export const swordsmanSpec = TROOP_SPECS.find((s) => s.id === 'swordsman');
export const archerSpec = TROOP_SPECS.find((s) => s.id === 'archer');
export const mageSpec = TROOP_SPECS.find((s) => s.id === 'mage');
export const knightSpec = TROOP_SPECS.find((s) => s.id === 'knight');
export const sniperSpec = TROOP_SPECS.find((s) => s.id === 'sniper');
export const machinegunSpec = TROOP_SPECS.find((s) => s.id === 'machinegun');
export const mortarSpec = TROOP_SPECS.find((s) => s.id === 'mortar');
export const valkyrieSpec = TROOP_SPECS.find((s) => s.id === 'valkyrie');
export const icewizSpec = TROOP_SPECS.find((s) => s.id === 'icewiz');
