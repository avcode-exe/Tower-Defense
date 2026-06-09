import { CONFIG } from './config.js';

// Math, RNG, geometry helpers.

// Mulberry32 - small, fast, deterministic PRNG. Re-seeding gives reproducible
// games which is useful for testing and for a future "seeded map" feature.
export function makeRNG(seed) {
  let s = (seed == null ? Math.floor(Math.random() * 0xffffffff) : seed) >>> 0;
  return function rng() {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffleInPlace(arr, rng) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

export function dist(ax, ay, bx, by) {
  const dx = ax - bx,
    dy = ay - by;
  return Math.sqrt(dx * dx + dy * dy);
}

// Write tile center into a reusable output object (zero allocation).
export function tileCenterInto(gx, gy, out = {}) {
  out.x = gx * CONFIG.TILE_SIZE + CONFIG.TILE_SIZE / 2;
  out.y = gy * CONFIG.TILE_SIZE + CONFIG.TILE_SIZE / 2;
}

// Write pixel-to-tile into a reusable output object (zero allocation).
export function pixelToTile(px, py, out = {}) {
  out.gx = Math.floor(px / CONFIG.TILE_SIZE);
  out.gy = Math.floor(py / CONFIG.TILE_SIZE);
}

export function inBounds(gx, gy) {
  return gx >= 0 && gx < CONFIG.GRID_SIZE && gy >= 0 && gy < CONFIG.GRID_SIZE;
}
