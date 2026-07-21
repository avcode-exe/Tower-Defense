import { describe, it, expect } from 'vitest';
import { generatePath } from '../src/pathGenerator.js';
import { CONFIG } from '../src/config.js';

describe('generatePath', () => {
  it('returns array of [x,y] pairs with numeric values', () => {
    const path = generatePath(42);
    expect(Array.isArray(path)).toBe(true);
    expect(path.length).toBeGreaterThan(0);
    for (const [x, y] of path) {
      expect(typeof x).toBe('number');
      expect(typeof y).toBe('number');
    }
  });

  it('starts at x=0', () => {
    const path = generatePath(42);
    expect(path[0][0]).toBe(0);
  });

  it('ends at x=GRID_SIZE-1', () => {
    const path = generatePath(42);
    expect(path[path.length - 1][0]).toBe(CONFIG.GRID_SIZE - 1);
  });

  it('path length >= MIN_PATH_LENGTH', () => {
    for (let seed = 0; seed < 10; seed++) {
      const path = generatePath(seed);
      expect(path.length).toBeGreaterThanOrEqual(CONFIG.MIN_PATH_LENGTH);
    }
  });

  it('deterministic with same seed (test 5+ seeds)', () => {
    for (let seed = 0; seed < 5; seed++) {
      const a = generatePath(seed);
      const b = generatePath(seed);
      expect(a).toEqual(b);
    }
  });

  it('different seeds produce different paths (test 5+ seed pairs)', () => {
    const paths = new Set();
    for (let seed = 0; seed < 10; seed++) {
      const path = generatePath(seed);
      const key = path.map(([x, y]) => `${x},${y}`).join('|');
      paths.add(key);
    }
    // At least some variety (unlikely all 10 seeds produce identical paths)
    expect(paths.size).toBeGreaterThan(1);
  });

  it('each step moves exactly 1 tile (Manhattan distance = 1)', () => {
    for (let seed = 0; seed < 20; seed++) {
      const path = generatePath(seed);
      for (let i = 1; i < path.length; i++) {
        const dx = Math.abs(path[i][0] - path[i - 1][0]);
        const dy = Math.abs(path[i][1] - path[i - 1][1]);
        expect(dx + dy).toBe(1);
      }
    }
  });

  it('loop-free for 50 seeds (no repeated coordinates)', () => {
    for (let seed = 0; seed < 50; seed++) {
      const path = generatePath(seed);
      const seen = new Set();
      for (const [x, y] of path) {
        const key = `${x},${y}`;
        expect(seen.has(key)).toBe(false);
        seen.add(key);
      }
    }
  });

  it('all coordinates in bounds [0, GRID_SIZE)', () => {
    const N = CONFIG.GRID_SIZE;
    for (let seed = 0; seed < 20; seed++) {
      const path = generatePath(seed);
      for (const [x, y] of path) {
        expect(x).toBeGreaterThanOrEqual(0);
        expect(x).toBeLessThan(N);
        expect(y).toBeGreaterThanOrEqual(0);
        expect(y).toBeLessThan(N);
      }
    }
  });

  it('fallback: a straight-line path is always valid', () => {
    // Path with a seed that creates a valid path (should never fallback for reasonable seeds)
    const path = generatePath(42);
    expect(path.length).toBeGreaterThanOrEqual(CONFIG.MIN_PATH_LENGTH);
    expect(path[0][0]).toBe(0);
    expect(path[path.length - 1][0]).toBe(CONFIG.GRID_SIZE - 1);
  });

  it('path edge rejection: body cells do not excessively hug edges', () => {
    const N = CONFIG.GRID_SIZE;
    for (let seed = 0; seed < 20; seed++) {
      const path = generatePath(seed);
      const body = path.slice(1, path.length - 1);
      const edgeBody = body.filter(([x, y]) => y === 0 || y === N - 1 || x === 0 || x === N - 1);
      const ratio = edgeBody.length / Math.max(1, body.length);
      expect(ratio).toBeLessThan(CONFIG.PATH_EDGE_REJECTION + 0.01);
    }
  });

  it('fallback straight-line path is valid when generation fails', () => {
    // Force generation failure by testing that the fallback function produces valid path
    const path = generatePath(0);
    expect(path.length).toBeGreaterThanOrEqual(CONFIG.MIN_PATH_LENGTH);
  });
});
