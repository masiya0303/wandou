<!-- ============================================================
 wandou v0.3 — 豌豆星际漂流 · 开始画面
 多层背景 + 光球脉动 + 粒子闪烁 + 浮光 + 玻璃卡片菜单 + 角标
============================================================ -->
<script setup lang="ts">
import { ref, computed } from 'vue'
import { useGameStore } from '../stores/gameStore'

const store = useGameStore()
const tab = ref<'new' | 'load'>('new')
const hasSave = computed(() => store.hasSave())

const name = ref('')
const age = ref(25)
const gender = ref('')
const background = ref('')

const apiKey = ref('')
const baseUrl = ref('https://api.openai.com')
const model = ref('gpt-4o-mini')
const error = ref('')

function handleStart() {
  error.value = ''
  if (!name.value.trim()) { error.value = '请输入舰长姓名'; return }
  if (!apiKey.value.trim()) { error.value = '请输入 API Key'; return }
  store.updateApiConfig({ apiKey: apiKey.value.trim(), baseUrl: baseUrl.value.trim() || 'https://api.openai.com', model: model.value.trim() || 'gpt-4o-mini' })
  store.updateCharacter({ name: name.value.trim(), age: age.value, gender: gender.value, background: background.value.trim() })
  store.startPlaying()
}
function handleLoad() { if (store.loadFromLocal()) store.phase = 'playing' }
function handleDeleteSave() { if (confirm('确定删除存档？此操作不可撤销。')) store.deleteSave() }
</script>

<template>
  <div class="start-screen">
    <!-- Layer 1: 深空底色 -->
    <div class="bg-base"></div>

    <!-- Layer 2: 光球脉动 -->
    <div class="bg-orbs">
      <div class="orb orb-cyan"></div>
      <div class="orb orb-blue"></div>
      <div class="orb orb-purple"></div>
    </div>

    <!-- Layer 3: 闪烁星点 -->
    <div class="bg-particles">
      <span v-for="n in 25" :key="'p'+n" class="star-dot" :style="{
        left: ((n * 37 + 13) % 100) + '%',
        top: ((n * 53 + 7) % 100) + '%',
        width: (2 + (n % 3)) + 'px',
        height: (2 + (n % 3)) + 'px',
        animationDelay: (n * 0.23) + 's',
        animationDuration: (2.5 + (n % 4) * 1.3) + 's'
      }"></span>
    </div>

    <!-- Layer 4: 浮光下落 -->
    <div class="floating-lights">
      <span v-for="n in 12" :key="'f'+n" class="float-light" :style="{
        left: ((n * 79 + 11) % 100) + '%',
        width: (4 + (n % 7)) + 'px',
        height: (4 + (n % 7)) + 'px',
        animationDelay: (n * 1.7) + 's',
        animationDuration: (8 + n * 1.5) + 's'
      }"></span>
    </div>

    <!-- 主内容 -->
    <div class="start-container">
      <!-- 标题区 -->
      <div class="title-section">
        <div class="title-icon-wrapper">
          <span class="orbit-ring"></span>
          <span class="title-icon">🛸</span>
        </div>
        <h1 class="title glow-text">豌豆星际漂流</h1>
        <p class="subtitle">WANDOU · COSMIC DRIFTER</p>
        <hr class="cyan-divider" />
      </div>

      <!-- Tab -->
      <div class="tab-bar">
        <button :class="['tab-btn glass-panel', { active: tab === 'new' }]" @click="tab = 'new'">
          <span class="tb-cn">🆕 新游戏</span>
          <span class="tb-en">NEW GAME</span>
        </button>
        <button :class="['tab-btn glass-panel', { active: tab === 'load' }]" @click="tab = 'load'" :disabled="!hasSave">
          <span class="tb-cn">💾 继续冒险</span>
          <span class="tb-en">CONTINUE</span>
        </button>
      </div>

      <!-- 新游戏 -->
      <div v-if="tab === 'new'" class="form-card glass-panel corner-deco">
        <!-- 角色 -->
        <div class="form-group">
          <label class="form-label">👤 舰长姓名 <span class="label-en">CAPTAIN NAME</span></label>
          <input v-model="name" type="text" class="form-input" placeholder="输入你的舰长名..." @keydown.enter="handleStart" />
        </div>
        <div class="form-row">
          <div class="form-group flex-1">
            <label class="form-label">🎂 年龄 <span class="label-en">AGE</span></label>
            <input v-model.number="age" type="number" class="form-input" min="18" max="999" />
          </div>
          <div class="form-group flex-1">
            <label class="form-label">⚤ 性别 <span class="label-en">GENDER</span></label>
            <select v-model="gender" class="form-input">
              <option value="">不透露</option><option value="male">男性</option><option value="female">女性</option><option value="other">其他</option>
            </select>
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">📝 背景简述 <span class="label-en">BACKGROUND</span></label>
          <textarea v-model="background" class="form-input form-textarea" placeholder="曾是星际联邦的军官，因一次意外事件选择独自流浪..." rows="2"></textarea>
        </div>

        <hr class="accent-divider" />

        <!-- API -->
        <div class="form-group">
          <label class="form-label">🔑 API Key <span class="label-en">AUTHENTICATION</span></label>
          <input v-model="apiKey" type="password" class="form-input" placeholder="sk-..." @keydown.enter="handleStart" />
        </div>
        <div class="form-row">
          <div class="form-group flex-2">
            <label class="form-label">🌐 API 地址 <span class="label-en">ENDPOINT</span></label>
            <input v-model="baseUrl" type="text" class="form-input" placeholder="https://api.openai.com" />
          </div>
          <div class="form-group flex-1">
            <label class="form-label">🧠 模型 <span class="label-en">MODEL</span></label>
            <input v-model="model" type="text" class="form-input" placeholder="gpt-4o-mini" />
          </div>
        </div>

        <p v-if="error" class="error-msg">{{ error }}</p>

        <button class="btn-launch corner-deco" @click="handleStart">
          <span class="btn-cn">🚀 启程</span>
          <span class="btn-en">LAUNCH</span>
        </button>
      </div>

      <!-- 读档 -->
      <div v-if="tab === 'load'" class="form-card glass-panel corner-deco">
        <p class="load-info">检测到存档，继续你的星际冒险。</p>
        <button class="btn-launch corner-deco" @click="handleLoad">
          <span class="btn-cn">💾 继续上次冒险</span>
          <span class="btn-en">RESUME</span>
        </button>
        <button class="btn-delete" @click="handleDeleteSave">🗑️ 删除存档</button>
      </div>

      <!-- 底部 -->
      <div class="footer-info">
        <hr class="accent-divider" />
        <span>AI 驱动的星际文字冒险游戏</span>
        <span class="dot">·</span>
        <span>WANDOU v0.3</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.start-screen {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  overflow: hidden;
}

/* ===== Layer 1: 深空底色 ===== */
.bg-base {
  position: fixed; inset: 0; z-index: -4;
  background:
    radial-gradient(ellipse at 30% 20%, rgba(10, 40, 80, 0.3) 0%, transparent 60%),
    radial-gradient(ellipse at 70% 80%, rgba(20, 10, 50, 0.25) 0%, transparent 55%),
    linear-gradient(180deg, #0a0a1a 0%, #0d1b2a 40%, #111d2d 100%);
}

/* ===== Layer 2: 光球脉动 ===== */
.bg-orbs { position: fixed; inset: 0; z-index: -3; overflow: hidden; pointer-events: none; }
.orb {
  position: absolute; border-radius: 50%;
  filter: blur(80px);
  animation: orb-pulse 8s ease-in-out infinite;
}
.orb-cyan  { width: 400px; height: 400px; top: 10%; left: 15%; background: rgba(0, 229, 255, 0.12); animation-delay: 0s; }
.orb-blue  { width: 500px; height: 500px; bottom: 5%; right: 10%; background: rgba(74, 144, 217, 0.1); animation-delay: -3s; }
.orb-purple { width: 350px; height: 350px; top: 50%; left: 50%; background: rgba(130, 80, 220, 0.08); animation-delay: -5s; }

/* ===== Layer 3: 闪烁星点 ===== */
.bg-particles { position: fixed; inset: 0; z-index: -2; pointer-events: none; }
.star-dot {
  position: absolute; border-radius: 50%;
  background: var(--accent-cyan);
  box-shadow: 0 0 6px var(--accent-cyan-glow);
  animation: twinkle ease-in-out infinite;
}

/* ===== Layer 4: 浮光下落 ===== */
.floating-lights { position: fixed; inset: 0; z-index: -1; pointer-events: none; overflow: hidden; }
.float-light {
  position: absolute; top: -10px; border-radius: 50%;
  background: radial-gradient(circle, rgba(200, 230, 255, 0.7), transparent);
  animation: float-down linear infinite;
}

/* ===== 主容器 ===== */
.start-container {
  width: 100%; max-width: 480px; padding: 1.5rem 2rem; z-index: 1;
}

/* ===== 标题 ===== */
.title-section { text-align: center; margin-bottom: 1.5rem; }
.title-icon-wrapper { position: relative; display: inline-block; margin-bottom: 0.3rem; }
.title-icon { font-size: 3rem; position: relative; z-index: 1; animation: float 3s ease-in-out infinite; }
@keyframes float { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-6px)} }
.orbit-ring {
  position: absolute; inset: -10px; border-radius: 50%;
  border: 1px solid rgba(0, 229, 255, 0.2);
  animation: orbit-spin 8s linear infinite;
}
.title {
  font-size: 2rem; font-weight: 700; color: #e0e8ff; margin: 0;
  letter-spacing: 0.05em; animation: glow-pulse 4s ease-in-out infinite;
}
.subtitle {
  font-size: 0.7rem; color: #6b8db5; margin: 0.2rem 0 0; letter-spacing: 0.2em;
}

/* ===== Tab ===== */
.tab-bar { display: flex; gap: 0.5rem; margin-bottom: 1rem; }
.tab-btn {
  flex: 1; padding: 0.55rem 0.4rem; border: 1px solid var(--glass-border);
  border-radius: 10px; background: var(--glass-bg); color: var(--text-secondary);
  cursor: pointer; transition: all 0.3s; display: flex; flex-direction: column; align-items: center; gap: 0.15rem;
}
.tab-btn.active { background: rgba(0, 229, 255, 0.08); border-color: var(--accent-cyan); color: var(--text-primary); }
.tab-btn:disabled { opacity: 0.35; cursor: not-allowed; }
.tb-cn { font-size: 0.85rem; font-weight: 500; }
.tb-en { font-size: 0.55rem; letter-spacing: 0.1em; color: var(--text-muted); }
.tab-btn.active .tb-en { color: var(--accent-cyan); }

/* ===== 表单卡片 ===== */
.form-card {
  padding: 1.5rem; border-radius: 14px; margin-bottom: 1rem;
}

.form-group { margin-bottom: 0.9rem; }
.form-label { display: block; font-size: 0.78rem; color: var(--text-secondary); margin-bottom: 0.3rem; font-weight: 500; }
.label-en { font-size: 0.55rem; color: var(--text-muted); letter-spacing: 0.1em; margin-left: 0.3rem; }
.form-input {
  width: 100%; padding: 0.55rem 0.7rem; border: 1px solid var(--border);
  border-radius: 6px; background: rgba(8, 16, 28, 0.8); color: var(--text-primary);
  font-size: 0.88rem; font-family: inherit; box-sizing: border-box;
  transition: border-color 0.2s, box-shadow 0.2s;
}
.form-input:focus { outline: none; border-color: var(--accent-cyan); box-shadow: 0 0 0 2px rgba(0, 229, 255, 0.12), 0 0 12px rgba(0, 229, 255, 0.08); }
.form-input::placeholder { color: #3a5070; }
.form-textarea { resize: vertical; min-height: 44px; }
.form-row { display: flex; gap: 0.75rem; }
.flex-1 { flex: 1; } .flex-2 { flex: 2; }

/* ===== 启程按钮 ===== */
.btn-launch {
  width: 100%; padding: 0.7rem; border: 1px solid var(--accent-cyan);
  border-radius: 10px; background: rgba(0, 229, 255, 0.08); color: #e0f0ff;
  font-size: 1rem; font-weight: 600; cursor: pointer; font-family: inherit;
  transition: all 0.3s; margin-top: 0.3rem;
  display: flex; flex-direction: column; align-items: center; gap: 0.1rem;
}
.btn-launch:hover {
  background: rgba(0, 229, 255, 0.15); border-color: var(--accent-cyan);
  box-shadow: 0 0 25px var(--accent-cyan-glow); transform: translateY(-2px);
}
.btn-cn { font-size: 0.95rem; }
.btn-en { font-size: 0.55rem; letter-spacing: 0.15em; color: var(--accent-cyan); }

/* ===== 读档 ===== */
.load-info { color: var(--text-secondary); font-size: 0.85rem; text-align: center; margin-bottom: 0.5rem; }
.btn-delete {
  width: 100%; padding: 0.5rem; border: 1px solid #5f1e1e; border-radius: 8px;
  background: transparent; color: #8b4a4a; font-size: 0.8rem; cursor: pointer;
  font-family: inherit; margin-top: 0.4rem; transition: all 0.2s;
}
.btn-delete:hover { background: rgba(120, 30, 30, 0.3); color: #d66; }

/* ===== 错误 ===== */
.error-msg { color: #e05555; font-size: 0.78rem; margin: 0.4rem 0 0; text-align: center; }

/* ===== 底部 ===== */
.footer-info { text-align: center; margin-top: 0.8rem; font-size: 0.65rem; color: #405570; }
.dot { margin: 0 0.4rem; }
</style>
