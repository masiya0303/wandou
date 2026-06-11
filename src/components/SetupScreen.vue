<!-- ============================================================
 wandou v0.4 — 豌豆星际漂流 · 启程准备页
 角色创建 + API 配置
============================================================ -->
<script setup lang="ts">
import { ref } from 'vue'
import { useGameStore } from '../stores/gameStore'

const store = useGameStore()

const name = ref(store.character.name || '')
const age = ref(store.character.age || 25)
const gender = ref(store.character.gender || '')
const background = ref(store.character.background || '')

const apiKey = ref(store.apiConfig.apiKey || '')
const baseUrl = ref(store.apiConfig.baseUrl || 'https://api.openai.com')
const model = ref(store.apiConfig.model || 'gpt-4o-mini')

const error = ref('')

function handleLaunch() {
  error.value = ''
  if (!name.value.trim()) { error.value = '请输入舰长姓名'; return }
  if (!apiKey.value.trim()) { error.value = '请输入 API Key'; return }

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

function handleBack() {
  // 保存已填写的配置到 store（方便下次打开时恢复）
  store.updateApiConfig({
    apiKey: apiKey.value.trim(),
    baseUrl: baseUrl.value.trim(),
    model: model.value.trim(),
  })
  store.updateCharacter({
    name: name.value.trim(),
    age: age.value,
    gender: gender.value,
    background: background.value.trim(),
  })
  store.phase = 'worldList'
}
</script>

<template>
  <div class="setup-screen">
    <!-- 背景（与开始页共享风格） -->
    <div class="bg-base"></div>
    <div class="bg-orbs">
      <div class="orb orb-cyan"></div>
      <div class="orb orb-blue"></div>
    </div>
    <div class="bg-particles">
      <span v-for="n in 20" :key="'p'+n" class="star-dot" :style="{
        left: ((n * 37 + 13) % 100) + '%', top: ((n * 53 + 7) % 100) + '%',
        width: (2 + (n % 3)) + 'px', height: (2 + (n % 3)) + 'px',
        animationDelay: (n * 0.23) + 's', animationDuration: (2.5 + (n % 4) * 1.3) + 's'
      }"></span>
    </div>

    <!-- 主内容 -->
    <div class="setup-container">
      <!-- 标题 -->
      <div class="title-section">
        <span class="title-icon">🛸</span>
        <h1 class="title glow-text">启程准备</h1>
        <p class="subtitle">PREPARATION</p>
        <hr class="cyan-divider" />
      </div>

      <!-- 表单卡片 -->
      <div class="form-card glass-panel corner-deco">
        <!-- 角色信息 -->
        <div class="section-label">
          <span class="sl-cn">👤 舰长信息</span>
          <span class="sl-en">CAPTAIN PROFILE</span>
        </div>

        <div class="form-group">
          <label class="form-label">姓名 <span class="label-en">NAME</span></label>
          <input v-model="name" type="text" class="form-input" placeholder="输入你的舰长名..." @keydown.enter="handleLaunch" />
        </div>
        <div class="form-row">
          <div class="form-group flex-1">
            <label class="form-label">年龄 <span class="label-en">AGE</span></label>
            <input v-model.number="age" type="number" class="form-input" min="18" max="999" />
          </div>
          <div class="form-group flex-1">
            <label class="form-label">性别 <span class="label-en">GENDER</span></label>
            <select v-model="gender" class="form-input">
              <option value="">不透露</option>
              <option value="male">男性</option>
              <option value="female">女性</option>
              <option value="other">其他</option>
            </select>
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">背景简述 <span class="label-en">BACKGROUND</span></label>
          <textarea v-model="background" class="form-input form-textarea" placeholder="曾是星际联邦的军官，因一次意外事件选择独自流浪..." rows="2"></textarea>
        </div>

        <hr class="accent-divider" />

        <!-- API 配置 -->
        <div class="section-label">
          <span class="sl-cn">🔌 连接配置</span>
          <span class="sl-en">API CONFIGURATION</span>
        </div>

        <div class="form-group">
          <label class="form-label">API Key <span class="label-en">AUTH</span></label>
          <input v-model="apiKey" type="password" class="form-input" placeholder="sk-..." @keydown.enter="handleLaunch" />
        </div>
        <div class="form-row">
          <div class="form-group flex-2">
            <label class="form-label">API 地址 <span class="label-en">ENDPOINT</span></label>
            <input v-model="baseUrl" type="text" class="form-input" placeholder="https://api.openai.com" />
          </div>
          <div class="form-group flex-1">
            <label class="form-label">模型 <span class="label-en">MODEL</span></label>
            <input v-model="model" type="text" class="form-input" placeholder="gpt-4o-mini" />
          </div>
        </div>

        <p v-if="error" class="error-msg">{{ error }}</p>

        <button class="btn-launch corner-deco" @click="handleLaunch">
          <span class="btn-cn">🚀 启程</span>
          <span class="btn-en">LAUNCH</span>
        </button>
      </div>

      <!-- 返回 -->
      <button class="btn-back glass-panel" @click="handleBack">
        ← 返回主菜单
      </button>
    </div>
  </div>
</template>

<style scoped>
.setup-screen {
  min-height: 100vh; display: flex; align-items: center; justify-content: center;
  position: relative; overflow: hidden;
}

/* 背景复用 StartScreen 风格 */
.bg-base { position: fixed; inset: 0; z-index: -4;
  background: radial-gradient(ellipse at 30% 20%, rgba(10, 40, 80, 0.3) 0%, transparent 60%),
              radial-gradient(ellipse at 70% 80%, rgba(20, 10, 50, 0.25) 0%, transparent 55%),
              linear-gradient(180deg, #0a0a1a 0%, #0d1b2a 40%, #111d2d 100%); }
.bg-orbs { position: fixed; inset: 0; z-index: -3; overflow: hidden; pointer-events: none; }
.orb { position: absolute; border-radius: 50%; filter: blur(80px); animation: orb-pulse 8s ease-in-out infinite; }
.orb-cyan { width: 350px; height: 350px; top: 15%; right: 10%; background: rgba(0, 229, 255, 0.1); animation-delay: 0s; }
.orb-blue { width: 400px; height: 400px; bottom: 10%; left: 10%; background: rgba(74, 144, 217, 0.08); animation-delay: -3s; }
.bg-particles { position: fixed; inset: 0; z-index: -2; pointer-events: none; }
.star-dot { position: absolute; border-radius: 50%; background: var(--accent-cyan); box-shadow: 0 0 6px var(--accent-cyan-glow); animation: twinkle ease-in-out infinite; }

/* 主容器 */
.setup-container { width: 100%; max-width: 480px; padding: 1.5rem 2rem; z-index: 1; }

.title-section { text-align: center; margin-bottom: 1.2rem; }
.title-icon { font-size: 2.5rem; animation: float 3s ease-in-out infinite; }
@keyframes float { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-5px)} }
.title { font-size: 1.7rem; font-weight: 700; color: #e0e8ff; margin: 0.3rem 0 0; animation: glow-pulse 4s ease-in-out infinite; }
.subtitle { font-size: 0.65rem; color: #6b8db5; margin: 0.1rem 0 0; letter-spacing: 0.2em; }

/* 区段标签 */
.section-label { display: flex; align-items: baseline; gap: 0.4rem; margin-bottom: 0.7rem; }
.sl-cn { font-size: 0.8rem; color: var(--accent-cyan); font-weight: 600; }
.sl-en { font-size: 0.5rem; color: var(--text-muted); letter-spacing: 0.1em; }

/* 表单卡片 */
.form-card { padding: 1.4rem; border-radius: 14px; }
.form-group { margin-bottom: 0.85rem; }
.form-label { display: block; font-size: 0.75rem; color: var(--text-secondary); margin-bottom: 0.25rem; font-weight: 500; }
.label-en { font-size: 0.5rem; color: var(--text-muted); letter-spacing: 0.1em; margin-left: 0.25rem; }
.form-input { width: 100%; padding: 0.55rem 0.65rem; border: 1px solid var(--border); border-radius: 6px; background: rgba(8,16,28,0.8); color: var(--text-primary); font-size: 0.88rem; font-family: inherit; box-sizing: border-box; transition: border-color 0.2s, box-shadow 0.2s; }
.form-input:focus { outline: none; border-color: var(--accent-cyan); box-shadow: 0 0 0 2px rgba(0,229,255,0.12), 0 0 12px rgba(0,229,255,0.08); }
.form-input::placeholder { color: #3a5070; }
.form-textarea { resize: vertical; min-height: 44px; }
.form-row { display: flex; gap: 0.75rem; }
.flex-1 { flex: 1; } .flex-2 { flex: 2; }

/* 启程按钮 */
.btn-launch { width: 100%; padding: 0.7rem; border: 1px solid var(--accent-cyan); border-radius: 10px; background: rgba(0,229,255,0.08); color: #e0f0ff; font-size: 1rem; font-weight: 600; cursor: pointer; font-family: inherit; transition: all 0.3s; margin-top: 0.3rem; display: flex; flex-direction: column; align-items: center; gap: 0.1rem; }
.btn-launch:hover { background: rgba(0,229,255,0.15); border-color: var(--accent-cyan); box-shadow: 0 0 25px var(--accent-cyan-glow); transform: translateY(-2px); }
.btn-cn { font-size: 0.95rem; }
.btn-en { font-size: 0.55rem; letter-spacing: 0.15em; color: var(--accent-cyan); }

/* 返回 */
.btn-back { display: block; margin: 1rem auto 0; padding: 0.5rem 1.5rem; border-radius: 8px; border: 1px solid var(--glass-border); color: var(--text-muted); font-size: 0.8rem; cursor: pointer; font-family: inherit; transition: all 0.2s; }
.btn-back:hover { color: var(--text-primary); border-color: var(--accent); }

.error-msg { color: #e05555; font-size: 0.78rem; margin: 0.3rem 0 0; text-align: center; }
</style>
