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

  // Tile distance from a troop tile (for ranged targeting). Inlines tileCenter to avoid allocation.
  worldDistanceFromTile(gx, gy) {
    const tx = gx * CONFIG.TILE_SIZE + (CONFIG.TILE_SIZE >> 1);
    const ty = gy * CONFIG.TILE_SIZE + (CONFIG.TILE_SIZE >> 1);
    const dx = this.x - tx, dy = this.y - ty;
    return Math.sqrt(dx * dx + dy * dy);
  }

  // Shared result object for takeDamage — avoids allocating per hit.
  static _dmgResult = { killed: false, reward: 0, hpDamage: 0 };

  takeDamage(amount) {
    const r = Monster._dmgResult;
    r.killed = false;
    r.reward = 0;
    r.hpDamage = 0;
    if (typeof amount !== 'number' || isNaN(amount) || amount <= 0) return r;
    // Shield absorbs all damage — HP is untouched while shield is active.
    // Even overkill damage only removes the shield, not HP.
    if (this.shield > 0) {
      if (amount >= this.shield) {
        this.shield = 0;
      } else {
        this.shield -= amount;
      }
      this.shieldRegenTimer = 0;
      return r;
    }
    // No shield — damage goes directly to HP.
    r.hpDamage = amount;
    this.hp -= amount;
    if (this.hp <= 0) {
      this.hp = 0;
      this.alive = false;
      r.killed = true;
      r.reward = this.reward;
    }
    return r;
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