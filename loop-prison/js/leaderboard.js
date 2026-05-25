/* ============================================================
 * 排行榜系统 — localStorage 持久化 + UI 面板
 *
 * 记录玩家通关数据（名称、关卡数、总用时、失误数、日期）。
 * 提供加入成员、显示排行榜、清空排行榜功能。
 *
 * 【挂载点】window.game.leaderboard
 * ============================================================ */

window.game.leaderboard = {
  STORAGE_KEY: 'loopPrisonV16Leaderboard',
  maxEntries: 20,
  playerName: '',

  sessionStats: {
    levelsCompleted: 0,
    totalTime: 0,
    totalMistakes: 0,
    startTime: 0
  },

  /**
   * 设置玩家名称 / 加入游戏
   */
  join: function(name) {
    this.playerName = (name || '').trim();
    if (!this.playerName) return false;
    this.sessionStats = {
      levelsCompleted: 0,
      totalTime: 0,
      totalMistakes: 0,
      startTime: Date.now()
    };
    window.game.addEventLog('[系统] 修复员 [' + this.playerName + '] 已加入永返');
    this._savePlayerName();
    this._updateUI();
    return true;
  },

  /**
   * 记录完成一个关卡
   */
  recordLevel: function(stats) {
    if (!stats) return;
    this.sessionStats.levelsCompleted++;
    this.sessionStats.totalTime += (stats.clearTime || 0);
    this.sessionStats.totalMistakes += (stats.mistakes || 0);
  },

  /**
   * 提交成绩到排行榜
   */
  submit: function(finalStats) {
    var name = this.playerName || '匿名修复员';
    var stats = finalStats || this.sessionStats;
    if (stats.levelsCompleted <= 0) return;

    var entry = {
      name: name,
      levels: stats.levelsCompleted,
      totalTime: Math.round(stats.totalTime || 0),
      mistakes: stats.totalMistakes || 0,
      date: new Date().toISOString().split('T')[0],
      timestamp: Date.now()
    };

    var list = this._loadAll();
    list.push(entry);
    list.sort(function(a, b) {
      if (b.levels !== a.levels) return b.levels - a.levels;
      return a.mistakes - b.mistakes;
    });
    var trimmed = list.slice(0, this.maxEntries);
    this._saveAll(trimmed);
    this._renderList(trimmed);
    window.game.addEventLog('[排行榜] 成绩已提交！关卡：' + entry.levels + '，失误：' + entry.mistakes);
  },

  getList: function() {
    return this._loadAll();
  },

  clear: function() {
    localStorage.removeItem(this.STORAGE_KEY);
    this._renderList([]);
    window.game.addEventLog('[排行榜] 已清空');
  },

  _loadAll: function() {
    try {
      var raw = localStorage.getItem(this.STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (e) { return []; }
  },

  _saveAll: function(list) {
    try {
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(list));
    } catch (e) {}
  },

  _savePlayerName: function() {
    try { localStorage.setItem('loopPrisonV16PlayerName', this.playerName); } catch (e) {}
  },

  _loadPlayerName: function() {
    try { return localStorage.getItem('loopPrisonV16PlayerName') || ''; } catch (e) { return ''; }
  },

  _updateUI: function() {
    this._renderList(this._loadAll());
    var nameDisplay = document.getElementById('player-name-display');
    if (nameDisplay) {
      nameDisplay.textContent = this.playerName || '未加入';
      nameDisplay.className = this.playerName ? 'player-name-active' : 'player-name-inactive';
    }
  },

  _renderList: function(list) {
    var container = document.getElementById('leaderboard-list');
    if (!container) return;

    if (list.length === 0) {
      container.innerHTML = '<div class="lb-empty">暂无记录 — 成为第一个逃脱永返的修复员吧！</div>';
      return;
    }

    var html = '';
    for (var i = 0; i < list.length; i++) {
      var e = list[i];
      var rankClass = i === 0 ? 'lb-rank-1' : i === 1 ? 'lb-rank-2' : i === 2 ? 'lb-rank-3' : '';
      var rankIcon = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : (i + 1);
      html += '<div class="lb-entry ' + rankClass + '">' +
        '<span class="lb-rank">' + rankIcon + '</span>' +
        '<span class="lb-name">' + this._escapeHtml(e.name) + '</span>' +
        '<span class="lb-levels">🔧' + e.levels + '关</span>' +
        '<span class="lb-mistakes">💥' + (e.mistakes || 0) + '</span>' +
        '<span class="lb-time">⏱' + (e.totalTime || 0) + 's</span>' +
        '<span class="lb-date">' + (e.date || '') + '</span>' +
        '</div>';
    }
    container.innerHTML = html;
  },

  _escapeHtml: function(str) {
    var div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  },

  init: function() {
    var saved = this._loadPlayerName();
    if (saved) this.playerName = saved;
    this._updateUI();
  }
};
