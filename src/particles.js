// Lightweight particle system for visual effects. All rendering is procedural
// (no external assets). Particles are spawned at event points and drawn in
// world space during the render pass.
import { CONFIG } from './config.js';

const ALPHA_LEVELS = 10;
const BUCKET_STRIDE = ALPHA_LEVELS + 1;

export class Particle {
  constructor() {
    this.x = 0;
    this.y = 0;
    this.vx = 0;
    this.vy = 0;
    this.life = 0;
    this.maxLife = 1;
    this.color = '#fff';
    this.size = 2;
    this.gravity = false;
    this.alive = false;
  }

  reset(x, y, vx, vy, life, color, size, gravity) {
    this.x = x;
    this.y = y;
    this.vx = vx;
    this.vy = vy;
    this.life = life;
    this.maxLife = life;
    this.color = color;
    this.size = size;
    this.gravity = gravity;
    this.alive = true;
  }

  update(dt) {
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    if (this.gravity) this.vy += CONFIG.PARTICLE_GRAVITY * dt;
    this.life -= dt;
    if (this.life <= 0) this.alive = false;
  }
}

const EFFECT_DEFS = {
  hitSpark: {
    cfg: {
      color: '#fff',
      minSize: 1,
      maxSize: 2.5,
      minSpeed: 40,
      maxSpeed: 90,
      minLife: 0.15,
      maxLife: 0.3,
      gravity: false,
    },
    count: 4,
  },
  deathBurst: {
    cfg: {
      color: '#fff',
      minSize: 1.5,
      maxSize: 3.5,
      minSpeed: 50,
      maxSpeed: 130,
      minLife: 0.25,
      maxLife: 0.55,
      gravity: false,
    },
    count: 10,
  },
  troopDeath: {
    cfg: {
      color: '#fff',
      minSize: 2,
      maxSize: 5,
      minSpeed: 50,
      maxSpeed: 100,
      minLife: 0.3,
      maxLife: 0.7,
      gravity: false,
    },
    count: 15,
  },
  splashImpact: {
    cfg: {
      color: '#9b59b6',
      minSize: 1.5,
      maxSize: 3,
      minSpeed: 60,
      maxSpeed: 140,
      minLife: 0.2,
      maxLife: 0.45,
      gravity: false,
    },
    count: 12,
  },
  chainSpark: {
    cfg: {
      color: '#f1c40f',
      minSize: 1,
      maxSize: 2,
      minSpeed: 30,
      maxSpeed: 70,
      minLife: 0.1,
      maxLife: 0.2,
      gravity: false,
    },
    count: 3,
  },
  troopShieldActivate: {
    cfg: {
      color: '#5dade2',
      minSize: 1.5,
      maxSize: 3.5,
      minSpeed: 40,
      maxSpeed: 100,
      minLife: 0.3,
      maxLife: 0.6,
      gravity: false,
    },
    count: 12,
  },
  slowApply: {
    cfg: {
      color: '#7fdbff',
      minSize: 2,
      maxSize: 4,
      minSpeed: 20,
      maxSpeed: 60,
      minLife: 0.4,
      maxLife: 0.8,
      gravity: false,
    },
    count: 8,
  },
  burnApply: {
    cfg: {
      color: '#ff7a18',
      minSize: 2,
      maxSize: 5,
      minSpeed: 25,
      maxSpeed: 80,
      minLife: 0.35,
      maxLife: 0.7,
      gravity: false,
    },
    count: 8,
  },
  burnTick: {
    cfg: {
      color: '#ff7a18',
      minSize: 1.5,
      maxSize: 3,
      minSpeed: 10,
      maxSpeed: 35,
      minLife: 0.25,
      maxLife: 0.45,
      gravity: false,
    },
    count: 4,
  },
  healBurst: {
    cfg: {
      color: '#44cc44',
      minSize: 1.5,
      maxSize: 3,
      minSpeed: 20,
      maxSpeed: 50,
      minLife: 0.3,
      maxLife: 0.6,
      gravity: false,
    },
    count: 6,
  },
  reviveBurst: {
    cfg: {
      color: CONFIG.COLORS.revive,
      minSize: 1.5,
      maxSize: 3.5,
      minSpeed: 25,
      maxSpeed: 75,
      minLife: 0.35,
      maxLife: 0.75,
      gravity: false,
    },
    count: 8,
  },
};

export const PARTICLES = {
  _pool: [],
  _activeCount: 0,
  // Initial pool size: hardware-aware cap clamped by quality tier.
  // Overridden by setQuality() when settings or auto-throttle change.
  _maxPool: (() => Math.min(CONFIG.PARTICLE_POOL_SIZE, Math.max(100, (typeof navigator !== 'undefined' && navigator.hardwareConcurrency || 4) * 50)))(),
  // Quality-tier multipliers — applied in spawn()/spawnTrail().
  _spawnMultiplier: 1.0,
  _lifetimeMultiplier: 1.0,
  // User-chosen tier (set via settings).  Auto-throttle overrides are tracked
  // separately in _autoTier so the upgrade logic can compare against the user's
  // original preference.
  _userTier: 'Medium',
  // Currently active tier (may differ from _userTier during auto-throttle).
  _activeTier: 'Medium',
  // Auto-throttle state: when set, overrides the user's chosen tier.
  _autoTier: null,
  // Frame-budget tracking for auto-throttle.
  _slowFrames: 0,
  _fastFrames: 0,

  _buckets: [],
  _bucketKeys: [],
  _colorToIndex: {},
  _colorByIndex: [],
  _nextColorIndex: 0,
  _tmpCfg: null,

  _getParticle() {
    if (this._activeCount < this._maxPool) {
      const p = new Particle();
      this._pool[this._activeCount++] = p;
      return p;
    }
    return null;
  },

  // Spawn particles at a world position with a config.
  // config: { count, color, minSize, maxSize, minSpeed, maxSpeed, minLife, maxLife, gravity }
  // Applies quality-tier multipliers to count and lifetime.
  spawn(x, y, config) {
    const count = Math.max(1, Math.round((config.count || 5) * this._spawnMultiplier));
    const color = config.color || '#fff';
    const minSize = config.minSize || 1;
    const maxSize = config.maxSize || 3;
    const minSpeed = config.minSpeed || 30;
    const maxSpeed = config.maxSpeed || 100;
    const minLife = (config.minLife || 0.2) * this._lifetimeMultiplier;
    const maxLife = (config.maxLife || 0.5) * this._lifetimeMultiplier;
    const useGravity = config.gravity !== false;

    for (let i = 0; i < count; i++) {
      const p = this._getParticle();
      if (!p) break;
      // Using Math.random() here intentionally — visual particle effects do not
      // need deterministic sequences, and Math.random() avoids the overhead of
      // seeding / advancing a PRNG for purely cosmetic variation.
      const angle = Math.random() * Math.PI * 2;
      const speed = minSpeed + Math.random() * (maxSpeed - minSpeed);
      p.reset(
        x,
        y,
        Math.cos(angle) * speed,
        Math.sin(angle) * speed,
        minLife + Math.random() * (maxLife - minLife),
        color,
        minSize + Math.random() * (maxSize - minSize),
        useGravity
      );
    }
  },

  // Spawn a trail particle (no gravity, short life).
  spawnTrail(x, y, color) {
    const p = this._getParticle();
    if (!p) return;
    p.reset(x, y, 0, 0, (0.1 + Math.random() * 0.15) * this._lifetimeMultiplier, color, 1 + Math.random() * 1.5, false);
  },

  update(dt) {
    // Single-pass: update alive, compact dead in one loop.
    let w = 0;
    for (let i = 0; i < this._activeCount; i++) {
      const p = this._pool[i];
      if (p.alive) {
        p.update(dt);
        if (p.alive) {
          this._pool[w++] = p;
        }
      }
    }
    this._activeCount = w;
  },

  draw(ctx) {
    const buckets = this._buckets;
    const keys = this._bucketKeys;
    for (let i = 0; i < this._activeCount; i++) {
      const p = this._pool[i];
      const ci = this._getColorIndex(p.color);
      const aq = p.maxLife > 0 ? Math.min(ALPHA_LEVELS, Math.round((p.life / p.maxLife) * ALPHA_LEVELS)) : 0;
      const key = ci * BUCKET_STRIDE + aq;
      if (!buckets[key]) {
        buckets[key] = [];
        keys.push(key);
      }
      buckets[key].push(p);
    }
    for (let k = 0; k < keys.length; k++) {
      const key = keys[k];
      const colorIdx = (key / BUCKET_STRIDE) | 0;
      const alpha = (key % BUCKET_STRIDE) / ALPHA_LEVELS;
      ctx.globalAlpha = alpha;
      ctx.fillStyle = this._colorByIndex[colorIdx];
      const batch = buckets[key];
      for (let j = 0; j < batch.length; j++) {
        const p = batch[j];
        const half = p.size * 0.5;
        ctx.fillRect(p.x - half, p.y - half, p.size, p.size);
      }
      batch.length = 0;
    }
    keys.length = 0;
    ctx.globalAlpha = 1;
  },

  clear() {
    this._activeCount = 0;
    this._buckets = [];
    this._bucketKeys = [];
    this._colorToIndex = {};
    this._colorByIndex = [];
    this._nextColorIndex = 0;
  },

  _getColorIndex(color) {
    let ci = this._colorToIndex[color];
    if (ci === undefined) {
      ci = this._nextColorIndex++;
      this._colorToIndex[color] = ci;
      this._colorByIndex[ci] = color;
    }
    return ci;
  },

  /**
   * Set particle quality tier from user settings.
   * Stores the user's choice in _userTier and applies it immediately.
   * Auto-throttle calls _applyTier() directly without touching _userTier.
   *
   * @param {string} tier — 'Low', 'Medium', 'High', or 'Ultra'
   */
  setQuality(tier) {
    this._userTier = tier;
    this._applyTier(tier);
  },

  /** Internal: apply a tier's pool/multiplier values without changing _userTier.
   *  Used by both setQuality() and auto-throttle. */
  _applyTier(tier) {
    const tiers = {
      Low: { pool: 100, spawn: 0.3, lifetime: 0.5 },
      Medium: { pool: 300, spawn: 0.6, lifetime: 0.75 },
      High: { pool: 1000, spawn: 1.0, lifetime: 1.0 },
      Ultra: { pool: 2000, spawn: 1.5, lifetime: 1.5 },
    };
    const t = tiers[tier];
    if (!t) return;
    this._activeTier = tier;
    this._maxPool = t.pool;
    this._spawnMultiplier = t.spawn;
    this._lifetimeMultiplier = t.lifetime;
    // Trim pool if shrinking — cap _activeCount to avoid stale entries.
    if (this._pool.length > this._maxPool) {
      this._activeCount = Math.min(this._activeCount, this._maxPool);
      this._pool.length = this._maxPool;
    }
  },

  /**
   * Check frame budget for auto-throttle.
   * Called every frame from game._runSimTick().
   * 3 consecutive frames >33ms  → downgrade one tier
   * 60 consecutive frames <16ms → upgrade one tier
   *
   * Auto-throttle uses _applyTier() directly without modifying _userTier,
   * so the upgrade logic can always compare _autoTier against the original
   * user-chosen tier.
   */
  _checkFrameBudget(frameTimeMs) {
    const TIERS = ['Low', 'Medium', 'High', 'Ultra'];

    if (frameTimeMs > 33) {
      this._slowFrames++;
      this._fastFrames = 0;
      if (this._slowFrames >= 3) {
        this._slowFrames = 0;
        const effective = this._autoTier || this._activeTier;
        const idx = TIERS.indexOf(effective);
        if (idx > 0) {
          const downgrade = TIERS[idx - 1];
          this._autoTier = downgrade;
          this._applyTier(downgrade);
        }
      }
    } else if (frameTimeMs < 16) {
      this._fastFrames++;
      this._slowFrames = 0;
      if (this._fastFrames >= 60) {
        this._fastFrames = 0;
        if (this._autoTier) {
          const autoIdx = TIERS.indexOf(this._autoTier);
          const userIdx = TIERS.indexOf(this._userTier);
          if (autoIdx < userIdx) {
            // Room to upgrade: move one tier up toward user's choice
            const upgrade = TIERS[autoIdx + 1];
            this._autoTier = upgrade;
            this._applyTier(upgrade);
          } else {
            // Reached user's chosen tier; stop auto-throttling
            this._autoTier = null;
            this._applyTier(this._userTier);
          }
        }
      }
    } else {
      // Between 16 and 33 ms — normal. Reset counters.
      this._slowFrames = 0;
      this._fastFrames = 0;
    }
  },

  // Reuse a single config object (_tmpCfg) to avoid per-call allocation.
  _applyCfg(src, color) {
    if (!this._tmpCfg) this._tmpCfg = {};
    const c = this._tmpCfg;
    c.count = src.count;
    c.color = color;
    c.minSize = src.minSize;
    c.maxSize = src.maxSize;
    c.minSpeed = src.minSpeed;
    c.maxSpeed = src.maxSpeed;
    c.minLife = src.minLife;
    c.maxLife = src.maxLife;
    c.gravity = src.gravity;
    return c;
  },

  _spawnEffect(name, x, y, overrides) {
    const def = EFFECT_DEFS[name];
    const color = (overrides && overrides.color) || def.cfg.color;
    const cfg = this._applyCfg(def.cfg, color);
    cfg.count = def.count;
    this.spawn(x, y, cfg);
  },

  hitSpark(x, y, color) {
    this._spawnEffect('hitSpark', x, y, color ? { color } : undefined);
  },

  deathBurst(x, y, color) {
    this._spawnEffect('deathBurst', x, y, color ? { color } : undefined);
  },

  troopDeath(x, y, color) {
    this._spawnEffect('troopDeath', x, y, color ? { color } : undefined);
  },

  splashImpact(x, y, color) {
    this._spawnEffect('splashImpact', x, y, color ? { color } : undefined);
  },

  chainSpark(x, y) {
    this._spawnEffect('chainSpark', x, y);
  },

  troopShieldActivate(x, y, color) {
    this._spawnEffect('troopShieldActivate', x, y, color ? { color } : undefined);
  },

  slowApply(x, y, color) {
    this._spawnEffect('slowApply', x, y, color ? { color } : undefined);
  },

  burnApply(x, y, color) {
    this._spawnEffect('burnApply', x, y, color ? { color } : undefined);
  },

  burnTick(x, y, color) {
    this._spawnEffect('burnTick', x, y, color ? { color } : undefined);
  },

  healBurst(x, y) {
    this._spawnEffect('healBurst', x, y);
  },

  reviveBurst(x, y, color) {
    this._spawnEffect('reviveBurst', x, y, color ? { color } : undefined);
  },
};
