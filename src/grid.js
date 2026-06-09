import { CONFIG } from './config.js';
import { inBounds } from './utils.js';

// Grid with tile states and helpers. Size is driven by CONFIG.GRID_SIZE.

export const TILE = {
  EMPTY: 0,
  PATH: 1,
  BLOCKED: 2,
};

export class Grid {
  constructor() {
    this.size = CONFIG.GRID_SIZE;
    this.tiles = new Uint8Array(this.size * this.size);
    this.clear();
  }

  clear() {
    this.tiles.fill(TILE.EMPTY);
  }

  idx(gx, gy) {
    return gy * this.size + gx;
  }

  get(gx, gy) {
    if (!inBounds(gx, gy)) {
      console.warn(`Grid.get OOB: (${gx}, ${gy})`);
      return TILE.BLOCKED;
    }
    return this.tiles[this.idx(gx, gy)];
  }

  set(gx, gy, state) {
    if (!inBounds(gx, gy)) return;
    this.tiles[this.idx(gx, gy)] = state;
  }

  isBuildable(gx, gy) {
    return this.get(gx, gy) === TILE.EMPTY;
  }
}
