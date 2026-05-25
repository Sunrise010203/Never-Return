/* ============================================================
 * 语音指挥系统 -- 实时语音识别 + 音量分析
 * 增强版：防权限循环、指令去重、VAD噪音过滤、频域分析
 *
 * 挂载点：window.game.voiceControl
 * ============================================================ */

window.game.voiceControl = {
  isListening: false,
  supported: false,
  currentCommand: '',
  interimText: '',
  _recognition: null,
  _autoRestart: false,
  _restartTimeout: null,
  _rebuildAttempts: 0,
  _maxRebuildAttempts: 3,
  _starting: false,
  _rebuilding: false,
  _lastResultTime: 0,
  _watchdogInterval: null,
  _generation: 0,
  onInterimUpdate: null,
  _lastSentText: '',
  _lastSentTime: 0,
  _sendCooldown: 2000,
  _textStabilitySamples: [],
  _textStabilityRequired: 2,
  _textStabilityInterval: 300,
  _noiseState: 'silence',
  _pendingMicRequest: false,
  _silenceTimer: null,
  _silenceTimeout: 300,
  _silenceCheckText: '',
  _onCommandComplete: null,
  volume: 0,
  lockedPeakVolume: 0.6,
  _lastPeakAtSpeech: 0.6,
  _audioContext: null,
  _analyser: null,
  _mediaStream: null,
  _animationId: null,
  _frequencyData: null,
  _vad: { model: null, supported: false, speechProbability: 0, isSpeech: false, loadingState: 'idle' },
  _vadInitTimeout: 5000,
  processingStage: 'idle',

  getVolume() { return this.volume; },
  getPeakVolume() { return this.lockedPeakVolume; },
  getVolumeLevel() {
    const v = this.lockedPeakVolume;
    if (v < 0.15) return 'quiet';
    if (v < 0.3) return 'low';
    if (v < 0.55) return 'normal';
    if (v < 0.75) return 'loud';
    return 'very_loud';
  },

  _startVolumeAnalysis() {
    if (this._pendingMicRequest) { console.log('[音量] 麦克风请求正在进行中，跳过'); return; }
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) { console.log('[音量] 不支持 Web Audio API'); return; }
      this._audioContext = new AudioContext();
      this._pendingMicRequest = true;
      navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
      }).then((stream) => {
        this._pendingMicRequest = false;
        this._mediaStream = stream;
        const source = this._audioContext.createMediaStreamSource(stream);
        this._analyser = this._audioContext.createAnalyser();
        this._analyser.fftSize = 256;
        this._frequencyData = new Uint8Array(this._analyser.frequencyBinCount);
        source.connect(this._analyser);
        this._analyzeVolume();
      }).catch((err) => {
        this._pendingMicRequest = false;
        console.log('[音量] 麦克风访问被拒绝:', err.message);
      });
    } catch (err) { console.log('[音量] 启动失败:', err.message); }
  },

  _stopVolumeAnalysis() {
    if (this._animationId) { cancelAnimationFrame(this._animationId); this._animationId = null; }
    if (this._mediaStream) { this._mediaStream.getTracks().forEach(t => t.stop()); this._mediaStream = null; }
    this._pendingMicRequest = false;
    if (this._audioContext) { this._audioContext.close().catch(() => {}); this._audioContext = null; }
    this._analyser = null;
    this._frequencyData = null;
    this.volume = 0;
  },

  _analyzeVolume() {
    if (!this._analyser || !this.isListening) {
      if (!this.isListening) this._noiseState = 'silence';
      return;
    }
    var self = this;
    this._animationId = requestAnimationFrame(function() { self._analyzeVolume(); });
    this._analyser.getByteTimeDomainData(this._frequencyData);
    var sumSquares = 0;
    for (var i = 0; i < this._frequencyData.length; i++) {
      var normalized = (this._frequencyData[i] - 128) / 128;
      sumSquares += normalized * normalized;
    }
    var rms = Math.sqrt(sumSquares / this._frequencyData.length);
    this.volume = Math.min(1, Math.max(0, rms * 3));
    this._classifyNoise();
    if (typeof this._logCounter === 'undefined') this._logCounter = 0;
    this._logCounter++;
    if (this._logCounter % 30 === 0 && this.volume > 0.05) {
      console.log('[音量] 实时 vol=' + this.volume.toFixed(3) + ' peak=' + this._lastPeakAtSpeech.toFixed(3));
    }
    if (this.volume > this._lastPeakAtSpeech) this._lastPeakAtSpeech = this.volume;
    this._updateUI();
  },

  _classifyNoise() {
    if (this._vad.loadingState === 'ready') {
      if (this._vad.isSpeech) this._noiseState = 'speech';
      else if (this.volume > 0.05) this._noiseState = 'noise';
      else this._noiseState = 'silence';
      return;
    }
    if (!this._analyser || !this._frequencyData) return;
    this._analyser.getByteFrequencyData(this._frequencyData);
    var binCount = this._analyser.frequencyBinCount;
    var sampleRate = this._audioContext ? this._audioContext.sampleRate : 44100;
    var freqPerBin = sampleRate / (2 * binCount);
    var lowFreqEnergy = 0, midFreqEnergy = 0, totalEnergy = 0, lowCount = 0, midCount = 0;
    for (var i = 0; i < binCount; i++) {
      var freq = i * freqPerBin;
      var val = this._frequencyData[i] / 255;
      totalEnergy += val;
      if (freq < 300) { lowFreqEnergy += val; lowCount++; }
      else if (freq >= 300 && freq <= 3400) { midFreqEnergy += val; midCount++; }
    }
    var lowRatio = lowCount > 0 ? lowFreqEnergy / (totalEnergy || 1) : 0;
    var midRatio = midCount > 0 ? midFreqEnergy / (totalEnergy || 1) : 0;
    // VAD 失败时收紧阈值，降低误杀率
    var isDegraded = this._vad.loadingState === 'error';
    var lowThreshold = isDegraded ? 0.7 : 0.6;
    var midThreshold = isDegraded ? 0.25 : 0.3;

    if (this.volume < 0.05) this._noiseState = 'silence';
    else if (lowRatio > lowThreshold && midRatio < 0.15) this._noiseState = 'noise';
    else if (midRatio > midThreshold && this.volume > 0.1) this._noiseState = 'speech';
    else if (this.volume > 0.2) this._noiseState = 'speech';
    else this._noiseState = 'noise';
  },

  _vadGate(text) {
    if (!text || !text.trim()) return true;
    if (this._vad.loadingState === 'ready') {
      if (!this._vad.isSpeech) { console.log('[VAD] 噪音拦截:', text, 'prob:', this._vad.speechProbability.toFixed(3)); return false; }
      return true;
    }
    if (this._noiseState === 'noise') { console.log('[VAD/降级] 噪音拦截（频域分析）:', text); return false; }
    return true;
  },

  _initVAD() {
    var self = this;
    if (this._vad.loadingState !== 'idle') return;
    this._vad.loadingState = 'loading';
    var timeoutId = setTimeout(function() {
      if (self._vad.loadingState === 'loading') { self._vad.loadingState = 'error';
        if (self.processingStage === 'idle') self.processingStage = 'degraded'; console.log('[VAD] 加载超时，降级到频域分析'); }
    }, this._vadInitTimeout);
    var script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/@ricky0123/vad-web@0.0.17/dist/vad.web.js';
    script.onload = function() {
      if (typeof vad === 'undefined' && typeof window.vad === 'undefined') {
        console.log('[VAD] 库加载完成但未暴露全局变量，重试中...');
        setTimeout(function() { self._initVADModel(timeoutId); }, 500);
        return;
      }
      self._initVADModel(timeoutId);
    };
    script.onerror = function() { clearTimeout(timeoutId); self._vad.loadingState = 'error';
        if (self.processingStage === 'idle') self.processingStage = 'degraded'; console.log('[VAD] 库加载失败，降级到频域分析'); };
    document.head.appendChild(script);
  },

  _initVADModel(timeoutId) {
    var self = this;
    clearTimeout(timeoutId);
    try {
      var VadClass = window.vad || window.VAD;
      if (!VadClass && typeof vad !== 'undefined') VadClass = vad;
      if (typeof VadClass === 'function' || typeof VadClass === 'object') {
        var vadPromise = null;
        var opts = {
          onSpeech: function() { self._vad.isSpeech = true; self._vad.speechProbability = 0.9; },
          onNoise: function() { self._vad.isSpeech = false; self._vad.speechProbability = 0.1; },
          onVAD: function(prob) { self._vad.speechProbability = prob; self._vad.isSpeech = prob > 0.5; }
        };
        if (typeof VadClass.create === 'function') vadPromise = VadClass.create(opts);
        else if (typeof VadClass.default === 'function') vadPromise = VadClass.default(opts);
        else if (typeof VadClass === 'function') vadPromise = new VadClass(opts);
        if (vadPromise && typeof vadPromise.then === 'function') {
          vadPromise.then(function(model) {
            self._vad.model = model; self._vad.loadingState = 'ready'; self._vad.supported = true;
            console.log('[VAD] Silero VAD 加载成功');
          }).catch(function(err) { self._vad.loadingState = 'error';
        if (self.processingStage === 'idle') self.processingStage = 'degraded'; console.log('[VAD] 模型初始化失败:', err.message); });
        } else if (vadPromise) { self._vad.model = vadPromise; self._vad.loadingState = 'ready'; self._vad.supported = true; console.log('[VAD] Silero VAD 加载成功（同步）'); }
        else { self._vad.loadingState = 'error';
        if (self.processingStage === 'idle') self.processingStage = 'degraded'; console.log('[VAD] 无法识别 VAD 初始化方式'); }
      } else { self._vad.loadingState = 'error';
        if (self.processingStage === 'idle') self.processingStage = 'degraded'; console.log('[VAD] VAD 类不可用'); }
    } catch (err) { self._vad.loadingState = 'error';
        if (self.processingStage === 'idle') self.processingStage = 'degraded'; console.log('[VAD] 初始化异常:', err.message); }
  },

  _shouldProcessResult(text) {
    if (!this._vadGate(text)) return false;
    var now = performance.now();
    this._textStabilitySamples = this._textStabilitySamples.filter(function(s) { return now - s.time < 500; });
    this._textStabilitySamples.push({ text: text, time: now });
    while (this._textStabilitySamples.length > this._textStabilityRequired + 1) this._textStabilitySamples.shift();
    if (this._textStabilitySamples.length < this._textStabilityRequired) return false;
    var lastSamples = this._textStabilitySamples.slice(-this._textStabilityRequired);
    var firstText = lastSamples[0].text;
    for (var i = 1; i < lastSamples.length; i++) {
      if (lastSamples[i].text !== firstText) return false;
      if (lastSamples[i].time - lastSamples[i-1].time < this._textStabilityInterval) return false;
    }
    return true;
  },

  checkSupport() {
    if (window.SpeechRecognition || window.webkitSpeechRecognition) {
      if (!window.game.llmClient || !window.game.llmClient.apiKey) { this.supported = false; return false; }
      this.supported = true;
      return true;
    }
    this.supported = false;
    return false;
  },

  start() {
    if (this.isListening) { console.log('[语音] 已在监听中，跳过 start()'); return; }
    if (this._starting) { console.log('[语音] start() 正在进行中，跳过'); return; }
    try {
      this._starting = true;
      if (!this.supported) {
        if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
          window.game.addEventLog('[语音] 不支持语音识别，请使用 Chrome 浏览器');
          this._starting = false;
          return;
        }
      }
      this.isListening = true;
      this._autoRestart = true;
      this._rebuildAttempts = 0;
      this._noiseState = 'silence';
      var self = this;
      setTimeout(function() { self._startVolumeAnalysis(); }, 100);
      if (!this._recognition) { setTimeout(function() { self._rebuildRecognition(); }, 200); }
      else { try { this._recognition.start(); } catch (e) { setTimeout(function() { self._rebuildRecognition(); }, 200); } }
      this._startSilenceCheck();
      this._startWatchdog();
      setTimeout(function() { self._initVAD(); }, 2000);
      this._starting = false;
    } catch (err) { this._starting = false; console.log('[语音] 启动失败:', err.message); }
  },

  stop() {
    this.isListening = false;
    this._autoRestart = false;
    this._rebuildAttempts = 0;
    this._starting = false;
    this._stopSilenceCheck();
    this._stopWatchdog();
    this._stopVolumeAnalysis();
    if (this._recognition) { try { this._recognition.abort(); } catch (e) {} try { this._recognition.stop(); } catch (e) {} this._recognition = null; }
    this._lastSentText = '';
    this._lastSentTime = 0;
    this._textStabilitySamples = [];
    this._noiseState = 'silence';
    this.processingStage = 'idle';
    this.interimText = '';
    this._updateUI();
    console.log('[语音] 已停止');
  },

  _startWatchdog() {
    if (this._watchdogInterval) return;
    this._lastResultTime = performance.now();
    var self = this;
    this._watchdogInterval = setInterval(function() {
      if (!self.isListening) { self._stopWatchdog(); return; }
      if (performance.now() - self._lastResultTime > 10000) {
        window.game.addEventLog('[语音] 看门狗触发：10s 无结果，重启识别器');
        self._lastResultTime = performance.now();
        self._rebuildRecognition();
      }
    }, 3000);
  },

  _stopWatchdog() {
    if (this._watchdogInterval) { clearInterval(this._watchdogInterval); this._watchdogInterval = null; }
  },

  _rebuildRecognition() {
    if (this._rebuilding) return;
    this._rebuildAttempts++;
    if (this._rebuildAttempts > this._maxRebuildAttempts) {
      console.log('[语音] 重建次数已达上限（' + this._maxRebuildAttempts + '次），停止重建');
      window.game.addEventLog('[语音] 识别器重建失败次数过多，已停止自动恢复');
      this.stop();
      return;
    }
    this._rebuilding = true;
    clearTimeout(this._restartTimeout);
    try {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (!SpeechRecognition) { this._rebuilding = false; return; }
      if (this._recognition) { try { this._recognition.abort(); } catch (e) {} try { this._recognition.stop(); } catch (e) {} this._recognition = null; }
      this._generation++;
      const rec = new SpeechRecognition();
      rec.continuous = true;
      rec.interimResults = true;
      rec.lang = 'zh-CN';
      rec.maxAlternatives = 1;
      var rebuildGen = this._generation;
      rec.onresult = (event) => {
        if (rebuildGen !== this._generation) return;
        var finalTranscript = '';
        for (var i = event.resultIndex; i < event.results.length; i++) {
          var result = event.results[i];
          if (result.isFinal) {
            finalTranscript += result[0].transcript;
            this.interimText = result[0].transcript;
          } else {
            var interim = result[0].transcript;
            if (this._shouldProcessResult(interim)) { this.interimText = interim; }
            else { console.log('[语音] 噪音拦截 interim:', interim); }
          }
        }
        this._lastResultTime = performance.now();
        this._updateUI();
        if (finalTranscript.trim()) {
          var text = finalTranscript.trim();
          if (text) {
            this.lockedPeakVolume = Math.max(0.2, Math.min(1, this._lastPeakAtSpeech));
            this._lastPeakAtSpeech = 0;
            console.log('[volume] peak locked:', this.lockedPeakVolume.toFixed(2), 'text:', text);
          }
        }
      };
      var rebuildGenErr = this._generation;
      rec.onerror = (event) => {
        if (rebuildGenErr !== this._generation) return;
        if (event.error !== 'no-speech') window.game.addEventLog('[语音] 错误：' + event.error);
        if (event.error === 'aborted' || event.error === 'language-not-supported' || event.error === 'service-not-allowed') {
          if (this._autoRestart && this.isListening) { clearTimeout(this._restartTimeout); this._rebuildRecognition(); }
        } else { if (event.error !== 'no-speech') this._rebuildRecognition(); }
      };
      var rebuildGenEnd = this._generation;
      rec.onend = () => {
        if (rebuildGenEnd !== this._generation) return;
        if (this._autoRestart && this.isListening) { clearTimeout(this._restartTimeout); this._rebuildRecognition(); }
      };
      this._recognition = rec;
      rec.start();
      this._rebuilding = false;
      console.log('[语音] 识别器已重建并重新启动');
    } catch (err) {
      this._rebuilding = false;
      console.log('[语音] 重建识别器失败:', err.message);
      if (this._autoRestart && this.isListening) {
        clearTimeout(this._restartTimeout);
        this._restartTimeout = setTimeout(function() { if (this._autoRestart && this.isListening) this._rebuildRecognition(); }.bind(this), 500);
      }
    }
  },

  _startSilenceCheck() {
    var self = this;
    if (this._checkInterval) return;
    this._lastResultTime = performance.now();
    this._checkInterval = setInterval(function() {
      var elapsed = performance.now() - self._lastResultTime;
      var text = self.interimText.trim();
      var now = performance.now();
      if (elapsed >= self._silenceTimeout && text && text !== self._lastSentText && (now - self._lastSentTime >= self._sendCooldown)) {
        self._lastSentText = text;
        self._lastSentTime = now;
        self.currentCommand = text;
        console.log('[voice] silence detected, sending to LLM, text=' + text + ' peak=' + self.lockedPeakVolume.toFixed(2));
        if (window.game.audio) window.game.audio.playCommand();
        if (window.game.llmClient && typeof window.game.llmClient.sendCommand === 'function') {
          window.game.llmClient.sendCommand(text);
        }
      }
    }, 500);
  },

  _stopSilenceCheck() {
    if (this._checkInterval) { clearInterval(this._checkInterval); this._checkInterval = null; }
  },

  _clearSilenceTimer() {
    if (this._silenceTimer) { clearTimeout(this._silenceTimer); this._silenceTimer = null; }
  },

  _onCommandComplete() {
    this.currentCommand = '';
    console.log('[voice] LLM done, ready for next command');
  },

  _updateUI() {
    if (typeof this.onInterimUpdate === 'function') {
      this.onInterimUpdate({
        isListening: this.isListening,
        interimText: this.interimText,
        currentCommand: this.currentCommand,
        volume: this.volume,
        peakVolume: this.lockedPeakVolume,
        volumeLevel: this.getVolumeLevel(),
        noiseState: this._noiseState,
        processingStage: this.processingStage,
        vadDegraded: this._vad.loadingState === 'error'
      });
    }
  }
};
