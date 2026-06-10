// Game: orchestrator. Owns all entities, runs the fixed-timestep loop, and
// routes input to logic.

import { RENDERER } from './rendering/renderer.js';
import { CONFIG, LAYOUT, TROOP_SPECS } from './config.js';
import { TILE } from './grid.js';
import { PARTICLES } from './particles.js';
import { Monster } from './monster.js';
import { Troop } from './troop.js';
import { Projectile } from './projectile.js';
import { WaveManager } from './waveManager.js';
import { GameRuntimeController } from './gameRuntime.js';
import { SaveSerializer, GameWorldFactory, GameSnapshotRestorer } from './gamePersistence.js';
import { UI, UI_LAYOUT } from './ui/index.js';
import { AUDIO } from './audio.js';
import { pixelToTile, tileCenterInto, dist, inBounds } from './utils.js';
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
    this.waveCompleteAnim = { active: false, waveNum: 0 };

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
    this._monsterTileIndex = new Array(CONFIG.GRID_SIZE * CONFIG.GRID_SIZE);

    this._troopTileIndex = [];
    for (let i = 0; i < CONFIG.GRID_SIZE * CONFIG.GRID_SIZE; i++) this._troopTileIndex.push([]);
    this._popupPool = [];
    this._tileIndexPool = [];

    this.wave = new WaveManager();

    this.runtime.installResize(canvas);

    this.devMode = false;
    this.devConfirmPending = false;
    this._goldClicks = 0;
    this._goldClickTimer = 0;
    this.resetConfirmPending = false;
    this.sellConfirmPending = false;
    this.sellConfirmTroopIndex = null;
    this.devMonsterCounts = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, B: 0, S: 0, X: 0 };
  }

  // Pause render loop — delegated to the runtime controller.
  _startPauseRender() {
    this.runtime.startPauseRender();
  }
  _stopPauseRender() {
    this.runtime.stopPauseRender();
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

  placeTroop(spec, gx, gy) {
    if (!this.canPlace(gx, gy, spec)) return false;
    const t = new Troop(spec, gx, gy);
    this.troops.push(t);
    if (!this.devMode) this.gold -= spec.cost;
    this._buildTroopTileIndex();
    AUDIO.troopPlace();
    return true;
  }

  sellTroop(index) {
    const t = this.troops[index];
    if (!t || !t.alive) return;
    if (!this.devMode && this.sellCooldownTimer > 0) return;
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
    AUDIO.sell();
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
    AUDIO.upgrade();
  }

  // Heal a troop by 10% of max HP.
  healTroop(index) {
    const t = this.troops[index];
    if (!t || !t.alive) return;
    if (!t.canHeal()) return;
    const cost = t.getHealCost();
    if (this.gold < cost) return;
    this.gold -= cost;
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
    const cost = Math.ceil(t.spec.cost * CONFIG.SHIELD_COST_RATIO);
    if (!this.devMode && this.gold < cost) return false;
    if (!this.devMode) this.gold -= cost;
    t.applyShield();
    this._getPopup('SHIELD!', t.x, t.y - 12, 1.0, '#5dade2');
    if (PARTICLES && PARTICLES.troopShieldActivate) {
      PARTICLES.spawn(t.x, t.y, PARTICLES.troopShieldActivate(t.spec.color));
      AUDIO.shieldBuy();
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
    // Guard: if monster HP is already zero or below, force-kill without reward
    // to prevent double-reward from the defensive kill path in step().
    if (m.hp <= 0) {
      m.alive = false;
      return true;
    }
    const r = m.takeDamage(amount);
    if (r.killed) {
      this.gold = Math.min(this.gold + r.reward, CONFIG.MAX_GOLD);
      AUDIO.goldEarned();
      this._getPopup('+' + r.reward, m.x, m.y - 8, 1.2, CONFIG.COLORS.gold);
      PARTICLES.spawn(m.x, m.y, PARTICLES.deathBurst(m.spec.color));
      // Split monster: if level > 1, spawn 2 monsters of level-1 at this position.
      const noSplit = (m.spec.attackMode || 'stop') === 'pass';
      if (!noSplit && m.level !== 'B' && m.level !== 'S' && m.level > 1) {
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
    // Clear sell confirmation if the confirmed troop was killed.
    if (this.sellConfirmPending && this.sellConfirmTroopIndex === troop) {
      this.sellConfirmPending = false;
      this.sellConfirmTroopIndex = null;
    }
  }

  // Apply monster melee damage to a troop.
  damageTroop(monster, troop) {
    let dmg = monster.spec.damage;
    // Melee troops take reduced damage from monsters (they can block).
    if (troop.spec.type === 'melee') dmg = Math.round(dmg * CONFIG.MELEE_DAMAGE_REDUCTION);
    const killed = troop.takeDamage(dmg);
    this._getPopup('-' + dmg, troop.x + (Math.random() - 0.5) * 8, troop.y - 14, 0.8, '#ff6644');
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
    let monData = this.wave.popDueMonster();
    while (monData != null) {
      this.spawnMonster(monData.level, monData.hpMult);
      monData = this.wave.popDueMonster();
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
        if (!this.devMode) {
          this.lives -= m.leak;
          this._getPopup('-' + m.leak, m.x, m.y - 8, 1.0, CONFIG.COLORS.heart);
          AUDIO.monsterLeak();
          if (this.lives <= 0) {
            this.runtime.applyDefeat();
            break;
          }
        }
      }
    }
    if (this.state === 'DEFEAT') return;

    // Monster attacks on troops.
    // Snapshot before processing: split children added by damageMonster during
    // troop/melee damage must not attack in the same tick they were spawned.
    const attackCount = this.monsters.length;
    for (let i = 0; i < attackCount; i++) {
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
    if (this.state === 'WAVE_ACTIVE' && this.wave.spawnIndex >= this.wave.queue.length && this.monsters.length === 0) {
      const waveNum = this.wave.currentWave + 1;
      this.waveCompleteAnim = { active: true, waveNum: waveNum, startMs: performance.now() };
      AUDIO.waveComplete();
      if (waveNum % 10 === 0) {
        const bonus = Math.min(CONFIG.BOSS_BONUS_BASE + waveNum * CONFIG.BOSS_BONUS_PER_WAVE, CONFIG.BOSS_BONUS_MAX);
        this.gold = Math.min(this.gold + bonus, CONFIG.MAX_GOLD);
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
      // Expire troop shields after every 10th wave (boss wave).
      // At the start of wave (N+1) where N is a multiple of 10, clear all shields.
      if (waveNum % CONFIG.SHIELD_EXPIRE_WAVES === 0) {
        for (let i = 0; i < this.troops.length; i++) {
          const t = this.troops[i];
          if (t.shield > 0) t.clearShield();
        }
      }
      this.state = 'PRE_WAVE';
      this._autoSave();
    }

    // Update popups (single pass: decrement timers, compact, and recycle).
    let ppw = 0;
    for (let i = 0; i < this.popups.length; i++) {
      const p = this.popups[i];
      p.t -= dt;
      if (p.t > 0) {
        this.popups[ppw++] = p;
      } else if (this._popupPool.length < 100) {
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
    const troop = proj.troop;
    const hasSlow = troop.spec.slowFactor && troop._cachedSlowFactor !== undefined;

    if (!proj.target || !proj.target.alive) {
      // Dead before impact: resolve at last known position.
      if (troop.spec.chain > 0) {
        this.chainHitAt(proj.lastTargetX, proj.lastTargetY, troop);
      } else if (troop.spec.splash > 0) {
        const hit = this.splashAt(proj.lastTargetX, proj.lastTargetY, dmg, troop.spec.splash, troop);
        if (hasSlow)
          hit.forEach((m) => {
            if (m.applySlow(troop._cachedSlowFactor, troop._cachedSlowDuration, troop._cachedShatterBonus)) {
              PARTICLES.spawn(m.x, m.y, PARTICLES.slowApply(troop.spec.color));
            }
          });
      } else {
        // Direct hit: find closest alive monster to impact point using tile index.
        let closest = null,
          closestDist = Infinity;
        const gx0 = (proj.lastTargetX / CONFIG.TILE_SIZE) | 0;
        const gy0 = (proj.lastTargetY / CONFIG.TILE_SIZE) | 0;
        const G = CONFIG.GRID_SIZE;
        for (let dgy = -1; dgy <= 1; dgy++) {
          for (let dgx = -1; dgx <= 1; dgx++) {
            const gx = gx0 + dgx,
              gy = gy0 + dgy;
            if (gx < 0 || gx >= G || gy < 0 || gy >= G) continue;
            const arr = this._monsterTileIndex[gy * G + gx];
            if (!arr) continue;
            for (let i = 0; i < arr.length; i++) {
              const m = arr[i];
              if (!m.alive) continue;
              const d = dist(proj.lastTargetX, proj.lastTargetY, m.x, m.y);
              if (d < closestDist) {
                closestDist = d;
                closest = m;
              }
            }
          }
        }
        if (closest) {
          const killed = this.damageMonster(closest, dmg);
          if (hasSlow && !killed) {
            if (closest.applySlow(troop._cachedSlowFactor, troop._cachedSlowDuration, troop._cachedShatterBonus)) {
              PARTICLES.spawn(closest.x, closest.y, PARTICLES.slowApply(troop.spec.color));
            }
          }
        }
      }
      return;
    }
    if (troop.spec.chain > 0) {
      this.chainHitAt(proj.target.x, proj.target.y, troop);
      if (hasSlow && proj.target.alive) {
        if (proj.target.applySlow(troop._cachedSlowFactor, troop._cachedSlowDuration, troop._cachedShatterBonus)) {
          PARTICLES.spawn(proj.target.x, proj.target.y, PARTICLES.slowApply(troop.spec.color));
        }
      }
    } else if (troop.spec.splash > 0) {
      const hit = this.splashAt(proj.target.x, proj.target.y, dmg, troop.spec.splash, troop);
      if (hasSlow)
        hit.forEach((m) => {
          if (m.applySlow(troop._cachedSlowFactor, troop._cachedSlowDuration, troop._cachedShatterBonus)) {
            PARTICLES.spawn(m.x, m.y, PARTICLES.slowApply(troop.spec.color));
          }
        });
    } else {
      const killed = this.damageMonster(proj.target, dmg);
      if (hasSlow && !killed) {
        if (proj.target.applySlow(troop._cachedSlowFactor, troop._cachedSlowDuration, troop._cachedShatterBonus)) {
          PARTICLES.spawn(proj.target.x, proj.target.y, PARTICLES.slowApply(troop.spec.color));
        }
      }
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
      const hadShield = m.shield > 0;
      this.damageMonster(m, damage);
      this._getPopup('\u26A1', m.x, m.y - 12, 0.6, '#f1c40f');
      // Stun any children spawned by split (only if parent was not shielded).
      if (stunDuration > 0 && !hadShield) {
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
          if (dSq < closestDist) {
            closestDist = dSq;
            closest = m;
          }
        }
      }
    }
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
      lastX = best.x;
      lastY = best.y;
      applyHit(best, best.x, best.y);
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
          const dx = x - m.x,
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
    PARTICLES.spawn(x, y, PARTICLES.splashImpact(troop ? troop.spec.color : '#9b59b6'));
    return hitMonsters;
  }

  start() {
    this.runtime.startLoop(this.canvas);
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
      if (
        UI._devConfirmYes &&
        px >= UI._devConfirmYes.x &&
        px <= UI._devConfirmYes.x + UI._devConfirmYes.w &&
        py >= UI._devConfirmYes.y &&
        py <= UI._devConfirmYes.y + UI._devConfirmYes.h
      ) {
        if (this.sellConfirmPending) {
          this.sellConfirmPending = false;
          const ref = this.sellConfirmTroopIndex;
          if (ref && ref.alive) {
            const idx = this.troops.indexOf(ref);
            if (idx >= 0) this.sellTroop(idx);
          }
          this.sellConfirmTroopIndex = null;
        } else if (this.resetConfirmPending) {
          this.resetConfirmPending = false;
          this.resetGame();
        } else {
          this.devConfirmPending = false;
          this.toggleDevMode();
        }
        return;
      }
      if (
        UI._devConfirmNo &&
        px >= UI._devConfirmNo.x &&
        px <= UI._devConfirmNo.x + UI._devConfirmNo.w &&
        py >= UI._devConfirmNo.y &&
        py <= UI._devConfirmNo.y + UI._devConfirmNo.h
      ) {
        this.devConfirmPending = false;
        this.resetConfirmPending = false;
        this.sellConfirmPending = false;
        this.sellConfirmTroopIndex = null;
        return;
      }
      return; // all clicks consumed while dialog is shown
    }

    // Dev right panel click handling removed — moved to bottom bar DEV popup

    // Triple-click on gold display to toggle dev mode.
    if (
      px >= LAYOUT.HUD.GOLD_AREA.x &&
      px <= LAYOUT.HUD.GOLD_AREA.x + LAYOUT.HUD.GOLD_AREA.w &&
      py >= LAYOUT.HUD.GOLD_AREA.y &&
      py <= LAYOUT.HUD.GOLD_AREA.y + LAYOUT.HUD.GOLD_AREA.h
    ) {
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
      const rstBtn = LAYOUT.HUD.RESET_BTN;
      if (px >= rstBtn.x && px <= rstBtn.x + rstBtn.w && py >= rstBtn.y && py <= rstBtn.y + rstBtn.h) {
        this.resetConfirmPending = true;
        return;
      }

      // Mute button.
      const muteBtn = LAYOUT.HUD.MUTE_BTN;
      if (px >= muteBtn.x && px <= muteBtn.x + muteBtn.w && py >= muteBtn.y && py <= muteBtn.y + muteBtn.h) {
        AUDIO.toggleMute();
        return;
      }

      // Speed buttons.
      const w = RENDERER.width;
      for (let i = 0; i < CONFIG.GAME_SPEEDS.length; i++) {
        const r = {
          x: w - LAYOUT.HUD.SPEED_OFFSET + i * 28,
          y: 14,
          w: LAYOUT.HUD.SPEED_BTN_W,
          h: LAYOUT.HUD.SPEED_BTN_H,
        };
        if (px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h) {
          this.speed = CONFIG.GAME_SPEEDS[i];
          return;
        }
      }

      // Start wave / pause button.
      const btn = {
        x: w - LAYOUT.HUD.CTRL_RIGHT,
        y: LAYOUT.HUD.CTRL_BTN.y,
        w: LAYOUT.HUD.CTRL_BTN.w,
        h: LAYOUT.HUD.CTRL_BTN.h,
      };
      if (px >= btn.x && px <= btn.x + btn.w && py >= btn.y && py <= btn.y + btn.h) {
        if (this.state === 'PRE_WAVE') {
          this.runtime.startWave();
        } else {
          this.runtime.togglePause();
        }
        return;
      }
    }

    // Shop clicks.
    const shopIdx = UI.hitShop(px, py);
    if (shopIdx >= 0) {
      const spec = TROOP_SPECS[shopIdx];
      this.selectedSpec = this.selectedSpec === spec ? null : spec;
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
        const healBtnY = RENDERER.height - LAYOUT.SHOP.HEAL_BTN_Y_OFFSET;
        const healBtnW = UI_LAYOUT.SHOP_WIDTH - LAYOUT.SHOP.SEW;
        if (
          px >= LAYOUT.SHOP.BTN_PAD &&
          px <= LAYOUT.SHOP.BTN_PAD + healBtnW &&
          py >= healBtnY &&
          py <= healBtnY + LAYOUT.SHOP.HEAL_BTN_H
        ) {
          this.healTroop(this.selectedTroopIndex);
          return;
        }
      }
    }

    // Sell button — show confirmation dialog.
    if (this.selectedTroopIndex >= 0 && !UI_LAYOUT.collapsed.shop) {
      const sellBtn = {
        x: LAYOUT.SHOP.BTN_PAD,
        y: RENDERER.height - LAYOUT.SHOP.SELL_BTN_Y_OFFSET,
        w: UI_LAYOUT.SHOP_WIDTH - LAYOUT.SHOP.SEW,
        h: LAYOUT.SHOP.SELL_BTN_H,
      };
      if (px >= sellBtn.x && px <= sellBtn.x + sellBtn.w && py >= sellBtn.y && py <= sellBtn.y + sellBtn.h) {
        if (this.devMode) {
          this.sellTroop(this.selectedTroopIndex);
        } else {
          this.sellConfirmTroopIndex = this.troops[this.selectedTroopIndex];
          this.sellConfirmPending = true;
        }
        return;
      }
    }

    // Upgrade buttons (4 stats).
    if (this.selectedTroopIndex >= 0 && !UI_LAYOUT.collapsed.shop) {
      const t = this.troops[this.selectedTroopIndex];
      if (t && t.alive) {
        const stats = ['dmg', 'range', 'speed', 'chain', 'slow', 'hp'];
        const btnPad = LAYOUT.SHOP.BTN_PAD;
        const btnGap = LAYOUT.SHOP.BTN_GAP;
        // Count visible buttons first to compute dynamic width.
        let visibleCount = 0;
        for (const stat of stats) {
          if (!t.canUpgrade(stat)) continue;
          visibleCount++;
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
          if (px >= btn.x && px <= btn.x + btn.w && py >= btn.y && py <= btn.y + btn.h) {
            this.upgradeTroopStat(this.selectedTroopIndex, stat);
            return;
          }
        }
      }
    }

    // Map clicks.
    if (
      px >= UI_LAYOUT.shopWidth &&
      py >= UI_LAYOUT.hudHeight &&
      py <= RENDERER.height - UI_LAYOUT.previewHeight &&
      px <= RENDERER.width - UI_LAYOUT.shieldShopWidth
    ) {
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
    return SaveSerializer.fromGame(this);
  }

  restore(data) {
    GameSnapshotRestorer.apply(this, data);
    this.sellCooldownTimer = 0;
    this.devConfirmPending = false;
    this.resetConfirmPending = false;
    this.sellConfirmPending = false;
    this.sellConfirmTroopIndex = null;
    this.accumulator = 0;
  }

  _autoSave() {
    if (!window.electron || !window.electron.saveGame) return;
    if (this._needsSaveCleanup && window.electron.deleteSave) {
      window.electron.deleteSave();
      this._needsSaveCleanup = false;
    }
    window.electron.saveGame(this.getSaveData());
  }

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
    if (e.altKey) {
      const popupKeys = [
        { key: 'c', popupId: 'controls-popup', collapsedKey: 'help', btnId: 'bar-controls-btn' },
        { key: 'm', popupId: 'monster-popup', collapsedKey: 'monsterInfo', btnId: 'bar-monster-btn' },
        { key: 'u', popupId: 'settings-popup', collapsedKey: 'settings', btnId: 'bar-settings-btn' },
        { key: 'd', popupId: 'dev-popup', collapsedKey: 'dev', btnId: 'bar-dev-btn' },
      ];
      const match = popupKeys.find((p) => e.key.toLowerCase() === p.key);
      if (match) {
        e.preventDefault();
        // If already open, close it.
        if (!UI_LAYOUT.collapsed[match.collapsedKey]) {
          this.togglePopupEl(match.popupId, true, match.btnId);
        } else {
          // Find any currently open popup and close it, wait for animation, then open target.
          const openKey = popupKeys.find((p) => !UI_LAYOUT.collapsed[p.collapsedKey]);
          if (openKey) {
            this.togglePopupEl(openKey.popupId, true, openKey.btnId);
            const el = document.getElementById(openKey.popupId);
            const openFn = () => {
              UI_LAYOUT.collapsed[match.collapsedKey] = false;
              this.togglePopupEl(match.popupId, false, match.btnId);
            };
            if (el) {
              const onDone = () => {
                el.removeEventListener('transitionend', onDone);
                openFn();
              };
              el.addEventListener('transitionend', onDone);
              setTimeout(openFn, 350);
            } else {
              openFn();
            }
          } else {
            UI_LAYOUT.collapsed[match.collapsedKey] = false;
            this.togglePopupEl(match.popupId, false, match.btnId);
          }
        }
      }
    }
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
    this.waveCompleteAnim = { active: false, waveNum: 0 };
    this.devConfirmPending = false;
    this.resetConfirmPending = false;
    this.sellConfirmPending = false;
    this.sellConfirmTroopIndex = null;
    this.seed = Math.floor(Math.random() * 0xffffffff);
    GameSnapshotRestorer.applyFresh(this, this.seed);
    this.devMonsterCounts = this._defaultDevCounts();
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
    this.devMode = false;
    this.devConfirmPending = false;
    this.restart();
    if (wasDevMode) {
      this.devMode = true;
      const devBtn = document.getElementById('bar-dev-btn');
      if (devBtn) devBtn.style.display = '';
    }
  }

  _defaultDevCounts() {
    return { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, B: 0, S: 0, X: 0 };
  }

  resetDevMonsterCounts() {
    this.devMonsterCounts = this._defaultDevCounts();
  }
}
