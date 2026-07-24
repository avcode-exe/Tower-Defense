import { CONFIG, MONSTER_SPECS } from './config.js';
import { clamp, lerp } from './utils.js';
import { PARTICLES } from './particles.js';

// A monster travels along the waypoint list at a constant rate (tiles per
// second) defined by its spec. We track `distance` (px travelled along the
// path) rather than per-segment progress to make speed uniform.

export class Monster {
  constructor(level, waypoints, sharedPath, hpMult = 1) {
    this.waypoints = waypoints; // needed for single-cell path edge case
    this.level = level;
    this.hpMult = hpMult || 1;
    const key = level === 'B' ? 'B' : level;
    this.spec = MONSTER_SPECS[key];
    if (!this.spec) {
      this.spec = MONSTER_SPECS[1]; // fallback to Grunt if unknown level
    }
    this.maxHp = Math.round(this.spec.hp * hpMult);
    // Boss gets an extra 100% HP on top.
    if (level === 'B') this.maxHp *= CONFIG.BOSS_HP_MULTIPLIER;
    this.hp = this.maxHp;
    this.speed = CONFIG.MOVEMENT_SPEEDS[this.spec.movementSpeed] || this.spec.speed;
    this.reward = this.spec.reward;
    this.leak = this.spec.leak;

    // Use shared path data (avoids rebuilding per monster).
    this.segments = sharedPath.segments;
    this.totalLength = sharedPath.totalLength;
    this.distance = 0;
    this.segIdx = 0;
    this.alive = true;
    this.reachedEnd = false;
    this.reviveUsed = false;
    this.reviveCount = 0;
    this.reviveImmune = false;
    this.reviveDamageRatio = 1;
    this._reviveLock = false;
    this.reviveGlow = false;
    this._reviveGlowTimer = 0;
    this.stunTimer = 0;

    this.burnStacks = 0;
    this.burnTimer = 0;
    this.burnTickTimer = 0;
    this.burnTickInterval = CONFIG.FLAME_BURN_TICK_INTERVAL;
    this.burnTickDamage = 0;
    this._onBurnTick = null;

    // Shield mechanics (Shielded monster type).
    this.shield = Math.round((this.spec.shield || 0) * hpMult);
    this.maxShield = this.shield > 0 ? Math.ceil(this.shield * 1.5) : 0;
    this.shieldRegenTimer = 0;
    this.shieldRegenDelay = this.spec.shieldRegenDelay ?? CONFIG.SHIELD_REGEN_DELAY;

    // Passive healing (Boss).
    this.healPerSecond = this.spec.healPerSecond || 0;

    // Active healing (Healer monster).
    this.healRange = (this.spec.healRange || 0) * CONFIG.TILE_SIZE;
    this._healRangeSq = this.healRange * this.healRange;
    this._healing = false;
    this.healTimer = 0;
    this.healTickInterval = this.spec.healTickInterval || 1.0;

    // Slow / shatter mechanics
    this.slowTimer = 0;
    this.shatterArmed = false;
    this.shatterBonus = 0;
    this._slowColorTint = 0; // for visual darkening

    // State machine (melee attack logic).
    this.state = 'MOVING';
    this.attackTarget = null;
    this.attackTimer = 0;
    this._pendingAttack = null;

    // Cached tile coordinates (updated in _updatePosition).
    this._tileGx = 0;
    this._tileGy = 0;
    this._prevTileIdx = -1; // for incremental monster tile index updates
    this._tileArrayPos = -1; // position within _prevTileIdx tile array (swap-remove)

    // Pass-mode: track last tile hit to prevent per-frame multi-hit.
    this._lastPassTile = -1;
    // Pass-mode penetration: track troops already hit so each troop is attacked at most once.
    this._hitTroops = null; // lazily allocated for pass-mode monsters only
    this._hitTroopsCap = CONFIG.HIT_TROOPS_CAP; // hard cap to prevent unbounded memory growth
    this._cleanupTick = 0; // counter for periodic cleanup
    this._healScratchBuf = []; // reusable array for _tryHealAllies

    this._updatePosition();
  }

  // Convert distance -> world x/y on the current segment.
  _updatePosition() {
    if (this.segments.length === 0) {
      // Single-cell path edge case.
      const [gx, gy] = this.waypoints[0];
      this.x = gx * CONFIG.TILE_SIZE + CONFIG.TILE_SIZE / 2;
      this.y = gy * CONFIG.TILE_SIZE + CONFIG.TILE_SIZE / 2;
      this._tileGx = gx;
      this._tileGy = gy;
      return;
    }
    if (this.distance >= this.totalLength) {
      const last = this.segments[this.segments.length - 1];
      this.x = last.bx;
      this.y = last.by;
      this.reachedEnd = true;
      this._tileGx = (this.x / CONFIG.TILE_SIZE) | 0;
      this._tileGy = (this.y / CONFIG.TILE_SIZE) | 0;
      return;
    }
    // Advance segIdx while distance has passed the end of the current segment.
    const segs = this.segments;
    while (this.segIdx < segs.length - 1 && this.distance >= segs[this.segIdx].cumStart + segs[this.segIdx].len) {
      this.segIdx++;
    }
    const seg = segs[this.segIdx];
    const t = seg.len === 0 ? 0 : clamp((this.distance - seg.cumStart) / seg.len, 0, 1);
    this.x = lerp(seg.ax, seg.bx, t);
    this.y = lerp(seg.ay, seg.by, t);
    // Cache tile coordinates (bitwise OR for fast floor on positive values).
    this._tileGx = (this.x / CONFIG.TILE_SIZE) | 0;
    this._tileGy = (this.y / CONFIG.TILE_SIZE) | 0;
  }

  // Progress as 0..1 along the whole path. Used to pick "leads" target.
  get progress() {
    return this.totalLength === 0 ? 1 : this.distance / this.totalLength;
  }

  // Tile-distance to another tile (Chebyshev so diagonals feel fair).
  tileDistanceTo(gx, gy) {
    return Math.max(Math.abs(this._tileGx - gx), Math.abs(this._tileGy - gy));
  }

  takeDamage(amount) {
    if (typeof amount !== 'number' || isNaN(amount) || amount <= 0) return { killed: false, reward: 0, hpDamage: 0 };
    if (this.shield > 0) {
      if (amount >= this.shield) {
        const excess = amount - this.shield;
        this.shield = 0;
        this.shieldRegenTimer = 0;
        this.hp -= excess;
        if (this.hp <= 0) {
          this.hp = 0;
          this.alive = false;
          return { killed: true, reward: this.reward, hpDamage: excess };
        }
        return { killed: false, reward: 0, hpDamage: excess };
      }
      this.shield -= amount;
      this.shieldRegenTimer = 0;
      return { killed: false, reward: 0, hpDamage: 0 };
    }
    // No shield — damage goes directly to HP.
    // Shatter bonus: if slowed and shatterArmed, apply bonus damage
    let hpDamage = amount;
    if (this.slowTimer > 0 && this.shatterArmed) {
      hpDamage = Math.round(amount * (1 + this.shatterBonus));
      this.shatterArmed = false;
    }
    this.hp -= hpDamage;
    if (this.hp <= 0) {
      this.hp = 0;
      this.alive = false;
      return { killed: true, reward: this.reward, hpDamage: hpDamage };
    }
    return { killed: false, reward: 0, hpDamage: hpDamage };
  }

  applySlow(factor, duration, bonus = 0) {
    if (this.shield > 0) return false;
    const baseSpd = CONFIG.MOVEMENT_SPEEDS[this.spec.movementSpeed] || this.spec.speed;
    const speed = this.level === 'H' && this._healing ? CONFIG.MOVEMENT_SPEEDS['slow'] : baseSpd;
    this.slowTimer = Math.max(this.slowTimer, duration);
    this.speed = speed * factor;
    this.shatterArmed = true;
    this.shatterBonus = bonus;
    this._slowColorTint = 1; // flag for renderer
    return true;
  }

  applyBurn(stacks = 1, duration = 0, tickInterval = 0, tickDamage = 0, onTick = null) {
    if (!Number.isFinite(stacks) || stacks <= 0) return false;
    if (!Number.isFinite(duration) || duration <= 0) return false;
    if (!Number.isFinite(tickInterval) || tickInterval <= 0) return false;
    if (!Number.isFinite(tickDamage) || tickDamage <= 0) return false;

    const maxStacks = CONFIG.FLAME_BURN_MAX_STACKS || 1;
    const nextStacks = Math.min(maxStacks, (this.burnStacks || 0) + stacks);
    this.burnStacks = nextStacks;
    this.burnTimer = duration;
    this.burnTickTimer = Math.min(this.burnTickTimer || 0, tickInterval);
    this.burnTickInterval = tickInterval;
    this.burnTickDamage = tickDamage;
    this._onBurnTick = onTick || this._onBurnTick;
    return true;
  }

  clearBurn() {
    this.burnStacks = 0;
    this.burnTimer = 0;
    this.burnTickTimer = 0;
    this.burnTickInterval = CONFIG.FLAME_BURN_TICK_INTERVAL;
    this.burnTickDamage = 0;
    this._onBurnTick = null;
  }

  isBurning() {
    return this.burnStacks > 0 && this.burnTimer > 0;
  }

  _updateBurn(dt) {
    if (!this.isBurning()) return;

    this.burnTimer = Math.max(0, this.burnTimer - dt);
    if (this.burnTimer <= 0) {
      this.clearBurn();
      return;
    }

    const interval = this.burnTickInterval || CONFIG.FLAME_BURN_TICK_INTERVAL;
    const tickDamage = Math.max(1, Math.round(this.burnTickDamage * this.burnStacks));
    this.burnTickTimer += dt;
    while (this.burnTickTimer >= interval && this.burnStacks > 0 && this.alive) {
      this.burnTickTimer -= interval;
      if (this._onBurnTick) this._onBurnTick(this, tickDamage);
      if (!this.alive) {
        this.clearBurn();
        return;
      }
    }
  }

  isSlowed() {
    return this.slowTimer > 0;
  }

  findTarget(monsterTileIndex) {
    const gx = this._tileGx;
    const gy = this._tileGy;
    let bestTroop = null;
    let bestDist = Infinity;
    const gs = CONFIG.GRID_SIZE;
    const atkRange = this.spec.attackRange;
    const tileRange = Math.ceil(atkRange);
    for (let dy = -tileRange; dy <= tileRange; dy++) {
      for (let dx = -tileRange; dx <= tileRange; dx++) {
        const tx = gx + dx;
        const ty = gy + dy;
        if (tx < 0 || tx >= gs || ty < 0 || ty >= gs) continue;
        const tileTroops = monsterTileIndex[ty * gs + tx];
        if (!tileTroops) continue;
        for (let i = 0; i < tileTroops.length; i++) {
          const t = tileTroops[i];
          if (!t.alive) continue;
          const d = Math.max(Math.abs(tx - gx), Math.abs(ty - gy));
          if (d <= atkRange) {
            const pdx = t.x - this.x;
            const pdy = t.y - this.y;
            const pxDist = pdx * pdx + pdy * pdy;
            if (pxDist < bestDist) {
              bestDist = pxDist;
              bestTroop = t;
            }
          }
        }
      }
    }
    return bestTroop;
  }

  _updateRegen(dt) {
    if (this.shield < this.maxShield) {
      this.shieldRegenTimer += dt;
      if (this.shieldRegenTimer >= this.shieldRegenDelay) {
        this.shield = Math.min(this.maxShield, this.shield + CONFIG.SHIELD_REGEN_RATE * dt);
      }
    }
    if (this.healPerSecond > 0 && this.hp < this.maxHp) {
      this.hp = Math.min(this.maxHp, this.hp + this.healPerSecond * dt);
    }
  }

  _updateSlowDecay(dt) {
    if (this.slowTimer > 0) {
      this.slowTimer -= dt;
      if (this.slowTimer <= 0) {
        this.slowTimer = 0;
        const catSpeed = CONFIG.MOVEMENT_SPEEDS[this.spec.movementSpeed] || this.spec.speed;
        this.speed = this.level === 'H' && this._healing ? CONFIG.MOVEMENT_SPEEDS['slow'] : catSpeed;
        this.shatterArmed = false;
        this._slowColorTint = 0;
      }
    }
  }

  _updateReviveGlow(dt) {
    if (this._reviveGlowTimer > 0) {
      this._reviveGlowTimer = Math.max(0, this._reviveGlowTimer - dt);
    }
  }

  _tryHealAllies(dt, monsters) {
    if (!this.alive || this.level !== 'H') return;

    const rangeSq = this._healRangeSq;
    const damaged = this._healScratchBuf;
    damaged.length = 0;
    if (monsters && Array.isArray(monsters)) {
      for (let j = 0; j < monsters.length; j++) {
        const target = monsters[j];
        if (!target.alive || target === this) continue;
        if (target.hp >= target.maxHp) continue;
        const dx = target.x - this.x;
        const dy = target.y - this.y;
        if (dx * dx + dy * dy <= rangeSq) {
          damaged.push(target);
        }
      }
    }

    if (damaged.length === 0) {
      this._healing = false;
      this.speed = CONFIG.MOVEMENT_SPEEDS[this.spec.movementSpeed] || this.spec.speed;
      this.state = 'MOVING';
      return;
    }

    if (!this._healing) {
      this._healing = true;
      this.speed = CONFIG.MOVEMENT_SPEEDS['slow'];
      this.healTimer = 0;
    }

    this.healTimer += dt;
    const tick = this.healTickInterval;
    const amount = this.spec.healPerSecond * tick;
    while (this.healTimer >= tick) {
      this.healTimer -= tick;
      for (let k = 0; k < damaged.length; k++) {
        const target = damaged[k];
        if (!target.alive || target.hp >= target.maxHp) continue;
        const heal = Math.min(amount, target.maxHp - target.hp);
        target.hp += heal;
        if (target.hp > target.maxHp) target.hp = target.maxHp;
        PARTICLES.healBurst(target.x, target.y);
      }
    }
  }

  _updateStopMode(dt, troopTileIndex) {
    const atkSpd = this.spec.attackSpeed;
    const atkRange = this.spec.attackRange;

    if (this.state === 'ATTACKING') {
      if (!this.attackTarget || !this.attackTarget.alive) {
        this.attackTarget = null;
        this.state = 'MOVING';
        this._pendingAttack = null;
      } else {
        const dx = Math.abs(this._tileGx - this.attackTarget.gx);
        const dy = Math.abs(this._tileGy - this.attackTarget.gy);
        if (Math.max(dx, dy) > atkRange) {
          this.attackTarget = null;
          this.state = 'MOVING';
          this._pendingAttack = null;
        } else {
          this.attackTimer -= dt;
          if (this.attackTimer <= 0) {
            this.attackTimer = atkSpd;
            this._pendingAttack = this.attackTarget;
          }
        }
      }
    }

    if (this.state === 'MOVING' && troopTileIndex) {
      const target = this.findTarget(troopTileIndex);
      if (target) {
        this.state = 'ATTACKING';
        this.attackTarget = target;
        this.attackTimer = atkSpd;
        this._pendingAttack = target;
      }
    }
  }

  _updateSlowMode(dt, troopTileIndex) {
    const atkSpd = this.spec.attackSpeed;
    const nearTarget = this.findTarget(troopTileIndex);
    if (nearTarget) {
      const base = CONFIG.MOVEMENT_SPEEDS[this.spec.movementSpeed] || this.spec.speed;
      const slowModeSpeed = base * 0.5;
      this.speed = Math.min(this.speed, slowModeSpeed);
      this.attackTimer -= dt;
      if (this.attackTimer <= 0) {
        this.attackTimer = atkSpd;
        this._pendingAttack = nearTarget;
      }
    } else if (this.slowTimer <= 0) {
      const base = CONFIG.MOVEMENT_SPEEDS[this.spec.movementSpeed] || this.spec.speed;
      this.speed = this.level === 'H' && this._healing ? CONFIG.MOVEMENT_SPEEDS['slow'] : base;
    }
  }

  _cleanupHitTroops() {
    if (!this._hitTroops) return;
    // Collect dead entries first to avoid mutating the Set during iteration.
    const dead = [];
    for (const t of this._hitTroops) {
      if (!t.alive) dead.push(t);
    }
    for (let i = 0; i < dead.length; i++) {
      this._hitTroops.delete(dead[i]);
    }
    // Enforce hard cap: if still over cap after dead-removal, delete oldest entries.
    // Since Set iterates in insertion order, the first entries are the oldest.
    if (this._hitTroops.size > this._hitTroopsCap) {
      const toDelete = this._hitTroops.size - this._hitTroopsCap;
      let deleted = 0;
      for (const t of this._hitTroops) {
        if (deleted >= toDelete) break;
        this._hitTroops.delete(t);
        deleted++;
      }
    }
  }

  _updatePassMode(troopTileIndex) {
    if (!this._hitTroops) this._hitTroops = new Set();
    // Periodic cleanup: clean dead entries and enforce cap every 10 calls.
    this._cleanupTick = (this._cleanupTick + 1) % 10;
    if (this._cleanupTick === 0) {
      this._cleanupHitTroops();
    }
    const gx = this._tileGx;
    const gy = this._tileGy;
    const gs = CONFIG.GRID_SIZE;
    const tileIdx = gy * gs + gx;
    if (tileIdx !== this._lastPassTile) {
      this._lastPassTile = tileIdx;
      this._pendingAttack = null;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const tx = gx + dx;
          const ty = gy + dy;
          if (tx < 0 || tx >= gs || ty < 0 || ty >= gs) continue;
          const tileTroops = troopTileIndex[ty * gs + tx];
          if (!tileTroops) continue;
          for (let i = 0; i < tileTroops.length; i++) {
            const t = tileTroops[i];
            if (t.alive && !this._hitTroops.has(t)) {
              this._pendingAttack = t;
              // Only add if under cap (safety check in case periodic cleanup missed a burst).
              if (this._hitTroops.size < this._hitTroopsCap) {
                this._hitTroops.add(t);
              }
              break;
            }
          }
          if (this._pendingAttack) break;
        }
        if (this._pendingAttack) break;
      }
    }
  }

  update(dt, troopTileIndex, monsters) {
    if (!this.alive) return;

    this._updateRegen(dt);
    this._updateSlowDecay(dt);
    this._updateReviveGlow(dt);
    this._updateBurn(dt);
    if (!this.alive) return;

    if (this.stunTimer > 0) {
      this.stunTimer = Math.max(0, this.stunTimer - dt);
      return;
    }

    const attackMode = this.spec.attackMode || 'stop';
    const isHealer = this.level === 'H';

    if (this.state === 'ATTACKING') {
      this._updateStopMode(dt, troopTileIndex);
    }

    let hasNearbyDamaged = false;
    if (isHealer && Array.isArray(monsters)) {
      const rangeSq = this._healRangeSq;
      for (let j = 0; j < monsters.length; j++) {
        const target = monsters[j];
        if (!target.alive || target === this || target.hp >= target.maxHp) continue;
        const dx = target.x - this.x;
        const dy = target.y - this.y;
        if (dx * dx + dy * dy <= rangeSq) {
          hasNearbyDamaged = true;
          break;
        }
      }
    }

    if (this.state === 'MOVING') {
      if (attackMode === 'slow' && troopTileIndex && !isHealer) {
        this._updateSlowMode(dt, troopTileIndex);
      }

      this.distance += this.speed * CONFIG.TILE_SIZE * dt;

      if (this.distance >= this.totalLength) {
        this.distance = this.totalLength;
        this.reachedEnd = true;
        this._updatePosition();
        return;
      }

      this._updatePosition();

      if (attackMode === 'pass' && troopTileIndex && !isHealer) {
        this._updatePassMode(troopTileIndex);
      } else if (attackMode === 'stop' && troopTileIndex && !isHealer) {
        this._updateStopMode(dt, troopTileIndex);
      }
    }

    if (isHealer && Array.isArray(monsters)) {
      if (hasNearbyDamaged) {
        this._tryHealAllies(dt, monsters);
      } else {
        this._healing = false;
        this.speed = CONFIG.MOVEMENT_SPEEDS[this.spec.movementSpeed] || this.spec.speed;
      }
    }
  }
}
