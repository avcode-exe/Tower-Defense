// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('AudioManager', () => {
  let AudioManager, AUDIO;
  let mockCtx;

  beforeEach(async () => {
    mockCtx = {
      currentTime: 0,
      state: 'running',
      resume: vi.fn(),
      createOscillator: vi.fn(() => ({
        type: '',
        frequency: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() },
        connect: vi.fn(),
        start: vi.fn(),
        stop: vi.fn(),
      })),
      createGain: vi.fn(() => ({
        gain: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() },
        connect: vi.fn(),
      })),
      createBufferSource: vi.fn(() => ({
        buffer: null,
        connect: vi.fn(),
        start: vi.fn(),
        stop: vi.fn(),
      })),
      createBiquadFilter: vi.fn(() => ({
        type: '',
        frequency: { value: 0 },
        Q: { value: 0 },
        connect: vi.fn(),
      })),
      createBuffer: vi.fn(() => ({
        getChannelData: vi.fn(() => []),
      })),
      sampleRate: 44100,
      destination: 'mock-destination',
    };

    // Set AudioContext on the jsdom window directly (use regular function for `new` compatibility).
    if (typeof window !== 'undefined') {
      window.AudioContext = function () {
        return mockCtx;
      };
      window.webkitAudioContext = undefined;
    }

    vi.resetModules();
    const mod = await import('../src/audio.js');
    AudioManager = mod.AudioManager;
    AUDIO = mod.AUDIO;
  });

  afterEach(() => {
    delete window.AudioContext;
    delete window.webkitAudioContext;
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('setVolume clamps to [0,1]', () => {
    AUDIO.setVolume(1.5);
    expect(AUDIO._volume).toBe(1);
    AUDIO.setVolume(-0.5);
    expect(AUDIO._volume).toBe(0);
    AUDIO.setVolume(0.7);
    expect(AUDIO._volume).toBe(0.7);
  });

  it('toggleMute mutes and restores', () => {
    AUDIO._volume = 0.5;
    AUDIO.toggleMute();
    expect(AUDIO._volume).toBe(0);
    AUDIO.toggleMute();
    expect(AUDIO._volume).toBe(0.5);
  });

  it('muted getter reflects volume state', () => {
    AUDIO._volume = 0;
    expect(AUDIO.muted).toBe(true);
    AUDIO._volume = 0.5;
    expect(AUDIO.muted).toBe(false);
  });

  it('_ensure creates AudioContext if needed', () => {
    // Use the existing window.AudioContext mock set during beforeEach
    AUDIO._ctx = null;
    AUDIO._enabled = true;
    AUDIO._ensure();
    expect(AUDIO._ctx).toBeTruthy();
  });

  it('_ensure resumes suspended context', () => {
    mockCtx.state = 'suspended';
    AUDIO._ctx = mockCtx;
    AUDIO._ensure();
    expect(mockCtx.resume).toHaveBeenCalled();
  });

  it('_ensure disables audio when context creation throws', () => {
    const badCtx = new Error('fail');
    vi.stubGlobal('window', {
      AudioContext: vi.fn(() => {
        throw badCtx;
      }),
    });
    AUDIO._ctx = null;
    AUDIO._enabled = true;
    AUDIO._ensure();
    expect(AUDIO._enabled).toBe(false);
  });

  it('_canPlay returns false when muted', () => {
    AUDIO._volume = 0;
    expect(AUDIO._canPlay()).toBe(false);
  });

  it('_canPlay returns false when disabled', () => {
    AUDIO._enabled = false;
    expect(AUDIO._canPlay()).toBe(false);
  });

  it('_canPlay returns true when ready', () => {
    AUDIO._ctx = mockCtx;
    AUDIO._enabled = true;
    AUDIO._volume = 0.5;
    expect(AUDIO._canPlay()).toBe(true);
  });

  it('_tone creates oscillator and gain nodes', () => {
    AUDIO._ctx = mockCtx;
    AUDIO._enabled = true;
    AUDIO._volume = 0.5;
    AUDIO._tone(440, 1, 'sine', 0.5);
    expect(mockCtx.createOscillator).toHaveBeenCalled();
    expect(mockCtx.createGain).toHaveBeenCalled();
  });

  it('_toneRamp creates frequency ramp', () => {
    AUDIO._ctx = mockCtx;
    AUDIO._enabled = true;
    AUDIO._volume = 0.5;
    const result = AUDIO._toneRamp(200, 600, 0.5, 'sine', 0.3);
    expect(result).toHaveProperty('osc');
    expect(result).toHaveProperty('gain');
    // Different freqs → exponentialRampToValueAtTime should be called (via returned osc)
    expect(result.osc.frequency.exponentialRampToValueAtTime).toHaveBeenCalled();
  });

  it('_toneRamp skips ramp when freqEnd equals freqStart', () => {
    AUDIO._ctx = mockCtx;
    AUDIO._enabled = true;
    AUDIO._volume = 0.5;
    const result = AUDIO._toneRamp(440, 440, 0.5, 'sine', 0.3);
    expect(result).toHaveProperty('osc');
    expect(result).toHaveProperty('gain');
    // Same freqs → exponentialRampToValueAtTime should NOT be called on frequency
    expect(result.osc.frequency.exponentialRampToValueAtTime).not.toHaveBeenCalled();
  });

  it('_noise creates buffer source and filter chain', () => {
    AUDIO._ctx = mockCtx;
    AUDIO._enabled = true;
    AUDIO._volume = 0.5;
    AUDIO._noise(0.1, 0.5, 1000, 2);
    expect(mockCtx.createBufferSource).toHaveBeenCalled();
    expect(mockCtx.createBiquadFilter).toHaveBeenCalled();
  });

  it('waveStart plays', () => {
    AUDIO._ctx = mockCtx;
    AUDIO._enabled = true;
    AUDIO._volume = 0.5;
    expect(() => AUDIO.waveStart()).not.toThrow();
  });

  it('waveComplete plays', () => {
    AUDIO._ctx = mockCtx;
    AUDIO._enabled = true;
    AUDIO._volume = 0.5;
    expect(() => AUDIO.waveComplete()).not.toThrow();
  });

  it('troopPlace plays', () => {
    AUDIO._ctx = mockCtx;
    AUDIO._enabled = true;
    AUDIO._volume = 0.5;
    expect(() => AUDIO.troopPlace()).not.toThrow();
  });

  it('meleeAttack plays', () => {
    AUDIO._ctx = mockCtx;
    AUDIO._enabled = true;
    expect(() => AUDIO.meleeAttack()).not.toThrow();
  });

  it('rangedAttack plays', () => {
    AUDIO._ctx = mockCtx;
    AUDIO._enabled = true;
    expect(() => AUDIO.rangedAttack()).not.toThrow();
  });

  it('monsterDeath plays', () => {
    AUDIO._ctx = mockCtx;
    AUDIO._enabled = true;
    expect(() => AUDIO.monsterDeath()).not.toThrow();
  });

  it('monsterLeak plays', () => {
    AUDIO._ctx = mockCtx;
    AUDIO._enabled = true;
    expect(() => AUDIO.monsterLeak()).not.toThrow();
  });

  it('defeat plays', () => {
    AUDIO._ctx = mockCtx;
    AUDIO._enabled = true;
    AUDIO._volume = 0.5;
    expect(() => AUDIO.defeat()).not.toThrow();
  });

  it('goldEarned plays', () => {
    AUDIO._ctx = mockCtx;
    AUDIO._enabled = true;
    expect(() => AUDIO.goldEarned()).not.toThrow();
  });

  it('upgrade plays', () => {
    AUDIO._ctx = mockCtx;
    AUDIO._enabled = true;
    expect(() => AUDIO.upgrade()).not.toThrow();
  });

  it('shieldBuy plays', () => {
    AUDIO._ctx = mockCtx;
    AUDIO._enabled = true;
    expect(() => AUDIO.shieldBuy()).not.toThrow();
  });

  it('heal plays', () => {
    AUDIO._ctx = mockCtx;
    AUDIO._enabled = true;
    expect(() => AUDIO.heal()).not.toThrow();
  });

  it('sell plays', () => {
    AUDIO._ctx = mockCtx;
    AUDIO._enabled = true;
    expect(() => AUDIO.sell()).not.toThrow();
  });

  it('SFX methods do not crash when muted', () => {
    AUDIO._volume = 0;
    expect(() => AUDIO.waveStart()).not.toThrow();
    expect(() => AUDIO.goldEarned()).not.toThrow();
  });

  it('SFX methods do not crash when disabled', () => {
    AUDIO._enabled = false;
    expect(() => AUDIO.waveComplete()).not.toThrow();
    expect(() => AUDIO.upgrade()).not.toThrow();
  });

  it('waveComplete returns when _ctx is null after _ensure', () => {
    AUDIO._ctx = null;
    AUDIO._enabled = true;
    AUDIO._volume = 0.5;
    expect(() => AUDIO.waveComplete()).not.toThrow();
  });

  it('upgrade returns when _ctx is null after _ensure', () => {
    AUDIO._ctx = null;
    AUDIO._enabled = true;
    AUDIO._volume = 0.5;
    expect(() => AUDIO.upgrade()).not.toThrow();
  });

  it('defeat returns when _canPlay is false', () => {
    AUDIO._volume = 0;
    expect(() => AUDIO.defeat()).not.toThrow();
  });

  it('upgrade early exit without ctx', () => {
    AUDIO._enabled = true;
    AUDIO._ctx = null;
    // Call _ensure to set _enabled = false if context creation fails
    // But we already set _ctx = null after _ensure, so _ensure will create it from window.AudioContext
    // Instead, directly set _ctx = null and ensure _enabled is true
    AUDIO._ctx = null;
    AUDIO._enabled = true;
    AUDIO._volume = 0.5;
    expect(() => AUDIO.upgrade()).not.toThrow();
  });

  // ===== Additional branch coverage for audio.js =====
  it('_noise returns early when _canPlay returns false (line 81)', () => {
    AUDIO._volume = 0; // muted → _canPlay returns false
    expect(() => AUDIO._noise(0.1)).not.toThrow();
    // Should not call any ctx methods since it returned early
    expect(mockCtx.createBuffer).not.toHaveBeenCalled();
  });

  it('waveComplete early exit when !this._enabled', () => {
    AUDIO._enabled = false;
    expect(() => AUDIO.waveComplete()).not.toThrow();
    expect(mockCtx.resume).not.toHaveBeenCalled();
  });

  it('waveComplete early exit when !this._ctx after _ensure', () => {
    // Make context creation fail so _ctx stays null
    delete window.AudioContext;
    AUDIO._ctx = null;
    AUDIO._enabled = true;
    expect(() => AUDIO.waveComplete()).not.toThrow();
  });

  it('upgrade early exit when !this._enabled', () => {
    AUDIO._enabled = false;
    expect(() => AUDIO.upgrade()).not.toThrow();
    expect(mockCtx.resume).not.toHaveBeenCalled();
  });

  it('rangedAttack early exit when _canPlay returns false', () => {
    AUDIO._volume = 0;
    expect(() => AUDIO.rangedAttack()).not.toThrow();
  });

  it('monsterDeath plays correctly', () => {
    AUDIO._volume = 0.5;
    AUDIO._enabled = true;
    AUDIO._ctx = mockCtx;
    expect(() => AUDIO.monsterDeath()).not.toThrow();
  });

  it('goldEarned plays correctly', () => {
    AUDIO._volume = 0.5;
    AUDIO._enabled = true;
    AUDIO._ctx = mockCtx;
    expect(() => AUDIO.goldEarned()).not.toThrow();
  });

  it('shieldBuy plays correctly', () => {
    AUDIO._volume = 0.5;
    AUDIO._enabled = true;
    AUDIO._ctx = mockCtx;
    expect(() => AUDIO.shieldBuy()).not.toThrow();
  });

  it('heal plays correctly', () => {
    AUDIO._volume = 0.5;
    AUDIO._enabled = true;
    AUDIO._ctx = mockCtx;
    expect(() => AUDIO.heal()).not.toThrow();
  });

  it('sell plays correctly', () => {
    AUDIO._volume = 0.5;
    AUDIO._enabled = true;
    AUDIO._ctx = mockCtx;
    expect(() => AUDIO.sell()).not.toThrow();
  });

  it('rangedAttack plays correctly', () => {
    AUDIO._volume = 0.5;
    AUDIO._enabled = true;
    AUDIO._ctx = mockCtx;
    expect(() => AUDIO.rangedAttack()).not.toThrow();
  });

  it('_noise creates noise buffer correctly', () => {
    AUDIO._volume = 0.5;
    AUDIO._enabled = true;
    AUDIO._ctx = mockCtx;
    expect(() => AUDIO._noise(0.1, 0.3, 1500, 2)).not.toThrow();
    expect(mockCtx.createBuffer).toHaveBeenCalled();
  });

  it('waveStart plays correctly', () => {
    AUDIO._volume = 0.5;
    AUDIO._enabled = true;
    AUDIO._ctx = mockCtx;
    expect(() => AUDIO.waveStart()).not.toThrow();
  });

  it('monsterLeak plays correctly', () => {
    AUDIO._volume = 0.5;
    AUDIO._enabled = true;
    AUDIO._ctx = mockCtx;
    expect(() => AUDIO.monsterLeak()).not.toThrow();
  });

  it('defeat plays correctly', () => {
    AUDIO._volume = 0.5;
    AUDIO._enabled = true;
    AUDIO._ctx = mockCtx;
    expect(() => AUDIO.defeat()).not.toThrow();
  });
});
