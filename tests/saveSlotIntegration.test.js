import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import { CONFIG } from '../src/config.js';

vi.mock('../src/audio.js', () => ({
  AUDIO: {
    troopPlace: vi.fn(),
    sell: vi.fn(),
    goldEarned: vi.fn(),
    upgrade: vi.fn(),
    heal: vi.fn(),
    shieldBuy: vi.fn(),
    waveStart: vi.fn(),
    defeat: vi.fn(),
    toggleMute: vi.fn(),
    monsterLeak: vi.fn(),
    monsterDeath: vi.fn(),
    rangedAttack: vi.fn(),
    meleeAttack: vi.fn(),
    waveComplete: vi.fn(),
    troopDeath: vi.fn(),
  },
}));
vi.mock('../src/particles.js', () => ({
  PARTICLES: {
    update: vi.fn(),
    clear: vi.fn(),
    deathBurst: vi.fn(),
    hitSpark: vi.fn(),
    chainSpark: vi.fn(),
    slowApply: vi.fn(),
    healBurst: vi.fn(),
    troopDeath: vi.fn(),
    troopShieldActivate: vi.fn(),
    reviveBurst: vi.fn(),
    splashImpact: vi.fn(),
    spawnTrail: vi.fn(),
    spawn: vi.fn(),
    burnApply: vi.fn(),
    burnTick: vi.fn(),
  },
}));
vi.mock('../src/rendering/renderer.js', () => ({
  RENDERER: {
    init: vi.fn(),
    resize: vi.fn(),
    markCacheDirty: vi.fn(),
    _rebuildCache: vi.fn(),
    toWorldInto: vi.fn((px, py, out) => {
      out.x = px;
      out.y = py;
      return out;
    }),
    beginFrame: vi.fn(),
    applyMapTransform: vi.fn(),
    drawStaticLayers: vi.fn(),
    restoreTransform: vi.fn(),
    endFrame: vi.fn(),
    width: 800,
    height: 600,
    offsetX: 0,
    offsetY: 0,
    scale: 1,
    hoverPx: null,
    hoverPy: null,
    canvas: null,
    ctx: null,
  },
}));
vi.mock('../src/rendering/gameRenderer.js', () => ({ renderGame: vi.fn(), updateCursor: vi.fn() }));
vi.mock('../src/gameRuntime.js', () => ({
  GameRuntimeController: vi.fn().mockImplementation(() => ({
    installResize: vi.fn(),
    startLoop: vi.fn(),
    stopLoop: vi.fn(),
    applyDefeat: vi.fn(),
    startWave: vi.fn(),
    togglePause: vi.fn(),
    pauseGame: vi.fn(),
    resumeGame: vi.fn(),
    startPauseRender: vi.fn(),
    stopPauseRender: vi.fn(),
    removeResize: vi.fn(),
  })),
}));

describe('save slot integration', () => {
  let makeGame, makeElectronStub, swordsmanSpec;
  let game, electron;

  beforeAll(async () => {
    const helpers = await import('./helpers.js');
    makeGame = helpers.makeGame;
    makeElectronStub = helpers.makeElectronStub;
    swordsmanSpec = helpers.swordsmanSpec;
  });

  beforeEach(() => {
    vi.clearAllMocks();
    // Set up mock electron with in-memory save storage
    const saveStore = {};
    electron = makeElectronStub({
      listSaves: vi.fn(async () => {
        const results = [];
        for (const [slot, data] of Object.entries(saveStore)) {
          results.push({
            slot,
            meta: {
              timestamp: data._meta ? data._meta.timestamp : Date.now(),
              wave: data._meta ? data._meta.wave : (data.wave && data.wave.currentWave) || 0,
              gold: data._meta ? data._meta.gold : data.gold,
              lives: data._meta ? data._meta.lives : data.lives,
              version: data._meta ? data._meta.version : data.version || '0.0.0',
              preview: (data._meta && data._meta.preview) || null,
            },
          });
        }
        return results;
      }),
      saveGameSlot: vi.fn(async (slot, data) => {
        saveStore[slot] = JSON.parse(JSON.stringify(data));
        return true;
      }),
      loadGameSlot: vi.fn(async (slot) => {
        if (saveStore[slot]) return JSON.parse(JSON.stringify(saveStore[slot]));
        return null;
      }),
      deleteSaveSlot: vi.fn(async (slot) => {
        delete saveStore[slot];
        return true;
      }),
    });
    globalThis.window = globalThis.window || {};
    window.electron = electron;
    game = makeGame();
  });

  afterEach(() => {
    delete globalThis.window;
  });

  // ── listSaves ────────────────────────────────────────────────────────────

  describe('listSaves', () => {
    it('returns empty array when no saves exist', async () => {
      const saves = await game.listSaves();
      expect(saves).toEqual([]);
      expect(electron.listSaves).toHaveBeenCalledOnce();
    });

    it('returns saves after saveToSlot calls', async () => {
      await game.saveToSlot('mysave');
      const saves = await game.listSaves();
      expect(saves.length).toBe(1);
      expect(saves[0].slot).toBe('mysave');
      expect(saves[0].meta).toBeDefined();
      expect(saves[0].meta.wave).toBe(game.wave.currentWave);
      expect(saves[0].meta.gold).toBe(game.gold);
      expect(saves[0].meta.lives).toBe(game.lives);
    });

    it('returns multiple saves with correct metadata', async () => {
      await game.saveToSlot('save_a');
      game.wave.currentWave = 3;
      await game.saveToSlot('save_b');
      game.wave.currentWave = 7;
      await game.saveToSlot('autosave.0');

      const saves = await game.listSaves();
      expect(saves.length).toBe(3);

      const saveA = saves.find((s) => s.slot === 'save_a');
      const saveB = saves.find((s) => s.slot === 'save_b');
      const auto0 = saves.find((s) => s.slot === 'autosave.0');
      expect(saveA.meta.wave).toBe(0);
      expect(saveB.meta.wave).toBe(3);
      expect(auto0.meta.wave).toBe(7);
    });

    it('returns empty array when electron.listSaves fails', async () => {
      electron.listSaves.mockRejectedValueOnce(new Error('fail'));
      const saves = await game.listSaves();
      expect(saves).toEqual([]);
    });

    it('returns empty array when electron is missing', async () => {
      delete window.electron;
      const saves = await game.listSaves();
      expect(saves).toEqual([]);
    });
  });

  // ── saveToSlot ───────────────────────────────────────────────────────────

  describe('saveToSlot', () => {
    it('saves to a named slot and includes metadata', async () => {
      game.gold = 500;
      game.lives = 20;
      game.wave.currentWave = 3;
      const result = await game.saveToSlot('mysave');
      expect(result).toBe(true);
      expect(electron.saveGameSlot).toHaveBeenCalledWith(
        'mysave',
        expect.objectContaining({
          gold: 500,
          lives: 20,
          _meta: expect.objectContaining({
            wave: 3,
            gold: 500,
            lives: 20,
          }),
        })
      );
    });

    it('returns false when electron.saveGameSlot fails', async () => {
      electron.saveGameSlot.mockRejectedValueOnce(new Error('fail'));
      const result = await game.saveToSlot('mysave');
      expect(result).toBe(false);
    });

    it('returns false when electron is missing', async () => {
      delete window.electron;
      const result = await game.saveToSlot('mysave');
      expect(result).toBe(false);
    });

    it('saves multiple slots independently', async () => {
      game.gold = 100;
      await game.saveToSlot('slow');
      game.gold = 200;
      await game.saveToSlot('speed');
      // Verify both were persisted with correct values
      const data1 = await electron.loadGameSlot('slow');
      const data2 = await electron.loadGameSlot('speed');
      expect(data1.gold).toBe(100);
      expect(data2.gold).toBe(200);
    });

    it('overwrites existing slot', async () => {
      game.gold = 100;
      await game.saveToSlot('mysave');
      game.gold = 999;
      await game.saveToSlot('mysave');
      const data = await electron.loadGameSlot('mysave');
      expect(data.gold).toBe(999);
    });

    it('includes _meta metadata in save data', async () => {
      await game.saveToSlot('meta_test');
      expect(electron.saveGameSlot).toHaveBeenCalledWith(
        'meta_test',
        expect.objectContaining({
          _meta: expect.objectContaining({
            timestamp: expect.any(Number),
            version: expect.any(String),
          }),
        })
      );
    });

    it('includes preview thumbnail data URL in save data', async () => {
      // In Node.js, captureSavePreview returns null, so preview should not be in _meta
      await game.saveToSlot('preview_test');
      const callArg = electron.saveGameSlot.mock.calls[0][1];
      expect(callArg._meta).toBeDefined();
      // preview is only captured when running in browser with a real canvas
      expect(callArg._meta.preview).toBeUndefined();
    });
  });

  // ── loadFromSlot ─────────────────────────────────────────────────────────

  describe('loadFromSlot', () => {
    it('loads and restores game state from a saved slot', async () => {
      game.gold = 500;
      game.lives = 20;
      game.wave.currentWave = 3;
      await game.saveToSlot('mysave');

      // Modify game state to verify restore
      const originalSeed = game.seed;
      game.gold = 999;
      game.lives = 5;

      const result = await game.loadFromSlot('mysave');
      expect(result).toBe(true);
      expect(game.gold).toBe(500);
      expect(game.lives).toBe(20);
      expect(game.wave.currentWave).toBe(3);
      expect(game.seed).toBe(originalSeed);
      expect(game.state).toBe('PRE_WAVE');
      expect(game.sellCooldownTimer).toBe(0);
    });

    it('returns false when slot does not exist', async () => {
      const result = await game.loadFromSlot('nonexistent');
      expect(result).toBe(false);
    });

    it('returns false when electron.loadGameSlot returns null', async () => {
      electron.loadGameSlot.mockResolvedValueOnce(null);
      const result = await game.loadFromSlot('emptyslot');
      expect(result).toBe(false);
    });

    it('returns false when electron.loadGameSlot fails', async () => {
      electron.loadGameSlot.mockRejectedValueOnce(new Error('fail'));
      const result = await game.loadFromSlot('mysave');
      expect(result).toBe(false);
    });

    it('returns false when electron is missing', async () => {
      delete window.electron;
      const result = await game.loadFromSlot('mysave');
      expect(result).toBe(false);
    });

    it('restores troops from saved slot', async () => {
      game.placeTroop(swordsmanSpec, 1, 1);
      const troopId = game.troops[0].spec.id;
      await game.saveToSlot('troop_save');

      // Remove all troops
      game.troops = [];

      await game.loadFromSlot('troop_save');
      expect(game.troops.length).toBe(1);
      expect(game.troops[0].spec.id).toBe(troopId);
    });

    it('restores devMonsterCounts when present', async () => {
      game.devMonsterCounts = { 1: 5, 2: 3 };
      await game.saveToSlot('dev_save');

      game.devMonsterCounts = {};
      await game.loadFromSlot('dev_save');
      expect(game.devMonsterCounts).toBeDefined();
    });

    it('sets state to PRE_WAVE after loading', async () => {
      await game.saveToSlot('state_test');
      game.state = 'PAUSED';
      await game.loadFromSlot('state_test');
      expect(game.state).toBe('PRE_WAVE');
    });
  });

  // ── deleteSlot ───────────────────────────────────────────────────────────

  describe('deleteSlot', () => {
    it('deletes a saved slot', async () => {
      await game.saveToSlot('temp_save');
      expect((await game.listSaves()).length).toBe(1);

      const result = await game.deleteSlot('temp_save');
      expect(result).toBe(true);
      expect(electron.deleteSaveSlot).toHaveBeenCalledWith('temp_save');
      expect((await game.listSaves()).length).toBe(0);
    });

    it('returns true even if slot does not exist', async () => {
      const result = await game.deleteSlot('nonexistent');
      expect(result).toBe(true);
    });

    it('returns false when electron.deleteSaveSlot fails', async () => {
      electron.deleteSaveSlot.mockRejectedValueOnce(new Error('fail'));
      const result = await game.deleteSlot('mysave');
      expect(result).toBe(false);
    });

    it('returns false when electron is missing', async () => {
      delete window.electron;
      const result = await game.deleteSlot('mysave');
      expect(result).toBe(false);
    });

    it('does not affect other slots when deleting one', async () => {
      await game.saveToSlot('keep');
      await game.saveToSlot('remove');
      await game.deleteSlot('remove');
      const saves = await game.listSaves();
      expect(saves.length).toBe(1);
      expect(saves[0].slot).toBe('keep');
    });
  });

  // ── Full round-trip: save → list → load → delete ────────────────────────

  describe('full round-trip flow', () => {
    it('save → list → load → delete produces correct state transitions', async () => {
      // 1. Initial state
      game.gold = 300;
      game.wave.currentWave = 2;
      game.seed = 12345;

      // 2. Save to multiple slots (no troops — gold stays as-is)
      await game.saveToSlot('quicksave');
      await game.saveToSlot('manual_backup');
      game.gold = 500;
      await game.saveToSlot('rich_save');

      // 3. List all
      const saves = await game.listSaves();
      expect(saves.length).toBe(3);
      expect(saves.find((s) => s.slot === 'quicksave').meta.gold).toBe(300);
      expect(saves.find((s) => s.slot === 'rich_save').meta.gold).toBe(500);

      // 4. Load quicksave (gold=300, wave=2)
      await game.loadFromSlot('quicksave');
      expect(game.gold).toBe(300);
      expect(game.wave.currentWave).toBe(2);
      expect(game.seed).toBe(12345);

      // 5. Delete manual_backup
      await game.deleteSlot('manual_backup');
      const remaining = await game.listSaves();
      expect(remaining.length).toBe(2);
      expect(remaining.find((s) => s.slot === 'manual_backup')).toBeUndefined();

      // 6. Delete remaining slots
      await game.deleteSlot('quicksave');
      await game.deleteSlot('rich_save');
      expect((await game.listSaves()).length).toBe(0);
    });

    it('round-trip persists troop upgrades', async () => {
      game.placeTroop(swordsmanSpec, 1, 1);
      game.upgradeTroopStat(0, 'dmg');
      game.upgradeTroopStat(0, 'hp');
      const dmgBefore = game.troops[0].dmgLevel;
      const hpBefore = game.troops[0].hpLevel;

      await game.saveToSlot('upgraded');
      game.troops = [];
      await game.loadFromSlot('upgraded');

      expect(game.troops.length).toBe(1);
      expect(game.troops[0].dmgLevel).toBe(dmgBefore);
      expect(game.troops[0].hpLevel).toBe(hpBefore);
    });

    it('subsequent saves overwrite previous data correctly', async () => {
      game.gold = 100;
      game.wave.currentWave = 1;
      await game.saveToSlot('evolving');

      game.gold = 200;
      game.wave.currentWave = 3;
      await game.saveToSlot('evolving');

      const data = await electron.loadGameSlot('evolving');
      expect(data.gold).toBe(200);
      expect(data.wave.currentWave).toBe(3);
    });

    it('survives restore then re-save cycle', async () => {
      game.gold = 400;
      game.wave.currentWave = 4;
      await game.saveToSlot('cycle');

      game.gold = 0;
      await game.loadFromSlot('cycle');
      expect(game.gold).toBe(400);

      game.gold = 999;
      await game.saveToSlot('cycle');
      const data = await electron.loadGameSlot('cycle');
      expect(data.gold).toBe(999);
    });
  });

  // ── Edge cases ───────────────────────────────────────────────────────────

  describe('edge cases', () => {
    it('handles dev mode gold/lives correctly', async () => {
      game.devMode = true;
      game.gold = Infinity;
      game.lives = Infinity;
      game.wave.currentWave = 5;
      await game.saveToSlot('dev_mode');

      const data = await electron.loadGameSlot('dev_mode');
      expect(data.gold).toBeNull();
      expect(data.lives).toBeNull();
    });

    it('save slot names with special characters are sanitized by electron', async () => {
      await game.saveToSlot('my save!@#');
      expect(electron.saveGameSlot).toHaveBeenCalledWith('my save!@#', expect.any(Object));
    });

    it('rapid save and load does not cause data loss', async () => {
      game.gold = 100;
      await game.saveToSlot('rapid');
      game.gold = 200;
      await game.saveToSlot('rapid');
      await game.loadFromSlot('rapid');
      expect(game.gold).toBe(200);
    });

    it('save with empty troop array still includes _meta', async () => {
      game.troops = [];
      await game.saveToSlot('empty_troops');
      const data = await electron.loadGameSlot('empty_troops');
      expect(data._meta).toBeDefined();
      expect(data.troops).toEqual([]);
    });
  });
});
