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

  /** 启动背景音乐 — 柔和的和弦进行，代替原本的刺耳嗡鸣 */
  startBGM() {
    if (!this._ensureContext()) return;
    if (this._bgmNodes) return;
    var ctx = this._ctx;
    var self = this;

    var masterGain = ctx.createGain();
    masterGain.gain.setValueAtTime(0.35 * this.volume, ctx.currentTime);
    masterGain.connect(ctx.destination);

    // 和弦进行：Am - F - C - G（温暖、宁静、略带忧郁）
    var chords = [
      { root: 220,   third: 261.63, fifth: 329.63, bass: 110 },      // Am
      { root: 174.61, third: 220,    fifth: 261.63, bass: 87.31 },    // F
      { root: 261.63, third: 329.63, fifth: 392,    bass: 130.81 },   // C
      { root: 196,    third: 246.94, fifth: 329.63, bass: 98 },       // G
    ];

    // 1. 温暖三角波垫音（根音 + 五音，经过低通滤波）
    var pad1 = ctx.createOscillator();
    var pad1Gain = ctx.createGain();
    var pad1Filter = ctx.createBiquadFilter();
    pad1Filter.type = 'lowpass';
    pad1Filter.frequency.setValueAtTime(1000, ctx.currentTime);
    pad1Filter.Q.setValueAtTime(1.5, ctx.currentTime);
    pad1.type = 'triangle';
    pad1.frequency.setValueAtTime(chords[0].root, ctx.currentTime);
    pad1Gain.gain.setValueAtTime(0.07, ctx.currentTime);
    pad1.connect(pad1Filter);
    pad1Filter.connect(pad1Gain);
    pad1Gain.connect(masterGain);
    pad1.start();

    var pad2 = ctx.createOscillator();
    var pad2Gain = ctx.createGain();
    pad2.type = 'triangle';
    pad2.frequency.setValueAtTime(chords[0].fifth, ctx.currentTime);
    pad2Gain.gain.setValueAtTime(0.05, ctx.currentTime);
    pad2.connect(pad2Gain);
    pad2Gain.connect(masterGain);
    pad2.start();

    // 2. 柔和正弦波低音
    var bass = ctx.createOscillator();
    var bassGain = ctx.createGain();
    bass.type = 'sine';
    bass.frequency.setValueAtTime(chords[0].bass, ctx.currentTime);
    bassGain.gain.setValueAtTime(0.10, ctx.currentTime);
    bass.connect(bassGain);
    bassGain.connect(masterGain);
    bass.start();

    // 3. 清脆铃声般的琶音（正弦波演奏和弦内音）
    var arp = ctx.createOscillator();
    var arpGain = ctx.createGain();
    arp.type = 'sine';
    arp.frequency.setValueAtTime(chords[0].root, ctx.currentTime);
    arpGain.gain.setValueAtTime(0.035, ctx.currentTime);
    arp.connect(arpGain);
    arpGain.connect(masterGain);
    arp.start();

    // 4. 音量低频振荡器 — 垫音缓慢呼吸效果
    var lfo = ctx.createOscillator();
    var lfoGain = ctx.createGain();
    lfo.type = 'sine';
    lfo.frequency.setValueAtTime(0.15, ctx.currentTime);
    lfoGain.gain.setValueAtTime(0.025, ctx.currentTime);
    lfo.connect(lfoGain);
    lfoGain.connect(pad1Gain.gain);
    lfoGain.connect(pad2Gain.gain);
    lfo.start();

    // 每 2.5 秒换和弦，带平滑过渡
    var chordIndex = 0;
    var arpStep = 0;
    var chordDuration = 2500;

    this._bgmInterval = setInterval(function() {
      try {
        var chord = chords[chordIndex % chords.length];
        var t = ctx.currentTime;

        // 平滑滑音到新和弦的频率
        pad1.frequency.setTargetAtTime(chord.root, t, 0.4);
        pad2.frequency.setTargetAtTime(chord.fifth, t, 0.4);
        bass.frequency.setTargetAtTime(chord.bass, t, 0.3);

        // 琶音：循环演奏和弦内音（根音 → 三音 → 五音 → 三音 → ...）
        var arpNotes = [chord.root, chord.third, chord.fifth, chord.third,
                        chord.root, chord.fifth * 2, chord.third, chord.fifth * 1.5];
        arp.frequency.setTargetAtTime(arpNotes[arpStep % arpNotes.length], t + 0.05, 0.15);
        arpStep++;

        chordIndex++;
      } catch(e) {}
    }, chordDuration);

    this._bgmNodes = {
      master: masterGain,
      pad1: { osc: pad1, gain: pad1Gain, filter: pad1Filter },
      pad2: { osc: pad2, gain: pad2Gain },
      bass: { osc: bass, gain: bassGain },
      arp: { osc: arp, gain: arpGain },
      lfo: { osc: lfo, gain: lfoGain }
    };
  },

  /** 停止背景音乐，淡出 500ms */
  stopBGM() {
    if (!this._bgmNodes) return;
    if (this._bgmInterval) {
      clearInterval(this._bgmInterval);
      this._bgmInterval = null;
    }
    try {
      var ctx = this._ctx;
      var t = ctx.currentTime + 0.5;
      var nodes = this._bgmNodes;
      // 平滑淡出所有增益节点
      if (nodes.master) nodes.master.gain.linearRampToValueAtTime(0.001, t);
      if (nodes.pad1 && nodes.pad1.gain) nodes.pad1.gain.gain.linearRampToValueAtTime(0.001, t);
      if (nodes.pad2 && nodes.pad2.gain) nodes.pad2.gain.gain.linearRampToValueAtTime(0.001, t);
      if (nodes.bass && nodes.bass.gain) nodes.bass.gain.gain.linearRampToValueAtTime(0.001, t);
      if (nodes.arp && nodes.arp.gain) nodes.arp.gain.gain.linearRampToValueAtTime(0.001, t);
      var self = this;
      setTimeout(function() {
        if (!self._bgmNodes) return;
        var n = self._bgmNodes;
        var allNodes = [n.pad1, n.pad2, n.bass, n.arp, n.lfo];
        for (var i = 0; i < allNodes.length; i++) {
          var node = allNodes[i];
          if (node && node.osc) { try { node.osc.stop(); } catch(e) {} }
          if (node && node.filter) { try { node.filter.disconnect(); } catch(e) {} }
          if (node && node.gain) { try { node.gain.disconnect(); } catch(e) {} }
        }
        if (n.master) { try { n.master.disconnect(); } catch(e) {} }
        self._bgmNodes = null;
      }, 600);
    } catch(e) {
      this._bgmNodes = null;
    }
  },

};
