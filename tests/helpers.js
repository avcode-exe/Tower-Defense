// Shared test utilities for Tower Defense test suite
import { vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Game } from '../src/game.js';
import { CONFIG, TROOP_SPECS } from '../src/config.js';
import { Grid, TILE } from '../src/grid.js';
import { Troop } from '../src/troop.js';
import { WaveManager } from '../src/waveManager.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const TEST_WAYPOINTS = [
  [0, 0],
  [5, 0],
  [5, 5],
  [10, 5],
  [10, 10],
  [15, 10],
];
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

export function makeTileIndex() {
  return Array.from({ length: CONFIG.GRID_SIZE * CONFIG.GRID_SIZE }, () => []);
}

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
  game.sellConfirmationEnabled = true;
  game.runtime = {
    applyDefeat: vi.fn(),
    startWave: vi.fn(),
    togglePause: vi.fn(),
    stopLoop: vi.fn(),
    startLoop: vi.fn(),
    installResize: vi.fn(),
  };
  game._autoSave = vi.fn();
  game.devMonsterCounts = {};
  game._needsSaveCleanup = false;
  game._dragState = null;
  game.appVersion = '1.6.2';
  return game;
}

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
  let bestDist = Infinity,
    bestDistance = 0;
  const segs = game.pathSegments.segments;
  for (let i = 0; i < segs.length; i++) {
    const seg = segs[i];
    const dx = seg.bx - seg.ax,
      dy = seg.by - seg.ay;
    const lenSq = dx * dx + dy * dy;
    if (lenSq === 0) continue;
    const t = Math.max(0, Math.min(1, ((px - seg.ax) * dx + (py - seg.ay) * dy) / lenSq));
    const projX = seg.ax + t * dx,
      projY = seg.ay + t * dy;
    const dSq = (px - projX) ** 2 + (py - projY) ** 2;
    if (dSq < bestDist) {
      bestDist = dSq;
      bestDistance = seg.cumStart + t * seg.len;
    }
  }
  m.distance = bestDistance;
  game._updateMonsterTileIndex();
  return m;
}

let _Monster;
export async function ensureMonsterModule() {
  if (!_Monster) {
    const mod = await import('../src/monster.js');
    _Monster = mod.Monster;
  }
}

export function makeMonster(level, hpMult = 1) {
  if (!_Monster) throw new Error('Call ensureMonsterModule() before makeMonster()');
  const waypoints = [
    [0, 0],
    [5, 0],
    [5, 5],
    [10, 5],
    [10, 10],
    [15, 10],
  ];
  const pathSegments = {
    segments: [
      { ax: 0, ay: 26.5, bx: 848, by: 26.5, len: 848, cumStart: 0 },
      { ax: 848, ay: 26.5, bx: 848, by: 291.5, len: 265, cumStart: 848 },
    ],
    totalLength: 1113,
  };
  return new _Monster(level, waypoints, pathSegments, hpMult);
}

export function placeTroopOnGrid(game, spec, gx, gy) {
  const t = new Troop(spec, gx, gy);
  game.troops.push(t);
  game.grid.set(gx, gy, TILE.BLOCKED);
  game._buildTroopTileIndex();
  return t;
}

export function makeTroop(spec) {
  return new Troop(spec, 0, 0);
}

export function setProgressKeepPosition(m, progress) {
  const x = m.x,
    y = m.y,
    gx = m._tileGx,
    gy = m._tileGy;
  m.distance = progress * m.totalLength;
  m.x = x;
  m.y = y;
  m._tileGx = gx;
  m._tileGy = gy;
}

export function longPath() {
  const T = CONFIG.TILE_SIZE;
  return { segments: [{ ax: 0, ay: 0, bx: T * 12, by: 0, len: T * 12, cumStart: 0 }], totalLength: T * 12 };
}

export function makeElectronStub(overrides = {}) {
  return {
    saveGame: vi.fn(async () => true),
    loadGame: vi.fn(async () => null),
    deleteSave: vi.fn(async () => true),
    getSettings: vi.fn(async () =>
      JSON.parse(
        JSON.stringify({
          update: {
            channel: 'release',
            autoDownload: false,
            checkOnStartup: true,
            checkIntervalMinutes: 60,
            skippedVersions: [],
            showProgressBar: true,
            availableVersion: null,
            releaseType: null,
          },
          collapsed: {
            hud: false,
            shop: false,
            preview: false,
            shieldShop: false,
            help: true,
            monsterInfo: true,
            settings: true,
            about: false,
          },
        })
      )
    ),
    saveSettings: vi.fn(async () => true),
    getVersion: vi.fn(async () => '1.6.2'),
    sendManualCheck: vi.fn(),
    downloadUpdate: vi.fn(),
    requestRestartToUpdate: vi.fn(),
    skipUpdate: vi.fn(),
    cancelUpdate: vi.fn(),
    setAutoDownload: vi.fn(),
    setUpdateChannel: vi.fn(),
    onUpdateStatus: vi.fn(() => () => {}),
    ...overrides,
  };
}

export const swordsmanSpec = TROOP_SPECS.find((s) => s.id === 'swordsman');
export const knightSpec = TROOP_SPECS.find((s) => s.id === 'knight');
export const flameSpec = TROOP_SPECS.find((s) => s.id === 'flame');
export const archerSpec = TROOP_SPECS.find((s) => s.id === 'archer');
export const machinegunSpec = TROOP_SPECS.find((s) => s.id === 'machinegun');
export const mageSpec = TROOP_SPECS.find((s) => s.id === 'mage');
export const sniperSpec = TROOP_SPECS.find((s) => s.id === 'sniper');
export const valkyrieSpec = TROOP_SPECS.find((s) => s.id === 'valkyrie');
export const lightningSpec = TROOP_SPECS.find((s) => s.id === 'lightning');
export const mortarSpec = TROOP_SPECS.find((s) => s.id === 'mortar');
export const icewizSpec = TROOP_SPECS.find((s) => s.id === 'icewiz');
export const healerSpec = TROOP_SPECS.find((s) => s.id === 'healer');

export function loadFixture(name) {
  const p = path.join(__dirname, 'fixtures', 'saves', name);
  try {
    return JSON.parse(fs.readFileSync(p, 'utf-8'));
  } catch (e) {
    return null;
  }
}

export function makeCtx() {
  return {
    calls: [],
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    font: '',
    textAlign: '',
    textBaseline: '',
    globalAlpha: 1,
    filter: 'none',
    setTransform: vi.fn(),
    fillRect: vi.fn(),
    strokeRect: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    quadraticCurveTo: vi.fn(),
    arc: vi.fn(),
    closePath: vi.fn(),
    fill: vi.fn(),
    stroke: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    translate: vi.fn(),
    scale: vi.fn(),
    rotate: vi.fn(),
    drawImage: vi.fn(),
    clip: vi.fn(),
    rect: vi.fn(),
    setLineDash: vi.fn(),
    clearRect: vi.fn(),
    measureText: vi.fn((text) => ({ width: text.length * 6 })),
    fillText: vi.fn(),
    strokeText: vi.fn(),
    createLinearGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
    shadowColor: '',
    shadowBlur: 0,
    shadowOffsetX: 0,
    shadowOffsetY: 0,
    canvas: null,
  };
}

export function makeCanvas() {
  return {
    getContext: vi.fn(() => makeCtx()),
    getBoundingClientRect: vi.fn(() => ({ left: 0, top: 0, width: 800, height: 600 })),
    style: {},
    width: 800,
    height: 600,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  };
}

export function makeElement(tag = 'div') {
  return {
    tagName: tag.toUpperCase(),
    style: {},
    classList: { add: vi.fn(), remove: vi.fn(), contains: vi.fn(), toggle: vi.fn() },
    appendChild: vi.fn(),
    removeChild: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    querySelector: vi.fn(),
    querySelectorAll: vi.fn(() => []),
    getElementById: vi.fn(),
    parentNode: null,
    textContent: '',
    getAttribute: vi.fn(),
    setAttribute: vi.fn(),
    focus: vi.fn(),
    blur: vi.fn(),
  };
}

// Tripwire comment convention — used by all (known limitation: ...) tests
export const KNOWN_LIMITATION = 'known limitation:';
