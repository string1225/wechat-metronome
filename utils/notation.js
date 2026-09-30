// Staff positions count upwards from the bottom line in half-space units.
// Fixed to the user's reference chart (2026-09-30); no school-specific presets.
const instruments = [
  { key: 'hihat', label: '踩镲', head: 'cross' },
  { key: 'snare', label: '军鼓', head: 'oval' },
  { key: 'kick', label: '底鼓', head: 'oval' },
  { key: 'highTom', label: '一桶鼓', head: 'oval' },
  { key: 'midTom', label: '二桶鼓', head: 'oval' },
  { key: 'lowTom', label: '三桶鼓', head: 'oval' },
  { key: 'ride', label: '叮叮镲', head: 'cross' },
  { key: 'crash', label: '强音镲', head: 'cross' }
];

const positions = Object.freeze({ kick: 1, lowTom: 3, snare: 5, midTom: 6, highTom: 7, ride: 8, hihat: 9, crash: 10 });

function positionLabel(position) {
  if (position === -1) return '下加一间';
  if (position === 9) return '上加一间';
  if (position === 10) return '上加一线';
  const numerals = ['一', '二', '三', '四', '五'];
  return '第' + numerals[Math.floor(position / 2)] + (position % 2 ? '间' : '线');
}

function legend() {
  return instruments.map((instrument) => ({
    ...instrument, symbol: instrument.head.indexOf('cross') === 0 ? '×' : '●',
    position: positionLabel(positions[instrument.key])
  }));
}

function rhythmNotes(pattern) {
  const hits = pattern.tracks[0].hits;
  const division = pattern.stepsPerBeat;
  const notes = [];
  for (let beat = 0; beat < 4; beat += 1) {
    const start = beat * division;
    const positions = [];
    for (let offset = 0; offset < division; offset += 1) {
      if (hits[start + offset]) positions.push(offset);
    }
    positions.forEach((offset, index) => {
      const slots = (positions[index + 1] === undefined ? division : positions[index + 1]) - offset;
      const tuplet = [3, 5, 6, 7].indexOf(division) >= 0;
      const denominator = tuplet ? (division === 3 ? 8 : 16) : division * 4 / slots;
      const dotted = !tuplet && division === 4 && slots === 3;
      const flags = dotted ? 1 : Math.max(0, Math.round(Math.log(denominator / 4) / Math.log(2)));
      notes.push({ step: start + offset, beat, slots, flags, dotted, tuplet: tuplet ? division : 0, hand: hits[start + offset] });
    });
  }
  return notes;
}

function line(ctx, x1, y1, x2, y2, color, width) {
  ctx.strokeStyle = color || '#343b36';
  ctx.lineWidth = width || 1;
  ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
}

function head(ctx, x, y, cross, color) {
  if (cross) {
    line(ctx, x - 3.5, y - 3.5, x + 3.5, y + 3.5, color, 1.6);
    line(ctx, x - 3.5, y + 3.5, x + 3.5, y - 3.5, color, 1.6);
  } else {
    ctx.fillStyle = color;
    ctx.save(); ctx.translate(x, y); ctx.rotate(-0.35); ctx.scale(1.4, 0.9);
    ctx.beginPath(); ctx.arc(0, 0, 3.2, 0, 2 * Math.PI); ctx.fill(); ctx.restore();
  }
}

function rest(ctx, x, y) {
  // Quarter rest drawn as a path so rendering does not depend on a music font.
  ctx.strokeStyle = '#9aa49d'; ctx.lineWidth = 2.2;
  ctx.beginPath(); ctx.moveTo(x - 2, y - 8); ctx.lineTo(x + 3, y - 3);
  ctx.lineTo(x - 2, y + 2); ctx.lineTo(x + 2, y + 6);
  ctx.bezierCurveTo(x - 6, y + 2, x - 5, y + 9, x, y + 10); ctx.stroke();
}

function drawScore(ctx, width, height, options) {
  const pattern = options.pattern;
  if (!pattern || !pattern.tracks) return;
  const division = pattern.stepsPerBeat;
  const groove = pattern.tracks.some((track) => track.key === 'hihat');
  const rows = division > 4 ? 2 : 1;
  const beatsPerRow = 4 / rows;
  const rowHeight = height / rows;
  const left = 42;
  const usable = width - left - 18;
  const stepWidth = usable / (beatsPerRow * division);
  const ink = '#202c28';
  ctx.clearRect(0, 0, width, height);
  ctx.textAlign = 'center';
  ctx.font = '11px sans-serif';
  const tracks = {};
  pattern.tracks.forEach((track) => { tracks[track.key] = track; });
  for (let row = 0; row < rows; row += 1) {
    const top = row * rowHeight + 43;
    const bottom = top + 40;
    const firstStep = row * beatsPerRow * division;
    const yAt = (key) => bottom - positions[key] * 5;
    const xAt = (step) => left + (step - firstStep + 0.35) * stepWidth;
    if (options.activeStep >= firstStep && options.activeStep < firstStep + beatsPerRow * division) {
      ctx.fillStyle = '#fce7df';
      ctx.fillRect(xAt(options.activeStep) - Math.min(12, stepWidth * 0.45), top - 24, Math.min(24, stepWidth * 0.9), 110);
    }
    for (let staffLine = 0; staffLine < 5; staffLine += 1) {
      line(ctx, 6, top + staffLine * 10, width - 6, top + staffLine * 10, '#b4bdb4', 0.8);
    }
    if (row === 0) {
      line(ctx, 12, top + 12, 12, top + 29, ink, 3);
      line(ctx, 19, top + 12, 19, top + 29, ink, 3);
      ctx.fillStyle = ink; ctx.font = 'bold 16px serif';
      ctx.fillText('4', 31, top + 17); ctx.fillText('4', 31, top + 34);
    }
    if (row === rows - 1) {
      line(ctx, width - 10, top, width - 10, bottom, ink, 1);
      line(ctx, width - 6, top, width - 6, bottom, ink, 2);
    }
    ctx.font = '11px sans-serif';
    for (let offset = 0; offset < beatsPerRow * division; offset += 1) {
      const step = firstStep + offset;
      const x = xAt(step);
      const beat = Math.floor(step / division);
      ctx.fillStyle = offset % division === 0 ? ink : '#8b968e';
      if (offset % division === 0 || division === 2) ctx.fillText(offset % division === 0 ? String(beat + 1) : '&', x, bottom + 44);
      if (groove) {
        const color = (key) => options.muted && options.muted[key] ? '#b8c0b9' : options.activeStep === step ? '#c64b38' : ink;
        const beamY = top - 20;
        ['hihat', 'snare'].forEach((key) => {
          if (!tracks[key] || !tracks[key].hits[step]) return;
          head(ctx, x, yAt(key), key === 'hihat', color(key));
          line(ctx, x + 4, yAt(key), x + 4, beamY, color(key), 1.3);
        });
        if (offset % 2 === 0) line(ctx, x + 4, beamY, xAt(step + 1) + 4, beamY, color('hihat'), 3);
        if (tracks.kick && step % division === 0) {
          if (tracks.kick.hits[step]) {
            head(ctx, x, yAt('kick'), false, color('kick'));
            line(ctx, x - 4, yAt('kick'), x - 4, bottom + 27, color('kick'), 1.3);
          } else rest(ctx, x, bottom + 15);
        }
        if (pattern.syllables && pattern.syllables[step]) {
          ctx.fillStyle = options.activeStep === step ? '#c64b38' : '#647268';
          ctx.fillText(pattern.syllables[step], x, bottom + 63);
        }
      }
    }
    if (!groove) {
      const notes = rhythmNotes(pattern).filter((note) => note.step >= firstStep && note.step < firstStep + beatsPerRow * division);
      const beamY = top - 12;
      const y = yAt('snare');
      notes.forEach((note) => {
        const x = xAt(note.step);
        const color = options.activeStep === note.step ? '#c64b38' : ink;
        head(ctx, x, y, false, color);
        line(ctx, x + 4, y, x + 4, beamY, color, 1.3);
        if (note.dotted) { ctx.fillStyle = color; ctx.beginPath(); ctx.arc(x + 9, y - 2, 1.6, 0, Math.PI * 2); ctx.fill(); }
        ctx.fillStyle = '#647268'; ctx.fillText(note.hand, x, bottom + 63);
      });
      for (let beat = row * beatsPerRow; beat < (row + 1) * beatsPerRow; beat += 1) {
        const group = notes.filter((note) => note.beat === beat);
        group.forEach((note, index) => {
          for (let level = 1; level <= note.flags; level += 1) {
            const next = group[index + 1];
            const previous = group[index - 1];
            const x = xAt(note.step) + 4;
            const beam = beamY + (level - 1) * 5;
            if (next && next.flags >= level) line(ctx, x, beam, xAt(next.step) + 4, beam, ink, 3);
            else if (!previous || previous.flags < level) {
              const direction = next ? 1 : -1;
              line(ctx, x, beam, x + direction * Math.min(8, stepWidth * 0.45), beam, ink, 3);
            }
          }
        });
        if (group[0] && group[0].tuplet) {
          ctx.fillStyle = ink;
          ctx.fillText(String(group[0].tuplet), (xAt(group[0].step) + xAt(group[group.length - 1].step)) / 2, beamY - 7);
        }
      }
    }
  }
}

module.exports = { positions, legend, positionLabel, rhythmNotes, drawScore };
