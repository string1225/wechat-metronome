const { patterns } = require('../../utils/patterns');

const MIN_BPM = 40;
const MAX_BPM = 220;

function clampTempo(value) {
  const tempo = Number(value);

  if (!Number.isFinite(tempo)) {
    return 90;
  }

  return Math.max(MIN_BPM, Math.min(MAX_BPM, Math.round(tempo)));
}

function buildPatternView(pattern) {
  const totalSteps = pattern.beats * pattern.stepsPerBeat;
  const ruler = Array.from({ length: totalSteps }, (_, index) => ({
    step: index,
    label: index % pattern.stepsPerBeat === 0 ? String(index / pattern.stepsPerBeat + 1) : '',
    isBeat: index % pattern.stepsPerBeat === 0
  }));

  const tracks = pattern.tracks.map((track) => ({
    ...track,
    cells: Array.from({ length: totalSteps }, (_, index) => {
      const value = track.hits[index] || 0;

      return {
        step: index,
        hit: Boolean(value),
        label: typeof value === 'string' ? value : '',
        isBeat: index % pattern.stepsPerBeat === 0
      };
    })
  }));

  return {
    ...pattern,
    totalSteps,
    ruler,
    tracks
  };
}

const patternViews = patterns.map(buildPatternView);

Page({
  data: {
    minBpm: MIN_BPM,
    maxBpm: MAX_BPM,
    bpm: patternViews[0].defaultBpm,
    mode: 'pattern',
    isPlaying: false,
    currentStep: -1,
    currentBeat: -1,
    currentBar: 1,
    patterns: patternViews,
    patternNames: patternViews.map((pattern) => pattern.name),
    selectedPatternIndex: 0,
    activePattern: patternViews[0],
    beatDots: Array.from({ length: patternViews[0].beats }, (_, index) => index),
    soundEnabled: true,
    vibrationEnabled: false,
    clickOverlay: true,
    audioStatus: '待启动'
  },

  _absoluteStep: 0,
  _audioAvailable: null,
  _audioCtx: null,
  _fallbackWarned: false,
  _lookaheadMs: 110,
  _nextStepAt: 0,
  _timer: null,
  _timerIntervalMs: 25,

  onLoad() {
    this.applyPattern(0, false);
  },

  onHide() {
    this.stop(true);
  },

  onUnload() {
    this.stop(true);
    this.destroyAudio();
  },

  togglePlay() {
    if (this.data.isPlaying) {
      this.stop();
      return;
    }

    this.start();
  },

  start() {
    const audioReady = this.ensureAudio();

    this._absoluteStep = 0;
    this._fallbackWarned = false;
    this._nextStepAt = Date.now() + 90;

    this.setData({
      audioStatus: audioReady ? '音频已就绪' : '使用震动/视觉',
      currentBar: 1,
      currentBeat: -1,
      currentStep: -1,
      isPlaying: true
    });

    if (wx.setKeepScreenOn) {
      wx.setKeepScreenOn({ keepScreenOn: true });
    }

    this.scheduleLoop();
  },

  stop(silent) {
    if (this._timer) {
      clearTimeout(this._timer);
      this._timer = null;
    }

    this.setData({
      currentBar: 1,
      currentBeat: -1,
      currentStep: -1,
      isPlaying: false
    });

    if (!silent && wx.setKeepScreenOn) {
      wx.setKeepScreenOn({ keepScreenOn: false });
    }
  },

  scheduleLoop() {
    if (!this.data.isPlaying) {
      return;
    }

    const now = Date.now();
    let guard = 0;

    while (this._nextStepAt <= now + this._lookaheadMs && guard < 8) {
      const dueIn = Math.max(0, this._nextStepAt - now);
      const absoluteStep = this._absoluteStep;

      setTimeout(() => {
        if (this.data.isPlaying) {
          this.fireStep(absoluteStep);
        }
      }, dueIn);

      this._absoluteStep += 1;
      this._nextStepAt += this.getStepDuration();
      guard += 1;
    }

    this._timer = setTimeout(() => this.scheduleLoop(), this._timerIntervalMs);
  },

  getStepDuration() {
    const beatDuration = 60000 / this.data.bpm;

    if (this.data.mode === 'pattern') {
      return beatDuration / this.data.activePattern.stepsPerBeat;
    }

    return beatDuration;
  },

  getCycleLength() {
    if (this.data.mode === 'pattern') {
      return this.data.activePattern.totalSteps;
    }

    return this.data.activePattern.beats;
  },

  fireStep(absoluteStep) {
    const cycleLength = this.getCycleLength();
    const step = absoluteStep % cycleLength;
    const beat = this.data.mode === 'pattern'
      ? Math.floor(step / this.data.activePattern.stepsPerBeat)
      : step;
    const currentStep = this.data.mode === 'pattern'
      ? step
      : beat * this.data.activePattern.stepsPerBeat;

    this.setData({
      currentBar: Math.floor(absoluteStep / cycleLength) + 1,
      currentBeat: beat,
      currentStep
    });

    this.playStep(step, beat);
  },

  playStep(step, beat) {
    const isDownbeat = beat === 0 && (this.data.mode === 'click' || step === 0);
    const sounds = [];

    if (this.data.mode === 'click') {
      sounds.push(isDownbeat ? 'accent' : 'tick');
    } else {
      const pattern = this.data.activePattern;

      if (this.data.clickOverlay && step % pattern.stepsPerBeat === 0) {
        sounds.push(isDownbeat ? 'accent' : 'tick');
      }

      pattern.tracks.forEach((track) => {
        if (track.hits[step]) {
          sounds.push(track.sound || 'rim');
        }
      });
    }

    if (this.data.soundEnabled) {
      this.playSounds(sounds);
    }

    if (this.data.vibrationEnabled && (isDownbeat || sounds.length)) {
      this.vibrate(isDownbeat);
    }
  },

  playSounds(sounds) {
    if (!sounds.length) {
      return;
    }

    if (!this.ensureAudio()) {
      if (!this._fallbackWarned) {
        this._fallbackWarned = true;
        this.setData({ audioStatus: '当前环境不支持合成音频' });
      }

      return;
    }

    sounds.slice(0, 4).forEach((sound, index) => {
      this.playTone(sound, index * 0.006);
    });
  },

  ensureAudio() {
    if (this._audioAvailable === false) {
      return false;
    }

    if (!this._audioCtx) {
      try {
        if (wx.setInnerAudioOption) {
          wx.setInnerAudioOption({
            mixWithOther: true,
            obeyMuteSwitch: false
          });
        }

        if (wx.createWebAudioContext) {
          this._audioCtx = wx.createWebAudioContext();
        }
      } catch (error) {
        this._audioCtx = null;
      }
    }

    const context = this._audioCtx;

    if (!context || !context.createOscillator || !context.createGain || !context.destination) {
      this._audioAvailable = false;
      return false;
    }

    try {
      if (context.state === 'suspended' && context.resume) {
        context.resume();
      }
    } catch (error) {
      // Some base libraries expose state without resume; the next note can still succeed.
    }

    this._audioAvailable = true;
    return true;
  },

  destroyAudio() {
    if (this._audioCtx && this._audioCtx.close) {
      try {
        this._audioCtx.close();
      } catch (error) {
        // Closing is best-effort on older base libraries.
      }
    }

    this._audioCtx = null;
    this._audioAvailable = null;
  },

  playTone(kind, delay) {
    const context = this._audioCtx;
    const startAt = (context.currentTime || 0) + delay;

    if (kind === 'kick') {
      this.playOscillator({
        duration: 0.11,
        from: 150,
        startAt,
        to: 55,
        type: 'sine',
        volume: 0.18
      });
      return;
    }

    if (kind === 'snare') {
      this.playNoise(startAt, 0.07, 0.11);
      this.playOscillator({
        duration: 0.045,
        from: 210,
        startAt,
        to: 180,
        type: 'triangle',
        volume: 0.05
      });
      return;
    }

    if (kind === 'hat') {
      this.playOscillator({
        duration: 0.026,
        from: 5200,
        startAt,
        type: 'triangle',
        volume: 0.035
      });
      return;
    }

    if (kind === 'accent') {
      this.playOscillator({
        duration: 0.055,
        from: 1680,
        startAt,
        type: 'square',
        volume: 0.13
      });
      return;
    }

    if (kind === 'tick') {
      this.playOscillator({
        duration: 0.04,
        from: 1120,
        startAt,
        type: 'square',
        volume: 0.09
      });
      return;
    }

    this.playOscillator({
      duration: 0.038,
      from: 820,
      startAt,
      type: 'square',
      volume: 0.055
    });
  },

  playOscillator(options) {
    const context = this._audioCtx;

    try {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      const startAt = options.startAt;
      const duration = options.duration;

      oscillator.type = options.type;
      this.setParam(oscillator.frequency, options.from, startAt);

      if (options.to) {
        this.rampParam(oscillator.frequency, options.to, startAt + duration);
      }

      this.setParam(gain.gain, 0.0001, startAt);
      this.rampParam(gain.gain, options.volume, startAt + 0.003);
      this.rampParam(gain.gain, 0.0001, startAt + duration);

      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start(startAt);
      oscillator.stop(startAt + duration + 0.02);
    } catch (error) {
      this._audioAvailable = false;
    }
  },

  playNoise(startAt, duration, volume) {
    const context = this._audioCtx;

    if (!context.createBuffer || !context.createBufferSource) {
      this.playOscillator({
        duration,
        from: 260,
        startAt,
        type: 'triangle',
        volume
      });
      return;
    }

    try {
      const sampleRate = context.sampleRate || 44100;
      const frameCount = Math.max(1, Math.floor(sampleRate * duration));
      const buffer = context.createBuffer(1, frameCount, sampleRate);
      const data = buffer.getChannelData(0);

      for (let index = 0; index < frameCount; index += 1) {
        const envelope = 1 - index / frameCount;
        data[index] = (Math.random() * 2 - 1) * envelope;
      }

      const source = context.createBufferSource();
      const gain = context.createGain();
      const output = context.createBiquadFilter ? context.createBiquadFilter() : gain;

      if (output !== gain) {
        output.type = 'highpass';
        this.setParam(output.frequency, 1600, startAt);
        source.connect(output);
        output.connect(gain);
      } else {
        source.connect(gain);
      }

      this.setParam(gain.gain, 0.0001, startAt);
      this.rampParam(gain.gain, volume, startAt + 0.002);
      this.rampParam(gain.gain, 0.0001, startAt + duration);

      source.buffer = buffer;
      gain.connect(context.destination);
      source.start(startAt);
      source.stop(startAt + duration + 0.02);
    } catch (error) {
      this.playOscillator({
        duration,
        from: 260,
        startAt,
        type: 'triangle',
        volume
      });
    }
  },

  setParam(param, value, time) {
    if (param && param.setValueAtTime) {
      param.setValueAtTime(value, time);
      return;
    }

    if (param) {
      param.value = value;
    }
  },

  rampParam(param, value, time) {
    if (param && param.exponentialRampToValueAtTime && value > 0) {
      param.exponentialRampToValueAtTime(value, time);
      return;
    }

    this.setParam(param, value, time);
  },

  vibrate(isDownbeat) {
    if (!wx.vibrateShort) {
      return;
    }

    wx.vibrateShort({
      type: isDownbeat ? 'heavy' : 'light'
    });
  },

  changeBpm(event) {
    const step = Number(event.currentTarget.dataset.step || 1);
    this.setTempo(this.data.bpm + step);
  },

  onTempoSlide(event) {
    this.setTempo(event.detail.value);
  },

  setTempo(value) {
    this.setData({
      bpm: clampTempo(value)
    });
  },

  setMode(event) {
    const mode = event.currentTarget.dataset.mode;

    if (!mode || mode === this.data.mode) {
      return;
    }

    this.setData({
      currentBar: 1,
      currentBeat: -1,
      currentStep: -1,
      mode
    });
  },

  onPatternChange(event) {
    this.applyPattern(Number(event.detail.value), true);
  },

  applyPattern(index, keepTempo) {
    const pattern = patternViews[index] || patternViews[0];

    this.setData({
      activePattern: pattern,
      beatDots: Array.from({ length: pattern.beats }, (_, beatIndex) => beatIndex),
      bpm: keepTempo ? this.data.bpm : pattern.defaultBpm,
      currentBar: 1,
      currentBeat: -1,
      currentStep: -1,
      selectedPatternIndex: index
    });
  },

  onSwitchChange(event) {
    const key = event.currentTarget.dataset.key;

    if (!key) {
      return;
    }

    this.setData({
      [key]: event.detail.value
    });
  }
});
