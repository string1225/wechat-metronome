// All simultaneous hits share the transport's audio-clock timestamp.
// Short PCM buffers keep synthesis work out of the scheduling loop.
class DrumAudio {
  constructor() {
    this.context = null;
    this.buffers = {};
    this.sources = new Set();
  }

  async prepare() {
    try {
      if (!this.context) this.context = wx.createWebAudioContext();
      if (!this.context.createBuffer || !this.context.createBufferSource || !this.context.createGain) return false;
      if (this.context.state === 'suspended' && this.context.resume) {
        await this.context.resume();
      }
      if (this.context.state === 'suspended' || this.context.state === 'closed') return false;
      ['accent', 'tick', 'rim', 'kick', 'snare', 'hihat'].forEach((kind) => {
        if (!this.buffers[kind]) this.buffers[kind] = this.makeBuffer(kind);
      });
      return true;
    } catch (error) {
      return false;
    }
  }

  makeBuffer(kind) {
    const rate = this.context.sampleRate || 44100;
    const duration = kind === 'kick' ? 0.28 : kind === 'snare' ? 0.18 : 0.065;
    const buffer = this.context.createBuffer(1, Math.ceil(duration * rate), rate);
    const data = buffer.getChannelData(0);
    let phase = 0;
    let previousNoise = 0;
    for (let i = 0; i < data.length; i += 1) {
      const t = i / rate;
      const attack = Math.min(1, t / 0.0015);
      const noise = Math.random() * 2 - 1;
      let value;
      if (kind === 'kick') {
        phase += 2 * Math.PI * (48 + 100 * Math.exp(-t * 45)) / rate;
        value = Math.sin(phase) * Math.exp(-t * 19) * 0.72;
      } else if (kind === 'snare') {
        value = (noise * 0.5 + Math.sin(2 * Math.PI * 185 * t) * 0.22) * Math.exp(-t * 32);
      } else if (kind === 'hihat') {
        value = (noise - previousNoise) * 0.14 * Math.exp(-t * 85);
      } else {
        const frequency = kind === 'accent' ? 1680 : kind === 'tick' ? 1120 : 820;
        value = Math.sin(2 * Math.PI * frequency * t) * Math.exp(-t * 95) * 0.4;
      }
      data[i] = value * attack;
      previousNoise = noise;
    }
    return buffer;
  }

  play(sounds, when, options) {
    if (!this.context) return;
    sounds.forEach((kind) => {
      const buffer = this.buffers[kind];
      if (!buffer) return;
      const source = this.context.createBufferSource();
      const gain = this.context.createGain();
      const isClick = kind === 'accent' || kind === 'tick';
      // Leave headroom when several drum voices and the click overlap.
      gain.gain.value = (isClick ? options.clickVolume : options.drumVolume) * (options.boost ? 1 : 0.55);
      source.buffer = buffer;
      source.connect(gain);
      gain.connect(this.context.destination);
      this.sources.add(source);
      source.onended = () => {
        this.sources.delete(source);
        source.disconnect();
        gain.disconnect();
      };
      source.start(when);
    });
  }

  cancel() {
    this.sources.forEach((source) => {
      try { source.stop(); } catch (error) { /* Already ended. */ }
    });
    this.sources.clear();
  }

  close() {
    this.cancel();
    if (this.context && this.context.close) this.context.close();
    this.context = null;
    this.buffers = {};
  }
}

module.exports = { DrumAudio };
