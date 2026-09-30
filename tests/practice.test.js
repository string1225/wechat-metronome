const test = require('node:test');
const assert = require('node:assert/strict');
const { groovePatterns, singlePatterns, rhythmPatterns, continuousRoutines, routineStagePattern } = require('../utils/patterns');
const { eventAt, routineTimeline } = require('../utils/session');
const { rhythmNotes, positions, legend, drawScore } = require('../utils/notation');
const { Transport } = require('../utils/transport');
const { DrumAudio } = require('../utils/audio');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const options = { bpm: 60, mode: 'groove', countIn: false, clickOn: true, muted: {}, loopBars: 4, pattern: groovePatterns[0] };

test('standard rock contains eight hats, kick on 1/3 and snare on 2/4', () => {
  const events = Array.from({ length: 8 }, (_, index) => eventAt(index, options));
  assert.equal(events.reduce((sum, event) => sum + event.duration, 0), 4);
  assert.deepEqual(events[0].sounds, ['accent', 'hihat', 'kick']);
  assert.deepEqual(events[2].sounds, ['tick', 'hihat', 'snare']);
  assert.deepEqual(events[4].sounds, ['tick', 'hihat', 'kick']);
  assert.deepEqual(events[6].sounds, ['tick', 'hihat', 'snare']);
  [1, 3, 5, 7].forEach((index) => assert.deepEqual(events[index].sounds, ['hihat']));
});

test('one-bar count-in does not consume practice bars; finite loop ends at boundary', () => {
  const config = { ...options, countIn: true };
  for (let index = 0; index < 4; index += 1) {
    const event = eventAt(index, config);
    assert.equal(event.countIn, index + 1); assert.equal(event.duration, 1);
    assert.equal(event.sounds.length, 1); assert.equal(event.step, -1);
  }
  assert.equal(eventAt(4, config).bar, 1);
  assert.equal(eventAt(35, config).bar, 4);
  assert.equal(eventAt(36, config).done, true);
  assert.equal(eventAt(800, { ...options, loopBars: 0 }).done, undefined);
});

test('grooves repeat without silent follow bars; muting leaves the original score intact', () => {
  const pattern = groovePatterns[0];
  const config = { ...options, pattern };
  assert.ok(eventAt(0, config).sounds.includes('kick'));
  assert.deepEqual(eventAt(8, config).sounds, ['accent', 'hihat', 'kick']);
  assert.deepEqual(eventAt(9, config).sounds, ['hihat']);
  assert.ok(eventAt(16, config).sounds.includes('kick'));
  const original = JSON.stringify(pattern);
  assert.deepEqual(eventAt(0, { ...config, muted: { kick: true } }).sounds, ['accent', 'hihat']);
  assert.equal(JSON.stringify(pattern), original);
});

test('each decomposition plays only its specified instruments', () => {
  groovePatterns.slice(1, 4).forEach((pattern) => {
    const sounds = new Set(Array.from({ length: 8 }, (_, i) => eventAt(i, { ...options, pattern, clickOn: false }).sounds).flat());
    assert.deepEqual([...sounds].sort(), pattern.parts.slice().sort());
  });
});

test('staff and legend follow the eight instruments in the user reference chart', () => {
  assert.deepEqual(positions, { kick: 1, lowTom: 3, snare: 5, midTom: 6, highTom: 7, ride: 8, hihat: 9, crash: 10 });
  assert.deepEqual(Object.fromEntries(legend().map((item) => [item.key, item.position])), {
    hihat: '上加一间', snare: '第三间', kick: '第一间', highTom: '第四间',
    midTom: '第四线', lowTom: '第二间', ride: '第五线', crash: '上加一线'
  });
});

test('basic notation accounts for all note durations and tuplets within every beat', () => {
  singlePatterns.concat(rhythmPatterns).forEach((pattern) => {
    const notes = rhythmNotes(pattern);
    for (let beat = 0; beat < 4; beat += 1) {
      assert.equal(notes.filter((note) => note.beat === beat).reduce((sum, note) => sum + note.slots, 0), pattern.stepsPerBeat);
    }
  });
  const dotted = rhythmNotes(rhythmPatterns.find((pattern) => pattern.id === 'dotted-eighth-front'));
  assert.equal(dotted[0].flags, 1); assert.equal(dotted[0].dotted, true);
  assert.equal(dotted[1].flags, 2);
  assert.equal(rhythmNotes(singlePatterns[1])[0].tuplet, 3);
});

test('all scores draw without invalid coordinates on narrow screens', () => {
  const ctx = new Proxy({}, { get(target, key) { return target[key] || ((...args) => { args.filter((arg) => typeof arg === 'number').forEach((arg) => assert.ok(Number.isFinite(arg), key)); }); } });
  singlePatterns.concat(rhythmPatterns, groovePatterns, continuousRoutines.flatMap((routine) => routine.stages.map(routineStagePattern))).forEach((pattern) => {
    drawScore(ctx, 260, pattern.stepsPerBeat > 4 ? 320 : 160, { pattern, activeStep: 0, muted: {} });
  });
});

test('continuous routine holds four beats per bar and visits the fastest stage once', () => {
  continuousRoutines.forEach((routine) => {
    assert.equal(routine.stages.filter((stage) => stage.stepsPerBeat === 8).length, 1);
    const runtime = routineTimeline(routine);
    let duration = 0;
    runtime.timeline.forEach((_, i) => { duration += eventAt(i, { ...options, mode: 'continuous', runtime }).duration; });
    assert.ok(Math.abs(duration - runtime.totalBars * 4) < 1e-8);
    assert.equal(eventAt(runtime.timeline.length, { ...options, mode: 'continuous', runtime }).bar, runtime.totalBars + 1);
  });
});

function clockHarness() {
  let now = 0;
  let id = 0;
  const timers = new Map();
  return {
    timers, clock: () => now,
    setTimer(fn, delay) { const key = ++id; timers.set(key, { fn, at: now + delay / 1000 }); return key; },
    clearTimer(key) { timers.delete(key); },
    advance(seconds) {
      const end = now + seconds;
      for (;;) {
        const entry = [...timers].sort((a, b) => a[1].at - b[1].at)[0];
        if (!entry || entry[1].at > end + 1e-10) break;
        now = entry[1].at; timers.delete(entry[0]); entry[1].fn();
      }
      now = end;
    }
  };
}

test('audio is queued before the visual callback, and stale callbacks cannot survive restart', () => {
  const clock = clockHarness(); const audio = []; const visuals = [];
  const transport = new Transport({ ...clock, eventAt: (index) => eventAt(index, options), play: (event, at) => audio.push({ event, at, queued: clock.clock() }), visual: (event) => visuals.push(event), finish() {}, cancelAudio() {} });
  transport.start();
  assert.equal(audio.length, 1); assert.equal(audio[0].at, 0.08); assert.equal(visuals.length, 0);
  const stale = [...clock.timers.values()].find((timer) => timer.at === 0.08).fn;
  transport.stop(); assert.equal(clock.timers.size, 0);
  transport.start(); stale(); assert.equal(visuals.length, 0);
  clock.advance(0.08); assert.equal(visuals.length, 1);
  transport.stop(); clock.advance(1); assert.equal(visuals.length, 1);
});

test('high-density transport schedules evenly and completes at the exact bar boundary', () => {
  const clock = clockHarness(); const timestamps = []; let finished = 0;
  const pattern = singlePatterns[6];
  const transport = new Transport({ ...clock, eventAt: (i) => eventAt(i, { ...options, mode: 'single', pattern, bpm: 220 }), play: (_, at) => timestamps.push(at), visual() {}, finish() { finished += 1; }, cancelAudio() {} });
  transport.start(); clock.advance(5);
  assert.equal(timestamps.length, 128); assert.equal(finished, 1);
  timestamps.slice(1).forEach((at, index) => assert.ok(Math.abs(at - timestamps[index] - 60 / 220 / 8) < 1e-10));
  assert.equal(clock.timers.size, 0);
});

test('drum engine starts all voices at the exact same audio timestamp and cancels sources', () => {
  const starts = []; let stops = 0;
  const audio = new DrumAudio();
  audio.context = { destination: {}, createBufferSource() { return { connect() {}, disconnect() {}, start(time) { starts.push(time); }, stop() { stops += 1; } }; }, createGain() { return { gain: {}, connect() {}, disconnect() {} }; } };
  audio.buffers = { accent: {}, hihat: {}, kick: {} };
  audio.play(['accent', 'hihat', 'kick'], 1.25, { clickVolume: 0.5, drumVolume: 0.8, boost: false });
  assert.deepEqual(starts, [1.25, 1.25, 1.25]); audio.cancel(); assert.equal(stops, 3);
});

test('kick PCM retains an audible attack above the sub-bass range without clipping', () => {
  for (const rate of [44100, 48000]) {
    const audio = new DrumAudio();
    audio.context = { sampleRate: rate, createBuffer(channels, length) {
      assert.equal(channels, 1);
      const samples = new Float32Array(length);
      return { getChannelData: () => samples };
    } };
    const kick = audio.makeBuffer('kick').getChannelData(0);
    assert.ok(kick.every((sample) => Number.isFinite(sample) && Math.abs(sample) < 1));
    // Attenuate low bass twice at 250 Hz: a regression check for a sub-only kick,
    // not a prediction of any particular phone speaker's frequency response.
    let upper = Float32Array.from(kick);
    const alpha = 1 / (1 + 2 * Math.PI * 250 / rate);
    for (let pass = 0; pass < 2; pass += 1) {
      let previous = 0; let output = 0;
      upper = upper.map((sample) => { output = alpha * (output + sample - previous); previous = sample; return output; });
    }
    const rms = Math.sqrt(upper.reduce((sum, sample) => sum + sample * sample, 0) / upper.length);
    assert.ok(rms > 0.04, 'kick must not disappear when low bass is attenuated');
    const tail = kick.slice(-Math.floor(rate * 0.02));
    assert.ok(tail.every((sample) => Math.abs(sample) < 0.01), 'kick tail should decay smoothly');
  }
});

function makePage(saved, now = Date.now) {
  let definition;
  const keptAwake = [];
  const sandbox = {
    require: (relative) => require(path.resolve(__dirname, '../pages/index', relative)),
    Page: (value) => { definition = value; },
    Date: { now },
    wx: { getStorageSync: () => saved, setStorageSync() {}, setKeepScreenOn: ({ keepScreenOn }) => keptAwake.push(keepScreenOn), getWindowInfo: () => ({ windowWidth: 375 }) }
  };
  vm.runInNewContext(fs.readFileSync(path.resolve(__dirname, '../pages/index/index.js'), 'utf8'), sandbox);
  const page = { ...definition, data: JSON.parse(JSON.stringify(definition.data)), setData(update, callback) { Object.assign(this.data, update); if (callback) callback(); } };
  page.onLoad();
  return { page, keptAwake };
}

test('page restores validated preferences and all practice modes remain selectable', () => {
  const { page } = makePage({ version: 2, mode: 'invalid', selected: { groove: 900 }, bpm: 999, profile: 'popular' });
  assert.equal(page.data.mode, 'click'); assert.equal(page.data.bpm, 220);
  assert.equal(page.data.profile, undefined);
  page.selectSection({ currentTarget: { dataset: { section: 'basics' } } });
  assert.equal(page.data.activePattern.id, 'eighth-notes');
  page.selectBasic({ currentTarget: { dataset: { mode: 'rhythm' } } });
  assert.equal(page.data.activePattern.id, 'eighth-sixteenth-pair');
  page.selectBasic({ currentTarget: { dataset: { mode: 'continuous' } } });
  assert.ok(page._runtime.timeline.length > 0);
  page.selectSection({ currentTarget: { dataset: { section: 'click' } } });
  assert.equal(page.data.mode, 'click');
});

test('legacy settings cannot restore obsolete notation; basics opens as a grid', () => {
  const { page } = makePage({ version: 2, mode: 'groove', viewMode: 'score', profile: 'academic', bpm: 72 });
  assert.equal(page.data.section, 'click');
  assert.equal(page.data.viewMode, 'grid');
  page.selectSection({ currentTarget: { dataset: { section: 'groove' } } });
  const pattern = JSON.stringify(page.data.activePattern);
  const sounds = eventAt(0, { ...page.data, pattern: page.data.activePattern, countIn: false });
  page.setData({ isPlaying: true, currentStep: 3 });
  page.selectDisplay({ currentTarget: { dataset: { display: 'score' } } });
  assert.equal(page.data.isPlaying, true); assert.equal(page.data.currentStep, 3);
  assert.equal(page.data.viewMode, 'score');
  assert.equal(JSON.stringify(page.data.activePattern), pattern);
  assert.deepEqual(eventAt(0, { ...page.data, pattern: page.data.activePattern, countIn: false }), sounds);
  page.selectSection({ currentTarget: { dataset: { section: 'basics' } } });
  assert.equal(page.data.mode, 'single'); assert.equal(page.data.viewMode, 'grid');
  assert.equal(page.data.isPlaying, false);
});

test('removed listen/play selection falls back to the standard groove', () => {
  const { page } = makePage({ version: 2, selected: { groove: 4 } });
  page.selectSection({ currentTarget: { dataset: { section: 'groove' } } });
  assert.equal(page.data.activePattern.id, 'basic-rock');
  assert.equal(page.data.library.length, 4);
});

test('continuous grid and score follow every stage, rest and loop, then reset on stop', () => {
  continuousRoutines.forEach((routine, routineIndex) => {
    const { page } = makePage({ version: 2, selected: { continuous: routineIndex } });
    page.selectSection({ currentTarget: { dataset: { section: 'basics' } } });
    page.selectBasic({ currentTarget: { dataset: { mode: 'continuous' } } });
    assert.equal(page.data.activePattern.id, routine.stages[0].id);
    assert.equal(page.data.activePattern.stepsPerBeat, 2);
    page.selectDisplay({ currentTarget: { dataset: { display: 'score' } } });
    const config = { ...options, mode: 'continuous', runtime: page._runtime };
    for (let index = 0; index <= page._runtime.timeline.length; index += 1) {
      const event = eventAt(index, config);
      page.showEvent(event);
      const stage = routine.stages[event.stageIndex];
      const pattern = page.data.activePattern;
      assert.equal(pattern.id, stage.id);
      assert.equal(pattern.stepsPerBeat, stage.stepsPerBeat);
      assert.equal(pattern.tracks[0].hits.length, stage.stepsPerBeat * 4);
      assert.equal(pattern.isRest, stage.isRest);
      assert.equal(Boolean(pattern.tracks[0].hits[event.step]), event.sounds.includes('rim'));
      assert.equal(page.data.currentStep, event.step);
    }
    const lastIndex = page._runtime.timeline.length - 1;
    page.selectDisplay({ currentTarget: { dataset: { display: 'grid' } } });
    page.showEvent(eventAt(lastIndex, config));
    assert.ok(page.data.gridScrollLeft > 0);
    page.stop();
    assert.equal(page.data.stageIndex, 0); assert.equal(page.data.currentStep, -1);
    assert.equal(page.data.activePattern.id, routine.stages[0].id);
    assert.equal(page.data.gridScrollLeft, 0);
  });
});

test('rest stage score draws a whole-bar rest and no hit noteheads', () => {
  const stage = continuousRoutines[1].stages.find((item) => item.isRest);
  const pattern = routineStagePattern(stage);
  assert.equal(rhythmNotes(pattern).length, 0);
  const rectangles = [];
  let noteheads = 0;
  const ctx = new Proxy({fillRect: (...args) => rectangles.push(args), arc: () => { noteheads += 1; }}, {get: (target, key) => target[key] || (() => {})});
  drawScore(ctx, 300, 160, { pattern, activeStep: -1 });
  assert.equal(noteheads, 0);
  assert.equal(rectangles.length, 1);
  assert.equal(rectangles[0][1], 53); // Fourth line, counted from the bottom.
});

test('tap dialog measures beats without changing tempo until explicitly applied', () => {
  let now = 1000;
  const { page } = makePage(undefined, () => now);
  page.openTap(); page.applyTap();
  assert.equal(page.data.sheet, 'tap'); assert.equal(page.data.bpm, 90);
  for (let i = 0; i < 4; i += 1) { page.tapTempo(); now += 500; }
  assert.equal(page.data.tapBpm, 120); assert.equal(page.data.tapCount, 4);
  assert.equal(page.data.bpm, 90);
  page.applyTap();
  assert.equal(page.data.bpm, 120); assert.equal(page.data.sheet, '');
  page.openTap();
  assert.equal(page.data.tapBpm, 0); assert.equal(page.data.tapCount, 0);
  page.selectTempo({ currentTarget: { dataset: { bpm: 105 } } });
  assert.equal(page.data.bpm, 105);
});

test('tap ignores double taps, resets after a pause, and rejects unsupported speeds', () => {
  let now = 1000;
  const { page } = makePage(undefined, () => now);
  page.openTap(); page.tapTempo();
  now += 80; page.tapTempo();
  assert.equal(page.data.tapCount, 1); assert.equal(page.data.tapBpm, 0);
  now = 2000; page.tapTempo();
  assert.equal(page.data.tapBpm, 60);
  now = 5000; page.tapTempo();
  assert.equal(page.data.tapCount, 1); assert.equal(page.data.tapBpm, 0);
  now += 200; page.tapTempo(); page.applyTap();
  assert.equal(page.data.tapBpm, 300); assert.equal(page.data.bpm, 90);
  assert.equal(page.data.sheet, 'tap');
  page.resetTap();
  for (let i = 0; i < 12; i += 1) { now += 600; page.tapTempo(); }
  assert.equal(page.data.tapBpm, 100); assert.equal(page.data.tapCount, 12);
  assert.equal(page._taps.length, 8);
});

test('leaving during async audio setup cannot start playback later or keep the screen awake', async () => {
  const { page, keptAwake } = makePage();
  let resume;
  page._audio.prepare = () => new Promise((resolve) => { resume = resolve; });
  const starting = page.togglePlay();
  assert.equal(page.data.isStarting, true);
  page.onHide(); resume(true); await starting;
  assert.equal(page.data.isPlaying, false); assert.equal(page.data.isStarting, false);
  assert.equal(page._transport, undefined); assert.equal(keptAwake.at(-1), false);
});
