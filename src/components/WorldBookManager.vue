<!-- ============================================================
 wandou v0.8 — 世界书管理面板（目录式）
 主视图：书列表（全局世界书 + 每个世界的世界书）
 点进 → 条目列表
============================================================ -->
<script setup lang="ts">
import { ref, computed } from 'vue'
import { useGameStore } from '../stores/gameStore'
import { importWorldBook } from '../utils/worldBookEngine'

const store = useGameStore()

// 'list' = 书列表 | 'global' = 全局世界书条目 | 'world-{id}' = 某世界的条目
const view = ref('list')

const loadingBook = ref(false)
const searchText = ref('')

const filteredEntries = computed(() => {
  const q = searchText.value.toLowerCase().trim()
  if (!q) return activeEntries.value
  return activeEntries.value.filter((e: any) =>
    (e.comment || '').toLowerCase().includes(q) || e.keys.some((k: string) => k.toLowerCase().includes(q)) || e.content.toLowerCase().includes(q)
  )
})

async function openBook(target: string) {
  if (target !== 'global') {
    loadingBook.value = true
    await store.loadWorldBookOnly(target)
    loadingBook.value = false
  }
  view.value = target
}

function backToList() { view.value = 'list' }

// ---- 导入 ----
const importText = ref('')
const showImport = ref(false)
const importResult = ref<{ imported: number; errors: string[] } | null>(null)
const fileInput = ref<HTMLInputElement | null>(null)

function handleImport() {
  importResult.value = null
  if (!importText.value.trim()) return
  const result = importWorldBook(importText.value)
  if (result.success && result.entries.length > 0) {
    if (view.value === 'global') store.addGlobalWorldBookEntries(result.entries)
    else store.addWorldBookEntries(result.entries)
  }
  importResult.value = { imported: result.imported, errors: result.errors }
  if (result.imported > 0) importText.value = ''
}

function onFile(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]; if (!file) return
  const reader = new FileReader()
  reader.onload = () => { importText.value = reader.result as string; showImport.value = true; handleImport() }
  reader.readAsText(file); input.value = ''
}

// ---- 当前条目列表 ----
const activeEntries = computed(() => view.value === 'global' ? store.globalWorldBook : store.worldBook)
const activeTitle = computed(() => {
  if (view.value === 'global') return '🌐 全局世界书'
  const w = store.worldList.find(x => x.id === view.value)
  return w ? `📖 ${w.name}` : '世界书'
})

function toggle(id: string) {
  view.value === 'global' ? store.toggleGlobalWorldBookEntry(id) : store.toggleWorldBookEntry(id)
}
function remove(id: string) {
  view.value === 'global' ? store.removeGlobalWorldBookEntry(id) : store.removeWorldBookEntry(id)
}
function reset() {
  view.value === 'global' ? store.resetGlobalWorldBook() : store.resetWorldBook()
}

const activeEnabledCount = computed(() => activeEntries.value.filter((e: any) => e.enabled).length)
</script>

<template>
  <div class="wb">

    <!-- ========== 视图1：书列表 ========== -->
    <template v-if="view === 'list'">
      <div class="book-list">
        <!-- 全局世界书 -->
        <button class="book-card glass-panel corner-deco" @click="openBook('global')">
          <span class="bk-icon">🌐</span>
          <div class="bk-info">
            <span class="bk-name">全局世界书</span>
            <span class="bk-meta">{{ store.globalWorldBook.filter(e => e.enabled).length }}/{{ store.globalWorldBook.length }} 条 · 所有世界生效</span>
          </div>
          <span class="bk-arrow">→</span>
        </button>

        <!-- 每个世界的世界书 -->
        <button
          v-for="w in store.worldList" :key="w.id"
          class="book-card glass-panel corner-deco"
          @click="openBook(w.id)"
        >
          <span class="bk-icon">📖</span>
          <div class="bk-info">
            <span class="bk-name">{{ w.name }}</span>
            <span class="bk-meta">世界书（点击查看条目）</span>
          </div>
          <span class="bk-arrow">→</span>
        </button>

        <div v-if="store.worldList.length === 0" class="empty">暂无世界，创建世界后这里会出现对应的世界书</div>
      </div>
    </template>

    <!-- ========== 视图2：条目列表 ========== -->
    <template v-else>
      <div class="entry-view">
        <div class="ev-header">
          <button class="btn-back glass-panel" @click="backToList">← 返回书列表</button>
          <h3>{{ activeTitle }}</h3>
          <span class="cnt">{{ activeEnabledCount }}/{{ activeEntries.length }}</span>
        </div>

        <div class="bar">
          <input v-model="searchText" class="search-fi" placeholder="搜索关键词..." />
        </div>
        <div class="bar">
          <button class="act" @click="showImport = !showImport">📥 导入</button>
          <button class="act" @click="fileInput?.click()">📁 文件</button>
          <input ref="fileInput" type="file" accept=".json" style="display:none" @change="onFile" />
          <button class="act" @click="reset">🔄 重置</button>
        </div>

        <div v-if="showImport" class="imp glass-panel">
          <textarea v-model="importText" class="ta" placeholder="粘贴 JSON 数组..." rows="3"></textarea>
          <div class="ir">
            <button class="act go" @click="handleImport" :disabled="!importText.trim()">导入</button>
            <span v-if="importResult" class="fb" :class="{ w: importResult.errors.length }">
              <template v-if="importResult.imported">✅ {{ importResult.imported }} 条</template>
              <template v-if="importResult.errors.length"> ⚠️ {{ importResult.errors.length }} 失败</template>
            </span>
          </div>
        </div>

        <div v-if="activeEntries.length === 0" class="empty">📭 暂无条目</div>
        <div class="list">
          <div v-for="e in filteredEntries" :key="e.id" :class="['card glass-panel corner-deco', { off: !e.enabled }]">
            <div class="r1">
              <button class="tg" @click="toggle(e.id)">{{ e.enabled ? '✅' : '⛔' }}</button>
              <div class="i">
                <span class="nm">{{ e.comment || '（未命名条目）' }}</span>
                <div class="ks">
                  <span v-for="k in e.keys.slice(0,5)" :key="k" class="kt">{{ k }}</span>
                  <span v-if="e.keys.length > 5" class="kt">+{{ e.keys.length - 5 }}</span>
                </div>
              </div>
              <span class="pri">{{ e.position === 'at_constant' ? '📌' : '#' + e.priority }}</span>
              <button class="del" @click="remove(e.id)">🗑️</button>
            </div>
            <p class="pre">{{ e.content.slice(0, 100) }}{{ e.content.length > 100 ? '...' : '' }}</p>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.wb { height: 100%; }

/* ===== 书列表 ===== */
.book-list { display: flex; flex-direction: column; gap: 0.5rem; }
.book-card {
  display: flex; align-items: center; gap: 0.6rem;
  padding: 0.8rem 1rem; border-radius: 12px; cursor: pointer; transition: all 0.25s;
  width: 100%; font-family: inherit; text-align: left;
}
.book-card:hover { border-color: var(--accent-cyan); transform: translateY(-2px); box-shadow: 0 0 15px var(--accent-cyan-glow); }
.bk-icon { font-size: 1.3rem; }
.bk-info { flex: 1; display: flex; flex-direction: column; gap: 0.1rem; }
.bk-name { font-size: 0.88rem; font-weight: 600; color: var(--text-primary); }
.bk-meta { font-size: 0.6rem; color: var(--text-muted); }
.bk-arrow { font-size: 1rem; color: var(--text-muted); }
.book-card:hover .bk-arrow { color: var(--accent-cyan); transform: translateX(4px); }
.empty { text-align: center; padding: 2rem 1rem; font-size: 0.75rem; color: var(--text-muted); }

/* ===== 条目视图 ===== */
.entry-view { display: flex; flex-direction: column; gap: 0.5rem; height: 100%; }
.ev-header { display: flex; align-items: center; gap: 0.5rem; }
.ev-header h3 { font-size: 1rem; color: var(--text-primary); margin: 0; flex: 1; }
.cnt { font-size: 0.7rem; color: var(--text-muted); }

.btn-back { padding: 0.3rem 0.6rem; border-radius: 6px; border: 1px solid var(--glass-border); color: var(--text-secondary); font-size: 0.72rem; cursor: pointer; font-family: inherit; }
.btn-back:hover { border-color: var(--accent); color: var(--text-primary); }

.bar { display: flex; gap: 0.3rem; }
.search-fi { flex: 1; padding: 0.25rem 0.4rem; border: 1px solid var(--border); border-radius: 4px; background: rgba(8,16,28,0.6); color: var(--text-primary); font-size: 0.65rem; font-family: inherit; }
.search-fi:focus { outline: none; border-color: var(--accent-cyan); }
.act { padding: 0.25rem 0.55rem; border-radius: 5px; border: 1px solid var(--glass-border); background: var(--glass-bg); color: var(--text-secondary); font-size: 0.65rem; cursor: pointer; font-family: inherit; }
.act:hover { border-color: var(--accent); color: var(--text-primary); }
.go { background: rgba(0,229,255,0.08); border-color: rgba(0,229,255,0.25); color: var(--accent-cyan); }
.go:disabled { opacity: 0.3; }

.imp { padding: 0.4rem; border-radius: 8px; display: flex; flex-direction: column; gap: 0.3rem; }
.ta { width: 100%; padding: 0.35rem; border: 1px solid var(--border); border-radius: 4px; background: rgba(8,16,28,0.8); color: var(--text-primary); font-size: 0.65rem; font-family: monospace; resize: vertical; box-sizing: border-box; }
.ta:focus { outline: none; border-color: var(--accent-cyan); }
.ir { display: flex; align-items: center; gap: 0.4rem; }
.fb { font-size: 0.6rem; color: var(--success); }
.fb.w { color: var(--warning); }

.list { display: flex; flex-direction: column; gap: 0.3rem; flex: 1; overflow-y: auto; }
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
