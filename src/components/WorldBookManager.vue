<!-- ============================================================
 wandou v0.2 — 豌豆星际漂流 · 世界书管理面板
============================================================ -->
<script setup lang="ts">
import { ref } from 'vue'
import { useGameStore } from '../stores/gameStore'
import { importWorldBook } from '../utils/worldBookEngine'

const store = useGameStore()

// ---- 导入 ----
const importText = ref('')
const importResult = ref<{ imported: number; errors: string[] } | null>(null)
const showImportArea = ref(false)
const importFileInput = ref<HTMLInputElement | null>(null)

function handleImport() {
  importResult.value = null
  if (!importText.value.trim()) return

  const result = importWorldBook(importText.value)
  if (result.success && result.entries.length > 0) {
    store.addWorldBookEntries(result.entries)
  }
  importResult.value = { imported: result.imported, errors: result.errors }

  if (result.imported > 0) {
    importText.value = ''
  }
}

function handleFileImport() {
  importFileInput.value?.click()
}

function onFileSelected(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  const reader = new FileReader()
  reader.onload = () => {
    importText.value = reader.result as string
    showImportArea.value = true
    handleImport()
  }
  reader.readAsText(file)
  input.value = ''
}
</script>

<template>
  <div class="wb-manager">
    <!-- 顶部控制 -->
    <div class="wb-header">
      <div class="wb-toggle-row">
        <label class="wb-global-toggle">
          <input v-model="store.worldBookEnabled" type="checkbox" />
          <span class="toggle-label">世界书已{{ store.worldBookEnabled ? '启用' : '停用' }}</span>
        </label>
        <span class="wb-count">{{ store.enabledEntries }} / {{ store.worldBook.length }} 条</span>
      </div>
      <div class="wb-actions">
        <button class="btn btn-primary" @click="showImportArea = !showImportArea">
          📥 {{ showImportArea ? '收起' : '导入 JSON' }}
        </button>
        <button class="btn btn-secondary" @click="handleFileImport">
          📁 文件导入
        </button>
        <input
          ref="importFileInput"
          type="file"
          accept=".json"
          style="display:none"
          @change="onFileSelected"
        />
        <button class="btn btn-secondary" @click="store.resetWorldBook()">
          🔄 重置预设
        </button>
      </div>
    </div>

    <!-- 导入区域 -->
    <div v-if="showImportArea" class="wb-import">
      <textarea
        v-model="importText"
        class="form-textarea"
        placeholder="粘贴 JSON 数组或 { entries: [...] } ..."
        rows="5"
      ></textarea>
      <button class="btn btn-primary" @click="handleImport" :disabled="!importText.trim()">
        导入
      </button>
      <div v-if="importResult" class="import-feedback" :class="{ 'has-errors': importResult.errors.length }">
        <span v-if="importResult.imported">✅ 已导入 {{ importResult.imported }} 条</span>
        <span v-if="importResult.errors.length" class="import-errors">
          ⚠️ {{ importResult.errors.length }} 条失败
        </span>
      </div>
    </div>

    <!-- 条目列表 -->
    <div class="wb-list">
      <div
        v-for="entry in store.worldBook"
        :key="entry.id"
        :class="['wb-entry', { disabled: !entry.enabled }]"
      >
        <div class="entry-header">
          <button class="entry-toggle" @click="store.toggleWorldBookEntry(entry.id)">
            {{ entry.enabled ? '✅' : '⛔' }}
          </button>
          <div class="entry-info">
            <span class="entry-comment">{{ entry.comment || '（未命名条目）' }}</span>
            <div class="entry-keys">
              <span v-for="key in entry.keys.slice(0, 5)" :key="key" class="key-tag">{{ key }}</span>
              <span v-if="entry.keys.length > 5" class="key-tag">+{{ entry.keys.length - 5 }}</span>
            </div>
          </div>
          <div class="entry-meta">
            <span class="entry-priority" :title="'优先级 ' + entry.priority">
              {{ entry.position === 'at_constant' ? '📌' : '#' + entry.priority }}
            </span>
            <button class="entry-delete" @click="store.removeWorldBookEntry(entry.id)" title="删除">
              🗑️
            </button>
          </div>
        </div>
        <div class="entry-content-preview">{{ entry.content.slice(0, 120) }}{{ entry.content.length > 120 ? '...' : '' }}</div>
      </div>
    </div>

    <!-- 空状态 -->
    <div v-if="store.worldBook.length === 0" class="wb-empty">
      <p>📭 暂无世界书条目</p>
      <p class="hint">导入 JSON 或点击「重置预设」</p>
    </div>
  </div>
</template>

<style scoped>
.wb-manager {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

/* 顶部 */
.wb-header {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.wb-toggle-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.wb-global-toggle {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  cursor: pointer;
  font-size: 0.85rem;
  color: #c8dcff;
}

.wb-global-toggle input[type="checkbox"] {
  width: 36px;
  height: 20px;
  appearance: none;
  background: #1e3a5f;
  border-radius: 10px;
  position: relative;
  cursor: pointer;
  transition: background 0.2s;
}

.wb-global-toggle input[type="checkbox"]::after {
  content: '';
  position: absolute;
  top: 2px;
  left: 2px;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: #8ba4c0;
  transition: all 0.2s;
}

.wb-global-toggle input[type="checkbox"]:checked {
  background: #2a5090;
}

.wb-global-toggle input[type="checkbox"]:checked::after {
  left: 18px;
  background: #90d0ff;
}

.wb-count {
  font-size: 0.7rem;
  color: #4a6380;
}

/* 按钮 */
.wb-actions {
  display: flex;
  gap: 0.4rem;
  flex-wrap: wrap;
}

.btn {
  padding: 0.35rem 0.65rem;
  border-radius: 5px;
  font-size: 0.75rem;
  cursor: pointer;
  border: 1px solid #1e3a5f;
  font-family: inherit;
  transition: all 0.15s;
}

.btn-primary {
  background: rgba(30, 60, 120, 0.4);
  color: #90b8e0;
  border-color: #2a5090;
}

.btn-primary:hover {
  background: rgba(30, 60, 120, 0.6);
}

.btn-secondary {
  background: rgba(13, 27, 42, 0.8);
  color: #6b8db5;
}

.btn-secondary:hover {
  background: rgba(30, 60, 100, 0.3);
  color: #8ba4c0;
}

.btn:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

/* 导入区 */
.wb-import {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  padding: 0.6rem;
  background: rgba(8, 16, 28, 0.5);
  border: 1px solid #1e3a5f;
  border-radius: 6px;
}

.form-textarea {
  width: 100%;
  padding: 0.5rem;
  border: 1px solid #1e3a5f;
  border-radius: 4px;
  background: rgba(8, 16, 28, 0.8);
  color: #d0dcf0;
  font-size: 0.75rem;
  font-family: 'Courier New', monospace;
  resize: vertical;
  box-sizing: border-box;
}

.form-textarea:focus {
  outline: none;
  border-color: #4a90d9;
}

.import-feedback {
  font-size: 0.7rem;
  color: #60c060;
}

.import-feedback.has-errors {
  color: #e0a040;
}

.import-errors {
  margin-left: 0.5rem;
  color: #e08040;
}

/* 条目列表 */
.wb-list {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  max-height: 360px;
  overflow-y: auto;
}

.wb-entry {
  background: rgba(13, 27, 42, 0.6);
  border: 1px solid #1e3a5f;
  border-radius: 6px;
  padding: 0.5rem 0.6rem;
  transition: opacity 0.2s;
}

.wb-entry.disabled {
  opacity: 0.45;
}

.entry-header {
  display: flex;
  align-items: flex-start;
  gap: 0.45rem;
}

.entry-toggle {
  background: none;
  border: none;
  font-size: 1rem;
  cursor: pointer;
  padding: 0;
  line-height: 1;
  flex-shrink: 0;
}

.entry-info {
  flex: 1;
  min-width: 0;
}

.entry-comment {
  font-size: 0.78rem;
  color: #90b8e0;
  font-weight: 500;
}

.entry-keys {
  display: flex;
  flex-wrap: wrap;
  gap: 0.2rem;
  margin-top: 0.2rem;
}

.key-tag {
  font-size: 0.6rem;
  padding: 0.1rem 0.35rem;
  background: rgba(74, 144, 217, 0.15);
  border: 1px solid rgba(74, 144, 217, 0.25);
  border-radius: 3px;
  color: #90b8e0;
}

.entry-meta {
  display: flex;
  align-items: center;
  gap: 0.3rem;
  flex-shrink: 0;
}

.entry-priority {
  font-size: 0.65rem;
  color: #6b8db5;
  min-width: 20px;
  text-align: right;
}

.entry-delete {
  background: none;
  border: none;
  cursor: pointer;
  font-size: 0.85rem;
  padding: 0;
  opacity: 0.4;
  transition: opacity 0.15s;
}

.entry-delete:hover {
  opacity: 1;
}

.entry-content-preview {
  font-size: 0.68rem;
  color: #6b8db5;
  margin-top: 0.3rem;
  line-height: 1.4;
  padding-left: 1.5rem;
}

/* 空状态 */
.wb-empty {
  text-align: center;
  padding: 1.5rem;
  color: #4a6380;
  font-size: 0.8rem;
}

.wb-empty .hint {
  font-size: 0.7rem;
  margin-top: 0.3rem;
  color: #2e4460;
}
</style>
