const patterns = [
  {
    id: 'quarter-clock',
    name: '四分内稳',
    description: '重音只在每小节第一拍，适合暖身和校准内心时钟。',
    focus: '脚踩四分，手上保持音量一致。',
    defaultBpm: 88,
    beats: 4,
    stepsPerBeat: 1,
    tracks: [
      {
        key: 'pulse',
        label: '重音',
        short: 'AC',
        sound: 'rim',
        hits: [1, 0, 0, 0]
      }
    ]
  },
  {
    id: 'rock-eighth',
    name: '八分摇滚',
    description: '镲片八分稳定，二四拍军鼓，底鼓落在一三拍。',
    focus: '右手像尺子，军鼓不要抢。',
    defaultBpm: 96,
    beats: 4,
    stepsPerBeat: 2,
    tracks: [
      {
        key: 'hat',
        label: '踩镲',
        short: 'HH',
        sound: 'hat',
        hits: [1, 1, 1, 1, 1, 1, 1, 1]
      },
      {
        key: 'snare',
        label: '军鼓',
        short: 'SD',
        sound: 'snare',
        hits: [0, 0, 1, 0, 0, 0, 1, 0]
      },
      {
        key: 'kick',
        label: '底鼓',
        short: 'KD',
        sound: 'kick',
        hits: [1, 0, 0, 0, 1, 0, 0, 0]
      }
    ]
  },
  {
    id: 'sixteenth-hands',
    name: '十六分手法',
    description: '单跳十六分，四分重音帮助检查落点。',
    focus: '手腕放松，重音只加速度不加紧张。',
    defaultBpm: 72,
    beats: 4,
    stepsPerBeat: 4,
    tracks: [
      {
        key: 'accent',
        label: '重音',
        short: 'AC',
        sound: 'accent',
        hits: [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0]
      },
      {
        key: 'sticking',
        label: '手序',
        short: 'RL',
        sound: 'rim',
        hits: ['R', 'L', 'R', 'L', 'R', 'L', 'R', 'L', 'R', 'L', 'R', 'L', 'R', 'L', 'R', 'L']
      }
    ]
  },
  {
    id: 'shuffle-backbeat',
    name: 'Shuffle 后拍',
    description: '三连音律动，保留第一和第三个三连音位置。',
    focus: '让跳动感来自间隔，不要把中间音补满。',
    defaultBpm: 82,
    beats: 4,
    stepsPerBeat: 3,
    tracks: [
      {
        key: 'hat',
        label: '踩镲',
        short: 'HH',
        sound: 'hat',
        hits: [1, 0, 1, 1, 0, 1, 1, 0, 1, 1, 0, 1]
      },
      {
        key: 'snare',
        label: '军鼓',
        short: 'SD',
        sound: 'snare',
        hits: [0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0]
      },
      {
        key: 'kick',
        label: '底鼓',
        short: 'KD',
        sound: 'kick',
        hits: [1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0]
      }
    ]
  },
  {
    id: 'paradiddle',
    name: 'Paradiddle',
    description: 'RLRR LRLL 循环，适合从手法过渡到套鼓分配。',
    focus: '第二个 R 和第二个 L 不要塌下去。',
    defaultBpm: 70,
    beats: 4,
    stepsPerBeat: 4,
    tracks: [
      {
        key: 'accent',
        label: '重音',
        short: 'AC',
        sound: 'accent',
        hits: [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0]
      },
      {
        key: 'sticking',
        label: '手序',
        short: 'RL',
        sound: 'rim',
        hits: ['R', 'L', 'R', 'R', 'L', 'R', 'L', 'L', 'R', 'L', 'R', 'R', 'L', 'R', 'L', 'L']
      }
    ]
  }
];

module.exports = {
  patterns
};
