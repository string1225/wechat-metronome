function routineTimeline(routine) {
  const timeline = [];
  let bar = 0;
  routine.stages.forEach((stage, stageIndex) => {
    for (let stageBar = 0; stageBar < stage.bars; stageBar += 1) {
      for (let step = 0; step < 4 * stage.stepsPerBeat; step += 1) {
        timeline.push({ step, bar, stageIndex, stageBar: stageBar + 1, stage });
      }
      bar += 1;
    }
  });
  return { timeline, totalBars: bar };
}

function eventAt(index, options) {
  const beatSeconds = 60 / options.bpm;
  const intro = options.countIn ? 4 : 0;
  if (index < intro) {
    return { duration: beatSeconds, sounds: [index === 0 ? 'accent' : 'tick'], beat: index, countIn: index + 1, step: -1, bar: 0, phase: '预备拍' };
  }
  const position = index - intro;
  if (options.mode === 'continuous') {
    const runtime = options.runtime;
    const entry = runtime.timeline[position % runtime.timeline.length];
    const cycle = Math.floor(position / runtime.timeline.length);
    const isBeat = entry.step % entry.stage.stepsPerBeat === 0;
    const sounds = [];
    if (options.clickOn && isBeat) sounds.push(entry.step === 0 ? 'accent' : 'tick');
    if (!entry.stage.isRest) sounds.push('rim');
    return {
      duration: beatSeconds / entry.stage.stepsPerBeat, sounds,
      beat: Math.floor(entry.step / entry.stage.stepsPerBeat), step: entry.step,
      bar: cycle * runtime.totalBars + entry.bar + 1, stageIndex: entry.stageIndex,
      stageBar: entry.stageBar, stageName: entry.stage.name, stageBars: entry.stage.bars,
      phase: entry.stage.isRest ? '空拍 · 继续数拍' : '连续换档', countIn: 0
    };
  }
  const pattern = options.pattern;
  const division = options.mode === 'click' ? 1 : pattern.stepsPerBeat;
  const measure = division * 4;
  const bar = Math.floor(position / measure);
  const step = position % measure;
  if (options.mode !== 'click' && options.loopBars && bar >= options.loopBars) return { done: true };
  const isBeat = step % division === 0;
  const follow = pattern && pattern.echo && bar % 2 === 1;
  const sounds = [];
  if ((options.mode === 'click' || options.clickOn) && isBeat) sounds.push(step === 0 ? 'accent' : 'tick');
  if (options.mode !== 'click' && !follow) {
    pattern.tracks.forEach((track) => {
      if (track.hits[step] && !options.muted[track.key]) sounds.push(track.sound);
    });
  }
  return {
    duration: beatSeconds / division, sounds, beat: Math.floor(step / division), step,
    bar: bar + 1, countIn: 0,
    phase: pattern && pattern.echo ? (follow ? '轮到你 · 跟着节拍打' : '听示范') : '跟谱练习'
  };
}

module.exports = { eventAt, routineTimeline };
