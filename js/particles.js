// Lightweight particle system for visual effects. All rendering is procedural
// (no external assets). Particles are spawned at event points and drawn in
// world space during the render pass.

class Particle {
  constructor() {
    this.x = 0; this.y = 0;
    this.vx = 0; this.vy = 0;
    this.life = 0; this.maxLife = 1;
    this.color = '#fff'; this.size = 2;
    this.gravity = false;
    this.alive = false;
  }

  reset(x, y, vx, vy, life, color, size, gravity) {
    this.x = x; this.y = y;
    this.vx = vx; this.vy = vy;
    this.life = life; this.maxLife = life;
    this.color = color; this.size = size;
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

const PARTICLES = {
  _pool: [],
  _activeCount: 0,
  _maxPool: 300,
  _buckets: [],
  _bucketKeys: [],
  _colorToIndex: {},
  _colorByIndex: [],
  _nextColorIndex: 0,

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
  spawn(x, y, config) {
    const count = config.count || 5;
    const color = config.color || '#fff';
    const minSize = config.minSize || 1;
    const maxSize = config.maxSize || 3;
    const minSpeed = config.minSpeed || 30;
    const maxSpeed = config.maxSpeed || 100;
    const minLife = config.minLife || 0.2;
    const maxLife = config.maxLife || 0.5;
    const useGravity = config.gravity !== false;

    for (let i = 0; i < count; i++) {
      const p = this._getParticle();
      if (!p) break;
      // Using Math.random() here intentionally — visual particle effects do not
      // need deterministic sequences, and Math.random() avoids the overhead of
      // seeding / advancing a PRNG for purely cosmetic variation.
      const angle = Math.random() * Math.PI * 2;
      const speed = minSpeed + Math.random() * (maxSpeed - minSpeed);
      p.reset(x, y, Math.cos(angle) * speed, Math.sin(angle) * speed,
        minLife + Math.random() * (maxLife - minLife),
        color, minSize + Math.random() * (maxSize - minSize), useGravity);
    }
  },

  // Spawn a trail particle (no gravity, short life).
  spawnTrail(x, y, color) {
    const p = this._getParticle();
    if (!p) return;
    p.reset(x, y, 0, 0, 0.1 + Math.random() * 0.15,
      color, 1 + Math.random() * 1.5, false);
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
      const alphaKey = p.maxLife > 0 ? Math.round((p.life / p.maxLife) * 10) / 10 : 0;
      const ci = this._getColorIndex(p.color);
      const aq = alphaKey > 0 ? Math.min(10, Math.round(alphaKey * 10)) : 0;
      const key = ci * 11 + aq;
      if (!buckets[key]) {
        buckets[key] = [];
        keys.push(key);
      }
      buckets[key].push(p);
    }
    for (let k = 0; k < keys.length; k++) {
      const key = keys[k];
      const colorIdx = Math.floor(key / 11);
      const alpha = (key % 11) / 10;
      ctx.globalAlpha = alpha;
      ctx.fillStyle = this._colorByIndex[colorIdx];
      const batch = buckets[key];
      for (let j = 0; j < batch.length; j++) {
        const p = batch[j];
        const half = p.size * 0.5;
        ctx.fillRect(p.x - half, p.y - half, p.size, p.size);
      }
      batch.length = 0;
      buckets[key] = undefined;
    }
    keys.length = 0;
    ctx.globalAlpha = 1;
  },

  clear() {
    this._activeCount = 0;
    this._nextColorIndex = 0;
    this._colorToIndex = {};
    this._colorByIndex = [];
  },

  _getColorIndex(color) {
    if (this._colorToIndex[color] === undefined) {
      const idx = this._nextColorIndex++;
      this._colorToIndex[color] = idx;
      this._colorByIndex[idx] = color;
    }
    return this._colorToIndex[color];
  },

  // Predefined effect configs (returned by copy so mutations don't cross-contaminate).
  _hitSparkCfg: { count: 4, color: '#fff', minSize: 1, maxSize: 2.5, minSpeed: 40, maxSpeed: 90, minLife: 0.15, maxLife: 0.3, gravity: false },
  hitSpark(color) {
    return { ...this._hitSparkCfg, color: color || '#fff' };
  },

  _deathBurstCfg: { count: 10, color: '#fff', minSize: 1.5, maxSize: 3.5, minSpeed: 50, maxSpeed: 130, minLife: 0.25, maxLife: 0.55, gravity: false },
  deathBurst(color) {
    return { ...this._deathBurstCfg, color: color || '#fff' };
  },

  _troopDeathCfg: { count: 15, color: '#fff', minSize: 2, maxSize: 5, minSpeed: 50, maxSpeed: 100, minLife: 0.3, maxLife: 0.7, gravity: false },
  troopDeath(color) {
    return { ...this._troopDeathCfg, color: color || '#fff' };
  },

  _splashImpactCfg: { count: 12, color: '#9b59b6', minSize: 1.5, maxSize: 3, minSpeed: 60, maxSpeed: 140, minLife: 0.2, maxLife: 0.45, gravity: false },
  splashImpact(color) {
    return { ...this._splashImpactCfg, color: color || '#9b59b6' };
  },

  _chainSparkCfg: { count: 3, color: '#f1c40f', minSize: 1, maxSize: 2, minSpeed: 30, maxSpeed: 70, minLife: 0.1, maxLife: 0.2, gravity: false },
  chainSpark() {
    return { ...this._chainSparkCfg };
  },

  _shieldActivateCfg: { count: 12, color: '#5dade2', minSize: 1.5, maxSize: 3.5, minSpeed: 40, maxSpeed: 100, minLife: 0.3, maxLife: 0.6, gravity: false },
  troopShieldActivate(color) {
    return { ...this._shieldActivateCfg, color: color || '#5dade2' };
  },

  _slowApplyCfg: { count: 8, color: '#7fdbff', minSize: 2, maxSize: 4, minSpeed: 20, maxSpeed: 60, minLife: 0.4, maxLife: 0.8, gravity: false },
  slowApply(color) {
    return { ...this._slowApplyCfg, color: color || '#7fdbff' };
  },
};
