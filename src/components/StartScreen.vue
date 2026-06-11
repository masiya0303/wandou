<!-- ============================================================
 wandou v0.1 — 豌豆星际漂流 · 开始画面
============================================================ -->
<script setup lang="ts">
import { ref, computed } from 'vue'
import { useGameStore } from '../stores/gameStore'

const store = useGameStore()

const tab = ref<'new' | 'load'>('new')
const hasSave = computed(() => store.hasSave())

// 角色表单
const name = ref('')
const age = ref(25)
const gender = ref('')
const background = ref('')

// API 表单
const apiKey = ref('')
const baseUrl = ref('https://api.openai.com')
const model = ref('gpt-4o-mini')

const error = ref('')

function handleStart() {
  error.value = ''

  if (!name.value.trim()) {
    error.value = '请输入舰长姓名'
    return
  }
  if (!apiKey.value.trim()) {
    error.value = '请输入 API Key'
    return
  }

  store.updateApiConfig({
    apiKey: apiKey.value.trim(),
    baseUrl: baseUrl.value.trim() || 'https://api.openai.com',
    model: model.value.trim() || 'gpt-4o-mini',
  })

  store.updateCharacter({
    name: name.value.trim(),
    age: age.value,
    gender: gender.value,
    background: background.value.trim(),
  })

  store.startPlaying()
}

function handleLoad() {
  const ok = store.loadFromLocal()
  if (ok) {
    store.phase = 'playing'
  }
}

function handleDeleteSave() {
  if (confirm('确定删除存档？此操作不可撤销。')) {
    store.deleteSave()
  }
}
</script>

<template>
  <div class="start-screen">
    <!-- 星空背景 -->
    <div class="stars-bg"></div>

    <div class="start-container">
      <!-- 标题 -->
      <div class="title-section">
        <div class="title-icon">🛸</div>
        <h1 class="title">豌豆星际漂流</h1>
        <p class="subtitle">WANDOU · COSMIC DRIFTER v0.1</p>
      </div>

      <!-- Tab 切换 -->
      <div class="tab-bar">
        <button
          :class="['tab-btn', { active: tab === 'new' }]"
          @click="tab = 'new'"
        >
          🆕 新游戏
        </button>
        <button
          :class="['tab-btn', { active: tab === 'load' }]"
          @click="tab = 'load'"
          :disabled="!hasSave"
        >
          💾 继续冒险
        </button>
      </div>

      <!-- 新游戏表单 -->
      <div v-if="tab === 'new'" class="form-section">
        <!-- 角色信息 -->
        <div class="form-group">
          <label class="form-label">👤 舰长姓名</label>
          <input
            v-model="name"
            type="text"
            class="form-input"
            placeholder="输入你的舰长名..."
            @keydown.enter="handleStart"
          />
        </div>

        <div class="form-row">
          <div class="form-group flex-1">
            <label class="form-label">🎂 年龄</label>
            <input v-model.number="age" type="number" class="form-input" min="18" max="999" />
          </div>
          <div class="form-group flex-1">
            <label class="form-label">⚤ 性别</label>
            <select v-model="gender" class="form-input">
              <option value="">不透露</option>
              <option value="male">男性</option>
              <option value="female">女性</option>
              <option value="other">其他</option>
            </select>
          </div>
        </div>

        <div class="form-group">
          <label class="form-label">📝 背景简述（可选）</label>
          <textarea
            v-model="background"
            class="form-input form-textarea"
            placeholder="曾是星际联邦的军官，因一次意外事件选择独自流浪..."
            rows="2"
          ></textarea>
        </div>

        <hr class="divider" />

        <!-- API 配置 -->
        <div class="form-group">
          <label class="form-label">🔑 API Key</label>
          <input
            v-model="apiKey"
            type="password"
            class="form-input"
            placeholder="sk-..."
            @keydown.enter="handleStart"
          />
        </div>

        <div class="form-row">
          <div class="form-group flex-2">
            <label class="form-label">🌐 API 地址</label>
            <input v-model="baseUrl" type="text" class="form-input" placeholder="https://api.openai.com" />
          </div>
          <div class="form-group flex-1">
            <label class="form-label">🧠 模型</label>
            <input v-model="model" type="text" class="form-input" placeholder="gpt-4o-mini" />
          </div>
        </div>

        <p v-if="error" class="error-msg">{{ error }}</p>

        <button class="btn-start" @click="handleStart">
          🚀 启程
        </button>
      </div>

      <!-- 读档区 -->
      <div v-if="tab === 'load'" class="form-section">
        <p class="load-info">检测到存档，点击下方按钮继续冒险。</p>
        <button class="btn-start" @click="handleLoad">
          💾 继续上次冒险
        </button>
        <button class="btn-delete" @click="handleDeleteSave">
          🗑️ 删除存档
        </button>
      </div>

      <!-- 底部信息 -->
      <div class="footer-info">
        <span>基于 AI 大模型的星际文字冒险游戏</span>
        <span class="dot">·</span>
        <span>v0.1</span>
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

/* 星空背景 */
.stars-bg {
  position: fixed;
  inset: 0;
  background:
    radial-gradient(1px 1px at 10% 15%, rgba(255,255,255,0.6), transparent),
    radial-gradient(1px 1px at 20% 45%, rgba(255,255,255,0.4), transparent),
    radial-gradient(1.5px 1.5px at 35% 20%, rgba(255,255,255,0.7), transparent),
    radial-gradient(1px 1px at 50% 60%, rgba(255,255,255,0.5), transparent),
    radial-gradient(1.5px 1.5px at 65% 30%, rgba(255,255,255,0.6), transparent),
    radial-gradient(1px 1px at 75% 70%, rgba(255,255,255,0.3), transparent),
    radial-gradient(1px 1px at 85% 10%, rgba(255,255,255,0.5), transparent),
    radial-gradient(1.5px 1.5px at 90% 50%, rgba(255,255,255,0.6), transparent),
    radial-gradient(1px 1px at 15% 80%, rgba(255,255,255,0.4), transparent),
    radial-gradient(1px 1px at 40% 35%, rgba(255,255,255,0.5), transparent),
    radial-gradient(1.5px 1.5px at 55% 85%, rgba(255,255,255,0.3), transparent),
    radial-gradient(1px 1px at 70% 15%, rgba(255,255,255,0.6), transparent),
    linear-gradient(180deg, #0a0a1a 0%, #0d1b2a 40%, #1b2838 100%);
  z-index: -1;
}

.start-container {
  width: 100%;
  max-width: 480px;
  padding: 2rem;
  z-index: 1;
}

/* 标题 */
.title-section {
  text-align: center;
  margin-bottom: 2rem;
}

.title-icon {
  font-size: 3rem;
  margin-bottom: 0.5rem;
  animation: float 3s ease-in-out infinite;
}

@keyframes float {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-8px); }
}

.title {
  font-size: 2rem;
  font-weight: 700;
  color: #e0e8ff;
  margin: 0;
  letter-spacing: 0.05em;
  text-shadow: 0 0 20px rgba(100, 180, 255, 0.3);
}

.subtitle {
  font-size: 0.8rem;
  color: #6b8db5;
  margin: 0.3rem 0 0;
  letter-spacing: 0.15em;
}

/* Tab */
.tab-bar {
  display: flex;
  gap: 0.5rem;
  margin-bottom: 1.5rem;
}

.tab-btn {
  flex: 1;
  padding: 0.6rem;
  border: 1px solid #1e3a5f;
  border-radius: 8px;
  background: rgba(13, 27, 42, 0.8);
  color: #8ba4c0;
  font-size: 0.85rem;
  cursor: pointer;
  transition: all 0.2s;
}

.tab-btn.active {
  background: rgba(30, 60, 100, 0.6);
  border-color: #4a90d9;
  color: #c8dcff;
}

.tab-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

/* 表单 */
.form-section {
  background: rgba(13, 27, 42, 0.7);
  border: 1px solid #1e3a5f;
  border-radius: 12px;
  padding: 1.5rem;
}

.form-group {
  margin-bottom: 1rem;
}

.form-label {
  display: block;
  font-size: 0.8rem;
  color: #8ba4c0;
  margin-bottom: 0.35rem;
  font-weight: 500;
}

.form-input {
  width: 100%;
  padding: 0.6rem 0.75rem;
  border: 1px solid #1e3a5f;
  border-radius: 6px;
  background: rgba(8, 16, 28, 0.8);
  color: #d0dcf0;
  font-size: 0.9rem;
  font-family: inherit;
  box-sizing: border-box;
  transition: border-color 0.2s;
}

.form-input:focus {
  outline: none;
  border-color: #4a90d9;
  box-shadow: 0 0 0 2px rgba(74, 144, 217, 0.15);
}

.form-input::placeholder {
  color: #3a5070;
}

.form-textarea {
  resize: vertical;
  min-height: 44px;
}

.form-row {
  display: flex;
  gap: 0.75rem;
}

.flex-1 { flex: 1; }
.flex-2 { flex: 2; }

.divider {
  border: none;
  border-top: 1px solid #1e3a5f;
  margin: 1.25rem 0;
}

/* 按钮 */
.btn-start {
  width: 100%;
  padding: 0.75rem;
  border: none;
  border-radius: 8px;
  background: linear-gradient(135deg, #1a5fb4, #3584e4);
  color: #fff;
  font-size: 1rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
  font-family: inherit;
  margin-top: 0.5rem;
}

.btn-start:hover {
  background: linear-gradient(135deg, #226dc8, #4a94f0);
  box-shadow: 0 0 20px rgba(74, 144, 217, 0.3);
}

.btn-delete {
  width: 100%;
  padding: 0.6rem;
  border: 1px solid #5f1e1e;
  border-radius: 8px;
  background: transparent;
  color: #8b4a4a;
  font-size: 0.85rem;
  cursor: pointer;
  margin-top: 0.5rem;
  font-family: inherit;
  transition: all 0.15s;
}

.btn-delete:hover {
  background: rgba(120, 30, 30, 0.3);
  color: #d66;
}

/* 错误 */
.error-msg {
  color: #e05555;
  font-size: 0.8rem;
  margin: 0.5rem 0 0;
  text-align: center;
}

/* 读档 */
.load-info {
  color: #8ba4c0;
  font-size: 0.85rem;
  text-align: center;
  margin-bottom: 0.5rem;
}

/* 底部 */
.footer-info {
  text-align: center;
  margin-top: 1.5rem;
  font-size: 0.7rem;
  color: #405570;
}

.dot {
  margin: 0 0.4rem;
}
</style>
