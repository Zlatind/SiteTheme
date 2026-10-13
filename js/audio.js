// Tiny synthesized sound effects (no audio files needed).
'use strict';

const Sound = {
  ctx: null,
  enabled: true,
  volume: 0.7,
  noiseBuf: null,

  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      const len = this.ctx.sampleRate * 0.5;
      this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  },

  noise(dur, freq, q, gain, type = 'lowpass') {
    if (!this.enabled || !this.ctx) return;
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = this.ctx.createBiquadFilter();
    f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain * this.volume, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f); f.connect(g); g.connect(this.ctx.destination);
    src.start(t, Math.random() * 0.3); src.stop(t + dur);
  },

  tone(freq, dur, gain, type = 'square', slideTo) {
    if (!this.enabled || !this.ctx) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain * this.volume, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(this.ctx.destination);
    o.start(t); o.stop(t + dur);
  },

  material(kind) {
    return {
      stone: [1400, 1.2], wood: [700, 2], grass: [2200, 0.6], sand: [3000, 0.4],
      glass: [4000, 3], wool: [900, 0.3], snow: [2600, 0.5],
    }[kind] || [1500, 1];
  },

  dig(kind) { const [f, q] = this.material(kind); this.noise(0.12, f * 0.7, q, 0.25); },
  breakBlock(kind) {
    const [f, q] = this.material(kind);
    this.noise(0.22, f, q, 0.5);
    if (kind === 'glass') this.tone(2400, 0.25, 0.08, 'triangle', 900);
  },
  place(kind) { const [f, q] = this.material(kind); this.noise(0.14, f * 0.8, q, 0.45); },
  step(kind) { const [f, q] = this.material(kind); this.noise(0.08, f * 0.6, q, 0.12); },
  click() { this.tone(900, 0.05, 0.12, 'square', 600); },
  pop() { this.tone(500, 0.09, 0.15, 'sine', 1100); },
  hurt() { this.tone(220, 0.18, 0.2, 'sawtooth', 110); this.noise(0.12, 800, 1, 0.2); },
  eat() { for (let i = 0; i < 3; i++) setTimeout(() => this.noise(0.08, 1800, 1, 0.3), i * 120); },
  burp() { this.tone(160, 0.3, 0.2, 'sawtooth', 90); },
  fuse() { this.noise(1.5, 5000, 0.5, 0.15, 'highpass'); },
  explode() { this.noise(1.2, 400, 0.4, 1.0); this.tone(80, 0.8, 0.4, 'sine', 30); },
  splash() { this.noise(0.4, 1200, 0.5, 0.35, 'bandpass'); },
};
