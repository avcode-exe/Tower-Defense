import { describe, expect, it, beforeEach } from 'vitest';
import { TROOP_SPECS } from '../src/config.js';
import {
  getSupportHpsForPlacementPreview,
  getDpsForPlacementPreview,
  getBurnDpsForPlacementPreview,
} from '../src/ui/placement.js';
import { Game } from '../src/game.js';
import { Grid } from '../src/grid.js';
import { CONFIG } from '../src/config.js';

const archerSpec = TROOP_SPECS.find((spec) => spec.id === 'archer');
const healerSpec = TROOP_SPECS.find((spec) => spec.id === 'healer');
const swordsmanSpec = TROOP_SPECS.find((spec) => spec.id === 'swordsman');
const flameSpec = TROOP_SPECS.find((spec) => spec.id === 'flame');
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

  it('returns zero for null selectedSpec', () => {
    expect(getSupportHpsForPlacementPreview(null)).toBe(0);
  });

  it('returns zero for undefined selectedSpec', () => {
    expect(getSupportHpsForPlacementPreview(undefined)).toBe(0);
  });

  it('uses troop.getHps() when troop has getHps method', () => {
    const troop = { getHps: () => 42.5 };
    expect(getSupportHpsForPlacementPreview(healerSpec, troop)).toBe(42.5);
  });

  it('falls back to spec when troop exists but has no getHps', () => {
    const troop = { hp: 40 };
    expect(getSupportHpsForPlacementPreview(healerSpec, troop)).toBeCloseTo(healerSpec.damage / healerSpec.attackSpeed);
  });

  it('falls back to spec when troop.getHps is not a function', () => {
    const troop = { getHps: 'not a function' };
    expect(getSupportHpsForPlacementPreview(healerSpec, troop)).toBeCloseTo(healerSpec.damage / healerSpec.attackSpeed);
  });

  it('returns zero for swordsman (melee non-support)', () => {
    expect(getSupportHpsForPlacementPreview(swordsmanSpec)).toBe(0);
  });

  it('returns zero for sniper (ranged non-support)', () => {
    expect(getSupportHpsForPlacementPreview(sniperSpec)).toBe(0);
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

  it('returns DPS for knight (melee, high damage)', () => {
    const knightSpec = TROOP_SPECS.find((spec) => spec.id === 'knight');
    expect(getDpsForPlacementPreview(knightSpec)).toBeCloseTo(knightSpec.damage / knightSpec.attackSpeed);
  });

  it('returns DPS for mage (ranged, splash)', () => {
    const mageSpec = TROOP_SPECS.find((spec) => spec.id === 'mage');
    expect(getDpsForPlacementPreview(mageSpec)).toBeCloseTo(mageSpec.damage / mageSpec.attackSpeed);
  });

  it('returns DPS for lightning (ranged, chain)', () => {
    const lightningSpec = TROOP_SPECS.find((spec) => spec.id === 'lightning');
    expect(getDpsForPlacementPreview(lightningSpec)).toBeCloseTo(lightningSpec.damage / lightningSpec.attackSpeed);
  });

  it('returns DPS for mortar (ranged, splash)', () => {
    const mortarSpec = TROOP_SPECS.find((spec) => spec.id === 'mortar');
    expect(getDpsForPlacementPreview(mortarSpec)).toBeCloseTo(mortarSpec.damage / mortarSpec.attackSpeed);
  });

  it('returns DPS for icewiz (ranged, slow)', () => {
    const icewizSpec = TROOP_SPECS.find((spec) => spec.id === 'icewiz');
    expect(getDpsForPlacementPreview(icewizSpec)).toBeCloseTo(icewizSpec.damage / icewizSpec.attackSpeed);
  });

  it('returns DPS for machinegun (ranged, rapid fire)', () => {
    const mgSpec = TROOP_SPECS.find((spec) => spec.id === 'machinegun');
    expect(getDpsForPlacementPreview(mgSpec)).toBeCloseTo(mgSpec.damage / mgSpec.attackSpeed);
  });

  it('returns DPS for valkyrie (melee, aoe)', () => {
    const valkSpec = TROOP_SPECS.find((spec) => spec.id === 'valkyrie');
    expect(getDpsForPlacementPreview(valkSpec)).toBeCloseTo(valkSpec.damage / valkSpec.attackSpeed);
  });

  it('returns NaN for empty object spec (no damage/attackSpeed)', () => {
    // Empty object passes the guard (truthy, type != 'support') but has no numeric fields
    expect(getDpsForPlacementPreview({})).toBeNaN();
  });

  it('returns zero for spec with type=support explicitly', () => {
    expect(getDpsForPlacementPreview({ type: 'support', damage: 10, attackSpeed: 1 })).toBe(0);
  });
});

describe('getBurnDpsForPlacementPreview', () => {
  it('returns expected Flame Troop burn DPS', () => {
    const tickDamage = Math.max(1, Math.round(flameSpec.damage * flameSpec.burnDamageRatio));
    const expected = (tickDamage * flameSpec.burnStacks) / flameSpec.burnTickInterval;
    expect(getBurnDpsForPlacementPreview(flameSpec)).toBe(expected);
  });

  it('returns zero for non-burning troops', () => {
    expect(getBurnDpsForPlacementPreview(swordsmanSpec)).toBe(0);
    expect(getBurnDpsForPlacementPreview(archerSpec)).toBe(0);
  });

  it('returns zero for null/undefined specs', () => {
    expect(getBurnDpsForPlacementPreview(null)).toBe(0);
    expect(getBurnDpsForPlacementPreview(undefined)).toBe(0);
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
    expect(game.getPlacementInvalidReason(0, 0, archerSpec)).toBe('Need 70g');
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
    expect(game.getPlacementInvalidReason(0, 0, archerSpec)).toBe('Need 70g');
  });
});
