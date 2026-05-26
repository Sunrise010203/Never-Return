/* ============================================================
 * 音效系统 — Web Audio API 合成 8-bit 风格音效
 *
 * 无需任何外部音频文件，全部用 OscillatorNode 实时合成。
 * 挂载点：window.game.audio
 * ============================================================ */

window.game = window.game || {};
window.game.audio = {
  _ctx: null,
  volume: 0.7,
  _supported: false,

  _init() {
    try {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) { this._supported = false; return; }
      this._ctx = new AC();
      this._supported = true;
    } catch (e) {
      this._supported = false;
    }
  },

  _ensureContext() {
    if (!this._ctx) this._init();
    if (!this._supported) return false;
    if (this._ctx.state === 'suspended') {
      try { this._ctx.resume(); } catch(e) {}
    }
    return true;
  },

  _playTone(freq, duration, type, gainVal) {
    if (!this._ensureContext()) return;
    try {
      var osc = this._ctx.createOscillator();
      var gain = this._ctx.createGain();
      osc.type = type || 'sine';
      osc.frequency.setValueAtTime(freq, this._ctx.currentTime);
      gain.gain.setValueAtTime((gainVal || 0.3) * Math.min(this.volume * 1.5, 1.0), this._ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this._ctx.currentTime + duration);
      osc.connect(gain);
      gain.connect(this._ctx.destination);
      osc.start();
      osc.stop(this._ctx.currentTime + duration);
    } catch(e) {}
  },

  _playSweep(startFreq, endFreq, duration, type, gainVal) {
    if (!this._ensureContext()) return;
    try {
      var osc = this._ctx.createOscillator();
      var gain = this._ctx.createGain();
      osc.type = type || 'sine';
      osc.frequency.setValueAtTime(startFreq, this._ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(endFreq, this._ctx.currentTime + duration);
      gain.gain.setValueAtTime((gainVal || 0.3) * Math.min(this.volume * 1.5, 1.0), this._ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this._ctx.currentTime + duration);
      osc.connect(gain);
      gain.connect(this._ctx.destination);
      osc.start();
      osc.stop(this._ctx.currentTime + duration);
    } catch(e) {}
  },

    /** 行走音效：短促数字点击 700Hz 方波 */
  playStep() { this._playTone(700, 0.04, "square", 0.35); },

  /** 跳跃音效：短上升音阶 240→480Hz */
  playJump() { this._playSweep(240, 480, 0.1, 'square', 0.2); },

  /** 着陆音效：短低音冲击 150Hz */
  playLand() { this._playTone(150, 0.05, 'sine', 0.25); },

  /** 死亡音效：下降滑音 400→80Hz */
  playDeath() { this._playSweep(400, 80, 0.3, 'sawtooth', 0.3); },

  /** 通关音效：上升琴音 C-E-G-C */
  playWin() {
    this._playTone(262, 0.12, 'sine', 0.25);
    var self = this;
    setTimeout(function() { self._playTone(330, 0.12, 'sine', 0.25); }, 120);
    setTimeout(function() { self._playTone(392, 0.12, 'sine', 0.25); }, 240);
    setTimeout(function() { self._playTone(523, 0.2, 'sine', 0.3); }, 360);
  },

  /** 语音指令提示音：双音 600+900Hz */
  playCommand() {
    this._playTone(600, 0.08, 'sine', 0.15);
    var self = this;
    setTimeout(function() { self._playTone(900, 0.08, 'sine', 0.15); }, 60);
  },

  // --- BGM 系统 ---

  _bgmNodes: null,
  _bgmInterval: null,

  /** ������������ — ������˷�Χ���� */
  startBGM() {
    if (!this._ensureContext()) return;
    if (this._bgmNodes) return;
    var ctx = this._ctx;
    var self = this;

    var masterGain = ctx.createGain();
    masterGain.gain.setValueAtTime(0.5 * this.volume, ctx.currentTime);
    masterGain.connect(ctx.destination);

    // 1. ���׵����� — �־ݲ� 55Hz
    var bassOsc = ctx.createOscillator();
    var bassGain = ctx.createGain();
    bassOsc.type = 'sawtooth';
    bassOsc.frequency.setValueAtTime(55, ctx.currentTime);
    bassGain.gain.setValueAtTime(0.12, ctx.currentTime);
    bassOsc.connect(bassGain);
    bassGain.connect(masterGain);
    bassOsc.start();

    // 2. ��Ƶ���� — ���ͨ�˲����־ݲ�
    var padOsc = ctx.createOscillator();
    var padGain = ctx.createGain();
    var padFilter = ctx.createBiquadFilter();
    padFilter.type = 'lowpass';
    padFilter.frequency.setValueAtTime(350, ctx.currentTime);
    padFilter.Q.setValueAtTime(2, ctx.currentTime);
    padOsc.type = 'sawtooth';
    padOsc.frequency.setValueAtTime(110, ctx.currentTime);
    padGain.gain.setValueAtTime(0.06, ctx.currentTime);
    padOsc.connect(padFilter);
    padFilter.connect(padGain);
    padGain.connect(masterGain);
    padOsc.start();

    // 3. �ͨ����Ƶ�������˲���ֹƵ��
    var lfo = ctx.createOscillator();
    var lfoGain = ctx.createGain();
    lfo.type = 'sine';
    lfo.frequency.setValueAtTime(0.2, ctx.currentTime);
    lfoGain.gain.setValueAtTime(80, ctx.currentTime);
    lfo.connect(lfoGain);
    lfoGain.connect(padFilter.frequency);
    lfo.start();

    this._bgmNodes = [
      { osc: bassOsc, gain: bassGain },
      { osc: padOsc, gain: padGain, filter: padFilter },
      { osc: lfo, gain: lfoGain },
      masterGain
    ];

    this._bgmInterval = setInterval(function() {
      try {
        masterGain.gain.setValueAtTime(0.5 * self.volume, ctx.currentTime);
      } catch(e) {}
    }, 2000);
  },

  /** ֹͣ���������� ���˳� 500ms */
  stopBGM() {
    if (!this._bgmNodes) return;
    if (this._bgmInterval) {
      clearInterval(this._bgmInterval);
      this._bgmInterval = null;
    }
    try {
      var ctx = this._ctx;
      var t = ctx.currentTime + 0.5;
      for (var i = 0; i < this._bgmNodes.length; i++) {
        var n = this._bgmNodes[i];
        if (n && n.gain) n.gain.gain.linearRampToValueAtTime(0.001, t);
      }
      var self = this;
      setTimeout(function() {
        if (!self._bgmNodes) return;
        for (var i = 0; i < self._bgmNodes.length; i++) {
          var n = self._bgmNodes[i];
          if (n && n.osc) { try { n.osc.stop(); } catch(e) {} }
          if (n && n.filter) { try { n.filter.disconnect(); } catch(e) {} }
          if (n && n.gain) { try { n.gain.disconnect(); } catch(e) {} }
        }
        self._bgmNodes = null;
      }, 600);
    } catch(e) {
      this._bgmNodes = null;
    }
  },

};
