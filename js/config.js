// All balance numbers live here so the game is easy to tune.

const CONFIG = {
  // Map
  GRID_SIZE: 16,           // 16x16 grid (smaller, faster to play)
  TILE_SIZE: 56,           // pixels per tile (doubled visual size)
  MIN_PATH_LENGTH: 18,     // reject and regenerate if shorter
  PATH_REGEN_ATTEMPTS: 30, // how many tries before giving up

  // Economy
  STARTING_GOLD: 1000,
  MAX_GOLD: 1000000,
  STARTING_LIVES: 20,
  SELL_REFUND_RATIO: 0.5,

  // Simulation
  FIXED_TIMESTEP: 1 / 60,  // 60 Hz simulation
  TARGET_REFRESH_INTERVAL: 0.2, // seconds between troop target re-evaluation

  // Waves
  SPAWN_INTERVAL: 0.7,     // seconds between monster spawns
  RUNNER_SPAWN_INTERVAL: 0.4,

  // Visual
  COLORS: {
    background: '#0e1418',
    grid: 'rgba(255,255,255,0.04)',
    gridLine: 'rgba(255,255,255,0.06)',
    path: '#3a2a18',
    buildableHover: 'rgba(120,200,120,0.25)',
    invalid: 'rgba(220,80,80,0.30)',
    hud: '#0a0e12',
    hudText: '#e6edf3',
    hudAccent: '#58a6ff',
    gold: '#f1c40f',
    heart: '#e74c3c',
    selected: '#58a6ff',
    sell: '#e67e22',
  },
};

// Monster specs. Index = level (1-5). boss is level 'B' keyed separately.
const MONSTER_SPECS = {
  1: { name: 'Grunt',    hp: 35,   speed: 1.0, reward: 3,  leak: 1, color: '#7ec07e', size: 11 },
  2: { name: 'Runner',   hp: 28,   speed: 1.8, reward: 5,  leak: 1, color: '#9be37a', size: 10 },
  3: { name: 'Brute',    hp: 139,  speed: 0.7, reward: 10, leak: 1, color: '#c0a060', size: 14 },
  4: { name: 'Elite',    hp: 255,  speed: 1.0, reward: 16, leak: 2, color: '#d96a6a', size: 13 },
  5: { name: 'Champion', hp: 695,  speed: 0.9, reward: 35, leak: 3, color: '#a86ad9', size: 16 },
  B: { name: 'Boss',     hp: 1737, speed: 0.6, reward: 80, leak: 5, color: '#e74c3c', size: 22 },
};

// Troop specs. type: 'melee' or 'ranged'. splash is radius in tiles (0 = none).
const TROOP_SPECS = [
  { id: 'swordsman', name: 'Swordsman', type: 'melee',  cost: 50,  damage: 12, range: 1, attackSpeed: 0.67, splash: 0, color: '#3498db', hotkey: '1' },
  { id: 'knight',    name: 'Knight',    type: 'melee',  cost: 150, damage: 22, range: 1, attackSpeed: 0.9, splash: 0, color: '#2980b9', hotkey: '2' },
  { id: 'archer',    name: 'Archer',    type: 'ranged', cost: 70,  damage: 10, range: 3, attackSpeed: 1.2, splash: 0, color: '#27ae60', hotkey: '3' },
  { id: 'crossbow',  name: 'Machine Gun',  type: 'ranged', cost: 200, damage: 6, range: 4, attackSpeed: 0.25, splash: 0, color: '#e74c3c', hotkey: '4' },
  { id: 'mage',      name: 'Mage',      type: 'ranged', cost: 200, damage: 20, range: 3, attackSpeed: 1.3, splash: 1.5, color: '#9b59b6', hotkey: '5' },
  { id: 'sniper',    name: 'Sniper',    type: 'ranged', cost: 250, damage: 100, range: 10, attackSpeed: 2.5, splash: 0, color: '#2c3e50', hotkey: '6' },
  { id: 'valkyrie',  name: 'Valkyrie',  type: 'melee',  cost: 180, damage: 15, range: 1, attackSpeed: 1.5, splash: 0, color: '#e67e22', hotkey: '7', aoe: true },
  { id: 'lightning', name: 'Lightning', type: 'ranged', cost: 300, damage: 100, range: 2, attackSpeed: 3, splash: 0, color: '#f1c40f', hotkey: '8', chain: 4, stun: 0.5 },
];

// 10 waves. Each entry is an array of [levelKey, count] tuples.
const WAVES = [
  [[1, 8]],
  [[1, 12]],
  [[2, 10]],
  [[3, 8], [2, 6]],
  [[3, 12]],
  [[4, 8], [3, 8]],
  [[4, 12]],
  [[4, 10], [2, 8]],
  [[4, 15], [5, 4]],
  [[5, 6], ['B', 1]],
];

// Projectile visuals per troop id (small set of shapes).
const PROJECTILE_STYLES = {
  archer:   { color: '#f1c40f', size: 3, speed: 12, kind: 'arrow' },
  crossbow: { color: '#e74c3c', size: 2, speed: 20, kind: 'bolt' },
  mage:     { color: '#9b59b6', size: 6, speed: 10, kind: 'orb' },
  sniper:   { color: '#e74c3c', size: 2, speed: 18, kind: 'bolt' },
  lightning:{ color: '#f1c40f', size: 3, speed: 22, kind: 'bolt' },
};
