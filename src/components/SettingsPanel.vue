<!-- ============================================================
 wandou v0.1 — 豌豆星际漂流 · 设置面板
============================================================ -->
<script setup lang="ts">
import { ref } from 'vue'
import { useGameStore } from '../stores/gameStore'
import type { SettingsTab } from '../types/game'

const store = useGameStore()

const emit = defineEmits<{
  close: []
}>()

const tab = ref<SettingsTab>('api')

// 本地编辑副本
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
  store.updateApiConfig({
    apiKey: editApiKey.value,
    baseUrl: editBaseUrl.value,
    model: editModel.value,
    temperature: editTemperature.value,
    maxTokens: editMaxTokens.value,
  })
  store.updateCharacter({
    name: editName.value,
    age: editAge.value,
    gender: editGender.value,
    background: editBackground.value,
  })
  store.updateSystemPrompt(editSystemPrompt.value)
  saved.value = true
  setTimeout(() => { saved.value = false }, 2000)
}

function handleSaveGame() {
  if (store.saveToLocal()) {
    saved.value = true
    setTimeout(() => { saved.value = false }, 2000)
  }
}
</script>

<template>
  <div class="modal-overlay" @click.self="emit('close')">
    <div class="modal-panel">
      <div class="modal-header">
        <h2>⚙️ 设置</h2>
        <button class="btn-close" @click="emit('close')">✕</button>
      </div>

      <!-- Tab -->
      <div class="tab-bar">
        <button :class="['tab-btn', { active: tab === 'api' }]" @click="tab = 'api'">
          🔌 API
        </button>
        <button :class="['tab-btn', { active: tab === 'character' }]" @click="tab = 'character'">
          👤 角色
        </button>
        <button :class="['tab-btn', { active: tab === 'prompt' }]" @click="tab = 'prompt'">
          📜 系统提示
        </button>
      </div>

      <div class="modal-body">
        <!-- API 设置 -->
        <div v-if="tab === 'api'" class="tab-content">
          <div class="form-group">
            <label>API Key</label>
            <input v-model="editApiKey" type="password" class="form-input" placeholder="sk-..." />
          </div>
          <div class="form-group">
            <label>API 地址</label>
            <input v-model="editBaseUrl" type="text" class="form-input" />
          </div>
          <div class="form-group">
            <label>模型</label>
            <input v-model="editModel" type="text" class="form-input" />
          </div>
          <div class="form-row">
            <div class="form-group flex-1">
              <label>温度: {{ editTemperature }}</label>
              <input v-model.number="editTemperature" type="range" min="0" max="2" step="0.1" class="slider" />
            </div>
            <div class="form-group flex-1">
              <label>Max Tokens</label>
              <input v-model.number="editMaxTokens" type="number" class="form-input" min="256" max="128000" />
            </div>
          </div>
        </div>

        <!-- 角色设置 -->
        <div v-if="tab === 'character'" class="tab-content">
          <div class="form-group">
            <label>姓名</label>
            <input v-model="editName" type="text" class="form-input" />
          </div>
          <div class="form-row">
            <div class="form-group flex-1">
              <label>年龄</label>
              <input v-model.number="editAge" type="number" class="form-input" min="18" />
            </div>
            <div class="form-group flex-1">
              <label>性别</label>
              <select v-model="editGender" class="form-input">
                <option value="">不透露</option>
                <option value="male">男性</option>
                <option value="female">女性</option>
                <option value="other">其他</option>
              </select>
            </div>
          </div>
          <div class="form-group">
            <label>背景</label>
            <textarea v-model="editBackground" class="form-input form-textarea" rows="3"></textarea>
          </div>
        </div>

        <!-- 系统提示词 -->
        <div v-if="tab === 'prompt'" class="tab-content">
          <p class="help-text">
            系统提示词决定 AI 的世界观、风格和行为。可自由修改以创造不同的冒险体验。
          </p>
          <div class="form-group">
            <textarea
              v-model="editSystemPrompt"
              class="form-input form-textarea mono"
              rows="20"
            ></textarea>
          </div>
        </div>
      </div>

      <div class="modal-footer">
        <span v-if="saved" class="save-feedback">✅ 已保存</span>
        <button class="btn-save-game" @click="handleSaveGame">💾 手动存档</button>
        <button class="btn-save" @click="handleSave">保存设置</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
  padding: 1rem;
}

.modal-panel {
  width: 100%;
  max-width: 520px;
  max-height: 80vh;
  background: #0d1b2a;
  border: 1px solid #1e3a5f;
  border-radius: 12px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1rem 1.25rem;
  border-bottom: 1px solid #1e3a5f;
}

.modal-header h2 {
  margin: 0;
  font-size: 1.1rem;
  color: #c8dcff;
}

.btn-close {
  width: 30px;
  height: 30px;
  border: 1px solid #1e3a5f;
  border-radius: 6px;
  background: transparent;
  color: #8ba4c0;
  cursor: pointer;
  font-size: 1rem;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s;
}

.btn-close:hover {
  background: rgba(200, 60, 60, 0.2);
  border-color: #c44;
  color: #e08080;
}

/* Tab */
.tab-bar {
  display: flex;
  gap: 0;
  border-bottom: 1px solid #1e3a5f;
}

.tab-btn {
  flex: 1;
  padding: 0.6rem;
  border: none;
  border-bottom: 2px solid transparent;
  background: transparent;
  color: #6b8db5;
  font-size: 0.8rem;
  cursor: pointer;
  transition: all 0.15s;
  font-family: inherit;
}

.tab-btn.active {
  color: #c8dcff;
  border-bottom-color: #4a90d9;
}

.tab-btn:hover:not(.active) {
  color: #8ba4c0;
  background: rgba(30, 60, 100, 0.2);
}

/* Body */
.modal-body {
  flex: 1;
  overflow-y: auto;
  padding: 1.25rem;
}

.tab-content {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

/* 复用表单样式 */
.form-group {
  margin-bottom: 0.9rem;
}

.form-group label {
  display: block;
  font-size: 0.78rem;
  color: #8ba4c0;
  margin-bottom: 0.3rem;
}

.form-input {
  width: 100%;
  padding: 0.55rem 0.65rem;
  border: 1px solid #1e3a5f;
  border-radius: 6px;
  background: rgba(8, 16, 28, 0.8);
  color: #d0dcf0;
  font-size: 0.85rem;
  font-family: inherit;
  box-sizing: border-box;
}

.form-input:focus {
  outline: none;
  border-color: #4a90d9;
}

.form-textarea {
  resize: vertical;
  min-height: 60px;
  font-family: inherit;
}

.mono {
  font-family: 'Courier New', monospace;
  font-size: 0.75rem !important;
  line-height: 1.5;
}

.form-row {
  display: flex;
  gap: 0.75rem;
}

.flex-1 { flex: 1; }

.slider {
  width: 100%;
  accent-color: #4a90d9;
}

.help-text {
  font-size: 0.75rem;
  color: #6b8db5;
  margin: 0 0 0.75rem;
  line-height: 1.5;
}

/* Footer */
.modal-footer {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 0.5rem;
  padding: 0.75rem 1.25rem;
  border-top: 1px solid #1e3a5f;
}

.save-feedback {
  font-size: 0.8rem;
  color: #60c060;
  margin-right: auto;
}

.btn-save-game {
  padding: 0.5rem 0.9rem;
  border: 1px solid #1e5f3a;
  border-radius: 6px;
  background: rgba(30, 100, 50, 0.2);
  color: #80c090;
  font-size: 0.8rem;
  cursor: pointer;
  font-family: inherit;
  transition: all 0.15s;
}

.btn-save-game:hover {
  background: rgba(30, 100, 50, 0.4);
}

.btn-save {
  padding: 0.5rem 0.9rem;
  border: 1px solid #1e4a8f;
  border-radius: 6px;
  background: rgba(30, 60, 120, 0.3);
  color: #90b8e0;
  font-size: 0.8rem;
  cursor: pointer;
  font-family: inherit;
  transition: all 0.15s;
}

.btn-save:hover {
  background: rgba(30, 60, 120, 0.5);
}
</style>
