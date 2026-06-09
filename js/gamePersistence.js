// Persistence helpers: serialise save data, rebuild world geometry from a
// seed, and restore game state from a save.  Extracted from Game so that
// adding new persistent fields requires only one touch-point per operation.

const SaveSerializer = {
  fromGame(game) {
    return {
      version: '1.4.0',
      gold: game.gold,
      lives: game.lives,
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
          healGoldSpent: t.healGoldSpent || 0,
        })),
    };
  },
};

const GameWorldFactory = {
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

const GameSnapshotRestorer = {
  // Apply a save onto an existing Game instance.  Rebuilds world geometry
  // and restores all persistent fields.
  apply(game, data) {
    const world = GameWorldFactory.createFresh(data.seed);

    game.gold = data.gold;
    game.lives = data.lives;
    game.speed = data.speed || 1;
    game.devMode = data.devMode || false;
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

    // Reset entity collections.
    game.monsters = [];
    game.projectiles = [];
    game.popups = [];
    game._popupPool = [];

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
      t.hpLevel = tData.hpLevel || 1;
      t.dmgLevel = tData.dmgLevel || 1;
      t.rangeLevel = tData.rangeLevel || 1;
      t.speedLevel = tData.speedLevel || 1;
      t.chainLevel = tData.chainLevel || 1;
      t.slowLevel = tData.slowLevel || 1;
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
    game._tileIndexPool = [];
    game._troopTileIndex = [];
    for (let i = 0; i < CONFIG.GRID_SIZE * CONFIG.GRID_SIZE; i++) {
      game._troopTileIndex.push([]);
    }

    // Wave manager.
    game.wave = new WaveManager();
    game.waveCompleteAnim = { active: false, waveNum: 0 };

    PARTICLES.clear();
    UI.shopScrollY = 0;
  },
};
