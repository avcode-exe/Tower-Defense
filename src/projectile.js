import { CONFIG, PROJECTILE_STYLES } from './config.js';
import { PARTICLES } from './particles.js';

// Projectile for ranged troops. Tracks the target by reference; if the target
// dies mid-flight the projectile continues to the last known position and
// resolves impact there (splash/chain/direct).

export class Projectile {
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
    this.lastTargetX = monster ? monster.x : x;
    this.lastTargetY = monster ? monster.y : y;
    this.alive = true;
    this.age = 0;
    this._trailFrame = 0;
  }

  update(dt, monsters, onImpact) {
    this.age += dt;
    // Kill stale projectiles that have been flying without a target.
    // Use a shorter timeout (0.5s) when target is dead so they don't linger.
    if (!this.target || !this.target.alive) {
      this.target = null;
      if (this.age > 0.5) {
        this.alive = false;
        return;
      }
    } else {
      this.lastTargetX = this.target.x;
      this.lastTargetY = this.target.y;
    }

    const dx = this.lastTargetX - this.x;
    const dy = this.lastTargetY - this.y;
    const dSq = dx * dx + dy * dy;
    const step = this.speed * dt;
    if (dSq <= step * step) {
      // Impact.
      this.x = this.lastTargetX;
      this.y = this.lastTargetY;
      try {
        onImpact(this);
      } catch (e) {
        console.warn('Projectile impact error:', e);
      }
      this.alive = false;
      return;
    }
    const d = Math.sqrt(dSq);
    this.x += (dx / d) * step;
    this.y += (dy / d) * step;
    // Trail particle — throttle to every 3rd frame to reduce pool pressure.
    {
      this._trailFrame++;
      if (this._trailFrame % 3 === 0) {
        PARTICLES.spawnTrail(this.x, this.y, this.color);
      }
    }
  }
}
