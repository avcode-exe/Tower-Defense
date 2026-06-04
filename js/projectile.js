// Projectile for ranged troops. Stores the target's id at spawn time so that
// if the target dies mid-flight we resolve on impact at the last known
// position (or the projectile simply disappears, depending on style).

class Projectile {
  constructor(troop, monster, x, y) {
    this.troop = troop;
    const style = PROJECTILE_STYLES[troop.spec.id] || { color: '#fff', size: 4, speed: 10, kind: 'orb' };
    this.color = style.color;
    this.size = style.size;
    this.speed = style.speed * CONFIG.TILE_SIZE; // px/s
    this.kind = style.kind;

    this.x = x;
    this.y = y;
    this.target = monster;
    this.targetId = monster ? monster._id : -1;
    this.lastTargetX = monster ? monster.x : x;
    this.lastTargetY = monster ? monster.y : y;
    this.alive = true;
  }

  update(dt, monsters, onImpact) {
    // If the target died, fly toward its last known position.
    if (!this.target || !this.target.alive) {
      // Try to re-aim onto any nearby monster in splash radius for nicer feel.
      this.target = null;
    } else {
      this.lastTargetX = this.target.x;
      this.lastTargetY = this.target.y;
    }

    const dx = this.lastTargetX - this.x;
    const dy = this.lastTargetY - this.y;
    const d = Math.sqrt(dx * dx + dy * dy);
    const step = this.speed * dt;
    if (d <= step || d === 0) {
      // Impact.
      this.x = this.lastTargetX;
      this.y = this.lastTargetY;
      onImpact(this);
      this.alive = false;
      return;
    }
    this.x += (dx / d) * step;
    this.y += (dy / d) * step;
    // Trail particle (every frame while in flight).
    if (typeof PARTICLES !== 'undefined') {
      PARTICLES.spawnTrail(this.x, this.y, this.color);
    }
  }
}
