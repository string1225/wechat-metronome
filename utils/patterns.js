const BEATS = 4;

const subdivisionSpecs = [
  {
    id: 'eighth-notes',
    name: '8分音符单击',
    shortName: '8分',
    groupLabel: '2连',
    stepsPerBeat: 2,
    defaultBpm: 96,
    countPattern: '1 & 2 & 3 & 4 &',
    description: '每拍2下，右左交替，先把手腕和脚下4分音符对齐。',
    focus: '每一拍的第1下要稳，第二下不要拖。'
  },
  {
    id: 'triplets',
    name: '三连音单击',
    shortName: '三连',
    groupLabel: '3连',
    stepsPerBeat: 3,
    defaultBpm: 82,
    countPattern: '1-trip-let',
    description: '每拍3下，练习奇数组里左右手重音轮换的稳定感。',
    focus: '不要把三连音打成前松后挤。'
  },
  {
    id: 'sixteenth-notes',
    name: '16分音符单击',
    shortName: '16分',
    groupLabel: '4连',
    stepsPerBeat: 4,
    defaultBpm: 72,
    countPattern: '1 e & a',
    description: '每拍4下，是套鼓里最常用的单击速度底盘。',
    focus: '放松手腕，音量平均，重拍只靠落点更清楚。'
  },
  {
    id: 'quintuplets',
    name: '5连音单击',
    shortName: '5连',
    groupLabel: '5连',
    stepsPerBeat: 5,
    defaultBpm: 56,
    countPattern: '1-2-3-4-5',
    description: '每拍5下，训练不规则分组下的内在时值。',
    focus: '第1下对齐拍点，后4下保持等距。'
  },
  {
    id: 'sextuplets',
    name: '6连音单击',
    shortName: '6连',
    groupLabel: '6连',
    stepsPerBeat: 6,
    defaultBpm: 52,
    countPattern: '1-trip-let-&-trip-let',
    description: '每拍6下，可以理解为两个三连音合在一拍里。',
    focus: '注意第4下不要变成隐藏重音。'
  },
  {
    id: 'septuplets',
    name: '7连音单击',
    shortName: '7连',
    groupLabel: '7连',
    stepsPerBeat: 7,
    defaultBpm: 48,
    countPattern: '1-2-3-4-5-6-7',
    description: '每拍7下，适合训练高密度下的均匀感和耐心。',
    focus: '慢速开始，先追求间隔平均，再追求速度。'
  },
  {
    id: 'thirty-second-notes',
    name: '32分音符单击',
    shortName: '32分',
    groupLabel: '8连',
    stepsPerBeat: 8,
    defaultBpm: 44,
    countPattern: '1 e & a 2 e & a',
    description: '每拍8下，相当于一拍内放进两个16分组合。',
    focus: '音量宁可小一点，也不要让后半拍糊掉。'
  }
];

function getSlotHand(step) {
  return step % 2 === 0 ? 'R' : 'L';
}

function alternatingHands(length) {
  return Array.from({ length }, (_, index) => getSlotHand(index));
}

function makeSubdivisionExercise(options) {
  const bars = options.bars || 1;
  const totalSteps = BEATS * options.stepsPerBeat * bars;

  return {
    id: options.id,
    name: options.name,
    shortName: options.shortName,
    groupLabel: options.groupLabel,
    description: options.description,
    focus: options.focus,
    defaultBpm: options.defaultBpm,
    beats: BEATS,
    bars,
    stepsPerBeat: options.stepsPerBeat,
    countPattern: options.countPattern,
    tracks: [
      {
        key: 'single-stroke',
        label: '单击',
        short: 'R/L',
        sound: 'rim',
        hits: alternatingHands(totalSteps)
      }
    ]
  };
}

function makeGridHits(options) {
  const beats = options.beats || BEATS;
  const bars = options.bars || 1;
  const stepsPerBeat = options.stepsPerBeat || 4;
  const totalSteps = beats * bars * stepsPerBeat;
  const hits = Array.from({ length: totalSteps }, () => 0);

  for (let bar = 0; bar < bars; bar += 1) {
    for (let beat = 0; beat < beats; beat += 1) {
      const beatOffset = (bar * beats + beat) * stepsPerBeat;

      options.placements.forEach((placement) => {
        hits[beatOffset + placement] = getSlotHand(placement);
      });
    }
  }

  return hits;
}

function makeDottedExercise(options) {
  const bars = 1;
  const stepsPerBeat = 4;

  return {
    id: options.id,
    name: options.name,
    shortName: options.shortName,
    groupLabel: options.groupLabel,
    description: options.description,
    focus: options.focus,
    defaultBpm: options.defaultBpm,
    beats: BEATS,
    bars,
    stepsPerBeat,
    countPattern: options.countPattern,
    tracks: [
      {
        key: 'sticking',
        label: '落点',
        short: 'RLRL',
        sound: 'rim',
        hits: makeGridHits({
          bars,
          beats: BEATS,
          stepsPerBeat,
          placements: options.placements
        })
      }
    ]
  };
}

function makeRoutine(options) {
  const order = subdivisionSpecs.concat(subdivisionSpecs.slice().reverse());
  const stages = [];

  order.forEach((spec, index) => {
    stages.push({
      id: `${options.id}-${spec.id}-${index}`,
      name: spec.shortName,
      shortName: spec.shortName,
      groupLabel: spec.groupLabel,
      stepsPerBeat: spec.stepsPerBeat,
      beats: BEATS,
      bars: 4,
      isRest: false
    });

    if (options.withRest && index < order.length - 1) {
      stages.push({
        id: `${options.id}-rest-${index}`,
        name: '空1小节',
        shortName: '空拍',
        groupLabel: '休息',
        stepsPerBeat: 1,
        beats: BEATS,
        bars: 1,
        isRest: true
      });
    }
  });

  return {
    id: options.id,
    name: options.name,
    shortName: options.shortName,
    groupLabel: options.groupLabel,
    description: options.description,
    focus: options.focus,
    defaultBpm: options.defaultBpm,
    beats: BEATS,
    stages
  };
}

const singlePatterns = subdivisionSpecs.map(makeSubdivisionExercise);

const dottedPatterns = [
  makeDottedExercise({
    id: 'dotted-eighth-front',
    name: '8分前附点',
    shortName: '前附点',
    groupLabel: '3:1',
    placements: [0, 3],
    defaultBpm: 72,
    countPattern: '1 e & a',
    description: '16分底板里第1格和第4格落槌，手感是长短。',
    focus: '第4格不要抢，下一拍的第1格要稳稳落回去。'
  }),
  makeDottedExercise({
    id: 'dotted-eighth-back',
    name: '8分后附点',
    shortName: '后附点',
    groupLabel: '1:3',
    placements: [0, 1],
    defaultBpm: 72,
    countPattern: '1 e & a',
    description: '16分底板里第1格和第2格落槌，手感是短长。',
    focus: '第2格之后保持住长音位置，别把后半拍填满。'
  }),
  makeDottedExercise({
    id: 'eighth-syncopation',
    name: '8分切分',
    shortName: '切分',
    groupLabel: '1:2:1',
    placements: [0, 1, 3],
    defaultBpm: 68,
    countPattern: '1 e & a',
    description: '第1、2、4格落槌，中间的8分音符跨过第3格。',
    focus: '切分的中间一下要撑住，别被第3格的空位带乱。'
  })
];

const continuousRoutines = [
  makeRoutine({
    id: 'up-down-straight',
    name: '8分到32分连续打',
    shortName: '连续打',
    groupLabel: '无空拍',
    defaultBpm: 60,
    description: '从8分一路加密到32分，再从32分回到8分，每种4小节。',
    focus: '换档时脚下4分不变，手上只改变每拍里的等分数量。',
    withRest: false
  }),
  makeRoutine({
    id: 'up-down-rest',
    name: '8分到32分空1小节',
    shortName: '空1小节',
    groupLabel: '带空拍',
    defaultBpm: 66,
    description: '每种4小节，中间空1小节，只保留四分参照。',
    focus: '空小节里继续数拍，下一档进入时不要重新找速度。',
    withRest: true
  })
];

module.exports = {
  continuousRoutines,
  dottedPatterns,
  singlePatterns
};
