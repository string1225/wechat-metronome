const test = require('node:test');
const assert = require('node:assert/strict');
const { groovePatterns, singlePatterns, rhythmPatterns, continuousRoutines } = require('../utils/patterns');
const { eventAt, routineTimeline } = require('../utils/session');
const { rhythmNotes, profiles, legend, drawScore } = require('../utils/notation');
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

test('listen/play alternates complete bars; muting leaves the original score intact', () => {
  const pattern = groovePatterns.find((item) => item.echo);
  const config = { ...options, pattern };
  assert.ok(eventAt(0, config).sounds.includes('kick'));
  assert.deepEqual(eventAt(8, config).sounds, ['accent']);
  assert.deepEqual(eventAt(9, config).sounds, []);
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

test('notation profiles cover every legend entry without changing the played rhythm', () => {
  assert.notEqual(profiles.academic.positions.kick, profiles.popular.positions.kick);
  assert.notEqual(profiles.academic.positions.snare, profiles.popular.positions.snare);
  assert.notEqual(profiles.academic.positions.hihat, profiles.popular.positions.hihat);
  for (const profile of Object.keys(profiles)) {
    assert.equal(legend(profile).length, 10);
    legend(profile).forEach((item) => assert.ok(!item.position.includes('undefined')));
  }
  assert.deepEqual(eventAt(0, { ...options, profile: 'academic' }), eventAt(0, { ...options, profile: 'popular' }));
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

test('all scores draw without invalid coordinates in both mappings and narrow screens', () => {
  const ctx = new Proxy({}, { get(target, key) { return target[key] || ((...args) => { args.filter((arg) => typeof arg === 'number').forEach((arg) => assert.ok(Number.isFinite(arg), key)); }); } });
  singlePatterns.concat(rhythmPatterns, groovePatterns).forEach((pattern) => {
    ['academic', 'popular'].forEach((profile) => drawScore(ctx, 260, pattern.stepsPerBeat > 4 ? 320 : 160, { pattern, profile, activeStep: 0, muted: {} }));
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

function makePage(saved) {
  let definition;
  const keptAwake = [];
  const sandbox = {
    require: (relative) => require(path.resolve(__dirname, '../pages/index', relative)),
    Page: (value) => { definition = value; },
    wx: { getStorageSync: () => saved, setStorageSync() {}, setKeepScreenOn: ({ keepScreenOn }) => keptAwake.push(keepScreenOn), getWindowInfo: () => ({ windowWidth: 375 }) }
  };
  vm.runInNewContext(fs.readFileSync(path.resolve(__dirname, '../pages/index/index.js'), 'utf8'), sandbox);
  const page = { ...definition, data: JSON.parse(JSON.stringify(definition.data)), setData(update, callback) { Object.assign(this.data, update); if (callback) callback(); } };
  page.onLoad();
  return { page, keptAwake };
}

test('page restores validated preferences and all practice modes remain selectable', () => {
  const { page } = makePage({ version: 2, mode: 'invalid', selected: { groove: 900 }, bpm: 999, profile: 'popular' });
  assert.equal(page.data.mode, 'groove'); assert.equal(page.data.bpm, 220);
  assert.equal(page.data.profile, 'popular');
  page.selectSection({ currentTarget: { dataset: { section: 'basics' } } });
  assert.equal(page.data.activePattern.id, 'eighth-notes');
  page.selectBasic({ currentTarget: { dataset: { mode: 'rhythm' } } });
  assert.equal(page.data.activePattern.id, 'eighth-sixteenth-pair');
  page.selectBasic({ currentTarget: { dataset: { mode: 'continuous' } } });
  assert.ok(page._runtime.timeline.length > 0);
  page.selectSection({ currentTarget: { dataset: { section: 'click' } } });
  assert.equal(page.data.mode, 'click');
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
