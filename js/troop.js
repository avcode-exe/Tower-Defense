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
    // Cached computed stats (recomputed on upgrade).
    this._cachedDamage = this.spec.damage;
    this._cachedRange = this.spec.range;
    this._cachedAttackSpeed = this.spec.attackSpeed;
    this._cachedChain = this.spec.chain || 0;
  }

  // Scaled stats (1.2x per level). Cached for performance.
  getDamage()     { return this._cachedDamage; }
  getRange()      { return this._cachedRange; }
  getAttackSpeed(){ return this._cachedAttackSpeed; }
  getChain()      { return this._cachedChain; }

  // Recompute cached stats (called after upgrade).
  _recomputeStats() {
    this._cachedDamage = Math.round(this.spec.damage * Math.pow(1.2, this.dmgLevel - 1));
    this._cachedRange = this.spec.type === 'melee' ? this.spec.range : this.spec.range + (this.rangeLevel - 1);
    this._cachedAttackSpeed = +(this.spec.attackSpeed * Math.pow(0.9, this.speedLevel - 1)).toFixed(2);
    this._cachedChain = (this.spec.chain || 0) + (this.chainLevel - 1);
  }

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
    if (stat === 'chain' && !this.spec.chain) return false;
    return true;
  }

  // Upgrade a specific stat. Returns false if already maxed or invalid for this troop type.
  upgradeStat(stat) {
    if (!this.canUpgrade(stat)) return false;
    let changed = false;
    if (stat === 'dmg' && this.dmgLevel < this.maxUpgradeLevel) { this.dmgLevel++; changed = true; }
    if (stat === 'range' && this.rangeLevel < this.maxUpgradeLevel) { this.rangeLevel++; changed = true; }
    if (stat === 'speed' && this.speedLevel < this.maxUpgradeLevel) { this.speedLevel++; changed = true; }
    if (stat === 'chain' && this.chainLevel < this.maxUpgradeLevel) { this.chainLevel++; changed = true; }
    if (changed) this._recomputeStats();
    return changed;
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
    const range = this._cachedRange;
    const rangePx = (range + 0.5) * CONFIG.TILE_SIZE;
    const tgx = this.gx, tgy = this.gy;
    if (this.spec.type === 'melee') {
      let best = null;
      let bestDist = range + 0.5 + 1;
      for (let i = 0; i < monsters.length; i++) {
        const m = monsters[i];
        if (!m.alive) continue;
        const d = m.tileDistanceTo(tgx, tgy);
        if (d <= range + 0.5 && d < bestDist) {
          bestDist = d;
          best = m;
        }
      }
      return best;
    }
    let best = null;
    let bestProgress = -1;
    const tx = tgx * CONFIG.TILE_SIZE + (CONFIG.TILE_SIZE >> 1);
    const ty = tgy * CONFIG.TILE_SIZE + (CONFIG.TILE_SIZE >> 1);
    const rangePxSq = rangePx * rangePx;
    for (let i = 0; i < monsters.length; i++) {
      const m = monsters[i];
      if (!m.alive) continue;
      // Inline worldDistanceFromTile to avoid tileCenter allocation.
      const dx = m.x - tx, dy = m.y - ty;
      const pxSq = dx * dx + dy * dy;
      if (pxSq <= rangePxSq) {
        const prog = m.progress;
        if (prog > bestProgress) {
          bestProgress = prog;
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

    const dmg = this._cachedDamage;
    const atkSpd = this._cachedAttackSpeed;
    if (this.spec.type === 'melee') {
      if (game) {
        if (this.spec.aoe) {
          // Hit all monsters in range (360-degree swing).
          const rng = this._cachedRange;
          for (let i = 0; i < monsters.length; i++) {
            const m = monsters[i];
            if (!m.alive) continue;
            if (m.tileDistanceTo(this.gx, this.gy) <= rng + 0.5) {
              game.damageMonster(m, dmg);
            }
          }
        } else {
          game.damageMonster(this.target, dmg);
        }
      }
      this.cooldown = atkSpd;
    } else {
      projectiles.push(new Projectile(this, this.target, this.x, this.y));
      this.cooldown = atkSpd;
    }
  }
}