<!-- ============================================================
 wandou v0.5 — 豌豆星际漂流 · 设置（全屏卡片式）
 主页：大卡片入口 → 点进子页面
============================================================ -->
<script setup lang="ts">
import { ref, computed } from 'vue'
import { useGameStore } from '../stores/gameStore'
import WorldBookManager from './WorldBookManager.vue'
import NpcManager from './NpcManager.vue'

const store = useGameStore()
const emit = defineEmits<{ close: [] }>()

const hasActiveGame = computed(() => store.messages.length > 0)

// 当前子页面：null = 主页，字符串 = 子页面
const page = ref<string | null>(null)

// ---- 本地编辑 ----
const editApiKey = ref(store.apiConfig.apiKey)
const editBaseUrl = ref(store.apiConfig.baseUrl)
const editModel = ref(store.apiConfig.model)
const editTemperature = ref(store.apiConfig.temperature)
const editMaxTokens = ref(store.apiConfig.maxTokens)

const editName = ref(store.character.name)
const editAge = ref(store.character.age)
const editGender = ref(store.character.gender)
const editBackground = ref(store.character.background)

const editSystemPrompt = ref(store.systemPrompt)
const saved = ref(false)

function handleSave() {
  store.updateApiConfig({ apiKey: editApiKey.value, baseUrl: editBaseUrl.value, model: editModel.value, temperature: editTemperature.value, maxTokens: editMaxTokens.value })
  store.updateCharacter({ name: editName.value, age: editAge.value, gender: editGender.value, background: editBackground.value })
  store.updateSystemPrompt(editSystemPrompt.value)
  saved.value = true; setTimeout(() => saved.value = false, 2000)
}
async function handleSaveGame() {
  try {
    await store.autoSave()
    saved.value = true; setTimeout(() => saved.value = false, 2000)
  } catch { /* store handles errors */ }
}

// 卡片定义
const CARDS = [
  { key: 'api', icon: '🔌', cn: 'API 配置', en: 'API CONFIG', desc: 'LLM 接口地址、密钥、模型参数' },
  { key: 'character', icon: '👤', cn: '角色信息', en: 'CHARACTER', desc: '舰长姓名、年龄、性别、背景' },
  { key: 'prompt', icon: '📜', cn: '系统提示词', en: 'SYSTEM PROMPT', desc: '定义 AI 的世界观、风格和行为' },
  { key: 'worldbook', icon: '📖', cn: '世界书', en: 'WORLD BOOK', desc: '关键词触发的世界背景知识库' },
  { key: 'npc', icon: '👥', cn: 'NPC 角色书', en: 'NPC CARDS', desc: '管理世界的 NPC，按名字触发 AI 扮演' },
]

function goBack() { page.value = null }
</script>

<template>
  <!-- ===== 全屏层 ===== -->
  <div class="settings-fullscreen">
    <!-- 星空背景 -->
    <div class="bg-stars"></div>
    <div class="bg-orbs">
      <div class="orb orb-cyan"></div>
      <div class="orb orb-blue"></div>
    </div>

    <!-- ========== 主页：卡片列表 ========== -->
    <div v-if="page === null" class="settings-main">
      <!-- 顶栏 -->
      <header class="top-bar">
        <span></span>
        <div class="title-area">
          <h1 class="title-cn">⚙️ 设置</h1>
          <p class="title-en">SETTINGS</p>
        </div>
        <button class="btn-close glass-panel" @click="emit('close')">✕</button>
      </header>

      <!-- 4 张大卡片 -->
      <div class="card-grid">
        <button
          v-for="card in CARDS" :key="card.key"
          class="settings-card glass-panel corner-deco"
          @click="page = card.key"
        >
          <span class="card-icon">{{ card.icon }}</span>
          <div class="card-labels">
            <span class="card-cn">{{ card.cn }}</span>
            <span class="card-en">{{ card.en }}</span>
          </div>
          <p class="card-desc">{{ card.desc }}</p>
          <span class="card-arrow">→</span>
        </button>
      </div>

      <!-- 底部操作 -->
      <div class="bottom-bar">
        <button v-if="hasActiveGame" class="act-btn glass-panel" @click="handleSaveGame">💾 手动存档</button>
        <button class="act-btn glass-panel" @click="handleSave">💾 保存设置</button>
        <span v-if="saved" class="saved-hint">✅ 已保存</span>
      </div>
    </div>

    <!-- ========== 子页面：API 配置 ========== -->
    <div v-if="page === 'api'" class="sub-page">
      <header class="sub-header">
        <button class="btn-back glass-panel" @click="goBack">← 返回</button>
        <h2>🔌 API 配置 <span class="h-en">API CONFIG</span></h2>
        <span></span>
      </header>
      <div class="sub-body">
        <div class="form-card glass-panel corner-deco">
          <div class="form-group"><label>API Key <span class="l-en">AUTH</span></label><input v-model="editApiKey" type="password" class="form-input" placeholder="sk-..." /></div>
          <div class="form-group"><label>API 地址 <span class="l-en">ENDPOINT</span></label><input v-model="editBaseUrl" type="text" class="form-input" /></div>
          <div class="form-group"><label>模型 <span class="l-en">MODEL</span></label><input v-model="editModel" type="text" class="form-input" /></div>
          <div class="form-row">
            <div class="form-group flex-1"><label>温度 {{ editTemperature }}</label><input v-model.number="editTemperature" type="range" min="0" max="2" step="0.1" class="slider" /></div>
            <div class="form-group flex-1"><label>Max Tokens</label><input v-model.number="editMaxTokens" type="number" class="form-input" min="256" max="128000" /></div>
          </div>
          <button class="btn-primary" @click="handleSave">保存</button>
        </div>
      </div>
    </div>

    <!-- ========== 子页面：角色信息 ========== -->
    <div v-if="page === 'character'" class="sub-page">
      <header class="sub-header">
        <button class="btn-back glass-panel" @click="goBack">← 返回</button>
        <h2>👤 角色信息 <span class="h-en">CHARACTER</span></h2>
        <span></span>
      </header>
      <div class="sub-body">
        <div class="form-card glass-panel corner-deco">
          <div class="form-group"><label>姓名 <span class="l-en">NAME</span></label><input v-model="editName" type="text" class="form-input" /></div>
          <div class="form-row">
            <div class="form-group flex-1"><label>年龄 <span class="l-en">AGE</span></label><input v-model.number="editAge" type="number" class="form-input" min="18" /></div>
            <div class="form-group flex-1"><label>性别 <span class="l-en">GENDER</span></label>
              <select v-model="editGender" class="form-input"><option value="">不透露</option><option value="male">男性</option><option value="female">女性</option><option value="other">其他</option></select>
            </div>
          </div>
          <div class="form-group"><label>背景 <span class="l-en">BACKGROUND</span></label><textarea v-model="editBackground" class="form-input form-textarea" rows="3"></textarea></div>
          <button class="btn-primary" @click="handleSave">保存</button>
        </div>
      </div>
    </div>

    <!-- ========== 子页面：系统提示词 ========== -->
    <div v-if="page === 'prompt'" class="sub-page">
      <header class="sub-header">
        <button class="btn-back glass-panel" @click="goBack">← 返回</button>
        <h2>📜 系统提示词 <span class="h-en">SYSTEM PROMPT</span></h2>
        <span></span>
      </header>
      <div class="sub-body">
        <div class="form-card glass-panel corner-deco">
          <p class="help-text">提示词决定 AI 的世界观、风格和行为。自由修改即可创造不同的冒险体验。</p>
          <div class="form-group"><textarea v-model="editSystemPrompt" class="form-input form-textarea mono" rows="22"></textarea></div>
          <button class="btn-primary" @click="handleSave">保存</button>
        </div>
      </div>
    </div>

    <!-- ========== 子页面：世界书 ========== -->
    <div v-if="page === 'worldbook'" class="sub-page">
      <header class="sub-header">
        <button class="btn-back glass-panel" @click="goBack">← 返回</button>
        <h2>📖 世界书 <span class="h-en">WORLD BOOK</span></h2>
        <span></span>
      </header>
      <div class="sub-body"><WorldBookManager /></div>
    </div>

    <!-- ========== 子页面：NPC ========== -->
    <div v-if="page === 'npc'" class="sub-page">
      <header class="sub-header">
        <button class="btn-back glass-panel" @click="goBack">← 返回</button>
        <h2>👥 NPC 角色书 <span class="h-en">NPC CARDS</span></h2>
        <span></span>
      </header>
      <div class="sub-body"><NpcManager /></div>
    </div>
  </div>
</template>

<style scoped>
/* ===== 全屏容器 ===== */
.settings-fullscreen {
  position: fixed; inset: 0; z-index: 100;
  background: rgba(5, 8, 15, 0.95);
  display: flex; flex-direction: column;
  overflow: hidden;
}

/* 背景 */
.bg-stars { position: absolute; inset: 0;
  background: radial-gradient(1px 1px at 10% 15%, rgba(255,255,255,0.5), transparent),
              radial-gradient(1px 1px at 30% 50%, rgba(255,255,255,0.3), transparent),
              radial-gradient(1.5px 1.5px at 55% 25%, rgba(255,255,255,0.4), transparent),
              radial-gradient(1px 1px at 70% 60%, rgba(255,255,255,0.35), transparent),
              radial-gradient(1px 1px at 85% 35%, rgba(255,255,255,0.4), transparent);
  pointer-events: none; }
.bg-orbs { position: absolute; inset: 0; pointer-events: none; overflow: hidden; }
.orb { position: absolute; border-radius: 50%; filter: blur(100px); animation: orb-pulse 8s ease-in-out infinite; }
.orb-cyan { width: 300px; height: 300px; top: 20%; right: 15%; background: rgba(0,229,255,0.06); }
.orb-blue { width: 400px; height: 400px; bottom: 10%; left: 10%; background: rgba(74,144,217,0.05); animation-delay: -3s; }

/* ================================================================
   主页
   ================================================================ */
.settings-main {
  position: relative; z-index: 1;
  display: flex; flex-direction: column; height: 100%;
  padding: 1rem;
}

/* 顶栏 */
.top-bar {
  display: flex; align-items: center; justify-content: space-between;
  padding: 0.5rem 1rem; flex-shrink: 0;
}
.title-area { text-align: center; }
.title-cn { font-size: 1.4rem; font-weight: 700; color: var(--text-primary); margin: 0; }
.title-en { font-size: 0.6rem; color: var(--text-muted); letter-spacing: 0.2em; margin: 0.1rem 0 0; }
.btn-close {
  width: 38px; height: 38px; border-radius: 10px; font-size: 1.1rem;
  color: var(--text-secondary); cursor: pointer;
  display: flex; align-items: center; justify-content: center; transition: all 0.2s;
}
.btn-close:hover { background: rgba(200,60,60,0.2); border-color: var(--danger); color: #e08080; }

/* 卡片网格 */
.card-grid {
  flex: 1; display: grid; grid-template-columns: 1fr 1fr;
  gap: 1rem; padding: 1rem 0.5rem; align-content: center;
  max-width: 680px; width: 100%; margin: 0 auto;
}

/* 每张卡片 */
.settings-card {
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: 0.4rem; padding: 1.8rem 1rem; border-radius: 16px;
  cursor: pointer; font-family: inherit; text-align: center;
  transition: all 0.3s; position: relative; min-height: 180px;
}
.settings-card:hover {
  transform: translateY(-4px);
  border-color: var(--accent-cyan);
  box-shadow: 0 0 25px var(--accent-cyan-glow);
}

.card-icon { font-size: 2.2rem; }
.card-labels { display: flex; flex-direction: column; gap: 0.1rem; }
.card-cn { font-size: 1rem; font-weight: 600; color: var(--text-primary); }
.card-en { font-size: 0.55rem; color: var(--text-muted); letter-spacing: 0.12em; }
.card-desc { font-size: 0.65rem; color: var(--text-muted); margin: 0; line-height: 1.4; max-width: 200px; }
.card-arrow {
  position: absolute; top: 0.8rem; right: 1rem;
  font-size: 1rem; color: var(--text-muted); transition: all 0.3s;
}
.settings-card:hover .card-arrow { color: var(--accent-cyan); transform: translateX(3px); }

/* 底部 */
.bottom-bar {
  display: flex; align-items: center; justify-content: center; gap: 0.6rem;
  padding: 0.8rem 1rem; flex-shrink: 0;
}
.act-btn {
  padding: 0.45rem 1rem; border-radius: 8px; border: 1px solid var(--glass-border);
  color: var(--text-secondary); font-size: 0.8rem; cursor: pointer; font-family: inherit; transition: all 0.2s;
}
.act-btn:hover { border-color: var(--accent); color: var(--text-primary); }
.saved-hint { font-size: 0.75rem; color: var(--success); }

/* ================================================================
   子页面
   ================================================================ */
.sub-page {
  position: relative; z-index: 1;
  display: flex; flex-direction: column; height: 100%;
}
.sub-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 0.8rem 1.2rem; flex-shrink: 0; border-bottom: 1px solid var(--glass-border);
}
.sub-header h2 { font-size: 1.1rem; color: var(--text-primary); margin: 0; display: flex; align-items: baseline; gap: 0.4rem; }
.h-en { font-size: 0.5rem; color: var(--text-muted); letter-spacing: 0.1em; font-weight: 400; }
.btn-back {
  padding: 0.4rem 0.9rem; border-radius: 8px;
  border: 1px solid var(--glass-border); color: var(--text-secondary);
  font-size: 0.8rem; cursor: pointer; font-family: inherit; transition: all 0.2s;
}
.btn-back:hover { border-color: var(--accent); color: var(--text-primary); }

.sub-body {
  flex: 1; overflow-y: auto; padding: 1.5rem;
  max-width: 540px; width: 100%; margin: 0 auto;
}

/* 表单卡片 */
.form-card { padding: 1.4rem; border-radius: 14px; }

/* 复用样式 */
.form-group { margin-bottom: 0.9rem; }
.form-group label { display: block; font-size: 0.8rem; color: var(--text-secondary); margin-bottom: 0.3rem; font-weight: 500; }
.l-en { font-size: 0.5rem; color: var(--text-muted); letter-spacing: 0.1em; margin-left: 0.25rem; }
.form-input { width: 100%; padding: 0.55rem 0.7rem; border: 1px solid var(--border); border-radius: 6px; background: rgba(8,16,28,0.8); color: var(--text-primary); font-size: 0.88rem; font-family: inherit; box-sizing: border-box; transition: border-color 0.2s, box-shadow 0.2s; }
.form-input:focus { outline: none; border-color: var(--accent-cyan); box-shadow: 0 0 0 2px rgba(0,229,255,0.1), 0 0 10px rgba(0,229,255,0.06); }
.form-textarea { resize: vertical; min-height: 60px; }
.mono { font-family: 'Courier New', monospace; font-size: 0.73rem !important; line-height: 1.5; }
.form-row { display: flex; gap: 0.75rem; }
.flex-1 { flex: 1; }
.slider { width: 100%; accent-color: var(--accent-cyan); }
.help-text { font-size: 0.75rem; color: var(--text-secondary); margin: 0 0 0.8rem; line-height: 1.5; }

.btn-primary {
  width: 100%; margin-top: 0.5rem; padding: 0.55rem;
  border: 1px solid var(--accent-cyan); border-radius: 8px;
  background: rgba(0,229,255,0.08); color: var(--accent-cyan);
  font-size: 0.85rem; font-weight: 600; cursor: pointer; font-family: inherit;
  transition: all 0.2s;
}
.btn-primary:hover { background: rgba(0,229,255,0.18); box-shadow: 0 0 15px var(--accent-cyan-glow); }

@media (max-width: 500px) {
  .card-grid { grid-template-columns: 1fr; gap: 0.6rem; }
  .settings-card { min-height: 120px; padding: 1.2rem 1rem; }
}
</style>
