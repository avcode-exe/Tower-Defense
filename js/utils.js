// Math, RNG, geometry helpers.

// Mulberry32 - small, fast, deterministic PRNG. Re-seeding gives reproducible
// games which is useful for testing and for a future "seeded map" feature.
function makeRNG(seed) {
  let s = (seed >>> 0) || ((Math.random() * 0xffffffff) >>> 0);
  return function rng() {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffleInPlace(arr, rng) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function dist(ax, ay, bx, by) {
  const dx = ax - bx, dy = ay - by;
  return Math.sqrt(dx * dx + dy * dy);
}

function dist2(ax, ay, bx, by) {
  const dx = ax - bx, dy = ay - by;
  return dx * dx + dy * dy;
}

// Tile coordinates -> pixel center.
function tileCenter(gx, gy) {
  return {
    x: gx * CONFIG.TILE_SIZE + CONFIG.TILE_SIZE / 2,
    y: gy * CONFIG.TILE_SIZE + CONFIG.TILE_SIZE / 2,
  };
}

// Pixel -> tile coordinates.
function pixelToTile(px, py) {
  return {
    gx: Math.floor(px / CONFIG.TILE_SIZE),
    gy: Math.floor(py / CONFIG.TILE_SIZE),
  };
}

function inBounds(gx, gy) {
  return gx >= 0 && gx < CONFIG.GRID_SIZE && gy >= 0 && gy < CONFIG.GRID_SIZE;
}
