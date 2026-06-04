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
    this._updatePosition();
  }

  // Convert distance -> world x/y on the current segment.
  _updatePosition() {
    if (this.segments.length === 0) {
      // Single-cell path edge case.
      const [gx, gy] = this.waypoints[0];
      this.x = gx * CONFIG.TILE_SIZE + CONFIG.TILE_SIZE / 2;
      this.y = gy * CONFIG.TILE_SIZE + CONFIG.TILE_SIZE / 2;
      return;
    }
    if (this.distance >= this.totalLength) {
      const last = this.segments[this.segments.length - 1];
      this.x = last.bx;
      this.y = last.by;
      this.reachedEnd = true;
      return;
    }
    // Advance segIdx while distance has passed the end of the current segment.
    const segs = this.segments;
    while (this.segIdx < segs.length - 1
           && this.distance >= segs[this.segIdx].cumStart + segs[this.segIdx].len) {
      this.segIdx++;
    }
    const seg = segs[this.segIdx];
    const t = seg.len === 0 ? 0 : (this.distance - seg.cumStart) / seg.len;
    this.x = lerp(seg.ax, seg.bx, t);
    this.y = lerp(seg.ay, seg.by, t);
  }

  // Progress as 0..1 along the whole path. Used to pick "leads" target.
  get progress() {
    return this.totalLength === 0 ? 1 : this.distance / this.totalLength;
  }

  // Tile the monster currently occupies (used by melee troops).
  get tile() {
    return {
      gx: Math.floor(this.x / CONFIG.TILE_SIZE),
      gy: Math.floor(this.y / CONFIG.TILE_SIZE),
    };
  }

  // Tile-distance to another tile (Chebyshev so diagonals feel fair).
  tileDistanceTo(gx, gy) {
    const mt = this.tile;
    return Math.max(Math.abs(mt.gx - gx), Math.abs(mt.gy - gy));
  }

  // Tile distance from a troop tile (for ranged targeting).
  worldDistanceFromTile(gx, gy) {
    const c = tileCenter(gx, gy);
    return dist(this.x, this.y, c.x, c.y);
  }

  takeDamage(amount) {
    if (typeof amount !== 'number' || isNaN(amount) || amount <= 0) return { killed: false };
    this.hp -= amount;
    if (this.hp <= 0) {
      this.hp = 0;
      this.alive = false;
      return { killed: true, reward: this.reward };
    }
    return { killed: false };
  }

  update(dt) {
    if (!this.alive) return;
    // Stunned: count down timer but don't move.
    if (this.stunTimer > 0) {
      this.stunTimer = Math.max(0, this.stunTimer - dt);
      return;
    }
    this.distance += this.speed * CONFIG.TILE_SIZE * dt;
    this._updatePosition();
  }
}