// All balance numbers live here so the game is easy to tune.

export const CONFIG = {
  // Map
  GRID_SIZE: 16, // 16x16 grid (smaller, faster to play)
  TILE_SIZE: 53, // pixels per tile (scaled down ~5%)
  MIN_PATH_LENGTH: 18, // reject and regenerate if shorter
  PATH_REGEN_ATTEMPTS: 30, // how many tries before giving up

  // Economy
  STARTING_GOLD: 1000,
  MAX_GOLD: 1000000,
  STARTING_LIVES: 25,

  // Selling
  SELL_REFUND_RATIO: 0.3,
  SELL_COOLDOWN: 3.0, // seconds before selling again

  // Troop combat
  MELEE_DAMAGE_REDUCTION: 0.3, // melee troops take 30% damage from monsters (70% less)

  // Troop healing
  TROOP_HEAL_HP_RATIO: 0.1, // heal 10% of max HP per heal
  TROOP_HEAL_COST_RATIO: 0.1, // heal costs 10% of base troop price

  // Simulation
  FIXED_TIMESTEP: 1 / 60, // 60 Hz simulation
  TARGET_REFRESH_INTERVAL: 0.2, // seconds between troop target re-evaluation

  // Waves
  SPAWN_INTERVAL: 0.7, // seconds between monster spawns
  RUNNER_SPAWN_INTERVAL: 0.4,
  MAX_SPAWNS_PER_TYPE: 80, // cap on per-type spawn count per wave for UI / perf
  GAME_SPEEDS: [1, 2, 4, 8, 16, 32, 64, 128],
  WAVE_SCALE_COUNT: 0.35, // scaling factor for monster count per cycle
  WAVE_SCALE_HP: 0.15, // scaling factor for monster HP per cycle
  WAVE_START_DELAY: 0.2, // seconds before first spawn of a wave

  // Shield mechanics
  SHIELD_REGEN_RATE: 20,
  SHIELD_REGEN_DELAY: 3,
  // Player shield
  SHIELD_COST_RATIO: 0.5, // 50% of selected troop spec.cost
  SHIELD_EXPIRE_WAVES: 10, // expires when a multiple-of-10 wave just completed
  SHIELD_SHOP_WIDTH: 220, // expanded Shield Shop panel width (collapsed: 20)

  // Upgrade scaling
  UPGRADE_COST_SCALE: 1.35,
  DAMAGE_SCALE_PER_LEVEL: 1.2,
  SPEED_SCALE_PER_LEVEL: 0.9,
  HP_SCALE_PER_LEVEL: 1.15,
  MAX_UPGRADE_LEVEL: 5,

  // Monster mechanics
  BOSS_HP_MULTIPLIER: 2,
  MONSTER_SPLIT_COUNT: 2,

  // Path generation
  PATH_EDGE_REJECTION: 0.35,

  // Projectile
  PROJECTILE_TIMEOUT: 3.0,

  // Boss bonus
  BOSS_BONUS_BASE: 500,
  BOSS_BONUS_PER_WAVE: 50,
  BOSS_BONUS_MAX: 5000,

  // Chain lightning
  CHAIN_MAX_DIST_TILES: 1.5,
  PARTICLE_GRAVITY: 60,
  TILE_BUFFER: 0.5,

  // Ice Wizard scaling
  SLOW_FACTOR_SCALE_PER_LEVEL: 0.85,
  SLOW_DURATION_SCALE_PER_LEVEL: 1.2,
  SHATTER_BONUS_SCALE_PER_LEVEL: 1.3,

  // Visual
  COLORS: {
    background: '#0e1418',
    gridLine: 'rgba(255,255,255,0.06)',
    path: '#3a2a18',
    buildableHover: 'rgba(120,200,120,0.24)',
    invalid: 'rgba(220,80,80,0.28)',
    gold: '#f1c40f',
    heart: '#e74c3c',
    hpBarBg: '#400',
    hpBarFill: '#2ecc71',
    shieldBarBg: '#223',
    shieldBarFill: '#5dade2',
  },
};

// UI layout constants (shared between game.js and ui.js to avoid hardcoded duplicates)
export const LAYOUT = {
  HUD: {
    GOLD_AREA: { x: 14, y: 14, w: 102, h: 28 },
    RESET_BTN: { x: 310, y: 14, w: 50, h: 28 },
    MUTE_BTN: { x: 366, y: 14, w: 28, h: 28 },
    SPEED_OFFSET: 370,
    SPEED_BTN_W: 26,
    SPEED_BTN_H: 28,
    CTRL_RIGHT: 116,
    CTRL_BTN: { x: 0, y: 12, w: 90, h: 32 },
  },
  SHOP: {
    SEW: 16,
    CARD_H: 58,
    CARD_GAP: 4,
    HEAL_BTN_Y_OFFSET: 88,
    HEAL_BTN_H: 28,
    SELL_BTN_Y_OFFSET: 56,
    SELL_BTN_H: 34,
    UPGRADE_BTN_Y_OFFSET: 130,
    UPGRADE_BTN_H: 36,
    BTN_PAD: 8,
    BTN_GAP: 2,
  },
};

// Monster specs. Index = level (1-5). boss is level 'B' keyed separately.
export const MONSTER_SPECS = {
  1: {
    name: 'Grunt',
    hp: 34,
    speed: 1.0,
    reward: 4,
    leak: 1,
    color: '#7ec07e',
    size: 11,
    damage: 4,
    attackSpeed: 1.0,
    attackRange: 1,
    attackMode: 'stop',
  },
  2: {
    name: 'Runner',
    hp: 27,
    speed: 3.0,
    reward: 6,
    leak: 1,
    color: '#9be37a',
    size: 10,
    damage: 6,
    attackSpeed: 1.0,
    attackRange: 1,
    attackMode: 'pass',
  },
  3: {
    name: 'Brute',
    hp: 133,
    speed: 0.7,
    reward: 11,
    leak: 1,
    color: '#c0a060',
    size: 14,
    damage: 14,
    attackSpeed: 1.0,
    attackRange: 1,
    attackMode: 'stop',
  },
  4: {
    name: 'Elite',
    hp: 245,
    speed: 1.0,
    reward: 17,
    leak: 2,
    color: '#d96a6a',
    size: 13,
    damage: 18,
    attackSpeed: 1.0,
    attackRange: 1,
    attackMode: 'stop',
  },
  5: {
    name: 'Champion',
    hp: 667,
    speed: 0.9,
    reward: 36,
    leak: 3,
    color: '#a86ad9',
    size: 16,
    damage: 32,
    attackSpeed: 1.0,
    attackRange: 1,
    attackMode: 'stop',
  },
  B: {
    name: 'Boss',
    hp: 1668,
    speed: 0.6,
    reward: 200,
    leak: 5,
    color: '#e74c3c',
    size: 22,
    damage: 45,
    attackSpeed: 1.0,
    attackRange: 1,
    attackMode: 'stop',
    healPerSecond: 15,
  },
  S: {
    name: 'Shielded',
    hp: 173,
    speed: 0.8,
    reward: 15,
    leak: 1,
    color: '#5dade2',
    size: 14,
    damage: 16,
    attackSpeed: 1.0,
    attackRange: 1,
    attackMode: 'stop',
    shield: 69,
  },
  X: {
    name: 'Spear',
    hp: 50,
    speed: 2.0,
    reward: 5,
    leak: 1,
    color: '#a3a3a3',
    size: 9,
    damage: 3,
    attackSpeed: 0.8,
    attackRange: 2.5,
    attackMode: 'slow',
  },
};

// Troop specs. type: 'melee' or 'ranged'. splash is radius in tiles (0 = none).
export const TROOP_SPECS = [
  {
    id: 'swordsman',
    name: 'Swordsman',
    type: 'melee',
    cost: 70,
    damage: 9,
    range: 1,
    attackSpeed: 0.67,
    splash: 0,
    color: '#3498db',
    hp: 50,
    desc: 'Basic melee defender with 50 HP. Takes 70% less damage from monsters. Cheap and reliable.',
  },
  {
    id: 'knight',
    name: 'Knight',
    type: 'melee',
    cost: 120,
    damage: 18,
    range: 1,
    attackSpeed: 0.9,
    splash: 0,
    color: '#2980b9',
    hp: 120,
    desc: 'Heavy melee with 120 HP and high damage. Takes 70% less damage from monsters. Excellent tank.',
  },
  {
    id: 'archer',
    name: 'Archer',
    type: 'ranged',
    cost: 70,
    damage: 12,
    range: 3,
    attackSpeed: 1.2,
    splash: 0,
    color: '#27ae60',
    hp: 30,
    desc: 'Fast-firing ranged unit with 30 HP. Good DPS, but fragile — keep monsters away.',
  },
  {
    id: 'machinegun',
    name: 'Machine Gun',
    type: 'ranged',
    cost: 150,
    damage: 6,
    range: 4,
    attackSpeed: 0.25,
    splash: 0,
    color: '#e74c3c',
    hp: 40,
    desc: 'Rapid-fire ranged unit with 40 HP. Shreds groups, but low HP means it falls fast to monsters.',
  },
  {
    id: 'mage',
    name: 'Mage',
    type: 'ranged',
    cost: 180,
    damage: 32,
    range: 3,
    attackSpeed: 1.3,
    splash: 2.0,
    color: '#9b59b6',
    hp: 35,
    desc: 'Ranged unit with 35 HP and splash damage. Devastating against groups, but keep her protected.',
  },
  {
    id: 'sniper',
    name: 'Sniper',
    type: 'ranged',
    cost: 250,
    damage: 100,
    range: 10,
    attackSpeed: 2.5,
    splash: 0,
    color: '#2c3e50',
    hp: 25,
    desc: 'Extreme range and burst damage with only 25 HP. Picks off enemies from afar — very fragile up close.',
  },
  {
    id: 'valkyrie',
    name: 'Valkyrie',
    type: 'melee',
    cost: 150,
    damage: 22,
    range: 1,
    attackSpeed: 1.2,
    splash: 0,
    color: '#e67e22',
    hp: 80,
    aoe: true,
    desc: 'Melee unit with 80 HP and AoE attacks. Takes 70% less damage from monsters. Clears swarms.',
  },
  {
    id: 'lightning',
    name: 'Lightning',
    type: 'ranged',
    cost: 300,
    damage: 100,
    range: 2,
    attackSpeed: 3,
    splash: 0,
    color: '#f1c40f',
    hp: 40,
    chain: 2,
    stun: 0.5,
    desc: 'Chain lightning with 40 HP that stuns and jumps to multiple enemies. Stuns help keep her alive.',
  },
  {
    id: 'mortar',
    name: 'Mortar',
    type: 'ranged',
    cost: 200,
    damage: 65,
    range: 8,
    attackSpeed: 3.0,
    splash: 2.5,
    color: '#8B4513',
    hp: 30,
    desc: 'Long-range siege unit with 30 HP. Slow but devastating splash — vulnerable if monsters reach her.',
  },
  {
    id: 'icewiz',
    name: 'Ice Wizard',
    type: 'ranged',
    cost: 200,
    damage: 6,
    range: 3,
    attackSpeed: 1.4,
    splash: 1.5,
    color: '#7fdbff',
    hp: 60,
    desc: 'Slows enemies; bonus damage on next hit while slowed.',
    slowFactor: 0.5,
    slowDuration: 2.5,
    shatterBonus: 0.5,
  },
];

// Pre-compute stats strings per troop (avoids string concat every frame).
for (let i = 0; i < TROOP_SPECS.length; i++) {
  const s = TROOP_SPECS[i];
  const type = s.type.charAt(0).toUpperCase() + s.type.slice(1);
  s._statsStr =
    type +
    ' \u00B7 ' +
    s.damage +
    'dmg \u00B7 ' +
    s.range +
    'rng \u00B7 ' +
    s.attackSpeed +
    's \u00B7 ' +
    s.hp +
    'hp' +
    (s.splash ? ' \u00B7 ' + s.splash + 'splash' : '') +
    (s.chain ? ' \u00B7 ' + s.chain + 'chain' : '');
}

// 10 waves. Each entry is an array of [levelKey, count] tuples.
export const WAVES = [
  [[1, 8]], // Wave 1: 8 Grunts (272 HP)
  [[1, 12]], // Wave 2: 12 Grunts (408 HP)
  [
    [1, 6],
    [2, 6],
  ], // Wave 3: 6 Grunts + 6 Runners (366 HP)
  [
    [3, 3],
    [2, 6],
  ], // Wave 4: 3 Brutes + 6 Runners (561 HP)
  [
    [3, 8],
    [1, 4],
    ['X', 4],
  ], // Wave 5: 8 Brutes + 4 Grunts + 4 Spears
  [
    [4, 6],
    [3, 4],
    ['X', 6],
  ], // Wave 6: 6 Elite + 4 Brutes + 6 Spears
  [
    [4, 10],
    [2, 6],
    ['X', 8],
  ], // Wave 7: 10 Elite + 6 Runners + 8 Spears
  [
    [4, 8],
    ['S', 2],
    [2, 4],
    ['X', 6],
  ], // Wave 8: 8 Elite + 2 Shielded + 4 Runners + 6 Spears
  [
    [4, 10],
    [5, 4],
    [3, 2],
  ], // Wave 9: 10 Elite + 4 Champion + 2 Brute
  [
    [5, 6],
    ['S', 4],
    ['B', 1],
  ], // Wave 10: 6 Champion + 4 Shielded + 1 Boss
];

// Projectile visuals per troop id (small set of shapes).
export const PROJECTILE_STYLES = {
  archer: { color: '#f1c40f', size: 3, speed: 12, kind: 'arrow' },
  machinegun: { color: '#e74c3c', size: 2, speed: 20, kind: 'bolt' },
  mage: { color: '#9b59b6', size: 6, speed: 10, kind: 'orb' },
  sniper: { color: '#e74c3c', size: 2, speed: 18, kind: 'bolt' },
  lightning: { color: '#f1c40f', size: 3, speed: 22, kind: 'bolt' },
  mortar: { color: '#8B4513', size: 5, speed: 8, kind: 'orb' },
  icewiz: { color: '#7fdbff', size: 3, speed: 12, kind: 'arrow' },
};
