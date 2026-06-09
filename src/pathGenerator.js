import { CONFIG } from './config.js';
import { makeRNG, shuffleInPlace } from './utils.js';

// Carve a single width-1 corridor from left edge to right edge.
//
// Algorithm: randomized 4-neighbor greedy walk. Before stepping into a
// candidate cell, verify that none of its 4-neighbors are occupied by the
// path, except the current cell and the immediate previous cell. This
// guarantees width == 1 at all times.
//
// If a valid path of sufficient length cannot be found after retries, return
// a straight-line fallback.

export function generatePath(seed) {
  const NEIGHBORS = [
    [0, -1],
    [1, 0],
    [0, 1],
    [-1, 0],
  ];
  const rng = makeRNG(seed);
  const N = CONFIG.GRID_SIZE;

  for (let attempt = 0; attempt < CONFIG.PATH_REGEN_ATTEMPTS; attempt++) {
    const startY = Math.floor(rng() * N);
    const path = [[0, startY]];
    const occupied = new Uint8Array(N * N);
    occupied[startY * N + 0] = 1;
    let current = [0, startY];
    let previous = null;
    let failed = false;

    while (current[0] < N - 1) {
      const dirs = [0, 1, 2, 3];
      shuffleInPlace(dirs, rng);
      let moved = false;
      for (const d of dirs) {
        const nx = current[0] + NEIGHBORS[d][0];
        const ny = current[1] + NEIGHBORS[d][1];
        if (nx < 0 || nx >= N || ny < 0 || ny >= N) continue;
        if (occupied[ny * N + nx]) continue;

        // Disallow any candidate that would sit on the map edge except the
        // first/last cells.
        if (ny === 0 || ny === N - 1) continue;
        if (nx > 1 && nx < N - 2 && (ny === 1 || ny === N - 2)) continue;

        // Candidate cell must not be 4-adjacent to any overtaken cell except
        // current (where we stand) and previous (the step before that).
        let ok = true;
        neighborCheck: for (const [ax, ay] of NEIGHBORS) {
          const tx = nx + ax,
            ty = ny + ay;
          if (tx < 0 || tx >= N || ty < 0 || ty >= N) continue;
          if (!occupied[ty * N + tx]) continue;
          const isCurrent = tx === current[0] && ty === current[1];
          const isPrev = previous && tx === previous[0] && ty === previous[1];
          if (isCurrent || isPrev) continue;
          ok = false;
          break neighborCheck;
        }

        if (!ok) continue;
        occupied[ny * N + nx] = 1;
        previous = current;
        current = [nx, ny];
        path.push(current);
        moved = true;
        break;
      }
      if (!moved) {
        failed = true;
        break;
      }
    }

    if (!failed && current[0] === N - 1 && path.length >= CONFIG.MIN_PATH_LENGTH) {
      // Reject edge-hugging runs: only start/end may lie on a side edge.
      const body = path.slice(1, path.length - 1);
      const edgeBody = body.filter(([x, y]) => y === 0 || y === N - 1 || x === 0 || x === N - 1).length;
      if (edgeBody / Math.max(1, body.length) < CONFIG.PATH_EDGE_REJECTION) {
        return path;
      }
    }
  }

  // Fallback straight line.
  const fallback = [];
  const midY = Math.floor((N - 1) / 2);
  for (let x = 0; x < N; x++) fallback.push([x, midY]);
  return fallback;
}
