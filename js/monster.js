// A monster travels along the waypoint list at a constant rate (tiles per
// second) defined by its spec. We track `distance` (px travelled along the
// path) rather than per-segment progress to make speed uniform.

class Monster {
  constructor(level, waypoints, sharedPath) {
    this.level = level;
    const key = level === 'B' ? 'B' : level;
    this.spec = MONSTER_SPECS[key];
    this.maxHp = this.spec ? this.spec.hp : 1;
    // Boss gets an extra 100% HP on top.
    if (level === 'B') this.maxHp *= 2;
    this.hp = this.maxHp;
    this.speed = this.spec ? this.spec.speed : 1;
    this.reward = this.spec ? this.spec.reward : 0;
    this.leak = this.spec ? this.spec.leak : 1;

    // Use shared path data (avoids rebuilding per monster).
    this.waypoints = waypoints;
    this.segments = sharedPath.segments;
    this.totalLength = sharedPath.totalLength;
    this.distance = 0;
    this.segIdx = 0;
    this.alive = true;
    this.reachedEnd = false;
    this.stunTimer = 0;

    // Shield mechanics (Shielded monster type).
    this.shield = this.spec ? (this.spec.shield || 0) : 0;
    this.maxShield = this.shield;
    this.shieldRegenTimer = 0;
    this.shieldRegenDelay = 3;
    this.shieldRegenActive = false; // true once delay has elapsed

    // Cached tile coordinates (updated in _updatePosition).
    this._tileGx = 0;
    this._tileGy = 0;

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
      this._tileGx = Math.floor(this.x / CONFIG.TILE_SIZE);
      this._tileGy = Math.floor(this.y / CONFIG.TILE_SIZE);
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
    // Cache tile coordinates.
    this._tileGx = Math.floor(this.x / CONFIG.TILE_SIZE);
    this._tileGy = Math.floor(this.y / CONFIG.TILE_SIZE);
  }

  // Progress as 0..1 along the whole path. Used to pick "leads" target.
  get progress() {
    return this.totalLength === 0 ? 1 : this.distance / this.totalLength;
  }

  // Tile the monster currently occupies (used by melee troops).
  // Uses cached coordinates from _updatePosition to avoid allocation.
  get tile() {
    return { gx: this._tileGx, gy: this._tileGy };
  }

  // Tile-distance to another tile (Chebyshev so diagonals feel fair).
  tileDistanceTo(gx, gy) {
    return Math.max(Math.abs(this._tileGx - gx), Math.abs(this._tileGy - gy));
  }

  // Tile distance from a troop tile (for ranged targeting).
  worldDistanceFromTile(gx, gy) {
    const c = tileCenter(gx, gy);
    return dist(this.x, this.y, c.x, c.y);
  }

  takeDamage(amount) {
    if (typeof amount !== 'number' || isNaN(amount) || amount <= 0) return { killed: false };
    // Shield absorbs flat damage before HP.
    if (this.shield > 0) {
      const absorbed = Math.min(this.shield, amount);
      this.shield -= absorbed;
      amount -= absorbed;
      if (absorbed > 0) this.shieldRegenTimer = 0;
    }
    const hpDamage = amount;
    this.hp -= amount;
    if (this.hp <= 0) {
      this.hp = 0;
      this.alive = false;
      return { killed: true, reward: this.reward };
    }
    return { killed: false, hpDamage };
  }

  update(dt) {
    if (!this.alive) return;
    // Shield regeneration after delay (ticks even during stun).
    if (this.shield < this.maxShield) {
      this.shieldRegenTimer += dt;
      if (this.shieldRegenTimer >= this.shieldRegenDelay) {
        // Gradual regen: 20 shield per second after delay.
        this.shield = Math.min(this.maxShield, this.shield + 20 * dt);
      }
    }
    // Stunned: count down timer but don't move.
    if (this.stunTimer > 0) {
      this.stunTimer = Math.max(0, this.stunTimer - dt);
      return;
    }
    this.distance += this.speed * CONFIG.TILE_SIZE * dt;
    this._updatePosition();
  }
}