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
    this.dmgLevel = 1;
    this.rangeLevel = 1;
    this.speedLevel = 1;
    this.chainLevel = 1;
    this.maxUpgradeLevel = 5;
    this.cooldown = 0;
    this.target = null;
    this.targetRefresh = 0;
    this.alive = true;
  }

  // Scaled stats (1.2x per level).
  getDamage()     { return Math.round(this.spec.damage * Math.pow(1.2, this.dmgLevel - 1)); }
  getRange()      {
    if (this.spec.type === 'melee') return this.spec.range;
    return this.spec.range + (this.rangeLevel - 1) * 1;
  }
  getAttackSpeed(){ return +(this.spec.attackSpeed * Math.pow(0.9, this.speedLevel - 1)).toFixed(2); }
  getChain()      { return (this.spec.chain || 0) + (this.chainLevel - 1); }

  // Cost for next upgrade of a stat: base cost * 2^(level-1).
  getUpgradeCost(stat) {
    let level;
    if (stat === 'dmg') level = this.dmgLevel;
    else if (stat === 'range') level = this.rangeLevel;
    else if (stat === 'speed') level = this.speedLevel;
    else if (stat === 'chain') level = this.chainLevel;
    else return Infinity;
    return this.spec.cost * Math.pow(2, level - 1);
  }

  // Returns true when the stat is even visible/upgradable for this troop type
  // (melee troops hide range, non-lightning hide chain).
  canUpgrade(stat) {
    if (stat === 'range' && this.spec.type === 'melee') return false;
    if (stat === 'chain' && this.spec.id !== 'lightning') return false;
    return true;
  }

  // Upgrade a specific stat. Returns false if already maxed or invalid for this troop type.
  upgradeStat(stat) {
    if (!this.canUpgrade(stat)) return false;
    if (stat === 'dmg' && this.dmgLevel < this.maxUpgradeLevel) { this.dmgLevel++; return true; }
    if (stat === 'range' && this.rangeLevel < this.maxUpgradeLevel) { this.rangeLevel++; return true; }
    if (stat === 'speed' && this.speedLevel < this.maxUpgradeLevel) { this.speedLevel++; return true; }
    if (stat === 'chain' && this.chainLevel < this.maxUpgradeLevel) { this.chainLevel++; return true; }
    return false;
  }

  isMaxed(stat) {
    // Hidden stats are reported as maxed so the UI button collapses cleanly.
    if (!this.canUpgrade(stat)) return true;
    if (stat === 'dmg') return this.dmgLevel >= this.maxUpgradeLevel;
    if (stat === 'range') return this.rangeLevel >= this.maxUpgradeLevel;
    if (stat === 'speed') return this.speedLevel >= this.maxUpgradeLevel;
    if (stat === 'chain') return this.chainLevel >= this.maxUpgradeLevel;
    return false;
  }

  // Total gold invested in this troop (base cost + all upgrades).
  getTotalInvested() {
    let total = this.spec.cost;
    for (const stat of ['dmg', 'range', 'speed', 'chain']) {
      const level = stat === 'dmg' ? this.dmgLevel : stat === 'range' ? this.rangeLevel : stat === 'speed' ? this.speedLevel : this.chainLevel;
      for (let l = 1; l < level; l++) {
        total += this.spec.cost * Math.pow(2, l - 1);
      }
    }
    return total;
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
      this.cooldown = this.getAttackSpeed();
    } else {
      projectiles.push(new Projectile(this, this.target, this.x, this.y));
      this.cooldown = this.getAttackSpeed();
    }
  }
}