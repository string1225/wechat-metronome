const {
  continuousRoutines,
  rhythmPatterns,
  singlePatterns
} = require('../../utils/patterns');

const APP_NAME = '架子鼓练习助手';
const MIN_BPM = 40;
const MAX_BPM = 220;
const ROUTINE_STAGE_GAP_RPX = 8;
const ROUTINE_STAGE_WIDTH_RPX = 88;

function clampTempo(value) {
  const tempo = Number(value);

  if (!Number.isFinite(tempo)) {
    return 90;
  }

  return Math.max(MIN_BPM, Math.min(MAX_BPM, Math.round(tempo)));
}

function getCellWidth(totalSteps) {
  if (totalSteps >= 40) {
    return 34;
  }

  if (totalSteps >= 28) {
    return 38;
  }

  if (totalSteps >= 20) {
    return 44;
  }

  return 54;
}

function getSlotHand(step) {
  return step % 2 === 0 ? 'R' : 'L';
}

function buildPatternView(pattern) {
  const bars = pattern.bars || 1;
  const beats = pattern.beats || 4;
  const totalSteps = bars * beats * pattern.stepsPerBeat;
  const measureLength = beats * pattern.stepsPerBeat;
  const cellWidth = getCellWidth(totalSteps);
  const ruler = Array.from({ length: totalSteps }, (_, index) => {
    const measureStep = index % measureLength;
    const beatIndex = Math.floor(measureStep / pattern.stepsPerBeat);
    const isBeat = measureStep % pattern.stepsPerBeat === 0;

    return {
      step: index,
      label: isBeat ? String(beatIndex + 1) : '',
      isBarStart: measureStep === 0,
      isBeat
    };
  });

  const tracks = pattern.tracks.map((track) => ({
    ...track,
    cells: Array.from({ length: totalSteps }, (_, index) => {
      const measureStep = index % measureLength;
      const value = track.hits[index] || 0;

      return {
        step: index,
        hit: Boolean(value),
        label: typeof value === 'string' ? value : '',
        isBarStart: measureStep === 0,
        isBeat: measureStep % pattern.stepsPerBeat === 0
      };
    })
  }));

  return {
    ...pattern,
    bars,
    beats,
    cellWidth,
    gridWidth: totalSteps * cellWidth + Math.max(0, totalSteps - 1) * 6,
    measureLength,
    ruler,
    totalSteps,
    tracks
  };
}

function buildRoutineRuntime(routine) {
  let totalBars = 0;
  let totalSteps = 0;
  const timeline = [];
  const stages = routine.stages.map((stage, stageIndex) => {
    const beats = stage.beats || routine.beats || 4;
    const bars = stage.bars || 1;
    const measureLength = beats * stage.stepsPerBeat;
    const stageSteps = bars * measureLength;
    const stageView = {
      ...stage,
      bars,
      beats,
      measureLength,
      stageIndex,
      startBar: totalBars + 1,
      startStep: totalSteps,
      totalSteps: stageSteps
    };

    for (let stageStep = 0; stageStep < stageSteps; stageStep += 1) {
      const measureStep = stageStep % measureLength;

      timeline.push({
        beat: Math.floor(measureStep / stage.stepsPerBeat),
        globalBar: totalBars + Math.floor(stageStep / measureLength) + 1,
        hand: stage.isRest ? '' : getSlotHand(stageStep),
        isBeatStart: measureStep % stage.stepsPerBeat === 0,
        isDownbeat: measureStep === 0,
        measureStep,
        stageBar: Math.floor(stageStep / measureLength) + 1,
        stageIndex,
        stageStep
      });
    }

    totalBars += bars;
    totalSteps += stageSteps;

    return stageView;
  });

  return {
    ...routine,
    stages,
    timeline,
    totalBars,
    totalSteps
  };
}

function buildRoutineView(runtime) {
  const { timeline, ...routineView } = runtime;
  return routineView;
}

const singlePatternViews = singlePatterns.map(buildPatternView);
const rhythmPatternViews = rhythmPatterns.map(buildPatternView);
const continuousRoutineRuntimeViews = continuousRoutines.map(buildRoutineRuntime);
const continuousRoutineViews = continuousRoutineRuntimeViews.map(buildRoutineView);

Page({
  data: {
    appName: APP_NAME,
    minBpm: MIN_BPM,
    maxBpm: MAX_BPM,
    bpm: 90,
    mode: 'click',
    isPlaying: false,
    currentStep: -1,
    currentBeat: -1,
    currentBar: 1,
    currentStageIndex: 0,
    currentStageName: continuousRoutineViews[0].stages[0].name,
    currentStageBar: 1,
    currentStageTotalBars: continuousRoutineViews[0].stages[0].bars,
    currentStageIsRest: false,
    routineScrollLeft: 0,
    singlePatterns: singlePatternViews,
    rhythmPatterns: rhythmPatternViews,
    exercisePatterns: singlePatternViews,
    selectedSingleIndex: 0,
    selectedRhythmIndex: 0,
    selectedExerciseIndex: 0,
    activePattern: singlePatternViews[0],
    continuousRoutines: continuousRoutineViews,
    selectedRoutineIndex: 0,
    activeRoutine: continuousRoutineViews[0],
    beatDots: Array.from({ length: 4 }, (_, index) => index),
    soundEnabled: true,
    vibrationEnabled: false,
    clickOverlay: true,
    volumeBoostEnabled: false,
    audioStatus: '待启动'
  },

  _absoluteStep: 0,
  _audioAvailable: null,
  _audioCtx: null,
  _fallbackWarned: false,
  _lookaheadMs: 120,
  _nextStepAt: 0,
  _timer: null,
  _timerIntervalMs: 24,

  onLoad() {
    this.applyExercise('single', 0, true);
    this.applyRoutine(0, true);
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

    this.resetScheduler(80);

    this.setData({
      ...this.getResetState(),
      audioStatus: audioReady ? '音频已就绪' : '使用视觉提示',
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
      ...this.getResetState(),
      isPlaying: false
    });

    if (!silent && wx.setKeepScreenOn) {
      wx.setKeepScreenOn({ keepScreenOn: false });
    }
  },

  getResetState() {
    const routine = this.data.activeRoutine || continuousRoutineViews[0];
    const stage = routine.stages[0] || {};

    return {
      currentBar: 1,
      currentBeat: -1,
      currentStep: -1,
      currentStageBar: 1,
      currentStageIndex: 0,
      currentStageIsRest: Boolean(stage.isRest),
      currentStageName: stage.name || '',
      currentStageTotalBars: stage.bars || 1,
      routineScrollLeft: 0
    };
  },

  resetScheduler(delayMs) {
    this._absoluteStep = 0;
    this._fallbackWarned = false;
    this._nextStepAt = Date.now() + (delayMs || 60);
  },

  scheduleLoop() {
    if (!this.data.isPlaying) {
      return;
    }

    const now = Date.now();
    let guard = 0;

    while (this._nextStepAt <= now + this._lookaheadMs && guard < 12) {
      const dueIn = Math.max(0, this._nextStepAt - now);
      const absoluteStep = this._absoluteStep;

      setTimeout(() => {
        if (this.data.isPlaying) {
          this.fireStep(absoluteStep);
        }
      }, dueIn);

      this._absoluteStep += 1;
      this._nextStepAt += this.getStepDuration(absoluteStep);
      guard += 1;
    }

    this._timer = setTimeout(() => this.scheduleLoop(), this._timerIntervalMs);
  },

  isExerciseMode(mode) {
    const currentMode = mode || this.data.mode;
    return currentMode === 'single' || currentMode === 'rhythm';
  },

  getStepDuration(absoluteStep) {
    const beatDuration = 60000 / this.data.bpm;

    if (this.isExerciseMode()) {
      return beatDuration / this.data.activePattern.stepsPerBeat;
    }

    if (this.data.mode === 'continuous') {
      const runtime = this.getActiveRoutineRuntime();
      const entry = this.getRoutineStep(absoluteStep || 0, runtime);
      const stage = runtime.stages[entry.stageIndex] || runtime.stages[0];

      return beatDuration / stage.stepsPerBeat;
    }

    return beatDuration;
  },

  getCycleLength() {
    if (this.isExerciseMode()) {
      return this.data.activePattern.totalSteps;
    }

    return 4;
  },

  getMeasureLength() {
    if (this.isExerciseMode()) {
      return this.data.activePattern.measureLength;
    }

    return 4;
  },

  fireStep(absoluteStep) {
    if (this.data.mode === 'continuous') {
      this.fireRoutineStep(absoluteStep);
      return;
    }

    const cycleLength = this.getCycleLength();
    const measureLength = this.getMeasureLength();
    const step = absoluteStep % cycleLength;
    const measureStep = step % measureLength;
    const beat = this.isExerciseMode()
      ? Math.floor(measureStep / this.data.activePattern.stepsPerBeat)
      : measureStep;

    this.setData({
      currentBar: Math.floor(absoluteStep / measureLength) + 1,
      currentBeat: beat,
      currentStep: this.isExerciseMode() ? step : -1
    });

    this.playStep(step, measureStep, beat);
  },

  fireRoutineStep(absoluteStep) {
    const runtime = this.getActiveRoutineRuntime();
    const entry = this.getRoutineStep(absoluteStep, runtime);
    const stage = runtime.stages[entry.stageIndex] || runtime.stages[0];
    const cycleIndex = Math.floor(absoluteStep / runtime.totalSteps);
    const stageChanged = entry.stageIndex !== this.data.currentStageIndex;
    const updates = {
      currentBar: cycleIndex * runtime.totalBars + entry.globalBar,
      currentBeat: entry.beat,
      currentStageBar: entry.stageBar,
      currentStageIndex: entry.stageIndex,
      currentStageIsRest: Boolean(stage.isRest),
      currentStageName: stage.name,
      currentStageTotalBars: stage.bars,
      currentStep: entry.stageStep
    };

    if (stageChanged) {
      updates.routineScrollLeft = this.getRoutineScrollLeft(entry.stageIndex);
    }

    this.setData(updates);

    this.playRoutineStep(entry, stage);
  },

  getRpxRatio() {
    if (typeof wx !== 'undefined' && wx.getSystemInfoSync) {
      try {
        const info = wx.getSystemInfoSync();

        if (info && info.windowWidth) {
          return info.windowWidth / 750;
        }
      } catch (error) {
        // Unit conversion falls back to 1px per rpx outside runtime.
      }
    }

    return 1;
  },

  getRoutineScrollLeft(stageIndex) {
    const routine = this.data.activeRoutine || continuousRoutineViews[0];
    const stageCount = routine.stages ? routine.stages.length : 0;

    if (!stageCount) {
      return 0;
    }

    const stageWidth = ROUTINE_STAGE_WIDTH_RPX * this.getRpxRatio();
    const stageGap = ROUTINE_STAGE_GAP_RPX * this.getRpxRatio();
    const stageSpan = stageWidth + stageGap;
    const safeIndex = Math.max(0, Math.min(stageCount - 1, stageIndex));

    return Math.round(safeIndex * stageSpan);
  },

  getActiveRoutineRuntime() {
    return continuousRoutineRuntimeViews[this.data.selectedRoutineIndex] || continuousRoutineRuntimeViews[0];
  },

  getRoutineStep(absoluteStep, runtime) {
    const activeRuntime = runtime || this.getActiveRoutineRuntime();
    const step = absoluteStep % activeRuntime.totalSteps;

    return activeRuntime.timeline[step] || activeRuntime.timeline[0];
  },

  playStep(step, measureStep, beat) {
    const sounds = [];
    const isDownbeat = measureStep === 0;

    if (this.data.mode === 'click') {
      sounds.push(isDownbeat ? 'accent' : 'tick');
    } else {
      const pattern = this.data.activePattern;
      const isBeatStart = measureStep % pattern.stepsPerBeat === 0;

      if (this.data.clickOverlay && isBeatStart) {
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
      this.vibrate(isDownbeat || beat === 0);
    }
  },

  playRoutineStep(entry, stage) {
    const sounds = [];

    if (this.data.clickOverlay && entry.isBeatStart) {
      sounds.push(entry.isDownbeat ? 'accent' : 'tick');
    }

    if (!stage.isRest) {
      sounds.push('rim');
    }

    if (this.data.soundEnabled) {
      this.playSounds(sounds);
    }

    if (this.data.vibrationEnabled && (entry.isDownbeat || sounds.length)) {
      this.vibrate(entry.isDownbeat || entry.beat === 0);
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
      // Older base libraries can expose state without resume.
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
      duration: 0.036,
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
      const volume = this.data.volumeBoostEnabled ? options.volume * 2 : options.volume;

      oscillator.type = options.type;
      this.setParam(oscillator.frequency, options.from, startAt);

      if (options.to) {
        this.rampParam(oscillator.frequency, options.to, startAt + duration);
      }

      this.setParam(gain.gain, 0.0001, startAt);
      this.rampParam(gain.gain, volume, startAt + 0.003);
      this.rampParam(gain.gain, 0.0001, startAt + duration);

      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start(startAt);
      oscillator.stop(startAt + duration + 0.02);
    } catch (error) {
      this._audioAvailable = false;
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

    this.setData({ mode });

    if (mode === 'single') {
      this.applyExercise('single', this.data.selectedSingleIndex, true);
      return;
    }

    if (mode === 'rhythm') {
      this.applyExercise('rhythm', this.data.selectedRhythmIndex, true);
      return;
    }

    if (mode === 'continuous') {
      this.applyRoutine(this.data.selectedRoutineIndex, true);
      return;
    }

    this.setData({
      ...this.getResetState(),
      beatDots: Array.from({ length: 4 }, (_, beatIndex) => beatIndex)
    });

    if (this.data.isPlaying) {
      this.resetScheduler(60);
    }
  },

  selectExercise(event) {
    const group = event.currentTarget.dataset.group || this.data.mode;
    const index = Number(event.currentTarget.dataset.index);

    this.applyExercise(group, index, true);
  },

  applyExercise(group, index, keepTempo) {
    const isRhythm = group === 'rhythm';
    const patternList = isRhythm ? rhythmPatternViews : singlePatternViews;
    const resolvedIndex = patternList[index] ? index : 0;
    const pattern = patternList[resolvedIndex];
    const updates = {
      activePattern: pattern,
      beatDots: Array.from({ length: pattern.beats }, (_, beatIndex) => beatIndex),
      bpm: keepTempo ? this.data.bpm : pattern.defaultBpm,
      currentBar: 1,
      currentBeat: -1,
      currentStep: -1,
      exercisePatterns: patternList,
      selectedExerciseIndex: resolvedIndex
    };

    if (isRhythm) {
      updates.selectedRhythmIndex = resolvedIndex;
    } else {
      updates.selectedSingleIndex = resolvedIndex;
    }

    this.setData(updates);

    if (this.data.isPlaying) {
      this.resetScheduler(60);
    }
  },

  selectRoutine(event) {
    this.applyRoutine(Number(event.currentTarget.dataset.index), true);
  },

  applyRoutine(index, keepTempo) {
    const resolvedIndex = continuousRoutineViews[index] ? index : 0;
    const routine = continuousRoutineViews[resolvedIndex];
    const firstStage = routine.stages[0] || {};

    this.setData({
      activeRoutine: routine,
      beatDots: Array.from({ length: routine.beats || 4 }, (_, beatIndex) => beatIndex),
      bpm: keepTempo ? this.data.bpm : routine.defaultBpm,
      currentBar: 1,
      currentBeat: -1,
      currentStageBar: 1,
      currentStageIndex: 0,
      currentStageIsRest: Boolean(firstStage.isRest),
      currentStageName: firstStage.name || '',
      currentStageTotalBars: firstStage.bars || 1,
      currentStep: -1,
      routineScrollLeft: 0,
      selectedRoutineIndex: resolvedIndex
    });

    if (this.data.isPlaying) {
      this.resetScheduler(60);
    }
  },

  onVolumeBoostChange(event) {
    this.setData({
      volumeBoostEnabled: event.detail.value
    });
  },

});
