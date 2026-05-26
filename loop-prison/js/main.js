/* ============================================================
 * 游戏总控 — 《永返》横版平台跳跃
 *
 * 管理游戏状态、计时器、主循环、重生逻辑。
 *
 * 【剧情依赖】无（最先加载，不依赖其他游戏模块）
 * 【提供】window.game 核心对象及以下方法：
 *   addEventLog, triggerEvent, loadLevel, updateUI,
 *   checkWinCondition, gameLoop, startGame,
 *   respawnPlayer, respawnAI
 * 【常量】window.game.GRAVITY = 800 (px/s²)
 *         window.game.JUMP_VELOCITY = -380 (px/s)
 * ============================================================ */

window.game = {
  // === Canvas 上下文 ===
  canvas: document.getElementById('gameCanvas'),
  _canvasContainer: null,
  ctx: null,

  // === 物理常量 ===
  GRAVITY: 800,          // 重力加速度 (px/s²)
  JUMP_VELOCITY: -380,   // 跳跃初速度 (px/s，向上为负)

  // === 游戏状态 ===
  state: 'waiting',
  _buttonWasPressed: false,
  allyStatus: 'alive',
  timer: 60,
  timerAccumulator: 0,
  lastTimestamp: 0,
  animFrameId: null,

  // === 关卡 ===
  currentLevelIndex: 0,
  levels: [],

  // === 无限模式 ===
  infiniteMode: true,
  _totalClearTime: 0,
  _totalMistakes: 0,

  // === 角色引用 ===
  player1: null,
  aiPlayer: null,
  map: null,

  // === 突发事件 ===
  events: [],

  // === 输入状态 ===
  keys: {},
  _wasSkipKeyDown: false,

  // ============================================================
  // 系统日志
  // ============================================================

  /**
   * 向系统日志面板追加文本。
   * @param {string} text - 日志文本
   */
  addEventLog(text) {
    const logEl = document.getElementById('event-log');
    const hasPrefix = /^\[/.test(text);
    const displayText = hasPrefix ? text : `[系统] ${text}`;

    const entry = document.createElement('div');
    entry.className = 'log-entry';

    if (text.includes('[警告]') || text.includes('超时') || text.includes('重置')) {
      entry.classList.add('warning');
    } else if (text.includes('[成功]') || text.includes('完成') || text.includes('通过')) {
      entry.classList.add('success');
    }

    entry.textContent = displayText;
    logEl.appendChild(entry);
    logEl.scrollTop = logEl.scrollHeight;
  },

  // ============================================================
  // 突发事件（占位，等待 events.js 覆写）
  // ============================================================

  triggerEvent(eventObj) {
    this.addEventLog(`[事件] ${eventObj.name} 触发`);
  },

  // ============================================================
  // 角色重生
  // ============================================================

  /**
   * 将玩家重置到当前关卡的出生点。
   * 出生坐标读取 map.playerSpawn。
   */
  respawnPlayer() {
    if (!this.player1 || !this.map) return;
    const spawn = this.map.playerSpawn || { x: 50, y: 500 };
    this.player1.x = spawn.x;
    this.player1.y = spawn.y;
    this.player1.vx = 0;
    this.player1.vy = 0;
    this.player1.isGrounded = false;
    this.player1.isCrouching = false;
    this.player1.h = this.player1.normalHeight;
  },

  /**
   * 将 AI 队友重置到当前关卡的出生点。
   * 出生坐标读取 map.aiSpawn。
   */
  respawnAI() {
    if (!this.aiPlayer || !this.map) return;
    const spawn = this.map.aiSpawn || { x: 700, y: 500 };
    this.aiPlayer.x = spawn.x;
    this.aiPlayer.y = spawn.y;
    this.aiPlayer.vx = 0;
    this.aiPlayer.vy = 0;
    this.aiPlayer.isGrounded = false;
    this.aiPlayer.isCrouching = false;
    this.aiPlayer.h = this.aiPlayer.normalHeight;
  },

  // ============================================================
  // 关卡加载
  // ============================================================

  /**
   * 加载指定关卡数据并重置角色位置。
   * @param {number} index - 关卡索引
   */
  loadLevel(index) {
    // 程序化生成无限关卡：前 2 关为手工设计，之后全部 AI 生成
    var levelData;
    if (index < this.levels.length) {
      levelData = this.levels[index];
    } else if (this.levelGenerator && typeof this.levelGenerator.generate === 'function') {
      levelData = this.levelGenerator.generate(index);
    } else {
      this.addEventLog('[错误] 关卡生成器未就绪，无法加载关卡。');
      return;
    }
    this.currentLevelIndex = index;
    this.timer = levelData.timeLimit || 60;
    this.timerAccumulator = 0;
    this.state = 'playing';
    this.allyStatus = 'alive';

    // 将关卡数据加载到 map 对象
    if (this.map) {
      this.map.currentLevel = index;
      this.map.loadLevelData(levelData);
    }

    // 重置角色位置到关卡出生点
    this.respawnPlayer();
    this.respawnAI();

    // 重置碰撞/死亡计数
    if (this.player1) {
      this.player1.collisionCount = 0;
      this.player1.deaths = 0;
    }
    if (this.aiPlayer) {
      this.aiPlayer.collisionCount = 0;
      this.aiPlayer.deaths = 0;
    }

    // 临时禁用 AI 移动（后期由成员实现寻路后移除此行）
    if (this.aiPlayer) {

    }

    this.addEventLog(`永返启动，当前修复模块：${levelData.moduleName}`);
    this.addEventLog('艾莉正在维持空间稳定，请尽快完成修复任务。');
    this.updateUI();
    this._updateInfiniteUI();

    // 生成 AI 叙事文字
    if (this.roast && typeof this.roast.generateNarrative === 'function') {
      this.roast.generateNarrative({
        moduleName: levelData.moduleName,
        levelIndex: index + 1,
        loop: index + 1,
        allyStatus: this.allyStatus,
        timer: levelData.timeLimit
      });
    }
  },

  // ============================================================
  // UI 更新
  // ============================================================

  updateUI() {
    const timerEl = document.getElementById('timer');
    const allyEl = document.getElementById('ally-status');
    const canvasWrapper = document.querySelector('.canvas-wrapper');

    const seconds = Math.ceil(this.timer);
    timerEl.textContent = `⏱ 修复倒计时: ${seconds}s`;

    if (this.state === 'lose') {
      timerEl.classList.add('timeout');
    } else {
      timerEl.classList.remove('timeout');
    }

    if (this.allyStatus === 'damaged') {
      allyEl.textContent = '💔 艾莉受损';
      allyEl.className = 'ui-panel ally-damaged';
    } else {
      allyEl.textContent = '❤️ 艾莉存活中';
      allyEl.className = 'ui-panel ally-alive';
    }

    if (canvasWrapper) {
      if (this.state === 'lose') {
        canvasWrapper.style.borderColor = '#ff3333';
        canvasWrapper.style.boxShadow =
          '0 0 10px rgba(255, 0, 0, 0.4), 0 0 30px rgba(255, 0, 0, 0.15)';
      } else if (this.state === 'win') {
        canvasWrapper.style.borderColor = '#00ff41';
        canvasWrapper.style.boxShadow =
          '0 0 15px rgba(0, 255, 65, 0.5), 0 0 40px rgba(0, 255, 65, 0.2)';
      } else {
        canvasWrapper.style.borderColor = '#00ff41';
        canvasWrapper.style.boxShadow =
          '0 0 10px rgba(0, 255, 65, 0.3), 0 0 30px rgba(0, 255, 65, 0.1)';
      }
    }

    // 按钮覆盖层：通关显示两个按钮，失败只显示重新开始
    if (this._overlay && this._btnNext && this._btnRetry) {
      if (this.state === 'win') {
        this._overlay.classList.add('visible');
        this._btnNext.classList.add('visible');
        this._btnRetry.classList.add('visible');
      } else if (this.state === 'lose') {
        this._overlay.classList.add('visible');
        this._btnNext.classList.remove('visible');
        this._btnRetry.classList.add('visible');
      } else {
        this._overlay.classList.remove('visible');
        this._btnNext.classList.remove('visible');
        this._btnRetry.classList.remove('visible');
      }
    }

    // 跳过按钮：仅在游戏中显示
    if (this._btnSkip) {
      this._btnSkip.style.display = (this.state === 'playing') ? '' : 'none';
    }
  },

  // ============================================================
  // 胜负判定
  // ============================================================

  /**
   * 检测玩家是否到达终点区（AABB 检测）。
   * TODO: 后期改回双方都需到达（p1InZone && aiInZone）
   * @returns {boolean}
   */
  checkWinCondition() {
    if (!this.player1 || !this.map || !this.map.finishZone) {
      return false;
    }

    const fz = this.map.finishZone;

    const p1InZone =
      this.player1.x < fz.x + fz.w &&
      this.player1.x + this.player1.w > fz.x &&
      this.player1.y < fz.y + fz.h &&
      this.player1.y + this.player1.h > fz.y;

    // TODO: 后期改回 p1InZone && aiInZone（需双方到达终点）
    return p1InZone;
  },

  // ============================================================
  // 主循环
  // ============================================================

  /**
   * 游戏主循环，由 requestAnimationFrame 驱动。
   * @param {number} timestamp - 高精度时间戳 (ms)
   */
  _showTutorial() {
    var overlay = document.getElementById('tutorial-overlay');
    if (!overlay) { return; }
    overlay.className = 'modal-visible';
    var currentStep = 0, totalSteps = 3, self = this;
    function updateStep(step) {
      var s = document.querySelectorAll('.tutorial-step');
      for (var i = 0; i < s.length; i++) s[i].className = 'tutorial-step' + (i === step ? ' tutorial-step-active' : '');
      var d = document.querySelectorAll('.tutorial-dot');
      for (var i = 0; i < d.length; i++) d[i].className = 'tutorial-dot' + (i === step ? ' tutorial-dot-active' : '');
      document.getElementById('tutorial-prev').disabled = step === 0;
      document.getElementById('tutorial-next').textContent = step === totalSteps - 1 ? 'Play' : 'Next';
    }
    document.getElementById('tutorial-next').onclick = function() {
      if (currentStep < totalSteps - 1) { currentStep++; updateStep(currentStep); }
      else { overlay.className = 'modal-hidden'; try { localStorage.setItem('loopPrisonTutorialDone','true'); } catch(e) {} self._startLoop(); }
    };
    document.getElementById('tutorial-prev').onclick = function() {
      if (currentStep > 0) { currentStep--; updateStep(currentStep); }
    };
  },

  gameLoop(timestamp) {
    if (!this.lastTimestamp) {
      this.lastTimestamp = timestamp;
    }

    const rawDelta = (timestamp - this.lastTimestamp) / 1000;
    const deltaTime = Math.min(rawDelta, 0.1);
    this.lastTimestamp = timestamp;

    // ---- 暂停检测 ----
    if (this.state === 'paused') {
      // 仍然绘制当前帧
      if (this.ctx) {
        this._drawCurrentFrame();
      }
      this._animationId = requestAnimationFrame((t) => this.gameLoop(t));
      return;
    }

    // 清除画布
    if (this.ctx) {
      this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    }

    // ---- 跳过关卡（K 键）----
    const skipKeyDown = window.game.keys['KeyK'];
    const skipPressed = skipKeyDown && !this._wasSkipKeyDown;
    this._wasSkipKeyDown = skipKeyDown;

    if (skipPressed && (this.state === 'playing' || this.state === 'lose')) {
      this.addEventLog('[系统] 跳过当前关卡...');
      this.loadLevel(this.currentLevelIndex + 1);
    }

    // 精灵动画计时
    if (this.sprites && typeof this.sprites.updateAnim === 'function') {
      this.sprites.updateAnim(deltaTime);
    }

    // --- playing 状态 ---
    if (this.state === 'playing') {
      // 计时器递减
      this.timerAccumulator += deltaTime;
      if (this.timerAccumulator >= 1) {
        this.timer -= Math.floor(this.timerAccumulator);
        this.timerAccumulator -= Math.floor(this.timerAccumulator);

        if (this.timer <= 0) {
          this.timer = 0;
          this.state = 'lose';
          if (window.game.audio) window.game.audio.playDeath();
          this.allyStatus = 'damaged';
          this.addEventLog('[警告] 修复超时！世界即将重置...');
          this.addEventLog('[警告] 艾莉因系统崩溃受到伤害——请准备下一次循环。');
          this.updateUI();

          // 无限模式失败：提交排行榜
          if (this.leaderboard && this.leaderboard.playerName) {
            this.leaderboard.submit({
              levelsCompleted: this.currentLevelIndex + 1,
              totalTime: this._totalClearTime,
              totalMistakes: this._totalMistakes
            });
          }

          if (this.roast && typeof this.roast.speak === 'function') {
            const p1Hits = this.player1 ? this.player1.collisionCount || 0 : 0;
            const aiHits = this.aiPlayer ? this.aiPlayer.collisionCount || 0 : 0;
            const rtext = this.roast.generate({
              result: 'lose',
              clearTime: 0,
              mistakes: p1Hits + aiHits,
              moduleName: this.map ? this.map.moduleName : ''
            });
            if (rtext) {
              this.roast._speakText(rtext);
            }
          }
        }

        this.updateUI();
      }

      // 更新子弹 + 掉落函数（动态障碍）
      if (this.map && typeof this.map.updateBullets === 'function') {
        this.map.updateBullets(deltaTime);
      }
      if (this.map && typeof this.map.updateFallingBlocks === 'function') {
        this.map.updateFallingBlocks(deltaTime);
      }

      // 更新角色（物理/移动/碰撞均由角色自身处理）
      if (this.player1 && typeof this.player1.update === 'function') {
        this.player1.update(deltaTime);
      }
      if (this.aiPlayer && typeof this.aiPlayer.update === 'function') {
        this.aiPlayer.update(deltaTime);
      }

            // ---- button check (pressed = no red line, released = restore) ----
            // Button deactivates red line only while being touched
            if (this.map && this.map.button) {
              var btnPressed = false;
              if (this.player1 && this.map.isButtonPressed({ x: this.player1.x, y: this.player1.y, w: this.player1.w, h: this.player1.h })) {
                btnPressed = true;
              }
              if (this.aiPlayer && this.map.isButtonPressed({ x: this.aiPlayer.x, y: this.aiPlayer.y, w: this.aiPlayer.w, h: this.aiPlayer.h })) {
                btnPressed = true;
              }
              if (btnPressed && !this._buttonWasPressed) {
                this._buttonWasPressed = true;
                this.map.redLineActive = false;
                this.addEventLog('[system] 按钮已按下，红线屏障解除');
              } else if (!btnPressed && this._buttonWasPressed) {
                this._buttonWasPressed = false;
                this.map.redLineActive = true;
                this.addEventLog('[system] 按钮已松开，红线屏障恢复');
              } else if (btnPressed) {
                this.map.redLineActive = false;
              } else {
                this.map.redLineActive = true;
              }
            }

      // 清理过期事件
      const now = performance.now();
      this.events = this.events.filter(evt => {
        if (now - evt.startTime >= evt.duration) {
          if (typeof evt.onEnd === 'function') evt.onEnd();
          return false;
        }
        if (typeof evt.onUpdate === 'function') evt.onUpdate(deltaTime);
        return true;
      });

      // 通关判定
if (window.game.audio) window.game.audio.playWin();
      if (this.checkWinCondition()) {
        this.state = 'win';
        var levelLabel2 = '第' + (this.currentLevelIndex + 1) + '关';
        if (this.currentLevelIndex >= this.levels.length) {
          levelLabel2 += ' [AI生成]';
        }
        this.addEventLog('[成功] ' + levelLabel2 + ' 修复完成！' + this.map.moduleName + ' 已恢复运行。');

        // 记录统计数据
        var p1Hits2 = this.player1 ? this.player1.collisionCount || 0 : 0;
        var aiHits2 = this.aiPlayer ? this.aiPlayer.collisionCount || 0 : 0;
        var clearTime = (this.map.timeLimit || 60) - this.timer;
        var mistakes = p1Hits2 + aiHits2;
        this._totalClearTime += clearTime;
        this._totalMistakes += mistakes;
        this._updateInfiniteUI();

        if (this.leaderboard) {
          this.leaderboard.recordLevel({
            clearTime: clearTime,
            mistakes: mistakes,
            moduleName: this.map ? this.map.moduleName : ''
          });
        }

        if (this.roast && typeof this.roast.speak === 'function') {
          var text = this.roast.generate({
            result: 'win',
            clearTime: clearTime,
            mistakes: mistakes,
            moduleName: this.map ? this.map.moduleName : ''
          });
          if (text) {
            this.roast._speakText(text);
          }
        }

        this.updateUI();
      }
    }

    if (this.state !== 'waiting') {
    // --- 绘制 ---
    if (this.map && typeof this.map.draw === 'function') {
      this.map.draw(this.ctx);
    }
    if (this.map && typeof this.map.drawBullets === 'function') {
      this.map.drawBullets(this.ctx);
    }
    if (this.map && typeof this.map.drawFallingBlocks === 'function') {
      this.map.drawFallingBlocks(this.ctx);
    }
    if (this.player1 && typeof this.player1.draw === 'function') {
      this.player1.draw(this.ctx);
    }
    if (this.aiPlayer && typeof this.aiPlayer.draw === 'function') {
      this.aiPlayer.draw(this.ctx);
    }

    // 失败/通关时在 Canvas 上绘制覆盖文字
    if (this.state === 'lose') {
      this.ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
      this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
      this.ctx.fillStyle = '#ff3333';
      this.ctx.font = 'bold 36px "Courier New", monospace';
      this.ctx.textAlign = 'center';
      this.ctx.fillText('⚠ 世界重置警告 ⚠', this.canvas.width / 2, this.canvas.height / 2 - 20);
      this.ctx.font = '18px "Courier New", monospace';
      this.ctx.fillStyle = '#ff6b35';
      this.ctx.fillText('修复超时 —— 艾莉受损', this.canvas.width / 2, this.canvas.height / 2 + 30);
      this.ctx.textAlign = 'start';
    }

    if (this.state === 'win') {
      this.ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
      this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
      this.ctx.fillStyle = '#00ff41';
      this.ctx.font = 'bold 36px "Courier New", monospace';
      this.ctx.textAlign = 'center';
      this.ctx.fillText('✓ 模块修复成功 ✓', this.canvas.width / 2, this.canvas.height / 2 - 40);
      this.ctx.font = '18px "Courier New", monospace';
      var levelLabel = '第 ' + (this.currentLevelIndex + 1) + ' 关';
      if (this.currentLevelIndex >= this.levels.length) {
        levelLabel += ' [AI 生成]';
      }
      this.ctx.fillText(levelLabel, this.canvas.width / 2, this.canvas.height / 2);
      this.ctx.fillText('艾莉状态：稳定', this.canvas.width / 2, this.canvas.height / 2 + 30);
      this.ctx.textAlign = 'start';
    }


    }
    // 继续循环
    this.animFrameId = requestAnimationFrame((ts) => this.gameLoop(ts));
  },

  // ============================================================
  // 无限模式
  // ============================================================

  /**
   * 切换无限模式开关
   */
  toggleInfiniteMode: function(enable) {
    this.infiniteMode = !!enable;
    if (this.infiniteMode) {
      this._totalClearTime = 0;
      this._totalMistakes = 0;
      this.addEventLog('[无限模式] 已启用！');
    } else {
      this.addEventLog('[无限模式] 已关闭。');
    }
    this._updateInfiniteUI();
  },

  /**
   * 重置无限模式统计
   */
  resetInfiniteStats: function() {
    this._totalClearTime = 0;
    this._totalMistakes = 0;
    if (this.leaderboard) {
      this.leaderboard.sessionStats = {
        levelsCompleted: 0,
        totalTime: 0,
        totalMistakes: 0,
        startTime: Date.now()
      };
    }
    this._updateInfiniteUI();
  },

  /**
   * 更新无限模式 UI 显示
   */
  _updateInfiniteUI: function() {
    var badge = document.getElementById('infinite-badge');
    if (badge) {
      if (this.infiniteMode) {
        badge.textContent = '♾ 无限 · 第' + (this.currentLevelIndex + 1) + '关';
        badge.className = 'infinite-badge infinite-active';
      } else {
        badge.textContent = '♾ 无限模式：关';
        badge.className = 'infinite-badge';
      }
    }
    var statEl = document.getElementById('infinite-stats');
    if (statEl) {
      statEl.textContent = '总用时:' + Math.round(this._totalClearTime) + 's | 总失误:' + this._totalMistakes + ' | 关卡:' + (this.currentLevelIndex + 1);
    }
    var statsBar = document.getElementById('infinite-stats-bar');
    if (statsBar) {
      statsBar.style.display = this.infiniteMode ? '' : 'none';
    }
    var toggleBtn = document.getElementById('btn-infinite-toggle');
    if (toggleBtn) {
      toggleBtn.textContent = this.infiniteMode ? '♾ 无限：开' : '♾ 无限：关';
    }
  },

  // ============================================================
  // 启动
  // ============================================================

  /**
   * 启动游戏。初始化 Canvas 上下文，加载第一关，开始主循环。
   */
  _handleResize() {
    var container = this._canvasContainer;
    if (!container) {
      container = document.querySelector('.canvas-wrapper');
      this._canvasContainer = container;
    }
    if (!container || !this.canvas) return;
    var maxW = window.innerWidth;
    var maxH = window.innerHeight;
    var ratio = 800 / 600;
    var w, h;
    if (maxW / maxH > ratio) {
      h = maxH;
      w = h * ratio;
    } else {
      w = maxW;
      h = w / ratio;
    }
    this.canvas.style.width = Math.floor(w) + 'px';
    this.canvas.style.height = Math.floor(h) + 'px';
    this.canvas.style.display = 'block';
    this.canvas.style.margin = '0 auto';
  },

  startGame() {
    this.ctx = this.canvas.getContext('2d');
    this._handleResize();
    var self = this;
    window.addEventListener('resize', function() { self._handleResize(); });
    if (window.game.audio) window.game.audio._init();

    // 显示加载进度条
    var loadBar = document.getElementById('loading-bar');
    if (loadBar) loadBar.className = 'loading-visible';

    // 获取按钮引用
    this._overlay = document.getElementById('game-overlay');
    this._btnNext = document.getElementById('btn-next-level');
    this._btnRetry = document.getElementById('btn-retry');
    this._btnSkip = document.getElementById('btn-skip');

    // 下一关按钮点击
    this._btnNext.addEventListener('click', () => {
      this.loadLevel(this.currentLevelIndex + 1);
    });


    // 继续按钮点击
    document.getElementById('btn-resume').addEventListener('click', () => {
      if (this.isPaused) this.togglePause();
    });
    // 重新开始按钮点击
    this._btnRetry.addEventListener('click', () => {
      this.loadLevel(this.currentLevelIndex);
    });

    // 跳过关卡按钮点击
    this._btnSkip.addEventListener('click', () => {
      this.addEventLog('[系统] 跳过当前关卡...');
      this.loadLevel(this.currentLevelIndex + 1);
    });


    this.updateUI();
    this.lastTimestamp = 0;

    // 直接开始第一关
    this.loadLevel(0);
    this.addEventLog('[提示] AI队友艾莉免疫子弹伤害，请放心指挥她协助你！');

    // 异步加载精灵图并启动游戏循环
    this._bootGame();
  },

  /**
   * 启动游戏循环并后台加载精灵图。
   * 第一帧即开始渲染（几何占位），精灵加载完成后自动切换。
   */
  async _bootGame() {
    // 先加载精灵图（等待完成）
    if (this.sprites && typeof this.sprites.loadAll === 'function') {
      await this.sprites.loadAll();
    }

    // 设置艾莉头像图片
    this._setupAllyAvatar();

    // 精灵就绪后再启动游戏循环
        // Show tutorial on first launch
    if (!localStorage.getItem('loopPrisonTutorialDone')) {
      this._showTutorial();
    } else {
      this._startLoop();
    }
  },

  _startLoop() {
    this.animFrameId = requestAnimationFrame((ts) => this.gameLoop(ts));
  },

  /**
   * 设置艾莉头像图片（如果有加载到的话）
   */
  _setupAllyAvatar() {
    const avatarImg = document.getElementById('ally-avatar-img');
    const inlineAvatar = document.getElementById('ally-inline-avatar');
    if (this.sprites && this.sprites.ally) {
      if (avatarImg) avatarImg.src = this.sprites.ally.src;
      if (inlineAvatar) inlineAvatar.src = this.sprites.ally.src;
    }
  }
};

// ============================================================
// 键盘输入监听
// ============================================================
// ============================================================
  // Touch controls for mobile
  // ============================================================
  (function() {
    function setupTouchButton(btn) {
      var key = btn.getAttribute('data-key');
      if (!key) return;
      btn.addEventListener('touchstart', function(e) {
        e.preventDefault();
        window.game.keys[key] = true;
        btn.classList.add('touch-btn-active');
      });
      btn.addEventListener('touchend', function(e) {
        e.preventDefault();
        window.game.keys[key] = false;
        btn.classList.remove('touch-btn-active');
      });
      btn.addEventListener('touchcancel', function(e) {
        window.game.keys[key] = false;
        btn.classList.remove('touch-btn-active');
      });
    }
    var touchBtns = document.querySelectorAll('.touch-btn');
    for (var i = 0; i < touchBtns.length; i++) {
      setupTouchButton(touchBtns[i]);
    }
    // Show touch controls on touch devices
    var touchEl = document.getElementById('touch-controls');
    if (touchEl && ('ontouchstart' in window || navigator.maxTouchPoints > 0)) {
      touchEl.classList.remove('touch-hidden');
      touchEl.classList.add('touch-visible');
    }
  })();

  window.addEventListener('keydown', (e) => {
  window.game.keys[e.code] = true;

  // Escape/P 暂停切换
  if (e.code === 'Escape' || e.code === 'KeyP') {
    if (window.game.state === 'playing' || window.game.state === 'paused') {
      window.game.togglePause();
      e.preventDefault();
      return;
    }
  }

  // 防止方向键和 WASD 滚动页面
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code) ||
      ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyK', 'KeyP'].includes(e.code)) {
    e.preventDefault();
  }
});

window.addEventListener('keyup', (e) => {
  window.game.keys[e.code] = false;
});

// ============================================================
// 开始画面 → 艾莉对话 & 启动游戏
// ============================================================
window.addEventListener('DOMContentLoaded', () => {
  var startScreen = document.getElementById('start-screen');
  var btnStart = document.getElementById('btn-start-game');

  if (!startScreen || !btnStart) {
    window.game.startGame();
    return;
  }

  // ---- 艾莉语音合成系统（少女音） ----
  var synth = window.speechSynthesis;
  var currentUtterance = null;
  var cachedVoices = null;

  // 初始化语音列表
  function initVoices() {
    if (!synth) return;
    var voices = synth.getVoices();
    if (voices && voices.length > 0) {
      cachedVoices = voices;
      return;
    }
    synth.onvoiceschanged = function() {
      cachedVoices = synth.getVoices();
    };
  }
  initVoices();

  // 情感配置
  var emotionConfig = {
    '叹气': { pitch: 0.9, rate: 0.85 },
    '轻哼': { pitch: 1.5, rate: 1.1 },
    '挑眉': { pitch: 1.4, rate: 1.05 },
    '不耐烦': { pitch: 0.95, rate: 1.2 },
    '小声': { pitch: 1.2, rate: 0.8, volume: 0.7 },
    '冷笑': { pitch: 0.9, rate: 0.95 },
    '颤抖': { pitch: 1.1, rate: 0.9 }
  };

  function speak(text) {
    if (!synth) return;
    synth.cancel();

    // 提取情感标记
    var emotionMatch = text.match(/（([^）]+)）/);
    var emotion = emotionMatch ? emotionMatch[1] : null;
    var emoCfg = emotion ? (emotionConfig[emotion] || {}) : {};

    // 清理文本：移除HTML标签和情感标记
    var cleanText = text.replace(/<[^>]*>/g, '').replace(/\s*（[^）]*）\s*/g, ' ').replace(/\s+/g, ' ').trim();

    if (cleanText.length > 0) {
      currentUtterance = new SpeechSynthesisUtterance(cleanText);
      currentUtterance.lang = 'zh-CN';
      currentUtterance.rate = emoCfg.rate || 0.95;
      currentUtterance.pitch = emoCfg.pitch || 1.3;
      currentUtterance.volume = emoCfg.volume || 1.0;

      // 尝试选择女声
      var voices = cachedVoices || synth.getVoices();
      for (var i = 0; i < voices.length; i++) {
        var v = voices[i];
        if (v.lang.indexOf('zh') !== -1 && v.name.toLowerCase().indexOf('female') !== -1) {
          currentUtterance.voice = v;
          break;
        }
        if (v.lang.indexOf('zh') !== -1 && !currentUtterance.voice) {
          currentUtterance.voice = v;
        }
      }

      synth.speak(currentUtterance);
    }
  }

  function stopSpeak() {
    if (synth) synth.cancel();
  }

  // ---- 艾莉对话系统 ----
  var allyEl = document.getElementById('ally-avatar');
  var dialogueEl = document.getElementById('ally-dialogue');
  var dialogueText = dialogueEl && dialogueEl.querySelector('.dialogue-text');
  var dialogueNext = dialogueEl && dialogueEl.querySelector('.dialogue-next');
  var dialogueSkip = dialogueEl && dialogueEl.querySelector('.dialogue-skip');

  var dialogueLines = [
    '……哦？（叹气）又有新的修复员来了？好吧，让我看看你们能撑多久。',
    '我是<span style="color:#ff6b35;">艾莉</span>，这个虚拟空间的核心 AI。（轻哼）别被头衔吓到——我现在就像个千疮百孔的筛子，到处漏风。',
    '你们两个……一个键盘，一个语音？（挑眉）希望配合能比上一批强点。',
    '规则很简单：进入故障模块，<span style="color:#00ff41;">限时内完成修复</span>。超时？世界重置，我受重伤。就这样。',
    '你们的目标是让我<span style="color:#ff6b35;">活下去</span>。（冷笑）听起来伟大？其实只是在延缓我的死亡而已。',
    '不过嘛……既然来了，就别白跑。（核心闪烁）让我看看你们有几斤几两。',
    '准备好了吗？<span style="color:#ff6b35;">点击开始游戏</span>……或者现在离开也行。反正我习惯了被抛弃。（小声）……开玩笑的，快开始吧。'
  ];
  var dialogueIdx = 0;
  var dialogueActive = false;

  function showDialogue() {
    if (dialogueIdx >= dialogueLines.length) return;
    dialogueActive = true;
    dialogueEl.classList.remove('hidden');
    dialogueText.innerHTML = dialogueLines[dialogueIdx];
    dialogueNext.textContent = dialogueIdx < dialogueLines.length - 1 ? '[ 点击继续 ]' : '[ 我准备好了 ]';
    speak(dialogueLines[dialogueIdx]);
  }

  function advanceDialogue() {
    dialogueIdx++;
    if (dialogueIdx >= dialogueLines.length) {
      dialogueActive = false;
      dialogueEl.classList.add('hidden');
      stopSpeak();
      if (allyEl) allyEl.classList.add('talked');
      return;
    }
    showDialogue();
  }

  function skipDialogue() {
    dialogueIdx = dialogueLines.length;
    dialogueActive = false;
    dialogueEl.classList.add('hidden');
    stopSpeak();
    if (allyEl) allyEl.classList.add('talked');
  }

  if (allyEl) {
    allyEl.addEventListener('click', function(e) {
      e.stopPropagation();
      if (dialogueIdx === 0) {
        showDialogue();
      } else if (dialogueActive) {
        advanceDialogue();
      } else {
        dialogueIdx = 0;
        showDialogue();
      }
    });
  }

  if (dialogueEl) {
    dialogueEl.addEventListener('click', function(e) {
      e.stopPropagation();
      if (dialogueActive) {
        advanceDialogue();
      }
    });
  }

  if (dialogueSkip) {
    dialogueSkip.addEventListener('click', function(e) {
      e.stopPropagation();
      skipDialogue();
    });
  }

  // ---- 游戏加载后自动开始艾莉对话 ----
  if (dialogueIdx === 0 && !dialogueActive) {
    showDialogue();
  }

  var dialogueKeyHandler = function(e) {
    if (dialogueActive && (e.code === 'Enter' || e.code === 'Space')) {
      e.preventDefault();
      e.stopImmediatePropagation();
      advanceDialogue();
    }
  };
  window.addEventListener('keydown', dialogueKeyHandler, true);

  // ---- 游戏启动 ----
  btnStart.addEventListener('click', () => {
    startScreen.classList.add('hidden');
    stopSpeak();
    window.game.startGame();
    window.removeEventListener('keydown', dialogueKeyHandler, true);
  });

  var onStartKey = function(e) {
    if (startScreen.classList.contains('hidden')) return;
    if (dialogueActive) return;
    if (e.code === 'Enter' || e.code === 'Space') {
      e.preventDefault();
      startScreen.classList.add('hidden');
      stopSpeak();
      window.game.startGame();
      window.removeEventListener('keydown', onStartKey);
      window.removeEventListener('keydown', dialogueKeyHandler, true);
    }
  };
  window.addEventListener('keydown', onStartKey);
});      // ---- 设置面板事件 ----
      document.getElementById('btn-settings').addEventListener('click', function() {
        document.getElementById('settings-modal').className = 'modal-visible';
      });
      document.getElementById('btn-settings-close').addEventListener('click', function() {
        document.getElementById('settings-modal').className = 'modal-hidden';
      });
      document.getElementById('settings-modal').addEventListener('click', function(e) {
        if (e.target === this) this.className = 'modal-hidden';
      });

      // ---- 音量滑块 ----
      document.getElementById('setting-volume').addEventListener('input', function() {
        var val = parseInt(this.value);
        document.getElementById('setting-volume-label').textContent = val + '%';
        if (window.game.audio) window.game.audio.volume = val / 100;
      });

      // ---- API Key 事件 ----
      document.getElementById('setting-apikey').addEventListener('change', function() {
        localStorage.setItem('loopPrisonApiKey', this.value);
        if (window.game.llmClient) window.game.llmClient.setApiKey(this.value);
      });
      document.getElementById('setting-endpoint').addEventListener('change', function() {
        localStorage.setItem('loopPrisonEndpoint', this.value);
      });
      document.getElementById('setting-model').addEventListener('change', function() {
        localStorage.setItem('loopPrisonModel', this.value);
      });

      // ---- 测试连接 ----
      document.getElementById('btn-test-connection').addEventListener('click', async function() {
        var statusEl = document.getElementById('setting-connection-status');
        statusEl.textContent = '连接中...';
        statusEl.style.color = '#888';
        if (window.game.llmClient) {
          var key = document.getElementById('setting-apikey').value;
          window.game.llmClient.setApiKey(key);
          var result = await window.game.llmClient.testConnection();
          if (result.ok) {
            statusEl.textContent = '✔ 连接成功';
            statusEl.style.color = '#4caf50';
          } else {
            statusEl.textContent = '✘ ' + (result.error || '失败');
            statusEl.style.color = '#f44336';
          }
        }
      });

      // ---- 触摸控制 ----
      (function() {
        function setupTouch(btn) {
          var key = btn.getAttribute('data-key');
          if (!key) return;
          btn.addEventListener('touchstart', function(e) { e.preventDefault(); window.game.keys[key] = true; btn.classList.add('touch-btn-active'); });
          btn.addEventListener('touchend', function(e) { e.preventDefault(); window.game.keys[key] = false; btn.classList.remove('touch-btn-active'); });
          btn.addEventListener('touchcancel', function() { window.game.keys[key] = false; btn.classList.remove('touch-btn-active'); });
        }
        var btns = document.querySelectorAll('.touch-btn');
        for (var i = 0; i < btns.length; i++) setupTouch(btns[i]);
        var tc = document.getElementById('touch-controls');
        if (tc && ('ontouchstart' in window || navigator.maxTouchPoints > 0)) {
          tc.classList.remove('touch-hidden');
          tc.classList.add('touch-visible');
        }
      })();

      // ---- 从 localStorage 恢复设置 ----
      var savedKey = localStorage.getItem('loopPrisonApiKey');
      var savedEndpoint = localStorage.getItem('loopPrisonEndpoint');
      var savedModel = localStorage.getItem('loopPrisonModel');
      if (savedKey) document.getElementById('setting-apikey').value = savedKey;
      if (savedEndpoint) document.getElementById('setting-endpoint').value = savedEndpoint;
      if (savedModel) document.getElementById('setting-model').value = savedModel;




