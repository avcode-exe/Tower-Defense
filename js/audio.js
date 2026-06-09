// Audio: Procedural sound effects using Web Audio API. Zero audio assets.
// Lazy-initializes AudioContext on first play (requires user gesture).

class AudioManager {
  constructor() {
    this._ctx = null;
    this._volume = 0.5;
    this._volumeBeforeMute = 0.5;
    this._enabled = true;
  }

  get muted() {
    return this._volume === 0;
  }

  toggleMute() {
    if (this._volume > 0) {
      this._volumeBeforeMute = this._volume;
      this._volume = 0;
    } else {
      this._volume = this._volumeBeforeMute || 0.5;
    }
  }

  _ensure() {
    if (!this._ctx) {
      try {
        this._ctx = new (window.AudioContext || window.webkitAudioContext)();
      } catch (e) {
        this._enabled = false;
      }
    }
    if (this._ctx && this._ctx.state === 'suspended') {
      this._ctx.resume();
    }
  }

  setVolume(v) {
    this._volume = Math.max(0, Math.min(1, v));
  }

  _tone(freq, duration, type = 'sine', vol = 1) {
    if (!this._enabled) return;
    this._ensure();
    if (!this._ctx) return;
    const t = this._ctx.currentTime;
    const osc = this._ctx.createOscillator();
    const gain = this._ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    gain.gain.setValueAtTime(vol * this._volume, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + duration);
    osc.connect(gain);
    gain.connect(this._ctx.destination);
    osc.start(t);
    osc.stop(t + duration);
  }

  _noise(duration, vol = 1, freq = 1000, Q = 1) {
    if (!this._enabled) return;
    this._ensure();
    if (!this._ctx) return;
    const t = this._ctx.currentTime;
    const sr = this._ctx.sampleRate;
    const len = Math.max(1, Math.ceil(sr * duration));
    const buf = this._ctx.createBuffer(1, len, sr);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    const src = this._ctx.createBufferSource();
    src.buffer = buf;
    const gain = this._ctx.createGain();
    gain.gain.setValueAtTime(vol * this._volume, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + duration);
    const filter = this._ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = freq;
    filter.Q.value = Q;
    src.connect(filter);
    filter.connect(gain);
    gain.connect(this._ctx.destination);
    src.start(t);
    src.stop(t + duration);
  }

  // ── Sound Effects ──

  waveStart() {
    this._ensure();
    if (!this._ctx) return;
    const t = this._ctx.currentTime;
    const osc = this._ctx.createOscillator();
    const gain = this._ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(200, t);
    osc.frequency.exponentialRampToValueAtTime(600, t + 0.3);
    gain.gain.setValueAtTime(0.3 * this._volume, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
    osc.connect(gain);
    gain.connect(this._ctx.destination);
    osc.start(t);
    osc.stop(t + 0.4);
  }

  waveComplete() {
    this._ensure();
    if (!this._ctx) return;
    const t = this._ctx.currentTime;
    [523, 659, 784].forEach((freq, i) => {
      const osc = this._ctx.createOscillator();
      const gain = this._ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, t);
      const start = t + i * 0.12;
      gain.gain.setValueAtTime(0.25 * this._volume, start);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.3);
      osc.connect(gain);
      gain.connect(this._ctx.destination);
      osc.start(start);
      osc.stop(start + 0.3);
    });
  }

  troopPlace() {
    this._noise(0.05, 0.3, 1500, 2);
  }

  meleeAttack() {
    this._noise(0.06, 0.25, 400, 0.5);
  }

  rangedAttack() {
    this._ensure();
    if (!this._ctx) return;
    const t = this._ctx.currentTime;
    const osc = this._ctx.createOscillator();
    const gain = this._ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(300, t);
    osc.frequency.exponentialRampToValueAtTime(1000, t + 0.08);
    gain.gain.setValueAtTime(0.12 * this._volume, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
    const filter = this._ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.value = 600;
    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this._ctx.destination);
    osc.start(t);
    osc.stop(t + 0.1);
  }

  monsterDeath() {
    this._noise(0.08, 0.3);
    this._tone(400, 0.1, 'sine', 0.15);
  }

  monsterLeak() {
    this._ensure();
    if (!this._ctx) return;
    const t = this._ctx.currentTime;
    const osc = this._ctx.createOscillator();
    const gain = this._ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(500, t);
    osc.frequency.exponentialRampToValueAtTime(80, t + 0.3);
    gain.gain.setValueAtTime(0.3 * this._volume, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
    osc.connect(gain);
    gain.connect(this._ctx.destination);
    osc.start(t);
    osc.stop(t + 0.4);
  }

  defeat() {
    this._ensure();
    if (!this._ctx) return;
    const t = this._ctx.currentTime;
    [523, 622, 784].forEach((freq, i) => {
      const osc = this._ctx.createOscillator();
      const gain = this._ctx.createGain();
      osc.type = 'sine';
      const start = t + i * 0.15;
      osc.frequency.setValueAtTime(freq, t);
      osc.frequency.exponentialRampToValueAtTime(freq * 0.5, t + 0.6);
      gain.gain.setValueAtTime(0.25 * this._volume, start);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.8);
      osc.connect(gain);
      gain.connect(this._ctx.destination);
      osc.start(start);
      osc.stop(start + 0.8);
    });
  }

  goldEarned() {
    this._tone(1200, 0.08, 'sine', 0.2);
  }

  upgrade() {
    this._ensure();
    if (!this._ctx) return;
    const t = this._ctx.currentTime;
    [600, 900].forEach((freq, i) => {
      const osc = this._ctx.createOscillator();
      const gain = this._ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, t);
      const start = t + i * 0.1;
      gain.gain.setValueAtTime(0.2 * this._volume, start);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.2);
      osc.connect(gain);
      gain.connect(this._ctx.destination);
      osc.start(start);
      osc.stop(start + 0.2);
    });
  }

  shieldBuy() {
    this._tone(300, 0.4, 'sine', 0.2);
  }

  heal() {
    this._tone(500, 0.15, 'triangle', 0.15);
  }

  sell() {
    this._tone(800, 0.05, 'square', 0.1);
    this._tone(400, 0.1, 'sine', 0.1);
  }
}

const AUDIO = new AudioManager();
