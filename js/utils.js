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

// Tile coordinates -> pixel center. Allocates an object; prefer tileCenterInto.
function tileCenter(gx, gy) {
  return {
    x: gx * CONFIG.TILE_SIZE + CONFIG.TILE_SIZE / 2,
    y: gy * CONFIG.TILE_SIZE + CONFIG.TILE_SIZE / 2,
  };
}

// Write tile center into a reusable output object (zero allocation).
function tileCenterInto(gx, gy, out) {
  out.x = gx * CONFIG.TILE_SIZE + CONFIG.TILE_SIZE / 2;
  out.y = gy * CONFIG.TILE_SIZE + CONFIG.TILE_SIZE / 2;
}

// Pixel -> tile coordinates. Allocates an object; prefer pixelToTileInto.
function pixelToTile(px, py) {
  return {
    gx: (px / CONFIG.TILE_SIZE) | 0,
    gy: (py / CONFIG.TILE_SIZE) | 0,
  };
}

// Write pixel-to-tile into a reusable output object (zero allocation).
function pixelToTileInto(px, py, out) {
  out.gx = (px / CONFIG.TILE_SIZE) | 0;
  out.gy = (py / CONFIG.TILE_SIZE) | 0;
}

function inBounds(gx, gy) {
  return gx >= 0 && gx < CONFIG.GRID_SIZE && gy >= 0 && gy < CONFIG.GRID_SIZE;
}
