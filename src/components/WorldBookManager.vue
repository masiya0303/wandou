<!-- ============================================================
 wandou v0.3 — 豌豆星际漂流 · 世界书管理面板
 条目卡片框架 + Toggle 美化 + 玻璃风格
============================================================ -->
<script setup lang="ts">
import { ref } from 'vue'
import { useGameStore } from '../stores/gameStore'
import { importWorldBook } from '../utils/worldBookEngine'

const store = useGameStore()

const importText = ref('')
const importResult = ref<{ imported: number; errors: string[] } | null>(null)
const showImportArea = ref(false)
const importFileInput = ref<HTMLInputElement | null>(null)

function handleImport() {
  importResult.value = null
  if (!importText.value.trim()) return
  const result = importWorldBook(importText.value)
  if (result.success && result.entries.length > 0) store.addWorldBookEntries(result.entries)
  importResult.value = { imported: result.imported, errors: result.errors }
  if (result.imported > 0) importText.value = ''
}

function handleFileImport() { importFileInput.value?.click() }
function onFileSelected(e: Event) {
  const input = e.target as HTMLInputElement; const file = input.files?.[0]; if (!file) return
  const reader = new FileReader()
  reader.onload = () => { importText.value = reader.result as string; showImportArea.value = true; handleImport() }
  reader.readAsText(file); input.value = ''
}
</script>

<template>
  <div class="wb-manager">
    <!-- 顶部 -->
    <div class="wb-header">
      <div class="wb-toggle-row">
        <label class="wb-global-toggle">
          <input v-model="store.worldBookEnabled" type="checkbox" />
          <span class="toggle-label">
            <span class="tl-cn">世界书已{{ store.worldBookEnabled ? '启用' : '停用' }}</span>
            <span class="tl-en">{{ store.worldBookEnabled ? 'ACTIVE' : 'DISABLED' }}</span>
          </span>
        </label>
        <span class="wb-count">{{ store.enabledEntries }} / {{ store.worldBook.length }} 条</span>
      </div>
      <div class="wb-actions">
        <button class="wb-btn wb-btn-primary" @click="showImportArea = !showImportArea">
          📥 {{ showImportArea ? '收起' : '导入 JSON' }}
        </button>
        <button class="wb-btn wb-btn-secondary" @click="handleFileImport">📁 文件</button>
        <input ref="importFileInput" type="file" accept=".json" style="display:none" @change="onFileSelected" />
        <button class="wb-btn wb-btn-secondary" @click="store.resetWorldBook()">🔄 重置</button>
      </div>
    </div>

    <!-- 导入 -->
    <div v-if="showImportArea" class="wb-import glass-panel">
      <textarea v-model="importText" class="form-textarea" placeholder="粘贴 JSON 数组或 { entries: [...] } ..." rows="4"></textarea>
      <div class="wb-import-actions">
        <button class="wb-btn wb-btn-primary" @click="handleImport" :disabled="!importText.trim()">导入</button>
        <span v-if="importResult" class="import-feedback" :class="{ 'has-errors': importResult.errors.length }">
          <template v-if="importResult.imported">✅ {{ importResult.imported }} 条</template>
          <template v-if="importResult.errors.length"> ⚠️ {{ importResult.errors.length }} 失败</template>
        </span>
      </div>
    </div>

    <!-- 列表 -->
    <div class="wb-list">
      <div v-for="entry in store.worldBook" :key="entry.id" :class="['wb-entry glass-panel corner-deco', { disabled: !entry.enabled }]">
        <div class="entry-header">
          <button class="entry-toggle" @click="store.toggleWorldBookEntry(entry.id)">{{ entry.enabled ? '✅' : '⛔' }}</button>
          <div class="entry-info">
            <span class="entry-comment">{{ entry.comment || '（未命名条目）' }}</span>
            <div class="entry-keys">
              <span v-for="key in entry.keys.slice(0, 5)" :key="key" class="key-tag">{{ key }}</span>
              <span v-if="entry.keys.length > 5" class="key-tag">+{{ entry.keys.length - 5 }}</span>
            </div>
          </div>
          <div class="entry-meta">
            <span class="entry-pos" :title="entry.position === 'at_constant' ? '始终注入' : '关键词触发'">
              {{ entry.position === 'at_constant' ? '📌' : '#' + entry.priority }}
            </span>
            <button class="entry-delete" @click="store.removeWorldBookEntry(entry.id)" title="删除">🗑️</button>
          </div>
        </div>
        <div class="entry-preview">{{ entry.content.slice(0, 100) }}{{ entry.content.length > 100 ? '...' : '' }}</div>
      </div>
    </div>

    <div v-if="store.worldBook.length === 0" class="wb-empty glass-panel">
      <p>📭 暂无世界书条目</p>
      <p class="hint">导入 JSON 或点击「重置预设」</p>
    </div>
  </div>
</template>

<style scoped>
.wb-manager { display: flex; flex-direction: column; gap: 0.6rem; }

.wb-header { display: flex; flex-direction: column; gap: 0.4rem; }
.wb-toggle-row { display: flex; align-items: center; justify-content: space-between; }
.wb-global-toggle { display: flex; align-items: center; gap: 0.5rem; cursor: pointer; }
.toggle-label { display: flex; flex-direction: column; gap: 0.05rem; }
.tl-cn { font-size: 0.8rem; color: var(--text-primary); }
.tl-en { font-size: 0.5rem; color: var(--text-muted); letter-spacing: 0.1em; }

/* 自定义 toggle switch */
.wb-global-toggle input[type="checkbox"] {
  width: 38px; height: 22px; appearance: none; background: var(--border);
  border-radius: 11px; position: relative; cursor: pointer; transition: background 0.3s; flex-shrink: 0;
}
.wb-global-toggle input[type="checkbox"]::after {
  content: ''; position: absolute; top: 2px; left: 2px; width: 18px; height: 18px; border-radius: 50%;
  background: var(--text-muted); transition: all 0.3s;
}
.wb-global-toggle input[type="checkbox"]:checked { background: rgba(0, 229, 255, 0.25); }
.wb-global-toggle input[type="checkbox"]:checked::after { left: 18px; background: var(--accent-cyan); box-shadow: 0 0 8px var(--accent-cyan-glow); }

.wb-count { font-size: 0.65rem; color: var(--text-muted); }

.wb-actions { display: flex; gap: 0.35rem; flex-wrap: wrap; }
.wb-btn {
  padding: 0.3rem 0.6rem; border-radius: 5px; font-size: 0.7rem; cursor: pointer;
  border: 1px solid var(--glass-border); font-family: inherit; transition: all 0.15s; background: var(--glass-bg); color: var(--text-secondary);
}
.wb-btn-primary { background: rgba(0,229,255,0.08); border-color: rgba(0,229,255,0.25); color: var(--accent-cyan); }
.wb-btn-primary:hover { background: rgba(0,229,255,0.15); }
.wb-btn-secondary:hover { background: var(--glass-bg-hover); color: var(--text-primary); }
.wb-btn:disabled { opacity: 0.3; cursor: not-allowed; }

/* 导入 */
.wb-import { padding: 0.5rem; border-radius: 8px; display: flex; flex-direction: column; gap: 0.4rem; }
.form-textarea { width: 100%; padding: 0.4rem; border: 1px solid var(--border); border-radius: 4px; background: rgba(8,16,28,0.8); color: var(--text-primary); font-size: 0.7rem; font-family: 'Courier New', monospace; resize: vertical; box-sizing: border-box; }
.form-textarea:focus { outline: none; border-color: var(--accent-cyan); }
.wb-import-actions { display: flex; align-items: center; gap: 0.5rem; }
.import-feedback { font-size: 0.65rem; color: var(--success); }
.import-feedback.has-errors { color: var(--warning); }

/* 条目列表 */
.wb-list { display: flex; flex-direction: column; gap: 0.35rem; max-height: 340px; overflow-y: auto; }
.wb-entry { padding: 0.45rem 0.55rem; border-radius: 8px; transition: all 0.2s; }
.wb-entry.disabled { opacity: 0.4; }
.wb-entry:hover:not(.disabled) { background: var(--glass-bg-hover); transform: translateY(-1px); }
.entry-header { display: flex; align-items: flex-start; gap: 0.4rem; }
.entry-toggle { background: none; border: none; font-size: 0.9rem; cursor: pointer; padding: 0; line-height: 1; flex-shrink: 0; }
.entry-info { flex: 1; min-width: 0; }
.entry-comment { font-size: 0.72rem; color: var(--text-primary); font-weight: 500; }
.entry-keys { display: flex; flex-wrap: wrap; gap: 0.18rem; margin-top: 0.15rem; }
.key-tag { font-size: 0.55rem; padding: 0.08rem 0.3rem; background: rgba(0,229,255,0.08); border: 1px solid rgba(0,229,255,0.2); border-radius: 3px; color: var(--accent-cyan); }
.entry-meta { display: flex; align-items: center; gap: 0.25rem; flex-shrink: 0; }
.entry-pos { font-size: 0.6rem; color: var(--text-muted); min-width: 18px; text-align: right; }
.entry-delete { background: none; border: none; cursor: pointer; font-size: 0.75rem; padding: 0; opacity: 0.35; transition: opacity 0.15s; }
.entry-delete:hover { opacity: 1; }
.entry-preview { font-size: 0.63rem; color: var(--text-muted); margin-top: 0.2rem; line-height: 1.35; padding-left: 1.4rem; }

.wb-empty { text-align: center; padding: 1.5rem; border-radius: 8px; font-size: 0.75rem; color: var(--text-muted); }
.wb-empty .hint { font-size: 0.65rem; margin-top: 0.2rem; color: #2e4460; }
</style>
