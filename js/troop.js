// A troop is a static defender placed on a tile. It has a target, a cooldown
// timer, and HP. Melee troops deal direct damage each swing; ranged troops
// spawn a Projectile.

class Troop {
  constructor(spec, gx, gy) {
    this.spec = spec;
    this.gx = gx;
    this.gy = gy;
    const c = tileCenter(gx, gy);
    this.x = c.x;
    this.y = c.y;
    this.level = 1;
    this.maxLevel = 5;
    this.cooldown = 0;
    this.target = null;
    this.targetRefresh = 0;
    this.alive = true;
  }

  // Scaled stats (1.2x per level).
  getDamage()   { return Math.round(this.spec.damage * Math.pow(1.2, this.level - 1)); }
  getRange()    { return this.spec.range; }

  // Upgrade cost: spec.cost * 2^(level-1). Level 1->2: cost*1, 2->3: cost*2, etc.
  getUpgradeCost() {
    if (this.level >= this.maxLevel) return -1;
    return Math.floor(this.spec.cost * Math.pow(2, this.level - 1));
  }

  upgrade() {
    if (this.level >= this.maxLevel) return false;
    this.level++;
    return true;
  }

  pickTarget(monsters) {
    const range = this.getRange();
    if (this.spec.type === 'melee') {
      let best = null;
      let bestDist = range + 0.5 + 1;
      for (const m of monsters) {
        if (!m.alive) continue;
        const d = m.tileDistanceTo(this.gx, this.gy);
        if (d <= range + 0.5 && d < bestDist) {
          bestDist = d;
          best = m;
        }
      }
      return best;
    }
    let best = null;
    let bestProgress = -1;
    for (const m of monsters) {
      if (!m.alive) continue;
      const mt = m.tile;
      if (mt.gx === this.gx && mt.gy === this.gy) continue;
      const px = m.worldDistanceFromTile(this.gx, this.gy);
      if (px <= (range + 0.5) * CONFIG.TILE_SIZE) {
        if (m.progress > bestProgress) {
          bestProgress = m.progress;
          best = m;
        }
      }
    }
    return best;
  }

  update(dt, monsters, projectiles, game) {
    if (!this.alive) return;
    this.cooldown = Math.max(0, this.cooldown - dt);
    this.targetRefresh -= dt;
    if (this.targetRefresh <= 0) {
      this.target = this.pickTarget(monsters);
      this.targetRefresh = CONFIG.TARGET_REFRESH_INTERVAL;
    }
    if (!this.target || !this.target.alive) return;
    if (this.cooldown > 0) return;

    if (this.spec.type === 'melee') {
      if (game) {
        if (this.spec.aoe) {
          // Hit all monsters in range (360-degree swing).
          for (const m of monsters) {
            if (!m.alive) continue;
            if (m.tileDistanceTo(this.gx, this.gy) <= this.getRange() + 0.5) {
              game.damageMonster(m, this.getDamage());
            }
          }
        } else {
          game.damageMonster(this.target, this.getDamage());
        }
      }
      this.cooldown = this.spec.attackSpeed;
    } else {
      projectiles.push(new Projectile(this, this.target, this.x, this.y));
      this.cooldown = this.spec.attackSpeed;
    }
  }
}
