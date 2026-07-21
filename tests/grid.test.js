import { describe, it, expect } from 'vitest';
import { Grid, TILE } from '../src/grid.js';
import { CONFIG } from '../src/config.js';

describe('TILE constants', () => {
  it('EMPTY is 0', () => {
    expect(TILE.EMPTY).toBe(0);
  });
  it('PATH is 1', () => {
    expect(TILE.PATH).toBe(1);
  });
  it('BLOCKED is 2', () => {
    expect(TILE.BLOCKED).toBe(2);
  });
});

describe('Grid', () => {
  it('constructor creates grid of CONFIG.GRID_SIZE', () => {
    const g = new Grid();
    expect(g.size).toBe(CONFIG.GRID_SIZE);
    expect(g.tiles.length).toBe(CONFIG.GRID_SIZE * CONFIG.GRID_SIZE);
  });

  it('all tiles start as EMPTY', () => {
    const g = new Grid();
    for (let i = 0; i < g.tiles.length; i++) {
      expect(g.tiles[i]).toBe(TILE.EMPTY);
    }
  });

  it('idx returns correct index', () => {
    const g = new Grid();
    expect(g.idx(0, 0)).toBe(0);
    expect(g.idx(1, 0)).toBe(1);
    expect(g.idx(0, 1)).toBe(16);
    expect(g.idx(15, 15)).toBe(255);
  });

  it('get returns correct value for in-bounds', () => {
    const g = new Grid();
    g.set(5, 5, TILE.PATH);
    expect(g.get(5, 5)).toBe(TILE.PATH);
    expect(g.get(0, 0)).toBe(TILE.EMPTY);
  });

  it('get returns BLOCKED for out-of-bounds (all 4 directions)', () => {
    const g = new Grid();
    expect(g.get(-1, 0)).toBe(TILE.BLOCKED);
    expect(g.get(16, 0)).toBe(TILE.BLOCKED);
    expect(g.get(0, -1)).toBe(TILE.BLOCKED);
    expect(g.get(0, 16)).toBe(TILE.BLOCKED);
    expect(g.get(-1, -1)).toBe(TILE.BLOCKED);
    expect(g.get(16, 16)).toBe(TILE.BLOCKED);
  });

  it('set round-trips all 3 tile states', () => {
    const g = new Grid();
    g.set(5, 5, TILE.PATH);
    expect(g.get(5, 5)).toBe(TILE.PATH);
    g.set(5, 5, TILE.BLOCKED);
    expect(g.get(5, 5)).toBe(TILE.BLOCKED);
    g.set(5, 5, TILE.EMPTY);
    expect(g.get(5, 5)).toBe(TILE.EMPTY);
  });

  it('set ignores out-of-bounds writes', () => {
    const g = new Grid();
    g.set(-1, 0, TILE.PATH);
    g.set(16, 0, TILE.PATH);
    expect(g.get(0, 0)).toBe(TILE.EMPTY);
  });

  it('isBuildable returns true for EMPTY', () => {
    const g = new Grid();
    expect(g.isBuildable(1, 1)).toBe(true);
  });

  it('isBuildable returns false for PATH', () => {
    const g = new Grid();
    g.set(1, 1, TILE.PATH);
    expect(g.isBuildable(1, 1)).toBe(false);
  });

  it('isBuildable returns false for BLOCKED', () => {
    const g = new Grid();
    g.set(1, 1, TILE.BLOCKED);
    expect(g.isBuildable(1, 1)).toBe(false);
  });

  it('isBuildable returns false for out-of-bounds', () => {
    const g = new Grid();
    expect(g.isBuildable(-1, 0)).toBe(false);
    expect(g.isBuildable(0, 16)).toBe(false);
  });

  it('clear resets all tiles to EMPTY', () => {
    const g = new Grid();
    g.set(0, 0, TILE.PATH);
    g.set(15, 15, TILE.BLOCKED);
    g.clear();
    expect(g.get(0, 0)).toBe(TILE.EMPTY);
    expect(g.get(15, 15)).toBe(TILE.EMPTY);
  });

  it('set/get at corners', () => {
    const g = new Grid();
    g.set(0, 0, TILE.PATH);
    expect(g.get(0, 0)).toBe(TILE.PATH);
    g.set(15, 15, TILE.BLOCKED);
    expect(g.get(15, 15)).toBe(TILE.BLOCKED);
    g.set(0, 15, TILE.PATH);
    expect(g.get(0, 15)).toBe(TILE.PATH);
    g.set(15, 0, TILE.BLOCKED);
    expect(g.get(15, 0)).toBe(TILE.BLOCKED);
  });

  it('set/get at (0,0) works', () => {
    const g = new Grid();
    g.set(0, 0, TILE.PATH);
    expect(g.get(0, 0)).toBe(TILE.PATH);
  });
});
