<!-- wandou · 世界书管理 + 正则替换 -->
<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useWorldStore } from '@/stores/worldStore'
import { useWorldBookStore } from '@/stores/worldBookStore'
import { useRegexStore } from '@/stores/regexStore'
import { useExtensionStore } from '@/stores/extensionStore'
import type { RegexEntry } from '@/types/regex'
import type { WorldBookEntry } from '@/types/worldBook'
import { importWorldBook } from '@/utils/worldBookEngine'
import { importRegexJson } from '@/utils/regexEngine'
import ToggleSwitch from '@/components/ToggleSwitch.vue'

const world = useWorldStore()
const wbs = useWorldBookStore()
const regex = useRegexStore()
const extStore = useExtensionStore()

const view = ref('list')
const loadingBook = ref(false)
const searchText = ref('')

function matchRegexEntry(e: RegexEntry, q: string): boolean {
  return (e.scriptName || '').toLowerCase().includes(q)
    || e.findRegex.toLowerCase().includes(q)
    || (e.replaceString || '').toLowerCase().includes(q)
}

function matchWbEntry(e: WorldBookEntry, q: string): boolean {
  return (e.comment || '').toLowerCase().includes(q)
    || e.keys.some(k => k.toLowerCase().includes(q))
    || e.content.toLowerCase().includes(q)
}

const filteredRegexEntries = computed(() => {
  const q = searchText.value.toLowerCase().trim()
  if (!q) return regex.entries
  return regex.entries.filter(e => matchRegexEntry(e, q))
})

const currentWbEntries = computed(() =>
  view.value === 'global' ? wbs.globalWorldBook : wbs.browsingBook
)

const filteredWbEntries = computed(() => {
  const q = searchText.value.toLowerCase().trim()
  const entries = currentWbEntries.value
  if (!q) return entries
  return entries.filter(e => matchWbEntry(e, q))
})

function openBook(target: string) {
  if (target === 'regex') {
    if (!extStore.isEnabled('regex')) return
    view.value = 'regex'
    return
  }
  if (target !== 'global') {
    loadingBook.value = true
    wbs.loadForBrowse(target)
    loadingBook.value = false
  }
  view.value = target
}

function backToList() { view.value = 'list' }

// 扩展被禁用时自动回到列表
watch(() => extStore.isEnabled('regex'), (enabled) => {
  if (!enabled && view.value === 'regex') view.value = 'list'
})

const importText = ref('')
const showImport = ref(false)
const importResult = ref<{ imported: number; errors: string[] } | null>(null)
const fileInput = ref<HTMLInputElement | null>(null)

function handleImport() {
  importResult.value = null
  if (!importText.value.trim()) return
  if (view.value === 'regex') {
    const result = importRegexJson(importText.value)
    if (result.success && result.entries.length > 0) regex.add(result.entries)
    importResult.value = { imported: result.imported, errors: result.errors }
  } else {
    const result = importWorldBook(importText.value)
    if (result.success && result.entries.length > 0) {
      if (view.value === 'global') wbs.addGlobalEntries(result.entries)
      else wbs.addBrowsingEntries(result.entries)
    }
    importResult.value = { imported: result.imported, errors: result.errors }
  }
  if ((importResult.value?.imported || 0) > 0) importText.value = ''
}

function onFile(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  const reader = new FileReader()
  reader.onload = () => { importText.value = reader.result as string; showImport.value = true; handleImport() }
  reader.readAsText(file)
  input.value = ''
}

const activeTitle = computed(() => {
  if (view.value === 'global') return '🌐 全局世界书'
  if (view.value === 'regex') return '📐 正则替换'
  return wbs.browsingWorldName ? `📖 ${wbs.browsingWorldName}` : '世界书'
})

const activeEnabledCount = computed(() => {
  if (view.value === 'regex') return regex.entries.filter(e => !e.disabled).length
  return currentWbEntries.value.filter(e => e.enabled).length
})

const activeEntriesCount = computed(() => {
  if (view.value === 'regex') return regex.entries.length
  return currentWbEntries.value.length
})

function toggle(id: string) {
  if (view.value === 'regex') regex.toggle(id)
  else view.value === 'global' ? wbs.toggleGlobalEntry(id) : wbs.toggleBrowsingEntry(id)
}

function remove(id: string) {
  if (view.value === 'regex') regex.remove(id)
  else view.value === 'global' ? wbs.removeGlobalEntry(id) : wbs.removeBrowsingEntry(id)
}

function reset() {
  if (view.value === 'regex') regex.reset()
  else view.value === 'global' ? wbs.resetGlobalBook() : wbs.resetBrowsingBook()
}
</script>

<template>
  <div class="wb">
    <!-- 书列表 -->
    <template v-if="view === 'list'">
      <div class="book-list">
        <button class="book-card" @click="openBook('global')">
          <span class="bk-icon">🌐</span>
          <div class="bk-info">
            <span class="bk-name">全局世界书</span>
            <span class="bk-meta">{{ wbs.globalWorldBook.filter(e => e.enabled).length }}/{{ wbs.globalWorldBook.length }} 条 · 所有世界生效</span>
          </div>
          <span class="bk-arrow">→</span>
        </button>
        <button v-if="extStore.isEnabled('regex')" class="book-card" @click="openBook('regex')">
          <span class="bk-icon">📐</span>
          <div class="bk-info">
            <span class="bk-name">正则替换</span>
            <span class="bk-meta">{{ regex.enabledCount }}/{{ regex.totalCount }} 条 · AI 输出后处理</span>
          </div>
          <span class="bk-arrow">→</span>
        </button>
        <button v-for="w in world.worldList" :key="w.id" class="book-card" @click="openBook(w.id)">
          <span class="bk-icon">📖</span>
          <div class="bk-info"><span class="bk-name">{{ w.name }}</span><span class="bk-meta">世界书（点击查看条目）</span></div>
          <span class="bk-arrow">→</span>
        </button>
        <div v-if="world.worldList.length === 0" class="empty">暂无世界，创建世界后这里会出现对应的世界书</div>
      </div>
    </template>

    <!-- 条目列表 / 正则列表 -->
    <template v-else>
      <div class="entry-view">
        <div class="ev-header">
          <button class="btn-back" @click="backToList">← 返回书列表</button>
          <h3>{{ activeTitle }}</h3>
          <span class="cnt">{{ activeEnabledCount }}/{{ activeEntriesCount }}</span>
        </div>
        <div class="bar">
          <input v-model="searchText" class="search-fi" placeholder="搜索关键词..." />
        </div>
        <div class="bar">
          <button class="act" @click="showImport = !showImport">📥 导入</button>
          <button class="act" @click="fileInput?.click()">📁 文件</button>
          <input ref="fileInput" type="file" accept=".json" style="display:none" @change="onFile" />
          <button class="act" @click="reset">🔄 重置</button>
          <ToggleSwitch v-if="view === 'regex'" style="margin-left:auto" :modelValue="regex.enabled" @update:modelValue="regex.enabled = $event" />
        </div>
        <div v-if="showImport" class="imp">
          <textarea v-model="importText" class="ta" placeholder="粘贴 JSON 数组..." rows="3"></textarea>
          <div class="ir">
            <button class="act go" @click="handleImport" :disabled="!importText.trim()">导入</button>
            <span v-if="importResult" class="fb" :class="{ w: importResult.errors.length }">
              <template v-if="importResult.imported">✅ {{ importResult.imported }} 条</template>
              <template v-if="importResult.errors.length"> ⚠️ {{ importResult.errors.length }} 失败</template>
            </span>
          </div>
        </div>
        <div v-if="(view === 'regex' && filteredRegexEntries.length === 0) || (view !== 'regex' && filteredWbEntries.length === 0)" class="empty">📭 暂无条目</div>
        <div class="list">
          <!-- 正则条目 -->
          <template v-if="view === 'regex'">
            <div v-for="e in filteredRegexEntries" :key="e.id" :class="['card', { off: e.disabled }]">
              <div class="r1">
                <ToggleSwitch :modelValue="!e.disabled" @update:modelValue="toggle(e.id)" />
                <div class="i">
                  <span class="nm">{{ e.scriptName || '（未命名规则）' }}</span>
                  <div class="ks">
                    <span class="kt regex-ptn">{{ e.findRegex?.slice(0, 60) }}{{ e.findRegex?.length > 60 ? '...' : '' }}</span>
                    <span v-if="e.placement?.includes(1)" class="kt dim">发送前</span>
                    <span v-if="e.placement?.includes(2)" class="kt dim">显示前</span>
                  </div>
                </div>
                <button class="del" @click="remove(e.id)">🗑️</button>
              </div>
            </div>
          </template>
          <!-- 世界书条目 -->
          <template v-else>
            <div v-for="e in filteredWbEntries" :key="e.id" :class="['card', { off: !e.enabled }]">
              <div class="r1">
                <ToggleSwitch :modelValue="e.enabled" @update:modelValue="toggle(e.id)" />
                <div class="i">
                  <span class="nm">{{ e.comment || '（未命名条目）' }}</span>
                  <div class="ks">
                    <span v-for="k in e.keys?.slice(0, 5)" :key="k" class="kt">{{ k }}</span>
                    <span v-if="e.keys?.length > 5" class="kt">+{{ e.keys.length - 5 }}</span>
                  </div>
                </div>
                <span class="pri">{{ e.position === 'at_constant' ? '📌' : '#' + e.priority }}</span>
                <button class="del" @click="remove(e.id)">🗑️</button>
              </div>
              <p class="pre">{{ e.content?.slice(0, 100) }}{{ e.content?.length > 100 ? '...' : '' }}</p>
            </div>
          </template>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.wb { height: 100%; color: var(--theme-text-main); }

/* ---- 书列表 ---- */
.book-list { display: flex; flex-direction: column; gap: 10px; }
.book-card {
  display: flex; align-items: center; gap: 12px;
  padding: 14px 18px; border-radius: 16px; cursor: pointer; transition: all 0.25s;
  width: 100%; font-family: inherit; text-align: left;
  background: rgba(255,255,255,0.55); border: 1px solid var(--theme-border-ice);
}
.book-card:active { border-color: var(--theme-text-accent); background: rgba(255,255,255,0.75); }
.bk-icon { font-size: 22px; }
.bk-info { flex: 1; display: flex; flex-direction: column; gap: 2px; }
.bk-name { font-size: 15px; font-weight: 600; color: var(--theme-text-main); }
.bk-meta { font-size: 11px; color: var(--theme-text-main); opacity: 0.5; }
.bk-arrow { font-size: 14px; color: var(--theme-text-main); opacity: 0.35; transition: all 0.3s; }
.book-card:active .bk-arrow { opacity: 0.8; transform: translateX(4px); }

/* ---- 条目视图 ---- */
.entry-view { display: flex; flex-direction: column; gap: 10px; height: 100%; }
.ev-header { display: flex; align-items: center; gap: 10px; }
.ev-header h3 { font-size: 16px; color: var(--theme-text-main); margin: 0; flex: 1; }
.cnt { font-size: 12px; color: var(--theme-text-main); opacity: 0.45; }
.btn-back { padding: 5px 12px; border-radius: 20px; border: 1px solid var(--theme-border-ice); background: rgba(255,255,255,0.5); color: var(--theme-text-main); font-size: 12px; cursor: pointer; font-family: inherit; }
.btn-back:active { background: var(--theme-border-ice); }

.bar { display: flex; gap: 6px; }
.search-fi { flex: 1; padding: 6px 10px; border: 1px solid var(--theme-border-ice); border-radius: 20px; background: rgba(255,255,255,0.5); color: var(--theme-text-main); font-size: 12px; font-family: inherit; }
.search-fi:focus { outline: none; border-color: var(--theme-text-accent); }
.search-fi::placeholder { color: var(--theme-text-main); opacity: 0.3; }
.act { padding: 5px 12px; border-radius: 20px; border: 1px solid var(--theme-border-ice); background: rgba(255,255,255,0.5); color: var(--theme-text-main); font-size: 12px; cursor: pointer; font-family: inherit; }
.act:active { background: var(--theme-border-ice); }
.go { background: rgba(255,128,168,0.08); border-color: rgba(255,128,168,0.25); color: var(--theme-text-accent); }
.go:disabled { opacity: 0.3; }

.imp { padding: 8px; border-radius: 12px; display: flex; flex-direction: column; gap: 6px; background: rgba(255,255,255,0.4); }
.ta { width: 100%; padding: 6px 8px; border: 1px solid var(--theme-border-ice); border-radius: 8px; background: rgba(255,255,255,0.5); color: var(--theme-text-main); font-size: 12px; font-family: monospace; resize: vertical; box-sizing: border-box; }
.ta:focus { outline: none; border-color: var(--theme-text-accent); }
.ir { display: flex; align-items: center; gap: 8px; }
.fb { font-size: 11px; color: var(--success); }
.fb.w { color: var(--warning); }

.empty { text-align: center; padding: 32px 16px; font-size: 13px; opacity: 0.5; }
.list { display: flex; flex-direction: column; gap: 5px; flex: 1; overflow-y: auto; }
.card { padding: 8px 10px; border-radius: 12px; background: rgba(255,255,255,0.4); border: 1px solid var(--theme-border-ice); transition: all 0.15s; }
.card.off { opacity: 0.4; }
.card:active:not(.off) { background: rgba(255,255,255,0.6); }
.r1 { display: flex; align-items: flex-start; gap: 8px; }
.i { flex: 1; min-width: 0; }
.nm { font-size: 13px; font-weight: 600; color: var(--theme-text-main); }
.ks { display: flex; flex-wrap: wrap; gap: 3px; margin-top: 2px; }
.kt { font-size: 10px; padding: 2px 6px; background: rgba(255,128,168,0.06); border: 1px solid rgba(255,128,168,0.18); border-radius: 10px; color: var(--theme-text-accent); }
.kt.regex-ptn { font-family: monospace; max-width: 280px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.kt.dim { opacity: 0.6; }
.pri { font-size: 11px; color: var(--theme-text-main); opacity: 0.4; }
.del { background: none; border: none; cursor: pointer; font-size: 12px; opacity: 0.3; }
.del:active { opacity: 1; }
.pre { font-size: 11px; color: var(--theme-text-main); opacity: 0.5; margin: 4px 0 0; padding-left: 22px; line-height: 1.4; }
</style>
