import { describe, it, expect, vi } from 'vitest';
import { clamp, lerp, dist, pixelToTile, tileCenterInto, inBounds, makeRNG, shuffleInPlace } from '../src/utils.js';
import { CONFIG } from '../src/config.js';

describe('clamp', () => {
  it('returns lo when below min', () => {
    expect(clamp(-5, 0, 10)).toBe(0);
  });
  it('returns hi when above max', () => {
    expect(clamp(15, 0, 10)).toBe(10);
  });
  it('returns value when in range', () => {
    expect(clamp(5, 0, 10)).toBe(5);
  });
  it('exact boundaries', () => {
    expect(clamp(0, 0, 10)).toBe(0);
    expect(clamp(10, 0, 10)).toBe(10);
  });
  it('negative ranges', () => {
    expect(clamp(-3, -5, -1)).toBe(-3);
  });
  it('lo === hi', () => {
    expect(clamp(5, 3, 3)).toBe(3);
    expect(clamp(1, 3, 3)).toBe(3);
  });
  it('handles NaN', () => {
    const r = clamp(NaN, 0, 10);
    expect(Number.isNaN(r)).toBe(true);
  });
  it('handles null/undefined', () => {
    // null < 0 is false (null converts to 0), null > 10 is false, so null is returned
    expect(clamp(null, 0, 10)).toBeNull();
    // undefined comparisons return false, so v (undefined) is returned
    expect(clamp(undefined, 0, 10)).toBeUndefined();
  });
});

describe('lerp', () => {
  it('t=0 returns a', () => {
    expect(lerp(10, 20, 0)).toBe(10);
  });
  it('t=1 returns b', () => {
    expect(lerp(10, 20, 1)).toBe(20);
  });
  it('t=0.5 returns average', () => {
    expect(lerp(10, 20, 0.5)).toBe(15);
  });
  it('negative values', () => {
    expect(lerp(-10, -20, 0.5)).toBe(-15);
  });
  it('a === b', () => {
    expect(lerp(5, 5, 0.5)).toBe(5);
  });
  it('t > 1 extrapolates', () => {
    expect(lerp(10, 20, 2)).toBe(30);
  });
  it('t < 0 extrapolates', () => {
    expect(lerp(10, 20, -1)).toBe(0);
  });
});

describe('dist', () => {
  it('same point', () => {
    expect(dist(0, 0, 0, 0)).toBe(0);
  });
  it('horizontal', () => {
    expect(dist(0, 0, 3, 0)).toBe(3);
  });
  it('vertical', () => {
    expect(dist(0, 0, 0, 4)).toBe(4);
  });
  it('diagonal (3-4-5 triangle)', () => {
    expect(dist(0, 0, 3, 4)).toBe(5);
  });
  it('large values', () => {
    expect(dist(1000, 2000, 3000, 4000)).toBeCloseTo(2828.427, 1);
  });
  it('negative coordinates', () => {
    expect(dist(-1, -1, 2, 3)).toBe(5);
  });
});

describe('pixelToTile', () => {
  it('origin', () => {
    const out = {};
    pixelToTile(0, 0, out);
    expect(out.gx).toBe(0);
    expect(out.gy).toBe(0);
  });
  it('within first tile', () => {
    const t = CONFIG.TILE_SIZE;
    const out = {};
    pixelToTile(t / 2, t / 2, out);
    expect(out.gx).toBe(0);
    expect(out.gy).toBe(0);
  });
  it('second tile', () => {
    const t = CONFIG.TILE_SIZE;
    const out = {};
    pixelToTile(t + 1, t + 1, out);
    expect(out.gx).toBe(1);
    expect(out.gy).toBe(1);
  });
  it('boundary at exactly TILE_SIZE', () => {
    const t = CONFIG.TILE_SIZE;
    const out = {};
    pixelToTile(t, t, out);
    expect(out.gx).toBe(1);
    expect(out.gy).toBe(1);
  });
  it('negative pixels', () => {
    const out = {};
    pixelToTile(-1, -1, out);
    expect(out.gx).toBe(-1);
    expect(out.gy).toBe(-1);
  });
  it('writes into provided output object', () => {
    const out = { gx: -1, gy: -1 };
    pixelToTile(53, 53, out);
    expect(out.gx).toBe(1);
    expect(out.gy).toBe(1);
  });
});

describe('tileCenterInto', () => {
  it('tile (0,0)', () => {
    const t = CONFIG.TILE_SIZE;
    const out = {};
    tileCenterInto(0, 0, out);
    expect(out.x).toBe(t / 2);
    expect(out.y).toBe(t / 2);
  });
  it('tile (1,1)', () => {
    const t = CONFIG.TILE_SIZE;
    const out = {};
    tileCenterInto(1, 1, out);
    expect(out.x).toBe(t + t / 2);
    expect(out.y).toBe(t + t / 2);
  });
  it('tile (15,15)', () => {
    const t = CONFIG.TILE_SIZE;
    const out = {};
    tileCenterInto(15, 15, out);
    expect(out.x).toBe(15 * t + t / 2);
    expect(out.y).toBe(15 * t + t / 2);
  });
  it('mutates provided output object', () => {
    const out = { x: 0, y: 0 };
    tileCenterInto(5, 5, out);
    expect(out.x).toBeGreaterThan(0);
    expect(out.y).toBeGreaterThan(0);
  });
});

describe('inBounds', () => {
  const gs = CONFIG.GRID_SIZE;
  it('(0,0) is valid', () => {
    expect(inBounds(0, 0)).toBe(true);
  });
  it(`(${gs - 1}, ${gs - 1}) is valid`, () => {
    expect(inBounds(gs - 1, gs - 1)).toBe(true);
  });
  it(`(${gs}, 0) is invalid`, () => {
    expect(inBounds(gs, 0)).toBe(false);
  });
  it('(-1, 0) is invalid', () => {
    expect(inBounds(-1, 0)).toBe(false);
  });
  it('(0, -1) is invalid', () => {
    expect(inBounds(0, -1)).toBe(false);
  });
  it(`(0, ${gs}) is invalid`, () => {
    expect(inBounds(0, gs)).toBe(false);
  });
  it('(0, 0) is the min corner', () => {
    expect(inBounds(0, 0)).toBe(true);
  });
});

describe('makeRNG', () => {
  it('returns a function', () => {
    const rng = makeRNG(42);
    expect(typeof rng).toBe('function');
  });

  it('returns values in [0, 1)', () => {
    const rng = makeRNG(42);
    for (let i = 0; i < 100; i++) {
      const v = rng();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('deterministic with same seed', () => {
    const a = makeRNG(42);
    const b = makeRNG(42);
    for (let i = 0; i < 10; i++) {
      expect(a()).toBe(b());
    }
  });

  it('different sequences with different seeds', () => {
    const a = makeRNG(42);
    const b = makeRNG(99);
    let same = true;
    for (let i = 0; i < 10; i++) {
      if (a() !== b()) same = false;
    }
    expect(same).toBe(false);
  });

  it('null seed generates different values', () => {
    // null seed uses Math.random which is mocked in tests
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const rng = makeRNG(null);
    expect(rng()).toBeGreaterThanOrEqual(0);
    vi.restoreAllMocks();
  });

  it('seed 0 works', () => {
    const rng = makeRNG(0);
    expect(typeof rng).toBe('function');
    expect(rng()).toBeGreaterThanOrEqual(0);
    expect(rng()).toBeLessThan(1);
  });

  it('non-trivial sequence', () => {
    const rng = makeRNG(12345);
    const vals = [];
    for (let i = 0; i < 5; i++) vals.push(rng());
    expect(vals[0]).not.toBe(vals[1]);
    expect(vals[2]).not.toBe(vals[3]);
  });
});

describe('shuffleInPlace', () => {
  it('returns same reference', () => {
    const arr = [1, 2, 3];
    const rng = makeRNG(42);
    expect(shuffleInPlace(arr, rng)).toBe(arr);
  });

  it('preserves elements', () => {
    const arr = [1, 2, 3, 4, 5];
    const orig = [...arr];
    shuffleInPlace(arr, makeRNG(42));
    expect(arr.sort((a, b) => a - b)).toEqual(orig);
  });

  it('empty array', () => {
    const arr = [];
    shuffleInPlace(arr, makeRNG(42));
    expect(arr).toEqual([]);
  });

  it('single element', () => {
    const arr = [42];
    shuffleInPlace(arr, makeRNG(42));
    expect(arr).toEqual([42]);
  });

  it('two elements', () => {
    const arr = [1, 2];
    shuffleInPlace(arr, makeRNG(42));
    expect(arr.length).toBe(2);
    expect(arr).toContain(1);
    expect(arr).toContain(2);
  });

  it('large array (100)', () => {
    const arr = Array.from({ length: 100 }, (_, i) => i);
    const orig = [...arr];
    shuffleInPlace(arr, makeRNG(42));
    expect(arr.length).toBe(100);
    expect(arr.sort((a, b) => a - b)).toEqual(orig);
  });

  it('deterministic with same RNG', () => {
    const a = [1, 2, 3, 4, 5];
    const b = [1, 2, 3, 4, 5];
    const rngA = makeRNG(42);
    const rngB = makeRNG(42);
    shuffleInPlace(a, rngA);
    shuffleInPlace(b, rngB);
    expect(a).toEqual(b);
  });
});
