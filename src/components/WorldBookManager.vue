<!-- ============================================================
 wandou v0.7 — 世界书管理面板
 Tab：全局世界书 / 当前世界书
============================================================ -->
<script setup lang="ts">
import { ref, computed } from 'vue'
import { useGameStore } from '../stores/gameStore'
import { importWorldBook } from '../utils/worldBookEngine'

const store = useGameStore()

const tab = ref<'global' | 'world'>('global')
const inWorld = ref(!!store.currentWorldId)

const importText = ref('')
const importResult = ref<{ imported: number; errors: string[] } | null>(null)
const showImportArea = ref(false)
const fileInput = ref<HTMLInputElement | null>(null)
const importTarget = ref<'global' | 'world'>('global')

function handleImport() {
  importResult.value = null
  if (!importText.value.trim()) return
  const result = importWorldBook(importText.value)
  if (result.success && result.entries.length > 0) {
    if (importTarget.value === 'global') store.addGlobalWorldBookEntries(result.entries)
    else store.addWorldBookEntries(result.entries)
  }
  importResult.value = { imported: result.imported, errors: result.errors }
  if (result.imported > 0) importText.value = ''
}

function onFile(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]; if (!file) return
  const reader = new FileReader()
  reader.onload = () => { importText.value = reader.result as string; showImportArea.value = true; handleImport() }
  reader.readAsText(file); input.value = ''
}

// 当前操作的列表
const activeEntries = computed(() => tab.value === 'global' ? store.globalWorldBook : store.worldBook)
function toggleEntry(id: string) {
  if (tab.value === 'global') store.toggleGlobalWorldBookEntry(id)
  else store.toggleWorldBookEntry(id)
}
function removeEntry(id: string) {
  if (tab.value === 'global') store.removeGlobalWorldBookEntry(id)
  else store.removeWorldBookEntry(id)
}
function resetEntries() {
  if (tab.value === 'global') store.resetGlobalWorldBook()
  else store.resetWorldBook()
}

const activeEnabledCount = computed(() => activeEntries.value.filter((e: any) => e.enabled).length)
</script>

<template>
  <div class="wb">
    <!-- Tab -->
    <div class="tab-row">
      <button :class="['tab', { on: tab === 'global' }]" @click="tab = 'global'">
        🌐 全局世界书 <span class="en">GLOBAL</span>
      </button>
      <button v-if="inWorld" :class="['tab', { on: tab === 'world' }]" @click="tab = 'world'">
        📖 {{ store.worldName || '当前' }}世界书 <span class="en">LOCAL</span>
      </button>
    </div>

    <p class="desc" v-if="tab === 'global'">对所有世界生效的通用背景知识。</p>
    <p class="desc" v-else>仅对「{{ store.worldName }}」世界生效。</p>

    <!-- 操作栏 -->
    <div class="bar">
      <span class="cnt">{{ activeEnabledCount }} / {{ activeEntries.length }} 条</span>
      <div class="acts">
        <button class="btn" @click="importTarget = tab; showImportArea = !showImportArea">📥 导入</button>
        <button class="btn" @click="fileInput?.click()">📁 文件</button>
        <input ref="fileInput" type="file" accept=".json" style="display:none" @change="onFile" />
        <button class="btn" @click="resetEntries">🔄 重置</button>
      </div>
    </div>

    <!-- 导入区 -->
    <div v-if="showImportArea" class="imp glass-panel">
      <textarea v-model="importText" class="ta" placeholder="粘贴 JSON 数组..." rows="4"></textarea>
      <div class="ir">
        <button class="btn go" @click="handleImport" :disabled="!importText.trim()">导入</button>
        <span v-if="importResult" class="fb" :class="{ w: importResult.errors.length }">
          <template v-if="importResult.imported">✅ {{ importResult.imported }} 条</template>
          <template v-if="importResult.errors.length"> ⚠️ {{ importResult.errors.length }} 失败</template>
        </span>
      </div>
    </div>

    <!-- 列表 -->
    <div v-if="activeEntries.length === 0" class="empty">📭 暂无条目</div>
    <div class="list">
      <div v-for="e in activeEntries" :key="e.id" :class="['card glass-panel corner-deco', { off: !e.enabled }]">
        <div class="r1">
          <button class="tg" @click="toggleEntry(e.id)">{{ e.enabled ? '✅' : '⛔' }}</button>
          <div class="i">
            <span class="nm">{{ e.comment || '（未命名条目）' }}</span>
            <div class="ks">
              <span v-for="k in e.keys.slice(0,5)" :key="k" class="kt">{{ k }}</span>
              <span v-if="e.keys.length > 5" class="kt">+{{ e.keys.length - 5 }}</span>
            </div>
          </div>
          <span class="pri">{{ e.position === 'at_constant' ? '📌' : '#' + e.priority }}</span>
          <button class="del" @click="removeEntry(e.id)">🗑️</button>
        </div>
        <p class="pre">{{ e.content.slice(0, 100) }}{{ e.content.length > 100 ? '...' : '' }}</p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.wb { display: flex; flex-direction: column; gap: 0.5rem; }
.tab-row { display: flex; gap: 0.25rem; }
.tab { flex: 1; padding: 0.4rem; border: none; border-bottom: 2px solid transparent; background: none; color: var(--text-muted); cursor: pointer; font-family: inherit; font-size: 0.75rem; display: flex; flex-direction: column; align-items: center; gap: 0.05rem; }
.tab.on { border-bottom-color: var(--accent-cyan); color: var(--text-primary); }
.en { font-size: 0.48rem; color: var(--text-muted); letter-spacing: 0.1em; }
.tab.on .en { color: var(--accent-cyan); }
.desc { font-size: 0.65rem; color: var(--text-muted); margin: 0; }
.bar { display: flex; align-items: center; justify-content: space-between; }
.cnt { font-size: 0.65rem; color: var(--text-muted); }
.acts { display: flex; gap: 0.25rem; }
.btn { padding: 0.25rem 0.5rem; border-radius: 5px; border: 1px solid var(--glass-border); background: var(--glass-bg); color: var(--text-secondary); font-size: 0.65rem; cursor: pointer; font-family: inherit; }
.btn:hover { border-color: var(--accent); color: var(--text-primary); }
.go { background: rgba(0,229,255,0.08); border-color: rgba(0,229,255,0.25); color: var(--accent-cyan); }
.go:disabled { opacity: 0.3; }
.imp { padding: 0.4rem; border-radius: 8px; display: flex; flex-direction: column; gap: 0.35rem; }
.ta { width: 100%; padding: 0.35rem; border: 1px solid var(--border); border-radius: 4px; background: rgba(8,16,28,0.8); color: var(--text-primary); font-size: 0.65rem; font-family: monospace; resize: vertical; box-sizing: border-box; }
.ta:focus { outline: none; border-color: var(--accent-cyan); }
.ir { display: flex; align-items: center; gap: 0.4rem; }
.fb { font-size: 0.6rem; color: var(--success); }
.fb.w { color: var(--warning); }
.empty { text-align: center; padding: 1rem; font-size: 0.7rem; color: var(--text-muted); }
.list { display: flex; flex-direction: column; gap: 0.3rem; max-height: 300px; overflow-y: auto; }
.card { padding: 0.4rem 0.5rem; border-radius: 8px; transition: all 0.15s; }
.card.off { opacity: 0.4; }
.card:hover:not(.off) { background: var(--glass-bg-hover); }
.r1 { display: flex; align-items: flex-start; gap: 0.35rem; }
.tg { background: none; border: none; font-size: 0.8rem; cursor: pointer; padding: 0; line-height: 1; }
.i { flex: 1; min-width: 0; }
.nm { font-size: 0.7rem; font-weight: 600; color: var(--text-primary); }
.ks { display: flex; flex-wrap: wrap; gap: 0.12rem; margin-top: 0.1rem; }
.kt { font-size: 0.5rem; padding: 0.06rem 0.25rem; background: rgba(0,229,255,0.06); border: 1px solid rgba(0,229,255,0.18); border-radius: 2px; color: var(--accent-cyan); }
.pri { font-size: 0.55rem; color: var(--text-muted); }
.del { background: none; border: none; cursor: pointer; font-size: 0.65rem; opacity: 0.3; }
.del:hover { opacity: 1; }
.pre { font-size: 0.58rem; color: var(--text-muted); margin: 0.15rem 0 0; padding-left: 1.3rem; line-height: 1.35; }
</style>
