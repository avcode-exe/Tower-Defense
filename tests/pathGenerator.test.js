import { describe, it, expect } from 'vitest';
import { generatePath } from '../src/pathGenerator.js';
import { CONFIG } from '../src/config.js';

describe('generatePath', () => {
  it('returns an array of [x, y] pairs', () => {
    const path = generatePath(42);
    expect(Array.isArray(path)).toBe(true);
    expect(path.length).toBeGreaterThan(0);
    for (const [x, y] of path) {
      expect(typeof x).toBe('number');
      expect(typeof y).toBe('number');
    }
  });

  it('starts at x=0 (left edge)', () => {
    const path = generatePath(42);
    expect(path[0][0]).toBe(0);
  });

  it('ends at x=GRID_SIZE-1 (right edge)', () => {
    const path = generatePath(42);
    expect(path[path.length - 1][0]).toBe(CONFIG.GRID_SIZE - 1);
  });

  it('path length >= MIN_PATH_LENGTH', () => {
    const path = generatePath(42);
    expect(path.length).toBeGreaterThanOrEqual(CONFIG.MIN_PATH_LENGTH);
  });

  it('is deterministic with same seed', () => {
    const p1 = generatePath(999);
    const p2 = generatePath(999);
    expect(p1).toEqual(p2);
  });

  it('produces different paths with different seeds', () => {
    const p1 = generatePath(1);
    const p2 = generatePath(2);
    expect(p1.length).not.toBe(p2.length);
  });

  it('each step moves at most 1 tile (Manhattan distance)', () => {
    const path = generatePath(42);
    for (let i = 1; i < path.length; i++) {
      const dx = Math.abs(path[i][0] - path[i - 1][0]);
      const dy = Math.abs(path[i][1] - path[i - 1][1]);
      expect(dx + dy).toBe(1);
    }
  });

  it('produces loop-free paths for many seeds', () => {
    for (let seed = 0; seed < 500; seed++) {
      const path = generatePath(seed);
      const seen = new Set();
      for (const [x, y] of path) {
        const key = x * CONFIG.GRID_SIZE + y;
        expect(seen.has(key)).toBe(false);
        seen.add(key);
      }
    }
  });

  it('keeps all coordinates in bounds and separates coordinate coverage from loop coverage', () => {
    const N = CONFIG.GRID_SIZE;
    const path = generatePath(42);
    for (const [x, y] of path) {
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(N);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(y).toBeLessThan(N);
    }
  });
});
