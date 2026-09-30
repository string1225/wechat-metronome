const { singlePatterns, rhythmPatterns, continuousRoutines, groovePatterns } = require('../../utils/patterns');
const { DrumAudio } = require('../../utils/audio');
const { Transport } = require('../../utils/transport');
const { eventAt, routineTimeline } = require('../../utils/session');
const { legend } = require('../../utils/notation');

const STORAGE_KEY = 'drum-practice-v2';
const libraries = { groove: groovePatterns, single: singlePatterns, rhythm: rhythmPatterns };
function clamp(value, min, max, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(min, Math.min(max, Math.round(number))) : fallback;
}
function patternView(pattern) {
  const division = pattern.stepsPerBeat;
  const ruler = Array.from({ length: division * 4 }, (_, step) => ({
    step, isBeat: step % division === 0,
    label: step % division === 0 ? String(Math.floor(step / division) + 1) : division === 2 ? '&' : division === 4 ? ['1', 'e', '&', 'a'][step % 4] : '·'
  }));
  return { ...pattern, ruler, gridWidth: ruler.length * 58,
    tracks: pattern.tracks.map((track) => ({ ...track,
      gridLabel: track.key === 'hihat' ? '踩镲' : track.key === 'kick' ? '底鼓' : track.key === 'snare' ? '军鼓' : track.short,
      cells: track.hits.map((hit, step) => ({ step, hit: Boolean(hit), isBeat: step % division === 0, label: hit ? (typeof hit === 'string' ? hit : track.key === 'hihat' ? '×' : '●') : '·' }))
    }))
  };
}

Page({
  data: {
    section: 'click', mode: 'click', bpm: 90, isPlaying: false, isStarting: false,
    currentStep: -1, currentBeat: -1, currentBar: 1, countInNum: 0, phase: '待开始',
    beats: [1, 2, 3, 4], selected: { groove: 0, single: 0, rhythm: 0, continuous: 0 },
    activePattern: patternView(groovePatterns[0]),
    library: groovePatterns, activeRoutine: continuousRoutines[0],
    stageIndex: 0, stageBar: 1, stageBars: 4, stageName: '8分', nextStageName: '三连',
    legend: legend(), viewMode: 'grid',
    loopBars: 8, loopChoices: [4, 8, 16, 0], countIn: true, clickOn: true,
    drumVolume: 80, clickVolume: 55, boost: false, muted: {},
    sheet: '', gridScrollLeft: 0, audioStatus: '', audioUnavailable: false,
    tempoPresets: [60, 90, 105, 120], tapBpm: 0, tapCount: 0,
    basics: [{ id: 'single', name: '单击细分' }, { id: 'rhythm', name: '节奏组合' }, { id: 'continuous', name: '连续换档' }]
  },
  onLoad() {
    this._audio = new DrumAudio();
    this._startToken = 0;
    let saved;
    try { saved = wx.getStorageSync(STORAGE_KEY); } catch (error) { /* Storage is optional. */ }
    if (saved && saved.version === 2) {
      const selected = { ...this.data.selected };
      Object.keys(selected).forEach((key) => {
        const length = key === 'continuous' ? continuousRoutines.length : libraries[key].length;
        const index = saved.selected && saved.selected[key];
        selected[key] = Number.isInteger(index) && index >= 0 && index < length ? index : 0;
      });
      this.setData({ selected,
        bpm: clamp(saved.bpm, 40, 220, 90),
        loopBars: [0, 4, 8, 16].indexOf(saved.loopBars) >= 0 ? saved.loopBars : 8,
        countIn: saved.countIn !== false, clickOn: saved.clickOn !== false,
        drumVolume: clamp(saved.drumVolume, 0, 100, 80), clickVolume: clamp(saved.clickVolume, 0, 100, 55),
        boost: Boolean(saved.boost)
      });
    }
    this.applyMode();
  },
  onHide() { this.stop(); },
  onUnload() { this.stop(); this._audio.close(); },
  onResize() { this.refreshScore(); },
  refreshScore() { const component = this.selectComponent('#drum-score'); if (component) component.refresh(); },
  save() {
    const d = this.data;
    try { wx.setStorageSync(STORAGE_KEY, {
      version: 2, selected: d.selected, bpm: d.bpm,
      loopBars: d.loopBars, countIn: d.countIn, clickOn: d.clickOn, drumVolume: d.drumVolume,
      clickVolume: d.clickVolume, boost: d.boost
    }); } catch (error) { /* Practice remains usable without storage. */ }
  },
  applyMode() {
    const mode = this.data.mode;
    const routine = continuousRoutines[this.data.selected.continuous];
    const list = libraries[mode] || groovePatterns;
    const index = this.data.selected[mode] || 0;
    this._runtime = routineTimeline(routine);
    this.setData({ activePattern: patternView(list[index] || list[0]), activeRoutine: routine,
      library: mode === 'continuous' ? continuousRoutines : list,
      stageIndex: 0, stageBar: 1, stageBars: routine.stages[0].bars,
      stageName: routine.stages[0].name, nextStageName: routine.stages[1].name,
      muted: {}, gridScrollLeft: 0
    });
    this.save();
  },
  selectSection(event) {
    const section = event.currentTarget.dataset.section;
    if (section === this.data.section) return;
    this.stop();
    this.setData({ section, mode: section === 'basics' ? 'single' : section, viewMode: section === 'basics' ? 'grid' : this.data.viewMode });
    this.applyMode();
  },
  selectBasic(event) { this.stop(); this.setData({ mode: event.currentTarget.dataset.mode }); this.applyMode(); },
  selectExercise(event) {
    const index = Number(event.currentTarget.dataset.index);
    if (!this.data.library[index]) return;
    this.stop(); this.setData({ selected: { ...this.data.selected, [this.data.mode]: index }, sheet: '' }); this.applyMode();
  },
  async togglePlay() {
    if (this.data.isPlaying || this.data.isStarting) { this.stop(); return; }
    const token = ++this._startToken;
    this.setData({ isStarting: true, phase: '正在准备声音' });
    const ready = await this._audio.prepare();
    if (token !== this._startToken) return;
    this.setData({ isStarting: false, isPlaying: true, currentBar: 1, audioUnavailable: !ready, audioStatus: ready ? '' : '此环境暂不支持声音，当前仅显示拍点。请用真机预览。' });
    this._transport = new Transport({
      clock: () => ready ? this._audio.context.currentTime : Date.now() / 1000,
      eventAt: (index) => eventAt(index, { ...this.data, pattern: this.data.activePattern, runtime: this._runtime }),
      play: (event, at) => {
        if (!ready) return;
        try {
          this._audio.play(event.sounds, at, { clickVolume: this.data.clickVolume / 100, drumVolume: this.data.drumVolume / 100, boost: this.data.boost });
        } catch (error) {
          this.setData({ audioUnavailable: true, audioStatus: '声音播放异常，请停止后重新开始。' });
        }
      },
      visual: (event) => this.showEvent(event), cancelAudio: () => this._audio.cancel(),
      finish: () => {
        this.setData({ isPlaying: false, currentStep: -1, currentBeat: -1, phase: '已完成 ' + this.data.loopBars + ' 小节' });
        this.keepScreen(false);
      }
    });
    this.keepScreen(true); this._transport.start();
  },
  showEvent(event) {
    const updates = { currentStep: event.step, currentBeat: event.beat, currentBar: event.bar || 1, countInNum: event.countIn, phase: event.phase };
    if (event.stageIndex !== undefined) {
      const stages = this.data.activeRoutine.stages;
      updates.stageIndex = event.stageIndex; updates.stageBar = event.stageBar;
      updates.stageBars = event.stageBars; updates.stageName = event.stageName;
      updates.nextStageName = stages[(event.stageIndex + 1) % stages.length].name;
    }
    if (event.step >= 0 && this.data.viewMode === 'grid') {
      const info = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
      updates.gridScrollLeft = Math.max(0, (event.step - 3) * 58 * info.windowWidth / 750);
    }
    this.setData(updates);
  },
  keepScreen(keepScreenOn) { if (wx.setKeepScreenOn) wx.setKeepScreenOn({ keepScreenOn }); },
  stop() {
    this._startToken += 1;
    if (this._transport) this._transport.stop();
    this.setData({ isStarting: false, isPlaying: false, currentStep: -1, currentBeat: -1, countInNum: 0, phase: '待开始' });
    this.keepScreen(false);
  },
  changeBpm(event) { this.setTempo(this.data.bpm + Number(event.currentTarget.dataset.step)); },
  selectTempo(event) { this.setTempo(event.currentTarget.dataset.bpm); },
  tempoInput(event) { this.setTempo(event.detail.value); },
  setTempo(value) { this.setData({ bpm: clamp(value, 40, 220, 60) }); this.save(); },
  useSuggestedTempo() { this.setTempo(this.data.mode === 'continuous' ? this.data.activeRoutine.defaultBpm : this.data.activePattern.defaultBpm); },
  openTap() { this.resetTap(); this.setData({ sheet: 'tap' }); },
  resetTap() { this._taps = []; this.setData({ tapBpm: 0, tapCount: 0 }); },
  tapTempo() {
    const now = Date.now();
    const taps = this._taps || [];
    const gap = taps.length ? now - taps[taps.length - 1] : 0;
    if (taps.length && gap >= 0 && gap < 150) return; // Ignore accidental double taps.
    if (gap > 2500 || gap < 0) this.resetTap();
    this._taps = this._taps || [];
    this._taps.push(now);
    if (this._taps.length > 8) this._taps.shift();
    const intervals = this._taps.length - 1;
    const tapBpm = intervals ? Math.round(60000 * intervals / (now - this._taps[0])) : 0;
    this.setData({ tapBpm, tapCount: this.data.tapCount + 1 });
  },
  applyTap() {
    if (this.data.tapCount < 2 || this.data.tapBpm < 40 || this.data.tapBpm > 220) return;
    this.setTempo(this.data.tapBpm); this.closeSheet();
  },
  selectDisplay(event) {
    const display = event.currentTarget.dataset.display;
    if (display !== 'grid' && display !== 'score') return;
    this.setData({ viewMode: display });
  },
  selectLoop(event) { this.stop(); this.setData({ loopBars: Number(event.currentTarget.dataset.bars) }); this.save(); },
  toggleTrack(event) { const key = event.currentTarget.dataset.key; this.setData({ muted: { ...this.data.muted, [key]: !this.data.muted[key] } }); },
  openSheet(event) { this.setData({ sheet: event.currentTarget.dataset.sheet }); },
  closeSheet() { this.setData({ sheet: '' }); },
  noop() {},
  changeSetting(event) {
    const key = event.currentTarget.dataset.key;
    if (['countIn', 'clickOn', 'boost'].indexOf(key) < 0) return;
    if (key === 'countIn') this.stop(); this.setData({ [key]: event.detail.value }); this.save();
  },
  changeVolume(event) {
    const key = event.currentTarget.dataset.key;
    if (key !== 'drumVolume' && key !== 'clickVolume') return;
    this.setData({ [key]: clamp(event.detail.value, 0, 100, 70) }); this.save();
  },
  onShareAppMessage() { return { title: '一起练鼓 · 从动次打次开始', path: '/pages/index/index' }; }
});
