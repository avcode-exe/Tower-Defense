import { describe, it, expect } from 'vitest';
import { Grid, TILE } from '../src/grid.js';

describe('TILE constants', () => {
  it('has EMPTY = 0', () => expect(TILE.EMPTY).toBe(0));
  it('has PATH = 1', () => expect(TILE.PATH).toBe(1));
  it('has BLOCKED = 2', () => expect(TILE.BLOCKED).toBe(2));
});

describe('Grid', () => {
  it('creates grid with correct size', () => {
    const g = new Grid();
    expect(g.size).toBe(16);
    expect(g.tiles.length).toBe(16 * 16);
  });

  it('starts all tiles EMPTY', () => {
    const g = new Grid();
    for (let i = 0; i < g.tiles.length; i++) {
      expect(g.tiles[i]).toBe(TILE.EMPTY);
    }
  });

  it('set/get round-trip', () => {
    const g = new Grid();
    g.set(5, 10, TILE.PATH);
    expect(g.get(5, 10)).toBe(TILE.PATH);
  });

  it('idx computes correct flat index', () => {
    const g = new Grid();
    expect(g.idx(0, 0)).toBe(0);
    expect(g.idx(1, 0)).toBe(1);
    expect(g.idx(0, 1)).toBe(16);
    expect(g.idx(15, 15)).toBe(255);
  });

  it('get returns BLOCKED for out-of-bounds', () => {
    const g = new Grid();
    expect(g.get(-1, 0)).toBe(TILE.BLOCKED);
    expect(g.get(0, -1)).toBe(TILE.BLOCKED);
    expect(g.get(16, 0)).toBe(TILE.BLOCKED);
    expect(g.get(0, 16)).toBe(TILE.BLOCKED);
  });

  it('set ignores out-of-bounds writes', () => {
    const g = new Grid();
    g.set(-1, 0, TILE.PATH);
    g.set(0, -1, TILE.PATH);
    g.set(16, 0, TILE.PATH);
    // Should still be all EMPTY
    let count = 0;
    for (let i = 0; i < g.tiles.length; i++) {
      if (g.tiles[i] !== TILE.EMPTY) count++;
    }
    expect(count).toBe(0);
  });

  it('isBuildable returns true for EMPTY', () => {
    const g = new Grid();
    expect(g.isBuildable(5, 5)).toBe(true);
  });

  it('isBuildable returns false for PATH', () => {
    const g = new Grid();
    g.set(5, 5, TILE.PATH);
    expect(g.isBuildable(5, 5)).toBe(false);
  });

  it('isBuildable returns false for BLOCKED', () => {
    const g = new Grid();
    g.set(5, 5, TILE.BLOCKED);
    expect(g.isBuildable(5, 5)).toBe(false);
  });

  it('clear resets all tiles to EMPTY', () => {
    const g = new Grid();
    g.set(3, 3, TILE.PATH);
    g.set(7, 7, TILE.BLOCKED);
    g.clear();
    for (let i = 0; i < g.tiles.length; i++) {
      expect(g.tiles[i]).toBe(TILE.EMPTY);
    }
  });
});
