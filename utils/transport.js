// Audio is scheduled ahead against currentTime; timers only drive visual updates.
// Generation tokens also invalidate callbacks that are already in the task queue.
class Transport {
  constructor(options) {
    this.clock = options.clock;
    this.eventAt = options.eventAt;
    this.play = options.play;
    this.visual = options.visual;
    this.finish = options.finish;
    this.cancelAudio = options.cancelAudio;
    this.setTimer = options.setTimer || setTimeout;
    this.clearTimer = options.clearTimer || clearTimeout;
    this.timers = new Set();
    this.generation = 0;
    this.running = false;
  }

  later(fn, delay, generation) {
    const id = this.setTimer(() => {
      this.timers.delete(id);
      if (this.running && generation === this.generation) fn();
    }, Math.max(0, delay));
    this.timers.add(id);
  }

  start() {
    this.stop();
    this.running = true;
    this.index = 0;
    this.nextAt = this.clock() + 0.08;
    this.pump(this.generation);
  }

  pump(generation) {
    if (!this.running || generation !== this.generation) return;
    const now = this.clock();
    // After a long JS stall, resume with space instead of dumping overdue notes.
    if (this.nextAt < now) this.nextAt = now + 0.02;
    let scheduled = 0;
    while (this.nextAt < now + 0.12 && scheduled < 64) {
      const event = this.eventAt(this.index);
      const at = this.nextAt;
      if (event.done) {
        this.later(() => { this.stop(); this.finish(); }, (at - now) * 1000, generation);
        return;
      }
      this.play(event, at);
      this.later(() => this.visual(event), (at - now) * 1000, generation);
      this.nextAt += event.duration;
      this.index += 1;
      scheduled += 1;
    }
    this.later(() => this.pump(generation), 25, generation);
  }

  stop() {
    this.running = false;
    this.generation += 1;
    this.timers.forEach((timer) => this.clearTimer(timer));
    this.timers.clear();
    this.cancelAudio();
  }
}

module.exports = { Transport };
