// Game: orchestrator. Owns all entities, runs the fixed-timestep loop, and
// routes input to logic.

import { RENDERER } from './rendering/renderer.js';
import { CONFIG, LAYOUT, LAYOUT_ZOOM, TROOP_SPECS, PROJECTILE_STYLES, MONSTER_DEV_ORDER } from './config.js';
import { TILE } from './grid.js';
import { PARTICLES } from './particles.js';
import { Monster } from './monster.js';
import { Troop } from './troop.js';
import { Projectile } from './projectile.js';
import { WaveManager } from './waveManager.js';
import { GameRuntimeController } from './gameRuntime.js';
import { stepNecromancerRevives } from './necromancer.js';
import { SaveSerializer, SaveRotationManager, GameWorldFactory, GameSnapshotRestorer } from './gamePersistence.js';
import { UI, UI_LAYOUT } from './ui/index.js';
import { AUDIO } from './audio.js';
import { pixelToTile, tileCenterInto, inBounds } from './utils.js';
import { renderGame, updateCursor } from './rendering/gameRenderer.js';

export class Game {
  constructor(canvas) {
    this.canvas = canvas;
    RENDERER.init(canvas);

    // Runtime controller owns worker lifecycle, pause render, resize, and
    // centralised state transitions.
    this.runtime = new GameRuntimeController(this);

    this.state = 'PRE_WAVE'; // PRE_WAVE | WAVE_ACTIVE | PAUSED | DEFEAT
    this.speed = 1;
    this.gold = CONFIG.STARTING_GOLD;
    this.lives = CONFIG.STARTING_LIVES;
    this.accumulator = 0;
    this.lastTime = 0;
    this.selectedSpec = null;
    this.selectedTroopIndex = -1;
    this.sellCooldownTimer = 0; // global seconds remaining before next sell allowed

    // Wave transition animation.
    this.waveCompleteAnim = { active: false, waveNum: 0, duration: CONFIG.WAVE_TRANSITION_DURATION };

    // World — built from a fresh seed via the persistence factory.
    this.seed = Math.floor(Math.random() * 0xffffffff);
    const world = GameWorldFactory.createFresh(this.seed);
    this.grid = world.grid;
    this.waypoints = world.waypoints;
    this.pathSegments = world.pathSegments;
    this.markPathTiles();

    // Entities.
    this.monsters = [];
    this.troops = [];
    this.projectiles = [];
    this.popups = []; // floating text popups ({text, x, y, t, color})

    // Reusable buffer for chain lightning (avoids allocation per hit).
    this._chainBuf = [];
    this._splashHitBuf = [];
    // Reusable scratch objects for zero-alloc coordinate transforms.
    this._tileScratch = { gx: 0, gy: 0 };
    this._centerScratch = { x: 0, y: 0 };
    // Reusable projectile impact callback (avoids closure allocation per projectile per frame).
    this._onProjectileImpact = (proj) => this.applyProjectileImpact(proj);
    // Tile-based spatial monster index for fast targeting.
    this._monsterTileIndex = new Array(CONFIG.GRID_SIZE * CONFIG.GRID_SIZE).fill(null);

    this._troopTileIndex = [];
    for (let i = 0; i < CONFIG.GRID_SIZE * CONFIG.GRID_SIZE; i++) this._troopTileIndex.push([]);
    this._popupPool = [];
    this._tileIndexPool = [];
    this._projectilePool = [];
    this._troopIndexByRef = new Map();
    this._troopIndexDirty = false;
    this._monsterScratchBuf = [];
    this._pendingAttackQueue = [];
    this._hasDeadEntities = false;

    this.wave = new WaveManager();

    this.runtime.installResize(canvas);

    this.devMode = false;
    this.scrollZoom = true;
    this.zoom = 1;
    this.devConfirmPending = false;
    this._goldClicks = 0;
    this._goldClickTimer = 0;
    this.resetConfirmPending = false;
    this.sellConfirmPending = false;
    this.sellConfirmTroop = null;
    this.sellConfirmationEnabled = true;
    this.devMonsterCounts = this._defaultDevCounts();
    this._needsSaveCleanup = false;
    this._lastSaveWave = 0;

    // Zoom indicator: timestamp of last zoom change, used for fade-in/out animation.
    this._zoomIndicatorTime = 0;

    // Auto-save indicator: seconds remaining to show the "Saved" badge in the HUD.
    this._autoSaveIndicatorTimer = 0;

    // Drag-to-place: when the user holds the mouse button after selecting a
    // troop from the shop, placement is deferred until release on a valid tile.
    this._dragState = null;
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

  markPathTiles() {
    for (const [gx, gy] of this.waypoints) {
      this.grid.set(gx, gy, TILE.PATH);
    }
  }

  canPlace(gx, gy, spec) {
    if (gx < 0 || gx >= CONFIG.GRID_SIZE || gy < 0 || gy >= CONFIG.GRID_SIZE) return false;
    if (!this.devMode && this.gold < spec.cost) return false;
    if (!this.grid.isBuildable(gx, gy)) return false;
    // O(1) tile index lookup instead of linear scan.
    const idx = gy * CONFIG.GRID_SIZE + gx;
    const tileTroops = this._troopTileIndex[idx];
    if (tileTroops) {
      for (let i = 0; i < tileTroops.length; i++) {
        if (tileTroops[i].alive) return false;
      }
    }
    return true;
  }

  getPlacementInvalidReason(gx, gy, spec) {
    if (!this.devMode && this.gold < spec.cost) return 'Need ' + spec.cost + 'g';
    if (!this.grid.isBuildable(gx, gy)) return 'Cannot build here';
    const idx = gy * CONFIG.GRID_SIZE + gx;
    const tileTroops = this._troopTileIndex[idx];
    if (tileTroops) {
      for (let i = 0; i < tileTroops.length; i++) {
        if (tileTroops[i].alive) return 'Tile occupied';
      }
    }
    return null;
  }

  placeTroop(spec, gx, gy) {
    if (!this.canPlace(gx, gy, spec)) return false;
    const t = new Troop(spec, gx, gy);
    this.troops.push(t);
    const cost = this.devMode ? 0 : spec.cost;
    this.gold -= cost;
    this._buildTroopTileIndex();
    AUDIO.troopPlace();
    return true;
  }

  sellTroop(index) {
    const t = this.troops[index];
    if (!t || !t.alive) return;
    if (!this.devMode && this.sellCooldownTimer > 0) return;
    t.alive = false;
    this._hasDeadEntities = true;
    this.grid.set(t.gx, t.gy, TILE.EMPTY);
    RENDERER.markCacheDirty();
    if (!this.devMode) {
      const refund = Math.ceil(t.getTotalInvested() * CONFIG.SELL_REFUND_RATIO);
      this._addGold(refund);
      this._getPopup('+' + refund, t.x, t.y, 1.2, CONFIG.COLORS.gold);
    }
    // Set global sell cooldown (3 seconds between sells).
    this.sellCooldownTimer = CONFIG.SELL_COOLDOWN;
    if (this.selectedTroopIndex === index) this.selectedTroopIndex = -1;
    this.selectedSpec = null;
    this._troopIndexDirty = true;
    AUDIO.sell();
  }

  upgradeTroopStat(index, stat) {
    const t = this.troops[index];
    if (!t || !t.alive) return;
    if (t.isMaxed(stat)) return;
    const cost = t.getUpgradeCost(stat);
    if (!this.devMode && this.gold < cost) return;
    const goldCost = this.devMode ? 0 : cost;
    this.gold -= goldCost;
    t.upgradeStat(stat);
    this._getPopup(stat.toUpperCase() + ' +1', t.x, t.y - 10, 1.2, '#f1c40f');
    AUDIO.upgrade();
  }

  // Heal a troop by 10% of max HP.
  healTroop(index) {
    const t = this.troops[index];
    if (!t || !t.alive) return;
    if (!t.canHeal()) return;
    const cost = t.getHealCost();
    if (!this.devMode && this.gold < cost) return;
    const goldCost = this.devMode ? 0 : cost;
    this.gold -= goldCost;
    t.healGoldSpent = (t.healGoldSpent || 0) + cost;
    const prevHp = t.hp;
    t.heal();
    const actual = Math.ceil(t.hp - prevHp);
    this._getPopup('+' + actual + ' HP', t.x, t.y - 10, 1.0, '#44cc44');
    AUDIO.heal();
  }

  // Buy a shield for the troop at index. One shield per troop. Cost = 50% of spec.cost.
  buyTroopShield(index) {
    const t = this.troops[index];
    if (!t || !t.alive) return false;
    if (!t.canAddShield()) return false; // already has shield (one-at-a-time)
    const cost = this.devMode ? 0 : Math.ceil(t.spec.cost * CONFIG.SHIELD_COST_RATIO);
    if (!this.devMode && this.gold < cost) return false;
    this.gold -= cost;
    t.applyShield();
    this._getPopup('SHIELD!', t.x, t.y - 12, 1.0, '#5dade2');
    if (PARTICLES && PARTICLES.troopShieldActivate) {
      PARTICLES.troopShieldActivate(t.x, t.y, t.spec.color);
      AUDIO.shieldBuy();
    }
    return true;
  }

  acquireProjectile(troop, monster, x, y) {
    let p;
    if (this._projectilePool.length > 0) {
      p = this._projectilePool.pop();
      const style = PROJECTILE_STYLES[troop.spec.id] || { color: '#fff', size: 4, speed: 10, kind: 'orb' };
      p.troop = troop;
      p.color = style.color;
      p.size = style.size;
      p.speed = style.speed * CONFIG.TILE_SIZE;
      p.kind = style.kind;
      p.x = x;
      p.y = y;
      p.target = monster;
      p.lastTargetX = monster ? monster.x : x;
      p.lastTargetY = monster ? monster.y : y;
      p.alive = true;
      p.age = 0;
      p._trailFrame = 0;
    } else {
      p = new Projectile(troop, monster, x, y);
    }
    return p;
  }

  spawnMonster(level, hpMult = 1) {
    const m = new Monster(level, this.waypoints, this.pathSegments, hpMult);
    this.monsters.push(m);
  }

  // Apply damage to a monster and queue reward popup. Returns true if killed.
  damageMonster(m, amount) {
    if (!m.alive) return false;
    // Guard: if monster HP is already zero or below, force-kill without reward
    // to prevent double-reward from the defensive kill path in step().
    if (m.hp <= 0) {
      m.alive = false;
      this._hasDeadEntities = true;
      m.reviveGlow = false;
      m._reviveGlowTimer = 0;
      return true;
    }
    const r = m.takeDamage(amount);
    if (r.killed) {
      this._hasDeadEntities = true;
      // Bonus gold per kill is baked into the kill reward path rather than
      // individual MONSTER_SPECS values so wave-estimate math stays simple.
      const awardedGold = r.reward + 1;
      this._addGold(awardedGold);
      AUDIO.goldEarned();
      this._getPopup('+' + awardedGold, m.x, m.y - 8, 1.2, CONFIG.COLORS.gold);
      PARTICLES.deathBurst(m.x, m.y, m.spec.color);
      m.reviveGlow = false;
      m._reviveGlowTimer = 0;
      // Split monster: if level > 1, spawn 2 monsters one split tier lower at this
      // position. Runner is skipped in split children.
      const noSplit = (m.spec && m.spec.noSplit === true) || (m.spec && (m.spec.attackMode || 'stop') === 'pass');
      if (!m.reviveImmune && !noSplit && typeof m.level === 'number' && m.level > 1) {
        let childLvl = m.level - 1;
        if (childLvl === 2) childLvl = 1;
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
      PARTICLES.hitSpark(m.x, m.y, '#fff');
    }
    return r.killed;
  }

  // Kill a troop that was destroyed by monsters.
  killTroop(troop) {
    troop.alive = false;
    this._hasDeadEntities = true;
    this.grid.set(troop.gx, troop.gy, TILE.EMPTY);
    RENDERER.markCacheDirty();
    PARTICLES.troopDeath(troop.x, troop.y, troop.spec.color);
    this._getPopup('\u2620 Destroyed', troop.x, troop.y - 12, 1.0, '#ff4444');
    this._troopIndexDirty = true;
    if (this.selectedTroopIndex >= 0) {
      const sel = this.troops[this.selectedTroopIndex];
      if (!sel || !sel.alive) this.selectedTroopIndex = -1;
    }
    // Clear sell confirmation if the confirmed troop was killed.
    if (this.sellConfirmPending && this.sellConfirmTroop === troop) {
      this.sellConfirmPending = false;
      this.sellConfirmTroop = null;
    }
  }

  // Apply monster melee damage to a troop.
  damageTroop(monster, troop) {
    let dmg = monster.spec.damage;
    if (monster.reviveImmune) {
      dmg = Math.max(1, Math.round(dmg * (monster.reviveDamageRatio ?? 0.5)));
    }
    if (troop.spec.type === 'melee') {
      const reduced = Math.round(dmg * CONFIG.MELEE_DAMAGE_REDUCTION);
      dmg = dmg > 0 ? Math.max(1, reduced) : reduced;
    }
    const killed = troop.takeDamage(dmg);
    this._getPopup('-' + dmg, troop.x + (Math.random() - 0.5) * 8, troop.y - 14, 0.8, '#ff6644');
    PARTICLES.hitSpark(troop.x, troop.y, '#ff8844');
    if (killed) {
      this.killTroop(troop);
    }
  }

  // DRY: Find closest alive monster near (x,y) using the tile index.
  _findClosestMonsterNear(x, y, rangeTiles = 1) {
    let closest = null;
    let closestDist = Infinity;
    const gx0 = (x / CONFIG.TILE_SIZE) | 0;
    const gy0 = (y / CONFIG.TILE_SIZE) | 0;
    const G = CONFIG.GRID_SIZE;
    const r = Math.ceil(rangeTiles);
    for (let dgy = -r; dgy <= r; dgy++) {
      for (let dgx = -r; dgx <= r; dgx++) {
        const gx = gx0 + dgx;
        const gy = gy0 + dgy;
        if (gx < 0 || gx >= G || gy < 0 || gy >= G) continue;
        const arr = this._monsterTileIndex[gy * G + gx];
        if (!arr) continue;
        for (let i = 0; i < arr.length; i++) {
          const m = arr[i];
          if (!m.alive) continue;
          const dx = m.x - x;
          const dy = m.y - y;
          const dSq = dx * dx + dy * dy;
          if (dSq < closestDist) {
            closestDist = dSq;
            closest = m;
          }
        }
      }
    }
    return closest;
  }

  // DRY: Apply slow effect to a monster from a troop.
  _applySlowToMonster(monster, troop) {
    if (monster.applySlow(troop._cachedSlowFactor, troop._cachedSlowDuration, troop._cachedShatterBonus)) {
      PARTICLES.slowApply(monster.x, monster.y, troop.spec.color);
    }
  }

  applyBurn(monster, troop) {
    if (!monster || !monster.alive || !troop || !troop.spec.burnStacks) return false;
    const duration = troop.spec.burnDuration || CONFIG.FLAME_BURN_DURATION;
    const tickInterval = troop.spec.burnTickInterval || CONFIG.FLAME_BURN_TICK_INTERVAL;
    const ratio = troop.spec.burnDamageRatio ?? CONFIG.FLAME_BURN_DAMAGE_RATIO;
    const tickDamage = Math.max(1, Math.round(troop._cachedDamage * ratio));
    const applied = monster.applyBurn(1, duration, tickInterval, tickDamage, (m, dmg) => {
      this.damageMonster(m, dmg);
      PARTICLES.burnTick?.(m.x, m.y);
    });
    if (applied) PARTICLES.burnApply?.(monster.x, monster.y, troop.spec.color);
    return applied;
  }

  // DRY: Add gold with MAX_GOLD cap.
  _addGold(amount) {
    if (this.devMode) {
      this.gold = Infinity;
      return;
    }
    this.gold = Math.min(this.gold + amount, CONFIG.MAX_GOLD);
  }

  // One fixed-timestep simulation step.
  step(dt) {
    if (this.state === 'PAUSED' || this.state === 'DEFEAT') return;
    this._stepWaveSpawning(dt);
    this._stepTroops(dt);
    this._stepProjectiles(dt);
    this._stepMonsters(dt);
    if (this.state === 'DEFEAT') return;
    this._stepMonsterAttacks();
    this._stepNecromancerRevives();
    this._cleanupDead();
    this._stepWaveCompletion();
    this._stepPopups(dt);
    if (this.sellCooldownTimer > 0) {
      this.sellCooldownTimer = Math.max(0, this.sellCooldownTimer - dt);
    }
    this._updateMonsterTileIndex();
    PARTICLES.update(dt);
    // Decay the auto-save indicator timer
    if (this._autoSaveIndicatorTimer > 0) {
      this._autoSaveIndicatorTimer = Math.max(0, this._autoSaveIndicatorTimer - dt);
    }
  }

  _stepWaveSpawning(dt) {
    this.wave.update(dt);
    let spawnData = this.wave.popDueMonster();
    let spawnsThisFrame = 0;
    const MAX_SPAWNS_PER_FRAME = CONFIG.MAX_SPAWNS_PER_FRAME;
    while (spawnData != null && spawnsThisFrame < MAX_SPAWNS_PER_FRAME) {
      this.spawnMonster(spawnData.level, spawnData.hpMult);
      spawnsThisFrame++;
      spawnData = this.wave.popDueMonster();
    }
  }

  _stepTroops(dt) {
    for (let i = 0; i < this.troops.length; i++) {
      const t = this.troops[i];
      if (!t.alive) continue;
      t.update(dt, this.monsters, this.projectiles, this);
    }
  }

  _stepProjectiles(dt) {
    for (let i = 0; i < this.projectiles.length; i++) {
      const p = this.projectiles[i];
      if (!p.alive) continue;
      p.update(dt, this.monsters, this._onProjectileImpact);
    }
  }

  // This loop only marks monsters dead; actual array compaction happens later
  // in _cleanupDead, so mutating this.monsters here would break iteration.
  _stepMonsters(dt) {
    const monsterCount = this.monsters.length;
    for (let i = 0; i < monsterCount; i++) {
      const m = this.monsters[i];
      if (!m.alive) continue;
      if (m.hp <= 0) {
        console.warn('[game] Monster HP desync on frame — force-killing without reward.', {
          level: m.level,
          hp: m.hp,
          x: m.x,
          y: m.y,
        });
        m.alive = false;
        this._hasDeadEntities = true;
        continue;
      }
      m.update(dt, this._troopTileIndex, this.monsters);
      if (m._pendingAttack) this._pendingAttackQueue.push(m);
      if (!m.reachedEnd) continue;
      m.alive = false;
      this._hasDeadEntities = true;
      if (this.devMode) continue;
      const leak = m.leak || 0;
      this.lives -= leak;
      this._getPopup('-' + leak, m.x, m.y - 8, 1.0, CONFIG.COLORS.heart);
      AUDIO.monsterLeak();
      if (this.lives <= 0) {
        this.runtime.applyDefeat();
        break;
      }
    }
  }

  _stepMonsterAttacks() {
    const queue = this._pendingAttackQueue;
    if (queue.length > 0) {
      // Fast path: process the queue collected by _stepMonsters().
      for (let i = 0; i < queue.length; i++) {
        const m = queue[i];
        if (!m.alive) continue;
        const target = m._pendingAttack;
        m._pendingAttack = null;
        if (!target) continue;
        if (target.alive && m.tileDistanceTo(target.gx, target.gy) <= m.spec.attackRange) {
          this.damageTroop(m, target);
        }
      }
      queue.length = 0;
    } else {
      // Fallback: scan all monsters (for direct calls by tests/gamePersistence restoration).
      for (let i = 0; i < this.monsters.length; i++) {
        const m = this.monsters[i];
        if (!m.alive || !m._pendingAttack) continue;
        const target = m._pendingAttack;
        m._pendingAttack = null;
        if (target.alive && m.tileDistanceTo(target.gx, target.gy) <= m.spec.attackRange) {
          this.damageTroop(m, target);
        }
      }
    }
  }

  _stepNecromancerRevives() {
    stepNecromancerRevives(this);
  }

  _cleanupDead() {
    // Skip compaction if nothing has died since the last cleanup.
    // The flag is set by all game methods that kill entities (sellTroop,
    // damageMonster, killTroop, _stepMonsters).  As a fallback (for tests
    // that directly mutate .alive), scan both arrays once.
    if (!this._hasDeadEntities) {
      let anyDead = false;
      for (let i = 0; i < this.monsters.length; i++) {
        if (!this.monsters[i].alive) {
          anyDead = true;
          break;
        }
      }
      if (!anyDead) {
        for (let i = 0; i < this.projectiles.length; i++) {
          if (!this.projectiles[i].alive) {
            anyDead = true;
            break;
          }
        }
      }
      if (!anyDead) {
        for (let i = 0; i < this.troops.length; i++) {
          if (!this.troops[i].alive) {
            anyDead = true;
            break;
          }
        }
      }
      if (!anyDead) return;
    }
    this._hasDeadEntities = false;
    let mw = 0;
    for (let i = 0; i < this.monsters.length; i++) {
      if (this.monsters[i].alive) this.monsters[mw++] = this.monsters[i];
      else if (this.monsters[i]._hitTroops) this.monsters[i]._hitTroops.clear();
    }
    this.monsters.length = mw;
    let pw = 0;
    for (let i = 0; i < this.projectiles.length; i++) {
      const p = this.projectiles[i];
      if (p.alive) {
        this.projectiles[pw++] = p;
      } else {
        this._projectilePool.push(p);
      }
    }
    this.projectiles.length = pw;
    const selRef = this.selectedTroopIndex >= 0 ? this.troops[this.selectedTroopIndex] : null;
    let tw = 0;
    let newSelIdx = -1;
    for (let i = 0; i < this.troops.length; i++) {
      if (this.troops[i].alive) {
        if (this.troops[i] === selRef) newSelIdx = tw;
        this.troops[tw++] = this.troops[i];
      }
    }
    this.troops.length = tw;
    this.selectedTroopIndex = selRef && selRef.alive ? newSelIdx : -1;
    if (this._troopIndexDirty) this._buildTroopTileIndex();
  }

  _stepWaveCompletion() {
    if (this.state !== 'WAVE_ACTIVE') return;
    if (this.wave.spawnIndex < this.wave.queue.length) return;
    if (this.monsters.length > 0) return;
    const waveNum = this.wave.currentWave + 1;
    this.waveCompleteAnim = {
      active: true,
      waveNum: waveNum,
      startMs: performance.now(),
      duration: CONFIG.WAVE_TRANSITION_DURATION,
    };
    AUDIO.waveComplete();
    if (waveNum % 10 === 0) {
      const bonus = Math.min(CONFIG.BOSS_BONUS_BASE + waveNum * CONFIG.BOSS_BONUS_PER_WAVE, CONFIG.BOSS_BONUS_MAX);
      this._addGold(bonus);
      this._centerScratch.x = RENDERER.width / 2;
      this._centerScratch.y = RENDERER.height / 2 - 40;
      RENDERER.toWorldInto(this._centerScratch.x, this._centerScratch.y, this._centerScratch);
      this._getPopup(
        '+' + bonus + ' Boss Bonus!',
        this._centerScratch.x,
        this._centerScratch.y,
        2.0,
        CONFIG.COLORS.gold
      );
    }
    this.wave.onAllSpawnedAndCleared();
    if (waveNum % CONFIG.SHIELD_EXPIRE_WAVES === 0) {
      for (let i = 0; i < this.troops.length; i++) {
        const t = this.troops[i];
        if (t.shield > 0) t.clearShield();
      }
    }
    this.state = 'PRE_WAVE';
    // Debounce auto-save: only save every N waves to reduce disk I/O.
    if (waveNum - this._lastSaveWave >= CONFIG.AUTO_SAVE_DEBOUNCE_WAVES) {
      this._lastSaveWave = waveNum;
      this._autoSave();
    }
  }

  _stepPopups(dt) {
    let ppw = 0;
    for (let i = 0; i < this.popups.length; i++) {
      const p = this.popups[i];
      p.t -= dt;
      if (p.t > 0) {
        this.popups[ppw++] = p;
      } else if (this._popupPool.length < CONFIG.MAX_POPUP_POOL) {
        this._popupPool.push(p);
      }
    }
    this.popups.length = ppw;
  }

  // Fixed-timestep sim tick shared by worker and fallback paths.
  _runSimTick(now) {
    try {
      const realDt = Math.min((now - this.lastTime) / 1000, 0.1);
      this.lastTime = now;
      if (this.state === 'PAUSED' || this.state === 'DEFEAT') {
        renderGame(this);
        updateCursor(this);
        return;
      }
      const fixed = CONFIG.FIXED_TIMESTEP;
      this.accumulator += realDt * this.speed;
      const maxSteps = Math.max(8, this.speed * 4);
      this.accumulator = Math.min(this.accumulator, fixed * maxSteps);
      let safety = maxSteps;
      while (this.accumulator >= fixed && safety-- > 0) {
        this.step(fixed);
        this.accumulator -= fixed;
      }
      renderGame(this);
      // Frame-budget check for particle auto-throttle.
      PARTICLES._checkFrameBudget(performance.now() - now);
      updateCursor(this);
    } catch (err) {
      console.error('[Game] Sim tick crashed:', err);
      // Show crash state on canvas instead of white-screening.
      try {
        const c = RENDERER.ctx;
        if (c) {
          c.fillStyle = '#0e1418';
          c.fillRect(0, 0, RENDERER.width, RENDERER.height);
          c.fillStyle = '#da3633';
          c.font = 'bold 20px system-ui, sans-serif';
          c.textAlign = 'center';
          c.textBaseline = 'middle';
          c.fillText('Game Error — Press R to restart', RENDERER.width / 2, RENDERER.height / 2 - 10);
          c.fillStyle = 'rgba(255,255,255,0.4)';
          c.font = '12px system-ui, sans-serif';
          c.fillText(err.message || String(err), RENDERER.width / 2, RENDERER.height / 2 + 16);
        }
      } catch (_) {
        /* render fallback failed, nothing more to do */
      }
    }
  }

  // Build tile-based spatial index of alive monsters for fast targeting.
  // Uses incremental updates: only moves monsters between tiles when they
  // cross tile boundaries, instead of rebuilding the entire index every frame.
  _updateMonsterTileIndex() {
    const tiIdx = this._monsterTileIndex;
    const tiPool = this._tileIndexPool;
    const G = CONFIG.GRID_SIZE;
    const T = CONFIG.TILE_SIZE;
    const monsters = this.monsters;

    for (let i = 0; i < monsters.length; i++) {
      const m = monsters[i];
      const prevIdx = m._prevTileIdx;

      if (!m.alive) {
        // Remove dead monster from its previous tile (swap-remove).
        if (prevIdx >= 0 && tiIdx[prevIdx]) {
          const arr = tiIdx[prevIdx];
          const pos = m._tileArrayPos;
          if (pos >= 0 && pos < arr.length && arr[pos] === m) {
            const last = arr.length - 1;
            if (pos !== last) {
              arr[pos] = arr[last];
              arr[pos]._tileArrayPos = pos;
            }
            arr.pop();
            if (arr.length === 0) {
              tiPool.push(arr);
              tiIdx[prevIdx] = null;
            }
          }
        }
        m._prevTileIdx = -1;
        m._tileArrayPos = -1;
        continue;
      }

      const gx = Math.max(0, Math.min(G - 1, (m.x / T) | 0));
      const gy = Math.max(0, Math.min(G - 1, (m.y / T) | 0));
      const idx = gy * G + gx;

      if (idx === prevIdx) continue; // no tile change, already indexed

      // Remove from old tile (swap-remove).
      if (prevIdx >= 0 && tiIdx[prevIdx]) {
        const arr = tiIdx[prevIdx];
        const pos = m._tileArrayPos;
        if (pos >= 0 && pos < arr.length && arr[pos] === m) {
          const last = arr.length - 1;
          if (pos !== last) {
            arr[pos] = arr[last];
            arr[pos]._tileArrayPos = pos;
          }
          arr.pop();
          if (arr.length === 0) {
            tiPool.push(arr);
            tiIdx[prevIdx] = null;
          }
        }
      }

      // Add to new tile.
      let arr = tiIdx[idx];
      if (!arr) {
        arr = tiPool.length > 0 ? tiPool.pop() : [];
        tiIdx[idx] = arr;
      }
      arr.push(m);
      m._prevTileIdx = idx;
      m._tileArrayPos = arr.length - 1;
    }
  }

  _buildTroopTileIndex() {
    this._troopIndexDirty = false;
    // Only clear tiles that actually had troops (avoids iterating all 256 tiles
    // when only 10–20 are ever occupied).
    const cleared = new Set();
    for (const [troop] of this._troopIndexByRef) {
      const idx = troop.gy * CONFIG.GRID_SIZE + troop.gx;
      if (!cleared.has(idx)) {
        cleared.add(idx);
        this._troopTileIndex[idx].length = 0;
      }
    }
    this._troopIndexByRef.clear();
    for (let i = 0; i < this.troops.length; i++) {
      const t = this.troops[i];
      if (!t.alive) continue;
      const idx = t.gy * CONFIG.GRID_SIZE + t.gx;
      if (idx >= 0 && idx < this._troopTileIndex.length) {
        this._troopTileIndex[idx].push(t);
        this._troopIndexByRef.set(t, i);
      }
    }
  }

  // Apply chain / splash / single-hit damage at a position.
  _applyHitAtPosition(x, y, troop, dmg, hasSlow) {
    if (troop.spec.chain > 0) {
      this.chainHitAt(x, y, troop);
    } else if (troop.spec.splash > 0) {
      const hit = this.splashAt(x, y, dmg, troop.spec.splash, troop);
      if (hasSlow) {
        for (let i = 0; i < hit.length; i++) this._applySlowToMonster(hit[i], troop);
      }
    } else {
      const closest = this._findClosestMonsterNear(x, y, troop._cachedRange);
      if (closest) {
        const killed = this.damageMonster(closest, dmg);
        if (hasSlow && !killed) this._applySlowToMonster(closest, troop);
      }
    }
  }

  // Apply damage + optional AoE from a projectile. Also handles reward.
  applyProjectileImpact(proj) {
    const dmg = proj.troop._cachedDamage;
    const troop = proj.troop;
    const hasSlow = troop.spec.slowFactor && troop._cachedSlowFactor !== undefined;
    const target = proj.target;

    if (target && target.alive) {
      this._applyHitAtPosition(target.x, target.y, troop, dmg, hasSlow);
      if (troop.spec.chain > 0 && hasSlow && target.alive) {
        this._applySlowToMonster(target, troop);
      }
    } else {
      this._applyHitAtPosition(proj.lastTargetX, proj.lastTargetY, troop, dmg, hasSlow);
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

    // Apply stun + damage to a single target.
    const applyHit = (m, srcX, srcY) => {
      if (!m.alive) return null;
      const countBefore = this.monsters.length;
      // Shielded monsters are immune to stun while shield is active.
      if (stunDuration > 0 && m.shield <= 0) m.stunTimer = Math.max(m.stunTimer, stunDuration);
      const hadShield = m.shield > 0;
      this.damageMonster(m, damage);
      this._getPopup('\u26A1', m.x, m.y - 12, 0.6, '#f1c40f');
      // Stun any children spawned by split (only if parent was not shielded).
      if (stunDuration > 0 && !hadShield) {
        for (let j = countBefore; j < this.monsters.length; j++) {
          this.monsters[j].stunTimer = Math.max(this.monsters[j].stunTimer, stunDuration);
        }
      }
      PARTICLES.chainSpark(srcX, srcY);
      return m;
    };

    // Find primary target using tile index.
    let closest = this._findClosestMonsterNear(x, y, troop._cachedRange);
    if (!closest) return;

    let lastX = closest.x,
      lastY = closest.y;
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
        const dx = m.x - lastX,
          dy = m.y - lastY;
        const dSq = dx * dx + dy * dy;
        if (dSq < bestDist) {
          bestDist = dSq;
          best = m;
          bestIdx = j;
        }
      }
      if (!best || bestDist > maxChainDist * maxChainDist) break; // too far, stop chaining
      const srcX = lastX;
      const srcY = lastY;
      lastX = best.x;
      lastY = best.y;
      applyHit(best, srcX, srcY);
      // Remove hit monster from buffer to prevent re-hitting the same target.
      if (bestIdx >= 0) {
        const last = buf.length - 1;
        if (bestIdx !== last) {
          buf[bestIdx] = buf[last];
        }
        buf.length = last;
        i--;
      }
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
    const hitMonsters = this._splashHitBuf;
    hitMonsters.length = 0;
    for (let dgy = -ceilR; dgy <= ceilR; dgy++) {
      for (let dgx = -ceilR; dgx <= ceilR; dgx++) {
        const gx = cgx + dgx,
          gy = cgy + dgy;
        if (gx < 0 || gx >= G || gy < 0 || gy >= G) continue;
        const arr = this._monsterTileIndex[gy * G + gx];
        if (!arr) continue;
        for (let i = 0; i < arr.length; i++) {
          const m = arr[i];
          if (!m.alive) continue;
          const dx = m.x - x,
            dy = m.y - y;
          const dSq = dx * dx + dy * dy;
          if (dSq <= rSq) {
            const falloff = 1 - 0.5 * (Math.sqrt(dSq) * rInv);
            const dmg = Math.max(1, Math.round(damage * falloff));
            this.damageMonster(m, dmg);
            if (m.alive) hitMonsters.push(m);
          }
        }
      }
    }
    PARTICLES.splashImpact(x, y, troop ? troop.spec.color : '#9b59b6');
    return hitMonsters;
  }

  start() {
    this.runtime.startLoop(this.canvas);
  }

  // ===== Input =====
  onMouseDown(px, py, button) {
    if (this.state === 'DEFEAT') return;
    if (button === 2) {
      this.selectedSpec = null;
      this.selectedTroopIndex = -1;
      this._dragState = null;
      return;
    }
    if (UI.handleToggleClick(px, py)) return;
    if (this.devConfirmPending || this.resetConfirmPending || this.sellConfirmPending) {
      this._handleConfirmationClicks(px, py);
      return;
    }
    this._handleGoldClick(px, py);
    this._handleHUDClicks(px, py);
    this._handleShopClick(px, py);
    this._handleShieldBuyClick(px, py);
    this._handleHealClick(px, py);
    this._handleSellClick(px, py);
    this._handleUpgradeClicks(px, py);
    this._handleMapClick(px, py);
  }

  onMouseUp(px, py) {
    if (!this._dragState) return;
    const { spec } = this._dragState;
    this._dragState = null;
    if (!spec) return;
    this._tryPlaceFromPointer(px, py, spec);
  }

  _hitBox(px, py, box) {
    return box && px >= box.x && px <= box.x + box.w && py >= box.y && py <= box.y + box.h;
  }

  _handleConfirmationClicks(px, py) {
    if (this._hitBox(px, py, UI._devConfirmYes)) {
      if (this.sellConfirmPending) {
        this.sellConfirmPending = false;
        const ref = this.sellConfirmTroop;
        if (ref && ref.alive) {
          const idx = this.troops.indexOf(ref);
          if (idx >= 0) this.sellTroop(idx);
        }
        this.sellConfirmTroop = null;
      } else if (this.resetConfirmPending) {
        this.resetConfirmPending = false;
        this.resetGame();
      } else {
        this.devConfirmPending = false;
        this.toggleDevMode();
      }
      return;
    }
    if (this._hitBox(px, py, UI._devConfirmNo)) {
      this.devConfirmPending = false;
      this.resetConfirmPending = false;
      this.sellConfirmPending = false;
      this.sellConfirmTroop = null;
      return;
    }
  }

  _handleGoldClick(px, py) {
    if (!this._hitBox(px, py, LAYOUT.HUD.GOLD_AREA)) return;
    const now = performance.now();
    if (now - this._goldClickTimer > CONFIG.DEV_MODE_CLICK_WINDOW_MS) this._goldClicks = 0;
    this._goldClickTimer = now;
    this._goldClicks++;
    if (this._goldClicks >= CONFIG.DEV_MODE_CLICK_THRESHOLD) {
      this._goldClicks = 0;
      this.devConfirmPending = true;
    }
  }

  _handleHUDClicks(px, py) {
    if (UI_LAYOUT.collapsed.hud) return;
    const rstBtn = UI._resetBtn || LAYOUT.HUD.RESET_BTN;
    if (this._hitBox(px, py, rstBtn)) {
      this.resetConfirmPending = true;
      return;
    }
    const w = RENDERER.width;
    const sOff = UI._speedBtnOffsetY || 0;
    const sGap = UI._speedBtnGap || 28;
    for (let i = 0; i < CONFIG.GAME_SPEEDS.length; i++) {
      const r = {
        x: w - LAYOUT.HUD.SPEED_OFFSET + i * sGap,
        y: sOff + 14,
        w: LAYOUT.HUD.SPEED_BTN_W,
        h: UI._speedBtnH || LAYOUT.HUD.SPEED_BTN_H,
      };
      if (this._hitBox(px, py, r)) {
        this.speed = CONFIG.GAME_SPEEDS[i];
        return;
      }
    }
    const btn = {
      x: w - LAYOUT.HUD.CTRL_RIGHT,
      y: LAYOUT.HUD.CTRL_BTN.y,
      w: LAYOUT.HUD.CTRL_BTN.w,
      h: LAYOUT.HUD.CTRL_BTN.h,
    };
    if (this._hitBox(px, py, btn)) {
      if (this.state === 'PRE_WAVE') {
        this.runtime.startWave();
      } else {
        this.runtime.togglePause();
      }
    }
  }

  _handleShopClick(px, py) {
    const shopIdx = UI.hitShop(px, py);
    if (shopIdx >= 0) {
      const spec = TROOP_SPECS[shopIdx];
      if (this.selectedSpec === spec) {
        // Clicking the already-selected card starts drag-to-place.
        this._dragState = { spec, started: true };
      } else {
        this.selectedSpec = spec;
        this.selectedTroopIndex = -1;
      }
    }
  }

  _handleShieldBuyClick(px, py) {
    if (!UI_LAYOUT.collapsed.shieldShop && UI._shieldBuyBtn && this._hitBox(px, py, UI._shieldBuyBtn)) {
      this.buyTroopShield(this.selectedTroopIndex);
    }
  }

  _handleHealClick(px, py) {
    if (this.selectedTroopIndex < 0 || UI_LAYOUT.collapsed.shop) return;
    const t = this.troops[this.selectedTroopIndex];
    if (!t || !t.alive || !t.canHeal()) return;
    const healBtn = {
      x: LAYOUT.SHOP.BTN_PAD,
      y: RENDERER.height - LAYOUT.SHOP.HEAL_BTN_Y_OFFSET,
      w: UI_LAYOUT.SHOP_WIDTH - LAYOUT.SHOP.SEW,
      h: LAYOUT.SHOP.HEAL_BTN_H,
    };
    if (this._hitBox(px, py, healBtn)) {
      this.healTroop(this.selectedTroopIndex);
    }
  }

  _handleSellClick(px, py) {
    if (this.selectedTroopIndex < 0 || UI_LAYOUT.collapsed.shop) return;
    const sellBtn = {
      x: LAYOUT.SHOP.BTN_PAD,
      y: RENDERER.height - LAYOUT.SHOP.SELL_BTN_Y_OFFSET,
      w: UI_LAYOUT.SHOP_WIDTH - LAYOUT.SHOP.SEW,
      h: LAYOUT.SHOP.SELL_BTN_H,
    };
    if (this._hitBox(px, py, sellBtn)) {
      if (this.devMode) {
        this.sellTroop(this.selectedTroopIndex);
      } else {
        this.sellConfirmTroop = this.troops[this.selectedTroopIndex];
        this.sellConfirmPending = true;
      }
    }
  }

  _handleUpgradeClicks(px, py) {
    if (this.selectedTroopIndex < 0 || UI_LAYOUT.collapsed.shop) return;
    const t = this.troops[this.selectedTroopIndex];
    if (!t || !t.alive) return;
    const stats = ['dmg', 'range', 'speed', 'chain', 'slow', 'hp'];
    const btnPad = LAYOUT.SHOP.BTN_PAD;
    const btnGap = LAYOUT.SHOP.BTN_GAP;
    let visibleCount = 0;
    for (const stat of stats) {
      if (t.canUpgrade(stat)) visibleCount++;
    }
    const statBtnW =
      visibleCount > 0
        ? Math.floor((UI_LAYOUT.SHOP_WIDTH - btnPad * 2 - btnGap * (visibleCount - 1)) / visibleCount)
        : 49;
    let visibleBtnIdx = 0;
    for (let i = 0; i < stats.length; i++) {
      const stat = stats[i];
      if (!t.canUpgrade(stat)) continue;
      const btn = {
        x: btnPad + visibleBtnIdx * (statBtnW + btnGap),
        y: RENDERER.height - LAYOUT.SHOP.UPGRADE_BTN_Y_OFFSET,
        w: statBtnW,
        h: LAYOUT.SHOP.UPGRADE_BTN_H,
      };
      visibleBtnIdx++;
      if (this._hitBox(px, py, btn)) {
        this.upgradeTroopStat(this.selectedTroopIndex, stat);
        return;
      }
    }
  }

  _handleMapClick(px, py) {
    const tile = this._pixelToGameTile(px, py);
    if (!tile) return;
    const tIdx = this.findTroopAtTile(tile.gx, tile.gy);
    if (tIdx >= 0) {
      this.selectedTroopIndex = tIdx;
      this.selectedSpec = null;
      return;
    }
    if (this.selectedSpec) {
      if (this.placeTroop(this.selectedSpec, tile.gx, tile.gy)) {
        // Keep selected for repeat placement.
      } else {
        const reason = this.getPlacementInvalidReason(tile.gx, tile.gy, this.selectedSpec) || 'Invalid!';
        tileCenterInto(tile.gx, tile.gy, this._centerScratch);
        this._getPopup(reason, this._centerScratch.x, this._centerScratch.y, 1.0, '#da3633');
        this.selectedTroopIndex = -1;
      }
      return;
    }
    this.selectedTroopIndex = -1;
  }

  findTroopAtTile(gx, gy) {
    if (gx < 0 || gy < 0 || gx >= CONFIG.GRID_SIZE || gy >= CONFIG.GRID_SIZE) return -1;
    const idx = gy * CONFIG.GRID_SIZE + gx;
    const tileTroops = this._troopTileIndex[idx];
    if (!tileTroops) return -1;
    for (let i = 0; i < tileTroops.length; i++) {
      const troop = tileTroops[i];
      if (troop.alive) return this._troopIndexByRef.get(troop) ?? -1;
    }
    return -1;
  }

  togglePopupEl(popupId, collapsed, btnId) {
    const popup = document.getElementById(popupId);
    const btn = document.getElementById(btnId);
    if (collapsed) {
      if (popup) popup.classList.add('bar-popup--closed');
      if (btn) btn.classList.remove('active');
    } else {
      if (popup) popup.classList.remove('bar-popup--closed');
      if (btn) btn.classList.add('active');
    }
  }

  getSaveData() {
    return SaveSerializer.fromGame(this, this.appVersion);
  }

  restore(data) {
    GameSnapshotRestorer.apply(this, data);
    this.sellCooldownTimer = 0;
    this.devConfirmPending = false;
    this.resetConfirmPending = false;
    this.sellConfirmPending = false;
    this.sellConfirmTroop = null;
    this.selectedSpec = null;
    this.selectedTroopIndex = -1;
    this.waveCompleteAnim = { active: false, waveNum: 0, duration: CONFIG.WAVE_TRANSITION_DURATION };
    this.lastTime = 0;
    this.accumulator = 0;
    this._lastSaveWave = this.wave.currentWave;
    this._autoSaveIndicatorTimer = 0;
    this._onProjectileImpact = (proj) => this.applyProjectileImpact(proj);
  }

  _autoSave() {
    if (!window.electron || !window.electron.saveGame) return;
    // Legacy cleanup: if _needsSaveCleanup is set, delete all old single-file saves
    if (this._needsSaveCleanup && window.electron.deleteSave) {
      window.electron.deleteSave();
      this._needsSaveCleanup = false;
    }
    // Save rotation: pick the LRU auto-save slot and write to it
    this._saveToRotationSlot(this.getSaveData());
    // Show the auto-save badge in the HUD for 2 seconds
    this._autoSaveIndicatorTimer = 2.0;
  }

  /** Save to the LRU auto-save slot. */
  async _saveToRotationSlot(saveData) {
    if (!window.electron || !window.electron.listSaves) {
      // Fallback: single-file save
      if (window.electron.saveGame) window.electron.saveGame(saveData);
      return;
    }
    try {
      const existing = await window.electron.listSaves();
      // Filter to auto-save slots only
      const autoSaves = Array.isArray(existing)
        ? existing.filter((e) => e && e.slot && e.slot.startsWith('autosave.'))
        : [];
      const slot = SaveRotationManager.selectSlotForWrite(autoSaves);
      await window.electron.saveGameSlot(slot, saveData);
    } catch (_) {
      // Fallback to legacy save on error
      if (window.electron.saveGame) window.electron.saveGame(saveData);
    }
  }

  /** Save to a manual named slot. Returns boolean. */
  async saveToSlot(slotName) {
    if (!window.electron || !window.electron.saveGameSlot) return false;
    try {
      const data = SaveSerializer.fromGame(this, this.appVersion, true);
      await window.electron.saveGameSlot(slotName, data);
      return true;
    } catch (_) {
      return false;
    }
  }

  /** Load from a named slot. Returns boolean for success. */
  async loadFromSlot(slotName) {
    if (!window.electron || !window.electron.loadGameSlot) return false;
    try {
      const data = await window.electron.loadGameSlot(slotName);
      if (!data) return false;
      this.restore(data);
      return true;
    } catch (_) {
      return false;
    }
  }

  /** List all save slots with metadata. */
  async listSaves() {
    if (!window.electron || !window.electron.listSaves) return [];
    try {
      return await window.electron.listSaves();
    } catch (_) {
      return [];
    }
  }

  /** Delete a save slot. Returns boolean. */
  async deleteSlot(slotName) {
    if (!window.electron || !window.electron.deleteSaveSlot) return false;
    try {
      return await window.electron.deleteSaveSlot(slotName);
    } catch (_) {
      return false;
    }
  }

  // DRY: Convert pixel coords to tile coords, checking that the point is
  // within the gameplay area (not in HUD/shop/shieldShop panels).
  // Returns the tile scratch object or null if out-of-bounds / in a panel.
  _pixelToGameTile(px, py) {
    const shieldShopRight = RENDERER.width - UI_LAYOUT.shieldShopWidth;
    // UI_LAYOUT.hudHeight automatically includes the 2-line extra height
    if (
      px < UI_LAYOUT.shopWidth ||
      py < UI_LAYOUT.hudHeight ||
      py > RENDERER.height - UI_LAYOUT.previewHeight ||
      px > shieldShopRight
    ) {
      return null;
    }
    RENDERER.toWorldInto(px, py, this._centerScratch);
    pixelToTile(this._centerScratch.x, this._centerScratch.y, this._tileScratch);
    if (!inBounds(this._tileScratch.gx, this._tileScratch.gy)) return null;
    return this._tileScratch;
  }

  _tryPlaceFromPointer(px, py, spec) {
    const tile = this._pixelToGameTile(px, py);
    if (!tile) return;
    if (this.placeTroop(spec, tile.gx, tile.gy)) {
      this.selectedSpec = spec;
    } else {
      const reason = this.getPlacementInvalidReason(tile.gx, tile.gy, spec) || 'Invalid!';
      tileCenterInto(tile.gx, tile.gy, this._centerScratch);
      this._getPopup(reason, this._centerScratch.x, this._centerScratch.y, 1.0, '#da3633');
      this.selectedSpec = null;
    }
  }

  // ===== Popup/shortcuts =====
  onKeyDown(e) {
    // Restart.
    if ((e.key === 'r' || e.key === 'R') && this.state === 'DEFEAT') {
      e.preventDefault();
      this.restart();
      return;
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      this.selectedSpec = null;
      this.selectedTroopIndex = -1;
      return;
    }
    if (e.key === ' ') {
      e.preventDefault();
      this.runtime.togglePause();
      return;
    }
    if (e.key === 'Enter' && this.state === 'PRE_WAVE') {
      e.preventDefault();
      if (this.devMode) this.wave.buildCustomFromCounts(this.devMonsterCounts);
      this.runtime.startWave();
      return;
    }
    // Panel toggle shortcuts (bar popups): Alt+C (Controls), Alt+M (Monsters), Alt+U (Settings), Alt+D (Dev)
    if (e.altKey) this._handlePopupShortcut(e);

    // Zoom shortcuts: Ctrl + / Ctrl - / Ctrl 0
    if (e.ctrlKey && this.scrollZoom !== false) {
      if (e.key === '+' || e.key === '=') {
        e.preventDefault();
        this.zoom = Math.min(2, (this.zoom || 1) + 0.1);
        this._applyZoom();
        return;
      }
      if (e.key === '-') {
        e.preventDefault();
        this.zoom = Math.max(1, (this.zoom || 1) - 0.1);
        this._applyZoom();
        return;
      }
      if (e.key === '0') {
        e.preventDefault();
        this.zoom = 1;
        this._applyZoom();
        return;
      }
    }
  }

  _applyZoom() {
    UI_LAYOUT._zoom = this.zoom || 1;
    LAYOUT_ZOOM.value = this.zoom || 1;
    RENDERER.resize();
    this._zoomIndicatorTime = performance.now();
  }

  _handlePopupShortcut(e) {
    const popupKeys = [
      { key: 'c', popupId: 'controls-popup', collapsedKey: 'help', btnId: 'bar-controls-btn' },
      { key: 'm', popupId: 'monster-popup', collapsedKey: 'monsterInfo', btnId: 'bar-monster-btn' },
      { key: 'u', popupId: 'settings-popup', collapsedKey: 'settings', btnId: 'bar-settings-btn' },
      { key: 'd', popupId: 'dev-popup', collapsedKey: 'dev', btnId: 'bar-dev-btn' },
    ];
    const match = popupKeys.find((p) => e.key.toLowerCase() === p.key);
    if (!match) return;
    e.preventDefault();
    // If already open, close it.
    if (!UI_LAYOUT.collapsed[match.collapsedKey]) {
      this.togglePopupEl(match.popupId, true, match.btnId);
      return;
    }
    // Find any currently open popup and close it, wait for animation, then open target.
    const openKey = popupKeys.find((p) => !UI_LAYOUT.collapsed[p.collapsedKey]);
    if (!openKey) {
      UI_LAYOUT.collapsed[match.collapsedKey] = false;
      this.togglePopupEl(match.popupId, false, match.btnId);
      return;
    }
    this.togglePopupEl(openKey.popupId, true, openKey.btnId);
    const el = document.getElementById(openKey.popupId);
    let opened = false;
    const openFn = () => {
      if (opened) return;
      opened = true;
      UI_LAYOUT.collapsed[match.collapsedKey] = false;
      this.togglePopupEl(match.popupId, false, match.btnId);
    };
    if (!el) {
      openFn();
      return;
    }
    const onDone = () => {
      el.removeEventListener('transitionend', onDone);
      clearTimeout(fallbackTimer);
      openFn();
    };
    el.addEventListener('transitionend', onDone);
    const fallbackTimer = setTimeout(openFn, CONFIG.POPUP_ANIM_MS + 50);
  }

  restart() {
    this.runtime.stopLoop();
    if (window.electron && window.electron.deleteSave) window.electron.deleteSave();
    this.state = 'PRE_WAVE';
    this.speed = 1;
    this.gold = this.devMode ? Infinity : CONFIG.STARTING_GOLD;
    this.lives = this.devMode ? Infinity : CONFIG.STARTING_LIVES;
    this.selectedSpec = null;
    this.selectedTroopIndex = -1;
    this.sellCooldownTimer = 0;
    this.accumulator = 0;
    this.waveCompleteAnim = { active: false, waveNum: 0, duration: CONFIG.WAVE_TRANSITION_DURATION };
    this.devConfirmPending = false;
    this.resetConfirmPending = false;
    this.sellConfirmPending = false;
    this.sellConfirmTroop = null;
    this.seed = Math.floor(Math.random() * 0xffffffff);
    // Assign the projectile-impact callback BEFORE resetting transient state so
    // any impacts during reset reference the current game instance.
    this._onProjectileImpact = (proj) => this.applyProjectileImpact(proj);
    GameSnapshotRestorer.applyFresh(this, this.seed);
    this.devMonsterCounts = this._defaultDevCounts();
    this._autoSaveIndicatorTimer = 0;
    this._lastSaveWave = 0;
    this.start(); // re-start the background loop
  }

  toggleDevMode() {
    this.devMode = !this.devMode;
    const devBtn = document.getElementById('bar-dev-btn');
    if (devBtn) devBtn.style.display = this.devMode ? '' : 'none';
    this.restart();
  }

  resetGame() {
    const wasDevMode = this.devMode;
    this.devConfirmPending = false;
    this.devMode = wasDevMode;
    this.restart();
  }

  _defaultDevCounts() {
    return MONSTER_DEV_ORDER.reduce((counts, key) => {
      counts[key] = 0;
      return counts;
    }, {});
  }

  resetDevMonsterCounts() {
    this.devMonsterCounts = this._defaultDevCounts();
  }
}
