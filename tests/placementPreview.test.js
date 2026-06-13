import { describe, expect, it, beforeEach } from 'vitest';
import { TROOP_SPECS } from '../src/config.js';
import { getSupportHpsForPlacementPreview, getDpsForPlacementPreview } from '../src/ui/placement.js';
import { Game } from '../src/game.js';
import { Grid } from '../src/grid.js';
import { CONFIG } from '../src/config.js';

const archerSpec = TROOP_SPECS.find((spec) => spec.id === 'archer');
const healerSpec = TROOP_SPECS.find((spec) => spec.id === 'healer');
const swordsmanSpec = TROOP_SPECS.find((spec) => spec.id === 'swordsman');
const sniperSpec = TROOP_SPECS.find((spec) => spec.id === 'sniper');

describe('getSupportHpsForPlacementPreview', () => {
  it('returns HPS for a healer placement preview', () => {
    const healer = { getHps: () => healerSpec.damage / healerSpec.attackSpeed };

    expect(getSupportHpsForPlacementPreview(healerSpec, healer)).toBeCloseTo(
      healerSpec.damage / healerSpec.attackSpeed
    );
  });

  it('falls back to spec HPS without an existing troop', () => {
    expect(getSupportHpsForPlacementPreview(healerSpec)).toBeCloseTo(healerSpec.damage / healerSpec.attackSpeed);
  });

  it('returns zero for non-support troops', () => {
    expect(getSupportHpsForPlacementPreview(archerSpec)).toBe(0);
  });
});

describe('getDpsForPlacementPreview', () => {
  it('returns DPS for a damaging troop', () => {
    expect(getDpsForPlacementPreview(swordsmanSpec)).toBeCloseTo(swordsmanSpec.damage / swordsmanSpec.attackSpeed);
  });

  it('returns DPS for a ranged troop', () => {
    expect(getDpsForPlacementPreview(archerSpec)).toBeCloseTo(archerSpec.damage / archerSpec.attackSpeed);
  });

  it('returns DPS for sniper (high damage, slow attack)', () => {
    expect(getDpsForPlacementPreview(sniperSpec)).toBeCloseTo(sniperSpec.damage / sniperSpec.attackSpeed);
  });

  it('returns zero for support troops', () => {
    expect(getDpsForPlacementPreview(healerSpec)).toBe(0);
  });

  it('returns zero for null/undefined spec', () => {
    expect(getDpsForPlacementPreview(null)).toBe(0);
    expect(getDpsForPlacementPreview(undefined)).toBe(0);
  });
});

function makeTileIndex() {
  return Array.from({ length: CONFIG.GRID_SIZE * CONFIG.GRID_SIZE }, () => []);
}

function makeGame({ devMode = false, gold = 1000 } = {}) {
  const game = Object.create(Game.prototype);
  game.devMode = devMode;
  game.gold = gold;
  game.grid = new Grid();
  game.troops = [];
  game._troopTileIndex = makeTileIndex();
  return game;
}

describe('getPlacementInvalidReason', () => {
  let game;
  beforeEach(() => {
    game = makeGame({ devMode: false, gold: 1000 });
  });

  it('returns null when placement is valid', () => {
    expect(game.getPlacementInvalidReason(0, 0, archerSpec)).toBeNull();
  });

  it('returns reason when not enough gold', () => {
    game.gold = 5;
    expect(game.getPlacementInvalidReason(0, 0, archerSpec)).toBe('Not enough gold');
  });

  it('returns null in devMode regardless of gold', () => {
    game.devMode = true;
    game.gold = 0;
    expect(game.getPlacementInvalidReason(0, 0, archerSpec)).toBeNull();
  });

  it('returns reason when tile is not buildable (path tile)', () => {
    game.grid.set(0, 0, 1);
    expect(game.getPlacementInvalidReason(0, 0, archerSpec)).toBe('Cannot build here');
  });

  it('returns reason when tile is occupied by alive troop', () => {
    const fakeTroop = { alive: true };
    game._troopTileIndex[0] = [fakeTroop];
    expect(game.getPlacementInvalidReason(0, 0, archerSpec)).toBe('Tile occupied');
  });

  it('returns null when tile has only dead troops', () => {
    const deadTroop = { alive: false };
    game._troopTileIndex[0] = [deadTroop];
    expect(game.getPlacementInvalidReason(0, 0, archerSpec)).toBeNull();
  });

  it('checks gold before tile buildability', () => {
    game.gold = 0;
    game.grid.set(0, 0, 1);
    expect(game.getPlacementInvalidReason(0, 0, archerSpec)).toBe('Not enough gold');
  });
});
