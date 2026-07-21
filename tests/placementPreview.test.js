import { describe, it, expect, vi, beforeAll } from 'vitest';
import { CONFIG, TROOP_SPECS } from '../src/config.js';

vi.mock('../src/rendering/renderer.js', () => ({
  RENDERER: {
    width: 800,
    height: 600,
    hoverPx: null,
    hoverPy: null,
    offsetX: 0,
    offsetY: 0,
    scale: 1,
    toWorldInto: vi.fn((px, py, out) => {
      out.x = px;
      out.y = py;
      return out;
    }),
    markCacheDirty: vi.fn(),
    beginFrame: vi.fn(),
    applyMapTransform: vi.fn(),
    drawStaticLayers: vi.fn(),
    restoreTransform: vi.fn(),
    ctx: null,
    canvas: null,
  },
}));
vi.mock('../src/particles.js', () => ({ PARTICLES: { update: vi.fn(), clear: vi.fn() } }));
vi.mock('../src/audio.js', () => ({ AUDIO: {} }));
vi.mock('../src/gameRuntime.js', () => ({ GameRuntimeController: vi.fn() }));
vi.mock('../src/rendering/gameRenderer.js', () => ({ renderGame: vi.fn(), updateCursor: vi.fn() }));

describe('placement preview', () => {
  let getSupportHpsForPlacementPreview,
    getDpsForPlacementPreview,
    getBurnDpsForPlacementPreview,
    swordsmanSpec,
    archerSpec,
    healerSpec,
    flameSpec;

  beforeAll(async () => {
    const mod = await import('../src/ui/placement.js');
    getSupportHpsForPlacementPreview = mod.getSupportHpsForPlacementPreview;
    getDpsForPlacementPreview = mod.getDpsForPlacementPreview;
    getBurnDpsForPlacementPreview = mod.getBurnDpsForPlacementPreview;
    const helpers = await import('./helpers.js');
    swordsmanSpec = helpers.swordsmanSpec;
    archerSpec = helpers.archerSpec;
    healerSpec = helpers.healerSpec;
    flameSpec = helpers.flameSpec;
  });

  it('getSupportHpsForPlacementPreview returns 0 for non-support spec', () => {
    expect(getSupportHpsForPlacementPreview(swordsmanSpec, null)).toBe(0);
  });

  it('getSupportHpsForPlacementPreview returns 0 for null spec', () => {
    expect(getSupportHpsForPlacementPreview(null, null)).toBe(0);
  });

  it('getSupportHpsForPlacementPreview returns spec DPS for support without troop', () => {
    const hps = getSupportHpsForPlacementPreview(healerSpec, null);
    expect(hps).toBe(healerSpec.damage / healerSpec.attackSpeed);
  });

  it('getSupportHpsForPlacementPreview returns troop HPS when available', () => {
    const mockTroop = { getHps: vi.fn(() => 15) };
    const hps = getSupportHpsForPlacementPreview(healerSpec, mockTroop);
    expect(hps).toBe(15);
  });

  it('getDpsForPlacementPreview returns 0 for null spec', () => {
    expect(getDpsForPlacementPreview(null)).toBe(0);
  });

  it('getDpsForPlacementPreview returns 0 for support', () => {
    expect(getDpsForPlacementPreview(healerSpec)).toBe(0);
  });

  it('getDpsForPlacementPreview returns DPS for normal spec', () => {
    const dps = getDpsForPlacementPreview(swordsmanSpec);
    expect(dps).toBe(swordsmanSpec.damage / swordsmanSpec.attackSpeed);
  });

  it('getBurnDpsForPlacementPreview returns 0 for non-burn spec', () => {
    expect(getBurnDpsForPlacementPreview(swordsmanSpec)).toBe(0);
  });

  it('getBurnDpsForPlacementPreview returns 0 for null', () => {
    expect(getBurnDpsForPlacementPreview(null)).toBe(0);
  });

  it('getBurnDpsForPlacementPreview returns burn DPS for flame', () => {
    const burnDps = getBurnDpsForPlacementPreview(flameSpec);
    expect(burnDps).toBeGreaterThan(0);
  });

  it('getBurnDpsForPlacementPreview calculation is correct', () => {
    const tickDamage = Math.max(1, Math.round(flameSpec.damage * flameSpec.burnDamageRatio));
    const expected = (tickDamage * flameSpec.burnStacks) / flameSpec.burnTickInterval;
    expect(getBurnDpsForPlacementPreview(flameSpec)).toBeCloseTo(expected);
  });
});
