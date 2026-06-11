<!-- ============================================================
 wandou v0.3 — 豌豆星际漂流 · 设置面板
 四角角标 + 玻璃拟态 + 双语标签 + 卡片 Hover
============================================================ -->
<script setup lang="ts">
import { ref } from 'vue'
import { useGameStore } from '../stores/gameStore'
import WorldBookManager from './WorldBookManager.vue'

const store = useGameStore()
const emit = defineEmits<{ close: [] }>()
const tab = ref<string>('api')
const saved = ref(false)

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

function handleSave() {
  store.updateApiConfig({ apiKey: editApiKey.value, baseUrl: editBaseUrl.value, model: editModel.value, temperature: editTemperature.value, maxTokens: editMaxTokens.value })
  store.updateCharacter({ name: editName.value, age: editAge.value, gender: editGender.value, background: editBackground.value })
  store.updateSystemPrompt(editSystemPrompt.value)
  saved.value = true; setTimeout(() => saved.value = false, 2000)
}
function handleSaveGame() { if (store.saveToLocal()) { saved.value = true; setTimeout(() => saved.value = false, 2000) } }

const TABS: { key: string; cn: string; en: string; icon: string }[] = [
  { key: 'api', cn: 'API', en: 'CONFIG', icon: '🔌' },
  { key: 'character', cn: '角色', en: 'CHARACTER', icon: '👤' },
  { key: 'prompt', cn: '系统提示', en: 'PROMPT', icon: '📜' },
  { key: 'worldbook', cn: '世界书', en: 'WORLD BOOK', icon: '📖' },
]
</script>

<template>
  <div class="modal-overlay" @click.self="emit('close')">
    <div class="modal-panel glass-panel corner-deco-full">
      <!-- 标题 -->
      <div class="modal-header">
        <h2>
          <span class="h-cn">⚙️ 设置</span>
          <span class="h-en">SETTINGS</span>
        </h2>
        <button class="btn-close glass-panel" @click="emit('close')">✕</button>
      </div>
      <hr class="accent-divider" />

      <!-- Tab -->
      <div class="tab-bar">
        <button v-for="t in TABS" :key="t.key"
          :class="['tab-btn', { active: tab === t.key }]" @click="tab = t.key">
          <span class="tb-icon">{{ t.icon }}</span>
          <span class="tb-cn">{{ t.cn }}</span>
          <span class="tb-en">{{ t.en }}</span>
        </button>
      </div>

      <!-- 内容 -->
      <div class="modal-body">
        <!-- API -->
        <div v-if="tab === 'api'" class="tab-content">
          <div class="form-group"><label>API Key <span class="l-en">AUTH</span></label><input v-model="editApiKey" type="password" class="form-input" placeholder="sk-..." /></div>
          <div class="form-group"><label>API 地址 <span class="l-en">ENDPOINT</span></label><input v-model="editBaseUrl" type="text" class="form-input" /></div>
          <div class="form-group"><label>模型 <span class="l-en">MODEL</span></label><input v-model="editModel" type="text" class="form-input" /></div>
          <div class="form-row">
            <div class="form-group flex-1"><label>温度 {{ editTemperature }}</label><input v-model.number="editTemperature" type="range" min="0" max="2" step="0.1" class="slider" /></div>
            <div class="form-group flex-1"><label>Max Tokens</label><input v-model.number="editMaxTokens" type="number" class="form-input" min="256" max="128000" /></div>
          </div>
        </div>

        <!-- 角色 -->
        <div v-if="tab === 'character'" class="tab-content">
          <div class="form-group"><label>姓名 <span class="l-en">NAME</span></label><input v-model="editName" type="text" class="form-input" /></div>
          <div class="form-row">
            <div class="form-group flex-1"><label>年龄 <span class="l-en">AGE</span></label><input v-model.number="editAge" type="number" class="form-input" min="18" /></div>
            <div class="form-group flex-1"><label>性别 <span class="l-en">GENDER</span></label>
              <select v-model="editGender" class="form-input"><option value="">不透露</option><option value="male">男性</option><option value="female">女性</option><option value="other">其他</option></select>
            </div>
          </div>
          <div class="form-group"><label>背景 <span class="l-en">BACKGROUND</span></label><textarea v-model="editBackground" class="form-input form-textarea" rows="3"></textarea></div>
        </div>

        <!-- 提示词 -->
        <div v-if="tab === 'prompt'" class="tab-content">
          <p class="help-text">系统提示词决定 AI 的世界观、风格和行为。可自由修改以创造不同的冒险体验。</p>
          <div class="form-group"><textarea v-model="editSystemPrompt" class="form-input form-textarea mono" rows="18"></textarea></div>
        </div>

        <!-- 世界书 -->
        <div v-if="tab === 'worldbook'" class="tab-content">
          <WorldBookManager />
        </div>
      </div>

      <!-- 底部 -->
      <div class="modal-footer">
        <span v-if="saved" class="save-feedback">✅ 已保存</span>
        <button class="btn-save-game glass-panel" @click="handleSaveGame">💾 手动存档</button>
        <button class="btn-save" @click="handleSave">保存设置</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.7); display: flex; align-items: center; justify-content: center; z-index: 100; padding: 1rem; }
.modal-panel { width: 100%; max-width: 540px; max-height: 82vh; border-radius: 14px; display: flex; flex-direction: column; overflow: hidden; }

/* 标题 */
.modal-header { display: flex; align-items: center; justify-content: space-between; padding: 1rem 1.25rem 0.5rem; }
.h-cn { font-size: 1.05rem; color: var(--text-primary); font-weight: 600; }
.h-en { font-size: 0.55rem; color: var(--text-muted); letter-spacing: 0.15em; margin-left: 0.4rem; }
.btn-close { width: 30px; height: 30px; border-radius: 6px; font-size: 0.9rem; color: var(--text-secondary); cursor: pointer; display: flex; align-items: center; justify-content: center; transition: all 0.15s; }
.btn-close:hover { background: rgba(200,60,60,0.2); border-color: var(--danger); color: #e08080; }

/* Tab */
.tab-bar { display: flex; gap: 0.25rem; padding: 0.25rem 1rem 0; border-bottom: 1px solid var(--glass-border); }
.tab-btn { flex: 1; display: flex; flex-direction: column; align-items: center; gap: 0.1rem; padding: 0.5rem 0.2rem; border: none; border-bottom: 2px solid transparent; background: transparent; color: var(--text-muted); cursor: pointer; font-family: inherit; transition: all 0.2s; }
.tab-btn.active { color: var(--text-primary); border-bottom-color: var(--accent-cyan); }
.tab-btn:hover:not(.active) { color: var(--text-secondary); background: rgba(0,229,255,0.03); }
.tb-icon { font-size: 0.85rem; }
.tb-cn { font-size: 0.68rem; font-weight: 500; }
.tb-en { font-size: 0.48rem; letter-spacing: 0.08em; color: var(--text-muted); }
.tab-btn.active .tb-en { color: var(--accent-cyan); }

/* Body */
.modal-body { flex: 1; overflow-y: auto; padding: 1rem 1.25rem; }

/* 复用表单 */
.form-group { margin-bottom: 0.85rem; }
.form-group label { display: block; font-size: 0.75rem; color: var(--text-secondary); margin-bottom: 0.25rem; }
.l-en { font-size: 0.5rem; color: var(--text-muted); letter-spacing: 0.1em; margin-left: 0.2rem; }
.form-input { width: 100%; padding: 0.5rem 0.65rem; border: 1px solid var(--border); border-radius: 6px; background: rgba(8,16,28,0.8); color: var(--text-primary); font-size: 0.85rem; font-family: inherit; box-sizing: border-box; transition: border-color 0.2s, box-shadow 0.2s; }
.form-input:focus { outline: none; border-color: var(--accent-cyan); box-shadow: 0 0 0 2px rgba(0,229,255,0.1), 0 0 10px rgba(0,229,255,0.06); }
.form-textarea { resize: vertical; min-height: 60px; }
.mono { font-family: 'Courier New', monospace; font-size: 0.73rem !important; line-height: 1.5; }
.form-row { display: flex; gap: 0.75rem; }
.flex-1 { flex: 1; }
.slider { width: 100%; accent-color: var(--accent-cyan); }
.help-text { font-size: 0.72rem; color: var(--text-secondary); margin: 0 0 0.7rem; line-height: 1.5; }

/* Footer */
.modal-footer { display: flex; align-items: center; justify-content: flex-end; gap: 0.5rem; padding: 0.7rem 1.25rem; border-top: 1px solid var(--glass-border); }
.save-feedback { font-size: 0.75rem; color: var(--success); margin-right: auto; }
.btn-save-game { padding: 0.45rem 0.8rem; border-radius: 6px; border: 1px solid rgba(64,160,96,0.3); font-size: 0.75rem; color: var(--success); cursor: pointer; font-family: inherit; }
.btn-save-game:hover { background: rgba(64,160,96,0.15); border-color: var(--success); }
.btn-save { padding: 0.45rem 0.8rem; border-radius: 6px; border: 1px solid var(--accent-cyan); background: rgba(0,229,255,0.08); font-size: 0.75rem; color: var(--accent-cyan); cursor: pointer; font-family: inherit; transition: all 0.2s; }
.btn-save:hover { background: rgba(0,229,255,0.18); box-shadow: 0 0 12px var(--accent-cyan-glow); }
</style>
