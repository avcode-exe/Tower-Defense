import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { AudioManager } from '../src/audio.js';

class FakeNode {
  constructor() {
    this.connections = [];
  }

  connect(target) {
    this.connections.push(target);
  }
}

class FakeOscillator extends FakeNode {
  constructor() {
    super();
    this.type = 'sine';
    this.frequency = new FakeParam();
    this.started = [];
    this.stopped = [];
  }

  start(time) {
    this.started.push(time);
  }

  stop(time) {
    this.stopped.push(time);
  }
}

class FakeBufferSource extends FakeNode {
  constructor() {
    super();
    this.started = [];
    this.stopped = [];
  }

  start(time) {
    this.started.push(time);
  }

  stop(time) {
    this.stopped.push(time);
  }
}

class FakeGain extends FakeNode {
  constructor() {
    super();
    this.gain = new FakeParam();
  }
}

class FakeFilter extends FakeNode {
  constructor() {
    super();
    this.type = '';
    this.frequency = new FakeParam();
    this.Q = new FakeParam();
  }
}

class FakeParam {
  constructor() {
    this.value = 0;
    this.events = [];
  }

  setValueAtTime(value, time) {
    this.events.push(['set', value, time]);
  }

  exponentialRampToValueAtTime(value, time) {
    this.events.push(['ramp', value, time]);
  }
}

class FakeAudioContext {
  constructor() {
    if (FakeAudioContext.failNextCreate) {
      FakeAudioContext.failNextCreate = false;
      throw new Error('no audio');
    }

    this.currentTime = 10;
    this.sampleRate = 48000;
    this.state = 'running';
    this.destination = { id: 'destination' };
    this.nodes = [];
    FakeAudioContext.instances.push(this);
  }

  resume() {
    this.state = 'running';
  }

  createOscillator() {
    const node = new FakeOscillator();
    this.nodes.push(node);
    return node;
  }

  createGain() {
    const node = new FakeGain();
    this.nodes.push(node);
    return node;
  }

  createBiquadFilter() {
    const node = new FakeFilter();
    this.nodes.push(node);
    return node;
  }

  createBufferSource() {
    const node = new FakeBufferSource();
    this.nodes.push(node);
    return node;
  }

  createBuffer(channels, length, sampleRate) {
    const data = new Float32Array(length);
    return {
      channels,
      length,
      sampleRate,
      data,
      getChannelData: vi.fn(() => data),
    };
  }
}

FakeAudioContext.instances = [];
FakeAudioContext.failNextCreate = false;

describe('AudioManager', () => {
  beforeEach(() => {
    FakeAudioContext.instances = [];
    FakeAudioContext.failNextCreate = false;
    vi.stubGlobal('window', { AudioContext: FakeAudioContext });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('sets and clamps volume', () => {
    const audio = new AudioManager();

    audio.setVolume(-0.2);
    expect(audio._volume).toBe(0);

    audio.setVolume(1.4);
    expect(audio._volume).toBe(1);

    audio.setVolume(0.35);
    expect(audio._volume).toBe(0.35);
  });

  it('toggles mute and restores previous volume', () => {
    const audio = new AudioManager();

    audio.setVolume(0.7);
    audio.toggleMute();
    expect(audio.muted).toBe(true);
    expect(audio._volume).toBe(0);
    expect(audio._volumeBeforeMute).toBe(0.7);

    audio.toggleMute();
    expect(audio.muted).toBe(false);
    expect(audio._volume).toBe(0.7);
  });

  it('creates and resumes an AudioContext once', () => {
    const audio = new AudioManager();
    const ctx = new FakeAudioContext();
    ctx.state = 'suspended';
    audio._ctx = ctx;
    FakeAudioContext.instances = [ctx];

    audio._ensure();

    expect(audio._ctx).toBe(ctx);
    expect(ctx.state).toBe('running');
    expect(FakeAudioContext.instances.length).toBe(1);
  });

  it('disables audio when the context cannot be created', () => {
    const audio = new AudioManager();
    FakeAudioContext.failNextCreate = true;

    audio._ensure();

    expect(audio._enabled).toBe(false);
    expect(audio._ctx).toBeNull();
  });

  it('does not create nodes when muted', () => {
    const audio = new AudioManager();
    audio.setVolume(0);

    audio._tone(440, 0.1);

    expect(FakeAudioContext.instances).toHaveLength(0);
  });

  it('creates an oscillator tone chain', () => {
    const audio = new AudioManager();

    audio._tone(440, 0.2, 'square', 0.5);

    const ctx = FakeAudioContext.instances[0];
    const osc = ctx.nodes.find((node) => node instanceof FakeOscillator);
    const gain = ctx.nodes.find((node) => node instanceof FakeGain);
    expect(osc.type).toBe('square');
    expect(osc.frequency.events).toEqual([['set', 440, 10]]);
    expect(gain.gain.events).toEqual([
      ['set', 0.25, 10],
      ['ramp', 0.001, 10.2],
    ]);
    expect(osc.connections).toEqual([gain]);
    expect(gain.connections).toEqual([ctx.destination]);
    expect(osc.started).toEqual([10]);
    expect(osc.stopped).toEqual([10.2]);
  });

  it('creates a ramped oscillator tone and returns nodes', () => {
    const audio = new AudioManager();

    const result = audio._toneRamp(300, 900, 0.15, 'sawtooth', 0.4, 12);

    const ctx = FakeAudioContext.instances[0];
    const osc = ctx.nodes.find((node) => node instanceof FakeOscillator);
    const gain = ctx.nodes.find((node) => node instanceof FakeGain);
    expect(result).toEqual({ osc, gain });
    expect(osc.frequency.events).toEqual([
      ['set', 300, 12],
      ['ramp', 900, 12.15],
    ]);
    expect(gain.gain.events).toEqual([
      ['set', 0.2, 12],
      ['ramp', 0.001, 12.15],
    ]);
  });

  it('creates a filtered noise chain', () => {
    const audio = new AudioManager();

    audio._noise(0.05, 0.3, 1500, 2);

    const ctx = FakeAudioContext.instances[0];
    const source = ctx.nodes.find((node) => node instanceof FakeBufferSource);
    const filter = ctx.nodes.find((node) => node instanceof FakeFilter);
    const gain = ctx.nodes.find((node) => node instanceof FakeGain);
    expect(source.buffer.length).toBe(2400);
    expect(source.buffer.getChannelData).toHaveBeenCalled();
    expect(filter.type).toBe('bandpass');
    expect(filter.frequency.value).toBe(1500);
    expect(filter.Q.value).toBe(2);
    expect(source.connections).toEqual([filter]);
    expect(filter.connections).toEqual([gain]);
    expect(gain.connections).toEqual([ctx.destination]);
  });

  it.each([
    ['waveStart', 1, 1, 0],
    ['waveComplete', 3, 3, 0],
    ['rangedAttack', 1, 1, 1],
    ['monsterDeath', 1, 2, 1],
    ['sell', 2, 2, 0],
  ])('creates expected nodes for %s', (method, oscillatorCount, gainCount, filterCount) => {
    const audio = new AudioManager();

    audio[method]();

    const ctx = FakeAudioContext.instances[0];
    expect(ctx.nodes.filter((node) => node instanceof FakeOscillator)).toHaveLength(oscillatorCount);
    expect(ctx.nodes.filter((node) => node instanceof FakeGain)).toHaveLength(gainCount);
    expect(ctx.nodes.filter((node) => node instanceof FakeFilter)).toHaveLength(filterCount);
  });
});
