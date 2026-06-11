import { describe, expect, it } from 'vitest';
import { TROOP_SPECS } from '../src/config.js';
import { getSupportHpsForPlacementPreview } from '../src/ui/placement.js';

const archerSpec = TROOP_SPECS.find((spec) => spec.id === 'archer');
const healerSpec = TROOP_SPECS.find((spec) => spec.id === 'healer');

describe('getSupportHpsForPlacementPreview', () => {
  it('returns HPS for a healer placement preview', () => {
    const healer = { getHps: () => healerSpec.damage / healerSpec.attackSpeed };

    expect(getSupportHpsForPlacementPreview(healerSpec, healer)).toBeCloseTo(healerSpec.damage / healerSpec.attackSpeed);
  });

  it('falls back to spec HPS without an existing troop', () => {
    expect(getSupportHpsForPlacementPreview(healerSpec)).toBeCloseTo(healerSpec.damage / healerSpec.attackSpeed);
  });

  it('returns zero for non-support troops', () => {
    expect(getSupportHpsForPlacementPreview(archerSpec)).toBe(0);
  });
});
