import { describe, it, expect } from 'vitest';
import { makeRNG, shuffleInPlace, clamp, lerp, dist, tileCenterInto, pixelToTile, inBounds } from '../src/utils.js';

describe('clamp', () => {
  it('clamps below minimum', () => expect(clamp(-5, 0, 10)).toBe(0));
  it('clamps above maximum', () => expect(clamp(15, 0, 10)).toBe(10));
  it('returns value in range', () => expect(clamp(5, 0, 10)).toBe(5));
  it('handles exact boundaries', () => {
    expect(clamp(0, 0, 10)).toBe(0);
    expect(clamp(10, 0, 10)).toBe(10);
  });
});

describe('lerp', () => {
  it('returns a at t=0', () => expect(lerp(0, 100, 0)).toBe(0));
  it('returns b at t=1', () => expect(lerp(0, 100, 1)).toBe(100));
  it('returns midpoint at t=0.5', () => expect(lerp(0, 100, 0.5)).toBe(50));
  it('works with negative values', () => expect(lerp(-10, 10, 0.5)).toBe(0));
});

describe('dist', () => {
  it('returns 0 for same point', () => expect(dist(5, 5, 5, 5)).toBe(0));
  it('computes horizontal distance', () => expect(dist(0, 0, 3, 0)).toBe(3));
  it('computes vertical distance', () => expect(dist(0, 0, 0, 4)).toBe(4));
  it('computes diagonal distance', () => expect(dist(0, 0, 3, 4)).toBe(5));
});

describe('pixelToTile', () => {
  it('converts origin', () => {
    const out = {};
    pixelToTile(0, 0, out);
    expect(out.gx).toBe(0);
    expect(out.gy).toBe(0);
  });
  it('converts within first tile', () => {
    const out = {};
    pixelToTile(26, 26, out);
    expect(out.gx).toBe(0);
    expect(out.gy).toBe(0);
  });
  it('converts to second tile', () => {
    const out = {};
    pixelToTile(53, 53, out);
    expect(out.gx).toBe(1);
    expect(out.gy).toBe(1);
  });
});

describe('tileCenterInto', () => {
  it('returns center of tile (0,0)', () => {
    const out = {};
    tileCenterInto(0, 0, out);
    expect(out.x).toBe(26.5);
    expect(out.y).toBe(26.5);
  });
  it('returns center of tile (1,1)', () => {
    const out = {};
    tileCenterInto(1, 1, out);
    expect(out.x).toBe(79.5);
    expect(out.y).toBe(79.5);
  });
});

describe('inBounds', () => {
  it('returns true for valid coordinates', () => {
    expect(inBounds(0, 0)).toBe(true);
    expect(inBounds(15, 15)).toBe(true);
    expect(inBounds(8, 8)).toBe(true);
  });
  it('returns false for out-of-bounds', () => {
    expect(inBounds(-1, 0)).toBe(false);
    expect(inBounds(0, -1)).toBe(false);
    expect(inBounds(16, 0)).toBe(false);
    expect(inBounds(0, 16)).toBe(false);
  });
});

describe('makeRNG', () => {
  it('returns a function', () => {
    const rng = makeRNG(42);
    expect(typeof rng).toBe('function');
  });
  it('produces values in [0, 1)', () => {
    const rng = makeRNG(42);
    for (let i = 0; i < 100; i++) {
      const v = rng();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
  it('is deterministic with same seed', () => {
    const rng1 = makeRNG(12345);
    const rng2 = makeRNG(12345);
    for (let i = 0; i < 50; i++) {
      expect(rng1()).toBe(rng2());
    }
  });
  it('produces different sequences with different seeds', () => {
    const rng1 = makeRNG(1);
    const rng2 = makeRNG(2);
    const vals1 = Array.from({ length: 10 }, () => rng1());
    const vals2 = Array.from({ length: 10 }, () => rng2());
    expect(vals1).not.toEqual(vals2);
  });
});

describe('shuffleInPlace', () => {
  it('returns the same array reference', () => {
    const arr = [1, 2, 3, 4, 5];
    const rng = makeRNG(42);
    expect(shuffleInPlace(arr, rng)).toBe(arr);
  });
  it('preserves all elements', () => {
    const arr = [1, 2, 3, 4, 5, 6, 7, 8];
    const rng = makeRNG(42);
    shuffleInPlace(arr, rng);
    expect(arr.sort()).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });
  it('handles empty array', () => {
    const arr = [];
    const rng = makeRNG(42);
    shuffleInPlace(arr, rng);
    expect(arr).toEqual([]);
  });
  it('handles single element', () => {
    const arr = [42];
    const rng = makeRNG(42);
    shuffleInPlace(arr, rng);
    expect(arr).toEqual([42]);
  });
});
