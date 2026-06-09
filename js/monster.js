// A monster travels along the waypoint list at a constant rate (tiles per
// second) defined by its spec. We track `distance` (px travelled along the
// path) rather than per-segment progress to make speed uniform.

class Monster {
  constructor(level, waypoints, sharedPath, hpMult = 1) {
    this.waypoints = waypoints; // needed for single-cell path edge case
    this.level = level;
    this.hpMult = hpMult || 1;
    const key = level === 'B' ? 'B' : level;
    this.spec = MONSTER_SPECS[key];
    this.maxHp = Math.round((this.spec ? this.spec.hp : 1) * hpMult);
    // Boss gets an extra 100% HP on top.
    if (level === 'B') this.maxHp *= CONFIG.BOSS_HP_MULTIPLIER;
    this.hp = this.maxHp;
    this.speed = this.spec ? this.spec.speed : 1;
    this.reward = this.spec ? this.spec.reward : 0;
    this.leak = this.spec ? this.spec.leak : 1;

    // Use shared path data (avoids rebuilding per monster).
    this.segments = sharedPath.segments;
    this.totalLength = sharedPath.totalLength;
    this.distance = 0;
    this.segIdx = 0;
    this.alive = true;
    this.reachedEnd = false;
    this.stunTimer = 0;

    // Shield mechanics (Shielded monster type).
    this.shield = Math.round((this.spec.shield || 0) * hpMult);
    this.maxShield = Math.ceil(this.shield * 1.5);
    this.shieldRegenTimer = 0;
    this.shieldRegenDelay = CONFIG.SHIELD_REGEN_DELAY;

    // Passive healing (Boss).
    this.healPerSecond = this.spec ? (this.spec.healPerSecond || 0) : 0;

    // Slow / shatter mechanics (v1.3.0)
    this.slowTimer = 0;
    this.baseSpeed = this.speed;
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

    // Pass-mode: track last tile hit to prevent per-frame multi-hit.
    this._lastPassTile = -1;
    // Pass-mode penetration: track troops already hit so each troop is attacked at most once.
    this._hitTroops = new Set();

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
    while (this.segIdx < segs.length - 1
           && this.distance >= segs[this.segIdx].cumStart + segs[this.segIdx].len) {
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
    // Shielded monsters are immune to slow while shield > 0
    if (this.shield > 0) return false;

    this.slowTimer = Math.max(this.slowTimer, duration);
    this.speed = this.baseSpeed * factor;
    this.shatterArmed = true;
    this.shatterBonus = bonus;
    this._slowColorTint = 1; // flag for renderer
    return true;
  }

  isSlowed() { return this.slowTimer > 0; }

  findTarget(troopTileIndex) {
    const gx = this._tileGx;
    const gy = this._tileGy;
    let bestTroop = null;
    let bestDist = Infinity;
    const gs = CONFIG.GRID_SIZE;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const tx = gx + dx;
        const ty = gy + dy;
        if (tx < 0 || tx >= gs || ty < 0 || ty >= gs) continue;
        const tileTroops = troopTileIndex[ty * gs + tx];
        if (!tileTroops) continue;
        for (let i = 0; i < tileTroops.length; i++) {
          const t = tileTroops[i];
          if (!t.alive) continue;
          const dist = Math.max(Math.abs(tx - gx), Math.abs(ty - gy));
          if (dist <= this.spec.attackRange) {
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

  update(dt, troopTileIndex) {
    if (!this.alive) return;
    // Shield regeneration after delay (ticks even during stun).
    if (this.shield < this.maxShield) {
      this.shieldRegenTimer += dt;
      if (this.shieldRegenTimer >= this.shieldRegenDelay) {
        // Gradual regen: 20 shield per second after delay.
        this.shield = Math.min(this.maxShield, this.shield + CONFIG.SHIELD_REGEN_RATE * dt);
      }
    }
    // Passive healing (ticks even during stun).
    if (this.healPerSecond > 0 && this.hp < this.maxHp) {
      this.hp = Math.min(this.maxHp, this.hp + this.healPerSecond * dt);
    }
    // Slow effect decay
    if (this.slowTimer > 0) {
      this.slowTimer -= dt;
      if (this.slowTimer <= 0) {
        this.slowTimer = 0;
        this.speed = this.baseSpeed;
        this.shatterArmed = false;
        this._slowColorTint = 0;
      }
    }
    // Stunned: count down timer but don't move.
    if (this.stunTimer > 0) {
      this.stunTimer = Math.max(0, this.stunTimer - dt);
      return;
    }

    const attackMode = this.spec.attackMode || 'stop';

    // ATTACKING state (used by 'stop' mode).
    if (this.state === 'ATTACKING') {
      if (!this.attackTarget || !this.attackTarget.alive) {
        this.attackTarget = null;
        this.state = 'MOVING';
      } else {
        const dx = Math.abs(this._tileGx - this.attackTarget.gx);
        const dy = Math.abs(this._tileGy - this.attackTarget.gy);
        if (Math.max(dx, dy) > this.spec.attackRange) {
          this.attackTarget = null;
          this.state = 'MOVING';
        } else {
          this.attackTimer -= dt;
          if (this.attackTimer <= 0) {
            this.attackTimer = this.spec.attackSpeed;
            this._pendingAttack = this.attackTarget;
          }
        }
      }
    }

    // MOVING state.
    if (this.state === 'MOVING') {
      // Slow mode: reduce speed when a troop is in range, attack while moving.
      if (attackMode === 'slow' && troopTileIndex) {
        const nearTarget = this.findTarget(troopTileIndex);
        if (nearTarget) {
          this.speed = this.baseSpeed * 0.5;
          this.attackTimer -= dt;
          if (this.attackTimer <= 0) {
            this.attackTimer = this.spec.attackSpeed;
            this._pendingAttack = nearTarget;
          }
        } else {
          this.speed = this.baseSpeed;
        }
      }

      this.distance += this.speed * CONFIG.TILE_SIZE * dt;

      // Clamp to path end.
      if (this.distance >= this.totalLength) {
        this.distance = this.totalLength;
        this.reachedEnd = true;
        this._updatePosition();
        return; // reached end, no attacking
      }

      this._updatePosition();

      // Pass-mode penetration: deal damage to each troop at most once while moving.
      if (attackMode === 'pass' && troopTileIndex) {
        const gx = this._tileGx;
        const gy = this._tileGy;
        const gs = CONFIG.GRID_SIZE;
        const tileIdx = gy * gs + gx;
        if (tileIdx !== this._lastPassTile) {
          this._lastPassTile = tileIdx;
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
                  this._hitTroops.add(t);
                  break;
                }
              }
              if (this._pendingAttack) break;
            }
            if (this._pendingAttack) break;
          }
        }
      } else if (attackMode === 'stop' && troopTileIndex) {
        // Stop mode: check for nearby troops to attack.
        const target = this.findTarget(troopTileIndex);
        if (target) {
          this.state = 'ATTACKING';
          this.attackTarget = target;
          this.attackTimer = this.spec.attackSpeed;
          this._pendingAttack = target;
        }
      }
    }
  }
}