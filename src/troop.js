import { CONFIG, TROOP_SPECS } from './config.js';
import { PARTICLES } from './particles.js';
import { AUDIO } from './audio.js';

const STAT_LEVEL_PROPS = {
  dmg: 'dmgLevel',
  range: 'rangeLevel',
  speed: 'speedLevel',
  chain: 'chainLevel',
  slow: 'slowLevel',
  hp: 'hpLevel',
};

function compareHealPriority(a, b) {
  const ratioDelta = a.hpRatio - b.hpRatio;
  if (ratioDelta !== 0) return ratioDelta;
  const hpDelta = a.hp - b.hp;
  if (hpDelta !== 0) return hpDelta;
  const distDelta = a.distSq - b.distSq;
  if (distDelta !== 0) return distDelta;
  return a.index - b.index;
}

function monstersInRange(gx, gy, range, monsterTileIndex, gridSize) {
  const results = [];
  const r = Math.ceil(range);
  for (let dx = -r; dx <= r; dx++) {
    for (let dy = -r; dy <= r; dy++) {
      const tx = gx + dx;
      const ty = gy + dy;
      if (tx < 0 || tx >= gridSize || ty < 0 || ty >= gridSize) continue;
      const tile = monsterTileIndex[ty * gridSize + tx];
      if (tile) {
        for (let i = 0; i < tile.length; i++) {
          results.push(tile[i]);
        }
      }
    }
  }
  return results;
}

// A troop is a static defender placed on a tile. It has a target, a cooldown
// timer, and HP. Melee troops deal direct damage each swing; ranged troops
// spawn a Projectile.

export class Troop {
  constructor(spec, gx, gy) {
    this.spec = spec;
    this.gx = gx;
    this.gy = gy;
    this.x = gx * CONFIG.TILE_SIZE + CONFIG.TILE_SIZE / 2;
    this.y = gy * CONFIG.TILE_SIZE + CONFIG.TILE_SIZE / 2;
    this.dmgLevel = 1;
    this.rangeLevel = 1;
    this.speedLevel = 1;
    this.chainLevel = 1;
    this.slowLevel = 1;
    this.hpLevel = 1;
    this.maxUpgradeLevel = CONFIG.MAX_UPGRADE_LEVEL || 5;
    this.cooldown = 0;
    this.target = null;
    this.targetRefresh = 0;
    this.alive = true;
    this.hp = spec.hp;
    this.maxHp = spec.hp;
    this.shield = 0;
    this.maxShield = 0;
    this.healCount = 0;
    this.healBeam = null; // { troop, timer } — tracks active heal beam from a healer
    this.healTargetLevel = 1;
    this.healTargets = []; // locked heal targets (troop references)
    // Cached computed stats (recomputed on upgrade).
    this._cachedDamage = this.spec.damage;
    this._cachedRange = this.spec.range;
    this._cachedAttackSpeed = this.spec.attackSpeed;
    this._cachedChain = this.spec.chain || 0;
    this._cachedSlowFactor = this.spec.slowFactor || 1;
    this._cachedSlowDuration = this.spec.slowDuration || 0;
    this._cachedShatterBonus = this.spec.shatterBonus || 0;
    this._recomputeStats();
    this.maxHp = this._cachedMaxHp;
    this.healGoldSpent = 0;
    this._upgradeCostCache = {};
  }

  // Scaled stats (1.2x per level). Cached for performance.
  getDamage() {
    return this._cachedDamage;
  }
  getRange() {
    return this._cachedRange;
  }
  getHealRangePxSq() {
    const rangePx = (this._cachedRange + CONFIG.TILE_BUFFER) * CONFIG.TILE_SIZE;
    return rangePx * rangePx;
  }
  getAttackSpeed() {
    return this._cachedAttackSpeed;
  }
  getMonsterDamage() {
    return this.spec.monsterDamage || 0;
  }
  getHealAmount() {
    return this._cachedDamage;
  }
  getDps() {
    return this._cachedDamage / this._cachedAttackSpeed;
  }
  getHps() {
    return this.spec.type === 'support' ? this._cachedDamage / this._cachedAttackSpeed : 0;
  }
  getHealTargetCount() {
    return this.healTargetLevel;
  }
  getChain() {
    return this._cachedChain;
  }
  getSlowFactor() {
    return this._cachedSlowFactor || this.spec.slowFactor || 1;
  }
  getSlowDuration() {
    return this._cachedSlowDuration || this.spec.slowDuration || 0;
  }

  // Recompute cached stats (called after upgrade).
  _recomputeStats() {
    this._cachedDamage = Math.round(this.spec.damage * Math.pow(CONFIG.DAMAGE_SCALE_PER_LEVEL, this.dmgLevel - 1));
    this._cachedRange = this.spec.type === 'melee' ? this.spec.range : this.spec.range + (this.rangeLevel - 1);
    this._cachedAttackSpeed =
      Math.round(this.spec.attackSpeed * Math.pow(CONFIG.SPEED_SCALE_PER_LEVEL, this.speedLevel - 1) * 100) / 100;
    this._cachedChain = (this.spec.chain || 0) + (this.chainLevel - 1);
    this._cachedMaxHp = Math.round(this.spec.hp * Math.pow(CONFIG.HP_SCALE_PER_LEVEL, this.hpLevel - 1));
    this._cachedSlowFactor =
      this.spec.slowFactor != null
        ? Math.round(this.spec.slowFactor * Math.pow(CONFIG.SLOW_FACTOR_SCALE_PER_LEVEL, this.slowLevel - 1) * 1000) /
          1000
        : 1;
    this._cachedSlowDuration =
      this.spec.slowDuration != null
        ? Math.round(this.spec.slowDuration * Math.pow(CONFIG.SLOW_DURATION_SCALE_PER_LEVEL, this.slowLevel - 1) * 10) /
          10
        : 0;
    this._cachedShatterBonus =
      this.spec.shatterBonus != null
        ? Math.round(
            this.spec.shatterBonus * Math.pow(CONFIG.SHATTER_BONUS_SCALE_PER_LEVEL, this.slowLevel - 1) * 1000
          ) / 1000
        : 0;
  }

  // Cost for next upgrade of a stat: base cost * 1.35^(level-1).
  getUpgradeCost(stat) {
    const levelMap = {};
    for (const [key, prop] of Object.entries(STAT_LEVEL_PROPS)) {
      levelMap[key] = this[prop];
    }
    if (this.spec.type === 'support') levelMap.slow = this.healTargetLevel;
    const level = levelMap[stat];
    if (level === undefined) return Infinity;
    const cacheKey = stat + '_' + level;
    if (this._upgradeCostCache[cacheKey] === undefined) {
      this._upgradeCostCache[cacheKey] = Math.round(this.spec.cost * Math.pow(CONFIG.UPGRADE_COST_SCALE, level - 1));
    }
    return this._upgradeCostCache[cacheKey];
  }

  // Returns true when the stat is even visible/upgradable for this troop type
  // (melee troops hide range, non-lightning hide chain).
  canUpgrade(stat) {
    if (stat === 'range' && this.spec.type === 'melee') return false;
    if (stat === 'chain' && !this.spec.chain) return false;
    if (stat === 'slow' && this.spec.type !== 'support' && !this.spec.slowFactor) return false;
    return true;
  }

  // Upgrade a specific stat. Returns false if already maxed or invalid for this troop type.
  upgradeStat(stat) {
    if (!this.canUpgrade(stat)) return false;
    if (stat === 'slow' && this.spec.type === 'support') {
      if (this.healTargetLevel >= this.maxUpgradeLevel) return false;
      this.healTargetLevel++;
      this._upgradeCostCache = {};
      return true;
    }
    const levelProp = STAT_LEVEL_PROPS[stat];
    if (!levelProp) return false;
    if (this[levelProp] >= this.maxUpgradeLevel) return false;
    this[levelProp]++;
    if (stat === 'hp') {
      const oldMaxHp = this.maxHp;
      this._recomputeStats();
      this.maxHp = this._cachedMaxHp;
      this.hp = Math.min(this.hp + (this.maxHp - oldMaxHp), this.maxHp);
    } else {
      this._recomputeStats();
    }
    this._upgradeCostCache = {};
    return true;
  }

  isMaxed(stat) {
    if (!this.canUpgrade(stat)) return true;
    if (stat === 'slow' && this.spec.type === 'support') return this.healTargetLevel >= this.maxUpgradeLevel;
    const levelProp = STAT_LEVEL_PROPS[stat];
    if (!levelProp) return false;
    return this[levelProp] >= this.maxUpgradeLevel;
  }

  // Heal cost: percentage of base troop price, rounded up.
  getHealCost() {
    return Math.ceil(this.spec.cost * CONFIG.TROOP_HEAL_COST_RATIO);
  }

  // Can this troop be healed?
  canHeal() {
    return this.alive && this.hp < this.maxHp;
  }

  // Heal the troop by a percentage of max HP. Returns true if healed.
  heal() {
    if (!this.canHeal()) return false;
    const healAmount = Math.ceil(this.maxHp * CONFIG.TROOP_HEAL_HP_RATIO);
    this.hp = Math.min(this.hp + healAmount, this.maxHp);
    this.healCount++;
    return true;
  }

  // Cost = 50% of base spec.cost, rounded up. Mirrors getHealCost() style.
  getShieldCost() {
    return Math.ceil(this.spec.cost * CONFIG.SHIELD_COST_RATIO);
  }

  // Returns true when no shield is currently equipped (one-at-a-time rule).
  canAddShield() {
    return this.alive && this.shield <= 0;
  }

  // Set shield to 100% of max HP. Idempotent guard.
  applyShield() {
    if (this.shield > 0) return false;
    this.maxShield = this.maxHp;
    this.shield = this.maxShield;
    return true;
  }

  // Force-clear shield (used at wave-10 expiration and on sell/restart).
  clearShield() {
    this.shield = 0;
    this.maxShield = 0;
  }

  // Helpers used by renderer.
  getShieldRatio() {
    return this.maxShield > 0 ? this.shield / this.maxShield : 0;
  }
  hasShield() {
    return this.shield > 0;
  }

  // Current HP as a percentage (0-100), for display.
  getHpPercent() {
    return this.maxHp > 0 ? Math.round((this.hp / this.maxHp) * 100) : 0;
  }

  // Total gold invested in this troop (base cost + all upgrades).
  getTotalInvested() {
    let total = this.spec.cost;
    const levelMap = {};
    for (const [key, prop] of Object.entries(STAT_LEVEL_PROPS)) {
      levelMap[key] = this[prop];
    }
    if (this.spec.type === 'support') levelMap.slow = this.healTargetLevel;
    for (const stat of ['dmg', 'range', 'speed', 'chain', 'hp', 'slow']) {
      const level = levelMap[stat];
      for (let l = 1; l < level; l++) {
        total += Math.round(this.spec.cost * Math.pow(CONFIG.UPGRADE_COST_SCALE, l - 1));
      }
    }
    total += this.healGoldSpent;
    return total;
  }

  pickHealTarget(troops, troopIndexMap) {
    if (this.spec.type !== 'support') return null;
    const rangePxSq = this.getHealRangePxSq();
    const maxTargets = this.healTargetLevel;

    for (let i = this.healTargets.length - 1; i >= 0; i--) {
      const t = this.healTargets[i];
      if (!t.alive || t.hp >= t.maxHp || t.spec.type === 'support') {
        this.healTargets.splice(i, 1);
        continue;
      }
      const dx = t.x - this.x;
      const dy = t.y - this.y;
      if (dx * dx + dy * dy > rangePxSq) {
        this.healTargets.splice(i, 1);
      }
    }

    if (this.healTargets.length < maxTargets) {
      const candidates = [];
      const healTargetSet = new Set(this.healTargets);
      for (let i = 0; i < troops.length; i++) {
        const t = troops[i];
        if (!t.alive || t === this || t.hp >= t.maxHp || t.spec.type === 'support') continue;
        if (healTargetSet.has(t)) continue;
        const dx = t.x - this.x;
        const dy = t.y - this.y;
        const distSq = dx * dx + dy * dy;
        if (distSq <= rangePxSq) {
          candidates.push({
            troop: t,
            hpRatio: t.getHpRatio(),
            hp: t.hp,
            distSq,
            index: i,
          });
        }
      }
      candidates.sort(compareHealPriority);
      const slots = maxTargets - this.healTargets.length;
      for (let i = 0; i < Math.min(slots, candidates.length); i++) {
        this.healTargets.push(candidates[i].troop);
      }
    }

    const indexMap = troopIndexMap || new Map(troops.map((t, i) => [t, i]));
    const sorted = this.healTargets.map((a) => {
      const dxA = a.x - this.x;
      const dyA = a.y - this.y;
      return {
        troop: a,
        hpRatio: a.getHpRatio(),
        hp: a.hp,
        distSq: dxA * dxA + dyA * dyA,
        index: indexMap.get(a),
      };
    });
    sorted.sort(compareHealPriority);
    this.healTargets = sorted.map((entry) => entry.troop);

    return this.healTargets.length > 0 ? this.healTargets[0] : null;
  }

  damageMonstersInHealRange(game) {
    if (!game) return;
    if (!game.monsters || game.monsters.length === 0) return;

    const monsterDamage = this.getMonsterDamage();
    if (!monsterDamage) return;

    const rangePxSq = this.getHealRangePxSq();
    const typX = this.x;
    const typY = this.y;
    const tileIndex = game._monsterTileIndex;
    if (Array.isArray(tileIndex)) {
      const tileRange = this._cachedRange + CONFIG.TILE_BUFFER;
      const candidates = monstersInRange(this.gx, this.gy, tileRange, tileIndex, CONFIG.GRID_SIZE);
      for (let i = 0; i < candidates.length; i++) {
        const m = candidates[i];
        if (!m.alive) continue;
        const mx = m.x - typX,
          my = m.y - typY;
        if (mx * mx + my * my <= rangePxSq) {
          game.damageMonster(m, monsterDamage);
        }
      }
      return;
    }
    for (let i = game.monsters.length - 1; i >= 0; i--) {
      const m = game.monsters[i];
      if (!m.alive) continue;
      const dx = m.x - typX,
        dy = m.y - typY;
      if (dx * dx + dy * dy <= rangePxSq) {
        game.damageMonster(m, monsterDamage);
      }
    }
  }

  pickTarget(monsters, tileIndex) {
    const range = this._cachedRange;
    const tgx = this.gx,
      tgy = this.gy;
    const G = CONFIG.GRID_SIZE;
    const tileBuf = CONFIG.TILE_BUFFER;
    if (this.spec.type === 'melee') {
      let best = null;
      let bestDist = range + tileBuf + 1;
      if (tileIndex) {
        const candidates = monstersInRange(tgx, tgy, 1, tileIndex, G);
        for (let i = 0; i < candidates.length; i++) {
          const m = candidates[i];
          if (!m.alive) continue;
          const d = m.tileDistanceTo(tgx, tgy);
          if (d <= range + tileBuf && d < bestDist) {
            bestDist = d;
            best = m;
          }
        }
        return best;
      }
      for (let i = 0; i < monsters.length; i++) {
        const m = monsters[i];
        if (!m.alive) continue;
        const d = m.tileDistanceTo(tgx, tgy);
        if (d <= range + tileBuf && d < bestDist) {
          bestDist = d;
          best = m;
        }
      }
      return best;
    }
    const rangePx = (range + tileBuf) * CONFIG.TILE_SIZE;
    let best = null;
    let bestProgress = -1;
    const centerX = tgx * CONFIG.TILE_SIZE + (CONFIG.TILE_SIZE >> 1);
    const centerY = tgy * CONFIG.TILE_SIZE + (CONFIG.TILE_SIZE >> 1);
    const rangePxSq = rangePx * rangePx;
    if (tileIndex) {
      const tileRange = range + tileBuf;
      const candidates = monstersInRange(tgx, tgy, tileRange, tileIndex, G);
      for (let i = 0; i < candidates.length; i++) {
        const m = candidates[i];
        if (!m.alive) continue;
        const dx2 = m.x - centerX,
          dy2 = m.y - centerY;
        if (dx2 * dx2 + dy2 * dy2 <= rangePxSq) {
          if (m.progress > bestProgress) {
            bestProgress = m.progress;
            best = m;
          }
        }
      }
      return best;
    }
    // Fallback: linear scan when tile index is unavailable.
    for (let i = 0; i < monsters.length; i++) {
      const m = monsters[i];
      if (!m.alive) continue;
      const dx = m.x - centerX,
        dy = m.y - centerY;
      if (dx * dx + dy * dy <= rangePxSq) {
        if (m.progress > bestProgress) {
          bestProgress = m.progress;
          best = m;
        }
      }
    }
    return best;
  }

  takeDamage(amount) {
    if (!Number.isFinite(amount) || amount <= 0) return false;

    // Shield absorbs damage first (mirrors Monster.takeDamage behavior).
    if (this.shield > 0 && amount > 0) {
      if (amount >= this.shield) {
        const excess = amount - this.shield;
        this.shield = 0;
        this.maxShield = 0;
        this.hp -= excess;
      } else {
        this.shield -= amount;
        // excess = 0; hp untouched
      }
    } else {
      this.hp -= amount;
    }
    if (this.hp <= 0) {
      this.hp = 0;
      this.alive = false;
      return true;
    }
    return false;
  }

  getHpRatio() {
    return this.maxHp > 0 ? this.hp / this.maxHp : 0;
  }

  update(dt, monsters, projectiles, game) {
    if (!this.alive) return;
    this.cooldown = Math.max(0, this.cooldown - dt);
    this.targetRefresh -= dt;
    if (this.healBeam) {
      this.healBeam.timer -= dt;
      if (this.healBeam.timer <= 0) this.healBeam = null;
    }

    // Support troops heal allies instead of attacking monsters.
    if (this.spec.type === 'support') {
      if (this.targetRefresh <= 0) {
        this.pickHealTarget(game ? game.troops : [], game ? game._troopIndexByRef : null);
        this.targetRefresh = CONFIG.TARGET_REFRESH_INTERVAL;
      }
      if (this.cooldown > 0) return;
      if (!game) return;
      const healAmount = this._cachedDamage;
      for (let i = this.healTargets.length - 1; i >= 0; i--) {
        const t = this.healTargets[i];
        if (!t.alive || t.hp >= t.maxHp || t.spec.type === 'support' || t === this) {
          this.healTargets.splice(i, 1);
          continue;
        }
        const prevHp = t.hp;
        t.hp = Math.min(t.hp + healAmount, t.maxHp);
        const actual = Math.ceil(t.hp - prevHp);
        if (actual > 0) {
          game._getPopup('+' + actual, t.x, t.y - 10, 0.8, '#44cc44');
          PARTICLES.healBurst(t.x, t.y);
          t.healBeam = { troop: this, timer: 0.6 };
        }
      }
      this.damageMonstersInHealRange(game);
      this.cooldown = this._cachedAttackSpeed;
      return;
    }

    // Non-support: original targeting and combat logic below.
    if (this.targetRefresh <= 0) {
      this.target = this.pickTarget(monsters, game ? game._monsterTileIndex : null);
      this.targetRefresh = CONFIG.TARGET_REFRESH_INTERVAL;
    }
    if (!this.target || !this.target.alive) return;
    if (this.cooldown > 0) return;
    if (!game) return;

    const dmg = this._cachedDamage;
    const atkSpd = this._cachedAttackSpeed;
    if (this.spec.type === 'melee') {
      if (this.spec.aoe) {
        const rng = this._cachedRange;
        const tileIndex = game._monsterTileIndex;
        if (tileIndex) {
          const candidates = monstersInRange(this.gx, this.gy, 1, tileIndex, CONFIG.GRID_SIZE);
          for (let i = 0; i < candidates.length; i++) {
            const m = candidates[i];
            if (!m.alive) continue;
            if (m.tileDistanceTo(this.gx, this.gy) <= rng + CONFIG.TILE_BUFFER) {
              game.damageMonster(m, dmg);
            }
          }
        } else {
          for (let i = 0; i < monsters.length; i++) {
            const m = monsters[i];
            if (!m.alive) continue;
            if (m.tileDistanceTo(this.gx, this.gy) <= rng + CONFIG.TILE_BUFFER) {
              game.damageMonster(m, dmg);
            }
          }
        }
      } else {
        const killed = game.damageMonster(this.target, dmg);
        if (!killed && this.spec.burnStacks) {
          game.applyBurn(this.target, this);
        }
      }
      this.cooldown = atkSpd;
    } else {
      const proj = game.acquireProjectile(this, this.target, this.x, this.y);
      if (proj) projectiles.push(proj);
      this.cooldown = atkSpd;
    }
  }
}
