<!-- wandou · 世界书管理 + 正则替换 — 点条目弹出详情编辑 -->
<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
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

// ---- 条目详情编辑弹窗 ----
type EditTarget = { type: 'wb'; entry: WorldBookEntry; view: string } | { type: 'regex'; entry: RegexEntry } | null
const editTarget = ref<EditTarget>(null)
// 用独立 ref，避免 reactive 跨类型复用导致的响应式问题
const efComment = ref('')
const efKeysStr = ref('')
const efContent = ref('')
const efPriority = ref(50)
const efPosition = ref<WorldBookEntry['position']>('before')
const efEnabled = ref(true)
// regex fields
const efScriptName = ref('')
const efFindRegex = ref('')
const efReplaceString = ref('')
const efDisabled = ref(false)
const efP1 = ref(true)
const efP2 = ref(true)
const editSaved = ref(false)

function openEditWb(e: WorldBookEntry) {
  efComment.value = e.comment || ''
  efKeysStr.value = (e.keys || []).join(', ')
  efContent.value = e.content || ''
  efPriority.value = e.priority
  efPosition.value = e.position
  efEnabled.value = e.enabled
  editTarget.value = { type: 'wb', entry: e, view: view.value }
  editSaved.value = false
}

function openEditRegex(e: RegexEntry) {
  efScriptName.value = e.scriptName || ''
  efFindRegex.value = e.findRegex || ''
  efReplaceString.value = e.replaceString || ''
  efDisabled.value = e.disabled
  efP1.value = !!(e.placement && e.placement.includes(1))
  efP2.value = !!(e.placement && e.placement.includes(2))
  editTarget.value = { type: 'regex', entry: e }
  editSaved.value = false
}

function saveEdit() {
  if (!editTarget.value) return
  if (editTarget.value.type === 'wb') {
    const t = editTarget.value
    t.entry.comment = efComment.value
    t.entry.keys = efKeysStr.value.split(',').map(s => s.trim()).filter(Boolean)
    t.entry.content = efContent.value
    t.entry.priority = efPriority.value
    t.entry.position = efPosition.value
    t.entry.enabled = efEnabled.value
    if (t.view === 'global') wbs.saveGlobalBook()
    else wbs.saveBrowsingBook()
  } else {
    const t = editTarget.value
    t.entry.scriptName = efScriptName.value
    t.entry.findRegex = efFindRegex.value
    t.entry.replaceString = efReplaceString.value
    t.entry.disabled = efDisabled.value
    const pl: number[] = []
    if (efP1.value) pl.push(1)
    if (efP2.value) pl.push(2)
    t.entry.placement = pl.length === 2 ? undefined : (pl.length === 0 ? [1] : pl as any)
    regex.save()
  }
  editSaved.value = true
  setTimeout(() => { editSaved.value = false }, 2000)
}

// ---- 正则/世界书匹配 ----
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

// 确保全局世界书已初始化（仅首次挂载时补一次）
onMounted(() => {
  if (wbs.globalWorldBook.length === 0) wbs.initGlobalBook()
})

function backToList() { view.value = 'list' }

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

const POS_LABELS: Record<string, string> = {
  before: '⬆ 角色定义前', after: '⬇ 角色定义后', at_constant: '📌 始终注入',
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
            <div
              v-for="e in filteredRegexEntries"
              :key="e.id"
              :class="['card', { off: e.disabled }]"
              @click="openEditRegex(e)"
            >
              <div class="r1">
                <ToggleSwitch :modelValue="!e.disabled" @update:modelValue="toggle(e.id)" @click.stop />
                <div class="i">
                  <span class="nm">{{ e.scriptName || '（未命名规则）' }}</span>
                  <div class="ks">
                    <span class="kt regex-ptn">{{ e.findRegex?.slice(0, 60) }}{{ e.findRegex?.length > 60 ? '...' : '' }}</span>
                    <span v-if="e.placement?.includes(1)" class="kt dim">发送前</span>
                    <span v-if="e.placement?.includes(2)" class="kt dim">显示前</span>
                  </div>
                </div>
                <button class="del" @click.stop="remove(e.id)">🗑️</button>
              </div>
            </div>
          </template>
          <!-- 世界书条目 -->
          <template v-else>
            <div
              v-for="e in filteredWbEntries"
              :key="e.id"
              :class="['card', { off: !e.enabled }]"
              @click="openEditWb(e)"
            >
              <div class="r1">
                <ToggleSwitch :modelValue="e.enabled" @update:modelValue="toggle(e.id)" @click.stop />
                <div class="i">
                  <span class="nm">{{ e.comment || '（未命名条目）' }}</span>
                  <div class="ks">
                    <span v-for="k in e.keys?.slice(0, 5)" :key="k" class="kt">{{ k }}</span>
                    <span v-if="e.keys?.length > 5" class="kt">+{{ e.keys.length - 5 }}</span>
                  </div>
                </div>
                <span class="pri">{{ e.position === 'at_constant' ? '📌' : '#' + e.priority }}</span>
                <button class="del" @click.stop="remove(e.id)">🗑️</button>
              </div>
              <p class="pre">{{ e.content?.slice(0, 100) }}{{ e.content?.length > 100 ? '...' : '' }}</p>
            </div>
          </template>
        </div>
      </div>
    </template>

    <!-- ====== 详情编辑弹窗 ====== -->
    <Teleport to="body">
      <Transition name="modal">
        <div v-if="editTarget" class="modal-overlay" @click.self="editTarget = null">
          <div class="modal-card glass-panel">
            <div class="modal-top">
              <span class="modal-icon">{{ editTarget.type === 'regex' ? '📐' : '📖' }}</span>
              <span class="modal-title">{{ editTarget.type === 'regex' ? '编辑正则规则' : '编辑世界书条目' }}</span>
              <button class="modal-close" @click="editTarget = null">✕</button>
            </div>
            <div class="modal-body">

              <!-- 世界书字段 -->
              <template v-if="editTarget.type === 'wb'">
                <div class="fg">
                  <label>备注 / 标题</label>
                  <input v-model="efComment" class="fi" placeholder="条目名称..." />
                </div>
                <div class="fg">
                  <label>触发关键词 <span class="l-en">KEYS</span></label>
                  <input v-model="efKeysStr" class="fi" placeholder="逗号分隔，如: 精灵, 森林" />
                </div>
                <div class="fg">
                  <label>注入位置</label>
                  <div class="pos-row">
                    <button v-for="p in (['before','after','at_constant'] as const)" :key="p"
                      :class="['pos-btn', { on: efPosition === p }]"
                      @click="efPosition = p">{{ POS_LABELS[p] }}</button>
                  </div>
                </div>
                <div class="fg-row">
                  <div class="fg" style="flex:1">
                    <label>优先级 {{ efPriority }}</label>
                    <input v-model.number="efPriority" type="range" min="0" max="100" style="width:100%;accent-color:var(--theme-text-accent)" />
                  </div>
                  <div class="fg" style="flex:0 0 70px;display:flex;align-items:center;gap:6px;padding-top:18px">
                    <ToggleSwitch :modelValue="efEnabled" @update:modelValue="efEnabled = $event" />
                    <span style="font-size:11px;color:var(--theme-text-main)">启用</span>
                  </div>
                </div>
                <div class="fg">
                  <label>正文内容</label>
                  <textarea v-model="efContent" class="fi fi-ta" rows="10" placeholder="注入到 prompt 的背景文本..." style="font-family:monospace;font-size:12px"></textarea>
                </div>
              </template>

              <!-- 正则字段 -->
              <template v-if="editTarget.type === 'regex'">
                <div class="fg">
                  <label>规则名称</label>
                  <input v-model="efScriptName" class="fi" placeholder="例如：去除 [动作] 标记" />
                </div>
                <div class="fg">
                  <label>查找正则 <span class="l-en">FIND</span></label>
                  <textarea v-model="efFindRegex" class="fi fi-ta" rows="3" placeholder="/pattern/flags" style="font-family:monospace;font-size:12px"></textarea>
                </div>
                <div class="fg">
                  <label>替换为 <span class="l-en">REPLACE</span></label>
                  <textarea v-model="efReplaceString" class="fi fi-ta" rows="3" placeholder="替换内容，可用 $1 引用捕获组" style="font-family:monospace;font-size:12px"></textarea>
                </div>
                <div class="fg-row" style="align-items:center">
                  <label style="margin-bottom:0;white-space:nowrap">执行时机</label>
                  <label class="chk-lbl"><input type="checkbox" v-model="efP1" /> 发送前</label>
                  <label class="chk-lbl"><input type="checkbox" v-model="efP2" /> 显示前</label>
                  <ToggleSwitch style="margin-left:auto" :modelValue="!efDisabled" @update:modelValue="efDisabled = !$event" />
                  <span style="font-size:11px;color:var(--theme-text-main)">启用</span>
                </div>
              </template>

              <div style="display:flex;align-items:center;gap:10px;margin-top:8px">
                <button class="sub-save" @click="saveEdit">💾 保存修改</button>
                <span v-if="editSaved" style="font-size:12px;color:var(--success);white-space:nowrap">✅ 已保存</span>
              </div>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<style scoped>
.wb { flex: 1; min-height: 0; display: flex; flex-direction: column; color: var(--theme-text-main); }

/* ---- 书列表 ---- */
.book-list { display: flex; flex-direction: column; gap: 10px; overflow-y: auto; }
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
.entry-view { display: flex; flex-direction: column; gap: 10px; flex: 1; min-height: 0; }
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
.i { flex: 1; min-width: 0; cursor: pointer; border-radius: 6px; padding: 2px 4px; margin: -2px -4px; transition: background 0.15s; }
.i:hover { background: rgba(255,128,168,0.06); }
.nm { font-size: 13px; font-weight: 600; color: var(--theme-text-main); }
.ks { display: flex; flex-wrap: wrap; gap: 3px; margin-top: 2px; }
.kt { font-size: 10px; padding: 2px 6px; background: rgba(255,128,168,0.06); border: 1px solid rgba(255,128,168,0.18); border-radius: 10px; color: var(--theme-text-accent); }
.kt.regex-ptn { font-family: monospace; max-width: 280px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.kt.dim { opacity: 0.6; }
.pri { font-size: 11px; color: var(--theme-text-main); opacity: 0.4; }
.del { background: none; border: none; cursor: pointer; font-size: 12px; opacity: 0.3; }
.del:active { opacity: 1; }
.pre { font-size: 11px; color: var(--theme-text-main); opacity: 0.5; margin: 4px 0 0; padding-left: 22px; line-height: 1.4; cursor: pointer; border-radius: 4px; transition: background 0.15s; }
.pre:hover { background: rgba(255,128,168,0.04); }

/* ---- 编辑弹窗 ---- */
.modal-overlay {
  position: fixed; inset: 0; z-index: 300;
  background: rgba(0,0,0,0.4);
  backdrop-filter: blur(4px); -webkit-backdrop-filter: blur(4px);
  display: flex; align-items: center; justify-content: center; padding: 20px;
}
.modal-card {
  width: 100%; max-width: 420px; max-height: 90vh; overflow-y: auto;
  border-radius: 20px; padding: 20px;
  background: rgba(255,255,255,0.92);
  backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px);
  box-shadow: 0 8px 32px rgba(0,0,0,0.15);
}
.modal-top { display: flex; align-items: center; gap: 10px; margin-bottom: 18px; }
.modal-icon { font-size: 28px; }
.modal-title { flex: 1; font-size: 17px; font-weight: 700; color: var(--theme-text-main); }
.modal-close {
  width: 28px; height: 28px; border-radius: 50%;
  border: 1px solid var(--theme-border-light); background: none;
  color: var(--theme-text-main); cursor: pointer; font-size: 14px;
  display: flex; align-items: center; justify-content: center;
}
.modal-close:active { color: #e55; }
.modal-body { display: flex; flex-direction: column; gap: 12px; }

.fg { margin-bottom: 4px; }
.fg label { display: block; font-size: 12px; color: var(--theme-text-main); margin-bottom: 4px; font-weight: 500; }
.l-en { font-size: 8px; color: var(--theme-text-main); opacity: 0.35; letter-spacing: 0.1em; margin-left: 4px; }
.fi { width: 100%; padding: 9px 11px; border: 1px solid var(--theme-border-ice); border-radius: 10px; background: rgba(255,255,255,0.5); color: var(--theme-text-main); font-size: 14px; font-family: inherit; box-sizing: border-box; transition: border-color 0.2s; }
.fi:focus { outline: none; border-color: var(--theme-text-accent); box-shadow: 0 0 0 2px rgba(255,128,168,0.08); }
.fi-ta { resize: vertical; min-height: 60px; }
.fg-row { display: flex; gap: 12px; }
.chk-lbl { display: flex; align-items: center; gap: 3px; font-size: 12px; color: var(--theme-text-main); cursor: pointer; }

.pos-row { display: flex; gap: 6px; }
.pos-btn {
  flex: 1; padding: 6px 4px; font-size: 11px; text-align: center;
  border-radius: 10px; border: 1px solid var(--theme-border-ice);
  background: rgba(255,255,255,0.4); color: var(--theme-text-main);
  cursor: pointer; font-family: inherit; transition: all 0.15s;
}
.pos-btn.on { background: rgba(255,128,168,0.1); border-color: var(--theme-text-accent); color: var(--theme-text-accent); font-weight: 600; }
.pos-btn:active { background: var(--theme-border-ice); }

.sub-save { flex: 1; padding: 10px; border: none; border-radius: 20px; background: var(--theme-text-accent); color: #fff; font-size: 14px; font-weight: 600; cursor: pointer; font-family: inherit; transition: all 0.2s; }
.sub-save:active { transform: scale(0.97); opacity: 0.9; }

/* modal transition */
.modal-enter-active, .modal-leave-active { transition: opacity 0.2s ease-out; }
.modal-enter-from, .modal-leave-to { opacity: 0; }
</style>
