<!-- ============================================================
 wandou v0.7.7 — 世界详情页
 世界信息 + NPC列表 + 世界书列表 + 进入冒险
============================================================ -->
<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useGameStore } from '../stores/gameStore'
import { importWorldBook } from '../utils/worldBookEngine'
import { importNpcJson } from '../utils/npcEngine'

const store = useGameStore()
const saving = ref(false)
const loading = ref(!store.currentWorldId)  // 无 worldId = 还没加载

// 等加载完
onMounted(() => { loading.value = false })

// ---- 编辑世界信息 ----
const editName = ref(store.worldName)
const editDesc = ref(store.worldDescription)
const saved = ref(false)

async function saveWorldInfo() {
  saving.value = true
  store.updateWorldInfo(editName.value.trim() || store.worldName, editDesc.value.trim())
  await store.autoSave()
  saving.value = false
  saved.value = true; setTimeout(() => saved.value = false, 2000)
}

// ---- NPC ----
const npcImportText = ref('')
const showNpcImport = ref(false)
const npcFileInput = ref<HTMLInputElement | null>(null)

function importNpcs() {
  if (!npcImportText.value.trim()) return
  const result = importNpcJson(npcImportText.value)
  if (result.success && result.entries.length > 0) store.addNpcEntries(result.entries)
  if (result.imported > 0) npcImportText.value = ''
}
function onNpcFile(e: Event) {
  const input = e.target as HTMLInputElement; const file = input.files?.[0]; if (!file) return
  const reader = new FileReader()
  reader.onload = () => { npcImportText.value = reader.result as string; showNpcImport.value = true; importNpcs() }
  reader.readAsText(file); input.value = ''
}

// ---- 世界书 ----
const wbImportText = ref('')
const showWbImport = ref(false)
const wbFileInput = ref<HTMLInputElement | null>(null)

function importWb() {
  if (!wbImportText.value.trim()) return
  const result = importWorldBook(wbImportText.value)
  if (result.success && result.entries.length > 0) store.addWorldBookEntries(result.entries)
  if (result.imported > 0) wbImportText.value = ''
}
function onWbFile(e: Event) {
  const input = e.target as HTMLInputElement; const file = input.files?.[0]; if (!file) return
  const reader = new FileReader()
  reader.onload = () => { wbImportText.value = reader.result as string; showWbImport.value = true; importWb() }
  reader.readAsText(file); input.value = ''
}

// ---- 进入游戏 ----
async function handleEnterGame() {
  saving.value = true
  store.updateWorldInfo(editName.value.trim() || store.worldName, editDesc.value.trim())
  await store.autoSave()   // ✅ 等保存完再切
  saving.value = false
  store.character.name ? store.phase = 'playing' : store.phase = 'setup'
}

async function handleDeleteWorld() {
  if (!confirm(`确定删除世界「${store.worldName}」？此操作不可撤销。`)) return
  await store.deleteWorld(store.currentWorldId!)
  store.phase = 'worldList'
}

async function goBack() {
  saving.value = true
  store.updateWorldInfo(editName.value.trim() || store.worldName, editDesc.value.trim())
  await store.autoSave()
  saving.value = false
  store.previousPhase === 'playing' ? store.phase = 'playing' : store.phase = 'worldList'
}
</script>

<template>
  <div class="screen">
    <div class="bg-base"></div>

    <div v-if="loading" class="load-state">⏳ 加载中...</div>

    <div v-else class="container">
      <!-- 顶部 -->
      <header class="top">
        <button class="btn-back glass-panel" @click="goBack" :disabled="saving">← 返回</button>
        <h1>🪐 {{ store.worldName || '新世界' }}</h1>
        <button class="btn-save glass-panel" @click="saveWorldInfo" :disabled="saving">
          {{ saving ? '⏳' : '💾' }} {{ saved ? '已保存' : '保存' }}
        </button>
      </header>

      <!-- 世界信息 -->
      <div class="sec glass-panel corner-deco">
        <div class="sec-title"><span class="cn">📝 世界信息</span><span class="en">INFO</span></div>
        <input v-model="editName" class="fi" placeholder="世界名称" />
        <textarea v-model="editDesc" class="fi ta" rows="2" placeholder="世界描述..."></textarea>
      </div>

      <!-- NPC -->
      <div class="sec glass-panel corner-deco">
        <div class="sec-title">
          <span class="cn">👥 NPC 角色书</span><span class="en">CHARACTERS</span>
          <span class="badge">{{ store.npcs.filter(n=>n.enabled).length }}/{{ store.npcs.length }}</span>
        </div>
        <div class="sec-acts">
          <button class="act" @click="showNpcImport = !showNpcImport">📥 导入</button>
          <button class="act" @click="npcFileInput?.click()">📁 文件</button>
          <input ref="npcFileInput" type="file" accept=".json" style="display:none" @change="onNpcFile" />
        </div>
        <div v-if="showNpcImport" class="imp-area">
          <textarea v-model="npcImportText" class="ta" placeholder="粘贴 NPC JSON..." rows="3"></textarea>
          <button class="act go" @click="importNpcs" :disabled="!npcImportText.trim()">导入</button>
        </div>
        <div v-if="store.npcs.length === 0" class="empty">暂无 NPC · 粘贴 JSON 或点「文件」导入</div>
        <div v-for="n in store.npcs" :key="n.id" :class="['entry', { off: !n.enabled }]">
          <div class="er">
            <button class="tg" @click="store.toggleNpc(n.id)">{{ n.enabled ? '✅' : '⛔' }}</button>
            <div class="ei">
              <span class="enm">{{ n.name }}</span>
              <span v-if="n.role" class="erl">{{ n.role }}</span>
            </div>
            <button class="edel" @click="store.removeNpc(n.id)">🗑️</button>
          </div>
          <div class="eks"><span v-for="k in n.keys.slice(0,4)" :key="k" class="kt">{{ k }}</span></div>
          <p v-if="n.personality" class="ep">{{ n.personality.slice(0, 80) }}{{ n.personality.length > 80 ? '...' : '' }}</p>
        </div>
      </div>

      <!-- 世界书 -->
      <div class="sec glass-panel corner-deco">
        <div class="sec-title">
          <span class="cn">📖 世界书</span><span class="en">WORLD BOOK</span>
          <span class="badge">{{ store.worldBook.filter(e=>e.enabled).length }}/{{ store.worldBook.length }}</span>
        </div>
        <div class="sec-acts">
          <button class="act" @click="showWbImport = !showWbImport">📥 导入</button>
          <button class="act" @click="wbFileInput?.click()">📁 文件</button>
          <input ref="wbFileInput" type="file" accept=".json" style="display:none" @change="onWbFile" />
        </div>
        <div v-if="showWbImport" class="imp-area">
          <textarea v-model="wbImportText" class="ta" placeholder="粘贴世界书 JSON..." rows="3"></textarea>
          <button class="act go" @click="importWb" :disabled="!wbImportText.trim()">导入</button>
        </div>
        <div v-if="store.worldBook.length === 0" class="empty">暂无世界书 · 粘贴 JSON 或点「文件」导入</div>
        <div v-for="e in store.worldBook" :key="e.id" :class="['entry', { off: !e.enabled }]">
          <div class="er">
            <button class="tg" @click="store.toggleWorldBookEntry(e.id)">{{ e.enabled ? '✅' : '⛔' }}</button>
            <div class="ei"><span class="enm">{{ e.comment || '（未命名）' }}</span></div>
            <span class="pri">{{ e.position === 'at_constant' ? '📌' : '#'+e.priority }}</span>
            <button class="edel" @click="store.removeWorldBookEntry(e.id)">🗑️</button>
          </div>
          <div class="eks"><span v-for="k in e.keys.slice(0,4)" :key="k" class="kt">{{ k }}</span></div>
          <p class="ep">{{ e.content.slice(0, 80) }}{{ e.content.length > 80 ? '...' : '' }}</p>
        </div>
      </div>

      <!-- 底部 -->
      <div class="bottom">
        <button class="btn-enter corner-deco" @click="handleEnterGame" :disabled="saving">
          <span class="cn">{{ saving ? '⏳ 保存中...' : '🚀 进入冒险' }}</span>
          <span class="en">{{ store.character.name ? 'ENTER WORLD' : 'CREATE CHARACTER' }}</span>
        </button>
        <button class="btn-del" @click="handleDeleteWorld">🗑️ 删除世界</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.screen { height: 100vh; position: relative; overflow-y: auto; overflow-x: hidden; }
.bg-base { position: fixed; inset: 0; z-index: -4;
  background: radial-gradient(ellipse at 30% 20%, rgba(10,40,80,0.3) 0%, transparent 60%),
              linear-gradient(180deg, #0a0a1a 0%, #0d1b2a 40%, #111d2d 100%); }
.load-state { position: fixed; inset: 0; display: flex; align-items: center; justify-content: center; font-size: 1.2rem; color: var(--text-muted); }
.container { position: relative; z-index: 1; max-width: 640px; width: 100%; margin: 0 auto; padding: 1.2rem 1.5rem 2rem; display: flex; flex-direction: column; gap: 0.75rem; }

.top { display: flex; align-items: center; justify-content: space-between; }
.top h1 { font-size: 1.3rem; color: var(--text-primary); margin: 0; }
.btn-back { padding: 0.35rem 0.7rem; border-radius: 6px; border: 1px solid var(--glass-border); color: var(--text-secondary); font-size: 0.78rem; cursor: pointer; font-family: inherit; }
.btn-back:disabled { opacity: 0.4; cursor: not-allowed; }
.btn-save { padding: 0.35rem 0.7rem; border-radius: 6px; border: 1px solid var(--accent-cyan); color: var(--accent-cyan); font-size: 0.78rem; cursor: pointer; font-family: inherit; background: rgba(0,229,255,0.06); }
.btn-save:disabled { opacity: 0.5; }

.sec { padding: 0.75rem; border-radius: 12px; }
.sec-title { display: flex; align-items: baseline; gap: 0.35rem; margin-bottom: 0.5rem; }
.cn { font-size: 0.82rem; font-weight: 600; color: var(--text-primary); }
.en { font-size: 0.5rem; color: var(--text-muted); letter-spacing: 0.1em; }
.badge { font-size: 0.6rem; color: var(--text-muted); margin-left: auto; }

.fi { width: 100%; padding: 0.45rem 0.6rem; border: 1px solid var(--border); border-radius: 6px; background: rgba(8,16,28,0.8); color: var(--text-primary); font-size: 0.85rem; font-family: inherit; box-sizing: border-box; margin-bottom: 0.4rem; }
.fi:focus { outline: none; border-color: var(--accent-cyan); }
.ta { resize: vertical; min-height: 40px; }

.sec-acts { display: flex; gap: 0.3rem; margin-bottom: 0.4rem; }
.act { padding: 0.2rem 0.5rem; border-radius: 5px; border: 1px solid var(--glass-border); background: var(--glass-bg); color: var(--text-secondary); font-size: 0.65rem; cursor: pointer; font-family: inherit; }
.act:hover { border-color: var(--accent); color: var(--text-primary); }
.go { background: rgba(0,229,255,0.08); border-color: rgba(0,229,255,0.25); color: var(--accent-cyan); }

.imp-area { display: flex; flex-direction: column; gap: 0.3rem; margin-bottom: 0.4rem; padding: 0.4rem; background: rgba(8,16,28,0.4); border-radius: 6px; }
.ta { width: 100%; padding: 0.35rem; border: 1px solid var(--border); border-radius: 4px; background: rgba(8,16,28,0.8); color: var(--text-primary); font-size: 0.65rem; font-family: monospace; resize: vertical; box-sizing: border-box; }
.ta:focus { outline: none; border-color: var(--accent-cyan); }

.empty { text-align: center; padding: 0.8rem; font-size: 0.7rem; color: var(--text-muted); }
.entry { padding: 0.4rem 0.5rem; border-radius: 6px; background: rgba(8,16,28,0.25); margin-bottom: 0.3rem; }
.entry.off { opacity: 0.4; }
.er { display: flex; align-items: center; gap: 0.3rem; }
.tg { background: none; border: none; font-size: 0.8rem; cursor: pointer; padding: 0; }
.ei { flex: 1; display: flex; flex-direction: column; gap: 0.05rem; }
.enm { font-size: 0.75rem; font-weight: 600; color: var(--text-primary); }
.erl { font-size: 0.58rem; color: var(--accent-cyan); }
.pri { font-size: 0.55rem; color: var(--text-muted); }
.edel { background: none; border: none; cursor: pointer; font-size: 0.65rem; opacity: 0.3; }
.edel:hover { opacity: 1; }
.eks { display: flex; flex-wrap: wrap; gap: 0.12rem; margin-top: 0.15rem; padding-left: 1.2rem; }
.kt { font-size: 0.5rem; padding: 0.05rem 0.2rem; background: rgba(0,229,255,0.06); border: 1px solid rgba(0,229,255,0.15); border-radius: 2px; color: var(--accent-cyan); }
.ep { font-size: 0.58rem; color: var(--text-muted); margin: 0.12rem 0 0; padding-left: 1.2rem; line-height: 1.3; }

.bottom { display: flex; flex-direction: column; gap: 0.4rem; align-items: center; padding-top: 0.5rem; }
.btn-enter { width: 100%; padding: 0.65rem; border: 1px solid var(--accent-cyan); border-radius: 10px; background: rgba(0,229,255,0.08); color: #e0f0ff; cursor: pointer; font-family: inherit; display: flex; flex-direction: column; align-items: center; gap: 0.05rem; transition: all 0.3s; }
.btn-enter:hover:not(:disabled) { background: rgba(0,229,255,0.18); box-shadow: 0 0 20px var(--accent-cyan-glow); transform: translateY(-2px); }
.btn-enter:disabled { opacity: 0.5; cursor: not-allowed; }
.btn-enter .cn { font-size: 1rem; font-weight: 600; }
.btn-enter .en { font-size: 0.55rem; letter-spacing: 0.15em; color: var(--accent-cyan); }
.btn-del { padding: 0.35rem 1rem; border: 1px solid #5f1e1e; border-radius: 6px; background: transparent; color: #8b4a4a; font-size: 0.75rem; cursor: pointer; font-family: inherit; }
.btn-del:hover { background: rgba(120,30,30,0.25); color: #e66; }
</style>
