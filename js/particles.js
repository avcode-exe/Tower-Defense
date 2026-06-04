// Lightweight particle system for visual effects. All rendering is procedural
// (no external assets). Particles are spawned at event points and drawn in
// world space during the render pass.

class Particle {
  constructor(x, y, vx, vy, life, color, size, gravity) {
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
    if (this.gravity) this.vy += 60 * dt;
    this.life -= dt;
    if (this.life <= 0) this.alive = false;
  }
}

const PARTICLES = {
  _pool: [],
  _maxPool: 300,

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
      if (this._pool.length >= this._maxPool) break;
      const angle = Math.random() * Math.PI * 2;
      const speed = minSpeed + Math.random() * (maxSpeed - minSpeed);
      const vx = Math.cos(angle) * speed;
      const vy = Math.sin(angle) * speed;
      const size = minSize + Math.random() * (maxSize - minSize);
      const life = minLife + Math.random() * (maxLife - minLife);
      this._pool.push(new Particle(x, y, vx, vy, life, color, size, useGravity));
    }
  },

  // Spawn a trail particle (no gravity, short life).
  spawnTrail(x, y, color) {
    if (this._pool.length >= this._maxPool) return;
    const size = 1 + Math.random() * 1.5;
    const life = 0.1 + Math.random() * 0.15;
    this._pool.push(new Particle(x, y, 0, 0, life, color, size, false));
  },

  update(dt) {
    for (let i = 0; i < this._pool.length; i++) {
      const p = this._pool[i];
      if (p.alive) p.update(dt);
    }
    // In-place compaction.
    let w = 0;
    for (let i = 0; i < this._pool.length; i++) {
      if (this._pool[i].alive) this._pool[w++] = this._pool[i];
    }
    this._pool.length = w;
  },

  draw(ctx) {
    for (const p of this._pool) {
      if (!p.alive) continue;
      const alpha = clamp(p.life / p.maxLife, 0, 1);
      ctx.globalAlpha = alpha;
      ctx.fillStyle = p.color;
      const half = p.size / 2;
      ctx.fillRect(p.x - half, p.y - half, p.size, p.size);
    }
    ctx.globalAlpha = 1;
  },

  clear() {
    this._pool.length = 0;
  },

  // Predefined effect configs.
  hitSpark(color) {
    return { count: 4, color: color || '#fff', minSize: 1, maxSize: 2.5, minSpeed: 40, maxSpeed: 90, minLife: 0.15, maxLife: 0.3, gravity: false };
  },

  deathBurst(color) {
    return { count: 10, color: color || '#fff', minSize: 1.5, maxSize: 3.5, minSpeed: 50, maxSpeed: 130, minLife: 0.25, maxLife: 0.55, gravity: false };
  },

  splashImpact(color) {
    return { count: 12, color: color || '#9b59b6', minSize: 1.5, maxSize: 3, minSpeed: 60, maxSpeed: 140, minLife: 0.2, maxLife: 0.45, gravity: false };
  },

  chainSpark() {
    return { count: 3, color: '#f1c40f', minSize: 1, maxSize: 2, minSpeed: 30, maxSpeed: 70, minLife: 0.1, maxLife: 0.2, gravity: false };
  },
};
