// Game: orchestrator. Owns all entities, runs the fixed-timestep loop, and
// routes input to logic.

class Game {
  constructor(canvas) {
    this.canvas = canvas;
    RENDERER.init(canvas);

    this.state = 'PRE_WAVE';   // PRE_WAVE | WAVE_ACTIVE | PAUSED | DEFEAT
    this.speed = 1;
    this.gold = CONFIG.STARTING_GOLD;
    this.lives = CONFIG.STARTING_LIVES;
    this.accumulator = 0;
    this.lastTime = 0;
    this.selectedSpec = null;
    this.selectedTroopIndex = -1;
    this.sellCooldownTimer = 0; // global seconds remaining before next sell allowed

    // Wave transition animation.
    this.waveCompleteAnim = { active: false, waveNum: 0 };

    this._simWorker = null;

    // World.
    this.grid = new Grid();
    this.seed = Math.floor(Math.random() * 0xffffffff);
    this.waypoints = generatePath(this.seed);
    this.pathSegments = this._buildPathSegments(this.waypoints);
    this.markPathTiles();

    // Entities.
    this.monsters = [];
    this.troops = [];
    this.projectiles = [];
    this.popups = []; // floating text popups ({text, x, y, t, color})

    // Reusable buffer for chain lightning (avoids allocation per hit).
    this._chainBuf = [];
    // Reusable scratch objects for zero-alloc coordinate transforms.
    this._tileScratch = {gx:0, gy:0};
    this._centerScratch = {x:0, y:0};
    // Reusable projectile impact callback (avoids closure allocation per projectile per frame).
    this._onProjectileImpact = (proj) => this.applyProjectileImpact(proj);
    // Tile-based spatial monster index for fast targeting.
    this._monsterTileIndex = new Array(CONFIG.GRID_SIZE * CONFIG.GRID_SIZE);
    this._tileIndexStep = 0;
    this._activeShieldCount = 0;   // updated by buyTroopShield / clearShield

    this._troopTileIndex = [];
    for (let i = 0; i < CONFIG.GRID_SIZE * CONFIG.GRID_SIZE; i++) this._troopTileIndex.push([]);
    this._popupPool = [];
    this._tileIndexPool = [];

    this.wave = new WaveManager();

    this._resizeHandler = () => RENDERER.resize(canvas);
    window.addEventListener('resize', this._resizeHandler);

    this.devMode = false;
    this.devConfirmPending = false;
    this._goldClicks = 0;
    this._goldClickTimer = 0;
    this.resetConfirmPending = false;
    this.sellConfirmPending = false;
    this.sellConfirmTroopIndex = -1;
    this.devMonsterCounts = {1:0, 2:0, 3:0, 4:0, 5:0, B:0, S:0};
  }

  _getPopup(text, x, y, t, color) {
    if (this._popupPool.length > 0) {
      const p = this._popupPool.pop();
      p.text = text;
      p.x = x;
      p.y = y;
      p.t = t;
      p.color = color;
      this.popups.push(p);
      return;
    }
    this.popups.push({ text, x, y, t, color });
  }

  _buildPathSegments(waypoints) {
    const segments = [];
    let total = 0;
    const T = CONFIG.TILE_SIZE;
    for (let i = 1; i < waypoints.length; i++) {
      const [ax, ay] = waypoints[i - 1];
      const [bx, by] = waypoints[i];
      const axp = ax * T + T / 2, ayp = ay * T + T / 2;
      const bxp = bx * T + T / 2, byp = by * T + T / 2;
      const len = dist(axp, ayp, bxp, byp);
      total += len;
      segments.push({ ax: axp, ay: ayp, bx: bxp, by: byp, len, cumStart: total - len });
    }
    return { segments, totalLength: total };
  }

  markPathTiles() {
    for (const [gx, gy] of this.waypoints) {
      this.grid.set(gx, gy, TILE.PATH);
    }
  }

  canPlace(gx, gy, spec) {
    if (!this.devMode && this.gold < spec.cost) return false;
    if (!this.grid.isBuildable(gx, gy)) return false;
    for (let i = 0; i < this.troops.length; i++) {
      const t = this.troops[i];
      if (t.alive && t.gx === gx && t.gy === gy) return false;
    }
    return true;
  }

  placeTroop(spec, gx, gy) {
    if (!this.canPlace(gx, gy, spec)) return false;
    const t = new Troop(spec, gx, gy);
    this.troops.push(t);
    if (!this.devMode) this.gold -= spec.cost;
    this._buildTroopTileIndex();
    return true;
  }

  sellTroop(index) {
    const t = this.troops[index];
    if (!t || !t.alive) return;
    if (this.sellCooldownTimer > 0) return;
    t.alive = false;
    this.grid.set(t.gx, t.gy, TILE.EMPTY);
    RENDERER.markCacheDirty();
    if (!this.devMode) {
      const refund = Math.ceil(t.getTotalInvested() * CONFIG.SELL_REFUND_RATIO);
      this.gold = Math.min(this.gold + refund, CONFIG.MAX_GOLD);
      this._getPopup('+' + refund, t.x, t.y, 1.2, CONFIG.COLORS.gold);
    }
    // Set global sell cooldown (3 seconds between sells).
    this.sellCooldownTimer = CONFIG.SELL_COOLDOWN;
    if (this.selectedTroopIndex === index) this.selectedTroopIndex = -1;
    this.selectedSpec = null;
    this._buildTroopTileIndex();
  }

  upgradeTroopStat(index, stat) {
    const t = this.troops[index];
    if (!t || !t.alive) return;
    if (t.isMaxed(stat)) return;
    const cost = t.getUpgradeCost(stat);
    if (this.gold < cost) return;
    this.gold -= cost;
    t.upgradeStat(stat);
    this._getPopup(stat.toUpperCase() + ' +1', t.x, t.y - 10, 1.2, '#f1c40f');
  }

  // Heal a troop by 10% of max HP.
  healTroop(index) {
    const t = this.troops[index];
    if (!t || !t.alive) return;
    if (!t.canHeal()) return;
    const cost = t.getHealCost();
    if (this.gold < cost) return;
    this.gold -= cost;
    const prevHp = t.hp;
    t.heal();
    const actual = Math.ceil(t.hp - prevHp);
    this._getPopup('+' + actual + ' HP', t.x, t.y - 10, 1.0, '#44cc44');
  }

  // Buy a shield for the troop at index. One shield per troop. Cost = 50% of spec.cost.
  buyTroopShield(index) {
    const t = this.troops[index];
    if (!t || !t.alive) return false;
    if (!t.canAddShield()) return false;        // already has shield (one-at-a-time)
    const cost = Math.ceil(t.spec.cost * CONFIG.SHIELD_COST_RATIO);
    if (!this.devMode && this.gold < cost) return false;
    if (!this.devMode) this.gold -= cost;
    t.applyShield();
    this._activeShieldCount = Math.min(this.troops.length, this._activeShieldCount + 1);
    this._getPopup('SHIELD!', t.x, t.y - 12, 1.0, '#5dade2');
    if (PARTICLES && PARTICLES.troopShieldActivate) {
      PARTICLES.spawn(t.x, t.y, PARTICLES.troopShieldActivate(t.spec.color));
    }
    return true;
  }

  spawnMonster(level, hpMult = 1) {
    const m = new Monster(level, this.waypoints, this.pathSegments, hpMult);
    this.monsters.push(m);
  }

  // Apply damage to a monster and queue reward popup. Returns true if killed.
  damageMonster(m, amount) {
    if (!m.alive) return false;
    const r = m.takeDamage(amount);
    if (r.killed) {
      this.gold = Math.min(this.gold + r.reward, CONFIG.MAX_GOLD);
      this._getPopup('+' + r.reward, m.x, m.y - 8, 1.2, CONFIG.COLORS.gold);
      PARTICLES.spawn(m.x, m.y, PARTICLES.deathBurst(m.spec.color));
      // Split monster: if level > 1, spawn 2 monsters of level-1 at this position.
      if (m.level !== 'B' && m.level !== 'S' && m.level > 1) {
        const childLvl = m.level - 1;
        for (let i = 0; i < CONFIG.MONSTER_SPLIT_COUNT; i++) {
          const child = new Monster(childLvl, this.waypoints, this.pathSegments, m.hpMult);
          child.distance = m.distance;
          child.segIdx = m.segIdx;
          child._updatePosition();
          child.stunTimer = m.stunTimer;
          this.monsters.push(child);
        }
      }
    } else {
      // Shield absorbed all damage — show shield indicator.
      if (r.hpDamage === 0 && amount > 0) {
        this._getPopup('Shield!', m.x, m.y - 6, 0.6, CONFIG.COLORS.shieldBarFill);
      } else {
        this._getPopup(String(Math.round(r.hpDamage)), m.x, m.y - 6, 0.6, '#fff');
      }
      PARTICLES.spawn(m.x, m.y, PARTICLES.hitSpark('#fff'));
    }
    return r.killed;
  }

  // Kill a troop that was destroyed by monsters.
  killTroop(troop) {
    troop.alive = false;
    this.grid.set(troop.gx, troop.gy, TILE.EMPTY);
    RENDERER.markCacheDirty();
    PARTICLES.spawn(troop.x, troop.y, PARTICLES.troopDeath(troop.spec.color));
    this._getPopup('\u2620 Destroyed', troop.x, troop.y - 12, 1.0, '#ff4444');
    this._buildTroopTileIndex();
    if (this.selectedTroopIndex >= 0) {
      const sel = this.troops[this.selectedTroopIndex];
      if (!sel || !sel.alive) this.selectedTroopIndex = -1;
    }
  }

  // Apply monster melee damage to a troop.
  damageTroop(monster, troop) {
    let dmg = monster.spec.damage;
    // Melee troops take 70% less damage from monsters (they can block).
    if (troop.spec.type === 'melee') dmg = Math.round(dmg * 0.3);
    const killed = troop.takeDamage(dmg);
    this._getPopup(
      '-' + dmg,
      troop.x + (Math.random() - 0.5) * 8,
      troop.y - 14,
      0.8,
      '#ff6644'
    );
    PARTICLES.spawn(troop.x, troop.y, PARTICLES.hitSpark('#ff8844'));
    if (killed) {
      this.killTroop(troop);
    }
  }

  // One fixed-timestep simulation step.
  step(dt) {
    if (this.state === 'PAUSED' || this.state === 'DEFEAT') return;

    // Wave timer.
    this.wave.update(dt);

    // Spawn due monsters.
    while (true) {
      const monData = this.wave.popDueMonster();
      if (monData == null) break;
      this.spawnMonster(monData.level, monData.hpMult);
    }

    // Troops (index loop for speed).
    for (let i = 0; i < this.troops.length; i++) {
      const t = this.troops[i];
      if (!t.alive) continue;
      t.update(dt, this.monsters, this.projectiles, this);
    }

    // Projectiles (index loop for speed).
    for (let i = 0; i < this.projectiles.length; i++) {
      const p = this.projectiles[i];
      if (!p.alive) continue;
      p.update(dt, this.monsters, this._onProjectileImpact);
    }

    // Monsters (index loop for speed).
    // Snapshot length: troops/projectiles may push split children via damageMonster.
    const monsterCount = this.monsters.length;
    for (let i = 0; i < monsterCount; i++) {
      const m = this.monsters[i];
      if (!m.alive) continue;
      // Defensive kill: if HP somehow reached <=0 outside the damage path,
      // route through damageMonster so split-on-kill / particles / reward
      // all fire consistently.
      if (m.hp <= 0) {
        this.damageMonster(m, m.maxHp);
        continue;
      }
      m.update(dt, this._troopTileIndex);
      if (m.reachedEnd) {
        m.alive = false;
        this.lives -= m.leak;
        this._getPopup('-' + m.leak, m.x, m.y - 8, 1.0, CONFIG.COLORS.heart);
        if (this.lives <= 0) {
          this.lives = 0;
          this.state = 'DEFEAT';
          if (this._simWorker) this._simWorker.postMessage('stop');
        }
      }
    }

    // Monster attacks on troops.
    for (let i = 0; i < this.monsters.length; i++) {
      const m = this.monsters[i];
      if (!m.alive || !m._pendingAttack) continue;
      const target = m._pendingAttack;
      m._pendingAttack = null;
      if (target.alive) {
        this.damageTroop(m, target);
      }
    }

    // Melee damage is now routed through game.damageMonster inside Troop.update
    // so reward/popup logic stays in one place.

    // Cleanup dead (in-place, no allocation).
    let mw = 0;
    for (let i = 0; i < this.monsters.length; i++) {
      if (this.monsters[i].alive) this.monsters[mw++] = this.monsters[i];
    }
    this.monsters.length = mw;
    let pw = 0;
    for (let i = 0; i < this.projectiles.length; i++) {
      if (this.projectiles[i].alive) this.projectiles[pw++] = this.projectiles[i];
    }
    this.projectiles.length = pw;
    // Fix stale selectedTroopIndex after compaction.
    // Track by reference: save BEFORE compaction mutates the array.
    const selRef = this.selectedTroopIndex >= 0 ? this.troops[this.selectedTroopIndex] : null;
    let tw = 0;
    for (let i = 0; i < this.troops.length; i++) {
      if (this.troops[i].alive) this.troops[tw++] = this.troops[i];
    }
    this.troops.length = tw;

    // Find the selected troop's new index after dead removal.
    if (selRef && selRef.alive) {
      let found = false;
      for (let i = 0; i < tw; i++) {
        if (this.troops[i] === selRef) {
          this.selectedTroopIndex = i;
          found = true;
          break;
        }
      }
      if (!found) this.selectedTroopIndex = -1;
    } else {
      this.selectedTroopIndex = -1;
    }

    // Wave completion.
    if (this.state === 'WAVE_ACTIVE' && this.wave.spawnIndex >= this.wave.queue.length
        && this.monsters.length === 0) {
      const waveNum = this.wave.currentWave + 1;
      this.waveCompleteAnim = { active: true, waveNum: waveNum, startMs: performance.now() };
      if (waveNum % 10 === 0) {
        const bonus = Math.min(CONFIG.BOSS_BONUS_BASE + waveNum * CONFIG.BOSS_BONUS_PER_WAVE, CONFIG.BOSS_BONUS_MAX);
        this.gold = Math.min(this.gold + bonus, CONFIG.MAX_GOLD);
        this._getPopup('+' + bonus + ' Boss Bonus!', RENDERER.width / 2, RENDERER.height / 2 - 40, 2.0, CONFIG.COLORS.gold);
      }
      this.wave.onAllSpawnedAndCleared();
      // Expire troop shields after every 10th wave (boss wave).
      // At the start of wave (N+1) where N is a multiple of 10, clear all shields.
      if (waveNum % CONFIG.SHIELD_EXPIRE_WAVES === 0) {
        for (let i = 0; i < this.troops.length; i++) {
          const t = this.troops[i];
          if (t.shield > 0) t.clearShield();
        }
        this._activeShieldCount = 0;
      }
      this.state = 'PRE_WAVE';
    }

    // Update popups (single pass: decrement timers, compact, and recycle).
    let ppw = 0;
    for (let i = 0; i < this.popups.length; i++) {
      const p = this.popups[i];
      p.t -= dt;
      if (p.t > 0) {
        this.popups[ppw++] = p;
      } else if (this._popupPool.length < 50) {
        this._popupPool.push(p);
      }
    }
    this.popups.length = ppw;

    // Update global sell cooldown.
    if (this.sellCooldownTimer > 0) {
      this.sellCooldownTimer = Math.max(0, this.sellCooldownTimer - dt);
    }

    // Update tile-based spatial monster index (every step for accurate targeting).
    this._updateMonsterTileIndex();

    // Update particles.
    PARTICLES.update(dt);
  }

  // Fixed-timestep sim tick shared by worker and fallback paths.
  _runSimTick(now) {
    const realDt = Math.min((now - this.lastTime) / 1000, 0.1);
    this.lastTime = now;
    if (this.state === 'PAUSED' || this.state === 'DEFEAT') return;
    const fixed = CONFIG.FIXED_TIMESTEP;
    this.accumulator += realDt * this.speed;
    const maxSteps = Math.max(8, this.speed * 4);
    this.accumulator = Math.min(this.accumulator, fixed * maxSteps);
    let safety = maxSteps;
    while (this.accumulator >= fixed && safety-- > 0) {
      this.step(fixed);
      this.accumulator -= fixed;
    }
    this.render();
  }

  // Build tile-based spatial index of alive monsters for fast targeting.
  _updateMonsterTileIndex() {
    const tiIdx = this._monsterTileIndex;
    const tiPool = this._tileIndexPool;
    for (let i = 0; i < tiIdx.length; i++) {
      if (tiIdx[i]) {
        tiIdx[i].length = 0;
        tiPool.push(tiIdx[i]);
        tiIdx[i] = null;
      }
    }
    const G = CONFIG.GRID_SIZE;
    for (let i = 0; i < this.monsters.length; i++) {
      const m = this.monsters[i];
      if (!m.alive) continue;
      const gx = Math.max(0, Math.min(G - 1, (m.x / CONFIG.TILE_SIZE) | 0));
      const gy = Math.max(0, Math.min(G - 1, (m.y / CONFIG.TILE_SIZE) | 0));
      const idx = gy * G + gx;
      let arr = tiIdx[idx];
      if (!arr) {
        arr = tiPool.length > 0 ? tiPool.pop() : [];
        tiIdx[idx] = arr;
      }
      arr.push(m);
    }
  }

  _buildTroopTileIndex() {
    for (let i = 0; i < this._troopTileIndex.length; i++) this._troopTileIndex[i].length = 0;
    for (let i = 0; i < this.troops.length; i++) {
      const t = this.troops[i];
      if (!t.alive) continue;
      const idx = t.gy * CONFIG.GRID_SIZE + t.gx;
      if (idx >= 0 && idx < this._troopTileIndex.length) this._troopTileIndex[idx].push(t);
    }
  }

  // Apply damage + optional AoE from a projectile. Also handles reward.
  applyProjectileImpact(proj) {
    const dmg = proj.troop._cachedDamage;
    if (!proj.target || !proj.target.alive) {
      // Dead before impact: resolve at last known position.
      if (proj.troop.spec.chain > 0) {
        this.chainHitAt(proj.lastTargetX, proj.lastTargetY, proj.troop);
      } else if (proj.troop.spec.splash > 0) {
        this.splashAt(proj.lastTargetX, proj.lastTargetY, dmg, proj.troop.spec.splash, proj.troop);
      } else {
        // Direct hit: find closest alive monster to impact point using tile index.
        let closest = null, closestDist = Infinity;
        const gx0 = (proj.lastTargetX / CONFIG.TILE_SIZE) | 0;
        const gy0 = (proj.lastTargetY / CONFIG.TILE_SIZE) | 0;
        const G = CONFIG.GRID_SIZE;
        for (let dgy = -1; dgy <= 1; dgy++) {
          for (let dgx = -1; dgx <= 1; dgx++) {
            const gx = gx0 + dgx, gy = gy0 + dgy;
            if (gx < 0 || gx >= G || gy < 0 || gy >= G) continue;
            const arr = this._monsterTileIndex[gy * G + gx];
            if (!arr) continue;
            for (let i = 0; i < arr.length; i++) {
              const m = arr[i];
              if (!m.alive) continue;
              const d = dist(proj.lastTargetX, proj.lastTargetY, m.x, m.y);
              if (d < closestDist) { closestDist = d; closest = m; }
            }
          }
        }
        if (closest) this.damageMonster(closest, dmg);
      }
      return;
    }
    if (proj.troop.spec.chain > 0) {
      this.chainHitAt(proj.target.x, proj.target.y, proj.troop);
    } else if (proj.troop.spec.splash > 0) {
      this.splashAt(proj.target.x, proj.target.y, dmg, proj.troop.spec.splash, proj.troop);
    } else {
      this.damageMonster(proj.target, dmg);
    }
  }

  // Chain lightning: damages the nearest monster to (x,y) then chains to
  // consecutive monsters behind it (lower progress = further from end).
  // Each chain link must be within 1 tile of the previous target.
  chainHitAt(x, y, troop) {
    const damage = troop._cachedDamage;
    const chainCount = troop._cachedChain;
    const stunDuration = troop.spec.stun || 0;
    const maxChainDist = CONFIG.CHAIN_MAX_DIST_TILES * CONFIG.TILE_SIZE;

    // Apply stun + damage to a single target. Returns true if it split.
    const applyHit = (m, srcX, srcY) => {
      if (!m.alive) return null;
      const countBefore = this.monsters.length;
      // Shielded monsters are immune to stun while shield is active.
      if (stunDuration > 0 && m.shield <= 0) m.stunTimer = Math.max(m.stunTimer, stunDuration);
      this.damageMonster(m, damage);
      this._getPopup('\u26A1', m.x, m.y - 12, 0.6, '#f1c40f');
      // Stun any children spawned by split.
      if (stunDuration > 0 && m.shield <= 0) {
        for (let j = countBefore; j < this.monsters.length; j++) {
          this.monsters[j].stunTimer = Math.max(this.monsters[j].stunTimer, stunDuration);
        }
      }
      PARTICLES.spawn(srcX, srcY, PARTICLES.chainSpark());
      return m;
    };

    // Find primary target using tile index.
    const cgx = (x / CONFIG.TILE_SIZE) | 0;
    const cgy = (y / CONFIG.TILE_SIZE) | 0;
    const G = CONFIG.GRID_SIZE;
    let closestDist = Infinity;
    let closest = null;
    for (let dgy = -1; dgy <= 1; dgy++) {
      for (let dgx = -1; dgx <= 1; dgx++) {
        const gx = cgx + dgx, gy = cgy + dgy;
        if (gx < 0 || gx >= G || gy < 0 || gy >= G) continue;
        const arr = this._monsterTileIndex[gy * G + gx];
        if (!arr) continue;
        for (let i = 0; i < arr.length; i++) {
          const m = arr[i];
          if (!m.alive) continue;
          const dx = m.x - x, dy = m.y - y;
          const dSq = dx * dx + dy * dy;
          if (dSq < closestDist) { closestDist = dSq; closest = m; }
        }
      }
    }
    if (!closest) return;

    let lastX = closest.x, lastY = closest.y;
    applyHit(closest, x, y);

    // Chain: find up to chainCount monsters behind the primary,
    // each within 1 tile of the previous chain target.
    const primaryProgress = closest.progress;
    let chained = 0;
    // Snapshot alive monsters after primary hit (includes any split children).
    const buf = this._chainBuf;
    buf.length = 0;
    for (let i = 0; i < this.monsters.length; i++) {
      const m = this.monsters[i];
      if (m.alive && m !== closest) buf.push(m);
    }

    for (let i = 0; i < buf.length && chained < chainCount; i++) {
      // Find closest candidate to last chain target that has lower progress.
      let bestDist = Infinity;
      let best = null;
      let bestIdx = -1;
      for (let j = 0; j < buf.length; j++) {
        const m = buf[j];
        if (!m.alive || m.progress >= primaryProgress) continue;
        const dx = m.x - lastX, dy = m.y - lastY;
        const dSq = dx * dx + dy * dy;
        if (dSq < bestDist) { bestDist = dSq; best = m; bestIdx = j; }
      }
      if (!best || bestDist > maxChainDist * maxChainDist) break; // too far, stop chaining
      lastX = best.x; lastY = best.y;
      applyHit(best, best.x, best.y);
      // Remove hit monster from buffer to prevent re-hitting the same target.
      if (bestIdx >= 0) { buf.splice(bestIdx, 1); i--; }
      chained++;
    }
  }

  splashAt(x, y, damage, radiusTiles, troop) {
    const r = radiusTiles * CONFIG.TILE_SIZE;
    const rSq = r * r;
    const rInv = 1 / r;
    const cgx = (x / CONFIG.TILE_SIZE) | 0;
    const cgy = (y / CONFIG.TILE_SIZE) | 0;
    const ceilR = Math.ceil(radiusTiles);
    const G = CONFIG.GRID_SIZE;
    for (let dgy = -ceilR; dgy <= ceilR; dgy++) {
      for (let dgx = -ceilR; dgx <= ceilR; dgx++) {
        const gx = cgx + dgx, gy = cgy + dgy;
        if (gx < 0 || gx >= G || gy < 0 || gy >= G) continue;
        const arr = this._monsterTileIndex[gy * G + gx];
        if (!arr) continue;
        for (let i = 0; i < arr.length; i++) {
          const m = arr[i];
          if (!m.alive) continue;
          const dx = x - m.x, dy = y - m.y;
          const dSq = dx * dx + dy * dy;
          if (dSq <= rSq) {
            const falloff = 1 - 0.5 * (Math.sqrt(dSq) * rInv);
            const dmg = Math.max(1, Math.round(damage * falloff));
            this.damageMonster(m, dmg);
          }
        }
      }
    }
    PARTICLES.spawn(x, y, PARTICLES.splashImpact(troop ? troop.spec.color : '#9b59b6'));
  }

  start() {
    // Use a Web Worker for simulation so the game runs at full speed
    // even when the tab is in the background (workers are never throttled).
    if (this._resizeHandler) window.removeEventListener('resize', this._resizeHandler);
    this._resizeHandler = () => RENDERER.resize(this.canvas);
    window.addEventListener('resize', this._resizeHandler);
    this.lastTime = performance.now();
    this._running = true;
    this._rafVersion = (this._rafVersion || 0) + 1;
    const myRafVersion = this._rafVersion;

    // Spawn the sim worker.
    try {
      this._simWorker = new Worker('js/simWorker.js');
      this._simWorker.onmessage = (e) => {
      if (e.data === 'tick') {
        if (!this._running) return;
        this._runSimTick(performance.now());
      }
    };
    this._simWorker.onerror = (e) => {
      console.error('Sim worker error, falling back to main thread:', e);
      this._simWorker = null;
    };
    this._simWorker.postMessage('start');
    } catch (err) {
      console.warn('Web Worker unavailable, falling back to main-thread loop:', err);
      this._running = true;
      this.lastTime = performance.now();
      const fallbackLoop = () => {
        if (!this._running || this._rafVersion !== myRafVersion) return;
        this._runSimTick(performance.now());
        requestAnimationFrame(fallbackLoop);
      };
      requestAnimationFrame(fallbackLoop);
    }
  }

  // ===== Rendering =====
  render() {
    RENDERER.beginFrame();
    RENDERER.drawStaticLayers(this.grid);
    RENDERER.applyMapTransform();

    const T = CONFIG.TILE_SIZE;
    const ctx = RENDERER.ctx;

    // Troops (index loop) — cached Path2D, no per-troop path construction.
    if (!Game._troopPath) {
      const s = T - 12, rr = 4;
      const path = new Path2D();
      path.moveTo(rr, 0);
      path.lineTo(s - rr, 0);
      path.quadraticCurveTo(s, 0, s, rr);
      path.lineTo(s, s - rr);
      path.quadraticCurveTo(s, s, s - rr, s);
      path.lineTo(rr, s);
      path.quadraticCurveTo(0, s, 0, s - rr);
      path.lineTo(0, rr);
      path.quadraticCurveTo(0, 0, rr, 0);
      path.closePath();
      Game._troopPath = path;
    }
    for (let i = 0; i < this.troops.length; i++) {
      const t = this.troops[i];
      if (!t.alive) continue;
      // Shield square outline — replaces the old circular arc. Troop body shrinks
      // to 80% so the overall footprint (body + outline) matches an unshielded troop.
      if (t.shield > 0 && t.alive && t.maxShield > 0) {
        const sqSize = T - 12;  // 48px, same as normal troop body
        const sqX = t.gx * T + 6;
        const sqY = t.gy * T + 6;
        ctx.strokeStyle = CONFIG.COLORS.shieldBarFill;  // #5dade2
        // Subtle sine-wave pulse between ~0.45 and ~0.75, period ~1.5s.
        const pulse = 0.6 + 0.15 * Math.sin(performance.now() * 0.004);
        ctx.globalAlpha = pulse;
        ctx.lineWidth = 2;
        ctx.strokeRect(sqX, sqY, sqSize, sqSize);
        ctx.globalAlpha = 1;
      }
      const x = t.gx * T + 6, y = t.gy * T + 6;
      ctx.save();
      ctx.translate(x, y);
      if (t.shield > 0 && t.maxShield > 0) {
        // Shrink to 80% to fit inside the shield square outline.
        const s = T - 12;
        ctx.translate(s * 0.5, s * 0.5);
        ctx.scale(0.8, 0.8);
        ctx.translate(-s * 0.5, -s * 0.5);
      }
      ctx.fillStyle = t.spec.color;
      ctx.fill(Game._troopPath);
      ctx.strokeStyle = 'rgba(255,255,255,0.12)';
      ctx.lineWidth = 1.5;
      ctx.stroke(Game._troopPath);
      ctx.restore();
      const dotColor = t.spec.type === 'melee' ? '#f1c40f' : '#bdc3c7';
      ctx.fillStyle = dotColor;
      ctx.fillRect(t.x - 2.5, t.y - 5.5, 5, 5);
      // HP bar (only when damaged).
      if (t.hp < t.maxHp) {
        const barW = T * 0.7;
        const barH = 3;
        const barX = t.x - barW / 2;
        const barY2 = t.y - T * 0.45;
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.fillRect(barX, barY2, barW, barH);
        const hpR = t.getHpRatio();
        ctx.fillStyle = hpR > 0.6 ? '#44cc44' : hpR > 0.3 ? '#cccc44' : '#cc4444';
        ctx.fillRect(barX, barY2, barW * hpR, barH);
      }
      // Shield bar above HP bar (always drawn when shielded, even if HP is full).
      if (t.shield > 0 && t.maxShield > 0) {
        const barW = T * 0.7;
        const barH = 2;
        const barX = t.x - barW / 2;
        const barY = t.y - T * 0.45 - 4;  // 4px above HP bar
        ctx.fillStyle = CONFIG.COLORS.shieldBarBg;  // #223
        ctx.fillRect(barX, barY, barW, barH);
        ctx.fillStyle = CONFIG.COLORS.shieldBarFill; // #5dade2
        ctx.fillRect(barX, barY, barW * t.getShieldRatio(), barH);
      }
    }

    // PASS 1: Monster bodies (shadows, shield rings, body arcs, stun overlays).
    for (let i = 0; i < this.monsters.length; i++) {
      const m = this.monsters[i];
      if (!m.alive) continue;
      // Outer shadow.
      ctx.fillStyle = 'rgba(0,0,0,0.4)';
      ctx.beginPath();
      ctx.arc(m.x, m.y, m.spec.size * 0.5 + 3, 0, 6.2832);
      ctx.fill();
      // Shield ring.
      if (m.shield > 0) {
        const shieldRatio = m.shield / m.maxShield;
        ctx.strokeStyle = '#5dade2';
        ctx.globalAlpha = 0.3 + 0.5 * shieldRatio;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(m.x, m.y, m.spec.size * 0.5 + 2, 0, 6.2832 * shieldRatio);
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
      // Body.
      ctx.fillStyle = m.spec.color;
      ctx.beginPath();
      ctx.arc(m.x, m.y, m.spec.size * 0.5, 0, 6.2832);
      ctx.fill();
      // Stun overlay.
      if (m.stunTimer > 0) {
        ctx.fillStyle = 'rgba(255,255,255,0.4)';
        ctx.beginPath();
        ctx.arc(m.x, m.y, m.spec.size * 0.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // PASS 2: HP bars (bg + fill in 1 pass — was 2 passes).
    ctx.fillStyle = CONFIG.COLORS.hpBarBg;
    for (let i = 0; i < this.monsters.length; i++) {
      const m = this.monsters[i];
      if (!m.alive) continue;
      if (m.hp < m.maxHp || m.shield < m.maxShield) {
        const w = m.spec.size + 6;
        const barY = m.y - m.spec.size * 0.5 - 10;
        ctx.fillRect(m.x - w * 0.5, barY, w, 3);
        ctx.fillStyle = CONFIG.COLORS.hpBarFill;
        ctx.fillRect(m.x - w * 0.5, barY, w * (m.hp / m.maxHp), 3);
        ctx.fillStyle = CONFIG.COLORS.hpBarBg;  // reset for next monster
      }
    }
    // Shield bars (bg + fill in 1 pass — was 2 passes).
    ctx.fillStyle = CONFIG.COLORS.shieldBarBg;
    for (let i = 0; i < this.monsters.length; i++) {
      const m = this.monsters[i];
      if (!m.alive) continue;
      if (m.maxShield > 0) {
        const w = m.spec.size + 6;
        const barY = m.y - m.spec.size * 0.5 - 10;
        ctx.fillRect(m.x - w * 0.5, barY - 4, w, 2);
        ctx.fillStyle = CONFIG.COLORS.shieldBarFill;
        ctx.fillRect(m.x - w * 0.5, barY - 4, w * Math.min(1, m.shield / m.maxShield), 2);
        ctx.fillStyle = CONFIG.COLORS.shieldBarBg;  // reset for next monster
      }
    }

    // Projectiles (world space) — index loop, no trig for arrows when possible.
    for (let i = 0; i < this.projectiles.length; i++) {
      const p = this.projectiles[i];
      if (!p.alive) continue;
      if (p.kind === 'arrow' || p.kind === 'bolt') {
        const tdx = p.lastTargetX - p.x;
        const tdy = p.lastTargetY - p.y;
        const d = Math.sqrt(tdx * tdx + tdy * tdy) || 1;
        const nx = tdx / d, ny = tdy / d;
        ctx.strokeStyle = p.color;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(p.x - nx * 6, p.y - ny * 6);
        ctx.lineTo(p.x, p.y);
        ctx.stroke();
      } else {
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * 0.5, 0, 6.2832);
        ctx.fill();
      }
    }

    // Popups (world space) — set font/textAlign once.
    if (this.popups.length > 0) {
      ctx.font = 'bold 12px system-ui, sans-serif';
      ctx.textAlign = 'center';
      for (let i = 0; i < this.popups.length; i++) {
        const p = this.popups[i];
        const a = clamp(p.t * 1.667, 0, 1); // 1/0.6
        ctx.globalAlpha = a;
        ctx.fillStyle = p.color;
        ctx.fillText(p.text, p.x, p.y - (1.2 - p.t) * 14);
      }
      ctx.globalAlpha = 1;
      ctx.textAlign = 'left';
    }

    // Particles (world space).
    PARTICLES.draw(ctx);

    RENDERER.restoreTransform();

    // UI overlay (screen space).
    UI.updateHover(RENDERER.hoverPx, RENDERER.hoverPy);
    UI.drawHUD(this);
    UI.drawShop(this);
    UI.drawShieldShop(this);
    UI.drawPreview(this);
    UI.drawSelectedTroopRange(this);
    UI.drawPlacementGhost(this);
    UI.drawWaveTransition(this);
    UI.drawOverlay(this);
    UI.drawDevConfirmDialog(this);
    if (this.devMode) UI.drawDevRightPanel(this);
  }

  // ===== Input =====
  onMouseDown(px, py, button) {
    // Block all interaction during victory/defeat overlay (only keyboard restart works).
    if (this.state === 'DEFEAT') return;

    if (button === 2) {
      this.selectedSpec = null;
      this.selectedTroopIndex = -1;
      return;
    }

    // Panel toggle clicks — checked first, before everything else
    if (UI.handleToggleClick(px, py)) return;

    // Confirmation dialog clicks (intercepts everything while shown).
    if (this.devConfirmPending || this.resetConfirmPending || this.sellConfirmPending) {
      if (UI._devConfirmYes && px >= UI._devConfirmYes.x && px <= UI._devConfirmYes.x + UI._devConfirmYes.w && py >= UI._devConfirmYes.y && py <= UI._devConfirmYes.y + UI._devConfirmYes.h) {
        if (this.sellConfirmPending) {
          this.sellConfirmPending = false;
          this.sellTroop(this.sellConfirmTroopIndex);
          this.sellConfirmTroopIndex = -1;
          this.devConfirmPending = false;
          this.resetConfirmPending = false;
        } else if (this.resetConfirmPending) {
          this.devConfirmPending = false;
          this.resetConfirmPending = false;
          this.resetGame();
        } else {
          this.devConfirmPending = false;
          this.resetConfirmPending = false;
          this.toggleDevMode();
        }
        return;
      }
      if (UI._devConfirmNo && px >= UI._devConfirmNo.x && px <= UI._devConfirmNo.x + UI._devConfirmNo.w && py >= UI._devConfirmNo.y && py <= UI._devConfirmNo.y + UI._devConfirmNo.h) {
        this.devConfirmPending = false;
        this.resetConfirmPending = false;
        this.sellConfirmPending = false;
        this.sellConfirmTroopIndex = -1;
        return;
      }
      return; // all clicks consumed while dialog is shown
    }

    // Right-panel clicks in dev mode (non-modal — clicks outside pass through).
    if (this.devMode && this.state === 'PRE_WAVE' && UI._devRightPanelRect) {
      if (px >= UI._devRightPanelRect.x && px <= UI._devRightPanelRect.x + UI._devRightPanelRect.w
          && py >= UI._devRightPanelRect.y && py <= UI._devRightPanelRect.y + UI._devRightPanelRect.h) {
        // Inside the panel — check buttons.
        const rows = UI._devRightButtons;
        if (rows) {
          for (let i = 0; i < rows.length; i++) {
            const row = rows[i];
            const tags = ['m10','m1','p1','p10'];
            for (let j = 0; j < tags.length; j++) {
              const b = row[tags[j]];
            if (px >= b.x && px <= b.x + b.w && py >= b.y && py <= b.y + b.h) {
              const delta = tags[j] === 'm10' ? -10 : tags[j] === 'm1' ? -1 : tags[j] === 'p1' ? 1 : 10;
              this.devMonsterCounts[row.level] = Math.max(0, (this.devMonsterCounts[row.level] || 0) + delta);
              return;
            }
          }
        }
        }

        if (UI._devRightStartBtn && px >= UI._devRightStartBtn.x && px <= UI._devRightStartBtn.x + UI._devRightStartBtn.w
            && py >= UI._devRightStartBtn.y && py <= UI._devRightStartBtn.y + UI._devRightStartBtn.h) {
          if (this.wave.startNextWave()) {
            this.wave.buildCustomFromCounts(this.devMonsterCounts);
            this.state = 'WAVE_ACTIVE';
          }
          return;
        }
        if (UI._devRightResetBtn && px >= UI._devRightResetBtn.x && px <= UI._devRightResetBtn.x + UI._devRightResetBtn.w
            && py >= UI._devRightResetBtn.y && py <= UI._devRightResetBtn.y + UI._devRightResetBtn.h) {
          this.resetDevMonsterCounts();
          return;
        }
        // Clicks inside panel but not on a button are consumed.
        return;
      }
    }

    // Triple-click on gold display to toggle dev mode.
    if (px >= 14 && px <= 116 && py >= 14 && py <= 42) {
      const now = performance.now();
      if (now - this._goldClickTimer > 800) this._goldClicks = 0;
      this._goldClickTimer = now;
      this._goldClicks++;
      if (this._goldClicks >= 3) {
        this._goldClicks = 0;
        this.devConfirmPending = true;
      }
      return;
    }

    // HUD buttons — only active when HUD is expanded.
    if (!UI_LAYOUT.collapsed.hud) {
      // Reset button.
      const rstBtn = { x: 310, y: 14, w: 36, h: 28 };
      if (px >= rstBtn.x && px <= rstBtn.x + rstBtn.w && py >= rstBtn.y && py <= rstBtn.y + rstBtn.h) {
        this.resetConfirmPending = true;
        return;
      }

      // Speed buttons.
      const w = RENDERER.width;
      for (let i = 0; i < CONFIG.GAME_SPEEDS.length; i++) {
        const r = { x: w - 370 + i * 28, y: 14, w: 26, h: 28 };
        if (px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h) {
          this.speed = CONFIG.GAME_SPEEDS[i];
          return;
        }
      }

      // Start wave / pause button.
      const btn = { x: w - 116, y: 12, w: 90, h: 32 };
      if (px >= btn.x && px <= btn.x + btn.w && py >= btn.y && py <= btn.y + btn.h) {
        if (this.state === 'PRE_WAVE') {
          if (this.wave.startNextWave()) {
            if (this.devMode) this.wave.buildCustomFromCounts(this.devMonsterCounts);
            this.state = 'WAVE_ACTIVE';
          }
        } else if (this.state === 'WAVE_ACTIVE') {
          this.state = 'PAUSED';
        } else if (this.state === 'PAUSED') {
          this.state = 'WAVE_ACTIVE';
        }
        return;
      }
    }

    // Shop clicks.
    const shopIdx = UI.hitShop(px, py);
    if (shopIdx >= 0) {
      const spec = TROOP_SPECS[shopIdx];
      this.selectedSpec = (this.selectedSpec === spec) ? null : spec;
      this.selectedTroopIndex = -1;
      return;
    }

    // Shield shop buy button (right panel).
    if (!UI_LAYOUT.collapsed.shieldShop && UI._shieldBuyBtn) {
      const sb = UI._shieldBuyBtn;
      if (px >= sb.x && px <= sb.x + sb.w && py >= sb.y && py <= sb.y + sb.h) {
        this.buyTroopShield(this.selectedTroopIndex);
        return;
      }
    }

    // Heal button (checked before sell button due to layout overlap).
    if (this.selectedTroopIndex >= 0 && !UI_LAYOUT.collapsed.shop) {
      const t = this.troops[this.selectedTroopIndex];
      if (t && t.alive && t.canHeal()) {
        const healBtnY = RENDERER.height - 92;
        const healBtnW = UI_LAYOUT.SHOP_WIDTH - 16;
        if (px >= 8 && px <= 8 + healBtnW && py >= healBtnY && py <= healBtnY + 28) {
          this.healTroop(this.selectedTroopIndex);
          return;
        }
      }
    }

    // Sell button — show confirmation dialog.
    if (this.selectedTroopIndex >= 0 && !UI_LAYOUT.collapsed.shop) {
      const sellBtn = { x: 8, y: RENDERER.height - 62, w: UI_LAYOUT.SHOP_WIDTH - 16, h: 34 };
      if (px >= sellBtn.x && px <= sellBtn.x + sellBtn.w
          && py >= sellBtn.y && py <= sellBtn.y + sellBtn.h) {
        if (this.devMode) {
          this.sellTroop(this.selectedTroopIndex);
        } else {
          this.sellConfirmTroopIndex = this.selectedTroopIndex;
          this.sellConfirmPending = true;
        }
        return;
      }
    }

    // Upgrade buttons (4 stats).
    if (this.selectedTroopIndex >= 0 && !UI_LAYOUT.collapsed.shop) {
      const t = this.troops[this.selectedTroopIndex];
      if (t && t.alive) {
        const stats = ['dmg', 'range', 'speed', 'chain'];
        const btnPad = 8;
        const btnGap = 2;
        // Count visible buttons first to compute dynamic width.
        let visibleCount = 0;
        for (const stat of stats) {
          if (!t.canUpgrade(stat)) continue;
          visibleCount++;
        }
        const statBtnW = visibleCount > 0 ? Math.floor((UI_LAYOUT.SHOP_WIDTH - btnPad * 2 - btnGap * (visibleCount - 1)) / visibleCount) : 49;
        let visibleBtnIdx = 0;
        for (let i = 0; i < stats.length; i++) {
          const stat = stats[i];
          if (!t.canUpgrade(stat)) continue;
          const btn = { x: btnPad + visibleBtnIdx * (statBtnW + btnGap), y: RENDERER.height - 130, w: statBtnW, h: 36 };
          visibleBtnIdx++;
          if (px >= btn.x && px <= btn.x + btn.w && py >= btn.y && py <= btn.y + btn.h) {
            this.upgradeTroopStat(this.selectedTroopIndex, stat);
            return;
          }
        }
      }
    }

    // Map clicks.
    if (px >= UI_LAYOUT.shopWidth && py >= UI_LAYOUT.hudHeight
        && py <= RENDERER.height - UI_LAYOUT.previewHeight
        && px <= RENDERER.width - UI_LAYOUT.shieldShopWidth) {
      RENDERER.toWorldInto(px, py, this._centerScratch);
      const world = this._centerScratch;
      pixelToTile(world.x, world.y, this._tileScratch);
      const tile = this._tileScratch;
      if (inBounds(tile.gx, tile.gy)) {
        // Try to select an existing troop first.
        const tIdx = this.findTroopAtTile(tile.gx, tile.gy);
        if (tIdx >= 0) {
          this.selectedTroopIndex = tIdx;
          this.selectedSpec = null;
          return;
        }
        // Otherwise place the selected spec.
        if (this.selectedSpec) {
          if (this.placeTroop(this.selectedSpec, tile.gx, tile.gy)) {
            // Keep selected for repeat placement.
          } else {
            tileCenterInto(tile.gx, tile.gy, this._centerScratch);
            this._getPopup('Invalid!', this._centerScratch.x, this._centerScratch.y, 1.0, '#da3633');
            this.selectedTroopIndex = -1;
          }
          return;
        }
        this.selectedTroopIndex = -1;
      }
    }
  }

  findTroopAtTile(gx, gy) {
    for (let i = 0; i < this.troops.length; i++) {
      const t = this.troops[i];
      if (t.alive && t.gx === gx && t.gy === gy) return i;
    }
    return -1;
  }

  onKeyDown(e) {
    // Restart.
    if ((e.key === 'r' || e.key === 'R')
        && this.state === 'DEFEAT') {
      e.preventDefault();
      this.restart();
      return;
    }
    // Hotkeys for shop.
    for (let i = 0; i < TROOP_SPECS.length; i++) {
      const spec = TROOP_SPECS[i];
      if (e.key === spec.hotkey) {
        e.preventDefault();
        this.selectedSpec = (this.selectedSpec === spec) ? null : spec;
        this.selectedTroopIndex = -1;
        return;
      }
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      this.selectedSpec = null;
      this.selectedTroopIndex = -1;
    }
    if (e.key === ' ') {
      e.preventDefault();
      if (this.state === 'WAVE_ACTIVE') {
        this.state = 'PAUSED';
        if (this._simWorker) this._simWorker.postMessage('stop');
      } else if (this.state === 'PAUSED') {
        this.state = 'WAVE_ACTIVE';
        if (this._simWorker) this._simWorker.postMessage('start');
      }
    }
    if (e.key === 'Enter' && this.state === 'PRE_WAVE') {
      e.preventDefault();
      if (this.wave.startNextWave()) {
        if (this.devMode) this.wave.buildCustomFromCounts(this.devMonsterCounts);
        this.state = 'WAVE_ACTIVE';
      }
    }
    // Panel toggle shortcuts: Alt+H (HUD), Alt+S (Shop), Alt+P (Preview), Alt+C (Controls/Help)
    if (e.altKey) {
      if (e.key === 'h' || e.key === 'H') {
        UI_LAYOUT.collapsed.hud = !UI_LAYOUT.collapsed.hud;
        RENDERER.resize(this.canvas);
        e.preventDefault();
      } else if (e.key === 's' || e.key === 'S') {
        UI_LAYOUT.collapsed.shop = !UI_LAYOUT.collapsed.shop;
        RENDERER.resize(this.canvas);
        e.preventDefault();
      } else if (e.key === 'p' || e.key === 'P') {
        UI_LAYOUT.collapsed.preview = !UI_LAYOUT.collapsed.preview;
        RENDERER.resize(this.canvas);
        e.preventDefault();
      } else if (e.key === 'c' || e.key === 'C') {
        UI_LAYOUT.collapsed.help = !UI_LAYOUT.collapsed.help;
        const helpEl = document.getElementById('help');
        if (helpEl) {
          helpEl.classList.toggle('collapsed', UI_LAYOUT.collapsed.help);
          const tab = document.getElementById('help-toggle');
          if (tab) tab.textContent = UI_LAYOUT.collapsed.help ? 'Controls ▸' : 'Controls ▾';
        }
        e.preventDefault();
      } else if (e.key === 'm' || e.key === 'M') {
        UI_LAYOUT.collapsed.monsterInfo = !UI_LAYOUT.collapsed.monsterInfo;
        const el = document.getElementById('monster-info');
        if (el) {
          el.classList.toggle('collapsed', UI_LAYOUT.collapsed.monsterInfo);
          const tab = document.getElementById('monster-info-toggle');
          if (tab) tab.textContent = UI_LAYOUT.collapsed.monsterInfo ? 'Monsters ▸' : 'Monsters ▾';
        }
        e.preventDefault();
      }
    }
  }

  restart() {
    if (this._simWorker) { this._simWorker.terminate(); this._simWorker = null; }
    if (this._resizeHandler) window.removeEventListener('resize', this._resizeHandler);
    this._running = false;
    this.state = 'PRE_WAVE';
    this.speed = 1;
    this.gold = this.devMode ? CONFIG.DEV_STARTING_GOLD : CONFIG.STARTING_GOLD;
    this.lives = CONFIG.STARTING_LIVES;
    this.selectedSpec = null;
    this.selectedTroopIndex = -1;
    this.sellCooldownTimer = 0;
    this._activeShieldCount = 0;
    this.grid = new Grid();
    this.seed = Math.floor(Math.random() * 0xffffffff);
    this.waypoints = generatePath(this.seed);
    this.pathSegments = this._buildPathSegments(this.waypoints);
    this.markPathTiles();
    RENDERER.markCacheDirty();
    RENDERER._rebuildCache(this.grid);
    this.monsters = [];
    this.troops = [];
    this.projectiles = [];
    this.popups = [];
    this._popupPool = [];
    this._monsterTileIndex = new Array(CONFIG.GRID_SIZE * CONFIG.GRID_SIZE);
    this._tileIndexPool = [];
    this._tileIndexStep = 0;
    this.waveCompleteAnim = { active: false, waveNum: 0 };
    PARTICLES.clear();
    UI.shopScrollY = 0;
    this.wave = new WaveManager();
    this.devMonsterCounts = this._defaultDevCounts();
    this.start(); // re-start the background loop
  }

  toggleDevMode() {
    this.devMode = !this.devMode;
    this.restart();
  }

  resetGame() {
    this.devMode = false;
    this.devConfirmPending = false;
    this.restart();
  }

  _defaultDevCounts() {
    const counts = {1:0, 2:0, 3:0, 4:0, 5:0, B:0, S:0};
    const preview = this.wave.getNextWavePreview();
    if (preview) {
      for (const [level, count] of preview) {
        counts[level] = count;
      }
    }
    return counts;
  }

  resetDevMonsterCounts() {
    this.devMonsterCounts = this._defaultDevCounts();
  }
}
