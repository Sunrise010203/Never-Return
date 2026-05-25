import sys
sys.stdout.reconfigure(encoding='utf-8')
base = r'D:\大学资料\抖音AI创变者\loop-prison v1.9\loop-prison'
js = base + '/js'
css_path = base + '/css/style.css'

# ===============================================================
# PHASE 1a: Pause system - modify main.js
# ===============================================================
with open(js+'/main.js','r',encoding='utf-8') as f:
    m = f.read()

# Add isPaused flag near the top of window.game
if 'isPaused' not in m:
    m = m.replace(
        "state: 'menu',",
        "state: 'menu',\n  isPaused: false,"
    )
    print('1a: Added isPaused flag')

# Add pause toggle in keydown handler
old_keys_check = """  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code) ||
      ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyK'].includes(e.code)) {"""
new_keys_check = """  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code) ||
      ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyK', 'KeyP'].includes(e.code)) {"""
m = m.replace(old_keys_check, new_keys_check)

# Add pause handler in keydown event (after keys[e.code]=true line)
old_kd = """window.addEventListener('keydown', (e) => {
  window.game.keys[e.code] = true;

  // \u9632\u6b62\u65b9\u5411\u952e\u548c WASD \u6eda\u52a8\u9875\u9762"""
new_kd = """window.addEventListener('keydown', (e) => {
  window.game.keys[e.code] = true;

  // Escape/P \u6682\u505c\u5207\u6362
  if (e.code === 'Escape' || e.code === 'KeyP') {
    if (window.game.state === 'playing' || window.game.state === 'paused') {
      window.game.togglePause();
      e.preventDefault();
      return;
    }
  }

  // \u9632\u6b62\u65b9\u5411\u952e\u548c WASD \u6eda\u52a8\u9875\u9762"""
m = m.replace(old_kd, new_kd)
print('1a: Added pause key handler')

# Add togglePause method after stopGame or somewhere before gameLoop
if 'togglePause' not in m:
    m = m.replace(
        "gameLoop(timestamp) {",
        "  togglePause() {\n    this.isPaused = !this.isPaused;\n    this.state = this.isPaused ? 'paused' : 'playing';\n    var overlay = document.getElementById('pause-overlay');\n    if (overlay) {\n      overlay.className = this.isPaused ? 'overlay-visible' : 'overlay-hidden';\n    }\n    // Pause/resume audio context\n    if (window.game.audio && window.game.audio._ctx) {\n      if (this.isPaused) {\n        window.game.audio._ctx.suspend();\n      } else {\n        window.game.audio._ctx.resume();\n      }\n    }\n    console.log('[Game] pause:', this.isPaused);\n  },\n\n  gameLoop(timestamp) {"
    )
    print('1a: Added togglePause method')

# Add pause check at start of gameLoop (after deltaTime calc, before drawing)
old_loop_start = """    // \u6e05\u9664\u753b\u5e03
    if (this.ctx) {
      this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    }

    // ---- \u8df3\u8fc7\u5173\u5361\uff08K \u952e\uff09----"""
new_loop_start = """    // ---- \u6682\u505c\u68c0\u6d4b ----
    if (this.state === 'paused') {
      // \u4ecd\u7136\u7ed8\u5236\u5f53\u524d\u5e27
      if (this.ctx) {
        this._drawCurrentFrame();
      }
      this._animationId = requestAnimationFrame((t) => this.gameLoop(t));
      return;
    }

    // \u6e05\u9664\u753b\u5e03
    if (this.ctx) {
      this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    }

    // ---- \u8df3\u8fc7\u5173\u5361\uff08K \u952e\uff09----"""
m = m.replace(old_loop_start, new_loop_start)
print('1a: Added pause check in gameLoop')

# Add _drawCurrentFrame helper (before gameLoop)
if '_drawCurrentFrame' not in m:
    m = m.replace(
        "gameLoop(timestamp) {",
        "  _drawCurrentFrame() {\n    if (!this.ctx) return;\n    if (this.map && typeof this.map.draw === 'function') {\n      this.map.draw(this.ctx);\n    }\n    if (this.player1 && typeof this.player1.draw === 'function') {\n      this.player1.draw(this.ctx);\n    }\n    if (this.aiPlayer && typeof this.aiPlayer.draw === 'function') {\n      this.aiPlayer.draw(this.ctx);\n    }\n  },\n\n  gameLoop(timestamp) {"
    )
    print('1a: Added _drawCurrentFrame')

# Bind resume button
old_after_start = """    // \u91cd\u65b0\u5f00\u59cb\u6309\u94ae\u70b9\u51fb
    this._btnRetry.addEventListener('click'"""
# We'll add this in the startGame section
btn_resume_code = """
    // \u7ee7\u7eed\u6309\u94ae\u70b9\u51fb
    document.getElementById('btn-resume').addEventListener('click', () => {
      if (this.isPaused) this.togglePause();
    });"""
m = m.replace(old_after_start, btn_resume_code + '\n' + old_after_start)
print('1a: Added resume button binding')

with open(js+'/main.js','w',encoding='utf-8') as f:
    f.write(m)
print('1a: main.js updated')

# ===============================================================
# PHASE 1a: Pause CSS
# ===============================================================
with open(css_path,'r',encoding='utf-8') as f:
    css = f.read()

pause_css = """
/* ===== Pause overlay ===== */
#pause-overlay {
  position: fixed;
  top: 0; left: 0; right: 0; bottom: 0;
  background: rgba(0, 0, 0, 0.75);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  transition: opacity 0.2s ease;
}
#pause-overlay.overlay-hidden { display: none; }
#pause-overlay.overlay-visible { display: flex; }
.pause-content {
  text-align: center;
  color: #fff;
}
.pause-icon { font-size: 64px; margin-bottom: 10px; }
.pause-title { font-size: 32px; font-weight: bold; margin-bottom: 10px; color: #ff6b35; }
.pause-hint { font-size: 14px; color: #888; margin-bottom: 20px; }
.pause-btn {
  background: #ff6b35;
  color: #fff;
  border: none;
  padding: 10px 30px;
  font-size: 16px;
  border-radius: 4px;
  cursor: pointer;
  font-family: inherit;
}
.pause-btn:hover { background: #ff8c5a; }
"""

if '#pause-overlay' not in css:
    css += pause_css
    print('1a: Added pause CSS')

# ===============================================================
# PHASE 3a: Settings modal CSS
# ===============================================================
settings_css = """
/* ===== Settings gear + modal ===== */
.settings-gear {
  position: fixed;
  bottom: 15px;
  right: 15px;
  width: 40px;
  height: 40px;
  background: rgba(255, 107, 53, 0.8);
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 50%;
  color: #fff;
  font-size: 20px;
  cursor: pointer;
  z-index: 900;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.2s;
}
.settings-gear:hover { background: #ff6b35; }

#settings-modal {
  position: fixed;
  top: 0; left: 0; right: 0; bottom: 0;
  background: rgba(0, 0, 0, 0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1100;
}
#settings-modal.modal-hidden { display: none; }
#settings-modal.modal-visible { display: flex; }
.modal-content {
  background: #1a1a2e;
  border: 1px solid #333;
  border-radius: 8px;
  padding: 0;
  width: 400px;
  max-width: 90vw;
  color: #ccc;
}
.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 15px 20px;
  border-bottom: 1px solid #333;
  font-size: 18px;
  font-weight: bold;
  color: #fff;
}
.modal-close {
  background: none;
  border: none;
  color: #888;
  font-size: 20px;
  cursor: pointer;
}
.modal-close:hover { color: #fff; }
.modal-body { padding: 20px; }
.modal-footer {
  padding: 10px 20px;
  border-top: 1px solid #333;
  font-size: 12px;
  color: #666;
}
.setting-group {
  margin-bottom: 12px;
  display: flex;
  align-items: center;
  gap: 10px;
}
.setting-group label {
  width: 100px;
  font-size: 14px;
  flex-shrink: 0;
}
.setting-group input[type=range] { flex: 1; }
.setting-group input[type=text],
.setting-group input[type=password] {
  flex: 1;
  background: #0a0a1a;
  border: 1px solid #333;
  color: #ccc;
  padding: 6px 10px;
  border-radius: 4px;
  font-family: monospace;
  font-size: 13px;
}
.settings-btn {
  background: #ff6b35;
  color: #fff;
  border: none;
  padding: 8px 20px;
  font-size: 14px;
  border-radius: 4px;
  cursor: pointer;
  margin-right: 10px;
}
.settings-btn:hover { background: #ff8c5a; }
#setting-connection-status { font-size: 13px; }
.controls-help { margin: 0; text-align: center; color: #555; }
"""

if '#settings-modal' not in css:
    css += settings_css
    print('3a: Added settings CSS')

# ===============================================================
# PHASE 3b: Tutorial overlay CSS
# ===============================================================
tutorial_css = """
/* ===== Tutorial overlay ===== */
#tutorial-overlay {
  position: fixed;
  top: 0; left: 0; right: 0; bottom: 0;
  background: rgba(0, 0, 0, 0.8);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1200;
}
#tutorial-overlay.modal-hidden { display: none; }
#tutorial-overlay.modal-visible { display: flex; }
.tutorial-content {
  background: #1a1a2e;
  border: 1px solid #ff6b35;
  border-radius: 12px;
  padding: 30px;
  width: 420px;
  max-width: 90vw;
  text-align: center;
}
.tutorial-step { display: none; padding: 20px 0; }
.tutorial-step-active { display: block; }
.tutorial-icon { font-size: 48px; margin-bottom: 15px; }
.tutorial-text { font-size: 16px; line-height: 1.6; color: #ccc; }
.tutorial-text b { color: #ff6b35; }
.tutorial-dots { margin: 15px 0; }
.tutorial-dot {
  display: inline-block;
  width: 10px; height: 10px;
  border-radius: 50%;
  background: #333;
  margin: 0 5px;
  transition: background 0.3s;
}
.tutorial-dot-active { background: #ff6b35; }
.tutorial-nav { display: flex; justify-content: space-between; gap: 10px; }
.tutorial-btn {
  flex: 1;
  background: #333;
  color: #fff;
  border: none;
  padding: 10px 20px;
  font-size: 14px;
  border-radius: 4px;
  cursor: pointer;
}
.tutorial-btn:disabled { opacity: 0.4; cursor: default; }
.tutorial-btn-primary { background: #ff6b35; }
.tutorial-btn-primary:hover { background: #ff8c5a; }
"""

if '#tutorial-overlay' not in css:
    css += tutorial_css
    print('3b: Added tutorial CSS')

with open(css_path,'w',encoding='utf-8') as f:
    f.write(css)
print('CSS updated')

# ===============================================================
# PHASE 1b: Merge CLAUDE.md into AGENTS.md
# ===============================================================
with open(base+'/AGENTS.md','r',encoding='utf-8') as f:
    agents = f.read()
with open(base+'/CLAUDE.md','r',encoding='utf-8') as f:
    claude = f.read()

# Update header in AGENTS.md
agents = agents.replace(
    '# \u6c38\u8fd4 \u2014 \u9879\u76ee AGENTS.md',
    '# \u6c38\u8fd4 \u2014 \u9879\u76ee AI Agents \u6307\u5357\n# \u9002\u7528\u4e8e Codex / Claude \u7b49 AI Agent'
)

# Add llmClient and spriteLoader from CLAUDE.md if not in AGENTS.md
if 'llmClient' not in agents:
    claude_table = claude[claude.find('| \u603b\u63a7'):]
    claude_table = claude_table[:claude_table.find('\n##')]
    agents = agents.replace(
        '| \u559c\u5254 | window.game.roast | generate |',
        '| \u559c\u5254 | window.game.roast | generate |\n| \u7cbe\u7075 | window.game.sprites | loadAll, loadSheet, drawCharacter, getFrameIndex, updateAnim |\n| LLM | window.game.llmClient | sendCommand, setApiKey, setEndpoint, testConnection |'
    )
    print('1b: Added llmClient/spriteLoader to AGENTS.md')

with open(base+'/AGENTS.md','w',encoding='utf-8') as f:
    f.write(agents)

import os
os.remove(base+'/CLAUDE.md')
print('1b: Merged CLAUDE.md into AGENTS.md, deleted CLAUDE.md')

# ===============================================================
# PHASE 1c: Loading progress bar - Add to index.html
# ===============================================================
with open(base+'/index.html','r',encoding='utf-8') as f:
    html = f.read()

# Add loading bar after body start (before canvas-wrapper)
loading_bar = '''
  <!-- Loading progress bar -->
  <div id="loading-bar" class="loading-hidden">
    <div class="loading-container">
      <div class="loading-title">\u6c38\u8fd4 \u00b7 LOOP PRISON</div>
      <div class="loading-track">
        <div id="loading-fill" class="loading-fill" style="width: 0%"></div>
      </div>
      <div id="loading-text" class="loading-text">\u52a0\u8f7d\u7d20\u6750\u4e2d...</div>
    </div>
  </div>
'''

html = html.replace('<div class="canvas-wrapper">', loading_bar + '\n    <div class="canvas-wrapper">')
print('1c: Added loading bar HTML')

with open(base+'/index.html','w',encoding='utf-8') as f:
    f.write(html)

# Add loading bar CSS
loading_css = """
/* ===== Loading bar ===== */
#loading-bar {
  position: fixed;
  top: 0; left: 0; right: 0; bottom: 0;
  background: #0a0a1a;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
}
#loading-bar.loading-hidden { display: none; }
#loading-bar.loading-visible { display: flex; }
.loading-container { text-align: center; width: 320px; }
.loading-title { font-size: 20px; color: #ff6b35; margin-bottom: 20px; letter-spacing: 2px; }
.loading-track {
  width: 100%; height: 6px;
  background: #1a1a2e;
  border-radius: 3px;
  overflow: hidden;
}
.loading-fill {
  height: 100%;
  background: linear-gradient(90deg, #ff6b35, #ff8c5a, #ff6b35);
  background-size: 200% 100%;
  border-radius: 3px;
  transition: width 0.3s ease;
  animation: loading-shimmer 1.5s infinite;
}
@keyframes loading-shimmer {
  0% { background-position: 0% 0%; }
  100% { background-position: -200% 0%; }
}
.loading-text { font-size: 13px; color: #666; margin-top: 10px; }
"""

with open(css_path,'r',encoding='utf-8') as f:
    css = f.read()
if '#loading-bar' not in css:
    css += '\n' + loading_css
    with open(css_path,'w',encoding='utf-8') as f:
        f.write(css)
    print('1c: Added loading bar CSS')

# ===============================================================
# PHASE 1c: Modify spriteLoader.js to report progress
# ===============================================================
with open(js+'/spriteLoader.js','r',encoding='utf-8') as f:
    sl = f.read()

if 'loadingProgress' not in sl:
    # Add loadingProgress and onProgress
    sl = sl.replace(
        "  loaded: false,",
        "  loaded: false,\n  loadingProgress: 0,\n  onProgress: null,\n  _totalToLoad: 0,\n  _loadedCount: 0,"
    )
    # Add progress tracking to _loadRole
    sl = sl.replace(
        "  async _loadRole(role) {",
        "  async _loadRole(role) {\n    this._totalToLoad += 5; // idle, walk1, walk2, jump, crouch"
    )
    # Add progress tracking to _loadEnv
    sl = sl.replace(
        "  async _loadEnv() {",
        "  async _loadEnv() {\n    this._totalToLoad += 5; // bg, platform, spikes, wall, finish, button"
    )
    # Add progress update after each image load in _loadRole
    sl = sl.replace(
        "      return null;\n    }\n    return img;\n  },\n\n  /**",
        "      return null;\n    }\n    this._loadedCount++;\n    this.loadingProgress = Math.min(100, Math.round((this._loadedCount / Math.max(1, this._totalToLoad)) * 100));\n    if (this.onProgress) this.onProgress(this.loadingProgress);\n    var fillEl = document.getElementById('loading-fill');\n    if (fillEl) fillEl.style.width = this.loadingProgress + '%';\n    var textEl = document.getElementById('loading-text');\n    if (textEl) textEl.textContent = '\u52a0\u8f7d\u7d20\u6750 ' + this.loadingProgress + '%';\n    return img;\n  },\n\n  /**"
    )
    print('1c: Added progress tracking to spriteLoader')

with open(js+'/spriteLoader.js','w',encoding='utf-8') as f:
    f.write(sl)

# ===============================================================
# PHASE 1c: Modify main.js startGame to show/hide loading bar
# ===============================================================
with open(js+'/main.js','r',encoding='utf-8') as f:
    m = f.read()

# In startGame, show loading bar and hide after sprites loaded
old_start = """    // \u83b7\u53d6\u6309\u94ae\u5f15\u7528
    this._overlay = document.getElementById('game-overlay');"""
new_start = """    // \u663e\u793a\u52a0\u8f7d\u8fdb\u5ea6\u6761
    var loadBar = document.getElementById('loading-bar');
    if (loadBar) loadBar.className = 'loading-visible';

    // \u83b7\u53d6\u6309\u94ae\u5f15\u7528
    this._overlay = document.getElementById('game-overlay');"""
m = m.replace(old_start, new_start)
print('1c: Added loading bar show in startGame')

# Hide loading bar after sprites loaded
old_sprite_check = """    if (this.sprites && typeof this.sprites.loadAll === 'function') {
      this.sprites.loadAll().then(() => {"""
new_sprite_check = """    if (this.sprites && typeof this.sprites.loadAll === 'function') {
      this.sprites.loadAll().then(() => {
        // \u9690\u85cf\u52a0\u8f7d\u6761
        var loadBar2 = document.getElementById('loading-bar');
        if (loadBar2) loadBar2.className = 'loading-hidden';"""
m = m.replace(old_sprite_check, new_sprite_check)
print('1c: Added loading bar hide after sprites load')

with open(js+'/main.js','w',encoding='utf-8') as f:
    f.write(m)

print()
print('=== Phase 1 complete ===')
