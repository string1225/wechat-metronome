const { drawScore } = require('../../utils/notation');

Component({
  properties: {
    pattern: { type: Object, value: null },
    activeStep: { type: Number, value: -1 },
    muted: { type: Object, value: {} },
    large: { type: Boolean, value: false }
  },
  data: { scoreHeight: 160 },
  observers: {
    'pattern, large': function(pattern, large) {
      const scoreHeight = (pattern && pattern.stepsPerBeat > 4 ? 2 : 1) * (large ? 220 : 160);
      this.setData({ scoreHeight }, () => this.refresh());
    },
    'activeStep, muted': function() { this.paint(); }
  },
  lifetimes: {
    ready() { this._ready = true; this.refresh(); },
    detached() { this._ready = false; this._canvas = null; }
  },
  methods: {
    refresh() {
      if (!this._ready) return;
      this.createSelectorQuery().select('#score').fields({ node: true, size: true }).exec((result) => {
        if (!this._ready || !result[0] || !result[0].node) return;
        const canvas = result[0].node;
        const info = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
        const ratio = info.pixelRatio || 1;
        this._canvas = canvas;
        this._width = result[0].width;
        canvas.width = this._width * ratio;
        canvas.height = this.data.scoreHeight * ratio;
        this._context = canvas.getContext('2d');
        this._context.scale(ratio, ratio);
        this.paint();
      });
    },
    paint() {
      if (!this._canvas || !this._context) return;
      const zoom = this.data.large ? 1.3 : 1;
      this._context.save();
      this._context.scale(zoom, zoom);
      drawScore(this._context, this._width / zoom, this.data.scoreHeight / zoom, {
        pattern: this.data.pattern,
        activeStep: this.data.activeStep, muted: this.data.muted
      });
      this._context.restore();
    }
  }
});
