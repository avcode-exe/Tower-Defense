// All balance numbers live here so the game is easy to tune.

const CONFIG = {
  // Map
  GRID_SIZE: 16,           // 16x16 grid (smaller, faster to play)
  TILE_SIZE: 53,           // pixels per tile (scaled down ~5%)
  MIN_PATH_LENGTH: 18,     // reject and regenerate if shorter
  PATH_REGEN_ATTEMPTS: 30, // how many tries before giving up

  // Economy
  STARTING_GOLD: 1000,
  MAX_GOLD: 1000000,
  STARTING_LIVES: 20,

  // Selling
  SELL_REFUND_RATIO: 0.5,
  SELL_COOLDOWN: 3.0, // seconds before selling again

  // Simulation
  FIXED_TIMESTEP: 1 / 60,  // 60 Hz simulation
  TARGET_REFRESH_INTERVAL: 0.2, // seconds between troop target re-evaluation

  // Waves
  SPAWN_INTERVAL: 0.7,     // seconds between monster spawns
  RUNNER_SPAWN_INTERVAL: 0.4,
  MAX_SPAWNS_PER_TYPE: 80, // cap on per-type spawn count per wave for UI / perf

  // Visual
  COLORS: {
    background: '#0e1418',
    grid: 'rgba(255,255,255,0.04)',
    gridLine: 'rgba(255,255,255,0.06)',
    path: '#3a2a18',
    buildableHover: 'rgba(120,200,120,0.24)',
    invalid: 'rgba(220,80,80,0.28)',
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
  1: { name: 'Grunt',    hp: 34,   speed: 1.0, reward: 4,  leak: 1, color: '#7ec07e', size: 11 },
  2: { name: 'Runner',   hp: 27,   speed: 1.8, reward: 6,  leak: 1, color: '#9be37a', size: 10 },
  3: { name: 'Brute',    hp: 133,  speed: 0.7, reward: 11, leak: 1, color: '#c0a060', size: 14 },
  4: { name: 'Elite',    hp: 245,  speed: 1.0, reward: 17, leak: 2, color: '#d96a6a', size: 13 },
  5: { name: 'Champion', hp: 667,  speed: 0.9, reward: 36, leak: 3, color: '#a86ad9', size: 16 },
  B: { name: 'Boss',     hp: 1668, speed: 0.6, reward: 81, leak: 5, color: '#e74c3c', size: 22 },
  S: { name: 'Shielded', hp: 115,  speed: 0.8, reward: 15, leak: 1, color: '#5dade2', size: 14, shield: 60 },
};

// Troop specs. type: 'melee' or 'ranged'. splash is radius in tiles (0 = none).
const TROOP_SPECS = [
  { id: 'swordsman', name: 'Swordsman', type: 'melee',  cost: 70,  damage: 12, range: 1, attackSpeed: 0.67, splash: 0, color: '#3498db', hotkey: '1', desc: 'Basic melee defender. Cheap and reliable for early waves.' },
  { id: 'knight',    name: 'Knight',    type: 'melee',  cost: 150, damage: 22, range: 1, attackSpeed: 0.9, splash: 0, color: '#2980b9', hotkey: '2', desc: 'Heavy melee with high damage. Great for holding choke points.' },
  { id: 'archer',    name: 'Archer',    type: 'ranged', cost: 70,  damage: 10, range: 3, attackSpeed: 1.2, splash: 0, color: '#27ae60', hotkey: '3', desc: 'Fast-firing ranged unit. Good DPS for its cost.' },
  { id: 'machinegun', name: 'Machine Gun',  type: 'ranged', cost: 200, damage: 6, range: 4, attackSpeed: 0.25, splash: 0, color: '#e74c3c', hotkey: '4', desc: 'Rapid-fire ranged unit. Shreds groups with its fast attack rate.' },
  { id: 'mage',      name: 'Mage',      type: 'ranged', cost: 200, damage: 28, range: 3, attackSpeed: 1.3, splash: 2.0, color: '#9b59b6', hotkey: '5', desc: 'Ranged unit with splash damage. Effective against dense groups.' },
  { id: 'sniper',    name: 'Sniper',    type: 'ranged', cost: 250, damage: 100, range: 10, attackSpeed: 2.5, splash: 0, color: '#2c3e50', hotkey: '6', desc: 'Extreme range and burst damage. Picks off enemies from afar.' },
  { id: 'valkyrie',  name: 'Valkyrie',  type: 'melee',  cost: 180, damage: 20, range: 1, attackSpeed: 1.2, splash: 0, color: '#e67e22', hotkey: '7', aoe: true, desc: 'Melee unit with AoE attacks. Clears swarms around her.' },
  { id: 'lightning', name: 'Lightning', type: 'ranged', cost: 300, damage: 100, range: 2, attackSpeed: 3, splash: 0, color: '#f1c40f', hotkey: '8', chain: 4, stun: 0.5, desc: 'Chain lightning that stuns and jumps to multiple enemies.' },
  { id: 'mortar',   name: 'Mortar',   type: 'ranged', cost: 250, damage: 50,  range: 8, attackSpeed: 3.0, splash: 2.5, color: '#8B4513', hotkey: '9', desc: 'Long-range siege unit. Slow but devastating splash damage.' },
];

// Pre-compute stats strings per troop (avoids string concat every frame).
for (let i = 0; i < TROOP_SPECS.length; i++) {
  const s = TROOP_SPECS[i];
  s._statsStr = s.type.charAt(0).toUpperCase() + s.type.slice(1) + ' \u00B7 ' + s.damage + 'dmg \u00B7 ' + s.range + 'rng \u00B7 ' + s.attackSpeed + 's' + (s.splash ? ' \u00B7 ' + s.splash + 'splash' : '') + (s.chain ? ' \u00B7 ' + s.chain + 'chain' : '');
}

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
  [[5, 6], ['S', 4], ['B', 1]],
];

// Projectile visuals per troop id (small set of shapes).
const PROJECTILE_STYLES = {
  archer:    { color: '#f1c40f', size: 3, speed: 12, kind: 'arrow' },
  machinegun:{ color: '#e74c3c', size: 2, speed: 20, kind: 'bolt' },
  mage:      { color: '#9b59b6', size: 6, speed: 10, kind: 'orb' },
  sniper:    { color: '#e74c3c', size: 2, speed: 18, kind: 'bolt' },
  lightning: { color: '#f1c40f', size: 3, speed: 22, kind: 'bolt' },
  mortar:    { color: '#8B4513', size: 5, speed: 8,  kind: 'orb' },
};
