/**
 * Procedural audio using Web Audio API.
 * All sounds are generated on the fly - no external files needed.
 * AudioContext is initialized on first user interaction (browser autoplay policy).
 */
export class AudioManager {
  constructor() {
    this.ctx = null;
    this.initialized = false;
    this.muted = false;
  }

  /**
   * Initialize AudioContext on first user interaction.
   */
  init() {
    if (this.initialized) return;
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.initialized = true;
    } catch {
      // Web Audio not supported
      this.initialized = false;
    }
  }

  /**
   * Play a short blip sound for player shooting.
   */
  playShoot() {
    if (!this.initialized || this.muted) return;
    const { ctx } = this;
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'square';
    osc.frequency.setValueAtTime(880, now);
    osc.frequency.exponentialRampToValueAtTime(1200, now + 0.05);

    gain.gain.setValueAtTime(0.08, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.08);
  }

  /**
   * Play explosion sound.
   * @param {boolean} large - true for boss/large explosion
   */
  playExplosion(large = false) {
    if (!this.initialized || this.muted) return;
    const { ctx } = this;
    const now = ctx.currentTime;
    const duration = large ? 0.4 : 0.2;

    // Noise-based explosion using oscillator
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(large ? 100 : 200, now);
    osc.frequency.exponentialRampToValueAtTime(20, now + duration);

    gain.gain.setValueAtTime(large ? 0.15 : 0.1, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + duration);

    // Add noise layer
    const bufferSize = ctx.sampleRate * duration;
    const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const output = noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      output[i] = Math.random() * 2 - 1;
    }

    const noise = ctx.createBufferSource();
    noise.buffer = noiseBuffer;
    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(large ? 0.1 : 0.06, now);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, now + duration);

    noise.connect(noiseGain);
    noiseGain.connect(ctx.destination);

    noise.start(now);
    noise.stop(now + duration);
  }

  /**
   * Play hit sound (player takes damage).
   */
  playHit() {
    if (!this.initialized || this.muted) return;
    const { ctx } = this;
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(400, now);
    osc.frequency.exponentialRampToValueAtTime(100, now + 0.3);

    gain.gain.setValueAtTime(0.12, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.3);
  }

  /**
   * Play power-up or wave complete sound.
   */
  playWaveComplete() {
    if (!this.initialized || this.muted) return;
    const { ctx } = this;
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(440, now);
    osc.frequency.setValueAtTime(550, now + 0.1);
    osc.frequency.setValueAtTime(660, now + 0.2);

    gain.gain.setValueAtTime(0.1, now);
    gain.gain.setValueAtTime(0.1, now + 0.2);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.4);
  }

  /**
   * Play power-up collection sound (ascending tone).
   */
  playPowerUp() {
    if (!this.initialized || this.muted) return;
    const { ctx } = this;
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(600, now);
    osc.frequency.setValueAtTime(800, now + 0.08);
    osc.frequency.setValueAtTime(1200, now + 0.16);

    gain.gain.setValueAtTime(0.1, now);
    gain.gain.setValueAtTime(0.12, now + 0.08);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.3);
  }

  /**
   * Play burst mode activation sound (rising sweep).
   */
  playBurstActivate() {
    if (!this.initialized || this.muted) return;
    const { ctx } = this;
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'square';
    osc.frequency.setValueAtTime(400, now);
    osc.frequency.exponentialRampToValueAtTime(1600, now + 0.3);

    gain.gain.setValueAtTime(0.1, now);
    gain.gain.setValueAtTime(0.12, now + 0.15);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.5);
  }

  /**
   * Toggle mute.
   */
  toggleMute() {
    this.muted = !this.muted;
    return this.muted;
  }

  async destroy() {
    if (this.ctx && this.ctx.state !== 'closed') {
      try {
        await this.ctx.close();
      } catch {
        // ignore close failures
      }
    }
    this.ctx = null;
    this.initialized = false;
  }
}
